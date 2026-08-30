import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  sh, esc, tecido, couro, couro2, metal, malha, tubo, bloco, anel, par,
} from './nucleo.js'
import { soldarNormais, tecelagem } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/calcados-extra.js — 3 calcados NOVOS pra somar ao catalogo
// (calcados.js continua com descalco/bota/chinelo/coturno/mocassim intactos;
// a fiacao — inclusive apagar o item 02 do catalogo base — e feita por fora).
//
// O pedido: 'tenis-corrida' (entressola grossa + recortes), 'tenis-skate'
// (cano baixo, biqueira reforcada, sola vulcanizada) e 'sapato-social' (bico
// fino, salto baixo, brilho de couro).
//
// MESMO PADRAO DE calcados.js: um metodo de construcao por item, todos vindos
// da MESMA familia matematica dos 4 originais (nao ha um quinto jeito
// fundamentalmente novo de gerar casca de sapato — ha loft-de-secoes,
// lathe-deitada e esfera-esculpida; o bezier-extrudado do chinelo e o unico
// que nao serve aqui, porque e um metodo de SOLA ABERTA pra dedo a mostra, e
// os tres pedidos sao calcados FECHADOS):
//
//   tenis-corrida  LOFT DE SECOES (a familia da bota): cabedal baixo de
//                  tenis + entressola em DOIS blocos empilhados (calcanhar e
//                  dianteiro) com um vao REAL entre eles — nao textura, um
//                  buraco que a camera atravessa — e solado fino por baixo
//                  conectando os dois blocos (o "shank" que impede o tenis de
//                  parecer partido ao meio).
//   tenis-skate    REVOLUCAO NO EIXO Z (a familia do coturno): perfil baixo e
//                  largo, biqueira em SEGUNDA revolucao (2 mm por fora,
//                  reforcada) e um CUPSOLE — uma terceira revolucao mais larga
//                  que sobe pela lateral do cabedal, a marca registrada do
//                  tenis vulcanizado.
//   sapato-social  ESFERA ESCULPIDA (a familia do mocassim): mesmo metodo,
//                  expoente do afunilamento MENOR (bico mais fino e mais
//                  comprido), couro de rugosidade baixa (brilho) e a curva de
//                  sola com o degrau de salto baixo do proprio mocassim,
//                  re-tunada mais rasa.
//
// A REGRA DO COLARINHO (calcados.js, cabecalho): esconde:['pe'] apaga o pe
// INTEIRO e o que sobra em volta do tornozelo e a PONTA da canela (ela afina
// ate quase zero em y=-0.0184). "Todo calcado deste arquivo sobe ate pelo
// menos y=-0.012 em volta do tornozelo" — e um calcado BAIXO (as tres pecas
// daqui sao baixas: tenis sem cano, sapato social sem cano) tem o cabedal
// mais baixo bem NA LATERAL do pe, exatamente onde o tornozelo esta. O
// mocassim original resolve isso com um colarinho (`anel`) em y = SOLA_Y +
// 0.076 — o mesmo numero, testado, e reaproveitado aqui nos tres, cada um so
// escalado pro proprio contorno. Sem ele a lateral do cano baixo bem que
// alcanca uns -0.05 e sobra um vao ate a ponta da canela.
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

/**
 * A forma da planta do pe (meia largura normalizada, calcanhar->bico). E a
 * MESMA tabela de calcados.js — nao exportada de la, copiada aqui de
 * proposito: e medida do boneco (a cintura em 45%, a cabeca dos metatarsos em
 * 72%), nao um numero de estilo, e as tres pecas daqui tem que assentar no
 * MESMO pe que as outras cinco.
 */
const PLANTA = [
  [0.00, 0.30], [0.05, 0.60], [0.14, 0.76], [0.28, 0.78],
  [0.45, 0.73], [0.60, 0.89], [0.72, 1.00], [0.83, 0.96],
  [0.92, 0.78], [0.97, 0.54], [1.00, 0.20],
]

/** Malha de um acumulador de tecelagem, com as normais ja soldadas. */
function malhaDe(ma, mat) {
  return sh(new THREE.Mesh(soldarNormais(ma.geo()), mat))
}

