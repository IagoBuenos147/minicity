import * as THREE from 'three'
import { solid, box, cyl, tex } from '../world/materials.js'
import { contextoDeAudio } from '../audio/som.js'

// ---------------------------------------------------------------------------
// src/mobilia/pia.js — A PIA INDUSTRIAL DE LAVAR LOUCA.
//
// O pedido do dono foi curto: "uma pia que vamos usar pra lavar". O sistema de
// lavar NAO existe ainda, e e justamente por isso que este arquivo nasce
// separado do comodo que o contem (world/casino-cozinha.js): a pia e a peca que
// vai GANHAR mecanica depois, e peca que vai crescer nao mora dentro do montador
// do comodo. Quando o dia de lavar copo chegar, quem mexe e este arquivo.
//
// A DECISAO QUE MANDA AQUI: A TORNEIRA E UM MOVEL COM ESTADO, NAO UM DESENHO.
//
// Uma pia de cenario seria seis caixas de inox e acabou. O que faz esta pia
// valer o arquivo e que ela ABRE: a alavanca gira com mola, a coluna de agua
// CRESCE PRA BAIXO ate bater no fundo da cuba, o respingo espalha, e ao fechar
// a coluna se desprende do bico e o rabo dela CAI (o topo e que sobe, nao o pe
// que encolhe — coluna que encolhe pelo pe parece elastico, nao agua).
//
// Essa mecanica e copiada de propria de mobilia/barril.js, que ja resolveu o
// mesmo problema pro chope. Nao foi reaproveitada por importacao porque aquele
// modulo desenha um bico de LATAO com castao de bomba de chope, e o que se quer
// aqui e uma torneira de pescoco de ganso de inox — a fisica e a mesma, a peca
// e outra. O que se copiou foi o RACIOCINIO, e ele esta comentado nos dois.
//
// PLANTA DA PECA (frente para +Z, origem no CENTRO da pegada, y=0 no piso):
//
//    -X                                                            +X
//     |<---------------------- LARG (4.00) --------------------->|
//     +----+-------------+---+-------------+--------------------+   z = -0.35 (costas)
//     |    |   CUBA B    | | |   CUBA A    |                    |
//     |    |  (0.76x0.46)| | |  (0.76x0.46)|    PINGADEIRA      |
//     |    |             | | |      ^      |   (escorredor)     |
//     +----+-------------+---+------|------+--------------------+   z = +0.35 (frente)
//        chuveirinho      div    torneira
//
// O escorredor de copos, a bancada de louca suja e o resto da cozinha NAO
// entram aqui: sao do comodo. Esta peca e a bancada, as duas cubas, a torneira
// e a agua.
//
// Escala real em metros. Origem no piso; quem monta e que sabe onde e o chao.
// ---------------------------------------------------------------------------

// --- materiais --------------------------------------------------------------

/** Faixas correndo dentro da coluna de agua. Mesmo truque do jorro do chope. */
function aguaTex() {
  return tex('pia-agua', 64, (g, s) => {
    g.fillStyle = '#cfe4f0'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 34; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.18 + Math.random() * 0.55) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 7 + Math.random() * 26)
    }
    // as duas bordas claras: e onde a luz atravessa a coluna e vira contorno
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillRect(0, 0, 3, s)
    g.fillRect(s - 3, 0, 3, s)
  })
}

// A textura da agua ROLA (offset.y anda todo quadro). Por isso ela e um CLONE:
// tex() devolve do cache global, e escrever offset num objeto cacheado faria a
// agua desta pia arrastar a textura de qualquer outra peca que pedisse a mesma
// chave. Clone tem imagem compartilhada e parametros proprios, que e exatamente
// o que se quer.
let _matAgua = null
function matAgua() {
  if (_matAgua) return _matAgua
  const t = aguaTex().clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 2.4)
  t.needsUpdate = true
  _matAgua = new THREE.MeshStandardMaterial({
    map: t, color: 0xeaf7ff, emissive: 0x8fc4dd, emissiveIntensity: 0.16,
    transparent: true, opacity: 0.58, roughness: 0.06, metalness: 0.0,
    depthWrite: false, side: THREE.DoubleSide,
  })
  return _matAgua
}

