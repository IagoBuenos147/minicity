import * as THREE from 'three'
import { PLAYER, CAMERA } from './config.js'
import { createEngine } from './core/engine.js'
import { createInput } from './core/input.js'
import { createCollisionWorld } from './systems/collision.js'
import { createInteractionSystem } from './systems/interaction.js'
import { createLighting } from './world/lighting.js'
import { buildCity } from './world/city.js'
import { buildBarbershop } from './world/barbershop.js'
import { buildGrocery } from './world/grocery.js'
import { bakeStatic } from './world/bake.js'
import { BARBER, GROCERY, FILLERS, WALL_T } from './world/layout.js'
import { createCharacter } from './player/character.js'
import { defaultAppearance } from './player/appearance.js'
import { createPlayerController } from './player/controller.js'
import { createHUD } from './ui/hud.js'
import { createCustomizer } from './ui/customizer.js'
import { criarRede } from './rede/cliente-rede.js'
import { criarAvatares } from './rede/avatares.js'
import { criarAnel } from './poder/anel.js'
import { criarPortalGun } from './poder/portalgun.js'
import { criarHotbar } from './ui/hotbar.js'
import { ITEM_PORTAL_GUN, ITENS_PORTAL_GUN } from './comum/protocolo.js'
import { criarDialogo } from './ui/dialogo.js'
import { buildAgarraveis } from './world/agarraveis.js'
import { TICK_HZ, NPCS } from './comum/mundo.js'

// ---------------------------------------------------------------------------
// Integracao de tudo + game loop.
// ---------------------------------------------------------------------------

const container = document.getElementById('app')
const engine = createEngine(container)
const { scene, camera, renderer } = engine
const input = createInput(renderer.domElement)
const collision = createCollisionWorld()
const interaction = createInteractionSystem()
const hud = createHUD()
const lighting = createLighting(scene, renderer)

// --- Personagem do jogador -------------------------------------------------
const appearance = defaultAppearance()
const character = createCharacter({ appearance })
scene.add(character.root)

const player = createPlayerController({ camera, character, input, collision, scene })
player.teleport(2, 9, 0) // rua principal, olhando para o cruzamento e as lojas

// --- Objeto game (passado para builders e UI) ------------------------------
const moduleUpdates = []
const propUpdates = []

const game = {
  scene, camera, renderer, engine, input, collision, interaction,
  hud, lighting, player, character, appearance,
  time: 0,

  addColliders(list) { collision.add(list) },
  addInteractables(list) { interaction.add(list) },

  toast(msg, ms) { hud.toast(msg, ms) },

  setAppearance(partial) {
    Object.assign(appearance, partial)
    character.setAppearance(appearance)
    // em 1a pessoa a cabeca continua escondida
    character.setVisibleBody(player.mode === 'third' || preview.active)
  },

  openCustomizer(kind, opts) {
    customizer.open(kind || 'all', opts)
  },

  beginPreview(focus) { startPreview(focus) },
  endPreview() { stopPreview() },

  // Sentar num banco. spot vem do interactable criado por city.js a partir de
  // props.userData.seats.
  sitPlayer(spot) {
    if (!spot || player.sitting) return
    if (player.sitOn(spot)) {
      player.setMode('third')            // sentado so faz sentido se der pra ver
      hud.toast('Sentou. Aperte E para levantar.')
    }
  },
  standPlayer() {
    if (player.sitting) player.standUp()
  },
}

const customizer = createCustomizer(game)
game.customizer = customizer

// ===========================================================================
// ONLINE. Mundo compartilhado: o servidor e dono do mundo, eu sou dono so do
// meu corpo. Se o servidor nao responder, o jogo continua jogavel sozinho.
// ===========================================================================
const meuNome = (() => {
  let n = null
  try { n = localStorage.getItem('mcrp-nome') } catch (err) { void err }
  if (!n) {
    n = 'Jogador' + (100 + Math.floor(Math.random() * 900))
    try { localStorage.setItem('mcrp-nome', n) } catch (err) { void err }
  }
  return n
})()

const rede = criarRede({ nome: meuNome, aparencia: appearance })
game.rede = rede
const avatares = criarAvatares(scene)

// Mapa interacao -> NPC. E por aqui que o "E" vira um PEDIDO ao servidor em
// vez de o cliente decidir sozinho que a conversa comecou.
const NPC_DA_INTERACAO = { 'barber-talk': 1000, 'grocery-clerk': 1002 }

