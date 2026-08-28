// ---------------------------------------------------------------------------
// src/world/hudson/pecas-casa.js — a casa brasileira de rua, peca por peca.
//
// O padrao do bairro, lido nas 35 fotos e repetido em quase todo lote:
//
//     rua | calcada | MURO na divisa (2,2 a 2,6 m) com portao de garagem
//         | recuo curto de piso cimentado (0 a 3 m)
//         | CASA terrea, telha colonial em duas aguas, beiral de 40 a 70 cm
//         | janela com GRADE de barra vertical, porta recuada sob o beiral
//
// Tres detalhes que, faltando, entregam na hora que a casa e falsa:
//
//   A CINTA DE COROAMENTO. Todo muro do bairro termina numa faixa de concreto
//   de 8 a 12 cm mais saliente que o pano. Sem ela o muro vira um retangulo.
//
//   O BEIRAL COM TABICA. A telha avanca alem da parede e por baixo dela ha uma
//   faixa de madeira ou reboco pintado — quase sempre num vermelho-terra que
//   nao e a cor da parede nem a da telha.
//
//   A ALTURA DA GRADE. A grade nao cobre a janela inteira: ela e chumbada no
//   vao, recuada uns 4 cm do plano da fachada, e as barras terminam num
//   travessao em cima e outro embaixo.
//
// Tudo aqui devolve um THREE.Group com a origem NO CHAO, no MEIO DA TESTADA, e
// com +Z apontando pra rua. Quem monta o quarteirao so precisa posicionar e
// girar — nunca calcular altura.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid, stdMat } from '../materials.js'
import { rebocoMat, telhaMat, chapaMat, tijoloMat } from './materiais.js'

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
  m.receiveShadow = true
  return m
}

// ---------------------------------------------------------------------------
// MURO
// ---------------------------------------------------------------------------

/**
 * Muro de divisa com cinta de coroamento e vaos.
 *
 * `vaos` sao buracos na testada (portao de garagem, portao de pedestre), em
 * coordenada LOCAL X, do centro da testada. O muro nasce partido nesses vaos —
 * e nao um muro inteiro com um portao colado por cima, que e o jeito que deixa
 * uma linha de sombra errada na junta.
 *
 * @param {object} o
 * @param {number} o.largura   testada em metros
 * @param {number} o.altura    do chao ao topo da cinta (2,2 a 2,6)
 * @param {Array}  o.vaos      [{ x, largura }]
 * @param {string} o.cor       cor do reboco
 */
export function muro({
  largura = 10, altura = 2.4, espessura = 0.16, vaos = [],
  cor = '#bcb5a8', pintado = true, umidade = 0.8, seed = 1,
} = {}) {
  const g = new THREE.Group()
  const matPano = rebocoMat(cor, { pintado, umidade, seed, repeatX: Math.max(1, largura / 3) })
  const matCinta = solid(0xb9b3a6, 0.92)

  // os panos entre os vaos
  const cortes = vaos.slice().sort((a, b) => a.x - b.x)
  let x0 = -largura / 2
  const panos = []
  for (const v of cortes) {
    const a = v.x - v.largura / 2
    if (a > x0 + 0.02) panos.push([x0, a])
    x0 = v.x + v.largura / 2
  }
  if (largura / 2 > x0 + 0.02) panos.push([x0, largura / 2])

  const hCinta = 0.11
  for (const [a, b] of panos) {
    const w = b - a
    const cx = (a + b) / 2
    g.add(caixa(w, altura - hCinta, espessura, matPano, cx, (altura - hCinta) / 2, 0))
    // CINTA: mais larga que o pano, e o que da sombra na linha do topo
    g.add(caixa(w, hCinta, espessura + 0.06, matCinta, cx, altura - hCinta / 2, 0))
  }

  // VERGA sobre cada vao: a viga de concreto aparente que segura o muro
  for (const v of cortes) {
    const hv = v.verga === undefined ? 0.22 : v.verga
    if (hv <= 0) continue
    const topo = v.altura || (altura - hCinta - 0.15)
    if (topo + hv > altura - hCinta) continue
    g.add(caixa(v.largura + 0.1, hv, espessura + 0.04, matCinta, v.x, topo + hv / 2, 0))
    // e o pano curto que sobra entre a verga e a cinta
    const resto = (altura - hCinta) - (topo + hv)
    if (resto > 0.04) {
      g.add(caixa(v.largura + 0.1, resto, espessura, matPano, v.x, topo + hv + resto / 2, 0))
    }
    g.add(caixa(v.largura + 0.1, hCinta, espessura + 0.06, matCinta, v.x, altura - hCinta / 2, 0))
  }

  g.userData.altura = altura
  return g
}

