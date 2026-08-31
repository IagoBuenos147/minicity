import * as THREE from 'three'
import { punhoEmVolta } from './mao.js'
import { skinOf } from './appearance.js'
import { copoDe } from '../mobilia/copos.js'

// ---------------------------------------------------------------------------
// src/player/copo.js — O COPO NA MAO, E O QUE SE FAZ COM ELE.
//
// POR QUE ISTO NAO E player/mao.js. Aquele modulo SEGURA o que vier — e o que
// ele faz, e faz bem: saque, balanco na fase da camera, pose de corrida, sway
// atras da mira. Um copo tambem e segurado assim, mas um copo tem uma coisa que
// garrafa nenhuma tem: ELE SE USA. Ele estica pra receber, ele enche, ele
// levanta ate a boca, ele esvazia e volta a esticar. Isso e uma maquina de
// estados com quatro poses e um nivel, e enfiar isso dentro da mao generica
// obrigaria a mao generica a saber o que e chope.
//
// (E o mesmo desenho que ja existe duas vezes no jogo: armas/revolver.js nao
// passa pela mao porque tem mira, coice e tambor; a mao nasceu copiando a
// mecanica de camera do revolver. Este e o terceiro, e a mecanica de camera e a
// mesma dos dois — matriz montada a mao, troca de pai por modo de camera.)
//
// A MAQUINA DE ESTADOS, que e o arquivo inteiro:
//
//   ocioso ---clique (copo vazio)---> estendido
//   estendido ---clique----------> ocioso            (abaixa sem receber nada)
//   estendido ---encher() ate 1---> ocioso           (com o copo cheio)
//   ocioso (cheio) ---clique-----> bebendo -> ocioso (um gole a menos)
//   ...ate zerar, e ai o clique volta a esticar a mao.
//
// UMA DECISAO QUE NAO E OBVIA: A MIRA. Quando o jogador estica o copo embaixo de
// uma torneira aberta, o copo esta COLADO NA CAMERA e a torneira esta no MUNDO,
// a um metro e vinte. Sem mais nada, o jorro cai a um metro de distancia e o
// copo fica na frente dele, sem relacao nenhuma — e a leitura vira "o chope
// atravessa o copo". mirar() resolve pondo o copo NO ESPACO DE CAMERA DO BICO:
// o alvo da pose deixa de ser um numero fixo e passa a ser "onde o bico esta na
// tela, um palmo abaixo". Ai o jorro cai DENTRO do copo, e e o mesmo jorro.
// ---------------------------------------------------------------------------

// --- poses, em ESPACO DA CAMERA ---------------------------------------------
// -Z e pra frente, +X a direita da tela, +Y pra cima. As mesmas convencoes de
// player/mao.js, inclusive a meia-volta do grupo `orienta`.

// As quatro poses vieram PRA PERTO junto com as de player/mao.js (ver o
// comentario la): sem braco, o que ancora a mao no jogador e a proximidade.
const POSE_OCIOSA = {
  pos: new THREE.Vector3(0.226, -0.254, -0.382),
  rot: new THREE.Euler(0.10, -0.38, 0.16),
}
const POSE_CORRER = {
  pos: new THREE.Vector3(0.268, -0.372, -0.322),
  rot: new THREE.Euler(0.52, -0.66, 0.42),
}
// ESTENDIDA: a mao sai pra frente e ANDA PRO CENTRO da tela. O copo tem que
// ficar debaixo da mira, senao o jogador nao acredita que ele vai receber ali.
const POSE_ESTENDIDA = {
  // SERVIR: sai pra frente mas nao tanto quanto antes — o copo tem que ficar
  // debaixo da mira sem a mao virar um ponto distante no meio da tela.
  pos: new THREE.Vector3(0.112, -0.186, -0.492),
  rot: new THREE.Euler(-0.06, -0.16, 0.02),
}
// NA BOCA: o copo sobe, vem pro centro e INCLINA PRA TRAS (rot.x positivo joga
// a boca do copo na direcao do rosto). Fica baixo na tela de proposito: o copo
// na altura dos olhos taparia a tela inteira.
const POSE_BOCA = {
  // BEBER: ja era a mais perta das quatro; encurtou o suficiente pra ficar
  // coerente com as outras tres, sem o copo tapar a tela.
  pos: new THREE.Vector3(0.048, -0.142, -0.232),
  rot: new THREE.Euler(0.62, -0.05, -0.10),
}

