import * as THREE from 'three'
import { PLAYER } from '../config.js'
import * as mats from '../world/materials.js'
import * as AP from './appearance.js'
import * as ROUPAS from './roupas.js'
import { soldarNormais } from './rosto/nucleo.js'

const { solid } = mats

// ---------------------------------------------------------------------------
// Boneco procedural estilo Schedule I: cabeca de ovo enorme, ombros estreitos,
// membros finos. Origem do root NOS PES, +Z = frente.
//
// Cadeia de juntas (cada Group fica NO PONTO DE ROTACAO, o mesh e filho
// deslocado) — o animator so precisa mexer nas rotacoes:
//   hips -> torso -> chest -> neck -> headPivot -> head -> face
//   chest -> arm?Upper -> arm?Lower -> hand?
//   hips  -> leg?Upper -> leg?Lower -> foot?
// Convencao: +X = lado DIREITO do personagem (ele olha pra +Z).
//
// O CORPO NASCE NU. Camiseta, calca e tenis nao sao mais parte do corpo: sao
// catalogos em roupas.js montados nos SLOTS, do mesmo jeito que cabelo e olhos.
// Assim "sem blusa" e "descalco" existem de verdade, e trocar de roupa nao
// reconstroi o boneco inteiro.
// ---------------------------------------------------------------------------

// --- ponte com appearance.js ------------------------------------------------
// appearance.js esta sendo reformado em paralelo (8 cabecas, 5 olhos, pupilas,
// narizes, barbas...). Lemos o modulo pelo namespace e aceitamos os dois jogos
// de nomes: assim o boneco continua de pe com o catalogo velho e passa a usar o
// novo no instante em que ele existir, sem um dia de jogo quebrado no meio.
const HEAD = AP.HEAD || { rx: 0.1795, ry: 0.246, rz: 0.1729 }
const HEAD_S = AP.HEAD_S || 1.33
const EYE_ANCHOR = AP.EYE_ANCHOR || { x: 0.082, y: 0.047 }
const surfaceZ = AP.surfaceZ || ((x, y, pad = 0) => HEAD.rz + pad)
const shadeColor = AP.shadeColor
  || ((hex, m) => new THREE.Color(hex).multiplyScalar(m).getHex())
const hairColorOf = AP.hairColorOf || (() => 0x4a2c19)

// Tons de pele: a rede manda INDICE (u8), nunca cor crua (REDE.md). A tabela e
// a do appearance.js quando ele a expoe; a copia local so evita que o boneco
// fique preto se este arquivo chegar antes daquele.
const TONS_PELE = (Array.isArray(AP.SKIN_TONES) && AP.SKIN_TONES.length)
  ? AP.SKIN_TONES
  : [AP.SKIN_DEFAULT || 0xf7c6a4, 0xf6d7c0, 0xe8b48c, 0xc98d5c, 0x9a6238, 0x6b421f]

function corPele(v) {
  const n = v | 0
  // acima de 255 nao cabe num byte: e uma cor ja resolvida (preview local,
  // NPCs da cidade). Aceitar os dois evita um ramo especial em cada chamador.
  if (n > 255) return n
  const t = TONS_PELE[((n % TONS_PELE.length) + TONS_PELE.length) % TONS_PELE.length]
  return (t && typeof t === 'object') ? (t.hex | 0) : (t | 0)
}

// Proporcoes calibradas pela referencia: pernas ~46% da altura (eram 52%),
// torso proporcionalmente mais longo e cabeca grande encostando nos ombros.
// Exportado porque os interiores precisam assentar NPCs em cadeiras sem
// hardcodar a altura do quadril (ja quebrou uma vez).
export const HIPS_Y = 0.84 // altura do quadril (46.2% de 1.82)
const CHEST_Y = 0.30       // chest relativo a hips
const NECK_Y = 0.165       // neck relativo a chest
const HEADPIVOT_Y = 0.0229 // base do craneo relativo ao neck
const HEAD_CENTER_Y = HIPS_Y + CHEST_Y + NECK_Y + HEADPIVOT_Y + HEAD.ry // 1.574
// topo do craneo = HEAD_CENTER_Y + HEAD.ry = 1.82 = PLAYER.HEIGHT

// Ombros estreitos: na referencia a largura do ombro mal passa do torso.
const SHOULDER_X = 0.124
const SHOULDER_Y = 0.120   // relativo ao chest
const UPPER_ARM = 0.28
const FORE_ARM = 0.26
const HIP_X = 0.070
// coxa + canela + 0.0905 (tornozelo->chao) = HIPS_Y
const THIGH = 0.384
const SHIN = 0.3655
const ANKLE_Y = HIPS_Y - THIGH - SHIN  // 0.0905: altura da junta do pe
const SOLA_Y = -ANKLE_Y + 0.003        // chao (com 3 mm de folga) no espaco do pe

// Quanto a cabeca pode girar SOZINHA em relacao ao tronco. 1.05 rad = 60 graus,
// que e o limite confortavel de um pescoco humano; passado ele, quem tem que
// virar e o corpo (ver o controller). O valor antigo era 0.6 (34 graus) e nao
// era um limite anatomico, era um paliativo pra esconder o salto de fase.
const LOOK_LIMIT = 1.05

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Junta: Group posicionado no ponto de rotacao. */
function joint(name, x, y, z, parent) {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, y, z)
  if (parent) parent.add(g)
  return g
}

/**
 * MEMBRO AFILADO.
 *
 * Era uma CapsuleGeometry — cilindro de raio CONSTANTE com duas meias esferas.
 * Foi ela que rendeu "bracos com listras" e "cotovelos e ombros quadrados":
 * raio constante nao tem musculo nenhum, entao a luz bate igual do ombro ao
 * pulso e o membro le como cano de PVC; e a capsula fecha a volta duplicando a
 * coluna de vertices, o que acendia uma listra ao longo do braco.
 *
 * Aqui o membro e um LOFT: uma pilha de aneis cujo raio sai de uma curva. Cada
 * membro traz a sua:
 *   braco      grosso no deltoide, fino no cotovelo
 *   antebraco  bojo do braquiorradial logo abaixo do cotovelo, fino no pulso
 *   coxa       grossa no quadril, fina no joelho
 *   canela     barriga da panturrilha ATRAS, tornozelo fino
 *
 * perfilR(t) recebe t = 0 no TOPO (na junta) e 1 embaixo, e devolve o raio.
 * atrasZ(t) empurra a secao pra tras (panturrilha) sem engordar a frente.
 * A volta e fechada por INDICE, entao nao ha costura pra acender.
 */
function membroGeo(len, perfilR, seg = 14, aneis = 12, atrasZ = null) {
  const pos = []
  const idx = []
  const linhas = []
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  // CUPULA DE CIMA — meia esfera de verdade, e nao um vertice unico no alto.
  //
  // A primeira versao punha um ponto so em y = rTopo * 0.55 e ligava ele
  // direto no primeiro anel. Isso nao e uma cupula, e um CONE MUITO RASO: com
  // 4.5 cm de raio e 2.5 cm de altura, o leque de triangulos le como uma ABA
  // CHAPADA saindo do ombro e do cotovelo. Foi fotografado — parecia uma
  // barbatana de plastico presa na junta.
  const rTopo = perfilR(0)
  const N_CUPULA = 3
  for (let k = 0; k < N_CUPULA; k++) {
    const phi = (k / N_CUPULA) * (Math.PI / 2)
    const r = rTopo * Math.sin(phi)
    const y = rTopo * 0.72 * Math.cos(phi)
    if (k === 0) { linhas.push([put(0, y, 0)]); continue }
    const linha = []
    for (let c = 0; c < seg; c++) {
      const ang = (c / seg) * Math.PI * 2
      linha.push(put(Math.sin(ang) * r, y, Math.cos(ang) * r * 0.93))
    }
    linhas.push(linha)
  }

  for (let a = 0; a <= aneis; a++) {
    const t = a / aneis
    const r = Math.max(0.0015, perfilR(t))
    const y = -t * len
    const dz = atrasZ ? atrasZ(t) : 0
    const linha = []
    for (let c = 0; c < seg; c++) {
      const ang = (c / seg) * Math.PI * 2
      // Secao levemente OVAL: membro humano e mais largo de lado do que de
      // frente pra tras. 0.93 e discreto o bastante pra nao ler como achatado e
      // o bastante pra a silhueta de perfil mudar.
      linha.push(put(Math.sin(ang) * r, y, Math.cos(ang) * r * 0.93 + dz))
    }
    linhas.push(linha)
  }

  // CUPULA DE BAIXO, pelo mesmo motivo. Ela quase sempre morre dentro da junta
  // seguinte, mas "quase sempre" nao e sempre: no cotovelo dobrado ela aparece.
  const rBase = Math.max(0.0015, perfilR(1))
  const dzBase = atrasZ ? atrasZ(1) : 0
  for (let k = N_CUPULA - 1; k >= 1; k--) {
    const phi = (k / N_CUPULA) * (Math.PI / 2)
    const r = rBase * Math.sin(phi)
    const y = -len - rBase * 0.72 * Math.cos(phi)
    const linha = []
    for (let c = 0; c < seg; c++) {
      const ang = (c / seg) * Math.PI * 2
      linha.push(put(Math.sin(ang) * r, y, Math.cos(ang) * r * 0.93 + dzBase))
    }
    linhas.push(linha)
  }
  linhas.push([put(0, -len - rBase * 0.72, dzBase)])

  // A ORDEM DOS INDICES DECIDE PRA ONDE A NORMAL APONTA. Aqui `A` e o anel de
  // CIMA (o membro desce em -Y), o contrario do que acontece em corpoGeo, onde
  // o perfil sobe. Escrever a mesma ordem nos dois foi o erro: os quatro
  // membros sairam com a normal pra dentro, e membro com normal invertida nao
  // some — ele fica CINZA E CHAPADO, porque a luz passa a bater no avesso.
  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (A.length === 1) { for (let j = 0; j < B.length; j++) idx.push(A[0], B[(j + 1) % B.length], B[j]); continue }
    if (B.length === 1) { for (let i = 0; i < A.length; i++) idx.push(A[i], B[0], A[(i + 1) % A.length]); continue }
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length
      idx.push(A[i], B[j], A[j], A[i], B[i], B[j])
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Interpolador suave de curva de raio: pares [[t, raio], ...]. */
function curvaR(pares) {
  return (t) => {
    if (t <= pares[0][0]) return pares[0][1]
    for (let i = 1; i < pares.length; i++) {
      if (t <= pares[i][0]) {
        const a = pares[i - 1], b = pares[i]
        const k = (t - a[0]) / (b[0] - a[0])
        return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)
      }
    }
    return pares[pares.length - 1][1]
  }
}

/**
 * TRONCO.
 *
 * A LISTRA VERTICAL NO MEIO DO PEITO NASCIA AQUI. LatheGeometry fecha a volta
 * duplicando a coluna de vertices — e a coluna dela fica em phi = 0, que na
 * convencao do three (sin em x, cos em z) e exatamente a FRENTE do boneco. As
 * duas colunas ocupam a mesma posicao mas sao vertices distintos, entao
 * computeVertexNormals da a cada uma so a media dos SEUS triangulos e a emenda
 * acende como um risco do pescoco ao umbigo. Foi fotografado.
 *
 * Aqui a volta e fechada por INDICE (o ultimo anel reusa os vertices do
 * primeiro), entao nao ha emenda pra acender. A pele nao usa textura, entao
 * abrir mao das UVs nao custa nada. A ROUPA continua com a lathe de verdade —
 * la o mapa importa (xadrez, listra) e quem resolve e soldarNormais().
 *
 * E de quebra o "peito quadrado, sem identidade": o torso deixou de ser um
 * circulo achatado em Z. A secao agora e uma SUPERELIPSE de expoente variavel —
 * mais retangular na caixa toracica (onde as costelas fazem o peito ser largo e
 * chato) e redonda na cintura — com a frente mais chata que as costas.
 * Achatar um circulo em Z dava um tubo oval do quadril ao pescoco, e e o tubo
 * oval que o dono leu como "peito quadrado e sem identidade".
 *
 * O crescimento maximo sobre a elipse antiga fica em ~6% (nas diagonais, com
 * expoente 2.4). O corpo nu esta em NU_S = 0.965 do perfil e o tecido em 1.045,
 * entao 0.965 * 1.06 = 1.023 continua DENTRO da roupa e a pele nao atravessa a
 * camisa. NAO aumente o expoente sem refazer essa conta.
 */
