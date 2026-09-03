import * as THREE from 'three'

// ---------------------------------------------------------------------------
// src/systems/camera-cena.js — A CAMERA QUE ENTRA NA MESA.
//
// O pedido que criou este arquivo: "nao quero que ao iniciar o blackjack surja
// um HUD, quero que aproxime na mesa, como se fosse um simulador mesmo". E o
// mesmo gesto que o bar pede depois — aproximar a imagem da bebida, da
// fruteira, do copo. Ou seja: NAO e um efeito do blackjack. E um movimento de
// camera que varios sistemas do jogo vao querer, e por isso mora em systems/.
//
// O QUE ELE FAZ, EM UMA LINHA: guarda o enquadramento do jogador, viaja ate um
// enquadramento seu, fica la enquanto o sistema precisar, e VOLTA pro
// enquadramento do jogador — que continua vivo o tempo todo, so travado.
//
// A ORDEM DENTRO DO QUADRO E A PARTE QUE NAO E OBVIA
//
// O controller do jogador escreve `camera.position` e `camera.rotation` TODO
// QUADRO, dentro de player.update(). Quem escreve por ultimo ganha. Entao
// atualizar() PRECISA ser chamado DEPOIS de player.update() — na pratica, de
// dentro de um `moduleUpdates` (world/casino.js ja chama assim). Chamado antes,
// a camera da mesa nasce e morre no mesmo quadro, e o efeito e um tremor.
//
// E dessa mesma ordem sai o truque que faz a VOLTA ser suave de graca: quando
// atualizar() roda, a camera ainda esta EXATAMENTE onde o jogador a poe neste
// quadro. Logo, basta ler a camera na primeira linha pra ter, sem guardar nada,
// o alvo pra onde a saida tem que voltar — mesmo que o jogador tenha sido
// teleportado, sentado, ou trocado de 1a pra 3a pessoa no meio da cena.
//
// O JOGADOR FICA TRAVADO, NAO CONGELADO. player.setLocked(true) tira o WASD, o
// mouse e o V das maos dele, mas o update continua rodando: a fisica, o chao, a
// animacao e o boneco seguem vivos. Congelar de verdade (parar de chamar o
// update) faria o personagem cair do mundo no primeiro quadro depois da cena.
//
// PARALAXE DE PONTEIRO. Enquanto a cena esta no ar o ponteiro esta SOLTO (todo
// painel do cassino solta o mouse). Entao a lente acompanha o ponteiro de leve,
// alguns graus para cada lado. Nao e camera livre: e o suficiente pra mesa nao
// parecer uma foto colada na tela. Quem escuta o mousemove e este modulo — o
// input do jogo so entrega delta com o ponteiro TRAVADO, e o controller ja
// consumiu esse delta antes de nos.
// ---------------------------------------------------------------------------

const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler(0, 0, 0, 'YXZ')
const _m = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)

/** Suaviza 0..1 nas duas pontas: sai devagar, chega devagar. */
function suave(k) {
  if (k <= 0) return 0
  if (k >= 1) return 1
  return k * k * (3 - 2 * k)
}

/**
 * Monta a rotacao de "estar em `pos` olhando pra `alvo`".
 *
 * VAI DE Matrix4.lookAt, E ISSO NAO E DETALHE — a primeira versao usava um
 * `new THREE.Object3D()` descartavel (posiciona, `lookAt(alvo)`, copia o
 * quaternion) e o resultado era a camera olhando EXATAMENTE PRO LADO OPOSTO.
 * A mesa de blackjack abria enquadrando a fachada do cassino, a 10 m atras.
 *
 * A causa esta dentro do proprio `Object3D.lookAt` do three: ele TROCA a ordem
 * dos argumentos quando o objeto e uma camera ou uma luz —
 * `isCamera ? m.lookAt(posicao, alvo, up) : m.lookAt(alvo, posicao, up)` —
 * porque objeto comum aponta o +Z dele pro alvo e camera aponta o -Z. Copiar o
 * quaternion de um Object3D COMUM pra uma camera e, portanto, uma meia-volta de
 * erro embutida, e ela nao aparece em teste numerico de enquadramento: quem
 * projeta a carta na tela com a propria conta acha tudo certo.
 *
 * `Matrix4.lookAt(olho, alvo, up)` nao tem esse ramo: ele monta a base com
 * +Z = (olho - alvo), que ja e a convencao de camera (a lente olha pro -Z
 * dela). E e a mesma funcao que o three usa por baixo pra camera, entao a
 * protecao contra o alvo quase vertical vem junto.
 */
