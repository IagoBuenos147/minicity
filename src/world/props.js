import * as THREE from 'three'
import {
  PALETTE, solid, emissive, glass, box, cyl, sphere, roundedBox,
  textPlaneMat, paintingMat, woodTex, concreteTex,
} from './materials.js'

// ---------------------------------------------------------------------------
// Biblioteca de props urbanos. Todos retornam THREE.Group com:
//   - origem na BASE (y=0), frente para +Z
//   - userData.collider = { w, d } (largura X / profundidade Z) ou null
//   - userData.lights = [] (luzes criadas pelo prop, tambem filhas do grupo)
//   - userData.update = (dt) => {} apenas quando ha animacao
// Excecao documentada: makeFramedPicture usa origem no CENTRO (fica pendurado).
// ---------------------------------------------------------------------------

// PRNG deterministico simples (mulberry-ish) para props com seed.
function rng(seed) {
  let s = (seed * 1103515245 + 12345) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function mk() {
  const g = new THREE.Group()
  g.userData.collider = null
  g.userData.lights = []
  return g
}

function addLight(group, light) {
  group.add(light)
  group.userData.lights.push(light)
  return light
}

// Cache de geometrias que se repetem muito dentro dos props.
const _geo = new Map()
function geo(key, make) {
  if (!_geo.has(key)) _geo.set(key, make())
  return _geo.get(key)
}
function meshOf(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.castShadow = true; o.receiveShadow = true
  return o
}

// --- Casca de arvore (textura procedural, criada uma vez so) ----------------
let _barkTex = null
function barkTex() {
  if (_barkTex) return _barkTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const x2 = c.getContext('2d')
  // Base CLARA de proposito: o material multiplica cor x mapa, entao textura
  // escura + cor escura dava um tronco quase preto.
  x2.fillStyle = '#cfae8a'; x2.fillRect(0, 0, 128, 128)
  // sulcos verticais: e o que da a leitura de "casca" de longe
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * 128
    const dark = Math.random() > 0.45
    x2.strokeStyle = dark ? 'rgba(96,70,46,0.45)' : 'rgba(238,216,190,0.40)'
    x2.lineWidth = 0.8 + Math.random() * 3.2
    x2.beginPath(); x2.moveTo(x, -6)
    for (let y = 0; y <= 134; y += 11) x2.lineTo(x + Math.sin(y * 0.085 + i) * 2.6, y)
    x2.stroke()
  }
  // manchas de liquen/musgo esverdeado
  for (let i = 0; i < 34; i++) {
    x2.fillStyle = 'rgba(126,146,98,' + (Math.random() * 0.17) + ')'
    x2.beginPath(); x2.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 10, 0, 7); x2.fill()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 3)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  _barkTex = t
  return t
}

// --- Materiais compartilhados ----------------------------------------------
const M = {
  darkMetal: () => solid(0x2c2f33, 0.55, 0.65),
  metal: () => solid(PALETTE.metal, 0.45, 0.8),
  chrome: () => solid(PALETTE.chrome, 0.2, 0.95),
  paintGreen: () => solid(0x2f5b3f, 0.6, 0.2),
  paintRed: () => solid(0xb62d2d, 0.55, 0.25),
  black: () => solid(PALETTE.black, 0.7, 0.15),
  white: () => solid(PALETTE.white, 0.75, 0.05),
  wood: () => solid(0x8a5a34, 0.85, 0.0, { map: woodTex(1) }),
  woodPale: () => solid(0xa07048, 0.9, 0.0, { map: woodTex(1) }),
  concrete: () => solid(0xb2ada4, 0.95, 0.0, { map: concreteTex(1) }),
  bark: () => solid(0x9b8064, 0.95, 0.0, { map: barkTex() }),
  barkDark: () => solid(0x7d654c, 0.95, 0.0, { map: barkTex() }),
}

// Paleta FECHADA de folhagem. Cores quantizadas de proposito: city.js funde os
// props por material, entao poucos materiais = poucas draw calls no fim.
// Indice baixo = interior sombreado, indice alto = borda pegando luz.
// Verdes DESSATURADOS de proposito (o resto da cidade e lavado; verde puro
// pulava da tela como plastico).
const LEAF = [0x4a5c39, 0x566a42, 0x63794c, 0x718a58, 0x829b66, 0x94ad77, 0xa7be8b]
function leafMat(i) {
  const k = i < 0 ? 0 : i > LEAF.length - 1 ? LEAF.length - 1 : i | 0
  return solid(LEAF[k], 0.92, 0.0)
}

/**
 * Tubo que AFINA ao longo de uma curva (galhos, bracos de poste).
 * Custo = steps * radial * 2 triangulos. Deslocamento continuo por posicao,
 * sem costura. Retorna BufferGeometry ja com normal e uv.
 */
function limbGeo(pts, rBase, rTip, radial = 6, steps = 6) {
  const curve = new THREE.CatmullRomCurve3(pts)
  const fr = curve.computeFrenetFrames(steps, false)
  const pos = [], nor = [], uv = [], idx = []
  const P = new THREE.Vector3()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    curve.getPoint(t, P)
    const N = fr.normals[i], B = fr.binormals[i]
    // afina com curva suave (t^0.8) em vez de linear: fica menos "cone"
    const rr = rBase + (rTip - rBase) * Math.pow(t, 0.8)
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const cs = Math.cos(a), sn = Math.sin(a)
      const nx = N.x * cs + B.x * sn
      const ny = N.y * cs + B.y * sn
      const nz = N.z * cs + B.z * sn
      pos.push(P.x + nx * rr, P.y + ny * rr, P.z + nz * rr)
      nor.push(nx, ny, nz)
      uv.push(j / radial, t)
    }
  }
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = a + radial + 1
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/**
 * TUFO de folhagem: esferinha de poucos segmentos construida na mao.
 * Por que nao um icosaedro: com 20 faces cada faceta de um bolo de 1 m fica do
 * tamanho de meio metro e a silhueta pontuda le como CRISTAL. Aqui sao 6 x 4
 * segmentos (36 triangulos, 20 vertices) em pecas pequenas, entao a faceta
 * some. O anel FECHA (o ultimo setor reusa o primeiro vertice) e cada polo e
 * um vertice unico -> computeVertexNormals sai suave, sem costura.
 * Folhagem NUNCA usa flatShading: faceta plana e o que da o ar de pedra.
 */
const TUFT_SEG = 6, TUFT_RINGS = 4
function tuftGeo(variant = 0) {
  return geo('tuft:' + variant, () => {
    const pos = [], idx = []
    const ph = variant * 2.4
    // deformacao PEQUENA (~14%) e continua na posicao: quebra o contorno
    // hexagonal sem virar espeto (a funcao e suave, nao sorteada por vertice)
    const push = (x, y, z) => {
      const d = Math.sin(x * 3.1 + ph) * 0.5
        + Math.cos(y * 2.3 + ph * 1.7) * 0.3
        + Math.sin(z * 2.7 + ph * 0.8) * 0.4
      const s = 1 + d * 0.12
      pos.push(x * s, y * s, z * s)
    }
    push(0, 1, 0)
    for (let i = 1; i < TUFT_RINGS; i++) {
      const th = (i / TUFT_RINGS) * Math.PI
      const sy = Math.cos(th), sr = Math.sin(th)
      for (let j = 0; j < TUFT_SEG; j++) {
        const a = (j / TUFT_SEG) * Math.PI * 2
        push(sr * Math.cos(a), sy, sr * Math.sin(a))
      }
    }
    push(0, -1, 0)
    const south = 1 + (TUFT_RINGS - 1) * TUFT_SEG
    const lastRing = south - TUFT_SEG
    for (let j = 0; j < TUFT_SEG; j++) {
      const jn = (j + 1) % TUFT_SEG
      idx.push(0, 1 + jn, 1 + j)                       // calota de cima
      idx.push(south, lastRing + j, lastRing + jn)     // calota de baixo
    }
    for (let i = 0; i < TUFT_RINGS - 2; i++) {
      const up = 1 + i * TUFT_SEG, dn = up + TUFT_SEG
      for (let j = 0; j < TUFT_SEG; j++) {
        const jn = (j + 1) % TUFT_SEG
        idx.push(up + j, up + jn, dn + j, up + jn, dn + jn, dn + j)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeVertexNormals()   // normais SUAVES (flatShading fica false)
    return g
  })
}

/**
 * Massa de folhagem: MUITOS tufos pequenos sobrepostos em vez de poucas
 * bolotas grandes. Usada pela arvore, pela floreira e pelo vaso, pra folhagem
 * ter a mesma "linguagem".
 * cx/cy/cz = centro, rad = raio da massa, size = RAIO de cada tufo,
 * n = quantidade de tufos, tone = indice base na paleta LEAF.
 */
function foliageClump(g, cx, cy, cz, rad, size, n, tone, r, flat = 0.85) {
  for (let i = 0; i < n; i++) {
    // espiral do angulo aureo + casca esferica: cobre a massa por igual sem
    // alinhar os tufos em fileiras (fileira le como padrao, nao como folha)
    const a = i * 2.39996 + r() * 0.9
    const yy = n > 1 ? 1 - 2 * ((i + 0.5) / n) : 0
    const ring = Math.sqrt(Math.max(0.10, 1 - yy * yy))
    const rr = rad * ring * (0.55 + r() * 0.55)
    const px = cx + Math.cos(a) * rr
    const pz = cz + Math.sin(a) * rr
    const py = cy + yy * rad * flat * 0.85 + (r() - 0.5) * rad * 0.25
    // borda e topo pegam mais luz -> tom mais claro (miolo fica sombreado)
    const edge = rad > 0.001 ? rr / rad : 0
    const t = tone + Math.round(edge * 1.5 + Math.max(0, yy) * 1.5 + (r() - 0.5) * 0.9)
    // 6 variantes de amassado + escala bem variada: sem isso a copa vira
    // "cacho de uva", um monte de bolinha do mesmo tamanho
    const b = new THREE.Mesh(tuftGeo(i % 6), leafMat(t))
    b.position.set(px, py, pz)
    b.scale.set(size * (0.70 + r() * 0.48), size * flat * (0.74 + r() * 0.42), size * (0.70 + r() * 0.48))
    b.rotation.set(r() * 3.1, r() * 3.1, r() * 3.1)
    b.castShadow = true; b.receiveShadow = true
    g.add(b)
  }
}

// ===========================================================================
// POSTE DE LUZ
// ===========================================================================
export function makeStreetLight() {
  const g = mk()
  const dark = M.darkMetal()

  // base com colar e parafusos
  const base = cyl(0.20, 0.26, 0.16, M.concrete(), 14)
  base.position.y = 0.08
  g.add(base)
  const collar = cyl(0.15, 0.17, 0.12, dark, 14)
  collar.position.y = 0.21
  g.add(collar)
  const boltG = geo('bolt', () => new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.add(meshOf(boltG, M.chrome(), Math.cos(a) * 0.19, 0.17, Math.sin(a) * 0.19))
  }

  // mastro conico 6.2 m
  const pole = cyl(0.065, 0.105, 6.2, dark, 14)
  pole.position.y = 0.16 + 3.1
  g.add(pole)
  // anel decorativo no meio
  const ring = cyl(0.10, 0.10, 0.07, M.metal(), 14)
  ring.position.y = 1.5
  g.add(ring)

  // porta de inspecao com dobradica e parafuso (todo poste real tem uma)
  const hatch = box(0.10, 0.42, 0.015, solid(0x3a3f45, 0.6, 0.5), 0, 0.95, 0.098)
  g.add(hatch)
  for (const y of [0.80, 1.10]) {
    const hg = meshOf(geo('lamp-hinge', () => new THREE.BoxGeometry(0.035, 0.05, 0.03)), M.metal(), -0.05, y, 0.10)
    g.add(hg)
  }
  // placa de numero do poste
  const numPlate = box(0.16, 0.11, 0.012, M.metal(), 0, 1.72, 0.088)
  g.add(numPlate)
  const numFace = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.09), textPlaneMat('P-214', {
    w: 256, h: 128, bg: '#d8dade', color: '#22262a',
    font: 'bold 62px "Trebuchet MS", sans-serif', emissiveIntensity: 0.04,
  }))
  numFace.position.set(0, 1.72, 0.095)
  g.add(numFace)

  // junta flangeada onde o braco encaixa no mastro
  const joint = cyl(0.09, 0.11, 0.16, M.metal(), 12)
  joint.position.y = 6.02
  g.add(joint)
  const jBoltG = geo('bolt-t', () => new THREE.CylinderGeometry(0.016, 0.016, 0.035, 6))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    g.add(meshOf(jBoltG, M.chrome(), Math.cos(a) * 0.095, 6.02, Math.sin(a) * 0.095))
  }

  // braco curvo que AFINA da base pra ponta (o tubo de raio fixo era pesadao)
  const arm = new THREE.Mesh(limbGeo([
    new THREE.Vector3(0, 6.05, 0),
    new THREE.Vector3(0, 6.50, 0.28),
    new THREE.Vector3(0, 6.72, 0.95),
    new THREE.Vector3(0, 6.74, 1.66),
  ], 0.068, 0.040, 8, 10), dark)
  arm.castShadow = true; arm.receiveShadow = true
  g.add(arm)
  // escora fina fechando o triangulo braco/mastro
  const stay = new THREE.Mesh(limbGeo([
    new THREE.Vector3(0, 5.42, 0.02),
    new THREE.Vector3(0, 5.95, 0.38),
    new THREE.Vector3(0, 6.36, 0.72),
  ], 0.024, 0.018, 5, 3), dark)
  stay.castShadow = true; stay.receiveShadow = true
  g.add(stay)

  // luminaria: casco em gota, aro, refletor, vidro e lente emissiva
  const head = new THREE.Group()
  head.position.set(0, 6.72, 1.72)
  head.rotation.x = 0.18
  const shell = roundedBox(0.42, 0.15, 0.80, 0.07, dark)
  head.add(shell)
  // "nariz" que fecha a luminaria contra o braco
  const nose = cyl(0.075, 0.11, 0.16, dark, 10)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.005, -0.44)
  head.add(nose)
  const rim = box(0.48, 0.045, 0.86, M.metal(), 0, -0.072, 0)
  head.add(rim)
  // refletor interno claro: aparece pela lente e da profundidade
  const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.30, 0.09, 12, 1, true), solid(0xe8e4d8, 0.25, 0.85, { side: THREE.DoubleSide }))
  refl.position.set(0, -0.055, 0)
  refl.scale.z = 2.1
  refl.castShadow = false; refl.receiveShadow = false
  head.add(refl)
  // lampada emissiva virada para baixo
  const lens = box(0.32, 0.030, 0.64, emissive(0xffe6ba, 2.6), 0, -0.098, 0)
  head.add(lens)
  // vidro plano por baixo, com reflexo especular
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.76), glass(0xdff0fb, 0.20))
  pane.rotation.x = Math.PI / 2
  pane.position.set(0, -0.112, 0)
  head.add(pane)
  // trava lateral da tampa
  for (const s of [-1, 1]) head.add(box(0.03, 0.05, 0.09, M.chrome(), s * 0.215, -0.055, 0.26))
  g.add(head)

  const light = new THREE.PointLight(0xffdcae, 9, 18, 2)
  light.position.set(0, 6.5, 1.72)
  light.castShadow = false // performance: poste nao projeta sombra
  addLight(g, light)

  g.userData.collider = { w: 0.5, d: 0.5 }
  return g
}

