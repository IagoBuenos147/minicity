// ---------------------------------------------------------------------------
// src/world/hudson/pecas-publico.js — o que nao e casa: quadra coberta, escola,
// praca, galpao, comercio e o sobrado inacabado.
//
// Sao as pecas GRANDES do quarteirao. Elas fazem o servico que nenhuma fileira
// de casas faz: quebrar o ritmo. Um quarteirao so de casas de 8 m le como papel
// de parede, por mais caprichada que seja cada casa — e a quadra coberta de
// 22 m, o muro cego da escola e o terreno baldio que dao escala pro resto.
//
// Todas nascem com a origem NO CHAO, no MEIO DA TESTADA, com +Z pra rua.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid, stdMat } from '../materials.js'
import { rebocoMat, telhaMat, chapaMat } from './materiais.js'

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

/**
 * Duas aguas com a CUMEEIRA CORRENDO EM Z e as aguas caindo em +X e -X.
 *
 * A conta e a mesma de pecas-casa.telhadoDuasAguas, so que girada: monta com a
 * cumeeira em X (que e onde a formula fecha) e vira o grupo 90 graus. Escrever
 * a formula de novo no outro eixo foi exatamente o que quebrou a primeira
 * versao da quadra coberta.
 */
function duasAguas({ meia, comprimento, subida, yBeiral, mat }) {
  const g = new THREE.Group()
  const ang = Math.atan2(subida, meia)
  const comp = Math.hypot(subida, meia)
  for (const lado of [1, -1]) {
    const a = new THREE.Mesh(new THREE.PlaneGeometry(comprimento, comp), mat)
    a.rotation.x = -PI / 2 + lado * ang
    a.rotation.y = lado > 0 ? 0 : PI
    a.position.set(0, (yBeiral + subida) - Math.sin(ang) * (comp / 2),
      lado * Math.cos(ang) * (comp / 2))
    a.castShadow = true
    a.receiveShadow = true
    g.add(a)
  }
  g.rotation.y = PI / 2          // cumeeira passa a correr em Z
  return g
}

