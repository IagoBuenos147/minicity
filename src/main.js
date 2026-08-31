// ---------------------------------------------------------------------------
// TRAVA DE INSTANCIA UNICA — o fim do "entrei e tem dois de mim".
//
// Sintoma que isto mata: a tela inicial pedia DOIS cliques (um por instancia
// empilhada), nasciam DOIS personagens e as duas copias andavam juntas, porque
// o teclado e do window e as duas escutavam. Online ainda entravam dois
// jogadores com o mesmo nome na sala.
//
// A causa e sempre a mesma: este modulo foi AVALIADO DUAS VEZES. Modulo ES e
// identificado pela URL, entao basta a mesma build ser pedida por dois
// enderecos diferentes (".../index-AbC123.js" e ".../index-AbC123.js?v=xyz",
// um <script> duplicado, um import dinamico com caminho diferente) para o
// navegador executar o arquivo de novo, do zero. Ver o comentario de
// carimbarVersao em servidor/rede-ws.js: la a causa mais provavel foi
// corrigida, mas "corrigido em um lugar" nao e o mesmo que "impossivel".
//
// Aqui a garantia e estrutural e vale para QUALQUER causa: o primeiro que
// chega planta uma bandeira em globalThis (que e o MESMO objeto para as duas
// copias, mesmo sendo modulos diferentes) e qualquer avaliacao seguinte morre
// na primeira linha, antes de criar renderer, personagem, HUD ou socket.
// Lancar e de proposito: um modulo que joga na avaliacao para ali mesmo e nao
// contamina o que ja estava rodando.
// ---------------------------------------------------------------------------
if (globalThis.__MINI_CITY_RP__) {
  console.warn(
    '[mini-city-rp] main.js foi avaliado duas vezes; esta segunda copia foi ' +
    'abortada de proposito (senao haveria dois jogadores nesta tela).',
  )
  throw new Error('mini-city-rp: instancia duplicada abortada')
}
globalThis.__MINI_CITY_RP__ = { iniciadoEm: Date.now() }

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
import { BARBER, GROCERY, CASINO, CASA, FILLERS, WALL_T, filaDaCasa } from './world/layout.js'
import { createCharacter } from './player/character.js'
import { defaultAppearance } from './player/appearance.js'
import { createPlayerController } from './player/controller.js'
import { createHUD } from './ui/hud.js'
import { createCustomizer } from './ui/customizer.js'
import { criarRede } from './rede/cliente-rede.js'
import { criarAvatares } from './rede/avatares.js'
import { criarVoz } from './rede/voz.js'
import { criarVeiculos } from './veiculos/veiculos.js'
import { criarMao } from './player/mao.js'
import { criarCopo } from './player/copo.js'
import { criarPisos } from './systems/pisos.js'
import { criarLegenda } from './ui/legenda.js'
import { criarClima } from './world/clima.js'
import { criarNeve } from './world/neve.js'
import { buildCasino } from './world/casino.js'
import { criarCarteira } from './cassino/carteira.js'
import { criarCassinoUI } from './ui/cassino-ui.js'
import { criarLojaUI } from './ui/loja-ui.js'
import { buildCasaVelha } from './world/casa-velha.js'
import { buildNpcsCasa } from './world/npcs-casa.js'
import { buildLojaJogos } from './world/loja-jogos.js'
import { buildHotel } from './world/hotel.js'
import { buildAdega } from './world/adega.js'
import { buildCortico } from './world/cortico.js'
import {
  buildConcessionaria, CATALOGO_AUTO, CATEGORIAS_AUTO, fotoDeVeiculo, criarGaragem,
} from './world/concessionaria.js'
import { criarCenarios } from './cenario/cenarios.js'
import { buildQuadraHudson } from './world/hudson/quadra.js'
import { criarProvador } from './ui/provador.js'
import { criarCriacao } from './ui/criacao.js'
import { criarMenu, lerOpcoes } from './ui/menu.js'
import { criarAbertura } from './cena/abertura.js'
import { criarTutorial, MISSOES_INICIAIS } from './ui/tutorial.js'
import { criarRevolver, ITEM_REVOLVER } from './armas/revolver.js'
import { criarDialogo } from './ui/dialogo.js'
import { criarConversa } from './ui/conversa.js'
import { criarInventario } from './inventario/inventario.js'
import { criarEncaixe } from './systems/encaixe.js'
import { criarSave } from './save/save.js'
import { criarSaveUI } from './ui/save-ui.js'
import { criarFotografo } from './ui/miniatura3d.js'
import { itemDe, limiteDe, registrarItem } from './mobilia/catalogo.js'
import { CATALOGO_MERCADO, CATEGORIAS_MERCADO } from './mobilia/mercado.js'
import { COPOS, ehCopo, copoDe } from './mobilia/copos.js'
import { ADEGA_CATALOGO, ADEGA_CATEGORIAS } from './mobilia/destilados.js'
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

// Pool de luzes de efeito. DUAS PointLight reais pra cena inteira: o clarao do
// tiro do revolver e quem as usa hoje (o anel e a arma de portal, que dividiam
// o pool com ele, sairam pro backup). Elas
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

// O CHAO DE VARIOS ANDARES e a LEGENDA nascem antes dos builders porque e o
// builder que se registra neles: o cortico entrega as lajes e as rampas dos
// tres pisos dele, e os moradores falam pela legenda. Ver systems/pisos.js.
const pisos = criarPisos(() => 0)
const legenda = criarLegenda()