const M = {
  // Inox de bancada: aspero de mais pra ser espelho e metalico de mais pra ser
  // tinta. Chapa de pia arranhada nao devolve o mundo, devolve um borrao claro.
  get inox() { return solid(0xc3c9ce, 0.32, 0.80) },
  get inoxEscovado() { return solid(0xa7aeb4, 0.46, 0.72) },
  get inoxFundo() { return solid(0x8d959b, 0.40, 0.75) },
  get cromo() { return solid(0xd8dde1, 0.16, 0.92) },
  get borracha() { return solid(0x22252a, 0.95, 0.0) },
  get espuma() { return solid(0xf2f6f8, 0.90) },
}

// --- a torneira --------------------------------------------------------------

/**
 * TORNEIRA DE PESCOCO DE GANSO, com alavanca unica.
 *
 * O desenho tem uma regra so, e ela vem de um erro que barril.js ja pagou: o
 * bico precisa SAIR DA SILHUETA DA COLUNA. Uma torneira desenhada como um tubo
 * reto com uma bola em cima le como poste. O pescoco de ganso resolve isso
 * sozinho — o arco joga o bico 24 cm a frente da base, e a peca fica com um
 * contorno em U que se reconhece de qualquer angulo, inclusive de frente.
 *
 * O arco e MEIO TORUS e nao dois cotovelos porque, num torus, a tangente em
 * t=0 e vertical: encostando t=0 no topo da coluna as duas pecas se emendam
 * sem degrau, e nenhum ajuste de milimetro e preciso.
 *
 * @param opts.fundo  Y da superficie em que a agua bate, em coordenadas LOCAIS
 *                    da torneira (negativo: o fundo da cuba fica ABAIXO da base
 *                    dela). Recebe o fundo e nao a queda pronta de proposito —
 *                    a altura do bico e assunto interno desta funcao, e quem
 *                    monta a pia nao pode ter que copiar 0.232 daqui.
 */
