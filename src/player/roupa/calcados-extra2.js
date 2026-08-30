import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  sh, esc, tecido, metal, bloco, par,
} from './nucleo.js'
import { soldarNormais, tecelagem } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/calcados-extra2.js — mais 3 calcados NOVOS (o pedido foi
// "raro, com JUICE e polido"). calcados.js e calcados-extra.js continuam
// intactos; a fiacao (import + concat em roupas.js) e feita por fora.
//
// O QUE JA EXISTIA (nao repetido aqui): descalco, bota, chinelo, coturno,
// mocassim (calcados.js) e tenis-corrida, tenis-skate, sapato-social
// (calcados-extra.js). Os 7 cobrem: cano alto liso (bota), cano alto com
// lacing militar (coturno), tenis baixo com recorte (tenis-corrida), tenis
// baixo vulcanizado (tenis-skate), mocassim e social baixos (esfera). Faltava
// no catalogo: bico pontudo de verdade, cano ACOLCHOADO (nao so couro liso) e
// qualquer coisa no meio-termo de altura entre "bota alta" e "sapato baixo".
// Os 3 daqui preenchem exatamente essas tres lacunas.
//
//   bota-cauboi      LOFT DE SECOES (a familia da bota): mesmo cabedal por
//                     pilha de superelipses, so que a QUINA cai pra 1.65 no
//                     bico (a bota normal para em 2.2) e um taper extra
//                     aperta a largura nos ultimos 20% — o bico pontudo que
//                     nenhum dos 7 tem. Cano alto de secao eliptica (a mesma
//                     tecnica de canoBota), SEM ilho/cadarco: bota de cowboy
//                     e calcado DE ENFIAR, nao de amarrar. O salto e 3 blocos
//                     empilhados e cada vez mais pra frente (underslung) em
//                     vez do salto-por-loft da bota normal — e o unico jeito
//                     de o degrau de cada camada aparecer como ARESTA de
//                     verdade, nao como sombra de textura. A costura em V e
//                     uma fileira de pontos amostrada na FRENTE do proprio
//                     cano (formula nova: pontoFrenteCano interpola entre os
//                     aneis do perfil, igual costura() interpola o contorno
//                     do cabedal — mesma familia de truque, eixo diferente).
//   tenis-cano-alto   LOFT DE SECOES (a familia do tenis-corrida): cabedal
//                     igual, mas com um SEGUNDO loft eliptico curto por cima
//                     — o colarinho acolchoado — em vez do anel fino de
//                     seguranca que o tenis baixo usa. Dois bojos (bulge-
//                     sulco-bulge) no proprio perfil do cano fazem a "costura
//                     de acolchoado" sem gastar triangulo em relevo separado.
//                     A entressola vira DUAS lajes empilhadas (EVA branca
//                     larga embaixo, espuma da cor do jogador estreita em
//                     cima) — a "entressola em duas camadas" do pedido, um
//                     degrau de GEOMETRIA, nao um gradiente de textura.
//   bota-chelsea      ESFERA ESCULPIDA (a familia do mocassim/sapato-social)
//                     pra base baixa e de bico limpo, com um CANO curto de
//                     secao eliptica por cima (a familia da bota) — hibrido
//                     de proposito: testado com a croa alta do mocassim, o
//                     cano nascia enterrado dentro da propria esfera e a
//                     "bota" lia como mocassim de cano invisivel. A correcao
//                     foi encolher a altura da esfera (h: 0.042 contra os
//                     0.068-0.072 do mocassim/social) pra sobrar cano visivel
//                     por cima. O elastico lateral e um PATCH ABERTO (grade
//                     nao-fechada, nao um anel) recortado da mesma formula do
//                     cano, abaulado 2 mm no centro e afunilado nas quatro
//                     bordas pra 0 — sem costura visivel na moldura, so o
//                     material troca (couro liso vira elastico fosco).
//
// A REGRA DO COLARINHO (ver calcados.js/calcados-extra.js): todo calcado
// tem que alcancar y >= -0.012 no tornozelo, senao aparece um cone de canela
// boiando acima do sapato. Os tres daqui alcancam isso pela MESMA tecnica dos
// canos altos originais (canoBota/canoCoturno): o perfil sobe ate um "rebordo
// acolchoado" (o ponto mais largo) e so DEPOIS rola pra dentro e desce um
// pouco, fechando um raio pequeno bem ABAIXO e ATRAS do rebordo — a dobra
// esconde a costura de fechamento por tras do proprio rebordo, entao ela nao
// precisa casar em raio exato com a canela: so precisa ser menor que o raio
// da canela naquela altura, com folga. Os tres pares de numeros abaixo foram
// checados contra a tabela de raio da canela do cabecalho de calcados.js
// (0.0255 em y=0, 0.0262 em y=0.03, 0.0329 em y=0.11) antes de fechar.
// ---------------------------------------------------------------------------

const Z_TRAS = -0.078
const Z_BICO = 0.152

/** Interpolador suave de tabela (o mesmo smoothstep de calcados.js). */
function curva(tab, t) {
  if (t <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const a = tab[i - 1], b = tab[i]
      const k = (t - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)
    }
  }
  return tab[tab.length - 1][1]
}

