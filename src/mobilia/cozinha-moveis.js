import * as THREE from 'three'
import { solid, stdMat, box, cyl, glass, tex, textPlaneMat } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/cozinha-moveis.js — O QUE ENCHE UMA COZINHA DE SERVICO.
//
// A pia mora em mobilia/pia.js porque ela e a peca que vai ganhar mecanica. Tudo
// que esta AQUI e o contrario disso: e mobilia parada, e existe por um motivo
// so — um comodo vazio nao parece um comodo, parece uma maquete dele. Prateleira
// com caixa plastica, carrinho de louca, lixeira de pedal, exaustor, quadro de
// avisos e relogio nao fazem nada; eles dizem que ali se trabalha.
//
// DUAS REGRAS QUE VALEM PRO ARQUIVO INTEIRO:
//
// 1. TODA PECA NASCE COM A BASE EM y = 0 E A FRENTE PARA +Z. Quem monta e que
//    sabe onde e o chao e pra onde a peca olha. As duas excecoes sao as pecas
//    PENDURADAS (quadro de avisos, relogio, prateleira de parede, exaustor):
//    nelas a origem fica no CENTRO, colada na face da parede, ainda com a
//    frente em +Z — e a mesma excecao que props.makeFramedPicture ja abre, e
//    pelo mesmo motivo (pendurado nao tem base).
//
// 2. O QUE SE MEXE VEM EMBRULHADO. O forno de geometria (world/bake.js) funde
//    tudo que nao estiver marcado e reparenteia o TOPO de cada ramo dinamico
//    mantendo a pose de mundo — o que quer dizer que o topo marcado tem a
//    rotacao dele REESCRITA na hora do forno. Por isso a helice do exaustor e
//    os ponteiros do relogio giram num FILHO do no marcado, nunca no proprio.
//    Escrever `helice.rotation.z` num grupo que o forno reparenteou apaga a
//    orientacao que ele tinha no mundo, e a peca acorda deitada.
//
// Escala real, em metros.
// ---------------------------------------------------------------------------

// --- materiais ---------------------------------------------------------------

const M = {
  get inox() { return solid(0xc3c9ce, 0.32, 0.80) },
  get inoxEscovado() { return solid(0xa7aeb4, 0.46, 0.72) },
  get aco() { return solid(0x9aa1a7, 0.52, 0.66) },
  get acoEscuro() { return solid(0x5e666d, 0.58, 0.60) },
  get borracha() { return solid(0x22252a, 0.95, 0.0) },
  get cromo() { return solid(0xd8dde1, 0.16, 0.92) },
  get cortica() {
    return stdMat('cozinha-cortica', { map: corticaTex(), roughness: 0.95 })
  },
  get madeira() { return solid(0x7d5a34, 0.80) },
  get mostrador() { return solid(0xf6f3ea, 0.72) },
  get preto() { return solid(0x1b1e22, 0.75) },
  get pano() { return solid(0xd8dde2, 0.94) },
}

/** PRNG deterministico (mulberry32): a mesma cozinha em toda sessao. */
function mulberry32(seed) {
  let a = (seed >>> 0) + 0x9e3779b9
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cortica: pontinhos claros e escuros. Chapado le como papelao. */
function corticaTex() {
  return tex('cozinha-cortica', 128, (g, s) => {
    g.fillStyle = '#c39a63'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const v = Math.random()
      g.fillStyle = v > 0.5
        ? 'rgba(160,116,64,' + (Math.random() * 0.55) + ')'
        : 'rgba(226,196,150,' + (Math.random() * 0.5) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2, Math.random() * 3, 0, 7)
      g.fill()
    }
  })
}

// A cor das caixas plasticas de padaria. Sao cores de PLASTICO INJETADO: muito
// saturadas e um pouco sujas, nunca pastel. Um monobloco de cozinha e feio de
// proposito, e e essa feiura que o faz parecer usado.
const CORES_CAIXA = [0x2f6f8f, 0x2f6f8f, 0xc4392f, 0x3f7a45, 0x9a9a92, 0xd4a017]

// --- caixa plastica -----------------------------------------------------------