function criarTorneira(opts = {}) {
  const fundo = opts.fundo !== undefined ? opts.fundo : -0.34

  const g = new THREE.Group()
  g.name = 'pia-torneira'
  // Ela gira e a agua corre: a subarvore inteira fica FORA do forno. A marca
  // vai no topo da arvore de proposito — o forno preserva o topo do ramo
  // dinamico e reparenteia so ele, entao tudo aqui dentro mantem o transform
  // LOCAL e continua respondendo a .rotation/.position/.scale como escrito.
  g.userData.noBake = true

  const R_ARCO = 0.125          // raio do pescoco: o bico cai 25 cm a frente
  const Y_COLUNA = 0.30         // onde o arco nasce

  const flange = cyl(0.046, 0.052, 0.022, M.inox, 16)
  flange.position.y = 0.011
  g.add(flange)
  const coluna = cyl(0.021, 0.024, Y_COLUNA, M.cromo, 14)
  coluna.position.y = Y_COLUNA / 2
  g.add(coluna)

  // o pescoco: meio torus deitado no plano ZY (rotation.y = -PI/2 leva o
  // plano XY do torus pro plano ZY), nascendo no topo da coluna
  const arco = new THREE.Mesh(new THREE.TorusGeometry(R_ARCO, 0.020, 8, 22, Math.PI), M.cromo)
  arco.rotation.y = -Math.PI / 2
  arco.position.set(0, Y_COLUNA, R_ARCO)
  arco.castShadow = true
  arco.receiveShadow = true
  g.add(arco)

  // bico apontando pra baixo + o aerador
  const bico = cyl(0.0165, 0.0195, 0.058, M.cromo, 12)
  bico.position.set(0, Y_COLUNA - 0.029, R_ARCO * 2)
  g.add(bico)
  const aerador = cyl(0.0215, 0.0215, 0.010, M.inoxEscovado, 12)
  aerador.position.set(0, Y_COLUNA - 0.062, R_ARCO * 2)
  g.add(aerador)

  /** De onde a agua sai, em coordenadas LOCAIS da torneira. */
  const BICO = new THREE.Vector3(0, Y_COLUNA - 0.068, R_ARCO * 2)
  const queda = Math.max(0.06, BICO.y - fundo)

  // --- alavanca ---------------------------------------------------------------
  //
  // Monocomando: o cabo esta deitado e LEVANTA pra abrir.
  //
  // ELE SAI DE LADO, e nao pra tras. Pra tras era o obvio (e o lado em que a
  // alavanca nao briga com o pescoco), e estava errado: a torneira nasce na
  // faixa de tras do tampo, a 5 cm da parede, e um cabo de 13 cm apontando pra
  // tras termina DENTRO do azulejo. De lado ele fica sobre a propria cuba, que
  // e espaco vazio, e continua visivel de frente porque o arco do pescoco passa
  // por cima e nao na frente dele.
  const pivo = new THREE.Group()
  pivo.position.set(-0.020, 0.252, 0)
  g.add(pivo)
  const cabo = cyl(0.011, 0.013, 0.105, M.cromo, 10)
  cabo.rotation.z = Math.PI / 2
  cabo.position.x = -0.062
  pivo.add(cabo)
  const punho = cyl(0.019, 0.014, 0.038, M.inoxEscovado, 10)
  punho.rotation.z = Math.PI / 2
  punho.position.x = -0.130
  pivo.add(punho)

  // --- a coluna de agua --------------------------------------------------------
  // Um cilindro so, com 1 m de altura de proposito: a escala em Y e que define
  // o comprimento a cada quadro, e assim a geometria nunca precisa ser refeita.
  const mAgua = matAgua()
  const jorro = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0105, 0.0142, 1, 10, 1, true), mAgua)
  jorro.visible = false
  jorro.castShadow = false
  jorro.position.set(BICO.x, 0, BICO.z)
  g.add(jorro)

  // a cabeca da coluna: o bolo mais gordo que desce na frente do resto da agua
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 10, 8), mAgua)
  cabeca.visible = false
  cabeca.castShadow = false
  cabeca.scale.set(1, 1.5, 1)
  cabeca.position.set(BICO.x, 0, BICO.z)
  g.add(cabeca)

  // O RESPINGO no ponto de impacto: uma calota achatada que pulsa. E a peca que
  // faz a agua BATER em vez de atravessar o inox — sem ela a coluna termina no
  // nada e o olho le como um tubo de vidro parado.
  const respingo = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 14, 8, 0, Math.PI * 2, 0, 1.25), M.espuma)
  respingo.scale.set(1, 0.28, 1)
  respingo.visible = false
  respingo.castShadow = false
  respingo.position.set(BICO.x, BICO.y - queda + 0.004, BICO.z)
  g.add(respingo)

  // a lamina de agua espalhando no fundo da cuba: um disco que cresce junto
  const lamina = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), mAgua)
  lamina.rotation.x = -Math.PI / 2
  lamina.position.set(BICO.x, BICO.y - queda + 0.002, BICO.z)
  lamina.visible = false
  lamina.castShadow = false
  lamina.receiveShadow = false
  g.add(lamina)

  // PINGOS DE DEPOIS: as gotas que caem quando fecha. Uma InstancedMesh so —
  // e o detalhe que faz a torneira parecer molhada por dentro.
  const NP = 4
  const pingos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0062, 6, 5), mAgua, NP)
  pingos.visible = false
  pingos.castShadow = false
  pingos.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  g.add(pingos)
  const gotas = []
  for (let i = 0; i < NP; i++) gotas.push({ ativo: false, y: 0, v: 0, atraso: 0 })
  const _d = new THREE.Object3D()

  // --- estado -------------------------------------------------------------------
  let aberta = false
  let alav = 0            // 0 fechada, 1 aberta (com mola)
  let alavVel = 0
  let pe = 0              // ate onde o pe da coluna ja desceu (m)
  let topo = 0            // de onde a coluna comeca (m abaixo do bico)
  let jato = 0            // 0..1 do respingo
  let t = 0

  const ANG_ABERTA = 0.92         // ~53 graus levantando o cabo
  const V_QUEDA = 2.6             // m/s: a queda real nos primeiros 50 cm
  const MOLA_K = 240
  const MOLA_C = 21

  function escreverPingos() {
    let vivo = false
    for (let i = 0; i < NP; i++) {
      const p = gotas[i]
      if (!p.ativo) { _d.position.set(0, -99, 0); _d.scale.setScalar(0.0001) } else {
        vivo = true
        _d.position.set(BICO.x, p.y, BICO.z)
        _d.scale.set(1, 1 + Math.min(1.4, p.v * 0.5), 1)
      }
      _d.updateMatrix()
      pingos.setMatrixAt(i, _d.matrix)
    }
    pingos.instanceMatrix.needsUpdate = true
    pingos.visible = vivo
  }

  const api = {
    grupo: g,
    bicoLocal: BICO.clone(),
    get aberta() { return aberta },

    /**
     * true quando a agua JA CHEGOU no fundo — nao quando a alavanca virou.
     *
     * Sao ~250 ms de diferenca, e e este getter (e nao `aberta`) que o sistema
     * de lavar de amanha deve consultar: copo que comeca a ficar limpo no
     * quadro em que a alavanca deita fica limpo antes de existir agua na tela.
     */
    get jorrando() { return aberta && pe >= queda - 0.014 },

    abrir() { if (aberta) return false; aberta = true; alavVel = 7.4; return true },
    fechar() {
      if (!aberta) return false
      aberta = false
      alavVel = -6.6
      for (let i = 0; i < NP; i++) {
        gotas[i].ativo = true
        gotas[i].y = BICO.y
        gotas[i].v = 0
        gotas[i].atraso = 0.08 + i * 0.13 + Math.random() * 0.06
      }
      return true
    },
    alternar() { return aberta ? (api.fechar(), false) : (api.abrir(), true) },

    atualizar(dt) {
      const d = Math.min(dt || 0, 0.05)
      t += d

      // a mola do monocomando
      const alvo = aberta ? 1 : 0
      alavVel += (-(alav - alvo) * MOLA_K - alavVel * MOLA_C) * d
      alav += alavVel * d
      // o cabo aponta pro -X: girar em Z pelo negativo LEVANTA a ponta
      pivo.rotation.z = -ANG_ABERTA * alav

      // a coluna: abrindo o PE desce; fechando o TOPO sobe e o rabo cai
      if (aberta) {
        topo = 0
        if (alav > 0.30) pe = Math.min(queda, pe + V_QUEDA * d)
      } else if (pe > topo) {
        topo = Math.min(queda, topo + V_QUEDA * d)
      }

      const comp = Math.max(0, pe - topo)
      const mostrando = comp > 0.004
      jorro.visible = mostrando
      cabeca.visible = mostrando && pe < queda - 0.005
      if (mostrando) {
        jorro.scale.y = comp
        jorro.position.y = BICO.y - topo - comp / 2
        const tremor = 1 + Math.sin(t * 24) * 0.055
        jorro.scale.x = jorro.scale.z = tremor
        mAgua.map.offset.y = (mAgua.map.offset.y - d * 3.6) % 1
        cabeca.position.y = BICO.y - pe
      }

      // o respingo e a lamina no fundo
      const batendo = aberta && pe >= queda - 0.007
      jato += ((batendo ? 1 : 0) - jato) * (1 - Math.exp(-(batendo ? 8 : 2.4) * d))
      respingo.visible = jato > 0.03
      lamina.visible = jato > 0.03
      if (respingo.visible) {
        const s = 0.5 + jato * 0.6 + Math.sin(t * 19) * 0.05 * jato
        respingo.scale.set(s, 0.24 + jato * 0.16, s)
        const sl = 0.5 + jato * 0.75 + Math.sin(t * 11 + 1.7) * 0.05 * jato
        lamina.scale.set(sl, 1, sl)
      }

      // os pingos de depois
      let algum = false
      for (let i = 0; i < NP; i++) {
        const p = gotas[i]
        if (!p.ativo) continue
        algum = true
        if (p.atraso > 0) { p.atraso -= d; continue }
        p.v += 9.8 * d
        p.y -= p.v * d
        if (p.y <= BICO.y - queda) p.ativo = false
      }
      if (algum || pingos.visible) escreverPingos()
    },
  }
  return api
}