const game = {
  scene, camera, renderer, engine, input, collision, interaction,
  hud, lighting, poolLuz, player, character, appearance,
  pisos, legenda,
  time: 0,

  addColliders(list) { collision.add(list) },
  addInteractables(list) { interaction.add(list) },

  toast(msg, ms) { hud.toast(msg, ms) },

  setAppearance(partial) {
    Object.assign(appearance, partial)
    // LE DE VOLTA o que o personagem resolveu. character.setAppearance devolve a
    // aparencia ja normalizada (apelidos EN/PT casados, 'skin' derivado do
    // indice 'pele'), e sem esta copia o objeto do jogo ficava com a cor de
    // pele do primeiro quadro pra sempre — e era ELE que a tela de criacao
    // copiava, que a cutscene levava pro sofa e que ia pro save.
    Object.assign(appearance, character.setAppearance(appearance))
    // E AQUI que o visual vira coisa dos outros jogadores. Sem esta linha o
    // barbeiro so mudava o boneco desta tela: MINHA_APARENCIA nunca saia e o
    // servidor nunca guardava nada.
    if (rede && typeof rede.enviarAparencia === 'function') rede.enviarAparencia(appearance)
    // em 1a pessoa a cabeca continua escondida
    character.setVisibleBody(player.mode === 'third')
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
// 'let' e nao 'const': o nome deixou de ser so o que estava no localStorage
// quando a pagina abriu. Agora o jogador o digita na tela de criacao de
// personagem e pode troca-lo de novo nas opcoes do menu.
let meuNome = (() => {
  // ?nome=Fulano ganha de tudo: e assim que da pra abrir DUAS janelas na mesma
  // maquina pra testar o multiplayer sozinho. Sem isso as duas leem o mesmo
  // localStorage, entram com o mesmo nome, e o servidor (que so aceita um
  // corpo por nome) derruba uma pela outra sem parar.
  try {
    const q = new URLSearchParams(location.search).get('nome')
    if (q && q.trim()) return q.trim().slice(0, 16)
  } catch (err) { void err }
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

// CHAT DE VOZ POR PROXIMIDADE (src/rede/voz.js).
//
// Nasce DESLIGADO, de proposito: microfone e a unica coisa neste jogo que sai
// da maquina da pessoa pro mundo, e ligar sozinho ao abrir a pagina nao e uma
// escolha que o codigo pode fazer por ela. Quem liga e a tecla V.
//
// As ORELHAS sao a `camera`; a DISTANCIA sai do `player`. Os dois motivos
// estao escritos em voz.js, em `moverListener`.
const voz = criarVoz({ rede, camera, player, aviso: (m) => hud.toast(m) })
game.voz = voz

// Mapa interacao -> NPC. E por aqui que o "E" vira um PEDIDO ao servidor em
// vez de o cliente decidir sozinho que a conversa comecou.
const NPC_DA_INTERACAO = { 'barber-talk': 1000, 'grocery-clerk': 1002 }

// Como cada veiculo aparece no prompt do E. Sem isto sai "Entrar no moto".
// O que o toast diz quando a tecla C troca a estacao.
const NOME_ESTACAO = {
  sol: 'Ceu limpo',
  chuva: 'Comecou a chover',
  neve: 'Comecou a nevar',
}

const NOME_VEICULO = {
  carro: 'no carro',
  moto: 'na moto',
  skate: 'no skate',
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
      veiculos.aoEventoDeRede(ev)
      break
    case 'veiculo-dono': case 'veiculo-pos':
      veiculos.aoEventoDeRede(ev); break
    case 'mundo-reiniciado': {
      // Quem apertou pode ter sido eu; o servidor manda o id pra ninguem ficar
      // com o mundo voltando ao inicio sozinho, sem explicacao.
      const j = rede.jogadores.get(ev.quem)
      const quem = ev.quem === rede.meuId ? 'Voce' : (j ? j.nome : 'Alguem')
      recomecarDoZero(quem + ' reiniciou o mundo.')
      break
    }
    case 'recusado':
      // 1 = versao, 2 = sala cheia. Sem esta mensagem, quem esta com o .js
      // velho em cache simplesmente cai no modo sozinho e passa a tarde
      // achando que o servidor caiu -- e o VERSAO_PROTOCOLO acabou de subir
      // pra 5 por causa da tecla F8, entao isso vai acontecer com alguem.
      if (ev.motivo === 1) {
        hud.toast('Sua versao do jogo esta velha. Recarregue a pagina '
          + '(Ctrl+F5) pra voltar pro servidor.', 12000)
      } else if (ev.motivo === 2) {
        hud.toast('O servidor esta cheio. Jogando sozinho por enquanto.', 8000)
      }
      break
    case 'sala-estado': aoEstadoDaSala(); break
    case 'porta-estado': aoPortaEstado(ev); break
    case 'entrou': if (estado === 'jogo') hud.toast(ev.nome + ' entrou'); break
    case 'saiu': hud.toast('um jogador saiu'); break
    case 'bemvindo':
      // O servidor guarda o VISUAL por nome. Sem aplicar aqui, quem recarrega a pagina
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

// --- CENARIOS ---------------------------------------------------------------
//
// O jogo tem dois mundos: a cidade do cassino (a de sempre) e a QUADRA HUDSON,
// um quarteirao real de Paracatu-MG. F6 troca, F7 faz sumir. O cabecalho de
// cenario/cenarios.js explica por que a troca e GRAVADA em vez de listada.
const cenarios = criarCenarios({
  scene, colisao: collision, interacao: interaction,
  game, player, hud, lighting, moduleUpdates, propUpdates,
})
game.cenarios = cenarios

cenarios.registrar('cidade', {
  nome: 'Cidade do Cassino',
  // O spawn e a calcada em frente a casa velha: o mesmo lugar em que a cutscene
  // deixa o jogador, pra voltar da Quadra Hudson nao ser uma surpresa.
  spawn: { x: 43, z: 8.8, yaw: Math.PI },
})
cenarios.registrar('hudson', {
  nome: 'Quadra Hudson — Paracatu, MG',
  construir: (g, reg) => buildQuadraHudson(g, reg),
})

// --- Mundo -----------------------------------------------------------------
function mount(result, name) {
  if (!result) { console.warn('modulo sem retorno:', name); return }
  if (result.group) scene.add(result.group)
  if (result.colliders) collision.add(result.colliders)
  if (result.interactables) interaction.add(result.interactables)
  if (typeof result.update === 'function') moduleUpdates.push(result.update)
}

// --- a MOCHILA e o fotografo das miniaturas --------------------------------
//
// O inventario nao conhece item nenhum de nome: quem responde "quantos cabem
// numa vaga" e o catalogo da mobilia. E o fotografo desenha o icone de cada
// vaga a partir da MESMA funcao build() que monta o movel no chao — nao ha um
// segundo desenho do item pra manter em sincronia.
const inventario = criarInventario({ limiteDe })
game.inventario = inventario

const fotos = criarFotografo(renderer)
/** URL da foto do item, montada sob demanda e guardada pra sempre. */
function fotoDe(id) {
  const m = itemDe(id)
  if (!m) return null
  return fotos.foto(id, m.build, m.foto)
}
game.fotoDe = fotoDe

// O revolver nao esta a venda em loja nenhuma, mas ocupa uma vaga da mochila
// como qualquer outra coisa desde que a barra virou uma so — entao o registro
// de ids precisa conhecer a ficha dele (nome, foto, quanto empilha). Ver
// ITEM_REVOLVER em armas/revolver.js e registrarItem() no catalogo.
registrarItem(ITEM_REVOLVER)

// A ADEGA 100 vende coisa que nao nasce em MOBILIA nem em BEBIDAS: os tres
// copos (mobilia/copos.js) e os destilados de contrabando (mobilia/destilados.js).
// Eles entram no registro pelo MESMO caminho do revolver, e pelo mesmo motivo —
// a garrafa comprada la vai pra mesma mochila, entao itemDe() tem que responder
// por ela (nome, foto, quanto empilha).
for (const c of COPOS) registrarItem(c)
for (const b of ADEGA_CATALOGO) registrarItem(b)

let vagaSelecionada = -1
/** Nome do item pra barra escrever embaixo da vaga selecionada. */
function nomeDoItem(id) {
  const m = itemDe(id)
  return m ? m.nome : ''
}
function pintarMochila() {
  hud.setMochila(inventario.slots, fotoDe, vagaSelecionada, nomeDoItem)
}

// TUDO daqui ate o fecharGravacao() la embaixo vira propriedade do cenario
// 'cidade': os grupos, os colisores, os occluders, os pontos de interacao e os
// updates — inclusive o que nasceu la dentro de buildCity, que este arquivo
// nunca enxerga. E isso que a tecla F6 desliga de uma vez so.
cenarios.abrirGravacao('cidade')

const city = buildCity(game)
mount(city, 'city')
// exposto pra depuracao (window.__game.city): e por aqui que se pergunta ao
// mundo ja construido onde ficaram as arvores, os postes e as luzes
game.city = city

// Os interiores sao visiveis da rua pelas vitrines, entao o culling nao ajuda:
// funde os moveis estaticos por material (NPCs e props animados ficam de fora).
const barber = buildBarbershop(game)
mount(barber, 'barbershop')
const grocery = buildGrocery(game)
mount(grocery, 'grocery')

// O cassino traz a PROPRIA casca (fachada, telhado, neon) alem do miolo: a
// fachada dele olha pra -Z, e o buildShell de city.js so sabe desenhar vitrine
// virada pra +Z. Por isso ele nao aparece na lista de lojas de city.js.
const casino = buildCasino(game)
mount(casino, 'casino')
// exposto pra depuracao e pros testes: e por 'casinoMundo' que se pergunta ao
// predio pra girar um rolete ou piscar as luzes de premio sem passar pela UI
game.casinoMundo = casino
if (casino && Array.isArray(casino.occluders)) {
  for (const o of casino.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'cassino')
  }
}
if (barber && barber.group) console.info('barbearia:', bakeStatic(barber.group))
if (grocery && grocery.group) console.info('mercearia:', bakeStatic(grocery.group))
if (casino && casino.group) console.info('cassino:', bakeStatic(casino.group))

// A CASA VELHA — o primeiro estabelecimento, e o cenario da segunda cena de
// abertura. Mesmo desenho do cassino: ela traz a propria casca porque a fachada
// dela tambem olha pra -Z, e o buildShell de city.js so sabe desenhar vitrine
// virada pra +Z.
const lojaJogos = buildLojaJogos(game)
mount(lojaJogos, 'loja-jogos')
game.lojaMundo = lojaJogos

// O HOTEL PARAISO, na esquina noroeste do anel (era o predio de cenario que
// o letreiro procedural chamava de "BAR DO TITO"). Como o cassino, ele traz a
// PROPRIA casca: a fachada dele olha pra -Z e o buildShell de city.js so sabe
// desenhar vitrine virada pra +Z. Por isso tambem e daqui que saem os occluders
// de camera dele — registerCameraOccluders() so conhece FILLERS e as duas lojas
// de fachada em z1.
const hotel = buildHotel(game)
mount(hotel, 'hotel')
game.hotel = hotel
if (hotel && Array.isArray(hotel.occluders)) {
  for (const o of hotel.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'hotel')
  }
}
// NAO chamar bakeStatic(hotel.group) aqui: o hotel assa a casca e o saguao
// SEPARADAMENTE, dentro do proprio modulo, porque o LOD dele depende de os dois
// grupos continuarem existindo (ver o comentario do forno em world/hotel.js).

// A GARAGEM DO NANDO, vizinha do hotel na mesma calcada do anel (era o predio
// de cenario do letreiro "CHAVEIRO 24H"). Mesmo desenho do hotel: casca
// propria porque a fachada olha pra -Z, occluders daqui, e o forno roda dentro
// do modulo por causa do LOD do showroom.
const auto = buildConcessionaria(game)
mount(auto, 'concessionaria')
game.autoMundo = auto
if (auto && Array.isArray(auto.occluders)) {
  for (const o of auto.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'auto')
  }
}

// A ADEGA 100, no predio de cenario cego atras da barbearia (o que city.js
// numerava 100). Como o cassino, o hotel e a garagem, ela traz a PROPRIA casca:
// a fachada dela olha pra -Z e, mais que isso, ela NAO TEM fachada de loja —
// buildShell de city.js desenha vitrine e letreiro, e este predio nao pode ter
// nem uma coisa nem outra. Os occluders tambem saem daqui pelo mesmo motivo:
// registerCameraOccluders() so conhece FILLERS e as duas lojas de fachada z1, e
// este lote saiu de FILLERS.
const adega = buildAdega(game)
mount(adega, 'adega')
game.adegaMundo = adega
if (adega && Array.isArray(adega.occluders)) {
  for (const o of adega.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'adega')
  }
}
// NAO chamar bakeStatic(adega.group) aqui, pela MESMA razao do hotel: a adega
// assa a casca e o miolo separadamente, dentro do proprio modulo, porque o LOD
// dela depende de os dois grupos continuarem existindo (o predio e cego, entao
// o miolo some inteiro quando ninguem esta dentro). Assar aqui dissolveria os
// dois grupos na raiz e o LOD deixaria de esconder qualquer coisa.

// O CORTICO 117, o predio de cenario ao lado da adega (o que city.js numerava
// 117). E o primeiro predio do jogo com ANDAR: tres pisos, escada em U de
// verdade e dois apartamentos que abrem. Casca propria pelo mesmo motivo dos
// outros — a fachada olha pra -Z — e o forno roda dentro do modulo, porque o
// LOD dele depende de os grupos de cada andar continuarem existindo.
const cortico = buildCortico(game)
mount(cortico, 'cortico')
game.cortico = cortico
if (cortico && Array.isArray(cortico.occluders)) {
  for (const o of cortico.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'cortico')
  }
}

const casa = buildCasaVelha(game)
game.casa = casa

// --- ENCAIXE: por o movel comprado dentro da casa --------------------------
// Ele precisa da planta (casa.zonasDeMovel), entao nasce DEPOIS dela.
const encaixe = criarEncaixe({
  scene, camera, player, hud, inventario, casa, colisao: collision,
  // Por e tirar movel muda a casa: e ponto de gravacao. game.salvarAgora ainda
  // nao existe quando esta linha roda (o save nasce depois do tutorial), entao
  // a chamada e tardia de proposito.
  aoMudar: () => { if (game.salvarAgora) game.salvarAgora('movel') },
})
game.encaixe = encaixe

     // exposto pra depuracao e pra ferramenta de foto
