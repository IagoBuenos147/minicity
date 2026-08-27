import * as THREE from 'three'
import { AGARRAVEIS, TIPOS_AGARRAVEL } from '../comum/mundo.js'
import { solid, box, cyl, roundedBox, woodTex, PALETTE } from './materials.js'

// ---------------------------------------------------------------------------
// Os objetos que o anel verde consegue levitar.
//
// A lista mora em src/comum/mundo.js porque o SERVIDOR precisa da mesma lista,
// com os mesmos ids. Aqui so montamos o mesh de cada um. Se este arquivo e o
// servidor discordarem sobre um id, o objeto some ou levita sozinho — entao a
// fonte e uma so, e e la.
//
// Estes meshes NAO entram no forno de geometria (bake) do city.js: eles se
// mexem. Cada um fica solto na cena, com o id no userData.
// ---------------------------------------------------------------------------

function mkCaixote(t) {
  const g = new THREE.Group()
  const mad = solid(t.cor, 0.85, 0, { map: woodTex(1) })
  const escuro = solid(0x4a3520, 0.9)
  const w = t.w, h = t.h, d = t.d
  // caixa vazada: 4 laterais de ripa + tampo, pra ler como engradado de feira
  const rip = 0.055
  for (const [sx, sz] of [[0, -d / 2], [0, d / 2]]) {
    for (let i = 0; i < 3; i++) {
      const y = -h / 2 + rip / 2 + i * (h - rip) / 2
      g.add(box(w, rip, 0.05, mad, sx, y, sz))
    }
  }
  for (const [sx, sz] of [[-w / 2, 0], [w / 2, 0]]) {
    for (let i = 0; i < 3; i++) {
      const y = -h / 2 + rip / 2 + i * (h - rip) / 2
      g.add(box(0.05, rip, d, mad, sx, y, sz))
    }
  }
  // cantoneiras
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.06, h, 0.06, escuro, sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.02)))
  }
  g.add(box(w - 0.08, 0.045, d - 0.08, mad, 0, h / 2 - 0.02, 0))
  return g
}

function mkCaixa(t) {
  const g = new THREE.Group()
  const pap = solid(t.cor, 0.95)
  const fita = solid(0xc8ab72, 0.9)
  g.add(roundedBox(t.w, t.h, t.d, 0.03, pap))
  // fita crepe no meio do tampo e nas quinas
  g.add(box(0.07, 0.006, t.d + 0.004, fita, 0, t.h / 2 + 0.002, 0))
  g.add(box(t.w + 0.004, 0.006, 0.07, fita, 0, t.h / 2 + 0.002, 0))
  return g
}

function mkLata(t) {
  const g = new THREE.Group()
  const met = solid(t.cor, 0.55, 0.5)
  const aro = solid(0x2a2f33, 0.5, 0.7)
  const r = t.w / 2
  const corpo = cyl(r * 0.92, r * 0.82, t.h, met, 18)
  g.add(corpo)
  // frisos horizontais: sem eles o cilindro le como lata de tinta lisa
  for (let i = 0; i < 3; i++) {
    const a = cyl(r * 0.95, r * 0.95, 0.03, aro, 18)
    a.position.y = -t.h / 2 + t.h * (0.28 + i * 0.24)
    g.add(a)
  }
  const tampa = cyl(r * 0.98, r * 0.94, 0.05, aro, 18)
  tampa.position.y = t.h / 2
  g.add(tampa)
  return g
}

function mkVaso(t) {
  const g = new THREE.Group()
  const barro = solid(t.cor, 0.9)
  const terra = solid(0x3a2a1c, 1)
  const folha = solid(0x4f7a3a, 0.85)
  const r = t.w / 2
  g.add(cyl(r, r * 0.7, t.h, barro, 16))
  const borda = cyl(r * 1.08, r * 1.05, 0.07, barro, 16)
  borda.position.y = t.h / 2 - 0.02
  g.add(borda)
  const solo = cyl(r * 0.92, r * 0.92, 0.04, terra, 16)
  solo.position.y = t.h / 2 - 0.03
  g.add(solo)
  // moita simples em cima
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), folha)
    b.position.set(Math.cos(a) * 0.13, t.h / 2 + 0.10 + (i % 2) * 0.05, Math.sin(a) * 0.13)
    b.castShadow = true; b.receiveShadow = true
    g.add(b)
  }
  return g
}

function mkCone(t) {
  const g = new THREE.Group()
  const lar = solid(t.cor, 0.8)
  const fx = solid(0xf2f2f2, 0.7)
  const r = t.w / 2
  g.add(box(r * 2, 0.05, r * 2, lar, 0, -t.h / 2 + 0.025, 0))
  const c = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72, t.h, 14, 1, true), lar)
  c.position.y = 0.02
  c.castShadow = true; c.receiveShadow = true
  g.add(c)
  for (const y of [0.05, -0.10]) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r * 0.72 * (1 - (y + 0.33) * 0.5), 0.09, 14, 1, true), fx)
    f.position.y = y
    g.add(f)
  }
  return g
}

function mkEngradado(t) {
  const g = new THREE.Group()
  const plas = solid(t.cor, 0.75)
  const w = t.w, h = t.h, d = t.d
  g.add(box(w, 0.04, d, plas, 0, -h / 2, 0))
  for (const sz of [-d / 2, d / 2]) g.add(box(w, h, 0.035, plas, 0, 0, sz))
  for (const sx of [-w / 2, w / 2]) g.add(box(0.035, h, d, plas, sx, 0, 0))
  // vazados nas laterais
  for (let i = 0; i < 2; i++) {
    g.add(box(w * 0.7, 0.03, 0.05, plas, 0, -h / 4 + i * h / 2, -d / 2 - 0.01))
  }
  return g
}

const FABRICAS = {
  caixote: mkCaixote, caixa: mkCaixa, lata: mkLata,
  vaso: mkVaso, cone: mkCone, engradado: mkEngradado,
}

/**
 * Constroi todos os objetos agarraveis e devolve BuildResult + o mapa id->mesh
 * pro anel registrar. Nao gera colisor: objeto que levita nao pode virar parede
 * (e ele some quando e destruido).
 */
export function buildAgarraveis() {
  const group = new THREE.Group()
  group.name = 'agarraveis'
  group.userData.dynamic = true      // fora do forno de geometria: eles se mexem
  const meshes = new Map()

  for (const def of AGARRAVEIS) {
    const t = TIPOS_AGARRAVEL[def.tipo]
    if (!t) { console.warn('tipo agarravel desconhecido:', def.tipo); continue }
    const fab = FABRICAS[def.tipo] || mkCaixa
    const m = fab(t)
    m.position.set(def.x, def.y, def.z)
    m.rotation.y = ((def.id * 2654435761) % 1000) / 1000 * Math.PI * 2  // giro estavel por id
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    // o ID mora aqui: e por ele que a rede e o anel falam deste objeto
    m.userData.agarravelId = def.id
    m.userData.tipo = def.tipo
    m.userData.origem = { x: def.x, y: def.y, z: def.z }
    group.add(m)
    meshes.set(def.id, m)
  }

  return { group, colliders: [], interactables: [], meshes }
}

export default buildAgarraveis
