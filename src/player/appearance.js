import * as THREE from 'three'
import * as mats from '../world/materials.js'

const { solid, stdMat, tex, PALETTE } = mats

// ---------------------------------------------------------------------------
// Catalogo de aparencia + a matematica do cranio.
//
// Este arquivo e a fonte da verdade da geometria da cabeca: character.js e os
// builds de cabelo/olho/boca/barba usam os mesmos helpers pra tudo encaixar.
// Sistema local da cabeca: origem no CENTRO do cranio, +Z = frente, +Y = cima.
//
// Nomes: o contrato (PERSONAGEM.md, 20 bytes) usa portugues — CABECAS, OLHOS,
// PUPILAS, NARIZES, BOCAS, BARBAS, CABELOS, PELES, CORES_CABELO, SOBRANCELHAS.
// Os nomes antigos (HAIR, EYES, BROWS, MOUTH, HAIR_COLORS) continuam exportados
// como apelido porque customizer.js e character.js ainda importam por eles.
// ---------------------------------------------------------------------------

/**
 * Fator de crescimento da cabeca em relacao a versao antiga.
 * Nas fotos de referencia a cabeca ocupa ~1/4.1 da altura do personagem; com os
 * raios antigos ela dava ~1/5.5. Como a parte visivel da cabeca vai do topo ate
 * o queixo (~1.8 * ry, por causa do afinamento), 1.8 * ry * S = 1.82 / 4.1
 * resolve em S ~= 1.33.
 * TODA medida facial deste arquivo e multiplicada por S: assim olhos, boca,
 * sobrancelha, cabelo e orelhas continuam encaixados sem recalcular nada.
 */
export const HEAD_S = 1.33
const S = HEAD_S

/** Tom de pele padrao: bege quente levemente rosado (ver defaultAppearance). */
export const SKIN_DEFAULT = 0xf7c6a4

/** Raios do elipsoide base da cabeca (antes do afinamento do queixo). */
export const HEAD = { rx: 0.135 * S, ry: 0.185 * S, rz: 0.13 * S }

/** Altura total da cabeca (~0.49 m). */
export const HEAD_HEIGHT = HEAD.ry * 2

/** Ancora dos olhos no espaco da cabeca (usada pra piscar sem deslocar o olho). */
export const EYE_ANCHOR = { x: 0.062 * S, y: 0.035 * S }

const TAPER = 0.42   // quanto o queixo afina abaixo do equador
const TAPER_P = 1.35 // expoente do afinamento (queixo estreito mas arredondado)
const NAPE = 0.06    // achatamento da nuca

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const wrapIdx = (i, n) => (((i | 0) % n) + n) % n

// ---------------------------------------------------------------------------
// 1. AS 8 CABECAS
//
// Nao sao a mesma cabeca escalada: cada uma e um conjunto de parametros da
// MESMA deformacao de esfera. Manter uma so funcao (em vez de 8 geometrias
// escritas na mao) e o que garante que cabelo, olho, boca e barba continuem
// grudados na pele em qualquer um dos 8 cranios — todos eles leem daqui.
//
// Todos os campos sao multiplicadores sobre HEAD.{rx,ry,rz}:
//   kx/kz    largura / profundidade
//   yTop     alongamento vertical medido A PARTIR DO QUEIXO. E medido do queixo
//            e nao do centro de proposito: o queixo e onde a cabeca encosta no
//            pescoco, entao esticar por ali levanta so a moleira e nunca abre um
//            buraco entre a cabeca e o corpo.
//   taper/taperP  afinamento do queixo (quanto e com que curva)
//   flare    engorda o queixo (pera)
//   crown    engorda (+) ou estreita (-) a moleira
//   square   maxilar quadrado: superelipse no plano XZ so na metade de baixo
//   nape     achatamento da nuca
//   temple   temporas afundadas (cranio realista)
//   occipital  saliencia do osso occipital, atras e embaixo
//   brow     saliencia da arcada superciliar
//   wobble   irregularidade de baixa frequencia (cabeca deformada)
// ---------------------------------------------------------------------------

const SHAPE_BASE = {
  kx: 1, kz: 1, yTop: 1,
  taper: TAPER, taperP: TAPER_P,
  flare: 0, crown: 0, square: 0, nape: NAPE,
  temple: 0, templeY: 0.30, templeW: 0.34,
  occipital: 0, occY: -0.08,
  brow: 0, browY: 0.34,
  wobble: 0,
}

function shape(o) { return Object.assign({}, SHAPE_BASE, o) }

export const HEAD_SHAPES = [
  // 0 ovo classico — exatamente o cranio que o jogo ja tinha
  shape({}),
  // 1 redonda — bola: pouco afinamento, mais larga e mais rasa
  shape({ kx: 1.14, kz: 1.12, yTop: 0.94, taper: 0.18, taperP: 2.0, nape: 0.03 }),
  // 2 comprida/estreita — estreita nos lados e alta na moleira
  shape({ kx: 0.87, kz: 0.96, yTop: 1.15, taper: 0.28, taperP: 1.6, nape: 0.07 }),
  // 3 quadrada de maxilar largo — superelipse embaixo cria os cantos do maxilar
  shape({ kx: 1.10, kz: 1.03, yTop: 0.99, taper: 0.05, taperP: 2.6, square: 2.1, flare: 0.10, nape: 0.11 }),
  // 4 pera — queixo largo, topo estreito (crown negativo estreita a moleira)
  shape({ kx: 1.00, kz: 1.00, yTop: 1.03, taper: 0.0, taperP: 1.5, flare: 0.46, crown: -0.34, nape: 0.05 }),
  // 5 achatada — moleira baixa e cranio largo
  shape({ kx: 1.21, kz: 1.09, yTop: 0.79, taper: 0.28, taperP: 1.5, square: 0.6, nape: 0.10 }),
  // 6 ondulada/irregular — mesma silhueta do ovo com bossas assimetricas
  shape({ kx: 1.03, kz: 1.01, yTop: 1.05, taper: 0.34, taperP: 1.4, wobble: 0.058, nape: 0.04 }),
  // 7 realista — temporas afundadas, occipital saliente, arcada superciliar
  shape({
    kx: 1.00, kz: 1.10, yTop: 1.03, taper: 0.28, taperP: 1.6, nape: 0.02, square: 0.35,
    temple: 0.085, templeY: 0.24, templeW: 0.42,
    occipital: 0.14, occY: -0.05,
    brow: 0.07, browY: 0.36,
  }),
]

/** Formato da cabeca por indice (com wrap, nunca quebra). */
export function headShapeOf(i) { return HEAD_SHAPES[wrapIdx(i, HEAD_SHAPES.length)] }

// Cranio ATIVO. Existe porque surfaceZ/eggSurface/deformEgg sao chamadas de
// dezenas de lugares (cabelo, olho, boca, barba, orelha) e passar o formato em
// todas elas espalharia o mesmo argumento por 40 assinaturas. Quem constroi um
// rosto chama useHead(ctx) antes — e todo build deste arquivo chama.
let ACTIVE = HEAD_SHAPES[0]

/** Define o cranio ativo e devolve os parametros dele. */
export function setActiveHead(i) { ACTIVE = headShapeOf(i); return ACTIVE }

/** Cranio ativo (leitura). */
export function activeHead() { return ACTIVE }

/** Le o indice de cabeca do ctx (nome novo ou antigo) e ativa o formato. */
export function useHead(ctx) {
  const i = ctx && (ctx.cabeca !== undefined ? ctx.cabeca : ctx.head)
  return setActiveHead(i || 0)
}

/**
 * Quanto os tracos do rosto se afastam do meio neste cranio. Um cranio 20% mais
 * largo com os olhos no mesmo x pareceria vesgo; espalhar 70% da largura extra
 * mantem o rosto centrado sem colar os olhos na orelha.
 */
export function faceSpread() { return 1 + (ACTIVE.kx - 1) * 0.7 }

/**
 * Semi-eixos horizontais no ponto unitario (ux,uy,uz) do cranio ativo.
 * Devolve tambem o fator de frente/tras, que nao e radial (nuca achatada,
 * occipital e arcada mexem so em Z).
 */