// --- constantes de sensacao --------------------------------------------------
const AMP_BOB_ANDAR = 0.014
const AMP_BOB_CORRER = 0.036
const LAMBDA_SAQUE = 11        // subir/descer o copo na tela
const LAMBDA_POSE = 13         // trocar de pose (ociosa <-> estendida)
const LAMBDA_CORRIDA = 3.2
const LAMBDA_SWAY = 9
const MAX_SWAY = 0.16
const DUR_GOLE = 0.92          // levantar + beber + descer
const DIST_MIRA_MIN = 0.40     // o copo nunca encosta na lente
const DIST_MIRA_MAX = 0.78     // nem foge pro fundo da tela

const _mPose = new THREE.Matrix4()
const _euler = new THREE.Euler()
const _pMira = new THREE.Vector3()
const _pAlvo = new THREE.Vector3()

function damp(cur, alvo, lambda, dt) { return cur + (alvo - cur) * (1 - Math.exp(-lambda * dt)) }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function suave(k) { return k * k * (3 - 2 * k) }

// A MAO E A MESMA DE player/mao.js — ver punhoEmVolta la.
//
// Aqui havia um punho PROPRIO, de capsulas: dorso de caixa, quatro capsulas
// retas de dedo, uma esfera por no e um antebraco de 62 cm. Era a mesma
// construcao que o dono reprovou do outro lado ("os dedos estao horriveis"), e
// duas maos separadas garantiam que consertar uma deixasse a outra pra tras —
// que foi o que aconteceu.
//
// O argumento que separava os dois modulos continua valendo e nao mudou: este
// arquivo e uma MAQUINA DE ESTADOS (ocioso -> esticado -> cheio -> bebendo) com
// nivel de liquido e colarinho, e aquele e um modulo que SEGURA o que vier. O
// que se compartilha e so a GEOMETRIA da mao, que nao tem estado nenhum.
//
// O antebraco tambem sumiu, e com ele o comentario dos 62 cm: nao ha mais braco
// em lugar nenhum (pedido do dono), entao o problema do "toco azul de pe na
// frente da torneira" deixou de existir junto com a peca que o causava.

/**
 * @param dep.scene      a cena (o suporte mora nela em 1a pessoa)
 * @param dep.camera     a camera do jogo
 * @param dep.player     o controller (mode, speed, grounded, bobPhase, bobAmt)
 * @param dep.character  o boneco (pra pendurar na mao em 3a pessoa)
 * @param dep.aparencia  de onde sai a cor da pele
 * @param dep.hud        opcional: o toast do primeiro gole
 */