// ===========================================================================
// BANCO DE PRACA
// ===========================================================================
export function makeBench() {
  const g = mk()
  // duas madeiras alternadas: ripa gasta pelo sol x ripa mais nova
  const wood = M.wood()
  const woodPale = M.woodPale()
  const iron = solid(0x22262a, 0.6, 0.5)
  const ironRust = solid(0x4a3428, 0.9, 0.25)

  // Ripas levemente arqueadas: 3 pecas por ripa com y/rot diferentes fazem a
  // curva sem custar geometria nova (a geo e a mesma, reusada).
  const segG = geo('bench-seg', () => new THREE.BoxGeometry(0.62, 0.052, 0.135))
  function slatRow(parent, y, z, arc, mat) {
    for (let k = -1; k <= 1; k++) {
      const s = meshOf(segG, mat, k * 0.60, y - Math.abs(k) * arc, z)
      s.rotation.z = k * arc * 0.55
      parent.add(s)
    }
  }
  // assento: 3 ripas com vao, com caimento suave pro meio
  for (let i = 0; i < 3; i++) {
    slatRow(g, 0.452, -0.19 + i * 0.19, 0.012, i === 1 ? woodPale : wood)
  }
  // encosto: 3 ripas inclinadas
  const back = new THREE.Group()
  back.position.set(0, 0.47, -0.26)
  back.rotation.x = 0.30
  for (let i = 0; i < 3; i++) slatRow(back, 0.16 + i * 0.19, 0, 0.010, i === 2 ? woodPale : wood)
  g.add(back)

  // pes de ferro fundido curvos (perfil por Catmull-Rom extrudado em tubo)
  const legCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.02, 0.34),
    new THREE.Vector3(0, 0.22, 0.30),
    new THREE.Vector3(0, 0.42, 0.12),
    new THREE.Vector3(0, 0.45, -0.10),
    new THREE.Vector3(0, 0.62, -0.30),
    new THREE.Vector3(0, 0.92, -0.42),
  ])
  const legGeo = new THREE.TubeGeometry(legCurve, 18, 0.032, 7, false)
  // braco: tubo que sai do pe e volta pro encosto
  const armGeo = limbGeo([
    new THREE.Vector3(0, 0.60, 0.30),
    new THREE.Vector3(0, 0.66, 0.16),
    new THREE.Vector3(0, 0.67, -0.06),
    new THREE.Vector3(0, 0.66, -0.24),
  ], 0.030, 0.026, 6, 4)
  const footG = geo('bench-foot', () => new THREE.BoxGeometry(0.10, 0.055, 0.46))
  const boltG = geo('bolt-s', () => new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6))
  for (const x of [-0.78, 0.78]) {
    const leg = new THREE.Mesh(legGeo, iron)
    leg.position.x = x
    leg.castShadow = true; leg.receiveShadow = true
    g.add(leg)
    // pe com sapata e 2 parafusos de chumbamento
    g.add(meshOf(footG, ironRust, x, 0.027, 0.06))
    for (const z of [-0.13, 0.25]) {
      g.add(meshOf(boltG, M.chrome(), x, 0.062, z))
    }
    // braco de apoio
    const arm = new THREE.Mesh(armGeo, iron)
    arm.position.x = x
    arm.castShadow = true; arm.receiveShadow = true
    g.add(arm)
    // montante curto ligando braco ao pe
    g.add(box(0.045, 0.20, 0.045, iron, x, 0.52, 0.29))
    // volutas decorativas
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.022, 6, 14, Math.PI * 1.4), iron)
    sw.position.set(x, 0.30, 0.02)
    sw.rotation.y = Math.PI / 2
    sw.castShadow = true; sw.receiveShadow = true
    g.add(sw)
  }
  // travessa que une os pes + placa de fundicao no meio
  g.add(box(1.62, 0.05, 0.06, iron, 0, 0.20, 0.06))
  const plate = box(0.20, 0.12, 0.02, ironRust, 0, 0.20, 0.10)
  g.add(plate)

  // CONTRATO: pontos de "Sentar" no espaco local. y = topo do assento,
  // ry = para onde a pessoa sentada olha (+Z, de costas pro encosto).
  g.userData.seats = [
    { x: -0.58, y: 0.478, z: 0.02, ry: 0 },
    { x: 0.00, y: 0.478, z: 0.02, ry: 0 },
    { x: 0.58, y: 0.478, z: 0.02, ry: 0 },
  ]
  g.userData.collider = { w: 1.9, d: 0.8 }
  return g
}

// ===========================================================================
// LIXEIRA
// ===========================================================================
export function makeTrashCan() {
  const g = mk()
  const body = solid(0x3f5a46, 0.7, 0.35)
  const dark = M.darkMetal()

  const drum = cyl(0.29, 0.25, 0.82, body, 18)
  drum.position.y = 0.46
  g.add(drum)
  // ripas verticais dando textura
  const ribG = geo('trash-rib', () => new THREE.BoxGeometry(0.035, 0.72, 0.035))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.add(meshOf(ribG, dark, Math.cos(a) * 0.275, 0.46, Math.sin(a) * 0.275))
  }
  // aros
  for (const y of [0.16, 0.78]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.022, 6, 20), dark)
    r.position.y = y; r.rotation.x = Math.PI / 2
    r.castShadow = true; r.receiveShadow = true
    g.add(r)
  }
  // pe
  const foot = cyl(0.24, 0.28, 0.06, dark, 16)
  foot.position.y = 0.04
  g.add(foot)
  // tampa em cupula com abertura
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), dark)
  lid.position.y = 0.88
  lid.castShadow = true; lid.receiveShadow = true
  g.add(lid)
  const mouth = cyl(0.13, 0.13, 0.10, M.black(), 14)
  mouth.position.set(0, 0.93, 0.13)
  mouth.rotation.x = 0.35
  g.add(mouth)
  // aba/pestana em volta da boca, senao a abertura fica "recortada" demais
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.022, 6, 16), M.metal())
  bezel.position.set(0, 0.955, 0.135)
  bezel.rotation.x = Math.PI / 2 - 0.35
  bezel.castShadow = true; bezel.receiveShadow = true
  g.add(bezel)
  // pux/dobradica da tampa atras + correntinha de seguranca
  g.add(box(0.14, 0.05, 0.05, M.metal(), 0, 0.90, -0.26))
  const linkG = geo('chain-link', () => new THREE.TorusGeometry(0.022, 0.007, 4, 8))
  for (let i = 0; i < 5; i++) {
    const l = meshOf(linkG, M.metal(), -0.02, 0.86 - i * 0.035, -0.285 + i * 0.006)
    l.rotation.set(Math.PI / 2, (i % 2) * Math.PI / 2, 0)
    g.add(l)
  }
  // pedal de acionamento (silhueta na base, quebra o cilindro puro)
  const pedal = box(0.20, 0.035, 0.11, M.metal(), 0, 0.10, 0.29)
  pedal.rotation.x = -0.14
  g.add(pedal)
  g.add(box(0.035, 0.035, 0.10, dark, 0, 0.12, 0.24))
  // adesivo de reciclagem + faixa municipal
  const tag = box(0.16, 0.16, 0.01, emissive(0x4fd07a, 0.5), 0, 0.52, 0.29)
  g.add(tag)
  const band = cyl(0.295, 0.288, 0.07, solid(0xd9d3c4, 0.8), 18)
  band.position.y = 0.70
  g.add(band)
  const stick = new THREE.Mesh(new THREE.PlaneGeometry(0.20, 0.085), textPlaneMat('LIMPA RUA', {
    w: 512, h: 128, bg: 'rgba(0,0,0,0)', color: '#2f3b32',
    font: 'bold 62px "Trebuchet MS", sans-serif', emissiveIntensity: 0.03,
  }))
  stick.position.set(0, 0.70, 0.297)
  g.add(stick)

  g.userData.collider = { w: 0.62, d: 0.62 }
  return g
}