/** A forma da planta do pe — a MESMA tabela de calcados.js/calcados-extra.js,
 *  copiada de proposito (e medida do boneco, nao estilo). */
const PLANTA = [
  [0.00, 0.30], [0.05, 0.60], [0.14, 0.76], [0.28, 0.78],
  [0.45, 0.73], [0.60, 0.89], [0.72, 1.00], [0.83, 0.96],
  [0.92, 0.78], [0.97, 0.54], [1.00, 0.20],
]

/** Malha de um acumulador de tecelagem, com as normais ja soldadas. */
function malhaDe(ma, mat) {
  return sh(new THREE.Mesh(soldarNormais(ma.geo()), mat))
}

/** Loft por aneis — o mesmo helper de calcados.js/calcados-extra.js. */
function lofte(ma, aneis, tampaIni = true, tampaFim = true) {
  const n = aneis[0].length
  const ids = aneis.map((r) => r.map((p) => ma.v(p[0], p[1], p[2])))
  for (let i = 0; i + 1 < ids.length; i++) {
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      ma.quad(ids[i][j], ids[i][k], ids[i + 1][k], ids[i + 1][j])
    }
  }
  const leque = (pts, id, fim) => {
    let x = 0, y = 0, z = 0
    for (const p of pts) { x += p[0]; y += p[1]; z += p[2] }
    const c = ma.v(x / n, y / n, z / n)
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      if (fim) ma.tri(c, id[j], id[k])
      else ma.tri(c, id[k], id[j])
    }
  }
  if (tampaIni) leque(aneis[0], ids[0], false)
  if (tampaFim) leque(aneis[aneis.length - 1], ids[ids.length - 1], true)
}

/** Caixinha somada a UMA malha compartilhada — o mesmo cubo() de calcados.js. */
const CANTOS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
]
const _v = new THREE.Vector3()
function cubo(ma, m4, w, h, d) {
  const id = []
  for (const p of CANTOS) {
    _v.set(p[0] * w / 2, p[1] * h / 2, p[2] * d / 2).applyMatrix4(m4)
    id.push(ma.v(_v.x, _v.y, _v.z))
  }
  const q = (a, b, c, e) => ma.quad(id[a], id[b], id[c], id[e])
  q(4, 5, 6, 7); q(1, 0, 3, 2); q(5, 1, 2, 6)
  q(0, 4, 7, 3); q(3, 7, 6, 2); q(0, 1, 5, 4)
}
const _m4 = new THREE.Matrix4()

/** A costura entre cabedal e sola, seguindo um CONTORNO — o mesmo helper de
 *  calcados.js/calcados-extra.js. `ponto(t)` devolve [meia largura, altura]. */
function costura(ma, o) {
  for (let i = 0; i < o.n; i++) {
    const t = o.t0 + (o.t1 - o.t0) * (i / (o.n - 1))
    const t2 = Math.min(o.t1, t + 0.02)
    const a = o.ponto(t), b = o.ponto(t2)
    const z = o.z0 + (o.z1 - o.z0) * t
    const z2 = o.z0 + (o.z1 - o.z0) * t2
    const ang = Math.atan2(b[0] - a[0], z2 - z)
    for (const s of [1, -1]) {
      _m4.makeRotationY(s * ang)
      _m4.setPosition(s * a[0], a[1], z)
      cubo(ma, _m4, 0.0026, 0.0020, o.comp || 0.0080)
    }
  }
}

/** Secao transversal do cabedal (superelipse cujo expoente muda ao longo do
 *  pe) — copiada de calcados.js/calcados-extra.js. */
function secaoCabedal(n, w, h, base, z, quina) {
  const pts = []
  const px = 2 / quina
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    const ca = Math.cos(a), sa = Math.sin(a)
    let x = w * Math.sign(ca) * Math.pow(Math.abs(ca), px)
    let y
    if (sa >= 0) {
      y = h * Math.pow(sa, px)
      x *= 1 - 0.16 * Math.pow(sa, 1.4)
    } else {
      y = -0.004 * (-sa)
    }
    pts.push([x, base + y, z])
  }
  return pts
}

/** Secao de uma camada de sola (laje de canto redondo, chanfrada embaixo). */
function secaoSola(n, w, h, y0, z, quina, estreita) {
  const pts = []
  const px = 2 / quina
  const yc = y0 + h / 2
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    const ca = Math.cos(a), sa = Math.sin(a)
    let x = w * Math.sign(ca) * Math.pow(Math.abs(ca), px)
    if (sa < 0) x *= 1 - estreita * Math.pow(-sa, 1.6)
    pts.push([x, yc + (h / 2) * Math.sign(sa) * Math.pow(Math.abs(sa), px), z])
  }
  return pts
}

/** Laje generica: nSec aneis de secaoSola entre t0 e t1, direto num acumulador. */
function laje(ma, t0, t1, W, y0, y1, fora, quina, estreita, nSec) {
  const rs = []
  for (let i = 0; i < nSec; i++) {
    const t = t0 + (t1 - t0) * (i / (nSec - 1))
    rs.push(secaoSola(8, curva(PLANTA, t) * W + fora, y1 - y0, y0,
      Z_TRAS + (Z_BICO - Z_TRAS) * t, quina, estreita))
  }
  lofte(ma, rs)
}

