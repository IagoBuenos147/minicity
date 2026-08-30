import * as THREE from 'three'
import {
  HEAD_S, HEAD, clamp, mix, rng, shade,
  useHead, activeHead, eggSurface, pontoNaPele,
  byAz, hairMat, peloMat, tecelagem, fio, beardColorFrom, soldarNormais, sh,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/barba-extra3.js — SEIS BARBAS CHEIAS, a metade de BAIXO de
// um cartaz "Barber's Guide to 24 Beard Styles": rabo-de-pato, garfo frances,
// cheia classica, Old Dutch, Garibaldi e Bandholz.
//
// A REGRA QUE MAIS IMPORTA (ver CONTRATO.md e o comentario da barba 'cheia' em
// barba.js): peca que preenche da linha de corte ATE O POLO DO QUEIXO tapa a
// boca se for desenhada com UM corte por coluna de azimute. As seis barbas
// deste arquivo cobrem bochecha inteira ate o queixo — todas dependem do
// truque da 'cheia': o MANTO tem SEMPRE DUAS FAIXAS por coluna (acima e abaixo
// da boca), com a boca virando um FURO DE VERDADE (a elipse furoCima/furoBaixo)
// em vez de um corte unico que empurraria a barba por cima dos labios.
//
// A funcao que faz isso em barba.js (comentario "com FURO DE VERDADE na
// boca") chama-se `manto()` mas NAO E EXPORTADA — so a lista final (BARBAS)
// sai de la, os helpers ficam privados do arquivo. Este modulo carrega a
// PROPRIA copia (`cascaComFuro`, adiante, mesmo algoritmo), pela mesma razao
// que barba-extra.js ja carrega a propria copia de thetaEmY/descidaNaPele/etc:
// cada modulo de rosto que precisa de um helper de barba.js repete as poucas
// linhas em vez de exportar meio arquivo pra import.
//
// AS SEIS SAO O MESMO METODO — a receita da 'cheia': MANTO com furo + MECHAS
// penteadas numa grade + FRANJA densa nas duas bordas — reaproveitado por
// `construirBarbaCheia()` com parametros diferentes. Exatamente a mesma ideia
// que barba-extra.js usa pra REGIAO/FAIXA/patchQueixo: uma peca de barba real
// quase nunca muda de METODO, muda de ONDE tem pelo e ONDE nao tem. O que
// varia de uma barba pra outra aqui:
//
//   loY(az)     ate onde a bochecha sobe. ALTA na frente (perto do nariz) liga
//               o bigode a barba num pedaco so; BAIXA (na ou abaixo da borda
//               de baixo do furo) deixa o buco raspado — e a UNICA diferenca
//               entre "tem bigode" e "nao tem" neste arquivo, nao uma peca a
//               parte.
//   COMP(az)    comprimento relativo do pelo por azimute — e ela que desenha
//               a SILHUETA DE BAIXO. O manto sempre desce ate o polo do
//               queixo (a pele nao tem por onde ir alem disso): quem faz um
//               trecho da barba parecer mais comprido ou mais curto e o pelo
//               que passa da pele, e isso e comprimento de mecha, nao
//               geometria de casca. Ponta unica, garfo, plato quadrado, curva
//               arredondada e o plato mais alto de todos (Bandholz) saem
//               todos de tabelas COMP diferentes sobre o MESMO metodo.
//   extra(...)  gancho opcional pra tufos DEDICADOS que uma tabela de
//               comprimento sozinha nao desenha limpo — a ponta unica do
//               rabo-de-pato, as duas pontas do garfo frances e a franja solta
//               do Bandholz precisam de fios CONVERGINDO/DIVERGINDO de
//               verdade, nao so "mais compridos ali".
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da boca (tabela do CONTRATO). Mesma referencia de barba.js. */
const Y_BOCA = -0.082 * S

/**
 * Meia largura do FURO da boca, em metros — mesmo valor da 'cheia' em
 * barba.js. A boca cresceu com boca-extra.js (rosto de olho grande, ate 8.5cm
 * de meia-largura) e o furo teve que crescer junto: com um furo menor a barba
 * cheia fecha por cima do sorriso em vez de cercar os labios.
 */
const X_FURO = 0.086

/**
 * Sentinela de "aqui nao tem barba": theta acima de PI nao existe na esfera,
 * entao uma linha de corte que recebe este valor colapsa no polo do queixo e
 * a peca some naquele azimute. Identica a de barba.js.
 */
const FORA = 3.30

/**
 * theta (0 = topo, PI = queixo) da altura y NO CRANIO ATIVO. Copia exata de
 * barba.js — inverso de yAt(): a altura de um ponto so depende de uy, entao
 * uma linha de theta constante E uma linha de altura constante em qualquer
 * um dos 12 craniuns.
 */
function thetaEmY(y) {
  const sp = activeHead()
  return Math.acos(clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1))
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _tg = new THREE.Vector3()
const _lat = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _alvo = new THREE.Vector3()
const _eixo = new THREE.Vector3()
const _h1 = new THREE.Vector3()
const _h2 = new THREE.Vector3()
const _hx = new THREE.Vector3()
const _tu = new THREE.Vector3()
const _tv = new THREE.Vector3()
const _tw = new THREE.Vector3()

/** |x| da pele em (theta, az). Mesma formula de barba.js. */
function xEmAz(theta, az) { return Math.abs(eggSurface(theta, az, 1, _hx).x) }

/**
 * Azimute em que a pele passa por |x| = alvo, na altura `theta`. x cresce
 * quase proporcional a az perto do meio do rosto, entao escalar o palpite
 * pela razao converge em 3 passadas sem bisseccao. Copia de barba.js.
 */
function azEmX(theta, alvo) {
  let az = 0.40
  for (let k = 0; k < 3; k++) {
    const xa = xEmAz(theta, az)
    if (xa < 1e-5) break
    az = clamp(az * (alvo / xa), 0.06, 1.40)
  }
  return az
}

/**
 * Direcao "descendo PELA PELE" em (theta, az) — de onde o pelo cai. Sai de
 * duas amostras de eggSurface e nao de (0,-1,0): no maxilar a pele inclina
 * quase 45 graus, e um fio empurrado pra baixo no eixo do mundo entraria
 * dentro da cabeca. Copia de barba.js.
 */
function descidaNaPele(theta, az, out) {
  const perto = theta > Math.PI - 0.07
  const a = perto ? theta - 0.06 : theta
  const b = perto ? theta : theta + 0.06
  eggSurface(b, az, 1, _h1)
  eggSurface(a, az, 1, _h2)
  return out.subVectors(_h1, _h2).normalize()
}

/** Pelo nao projeta sombra: centenas de tubos de ~1mm no shadow map so cintilam. */
function pelo(m) { m.castShadow = false; m.receiveShadow = true; return m }

/** Ondulacao de baixa frequencia do manto — mesma formula de barba.js. */
function ondaPele(theta, az) {
  return Math.sin(az * 7.3 + theta * 5.1) * 0.62 + Math.sin(az * 12.7 - theta * 8.3) * 0.38
}

/**
 * O PENTEADO, num lugar so — mesma formula da 'cheia' de barba.js. Toda mecha
 * e todo fio de queixo deste arquivo sai daqui: e o que garante que a barba
 * inteira cai na MESMA direcao (penteada) em vez de cada tufo apontar pro
 * proprio lado, que era o defeito da primeira versao da 'cheia' (escama).
 * `abre` 0 = mecha colada no rosto, 1 = mecha solta; `desvio` empurra pro
 * lado (lateral).
 */
function pentear(theta, az, fora, abre, desvio) {
  pontoNaPele(theta, az, fora, _p, _n)
  descidaNaPele(theta, az, _tg)
  _lat.crossVectors(_n, _tg).normalize()
  _dir.copy(_tg).multiplyScalar(0.88)
    .addScaledVector(_n, 0.34 + 0.40 * abre)
    .addScaledVector(_lat, desvio)
    .normalize()
}

/** Adiciona ao grupo os acumuladores de tecelagem que nao ficaram vazios. */
function addFios(g, cor, ...mas) {
  const tons = [0, 2, 1]
  mas.forEach((ma, i) => {
    if (ma && !ma.vazia) g.add(pelo(new THREE.Mesh(ma.geo(), peloMat(cor, tons[i] !== undefined ? tons[i] : i))))
  })
}

/**
 * FURO DA BOCA compartilhado pelas seis — mesma elipse (furoCima/furoBaixo)
 * da 'cheia' de barba.js, dimensionada pro tamanho das bocas novas
 * (boca-extra.js: ate 8.5cm de meia-largura, contra os 4.7cm das antigas).
 * Devolve as duas funcoes prontas mais o meio-azimute AZ_FURO, que o
 * 'old-dutch' usa pra saber onde ancorar a subida da propria linha (ver
 * loYSemBigode, abaixo).
 */
function furoBoca() {
  const thBocaL = thetaEmY(Y_BOCA)
  const thCima = thetaEmY(-0.054 * S)
  const thBaixo = thetaEmY(-0.124 * S)
  const AZ_FURO = azEmX(thBocaL, X_FURO)
  const elipse = (az) => {
    const a = az < 0 ? -az : az
    if (a >= AZ_FURO) return 0
    return Math.sqrt(1 - (a / AZ_FURO) * (a / AZ_FURO))
  }
  return {
    AZ_FURO,
    furoCima: (az) => thBocaL - (thBocaL - thCima) * elipse(az),
    furoBaixo: (az) => thBocaL + (thBaixo - thBocaL) * elipse(az),
  }
}

/**
 * Linha de bochecha/mandibula COM BIGODE LIGADO — literalmente a loY da
 * 'cheia' em barba.js. Alta na frente (-0.038*S) o bastante pra sobrar uma
 * faixa de pelo ENTRE a linha e a borda de cima do furo: essa sobra e o
 * bigode. Reaproveitada por cinco das seis (so o old-dutch raspa o buco).
 * Ignora o argumento — existe so pra ter a MESMA assinatura de
 * loYSemBigode(AZ_FURO), que usa o dela; ver `construirBarbaCheia`, que
 * chama `opts.loY(AZ_FURO)` sem saber qual das duas esta do outro lado.
 */
function loYComBigode() {
  return byAz([
    [0.00, thetaEmY(-0.038 * S)],
    [0.38, thetaEmY(-0.030 * S)],
    [0.82, thetaEmY(-0.004 * S)],
    [1.26, thetaEmY(0.012 * S)],
    [1.70, thetaEmY(0.004 * S)],
    [2.06, thetaEmY(-0.060 * S)],
    [2.36, FORA],
  ])
}

/**
 * Linha de bochecha/mandibula SEM BIGODE (old-dutch) — fica achatada na
 * altura de BAIXO do furo (a borda furoBaixo, no fundo do labio) enquanto o
 * azimute estiver dentro da largura da boca, e SO SOBE depois da ponta do
 * furo. A ancora em AZ_FURO (nao um numero fixo) e o mesmo conserto que a
 * stubble e a boxed-curta de barba-extra.js aplicaram em azCanto: um
 * breakpoint fixo sobe AINDA DENTRO da largura da boca em metade dos
 * craniuns e tapa o labio.
 *
 * Com a linha ja na borda de baixo do furo (ou abaixo dela), a faixa de CIMA
 * do manto colapsa (mA = t0) na largura toda da boca — nao sobra sliver
 * nenhum de bigode, e a faixa de BAIXO fica continua com a linha (mB = t0
 * tambem), sem abrir um vao de pele orfao entre as duas.
 */
function loYSemBigode(AZ_FURO) {
  const yBaixo = -0.128 * S
  return byAz([
    [0.00, thetaEmY(yBaixo)],
    [AZ_FURO * 1.05, thetaEmY(yBaixo)],
    [AZ_FURO * 1.60, thetaEmY(-0.026 * S)],
    [0.95, thetaEmY(-0.004 * S)],
    [1.30, thetaEmY(0.012 * S)],
    [1.72, thetaEmY(0.004 * S)],
    [2.06, thetaEmY(-0.058 * S)],
    [2.36, FORA],
  ])
}

/**
 * Vertice do manto: ponto da pele afastado por `fora` + ondulacao. Mesma
 * formula de barba.js, incluindo o fator `polo` que MATA a ondulacao no polo
 * do queixo — sem isso as colunas terminam em pontos diferentes do mesmo
 * eixo em vez de um ponto so, e o leque do queixo vira um punhado de slivers
 * com normal nula (vertice preto).
 */
function pontoManto(ma, theta, az, fora, onda) {
  const polo = clamp(Math.sin(theta) * 4, 0, 1)
  pontoNaPele(theta, az, fora + onda * polo * ondaPele(theta, az), _p, _n)
  return ma.v(_p.x, _p.y, _p.z)
}

/**
 * Costura duas colunas vizinhas do manto (theta cresce em i, az cresce em
 * j). Mesma formula de barba.js — a ORDEM dos indices e o que decide pra
 * onde a normal aponta; trocada, o manto sai do avesso e escurece todo.
 */
function costurarManto(ma, cols) {
  for (let j = 0; j < cols.length - 1; j++) {
    const A = cols[j], B = cols[j + 1]
    if (A.length < 2 || B.length < 2) continue
    for (let i = 0; i < A.length - 1; i++) ma.quad(A[i], A[i + 1], B[i + 1], B[i])
  }
}

/**
 * CASCA COM FURO DE VERDADE NA BOCA — a peca central deste arquivo inteiro.
 * Copia da `manto()` privada de barba.js (mesma assinatura, mesmo
 * algoritmo): toda coluna de azimute sai em DUAS faixas, uma acima e uma
 * abaixo de furoCima(az)/furoBaixo(az), MESMO onde o furo ja fechou (ali as
 * duas faixas se encostam, sem fenda). E esse "sempre duas faixas" que faz a
 * boca virar o FIM da casca em vez de um buraco recortado no meio dela —
 * ver o comentario grande no topo do arquivo.
 */
function cascaComFuro(ma, lo, hi, furoCima, furoBaixo, opts) {
  const { nA, nT, azMax, fora, onda } = opts
  const colsA = [], colsB = []
  for (let j = 0; j <= nA; j++) {
    const az = -azMax + (2 * azMax * j) / nA
    let t0 = clamp(lo(az), 0, Math.PI)
    const t1 = clamp(hi(az), 0, Math.PI)
    // coluna sem altura: colapsa em vez de sumir (evita o corte reto no fim
    // da barba que pular a coluna deixaria).
    if (t1 - t0 < 0.02) t0 = t1
    const mA = clamp(furoCima(az), t0, t1)
    const mB = clamp(furoBaixo(az), t0, t1)
    const A = [], B = []
    for (let i = 0; i <= nT; i++) {
      const u = i / nT
      A.push(pontoManto(ma, mix(t0, mA, u), az, fora, onda))
      B.push(pontoManto(ma, mix(mB, t1, u), az, fora, onda))
    }
    colsA.push(A); colsB.push(B)
  }
  costurarManto(ma, colsA)
  costurarManto(ma, colsB)
}

/**
 * TUFO: um lobo de pelo lofteado a mao dentro do acumulador de tecelagem.
 * Copia exata da tufo() de barba.js — ver o comentario la pra a explicacao
 * completa da secao em elipse (achata + giro) e da ordem dos indices (W =
 * +crescimento; invertida, a normal do lobo sai pra DENTRO e le como buraco
 * na barba em vez de volume).
 */
function tufo(ma, p, cresc, lado, comp, raio, achata, giro, verga, aneis = 4, cols = 5) {
  const W = _tw.copy(cresc).normalize()
  const U = _tu.copy(lado)
  U.addScaledVector(W, -U.dot(W))
  if (U.lengthSq() < 1e-9) return
  U.normalize()
  const V = _tv.crossVectors(W, U)
  const co = Math.cos(giro), si = Math.sin(giro)
  let ant = null
  for (let k = 0; k < aneis; k++) {
    const t = k / aneis
    const r = raio * Math.pow(1 - t * t, 0.40)
    const av = comp * t - 0.0015
    const cx = p.x + W.x * av + verga.x * t * t
    const cy = p.y + W.y * av + verga.y * t * t
    const cz = p.z + W.z * av + verga.z * t * t
    const A = []
    for (let i = 0; i < cols; i++) {
      const a = (i / cols) * Math.PI * 2
      const ex = Math.cos(a) * r, ey = Math.sin(a) * r * achata
      const rx = ex * co - ey * si, ry = ex * si + ey * co
      A.push(ma.v(cx + U.x * rx + V.x * ry, cy + U.y * rx + V.y * ry, cz + U.z * rx + V.z * ry))
    }
    if (ant) for (let i = 0; i < cols; i++) ma.quad(ant[i], ant[(i + 1) % cols], A[(i + 1) % cols], A[i])
    ant = A
  }
  const ponta = ma.v(p.x + W.x * comp + verga.x, p.y + W.y * comp + verga.y, p.z + W.z * comp + verga.z)
  for (let i = 0; i < cols; i++) ma.tri(ant[i], ant[(i + 1) % cols], ponta)
}

/**
 * O METODO INTEIRO, reaproveitado seis vezes: MANTO (cascaComFuro) + MECHAS
 * penteadas numa grade + FRANJA densa nas duas bordas — a mesma receita de
 * 'cheia' em barba.js, so que loY/COMP/comprimentos entram por parametro em
 * vez de estarem escritos direto na funcao.
 *
 * opts: { mult, loY, COMP, c0, c1, cq0, cq1, extra? }
 *   mult    multiplicador do indice de cabeca na semente do rng (cada barba
 *           usa o proprio, senao duas pecas com o mesmo `seed` sorteariam
 *           identico cranio a cranio)
 *   loY     funcao(AZ_FURO) -> byAz(...); loYComBigode ignora o argumento,
 *           loYSemBigode usa pra ancorar a subida da linha
 *   COMP    byAz(...) — comprimento relativo do pelo por azimute
 *   c0,c1   comprimento base/variacao das MECHAS (metros, antes de *S*k)
 *   cq0,cq1 comprimento base/variacao da franja do QUEIXO (idem)
 *   extra   opcional: (g, cor, rnd) -> void, tufos dedicados plantados DEPOIS
 *           das tres camadas (ponta unica, duas pontas, franja solta)
 *
 * Densidades (nA/nT/N_AZ/N_T/COLS_B/COLS_Q) ficam ~20-25% abaixo da 'cheia'
 * de barba.js de proposito: sao SEIS pecas neste arquivo, cada uma ainda
 * ganha uma franja extra ou tufos dedicados por cima, e o orcamento do
 * CONTRATO e ~12 mil triangulos POR PECA — a margem e o que sobra pro
 * `extra` nao estourar.
 */
function construirBarbaCheia(ctx, seed, opts) {
  useHead(ctx)
  const cor = beardColorFrom(ctx)
  const rnd = rng(seed + (((ctx && ctx.cabeca) | 0) * opts.mult))
  const g = new THREE.Group()
  const { furoCima, furoBaixo, AZ_FURO } = furoBoca()
  const loY = opts.loY(AZ_FURO)
  const COMP = opts.COMP
  const hiY = () => Math.PI

  // --- camada 1: o manto (a sombra da barba na propria pele) ---------------
  const maM = tecelagem()
  cascaComFuro(maM, loY, hiY, furoCima, furoBaixo, {
    nA: 32, nT: 6, azMax: 2.36, fora: 0.0035, onda: 0.0016,
  })
  // SOLDAR: o manto tem vertices coincidentes de proposito (a faixa de cima
  // colapsa contra a de baixo onde o furo ja fechou, e o fim da barba
  // colapsa inteiro) — sem soldar isso acende uma listra na altura da boca.
  const geoManto = soldarNormais(maM.geo())
  g.add(sh(new THREE.Mesh(geoManto, hairMat(shade(cor, 0.78)))))

  // --- camada 2: as mechas ---------------------------------------------------
  const maT = [tecelagem(), tecelagem()]
  const N_AZ = 20, N_T = 5
  const tPolo = Math.PI - 0.26
  for (let ja = 0; ja < N_AZ; ja++) {
    const azBase = -2.30 + (4.60 * (ja + 0.5)) / N_AZ
    for (let jt = 0; jt < N_T; jt++) {
      const az = azBase + (rnd() - 0.5) * (4.60 / N_AZ) * 0.9
      const t0 = loY(az)
      if (t0 > Math.PI - 0.24) continue
      const u = (jt + 0.5 + (rnd() - 0.5) * 0.8) / N_T
      const theta = mix(t0, tPolo, clamp(u, 0, 1))
      // margem em volta do furo: 0.16/0.055/1.10 sao a mesma folga da 'cheia'
      // (mecha tem comprimento proprio; plantada bem na borda ela cresce por
      // cima da boca)
      if (theta > furoCima(az) - 0.16 && theta < furoBaixo(az) + 0.055
        && xEmAz(theta, az) < X_FURO * 1.10) continue

      const k = COMP(az)
      const solta = clamp((theta - t0) / Math.max(0.05, tPolo - t0), 0, 1)
      pentear(theta, az, 0.0028, solta, (rnd() - 0.5) * 0.13)

      _alvo.copy(_tg).multiplyScalar((0.0020 + 0.0035 * rnd()) * S * k)
      const comp = (opts.c0 + opts.c1 * rnd()) * S * (0.45 + 0.55 * k)
      const raio = (0.0034 + 0.0018 * rnd()) * S * (0.6 + 0.4 * k)
      tufo(maT[rnd() < 0.55 ? 0 : 1], _p, _dir, _lat, comp, raio, 0.42, (rnd() - 0.5) * 0.5, _alvo)
    }
  }
  addFios(g, cor, maT[0], maT[1])

  // --- camada 3: a franja das bordas -------------------------------------
  const maF = [tecelagem(), tecelagem()]
  const COLS_B = 40, FILAS_B = 3
  for (let c = 0; c < COLS_B; c++) {
    const azC = -2.24 + (4.48 * (c + 0.5)) / COLS_B
    const k = COMP(azC)
    for (let f = 0; f < FILAS_B; f++) {
      const az = azC + (rnd() - 0.5) * 0.045
      const th0 = loY(az)
      if (th0 > Math.PI - 0.20) continue
      const theta = th0 + 0.010 + f * 0.030 + rnd() * 0.014
      pontoNaPele(theta, az, 0.0020, _p, _n)
      descidaNaPele(theta, az, _tg)
      _lat.crossVectors(_n, _tg).normalize()
      _dir.copy(_n).multiplyScalar(0.80)
        .addScaledVector(_tg, -0.42 + 0.30 * (f / (FILAS_B - 1)))
        .addScaledVector(_lat, (rnd() - 0.5) * 0.22)
        .normalize()
      _eixo.crossVectors(_dir, _n).normalize()
      const comp = (0.0030 + 0.0026 * rnd()) * S * (0.5 + 0.5 * k)
      fio(maF[rnd() < 0.5 ? 0 : 1], _p, _dir, comp, 0.00105 * S, _eixo, 0.30)
    }
  }
  // contorno de baixo: e ele que se ve de frente, recortado contra o peito
  const COLS_Q = 34, FILAS_Q = 3
  for (let c = 0; c < COLS_Q; c++) {
    const azC = -1.78 + (3.56 * (c + 0.5)) / COLS_Q
    const k = COMP(azC)
    for (let f = 0; f < FILAS_Q; f++) {
      const az = azC + (rnd() - 0.5) * 0.05
      const theta = Math.PI - 0.52 + f * 0.11 + (rnd() - 0.5) * 0.05
      pentear(theta, az, 0.0030, 1, (rnd() - 0.5) * 0.20)
      _alvo.copy(_n).multiplyScalar(-1)
      _eixo.crossVectors(_dir, _alvo)
      if (_eixo.lengthSq() < 1e-9) _eixo.copy(_lat)
      _eixo.normalize()
      const comp = (opts.cq0 + opts.cq1 * rnd()) * S * (0.45 + 0.55 * k)
      fio(maF[rnd() < 0.5 ? 0 : 1], _p, _dir, comp, 0.00115 * S, _eixo, 0.45)
    }
  }
  addFios(g, cor, maF[0], maF[1])

  if (opts.extra) opts.extra(g, cor, rnd)
  return g
}

/**
 * PONTA UNICA (rabo-de-pato): coluna estreita de tufos no centro do queixo,
 * cada um com `verga` (o alvo de curvatura do tufo — deslocamento em metros,
 * nao direcao) puxando pro proprio X=0. Convergem numa ponta so conforme
 * crescem, em vez de cair paralelos — que seria so "queixo mais comprido",
 * nao um rabo-de-pato. O sinal usa X direto (nao _lat, que depende de um
 * produto vetorial cujo sentido nao vale a pena decorar): X positivo e
 * negativo bastam pra saber de que lado do centro puxar pra dentro.
 */
function pontaUnica(g, cor, rnd) {
  const maP = tecelagem()
  const N = 7
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N - 0.5 // -0.44..0.44
    const az = t * 0.22 // coluna estreita, -0.10..0.10 rad
    const theta = Math.PI - 0.20 + Math.abs(t) * 0.05
    pentear(theta, az, 0.0030, 1, 0)
    const azSign = az < 0 ? -1 : 1
    _alvo.set(-azSign * 0.0072 * S, -0.0026 * S, 0.0009 * S)
    const comp = (0.024 + 0.006 * rnd()) * S
    const raio = (0.0040 + 0.0014 * rnd()) * S
    tufo(maP, _p, _dir, _lat, comp, raio, 0.40, (rnd() - 0.5) * 0.3, _alvo, 5, 5)
  }
  addFios(g, cor, maP)
}