function caixa(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ---------------------------------------------------------------------------
// QUADRA POLIESPORTIVA COBERTA
// ---------------------------------------------------------------------------

/**
 * A cobertura metalica branca sobre pilares — o ginasio de bairro.
 *
 * O LANTERNIM e a peca que nao pode faltar: a faixa levantada na cumeeira, que
 * deixa o ar quente sair. Sem ele a cobertura vira um galpao, e as fotos
 * mostram claramente a fresta de luz correndo no alto.
 */
export function quadraCoberta({
  largura = 22, profundidade = 32, alturaPilar = 6.2, seed = 1,
} = {}) {
  const g = new THREE.Group()
  const branco = solid(0xe8e7e2, 0.55, 0.25)
  const pilar = solid(0xdedcd6, 0.6, 0.3)
  const piso = stdMat('hud-piso-quadra', { color: 0x9aa3a8, roughness: 0.9 })

  // o piso de concreto, com a pintura da quadra
  const p = new THREE.Mesh(new THREE.PlaneGeometry(largura - 1.4, profundidade - 2), piso)
  p.rotation.x = -PI / 2
  p.position.y = 0.02
  p.receiveShadow = true
  g.add(p)
  // as linhas: um retangulo e o circulo central, em tinta branca gasta
  const linha = solid(0xd9dbd8, 0.95, 0, { transparent: true, opacity: 0.7 })
  const cerca = (w, d, y) => {
    for (const [sw, sd, sx, sz] of [[w, 0.08, 0, d / 2], [w, 0.08, 0, -d / 2],
      [0.08, d, w / 2, 0], [0.08, d, -w / 2, 0]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), linha)
      m.rotation.x = -PI / 2
      m.position.set(sx, y, sz)
      g.add(m)
    }
  }
  cerca(largura - 4, profundidade - 6, 0.03)
  const circ = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.8, 28), linha)
  circ.rotation.x = -PI / 2
  circ.position.y = 0.03
  g.add(circ)

  // PILARES: perfil quadrado branco, 6 de cada lado
  const nP = Math.max(3, Math.round(profundidade / 6))
  for (const sx of [-1, 1]) {
    for (let i = 0; i < nP; i++) {
      const z = -profundidade / 2 + (i + 0.5) * (profundidade / nP)
      g.add(caixa(0.34, alturaPilar, 0.34, pilar, sx * (largura / 2), alturaPilar / 2, z))
    }
  }

  // A COBERTURA. Montada por duasAguas(), que e a mesma conta do telhado das
  // casas: a agua vai da cumeeira ate a ponta do beiral, e a inclinacao entra
  // no rotation.x. A primeira versao daqui usou rotation.z num plano ja deitado
  // e as aguas sairam do tamanho de um quarteirao, apontando pro ceu.
  const incl = 0.14
  const meia = largura / 2 + 0.9
  const yBeiral = alturaPilar + 0.5
  const subida = meia * incl
  g.add(duasAguas({
    meia, comprimento: profundidade + 1.6, subida, yBeiral, mat: branco,
  }))
  for (const lado of [1, -1]) {
    // a testeira: a faixa vertical na ponta do beiral
    g.add(caixa(0.1, 0.34, profundidade + 1.6, branco, lado * meia, yBeiral - 0.1, 0))
  }
  // LANTERNIM: a fresta levantada na cumeeira, por onde sai o ar quente
  const hL = 0.9
  const yCume = yBeiral + subida
  g.add(caixa(3.0, hL, profundidade + 1.0, branco, 0, yCume + hL / 2, 0))
  g.add(duasAguas({
    meia: 1.9, comprimento: profundidade + 1.2, subida: 0.26,
    yBeiral: yCume + hL, mat: branco,
  }))
  // as tesouras metalicas por baixo, que sao o que se ve de dentro
  const tubo = solid(0xc9c7c2, 0.5, 0.5)
  for (let i = 0; i <= nP; i++) {
    const z = -profundidade / 2 + i * (profundidade / nP)
    g.add(caixa(largura + 0.2, 0.1, 0.1, tubo, 0, alturaPilar - 0.12, z))
    // o banzo inferior da tesoura, um pouco abaixo, e as diagonais
    g.add(caixa(largura * 0.86, 0.07, 0.07, tubo, 0, alturaPilar - 0.5, z))
  }

  // ALAMBRADO: tela, e nao chapa. Uma parede opaca de 1,1 m em volta da quadra
  // (que foi o que a primeira versao desenhou) tapa a quadra inteira de quem
  // olha da rua — e a quadra existe justamente pra ser vista da rua.
  const alam = solid(0x77807a, 0.6, 0.35)
  for (const sx of [-1, 1]) {
    const x = sx * (largura / 2 + 0.4)
    const nMourao = Math.max(3, Math.round(profundidade / 3))
    for (let i = 0; i <= nMourao; i++) {
      const z = -profundidade / 2 + i * (profundidade / nMourao)
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.15, 6), alam)
      m.position.set(x, 0.58, z)
      g.add(m)
    }
    for (const y of [0.14, 0.62, 1.1]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, profundidade, 5), alam)
      t.rotation.x = PI / 2
      t.position.set(x, y, 0)
      g.add(t)
    }
  }
  void seed
  g.userData.altura = alturaPilar + 0.5 + meia * incl + hL
  return g
}

// ---------------------------------------------------------------------------
// ESCOLA
// ---------------------------------------------------------------------------

/**
 * O bloco da escola: fachada longa, janelas altas em fita, ar-condicionado na
 * parede e a mureta pintada com mural na frente.
 */
