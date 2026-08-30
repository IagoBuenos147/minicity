import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import { soldarNormais, tecelagem } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/camisas-extra.js — as 10 CAMISAS NOVAS, arquivo separado.
//
// O pedido: "as camisas nao estao boas, apague elas todas e refaca com
// modelos e modas diferentes... EVITE O QUADRADO DE MAIS, FACA ALGO MELHOR E
// MENOS EM BLOCO. Quero bom encaixe e juice e polimento." Do catalogo velho de
// camisas.js so o moletom sobrevive — e o moletom (metodo C, dupla casca) e
// exatamente o padrao de qualidade que este arquivo persegue nas 10 pecas
// novas: toda borda que aparece (barra, punho, gola, decote, cava) tem que ter
// AVESSO — espessura de verdade, nao uma aresta crua de 0 mm — e a silhueta
// tem que MUDAR de peca pra peca, senao volta a ler como bloco em serie.
//
// camisas.js explica TRES metodos (casca revolvida com vinco / paineis
// costurados / dupla casca com caimento) e diz explicitamente que sao tres
// funcoes DIFERENTES, nao uma so parametrizada — o dono quer comparar leituras
// lado a lado. Este arquivo faz o mesmo dentro de si: cada uma das 10 pecas
// combina essas tres tecnicas (mais uma nova, a FITA — ver abaixo) do jeito
// que a moda pede, nunca a mesma combinacao duas vezes.
//
// POR QUE ESTE ARQUIVO REESCREVE FERRAMENTAS QUE JA EXISTEM EM camisas.js:
// comEspessura/vincar/canelar/painel/nervura/botoes/loft/parede/tabela/refinar
// sao TODAS locais aquele arquivo (nao exportadas) e a tarefa pede pra nao
// tocar em camisas.js. Reescrever esse miolo aqui e o mesmo padrao que
// calcas.js ja usa (lofte/joelhoLoft/dobra/boca sao a versao DELE das mesmas
// ideias, nao um import) — cada catalogo de tronco tem seu proprio jogo de
// ferramentas de baixo nivel, construido em cima do que nucleo.js expoe
// (raioPerfil/fatia/revolver/casca/frenteXZ). O que NAO se reescreve e o
// nucleo.js em si: toda folga, todo perfil de corpo, toda medida sai de la.
//
// FERRAMENTA NOVA DESTA LEVA: FITA (fita()+trilho() mais abaixo). Nenhuma das
// tres tecnicas de camisas.js sabe debruar uma borda que NAO e um circulo
// horizontal — cava de regata, decote em V, gola aberta de camisa havaiana.
// fita() encadeia tubos retos (a mesma tecnica do cordao do jogger em
// calcas.js) ao longo de qualquer curva 3D, e trilho() traça essa curva na
// SUPERFICIE da peca. O resultado e uma debrum redonda com espessura de
// verdade em qualquer borda, reta ou curva — a ferramenta que faltava pra
// cava, V e gola aberta nao virarem aresta crua.
//
// AS TRES REGRAS DE camisas.js VALEM AQUI TAMBEM, sem excecao:
//
// a) TETO DE RAIO. Casca em FOLGA_LARGA (1.070) no maximo. painel() AQUI
//    tambem clampa o relevo da frente (|phi| < 1.0) em RELEVO_MAX — copiado
//    literalmente de camisas.js — entao qualquer peca que use painel() para
//    bolso/carcela/pala na frente ja nasce sem risco de enterrar o colar. As
//    pecas que chegam perto do teto (corta-vento, trico, oversized, colete)
//    so ganham relevo POSITIVO longe da frente (lado/costas) ou NEGATIVO
//    (canelura, que so afunda — nunca precisa de clamp).
// b) TORSO_SEG. Toda casca colada na pele usa c.medida.TORSO_SEG; toda banda
//    canelada fecha em 24/32/40 lados por conta propria (dupla parede) e
//    engole a borda da casca, exatamente como em camisas.js.
// c) PECA DO PEITO DENTRO DE UM Group. Todo mesh acima da cintura entra num
//    `noPeito` e so ELE vai pra c.montar(noPeito, 'chest') — nunca um Mesh
//    cru. Conferido contra animation.js: a respiracao so escala os MESHES
//    filhos DIRETOS de 'chest' (children[i].isMesh); um Group nessa lista e
//    ignorado pelo laco, entao nada dentro dele se mexe — e a metade de baixo
//    (que mora no 'torso' e tambem nao respira) fica de emenda selada com
//    ela. E o mesmo resultado do moletom, so que a razao exata — o Group
//    "some" da varredura em vez de ser encontrado e escalado certo — vale a
//    pena registrar aqui pra quem for mexer nao reabrir a emenda.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

// Mesmo teto de camisas.js: relevo aplicado por cima da casca, perto do
// centro da frente (onde o colar desce), nunca passa disto. Ver painel().
const RELEVO_MAX = 0.0055

// ---------------------------------------------------------------------------
// FERRAMENTAS — copiadas/adaptadas do miolo privado de camisas.js
// ---------------------------------------------------------------------------

/** Reamostra um perfil guardando os pontos originais e enfiando intermediarios
 *  a cada `passo` — o vinco precisa de aneis dentro da propria dobra. */
function refinar(perfil, passo) {
  const out = [perfil[0]]
  for (let i = 1; i < perfil.length; i++) {
    const a = perfil[i - 1], b = perfil[i]
    const n = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / passo))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Perfil sintetico: n+1 aneis entre y0 e y1 com o raio saindo de rDe(y). */
function parede(y0, y1, n, rDe) {
  const p = []
  for (let k = 0; k <= n; k++) {
    const y = y0 + (y1 - y0) * (k / n)
    p.push([rDe(y), y])
  }
  return p
}

/** Interpolacao smoothstep numa tabela [[y, valor], ...] ordenada por y. */
function tabela(tab, y) {
  const n = tab.length
  if (y <= tab[0][0]) return tab[0][1]
  if (y >= tab[n - 1][0]) return tab[n - 1][1]
  for (let i = 1; i < n; i++) {
    if (y <= tab[i][0]) {
      const t = (y - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0])
      return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * t * t * (3 - 2 * t)
    }
  }
  return tab[n - 1][1]
}

function lathe(c, perfil, mat, seg) {
  return N.sh(new THREE.Mesh(N.revolver(perfil, seg || c.medida.TORSO_SEG, c.medida.FLAT_Z), mat))
}

/** Costura duas paredes numa DOBRA (espessura de verdade na borda). Ver a
 *  doc longa da mesma funcao em camisas.js — mesma matematica, copiada
 *  porque nao e exportada de la. `dentro` termina onde `fora` comeca; a
 *  barriga do meio-circulo sai na perpendicular do segmento entre as pontas,
 *  o que serve tanto pra barra (dobra pra baixo) quanto pra gola (pra cima)
 *  sem sinal nenhum. ORDEM IMPORTA: parede que desce (y decrescendo) nasce
 *  virada pra dentro, parede que sobe nasce virada pra fora. */
function comEspessura(dentro, fora, bojo = 1, n = 4) {
  const a = dentro[dentro.length - 1], b = fora[0]
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2
  const ux = a[0] - cx, uy = a[1] - cy
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const m = Math.hypot(dx, dy) || 1
  const raio = Math.hypot(ux, uy) * bojo
  const vx = (dy / m) * raio, vy = (-dx / m) * raio
  const meio = []
  for (let k = 1; k < n; k++) {
    const t = (k / n) * Math.PI
    meio.push([cx + ux * Math.cos(t) + vx * Math.sin(t), cy + uy * Math.cos(t) + vy * Math.sin(t)])
  }
  return dentro.concat(meio, fora)
}

/** VINCO: soma de gaussianas em (altura, angulo) empurrando o raio — a dobra
 *  que tira a leitura de "pintura lisa". `yBase` soma a altura ABSOLUTA de
 *  torso porque a peca vive em duas juntas (torso e chest, 0.30 acima). */
function vincar(c, geo, yBase, dobras) {
  const flat = c.medida.FLAT_Z
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const zr = z / flat
    const r = Math.hypot(x, zr)
    if (r < 1e-5) continue
    const phi = Math.atan2(x, zr)
    const ya = y + yBase
    let d = 0
    for (const gDobra of dobras) {
      const e = Math.exp(-((ya - gDobra.y) * (ya - gDobra.y)) / (2 * gDobra.s * gDobra.s))
      const mod = gDobra.n ? 0.5 + 0.5 * Math.cos(gDobra.n * phi + (gDobra.p || 0)) : 1
      d += gDobra.a * e * mod
    }
    const k = (r + d) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/** CANELADO: raio modulado por cos(n*phi), deslocamento sempre NEGATIVO (o
 *  pico fica no raio original, o vale afunda) — por isso nunca precisa de
 *  clamp de teto, ao contrario de relevo positivo. */
function canelar(geo, n, amp, flat = 1) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const zr = z / flat
    const r = Math.hypot(x, zr)
    if (r < 1e-5) continue
    const phi = Math.atan2(x, zr)
    const k = (r - amp * (0.5 - 0.5 * Math.cos(n * phi))) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/** Acumulador de malha indexada com uv (a mesma ideia de tecelagem(), so que
 *  com canal de textura — ver a nota de camisas.js: nao esta em uso hoje
 *  porque tex() precisa de <canvas> e o verificador roda em node, mas custa
 *  so 2 floats por vertice guardar o canal pronto). */
function tear() {
  const pos = [], uvs = [], idx = []
  return {
    v(x, y, z, u, w) { pos.push(x, y, z); uvs.push(u, w); return pos.length / 3 - 1 },
    tri(a, b, cc) { idx.push(a, b, cc) },
    quad(a, b, cc, d) { idx.push(a, b, cc, a, cc, d) },
    geo() {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      g.setIndex(idx)
      g.computeVertexNormals()
      g.computeBoundingSphere()
      return g
    },
  }
}

/** PAINEL: grade (u,v) posta na superficie do tronco, arco fixo e bordas de
 *  cima/baixo dadas por FUNCOES — o que faz fraldao, decote em V, cava e
 *  ombro estruturado, que uma lathe nao faz. `fora(u,v,y,phi)` e o relevo
 *  local; o clamp de RELEVO_MAX perto da frente (|phi|<1.0) e INCONDICIONAL,
 *  entao todo chamador de painel() ja nasce protegido do teto do colar. */
function painel(c, perfil, o) {
  const nu = o.nu || 12, nv = o.nv || 8
  const vPot = o.vPot || 1
  const flat = c.medida.FLAT_Z
  const t = tear()
  const cols = []
  const rMed = N.raioPerfil(perfil, (o.y0(0.5) + o.y1(0.5)) / 2)
  const su = Math.abs(o.phi1 - o.phi0) * rMed / 0.045
  for (let i = 0; i <= nu; i++) {
    const u = i / nu
    const phi = o.phi0 + (o.phi1 - o.phi0) * u
    const s = Math.sin(phi), co = Math.cos(phi)
    const ya = o.y0(u), yb = o.y1(u)
    const sv = Math.abs(yb - ya) / 0.045
    const col = []
    for (let j = 0; j <= nv; j++) {
      const v = vPot === 1 ? j / nv : Math.pow(j / nv, vPot)
      const y = ya + (yb - ya) * v
      const rel = o.fora ? o.fora(u, v, y, phi) : 0.0010
      const r = N.raioPerfil(perfil, y) * o.folga
        + (Math.abs(phi) < 1.0 ? Math.min(rel, RELEVO_MAX) : rel)
      col.push(t.v(r * s, y, r * co * flat, u * su, v * sv))
    }
    cols.push(col)
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      t.quad(cols[i][j], cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1])
    }
  }
  return t.geo()
}