const dialogo = criarDialogo({
  camera, rede,
  aoEscolher(i) {
    rede.escolha(i)
    // A primeira opcao do barbeiro e do mercador e a que "faz" alguma coisa.
    const npcId = dialogo.npcId
    if (npcId === 1000 && i === 0) game.openCustomizer('hair')
    if (npcId === 1002 && i === 0) game.toast('Voce comprou um refrigerante. -R$ 5')
    if (i === (NPCS.find((n) => n.id === npcId)?.opcoes.length || 1) - 1) {
      rede.sairDialogo()
      dialogo.fechar(npcId)
    }
  },
})
game.dialogo = dialogo

// Os eventos do servidor viram acao no jogo. Nada aqui decide nada sozinho.
rede.aoEvento = (ev) => {
  switch (ev.tipo) {
    case 'dialogo': dialogo.abrir(ev); break
    case 'dialogo-fim': dialogo.fechar(ev.npcId); break
    case 'negado':
      if (ev.oque === 1) hud.toast('Alguem ja esta falando com essa pessoa.')
      else hud.toast('Esse objeto ja esta com outro jogador.')
      anel.aoEventoDeRede(ev)
      break
    case 'entrou': hud.toast(ev.nome + ' entrou'); break
    case 'saiu': hud.toast('um jogador saiu'); break
    case 'obj-dono': case 'obj-destruido': anel.aoEventoDeRede(ev); break
    case 'portal-aberto': case 'portal-fechado': portalgun.aoEventoDeRede(ev); break
    case 'bemvindo':
      // o servidor guarda o inventario por nome: quem volta ja chega com a arma
      if ((ev.itens | 0) & ITENS_PORTAL_GUN) hotbar.marcarDisponivel(2, true)
      break
    default: break
  }
}


function registerCameraOccluders(col) {
  if (!col || !col.addOccluder) return
  // predios de cenario: caixa cheia
  for (const b of FILLERS) col.addOccluder(b.x0, 0, b.z0, b.x1, b.h, b.z1, 'predio')
  // lojas: as 4 paredes, com o vao da porta livre, pra camera funcionar tambem
  // DENTRO delas (uma caixa cheia deixaria o interior inteiro sem oclusao)
  for (const b of [BARBER, GROCERY]) {
    const h = b.wallHeight
    const T = WALL_T
    col.addOccluder(b.x0, 0, b.z0, b.x0 + T, h, b.z1, 'parede')          // oeste
    col.addOccluder(b.x1 - T, 0, b.z0, b.x1, h, b.z1, 'parede')          // leste
    col.addOccluder(b.x0, 0, b.z0, b.x1, h, b.z0 + T, 'parede')          // fundos
    // fachada partida pelo vao da porta
    const dl = b.door.center - b.door.width / 2
    const dr = b.door.center + b.door.width / 2
    col.addOccluder(b.x0, 0, b.z1 - T, dl, h, b.z1, 'fachada')
    col.addOccluder(dr, 0, b.z1 - T, b.x1, h, b.z1, 'fachada')
    col.addOccluder(dl, b.door.height, b.z1 - T, dr, h, b.z1, 'verga')
  }
}

// --- Mundo -----------------------------------------------------------------
function mount(result, name) {
  if (!result) { console.warn('modulo sem retorno:', name); return }
  if (result.group) scene.add(result.group)
  if (result.colliders) collision.add(result.colliders)
  if (result.interactables) interaction.add(result.interactables)
  if (typeof result.update === 'function') moduleUpdates.push(result.update)
}

const city = buildCity(game)
mount(city, 'city')

// Os interiores sao visiveis da rua pelas vitrines, entao o culling nao ajuda:
// funde os moveis estaticos por material (NPCs e props animados ficam de fora).
const barber = buildBarbershop(game)
mount(barber, 'barbershop')
const grocery = buildGrocery(game)
mount(grocery, 'grocery')
if (barber && barber.group) console.info('barbearia:', bakeStatic(barber.group))
if (grocery && grocery.group) console.info('mercearia:', bakeStatic(grocery.group))

// Objetos que o anel levita. Ficam FORA do forno de geometria: eles se mexem.
const agarraveis = buildAgarraveis()
scene.add(agarraveis.group)

// O anel so pode nascer depois dos objetos: ele precisa saber quais meshes
// sao agarraveis, e o groundY so existe depois que a cidade foi montada.
const anel = criarAnel({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction,
})
game.anel = anel
if (anel.grupoNoChao) scene.add(anel.grupoNoChao)
if (anel.interactable) interaction.add(anel.interactable)
for (const [id, mesh] of agarraveis.meshes) anel.registrarObjeto(id, mesh)

// --- arma de portal + barra de itens ---------------------------------------
const portalgun = criarPortalGun({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction,
})
game.portalgun = portalgun
if (portalgun.grupoNoMundo) scene.add(portalgun.grupoNoMundo)
if (portalgun.interactable) interaction.add(portalgun.interactable)