/**
 * CAIXA VAZADA DE PADARIA. Base, quatro paredes e o aro de cima.
 *
 * As paredes sao VAZADAS por um motivo de leitura e nao de realismo: uma caixa
 * plastica fechada e um bloco colorido, e num monte de seis blocos coloridos
 * ninguem enxerga que sao caixas. O que denuncia a caixa e o aro grosso na boca
 * com a parede fina embaixo dele — entao e isso que se modela.
 */
export function caixaPlastica(w = 0.52, h = 0.30, d = 0.36, cor = CORES_CAIXA[0]) {
  const g = new THREE.Group()
  g.name = 'caixa-plastica'
  const mat = solid(cor, 0.72, 0.02)
  const t = 0.014
  g.add(box(w, t, d, mat, 0, t / 2, 0))
  g.add(box(t, h - t, d, mat, -w / 2 + t / 2, (h + t) / 2, 0))
  g.add(box(t, h - t, d, mat, w / 2 - t / 2, (h + t) / 2, 0))
  g.add(box(w - t * 2, h - t, t, mat, 0, (h + t) / 2, -d / 2 + t / 2))
  g.add(box(w - t * 2, h - t, t, mat, 0, (h + t) / 2, d / 2 - t / 2))
  // o aro da boca: 4 sarrafos mais grossos que a parede
  const ar = 0.026
  g.add(box(w + 0.012, 0.030, ar, mat, 0, h - 0.015, -d / 2 + ar / 2 - 0.006))
  g.add(box(w + 0.012, 0.030, ar, mat, 0, h - 0.015, d / 2 - ar / 2 + 0.006))
  g.add(box(ar, 0.030, d + 0.012, mat, -w / 2 + ar / 2 - 0.006, h - 0.015, 0))
  g.add(box(ar, 0.030, d + 0.012, mat, w / 2 - ar / 2 + 0.006, h - 0.015, 0))
  return g
}

// --- prateleira de aco --------------------------------------------------------

/**
 * PRATELEIRA DE ACO DE ESTOQUE, com as caixas em cima.
 *
 * Nao e props.makeShelf: aquela e uma GONDOLA DE LOJA (tem testeira de oferta e
 * etiqueta de preco em cada borda), e etiqueta de preco dentro de uma cozinha
 * conta a historia errada. Aqui a prateleira e aramada, os montantes sao
 * cantoneiras perfuradas e o que esta em cima e caixa, nao produto.
 *
 * @param opts.n  numero de prateleiras (padrao 4)
 */
export function prateleiraDeAco(larg = 1.80, alt = 1.90, prof = 0.50, opts = {}) {
  const g = new THREE.Group()
  g.name = 'prateleira-aco'
  const n = opts.n || 4
  const semente = opts.semente || 0

  // montantes: cantoneira em L, dois perfis por canto
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (larg / 2 - 0.022), z = sz * (prof / 2 - 0.022)
      g.add(box(0.044, alt, 0.012, M.acoEscuro, x, alt / 2, z - sz * 0.016))
      g.add(box(0.012, alt, 0.044, M.acoEscuro, x - sx * 0.016, alt / 2, z))
      // pe regulavel
      g.add(cyl(0.020, 0.024, 0.026, M.borracha, 8).translateX(x).translateY(0.013).translateZ(z))
    }
  }

  // prateleiras aramadas: um quadro + as varetas
  const vareta = new THREE.BoxGeometry(0.008, 0.008, prof - 0.06)
  for (let i = 0; i < n; i++) {
    const y = 0.24 + i * ((alt - 0.34) / (n - 1))
    g.add(box(larg - 0.05, 0.014, 0.020, M.aco, 0, y, -prof / 2 + 0.032))
    g.add(box(larg - 0.05, 0.014, 0.020, M.aco, 0, y, prof / 2 - 0.032))
    g.add(box(0.020, 0.014, prof - 0.06, M.aco, -larg / 2 + 0.036, y, 0))
    g.add(box(0.020, 0.014, prof - 0.06, M.aco, larg / 2 - 0.036, y, 0))
    const nv = Math.max(4, Math.floor((larg - 0.12) / 0.075))
    for (let k = 0; k < nv; k++) {
      const m = new THREE.Mesh(vareta, M.aco)
      m.position.set(-larg / 2 + 0.06 + (k + 0.5) * ((larg - 0.12) / nv), y + 0.004, 0)
      m.castShadow = false
      m.receiveShadow = true
      g.add(m)
    }
  }

  // as caixas: nem toda prateleira cheia, e nenhuma alinhada. Prateleira com
  // tudo encostado e centralizado le como vitrine, nao como estoque.
  const rnd = mulberry32(semente * 7 + 3)
  for (let i = 0; i < n; i++) {
    const y = 0.24 + i * ((alt - 0.34) / (n - 1)) + 0.008
    if (i === n - 1) continue                     // a de cima fica vazia
    const quantas = 1 + Math.floor(rnd() * 2.4)
    for (let k = 0; k < quantas; k++) {
      const cw = 0.46 + rnd() * 0.08
      const cx = -larg / 2 + 0.15 + k * (larg - 0.36) / Math.max(1, quantas) + rnd() * 0.06
      const c = caixaPlastica(cw, 0.24 + rnd() * 0.08, Math.min(prof - 0.08, 0.34), CORES_CAIXA[(i * 3 + k + semente) % CORES_CAIXA.length])
      c.position.set(cx, y, (rnd() - 0.5) * 0.05)
      c.rotation.y = (rnd() - 0.5) * 0.12
      g.add(c)
    }
  }

  g.userData.pegada = { w: larg, d: prof }
  return g
}

