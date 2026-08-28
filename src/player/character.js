import * as THREE from 'three'
import { PLAYER } from '../config.js'
import * as mats from '../world/materials.js'
import * as AP from './appearance.js'
import * as ROUPAS from './roupas.js'

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

const LOOK_LIMIT = 0.6

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Junta: Group posicionado no ponto de rotacao. */
function joint(name, x, y, z, parent) {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, y, z)
  if (parent) parent.add(g)
  return g
}

/** Capsula: a junta fica no topo, o mesh desce a partir dela. */
function limbGeo(r, len, seg = 12) {
  return new THREE.CapsuleGeometry(r, len, 4, seg)
}

/** Perfil revolucionado e achatado em Z — torso conico cartoon. */
function latheGeo(profile, flatZ = FLAT_Z, seg = TORSO_SEG) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0008, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, seg)
  g.scale(1, 1, flatZ)
  g.computeVertexNormals()
  return g
}

// A barra da camiseta e a aresta larga em y = -0.008; abaixo dela o perfil so
// fecha o fundo. Antes o fundo era um domo alto e a camiseta virava um sino.
const PELVIS_PROFILE = [
  [0.020, -0.048], [0.086, -0.040], [0.116, -0.026], [0.126, -0.008],
  [0.130, 0.030], [0.134, 0.090], [0.128, 0.170], [0.124, 0.240], [0.130, 0.300],
]
// Termina em r=0.074 (e nao quase zero): a lathe deixa o decote aberto e o
// pescoco passa por ele. O ultimo trecho e o que a gola cobre.
const CHEST_PROFILE = [
  [0.130, 0.000], [0.140, 0.048], [0.144, 0.095], [0.140, 0.140],
  [0.122, 0.175], [0.095, 0.196], [0.074, 0.205],
]

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

/** Costura dois aneis. A fica no sentido +cross(u,v) em relacao a B. */
function costurar(ma, A, B) {
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length
    ma.quad(A[i], A[j], B[j], B[i])
  }
}