function axesAt(ux, uy, uz, sp, out) {
  const below = uy < 0 ? -uy : 0
  const above = uy > 0 ? uy : 0

  // perfil horizontal: afina o queixo, engorda o queixo (pera), mexe na moleira
  let w = 1 - sp.taper * Math.pow(below, sp.taperP)
  w *= 1 + sp.flare * below + sp.crown * above

  // temporas: estrangulamento SO nas laterais (ux^2 vale 1 no lado, 0 na frente)
  if (sp.temple) {
    const d = (uy - sp.templeY) / sp.templeW
    w *= 1 - sp.temple * Math.exp(-d * d) * ux * ux
  }

  // bossas irregulares: tres senoides de periodo diferente pra nao virar padrao
  if (sp.wobble) {
    const az = Math.atan2(ux, uz)
    w *= 1 + sp.wobble * (
      Math.sin(az * 3 + 0.7) * 0.6
      + Math.sin(az * 2 - 1.9 + uy * 3.1) * 0.55
      + Math.sin(uy * 4.2 + 1.3) * 0.5
    )
  }

  let fx = HEAD.rx * sp.kx * w
  let fz = HEAD.rz * sp.kz * w

  // maxilar quadrado: superelipse (|sx|^p + |sz|^p = 1) no plano horizontal.
  // p = 2 e o circulo; p > 2 empurra as diagonais pra fora e cria os cantos.
  if (sp.square) {
    const hr = Math.sqrt(ux * ux + uz * uz)
    if (hr > 1e-6) {
      const p = 2 + sp.square * Math.pow(below, 1.2)
      if (p > 2.002) {
        const sa = Math.abs(ux) / hr, ca = Math.abs(uz) / hr
        const f = 1 / Math.pow(Math.pow(sa, p) + Math.pow(ca, p), 1 / p)
        fx *= f; fz *= f
      }
    }
  }

  // frente/tras: nuca achatada, occipital saliente, arcada superciliar
  let back = 1
  const bz = uz < 0 ? -uz : 0
  if (sp.nape) back -= sp.nape * bz
  if (sp.occipital) {
    const d = (uy - sp.occY) / 0.45
    back += sp.occipital * bz * Math.exp(-d * d)
  }
  let front = 1
  if (sp.brow) {
    const d = (uy - sp.browY) / 0.22
    front += sp.brow * (uz > 0 ? uz : 0) * Math.exp(-d * d)
  }

  const o = out || { fx: 0, fz: 0 }
  o.fx = fx
  o.fz = fz * back * front
  return o
}

/** Altura final para uma altura normalizada (esticada a partir do queixo). */
function yAt(uy, sp) { return HEAD.ry * (sp.yTop * (uy + 1) - 1) }

const _ax = { fx: 0, fz: 0 }

/**
 * Deforma uma esfera unitaria no formato do cranio ativo.
 * opts sobrescreve campos do formato (o cabelo usa taper/drop/flare proprios).
 * s > 1 gera as cascas de cabelo/barba por fora da pele.
 */
export function deformEgg(geo, s = 1, opts = {}) {
  const sp = opts && (opts.taper !== undefined || opts.flare !== undefined
    || opts.crown !== undefined || opts.kx !== undefined)
    ? Object.assign({}, ACTIVE, opts)
    : ACTIVE
  const drop = (opts && opts.drop) || 0
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const below = v.y < 0 ? -v.y : 0
    axesAt(v.x, v.y, v.z, sp, _ax)
    // drop estica so pra baixo (cabelo comprido), medido no ponto original
    const y = yAt(v.y, sp) + HEAD.ry * v.y * drop * below
    pos.setXYZ(i, v.x * _ax.fx * s, y * s, v.z * _ax.fz * s)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * Geometria da cabeca no formato `index` (0..7).
 * ATENCAO: tambem ATIVA esse formato — quem monta a cabeca monta o rosto logo
 * em seguida, e o rosto precisa da mesma superficie.
 */
export function makeHeadGeometry(index, s = 1, wSeg = 30, hSeg = 24) {
  // `index` fica SEM valor padrao de proposito: character.js usa
  // makeHeadGeometry.length pra saber se esta versao aceita formato de cranio,
  // e um padrao aqui zeraria o length e mandaria ele chamar a assinatura velha.
  // Compatibilidade com a antiga makeHeadGeometry(s, wSeg, hSeg): segmento
  // nunca e <= 4 e escala nunca e > 4, entao da pra distinguir sem ambiguidade.
  if (s > 4) { hSeg = wSeg; wSeg = s; s = index; index = 0 }
  setActiveHead(index | 0)
  return deformEgg(new THREE.SphereGeometry(1, wSeg, hSeg), s)
}

/** Ponto da superficie para (theta a partir do topo, azimute 0 = frente). */
export function eggSurface(theta, az, s = 1, out) {
  const o = out || new THREE.Vector3()
  const st = Math.sin(theta)
  const ux = st * Math.sin(az), uy = Math.cos(theta), uz = st * Math.cos(az)
  axesAt(ux, uy, uz, ACTIVE, _ax)
  o.set(ux * _ax.fx * s, yAt(uy, ACTIVE) * s, uz * _ax.fz * s)
  return o
}

/** Normal aproximada em (theta, az) — elipsoide do cranio ativo, sem detalhe. */
export function eggNormal(theta, az, out) {
  const o = out || new THREE.Vector3()
  const st = Math.sin(theta)
  const sp = ACTIVE
  o.set(
    (st * Math.sin(az)) / (HEAD.rx * sp.kx),
    Math.cos(theta) / (HEAD.ry * sp.yTop),
    (st * Math.cos(az)) / (HEAD.rz * sp.kz),
  )
  return o.normalize()
}

/**
 * Z da superficie frontal da cabeca em (x,y). pad = folga anti z-fighting.
 * Precisa iterar porque os semi-eixos dependem da direcao (maxilar quadrado e
 * bossas): comeca supondo o meio da testa e converge em 3 passadas.
 */
export function surfaceZ(x, y, pad = 0) {
  const sp = ACTIVE
  const uy = clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1)
  const st = Math.sqrt(Math.max(0, 1 - uy * uy))
  let ux = 0, uz = st
  for (let k = 0; k < 3; k++) {
    axesAt(ux, uy, uz, sp, _ax)
    ux = clamp(x / Math.max(1e-6, _ax.fx), -1, 1)
    const s2 = 1 - uy * uy - ux * ux
    uz = s2 > 0 ? Math.sqrt(s2) : 0
  }
  axesAt(ux, uy, uz, sp, _ax)
  return uz * _ax.fz + pad
}

/**
 * Projeta uma geometria plana (desenhada no plano XY em coordenadas locais da
 * cabeca) sobre a superficie do cranio: o Z original vira "altura sobre a pele".
 * E o que faz sobrancelha/boca/bigode acompanharem a curva sem z-fighting.
 */
export function wrapToHead(geo, pad = 0.004) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    pos.setZ(i, surfaceZ(x, y, pad) + z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

// --- utilitarios pequenos ---------------------------------------------------

function shade(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex()
}

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Decoracao que nao pode projetar sombra em si mesma (iris, palpebra, cilio). */
function flatPiece(m) { m.castShadow = false; m.receiveShadow = false; return m }

/** PRNG deterministico (mesmo cabelo espetado toda vez). */
function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** Alinha o +Y do objeto com uma direcao. */
const _UPY = new THREE.Vector3(0, 1, 0)
function alignY(obj, dir) { obj.quaternion.setFromUnitVectors(_UPY, dir) }

const EXTRUDE = { depth: 0.012 * S, bevelEnabled: true, bevelThickness: 0.0022 * S, bevelSize: 0.0022 * S, bevelSegments: 2, curveSegments: 5 }

function extrudeOpts(depth, bevel, seg) {
  const o = Object.assign({}, EXTRUDE, { depth, bevelThickness: bevel, bevelSize: bevel })
  if (seg) o.curveSegments = seg
  return o
}

/**
 * Barra curva no plano XY: base de sobrancelhas, bocas, bigodes.
 * curve > 0 = arco pra cima no meio. taperEnds afina as pontas.
 */
function curvedBar(cx, cy, len, thick, curve, tilt = 0, taperEnds = 0.55, n = 14) {
  const co = Math.cos(tilt), si = Math.sin(tilt)
  const pts = []
  const push = (x, y) => pts.push([cx + x * co - y * si, cy + x * si + y * co])
  const th = (t) => thick * (1 - taperEnds * Math.pow(Math.abs(t * 2 - 1), 1.8))
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = (t - 0.5) * len
    push(x, curve * (1 - 4 * (t - 0.5) * (t - 0.5)) - th(t) / 2)
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n, x = (t - 0.5) * len
    push(x, curve * (1 - 4 * (t - 0.5) * (t - 0.5)) + th(t) / 2)
  }
  const s = new THREE.Shape()
  s.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1])
  s.closePath()
  return s
}