// ===========================================================================
// ARVORE = PINHEIRO / CONIFERA (determinista pelo seed)
// A referencia e um pinheiro: tronco reto e fino, quase todo escondido, e uma
// copa CONICA feita de ANDARES de galhos que descem em leque, cada andar mais
// largo que o de cima, com as pontas viradas ligeiramente pra cima. Silhueta =
// triangulo alto e irregular, bem mais ALTO que largo (~9-14 m por 3-4 m).
//
// Por que os tufos redondos sairam daqui: bolota le como folha larga de arvore
// frondosa. Agulha le como MASSA RECORTADA. Os tufos continuam existindo, mas
// so pra floreira, vaso e arbusto.
//
// Orcamento: ~1700-2600 triangulos por arvore, a mesma ordem da arvore antiga
// (~2000). Cada andar custa 10*n triangulos; o resto e tronco e ponta.
// ===========================================================================

// ANDAR DE GALHOS: um prato serrilhado que cai em leque.
//
// A primeira versao punha um galho-mesh por galho. Ficava caro (19 triangulos
// cada) e, pior, RALO: com 10 galhos por andar dava pra ver o ceu entre eles e
// a arvore lia como escova de garrafa. Um andar inteiro numa geometria so
// custa 10*n triangulos (menos que n galhos separados) e a massa fica
// CONTINUA -- que e como agulha se le de longe.
//
// O recorte vem da SERRILHA: o raio alterna entre ponta longa e ponta curta,
// sector a sector. A ponta longa ainda sobe um pouco no fim (o termo r^8),
// que e o "galho virado pra cima" da referencia; a curta so cai.
// `drop` = quanto a borda desce, em unidades de raio -- e o que diferencia o
// andar de baixo (leque caido) do de cima (quase reto).
function tierGeo(n, variant, drop) {
  return geo('pine-tier:' + n + ':' + variant + ':' + drop.toFixed(2), () => {
    const FR = [0.30, 0.66, 1.0]     // aneis do prato
    const pos = [], idx = []
    const ph = variant * 2.7
    // expoente perto de 1 = perfil CONICO. Com 1.4 o miolo do prato ficava
    // chapado e o andar lia como telhado de pagode empilhado.
    const yOf = (rr) => -drop * Math.pow(rr, 1.05) + drop * 0.30 * Math.pow(rr, 8)
    // max(0,...) obrigatorio: o ruido da serrilha pode passar de rr = 1, e
    // Math.pow(negativo, 0.8) e NaN -- um vertice NaN estraga a fusao inteira
    // do forno do city.js, nao so este andar.
    const thOf = (rr) => 0.15 * Math.pow(Math.max(0, 1 - rr), 0.8) + 0.008
    const V = (k, j, s) => 2 + (k * n + j) * 2 + s
    pos.push(0, thOf(0) / 2, 0)      // 0 = centro de cima
    pos.push(0, -thOf(0) / 2, 0)     // 1 = centro de baixo
    for (let k = 0; k < 3; k++) {
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2
        // serrilha alternada FUNDA + ruido: sem o ruido o dente de serra fica
        // perfeitamente regular e le como engrenagem; sem a serrilha funda o
        // andar le como prato de plastico
        const cut = (j % 2 ? 0.52 : 1.0)
          * (0.84 + 0.16 * Math.sin(j * 2.3 + ph) + 0.10 * Math.sin(j * 5.1 + ph * 2.1))
        const m = 1 - (1 - cut) * (k === 0 ? 0.20 : k === 1 ? 0.62 : 1)
        const rr = FR[k] * m
        // ondulacao do andar inteiro: uns galhos caem mais que os vizinhos.
        // A fase muda por anel, senao o andar sobe e desce inteiro e continua
        // sendo uma chapa, so que torta.
        const wob = 0.17 * Math.sin(j * 1.7 + ph * 1.3 + k * 1.1) * FR[k] * drop
        // quem tem a ponta CURTA tambem fica mais BAIXO: e o que separa um
        // galho do vizinho de verdade, em vez de recortar so o contorno
        const dip = (1 - cut) * 0.55 * drop * FR[k]
        // corrugado SO na face de cima: sulco entre um galho e o outro
        const rid = (0.20 * Math.sin(j * 3.1 + ph * 0.7)
          + 0.09 * Math.sin(j * 6.3 + ph * 1.9)) * FR[k] * drop
        const y = yOf(rr) + wob - dip, th = thOf(rr)
        const cs = Math.cos(a) * rr, sn = Math.sin(a) * rr
        pos.push(cs, y + th / 2 + rid, sn)
        pos.push(cs, y - th / 2, sn)
      }
    }
    for (let j = 0; j < n; j++) {
      const jn = (j + 1) % n
      idx.push(0, V(0, jn, 0), V(0, j, 0))      // leque do centro, por cima
      idx.push(1, V(0, j, 1), V(0, jn, 1))      // idem, por baixo
      for (let k = 0; k < 2; k++) {
        const a0 = V(k, j, 0), b0 = V(k, jn, 0), c0 = V(k + 1, jn, 0), d0 = V(k + 1, j, 0)
        idx.push(a0, b0, c0, a0, c0, d0)        // faixa de cima
        const a1 = a0 + 1, b1 = b0 + 1, c1 = c0 + 1, d1 = d0 + 1
        idx.push(a1, d1, c1, a1, c1, b1)        // faixa de baixo
      }
    }
    const gg = new THREE.BufferGeometry()
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    gg.setIndex(idx)
    gg.computeVertexNormals()   // normal SUAVE: faceta plana le como pedra
    return gg
  })
}

// GALHO SOLTO: usado so pra QUEBRAR a borda do prato (senao o andar le como
// disco) e pra fechar a ponta da arvore. Forma achatada e recortada, espinha
// ao longo de +Z, secao em "tenda" (crista no meio, bordas caidas): a crista
// pega o sol e o fundo fica virado pro chao, que e de onde sai o verde quase
// preto na sombra sem precisar de material novo.
// 4 aneis x 3 vertices = 12 vertices, 19 triangulos, geometria CACHEADA.
const FROND_SEG = 3
function frondGeo(variant = 0) {
  return geo('pine-frond:' + variant, () => {
    const pos = [], idx = []
    const ph = variant * 1.31
    const skew = 0.84 + (variant % 3) * 0.11   // um lado do leque mais cheio
    for (let i = 0; i <= FROND_SEG; i++) {
      const t = i / FROND_SEG
      // espinha: cai na saida e volta a SUBIR na ponta. O galho e inclinado
      // pra baixo depois, entao a ponta acaba virada pra cima.
      const yS = -0.05 * t + 0.24 * Math.pow(t, 2.2)
      const bump = Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - t * 0.18)
      const w = 0.34 * (bump + 0.09 * (1 - t)) * (0.9 + 0.2 * Math.sin(i * 1.9 + ph))
      // serrilha ALTERNADA entre os dois lados: com so 3 trechos, recortar os
      // dois lados no mesmo anel daria duas mordidas; assim da quatro.
      const wl = w * (i % 2 === 1 ? 0.58 : 1.0) * skew
      const wr = w * (i % 2 === 0 ? 0.58 : 1.0) * (2 - skew)
      const h = w * 0.45 + 0.010                // altura da crista
      const dw = w * 0.28                       // as bordas caem em leque
      pos.push(-wl, yS - dw, t)
      pos.push(0, yS + h, t)
      pos.push(wr, yS - dw, t)
    }
    for (let i = 0; i < FROND_SEG; i++) {
      const a = i * 3, b = a + 3
      idx.push(a, b + 1, a + 1, a, b, b + 1)              // face esquerda
      idx.push(a + 2, a + 1, b + 1, a + 2, b + 1, b + 2)  // face direita
      idx.push(a, a + 2, b + 2, a, b + 2, b)              // fundo (sombra)
    }
    idx.push(0, 1, 2)                                     // tampa da base
    const gg = new THREE.BufferGeometry()
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    gg.setIndex(idx)
    gg.computeVertexNormals()
    return gg
  })
}