function corpoGeo(profile, opts = {}) {
  const seg = opts.seg || TORSO_SEG
  const flatZ = opts.flatZ === undefined ? FLAT_Z : opts.flatZ
  const nDe = opts.n || (() => 2)
  const dzDe = opts.dz || (() => 0)
  const pos = []
  const idx = []
  const linhas = []
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  for (let k = 0; k < profile.length; k++) {
    const r = Math.max(0.0008, profile[k][0])
    const y = profile[k][1]
    // ponta do perfil com raio quase zero vira um ponto so (a tampa)
    if (r < 0.004) { linhas.push([put(0, y, 0)]); continue }
    const n = nDe(y)
    const e = 2 / n
    const dz = dzDe(y)
    const linha = []
    for (let c = 0; c < seg; c++) {
      const ang = (c / seg) * Math.PI * 2
      const co = Math.cos(ang), si = Math.sin(ang)
      const sx = Math.sign(si) * Math.pow(Math.abs(si), e)
      const sz = Math.sign(co) * Math.pow(Math.abs(co), e)
      linha.push(put(sx * r, y, sz * r * flatZ + dz))
    }
    linhas.push(linha)
  }

  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (A.length === 1) { for (let j = 0; j < B.length; j++) idx.push(A[0], B[(j + 1) % B.length], B[j]); continue }
    if (B.length === 1) { for (let i = 0; i < A.length; i++) idx.push(A[i], A[(i + 1) % A.length], B[0]); continue }
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length
      idx.push(A[i], A[j], B[j], A[i], B[j], B[i])
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/**
 * A lathe ANTIGA, do jeito que estava — porque e ela que sai no ctx pras pecas
 * de roupa (ctx.lathe, usado pela manga curta). Roupa precisa de UV, entao ela
 * continua sendo uma LatheGeometry de verdade; o que mudou e que agora solda as
 * normais da costura antes de sair.
 */
function latheGeo(profile, flatZ = FLAT_Z, seg = TORSO_SEG) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0008, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, seg)
  g.scale(1, 1, flatZ)
  g.computeVertexNormals()
  soldarNormais(g)
  return g
}

// A barra da camiseta e a aresta larga em y = -0.008; abaixo dela o perfil so
// fecha o fundo. Antes o fundo era um domo alto e a camiseta virava um sino.
//
// O QUE MUDOU: o trecho do meio ganhou a CINTURA. Antes o perfil ia de 0.130 a
// 0.134 e voltava a 0.130 — quatro milimetros de variacao em trinta
// centimetros, ou seja, um cano. O tronco agora estreita de verdade na altura
// da cintura (0.118 em y = 0.175) e volta a abrir no arco costal. E essa
// diferenca que da silhueta ao boneco de longe; com o cano, camisa nenhuma
// salvava.
const PELVIS_PROFILE = [
  [0.020, -0.048], [0.086, -0.040], [0.116, -0.026], [0.126, -0.008],
  [0.132, 0.030], [0.136, 0.076], [0.130, 0.122], [0.121, 0.170],
  [0.118, 0.208], [0.122, 0.252], [0.130, 0.300],
]
// Termina em r=0.074 (e nao quase zero): a lathe deixa o decote aberto e o
// pescoco passa por ele. O ultimo trecho e o que a gola cobre.
//
// O QUE MUDOU: o ombro deixou de ser um corte reto. Antes o perfil ia de 0.140
// (y 0.140) direto pra 0.122 e 0.095 em quatro centimetros — a caixa toracica
// acabava numa quina e a capsula do braco comecava do lado dela, que e o
// "ombro quadrado" da foto. Agora ha o trapezio: o raio cai devagar de 0.144
// ate 0.128 subindo pela clavicula e so entao fecha no pescoco, e a queda
// final e em tres passos, nao um.
const CHEST_PROFILE = [
  [0.130, 0.000], [0.141, 0.046], [0.146, 0.092], [0.144, 0.126],
  [0.136, 0.152], [0.121, 0.174], [0.101, 0.191], [0.084, 0.200], [0.074, 0.205],
]

// SECAO DO TRONCO — o expoente da superelipse, em funcao da altura ABSOLUTA.
//
// 2 e a elipse. Acima disso a secao vira um retangulo de cantos redondos, que e
// o que a caixa toracica e de verdade: costela larga, esterno chato na frente,
// escapula chata atras. A cintura volta pra perto do circulo porque ali o que
// manda e musculo, nao osso. Teto em 2.4 por causa da conta de folga da roupa
// (ver corpoGeo).
//
// A ALTURA E ABSOLUTA (medida da origem do torso, com o peito somando CHEST_Y)
// e a funcao e UMA SO PRA AS DUAS PECAS. Elas eram duas, uma pro quadril e uma
// pro peito, e a emenda entre elas caia justo em y = 0.30, onde uma dizia 2.24 e
// a outra 2.05 — mesmo raio, secoes diferentes, e a diagonal do tronco dava um
// degrau de 8 mm. Na foto isso aparecia como um RISCO HORIZONTAL atravessando a
// barriga. Com uma funcao continua o degrau nao tem como existir.
const TRONCO_N = [
  [0.00, 2.02],  // quadril: quase circular
  [0.20, 2.02],  // cintura
  [0.30, 2.06],  // a emenda peito/quadril — os dois leem o MESMO valor aqui
  [0.40, 2.30],  // caixa toracica: onde a secao mais foge do circulo
  [0.46, 2.16],
  [0.52, 2.04],  // ombros e base do pescoco
]

/** Assimetria frente/tras, tambem em altura absoluta e tambem continua. */
const TRONCO_DZ = [
  [0.00, 0.0000],
  [0.30, 0.0000],  // zero na emenda, senao o degrau volta em Z
  [0.40, -0.0040], // o esterno recua em relacao ao peitoral; as costas sao mais cheias
  [0.50, 0.0000],
]

function interp(tab, y) {
  if (y <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) {
    if (y <= tab[i][0]) {
      const a = tab[i - 1], b = tab[i]
      const t = (y - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * t * t * (3 - 2 * t)
    }
  }
  return tab[tab.length - 1][1]
}

function nTronco(y) { return interp(TRONCO_N, y + CHEST_Y) }
function nPelve(y) { return interp(TRONCO_N, y) }
function dzTronco(y) { return interp(TRONCO_DZ, y + CHEST_Y) }
function dzPelve(y) { return interp(TRONCO_DZ, y) }

const FLAT_Z = 0.76        // achatamento em Z do torso (ver latheGeo)
const TORSO_SEG = 24       // faces do torso; a roupa usa o MESMO numero e a
                           // mesma fase, senao os poligonos se cruzam e a borda
                           // vira um serrilhado

// Manga curta: perfil revolucionado (domo + tubo + bainha). Antes eram um
// cilindro e uma meia-esfera separados, e a emenda entre os dois lia como
// ombreira. Coordenadas relativas a junta do ombro.
// (de baixo pra cima: a LatheGeometry so gera as faces pra fora nessa ordem)
// O topo do domo tem que morrer DENTRO do torso, senao as duas superficies se
// cruzam de raspao e a costura vira um serrilhado.
const SLEEVE_PROFILE = [
  [0.047, -0.100], [0.052, -0.096], [0.054, -0.070], [0.055, -0.034],
  [0.052, -0.008], [0.044, 0.008], [0.026, 0.021], [0.000, 0.026],
]

// O corpo nu e 3.5% mais fino que a roupa: a camiseta e a calca sao os MESMOS
// perfis em escala 1.0, entao a pele nunca aparece atravessando o tecido.
const NU_S = 0.965

// FOLGA DO ACESSORIO: quanto colar, relogio e anel precisam subir pra ficar POR
// FORA do tecido. A roupa assenta na mesma superficie da pele em escala 1.0,
// entao acessorio desenhado no raio do corpo nasce DENTRO do pano.
// O NUMERO E O DE roupas.js (o FORA_DA_ROUPA declarado no topo daquele
// arquivo), copiado a mao: nenhuma peca le ctx.foraDaRoupa ainda, todas usam a
// constante local delas. Enquanto forem duas declaracoes elas TEM que dizer o
// mesmo valor. Quem calibrou foi o lado de la — 4 mm alem da peca mais larga do
// catalogo, porque acima disso o colar comeca a boiar na frente do peito nu e
// abaixo o depth buffer perde a briga de longe. Engordar so este lado nao
// arruma nada hoje e vira o defeito no dia em que as pecas passarem a ler daqui.
// Quem for unificar apaga a copia de roupas.js e le por ctx.foraDaRoupa, nunca
// o contrario.
const FORA_DA_ROUPA = 0.004

// ===========================================================================
// MAO COM DEDOS
// ===========================================================================
// A mao aparece o tempo todo em primeira pessoa e sao 2 por personagem, ate 20
// personagens: 40 maos na tela. Por isso ela e UMA malha indexada de ~330
// triangulos (nao uma pilha de meshes) e as duas geometrias — direita e o
// espelho dela — sao criadas UMA VEZ pro modulo inteiro e compartilhadas por
// todos os bonecos. Elas NUNCA entram em ownGeos: dar dispose numa delas
// apagaria a mao de todo mundo.
//
// Espaco local da mao: origem no PULSO, dedos descendo em -Y, palma virada pro
// corpo (-X na mao direita) e polegar pra frente (+Z). Com o braco caido isso
// e exatamente a pose de descanso.

/** Acumulador de malha indexada (indexada = normais suaves no computeVertex). */
function malha() {
  const pos = []
  const idx = []
  return {
    v(x, y, z) { pos.push(x, y, z); return pos.length / 3 - 1 },
    tri(a, b, c) { idx.push(a, b, c) },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d) },
    geo() {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      g.computeVertexNormals()
      g.computeBoundingSphere()
      return g
    },
  }
}

/**
 * Anel de super-elipse: |x/a|^n + |z/b|^n = 1 no plano (u,v).
 * n = 2 e circulo; n > 2 vai virando retangulo de cantos redondos — e o que da
 * a palma achatada e o dedo levemente quadrado sem gastar poligono.
 * A ordem dos pontos importa: quem costura conta com cross(u,v) apontando do
 * anel B pro anel A.
 */
function anel(ma, o, u, v, a, b, n, N) {
  const ids = []
  const e = 2 / n
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    const c = Math.cos(t), s = Math.sin(t)
    const x = Math.sign(c) * Math.pow(Math.abs(c), e) * a
    const z = Math.sign(s) * Math.pow(Math.abs(s), e) * b
    ids.push(ma.v(o.x + u.x * x + v.x * z, o.y + u.y * x + v.y * z, o.z + u.z * x + v.z * z))
  }
  return ids
}

/**
 * Costura dois aneis. A fica no sentido +cross(u,v) em relacao a B.
 *
 * A ORDEM DOS QUATRO INDICES ESTAVA INVERTIDA. Com anel A no topo, B embaixo e
 * os pontos girando no sentido de cos/sin no plano (u, v), a sequencia
 * (A[i], A[j], B[j], B[i]) produz a normal apontando PRA DENTRO — da pra
 * conferir na mao com u = X, v = Y, A em z = 1 e B em z = 0: o triangulo
 * (1,0,1), (0,1,1), (0,1,0) tem normal (-1,-1,0), e o lado de fora ali e
 * (+0.7,+0.7,0).
 *
 * Consequencia: os quatro dedos e o polegar de TODAS as maos do jogo nasciam do
 * avesso desde que a mao foi escrita. Isso nao abre buraco — deixa a peca cinza
 * e chapada, com a luz batendo no lado errado, e e parte do que o dono via como
 * "maos feias". Quem pegou foi o teste de volume assinado
 * (tools/teste-normais.mjs), depois que dois cranios sairam pretos por um erro
 * irmao deste.
 */
function costurar(ma, A, B) {
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length
    ma.quad(A[i], B[i], B[j], A[j])
  }
}

/** Tampa em leque no lado -cross(u,v) do anel (ponta do dedo, base da palma). */
function tampa(ma, A, cx, cy, cz) {
  const c = ma.v(cx, cy, cz)
  for (let i = 0; i < A.length; i++) ma.tri(c, A[(i + 1) % A.length], A[i])
}

const EIXO_Z = new THREE.Vector3(0, 0, 1)
// Eixo em que os quatro dedos dobram: girar em -Z leva o dedo que aponta pra
// baixo na direcao da palma (-X na mao direita).
const EIXO_DEDO = new THREE.Vector3(0, 0, -1)
// O polegar aponta pra frente, entao dobrar em Z so o jogaria pro lado: o eixo
// dele e perpendicular a propria direcao e a palma.
const EIXO_POLEGAR = new THREE.Vector3(0, -0.51, -0.86).normalize()

/**
 * Um dedo: tubo curvo de R aneis. A curva de repouso e integrada segmento a
 * segmento (o dedo dobra mais nas juntas de cima, como um dedo relaxado de
 * verdade), e nao aplicada como uma rotacao unica — dedo reto com a ponta
 * torta le como galho, nao como dedo.
 */
function dedo(ma, base, dir, comp, curva, raio, ponta, N = 6, R = 5, eixo = EIXO_DEDO, n = 2.2) {
  const PESO = [0.30, 0.10, 0.40, 0.20] // MCP, meio, PIP, DIP
  const p = base.clone()
  const d = dir.clone().normalize()
  const passo = comp / (R - 1)
  const w = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3()
  const ref = Math.abs(d.z) > 0.85 ? new THREE.Vector3(0, 1, 0) : EIXO_Z
  let ant = null
  for (let k = 0; k < R; k++) {
    const t = k / (R - 1)
    const r = raio * (1 - (1 - ponta) * t)
    // frame do anel: cross(u,v) = -tangente, pra costura sair com a face pra fora
    w.copy(d).multiplyScalar(-1)
    u.crossVectors(ref, w).normalize()
    v.crossVectors(w, u).normalize()
    const A = anel(ma, p, u, v, r * 0.92, r * 1.06, n, N)
    if (ant) costurar(ma, ant, A)
    ant = A
    if (k < R - 1) {
      p.addScaledVector(d, passo)
      d.applyAxisAngle(eixo, curva * (PESO[k] || 0.25))
    }
  }
  // Ponta: um anel bem menor logo adiante e so entao o leque. Com o leque
  // direto no ultimo anel a ponta do dedo sai cortada reta, e a unha vira uma
  // faceta chapada que salta aos olhos em primeira pessoa.
  const rf = raio * ponta
  w.copy(d).multiplyScalar(-1)
  u.crossVectors(ref, w).normalize()
  v.crossVectors(w, u).normalize()
  p.addScaledVector(d, rf * 0.62)
  const fim = anel(ma, p, u, v, rf * 0.56, rf * 0.62, 2.0, N)
  costurar(ma, ant, fim)
  tampa(ma, fim, p.x + d.x * rf * 0.55, p.y + d.y * rf * 0.55, p.z + d.z * rf * 0.55)
}