/** Loft por aneis dentro de um acumulador de tecelagem — o mesmo helper de
 *  calcados.js (nao exportado de la). Ver o comentario extenso na origem:
 *  resumo, a volta fecha por INDICE (sem coluna duplicada da LatheGeometry). */
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

/** Caixinha somada a UMA malha compartilhada (ilho, ponto de costura, taco de
 *  solado) — o mesmo cubo() de calcados.js. */
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

/**
 * A COSTURA entre cabedal e sola — o mesmo helper de calcados.js. `ponto(t)`
 * devolve [meia largura, altura] da superficie naquele trecho; a linha segue
 * a tangente do contorno pra nao boiar nem afundar. Ver o original pra mais
 * contexto: e a linha que separa duas pecas de material diferente, sem ela o
 * cabedal parece ter brotado da sola.
 */
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
      cubo(ma, _m4, 0.0026, 0.0020, o.comp || 0.0085)
    }
  }
}

/**
 * Colarinho de seguranca: anel oval que fecha a lateral baixa do cano contra
 * a ponta da canela — ver a nota do cabecalho. Mesmo y do mocassim
 * (SOLA_Y + 0.076): e o numero ja testado do catalogo base, nao um chute
 * novo por peca.
 */
function colarinho(S, mat, rx, ry, dz) {
  const g = anel(rx, 0.0056, mat, 4, 14)
  g.rotation.x = Math.PI / 2
  g.scale.set(1, ry / rx, 1)
  g.position.set(0, S + 0.076, dz)
  return g
}

// ===========================================================================
// 1. TENIS-CORRIDA — loft de secoes (familia da bota)
// ===========================================================================

/** Secao transversal do cabedal (superelipse cujo expoente muda ao longo do
 *  pe) — copiada de calcados.js: e a mesma matematica que faz a bota nao ler
 *  como bloco, e o tenis precisa dela do mesmo jeito. */
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

// Altura do cabedal (baixo — e um tenis sem cano, nao uma bota). Pico em 24%
// como na bota (o peito do pe), mas o TOPO e mais baixo: 0.050 de H contra os
// 0.058 dela, e o suficiente pra cobrir o colarinho de seguranca por dentro.
const TENIS_ALTURA = [
  [0.00, 0.56], [0.10, 0.88], [0.24, 1.00], [0.40, 0.94],
  [0.55, 0.80], [0.70, 0.64], [0.85, 0.48], [1.00, 0.28],
]
const TENIS_QUINA = [[0.00, 4.4], [0.28, 5.0], [0.52, 3.4], [0.78, 2.4], [1.00, 2.0]]