// 1 maos, 2 anel, 3 arma de portal. O slot fica travado ate pegar o item.
const hotbar = criarHotbar({
  aoTrocar(indice, chave) {
    if (chave !== 'anel' && anel.equipado) anel.desequipar()
    if (chave !== 'portal' && portalgun.equipado) portalgun.desequipar()
    if (chave === 'anel' && !anel.equipado) anel.equipar()
    if (chave === 'portal' && !portalgun.equipado) portalgun.equipar()
  },
})
game.hotbar = hotbar
hotbar.marcarDisponivel(1, false)
hotbar.marcarDisponivel(2, false)

/** Chamado quando um item e pego: libera o slot e ja poe na mao. */
game.pegouItem = (chave) => {
  const i = hotbar.indiceDe ? hotbar.indiceDe(chave) : (chave === 'anel' ? 1 : 2)
  hotbar.marcarDisponivel(i, true)
  hotbar.selecionar(i)
  if (chave === 'portal' && rede.conectado) rede.pegarItem(ITEM_PORTAL_GUN)
}

// Altura do chao: calcada (0.16), parque, beco e piso das lojas. Sem isso o
// personagem anda com os pes enterrados no concreto.
if (city && typeof city.groundY === 'function') {
  game.groundY = city.groundY
  if (typeof player.setGroundSampler === 'function') player.setGroundSampler(city.groundY)
} else {
  game.groundY = () => 0
}

// Occluders da camera: caixas COM altura, so do que realmente tapa a visao.
// Os colisores comuns sao chapas XZ sem altura; se a camera usasse eles, um
// banco de 45 cm a faria pular pra cima do personagem toda vez que girasse.
registerCameraOccluders(collision)
// e os que a propria cidade mediu (fonte, abrigo de onibus, cacambas)
if (city && Array.isArray(city.occluders)) {
  for (const o of city.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag)
  }
}

// Ciclo dia/noite acende/apaga a iluminacao publica.
const lampLights = (city && city.lampLights) || []
const lampMats = (city && city.lampMaterials) || []
lighting.onNight = (isNight) => {
  for (const l of lampLights) l.visible = isNight
  for (const m of lampMats) m.emissiveIntensity = isNight ? 1.6 : 0.12
}
if (typeof lighting.isNight === 'boolean') lighting.onNight(lighting.isNight)

// props que se animam sozinhos (poste de barbeiro, semaforo, etc.)
scene.traverse((o) => {
  if (o.userData && typeof o.userData.update === 'function') propUpdates.push(o.userData.update)
})

// --- Camera de preview (customizacao) --------------------------------------
const preview = { active: false, focus: 'head', t: 0, savedMode: 'third' }
const _pv = new THREE.Vector3()
const _pf = new THREE.Vector3()

function startPreview(focus) {
  preview.active = true
  preview.focus = focus || 'head'
  preview.t = 0
  preview.savedMode = player.mode
  player.setLocked(true)
  character.setVisibleBody(true)
  input.exitLock()
  hud.setCrosshair(false)
  hud.setPrompt(null)
}

function stopPreview() {
  if (!preview.active) return
  preview.active = false
  player.setLocked(false)
  character.setVisibleBody(preview.savedMode === 'third')
  hud.setCrosshair(preview.savedMode === 'first')
  // volta o FOV que o controller usa no modo salvo
  camera.fov = preview.savedMode === 'first' ? CAMERA.FOV_FP : CAMERA.FOV_TP
  camera.updateProjectionMatrix()
  // fechar o painel e um gesto do usuario, entao da pra re-travar o mouse na hora
  if (started) { try { input.requestLock() } catch (err) { void err } }
}

function updatePreview(dt) {
  preview.t += dt
  const root = character.root
  const yaw = root.rotation.y
  const headY = preview.focus === 'head' ? PLAYER.EYE_HEIGHT + 0.05 : 1.05
  const dist = preview.focus === 'head' ? 1.15 : 2.6
  // orbita lenta em frente ao rosto
  const a = yaw + Math.sin(preview.t * 0.35) * 0.5
  _pf.set(root.position.x, headY, root.position.z)
  _pv.set(
    root.position.x + Math.sin(a) * dist,
    headY + (preview.focus === 'head' ? 0.06 : 0.35),
    root.position.z + Math.cos(a) * dist,
  )
  camera.position.lerp(_pv, 1 - Math.pow(0.001, dt))
  camera.lookAt(_pf)
  const targetFov = preview.focus === 'head' ? 42 : 55
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 6)
  camera.updateProjectionMatrix()
}

