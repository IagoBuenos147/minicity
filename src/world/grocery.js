import * as THREE from 'three'
import { GROCERY, interiorOf } from './layout.js'
import { LEVELS } from '../config.js'
import {
  solid, stdMat, box, cyl, plane, roundedBox,
  emissive, glass, textPlaneMat, tileTex, woodTex,
} from './materials.js'
import * as Props from './props.js'
import { createNPC } from '../npc/npc.js'
import { bebidaDe } from '../mobilia/bebidas.js'
import { congelarPersonagem } from '../player/congelar.js'

// ---------------------------------------------------------------------------
// Interior da mercearia "MERCEARIA CENTRAL".
// A casca (paredes/telhado/vitrine) e feita por city.js; aqui e so o miolo.
//
// Mapa do interior (X de -35.7 a -14.3, Z de -31.7 a -12.3, porta em x=-25):
//
//   z=-31.7  [====== GELADEIRAS (parede do fundo) ======]
//            | WL |  G1  |  G2  |  G3  |  G4 |   | WR |
//            | WL |  ||  |  ||  |  ||  |  || |   | WR |
//   z=-19.5  +---- fim das gondolas ----+
//                       area livre          [ BALCAO L ]
//   z=-12.3  ---- porta (x=-25) ----
// ---------------------------------------------------------------------------

const IN = interiorOf(GROCERY)

// Todo o miolo e montado em coordenadas LOCAIS com o piso em y=0; no fim o
// grupo inteiro sobe para LEVELS.SHOP_FLOOR (contrato de alturas de piso).
// city.js nao constroi mais chao dentro do lote.
const BASE = LEVELS.SHOP_FLOOR               // 0.16

const FLOOR_Y = 0 // nivelado com groundY(): city.js nao constroi mais laje dentro do lote
// Local: o teto tem que continuar no topo da parede (y = wallHeight no mundo).
const CEIL_Y = GROCERY.wallHeight - BASE     // 3.84 local = 4.0 no mundo

// Gondolas: corredores com 2.4~2.6 m livres entre elas.
const GONDOLA_H = 1.90
const GONDOLA_D = 0.70                       // profundidade de CADA lado
const GONDOLAS = [
  { x: -32.0, z0: -29.6, z1: -19.6, seed: 11, tag: 'gondola-1' },
  { x: -28.0, z0: -29.6, z1: -19.6, seed: 22, tag: 'gondola-2' },
  { x: -24.0, z0: -29.6, z1: -19.6, seed: 33, tag: 'gondola-3' },
  { x: -20.0, z0: -29.6, z1: -23.6, seed: 44, tag: 'gondola-4' },
]

// Prateleiras de parede (lado unico, costas na parede).
const WALL_SHELF_H = 2.10
const WALL_SHELF_D = 0.60

// Geladeiras encostadas na parede do fundo (z = IN.z0), viradas para +Z.
const FRIDGE_W = 2.14
const FRIDGE_D = 0.88
const FRIDGE_H = 2.24
const FRIDGE_X = [-22.7, -20.5, -18.3, -16.1]

// Balcao do caixa, em L, perto da porta.
const CNT_H = 0.95
const CNT_A = { x0: -22.0, x1: -17.0, z0: -16.65, z1: -15.85 }  // bancada principal
const CNT_B = { x0: -17.7, x1: -16.9, z0: -19.60, z1: -16.60 }  // perna do L
const CLERK = { x: -19.8, z: -17.35 }

const PRODUCT_COLORS = [
  0xe0453c, 0xf0952a, 0xf3d13f, 0x3fa757, 0x2f7fd1, 0x8a4fc4,
  0xe06aa8, 0xf2f0e6, 0x3a4756, 0x9c5b2e, 0x2bb3a6, 0xd94f7a,
  0xc7d94f, 0x5b6ee0, 0xef7a5a, 0x7fbf6a,
]
const LABEL_COLORS = [0xfaf7ee, 0x1f2429, 0xffd94a, 0xe8452f, 0x2f6fd0]

// ---------------------------------------------------------------------------
// PRNG deterministico (mulberry32) — mesma loja em toda sessao.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rr = (rng, a, b) => a + rng() * (b - a)
const pick = (rng, arr) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]

// ---------------------------------------------------------------------------
// Materiais locais (cacheados via stdMat, nada de material novo solto).
// ---------------------------------------------------------------------------
const M = {
  get floor() {
    // O DONO: "ta muito claro mesmo, e bem forte". Metade do problema era este
    // piso. `#efece4` contra `#ddd8cd` sao dois brancos separados por 4% de
    // luminancia — de pe, a 1,70 m, o xadrez simplesmente NAO EXISTE: e um
    // lencol branco. E com roughness 0.25 ele ainda devolvia o brilho das nove
    // calhas do teto direto no olho.
    //
    // O par novo tem 22% de diferenca entre as duas pastilhas, que e o que faz
    // o desenho aparecer, e roughness 0.42 troca o reflexo especular por
    // difuso. Continua sendo piso de mercado (claro e encerado), so que agora
    // da pra ver que ele e feito de peca.
    const t = tileTex(14, '#e2ded3', '#bdb7a9')
    return stdMat('groc-floor', { map: t, roughness: 0.42, metalness: 0.02, color: 0xffffff })
  },
  get skirt() { return solid(0x51565c, 0.55, 0.15) },
  // Forro 12% mais escuro que a parede, de proposito. Teto e parede na mesma
  // cor tiram a quina da sala: sem a linha onde um acaba e o outro comeca, o
  // comodo perde o tamanho e vira uma caixa de luz.
  get ceiling() { return solid(0xc3c5c2, 0.95) },
  /** Verde da casa, lavado. Faixa de parede e rodape — e o que da cor a um
   *  interior que era branco de cima a baixo. */
  get faixa() { return solid(0x9dc0a8, 0.85) },
  get parede() { return solid(0xdfe2dc, 0.92) },
  get plate() { return solid(0xe9ebec, 0.45, 0.25) },
  get steel() { return solid(0xb6bcc2, 0.35, 0.75) },
  get darkSteel() { return solid(0x3d4348, 0.45, 0.6) },
  get shelfMetal() { return solid(0xd8dbdc, 0.55, 0.35) },
  get shelfBack() { return solid(0xc2c7ca, 0.7, 0.2) },
  get rail() { return solid(0xf4f2ec, 0.5) },
  get accent() { return solid(0x2f9e57, 0.6) },
  get rubber() { return solid(0x24272b, 0.95) },
  get prod() { return stdMat('groc-prod', { color: 0xffffff, roughness: 0.52, metalness: 0.03 }) },
  get label() { return stdMat('groc-label', { color: 0xffffff, roughness: 0.38 }) },
  get lid() { return solid(0xc6ccd2, 0.3, 0.85) },
  get counter() { return solid(0xe6e2d8, 0.35, 0.05) },
  get counterTop() { return solid(0x2c3238, 0.28, 0.2) },
  get wood() { return stdMat('groc-wood', { map: woodTex(2, '#a97a45'), roughness: 0.8 }) },
}

// ---------------------------------------------------------------------------
// Props compartilhados. Assinaturas REAIS de props.js (nada de adivinhacao):
//   makeShelf(w, h, d)
//   makeShoppingCart()
//   makeFramedPicture(w, h, kind, seed)
// ---------------------------------------------------------------------------

/**
 * Y do topo de cada tabua de um Props.makeShelf(w, h, d).
 * Espelha a formula de props.js: n tabuas de 0.035 de espessura, a primeira
 * com centro em y=0.22 e as demais distribuidas ate h-0.13.
 */
function shelfLevels(h) {
  const n = h >= 1.9 ? 5 : 4
  const out = []
  for (let i = 0; i < n; i++) out.push(0.22 + i * ((h - 0.35) / (n - 1)) + 0.0175)
  return out
}

/** Apoia no chao um prop que possa nascer com a origem no centro. */
function placeProp(obj, x, z, ry) {
  obj.updateMatrixWorld(true)
  const bb = new THREE.Box3().setFromObject(obj)
  const lift = isFinite(bb.min.y) && bb.min.y < -0.01 ? -bb.min.y : 0
  obj.position.set(x, lift, z)
  obj.rotation.y = ry || 0
  obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return obj
}