/** Mesh de um Shape ja projetado na cabeca. */
function facePiece(shape_, mat, depth = 0.011 * S, pad = 0.004 * S, bevel = 0.0022 * S, seg = 0) {
  const geo = new THREE.ExtrudeGeometry(shape_, extrudeOpts(depth, bevel, seg))
  wrapToHead(geo, pad)
  return sh(new THREE.Mesh(geo, mat))
}

/** Bolota colada na superficie do rosto (narizes, verrugas, cantos de boca). */
function blob(mat, sx, sy, sz, x, y, out = 0) {
  const m = sh(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat))
  m.scale.set(sx, sy, sz)
  m.position.set(x, y, surfaceZ(x, y) + out)
  return m
}

/**
 * Interpolador suave sobre |az| (0 = frente, PI = nuca).
 * pares = [[angulo, valor], ...] em ordem crescente. Usado por linha de cabelo
 * e linha de barba: rampa linear cria um canto vivo que le como aba colada.
 */
function byAz(pairs) {
  return (az) => {
    const a = az < 0 ? -az : az
    if (a <= pairs[0][0]) return pairs[0][1]
    for (let i = 1; i < pairs.length; i++) {
      if (a <= pairs[i][0]) {
        const p0 = pairs[i - 1], p1 = pairs[i]
        const t = (a - p0[0]) / (p1[0] - p0[0])
        return p0[1] + (p1[1] - p0[1]) * t * t * (3 - 2 * t)
      }
    }
    return pairs[pairs.length - 1][1]
  }
}

/** Linha do cabelo suave: theta = front na testa, side nas laterais/nuca. */
function hairline(front, side, a0, a1) { return byAz([[a0, front], [a1, side]]) }

// ---------------------------------------------------------------------------
// 2. PELE
// ---------------------------------------------------------------------------

/**
 * Tons de pele. avatares.js le SKIN_TONES por nome (a rede manda INDICE, nao
 * cor): duas listas divergentes fariam o mesmo byte pintar peles diferentes no
 * boneco local e no remoto.
 */
export const SKIN_TONES = [
  SKIN_DEFAULT, // 0 bege quente (padrao)
  0xf2d6bb,     // 1 claro rosado
  0xd9a172,     // 2 medio dourado
  0xa66c3f,     // 3 castanho
  0x6f4526,     // 4 escuro
]

export const PELES = [
  { id: 'bege', nome: 'Bege', name: 'Bege', hex: SKIN_TONES[0], build: () => null },
  { id: 'claro', nome: 'Claro', name: 'Claro', hex: SKIN_TONES[1], build: () => null },
  { id: 'dourado', nome: 'Dourado', name: 'Dourado', hex: SKIN_TONES[2], build: () => null },
  { id: 'castanho', nome: 'Castanho', name: 'Castanho', hex: SKIN_TONES[3], build: () => null },
  { id: 'escuro', nome: 'Escuro', name: 'Escuro', hex: SKIN_TONES[4], build: () => null },
]

/** Cor de pele por indice. Valor > 255 ja e uma cor pronta e passa direto. */
export function skinColorOf(i) {
  const n = i | 0
  if (n > 255) return n
  return SKIN_TONES[wrapIdx(n, SKIN_TONES.length)]
}

/** Cor de pele que o build deve usar: ctx.skin (cor) ou ctx.pele (indice). */
function skinOf(ctx) {
  if (ctx && ctx.skin !== undefined) return skinColorOf(ctx.skin)
  if (ctx && ctx.pele !== undefined) return skinColorOf(ctx.pele)
  return SKIN_DEFAULT
}

// ---------------------------------------------------------------------------
// 3. CABELO
// ---------------------------------------------------------------------------

export const CORES_CABELO = [
  { id: 'preto', nome: 'Preto', name: 'Preto', hex: 0x1c1718, build: () => null },
  { id: 'castanho', nome: 'Castanho', name: 'Castanho', hex: 0x4a2c19, build: () => null },
  { id: 'ruivo', nome: 'Ruivo', name: 'Ruivo', hex: 0xb2481f, build: () => null },
  { id: 'loiro', nome: 'Loiro', name: 'Loiro', hex: 0xd9ac57, build: () => null },
  { id: 'grisalho', nome: 'Grisalho', name: 'Grisalho', hex: 0x9c9791, build: () => null },
  { id: 'platinado', nome: 'Platinado', name: 'Platinado', hex: 0xe7e1d3, build: () => null },
]

function hairMat(color, flat) {
  return solid(color, 0.92, 0.02, { side: THREE.DoubleSide, flatShading: !!flat })
}

/**
 * Casca colada no cranio, recortada por duas linhas em theta.
 * Os vertices que passam da linha COLAPSAM nela: recorte limpo sem CSG.
 * Como y = ry*cos(theta), theta constante da uma linha reta na testa.
 * opts: { s, t0, t1, lo(az), hi(az), azHalf, flat, wSeg, hSeg, taper/drop/flare }
 */
function headShell(color, opts = {}) {
  const s = opts.s || 1.03
  const t0 = opts.t0 !== undefined ? opts.t0 : 0
  const t1 = opts.t1 !== undefined ? opts.t1 : Math.PI
  const wSeg = opts.wSeg || 36, hSeg = opts.hSeg || 26
  // azHalf limita a casca a um setor na FRENTE (franja reta). No SphereGeometry
  // phi = PI/2 aponta pra +Z, entao o setor frontal e centrado ali.
  const phiStart = opts.azHalf ? Math.PI / 2 - opts.azHalf : 0
  const phiLen = opts.azHalf ? opts.azHalf * 2 : Math.PI * 2
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg, phiStart, phiLen, t0, t1 - t0)
  const lo = opts.lo, hi = opts.hi
  if (lo || hi) {
    const pos = geo.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const az = Math.atan2(v.x, v.z)
      const th = Math.acos(clamp(v.y, -1, 1))
      let lim = th
      if (lo) { const l = lo(az); if (lim < l) lim = l }
      if (hi) { const h = hi(az); if (lim > h) lim = h }
      if (lim !== th) {
        const st = Math.sin(lim)
        pos.setXYZ(i, st * Math.sin(az), Math.cos(lim), st * Math.cos(az))
      }
    }
    pos.needsUpdate = true
  }
  deformEgg(geo, s, opts)
  return sh(new THREE.Mesh(geo, hairMat(color, opts.flat)))
}

/** Casca de cabelo: do topo ate a linha lineFn(az). */
function scalp(color, lineFn, opts = {}) {
  return headShell(color, Object.assign({}, opts, {
    s: opts.s || 1.035,
    t0: 0,
    t1: opts.thetaMax || 1.62,
    hi: lineFn,
  }))
}

function hairColorFrom(ctx) {
  if (ctx && ctx.hairColor !== undefined) return hairColorOf(ctx.hairColor)
  if (ctx && ctx.corCabelo !== undefined) return hairColorOf(ctx.corCabelo)
  return CORES_CABELO[1].hex
}