// Aneis da palma: [y, meia-espessura em X, meia-largura em Z, expoente da
// superelipse, deslocamento em X]. O primeiro fica DENTRO do antebraco de
// proposito: a emenda com o pulso nunca aparece.
//
// O QUE MUDOU (o dono escreveu "maos feias"): a palma era um slab de cinco
// aneis simetricos com o mesmo expoente. Slab simetrico nao e mao: mao tem
//
//  - PULSO ESTREITO. O primeiro anel encolheu pra casar com o raio do
//    antebraco novo (2.4 cm), senao a mao nasce mais gorda que o braco e a
//    emenda vira um degrau.
//  - PALMA CONCAVA. O deslocamento em X empurra a superficie da palma pra
//    dentro e a das costas pra fora, entao a mao tem uma cova onde a palma e —
//    e a cova e o que a luz precisa pra ler a mao como mao.
//  - COSTAS MAIS CHATAS QUE A PALMA. O expoente cresce do pulso pro no dos
//    dedos: no pulso a secao e quase oval (osso redondo), na linha dos nos e
//    quase retangular (os cinco metacarpos lado a lado).
//  - LINHA DOS NOS MAIS LARGA. A mao alarga ate os nos e so entao encolhe; a
//    versao antiga ja vinha encolhendo desde o meio.
//
// AS PROPORCOES SAO AS DA MAO, e nao um chute: numa mao humana o comprimento da
// PALMA e o dos DEDOS sao praticamente iguais (~9 cm cada, numa mao de 18 cm), e
// a palma tem cerca de 3 cm de espessura contra 8.5 cm de largura. A primeira
// versao tinha palma de 10.3 cm com dedos de 5 cm e 4.4 cm de espessura — ou
// seja, uma LUVA DE FORNO: um bloco grosso com cinco cotocos na ponta. Foi
// fotografado de perto e era exatamente isso.
const PALMA_ANEIS = [
  [0.012, 0.0148, 0.0244, 2.30, 0.0000],  // dentro do antebraco (pulso)
  [-0.004, 0.0160, 0.0300, 2.45, 0.0006],
  [-0.022, 0.0170, 0.0360, 2.65, 0.0016],
  [-0.040, 0.0172, 0.0398, 2.85, 0.0022],  // meio da palma: a cova
  [-0.058, 0.0168, 0.0416, 3.05, 0.0018],
  [-0.070, 0.0158, 0.0412, 3.10, 0.0008],  // linha dos nos
  [-0.079, 0.0132, 0.0372, 2.70, 0.0000],
]

// TENAR — o coxim carnudo da base do polegar. Sao dois aneis extras costurados
// no lado do polegar, e nao um anel a mais na pilha da palma: o tenar so existe
// de UM lado, e engordar o anel inteiro daria uma mao inchada dos dois lados.
// Sem ele, a mao aberta le como uma raquete e o polegar parece parafusado.
const TENAR = [
  [-0.016, 0.0102, 0.0200],
  [-0.036, 0.0114, 0.0222],
  [-0.052, 0.0096, 0.0190],
]

// Base dos quatro dedos na linha dos nos (x, y, z) + comprimento e raio.
// O indicador fica na FRENTE (+Z) porque a palma olha pro corpo.
// A LINHA DOS NOS NAO E RETA: o dedo medio nasce mais baixo e o minimo bem mais
// alto (e o arco que a mao faz quando se olha o dorso). Reta, a mao lia como um
// pente. Os comprimentos seguem a mesma proporcao da mao de verdade — medio >
// anelar > indicador > minimo.
const DEDOS = [
  { z: 0.0300, y: -0.0755, comp: 0.0740, raio: 0.0098, abre: 0.09 },  // indicador
  { z: 0.0101, y: -0.0800, comp: 0.0810, raio: 0.0101, abre: 0.03 },  // medio
  { z: -0.0098, y: -0.0782, comp: 0.0765, raio: 0.0095, abre: -0.03 }, // anelar
  { z: -0.0286, y: -0.0708, comp: 0.0610, raio: 0.0086, abre: -0.10 }, // minimo
]

/** Posicao do anel de acessorio: base do dedo anelar da mao (espaco do pulso). */
export const DEDO_ANELAR = { x: 0, y: DEDOS[2].y - 0.014, z: DEDOS[2].z }


function construirMao() {
  const ma = malha()
  const o = new THREE.Vector3()
  // V APONTA PRA -Z, e nao pra +Z. A regra de costurar() e que o anel A fica no
  // sentido +cross(u, v) em relacao a B; a pilha da palma desce em Y, entao
  // cross(U, V) tem que apontar pra +Y. Com V = +Z, cross da (0,-1,0) e a mao
  // inteira sai VIRADA DO AVESSO — os triangulos com a normal pra dentro. Nao
  // aparece como buraco: aparece como uma mao cinza e chapada, com a luz batendo
  // no avesso dela. Ficou assim desde que a mao foi escrita; quem pegou foi o
  // teste de volume assinado (tools/teste-normais.mjs), e provavelmente e parte
  // do que o dono via como "maos feias".
  // O anel e simetrico em Z, entao trocar o sinal de V nao move nenhum vertice.
  const U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3(0, 0, -1)
  let ant = null
  // 10 colunas em vez de 8: com 8 a superelipse de expoente 3 mostrava os
  // cantos como facetas, e a mao aparece em PRIMEIRA PESSOA o tempo todo.
  for (const [y, a, b, n, dx] of PALMA_ANEIS) {
    o.set(dx, y, 0)
    const A = anel(ma, o, U, V, a, b, n, 10)
    if (ant) costurar(ma, ant, A)
    ant = A
  }
  tampa(ma, ant, 0, -0.086, 0.002)

  // Tenar: uma bolha propria, costurada em si mesma e enterrada na palma.
  // Enterrada de proposito — ela nao precisa fechar com a malha da palma, o
  // volume dela ja aparece na silhueta e o interior ninguem ve.
  {
    let antT = null
    for (const [y, a, b] of TENAR) {
      // +Z e o lado do indicador; o polegar mora no mesmo lado, a 3 cm do eixo
      o.set(0.0035, y, 0.0250)
      const A = anel(ma, o, U, V, a, b, 2.2, 8)
      if (antT) costurar(ma, antT, A)
      antT = A
    }
    tampa(ma, antT, 0.0035, -0.061, 0.0250)
  }

  for (const d of DEDOS) {
    // dedo levemente aberto em leque (abre) alem da curva de repouso
    const dir = new THREE.Vector3(-0.10, -1, d.abre * 0.55).normalize()
    dedo(ma, new THREE.Vector3(0, d.y, d.z), dir, d.comp, 0.72, d.raio, 0.66, 7)
  }
  // Polegar: encostado no lado da palma, apontando pra BAIXO e pra frente — e
  // a pose de mao relaxada. Apontando so pra frente (a primeira tentativa) ele
  // lia como uma tabua saindo do pulso.
  // O polegar sai do TENAR (a bolha que acabamos de por), nao do meio do pulso:
  // era isso que fazia ele parecer parafusado na lateral da mao.
  dedo(ma, new THREE.Vector3(-0.005, -0.046, 0.0330),
    new THREE.Vector3(-0.26, -0.80, 0.54), 0.056, 0.80, 0.0126, 0.70, 8, 5, EIXO_POLEGAR, 2.1)

  return ma.geo()
}

/**
 * A FERRAMENTA DE MAO, pra quem precisa de OUTRA pose da mesma mao.
 *
 * Quem usa: src/player/mao.js, que monta um PUNHO FECHADO em volta da bebida.
 * Ele nao podia usar `geoMao()` (aquela e a mao de REPOUSO, de dedo quase reto)
 * nem copiar as funcoes pra la — mao copiada e mao que diverge: no dia em que
 * alguem arrumar a superelipse aqui, a que segura a garrafa continua errada.
 *
 * O que sai daqui e a MAQUINARIA, nao a mao: os aneis, a costura, o tubo curvo
 * do dedo e as tabelas de proporcao. A POSE quem escreve e quem chama — e a
 * unica diferenca entre a mao de repouso e o punho e o quanto `curva` vale.
 *
 * NAO EXPORTE geometria por aqui. As duas geometrias de mao sao compartilhadas
 * pelo modulo inteiro (ver geoMao) e dar dispose numa delas apagaria a mao de
 * todos os bonecos da cena.
 */
export const MALHA_MAO = {
  malha, anel, costurar, tampa, dedo,
  EIXO_DEDO, EIXO_POLEGAR,
  PALMA_ANEIS, TENAR, DEDOS,
}

/** Espelha em X e inverte a volta dos triangulos (senao a mao vira do avesso). */
function espelharX(geo) {
  const g = geo.clone()
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i))
  const idx = g.index
  for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, b)
  }
  p.needsUpdate = true
  idx.needsUpdate = true
  g.computeVertexNormals()
  return g
}

let GEO_MAO = null
/** Geometrias compartilhadas das maos (nunca dar dispose: sao do modulo). */
function geoMao(sgn) {
  if (!GEO_MAO) {
    const R = construirMao()
    GEO_MAO = { R, L: espelharX(R) }
  }
  return sgn > 0 ? GEO_MAO.R : GEO_MAO.L
}

// ===========================================================================