/** Anel de cano: secao ELIPTICA (rx e rz independentes) centrada em zc —
 *  copiada de calcados.js. */
function secaoCano(n, rx, rz, zc, y) {
  const pts = []
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    pts.push([Math.sin(a) * rx, y, zc + Math.cos(a) * rz])
  }
  return pts
}

/**
 * Interpola [rx, rz, zc] do perfil de um cano numa altura Y ARBITRARIA (nao
 * so nos aneis da tabela). So funciona no trecho MONOTONICO do perfil (antes
 * do rebordo comecar a rolar pra dentro e pra baixo) — e onde costuraV() e
 * elastico() sempre amostram, de proposito.
 */
function emCano(perfil, y) {
  const n = perfil.length
  if (y <= perfil[0][3]) return perfil[0]
  if (y >= perfil[n - 1][3]) return perfil[n - 1]
  for (let i = 1; i < n; i++) {
    const a = perfil[i - 1], b = perfil[i]
    if (y <= b[3]) {
      const k = (y - a[3]) / (b[3] - a[3])
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, y]
    }
  }
  return perfil[n - 1]
}

/** Z da FRENTE do cano em (x, y) — a versao de calcados.js so serve pra UM
 *  anel; esta interpola o perfil inteiro primeiro (ver emCano). */
function pontoFrenteCano(perfil, y, x) {
  const [rx, rz, zc] = emCano(perfil, y)
  const k = Math.min(0.96, Math.abs(x) / rx)
  return zc + rz * Math.sqrt(1 - k * k)
}

/**
 * Puxador: uma placa so, saindo da boca do cano no centro de TRAS e inclinada
 * pra fora — o "pull tab" que a bota de cowboy e a chelsea usam pra enfiar o
 * pe sem cadarco. Nasce dentro do rebordo (y0/z0 = o proprio ponto do anel
 * mais alto) e sobe INCLINADA, nunca reta: reta ela lia como uma antena.
 */
function puxador(y0, z0, mat, altura, larg, esp, inclinacao) {
  const b = bloco(larg, altura, esp, esp * 0.32, mat)
  // z0*0.96 empurra o centro pra DENTRO (z0 e sempre negativo, de tras; mais
  // perto de zero = mais perto do miolo do cano) — a primeira versao subtraia
  // uma folga fixa e mandava o puxador pra TRAS do proprio rebordo, numa fresta
  // vazia onde nao ha malha nenhuma por baixo: saia flutuando, como uma bola
  // solta atras da bota. Nascendo por dentro do rebordo garante sobra
  // (overlap) mesmo sem acertar o raio exato do anel naquela altura.
  b.position.set(0, y0 + altura * 0.20, z0 * 0.96)
  b.rotation.x = inclinacao
  return b
}

// ===========================================================================
// 1. BOTA-CAUBOI — loft de secoes (familia da bota), bico pontudo, sem cadarco
// ===========================================================================

const CAUBOI_ALTURA = [
  [0.00, 0.58], [0.10, 0.90], [0.24, 1.00], [0.38, 0.96],
  [0.52, 0.86], [0.66, 0.72], [0.80, 0.56], [0.90, 0.42], [1.00, 0.22],
]
// Quina cai ate 1.65 no bico (a bota normal para em 2.2): e o bico PONTUDO
// que separa a bota de cowboy das outras 7 — cross-section quase em diamante
// no ultimo trecho, em vez de cupula.
const CAUBOI_QUINA = [[0.00, 4.2], [0.28, 4.8], [0.52, 3.4], [0.78, 2.2], [1.00, 1.65]]
// Aperta a LARGURA nos ultimos 20% por cima da quina: so a quina baixa deixa
// a planta ainda gorda no bico (o expoente muda a FORMA da secao, nao o raio
// medio). As duas juntas e que fazem o bico afinar de verdade, sem virar
// agulha (o PLANTA original ja vai a 0.20 em t=1; isto multiplica por cima).
const BICO_FINO = [[0.80, 1.00], [1.00, 0.74]]

// Cano alto: [rx, rz, zc, y]. Sobe ate o rebordo em S+0.180/0.186 e so ai
// rola pra dentro — bem mais alto que o cano da bota normal (S+0.146) e mais
// baixo que o coturno (S+0.238): a "bota de cowboy" fica no meio das duas,
// que e onde a referencia real tambem fica (cano de cowboy sobe ate perto da
// batata da perna, mas nao ate o joelho).
function canoCauboi(S) {
  return [
    [0.0378, 0.0488, -0.026, S + 0.018],
    [0.0390, 0.0498, -0.025, S + 0.040],
    [0.0378, 0.0484, -0.024, S + 0.062],
    [0.0402, 0.0504, -0.023, S + 0.084],
    [0.0390, 0.0492, -0.022, S + 0.104],
    [0.0414, 0.0514, -0.021, S + 0.126],
    [0.0404, 0.0500, -0.020, S + 0.146],
    [0.0426, 0.0520, -0.019, S + 0.164],
    [0.0452, 0.0544, -0.018, S + 0.180],   // rebordo acolchoado, o pico
    [0.0468, 0.0556, -0.017, S + 0.186],   // boca ligeiramente evasee
    [0.0340, 0.0388, -0.017, S + 0.182],   // rola pra dentro
    [0.0252, 0.0270, -0.017, S + 0.172],   // fecha dentro da canela
  ]
}