/** Nervura de costura: painel estreito ABAULADO — a emenda ganha volume em
 *  vez de ser um adesivo chapado por cima do pano. */
function nervura(c, perfil, o) {
  return painel(c, perfil, {
    nu: 4, nv: o.nv || 8, folga: o.folga,
    phi0: o.phi - o.larg / 2, phi1: o.phi + o.larg / 2,
    y0: o.y0, y1: o.y1,
    fora: (u) => o.base + o.alt * Math.sin(u * Math.PI),
  })
}

// Mesma conta de camisas.js: cone rasissimo (nao disco chapado, nao cilindro
// reto) calibrado pra sobrar da carcela por baixo e nao alcancar o colar por
// cima. Ver a doc longa em camisas.js — a conta e a mesma, os numeros tambem.
const BOTAO_FORA = 0.0038
const BOTAO_ESP = 0.0024

function botoes(c, mat, perfil, folga, n, y0, y1, r = 0.0055) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? y0 : y0 + (y1 - y0) * (i / (n - 1))
    const b = N.malha(new THREE.CylinderGeometry(r * 0.86, r, BOTAO_ESP, 10), mat,
      0, y, N.frenteZ(c, perfil, y, folga, BOTAO_FORA))
    b.rotation.x = Math.PI / 2
    g.add(b)
  }
  return g
}

/** LOFT: costura uma pilha de aneis-elipse com centro e inclinacao proprios —
 *  o que faz a manga acompanhar o deltoide, que uma lathe (um perfil so, um
 *  eixo so) nao consegue. */
function loft(aneis, cols = 16, apice) {
  const t = tecelagem()
  let ant = null
  for (const a of aneis) {
    const linha = []
    for (let i = 0; i < cols; i++) {
      const ang = (i / cols) * TAU
      const s = Math.sin(ang), co = Math.cos(ang)
      linha.push(t.v(
        (a.cx || 0) + a.r * s,
        a.y + (a.dy || 0) * co,
        (a.cz || 0) + a.r * (a.kz || 1) * co,
      ))
    }
    if (ant) for (let i = 0; i < cols; i++) t.quad(ant[i], ant[(i + 1) % cols], linha[(i + 1) % cols], linha[i])
    ant = linha
  }
  if (apice) {
    const p = t.v(apice.x || 0, apice.y, apice.z || 0)
    for (let i = 0; i < cols; i++) t.tri(ant[i], ant[(i + 1) % cols], p)
  }
  return t.geo()
}

// Os QUATRO aneis de cima da manga curta sao os MESMOS em toda peca deste
// arquivo que usa loft(): eles cobrem o deltoide (o elipsoide de 5.2x5.8x5.0
// cm empurrado 8mm pra dentro do corpo — ver o comentario extenso de
// camisas.js) e sao a parte anatomica, nao a de moda. So o que vem ANTES
// deles (comprimento e caimento da manga, que e a parte de moda) muda de
// peca pra peca.
const ANEL_TOPO_MANGA = [
  { y: -0.008, r: 0.0532, cz: 0.002, kz: 1.06, dy: -0.004 },
  { y: 0.008, r: 0.0458, cz: 0.002, kz: 1.08, dy: -0.002 },
  { y: 0.021, r: 0.0345, cz: 0.001, kz: 1.14 },
  { y: 0.030, r: 0.0250, cz: 0.001, kz: 1.22 },
]

// ---------------------------------------------------------------------------
// FITA — ferramenta nova desta leva. Debrua qualquer borda, reta ou curva,
// com espessura redonda de verdade, em vez de deixar a aresta crua do painel
// exposta (o que lia como corte de tesoura, nao como acabamento).
// ---------------------------------------------------------------------------

/** Traça n+1 pontos na SUPERFICIE da peca (raio do perfil*folga+extra) entre
 *  phi0 e phi1, na altura yDe(u) — o trilho que fita() vai seguir. Serve pra
 *  contornar a borda de QUALQUER painel desta peca sem duplicar a formula do
 *  raio: usa raioPerfil() exatamente como painel() usa por dentro. */
function trilho(c, perfil, folga, extra, phi0, phi1, yDe, n = 16) {
  const flat = c.medida.FLAT_Z
  const pts = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const phi = phi0 + (phi1 - phi0) * u
    const y = yDe(u)
    const r = N.raioPerfil(perfil, y) * folga + extra
    pts.push({ x: r * Math.sin(phi), y, z: r * Math.cos(phi) * flat })
  }
  return pts
}

/** FITA: cordao/debrum seguindo uma curva 3D qualquer, feito de tubos retos
 *  encadeados (a mesma tecnica do cordao do jogger em calcas.js) com uma
 *  bolinha em cada dobra escondendo a quina entre dois tubos. E o que falta
 *  nas tres tecnicas de camisas.js pra debruar cava, V e gola aberta — elas
 *  so sabem fechar peca em CIRCULO horizontal (lathe) ou em GRADE plana
 *  (painel sem espessura); nenhuma segue uma curva livre com volume. */
function fita(pontos, r, mat, seg = 6) {
  const g = new THREE.Group()
  const CIMA = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i], b = pontos[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-6) continue
    const seg3 = N.tubo(r, r, len, mat, seg)
    seg3.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    seg3.quaternion.setFromUnitVectors(CIMA, new THREE.Vector3(dx / len, dy / len, dz / len))
    g.add(seg3)
    if (i > 0) g.add(N.malha(new THREE.SphereGeometry(r, seg, 6), mat, a.x, a.y, a.z))
  }
  return g
}

// ---------------------------------------------------------------------------
// PECAS REUTILIZADAS ENTRE VARIAS ROUPAS DESTE ARQUIVO
// ---------------------------------------------------------------------------

/** Tapa a cabeca do ombro (deltoide + cupula do braco) pra manga comprida
 *  fechada nao deixar fresta — a MESMA correcao do moletom, com a MESMA
 *  conta (ver a doc longa la: o elipsoide tem que engolir os dois volumes,
 *  cobrir so um deles deixava a fresta que vazava cenario). */
function capaOmbro(c, mat, escala = 1) {
  for (const s of ['R', 'L']) {
    const cap = N.bola(1, mat, 12)
    cap.scale.set(0.056 * escala, 0.055 * escala, 0.057 * escala)
    cap.position.set((s === 'R' ? -1 : 1) * 0.004, -0.013, 0)
    c.montar(cap, 'arm' + s + 'Upper')
  }
}

/** Punho canelado no antebraco — a mesma peca do moletom (dupla parede +
 *  canelura), parametrizada em quanto a parede de fora estufa (kFora) pra
 *  cada peca poder ser mais ou menos folgada no pulso. */
function punhoCanelado(c, mat, kFora = 1.10, kFora2 = 1.13) {
  const rp = N.MANGA_R_PUNHO
  const yf = -(c.medida.FORE_ARM - N.MANGA_FIM_Y)
  for (const s of ['R', 'L']) {
    const p = N.revolver(comEspessura(
      [[rp * 1.00, yf + 0.040], [rp * 1.02, yf - 0.001]],
      [[rp * kFora, yf - 0.001], [rp * kFora2, yf + 0.016], [rp * kFora, yf + 0.040]],
    ), 24, 1)
    c.montar(N.sh(new THREE.Mesh(canelar(p, 6, 0.0016, 1), mat)), 'arm' + s + 'Lower')
  }
}

/** Fundo do tronco: tampa o tubo por baixo com o proprio fundo do perfil do
 *  corpo, na ordem natural dele (a unica em que a face olha pra baixo) — sem
 *  isso quem olha de baixo pra cima ve o miolo do boneco, igual ao moletom. */
function fundo(c, mDentro, yAte, k = 1.016) {
  return lathe(c, N.fatia(c.perfil.PELVIS, -0.048, yAte).map((p) => [p[0] * k, p[1]]), mDentro)
}

/**
 * CASCA DUPLA DO TRONCO — o miolo do metodo C (moletom), sem barra nem gola
 * (isso fica por conta de cada peca, porque muda de forma): duas paredes,
 * tronco e peito, a de fora subindo (casca) e a de dentro descendo (revés),
 * lendo uma tabela de caimento por altura ABSOLUTA. `extraDe(y)` e um termo
 * extra somado nas duas paredes igualmente (preserva a espessura) — serve
 * pra relevo que so depende da ALTURA, como os gomos horizontais do colete.
 */
function shellDupla(c, mFora, mDentro, cai, espDe, yPeitoFim, extraDe = () => 0, nFora = 16, nDentro = 12) {
  const g = new THREE.Group()
  const noPeito = new THREE.Group()
  const rFora = (perfil, base) => (y) => N.raioPerfil(perfil, y) * tabela(cai, y + base) + extraDe(y + base)
  const rDentro = (perfil, base) => (y) =>
    N.raioPerfil(perfil, y) * tabela(cai, y + base) + extraDe(y + base) - espDe(y + base)
  const y0 = cai[0][0]
  const pTorso = parede(y0, 0.300, nFora, rFora(c.perfil.PELVIS, 0))
  g.add(N.sh(new THREE.Mesh(N.revolver(pTorso, c.medida.TORSO_SEG, c.medida.FLAT_Z), mFora)))
  g.add(lathe(c, parede(0.300, y0, nDentro, rDentro(c.perfil.PELVIS, 0)), mDentro))
  const pPeito = parede(0, yPeitoFim, 7, rFora(c.perfil.PEITO, c.medida.CHEST_Y))
  noPeito.add(N.sh(new THREE.Mesh(N.revolver(pPeito, c.medida.TORSO_SEG, c.medida.FLAT_Z), mFora)))
  noPeito.add(lathe(c, parede(yPeitoFim, 0, 7, rDentro(c.perfil.PEITO, c.medida.CHEST_Y)), mDentro))
  return { g, noPeito, y0 }
}

// --- materiais ---------------------------------------------------------
// Mesma restricao de camisas.js: nada de tex()/canvas (o verificador roda em
// node, sem <canvas>). Estampa/xadrez nunca viram TEXTURA aqui — viram cor
// solida em mais um pedaco de geometria (bloco, fita, faixa, nervura), nunca
// um <canvas>. solid() ja e cacheado por cor/rugosidade — nada aqui leva
// userData.owned.
const malhaMat = (cor) => solid(cor, 0.88, 0.0)
const camisariaMat = (cor) => solid(cor, 0.64, 0.0, { side: THREE.DoubleSide })
const feltroMat = (cor) => solid(cor, 0.98, 0.0)
// Nylon do corta-vento: mais liso que qualquer tecido do catalogo (rugosidade
// baixa) e um triz metalico — e o especular do sol batendo em superficie
// sintetica, sem precisar de environment map.
const nylonMat = (cor) => solid(cor, 0.32, 0.06)
// Brim da jaqueta jeans: menos fosco que moletom, mais fosco que camisaria —
// o meio termo de um algodao grosso.
const brimMat = (cor) => solid(cor, 0.80, 0.0)