/**
 * Retorna { obj, levels } com a gondola/prateleira apoiada em y=0.
 * Convencao de props.makeShelf: w em X, h em Y, d em Z, face aberta para +Z.
 */
function makeShelfUnit(w, h, d, opts) {
  const obj = Props.makeShelf(w, h, d, opts)
  obj.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return { obj, levels: shelfLevels(h) }
}

// ---------------------------------------------------------------------------
// PRODUTOS — tudo vai para pools e vira um punhado de InstancedMesh no final.
// ---------------------------------------------------------------------------
const P_TYPES = [
  { k: 'box', w: 0.155, h: 0.300, d: 0.085, rows: 2, wgt: 32 },
  { k: 'can', w: 0.076, h: 0.125, d: 0.076, rows: 2, wgt: 26 },
  { k: 'bottle', w: 0.098, h: 0.280, d: 0.098, rows: 1, wgt: 24 },
  { k: 'sack', w: 0.245, h: 0.255, d: 0.100, rows: 1, wgt: 18 },
]

function newPool() {
  return { boxes: [], labels: [], cans: [], lids: [], bodies: [], necks: [], caps: [], sacks: [] }
}

function push(arr, x, y, z, yaw, sx, sy, sz, color, tilt) {
  arr.push({ x, y, z, yaw, tilt: tilt || 0, sx, sy, sz, color })
}

function weightedType(rng, list, bias) {
  let total = 0
  for (const t of list) total += t.wgt * ((bias && bias[t.k]) || 1)
  let v = rng() * total
  for (const t of list) {
    v -= t.wgt * ((bias && bias[t.k]) || 1)
    if (v <= 0) return t
  }
  return list[list.length - 1]
}

/**
 * face = { cx, cz, ax, az, nx, nz, length, depth, levels, topCap }
 * (cx,cz) = centro do plano ABERTO da prateleira; (nx,nz) = normal para fora.
 */
function fillFace(rng, pool, face, bias) {
  const yawBase = Math.atan2(face.nx, face.nz)
  const L = face.levels
  for (let li = 0; li < L.length; li++) {
    const y = L[li]
    const cap = li + 1 < L.length
      ? L[li + 1] - y - 0.05
      : Math.min(0.38, (face.topCap !== undefined ? face.topCap : 0.38) - y)
    const allowed = P_TYPES.filter((t) => t.h * 0.9 <= cap)
    if (!allowed.length) continue

    let u = -face.length / 2 + 0.08
    const uEnd = face.length / 2 - 0.08
    let guard = 0
    while (u < uEnd - 0.12 && guard++ < 400) {
      const t = weightedType(rng, allowed, bias)
      const facings = 1 + Math.floor(rng() * (t.k === 'sack' ? 2 : 3))
      const step = t.w + 0.013
      const blockW = facings * step
      if (u + blockW > uEnd) break
      const color = pick(rng, PRODUCT_COLORS)
      const rows = Math.max(1, t.rows - (rng() < 0.3 ? 1 : 0))
      const hasLabel = rng() < 0.62
      const labelColor = pick(rng, LABEL_COLORS)

      for (let f = 0; f < facings; f++) {
        if (rng() < 0.055) continue                    // buraco: produto que ja vendeu
        const uu = u + f * step + step / 2
        for (let r = 0; r < rows; r++) {
          const dIn = 0.085 + r * (t.d + 0.020)
          if (dIn + t.d / 2 > face.depth - 0.03) break
          const px = face.cx + face.ax * uu - face.nx * dIn
          const pz = face.cz + face.az * uu - face.nz * dIn
          const yaw = yawBase + rr(rng, -0.09, 0.09)
          placeProduct(rng, pool, t, px, y, pz, yaw, color, hasLabel, labelColor)
        }
      }
      u += blockW + rr(rng, 0.012, 0.055)
    }
  }
}

function placeProduct(rng, pool, t, px, y, pz, yaw, color, hasLabel, labelColor) {
  if (t.k === 'box') {
    const sx = t.w * rr(rng, 0.92, 1.05)
    const sy = t.h * rr(rng, 0.80, 1.02)
    const sz = t.d * rr(rng, 0.9, 1.1)
    push(pool.boxes, px, y + sy / 2, pz, yaw, sx, sy, sz, color)
    if (hasLabel) {
      const off = sz / 2 + 0.004
      push(pool.labels,
        px + Math.sin(yaw) * off, y + sy * 0.62, pz + Math.cos(yaw) * off,
        yaw, sx * 0.78, sy * 0.30, 0.008, labelColor)
    }
  } else if (t.k === 'can') {
    const s = rr(rng, 0.92, 1.08)
    const hh = t.h * s
    push(pool.cans, px, y + hh / 2, pz, yaw, t.w * s, hh, t.w * s, color)
    push(pool.lids, px, y + hh - 0.006, pz, yaw, t.w * s * 0.94, 0.014, t.w * s * 0.94, 0xffffff)
  } else if (t.k === 'bottle') {
    const s = rr(rng, 0.88, 1.10)
    const dia = t.w * 0.86 * s
    const bodyH = 0.185 * s
    const neckH = 0.062 * s
    const capH = 0.026 * s
    push(pool.bodies, px, y + bodyH / 2, pz, yaw, dia, bodyH, dia, color)
    push(pool.necks, px, y + bodyH + neckH / 2, pz, yaw, dia, neckH, dia, color)
    push(pool.caps, px, y + bodyH + neckH + capH / 2, pz, yaw, dia * 0.48, capH, dia * 0.48,
      pick(rng, LABEL_COLORS))
  } else {
    const sx = t.w * rr(rng, 0.9, 1.06)
    const sy = t.h * rr(rng, 0.85, 1.0)
    push(pool.sacks, px, y + sy / 2 - 0.01, pz, yaw, sx, sy, t.d, color, rr(rng, -0.12, 0.12))
  }
}

/** Converte os pools em InstancedMesh (poucas draw calls, muita coisa na tela). */
function buildProductMeshes(pool, parent) {
  // poucos segmentos: sao milhares de instancias e o objeto e pequeno em tela
  const gBox = new THREE.BoxGeometry(1, 1, 1)
  const gCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)
  const gNeck = new THREE.CylinderGeometry(0.19, 0.5, 1, 8)
  const gSack = roundedBox(1, 1, 1, 0.24, M.prod, 1).geometry

  const defs = [
    { list: pool.boxes, geo: gBox, mat: M.prod, colored: true },
    { list: pool.labels, geo: gBox, mat: M.label, colored: true },
    { list: pool.cans, geo: gCyl, mat: M.prod, colored: true },
    { list: pool.lids, geo: gCyl, mat: M.lid, colored: false },
    { list: pool.bodies, geo: gCyl, mat: M.prod, colored: true },
    { list: pool.necks, geo: gNeck, mat: M.prod, colored: true },
    { list: pool.caps, geo: gCyl, mat: M.prod, colored: true },
    { list: pool.sacks, geo: gSack, mat: M.prod, colored: true },
  ]

  const dummy = new THREE.Object3D()
  const col = new THREE.Color()
  for (const d of defs) {
    if (!d.list.length) continue
    const im = new THREE.InstancedMesh(d.geo, d.mat, d.list.length)
    im.castShadow = true
    im.receiveShadow = true
    for (let i = 0; i < d.list.length; i++) {
      const e = d.list[i]
      dummy.position.set(e.x, e.y, e.z)
      dummy.rotation.set(0, e.yaw, e.tilt)
      dummy.scale.set(e.sx, e.sy, e.sz)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
      if (d.colored) im.setColorAt(i, col.setHex(e.color))
    }
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    parent.add(im)
  }
}

// ---------------------------------------------------------------------------
// Pecas do cenario
// ---------------------------------------------------------------------------

function buildFloorAndTrim(g) {
  const f = plane(IN.w, IN.d, M.floor)
  f.position.set(IN.cx, FLOOR_Y, IN.cz)
  g.add(f)

  // rodape: 4 paredes, com vao na porta da fachada
  const H = 0.13, T = 0.05
  const door = GROCERY.door
  const dz = IN.z1 - T / 2
  const segs = [
    [IN.x0, door.center - door.width / 2, dz, 'x'],
    [door.center + door.width / 2, IN.x1, dz, 'x'],
    [IN.x0, IN.x1, IN.z0 + T / 2, 'x'],
  ]
  for (const [a, b, z] of segs) {
    if (b - a <= 0.05) continue
    g.add(box(b - a, H, T, M.skirt, (a + b) / 2, H / 2, z))
  }
  for (const x of [IN.x0 + T / 2, IN.x1 - T / 2]) {
    g.add(box(T, H, IN.d - T * 2, M.skirt, x, H / 2, IN.cz))
  }
}