/**
 * Costura decorativa em V: uma fileira de pontos de costura na FRENTE do
 * proprio cano, com a altura tracando um V (funda no centro, sobe nos dois
 * lados) via curva() com fundo no meio — pontoFrenteCano() poe cada ponto
 * exatamente NA superficie do cano naquela altura, entao a costura nao boia
 * nem afunda conforme o cano muda de raio subindo.
 */
function costuraV(ma, perfilCano, xMax, yBase, amp, n, comp) {
  const tab = [[0, 1], [0.5, 0], [1, 1]]
  const pt = (t) => {
    const x = -xMax + 2 * xMax * t
    const y = yBase + amp * curva(tab, t)
    const z = pontoFrenteCano(perfilCano, y, x) + 0.0016
    return [x, y, z]
  }
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const t2 = Math.min(1, t + 0.5 / (n - 1))
    const a = pt(t), b = pt(t2)
    const ang = Math.atan2(b[0] - a[0], b[2] - a[2])
    _m4.makeRotationY(ang)
    _m4.setPosition(a[0], a[1], a[2])
    cubo(ma, _m4, 0.0034, 0.0026, comp)
  }
}

function fazBotaCauboi(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // Bota de cowboy e couro marrom, nao a cor do jogador — o mesmo criterio
  // que o sapato social ja usa (sapato social branco nao existe; bota de
  // cowboy da cor do personagem tambem nao).
  const corBase = 0x6b3c22
  // Rugosidade BAIXA de verdade (0.20, nao os 0.42 de couro()): sem
  // environment map na cena, e o especular do sol que vende o brilho do
  // couro polido — o mesmo motivo do sapato social.
  const mCouro = solid(corBase, 0.20, 0.09)
  const mCano = solid(esc(corBase, 0.92), 0.20, 0.09)
  const mSalto = solid(esc(corBase, 0.58), 0.30, 0.06)
  const mEntre = tecido(0xd8c7a0, 0.85)
  const mSolado = tecido(0x241a12, 0.92)
  const mFio = tecido(0xe9d9ac, 0.76)

  const N = 10, W = 0.050, H = 0.056
  const TOPO_SOLA = S + 0.030

  // --- cabedal: loft de secoes, bico pontudo (quina baixa + taper extra) ---
  const maUp = tecelagem()
  const aneis = []
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    const fino = t > 0.80 ? curva(BICO_FINO, t) : 1
    aneis.push(secaoCabedal(N, curva(PLANTA, t) * W * fino, curva(CAUBOI_ALTURA, t) * H,
      TOPO_SOLA, Z_TRAS + (Z_BICO - Z_TRAS) * t, curva(CAUBOI_QUINA, t)))
  }
  lofte(maUp, aneis)
  g.add(malhaDe(maUp, mCouro))

  // --- sola fina, full-length (solado escuro + entressola clara) ---
  const maSolado = tecelagem()
  laje(maSolado, 0.00, 1.00, W, S, S + 0.010, 0.0046, 5.0, 0.20, 10)
  g.add(malhaDe(maSolado, mSolado))
  const maEntre = tecelagem()
  laje(maEntre, 0.00, 1.00, W, S + 0.009, TOPO_SOLA, 0.0066, 5.2, 0.06, 10)
  g.add(malhaDe(maEntre, mEntre))

  // --- salto EMPILHADO (underslung): 3 blocos, cada um mais fundo e mais pra
  // TRAS que o de baixo — e a unica forma de o degrau de cada camada virar
  // uma ARESTA de verdade (geometria), em vez de textura de "salto de couro".
  // "Underslung" e o termo real: a base do salto e mais ESTREITA e mais pra
  // FRENTE que o topo, entao o calcanhar parece recolhido por baixo do arco.
  // Sobe quase ate TOPO_SOLA (0.0084 x 3 = 0.0252 contra os 0.030 do
  // TOPO_SOLA): baixo demais e ele lia como um calco escondido debaixo da
  // entressola, nao como salto de bota.
  const zHeel = Z_TRAS + 0.044
  const camadas = [
    { w: 0.026, d: 0.028, h: 0.0084, dz: 0.012 },
    { w: 0.030, d: 0.033, h: 0.0084, dz: 0.007 },
    { w: 0.034, d: 0.038, h: 0.0084, dz: 0.000 },
  ]
  let yc = S
  for (const cm of camadas) {
    const b = bloco(cm.w, cm.h, cm.d, 0.0028, mSalto)
    b.position.set(0, yc + cm.h / 2, zHeel + cm.dz)
    g.add(b)
    yc += cm.h
  }

  // --- cano alto, secao eliptica ---
  const perfilCano = canoCauboi(S)
  const maCano = tecelagem()
  lofte(maCano, perfilCano.map((p) => secaoCano(12, p[0], p[1], p[2], p[3])), false, true)
  g.add(malhaDe(maCano, mCano))

  // --- costura decorativa em V, na frente do cano ---
  // xMax perto do rx do cano (~0.039-0.041 nesta faixa de altura) de proposito:
  // com xMax pequeno o V inteiro ficava colado no CENTRO da frente, que e
  // exatamente a regiao que uma camera de perfil ve DE LADO (quase de canto) —
  // o V sumia num amontoado de tracos verticais. Abrindo os bracos ate quase
  // o raio, eles alcancam a LATERAL do cano (fora a = rx, z = zc), que e a
  // parte que uma camera de perfil ve de FRENTE — a mesma logica do gomo
  // elastico da chelsea, so que em vez de amostrar em angulo (a) este amostra
  // em X, porque o cano aqui e alto e reto (nao vale a pena reparametrizar).
  const maFio = tecelagem()
  costuraV(maFio, perfilCano, 0.032, S + 0.056, 0.060, 11, 0.0080)
  g.add(malhaDe(maFio, mFio))

  // --- puxador na boca do cano, centro de tras ---
  const pico = perfilCano[9]
  g.add(puxador(pico[3], pico[2] - pico[1], mCano, 0.015, 0.026, 0.0075, -0.36))

  return g
}

