import * as THREE from 'three'
import * as mats from '../../world/materials.js'

const { solid, stdMat, tex } = mats

// ---------------------------------------------------------------------------
// src/player/rosto/nucleo.js — a MATEMATICA DO CRANIO e as ferramentas de rosto.
//
// Este arquivo e a fonte da verdade da superficie da cabeca. Olho, nariz, boca,
// barba, cabelo e sobrancelha sao construidos GRUDADOS nessa superficie: todos
// eles chamam useHead(ctx) e depois leem surfaceZ()/eggSurface(). Se a conta da
// superficie viver em dois lugares, um dos dois envelhece e os tracos comecam a
// flutuar no cranio errado — ja aconteceu.
//
// Sistema local da cabeca: origem no CENTRO do cranio, +Z = frente, +Y = cima.
//
// ---------------------------------------------------------------------------
// POR QUE UM "CAMPO" E DEPOIS UMA "MALHA", E NAO SEIS GEOMETRIAS NA MAO
//
// O pedido foi: seis cabecas, cada uma com um METODO diferente de construcao —
// nao a mesma cabeca com o parametro mexido. Mas quem escreve seis geometrias
// na mao perde a unica coisa que faz o rosto funcionar: um jeito de perguntar
// "onde esta a pele em (x, y)?" pra colar o olho ali.
//
// A saida e separar as duas coisas:
//
//   CAMPO  uma funcao analitica que responde "qual o raio da pele nessa
//          direcao". E DELA que surfaceZ/eggSurface leem, entao qualquer traco
//          do rosto cai na pele, em qualquer cranio. Cada cabeca tem os
//          proprios termos de escultura aqui (zigomatico, mandibula, occipital,
//          arcada, glabela, wobble...), e pode ainda por uma funcao `detalhe`
//          totalmente propria por cima.
//
//   MALHA  como esse campo vira triangulo. E AQUI que os metodos divergem de
//          verdade: esfera UV, cubo esferificado (sem polo, quad uniforme),
//          aneis empilhados com densidade variavel, e casca de duas conchas
//          soldadas. Topologia diferente da SILHUETA e SOMBREADO diferentes —
//          é o que separa uma cabeca da outra no olho do jogador — e o campo
//          continua respondendo igual pra todas.
// ---------------------------------------------------------------------------

/**
 * Fator de crescimento da cabeca. Nas fotos de referencia a cabeca ocupa ~1/4.1
 * da altura; a parte visivel vai do topo ao queixo (~1.8 * ry), entao
 * 1.8 * ry * S = 1.82 / 4.1 resolve em S ~= 1.33.
 * TODA medida facial deste projeto e multiplicada por S.
 */
export const HEAD_S = 1.33
const S = HEAD_S

/** Tom de pele padrao: bege quente levemente rosado. */
export const SKIN_DEFAULT = 0xf7c6a4

/** Raios do elipsoide base da cabeca (antes de qualquer escultura). */
export const HEAD = { rx: 0.135 * S, ry: 0.185 * S, rz: 0.13 * S }

/** Altura total da cabeca (~0.49 m). */
export const HEAD_HEIGHT = HEAD.ry * 2

/** Ancora dos olhos no espaco da cabeca. */
export const EYE_ANCHOR = { x: 0.062 * S, y: 0.035 * S }

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const wrapIdx = (i, n) => (((i | 0) % n) + n) % n
export const mix = (a, b, t) => a + (b - a) * t
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** Gaussiana normalizada: 1 no centro, cai em `w`. */
export function gauss(x, centro, w) {
  const d = (x - centro) / w
  return Math.exp(-d * d)
}

// ---------------------------------------------------------------------------
// 1. O CAMPO DO CRANIO
//
// Todos os campos sao multiplicadores sobre HEAD.{rx,ry,rz}:
//   kx/kz        largura / profundidade
//   yTop         alongamento vertical medido A PARTIR DO QUEIXO (esticar por
//                ali levanta so a moleira e nunca abre um vao no pescoco)
//   taper/taperP afinamento do queixo (quanto e com que curva)
//   flare        engorda o queixo (pera)
//   crown        engorda (+) ou estreita (-) a moleira
//   square       maxilar quadrado: superelipse no plano XZ na metade de baixo
//   nape         achatamento da nuca
//   temple       temporas afundadas (+) ou bochecha alta inchada (-)
//   occipital    saliencia do osso occipital, atras e embaixo
//   brow         arcada superciliar (so na frente)
//   glabela      o degrau entre as duas arcadas, no meio da testa
//   zigo         maca do rosto: incha a DIAGONAL da frente na altura zigoY
//   goniaco      angulo da mandibula: incha o canto de tras e de baixo
//   queixo       projecao do mento pra frente, so no meio e so embaixo
//   frontal      achatamento da testa (a testa humana nao e uma bola)
//   wobble       irregularidade de baixa frequencia
//   detalhe      funcao (ux,uy,uz) -> multiplicador extra. E a porta pra cada
//                cranio ter escultura propria sem inchar esta tabela
// ---------------------------------------------------------------------------

const TAPER = 0.42
const TAPER_P = 1.35
const NAPE = 0.06

const CAMPO_BASE = {
  kx: 1, kz: 1, yTop: 1,
  taper: TAPER, taperP: TAPER_P,
  flare: 0, crown: 0, square: 0, nape: NAPE,
  temple: 0, templeY: 0.30, templeW: 0.34,
  occipital: 0, occY: -0.08,
  brow: 0, browY: 0.34,
  glabela: 0,
  zigo: 0, zigoY: 0.05, zigoW: 0.22,
  goniaco: 0, goniacoY: -0.42,
  queixo: 0, queixoY: -0.78,
  frontal: 0,
  wobble: 0,
  detalhe: null,
}

export function campo(o) { return Object.assign({}, CAMPO_BASE, o) }

const _ax = { fx: 0, fz: 0 }

/**
 * Semi-eixos horizontais no ponto unitario (ux,uy,uz) do cranio ativo.
 * Devolve tambem o fator de frente/tras, que nao e radial (nuca achatada,
 * occipital, arcada e queixo mexem so em Z).
 */