/**
 * DUAS PONTAS (garfo frances): a mesma ideia, duas vezes, uma de cada lado
 * do centro — com o SINAL da verga invertido (diverge do meio em vez de
 * convergir) e um vao entre as duas colunas (cada uma centrada em az =
 * +-0.15, nao em 0). E a divergencia mais o vao que fazem virar garfo em vez
 * de um rabo-de-pato deslocado.
 */
function duasPontas(g, cor, rnd) {
  const maP = tecelagem()
  for (const lado of [-1, 1]) {
    const N = 5
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N - 0.5 // -0.42..0.42
      const az = lado * 0.15 + t * 0.09
      const theta = Math.PI - 0.19 + Math.abs(t) * 0.04
      pentear(theta, az, 0.0030, 1, 0)
      _alvo.set(lado * 0.0066 * S, -0.0024 * S, 0.0008 * S)
      const comp = (0.021 + 0.005 * rnd()) * S
      const raio = (0.0036 + 0.0012 * rnd()) * S
      tufo(maP, _p, _dir, _lat, comp, raio, 0.40, (rnd() - 0.5) * 0.3, _alvo, 5, 5)
    }
  }
  addFios(g, cor, maP)
}

/**
 * MASSA SOLTA (bandholz): franja extra larga e pendurada no centro do
 * queixo, quase paralela (verga pequena e SORTEADA, sem convergir nem
 * divergir de proposito) — vende o volume "solto" que uma tabela de
 * comprimento sozinha nao cobre, e e a camada que faz o Bandholz ler como o
 * mais comprido do arquivo mesmo ao lado do garibaldi (que e mais LARGO, nao
 * mais comprido).
 */