function fazTenisCorrida(c) {
  const S = c.medida.SOLA_Y
  const cor = c.cor.calcado
  const g = new THREE.Group()
  const mCabedal = tecido(cor, 0.82)
  const mOverlay = tecido(esc(cor, 0.60), 0.85)
  const mEspuma = tecido(0xEDEAE0, 0.90)
  const mSolado = tecido(0x242220, 0.92)
  const mLinha = tecido(0xE7E2D2, 0.75)
  const mMetal = metal(0xb9b9c0)
  const mCadarco = tecido(0xEFEBE0, 0.82)
  const mColar = tecido(esc(cor, 0.82), 0.90)

  const N = 10
  const W = 0.052
  const H = 0.050
  const H_OUT = 0.009      // solado fino, sempre inteiro (o "shank")
  const H_MID = 0.026      // bloco de espuma, EM DOIS PEDACOS com vao real
  const TOPO_SOLA = S + H_OUT + H_MID

  // --- cabedal ---
  const maUp = tecelagem()
  const aneis = []
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    aneis.push(secaoCabedal(N, curva(PLANTA, t) * W, curva(TENIS_ALTURA, t) * H,
      TOPO_SOLA, Z_TRAS + (Z_BICO - Z_TRAS) * t, curva(TENIS_QUINA, t)))
  }
  lofte(maUp, aneis)
  g.add(malhaDe(maUp, mCabedal))

  // overlay do bico: SEGUNDA secaoCabedal, 1,8 mm por fora e so na ponta —
  // o reforco de TPU que todo tenis de corrida tem no bico, feito com a
  // mesma tecnica da biqueira do coturno (offset + recorte, nao uma casca
  // solta boiando na frente).
  const maOverlay = tecelagem()
  const aneisOverlay = []
  for (let i = 7; i < 12; i++) {
    const t = i / 11
    aneisOverlay.push(secaoCabedal(N, curva(PLANTA, t) * W + 0.0018, curva(TENIS_ALTURA, t) * H * 0.72,
      TOPO_SOLA, Z_TRAS + (Z_BICO - Z_TRAS) * t, curva(TENIS_QUINA, t)))
  }
  lofte(maOverlay, aneisOverlay)
  g.add(malhaDe(maOverlay, mOverlay))

  // --- entressola: DOIS blocos com um vao de verdade entre 40% e 55% ---
  // (a regiao do arco) — o RECORTE pedido. So o solado fino embaixo continua
  // inteiro ali, exatamente como o salto/planta da bota ja fazem separados
  // um do outro; aqui o vao e maior e de proposito, pra ler como janela.
  const maMid = tecelagem()
  laje(maMid, 0.00, 0.40, W, S + H_OUT, TOPO_SOLA, 0.0026, 4.6, 0.10, 5)
  laje(maMid, 0.55, 1.00, W, S + H_OUT, TOPO_SOLA, 0.0022, 4.2, 0.10, 6)
  g.add(malhaDe(maMid, mEspuma))

  const maOut = tecelagem()
  laje(maOut, 0.00, 1.00, W, S, S + H_OUT, 0.0032, 5.0, 0.20, 10)
  // tacos de solado: pequenos relevos ao longo do comprimento, alternados —
  // sem eles o solado fino le como uma sola lisa de sapatilha, nao de tenis.
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

  // --- ilhos + cadarco em X + lingueta ---
  const maMetal = tecelagem()
  const maFio = tecelagem()
  const tOlhais = [0.20, 0.32, 0.44, 0.56]
  const xEm = (t) => curva(PLANTA, t) * W * 0.32
  const yEm = (t) => TOPO_SOLA + curva(TENIS_ALTURA, t) * H * 0.86
  const zEm = (t) => Z_TRAS + (Z_BICO - Z_TRAS) * t
  for (let i = 0; i < tOlhais.length; i++) {
    const t = tOlhais[i], x = xEm(t), y = yEm(t), z = zEm(t)
    for (const s of [1, -1]) {
      _m4.identity()
      _m4.setPosition(s * x, y, z + 0.0026)
      cubo(maMetal, _m4, 0.0064, 0.0064, 0.0030)
    }
    if (i < tOlhais.length - 1) {
      const t2 = tOlhais[i + 1], y2 = yEm(t2), z2 = zEm(t2)
      for (const s of [1, -1]) {
        _m4.makeRotationZ(s * 0.60)
        _m4.setPosition(0, (y + y2) / 2, (z + z2) / 2 + 0.0038)
        cubo(maFio, _m4, 0.042, 0.0038, 0.0038)
      }
    }
  }
  g.add(malhaDe(maMetal, mMetal))
  // lingueta: placa inclinada entre o primeiro e o ultimo par de ilhos,
  // seguindo a MESMA inclinacao que os dois pontos do perfil ditam — a mesma
  // logica de lingueta() da bota, so amostrada em (t, altura) em vez de um
  // perfilCano.
  {
    const tA = tOlhais[0], tB = tOlhais[tOlhais.length - 1]
    const yA = TOPO_SOLA + curva(TENIS_ALTURA, tA) * H * 0.50
    const yB = yEm(tB)
    const zA = zEm(tA) + 0.0015, zB = zEm(tB) + 0.0015
    _m4.makeRotationX(Math.atan2(zB - zA, yB - yA))
    _m4.setPosition(0, (yA + yB) / 2, (zA + zB) / 2)
    cubo(maFio, _m4, 0.030, Math.hypot(yB - yA, zB - zA), 0.0044)
  }
  g.add(malhaDe(maFio, mCadarco))

  // --- costura da vira ---
  const maCostura = tecelagem()
  costura(maCostura, {
    n: 7, t0: 0.10, t1: 0.94, z0: Z_TRAS, z1: Z_BICO,
    ponto: (t) => [curva(PLANTA, t) * W + 0.0058, TOPO_SOLA - 0.003],
  })
  g.add(malhaDe(maCostura, mLinha))

  // --- colarinho de seguranca (ver nota do cabecalho) ---
  g.add(colarinho(S, mColar, 0.030, 0.042, -0.014))
  return g
}