function buildCeilingAndLights(g, lights, fixtures) {
  const c = plane(IN.w, IN.d, M.ceiling, Math.PI / 2)
  c.position.set(IN.cx, CEIL_Y - 0.02, IN.cz)
  g.add(c)

  // trilhos estruturais do forro (so pra quebrar a superficie lisa)
  const beam = new THREE.BoxGeometry(IN.w, 0.09, 0.10)
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(beam, solid(0xc8c8c4, 0.9))
    m.position.set(IN.cx, CEIL_Y - 0.07, IN.z0 + 1.8 + i * ((IN.d - 3.6) / 4))
    m.receiveShadow = true
    g.add(m)
  }

  // 9 calhas fluorescentes (caixa branca + tubo + difusor emissivos).
  // A sensacao de "teto todo aceso" vem dos MATERIAIS emissivos, nao de luzes
  // reais: a cena inteira so tem orcamento pra ~3 PointLights aqui dentro.
  const housingGeo = new THREE.BoxGeometry(2.90, 0.11, 0.34)
  const tubeGeo = new THREE.BoxGeometry(2.74, 0.05, 0.24)
  const diffGeo = new THREE.PlaneGeometry(2.86, 0.40)
  const rodGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6)
  const xs = [-32.5, -25.5, -18.5]
  const zs = [-28.0, -22.0, -16.0]
  // 2.0 e nao 3.2. Sao NOVE calhas num comodo de 415 m2 e o brilho delas se
  // soma: com 3.2 o teto inteiro passava do limiar do bloom (0.85, em
  // core/engine.js) e o halo escorria pela sala toda, lavando o que estava
  // embaixo. Tubo fluorescente e claro, nao e um holofote.
  const lampMat = emissive(0xf3f7ff, 2.0)
  // difusor: painel voltado pra baixo, espalha o brilho da calha
  // 0.55 e nao 0.95. O bloom corta em 0.85: um difusor TRANSPARENTE em 0.95
  // termina na tela somado ao que aparece atras dele, entao o pixel dele fica
  // cruzando o limiar pra cima e pra baixo conforme o angulo — acende e apaga
  // sozinho. Em 0.55 ele nunca chega la, e quem estoura e o tubo (2.0), que
  // estoura SEMPRE. Estourar sempre nao pisca; e ficar na beirada que pisca.
  const diffMat = stdMat('groc-diffuser', {
    color: 0x0d0f12, emissive: 0xe3ecff, emissiveIntensity: 0.55,
    roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false,
  })
  let n = 0
  for (const x of xs) {
    for (const z of zs) {
      const unit = new THREE.Group()
      unit.position.set(x, CEIL_Y - 0.30, z)
      const hs = new THREE.Mesh(housingGeo, M.plate)
      hs.castShadow = true; hs.receiveShadow = true
      unit.add(hs)
      // Tubo em -0.02 e nao -0.055. O tubo tem 5 cm de altura, entao a face de
      // baixo dele ficava em -0.080 — 5 mm ABAIXO do difusor, que esta em
      // -0.075: o tubo furava o difusor e a borda da furada piscava. Agora a
      // face de baixo do tubo para em -0.045 e sobram 3 cm de folga. O tubo
      // continua inteiro dentro da caixa (que vai de -0.055 a +0.055).
      const tube = new THREE.Mesh(tubeGeo, lampMat)
      tube.position.y = -0.02
      unit.add(tube)
      const diff = new THREE.Mesh(diffGeo, diffMat)
      diff.rotation.x = Math.PI / 2
      diff.position.y = -0.075
      unit.add(diff)
      for (const s of [-1, 1]) {
        const rod = new THREE.Mesh(rodGeo, M.steel)
        rod.position.set(s * 1.2, 0.16, 0)
        unit.add(rod)
      }
      g.add(unit)
      n++
    }
  }

  // Exatamente 3 PointLights (sem sombra) — corredor esquerdo, miolo e caixa.
  // Mais que isso e a cidade estoura o limite de luzes por frame.
  // 22 e nao 34, alcance 13 e nao 10, e a cor menos azul.
  //
  // O conjunto antigo era forte e CURTO: 34 de intensidade com alcance 10 num
  // comodo de 21 x 19 m faz tres poças duras de luz no meio dos corredores e
  // deixa o resto no escuro, e o olho le o conjunto como "estourado" mesmo com
  // metade da sala mal iluminada. Menos intensidade com mais alcance espalha o
  // mesmo total por mais area: a leitura fica pareja e nada satura.
  //
  // 0xeaf2ff era azul de mais pra uma loja de bairro. 0xf4f5f6 e o branco
  // levemente frio de lampada fluorescente, sem puxar pro ciano.
  //
  // ONDE elas ficam importa tanto quanto quanto elas valem. A posicao antiga
  // punha uma luz em (-31, -24) e os letreiros de corredor estao pendurados em
  // z = -24, x = -30: um metro de distancia. Com decay 2 isso entrega 20.8 de
  // irradiancia no letreiro MERCEARIA contra 1.8 no letreiro vizinho e 2.1 no
  // chao — 10x mais luz num objeto so. Ele saturava em branco, e como saturar
  // depende do angulo, andar pelo corredor fazia o letreiro acender e apagar.
  // Era a queixa "iluminacao muito forte perto do MERCEARIA, piscando de longe".
  //
  // Estas tres posicoes foram escolhidas medindo: nenhuma passa a 2.5 m de um
  // objeto parado. Do ponto mais claro pro mais escuro da loja a razao caiu de
  // 31.5x pra 3.1x, e o fundo dos corredores (que estava em 0.66, o canto
  // escuro da loja) subiu pra 1.76. Mesma contagem de luzes, mesmo custo.
  //
  // Alcance 15 e nao 13 porque as luzes se afastaram das paredes: com 13 o
  // corte caia dentro da sala.
  // A ALTURA delas era o outro erro, e o maior de todos. Penduradas a 45 cm do
  // forro, com decay 2, elas entregavam 119 de irradiancia no forro logo acima
  // contra 1.8 no chao — 65x. O forro estourava em branco chapado em tres
  // pocas e o bloom escorria delas, e era isso que se lia como "muito claro
  // mesmo, e bem forte" mesmo com o chao na medida.
  //
  // Descendo pra 1.24 m abaixo do forro (e ficando 32 cm acima do topo das
  // gondolas, sem encostar em nada), o forro cai pra 9.0 — treze vezes menos —
  // e o chao ate MELHORA, porque a lampada se aproximou dele. A razao
  // forro/chao vai de 65x pra 5.6x. Fisicamente e o certo tambem: a luz sai da
  // boca da luminaria pra baixo, e o teto so recebe o reflexo.
  const lit = [[-30.5, -20.5, 17], [-27.0, -27.5, 16], [-19.5, -16.5, 16]]
  for (const [x, z, i] of lit) {
    const pl = new THREE.PointLight(0xf4f5f6, i, 15, 2)
    pl.position.set(x, CEIL_Y - 1.24, z)
    pl.castShadow = false
    g.add(pl)
    lights.push(pl)
  }
}