export const CABELOS = [
  {
    id: 'short',
    nome: 'Curto',
    name: 'Curto',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      // Linha da franja em theta constante na frente => borda RETA na testa.
      // 0.84 deixa ~15 mm de testa livre acima da sobrancelha; mais baixo que
      // isso e o cabelo invade a sobrancelha.
      g.add(scalp(c, hairline(0.84, 1.60, 0.86, 2.30), { s: 1.035, thetaMax: 1.62 }))
      // Franja: casca extra SO no setor frontal, maior e um pouco mais baixa
      // que o cap, criando a aba reta que pende sobre a testa.
      g.add(scalp(c, () => 0.90, { s: 1.078, thetaMax: 0.90, azHalf: 1.00, wSeg: 30, hSeg: 16 }))
      // volume extra no topo pra silhueta nao ficar colada demais
      g.add(scalp(c, () => 0.62, { s: 1.078, thetaMax: 0.62, wSeg: 28, hSeg: 12 }))
      return g
    },
  },
  {
    id: 'spiky',
    nome: 'Espetado',
    name: 'Espetado',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(scalp(c, hairline(0.86, 1.53, 0.80, 2.20), { s: 1.04, thetaMax: 1.55, flat: true }))
      // espinhos: cones ao longo da normal do cranio, tamanhos irregulares
      const m = hairMat(c, true)
      const r = rng(1337)
      const geos = [
        new THREE.ConeGeometry(0.030 * S, 0.105 * S, 6),
        new THREE.ConeGeometry(0.024 * S, 0.082 * S, 5),
        new THREE.ConeGeometry(0.034 * S, 0.125 * S, 6),
      ]
      const n = new THREE.Vector3()
      for (let i = 0; i < 17; i++) {
        const theta = 0.10 + r() * 0.82
        const az = r() * Math.PI * 2
        const gi = geos[(i * 7 + 1) % geos.length]
        const spike = sh(new THREE.Mesh(gi, m))
        eggNormal(theta, az, n)
        eggSurface(theta, az, 1.03, spike.position)
        // inclina um pouco pra tras: cabelo espetado nunca e simetrico
        n.x += (r() - 0.5) * 0.35; n.z += -0.12 + (r() - 0.5) * 0.3
        n.normalize()
        alignY(spike, n)
        spike.position.addScaledVector(n, (0.030 + r() * 0.020) * S)
        spike.scale.setScalar(0.8 + r() * 0.5)
        g.add(spike)
      }
      return g
    },
  },
  {
    id: 'long',
    nome: 'Comprido',
    name: 'Comprido',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      // uma unica casca: franja reta na testa e, depois de uma transicao suave,
      // a cortina longa dos lados e da nuca
      const front = hairline(0.86, 2.05, 0.72, 1.06)
      const back = hairline(2.05, 2.50, 1.06, 2.40)
      g.add(scalp(c, (az) => {
        const a = az < 0 ? -az : az
        return a < 1.06 ? front(az) : back(az)
      }, { s: 1.05, thetaMax: 2.52, taper: 0.10, drop: 0.85, flare: 0.30, hSeg: 34 }))
      // Duas mechas emoldurando o rosto ate o queixo. Sem alinhar pela normal de
      // proposito: a normal do cranio ali e quase lateral e deitava a mecha.
      const m = hairMat(c)
      for (const sgn of [1, -1]) {
        const strand = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.026 * S, 0.012 * S, 0.300 * S, 6), m))
        strand.scale.set(1.25, 1, 0.8)
        // nasce ACIMA da linha do corte pra o topo ficar enterrado na cortina
        eggSurface(1.22, sgn * 0.88, 1.045, strand.position)
        strand.position.y -= 0.139 * S
        strand.rotation.y = sgn * 0.50
        strand.rotation.z = -sgn * 0.22
        g.add(strand)
      }
      return g
    },
  },
  {
    id: 'buzz',
    nome: 'Raspado',
    name: 'Raspado',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      // casca fina: o corte raspado e quase so uma mudanca de cor, e a entrada
      // em M na testa e o que impede de ler como touca de natacao
      const line = byAz([[0.30, 0.82], [0.72, 0.70], [1.10, 1.05], [2.30, 1.56]])
      g.add(scalp(shade(c, 0.62), line, { s: 1.022, thetaMax: 1.60, wSeg: 40, hSeg: 26 }))
      return g
    },
  },
  {
    id: 'mohawk',
    nome: 'Moicano',
    name: 'Moicano',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      // lateral raspada bem rente
      g.add(scalp(shade(c, 0.5), hairline(0.98, 1.52, 0.90, 2.20), { s: 1.016, thetaMax: 1.56, wSeg: 34 }))
      // A crista e uma casca do proprio cranio 16% maior, ACHATADA EM X. Blocos
      // enfileirados pela linha do meio nao servem: alignY orienta so o +Y do
      // bloco, o resto do giro fica solto e a crista sai em escada torta.
      // Achatar a casca resolve de uma vez — a barbatana ja nasce seguindo a
      // curva da cabeca, da testa ate a nuca.
      const fin = scalp(c, () => 1.22, { s: 1.16, thetaMax: 1.22, wSeg: 40, hSeg: 22, flat: true })
      fin.scale.x = 0.20
      g.add(fin)
      return g
    },
  },
]

// ---------------------------------------------------------------------------
// 4. OLHOS + PUPILAS
//
// Na referencia o olho e SEMICERRADO: a palpebra superior corta o globo por
// cima e a pupila e grande e escura. A palpebra e GEOMETRIA (calota na cor da
// pele por cima do globo), nunca textura.
//
// A calota da palpebra tem polo em +Y e e tombada pra frente por `tilt`. Isso
// nao e detalhe: a borda dela projetada de frente vira uma ELIPSE — mais baixa
// no meio (cos(tilt+arc)) e mais alta nos cantos (cos(arc)*cos(tilt)) — que e
// exatamente o arco de uma palpebra de verdade. Uma calota sem tilt daria uma
// linha reta atravessando o olho.
//
// Divisao de trabalho: OLHOS constroi globo, esclera e palpebras; PUPILAS
// constroi iris/pupila/brilho. Se character.js NAO tiver um slot separado de
// pupila (ctx.slotPupila), OLHOS ja inclui a pupila — assim o boneco nunca
// aparece com o olho todo branco durante a reforma.
// ---------------------------------------------------------------------------

// Geometria-modelo do globo. NUNCA vai direto pra cena: character.clearSlot()
// da dispose() em toda geometria do slot, e como este modulo e compartilhado
// por TODOS os Characters isso quebraria os outros bonecos.
const EYE_GEO = new THREE.SphereGeometry(1, 24, 18)

/** Clone descartavel do globo — seguro pro dispose por instancia. */
function eyeBallGeo() { return EYE_GEO.clone() }

/**
 * Calota esferica de raio 1 com o polo virado pra +Z (a rotacao ja vem assada
 * na geometria). Usada pra iris/pupila/brilho: como acompanham a curvatura do
 * globo, nunca somem atras dele nem brigam no z-buffer.
 */
function capGeo(thetaLength, wSeg = 20, hSeg = 10) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, thetaLength)
  g.rotateX(Math.PI / 2)
  return g
}

/** Calota com o polo em +Y (palpebra). */
function lidGeo(thetaLength, wSeg = 26, hSeg = 12) {
  return new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, thetaLength)
}

function scleraMat(veins) {
  if (veins) {
    const map = tex('sclera-veias', 256, (g, s) => {
      g.fillStyle = '#f7e6df'; g.fillRect(0, 0, s, s)
      // veias irregulares e ramificadas, grossas o bastante pra lerem de longe
      // (o olho tem so ~8 cm na tela a 3 m)
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * s, y = Math.random() * s
        g.strokeStyle = i % 3 === 0 ? 'rgba(176,26,26,0.85)' : 'rgba(206,72,72,0.7)'
        g.lineWidth = 1.6 + Math.random() * 3.0
        g.lineCap = 'round'
        g.beginPath(); g.moveTo(x, y)
        let px = x, py = y
        const a0 = Math.random() * 7
        for (let k = 0; k < 5; k++) {
          px += Math.cos(a0 + (Math.random() - 0.5) * 1.4) * 14
          py += Math.sin(a0 + (Math.random() - 0.5) * 1.4) * 14
          g.lineTo(px, py)
        }
        g.stroke()
        g.lineWidth *= 0.55
        g.beginPath(); g.moveTo(px, py)
        g.lineTo(px + (Math.random() - 0.5) * 26, py + (Math.random() - 0.5) * 26)
        g.stroke()
      }
      const grd = g.createLinearGradient(0, 0, 0, s)
      grd.addColorStop(0, 'rgba(214,120,110,0.5)')
      grd.addColorStop(0.5, 'rgba(255,240,236,0)')
      grd.addColorStop(1, 'rgba(214,120,110,0.45)')
      g.fillStyle = grd; g.fillRect(0, 0, s, s)
    })
    return stdMat('sclera:veias', { map, roughness: 0.22, metalness: 0.0 })
  }
  return stdMat('sclera:limpa', { color: 0xf7f3ec, roughness: 0.18, metalness: 0.0 })
}

const irisMatOf = (hex) => solid(hex, 0.24, 0.05)
const pupilMat = () => solid(0x0a080a, 0.32, 0.0)
const glintMat = () => stdMat('eye-glint', { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.1 })

/**
 * Monta o par de olhos: para cada lado cria a "concha" (Group com a escala do
 * elipsoide) e chama make(sgn, shell).
 *
 * O truque do shell: o grupo carrega a escala (rx,ry,rz) e tudo dentro dele tem
 * raio 1 e so ROTACAO. Como o Three compoe pai*filho, a escala entra DEPOIS da
 * rotacao — entao qualquer calota rotacionada cai exatamente sobre o elipsoide,
 * sem deformar e sem precisar calcular z de tampa plana.
 */
