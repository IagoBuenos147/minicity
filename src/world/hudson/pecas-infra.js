// ---------------------------------------------------------------------------
// src/world/hudson/pecas-infra.js — poste, fiacao, boca de lobo, lixeira,
// pintura de rua e o resto do que a prefeitura poe na calcada.
//
// A FIACAO E O ASSUNTO PRINCIPAL DESTE ARQUIVO.
//
// Nas 35 fotos, o que mais aparece depois do asfalto sao os fios: as fichas
// contam de "5 a 8 cabos paralelos" ate "um emaranhado de 15 a 20 saindo em
// leque do poste grande". Um bairro brasileiro sem esse rendado no ceu nao
// parece brasileiro — parece maquete. Entao:
//
//   - o fio nao e reto: cai numa CATENARIA entre dois postes;
//   - nao e um fio: e um FEIXE (3 ou 4 de energia em cima, no travessao, e o
//     bolo de telecom amarrado 80 cm abaixo);
//   - e ele CRUZA A RUA na diagonal, ligando os postes dos dois lados.
//
// CUSTO. Um vao de 30 m com 8 fios em tubo de 3 lados sao 8 malhas. O
// quarteirao tem uns 24 vaos: 192 draw calls so de fio, num orcamento de 1200
// pro mapa inteiro. Por isso `redeAerea()` funde TODOS os fios do bairro numa
// geometria so — uma malha, um material.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid, emissive } from '../materials.js'
import { mergeGeometries } from '../bake.js'

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

