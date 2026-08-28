// ---------------------------------------------------------------------------
// src/world/hudson/chao.js — o chao do bairro: asfalto, calcada, meio-fio,
// sarjeta, terra e a pintura da rua.
//
// A GEOMETRIA DO QUARTEIRAO, em metros e no eixo do jogo:
//
//        Z-                    R. Frei Pedro Caixito
//              +--------------------------------------------+
//   R. Padre   |                                            |  R. Jorge
//   Josino     |            O QUARTEIRAO (os lotes)         |  Araujo
//              |                                            |  Caldas
//              +--------------------------------------------+
//        Z+                  R. Josue Felix Caixeta
//                    X-                                X+
//
// CADA RUA TEM A SUA LARGURA. Nao e detalhe: a Josue Felix Caixeta tem 7 m de
// pista e calcada de 1,80 m (uma rua apertada, de casa colada na divisa), e a
// Frei Pedro Caixito tem 8 m de pista e calcada de 3,60 m (a rua da escola e da
// praca). Desenhar as duas iguais apaga metade do que diferencia um lado do
// quarteirao do outro.
//
// A SARJETA. Toda ficha das 35 fotos menciona terra vermelha acumulada junto ao
// meio-fio. E uma faixa de 40 cm, e ela e o que impede o encontro do asfalto com
// o meio-fio de parecer desenho tecnico.
//
// ALTURAS. O jogo inteiro usa LEVELS.SIDEWALK = 0.16 pra calcada, e este bairro
// segue: mudar a altura aqui obrigaria a mexer no controlador do jogador, que
// sobe degrau de ate 0.45 sozinho. O asfalto e o zero.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid } from '../materials.js'
import { asfaltoTex, calcadaTex, terraTex } from './materiais.js'
import { LEVELS } from '../../config.js'

const PI = Math.PI
const CH = LEVELS.SIDEWALK      // 0.16

/**
 * O retangulo dos LOTES (divisa a divisa) e as quatro ruas em volta.
 * As larguras vieram da leitura das fotos, rua por rua.
 */
export const Q = {
  // As medidas saem da soma das testadas lidas nas fotos, rua por rua:
  //   eixo X — Frei Pedro Caixito fechou 118 m
  //   eixo Z — Jorge Araujo Caldas fechou 124 m e a Frei Pedro Caixito 118;
  //            o critico fechou em 121, tirando 3 m da praca baixa da Caldas
  x0: -59, x1: 59,
  z0: -60.5, z1: 60.5,
}

export const RUAS = {
  // lado sul (+Z): rua apertada, casa e comercio colados na divisa
  sul: { nome: 'R. Josue Felix Caixeta', asfalto: 7.0, calcada: 1.8, eixo: 'X', faixa: 'tracejada' },
  // lado norte (-Z): a rua da escola e da praca, larga
  norte: { nome: 'R. Frei Pedro Caixito', asfalto: 8.0, calcada: 3.6, eixo: 'X', faixa: 'continua', delineadores: true },
  // lado leste (+X)
  leste: { nome: 'R. Jorge Araujo Caldas', asfalto: 7.5, calcada: 2.2, eixo: 'Z', faixa: 'tracejada' },
  // lado oeste (-X)
  oeste: { nome: 'R. Padre Josino', asfalto: 7.0, calcada: 2.0, eixo: 'Z', faixa: 'continua' },
}

/** Onde acaba o asfalto de cada rua (a divisa dos lotes de frente). */
export const LIMITE = {
  x1: Q.x1 + RUAS.leste.calcada + RUAS.leste.asfalto + RUAS.leste.calcada,
  x0: Q.x0 - RUAS.oeste.calcada - RUAS.oeste.asfalto - RUAS.oeste.calcada,
  z1: Q.z1 + RUAS.sul.calcada + RUAS.sul.asfalto + RUAS.sul.calcada,
  z0: Q.z0 - RUAS.norte.calcada - RUAS.norte.asfalto - RUAS.norte.calcada,
}

/** O eixo (meio da pista) de cada rua. */
export const EIXO = {
  sul: Q.z1 + RUAS.sul.calcada + RUAS.sul.asfalto / 2,
  norte: Q.z0 - RUAS.norte.calcada - RUAS.norte.asfalto / 2,
  leste: Q.x1 + RUAS.leste.calcada + RUAS.leste.asfalto / 2,
  oeste: Q.x0 - RUAS.oeste.calcada - RUAS.oeste.asfalto / 2,
}