function buildGondolas(g, colliders, pool) {
  for (const gd of GONDOLAS) {
    const len = gd.z1 - gd.z0
    const cz = (gd.z0 + gd.z1) / 2
    const rng = mulberry32(gd.seed * 7919 + 13)

    for (const s of [-1, 1]) {
      // testeira: false — a coroa logo abaixo faz esse papel pela gondola
      // inteira. Ver a nota em Props.makeShelf: as duas juntas eram o "bugando
      // entre azul e verde" do corredor.
      const { obj, levels } = makeShelfUnit(len, GONDOLA_H, GONDOLA_D, { testeira: false })
      // face aberta do movel (+Z local) apontando para s*X
      obj.rotation.y = s * Math.PI / 2
      obj.position.set(gd.x + s * (GONDOLA_D / 2), 0, cz)
      g.add(obj)

      fillFace(rng, pool, {
        cx: gd.x + s * GONDOLA_D, cz,
        ax: 0, az: 1,
        nx: s, nz: 0,
        length: len - 0.16,
        depth: GONDOLA_D,
        levels,
        topCap: GONDOLA_H - 0.06,
      })
    }

    // COROA DE TOPO — uma peca so, e ela e a testeira da gondola.
    //
    // Subiu de 14 pra 24 cm de altura porque agora carrega o letreiro OFERTAS
    // nas duas faces do corredor (antes o letreiro vinha numa placa separada,
    // que comecava na MESMA altura que esta e brigava por pixel com ela).
    // O texto fica 1 cm pra fora da chapa: e folga de sobra pro z-buffer a
    // qualquer distancia que o jogador consiga chegar dentro da loja.
    g.add(box(GONDOLA_D * 2, 0.24, len, M.accent, gd.x, GONDOLA_H + 0.12, cz))
    for (const s of [-1, 1]) {
      const letreiro = new THREE.Mesh(
        new THREE.PlaneGeometry(len - 0.3, 0.18),
        textPlaneMat('OFERTAS', {
          color: '#ffffff', font: 'bold 110px "Trebuchet MS", sans-serif', emissiveIntensity: 0.3,
        }),
      )
      letreiro.position.set(gd.x + s * (GONDOLA_D + 0.01), GONDOLA_H + 0.12, cz)
      letreiro.rotation.y = s * Math.PI / 2
      g.add(letreiro)
    }
    // ponta de gondola: painel arredondado nas duas extremidades
    for (const e of [gd.z0, gd.z1]) {
      // +0.05 no Y: o bisel do roundedBox estica a peca alem de h
      const cap = roundedBox(GONDOLA_D * 2 - 0.06, GONDOLA_H * 0.9, 0.07, 0.12, M.shelfMetal)
      cap.position.set(gd.x, GONDOLA_H * 0.45 + 0.05, e + (e === gd.z0 ? -0.04 : 0.04))
      g.add(cap)
    }

    colliders.push({
      minX: gd.x - GONDOLA_D, maxX: gd.x + GONDOLA_D,
      minZ: gd.z0 - 0.1, maxZ: gd.z1 + 0.1, tag: gd.tag,
    })
  }
}

function buildWallShelves(g, colliders, pool) {
  const runs = [
    { x: IN.x0 + WALL_SHELF_D / 2, s: 1, z0: -29.6, z1: -19.6, seed: 501, tag: 'shelf-left' },
    { x: IN.x1 - WALL_SHELF_D / 2, s: -1, z0: -29.2, z1: -21.2, seed: 502, tag: 'shelf-right' },
  ]
  for (const r of runs) {
    const len = r.z1 - r.z0
    const cz = (r.z0 + r.z1) / 2
    // aqui a testeira do movel fica: nao ha coroa nenhuma por cima dela. So a
    // cor muda pro verde da loja — o azul de fabrica destoava do resto.
    const { obj, levels } = makeShelfUnit(len, WALL_SHELF_H, WALL_SHELF_D, { testeira: 0x1f7a44 })
    obj.rotation.y = r.s * Math.PI / 2
    obj.position.set(r.x, 0, cz)
    g.add(obj)

    const rng = mulberry32(r.seed)
    fillFace(rng, pool, {
      cx: r.x + r.s * (WALL_SHELF_D / 2), cz,
      ax: 0, az: 1,
      nx: r.s, nz: 0,
      length: len - 0.16,
      depth: WALL_SHELF_D,
      levels,
      topCap: WALL_SHELF_H - 0.06,
    }, r.s < 0 ? { sack: 2.0, box: 1.4, bottle: 0.6, can: 0.6 } : null)

    colliders.push({
      minX: Math.min(r.x - WALL_SHELF_D / 2, r.x + WALL_SHELF_D / 2),
      maxX: Math.max(r.x - WALL_SHELF_D / 2, r.x + WALL_SHELF_D / 2),
      minZ: r.z0 - 0.1, maxZ: r.z1 + 0.1, tag: r.tag,
    })
  }
}

function buildFridges(g, colliders, pool) {
  const zBack = IN.z0
  const zc = zBack + FRIDGE_D / 2
  const glassMat = glass(0xd6f0ff, 0.20)
  const glowMat = emissive(0x8fd8ff, 1.15)

  const bodyGeo = new THREE.BoxGeometry(0.07, FRIDGE_H, FRIDGE_D)
  const shelfGeo = new THREE.BoxGeometry(FRIDGE_W - 0.22, 0.03, FRIDGE_D - 0.24)
  const doorGeo = new THREE.PlaneGeometry(FRIDGE_W - 0.20, FRIDGE_H - 0.62)

  FRIDGE_X.forEach((fx, idx) => {
    const u = new THREE.Group()
    u.position.set(fx, 0, zc)

    // carcaca
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(bodyGeo, M.darkSteel)
      p.position.set(s * (FRIDGE_W / 2 - 0.035), FRIDGE_H / 2, 0)
      p.castShadow = true; p.receiveShadow = true
      u.add(p)
    }
    u.add(box(FRIDGE_W, 0.10, FRIDGE_D, M.darkSteel, 0, FRIDGE_H - 0.05, 0))
    u.add(box(FRIDGE_W, 0.16, FRIDGE_D, M.darkSteel, 0, 0.08, 0))     // base / kick plate
    u.add(box(FRIDGE_W - 0.14, FRIDGE_H - 0.30, 0.05, solid(0xeef4f7, 0.5), 0, FRIDGE_H / 2, -FRIDGE_D / 2 + 0.03))
    // fundo luminoso azulado (sem PointLight: barato e ja da o clima)
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(FRIDGE_W - 0.22, FRIDGE_H - 0.55), glowMat)
    glow.position.set(0, FRIDGE_H / 2 - 0.05, -FRIDGE_D / 2 + 0.07)
    u.add(glow)

    // tabuas internas
    const levels = []
    for (let i = 0; i < 4; i++) {
      const y = 0.30 + i * 0.42
      levels.push(y)
      const sh = new THREE.Mesh(shelfGeo, M.shelfMetal)
      sh.position.set(0, y - 0.015, 0.01)
      sh.castShadow = true; sh.receiveShadow = true
      u.add(sh)
    }

    // porta de vidro + puxador vertical + moldura
    const dr = new THREE.Mesh(doorGeo, glassMat)
    dr.position.set(0, FRIDGE_H / 2 + 0.02, FRIDGE_D / 2 - 0.01)
    u.add(dr)
    u.add(box(0.06, FRIDGE_H - 0.55, 0.06, M.steel, -FRIDGE_W / 2 + 0.12, FRIDGE_H / 2 + 0.02, FRIDGE_D / 2 - 0.02))
    for (const s of [-1, 1]) {
      u.add(box(0.05, FRIDGE_H - 0.52, 0.07, M.darkSteel, s * (FRIDGE_W / 2 - 0.09), FRIDGE_H / 2 + 0.02, FRIDGE_D / 2 - 0.02))
    }
    // testeira com letreiro
    u.add(box(FRIDGE_W - 0.06, 0.34, 0.08, M.accent, 0, FRIDGE_H - 0.26, FRIDGE_D / 2 - 0.01))
    const lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(FRIDGE_W - 0.30, 0.26),
      textPlaneMat(idx < 2 ? 'GELADOS' : 'BEBIDAS', { color: '#ffffff', glow: '#9be8c0', emissiveIntensity: 0.6 }),
    )
    // +0.05 e nao +0.035: a testeira atras termina em FRIDGE_D/2 + 0.03, e
    // 5 mm de folga nao seguram o letreiro no lugar visto do outro corredor.
    lbl.position.set(0, FRIDGE_H - 0.26, FRIDGE_D / 2 + 0.05)
    u.add(lbl)

    g.add(u)

    // bebidas dentro (mesmo sistema de instancias das gondolas)
    const rng = mulberry32(900 + idx * 37)
    fillFace(rng, pool, {
      cx: fx, cz: zc + FRIDGE_D / 2 - 0.06,
      ax: 1, az: 0,
      nx: 0, nz: 1,
      length: FRIDGE_W - 0.34,
      depth: FRIDGE_D - 0.16,
      levels,
      topCap: FRIDGE_H - 0.42,
    }, { bottle: 5.0, can: 4.0, box: 0.25, sack: 0.0 })
  })

  colliders.push({
    minX: FRIDGE_X[0] - FRIDGE_W / 2 - 0.05, maxX: FRIDGE_X[FRIDGE_X.length - 1] + FRIDGE_W / 2 + 0.05,
    minZ: zBack - 0.05, maxZ: zBack + FRIDGE_D + 0.05, tag: 'fridges',
  })
}