/** Concertina: o rolo de lamina no topo do muro. Barato: 2 toros e um anel. */
export function concertina(largura = 6, seed = 2) {
  const g = new THREE.Group()
  const mat = solid(0xb9bcc0, 0.42, 0.7)
  const r = rng(seed)
  const passo = 0.42
  const n = Math.max(2, Math.round(largura / passo))
  const anel = new THREE.TorusGeometry(0.17, 0.012, 4, 9)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(anel, mat)
    m.position.set(-largura / 2 + (i + 0.5) * (largura / n), 0.19, 0)
    m.rotation.y = PI / 2
    m.rotation.x = (r() - 0.5) * 0.3
    g.add(m)
  }
  // os dois arames que passam pelos aneis
  for (const dy of [0.03, 0.35]) {
    const fio = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, largura, 4), mat)
    fio.rotation.z = PI / 2
    fio.position.y = dy
    g.add(fio)
  }
  // os suportes em L de ferro, um a cada 2,5 m
  const sup = Math.max(2, Math.round(largura / 2.5))
  for (let i = 0; i < sup; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 5), solid(0x6a6660, 0.7, 0.4))
    p.position.set(-largura / 2 + (i + 0.5) * (largura / sup), 0.19, 0)
    p.rotation.z = -0.35
    g.add(p)
  }
  return g
}

// ---------------------------------------------------------------------------
// PORTAO
// ---------------------------------------------------------------------------

/**
 * Portao de chapa ondulada — o portao do bairro. `correr` deixa ele pra fora do
 * plano do muro (portao de correr fica na frente da parede, e nao no vao).
 */
export function portaoChapa({
  largura = 2.6, altura = 2.1, cor = '#eae7e0', ferrugem = 0.25,
  correr = false, seed = 3,
} = {}) {
  const g = new THREE.Group()
  const mat = chapaMat(cor, ferrugem, seed)
  const folha = caixa(largura, altura, 0.05, mat, 0, altura / 2, correr ? 0.09 : 0)
  g.add(folha)
  // moldura de cantoneira: a borda mais escura que toda chapa tem
  const q = solid(0x8a8880, 0.6, 0.35)
  g.add(caixa(largura, 0.06, 0.07, q, 0, altura - 0.03, correr ? 0.09 : 0))
  g.add(caixa(largura, 0.06, 0.07, q, 0, 0.03, correr ? 0.09 : 0))
  if (correr) {
    // o trilho superior e as roldanas: e o que denuncia portao de correr
    g.add(caixa(largura + 0.5, 0.07, 0.07, q, 0, altura + 0.06, 0.09))
  }
  g.userData.altura = altura
  return g
}