function caixa(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

// ---------------------------------------------------------------------------
// POSTE
// ---------------------------------------------------------------------------

const CONCRETO = 0xa8a49c
const FERRO = 0x6f6b65

/**
 * Poste de concreto de secao retangular (o "duplo T" das fichas) — o poste
 * padrao da rede de distribuicao brasileira.
 *
 * `luminaria` liga o braco curvo com a luminaria petala. `travessao` liga a
 * cruzeta de madeira com os isoladores, que e o que segura os fios de energia.
 * `alturaFio` e onde o feixe sai: quem monta a rede pergunta isso ao poste em
 * vez de chutar.
 */
export function posteConcreto({
  altura = 9.5, luminaria = true, travessao = true, transformador = false,
  seed = 1, cor = CONCRETO,
} = {}) {
  const g = new THREE.Group()
  const mat = solid(cor, 0.93)
  const r = rng(seed)

  // O fuste afina pra cima: 22x14 cm na base, 16x11 no topo. E a conicidade
  // que faz um poste de concreto parecer poste, e nao cano.
  const fuste = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.125, altura, 4), mat)
  fuste.rotation.y = PI / 4
  fuste.scale.set(1.0, 1, 0.68)      // achata: secao retangular, nao quadrada
  fuste.position.y = altura / 2
  fuste.castShadow = true
  g.add(fuste)

  // a base alargada com o rodape de concreto que sempre tem
  g.add(caixa(0.34, 0.16, 0.26, solid(0x9c978e, 0.95), 0, 0.08, 0))

  const yFio = altura - 0.7

  if (travessao) {
    // CRUZETA: 2,0 m de madeira escura atravessada no topo
    const cruz = caixa(2.0, 0.09, 0.09, solid(0x4d4239, 0.92), 0, yFio, 0)
    g.add(cruz)
    // mao-francesa
    for (const sx of [-1, 1]) {
      const mf = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 4), solid(FERRO, 0.6, 0.4))
      mf.position.set(sx * 0.42, yFio - 0.22, 0)
      mf.rotation.z = sx * 0.72
      g.add(mf)
    }
    // ISOLADORES: os tres pinos de porcelana
    const iso = solid(0x5a6a58, 0.5)
    for (const sx of [-0.82, 0, 0.82]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.13, 6), iso)
      p.position.set(sx, yFio + 0.11, 0)
      g.add(p)
    }
  }

  if (transformador) {
    // O TAMBOR do trafo, preso ao poste logo abaixo da cruzeta. Nas fotos ele
    // aparece so nos postes de esquina, e e o que faz aquele poste virar o
    // poste "grande" que domina a foto.
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.62, 12), solid(0x8d8f8a, 0.6, 0.35))
    t.position.set(0.28, yFio - 1.0, 0)
    t.castShadow = true
    g.add(t)
    const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.06, 12), solid(0x7c7e79, 0.6, 0.35))
    tampa.position.set(0.28, yFio - 0.67, 0)
    g.add(tampa)
    // as buchas de porcelana em cima
    for (const sx of [-0.12, 0.12]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.16, 6), solid(0x6a5a4a, 0.5))
      b.position.set(0.28 + sx, yFio - 0.57, 0)
      g.add(b)
    }
  }

  let luz = null
  let matLuz = null
  if (luminaria) {
    // BRACO CURVO: dois trechos e uma curva. Sai do poste, sobe e vira pra rua.
    const braco = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.028, 4, 8, PI * 0.52), solid(FERRO, 0.6, 0.45))
    braco.position.set(0, altura - 1.35, 0)
    braco.rotation.y = PI / 2
    braco.rotation.z = -PI * 0.02
    g.add(braco)
    const reta = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.15, 5), solid(FERRO, 0.6, 0.45))
    reta.position.set(0, altura - 0.78, 0.42)
    reta.rotation.x = PI / 2 - 0.28
    g.add(reta)

    // LUMINARIA PETALA: a carcaca de aluminio fechada, ovalada, virada pra rua
    matLuz = emissive(0xffe6b0, 0.12)
    const carcaca = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 6, 0, PI * 2, 0, PI * 0.5),
      solid(0xd6d3cc, 0.45, 0.5))
    carcaca.scale.set(1.5, 0.7, 1.0)
    carcaca.position.set(0, altura - 0.42, 1.16)
    g.add(carcaca)
    const vidro = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 5, 0, PI * 2, PI * 0.5, PI * 0.5), matLuz)
    vidro.scale.set(1.5, 0.5, 1.0)
    vidro.position.set(0, altura - 0.43, 1.16)
    g.add(vidro)

    // A LUZ so acende de noite (cenarios.js liga o onNight do cenario nela).
    luz = new THREE.PointLight(0xffdca8, 0, 16, 2)
    luz.position.set(0, altura - 0.6, 1.16)
    luz.visible = false
    g.add(luz)
  }

  g.userData.alturaFio = yFio
  g.userData.altura = altura
  return { grupo: g, luz, matLuz, alturaFio: yFio }
}

/** Poste tubular de aco galvanizado, o mais novo, so de iluminacao. */
export function posteAco({ altura = 8.5, seed = 2 } = {}) {
  const g = new THREE.Group()
  const mat = solid(0xb6b8b4, 0.5, 0.55)
  const fuste = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.1, altura, 8), mat)
  fuste.position.y = altura / 2
  fuste.castShadow = true
  g.add(fuste)
  g.add(caixa(0.36, 0.1, 0.36, solid(0xa5a29c, 0.9), 0, 0.05, 0))
  const braco = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 4, 8, PI * 0.5), mat)
  braco.position.set(0, altura - 0.7, 0)
  braco.rotation.y = PI / 2
  g.add(braco)
  const matLuz = emissive(0xffe6b0, 0.12)
  const carc = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6, 0, PI * 2, 0, PI * 0.5),
    solid(0xd6d3cc, 0.45, 0.5))
  carc.scale.set(1.6, 0.62, 1.0)
  carc.position.set(0, altura + 0.02, 0.7)
  g.add(carc)
  const vidro = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 5, 0, PI * 2, PI * 0.5, PI * 0.5), matLuz)
  vidro.scale.set(1.6, 0.45, 1.0)
  vidro.position.set(0, altura + 0.01, 0.7)
  g.add(vidro)
  const luz = new THREE.PointLight(0xffdca8, 0, 16, 2)
  luz.position.set(0, altura - 0.2, 0.7)
  luz.visible = false
  g.add(luz)
  void seed
  g.userData.alturaFio = altura - 0.9
  return { grupo: g, luz, matLuz, alturaFio: altura - 0.9 }
}

