import * as THREE from 'three'
import { tex } from '../world/materials.js'
import { PLAYER, CAMERA, LEVELS } from '../config.js'
import { HIPS_Y } from '../player/character.js'
import {
  DIRIGIR, VEICULOS as VEICULOS_MUNDO, TICK_HZ, ATRASO_INTERP,
  HELI_ID_MIN, HELI_ID_MAX,
} from '../comum/mundo.js'

// ---------------------------------------------------------------------------
// O SISTEMA DE VEICULOS: registro, entrar/sair, fisica comum, camera e HUD.
//
// Divisao de trabalho (VEICULOS.md): os arquivos carro.js / moto.js / skate.js /
// helicoptero.js so entregam GEOMETRIA e dizem qual linha de MUNDO.DIRIGIR usar.
// Quem move, quem colide, quem aponta a camera e quem fala com o servidor e
// este arquivo — e so ele. Assim os quatro veiculos se sentem diferentes por
// causa dos NUMEROS de DIRIGIR, e nao por causa de quatro fisicas diferentes
// escritas por quatro maos diferentes.
//
// Cada modelo exporta:
//   construir() -> { grupo, assento, rodas[], config }
// e pode, opcionalmente, entregar tambem (tudo protegido por typeof/if aqui):
//   grupo.userData.pivoDirecao  o garfo/coluna inteira que esterca (moto)
//   grupo.userData.pivo         pivo na altura do eixo, pra inclinar (skate)
//   grupo.userData.luzesFreio   materiais que acendem no freio
//   grupo.userData.farois       materiais que acendem com o veiculo ligado
//   grupo.userData.rotor        gira em Y (helicoptero)
//   grupo.userData.rotorCauda   gira em X (helicoptero)
//   assento.userData.pose       'sentado' | 'empe'
//   assento.userData.ancora     'pes' | 'quadril' (onde vai a raiz do boneco)
//   atualizar(dt, estado)       gancho por quadro pra animacao propria
//   raio                        raio de colisao, se o modelo quiser mandar nele
//
// Como no anel verde, quem DECIDE e o servidor: entrar e um PEDIDO, e so se
// dirige quando o VEICULO_DONO volta com o meu id. Sem servidor o modulo
// responde a si mesmo pra que o jogo continue jogavel sozinho (ehLocal()).
// ---------------------------------------------------------------------------

// --- numeros que NAO sao de direcao (esses vem todos de MUNDO.DIRIGIR) -------
// Distancia entre eixos de mentira. E o unico numero que transforma "angulo do
// volante" em "quanto o carro gira": com ele o veiculo nao gira parado e gira
// menos quanto mais reto estiver o esterco — o modelo de bicicleta de sempre.
const EIXO = 3.2
// Quanto o esterco fecha com a velocidade (0.62 = a 100% da velMax sobra 38%).
// Sem isto, em alta qualquer toque no A/D vira piao.
const REDUZ_GIRO = 0.62
// Velocidade com que a "agarra" mata a velocidade lateral guardada.
const ABSORVE_LAT = 6.5
// Mergulho no freio / levantada na aceleracao, em radianos por g de mentira.
const MERGULHO = 0.075
// Com que forca o veiculo se realinha com a trajetoria real enquanto derrapa.
// E o que faz a derrapagem TERMINAR sozinha; alto demais, ele endireita tao
// rapido que a derrapagem nunca chega a aparecer na tela.
const DERIVA_ALINHA = 1.3
// Distancia de entrada, somada ao raio do veiculo.
const ALCANCE_ENTRAR = 2.4
// Maior circulo de colisao que um veiculo pode ter (ver medirRaio).
const RAIO_MAX = 1.6
// Segundos esperando o servidor confirmar o entrar antes de desistir calado.
const TEMPO_PEDIDO = 2.0
const PERIODO_POS = 1 / TICK_HZ
// Skate: o pulinho do Espaco.
const PULO_SKATE = 3.4
// Skate: em que trecho do ciclo de empurrada o pe esta VARRENDO o chao. E so
// nesse pedaco que entra velocidade — antes o pe esta descendo, depois esta
// voltando pro deck. E o que separa "empurrar" de "acelerar".
const VARRE_INI = 0.16
const VARRE_FIM = 0.56
const GRAVIDADE = PLAYER.GRAVITY
// Bateu: a velocidade cai pra isto (nao atravessa, nao capota, so para).
const PERDA_BATIDA = 0.18
// Fracao do avanco pedido abaixo da qual consideramos que bateu em algo.
const LIMIAR_BATIDA = 0.55

const TAU = Math.PI * 2

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function damp(cur, tgt, lambda, dt) { return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt)) }
/** Anda `passo` de `cur` na direcao de `tgt`, sem passar do ponto. */
function mover(cur, tgt, passo) {
  const d = tgt - cur
  if (d > passo) return cur + passo
  if (d < -passo) return cur - passo
  return tgt
}

// O Vite resolve isto EM TEMPO DE BUILD e inclui SO os arquivos que existem.
// Um `import './carro.js'` estatico quebraria o build inteiro enquanto o
// arquivo do outro agente nao existisse; assim o veiculo que falta apenas nao
// aparece, e o resto do jogo continua de pe.
const MODULOS = import.meta.glob('./*.js')