function axesAt(ux, uy, uz, sp, out) {
  const below = uy < 0 ? -uy : 0
  const above = uy > 0 ? uy : 0
  const frente = uz > 0 ? uz : 0
  const atras = uz < 0 ? -uz : 0

  // perfil horizontal: afina o queixo, engorda o queixo (pera), mexe na moleira
  let w = 1 - sp.taper * Math.pow(below, sp.taperP)
  w *= 1 + sp.flare * below + sp.crown * above

  // temporas: estrangulamento SO nas laterais (ux^2 vale 1 no lado, 0 na frente)
  if (sp.temple) w *= 1 - sp.temple * gauss(uy, sp.templeY, sp.templeW) * ux * ux

  // maca do rosto: a diagonal da frente (|ux| e uz altos ao mesmo tempo) incha.
  // ux*ux*frente e exatamente isso — no meio da cara vale 0, na orelha vale 0,
  // e no ponto onde o osso salta vale 1.
  if (sp.zigo) w *= 1 + sp.zigo * gauss(uy, sp.zigoY, sp.zigoW) * ux * ux * frente

  // angulo goniaco: o canto de tras e de baixo do maxilar, onde o masseter
  // prende. E o que da cara de "queixo largo" sem alargar o rosto inteiro.
  if (sp.goniaco) {
    w *= 1 + sp.goniaco * gauss(uy, sp.goniacoY, 0.26) * ux * ux * (0.35 + 0.65 * atras)
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

  if (sp.detalhe) w *= sp.detalhe(ux, uy, uz)

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

  // frente/tras: nuca achatada, occipital saliente, arcada, glabela, testa
  // achatada e projecao do mento. Tudo aqui mexe SO em Z, que e como osso de
  // rosto se comporta: a testa recua sem estreitar a cabeca.
  let back = 1
  if (sp.nape) back -= sp.nape * atras
  if (sp.occipital) back += sp.occipital * atras * gauss(uy, sp.occY, 0.45)

  let front = 1
  if (sp.brow) front += sp.brow * frente * gauss(uy, sp.browY, 0.22)
  // glabela: entre as arcadas o osso RECUA um degrau; o termo e negativo e
  // estreito em az, e e ele que impede a testa de ler como capacete liso.
  if (sp.glabela) {
    front -= sp.glabela * frente * gauss(uy, sp.browY + 0.02, 0.10) * Math.max(0, 1 - ux * ux * 4)
  }
  if (sp.frontal) front -= sp.frontal * frente * smoothstep(0.30, 0.85, uy)
  if (sp.queixo) front += sp.queixo * frente * gauss(uy, sp.queixoY, 0.22) * Math.max(0, 1 - ux * ux * 3.2)

  const o = out || { fx: 0, fz: 0 }
  o.fx = fx
  o.fz = fz * back * front
  return o
}

/** Altura final para uma altura normalizada (esticada a partir do queixo). */
function yAt(uy, sp) { return HEAD.ry * (sp.yTop * (uy + 1) - 1) }

// ---------------------------------------------------------------------------
// 2. CRANIO ATIVO
//
// Existe porque surfaceZ/eggSurface/deformEgg sao chamadas de dezenas de
// lugares e passar o formato em todas espalharia o mesmo argumento por 40
// assinaturas. Quem constroi um rosto chama useHead(ctx) antes.
// ---------------------------------------------------------------------------

let ATIVO = null

export function setActiveHead(i) {
  ATIVO = CRANIOS[wrapIdx(i, CRANIOS.length)].campo
  return ATIVO
}
export function activeHead() { return ATIVO || CRANIOS[0].campo }
export function headShapeOf(i) { return CRANIOS[wrapIdx(i, CRANIOS.length)].campo }

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
export function faceSpread() { return 1 + (activeHead().kx - 1) * 0.7 }

// ---------------------------------------------------------------------------
// 3. LEITURA DA SUPERFICIE (o que o rosto inteiro usa)
// ---------------------------------------------------------------------------

/** Ponto da superficie para (theta a partir do topo, azimute 0 = frente). */
export function eggSurface(theta, az, s = 1, out) {
  const o = out || new THREE.Vector3()
  const sp = activeHead()
  const st = Math.sin(theta)
  const ux = st * Math.sin(az), uy = Math.cos(theta), uz = st * Math.cos(az)
  axesAt(ux, uy, uz, sp, _ax)
  o.set(ux * _ax.fx * s, yAt(uy, sp) * s, uz * _ax.fz * s)
  return o
}

/** Normal aproximada em (theta, az) — elipsoide do cranio ativo, sem detalhe. */
export function eggNormal(theta, az, out) {
  const o = out || new THREE.Vector3()
  const sp = activeHead()
  const st = Math.sin(theta)
  o.set(
    (st * Math.sin(az)) / (HEAD.rx * sp.kx),
    Math.cos(theta) / (HEAD.ry * sp.yTop),
    (st * Math.cos(az)) / (HEAD.rz * sp.kz),
  )
  return o.normalize()
}

/**
 * Z da superficie FRONTAL da cabeca em (x,y). pad = folga anti z-fighting.
 * Precisa iterar porque os semi-eixos dependem da direcao (maxilar quadrado,
 * maca do rosto, bossas): comeca supondo o meio da testa e converge em 4
 * passadas — uma a mais que a versao antiga porque a escultura nova (zigo,
 * queixo) mexe mais no raio conforme ux anda.
 */
export function surfaceZ(x, y, pad = 0) {
  const sp = activeHead()
  const uy = clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1)
  const st = Math.sqrt(Math.max(0, 1 - uy * uy))
  let ux = 0, uz = st
  for (let k = 0; k < 4; k++) {
    axesAt(ux, uy, uz, sp, _ax)
    ux = clamp(x / Math.max(1e-6, _ax.fx), -1, 1)
    const s2 = 1 - uy * uy - ux * ux
    uz = s2 > 0 ? Math.sqrt(s2) : 0
  }
  axesAt(ux, uy, uz, sp, _ax)
  return uz * _ax.fz + pad
}

