import * as THREE from 'three'
import * as mats from '../world/materials.js'

const { solid, stdMat, tex, PALETTE } = mats

// ---------------------------------------------------------------------------
// Catalogo de aparencia + a matematica da cabeca em formato de OVO.
// Este arquivo e a fonte da verdade da geometria craniana: character.js e os
// builds de cabelo/olho/boca usam os mesmos helpers pra tudo encaixar perfeito.
// Sistema local da cabeca: origem no CENTRO do cranio, +Z = frente, +Y = cima.
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

/** Fator de afinamento para uma altura normalizada (-1 = base, +1 = topo). */
function taperAt(yn, amount) {
  const below = yn < 0 ? -yn : 0
  return 1 - (amount === undefined ? TAPER : amount) * Math.pow(below, TAPER_P)
}

/**
 * Deforma uma esfera unitaria no formato de ovo/pera da cabeca.
 * opts: { taper, drop (estica pra baixo), flare (engorda embaixo) }.
 */
export function deformEgg(geo, s = 1, opts = {}) {
  const amount = opts.taper !== undefined ? opts.taper : TAPER
  const drop = opts.drop || 0
  const flare = opts.flare || 0
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const below = v.y < 0 ? -v.y : 0
    const t = taperAt(v.y, amount)
    const f = 1 + flare * below
    // nuca levemente achatada, com transicao suave pra nao criar vinco
    const back = 1 - NAPE * (v.z < 0 ? -v.z : 0)
    pos.setXYZ(
      i,
      v.x * HEAD.rx * s * t * f,
      v.y * HEAD.ry * s * (1 + drop * below),
      v.z * HEAD.rz * s * t * f * back,
    )
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/** Geometria da cabeca (esfera deformada). s>1 gera cascas de cabelo. */
export function makeHeadGeometry(s = 1, wSeg = 28, hSeg = 22) {
  return deformEgg(new THREE.SphereGeometry(1, wSeg, hSeg), s)
}

/** Ponto da superficie do ovo para (theta a partir do topo, azimute 0=frente). */
export function eggSurface(theta, az, s = 1, out) {
  const o = out || new THREE.Vector3()
  const st = Math.sin(theta)
  const ux = st * Math.sin(az), uy = Math.cos(theta), uz = st * Math.cos(az)
  const t = taperAt(uy)
  const back = 1 - NAPE * (uz < 0 ? -uz : 0)
  o.set(ux * HEAD.rx * s * t, uy * HEAD.ry * s, uz * HEAD.rz * s * t * back)
  return o
}

/** Normal aproximada da superficie em (theta, az) — elipsoide sem afinamento. */
export function eggNormal(theta, az, out) {
  const o = out || new THREE.Vector3()
  const st = Math.sin(theta)
  o.set(
    (st * Math.sin(az)) / HEAD.rx,
    Math.cos(theta) / HEAD.ry,
    (st * Math.cos(az)) / HEAD.rz,
  )
  return o.normalize()
}

/** Z da superficie frontal da cabeca em (x,y). pad = folga anti z-fighting. */
export function surfaceZ(x, y, pad = 0) {
  const yn = clamp(y / HEAD.ry, -1, 1)
  const t = taperAt(yn)
  const xn = x / (HEAD.rx * t)
  const r2 = 1 - yn * yn - xn * xn
  const zn = r2 > 0 ? Math.sqrt(r2) : 0
  return zn * HEAD.rz * t + pad
}

/**
 * Projeta uma geometria plana (desenhada no plano XY em coordenadas locais da
 * cabeca) sobre a superficie do ovo: o Z original vira "altura sobre a pele".
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

/** PRNG deterministico (mesmo cabelo espetado toda vez). */
function rng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** Alinha o +Y do objeto com uma direcao. */
const _UPY = new THREE.Vector3(0, 1, 0)
function alignY(obj, dir) { obj.quaternion.setFromUnitVectors(_UPY, dir) }

const EXTRUDE = { depth: 0.012 * S, bevelEnabled: true, bevelThickness: 0.0022 * S, bevelSize: 0.0022 * S, bevelSegments: 2, curveSegments: 5 }

function extrudeOpts(depth, bevel) {
  return Object.assign({}, EXTRUDE, { depth, bevelThickness: bevel, bevelSize: bevel })
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
function facePiece(shape, mat, depth = 0.011 * S, pad = 0.004 * S, bevel = 0.0022 * S) {
  const geo = new THREE.ExtrudeGeometry(shape, extrudeOpts(depth, bevel))
  wrapToHead(geo, pad)
  return sh(new THREE.Mesh(geo, mat))
}

// ---------------------------------------------------------------------------
// CABELO
// ---------------------------------------------------------------------------

export const HAIR_COLORS = [
  { name: 'Preto', hex: 0x1c1718 },
  { name: 'Castanho', hex: 0x4a2c19 },
  { name: 'Ruivo', hex: 0xb2481f },
  { name: 'Loiro', hex: 0xd9ac57 },
  { name: 'Grisalho', hex: 0x9c9791 },
  { name: 'Platinado', hex: 0xe7e1d3 },
]

function hairMat(color, flat) {
  return solid(color, 0.92, 0.02, { side: THREE.DoubleSide, flatShading: !!flat })
}

/**
 * Casca do craneo: esfera cortada, com a linha do cabelo variando por azimute
 * (lineFn(az) devolve o theta maximo). Os aneis que passam da linha colapsam
 * nela, o que da um recorte limpo sem precisar de CSG.
 * Como y = ry*cos(theta), theta constante = linha reta na testa.
 */
function scalp(color, lineFn, opts = {}) {
  const s = opts.s || 1.035
  const thetaMax = opts.thetaMax || 1.62
  const wSeg = opts.wSeg || 36, hSeg = opts.hSeg || 26
  // opts.azHalf limita a casca a um setor na FRENTE (usado pela franja reta).
  // No SphereGeometry o phi = PI/2 aponta pra +Z, entao o setor frontal e
  // centrado ali. Sem azHalf, gera a esfera inteira como antes.
  const phiStart = opts.azHalf ? Math.PI / 2 - opts.azHalf : 0
  const phiLen = opts.azHalf ? opts.azHalf * 2 : Math.PI * 2
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg, phiStart, phiLen, 0, thetaMax)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const az = Math.atan2(v.x, v.z)
    const th = Math.acos(clamp(v.y, -1, 1))
    const lim = Math.min(thetaMax, lineFn(az))
    if (th > lim) {
      const st = Math.sin(lim)
      pos.setXYZ(i, st * Math.sin(az), Math.cos(lim), st * Math.cos(az))
    }
  }
  pos.needsUpdate = true
  deformEgg(geo, s, opts)
  return sh(new THREE.Mesh(geo, hairMat(color, opts.flat)))
}