// --- o chuveirinho ------------------------------------------------------------

/**
 * CHUVEIRINHO DE MANGUEIRA FLEXIVEL — a coluna com mola e a pistola pendurada.
 *
 * Ele NAO abre. E cenario, e de proposito: dois pontos de E a 40 cm um do outro
 * viram um so na pratica (a interacao escolhe o mais proximo e o jogador nunca
 * entende por que as vezes sai o outro). A torneira e quem abre; o chuveirinho
 * esta aqui porque e ELE que faz qualquer um reconhecer a peca como pia de
 * lavar copo de bar — sem ele isto e uma pia de cozinha domestica grande.
 *
 * A MOLA e uma helice de verdade (TubeGeometry sobre uma curva), e nao um
 * cilindro estriado por textura: a silhueta dela e o desenho todo, e textura
 * nao muda silhueta.
 */
function criarChuveirinho() {
  const g = new THREE.Group()
  g.name = 'pia-chuveirinho'

  const flange = cyl(0.042, 0.048, 0.020, M.inox, 14)
  flange.position.y = 0.010
  g.add(flange)
  const haste = cyl(0.0135, 0.0155, 0.72, M.cromo, 12)
  haste.position.y = 0.36
  g.add(haste)

  // a mola: 9 voltas subindo de 0.10 a 0.62
  const pts = []
  const VOLTAS = 9, N = 96
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const a = u * VOLTAS * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(a) * 0.031, 0.10 + u * 0.52, Math.sin(a) * 0.031))
  }
  const mola = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 108, 0.0058, 5, false), M.inoxEscovado)
  mola.castShadow = true
  mola.receiveShadow = true
  g.add(mola)

  // o braco de cima, curvando pra frente, e a mangueira caindo dele
  const braco = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.013, 6, 12, Math.PI / 2), M.cromo)
  braco.rotation.y = -Math.PI / 2
  braco.position.set(0, 0.72, 0.085)
  braco.castShadow = true
  braco.receiveShadow = true
  g.add(braco)

  const hp = [
    new THREE.Vector3(0, 0.805, 0.085),
    new THREE.Vector3(0, 0.790, 0.155),
    new THREE.Vector3(0, 0.720, 0.205),
    new THREE.Vector3(0, 0.610, 0.215),
  ]
  const mangueira = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 18, 0.0115, 6, false), M.borracha)
  mangueira.castShadow = true
  mangueira.receiveShadow = true
  g.add(mangueira)

  // a pistola, pendurada de bico pra baixo
  const pistola = new THREE.Group()
  pistola.position.set(0, 0.610, 0.215)
  const corpo = cyl(0.0175, 0.0175, 0.115, M.cromo, 12)
  corpo.position.y = -0.058
  pistola.add(corpo)
  const cabecote = cyl(0.036, 0.030, 0.036, M.inoxEscovado, 14)
  cabecote.position.y = -0.132
  pistola.add(cabecote)
  const crivo = cyl(0.031, 0.031, 0.006, M.inoxFundo, 14)
  crivo.position.y = -0.152
  pistola.add(crivo)
  const gatilho = box(0.012, 0.052, 0.030, M.borracha, 0, -0.070, -0.028)
  gatilho.rotation.x = -0.30
  pistola.add(gatilho)
  const capa = cyl(0.024, 0.024, 0.030, M.borracha, 10)
  capa.position.y = -0.010
  pistola.add(capa)
  g.add(pistola)

  return g
}