/** X da superficie LATERAL em (y, z) — o lado da cabeca (costeleta, orelha). */
export function surfaceX(y, z, pad = 0) {
  const sp = activeHead()
  const uy = clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1)
  const st = Math.sqrt(Math.max(0, 1 - uy * uy))
  let uz = 0, ux = st
  for (let k = 0; k < 4; k++) {
    axesAt(ux, uy, uz, sp, _ax)
    uz = clamp(z / Math.max(1e-6, _ax.fz), -1, 1)
    const s2 = 1 - uy * uy - uz * uz
    ux = s2 > 0 ? Math.sqrt(s2) : 0
  }
  axesAt(ux, uy, uz, sp, _ax)
  return ux * _ax.fx + pad
}

/**
 * Deforma uma esfera unitaria no formato do cranio ativo.
 * opts sobrescreve campos do formato (o cabelo usa taper/drop/flare proprios).
 * s > 1 gera as cascas de cabelo/barba por fora da pele.
 */
export function deformEgg(geo, s = 1, opts = {}) {
  const sp = opts && Object.keys(opts).some((k) => k in CAMPO_BASE)
    ? Object.assign({}, activeHead(), opts)
    : activeHead()
  const drop = (opts && opts.drop) || 0
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const below = v.y < 0 ? -v.y : 0
    axesAt(v.x, v.y, v.z, sp, _ax)
    const y = yAt(v.y, sp) + HEAD.ry * v.y * drop * below
    pos.setXYZ(i, v.x * _ax.fx * s, y * s, v.z * _ax.fz * s)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return geo
}

/**
 * Projeta uma geometria plana (desenhada no plano XY, coordenadas locais da
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

// ---------------------------------------------------------------------------
// 4. COSTURA — o defeito que fazia o "risco vertical" no peito e na cabeca
//
// LatheGeometry, SphereGeometry e CapsuleGeometry FECHAM a volta duplicando a
// coluna de vertices: o ultimo anel tem as mesmas posicoes do primeiro, so que
// com UV diferente. computeVertexNormals() calcula a media POR VERTICE, entao
// as duas colonias recebem normais diferentes — e a emenda vira uma listra que
// acende e apaga conforme a luz. Era exatamente a listra vertical no meio do
// peito e as listras nos bracos que o dono do projeto fotografou.
//
// soldarNormais() acha os vertices que ocupam a MESMA posicao e da a todos eles
// a media das normais. Some a listra e as UVs continuam intactas (o que
// mantem estampa, xadrez e listra de tecido funcionando).
// ---------------------------------------------------------------------------
export function soldarNormais(geo, eps = 1e-4) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  if (!pos || !nor) return geo
  const q = 1 / eps
  const mapa = new Map()
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(pos.getX(i) * q) + '|' + Math.round(pos.getY(i) * q) + '|' + Math.round(pos.getZ(i) * q)
    const l = mapa.get(k)
    if (l) l.push(i)
    else mapa.set(k, [i])
  }
  for (const lista of mapa.values()) {
    if (lista.length < 2) continue
    let x = 0, y = 0, z = 0
    for (const i of lista) { x += nor.getX(i); y += nor.getY(i); z += nor.getZ(i) }
    const m = Math.hypot(x, y, z)
    if (m < 1e-6) continue
    x /= m; y /= m; z /= m
    for (const i of lista) nor.setXYZ(i, x, y, z)
  }
  nor.needsUpdate = true
  return geo
}

// ---------------------------------------------------------------------------
// 5. AS MALHAS — quatro jeitos de transformar o campo em triangulo
// ---------------------------------------------------------------------------

/**
 * MALHA A — esfera UV deformada. Polos em cima e embaixo, anel denso no
 * equador. E o metodo mais barato e o que da a silhueta mais macia; usado onde
 * a cabeca e essencialmente arredondada.
 */
function malhaUV(sp, s, wSeg, hSeg) {
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    axesAt(v.x, v.y, v.z, sp, _ax)
    pos.setXYZ(i, v.x * _ax.fx * s, yAt(v.y, sp) * s, v.z * _ax.fz * s)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return geo
}

/**
 * MALHA B — CUBO ESFERIFICADO. Seis grades planas projetadas na esfera pela
 * formula de Cobb (a que preserva area, nao a normalizacao ingenua).
 *
 * Por que aqui e um metodo de verdade e nao um enfeite: a esfera UV concentra
 * 90% dos vertices perto dos polos e deixa o maxilar — que e o que interessa
 * numa cabeca quadrada — com metade da resolucao do topo da cabeca, que
 * ninguem olha. A grade do cubo e UNIFORME: o queixo, os cantos do maxilar e a
 * tempora recebem a mesma densidade, e a superelipse do campo aparece como
 * canto de verdade em vez de virar um serrilhado.
 * De quebra nao ha polo, entao nao ha o "buraco de agulha" no alto do cranio.
 */
