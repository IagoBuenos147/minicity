// ---------------------------------------------------------------------------
// src/rede/voz.js — CHAT DE VOZ POR PROXIMIDADE.
//
// Quem esta perto se ouve, quem esta longe nao. E a voz sai de ONDE A PESSOA
// ESTA: se ela fala atras de voce, voce ouve atras; se ela atravessa a rua, a
// voz atravessa junto e vai sumindo.
//
// COMO O SOM CHEGA AQUI (e o que o servidor do jogo tem a ver com isso: nada)
//
//   sinalizacao ...... servidor publico do PeerJS (0.peerjs.com). E so um
//                      quadro de avisos: "fulano existe, o endereco dele e
//                      este". Audio nenhum passa por ele.
//   audio ............ WebRTC, DIRETO de um jogador pro outro. Nao passa pelo
//                      servidor do Mini City RP, e por isso a pasta `servidor/`
//                      deste repositorio nao ganhou uma linha sequer.
//   posicao .......... o WebSocket que ja existia. `rede.jogadores` ja traz
//                      x/y/z de todo mundo interpolado 100 ms atras (REDE.md),
//                      e e dele que sai a distancia e o PannerNode.
//
// COMO CADA UM DESCOBRE O ENDERECO DO OUTRO (sem pacote novo no protocolo)
//
// O caminho obvio seria criar um pacote "meu peer id e este" e espalhar pela
// sala. Isso mexeria em `src/comum/protocolo.js` e em `servidor/sala.js`, e o
// REDE.md e taxativo sobre id de rede. Mas ele tambem ja garante o que eu
// precisava — TODO JOGADOR TEM UM ID NUMERICO PROPRIO E ESTAVEL (1..999, dado
// pelo servidor na entrada). Entao o peer id nao e trocado, e DERIVADO:
//
//     mcrp-<sala>-<id do jogador>
//
// Quem ja enxerga o outro em `rede.jogadores` ja sabe o endereco dele. Zero
// bytes a mais na rede, zero mudanca de protocolo.
//
// `<sala>` e um resumo de `location.host`. O broker do PeerJS e PUBLICO e
// compartilhado com o mundo inteiro: sem esse pedaco, dois servidores
// diferentes do jogo brigariam pelo id "mcrp-3" e um roubaria a chamada do
// outro. Com ele, cada servidor tem seu proprio espaco de nomes.
//
// QUEM LIGA PRA QUEM. So o de id MENOR liga. Se os dois ligassem ao mesmo tempo
// (o classico "glare" do WebRTC) o par ficaria com duas chamadas e duas streams
// da mesma pessoa — voce ouviria todo mundo em dobro, com eco. A regra e uma
// linha e resolve sem negociacao nenhuma.
//
// A ARMADILHA DO CHROME QUE MATA ESTE ARQUIVO INTEIRO. Uma MediaStream vinda do
// WebRTC so toca pelo Web Audio se ela TAMBEM estiver presa a um elemento
// <audio>. Sem isso, `createMediaStreamSource` conecta certinho, o grafo fica
// bonito, o PannerNode se move — e nao sai som nenhum. Por isso cada par ganha
// um `new Audio()` MUDO: ele nao toca nada (o som sai pelo panner), ele existe
// so pra o Chrome puxar os pacotes da stream. Se um dia isso parecer codigo
// morto e alguem apagar, o chat de voz emudece inteiro.
//
// PRECISA DE HTTPS (ou localhost). `getUserMedia` nao existe em contexto
// inseguro. Abrir o jogo por http://192.168.x.x pra jogar na rede local NAO da
// microfone — o navegador nem pergunta, some com a API. Ver REDE.md.
//
// TUDO E OPCIONAL. Sem PeerJS carregado, sem microfone, sem Web Audio ou sem
// servidor, cada funcao vira no-op silenciosa. Voz nao pode derrubar um quadro
// do jogo, e nao pode impedir ninguem de jogar.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { contextoDeAudio, barramentoDeVoz } from '../audio/som.js'