// --- carrinho de louca ---------------------------------------------------------

/**
 * CARRINHO DE LOUCA de tres bandejas, com rodizio e alca de empurrar.
 *
 * A alca fica numa PONTA SO. Um carrinho com alca dos dois lados existe, mas o
 * de uma alca so tem frente e costas — e peca com frente pousa no comodo com
 * intencao (aponta pra pia), o que uma caixa simetrica nunca faz.
 */
export function carrinhoDeLouca(larg = 1.00, prof = 0.62, alt = 0.94) {
  const g = new THREE.Group()
  g.name = 'carrinho-louca'
  const hx = larg / 2, hz = prof / 2

  const YS = [0.20, 0.55, alt - 0.02]
  for (const y of YS) {
    g.add(box(larg, 0.022, prof, M.inox, 0, y, 0))
    // borda levantada: e ela que impede o copo de sair do carrinho na curva
    g.add(box(larg, 0.028, 0.016, M.inoxEscovado, 0, y + 0.024, -hz + 0.008))
    g.add(box(larg, 0.028, 0.016, M.inoxEscovado, 0, y + 0.024, hz - 0.008))
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (hx - 0.05), z = sz * (hz - 0.05)
      g.add(cyl(0.017, 0.017, alt - 0.10, M.cromo, 10).translateX(x).translateY(0.10 + (alt - 0.10) / 2).translateZ(z))
      // rodizio: garfo + roda
      g.add(box(0.030, 0.055, 0.048, M.acoEscuro, x, 0.075, z))
      const roda = cyl(0.045, 0.045, 0.026, M.borracha, 12)
      roda.rotation.z = Math.PI / 2
      roda.position.set(x, 0.045, z)
      g.add(roda)
    }
  }

  // a alca, na frente (+Z): dois montantes e o tubo atravessado
  for (const sx of [-1, 1]) {
    g.add(cyl(0.015, 0.015, 0.16, M.cromo, 10).translateX(sx * (hx - 0.05)).translateY(alt + 0.06).translateZ(hz - 0.05))
  }
  const alca = cyl(0.017, 0.017, larg - 0.10, M.cromo, 10)
  alca.rotation.z = Math.PI / 2
  alca.position.set(0, alt + 0.14, hz - 0.05)
  g.add(alca)

  g.userData.pegada = { w: larg, d: prof }
  return g
}

// --- lixeira de pedal ----------------------------------------------------------