export function criarCopo({ scene, camera, player, character, aparencia, hud } = {}) {
  const pele = skinOf(aparencia || null)

  const suporte = new THREE.Group()
  suporte.name = 'copo-suporte'
  const orienta = new THREE.Group()
  orienta.name = 'copo-orienta'
  suporte.add(orienta)
  const berco = new THREE.Group()     // desce a peca por pegaY: a pose e da PEGA
  berco.name = 'copo-berco'
  orienta.add(berco)

  let paiAtual = null
  let atual = null                    // { id, ficha, grupo, punho, pegaY, copo }
  const cache = new Map()

  // --- estado de animacao ---------------------------------------------------
  let k = 0, alvoK = 0                // saque: 0 fora de cena, 1 na mao
  let corrida = 0
  let swayX = 0, swayY = 0
  let ultimoYaw = 0, ultimoPitch = 0
  let tempo = 0
  let saque = 0
  let quique = 0
  let noChao = true
  let visivel = false

  // --- estado do COPO -------------------------------------------------------
  let nivel = 0                       // 0 a 1
  let corBebida = 0xd8901c
  let espumaK = 0
  let nomeBebida = ''
  let estendido = false
  let estender = 0                    // rampa 0..1 pra POSE_ESTENDIDA
  let bebendo = 0                     // 0..1 ao longo de DUR_GOLE
  let goleDe = 0, goleAte = 0         // nivel no inicio e no fim do gole
  let mira = null                     // Vector3 de mundo, ou null
  let miraK = 0                       // quanto a pose ja obedece a mira
  let encheu = false                  // pra o toast de "copo cheio" sair uma vez
  let jaBebeu = false

  function montar(id, ficha) {
    const achado = cache.get(id)
    if (achado) return achado
    const grupo = new THREE.Group()
    grupo.name = 'copo-item:' + id
    let peca = null
    try { peca = typeof ficha.build === 'function' ? ficha.build() : null } catch (err) { void err; peca = null }
    if (!peca) return null
    grupo.add(peca)

    const m = ficha.mao || {}
    let pegaY = Number(m.pegaY)
    let raio = Number(m.pegaR)
    if (!Number.isFinite(pegaY) || !Number.isFinite(raio)) {
      const caixa = new THREE.Box3().setFromObject(peca)
      const alt = Math.max(0.02, caixa.max.y - caixa.min.y)
      if (!Number.isFinite(pegaY)) pegaY = alt * 0.45
      if (!Number.isFinite(raio)) {
        raio = Math.max(0.018, Math.max(caixa.max.x - caixa.min.x, caixa.max.z - caixa.min.z) * 0.5)
      }
    }
    const p = punhoEmVolta(raio, pele)
    p.position.y = pegaY
    grupo.add(p)
    grupo.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })

    const reg = {
      grupo, punho: p, pegaY, peca,
      setNivel: (peca.userData && peca.userData.setNivel) || null,
      // as bolhas do chope sobem sozinhas, mas alguem tem que passar o dt
      animarBebida: (peca.userData && peca.userData.animarBebida) || null,
      copo: ficha.copo || { goles: 3, espuma: 0.4, encheEm: 2 },
    }
    cache.set(id, reg)
    return reg
  }

  function conferirPai() {
    const primeira = !player || player.mode === 'first'
    const alvo = primeira ? scene : ((character && character.parts && character.parts.handR) || scene)
    if (alvo === paiAtual) return
    if (suporte.parent) suporte.parent.remove(suporte)
    alvo.add(suporte)
    paiAtual = alvo
    orienta.rotation.y = primeira ? Math.PI : 0
    if (atual && atual.punho) atual.punho.visible = primeira
    if (atual) atual.grupo.traverse((o) => { if (o.isMesh) o.castShadow = !primeira })
    suporte.matrixAutoUpdate = !primeira
    if (!primeira) {
      suporte.position.set(0.010, -0.030, 0.052)
      suporte.rotation.set(-0.22, 0, 0.10)
    }
  }

  function colarNaCamera() {
    camera.updateMatrixWorld(true)
    suporte.updateMatrix()
    _mPose.copy(suporte.matrix)
    suporte.matrix.multiplyMatrices(camera.matrixWorld, _mPose)
    suporte.matrixWorldNeedsUpdate = true
  }

  function mostrar(v) {
    if (visivel === v) return
    visivel = v
    suporte.visible = v
  }

  function pintarNivel() {
    if (atual && atual.setNivel) atual.setNivel(nivel, corBebida, nivel > 0.02 ? espumaK : 0)
  }

  const api = {
    /**
     * As quatro poses, VIVAS, pra afinar com o copo na tela:
     *
     *   __game.copo.poses.ociosa.pos.set(0.0, -0.03, -0.22)
     *
     * Mesma porta que player/mao.js abre, e pela mesma razao: o que estes
     * numeros produzem depende do FOV, da altura dos olhos e do tamanho do copo
     * ao mesmo tempo, e nao da pra prever nenhum deles lendo o codigo. Sem ela,
     * conferir o COLARINHO de perto era impossivel — a pose de jogo deixa o copo
     * com uns 120 px, e espuma nesse tamanho e um risco branco.
     */
    poses: {
      ociosa: POSE_OCIOSA, correr: POSE_CORRER,
      estendida: POSE_ESTENDIDA, boca: POSE_BOCA,
    },

    get id() { return atual ? atual.id : null },
    get segurando() { return !!atual },
    get ficha() { return atual ? atual.ficha : null },
    get nivel() { return nivel },
    get cheio() { return nivel >= 0.985 },
    get vazio() { return nivel <= 0.015 },
    get estendido() { return estendido && !bebendo },
    get bebendo() { return bebendo > 0 },
    get bebida() { return nomeBebida },
    /** Quantos segundos embaixo da torneira este copo pede pra encher. */
    get encheEm() { return (atual && atual.copo && atual.copo.encheEm) || 2 },

    /**
     * Poe um copo na mao. Chamar com o mesmo id nao faz nada — sem essa guarda,
     * segurar a tecla da vaga refaz o saque a cada quadro.
     *
     * O NIVEL SOBREVIVE A TROCA DE VAGA: guardar o copo cheio na mochila e
     * tira-lo de novo nao pode derramar o chope que o jogador acabou de tirar.
     * (Ele NAO sobrevive a troca de COPO: cada copo tem o nivel dele.)
     */
    segurar(id, ficha) {
      const f = ficha || copoDe(id)
      if (!id || !f) return false
      if (atual && atual.id === id && alvoK === 1) return true
      const reg = montar(id, f)
      if (!reg) return false

      if (atual && atual.id !== id) { nivel = 0; espumaK = 0; nomeBebida = '' }
      if (atual && atual.grupo.parent) berco.remove(atual.grupo)
      berco.add(reg.grupo)
      berco.position.y = -reg.pegaY
      atual = {
        id, ficha: f, grupo: reg.grupo, punho: reg.punho,
        pegaY: reg.pegaY, setNivel: reg.setNivel, animarBebida: reg.animarBebida,
        copo: reg.copo,
      }
      pintarNivel()

      paiAtual = null
      conferirPai()
      mostrar(true)
      alvoK = 1
      saque = 1
      estendido = false
      bebendo = 0
      ultimoYaw = camera.rotation.y
      ultimoPitch = camera.rotation.x
      return true
    },

    /** Guarda o copo (ele desce pra fora do quadro antes de sumir). */
    largar() {
      if (!atual) return
      alvoK = 0
      estendido = false
      bebendo = 0
      mira = null
    },

    esconderJa() {
      alvoK = 0; k = 0; saque = 0; estendido = false; bebendo = 0; mira = null
      mostrar(false)
      if (atual && atual.grupo.parent) berco.remove(atual.grupo)
      atual = null
    },

    /**
     * O CLIQUE. Um botao so, e e ele que faz o ciclo inteiro do cabecalho.
     * Devolve o que aconteceu, pra quem chamou poder responder (o main so
     * precisa saber que alguma coisa aconteceu; a adega usa pra o toast).
     */
    usar() {
      if (!atual || alvoK === 0) return null
      if (bebendo > 0) return null                 // no meio do gole, o clique espera
      if (nivel > 0.02) {
        const goles = Math.max(1, (atual.copo && atual.copo.goles) || 3)
        goleDe = nivel
        goleAte = Math.max(0, nivel - 1 / goles - 0.0001)
        if (goleAte < 0.04) goleAte = 0            // o ultimo gole limpa o copo
        bebendo = 0.0001
        estendido = false
        if (!jaBebeu && hud && hud.toast) {
          jaBebeu = true
          hud.toast('Clique de novo pra beber. Copo vazio, a mao estica pra encher.')
        }
        return 'bebeu'
      }
      estendido = !estendido
      if (!estendido) mira = null
      return estendido ? 'estendeu' : 'recolheu'
    },

    /**
     * ENCHE. Quem chama e quem tem a torneira (world/adega.js), todo quadro em
     * que o copo esticado esta debaixo do jorro.
     *
     * `dt` e o quadro; o resto e a bebida. Devolve true enquanto ainda cabe.
     */
    encher(dt, cor, espuma, nome) {
      if (!atual || !estendido || bebendo > 0) return false
      if (typeof cor === 'number') corBebida = cor
      if (typeof espuma === 'number') espumaK = espuma
      if (typeof nome === 'string') nomeBebida = nome
      const seg = Math.max(0.3, (atual.copo && atual.copo.encheEm) || 2)
      nivel = Math.min(1, nivel + (dt || 0) / seg)
      pintarNivel()
      if (nivel >= 0.999) {
        // Cheio: a mao volta sozinha. Continuar esticado embaixo do jorro so
        // faria o jogador ver o chope atravessar a borda.
        estendido = false
        mira = null
        if (!encheu && hud && hud.toast) {
          encheu = true
          hud.toast('Copo cheio. Clique pra beber.')
        }
        return false
      }
      return true
    },

    /**
     * ONDE O COPO DEVE FICAR NA TELA enquanto esta esticado. Ver o cabecalho:
     * e isto que faz o jorro cair DENTRO do copo. `null` solta a mira.
     */
    mirar(ponto) {
      if (!ponto) { mira = null; return }
      mira = _pMira.copy(ponto)
    },

    /** Esvazia sem beber (derramou, trocou de bebida). */
    despejar() {
      nivel = 0
      espumaK = 0
      nomeBebida = ''
      pintarNivel()
    },

    mostrar(v) { if (atual) mostrar(!!v) },

    atualizar(dt) {
      // O GAS DO CHOPE. Fica aqui, e nao dentro do setNivel, porque nivel muda
      // quando alguem bebe e bolha sobe o tempo todo — sao dois relogios.
      if (atual && atual.animarBebida) atual.animarBebida(dt)
      if (!atual && k <= 0.001) { mostrar(false); return }
      const d = Math.min(dt || 0, 0.05)
      tempo += d
      conferirPai()

      k = damp(k, alvoK, LAMBDA_SAQUE, d)
      saque = damp(saque, 0, 7.5, d)
      if (alvoK === 0 && k < 0.02) {
        if (atual && atual.grupo.parent) berco.remove(atual.grupo)
        atual = null
        mostrar(false)
        return
      }

      // --- O GOLE. Roda mesmo em 3a pessoa: o nivel do copo e do JOGO, nao da
      // pose. Sem isso, beber de costas pra camera nao esvaziaria nada.
      if (bebendo > 0) {
        bebendo = Math.min(1, bebendo + d / DUR_GOLE)
        // o liquido so desce na parte do meio do gesto (0.30 a 0.62), que e
        // quando o copo esta de fato na boca
        const b = clamp01((bebendo - 0.30) / 0.32)
        nivel = goleDe + (goleAte - goleDe) * suave(b)
        pintarNivel()
        if (bebendo >= 1) { bebendo = 0; nivel = goleAte; pintarNivel() }
      }

      const primeira = !player || player.mode === 'first'
      if (!primeira) return

      // --- correr -------------------------------------------------------------
      const querCorrer = (player && typeof player.runBlend === 'number')
        ? clamp01(player.runBlend)
        : clamp01((((player && player.speed) || 0) - 3.4) / 2.4)
      corrida = damp(corrida, querCorrer, LAMBDA_CORRIDA, d)
      const c = suave(corrida) * (1 - Math.max(estender, bebendo > 0 ? 1 : 0))

      // --- sway ---------------------------------------------------------------
      let dy = camera.rotation.y - ultimoYaw
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2
      const dx = camera.rotation.x - ultimoPitch
      ultimoYaw = camera.rotation.y
      ultimoPitch = camera.rotation.x
      swayY = damp(swayY + dy * 1.4, 0, LAMBDA_SWAY, d)
      swayX = damp(swayX + dx * 1.4, 0, LAMBDA_SWAY, d)
      swayY = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayY))
      swayX = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayX))

      // --- rampas das poses ----------------------------------------------------
      estender = damp(estender, estendido ? 1 : 0, LAMBDA_POSE, d)
      miraK = damp(miraK, (mira && estendido) ? 1 : 0, 9, d)
      // curva do gole: sobe rapido, para na boca, desce devagar
      let gole = 0
      if (bebendo > 0) {
        const t2 = bebendo
        gole = t2 < 0.30 ? suave(t2 / 0.30) : (t2 < 0.66 ? 1 : 1 - suave((t2 - 0.66) / 0.34))
      }

      // --- passo ---------------------------------------------------------------
      const fase = (player && typeof player.bobPhase === 'number') ? player.bobPhase : tempo * 4
      const quanto = (player && typeof player.bobAmt === 'number')
        ? player.bobAmt
        : clamp01(((player && player.speed) || 0) / 2.2)
      // andando com o copo esticado ou na boca o balanco CAI: quem leva um copo
      // cheio na mao anda com cuidado, e o balanco cheio derramaria na leitura
      const calma = 1 - 0.72 * Math.max(estender, gole)
      const amp = (AMP_BOB_ANDAR + (AMP_BOB_CORRER - AMP_BOB_ANDAR) * c) * quanto * calma
      const passoY = Math.sin(fase * 2) * amp
      const passoX = Math.sin(fase) * amp * 0.62

      const aterrou = player ? !!player.grounded : true
      if (aterrou && !noChao) quique = 1
      noChao = aterrou
      quique = damp(quique, 0, 9, d)

      // --- monta a pose --------------------------------------------------------
      const entrada = suave(clamp01(k))
      // ociosa -> correr -> esticada -> boca, nessa ordem de prioridade
      suporte.position.lerpVectors(POSE_OCIOSA.pos, POSE_CORRER.pos, c)
      suporte.position.lerp(POSE_ESTENDIDA.pos, estender)
      if (gole > 0) suporte.position.lerp(POSE_BOCA.pos, gole)

      // A MIRA: o alvo vira o ponto do mundo, em espaco de camera, um palmo
      // abaixo do bico. Sem o clamp, uma torneira a 4 m poria o copo a 4 m.
      if (miraK > 0.002 && mira) {
        _pAlvo.copy(mira)
        camera.worldToLocal(_pAlvo)
        const dist = Math.max(DIST_MIRA_MIN, Math.min(DIST_MIRA_MAX, -_pAlvo.z))
        const escala = dist / Math.max(0.0001, -_pAlvo.z)
        _pAlvo.multiplyScalar(escala)
        // desce a altura do copo: o que fica no bico e a BOCA do copo
        _pAlvo.y -= 0.085
        suporte.position.lerp(_pAlvo, miraK * estender)
      }

      suporte.position.x += passoX + swayY * 0.30
      suporte.position.y += passoY - swayX * 0.24
      suporte.position.y -= (1 - entrada) * 0.46
      suporte.position.y += saque * 0.055
      suporte.position.y -= quique * 0.034
      suporte.position.z += (1 - entrada) * 0.06

      _euler.set(
        POSE_OCIOSA.rot.x + (POSE_CORRER.rot.x - POSE_OCIOSA.rot.x) * c,
        POSE_OCIOSA.rot.y + (POSE_CORRER.rot.y - POSE_OCIOSA.rot.y) * c,
        POSE_OCIOSA.rot.z + (POSE_CORRER.rot.z - POSE_OCIOSA.rot.z) * c,
      )
      _euler.x += (POSE_ESTENDIDA.rot.x - _euler.x) * estender
      _euler.y += (POSE_ESTENDIDA.rot.y - _euler.y) * estender
      _euler.z += (POSE_ESTENDIDA.rot.z - _euler.z) * estender
      if (gole > 0) {
        // a inclinacao final acompanha o quanto ainda ha no copo: copo quase
        // vazio vira mais, que e como se bebe o fim de um chope
        const extra = (1 - nivel) * 0.42
        _euler.x += (POSE_BOCA.rot.x + extra - _euler.x) * gole
        _euler.y += (POSE_BOCA.rot.y - _euler.y) * gole
        _euler.z += (POSE_BOCA.rot.z - _euler.z) * gole
      }
      const parado = 1 - quanto
      _euler.x += Math.sin(tempo * 1.35) * 0.010 * parado * (1 - gole) + swayX * 0.50 + quique * 0.09
      _euler.y += swayY * 0.50
      _euler.z += Math.cos(tempo * 1.05) * 0.008 * parado - swayY * 0.26
      _euler.z += (1 - entrada) * 0.85 + saque * 0.12
      _euler.x -= (1 - entrada) * 0.30
      suporte.rotation.copy(_euler)

      colarNaCamera()
    },

    dispose() {
      api.esconderJa()
      if (suporte.parent) suporte.parent.remove(suporte)
      for (const reg of cache.values()) {
        reg.grupo.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose() })
      }
      cache.clear()
    },
  }

  return api
}

export default criarCopo