// ===========================================================================
// 2. TENIS-CANO-ALTO — loft de secoes (familia do tenis de corrida)
// ===========================================================================

const ALTO_ALTURA = [
  [0.00, 0.60], [0.10, 0.90], [0.24, 1.00], [0.40, 0.95],
  [0.55, 0.82], [0.70, 0.66], [0.85, 0.50], [1.00, 0.32],
]
// Bico mais ARREDONDADO que o tenis de corrida (quina 2.6 contra 2.0 dele):
// tenis de basquete tem bico mais rombudo, nao afilado — reforca que a
// silhueta de perfil e outra, apesar do metodo ser da mesma familia.
const ALTO_QUINA = [[0.00, 4.4], [0.28, 5.0], [0.52, 3.6], [0.78, 2.8], [1.00, 2.6]]

// Colarinho acolchoado: cano curto de secao eliptica com DOIS bojos (bojo,
// sulco, bojo, sulco) — a "costura de acolchoado" sai do proprio perfil
// oscilando, sem gastar triangulo num relevo separado. A base (S+0.036) fica
// DEBAIXO da altura que o proprio cabedal ja alcanca no tornozelo (TOPO_SOLA
// + H*0.97 ~= S+0.090): o colarinho nasce enterrado dentro do cabedal e so
// aparece a partir de onde ele de fato sobra pra cima — nao ha costura de
// emenda pra casar em raio exato, o mesmo truque de nesting da bota normal.
function canoAlto(S) {
  return [
    [0.0402, 0.0512, -0.023, S + 0.034],
    [0.0460, 0.0578, -0.022, S + 0.052],   // bojo 1 (~6 mm de oscilacao: o
    [0.0392, 0.0496, -0.021, S + 0.066],   // sulco    primeiro rascunho so
    [0.0464, 0.0582, -0.020, S + 0.082],   // bojo 2   oscilava uns 4 mm e o
    [0.0400, 0.0504, -0.019, S + 0.096],   // sulco    bojo nao se destacava
    [0.0428, 0.0522, -0.018, S + 0.108],   // rebordo, o pico
    [0.0300, 0.0364, -0.018, S + 0.104],   // rola pra dentro
    [0.0234, 0.0250, -0.018, S + 0.094],   // fecha dentro da canela
  ]
}

