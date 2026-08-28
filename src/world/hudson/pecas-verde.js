// ---------------------------------------------------------------------------
// src/world/hudson/pecas-verde.js — a vegetacao do bairro.
//
// As especies saem das fichas das 35 fotos, e nao de um catalogo generico. A
// mais citada de longe e a de "copa pendente, folhagem fina verde-clara, tronco
// grosso bifurcado" — aroeira-salsa (ou chorao, como o povo chama). Depois vem
// o coqueiro isolado no recuo, a mangueira de copa densa passando por cima do
// muro, o cajueiro do terreno baldio e a tuia colunar de jardim.
//
// Reaproveita a maquinaria de folhagem de world/props.js (limbGeo, tuftGeo,
// foliageClump, leafMat) de proposito: a paleta de folha e FECHADA no jogo
// inteiro, e o forno de geometria funde por material. Uma arvore nova com um
// verde novo custaria uma draw call a mais em toda a cidade.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid } from '../materials.js'
import { limbGeo, tuftGeo, foliageClump, leafMat } from '../props.js'

const PI = Math.PI

function rng(seed) {
  let s = (seed | 0) >>> 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CASCA_CLARA = () => solid(0x9a8b76, 0.95)   // aroeira, coqueiro
const CASCA_ESCURA = () => solid(0x5b4a3c, 0.95)  // mangueira, cajueiro

// ---------------------------------------------------------------------------
// AROEIRA-SALSA / CHORAO — a arvore de rua do bairro
// ---------------------------------------------------------------------------

/**
 * Copa larga e PENDENTE, folhagem fina e clara, tronco grosso que se bifurca
 * baixo. O que faz esta arvore ser ela: a copa cai ABAIXO do ponto em que os
 * galhos saem. Uma copa que so sobe vira mangueira.
 */
export function aroeiraSalsa(seed = 0) {
  const g = new THREE.Group()
  const r = rng(seed + 17)
  const casca = CASCA_CLARA()
  const H = 6.4 + r() * 2.6
  const rTronco = 0.19 + r() * 0.09

  // tronco curto e a bifurcacao baixa (1,4 a 2,2 m), que e a marca da especie
  const yBif = H * (0.20 + r() * 0.08)
  const tronco = new THREE.Mesh(limbGeo([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3((r() - 0.5) * 0.18, yBif * 0.55, (r() - 0.5) * 0.18),
    new THREE.Vector3((r() - 0.5) * 0.3, yBif, (r() - 0.5) * 0.3),
  ], rTronco, rTronco * 0.82, 7, 4), casca)
  tronco.castShadow = true
  g.add(tronco)

  // 3 a 4 pernadas saindo da bifurcacao, abrindo bem
  const nP = 3 + Math.floor(r() * 2)
  const pontas = []
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * PI * 2 + r() * 0.7
    const alc = 1.9 + r() * 1.5
    const topo = yBif + (1.9 + r() * 1.4)
    const px = Math.cos(a) * alc, pz = Math.sin(a) * alc
    const perna = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, yBif, 0),
      new THREE.Vector3(px * 0.4, yBif + (topo - yBif) * 0.55, pz * 0.4),
      new THREE.Vector3(px * 0.82, topo, pz * 0.82),
      new THREE.Vector3(px, topo + 0.35, pz),
    ], rTronco * 0.62, rTronco * 0.14, 6, 5), casca)
    perna.castShadow = true
    g.add(perna)
    pontas.push({ x: px, y: topo + 0.3, z: pz })
  }

  // A COPA. A folha da aroeira e MINUSCULA — folha composta de foliolo de 2 cm.
  // A primeira versao usou tufo de 0,40 de raio (bola de 80 cm) e a arvore virou
  // um cacho de uva gigante. O tufo aqui tem 14 a 20 cm, e sao MUITOS: e a
  // quantidade, e nao o tamanho, que le como folhagem fina.
  for (const p of pontas) {
    foliageClump(g, p.x * 0.95, p.y - 0.35, p.z * 0.95,
      1.4 + r() * 0.6, 0.17 + r() * 0.06, 46 + Math.floor(r() * 18), 3, r, 0.7)
    // as franjas que descem: e isso que faz a copa "chorar"
    const nf = 22 + Math.floor(r() * 12)
    for (let k = 0; k < nf; k++) {
      const a = r() * PI * 2
      const d = r() * 1.3
      const t = new THREE.Mesh(tuftGeo(k % 6), leafMat(4 + Math.round(r())))
      const s = 0.10 + r() * 0.07
      t.position.set(p.x * 0.95 + Math.cos(a) * d, p.y - 0.8 - r() * 1.7, p.z * 0.95 + Math.sin(a) * d)
      t.scale.set(s, s * 2.1, s)         // esticado pra baixo: folha pendente
      t.rotation.set(r() * 0.4, r() * 6, r() * 0.4)
      t.castShadow = true
      g.add(t)
    }
  }
  // miolo, pra nao aparecer buraco entre as pernadas
  foliageClump(g, 0, yBif + 1.9, 0, 1.4, 0.19, 34, 2, r, 0.76)

  g.userData.altura = H
  return g
}