mount(casa, 'casa-velha')
if (casa && Array.isArray(casa.occluders)) {
  for (const o of casa.occluders) {
    collision.addOccluder(o.minX, o.minY, o.minZ, o.maxX, o.maxY, o.maxZ, o.tag || 'casa')
  }
}
if (casa && casa.group) console.info('casa velha:', bakeStatic(casa.group))

// Altura do chao: calcada (0.16), parque, beco e piso das lojas. Sem isso o
// personagem anda com os pes enterrados no concreto.
// O CHAO DA CIDADE PASSA A SER O DE systems/pisos.js.
//
// `pisos` embrulha o chao da cidade: onde nao ha laje registrada (ou seja, no
// mapa inteiro menos os poucos metros quadrados do cortico) ele repassa a
// pergunta pro city.groundY de sempre. Onde ha, ele escolhe a laje pela altura
// em que o jogador esta — a terceira entrada que uma funcao (x, z) nao tem como
// receber, e sem a qual nao da pra responder 0,16 e 3,16 pro mesmo ponto.
//
// O AMOSTRADOR NAO E INSTALADO AQUI, e sim no REGISTRO DO CENARIO logo abaixo.
// Vale escrever por que: `cenarios.mostrar()` chama player.setGroundSampler()
// com o `groundY` do cenario toda vez que ele entra em cena, e ele entra em
// cena DEPOIS desta linha (no fim do arquivo) e de novo a cada F6. Instalando
// so aqui, o cenario sobrescrevia o amostrador de andares no boot e o predio
// ficava com tres lajes registradas que ninguem consultava — o jogador
// atravessava o cortico inteiro no nivel da rua.
const chaoComAndares = pisos.amostrador(() => player.position.y)
if (city && typeof city.groundY === 'function') {
  pisos.setBase(city.groundY)
  game.groundY = chaoComAndares
} else {
  game.groundY = () => 0
}

// --- os tres da calcada ----------------------------------------------------
// DEPOIS do groundY: eles pousam no chao de verdade (calcada, meio-fio,
// asfalto) em vez de num 0.16 chutado. Antes desta linha o amostrador ainda nao
// existe e os tres nasceriam enterrados ou flutuando.
// A CONVERSA nasce ANTES dos NPCs: o onInteract deles chama `game.conversa`, e
// um NPC criado antes dela guardaria um `undefined` no fecho.
const conversa = criarConversa({ camera, player })
game.conversa = conversa

mount(buildNpcsCasa(game), 'npcs-casa')

// --- veiculos --------------------------------------------------------------
// Depois da cidade: precisa do groundY e dos colisores.
const veiculos = criarVeiculos({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z),
  interaction,
})
game.veiculos = veiculos
scene.add(veiculos.grupo)

// --- neve e revolver -------------------------------------------------------
// A NEVE PARADA (no chao, nos telhados, nas arvores) e outro modulo: o clima
// cuida do floco caindo, este cuida do que ja caiu. Quem liga os dois e o laco
// principal, passando clima.cobertura pra neve.setCobertura — assim a cobertura
// cresce enquanto neva e derrete quando para, sem os dois modulos se conhecerem.
const neve = criarNeve({
  groundY: (x, z) => game.groundY(x, z),
  ancoras: (city && city.neveAncoras) || null,
})
game.neve = neve
if (neve.grupo) scene.add(neve.grupo)

const revolver = criarRevolver({
  scene, camera, player, character, collision, rede, hud,
  groundY: (x, z) => game.groundY(x, z), interaction, poolLuz,
})
game.revolver = revolver
if (revolver.grupoNoMundo) scene.add(revolver.grupoNoMundo)
if (revolver.interactable) interaction.add(revolver.interactable)

// ---------------------------------------------------------------------------
// A MAO e A BARRA DE ITENS
//
// ERAM DUAS BARRAS: a hotbar (teclas 1 e 2, "maos" e "revolver") e, embaixo
// dela no canto da tela, as nove vagas da mochila, que so respondiam a clique.
// O dono do projeto pediu UMA SO, de 1 a 9, centrada no rodape — e a decisao
// que segue disso e a que importa aqui: NAO EXISTE MAIS UM SLOT "MAOS". Mao
// vazia e uma VAGA VAZIA selecionada, ou nenhuma vaga selecionada. Foi o que
// permitiu o revolver deixar de ter um numero reservado (que furava uma das
// nove vagas do jogador pra sempre) e virar um item da mochila como os outros.
//
// TRES DESTINOS, e a vaga escolhida decide qual:
//
//   movel (naCasa)  -> modo de ENCAIXE: o movel vai pro CHAO da casa, nao pra
//                      mao. E o que ja acontecia no clique.
//   revolver        -> armas/revolver.js. Tem mira, coice, recarga e pose
//                      propria; nunca passa pela mao generica.
//   o resto         -> player/mao.js, que segura o que vier.
//
// A mao nasce aqui, DEPOIS do revolver, porque as duas disputam a mesma tela:
// quem pega uma larga a outra.
const mao = criarMao({ scene, camera, player, character, aparencia: appearance })
game.mao = mao

// E O COPO TEM MAO PROPRIA. Nao e capricho: player/copo.js e uma maquina de
// estados (ocioso -> esticado -> cheio -> bebendo) com quatro poses e um nivel
// de liquido, e player/mao.js e um modulo que SEGURA o que vier. Enfiar o copo
// la dentro obrigaria a mao generica a saber o que e chope. Ver o cabecalho de
// player/copo.js — e o mesmo argumento que ja tinha tirado o revolver de la.
//
// As duas nunca aparecem juntas: quem pega uma larga a outra, em aplicarVaga().
const copo = criarCopo({ scene, camera, player, character, aparencia: appearance, hud })
game.copo = copo

/**
 * Poe na mao (ou tira dela) o que a vaga selecionada manda.
 *
 * `entrarNoEncaixe` separa as duas origens da chamada: a TECLA/CLIQUE quer o
 * efeito inteiro, inclusive abrir o modo de encaixe do movel; toda MUDANCA do
 * inventario (comprou, guardou, o encaixe tirou a mesa da vaga) so quer que a
 * mao pare de segurar o que nao esta mais ali. Sem essa separacao, guardar um
 * movel reabria o modo de encaixe no mesmo quadro em que ele fechou.
 */
function aplicarVaga(entrarNoEncaixe) {
  const s = vagaSelecionada >= 0 ? inventario.ver(vagaSelecionada) : null
  const m = s ? itemDe(s.id) : null

  if (m && m.naCasa) {
    if (revolver.equipado) revolver.desequipar()
    mao.largar()
    copo.largar()
    if (entrarNoEncaixe && game.encaixe) game.encaixe.entrar(vagaSelecionada, s.id)
    return
  }
  if (game.encaixe && game.encaixe.ativo) game.encaixe.sair()

  if (m && m.id === 'revolver') {
    mao.largar()
    copo.largar()
    if (!revolver.equipado) revolver.equipar()
    return
  }

  if (revolver.equipado) revolver.desequipar()
  // COPO -> player/copo.js; o resto -> player/mao.js.
  if (m && ehCopo(m.id)) {
    mao.largar()
    copo.segurar(m.id, copoDe(m.id) || m)
    return
  }
  copo.largar()
  if (m) mao.segurar(m.id, m)
  else mao.largar()
}

/**
 * Seleciona a vaga `i` da barra. -1, ou a vaga que ja estava selecionada,
 * ESVAZIA A MAO — apertar 3 duas vezes guarda a garrafa, que e o gesto que todo
 * mundo tenta antes de procurar uma tecla pra isso.
 */
function selecionarVaga(i) {
  const alvo = (i === vagaSelecionada || i < 0 || i >= inventario.vagas) ? -1 : i
  vagaSelecionada = alvo
  aplicarVaga(true)
  pintarMochila()
}
game.selecionarVaga = selecionarVaga

/**
 * A BARRA E O QUE ESTA NA MAO ANDAM JUNTOS.
 *
 * Os dois somem no menu, na criacao de personagem, no provador e na cutscene, e
 * voltam quando o jogo volta. Antes era so a barra (hotbar.mostrar), porque nao
 * havia nada de 3D preso a camera fora o revolver — que tem o proprio caminho.
 * Agora ha: sem esta funcao, sair pro menu com uma garrafa na mao deixava a
 * garrafa na tela por cima do letreiro do cassino.
 */
function mostrarItens(v) {
  hud.mostrarBarra(v)
  if (mao && typeof mao.mostrarNaTela === 'function') mao.mostrarNaTela(v)
}

/**
 * A loja avisa o que acabou de entrar na mochila (a PRIMEIRA vaga que recebeu).
 *
 * Bebida vai pra mao no ato — foi o pedido: "ao comprar, a bebida vai pro
 * primeiro slot vazio e o personagem segura ela na mao". Movel NAO: a vitrine
 * continua aberta depois da compra, e selecionar uma vaga de movel abre o modo
 * de encaixe, que poria o fantasma da mesa de sinuca numa tela tapada pela
 * propria loja.
 */
game.aoComprar = (vaga, id) => {
  const m = itemDe(id)
  if (!m || m.naCasa) return
  selecionarVaga(vaga)
}

// O clique na vaga faz o mesmo que a tecla. O botao direito manda -1 (o HUD
// converte), e -1 e "mao vazia".
hud.aoClicarVaga(selecionarVaga)

// Toda mudanca no inventario repinta a barra E confere a mao: a vaga que a
// pessoa segurava pode ter esvaziado (o encaixe tirou a mesa dali, a compra
// empurrou tudo, o save carregou outra mochila).
inventario.aoMudar(() => {
  if (vagaSelecionada >= 0 && !inventario.ver(vagaSelecionada)) vagaSelecionada = -1
  aplicarVaga(false)
  pintarMochila()
})
pintarMochila()

// --- dinheiro e as mesas do cassino ----------------------------------------
// A carteira e local (localStorage): o protocolo de rede nao tem pacote de
// dinheiro e inventar um significaria mexer no servidor e no contrato. Mesma
// regra da chuva: efeito e saldo sao de cada maquina.
const carteira = criarCarteira({ hud })
game.carteira = carteira