/** LIXEIRA DE PEDAL de inox. A tampa fica um dedo aberta: ninguem fecha. */
export function lixeiraDePedal(raio = 0.19, alt = 0.62) {
  const g = new THREE.Group()
  g.name = 'lixeira-pedal'

  g.add(cyl(raio, raio * 0.94, alt, M.inoxEscovado, 18).translateY(alt / 2))
  g.add(cyl(raio + 0.008, raio + 0.008, 0.020, M.inox, 18).translateY(alt - 0.010))
  // a tampa, entreaberta
  const tampa = new THREE.Group()
  tampa.position.set(0, alt + 0.006, -raio + 0.02)
  tampa.rotation.x = -0.22
  const chapa = cyl(raio + 0.004, raio - 0.01, 0.026, M.inox, 18)
  chapa.position.z = raio - 0.02
  tampa.add(chapa)
  g.add(tampa)
  // o saco preto sobrando pela boca
  const saco = cyl(raio - 0.012, raio - 0.05, 0.10, M.preto, 16)
  saco.position.y = alt - 0.05
  g.add(saco)
  // haste e pedal
  g.add(box(0.018, alt - 0.10, 0.018, M.cromo, 0, (alt - 0.10) / 2 + 0.05, -raio - 0.012))
  g.add(box(0.14, 0.020, 0.070, M.cromo, 0, 0.045, -raio - 0.03))
  g.add(box(0.030, 0.045, 0.030, M.acoEscuro, 0, 0.024, -raio + 0.01))

  g.userData.pegada = { w: raio * 2, d: raio * 2 + 0.08 }
  return g
}

// --- exaustor de parede ---------------------------------------------------------

/**
 * EXAUSTOR DE PAREDE, com a helice girando.
 *
 * Pendurado: origem no CENTRO, colada na parede, soprando pra fora (a helice
 * fica atras da grade, olhando pro comodo em +Z).
 *
 * A helice e uma InstancedMesh de 5 pas e nao 5 malhas soltas por causa do
 * forno: ela nunca vai poder ser fundida (gira), e 5 draw calls parados num
 * ventilador de canto e caro pra uma coisa que ninguem olha duas vezes.
 * InstancedMesh sobrevive ao forno inteira, e custa 1.
 *
 * @returns { grupo, atualizar(dt) }
 */
export function exaustorDeParede(lado = 0.46) {
  const g = new THREE.Group()
  g.name = 'exaustor'
  const h = lado / 2

  // caixa embutida (a "boca" no reboco) e a moldura
  g.add(box(lado, lado, 0.10, M.acoEscuro, 0, 0, -0.05))
  for (const [w, hh, x, y] of [[lado, 0.05, 0, h - 0.025], [lado, 0.05, 0, -h + 0.025],
    [0.05, lado - 0.10, -h + 0.025, 0], [0.05, lado - 0.10, h - 0.025, 0]]) {
    g.add(box(w, hh, 0.055, M.aco, x, y, 0.028))
  }

  // O NO MARCADO E O EMBRULHO, e quem gira e o filho. Ver a regra 2 no
  // cabecalho: escrever rotacao no proprio no marcado apaga a pose que o forno
  // gravou nele, e o exaustor acorda deitado na parede.
  const girante = new THREE.Group()
  girante.userData.noBake = true
  girante.position.z = -0.030
  g.add(girante)

  const helice = new THREE.Group()
  girante.add(helice)
  const cubo = cyl(0.038, 0.042, 0.048, M.acoEscuro, 12)
  cubo.rotation.x = Math.PI / 2
  helice.add(cubo)

  const NP = 5
  const pa = new THREE.InstancedMesh(new THREE.BoxGeometry(0.135, 0.072, 0.008), M.aco, NP)
  const d = new THREE.Object3D()
  for (let i = 0; i < NP; i++) {
    const a = (i / NP) * Math.PI * 2
    d.rotation.set(0.55, 0, a)          // 0.55 rad de passo: pa reta nao sopra
    d.position.set(Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0)
    d.updateMatrix()
    pa.setMatrixAt(i, d.matrix)
  }
  pa.instanceMatrix.needsUpdate = true
  pa.castShadow = false
  helice.add(pa)

  // grade de protecao na frente: 7 barras e o aro
  const barra = new THREE.BoxGeometry(lado - 0.11, 0.008, 0.008)
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(barra, M.aco)
    m.position.set(0, -h + 0.06 + i * ((lado - 0.12) / 6), 0.044)
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }
  const aro = new THREE.Mesh(new THREE.TorusGeometry(h - 0.055, 0.008, 5, 20), M.aco)
  aro.position.z = 0.044
  aro.castShadow = false
  aro.receiveShadow = true
  g.add(aro)

  return {
    grupo: g,
    /** Gira sempre e devagar: exaustor de cozinha nao desliga, so cansa. */
    atualizar(dt) { helice.rotation.z += (dt || 0) * 5.6 },
  }
}

