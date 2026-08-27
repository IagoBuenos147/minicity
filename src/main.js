import * as THREE from 'three'
import { PLAYER, CAMERA } from './config.js'
import { createEngine } from './core/engine.js'
import { createInput } from './core/input.js'
import { createCollisionWorld } from './systems/collision.js'
import { createInteractionSystem } from './systems/interaction.js'
import { createLighting } from './world/lighting.js'
import { criarPoolDeEfeito } from './render/luzes-efeito.js'
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
import { criarVeiculos } from './veiculos/veiculos.js'
import { criarHotbar } from './ui/hotbar.js'
import { criarClima } from './world/clima.js'
import { criarRevolver } from './armas/revolver.js'
import { criarZumbi } from './npc/zumbi.js'
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

// Pool de luzes de efeito. DUAS PointLight reais pra cena inteira: o anel, o
// objeto levitado, a arma de portal, o portal, o clarao do tiro e a aura do
// zumbi disputam essas duas por quadro (ver src/render/luzes-efeito.js). Elas
// nascem aqui, junto com a cena, porque a quantidade de luzes da cena tem que
// ser CONSTANTE — o three recompila todos os materiais quando ela muda.
const poolLuz = criarPoolDeEfeito(scene, 2, camera)

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
  hud, lighting, poolLuz, player, character, appearance,
  time: 0,

  addColliders(list) { collision.add(list) },
  addInteractables(list) { interaction.add(list) },

  toast(msg, ms) { hud.toast(msg, ms) },

  setAppearance(partial) {
    Object.assign(appearance, partial)
    character.setAppearance(appearance)
    // E AQUI que o visual vira coisa dos outros jogadores. Sem esta linha o
    // barbeiro so mudava o boneco desta tela: MINHA_APARENCIA nunca saia e o
    // servidor nunca guardava nada.
    if (rede && typeof rede.enviarAparencia === 'function') rede.enviarAparencia(appearance)
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

// Como cada veiculo aparece no prompt do E. Sem isto sai "Entrar no moto".
const NOME_VEICULO = {
  carro: 'no carro',
  moto: 'na moto',
  skate: 'no skate',
  helicoptero: 'no helicoptero',
}

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
      // 1 npc, 2 objeto, 3 veiculo. O veiculo NAO leva toast aqui: quem avisa
      // e o proprio sistema de veiculos, e o jogador levaria a mensagem em
      // dobro (uma delas falando de objeto, que nem e o caso).
      if (ev.oque === 1) hud.toast('Alguem ja esta falando com essa pessoa.')
      else if (ev.oque === 2) hud.toast('Esse objeto ja esta com outro jogador.')
      anel.aoEventoDeRede(ev)
      veiculos.aoEventoDeRede(ev)
      break
    case 'veiculo-dono': case 'veiculo-pos': case 'heli-criado':
      veiculos.aoEventoDeRede(ev); break
    case 'entrou': hud.toast(ev.nome + ' entrou'); break
    case 'saiu': hud.toast('um jogador saiu'); break
    case 'obj-dono': case 'obj-destruido': anel.aoEventoDeRede(ev); break
    case 'portal-aberto': case 'portal-fechado': portalgun.aoEventoDeRede(ev); break
    case 'bemvindo':
      // o servidor guarda o inventario por nome: quem volta ja chega com a arma
      if ((ev.itens | 0) & ITENS_PORTAL_GUN) {
        hotbar.marcarDisponivel(2, true)
        // quem volta ja com a arma nao pode ve-la de novo largada na cidade
        if (typeof portalgun.marcarPego === 'function') portalgun.marcarPego()
      }
      // ...e guarda o VISUAL tambem. Sem aplicar aqui, quem recarrega a pagina
      // perde a cara que escolheu, mesmo com o servidor tendo guardado certo.
      if (ev.aparencia) {
        Object.assign(appearance, ev.aparencia)
        character.setAppearance(appearance)
      }
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

// Altura do chao: calcada (0.16), parque, beco e piso das lojas. Sem isso o
// personagem anda com os pes enterrados no concreto.
if (city && typeof city.groundY === 'function') {
  game.groundY = city.groundY
  if (typeof player.setGroundSampler === 'function') player.setGroundSampler(city.groundY)
} else {
  game.groundY = () => 0
}

// Objetos que o anel levita. Ficam FORA do forno de geometria: eles se mexem.
const agarraveis = buildAgarraveis()
scene.add(agarraveis.group)

// O anel so pode nascer depois dos objetos: ele precisa saber quais meshes
// sao agarraveis, e o groundY so existe depois que a cidade foi montada.
const anel = criarAnel({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction, poolLuz,
})
game.anel = anel
if (anel.grupoNoChao) scene.add(anel.grupoNoChao)
if (anel.interactable) interaction.add(anel.interactable)
for (const [id, mesh] of agarraveis.meshes) anel.registrarObjeto(id, mesh)

// --- arma de portal + barra de itens ---------------------------------------
const portalgun = criarPortalGun({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction, poolLuz,
})
game.portalgun = portalgun
if (portalgun.grupoNoMundo) scene.add(portalgun.grupoNoMundo)
if (portalgun.interactable) interaction.add(portalgun.interactable)

// --- veiculos --------------------------------------------------------------
// Depois da cidade (precisa do groundY e dos colisores) e do anel (que cria o
// helicoptero quando a montagem termina).
const veiculos = criarVeiculos({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction,
})
game.veiculos = veiculos
scene.add(veiculos.grupo)

// --- chuva, revolver e o NPC que vira zumbi --------------------------------
const clima = criarClima({ scene, camera, renderer, lighting, groundY: (x, z) => game.groundY(x, z), inicial: 0.45 })
game.clima = clima
if (clima.grupo) scene.add(clima.grupo)

const revolver = criarRevolver({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z), interaction, poolLuz,
})
game.revolver = revolver
if (revolver.grupoNoMundo) scene.add(revolver.grupoNoMundo)
if (revolver.interactable) interaction.add(revolver.interactable)

