import * as THREE from 'three'
import { criarCameraCena } from '../systems/camera-cena.js'
import { copoDe, formaDe } from '../mobilia/copos.js'
import { frutaDe, guarnicaoDaFruta } from '../mobilia/frutas.js'
import { canudo as canudoUt, sombrinha, geoGelo, matGelo, matGeloMiolo, pistolaDeRefri } from '../mobilia/utensilios.js'
import { stdMat } from '../world/materials.js'
import { criarJorro } from './jorro.js'
import {
  DOSE, ingredienteDe, guarnicaoDe, avaliar, valorDe, comentarioDe, misturar, volumeDe,
} from './receitas.js'
import * as Som from './som-bar.js'

// ---------------------------------------------------------------------------
// src/bar/gestos.js — O MODO BARMAN: os minijogos da bancada.
//
// Este arquivo e a resposta ao pedido inteiro. O dono nao pediu um sistema de
// drinks — ele pediu o GESTO de fazer o drink, com a camera perto e a resposta
// na mao. Entao aqui nao existe um menu de "escolha o coquetel": existem sete
// gestos, e cada um e um minijogo com uma janela de acerto.
//
//   DOSAR       segurar o botao vira a garrafa; soltar endireita. Parar em
//               cima da marca gravada no copo da bonus, passar derrama.
//   TIRAR CHOPE segurar puxa a alavanca; o mouse pra o lado INCLINA o copo, e
//               copo inclinado faz menos colarinho. Cedo demais, meio copo;
//               tarde demais, transborda na canaleta.
//   CHACOALHAR  mexer o mouse pra cima e pra baixo, de verdade. Cada inversao
//               de sentido conta uma chacoalhada; o anel em volta da
//               coqueteleira enche. Parar na janela verde e o ponto.
//   LIQUIDIFICAR martelar o botao. O copo treme, o conteudo vira pure e o som
//               sobe de tom com a rotacao.
//   CORTAR      arrastar o mouse por cima da fruta na tabua. Cada arrasto e uma
//               rodela, e as rodelas enchem o porta-guarnicoes.
//   GELO        a pinca abre, pega uma pedra e larga no copo. Ela CAI e se
//               acomoda — nao ha fisica, ha um pulinho, e o pulinho vende.
//   GUARNECER   clicar uma guarnicao encaixa ela na borda do copo.
//
// ================== POR QUE O PONTEIRO E SOLTO, E O PRECO ==================
//
// O jogo inteiro roda com pointer lock (o mouse gira a cabeca). O bar nao pode:
// os gestos sao APONTAR e ARRASTAR, e uma mira no centro da tela nao aponta pra
// garrafa que esta no canto da prateleira. Entao o modo solta o ponteiro.
//
// Isso cobra dois precos, e os dois estao pagos aqui:
//
//   1. `core/input.js` so acumula movimento com o ponteiro PRESO
//      (`onMouseMove` sai cedo se `!locked`). Logo o modo escuta o mouse
//      SOZINHO, com clientX/clientY — que e o que ele quer de qualquer jeito,
//      porque a conta e de posicao na tela e nao de delta.
//   2. `main.js` tem um listener de clique no canvas que PEDE O PONTEIRO DE
//      VOLTA. Ele nao pode ser editado (tres abas mexem naquele arquivo), e um
//      clique na garrafa prenderia o mouse no meio do gesto. A saida e um
//      listener de CAPTURA em window: registrado na fase de captura, ele roda
//      ANTES do listener do canvas e para a propagacao enquanto o modo esta no
//      ar. Nada em main.js mudou e o clique nunca chega la.
//
// ================== POR QUE O ALVO E PROJETADO E NAO RAYCAST ================
//
// Ver o cabecalho de bar/estacao.js: depois do forno (bakeStatic) nao existe
// mais "a garrafa de zimbro" como objeto. O alvo e um PONTO com rotulo, e quem
// escolhe e a distancia na TELA. E mais tolerante que raycast, que e o que se
// quer — o gesto e pegar a garrafa, nao mirar nela.
//
// ================== A CAMERA E UMA SO, E ELA VIAJA =========================
//
// `systems/camera-cena.js` foi escrito pra isto: chamar `entrar` de novo
// enquanto ja esta dentro VIAJA pro novo enquadramento sem soltar a camera. E
// assim que se vai da parede de bebidas pro copo, do copo pra fruteira, sem
// corte nenhum. O PAN da bancada usa a mesma porta: o ponteiro encostado na
// borda arrasta a lente pela bancada, e cada 4 cm de arrasto e um `entrar` novo
// com 0,3 s de viagem — o que da uma perseguicao suave sem um segundo sistema
// de camera.
// ---------------------------------------------------------------------------

// --- constantes de sensacao --------------------------------------------------

const VAZAO_DOSE = 1.15         // doses por segundo com a garrafa virada
const VAZAO_CHOPE = 0.055       // litros por segundo na torneira aberta
const VIRA_DOSE = 3.6           // rad/s pra a garrafa chegar na horizontal
const ANG_DESPEJO = 2.05        // ~117 graus: a garrafa passa da horizontal
const LIMIAR_DESPEJO = 0.52     // acima disto sai liquido
const TOL_DOSE = 0.42           // doses de tolerancia em volta da marca

const CHACOALHO_PASSO = 0.052   // quanto cada inversao de sentido rende
const CHACOALHO_MIN_PX = 9      // movimento minimo pra contar como chacoalhada
const CHACOALHO_BOM = [0.86, 1.14]

const BATIDA_CLIQUE = 0.085     // quanto cada martelada rende no liquidificador
const BATIDA_SEGURA = 0.30      // por segundo, segurando (mais lento de propos.)

const CORTE_PX = 78             // arrasto minimo pra sair uma rodela

const PAN_ZONA = 0.56           // fora deste raio de tela a lente comeca a andar
const PAN_VEL = 2.3             // m/s
const PAN_PASSO = 0.045         // re-enquadra a cada 4,5 cm
const OLHAR_CIMA = -0.60        // ndcY pra subir pra parede de bebidas
const OLHAR_BAIXO = 0.52        // ndcY pra voltar pra bancada
const OLHAR_TEMPO = 0.30        // segundos de insistencia antes de trocar

/** Que tipos de alvo respondem em cada enquadramento. */
const TIPOS_POR_FOCO = {
  bancada: ['pia', 'gelo', 'tabua', 'liquidificador', 'coqueteleira', 'chope',
    'guarnicao', 'refri', 'copo', 'copo-mesa'],
  parede: ['garrafa'],
  fruteira: ['fruta'],
  copo: ['copo-mesa', 'copo', 'guarnicao'],
  gelo: ['gelo', 'copo-mesa'],
  tabua: ['tabua'],
  chope: ['chope', 'copo-mesa'],
  coqueteleira: ['coqueteleira', 'copo-mesa'],
  liquidificador: ['liquidificador', 'copo-mesa'],
  guarnicoes: ['guarnicao', 'copo-mesa'],
  pistola: ['refri', 'copo-mesa'],
  quadro: [],
}

/** Quantas guarnicoes de cada tipo o porta-guarnicoes comeca tendo. */
const ESTOQUE_INICIAL = 3
/** Estas nao se cortam: elas nao acabam. */
const SEM_ESTOQUE = ['canudo', 'sombrinha']

const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
// O terceiro nao e luxo: `alvoDaCena` LE o alvo e ESCREVE na saida, e passar o
// mesmo vetor nos dois papeis zera a conta (copy(pos) apaga o alvo antes do
// sub). Foi exatamente o que aconteceu, e o sintoma foi a lente da parede de
// bebidas encarando a origem do mundo.
const _v3 = new THREE.Vector3()
const _caixa = new THREE.Box3()

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function damp(cur, alvo, lambda, dt) { return cur + (alvo - cur) * (1 - Math.exp(-lambda * dt)) }

// ---------------------------------------------------------------------------
// A LENTE DE COSTAS — uma compatibilidade que se apaga sozinha
//
// `systems/camera-cena.js` monta a rotacao com um Object3D descartavel:
//
//     const _olho = new THREE.Object3D()
//     _olho.lookAt(alvo);  saida.copy(_olho.quaternion)
//
// e `Object3D.lookAt` tem DOIS caminhos (three/src/core/Object3D.js:291): num
// objeto comum ele aponta o +Z pro alvo; numa CAMERA ele aponta o -Z, que e pra
// onde camera olha. Como `_olho` e um Object3D comum, o quaternion que sai dali
// e o de "objeto encarando o alvo" — copiado pra uma camera, ela fica de
// COSTAS pro que se pediu. O conserto e uma linha (`new THREE.Camera()` no
// lugar do Object3D, ou trocar a ordem dos argumentos), e esta descrito no
// relatorio: aquele arquivo tem outro dono e nao pode ser editado daqui.
//
// Enquanto isso, o bar nao pode simplesmente nao funcionar. A saida e exata e
// nao e um chute: se o modulo aponta o +Z pro alvo, basta pedir o alvo
// ESPELHADO pela posicao da lente (P + (P - A)) — a base que sai e
// BIT A BIT a mesma que um lookAt de camera produziria, porque as duas contas
// terminam em z = normalize(P - A) com o mesmo `up`.
//
// E A SONDA SE APAGA SOZINHA. No dia em que o conserto entrar, `precisaVirar()`
// devolve false e o espelhamento para de acontecer, sem ninguem tocar aqui. Ela
// roda UMA vez, numa camera de mentira, e nao encosta na camera do jogo.
// ---------------------------------------------------------------------------