// ---------------------------------------------------------------------------
// COQUEIRO
// ---------------------------------------------------------------------------

/** Estipe anelado inclinado e coroa de folhas pinadas. */
export function coqueiro(seed = 0) {
  const g = new THREE.Group()
  const r = rng(seed + 29)
  const H = 7.5 + r() * 3.4
  const incl = (r() - 0.5) * 0.24
  const ax = Math.cos(r() * 6) * incl, az = Math.sin(r() * 6) * incl

  const estipe = new THREE.Mesh(limbGeo([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(ax * H * 0.35, H * 0.35, az * H * 0.35),
    new THREE.Vector3(ax * H * 0.72, H * 0.72, az * H * 0.72),
    new THREE.Vector3(ax * H, H, az * H),
  ], 0.20, 0.135, 8, 6), solid(0x9d9080, 0.94))
  estipe.castShadow = true
  g.add(estipe)

  // OS ANEIS: o estipe do coqueiro e marcado de cicatriz de folha caida
  const anel = new THREE.TorusGeometry(0.155, 0.017, 3, 9)
  const matAnel = solid(0x89806f, 0.95)
  const nA = Math.floor(H / 0.42)
  for (let i = 1; i < nA; i++) {
    const t = i / nA
    const m = new THREE.Mesh(anel, matAnel)
    m.position.set(ax * H * t, H * t, az * H * t)
    m.rotation.x = PI / 2
    m.scale.setScalar(1.05 - t * 0.3)
    g.add(m)
  }

  // A COROA: 9 a 12 folhas pinadas, as de fora caidas e as de dentro erguidas
  const topo = new THREE.Vector3(ax * H, H, az * H)
  const nF = 9 + Math.floor(r() * 4)
  for (let i = 0; i < nF; i++) {
    const a = (i / nF) * PI * 2 + r() * 0.3
    const queda = -0.15 - r() * 0.95          // radianos abaixo da horizontal
    const comp = 2.5 + r() * 1.1
    const cx = Math.cos(a), cz = Math.sin(a)
    // a raque, curvada
    const raque = new THREE.Mesh(limbGeo([
      new THREE.Vector3(topo.x, topo.y, topo.z),
      new THREE.Vector3(topo.x + cx * comp * 0.4, topo.y + comp * 0.22, topo.z + cz * comp * 0.4),
      new THREE.Vector3(topo.x + cx * comp * 0.78, topo.y + comp * 0.22 + queda * comp * 0.3, topo.z + cz * comp * 0.78),
      new THREE.Vector3(topo.x + cx * comp, topo.y + queda * comp * 0.75, topo.z + cz * comp),
    ], 0.035, 0.012, 4, 5), solid(0x6d7a48, 0.9))
    g.add(raque)
    // os foliolos: tufos esticados ao longo da raque
    const nL = 7
    for (let k = 1; k <= nL; k++) {
      const t = k / (nL + 1)
      const px = topo.x + cx * comp * t
      const py = topo.y + comp * 0.22 * Math.sin(t * PI) + queda * comp * t * t * 0.8
      const pz = topo.z + cz * comp * t
      const f = new THREE.Mesh(tuftGeo(k % 6), leafMat(2 + (k % 3)))
      const larg = 0.30 * Math.sin(t * PI) + 0.10
      f.position.set(px, py, pz)
      f.scale.set(comp * 0.11, larg * 0.5, larg)
      f.rotation.set(0, a, queda * 0.5)
      f.castShadow = true
      g.add(f)
    }
  }
  g.userData.altura = H
  return g
}

// ---------------------------------------------------------------------------
// MANGUEIRA
// ---------------------------------------------------------------------------