export function criarVeiculos({ scene, camera, player, character, collision,
  rede, hud, groundY, interaction }) {

  const chaoEm = typeof groundY === 'function' ? groundY : () => 0
  // Decidido A CADA acao, nunca congelado na criacao: o jogo abre antes de
  // conectar, pode nunca conectar e pode perder a conexao no meio da corrida.
  const ehLocal = () => !rede || typeof rede.entrarVeiculo !== 'function' || !rede.conectado

  function meuId() {
    if (!rede) return 0
    return (typeof rede.meuId === 'function' ? rede.meuId() : rede.meuId) || 0
  }
  function avisar(msg) { if (hud && typeof hud.toast === 'function') hud.toast(msg) }

  const grupo = new THREE.Group()
  grupo.name = 'veiculos'

  // Nada e identificado por indice de array: o registro e um Map por ID.
  const veiculos = new Map()
  let dirigindo = 0            // id do veiculo em que estou (0 = a pe)
  let pedidoId = 0             // id pedido ao servidor, aguardando resposta
  let pedidoT = 0
  let acumPos = 0              // acumulador do envio a 15 Hz
  let tempo = 0
  let conectadoAntes = false
  let modoSalvo = 'third'      // camera do jogador antes de eu assumir
  let proxHeliLocal = HELI_ID_MIN   // so no modo sem servidor
  let heliPedido = null        // { x, y, z } esperando o id do servidor

  // --- teclado e mouse proprios ---------------------------------------------
  // core/input.js nao e meu arquivo, e enquanto dirijo o controller do jogador
  // esta TRAVADO (ele engole e descarta o delta do mouse). Entao o sistema
  // escuta os proprios eventos, do mesmo jeito que o anel escuta o mousedown.
  const teclas = new Set()
  let mouseDx = 0, mouseDy = 0

  function onKeyDown(e) { teclas.add(e.code) }
  function onKeyUp(e) { teclas.delete(e.code) }
  function onBlur() { teclas.clear() }
  function onMouseMove(e) {
    if (typeof document === 'undefined' || !document.pointerLockElement) return
    mouseDx += e.movementX || 0
    mouseDy += e.movementY || 0
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    document.addEventListener('mousemove', onMouseMove)
  }
  const apertado = (code) => teclas.has(code)

  // --- camera ---------------------------------------------------------------
  let camYaw = 0, camPitch = -0.12
  let camDist = 6
  let camPronta = false
  let desdeMouse = 99          // segundos desde a ultima mexida no mouse
  const camAlvo = new THREE.Vector3()
  const camPos = new THREE.Vector3()
  const _desejada = new THREE.Vector3()

  // temporarios: nada de alocar por quadro
  const _ant = new THREE.Vector3()
  const _cx = new THREE.Box3()
  const _tam = new THREE.Vector3()

  // =========================================================================
  // 1. REGISTRO
  // =========================================================================

  /**
   * Mede o veiculo pra tirar dele o raio de colisao. O contrato pede um raio
   * MAIOR que o do jogador; usamos a meia-LARGURA (o modelo aponta pra +Z, o
   * comprimento esta em Z) porque um circulo do tamanho do comprimento nao
   * passaria mais entre dois carros estacionados.
   */
  function medirRaio(g, sugerido) {
    if (Number.isFinite(sugerido) && sugerido > 0) return sugerido
    _cx.setFromObject(g)
    if (!isFinite(_cx.min.x) || _cx.isEmpty()) return PLAYER.RADIUS * 1.6
    _cx.getSize(_tam)
    // O teto existe por causa do rotor: as pas do helicoptero medem 7 m de
    // ponta a ponta e virariam um circulo de colisao que nao passa em rua
    // nenhuma. O circulo representa o CORPO, nao o que fica pra fora dele.
    return clamp(_tam.x * 0.5 + 0.1, PLAYER.RADIUS * 1.5, RAIO_MAX)
  }

  /**
   * Quanto o boneco precisa AFUNDAR pra caber embaixo do teto do veiculo.
   *
   * O contrato do assento e uma marca no espaco, e nao uma promessa de que o
   * personagem cabe ali: a cabeca deste boneco e cartoon (quase 50 cm) e um
   * carro com linha de teto de classico e baixo. Sem isto, o motorista aparece
   * com a cabeca do lado de fora do teto, que e o tipo de coisa que estraga a
   * cena inteira. Entao o sistema mede o teto DE VERDADE, com um raio de cima
   * pra baixo em cima do assento: se acertar alguma coisa acima do assento, ha
   * teto e o boneco desce o tanto que faltar. Moto e skate nao acertam nada e
   * ficam exatamente onde o modelo mandou.
   */
  const _raioTeto = new THREE.Raycaster()
  const _deCima = new THREE.Vector3()
  const _praBaixo = new THREE.Vector3(0, -1, 0)
  const _acertos = []

  function medirAfundar(g, assento, yRaiz) {
    if (!assento) return 0
    g.updateMatrixWorld(true)
    assento.getWorldPosition(_deCima)
    const yAssento = _deCima.y
    _deCima.y += 8
    _raioTeto.set(_deCima, _praBaixo)
    _acertos.length = 0
    _raioTeto.intersectObject(g, true, _acertos)
    let teto = 0
    for (let i = 0; i < _acertos.length; i++) {
      const y = _acertos[i].point.y
      // so conta o que esta ACIMA do assento: o piso e o banco nao sao teto
      if (y > yAssento + 0.25) { teto = y; break }
    }
    if (!teto) return 0
    // topo da cabeca no MESMO espaco do teto: assento + raiz + altura + folga
    const topoDaCabeca = yAssento + yRaiz + PLAYER.HEIGHT + 0.04
    // no maximo 35 cm: se faltar mais que isso o problema e do modelo, e
    // enterrar o motorista no assoalho nao conserta nada
    return clamp(topoDaCabeca - teto, 0, 0.35)
  }

  /** Lista de materiais de luz + o brilho de repouso de cada um. */
  function comLuzBase(lista) {
    const out = []
    if (!Array.isArray(lista)) return out
    for (const mat of lista) {
      if (mat && mat.emissive) out.push({ mat, base: mat.emissiveIntensity || 0 })
    }
    return out
  }

  /** Raio da roda pra saber quanto ela gira por metro andado. */
  function medirRoda(r) {
    if (r.userData && Number.isFinite(r.userData.raio)) return r.userData.raio
    _cx.setFromObject(r)
    if (_cx.isEmpty()) return 0.32
    _cx.getSize(_tam)
    return Math.max(0.08, Math.max(_tam.y, _tam.z) * 0.5)
  }

  /**
   * Poe um veiculo no mundo. `pose` e a pose inicial (a do servidor, ou a de
   * MUNDO.VEICULOS). Devolve o registro ou null se o modelo nao existir.
   */
  function registrar(id, tipo, pose, montado) {
    id = id | 0
    if (!id || veiculos.has(id)) return veiculos.get(id) || null
    const m = montado
    if (!m || !m.grupo) return null

    const chave = (m.config && DIRIGIR[m.config]) ? m.config : (DIRIGIR[tipo] ? tipo : 'carro')
    const cfg = DIRIGIR[chave]

    // Os modelos entregam a lista de rodas em dois formatos: o carro e a moto
    // mandam { mesh, dianteira, raio } (ja sabem quem esterca), o skate manda o
    // Mesh cru. Normalizamos aqui pra que a fisica nao precise saber disso.
    const rodas = []
    if (Array.isArray(m.rodas)) {
      for (const bruta of m.rodas) {
        if (!bruta) continue
        const obj = bruta.isObject3D ? bruta : bruta.mesh
        if (!obj) continue
        // ordem YXZ: primeiro o esterco (Y), depois o giro (X). Na ordem padrao
        // XYZ o esterco entraria DEPOIS do giro e a roda dianteira tombaria pro
        // lado em vez de apontar pra curva.
        obj.rotation.order = 'YXZ'
        const dita = bruta.isObject3D
          ? (obj.userData ? obj.userData.esterca : undefined)
          : bruta.dianteira
        rodas.push({
          obj,
          raio: Number.isFinite(bruta.raio) ? bruta.raio : medirRoda(obj),
          // Quem esterca sao as da frente. Se o modelo nao disser, vale a
          // geometria: a frente do veiculo e +Z.
          esterca: dita !== undefined ? !!dita : obj.position.z > 0.05,
        })
      }
    }

    const ud = m.grupo.userData || {}
    const uda = (m.assento && m.assento.userData) || {}

    // Onde o personagem fica e como ele posa. Dois eixos independentes, porque
    // os modelos sao de maos diferentes e cada um ancorou de um jeito:
    //   pose   'sentado' (carro, moto, heli) ou 'empe' (skate)
    //   ancora onde vai a RAIZ do boneco, que em character.js fica nos PES:
    //          'quadril' = o assento marca o topo do banco (o boneco desce
    //          HIPS_Y, como nos bancos da cidade); 'pes' = o assento ja e o
    //          piso onde ele apoia.
    // Um modelo que declara a propria pose esta dizendo que ancorou nos pes.
    // normaliza como os tipos de evento da rede: 'em-pe', 'em pe' e 'empe' sao
    // a mesma coisa, e nao vale quebrar a pose do skate por causa de um hifen
    const sonorizar = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
    const posePess = sonorizar(uda.pose) || (chave === 'skate' ? 'empe' : 'sentado')
    const ancora = sonorizar(uda.ancora)
      || ((uda.pose || posePess === 'empe') ? 'pes' : 'quadril')

    const v = {
      id, tipo: chave, cfg,
      grupo: m.grupo,
      assento: m.assento || null,
      // Um pivo de direcao (o garfo inteiro da moto) le muito melhor do que so
      // a roda torta, entao ele tem preferencia sobre o esterco roda a roda.
      pivoDirecao: ud.pivoDirecao || m.volante || null,
      // O skate tomba em volta do EIXO das rodas, nao em volta do chao: pra
      // isso ele expoe um pivo na altura do eixo. Sem pivo, tomba o grupo.
      pivoInclina: ud.pivo || null,
      // A CARROCERIA e o corpo do carro SEM as rodas. Existindo ela, o
      // mergulho e a rolagem vao pra ela e nao pro grupo inteiro — ou seja, o
      // carro afunda na frente enquanto as rodas continuam plantadas no chao,
      // que e como PESO se le. Sem ela, tudo inclina junto (moto, heli).
      carroceria: ud.carroceria || null,
      // O volante gira junto com o esterco. Os alvos das maos sao filhos dele,
      // entao as maos do motorista giram junto — de graca.
      volante: ud.volante || null,
      voltaVolante: Number.isFinite(ud.voltaVolante) ? ud.voltaVolante : 2.6,
      // Onde o piloto poe mao e pe, e o quanto ele se inclina. Ver a secao
      // "POSE DO PILOTO" mais abaixo.
      piloto: ud.piloto || null,
      // guardamos o brilho de repouso: acender e voltar tem que cair EXATO no
      // valor que o modelo escolheu, senao a lanterna fica acesa pra sempre
      luzesFreio: comLuzBase(ud.luzesFreio),
      farois: comLuzBase(ud.farois),
      // o helicoptero nao tem roda: o que gira sao os rotores, e quem soma o
      // angulo por quadro e o sistema (o modelo nao anima voo)
      rotor: ud.rotor || null,
      rotorCauda: ud.rotorCauda || null,
      rpm: 0,
      aoAnimar: typeof m.atualizar === 'function' ? m.atualizar : null,
      empe: posePess === 'empe',
      quadrilNoAssento: ancora === 'quadril',
      afundar: 0,
      voa: chave === 'helicoptero',
      impulso: chave === 'skate',
      rodas,
      raio: medirRaio(m.grupo, m.raio),
      dono: 0,
      // estado de movimento
      pos: new THREE.Vector3(pose.x, pose.y, pose.z),
      yaw: pose.yaw || 0,
      vel: 0, velLat: 0, giro: 0,
      rolagem: 0, mergulho: 0, inclFrente: 0,
      vy: 0, noAr: false,
      // Skate: -1 = pe no deck; 0..1 = fase do ciclo de empurrada.
      empurra: -1,
      freando: 0,        // skate: o pe raspando o chao (S), 0..1
      freioMao: false,   // carro: o Espaco
      alturaCorpo: 0,    // afundar da carroceria (peso na suspensao)
      // interpolacao do que e remoto: 100 ms atras, como todo o resto
      buffer: [],
    }
    // depende de quadrilNoAssento, entao so da pra medir com o registro pronto
    v.afundar = medirAfundar(m.grupo, m.assento, v.quadrilNoAssento ? -HIPS_Y : 0)
    v.grupo.rotation.order = 'YXZ'     // Z passa a ser o eixo da FRENTE (rolagem)
    v.grupo.position.copy(v.pos)
    v.grupo.rotation.set(0, v.yaw, 0)
    grupo.add(v.grupo)
    veiculos.set(id, v)
    return v
  }

  /** Carrega o modelo do tipo pedido; se o arquivo nao existir, nao quebra. */
  async function carregar(tipo) {
    const carregador = MODULOS['./' + tipo + '.js']
    if (!carregador) return null
    try {
      const mod = await carregador()
      if (!mod || typeof mod.construir !== 'function') return null
      return mod.construir()
    } catch (err) {
      console.warn('veiculo sem modelo:', tipo, err)
      return null
    }
  }

  // Os tres estacionados nascem com o mundo. Cada um aparece quando o seu
  // arquivo carrega — um que falte nao segura os outros.
  for (const base of VEICULOS_MUNDO) {
    carregar(base.tipo).then((m) => {
      if (!m) return
      registrar(base.id, base.tipo, { x: base.x, y: base.y, z: base.z, yaw: base.yaw }, m)
    })
  }

  // =========================================================================
  // 2. QUEM ESTA PERTO
  // =========================================================================

  const NOME = {
    carro: 'carro', moto: 'moto', skate: 'skate', helicoptero: 'helicoptero',
  }

  /** {id, tipo, dist} do veiculo LIVRE mais perto, ou null. */
  function veiculoPerto(pos) {
    if (!pos || dirigindo) return null
    let melhor = null
    for (const v of veiculos.values()) {
      if (v.dono !== 0) continue                  // ocupado: nem aparece o prompt
      const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > v.raio + ALCANCE_ENTRAR) continue
      // helicoptero no ar nao se entra a pe
      if (v.pos.y - chaoEm(v.pos.x, v.pos.z) > 1.6) continue
      if (!melhor || d < melhor.dist) melhor = { id: v.id, tipo: v.tipo, dist: d }
    }
    return melhor
  }

  // =========================================================================
  // 3. ENTRAR E SAIR
  // =========================================================================

  function entrarSair() {
    if (dirigindo) { sair(); return }
    const perto = veiculoPerto(player.position)
    if (!perto) return
    pedirEntrar(perto.id)
  }

  function pedirEntrar(id) {
    const v = veiculos.get(id | 0)
    if (!v || pedidoId || dirigindo) return
    if (v.dono !== 0) { avisar('Alguem ja esta nesse veiculo.'); return }
    pedidoId = v.id
    pedidoT = 0
    if (ehLocal()) {
      // sem servidor respondo a mim mesmo, pelo MESMO caminho do evento de rede
      const alvo = v.id
      Promise.resolve().then(() => aoEventoDeRede(
        { tipo: 'veiculo-dono', veiculoId: alvo, donoId: -1 }))
      return
    }
    rede.entrarVeiculo(v.id)
  }

  /** O servidor disse que o volante e meu. So aqui o veiculo passa a andar. */
  function assumirVolante(v) {
    if (dirigindo === v.id) return
    dirigindo = v.id
    pedidoId = 0
    v.vel = 0; v.velLat = 0; v.giro = 0; v.vy = 0
    v.buffer.length = 0

    if (player && typeof player.setLocked === 'function') player.setLocked(true)
    // 1a pessoa esconde o corpo: dentro do veiculo o que se quer ver e ele
    if (player && player.mode) { modoSalvo = player.mode; player.setMode('third') }

    // o personagem vai pro assento. O root fica nos PES; sentado, o quadril e
    // que tem que pousar no assento, entao ele desce HIPS_Y.
    if (v.assento && character && character.root) {
      v.assento.add(character.root)
      character.root.position.set(0, v.empe ? 0 : -HIPS_Y, 0)
      character.root.rotation.set(0, 0, 0)
    }

    // a camera comeca ja atras dele, sem varrer a cidade toda no primeiro frame
    camYaw = v.yaw + Math.PI
    camPitch = -0.12
    camDist = v.cfg.distCam
    camPronta = false
    desdeMouse = 99
    acumPos = 0
    enviarPose(v)
    avisar('Entrou no ' + (NOME[v.tipo] || v.tipo) + '. E para sair.')
  }

  /**
   * Solta o jogador ao lado do veiculo, em chao livre. Roda tanto no E quanto
   * quando o servidor tira o veiculo de mim (queda de conexao, por exemplo).
   */
  function largarVolante(v, avisarServidor) {
    if (!v || dirigindo !== v.id) return
    dirigindo = 0
    if (avisarServidor && !ehLocal() && typeof rede.sairVeiculo === 'function') {
      rede.sairVeiculo(v.id)
    }

    if (character && character.root) {
      // volta o personagem pra cena ANTES de teleportar: se ele continuasse
      // filho do assento, position/rotation seriam locais ao veiculo
      if (character.root.parent && character.root.parent !== scene) {
        character.root.parent.remove(character.root)
      }
      if (!character.root.parent) scene.add(character.root)
    }

    const p = chaoLivreAoLado(v)
    if (player && typeof player.teleport === 'function') {
      // olhando pro veiculo: e o enquadramento que faz sentido ao descer
      player.teleport(p.x, p.z, Math.atan2(v.pos.x - p.x, v.pos.z - p.z) + Math.PI)
    }
    if (player && typeof player.setLocked === 'function') player.setLocked(false)
    if (player && player.setMode && modoSalvo) player.setMode(modoSalvo)
    if (hud && typeof hud.setPrompt === 'function') hud.setPrompt(null)

    // Zerar a inclinacao TAMBEM, e nao so a velocidade. A rolagem e o mergulho
    // sao amortecidos em aplicarPose(), que roda apenas para o veiculo que EU
    // dirijo — largar a moto no meio de uma curva deixava ela deitada para
    // sempre, porque ninguem mais amortecia aquele valor de volta a zero.
    v.vel = 0; v.velLat = 0; v.giro = 0
    v.rolagem = 0; v.mergulho = 0; v.inclFrente = 0
    v.freioMao = false; v.empurra = -1; v.freando = 0; v.alturaCorpo = 0
    if (v.pivoInclina) v.pivoInclina.rotation.z = 0
    if (v.carroceria) { v.carroceria.rotation.set(0, 0, 0); v.carroceria.position.y = 0 }
    if (v.volante) v.volante.rotation.z = 0
    v.grupo.rotation.set(0, v.yaw, 0)
  }

  function sair() {
    const v = veiculos.get(dirigindo)
    if (!v) { dirigindo = 0; return }
    if (ehLocal()) {
      const alvo = v.id
      Promise.resolve().then(() => aoEventoDeRede(
        { tipo: 'veiculo-dono', veiculoId: alvo, donoId: 0 }))
      largarVolante(v, false)
      return
    }
    // com servidor tambem largo na hora: quem confirma o dono livre e ele, mas
    // deixar o jogador preso no banco esperando um pacote seria pior.
    largarVolante(v, true)
  }

  /** Da a volta no veiculo procurando chao livre pra pousar o jogador. */
  function chaoLivreAoLado(v) {
    const d = v.raio + PLAYER.RADIUS + 0.35
    const chaoV = chaoEm(v.pos.x, v.pos.z)
    // comeca pela esquerda do veiculo (a "porta") e vai dando a volta
    for (let i = 0; i < 12; i++) {
      const a = v.yaw + Math.PI / 2 + (i % 2 ? -1 : 1) * Math.floor((i + 1) / 2) * (TAU / 12)
      const x = v.pos.x + Math.sin(a) * d
      const z = v.pos.z + Math.cos(a) * d
      if (collision && typeof collision.isFree === 'function'
        && !collision.isFree(x, z, PLAYER.RADIUS)) continue
      if (Math.abs(chaoEm(x, z) - chaoV) > LEVELS.STEP_MAX) continue
      return { x, z }
    }
    return { x: v.pos.x, z: v.pos.z }     // cercado: pelo menos nao some
  }

  // =========================================================================
  // 4. FISICA
  // =========================================================================

  // Vontade "de ninguem": o veiculo parado ou o de outro jogador, cujas teclas
  // nao chegam aqui. Constante pra nao alocar um objeto por veiculo por quadro.
  const ENTRADA_PARADA = {
    frente: 0, tras: 0, esq: 0, dir: 0, cima: 0, baixo: 0,
  }

  /**
   * Le o teclado e devolve a vontade do jogador. Separado da fisica pra que o
   * helicoptero e o skate possam ler as MESMAS teclas com outro significado.
   */
  function entrada() {
    return {
      frente: apertado('KeyW') ? 1 : 0,
      tras: apertado('KeyS') ? 1 : 0,
      esq: apertado('KeyA') ? 1 : 0,
      dir: apertado('KeyD') ? 1 : 0,
      cima: apertado('Space') ? 1 : 0,
      baixo: apertado('ShiftLeft') || apertado('ShiftRight') ? 1 : 0,
    }
  }

  /** Acelerar / frear / dar re. So mexe em v.vel. */
  function acelerar(v, e, dt) {
    const c = v.cfg
    if (v.impulso) {
      // SKATE: o W nao e acelerador, e o pe empurrando o chao — e empurrar leva
      // TEMPO. Um ciclo inteiro (`ciclo` segundos) e: o pe sai do deck, desce,
      // VARRE pra tras e volta. So o trecho da varredura (VARRE_INI..VARRE_FIM)
      // poe velocidade, e por isso a velocidade do skate sobe em degraus com
      // patamar entre eles, em vez de subir numa rampa como a de um carro.
      //
      // Quanto mais rapido ele ja esta, menos a empurrada rende: e a mesma
      // razao da vida real (o pe nao consegue varrer mais rapido que o chao
      // passa embaixo). E o que faz o skate ter uma velocidade de cruzeiro
      // gostosa em vez de ir sempre ate o teto.
      const ciclo = c.ciclo || 0.85
      if (v.empurra >= 0) {
        v.empurra += dt / ciclo
        if (v.empurra >= 1) v.empurra = (e.frente && !e.tras) ? 0 : -1
      } else if (e.frente && !e.tras && !v.noAr) {
        v.empurra = 0
      }
      if (e.tras && v.empurra >= 0) v.empurra = -1
      if (v.noAr) v.empurra = v.empurra >= 0 ? Math.min(0.99, v.empurra) : -1
      if (v.empurra >= VARRE_INI && v.empurra <= VARRE_FIM) {
        const rende = Math.pow(clamp01(1 - Math.abs(v.vel) / c.velMax), 1.4)
        v.vel += (c.impulso || 2.4) * (0.10 + 0.90 * rende) * dt / (VARRE_FIM - VARRE_INI)
      }
      // S = pe raspando o chao. Freia devagar (e um pe, nao um disco) e a pose
      // mostra o pe de fora do deck. PARADO, o mesmo S da RE: o pe continua no
      // chao, so que empurrando pro outro lado. Nao ha ciclo de empurrada na
      // re — quem anda de skate pra tras vai devagar e continuo, e e assim que
      // se le na tela.
      v.freando = damp(v.freando, e.tras ? 1 : 0, 9, dt)
      if (e.tras) {
        if (v.vel > 0.15) v.vel -= c.freio * dt
        else v.vel -= c.acel * 0.45 * dt
      }
    } else if (e.frente) {
      v.vel += c.acel * dt
    } else if (e.tras) {
      // S freia se estou indo pra frente; parado, da re
      if (v.vel > 0.2) v.vel -= c.freio * dt
      else v.vel -= c.acel * 0.55 * dt
    }
    // atrito: desacelera quando ninguem toca em nada (e sempre, no skate,
    // que rola por inercia com pouco atrito)
    if ((!e.frente || v.impulso) && !e.tras) {
      v.vel = mover(v.vel, 0, c.atrito * dt)
    }
    v.vel = clamp(v.vel, -c.re, c.velMax)
  }

  /** Esterco -> taxa de giro em rad/s. Devolve a taxa pra quem quiser inclinar. */
  function estercar(v, e, dt) {
    const c = v.cfg
    // o esterco DIMINUI com a velocidade, senao em alta o veiculo vira piao
    const fator = 1 - REDUZ_GIRO * clamp01(Math.abs(v.vel) / c.velMax)
    const alvo = (e.esq - e.dir) * c.giroMax * fator
    v.giro = mover(v.giro, alvo, c.giroVel * dt)

    // modelo de bicicleta: parado nao gira, e quanto mais reto menos gira.
    // O teto em giroMax existe pra que um dt gordo (aba em segundo plano) nao
    // rode o veiculo meia volta num quadro so.
    let taxa = Math.tan(v.giro) * v.vel / EIXO
    taxa = clamp(taxa, -c.giroMax, c.giroMax)
    v.yaw += taxa * dt
    if (v.yaw > Math.PI) v.yaw -= TAU; else if (v.yaw < -Math.PI) v.yaw += TAU
    return taxa
  }

  /**
   * Integra a posicao e resolve a colisao. A velocidade lateral e guardada e
   * vai morrendo conforme a "agarra": 1 = sobre trilhos, 0.85 = derrapa um
   * pouco. Bateu -> a velocidade cai forte; nao atravessa e nao capota.
   */
  function andar(v, taxa, dt) {
    const c = v.cfg
    // ADERENCIA COM TETO, NAO COEFICIENTE FIXO.
    //
    // Antes toda curva escorregava um tiquinho (velLat += (1-agarra)*...), o
    // que da uma flutuacao constante e nenhuma leitura: nao existia "estou no
    // limite". Agora a curva PEDE uma aceleracao lateral (v x omega) e o pneu
    // segura ate `limite` m/s^2. Abaixo disso o carro anda como se estivesse
    // nos trilhos; passou, so o EXCEDENTE vira escorregada. E por isso que
    // curva lenta gruda, curva rapida sai de lado, e o freio de mao (que
    // derruba o teto) sai de lado na hora.
    const pedida = taxa * v.vel
    const teto = (c.limite || 60) * (v.freioMao ? 0.28 : 1)
    const sobra = Math.abs(pedida) - teto
    if (sobra > 0) v.velLat += Math.sign(pedida) * sobra * dt
    // o pneu tambem morde de volta: quanto maior a agarra, mais rapido a
    // velocidade lateral guardada morre (o freio de mao segura ela viva)
    v.velLat *= Math.exp(-(v.freioMao ? 0.9 : c.agarra * ABSORVE_LAT) * dt)
    if (Math.abs(v.velLat) < 0.005) v.velLat = 0

    // ALINHAMENTO: escorregando, o carro roda em direcao a trajetoria real —
    // e o que faz a derrapagem TERMINAR sozinha em vez de virar piao, e o que
    // da aquele rabinho saindo e voltando na saida da curva.
    if (v.velLat !== 0 && Math.abs(v.vel) > 0.5) {
      const deriva = Math.atan2(v.velLat, Math.abs(v.vel) + 0.6)
      v.yaw -= deriva * DERIVA_ALINHA * Math.sign(v.vel) * dt
    }

    // Eixos: frente = +Z girado por yaw. De pe olhando pra +Z com +Y pra cima,
    // a DIREITA e -X (mao direita), por isso o sinal invertido no lateral.
    // Consequencia: yaw CRESCENDO e curva pra ESQUERDA, e e por isso que o A
    // (esquerda) manda esterco positivo la em cima.
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw)
    const rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw)
    _ant.copy(v.pos)
    v.pos.x += (fx * v.vel + rx * v.velLat) * dt
    v.pos.z += (fz * v.vel + rz * v.velLat) * dt

    if (collision && typeof collision.resolve === 'function') {
      collision.resolve(v.pos, v.raio)
    }
    // Degrau alto demais nao se escala: o veiculo sobe o meio-fio (0.16) como o
    // jogador, mas nao sobe a parede de um predio.
    const chaoNovo = chaoEm(v.pos.x, v.pos.z)
    if (!v.noAr && chaoNovo - chaoEm(_ant.x, _ant.z) > LEVELS.STEP_MAX) {
      v.pos.x = _ant.x; v.pos.z = _ant.z
    }

    // Bateu? Compara o que andou de verdade com o que pediu. Um circulo empurrado
    // por collision.resolve anda muito menos do que a velocidade mandava.
    const pediu = Math.hypot(v.vel, v.velLat) * dt
    const andou = Math.hypot(v.pos.x - _ant.x, v.pos.z - _ant.z)
    if (pediu > 0.02 && andou < pediu * LIMIAR_BATIDA) {
      v.vel *= PERDA_BATIDA
      v.velLat *= PERDA_BATIDA
    }
  }

  /** Chao: sobe o meio-fio suave, igual ao jogador. */
  function assentarNoChao(v, dt) {
    const chao = chaoEm(v.pos.x, v.pos.z)
    if (v.noAr) {
      v.vy -= GRAVIDADE * dt
      v.pos.y += v.vy * dt
      if (v.pos.y <= chao) { v.pos.y = chao; v.vy = 0; v.noAr = false }
    } else {
      v.pos.y = damp(v.pos.y, chao, 14, dt)
      if (Math.abs(v.pos.y - chao) < 0.003) v.pos.y = chao
    }
  }

  /** Fisica do helicoptero: a INCLINACAO e que o faz andar. */
  function voar(v, e, dt) {
    const c = v.cfg
    // W/S inclinam pra frente/tras; a inclinacao vira aceleracao
    const alvoInc = (e.frente - e.tras) * c.inclina
    v.inclFrente = mover(v.inclFrente, alvoInc, c.giroVel * dt)
    if (Math.abs(v.inclFrente) > 1e-4) {
      v.vel += (v.inclFrente / c.inclina) * c.acel * dt
    }
    v.vel = mover(v.vel, 0, c.atrito * dt)          // inercia: nao para de uma vez
    v.vel = clamp(v.vel, -c.re, c.velMax)

    // A/D giram no proprio eixo (nao e curva de carro: helicoptero roda parado)
    const alvoGiro = (e.esq - e.dir) * c.giroMax
    v.giro = mover(v.giro, alvoGiro, c.giroVel * dt)
    v.yaw += v.giro * dt
    if (v.yaw > Math.PI) v.yaw -= TAU; else if (v.yaw < -Math.PI) v.yaw += TAU

    // Espaco sobe, Shift desce, com inercia
    const chao = chaoEm(v.pos.x, v.pos.z)
    const alvoVy = (e.cima - e.baixo) * c.subida
    v.vy = damp(v.vy, alvoVy, 2.6, dt)
    v.pos.y += v.vy * dt
    if (v.pos.y > c.tetoY) { v.pos.y = c.tetoY; if (v.vy > 0) v.vy = 0 }
    if (v.pos.y < chao) {
      v.pos.y = chao
      if (v.vy < 0) v.vy = 0
      v.vel = mover(v.vel, 0, c.freio * dt)         // pousado nao desliza
    }

    // XZ: sem derrapagem (agarra 1), e so no ar e que ele avanca de verdade
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw)
    _ant.copy(v.pos)
    v.pos.x += fx * v.vel * dt
    v.pos.z += fz * v.vel * dt
    // colide so rente ao chao: la em cima ele passa por cima de tudo
    if (v.pos.y - chao < 2.2 && collision && typeof collision.resolve === 'function') {
      collision.resolve(v.pos, v.raio)
      const pediu = Math.abs(v.vel) * dt
      const andou = Math.hypot(v.pos.x - _ant.x, v.pos.z - _ant.z)
      if (pediu > 0.02 && andou < pediu * LIMIAR_BATIDA) v.vel *= PERDA_BATIDA
    }
    return v.giro
  }

  // =========================================================================
  // 5. VISUAL: rodas, inclinacao, personagem
  // =========================================================================

  function animarRodas(v, dt) {
    // Se o modelo tem um pivo de direcao, quem esterca e ELE (na moto o garfo,
    // o guidao, o farol e a roda giram juntos — e isso que le como "pilotada").
    // Nesse caso a roda dianteira nao pode estercar tambem: seria em dobro.
    const noPivo = !!v.pivoDirecao
    if (noPivo) v.pivoDirecao.rotation.y = v.giro
    // O volante gira MAIS que as rodas (relacao de direcao). O eixo e o Z
    // local do pivo que o modelo entregou — ele ja vem inclinado com a coluna.
    if (v.volante) v.volante.rotation.z = -v.giro * v.voltaVolante
    for (let i = 0; i < v.rodas.length; i++) {
      const r = v.rodas[i]
      // SINAL: com o eixo da roda em X e a frente em +Z, rolar pra frente e
      // rotation.x CRESCENDO (o ponto de cima vai pra +Z e o de baixo, que
      // toca o chao, vai pra tras). Estava negativo e as rodas giravam ao
      // contrario — invisivel num pneu liso, obvio numa roda de cinco raios.
      r.obj.rotation.x += (v.vel * dt) / r.raio
      if (r.esterca) r.obj.rotation.y = noPivo ? 0 : v.giro
    }
  }

  /**
   * Rotores. Sobem e descem de rotacao devagar (uma turbina nao liga nem para
   * de um quadro pro outro) e continuam girando pra quem so assiste.
   */
  function animarRotores(v, dt, ligado) {
    if (!v.rotor && !v.rotorCauda) return
    v.rpm = damp(v.rpm, ligado ? 1 : 0, 0.9, dt)
    if (v.rpm < 0.002) { v.rpm = 0; return }
    const w = v.rpm * 26                 // rad/s do rotor principal
    if (v.rotor) v.rotor.rotation.y += w * dt
    if (v.rotorCauda) v.rotorCauda.rotation.x += w * 2.4 * dt
  }

  /** Lanterna de freio e farol: acendem quando o motorista faz o que acende. */
  function animarLuzes(v, e, dt) {
    const freando = !!e.tras || v.freioMao || (v.vel < -0.2)
    for (let i = 0; i < v.luzesFreio.length; i++) {
      const l = v.luzesFreio[i]
      l.mat.emissiveIntensity = damp(l.mat.emissiveIntensity,
        freando ? l.base + 2.2 : l.base, 14, dt)
    }
    for (let i = 0; i < v.farois.length; i++) {
      const l = v.farois[i]
      l.mat.emissiveIntensity = damp(l.mat.emissiveIntensity,
        v.dono !== 0 ? l.base + 1.3 : l.base, 6, dt)
    }
  }

  function aplicarPose(v, taxa, acelReal, dt) {
    const c = v.cfg
    // rolagem: o corpo rola PRA DENTRO da curva. Como a ordem e YXZ, o Z e o
    // eixo da frente, entao rotation.z e a inclinacao de verdade.
    const forca = clamp(taxa / c.giroMax, -1, 1) * clamp01(Math.abs(v.vel) / (c.velMax * 0.45))
    let alvoRol = v.voa ? -clamp(taxa / c.giroMax, -1, 1) * c.inclina : -forca * c.inclina
    // Escorregando, o carro rola MAIS: a carroceria vai pro lado de fora da
    // curva junto com a derrapagem. E a leitura visual de "perdeu aderencia".
    if (!v.voa && v.velLat) alvoRol += clamp(v.velLat * 0.05, -0.09, 0.09)
    v.rolagem = damp(v.rolagem, alvoRol, 7, dt)
    // mergulho no freio, levantada na aceleracao
    let alvoMerg = v.voa ? v.inclFrente : clamp(-acelReal / c.acel, -1, 1) * MERGULHO
    // No ar o skate faz o gesto do ollie: sobe de bico levantado e desce de
    // bico baixo. E o mesmo numero que o resto usa (vy), so lido como pose.
    if (v.impulso && v.noAr) alvoMerg = -clamp(v.vy * 0.055, -0.22, 0.22)
    v.mergulho = damp(v.mergulho, alvoMerg, v.impulso && v.noAr ? 14 : 8, dt)

    // A TREPIDACAO DO SKATE SAIU.
    //
    // Ela existia pra o deck nao parecer flutuando: um chacoalho de meio grau
    // na frequencia da rodinha no asfalto. Na tela virou outra coisa — o dono
    // viu como "ele ta tremendo, meio como se estivesse bugado", e com razao:
    // o boneco e filho do deck, entao o chacoalho subia pela perna inteira e o
    // corpo todo vibrava. O que faz o skate ler como skate e a EMPURRADA e o
    // giro das rodas, nao o ruido. Se um dia voltar, tem que ser aplicado so
    // na geometria do deck, nunca no pivo que carrega o piloto.

    v.grupo.position.copy(v.pos)
    if (v.carroceria) {
      // as rodas ficam no chao; quem mergulha e rola e o CORPO
      v.grupo.rotation.set(0, v.yaw, 0)
      v.carroceria.rotation.set(v.mergulho, 0, v.rolagem)
      // e ele tambem afunda na suspensao quando pesa (freio, curva forte)
      const carga = Math.min(0.05, Math.abs(v.mergulho) * 0.20 + Math.abs(v.rolagem) * 0.18)
      v.alturaCorpo = damp(v.alturaCorpo, -carga, 9, dt)
      v.carroceria.position.y = v.alturaCorpo
    } else if (v.pivoInclina) {
      v.grupo.rotation.set(v.mergulho, v.yaw, 0)
      v.pivoInclina.rotation.z = v.rolagem
    } else {
      v.grupo.rotation.set(v.mergulho, v.yaw, v.rolagem)
    }
  }

  /**
   * Prende o personagem no assento. Roda DEPOIS de player.update(dt), que
   * escreve character.root.position/rotation todo quadro — se rodasse antes,
   * o controller desfaria tudo e o boneco ficaria na rua atras do carro.
   */
  function prenderNoAssento(v, dt) {
    if (!character || !character.root) return
    if (v.assento && character.root.parent !== v.assento) {
      v.assento.add(character.root)
    }
    character.root.visible = true
    const baixo = (v.quadrilNoAssento ? -HIPS_Y : 0) - v.afundar
    character.root.position.set(0, baixo, 0)
    character.root.rotation.set(0, 0, 0)
    // pose: sentado no carro/moto/heli, em pe no skate. O animador recalcula
    // os deltas do zero a cada chamada, entao chamar de novo so troca a pose.
    if (player && player.animator && typeof player.animator.update === 'function') {
      player.animator.update(dt, {
        speed: 0, moving: false, running: false, grounded: true, vy: 0,
        sitting: !v.empe,
      })
    }
    // o piloto inclina junto com a moto: o assento e filho do grupo, entao a
    // rolagem do corpo ja veio de graca. So a cabeca olha pra frente da curva.
    if (typeof character.setHeadLook === 'function') {
      character.setHeadLook(0, clamp(v.giro * 0.8, -0.6, 0.6))
    }
    posarPiloto(v, dt, baixo)
    character.root.updateMatrixWorld(true)
  }

  // =========================================================================
  // 5b. POSE DO PILOTO
  //
  // O animador entrega a pose GENERICA (sentado ou em pe). O que faz alguem
  // parecer que esta PILOTANDO e o que vem depois: o tronco inclinado, as maos
  // no lugar certo do guidao e os pes na pedaleira — e, principalmente, as
  // maos ACOMPANHANDO o guidao quando ele esterca.
  //
  // Por isso a mao nao e uma pose decorada: e IK. O modelo entrega quatro
  // Object3D de destino (grupo.userData.piloto) e aqui o braco e a perna sao
  // resolvidos como corrente de dois ossos. Como os alvos das maos sao filhos
  // do pivo de direcao, girar o guidao arrasta a mao, o cotovelo se dobra
  // sozinho e a moto passa a ser pilotada de verdade.
  //
  // POR QUE ISTO MORA AQUI E NAO NO ANIMADOR: o animador nao sabe (nem pode
  // saber) o que e um guidao. Ele recalcula os deltas do ZERO a cada chamada e
  // escreve as juntas; este bloco roda logo DEPOIS e escreve por cima. Nada
  // acumula entre quadros, porque no quadro seguinte o animador reescreve tudo
  // a partir da pose base de novo.
  // =========================================================================

  const _alvoW = new THREE.Vector3()
  const _paiInv = new THREE.Matrix4()
  const _local = new THREE.Vector3()
  const _u = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _qRoll = new THREE.Quaternion()

  /**
   * Corrente de dois ossos apontando para `alvo` (um Object3D no mundo).
   *
   * Convencao do character.js: todo membro pendura no -Y local, o filho fica
   * em (0, -comprimento, 0) e rotation.x positivo joga pra TRAS. Entao o
   * cotovelo dobra com x negativo (`sinal` = +1) e o joelho com x positivo
   * (`sinal` = -1).
   *
   * `roll` gira a corrente inteira em volta da linha ombro->alvo: e o que
   * decide pra onde aponta o cotovelo (pra fora, no guidao) ou o joelho (pra
   * fora, abracando o tanque) sem tirar a mao do lugar.
   */
  function ikMembro(sup, inf, ponta, alvo, sinal, roll) {
    if (!sup || !inf || !ponta || !alvo || !sup.parent) return
    const L1 = inf.position.length()
    const L2 = ponta.position.length()
    if (!(L1 > 0) || !(L2 > 0)) return

    alvo.getWorldPosition(_alvoW)
    _paiInv.copy(sup.parent.matrixWorld).invert()
    _local.copy(_alvoW).applyMatrix4(_paiInv).sub(sup.position)
    let d = _local.length()
    if (d < 1e-4) return
    // nunca esticar 100%: braco travado no cotovelo le como manequim
    const dMax = (L1 + L2) * 0.985
    const dMin = Math.abs(L1 - L2) + 0.02
    if (d > dMax) { _local.multiplyScalar(dMax / d); d = dMax }
    else if (d < dMin) { _local.multiplyScalar(dMin / d); d = dMin }
    _local.divideScalar(d)          // agora e a direcao unitaria ombro->alvo

    // lei dos cossenos: quanto o cotovelo/joelho tem que dobrar
    const cosG = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)
    const dobra = Math.PI - Math.acos(cosG)
    // onde a ponta cai no espaco do osso de cima, com essa dobra
    _u.set(0, -(L1 + L2 * Math.cos(dobra)), sinal * L2 * Math.sin(dobra)).normalize()

    _q.setFromUnitVectors(_u, _local)
    if (roll) {
      _qRoll.setFromAxisAngle(_local, roll)
      _q.premultiply(_qRoll)
    }
    sup.quaternion.copy(_q)
    inf.rotation.set(-sinal * dobra, 0, 0)
  }

  /** Soma um angulo numa junta (o animador ja escreveu a base neste quadro). */
  function somar(p, rx, ry, rz) {
    if (!p) return
    p.rotation.x += rx || 0
    p.rotation.y += ry || 0
    p.rotation.z += rz || 0
  }

  /**
   * Pose de quem esta dirigindo. Tres familias:
   *   - com `piloto` no modelo (moto, carro): tronco + IK de mao (e de pe)
   *   - skate: pose de skatista, com a empurrada e o pe no freio
   *   - resto: a pose generica do animador basta
   */
  function posarPiloto(v, dt, baixo) {
    const p = character.parts
    if (!p) return

    if (v.impulso) { posarSkatista(v, dt, p, baixo); return }
    const cfg = v.piloto
    if (!cfg) return

    // TRONCO: a inclinacao pra frente e o que separa "sentado num banco" de
    // "pilotando". Ela e dividida entre quadril, torso e peito pra a coluna
    // curvar em vez de dobrar num ponto so; o pescoco desconta pra a cabeca
    // continuar olhando pra frente.
    const inc = cfg.tronco || 0
    // acelerando ele se agacha um tico; freando, joga o corpo pra tras
    const dinamica = clamp(-v.mergulho * 1.6, -0.14, 0.14)
    somar(p.hips, cfg.quadril || 0)
    somar(p.torso, inc * 0.55 + dinamica * 0.5)
    somar(p.chest, inc * 0.45 + dinamica * 0.5)
    somar(p.neck, -inc * 0.75 - dinamica * 0.6)

    // Na curva o piloto de moto joga o corpo pra dentro alem da moto.
    if (cfg.corpoNaCurva && Math.abs(v.rolagem) > 0.001) {
      const extra = clamp(v.rolagem * cfg.corpoNaCurva, -0.16, 0.16)
      somar(p.torso, 0, 0, extra)
      somar(p.hips, 0, 0, -extra * 0.4)
    }

    // as juntas mudaram: as matrizes do mundo (que o IK le) tem que ser
    // refeitas ANTES de resolver mao e pe
    v.grupo.updateMatrixWorld(true)

    // ATENCAO AO LADO. Em character.js o membro 'R' nasce em +X e o 'L' em -X
    // (buildArm(1,'R')), e os modelos entregam maos[0]/pes[0] do lado +X. Casar
    // errado cruza os bracos do boneco no peito — foi o primeiro erro daqui.
    const maos = cfg.maos
    if (maos && maos.length === 2) {
      const co = cfg.cotovelo || 0
      ikMembro(p.armRUpper, p.armRLower, p.handR, maos[0], 1, co)
      ikMembro(p.armLUpper, p.armLLower, p.handL, maos[1], 1, -co)
      // punho fechado no guidao em vez de pendurado
      somar(p.handR, -0.22, 0, 0.18)
      somar(p.handL, -0.22, 0, -0.18)
    }
    const pes = cfg.pes
    if (pes && pes.length === 2) {
      const jo = cfg.joelho || 0
      ikMembro(p.legRUpper, p.legRLower, p.footR, pes[0], -1, jo)
      ikMembro(p.legLUpper, p.legLLower, p.footL, pes[1], -1, -jo)
      // o pe apoia PLANO na pedaleira: desconta o angulo da canela
      p.footR.rotation.x = -p.legRLower.rotation.x * 0.55
      p.footL.rotation.x = -p.legLLower.rotation.x * 0.55
    }
  }

  // --- skate ----------------------------------------------------------------
  //
  // O skatista e o unico que nao "senta": ele fica de lado, de joelhos moles,
  // e a perna de tras SAI DO DECK pra empurrar. Os alvos dos pes sao dois
  // Object3D nossos, pendurados no pivo do skate — assim da pra levar o pe de
  // trupe ate o chao e trazer de volta sem mexer no modelo.

  /** Cria (uma vez) os dois alvos de pe presos ao deck. */
  function alvosDePe(v) {
    if (v.alvoPe) return v.alvoPe
    const pai = v.pivoInclina || v.grupo
    v.alvoPe = [new THREE.Object3D(), new THREE.Object3D()]
    for (const a of v.alvoPe) { a.userData.dynamic = true; pai.add(a) }
    return v.alvoPe
  }

  /** Interpolacao suave entre dois valores, com a curva do smoothstep. */
  function suave(a, b, t) {
    t = clamp01(t)
    return a + (b - a) * t * t * (3 - 2 * t)
  }

  function posarSkatista(v, dt, p, baixo) {
    const alvo = alvosDePe(v)
    const cfg = v.piloto || {}
    // repouso: onde o modelo disse que os pes ficam em cima da lixa
    const rep = cfg.pes && cfg.pes.length === 2 ? cfg.pes : null
    const topo = rep ? rep[0].position.y : 0.07
    const solo = -(v.rodas[0] ? v.rodas[0].raio : 0.028)
    // +X do modelo = pe da FRENTE (nariz do skate); -X = pe de tras, que empurra
    const zFrente = rep ? rep[0].position.z : 0.15
    const zTras = rep ? rep[1].position.z : -0.15

    // o pe da frente nao sai do deck nunca
    alvo[0].position.set(0, topo, zFrente)

    // --- o pe de tras: deck -> chao -> varre -> volta ------------------------
    let agacha = 0.085                 // joelhos sempre moles: skate nao e pose de pe
    const f = v.empurra
    if (v.freando > 0.02 && f < 0) {
      // pe raspando o chao atras: arrasta e treme um pouco
      const w = v.freando
      alvo[1].position.set(
        suave(0, -0.185, w),
        suave(topo, solo, w),
        suave(zTras, -0.30, w) + Math.sin(tempo * 40) * 0.006 * w,
      )
      agacha += 0.085 * w
    } else if (f >= 0) {
      // ATENCAO AO ALCANCE. A perna tem 75 cm do quadril ao tornozelo; com o
      // quadril 80 cm acima do asfalto, um pe mandado 44 cm pra tras fica a
      // 90 cm do quadril e o IK trava a meio caminho — o pe fica PENDURADO no
      // ar e a empurrada nao le. Por isso a varredura e curta (30 cm) e vem
      // junto com um agachamento: e agachando que o pe alcanca o chao, que e
      // exatamente o que um skatista faz.
      let x, y, z
      if (f < VARRE_INI) {                       // sai do deck e desce
        const t = f / VARRE_INI
        x = suave(0, -0.185, t); y = suave(topo, solo, t); z = suave(zTras, 0.04, t)
      } else if (f <= VARRE_FIM) {               // VARRE: e daqui que vem a velocidade
        const t = (f - VARRE_INI) / (VARRE_FIM - VARRE_INI)
        x = -0.185; y = solo; z = suave(0.04, -0.28, t)
      } else {                                   // recolhe pro deck
        const t = (f - VARRE_FIM) / (1 - VARRE_FIM)
        x = suave(-0.185, 0, t); y = suave(solo, topo, t * 1.3); z = suave(-0.28, zTras, t)
      }
      alvo[1].position.set(x, y, z)
      agacha += 0.115 * Math.sin(clamp01(f / 0.85) * Math.PI)
    } else {
      alvo[1].position.set(0, topo, zTras)
    }
    if (v.noAr) agacha += 0.05

    character.root.position.y = baixo - agacha

    // TRONCO: peito virado pro nariz do skate (que fica no +X do boneco) e um
    // tanto pra frente. Sem essa torcao ele anda de lado olhando pra parede.
    somar(p.torso, 0.17, 0.06)
    somar(p.chest, 0.11, 0.30)
    somar(p.neck, -0.22, 0.14)
    // na curva o corpo tomba pra dentro junto com o deck
    somar(p.hips, 0, 0.05, clamp(v.rolagem * 0.5, -0.10, 0.10))

    // BRACOS abertos pra equilibrio, e balancando na empurrada
    const bal = f >= 0 ? Math.sin(f * Math.PI * 2) * 0.55 : 0
    somar(p.armRUpper, -0.30 - bal * 0.5, 0, 0.60)
    somar(p.armLUpper, -0.30 + bal * 0.5, 0, -0.52)
    somar(p.armRLower, -0.55, 0, 0)
    somar(p.armLLower, -0.62, 0, 0)

    v.grupo.updateMatrixWorld(true)

    ikMembro(p.legRUpper, p.legRLower, p.footR, alvo[0], -1, 0.16)
    ikMembro(p.legLUpper, p.legLLower, p.footL, alvo[1], -1, -0.16)
    // pe da frente atravessado no deck (como todo skatista poe), pe de tras
    // acompanhando a canela pra nao ficar de ponta quando raspa o chao
    p.footR.rotation.set(-p.legRLower.rotation.x * 0.5, 0.38, 0)
    p.footL.rotation.set(-p.legLLower.rotation.x * 0.5, 0.08, 0)

    if (typeof character.setHeadLook === 'function') {
      character.setHeadLook(0, 0.45 + clamp(v.giro * 0.4, -0.3, 0.3))
    }
  }

  // =========================================================================
  // 5c. FUMACA DE PNEU
  //
  // Derrapar sem deixar rastro nao le como derrapagem: le como um carro que
  // escorregou de leve. Um punhado de sprites cinzas saindo debaixo da roda
  // traseira e o que transforma a mesma fisica em "eu perdi a traseira".
  //
  // Pool fixo, criado na primeira derrapagem e nunca mais: sprite invisivel
  // nao custa draw call, e alocar particula no meio de uma curva e a receita
  // do engasgo. Elas ficam penduradas no grupo dos veiculos, que esta na cena
  // sem transformacao — entao as posicoes sao as do mundo, direto.
  // =========================================================================
  const FUMACA_N = 20
  let fumaca = null
  let fumIdx = 0

  function fazerFumaca() {
    const mapa = tex('fumaca-pneu', 64, (g, s) => {
      const r = s / 2
      const grd = g.createRadialGradient(r, r, 0, r, r, r)
      grd.addColorStop(0, 'rgba(226,226,230,0.7)')
      grd.addColorStop(0.45, 'rgba(186,186,194,0.3)')
      grd.addColorStop(1, 'rgba(180,180,190,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, s, s)
    })
    const lista = []
    for (let i = 0; i < FUMACA_N; i++) {
      const mat = new THREE.SpriteMaterial({
        map: mapa, transparent: true, depthWrite: false, opacity: 0,
      })
      const sp = new THREE.Sprite(mat)
      sp.visible = false
      sp.userData.dynamic = true
      grupo.add(sp)
      lista.push({ sp, mat, t: 0, dur: 1, vx: 0, vy: 0, vz: 0, esc: 0.3 })
    }
    return lista
  }

  function soltarFumaca(x, y, z, forca) {
    if (!fumaca) fumaca = fazerFumaca()
    const f = fumaca[fumIdx]
    fumIdx = (fumIdx + 1) % FUMACA_N
    f.t = 0
    f.dur = 0.55 + Math.random() * 0.5
    f.esc = 0.26 + forca * 0.34
    f.vx = (Math.random() - 0.5) * 0.9
    f.vz = (Math.random() - 0.5) * 0.9
    f.vy = 0.5 + Math.random() * 0.7
    f.sp.position.set(x, y + 0.03, z)
    f.sp.scale.setScalar(f.esc)
    f.sp.visible = true
    f.mat.opacity = clamp01(0.26 + forca * 0.3)
  }

  function atualizarFumaca(dt) {
    if (!fumaca) return
    for (let i = 0; i < fumaca.length; i++) {
      const f = fumaca[i]
      if (!f.sp.visible) continue
      f.t += dt
      const k = f.t / f.dur
      if (k >= 1) { f.sp.visible = false; f.mat.opacity = 0; continue }
      f.sp.position.x += f.vx * dt
      f.sp.position.y += f.vy * dt
      f.sp.position.z += f.vz * dt
      f.vy *= 1 - 1.4 * dt
      f.sp.scale.setScalar(f.esc * (1 + k * 2.6))
      f.mat.opacity = (1 - k) * (1 - k) * 0.46
    }
  }

  /** Onde as rodas de tras tocam o chao, pra soltar a fumaca no lugar certo. */
  const _rodaW = new THREE.Vector3()
  function fumacaDaDerrapagem(v, dt) {
    if (v.voa || v.impulso) return
    const forca = clamp01((Math.abs(v.velLat) - 1.6) / 5)
    if (forca <= 0) return
    // uma pluma a cada ~35 ms, e nao uma por quadro: em 144 Hz seriam 4x mais
    v.tFumaca = (v.tFumaca || 0) + dt
    if (v.tFumaca < 0.035) return
    v.tFumaca = 0
    for (let i = 0; i < v.rodas.length; i++) {
      const r = v.rodas[i]
      if (r.esterca) continue                 // so as de tras fumegam
      r.obj.getWorldPosition(_rodaW)
      soltarFumaca(_rodaW.x, chaoEm(_rodaW.x, _rodaW.z), _rodaW.z, forca)
    }
  }

  // =========================================================================
  // 6. CAMERA
  // =========================================================================

  function atualizarCamera(v, dt) {
    const c = v.cfg

    // 1) mouse gira em volta do veiculo
    const dx = mouseDx * PLAYER.MOUSE_SENSITIVITY
    const dy = mouseDy * PLAYER.MOUSE_SENSITIVITY
    mouseDx = 0; mouseDy = 0
    if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5) {
      camYaw -= dx
      camPitch = clamp(camPitch - dy, CAMERA.TP_PITCH_MIN, CAMERA.TP_PITCH_MAX)
      desdeMouse = 0
    }
    desdeMouse += dt

    // 2) auto-alinhamento: andando pra frente ela volta pras costas sozinha —
    // o mesmo comportamento (e as mesmas constantes) da camera de 3a pessoa.
    if (v.vel > 1.2 && desdeMouse > CAMERA.TP_FOLLOW_DELAY) {
      const querYaw = v.yaw + Math.PI
      let dif = (querYaw - camYaw + Math.PI) % TAU
      if (dif < 0) dif += TAU
      dif -= Math.PI
      const ganho = CAMERA.TP_FOLLOW * clamp01(v.vel / (c.velMax * 0.3))
      camYaw += clamp(dif, -ganho * dt, ganho * dt)
    }
    if (camYaw > Math.PI) camYaw -= TAU; else if (camYaw < -Math.PI) camYaw += TAU

    // 3) ponto de mira e posicao ideal: atras e acima, com alturaCam/distCam
    camAlvo.set(v.pos.x, v.pos.y + c.alturaCam * 0.45, v.pos.z)
    const cp = Math.cos(camPitch)
    const ox = Math.sin(camYaw) * cp
    const oz = Math.cos(camYaw) * cp
    const oy = -Math.sin(camPitch)

    _desejada.set(
      camAlvo.x + ox * c.distCam,
      v.pos.y + c.alturaCam + oy * c.distCam,
      camAlvo.z + oz * c.distCam,
    )

    // 4) parede: encurta o braco em vez de atravessar. MESMO teste da 3a pessoa.
    let quer = c.distCam
    if (collision && typeof collision.segmentHit === 'function') {
      const t = collision.segmentHit(camAlvo, _desejada, 0.24)
      if (t < 1) quer = clamp(c.distCam * t, CAMERA.TP_MIN_DISTANCE, c.distCam)
    }
    camDist = quer < camDist
      ? damp(camDist, quer, CAMERA.TP_IN_SPEED, dt)     // entra rapido
      : damp(camDist, quer, CAMERA.TP_OUT_SPEED, dt)    // sai devagar

    _desejada.set(
      camAlvo.x + ox * camDist,
      v.pos.y + c.alturaCam + oy * camDist,
      camAlvo.z + oz * camDist,
    )
    const piso = chaoEm(_desejada.x, _desejada.z) + 0.3
    if (_desejada.y < piso) _desejada.y = piso

    if (!camPronta) { camPos.copy(_desejada); camPronta = true }
    else camPos.lerp(_desejada, 1 - Math.exp(-CAMERA.TP_SMOOTH * dt))
    camera.position.copy(camPos)
    camera.up.set(0, 1, 0)
    camera.lookAt(camAlvo)

    // 5) o FOV abre com a velocidade: e o que da a sensacao de correr
    const alvoFov = CAMERA.FOV_TP + 10 * clamp01(Math.abs(v.vel) / c.velMax)
    const novo = damp(camera.fov, alvoFov, 5, dt)
    if (Math.abs(camera.fov - novo) > 0.01) {
      camera.fov = novo
      camera.updateProjectionMatrix()
    }
  }

  // =========================================================================
  // 7. REDE
  // =========================================================================

  function enviarPose(v) {
    if (ehLocal() || !rede || typeof rede.veiculoPos !== 'function') return
    rede.veiculoPos(v.id, v.pos.x, v.pos.y, v.pos.z, v.yaw, v.rolagem)
  }

  /**
   * Normaliza o que a montagem do anel devolve. helicoptero.js entrega o GRUPO
   * pronto (com rotor, assento e config em userData) pra nao construir tudo de
   * novo; construir() entrega o objeto do contrato. Aqui os dois viram a mesma
   * coisa.
   */
  function comoMontado(algo) {
    if (!algo) return null
    if (!algo.isObject3D) return algo
    const ud = algo.userData || {}
    return {
      grupo: algo,
      assento: ud.assento || null,
      rodas: ud.rodas || [],
      config: ud.config || 'helicoptero',
    }
  }

  /**
   * O anel chama isto quando a montagem termina. E um PEDIDO: quem da o id na
   * faixa 4100..4999 e o servidor, e o helicoptero so aparece no 'heli-criado'
   * (que chega pra todo mundo, inclusive pra mim). `pronto` e opcional: e o
   * grupo que a montagem ja construiu peca por peca.
   */
  function criarHelicoptero(x, y, z, pronto) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return
    y = Number.isFinite(y) ? y : chaoEm(x, z)
    if (!ehLocal() && typeof rede.criarHeli === 'function') {
      // guarda o grupo montado ate o servidor dizer o id dele
      heliPedido = { x, y, z, pronto: comoMontado(pronto) }
      // o yaw vai junto: quem montou escolheu pra onde o bicho olha
      rede.criarHeli(x, y, z, pronto && pronto.isObject3D ? pronto.rotation.y : 0)
      return
    }
    // sem servidor: eu mesmo dou o id, na mesma faixa, pelo mesmo caminho
    const id = proxHeliLocal++
    if (proxHeliLocal > HELI_ID_MAX) proxHeliLocal = HELI_ID_MIN
    heliPedido = { x, y, z, pronto: comoMontado(pronto) }
    aoEventoDeRede({ tipo: 'heli-criado', veiculoId: id, x, y, z })
  }

  function nascerHeli(id, x, y, z, yaw, dono) {
    id = id | 0
    if (!id || veiculos.has(id)) return
    // O grupo que a montagem deixou pronto so vale pro MEU pedido; o
    // helicoptero que outro jogador criou eu construo do zero. "Meu" e o que o
    // servidor disse (HELI_CRIADO leva o dono = quem MONTOU), ou qualquer um
    // quando nao ha servidor.
    //
    // Quem consome e zera heliPedido e SO esta funcao. Zerar antes de chamar
    // aqui — como o ramo de 'heli-criado' fazia — descartava o grupo que a
    // montagem produziu peca por peca e construia um helicoptero novo do zero,
    // perdendo a continuidade visual do efeito bem no quadro do clarao.
    const ehMeu = ehLocal() || ((dono | 0) !== 0 && (dono | 0) === meuId())
    const guardado = ehMeu && heliPedido && heliPedido.pronto ? heliPedido.pronto : null
    // o pedido de outro jogador nao pode limpar o meu, que ainda espera o id
    if (ehMeu) heliPedido = null
    if (guardado) {
      // a montagem entrega o grupo na pose do mundo; aqui ele passa a ser
      // filho do grupo de veiculos, entao a pose vira local (que e a mesma,
      // porque o grupo de veiculos fica na origem sem rotacao)
      // o yaw do servidor manda; sem ele vale o que a montagem deixou
      const g = Number.isFinite(yaw) ? yaw : (guardado.grupo.rotation.y || 0)
      registrar(id, 'helicoptero', { x, y, z, yaw: g }, guardado)
      return
    }
    carregar('helicoptero').then((m) => {
      if (!m) { avisar('O helicoptero ainda nao tem modelo.'); return }
      registrar(id, 'helicoptero', { x, y, z, yaw: Number.isFinite(yaw) ? yaw : 0 }, m)
    })
  }

  /**
   * Eventos do servidor. Como no anel, o nome do tipo e normalizado e id que
   * eu nao conheco e ignorado sem reclamar.
   */
  function aoEventoDeRede(ev) {
    if (!ev) return
    const tipo = String(ev.tipo || ev.t || ev.nome || '').toLowerCase().replace(/[^a-z]/g, '')
    const id = (ev.veiculoId !== undefined ? ev.veiculoId
      : ev.veicId !== undefined ? ev.veicId
        : ev.id !== undefined ? ev.id : 0) | 0

    if (tipo === 'helicriado') {
      if (!id) return
      // o dono do HELI_CRIADO e quem MONTOU (nao quem pilota): e ele que decide
      // se o grupo guardado em heliPedido e o desta criacao. Quem zera o pedido
      // e nascerHeli, e mais ninguem.
      const quemMontou = (ev.dono !== undefined ? ev.dono
        : ev.donoId !== undefined ? ev.donoId : 0) | 0
      nascerHeli(id, ev.x || 0, Number.isFinite(ev.y) ? ev.y : 0, ev.z || 0,
        ev.yaw, quemMontou)
      return
    }

    if (!id || id < 4000 || id > HELI_ID_MAX) return
    const v = veiculos.get(id)

    if (tipo === 'negado') {
      // NEGADO tambem serve pra NPC e objeto: so me interessa se e do veiculo
      // que EU pedi.
      if (pedidoId === id) { pedidoId = 0; avisar('Alguem entrou nesse veiculo antes.') }
      return
    }

    if (tipo === 'veiculopos') {
      if (!v || v.id === dirigindo) return       // a minha pose sai daqui, nao de la
      // guarda pro desenho 100 ms atras, como todo o resto que e remoto
      v.buffer.push({
        t: tempo,
        x: ev.x || 0, y: Number.isFinite(ev.y) ? ev.y : 0, z: ev.z || 0,
        yaw: ev.yaw || 0, rolagem: ev.rolagem || 0,
      })
      while (v.buffer.length > 6) v.buffer.shift()
      return
    }

    if (tipo !== 'veiculodono') return
    if (!v) return
    let dono = ev.donoId !== undefined ? ev.donoId : (ev.dono !== undefined ? ev.dono : 0)
    dono = dono | 0
    const sou = ehLocal() ? (dono === -1) : (dono !== 0 && dono === meuId())
    v.dono = sou ? (ehLocal() ? -1 : dono) : dono

    // o servidor pode mandar junto a pose em que o veiculo ficou; ela e a verdade
    if (Number.isFinite(ev.x) && Number.isFinite(ev.z) && v.id !== dirigindo) {
      v.pos.set(ev.x, Number.isFinite(ev.y) ? ev.y : v.pos.y, ev.z)
      if (Number.isFinite(ev.yaw)) v.yaw = ev.yaw
      v.buffer.length = 0
    }

    if (sou) { assumirVolante(v); return }
    if (pedidoId === id) { pedidoId = 0; if (dono) avisar('Alguem entrou nesse veiculo antes.') }
    // o servidor tirou o volante de mim (sai, caiu, ou levou um chute)
    if (dirigindo === id) largarVolante(v, false)
  }

  /** A conexao caiu: nada pode ficar preso. O servidor ja liberou; eu limpo aqui. */
  function limparPorQueda() {
    const v = dirigindo ? veiculos.get(dirigindo) : null
    if (v) {
      avisar('Conexao caiu: o veiculo voltou pro servidor.')
      largarVolante(v, false)
    }
    pedidoId = 0
    heliPedido = null
    for (const outro of veiculos.values()) { outro.dono = 0; outro.buffer.length = 0 }
  }

  // =========================================================================
  // 8. QUADRO
  // =========================================================================

  /** Veiculo de outra pessoa: desenhado 100 ms atras, interpolado. */
  function atualizarRemoto(v, dt) {
    const buf = v.buffer
    if (!buf.length) {
      // parado na vaga: fica exatamente na pose que o servidor deu por ultimo
      v.grupo.position.copy(v.pos)
      v.grupo.rotation.set(0, v.yaw, (v.pivoInclina || v.carroceria) ? 0 : v.rolagem)
      if (v.carroceria) v.carroceria.rotation.z = v.rolagem
      animarLuzes(v, ENTRADA_PARADA, dt)
      animarRotores(v, dt, v.dono !== 0)
      return
    }
    const alvoT = tempo - ATRASO_INTERP
    let a = buf[0], b = null
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= alvoT && buf[i + 1].t >= alvoT) { a = buf[i]; b = buf[i + 1]; break }
      if (buf[i + 1].t < alvoT) a = buf[i + 1]
    }
    if (b) {
      const k = clamp01((alvoT - a.t) / Math.max(1e-4, b.t - a.t))
      v.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k)
      v.yaw = a.yaw + anguloCurto(a.yaw, b.yaw) * k   // caminho curto
      v.rolagem = a.rolagem + (b.rolagem - a.rolagem) * k
    } else {
      v.pos.set(a.x, a.y, a.z)
      v.yaw = a.yaw
      v.rolagem = a.rolagem
    }
    // as rodas dos outros giram pelo que ele ANDOU, nao por uma velocidade que
    // nao viaja pela rede
    const andou = Math.hypot(v.pos.x - v.grupo.position.x, v.pos.z - v.grupo.position.z)
    for (let i = 0; i < v.rodas.length; i++) {
      v.rodas[i].obj.rotation.x += andou / v.rodas[i].raio
    }
    v.grupo.position.copy(v.pos)
    if (v.carroceria) {
      v.grupo.rotation.set(0, v.yaw, 0)
      v.carroceria.rotation.set(0, 0, v.rolagem)
    } else if (v.pivoInclina) {
      v.grupo.rotation.set(0, v.yaw, 0)
      v.pivoInclina.rotation.z = v.rolagem
    } else {
      v.grupo.rotation.set(0, v.yaw, v.rolagem)
    }
    animarLuzes(v, ENTRADA_PARADA, dt)
    animarRotores(v, dt, v.dono !== 0)
  }

  /** Menor caminho angular de a ate b. */
  function anguloCurto(a, b) {
    let d = (b - a) % TAU
    if (d > Math.PI) d -= TAU
    if (d < -Math.PI) d += TAU
    return d
  }

  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1
    tempo += dt

    // A conexao caiu no meio da corrida? Interessa a BORDA, nao o estado — e a
    // borda tem que ser medida FORA do guarda de ehLocal(). Dentro dele
    // rede.conectado e SEMPRE verdadeiro (ehLocal() so e falso porque
    // rede.conectado e true), entao a transicao conectado -> desconectado nunca
    // apareceria e o jogador ficaria preso num veiculo fantasma justamente na
    // hora em que a conexao cai, que e o unico caso que este trecho existe pra
    // resolver.
    const conectadoAgora = !!(rede && rede.conectado)
    if (conectadoAntes && !conectadoAgora) limparPorQueda()
    conectadoAntes = conectadoAgora

    atualizarFumaca(dt)

    if (pedidoId) {
      pedidoT += dt
      if (pedidoT > TEMPO_PEDIDO) pedidoId = 0     // some sem barulho
    }

    const meu = dirigindo ? veiculos.get(dirigindo) : null
    if (dirigindo && !meu) dirigindo = 0

    for (const v of veiculos.values()) {
      if (v === meu) continue
      atualizarRemoto(v, dt)
      if (v.aoAnimar) v.aoAnimar(dt, { vel: 0, giro: 0, dirigindo: false, ligado: v.dono !== 0 })
    }

    if (!meu) return

    // --- o veiculo que eu dirijo -------------------------------------------
    const e = entrada()
    const velAntes = meu.vel
    let taxa = 0
    if (meu.voa) {
      taxa = voar(meu, e, dt)
    } else {
      // Espaco: freio de mao SO NO CARRO, pulinho no skate, nada na moto.
      // Na moto o dono reprovou ("retire apenas o derrapar com a tecla
      // espaco"): moto de rabeira nao combina com o resto da pilotagem dela,
      // que e agarrada e limpa.
      meu.freioMao = meu.tipo === 'carro' && !!e.cima
      acelerar(meu, e, dt)
      taxa = estercar(meu, e, dt)
      if (meu.freioMao) meu.vel = mover(meu.vel, 0, meu.cfg.freio * 0.55 * dt)
      andar(meu, taxa, dt)
      if (meu.impulso && e.cima && !meu.noAr) {   // o pulinho do skate
        meu.noAr = true
        meu.vy = PULO_SKATE
        meu.empurra = -1
      }
      assentarNoChao(meu, dt)
    }
    const acelReal = (meu.vel - velAntes) / dt

    animarRodas(meu, dt)
    animarLuzes(meu, e, dt)
    fumacaDaDerrapagem(meu, dt)
    animarRotores(meu, dt, true)
    aplicarPose(meu, taxa, acelReal, dt)
    prenderNoAssento(meu, dt)
    if (meu.aoAnimar) {
      meu.aoAnimar(dt, { vel: meu.vel, giro: meu.giro, dirigindo: true, ligado: true })
    }
    atualizarCamera(meu, dt)

    // O meu corpo continua sendo meu: o avatar viaja com o veiculo pra que os
    // outros me vejam passar, e nao parado na vaga onde entrei.
    if (player && player.position) {
      player.position.set(meu.pos.x, chaoEm(meu.pos.x, meu.pos.z), meu.pos.z)
      if (player.velocity) player.velocity.set(0, 0, 0)
    }

    // HUD: velocidade e como sair. Roda DEPOIS do prompt de interacao do main,
    // entao e o meu texto que fica na tela enquanto eu estiver dirigindo.
    if (hud && typeof hud.setPrompt === 'function') {
      hud.setPrompt(Math.round(Math.abs(meu.vel) * 3.6) + ' km/h  ·  E para sair')
    }

    // pose a 15 Hz, o ritmo do servidor. Mandar a 60 so gastaria banda.
    acumPos += dt
    if (acumPos >= PERIODO_POS) {
      acumPos -= PERIODO_POS
      if (acumPos > PERIODO_POS) acumPos = 0
      enviarPose(meu)
    }
  }

  // =========================================================================
  // 9. LIMPEZA
  // =========================================================================
  function dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
    }
    if (dirigindo) {
      const v = veiculos.get(dirigindo)
      if (v) largarVolante(v, true)
    }
    if (grupo.parent) grupo.parent.remove(grupo)
    veiculos.clear()
    void interaction
  }

  // =========================================================================
  // VEICULO COMPRADO NA CONCESSIONARIA
  // =========================================================================
  //
  // Faixa 4010..4089, e ela mora AQUI e nao em comum/mundo.js de proposito.
  // mundo.js e a lista de ids que os DOIS LADOS precisam concordar, e veiculo
  // comprado nao passa pela rede: ele e local, como a carteira e como a mobilia
  // instalada na casa ("o protocolo de rede nao tem pacote de dinheiro e
  // inventar um significaria mexer no servidor e no contrato", main.js).
  //
  // A faixa e escolhida pra nao encostar em nada: 4000..4002 sao os tres
  // estacionados do mundo e 4100..4999 sao os helicopteros montados.
  const COMPRADO_MIN = 4010
  const COMPRADO_MAX = 4089
  let proxComprado = COMPRADO_MIN

  /**
   * Poe no mundo um veiculo do tipo pedido, ja estacionado e pronto pra entrar.
   * Devolve o id, ou 0 se o tipo nao tem modelo ou a faixa acabou.
   *
   * Assincrono por dentro (o modelo carrega por import dinamico, como os tres
   * do mundo e o helicoptero), entao quem chama nao recebe o veiculo pronto —
   * recebe o id que ele VAI ter. Nenhum caminho do jogo precisa dele no mesmo
   * quadro: a concessionaria so avisa "seu veiculo esta na vaga da frente".
   */
  function criarComprado(tipo, x, z, yaw) {
    if (proxComprado > COMPRADO_MAX) return 0
    const nome = String(tipo || '').toLowerCase().replace(/[^a-z]/g, '')
    if (!MODULOS['./' + nome + '.js']) return 0
    const id = proxComprado++
    carregar(nome).then((m) => {
      if (!m) return
      registrar(id, nome, { x, y: chaoEm(x, z), z, yaw: yaw || 0 }, m)
    })
    return id
  }

  return {
    grupo,
    atualizar,
    entrarSair,
    aoEventoDeRede,
    criarHelicoptero,
    criarComprado,
    veiculoPerto,
    dispose,
    get dirigindo() { return dirigindo },
    get veiculos() { return veiculos },
  }
}