// --- Tela inicial ----------------------------------------------------------
let started = false
// a tela inicial ja lista os controles; o painel do HUD sairia duplicado atras
hud.showHelp(false)
hud.showStart(() => {
  started = true
  input.requestLock()
  hud.hideStart()
  hud.showHelp(true)
})

renderer.domElement.addEventListener('click', () => {
  if (!started) return
  if (customizer.isOpen() || preview.active) return
  input.requestLock()
})

// O gatilho da arma de portal. O anel escuta o proprio mousedown; a arma nao,
// porque quem sabe se ela esta selecionada na barra e o main.
window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  if (!started || customizer.isOpen() || preview.active) return
  if (!input.isLocked()) return          // so com o ponteiro travado
  if (portalgun.equipado) portalgun.atirar()
})

// --- Loop ------------------------------------------------------------------
let helpOn = true
let envioAcc = 0
let fpsAtual = 0
let fpsAcc = 0, fpsCount = 0, fpsTimer = 0
const clock = engine.clock

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  game.time += dt

  // ajuda (Tab)
  if (input.wasPressed('Tab')) hud.showHelp(helpOn = !helpOn)
  if (input.wasPressed('F3')) hud.toggleF3()
  if (input.wasPressed('Digit1')) hotbar.selecionar(0)
  if (input.wasPressed('Digit2')) hotbar.selecionar(1)
  if (input.wasPressed('Digit3')) hotbar.selecionar(2)

  if (!preview.active) {
    player.update(dt)
    hud.setMode(player.mode)
    hud.setCrosshair(player.mode === 'first')
  } else {
    updatePreview(dt)
  }

  // interacao
  if (!preview.active && !customizer.isOpen()) {
    if (player.sitting) {
      hud.setPrompt('Levantar')
      if (input.wasPressed('KeyE')) player.standUp()
    } else {
      const hit = interaction.update(player.position)
      hud.setPrompt(hit ? hit.label : null)
      if (hit && input.wasPressed('KeyE')) {
        // Pegar um item destrava o slot na barra e ja poe na mao.
        // Sem 'return' aqui: isto roda DENTRO do frame, e sair cedo pularia o
        // render e a luz deste quadro (um engasgo visivel ao pegar o item).
        const item = hit.id === 'anel-verde' ? 'anel' : (hit.id === 'portal-gun' ? 'portal' : null)
        const npcId = item ? 0 : NPC_DA_INTERACAO[hit.id]
        if (item) {
          interaction.trigger(game)
          game.pegouItem(item)
        } else
        if (npcId && rede.conectado) {
          // Nao abre a conversa aqui: PEDE. Quem decide se o NPC esta livre,
          // e quem avisa os outros jogadores, e o servidor.
          rede.falar(npcId)
        } else {
          interaction.trigger(game)
        }
      }
    }
  }

  // ---- online ----
  rede.atualizar(dt)
  avatares.sincronizar(rede.jogadores, rede.meuId, dt)

  // Meu corpo sobe a 15 Hz, o mesmo ritmo do servidor. Mandar a 60 so gastaria
  // banda: o servidor nao tem o que fazer com o quadro do meio.
  envioAcc += dt
  if (envioAcc >= 1 / TICK_HZ) {
    envioAcc = 0
    const st = player.getState ? player.getState() : {}
    const anim = player.sitting ? 4
      : (!player.grounded ? 3 : (player.speed > 3.4 ? 2 : (player.speed > 0.2 ? 1 : 0)))
    const flags = (player.sitting ? 1 : 0) | (anel.equipado ? 2 : 0)
    rede.enviarMeuEstado(
      player.position.x, player.position.y, player.position.z,
      character.root.rotation.y, anim, flags,
    )
    void st
  }

  anel.atualizar(dt)
  portalgun.atualizar(dt)
  dialogo.atualizar(player.position)

  // tranco de camera do anel (agarrar/arremessar), somado depois da camera
  for (const t of [anel.tremor, portalgun.tremor]) {
    if (t && (t.x || t.y)) { camera.rotation.x += t.x; camera.rotation.y += t.y }
  }

  lighting.setTarget(player.position)
  lighting.update(dt)

  for (let i = 0; i < moduleUpdates.length; i++) moduleUpdates[i](dt, game)
  for (let i = 0; i < propUpdates.length; i++) propUpdates[i](dt, game)

  engine.render()
  input.endFrame()

  // fps
  fpsAcc += dt; fpsCount++
  fpsTimer += dt
  if (fpsTimer >= 0.5) {
    fpsAtual = Math.round(fpsCount / fpsAcc)
    hud.setFps(fpsAtual)
    hud.setRede(fpsAtual, rede.conectado ? rede.stats : null,
      rede.conectado ? 'online' : (rede.recusado ? 'recu