/** Portao de grade: barra chata vertical, o outro tipo comum. */
export function portaoGrade({ largura = 1.1, altura = 2.05, cor = 0x3c3a38, barras = 0 } = {}) {
  const g = new THREE.Group()
  const mat = solid(cor, 0.55, 0.45)
  const n = barras || Math.max(4, Math.round(largura / 0.13))
  const barra = new THREE.BoxGeometry(0.022, altura - 0.1, 0.03)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(barra, mat)
    m.position.set(-largura / 2 + (i + 0.5) * (largura / n), altura / 2, 0)
    m.castShadow = true
    g.add(m)
  }
  g.add(caixa(largura, 0.06, 0.05, mat, 0, altura - 0.05, 0))
  g.add(caixa(largura, 0.06, 0.05, mat, 0, 0.05, 0))
  g.add(caixa(largura, 0.05, 0.05, mat, 0, altura * 0.45, 0))
  return g
}

// ---------------------------------------------------------------------------
// GRADE DE JANELA
// ---------------------------------------------------------------------------

/** A grade chumbada no vao: barras verticais entre dois travessoes. */
export function gradeJanela({ largura = 1.6, altura = 1.2, cor = 0x2f2d2b, passo = 0.11 } = {}) {
  const g = new THREE.Group()
  const mat = solid(cor, 0.5, 0.5)
  const n = Math.max(3, Math.round(largura / passo))
  const barra = new THREE.BoxGeometry(0.018, altura, 0.018)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(barra, mat)
    m.position.set(-largura / 2 + (i + 0.5) * (largura / n), 0, 0)
    g.add(m)
  }
  g.add(caixa(largura, 0.03, 0.03, mat, 0, altura / 2, 0))
  g.add(caixa(largura, 0.03, 0.03, mat, 0, -altura / 2, 0))
  return g
}

/** Janela completa: peitoril, caixilho, vidro escuro e grade na frente. */
export function janela({ largura = 1.6, altura = 1.2, comGrade = true } = {}) {
  const g = new THREE.Group()
  const alu = solid(0xa8adb2, 0.4, 0.6)
  // o vidro e escuro de proposito: por dentro nao ha nada, e vidro claro
  // mostraria o vazio. Escuro le como sombra de comodo.
  const vidro = stdMat('hud-vidro', {
    color: 0x2b3338, roughness: 0.16, metalness: 0.1,
  })
  g.add(caixa(largura, altura, 0.03, vidro, 0, 0, -0.03))
  const q = 0.05
  g.add(caixa(largura, q, 0.06, alu, 0, altura / 2 - q / 2, 0))
  g.add(caixa(largura, q, 0.06, alu, 0, -altura / 2 + q / 2, 0))
  g.add(caixa(q, altura, 0.06, alu, -largura / 2 + q / 2, 0, 0))
  g.add(caixa(q, altura, 0.06, alu, largura / 2 - q / 2, 0, 0))
  g.add(caixa(q * 0.7, altura, 0.05, alu, 0, 0, 0.005))   // montante central
  // peitoril de granito/concreto, sempre saliente
  g.add(caixa(largura + 0.14, 0.05, 0.14, solid(0x9d9890, 0.7), 0, -altura / 2 - 0.025, 0.04))
  if (comGrade) {
    const gr = gradeJanela({ largura: largura - 0.04, altura: altura - 0.04 })
    gr.position.z = 0.055
    g.add(gr)
  }
  return g
}

/** Porta de entrada: folha de madeira ou de aco, com bandeira em cima. */
export function porta({ largura = 0.9, altura = 2.1, cor = 0x6d4a2f, aco = false } = {}) {
  const g = new THREE.Group()
  const mat = aco ? chapaMat('#d8d6cf', 0.12, 9) : solid(cor, 0.72)
  g.add(caixa(largura, altura, 0.05, mat, 0, altura / 2, 0))
  const batente = solid(0xcfc9bd, 0.8)
  g.add(caixa(largura + 0.12, 0.06, 0.1, batente, 0, altura + 0.03, 0))
  g.add(caixa(0.06, altura, 0.1, batente, -largura / 2 - 0.03, altura / 2, 0))
  g.add(caixa(0.06, altura, 0.1, batente, largura / 2 + 0.03, altura / 2, 0))
  const maca = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), solid(0xb8a56a, 0.35, 0.7))
  maca.position.set(largura / 2 - 0.12, 1.05, 0.04)
  g.add(maca)
  return g
}