export function escola({
  largura = 30, profundidade = 12, altura = 4.2, cor = '#e3ddcf', seed = 2,
} = {}) {
  const g = new THREE.Group()
  const r = rng(seed)
  const matParede = rebocoMat(cor, { pintado: true, umidade: 0.35, seed, repeatX: largura / 4 })
  g.add(caixa(largura, altura, profundidade, matParede, 0, altura / 2, -profundidade / 2))

  // a platibanda: escola quase nunca mostra telhado da rua
  g.add(caixa(largura + 0.2, 0.42, profundidade + 0.2, solid(0xd6cfc0, 0.9),
    0, altura + 0.21, -profundidade / 2))

  // JANELAS EM FITA: vao alto, esquadria de aluminio, vidro azulado
  const vidro = stdMat('hud-vidro-escola', { color: 0x536b74, roughness: 0.18, metalness: 0.1 })
  const alu = solid(0xb0b5b8, 0.4, 0.55)
  const nJ = Math.max(3, Math.floor(largura / 4.2))
  for (let i = 0; i < nJ; i++) {
    const x = -largura / 2 + (i + 0.5) * (largura / nJ)
    g.add(caixa(2.7, 1.7, 0.05, vidro, x, altura * 0.62, 0.01))
    g.add(caixa(2.8, 0.08, 0.1, alu, x, altura * 0.62 + 0.87, 0.03))
    g.add(caixa(2.8, 0.08, 0.1, alu, x, altura * 0.62 - 0.87, 0.03))
    for (let k = 0; k < 3; k++) {
      g.add(caixa(0.06, 1.7, 0.08, alu, x - 1.35 + k * 1.35, altura * 0.62, 0.03))
    }
    // AR-CONDICIONADO: a escola das fotos tem um por sala
    if (i % 2 === 0) {
      g.add(caixa(0.86, 0.56, 0.34, solid(0xdcdad4, 0.55, 0.2), x + 1.5, altura * 0.62 + 1.5, 0.17))
    }
  }

  // A MURETA COM MURAL: a faixa colorida na frente, que e o que se ve da rua
  const mural = stdMat('hud-mural', {
    map: (() => {
      const c = document.createElement('canvas')
      c.width = 512; c.height = 128
      const gg = c.getContext('2d')
      gg.fillStyle = '#c9c2b0'; gg.fillRect(0, 0, 512, 128)
      const cores = ['#c0392b', '#2f6e45', '#d8a531', '#2b5c8a', '#8e4b9c']
      for (let i = 0; i < 26; i++) {
        gg.fillStyle = cores[i % cores.length]
        gg.globalAlpha = 0.75
        gg.beginPath()
        gg.arc(20 + i * 19, 64 + Math.sin(i) * 26, 12 + (i % 4) * 6, 0, 7)
        gg.fill()
      }
      gg.globalAlpha = 1
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = THREE.RepeatWrapping
      t.repeat.set(Math.max(1, Math.round(largura / 8)), 1)
      return t
    })(),
    roughness: 0.9,
  })
  g.add(caixa(largura, 1.05, 0.14, mural, 0, 0.52, 1.6))
  void r
  g.userData.altura = altura + 0.42
  return g
}

/** Mesa e bancos de praca/escola, em concreto pintado. */
export function mesaDePraca({ cor = 0xc0392b, seed = 1 } = {}) {
  const g = new THREE.Group()
  const mat = solid(cor, 0.85)
  const conc = solid(0xc4bdb0, 0.92)
  g.add(caixa(1.5, 0.08, 0.85, mat, 0, 0.76, 0))
  g.add(caixa(0.24, 0.72, 0.24, conc, -0.5, 0.36, 0))
  g.add(caixa(0.24, 0.72, 0.24, conc, 0.5, 0.36, 0))
  for (const sz of [-0.78, 0.78]) {
    g.add(caixa(1.5, 0.07, 0.34, mat, 0, 0.46, sz))
    g.add(caixa(0.16, 0.42, 0.2, conc, -0.5, 0.21, sz))
    g.add(caixa(0.16, 0.42, 0.2, conc, 0.5, 0.21, sz))
  }
  void seed
  return g
}

/** Banco de praca de concreto pintado de vermelho, so assento e dois apoios. */
export function bancoDePraca({ cor = 0xb03a2e } = {}) {
  const g = new THREE.Group()
  g.add(caixa(1.8, 0.1, 0.42, solid(cor, 0.85), 0, 0.44, 0))
  for (const sx of [-0.66, 0.66]) {
    g.add(caixa(0.18, 0.4, 0.38, solid(0xc4bdb0, 0.92), sx, 0.2, 0))
  }
  return g
}

/** Modulo baixo de rampa de skate, em concreto com faixa colorida. */
export function rampaDeSkate({ largura = 3.2, seed = 1 } = {}) {
  const g = new THREE.Group()
  const conc = solid(0xb9b4a8, 0.93)
  const r = rng(seed)
  const alt = 0.55 + r() * 0.25
  const prof = 1.8
  // um quarter simplificado: caixa com a face inclinada
  const geo = new THREE.BufferGeometry()
  const w = largura / 2
  const v = new Float32Array([
    -w, 0, -prof / 2, w, 0, -prof / 2, w, alt, prof / 2, -w, alt, prof / 2,     // rampa
    -w, 0, prof / 2, w, 0, prof / 2,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3))
  geo.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 1, 4, 1, 0, 3, 2, 5, 3, 5, 4])
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, conc)
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  // a faixa pintada na borda: rosa ou azul, como nas fotos
  g.add(caixa(largura, 0.09, 0.06, solid(r() > 0.5 ? 0xd6538f : 0x2f7fc0, 0.8),
    0, alt - 0.04, prof / 2 + 0.01))
  return g
}