/** Tampa em leque no lado -cross(u,v) do anel (ponta do dedo, base da palma). */
function tampa(ma, A, cx, cy, cz) {
  const c = ma.v(cx, cy, cz)
  for (let i = 0; i < A.length; i++) ma.tri(c, A[i], A[(i + 1) % A.length])
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

// Aneis da palma (y, meia-espessura em X, meia-largura em Z). O primeiro fica
// DENTRO do antebraco de proposito: a emenda com o pulso nunca aparece.
const PALMA_ANEIS = [
  [0.012, 0.0185, 0.0300],
  [-0.012, 0.0210, 0.0360],
  [-0.038, 0.0220, 0.0405],
  [-0.062, 0.0215, 0.0410],
  [-0.080, 0.0195, 0.0390],
]

// Base dos quatro dedos na linha dos nos (x, y, z) + comprimento e raio.
// O indicador fica na FRENTE (+Z) porque a palma olha pro corpo.
const DEDOS = [
  { z: 0.0300, y: -0.076, comp: 0.052, raio: 0.0104, abre: 0.13 },  // indicador
  { z: 0.0100, y: -0.080, comp: 0.056, raio: 0.0106, abre: 0.04 },  // medio
  { z: -0.0100, y: -0.078, comp: 0.051, raio: 0.0100, abre: -0.05 }, // anelar
  { z: -0.0290, y: -0.072, comp: 0.042, raio: 0.0092, abre: -0.15 }, // minimo
]

/** Posicao do anel de acessorio: base do dedo anelar da mao (espaco do pulso). */
export const DEDO_ANELAR = { x: 0, y: DEDOS[2].y - 0.014, z: DEDOS[2].z }

function construirMao() {
  const ma = malha()
  const o = new THREE.Vector3()
  const U = new THREE.Vector3(1, 0, 0), V = new THREE.Vector3(0, 0, 1)
  let ant = null
  for (const [y, a, b] of PALMA_ANEIS) {
    o.set(0, y, 0)
    const A = anel(ma, o, U, V, a, b, 2.8, 8)
    if (ant) costurar(ma, ant, A)
    ant = A
  }
  tampa(ma, ant, 0, -0.089, 0.002)

  for (const d of DEDOS) {
    // dedo levemente aberto em leque (abre) alem da curva de repouso
    const dir = new THREE.Vector3(-0.10, -1, d.abre * 0.55).normalize()
    dedo(ma, new THREE.Vector3(0, d.y, d.z), dir, d.comp, 0.72, d.raio, 0.66)
  }
  // Polegar: encostado no lado da palma, apontando pra BAIXO e pra frente — e
  // a pose de mao relaxada. Apontando so pra frente (a primeira tentativa) ele
  // lia como uma tabua saindo do pulso.
  dedo(ma, new THREE.Vector3(-0.012, -0.033, 0.030),
    new THREE.Vector3(-0.30, -0.79, 0.53), 0.044, 0.78, 0.0146, 0.74, 6, 5, EIXO_POLEGAR, 2.0)

  return ma.geo()
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
      cabeca: 0, olhos: 0, pupila: 0, nariz: 0, boca: 0, barba: 0, cabelo: 0,
      pele: 0, corCabelo: 1, sobrancelha: 0, skin: corPele(0),
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

  const torsoNu = part(latheGeo(PELVIS_PROFILE), 'skin')
  torsoNu.scale.set(NU_S, 1, NU_S)
  torso.add(torsoNu)
  nu.torso.push(torsoNu)

  const peitoNu = part(latheGeo(CHEST_PROFILE), 'skin')
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
  // pescoco fino e curto: so uns 3 cm ficam entre a gola e o queixo
  const neckMesh = part(new THREE.CylinderGeometry(0.047, 0.058, 0.11, 14), 'skinDark')
  neckMesh.position.y = 0.030
  neck.add(neckMesh)

  const headPivot = joint('headPivot', 0, HEADPIVOT_Y, 0, neck)
  const head = joint('head', 0, HEAD.ry, 0, headPivot)

  // orelhas: a posicao e recalculada a cada troca de cabeca (ver posOrelhas)
  const earGeo = track(new THREE.SphereGeometry(1, 14, 10))
  const orelhas = []
  for (const sgn of [1, -1]) {
    const ear = part(earGeo, 'skinDark', false)
    ear.scale.set(0.019 * HEAD_S, 0.045 * HEAD_S, 0.033 * HEAD_S)
    ear.rotation.z = sgn * 0.12
    ear.userData.sgn = sgn
    head.add(ear)
    orelhas.push(ear)
  }

  /**
   * Poe a orelha NA superficie do cranio ativo. Sao 8 formatos de cabeca: uma
   * posicao fixa deixaria a orelha flutuando na cabeca estreita e enterrada na
   * quadrada. eggSurface conhece o cranio que acabou de ser montado.
   */
  function posOrelhas() {
    for (const ear of orelhas) {
      const sgn = ear.userData.sgn
      if (typeof AP.eggSurface === 'function') {
        // theta 1.61 = pouco abaixo do equador; az +-1.75 = lateral, ja indo
        // pra tras (no lugar antigo a orelha nascia no meio da bochecha)
        AP.eggSurface(1.61, sgn * 1.75, 0.985, ear.position)
      } else {
        ear.position.set(sgn * 0.1225 * HEAD_S, -0.008 * HEAD_S, -0.045 * HEAD_S)
      }
    }
  }

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
  // Capsula do braco encurtada em cima: se o topo passar do domo da manga
  // (+0.026 acima da junta) aparece um triangulo de pele no ombro.
  const upperArmGeo = track(limbGeo(0.045, 0.225))
  // Antebraco encurtado nas duas pontas pra capsula MORRER no pulso: a bola de
  // 4 cm que sobrava antes empurrava a mao pra baixo e comia a palma.
  const foreArmGeo = track(limbGeo(0.041, FORE_ARM - 0.082))
  const elbowGeo = track(new THREE.SphereGeometry(0.042, 12, 8))

  function buildArm(sgn, side) {
    const up = joint('arm' + side + 'Upper', sgn * SHOULDER_X, SHOULDER_Y, 0, chest)
    const upMesh = part(upperArmGeo, 'skin', false)
    upMesh.position.y = -0.1375   // topo em +0.020, base em -0.295 (dentro do cotovelo)
    up.add(upMesh)
    nu.braco.push(upMesh)

    const low = joint('arm' + side + 'Lower', 0, -UPPER_ARM, 0, up)
    low.add(part(elbowGeo, 'skin', false))
    const lowMesh = part(foreArmGeo, 'skin', false)
    lowMesh.position.y = -FORE_ARM / 2
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
  const thighGeo = track(limbGeo(0.052, THIGH, 14))
  const shinGeo = track(limbGeo(0.045, SHIN, 14))
  const kneeGeo = track(new THREE.SphereGeometry(0.048, 12, 8))
  // Pe descalco: bloco baixo com o dedao arredondado, plantado no chao. seg = 1
  // no roundedBox porque o padrao (3) gera bevel de 3 aneis e curva de 5 — 2 mil
  // triangulos por pe, num pedaco que so aparece quando o personagem esta
  // descalco e que a 3 m de distancia tem 20 pixels.
  const peGeo = track(mats.roundedBox(0.082, 0.070, 0.190, 0.030, M.skin, 1).geometry)
  const dedaoGeo = track(new THREE.SphereGeometry(1, 12, 8))

  function buildLeg(sgn, side) {
    const up = joint('leg' + side + 'Upper', sgn * HIP_X, 0, 0, hips)
    const upMesh = part(thighGeo, 'skin', false)
    upMesh.position.y = -THIGH / 2
    up.add(upMesh)
    nu.coxa.push(upMesh)

    const low = joint('leg' + side + 'Lower', 0, -THIGH, 0, up)
    low.add(part(kneeGeo, 'skin', false))
    const lowMesh = part(shinGeo, 'skin', false)
    lowMesh.position.y = -SHIN / 2
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
    hips, torso, chest, neck, head, headPivot, face,
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
      cabeca: app.cabeca, head: app.cabeca,
      olhos: app.olhos, eyes: app.olhos,
      pupila: app.pupila, pupil: app.pupila,
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
    posOrelhas()
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
    olhos: ['olhos', 'pupila', 'skin', 'cabeca'],
    sobrancelha: ['sobrancelha', 'corCabelo', 'cabeca'],
    boca: ['boca', 'corCabelo', 'skin', 'cabeca'],
    nariz: ['nariz', 'skin', 'cabeca'],
    barba: ['barba', 'corCabelo', 'cabeca'],
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
  const _cxCabelo = new THREE.Box3()
  const _cxChapeu = new THREE.Box3()
  const _cxCranio = new THREE.Box3()
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
  function acomodarCabeloSobOChapeu() {
    const cab = slots.cabelo
    if (!cab) return
    cab.scale.set(1, 1, 1)                // sempre do zero: a conta e idempotente
    const cha = slots.chapeu
    if (!cha || !cha.children.length || !cab.children.length || !headMesh) return

    cab.updateWorldMatrix(true, true)
    cha.updateWorldMatrix(true, true)
    _cxCabelo.setFromObject(cab)
    _cxChapeu.setFromObject(cha)
    _cxCranio.setFromObject(headMesh)
    if (_cxCabelo.isEmpty() || _cxChapeu.isEmpty() || _cxCranio.isEmpty()) return

    // Tudo em Y de MUNDO e relativo a junta: assim a conta nao muda quando o
    // personagem esta com opts.scale (o boneco das miniaturas usa) nem quando
    // o pedestal girou (giro em Y nao mexe em altura).
    head.getWorldPosition(_pontoJunta)
    const base = _pontoJunta.y
    const topoChapeu = _cxChapeu.max.y - base
    const topoCabelo = _cxCabelo.max.y - base
    const topoCranio = _cxCranio.max.y - base
    // Copa ou faixa? A conta so faz sentido pra peca que tem COPA. A primeira
    // versao exigia que o topo do chapeu passasse do topo do cranio, e isso
    // reprovava o chapeu de aba e o bone - a copa deles fica ABAIXO do alto da
    // cabeca (a cabeca e um ovo, o chapeu assenta no ovo) e os dois voltaram a
    // deixar o espeto do cabelo furar o pano. O corte em 62% da altura do
    // cranio separa o que se quer separar: copa de um lado, faixa de cabelo e
    // viseira do outro.
    if (topoChapeu < topoCranio * 0.62) return
    if (topoCabelo <= 0) return

    // 1,5 cm pra dentro do pano: encostar exatamente no topo deixa a mecha
    // brigando com a casca do chapeu e piscando conforme a camera anda.
    const alvo = topoChapeu - 0.015
    const k = alvo / topoCabelo
    if (k >= 1) return                    // ja cabia
    const ky = Math.max(0.55, k)
    cab.scale.y = ky
    // Achatar so em Y resolve o espeto que aponta pra CIMA e nao o que aponta
    // pra fora: no bone vermelho sobrava um espeto furando o pano na testa. O
    // aperto lateral e de proposito mais fraco que o de cima (60%), porque
    // cabelo saindo pelos LADOS de um bone e o que acontece de verdade - o que
    // nao pode e sair por cima.
    cab.scale.x = cab.scale.z = 1 - (1 - ky) * 0.6
  }

  // --- colar por cima da roupa ---------------------------------------------
  const _raio = new THREE.Raycaster()
  const _rOrig = new THREE.Vector3()
  const _rDir = new THREE.Vector3()
  const _pv = new THREE.Vector3()
  const _mNeck = new THREE.Matrix4()
  const _malhasRoupa = []
  const _malhasColar = []
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
    acomodarColarSobreARoupa()
    return app
  }

  // montagem inicial: cabeca, todos os slots na ORDEM de camadas e SO ENTAO a
  // cobertura, pela mesma razao do setAppearance.
  rebuildCabeca()
  for (const kind of ORDEM) rebuild(kind)
  aplicarCobertura()
  acomodarCabeloSobOChapeu()
  acomodarColarSobreARoupa()

  // --- API ------------------------------------------------------------------

  function setHeadLook(pitch, yaw) {
    headPivot.rotation.x = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, pitch || 0))
    headPivot.rotation.y = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, yaw || 0))
  }

  let bodyVisible = true
  function setVisibleBody(v) {
    bodyVisible = !!v
    // em 1a pessoa some so a cabeca (com cabelo e face); os bracos continuam
    head.visible = bodyVisible
    neckMesh.visible = bodyVisible
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

// Nomes antigos (6 bytes) <-> nomes do contrato de 20 campos.
const ALIAS_EN = {
  hair: 'cabelo', eyes: 'olhos', brows: 'sobrancelha', mouth: 'boca',
  hairColor: 'corCabelo',
}
const ALIAS_PT = {
  cabelo: 'hair', olhos: 'eyes', sobrancelha: 'brows', boca: 'mouth',
  corCabelo: 'hairColor',
}

/**
 * Copia uma aparencia parcial resolvendo os apelidos EN <-> PT e a pele.
 * A rede e o contrato falam PT (20 campos); o codigo antigo (NPCs da cidade,
 * avatares) fala EN. Os dois chegam aqui, entao os dois nomes andam juntos.
 *
 * Pele tem DOIS campos: 'pele' e indice de catalogo e 'skin' e cor crua. Quando
 * o patch traz os dois — e traz, porque main.js guarda um objeto so e manda ele
 * inteiro — vale o que MUDOU. Sem essa regra, trocar de tom no barbeiro nao
 * fazia nada: o 'skin' velho do mesmo objeto repintava a cor anterior logo
 * depois do 'pele' novo.
 */
function aplicar(alvo, patch) {
  if (!patch) return alvo
  const peleMudou = patch.pele !== undefined && (patch.pele | 0) !== (alvo.pele | 0)
  for (const k in patch) {
    const v = patch[k]
    if (v === undefined) continue
    alvo[k] = v
    const pt = ALIAS_EN[k]
    if (pt) alvo[pt] = v
    const en = ALIAS_PT[k]
    if (en) alvo[en] = v
  }
  if (peleMudou) alvo.skin = corPele(patch.pele)
  else if (patch.skin !== undefined) alvo.skin = corPele(patch.skin)
  else if (patch.pele !== undefined) alvo.skin = corPele(patch.pele)
  return alvo
}

export { HEAD_CENTER_Y }
export const HAIR_COLORS = AP.HAIR_COLORS || []