const zumbi = criarZumbi({
  scene, player, character, collision, hud, rede,
  groundY: (x, z) => game.groundY(x, z), interaction, poolLuz,
})
game.zumbi = zumbi
if (zumbi.grupo) scene.add(zumbi.grupo)
if (zumbi.interactable) interaction.add(zumbi.interactable)

// O tiro do revolver so vira dano porque alguem liga uma ponta na outra: o
// revolver diz ONDE acertou, o zumbi diz se aquilo era cabeca ou corpo.
revolver.aoAcerto = (info) => {
  if (!info || !info.objeto) return
  const u = zumbi.grupo && zumbi.grupo.userData
  const parte = u && typeof u.parteAtingida === 'function' ? u.parteAtingida(info.objeto) : null
  if (parte) zumbi.levarTiro(parte, info)
}

// 1 maos, 2 anel, 3 arma de portal, 4 revolver. Slot travado ate pegar o item.
const hotbar = criarHotbar({
  aoTrocar(indice, chave) {
    if (chave !== 'anel' && anel.equipado) anel.desequipar()
    if (chave !== 'portal' && portalgun.equipado) portalgun.desequipar()
    if (chave !== 'revolver' && revolver.equipado) revolver.desequipar()
    if (chave === 'anel' && !anel.equipado) anel.equipar()
    if (chave === 'portal' && !portalgun.equipado) portalgun.equipar()
    if (chave === 'revolver' && !revolver.equipado) revolver.equipar()
  },
})
game.hotbar = hotbar
hotbar.marcarDisponivel(1, false)
hotbar.marcarDisponivel(2, false)
hotbar.marcarDisponivel(3, false)   // revolver: so depois de achar no beco