function fazTenisCanoAlto(c) {
  const S = c.medida.SOLA_Y
  const cor = c.cor.calcado
  const g = new THREE.Group()
  const mCabedal = tecido(cor, 0.52)
  // Acolchoado e lingua: FOSCO (0.92) contra o cabedal semi-liso (0.52) — o
  // contraste de material e que vende "isto e espuma macia", nao a cor.
  const mPadding = tecido(0xD9D2C2, 0.92)
  const mMidBaixo = tecido(0xF1EEE4, 0.90)
  const mMidCima = tecido(esc(cor, 0.70), 0.85)
  const mSolado = tecido(0x232220, 0.94)
  const mLinha = tecido(0xEAE3D2, 0.75)
  const mMetal = metal(0xb9b9c0)
  const mCadarco = tecido(0xEFEBE0, 0.82)

  const N = 10, W = 0.052, H = 0.052
  const H_OUT = 0.010      // solado fino
  const H_MID = 0.030      // entressola CHUNKY, em duas camadas
  const Y_MID = S + H_OUT + H_MID * 0.55
  const TOPO_SOLA = S + H_OUT + H_MID

  // --- cabedal ---
  const maUp = tecelagem()
  const aneis = []
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    aneis.push(secaoCabedal(N, curva(PLANTA, t) * W, curva(ALTO_ALTURA, t) * H,
      TOPO_SOLA, Z_TRAS + (Z_BICO - Z_TRAS) * t, curva(ALTO_QUINA, t)))
  }
  lofte(maUp, aneis)
  g.add(malhaDe(maUp, mCabedal))

  // --- entressola em DUAS camadas: EVA branca larga embaixo (mais fora),
  // espuma da cor do jogador estreita em cima — o degrau entre as duas E a
  // "entressola em duas camadas" do pedido, um corte de GEOMETRIA (dois lofts
  // com fora diferente), nao textura.
  const maOut = tecelagem()
  laje(maOut, 0.00, 1.00, W, S, S + H_OUT, 0.0058, 5.0, 0.16, 10)
  // tacos de solado, alternados — sem eles o solado fino le como sapatilha
  for (let i = 0; i < 7; i++) {
    const t = 0.06 + 0.88 * (i / 6)
    const wMeia = curva(PLANTA, t) * W
    for (const s of [1, -1]) {
      _m4.identity()
      _m4.setPosition(s * wMeia * 0.62, S - 0.0016, Z_TRAS + (Z_BICO - Z_TRAS) * t)
      cubo(maOut, _m4, 0.010, 0.0028, 0.014)
    }
  }
  g.add(malhaDe(maOut, mSolado))
  const maMidBaixo = tecelagem()
  laje(maMidBaixo, 0.00, 1.00, W, S + H_OUT, Y_MID, 0.0066, 4.6, 0.10, 10)
  g.add(malhaDe(maMidBaixo, mMidBaixo))
  const maMidCima = tecelagem()
  laje(maMidCima, 0.00, 1.00, W, Y_MID, TOPO_SOLA, 0.0024, 4.4, 0.10, 10)
  g.add(malhaDe(maMidCima, mMidCima))

  // --- costura da vira, entre cabedal e entressola ---
  const maCostura = tecelagem()
  costura(maCostura, {
    n: 7, t0: 0.10, t1: 0.94, z0: Z_TRAS, z1: Z_BICO,
    ponto: (t) => [curva(PLANTA, t) * W + 0.0056, TOPO_SOLA - 0.003],
  })
  g.add(malhaDe(maCostura, mLinha))

  // --- colarinho acolchoado: cano curto, dois bojos ---
  const perfilColar = canoAlto(S)
  const maColar = tecelagem()
  lofte(maColar, perfilColar.map((p) => secaoCano(12, p[0], p[1], p[2], p[3])), false, true)
  g.add(malhaDe(maColar, mPadding))

  // --- lingua ALTA: placa curta que sobe por cima do colarinho ---
  // A primeira versao media a base la embaixo, no primeiro ilho (t=0.20) —
  // deu uma placa de 8,7 cm inclinada de banda, que lia como uma cunha cinza
  // solta atras do tenis, nao como lingua. Uma lingua de verdade so aparece
  // por CIMA do colarinho (o resto fica escondido por dentro do laco); a
  // versao daqui nasce dentro do proprio colarinho (S+0.095, abaixo do pico
  // em S+0.108) e sobe so 3,5 cm — E o z fica perto de zc+rz (a FRENTE do
  // cano naquela altura, ~0.03), nao perto do eixo central (zc~-0.019): a
  // primeira versao pos a lingua quase no eixo, que e onde a superficie do
  // colarinho fica de LADO, e ela nascia enterrada dentro do proprio couro.
  {
    const yA = S + 0.095, zA = 0.020
    const yB = S + 0.130, zB = 0.010
    const ang = Math.atan2(zB - zA, yB - yA)
    const comp = Math.hypot(yB - yA, zB - zA)
    const lingua = bloco(0.024, comp, 0.005, 0.0018, mPadding)
    lingua.position.set(0, (yA + yB) / 2, (zA + zB) / 2)
    lingua.rotation.x = ang
    g.add(lingua)
  }

  // --- ilhoses + cadarco em X (cinco pares — um a mais que o tenis de
  // corrida, pra subir ate perto da lingua) ---
  const maMetal = tecelagem()
  const maFio = tecelagem()
  const tOlhais = [0.16, 0.27, 0.38, 0.49, 0.59]
  const xEm = (t) => curva(PLANTA, t) * W * 0.32
  const yEm = (t) => TOPO_SOLA + curva(ALTO_ALTURA, t) * H * 0.86
  const zEm = (t) => Z_TRAS + (Z_BICO - Z_TRAS) * t
  for (let i = 0; i < tOlhais.length; i++) {
    const t = tOlhais[i], x = xEm(t), y = yEm(t), z = zEm(t)
    for (const s of [1, -1]) {
      _m4.identity()
      _m4.setPosition(s * x, y, z + 0.0026)
      cubo(maMetal, _m4, 0.0062, 0.0062, 0.0028)
    }
    if (i < tOlhais.length - 1) {
      const t2 = tOlhais[i + 1], y2 = yEm(t2), z2 = zEm(t2)
      for (const s of [1, -1]) {
        _m4.makeRotationZ(s * 0.58)
        _m4.setPosition(0, (y + y2) / 2, (z + z2) / 2 + 0.0038)
        cubo(maFio, _m4, 0.040, 0.0036, 0.0036)
      }
    }
  }
  g.add(malhaDe(maMetal, mMetal))
  g.add(malhaDe(maFio, mCadarco))

  return g
}