// ---------------------------------------------------------------------------
// TELHADO
// ---------------------------------------------------------------------------

/**
 * Telhado de duas aguas com beiral. A cumeeira corre em X (paralela a rua).
 *
 * A telha e desenhada com o V da textura DESCENDO A AGUA. Sem isso as canaletas
 * correm de lado e o telhado vira um tapete xadrez — e o erro mais visivel que
 * um telhado procedural pode ter.
 */
export function telhadoDuasAguas({
  largura = 8, profundidade = 8, alturaCumeeira = 1.1, beiral = 0.55,
  base = '#b25c38', tabica = 0x9c4a34,
} = {}) {
  const g = new THREE.Group()
  const W = largura + beiral * 2
  const D = profundidade / 2 + beiral
  const inclinacao = Math.atan2(alturaCumeeira, profundidade / 2)
  const compAgua = Math.hypot(alturaCumeeira, D)

  for (const lado of [1, -1]) {
    const mat = telhaMat(base, Math.max(2, W / 1.6), Math.max(2, compAgua / 1.1))
    const agua = new THREE.Mesh(new THREE.PlaneGeometry(W, compAgua), mat)
    agua.rotation.x = -PI / 2 + lado * inclinacao
    agua.rotation.y = lado > 0 ? 0 : PI
    agua.position.set(0, alturaCumeeira / 2 - (beiral * Math.tan(inclinacao)) / 2,
      lado * (compAgua / 2) * Math.cos(inclinacao) - lado * 0)
    // recoloca pela geometria exata: a agua vai da cumeeira ate a ponta do beiral
    agua.position.set(0,
      alturaCumeeira - Math.sin(inclinacao) * (compAgua / 2),
      lado * Math.cos(inclinacao) * (compAgua / 2))
    agua.castShadow = true
    agua.receiveShadow = true
    g.add(agua)

    // a espessura da telha na ponta do beiral: a faixa que se ve de baixo
    const borda = caixa(W, 0.055, 0.08, solid(0x8f4a30, 0.9),
      0, alturaCumeeira - Math.sin(inclinacao) * compAgua + 0.02,
      lado * (Math.cos(inclinacao) * compAgua))
    borda.rotation.x = lado > 0 ? -inclinacao : inclinacao
    g.add(borda)
  }

  // CUMEEIRA: a fileira de telhas em cima, sempre mais escura
  const cume = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, W, 6, 1, false, 0, PI),
    solid(0x8d4a30, 0.92))
  cume.rotation.z = PI / 2
  cume.position.y = alturaCumeeira + 0.02
  g.add(cume)

  // TABICA: a faixa por baixo do beiral, quase sempre num vermelho-terra
  for (const lado of [1, -1]) {
    const t = caixa(W, 0.12, 0.03, solid(tabica, 0.85),
      0, alturaCumeeira - Math.sin(inclinacao) * compAgua - 0.05,
      lado * (Math.cos(inclinacao) * compAgua - 0.01))
    g.add(t)
  }
  g.userData.altura = alturaCumeeira
  return g
}

// ---------------------------------------------------------------------------
// A CASA
// ---------------------------------------------------------------------------

/**
 * A casa terrea padrao do bairro.
 *
 * Origem no chao, no meio da testada, +Z pra rua. `vaos` descreve a fachada da
 * esquerda pra direita — e assim que as fotos foram lidas, e assim que fica
 * facil conferir uma casa contra a foto dela.
 *
 * @param {object} o
 * @param {number} o.largura     testada
 * @param {number} o.profundidade
 * @param {number} o.pedireito   do chao ao beiral (2,6 a 3,1)
 * @param {string} o.parede      cor do reboco, ou 'tijolo' pra tijolo aparente
 * @param {Array}  o.vaos        [{ tipo:'janela'|'porta'|'garagem', x, largura, altura }]
 */