// ---------------------------------------------------------------------------
// IDENTIDADE DE TECIDO — cores FIXAS, que NAO derivam de c.cor.blusa.
//
// O DEFEITO RELATADO: as 10 pecas so pintavam c.cor.blusa (a UNICA cor que o
// jogador escolhe) em tudo — regata, polo, flanela, corta-vento, havaiana,
// jersey, trico, jaqueta jeans, oversized e colete saiam todas do mesmo tom,
// so a silhueta mudava. c.cor.blusa CONTINUA mandando na peca PRINCIPAL (o
// corpo da regata, da polo, da jersey, o tricô, a oversized, a camisa por
// baixo da flanela/colete) — o pedido foi explicito nisso. O que muda e que
// gola, punho, xadrez, recorte, numero, forro e estampa deixam de ser
// N.esc(base, x) — a MESMA cor so um pouco mais clara ou escura, que e o que
// lia como "tudo azul" — e passam a ser uma cor PROPRIA e FIXA, do jeito que
// o tecido ou o acessorio existe de verdade: jaqueta jeans roxa nao existe, e
// um botao de madreperola nao muda de cor com a camisa por baixo dele.
const AZUL_JEANS = 0x4a6d94        // brim da jaqueta jeans — sempre este azul
const XADREZ_A = 0x8a3327          // flanela: xadrez cowboy, vermelho tijolo...
const XADREZ_B = 0x2a2521          // ...cruzado com preto-acastanhado
const TRIM_ESPORTE = 0xe8e4d8      // recorte do corta-vento / vies e friso da jersey
const TRIM_ESPORTE_2 = 0x1c1d22    // punho/gola do corta-vento / placa da jersey / vies da regata
const RIB_TRICO = 0xcfc0a0         // punho, gola e barra do trico — la crua
const POLO_MARINHO = 0x1d2c46      // gola e punho da polo — contraste classico de piquet
const HAVAI_FLOR = 0xd9603a        // estampa havaiana: flor coral...
const HAVAI_FLOR2 = 0xe4b23c       // ...flor amarela...
const HAVAI_FOLHA = 0x3c6b46       // ...folha verde
const COLETE_FORRO = 0x7c1f2b      // forro/vies do colete — vinho, o toque "fino" do catalogo

// ===========================================================================
// O CATALOGO
// ===========================================================================