// ---------------------------------------------------------------------------
// FIACAO
// ---------------------------------------------------------------------------

/** Um ponto da catenaria entre A e B com flecha `flecha` no meio. */
function catenaria(a, b, t, flecha) {
  const x = a.x + (b.x - a.x) * t
  const z = a.z + (b.z - a.z) * t
  const y = a.y + (b.y - a.y) * t - flecha * 4 * t * (1 - t)
  return new THREE.Vector3(x, y, z)
}

/**
 * A REDE AEREA do bairro inteiro, numa malha so.
 *
 * `vaos` e a lista de tramos: [{ a: {x,y,z}, b: {x,y,z}, fios, flecha, telecom }].
 * Cada tramo vira N tubos com barriga; todos entram na mesma geometria.
 *
 * Por que uma malha so: ver o cabecalho. 24 vaos x 8 fios seriam 192 draw calls.
 */
export function redeAerea(vaos = []) {
  const geos = []
  const SEG = 10            // pedacos da catenaria: 10 ja nao mostra quina
  const LADOS = 3           // tubo triangular: a 8 m de altura ninguem conta

  for (const v of vaos) {
    const a = v.a, b = v.b
    const n = v.fios === undefined ? 4 : v.fios
    const flecha = v.flecha === undefined ? 0.55 : v.flecha
    const espac = v.espacamento === undefined ? 0.24 : v.espacamento

    // ENERGIA: os condutores na cruzeta, lado a lado e na horizontal
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * espac
      const pontos = []
      for (let k = 0; k <= SEG; k++) {
        const p = catenaria(a, b, k / SEG, flecha)
        // desloca perpendicular ao vao
        const dx = b.x - a.x, dz = b.z - a.z
        const L = Math.hypot(dx, dz) || 1
        p.x += (-dz / L) * off
        p.z += (dx / L) * off
        pontos.push(p)
      }
      const curva = new THREE.CatmullRomCurve3(pontos)
      const tubo = new THREE.TubeGeometry(curva, SEG, v.raio || 0.016, LADOS, false)
      geos.push(tubo)
    }

    // TELECOM: o bolo de cabo preto amarrado 80 cm abaixo, mais grosso e com
    // mais barriga. E ele que da o ar de bagunca das fotos.
    if (v.telecom !== false) {
      const a2 = { x: a.x, y: a.y - 0.85, z: a.z }
      const b2 = { x: b.x, y: b.y - 0.85, z: b.z }
      const pontos = []
      for (let k = 0; k <= SEG; k++) pontos.push(catenaria(a2, b2, k / SEG, flecha * 1.7))
      const curva = new THREE.CatmullRomCurve3(pontos)
      geos.push(new THREE.TubeGeometry(curva, SEG, 0.035, LADOS, false))
    }
  }

  if (!geos.length) return null
  const geo = mergeGeometries(geos)
  for (const g of geos) g.dispose()
  if (!geo) return null
  const m = new THREE.Mesh(geo, solid(0x2b2b2b, 0.85, 0.1))
  m.name = 'hudson-fiacao'
  m.castShadow = false      // sombra de fio custa caro e nao aparece
  return m
}

// ---------------------------------------------------------------------------
// CHAO DA CALCADA
// ---------------------------------------------------------------------------

/** Boca de lobo: a caixa de concreto com a grade de ferro, na sarjeta. */
export function bocaDeLobo() {
  const g = new THREE.Group()
  g.add(caixa(1.1, 0.16, 0.5, solid(0x9c968c, 0.95), 0, -0.08, 0))
  const buraco = caixa(0.94, 0.1, 0.34, solid(0x1c1a18, 1), 0, -0.06, 0)
  g.add(buraco)
  const barra = solid(0x55504a, 0.65, 0.45)
  for (let i = 0; i < 6; i++) {
    g.add(caixa(0.9, 0.03, 0.035, barra, 0, -0.01, -0.15 + i * 0.06))
  }
  return g
}

