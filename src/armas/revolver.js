import * as THREE from 'three'
import { PLAYER, CAMERA } from '../config.js'
import { criarModeloRevolver, N_CAMARAS, ANGULO_ABERTO } from './revolver-modelo.js'
import {
  criarFogoDeBoca, criarFumaca, criarFaiscas, criarFuros, criarCapsulas,
} from './efeitos-tiro.js'

// ---------------------------------------------------------------------------
// O REVOLVER.
//
// Segue o padrao do anel verde e da arma de portal (ver REDE.md): o modulo
// desenha, o servidor manda. Aqui, porem, o protocolo binario NAO tem mensagem
// de tiro — entao a regra que da pra cumprir hoje e a outra metade do contrato:
// "o fogo, a fumaca e o clarao sao 100% LOCAIS; pela rede viaja so o evento".
// Cada maquina desenha o proprio tiro na hora, e se um dia o servidor ganhar
// `rede.atirarRevolver(...)` este arquivo ja o chama e ja sabe receber o
// evento de volta em aoEventoDeRede() — pelo MESMO caminho, sem atalho.
//
// Sem servidor (ehLocal()) nada muda pro jogador: o tiro e o mesmo.
//
// O que ele NAO faz de proposito: dano. Quem reage ao tiro e quem quiser,
// ligando `revolver.aoAcerto = (info) => {...}`. O zumbi, uma garrafa, uma
// janela: o revolver so entrega { ponto, normal, objeto, distancia }.
// ---------------------------------------------------------------------------

/**
 * Onde a arma fica largada: no beco do quadrante sudeste, encostada na cacamba
 * de lixo que fica em (21.5, 32.2). O beco tem piso em LEVELS.ALLEY = 0.05.
 */
export const REVOLVER_POS = { x: 23.6, y: 0.05, z: 30.9 }

// --- numeros da arma ---------------------------------------------------------
const CAPACIDADE = N_CAMARAS       // 6 camaras; municao e infinita
const CADENCIA = 0.30              // segundos entre dois tiros
const ALCANCE = 90                 // metros que o raio percorre
const RECARGA_DUR = 2.05           // segundos da recarga inteira

// Fases da recarga, em fracao do tempo total. Elas TEM que somar a sequencia
// inteira e nao se sobrepor: e esta tabela que faz o tambor abrir, ejetar,
// carregar, fechar e girar sempre na mesma ordem.
const R_ABRIR = 0.14               // 0.00 -> 0.14  tambor bascula pra esquerda
const R_EJETAR = 0.30              // 0.14 -> 0.30  estrela empurra as capsulas
const R_CARREGAR = 0.68            // 0.30 -> 0.68  entram 6 balas, uma a uma
const R_FECHAR = 0.83              // 0.68 -> 0.83  tambor volta e trava
                                   // 0.83 -> 1.00  giro de conferencia

// Poses da arma presa a camera (1a pessoa), em ESPACO DA CAMERA: -Z e pra
// frente, +X e a direita da tela, +Y e pra cima. Rotacao zero ja e "arma
// apontada pra frente e em pe", porque o grupo `orienta` faz a meia-volta
// (ver conferirPai). Distancias curtas de proposito: a camera tem near = 0.05,
// entao 0.25 m ainda nao corta a coronha.
const POSE_QUADRIL = {
  pos: new THREE.Vector3(0.160, -0.150, -0.345),
  rot: new THREE.Euler(0.05, 0.15, -0.09),
}
// Mirando, a LINHA DE VISADA do modelo (topo das duas miras, y = 0.097 no
// espaco da arma) tem que cair no CENTRO da tela: por isso o -0.097 exato.
const POSE_MIRA = {
  pos: new THREE.Vector3(0.0, -0.101, -0.265),
  // 0.035 rad de bico pra baixo: alinhada em cima a arma vira uma mancha
  // escura, porque a ponte da armacao tapa o cano inteiro. Com este bico o
  // jogador ve o dorso do cano correndo ate a massa de mira, que e o que faz
  // a mira LER. O tiro nao muda de lugar: o raio sai da camera, nao do cano.
  rot: new THREE.Euler(0.035, 0.0, 0.0),
}
const FOV_MIRA = 15                // quantos graus o FOV fecha ao mirar
const SENS_MIRA = 0.45             // multiplicador da sensibilidade mirando

// Pose na mao de verdade (3a pessoa). A mao e uma junta no PULSO e o mesh do
// punho desce ate ~y = -0.09, entao a coronha desce junto pra arma pousar na
// mao em vez de flutuar acima dela (mesma conta da arma de portal).
const POSE_MAO = {
  pos: new THREE.Vector3(0.012, -0.088, 0.040),
  rot: new THREE.Euler(-0.10, 0, 0.06),
}

const _o = new THREE.Vector3()
const _d = new THREE.Vector3()
const _n = new THREE.Vector3()
const _p = new THREE.Vector3()
const _v = new THREE.Vector3()
const _q = new THREE.Quaternion()
// Eixo fixo: nasce uma vez porque isto entra em conta de quadro, e alocar um
// Vector3 por evento joga o coletor de lixo no meio do tiroteio.
const EIXO_Z = new THREE.Vector3(0, 0, 1)
const _mPose = new THREE.Matrix4()