export const CAMISAS_EXTRA = [

  // =========================================================================
  // 1 — REGATA: cavada, sem manga, alcas finas.
  //
  // Silhueta: ombro NU (nao existe manga nem casca cobrindo o ombro), cava
  // grande dos dois lados. E a UNICA peca do catalogo sem nenhuma cobertura
  // de braco, entao e a que mais se afasta de todas as outras 9 so na forma.
  //
  // Moda: ESPORTISTA — a mais simples do catalogo de proposito (regata de
  // treino, nao regata de moda), entao a identidade e minima: so o vies da
  // cava/decote sai da paleta do jogador e vira uma fita tecnica escura fixa
  // (TRIM_ESPORTE_2), o mesmo vocabulario de acabamento que jersey e
  // corta-vento usam — as tres formam o grupo "esportista" do catalogo.
  // =========================================================================
  {
    id: 'regata',
    nome: 'Regata',
    name: 'Regata',
    metodo: 'A-variante: tronco fechado revolvido com vinco (como a camiseta) ate a altura da axila; dali pra cima dois paineis (frente/costas) que NAO se encontram no lado — o vao e a propria cava — ligados por alcas em bloco arredondado; decote e cava debruados com fita (tubo seguindo a curva, nao aresta crua)',
    // NAO esconde nada. A peca so cobre PARTE do tronco/peito de proposito
    // (a cava e o decote sao vao real, nao textura de vao) — esconder
    // 'torso'/'peito' apagaria a pele que devia aparecer exatamente ali,
    // igual a camisa de botao de camisas.js explica pro V dela.
    esconde: [],
    build(c) {
      const f = N.FOLGA_JUSTA
      const base = c.cor.blusa
      const m = malhaMat(base)
      const mDobra = N.tecido(N.esc(base, 0.86), 0.88)
      const mPainel = N.tecido2(N.esc(base, 1.04), 0.70)
      // Vies FIXO (nao deriva de base): a fita tecnica escura e o unico
      // elemento de identidade que uma regata simples de treino precisa —
      // ver a nota de "Moda" no cabecalho da peca.
      const mFita = N.tecido(TRIM_ESPORTE_2, 0.75)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // Tronco: uma dobra so (a regata fica colada no corpo, nao pede o
      // vinco duplo da camiseta de manga comprida por baixo).
      const dobras = [{ y: 0.100, s: 0.028, a: -0.0022 }]
      const baixo = N.casca(c, refinar(c.perfil.PELVIS, 0.014), { folga: f })
      g.add(N.sh(new THREE.Mesh(vincar(c, baixo, 0, dobras), m)))

      // Barra dobrada — mesma tecnica da camiseta, mesmos numeros: e a
      // borda mais vista da peca (fica na cintura, altura dos olhos de
      // quem olha de longe) e precisa do avesso tanto quanto qualquer outra.
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f + e
      g.add(lathe(c, comEspessura(
        [[rp(0.034, 0.0006), 0.034], [rp(-0.012, 0.0008), -0.012]],
        [[rp(-0.012, 0.0056), -0.012], [rp(0.008, 0.0058), 0.008], [rp(0.036, 0.0054), 0.036]],
      ), mDobra))

      // Peito: dois paineis ESTREITOS. AF bem menor que o 1.66 da camisa de
      // botao de proposito — quanto mais estreito o painel, maior o vao
      // lateral, que e a cava. yTopo sobe em direcao as bordas (u perto de 0
      // ou 1): e onde a alca pousa, mais alto que o centro do decote.
      const AF = 1.02
      const AC = Math.PI - AF
      const yTopo = (u) => 0.118 + 0.030 * Math.abs(u - 0.5) * 2
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -AF, phi1: AF, nu: 10, nv: 6,
        y0: () => 0, y1: yTopo, fora: () => 0.0012,
      }), mPainel)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 10, nv: 6,
        y0: () => 0, y1: yTopo, fora: () => 0.0012,
      }), mPainel)))

      // Fita de borda no decote e na cava: sem ela a beirada do painel e
      // uma aresta crua de 0 mm — exatamente o "quadrado" que foi reprovado.
      // trilho() traça o MESMO contorno que painel() acabou de desenhar
      // (mesma folga, mesma yTopo) um triz por fora, e fita() engorda esse
      // contorno com um tubo fino.
      for (const [phi0, phi1] of [[-AF, AF], [AC, TAU - AC]]) {
        noPeito.add(fita(trilho(c, c.perfil.PEITO, f, 0.0016, phi0, phi1, yTopo, 14), 0.0020, mFita))
      }

      // Alcas: bloco arredondado (N.bloco, secao com volume) deitando na
      // curva do ombro em vez da caixa reta de N.alcas() — e a diferenca
      // entre "ripa colada" e "fita de pano com corpo". Duas metades (frente
      // caindo pra tras, costas caindo pra frente) que se encontram no topo
      // do ombro, escondidas por uma bolinha na quina.
      const larg = 0.026, esp = 0.014
      for (const sgn of [1, -1]) {
        const yBase = yTopo(1)
        const zF = N.frenteXZ(c, c.perfil.PEITO, sgn * 0.062, yBase, f, 0.0014)
        const yOmbro = 0.178
        const aFrente = N.bloco(larg, 0.075, esp, 0.010, m)
        aFrente.position.set(sgn * 0.062, (yBase + yOmbro) / 2, zF * 0.55)
        aFrente.rotation.set(-0.55, 0, -sgn * 0.20)
        noPeito.add(aFrente)
        const aTras = N.bloco(larg, 0.070, esp, 0.010, m)
        aTras.position.set(sgn * 0.062, (yBase + yOmbro) / 2 - 0.006, -zF * 0.55)
        aTras.rotation.set(0.55, 0, -sgn * 0.20)
        noPeito.add(aTras)
        noPeito.add(N.malha(new THREE.SphereGeometry(esp * 0.62, 8, 6), m, sgn * 0.062, yOmbro, 0))
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 2 — POLO: gola de trico, carcela de 3 botoes, manga curta com punho.
  //
  // Silhueta: fechada quase ate o pescoco (ao contrario da regata e do V da
  // jersey), gola em PE (nao cai achatada como a da camisa de botao) e manga
  // com punho canelado em vez de bainha lisa.
  //
  // Moda: CASUAL (smart-casual) — o corpo continua na cor do jogador, mas
  // gola e punho agora sao um azul-marinho FIXO (POLO_MARINHO): e o "tipping"
  // classico de polo (gola/punho contrastando com o corpo), que e exatamente
  // o detalhe que faltava pra ela nao ler como camiseta com colarinho.
  // =========================================================================
  {
    id: 'polo',
    nome: 'Polo',
    name: 'Polo',
    metodo: 'A: casca revolvida com vinco (como a camiseta), fechada alto no pescoco; pe de gola canelado com folha curta por cima (dupla camada, como o colarinho da camisa de botao mas mais baixo); carcela de 3 botoes; manga curta com punho canelado dobrado',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = N.FOLGA_JUSTA
      const base = c.cor.blusa
      const m = malhaMat(base)
      const mDobra = N.tecido(N.esc(base, 0.86), 0.88)
      // Gola e punho em cor CONTRASTANTE fixa — o "tipping" da polo. Nao
      // deriva de base: uma polo azul-marinho por cima de qualquer corpo lê
      // como polo de verdade, e mais uma sombra do mesmo azul do jogador.
      const mRib = N.tecido(POLO_MARINHO, 0.80)
      const mCarcela = camisariaMat(N.esc(base, 0.92))
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      const dobras = [
        { y: 0.090, s: 0.026, a: 0.0022 },
        { y: 0.400, s: 0.028, a: 0.0020, n: 2, p: Math.PI },
      ]
      const baixo = N.casca(c, refinar(c.perfil.PELVIS, 0.014), { folga: f })
      g.add(N.sh(new THREE.Mesh(vincar(c, baixo, 0, dobras), m)))

      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f + e
      g.add(lathe(c, comEspessura(
        [[rp(0.034, 0.0006), 0.034], [rp(-0.012, 0.0008), -0.012]],
        [[rp(-0.012, 0.0052), -0.012], [rp(0.008, 0.0054), 0.008], [rp(0.036, 0.0050), 0.036]],
      ), mDobra))

      // Peito fecha ALTO (0.180), quase no pescoco — a polo nao tem decote,
      // so a fresta curta da carcela.
      const pPeito = refinar(N.fatia(c.perfil.PEITO, 0, 0.180), 0.014)
      pPeito.push([N.FECHA_PESCOCO / f, 0.184])
      const cima = N.casca(c, pPeito, { folga: f })
      noPeito.add(N.sh(new THREE.Mesh(vincar(c, cima, c.medida.CHEST_Y, dobras), m)))

      // Carcela de 3 botoes: fresta curta (ate 0.150), nao a camisa inteira.
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -0.12, phi1: 0.12, nu: 4, nv: 6,
        y0: () => 0.086, y1: () => 0.150, fora: () => 0.0016,
      }), mCarcela)))
      noPeito.add(botoes(c, N.tecido(0xe4ddc8, 0.5), c.perfil.PEITO, f, 3, 0.096, 0.144))

      // Pe de gola canelado + folha curta por cima — a mesma dupla camada
      // do colarinho da camisa de botao, so que RASA: a polo fica de pe no
      // pescoco, nao deita aberta nos ombros.
      const pe = N.tubo(0.0530, 0.0562, 0.030, mRib, 16)
      pe.position.y = 0.052
      canelar(pe.geometry, 10, 0.0012, 1)
      c.montar(pe, 'neck')
      const rc = (y, e) => N.raioPerfil(c.perfil.PEITO, y) * f + e
      noPeito.add(lathe(c, comEspessura(
        [[rc(0.150, 0.0050), 0.150], [rc(0.168, 0.0052), 0.168]],
        [[rc(0.168, 0.0008), 0.168], [rc(0.150, 0.0010), 0.150]],
      ), mRib))

      // Manga: os aneis de cima (deltoide) sao os padrao; embaixo, a manga
      // e mais curta e mais colada que a camiseta (polo tem caimento
      // atletico), fechando num punho canelado em vez de bainha lisa.
      const aneis = [
        { y: -0.058, r: 0.0562, cz: 0.001 },
        { y: -0.070, r: 0.0588, cz: 0.001 },
        { y: -0.076, r: 0.0612, cz: 0.001 },
        { y: -0.066, r: 0.0616, cz: 0.002, kz: 1.02 },
        { y: -0.048, r: 0.0588, cz: 0.003, kz: 1.04, dy: -0.002 },
        { y: -0.022, r: 0.0558, cz: 0.003, kz: 1.06, dy: -0.004 },
        ...ANEL_TOPO_MANGA,
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneis, 16, { y: 0.040 }), m)), lado)
      }
      const rm = 0.0562
      for (const lado of ['armRUpper', 'armLUpper']) {
        const p = N.revolver(comEspessura(
          [[rm * 1.00, -0.058], [rm * 1.02, -0.070]],
          [[rm * 1.11, -0.070], [rm * 1.14, -0.062], [rm * 1.11, -0.052]],
        ), 20, 1)
        c.montar(N.sh(new THREE.Mesh(canelar(p, 8, 0.0018, 1), mRib)), lado)
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 3 — FLANELA: xadrez aberta por cima de uma camiseta, mangas dobradas.
  //
  // Silhueta: DUAS camadas visiveis ao mesmo tempo — uma camiseta fechada por
  // dentro e a flanela solta e aberta por cima, com a manga arregacada
  // (dobra grossa, nao bainha fina). E a unica peca do catalogo com duas
  // pecas de tronco de verdade.
  //
  // Moda: COWBOY — junto com a jaqueta jeans, a peca "identidade de tecido"
  // do catalogo: xadrez de flanela e vermelho-tijolo cruzado com preto, nao
  // a cor que o jogador escolheu (ver o bloco fixo no topo do arquivo). A
  // camiseta por baixo continua na cor do jogador — so ela, o resto e xadrez.
  //
  // CORRECAO DE ANCORA NESTA PASSAGEM: o painel principal da flanela (perfil
  // do QUADRIL, y de -0,030 a 0,300 — a faixa inteira do tronco) estava
  // pendurado em noPeito, que so vai pra 'chest' (0,30 m ACIMA do torso, ver
  // o item (c) do cabecalho). Resultado: o painel renderizava inteiro
  // comprimido perto do pescoco em vez de cair do ombro ate o quadril — dava
  // pra ver isso com uma foto de perto, sem mudar nenhum vertice, so o pai.
  // Corrigido pra g (que ja vai pra 'torso' sem deslocamento, a mesma junta
  // que a barra da camiseta de baixo usa), igual TODA outra peca deste
  // arquivo ja faz para conteudo de perfil do quadril.
  // =========================================================================
  {
    id: 'flanela',
    nome: 'Flanela',
    name: 'Flanela',
    metodo: 'duas camadas: camiseta interna fechada (casca revolvida simples) + flanela externa em UM painel so cobrindo quase toda a volta, com uma fresta estreita na frente (a peca fica aberta, nunca fecha) debruada em fita; manga arregacada (dobra grossa) por cima da manga curta da camiseta; bolso de peito',
    // A camiseta de dentro fecha torso/peito inteiro — e ela que cobre a
    // pele, a flanela de fora e so a segunda camada aberta.
    esconde: ['torso', 'peito'],
    build(c) {
      const fInt = N.FOLGA_JUSTA
      const fExt = N.FOLGA_SOLTA
      const base = c.cor.blusa
      // A camiseta de baixo continua na cor do JOGADOR (e uma camiseta lisa
      // comum por baixo, essa sim pode ser qualquer cor) — so um tom mais
      // claro pra nao virar a mesma casca da flanela com um corte estranho.
      const mInt = malhaMat(N.esc(base, 1.55))
      // XADREZ FIXO — nao deriva de base (ver "IDENTIDADE DE TECIDO" no topo
      // do arquivo): flanela e vermelho-tijolo cruzado com preto-acastanhado
      // na vida real, independente da cor que o jogador escolheu pra
      // camiseta de baixo.
      const mExt = camisariaMat(XADREZ_A)
      const mXadrez = N.tecido(XADREZ_B, 0.92)
      const mLinha = mXadrez
      const mFita = N.tecido(N.esc(XADREZ_B, 0.80), 0.85)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // --- camada 1: a camiseta interna, simples e sem crista nenhuma —
      // a flanela aberta cobre a maior parte dela, entao nao vale a pena
      // gastar vinco numa peca que mal aparece.
      const baixoInt = N.casca(c, c.perfil.PELVIS, { folga: fInt })
      g.add(N.sh(new THREE.Mesh(baixoInt, mInt)))
      const rpInt = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * fInt + e
      g.add(lathe(c, comEspessura(
        [[rpInt(0.034, 0.0005), 0.034], [rpInt(-0.010, 0.0006), -0.010]],
        [[rpInt(-0.010, 0.0044), -0.010], [rpInt(0.010, 0.0046), 0.010], [rpInt(0.032, 0.0042), 0.032]],
      ), N.tecido(N.esc(base, 1.30), 0.9)))
      const pPeitoInt = refinar(N.fatia(c.perfil.PEITO, 0, 0.195), 0.016)
      pPeitoInt.push([N.FECHA_PESCOCO / fInt, 0.199])
      const noPeitoInt = new THREE.Group()
      noPeitoInt.add(N.sh(new THREE.Mesh(N.casca(c, pPeitoInt, { folga: fInt }), mInt)))
      c.montar(noPeitoInt, 'chest')
      const aneisTee = [
        { y: -0.070, r: 0.0538, cz: 0.001 },
        { y: -0.082, r: 0.0562, cz: 0.001 },
        { y: -0.072, r: 0.0576, cz: 0.002, kz: 1.02 },
        { y: -0.050, r: 0.0560, cz: 0.003, kz: 1.04, dy: -0.002 },
        { y: -0.024, r: 0.0542, cz: 0.003, kz: 1.06, dy: -0.004 },
        ...ANEL_TOPO_MANGA,
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneisTee, 14, { y: 0.040 }), mInt)), lado)
      }

      // --- camada 2: a flanela, UM painel so cobrindo de 0.20 a TAU-0.20 —
      // ou seja, tudo MENOS uma fresta estreita na frente. E o inverso da
      // camisa de botao (que junta dois paineis pra fechar tudo): aqui um
      // painel so ja cobre quase tudo, e o que falta e o proprio vao da
      // peca aberta, nao um recorte.
      const GAP = 0.20
      const folgaExtra = 0.0016
      // g, nao noPeito — ver "CORRECAO DE ANCORA" no cabecalho da peca.
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: fExt, phi0: GAP, phi1: TAU - GAP, nu: 20, nv: 10, vPot: 1.6,
        y0: () => -0.030, y1: () => 0.300, fora: () => folgaExtra,
      }), mExt)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: fExt, phi0: GAP, phi1: TAU - GAP, nu: 20, nv: 8,
        y0: () => 0, y1: () => 0.185, fora: () => folgaExtra,
      }), mExt)))

      // XADREZ: duas cores cruzadas em GEOMETRIA, nunca em textura (ver a
      // nota de materiais no topo do arquivo) — faixas HORIZONTAIS rasas
      // (mesma tecnica dos dois paineis acima, so que uma banda estreita)
      // cruzando com nervuras VERTICAIS (a mesma ferramenta que a costura
      // lateral da jaqueta jeans usa). E o "faixas de geometria" que separa
      // flanela de camisa lisa tingida.
      for (const [y0, y1] of [[0.050, 0.078], [0.190, 0.220]]) {
        g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
          folga: fExt, phi0: GAP, phi1: TAU - GAP, nu: 22, nv: 2,
          y0: () => y0, y1: () => y1, fora: () => folgaExtra + 0.0006,
        }), mXadrez)))
      }
      for (const [y0, y1] of [[0.044, 0.070], [0.126, 0.152]]) {
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: fExt, phi0: GAP, phi1: TAU - GAP, nu: 22, nv: 2,
          y0: () => y0, y1: () => y1, fora: () => folgaExtra + 0.0006,
        }), mXadrez)))
      }
      for (const phi of [0.85, Math.PI, -0.85]) {
        g.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PELVIS, {
          folga: fExt, phi, larg: 0.13, nv: 6,
          y0: () => -0.026, y1: () => 0.300, base: folgaExtra + 0.0004, alt: 0.0004,
        }), mXadrez)))
        noPeito.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PEITO, {
          folga: fExt, phi, larg: 0.13, nv: 5,
          y0: () => 0, y1: () => 0.184, base: folgaExtra + 0.0004, alt: 0.0004,
        }), mXadrez)))
      }

      // A costura do ombro, abaulada — sem ela a flanela lia como um saco
      // sem juntas nos ombros. mLinha agora e o proprio XADREZ_B: a costura
      // vira mais uma linha escura do xadrez, nao um quarto tom solto.
      for (const sgn of [1, -1]) {
        const p0 = sgn > 0 ? 1.00 : -1.58
        const p1 = sgn > 0 ? 1.58 : -1.00
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: fExt, phi0: p0, phi1: p1, nu: 8, nv: 3,
          y0: (u) => 0.150 + 0.012 * u, y1: (u) => 0.160 + 0.012 * u,
          // abaulada na largura (v cruza o painel estreito): sin(v*PI) pica
          // no meio da faixa, igual a costura de ombro da camisa de botao
          fora: (u, v) => folgaExtra + 0.0016 * Math.sin(v * Math.PI),
        }), mLinha)))
      }

      // As DUAS bordas abertas da frente ganham fita — sem ela a flanela
      // aberta mostra a beirada crua do painel, que e exatamente a leitura
      // de "peca cortada", nao de "camisa pendurada aberta". Mesma correcao
      // de ancora do painel principal: baixo3 (perfil do QUADRIL) vai pra g.
      const yTorsoTopo = () => 0.300
      const yPeitoTopo = () => 0.185
      for (const phi of [GAP, TAU - GAP]) {
        const baixo3 = trilho(c, c.perfil.PELVIS, fExt, folgaExtra + 0.0014, phi, phi, () => -0.030, 1)
          .concat(trilho(c, c.perfil.PELVIS, fExt, folgaExtra + 0.0014, phi, phi, yTorsoTopo, 1))
        g.add(fita(baixo3, 0.0022, mFita))
        const cima3 = trilho(c, c.perfil.PEITO, fExt, folgaExtra + 0.0014, phi, phi, () => 0, 1)
          .concat(trilho(c, c.perfil.PEITO, fExt, folgaExtra + 0.0014, phi, phi, yPeitoTopo, 1))
        noPeito.add(fita(cima3, 0.0022, mFita))
      }

      // Bolso de peito chapado — a mesma tecnica dos bolsos de calcas.js
      // (bloco colado na normal da superficie), so que no peito.
      {
        const x = 0.058, y = 0.075
        const z = N.frenteXZ(c, c.perfil.PEITO, x, y, fExt, 0.0018)
        const bolso = N.bloco(0.052, 0.058, 0.014, 0.008, mExt)
        bolso.position.set(x, y, z)
        bolso.rotation.y = Math.atan2(x * c.medida.FLAT_Z * c.medida.FLAT_Z, z)
        noPeito.add(bolso)
      }

      // Manga arregacada: um ANEL grosso dobrado (a mesma comEspessura, bojo
      // maior) sentado por cima da manga da camiseta interna, no meio do
      // antebraco — e o rolo de pano que separa "manga dobrada" de "manga
      // curta comum".
      for (const lado of ['armRLower', 'armLLower']) {
        const rBraco = 0.0505
        const yRolo = -0.030
        const rolo = N.revolver(comEspessura(
          [[rBraco * 1.02, yRolo - 0.026], [rBraco * 1.05, yRolo - 0.002]],
          [[rBraco * 1.22, yRolo - 0.002], [rBraco * 1.26, yRolo + 0.010], [rBraco * 1.20, yRolo + 0.024]],
        ), 20, 1)
        c.montar(N.sh(new THREE.Mesh(rolo, mExt)), lado)
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 4 — CORTA-VENTO: nylon, gola alta com ziper, recorte de cor no peito.
  //
  // Silhueta: gola em pe ALTA (a mais alta do catalogo), corpo colado nos
  // punhos e na barra (a folga do meio se recolhe nas pontas, como o
  // moletom) e uma faixa horizontal de cor cruzando o peito.
  //
  // Moda: ESPORTISTA — corpo na cor do jogador (o "time"/marca escolhida),
  // mas o recorte do peito e o punho/gola agora sao cores FIXAS de trim
  // (TRIM_ESPORTE quase-branco e TRIM_ESPORTE_2 quase-preto): o par classico
  // de corta-vento, corpo colorido com bloco de cor neutra, em vez de um
  // recorte que era so a mesma cor mais clara.
  // =========================================================================
  {
    id: 'corta-vento',
    nome: 'Corta-vento',
    name: 'Corta-vento',
    metodo: 'C: dupla casca com caimento (como o moletom) recolhida em barra e punho canelados; gola alta em pe com fita de ziper descendo o centro da frente e puxador; nervura horizontal marcando o recorte de cor no peito',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const base = c.cor.blusa
      const cor = N.esc(base, 0.90)
      const m = nylonMat(cor)
      // Recorte e punho/gola em cor FIXA de trim (nao deriva de cor) — o
      // bloco de cor neutra de um corta-vento de verdade, nao um degrade da
      // mesma cor do casco.
      const mRecorte = nylonMat(TRIM_ESPORTE)
      const mDentro = N.tecido(N.esc(cor, 0.60), 0.90)
      const mRib = N.tecido(TRIM_ESPORTE_2, 0.85)
      const mZiper = N.metal(0xb9bec4)
      const g = new THREE.Group()

      // Caimento mais moderado que o moletom (FOLGA_SOLTA no auge, nao
      // FOLGA_LARGA) — corta-vento fica mais colado ao corpo que um blusao.
      const CAI = [
        [0.038, 1.026], [0.070, 1.048], [0.150, 1.058], [0.300, 1.052],
        [0.400, 1.044], [0.455, 1.040], [0.478, 1.024],
      ]
      const esp = () => 0.0048
      const { g: shellG, noPeito, y0 } = shellDupla(c, m, mDentro, CAI, esp, 0.166)
      g.add(shellG)

      // Recorte de cor: uma FAIXA horizontal dando a VOLTA INTEIRA no peito —
      // o detalhe que faz a peca ser reconhecida de longe pela SILHUETA de
      // cor, nao so pela forma. casca()+fatia() (nao painel()) de proposito:
      // o bulge aqui e CONSTANTE em todo o angulo, entao nao precisa de
      // grade (u,v) nenhuma, e revolver() ja solda a propria emenda — um
      // painel quase-2pi deixaria uma fresta de 0.1 rad sem cobrir e uma
      // linha de sombra na costura que nao se fecha.
      noPeito.add(N.sh(new THREE.Mesh(N.casca(c, N.fatia(c.perfil.PEITO, 0.086, 0.118), {
        folga: 1.052, extra: 0.0018,
      }), mRecorte)))

      // Barra canelada recolhida (tecnica do moletom, numeros mais justos).
      const rq = (y, k) => N.raioPerfil(c.perfil.PELVIS, y) * k
      const barra = N.revolver(comEspessura(
        [[rq(0.044, 1.010), 0.044], [rq(-0.020, 1.012), -0.020]],
        [[rq(-0.020, 1.036), -0.020], [rq(0.000, 1.054), 0.000],
          [rq(0.022, 1.060), 0.022], [rq(0.042, 1.052), 0.042]],
      ), 40, c.medida.FLAT_Z)
      g.add(N.sh(new THREE.Mesh(canelar(barra, 10, 0.0020, c.medida.FLAT_Z), mRib)))
      g.add(fundo(c, mDentro, -0.020, 1.014))

      // Gola alta em pe: cilindro reto com dobra no topo — mais alta que
      // qualquer outra deste catalogo (fica de pe, nao cai nos ombros),
      // calibrada abaixo de RAIO_GOLA_ALTA como o resto do jogo exige.
      const pe = N.tubo(N.RAIO_GOLA_ALTA * 0.90, N.RAIO_GOLA_ALTA * 0.97, 0.052, m, 20)
      pe.position.y = 0.050
      c.montar(pe, 'neck')
      const topoGola = N.malha(new THREE.TorusGeometry(N.RAIO_GOLA_ALTA * 0.945, 0.0026, 6, 20), m, 0, 0.076, 0)
      topoGola.rotation.x = Math.PI / 2
      c.montar(topoGola, 'neck')

      // Ziper: fita metalica descendo o centro da frente (trilho tracado na
      // propria casca) mais um puxador (bloco pequeno) e um anel de argola.
      const trilhoZ = trilho(c, c.perfil.PEITO, 1.052, 0.0020, 0, 0, () => 0.010, 1)
        .concat(trilho(c, c.perfil.PEITO, 1.052, 0.0020, 0, 0, () => 0.150, 1))
      noPeito.add(fita(trilhoZ, 0.0018, mZiper))
      const zTorso = trilho(c, c.perfil.PELVIS, 1.052, 0.0020, 0, 0, () => y0 + 0.006, 1)
        .concat(trilho(c, c.perfil.PELVIS, 1.052, 0.0020, 0, 0, () => 0.300, 1))
      g.add(fita(zTorso, 0.0018, mZiper))
      const zPeito = N.frenteZ(c, c.perfil.PEITO, 0.100, 1.052, 0.0022)
      const puxador = N.bloco(0.008, 0.018, 0.004, 0.002, mZiper)
      puxador.position.set(0, 0.100, zPeito)
      noPeito.add(puxador)
      const argola = N.malha(new THREE.TorusGeometry(0.0040, 0.0011, 5, 10), mZiper, 0, 0.092, zPeito)
      argola.rotation.x = Math.PI / 2
      noPeito.add(argola)

      N.mangaLonga(c, m, { r: 0.057 })
      capaOmbro(c, m)
      punhoCanelado(c, mRib, 1.09, 1.12)
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 5 — HAVAIANA: manga curta larga, gola aberta, barra solta.
  //
  // Silhueta: a mais LARGA e mais CURTA do catalogo — corpo solto (nao
  // recolhe em barra nenhuma), manga curta bem mais larga que a da polo/
  // jersey, gola de lapela aberta em vez de fechada no pescoco.
  // =========================================================================
  {
    id: 'havaiana',
    nome: 'Camisa havaiana',
    name: 'Camisa havaiana',
    metodo: 'A-solta: casca revolvida simples (sem vinco — a havaiana cai solta, nao marca cintura) em FOLGA_SOLTA; gola de lapela aberta em dois paineis flangeados (a mesma ideia da folha da camisa de botao, mais larga e sem fechar); manga curta larga sem punho; bolso de peito e 2 botoes visiveis no V',
    // Moda: CASUAL — o corpo continua na cor do jogador (uma havaiana pode
    // ser de qualquer cor de fundo), mas ganha ESTAMPA fixa: flores coral e
    // amarelas com folha verde, em blobs achatados colados na superficie
    // (geometria, nunca textura — ver a nota de materiais no topo do
    // arquivo), independentes da cor escolhida.
    esconde: ['torso', 'peito'],
    build(c) {
      const fSolta = N.FOLGA_SOLTA
      const base = c.cor.blusa
      const m = malhaMat(base)
      const mDobra = N.tecido(N.esc(base, 0.88), 0.85)
      const mFita = N.tecido(N.esc(base, 0.80), 0.80)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // Corpo solto, sem vinco: a havaiana nao marca cintura, cai reta.
      g.add(N.sh(new THREE.Mesh(N.casca(c, c.perfil.PELVIS, { folga: fSolta }), m)))
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * fSolta + e
      g.add(lathe(c, comEspessura(
        [[rp(0.034, 0.0006), 0.034], [rp(-0.014, 0.0008), -0.014]],
        [[rp(-0.014, 0.0050), -0.014], [rp(0.006, 0.0052), 0.006], [rp(0.034, 0.0048), 0.034]],
      ), mDobra))

      // Peito ate a base do decote em V (0.150) — dali pra cima e so a
      // gola aberta, nao existe casca continuando por baixo dela.
      const pPeito = N.fatia(c.perfil.PEITO, 0, 0.150)
      noPeito.add(N.sh(new THREE.Mesh(N.casca(c, pPeito, { folga: fSolta }), m)))

      // Gola de lapela: dois paineis que ABREM (fora cresce conforme sobe,
      // igual a folha da camisa de botao) mas NAO se fecham no meio — ficam
      // separados por um V largo, e e esse vao que a fita de baixo debrua.
      const yColarinho = (u) => 0.150 + 0.040 * u
      for (const sgn of [1, -1]) {
        // phi0 sempre < phi1 (a peca do lado esquerdo nao pode nascer com o
        // arco invertido, senao a normal do painel sai voltada pro corpo)
        const p0 = sgn > 0 ? 0.10 : -1.35
        const p1 = sgn > 0 ? 1.35 : -0.10
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: fSolta, phi0: p0, phi1: p1, nu: 12, nv: 4,
          y0: () => 0.150, y1: yColarinho,
          fora: (u, v) => 0.0012 + 0.0040 * v,
        }), camisariaMat(N.esc(base, 1.10)))))
      }
      // Fita nas duas bordas internas da lapela (onde ela abre no peito) —
      // sem isso a beirada do V e uma aresta crua bem no meio do peito, o
      // primeiro lugar que a camera ve de frente.
      for (const sgn of [1, -1]) {
        noPeito.add(fita(trilho(c, c.perfil.PEITO, fSolta, 0.0044, sgn * 0.10, sgn * 0.10,
          (u) => 0.150 + 0.040 * u, 6), 0.0018, mFita))
      }
      noPeito.add(botoes(c, N.tecido(0xdccdb0, 0.5), c.perfil.PEITO, fSolta, 2, 0.070, 0.126))

      // Bolso de peito chapado, do mesmo pano.
      {
        const x = -0.062, y = 0.078
        const z = N.frenteXZ(c, c.perfil.PEITO, x, y, fSolta, 0.0018)
        const bolso = N.bloco(0.050, 0.056, 0.013, 0.008, m)
        bolso.position.set(x, y, z)
        bolso.rotation.y = Math.atan2(x * c.medida.FLAT_Z * c.medida.FLAT_Z, z)
        noPeito.add(bolso)
      }

      // ESTAMPA fixa (nao deriva de base — ver "IDENTIDADE DE TECIDO" no
      // topo do arquivo): flores coral/amarelas com folha verde, em blobs
      // achatados colados na superficie (a mesma tecnica do bolso acima:
      // bloco/bola na normal da casca), nunca textura. Todas abaixo de
      // y = 0.150 (a base do V) pra ficarem sobre a casca de verdade, e
      // longe do bolso e da coluna de botoes.
      const mFlor1 = N.tecido(HAVAI_FLOR, 0.55)
      const mFlor2 = N.tecido(HAVAI_FLOR2, 0.55)
      const mFolha = N.tecido(HAVAI_FOLHA, 0.60)
      const flores = [
        { x: 0.050, y: 0.108, cor: mFlor1, folha: true },
        { x: 0.082, y: 0.052, cor: mFlor2, folha: false },
        { x: -0.030, y: 0.040, cor: mFlor2, folha: true },
        { x: -0.090, y: 0.128, cor: mFlor1, folha: false },
        { x: 0.038, y: 0.140, cor: mFlor1, folha: true },
        { x: -0.055, y: 0.018, cor: mFlor2, folha: false },
      ]
      for (const fl of flores) {
        const z = N.frenteXZ(c, c.perfil.PEITO, fl.x, fl.y, fSolta, 0.0016)
        const pet = N.bola(0.0062, fl.cor, 8)
        pet.scale.set(1, 1, 0.40)
        pet.position.set(fl.x, fl.y, z)
        noPeito.add(pet)
        if (fl.folha) {
          const xf = fl.x + 0.010, yf = fl.y - 0.008
          const zf = N.frenteXZ(c, c.perfil.PEITO, xf, yf, fSolta, 0.0014)
          const fo = N.bola(0.0040, mFolha, 6)
          fo.scale.set(1.3, 0.7, 0.34)
          fo.position.set(xf, yf, zf)
          noPeito.add(fo)
        }
      }

      // Manga curta LARGA: os mesmos aneis de topo (deltoide), mas a parte
      // de baixo bem mais gorda e mais comprida que a da polo/jersey — e o
      // que da o caimento "boiando" tipico da havaiana, sem punho nenhum,
      // so uma bainha dobrada solta.
      const aneis = [
        { y: -0.100, r: 0.0620, cz: 0.001 },
        { y: -0.112, r: 0.0644, cz: 0.001 },
        { y: -0.096, r: 0.0648, cz: 0.002, kz: 1.02 },
        { y: -0.066, r: 0.0610, cz: 0.003, kz: 1.04, dy: -0.002 },
        { y: -0.030, r: 0.0572, cz: 0.003, kz: 1.06, dy: -0.004 },
        ...ANEL_TOPO_MANGA,
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneis, 16, { y: 0.040 }), m)), lado)
      }
      const rmH = 0.0648
      for (const lado of ['armRUpper', 'armLUpper']) {
        const p = N.revolver(comEspessura(
          [[rmH * 1.00, -0.100], [rmH * 1.01, -0.112]],
          [[rmH * 1.07, -0.112], [rmH * 1.09, -0.104], [rmH * 1.07, -0.094]],
        ), 20, 1)
        c.montar(N.sh(new THREE.Mesh(p, mDobra)), lado)
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 6 — JERSEY: camisa de time, numero nas costas, gola em V com vies.
  //
  // Silhueta: fitness/atletica — mais colada que a polo, decote em V (a
  // unica peca sem gola nenhuma subindo do peito, so a fita de vies), listras
  // na manga e uma placa de numero nas costas.
  // =========================================================================
  {
    id: 'jersey',
    nome: 'Camisa de time',
    name: 'Camisa de time',
    metodo: 'A: casca revolvida com vinco no tronco; peito em DOIS paineis que cobrem a volta inteira (como a camisa de botao) mas com a borda de cima em V na frente — decote sem gola nenhuma, so uma fita de vies debruando a curva; manga curta com friso duplo e placa de numero nas costas',
    // Moda: ESPORTISTA — corpo na cor do "time" (a escolha do jogador), com
    // vies do V, frisos da manga e placa de numero em cores FIXAS de trim
    // (TRIM_ESPORTE branco-sujo e TRIM_ESPORTE_2 quase-preto): o par que da
    // "faixas do time" — antes eram so sombras do mesmo azul, agora sao a
    // cor de acabamento que todo uniforme de verdade tem.
    esconde: ['torso', 'peito'],
    build(c) {
      const f = N.FOLGA_JUSTA
      const base = c.cor.blusa
      const m = malhaMat(base)
      const mDobra = N.tecido(N.esc(base, 0.86), 0.86)
      const mVies = N.tecido(TRIM_ESPORTE, 0.80)
      const mNumero = N.tecido(TRIM_ESPORTE_2, 0.85)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      const dobras = [
        { y: 0.095, s: 0.026, a: 0.0024 },
        { y: 0.180, s: 0.028, a: -0.0018 },
      ]
      const baixo = N.casca(c, refinar(c.perfil.PELVIS, 0.014), { folga: f })
      g.add(N.sh(new THREE.Mesh(vincar(c, baixo, 0, dobras), m)))
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f + e
      g.add(lathe(c, comEspessura(
        [[rp(0.034, 0.0006), 0.034], [rp(-0.012, 0.0008), -0.012]],
        [[rp(-0.012, 0.0050), -0.012], [rp(0.008, 0.0052), 0.008], [rp(0.036, 0.0048), 0.036]],
      ), mDobra))

      // Dois paineis cobrindo a volta inteira do peito (mesma sobreposicao
      // de 0.09 rad da camisa de botao), so que a borda de CIMA da frente
      // MERGULHA no centro — o V — em vez de ser reta.
      const AF = 1.58
      const AC = Math.PI - 1.58
      const yV = (u) => 0.196 - 0.052 * Math.max(0, 1 - Math.abs(u - 0.5) * 2.6)
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -AF, phi1: AF, nu: 16, nv: 8,
        y0: () => 0, y1: yV, fora: () => 0.0014,
      }), m)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 16, nv: 8,
        y0: () => 0, y1: () => 0.196, fora: () => 0.0014,
      }), m)))
      // Fita de vies no V — a unica "gola" que esta peca tem.
      noPeito.add(fita(trilho(c, c.perfil.PEITO, f, 0.0018, -AF, AF, yV, 18), 0.0018, mVies))

      // Costura de ombro abaulada.
      for (const sgn of [1, -1]) {
        const p0 = sgn > 0 ? 0.98 : -1.56
        const p1 = sgn > 0 ? 1.56 : -0.98
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: f, phi0: p0, phi1: p1, nu: 8, nv: 3,
          y0: (u) => 0.150 + 0.012 * u, y1: (u) => 0.160 + 0.012 * u,
          fora: (u, v) => 0.0014 + 0.0014 * Math.sin(v * Math.PI),
        }), mDobra)))
      }

      // Placa de numero nas costas — bloco raso arredondado, nao decalque:
      // e relevo que pega luz mesmo sem estampa.
      {
        const y = 0.130
        const z = -N.frenteXZ(c, c.perfil.PEITO, 0, y, f, 0.0014)
        const placa = N.bloco(0.052, 0.062, 0.006, 0.006, mNumero)
        placa.position.set(0, y, z * 0.94)
        noPeito.add(placa)
      }

      // Manga curta atletica + dois frisos (aneis finos dobrados) em vez de
      // punho — a listra classica de uniforme esportivo, feita em geometria.
      const aneis = [
        { y: -0.070, r: 0.0518, cz: 0.001 },
        { y: -0.082, r: 0.0546, cz: 0.001 },
        { y: -0.072, r: 0.0562, cz: 0.002, kz: 1.02 },
        { y: -0.050, r: 0.0548, cz: 0.003, kz: 1.04, dy: -0.002 },
        { y: -0.024, r: 0.0538, cz: 0.003, kz: 1.06, dy: -0.004 },
        ...ANEL_TOPO_MANGA,
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneis, 16, { y: 0.040 }), m)), lado)
      }
      const rmJ = 0.0546
      for (const lado of ['armRUpper', 'armLUpper']) {
        const hem = N.revolver(comEspessura(
          [[rmJ * 1.00, -0.070], [rmJ * 1.01, -0.082]],
          [[rmJ * 1.06, -0.082], [rmJ * 1.07, -0.076], [rmJ * 1.06, -0.068]],
        ), 20, 1)
        c.montar(N.sh(new THREE.Mesh(hem, mDobra)), lado)
        for (const yFriso of [-0.056, -0.048]) {
          const friso = N.tubo(rmJ * 1.065, rmJ * 1.065, 0.0055, mVies, 18)
          friso.rotation.x = Math.PI / 2
          friso.position.y = yFriso
          c.montar(friso, lado)
        }
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 7 — TRICO: canelado grosso na gola, punho e barra; malha visivel.
  //
  // Silhueta: a mais GROSSA de leitura — nao pela folga (e parecida com o
  // corta-vento em folga), mas porque a canelura cobre o corpo INTEIRO, nao
  // so as bordas. E a unica peca do catalogo com textura de malha na
  // superficie principal, e essa textura e 100% geometria (canelar aplicado
  // na casca toda), nunca canvas.
  // =========================================================================
  {
    id: 'trico',
    nome: 'Sueter de trico',
    name: 'Sueter de trico',
    metodo: 'C: dupla casca com caimento (como o moletom), com canelura FINA aplicada na casca de fora INTEIRA (malha visivel na peca toda, nao so na borda — sempre negativa, entao nunca precisa de clamp de teto) e bandas caneladas GROSSAS na gola, barra e punho pro contraste de escala',
    // Moda: FRIO — corpo na cor de la que o jogador escolheu (um trico pode
    // ser tingido de qualquer cor), mas gola/barra/punho agora sao um
    // creme de la crua FIXO (RIB_TRICO): o contraste de barra que um sueter
    // de verdade tem, em vez de barra na mesma cor so um pouco mais clara.
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const base = c.cor.blusa
      const cor = N.esc(base, 0.86)
      const m = feltroMat(cor)
      const mDentro = N.tecido(N.esc(cor, 0.62), 0.95)
      const mRib = N.tecido(RIB_TRICO, 0.95)
      const g = new THREE.Group()

      const CAI = [
        [0.036, 1.028], [0.066, 1.054], [0.150, 1.062], [0.300, 1.056],
        [0.400, 1.046], [0.455, 1.040], [0.480, 1.022],
      ]
      const esp = () => 0.0058
      const { g: shellG, noPeito, y0 } = shellDupla(c, m, mDentro, CAI, esp, 0.168, undefined, 18, 12)
      // Canelura fina na casca INTEIRA — malha visivel de verdade, e nunca
      // corre risco de estourar o teto porque canelar() so afunda o raio.
      for (const obj of shellG.children) if (obj.isMesh) canelar(obj.geometry, 22, 0.0010, c.medida.FLAT_Z)
      for (const obj of noPeito.children) if (obj.isMesh) canelar(obj.geometry, 22, 0.0010, c.medida.FLAT_Z)
      g.add(shellG)

      // Barra canelada GROSSA (a mesma tecnica do moletom).
      const rq = (y, k) => N.raioPerfil(c.perfil.PELVIS, y) * k
      const barra = N.revolver(comEspessura(
        [[rq(0.042, 1.012), 0.042], [rq(-0.024, 1.014), -0.024]],
        [[rq(-0.024, 1.040), -0.024], [rq(-0.002, 1.062), -0.002],
          [rq(0.022, 1.070), 0.022], [rq(0.044, 1.062), 0.044]],
      ), 40, c.medida.FLAT_Z)
      g.add(N.sh(new THREE.Mesh(canelar(barra, 9, 0.0024, c.medida.FLAT_Z), mRib)))
      g.add(fundo(c, mDentro, -0.024, 1.016))

      // Gola canelada GROSSA, mesma tecnica do moletom (parede de fora sobe
      // acompanhando o corpo e so depois afunila; parede de dentro desce e
      // fecha por dentro da casca interna).
      const rg = (y, k, e) => N.raioPerfil(c.perfil.PEITO, y) * k + (e || 0)
      const gola = N.revolver(comEspessura(
        [[rg(0.150, 1.056, 0.0012), 0.150], [rg(0.172, 1.056, 0.0012), 0.172],
          [rg(0.186, 1.040, 0.0010), 0.186], [rg(0.194, 1.040, 0.0010), 0.194],
          [0.0700, 0.202]],
        [[0.0655, 0.202], [0.0790, 0.186], [0.1010, 0.172], [rg(0.150, 0.992, 0), 0.150]],
        0.9,
      ), 32, c.medida.FLAT_Z)
      noPeito.add(N.sh(new THREE.Mesh(canelar(gola, 8, 0.0018, c.medida.FLAT_Z), mRib)))
      c.montar(noPeito, 'chest')

      N.mangaLonga(c, m, { r: 0.059 })
      // Ribs finos tambem na manga — sem isso a manga ficaria lisa numa
      // peca cujo corpo inteiro e canelado, e a costura entre as duas ia
      // aparecer como uma fronteira de textura no meio do ombro.
      capaOmbro(c, m, 1.05)
      punhoCanelado(c, mRib, 1.11, 1.14)
      return g
    },
  },

  // =========================================================================
  // 8 — JAQUETA JEANS: bolsos no peito com pala, botoes, barra reforcada.
  //
  // Silhueta: estruturada e ABERTA (como a camisa de botao, mas mais rigida
  // e mais curta) — ombro com relevo, dois bolsos GRANDES com pala no peito,
  // barra dobrada mais grossa que qualquer hem do catalogo.
  // =========================================================================
  {
    id: 'jaqueta-jeans',
    nome: 'Jaqueta jeans',
    name: 'Jaqueta jeans',
    metodo: 'B: paineis costurados (como a camisa de botao) em brim, com ombro estruturado, dois bolsos de peito com pala e botao, carcela de 4 botoes e barra dobrada reforcada (nervura dupla); manga comprida com tira de punho e botao',
    // Igual a camisa de botao: a peca fica ABERTA de proposito (o gancho da
    // frente e so os botoes, nao ha carcela fechando o vao inteiro) e por
    // isso nao esconde o peito — e o mesmo motivo, copiado da mesma peca.
    //
    // Moda: COWBOY — a identidade de tecido mais literal do catalogo: jeans
    // roxo nao existe, entao `cor` ignora c.cor.blusa de proposito e usa
    // AZUL_JEANS fixo (ver "IDENTIDADE DE TECIDO" no topo do arquivo). Linha
    // de costura ocre e botao latao (linha/madre, logo abaixo) ja eram
    // cores fixas antes desta passagem — so a base do brim ainda seguia o
    // jogador, e era ela que fazia esta jaqueta sair da mesma cor da regata.
    esconde: [],
    build(c) {
      const f = N.FOLGA_SOLTA
      const cor = AZUL_JEANS
      const pano = brimMat(cor)
      const linha = N.tecido2(0xd7ab63, 0.72)
      const madre = N.metal(0xc9b273)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      const AF = 1.62
      const AC = Math.PI - 1.62
      // Mesma compensacao de dz da camisa de botao — esta peca tambem nao
      // esconde 'peito', entao tambem precisa devolver os milimetros que a
      // elipse centrada da casca nao tem nas costas.
      const atras = (y, phi) => 0.0048 * Math.max(0, -Math.cos(phi))
        * Math.max(0, 1 - Math.abs(y - 0.10) / 0.11)
      const relevoOmbro = (u, v, y, phi) => {
        const d = Math.abs(Math.abs(phi) - 1.22)
        const alto = Math.max(0, Math.min(1, (y - 0.120) / 0.055))
        return 0.0016 + atras(y, phi) + 0.0032 * Math.exp(-(d * d) / 0.10) * alto
      }

      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: -AF, phi1: AF, nu: 14, nv: 9, vPot: 2.2,
        y0: () => -0.020, y1: () => 0.300, fora: () => 0.0016,
      }), pano)))
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 14, nv: 9, vPot: 2.2,
        y0: () => -0.020, y1: () => 0.300, fora: () => 0.0016,
      }), pano)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -AF, phi1: AF, nu: 14, nv: 8,
        y0: () => 0, y1: () => 0.190, fora: relevoOmbro,
      }), pano)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 14, nv: 8,
        y0: () => 0, y1: () => 0.190, fora: relevoOmbro,
      }), pano)))

      // Costuras laterais e de ombro (mesma tecnica da camisa de botao).
      for (const sgn of [1, -1]) {
        g.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PELVIS, {
          folga: f, phi: sgn * Math.PI / 2, larg: 0.16, nv: 6,
          y0: () => -0.010, y1: () => 0.300, base: 0.0016, alt: 0.0020,
        }), linha)))
        noPeito.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PEITO, {
          folga: f, phi: sgn * Math.PI / 2, larg: 0.16, nv: 5,
          y0: () => 0, y1: () => 0.150, base: 0.0016, alt: 0.0020,
        }), linha)))
      }

      // Bolsos de peito GRANDES com pala e botao — o detalhe que mais
      // diferencia esta peca da camisa de botao (que tem UM bolso raso sem
      // pala). Tecnica identica aos bolsos de calcas.js: bloco colado na
      // normal da superficie.
      for (const sgn of [1, -1]) {
        const x = sgn * 0.062, y = 0.080
        const z = N.frenteXZ(c, c.perfil.PEITO, x, y, f, 0.0018)
        const bolso = N.bloco(0.052, 0.060, 0.015, 0.008, pano)
        bolso.position.set(x, y, z)
        bolso.rotation.y = Math.atan2(x * c.medida.FLAT_Z * c.medida.FLAT_Z, z)
        noPeito.add(bolso)
        const pala = N.bloco(0.056, 0.020, 0.017, 0.006, pano)
        pala.position.set(x, y + 0.038, z * 1.02)
        pala.rotation.x = -0.10
        pala.rotation.y = Math.atan2(x * c.medida.FLAT_Z * c.medida.FLAT_Z, z)
        noPeito.add(pala)
        const bt = N.malha(new THREE.CylinderGeometry(0.0044, 0.0044, 0.0020, 8), madre,
          0, y + 0.018, 0)
        bt.rotation.x = Math.PI / 2
        bt.position.set(x, y + 0.018, N.frenteXZ(c, c.perfil.PEITO, x, y + 0.018, f, 0.0044))
        noPeito.add(bt)
      }

      // Carcela + 4 botoes, igual a camisa de botao (mesmos numeros de
      // teto, mesma folga base — herdam a mesma seguranca de raio).
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: -0.155, phi1: 0.155, nu: 5, nv: 8, vPot: 2.2,
        y0: () => -0.020, y1: () => 0.300,
        fora: (u) => 0.0018 + 0.0012 * Math.sin(u * Math.PI),
      }), pano)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -0.155, phi1: 0.155, nu: 5, nv: 5,
        y0: () => 0, y1: () => 0.176,
        fora: (u) => 0.0018 + 0.0012 * Math.sin(u * Math.PI),
      }), pano)))
      g.add(botoes(c, madre, c.perfil.PELVIS, f, 4, 0.010, 0.260))
      noPeito.add(botoes(c, madre, c.perfil.PEITO, f, 1, 0.060, 0.060))

      // Colarinho: pe + folha curta e rigida (sem canelura — brim nao e
      // trico), mesma tecnica de pe de gola da polo.
      const pe = N.tubo(0.0535, 0.0568, 0.044, pano, 16)
      pe.position.y = 0.052
      c.montar(pe, 'neck')
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: 0.40, phi1: TAU - 0.40, nu: 20, nv: 3,
        y0: (u) => 0.158 - 0.008 * Math.sin(u * Math.PI), y1: () => 0.196,
        fora: (u, v) => 0.0010 + 0.0034 * (1 - v),
      }), pano)))

      // Barra REFORCADA: dobra mais grossa que a da camisa de botao (bojo
      // maior) + uma linha de pesponto dando a volta INTEIRA logo acima —
      // e o detalhe que diz "jaqueta", nao "camisa comprida".
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f + e
      g.add(lathe(c, comEspessura(
        [[rp(-0.014, 0.0010), -0.014], [rp(-0.034, 0.0014), -0.034]],
        [[rp(-0.034, 0.0072), -0.034], [rp(-0.010, 0.0078), -0.010], [rp(0.010, 0.0068), 0.010]],
        1.15,
      ), N.tecido(N.esc(cor, 0.82), 0.82)))
      // NAO E nervura() AQUI DE PROPOSITO: nervura() e feita pra uma faixa
      // ESTREITA (o bojo sin(u*PI) dela pica no MEIO da largura, e nu fica
      // fixo em 4 porque uma costura de 0.16 rad nao precisa de mais). Uma
      // volta INTEIRA around o quadril com esse mesmo molde bojava fundo na
      // frente (u=0.5, phi=0) e sumia nas costas (u=0/1, phi=+-PI) — virava
      // meia-lua, nao anel. casca()+revolver() da o anel de verdade: raio
      // CONSTANTE em toda a volta, 24 lados (TORSO_SEG) e solda a propria
      // emenda, que e exatamente o que uma linha de pesponto precisa.
      g.add(N.sh(new THREE.Mesh(N.casca(c, N.fatia(c.perfil.PELVIS, 0.014, 0.026), {
        folga: f, extra: 0.0018,
      }), linha)))

      // Manga comprida com tira de punho e botao (jaqueta jeans nao tem
      // punho canelado — tem uma TIRA CHATA com um botao, bem diferente do
      // trico/corta-vento/colete).
      N.mangaLonga(c, pano, { r: 0.058 })
      capaOmbro(c, pano)
      for (const s of ['R', 'L']) {
        const yTira = -(c.medida.FORE_ARM - N.MANGA_FIM_Y) + 0.006
        const tira = N.bloco(0.030, 0.020, 0.006, 0.004, pano)
        tira.position.set(s === 'R' ? -0.040 : 0.040, yTira, 0.006)
        c.montar(tira, 'arm' + s + 'Lower')
        const btPunho = N.malha(new THREE.CylinderGeometry(0.0040, 0.0040, 0.0018, 8), madre,
          s === 'R' ? -0.040 : 0.040, yTira, 0.010)
        btPunho.rotation.x = Math.PI / 2
        c.montar(btPunho, 'arm' + s + 'Lower')
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },

  // =========================================================================
  // 9 — OVERSIZED: ombro caido, barra comprida, manga larga.
  //
  // Silhueta: a mais SOLTA e mais COMPRIDA do catalogo (a unica que desce
  // visivelmente alem do quadril) com o ombro caido (a manga comeca alem do
  // ombro natural, nao em cima dele) — o oposto exato da regata.
  // =========================================================================
  {
    id: 'oversized',
    nome: 'Camiseta oversized',
    name: 'Camiseta oversized',
    metodo: 'C: dupla casca com caimento (como o moletom) levada ao TETO de folga do catalogo e com a barra descendo mais que qualquer outra peca; gola canelada baixa; manga curta com o anel de topo do loft rebaixado e alargado — o ombro caido nao vem de recortar o tronco, vem da manga comecar mais larga e mais embaixo que o ombro de verdade',
    // Moda: CASUAL — a unica identidade que uma camiseta oversized precisa e
    // a SILHUETA (ja aprovada: ombro caido, barra longa), entao corpo e gola
    // continuam 100% na cor do jogador — nao ha "cor errada" pra uma
    // camiseta lisa. A etiqueta fixa na nuca (mais abaixo) ja era o unico
    // detalhe de identidade fixa que a peca precisava.
    esconde: ['torso', 'peito'],
    build(c) {
      const base = c.cor.blusa
      const cor = N.esc(base, 1.02)
      const m = malhaMat(cor)
      const mDentro = N.tecido(N.esc(cor, 0.66), 0.90)
      const mRib = N.tecido(N.esc(cor, 0.88), 0.90)
      const g = new THREE.Group()

      // Barra desce bem mais que as outras pecas (y0 = 0.010, contra 0.034
      // do moletom) — e o comprimento longo que "oversized" pede. Caimento
      // vai ate FOLGA_LARGA (o teto do catalogo) no meio do tronco: e a
      // peca mais solta que existe aqui, de proposito.
      const CAI = [
        [0.010, 1.020], [0.040, 1.052], [0.140, 1.070], [0.300, 1.062],
        [0.400, 1.050], [0.455, 1.044], [0.480, 1.026],
      ]
      const esp = () => 0.0052
      const { g: shellG, noPeito, y0 } = shellDupla(c, m, mDentro, CAI, esp, 0.170)
      g.add(shellG)

      // Barra SOLTA dobrada — sem canelura (a oversized nao cinturao no
      // quadril, e um rolo macio de pano, nao elastico) mas com espessura
      // de verdade na dobra, igual as outras.
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f2(y) + e
      function f2(y) { return tabela(CAI, y) }
      g.add(lathe(c, comEspessura(
        [[rp(0.026, 0.0006), 0.026], [rp(y0 + 0.002, 0.0008), y0 + 0.002]],
        [[rp(y0 + 0.002, 0.0050), y0 + 0.002], [rp(y0 - 0.010, 0.0052), y0 - 0.010],
          [rp(y0 - 0.010, 0.0044), y0 - 0.010]],
        1, 5,
      ), N.tecido(N.esc(cor, 0.90), 0.9)))
      g.add(fundo(c, mDentro, y0 - 0.014, 1.010))

      // Gola canelada baixa e larga — crew neck folgado, nao gola alta.
      const rg = (y, k, e) => N.raioPerfil(c.perfil.PEITO, y) * k + (e || 0)
      const gola = N.revolver(comEspessura(
        [[rg(0.156, 1.062, 0.0010), 0.156], [rg(0.178, 1.062, 0.0010), 0.178],
          [rg(0.196, 1.048, 0.0008), 0.196], [0.0730, 0.204]],
        [[0.0690, 0.204], [0.0850, 0.188], [0.1060, 0.172], [rg(0.156, 0.994, 0), 0.156]],
        0.9,
      ), 30, c.medida.FLAT_Z)
      noPeito.add(N.sh(new THREE.Mesh(canelar(gola, 8, 0.0014, c.medida.FLAT_Z), mRib)))
      c.montar(noPeito, 'chest')

      // Manga curta OMBRO CAIDO: o anel de apice fica bem mais baixo (0.014
      // em vez de 0.040) e mais largo — a manga nao sobe ate o topo do
      // ombro de verdade, ela "cai" por fora dele. Os raios sao ~35% mais
      // largos que a camiseta em toda a extensao, e os aneis de baixo tem
      // dy POSITIVO (em vez de negativo): a boca da manga pende pra fora em
      // vez de se recolher, que e a leitura de tecido caindo solto.
      const aneis = [
        { y: -0.096, r: 0.0700, cz: 0.001 },
        { y: -0.110, r: 0.0724, cz: 0.001 },
        { y: -0.094, r: 0.0736, cz: 0.002, kz: 1.02 },
        { y: -0.062, r: 0.0712, cz: 0.003, kz: 1.03, dy: 0.004 },
        { y: -0.030, r: 0.0676, cz: 0.003, kz: 1.05, dy: 0.006 },
        { y: -0.010, r: 0.0640, cz: 0.002, kz: 1.06, dy: 0.006 },
        { y: 0.002, r: 0.0560, cz: 0.002, kz: 1.07, dy: 0.003 },
        { y: 0.012, r: 0.0420, cz: 0.001, kz: 1.10 },
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneis, 18, { y: 0.014 }), m)), lado)
      }
      const rmO = 0.0724
      for (const lado of ['armRUpper', 'armLUpper']) {
        const hem = N.revolver(comEspessura(
          [[rmO * 1.00, -0.096], [rmO * 1.01, -0.110]],
          [[rmO * 1.06, -0.110], [rmO * 1.07, -0.102], [rmO * 1.06, -0.092]],
        ), 20, 1)
        c.montar(N.sh(new THREE.Mesh(hem, m)), lado)
      }

      // Etiqueta na nuca — bloquinho chapado nas costas do decote. Puro
      // "juice": nao tem funcao nenhuma alem de pegar uma lasca de luz
      // exatamente onde uma camiseta de verdade tem a etiqueta.
      {
        const y = 0.198
        const z = -N.frenteZ(c, c.perfil.PEITO, y, 1.048, 0.0006)
        const et = N.bloco(0.016, 0.010, 0.0016, 0.002, N.tecido(0xe8e2d4, 0.7))
        et.position.set(0, y, z)
        noPeito.add(et)
      }
      return g
    },
  },

  // =========================================================================
  // 10 — COLETE: acolchoado, sem manga, por cima de manga comprida, gomos
  //      horizontais.
  //
  // Silhueta: a UNICA com duas camadas de manga (a manga comprida por baixo
  // aparece inteira; o colete so cobre o tronco) e volume em FAIXAS
  // horizontais (os gomos) em vez de folga lisa — nenhuma outra peca do
  // catalogo tem relevo modulado por ALTURA em vez de angulo.
  // =========================================================================
  {
    id: 'colete',
    nome: 'Colete acolchoado',
    name: 'Colete acolchoado',
    metodo: 'camada 1: camisa de manga comprida simples (casca revolvida) cobrindo torso/peito/braco inteiro; camada 2: colete em dupla casca (metodo C) com gomos horizontais (raio modulado por ALTURA, nao por angulo — os "canais" do acolchoado) na parte fechada do tronco e dois paineis com cava nos ombros, debruados em fita',
    // Moda: FRIO com um toque SOCIAL — o colete por cima continua na cor do
    // jogador, mas agora tem FORRO fixo em vinho (COLETE_FORRO) que aparece
    // no avesso e na fita da cava/barra: e o vies colorido que faz um colete
    // acolchoado comum ler quase como um colete de alfaiataria por baixo do
    // paletó, em vez de so um gilet de trilha.
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const base = c.cor.blusa
      // Camisa de baixo num tom proprio (mais escuro): sem isso as duas
      // camadas se confundem numa peca so, igual explicado na flanela.
      const corCamisa = N.esc(base, 0.72)
      const corColete = N.esc(base, 1.10)
      const mCamisa = malhaMat(corCamisa)
      const mColete = feltroMat(corColete)
      // Forro e vies FIXOS (nao derivam de corColete): o COLETE_FORRO vinho
      // e o "por dentro e uma cor, por fora e outra" que separa um colete
      // de verdade de um saco acolchoado monocromatico.
      const mDentro = N.tecido(COLETE_FORRO, 0.55)
      const mFita = N.tecido(N.esc(COLETE_FORRO, 0.82), 0.60)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // --- camada 1: a camisa de manga comprida, simples -------------------
      const fCam = N.FOLGA_JUSTA
      g.add(N.sh(new THREE.Mesh(N.casca(c, c.perfil.PELVIS, { folga: fCam }), mCamisa)))
      const rpC = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * fCam + e
      g.add(lathe(c, comEspessura(
        [[rpC(0.034, 0.0005), 0.034], [rpC(-0.010, 0.0006), -0.010]],
        [[rpC(-0.010, 0.0040), -0.010], [rpC(0.010, 0.0042), 0.010], [rpC(0.032, 0.0038), 0.032]],
      ), N.tecido(N.esc(corCamisa, 1.30), 0.9)))
      const noPeitoCamisa = new THREE.Group()
      const pPeitoC = refinar(N.fatia(c.perfil.PEITO, 0, 0.195), 0.016)
      pPeitoC.push([N.FECHA_PESCOCO / fCam, 0.199])
      noPeitoCamisa.add(N.sh(new THREE.Mesh(N.casca(c, pPeitoC, { folga: fCam }), mCamisa)))
      c.montar(noPeitoCamisa, 'chest')
      N.mangaLonga(c, mCamisa, { r: 0.054 })
      capaOmbro(c, mCamisa)

      // --- camada 2: o colete, acolchoado em gomos horizontais -------------
      // gomo(y) e uma onda em Y SO (nao depende de phi) — e o que separa
      // "canal horizontal" de canelura vertical: entra direto na funcao de
      // raio da parede, entao afeta as duas paredes igualmente (preserva a
      // espessura) sem precisar de um passe por vertice.
      const gomo = (ya) => {
        const j = Math.max(0, Math.min(1, (ya - 0.010) / 0.020))
        const k = Math.max(0, Math.min(1, (0.420 - ya) / 0.030))
        return 0.0026 * j * k * (0.5 - 0.5 * Math.cos(ya * 62))
      }
      const CAI = [
        [0.030, 1.016], [0.060, 1.038], [0.150, 1.050], [0.300, 1.044],
        [0.400, 1.036], [0.440, 1.030], [0.460, 1.016],
      ]
      const esp = () => 0.0050
      const { g: shellG, y0 } = shellDupla(c, mColete, mDentro, CAI, esp, 0.084, gomo, 16, 10)
      // A parte de cima do colete (chest) da shellDupla cobriria o ombro
      // INTEIRO fechado, que e exatamente o que um colete NAO tem — ela
      // fica sem uso; a cava de verdade vem dos dois paineis abaixo.
      g.add(shellG)
      g.add(fundo(c, mDentro, y0 - 0.014, 1.012))

      // Barra do colete, lisa (o acolchoado ja da volume, nao precisa
      // canelar tambem) e a cava dos ombros com fita.
      const rq = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * tabela(CAI, y) + e
      g.add(lathe(c, comEspessura(
        [[rq(0.036, 0.0006), 0.036], [rq(y0 + 0.002, 0.0008), y0 + 0.002]],
        [[rq(y0 + 0.002, 0.0044), y0 + 0.002], [rq(y0 - 0.010, 0.0046), y0 - 0.010]],
      ), N.tecido(N.esc(corColete, 0.85), 0.95)))

      // Peito do colete: dois paineis estreitos com cava (mesma ideia da
      // regata) carregando o MESMO gomo horizontal, pra o acolchoado nao
      // parar seco na altura do peito. c.perfil.PEITO conta y no espaco do
      // PEITO (0 = altura da junta chest, 0.30 acima do torso) — por isso
      // estes paineis TEM que entrar num noPeito montado em 'chest', igual a
      // toda peca deste arquivo: entrando direto no grupo do tronco eles
      // nasceriam lidos como altura de QUADRIL, e a cava inteira aparecia
      // 30 cm mais baixo do que devia.
      const AF = 0.92
      const AC = Math.PI - AF
      const yTopoV = (u) => 0.058 + 0.012 * Math.abs(u - 0.5) * 2
      for (const [phi0, phi1] of [[-AF, AF], [AC, TAU - AC]]) {
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: 1.044, phi0, phi1, nu: 10, nv: 5,
          y0: () => 0, y1: yTopoV,
          fora: (u, v, y) => gomo(y + c.medida.CHEST_Y),
        }), mColete)))
        noPeito.add(fita(trilho(c, c.perfil.PEITO, 1.044, 0.0020, phi0, phi1, yTopoV, 12), 0.0020, mFita))
      }

      // Fita ao redor da cava (armhole) — a borda mais visivel do colete,
      // onde ele encontra a manga comprida por baixo.
      for (const [phi0, phi1] of [[-AF, AF], [AC, TAU - AC]]) {
        noPeito.add(fita(trilho(c, c.perfil.PEITO, 1.044, 0.0006, phi0, phi1, () => 0, 8), 0.0016, mFita))
      }
      c.montar(noPeito, 'chest')
      return g
    },
  },
]

export default CAMISAS_EXTRA