export function casaTerrea({
  largura = 8, profundidade = 9, pedireito = 2.85, parede = '#d9d2c4',
  telha = '#b25c38', tabica = 0x9c4a34, beiral = 0.55, cumeeira = 1.05,
  vaos = null, pintado = true, umidade = 0.6, seed = 5, varanda = false,
} = {}) {
  const g = new THREE.Group()
  const r = rng(seed)
  const matParede = parede === 'tijolo'
    ? tijoloMat(Math.max(2, largura / 2), Math.max(1, pedireito / 1.4))
    : rebocoMat(parede, { pintado, umidade, seed, repeatX: Math.max(1, largura / 3.2) })

  // o bloco da casa
  const corpo = caixa(largura, pedireito, profundidade, matParede, 0, pedireito / 2, -profundidade / 2)
  g.add(corpo)

  // o telhado
  const tel = telhadoDuasAguas({
    largura, profundidade, alturaCumeeira: cumeeira, beiral, base: telha, tabica,
  })
  tel.position.set(0, pedireito, -profundidade / 2)
  g.add(tel)

  // FACHADA: se ninguem disse os vaos, monta um arranjo tipico
  let lista = vaos
  if (!lista) {
    lista = []
    const temGaragem = largura > 7 && r() > 0.45
    if (temGaragem) {
      lista.push({ tipo: 'garagem', x: -largura / 2 + 1.7, largura: 2.6, altura: 2.15 })
      lista.push({ tipo: 'porta', x: 0.4, largura: 0.9, altura: 2.1 })
      lista.push({ tipo: 'janela', x: largura / 2 - 1.4, largura: 1.7, altura: 1.2 })
    } else {
      lista.push({ tipo: 'janela', x: -largura / 2 + 1.5, largura: 1.7, altura: 1.2 })
      lista.push({ tipo: 'porta', x: 0, largura: 0.9, altura: 2.1 })
      lista.push({ tipo: 'janela', x: largura / 2 - 1.5, largura: 1.7, altura: 1.2 })
    }
  }

  const zf = 0.02   // plano da fachada
  for (const v of lista) {
    if (v.tipo === 'janela') {
      const j = janela({
        largura: v.largura || 1.6, altura: v.altura || 1.2,
        comGrade: v.grade !== false,
      })
      j.position.set(v.x, (v.peitoril || 1.05) + (v.altura || 1.2) / 2, zf)
      g.add(j)
    } else if (v.tipo === 'porta') {
      const p = porta({ largura: v.largura || 0.9, altura: v.altura || 2.1, cor: v.cor || 0x6d4a2f, aco: !!v.aco })
      p.position.set(v.x, 0, zf)
      g.add(p)
    } else if (v.tipo === 'garagem') {
      const p = portaoChapa({
        largura: v.largura || 2.6, altura: v.altura || 2.15,
        cor: v.cor || '#eae7e0', ferrugem: v.ferrugem === undefined ? 0.2 : v.ferrugem,
        seed: seed + 4,
      })
      p.position.set(v.x, 0, zf)
      g.add(p)
    }
  }

  // VARANDA: o beiral estendido sobre dois pilares, comum nas casas maiores
  if (varanda) {
    const prof = 1.8
    const matPilar = solid(0xcfc7b8, 0.9)
    for (const sx of [-largura / 2 + 0.5, largura / 2 - 0.5]) {
      g.add(caixa(0.22, pedireito - 0.1, 0.22, matPilar, sx, (pedireito - 0.1) / 2, prof - 0.15))
    }
    const cob = new THREE.Mesh(
      new THREE.PlaneGeometry(largura, prof + 0.3),
      telhaMat(telha, Math.max(2, largura / 1.6), Math.max(1, prof / 1.1)))
    cob.rotation.x = -PI / 2 + 0.13
    cob.position.set(0, pedireito + 0.06, prof / 2)
    cob.receiveShadow = true
    g.add(cob)
    g.add(caixa(largura, 0.1, 0.03, solid(tabica, 0.85), 0, pedireito - 0.04, prof + 0.3))
  }

  g.userData.altura = pedireito + cumeeira
  g.userData.profundidade = profundidade
  return g
}