// ---------------------------------------------------------------------------
// GALPAO
// ---------------------------------------------------------------------------

/** Galpao de telha metalica com tesoura azul aparente. */
export function galpao({ largura = 18, profundidade = 24, altura = 6.5, seed = 3 } = {}) {
  const g = new THREE.Group()
  const chapa = chapaMat('#dcdad3', 0.08, seed)
  const azul = solid(0x2f5a8c, 0.6, 0.45)
  g.add(caixa(largura, altura, profundidade, chapa, 0, altura / 2, -profundidade / 2))
  // duas aguas rasas
  const incl = 0.16
  const meia = largura / 2 + 0.5
  const cob = duasAguas({
    meia, comprimento: profundidade + 0.9, subida: meia * incl,
    yBeiral: altura, mat: chapaMat('#cfcdc6', 0.05, seed + 1),
  })
  cob.position.z = -profundidade / 2
  g.add(cob)
  // a tesoura azul aparente na empena
  for (const sx of [-1, 0, 1]) {
    g.add(caixa(0.14, altura * 0.9, 0.14, azul, sx * (largura / 2 - 0.4), altura * 0.45, 0.06))
  }
  g.add(caixa(largura, 0.2, 0.2, azul, 0, altura + 0.1, 0.06))
  g.userData.altura = altura + meia * incl
  return g
}

// ---------------------------------------------------------------------------
// COMERCIO
// ---------------------------------------------------------------------------

/** Letreiro de fachada: painel escuro com o nome em letra clara. */
export function letreiro({ texto = 'COMERCIO', largura = 4.2, altura = 0.9, fundo = '#2a2320', tinta = '#d9b45f' } = {}) {
  const mat = stdMat('hud-letreiro:' + texto + fundo + tinta, {
    map: (() => {
      const c = document.createElement('canvas')
      c.width = 1024; c.height = Math.round(1024 * (altura / largura))
      const g = c.getContext('2d')
      g.fillStyle = fundo; g.fillRect(0, 0, c.width, c.height)
      // as duas faixas escuras que todo letreiro de bairro tem nas pontas
      g.fillStyle = 'rgba(0,0,0,0.35)'
      g.fillRect(0, 0, c.width * 0.14, c.height)
      g.fillRect(c.width * 0.86, 0, c.width * 0.14, c.height)
      g.fillStyle = tinta
      g.font = 'bold ' + Math.round(c.height * 0.42) + 'px Georgia, serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(texto, c.width / 2, c.height * 0.54)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      return t
    })(),
    roughness: 0.5, metalness: 0.1,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, altura), mat)
  return m
}

/**
 * Fachada comercial de esquina: pano rebocado claro, vitrine de vidro do chao
 * ao teto, letreiro em cima e vaso de planta na porta. E a OFICINA DA BARBA /
 * Sena Griffes das fotos.
 */