function buildRegister() {
  const g = new THREE.Group()
  const body = roundedBox(0.44, 0.20, 0.36, 0.05, M.plate)
  body.position.y = 0.10
  g.add(body)
  // gaveta do dinheiro, meio aberta
  const drawer = roundedBox(0.42, 0.11, 0.30, 0.03, solid(0x9aa1a8, 0.5, 0.3))
  drawer.position.set(0, 0.055, 0.09)
  g.add(drawer)
  g.add(box(0.16, 0.02, 0.02, M.darkSteel, 0, 0.055, 0.245))       // puxador
  // teclado inclinado
  const kb = box(0.28, 0.025, 0.20, solid(0x30363c, 0.7), 0, 0.215, 0.05)
  kb.rotation.x = -0.22
  g.add(kb)
  // teclas em InstancedMesh: 16 pecas identicas viram 1 draw call
  const keys = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.028, 0.012, 0.028), solid(0xd9dde0, 0.6), 16)
  keys.castShadow = true; keys.receiveShadow = true
  const kd = new THREE.Object3D()
  let ki = 0
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      kd.position.set(-0.105 + c * 0.07, 0.236 + r * 0.012, 0.115 - r * 0.048)
      kd.rotation.set(-0.22, 0, 0)
      kd.updateMatrix()
      keys.setMatrixAt(ki++, kd.matrix)
    }
  }
  keys.instanceMatrix.needsUpdate = true
  g.add(keys)
  // poste + display de 7 segmentos virado pro cliente
  g.add(cyl(0.022, 0.022, 0.26, M.darkSteel, 10).translateY(0.32))
  const head = roundedBox(0.28, 0.16, 0.07, 0.025, solid(0x23282d, 0.6))
  head.position.set(0, 0.50, -0.02)
  g.add(head)
  const seg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.23, 0.10),
    textPlaneMat('R$ 12,90', { color: '#8dff9f', font: 'bold 130px "Courier New", monospace', glow: '#3dff77', emissiveIntensity: 1.5 }),
  )
  seg.position.set(0, 0.50, 0.020)
  g.add(seg)
  const seg2 = seg.clone()
  seg2.position.z = -0.062
  seg2.rotation.y = Math.PI
  g.add(seg2)
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return g
}

function buildScanner() {
  const g = new THREE.Group()
  const base = roundedBox(0.30, 0.07, 0.26, 0.03, solid(0x2b3036, 0.65))
  base.position.y = 0.035
  g.add(base)
  const padMat = glass(0xffdcdc, 0.35)
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.18), padMat)
  pad.rotation.x = -Math.PI / 2
  pad.position.y = 0.073
  g.add(pad)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.012), emissive(0xff3b30, 2.2))
  line.rotation.x = -Math.PI / 2
  line.position.y = 0.076
  g.add(line)
  // leitor de mao no suporte
  const stand = box(0.06, 0.22, 0.06, M.darkSteel, 0.20, 0.11, 0)
  g.add(stand)
  const gun = new THREE.Group()
  gun.position.set(0.20, 0.28, 0.02)
  gun.rotation.z = -0.35
  const gb = roundedBox(0.07, 0.19, 0.09, 0.03, solid(0x1f2429, 0.6))
  gun.add(gb)
  const nose = cyl(0.03, 0.035, 0.06, solid(0x11151a, 0.5), 10)
  nose.position.set(0, 0.11, 0.01)
  gun.add(nose)
  gun.add(box(0.02, 0.05, 0.02, emissive(0xff3b30, 1.6), 0, 0.145, 0.01))
  g.add(gun)
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return g
}

function buildCardMachine() {
  const g = new THREE.Group()
  g.add(cyl(0.035, 0.045, 0.30, M.darkSteel, 10).translateY(0.15))
  const dev = new THREE.Group()
  dev.position.y = 0.34
  dev.rotation.x = -0.55
  const b = roundedBox(0.13, 0.22, 0.04, 0.02, solid(0x30363c, 0.6))
  dev.add(b)
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.07), emissive(0x63d5ff, 1.0))
  scr.position.set(0, 0.055, 0.022)
  dev.add(scr)
  const keys = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.024, 0.014, 0.008), solid(0xc9ced3, 0.6), 12)
  keys.castShadow = true; keys.receiveShadow = true
  const kd = new THREE.Object3D()
  let ki = 0
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    kd.position.set(-0.032 + c * 0.032, -0.010 - r * 0.021, 0.022)
    kd.updateMatrix()
    keys.setMatrixAt(ki++, kd.matrix)
  }
  keys.instanceMatrix.needsUpdate = true
  dev.add(keys)
  g.add(dev)
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return g
}

function buildCandyRack() {
  const g = new THREE.Group()
  const side = new THREE.BoxGeometry(0.02, 0.46, 0.22)
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(side, M.shelfMetal)
    m.position.set(s * 0.19, 0.23, 0)
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  g.add(box(0.40, 0.02, 0.20, M.shelfMetal, 0, 0.005, 0))
  const trayGeo = new THREE.BoxGeometry(0.38, 0.02, 0.20)
  for (let i = 0; i < 3; i++) {
    const t = new THREE.Mesh(trayGeo, M.shelfMetal)
    t.position.set(0, 0.13 + i * 0.15, 0)
    t.rotation.x = -0.18
    t.castShadow = true; t.receiveShadow = true
    g.add(t)
  }
  // A CHAPA VERMELHA VEM ANTES, E O TEXTO FICA 4 CM NA FRENTE DELA.
  //
  // O dono viu a placa de OFERTA "bugando, tremendo". A chapa e uma caixa de
  // 3 cm de espessura centrada em z=0, ou seja, a face dela esta em +0.015; o
  // plano do texto estava em +0.02. CINCO MILIMETROS entre duas superficies
  // paralelas — e essa e a distancia mais perigosa que existe pro z-buffer, que
  // aqui nao e logaritmico e perde precisao rapido com a distancia. A placa e
  // pequena e vista de 8 a 12 m do outro lado do corredor, que e justamente
  // onde os cinco milimetros deixam de existir na conta de profundidade.
  //
  // Quatro centimetros e oito vezes a folga anterior e continua invisivel: a
  // placa e chapa com adesivo, e adesivo de 4 cm de espessura ninguem ve de
  // frente.
  g.add(box(0.40, 0.14, 0.03, solid(0xe0453c, 0.6), 0, 0.52, 0))
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.12),
    textPlaneMat('OFERTA', { color: '#ffffff', glow: '#ff8b4a', emissiveIntensity: 0.5 }),
  )
  top.position.set(0, 0.52, 0.055)
  g.add(top)
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  // DEPOIS do traverse, de proposito: um plano de texto com alpha nao tem o que
  // fazer no mapa de sombra do sol, e mandar ele pra la e mais uma superficie
  // fina disputando profundidade — pelo mesmo motivo de tudo acima.
  top.castShadow = false
  return g
}