// --- a pia inteira -------------------------------------------------------------

/**
 * PIA INDUSTRIAL DE CUBA DUPLA, com pingadeira, torneira e chuveirinho.
 *
 * A bancada e montada em PEDACOS e nao numa caixa so porque as cubas precisam
 * ser BURACOS de verdade: uma caixa inteira com duas depressoes desenhadas por
 * cima daria o mesmo numero de malhas e o jogador enxergaria a tampa fechada
 * por dentro da cuba na primeira vez que olhasse de cima. Sao 5 pecas de tampo
 * (fundo, frente e as tres faixas entre os buracos) e 5 chapas por cuba.
 *
 * O pe e ABERTO NA FRENTE e fechado atras: e o desenho de pia de bar de
 * verdade, e resolve de graca o problema de a parede aparecer por baixo do
 * movel — o painel de costas tapa.
 *
 * @param opts.larg   comprimento total (m)     — padrao 4.00
 * @param opts.prof   profundidade (m)          — padrao 0.70
 * @param opts.alt    altura do tampo (m)       — padrao 0.90
 * @returns { grupo, torneira, colisor, alvoTorneira, alvoPingadeira, atualizar }
 */
export function criarPiaIndustrial(opts = {}) {
  const LARG = opts.larg !== undefined ? opts.larg : 4.00
  const PROF = opts.prof !== undefined ? opts.prof : 0.70
  const ALT = opts.alt !== undefined ? opts.alt : 0.90

  const g = new THREE.Group()
  g.name = 'pia-industrial'

  const hx = LARG / 2, hz = PROF / 2
  const ESP = 0.045                    // espessura do tampo
  const yTampo = ALT - ESP / 2

  // As duas cubas, em X local. A cuba A (a da torneira) fica no CENTRO do vao
  // da porta do comodo — quem entra encara a torneira, e nao a lateral do
  // movel. Quem monta escolhe onde a peca fica; o alinhamento sai daqui.
  const CUBA_W = 0.76, CUBA_D = 0.46, CUBA_H = 0.30
  const CUBA_A = -0.65                 // centro em X local
  const CUBA_B = -1.50
  const cz0 = -0.25, cz1 = cz0 + CUBA_D          // -0.25 .. 0.21
  const yFundo = ALT - ESP - CUBA_H              // 0.555

  const cubas = [CUBA_A, CUBA_B].map((cx) => ({
    cx, x0: cx - CUBA_W / 2, x1: cx + CUBA_W / 2,
  }))
  const bA = cubas[0], bB = cubas[1]

  // --- tampo em pedacos ---------------------------------------------------
  const faixa = (x0, x1, z0, z1) => {
    if (x1 - x0 <= 0.002 || z1 - z0 <= 0.002) return
    g.add(box(x1 - x0, ESP, z1 - z0, M.inox, (x0 + x1) / 2, yTampo, (z0 + z1) / 2))
  }
  faixa(-hx, hx, -hz, cz0)              // faixa de tras (onde nascem as torneiras)
  faixa(-hx, hx, cz1, hz)               // faixa da frente (a pingadeira do corpo)
  faixa(-hx, bB.x0, cz0, cz1)           // ponta direita
  faixa(bB.x1, bA.x0, cz0, cz1)         // o divisor entre as duas cubas
  faixa(bA.x1, hx, cz0, cz1)            // a pingadeira

  // --- as duas cubas ------------------------------------------------------
  const CH = 0.014                       // espessura da chapa da cuba
  for (const c of cubas) {
    const w = c.x1 - c.x0
    // fundo, levemente rebaixado no centro pelo ralo
    g.add(box(w, CH, CUBA_D, M.inoxFundo, c.cx, yFundo, (cz0 + cz1) / 2))
    // as quatro paredes
    g.add(box(CH, CUBA_H, CUBA_D, M.inoxEscovado, c.x0 + CH / 2, yFundo + CUBA_H / 2, (cz0 + cz1) / 2))
    g.add(box(CH, CUBA_H, CUBA_D, M.inoxEscovado, c.x1 - CH / 2, yFundo + CUBA_H / 2, (cz0 + cz1) / 2))
    g.add(box(w, CUBA_H, CH, M.inoxEscovado, c.cx, yFundo + CUBA_H / 2, cz0 + CH / 2))
    g.add(box(w, CUBA_H, CH, M.inoxEscovado, c.cx, yFundo + CUBA_H / 2, cz1 - CH / 2))
    // ralo + valvula
    const ralo = cyl(0.042, 0.042, 0.010, M.cromo, 14)
    ralo.position.set(c.cx, yFundo + 0.010, (cz0 + cz1) / 2)
    g.add(ralo)
    const grelha = cyl(0.030, 0.030, 0.004, M.inoxFundo, 12)
    grelha.position.set(c.cx, yFundo + 0.017, (cz0 + cz1) / 2)
    g.add(grelha)
    // sifao: desce do ralo e some no painel de costas
    const desce = cyl(0.026, 0.026, yFundo - 0.30, M.inoxFundo, 10)
    desce.position.set(c.cx, 0.30 + (yFundo - 0.30) / 2, (cz0 + cz1) / 2)
    g.add(desce)
    const corre = cyl(0.026, 0.026, hz - 0.02 + (cz0 + cz1) / 2, M.inoxFundo, 10)
    corre.rotation.x = Math.PI / 2
    corre.position.set(c.cx, 0.30, ((cz0 + cz1) / 2 - hz + 0.02) / 2)
    g.add(corre)
  }

  // --- espelho (rodabanca) e as canaletas da pingadeira -------------------
  g.add(box(LARG, 0.17, 0.028, M.inox, 0, ALT + 0.085, -hz + 0.014))
  // As canaletas caem PRA CUBA (o x cresce de bA.x1 ate hx, e elas apontam
  // pra tras): a pingadeira que escorre pro lado errado e o tipo de detalhe
  // que ninguem nomeia mas todo mundo estranha.
  const canal = new THREE.BoxGeometry(0.010, 0.008, PROF - 0.10)
  for (let i = 0; i < 9; i++) {
    const x = bA.x1 + 0.14 + i * 0.20
    if (x > hx - 0.08) break
    const m = new THREE.Mesh(canal, M.inoxEscovado)
    m.position.set(x, ALT + 0.003, 0)
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }

  // --- pe: 6 tubos, prateleira baixa e o painel de costas -----------------
  const PE_R = 0.026
  for (const x of [-hx + 0.10, -0.55, hx - 0.10]) {
    for (const z of [-hz + 0.10, hz - 0.10]) {
      const p = cyl(PE_R, PE_R, ALT - ESP, M.inoxEscovado, 10)
      p.position.set(x, (ALT - ESP) / 2, z)
      g.add(p)
      const sap = cyl(0.034, 0.030, 0.022, M.borracha, 8)
      sap.position.set(x, 0.011, z)
      g.add(sap)
    }
  }
  g.add(box(LARG - 0.10, 0.028, PROF - 0.16, M.inoxEscovado, 0, 0.235, 0))
  // costas fechadas: sem elas a parede aparece por baixo do movel
  g.add(box(LARG, ALT - ESP - 0.02, 0.020, M.inoxEscovado, 0, (ALT - ESP) / 2, -hz + 0.010))
  // travessa da frente, no rodape: e ela que amarra a leitura do movel embaixo
  g.add(box(LARG - 0.16, 0.045, 0.020, M.inoxEscovado, 0, 0.12, hz - 0.06))

  // --- torneira e chuveirinho ---------------------------------------------
  //
  // A agua bate na FACE DE CIMA da chapa do fundo (yFundo + CH/2), e nao no
  // centro dela: meio centimetro de erro aqui poe o respingo dentro do inox.
  const torneira = criarTorneira({ fundo: (yFundo + CH / 2) - ALT })
  torneira.grupo.position.set(CUBA_A, ALT, -hz + 0.05)
  g.add(torneira.grupo)

  // Ele fica entre as duas cubas (que e onde ele fica numa pia de verdade: o
  // jato tem que alcancar as duas) e nasce na mesma faixa de tras da torneira.
  const chuveirinho = criarChuveirinho()
  chuveirinho.position.set((CUBA_A + CUBA_B) / 2, ALT, -hz + 0.05)
  g.add(chuveirinho)

  // --- o som da agua --------------------------------------------------------
  const som = criarSomDeAgua()

  /** Pegada do movel, em coordenadas locais (o dono converte pra mundo). */
  const pegada = { x0: -hx, x1: hx, z0: -hz, z1: hz }

  /** Onde o E da torneira mora, em coordenadas LOCAIS (frente da cuba A). */
  const alvoTorneira = new THREE.Vector3(CUBA_A, 1.02, hz + 0.42)
  /** Onde o E da pingadeira mora (pro sistema de lavar de amanha). */
  const alvoPingadeira = new THREE.Vector3((bA.x1 + hx) / 2, 1.02, hz + 0.42)

  return {
    grupo: g,
    torneira,
    pegada,
    alvoTorneira,
    alvoPingadeira,
    /** Topo do tampo e altura do fundo da cuba: quem poe copo em cima usa. */
    alturas: { tampo: ALT, fundoCuba: yFundo + CH },
    /** Centro das duas cubas em X local — o alvo de quem for lavar copo. */
    cubas: cubas.map((c) => new THREE.Vector3(c.cx, yFundo + CH, (cz0 + cz1) / 2)),

    /**
     * @param dt   segundos
     * @param dist distancia do jogador ate a pia (m). So o volume usa.
     */
    atualizar(dt, dist) {
      torneira.atualizar(dt)
      som.acompanhar(torneira.jorrando || torneira.aberta, dist)
    },
  }
}