function damp(cur, alvo, lambda, dt) {
  return cur + (alvo - cur) * (1 - Math.exp(-lambda * dt))
}
function suave(k) { return k * k * (3 - 2 * k) }   // smoothstep

/**
 * @param dep.scene, dep.camera, dep.player, dep.character, dep.collision
 * @param dep.rede         cliente de rede (opcional: sem ele, modo local)
 * @param dep.hud          opcional, pra toast e pra apagar a mira ao usar alca
 * @param dep.groundY      opcional, (x,z)->altura do chao (onde a capsula para)
 * @param dep.interaction  opcional, pra desligar o "Pegar o revolver" ao pegar
 */
export function criarRevolver({ scene, camera, player, character, collision, rede, hud,
  groundY, interaction }) {

  const chaoEm = typeof groundY === 'function' ? groundY : () => 0

  // Decidido A CADA ACAO, nunca congelado na criacao: o jogo abre antes de
  // conectar, pode nunca conectar e pode cair no meio.
  const ehLocal = () => !rede || typeof rede.atirarRevolver !== 'function' || !rede.conectado
  const meuId = () => {
    if (!rede) return 0
    return (typeof rede.meuId === 'function' ? rede.meuId() : rede.meuId) || 0
  }
  const avisar = (m) => { if (hud && typeof hud.toast === 'function') hud.toast(m) }

  // =========================================================================
  // 1. MODELO
  // =========================================================================
  const pele = (character && character.appearance && character.appearance.skin) || undefined
  const camisa = (character && character.appearance && character.appearance.shirt) || undefined
  const modelo = criarModeloRevolver({ pele, manga: camisa })

  // --- largado no mundo -------------------------------------------------------
  // Um pivo que gira e flutua DENTRO de um grupo parado no ponto do mundo:
  // girar o grupo de fora faria a flutuacao andar em circulo junto.
  const grupoNoMundo = new THREE.Group()
  grupoNoMundo.name = 'revolver-mundo'
  grupoNoMundo.position.set(REVOLVER_POS.x, REVOLVER_POS.y, REVOLVER_POS.z)

  const pivoChao = new THREE.Group()
  pivoChao.position.y = 0.58
  grupoNoMundo.add(pivoChao)
  pivoChao.add(modelo.grupo)

  // Mancha clara no chao: o beco e escuro e sem ela a arma some no asfalto.
  // Aditiva e sem escrita de profundidade, como todo brilho do jogo.
  const geoDisco = new THREE.CircleGeometry(0.42, 24)
  const matDisco = new THREE.MeshBasicMaterial({
    color: 0xffd9a0, transparent: true, opacity: 0.035,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const disco = new THREE.Mesh(geoDisco, matDisco)
  disco.rotation.x = -Math.PI / 2
  disco.position.y = 0.012
  disco.renderOrder = 1
  grupoNoMundo.add(disco)

  // --- suporte de quem esta equipado ------------------------------------------
  // O modelo vive aqui quando equipado, e o PAI muda com o modo de camera:
  //
  //  * 3a pessoa: filho de character.parts.handR, como o anel e a arma de
  //    portal — a arma acompanha a animacao do braco;
  //  * 1a pessoa: filho da CENA, com a matriz montada A MAO a partir da matriz
  //    da camera. E o unico jeito de a arma ficar colada na tela (canto de
  //    baixo, alca de mira no centro) SEM pendurar nada na camera: objeto
  //    filho de uma camera que nao esta na cena nunca entra na lista de
  //    desenho do renderer, e a arma simplesmente nao aparece. Pendurar a
  //    camera na cena resolveria tambem, mas seria mexer no grafo do jogo
  //    inteiro por causa de um item.
  const suporte = new THREE.Group()
  suporte.name = 'revolver-suporte'
  // Meia-volta so quando a arma esta presa a camera: o modelo aponta pra +Z
  // (convencao do jogo) e o "pra frente" da camera e -Z. Sem este grupo no
  // meio, ou a arma aponta pro proprio jogador, ou toda pose de mira teria
  // que carregar um Math.PI por dentro e ninguem entenderia mais os sinais.
  const orienta = new THREE.Group()
  orienta.name = 'revolver-orienta'
  suporte.add(orienta)
  let paiAtual = null

  // =========================================================================
  // 2. EFEITOS + LUZ
  // =========================================================================
  // Tudo que este modulo desenha na cena mora debaixo de um grupo so. Nao e
  // arrumacao: e o raycast do tiro que precisa disso, pra poder ignorar a
  // propria fumaca sem sair adivinhando quem e mesh de efeito.
  const efeitosRaiz = new THREE.Group()
  efeitosRaiz.name = 'revolver-efeitos'
  scene.add(efeitosRaiz)

  const fogo = criarFogoDeBoca(efeitosRaiz)
  const fumaca = criarFumaca(efeitosRaiz, 24)
  const faiscas = criarFaiscas(efeitosRaiz, 44)
  const furos = criarFuros(efeitosRaiz, 14)
  const capsulas = criarCapsulas(efeitosRaiz, 8)

  // Luz do tiro: UMA PointLight SEM SOMBRA, que nasce apagada e nunca some.
  // Sombra aqui custaria 6 passadas de render por quadro; e mexer em .visible
  // muda a contagem de luzes e faz o three RECOMPILAR todos os materiais da
  // cena (engasgo de varios quadros a cada disparo). Apagar e intensity = 0.
  const luzTiro = new THREE.PointLight(0xffc070, 0, 9, 2)
  luzTiro.castShadow = false
  scene.add(luzTiro)
  let luzT = 0

  // =========================================================================
  // 3. ESTADO
  // =========================================================================
  const camaras = new Array(CAPACIDADE).fill('bala')  // 'bala' | 'capsula'
  let indice = 0                 // camara alinhada com o cano
  let equipado = false
  let mirando = false
  let mirandoPeloMouse = false   // a mira veio do botao direito, nao de codigo
  let mira = 0                   // 0..1 suavizado (o quanto a arma esta na alca)
  let tempo = 0
  let esperaTiro = 0
  let recarga = -1               // -1 = nao esta recarregando; senao 0..RECARGA_DUR
  let balasNaRecarga = 0         // quantas ja entraram nesta recarga
  let coice = 0                  // 0..1, decai sozinho
  let coiceVel = 0
  let marteloAng = 0             // radianos (negativo = armado)
  let gatilhoAng = 0
  let tamborAng = 0              // giro atual do tambor
  let tamborAlvo = 0             // pra onde ele esta indo
  let balancoX = 0, balancoY = 0 // atraso da arma em relacao a mira (sway)
  let ultimoYaw = 0, ultimoPitch = 0
  let sensBase = null            // sensibilidade guardada enquanto mira
  let ultimoTiro = -1            // instante do ultimo disparo (trava clique duplo)

  // Quem quiser reagir ao tiro liga isto. Assinatura fixa:
  //   revolver.aoAcerto = ({ ponto, normal, objeto, distancia }) => {}
  let aoAcerto = null

  aplicarCamaras()

  // =========================================================================
  // 4. EQUIPAR / DESEQUIPAR
  // =========================================================================
  function equipar() {
    if (equipado) return
    equipado = true
    grupoNoMundo.visible = false
    if (modelo.grupo.parent) modelo.grupo.parent.remove(modelo.grupo)
    orienta.add(modelo.grupo)
    modelo.grupo.position.set(0, 0, 0)
    modelo.grupo.rotation.set(0, 0, 0)
    paiAtual = null                 // forca o reparent no primeiro quadro
    ultimoYaw = camera.rotation.y
    ultimoPitch = camera.rotation.x
    // a luz volta a ser so o clarao do tiro (ver atualizarLargado)
    luzTiro.intensity = 0
    luzTiro.distance = 9
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('revolver', false)
    }
    avisar('Revolver equipado. Esquerdo atira, direito mira, R recarrega.')
  }

  function desequipar() {
    if (!equipado) return
    equipado = false
    mirando = false
    mirandoPeloMouse = false
    soltarSensibilidade()
    cancelarRecarga()
    if (suporte.parent) suporte.parent.remove(suporte)
    paiAtual = null
    if (modelo.grupo.parent) modelo.grupo.parent.remove(modelo.grupo)
    pivoChao.add(modelo.grupo)
    modelo.grupo.position.set(0, 0, 0)
    modelo.grupo.rotation.set(0, 0, 0)
    modelo.mao.visible = false
    grupoNoMundo.visible = true
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('revolver', true)
    }
  }

  const interactable = {
    id: 'revolver',
    position: new THREE.Vector3(REVOLVER_POS.x, REVOLVER_POS.y + 0.58, REVOLVER_POS.z),
    radius: 2.1,
    label: 'Pegar o revolver',
    onInteract(game) {
      equipar()
      // o sistema de interacao COPIA os campos, entao desligar so vale por id
      const it = (game && game.interaction) || interaction
      if (it && typeof it.setEnabled === 'function') it.setEnabled('revolver', false)
      // se o main tiver um slot pra ele na barra, ja poe na mao
      const hb = game && game.hotbar
      if (hb && typeof hb.indiceDe === 'function') {
        const i = hb.indiceDe('revolver')
        if (i >= 0) { hb.marcarDisponivel(i, true); hb.selecionar(i) }
      }
    },
  }

  // =========================================================================
  // 5. CAMARAS DO TAMBOR
  // =========================================================================
  function aplicarCamaras() {
    for (let i = 0; i < CAPACIDADE; i++) modelo.definirCamara(i, camaras[i])
  }

  function contarBalas() {
    let n = 0
    for (let i = 0; i < CAPACIDADE; i++) if (camaras[i] === 'bala') n++
    return n
  }

  // =========================================================================
  // 6. ATIRAR
  // =========================================================================
  /**
   * Um clique. Devolve true se saiu tiro (false = clique seco, recarregando
   * ou arma guardada). O coice, o fogo e a fumaca sao locais e imediatos.
   */
  function atirar() {
    if (!equipado) return false
    // trava de clique duplo: o main pode escutar o mousedown E este modulo
    // tambem escuta o seu. Dois caminhos, um tiro so.
    if (ultimoTiro >= 0 && tempo - ultimoTiro < 0.05) return false
    if (recarga >= 0) return false
    if (esperaTiro > 0) return false

    esperaTiro = CADENCIA
    ultimoTiro = tempo
    // o martelo cai sempre, com bala ou sem: e o mesmo gesto
    marteloAng = -0.62
    gatilhoAng = 0.34

    if (camaras[indice] !== 'bala') {
      // CLIQUE SECO: so o martelo batendo em camara vazia.
      avancarCamara()
      if (contarBalas() === 0) avisar('Vazio. Aperte R pra recarregar.')
      return false
    }

    camaras[indice] = 'capsula'
    modelo.definirCamara(indice, 'capsula')

    // --- coice ---------------------------------------------------------------
    // Impulso na mola do coice; a volta e feita pela mola no atualizar(), o
    // que da o "sobe rapido, volta suave" que o pedido descreve.
    coiceVel += mirando ? 7.0 : 9.5
    darTrancoNaCamera(mirando ? 0.010 : 0.017)

    // --- fogo, fumaca e luz na boca do cano ----------------------------------
    bocaNoMundo(_p, _q)
    camera.getWorldDirection(_d)
    fogo.disparar(_p, _q, mirando ? 0.20 : 0.26, 0.075)
    fumaca.baforada(_p, _d, 6)
    faiscas.estourar(_p, _d, 5, 2.2)
    luzTiro.position.copy(_p)
    luzTiro.intensity = 26
    luzT = 0.07

    // --- o raio ---------------------------------------------------------------
    const info = tracarTiro()
    if (info) {
      furos.marcar(info.ponto, info.normal, 0.085 + Math.random() * 0.03)
      faiscas.estourar(info.ponto, info.normal, 9, 4.2)
      if (typeof aoAcerto === 'function') {
        try { aoAcerto(info) } catch (err) { console.warn('aoAcerto do revolver falhou:', err) }
      }
    }

    // --- o resto do mundo ------------------------------------------------------
    // O evento (quem, de onde, pra onde) e a unica coisa que viaja. Se o
    // servidor ainda nao conhece o tiro, ehLocal() cobre e ninguem espera nada.
    if (!ehLocal()) {
      try {
        rede.atirarRevolver(_p.x, _p.y, _p.z, _d.x, _d.y, _d.z,
          info ? info.ponto.x : 0, info ? info.ponto.y : 0, info ? info.ponto.z : 0, !!info)
      } catch (err) { void err }
    }

    avancarCamara()
    return true
  }

  /** Gira o tambor uma camara. E o mesmo gesto de armar o martelo. */
  function avancarCamara() {
    indice = (indice + 1) % CAPACIDADE
    tamborAlvo -= (Math.PI * 2) / CAPACIDADE
  }

  /** Posicao e orientacao da boca do cano no mundo. */
  function bocaNoMundo(posOut, quatOut) {
    modelo.grupo.updateWorldMatrix(true, false)
    posOut.copy(modelo.bocaLocal)
    modelo.grupo.localToWorld(posOut)
    modelo.grupo.getWorldQuaternion(quatOut)
    return posOut
  }

  // =========================================================================
  // 7. O RAIO
  // =========================================================================
  const raio = new THREE.Raycaster()
  raio.far = ALCANCE
  const acertos = []
  const alvos = []

  /** Raizes que o tiro NUNCA acerta: o proprio jogador, a arma e os efeitos. */
  function ehIgnorado(obj) {
    let o = obj
    while (o) {
      if (!o.visible) return true
      if (o === efeitosRaiz || o === suporte || o === grupoNoMundo) return true
      if (character && character.root && o === character.root) return true
      if (o.userData && o.userData.semTiro) return true
      o = o.parent
    }
    return false
  }

  /**
   * Raio saindo da CAMERA (nao da boca do cano). E de proposito: o jogador
   * mira com a tela, e um raio saindo do cano erraria pra esquerda tudo que
   * estivesse perto. O fogo sai do cano; a bala vai pra onde ele olha.
   */
  function tracarTiro() {
    camera.getWorldPosition(_o)
    camera.getWorldDirection(_d)
    raio.set(_o, _d)
    raio.far = ALCANCE

    alvos.length = 0
    for (const filho of scene.children) {
      if (filho === efeitosRaiz || filho === luzTiro || filho === grupoNoMundo) continue
      if (filho === suporte) continue
      if (character && character.root && filho === character.root) continue
      if (!filho.visible) continue
      if (filho.isLight || filho.isCamera) continue
      alvos.push(filho)
    }
    acertos.length = 0
    raio.intersectObjects(alvos, true, acertos)

    for (let i = 0; i < acertos.length; i++) {
      const h = acertos[i]
      if (ehIgnorado(h.object)) continue
      // normal em espaco do MUNDO; sem face (Points/Line) o furo encara quem atirou
      if (h.face) _n.copy(h.face.normal).transformDirection(h.object.matrixWorld)
      else _n.copy(_d).negate()
      if (_n.dot(_d) > 0) _n.negate()      // normal olhando pro outro lado
      return {
        ponto: h.point.clone(),
        normal: _n.clone(),
        objeto: h.object,
        distancia: h.distance,
      }
    }
    return null
  }

  // =========================================================================
  // 8. RECARGA
  // =========================================================================
  /**
   * Recarga coerente com o mecanismo: o tambor bascula pra esquerda, a estrela
   * extratora empurra as capsulas usadas pra fora (elas caem girando), entram
   * 6 balas novas uma a uma, o tambor fecha e da um giro de conferencia.
   * Durante tudo isso nao sai tiro.
   */
  function recarregar() {
    if (!equipado) return false
    if (recarga >= 0) return false
    if (contarBalas() === CAPACIDADE) return false   // ja esta cheio
    recarga = 0
    balasNaRecarga = 0
    mirando = false                                  // nao da pra mirar recarregando
    mirandoPeloMouse = false
    soltarSensibilidade()
    return true
  }

  function cancelarRecarga() {
    if (recarga < 0) return
    recarga = -1
    // Fecha e trava do jeito que o jogo espera encontrar: tambor fechado,
    // ejetor recolhido e as camaras coerentes com o que ficou carregado.
    modelo.pivoTambor.rotation.y = 0
    modelo.ejetor.position.z = 0
    aplicarCamaras()
  }

  function atualizarRecarga(dt) {
    if (recarga < 0) return
    const antes = recarga / RECARGA_DUR
    recarga += dt
    const k = Math.min(1, recarga / RECARGA_DUR)

    // --- abrir / fechar o tambor ----------------------------------------------
    let aberto = 0
    if (k < R_ABRIR) aberto = suave(k / R_ABRIR)
    else if (k < R_FECHAR) aberto = 1
    else if (k < 1) aberto = 1 - suave(Math.min(1, (k - R_FECHAR) / (1 - R_FECHAR) * 1.6))
    modelo.pivoTambor.rotation.y = aberto * ANGULO_ABERTO

    // --- estrela extratora ------------------------------------------------------
    if (k >= R_ABRIR && k < R_CARREGAR) {
      const e = (k - R_ABRIR) / (R_EJETAR - R_ABRIR)
      // vai ate o fim e volta: sin(pi*x) sobe e desce sem descontinuidade
      modelo.ejetor.position.z = -0.022 * Math.sin(Math.min(1, e) * Math.PI)
    } else {
      modelo.ejetor.position.z = 0
    }

    // --- ejetar as capsulas (uma vez so, na travessia do instante) --------------
    if (antes < R_EJETAR && k >= R_EJETAR) ejetarCapsulas()

    // --- entrar as balas, uma a uma ---------------------------------------------
    if (k >= R_EJETAR && k < R_FECHAR) {
      const passo = (k - R_EJETAR) / (R_CARREGAR - R_EJETAR)
      const querem = Math.min(CAPACIDADE, Math.floor(passo * CAPACIDADE) + 1)
      while (balasNaRecarga < querem) {
        // entra na ordem do tambor, nao numa ordem qualquer: da pra ver
        // cada latao aparecendo numa camara vizinha da anterior
        const i = (indice + balasNaRecarga) % CAPACIDADE
        camaras[i] = 'bala'
        modelo.definirCamara(i, 'bala')
        balasNaRecarga++
      }
    }

    // --- giro de conferencia ao fechar --------------------------------------------
    if (antes < R_FECHAR && k >= R_FECHAR) {
      tamborAlvo -= Math.PI * 2 * 1.5      // uma volta e meia, freando sozinho
    }

    if (k >= 1) {
      recarga = -1
      modelo.pivoTambor.rotation.y = 0
      modelo.ejetor.position.z = 0
      aplicarCamaras()
    }
  }

  function ejetarCapsulas() {
    modelo.tambor.updateWorldMatrix(true, false)
    const chao = chaoEm(player && player.position ? player.position.x : 0,
      player && player.position ? player.position.z : 0)
    for (let i = 0; i < CAPACIDADE; i++) {
      if (camaras[i] !== 'capsula') continue
      const c = modelo.camaras[i]
      c.grupo.getWorldPosition(_p)
      // pra tras da arma e pra fora (esquerda), que e pra onde a estrela joga
      _v.set(0, 0, -1).applyQuaternion(modelo.grupo.getWorldQuaternion(_q))
      _v.multiplyScalar(1.1 + Math.random() * 0.6)
      _v.x += (Math.random() - 0.5) * 0.9
      _v.y += 0.6 + Math.random() * 0.7
      _v.z += (Math.random() - 0.5) * 0.9
      capsulas.ejetar(_p, _v, chao)
    }
    // Tudo fica VAZIO aqui de proposito: as balas novas entram uma a uma na
    // fase seguinte, e ate la `balas` tem que contar zero — quem le o contador
    // (HUD, IA) nao pode ver 6 antes de a primeira entrar na camara.
    for (let i = 0; i < CAPACIDADE; i++) {
      camaras[i] = 'vazia'
      modelo.definirCamara(i, 'vazia')
    }
    balasNaRecarga = 0
  }

  // =========================================================================
  // 9. MIRA, SENSIBILIDADE E TRANCO
  // =========================================================================
  /**
   * Mirando, o mouse fica mais lento. A sensibilidade e uma constante de
   * config.js lida direto pelo controller a cada quadro, e config.js nao e
   * arquivo deste modulo — entao o jeito de mexer nela sem tocar em outro
   * arquivo e trocar o valor e DEVOLVER depois. Guardamos o original pra
   * nunca deixar o jogo com o mouse lento por acidente.
   */
  function prenderSensibilidade() {
    if (sensBase !== null) return
    sensBase = PLAYER.MOUSE_SENSITIVITY
    PLAYER.MOUSE_SENSITIVITY = sensBase * SENS_MIRA
  }
  function soltarSensibilidade() {
    if (sensBase === null) return
    PLAYER.MOUSE_SENSITIVITY = sensBase
    sensBase = null
  }

  // Tranco de camera do coice. Vai DIRETO na rotacao da camera porque este
  // atualizar() ja roda depois de player.update(dt) — quem escreve por ultimo
  // e quem manda. Nao usamos o campo `tremor` do anel/portal justamente pra
  // nao depender de o main lembrar de somar mais um.
  let trancoX = 0, trancoVel = 0
  function darTrancoNaCamera(f) { trancoVel -= f * 42 }

  // =========================================================================
  // 10. MOUSE E TECLADO
  // =========================================================================
  // core/input.js nao expoe botao de mouse e nao e arquivo deste modulo, entao
  // a arma escuta os proprios eventos — o mesmo caminho que o anel usa. So age
  // com o ponteiro TRAVADO, que e como o jogo sabe que esta em modo de jogo.
  function jogando() {
    return equipado && typeof document !== 'undefined' && !!document.pointerLockElement
  }

  function onMouseDown(e) {
    if (!jogando()) return
    if (e.button === 0) { e.preventDefault(); atirar() }
    else if (e.button === 2) {
      e.preventDefault()
      mirandoPeloMouse = true
      mirando = recarga < 0
    }
  }
  function onMouseUp(e) { if (e.button === 2) { mirandoPeloMouse = false; mirando = false } }
  function onContextMenu(e) { if (jogando()) e.preventDefault() }
  function onKeyDown(e) {
    if (!jogando()) return
    if (e.code === 'KeyR') { e.preventDefault(); recarregar() }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown)
  }

  // =========================================================================
  // 11. EVENTOS DE REDE
  // =========================================================================
  /**
   * 'revolver-tiro' { dono, x, y, z, dx, dy, dz, acertou, ax, ay, az }
   * O tiro dos OUTROS: so o desenho. O nome do tipo e normalizado e um evento
   * que nao seja meu-nao-conhecido e ignorado sem reclamar, como manda o
   * contrato. Meu proprio evento voltando NAO desenha de novo (ja desenhei).
   */
  function aoEventoDeRede(ev) {
    if (!ev) return
    const tipo = String(ev.tipo || ev.t || ev.nome || '').toLowerCase().replace(/[^a-z]/g, '')
    if (tipo !== 'revolvertiro') return
    const dono = (ev.dono !== undefined ? ev.dono : 0) | 0
    if (dono && dono === meuId()) return

    _p.set(Number(ev.x) || 0, Number(ev.y) || 0, Number(ev.z) || 0)
    _d.set(Number(ev.dx) || 0, Number(ev.dy) || 0, Number(ev.dz) || -1)
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, -1)
    _d.normalize()

    // o clarao do outro nasce solto no mundo (nao esta preso a arma dele)
    _q.setFromUnitVectors(EIXO_Z, _d)
    fogo.disparar(_p, _q, 0.3, 0.075)
    fumaca.baforada(_p, _d, 5)
    faiscas.estourar(_p, _d, 4, 2.4)
    luzTiro.position.copy(_p)
    luzTiro.intensity = 22
    luzT = 0.07

    if (ev.acertou) {
      _v.set(Number(ev.ax) || 0, Number(ev.ay) || 0, Number(ev.az) || 0)
      _n.copy(_d).negate()
      furos.marcar(_v, _n, 0.09)
      faiscas.estourar(_v, _n, 8, 4)
    }
  }

  // =========================================================================
  // 12. QUADRO
  // =========================================================================
  function atualizarLargado(dt) {
    pivoChao.rotation.y += dt * 0.8
    pivoChao.position.y = 0.58 + Math.sin(tempo * 1.3) * 0.045
    modelo.grupo.rotation.z = 0.20 + Math.sin(tempo * 0.9) * 0.06
    modelo.grupo.rotation.x = -0.10
    matDisco.opacity = 0.020 + Math.sin(tempo * 2.2) * 0.008
    // A MESMA PointLight do tiro faz o farolete da arma largada. As duas
    // coisas nunca acontecem juntas (pra atirar tem que estar equipada), e
    // uma segunda luz so pra isto sairia caro: o beco ja e o canto mais
    // escuro do mapa e trocar a contagem de luzes recompila a cena inteira.
    // A luz fica ACIMA da arma, nao dentro dela: com decaimento quadratico,
    // uma PointLight colada no mesh transforma a arma numa lampada.
    luzTiro.position.set(REVOLVER_POS.x, REVOLVER_POS.y + 1.00, REVOLVER_POS.z)
    luzTiro.distance = 3.4
    luzTiro.intensity = 1.15 + Math.sin(tempo * 2.2) * 0.22
  }

  /** Troca o pai do suporte quando o modo de camera muda. */
  function conferirPai() {
    const primeira = !player || player.mode === 'first'
    const alvo = primeira ? scene : ((character && character.parts && character.parts.handR) || scene)
    if (alvo === paiAtual) return
    if (suporte.parent) suporte.parent.remove(suporte)
    alvo.add(suporte)
    paiAtual = alvo
    orienta.rotation.y = primeira ? Math.PI : 0
    modelo.mao.visible = primeira
    // Na cena, a matriz do suporte e montada a mao a cada quadro (ver
    // colarNaCamera); deixar o three refaze-la a partir de position/rotation
    // desfaria a composicao com a matriz da camera.
    suporte.matrixAutoUpdate = !primeira
    // Colada na tela, a sombra da arma cairia no mundo vinda do nada. Na mao
    // de verdade ela e legitima, entao a sombra volta.
    modelo.grupo.traverse((o) => { if (o.isMesh) o.castShadow = !primeira })
    if (!primeira) {
      suporte.position.copy(POSE_MAO.pos)
      suporte.rotation.copy(POSE_MAO.rot)
    }
  }

  /**
   * Transforma a pose (escrita em position/rotation, em ESPACO DA CAMERA) na
   * matriz de mundo do suporte: matriz da camera x matriz da pose.
   */
  function colarNaCamera() {
    camera.updateMatrixWorld(true)
    suporte.updateMatrix()                    // pose -> suporte.matrix
    _mPose.copy(suporte.matrix)
    suporte.matrix.multiplyMatrices(camera.matrixWorld, _mPose)
    suporte.matrixWorldNeedsUpdate = true
  }

  function atualizarPose(dt) {
    const primeira = !player || player.mode === 'first'
    if (!primeira) return          // na mao de verdade a pose e a do braco

    // --- balanco (a arma corre atras da mira) ---------------------------------
    let dy = camera.rotation.y - ultimoYaw
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2
    const dx = camera.rotation.x - ultimoPitch
    ultimoYaw = camera.rotation.y
    ultimoPitch = camera.rotation.x
    const forcaBal = (1 - mira * 0.72)
    balancoY = damp(balancoY + dy * 1.6 * forcaBal, 0, 9, dt)
    balancoX = damp(balancoX + dx * 1.6 * forcaBal, 0, 9, dt)
    balancoY = Math.max(-0.16, Math.min(0.16, balancoY))
    balancoX = Math.max(-0.16, Math.min(0.16, balancoX))

    // --- passo (sobe e desce com a caminhada) ---------------------------------
    const vel = (player && player.speed) || 0
    const anda = Math.min(1, vel / 3.2) * (1 - mira * 0.8)
    const fase = tempo * Math.max(2, vel * 2.6)
    const passoY = Math.sin(fase * 2) * 0.011 * anda
    const passoX = Math.sin(fase) * 0.014 * anda

    // --- interpola quadril <-> alca de mira -----------------------------------
    const m = suave(mira)
    suporte.position.lerpVectors(POSE_QUADRIL.pos, POSE_MIRA.pos, m)
    suporte.position.x += passoX + balancoY * 0.30
    suporte.position.y += passoY - balancoX * 0.22
    suporte.rotation.set(
      POSE_QUADRIL.rot.x + (POSE_MIRA.rot.x - POSE_QUADRIL.rot.x) * m + balancoX * 0.5,
      POSE_QUADRIL.rot.y + (POSE_MIRA.rot.y - POSE_QUADRIL.rot.y) * m + balancoY * 0.5,
      POSE_QUADRIL.rot.z + (POSE_MIRA.rot.z - POSE_QUADRIL.rot.z) * m - balancoY * 0.25,
    )

    // Recarregando, a arma vem pro meio da tela e vira um pouco: e a unica
    // forma de o jogador ver o tambor abrir, as capsulas cairem e as balas
    // entrarem — no canto ele so veria metade do gesto.
    const j = fatorRecarga()
    if (j > 0) {
      suporte.position.x -= j * 0.105
      suporte.position.y += j * 0.028
      suporte.position.z += j * 0.035
      suporte.rotation.y += j * 0.40
      suporte.rotation.x += j * 0.10
    }
    colarNaCamera()
  }

  /**
   * 0 fora da recarga, 1 com o tambor aberto, e sobe/desce junto com ele.
   * Serve pra pose (trazer a arma pro meio da tela) e pro tombo — as duas
   * TEM que andar coladas, senao a arma tomba antes de entrar no quadro.
   */
  function fatorRecarga() {
    if (recarga < 0) return 0
    const k = Math.min(1, recarga / RECARGA_DUR)
    if (k < R_ABRIR) return suave(k / R_ABRIR)
    if (k < R_FECHAR) return 1
    return 1 - suave(Math.min(1, ((k - R_FECHAR) / (1 - R_FECHAR)) * 1.6))
  }

  function atualizarCoice(dt) {
    // mola amortecida: sobe num quadro e volta suave, sem passar do ponto
    coiceVel += (-coice * 190 - coiceVel * 19) * dt
    coice += coiceVel * dt
    if (coice < 0 && coiceVel > -0.001) { coice = 0; coiceVel = 0 }

    // Na recarga a arma rola pro lado do tambor. 0.62 rad e o limite util:
    // mais que isso e o antebraco postico entra no quadro girando junto.
    const j = fatorRecarga()
    const tombo = j * 0.62

    modelo.grupo.rotation.set(-coice * 0.42, tombo * 0.34, tombo)
    modelo.grupo.position.set(-tombo * 0.02, j * 0.035, -coice * 0.055 - j * 0.045)
  }

  function atualizarMecanismo(dt) {
    // martelo e gatilho voltam sozinhos pro repouso
    marteloAng = damp(marteloAng, 0, 26, dt)
    gatilhoAng = damp(gatilhoAng, 0, 22, dt)
    modelo.martelo.rotation.x = marteloAng
    modelo.gatilho.rotation.x = gatilhoAng
    // o tambor persegue o alvo: gira rapido e para no lugar
    tamborAng = damp(tamborAng, tamborAlvo, 14, dt)
    modelo.tambor.rotation.z = tamborAng
  }

  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1
    tempo += dt
    if (esperaTiro > 0) esperaTiro = Math.max(0, esperaTiro - dt)

    if (!equipado) {
      atualizarLargado(dt)
    } else {
      conferirPai()
      atualizarRecarga(dt)

      // Ponteiro destravado (menu, Alt+Tab) nao devolve mouseup: sem esta
      // linha o jogador voltaria pro jogo mirando pra sempre, e com a
      // sensibilidade do mouse pela metade. So vale pra mira que veio do
      // BOTAO — quem setou revolver.mirando por codigo continua mandando.
      if (mirandoPeloMouse && typeof document !== 'undefined' && !document.pointerLockElement) {
        mirandoPeloMouse = false
        mirando = false
      }

      // --- mira ---------------------------------------------------------------
      const querMirar = mirando && recarga < 0
      mira = damp(mira, querMirar ? 1 : 0, 13, dt)
      if (mira < 0.002) mira = 0
      if (querMirar) prenderSensibilidade(); else soltarSensibilidade()

      // FOV: escrito DEPOIS do controller, que e quem manda no resto do tempo.
      // Ao largar a mira paramos de escrever e o controller retoma sozinho.
      if (mira > 0.002) {
        const base = (player && player.mode === 'first') ? CAMERA.FOV_FP : CAMERA.FOV_TP
        camera.fov = base - FOV_MIRA * suave(mira)
        camera.updateProjectionMatrix()
      }
      // com a alca de mira na cara, a mira da tela so atrapalha
      if (hud && typeof hud.setCrosshair === 'function' && player && player.mode === 'first') {
        hud.setCrosshair(mira < 0.5)
      }

      atualizarPose(dt)
      atualizarCoice(dt)
      atualizarMecanismo(dt)

      // tranco do coice somado na camera (mola igual a do coice)
      trancoVel += (-trancoX * 200 - trancoVel * 21) * dt
      trancoX += trancoVel * dt
      if (Math.abs(trancoX) > 1e-5) camera.rotation.x += trancoX
    }

    // --- efeitos (rodam sempre: fumaca e capsula sobrevivem ao desequipar) ----
    // So mexe na luz quando ha clarao: largada, quem manda nela e o
    // atualizarLargado la em cima.
    if (luzT > 0) {
      luzT = Math.max(0, luzT - dt)
      // cai em rampa: 1 ou 2 quadros de luz, como manda o orcamento
      luzTiro.intensity = 26 * (luzT / 0.07)
      if (luzT === 0) luzTiro.intensity = equipado ? 0 : 1.15
    }
    fogo.atualizar(dt, camera)
    fumaca.atualizar(dt, camera)
    faiscas.atualizar(dt, camera)
    furos.atualizar(dt)
    capsulas.atualizar(dt)
  }

  // =========================================================================
  // 13. LIMPEZA
  // =========================================================================
  function dispose() {
    soltarSensibilidade()
    if (typeof window !== 'undefined') {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown)
    }
    fogo.dispose(); fumaca.dispose(); faiscas.dispose()
    furos.dispose(); capsulas.dispose()
    scene.remove(efeitosRaiz)
    scene.remove(luzTiro)
    if (suporte.parent) suporte.parent.remove(suporte)
    modelo.dispose()
    geoDisco.dispose(); matDisco.dispose()
    if (grupoNoMundo.parent) grupoNoMundo.parent.remove(grupoNoMundo)
  }

  return {
    grupoNoMundo,
    interactable,
    equipar,
    desequipar,
    atirar,
    recarregar,
    atualizar,
    aoEventoDeRede,
    dispose,
    modelo,
    get equipado() { return equipado },
    get mirando() { return mirando && recarga < 0 },
    set mirando(v) { mirando = !!v && recarga < 0 },
    get balas() { return contarBalas() },
    get capacidade() { return CAPACIDADE },
    get recarregando() { return recarga >= 0 },
    get aoAcerto() { return aoAcerto },
    set aoAcerto(fn) { aoAcerto = typeof fn === 'function' ? fn : null },
  }
}

// ---------------------------------------------------------------------------
// SUPOSICOES sobre os outros modulos:
//
//   character.parts.handR    mao direita (3a pessoa)
//   player.mode              'first' | 'third'
//   player.speed             velocidade, so pro balanco do passo
//   collision                nao e usado hoje; fica na assinatura porque o
//                            contrato do jogo passa ele pra todo sistema
//   rede.atirarRevolver(...) opcional; sem ele o modulo entra em modo local
//
// O main deve:
//   - adicionar revolver.grupoNoMundo na cena e registrar o interactable;
//   - chamar revolver.atualizar(dt) DEPOIS de player.update(dt);
//   - opcionalmente ligar revolver.aoAcerto pra quem for levar tiro reagir.
//
// Clique, botao direito e R sao escutados pelo proprio modulo (com o ponteiro
// travado), entao a arma ja funciona sem nenhuma linha no main alem dessas.
// ---------------------------------------------------------------------------