function massaSolta(g, cor, rnd) {
  const maP = tecelagem()
  const N = 13
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N - 0.5 // -0.47..0.47
    const az = t * 0.85
    const theta = Math.PI - 0.17 + rnd() * 0.05
    pentear(theta, az, 0.0032, 1, (rnd() - 0.5) * 0.10)
    _alvo.set((rnd() - 0.5) * 0.0030 * S, -0.0035 * S, 0.0006 * S)
    const comp = (0.040 + 0.011 * rnd()) * S
    const raio = (0.0042 + 0.0016 * rnd()) * S
    tufo(maP, _p, _dir, _lat, comp, raio, 0.40, (rnd() - 0.5) * 0.3, _alvo, 5, 5)
  }
  addFios(g, cor, maP)
}

// ---------------------------------------------------------------------------
// TABELAS COMP — comprimento relativo do pelo por azimute (0 = frente/queixo,
// crescendo em direcao a orelha). E aqui que mora a SILHUETA DE BAIXO de cada
// uma das seis; ver o comentario do topo do arquivo.
// ---------------------------------------------------------------------------

/** Pico ESTREITO no centro, caindo rapido pros lados: a base da ponta unica. */
const COMP_DUCKTAIL = byAz([
  [0.00, 1.05],
  [0.20, 0.80],
  [0.55, 0.66],
  [1.05, 0.52],
  [1.55, 0.36],
  [2.00, 0.24],
  [2.36, 0.17],
])

