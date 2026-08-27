import * as THREE from 'three'
import {
  PORTAL_GUN, PORTAL_DESTINO, PORTAL_DURACAO, PORTAL_RAIO,
} from '../comum/mundo.js'
// So a faixa de id interessa aqui (ehIdDePortal). Namespace pra seguir o mesmo
// formato de import que o cliente-rede usa com protocolo.js.
import * as Proto from '../comum/protocolo.js'
import { criarModeloArma } from './portal-arma.js'
import { criarPortal, liberarGeometriasDoPortal } from './portal-efeito.js'
import { criarClarao, COR_VERDE } from './efeitos.js'

// ---------------------------------------------------------------------------
// A ARMA DE PORTAL.
//
// Segue o mesmo contrato do anel verde (REDE.md): este arquivo NAO decide nada.
//
//   atirar()  -> rede.abrirPortal(x, y, z, yaw)  e ESPERA 'portal-aberto'
//   fechar    -> quem conta os MUNDO.PORTAL_DURACAO segundos e o SERVIDOR;
//                o cliente so obedece ao 'portal-fechado'
//
// O portal so aparece quando o evento volta. Assim quem atirou e quem estava
// do outro lado da rua veem o MESMO portal, no mesmo lugar, na mesma hora.
// Redemoinho, gotas, clarao, luz e o tranco de camera sao 100% LOCAIS: pela
// rede viaja so o evento.
//
// Sem servidor (jogando sozinho) o modulo responde ao proprio pedido pelo
// MESMO caminho do evento de rede — igual o anel.js faz com ehLocal().
//
// Nada e identificado por indice de array: os portais vivem num Map por id, e
// um id desconhecido e ignorado sem reclamar, como manda o contrato.
// ---------------------------------------------------------------------------

// --- numeros do poder --------------------------------------------------------
const DIST_TIRO = 3.0          // metros a frente do jogador
const RECUO_PAREDE = 0.62      // o portal encosta na parede, nao entra nela
const DIST_MIN = 1.25          // nunca abre em cima do proprio jogador
const ALTURA_CENTRO = 1.62     // centro do oval: a base quase raspa o chao
const TEMPO_MORTO = 1.5        // segundos sem poder atravessar de novo
const RECARGA = 0.6            // segundos entre dois tiros
const ALTURA_TRAVESSIA = 1.7   // folga vertical pra contar como "entrou"
const DUR_OVERLAY = 0.55       // clarao verde na tela ao atravessar
// Zona morta em volta da SAIDA (MUNDO.PORTAL_DESTINO). O tempo morto de
// TEMPO_MORTO segundos nao resolve isto sozinho: um portal aberto em cima do
// destino cospe quem atravessa dentro dele mesmo, e no instante em que o tempo
// morto vence a travessia dispara de novo, em laco. Um metro alem do raio de
// travessia ja tira o jogador do alcance ao aterrissar.
const RAIO_PROIBIDO = PORTAL_RAIO + 1

const _dir = new THREE.Vector3()
const _pos = new THREE.Vector3()
const _de = new THREE.Vector3()
const _para = new THREE.Vector3()
const _a = new THREE.Vector3()
// eixo Y fixo: nasce uma vez, porque isto e usado TODO quadro (alocar um
// Vector3 por frame joga o coletor de lixo no meio do laco)
const _EIXO_Y = new THREE.Vector3(0, 1, 0)

/**
 * @param dep.scene, dep.camera, dep.player, dep.character, dep.collision
 * @param dep.rede         cliente de rede (opcional: sem ele, modo local)
 * @param dep.hud          opcional, so pra toast
 * @param dep.groundY      opcional, (x,z)->altura do chao
 * @param dep.interaction  opcional, pra desligar o "Pegar a arma" ao equipar
 */