const cassinoUI = criarCassinoUI({ game, carteira, mundo: casino })
// E por 'game.cassino' que os pontos de interacao dentro do cassino chamam a
// interface: world/casino.js nao importa a UI, so pede ao game.
game.cassino = cassinoUI

// A LOJA. Como o cassino, ela e chamada por 'game.loja' de dentro do mundo: o
// interior da loja registra os pontos de interacao e nao importa UI nenhuma.
const lojaUI = criarLojaUI({ game, carteira, inventario, fotoDe })
game.loja = lojaUI

// O MERCADO. E o MESMO modulo de janela da loja de jogos, com outro catalogo e
// outras falas — nao uma segunda janela copiada. Copiar teria duplicado a regra
// de compra (espaco -> ouro -> entrega), que e justamente a parte que nao pode
// existir em duas versoes: um dia uma delas seria corrigida e a outra nao.
// Quem abre e world/grocery.js, por 'game.mercado', do mesmo jeito que o
// interior da loja de jogos chama 'game.loja'.
const mercadoUI = criarLojaUI({
  game, carteira, inventario, fotoDe,
  // O catalogo do mercado nao e mais "as bebidas": ver mobilia/mercado.js, que
  // junta as familias (bebida, erva) e deixa cada uma no seu proprio arquivo.
  catalogo: CATALOGO_MERCADO,
  categorias: CATEGORIAS_MERCADO,
  kicker: 'MERCEARIA CENTRAL',
  titulo: 'Geladeira do fundo',
  falas: {
    abertura: 'Atendente: gelada e a de cima. A de baixo e a de ontem.',
    semOuro: 'Atendente: fiado so pra quem paga o de antes.',
    comprou: 'Atendente: leva, leva. E nao bebe dirigindo.',
  },
})
game.mercado = mercadoUI

// A CONCESSIONARIA usa A MESMA JANELA da loja de jogos — outro catalogo, outras
// abas, outro titulo e outro "inventario". A garagem tem a forma que loja-ui.js
// espera (slots / livres / adicionar) mas as vagas dela sao a calcada da frente:
// `adicionar` chama veiculos.criarComprado e o carro aparece estacionado.
// Ver o cabecalho de world/concessionaria.js.
const garagem = criarGaragem({ veiculos, hud })
game.garagem = garagem
const autoUI = criarLojaUI({
  game, carteira, inventario: garagem, fotoDe: fotoDeVeiculo,
  catalogo: CATALOGO_AUTO, categorias: CATEGORIAS_AUTO,
  kicker: 'CONCESSIONARIA', titulo: 'Garagem do Nando',
  falas: {
    abertura: 'Nando: entra, olha, senta dentro. Comprar so se gostar.',
    semOuro: 'Nando: com esse dinheiro eu te vendo o retrovisor.',
    comprou: 'Nando: bom negocio. Ta na vaga da frente, chave no contato.',
    semEspaco: 'Nao ha mais vaga na frente da loja.',
  },
})
game.autoLoja = autoUI

// A ADEGA usa A MESMA JANELA das outras tres. O catalogo dela e a soma de dois
// arquivos — os copos e os destilados de contrabando —, e essa soma acontece
// AQUI e nao dentro de destilados.js de proposito: copo nao e bebida, e o dia em
// que outro lugar vender copo o catalogo dele nao vai querer a pinga junto.
const adegaUI = criarLojaUI({
  game, carteira, inventario, fotoDe,
  catalogo: COPOS.concat(ADEGA_CATALOGO),
  categorias: ADEGA_CATEGORIAS,
  kicker: 'SEM PLACA, SEM NOTA',
  titulo: 'O Cem',
  falas: {
    abertura: 'Dico: fala baixo. O que voce quer ta tudo aqui atras.',
    semOuro: 'Dico: aqui nao tem fiado. Fiado e como a policia sabe seu nome.',
    comprou: 'Dico: sai pelo beco, e nao para na esquina com isso na mao.',
    semEspaco: 'Nao cabe mais nada na mochila.',
  },
})
game.adega = adegaUI

/**
 * Chamado quando um item e PEGO no mundo (hoje so o revolver, no beco): guarda
 * na primeira vaga livre e ja poe na mao.
 *
 * Devolve a vaga, ou -1 quando a mochila esta cheia — e nesse caso NADA
 * aconteceu (garantia do inventario), entao quem chamou pode deixar o item no
 * chao. E a mesma ordem da loja: conferir a vaga antes de entregar.
 */