export function createCharacter(opts = {}) {
  // Ordem do merge: padrao de roupa -> catalogo -> o que o chamador pediu.
  const app = Object.assign(
    {
      cabeca: 0, olhos: 0, palpebra: 0, nariz: 0, boca: 0, barba: 0, cabelo: 0,
      pele: 0, corCabelo: 1, corBarba: 0, sobrancelha: 0, skin: corPele(0),
      chapeu: 0, calcado: 1, blusa: 1, calca: 0, colar: 0, anelAcess: 0,
      tatuagem: 0, relogio: 0,
      // 'jaqueta' NAO E MAIS DESENHADA. Jaqueta, blazer, terno e moletom
      // entraram no catalogo de BLUSAS e as duas abas viraram uma so. O campo
      // continua existindo porque o pacote de aparencia tem 20 bytes fixos e um
      // deles e este — ele viaja sempre 0. Nao "conserte" a falta do slot: a
      // ausencia e proposital, mexer no formato binario por causa de um byte
      // dormindo custa mais do que deixa-lo dormir.
      jaqueta: 0,
    },
    typeof AP.defaultAppearance === 'function' ? AP.defaultAppearance() : null,
  )
  aplicar(app, opts.appearance)
  aplicar(app, {
    skin: opts.skin, shirt: opts.shirt, pants: opts.pants, shoes: opts.shoes,
  })

  // Materiais por "tom": os meshes guardam so a chave, entao trocar de cor e
  // regerar o mapa e reatribuir. O cache de materials.js compartilha entre NPCs.
  const M = {}
  const tinted = []              // { mesh, tone }
  const ownGeos = []             // geometrias criadas aqui (dispose no fim)
  const track = (g) => { ownGeos.push(g); return g }

  // So a PELE mora aqui. Tecido e couro agora sao das pecas de roupas.js, que
  // fazem o proprio material a partir das cores do ctx — manter uma copia dos
  // tons de camiseta aqui daria dois lugares pra mesma cor sair diferente.
  function refreshMats() {
    M.skin = solid(app.skin, 0.68, 0.0)
    M.skinDark = solid(shadeColor(app.skin, 0.86), 0.7, 0.0)
  }
  refreshMats()

  /** Cria o mesh ja com sombra, tom registrado e geometria rastreada. */
  function part(geo, tone, own = true) {
    if (own) track(geo)
    const m = sh(new THREE.Mesh(geo, M[tone]))
    tinted.push({ mesh: m, tone })
    return m
  }

  const root = new THREE.Group()
  root.name = 'character'

  // Pedacos de PELE que a roupa pode cobrir. Quando uma peca declara `esconde`,
  // o corpo por baixo some: desenhar torso nu + camiseta seria pagar o torso
  // duas vezes em 20 bonecos e ainda arriscar a pele atravessar o tecido.
  const nu = { torso: [], peito: [], braco: [], antebraco: [], coxa: [], canela: [], pe: [] }

  // --- tronco ---------------------------------------------------------------
  const hips = joint('hips', 0, HIPS_Y, 0, root)
  const torso = joint('torso', 0, 0, 0, hips)
  const chest = joint('chest', 0, CHEST_Y, 0, torso)

  const torsoNu = part(corpoGeo(PELVIS_PROFILE, { n: nPelve, dz: dzPelve }), 'skin')
  torsoNu.scale.set(NU_S, 1, NU_S)
  torso.add(torsoNu)
  nu.torso.push(torsoNu)

  const peitoNu = part(corpoGeo(CHEST_PROFILE, { n: nTronco, dz: dzTronco }), 'skin')
  peitoNu.scale.set(NU_S, 1, NU_S)
  // A RESPIRACAO (animation.js applyBreath) escala os meshes filhos diretos do
  // 'chest' um por um, guardando a escala de cada um. userData.anima avisa o
  // forno de congelar.js: este mesh e alvo de animacao, nao pode ser fundido
  // com os vizinhos nem perder a propria escala pra dentro da geometria.
  peitoNu.userData.anima = true
  chest.add(peitoNu)
  nu.peito.push(peitoNu)

  // --- pescoco e cabeca -----------------------------------------------------
  const neck = joint('neck', 0, NECK_Y, 0, chest)

  // JUNTA SO DO OLHAR, entre o pescoco e a cabeca.
  //
  // Ela existe por um motivo bem concreto: o head look precisa girar tambem a
  // BASE do pescoco (cabeca girando sozinha sobre um pescoco parado le como
  // torcicolo, nao como olhar), mas `neck` e escrito pelo ANIMADOR a cada
  // quadro. A primeira versao somava no proprio `neck` — e funcionava pro
  // jogador, porque ali o animador roda antes e reescreve a rotacao do zero.
  // Nos NPCs nao ha animador nenhum (src/npc/npc.js so chama setHeadLook), e a
  // soma ia se acumulando quadro a quadro ate o NPC ficar de costas.
  //
  // Com uma junta propria o problema nao existe: setHeadLook escreve valor
  // ABSOLUTO aqui e ninguem mais toca nela.
  //
  // O COLAR NAO ENTRA. Ele fica no `neck` de proposito: colar acompanha o
  // TRONCO, nao o olhar — corrente girando junto com a cabeca e um dos jeitos
  // mais rapidos de um personagem parecer de papelao.
  const neckLook = joint('neckLook', 0, 0, 0, neck)
  // Pescoco fino e curto: so uns 3 cm ficam entre a gola e o queixo.
  // Era um CylinderGeometry — cone de parede reta, com costura. Agora e um
  // perfil: o esternocleidomastoideo faz o pescoco ser mais grosso na base e
  // afinar subindo, e ele nao e redondo (mais largo de lado do que de frente
  // pra tras), o que corpoGeo entrega de graca com flatZ.
  const neckMesh = part(corpoGeo([
    [0.0630, -0.055], [0.0605, -0.030], [0.0555, 0.005],
    [0.0508, 0.040], [0.0480, 0.062], [0.0455, 0.075],
  ], { seg: 16, flatZ: 0.90, n: () => 2.05 }), 'skinDark')
  neckMesh.position.y = 0.030
  neckLook.add(neckMesh)

  const headPivot = joint('headPivot', 0, HEADPIVOT_Y, 0, neckLook)
  const head = joint('head', 0, HEAD.ry, 0, headPivot)

  // Orelhas removidas a pedido do dono (eram esfera escalada + posOrelhas()
  // grudando na pele via eggSurface; ver git log deste arquivo pra recuperar).

  // face: ancora dos slots faciais, olhando pra +Z
  const face = new THREE.Group()
  face.name = 'face'
  head.add(face)

  // camera de 1a pessoa na altura dos olhos
  const fpAnchor = new THREE.Object3D()
  fpAnchor.name = 'fpAnchor'
  // Fica exatamente onde estao os globos oculares (EYE_ANCHOR.y, no espaco da
  // cabeca), pra camera de 1a pessoa e o rosto visto em 3a pessoa concordarem.
  // PLAYER.EYE_HEIGHT segue como fallback do controller.
  fpAnchor.position.set(0, EYE_ANCHOR.y, 0.06 * HEAD_S)
  head.add(fpAnchor)

  // --- bracos ---------------------------------------------------------------
  //
  // O QUE ESTAVA ERRADO (foto do dono): "bracos com listras, cotovelos e ombros
  // quadrados". Eram tres defeitos somados, e cada um tem a sua correcao aqui:
  //
  // 1. LISTRA — a CapsuleGeometry fecha a volta duplicando a coluna de
  //    vertices e a emenda acendia ao longo do braco inteiro. membroGeo fecha
  //    por indice: nao ha emenda.
  // 2. BRACO DE CANO — raio constante do ombro ao cotovelo. Agora o raio sai de
  //    uma curva com o deltoide em cima e o afinamento no cotovelo.
  // 3. OMBRO QUADRADO — a capsula comecava do LADO da caixa toracica, com um
  //    degrau entre as duas. Agora ha o DELTOIDE: um elipsoide que cobre a
  //    junta e encosta nos dois, e e ele que faz a leitura de ombro. Sem ele
  //    nao ha curva de raio que resolva, porque o problema estava no VAO.
  //
  // O deltoide fica dentro do braco (nao do peito) de proposito: assim ele gira
  // com o braco, que e o que um ombro faz.

  // Topo em 0.020 acima da junta: mais que isso passa do domo da manga curta e
  // aparece um triangulo de pele no ombro.
  const RAIO_BRACO = curvaR([
    [0.00, 0.0455],  // deltoide
    [0.18, 0.0470],  // ventre do deltoide, o ponto mais grosso
    [0.55, 0.0405],  // meio do umero
    [0.86, 0.0355],  // acima do cotovelo
    [1.00, 0.0350],
  ])
  const RAIO_ANTEBRACO = curvaR([
    [0.00, 0.0385],
    [0.16, 0.0415],  // bojo do braquiorradial, logo abaixo do cotovelo
    [0.55, 0.0330],
    [0.86, 0.0248],  // pulso
    [1.00, 0.0240],
  ])
  // O antebraco MORRE no pulso: a bola de 4 cm que a capsula deixava sobrando
  // empurrava a mao pra baixo e comia a palma.
  // Cada comprimento inclui a cupula de baixo (raio final * 0.72) e foi
  // escolhido pra a peca TERMINAR DENTRO da junta seguinte. Com a capsula
  // antiga isso vinha de graca (ela sobrava 4 cm); com o loft, sobrar de menos
  // abre uma fresta de fundo no cotovelo e no pulso.
  const upperArmGeo = track(membroGeo(UPPER_ARM - 0.016, RAIO_BRACO, 14, 12))
  const foreArmGeo = track(membroGeo(FORE_ARM - 0.018, RAIO_ANTEBRACO, 14, 12))
  // NAO HA MAIS BOLA DE COTOVELO.
  //
  // Ela existia porque a capsula do braco tinha raio constante e acabava num
  // corte; a bola tapava o corte. Com o loft, o antebraco ja nasce com uma
  // CUPULA de 3.85 cm no topo — maior que os 3.5 cm em que o braco termina —,
  // entao a articulacao ja esta coberta por construcao, inclusive com o cotovelo
  // dobrado a 90 graus.
  // Deixar a bola ali fazia o oposto do que ela prometia: uma esfera de 3.75 cm
  // atravessando uma cupula de 3.85 cm produz uma linha de intersecao serrilhada
  // dando a volta na junta — e era esse anel picotado que lia como "cotovelo
  // quadrado". Foi fotografado depois de a cupula entrar.
  // O mesmo vale pro joelho.
  const deltoideGeo = track(new THREE.SphereGeometry(1, 16, 12))

  function buildArm(sgn, side) {
    const up = joint('arm' + side + 'Upper', sgn * SHOULDER_X, SHOULDER_Y, 0, chest)

    const delt = part(deltoideGeo, 'skin', false)
    // O TAMANHO SAI DA MANGA, nao do gosto. A manga curta e a lathe de
    // SLEEVE_PROFILE em volta desta mesma junta, e ela chega no maximo a 5.5 cm
    // de raio (na altura y = -0.034) e fecha em 2.6 cm la em cima (y = +0.021).
    // O deltoide tem que caber embaixo dela em TODA altura, senao o ombro nu
    // fura a camiseta — foi essa a primeira tentativa, e furava mesmo.
    // Com centro em y = -0.020 e raio 5.2 cm deslocado 8 mm pra DENTRO, o ponto
    // mais externo fica em 4.4 cm contra 5.3 cm de manga; la em cima, 3.5 contra
    // 3.85. O topo do elipsoide passa da manga, mas ali o raio horizontal ja e
    // quase zero e a ponta morre dentro da caixa toracica.
    delt.scale.set(0.052, 0.058, 0.050)
    delt.position.set(-sgn * 0.008, -0.020, 0)
    up.add(delt)
    nu.braco.push(delt)

    const upMesh = part(upperArmGeo, 'skin', false)
    up.add(upMesh)
    nu.braco.push(upMesh)

    const low = joint('arm' + side + 'Lower', 0, -UPPER_ARM, 0, up)
    const lowMesh = part(foreArmGeo, 'skin', false)
    low.add(lowMesh)
    nu.antebraco.push(lowMesh)

    const hand = joint('hand' + side, 0, -FORE_ARM, 0, low)
    // geometria compartilhada do modulo: own = false pra nunca cair no dispose
    hand.add(part(geoMao(sgn), 'skin', false))

    return { up, low, hand }
  }

  const armR = buildArm(1, 'R')
  const armL = buildArm(-1, 'L')

  // --- pernas ---------------------------------------------------------------
  //
  // Mesma historia do braco, e o dono pediu explicitamente: "nao e so na parte
  // de cima, nas pernas tambem".
  //
  // A coxa afina do quadril pro joelho. A canela tem a BARRIGA DA PANTURRILHA,
  // e ela nao e uma engrossada simetrica: ela fica ATRAS e ALTA. Por isso a
  // canela usa o atrasZ do membroGeo — engordar o raio no lugar disso daria uma
  // perna de elefante em vez de uma panturrilha.
  const RAIO_COXA = curvaR([
    [0.00, 0.0570],
    [0.15, 0.0585],  // gluteo/quadriceps alto
    [0.60, 0.0490],
    [0.90, 0.0420],  // acima do joelho
    [1.00, 0.0405],
  ])
  const RAIO_CANELA = curvaR([
    // 4.50 cm no topo, contra 4.05 cm em que a coxa termina: e essa folga que
    // faz a cupula da canela cobrir a articulacao sozinha, sem bola de joelho.
    [0.00, 0.0450],
    [0.06, 0.0455],  // patela
    [0.22, 0.0468],  // panturrilha
    [0.55, 0.0370],
    [0.86, 0.0268],  // tornozelo
    [1.00, 0.0255],
  ])
  // Deslocamento pra TRAS da panturrilha. O pico em 0.22 e o mesmo do raio, e o
  // 0.010 e o que faz a silhueta de perfil ter uma curva atras da perna sem
  // mudar nada visto de frente.
  // Positivo no topo = a PATELA pra frente; negativo no meio = a panturrilha pra
  // tras. E a curva em S que da o perfil de uma perna vista de lado.
  const ATRAS_CANELA = curvaR([
    [0.00, 0.0050], [0.10, 0.0035], [0.22, -0.0100], [0.62, -0.0020], [1.00, 0],
  ])

  const thighGeo = track(membroGeo(THIGH - 0.014, RAIO_COXA, 16, 13))
  // A canela vai ate o proprio tornozelo: a cupula dela e o calcanhar, e ela
  // precisa alcancar o topo do pe (que fica 1.75 cm abaixo da junta) senao
  // sobra um anel vazio no tornozelo.
  const shinGeo = track(membroGeo(SHIN, RAIO_CANELA, 16, 13, ATRAS_CANELA))
  // Sem bola de joelho, pelo mesmo motivo do cotovelo: a cupula do topo da
  // canela (4.30 cm) ja e mais larga que o fim da coxa (4.05 cm) e cobre a
  // articulacao sozinha. A saliencia da patela vem do proprio perfil da canela,
  // que engrossa nos primeiros centimetros.
  // Pe descalco: bloco baixo com o dedao arredondado, plantado no chao. seg = 1
  // no roundedBox porque o padrao (3) gera bevel de 3 aneis e curva de 5 — 2 mil
  // triangulos por pe, num pedaco que so aparece quando o personagem esta
  // descalco e que a 3 m de distancia tem 20 pixels.
  const peGeo = track(mats.roundedBox(0.082, 0.070, 0.190, 0.030, M.skin, 1).geometry)
  const dedaoGeo = track(new THREE.SphereGeometry(1, 12, 8))

  function buildLeg(sgn, side) {
    const up = joint('leg' + side + 'Upper', sgn * HIP_X, 0, 0, hips)
    const upMesh = part(thighGeo, 'skin', false)
    up.add(upMesh)
    nu.coxa.push(upMesh)

    const low = joint('leg' + side + 'Lower', 0, -THIGH, 0, up)
    const lowMesh = part(shinGeo, 'skin', false)
    low.add(lowMesh)
    nu.canela.push(lowMesh)

    const foot = joint('foot' + side, 0, -SHIN, 0, low)
    const pe = part(peGeo, 'skin', false)
    pe.position.set(0, SOLA_Y + 0.035, 0.030)
    foot.add(pe)
    nu.pe.push(pe)
    // bolota achatada na ponta = fileira de dedos. A esfera alta de antes
    // pendurava uma bola de gude na frente do pe.
    const dedao = part(dedaoGeo, 'skin', false)
    dedao.scale.set(0.038, 0.021, 0.028)
    dedao.position.set(0, SOLA_Y + 0.023, 0.110)
    foot.add(dedao)
    nu.pe.push(dedao)

    return { up, low, foot }
  }

  const legR = buildLeg(1, 'R')
  const legL = buildLeg(-1, 'L')

  const parts = {
    // 'neckLook' PRECISA estar aqui. Nao e pelo animador (a lista dele e outra):
    // e pelo FORNO de personagem. congelarPersonagem() recebe `character.parts`
    // como a lista de juntas que sobrevivem a fusao (ver world/barbershop.js), e
    // toda junta que ficar de fora dessa lista e FUNDIDA no pai — o que
    // congelaria a rotacao do olhar do NPC no valor do dia em que ele foi
    // assado.
    hips, torso, chest, neck, neckLook, head, headPivot, face,
    armLUpper: armL.up, armLLower: armL.low, handL: armL.hand,
    armRUpper: armR.up, armRLower: armR.low, handR: armR.hand,
    legLUpper: legL.up, legLLower: legL.low, footL: legL.foot,
    legRUpper: legR.up, legRLower: legR.low, footR: legR.foot,
  }

  // --- slots ----------------------------------------------------------------
  // Cada slot e um Group vazio ANCORADO na parte certa do corpo: o que a peca
  // desenha ja nasce no espaco daquela junta e anda junto com a animacao.
  // Peca que precisa de mais de um ponto (os dois pes, os dois bracos) usa
  // ctx.montar() — ver ANCORA/montar mais abaixo.
  // NAO existe slot 'jaqueta': casaco e blusa sao a MESMA peca agora, montada
  // no slot 'blusa'. O campo continua na aparencia (byte de rede), so nao tem
  // ancora nem catalogo — sem slot, nada de reconstruir e nada de desenhar.
  const ANCORA = {
    cabelo: head, olhos: face, sobrancelha: face, boca: face, nariz: face,
    barba: face,
    chapeu: head, colar: neck, blusa: torso, calca: hips,
    calcado: legR.foot, anelAcess: armL.hand, relogio: armL.low,
    tatuagem: chest,
  }
  const slots = {}
  for (const k in ANCORA) {
    const g = new THREE.Group()
    g.name = 'slot:' + k
    slots[k] = g
    ANCORA[k].add(g)
  }
  // A PISCADA nao mexe numa palpebra solta: ela achata o GRUPO dos olhos em Y
  // (npc.js e animation.js fazem os dois igual, escrevendo scale.y e
  // position.y neste Group). userData.anima marca o slot como animado pro
  // forno de congelar.js preservar o transform dele — o que estiver dentro
  // pode ser fundido a vontade, porque pisca tudo junto.
  slots.olhos.userData.anima = true

  // apelidos em ingles: npc.js pisca em slots.eyes, e o customizer antigo usa
  // os quatro nomes velhos. Sao o MESMO Group, nao uma copia.
  slots.hair = slots.cabelo
  slots.eyes = slots.olhos
  slots.brows = slots.sobrancelha
  slots.mouth = slots.boca

  // --- aparencia ------------------------------------------------------------

  // O que cada slot monta fora da propria ancora (montados) e o que cada peca
  // manda esconder do corpo nu.
  const montados = {}
  const esconde = {}
  for (const k in ANCORA) { montados[k] = []; esconde[k] = null }

  function ctx(kind) {
    return {
      // O catalogo de rosto (appearance.js) quer INDICE em corCabelo/pele/
      // pupila e resolve a cor sozinho — mandar hex ali pinta o cabelo de uma
      // cor sorteada pelo wrap do indice. 'skin' e a excecao: aceita cor crua,
      // que e como os NPCs da cidade pedem a pele deles.
      skin: app.skin,
      pele: app.pele, corCabelo: app.corCabelo, hairColor: app.corCabelo,
      // Cor da barba: catalogo PROPRIO (o indice 0 quer dizer "igual ao
      // cabelo"). appearance.js resolve com beardColorFrom(ctx); passar hex
      // aqui pintaria a barba de uma cor sorteada pelo wrap do indice.
      corBarba: app.corBarba, beardColor: app.corBarba,
      cabeca: app.cabeca, head: app.cabeca,
      olhos: app.olhos, eyes: app.olhos,
      // 'palpebra' e a BARRA da aba de olhos: 0 = aberto, 10 = fechado. O byte
      // era da pupila, que morreu quando a iris virou parte de cada olho.
      palpebra: app.palpebra, lid: app.palpebra,
      nariz: app.nariz, boca: app.boca, barba: app.barba,
      sobrancelha: app.sobrancelha, brows: app.sobrancelha, cabelo: app.cabelo,
      shirt: app.shirt, pants: app.pants, shoes: app.shoes,
      // ja em hex, pro catalogo de ROUPA, que nao conhece tabela de indice
      cor: {
        pele: app.skin, cabelo: hairColorOf(app.corCabelo),
        blusa: app.shirt, calca: app.pants, calcado: app.shoes,
      },
      app,
      THREE,
      mats,
      sh,
      // helpers do corpo, pra roupa usar EXATAMENTE o mesmo perfil da pele
      lathe: latheGeo,
      perfil: { PELVIS: PELVIS_PROFILE, PEITO: CHEST_PROFILE, MANGA: SLEEVE_PROFILE },
      medida: {
        HIPS_Y, CHEST_Y, NECK_Y, SHOULDER_X, SHOULDER_Y, UPPER_ARM, FORE_ARM,
        HIP_X, THIGH, SHIN, ANKLE_Y, SOLA_Y, FLAT_Z, TORSO_SEG,
        HEAD, HEAD_S, DEDOS, DEDO_ANELAR,
      },
      partes: parts,
      // Folga que o tecido ocupa por fora da pele, em metros. Colar e relogio
      // SOMAM isto no proprio raio pra encostar por cima da roupa em vez de
      // atravessar ela; o anel usa quando a manga e comprida. Hoje nenhuma peca
      // le daqui — roupas.js ainda usa a constante dele —, entao trocar o valor
      // neste arquivo nao move nada na tela. Antes de confiar neste campo,
      // apague a copia de la (ver o comentario do FORA_DA_ROUPA la em cima).
      foraDaRoupa: FORA_DA_ROUPA,
      /** Pendura um objeto em outra junta (os dois pes, os dois bracos...). */
      montar(obj, nomeDaParte) {
        const p = parts[nomeDaParte]
        if (!obj || !p) return obj
        p.add(obj)
        montados[kind].push(obj)
        return obj
      },
    }
  }

  /** Libera geometria/material proprio de uma subarvore que vai embora. */
  function limparObjeto(o) {
    o.traverse((c) => {
      if (c.geometry && !ehCompartilhada(c.geometry)) c.geometry.dispose()
      const mt = c.material
      if (mt && mt.userData && mt.userData.owned) {
        if (mt.map) mt.map.dispose()
        mt.dispose()
      }
    })
  }

  /** As duas maos sao do modulo inteiro: dispose nelas apaga a mao de todos. */
  function ehCompartilhada(g) {
    return !!GEO_MAO && (g === GEO_MAO.R || g === GEO_MAO.L)
  }

  /** Limpa um slot liberando so as geometrias (materiais vem do cache global). */
  function clearSlot(kind) {
    const slot = slots[kind]
    for (let i = slot.children.length - 1; i >= 0; i--) {
      const child = slot.children[i]
      limparObjeto(child)
      slot.remove(child)
    }
    const lista = montados[kind]
    if (lista) {
      for (const o of lista) {
        limparObjeto(o)
        if (o.parent) o.parent.remove(o)
      }
      lista.length = 0
    }
  }

  /** Catalogo de cada slot, resolvido na hora (appearance.js pode ter mudado). */
  function catalogoDe(kind) {
    switch (kind) {
      case 'cabelo': return AP.CABELOS || AP.HAIR
      case 'olhos': return AP.OLHOS || AP.EYES
      case 'sobrancelha': return AP.SOBRANCELHAS || AP.BROWS
      case 'boca': return AP.BOCAS || AP.MOUTH
      case 'nariz': return AP.NARIZES || NARIZ_PADRAO
      case 'barba': return AP.BARBAS || null
      case 'chapeu': return ROUPAS.CHAPEUS
      case 'calcado': return ROUPAS.CALCADOS
      case 'blusa': return ROUPAS.BLUSAS
      case 'calca': return ROUPAS.CALCAS
      case 'colar': return ROUPAS.COLARES
      case 'anelAcess': return ROUPAS.ANEIS
      case 'tatuagem': return ROUPAS.TATUAGENS
      case 'relogio': return ROUPAS.RELOGIOS
      // ROUPAS.JAQUETAS nao e mais consultado: as jaquetas moram em BLUSAS.
      default: return null
    }
  }

  function rebuild(kind) {
    clearSlot(kind)
    esconde[kind] = null
    const catalog = catalogoDe(kind)
    if (!Array.isArray(catalog) || !catalog.length) return
    const i = Math.max(0, Math.min(catalog.length - 1, app[kind] | 0))
    const entrada = catalog[i]
    if (!entrada || typeof entrada.build !== 'function') return
    esconde[kind] = entrada.esconde || null
    const obj = entrada.build(ctx(kind))
    if (obj) slots[kind].add(obj)
  }

  /**
   * Some com a pele que estiver debaixo de alguma roupa.
   *
   * Roda SEMPRE por inteiro e SEMPRE depois de todos os rebuild() do lote — as
   * duas coisas sao a mesma regra vista de dois lados. A tabela `esconde` e
   * global (uma peca esconde 'torso', outra esconde 'braco'), entao cobertura
   * por peca nao existe: se a blusa fosse coberta na hora em que e construida,
   * a peca montada depois — que ainda nao declarou nada — sobrescreveria a
   * pele que a anterior tinha acabado de esconder, ou pior, deixaria escondido
   * um braco que a peca nova nao cobre mais.
   * Por isso o primeiro laco RESSUSCITA todo mundo antes de esconder de novo:
   * a visibilidade e sempre recalculada do zero a partir do estado atual dos
   * slots, nunca acumulada.
   */
  function aplicarCobertura() {
    for (const g in nu) for (const m of nu[g]) m.visible = true
    for (const k in esconde) {
      const lista = esconde[k]
      if (!lista) continue
      for (const g of lista) {
        if (!nu[g]) continue
        for (const m of nu[g]) m.visible = false
      }
    }
  }

  // --- cabeca ---------------------------------------------------------------
  // O formato do cranio nao e um slot: e a geometria da propria cabeca. O
  // caminho de verdade e o catalogo CABECAS; makeHeadGeometry so entra se um
  // dia o catalogo sumir. Nao volte a testar nomes que appearance.js nao
  // exporta (makeHeadGeometryFor, HEADS): num namespace de modulo o acesso
  // devolve undefined em runtime, mas o rollup acusa "is not exported by" a
  // cada build e o aviso legitimo do proximo se perde no meio dos falsos.
  let headMesh = null

  function geoDaCabeca() {
    const forma = app.cabeca | 0
    const cat = AP.CABECAS
    if (Array.isArray(cat) && cat.length) {
      const e = cat[Math.max(0, Math.min(cat.length - 1, forma))]
      // geometry() tambem ATIVA o formato no appearance.js, que e do que os
      // builds de rosto precisam pra cair na mesma superficie do cranio
      if (e && typeof e.geometry === 'function') return e.geometry(1, 30, 24)
      if (e && typeof e.geo === 'function') return e.geo(30, 24)
    }
    if (typeof AP.makeHeadGeometry === 'function') {
      // A versao velha e makeHeadGeometry(s, wSeg, hSeg) e tem length 0 (todos
      // os parametros tem padrao); uma versao que aceite FORMATO vai declarar o
      // formato sem padrao, entao length >= 1. E o unico jeito de nao chamar a
      // funcao antiga passando "formato" no lugar da escala.
      return AP.makeHeadGeometry.length >= 1
        ? AP.makeHeadGeometry(forma, 1, 30, 24)
        : AP.makeHeadGeometry(1, 30, 24)
    }
    return new THREE.SphereGeometry(HEAD.ry, 24, 18)
  }

  function rebuildCabeca() {
    if (headMesh) {
      const i = tinted.findIndex((t) => t.mesh === headMesh)
      if (i >= 0) tinted.splice(i, 1)
      const gi = ownGeos.indexOf(headMesh.geometry)
      if (gi >= 0) ownGeos.splice(gi, 1)
      headMesh.geometry.dispose()
      head.remove(headMesh)
    }
    headMesh = part(geoDaCabeca(), 'skin')
    head.add(headMesh)
  }

  // Nariz de reserva enquanto appearance.js nao publica o catalogo de 5.
  const NARIZ_PADRAO = [{
    id: 'padrao',
    nome: 'Padrao',
    build(c) {
      const g = new THREE.Group()
      const n = sh(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), solid(c.skin, 0.68, 0)))
      n.scale.set(0.023 * HEAD_S, 0.026 * HEAD_S, 0.030 * HEAD_S)
      const y = -0.014 * HEAD_S
      n.position.set(0, y, surfaceZ(0, y) - 0.007 * HEAD_S)
      g.add(n)
      return g
    },
  }]

  // A ORDEM aqui nao e decorativa: e a ordem em que os slots sao construidos,
  // na montagem inicial E no rebuild parcial do setAppearance (que percorre
  // esta mesma lista). Em camadas, de dentro pra fora:
  //   rosto -> pele pintada -> tecido -> acessorio.
  // O acessorio vem POR ULTIMO de proposito: colar, relogio e anel se apoiam na
  // folga do tecido (ctx.foraDaRoupa) e so fazem sentido depois que a peca de
  // tronco existe. Com o acessorio nascendo antes da blusa e que ele voltava a
  // aparecer enterrado no pano.
  const ORDEM = [
    'cabelo', 'olhos', 'sobrancelha', 'boca', 'nariz', 'barba',
    'tatuagem',
    'blusa', 'calca', 'calcado', 'chapeu',
    'colar', 'relogio', 'anelAcess',
  ]

  // De quais campos cada slot depende. Trocar de camisa nao pode reconstruir o
  // cabelo: setAppearance so refaz o que mudou de verdade.
  // 'cabeca' entra em todo slot do rosto: cabelo, olhos, boca, nariz e barba
  // sao construidos GRUDADOS na superficie do cranio ativo (eggSurface). Trocar
  // o formato da cabeca sem reconstruir esses slots deixa os tracos flutuando
  // na curva do cranio ANTERIOR — foi exatamente o que a conferencia pegou.
  const DEPENDE = {
    cabelo: ['cabelo', 'corCabelo', 'cabeca'],
    // 'palpebra' TEM que estar aqui: sem ela, arrastar a barra nao reconstroi o
    // slot e o olho fica congelado no valor com que foi montado — o controle
    // parece morto e nao ha erro nenhum pra investigar.
    olhos: ['olhos', 'palpebra', 'skin', 'cabeca'],
    sobrancelha: ['sobrancelha', 'corCabelo', 'cabeca'],
    boca: ['boca', 'corCabelo', 'skin', 'cabeca'],
    nariz: ['nariz', 'skin', 'cabeca'],
    barba: ['barba', 'corBarba', 'corCabelo', 'cabeca'],
    chapeu: ['chapeu', 'corCabelo', 'cabeca'],
    blusa: ['blusa', 'shirt'],
    calca: ['calca', 'pants'],
    calcado: ['calcado', 'shoes'],
    colar: ['colar'],
    anelAcess: ['anelAcess'],
    tatuagem: ['tatuagem', 'skin'],
    relogio: ['relogio'],
    // Sem entrada pra 'jaqueta': trocar esse campo nao reconstroi nada, porque
    // nao ha mais slot pra ele. Quem quer casaco escolhe uma BLUSA.
  }

  function applyColors() {
    refreshMats()
    for (const t of tinted) t.mesh.material = M[t.tone]
  }

  // As caixas sao de modulo, e nao locais: acomodar() roda a cada troca de
  // aparencia e alocar dois Box3 por clique so pra medir seria lixo de graca.
  // As caixas de cabelo/chapeu/cranio sairam junto com a versao por BOUNDING
  // BOX de acomodarCabeloSobOChapeu: a conta agora e por vertice contra o pano
  // medido, e caixa nao diz nada sobre a forma do que esta dentro dela.
  const _pontoJunta = new THREE.Vector3()

  /**
   * O CHAPEU TAPA O CABELO POR CIMA.
   *
   * O problema: cada bone declara a propria folga sobre o cranio (o bone
   * vermelho usa 1.13) e essa folga foi medida contra o CABELO CURTO, cuja
   * casca e 1.078. Corte grande nao cabe la dentro: os espetos saem a 1.5 do
   * raio do cranio e o afro e mais largo que a copa, entao a mecha atravessa o
   * pano e o boneco fica de cabelo POR CIMA do bone. Foi o que o dono do
   * projeto viu na tela.
   *
   * A correcao nao e por peca, e por MEDIDA: o penteado inteiro e achatado em
   * Y ate o topo dele entrar debaixo do topo do chapeu. Achatar em volta da
   * junta da cabeca (que e a origem do slot) faz o certo nas duas pontas — a
   * mecha de cima desce pra dentro da copa e o cabelo comprido encurta um
   * pouco, que e exatamente o que cabelo enfiado embaixo de um bone faz.
   *
   * Por que MEDIR e nao marcar cada chapeu na mao:
   *  - um chapeu novo passa a funcionar sem ninguem lembrar de marcar nada;
   *  - a conta e a mesma pros 13 formatos de cabeca (cranio alto pede mais
   *    achatamento que cranio baixo, e a medida sabe disso sozinha).
   *
   * Faixa de cabelo, tiara e viseira NAO achatam nada: o topo delas fica
   * ABAIXO do alto do cranio, entao nao ha o que tapar — e o teste e esse
   * mesmo, comparar o topo do chapeu com o topo da cabeca nua.
   *
   * O piso de 0.55 existe pra um caso so: peca rasa marcada como copa. Sem ele
   * a conta mandaria k = 0.2 e o cabelo viraria uma pelicula pintada no cranio.
   */
  // Tabela da CAVIDADE do chapeu: raio do pano por direcao. Sao AZ_N x TH_N
  // amostras, medidas por raio contra a malha, uma vez por acomodacao. Um raio
  // por vertice de cabelo seria o certo e e caro demais (o cabelo passa de 10
  // mil vertices e isto roda a cada clique no customizador); uma tabela de 336
  // direcoes com busca pelo vizinho mais permissivo da o mesmo resultado
  // visual por 3% do custo.
  const CAV_AZ = 24
  const CAV_TH = 14
  const CAV_TH_MAX = 1.95           // um pouco abaixo do equador do cranio
  const _cav = new Float32Array(CAV_AZ * CAV_TH)
  const _malhasCabelo = []
  const _mParaJunta = new THREE.Matrix4()
  const _mDaJunta = new THREE.Matrix4()
  const _mJuntaInv = new THREE.Matrix4()
  const _cxOlhos = new THREE.Box3()
  const _pw = new THREE.Vector3()

  /** Junta as malhas visiveis de um slot (o chapeu monta varias pecas). */
  function malhasDe(kind, saida) {
    saida.length = 0
    for (const o of pecasDe(kind)) {
      o.traverse((x) => {
        if (x.isMesh && x.visible && x.geometry && x.geometry.attributes.position) saida.push(x)
      })
    }
    return saida
  }

  /**
   * Mede o pano do chapeu em CAV_AZ x CAV_TH direcoes em volta da junta da
   * cabeca. Guarda o raio do primeiro toque vindo DE FORA (a parede de dentro
   * da copa) ou 0 onde o chapeu nao cobre. O raio vem de fora e nao de dentro
   * pela mesma razao do colar e da sobrancelha: o pano tem uma face so, e um
   * raio saindo do cranio o atravessaria sem ver nada.
   */
  function medirCavidade(malhas) {
    for (let ti = 0; ti < CAV_TH; ti++) {
      const th = (ti / (CAV_TH - 1)) * CAV_TH_MAX
      const st = Math.sin(th), ct = Math.cos(th)
      for (let ai = 0; ai < CAV_AZ; ai++) {
        const az = (ai / CAV_AZ) * Math.PI * 2
        _rDir.set(st * Math.sin(az), ct, st * Math.cos(az))
        _rOrig.copy(_pontoJunta).addScaledVector(_rDir, 0.9)
        _rDirNeg.copy(_rDir).negate()
        _raio.set(_rOrig, _rDirNeg)
        _raio.far = 1.4
        const toques = _raio.intersectObjects(malhas, false)
        let R = 0
        for (let k = 0; k < toques.length; k++) {
          _pv.copy(toques[k].point).sub(_pontoJunta)
          // do MESMO lado: o raio atravessa a cabeca inteira e sai pela nuca,
          // e o pano de la nao diz nada sobre este lado
          if (_pv.dot(_rDir) <= 0) continue
          R = _pv.length()
          break
        }
        _cav[ti * CAV_AZ + ai] = R
      }
    }
  }

  /**
   * Raio do pano na direcao (theta, az), ou 0 se o chapeu nao cobre ali.
   *
   * Pega o MAIOR dos quatro vizinhos, e nao a media: na BORDA do chapeu metade
   * dos vizinhos vale 0 ("sem pano"), e interpolar contra o zero puxaria o
   * limite pra dentro do cranio bem na aba — o cabelo da testa sumiria. Sendo
   * permissivo na borda, o unico erro possivel e deixar passar um fio a mais
   * onde o pano acaba, que e exatamente onde cabelo aparecendo E o certo.
   */
  function raioCavidade(theta, az) {
    if (theta > CAV_TH_MAX) return 0
    const ft = (theta / CAV_TH_MAX) * (CAV_TH - 1)
    const fa = (az / (Math.PI * 2)) * CAV_AZ
    const t0 = Math.max(0, Math.min(CAV_TH - 1, Math.floor(ft)))
    const t1 = Math.min(CAV_TH - 1, t0 + 1)
    let a0 = Math.floor(fa) % CAV_AZ
    if (a0 < 0) a0 += CAV_AZ
    const a1 = (a0 + 1) % CAV_AZ
    const r = Math.max(
      _cav[t0 * CAV_AZ + a0], _cav[t0 * CAV_AZ + a1],
      _cav[t1 * CAV_AZ + a0], _cav[t1 * CAV_AZ + a1],
    )
    return r
  }

  /**
   * O CHAPEU NAO PODE CORTAR O OLHO.
   *
   * A queixa do dono, com todas as letras: "as vezes alguns chapeus tampam um
   * pouco o olho, e o olho passa um pouco acima do chapeu aparecendo um olho
   * dentro do chapeu".
   *
   * A causa e geometrica e nao e culpa de nenhum chapeu em particular: o olho
   * deste personagem e uma BOLA DE DESENHO de 8 cm que se projeta bem alem da
   * superficie do cranio, e todo chapeu assenta NO cranio. Aba de bone e barra
   * de gorro passam entao por dentro da bola, e o pedaco de olho que fica do
   * lado de fora do pano aparece flutuando sobre o chapeu.
   *
   * Empurrar o OLHO (que e o que se faz com a sobrancelha, logo abaixo) esta
   * fora de questao: olho e a cara do boneco, nao um acessorio. Quem cede e o
   * chapeu — ele SOBE ate a beirada dele passar acima do topo da bola.
   *
   * O teste olha so o pano que esta POR CIMA DO OLHO em planta (a menos de
   * 5 cm do centro da bola em X e Z). Sem esse recorte, a aba comprida de um
   * chapeu de cowboy — que fica longe do rosto e nao encosta em nada —
   * levantaria o chapeu inteiro 4 cm sem precisar.
   */
  function levantarChapeuAcimaDosOlhos() {
    const cha = slots.chapeu
    if (!cha) return
    cha.position.y = 0                    // sempre do zero: a conta e idempotente
    const olh = slots.olhos
    if (!cha.children.length || !olh || !olh.children.length) return
    if (!malhasDe('chapeu', _malhasChapeu).length) return

    root.updateWorldMatrix(true, true)
    head.getWorldPosition(_pontoJunta)
    _mJuntaInv.copy(head.matrixWorld).invert()

    // topo da bola do olho e o centro dela, no espaco da JUNTA da cabeca
    _cxOlhos.setFromObject(olh)
    if (_cxOlhos.isEmpty()) return
    _pa.copy(_cxOlhos.max).applyMatrix4(_mJuntaInv)
    _pb.copy(_cxOlhos.min).applyMatrix4(_mJuntaInv)
    const topoOlho = Math.max(_pa.y, _pb.y)
    const zOlho = (_pa.z + _pb.z) / 2
    const xOlho = Math.max(Math.abs(_pa.x), Math.abs(_pb.x)) * 0.6

    // menor Y do pano que passa POR CIMA do olho, no mesmo espaco
    let baixoChapeu = Infinity
    for (let mi = 0; mi < _malhasChapeu.length; mi++) {
      const m = _malhasChapeu[mi]
      _mParaJunta.multiplyMatrices(_mJuntaInv, m.matrixWorld)
      const pos = m.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        _pv.fromBufferAttribute(pos, i).applyMatrix4(_mParaJunta)
        if (_pv.y > topoOlho + 0.09) continue           // teto: pano bem acima nao conta
        if (Math.abs(_pv.z - zOlho) > 0.05) continue
        if (Math.abs(Math.abs(_pv.x) - xOlho) > 0.05) continue
        if (_pv.y < baixoChapeu) baixoChapeu = _pv.y
      }
    }
    if (!isFinite(baixoChapeu)) return                  // nada por cima do olho

    // 4 mm de folga: encostar exato deixa o pano e a bola brigando no z-buffer
    const falta = (topoOlho + 0.004) - baixoChapeu
    if (falta <= 0) return
    // TETO DE 2,5 cm, e ele e uma REDE DE SEGURANCA, nao a correcao.
    //
    // A medida (tools/diag-chapeu.mjs) diz que o topo da bola do olho fica em
    // y = 0.132 e que os chapeus assentavam entre 0.083 e 0.122 — ou seja,
    // faltavam de 1 a 5 cm em TODOS eles. Levantar 5 cm um gorro faria o gorro
    // flutuar acima do cranio, que e um defeito pior que o que se conserta.
    //
    // Entao a regra do catalogo passou a ser: TODO CHAPEU NASCE COM A BORDA
    // ACIMA DE y = 0.136 (o topo do olho mais folga). Este empurrao existe pro
    // caso que sobra — a cabeca 'comprida' e mais alta que a media e leva o
    // olho junto — e pra um chapeu novo que erre a medida por pouco.
    cha.position.y = Math.min(falta, 0.025)
  }

  /**
   * O CHAPEU TAPA TUDO QUE ESTA ACIMA DELE.
   *
   * O pedido do dono: "o chapeu deve servir como algo que tampa tudo,
   * aparecendo apenas os cabelos e a forma lateral do cabelo".
   *
   * A versao anterior achatava o penteado inteiro em Y (uma escala no slot) ate
   * o topo dele passar por baixo do topo do chapeu. Resolvia o espeto que
   * aponta pra CIMA e nao o que aponta pra FORA, encolhia junto o cabelo que
   * deveria aparecer pelos lados, e desistia de agir em qualquer chapeu cuja
   * copa nao passasse de 62% da altura do cranio — ou seja, justamente nos
   * bones e chapeus de aba, que sao os que o cabelo furava.
   *
   * Agora a conta e por VERTICE e contra o PANO DE VERDADE: mede-se a cavidade
   * do chapeu por raio (medirCavidade) e cada vertice de cabelo que estiver
   * mais longe do centro do cranio do que o pano naquela direcao e trazido pra
   * 4 mm por dentro dele. Onde nao ha chapeu (os lados, a nuca, abaixo da aba)
   * a tabela devolve 0 e o vertice fica exatamente onde estava — que e o que
   * faz o cabelo continuar aparecendo por baixo e pelos lados.
   *
   * A POSICAO ORIGINAL FICA GUARDADA na geometria. Trocar de chapeu NAO
   * reconstroi o cabelo (ver DEPENDE), entao sem a copia o penteado herdaria o
   * aperto do chapeu anterior e iria encolhendo a cada troca.
   */
  function acomodarCabeloSobOChapeu() {
    levantarChapeuAcimaDosOlhos()

    const cab = slots.cabelo
    if (!cab) return
    cab.scale.set(1, 1, 1)                // a escala da versao antiga saiu
    if (!cab.children.length) return
    if (!malhasDe('cabelo', _malhasCabelo).length) return

    const cha = slots.chapeu
    const temChapeu = !!(cha && cha.children.length
      && malhasDe('chapeu', _malhasChapeu).length)

    root.updateWorldMatrix(true, true)
    head.getWorldPosition(_pontoJunta)
    _mJuntaInv.copy(head.matrixWorld).invert()
    if (temChapeu) medirCavidade(_malhasChapeu)

    for (let mi = 0; mi < _malhasCabelo.length; mi++) {
      const m = _malhasCabelo[mi]
      const geo = m.geometry
      const pos = geo.attributes.position
      // copia pristina: a conta parte SEMPRE dela, nunca do estado anterior
      let orig = geo.userData.posSemChapeu
      if (!orig || orig.length !== pos.array.length) {
        orig = geo.userData.posSemChapeu = Float32Array.from(pos.array)
      }
      if (!temChapeu) {
        // sem chapeu: devolve o penteado inteiro e vai pro proximo
        pos.array.set(orig)
        pos.needsUpdate = true
        continue
      }
      _mParaJunta.multiplyMatrices(_mJuntaInv, m.matrixWorld)
      _mDaJunta.copy(_mParaJunta).invert()
      let mexeu = false
      for (let i = 0; i < pos.count; i++) {
        const o = i * 3
        _pv.set(orig[o], orig[o + 1], orig[o + 2]).applyMatrix4(_mParaJunta)
        const r = _pv.length()
        if (r < 0.02) { pos.setXYZ(i, orig[o], orig[o + 1], orig[o + 2]); continue }
        const theta = Math.acos(Math.max(-1, Math.min(1, _pv.y / r)))
        let az = Math.atan2(_pv.x, _pv.z)
        if (az < 0) az += Math.PI * 2
        const R = raioCavidade(theta, az)
        if (R <= 0 || r <= R - 0.004) {
          pos.setXYZ(i, orig[o], orig[o + 1], orig[o + 2])
          continue
        }
        _pv.multiplyScalar((R - 0.004) / r).applyMatrix4(_mDaJunta)
        pos.setXYZ(i, _pv.x, _pv.y, _pv.z)
        mexeu = true
      }
      pos.needsUpdate = true
      if (mexeu) geo.computeBoundingSphere()
    }
  }

  // --- colar por cima da roupa ---------------------------------------------
  const _raio = new THREE.Raycaster()
  const _rOrig = new THREE.Vector3()
  const _rDir = new THREE.Vector3()
  const _pv = new THREE.Vector3()
  const _mNeck = new THREE.Matrix4()
  const _malhasRoupa = []
  const _malhasColar = []
  const _malhasChapeu = []
  const _malhasSobr = []
  const _rDirNeg = new THREE.Vector3()
  const _dirPior = new THREE.Vector3()
  const _mFaceInv = new THREE.Matrix4()
  const _pa = new THREE.Vector3()
  const _pb = new THREE.Vector3()

  /**
   * O COLAR TEM QUE SOBRESAIR A ROUPA, SEMPRE.
   *
   * A regra ja estava escrita em roupas.js e nao estava sendo cumprida: o
   * catalogo de blusa cresceu pra 19 pecas (paleto, blusao, moletom com capuz,
   * gola alta) e as constantes de raio do colar continuaram as de quando havia
   * seis camisetas. Medindo os 190 pares blusa x colar por raio, seis dos dez
   * colares ficavam ENTERRADOS - a gargantilha 26 mm dentro do pano em todas
   * as blusas, o cordao grosso ate 58 mm. Era a queixa "alguns nao estao
   * sobresaindo a camisa, entao nao esta mostrando".
   *
   * Ajustar peca por peca resolveria os dez de hoje e voltaria a quebrar na
   * proxima jaqueta do catalogo. Entao aqui nao ha numero de raio nenhum: o
   * codigo MEDE onde esta a superficie da roupa e abre o colar ate pousar
   * sobre ela.
   *
   * Como se mede: pra cada ponto do colar tira-se o angulo em volta do pescoco
   * e joga-se um raio DE FORA PRA DENTRO nesse mesmo angulo e altura. O
   * primeiro toque e a cara de fora do pano naquele ponto. De fora pra dentro,
   * e nao o contrario, porque o tecido e de uma face so: um raio saindo de
   * dentro atravessaria o pano sem ver nada.
   *
   * O ajuste e uma ESCALA em X/Z do slot inteiro, e nao um empurrao em Z. O
   * cordao e um anel centrado no pescoco; empurrar pra frente o faria sair
   * pelas costas. Abrir o anel e o que uma corrente faz de verdade quando se
   * veste um casaco por baixo dela.
   */
  /**
   * A SOBRANCELHA NAO PODE ATRAVESSAR O CHAPEU.
   *
   * A sobrancelha e uma barra curva extrudada 2,4 cm PRA FORA do cranio, e o
   * chapeu e uma calota com folga fixa sobre o mesmo cranio. Nas cabecas
   * redondas os dois nao se encontram; nas altas e largas, sim. Varrendo os
   * 1040 pares (13 cabecas x 10 sobrancelhas x 8 chapeus de copa), 235 tinham a
   * sobrancelha PRA FORA do pano — em 42 mm no pior caso, com o bone vermelho
   * na cabeca 12: duas barras pretas desenhadas por cima da copa, flutuando.
   *
   * A correcao e um EMPURRAO, e nao uma escala. Escalar o slot em volta do
   * centro do cranio resolveria o raio, mas encolheria a sobrancelha e a
   * arrastaria 3 cm PRA BAIXO junto — ela ia parar em cima da palpebra.
   *
   * E o empurrao segue a DIRECAO RADIAL do pior ponto, nao um -Z fixo. A
   * primeira versao empurrava so pra tras e resolveu 144 dos 235 pares; os 91
   * que sobraram eram sobrancelha alta com chapeu de aba, onde a barra fura a
   * COPA por cima e nao a aba pela frente — empurrar pra tras nao tira nada de
   * cima. Seguindo o raio, o mesmo codigo empurra pra tras quem fura pela
   * frente e pra baixo-e-pra-tras quem fura por cima.
   *
   * A conta faz sozinha as duas coisas certas:
   *   sobra de 2 mm  -> empurrao de 2 mm: some a briga de z-buffer e a
   *                     sobrancelha continua a vista sob a aba;
   *   sobra de 4 cm  -> empurrao de 4 cm: a barra entra no cranio e desaparece,
   *                     que e exatamente o que se ve quando alguem enfia o bone
   *                     ate a sobrancelha.
   *
   * O teto de 6 cm existe pro caso degenerado (chapeu que envolve a cara toda):
   * empurrar mais que isso levaria a sobrancelha pra fora da nuca.
   */
  function acomodarSobrancelhaSobOChapeu() {
    const so = slots.sobrancelha
    if (!so) return
    so.position.set(0, 0, 0)              // sempre do zero: a conta e idempotente
    const cha = slots.chapeu
    if (!cha || !cha.children.length || !so.children.length) return

    _malhasChapeu.length = 0
    for (const o of pecasDe('chapeu')) {
      o.traverse((x) => { if (x.isMesh && x.visible) _malhasChapeu.push(x) })
    }
    if (!_malhasChapeu.length) return

    _malhasSobr.length = 0
    so.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.attributes.position) _malhasSobr.push(o)
    })
    if (!_malhasSobr.length) return

    root.updateWorldMatrix(true, true)
    head.getWorldPosition(_pontoJunta)    // a junta da cabeca E o centro do cranio

    let falta = 0
    for (let mi = 0; mi < _malhasSobr.length; mi++) {
      const m = _malhasSobr[mi]
      const pos = m.geometry.attributes.position
      // QUAIS VERTICES TESTAR.
      //
      // Nao da pra jogar um raio de cada um dos ~1070 vertices de cada barra: no
      // customizer isso roda a cada clique, e 3 mil raios contra a malha do
      // chapeu travariam a interface. E nao da pra pegar de N em N: o ponto que
      // fura e UM canto, e passo largo pula justamente ele — medido, com passo
      // de 66 a unibrow na cartola dava "0 de sobra" e com passo de 53 dava
      // 36,4 mm. Amostra que depende de sorte nao e medida.
      //
      // Entao o teste vai so nos vertices MAIS EXTERNOS. O furo e um excesso de
      // RAIO em volta do cranio, e a casca do chapeu e lisa: onde o raio do
      // vertice e maximo e onde a sobra e maxima. Uma passada barata (so
      // distancia, sem raio nenhum) acha o raio maximo; a segunda so lanca raio
      // nos que estao a menos de 12 mm dele.
      let rMax = 0
      for (let i = 0; i < pos.count; i++) {
        _pv.fromBufferAttribute(pos, i)
        m.localToWorld(_pv)
        const rr = _pv.distanceTo(_pontoJunta)
        if (rr > rMax) rMax = rr
      }
      const corte = rMax - 0.012
      for (let i = 0; i < pos.count; i++) {
        _pv.fromBufferAttribute(pos, i)
        m.localToWorld(_pv)
        _rDir.copy(_pv).sub(_pontoJunta)
        const r = _rDir.length()
        if (r < corte || r < 0.02) continue
        _rDir.divideScalar(r)
        // De FORA pra dentro: o pano do chapeu e de uma face so, e um raio
        // saindo do cranio atravessaria ele sem ver nada.
        _rOrig.copy(_pontoJunta).addScaledVector(_rDir, 0.9)
        _rDirNeg.copy(_rDir).negate()
        _raio.set(_rOrig, _rDirNeg)
        _raio.far = 1.4
        const toques = _raio.intersectObjects(_malhasChapeu, false)
        if (!toques.length) continue      // aqui o chapeu nao cobre: nada a fazer
        // O toque tem que estar do MESMO LADO da cabeca que a sobrancelha. O
        // raio entra pela frente e sai pela nuca, e se nao houver pano na frente
        // ele vai encontrar o capuz do moletom LA ATRAS — com raio menor que o
        // da sobrancelha, o que a conta leria como "a sobrancelha furou o
        // capuz". Foram 46 falsos positivos so por causa disso.
        _pv.copy(toques[0].point).sub(_pontoJunta)
        if (_pv.dot(_rDir) <= 0) continue
        const R = _pv.length()
        // 3 mm por dentro do pano, pela mesma razao do colar: encostar exato
        // deixa as duas superficies brigando e piscando com a camera.
        const d = r - R + 0.003
        if (d > falta) { falta = d; _dirPior.copy(_rDir) }
      }
    }
    if (falta > 0) {
      // A direcao vem do MUNDO e o slot mora no espaco da face: sem converter,
      // um personagem virado de costas teria a sobrancelha empurrada pra frente.
      _dirPior.transformDirection(_mFaceInv.copy(face.matrixWorld).invert())
      so.position.copy(_dirPior).multiplyScalar(-Math.min(0.06, falta))
    }
  }

  function acomodarColarSobreARoupa() {
    const col = slots.colar
    if (!col || !col.children.length) return

    // Sempre do estado ORIGINAL. Trocar so de blusa nao reconstroi o colar
    // (DEPENDE.colar so olha 'colar'), entao sem isto o ajuste da camisa
    // anterior somaria com o desta e o cordao ia crescendo a cada clique.
    _malhasColar.length = 0
    col.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return
      let base = o.userData.colarBase
      if (!base) {
        base = { px: o.position.x, pz: o.position.z, sx: o.scale.x, sz: o.scale.z }
        o.userData.colarBase = base
      }
      o.position.x = base.px; o.position.z = base.pz
      o.scale.x = base.sx; o.scale.z = base.sz
      _malhasColar.push(o)
    })
    if (!_malhasColar.length) return

    _malhasRoupa.length = 0
    for (const k of ['blusa', 'jaqueta']) {
      for (const o of pecasDe(k)) o.traverse((x) => { if (x.isMesh && x.visible) _malhasRoupa.push(x) })
    }
    if (!_malhasRoupa.length) return

    root.updateWorldMatrix(true, true)
    _mNeck.copy(neck.matrixWorld).invert()

    for (let mi = 0; mi < _malhasColar.length; mi++) {
      const o = _malhasColar[mi]
      const pos = o.geometry.attributes.position
      const passo = Math.max(1, Math.floor(pos.count / 20))
      let n = 0, somaR = 0, somaX = 0, somaZ = 0, falta = 0
      for (let i = 0; i < pos.count; i += passo) {
        _pv.fromBufferAttribute(pos, i)
        o.localToWorld(_pv)
        _pv.applyMatrix4(_mNeck)
        if (_pv.z <= 0.004) continue              // costas: ninguem ve
        const r = Math.hypot(_pv.x, _pv.z)
        if (r < 0.004) continue                   // em cima do eixo: sem direcao
        n++; somaR += r; somaX += _pv.x; somaZ += _pv.z
        const ang = Math.atan2(_pv.x, _pv.z)
        const sx = Math.sin(ang), sz = Math.cos(ang)
        _rOrig.set(sx * 0.9, _pv.y, sz * 0.9).applyMatrix4(neck.matrixWorld)
        _rDir.set(-sx, 0, -sz).transformDirection(neck.matrixWorld).normalize()
        _raio.set(_rOrig, _rDir)
        _raio.far = 1.8
        const toques = _raio.intersectObjects(_malhasRoupa, false)
        if (!toques.length) continue
        _pv.copy(toques[0].point).applyMatrix4(_mNeck)
        // 3 mm por fora do pano: menos que isso e o metal briga com o tecido no
        // z-buffer e pisca conforme a camera anda.
        const d = Math.hypot(_pv.x, _pv.z) + 0.003 - r
        if (d > falta) falta = d
      }
      if (!n || falta <= 0) continue
      // Teto de 3 cm: numa peca muito volumosa a conta pediria um aro de
      // palhaco. Preso aqui sobra alguma coisa enterrada no caso extremo, e
      // isso e melhor que um cordao de 25 cm de diametro boiando no peito.
      if (falta > 0.030) falta = 0.030

      const rBar = somaR / n
      const cx = somaX / n, cz = somaZ / n
      const rc = Math.hypot(cx, cz)

      // Duas familias de peca, e elas pedem correcoes OPOSTAS.
      //
      // ANEL EM VOLTA DO PESCOCO (corrente, gargantilha): o centro dele esta no
      // eixo, entao nao ha pra onde empurrar - empurrar pra frente faria o aro
      // sair pelas costas. O que se faz e ABRIR o aro.
      //
      // PECA SOLTA NA FRENTE (pingente, crucifixo, gravata): o centro dela ja
      // esta fora do eixo. Abrir escalaria o desenho junto; o certo e
      // EMPURRAR ela pra fora, na propria direcao radial.
      if (rc < rBar * 0.4) {
        const f = (rBar + falta) / rBar
        o.scale.x *= f
        o.scale.z *= f
        continue
      }
      // O empurrao e calculado em espaco do PESCOCO e convertido pro espaco do
      // PAI da peca: crucifixo e gravata moram dentro de grupos girados, e somar
      // o vetor direto na posicao mandaria a peca pro lado.
      _pa.set(0, 0, 0)
      _pb.set((cx / rc) * falta, 0, (cz / rc) * falta)
      neck.localToWorld(_pa)
      neck.localToWorld(_pb)
      o.parent.worldToLocal(_pa)
      o.parent.worldToLocal(_pb)
      o.position.x += _pb.x - _pa.x
      o.position.z += _pb.z - _pa.z
    }
  }

  function setAppearance(next) {
    const prev = Object.assign({}, app)
    aplicar(app, next)
    if (prev.skin !== app.skin || prev.shirt !== app.shirt
      || prev.pants !== app.pants || prev.shoes !== app.shoes) applyColors()
    if (prev.cabeca !== app.cabeca) rebuildCabeca()
    let mexeu = false
    for (const kind of ORDEM) {
      const deps = DEPENDE[kind]
      let mudou = false
      for (const d of deps) if (prev[d] !== app[d]) { mudou = true; break }
      if (!mudou) continue
      rebuild(kind)
      mexeu = true
    }
    // FORA do laco: mesmo trocando um campo so, a cobertura reaplicada e a
    // INTEIRA, nunca a do campo que mudou. Trocar jaqueta por regata mexe na
    // pele do braco, que pertence a peca ANTERIOR — cobertura parcial deixaria
    // o braco escondido debaixo de uma manga que nao existe mais.
    if (mexeu) aplicarCobertura()
    // SEMPRE, e nao so quando `mexeu`: trocar de chapeu sem trocar de cabelo
    // (ou o contrario) muda a relacao entre os dois, e o slot que nao foi
    // reconstruido ainda esta com o achatamento do chapeu ANTERIOR.
    acomodarCabeloSobOChapeu()
    acomodarSobrancelhaSobOChapeu()
    acomodarColarSobreARoupa()
    return app
  }

  // montagem inicial: cabeca, todos os slots na ORDEM de camadas e SO ENTAO a
  // cobertura, pela mesma razao do setAppearance.
  rebuildCabeca()
  for (const kind of ORDEM) rebuild(kind)
  aplicarCobertura()
  acomodarCabeloSobOChapeu()
  acomodarSobrancelhaSobOChapeu()
  acomodarColarSobreARoupa()

  // --- API ------------------------------------------------------------------

  /**
   * Pra onde a cabeca olha, em relacao ao tronco.
   *
   * O GIRO E REPARTIDO ENTRE PESCOCO E CABECA, e nao todo na cabeca. Girar 60
   * graus so no headPivot faz o cranio torcer sobre um pescoco parado — que era
   * exatamente a queixa ("ele simplesmente teleporta a cabeca de um lado para o
   * outro"): alem do salto, o gesto nao tinha corpo. Num pescoco de verdade a
   * base gira junto, e o mesmo angulo repartido em duas juntas le como olhar em
   * vez de como torcicolo.
   *
   * A repartição e 38% no pescoco e 62% na cabeca — mais na cabeca porque as
   * vertebras de cima e que giram mais.
   *
   * O pescoco e ESCRITO POR CIMA do que o animador acabou de por nele (o
   * animador roda antes, no mesmo quadro, e escreve rotacao ABSOLUTA a partir da
   * pose base). Somar aqui e seguro justamente por isso: a soma nao acumula, ela
   * e refeita do zero a cada quadro. Se algum dia alguem chamar setHeadLook sem
   * ter rodado o animador antes, o pescoco vai acumular — a ordem importa.
   */
  function setHeadLook(pitch, yaw) {
    const py = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, pitch || 0))
    const yw = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, yaw || 0))
    // 38% na base do pescoco, 62% na cabeca — as vertebras de cima e que giram
    // mais. Os dois sao ABSOLUTOS: nenhuma das duas juntas e escrita por mais
    // ninguem.
    neckLook.rotation.y = yw * 0.38
    neckLook.rotation.x = py * 0.38
    headPivot.rotation.x = py * 0.62
    headPivot.rotation.y = yw * 0.62
  }

  let bodyVisible = true
  function setVisibleBody(v) {
    bodyVisible = !!v
    // EM 1a PESSOA SOME O BONECO INTEIRO, e nao so a cabeca.
    //
    // A versao anterior escondia cabeca e pescoco e deixava tronco, bracos e
    // pernas — a escolha classica de FPS, "voce ve os seus bracos". Nao funciona
    // com ESTE boneco: a cabeca dele e uma esfera de 49 cm e a camera nasce
    // DENTRO dela, entao olhar pra baixo mostrava o tronco visto de dentro do
    // crânio, com o avesso do olho aparecendo pelo buraco do pescoco. E o que o
    // dono fotografou.
    //
    // Esconder o `root` (e nao cada malha) e de proposito: e uma linha so, pega
    // tambem tudo que os slots penduraram — chapeu, colar, relogio — e sobretudo
    // RESTAURA exato. Percorrer as malhas uma a uma com `visible = true` na volta
    // acenderia o cabelo escondido debaixo do chapeu e a peca que um `esconde`
    // tinha apagado de proposito.
    //
    // O preco: com `root.visible = false` o three pula o boneco tambem no mapa
    // de sombra, entao em 1a pessoa nao ha sombra do jogador no chao. Se ela
    // fizer falta, o caminho e um proxy simples so pra sombra — nao ha como
    // manter a sombra e sumir com a malha na mesma peca.
    root.visible = bodyVisible
  }

  function dispose() {
    for (const k in slots) if (slots[k].name === 'slot:' + k) clearSlot(k)
    for (const g of ownGeos) g.dispose()
    ownGeos.length = 0
    tinted.length = 0
    if (root.parent) root.parent.remove(root)
  }

  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale)

  /**
   * Todo objeto que pertence a um slot: o Group ancorado MAIS o que a peca
   * pendurou noutras juntas por ctx.montar() (tatuagem de braco, par de pes).
   *
   * Existe pro provador conseguir fotografar UMA peca sem o corpo em volta —
   * o card do colar tinha que mostrar o colar, e mostrava um busto inteiro com
   * um risco dourado de tres pixels no meio.
   */
  function pecasDe(kind) {
    const out = []
    const s = slots[kind]
    if (s && s.name === 'slot:' + kind) out.push(s)
    const m = montados[kind]
    if (m) for (const o of m) out.push(o)
    return out
  }

  return {
    root,
    height: PLAYER.HEIGHT,
    appearance: app,
    parts,
    slots,
    pecasDe,
    fpAnchor,
    headCenterY: HEAD_CENTER_Y,
    hipsY: HIPS_Y,
    setAppearance,
    setHeadLook,
    setVisibleBody,
    isBodyVisible: () => bodyVisible,
    dispose,
  }
}