// --- materiais por tamanho ---------------------------------------------------
//
// O erro que este cache existe pra impedir: usar a mesma textura, com o mesmo
// `repeat`, numa faixa de 164 x 8,6 m. O ladrilho estica 19 vezes mais num eixo
// que no outro e o asfalto vira um borrao de riscos horizontais. Aqui o repeat
// sai do TAMANHO EM METROS dividido pelo periodo da textura.
const _mats = new Map()
function chaoMat(nome, fabrica, periodo, w, d) {
  const rx = Math.max(1, Math.round(w / periodo))
  const rz = Math.max(1, Math.round(d / periodo))
  const chave = nome + ':' + rx + 'x' + rz
  let m = _mats.get(chave)
  if (m) return m
  const t = fabrica(1).clone()
  t.needsUpdate = true
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, rz)
  t.anisotropy = 8
  m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.96, metalness: 0 })
  _mats.set(chave, m)
  return m
}

const asf = (w, d) => chaoMat('asf', asfaltoTex, 7.0, w, d)
const cal = (w, d) => chaoMat('cal', calcadaTex, 4.0, w, d)
const ter = (w, d) => chaoMat('ter', terraTex, 5.0, w, d)

function malha(w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  m.rotation.x = -PI / 2
  m.position.set(x, y, z)
  m.receiveShadow = true
  return m
}

/** Texto branco gasto pintado no asfalto (nome de rua, PARE). */
export function pinturaMat(texto, opcoes = {}) {
  const larg = opcoes.larg || 512
  const alt = opcoes.alt || 128
  const c = document.createElement('canvas')
  c.width = larg; c.height = alt
  const g = c.getContext('2d')
  g.clearRect(0, 0, larg, alt)
  g.fillStyle = 'rgba(238,235,228,0.9)'
  g.font = 'bold ' + Math.round(alt * (opcoes.escala || 0.74)) + 'px Georgia, serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(texto, larg / 2, alt / 2)
  // DESGASTE: a pintura de rua sempre esta comida pelo pneu
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 520; i++) {
    g.globalAlpha = 0.05 + Math.random() * 0.55
    g.beginPath()
    g.arc(Math.random() * larg, Math.random() * alt, 1 + Math.random() * 8, 0, 7)
    g.fill()
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return new THREE.MeshStandardMaterial({
    map: t, transparent: true, roughness: 1, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  })
}

/** O nome da rua pintado no asfalto EM DUAS LINHAS, como em Paracatu. */
function nomeNoAsfalto(g, nome, x, z, girar, comprimento = 9) {
  const partes = nome.split(' ')
  const meio = Math.ceil(partes.length / 2)
  const linhas = [partes.slice(0, meio).join(' '), partes.slice(meio).join(' ')]
  // As duas linhas vao dentro de um GRUPO girado. Girar cada plano na mao (com
  // rotation.z num plano ja deitado por rotation.x) trocava o eixo do
  // deslocamento junto: a segunda linha saia de cabeca pra baixo e no lugar
  // errado. Com o grupo, as duas nascem alinhadas e o grupo vira as duas.
  const bloco = new THREE.Group()
  const alt = comprimento * 0.22
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i]) continue
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(comprimento, alt),
      pinturaMat(linhas[i], { larg: 1024, alt: 224 }))
    m.rotation.x = -PI / 2
    // (0.5 - i), e nao (i - 0.5): a PRIMEIRA linha tem que vir primeiro no
    // sentido da leitura. Com o sinal trocado, "Caldas" aparecia antes de
    // "R. Jorge" pra quem descia a rua.
    m.position.set(0, 0, (0.5 - i) * alt * 1.18)
    bloco.add(m)
  }
  // O SINAL IMPORTA. O texto nasce lendo pro +X. Girar +PI/2 leva a leitura pro
  // -Z, que e o sentido de quem desce a rua e le o nome vindo na sua direcao —
  // que e como a prefeitura pinta. Com -PI/2 o nome saia espelhado, lido de
  // tras pra frente por quem passava.
  bloco.rotation.y = girar
  bloco.position.set(x, 0.014, z)
  g.add(bloco)
}

/**
 * Monta o chao do bairro inteiro.
 * @returns {{ grupo, groundY, eixos }}
 */