/** Copa densa, escura, arredondada e baixa. A arvore de quintal do Brasil. */
export function mangueira(seed = 0) {
  const g = new THREE.Group()
  const r = rng(seed + 41)
  const H = 7.0 + r() * 2.8
  const casca = CASCA_ESCURA()
  const rT = 0.27 + r() * 0.1

  const yBif = H * 0.26
  g.add((() => {
    const m = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((r() - 0.5) * 0.2, yBif * 0.6, (r() - 0.5) * 0.2),
      new THREE.Vector3((r() - 0.5) * 0.28, yBif, (r() - 0.5) * 0.28),
    ], rT, rT * 0.8, 8, 4), casca)
    m.castShadow = true
    return m
  })())

  const nP = 4 + Math.floor(r() * 2)
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * PI * 2 + r() * 0.6
    const alc = 1.5 + r() * 1.2
    const topo = yBif + 2.2 + r() * 1.4
    const px = Math.cos(a) * alc, pz = Math.sin(a) * alc
    const perna = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, yBif, 0),
      new THREE.Vector3(px * 0.45, yBif + (topo - yBif) * 0.6, pz * 0.45),
      new THREE.Vector3(px, topo, pz),
    ], rT * 0.6, rT * 0.18, 6, 4), casca)
    perna.castShadow = true
    g.add(perna)
    foliageClump(g, px * 0.9, topo + 0.5, pz * 0.9, 1.9 + r() * 0.6, 0.26 + r() * 0.08,
      52 + Math.floor(r() * 18), 0, r, 0.92)
  }
  // o miolo cheio: mangueira nao tem buraco no meio
  foliageClump(g, 0, yBif + 3.0, 0, 2.4, 0.30, 64, 0, r, 0.95)
  g.userData.altura = H
  return g
}

// ---------------------------------------------------------------------------
// CAJUEIRO
// ---------------------------------------------------------------------------

/** Copa larga e BAIXA, quase guarda-chuva, folha grande. Do terreno baldio. */
export function cajueiro(seed = 0) {
  const g = new THREE.Group()
  const r = rng(seed + 53)
  const H = 4.6 + r() * 1.8
  const casca = CASCA_ESCURA()
  const yBif = H * 0.30

  g.add((() => {
    const m = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3((r() - 0.5) * 0.3, yBif, (r() - 0.5) * 0.3),
    ], 0.2, 0.16, 7, 3), casca)
    m.castShadow = true
    return m
  })())

  const nP = 4
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * PI * 2 + r() * 0.8
    const alc = 2.0 + r() * 1.1        // abre MUITO: a copa e mais larga que alta
    const topo = yBif + 1.0 + r() * 0.7
    const px = Math.cos(a) * alc, pz = Math.sin(a) * alc
    const perna = new THREE.Mesh(limbGeo([
      new THREE.Vector3(0, yBif, 0),
      new THREE.Vector3(px * 0.5, yBif + (topo - yBif) * 0.7, pz * 0.5),
      new THREE.Vector3(px, topo, pz),
    ], 0.13, 0.045, 5, 4), casca)
    g.add(perna)
    // o cajueiro TEM folha grande (15 cm): tufo maior que o da aroeira, mas
    // nem de longe do tamanho que a primeira versao usou
    foliageClump(g, px * 0.92, topo + 0.35, pz * 0.92, 1.5 + r() * 0.5, 0.30 + r() * 0.08,
      30, 1, r, 0.66)
  }
  foliageClump(g, 0, yBif + 1.5, 0, 1.6, 0.30, 28, 1, r, 0.68)
  g.userData.altura = H
  return g
}

// ---------------------------------------------------------------------------
// TUIA / CIPRESTE
// ---------------------------------------------------------------------------

/** Colunar, escura, de jardim de frente de casa. */
export function tuia(seed = 0) {
  const g = new THREE.Group()
  const r = rng(seed + 67)
  const H = 2.6 + r() * 1.9
  const n = 9
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const raio = (1 - Math.pow(Math.abs(t - 0.35) * 1.5, 1.4)) * (0.52 + r() * 0.12)
    if (raio <= 0.05) continue
    foliageClump(g, 0, H * (0.08 + t * 0.9), 0, Math.max(0.12, raio), 0.13 + r() * 0.04,
      14, 0, r, 0.9)
  }
  g.userData.altura = H
  return g
}

// ---------------------------------------------------------------------------
// TREPADEIRA COM FLOR (primavera / manaca)
// ---------------------------------------------------------------------------

/**
 * A moita florida que passa por cima do muro. Nas fotos ela e magenta
 * (primavera) ou roxa (manaca) — e e ela que quebra o cinza da rua.
 */