// ===========================================================================
// 3. BOTA-CHELSEA — esfera esculpida (familia do mocassim) + cano curto
// (familia da bota)
// ===========================================================================

// Altura RASA de proposito (0.042 contra os 0.068-0.072 do mocassim/social):
// quem cobre o tornozelo aqui e o CANO separado, nao a esfera. Testado com a
// croa alta do mocassim primeiro — o cano nascia enterrado dentro da propria
// esfera e a "bota" lia como mocassim comum, sem cano nenhum a mostra.
const CHELSEA_ALTURA = [
  [0.00, 0.66], [0.12, 0.92], [0.28, 1.00], [0.44, 0.94],
  [0.60, 0.82], [0.75, 0.66], [0.88, 0.46], [1.00, 0.24],
]
const CHELSEA_SOLA = [
  [0.00, 1.00], [0.28, 0.95], [0.40, 0.55], [0.70, 0.50], [1.00, 0.42],
]

/** Ponto da forma da chelsea — a MESMA ideia de pontoMoc/pontoSocial
 *  (calcados.js/calcados-extra.js): a esfera ja afina sozinha nos polos,
 *  sin(theta)^expoente deixa a TABELA mandar no meio do pe. Expoente 0.26,
 *  entre o mocassim (0.30, bico mais cheio) e o sapato social (0.20, bico
 *  fino) — a chelsea e limpa mas nao e um oxford de bico afilado. */
function pontoChelsea(u, phi, o, fora = 0) {
  const sen = Math.sqrt(Math.max(1e-8, 1 - (2 * u - 1) * (2 * u - 1)))
  const k = Math.pow(sen, 0.26)
  const w = curva(PLANTA, u) * o.w * k + fora
  const h = curva(o.perfil || CHELSEA_ALTURA, u) * o.h * k + fora
  return [
    -Math.cos(phi) * w,
    o.base + Math.sin(phi) * h,
    o.z0 + (o.z1 - o.z0) * u,
  ]
}

/** Remapeia uma SphereGeometry pela forma da chelsea — copia de
 *  esculpir()/esculpirSocial() (mesmo motivo do winding invertido: trocar Y
 *  e Z de eixo e uma reflexao, e reflexao vira a mao da malha; sem inverter
 *  os indices o cabedal nao aparece com o culling ligado). */
function esculpirChelsea(g, o, fora = 0) {
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const u = (y + 1) / 2
    const rr = Math.max(1e-6, Math.hypot(x, z))
    const p = pontoChelsea(u, Math.atan2(z / rr, -x / rr), o, fora)
    const cz = z / rr
    pos.setXYZ(i, p[0], cz > 0 ? p[1] : o.base + cz * (o.prato || 0.004), p[2])
  }
  pos.needsUpdate = true
  const idx = g.index
  if (idx) {
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t)
      idx.setX(t, idx.getX(t + 2))
      idx.setX(t + 2, a)
    }
    idx.needsUpdate = true
  }
  g.computeVertexNormals()
  soldarNormais(g)
  return g
}

// Cano curto: fecha bem mais cedo que o da bota de cowboy (pico em S+0.096
// contra S+0.180) — e o "cano baixo" que faz a chelsea ser bota e nao sapato,
// sem virar coturno.
function canoChelsea(S) {
  return [
    [0.0402, 0.0512, -0.024, S + 0.012],
    [0.0414, 0.0524, -0.023, S + 0.034],
    [0.0400, 0.0506, -0.022, S + 0.056],
    [0.0422, 0.0522, -0.021, S + 0.078],
    [0.0436, 0.0530, -0.020, S + 0.096],   // rebordo, o pico
    [0.0304, 0.0364, -0.020, S + 0.092],   // rola pra dentro
    [0.0236, 0.0252, -0.020, S + 0.082],   // fecha dentro da canela
  ]
}

/**
 * Elastico lateral: um PATCH ABERTO (grade que nao fecha a volta, ao
 * contrario de lofte()) recortado da MESMA formula do cano — mesmo raio,
 * mesmo centro — so que abaulado pra fora no meio e afunilado a ZERO nas
 * quatro bordas (bulge = seno em i E em j). O afunilamento nas bordas e o
 * que faz o patch se fundir na superficie do cano sem uma quina de emenda
 * visivel: quem separa as duas pecas e o material (couro liso vira elastico
 * fosco), nao um degrau de geometria.
 */
function elastico(ma, perfilCano, y0, y1, a0, meiaArc, rows, cols, foraMax) {
  const aneis = []
  for (let i = 0; i < rows; i++) {
    const y = y0 + (y1 - y0) * (i / (rows - 1))
    const [rx, rz, zc] = emCano(perfilCano, y)
    const ti = i / (rows - 1)
    const linha = []
    for (let j = 0; j < cols; j++) {
      const tj = j / (cols - 1)
      const a = a0 - meiaArc + 2 * meiaArc * tj
      const fora = foraMax * Math.sin(Math.PI * ti) * Math.sin(Math.PI * tj)
      linha.push([Math.sin(a) * (rx + fora), y, zc + Math.cos(a) * (rz + fora)])
    }
    aneis.push(linha)
  }
  const ids = aneis.map((r) => r.map((p) => ma.v(p[0], p[1], p[2])))
  for (let i = 0; i + 1 < ids.length; i++) {
    for (let j = 0; j + 1 < cols; j++) {
      ma.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j])
    }
  }
}