/** Chamado quando um item e pego: libera o slot e ja poe na mao. */
game.pegouItem = (chave) => {
  const i = hotbar.indiceDe ? hotbar.indiceDe(chave) : (chave === 'anel' ? 1 : 2)
  hotbar.marcarDisponivel(i, true)
  hotbar.selecionar(i)
  if (chave === 'portal' && rede.conectado) rede.pegarItem(ITEM_PORTAL_GUN)
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
// Onde a camera fica em cada categoria que o customizador abre. O customizer
// chama game.beginPreview(foco) a cada troca de aba.
//   y     altura do alvo acima dos pes (quando nao ha 'parte')
//   dist  distancia da camera ao alvo
//   alto  quanto a camera sobe alem do alvo
//   parte junta do character a seguir (mao, pe): melhor que altura fixa
const FOCOS = {
  rosto: { y: 1.60, dist: 1.15, alto: 0.04, fov: 40 },
  corpo: { y: 1.00, dist: 3.30, alto: 0.25, fov: 52 },
  pescoco: { y: 1.38, dist: 1.05, alto: 0.02, fov: 42 },
  pes: { y: 0.16, dist: 1.40, alto: 0.55, fov: 46, parte: 'footL' },
  mao: { y: 0.90, dist: 0.75, alto: 0.05, fov: 40, parte: 'handL' },
  braco: { y: 1.15, dist: 1.15, alto: 0.05, fov: 44, parte: 'armLLower' },
  // nomes antigos, pra nao quebrar quem ainda chama assim
  head: { y: 1.60, dist: 1.15, alto: 0.04, fov: 40 },
  body: { y: 1.00, dist: 3.30, alto: 0.25, fov: 52 },
}

const preview = { active: false, focus: 'rosto', t: 0, savedMode: 'third', yaw: 0, pitch: 0.05, slotAntes: -1 }
const _pv = new THREE.Vector3()
const _pf = new THREE.Vector3()

// --- girar a camera do provador/barbeiro arrastando o mouse ---------------
let arrastando = false
let arrasteX = 0
let arrasteY = 0

function preMouseDown(e) {
  if (!preview.active || e.button !== 0) return
  // clique no painel do customizador nao gira a camera
  if (e.target && e.target.closest && e.target.closest('.mcrp-customizer, [class*="customizer"], button')) return
  arrastando = true
  arrasteX = e.clientX
  arrasteY = e.clientY
}
function preMouseMove(e) {
  if (!arrastando || !preview.active) return
  preview.yaw -= (e.clientX - arrasteX) * 0.008
  preview.pitch = Math.max(-0.75, Math.min(0.85, preview.pitch - (e.clientY - arrasteY) * 0.006))
  arrasteX = e.clientX
  arrasteY = e.clientY
}
function preMouseUp() { arrastando = false }

window.addEventListener('mousedown', preMouseDown)
window.addEventListener('mousemove', preMouseMove)
window.addEventListener('mouseup', preMouseUp)

function startPreview(focus) {
  const jaAberto = preview.active
  preview.active = true
  preview.focus = focus || 'rosto'
  preview.t = 0
  // trocar de aba NAO reseta o angulo: o jogador girou pra ver de costas e
  // perderia isso a cada categoria
  if (!jaAberto) { preview.yaw = 0; preview.pitch = 0.05 }
  arrastando = false
  preview.savedMode = player.mode
  // Guarda o que estava na mao e ESVAZIA a mao: a arma de 1a pessoa e filha da
  // camera, entao no close do rosto ela apareceria gigante na frente do
  // barbeiro. Volta pro mesmo slot ao fechar o painel.
  if (!jaAberto) {
    preview.slotAntes = hotbar && typeof hotbar.selecionado === 'number' ? hotbar.selecionado : -1
    if (hotbar && preview.slotAntes > 0) hotbar.selecionar(0)
  }
  player.setLocked(true)
  character.setVisibleBody(true)
  input.exitLock()
  hud.setCrosshair(false)
  hud.setPrompt(null)
}

function stopPreview() {
  if (!preview.active) return
  preview.active = false
  // devolve pra mao o que estava equipado antes de sentar na cadeira
  if (hotbar && preview.slotAntes > 0) {
    hotbar.selecionar(preview.slotAntes)
    preview.slotAntes = -1
  }
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

  // --- 1) o mouse gira a camera em volta do personagem --------------------
  // Antes isto era uma orbita automatica por seno: o jogador nao controlava
  // nada e nao conseguia se ver de costas.
  // (o giro vem de arrastar com o mouse; ver os listeners de preview abaixo.
  //  Aqui nao da pra usar input.mouseDelta: no preview o ponteiro fica LIVRE
  //  pra clicar nos botoes do painel, e sem pointer lock nao ha delta.)

  // --- 2) alvo e distancia conforme a parte que esta sendo mexida ---------
  const f = FOCOS[preview.focus] || FOCOS.rosto
  const py = root.position.y
  let alvoY = py + f.y
  let distBase = f.dist

  // partes que moram numa junta (mao, pe) sao seguidas de verdade, senao a
  // camera aponta pro ar quando o boneco muda de proporcao
  if (f.parte && character.parts && character.parts[f.parte]) {
    character.parts[f.parte].getWorldPosition(_pf)
    alvoY = _pf.y
  }

  _pf.set(root.position.x, alvoY, root.position.z)
  if (f.parte && character.parts && character.parts[f.parte]) {
    character.parts[f.parte].getWorldPosition(_pf)
  }

  // --- 3) posicao na orbita ------------------------------------------------
  // O angulo e relativo a FRENTE do personagem: preview.yaw 0 = DE FRENTE.
  // Cuidado com o sinal, que ja esteve errado e mostrava a nuca:
  //   o corpo e desenhado com root.rotation.y = bodyYaw = yaw + PI (o modelo
  //   nasce olhando pro +Z local, e esse PI e a correcao disso), enquanto a
  //   frente do jogador e _fwd = (-sin yaw, -cos yaw) — ver controller.js.
  //   Logo (sin(bodyYaw), cos(bodyYaw)) == (-sin yaw, -cos yaw) == a frente.
  // Somar mais um PI aqui punha a camera do outro lado.
  const ang = root.rotation.y + preview.yaw
  const cp = Math.cos(preview.pitch)
  _pv.set(
    _pf.x + Math.sin(ang) * cp * distBase,
    _pf.y + Math.sin(preview.pitch) * distBase + f.alto,
    _pf.z + Math.cos(ang) * cp * distBase,
  )

  // --- 4) NAO ATRAVESSA PAREDE --------------------------------------------
  // Era a reclamacao: "a camera ta bugando e entrando dentro da construcao".
  // Mesmo teste da camera de 3a pessoa: encurta o braco ate o obstaculo.
  if (collision && typeof collision.segmentHit === 'function') {
    const t = collision.segmentHit(_pf, _pv, 0.2)
    if (t < 1) {
      const d = Math.max(0.35, distBase * t - 0.12)
      _pv.set(
        _pf.x + Math.sin(ang) * cp * d,
        _pf.y + Math.sin(preview.pitch) * d + f.alto,
        _pf.z + Math.cos(ang) * cp * d,
      )
    }
  }
  // nem afunda no chao
  const chao = game.groundY(_pv.x, _pv.z) + 0.22
  if (_pv.y < chao) _pv.y = chao

  camera.position.lerp(_pv, 1 - Math.pow(0.0015, dt))
  camera.lookAt(_pf)
  camera.fov += (f.fov - camera.fov) * Math.min(1, dt * 6)
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
  if (input.wasPressed('Digit4')) hotbar.selecionar(3)

  if (!preview.active) {
    player.update(dt)
    hud.setMode(player.mode)
    hud.setCrosshair(player.mode === 'first')
  } else {
    updatePreview(dt)
  }

  // interacao
  if (!preview.active && !customizer.isOpen()) {
    // Veiculo antes de tudo: dirigindo, o E sai do carro; a pe, ele entra no
    // que estiver perto. Quem desenha o prompt de dentro do veiculo (velocidade
    // + "E para sair") e o proprio sistema, la no atualizar().
    const noVeiculo = veiculos.dirigindo
    // sentado num banco, o E levanta: quem esta no banco nao esta entrando em
    // carro nenhum, mesmo que tenha um estacionado ao lado
    const perto = (noVeiculo || player.sitting) ? null : veiculos.veiculoPerto(player.position)
    if (noVeiculo || perto) {
      // "no carro", mas "na moto": cada veiculo tem seu artigo
      if (perto) hud.setPrompt('Entrar ' + (NOME_VEICULO[perto.tipo] || ('no ' + perto.tipo)))
      if (input.wasPressed('KeyE')) veiculos.entrarSair()
    } else if (player.sitting) {
      hud.setPrompt('Levantar')
      if (input.wasPressed('KeyE')) player.standUp()
    } else {
      const hit = interaction.update(player.position)
      hud.setPrompt(hit ? hit.label : null)
      if (hit && input.wasPressed('KeyE')) {
        // Pegar um item destrava o slot na barra e ja poe na mao.
        // Sem 'return' aqui: isto roda DENTRO do frame, e sair cedo pularia o
        // render e a luz deste quadro (um engasgo visivel ao pegar o item).
        const item = hit.id === 'anel-verde' ? 'anel'
          : hit.id === 'portal-gun' ? 'portal'
            : /revolver/.test(hit.id) ? 'revolver' : null
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

  // Depois de player.update: dirigindo, o sistema escreve por cima da camera,
  // do personagem e do prompt do HUD — e quem escreve por ultimo e quem manda.
  veiculos.atualizar(dt)
  anel.atualizar(dt)
  portalgun.atualizar(dt)
  revolver.atualizar(dt)
  zumbi.atualizar(dt)
  clima.atualizar(dt, player.position)
  dialogo.atualizar(player.position)

  // DEPOIS de todo mundo escrever nas suas "luzes": o pool escolhe as duas mais
  // fortes do quadro e copia pras duas PointLight reais. Tem que ser aqui, no
  // fim — antes disso metade dos efeitos ainda nao mexeu na propria luz.
  poolLuz.atualizar()

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
      rede.conectado ? 'online' : (rede.recusado ? 'recusado' : 'sozinho'))
    fpsAcc = 0; fpsCount = 0; fpsTimer = 0
  }
}

frame()

// Conectar SO agora, com o mundo montado e o laco rodando.
// Conectando antes, a montagem da cidade (varios segundos numa maquina fraca)
// bloqueia a thread com a conexao ja aberta: o navegador engasga com a fila de
// snapshots que ninguem le e derruba o socket. Aqui nao existe essa janela.
rede.conectar().then(() => {
  hud.toast('Conectado. ' + meuNome)
}).catch(() => {
  // Sem servidor o jogo nao morre: fica um single player normal.
  hud.toast('Sem servidor: jogando sozinho.')
})

// expoe pra debug no console
window.__game = game