// --- relogio de parede -----------------------------------------------------------

/**
 * RELOGIO DE PAREDE. Corpo parado, ponteiros vivos.
 *
 * props.makeWallClock ja existe e faz mais que isto — mas ele poe
 * `userData.update` no grupo TOPO, e o forno le isso como "ramo dinamico
 * inteiro": as catorze malhas do relogio ficam de fora da fusao e viram catorze
 * draw calls parados numa parede de cozinha. Aqui o corpo funde com o resto do
 * comodo e so os DOIS ponteiros ficam de fora.
 *
 * @returns { grupo, atualizar(dt) }
 */
export function relogioDeParede(raio = 0.17) {
  const g = new THREE.Group()
  g.name = 'relogio-cozinha'

  const caixa = cyl(raio, raio, 0.048, M.acoEscuro, 24)
  caixa.rotation.x = Math.PI / 2
  caixa.position.z = 0.024
  g.add(caixa)
  const face = cyl(raio - 0.014, raio - 0.014, 0.008, M.mostrador, 24)
  face.rotation.x = Math.PI / 2
  face.position.z = 0.050
  g.add(face)

  const tick = new THREE.BoxGeometry(0.010, 0.028, 0.006)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const m = new THREE.Mesh(tick, M.preto)
    m.position.set(Math.sin(a) * (raio - 0.038), Math.cos(a) * (raio - 0.038), 0.055)
    m.rotation.z = -a
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }
  const vidro = new THREE.Mesh(new THREE.CircleGeometry(raio - 0.010, 22), glass(0xeaf6fb, 0.14))
  vidro.position.z = 0.060
  g.add(vidro)

  const ponteiros = new THREE.Group()
  ponteiros.userData.noBake = true
  g.add(ponteiros)
  const pHora = new THREE.Group(); pHora.position.z = 0.056
  const pMin = new THREE.Group(); pMin.position.z = 0.058
  pHora.add(box(0.013, 0.085, 0.005, M.preto, 0, 0.042, 0))
  pMin.add(box(0.010, 0.122, 0.005, M.preto, 0, 0.061, 0))
  ponteiros.add(pHora, pMin)
  const pino = cyl(0.011, 0.011, 0.016, M.preto, 8)
  pino.rotation.x = Math.PI / 2
  pino.position.z = 0.062
  g.add(pino)

  // O relogio le a hora DO SISTEMA e nao a do jogo. E de proposito: o ciclo de
  // dia daqui roda em minutos, e um ponteiro correndo a essa velocidade vira
  // enfeite piscante em vez de relogio. O que o jogador reconhece como relogio
  // e um ponteiro que quase nao anda.
  let acumulado = 0
  function escrever() {
    const agora = new Date()
    const mm = agora.getMinutes() + agora.getSeconds() / 60
    const hh = (agora.getHours() % 12) + mm / 60
    pMin.rotation.z = -(mm / 60) * Math.PI * 2
    pHora.rotation.z = -(hh / 12) * Math.PI * 2
  }
  escrever()

  return {
    grupo: g,
    /** 2 Hz basta: o ponteiro dos minutos anda 6 graus por minuto. */
    atualizar(dt) {
      acumulado += dt || 0
      if (acumulado < 0.5) return
      acumulado = 0
      escrever()
    },
  }
}

// --- quadro de avisos ------------------------------------------------------------

/**
 * QUADRO DE AVISOS de cortica, com a escala pregada.
 *
 * Os papeis sao TORTOS de proposito, e nenhum esta no centro. Papel pregado
 * reto e papel que nunca foi lido; o que se quer aqui e o oposto disso.
 */