function fazBotaChelsea(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // Chelsea nao segue a cor do jogador — o mesmo criterio do sapato social:
  // bota social e sempre marrom-escuro ou preta, nunca a cor do personagem.
  const cor = 0x3b2415
  const mCouro = solid(cor, 0.18, 0.09)
  const mSola = solid(esc(cor, 0.46), 0.32, 0.05)
  // Cinza-grafite CLARO, nao quase-preto: a primeira versao (0x201c1e) ficava
  // perto demais do marrom bem escuro do couro (0x3b2415) e as duas so se
  // separavam pelo brilho — de longe, no card do customizador, o gomo
  // elastico sumia. Mais claro ele le como painel de verdade, nao sombra.
  const mElastico = tecido(0x4a464a, 0.58)
  const mFio = tecido(esc(cor, 1.5), 0.74)

  const F = { w: 0.046, h: 0.042, base: S + 0.012, z0: Z_TRAS + 0.002, z1: Z_BICO - 0.002 }

  // --- corpo baixo: esfera esculpida, croa rasa (o cano cobre o resto) ---
  g.add(sh(new THREE.Mesh(esculpirChelsea(new THREE.SphereGeometry(1, 16, 10), F), mCouro)))

  // --- costura lateral do cabedal, logo acima do rebordo da sola ---
  const maFio = tecelagem()
  costura(maFio, {
    n: 8, t0: 0.08, t1: 0.94, z0: F.z0, z1: F.z1, comp: 0.0072,
    ponto: (t) => {
      const q = pontoChelsea(t, 0.24, F, 0.0016)
      return [Math.abs(q[0]), q[1]]
    },
  })
  g.add(malhaDe(maFio, mFio))

  // --- sola: a mesma escultura, esmagada, salto baixo ---
  g.add(sh(new THREE.Mesh(esculpirChelsea(new THREE.SphereGeometry(1, 14, 6), {
    w: 0.049, h: 0.020, base: S + 0.004, prato: 0.004,
    perfil: CHELSEA_SOLA, z0: F.z0, z1: F.z1,
  }), mSola)))
  const salto = bloco(0.044, 0.010, 0.046, 0.006, mSola)
  salto.position.set(0, S + 0.0035, F.z0 + 0.028)
  g.add(salto)

  // --- cano curto, secao eliptica ---
  const perfilCano = canoChelsea(S)
  const maCano = tecelagem()
  lofte(maCano, perfilCano.map((p) => secaoCano(12, p[0], p[1], p[2], p[3])), false, true)
  g.add(malhaDe(maCano, mCouro))

  // --- elastico lateral: patch aberto, abaulado, afunilado nas bordas ---
  const maElastico = tecelagem()
  elastico(maElastico, perfilCano, S + 0.016, S + 0.082, Math.PI / 2, 0.40, 5, 6, 0.0030)
  elastico(maElastico, perfilCano, S + 0.016, S + 0.082, -Math.PI / 2, 0.40, 5, 6, 0.0030)
  g.add(malhaDe(maElastico, mElastico))

  // --- puxador atras ---
  const pico = perfilCano[4]
  g.add(puxador(pico[3], pico[2] - pico[1], mCouro, 0.013, 0.024, 0.0065, -0.32))

  return g
}

// ===========================================================================
export const CALCADOS_EXTRA2 = [
  {
    id: 'bota-cauboi',
    nome: 'Bota de cowboy',
    metodo: 'loft de secoes (familia da bota): bico pontudo por quina baixa + taper extra, cano alto de secao eliptica sem cadarco, salto empilhado em 3 blocos underslung e costura em V amostrada na frente do proprio cano',
    esconde: ['pe'],
    build(c) { return par(c, () => fazBotaCauboi(c)) },
  },
  {
    id: 'tenis-cano-alto',
    nome: 'Tenis cano alto',
    metodo: 'loft de secoes (familia do tenis de corrida): colarinho acolchoado em dois bojos (segundo loft eliptico curto), lingua alta em placa inclinada, entressola em duas camadas empilhadas e ilhoses/cadarco em X',
    esconde: ['pe'],
    build(c) { return par(c, () => fazTenisCanoAlto(c)) },
  },
  {
    id: 'bota-chelsea',
    nome: 'Bota chelsea',
    metodo: 'esfera esculpida (familia do mocassim) com croa rasa + cano curto de secao eliptica por cima (familia da bota); o elastico lateral e um patch aberto da propria grade do cano, abaulado no centro e afunilado nas bordas',
    esconde: ['pe'],
    build(c) { return par(c, () => fazBotaChelsea(c)) },
  },
]

export default CALCADOS_EXTRA2