export function makeTree(seed = 0) {
  const g = mk()
  const r = rng(seed + 7)
  const bark = M.barkDark()   // conifera tem casca escura

  // ESPECIE (3 variacoes pelo seed, porque um pinheiro so vira papel de parede):
  //  0 = fechada     copa densa e cheia, andares colados
  //  1 = rala e alta andares espacados, mais estreita, ponta fina
  //  2 = caida       andar mais largo e bem tombado pra baixo, tipo picea
  const sp = r()
  const kind = sp < 0.40 ? 0 : sp < 0.74 ? 1 : 2
  const vigor = 0.90 + r() * 0.22
  const H = (kind === 0 ? 8.6 + r() * 1.5
    : kind === 1 ? 9.9 + r() * 1.7
      : 8.8 + r() * 1.5) * vigor
  // meia-largura da saia: ~1.8-2.4 m, entao 3.6-4.8 m de copa contra 8-12 m de
  // altura -- perto de 3:1, que e a proporcao da referencia. Mais estreito que
  // isso volta a ler como escova de garrafa.
  const halfW = (kind === 0 ? 2.42 : kind === 1 ? 2.10 : 2.56) * vigor
  // Andares MUITO proximos: o vao vertical entre um andar e o outro tem que
  // ser menor que a queda da saia do de cima, senao aparece tronco no meio.
  const nT = (kind === 0 ? 15 : kind === 1 ? 13 : 14) + Math.floor(r() * 3)
  const nBase = kind === 0 ? 14 : kind === 1 ? 11 : 12
  // queda funda: a saia de um andar tem que passar POR CIMA do andar de baixo,
  // senao aparece degrau e tronco entre os dois
  const dropBase = kind === 2 ? 1.06 : 0.86

  // pinheiro e reto: so um leve desaprumo, nada de curva em S
  const lean = (r() - 0.5) * 0.070
  const leanA = r() * Math.PI * 2
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean

  // --- tronco reto e fino ---------------------------------------------------
  const baseR = (0.105 + 0.032 * (H / 11)) * vigor
  const trunkTopY = H * 0.90
  const trunkPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lx * H * 0.34, H * 0.34, lz * H * 0.34),
    new THREE.Vector3(lx * H * 0.68, H * 0.68, lz * H * 0.68),
    new THREE.Vector3(lx * trunkTopY, trunkTopY, lz * trunkTopY),
  ]
  const trunk = new THREE.Mesh(limbGeo(trunkPts, baseR, baseR * 0.16, 6, 4), bark)
  trunk.castShadow = true; trunk.receiveShadow = true
  g.add(trunk)

  // pe alargado: 4 sapopemas curtas so pra base nao nascer do chao como cano
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r() * 0.8
    const out = baseR * (1.6 + r() * 0.9)
    const m = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, baseR * 2.2, 0),
      new THREE.Vector3(Math.cos(a) * out * 0.5, baseR * 0.9, Math.sin(a) * out * 0.5),
      new THREE.Vector3(Math.cos(a) * out, baseR * 0.12, Math.sin(a) * out),
    ], baseR * 0.5, baseR * 0.09, 3, 2), bark)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }

  // MIOLO: um cilindro verde bem escuro abracando o tronco, do comeco da saia
  // ate o topo. Nao e enfeite -- e o que impede de enxergar o TRONCO marrom
  // pelo vao entre dois andares, que e o que mais denunciava a copa como falsa.
  // Le como sombra interna da folhagem. 12 triangulos.
  const core = new THREE.Mesh(
    geo('pine-core', () => new THREE.CylinderGeometry(0.13, 1, 1, 6, 1, true)),
    leafMat(0))
  core.castShadow = true; core.receiveShadow = true
  g.add(core)

  function frond(x, y, z, azim, pitch, len, tone, variant, roll) {
    const f = new THREE.Mesh(frondGeo(variant % 5), leafMat(tone))
    f.position.set(x, y, z)
    // YXZ: primeiro rola no proprio eixo, depois inclina, depois aponta.
    // Nessa ordem o "pitch" e sempre a queda do galho, seja pra onde for.
    f.rotation.order = 'YXZ'
    f.rotation.set(pitch, Math.PI / 2 - azim, roll)
    f.scale.set(len * 0.95, len * 0.46, len)   // achatado: e uma forma CHATA
    f.castShadow = true; f.receiveShadow = true
    g.add(f)
  }

  // --- andares --------------------------------------------------------------
  // A saia comeca BAIXO de proposito: e o que esconde o tronco e fecha o
  // triangulo na base.
  const y0 = H * (0.085 + r() * 0.04)
  const yTop = H * 0.93
  const spin = r() < 0.5 ? 1 : -1
  const twist = 2.39996 * spin   // angulo aureo: andar nenhum alinha com o de baixo
  core.scale.set(baseR * 1.7, yTop - y0 + 0.5, baseR * 1.7)
  core.position.set(lx * (y0 + yTop) * 0.5, (y0 + yTop) * 0.5, lz * (y0 + yTop) * 0.5)

  for (let i = 0; i < nT; i++) {
    const t = nT > 1 ? i / (nT - 1) : 0
    // t^0.78 e nao t: os andares ficam MAIS JUNTOS em cima. Espacados por
    // igual, os de cima (que sao pequenos) deixavam vao, e a arvore terminava
    // em espinha de peixe.
    const y = y0 + (yTop - y0) * Math.pow(t, 0.78)
    // perfil conico. O "ombro" segura os dois primeiros andares um pouco
    // menores: numa conifera de verdade o ponto mais largo nao e a saia, e
    // logo acima dela.
    const shoulder = 0.76 + 0.24 * Math.min(1, t * 4.0)
    // 1 - t*0.86 (e nao 1 - t) com expoente baixo: perfil quase RETO. Com uma
    // curva forte o topo virava mastro pelado e so a saia tinha volume -- o
    // triangulo da referencia tem lado reto, nao concavo.
    const rad = halfW * Math.pow(1 - t * 0.86, 0.62) * shoulder * (0.90 + r() * 0.22)
    if (rad < 0.12) continue
    // n quantizado: cada (n, variante, queda) vira UMA geometria em cache, e
    // sem quantizar isso viraria uma malha nova por andar de cada arvore.
    const n = Math.max(7, Math.min(14, Math.round(nBase * (1 - t * 0.42))))
    // andar de baixo cai em leque, o de cima fica quase reto: e isso que fecha
    // o triangulo. Quantizado em oitavos pelo mesmo motivo do n.
    const drop = Math.round((dropBase * (1 - t * 0.42)) * 8) / 8
    // So os DOIS tons mais escuros da paleta, alternando por andar -- e a
    // "variacao entre os andares" da referencia. Indice alto e verde de
    // frondosa: sob o sol do jogo a copa virava brocolis iluminado, e o que se
    // quer e verde escuro, quase preto na sombra.
    const tone = i % 2
    const tier = new THREE.Mesh(tierGeo(n, i % 3, drop), leafMat(tone))
    tier.position.set(lx * y, y, lz * y)
    tier.rotation.y = i * twist + r() * 0.4
    // desaprumo minimo por andar: prato perfeitamente na horizontal le como
    // disco de plastico empilhado
    tier.rotation.x = (r() - 0.5) * 0.13
    tier.rotation.z = (r() - 0.5) * 0.13
    tier.scale.set(rad, rad, rad)
    tier.castShadow = true; tier.receiveShadow = true
    g.add(tier)

    // 1-2 galhos escapando do prato: sem isso a borda do andar le como disco
    // recortado, nao como um punhado de galhos
    const nOut = r() < 0.55 ? 2 : 1
    for (let k = 0; k < nOut; k++) {
      const a = r() * Math.PI * 2
      frond(
        lx * y + Math.cos(a) * rad * 0.40, y + drop * rad * -0.16, lz * y + Math.sin(a) * rad * 0.40,
        a, drop * 0.85, rad * (0.52 + r() * 0.22), tone, i * 2 + k, (r() - 0.5) * 0.6,
      )
    }
  }

  // --- ponta: conifera termina em ESPETO, nunca em bola ---------------------
  // 4 galhos quase em pe, cruzados: um cone liso ali virava chapeu de festa.
  const tipY = yTop + (H - yTop) * 0.15
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + r() * 0.6
    frond(
      lx * tipY + Math.cos(a) * baseR * 0.5, tipY, lz * tipY + Math.sin(a) * baseR * 0.5,
      a, -1.34 - r() * 0.14, (H - tipY) * (1.05 + r() * 0.30), 1, k + 1, (r() - 0.5) * 0.4,
    )
  }

  // Colisor so em volta do tronco: a saia e larga, mas parar o jogador a 2 m de
  // um pinheiro numa calcada de 3 m fecharia a passagem.
  g.userData.collider = { w: 1.45, d: 1.45 }
  return g
}

// ===========================================================================
// HIDRANTE
// ===========================================================================
export function makeHydrant() {
  const g = mk()
  const red = M.paintRed()
  const chrome = M.chrome()

  const flange = cyl(0.20, 0.24, 0.07, red, 14)
  flange.position.y = 0.035
  g.add(flange)
  const boltG = geo('bolt', () => new THREE.CylinderGeometry(0.022, 0.022, 0.05, 6))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    g.add(meshOf(boltG, chrome, Math.cos(a) * 0.175, 0.08, Math.sin(a) * 0.175))
  }
  const body = cyl(0.135, 0.155, 0.56, red, 16)
  body.position.y = 0.35
  g.add(body)
  // colar
  const neck = cyl(0.17, 0.17, 0.055, red, 16)
  neck.position.y = 0.63
  g.add(neck)
  // domo
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), red)
  dome.position.y = 0.65
  dome.castShadow = true; dome.receiveShadow = true
  g.add(dome)
  // porca sextavada no topo
  const nut = cyl(0.055, 0.065, 0.08, chrome, 6)
  nut.position.y = 0.79
  g.add(nut)
  // saidas laterais com tampa sextavada e olhal
  const outG = geo('hyd-out', () => new THREE.CylinderGeometry(0.065, 0.075, 0.12, 12))
  const capG = geo('hyd-cap', () => new THREE.CylinderGeometry(0.078, 0.078, 0.035, 6))
  const eyeG = geo('hyd-eye', () => new THREE.TorusGeometry(0.026, 0.008, 4, 10))
  const linkG = geo('chain-link', () => new THREE.TorusGeometry(0.022, 0.007, 4, 8))
  for (const s of [-1, 1]) {
    const o = meshOf(outG, chrome, s * 0.17, 0.42, 0)
    o.rotation.z = Math.PI / 2
    g.add(o)
    const cap = meshOf(capG, red, s * 0.235, 0.42, 0)
    cap.rotation.z = Math.PI / 2
    g.add(cap)
    // olhal + corrente ligando a tampa no corpo (detalhe que todo hidrante tem)
    const eye = meshOf(eyeG, chrome, s * 0.255, 0.47, 0)
    eye.rotation.y = Math.PI / 2
    g.add(eye)
    for (let i = 0; i < 4; i++) {
      const t = i / 3
      const l = meshOf(linkG, chrome,
        s * (0.255 - t * 0.10), 0.47 - Math.sin(t * Math.PI) * 0.055 - t * 0.01, 0)
      l.rotation.set(Math.PI / 2, (i % 2) * Math.PI / 2, 0)
      g.add(l)
    }
  }
  // saida frontal grande com flange parafusado
  const front = cyl(0.085, 0.095, 0.14, chrome, 12)
  front.position.set(0, 0.30, 0.17)
  front.rotation.x = Math.PI / 2
  g.add(front)
  const fFlange = cyl(0.115, 0.115, 0.03, red, 12)
  fFlange.position.set(0, 0.30, 0.145)
  fFlange.rotation.x = Math.PI / 2
  g.add(fFlange)
  const smallBoltG = geo('bolt-xs', () => new THREE.CylinderGeometry(0.011, 0.011, 0.022, 5))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const b = meshOf(smallBoltG, chrome, Math.cos(a) * 0.098, 0.30 + Math.sin(a) * 0.098, 0.16)
    b.rotation.x = Math.PI / 2
    g.add(b)
  }
  // frisos verticais no corpo + faixa refletiva branca
  const ribG = geo('hyd-rib', () => new THREE.BoxGeometry(0.022, 0.40, 0.022))
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5
    g.add(meshOf(ribG, solid(0x9c2626, 0.6, 0.25), Math.cos(a) * 0.145, 0.36, Math.sin(a) * 0.145))
  }
  g.add(box(0.28, 0.03, 0.29, solid(0xf2f2f2, 0.4), 0, 0.20, 0))
  // etiqueta de vazao estampada
  const plate = box(0.09, 0.06, 0.012, chrome, 0, 0.55, 0.145)
  g.add(plate)

  g.userData.collider = { w: 0.5, d: 0.5 }
  return g
}