// ===========================================================================
// 2. TENIS-SKATE — revolucao no eixo Z (familia do coturno)
// ===========================================================================

/** LatheGeometry deitada, achatada e modulada em altura, grampeada no chao —
 *  copiada de calcados.js (a mesma razao do coturno: biqueira e calcanhar
 *  saem redondos de graca, por construcao). */
function torpedo(perfil, o) {
  const pts = perfil.map((p) => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, o.seg, 1.30, Math.PI * 2 - 2.60)
  g.rotateX(Math.PI / 2)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const k = o.modY ? curva(o.modY, (pos.getZ(i) - Z_TRAS) / (Z_BICO - Z_TRAS)) : 1
    const y = pos.getY(i) * o.escala * k + o.base
    pos.setY(i, y < o.chao ? o.chao : y)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  soldarNormais(g)
  return g
}

/** Perfil [raio, z] tirado da planta, com serrilha opcional (travas de solado). */
function perfilPlanta(w, fora, n, ondula = 0) {
  const p = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    p.push([curva(PLANTA, t) * w + fora + (ondula ? Math.sin(t * 26) * ondula : 0),
      Z_TRAS + (Z_BICO - Z_TRAS) * t])
  }
  return p
}

// Baixo e largo (perfil de skate, nao de combate): pico mais cedo (peito do
// pe) e queda mais suave que o coturno.
const SKATE_ALTURA = [
  [0.00, 0.70], [0.14, 0.98], [0.30, 1.00], [0.48, 0.90],
  [0.66, 0.76], [0.82, 0.58], [1.00, 0.38],
]