/**
 * Linha do cabelo suave: theta = front na testa, theta = side nas laterais/nuca,
 * com transicao em smoothstep. A rampa linear antiga criava um canto vivo perto
 * da orelha que lia como uma "aba" retangular colada na cabeca.
 */
function hairline(front, side, a0, a1) {
  return (az) => {
    const a = az < 0 ? -az : az
    if (a <= a0) return front
    if (a >= a1) return side
    const t = (a - a0) / (a1 - a0)
    return front + (side - front) * t * t * (3 - 2 * t)
  }
}

export const HAIR = [
  {
    id: 'short',
    name: 'Curto',
    build(ctx) {
      const c = ctx.hairColor
      const g = new THREE.Group()
      // Linha da franja em theta constante na frente => borda RETA na testa.
      // 0.84 deixa ~15 mm de testa livre acima da sobrancelha (BROW_Y + metade
      // da espessura); mais baixo que isso e o cabelo invade a sobrancelha.
      const cap = scalp(c, hairline(0.84, 1.60, 0.86, 2.30), { s: 1.035, thetaMax: 1.62 })
      g.add(cap)
      // Franja propriamente dita: casca extra SO no setor frontal, maior e um
      // pouco mais baixa que o cap, criando a aba reta que pende sobre a testa.
      g.add(scalp(c, () => 0.90, { s: 1.078, thetaMax: 0.90, azHalf: 1.00, wSeg: 30, hSeg: 16 }))
      // volume extra no topo pra silhueta nao ficar colada demais
      const top = scalp(c, () => 0.62, { s: 1.078, thetaMax: 0.62, wSeg: 28, hSeg: 12 })
      g.add(top)
      return g
    },
  },
  {
    id: 'spiky',
    name: 'Espetado',
    build(ctx) {
      const c = ctx.hairColor
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
    name: 'Comprido',
    build(ctx) {
      const c = ctx.hairColor
      const g = new THREE.Group()
      // uma unica casca: franja na testa na frente, cortina longa dos lados/atras
      // franja reta na testa e, depois de uma transicao suave, a cortina longa
      const front = hairline(0.86, 2.05, 0.72, 1.06)
      const back = hairline(2.05, 2.50, 1.06, 2.40)
      g.add(scalp(c, (az) => {
        const a = az < 0 ? -az : az
        return a < 1.06 ? front(az) : back(az)
      }, { s: 1.05, thetaMax: 2.52, taper: 0.10, drop: 0.85, flare: 0.30, hSeg: 34 }))
      // Duas mechas emoldurando o rosto ate o queixo. Sem alignZ de proposito:
      // a normal do cranio ali e quase lateral e deitava a mecha. Aqui ela fica
      // pendurada na vertical e so inclina pra dentro, acompanhando o afinamento
      // do queixo (o ovo estreita ~30% abaixo do equador).
      const m = hairMat(c)
      for (const sgn of [1, -1]) {
        // mecha afunilada (hexagono achatado) em vez de uma placa retangular
        const strand = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.026 * S, 0.012 * S, 0.300 * S, 6), m))
        strand.scale.set(1.25, 1, 0.8)
        // nasce ACIMA da linha do corte (theta 1.22) pra o topo ficar enterrado
        // na cortina; solta no ar so a parte que desce ao lado do queixo
        eggSurface(1.22, sgn * 0.88, 1.045, strand.position)
        strand.position.y -= 0.139 * S
        strand.rotation.y = sgn * 0.50
        strand.rotation.z = -sgn * 0.22
        g.add(strand)
      }
      return g
    },
  },
]