// ===========================================================================
// PONTO DE ONIBUS
// ===========================================================================
export function makeBusStop() {
  const g = mk()
  const frame = solid(0x30363c, 0.5, 0.7)
  const gl = glass(0xbfe4f2, 0.24)

  const W = 3.6, D = 1.5, H = 2.5
  const postG = geo('bus-post', () => new THREE.BoxGeometry(0.11, H, 0.11))
  for (const [px, pz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    g.add(meshOf(postG, frame, px, H / 2, pz))
  }
  // travessas superiores
  g.add(box(W + 0.12, 0.12, 0.12, frame, 0, H - 0.06, -D / 2))
  g.add(box(W + 0.12, 0.12, 0.12, frame, 0, H - 0.06, D / 2))
  g.add(box(0.12, 0.12, D, frame, -W / 2, H - 0.06, 0))
  g.add(box(0.12, 0.12, D, frame, W / 2, H - 0.06, 0))

  // teto levemente inclinado com beiral
  const roof = box(W + 0.5, 0.09, D + 0.5, solid(0x454b52, 0.5, 0.6), 0, H + 0.10, 0.08)
  roof.rotation.x = -0.05
  g.add(roof)
  const roofLip = box(W + 0.5, 0.07, 0.07, frame, 0, H + 0.06, D / 2 + 0.28)
  g.add(roofLip)

  // painel traseiro de vidro + laterais
  const backGlass = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, H - 0.5), gl)
  backGlass.position.set(0, H / 2 - 0.05, -D / 2 + 0.02)
  g.add(backGlass)
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.2, H - 0.5), gl)
    side.position.set(s * (W / 2 - 0.02), H / 2 - 0.05, 0)
    side.rotation.y = Math.PI / 2
    g.add(side)
  }

  // banco corrido: 3 ripas com vao + apoios em "L" e travessa
  const SZ = -D / 2 + 0.34
  for (let i = 0; i < 3; i++) {
    g.add(box(W - 0.6, 0.055, 0.115, i === 1 ? M.woodPale() : M.wood(), 0, 0.52, SZ - 0.14 + i * 0.14))
  }
  for (const x of [-W / 2 + 0.5, 0, W / 2 - 0.5]) {
    g.add(box(0.08, 0.5, 0.08, frame, x, 0.26, SZ))
    g.add(box(0.07, 0.06, 0.44, frame, x, 0.485, SZ))
  }
  g.add(box(W - 0.7, 0.05, 0.05, frame, 0, 0.18, SZ))
  // divisorias entre lugares (anti-deitar), tipico de abrigo
  for (const x of [-0.58, 0.58]) {
    const d2 = box(0.05, 0.16, 0.34, frame, x, 0.60, SZ)
    g.add(d2)
  }

  // painel de propaganda iluminado na lateral direita
  const adFrame = box(0.10, 1.7, 1.15, frame, W / 2 - 0.05, 1.15, 0)
  g.add(adFrame)
  const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.55), paintingMat(3, 'sale'))
  ad.position.set(W / 2 + 0.015, 1.15, 0)
  ad.rotation.y = Math.PI / 2
  ad.castShadow = false; ad.receiveShadow = true
  g.add(ad)

  // letreiro "ONIBUS" na testeira
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), textPlaneMat('ONIBUS', {
    color: '#ffffff', bg: 'rgba(20,40,90,1)', glow: '#88bbff', emissiveIntensity: 0.7,
  }))
  sign.position.set(0, H + 0.24, D / 2 + 0.30)
  g.add(sign)

  // CONTRATO: 3 lugares no banco do abrigo, olhando pra fora (+Z).
  // y = topo da ripa (0.52 + 0.055/2).
  g.userData.seats = [
    { x: -1.16, y: 0.548, z: SZ, ry: 0 },
    { x: 0.00, y: 0.548, z: SZ, ry: 0 },
    { x: 1.16, y: 0.548, z: SZ, ry: 0 },
  ]
  // So a parede do fundo bloqueia: se o colisor cobrisse o abrigo inteiro, o
  // banco de dentro ficaria inalcancavel. oz desloca a caixa pro fundo.
  g.userData.collider = { w: W + 0.3, d: 0.42, oz: -D / 2 - 0.05, h: H }
  return g
}

// ===========================================================================
// FLOREIRA DE CALCADA
// ===========================================================================
export function makePlanter() {
  const g = mk()
  const stone = M.concrete()
  const soil = solid(0x3e2f22, 1.0)

  const pot = roundedBox(1.25, 0.60, 1.25, 0.08, stone)
  pot.position.y = 0.30
  g.add(pot)
  // borda superior
  g.add(box(1.36, 0.10, 1.36, solid(0x9c968c, 0.9), 0, 0.62, 0))
  // frisos nos 4 lados
  const friezeG = geo('planter-frieze', () => new THREE.BoxGeometry(0.95, 0.09, 0.04))
  for (let i = 0; i < 4; i++) {
    const f = meshOf(friezeG, solid(0x9c968c, 0.9), 0, 0.33, 0.635)
    const w = new THREE.Group()
    w.rotation.y = (i * Math.PI) / 2
    w.add(f)
    g.add(w)
  }
  // terra
  const dirt = cyl(0.56, 0.56, 0.06, soil, 12)
  dirt.position.y = 0.63
  g.add(dirt)

  // arbusto: mesma tecnica da copa das arvores (miolo escuro, borda clara).
  // Tres camadas de tufos pequenos: base escura larga, meio, e um coroamento
  // claro no topo. Tufo pequeno + normal suave = folhagem, nao pedra lapidada.
  const r = rng(11)
  foliageClump(g, 0, 0.74, 0, 0.36, 0.125, 11, 0, r, 0.90)
  foliageClump(g, 0, 0.86, 0, 0.25, 0.110, 7, 2, r, 0.90)
  foliageClump(g, 0, 0.96, 0, 0.14, 0.095, 5, 4, r, 0.95)
  // ramos finos aparecendo entre as folhas
  const twigMat = solid(0x5a5f3c, 0.95)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r()
    const tw = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, 0.64, 0),
      new THREE.Vector3(Math.cos(a) * 0.12, 0.80, Math.sin(a) * 0.12),
      new THREE.Vector3(Math.cos(a) * 0.26, 0.98, Math.sin(a) * 0.26),
    ], 0.018, 0.007, 4, 3), twigMat)
    tw.castShadow = true; tw.receiveShadow = true
    g.add(tw)
  }
  // flores em cachos, nao espalhadas soltas
  const petalG = geo('petal', () => new THREE.SphereGeometry(0.045, 6, 5))
  const petalMats = [solid(0xe4574f, 0.8), solid(0xe8c33d, 0.8), solid(0xd97ec1, 0.8)]
  for (let c = 0; c < 5; c++) {
    const a = r() * Math.PI * 2, rr = 0.14 + r() * 0.26
    const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr, by = 0.90 + r() * 0.12
    const mat = petalMats[c % 3]
    for (let i = 0; i < 4; i++) {
      const a2 = (i / 4) * Math.PI * 2
      g.add(meshOf(petalG, mat, bx + Math.cos(a2) * 0.045, by + (i === 3 ? 0.03 : 0), bz + Math.sin(a2) * 0.045))
    }
  }

  g.userData.collider = { w: 1.4, d: 1.4 }
  return g
}

// ===========================================================================
// SEMAFORO
// ===========================================================================
export function makeTrafficLight() {
  const g = mk()
  const dark = solid(0x33383d, 0.6, 0.55)

  const base = cyl(0.20, 0.24, 0.14, M.concrete(), 14)
  base.position.y = 0.07
  g.add(base)
  const pole = cyl(0.075, 0.095, 5.4, dark, 12)
  pole.position.y = 2.84
  g.add(pole)

  // braco horizontal com escora diagonal
  const arm = cyl(0.06, 0.06, 2.6, dark, 10)
  arm.rotation.z = Math.PI / 2
  arm.position.set(1.3, 5.3, 0)
  g.add(arm)
  const brace = cyl(0.04, 0.04, 1.2, dark, 8)
  brace.position.set(0.42, 4.86, 0)
  brace.rotation.z = -Math.PI / 4
  g.add(brace)
  // contrapeso atras do mastro: equilibra a silhueta do braco
  const cw = roundedBox(0.26, 0.44, 0.26, 0.05, solid(0x3f464d, 0.7, 0.4))
  cw.position.set(-0.24, 5.10, 0)
  g.add(cw)
  g.add(box(0.30, 0.05, 0.30, dark, -0.24, 5.34, 0))
  // luva de uniao no encontro braco/mastro
  const sleeve = cyl(0.085, 0.095, 0.20, M.metal(), 12)
  sleeve.position.set(0.14, 5.30, 0)
  sleeve.rotation.z = Math.PI / 2
  g.add(sleeve)

  // fiacao: cabo em catenaria do mastro ate a caixa (le como semaforo de rua)
  const wireMat = solid(0x1b1e21, 0.9, 0.1)
  const wire = new THREE.Mesh(limbGeo([
    new THREE.Vector3(0.12, 5.22, 0.06),
    new THREE.Vector3(0.90, 5.02, 0.06),
    new THREE.Vector3(1.70, 4.98, 0.06),
    new THREE.Vector3(2.40, 5.16, 0.06),
  ], 0.016, 0.016, 4, 6), wireMat)
  wire.castShadow = false; wire.receiveShadow = true
  g.add(wire)
  // conduite descendo o mastro
  const cond = cyl(0.022, 0.022, 3.6, wireMat, 6)
  cond.position.set(0.10, 2.10, 0.03)
  g.add(cond)
  for (const y of [1.2, 2.6, 3.8]) {
    const clamp = cyl(0.10, 0.10, 0.035, M.metal(), 10)
    clamp.position.y = y
    g.add(clamp)
  }

  // caixa preta com 3 lentes
  const headX = 2.45
  const housing = roundedBox(0.42, 1.15, 0.34, 0.06, M.black())
  housing.position.set(headX, 4.72, 0)
  g.add(housing)
  // chapa traseira + dobradica lateral + trava: caixa de verdade abre
  g.add(box(0.46, 1.20, 0.03, dark, headX, 4.72, -0.17))
  for (const y of [5.14, 4.72, 4.30]) {
    g.add(box(0.05, 0.09, 0.05, M.metal(), headX - 0.22, y, -0.05))
  }
  g.add(box(0.04, 0.14, 0.05, M.chrome(), headX + 0.22, 4.72, -0.02))
  // suporte/bracadeira que prende a caixa no braco
  g.add(box(0.14, 0.10, 0.14, dark, headX - 0.10, 5.30, 0))
  g.add(box(0.36, 0.10, 0.30, dark, headX, 5.34, 0))
  g.add(box(0.10, 0.30, 0.10, dark, headX, 5.45, 0))
  // pingadeira embaixo pra agua nao entrar
  g.add(box(0.46, 0.05, 0.38, dark, headX, 4.12, 0.02))

  const lensG = geo('tl-lens', () => new THREE.CylinderGeometry(0.115, 0.115, 0.06, 16))
  const visorG = geo('tl-visor', () => new THREE.CylinderGeometry(0.15, 0.15, 0.20, 14, 1, true, Math.PI * 0.1, Math.PI * 0.8))
  const colors = [0xd62d2d, 0xe8b230, 0x35bf5c]
  const lenses = []
  for (let i = 0; i < 3; i++) {
    const y = 5.06 - i * 0.34
    // material proprio por lente: emissiveIntensity muda com a fase
    const l = new THREE.Mesh(lensG, new THREE.MeshStandardMaterial({
      color: colors[i], roughness: 0.35, emissive: colors[i], emissiveIntensity: 0.05,
    }))
    l.position.set(headX, y, 0.17)
    l.rotation.x = Math.PI / 2
    l.castShadow = true; l.receiveShadow = true
    g.add(l)
    lenses.push(l)
    // viseira em cima de cada lente
    const v = new THREE.Mesh(visorG, M.black())
    v.position.set(headX, y + 0.06, 0.22)
    v.rotation.set(Math.PI / 2 - 0.25, 0, 0)
    v.castShadow = true; v.receiveShadow = true
    g.add(v)
  }

  // luz sutil da lente ativa
  const glow = new THREE.PointLight(colors[0], 2.2, 4.5, 2)
  glow.position.set(headX, 5.06, 0.4)
  glow.castShadow = false
  addLight(g, glow)

  // alterna a fase: 0=vermelho 1=amarelo 2=verde
  g.userData.setPhase = (i) => {
    for (let k = 0; k < 3; k++) {
      lenses[k].material.emissiveIntensity = k === i ? 2.4 : 0.05
    }
    glow.color.setHex(colors[i])
    glow.position.y = 5.06 - i * 0.34
  }
  g.userData.setPhase(0)

  g.userData.collider = { w: 0.5, d: 0.5 }
  return g
}