// --- as tres distancias ----------------------------------------------------
// PERTO e LONGE nao sao o mesmo numero DE PROPOSITO. Com um so, quem para
// exatamente em cima da linha faz a chamada abrir e fechar sem parar: uma
// negociacao WebRTC inteira por passo, e a voz picotando. A faixa entre os dois
// e uma zona morta — ja conectado, continua; desconectado, continua.
export const PERTO = 15     // metros pra COMECAR a ouvir (o pedido do dono)
export const LONGE = 18     // metros pra PARAR de ouvir
const PACIENCIA = 2.0       // segundos alem de LONGE antes de desligar

// Abrir uma chamada leva alguns segundos (ICE, DTLS). Derrubar quem so dobrou a
// esquina e voltou seria pagar tudo isso de novo — dai a PACIENCIA.

const MAX_TENTATIVAS_ID = 6 // o id derivado pode estar preso pela sessao velha

/** Resumo curto e estavel de um texto. So pra separar servidores no broker. */
function resumo(txt) {
  let h = 0x811c9dc5
  const s = String(txt || 'local')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

/**
 * @param {object} dep
 * @param {object} dep.rede    o cliente de rede (`rede.jogadores`, `rede.meuId`)
 * @param {object} dep.camera  as ORELHAS: o listener anda com ela
 * @param {object} dep.player  o corpo; a distancia sai daqui, nao da camera
 * @param {(msg:string)=>void} [dep.aviso]  pra falar com o jogador (hud.toast)
 */
export function criarVoz({ rede, camera, player, aviso } = {}) {
  const falar = typeof aviso === 'function' ? aviso : () => {}

  // --- estado --------------------------------------------------------------
  const pares = new Map()   // id do jogador -> par (ver `novoPar`)
  let peer = null           // o objeto do PeerJS
  let meuPeerId = ''
  let microfone = null      // MediaStream local
  let ctx = null
  let saida = null          // GainNode: o barramento de voz
  let ligando = false
  let salaKey = ''
  let tentativasId = 0

  const api = {
    ativa: false,     // o microfone existe e o Peer esta no ar
    mudo: false,      // a faixa local esta desligada (a chamada continua)
    erro: '',         // ultima falha, pro F3 e pro teste
  }

  const _v = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _e = new THREE.Vector3()
  const _frente = new THREE.Vector3()
  const _cima = new THREE.Vector3()

  // --- 1. o microfone e o Peer ---------------------------------------------

  /**
   * Liga tudo. So e chamado a partir de uma TECLA — nunca no carregamento.
   *
   * Pedir microfone assim que a pagina abre e o jeito mais rapido de a pessoa
   * clicar em "bloquear" pra sempre, e o Chrome guarda esse "nao" por origem. O
   * pedido tem que vir depois de um gesto que signifique "quero falar".
   */
  async function ligar() {
    if (api.ativa || ligando) return api.ativa
    ligando = true
    try {
      if (!rede || !rede.conectado) {
        api.erro = 'sem servidor'
        falar('Voz: entre no coop primeiro')
        return false
      }
      if (!window.Peer) {
        api.erro = 'sem peerjs'
        falar('Voz: a biblioteca PeerJS nao carregou')
        return false
      }
      // A checagem que evita um erro incompreensivel mais adiante: em contexto
      // inseguro `navigator.mediaDevices` e undefined, e o acesso estoura um
      // TypeError seco que nao diz uma palavra sobre https.
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        api.erro = 'sem contexto seguro'
        falar('Voz: precisa de https ou localhost pro microfone')
        return false
      }

      microfone = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Voz de jogo: os tres tratamentos do navegador ajudam mais do que
          // atrapalham. Sem o cancelamento de eco, quem joga no alto-falante
          // manda a voz dos outros de volta pra eles.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })

      ctx = contextoDeAudio()
      saida = barramentoDeVoz()
      if (!ctx || !saida) { api.erro = 'sem web audio'; pararMicrofone(); return false }

      salaKey = resumo((typeof location !== 'undefined' && location.host) || 'local')
      await abrirPeer()
      if (!peer) { pararMicrofone(); return false }

      api.ativa = true
      api.mudo = false
      api.erro = ''
      return true
    } catch (e) {
      // NotAllowedError = a pessoa disse nao, e isso nao e um bug.
      api.erro = (e && e.name) || 'falhou'
      falar(api.erro === 'NotAllowedError' ? 'Voz: microfone negado' : 'Voz: ' + api.erro)
      pararMicrofone()
      return false
    } finally {
      ligando = false
    }
  }

  /**
   * Registra o id derivado no broker publico.
   *
   * O retry existe por um caso concreto: quem da F5 volta com o MESMO id de
   * jogador (o servidor derruba a sessao anterior pelo nome — ver REDE.md), mas
   * o broker do PeerJS leva alguns segundos pra perceber que o socket velho
   * morreu. Nesse intervalo o id ainda esta tomado e o registro e recusado com
   * `unavailable-id`. Nao da pra pegar outro id: o endereco e DERIVADO, e
   * inventar um sufixo tornaria a pessoa invisivel pra todo mundo. Entao a
   * unica saida certa e insistir ate o broker soltar.
   */
  function abrirPeer() {
    return new Promise((resolve) => {
      meuPeerId = 'mcrp-' + salaKey + '-' + (rede.meuId | 0)
      let resolvido = false
      const acabou = (ok) => { if (!resolvido) { resolvido = true; resolve(ok) } }

      try {
        peer = new window.Peer(meuPeerId, { debug: 0 })
      } catch (e) {
        api.erro = 'peer: ' + ((e && e.message) || 'falhou')
        peer = null
        acabou(false)
        return
      }

      peer.on('open', () => { tentativasId = 0; acabou(true) })
      peer.on('call', atenderChamada)

      peer.on('error', (e) => {
        const tipo = (e && e.type) || ''
        if (tipo === 'unavailable-id' && tentativasId < MAX_TENTATIVAS_ID) {
          tentativasId++
          try { peer.destroy() } catch (err) { void err }
          peer = null
          setTimeout(() => { abrirPeer().then(acabou) }, 1200)
          return
        }
        // `peer-unavailable` e rotina, e nao falha: o outro lado simplesmente
        // ainda nao ligou o microfone dele. Nao vale nem um aviso na tela.
        if (tipo === 'peer-unavailable') return
        api.erro = tipo || 'peer'
        acabou(false)
      })

      // Broker fora do ar, ou a aba dormiu tempo demais.
      peer.on('disconnected', () => { try { peer.reconnect() } catch (err) { void err } })
    })
  }

  /** Desliga tudo: chamadas, microfone e o registro no broker. */
  function desligar() {
    for (const id of Array.from(pares.keys())) encerrarPar(id)
    if (peer) { try { peer.destroy() } catch (e) { void e } }
    peer = null
    pararMicrofone()
    api.ativa = false
    api.mudo = false
  }

  function pararMicrofone() {
    if (microfone) {
      for (const t of microfone.getTracks()) { try { t.stop() } catch (e) { void e } }
    }
    microfone = null
  }

  /**
   * Mudo NAO derruba a chamada — so cala a faixa local.
   *
   * Derrubar faria cada aperto de tecla pagar uma negociacao WebRTC nova, e a
   * pessoa so voltaria a ser ouvida uns segundos depois de mandar falar.
   */
  function alternarMudo(v) {
    if (!api.ativa || !microfone) return false
    api.mudo = v === undefined ? !api.mudo : !!v
    for (const t of microfone.getAudioTracks()) t.enabled = !api.mudo
    return api.mudo
  }

  // --- 2. abrir e fechar chamadas ------------------------------------------

  function idDoJogador(peerId) {
    const pre = 'mcrp-' + salaKey + '-'
    if (String(peerId).indexOf(pre) !== 0) return 0
    const n = parseInt(String(peerId).slice(pre.length), 10)
    return Number.isFinite(n) ? n : 0
  }

  /**
   * Alguem ligou pra mim.
   *
   * O broker e PUBLICO: qualquer pessoa do mundo que descubra meu id pode tocar
   * a campainha. Por isso a chamada so e atendida se o endereco de quem liga
   * decodificar pra um jogador que O SERVIDOR DO JOGO diz estar na minha sala.
   * Quem nao esta no snapshot nao existe, e a chamada morre aqui.
   */
  function atenderChamada(chamada) {
    const id = idDoJogador(chamada.peer)
    if (!id || id === rede.meuId || !rede.jogadores.has(id)) {
      try { chamada.close() } catch (e) { void e }
      return
    }
    if (pares.has(id)) { try { chamada.close() } catch (e) { void e } return }
    const par = novoPar(id)
    par.chamada = chamada
    chamada.answer(microfone)
    ouvir(par, chamada)
  }

  /** Eu ligo pro outro. So o id MENOR chega aqui (ver `avaliarDistancias`). */
  function chamar(id) {
    if (!peer || !microfone || pares.has(id)) return
    const par = novoPar(id)
    try {
      par.chamada = peer.call('mcrp-' + salaKey + '-' + id, microfone)
    } catch (e) {
      void e
      pares.delete(id)
      return
    }
    if (!par.chamada) { pares.delete(id); return }
    ouvir(par, par.chamada)
  }

  function novoPar(id) {
    const par = {
      id,
      chamada: null,
      stream: null,
      el: null,        // o <audio> mudo que o Chrome exige (ver cabecalho)
      fonte: null,
      panner: null,
      ganho: null,
      longeDesde: 0,   // ha quanto tempo esta alem de LONGE
    }
    pares.set(id, par)
    return par
  }

  function ouvir(par, chamada) {
    chamada.on('stream', (stream) => montarAudio(par, stream))
    chamada.on('close', () => encerrarPar(par.id))
    chamada.on('error', () => encerrarPar(par.id))
  }

  /**
   * O grafo de audio de UMA voz:
   *
   *     MediaStream -> MediaStreamSource -> PannerNode -> Gain -> barramento
   *            \
   *             `-> <audio muted>   (nao toca nada; existe pro Chrome puxar os
   *                                  pacotes. Ver o cabecalho do arquivo.)
   */
  function montarAudio(par, stream) {
    if (!ctx || par.stream) return
    par.stream = stream

    par.el = new Audio()
    par.el.srcObject = stream
    par.el.muted = true
    par.el.autoplay = true
    // E ele VAI PRA ARVORE do documento, e nao fica solto numa variavel.
    //
    // Um `new Audio()` que ninguem prendeu ao documento e um elemento
    // destacado, e o quanto o Chrome se dispoe a bombear uma stream por um
    // elemento destacado nao e coisa que a especificacao prometa — e a
    // diferenca entre funcionar e nao sair som e invisivel no codigo. Como o
    // elemento e mudo e nao tem `controls`, ele nao aparece nem ocupa espaco:
    // custa um no na arvore por pessoa falando, e tira essa duvida do caminho.
    document.body.appendChild(par.el)
    const p = par.el.play()
    if (p && p.catch) p.catch(() => {})

    par.fonte = ctx.createMediaStreamSource(stream)
    par.panner = ctx.createPanner()
    par.panner.panningModel = 'HRTF'      // e o que da o "atras de mim"
    par.panner.distanceModel = 'inverse'
    // refDistance: ate onde a voz fica em volume cheio. Pouco mais que o braco:
    // encostado na pessoa nao estoura, e a queda comeca logo.
    par.panner.refDistance = 1.6
    par.panner.maxDistance = PERTO
    par.panner.rolloffFactor = 1.1
    par.ganho = ctx.createGain()
    // Entra em rampa. Ligar em 1 seco da um estalo na primeira amostra, e a
    // primeira amostra de uma chamada WebRTC costuma ser justamente um estalo.
    par.ganho.gain.setValueAtTime(0, ctx.currentTime)
    par.ganho.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.25)

    par.fonte.connect(par.panner)
    par.panner.connect(par.ganho)
    par.ganho.connect(saida)
  }

  function encerrarPar(id) {
    const par = pares.get(id)
    if (!par) return
    pares.delete(id)
    if (par.chamada) { try { par.chamada.close() } catch (e) { void e } }
    // A ordem importa: desconectar antes de soltar o elemento, senao o grafo
    // fica segurando uma fonte de uma stream que ja morreu.
    if (par.fonte) { try { par.fonte.disconnect() } catch (e) { void e } }
    if (par.panner) { try { par.panner.disconnect() } catch (e) { void e } }
    if (par.ganho) { try { par.ganho.disconnect() } catch (e) { void e } }
    if (par.el) {
      try { par.el.pause() } catch (e) { void e }
      par.el.srcObject = null
      if (par.el.parentNode) par.el.parentNode.removeChild(par.el)
    }
    par.fonte = null
    par.panner = null
    par.ganho = null
    par.el = null
    par.stream = null
  }

  // --- 3. o audio posicional, todo quadro ----------------------------------

  /**
   * As ORELHAS vao na camera, e nao no corpo.
   *
   * Em 3a pessoa a camera esta atras do boneco, e e o que a pessoa esta vendo —
   * ouvir de um ponto que ela nao ocupa e mais estranho do que ouvir de onde a
   * imagem sai. A DISTANCIA, essa sim, sai do corpo: quem decide se da pra
   * conversar e onde o avatar esta, e nao pra onde a camera olhou.
   */
  function moverListener() {
    const l = ctx.listener
    camera.matrixWorld.decompose(_v, _q, _e)
    _frente.set(0, 0, -1).applyQuaternion(_q)
    _cima.set(0, 1, 0).applyQuaternion(_q)

    // Duas APIs pro mesmo listener: a moderna (AudioParam) e a antiga
    // (setPosition). Safari mais velho so tem a segunda.
    if (l.positionX) {
      const t = ctx.currentTime
      l.positionX.setValueAtTime(_v.x, t)
      l.positionY.setValueAtTime(_v.y, t)
      l.positionZ.setValueAtTime(_v.z, t)
      l.forwardX.setValueAtTime(_frente.x, t)
      l.forwardY.setValueAtTime(_frente.y, t)
      l.forwardZ.setValueAtTime(_frente.z, t)
      l.upX.setValueAtTime(_cima.x, t)
      l.upY.setValueAtTime(_cima.y, t)
      l.upZ.setValueAtTime(_cima.z, t)
    } else if (l.setPosition) {
      l.setPosition(_v.x, _v.y, _v.z)
      l.setOrientation(_frente.x, _frente.y, _frente.z, _cima.x, _cima.y, _cima.z)
    }
  }

  function moverPanner(par, j) {
    const p = par.panner
    if (!p) return
    // A boca fica na cabeca, e nao nos pes: j.y e o chao do avatar.
    const y = j.y + 1.6
    if (p.positionX) {
      const t = ctx.currentTime
      p.positionX.setValueAtTime(j.x, t)
      p.positionY.setValueAtTime(y, t)
      p.positionZ.setValueAtTime(j.z, t)
    } else if (p.setPosition) {
      p.setPosition(j.x, y, j.z)
    }
  }

  function distanciaAte(j) {
    const meu = player && player.position ? player.position : camera.position
    const dx = j.x - meu.x
    const dy = j.y - meu.y
    const dz = j.z - meu.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  function avaliarDistancias(dt) {
    const meuId = rede.meuId | 0

    for (const [id, j] of rede.jogadores) {
      const d = distanciaAte(j)
      const par = pares.get(id)

      if (par) {
        moverPanner(par, j)
        if (d > LONGE) {
          par.longeDesde += dt
          if (par.longeDesde >= PACIENCIA) encerrarPar(id)
        } else {
          par.longeDesde = 0
        }
        continue
      }

      // So o de id MENOR liga — a regra que evita a chamada dupla.
      if (d <= PERTO && meuId && meuId < id) chamar(id)
    }

    // Quem sumiu do snapshot saiu do jogo: derruba na hora, sem PACIENCIA.
    // Esperar aqui seria segurar um grafo de audio de alguem que nao existe.
    for (const id of Array.from(pares.keys())) {
      if (!rede.jogadores.has(id)) encerrarPar(id)
    }
  }

  api.ligar = ligar
  api.desligar = desligar
  api.alternarMudo = alternarMudo

  /** Chamado TODO QUADRO pelo main, depois que a camera ja esta no lugar. */
  api.atualizar = function atualizar(dt) {
    if (!api.ativa || !ctx || !rede) return
    moverListener()
    avaliarDistancias(dt > 0 ? dt : 0)
  }

  /** Espiada pro painel F3 e pros testes. */
  api.estado = function estado() {
    const lista = Array.from(pares.values())
    return {
      ativa: api.ativa,
      mudo: api.mudo,
      erro: api.erro,
      meuPeerId,
      // quem realmente tem audio tocando, e nao so uma chamada aberta
      ouvindo: lista.filter((p) => !!p.stream).map((p) => p.id),
      abrindo: lista.filter((p) => !p.stream).map((p) => p.id),
    }
  }

  api.dispose = desligar

  return api
}

export default criarVoz