// ---------------------------------------------------------------------------
// OLHOS — bolhas brancas salientes, projetadas pra fora da face
// ---------------------------------------------------------------------------

// Geometria-modelo do globo. NUNCA vai direto pra cena: character.clearSlot()
// da dispose() em toda geometria que encontra no slot, e como este modulo e
// compartilhado por TODOS os Characters isso quebraria os outros bonecos.
// Cada olho recebe um clone proprio (ver eyeBallGeo()).
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

function scleraMat(kind) {
  if (kind === 'tired') {
    const map = tex('sclera-tired', 256, (g, s) => {
      g.fillStyle = '#f7e6df'; g.fillRect(0, 0, s, s)
      // veias: linhas irregulares e ramificadas, grossas o bastante pra lerem
      // de longe (o olho tem so ~8 cm na tela a 3 m)
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
        // ramo curto saindo do meio da veia
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
    return stdMat('sclera:tired', { map, roughness: 0.22, metalness: 0.0 })
  }
  return stdMat('sclera:clean', { color: 0xfbf7f2, roughness: 0.18, metalness: 0.0 })
}

const irisMatOf = (hex) => solid(hex, 0.24, 0.05)
const pupilMat = () => solid(0x0d0a0c, 0.3, 0.0)
const glintMat = () => stdMat('eye-glint', { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.1 })

/**
 * Monta um olho: bolha branca SALIENTE + iris + pupila + brilho, todos como
 * calotas coladas na superficie do globo.
 *
 * O truque do "shell": o grupo carrega a escala do elipsoide (rx,ry,rz) e tudo
 * dentro dele tem raio 1 e so ROTACAO. Como o Three compoe pai*filho, a escala
 * entra DEPOIS da rotacao — entao qualquer calota rotacionada cai exatamente
 * sobre o elipsoide, sem deformar e sem precisar calcular z de tampa plana.
 * (Antes iris/pupila eram discos planos com z fixo, que caiam ATRAS do polo do
 * globo: o olho virava uma bola branca sem pupila.)
 *
 * o: { x, y, rx, ry, rz, sink, iris, pupil, irisColor, kind, lid }
 */
function makeEye(sgn, o) {
  const eye = new THREE.Group()
  const y = o.y
  // sink < 0.5 => mais da metade do globo fica PRA FORA da pele (bolha saliente)
  eye.position.set(sgn * o.x, y, surfaceZ(o.x, y) - o.rz * o.sink)

  const shell = new THREE.Group()
  shell.scale.set(o.rx, o.ry, o.rz)
  eye.add(shell)

  shell.add(sh(new THREE.Mesh(eyeBallGeo(), scleraMat(o.kind))))

  // Raios lineares do catalogo viram angulos de calota (r = rx * sen(theta)).
  const irisTheta = Math.asin(clamp(o.iris / o.rx, 0.06, 0.94))
  const pupilTheta = Math.min(irisTheta * 0.86, Math.asin(clamp(o.pupil / o.rx, 0.04, 0.9)))

  // Escalas escalonadas (0.8% / 1.8% / 3.0% do raio ~= 0.3 / 0.6 / 1.1 mm):
  // suficiente pra nunca haver z-fighting, pequeno demais pra soltar da bolha.
  const iris = new THREE.Mesh(capGeo(irisTheta, 26, 12), irisMatOf(o.irisColor))
  iris.scale.setScalar(1.008)
  iris.castShadow = false; iris.receiveShadow = true
  shell.add(iris)

  const pupil = new THREE.Mesh(capGeo(pupilTheta, 22, 10), pupilMat())
  pupil.scale.setScalar(1.018)
  pupil.castShadow = false
  shell.add(pupil)

  // brilho especular: calota pequena deslocada pra cima e pro lado de dentro
  const glint = new THREE.Mesh(capGeo(pupilTheta * 0.44, 12, 6), glintMat())
  glint.scale.setScalar(1.030)
  glint.rotation.set(-0.26, -sgn * 0.24, 0)
  glint.castShadow = false
  shell.add(glint)

  // palpebra superior caida: calota de pele por cima da bolha, tombada pra
  // frente. arc + tilt define onde a borda para (aqui logo acima da pupila).
  if (o.lid) {
    const lid = sh(new THREE.Mesh(
      new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, o.lid.arc),
      solid(o.lid.color, 0.75, 0.0, { side: THREE.DoubleSide }),
    ))
    lid.scale.setScalar(1.07)
    lid.rotation.x = o.lid.tilt
    shell.add(lid)
  }
  return eye
}

function eyePair(o) {
  const g = new THREE.Group()
  g.add(makeEye(1, o), makeEye(-1, o))
  return g
}

export const EYES = [
  {
    id: 'normal',
    name: 'Normal',
    build(ctx) {
      return eyePair({
        x: EYE_ANCHOR.x, y: EYE_ANCHOR.y,
        rx: 0.0430 * S, ry: 0.0460 * S, rz: 0.0360 * S, sink: 0.45,
        iris: 0.0235 * S, pupil: 0.0125 * S, irisColor: 0x3b2a1e, kind: 'clean',
      })
    },
  },
  {
    id: 'tired',
    name: 'Cansado',
    build(ctx) {
      const g = eyePair({
        x: EYE_ANCHOR.x, y: EYE_ANCHOR.y - 0.002 * S,
        rx: 0.0428 * S, ry: 0.0438 * S, rz: 0.0352 * S, sink: 0.47,
        iris: 0.0228 * S, pupil: 0.0120 * S, irisColor: 0x4a3524, kind: 'tired',
        // arc + tilt = 1.34 rad a partir do +Y => a borda da palpebra para
        // ~0.23 rad acima da pupila: cai, mas sem tapar o olhar.
        lid: { arc: 0.72, tilt: 0.62, color: shade(ctx.skin, 0.80) },
      })
      // olheiras: meia-lua escura ABAIXO da bolha (o globo saliente esconderia
      // qualquer coisa desenhada na altura antiga)
      const dark = solid(shade(ctx.skin, 0.70), 0.9)
      for (const sgn of [1, -1]) {
        g.add(facePiece(curvedBar(sgn * EYE_ANCHOR.x, EYE_ANCHOR.y - 0.052 * S, 0.070 * S, 0.016 * S, -0.012 * S, 0, 0.7), dark, 0.005 * S, 0.003 * S, 0.0015 * S))
      }
      return g
    },
  },
  {
    id: 'wide',
    name: 'Arregalado',
    build(ctx) {
      // globo maior e menos afundado; iris menor em relacao a esclera = susto
      return eyePair({
        x: EYE_ANCHOR.x + 0.004 * S, y: EYE_ANCHOR.y + 0.004 * S,
        rx: 0.0530 * S, ry: 0.0555 * S, rz: 0.0445 * S, sink: 0.40,
        iris: 0.0215 * S, pupil: 0.0118 * S, irisColor: 0x2f4a63, kind: 'clean',
      })
    },
  },
]

// ---------------------------------------------------------------------------
// SOBRANCELHAS
// ---------------------------------------------------------------------------

// Sobe pra 0.096: o globo ocular agora e uma bolha saliente (topo em ~0.081) e
// a sobrancelha precisa ficar acima dela, na testa, pra ler como sobrancelha.
const BROW_Y = 0.096 * S

function browsFrom(mat, make) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) g.add(make(sgn, mat))
  return g
}