// ---------------------------------------------------------------------------
// SUPOSICOES (o que este arquivo espera dos outros):
//
// Dos MODELOS (carro.js, moto.js, skate.js, helicoptero.js):
//   construir() -> { grupo, assento, rodas[], config }
//     grupo   origem NO CHAO, no centro do veiculo, frente para +Z
//     assento Object3D onde o personagem senta. Convencao: e o ponto do
//             QUADRIL (como os bancos da cidade, onde seat.y = topo do assento);
//             no skate — e em qualquer modelo com empe:true ou
//             assento.userData.empe — e o ponto dos PES.
//     rodas   as que giram e esterçam. O eixo da roda e X (giro em rotation.x).
//             userData.esterca decide quem esterça; sem ele vale z > 0 (frente).
//             userData.raio evita a medida por bounding box.
//     config  a chave em MUNDO.DIRIGIR
//   opcionais: volante (Object3D), atualizar(dt, estado), empe, raio
//
// Da REDE (proteger tudo com typeof, o jogo tem que rodar sem servidor):
//   rede.entrarVeiculo(id)                        pedido
//   rede.sairVeiculo(id)
//   rede.veiculoPos(id, x, y, z, yaw, rolagem)    15 Hz, so o dono
//   rede.criarHeli(x, y, z)                       pedido; o id e do servidor
//   eventos: { tipo:'veiculo-dono', veiculoId, donoId, x, y, z, yaw }
//            { tipo:'veiculo-pos',  veiculoId, x, y, z, yaw, rolagem }
//            { tipo:'heli-criado',  veiculoId, dono, x, y, z, yaw }
//              `dono` e quem MONTOU: so com ele eu sei se o grupo que a
//              montagem deixou pronto e o deste helicoptero ou o de outro
//            { tipo:'negado', id }  quando o veiculo pedido ja tinha dono
//
// Do MAIN:
//   - scene.add(veiculos.grupo)
//   - veiculos.atualizar(dt) DEPOIS de player.update(dt): eu escrevo por cima
//     da camera, do character.root e do prompt do HUD, e quem escreve por
//     ultimo e quem manda.
//   - o E: se veiculos.dirigindo ou veiculos.veiculoPerto(player.position),
//     chamar veiculos.entrarSair() em vez do interaction.trigger();
//     o prompt de "Entrar no carro" tambem sai de veiculoPerto().
//   - encaminhar 'veiculo-dono', 'veiculo-pos', 'heli-criado' e o 'negado' de
//     veiculo para veiculos.aoEventoDeRede(ev).
//   - o anel chama veiculos.criarHelicoptero(x, y, z) ao fim da montagem.
//
// Sem `rede`, o modulo responde aos proprios pedidos e o jogo continua
// jogavel sozinho. Com rede, ele nunca decide de quem e o volante.
// ---------------------------------------------------------------------------