function fazTenisSkate(c) {
  const S = c.medida.SOLA_Y
  const cor = c.cor.calcado
  const g = new THREE.Group()
  const mCouro = couro(cor)
  const mBico = couro(esc(cor, 1.22))        // biqueira mais clara: gasto de
  // lona/camurca na ponta, a mesma leitura que o coturno usa na dele
  const mCupsole = tecido(0xEDEAE2, 0.88)    // borracha vulcanizada crua
  const mSolado = tecido(0xD8D2C4, 0.90)
  const mLinha = tecido(0x3a362e, 0.80)
  const mMetal = metal(0x8f8a80)
  const mColar = couro(esc(cor, 0.85))

  const W = 0.052
  // TOPO_SOLA/escala NAO SAO SO ESTILO — sao a conta do colarinho de
  // seguranca (ver cabecalho). Um torpedo tem secao CIRCULAR (y = raio*sin(a)
  // antes do modY), diferente da superelipse do tenis-corrida: sin(a) sobe
  // BEM mais devagar perto do lado puro do que sin(a)^0.42 sobe, entao a
  // mesma folga em graus cobre MENOS altura aqui. Com TOPO_SOLA em S+0.026 e
  // escala 1.10 (a primeira tentativa), o TOPO da secao no tornozelo (t=0.34)
  // nao passava de y=-0.018 — abaixo do piso de -0.012 mesmo na CROA, sem
  // nem chegar na lateral. Com S+0.033/1.22 a croa sobe pra y~=-0.007.
  const TOPO_SOLA = S + 0.033   // acima do cupsole (ver abaixo)
  const ESCALA_CABEDAL = 1.22

  // --- cabedal (a MESMA revolucao pro corpo inteiro, baixa e larga) ---
  const perfilPe = perfilPlanta(W, 0, 12)
  g.add(sh(new THREE.Mesh(torpedo(perfilPe, {
    seg: 14, escala: ESCALA_CABEDAL, base: TOPO_SOLA, chao: TOPO_SOLA - 0.006, modY: SKATE_ALTURA,
  }), mCouro)))
  // biqueira reforcada: SEGUNDA revolucao, 2,6 mm por fora e so no bico —
  // igual a tecnica da biqueira do coturno (mesma formula, assenta exato).
  g.add(sh(new THREE.Mesh(torpedo(perfilPe.slice(7).map((p) => [p[0] + 0.0026, p[1]]), {
    seg: 14, escala: ESCALA_CABEDAL, base: TOPO_SOLA, chao: TOPO_SOLA - 0.004, modY: SKATE_ALTURA,
  }), mBico)))

  // --- sola: solado fino + CUPSOLE grosso envolvendo a base do cabedal ---
  g.add(sh(new THREE.Mesh(torpedo(perfilPlanta(W, 0.0070, 11), {
    seg: 12, escala: 0.008 / (W + 0.0070), base: S, chao: S,
  }), mSolado)))
  g.add(sh(new THREE.Mesh(torpedo(perfilPlanta(W, 0.0120, 11, 0.0014), {
    seg: 12, escala: 0.020 / (W + 0.0120), base: S + 0.002, chao: S + 0.002,
  }), mCupsole)))

  // --- ilhos + cadarco CHATO (caixas achatadas, nao cordao redondo) ---
  const maMetal = tecelagem()
  const maFio = tecelagem()
  const alturaSup = (t) => curva(PLANTA, t) * W * ESCALA_CABEDAL * curva(SKATE_ALTURA, t)
  const tOlhais = [0.24, 0.38, 0.52, 0.64]
  const xEm = (t) => curva(PLANTA, t) * W * 0.30
  const yEm = (t) => TOPO_SOLA + alturaSup(t) * 0.80
  const zEm = (t) => Z_TRAS + (Z_BICO - Z_TRAS) * t
  for (let i = 0; i < tOlhais.length; i++) {
    const t = tOlhais[i], x = xEm(t), y = yEm(t), z = zEm(t)
    for (const s of [1, -1]) {
      _m4.identity()
      _m4.setPosition(s * x, y, z + 0.0028)
      cubo(maMetal, _m4, 0.0072, 0.0072, 0.0032)
    }
    if (i < tOlhais.length - 1) {
      const t2 = tOlhais[i + 1], y2 = yEm(t2), z2 = zEm(t2)
      for (const s of [1, -1]) {
        _m4.makeRotationZ(s * 0.58)
        _m4.setPosition(0, (y + y2) / 2, (z + z2) / 2 + 0.0040)
        cubo(maFio, _m4, 0.046, 0.0060, 0.0022)   // largura > espessura: fio CHATO
      }
    }
  }
  g.add(malhaDe(maMetal, mMetal))
  g.add(malhaDe(maFio, mSolado))

  // --- costura entre cabedal e cupsole ---
  const maCostura = tecelagem()
  costura(maCostura, {
    n: 8, t0: 0.08, t1: 0.95, z0: Z_TRAS, z1: Z_BICO, comp: 0.0078,
    ponto: (t) => [curva(PLANTA, t) * W + 0.0100, S + 0.020],
  })
  g.add(malhaDe(maCostura, mLinha))

  // --- colarinho de seguranca ---
  g.add(colarinho(S, mColar, 0.031, 0.043, -0.014))
  return g
}

// ===========================================================================
// 3. SAPATO-SOCIAL — esfera esculpida (familia do mocassim)
// ===========================================================================

// Altura mais RASA que o mocassim (0.058 relativo, sapato social senta baixo
// no pe) e o pico um pouco mais cedo.
const SOCIAL_ALTURA = [
  [0.00, 0.60], [0.10, 0.86], [0.26, 0.96], [0.40, 0.90],
  [0.56, 0.78], [0.70, 0.62], [0.85, 0.42], [1.00, 0.18],
]
const SOCIAL_SOLA = [
  [0.00, 1.00], [0.28, 0.94], [0.40, 0.52], [0.70, 0.46], [1.00, 0.38],
]

/**
 * Ponto da forma do sapato social — a MESMA ideia de pontoMoc (a esfera ja
 * afina sozinha nos polos; guardar so sin(theta)^pexp deixa a TABELA mandar
 * no meio do pe e a esfera mandar nas duas pontas), com UM numero trocado: o
 * expoente e 0.20 contra 0.30 do mocassim. Expoente menor fecha a ponta MAIS
 * DEPRESSA — e o "bico fino" que separa sapato social de mocassim usando a
 * mesma formula.
 */