// ---------------------------------------------------------------------------
// COISAS DE TELHADO
// ---------------------------------------------------------------------------

/** Antena parabolica de chapa, creme, apontada pro norte (que aqui e -Z). */
export function parabolica({ raio = 0.45, cor = 0xe4e0d6, malha = false } = {}) {
  const g = new THREE.Group()
  const mat = malha
    ? stdMat('hud-parab-malha', { color: 0xb8b8b2, roughness: 0.6, metalness: 0.4, wireframe: true })
    : solid(cor, 0.65)
  const prato = new THREE.Mesh(new THREE.SphereGeometry(raio, 14, 8, 0, PI * 2, 0, 0.62), mat)
  prato.rotation.x = PI          // boca pra cima
  prato.position.y = raio * 0.5
  g.add(prato)
  const braco = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, raio * 1.15, 5), solid(0x8a8880, 0.6, 0.4))
  braco.position.set(0, raio * 0.95, raio * 0.35)
  braco.rotation.x = -0.5
  g.add(braco)
  const lnb = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.12, 7), solid(0xdedad2, 0.5))
  lnb.position.set(0, raio * 1.25, raio * 0.6)
  lnb.rotation.x = 0.9
  g.add(lnb)
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6), solid(0x6e6a64, 0.6, 0.4))
  mastro.position.y = -0.1
  g.add(mastro)
  g.rotation.x = -0.42            // inclinacao de quem aponta pro satelite
  return g
}

/** Antena de VHF, a espinha de peixe de ferro. */
export function antenaVHF({ altura = 1.4 } = {}) {
  const g = new THREE.Group()
  const mat = solid(0x8d8a84, 0.55, 0.5)
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, altura, 5), mat)
  haste.position.y = altura / 2
  g.add(haste)
  const n = 6
  const trav = new THREE.BoxGeometry(0.9, 0.012, 0.012)
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(trav, mat)
    const t = i / (n - 1)
    m.position.y = altura * (0.42 + t * 0.55)
    m.scale.x = 1.05 - t * 0.5
    g.add(m)
  }
  return g
}

/** Caixa d'agua de polietileno, azul, sobre a laje. */
export function caixaDagua({ raio = 0.55, altura = 0.72, cor = 0x2e5f86 } = {}) {
  const g = new THREE.Group()
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio * 0.9, altura, 14), solid(cor, 0.7))
  corpo.position.y = altura / 2
  corpo.castShadow = true
  g.add(corpo)
  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.42, raio * 0.46, 0.07, 12), solid(cor, 0.6))
  tampa.position.y = altura + 0.03
  g.add(tampa)
  // a base de bloco que sempre tem embaixo
  g.add(caixa(raio * 2.1, 0.18, raio * 2.1, solid(0xbdb6a8, 0.95), 0, 0.09, 0))
  return g
}

/** Caixa do padrao de energia, chumbada no muro. */
export function medidor() {
  const g = new THREE.Group()
  g.add(caixa(0.32, 0.42, 0.16, solid(0xc9c6bf, 0.6, 0.2), 0, 0, 0))
  g.add(caixa(0.26, 0.2, 0.02, solid(0x2a2d30, 0.4), 0, 0.05, 0.09))
  const cano = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.9, 6), solid(0x9c9890, 0.7))
  cano.position.set(0.1, 0.62, 0.02)
  g.add(cano)
  return g
}

export default {
  muro, concertina, portaoChapa, portaoGrade, gradeJanela, janela, porta,
  telhadoDuasAguas, casaTerrea, parabolica, antenaVHF, caixaDagua, medidor,
}