// ===========================================================================
// CAIXA DE CORREIO
// ===========================================================================
export function makeMailbox() {
  const g = mk()
  const blue = solid(0x2b5fa8, 0.55, 0.35)
  const dark = M.darkMetal()

  for (const x of [-0.24, 0.24]) {
    g.add(box(0.09, 0.62, 0.09, dark, x, 0.31, 0))
    g.add(box(0.16, 0.03, 0.20, dark, x, 0.015, 0))
  }
  const body = roundedBox(0.66, 0.72, 0.52, 0.07, blue)
  body.position.y = 0.98
  g.add(body)
  // tampo em meia-cana
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.52, 16, 1, false, 0, Math.PI), blue)
  top.position.set(0, 1.34, 0)
  top.rotation.set(Math.PI / 2, 0, Math.PI / 2)
  top.castShadow = true; top.receiveShadow = true
  g.add(top)
  // portinhola inclinada + puxador
  const flap = box(0.46, 0.22, 0.05, solid(0x24508f, 0.5, 0.4), 0, 1.24, 0.27)
  flap.rotation.x = -0.25
  g.add(flap)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14, Math.PI), M.chrome())
  handle.position.set(0, 1.14, 0.29)
  handle.rotation.x = Math.PI
  handle.castShadow = true; handle.receiveShadow = true
  g.add(handle)
  // faixa e emblema
  g.add(box(0.68, 0.06, 0.54, solid(0xf0d24a, 0.6), 0, 0.72, 0))
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.16), textPlaneMat('CORREIO', { color: '#ffe98a' }))
  logo.position.set(0, 0.94, 0.262)
  g.add(logo)
  // porta de coleta na base
  g.add(box(0.52, 0.20, 0.03, dark, 0, 0.74, -0.26))

  // rebites nos cantos da chapa frontal
  const rivetG = geo('rivet', () => new THREE.SphereGeometry(0.013, 5, 4))
  for (const x of [-0.27, 0.27]) {
    for (const y of [0.68, 1.28]) g.add(meshOf(rivetG, M.chrome(), x, y, 0.262))
  }
  // pes chatos com parafuso de chumbamento
  for (const x of [-0.24, 0.24]) {
    const bolt = meshOf(geo('bolt-s', () => new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6)), M.chrome(), x, 0.04, 0)
    g.add(bolt)
  }
  // adesivo de horario de coleta (o "papelzinho" que faz parecer usado)
  const info = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.13), textPlaneMat('COLETA 9h / 17h', {
    w: 512, h: 320, bg: '#eae5d6', color: '#20304d',
    font: 'bold 52px "Trebuchet MS", sans-serif', emissiveIntensity: 0.03,
  }))
  info.position.set(-0.01, 0.81, 0.266)
  info.rotation.z = 0.05    // colado torto, de proposito
  g.add(info)

  g.userData.collider = { w: 0.72, d: 0.6 }
  return g
}

// ===========================================================================
// BALIZADOR / BOLLARD
// ===========================================================================
export function makeBollard() {
  const g = mk()
  const paint = solid(0x2f3439, 0.5, 0.6)

  const plate = cyl(0.15, 0.17, 0.05, M.darkMetal(), 12)
  plate.position.y = 0.025
  g.add(plate)
  // parafusos de chumbamento na sapata
  const boltG = geo('bolt-s', () => new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6))
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.6
    g.add(meshOf(boltG, M.chrome(), Math.cos(a) * 0.125, 0.055, Math.sin(a) * 0.125))
  }
  const post = cyl(0.085, 0.10, 0.88, paint, 14)
  post.position.y = 0.49
  g.add(post)
  // colar na base do fuste: acaba a transicao com a sapata
  const collar = cyl(0.105, 0.125, 0.07, M.darkMetal(), 14)
  collar.position.y = 0.085
  g.add(collar)
  // friso central em relevo
  const groove = cyl(0.098, 0.098, 0.035, M.darkMetal(), 14)
  groove.position.y = 0.46
  g.add(groove)
  // aneis refletivos
  for (const y of [0.72, 0.80]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.093, 0.014, 6, 16), emissive(0xf2e6b0, 0.6))
    r.position.y = y; r.rotation.x = Math.PI / 2
    r.castShadow = true; r.receiveShadow = true
    g.add(r)
  }
  // olhais laterais pra corrente entre balizadores
  const eyeG = geo('bol-eye', () => new THREE.TorusGeometry(0.030, 0.010, 4, 10))
  for (const s of [-1, 1]) {
    const e = meshOf(eyeG, M.darkMetal(), s * 0.10, 0.60, 0)
    e.rotation.y = Math.PI / 2
    g.add(e)
  }
  // capuz esferico
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.086, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), paint)
  cap.position.y = 0.93
  cap.castShadow = true; cap.receiveShadow = true
  g.add(cap)
  const knob = sphere(0.032, M.chrome(), 10)
  knob.position.y = 0.96
  g.add(knob)

  g.userData.collider = { w: 0.34, d: 0.34 }
  return g
}

// ===========================================================================
// BANCA DE JORNAL (news box)
// ===========================================================================
export function makeNewsBox() {
  const g = mk()
  const shell = solid(0xc4442f, 0.6, 0.3)
  const dark = M.darkMetal()

  for (const x of [-0.20, 0.20]) g.add(box(0.07, 0.34, 0.07, dark, x, 0.17, 0))
  const body = roundedBox(0.56, 0.78, 0.46, 0.05, shell)
  body.position.y = 0.73
  g.add(body)
  // topo inclinado com vitrine
  const top = box(0.58, 0.06, 0.50, dark, 0, 1.14, 0)
  top.rotation.x = -0.28
  g.add(top)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.34), glass(0xd8eef7, 0.3))
  win.position.set(0, 1.00, 0.235)
  g.add(win)
  // "jornal" atras do vidro
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.32), textPlaneMat('DIARIO', {
    color: '#1a1a1a', bg: '#e8e4d8', emissiveIntensity: 0.05,
  }))
  paper.position.set(0, 1.00, 0.21)
  g.add(paper)
  // porta + puxador + moedeiro
  g.add(box(0.44, 0.34, 0.02, solid(0xa33724, 0.6, 0.3), 0, 0.66, 0.235))
  const pull = box(0.20, 0.04, 0.04, M.chrome(), 0, 0.82, 0.26)
  g.add(pull)
  const coin = cyl(0.05, 0.05, 0.03, M.chrome(), 10)
  coin.position.set(0.19, 0.52, 0.235)
  coin.rotation.x = Math.PI / 2
  g.add(coin)

  g.userData.collider = { w: 0.6, d: 0.5 }
  return g
}

// ===========================================================================
// BUEIRO (nao bloqueia)
// ===========================================================================
export function makeManhole() {
  const g = mk()
  const iron = solid(0x4a4a4e, 0.85, 0.5)

  const ring = cyl(0.42, 0.44, 0.04, solid(0x3c3c40, 0.9, 0.4), 24)
  ring.position.y = 0.02
  g.add(ring)
  const lid = cyl(0.38, 0.39, 0.05, iron, 24)
  lid.position.y = 0.045
  g.add(lid)
  // padrao radial em relevo
  const barG = geo('mh-bar', () => new THREE.BoxGeometry(0.28, 0.016, 0.045))
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const b = meshOf(barG, iron, Math.cos(a) * 0.20, 0.072, Math.sin(a) * 0.20)
    b.rotation.y = -a
    g.add(b)
  }
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 6, 20), iron)
  inner.position.y = 0.072
  inner.rotation.x = Math.PI / 2
  inner.castShadow = true; inner.receiveShadow = true
  g.add(inner)
  // furos de alavanca
  for (const s of [-1, 1]) {
    const h = cyl(0.03, 0.03, 0.06, M.black(), 8)
    h.position.set(s * 0.06, 0.07, 0)
    g.add(h)
  }

  g.userData.collider = null // no chao, jogador anda por cima
  return g
}

// ===========================================================================
// ENGRADADO
// ===========================================================================
export function makeCrate() {
  const g = mk()
  const wood = M.wood()
  const dark = solid(0x6b4527, 0.9)
  const S = 0.72

  // 4 paredes de ripas + tampo, com cantoneiras
  const slatG = geo('crate-slat', () => new THREE.BoxGeometry(S, 0.14, 0.04))
  for (let side = 0; side < 4; side++) {
    const w = new THREE.Group()
    w.rotation.y = (side * Math.PI) / 2
    for (let i = 0; i < 4; i++) {
      w.add(meshOf(slatG, i % 2 ? wood : dark, 0, 0.10 + i * 0.175, S / 2))
    }
    // diagonal reforcando
    const d = meshOf(geo('crate-diag', () => new THREE.BoxGeometry(S * 1.32, 0.07, 0.025)), dark, 0, 0.36, S / 2 + 0.02)
    d.rotation.z = 0.72
    w.add(d)
    g.add(w)
  }
  const cornerG = geo('crate-corner', () => new THREE.BoxGeometry(0.07, S, 0.07))
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    g.add(meshOf(cornerG, dark, cx * S / 2, S / 2, cz * S / 2))
  }
  g.add(box(S + 0.06, 0.06, S + 0.06, wood, 0, S - 0.02, 0))
  g.add(box(S + 0.06, 0.05, S + 0.06, dark, 0, 0.025, 0))

  g.userData.collider = { w: S + 0.1, d: S + 0.1 }
  return g
}

// ===========================================================================
// AR CONDICIONADO (condensadora)
// ===========================================================================
export function makeAC() {
  const g = mk()
  const shell = solid(0xbdc2c6, 0.55, 0.6)
  const dark = M.darkMetal()

  const W = 0.86, H = 0.72, D = 0.62
  const body = roundedBox(W, H, D, 0.05, shell)
  body.position.y = H / 2 + 0.06
  g.add(body)
  // pes
  const footG = geo('ac-foot', () => new THREE.BoxGeometry(0.10, 0.07, D))
  for (const x of [-W / 2 + 0.08, W / 2 - 0.08]) g.add(meshOf(footG, dark, x, 0.035, 0))

  // grade frontal com aro + ventoinha
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 6, 24), dark)
  guard.position.set(0, H / 2 + 0.06, D / 2 + 0.01)
  guard.castShadow = true; guard.receiveShadow = true
  g.add(guard)
  const barG = geo('ac-bar', () => new THREE.BoxGeometry(0.50, 0.018, 0.018))
  const fan = new THREE.Group()
  fan.position.set(0, H / 2 + 0.06, D / 2 - 0.02)
  const bladeG = geo('ac-blade', () => new THREE.BoxGeometry(0.22, 0.02, 0.07))
  for (let i = 0; i < 4; i++) {
    const b = meshOf(bladeG, solid(0x8d9296, 0.6, 0.4), 0.11, 0, 0)
    const p = new THREE.Group()
    p.rotation.z = (i / 4) * Math.PI * 2
    p.add(b)
    fan.add(p)
  }
  g.add(fan)
  for (let i = 0; i < 5; i++) {
    const b = meshOf(barG, dark, 0, H / 2 + 0.06 + (i - 2) * 0.11, D / 2 + 0.015)
    g.add(b)
  }
  // aletas laterais
  const finG = geo('ac-fin', () => new THREE.BoxGeometry(0.012, H - 0.14, D - 0.12))
  for (const s of [-1, 1]) g.add(meshOf(finG, solid(0x7f858a, 0.7, 0.5), s * (W / 2 + 0.006), H / 2 + 0.06, 0))
  // tubos de cobre atras
  const cu = solid(0xb87333, 0.4, 0.8)
  for (const z of [0.10, -0.10]) {
    const t = cyl(0.028, 0.028, 0.30, cu, 8)
    t.position.set(0.18 + z, 0.20, -D / 2 - 0.05)
    t.rotation.x = Math.PI / 2
    g.add(t)
  }

  // ventoinha girando devagar
  g.userData.update = (dt) => { fan.rotation.z += dt * 3.2 }
  g.userData.collider = { w: W, d: D }
  return g
}