/** Lixeira publica: dois tambores verdes numa armacao tubular. */
export function lixeiraTambor({ dupla = true } = {}) {
  const g = new THREE.Group()
  const verde = solid(0x2f5e3a, 0.75)
  const tubo = solid(0x2f5e3a, 0.6, 0.4)
  const n = dupla ? 2 : 1
  for (let i = 0; i < n; i++) {
    const x = dupla ? (i === 0 ? -0.32 : 0.32) : 0
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.23, 0.62, 12, 1, true), verde)
    t.position.set(x, 0.72, 0)
    t.castShadow = true
    g.add(t)
    const fundo = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 12), verde)
    fundo.position.set(x, 0.42, 0)
    g.add(fundo)
    // aro de boca
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 4, 12), tubo)
    aro.rotation.x = PI / 2
    aro.position.set(x, 1.03, 0)
    g.add(aro)
  }
  // a armacao: dois pes e uma travessa
  for (const sx of [-0.62, 0.62]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.12, 6), tubo)
    p.position.set(sx, 0.56, 0)
    g.add(p)
  }
  const trav = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.24, 6), tubo)
  trav.rotation.z = PI / 2
  trav.position.y = 0.98
  g.add(trav)
  return g
}

/** Sacos de lixo pretos largados no meio-fio. */
export function sacosDeLixo({ n = 3, seed = 1 } = {}) {
  const g = new THREE.Group()
  const r = rng(seed)
  const mat = solid(0x22211f, 0.72)
  const esfera = new THREE.SphereGeometry(0.3, 8, 6)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(esfera, mat)
    m.position.set((r() - 0.5) * 1.1, 0.2 + r() * 0.08, (r() - 0.5) * 0.6)
    m.scale.set(0.8 + r() * 0.5, 0.62 + r() * 0.4, 0.8 + r() * 0.5)
    m.rotation.set(r(), r() * 6, r() * 0.4)
    m.castShadow = true
    g.add(m)
  }
  return g
}

/** Tambor de 200 L enferrujado, virado de boca pra cima. */
export function tambor({ seed = 1 } = {}) {
  const g = new THREE.Group()
  const mat = solid(0x7a5236, 0.88, 0.25)
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14, 1, true), mat)
  c.position.y = 0.44
  c.castShadow = true
  g.add(c)
  for (const y of [0.28, 0.6]) {          // as duas cintas do tambor
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 4, 14), mat)
    aro.rotation.x = PI / 2
    aro.position.y = y
    g.add(aro)
  }
  const fundo = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 14), solid(0x3a2a1e, 0.95))
  fundo.position.y = 0.06
  g.add(fundo)
  void seed
  return g
}

/** Pilaretes: os tocos de concreto que impedem carro de subir na calcada. */
export function pilarete({ altura = 0.75 } = {}) {
  const g = new THREE.Group()
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, altura, 10), solid(0xdedad2, 0.85))
  m.position.y = altura / 2
  m.castShadow = true
  g.add(m)
  const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.16, 10), solid(0x2b3a5c, 0.8))
  faixa.position.y = altura - 0.16
  g.add(faixa)
  return g
}

/** Placa de rua de chapa, no poste. */
export function placaDeRua(mat) {
  const g = new THREE.Group()
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.26), mat)
  p.position.y = 0
  g.add(p)
  const verso = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.26), solid(0xd9d6cf, 0.8))
  verso.rotation.y = PI
  verso.position.z = -0.01
  g.add(verso)
  return g
}

export default {
  posteConcreto, posteAco, redeAerea, bocaDeLobo, lixeiraTambor,
  sacosDeLixo, tambor, pilarete, placaDeRua,
}