// ---------------------------------------------------------------------------
// O SOM DA AGUA
//
// Sintetizado, como tudo que soa neste jogo (ver audio/som.js): agua correndo e
// ruido branco filtrado, e nada mais. Duas camadas, porque uma so nao convence:
//
//   1. O CORPO — passa-banda largo em ~700 Hz. E o "chiado grave" do fio de
//      agua descendo, e sozinho parece vento.
//   2. O CHUVISCO — passa-alta em 3,8 kHz. E a agua BATENDO no inox, e sozinho
//      parece estatica de radio.
//
// Elas nascem juntas e sao moduladas por um LFO lento de 0,7 Hz — agua real nao
// tem volume constante, ela gorgoleja.
//
// O barramento e ligado UMA VEZ e nunca desligado: o que muda e o ganho. Criar
// e destruir BufferSource a cada aperto de E daria estalo no primeiro e no
// ultimo sample, e o estalo e mais audivel que a agua.
// ---------------------------------------------------------------------------

function criarSomDeAgua() {
  let nos = null
  let quebrado = false
  let ultimo = -1                     // ultimo ganho escrito (ver acompanhar)
  const PERTO = 2.2, LONGE = 11.0     // volume cheio ate 2,2 m; mudo a partir de 11

  function montar() {
    if (nos || quebrado) return nos
    const c = contextoDeAudio()
    if (!c) { quebrado = true; return null }
    try {
      const n = Math.floor(c.sampleRate * 2)
      const buf = c.createBuffer(1, n, c.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1

      const src = c.createBufferSource()
      src.buffer = buf
      src.loop = true

      const corpo = c.createBiquadFilter()
      corpo.type = 'bandpass'
      corpo.frequency.value = 700
      corpo.Q.value = 0.55
      const gCorpo = c.createGain()
      gCorpo.gain.value = 0.85

      const chuvisco = c.createBiquadFilter()
      chuvisco.type = 'highpass'
      chuvisco.frequency.value = 3800
      const gChuvisco = c.createGain()
      gChuvisco.gain.value = 0.22

      const mestre = c.createGain()
      mestre.gain.value = 0.0001

      src.connect(corpo); corpo.connect(gCorpo); gCorpo.connect(mestre)
      src.connect(chuvisco); chuvisco.connect(gChuvisco); gChuvisco.connect(mestre)
      mestre.connect(c.destination)
      src.start()

      // o gorgolejo: um LFO lento mexendo no passa-banda
      const lfo = c.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 0.7
      const lfoG = c.createGain()
      lfoG.gain.value = 160
      lfo.connect(lfoG); lfoG.connect(corpo.frequency)
      lfo.start()

      nos = { c, mestre }
    } catch (err) { void err; quebrado = true; nos = null }
    return nos
  }

  return {
    /**
     * Liga/desliga e ajusta o volume pela distancia, num unico lugar.
     *
     * So escreve no AudioParam quando o alvo MUDA de verdade. Isto roda todo
     * quadro: agendar uma rampa nova a 60 Hz enche a fila de eventos do
     * parametro sem mudar uma virgula do que se ouve.
     */
    acompanhar(correndo, dist) {
      let alvo = 0.0001
      if (correndo) {
        const dd = Number.isFinite(dist) ? dist : 0
        const k = dd <= PERTO ? 1 : dd >= LONGE ? 0 : 1 - (dd - PERTO) / (LONGE - PERTO)
        alvo = Math.max(0.0001, 0.16 * k * k)
      }
      if (Math.abs(alvo - ultimo) < 0.0015) return
      // agua parada e ganho zerado: nao ha por que montar o grafo ainda
      if (!correndo && !nos) { ultimo = alvo; return }
      const n = montar()
      if (!n) return
      ultimo = alvo
      try { n.mestre.gain.setTargetAtTime(alvo, n.c.currentTime, 0.08) } catch (err) { void err }
    },
  }
}

export default criarPiaIndustrial