export function buildChao() {
  const g = new THREE.Group()
  g.name = 'hudson-chao'
  const L = LIMITE
  const largura = L.x1 - L.x0
  const profund = L.z1 - L.z0
  const matMeioFio = solid(0xa9a49a, 0.9)
  // A sarjeta e uma SUJEIRA, e nao uma faixa pintada: terra soprada acumulada
  // no encontro do asfalto com o meio-fio. Semi-transparente pra deixar o
  // asfalto aparecer por baixo — opaca ela virava uma listra laranja de 120 m.
  const matSarjeta = solid(0x93805f, 0.99, 0, { transparent: true, opacity: 0.55 })

  // 1) TERRA por baixo de tudo. Grande: e ela que faz o horizonte alem do
  //    quarteirao, e um plano pequeno mostraria a borda do mundo.
  const wT = largura + 260, dT = profund + 260
  g.add(malha(wT, dT, ter(wT, dT), (L.x0 + L.x1) / 2, -0.02, (L.z0 + L.z1) / 2))

  // 2) ASFALTO: uma faixa por rua, sobrepostas nas esquinas
  const faixas = [
    { r: RUAS.sul, w: largura, d: RUAS.sul.asfalto, x: (L.x0 + L.x1) / 2, z: EIXO.sul },
    { r: RUAS.norte, w: largura, d: RUAS.norte.asfalto, x: (L.x0 + L.x1) / 2, z: EIXO.norte },
    { r: RUAS.leste, w: RUAS.leste.asfalto, d: profund, x: EIXO.leste, z: (L.z0 + L.z1) / 2 },
    { r: RUAS.oeste, w: RUAS.oeste.asfalto, d: profund, x: EIXO.oeste, z: (L.z0 + L.z1) / 2 },
  ]
  for (const f of faixas) g.add(malha(f.w, f.d, asf(f.w, f.d), f.x, 0, f.z))

  // 3) CALCADA + MEIO-FIO + SARJETA.
  //    Oito passeios: os quatro colados no quarteirao e os quatro de frente.
  //    `sinal` aponta pra onde fica a rua a partir daquele passeio.
  const passeios = [
    { eixo: 'z', v: Q.z1 + RUAS.sul.calcada / 2, w: largura, larg: RUAS.sul.calcada, sinal: 1 },
    { eixo: 'z', v: L.z1 - RUAS.sul.calcada / 2, w: largura, larg: RUAS.sul.calcada, sinal: -1 },
    { eixo: 'z', v: Q.z0 - RUAS.norte.calcada / 2, w: largura, larg: RUAS.norte.calcada, sinal: -1 },
    { eixo: 'z', v: L.z0 + RUAS.norte.calcada / 2, w: largura, larg: RUAS.norte.calcada, sinal: 1 },
    { eixo: 'x', v: Q.x1 + RUAS.leste.calcada / 2, w: profund, larg: RUAS.leste.calcada, sinal: 1 },
    { eixo: 'x', v: L.x1 - RUAS.leste.calcada / 2, w: profund, larg: RUAS.leste.calcada, sinal: -1 },
    { eixo: 'x', v: Q.x0 - RUAS.oeste.calcada / 2, w: profund, larg: RUAS.oeste.calcada, sinal: -1 },
    { eixo: 'x', v: L.x0 + RUAS.oeste.calcada / 2, w: profund, larg: RUAS.oeste.calcada, sinal: 1 },
  ]
  for (const p of passeios) {
    const borda = p.v + p.sinal * (p.larg / 2 - 0.07)
    const sarj = p.v + p.sinal * (p.larg / 2 + 0.22)
    if (p.eixo === 'z') {
      g.add(malha(p.w, p.larg, cal(p.w, p.larg), 0, CH, p.v))
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, CH, 0.14), matMeioFio)
      m.position.set(0, CH / 2, borda)
      m.receiveShadow = true
      g.add(m)
      g.add(malha(p.w, 0.34, matSarjeta, 0, 0.006, sarj))
    } else {
      g.add(malha(p.larg, p.w, cal(p.larg, p.w), p.v, CH, 0))
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.14, CH, p.w), matMeioFio)
      m.position.set(borda, CH / 2, 0)
      m.receiveShadow = true
      g.add(m)
      g.add(malha(0.34, p.w, matSarjeta, sarj, 0.006, 0))
    }
  }

  // 4) A PINTURA DA RUA: faixa de eixo, nome escrito no asfalto e PARE.
  const matFaixa = solid(0xbf9c3a, 0.98, 0, { transparent: true, opacity: 0.5 })
  function faixaEixo(rua, eixo, horizontal, comp) {
    if (rua.faixa === 'continua') {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? comp : 0.12, horizontal ? 0.12 : comp), matFaixa)
      m.rotation.x = -PI / 2
      m.position.set(horizontal ? 0 : eixo, 0.012, horizontal ? eixo : 0)
      g.add(m)
      return
    }
    const n = Math.floor(comp / 7)
    for (let i = 0; i < n; i++) {
      const t = -comp / 2 + (i + 0.5) * 7
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(horizontal ? 2.4 : 0.12, horizontal ? 0.12 : 2.4), matFaixa)
      m.rotation.x = -PI / 2
      m.position.set(horizontal ? t : eixo, 0.012, horizontal ? eixo : t)
      g.add(m)
    }
  }
  faixaEixo(RUAS.sul, EIXO.sul, true, largura - 26)
  faixaEixo(RUAS.norte, EIXO.norte, true, largura - 26)
  faixaEixo(RUAS.leste, EIXO.leste, false, profund - 26)
  faixaEixo(RUAS.oeste, EIXO.oeste, false, profund - 26)

  // O NOME DA RUA escrito no asfalto, na boca de cada esquina. E a assinatura
  // visual de Paracatu: aparece em quase toda foto do levantamento.
  nomeNoAsfalto(g, RUAS.sul.nome, Q.x0 - 3, EIXO.sul, 0, 10)
  nomeNoAsfalto(g, RUAS.sul.nome, Q.x1 + 3, EIXO.sul, 0, 10)
  nomeNoAsfalto(g, RUAS.norte.nome, 0, EIXO.norte, 0, 10)
  nomeNoAsfalto(g, RUAS.leste.nome, EIXO.leste, 0, PI / 2, 10)
  nomeNoAsfalto(g, RUAS.oeste.nome, EIXO.oeste, 0, PI / 2, 10)

  // PARE na boca das transversais
  for (const [x, z, rot] of [
    [EIXO.leste, Q.z1 + RUAS.sul.calcada + 1.6, PI / 2],
    [EIXO.oeste, Q.z1 + RUAS.sul.calcada + 1.6, PI / 2],
    [EIXO.leste, Q.z0 - RUAS.norte.calcada - 1.6, PI / 2],
    [EIXO.oeste, Q.z0 - RUAS.norte.calcada - 1.6, PI / 2],
  ]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.1), pinturaMat('PARE', { larg: 512, alt: 168 }))
    m.rotation.x = -PI / 2
    m.rotation.z = rot
    m.position.set(x, 0.013, z)
    g.add(m)
  }

  return { grupo: g, groundY, eixos: EIXO }
}