function quatOlhando(pos, alvo, saida) {
  _m.lookAt(pos, alvo, _up)
  return saida.setFromRotationMatrix(_m)
}

/**
 * @param {object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {object} opts.player  o controller do jogador (precisa de setLocked)
 * @param {object} [opts.hud]   pra apagar a mira enquanto a cena roda
 */
export function criarCameraCena({ camera, player, hud } = {}) {
  if (!camera) throw new Error('camera-cena: falta a camera')

  // 'fora' | 'entrando' | 'dentro' | 'saindo'
  let fase = 'fora'
  let t = 0                       // segundos dentro da fase atual
  let dur = 0.9                   // duracao da fase atual

  // o enquadramento pedido (destino) e o ponto de onde a viagem comecou
  const destPos = new THREE.Vector3()
  const destAlvo = new THREE.Vector3()
  const destQuat = new THREE.Quaternion()
  let destFov = 40

  const dePos = new THREE.Vector3()
  const deQuat = new THREE.Quaternion()
  let deFov = 55

  // o enquadramento do JOGADOR neste quadro (lido no topo de atualizar)
  const livrePos = new THREE.Vector3()
  const livreQuat = new THREE.Quaternion()
  let livreFov = 55

  let aoChegar = null
  let aoSair = null

  // --- paralaxe de ponteiro --------------------------------------------------
  let px = 0, py = 0              // -1..1, ja filtrados
  let alvoPx = 0, alvoPy = 0
  let forcaParalaxe = 1
  let ouvindo = false

  function onMouse(ev) {
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    alvoPx = (ev.clientX / w) * 2 - 1
    alvoPy = (ev.clientY / h) * 2 - 1
  }
  function ouvir(v) {
    if (v === ouvindo) return
    ouvindo = v
    if (v) window.addEventListener('mousemove', onMouse)
    else window.removeEventListener('mousemove', onMouse)
  }

  /**
   * Entra na cena — ou, se ja estiver dentro, VIAJA pro novo enquadramento. E
   * assim que a mesa chega perto das cartas na hora de virar e recua na hora de
   * apostar, sem nunca soltar a camera de volta pro jogador no meio.
   *
   * @param {object} e
   * @param {THREE.Vector3} e.pos     onde a lente fica, em coordenadas de MUNDO
   * @param {THREE.Vector3} e.alvo    pra onde ela olha, em MUNDO
   * @param {number} [e.fov=40]       campo apertado achata a perspectiva
   * @param {number} [e.tempo=0.9]    segundos da viagem
   * @param {number} [e.paralaxe=1]   0 desliga o acompanhamento do ponteiro
   * @param {function} [e.aoChegar]
   */
  function entrar(e = {}) {
    if (e.pos) destPos.copy(e.pos)
    if (e.alvo) destAlvo.copy(e.alvo)
    quatOlhando(destPos, destAlvo, destQuat)
    destFov = Number.isFinite(e.fov) ? e.fov : 40
    forcaParalaxe = Number.isFinite(e.paralaxe) ? e.paralaxe : 1
    aoChegar = typeof e.aoChegar === 'function' ? e.aoChegar : null
    dur = Math.max(0.001, Number.isFinite(e.tempo) ? e.tempo : 0.9)
    t = 0

    // De onde a viagem parte e SEMPRE de onde a lente esta agora: entrando, ela
    // esta no olho do jogador; ja dentro, no enquadramento anterior. Ler a
    // camera cobre os dois casos sem um `if` que um dia sai de sincronia.
    dePos.copy(camera.position)
    deQuat.copy(camera.quaternion)
    deFov = camera.fov
    if (fase === 'fora' && player && player.setLocked) player.setLocked(true)

    fase = 'entrando'
    ouvir(true)
    return true
  }

  /** Volta pro jogador, em `tempo` segundos. */
  function sair(opts = {}) {
    if (fase === 'fora' || fase === 'saindo') return false
    dePos.copy(camera.position)
    deQuat.copy(camera.quaternion)
    deFov = camera.fov
    dur = Math.max(0.001, Number.isFinite(opts.tempo) ? opts.tempo : 0.55)
    t = 0
    aoSair = typeof opts.aoSair === 'function' ? opts.aoSair : null
    fase = 'saindo'
    return true
  }

  /** Corta pro jogador AGORA, sem viagem (troca de cenario, F8, reinicio). */
  function cortar() {
    fase = 'fora'
    t = 0
    aoChegar = null
    aoSair = null
    ouvir(false)
    px = py = alvoPx = alvoPy = 0
    if (player && player.setLocked) player.setLocked(false)
  }

  /**
   * TEM que ser chamado DEPOIS de player.update() no mesmo quadro. Ver o
   * cabecalho: e essa ordem que faz a camera da cena existir.
   *
   * @returns {boolean} true enquanto a cena manda na camera
   */
  function atualizar(dt) {
    if (fase === 'fora') return false
    const d = Math.min(Math.max(dt || 0, 0), 0.1)

    // 1) o enquadramento do jogador NESTE quadro — de graca, porque o
    //    controller acabou de escreve-lo na camera.
    livrePos.copy(camera.position)
    livreQuat.copy(camera.quaternion)
    livreFov = camera.fov

    // 2) paralaxe filtrada. O filtro e o que separa "a cabeca acompanha" de
    //    "a camera esta colada no ponteiro".
    const kf = 1 - Math.exp(-6 * d)
    px += (alvoPx - px) * kf
    py += (alvoPy - py) * kf

    t += d
    const k = suave(Math.min(1, t / dur))

    if (fase === 'saindo') {
      camera.position.lerpVectors(dePos, livrePos, k)
      camera.quaternion.copy(deQuat).slerp(livreQuat, k)
      const fov = deFov + (livreFov - deFov) * k
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }
      if (k >= 1) {
        const fim = aoSair
        cortar()
        if (fim) fim()
      }
      return true
    }

    if (fase === 'entrando' && k >= 1) {
      fase = 'dentro'
      const chegou = aoChegar
      aoChegar = null
      if (chegou) chegou()
    }

    const kk = fase === 'dentro' ? 1 : k
    camera.position.lerpVectors(dePos, destPos, kk)
    camera.quaternion.copy(deQuat).slerp(destQuat, kk)
    const fov = deFov + (destFov - deFov) * kk
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }

    // 3) A paralaxe entra DEPOIS da viagem, e proporcional a ela: durante a
    //    aproximacao a lente ja esta se mexendo sozinha, e somar as duas coisas
    //    embrulha o estomago. 0.070 rad = 4 graus de giro no maximo do canto da
    //    tela; a lente ainda ANDA 3.5 cm, que e o que da profundidade de
    //    verdade — so girar le como cabeca presa num torno.
    const amp = 0.070 * forcaParalaxe * kk
    if (amp > 0.0005) {
      _e.set(-py * amp * 0.55, -px * amp, 0, 'YXZ')
      _q.setFromEuler(_e)
      camera.quaternion.multiply(_q)
      _v.set(px * 0.035 * forcaParalaxe * kk, -py * 0.022 * forcaParalaxe * kk, 0)
      _v.applyQuaternion(camera.quaternion)
      camera.position.add(_v)
    }

    // A mira e do jogador, nao da cena. O main reescreve isto todo quadro ANTES
    // de nos (ele roda no player.update), entao apagar aqui e o que vale.
    if (hud && typeof hud.setCrosshair === 'function') hud.setCrosshair(false)
    return true
  }

  return {
    entrar,
    sair,
    cortar,
    atualizar,
    get ativa() { return fase !== 'fora' },
    get dentro() { return fase === 'dentro' },
    get fase() { return fase },
    /** Onde a lente esta mirando agora — pro sistema colar coisa na frente. */
    alvo: destAlvo,
    posicao: destPos,
  }
}

export default criarCameraCena