export const BROWS = [
  {
    id: 'thick',
    name: 'Grossa reta',
    build(ctx) {
      const m = solid(shade(ctx.hairColor, 0.55), 0.95)
      // 30 mm de altura e 18 mm de saliencia: bloco de sobrancelha que ainda
      // se distingue a 3 m de distancia
      return browsFrom(m, (sgn) => facePiece(
        curvedBar(sgn * 0.064 * S, BROW_Y, 0.086 * S, 0.030 * S, 0.005 * S, sgn * 0.09, 0.26), m, 0.018 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'arched',
    name: 'Arqueada',
    build(ctx) {
      const m = solid(shade(ctx.hairColor, 0.5), 0.95)
      return browsFrom(m, (sgn) => facePiece(
        curvedBar(sgn * 0.064 * S, BROW_Y - 0.004 * S, 0.088 * S, 0.023 * S, 0.018 * S, sgn * 0.05, 0.62), m, 0.016 * S, 0.004 * S,
      ))
    },
  },
  {
    id: 'angry',
    name: 'Fina franzida',
    build(ctx) {
      const m = solid(shade(ctx.hairColor, 0.45), 0.95)
      // inclinada pra baixo no centro = cara de bravo
      return browsFrom(m, (sgn) => facePiece(
        curvedBar(sgn * 0.062 * S, BROW_Y - 0.002 * S, 0.082 * S, 0.019 * S, 0.004 * S, -sgn * 0.32, 0.7), m, 0.014 * S, 0.004 * S,
      ))
    },
  },
]

// ---------------------------------------------------------------------------
// BOCA
// ---------------------------------------------------------------------------

const MOUTH_Y = -0.072 * S

/**
 * Bigode INTEIRICO (uma unica Shape). Antes eram duas metades sobrepostas ~7 mm
 * no centro, o que dava z-fighting na linha do meio.
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

export const MOUTH = [
  {
    id: 'smile',
    name: 'Sorriso',
    build(ctx) {
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
    id: 'open',
    name: 'Neutra aberta',
    build(ctx) {
      const g = new THREE.Group()
      const inner = solid(0x2a1010, 0.85)
      const lip = solid(shade(ctx.skin, 0.78), 0.8)
      const s = new THREE.Shape()
      s.absellipse(0, MOUTH_Y, 0.026 * S, 0.016 * S, 0, Math.PI * 2, false, 0)
      g.add(facePiece(s, inner, 0.006 * S, 0.0025 * S, 0.0015 * S))
      // labio inferior saliente
      g.add(facePiece(curvedBar(0, MOUTH_Y - 0.021 * S, 0.058 * S, 0.014 * S, -0.006 * S, 0, 0.6), lip, 0.010 * S, 0.004 * S))
      return g
    },
  },
  {
    id: 'beard',
    name: 'Bigode e cavanhaque',
    build(ctx) {
      const g = new THREE.Group()
      const hairM = solid(shade(ctx.hairColor, 0.55), 0.95)
      const inner = solid(0x2c1512, 0.85)
      // boca (traco) por dentro do cavanhaque
      g.add(facePiece(curvedBar(0, MOUTH_Y, 0.048 * S, 0.009 * S, -0.006 * S, 0, 0.5), inner, 0.007 * S, 0.0055 * S, 0.0018 * S))
      // bigode logo abaixo do nariz (base do nariz fica em ~y -0.040 * S)
      g.add(facePiece(
        moustacheShape(MOUTH_Y + 0.022 * S, 0.047 * S, 0.027 * S, 0.014 * S, 0.0065 * S),
        hairM, 0.017 * S, 0.0045 * S,
      ))
      // cavanhaque: anel em volta da boca descendo pro queixo. pad/depth
      // diferentes do bigode pra que as superficies nunca fiquem coplanares.
      const ring = new THREE.Shape()
      ring.absellipse(0, MOUTH_Y - 0.018 * S, 0.055 * S, 0.064 * S, 0, Math.PI * 2, false, 0)
      const hole = new THREE.Path()
      hole.absellipse(0, MOUTH_Y - 0.002 * S, 0.032 * S, 0.030 * S, 0, Math.PI * 2, true, 0)
      ring.holes.push(hole)
      g.add(facePiece(ring, hairM, 0.014 * S, 0.0032 * S))
      return g
    },
  },
]

// ---------------------------------------------------------------------------

export function defaultAppearance() {
  return {
    hair: 0,
    eyes: 0,
    brows: 0,
    mouth: 0,
    hairColor: 1,
    // Bege claro QUENTE e levemente rosado. O PALETTE.skin antigo (0xf3d9bd)
    // tinha verde alto demais e, com o tone mapping ACES + ceu azulado, a pele
    // lia como cinza-esverdeada na tela.
    skin: SKIN_DEFAULT,
    shirt: 0x4c73a8,
    pants: 0x39404c,
    shoes: PALETTE.white,
  }
}

/** Cor de cabelo por indice (com wrap, nunca quebra). */
export function hairColorOf(i) {
  const c = HAIR_COLORS[((i | 0) % HAIR_COLORS.length + HAIR_COLORS.length) % HAIR_COLORS.length]
  return c.hex
}

export const CATALOGS = { hair: HAIR, eyes: EYES, brows: BROWS, mouth: MOUTH }

export { shade as shadeColor }