export function quadroDeAvisos(larg = 0.80, alt = 0.58) {
  const g = new THREE.Group()
  g.name = 'quadro-avisos'
  const t = 0.030

  g.add(box(larg, alt, 0.018, M.cortica, 0, 0, 0.009))
  g.add(box(larg + t * 2, t, 0.028, M.madeira, 0, alt / 2 + t / 2, 0.014))
  g.add(box(larg + t * 2, t, 0.028, M.madeira, 0, -alt / 2 - t / 2, 0.014))
  g.add(box(t, alt, 0.028, M.madeira, -larg / 2 - t / 2, 0, 0.014))
  g.add(box(t, alt, 0.028, M.madeira, larg / 2 + t / 2, 0, 0.014))

  // A ESCALA. Texto de verdade, porque e o unico papel do quadro que o jogador
  // vai chegar perto o bastante pra ler — e um quadro de avisos sem uma linha
  // legivel e so um retangulo marrom.
  const escala = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.21), textPlaneMat('ESCALA', {
    w: 512, h: 360, bg: '#f6f4ec', color: '#2b3138',
    font: 'bold 96px "Trebuchet MS", sans-serif', emissiveIntensity: 0.05,
  }))
  escala.position.set(-larg / 2 + 0.20, alt / 2 - 0.15, 0.020)
  escala.rotation.z = 0.035
  escala.receiveShadow = true
  g.add(escala)

  const papeis = [
    [0.16, 0.22, 0.12, -0.02, -0.06, 0xf3f0e6],
    [0.13, 0.18, -0.10, -0.16, 0.09, 0xfaf0c8],
    [0.20, 0.14, 0.24, 0.16, -0.04, 0xeef2f4],
    [0.11, 0.15, 0.30, -0.14, 0.07, 0xfaf0c8],
  ]
  for (const [w, h, x, y, r, cor] of papeis) {
    const p = box(w, h, 0.002, solid(cor, 0.94), x, y, 0.021)
    p.castShadow = false
    g.add(p)
    const tacha = cyl(0.007, 0.007, 0.010, solid(0xc4392f, 0.5, 0.2), 8)
    tacha.rotation.x = Math.PI / 2
    tacha.position.set(x, y + h / 2 - 0.016, 0.027)
    tacha.castShadow = false
    g.add(tacha)
    p.rotation.z = r
  }
  return g
}

// --- prateleira de parede para copos ---------------------------------------------

/** PRATELEIRA DE PAREDE de inox, com duas maos-francesas. Pendurada. */
export function prateleiraDeParede(larg = 1.80, prof = 0.26) {
  const g = new THREE.Group()
  g.name = 'prateleira-parede'
  g.add(box(larg, 0.024, prof, M.inox, 0, 0, prof / 2))
  // lip de tras: impede o copo de escorregar pra fresta da parede
  g.add(box(larg, 0.026, 0.014, M.inoxEscovado, 0, 0.024, 0.008))
  for (const sx of [-1, 1]) {
    const x = sx * (larg / 2 - 0.14)
    g.add(box(0.030, 0.026, prof, M.inoxEscovado, x, -0.024, prof / 2))
    // a diagonal da mao-francesa
    const diag = box(0.022, 0.012, prof * 1.18, M.inoxEscovado, x, -0.09, prof / 2)
    diag.rotation.x = 0.62
    g.add(diag)
  }
  return g
}

// --- escorredor de copos ----------------------------------------------------------

/**
 * ESCORREDOR DE COPOS: grade de arame com pes de borracha.
 *
 * As varetas correm no sentido CURTO e nao no longo. Parece detalhe, mas e o
 * que faz o copo de boca pra baixo apoiar em tres varetas em vez de duas — e
 * escorredor onde o copo baila e escorredor que nao convence.
 */