function eyeRig(g, make) {
  const grp = new THREE.Group()
  const spread = faceSpread()
  for (const sgn of [1, -1]) {
    const eye = new THREE.Group()
    const x = (EYE_ANCHOR.x + (g.dx || 0)) * spread
    const y = EYE_ANCHOR.y + (g.dy || 0)
    // sink = quanto do globo fica DENTRO da cabeca. Alto (>0.5) = olho encaixado
    // na orbita, que e o da referencia; baixo = bolha saliente de desenho.
    eye.position.set(sgn * x, y, surfaceZ(sgn * x, y) - g.rz * g.sink)
    if (g.toe) eye.rotation.y = -sgn * g.toe
    const shell = new THREE.Group()
    shell.scale.set(g.rx, g.ry, g.rz)
    eye.add(shell)
    make(sgn, shell)
    grp.add(eye)
  }
  return grp
}

/**
 * Palpebra: calota de pele por cima do globo + fio escuro de cilio aparecendo
 * na borda. O cilio e uma calota IGUAL, so que um pouco maior em arco e MENOR
 * em escala: fica escondida por baixo da pele e so a faixa alem da borda
 * aparece — um tracinho de espessura constante sem precisar de textura.
 */
// Camadas do olho, do globo pra fora. Todas sao calotas de raio 1 dentro do
// mesmo shell, entao "escala" aqui e literalmente altura sobre a esclera: com
// raio ~6 cm, 1% = 0.6 mm. Longe o bastante do vizinho pra nunca haver
// z-fighting, perto o bastante pra palpebra COLAR no globo em vez de pairar
// sobre ele como uma casca solta (foi o primeiro erro desta reforma).
const L_SCLERA = 1.004
const L_IRIS = 1.014
const L_PUPIL = 1.024
const L_GLINT = 1.036
const L_LASH = 1.050
const L_LID = 1.064

function addLid(shell, sgn, spec, skin, lower) {
  const skinM = solid(shade(skin, spec.tone || (lower ? 0.97 : 0.90)), 0.72, 0.0, { side: THREE.DoubleSide })
  const lashM = solid(shade(skin, 0.13), 0.6, 0.0, { side: THREE.DoubleSide })
  const base = lower ? Math.PI - spec.tilt : spec.tilt
  const lash = spec.lash || 0.055
  // roll positivo derruba o canto de FORA. O polo da calota esta em +Y, e
  // girar em Z leva o polo pro lado: -sgn manda pro lado de fora da cara.
  const roll = -sgn * (spec.roll || 0)

  // cilio: calota IGUAL, arco maior e escala MENOR. Fica escondida sob a pele e
  // so a faixa alem da borda aparece — tracinho de espessura constante sem
  // textura nenhuma.
  const lashMesh = flatPiece(new THREE.Mesh(lidGeo(spec.arc + lash, 28, 12), lashM))
  lashMesh.scale.setScalar(L_LASH)
  lashMesh.rotation.set(lower ? base - lash : base, 0, roll)
  shell.add(lashMesh)

  const lid = flatPiece(new THREE.Mesh(lidGeo(spec.arc, 28, 14), skinM))
  lid.scale.setScalar(L_LID)
  lid.rotation.set(base, 0, roll)
  shell.add(lid)
  return lid
}

/** Iris + pupila + brilho, colados na superficie do globo `g`. */
function addPupil(shell, sgn, g, p) {
  // Raios lineares do catalogo viram angulos de calota (r = rx * sen(theta)).
  const irisTheta = Math.asin(clamp((p.iris * S) / g.rx, 0.06, 0.94))
  const pupilTheta = Math.min(irisTheta * 0.88, Math.asin(clamp((p.pupil * S) / g.rx, 0.04, 0.9)))

  const iris = flatPiece(new THREE.Mesh(capGeo(irisTheta, 26, 12), irisMatOf(p.cor)))
  iris.scale.setScalar(L_IRIS)
  iris.receiveShadow = true
  shell.add(iris)

  const pupil = flatPiece(new THREE.Mesh(capGeo(pupilTheta, 22, 10), pupilMat()))
  pupil.scale.setScalar(L_PUPIL)
  shell.add(pupil)

  // brilho especular: calota pequena deslocada pro lado de dentro e um pouco
  // pra cima. Nao pode subir demais: com a palpebra baixa ele encosta na borda
  // do cilio e le como um caco branco, e nao como reflexo.
  const glint = flatPiece(new THREE.Mesh(capGeo(pupilTheta * (p.glint || 0.44), 12, 6), glintMat()))
  glint.scale.setScalar(L_GLINT)
  glint.rotation.set(-0.16, -sgn * 0.32, 0)
  shell.add(glint)
}

/** Olheira: meia-lua escura ABAIXO do olho. */
function eyeBags(skin, y) {
  const g = new THREE.Group()
  const dark = solid(shade(skin, 0.62), 0.92)
  const spread = faceSpread()
  for (const sgn of [1, -1]) {
    // bem rasa (3 mm): olheira e mancha, nao bolsa. Extrudada demais ela pega
    // luz de cima e vira uma saliencia clara — o oposto do que devia ler.
    g.add(facePiece(
      curvedBar(sgn * EYE_ANCHOR.x * spread, y, 0.068 * S, 0.014 * S, -0.011 * S, 0, 0.7),
      dark, 0.003 * S, 0.0022 * S, 0.0010 * S,
    ))
  }
  return g
}

// Especificacoes das PUPILAS (medidas em unidades ANTES de HEAD_S; addPupil
// multiplica). iris/pupil sao raios lineares na superficie do globo.
const PUPIL_SPECS = [
  { iris: 0.0210, pupil: 0.0125, cor: 0x3d2718, veins: false, glint: 0.50 },
  { iris: 0.0155, pupil: 0.0075, cor: 0x543c26, veins: false, glint: 0.58 },
  { iris: 0.0250, pupil: 0.0200, cor: 0x241a14, veins: false, glint: 0.42 },
  { iris: 0.0225, pupil: 0.0110, cor: 0x4f93a6, veins: false, glint: 0.52 },
  { iris: 0.0205, pupil: 0.0155, cor: 0x7a4a26, veins: true, glint: 0.44 },
]

const PUPIL_NAMES = [
  ['media', 'Media escura'],
  ['pequena', 'Pequena'],
  ['grande', 'Grande dilatada'],
  ['clara', 'Clara'],
  ['bloodshot', 'Vermelha'],
]

/** Indice de pupila que veio no ctx (nome novo ou antigo). */
function pupilIdx(ctx) {
  if (!ctx) return 0
  const v = ctx.pupila !== undefined ? ctx.pupila : ctx.pupil
  return wrapIdx(v || 0, PUPIL_SPECS.length)
}

/** Indice de olho que veio no ctx (nome novo ou antigo). */
function eyeIdx(ctx) {
  if (!ctx) return 0
  const v = ctx.olhos !== undefined ? ctx.olhos : ctx.eyes
  return wrapIdx(v || 0, EYE_SPECS.length)
}

// Globo e palpebras de cada opcao de OLHOS.
//   globo.sink  quanto do globo entra na cabeca (0.5 = metade)
//   up/low      { arc, tilt, lash, tone } das palpebras. A borda da palpebra
//               superior cruza o meio do olho na altura cos(tilt+arc) do globo:
//               ~0.35 e "aberto", ~0.12 e "semicerrado", ~0.60 e "arregalado".
// `open` = raio angular da calota branca; e ele que da a LARGURA do olho.
// tilt + arc de cada palpebra da a altura da abertura: a borda cruza o meio do
// olho em cos(tilt+arc) (a de cima) e -cos(tilt+arc) (a de baixo), medido em
// raios do globo. Os comentarios trazem a conta de cada opcao.
const EYE_SPECS = [
  {
    id: 'normal', nome: 'Normal', name: 'Normal',
    globo: { rx: 0.0420 * S, ry: 0.0420 * S, rz: 0.0355 * S, sink: 0.72, open: 0.88, dx: 0, dy: 0 },
    up: { arc: 0.78, tilt: 0.42 },              // +0.36
    low: { arc: 0.40, tilt: 0.58, lash: 0.04 }, // -0.56
  },
  {
    id: 'meio', nome: 'Semicerrado', name: 'Semicerrado',
    // o da referencia: palpebra cortando o globo logo acima do meio da pupila
    globo: { rx: 0.0435 * S, ry: 0.0420 * S, rz: 0.0360 * S, sink: 0.74, open: 0.92, dx: 0.001 * S, dy: -0.001 * S },
    up: { arc: 0.86, tilt: 0.46, lash: 0.065 }, // +0.25
    low: { arc: 0.46, tilt: 0.62, lash: 0.04 }, // -0.47
  },
  {
    id: 'wide', nome: 'Arregalado', name: 'Arregalado',
    globo: { rx: 0.0470 * S, ry: 0.0490 * S, rz: 0.0400 * S, sink: 0.62, open: 1.00, dx: 0.003 * S, dy: 0.003 * S },
    up: { arc: 0.50, tilt: 0.24, lash: 0.05 },  // +0.74
    low: { arc: 0.28, tilt: 0.38, lash: 0.04 }, // -0.79
  },
  {
    id: 'tired', nome: 'Caido', name: 'Caido',
    globo: { rx: 0.0425 * S, ry: 0.0410 * S, rz: 0.0350 * S, sink: 0.74, open: 0.88, dx: 0, dy: -0.002 * S },
    // roll = queda do canto de FORA, o que da a cara de cansado
    up: { arc: 0.84, tilt: 0.44, lash: 0.065, roll: 0.34, tone: 0.86 }, // +0.29
    low: { arc: 0.38, tilt: 0.56, lash: 0.04 }, // -0.59
    bags: true,
  },
  {
    id: 'squint', nome: 'Apertado', name: 'Apertado',
    globo: { rx: 0.0445 * S, ry: 0.0400 * S, rz: 0.0350 * S, sink: 0.76, open: 0.90, dx: 0, dy: -0.001 * S },
    // as duas palpebras entram uma na outra: sobra so uma fresta desconfiada
    up: { arc: 0.90, tilt: 0.46, lash: 0.07, roll: -0.22 }, // +0.21
    low: { arc: 0.52, tilt: 0.68, lash: 0.04 },             // -0.36
  },
]