// ===========================================================================
// PLACA DE RUA / LETREIRO
// ===========================================================================
export function makeSign(text = 'RUA', color = 0x2f6fbf) {
  const g = mk()
  const dark = M.darkMetal()

  const base = cyl(0.13, 0.16, 0.10, M.concrete(), 12)
  base.position.y = 0.05
  g.add(base)
  const post = cyl(0.045, 0.055, 2.5, dark, 10)
  post.position.y = 1.30
  g.add(post)

  const cHex = '#' + new THREE.Color(color).getHexString()
  const panel = roundedBox(1.5, 0.44, 0.05, 0.06, solid(color, 0.6, 0.2))
  panel.position.set(0, 2.35, 0)
  g.add(panel)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.40), textPlaneMat(text, {
    w: 1024, h: 256, bg: cHex, color: '#ffffff',
    font: 'bold 110px "Trebuchet MS", sans-serif', stroke: 'rgba(0,0,0,0.35)',
    emissiveIntensity: 0.18,
  }))
  face.position.set(0, 2.35, 0.031)
  g.add(face)
  const backFace = face.clone()
  backFace.position.z = -0.031
  backFace.rotation.y = Math.PI
  g.add(backFace)
  // bracadeiras
  for (const y of [2.20, 2.50]) {
    const c = cyl(0.058, 0.058, 0.05, M.chrome(), 10)
    c.position.set(0, y, 0)
    g.add(c)
  }

  g.userData.collider = { w: 0.32, d: 0.32 }
  return g
}

// ===========================================================================
// POSTE DE BARBEIRO (animado)
// ===========================================================================
function barberStripeTex() {
  const c = document.createElement('canvas')
  c.width = 128; c.height = 128
  const g = c.getContext('2d')
  g.fillStyle = '#f5f5f2'; g.fillRect(0, 0, 128, 128)
  // listras diagonais: desenha na horizontal e deixa o wrap fazer a helice
  g.lineWidth = 22
  for (let i = -4; i < 12; i++) {
    g.strokeStyle = i % 2 ? '#2f57b8' : '#cf2b2b'
    g.beginPath()
    g.moveTo(i * 32 - 64, 160)
    g.lineTo(i * 32 + 96, -32)
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function makeBarberPole() {
  const g = mk()
  const chrome = M.chrome()

  // suporte de parede/base
  const foot = cyl(0.10, 0.13, 0.06, chrome, 14)
  foot.position.y = 0.03
  g.add(foot)
  const stem = cyl(0.035, 0.04, 0.9, chrome, 10)
  stem.position.y = 0.48
  g.add(stem)

  const tex = barberStripeTex()
  const cylMat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.35, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35,
  })
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.72, 20, 1, true), cylMat)
  drum.position.y = 1.30
  drum.castShadow = true; drum.receiveShadow = true
  g.add(drum)

  // cupula de vidro em volta
  const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.76, 20, 1, true), glass(0xdff2fb, 0.2))
  dome.position.y = 1.30
  g.add(dome)

  // tampa e base cromadas (troncos de cone)
  const capTop = cyl(0.055, 0.125, 0.16, chrome, 18)
  capTop.position.y = 1.74
  g.add(capTop)
  const knobTop = sphere(0.055, chrome, 12)
  knobTop.position.y = 1.85
  g.add(knobTop)
  const capBot = cyl(0.125, 0.055, 0.16, chrome, 18)
  capBot.position.y = 0.86
  g.add(capBot)
  const knobBot = sphere(0.05, chrome, 12)
  knobBot.position.y = 0.76
  g.add(knobBot)

  // brilho quente sutil
  const l = new THREE.PointLight(0xffd9c0, 1.6, 3.2, 2)
  l.position.set(0, 1.3, 0)
  l.castShadow = false
  addLight(g, l)

  // helice sobe: desloca a textura no eixo V
  g.userData.update = (dt) => { tex.offset.y -= dt * 0.35 }
  g.userData.collider = { w: 0.3, d: 0.3 }
  return g
}

// ===========================================================================
// CARRINHO DE SUPERMERCADO
// ===========================================================================
export function makeShoppingCart() {
  const g = mk()
  const wire = solid(0xc9ced2, 0.35, 0.85)
  const dark = M.darkMetal()

  const W = 0.56, D = 0.86, H = 0.42
  const basket = new THREE.Group()
  basket.position.set(0, 0.60, 0)
  basket.rotation.x = -0.10 // cesto levemente inclinado, tipico

  // arames horizontais (aros) nas 4 faces
  const hG = geo('cart-h', () => new THREE.BoxGeometry(W, 0.016, 0.016))
  const dG = geo('cart-d', () => new THREE.BoxGeometry(0.016, 0.016, D))
  for (let i = 0; i < 4; i++) {
    const y = -H / 2 + 0.05 + i * 0.11
    const sc = 1 + (i / 3) * 0.18 // cesto abre para cima
    for (const z of [-D / 2, D / 2]) {
      const m = meshOf(hG, wire, 0, y, z * sc)
      m.scale.x = sc
      basket.add(m)
    }
    for (const x of [-W / 2, W / 2]) {
      const m = meshOf(dG, wire, x * sc, y, 0)
      m.scale.z = sc
      basket.add(m)
    }
  }
  // arames verticais
  const vG = geo('cart-v', () => new THREE.BoxGeometry(0.014, H, 0.014))
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + (i / 6) * W
    for (const z of [-D / 2, D / 2]) basket.add(meshOf(vG, wire, x * 1.09, 0, z * 1.09))
  }
  for (let i = 0; i < 9; i++) {
    const z = -D / 2 + (i / 8) * D
    for (const x of [-W / 2, W / 2]) basket.add(meshOf(vG, wire, x * 1.09, 0, z * 1.09))
  }
  // fundo em grade
  const bG = geo('cart-b', () => new THREE.BoxGeometry(0.014, 0.014, D))
  for (let i = 0; i < 7; i++) basket.add(meshOf(bG, wire, -W / 2 + (i / 6) * W, -H / 2, 0))
  const b2G = geo('cart-b2', () => new THREE.BoxGeometry(W, 0.014, 0.014))
  for (let i = 0; i < 9; i++) basket.add(meshOf(b2G, wire, 0, -H / 2 - 0.014, -D / 2 + (i / 8) * D))
  g.add(basket)

  // chassi
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    const leg = cyl(0.018, 0.018, 0.46, dark, 8)
    leg.position.set(x, 0.23, -D / 2 + 0.10)
    leg.rotation.x = -0.12
    g.add(leg)
    const leg2 = cyl(0.018, 0.018, 0.46, dark, 8)
    leg2.position.set(x, 0.23, D / 2 - 0.10)
    leg2.rotation.x = 0.12
    g.add(leg2)
  }
  g.add(box(W - 0.06, 0.03, D - 0.14, dark, 0, 0.14, 0))

  // rodinhas
  const wheelG = geo('cart-wheel', () => new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12))
  const forkG = geo('cart-fork', () => new THREE.BoxGeometry(0.05, 0.09, 0.04))
  for (const x of [-W / 2 + 0.05, W / 2 - 0.05]) {
    for (const z of [-D / 2 + 0.08, D / 2 - 0.08]) {
      const w = meshOf(wheelG, M.black(), x, 0.055, z)
      w.rotation.z = Math.PI / 2
      g.add(w)
      g.add(meshOf(forkG, dark, x, 0.13, z))
    }
  }

  // alca com pegada plastica
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W / 2 - 0.02, 0.80, -D / 2 - 0.02),
    new THREE.Vector3(-W / 2 - 0.02, 0.94, -D / 2 - 0.14),
    new THREE.Vector3(0, 0.96, -D / 2 - 0.18),
    new THREE.Vector3(W / 2 + 0.02, 0.94, -D / 2 - 0.14),
    new THREE.Vector3(W / 2 + 0.02, 0.80, -D / 2 - 0.02),
  ])
  const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 20, 0.019, 7, false), dark)
  handle.castShadow = true; handle.receiveShadow = true
  g.add(handle)
  const grip = cyl(0.028, 0.028, 0.34, solid(0xd24a3a, 0.7), 10)
  grip.rotation.z = Math.PI / 2
  grip.position.set(0, 0.955, -D / 2 - 0.175)
  g.add(grip)

  g.userData.collider = { w: 0.7, d: 1.1 }
  return g
}

// ===========================================================================
// GONDOLA / PRATELEIRA DE MERCADO
// ===========================================================================
export function makeShelf(w = 2.0, h = 2.0, d = 0.6) {
  const g = mk()
  const metal = solid(0xd7dade, 0.45, 0.7)
  const dark = solid(0x6d747a, 0.5, 0.7)

  // montantes laterais perfurados
  const postG = new THREE.BoxGeometry(0.06, h, d)
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    const p = new THREE.Mesh(postG, dark)
    p.position.set(x, h / 2, 0)
    p.castShadow = true; p.receiveShadow = true
    g.add(p)
  }
  // base/rodape
  g.add(box(w, 0.10, d, dark, 0, 0.05, 0))

  // costas perfuradas: painel + furos simulados por ripas cruzadas
  const backMat = solid(0xbfc4c8, 0.6, 0.5)
  g.add(box(w - 0.1, h - 0.14, 0.02, backMat, 0, h / 2 + 0.03, -d / 2 + 0.01))
  const holeRowG = new THREE.BoxGeometry(w - 0.16, 0.012, 0.012)
  const rows = Math.max(4, Math.floor(h / 0.16))
  for (let i = 0; i < rows; i++) {
    const m = new THREE.Mesh(holeRowG, dark)
    m.position.set(0, 0.14 + i * 0.16, -d / 2 + 0.025)
    m.castShadow = false; m.receiveShadow = true
    g.add(m)
  }

  // 4-5 prateleiras inclinadas com borda e etiquetas de preco
  const n = h >= 1.9 ? 5 : 4
  const shelfG = new THREE.BoxGeometry(w - 0.12, 0.035, d - 0.06)
  const lipG = new THREE.BoxGeometry(w - 0.12, 0.06, 0.02)
  const tagG = new THREE.PlaneGeometry(0.30, 0.055)
  const tagMat = textPlaneMat('R$ 9,90', {
    w: 512, h: 96, bg: '#f4f2ea', color: '#c0392b',
    font: 'bold 56px "Trebuchet MS", sans-serif', emissiveIntensity: 0.05,
  })
  for (let i = 0; i < n; i++) {
    const y = 0.22 + i * ((h - 0.35) / (n - 1))
    const s = new THREE.Mesh(shelfG, metal)
    s.position.set(0, y, 0)
    s.rotation.x = -0.03 // leve caimento para tras
    s.castShadow = true; s.receiveShadow = true
    g.add(s)
    const lip = new THREE.Mesh(lipG, dark)
    lip.position.set(0, y + 0.02, d / 2 - 0.04)
    lip.castShadow = true; lip.receiveShadow = true
    g.add(lip)
    // 3 etiquetas na borda
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(tagG, tagMat)
      t.position.set(-w / 2 + (w / 4) * (k + 1) - 0.0, y + 0.02, d / 2 - 0.028)
      g.add(t)
    }
    // suportes triangulares
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) {
      const br = box(0.03, 0.09, d - 0.12, dark, x, y - 0.05, 0)
      g.add(br)
    }
  }

  // testeira superior com nome da secao
  g.add(box(w, 0.22, 0.04, solid(0x2f6fbf, 0.6, 0.2), 0, h + 0.11, d / 2 - 0.02))
  const head = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 0.17), textPlaneMat('OFERTAS', {
    color: '#ffffff', font: 'bold 110px "Trebuchet MS", sans-serif', emissiveIntensity: 0.3,
  }))
  head.position.set(0, h + 0.11, d / 2 + 0.002)
  g.add(head)

  g.userData.collider = { w, d }
  return g
}