// Nomes antigos (6 bytes) -> nomes do contrato de 20 campos.
//
// A TABELA E DE MAO UNICA DE PROPOSITO. Antes existiam as duas (ALIAS_EN e
// ALIAS_PT) e aplicar() escrevia OS DOIS nomes no alvo. Era esse o bug que o
// dono do projeto reportou: "quando clica nos olhos eles nao sao equipados no
// personagem; isso acontece com olhos, boca, cabelo, cor do cabelo e
// sobrancelha" — exatamente os cinco campos que tinham apelido.
//
// O mecanismo: character.appearance ficava com 'olhos' E 'eyes'. main.js guarda
// esse objeto e a tela de criacao trabalha sobre uma COPIA dele, entao a copia
// tambem tinha os dois. Ao clicar num olho, a tela escrevia so 'olhos: 2' — e
// mandava o objeto INTEIRO, com o 'eyes: 0' velho ainda dentro. aplicar()
// percorre `for (const k in patch)`, e 'eyes' vem depois de 'olhos' na ordem de
// insercao: chegava la, resolvia o apelido e escrevia olhos = 0 de volta.
// Sem erro nenhum no console; o olho simplesmente nao mudava.
//
// A regra agora e uma so: APELIDO E ENTRADA, NUNCA ESTADO. Quem manda
// { hair: 2 } (os NPCs de grocery.js e loja-jogos.js) continua funcionando,
// porque a leitura traduz; mas o que fica guardado no objeto e so o nome do
// contrato. E, pra nao herdar o problema de um objeto salvo antes desta
// correcao, aplicar() APAGA o apelido do alvo quando o encontra.
const ALIAS_EN = {
  hair: 'cabelo', eyes: 'olhos', brows: 'sobrancelha', mouth: 'boca',
  hairColor: 'corCabelo',
}