export function criarPortalGun({ scene, camera, player, character, collision, rede, hud,
  groundY, interaction }) {

  const chaoEm = typeof groundY === 'function' ? groundY : () => 0

  // Decidido A CADA ACAO, nunca congelado na criacao: o jogo abre antes de
  // conectar, pode nunca conectar e pode perder a conexao no meio. Congelado,
  // quem estivesse sem servidor pediria o portal e esperaria pra sempre.
  const ehLocal = () => !rede || typeof rede.abrirPortal !== 'function' || !rede.conectado

  function meuId() {
    if (!rede) return 0
    return (typeof rede.meuId === 'function' ? rede.meuId() : rede.meuId) || 0
  }

  function avisar(msg) { if (hud && typeof hud.toast === 'function') hud.toast(msg) }

  // =========================================================================
  // 1. A ARMA — largada na mercearia e na mao
  // =========================================================================
  const arma = criarModeloArma()

  // Largada: um pivo que gira e flutua dentro de um grupo parado no ponto do
  // mundo. Girar o grupo de fora faria a flutuacao andar em circulo tambem.
  const grupoNoMundo = new THREE.Group()
  grupoNoMundo.position.set(PORTAL_GUN.x, PORTAL_GUN.y, PORTAL_GUN.z)
  grupoNoMundo.name = 'portal-gun-mundo'

  const pivo = new THREE.Group()
  grupoNoMundo.add(pivo)
  pivo.add(arma.grupo)
  // no chao ela flutua deitada, com o bico levemente pra cima
  arma.grupo.position.set(0, 0, 0)
  arma.grupo.rotation.set(0, 0, 0)

  // =========================================================================
  // 2. LUZES — o orcamento inteiro sao DUAS PointLight, sem sombra
  // =========================================================================
  // Uma PointLight com sombra custa 6 passadas de render; duas dessas derrubam
  // os 60 fps sozinhas. Por isso castShadow = false nas duas.
  //
  // luzArma mora no frasco (largada ou na mao). luzPortal e UMA SO, emprestada
  // pro portal mais perto da camera: com dois portais abertos, o de longe fica
  // sem luz propria, e ninguem percebe. Elas nascem visiveis e nunca sao
  // escondidas — mexer em .visible muda a contagem de luzes e o three recompila
  // TODOS os materiais da cena (engasgo de varios quadros). Apagar e sempre
  // intensity = 0.
  const luzArma = new THREE.PointLight(COR_VERDE, 0.8, 3.2, 2)
  luzArma.castShadow = false
  scene.add(luzArma)

  const luzPortal = new THREE.PointLight(0x35ff96, 0, 9, 2)
  luzPortal.castShadow = false
  scene.add(luzPortal)

  const clarao = criarClarao(scene, camera)

  // =========================================================================
  // 3. ESTADO
  // =========================================================================
  const portais = new Map()      // id -> { visual, x, y, z, yaw, dono, t, expira }
  let equipado = false
  let tempo = 0
  let recarga = 0
  let mortoAte = 0               // tempo ate poder atravessar de novo
  let overlayT = 0
  let conectadoAntes = false
  let contadorLocal = 0          // ids do modo sem servidor (negativos)
  let meuPortalLocal = 0         // id do MEU portal no modo local (0 = nenhum)
  let pediuEm = -1               // instante do ultimo pedido (so pra recarga)

  /** True se (x,z) cai na zona morta em volta da saida do portal. */
  function pertoDoDestino(x, z) {
    const dx = x - PORTAL_DESTINO.x
    const dz = z - PORTAL_DESTINO.z
    return dx * dx + dz * dz < RAIO_PROIBIDO * RAIO_PROIBIDO
  }

  // Tranco de camera: dois radianos pro main somar na rotacao da camera DEPOIS
  // de player.update(dt) — a mesma saida que o anel.js expoe.
  const tremor = { x: 0, y: 0 }
  let tremorF = 0
  function tremerImpulso(f) {
    tremorF = Math.min(1.4, tremorF + f)
    if (player && typeof player.tremer === 'function') player.tremer(f)
  }

  // --- clarao verde na tela (travessia) --------------------------------------
  // DOM puro, criado sob demanda: e um efeito de tela, nao de cena, e nao vale
  // um render target so pra isso.
  let overlay = null
  function pegarOverlay() {
    if (overlay || typeof document === 'undefined') return overlay
    overlay = document.createElement('div')
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:40',
      'opacity:0', 'mix-blend-mode:screen',
      'background:radial-gradient(circle at 50% 50%,' +
        'rgba(190,255,220,0.95) 0%, rgba(60,255,150,0.75) 35%, rgba(10,120,60,0.0) 78%)',
    ].join(';')
    document.body.appendChild(overlay)
    return overlay
  }

  // =========================================================================
  // 4. EQUIPAR
  // =========================================================================
  function equipar() {
    if (equipado) return
    equipado = true
    grupoNoMundo.visible = false
    const mao = character && character.parts && character.parts.handR
    if (mao) mao.add(arma.grupo)
    else scene.add(arma.grupo)
    // A mao e uma junta no PULSO e o mesh do punho fechado desce em -Y ate
    // ~y = -0.09 (ver character.js). O modelo da arma tem o pescoco do cabo em
    // y = +0.05 no espaco dele, entao descer 0.094 poe o cabo DENTRO do punho e
    // deixa o corpo da arma pousado em cima da mao, e nao flutuando acima dela.
    arma.grupo.position.set(0.012, -0.094, 0.042)
    arma.grupo.rotation.set(-0.15, 0, 0.08)
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('portal-gun', false)
    }
    avisar('Arma de portal equipada. Clique pra abrir um portal.')
  }

  function desequipar() {
    if (!equipado) return
    equipado = false
    if (arma.grupo.parent) arma.grupo.parent.remove(arma.grupo)
    pivo.add(arma.grupo)
    arma.grupo.position.set(0, 0, 0)
    arma.grupo.rotation.set(0, 0, 0)
    grupoNoMundo.visible = true
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('portal-gun', true)
    }
  }

  const interactable = {
    id: 'portal-gun',
    position: new THREE.Vector3(PORTAL_GUN.x, PORTAL_GUN.y, PORTAL_GUN.z),
    radius: 2.1,
    label: 'Pegar a arma de portal',
    onInteract(game) {
      equipar()
      // o sistema de interacao copia os campos, entao desligar so vale por id
      const it = (game && game.interaction) || interaction
      if (it && typeof it.setEnabled === 'function') it.setEnabled('portal-gun', false)
    },
  }

  // =========================================================================
  // 5. ATIRAR — e um PEDIDO, nao uma decisao
  // =========================================================================
  /**
   * Onde o portal deveria abrir: uns 3 m a frente do jogador, no chao, e
   * encostado na parede se houver uma no caminho. E so uma SUGESTAO — quem
   * confirma o lugar e o evento que volta do servidor.
   */
  function mirar(out) {
    camera.getWorldDirection(_dir)
    _dir.y = 0
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1)
    _dir.normalize()

    _de.copy(player.position)
    _de.y += 1.2                       // altura do peito: e de la que a "mira" sai
    _para.copy(_de).addScaledVector(_dir, DIST_TIRO)

    let dist = DIST_TIRO
    if (collision && typeof collision.segmentHit === 'function') {
      // fracao ate o primeiro occluder (parede/predio); 1 = caminho livre
      const f = collision.segmentHit(_de, _para, 0.1)
      if (f < 1) dist = Math.max(DIST_MIN, DIST_TIRO * f - RECUO_PAREDE)
    }
    // Colisores comuns (moveis, balcoes) sao chapas XZ: aqui basta recuar ate
    // achar chao livre pro portal nao nascer dentro de uma prateleira.
    if (collision && typeof collision.isFree === 'function') {
      for (let i = 0; i < 6; i++) {
        const x = _de.x + _dir.x * dist
        const z = _de.z + _dir.z * dist
        if (collision.isFree(x, z, 0.55)) break
        dist -= 0.32
        if (dist < DIST_MIN) { dist = DIST_MIN; break }
      }
    }

    const x = _de.x + _dir.x * dist
    const z = _de.z + _dir.z * dist
    out.set(x, chaoEm(x, z) + ALTURA_CENTRO, z)
    // O portal ENCARA quem atirou: a frente do plano (+Z local) aponta pra tras
    // da direcao do tiro.
    return Math.atan2(-_dir.x, -_dir.z)
  }

  function atirar() {
    if (!equipado) return
    if (recarga > 0) return

    const yaw = mirar(_pos)

    // Recusa ANTES de pedir: nem o coice, nem o pedido pra rede. Se o servidor
    // aceitasse este ponto, todo mundo herdaria o laco de travessia.
    if (pertoDoDestino(_pos.x, _pos.z)) {
      // recarga mesmo assim: segura o toast pra ele nao repetir a cada clique
      recarga = RECARGA
      avisar('Perto demais da saida do portal. Mire mais longe.')
      return
    }

    recarga = RECARGA
    pediuEm = tempo

    // coice: a arma da um tranco na mao e o frasco pisca
    tremerImpulso(0.5)
    arma.grupo.getWorldPosition(_a)
    clarao.disparar(_a, 1.1, 0.22)

    if (ehLocal()) {
      // Fallback de desenvolvimento: respondo a mim mesmo no proximo quadro,
      // pelo MESMO caminho do evento de rede. Nenhum atalho.
      // Um portal por jogador vale AQUI TAMBEM. O servidor manda o
      // 'portal-fechado' do velho e SO DEPOIS o 'portal-aberto' do novo
      // (REDE.md, "A arma de portal"); sem essa mesma ordem no caminho local,
      // cada tiro deixava mais um portal vivo — com RECARGA de 0.6 s e
      // PORTAL_DURACAO de 25 s, umas quatro dezenas deles na tela.
      const velho = meuPortalLocal
      const id = -(++contadorLocal)
      meuPortalLocal = id
      const x = _pos.x, y = _pos.y, z = _pos.z
      Promise.resolve().then(() => {
        if (velho) aoEventoDeRede({ tipo: 'portal-fechado', id: velho, local: true })
        aoEventoDeRede({ tipo: 'portal-aberto', id, x, y, z, yaw, dono: -1, local: true })
      })
      return
    }
    rede.abrirPortal(_pos.x, _pos.y, _pos.z, yaw)
  }

  // =========================================================================
  // 6. EVENTOS DE REDE
  // =========================================================================
  /**
   * 'portal-aberto'  { id, x, y, z, yaw, dono }
   * 'portal-fechado' { id }
   * O nome do tipo e normalizado (portal_aberto / portalAberto servem) e id
   * desconhecido e ignorado sem reclamar, como manda o contrato.
   */
  function aoEventoDeRede(ev) {
    if (!ev) return
    const tipo = String(ev.tipo || ev.t || ev.nome || '').toLowerCase().replace(/[^a-z]/g, '')
    if (tipo !== 'portalaberto' && tipo !== 'portalfechado') return

    const id = (ev.id !== undefined ? ev.id : (ev.portalId !== undefined ? ev.portalId : 0)) | 0
    if (!id) return

    // Id vindo da REDE so vale na faixa 3000..3999 do protocolo. Fora dela e
    // pacote torto ou de outra faixa (jogador, NPC, objeto), e aceitar isso
    // faria um portal responder ao fechamento de um objeto qualquer. Os ids do
    // modo local sao negativos e marcados com `local`, entao passam por fora.
    const doLocal = ev.local === true || id < 0
    if (!doLocal && !Proto.ehIdDePortal(id)) return

    if (tipo === 'portalfechado') {
      const p = portais.get(id)
      if (!p) return                       // ja fechou aqui: nada a fazer
      p.visual.fechar()
      return
    }

    // Abrir duas vezes o mesmo id (pacote confiavel repetido) nao pode abrir
    // dois portais nem reiniciar o crescimento: idempotencia do contrato.
    if (portais.has(id)) return

    const x = Number.isFinite(ev.x) ? ev.x : 0
    const y = Number.isFinite(ev.y) ? ev.y : (chaoEm(x, 0) + ALTURA_CENTRO)
    const z = Number.isFinite(ev.z) ? ev.z : 0
    const yaw = Number.isFinite(ev.yaw) ? ev.yaw : 0
    const dono = (ev.dono !== undefined ? ev.dono : 0) | 0

    // Rede de seguranca do "um portal por jogador": o dono viaja no
    // PORTAL_ABERTO justamente pra quem recebe poder apagar da tela o portal
    // antigo daquele dono mesmo que o PORTAL_FECHADO do velho tenha se perdido.
    // Fecha ANTES de abrir, na mesma ordem do servidor. Dono 0 e "ninguem" e
    // dono negativo e o modo local (que ja fecha o proprio velho no atirar()),
    // entao os dois ficam de fora — senao um portal sem dono apagaria o outro.
    if (dono > 0) {
      for (const [outroId, outro] of portais) {
        if (outroId === id) continue
        if (outro.dono !== dono) continue
        if (!outro.visual.fechando) outro.visual.fechar()
      }
    }

    const visual = criarPortal({ x, y, z, yaw })
    scene.add(visual.grupo)
    portais.set(id, {
      id, visual, x, y, z, yaw,
      dono,
      t: 0,
      // Quem conta a duracao e o SERVIDOR. `expira` so existe no modo local,
      // onde nao ha servidor nenhum pra contar.
      expira: ev.local ? PORTAL_DURACAO : 0,
    })

    // estalo de luz na abertura
    clarao.disparar(visual.grupo.position, 4.2, 0.4)
    luzPortal.position.set(x, y, z)
    luzPortal.intensity = 14

    const meu = ehLocal() ? ((dono === -1) || ev.local) : (meuId() && dono === meuId())
    if (meu) tremerImpulso(0.35)
  }

  /**
   * A conexao caiu. O servidor nao tem mais como mandar o 'portal-fechado',
   * entao quem limpa a MINHA tela sou eu — senao o portal fica aberto pra
   * sempre num mundo que ja nao existe.
   */
  function limparPorQueda() {
    let algum = false
    for (const p of portais.values()) {
      if (!p.visual.fechando) { p.visual.fechar(); algum = true }
    }
    if (algum) avisar('Conexao caiu: os portais fecharam.')
  }

  // =========================================================================
  // 7. ATRAVESSAR
  // =========================================================================
  function tentarAtravessar() {
    if (tempo < mortoAte) return
    if (!player || !player.position) return
    for (const p of portais.values()) {
      if (p.visual.fechando) continue
      if (p.visual.brilho < 0.6) continue          // ainda esta abrindo
      // O outro lado da trava do laco: um portal em cima da saida nao atravessa
      // ninguem, mesmo que tenha vindo do servidor ou de uma versao antiga.
      if (pertoDoDestino(p.x, p.z)) continue
      const dx = player.position.x - p.x
      const dz = player.position.z - p.z
      if (dx * dx + dz * dz > PORTAL_RAIO * PORTAL_RAIO) continue
      // o jogador tem que estar na ALTURA do portal, nao em cima de um telhado
      if (Math.abs((player.position.y + 0.9) - p.y) > ALTURA_TRAVESSIA) continue
      atravessar(p)
      return
    }
  }

  function atravessar(p) {
    mortoAte = tempo + TEMPO_MORTO
    // O destino e do mundo compartilhado (MUNDO.PORTAL_DESTINO): todo mundo
    // sai no mesmo lugar, dentro da barbearia.
    if (player && typeof player.teleport === 'function') {
      player.teleport(PORTAL_DESTINO.x, PORTAL_DESTINO.z, PORTAL_DESTINO.yaw)
    }
    p.visual.piscar(1.6)
    overlayT = DUR_OVERLAY
    tremerImpulso(1.1)
    avisar('Voce atravessou o portal.')
  }

  // =========================================================================
  // 8. QUADRO
  // =========================================================================
  function atualizarOverlay(dt) {
    if (overlayT <= 0) {
      if (overlay && overlay.style.opacity !== '0') overlay.style.opacity = '0'
      return
    }
    overlayT = Math.max(0, overlayT - dt)
    const el = pegarOverlay()
    if (!el) return
    // estoura na hora e apaga devagar
    const k = overlayT / DUR_OVERLAY
    el.style.opacity = String(Math.pow(k, 1.7).toFixed(3))
  }

  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1
    tempo += dt
    if (recarga > 0) recarga = Math.max(0, recarga - dt)

    // --- a conexao caiu com portal aberto? ---------------------------------
    // Interessa a BORDA (estava conectado e caiu), nao o estado: antes do
    // BEMVINDO tambem nao ha conexao, e ali nao ha nada pra limpar.
    if (rede && typeof rede.abrirPortal === 'function') {
      const agora = !!rede.conectado
      if (conectadoAntes && !agora) limparPorQueda()
      conectadoAntes = agora
    }

    // --- a arma -------------------------------------------------------------
    arma.atualizar(dt)
    if (!equipado) {
      // largada: gira devagar e flutua — o convite pra chegar perto
      pivo.rotation.y += dt * 0.7
      pivo.position.y = Math.sin(tempo * 1.25) * 0.05
      arma.grupo.rotation.z = 0.12 + Math.sin(tempo * 0.9) * 0.05
    }
    // a luz mora no frasco, largada ou na mao
    _a.copy(arma.bicoLocal)
    arma.grupo.localToWorld(_a)
    luzArma.position.copy(_a)
    const pulso = 0.85 + Math.sin(tempo * 2.6) * 0.2
    luzArma.intensity = (equipado ? 0.6 : 0.75) * pulso
    luzArma.distance = equipado ? 2.6 : 3.2

    // --- os portais ---------------------------------------------------------
    let perto = null
    let melhorD = Infinity
    camera.getWorldPosition(_a)
    for (const p of portais.values()) {
      p.t += dt
      p.visual.atualizar(dt)
      if (p.visual.morto) continue
      // No modo LOCAL nao existe servidor pra contar a duracao; com servidor,
      // `expira` e 0 e o portal so fecha no 'portal-fechado' que vier de la.
      if (p.expira && p.t > p.expira) p.visual.fechar()
      const d = (p.x - _a.x) ** 2 + (p.y - _a.y) ** 2 + (p.z - _a.z) ** 2
      if (d < melhorD) { melhorD = d; perto = p }
    }
    // remove os que terminaram de encolher
    for (const [id, p] of portais) {
      if (p.visual.morto) {
        p.visual.dispose()
        portais.delete(id)
        // o meu portal local morreu sozinho: nao ha mais velho pra fechar
        if (id === meuPortalLocal) meuPortalLocal = 0
      }
    }

    // luz do portal mais perto da camera (ver o comentario do orcamento)
    if (perto) {
      // empurrada pra FRENTE do portal: e assim que ela lambe o chao e a
      // parede em vez de ficar presa no plano do redemoinho
      _dir.set(0, 0, 1).applyAxisAngle(_EIXO_Y, perto.yaw)
      luzPortal.position.set(
        perto.x + _dir.x * 0.35, perto.y - 0.35, perto.z + _dir.z * 0.35,
      )
      const alvo = (7.5 + Math.sin(tempo * 3.1) * 1.1) * perto.visual.brilho
      luzPortal.intensity += (alvo - luzPortal.intensity) * Math.min(1, dt * 9)
    } else {
      luzPortal.intensity += (0 - luzPortal.intensity) * Math.min(1, dt * 9)
    }

    tentarAtravessar()
    atualizarOverlay(dt)
    clarao.atualizar(dt)

    // --- tranco de camera ---------------------------------------------------
    tremorF = Math.max(0, tremorF - dt * 3.2)
    const amp = tremorF * tremorF * 0.022
    tremor.x = Math.sin(tempo * 44.0) * amp
    tremor.y = Math.cos(tempo * 35.7) * amp * 0.8
  }

  // =========================================================================
  // 9. LIMPEZA
  // =========================================================================
  function dispose() {
    for (const p of portais.values()) p.visual.dispose()
    portais.clear()
    liberarGeometriasDoPortal()
    clarao.dispose()
    arma.dispose()
    scene.remove(luzArma, luzPortal)
    if (grupoNoMundo.parent) grupoNoMundo.parent.remove(grupoNoMundo)
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay)
    overlay = null
  }

  return {
    grupoNoMundo,
    interactable,
    equipar,
    desequipar,
    atirar,
    atualizar,
    aoEventoDeRede,
    portais,
    tremor,                    // {x,y} em RADIANOS, pra somar na rotacao da camera
    dispose,
    get equipado() { return equipado },
    get ultimoPedido() { return pediuEm },
  }
}