export function escorredorDeCopos(larg = 1.60, prof = 0.42) {
  const g = new THREE.Group()
  g.name = 'escorredor'
  const hx = larg / 2, hz = prof / 2
  const H = 0.045

  // quadro
  g.add(box(larg, 0.010, 0.012, M.aco, 0, H, -hz + 0.006))
  g.add(box(larg, 0.010, 0.012, M.aco, 0, H, hz - 0.006))
  g.add(box(0.012, 0.010, prof, M.aco, -hx + 0.006, H, 0))
  g.add(box(0.012, 0.010, prof, M.aco, hx - 0.006, H, 0))
  // varetas no sentido curto
  const vareta = new THREE.BoxGeometry(0.007, 0.007, prof - 0.02)
  const n = Math.max(6, Math.floor(larg / 0.062))
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(vareta, M.aco)
    m.position.set(-hx + 0.03 + i * ((larg - 0.06) / (n - 1)), H + 0.007, 0)
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }
  // borda levantada e os pes
  for (const sz of [-1, 1]) g.add(box(larg, 0.030, 0.008, M.aco, 0, H + 0.020, sz * (hz - 0.004)))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.011, 0.013, H, M.borracha, 8).translateX(sx * (hx - 0.05)).translateY(H / 2).translateZ(sz * (hz - 0.05)))
    }
  }
  g.userData.apoio = H + 0.011      // y em que o copo pousa
  return g
}

// --- bancada de apoio --------------------------------------------------------------

/**
 * BANCADA DE APOIO de inox: tampo, espelho, prateleira baixa e quatro pes.
 *
 * E onde a louca suja CHEGA. Ela e propositalmente mais estreita e mais nua que
 * a pia — se as duas tivessem o mesmo peso visual, o jogador nao saberia qual e
 * a que importa.
 */
export function bancadaDeApoio(larg = 2.00, prof = 0.64, alt = 0.90) {
  const g = new THREE.Group()
  g.name = 'bancada-apoio'
  const hx = larg / 2, hz = prof / 2
  g.add(box(larg, 0.040, prof, M.inox, 0, alt - 0.020, 0))
  g.add(box(larg, 0.14, 0.026, M.inox, 0, alt + 0.070, -hz + 0.013))
  g.add(box(larg - 0.10, 0.026, prof - 0.14, M.inoxEscovado, 0, 0.22, 0))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (hx - 0.08), z = sz * (hz - 0.08)
      g.add(cyl(0.024, 0.024, alt - 0.04, M.inoxEscovado, 10).translateX(x).translateY((alt - 0.04) / 2).translateZ(z))
      g.add(cyl(0.032, 0.028, 0.020, M.borracha, 8).translateX(x).translateY(0.010).translateZ(z))
    }
  }
  g.userData.pegada = { w: larg, d: prof }
  g.userData.tampo = alt
  return g
}

// --- cabide de aventais ---------------------------------------------------------------

/** TRILHO DE GANCHOS com um avental e um pano de prato. Pendurado. */
export function cabideDeAventais(larg = 0.70) {
  const g = new THREE.Group()
  g.name = 'cabide-aventais'
  g.add(box(larg, 0.055, 0.022, M.madeira, 0, 0, 0.011))
  const xs = [-larg / 2 + 0.12, 0, larg / 2 - 0.12]
  for (const x of xs) {
    const h = cyl(0.008, 0.008, 0.055, M.cromo, 8)
    h.rotation.x = Math.PI / 2
    h.position.set(x, -0.008, 0.045)
    g.add(h)
    g.add(sphereMini(x, -0.008, 0.074))
  }
  // o avental: dois panos, o de baixo mais largo, com uma dobra no meio
  const av = solid(0x2c4a63, 0.94)
  const peito = box(0.24, 0.26, 0.014, av, xs[0], -0.20, 0.062)
  peito.rotation.z = 0.04
  g.add(peito)
  const saia = box(0.34, 0.40, 0.014, av, xs[0] + 0.01, -0.52, 0.058)
  saia.rotation.z = -0.03
  g.add(saia)
  // o pano de prato, no ultimo gancho
  const pano = box(0.20, 0.34, 0.012, M.pano, xs[2], -0.20, 0.060)
  pano.rotation.z = -0.07
  g.add(pano)
  return g
}

function sphereMini(x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.cromo)
  m.position.set(x, y, z)
  m.castShadow = false
  m.receiveShadow = true
  return m
}

export default {
  caixaPlastica, prateleiraDeAco, carrinhoDeLouca, lixeiraDePedal,
  exaustorDeParede, relogioDeParede, quadroDeAvisos, prateleiraDeParede,
  escorredorDeCopos, bancadaDeApoio, cabideDeAventais,
}