/**
 * Copia uma aparencia parcial resolvendo os apelidos EN -> PT e a pele.
 *
 * Ordem de resolucao dos apelidos: o nome do CONTRATO ganha sempre. Se o patch
 * trouxer 'olhos' e 'eyes' com valores diferentes (o caso do objeto salvo
 * antes da correcao), vale 'olhos'. Por isso os apelidos sao aplicados numa
 * SEGUNDA passada e so onde o patch nao trouxe o nome do contrato — e nao no
 * meio do laco, onde a ordem das chaves decidiria o resultado.
 *
 * Pele tem DOIS campos: 'pele' e indice de catalogo e 'skin' e cor crua, e o
 * patch quase sempre traz os DOIS (main.js guarda um objeto so e manda ele
 * inteiro). A regra e: QUEM MANDA E O INDICE. Cor crua so vale quando nao ha
 * indice nenhum no patch, que e como os NPCs da cidade pedem a pele deles.
 *
 * A regra ja foi "vale o que MUDOU", e isso tinha um buraco: o tom mudava
 * quando o jogador clicava no tom e VOLTAVA ao anterior no clique seguinte em
 * qualquer outra coisa, porque na copia da tela de criacao o 'skin' cru nunca
 * era atualizado e o skin velho ganhava.
 */
function aplicar(alvo, patch) {
  if (!patch) return alvo

  // 1a passada: os nomes do contrato.
  for (const k in patch) {
    const v = patch[k]
    if (v === undefined || ALIAS_EN[k] !== undefined) continue
    alvo[k] = v
  }

  // 2a passada: os apelidos, so onde o contrato nao falou.
  for (const k in patch) {
    const pt = ALIAS_EN[k]
    if (pt === undefined) continue
    const v = patch[k]
    if (v === undefined) continue
    if (patch[pt] === undefined) alvo[pt] = v
  }

  // O apelido nunca fica guardado. Um objeto que passou por uma versao antiga
  // deste arquivo (ou um save antigo) chega aqui com 'eyes'/'hair' dentro; se
  // ficassem, o proximo setAppearance que mandasse o objeto inteiro reviveria
  // o bug na hora.
  for (const k in ALIAS_EN) if (k in alvo) delete alvo[k]

  if (patch.pele !== undefined) alvo.skin = corPele(patch.pele)
  else if (patch.skin !== undefined) alvo.skin = corPele(patch.skin)
  return alvo
}

export { HEAD_CENTER_Y }
export const HAIR_COLORS = AP.HAIR_COLORS || []