// ---------------------------------------------------------------------------
// SUPOSICOES sobre os outros modulos:
//
//   rede.abrirPortal(x, y, z, yaw)   pedido; o servidor responde com o evento
//   rede.conectado                   booleano; cair pra false fecha os portais
//   rede.meuId                       numero (funcao tambem serve)
//
// O cliente de rede deve chamar portalgun.aoEventoDeRede(ev) com:
//   { tipo:'portal-aberto',  id, x, y, z, yaw, dono }
//   { tipo:'portal-fechado', id }
// O nome do tipo e normalizado (portal_aberto/portalAberto servem).
//
// O main deve:
//   - adicionar portalgun.grupoNoMundo na cena e registrar o interactable;
//   - chamar portalgun.atualizar(dt) todo quadro;
//   - chamar portalgun.atirar() no clique enquanto equipado;
//   - somar portalgun.tremor.x/.y na rotacao da camera DEPOIS de player.update;
//   - repassar os eventos 'portal-aberto'/'portal-fechado' do servidor.
//
// Sem `rede` (ou sem rede.abrirPortal) o modulo entra em modo local: responde
// ao proprio pedido e conta ele mesmo os MUNDO.PORTAL_DURACAO segundos, so pra
// continuar jogavel sozinho. Com servidor, ele nunca decide nada.
// ---------------------------------------------------------------------------