function buildCheckout(g, colliders, pool) {
  const rng = mulberry32(7331)
  const acx = (CNT_A.x0 + CNT_A.x1) / 2, acz = (CNT_A.z0 + CNT_A.z1) / 2
  const aw = CNT_A.x1 - CNT_A.x0, ad = CNT_A.z1 - CNT_A.z0
  const bcx = (CNT_B.x0 + CNT_B.x1) / 2, bcz = (CNT_B.z0 + CNT_B.z1) / 2
  const bw = CNT_B.x1 - CNT_B.x0, bd = CNT_B.z1 - CNT_B.z0

  // corpo das duas bancadas + tampo escuro
  for (const c of [[acx, acz, aw, ad], [bcx, bcz, bw, bd]]) {
    const body = roundedBox(c[2], CNT_H - 0.06, c[3], 0.05, M.counter)
    body.position.set(c[0], (CNT_H - 0.06) / 2, c[1])
    g.add(body)
    g.add(box(c[2] + 0.06, 0.06, c[3] + 0.06, M.counterTop, c[0], CNT_H - 0.03, c[1]))
    g.add(box(c[2] + 0.02, 0.10, c[3] + 0.02, M.accent, c[0], 0.05, c[1]))   // rodape verde
  }
  // faixa decorativa na frente do balcao (lado do cliente)
  g.add(box(aw - 0.2, 0.10, 0.02, M.accent, acx, 0.62, CNT_A.z1 + 0.005))

  // esteira preta com rolos nas pontas
  const beltL = 2.2
  const beltX = acx - 0.8
  const belt = box(beltL, 0.03, 0.50, M.rubber, beltX, CNT_H + 0.015, acz)
  g.add(belt)
  for (const s of [-1, 1]) {
    const roll = cyl(0.035, 0.035, 0.50, M.steel, 12)
    roll.rotation.x = Math.PI / 2
    roll.position.set(beltX + s * beltL / 2, CNT_H + 0.015, acz)
    g.add(roll)
  }
  // divisor de compras em cima da esteira
  const div = box(0.36, 0.05, 0.05, solid(0xe0453c, 0.6), beltX - 0.6, CNT_H + 0.055, acz)
  div.rotation.y = 0.2
  g.add(div)

  // registradora, leitor e maquininha
  const reg = buildRegister()
  reg.position.set(acx + 1.35, CNT_H, acz - 0.03)
  reg.rotation.y = Math.PI
  g.add(reg)

  const sc = buildScanner()
  sc.position.set(acx + 0.55, CNT_H, acz)
  sc.rotation.y = Math.PI
  g.add(sc)

  const card = buildCardMachine()
  card.position.set(acx + 1.0, CNT_H, CNT_A.z1 - 0.12)
  card.rotation.y = Math.PI * 0.95
  g.add(card)

  // expositor de chicletes/balas na ponta da bancada
  const candyX = CNT_A.x0 + 0.28
  const candy = buildCandyRack()
  candy.position.set(candyX, CNT_H, acz)
  candy.rotation.y = Math.PI
  g.add(candy)
  // conteudo do expositor: caixinhas coloridas instanciadas
  for (let i = 0; i < 3; i++) {
    const y = CNT_H + 0.15 + i * 0.15
    for (let j = 0; j < 6; j++) {
      const px = candyX - 0.15 + j * 0.06
      push(pool.boxes, px, y + 0.045, acz + 0.02, Math.PI + rr(rng, -0.1, 0.1),
        0.052, 0.09, 0.035, pick(rng, PRODUCT_COLORS))
    }
  }

  // sacolas: rolo pendurado + pilha dobrada
  const bagMat = stdMat('groc-bag', { color: 0xf2f6f8, roughness: 0.45, transparent: true, opacity: 0.85 })
  // suporte de sacolas em T, apoiado na perna do L
  const hookX = CNT_B.x0 + 0.40
  const hookZ = bcz + 0.85
  g.add(box(0.05, 0.42, 0.05, M.steel, hookX, CNT_H + 0.21, hookZ))
  g.add(box(0.05, 0.05, 0.44, M.steel, hookX, CNT_H + 0.40, hookZ))
  for (let i = 0; i < 5; i++) {
    const bag = roundedBox(0.30, 0.34, 0.05, 0.05, bagMat)
    bag.position.set(hookX, CNT_H + 0.20, hookZ + 0.16 - i * 0.075)
    bag.rotation.y = Math.PI / 2
    g.add(bag)
  }
  const bagStack = roundedBox(0.34, 0.06, 0.26, 0.03, bagMat)
  bagStack.position.set(acx + 1.9, CNT_H + 0.06, acz - 0.10)
  g.add(bagStack)

  // pote de moedas e um jornalzinho, so pra sujar a mesa
  const jar = cyl(0.07, 0.075, 0.09, glass(0xd8ecf5, 0.4), 14)
  jar.position.set(acx + 1.85, CNT_H + 0.075, acz + 0.20)
  g.add(jar)
  const paper = box(0.28, 0.012, 0.20, solid(0xe8e4d8, 0.9), beltX - 0.75, CNT_H + 0.045, acz + 0.02)
  paper.rotation.y = 0.3
  g.add(paper)

  colliders.push({ minX: CNT_A.x0, maxX: CNT_A.x1, minZ: CNT_A.z0, maxZ: CNT_A.z1, tag: 'counter-a' })
  colliders.push({ minX: CNT_B.x0, maxX: CNT_B.x1, minZ: CNT_B.z0, maxZ: CNT_B.z1, tag: 'counter-b' })
}

/** Avental do uniforme, preso na raiz do NPC (a raiz fica nos pes). */
function makeApron() {
  const g = new THREE.Group()
  const cloth = solid(0x1f7a45, 0.85)
  const bib = roundedBox(0.30, 0.28, 0.05, 0.04, cloth)
  bib.position.set(0, 1.24, 0.135)
  g.add(bib)
  const skirt = roundedBox(0.40, 0.44, 0.06, 0.05, cloth)
  skirt.position.set(0, 0.95, 0.145)
  g.add(skirt)
  // alcas
  for (const s of [-1, 1]) {
    const strap = box(0.05, 0.30, 0.03, cloth, s * 0.11, 1.45, 0.09)
    strap.rotation.x = -0.12
    g.add(strap)
  }
  g.add(box(0.44, 0.05, 0.09, solid(0x146034, 0.85), 0, 1.10, 0.13))  // cinta
  // bolso
  g.add(box(0.22, 0.13, 0.03, solid(0x2a8f52, 0.85), 0, 0.90, 0.185))
  // cracha
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), textPlaneMat('MARA', {
    w: 512, h: 192, color: '#1f2429', bg: '#f4f2ea', font: 'bold 110px "Trebuchet MS", sans-serif', emissiveIntensity: 0.1,
  }))
  tag.position.set(0.045, 1.30, 0.166)
  g.add(tag)
  g.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return g
}

