import * as THREE from 'three'
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
// Distancia de entrada, somada ao raio do veiculo.
const ALCANCE_ENTRAR = 2.4
// Maior circulo de colisao que um veiculo pode ter (ver medirRaio).
const RAIO_MAX = 1.6
// Segundos esperando o servidor confirmar o entrar antes de desistir calado.
const TEMPO_PEDIDO = 2.0
const PERIODO_POS = 1 / TICK_HZ
// Skate: W nao e aceleracao continua, e o pe empurrando o chao.
const IMPULSO_INTERVALO = 0.62
// Skate: o pulinho do Espaco.
const PULO_SKATE = 3.4
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
      tImpulso: 0,
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
    if (v.pivoInclina) v.pivoInclina.rotation.z = 0
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
      // Skate: W nao e acelerador, e o pe empurrando o chao. Um impulso de cada
      // vez, com intervalo — e o que faz o skate se sentir skate.
      v.tImpulso -= dt
      if (e.frente && v.tImpulso <= 0) {
        v.tImpulso = IMPULSO_INTERVALO
        v.vel += c.acel * 0.95
      }
      if (e.tras) v.vel -= (v.vel > 0.2 ? c.freio : c.acel * 0.5) * dt
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
    // a curva pede aceleracao lateral; o que o pneu nao segura vira derrapagem
    v.velLat += (1 - c.agarra) * taxa * v.vel * dt
    v.velLat *= Math.exp(-c.agarra * ABSORVE_LAT * dt)
    if (Math.abs(v.velLat) < 0.005) v.velLat = 0

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
    for (let i = 0; i < v.rodas.length; i++) {
      const r = v.rodas[i]
      // gira proporcional a velocidade: metro andado / raio = radianos
      r.obj.rotation.x -= (v.vel * dt) / r.raio
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
    const freando = !!e.tras || (v.vel < -0.2)
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
    const alvoRol = v.voa ? -clamp(taxa / c.giroMax, -1, 1) * c.inclina : -forca * c.inclina
    v.rolagem = damp(v.rolagem, alvoRol, 7, dt)
    // mergulho no freio, levantada na aceleracao
    const alvoMerg = v.voa ? v.inclFrente : clamp(-acelReal / c.acel, -1, 1) * MERGULHO
    v.mergulho = damp(v.mergulho, alvoMerg, 8, dt)

    v.grupo.position.copy(v.pos)
    if (v.pivoInclina) {
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
    character.root.position.set(0, (v.quadrilNoAssento ? -HIPS_Y : 0) - v.afundar, 0)
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
    character.root.updateMatrixWorld(true)
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
      v.grupo.rotation.set(0, v.yaw, v.pivoInclina ? 0 : v.rolagem)
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
      v.rodas[i].obj.rotation.x -= andou / v.rodas[i].raio
    }
    v.grupo.position.copy(v.pos)
    if (v.pivoInclina) {
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
      acelerar(meu, e, dt)
      taxa = estercar(meu, e, dt)
      andar(meu, taxa, dt)
      if (meu.impulso && e.cima && !meu.noAr) {   // o pulinho do skate
        meu.noAr = true
        meu.vy = PULO_SKATE
      }
      assentarNoChao(meu, dt)
    }
    const acelReal = (meu.vel - velAntes) / dt

    animarRodas(meu, dt)
    animarLuzes(meu, e, dt)
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

  return {
    grupo,
    atualizar,
    entrarSair,
    aoEventoDeRede,
    criarHelicoptero,
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