game.pegouItem = (id, qtd) => {
  const i = inventario.adicionar(id, Math.max(1, qtd | 0) || 1)
  if (i < 0) {
    hud.negarMochila()
    hud.toast('A mochila esta cheia.')
    return -1
  }
  hud.piscarVaga(i)
  selecionarVaga(i)
  return i
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

// O ciclo dia/noite acende a iluminacao publica DO CENARIO EM CENA. Quem liga
// isso e cenarios.mostrar(), porque cada mundo tem os seus postes — a lista fixa
// que morava aqui acendia os da cidade estando o jogador em Paracatu.

// props que se animam sozinhos (poste de barbeiro, semaforo, etc.)
// Fica DENTRO da gravacao de proposito: sao updates da cidade, e num cenario
// fora de cena eles nao devem custar um quadro sequer.
scene.traverse((o) => {
  if (o.userData && typeof o.userData.update === 'function') propUpdates.push(o.userData.update)
})

cenarios.fecharGravacao()

// O REGISTRO da cidade fica com o chao e com as luzes de poste. Quem troca de
// cenario troca as duas coisas junto — sem isso o jogador andaria em Paracatu
// na altura da calcada da outra cidade, e o ciclo dia/noite acenderia postes
// que nao estao mais em cena.
const regCidade = cenarios.registroDe('cidade')
// O chao da cidade e o de systems/pisos.js (ver a nota la em cima): e por aqui
// que ele chega no controller, porque quem instala o amostrador e o cenario.
regCidade.groundY = (city && typeof city.groundY === 'function') ? chaoComAndares : (() => 0)
regCidade.luzes = (city && city.lampLights) || []
regCidade.materiaisLuz = (city && city.lampMaterials) || []
// `teleportar: false`: o jogo ainda esta no menu, e mandar o jogador pro spawn
// agora atrapalharia o passeio de camera que roda atras dele.
cenarios.mostrar('cidade', { teleportar: false })

// --- CLIMA -----------------------------------------------------------------
// FORA da gravacao, de proposito: chuva e neve sao do CEU, e o ceu e o mesmo
// nos dois mundos. Comeca no SOL — comecar chovendo escondia metade do mapa de
// quem abria o jogo pela primeira vez.
const clima = criarClima({
  scene, camera, renderer, lighting,
  groundY: (x, z) => game.groundY(x, z),
  inicial: 'sol',
})
game.clima = clima
if (clima.grupo) scene.add(clima.grupo)

// ---------------------------------------------------------------------------
// O PALCO (provador) — no lugar da camera de preview que existia aqui.
//
// Antes, customizar era apontar a camera DO JOGO pro boneco onde ele estivesse.
// A queixa do dono do projeto foi exata: "fica sempre mostrando moveis na frente
// do player ou a camera nao mostra 100% o player e nao fica centralizada". E nao
// havia enquadramento que resolvesse, porque o estorvo era o CENARIO — a cadeira
// do barbeiro, o espelho, o balcao da loja de roupa.
//
// Agora o painel mostra uma CENA SEPARADA (src/ui/provador.js): fundo liso,
// pedestal e luz de tres pontos. Nao ha movel pra entrar na frente porque nao ha
// movel nenhum. As mesmas funcoes de sempre (game.beginPreview/endPreview)
// continuam existindo — o que mudou foi o que elas fazem por dentro.
// ---------------------------------------------------------------------------
const provador = criarProvador({ renderer })
game.provador = provador

let palcoAtivo = false

function startPreview(focus) {
  palcoAtivo = true
  provador.setAparencia(appearance)
  provador.focar(focus || 'corpo')
  player.setLocked(true)
  input.exitLock()
  // O HUD inteiro sai: com o palco na tela, "Camera 1a pessoa", o FPS, o
  // objetivo do tutorial e a lista de controles ficam POR CIMA do boneco que a
  // pessoa esta customizando. Os toasts continuam (setJogando nao os esconde).
  hud.setJogando(false)
  hud.setCrosshair(false)
  hud.setPrompt(null)
  mostrarItens(false)
  // O tutorial tem raiz DOM propria (nao esta dentro do #hud), entao o
  // setJogando nao o alcanca: sem esta linha o cartao de objetivo fica por
  // cima do boneco que a pessoa esta customizando.
  tutorial.mostrar(false)
}

function stopPreview() {
  if (!palcoAtivo) return
  palcoAtivo = false
  player.setLocked(false)
  hud.setCrosshair(player.mode === 'first')
  // O HUD so volta se o que vem depois for o JOGO. Saindo do palco pra
  // cutscene (o caminho da criacao de personagem), quem manda e o
  // comecarPartida, que o mantem escondido.
  if (estado === 'jogo') {
    hud.setJogando(true)
    mostrarItens(true)
    tutorial.mostrar(true)
    try { input.requestLock() } catch (err) { void err }
  }
}

// Arrastar com o mouse gira o pedestal. Fica aqui, e nao no provador, porque o
// ponteiro so esta LIVRE quando alguma UI do jogo esta aberta — e quem sabe
// disso e o main.
let arrastando = false
let arrasteX = 0

function palcoMouseDown(e) {
  if (!palcoAtivo || e.button !== 0) return
  if (e.target && e.target.closest && e.target.closest('button, input, .mcrp-cz, .mcrp-cri')) return
  arrastando = true
  arrasteX = e.clientX
}
function palcoMouseMove(e) {
  if (!arrastando || !palcoAtivo) return
  provador.girar((e.clientX - arrasteX) * 0.009)
  arrasteX = e.clientX
}
function palcoMouseUp() { arrastando = false }

window.addEventListener('mousedown', palcoMouseDown)
window.addEventListener('mousemove', palcoMouseMove)
window.addEventListener('mouseup', palcoMouseUp)

// ---------------------------------------------------------------------------
// O FLUXO DO JOGO
//
//   menu -> (solo)  criacao -> abertura -> jogo
//        -> (coop)  lobby -> criacao -> [todos prontos] -> abertura -> jogo
//
// UM estado, e o laco de desenho decide o que fazer com ele. A alternativa
// (varias flags booleanas: emMenu, emCriacao, started) e a que estava aqui e
// era a origem do "tela inicial pedindo dois cliques": duas flags podiam
// discordar e ninguem percebia.
// ---------------------------------------------------------------------------
let estado = 'menu'          // 'menu' | 'criacao' | 'abertura' | 'jogo'
/* MODO FOTO. Quando ligado, o laco NAO mexe na camera: nem o passeio do menu,
   nem o controller do jogador. E o que as ferramentas de tools/shot-*.mjs
   precisam pra enquadrar uma tomada e ela sobreviver ao proximo quadro — sem
   isto, o passeio do menu reescrevia a camera entre o enquadramento e o clique
   e toda foto saia do mesmo lugar. Nao ha caminho de UI que ligue isto. */
let modoFoto = false
/* A cutscene so existe enquanto roda: ver comecarPartida. */
let abertura = null
let modoDeJogo = 'solo'      // 'solo' | 'coop'
let conectando = null        // a promessa da conexao, pra nao pedir duas vezes

const tutorial = criarTutorial({
  // Cada missao concluida e um ponto de gravacao: o tutorial e o unico lugar do
  // jogo que sabe dizer "o jogador avancou" sem adivinhar.
  aoConcluir() { if (game.salvarAgora) game.salvarAgora('missao') },
})

// --- SAVE EM SLOTS ---------------------------------------------------------
//
// O modulo de save nao conhece o controlador do jogador, o tutorial nem o
// clima: ele recebe FUNCOES que sabem ler e escrever cada pedaco. Se conhecesse
// os modulos, cada um deles passaria a ter dois donos — e o dia em que o
// teleport mudasse de assinatura o save quebraria em silencio.
//
// Cuidado registrado: player.teleport(x, z, yaw) recebe o YAW no terceiro
// argumento, e nao a altura. A altura sai do sampleGround, e isso e uma
// vantagem — quem salvou dentro de uma loja volta no piso certo sozinho.
const save = criarSave({
  carteira,
  lerNome: () => meuNome,
  escreverNome: (n) => {
    meuNome = n || meuNome
    try { localStorage.setItem('mcrp-nome', meuNome) } catch (err) { void err }
    if (rede.conectado) rede.enviarNome(meuNome)
  },
  lerModo: () => modoDeJogo,
  // A aparencia sai INTEIRA: os 20 indices do contrato MAIS as quatro cores
  // cruas (skin/shirt/pants/shoes), que nao cabem num byte e por isso nao
  // viajam na rede. Este e o unico lugar do jogo onde elas sobrevivem a um F5.
  lerAparencia: () => Object.assign({}, appearance),
  escreverAparencia: (ap) => game.setAppearance(ap),
  lerOnde: () => ({
    x: +player.position.x.toFixed(2),
    y: +player.position.y.toFixed(2),
    z: +player.position.z.toFixed(2),
    yaw: +(player.yaw || 0).toFixed(3),
    modo: player.mode,
  }),
  escreverOnde: (o) => {
    player.teleport(Number(o.x) || 0, Number(o.z) || 0, Number(o.yaw) || 0)
    if (o.modo && o.modo !== player.mode) player.toggleMode()
  },
  lerTutorial: () => Array.from(tutorial.concluidas || []),
  escreverTutorial: (l) => { if (tutorial.definirFeitas) tutorial.definirFeitas(l) },
  lerHora: () => +lighting.timeOfDay.toFixed(4),
  escreverHora: (h) => lighting.setTimeOfDay(Number(h) || 0),
  lerItens: () => (revolver && revolver.pego ? ['revolver'] : []),
  // ITENS e INVENTARIO agora contam a MESMA historia sobre o revolver, e por
  // isso os dois se conferem: `itens` diz que a arma ja foi achada (pra ela nao
  // reaparecer no beco), e a mochila diz em qual vaga ela esta. Antes nao havia
  // conflito possivel — a arma morava num slot reservado da barra, fora da
  // mochila —, e agora ha.
  //
  // A regra e: quem foi achado tem que existir numa vaga, uma vez so.
  //  * save NOVO: a mochila ja traz a arma; o add aqui e desfeito pelo aplicar()
  //    logo abaixo (que limpa tudo antes de escrever) e nada duplica.
  //  * save ANTIGO: a mochila salva nao tem a arma (naquela epoca ela nao era um
  //    item de mochila). Sem a repescagem no escreverInventario, carregar um
  //    save antigo faria o jogador PERDER o revolver — achado, invisivel no beco
  //    e em vaga nenhuma.
  //  * save sem bloco de inventario: escreverInventario nem e chamado (ver
  //    save.js), e o add daqui e o unico que roda. Por isso ele fica aqui, e nao
  //    la.
  //
  // NAO seleciona a vaga: carregar um jogo nao pode sacar uma arma na mao de
  // quem acabou de chegar.
  escreverItens: (l) => {
    if (!Array.isArray(l) || l.indexOf('revolver') < 0) return
    if (revolver && revolver.marcarPego) revolver.marcarPego()
    if (inventario.quantidade('revolver') === 0) inventario.adicionar('revolver', 1)
  },
  lerInventario: () => inventario.serializar(),
  escreverInventario: (d) => {
    inventario.aplicar(d)
    if (revolver && revolver.pego && inventario.quantidade('revolver') === 0) {
      inventario.adicionar('revolver', 1)
    }
  },
  lerEncaixes: () => encaixe.serializar(),
  escreverEncaixes: (l) => encaixe.aplicar(l),
})
game.save = save

const saveUI = criarSaveUI({
  save,
  aoEscolher: (i, dados, modo) => {
    if (modo === 'salvar') {
      save.salvar(i, meuNome, true)
      saveUI.avisar('Salvo no lugar ' + (i + 1) + '.', 'bom')
      saveUI.pintar()
      return
    }
    if (!dados) {
      // Lugar vazio no modo continuar: e a porta de entrada de um jogo novo.
      saveUI.fechar()
      save.comecarEm(i, meuNome)
      menu.fechar()
      modoDeJogo = 'solo'
      abrirCriacao()
      return
    }
    saveUI.fechar()
    menu.fechar()
    // O mundo ja esta montado (ele nasce com a pagina): carregar e escrever o
    // estado por cima e devolver o controle. Nao ha cutscene — quem carrega ja
    // viu a cutscene uma vez.
    estado = 'jogo'
    hud.setJogando(true)
    hud.showHelp(true)
    mostrarItens(true)
    tutorial.mostrar(true)
    save.carregar(i)
    hud.toast('Jogo carregado: ' + (dados.nome || 'sem nome'))
    try { input.requestLock() } catch (err) { void err }
  },
})
game.saveUI = saveUI

/**
 * SALVA AUTOMATICAMENTE nos eventos que importam.
 *
 * "Importante" aqui quer dizer: alguma coisa que o jogador ficaria bravo de
 * perder. Entrar na casa pela primeira vez, comprar um movel, instalar um
 * movel, terminar uma missao, sair do cassino com dinheiro novo. O salvar()
 * agrupa em 400 ms sozinho, entao dois eventos no mesmo quadro escrevem uma
 * vez so — escrever no localStorage e sincrono e trava a thread do desenho.
 */
let avisouLotado = false
function salvarAgora(motivo) {
  if (estado !== 'jogo') return
  if (save.slot < 0) {
    // Quem entrou pelo botao JOGAR nao escolheu lugar nenhum. Pega o primeiro
    // vazio; se os cinco estao ocupados NAO grava — apagar o jogo de outra
    // pessoa pra caber este seria pior que nao gravar. Avisa uma vez e deixa a
    // escolha com quem joga (menu > Continuar > Apagar).
    const livre = save.primeiroLivre()
    if (livre < 0) {
      if (!avisouLotado) {
        avisouLotado = true
        hud.toast('Os 5 lugares de save estao cheios. Libere um no menu.', 6000)
      }
      return
    }
    save.comecarEm(livre, meuNome)
  }
  save.salvar(undefined, meuNome)
  void motivo
}
game.salvarAgora = salvarAgora
game.tutorial = tutorial

// A camera passeia pela cidade enquanto o menu esta na frente. E o unico
// motivo de a cidade continuar sendo desenhada la atras: um menu com fundo
// preto nao mostra o jogo que a pessoa esta prestes a jogar.
const PASSEIO = { r: 46, y: 15, alvo: new THREE.Vector3(6, 2, 2), vel: 0.045 }
let passeioT = 0

function passearPelaCidade(dt) {
  passeioT += dt * PASSEIO.vel
  camera.position.set(
    PASSEIO.alvo.x + Math.cos(passeioT) * PASSEIO.r,
    PASSEIO.y + Math.sin(passeioT * 0.7) * 3.2,
    PASSEIO.alvo.z + Math.sin(passeioT) * PASSEIO.r,
  )
  camera.lookAt(PASSEIO.alvo)
  camera.fov = 58
  camera.updateProjectionMatrix()
  lighting.setTarget(PASSEIO.alvo)
}

/** Conecta uma vez so e devolve sempre a mesma promessa. */
function conectar() {
  if (!conectando) {
    conectando = rede.conectar().catch((e) => { conectando = null; throw e })
  }
  return conectando
}

const criacao = criarCriacao({
  provador,
  aparencia: appearance,
  opcoes: {
    // Preview ao vivo: o palco mostra a peca no MESMO instante em que o card e
    // clicado. Sem isto o jogador escolhe no escuro.
    aoMudar(ap) {
      Object.assign(appearance, ap)
      // mesma leitura de volta do game.setAppearance: quem resolve 'skin' a
      // partir de 'pele' e o personagem, e o resto do jogo copia daqui
      Object.assign(appearance, character.setAppearance(appearance))
      provador.setAparencia(appearance)
      if (rede.conectado) rede.enviarAparencia(appearance)
    },
    aoNome(n) {
      meuNome = n || meuNome
      try { localStorage.setItem('mcrp-nome', meuNome) } catch (err) { void err }
      if (rede.conectado) rede.enviarNome(meuNome)
    },
    aoPronto(v) {
      if (modoDeJogo === 'coop') {
        // No coop quem decide quando o jogo comeca e o SERVIDOR: ele conta os
        // prontos e vira a fase. Aqui so sai o aviso.
        rede.marcarPronto(v)
        return
      }
      if (v) comecarPartida()
    },
  },
})
game.criacao = criacao

const menu = criarMenu({
  opcoes: {
    aoSolo() {
      modoDeJogo = 'solo'
      menu.fechar()
      abrirCriacao()
    },
    aoCoop() {
      modoDeJogo = 'coop'
      menu.abrir('lobby')
      menu.setMensagem('Conectando...')
      conectar().then(() => {
        menu.setSala({ fase: rede.sala.fase, anfitriao: rede.sala.anfitriao,
          meuId: rede.meuId, jogadores: rede.sala.jogadores })
        menu.setMensagem('')
      }).catch(() => {
        menu.setMensagem('Sem servidor. Da pra jogar solo.')
      })
    },
    aoComecar() { rede.pedirComecar() },
    aoVoltar(de) {
      // Sair da sala e sair de VERDADE: ficar conectado no lobby depois de
      // voltar pro menu deixaria o anfitriao esperando por um fantasma.
      if (de === 'lobby' && rede.conectado) {
        // O microfone MORRE JUNTO. Sair da sala e continuar com a luzinha
        // vermelha da webcam acesa e exatamente o tipo de coisa que ninguem
        // perdoa — e sem sala nao ha com quem falar de qualquer forma.
        voz.desligar()
        rede.fechar()
        conectando = null
      }
    },
    aoContinuar() {
      // A tela dos cinco lugares. Ela sobe POR CIMA do menu (z-index 92 contra
      // 90) em vez de virar mais uma tela dele: assim o menu nao precisa saber
      // o que e um save, e voltar dela e so fechar.
      if (game.saveUI) game.saveUI.abrir('continuar')
    },
    aoSair() {
      // Nao da pra fechar uma aba que o script nao abriu. Entao: avisa e
      // devolve pro menu, que e o mais honesto que existe aqui.
      hud.toast('Pra sair, feche a aba do navegador.', 4000)
    },
    aoTrocarOpcao(chave, valor) { aplicarOpcao(chave, valor) },
  },
})
game.menu = menu

/** As opcoes do menu que o JOGO precisa aplicar (o menu ja guardou sozinho). */
function aplicarOpcao(chave, valor) {
  if (chave === 'sensibilidade' && player.setSensibilidade) player.setSensibilidade(valor)
  else if (chave === 'inverterY' && player.setInverterY) player.setInverterY(valor)
  else if (chave === 'sombras') {
    renderer.shadowMap.enabled = valor !== 'baixa'
    lighting.sun.castShadow = valor !== 'baixa'
  } else if (chave === 'nome') {
    meuNome = String(valor || '').slice(0, 16) || meuNome
    try { localStorage.setItem('mcrp-nome', meuNome) } catch (err) { void err }
    if (rede.conectado) rede.enviarNome(meuNome)
  }
}
for (const k in lerOpcoes()) aplicarOpcao(k, lerOpcoes()[k])

function abrirCriacao() {
  estado = 'criacao'
  hud.setJogando(false)
  hud.showHelp(false)
  mostrarItens(false)
  startPreview('corpo')
  criacao.abrir({
    modo: modoDeJogo,
    nome: meuNome,
    prontos: 0,
    total: modoDeJogo === 'coop' ? Math.max(2, rede.sala.jogadores.length) : 1,
  })
  if (modoDeJogo === 'coop') criacao.setJogadores(rede.sala.jogadores)
}

/** A cutscene, e depois o jogo. Um caminho so pros dois modos. */
function comecarPartida(elencoForcado) {
  if (estado === 'abertura' || estado === 'jogo') return
  // O menu tambem fecha: no coop a sala pode pular do LOBBY direto pra
  // JOGANDO (quando quem chega atrasado entra numa partida ja rolando), e ai
  // quem estava olhando o lobby veria a cutscene atras da placa de neon.
  menu.fechar()
  criacao.fechar()
  stopPreview()
  estado = 'abertura'
  hud.setJogando(false)

  // Quem aparece sentado no sofa: eu sempre, e os outros do jeito que ELES se
  // customizaram (a aparencia de cada um ja chegou pelo ENTROU/APARENCIA).
  const elenco = Array.isArray(elencoForcado) && elencoForcado.length ? elencoForcado : []
  if (elenco.length) return montarCutscene(elenco)
  const eu = rede.meuId || 1
  const souAnfitriao = !rede.conectado || rede.sala.anfitriao === eu

  // O ELENCO SAI DA LISTA DA SALA, E NAO DO MUNDO.
  //
  // Duas armadilhas moram aqui, e as duas ja custaram a cena.
  //
  // 1. `rede.jogadores` esta VAZIO neste instante. Aquele mapa e preenchido
  //    dentro de rede.atualizar(), que o laco de quadro so chama no estado
  //    'jogo' — e a gente esta indo pro estado 'abertura'. Montando o elenco
  //    por ali, o coop inteiro assistia a cutscene com UMA pessoa no sofa. A
  //    lista da sala vem do servidor e ja esta cheia desde o lobby; a aparencia
  //    de cada um vem de rede.perfilDe(), que le o perfil escrito na hora em
  //    que o pacote ENTROU/APARENCIA chegou.
  //
  // 2. A ORDEM e a da SALA, e nao "eu primeiro". A posicao no elenco decide em
  //    que almofada cada um senta, em que ponto da fila fica na rua e onde o
  //    jogador nasce quando a cutscene acaba. Com "eu primeiro" cada cliente se
  //    poe no lugar 1: os quatro se veem no mesmo assento e os quatro nascem em
  //    cima do mesmo metro quadrado. A lista do servidor (listaDaSala) chega
  //    igual pra todo mundo, na ordem em que as pessoas entraram.
  const naSala = Array.isArray(rede.sala.jogadores) ? rede.sala.jogadores : []
  for (const j of naSala) {
    if (!j || !j.id) continue
    if (j.id === eu) {
      elenco.push({ id: eu, nome: meuNome, aparencia: appearance, anfitriao: souAnfitriao })
      continue
    }
    const perfil = (typeof rede.perfilDe === 'function' && rede.perfilDe(j.id)) || null
    elenco.push({
      id: j.id,
      nome: (perfil && perfil.nome) || j.nome || 'Jogador',
      aparencia: perfil && perfil.aparencia,
      anfitriao: rede.sala.anfitriao === j.id,
    })
  }
  // Solo, offline, ou sala que ainda nao mandou a foto: eu sozinho.
  if (!elenco.some((e) => e.id === eu)) {
    elenco.unshift({ id: eu, nome: meuNome, aparencia: appearance, anfitriao: souAnfitriao })
  }

  // A cutscene e criada AQUI, e nao no boot, por um motivo so: o elenco dela e
  // quem esta na sala AGORA. criarAbertura monta o porao inteiro (sofa, TV,
  // garrafas e um character por jogador) a partir da lista que recebe, e no
  // boot essa lista ainda seria so eu. Criada aqui, ela nasce com todo mundo
  // ja customizado; no fim ela mesma se descarta.
  montarCutscene(elenco)
}

/** Cria o porao com este elenco e roda a cutscene ate o fim. */
function montarCutscene(elenco) {
  if (abertura) abertura.dispose()
  abertura = criarAbertura({
    renderer,
    cena: scene,
    camera,
    jogadores: elenco,
    casa: (casa && casa.poseDaCutscene) || null,
    chao: game.groundY,
  })
  game.abertura = abertura

  abertura.iniciar(() => {
    estado = 'jogo'
    hud.setJogando(true)
    hud.showHelp(true)
    mostrarItens(true)
    // Nasce no MEU lugar da fila, que e o mesmo em que o boneco da cutscene
    // acabou de estar (a conta e uma so, filaDaCasa em world/layout.js). Sem
    // isto os quatro nasciam empilhados no centro da porta.
    const meu = Math.max(0, elenco.findIndex((e) => e && e.id === (rede.meuId || 1)))
    const f = filaDaCasa(meu, elenco.length)
    player.teleport(f.x, f.z, f.yaw)
    tutorial.definir(MISSOES_INICIAIS)
    tutorial.mostrar(true)
    try { input.requestLock() } catch (err) { void err }
    hud.toast(rede.conectado ? ('Online. ' + meuNome) : 'Jogando sozinho.')
    // PRIMEIRO PONTO DE GRAVACAO: a cutscene acabou e o jogador esta na frente
    // da casa, com o personagem que ele acabou de criar. E exatamente o momento
    // que o dono do projeto pediu ("depois da cut sene que a gente puder entrar
    // na casa ja tem que salvar").
    if (game.salvarAgora) game.salvarAgora('cutscene')
  }, elenco)
}

// O servidor virou a fase da sala: e ele quem manda no coop.
/**
 * O servidor mandou o estado de uma porta. Quem abre a porta e ESTA linha, e
 * nao o clique: o clique so pede (ver o onInteract em world/casa-velha.js).
 * Assim os quatro jogadores veem a mesma folha no mesmo lugar, e o colisor que
 * barra — que tambem e por maquina — acompanha.
 */
function aoPortaEstado(ev) {
  if (!ev) return
  if (casa && casa.portaId === ev.portaId && typeof casa.setPortaAberta === 'function') {
    casa.setPortaAberta(ev.aberta)
  }
}

function aoEstadoDaSala() {
  const f = rede.sala.fase
  menu.setSala({ fase: f, anfitriao: rede.sala.anfitriao, meuId: rede.meuId,
    jogadores: rede.sala.jogadores })
  if (estado === 'criacao') {
    criacao.setJogadores(rede.sala.jogadores)
    criacao.setProntos(
      rede.sala.jogadores.filter((j) => j.pronto).length,
      rede.sala.jogadores.length,
    )
  }
  if (modoDeJogo !== 'coop') return
  if (f === 'criando' && estado === 'menu') { menu.fechar(); abrirCriacao() }
  if (f === 'jogando' && (estado === 'criacao' || estado === 'menu')) comecarPartida()
}

/** Ha alguma janela de UI por cima do jogo? Enquanto houver, o mouse fica
 *  LIVRE e o mundo nao escuta clique nem tecla. Uma funcao so pros lugares que
 *  perguntam isso — antes eram condicoes escritas na mao, e cada tela nova
 *  entrava em algumas e faltava noutras. */
function uiAberta() {
  return customizer.isOpen() || palcoAtivo
    || (cassinoUI && cassinoUI.aberto) || (lojaUI && lojaUI.aberto)
    || (mercadoUI && mercadoUI.aberto) || (autoUI && autoUI.aberto)
    // A conversa entra aqui pra o E de interacao e as teclas 1-9 da barra nao
    // dispararem por baixo dela — as opcoes usam os MESMOS numeros.
    || (conversa && conversa.aberta)
    || (saveUI && saveUI.aberto)
    || (menu && menu.aberto) || (criacao && criacao.aberto)
}

menu.abrir('principal')
hud.setJogando(false)
hud.showHelp(false)
mostrarItens(false)

/* Atalhos do FLUXO pra ferramenta de foto, pro teste de fumaca e pro console.
   Nao ha caminho de UI que chame isto: o jogador passa pelos botoes do menu. */
game.fluxo = {
  get estado() { return estado },
  solo() { modoDeJogo = 'solo'; menu.fechar(); abrirCriacao() },
  criacao: abrirCriacao,
  comecar: comecarPartida,      // aceita um elenco falso (ferramenta de foto)
  menu() { estado = 'menu'; hud.setJogando(false); menu.abrir('principal') },
  /** Troca de mundo sem passar pela tecla. `id` opcional: sem ele, cicla. */
  cenario(id) { return id ? cenarios.mostrar(id) : cenarios.proximo() },
  sumir(v) { return cenarios.sumir(v) },
  /**
   * Pula direto pro JOGO, sem menu, sem criacao e sem cutscene.
   *
   * Existe pro teste de fumaca e pras ferramentas de foto: elas precisam do
   * mundo jogavel em dois segundos, e passar pelo fluxo inteiro sao mais de
   * vinte segundos de cutscene por execucao. Nenhum caminho de UI chega aqui —
   * o jogador entra pelos botoes do menu, sempre.
   */
  jogar(opcoes) {
    if (abertura) { abertura.dispose(); abertura = null }
    menu.fechar()
    criacao.fechar()
    stopPreview()
    estado = 'jogo'
    modoFoto = false
    hud.setJogando(true)
    hud.showHelp(true)
    mostrarItens(true)
    player.teleport(2, 9, 0)
    tutorial.definir(MISSOES_INICIAIS)
    tutorial.mostrar(true)
    // { online: true } entra na sala tambem: e o que o teste de dois
    // navegadores (tools/teste-online.mjs) precisa, ja que o jogo deixou de
    // conectar sozinho ao abrir a pagina.
    if (opcoes && opcoes.online) {
      modoDeJogo = 'coop'
      return conectar()
    }
    return Promise.resolve()
  },

  /** Congela a camera pra fotografia (tools/shot-*.mjs). */
  foto(v) {
    modoFoto = v !== false
    if (modoFoto) { menu.fechar(); criacao.fechar(); stopPreview(); estado = 'jogo'; hud.setJogando(false) }
  },
}

// Esc/Espaco pulam a cutscene.
window.addEventListener('keydown', (e) => {
  if (estado !== 'abertura') return
  if (e.code === 'Escape' || e.code === 'Space') abertura.pular()
})

renderer.domElement.addEventListener('click', () => {
  if (estado !== 'jogo') return
  if (uiAberta()) return
  input.requestLock()
})

// ---------------------------------------------------------------------------
// REINICIAR O MUNDO (F8, apertado duas vezes)
//
// POR QUE RECARREGAR A PAGINA em vez de "desfazer" cada coisa: porque o estado
// espalhado pelo cliente e grande e cheio de cantos — a arma na mao, o carro
// estacionado noutro lugar, o slot destravado na barra, o dialogo aberto. Cada
// modulo precisaria de um reiniciar() proprio, e bastaria UM esquecido pra a
// tecla mentir. Recarregar reconstroi tudo pelo mesmo caminho do primeiro
// carregamento, que e o unico caminho que ja esta testado.
//
// O mundo COMPARTILHADO nao volta por recarregar: quem o desfaz e o servidor
// (sala.reiniciarMundo). Por isso a ordem online e: pedir -> o servidor
// reinicia e avisa TODOS -> cada cliente recarrega. Sozinho, sem servidor, nao
// ha nada pra pedir e recarregar ja e o mundo inicial.
//
// DOIS toques, e nao um: isto apaga o progresso da SALA INTEIRA, inclusive o
// dos outros jogadores. Uma tecla de funcao encostada por acidente nao pode
// custar isso a todo mundo.
// ---------------------------------------------------------------------------
const REINICIO_JANELA = 4        // segundos pra confirmar
let reinicioPedidoEm = -999

function recomecarDoZero(aviso) {
  hud.toast(aviso || 'Reiniciando o mundo...', 3000)
  try { input.exitLock() } catch (err) { void err }
  // um respiro pra o toast ser lido antes de a tela recomecar
  setTimeout(() => { try { location.reload() } catch (err) { void err } }, 700)
}

function pedirReinicio() {
  // primeiro toque: so avisa o que vai acontecer
  if (game.time - reinicioPedidoEm > REINICIO_JANELA) {
    reinicioPedidoEm = game.time
    hud.toast('Aperte F8 de novo para REINICIAR O MUNDO: veiculos, NPCs e '
      + 'itens voltam ao inicio.', REINICIO_JANELA * 1000)
    return
  }
  reinicioPedidoEm = -999
  // Online, quem reinicia e o servidor: aqui so sai o pedido, e o recarregar
  // vem no MUNDO_REINICIADO que volta pra sala inteira (inclusive pra mim).
  if (rede.conectado && rede.reiniciarMundo()) return
  recomecarDoZero('Reiniciando o mundo...')
}

// --- Loop ------------------------------------------------------------------
let helpOn = true
let envioAcc = 0
let fpsAtual = 0
let fpsAcc = 0, fpsCount = 0, fpsTimer = 0
const clock = engine.clock

/** O FPS e o painel de rede, medidos em qualquer estado. */
function medirFps(dt) {
  fpsAcc += dt; fpsCount++
  fpsTimer += dt
  if (fpsTimer < 0.5) return
  fpsAtual = Math.round(fpsCount / fpsAcc)
  hud.setFps(fpsAtual)
  hud.setRede(fpsAtual, rede.conectado ? rede.stats : null,
    rede.conectado ? 'online' : (rede.recusado ? 'recusado' : 'sozinho'))
  fpsAcc = 0; fpsCount = 0; fpsTimer = 0
}

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(clock.getDelta(), 0.05)
  game.time += dt

  // ---- MENU: a cidade continua viva la atras -------------------------------
  // Desenhar a cidade em vez de um fundo chapado custa o mesmo quadro que o
  // jogo ja custa, e mostra o jogo que a pessoa esta prestes a jogar.
  if (estado === 'menu') {
    if (!modoFoto) passearPelaCidade(dt)
    lighting.update(dt)
    clima.atualizar(dt, camera.position)
    neve.setCobertura(clima.cobertura)
    neve.atualizar(dt)
    for (let i = 0; i < moduleUpdates.length; i++) moduleUpdates[i](dt, game)
    for (let i = 0; i < propUpdates.length; i++) propUpdates[i](dt, game)
    engine.render()
    input.endFrame()
    medirFps(dt)
    return
  }

  // ---- CRIACAO DE PERSONAGEM: so o palco ----------------------------------
  // A cidade nao e desenhada aqui de proposito: o palco tem fundo proprio e
  // desenhar as duas coisas seria pagar a cidade inteira pra ela ficar
  // escondida atras de um veu preto.
  if (estado === 'criacao') {
    criacao.atualizar(dt)
    criacao.render()
    input.endFrame()
    medirFps(dt)
    return
  }

  // ---- CUTSCENE DE ABERTURA ------------------------------------------------
  if (estado === 'abertura') {
    abertura.atualizar(dt)
    if (abertura.parte === 2) {
      // parte 2 e na CIDADE: passa pelo engine.render() pra sair com o mesmo
      // acabamento de cor do resto do jogo, e nao pelo renderer cru
      lighting.setTarget(camera.position)
      lighting.update(dt)
      clima.atualizar(dt, camera.position)
      neve.setCobertura(clima.cobertura)
      neve.atualizar(dt)
      for (let i = 0; i < moduleUpdates.length; i++) moduleUpdates[i](dt, game)
      engine.render()
    } else {
      abertura.render()
    }
    input.endFrame()
    medirFps(dt)
    return
  }

  // ---- JOGO ----------------------------------------------------------------
  // ajuda (Tab)
  if (input.wasPressed('Tab')) hud.showHelp(helpOn = !helpOn)
  if (input.wasPressed('F3')) hud.toggleF3()
  // V: a primeira vez PEDE o microfone (e o gesto que o navegador exige pra
  // perguntar); da segunda em diante so alterna mudo. Desligar de vez e a
  // saida do coop, que ja chama voz.desligar().
  if (input.wasPressed('KeyV') && !uiAberta() && estado === 'jogo') {
    if (voz.ativa) voz.alternarMudo()
    else voz.ligar().then((ok) => { if (ok) hud.toast('Voz ligada — V para mudo') })
  }
  // C = clima. Sol -> chuva -> neve -> sol. Uma tecla so, como foi pedido: com
  // tres teclas separadas o jogador teria que decorar qual e qual.
  if (input.wasPressed('F8') && !uiAberta()) pedirReinicio()
  // F5 = a tela dos cinco lugares, pra gravar na mao. O jogo grava sozinho nos
  // eventos que importam (cutscene, compra, movel, missao); esta tecla e pra
  // quem quer escolher EM QUAL lugar, ou guardar um jogo antes de experimentar
  // alguma coisa. preventDefault mora no core/input: F5 recarrega a pagina.
  if (input.wasPressed('F5') && !uiAberta() && estado === 'jogo') saveUI.abrir('salvar')
  // F6 TROCA DE CENARIO, F7 FAZ O CENARIO SUMIR.
  //
  // Trocar leva o jogador junto (nasce no spawn do mundo novo); sumir deixa ele
  // exatamente onde esta, no vazio — e assim que da pra fotografar o personagem
  // sem uma parede atras. As duas mexem no MUNDO e nao no jogador, entao valem
  // tambem no menu: e la que se ve o passeio de camera do cenario novo.
  if (input.wasPressed('F6') && !uiAberta()) cenarios.proximo()
  if (input.wasPressed('F7') && !uiAberta()) cenarios.sumir()
  if (input.wasPressed('KeyC') && !uiAberta()) {
    const nova = clima.proximaEstacao()
    hud.toast(NOME_ESTACAO[nova] || nova)
  }
  // trocar de item no meio de uma mao de blackjack sacaria o revolver na mesa
  if (!uiAberta()) {
    // 1 a 9: as nove vagas da barra. O laco vai ate inventario.vagas e nao ate
    // 9 cravado porque a mochila ja avisou que um dia nove vira outro numero.
    for (let d = 0; d < Math.min(9, inventario.vagas); d++) {
      if (input.wasPressed('Digit' + (d + 1))) selecionarVaga(d)
    }
  }

  // Com o palco aberto o jogador NAO anda: quem esta escolhendo uma camisa nao
  // pode sair andando pela loja com a camera dentro do provador.
  if (!palcoAtivo && !modoFoto) {
    player.update(dt)
    hud.setMode(player.mode)
    hud.setCrosshair(player.mode === 'first')
  }

  // --- ENCAIXE DE MOVEL ----------------------------------------------------
  //
  // Roda ANTES da interacao e, quando pega alguma coisa, COME o quadro dela.
  // Sem isso o primeiro quadro do "segurar E" pra guardar a mesa tambem
  // dispararia o wasPressed('KeyE') da interacao por proximidade — o jogador
  // guardaria o movel e abriria a porta no mesmo aperto.
  let encaixeComeu = false
  if (!uiAberta()) {
    encaixeComeu = encaixe.atualizar(dt, input)
    if (encaixe.ativo) {
      // Confirmar e o botao esquerdo. O revolver so escuta o mouse quando esta
      // equipado, e selecionar uma vaga de MOVEL desequipa a arma e esvazia a
      // mao (ver aplicarVaga) — entao aqui o clique nao dispara tiro.
      if (input.wasPressed('Mouse0')) encaixe.confirmar()
      if (input.wasPressed('Escape')) { encaixe.sair(); pintarMochila() }
    }
  }

  // interacao
  if (!uiAberta() && !encaixeComeu) {
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
        const item = /revolver/.test(hit.id) ? 'revolver' : null
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

  // --- O BOTAO ESQUERDO COM COPO NA MAO -----------------------------------
  //
  // Um botao so faz o ciclo inteiro (ver player/copo.js): copo vazio ESTICA a
  // mao, copo cheio vai a BOCA, e quando zera volta a esticar. Enquanto ha copo
  // na mao o revolver esta guardado (aplicarVaga desequipa), entao o clique nao
  // disputa com o tiro.
  //
  // Sem copo na mao, o mesmo clique ABRE E FECHA A TORNEIRA que estiver na mira
  // — foi o pedido ("com o mouse ou a letra E"), e a tecla E continua fazendo o
  // mesmo pelo ponto de interacao normal.
  if (!uiAberta() && !encaixeComeu && !encaixe.ativo && !veiculos.dirigindo) {
    if (input.wasPressed('Mouse0')) {
      if (copo.segurando) {
        copo.usar()
      } else {
        const alvo = interaction.current
        if (alvo && /^adega-torneira/.test(alvo.id)) interaction.trigger(game)
      }
    }
  }

  // ---- online ----
  rede.atualizar(dt)
  avatares.sincronizar(rede.jogadores, rede.meuId, dt)
  // DEPOIS de rede.atualizar: as posicoes que o PannerNode usa sao as que
  // acabaram de ser interpoladas. Antes, a voz de todo mundo ficaria um quadro
  // atras do boneco que a esta emitindo.
  voz.atualizar(dt)
  hud.setVoz(voz.estado())

  // Meu corpo sobe a 15 Hz, o mesmo ritmo do servidor. Mandar a 60 so gastaria
  // banda: o servidor nao tem o que fazer com o quadro do meio.
  envioAcc += dt
  if (envioAcc >= 1 / TICK_HZ) {
    envioAcc = 0
    const st = player.getState ? player.getState() : {}
    const anim = player.sitting ? 4
      : (!player.grounded ? 3 : (player.speed > 3.4 ? 2 : (player.speed > 0.2 ? 1 : 0)))
    const flags = (player.sitting ? 1 : 0)
    rede.enviarMeuEstado(
      player.position.x, player.position.y, player.position.z,
      character.root.rotation.y, anim, flags,
    )
    void st
  }

  // Depois de player.update: dirigindo, o sistema escreve por cima da camera,
  // do personagem e do prompt do HUD — e quem escreve por ultimo e quem manda.
  veiculos.atualizar(dt)
  revolver.atualizar(dt)
  // DEPOIS do revolver e DEPOIS do player.update: a pose da mao e montada a
  // partir da matriz da camera deste quadro, e a camera so esta no lugar final
  // depois que o controller andou.
  mao.atualizar(dt)
  // DEPOIS da mao, e pela mesma razao que ela vem depois do revolver: as tres
  // disputam a mesma tela e a pose sai da matriz da camera JA no lugar final.
  copo.atualizar(dt)
  // O BRACO DIREITO DO BONECO sabe que tem coisa na mao. So aparece em 3a
  // pessoa, e e o que impede o personagem de correr bombeando os dois bracos
  // com uma garrafa de um litro presa na mao (ver poseSegurando em
  // player/animation.js). Vale pro revolver pela mesma razao.
  if (player.animator && typeof player.animator.segurarNaDireita === 'function') {
    player.animator.segurarNaDireita(mao.segurando || copo.segurando || revolver.equipado)
  }
  clima.atualizar(dt, player.position)
  // A neve acumulada segue a cobertura que o clima calculou neste quadro: quem
  // decide quanto ja caiu e o clima, quem desenha o resultado e a neve.
  neve.setCobertura(clima.cobertura)
  neve.atualizar(dt)
  if (cassinoUI && typeof cassinoUI.atualizar === 'function') cassinoUI.atualizar(dt)
  if (lojaUI && typeof lojaUI.atualizar === 'function') lojaUI.atualizar(dt)
  if (mercadoUI && typeof mercadoUI.atualizar === 'function') mercadoUI.atualizar(dt)
  // Movel posto que se mexe (a tela do video poker e o primeiro): quem quer
  // quadro marca userData.update no proprio grupo. Ver encaixe.atualizar.
  if (encaixe && typeof encaixe.atualizar === 'function') encaixe.atualizar(dt)
  if (adegaUI && typeof adegaUI.atualizar === 'function') adegaUI.atualizar(dt)
  if (autoUI && typeof autoUI.atualizar === 'function') autoUI.atualizar(dt)
  dialogo.atualizar(player.position)
  // DEPOIS do player.update: a camera so esta no lugar final do quadro depois
  // que o controller andou, e e nela que a saudacao e projetada.
  conversa.atualizar(dt)
  legenda.atualizar(dt)

  // DEPOIS de todo mundo escrever nas suas "luzes": o pool escolhe as duas mais
  // fortes do quadro e copia pras duas PointLight reais. Tem que ser aqui, no
  // fim — antes disso metade dos efeitos ainda nao mexeu na propria luz.
  poolLuz.atualizar()

  lighting.setTarget(player.position)
  lighting.update(dt)

  for (let i = 0; i < moduleUpdates.length; i++) moduleUpdates[i](dt, game)
  for (let i = 0; i < propUpdates.length; i++) propUpdates[i](dt, game)

  tutorial.atualizar(dt, game)
  // O cronometro do card ("3h 12min"). So corre com um lugar escolhido e so
  // dentro do jogo — tempo parado no menu nao e tempo jogado.
  save.tique(dt)

  // O PALCO substitui a cidade enquanto o painel de customizacao esta aberto.
  // O mundo continua sendo SIMULADO acima (NPC, clima, veiculo) — o que muda e
  // so quem e desenhado. Parar a simulacao junto faria o jogador voltar do
  // barbeiro e encontrar a cidade congelada no instante em que ele sentou.
  if (palcoAtivo) {
    provador.atualizar(dt)
    provador.render()
  } else {
    engine.render()
  }
  input.endFrame()
  medirFps(dt)
}

frame()

// O JOGO NAO CONECTA MAIS SOZINHO AO ABRIR.
//
// Antes, a pagina abria e ja entrava na sala. Com o menu isso ficou errado por
// dois motivos: quem vai jogar SOLO nao tem por que aparecer no mundo de
// ninguem, e quem vai jogar COOP escolhe a hora de entrar (a sala tem 4 vagas,
// e ocupar uma so por ter aberto a aba tira a vaga de quem ia jogar).
// Quem conecta e o botao COOP do menu, por conectar() logo acima.

// expoe pra debug no console
// THREE junto: sem ele, depurar no console (raycast, Box3, medir distancia)
// exige importar o modulo de novo por uma URL diferente, e ai sao DUAS copias
// da biblioteca na memoria — instanceof para de funcionar entre elas.
game.THREE = THREE
window.__game = game