/** VINCO no centro exato (o "risco" do garfo) com um pico logo ao lado, em
 * cada uma das duas colunas de duasPontas — sem o vinco as duas pontas
 * dedicadas ficariam boiando sobre um manto uniforme e sumiriam no meio dele. */
const COMP_FORK = byAz([
  [0.00, 0.62],
  [0.15, 1.05],
  [0.36, 0.72],
  [0.72, 0.56],
  [1.15, 0.46],
  [1.60, 0.32],
  [2.05, 0.22],
  [2.36, 0.16],
])

/** O contorno natural do cartaz: cheia no queixo, afinando pela mandibula,
 * quase raspada na costeleta — igual a 'cheia' de barba.js. */
const COMP_CLASSICA = byAz([
  [0.00, 1.00],
  [0.55, 0.95],
  [1.05, 0.74],
  [1.55, 0.48],
  [2.00, 0.30],
  [2.36, 0.22],
])

/** PLATO largo (quase reto de 0 a 0.75) com queda RAPIDA logo depois — o
 * plato plano e a queda em poucos graus, e nao a curva, e o que le como
 * contorno QUADRADO embaixo. */
const COMP_DUTCH = byAz([
  [0.00, 1.00],
  [0.75, 0.98],
  [1.05, 0.55],
  [1.55, 0.30],
  [2.00, 0.20],
  [2.36, 0.15],
])