function buildClerk(g, colliders) {
  let npc = null
  try {
    // chaves que npc.js realmente le: x/y/z, rotY, pose, name, appearance,
    // skin/shirt/pants/shoes, scale. (hairColor vai DENTRO de appearance,
    // e um indice em HAIR_COLORS, nao um hexadecimal.)
    npc = createNPC({
      name: 'Mara',
      pose: 'work',
      x: CLERK.x, y: 0, z: CLERK.z,   // y=0 local: o grupo da loja ja sobe pra BASE
      rotY: 0,                        // olhando para +Z, ou seja, pro cliente
      shirt: 0x2f9e57,
      pants: 0x2b3540,
      shoes: 0xf0f0ee,
      appearance: {
        cabeca: 4, olhos: 2, nariz: 0, boca: 0, barba: 3,
        cabelo: 2, pele: 3, corCabelo: 0, corBarba: 6, sobrancelha: 1,
        chapeu: 0, calcado: 1, blusa: 3, calca: 0,
      },
    })
  } catch (e) { npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  root.add(makeApron())
  g.add(root)

  // A Mara nasce vestida e nunca mais troca de aparencia (ninguem chama
  // setAppearance/setPose nela), entao os ~75 meshes soltos dela viram um
  // punhado de meshes por junta. O forno preserva as JUNTAS, que e onde npc.js
  // escreve a respiracao, o balanco, o giro do braco e a piscada — a atendente
  // continua se mexendo igual. Vem DEPOIS do avental, senao ele fica de fora.
  if (npc.character && npc.character.parts) {
    congelarPersonagem(root, { juntas: npc.character.parts })
  }

  // colisor 0.6 x 0.6: o jogador para de atravessar a atendente
  colliders.push({
    minX: CLERK.x - 0.3, maxX: CLERK.x + 0.3,
    minZ: CLERK.z - 0.3, maxZ: CLERK.z + 0.3, tag: 'clerk',
  })
  return npc
}

function buildEntranceProps(g, colliders, pool) {
  const rng = mulberry32(2024)
  const door = GROCERY.door

  // tapete de entrada
  const mat = box(2.8, 0.02, 1.5, M.rubber, door.center, 0.011, IN.z1 - 0.95)
  g.add(mat)
  const matTxt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), textPlaneMat('BEM-VINDO', {
    color: '#cfd6da', font: 'bold 120px "Trebuchet MS", sans-serif', emissiveIntensity: 0.05,
  }))
  matTxt.rotation.x = -Math.PI / 2
  matTxt.position.set(door.center, 0.023, IN.z1 - 0.95)
  g.add(matTxt)

  // cestas de compras empilhadas
  const basketMat = solid(0xd6453c, 0.6)
  const bx = -27.4, bz = IN.z1 - 1.3
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group()
    b.position.set(bx, 0.15 + i * 0.13, bz)
    b.rotation.y = rr(rng, -0.12, 0.12)
    const shell = roundedBox(0.44, 0.24, 0.32, 0.05, basketMat)
    b.add(shell)
    const hollow = box(0.36, 0.16, 0.24, solid(0x8e2a24, 0.7), 0, 0.06, 0)
    b.add(hollow)
    b.add(box(0.30, 0.03, 0.03, M.darkSteel, 0, 0.16, 0))   // alca
    b.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    g.add(b)
  }
  colliders.push({ minX: bx - 0.28, maxX: bx + 0.28, minZ: bz - 0.22, maxZ: bz + 0.22, tag: 'baskets' })

  // carrinhos de compras (encaixados um atras do outro, como na entrada de mercado)
  g.add(placeProp(Props.makeShoppingCart(), -29.0, IN.z1 - 1.9, -0.5))
  g.add(placeProp(Props.makeShoppingCart(), -29.5, IN.z1 - 2.7, -0.42))

  // caixa de frutas e verduras (dois caixotes inclinados)
  const crateMat = M.wood
  const produce = [
    { x: -31.6, z: IN.z1 - 1.6, seed: 61, cols: [0xe8622f, 0xf2b632, 0xd63b3b] },
    { x: -33.4, z: IN.z1 - 1.6, seed: 62, cols: [0x6fbf4a, 0x9ed455, 0x3f8f3a] },
  ]
  for (const p of produce) {
    const stand = new THREE.Group()
    stand.position.set(p.x, 0, p.z)
    // pes + caixote inclinado pro cliente ver a fruta
    stand.add(box(1.5, 0.06, 0.9, crateMat, 0, 0.60, 0))
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      stand.add(box(0.08, 0.60, 0.08, crateMat, sx * 0.68, 0.30, sz * 0.38))
    }
    const bin = new THREE.Group()
    bin.position.set(0, 0.68, 0)
    bin.rotation.x = -0.16
    bin.add(box(1.44, 0.05, 0.86, crateMat, 0, 0, 0))
    for (const s of [-1, 1]) bin.add(box(0.05, 0.20, 0.86, crateMat, s * 0.70, 0.10, 0))
    bin.add(box(1.44, 0.24, 0.05, crateMat, 0, 0.12, 0.42))
    bin.add(box(1.44, 0.14, 0.05, crateMat, 0, 0.07, -0.42))
    stand.add(bin)

    // frutas: esferas deterministicas em 2 camadas
    const frng = mulberry32(p.seed)
    const fruitGeo = new THREE.SphereGeometry(1, 10, 8)
    const fruits = []
    for (let i = 0; i < 46; i++) {
      const fx = rr(frng, -0.62, 0.62)
      const fz = rr(frng, -0.34, 0.34)
      const r = rr(frng, 0.045, 0.075)
      fruits.push({ fx, fz, r, c: pick(frng, p.cols), layer: i > 30 ? 1 : 0 })
    }
    const im = new THREE.InstancedMesh(fruitGeo, M.prod, fruits.length)
    im.castShadow = true; im.receiveShadow = true
    const d = new THREE.Object3D()
    const col = new THREE.Color()
    fruits.forEach((f, i) => {
      d.position.set(f.fx, 0.06 + f.r + f.layer * 0.09, f.fz)
      d.rotation.set(rr(frng, 0, 3), rr(frng, 0, 3), 0)
      d.scale.setScalar(f.r)
      d.updateMatrix()
      im.setMatrixAt(i, d.matrix)
      im.setColorAt(i, col.setHex(f.c))
    })
    im.instanceMatrix.needsUpdate = true
    if (im.instanceColor) im.instanceColor.needsUpdate = true
    bin.add(im)

    // plaquinha de preco espetada
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), textPlaneMat('R$ 4,99 kg', {
      w: 512, h: 192, color: '#1f2429', bg: '#ffe08a', font: 'bold 92px "Trebuchet MS", sans-serif', emissiveIntensity: 0.1,
    }))
    sign.position.set(0.42, 0.86, 0.44)
    sign.rotation.x = -0.25
    stand.add(sign)

    stand.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    g.add(stand)
    colliders.push({ minX: p.x - 0.78, maxX: p.x + 0.78, minZ: p.z - 0.5, maxZ: p.z + 0.5, tag: 'produce' })
  }

  // pilha de caixotes no canto direito do fundo
  const stackX = -17.2, stackZ = -26.6
  const crateGeo = new THREE.BoxGeometry(0.62, 0.40, 0.46)
  const slatGeo = new THREE.BoxGeometry(0.66, 0.05, 0.05)
  const stack = [[0, 0, 0], [0.05, 0.42, 0.03], [-0.04, 0.84, -0.02], [0.6, 0, 0.35], [0.62, 0.42, 0.33]]
  for (const [ox, oy, oz] of stack) {
    const c = new THREE.Mesh(crateGeo, crateMat)
    c.position.set(stackX + ox, 0.20 + oy, stackZ + oz)
    c.rotation.y = rr(rng, -0.2, 0.2)
    c.castShadow = true; c.receiveShadow = true
    g.add(c)
    for (const yy of [-0.13, 0.13]) {
      const s = new THREE.Mesh(slatGeo, solid(0x7d552e, 0.85))
      s.position.set(c.position.x, c.position.y + yy, c.position.z + 0.005)
      s.rotation.y = c.rotation.y
      s.castShadow = true; s.receiveShadow = true
      g.add(s)
    }
  }
  colliders.push({ minX: stackX - 0.45, maxX: stackX + 1.05, minZ: stackZ - 0.35, maxZ: stackZ + 0.65, tag: 'crates' })
}