function buildEyes(spec, ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const p = PUPIL_SPECS[pupilIdx(ctx)]
  const g = spec.globo
  // O GLOBO INTEIRO e da cor da pele e so uma CALOTA na frente e branca. E o
  // que faz os cantos do olho serem pele em vez de duas fatias brancas
  // aparecendo dos lados da palpebra: nenhuma calota de palpebra chega a 90
  // graus, entao sempre sobraria esclera exposta na lateral do globo.
  // De quebra, o globo vira a saliencia da propria palpebra.
  const ballM = solid(shade(skin, 0.97), 0.7, 0.0)
  const grp = eyeRig(g, (sgn, shell) => {
    shell.add(sh(new THREE.Mesh(eyeBallGeo(), ballM)))
    const sclera = flatPiece(new THREE.Mesh(capGeo(g.open || 0.92, 26, 12), scleraMat(p.veins)))
    sclera.scale.setScalar(L_SCLERA)
    sclera.receiveShadow = true
    shell.add(sclera)
    // sem slot proprio de pupila, o olho ja sai completo (ver comentario da secao)
    if (!(ctx && ctx.slotPupila)) addPupil(shell, sgn, g, p)
    if (spec.up) addLid(shell, sgn, spec.up, skin, false)
    if (spec.low) addLid(shell, sgn, spec.low, skin, true)
  })
  if (spec.bags) grp.add(eyeBags(skin, EYE_ANCHOR.y - 0.050 * S))
  return grp
}

export const OLHOS = EYE_SPECS.map((spec) => ({
  id: spec.id,
  nome: spec.nome,
  name: spec.name,
  globo: spec.globo,
  build(ctx) { return buildEyes(spec, ctx) },
}))

export const PUPILAS = PUPIL_SPECS.map((p, i) => ({
  id: PUPIL_NAMES[i][0],
  nome: PUPIL_NAMES[i][1],
  name: PUPIL_NAMES[i][1],
  spec: p,
  /**
   * So a camada iris/pupila/brilho, montada sobre o globo do olho escolhido.
   * Devolve null quando nao ha slot proprio: nesse caso OLHOS ja desenhou a
   * pupila e desenhar de novo daria z-fighting em cima da iris.
   */
  build(ctx) {
    if (!(ctx && ctx.slotPupila)) return null
    useHead(ctx)
    const g = EYE_SPECS[eyeIdx(ctx)].globo
    return eyeRig(g, (sgn, shell) => addPupil(shell, sgn, g, p))
  },
}))

// ---------------------------------------------------------------------------
// 5. SOBRANCELHAS
// ---------------------------------------------------------------------------

// Fica na testa, acima do globo, pra ler como sobrancelha e nao como palpebra.
const BROW_Y = 0.096 * S

function browsFrom(make) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) g.add(make(sgn))
  return g
}