export function trepadeiraFlorida({ largura = 2.6, seed = 0, cor = 0x9b3fa0 } = {}) {
  const g = new THREE.Group()
  const r = rng(seed + 71)
  const flor = solid(cor, 0.85)
  const n = Math.round(largura * 22)
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * largura
    const y = r() * 1.15
    const z = (r() - 0.5) * 0.7
    const folha = r() > 0.42
    const t = new THREE.Mesh(tuftGeo(i % 6), folha ? leafMat(1 + Math.round(r() * 2)) : flor)
    const s = 0.085 + r() * 0.075
    t.position.set(x, y, z)
    t.scale.set(s, s * (0.7 + r() * 0.5), s)
    t.rotation.set(r() * 3, r() * 6, r() * 3)
    t.castShadow = true
    g.add(t)
  }
  // as pontas que caem pro lado da rua
  for (let i = 0; i < 26; i++) {
    const t = new THREE.Mesh(tuftGeo(i % 6), r() > 0.5 ? flor : leafMat(2))
    const s = 0.07 + r() * 0.06
    t.position.set((r() - 0.5) * largura, -0.2 - r() * 0.85, 0.3 + r() * 0.3)
    t.scale.set(s, s * 1.4, s)
    g.add(t)
  }
  return g
}

/** Moita rasteira de quintal / canteiro. */
export function moita({ raio = 0.7, seed = 0, tone = 1 } = {}) {
  const g = new THREE.Group()
  const r = rng(seed + 83)
  foliageClump(g, 0, raio * 0.75, 0, raio, raio * 0.2, Math.round(20 + raio * 24), tone, r, 0.8)
  return g
}

// ---------------------------------------------------------------------------
// CHAO DE TERRENO BALDIO
// ---------------------------------------------------------------------------

/** Tufos de capim seco espalhados: o que cobre lote vazio no cerrado. */
export function capinzal({ largura = 10, profundidade = 10, n = 60, seed = 0 } = {}) {
  const g = new THREE.Group()
  const r = rng(seed + 97)
  const seco = solid(0x8e8354, 0.96)
  const verde = leafMat(1)
  const lamina = new THREE.PlaneGeometry(0.06, 0.5)
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * largura
    const z = (r() - 0.5) * profundidade
    const alt = 0.25 + r() * 0.45
    const tufo = new THREE.Group()
    const k = 3 + Math.floor(r() * 3)
    for (let j = 0; j < k; j++) {
      const m = new THREE.Mesh(lamina, r() > 0.7 ? verde : seco)
      m.position.y = alt / 2
      m.scale.set(1, alt / 0.5, 1)
      m.rotation.y = r() * PI
      m.rotation.z = (r() - 0.5) * 0.6
      g.add(m)
      m.position.x = x + (r() - 0.5) * 0.16
      m.position.z = z + (r() - 0.5) * 0.16
    }
    void tufo
  }
  return g
}

/** Monte de areia de obra. */
export function monteDeAreia({ raio = 1.6, altura = 0.8, seed = 0 } = {}) {
  const g = new THREE.Group()
  const m = new THREE.Mesh(new THREE.ConeGeometry(raio, altura, 12, 1), solid(0xd8c9a4, 0.99))
  m.position.y = altura / 2
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  void seed
  return g
}

/** Pilha de bloco ceramico, do lado do monte de areia. */
export function pilhaDeBlocos({ fileiras = 4, colunas = 5, seed = 0, mat = null } = {}) {
  const g = new THREE.Group()
  const r = rng(seed + 101)
  const material = mat || solid(0xc2703f, 0.95)
  const bw = 0.19, bh = 0.19, bd = 0.29
  const bloco = new THREE.BoxGeometry(bd, bh, bw)
  for (let f = 0; f < fileiras; f++) {
    for (let c = 0; c < colunas; c++) {
      const m = new THREE.Mesh(bloco, material)
      m.position.set((c - (colunas - 1) / 2) * (bd + 0.01) + (r() - 0.5) * 0.02,
        bh / 2 + f * bh, (r() - 0.5) * 0.03)
      m.rotation.y = (r() - 0.5) * 0.05
      m.castShadow = true
      g.add(m)
    }
  }
  return g
}

/** Entulho: cacos de alvenaria e telha largados no chao. */
export function entulho({ raio = 1.2, n = 14, seed = 0 } = {}) {
  const g = new THREE.Group()
  const r = rng(seed + 103)
  const mats = [solid(0xb9b2a4, 0.98), solid(0xa85f42, 0.96), solid(0x8e8880, 0.98)]
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.1 + r() * 0.28, 0.05 + r() * 0.12, 0.1 + r() * 0.24),
      mats[Math.floor(r() * mats.length)])
    const a = r() * PI * 2
    const d = r() * raio
    m.position.set(Math.cos(a) * d, 0.04 + r() * 0.1, Math.sin(a) * d)
    m.rotation.set(r() * 3, r() * 6, r() * 3)
    m.castShadow = true
    g.add(m)
  }
  return g
}

export default {
  aroeiraSalsa, coqueiro, mangueira, cajueiro, tuia, trepadeiraFlorida, moita,
  capinzal, monteDeAreia, pilhaDeBlocos, entulho,
}