function buildSignageAndDetails(g) {
  // placas de setor penduradas sobre os corredores
  const signs = [
    { x: -30.0, t: 'MERCEARIA', c: 0x2f9e57 },
    { x: -26.0, t: 'LIMPEZA', c: 0x2f6fd0 },
    { x: -22.0, t: 'BEBIDAS', c: 0xd6453c },
  ]
  for (const s of signs) {
    const u = new THREE.Group()
    u.position.set(s.x, 3.02, -24.0)
    const board = box(2.3, 0.5, 0.07, solid(s.c, 0.55), 0, 0, 0)
    u.add(board)
    // 0.28 e nao 0.45: o letreiro nao precisa competir com a lampada do teto,
    // e emissivo alto aqui so aproxima o pixel do limiar de bloom.
    const face = textPlaneMat(s.t, { color: '#ffffff', glow: '#ffffff', emissiveIntensity: 0.28 })
    for (const sz of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.4), face)
      // 0.052 contra a face da chapa em 0.035 = 17 mm de folga. Os 6 mm de
      // antes nao sobrevivem a precisao do z-buffer vista do outro lado da loja.
      p.position.z = sz * 0.052
      if (sz < 0) p.rotation.y = Math.PI
      u.add(p)
    }
    // Tirantes ate o forro. 18 mm e nao 8: a 15 m de distancia um cilindro de
    // 8 mm ocupa MENOS de um pixel na tela, e um traco sub-pixel nao tem como
    // ser desenhado de forma estavel — ele aparece e some conforme a camera
    // anda. E o mesmo motivo pelo qual as hastes dos pendentes da loja de jogos
    // subiram de 16 pra 30 mm. Nao e iluminacao, e tamanho.
    const cableLen = (CEIL_Y - 0.02) - (3.02 + 0.25)
    for (const sx of [-1, 1]) {
      const cable = cyl(0.018, 0.018, cableLen, M.steel, 6)
      cable.position.set(sx * 0.9, 0.25 + cableLen / 2, 0)
      u.add(cable)
    }
    u.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    g.add(u)
  }

  // cartazes de promocao nas paredes
  const posters = [
    { x: IN.x0 + 0.06, y: 2.1, z: -16.0, ry: Math.PI / 2, seed: 3 },
    { x: IN.x0 + 0.06, y: 2.1, z: -18.4, ry: Math.PI / 2, seed: 5 },
    { x: IN.x1 - 0.06, y: 2.2, z: -18.5, ry: -Math.PI / 2, seed: 7 },
    { x: -25.0, y: 2.6, z: IN.z0 + 0.06, ry: 0, seed: 9 },
  ]
  for (const p of posters) {
    // assinatura real: makeFramedPicture(w, h, kind, seed)
    const pic = Props.makeFramedPicture(1.0, 1.0, 'sale', p.seed)
    pic.position.set(p.x, p.y, p.z)
    pic.rotation.y = p.ry
    pic.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
    g.add(pic)
  }

  // camera de seguranca no canto da entrada
  const cam = new THREE.Group()
  cam.position.set(IN.x0 + 0.35, 3.55, IN.z1 - 0.35)
  cam.add(box(0.06, 0.06, 0.22, M.plate, 0, 0, -0.10))
  const bodyC = roundedBox(0.13, 0.12, 0.28, 0.03, M.plate)
  bodyC.rotation.x = 0.35
  cam.add(bodyC)
  const lens = cyl(0.045, 0.05, 0.06, solid(0x14181c, 0.3), 12)
  lens.rotation.x = Math.PI / 2 + 0.35
  lens.position.set(0, -0.05, 0.15)
  cam.add(lens)
  cam.add(box(0.02, 0.02, 0.02, emissive(0xff3b30, 2.0), 0.05, 0.03, 0.12))
  cam.rotation.y = Math.PI * 0.75   // do canto da entrada, apontando pro miolo da loja
  cam.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  g.add(cam)

  // extintor com suporte e placa
  const ext = new THREE.Group()
  ext.position.set(-22.4, 0, IN.z1 - 0.16)
  const red = solid(0xc02a22, 0.45)
  ext.add(cyl(0.085, 0.085, 0.42, red, 14).translateY(0.95))
  ext.add(cyl(0.085, 0.06, 0.08, red, 14).translateY(1.19))
  ext.add(cyl(0.02, 0.02, 0.07, M.darkSteel, 10).translateY(1.26))
  ext.add(box(0.13, 0.03, 0.03, M.darkSteel, 0.04, 1.30, 0))
  const hose = cyl(0.012, 0.012, 0.26, M.rubber, 8)
  hose.rotation.z = 0.5
  hose.position.set(0.10, 1.05, 0.02)
  ext.add(hose)
  ext.add(box(0.16, 0.05, 0.10, M.darkSteel, 0, 1.02, -0.06))     // suporte
  const es = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), textPlaneMat('EXT', {
    w: 256, h: 256, color: '#ffffff', bg: '#c02a22', font: 'bold 110px "Trebuchet MS", sans-serif', emissiveIntensity: 0.15,
  }))
  es.position.set(0, 1.62, -0.02)
  ext.add(es)
  ext.rotation.y = Math.PI
  ext.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  g.add(ext)

  // faixa de aviso no chao na frente do caixa
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.22), textPlaneMat('AGUARDE AQUI', {
    color: '#e8c33d', font: 'bold 90px "Trebuchet MS", sans-serif', emissiveIntensity: 0.1,
  }))
  lane.rotation.x = -Math.PI / 2
  lane.position.set(-20.6, 0.02, -14.6)
  g.add(lane)
}

// ---------------------------------------------------------------------------
// Builder principal
// ---------------------------------------------------------------------------
export function buildGrocery(game) {
  const group = new THREE.Group()
  group.name = 'grocery-interior'
  const colliders = []
  const interactables = []
  const lights = []
  const fixtures = {}
  const pool = newPool()

  buildFloorAndTrim(group)
  buildCeilingAndLights(group, lights, fixtures)
  buildGondolas(group, colliders, pool)
  buildWallShelves(group, colliders, pool)
  buildFridges(group, colliders, pool)
  buildCheckout(group, colliders, pool)
  buildEntranceProps(group, colliders, pool)
  buildSignageAndDetails(group)

  // todos os produtos viram ~8 InstancedMesh (draw calls sob controle)
  buildProductMeshes(pool, group)

  const npc = buildClerk(group, colliders)

  // sobe o interior inteiro (piso, moveis, NPC, luzes) pro nivel de piso de loja
  group.position.y = BASE

  interactables.push({
    id: 'grocery-clerk',
    position: new THREE.Vector3(-20.6, BASE + 1.0, -15.3),
    radius: 2.4,
    label: 'Falar com a atendente',
    onInteract: (gm) => gm.toast('Atendente: bem-vindo a mercearia! Da uma olhada.'),
  })
  // --- A VENDA DE BEBIDA -----------------------------------------------------
  //
  // Era um toast mentiroso ("Voce comprou um refrigerante. -R$ 5") que nao
  // cobrava nada e nao entregava nada. Agora abre a MESMA janela de loja do Taco
  // de Ouro (src/ui/loja-ui.js), com o catalogo de bebidas no lugar do de
  // mobilia — a regra de compra, o carrinho e a conferencia de vaga sao os
  // mesmos, porque sao o mesmo modulo.
  //
  // Este arquivo nao importa UI nenhuma: chama por `gm.mercado`, do mesmo jeito
  // que o interior da loja de jogos chama `gm.loja` e o cassino chama
  // `gm.cassino`. Quem monta a janela e o main.
  //
  // TRES PORTAS pra mesma loja, e nao uma: o caixa (quem chega pra pagar) e as
  // DUAS geladeiras rotuladas BEBIDAS (quem chega pela prateleira). Foi a
  // mesma decisao da loja de jogos — "os itens tb devem estar a vista" —, e ela
  // e o que faz a geladeira ser jogo e nao cenario.
  function abrirMercado(gm, foco) {
    if (gm.mercado && typeof gm.mercado.abrir === 'function') gm.mercado.abrir(foco)
    else gm.toast('Atendente: as bebidas estao na geladeira do fundo.')
  }

  interactables.push({
    id: 'grocery-buy',
    position: new THREE.Vector3(-17.6, BASE + 1.0, -15.3),
    radius: 2.0,
    label: 'Comprar bebida',
    onInteract: (gm) => abrirMercado(gm),
  })

  // As geladeiras de indice 2 e 3 sao as que levam o letreiro BEBIDAS (ver
  // buildFridges); as duas primeiras dizem GELADOS. O ponto fica na FRENTE do
  // vidro, meio metro pra fora da porta, e na altura da prateleira do meio: a
  // interacao pesa o Y pela metade, entao ai o rotulo aparece na hora certa
  // tambem em primeira pessoa.
  const zVitrine = IN.z0 + FRIDGE_D + 0.55
  const PORTAS = [
    { x: FRIDGE_X[2], foco: 'cerveja-lata' },
    { x: FRIDGE_X[3], foco: 'whiskey-garrafa' },
  ]
  for (let i = 0; i < PORTAS.length; i++) {
    const porta = PORTAS[i]
    const b = bebidaDe(porta.foco)
    interactables.push({
      id: 'grocery-geladeira-' + i,
      position: new THREE.Vector3(porta.x, BASE + 1.15, zVitrine),
      radius: 1.9,
      label: b ? ('Pegar: ' + b.nome + ' — ' + b.preco) : 'Geladeira de bebidas',
      onInteract: (gm) => abrirMercado(gm, porta.foco),
    })
  }

  // ---- animacao do modulo -------------------------------------------------
  // npc.js le target.matrixWorld, entao o alvo TEM que ser um Object3D.
  let lookObj = null
  function playerLookTarget(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  let t = 0

  function update(dt, gm) {
    t += dt

    // atendente vira a cabeca pro jogador quando ele chega perto
    if (npc) {
      const p = gm && gm.player && gm.player.position
      if (p) {
        const dx = p.x - CLERK.x, dz = p.z - CLERK.z
        const d2 = dx * dx + dz * dz
        if (d2 < 49) {
          const tgt = playerLookTarget(gm)
          if (tgt) npc.lookTarget = tgt
        } else if (npc.lookTarget) {
          npc.lookTarget = null
        }
      }
      if (typeof npc.update === 'function') npc.update(dt)
    }

    // A fluorescente de mau contato saiu. Era juice de proposito — uma calha
    // piscando no meio do salao — mas o dono a leu como defeito duas vezes
    // ("ela fica piscando quando vejo de longe") e pediu pra tirar. Uma luz que
    // pisca de proposito e indistinguivel de uma luz com bug: quem joga nao tem
    // como saber a diferenca, e o beneficio nao paga a duvida.
  }

  return { group, colliders, interactables, update }
}