function malhaCubo(sp, s, n) {
  const pos = []
  const idx = []
  const chave = new Map()
  const eixos = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [1, 0, 0], [0, -1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
  ]
  const v = new THREE.Vector3()
  function ponto(x, y, z) {
    // Cobb: espalha a distorcao da esfericacao pelo quadrado inteiro em vez de
    // amontoar tudo na diagonal (que e o que a normalizacao crua faz).
    const x2 = x * x, y2 = y * y, z2 = z * z
    const sx = x * Math.sqrt(1 - y2 / 2 - z2 / 2 + (y2 * z2) / 3)
    const sy = y * Math.sqrt(1 - z2 / 2 - x2 / 2 + (z2 * x2) / 3)
    const sz = z * Math.sqrt(1 - x2 / 2 - y2 / 2 + (x2 * y2) / 3)
    axesAt(sx, sy, sz, sp, _ax)
    v.set(sx * _ax.fx * s, yAt(sy, sp) * s, sz * _ax.fz * s)
    // Soldar por chave e o que faz as seis faces virarem UMA casca fechada com
    // normal continua. Sem isso as bordas do cubo aparecem como seis costuras.
    const k = Math.round(v.x * 1e5) + '|' + Math.round(v.y * 1e5) + '|' + Math.round(v.z * 1e5)
    const achou = chave.get(k)
    if (achou !== undefined) return achou
    const id = pos.length / 3
    pos.push(v.x, v.y, v.z)
    chave.set(k, id)
    return id
  }
  for (const [f, u, w] of eixos) {
    const grade = []
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 - 1
      const linha = []
      for (let j = 0; j <= n; j++) {
        const b = (j / n) * 2 - 1
        linha.push(ponto(f[0] + u[0] * a + w[0] * b, f[1] + u[1] * a + w[1] * b, f[2] + u[2] * a + w[2] * b))
      }
      grade.push(linha)
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a = grade[i][j], b = grade[i + 1][j], c = grade[i + 1][j + 1], d = grade[i][j + 1]
        idx.push(a, b, c, a, c, d)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * MALHA C — ANEIS EMPILHADOS COM DENSIDADE VARIAVEL.
 *
 * O cranio e fatiado em aneis horizontais e a altura de cada anel sai de uma
 * curva de distribuicao, nao de uma divisao igual: `foco` diz em que altura
 * concentrar linhas. Numa cabeca comprida isso poe o dobro de aneis entre a
 * sobrancelha e o queixo — que e o trecho onde a silhueta muda — e deixa a
 * calota lisa com poucos.
 *
 * E tambem o unico metodo onde a resolucao ANGULAR muda por altura: perto do
 * queixo a volta e mais curta e o mesmo numero de colunas gastaria triangulo a
 * toa; entao as colunas caem com o raio e a malha fica com custo constante por
 * centimetro de silhueta.
 */
function malhaAneis(sp, s, nAnel, nCol, foco) {
  const linhas = []
  const pos = []
  const idx = []
  const v = new THREE.Vector3()
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  for (let a = 0; a <= nAnel; a++) {
    let t = a / nAnel
    // remapeia t (0 = topo, 1 = queixo) concentrando em `foco`
    t = t + 0.34 * Math.sin(Math.PI * t) * (foco - t)
    const theta = t * Math.PI
    const uy = Math.cos(theta)
    const st = Math.sin(theta)
    if (a === 0 || a === nAnel) {
      axesAt(0, uy, 0, sp, _ax)
      linhas.push([put(0, yAt(uy, sp) * s, 0)])
      continue
    }
    const cols = Math.max(8, Math.round(nCol * (0.42 + 0.58 * st)))
    const linha = []
    for (let c = 0; c < cols; c++) {
      const az = (c / cols) * Math.PI * 2
      const ux = st * Math.sin(az), uz = st * Math.cos(az)
      axesAt(ux, uy, uz, sp, _ax)
      v.set(ux * _ax.fx * s, yAt(uy, sp) * s, uz * _ax.fz * s)
      linha.push(put(v.x, v.y, v.z))
    }
    linhas.push(linha)
  }

  // Costura entre aneis de CONTAGEM DIFERENTE: caminha nos dois ao mesmo tempo
  // pelo angulo e emite o triangulo de quem esta mais atrasado. E o mesmo
  // algoritmo de zipper de um loft; sem ele a troca de densidade abriria fenda.
  //
  // A ORDEM DOS TRES INDICES E O QUE DECIDE PRA ONDE A NORMAL APONTA, e aqui
  // ela ja esteve errada: `A` e o anel de CIMA (theta cresce descendo), e com a
  // volta na ordem oposta a casca saia com a normal virada pra DENTRO. O efeito
  // na tela nao e um buraco — e uma cabeca CINZA ESCURA, porque a luz passa a
  // bater no avesso. Foi assim que os cranios 'comprida' e 'pera' apareceram
  // pretos na folha de contato.
  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (A.length === 1) { for (let j = 0; j < B.length; j++) idx.push(A[0], B[(j + 1) % B.length], B[j]); continue }
    if (B.length === 1) { for (let i = 0; i < A.length; i++) idx.push(A[i], B[0], A[(i + 1) % A.length]); continue }
    let i = 0, j = 0
    while (i < A.length || j < B.length) {
      const ta = i / A.length, tb = j / B.length
      if (j >= B.length || (i < A.length && ta <= tb)) {
        idx.push(A[i % A.length], B[j % B.length], A[(i + 1) % A.length])
        i++
      } else {
        idx.push(A[i % A.length], B[j % B.length], B[(j + 1) % B.length])
        j++
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return geo
}

/**
 * MALHA D — DUAS CONCHAS SOLDADAS (cranio + maxilar).
 *
 * A cabeca e montada como o anatomista desenha: uma CALOTA CRANIANA (do topo
 * ate a altura da orelha) e um BLOCO MAXILAR (dali pro queixo), cada um com o
 * proprio numero de colunas e a propria superelipse, soldados por um anel de
 * transicao que interpola os dois.
 *
 * Isso permite o que nenhum dos outros tres permite: o maxilar ser QUADRADO
 * (superelipse forte, colunas alinhadas com os cantos) enquanto a calota
 * continua redonda — sem que o expoente do campo tenha que "vazar" de um pro
 * outro. O canto do maxilar sai como aresta desenhada, nao como um degrau de
 * amostragem.
 */
function malhaConchas(sp, s, nCol, corte, pCranio, pMaxilar) {
  const pos = []
  const idx = []
  const v = new THREE.Vector3()
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }
  const linhas = []
  const N_CRANIO = 11, N_MAX = 9

  function anelEm(theta, superP) {
    const uy = Math.cos(theta)
    const st = Math.sin(theta)
    const linha = []
    for (let c = 0; c < nCol; c++) {
      const az = (c / nCol) * Math.PI * 2
      let ux = Math.sin(az), uz = Math.cos(az)
      // superelipse APLICADA NA AMOSTRAGEM (nao no campo): as colunas se
      // acumulam nos cantos, que e o que faz o canto virar aresta.
      if (superP > 2.002) {
        const f = 1 / Math.pow(Math.pow(Math.abs(ux), superP) + Math.pow(Math.abs(uz), superP), 1 / superP)
        ux *= f; uz *= f
      }
      ux *= st; uz *= st
      axesAt(ux, uy, uz, sp, _ax)
      v.set(ux * _ax.fx * s, yAt(uy, sp) * s, uz * _ax.fz * s)
      linha.push(put(v.x, v.y, v.z))
    }
    return linha
  }

  linhas.push([put(0, yAt(1, sp) * s, 0)])
  for (let a = 1; a <= N_CRANIO; a++) {
    linhas.push(anelEm((a / N_CRANIO) * corte, pCranio))
  }
  for (let a = 1; a <= N_MAX; a++) {
    const t = a / N_MAX
    linhas.push(anelEm(corte + t * (Math.PI - corte), mix(pCranio, pMaxilar, smoothstep(0, 0.55, t))))
  }
  linhas.push([put(0, yAt(-1, sp) * s, 0)])

  // `A` e o anel de CIMA — a volta sai na ordem que poe a normal pra FORA.
  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (A.length === 1) { for (let j = 0; j < B.length; j++) idx.push(A[0], B[(j + 1) % B.length], B[j]); continue }
    if (B.length === 1) { for (let i = 0; i < A.length; i++) idx.push(A[i], B[0], A[(i + 1) % A.length]); continue }
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length
      idx.push(A[i], B[j], A[j], A[i], B[i], B[j])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return geo
}

// ---------------------------------------------------------------------------
// 6. OS SEIS CRANIOS
//
// Seis, e nao treze: o pedido foi menos cabecas e mais cuidado em cada uma. Os
// nomes sao os que o dono do projeto listou — redonda, comprida, quadrada,
// pera, realista e mandibula.
//
// Cada uma declara o METODO que a constroi. Nao e decoracao: a silhueta e o
// sombreado mudam de verdade entre um metodo e outro, e e essa diferenca que
// faz dois NPCs lado a lado nao parecerem o mesmo boneco com o parametro
// mexido.
// ---------------------------------------------------------------------------

/** Ruido de valor 3D barato e deterministico (escultura fina do cranio realista). */
function ruido3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return s - Math.floor(s)
}
function ruidoSuave(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), vv = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  let acc = 0
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const peso = (dx ? u : 1 - u) * (dy ? vv : 1 - vv) * (dz ? w : 1 - w)
        acc += peso * ruido3(xi + dx, yi + dy, zi + dz)
      }
    }
  }
  return acc * 2 - 1
}