/** Curva LARGA e CONTINUA, sem plato e sem queda brusca — a mesma ideia do
 * old-dutch (fica cheio numa faixa larga) mas em arco suave: le como
 * contorno ARREDONDADO em vez de quadrado. */
const COMP_GARIBALDI = byAz([
  [0.00, 1.10],
  [0.45, 1.04],
  [0.90, 0.88],
  [1.35, 0.64],
  [1.80, 0.40],
  [2.20, 0.25],
  [2.36, 0.19],
])

/** O plato mais ALTO da lista inteira, e o mais LARGO tambem (so cai depois
 * de 1.10 rad) — em cima disso opts.c0/c1/cq0/cq1 do Bandholz (ver o
 * catalogo, adiante) ainda multiplicam por um comprimento ABSOLUTO bem maior
 * que o das outras cinco: e a combinacao das duas coisas que faz "a mais
 * comprida de todas" valer tanto relativa quanto absolutamente. */
const COMP_BANDHOLZ = byAz([
  [0.00, 1.15],
  [0.60, 1.12],
  [1.10, 0.98],
  [1.55, 0.78],
  [2.00, 0.52],
  [2.36, 0.36],
])

export const BARBAS_EXTRA3 = [
  // -------------------------------------------------------------------------
  // 1 RABO DE PATO (Ducktail) — bigode ligado, COMP com pico estreito no
  // centro + pontaUnica: os tufos dedicados convergem no meio conforme
  // crescem, fechando numa ponta so no queixo.
  // -------------------------------------------------------------------------
  {
    id: 'rabo-de-pato', nome: 'Rabo de pato', name: 'Rabo de pato',
    metodo: 'manto com furo na boca (cascaComFuro) + mechas penteadas + franja, bigode ligado (loY alto na frente), com uma coluna extra de tufos convergindo pro centro no polo do queixo — a ponta unica que da nome ao estilo',
    build(ctx) {
      return construirBarbaCheia(ctx, 6101, {
        mult: 331, loY: loYComBigode, COMP: COMP_DUCKTAIL,
        c0: 0.0095, c1: 0.0085, cq0: 0.0044, cq1: 0.0038,
        extra: (g, cor, rnd) => pontaUnica(g, cor, rnd),
      })
    },
  },

  // -------------------------------------------------------------------------
  // 2 GARFO FRANCES (French Fork) — bigode ligado, COMP com vinco no centro
  // (dip exatamente em az=0) + duasPontas: os tufos dedicados DIVERGEM do
  // meio, abrindo em duas pontas separadas por um vao.
  // -------------------------------------------------------------------------
  {
    id: 'garfo-frances', nome: 'Garfo frances', name: 'Garfo frances',
    metodo: 'o mesmo manto+mechas+franja com bigode ligado, mas com um vinco no COMP bem no centro (a barba fica mais rala ali e sobe de novo logo ao lado) e duas colunas de tufos DIVERGINDO do meio no polo do queixo — as duas pontas que da nome ao garfo',
    build(ctx) {
      return construirBarbaCheia(ctx, 6217, {
        mult: 347, loY: loYComBigode, COMP: COMP_FORK,
        c0: 0.0090, c1: 0.0080, cq0: 0.0040, cq1: 0.0036,
        extra: (g, cor, rnd) => duasPontas(g, cor, rnd),
      })
    },
  },

  // -------------------------------------------------------------------------
  // 3 CHEIA CLASSICA (Full Beard) — o contorno natural do cartaz, sem tufo
  // dedicado nenhum: bigode ligado, comprimento cheio no queixo afinando
  // pela mandibula ate quase raspado na costeleta.
  // -------------------------------------------------------------------------
  {
    id: 'cheia-classica', nome: 'Cheia classica', name: 'Cheia classica',
    metodo: 'manto+mechas+franja lisos, sem tufo dedicado — o contorno natural do cartaz: cheia no queixo, afinando pela mandibula, quase raspada na costeleta, bigode ligado',
    build(ctx) {
      return construirBarbaCheia(ctx, 6337, {
        mult: 359, loY: loYComBigode, COMP: COMP_CLASSICA,
        c0: 0.0095, c1: 0.0090, cq0: 0.0042, cq1: 0.0040,
      })
    },
  },

  // -------------------------------------------------------------------------
  // 4 THE OLD DUTCH — loY SEM bigode (buco raspado) + COMP em PLATO largo com
  // queda rapida: o plato plano e o corte curto de az e o que le como
  // contorno QUADRADO embaixo. Sem tufo dedicado.
  // -------------------------------------------------------------------------
  {
    id: 'old-dutch', nome: 'The Old Dutch', name: 'The Old Dutch',
    metodo: 'loY SEM bigode (achatada na borda de baixo do furo, ancorada em AZ_FURO — buco raspado) + COMP em plato largo com queda rapida nas pontas: plato e queda em poucos graus de az e o que le como contorno QUADRADO embaixo, sem tufo dedicado',
    build(ctx) {
      return construirBarbaCheia(ctx, 6449, {
        mult: 373, loY: loYSemBigode, COMP: COMP_DUTCH,
        c0: 0.0088, c1: 0.0075, cq0: 0.0046, cq1: 0.0036,
      })
    },
  },

  // -------------------------------------------------------------------------
  // 5 THE GARIBALDI — bigode ligado + COMP em curva larga e continua (sem
  // plato, sem queda brusca): a mesma ideia do old-dutch (fica cheio numa
  // faixa larga) trocando o plato quadrado por um arco, o que le como
  // contorno ARREDONDADO e mais LARGO embaixo. Sem tufo dedicado.
  // -------------------------------------------------------------------------
  {
    id: 'garibaldi', nome: 'The Garibaldi', name: 'The Garibaldi',
    metodo: 'bigode ligado + COMP em curva larga e continua (sem plato, sem queda brusca) — a mesma ideia do old-dutch (fica cheio numa faixa larga) trocando o plato quadrado por uma curva, o que le como contorno ARREDONDADO e mais LARGO embaixo',
    build(ctx) {
      return construirBarbaCheia(ctx, 6563, {
        mult: 389, loY: loYComBigode, COMP: COMP_GARIBALDI,
        c0: 0.0100, c1: 0.0095, cq0: 0.0048, cq1: 0.0042,
      })
    },
  },

  // -------------------------------------------------------------------------
  // 6 THE BANDHOLZ — bigode ligado + COMP no plato mais alto e mais largo da
  // lista + comprimentos ABSOLUTOS (c0/c1/cq0/cq1) bem maiores que os das
  // outras cinco + massaSolta: uma franja extra larga e solta no centro do
  // queixo, sem convergir nem divergir — a mais comprida do arquivo de
  // proposito, e SOLTA (nao penteada numa ponta ou num garfo).
  // -------------------------------------------------------------------------
  {
    id: 'bandholz', nome: 'The Bandholz', name: 'The Bandholz',
    metodo: 'bigode ligado + COMP num plato alto quase pela largura toda + comprimentos absolutos (c0/c1/cq0/cq1) bem maiores que as outras cinco + uma franja extra larga e solta no centro do queixo (massaSolta) — a mais comprida do arquivo de proposito, sem convergir nem divergir',
    build(ctx) {
      return construirBarbaCheia(ctx, 6679, {
        mult: 401, loY: loYComBigode, COMP: COMP_BANDHOLZ,
        c0: 0.0150, c1: 0.0130, cq0: 0.0075, cq1: 0.0065,
        extra: (g, cor, rnd) => massaSolta(g, cor, rnd),
      })
    },
  },
]