// ===========================================================================
// VASO DE PLANTA (interior)
// ===========================================================================
export function makePotPlant(seed = 0) {
  const g = mk()
  const r = rng(seed + 23)
  const clay = solid(0xa8583c, 0.85)

  const pot = cyl(0.24, 0.17, 0.34, clay, 16)
  pot.position.y = 0.17
  g.add(pot)
  const rim = cyl(0.265, 0.25, 0.06, solid(0x94492f, 0.85), 16)
  rim.position.y = 0.33
  g.add(rim)
  const dish = cyl(0.24, 0.21, 0.03, solid(0x8a422b, 0.9), 16)
  dish.position.y = 0.015
  g.add(dish)
  const soil = cyl(0.215, 0.215, 0.04, solid(0x3b2c20, 1.0), 14)
  soil.position.y = 0.335
  g.add(soil)
  // pedrinhas
  const stoneG = geo('pot-stone', () => new THREE.IcosahedronGeometry(0.028, 0))
  for (let i = 0; i < 6; i++) {
    const a = r() * 6.28, rr = r() * 0.16
    g.add(meshOf(stoneG, solid(0x8d8880, 0.9), Math.cos(a) * rr, 0.36, Math.sin(a) * rr))
  }

  // caule + folhas (curvas, determinista)
  const stemMat = solid(0x3d6b33, 0.9)
  const nStems = 4 + Math.floor(r() * 3)
  const leafG = geo('leaf', () => {
    const s = new THREE.Shape()
    s.moveTo(0, 0)
    s.quadraticCurveTo(0.09, 0.12, 0, 0.30)
    s.quadraticCurveTo(-0.09, 0.12, 0, 0)
    return new THREE.ShapeGeometry(s, 8)
  })
  for (let i = 0; i < nStems; i++) {
    const a = (i / nStems) * Math.PI * 2 + r() * 0.6
    const len = 0.45 + r() * 0.45
    const tipX = Math.cos(a) * len * 0.55
    const tipZ = Math.sin(a) * len * 0.55
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.36, 0),
      new THREE.Vector3(tipX * 0.35, 0.36 + len * 0.55, tipZ * 0.35),
      new THREE.Vector3(tipX, 0.36 + len, tipZ),
    ])
    // caule que afina da base pra ponta
    const stem = new THREE.Mesh(limbGeo(c.points, 0.018, 0.007, 5, 5), stemMat)
    stem.castShadow = true; stem.receiveShadow = true
    g.add(stem)
    // 3 folhas ao longo do caule: tom da mesma paleta das arvores, mais claro
    // quanto mais perto da ponta (a luz atravessa a folha fina)
    for (let k = 1; k <= 3; k++) {
      const t = k / 3.2
      const p = c.getPoint(t)
      const leaf = new THREE.Mesh(leafG, solid(LEAF[2 + k], 0.88, 0, { side: THREE.DoubleSide }))
      leaf.position.copy(p)
      leaf.scale.setScalar(0.8 + r() * 0.7)
      leaf.rotation.set(-1.0 + r() * 0.6, a + r() * 1.4, 0)
      leaf.castShadow = true; leaf.receiveShadow = true
      g.add(leaf)
    }
    // tufinhos na ponta, pra planta nao terminar em "graveto"
    if (i % 2 === 0) foliageClump(g, tipX, 0.36 + len + 0.04, tipZ, 0.065, 0.050, 3, 4, r, 0.95)
  }

  g.userData.collider = { w: 0.55, d: 0.55 }
  return g
}

// ===========================================================================
// PLAFON DE TETO
// Origem na BASE do prop; ele deve ser posicionado na altura do teto pelo caller.
// ===========================================================================
export function makeCeilingLamp() {
  const g = mk()
  const chrome = M.chrome()

  // canopla + haste curta ate o teto (para cima do y=0)
  const canopy = cyl(0.09, 0.11, 0.05, chrome, 14)
  canopy.position.y = -0.02
  g.add(canopy)
  const rod = cyl(0.022, 0.022, 0.10, chrome, 8)
  rod.position.y = -0.10
  g.add(rod)

  // aro do plafon
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.032, 8, 28), chrome)
  ring.position.y = -0.20
  ring.rotation.x = Math.PI / 2
  ring.castShadow = true; ring.receiveShadow = true
  g.add(ring)
  // corpo raso branco
  const body = cyl(0.30, 0.24, 0.10, solid(0xe9e9e6, 0.7), 26)
  body.position.y = -0.18
  g.add(body)
  // difusor emissivo (calota virada para baixo)
  const diff = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    emissive(0xfff0d4, 2.2),
  )
  diff.position.y = -0.20
  diff.rotation.x = Math.PI
  diff.castShadow = false; diff.receiveShadow = false
  g.add(diff)

  const l = new THREE.PointLight(0xffe3bb, 6.5, 11, 2)
  l.position.set(0, -0.34, 0)
  l.castShadow = false
  addLight(g, l)

  g.userData.collider = null // fica no teto
  return g
}

// ===========================================================================
// RELOGIO DE PAREDE (origem na base do disco, encostado na parede, olha +Z)
// ===========================================================================
export function makeWallClock() {
  const g = mk()
  const R = 0.20

  const shell = cyl(R, R, 0.06, M.darkMetal(), 28)
  shell.rotation.x = Math.PI / 2
  shell.position.set(0, 0, 0.03)
  g.add(shell)
  // mostrador
  const faceMat = solid(0xf6f3ea, 0.7)
  const face = cyl(R - 0.02, R - 0.02, 0.01, faceMat, 28)
  face.rotation.x = Math.PI / 2
  face.position.set(0, 0, 0.062)
  g.add(face)
  // marcas de hora
  const tickG = geo('clock-tick', () => new THREE.BoxGeometry(0.012, 0.035, 0.008))
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const t = meshOf(tickG, M.black(), Math.sin(a) * (R - 0.045), Math.cos(a) * (R - 0.045), 0.068)
    t.rotation.z = -a
    g.add(t)
  }
  // vidro
  const gl = new THREE.Mesh(new THREE.CircleGeometry(R - 0.015, 24), glass(0xeaf6fb, 0.15))
  gl.position.set(0, 0, 0.072)
  g.add(gl)

  // ponteiros (pivos para animar)
  const hourPivot = new THREE.Group(); hourPivot.position.set(0, 0, 0.069)
  const minPivot = new THREE.Group(); minPivot.position.set(0, 0, 0.071)
  const secPivot = new THREE.Group(); secPivot.position.set(0, 0, 0.073)
  hourPivot.add(box(0.016, 0.10, 0.006, M.black(), 0, 0.05, 0))
  minPivot.add(box(0.013, 0.145, 0.006, M.black(), 0, 0.072, 0))
  secPivot.add(box(0.007, 0.155, 0.005, solid(0xc4392f, 0.6), 0, 0.068, 0))
  g.add(hourPivot, minPivot, secPivot)
  const pin = cyl(0.014, 0.014, 0.02, M.chrome(), 10)
  pin.rotation.x = Math.PI / 2
  pin.position.set(0, 0, 0.078)
  g.add(pin)

  // sincroniza com a hora real do sistema
  g.userData.update = () => {
    const now = new Date()
    const s = now.getSeconds() + now.getMilliseconds() / 1000
    const m = now.getMinutes() + s / 60
    const h = (now.getHours() % 12) + m / 60
    secPivot.rotation.z = -(s / 60) * Math.PI * 2
    minPivot.rotation.z = -(m / 60) * Math.PI * 2
    hourPivot.rotation.z = -(h / 12) * Math.PI * 2
  }
  g.userData.update(0)

  g.userData.collider = null
  return g
}

// ===========================================================================
// QUADRO COM MOLDURA
// ATENCAO: excecao a regra da base. A origem fica no CENTRO do quadro,
// porque ele e PENDURADO na parede. Frente para +Z.
// ===========================================================================
export function makeFramedPicture(w = 0.7, h = 0.9, kind = 'abstract', seed = 0) {
  const g = mk()
  const frameW = Math.max(0.05, Math.min(w, h) * 0.09)
  const frameMat = solid(0x6d4526, 0.75, 0.05, { map: woodTex(1) })
  const bevelMat = solid(0x8a5c34, 0.6, 0.1)
  const matteMat = solid(0xf3f1ea, 0.85)

  const D = 0.05
  // moldura: 4 barras
  const hBar = new THREE.BoxGeometry(w, frameW, D)
  const vBar = new THREE.BoxGeometry(frameW, h - frameW * 2, D)
  for (const y of [h / 2 - frameW / 2, -h / 2 + frameW / 2]) {
    const m = new THREE.Mesh(hBar, frameMat)
    m.position.set(0, y, 0)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  for (const x of [-w / 2 + frameW / 2, w / 2 - frameW / 2]) {
    const m = new THREE.Mesh(vBar, frameMat)
    m.position.set(x, 0, 0)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  // Empilhamento em Z, de tras pra frente: bisel -> passe-partout -> tela ->
  // face da moldura (em D/2). Sem isso a tela some atras do bisel.
  const bevel = box(w - frameW * 1.5, h - frameW * 1.5, D * 0.5, bevelMat, 0, 0, -0.002)
  g.add(bevel)
  const matte = box(w - frameW * 2.1, h - frameW * 2.1, 0.012, matteMat, 0, 0, 0.008)
  g.add(matte)
  // fundo (verso)
  g.add(box(w - frameW, h - frameW, 0.012, solid(0x4b3520, 0.9), 0, 0, -D / 2 + 0.006))

  // tela
  const iw = w - frameW * 3.2, ih = h - frameW * 3.2
  const art = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.05, iw), Math.max(0.05, ih)), paintingMat(seed, kind))
  art.position.set(0, 0, D / 2 - 0.007) // encaixada: atras da face da moldura, na frente do passe-partout
  art.receiveShadow = true
  g.add(art)

  g.userData.collider = null // pendurado, nao bloqueia
  return g
}