/**
 * A altura do chao por comparacao, sem raycast — como em city.js.
 * Dentro do quarteirao e nos oito passeios: calcada. No resto: asfalto e terra,
 * ambos no zero.
 */
export function groundY(x, z) {
  const L = LIMITE
  // dentro do quarteirao: o piso dos lotes acompanha a calcada
  if (x > Q.x0 && x < Q.x1 && z > Q.z0 && z < Q.z1) return CH
  // passeios colados no quarteirao
  if (x >= Q.x0 - RUAS.oeste.calcada && x <= Q.x1 + RUAS.leste.calcada
    && z >= Q.z0 - RUAS.norte.calcada && z <= Q.z1 + RUAS.sul.calcada) return CH
  // passeios do outro lado das quatro ruas
  if (z >= L.z1 - RUAS.sul.calcada && z <= L.z1 && x >= L.x0 && x <= L.x1) return CH
  if (z <= L.z0 + RUAS.norte.calcada && z >= L.z0 && x >= L.x0 && x <= L.x1) return CH
  if (x >= L.x1 - RUAS.leste.calcada && x <= L.x1 && z >= L.z0 && z <= L.z1) return CH
  if (x <= L.x0 + RUAS.oeste.calcada && x >= L.x0 && z >= L.z0 && z <= L.z1) return CH
  // alem das ruas: terra, no nivel do asfalto
  return 0
}

export default buildChao