export const CRANIOS = [
  // -------------------------------------------------------------------------
  // 0 REDONDA — metodo A (esfera UV).
  // A unica cabeca genuinamente esferica do catalogo, entao ela e a unica que
  // NAO precisa de amostragem especial: a esfera UV entrega uma silhueta lisa
  // com metade dos triangulos dos outros metodos.
  // O juice dela sao as bochechas: temple NEGATIVO logo abaixo do equador incha
  // so as laterais na altura da maca (engordar com kx daria uma cabeca gorda,
  // nao uma bochecha) e zigo poe o osso na diagonal da frente.
  // -------------------------------------------------------------------------
  {
    id: 'redonda', nome: 'Redonda', metodo: 'esfera UV',
    campo: campo({
      kx: 1.02, kz: 1.08, yTop: 0.95, taper: 0.20, taperP: 2.0, nape: 0.035,
      crown: 0.05,
      temple: -0.12, templeY: -0.02, templeW: 0.26,
      zigo: 0.09, zigoY: 0.06, zigoW: 0.24,
      queixo: 0.07, queixoY: -0.74,
      frontal: 0.05, brow: 0.045, browY: 0.34, glabela: 0.03,
    }),
    malha(s, wSeg, hSeg) { return malhaUV(this.campo, s, wSeg || 34, hSeg || 26) },
  },

  // -------------------------------------------------------------------------
  // 1 COMPRIDA — metodo C (aneis com densidade variavel), foco no maxilar.
  // Numa cabeca alta a informacao toda esta entre a sobrancelha e o queixo; a
  // esfera UV gastaria metade dos aneis na calota, que aqui e quase reta. O
  // foco em 0.62 poe as linhas onde a silhueta muda.
  // taperP 1.25 e o que faz o afinamento comecar CEDO, ja na altura da boca:
  // com um expoente alto o estreitamento so aparece no ultimo centimetro e a
  // silhueta le como "ovo alto", nao como rosto comprido.
  // -------------------------------------------------------------------------
  {
    id: 'comprida', nome: 'Comprida', metodo: 'aneis empilhados',
    campo: campo({
      kx: 0.95, kz: 0.99, yTop: 1.12, taper: 0.40, taperP: 1.25, nape: 0.085,
      temple: 0.075, templeY: 0.28, templeW: 0.36,
      zigo: 0.13, zigoY: 0.02, zigoW: 0.18,
      queixo: 0.13, queixoY: -0.80,
      occipital: 0.07, occY: -0.02,
      brow: 0.05, browY: 0.36, glabela: 0.035, frontal: 0.08,
    }),
    malha(s) { return malhaAneis(this.campo, s, 26, 30, 0.62) },
  },

  // -------------------------------------------------------------------------
  // 2 QUADRADA — metodo B (cubo esferificado).
  // A grade uniforme do cubo e o que permite o canto do maxilar existir: numa
  // esfera UV o mesmo expoente de superelipse cai num anel de 30 colunas
  // distribuidas por angulo, e o canto some entre duas delas.
  // goniaco alto poe o angulo do masseter atras e embaixo; e ele, e nao o
  // `square`, que da a leitura de "cara quadrada" vista de frente.
  // -------------------------------------------------------------------------
  {
    id: 'quadrada', nome: 'Quadrada', metodo: 'cubo esferificado',
    campo: campo({
      kx: 1.08, kz: 1.04, yTop: 0.99, taper: 0.07, taperP: 2.6,
      square: 2.0, flare: 0.06, nape: 0.10,
      goniaco: 0.13, goniacoY: -0.46,
      zigo: 0.10, zigoY: 0.06, zigoW: 0.22,
      queixo: 0.10, queixoY: -0.80,
      brow: 0.075, browY: 0.33, glabela: 0.05, frontal: 0.10,
      temple: 0.05, templeY: 0.32, templeW: 0.30,
    }),
    malha(s) { return malhaCubo(this.campo, s, 11) },
  },

  // -------------------------------------------------------------------------
  // 3 PERA — metodo C (aneis), foco BEM embaixo (0.78).
  // O interesse desta cabeca esta todo no terco inferior: queixo largo, topo
  // estreito. Concentrar os aneis ali e o que impede o maxilar de virar um
  // degrau de dois aneis.
  // crown negativo estreita a moleira; flare engorda o queixo. Os dois juntos
  // invertem o triangulo do cranio — e por isso taper fica em ZERO: qualquer
  // afinamento devolveria o ovo.
  // -------------------------------------------------------------------------
  {
    id: 'pera', nome: 'Pera', metodo: 'aneis empilhados',
    campo: campo({
      kx: 1.00, kz: 1.00, yTop: 1.03, taper: 0.0, taperP: 1.5,
      flare: 0.42, crown: -0.30, nape: 0.05,
      goniaco: 0.10, goniacoY: -0.52,
      temple: 0.10, templeY: 0.40, templeW: 0.30,
      zigo: 0.05, zigoY: -0.02, zigoW: 0.26,
      brow: 0.04, browY: 0.34, frontal: 0.04,
      queixo: 0.05, queixoY: -0.82,
    }),
    malha(s) { return malhaAneis(this.campo, s, 26, 30, 0.78) },
  },

  // -------------------------------------------------------------------------
  // 4 REALISTA — metodo A com ESCULTURA POR RUIDO no `detalhe`.
  // Aqui o campo ganha uma funcao propria: duas oitavas de ruido de valor
  // ancoradas no ponto unitario, com amplitude de meio milimetro. Nao e pra
  // ver "ruido" — e pra QUEBRAR a perfeicao do elipsoide. Uma cabeca
  // matematicamente lisa le como bola de plastico por mais osso que se
  // esculpa nela; a irregularidade minima e o que faz a luz raspante achar
  // pequenas variacoes e o cranio ganhar materia.
  // Por cima disso vem o osso de verdade: tempora afundada, occipital
  // saliente, arcada com glabela recuada entre as duas, maca do rosto e
  // testa achatada.
  // -------------------------------------------------------------------------
  {
    id: 'realista', nome: 'Realista', metodo: 'esfera UV + escultura por ruido',
    campo: campo({
      kx: 1.06, kz: 1.08, yTop: 1.02, taper: 0.30, taperP: 1.6, nape: 0.02,
      square: 0.40,
      temple: 0.10, templeY: 0.26, templeW: 0.40,
      occipital: 0.15, occY: -0.05,
      brow: 0.085, browY: 0.35, glabela: 0.06,
      frontal: 0.13,
      zigo: 0.15, zigoY: 0.03, zigoW: 0.20,
      goniaco: 0.09, goniacoY: -0.46,
      queixo: 0.12, queixoY: -0.78,
      detalhe(ux, uy, uz) {
        return 1
          + 0.0075 * ruidoSuave(ux * 3.1 + 5, uy * 3.1 + 11, uz * 3.1 + 3)
          + 0.0035 * ruidoSuave(ux * 7.3 + 21, uy * 7.3 + 2, uz * 7.3 + 17)
      },
    }),
    malha(s, wSeg, hSeg) { return malhaUV(this.campo, s, wSeg || 44, hSeg || 34) },
  },

  // -------------------------------------------------------------------------
  // 5 MANDIBULA — metodo D (duas conchas soldadas).
  // A unica do catalogo em que a calota e o maxilar sao amostrados com regras
  // DIFERENTES: a calota redonda (superelipse 2, colunas por angulo) e o
  // maxilar com superelipse 3.4 na propria AMOSTRAGEM, o que amontoa as
  // colunas nos quatro cantos e desenha a aresta do gonio em vez de aproximar
  // ela. E a cabeca de lutador: taper quase zero, goniaco no maximo do
  // catalogo e queixo projetado.
  // -------------------------------------------------------------------------
  {
    id: 'mandibula', nome: 'Mandibula', metodo: 'duas conchas soldadas',
    campo: campo({
      kx: 1.14, kz: 1.06, yTop: 0.97, taper: 0.03, taperP: 3.0,
      square: 1.6, flare: 0.10, nape: 0.11,
      goniaco: 0.20, goniacoY: -0.44,
      zigo: 0.13, zigoY: 0.08, zigoW: 0.20,
      queixo: 0.15, queixoY: -0.82,
      brow: 0.085, browY: 0.33, glabela: 0.055, frontal: 0.12,
      temple: 0.075, templeY: 0.34, templeW: 0.30,
      occipital: 0.08, occY: -0.06,
    }),
    malha(s) { return malhaConchas(this.campo, s, 32, 1.34, 2.0, 3.4) },
  },
]