function pontoSocial(u, phi, o, fora = 0) {
  const sen = Math.sqrt(Math.max(1e-8, 1 - (2 * u - 1) * (2 * u - 1)))
  const k = Math.pow(sen, 0.20)
  const w = curva(PLANTA, u) * o.w * k + fora
  const h = curva(o.perfil || SOCIAL_ALTURA, u) * o.h * k + fora
  return [
    -Math.cos(phi) * w,
    o.base + Math.sin(phi) * h,
    o.z0 + (o.z1 - o.z0) * u,
  ]
}

/** Remapeia uma SphereGeometry pela forma do sapato social — copia de
 *  esculpir() em calcados.js (mesmo motivo do winding invertido: trocar Y e Z
 *  de lugar e uma reflexao, e reflexao vira a mao da malha; sem inverter os
 *  indices o cabedal nao aparece com o culling ligado). */
function esculpirSocial(g, o, fora = 0) {
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const u = (y + 1) / 2
    const rr = Math.max(1e-6, Math.hypot(x, z))
    const p = pontoSocial(u, Math.atan2(z / rr, -x / rr), o, fora)
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

function fazSapatoSocial(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // SAPATO SOCIAL NAO SEGUE A COR ESCOLHIDA, e e o unico do trio que nao
  // segue. Os outros dois (corrida e skate) sao tenis, e tenis colorido e o
  // normal; sapato social branco nao existe. Na grade do catalogo os tres
  // sairam brancos e viraram tres manchas iguais — o mocassim de calcados.js
  // ja resolvia isso do mesmo jeito, cravando o marrom dele.
  const cor = 0x1b1714
  const mCouro = solid(cor, 0.16, 0.10)      // brilho de couro alto — a
  // razao de nao usar couro()/couro2() (0.42 de rugosidade) e a mesma da
  // calca de couro: sem environment map na cena, e o especular do sol que
  // vende o brilho, entao a rugosidade tem que ser baixa de verdade.
  const mSola = solid(esc(cor, 0.42), 0.30, 0.06)
  const mFio = tecido(esc(cor, 1.35), 0.72)
  const mMetal = metal(0xb9b9c0)
  const mColar = solid(cor, 0.20, 0.10)

  // z1 vai 1 cm ALEM do Z_BICO do pe descalco: o bico do sapato social
  // continua mais que o dedo, e e essa sobra (com o expoente baixo puxando
  // pra zero) que estica a ponta fina em vez de so encolher o volume que
  // ja existe.
  //
  // h/base NAO SAO mais rasos que o mocassim, apesar do primeiro instinto: a
  // secao de pontoSocial e uma ELIPSE (x=-w*cos(phi), y=base+h*sin(phi)), e
  // no PE do "phi" (o lado puro do sapato) ela sempre cai em y=base, nao em
  // base+h — a altura MAXIMA da secao no tornozelo (u~=0.31) e so
  // base+h*curva(SOCIAL_ALTURA,u)*k, e com h=0.058/base=S+0.012 essa CROA
  // parava em y~=-0.022, abaixo do piso -0.012 do colarinho de seguranca
  // (conferido com o mesmo calculo que o mocassim passa por pouco: mocassim
  // fecha em y~=-0.008 com h=0.068/base=S+0.014). h=0.072/base=S+0.015 fecha
  // em y~=-0.006 — o bico fino desta peca vem do EXPOENTE (0.20) e do z1
  // esticado, nao de uma calota mais baixa.
  const F = {
    w: 0.044, h: 0.072, base: S + 0.015, z0: Z_TRAS + 0.004, z1: Z_BICO + 0.012,
  }

  // --- cabedal: a esfera inteira ---
  g.add(sh(new THREE.Mesh(esculpirSocial(new THREE.SphereGeometry(1, 16, 10), F), mCouro)))

  // --- costura de cap-toe: a linha curva do bico, marca registrada do
  // oxford. Reaproveita costura() com ponto(t) amostrando pontoSocial no
  // trecho u=[0.30,0.52] em vez do perfil de planta da bota/tenis. ---
  const maFio = tecelagem()
  const uCap0 = 0.30, uCap1 = 0.52
  costura(maFio, {
    n: 7, t0: 0, t1: 1,
    z0: F.z0 + (F.z1 - F.z0) * uCap0, z1: F.z0 + (F.z1 - F.z0) * uCap1,
    ponto: (t) => {
      const u = uCap0 + (uCap1 - uCap0) * t
      const q = pontoSocial(u, 0.30, F, 0.0018)
      return [Math.abs(q[0]), q[1]]
    },
  })
  // costura lateral do cabedal, logo acima do rebordo da sola (a mesma ideia
  // do mocassim: sai de pontoSocial em vez de y fixo, porque a altura da
  // forma muda muito do calcanhar pro peito do pe).
  costura(maFio, {
    n: 8, t0: 0.08, t1: 0.94, z0: F.z0, z1: F.z1, comp: 0.0075,
    ponto: (t) => {
      const q = pontoSocial(t, 0.24, F, 0.0016)
      return [Math.abs(q[0]), q[1]]
    },
  })

  // --- ilhos + cadarco fino (redondo) ---
  const maMetal = tecelagem()
  for (let i = 0; i < 3; i++) {
    const u = 0.56 + i * 0.115
    const q = pontoSocial(u, 0.60, F, 0.0020)
    for (const s of [1, -1]) {
      _m4.identity()
      _m4.setPosition(s * Math.abs(q[0]), q[1], q[2] + 0.0018)
      cubo(maMetal, _m4, 0.0052, 0.0052, 0.0026)
    }
    if (i > 0) {
      const uA = 0.56 + (i - 1) * 0.115
      const qa = pontoSocial(uA, 0.60, F, 0.0020)
      for (const s of [1, -1]) {
        _m4.makeRotationZ(s * 0.66)
        _m4.setPosition(0, (q[1] + qa[1]) / 2, (q[2] + qa[2]) / 2 + 0.0032)
        cubo(maFio, _m4, 0.036, 0.0032, 0.0032)
      }
    }
  }
  g.add(malhaDe(maMetal, mMetal))
  g.add(malhaDe(maFio, mFio))

  // --- sola: a mesma escultura, esmagada, com a curva de salto baixo ---
  g.add(sh(new THREE.Mesh(esculpirSocial(new THREE.SphereGeometry(1, 14, 6), {
    w: 0.049, h: 0.020, base: S + 0.004, prato: 0.004,
    perfil: SOCIAL_SOLA, z0: F.z0, z1: F.z1,
  }), mSola)))
  // salto baixo mas definido: a lamina escura que desce alem da sola, a
  // mesma tecnica da tapa do salto do mocassim — e ela que da o degrau na
  // silhueta de perfil, nao a espessura da sola sozinha.
  const salto = bloco(0.046, 0.010, 0.048, 0.006, mSola)
  salto.position.set(0, S + 0.0035, F.z0 + 0.030)
  g.add(salto)

  // --- colarinho de seguranca ---
  g.add(colarinho(S, mColar, 0.029, 0.040, -0.014))
  return g
}

// ===========================================================================
export const CALCADOS_EXTRA = [
  {
    id: 'tenis-corrida',
    nome: 'Tenis de corrida',
    metodo: 'loft de secoes (familia da bota): cabedal baixo + entressola em dois blocos com vao real entre eles (o recorte) + solado fino continuo por baixo',
    esconde: ['pe'],
    build(c) { return par(c, () => fazTenisCorrida(c)) },
  },
  {
    id: 'tenis-skate',
    nome: 'Tenis de skate',
    metodo: 'revolucao no eixo Z (familia do coturno): perfil baixo e largo, biqueira reforcada em segunda revolucao, cupsole vulcanizado envolvendo a base',
    esconde: ['pe'],
    build(c) { return par(c, () => fazTenisSkate(c)) },
  },
  {
    id: 'sapato-social',
    nome: 'Sapato social',
    metodo: 'esfera esculpida (familia do mocassim), expoente do afunilamento menor pro bico fino; couro de rugosidade baixa e curva de sola com salto baixo',
    esconde: ['pe'],
    build(c) { return par(c, () => fazSapatoSocial(c)) },
  },
]

export default CALCADOS_EXTRA