export const SOBRANCELHAS = [
  {
    id: 'thick', nome: 'Grossa reta', name: 'Grossa reta',
    build(ctx) {
      useHead(ctx)
      const sp = faceSpread()
      const m = solid(shade(hairColorFrom(ctx), 0.55), 0.95)
      // 30 mm de altura e 18 mm de saliencia: bloco que ainda se distingue a 3 m
      return browsFrom((sgn) => facePiece(
        curvedBar(sgn * 0.064 * S * sp, BROW_Y, 0.086 * S, 0.030 * S, 0.005 * S, sgn * 0.09, 0.26), m, 0.018 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'arched', nome: 'Arqueada', name: 'Arqueada',
    build(ctx) {
      useHead(ctx)
      const sp = faceSpread()
      const m = solid(shade(hairColorFrom(ctx), 0.5), 0.95)
      return browsFrom((sgn) => facePiece(
        curvedBar(sgn * 0.064 * S * sp, BROW_Y - 0.004 * S, 0.088 * S, 0.023 * S, 0.018 * S, sgn * 0.05, 0.62), m, 0.016 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'angry', nome: 'Fina franzida', name: 'Fina franzida',
    build(ctx) {
      useHead(ctx)
      const sp = faceSpread()
      const m = solid(shade(hairColorFrom(ctx), 0.45), 0.95)
      // tilt = +sgn levanta a ponta de FORA nos dois lados (a barra e espelhada,
      // entao o mesmo sinal de rotacao da a mesma leitura nas duas caras):
      // ponta de fora em cima e ponta de dentro em baixo = cara de bravo.
      return browsFrom((sgn) => facePiece(
        curvedBar(sgn * 0.062 * S * sp, BROW_Y - 0.002 * S, 0.082 * S, 0.019 * S, 0.004 * S, sgn * 0.32, 0.7), m, 0.014 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'high', nome: 'Alta fina', name: 'Alta fina',
    build(ctx) {
      useHead(ctx)
      const sp = faceSpread()
      const m = solid(shade(hairColorFrom(ctx), 0.55), 0.95)
      // Longe do olho e bem fina: cara de surpresa permanente. Nao pode subir
      // mais que isto — a franja do cabelo curto comeca em y ~0.123 * S.
      return browsFrom((sgn) => facePiece(
        curvedBar(sgn * 0.062 * S * sp, BROW_Y + 0.008 * S, 0.078 * S, 0.015 * S, 0.016 * S, sgn * 0.06, 0.72), m, 0.012 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'droop', nome: 'Cheia caida', name: 'Cheia caida',
    build(ctx) {
      useHead(ctx)
      const sp = faceSpread()
      const m = solid(shade(hairColorFrom(ctx), 0.4), 0.96)
      // -sgn = ponta de FORA pra baixo nos dois lados: cara triste/cansada
      return browsFrom((sgn) => facePiece(
        curvedBar(sgn * 0.066 * S * sp, BROW_Y - 0.002 * S, 0.092 * S, 0.032 * S, -0.006 * S, -sgn * 0.30, 0.30), m, 0.019 * S, 0.004 * S,
      ))
    },
  },
]

// ---------------------------------------------------------------------------
// 6. NARIZ
// ---------------------------------------------------------------------------

const NOSE_Y = -0.014 * S

export const NARIZES = [
  {
    id: 'botao', nome: 'Botao', name: 'Botao',
    build(ctx) {
      useHead(ctx)
      const m = solid(skinOf(ctx), 0.68, 0.0)
      const g = new THREE.Group()
      g.add(blob(m, 0.023 * S, 0.026 * S, 0.030 * S, 0, NOSE_Y, -0.007 * S))
      return g
    },
  },
  {
    id: 'batata', nome: 'Batata', name: 'Batata',
    build(ctx) {
      useHead(ctx)
      const skin = skinOf(ctx)
      const m = solid(skin, 0.68, 0.0)
      const dark = solid(shade(skin, 0.55), 0.9)
      const g = new THREE.Group()
      g.add(blob(m, 0.034 * S, 0.031 * S, 0.042 * S, 0, NOSE_Y - 0.004 * S, -0.012 * S))
      // asas do nariz: duas bolotas menores encostadas na bola central
      for (const sgn of [1, -1]) {
        g.add(blob(m, 0.016 * S, 0.014 * S, 0.020 * S, sgn * 0.024 * S, NOSE_Y - 0.014 * S, -0.004 * S))
        // narina: bolota escura enfiada por baixo
        const n = blob(dark, 0.007 * S, 0.005 * S, 0.008 * S, sgn * 0.013 * S, NOSE_Y - 0.024 * S, 0.006 * S)
        g.add(n)
      }
      return g
    },
  },
  {
    id: 'aquilino', nome: 'Aquilino', name: 'Aquilino',
    build(ctx) {
      useHead(ctx)
      const m = solid(skinOf(ctx), 0.68, 0.0)
      const g = new THREE.Group()
      // Tres bolotas GRANDES que se atravessam. Bolotas pequenas em fila davam
      // uma lagarta: o que faz ler como um nariz so e a sobreposicao.
      g.add(blob(m, 0.016 * S, 0.042 * S, 0.026 * S, 0, NOSE_Y + 0.012 * S, -0.006 * S))
      // corcova: e ela que diferencia o aquilino do nariz reto
      g.add(blob(m, 0.018 * S, 0.020 * S, 0.034 * S, 0, NOSE_Y + 0.006 * S, 0.000))
      // ponta caida pra baixo
      const tip = blob(m, 0.017 * S, 0.015 * S, 0.032 * S, 0, NOSE_Y - 0.022 * S, 0.004 * S)
      tip.rotation.x = -0.40
      g.add(tip)
      return g
    },
  },
  {
    id: 'largo', nome: 'Largo', name: 'Largo',
    build(ctx) {
      useHead(ctx)
      const skin = skinOf(ctx)
      const m = solid(skin, 0.68, 0.0)
      const dark = solid(shade(skin, 0.55), 0.9)
      const g = new THREE.Group()
      g.add(blob(m, 0.040 * S, 0.020 * S, 0.026 * S, 0, NOSE_Y - 0.006 * S, -0.006 * S))
      g.add(blob(m, 0.018 * S, 0.017 * S, 0.022 * S, 0, NOSE_Y + 0.004 * S, -0.004 * S))
      for (const sgn of [1, -1]) {
        g.add(blob(dark, 0.008 * S, 0.005 * S, 0.007 * S, sgn * 0.018 * S, NOSE_Y - 0.017 * S, 0.004 * S))
      }
      return g
    },
  },
  {
    id: 'fino', nome: 'Fino pontudo', name: 'Fino pontudo',
    build(ctx) {
      useHead(ctx)
      const m = solid(skinOf(ctx), 0.68, 0.0)
      const g = new THREE.Group()
      // dorso estreito e comprido + ponta espichada pra frente e pra baixo
      g.add(blob(m, 0.015 * S, 0.038 * S, 0.026 * S, 0, NOSE_Y + 0.010 * S, -0.005 * S))
      const tip = blob(m, 0.014 * S, 0.015 * S, 0.038 * S, 0, NOSE_Y - 0.016 * S, 0.004 * S)
      tip.rotation.x = -0.30
      g.add(tip)
      return g
    },
  },
]

// ---------------------------------------------------------------------------
// 7. BOCA
// ---------------------------------------------------------------------------

const MOUTH_Y = -0.072 * S

export const BOCAS = [
  {
    id: 'smile', nome: 'Sorriso', name: 'Sorriso',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const m = solid(0x3a2119, 0.8)
      // traco curvo com as pontas subindo
      g.add(facePiece(curvedBar(0, MOUTH_Y, 0.070 * S, 0.011 * S, -0.013 * S, 0, 0.45), m, 0.008 * S, 0.004 * S, 0.0018 * S))
      // cantos marcados
      const dot = new THREE.SphereGeometry(0.0055 * S, 8, 6)
      const dx = 0.035 * S, dy = MOUTH_Y + 0.011 * S
      for (const sgn of [1, -1]) {
        const d = sh(new THREE.Mesh(dot, m))
        d.position.set(sgn * dx, dy, surfaceZ(sgn * dx, dy, 0.002 * S))
        g.add(d)
      }
      return g
    },
  },
  {
    id: 'open', nome: 'Neutra aberta', name: 'Neutra aberta',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const inner = solid(0x2a1010, 0.85)
      const lip = solid(shade(skinOf(ctx), 0.78), 0.8)
      const s = new THREE.Shape()
      s.absellipse(0, MOUTH_Y, 0.026 * S, 0.016 * S, 0, Math.PI * 2, false, 0)
      g.add(facePiece(s, inner, 0.006 * S, 0.0025 * S, 0.0015 * S))
      // labio inferior saliente
      g.add(facePiece(curvedBar(0, MOUTH_Y - 0.021 * S, 0.058 * S, 0.014 * S, -0.006 * S, 0, 0.6), lip, 0.010 * S, 0.004 * S))
      return g
    },
  },
  {
    id: 'seria', nome: 'Seria', name: 'Seria',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const m = solid(0x35201a, 0.82)
      // linha quase reta com as pontas levemente pra baixo
      g.add(facePiece(curvedBar(0, MOUTH_Y, 0.062 * S, 0.010 * S, 0.006 * S, 0, 0.5), m, 0.007 * S, 0.004 * S, 0.0018 * S))
      // sulco do labio inferior, so uma sombra fina
      g.add(facePiece(curvedBar(0, MOUTH_Y - 0.018 * S, 0.040 * S, 0.006 * S, -0.004 * S, 0, 0.8),
        solid(shade(skinOf(ctx), 0.80), 0.9), 0.005 * S, 0.003 * S, 0.0012 * S))
      return g
    },
  },
  {
    id: 'torto', nome: 'Sorriso torto', name: 'Sorriso torto',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const m = solid(0x3a2119, 0.8)
      // assimetria de proposito: um canto sobe, o outro nao
      g.add(facePiece(curvedBar(0.006 * S, MOUTH_Y, 0.064 * S, 0.011 * S, -0.009 * S, 0.20, 0.45), m, 0.008 * S, 0.004 * S, 0.0018 * S))
      const dx = 0.036 * S, dy = MOUTH_Y + 0.016 * S
      const d = sh(new THREE.Mesh(new THREE.SphereGeometry(0.006 * S, 8, 6), m))
      d.position.set(dx, dy, surfaceZ(dx, dy, 0.002 * S))
      g.add(d)
      // covinha do lado que subiu
      g.add(blob(solid(shade(skinOf(ctx), 0.82), 0.9), 0.004 * S, 0.010 * S, 0.006 * S, 0.048 * S, MOUTH_Y + 0.010 * S, 0.001 * S))
      return g
    },
  },
  {
    id: 'dentes', nome: 'Dentes a mostra', name: 'Dentes a mostra',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const inner = solid(0x24100f, 0.88)
      const teeth = solid(0xf3ece0, 0.45, 0.0)
      const lip = solid(shade(skinOf(ctx), 0.76), 0.8)
      const s = new THREE.Shape()
      s.absellipse(0, MOUTH_Y, 0.040 * S, 0.021 * S, 0, Math.PI * 2, false, 0)
      g.add(facePiece(s, inner, 0.006 * S, 0.0022 * S, 0.0015 * S))
      // faixa de dentes na parte de cima do buraco (pad maior = na frente)
      g.add(facePiece(curvedBar(0, MOUTH_Y + 0.010 * S, 0.070 * S, 0.014 * S, -0.004 * S, 0, 0.35), teeth, 0.006 * S, 0.006 * S, 0.0012 * S))
      // labio de baixo
      g.add(facePiece(curvedBar(0, MOUTH_Y - 0.024 * S, 0.066 * S, 0.013 * S, -0.007 * S, 0, 0.55), lip, 0.010 * S, 0.004 * S))
      return g
    },
  },
]

// ---------------------------------------------------------------------------
// 8. BARBA
//
// A barba cheia e uma CASCA do proprio cranio (headShell) recortada por uma
// linha de theta que varia com o azimute: alta na costeleta, baixa na frente
// (pra deixar a boca livre) e inexistente na nuca. Sai do mesmo elipsoide da
// cabeca, entao acompanha qualquer um dos 8 formatos sem ajuste.
// ---------------------------------------------------------------------------

/**
 * Bigode INTEIRICO (uma unica Shape). Duas metades sobrepostas no centro davam
 * z-fighting na linha do meio.
 * cy = linha central; halfW = meia largura; thick = espessura no meio;
 * droop = quanto as pontas caem; notch = sulco do filtro sob o nariz.
 */
function moustacheShape(cy, halfW, thick, droop, notch, n = 30) {
  const mid = (t) => cy - droop * Math.pow(Math.abs(t), 1.7)
  const half = (t) => (thick / 2) * (1 - 0.45 * t * t)
  const top = (t) => mid(t) + half(t) - notch * Math.exp(-(t * t) / 0.03)
  const bot = (t) => mid(t) - half(t)
  const s = new THREE.Shape()
  s.moveTo(-halfW, top(-1))
  for (let i = 1; i <= n; i++) { const t = -1 + (2 * i) / n; s.lineTo(t * halfW, top(t)) }
  for (let i = n; i >= 0; i--) { const t = -1 + (2 * i) / n; s.lineTo(t * halfW, bot(t)) }
  s.closePath()
  return s
}

/**
 * Casca da barba: theta abaixo de loFn(az) e pelo, acima e pele.
 * A boca esta em theta ~1.97, entao a frente sempre comeca abaixo disso.
 */
function beardShell(color, s, loPairs, flat) {
  return headShell(color, {
    s, t0: 1.15, t1: Math.PI,
    lo: byAz(loPairs),
    wSeg: 40, hSeg: 24,
    flat,
  })
}

export const BARBAS = [
  { id: 'none', nome: 'Sem barba', name: 'Sem barba', build() { return null } },
  {
    id: 'cavanhaque', nome: 'Cavanhaque', name: 'Cavanhaque',
    build(ctx) {
      useHead(ctx)
      const c = shade(hairColorFrom(ctx), 0.55)
      const g = new THREE.Group()
      // Tufo no queixo (casca so no fundo da frente) + pingo sob o labio.
      // A versao anterior era um ANEL com buraco em volta da boca: o miolo do
      // anel ficava na sombra da propria extrusao e o conjunto lia como um
      // donut preto no lugar da boca.
      g.add(beardShell(c, 1.030, [[0.35, 2.28], [0.95, 2.14], [1.40, 2.36], [2.20, 3.20]]))
      g.add(facePiece(
        curvedBar(0, MOUTH_Y - 0.030 * S, 0.030 * S, 0.026 * S, 0, 0, 0.25),
        solid(c, 0.95), 0.013 * S, 0.0045 * S,
      ))
      return g
    },
  },
  {
    id: 'bigode', nome: 'Bigode', name: 'Bigode',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      const m = solid(shade(hairColorFrom(ctx), 0.55), 0.95)
      g.add(facePiece(
        moustacheShape(MOUTH_Y + 0.024 * S, 0.050 * S, 0.030 * S, 0.016 * S, 0.0065 * S),
        m, 0.018 * S, 0.0045 * S,
      ))
      return g
    },
  },
  {
    id: 'cheia', nome: 'Cheia', name: 'Cheia',
    build(ctx) {
      useHead(ctx)
      const c = shade(hairColorFrom(ctx), 0.55)
      const g = new THREE.Group()
      // costeleta alta (1.30) na lateral, queixo tomado na frente (2.06, logo
      // abaixo da boca) e nada na nuca (3.2 = alem do polo, some)
      g.add(beardShell(c, 1.032, [[0.45, 2.06], [1.00, 1.55], [1.45, 1.30], [2.10, 1.60], [2.70, 3.20]]))
      // bigode fecha o vao entre o nariz e a casca
      g.add(facePiece(
        moustacheShape(MOUTH_Y + 0.024 * S, 0.050 * S, 0.030 * S, 0.016 * S, 0.0065 * S),
        solid(c, 0.95), 0.018 * S, 0.0055 * S,
      ))
      return g
    },
  },
  {
    id: 'porfazer', nome: 'Por fazer', name: 'Por fazer',
    build(ctx) {
      useHead(ctx)
      // Barba de tres dias: mistura do pelo com a pele (nao e uma cor de cabelo
      // pura) numa casca rente. Sem isso o "por fazer" le como barba pintada.
      const hair = new THREE.Color(shade(hairColorFrom(ctx), 0.6))
      const skin = new THREE.Color(skinOf(ctx))
      const c = skin.clone().lerp(hair, 0.80).getHex()
      const g = new THREE.Group()
      // sem flatShading: a barba por fazer nao tem volume proprio, e facetar a
      // casca rente faz o queixo parecer lapidado
      g.add(beardShell(c, 1.016, [[0.40, 2.02], [1.00, 1.66], [1.45, 1.48], [2.10, 1.80], [2.70, 3.20]]))
      // sombra do buco: sem ela a barba rala para no nariz e le como mancha
      g.add(facePiece(
        moustacheShape(MOUTH_Y + 0.022 * S, 0.046 * S, 0.022 * S, 0.012 * S, 0.006 * S),
        solid(c, 0.95), 0.006 * S, 0.0035 * S, 0.0012 * S,
      ))
      return g
    },
  },
]

// ---------------------------------------------------------------------------
// 9. APELIDOS ANTIGOS + PADROES
// ---------------------------------------------------------------------------

/** Cor de cabelo por indice (com wrap, nunca quebra). */
export function hairColorOf(i) {
  return CORES_CABELO[wrapIdx(i, CORES_CABELO.length)].hex
}

export function defaultAppearance() {
  return {
    // nomes do contrato (os 20 bytes da rede)
    cabeca: 0,
    olhos: 0,
    pupila: 0,
    nariz: 0,
    boca: 0,
    barba: 0,
    cabelo: 0,
    pele: 0,
    corCabelo: 1,
    sobrancelha: 0,
    chapeu: 0,
    calcado: 1,
    blusa: 1,
    calca: 0,
    colar: 0,
    anelAcess: 0,
    tatuagem: 0,
    relogio: 0,
    jaqueta: 0,
    reservado: 0,
    // NAO devolver tambem os apelidos em ingles (hair/eyes/brows/mouth/
    // hairColor). Os catalogos continuam exportados por esses nomes, mas ter os
    // DOIS nomes dentro do MESMO objeto de aparencia quebra o jogo:
    // character.js resolve apelido campo a campo (hair <-> cabelo), e main.js
    // guarda um unico objeto e so mexe no nome do contrato. Entao
    // setAppearance({ boca: 2 }) escrevia boca=2 e, duas chaves depois, o
    // 'mouth: 0' velho do mesmo objeto escrevia boca=0 de volta — a boca (e o
    // cabelo, e os olhos) simplesmente nao mudavam, sem erro nenhum.
    // Como ENTRADA os apelidos seguem valendo: quem passa { hair: 2 } (NPCs da
    // cidade, customizer antigo) continua funcionando.
    // COR (nao indice): e ela que pinta cabeca, pescoco e maos.
    // Bege claro QUENTE e levemente rosado. O PALETTE.skin antigo (0xf3d9bd)
    // tinha verde alto demais e, com o tone mapping ACES + ceu azulado, a pele
    // lia como cinza-esverdeada na tela.
    skin: SKIN_DEFAULT,
    shirt: 0x4c73a8,
    pants: 0x39404c,
    shoes: PALETTE.white,
  }
}

// Nomes antigos apontando para as listas novas. Nao sao copias: e a MESMA
// referencia, entao nao existe versao velha do catalogo pra divergir.
export const HAIR = CABELOS
export const EYES = OLHOS
export const BROWS = SOBRANCELHAS
export const MOUTH = BOCAS
export const HAIR_COLORS = CORES_CABELO

/** Cabecas como catalogo: build() devolve a cabeca inteira, pronta pra cena. */
export const CABECAS = HEAD_SHAPES.map((sp, i) => {
  const nomes = ['Ovo', 'Redonda', 'Comprida', 'Quadrada', 'Pera', 'Achatada', 'Ondulada', 'Realista']
  const ids = ['ovo', 'redonda', 'comprida', 'quadrada', 'pera', 'achatada', 'ondulada', 'realista']
  return {
    id: ids[i],
    nome: nomes[i],
    name: nomes[i],
    forma: sp,
    /** Geometria crua (character.js prefere esta: ele gerencia o material). */
    geometry(s, wSeg, hSeg) { return makeHeadGeometry(i, s || 1, wSeg || 30, hSeg || 24) },
    build(ctx) {
      const m = sh(new THREE.Mesh(makeHeadGeometry(i, 1, 30, 24), solid(skinOf(ctx), 0.68, 0.0)))
      m.name = 'head:' + ids[i]
      return m
    },
  }
})

export const CATALOGS = {
  // nomes do contrato
  cabeca: CABECAS,
  olhos: OLHOS,
  pupila: PUPILAS,
  nariz: NARIZES,
  boca: BOCAS,
  barba: BARBAS,
  cabelo: CABELOS,
  pele: PELES,
  corCabelo: CORES_CABELO,
  sobrancelha: SOBRANCELHAS,
  // apelidos antigos
  hair: CABELOS,
  eyes: OLHOS,
  brows: SOBRANCELHAS,
  mouth: BOCAS,
}

export { shade as shadeColor }