/**
 * Geometria da cabeca no formato `index`.
 * ATENCAO: tambem ATIVA esse formato — quem monta a cabeca monta o rosto logo
 * em seguida, e o rosto precisa da mesma superficie.
 */
export function makeHeadGeometry(index, s = 1, wSeg = 30, hSeg = 24) {
  // `index` fica SEM valor padrao de proposito: character.js usa
  // makeHeadGeometry.length pra saber se esta versao aceita formato de cranio.
  if (s > 4) { hSeg = wSeg; wSeg = s; s = index; index = 0 }
  const c = CRANIOS[wrapIdx(index | 0, CRANIOS.length)]
  setActiveHead(index | 0)
  return c.malha(s || 1, wSeg, hSeg)
}

// ---------------------------------------------------------------------------
// 7. UTILITARIOS DE ROSTO
// ---------------------------------------------------------------------------

export function shade(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex()
}

/** Mistura duas cores hex. */
export function mixHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex()
}

export function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Decoracao que nao pode projetar sombra em si mesma (iris, palpebra, cilio). */
export function flatPiece(m) { m.castShadow = false; m.receiveShadow = false; return m }

/** PRNG deterministico (mesmo cabelo espetado toda vez). */
export function rng(seed) {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const _UPY = new THREE.Vector3(0, 1, 0)
/** Alinha o +Y do objeto com uma direcao. */
export function alignY(obj, dir) { obj.quaternion.setFromUnitVectors(_UPY, dir) }

const EXTRUDE = {
  depth: 0.012 * S, bevelEnabled: true,
  bevelThickness: 0.0022 * S, bevelSize: 0.0022 * S, bevelSegments: 2, curveSegments: 5,
}

export function extrudeOpts(depth, bevel, seg) {
  const o = Object.assign({}, EXTRUDE, { depth, bevelThickness: bevel, bevelSize: bevel })
  if (seg) o.curveSegments = seg
  return o
}

/**
 * Barra curva no plano XY: base de sobrancelhas, bocas, bigodes.
 * curve > 0 = arco pra cima no meio. taperEnds afina as pontas.
 */
export function curvedBar(cx, cy, len, thick, curve, tilt = 0, taperEnds = 0.55, n = 14) {
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
export function facePiece(shape_, mat, depth = 0.011 * S, pad = 0.004 * S, bevel = 0.0022 * S, seg = 0) {
  const geo = new THREE.ExtrudeGeometry(shape_, extrudeOpts(depth, bevel, seg))
  wrapToHead(geo, pad)
  return sh(new THREE.Mesh(geo, mat))
}

/** Bolota colada na superficie do rosto (narizes, verrugas, cantos de boca). */
export function blob(mat, sx, sy, sz, x, y, out = 0) {
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
export function byAz(pairs) {
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
export function hairline(front, side, a0, a1) { return byAz([[a0, front], [a1, side]]) }

// ---------------------------------------------------------------------------
// 8. PELOS DE VERDADE — a ferramenta que faz barba e sobrancelha terem fio
//
// O pedido foi explicito: "quero que mostre realmente os pelinhos". Um pelo e
// um TUBO AFILADO seguindo uma curva, e desenhar um por um em mesh separado
// custaria 300 draw calls por barba. Aqui todos os fios de uma peca entram numa
// UNICA BufferGeometry indexada, montada com o acumulador `tecelagem`.
//
// Custo medido: um fio de 5 aneis x 4 colunas = 40 triangulos. Uma barba densa
// de 260 fios da ~10 mil triangulos num mesh so — menos que a cabeca com o
// metodo do cubo, e cabe folgado no orcamento de 20 bonecos na tela.
// ---------------------------------------------------------------------------

export function tecelagem() {
  const pos = []
  const nor = []
  const idx = []
  return {
    v(x, y, z) { pos.push(x, y, z); nor.push(0, 0, 0); return pos.length / 3 - 1 },
    tri(a, b, c) { idx.push(a, b, c) },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d) },
    get vazia() { return idx.length === 0 },
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

const _fA = new THREE.Vector3()
const _fB = new THREE.Vector3()
const _fU = new THREE.Vector3()
const _fV = new THREE.Vector3()
const _fW = new THREE.Vector3()
const _fREF = new THREE.Vector3(0, 1, 0)
const _fREF2 = new THREE.Vector3(1, 0, 0)

/**
 * Um FIO: tubo de `aneis` seções que segue uma curva e afina ate a ponta.
 *
 *   ma       acumulador de tecelagem()
 *   p0       nascimento (Vector3)
 *   dir      direcao inicial (Vector3, normalizada por dentro)
 *   comp     comprimento em metros
 *   raio     espessura na raiz
 *   curvaEixo/curva   pra onde e quanto o fio verga ao longo do caminho
 *   N        colunas da secao (3 e um triangulo — barato e suficiente num pelo
 *            de 1 mm; 4 vale a pena so em fio grosso de sobrancelha)
 */
export function fio(ma, p0, dir, comp, raio, curvaEixo, curva, aneis = 5, N = 3) {
  const p = _fA.copy(p0)
  const d = _fB.copy(dir).normalize()
  const passo = comp / (aneis - 1)
  const ref = Math.abs(d.y) > 0.9 ? _fREF2 : _fREF
  let ant = null
  for (let k = 0; k < aneis; k++) {
    const t = k / (aneis - 1)
    // afinamento em potencia 1.6: o pelo fica cheio na base e vira agulha no
    // fim. Linear demais le como espinho de cacto.
    const r = raio * Math.pow(1 - t, 1.6) + raio * 0.06
    _fW.copy(d).multiplyScalar(-1)
    _fU.crossVectors(ref, _fW).normalize()
    _fV.crossVectors(_fW, _fU).normalize()
    const A = []
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const cx = Math.cos(a) * r, cz = Math.sin(a) * r
      A.push(ma.v(
        p.x + _fU.x * cx + _fV.x * cz,
        p.y + _fU.y * cx + _fV.y * cz,
        p.z + _fU.z * cx + _fV.z * cz,
      ))
    }
    if (ant) for (let i = 0; i < N; i++) ma.quad(ant[i], ant[(i + 1) % N], A[(i + 1) % N], A[i])
    ant = A
    if (k < aneis - 1) {
      p.addScaledVector(d, passo)
      if (curva) d.applyAxisAngle(curvaEixo, curva / (aneis - 1))
    }
  }
  // ponta em leque
  const c = ma.v(p.x, p.y, p.z)
  for (let i = 0; i < N; i++) ma.tri(ant[i], ant[(i + 1) % N], c)
}

/**
 * Material de pelo: fosco, com uma pontinha de variacao de tom por fio feita
 * na COR do material e nao em vertex color — 3 materiais cacheados por cor de
 * cabelo custam nada e dao a sensacao de fio claro e fio escuro no meio.
 */
export function peloMat(cor, i = 0) {
  const m = [1.0, 0.82, 1.18][i % 3]
  return solid(shade(cor, m), 0.95, 0.0, { side: THREE.DoubleSide })
}

// ---------------------------------------------------------------------------
// 9. PELE E CORES
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
  0xfae3d2,     // 5 porcelana
  0xbf9d63,     // 6 oliva
  0xb87c4a,     // 7 bronze
  0x8a5730,     // 8 cacau
  0x4a2b16,     // 9 ebano
]

const NOMES_PELE = [
  ['bege', 'Bege'], ['claro', 'Claro'], ['dourado', 'Dourado'], ['castanho', 'Castanho'],
  ['escuro', 'Escuro'], ['porcelana', 'Porcelana'], ['oliva', 'Oliva'], ['bronze', 'Bronze'],
  ['cacau', 'Cacau'], ['ebano', 'Ebano'],
]

export const PELES = SKIN_TONES.map((hex, i) => ({
  id: NOMES_PELE[i][0], nome: NOMES_PELE[i][1], name: NOMES_PELE[i][1],
  hex, build: () => null,
}))

/** Cor de pele por indice. Valor > 255 ja e uma cor pronta e passa direto. */
export function skinColorOf(i) {
  const n = i | 0
  if (n > 255) return n
  return SKIN_TONES[wrapIdx(n, SKIN_TONES.length)]
}

/** Cor de pele que o build deve usar: ctx.skin (cor) ou ctx.pele (indice). */
export function skinOf(ctx) {
  if (ctx && ctx.skin !== undefined) return skinColorOf(ctx.skin)
  if (ctx && ctx.pele !== undefined) return skinColorOf(ctx.pele)
  return SKIN_DEFAULT
}

export const CORES_CABELO = [
  { id: 'preto', nome: 'Preto', name: 'Preto', hex: 0x1c1718, build: () => null },
  { id: 'castanho', nome: 'Castanho', name: 'Castanho', hex: 0x4a2c19, build: () => null },
  { id: 'ruivo', nome: 'Ruivo', name: 'Ruivo', hex: 0xb2481f, build: () => null },
  { id: 'loiro', nome: 'Loiro', name: 'Loiro', hex: 0xd9ac57, build: () => null },
  { id: 'grisalho', nome: 'Grisalho', name: 'Grisalho', hex: 0x9c9791, build: () => null },
  { id: 'platinado', nome: 'Platinado', name: 'Platinado', hex: 0xe7e1d3, build: () => null },
  { id: 'castanhoClaro', nome: 'Castanho claro', name: 'Castanho claro', hex: 0x8a5a2f, build: () => null },
  { id: 'acaju', nome: 'Acaju', name: 'Acaju', hex: 0x6e2a20, build: () => null },
  { id: 'azul', nome: 'Azul tinta', name: 'Azul tinta', hex: 0x2b4a8c, build: () => null },
  { id: 'rosa', nome: 'Rosa tinta', name: 'Rosa tinta', hex: 0xb04a7c, build: () => null },
  { id: 'verde', nome: 'Verde tinta', name: 'Verde tinta', hex: 0x2f7a52, build: () => null },
]

/**
 * COR DA BARBA — catalogo PROPRIO, e nao um apelido do cabelo.
 *
 * O pedido foi "na aba cor vai ter cor de cabelo, cor de barba e cor de pele".
 * Ate aqui a barba herdava a cor do cabelo por shade(); o resultado era que
 * ninguem conseguia o grisalho de barba com cabelo preto, que e das combinacoes
 * mais comuns que existem. A lista e a mesma familia de tons do cabelo mais os
 * dois que so fazem sentido em pelo de rosto (sal e pimenta, ruivo puxado).
 */
export const CORES_BARBA = [
  { id: 'igual', nome: 'Igual ao cabelo', name: 'Igual ao cabelo', hex: 0x4a2c19, build: () => null },
  { id: 'preto', nome: 'Preto', name: 'Preto', hex: 0x1a1516, build: () => null },
  { id: 'castanho', nome: 'Castanho', name: 'Castanho', hex: 0x4a2c19, build: () => null },
  { id: 'castanhoClaro', nome: 'Castanho claro', name: 'Castanho claro', hex: 0x8a5a2f, build: () => null },
  { id: 'ruivo', nome: 'Ruivo', name: 'Ruivo', hex: 0xa8451d, build: () => null },
  { id: 'loiro', nome: 'Loiro', name: 'Loiro', hex: 0xc99f52, build: () => null },
  { id: 'salpimenta', nome: 'Sal e pimenta', name: 'Sal e pimenta', hex: 0x6f6a67, build: () => null },
  { id: 'grisalho', nome: 'Grisalho', name: 'Grisalho', hex: 0x9c9791, build: () => null },
  { id: 'branca', nome: 'Branca', name: 'Branca', hex: 0xe4ded2, build: () => null },
]

/** Cor de cabelo por indice (com wrap, nunca quebra). */
export function hairColorOf(i) {
  return CORES_CABELO[wrapIdx(i, CORES_CABELO.length)].hex
}

export function hairColorFrom(ctx) {
  if (ctx && ctx.hairColor !== undefined) return hairColorOf(ctx.hairColor)
  if (ctx && ctx.corCabelo !== undefined) return hairColorOf(ctx.corCabelo)
  return CORES_CABELO[1].hex
}

/**
 * Cor da barba. O indice 0 ("igual ao cabelo") nao tem cor propria de proposito:
 * ele LE a do cabelo, que e o que 80% dos jogadores quer sem pensar. Os outros
 * indices ganham a cor da lista.
 */
export function beardColorOf(i, corCabelo) {
  const n = wrapIdx(i, CORES_BARBA.length)
  if (n === 0) return corCabelo !== undefined ? corCabelo : CORES_CABELO[1].hex
  return CORES_BARBA[n].hex
}

export function beardColorFrom(ctx) {
  const cab = hairColorFrom(ctx)
  const i = ctx && (ctx.corBarba !== undefined ? ctx.corBarba : ctx.beardColor)
  return beardColorOf(i || 0, cab)
}

export function hairMat(color, flat) {
  return solid(color, 0.92, 0.02, { side: THREE.DoubleSide, flatShading: !!flat })
}

/**
 * Casca colada no cranio, recortada por duas linhas em theta.
 * Os vertices que passam da linha COLAPSAM nela: recorte limpo sem CSG.
 * opts: { s, t0, t1, lo(az), hi(az), azHalf, flat, wSeg, hSeg, taper/drop/flare }
 */
export function headShell(color, opts = {}) {
  const s = opts.s || 1.03
  const t0 = opts.t0 !== undefined ? opts.t0 : 0
  const t1 = opts.t1 !== undefined ? opts.t1 : Math.PI
  const wSeg = opts.wSeg || 36, hSeg = opts.hSeg || 26
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
  return sh(new THREE.Mesh(geo, opts.mat || hairMat(color, opts.flat)))
}

/** Casca de cabelo: do topo ate a linha lineFn(az). */
export function scalp(color, lineFn, opts = {}) {
  return headShell(color, Object.assign({}, opts, {
    s: opts.s || 1.035,
    t0: 0,
    t1: opts.thetaMax || 1.62,
    hi: lineFn,
  }))
}

/**
 * Ponto NA superficie da cabeca a partir de (theta, az), com afastamento.
 * Atalho pra quem planta pelo: devolve tambem a normal, que e a direcao em que
 * o fio nasce.
 */
export function pontoNaPele(theta, az, fora = 0, outP, outN) {
  const p = eggSurface(theta, az, 1, outP)
  const n = eggNormal(theta, az, outN)
  if (fora) p.addScaledVector(n, fora)
  return p
}

export { mats }