export function comercio({
  largura = 12, profundidade = 10, altura = 4.0, cor = '#d8cfbb',
  nome = 'OFICINA DA BARBA', segundoNome = null, seed = 4,
} = {}) {
  const g = new THREE.Group()
  const matParede = rebocoMat(cor, { pintado: true, umidade: 0.25, seed, repeatX: largura / 4 })
  g.add(caixa(largura, altura, profundidade, matParede, 0, altura / 2, -profundidade / 2))
  // A LAJE, e depois a platibanda. Sem a laje a platibanda vira uma cornija
  // boiando: de baixo da calcada da pra ver o ceu por dentro da loja.
  g.add(caixa(largura + 0.1, 0.18, profundidade + 0.1, solid(0xb8b1a2, 0.94), 0, altura + 0.09, -profundidade / 2))
  // platibanda alta: comercio de bairro esconde o telhado
  for (const [w, d, x, z] of [
    [largura + 0.24, 0.16, 0, 0.08],
    [largura + 0.24, 0.16, 0, -profundidade - 0.08],
    [0.16, profundidade + 0.24, -largura / 2 - 0.08, -profundidade / 2],
    [0.16, profundidade + 0.24, largura / 2 + 0.08, -profundidade / 2],
  ]) {
    g.add(caixa(w, 0.5, d, solid(0xcbc2ae, 0.9), x, altura + 0.43, z))
  }

  // VITRINE: o vao de vidro do chao ao alto
  const vidro = stdMat('hud-vitrine', { color: 0x27333a, roughness: 0.1, metalness: 0.2 })
  const q = solid(0x8f9498, 0.4, 0.6)
  const nV = largura > 9 ? 2 : 1
  for (let i = 0; i < nV; i++) {
    const cx = nV === 1 ? 0 : (i === 0 ? -largura / 4 : largura / 4)
    const w = Math.min(3.4, largura / nV - 1.4)
    g.add(caixa(w, 2.5, 0.06, vidro, cx, 1.45, 0.02))
    g.add(caixa(w + 0.12, 0.1, 0.12, q, cx, 2.75, 0.05))
    g.add(caixa(0.1, 2.5, 0.12, q, cx - w / 2, 1.45, 0.05))
    g.add(caixa(0.1, 2.5, 0.12, q, cx + w / 2, 1.45, 0.05))
    // o puxador de aco vertical
    const pux = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), solid(0xc7ccd0, 0.35, 0.8))
    pux.position.set(cx + 0.12, 1.35, 0.07)
    g.add(pux)
  }

  // o letreiro principal
  const l = letreiro({ texto: nome, largura: Math.min(largura - 1, 6.4), altura: 0.95 })
  l.position.set(segundoNome ? largura / 4 : 0, 3.35, 0.06)
  g.add(l)
  if (segundoNome) {
    const l2 = letreiro({ texto: segundoNome, largura: largura / 2 - 0.6, altura: 0.8, fundo: '#1a1a22', tinta: '#cfa64a' })
    l2.position.set(-largura / 4, 3.35, 0.06)
    g.add(l2)
  }

  g.userData.altura = altura + 0.55
  return g
}

// ---------------------------------------------------------------------------
// SOBRADO INACABADO
// ---------------------------------------------------------------------------

/**
 * O sobrado de bloco cru, sem reboco em parte da fachada, laje aparente e vao
 * de janela sem esquadria. Tem um em quase toda rua do bairro.
 */
export function sobradoInacabado({
  largura = 7.5, profundidade = 9, seed = 6,
} = {}) {
  const g = new THREE.Group()
  const r = rng(seed)
  const cru = rebocoMat('#cdc6b7', { pintado: false, umidade: 0.5, seed, repeatX: largura / 3 })
  const h1 = 2.9, h2 = 2.8

  g.add(caixa(largura, h1, profundidade, cru, 0, h1 / 2, -profundidade / 2))
  // o segundo pavimento, mais estreito e recuado
  const l2 = largura * (0.72 + r() * 0.2)
  g.add(caixa(l2, h2, profundidade * 0.8, cru, 0, h1 + h2 / 2, -profundidade * 0.4))
  // a laje aparente entre os dois: a faixa de concreto que denuncia o inacabado
  g.add(caixa(largura + 0.1, 0.28, profundidade + 0.1, solid(0xbdb7ab, 0.95), 0, h1 + 0.14, -profundidade / 2))
  // platibanda torta em cima
  g.add(caixa(l2 + 0.1, 0.5, profundidade * 0.8 + 0.1, solid(0xc6c0b3, 0.95), 0, h1 + h2 + 0.25, -profundidade * 0.4))

  // VAO SEM ESQUADRIA: o buraco escuro no segundo pavimento
  g.add(caixa(1.9, 1.4, 0.12, solid(0x22201d, 1), -l2 * 0.1, h1 + 1.55, 0.03))
  g.add(caixa(0.6, 0.9, 0.12, solid(0x22201d, 1), l2 * 0.34, h1 + 1.3, 0.03))
  // portao de chapa azulado no terreo
  const pg = chapaMat('#b9c6cc', 0.18, seed + 2)
  g.add(caixa(2.5, 2.15, 0.06, pg, -largura / 2 + 1.6, 1.07, 0.03))
  // ferro de espera saindo da laje: o detalhe que grita "obra parada"
  const ferro = solid(0x8a6a4a, 0.85, 0.3)
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 4), ferro)
    f.position.set(-l2 / 2 + (i + 0.5) * (l2 / 5), h1 + h2 + 0.68, -profundidade * 0.4 + 0.2)
    f.rotation.z = (r() - 0.5) * 0.3
    g.add(f)
  }
  g.userData.altura = h1 + h2 + 0.5
  return g
}

export default {
  quadraCoberta, escola, mesaDePraca, bancoDePraca, rampaDeSkate,
  galpao, letreiro, comercio, sobradoInacabado,
}