let _viraCena = null
function precisaVirar() {
  if (_viraCena !== null) return _viraCena
  _viraCena = false
  try {
    const prova = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const c = criarCameraCena({ camera: prova })
    c.entrar({
      pos: new THREE.Vector3(0, 0, 0),
      alvo: new THREE.Vector3(0, 0, -1),
      fov: 50, tempo: 0.0001, paralaxe: 0,
    })
    c.atualizar(0.5)
    c.atualizar(0.5)
    const d = new THREE.Vector3()
    prova.getWorldDirection(d)
    _viraCena = d.z > 0        // devia estar olhando pro -Z
    c.cortar()
  } catch (err) { void err }
  return _viraCena
}

/** O alvo a pedir pra camera-cena pra a lente olhar DE FATO pra `alvo`. */
function alvoDaCena(pos, alvo, saida) {
  if (!precisaVirar()) return saida.copy(alvo)
  return saida.copy(pos).multiplyScalar(2).sub(alvo)
}

/**
 * @param opts.estacao  o que criarEstacao devolveu
 * @param opts.ui       criarUIBar()
 */
export function criarGestos(opts = {}) {
  const est = opts.estacao
  const ui = opts.ui
  if (!est) throw new Error('bar/gestos: falta a estacao')

  const YB = est.base                 // o Y de mundo do piso do miolo
  const vivo = est.vivo

  // =========================================================================
  // O COPO DA BANCADA
  // =========================================================================
  //
  // Ele e o alvo de tudo. Vive no grupo VIVO (nao vai pro forno), muda de tipo
  // quando o jogador escolhe outro copo, anda ate a torneira e volta, inclina
  // no gesto do chope e carrega gelo e guarnicao como FILHOS — assim tudo que
  // esta dentro dele acompanha o copo sem uma linha de sincronizacao.

  const copoG = new THREE.Group()
  copoG.name = 'bar-copo-mesa'
  vivo.add(copoG)

  const cacheCopo = new Map()
  const copo = {
    id: null, ficha: null, forma: null, peca: null,
    nivel: 0, cor: 0xdfe8ea, espuma: 0,
    // posicao ALVO (local: X e Z de mundo, Y local do miolo)
    alvo: new THREE.Vector3(est.planta.copo.x, est.alturaBancada, est.planta.copo.z),
    inclina: 0, inclinaAlvo: 0,
  }
  copoG.position.copy(copo.alvo)

  // AS PEDRAS DE GELO, filhas do copo. Uma InstancedMesh de 9 — em malhas
  // soltas seriam 9 draw calls por copo, e o copo esta sempre em cena.
  const N_PEDRA = 9
  const pedras = new THREE.InstancedMesh(geoGelo(), matGelo(), N_PEDRA)
  pedras.count = 0
  pedras.castShadow = false
  pedras.frustumCulled = false
  pedras.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  copoG.add(pedras)
  const pedrasMiolo = new THREE.InstancedMesh(geoGelo(), matGeloMiolo(), N_PEDRA)
  pedrasMiolo.count = 0
  pedrasMiolo.castShadow = false
  pedrasMiolo.frustumCulled = false
  pedrasMiolo.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  copoG.add(pedrasMiolo)
  const dadosPedra = []
  const _mPedra = new THREE.Matrix4()
  const _qPedra = new THREE.Quaternion()
  const _ePedra = new THREE.Euler()
  const _sPedra = new THREE.Vector3()

  // as guarnicoes encaixadas na borda
  const guarnG = new THREE.Group()
  copoG.add(guarnG)

  // A MARCA DA DOSE: um anel gravado no vidro na altura em que a dose certa
  // termina. E o mesmo papel da linha do balde de pipoca — sem uma marca, o
  // gesto de "parar na hora" nao tem hora nenhuma.
  const marca = new THREE.Mesh(
    new THREE.TorusGeometry(0.036, 0.0016, 6, 26),
    stdMat('bar-marca-dose', {
      color: 0xfff0c8, emissive: 0xffc24a, emissiveIntensity: 2.6,
      transparent: true, opacity: 0.85, roughness: 0.4, depthWrite: false,
    }),
  )
  marca.rotation.x = Math.PI / 2
  marca.visible = false
  marca.castShadow = false
  copoG.add(marca)

  function trocarCopo(id) {
    const ficha = copoDe(id)
    if (!ficha) return false
    if (copo.peca) copoG.remove(copo.peca)
    let peca = cacheCopo.get(id)
    if (!peca) {
      try { peca = ficha.build() } catch (err) { void err; return false }
      if (!peca) return false
      peca.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
      cacheCopo.set(id, peca)
    }
    copoG.add(peca)
    copo.id = id
    copo.ficha = ficha
    copo.forma = formaDe(id) || { alt: 0.12, raioBoca: 0.034, fundo: 0.012 }
    copo.peca = peca
    pintarCopo()
    return true
  }

  function pintarCopo() {
    if (copo.peca && copo.peca.userData && copo.peca.userData.setNivel) {
      copo.peca.userData.setNivel(copo.nivel, copo.cor, copo.nivel > 0.02 ? copo.espuma : 0)
    }
  }

  /** Litros que cabem neste copo. */
  function capacidade() {
    return (copo.ficha && copo.ficha.copo && copo.ficha.copo.capacidade) || 0.25
  }

  /** A boca do copo, em coordenadas LOCAIS (o mesmo espaco de copoG). */
  function bocaLocal(saida) {
    const s = saida || _v
    return s.set(copoG.position.x, copoG.position.y + (copo.forma ? copo.forma.alt : 0.12), copoG.position.z)
  }

  /** A superficie do liquido, pra o jorro terminar EM CIMA dela e nao no fundo. */
  function superficieLocal(saida) {
    const s = saida || _v
    const f = copo.forma || { alt: 0.12, fundo: 0.012 }
    const y = f.fundo + (f.alt - 0.004 - f.fundo) * copo.nivel
    return s.set(copoG.position.x, copoG.position.y + y + 0.004, copoG.position.z)
  }

  // =========================================================================
  // O PREPARO
  // =========================================================================

  const preparo = {
    copo: 'copo-americano',
    partes: [],           // [{ id, doses }]
    gelo: 0,
    metodo: 'direto',
    guarnicoes: [],
    agitacao: 0,
    derramou: 0,
    precisao: 0.5,
  }
  let precisoes = []

  function volumeAtual() { return volumeDe(preparo.partes) }

  /** O que a faixa do rodape mostra: cada ingrediente e o gelo. */
  function fichas() {
    const l = preparo.partes.map((p) => {
      const i = ingredienteDe(p.id)
      return { nome: i ? i.curto : p.id, cor: i ? i.cor : 0xcccccc, doses: p.doses }
    })
    if (preparo.gelo > 0) l.push({ nome: 'gelo', cor: 0xcfe8f4, doses: preparo.gelo })
    return l
  }

  function repintar() {
    const vol = volumeAtual()
    copo.nivel = clamp(vol / capacidade(), 0, 1)
    copo.cor = misturar(preparo.partes)
    copo.espuma = espumaAtual
    pintarCopo()
    if (ui) ui.setPreparo(fichas())
  }

  let espumaAtual = 0

  /** Poe `doses` de um ingrediente. Devolve quanto REALMENTE coube. */
  function acrescentar(id, doses) {
    const ing = ingredienteDe(id)
    if (!ing || !(doses > 0)) return 0
    const cabe = Math.max(0, capacidade() - volumeAtual())
    const querido = doses * DOSE
    const entrou = Math.min(querido, cabe)
    if (entrou > 0.000001) {
      const achado = preparo.partes.find((p) => p.id === id)
      if (achado) achado.doses += entrou / DOSE
      else preparo.partes.push({ id, doses: entrou / DOSE })
      // a espuma da mistura e a do chope; ela so se soma quando o gesto do
      // chope escreve por cima (ver o gesto), senao um copo com meia dose de
      // chope viria com colarinho de caneca
      espumaAtual = Math.max(espumaAtual, 0)
      repintar()
    }
    return entrou / DOSE
  }

  function zerarPreparo(mesmoCopo) {
    preparo.partes.length = 0
    preparo.gelo = 0
    preparo.metodo = 'direto'
    preparo.guarnicoes.length = 0
    preparo.agitacao = 0
    preparo.derramou = 0
    preparo.precisao = 0.5
    precisoes = []
    espumaAtual = 0
    copo.nivel = 0
    dadosPedra.length = 0
    pedras.count = 0
    pedrasMiolo.count = 0
    while (guarnG.children.length) guarnG.remove(guarnG.children[0])
    if (!mesmoCopo) trocarCopo(preparo.copo)
    repintar()
  }

  // =========================================================================
  // O ESTOQUE DE GUARNICOES
  // =========================================================================
  const estoque = new Map()
  function estoqueDe(id) {
    if (SEM_ESTOQUE.indexOf(id) >= 0) return 99
    if (!estoque.has(id)) estoque.set(id, ESTOQUE_INICIAL)
    return estoque.get(id)
  }
  function gastarGuarnicao(id) {
    if (SEM_ESTOQUE.indexOf(id) >= 0) return true
    const n = estoqueDe(id)
    if (n <= 0) return false
    estoque.set(id, n - 1)
    return true
  }
  function repor(id, n) {
    if (SEM_ESTOQUE.indexOf(id) >= 0) return
    estoque.set(id, Math.min(12, estoqueDe(id) + (n || 1)))
  }

  // =========================================================================
  // AS PECAS QUE VIAJAM (a garrafa, a fruta, a pistola)
  // =========================================================================
  //
  // Um PIVO com a origem na BOCA da peca. Girando o pivo, a peca vira em torno
  // do proprio bico e o bico fica parado — que e o unico jeito de o fio de
  // liquido nascer sempre no mesmo lugar. Pivo no centro da garrafa faria o
  // bico descrever um arco de 15 cm no ar.
  const pivoPeca = new THREE.Group()
  pivoPeca.visible = false
  // estacionado sobre a bancada e nao na origem do grupo — ver a nota do
  // realce em bar/estacao.js: a origem local daqui e o (0,0,0) do mundo
  pivoPeca.position.set(est.planta.copo.x, est.alturaBancada + 0.30, est.planta.copo.z)
  vivo.add(pivoPeca)
  const cachePeca = new Map()
  let pecaAtual = null

  /** Altura da peca (medida uma vez, guardada na propria peca). */
  function alturaDe(o) {
    if (o.userData.alturaBar === undefined) {
      _caixa.setFromObject(o)
      o.userData.alturaBar = Math.max(0.02, _caixa.max.y - _caixa.min.y)
    }
    return o.userData.alturaBar
  }

  /**
   * @param naBase true poe o PIVO NA BASE da peca, e nao na boca.
   *
   * A diferenca importa e nao e cosmetica: garrafa despeja pelo GARGALO (a
   * boca, la em cima) e fruta espremida pinga por BAIXO. Com o pivo no lugar
   * errado, o fio de limao nasce quinze centimetros acima da fruta.
   */
  function porPecaNaMao(chave, fabrica, naBase) {
    tirarPecaDaMao()
    let p = cachePeca.get(chave)
    if (!p) {
      try { p = fabrica() } catch (err) { void err; p = null }
      if (!p) return null
      p.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
      cachePeca.set(chave, p)
    }
    p.position.y = naBase ? 0 : -alturaDe(p)
    p.scale.set(1, 1, 1)
    pivoPeca.add(p)
    pivoPeca.visible = true
    pecaAtual = p
    return p
  }

  function tirarPecaDaMao() {
    if (pecaAtual && pecaAtual.parent) pecaAtual.parent.remove(pecaAtual)
    pecaAtual = null
    pivoPeca.visible = false
    pivoPeca.rotation.set(0, 0, 0)
  }

  // Os dois fios de liquido: um pra despejar sobre o copo, outro pra devolver o
  // que estava na coqueteleira ou no liquidificador. Os dois ficam guardados em
  // cima da bancada enquanto nao ha despejo — ver `parada` em bar/jorro.js.
  const PARADA = new THREE.Vector3(est.planta.copo.x, est.alturaBancada + 0.10, est.planta.copo.z)
  const jorroDose = criarJorro({ raio: 0.0032, velocidade: 2.4, parada: PARADA })
  vivo.add(jorroDose.grupo)
  const jorroVolta = criarJorro({ raio: 0.0060, velocidade: 2.0, parada: PARADA })
  vivo.add(jorroVolta.grupo)

  // =========================================================================
  // ESTADO DO MODO
  // =========================================================================

  let ativo = false
  let foco = 'bancada'
  let panX = 0
  let panUltimo = -999
  let olhando = 0                 // segundos insistindo pra cima ou pra baixo
  let gesto = null
  let hover = null
  let apertado = false
  let mouseX = 0, mouseY = 0      // pixels na tela
  let ndcX = 0, ndcY = 0
  let dxPix = 0, dyPix = 0
  let camera = null
  let cena = null                 // camera-cena
  let jogo = null
  let somJorro = null
  let somMotor = null
  let frutaNaMao = null
  let aoServir = null             // callback de quem hospeda (o cassino)
  let aoSair = null
  let ultimoResultado = null

  // =========================================================================
  // O PONTEIRO
  // =========================================================================

  function tela() {
    const dom = jogo && jogo.renderer && jogo.renderer.domElement
    if (!dom) return { x: 0, y: 0, w: 1, h: 1 }
    const r = dom.getBoundingClientRect()
    return { x: r.left, y: r.top, w: Math.max(1, r.width), h: Math.max(1, r.height) }
  }

  function onMove(ev) {
    if (!ativo) return
    const t = tela()
    const nx = ev.clientX - t.x
    const ny = ev.clientY - t.y
    dxPix += nx - mouseX
    dyPix += ny - mouseY
    mouseX = nx
    mouseY = ny
    ndcX = (mouseX / t.w) * 2 - 1
    ndcY = (mouseY / t.h) * 2 - 1
  }

  /**
   * O CLIQUE, E ELE MORA NA FASE DE CAPTURA — as duas coisas na mesma funcao,
   * e nao podia ser de outro jeito.
   *
   * Ver o cabecalho: main.js tem um listener de clique no canvas que PEDE O
   * PONTEIRO DE VOLTA, e o modo precisa do ponteiro solto. A unica forma de
   * impedir aquilo sem editar main.js e escutar em CAPTURA no window (que roda
   * antes de qualquer coisa no caminho ate o canvas) e parar a propagacao.
   *
   * A PRIMEIRA VERSAO ERAM DUAS FUNCOES: uma de captura so pra `stopPropagation`
   * e outra, no borbulho do window, pra tratar o clique. Nao funciona, e o
   * defeito e silencioso: `stopPropagation()` na captura impede o evento de
   * seguir o caminho — inclusive ate o BORBULHO DO PROPRIO WINDOW. Ou seja, a
   * funcao de captura desligava a funcao de tratamento. Nenhum clique do bar
   * chegava, e nao havia erro nenhum no console; foi a foto que denunciou.
   *
   * Parar aqui tambem tira o clique de `core/input.js` (que escuta no
   * document) e do revolver (que escuta no window), o que e exatamente o que se
   * quer: dentro do modo o clique pertence a bancada e a mais ninguem.
   */
  function onDown(ev) {
    if (!ativo) return
    ev.stopPropagation()
    if (ev.button === 2) { ev.preventDefault(); voltarParaBancada(); return }
    if (ev.button !== 0) return
    apertado = true
    clicou()
  }

  function onUp(ev) {
    if (!ativo) return
    ev.stopPropagation()
    if (ev.button !== 0) return
    apertado = false
    soltou()
  }

  function onMenu(ev) { if (ativo) ev.preventDefault() }

  /** O `click` (que vem depois do mouseup) e o que main.js escuta no canvas. */
  function onClique(ev) { if (ativo) ev.stopPropagation() }

  function ouvir(v) {
    if (typeof window === 'undefined') return
    if (v) {
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('mouseup', onUp, true)
      window.addEventListener('click', onClique, true)
      window.addEventListener('contextmenu', onMenu)
    } else {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('mouseup', onUp, true)
      window.removeEventListener('click', onClique, true)
      window.removeEventListener('contextmenu', onMenu)
    }
  }

  // =========================================================================
  // O ALVO NA MIRA
  // =========================================================================

  // O alvo do proprio copo NAO esta na lista da estacao: ele anda. Ele nasce
  // aqui e a posicao dele e reescrita todo quadro.
  const alvoCopo = {
    id: 'copo-mesa', tipo: 'copo-mesa', rotulo: 'Servir o drink',
    dado: null, foco: 'copo', raio: 0.06,
    pos: new THREE.Vector3(),
  }

  function acharAlvo() {
    if (!camera) return null
    const t = tela()
    const tipos = TIPOS_POR_FOCO[foco] || []
    let melhor = null
    let melhorD = 118            // px: o raio de tolerancia do ponteiro
    const lista = est.alvos
    for (let i = -1; i < lista.length; i++) {
      const a = i < 0 ? alvoCopo : lista[i]
      if (tipos.indexOf(a.tipo) < 0) continue
      _v.copy(a.pos)
      const dist = _v.distanceTo(camera.position)
      if (dist > 4.6) continue
      _v.project(camera)
      if (_v.z > 1) continue                     // atras da lente
      const px = (_v.x * 0.5 + 0.5) * t.w
      const py = (-_v.y * 0.5 + 0.5) * t.h
      if (px < -60 || py < -60 || px > t.w + 60 || py > t.h + 60) continue
      const d = Math.hypot(px - mouseX, py - mouseY)
      // empate desempata pelo mais PERTO da lente: numa prateleira de quatro
      // andares os alvos se sobrepoem na tela, e o da frente e o que se quer
      const pontos = d + dist * 6
      if (d < melhorD * 1.35 && (!melhor || pontos < melhor.pontos)) {
        melhor = { alvo: a, px, py, pontos, d }
      }
    }
    if (melhor && melhor.d > melhorD) return null
    return melhor
  }

  // =========================================================================
  // A CAMERA
  // =========================================================================

  function limitesPan() {
    if (foco === 'parede') return [17.4, 23.2]
    if (foco === 'bancada') return [17.6, 23.0]
    return null
  }

  /** Manda a lente pro enquadramento `id`, com o pan aplicado se houver. */
  function enquadrar(id, tempo) {
    const f = est.focos[id]
    if (!f || !cena) return
    const lim = limitesPan()
    let dx = 0
    if (lim) dx = panX - f.alvo.x
    _v.copy(f.pos).setX(f.pos.x + dx)
    _v2.copy(f.alvo).setX(f.alvo.x + dx)
    cena.entrar({
      pos: _v,
      alvo: alvoDaCena(_v, _v2, _v3),
      fov: f.fov,
      tempo: tempo === undefined ? 0.62 : tempo,
      paralaxe: f.paralaxe,
    })
    panUltimo = panX
  }

  function irPara(id, tempo) {
    if (foco === id) return
    foco = id
    olhando = 0
    const lim = limitesPan()
    if (lim) {
      const f = est.focos[id]
      panX = clamp(f ? f.alvo.x : panX, lim[0], lim[1])
    }
    panUltimo = -999
    enquadrar(id, tempo)
    if (ui) ui.setEstacao(nomeDoFoco(id))
    atualizarDica()
  }

  function nomeDoFoco(id) {
    switch (id) {
      case 'bancada': return 'Bancada'
      case 'parede': return 'Parede de bebidas'
      case 'fruteira': return 'Fruteira'
      case 'copo': return 'O copo'
      case 'gelo': return 'Poco de gelo'
      case 'tabua': return 'Tabua de corte'
      case 'chope': return 'Chopeira'
      case 'coqueteleira': return 'Coqueteleira'
      case 'liquidificador': return 'Liquidificador'
      case 'guarnicoes': return 'Guarnicoes'
      case 'pistola': return 'Refrigerante'
      default: return 'Bancada'
    }
  }

  function voltarParaBancada() {
    if (gesto) encerrarGesto()
    if (foco === 'bancada') return
    irPara('bancada', 0.5)
  }

  // =========================================================================
  // OS GESTOS
  // =========================================================================

  function encerrarGesto() {
    if (!gesto) return
    if (gesto.tipo === 'dose') fecharDose()
    else if (gesto.tipo === 'chope') fecharChope()
    else if (gesto.tipo === 'chacoalho') fecharChacoalho(false)
    else if (gesto.tipo === 'liquidificar') fecharLiquidificar(false)
    else if (gesto.tipo === 'corte') fecharCorte()
    gesto = null
    marca.visible = false
    atualizarDica()
  }

  // --- 1. DOSAR -----------------------------------------------------------

  /**
   * @param origem 'garrafa' | 'fruta' | 'refri'
   */
  function abrirDose(idIngrediente, origem, chaveModelo, fabrica) {
    const ing = ingredienteDe(idIngrediente)
    if (!ing) return
    const de = foco
    encerrarGesto()
    porPecaNaMao(chaveModelo, fabrica, origem === 'fruta')
    // A MARCA vai UMA dose acima do que ja tem — a nao ser que o pedido do
    // cliente diga outra coisa (quem escreve isso e quem hospeda o modo).
    const alvoDoses = dosesPedidas(idIngrediente)
    gesto = {
      tipo: 'dose', ing: idIngrediente, origem,
      vira: 0, doses: 0, alvoDoses, derramou: false,
      // O VOLUME ALVO E ABSOLUTO E CONGELADO AQUI. Recalcular a marca a cada
      // quadro a partir do que ja tem no copo faria ela FUGIR na frente do
      // liquido — o alvo subiria junto com o nivel e nunca seria alcancado.
      volumeAlvo: volumeAtual() + alvoDoses * DOSE,
      // pra onde o [Q] volta: quem pegou uma garrafa quer pegar OUTRA depois, e
      // fazer o jogador subir pela bancada de novo a cada dose seria burocracia
      voltaPara: (de === 'parede' || de === 'fruteira' || de === 'pistola') ? de : 'bancada',
    }
    irPara('copo', 0.5)
    porMarca(gesto.volumeAlvo)
    jorroDose.setCor(ing.cor)
    atualizarDica()
  }

  /** Quanto a receita pedida quer deste ingrediente (1 dose se nao ha pedido). */
  let receitaPedida = null
  function dosesPedidas(id) {
    if (!receitaPedida) return 1
    const p = receitaPedida.partes.find((x) => x[0] === id)
    if (!p) return 1
    const jaTem = preparo.partes.find((x) => x.id === id)
    return Math.max(0.25, p[1] - (jaTem ? jaTem.doses : 0))
  }

  /** Poe o anel na altura em que `litros` de liquido chegam neste copo. */
  function porMarca(litros) {
    const f = copo.forma
    if (!f) { marca.visible = false; return }
    const frac = clamp(litros / capacidade(), 0, 1)
    const util = f.alt - 0.004 - f.fundo
    marca.position.y = f.fundo + util * frac
    marca.scale.setScalar((f.raioBoca + 0.0012) / 0.036)
    marca.visible = true
  }

  function fecharDose() {
    if (!gesto || gesto.tipo !== 'dose') return
    if (gesto.doses > 0.02) {
      // a PRECISAO deste gesto: 1 em cima da marca, 0 fora da tolerancia
      const erro = Math.abs(gesto.doses - gesto.alvoDoses)
      precisoes.push(clamp(1 - erro / TOL_DOSE, 0, 1))
      preparo.precisao = precisoes.reduce((a, b) => a + b, 0) / precisoes.length
      if (erro < 0.10) {
        Som.acerto(true)
        flutuarNoCopo('DOSE CERTA', null, 0x8ce07a, 1.4)
      }
    }
    tirarPecaDaMao()
    jorroDose.fechar()
    if (somJorro) { somJorro.parar(); somJorro = null }
  }

  function passoDose(d) {
    const g = gesto
    const ing = ingredienteDe(g.ing)
    // a garrafa vira segurando e endireita soltando
    g.vira = clamp(g.vira + (apertado ? 1 : -1) * VIRA_DOSE * d, 0, 1)
    pivoPeca.rotation.z = -g.vira * ANG_DESPEJO * (g.origem === 'refri' ? 0.35 : 1)
    pivoPeca.rotation.x = g.vira * 0.20

    // o pivo fica logo acima da boca do copo
    bocaLocal(_v)
    pivoPeca.position.set(_v.x + 0.045, _v.y + 0.075, _v.z - 0.010)

    const saindo = g.vira > LIMIAR_DESPEJO
    if (saindo) {
      superficieLocal(_v2)
      jorroDose.apontar(pivoPeca.position, _v2)
      jorroDose.abrir()
      if (!somJorro) somJorro = Som.jorro(0.5)
      if (somJorro) somJorro.setVazao(0.35 + 0.4 * g.vira)
      const q = VAZAO_DOSE * d * (0.55 + 0.45 * g.vira)
      const coube = acrescentar(g.ing, q)
      g.doses += coube
      if (coube < q * 0.6) {
        // NAO COUBE: transbordou. So conta uma vez por gesto — derramar por
        // segurar dois segundos a mais nao pode custar oito notas.
        if (!g.derramou) {
          g.derramou = true
          preparo.derramou += 1
          flutuarNoCopo('TRANSBORDOU', null, 0xff6a4a, 1.6)
          Som.acerto(false)
        }
        jorroDose.setDerramando(true)
      }
    } else {
      jorroDose.fechar()
      jorroDose.setDerramando(false)
      if (somJorro) somJorro.setVazao(0)
    }
    void ing
  }

  // --- 2. TIRAR CHOPE -----------------------------------------------------

  function abrirChope(indice) {
    const tor = est.torneiras[indice]
    if (!tor) return
    encerrarGesto()
    gesto = { tipo: 'chope', tor, indice, ing: tor.ingrediente, espuma: 0.5, litros: 0 }
    // o copo VAI ate a torneira e sobe: a boca dele tem que ficar logo abaixo
    // do bico, senao o jorro cai de 25 cm e a leitura e de agua de mangueira
    const p = est.pontos.chope[indice]
    const alt = copo.forma ? copo.forma.alt : 0.12
    const yBico = est.alturaBancada + 0.24 + 0.0915
    copo.alvo.set(p.x, clamp(yBico - 0.052 - alt, est.alturaBancada, yBico), p.z)
    irPara('chope', 0.5)
    atualizarDica()
  }

  function fecharChope() {
    if (!gesto || gesto.tipo !== 'chope') return
    gesto.tor.fechar()
    gesto.tor.cortar(false)
    if (somJorro) { somJorro.parar(); somJorro = null }
    copo.alvo.set(est.planta.copo.x, est.alturaBancada, est.planta.copo.z)
    copo.inclinaAlvo = 0
    if (gesto.litros > 0.02) {
      // QUALIDADE DO COLARINHO: dois dedos e o certo. Espuma de menos e chope
      // servido errado; de mais e meio copo de ar.
      precisoes.push(clamp(1 - Math.abs(espumaAtual - 0.34) / 0.45, 0, 1))
      preparo.precisao = precisoes.reduce((a, b) => a + b, 0) / precisoes.length
    }
  }

  function passoChope(d) {
    const g = gesto
    // o mouse pro lado INCLINA o copo. 0,62 rad = 35 graus, que e a inclinacao
    // com que se tira chope de verdade.
    copo.inclinaAlvo = clamp(ndcX, -1, 1) * 0.62
    if (apertado) g.tor.abrir()
    else g.tor.fechar()

    const jorrando = g.tor.jorrando
    g.tor.cortar(jorrando)
    if (jorrando) {
      if (!somJorro) somJorro = Som.jorro(0.8)
      if (somJorro) somJorro.setVazao(0.85)
      const litros = VAZAO_CHOPE * d
      const doses = litros / DOSE
      const coube = acrescentar(g.ing, doses)
      g.litros += coube * DOSE
      // O COLARINHO. Copo em pe faz espuma; copo inclinado escorre pela parede
      // e quase nao faz. A media corre devagar (2,2/s) pra o jogador poder
      // CORRIGIR o angulo no meio do gesto.
      const alvoEsp = 0.10 + 0.72 * (1 - Math.abs(copo.inclina) / 0.62)
      espumaAtual = damp(espumaAtual, alvoEsp, 2.2, d)
      repintar()
      if (coube < doses * 0.6 && !g.derramou) {
        g.derramou = true
        preparo.derramou += 1
        flutuarNoCopo('TRANSBORDOU', null, 0xff6a4a, 1.6)
      }
    } else if (somJorro) {
      somJorro.setVazao(0)
    }
  }

  // --- 3. CHACOALHAR ------------------------------------------------------

  function abrirChacoalho() {
    encerrarGesto()
    const vol = volumeAtual()
    if (vol < 0.008) {
      aviso('Poe alguma coisa no copo antes de bater.')
      return
    }
    // O CONTEUDO PASSA PRO METAL. E o gesto de verdade: quem bate um drink
    // despeja o copo na coqueteleira, tampa, bate e devolve coado.
    gesto = {
      tipo: 'chacoalho', energia: 0, volume: vol, gelo: preparo.gelo,
      sinal: 0, fase: 'enchendo', t: 0, chacoalhadas: 0,
    }
    copo.nivel = 0
    pintarCopo()
    // O GELO SAI DO COPO E VAI PRO METAL. Ele nao volta: um drink batido e
    // COADO, e a pedra fica na coqueteleira. `preparo.gelo` continua valendo
    // pra nota — o gelo entrou na receita, ele so nao esta mais no copo.
    dadosPedra.length = 0
    pedras.count = 0
    pedrasMiolo.count = 0
    est.coqueteleira.setGelo(Math.min(7, preparo.gelo))
    est.coqueteleira.mostrarAnel(true)
    est.coqueteleira.setAnel(0, 'neutro')
    est.coqueteleira.tampar(true)
    Som.metal(1)
    irPara('coqueteleira', 0.5)
    atualizarDica()
  }

  function passoChacoalho(d) {
    const g = gesto
    g.t += d
    if (g.fase === 'enchendo') {
      // meio segundo de tampar antes de o gesto valer: sem essa pausa, o
      // movimento do mouse que levou o ponteiro ate aqui ja contava energia
      if (g.t > 0.45) g.fase = 'batendo'
      return
    }
    if (g.fase === 'devolvendo') { passoDevolver(d, g); return }

    // A CONTA DO CHACOALHO: cada INVERSAO DE SENTIDO vertical conta. Contar
    // distancia percorrida deixaria o jogador rodar o mouse em circulo; contar
    // inversao obriga o vaivem, que e o gesto de verdade.
    const s = dyPix > CHACOALHO_MIN_PX ? 1 : (dyPix < -CHACOALHO_MIN_PX ? -1 : 0)
    if (s !== 0) {
      if (g.sinal !== 0 && s !== g.sinal) {
        g.energia += CHACOALHO_PASSO
        g.chacoalhadas++
        if (g.chacoalhadas % 2 === 0) Som.gelo(4, 0.8 + Math.min(0.5, g.energia * 0.4))
      }
      g.sinal = s
    }
    est.coqueteleira.setBalanco(clamp(dxPix / 26, -1, 1), clamp(dyPix / 26, -1, 1))
    est.coqueteleira.setCondensacao(Math.min(1, g.energia * 1.1))
    const estado = g.energia > CHACOALHO_BOM[1] ? 'demais'
      : (g.energia >= CHACOALHO_BOM[0] ? 'bom' : 'neutro')
    est.coqueteleira.setAnel(g.energia, estado)
  }

  function fecharChacoalho(devolver) {
    if (!gesto || gesto.tipo !== 'chacoalho') return
    const g = gesto
    est.coqueteleira.mostrarAnel(false)
    est.coqueteleira.setBalanco(0, 0)
    est.coqueteleira.tampar(false)
    est.coqueteleira.setGelo(0)
    preparo.agitacao = g.energia
    preparo.metodo = 'batido'
    // O LIQUIDO SEMPRE VOLTA PRO COPO, inclusive quando o gesto foi
    // interrompido (Esc, sair da bancada). Perder um drink montado porque o
    // jogador saiu no meio da batida seria punicao sem aviso — o que muda com
    // `devolver` e so a festa: o som e o texto flutuante.
    espumaAtual = Math.min(0.22, espumaAtual)
    copo.nivel = clamp(volumeAtual() / capacidade(), 0, 1)
    pintarCopo()
    if (devolver !== false) {
      const bom = g.energia >= CHACOALHO_BOM[0] && g.energia <= CHACOALHO_BOM[1]
      Som.acerto(bom)
      flutuarNoCopo(bom ? 'NO PONTO' : (g.energia < CHACOALHO_BOM[0] ? 'BATEU POUCO' : 'AGUOU'),
        null, bom ? 0x8ce07a : 0xffc24a, 1.5)
    }
    Som.rolha()
  }

  // --- 4. LIQUIDIFICADOR --------------------------------------------------

  function abrirLiquidificar() {
    encerrarGesto()
    const vol = volumeAtual()
    if (vol < 0.008) {
      aviso('Poe fruta e gelo no copo antes de bater.')
      return
    }
    gesto = { tipo: 'liquidificar', progresso: 0, t: 0, fase: 'enchendo', cliques: 0 }
    copo.nivel = 0
    pintarCopo()
    dadosPedra.length = 0
    pedras.count = 0
    pedrasMiolo.count = 0
    est.liquidificador.setConteudo(clamp(vol / 0.9, 0.12, 0.85), misturar(preparo.partes),
      Math.min(10, 3 + preparo.gelo))
    est.liquidificador.setProgresso(0)
    est.liquidificador.tampar(true)
    if (!somMotor) somMotor = Som.motor()
    Som.metal(0.7)
    irPara('liquidificador', 0.5)
    atualizarDica()
  }

  function passoLiquidificar(d) {
    const g = gesto
    g.t += d
    if (g.fase === 'enchendo') {
      if (g.t > 0.40) g.fase = 'batendo'
      return
    }
    if (g.fase === 'devolvendo') { passoDevolver(d, g); return }
    // SEGURAR tambem funciona, e de proposito e mais LENTO que martelar: o
    // pedido foi "martelar o botao (clicar rapido) ou segurar", e as duas
    // coisas nao podem valer igual — senao ninguem martela.
    if (apertado) {
      g.progresso += BATIDA_SEGURA * d
      est.liquidificador.acionar(0.55)
    }
    est.liquidificador.setProgresso(Math.min(1, g.progresso))
    if (somMotor) somMotor.setRotacao(est.liquidificador.rotacao)
  }

  function fecharLiquidificar(devolver) {
    if (!gesto || gesto.tipo !== 'liquidificar') return
    const g = gesto
    est.liquidificador.tampar(false)
    if (somMotor) { somMotor.parar(); somMotor = null }
    preparo.metodo = 'liquidificado'
    preparo.agitacao = clamp(g.progresso, 0, 1.2)
    // mesma regra da coqueteleira: o conteudo sempre volta pro copo
    espumaAtual = 0
    copo.nivel = clamp(volumeAtual() / capacidade(), 0, 1)
    pintarCopo()
    est.liquidificador.setConteudo(0, misturar(preparo.partes), 0)
    if (devolver !== false) {
      const bom = g.progresso >= 0.92
      Som.acerto(bom)
      flutuarNoCopo(bom ? 'CREMOSO' : 'FALTOU BATER', null, bom ? 0x8ce07a : 0xffc24a, 1.5)
    }
  }

  /** A volta do liquido pro copo, comum a coqueteleira e ao liquidificador. */
  function passoDevolver(d, g) {
    g.tDev = (g.tDev || 0) + d
    const de = g.tipo === 'chacoalho'
      ? _v.set(est.pontos.coqueteleira.x, est.alturaBancada + 0.26, est.pontos.coqueteleira.z)
      : _v.set(est.pontos.liquidificador.x, est.alturaBancada + 0.38, est.pontos.liquidificador.z + 0.10)
    superficieLocal(_v2)
    jorroVolta.apontar(de, _v2)
    jorroVolta.setCor(misturar(preparo.partes))
    jorroVolta.abrir()
    if (!somJorro) somJorro = Som.jorro(0.7)
    const k = clamp(g.tDev / 1.1, 0, 1)
    copo.nivel = clamp((volumeAtual() / capacidade()) * k, 0, 1)
    pintarCopo()
    if (g.tDev > 1.25) {
      jorroVolta.fechar()
      if (somJorro) { somJorro.parar(); somJorro = null }
      if (g.tipo === 'chacoalho') fecharChacoalho(true)
      else fecharLiquidificar(true)
      gesto = null
      irPara('copo', 0.45)
      atualizarDica()
    }
  }

  // --- 5. CORTAR FRUTA ----------------------------------------------------

  function abrirCorte(idFruta) {
    const f = frutaDe(idFruta)
    if (!f) { aviso('Escolha uma fruta na fruteira primeiro.'); return }
    encerrarGesto()
    const rodelas = (f.bar && f.bar.rodelas) || 4
    gesto = { tipo: 'corte', fruta: idFruta, feitas: 0, total: rodelas, arrasto: 0, sinal: 0 }
    porPecaNaMao('inteira:' + idFruta, () => f.build())
    if (pecaAtual) pecaAtual.position.y = 0            // na tabua ela fica DE PE
    pivoPeca.position.set(est.pontos.tabua.x, est.pontos.tabua.y - YB, est.pontos.tabua.z)
    pivoPeca.rotation.set(0, 0, 0)
    irPara('tabua', 0.5)
    atualizarDica()
  }

  function passoCorte(d) {
    const g = gesto
    void d
    if (!apertado) { g.arrasto = 0; return }
    g.arrasto += Math.abs(dxPix)
    if (g.arrasto < CORTE_PX) return
    g.arrasto = 0
    g.feitas++
    Som.corte()
    const f = frutaDe(g.fruta)
    const guarn = f && f.bar ? f.bar.guarnicao : null
    if (guarn) repor(guarn, 1)
    // a fruta ENCOLHE a cada rodela: e a unica leitura de progresso que nao
    // precisa de barra nenhuma
    if (pecaAtual) {
      const k = 1 - (g.feitas / g.total) * 0.62
      pecaAtual.scale.set(1, k, 1)
    }
    // a rodela cai pro lado da tabua
    const gg = guarnicaoDaFruta(g.fruta)
    if (gg) {
      gg.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
      gg.position.set(
        est.pontos.tabua.x - 0.13 + (g.feitas % 3) * 0.035,
        est.pontos.tabua.y - YB,
        est.pontos.tabua.z - 0.06 + (g.feitas % 2) * 0.05,
      )
      gg.rotation.set(-Math.PI / 2, 0, g.feitas * 0.7)
      vivo.add(gg)
      if (!gesto.rodelas) gesto.rodelas = []
      gesto.rodelas.push(gg)
    }
    if (g.feitas >= g.total) {
      const nome = guarn ? (guarnicaoDe(guarn) || {}).nome : 'guarnicoes'
      aviso((nome || 'Guarnicoes') + ': ' + estoqueDe(guarn) + ' no porta-guarnicoes.')
      Som.acerto(true)
      fecharCorte()
      gesto = null
      irPara('bancada', 0.55)
    }
  }

  function fecharCorte() {
    if (!gesto || gesto.tipo !== 'corte') return
    if (gesto.rodelas) {
      for (const r of gesto.rodelas) if (r.parent) r.parent.remove(r)
    }
    if (pecaAtual) pecaAtual.scale.set(1, 1, 1)
    tirarPecaDaMao()
    frutaNaMao = null
  }

  // --- 6. GELO ------------------------------------------------------------

  const pinca = est.pinca
  let animPinca = null

  function pegarGelo() {
    if (preparo.gelo >= N_PEDRA) { aviso('O copo ja esta cheio de gelo.'); return }
    if (animPinca) return
    animPinca = { t: 0, fase: 'pegando' }
    Som.gelo(2, 0.7)
  }

  function passoPinca(d) {
    const a = animPinca
    a.t += d
    const pGelo = est.pontos.gelo
    const alvoY = est.alturaBancada
    if (a.fase === 'pegando') {
      const k = clamp(a.t / 0.34, 0, 1)
      pinca.position.set(
        pGelo.x, alvoY + 0.16 - k * 0.16 + Math.sin(k * Math.PI) * 0.06, pGelo.z,
      )
      pinca.userData.setAbertura(1 - k)
      if (k >= 1) { a.fase = 'levando'; a.t = 0 }
      return
    }
    if (a.fase === 'levando') {
      const k = clamp(a.t / 0.50, 0, 1)
      bocaLocal(_v)
      pinca.position.set(
        pGelo.x + (_v.x - pGelo.x) * k,
        alvoY + 0.10 + Math.sin(k * Math.PI) * 0.14 + (_v.y + 0.09 - alvoY - 0.10) * k,
        pGelo.z + (_v.z - pGelo.z) * k,
      )
      if (k >= 1) {
        soltarPedra()
        pinca.userData.setAbertura(1)
        a.fase = 'voltando'
        a.t = 0
      }
      return
    }
    const k = clamp(a.t / 0.36, 0, 1)
    bocaLocal(_v)
    pinca.position.set(
      _v.x + (pGelo.x + 0.26 - _v.x) * k,
      _v.y + 0.09 + (alvoY + 0.01 - _v.y - 0.09) * k,
      _v.z + (pGelo.z - 0.06 - _v.z) * k,
    )
    pinca.userData.setAbertura(1 - k * 0.7)
    if (k >= 1) {
      pinca.position.set(pGelo.x + 0.26, alvoY + 0.01, pGelo.z - 0.06)
      pinca.userData.setAbertura(0)
      animPinca = null
    }
  }

  /**
   * A PEDRA CAI E SE ACOMODA. Nao ha fisica: ha uma queda com gravidade, um
   * PULINHO de 30% e um pouso. O pedido dizia isso com todas as letras ("nao
   * precisa de fisica de verdade — um empilhamento com um pulinho ja vende"), e
   * e verdade: o que o olho le como peso e a quebra da velocidade no impacto.
   */
  function soltarPedra() {
    if (dadosPedra.length >= N_PEDRA) return
    const f = copo.forma || { alt: 0.12, fundo: 0.012, raioBoca: 0.034 }
    const i = dadosPedra.length
    const camada = Math.floor(i / 3)
    const a = i * 2.399
    const r = (f.raioBoca - 0.013) * (camada === 0 ? 0.55 : 0.72)
    dadosPedra.push({
      x: Math.cos(a) * r, z: Math.sin(a) * r,
      y: f.alt + 0.06,
      alvoY: f.fundo + 0.011 + camada * 0.019,
      vy: 0, quiques: 0,
      rot: new THREE.Euler(a * 0.8, a, a * 0.4),
      esc: 0.82 + (i % 3) * 0.06,
      parada: false,
    })
    preparo.gelo++
    pedras.count = dadosPedra.length
    pedrasMiolo.count = dadosPedra.length
    Som.tinido(0.5)
    if (ui) ui.setPreparo(fichas())
  }

  function passoPedras(d) {
    let mexeu = false
    for (let i = 0; i < dadosPedra.length; i++) {
      const p = dadosPedra[i]
      if (!p.parada) {
        mexeu = true
        p.vy -= 9.8 * d
        p.y += p.vy * d
        if (p.y <= p.alvoY) {
          p.y = p.alvoY
          if (p.quiques < 2 && p.vy < -0.25) {
            p.vy = -p.vy * 0.30
            p.quiques++
            if (p.quiques === 1) Som.tinido(0.30)
          } else {
            p.vy = 0
            p.parada = true
          }
        }
      }
      _ePedra.copy(p.rot)
      _qPedra.setFromEuler(_ePedra)
      _sPedra.setScalar(p.esc)
      _mPedra.compose(_v.set(p.x, p.y, p.z), _qPedra, _sPedra)
      pedras.setMatrixAt(i, _mPedra)
      _sPedra.setScalar(p.esc * 0.5)
      _mPedra.compose(_v, _qPedra, _sPedra)
      pedrasMiolo.setMatrixAt(i, _mPedra)
    }
    if (mexeu || pedras.count !== dadosPedra.length) {
      pedras.instanceMatrix.needsUpdate = true
      pedrasMiolo.instanceMatrix.needsUpdate = true
    }
  }

  // --- 7. GUARNECER -------------------------------------------------------

  function porGuarnicao(id) {
    if (preparo.guarnicoes.indexOf(id) >= 0) { aviso('Ja tem essa no copo.'); return }
    if (preparo.guarnicoes.length >= 3) { aviso('O copo ja esta cheio de enfeite.'); return }
    if (!gastarGuarnicao(id)) {
      aviso('Acabou. Corte mais fruta na tabua.')
      return
    }
    const g = guarnicaoDe(id)
    let peca = null
    if (id === 'canudo') peca = canudoUt(0xe84a6a)
    else if (id === 'sombrinha') peca = sombrinha()
    else if (g) peca = guarnicaoDaFruta(g.de)
    if (!peca) return
    peca.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })

    const f = copo.forma || { alt: 0.12, raioBoca: 0.034 }
    // CADA UMA ENCAIXA DE UM JEITO, e e o encaixe que faz a peca parecer posta
    // em vez de colada: rodela na borda em pe, cereja mergulhada, canudo em pe
    // e torto, sombrinha espetada na diagonal.
    if (id === 'canudo') {
      peca.position.set(f.raioBoca * 0.35, f.alt - 0.055, 0.004)
      peca.rotation.set(0.24, 0.6, 0.18)
    } else if (id === 'sombrinha') {
      peca.position.set(-f.raioBoca * 0.42, f.alt - 0.030, 0.008)
      peca.rotation.set(-0.55, 0.8, 0.30)
    } else if (id === 'cereja') {
      peca.position.set(f.raioBoca * 0.30, f.alt - 0.010, -0.006)
      peca.rotation.set(0.35, 1.1, 0.22)
    } else if (id === 'folha-hortela') {
      peca.position.set(-f.raioBoca * 0.30, f.alt - 0.020, 0.010)
      peca.rotation.set(-0.30, 0.5, 0.42)
      peca.scale.setScalar(0.7)
    } else {
      // rodela ou fatia: encostada na borda, virada pra frente
      peca.position.set(f.raioBoca * 0.86, f.alt - 0.008, 0)
      peca.rotation.set(0, 0.28, -0.30)
    }
    guarnG.add(peca)
    preparo.guarnicoes.push(id)
    Som.tinido(0.35)
    flutuarNoCopo('+ ' + ((g && g.nome) || id), null, 0xffd27a, 1.2)
  }

  // =========================================================================
  // SERVIR E DESPEJAR
  // =========================================================================

  function servir() {
    if (volumeAtual() < 0.012) { aviso('O copo esta vazio.'); return null }
    if (gesto) encerrarGesto()
    preparo.copo = copo.id
    const r = avaliar(preparo)
    ultimoResultado = r
    const val = valorDe(r)
    const cor = r.nota >= 82 ? 0x8ce07a : (r.nota >= 55 ? 0xffd27a : 0xff8a5a)
    flutuarNoCopo(String(r.nota), r.nome + ' — ' + comentarioDe(r.nota), cor, 2.6)
    Som.acerto(r.nota >= 55)
    if (aoServir) {
      try {
        aoServir({
          resultado: r, valor: val, preparo: { partes: preparo.partes.slice(), gelo: preparo.gelo,
            metodo: preparo.metodo, guarnicoes: preparo.guarnicoes.slice(), copo: preparo.copo },
          nivel: copo.nivel, cor: copo.cor, espuma: espumaAtual, copoId: copo.id,
        })
      } catch (err) { void err }
    }
    zerarPreparo(false)
    return r
  }

  function despejar() {
    if (gesto) encerrarGesto()
    const tinha = volumeAtual() > 0.005
    zerarPreparo(false)
    Som.tinido(0.6)
    aviso(tinha ? 'Copo lavado. Recomeca.' : 'O copo ja estava limpo.')
  }

  // =========================================================================
  // AVISOS E ROTULOS
  // =========================================================================

  function aviso(txt) {
    if (jogo && jogo.toast) jogo.toast(txt)
  }

  /** Texto flutuando SOBRE o copo — a nota, o "dose certa", o "transbordou". */
  function flutuarNoCopo(texto, sub, cor, dur) {
    if (!ui || !camera || !texto) return
    const t = tela()
    bocaLocal(_v)
    _v.y += YB + 0.10
    _v.project(camera)
    ui.flutuar(texto, sub, (_v.x * 0.5 + 0.5) * t.w, (-_v.y * 0.5 + 0.5) * t.h, cor, dur)
  }

  function atualizarDica() {
    if (!ui) return
    if (gesto) {
      switch (gesto.tipo) {
        case 'dose': ui.setDica('SEGURE o botao pra virar a garrafa — pare no anel  ·  [Q] volta'); return
        case 'chope': ui.setDica('SEGURE pra abrir  ·  mouse pros lados INCLINA o copo  ·  [Q] volta'); return
        case 'chacoalho': ui.setDica('CHACOALHE o mouse pra cima e pra baixo  ·  [Espaco] serve o batido'); return
        case 'liquidificar': ui.setDica('MARTELE o botao  ·  [Espaco] despeja no copo'); return
        case 'corte': ui.setDica('ARRASTE o mouse por cima da fruta pra cortar  ·  [Q] volta'); return
        default: break
      }
    }
    if (foco === 'bancada') {
      ui.setDica('olhe pra CIMA e va pra parede de bebidas  ·  [F] servir  ·  [R] lavar  ·  [Esc] sair')
      return
    }
    if (foco === 'parede') { ui.setDica('clique numa garrafa  ·  olhe pra BAIXO e volta pra bancada'); return }
    if (foco === 'fruteira') { ui.setDica('clique pra espremer  ·  [T] leva pra tabua  ·  [Q] volta'); return }
    ui.setDica('[Q] volta pra bancada  ·  [F] servir  ·  [Esc] sair')
  }

  // =========================================================================
  // O CLIQUE
  // =========================================================================

  function clicou() {
    // no meio de um gesto, o clique pertence ao gesto
    if (gesto) {
      if (gesto.tipo === 'liquidificar' && gesto.fase === 'batendo') {
        gesto.progresso += BATIDA_CLIQUE
        gesto.cliques++
        est.liquidificador.acionar(1)
        if (!somMotor) somMotor = Som.motor()
        return
      }
      if (gesto.tipo === 'chacoalho' || gesto.tipo === 'corte' || gesto.tipo === 'chope') return
      if (gesto.tipo === 'dose') return
    }
    const h = hover
    if (!h) return
    const a = h.alvo
    switch (a.tipo) {
      case 'garrafa':
        abrirDose(a.dado.ing, 'garrafa', 'garrafa:' + a.dado.ing,
          () => est.garrafaDe(a.dado.ing))
        break
      case 'fruta': {
        const f = frutaDe(a.dado.id)
        frutaNaMao = a.dado.id
        if (f && f.bar && f.bar.suco) {
          abrirDose(f.bar.suco, 'fruta', 'fruta:' + a.dado.id, () => f.build())
        } else {
          abrirCorte(a.dado.id)
        }
        break
      }
      case 'refri':
        abrirDose(a.dado.ing, 'refri', 'pistola', () => pistolaDeRefri(null, null))
        break
      case 'chope': abrirChope(a.dado.indice); break
      case 'gelo':
        if (foco !== 'gelo') irPara('gelo', 0.5)
        else pegarGelo()
        break
      case 'tabua':
        if (frutaNaMao) abrirCorte(frutaNaMao)
        else aviso('Escolha uma fruta na fruteira primeiro.')
        break
      case 'coqueteleira': abrirChacoalho(); break
      case 'liquidificador': abrirLiquidificar(); break
      case 'guarnicao':
        if (foco !== 'guarnicoes') irPara('guarnicoes', 0.5)
        else porGuarnicao(a.dado.id)
        break
      case 'copo':
        if (volumeAtual() > 0.005) { aviso('Sirva ou lave o copo antes de trocar.'); break }
        preparo.copo = a.dado.id
        trocarCopo(a.dado.id)
        Som.tinido(0.6)
        aviso(a.rotulo + ' na bancada.')
        break
      case 'copo-mesa':
        if (foco !== 'copo' && foco !== 'bancada') irPara('copo', 0.5)
        else servir()
        break
      case 'pia': despejar(); break
      default: break
    }
  }

  function soltou() {
    if (!gesto) return
    if (gesto.tipo === 'dose') {
      // soltar so ENDIREITA a garrafa; o gesto continua ate o jogador sair
      return
    }
  }

  // =========================================================================
  // TECLADO (lido do input do jogo, que continua funcionando com o mouse solto)
  // =========================================================================

  function teclas() {
    const inp = jogo && jogo.input
    if (!inp) return
    if (inp.wasPressed('Escape')) { sair(); return }
    if (inp.wasPressed('KeyQ') || inp.wasPressed('Backspace')) {
      if (gesto && (gesto.tipo === 'chacoalho' || gesto.tipo === 'liquidificar')) {
        // sair no meio da batida DEVOLVE o conteudo: perder o drink por apertar
        // a tecla errada seria punicao sem aviso
        if (gesto.fase === 'batendo') { gesto.fase = 'devolvendo'; return }
      }
      if (gesto && gesto.tipo === 'dose') {
        const volta = gesto.voltaPara || 'bancada'
        encerrarGesto()
        gesto = null
        irPara(volta, 0.5)
        return
      }
      voltarParaBancada()
      return
    }
    if (inp.wasPressed('Space')) {
      if (gesto && gesto.tipo === 'chacoalho' && gesto.fase === 'batendo') { gesto.fase = 'devolvendo'; return }
      if (gesto && gesto.tipo === 'liquidificar' && gesto.fase === 'batendo') { gesto.fase = 'devolvendo'; return }
    }
    if (inp.wasPressed('KeyF')) { servir(); return }
    if (inp.wasPressed('KeyR')) { despejar(); return }
    if (inp.wasPressed('KeyT') && frutaNaMao) { abrirCorte(frutaNaMao); return }
  }

  // =========================================================================
  // ENTRAR E SAIR
  // =========================================================================

  function entrar(gm, cameraCena, opts2) {
    if (ativo) return false
    jogo = gm
    camera = gm.camera
    cena = cameraCena
    aoServir = (opts2 && opts2.aoServir) || null
    aoSair = (opts2 && opts2.aoSair) || null
    receitaPedida = (opts2 && opts2.receita) || null
    ativo = true

    // o ponteiro sai da prisao — e o modo passa a escutar o mouse sozinho
    if (gm.input && gm.input.exitLock) gm.input.exitLock()

    // A TELA TEM QUE ESTAR VAZIA ANTES DA LENTE VIAJAR. Tudo que o jogador
    // podia estar segurando e desenhado COLADO NA CAMERA, e a pose sai da
    // matriz do QUADRO ANTERIOR (main.js atualiza mao, copo e revolver antes
    // dos moduleUpdates, e a camera da cena so escreve depois). Com a lente
    // andando pela bancada, um copo ou um cano de revolver preso na lente
    // aparece gigante e tremendo no meio da imagem.
    //
    // O MODO DE ENCAIXE tambem sai, e por outra razao: ele divide as teclas
    // [Q] e [R] com o bar (la elas giram o movel fantasma), e duas coisas
    // ouvindo a mesma tecla e bug garantido.
    if (gm.copo && gm.copo.largar) gm.copo.largar()
    if (gm.mao && gm.mao.largar) gm.mao.largar()
    if (gm.revolver && gm.revolver.equipado && gm.revolver.desequipar) gm.revolver.desequipar()
    if (gm.encaixe && gm.encaixe.ativo && gm.encaixe.sair) gm.encaixe.sair()

    // A TELA DO JOGO SOME TAMBEM, e isso nao e estetica: TRES coisas do HUD
    // nascem exatamente onde a faixa da bancada desenha — a barra de itens, o
    // painel de ajuda do Tab e o cartao de missao —, e o "Camera 1a pessoa"
    // com o contador de FPS ficam por cima da parede de bebidas. Foi o que a
    // foto do modo rodando mostrou: a bancada inteira atras de dois paineis de
    // texto. setJogando(false) apaga status, barra, ajuda, mira, prompt e o
    // botao do microfone de uma vez, e MANTEM os toasts — que sao o unico canal
    // por onde este modo avisa o que fez.
    //
    // O cartao de missao precisa de uma linha propria porque ele mora em
    // ui/tutorial.js e nao dentro do HUD. Devolver com mostrar(true) na saida e
    // seguro: o proprio tutorial soma 'fim' e 'vazio' na conta dele, entao
    // pedir true sem objetivo na fila continua deixando o cartao apagado.
    if (gm.hud && gm.hud.setJogando) gm.hud.setJogando(false)
    if (gm.tutorial && gm.tutorial.mostrar) gm.tutorial.mostrar(false)

    const t = tela()
    mouseX = t.w / 2
    mouseY = t.h / 2
    ndcX = 0; ndcY = 0
    dxPix = 0; dyPix = 0
    ouvir(true)

    if (!copo.id) trocarCopo(preparo.copo)
    copo.alvo.set(est.planta.copo.x, est.alturaBancada, est.planta.copo.z)
    foco = ''
    irPara('bancada', 0.85)
    if (ui) { ui.mostrar(true); ui.setEstacao('Bancada') }
    repintar()
    return true
  }

  function sair() {
    if (!ativo) return false
    encerrarGesto()
    ativo = false
    ouvir(false)
    if (somJorro) { somJorro.parar(); somJorro = null }
    if (somMotor) { somMotor.parar(); somMotor = null }
    jorroDose.fechar()
    jorroVolta.fechar()
    est.coqueteleira.mostrarAnel(false)
    est.realce.visible = false
    marca.visible = false
    if (ui) { ui.mostrar(false); ui.setRotulo(null) }
    // O HUD volta (ver o bloco correspondente em entrar). Vem ANTES da viagem
    // de volta da camera de proposito: a lente leva meio segundo pra chegar, e
    // meio segundo de tela vazia no fim de um modo le como travamento.
    if (jogo && jogo.hud && jogo.hud.setJogando) jogo.hud.setJogando(true)
    if (jogo && jogo.tutorial && jogo.tutorial.mostrar) jogo.tutorial.mostrar(true)
    if (cena) cena.sair({ tempo: 0.55 })
    if (jogo && jogo.input && jogo.input.requestLock) jogo.input.requestLock(true)
    const fim = aoSair
    aoSair = null
    if (fim) { try { fim() } catch (err) { void err } }
    return true
  }

  // =========================================================================
  // O QUADRO POR QUADRO
  // =========================================================================

  function atualizar(dt, gm) {
    const d = Math.min(Math.max(dt || 0, 0), 0.05)
    // as pecas vivas do bar continuam animando MESMO fora do modo: a torneira
    // fechando, a espuma assentando e a pinca voltando pro lugar nao podem
    // congelar no meio so porque o jogador saiu da bancada.
    for (let i = 0; i < est.torneiras.length; i++) est.torneiras[i].atualizar(d)
    est.coqueteleira.atualizar(d)
    est.liquidificador.atualizar(d)
    jorroDose.atualizar(d)
    jorroVolta.atualizar(d)
    if (animPinca) passoPinca(d)
    passoPedras(d)

    // o copo persegue a posicao alvo (ele viaja ate a torneira e volta)
    copoG.position.x = damp(copoG.position.x, copo.alvo.x, 9, d)
    copoG.position.y = damp(copoG.position.y, copo.alvo.y, 9, d)
    copoG.position.z = damp(copoG.position.z, copo.alvo.z, 9, d)
    copo.inclina = damp(copo.inclina, copo.inclinaAlvo, 8, d)
    copoG.rotation.z = copo.inclina
    if (copo.peca && copo.peca.userData && copo.peca.userData.animarBebida) {
      copo.peca.userData.animarBebida(d)
    }

    if (!ativo) return
    jogo = gm || jogo
    if (ui) ui.atualizar(d)
    teclas()
    if (!ativo) return                       // o Escape pode ter saido acima

    alvoCopo.pos.set(copoG.position.x, copoG.position.y + YB + 0.06, copoG.position.z)

    // --- o gesto do quadro --------------------------------------------------
    if (gesto) {
      if (gesto.tipo === 'dose') passoDose(d)
      else if (gesto.tipo === 'chope') passoChope(d)
      else if (gesto.tipo === 'chacoalho') passoChacoalho(d)
      else if (gesto.tipo === 'liquidificar') passoLiquidificar(d)
      else if (gesto.tipo === 'corte') passoCorte(d)
    }

    // --- o alvo na mira -----------------------------------------------------
    // No meio de um gesto o ponteiro pertence AO GESTO: apontar uma segunda
    // garrafa enquanto a primeira ainda esta virada sobre o copo so poderia
    // gerar clique ambiguo.
    const achou = gesto ? null : acharAlvo()
    hover = achou
    if (achou) {
      est.realce.visible = true
      est.realce.position.copy(achou.alvo.pos).setY(achou.alvo.pos.y - YB)
      // lookAt do three e em coordenada de MUNDO (ele desconta a rotacao do
      // pai sozinho), entao a camera vai crua — nao convertida como a posicao.
      est.realce.lookAt(camera.position)
      const r = achou.alvo.raio / 0.06
      est.realce.scale.setScalar(r)
      let rotulo = achou.alvo.rotulo
      if (achou.alvo.tipo === 'guarnicao') {
        const n = estoqueDe(achou.alvo.dado.id)
        rotulo += n > 90 ? '' : (' (' + n + ')')
      }
      if (ui) ui.setRotulo(rotulo, achou.px, achou.py)
    } else {
      est.realce.visible = false
      if (ui) ui.setRotulo(null)
    }

    // --- o PAN e a troca de enquadramento por OLHAR -------------------------
    const lim = limitesPan()
    if (lim && !gesto) {
      const fora = Math.abs(ndcX) - PAN_ZONA
      if (fora > 0) {
        panX = clamp(panX + Math.sign(ndcX) * fora * PAN_VEL * d * 2.2, lim[0], lim[1])
      }
      if (Math.abs(panX - panUltimo) > PAN_PASSO) enquadrar(foco, 0.30)

      // OLHAR PRA CIMA leva pra parede de bebidas; pra baixo, de volta. Foi o
      // pedido literal ("olhar/apontar pra parede de bebidas APROXIMA nela"), e
      // a insistencia de 0,3 s existe pra o gesto de mirar uma garrafa alta nao
      // trocar de enquadramento sozinho.
      if (foco === 'bancada' && ndcY < OLHAR_CIMA && !hover) {
        olhando += d
        if (olhando > OLHAR_TEMPO) irPara('parede', 0.6)
      } else if (foco === 'parede' && ndcY > OLHAR_BAIXO && !hover) {
        olhando += d
        if (olhando > OLHAR_TEMPO) irPara('bancada', 0.6)
      } else {
        olhando = 0
      }
    }

    // o delta do ponteiro e consumido no fim do quadro, como o do input do jogo
    dxPix = 0
    dyPix = 0
  }

  // O COPO NASCE NA BANCADA, e nao no primeiro `entrar`. Um bar com a estacao
  // central vazia le como bar fechado, e o jogador que passa por fora do
  // balcao tem que ver o copo esperando.
  trocarCopo(preparo.copo)
  repintar()

  return {
    get ativo() { return ativo },
    get foco() { return foco },
    get preparo() { return preparo },
    get resultado() { return ultimoResultado },
    get copoId() { return copo.id },
    get nivel() { return copo.nivel },
    get cor() { return copo.cor },
    get espuma() { return espumaAtual },
    entrar, sair, atualizar, servir, despejar,
    /** Quem hospeda escreve o pedido do cliente aqui — muda a marca da dose. */
    setReceita(r) { receitaPedida = r || null },
    /** Pro teste e pro console. */
    debug: {
      acrescentar, zerarPreparo, trocarCopo, estoqueDe,
      irPara: (id) => irPara(id, 0.4),
    },
    dispose() {
      sair()
      ouvir(false)
      jorroDose.dispose()
      jorroVolta.dispose()
    },
  }
}

export default criarGestos
