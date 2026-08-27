import * as THREE from 'three'
import { createCharacter } from '../player/character.js'
import { HEAD_S, EYE_ANCHOR, surfaceZ } from '../player/appearance.js'
import { textPlaneMat } from '../world/materials.js'
import { PRIORIDADE } from '../render/luzes-efeito.js'
import {
  NPC_POR_CHAVE, ZUMBI_ID,
  ZUMBI_DOENCA, ZUMBI_GRITO, ZUMBI_VEL, ZUMBI_DIST_ATAQUE, ZUMBI_VIDA_MAX,
  ZUMBI_RAIO,
} from '../comum/mundo.js'
import { EST_NPC } from '../comum/protocolo.js'

// ---------------------------------------------------------------------------
// O RAPAZ DA PORTA DA MERCEARIA — adoece na sua frente e vira zumbi.
//
// Maquina de estados (o campo `estado` do retorno segue exatamente estes nomes):
//   'sao'        parado na calcada, respira, olha pra voce. E o "Falar com o
//                rapaz" do prompt de E.
//   'adoecendo'  10 s piorando A VISTA: tosse, cambaleia, a pele esverdeia, os
//                olhos afundam, a postura curva. Barra em cima da cabeca +
//                pulso no chao marcando o tempo; nos ultimos 2 s ele treme.
//   'zumbi'      grito, transformacao e perseguicao. Anda a VEL_ZUMBI, que e
//                mais devagar que o jogador CORRENDO (PLAYER.RUN_SPEED) e mais
//                rapido que andando — da pra fugir, mas nao da pra ignorar.
//   'morto'      cai, some em alguns segundos e deixa uma mancha no chao.
//
// COMO O REVOLVER DIZ ONDE ACERTOU (a escolha pedida no enunciado):
//   O revolver expoe `aoAcerto = { ponto, normal, objeto, distancia }`. O main
//   pergunta a QUEM foi atingido, em vez de o zumbi adivinhar pelo raio:
//
//     const parte = zumbi.grupo.userData.parteAtingida(objeto)  // ou
//     const parte = zumbi.grupo.userData.zumbi.parteAtingida(objeto)
//     if (parte) zumbi.levarTiro(parte, { ponto, normal, objeto, distancia })
//
//   `parteAtingida(obj)` sobe a arvore do objeto ate achar a marca
//   userData.zumbiParte ('cabeca' na cabeca, 'corpo' no resto) e devolve null
//   pra qualquer coisa que nao seja este NPC (ou se ele ja estiver morto).
//   Pra quem preferir comparar referencia, os dois nos tambem saem prontos em
//   grupo.userData.zumbi.alvoCabeca / .alvoCorpo — os MESMOS Object3D em que a
//   marca esta. Nenhuma referencia dessas atravessa a rede: ela e so local.
//
// DANO: 1 tiro na cabeca mata (VIDA_MAX de dano de uma vez), 3 no corpo matam.
//
// REDE: ESTE ARQUIVO NAO DECIDE NADA QUANDO HA SERVIDOR.
//
// O rapaz e o NPC 1004 (src/comum/mundo.js). O cerebro dele mora em
// servidor/sala.js: o relogio da doenca, a virada, a perseguicao e a morte
// rodam la, no passo(), e chegam aqui no MESMO registro de NPC que o snapshot
// ja mandava — `estado` no enum EST_NPC (SAO, ADOECENDO, ZUMBI, MORTO,
// SUMIDO) e a posicao em x/z/yaw, interpolada 100 ms atras como a de qualquer
// NPC. Nenhum byte a mais por quadro, e o mesmo bicho na tela dos dois.
//
// O que este arquivo faz, online, e olhar rede.npcs.get(1004) todo quadro e
// disparar o VISUAL nas TRANSICOES que ele observa. TODO o juice fica aqui:
// sangue, clarao, onda de choque, camera lenta, tremor, tosse, balao de fala,
// a pele mudando de tom, a vinheta vermelha. Nada disso viaja.
//
// So DUAS coisas saem daqui pro servidor, e as duas sao PEDIDOS:
//   rede.zumbiPedir('adoecer')          falei com ele  -> FALAR no NPC 1004
//   rede.zumbiPedir('tiro', parte)      acertei um tiro -> ZUMBI_TIRO
// A vida NAO viaja: quem subtrai e o servidor (1 na cabeca, 3 no corpo), e o
// resultado volta como estado MORTO no snapshot, pro mesmo caminho de todo
// mundo. A `vida` que existe aqui embaixo e so do modo sozinho.
//
// MODO SOZINHO: `ehLocal()` e decidido A CADA acao (o jogo abre antes de
// conectar e pode perder a conexao no meio). Sem servidor — ou sem conexao —
// este arquivo roda a maquina de estados inteira sozinho, exatamente como
// sempre fez, respondendo aos proprios pedidos pelo MESMO caminho
// (aoEventoDeRede). Um caminho so, dos dois lados.
//
// ORCAMENTO: nenhuma luz com sombra (o sol continua sendo a unica) e nenhuma
// luz PROPRIA — a aura doentia sai de um proxy emprestado do pool de
// src/render/luzes-efeito.js. Ela nasce com intensidade 0 e NUNCA e escondida
// com .visible: mudar a contagem de luzes recompila todos os materiais da cena.
// ---------------------------------------------------------------------------

// --- numeros do bicho -------------------------------------------------------
//
// Os que o SERVIDOR tambem precisa (posicao inicial, tempo da doenca,
// velocidade, alcance de ataque, vida) vem de src/comum/mundo.js, que e o
// arquivo que os dois lados leem. Duas copias divergiriam no dia em que
// alguem afinasse a velocidade em um so — e a diferenca apareceria como "no
// online ele e mais rapido", que ninguem liga a um numero copiado.
// Os que sao SO VISUAIS (tempo de queda, do fade, da camera lenta, do tremor)
// ficam aqui: eles nao atravessam a rede e o servidor nao tem o que fazer com
// eles.
const N_ZUMBI = NPC_POR_CHAVE.zumbi   // a entrada do NPC 1004 em mundo.js
const CASA = { x: N_ZUMBI.x, z: N_ZUMBI.z, yaw: N_ZUMBI.yaw }
const DUR_DOENCA = ZUMBI_DOENCA  // segundos entre o "nao estou bem" e o grito
const DUR_TREMOR = 2.0       // ultimos segundos, quando ele treme forte
const DUR_GRITO = ZUMBI_GRITO // a transformacao, parado, antes de sair andando
const VEL_ZUMBI = ZUMBI_VEL  // m/s: entre PLAYER.WALK_SPEED (3.1) e RUN_SPEED (6.2)
const RAIO_ZUMBI = ZUMBI_RAIO  // raio de colisao dele contra as paredes
const DIST_ATAQUE = ZUMBI_DIST_ATAQUE  // a partir daqui ele encosta em voce
const ESPERA_ATAQUE = 1.05   // segundos entre uma paulada e outra
const VIDA_MAX = ZUMBI_VIDA_MAX  // 3 tiros no corpo; a cabeca tira tudo de uma vez
const DUR_MORTE = 1.05       // queda
const DUR_SUMIR = 2.2        // fade depois de deitado
const ESPERA_SUMIR = 2.6     // quanto tempo o corpo fica no chao antes do fade
const DUR_LENTO = 0.8        // camera lenta curtinha do tiro final
const FATOR_LENTO = 0.28

/**
 * O byte de estado do snapshot -> o nome que este arquivo usa.
 *
 * SUMIDO cai em 'morto' de proposito: pra quem desenha, "morto" e "sumido" sao
 * o mesmo estado em dois momentos diferentes da mesma animacao. O que muda e o
 * PONTO em que a animacao comeca, e quem cuida disso e pularParaOFim().
 * Estado que este cliente nao conhece devolve undefined e e IGNORADO — o outro
 * lado pode ser mais novo que eu, e ignorar e melhor que adivinhar.
 */
const NOME_DO_ESTADO = {
  [EST_NPC.SAO]: 'sao',
  [EST_NPC.ADOECENDO]: 'adoecendo',
  [EST_NPC.ZUMBI]: 'zumbi',
  [EST_NPC.MORTO]: 'morto',
  [EST_NPC.SUMIDO]: 'morto',
}

// Tons de pele: sao -> doente -> zumbi. O tom "sao" e proprio dele (nao o
// padrao do jogo) pra deixar claro no cache de materiais que estas cores sao
// so deste NPC — mesmo assim os materiais sao CLONADOS (ver clonarMateriais).
const PELE_SA = 0xf0c6a2
const PELE_DOENTE = 0x9db07b
const PELE_ZUMBI = 0x6f8a63
const COR_SANGUE = 0x8e1220
const COR_DOENCA = 0x8fdf6a

const JUNTAS = [
  'hips', 'torso', 'chest',
  'armRUpper', 'armRLower', 'handR',
  'armLUpper', 'armLLower', 'handL',
  'legRUpper', 'legRLower', 'footR',
  'legLUpper', 'legLLower', 'footL',
]

// Lembrete da convencao do rig: o membro aponta pra -Y, entao rotation.x
// NEGATIVO joga o braco/perna pra FRENTE (+Z). No tronco (torso/chest) o mesh
// fica acima da junta, entao x POSITIVO curva pra frente.
const POSE_SAO = {
  armRUpper: [0.04, 0, 0.10], armRLower: [-0.22, 0, 0], handR: [-0.10, 0, 0],
  armLUpper: [0.04, 0, -0.10], armLLower: [-0.22, 0, 0], handL: [-0.10, 0, 0],
}
const POSE_DOENTE = {
  // curvado, nao dobrado ao meio: hips+torso+chest somam ~24 graus, e a tosse
  // ainda empilha uns 29 por cima disso
  hips: [0.03, 0, 0], torso: [0.09, 0, 0], chest: [0.30, 0, 0],
  // bracos abracando a barriga: e o que le como "passando mal"
  armRUpper: [-0.62, 0, 0.44], armRLower: [-1.30, 0, -0.28], handR: [-0.34, 0, 0],
  armLUpper: [-0.52, 0, -0.42], armLLower: [-1.12, 0, 0.26], handL: [-0.34, 0, 0],
  legRUpper: [0.06, 0, 0.05], legLUpper: [0.06, 0, -0.05],
}
const POSE_ZUMBI = {
  hips: [0.02, 0, 0], torso: [0.06, 0, 0], chest: [0.28, 0, 0],
  // bracos esticados a frente, maos caidas
  armRUpper: [-1.44, 0, 0.26], armRLower: [-0.26, 0, 0], handR: [0.48, 0, 0],
  armLUpper: [-1.36, 0, -0.24], armLLower: [-0.34, 0, 0], handL: [0.48, 0, 0],
  legRUpper: [-0.05, 0, 0.06], legLUpper: [-0.02, 0, -0.06],
}

const ZERO3 = [0, 0, 0]
const TAU = Math.PI * 2
const _v = new THREE.Vector3()
const _w = new THREE.Vector3()
const _dir = new THREE.Vector3()

function limitar(v, a, b) { return v < a ? a : (v > b ? b : v) }

/** Menor caminho angular de `de` ate `para` (nada de dar a volta de 350 graus). */
function deltaAngulo(de, para) {
  let d = (para - de) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

/**
 * Marca uma subarvore como "nao e alvo de tiro". O revolver le userData.semTiro
 * e pula esses objetos no raycast: sem isso, os efeitos que o zumbi joga na
 * cena (sangue, clarao, onda de choque) ficam NA FRENTE dele e o tiro seguinte
 * acerta a particula do tiro anterior.
 */
function marcarSemTiro(obj) {
  if (!obj) return obj
  obj.traverse ? obj.traverse((o) => { o.userData.semTiro = true }) : (obj.userData.semTiro = true)
  return obj
}

export function criarZumbi({ scene, player, character, collision, hud,
  groundY, interaction, rede, poolLuz }) {

  const chaoEm = typeof groundY === 'function' ? groundY : () => 0.16

  // Sem servidor que conheca este NPC o modulo finge o servidor pra si mesmo,
  // igual ao anel. Decidido A CADA acao: o jogo abre antes de conectar e pode
  // perder a conexao no meio.
  const ehLocal = () => !rede || typeof rede.zumbiPedir !== 'function' || !rede.conectado

  function avisar(msg) { if (hud && typeof hud.toast === 'function') hud.toast(msg) }

  // =========================================================================
  // 1. O CORPO
  // =========================================================================
  const grupo = new THREE.Group()
  grupo.name = 'zumbi'
  // o forno de geometria (world/bake.js) nao pode fundir quem anima por junta
  grupo.userData.dynamic = true
  grupo.position.set(CASA.x, chaoEm(CASA.x, CASA.z), CASA.z)
  grupo.rotation.y = CASA.yaw
  // ATENCAO: NAO marque este grupo com marcarSemTiro. Ele e o ALVO.
  // ehIgnorado() do revolver sobe pela arvore de pais, entao um semTiro aqui
  // na raiz apagava o zumbi inteiro do raycast e a arma nunca acertava nada
  // nele. A marca vale so para o que o proprio zumbi joga na cena DEPOIS
  // (sangue, clarao, onda de choque), e esses sao marcados um a um.
  scene.add(grupo)

  const corpo = createCharacter({
    skin: PELE_SA,
    // sapato ESCURO de proposito: a classificacao de "o que e pele" compara
    // tons, e um tenis bege claro cairia junto com a pele e esverdearia tambem
    shirt: 0x6f7d8c, pants: 0x3b4350, shoes: 0x4a4640,
    appearance: { hair: 1, eyes: 0, brows: 0, mouth: 0, hairColor: 1 },
  })
  grupo.add(corpo.root)
  const P = corpo.parts
  // A junta do quadril NAO nasce em zero: a posicao dela E a altura do quadril
  // (HIPS_Y). Quem quiser dar um "quique" na passada soma em cima deste valor —
  // escrever direto em P.hips.position.y enterra o boneco meio metro no chao.
  const QUADRIL_Y = P.hips.position.y

  // --- materiais so dele ----------------------------------------------------
  // materials.js CACHEIA por cor: mexer na cor do material da pele tingiria
  // todo NPC que usasse o mesmo tom. Entao cada material do boneco vira um
  // clone que so este arquivo escreve (e so este arquivo destroi).
  const meusMats = []
  const matsPele = []          // { m, base: THREE.Color } — o que esverdeia
  const matsOlho = []          // materiais do slot de olhos (escurecem e depois brilham)

  const _baseP = new THREE.Color()

  /**
   * "Esta cor e o tom de pele dele (claro ou o escurecido do pescoco/orelha)?"
   * character.js gera o tom escuro multiplicando o tom base por um fator, entao
   * o teste e pela PROPORCAO entre os canais, e nao pela distancia: assim ele
   * continua valendo se um dia o fator mudar, e nao pega uma camiseta bege.
   */
  function ehTomDePele(cor) {
    const m = Math.max(cor.r, cor.g, cor.b)
    const mb = Math.max(_baseP.r, _baseP.g, _baseP.b)
    if (m < 1e-4 || mb < 1e-4) return false
    const k = m / mb
    if (k > 1.02 || k < 0.5) return false
    return Math.abs(cor.r / m - _baseP.r / mb) < 0.02
      && Math.abs(cor.g / m - _baseP.g / mb) < 0.02
      && Math.abs(cor.b / m - _baseP.b / mb) < 0.02
  }

  function clonarMateriais() {
    // o tom que o character.js REALMENTE resolveu (ele aceita indice de tabela
    // alem de cor crua, e a conversao e dele, nao minha)
    const skinHex = (corpo.appearance && corpo.appearance.skin) || PELE_SA
    _baseP.setHex(skinHex > 255 ? skinHex : PELE_SA)

    // Meshes que estao dentro de um SLOT (cabelo, olhos, boca, roupa...) nunca
    // sao pele: quem esverdeia e so o corpo.
    const emSlot = new Set()
    for (const k in corpo.slots) {
      const s = corpo.slots[k]
      if (s && s.traverse) s.traverse((o) => { if (o.isMesh) emSlot.add(o) })
    }

    const feitos = new Map()
    corpo.root.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return
      let c = feitos.get(o.material)
      if (!c) {
        c = o.material.clone()
        feitos.set(o.material, c)
        meusMats.push(c)
      }
      o.material = c
    })

    // Classifica DEPOIS de clonar: varios meshes dividem o mesmo clone.
    const vistos = new Set()
    corpo.root.traverse((o) => {
      if (!o.isMesh || !o.material || emSlot.has(o)) return
      if (vistos.has(o.material)) return
      vistos.add(o.material)
      if (o.material.color && ehTomDePele(o.material.color)) {
        matsPele.push({ m: o.material, base: o.material.color.clone() })
      }
    })

    const olhos = corpo.slots.eyes || corpo.slots.olhos
    if (olhos && olhos.traverse) {
      olhos.traverse((o) => {
        if (o.isMesh && o.material && matsOlho.indexOf(o.material) < 0) matsOlho.push(o.material)
      })
    }
  }
  clonarMateriais()

  // --- pecas extras do rosto ------------------------------------------------
  // Olheiras: duas manchas escuras coladas na curva do rosto, logo abaixo dos
  // olhos. surfaceZ() da o Z da pele naquele (x,y), entao elas acompanham o ovo
  // da cabeca em vez de flutuar na frente dele.
  const matOlheira = new THREE.MeshStandardMaterial({
    color: 0x2b2118, roughness: 0.95, transparent: true, opacity: 0, depthWrite: false,
  })
  const geoOlheira = new THREE.SphereGeometry(1, 12, 8)
  const olheiras = []
  for (const sgn of [1, -1]) {
    const o = new THREE.Mesh(geoOlheira, matOlheira)
    const y = EYE_ANCHOR.y - 0.030 * HEAD_S
    const x = sgn * EYE_ANCHOR.x
    o.scale.set(0.046 * HEAD_S, 0.026 * HEAD_S, 0.020 * HEAD_S)
    o.position.set(x, y, surfaceZ(x, y, 0.001) - 0.012 * HEAD_S)
    o.castShadow = false; o.receiveShadow = false
    P.head.add(o)
    olheiras.push(o)
  }

  // Boca aberta: buraco escuro que cresce quando ele grita. O traco de boca do
  // catalogo some junto (senao ficam os dois desenhos no mesmo lugar).
  const matBoca = new THREE.MeshStandardMaterial({
    color: 0x180d0f, roughness: 1.0, transparent: true, opacity: 0,
  })
  const bocaY = -0.082 * HEAD_S
  const boca = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), matBoca)
  boca.position.set(0, bocaY, surfaceZ(0, bocaY, 0.001) - 0.038 * HEAD_S)
  boca.scale.set(0.050 * HEAD_S, 0.014 * HEAD_S, 0.036 * HEAD_S)
  boca.castShadow = false; boca.receiveShadow = false
  P.head.add(boca)

  // =========================================================================
  // 2. AVISOS EM 3D (balao, barra) — ficam na CENA, nao no grupo
  // =========================================================================
  // Presos ao grupo eles herdariam a curvada e a queda do corpo; soltos na cena
  // basta posiciona-los acima da cabeca e vira-los pro jogador.
  const aviso = new THREE.Group()
  aviso.name = 'zumbi-aviso'
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(aviso)
  scene.add(aviso)

  // Material PROPRIO do balao: o textPlaneMat e cacheado por texto e mexer no
  // depthTest dele valeria pra todo mundo que usasse a mesma frase. Daqui so
  // aproveitamos o `map` (a textura do texto, essa sim vale a pena cachear).
  // depthTest false + renderOrder alto: o balao nunca some dentro da fachada.
  const matBalao = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    fog: false, toneMapped: false,
  })
  const geoBalao = new THREE.PlaneGeometry(1.15, 0.29)
  const balao = new THREE.Mesh(geoBalao, matBalao)
  balao.position.y = 0.44
  balao.renderOrder = 20
  balao.frustumCulled = false
  balao.visible = false
  aviso.add(balao)

  // Barra do tempo de doenca: o preenchimento tem o pivo na PONTA ESQUERDA
  // (geometria transladada), entao scale.x = progresso enche da esquerda.
  const matBarraFundo = new THREE.MeshBasicMaterial({
    color: 0x10141a, transparent: true, opacity: 0, depthWrite: false,
    depthTest: false, fog: false, toneMapped: false,
  })
  const matBarra = new THREE.MeshBasicMaterial({
    color: COR_DOENCA, transparent: true, opacity: 0, depthWrite: false,
    depthTest: false, fog: false, toneMapped: false,
  })
  const geoBarraFundo = new THREE.PlaneGeometry(0.66, 0.085)
  const geoBarra = new THREE.PlaneGeometry(0.62, 0.055)
  geoBarra.translate(0.31, 0, 0)
  const barraFundo = new THREE.Mesh(geoBarraFundo, matBarraFundo)
  const barra = new THREE.Mesh(geoBarra, matBarra)
  barra.position.set(-0.31, 0, 0.004)
  barraFundo.add(barra)
  barraFundo.position.y = 0.04
  barraFundo.visible = false
  barraFundo.frustumCulled = false
  barraFundo.renderOrder = 21
  barra.renderOrder = 22
  aviso.add(barraFundo)

  // Pulso no chao: anel que abre e apaga, marcando o tempo junto com a barra.
  const matPulso = new THREE.MeshBasicMaterial({
    color: COR_DOENCA, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const geoPulso = new THREE.RingGeometry(0.5, 0.62, 40, 1)
  const pulso = new THREE.Mesh(geoPulso, matPulso)
  pulso.rotation.x = -Math.PI / 2
  pulso.visible = false
  pulso.renderOrder = 2
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(pulso)
  scene.add(pulso)

  // Onda de choque do grito e do tiro final: o mesmo anel, cor trocada.
  const matOnda = new THREE.MeshBasicMaterial({
    color: 0xd8ffd0, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const onda = new THREE.Mesh(geoPulso, matOnda)
  onda.rotation.x = -Math.PI / 2
  onda.visible = false
  onda.renderOrder = 2
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(onda)
  scene.add(onda)

  // Clarao: esfera aditiva. Sem `camera` na assinatura nao da pra fazer um
  // plano virado pra tela, e a esfera funciona de qualquer angulo (inclusive
  // nas fotos, que trocam a camera de lugar).
  const matClarao = new THREE.MeshBasicMaterial({
    color: 0xfff2e0, transparent: true, opacity: 0,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const geoClarao = new THREE.SphereGeometry(1, 14, 10)
  const clarao = new THREE.Mesh(geoClarao, matClarao)
  clarao.visible = false
  clarao.renderOrder = 5
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(clarao)
  scene.add(clarao)

  // Luz: UMA so, emprestada do pool (src/render/luzes-efeito.js). Nasce em 0 e
  // nunca e escondida — mudar a contagem de luzes da cena recompila todos os
  // materiais e trava a imagem por varios quadros; apagar e intensity = 0.
  // Prioridade BAIXA: e uma aura continua e o corpo ja tem o proprio emissivo,
  // entao ceder a luz real pro clarao de um tiro nao tira nada da cena.
  //
  // Sem pool (modulo solto, num teste) cai de volta pra PointLight de sempre.
  const luz = (poolLuz && typeof poolLuz.emprestar === 'function')
    ? poolLuz.emprestar({
      cor: COR_DOENCA, intensidade: 0, distancia: 7.5,
      prioridade: PRIORIDADE.BAIXA, nome: 'luz-zumbi',
    })
    : (() => {
      const l = new THREE.PointLight(COR_DOENCA, 0, 7.5, 2)
      l.castShadow = false
      l.name = 'luz-zumbi'
      return l
    })()
  luz.position.copy(grupo.position)
  luz.position.y += 1.4
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(luz)
  scene.add(luz)
  let luzPico = 0

  // =========================================================================
  // 3. SANGUE — pool fixo de cacos, reiniciado a cada tiro
  // =========================================================================
  const N_SANGUE = 16
  const geoGota = new THREE.BoxGeometry(1, 1, 1)
  const gotas = []
  const velGota = []
  // Um material para as 16 gotas: todas tem a mesma cor e a MESMA opacidade a
  // cada quadro (o laco de atualizacao escreve um valor so), entao 16
  // materiais separados custavam memoria e nao davam nada em troca.
  const matSangue = new THREE.MeshStandardMaterial({
    color: COR_SANGUE, roughness: 0.55, transparent: true, opacity: 0,
  })
  for (let i = 0; i < N_SANGUE; i++) {
    const m = new THREE.Mesh(geoGota, matSangue)
    m.castShadow = false; m.receiveShadow = false
    m.visible = false
    m.frustumCulled = false
    // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
    marcarSemTiro(m)
    scene.add(m)
    gotas.push(m)
    velGota.push(new THREE.Vector3())
    meusMats.push(m.material)
  }
  let sangueT = 0
  let sangueVivo = false

  function jorrar(pos, dirSaida, forca) {
    sangueT = 0
    sangueVivo = true
    for (let i = 0; i < N_SANGUE; i++) {
      const m = gotas[i]
      m.visible = true
      m.material.opacity = 1
      m.position.copy(pos)
      const e = 0.032 + Math.random() * 0.055
      m.scale.set(e, e * (0.6 + Math.random()), e * (0.7 + Math.random() * 0.6))
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      const a = Math.random() * TAU
      const esp = 0.9 + Math.random() * 1.9
      velGota[i].set(
        dirSaida.x * forca + Math.cos(a) * esp,
        1.1 + Math.random() * 2.4,
        dirSaida.z * forca + Math.sin(a) * esp,
      )
    }
  }

  function atualizarSangue(dt) {
    if (!sangueVivo) return
    sangueT += dt
    const k = sangueT / 1.25
    if (k >= 1) {
      sangueVivo = false
      for (const m of gotas) m.visible = false
      return
    }
    const some = Math.pow(1 - k, 1.5)
    for (let i = 0; i < N_SANGUE; i++) {
      const m = gotas[i]
      velGota[i].y -= 17 * dt
      m.position.addScaledVector(velGota[i], dt)
      const piso = chaoEm(m.position.x, m.position.z) + 0.01
      if (m.position.y < piso) {          // respinga e para
        m.position.y = piso
        velGota[i].set(0, 0, 0)
      }
      m.rotation.x += dt * 6
      m.material.opacity = some
    }
  }

  // =========================================================================
  // 4. MANCHA NO CHAO (o que fica depois que o corpo some)
  // =========================================================================
  // A marca que fica no chao. Disco chapado le como adesivo; entao a forma vem
  // de uma textura com alfa (borda macia + respingos), desenhada uma vez so.
  function texturaMancha() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 60)
    grd.addColorStop(0, 'rgba(70,10,14,0.95)')
    grd.addColorStop(0.55, 'rgba(58,10,16,0.72)')
    grd.addColorStop(1, 'rgba(45,8,14,0)')
    g.fillStyle = grd
    g.beginPath(); g.ellipse(64, 64, 58, 46, 0.3, 0, 7); g.fill()
    for (let i = 0; i < 16; i++) {       // respingos em volta
      const ang = Math.random() * 7, r = 30 + Math.random() * 32
      g.fillStyle = 'rgba(62,10,16,' + (0.25 + Math.random() * 0.45) + ')'
      g.beginPath()
      g.ellipse(64 + Math.cos(ang) * r, 64 + Math.sin(ang) * r * 0.8,
        2 + Math.random() * 6, 2 + Math.random() * 5, ang, 0, 7)
      g.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const texMancha = texturaMancha()
  const matMancha = new THREE.MeshBasicMaterial({
    map: texMancha, transparent: true, opacity: 0, depthWrite: false,
    toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const geoMancha = new THREE.PlaneGeometry(1.9, 1.9)
  const mancha = new THREE.Mesh(geoMancha, matMancha)
  mancha.rotation.x = -Math.PI / 2
  mancha.visible = false
  mancha.renderOrder = 1
  // efeito nao e alvo: sem isto o proximo tiro acerta a gota de sangue
  marcarSemTiro(mancha)
  scene.add(mancha)

  // =========================================================================
  // 5. VINHETA DE DANO (DOM, 100% local)
  // =========================================================================
  // z-index abaixo do HUD (20) pra nao cobrir prompt e toasts.
  let vinheta = null
  if (typeof document !== 'undefined') {
    vinheta = document.createElement('div')
    vinheta.className = 'mcrp-dano'
    vinheta.style.cssText = 'position:fixed;inset:0;z-index:15;pointer-events:none;opacity:0;'
      + 'transition:opacity .12s linear;'
      + 'background:radial-gradient(120% 90% at 50% 50%,rgba(120,0,0,0) 42%,rgba(150,8,8,0.75) 100%)'
    document.body.appendChild(vinheta)
  }
  let vinhetaV = 0        // vermelho do dano
  let flashV = 0          // branco do tiro final

  let telaAnterior = -1
  function pintarTela() {
    if (!vinheta) return
    const v = Math.max(vinhetaV, 0)
    const alvo = limitar(v + flashV * 0.4, 0, 1)
    // escrever no style todo quadro custa layout a toa: so mexe quando muda
    if (Math.abs(alvo - telaAnterior) < 0.004) return
    telaAnterior = alvo
    vinheta.style.opacity = String(alvo)
    // o flash do tiro final entra por cima da mesma camada, so que branco
    vinheta.style.background = flashV > 0.02
      ? 'radial-gradient(120% 90% at 50% 50%,rgba(255,255,255,' + (flashV * 0.5).toFixed(3)
        + ') 0%,rgba(255,190,190,' + (flashV * 0.8).toFixed(3) + ') 100%)'
      : 'radial-gradient(120% 90% at 50% 50%,rgba(120,0,0,0) 42%,rgba(150,8,8,0.75) 100%)'
  }

  // =========================================================================
  // 6. ALVOS DE TIRO
  // =========================================================================
  // A marca vai nos DOIS nos que o raycast pode devolver: qualquer mesh da
  // cabeca sobe ate P.head, qualquer outro sobe ate o grupo. Assim o main nao
  // precisa saber nada da anatomia do boneco.
  P.head.userData.zumbiParte = 'cabeca'
  grupo.userData.zumbiParte = 'corpo'

  /** 'cabeca' | 'corpo' | null — null pra tudo que nao for este NPC vivo. */
  function parteAtingida(obj) {
    if (estado === 'morto') return null
    let o = obj
    let dele = false
    while (o) {
      if (o === grupo) dele = true
      if (o.userData && o.userData.zumbiParte) {
        return o.userData.zumbiParte === 'cabeca' ? 'cabeca' : 'corpo'
      }
      o = o.parent
    }
    return dele ? 'corpo' : null
  }

  // =========================================================================
  // 7. ESTADO
  // =========================================================================
  let estado = 'sao'
  let tempo = 0             // relogio geral (animacoes)
  let tEstado = 0           // tempo dentro do estado atual
  let vida = VIDA_MAX       // SO do modo sozinho: online quem conta e o servidor
  let yaw = CASA.yaw

  /* ONDE O CORPO ESTA, antes de qualquer tremida de efeito.
     Online quem escreve isto e o snapshot; sozinho, a simulacao daqui. Ter as
     duas fontes caindo no MESMO par de numeros e o que deixa o resto do
     arquivo (tremor, cambaleio, jitter do grito) escrever
     `grupo.position.x = baseX + sacode` sem saber nem se ha servidor. */
  let baseX = CASA.x
  let baseZ = CASA.z
  /* Velocidade OBSERVADA, em m/s. Online ela sai da diferenca entre duas
     posicoes do snapshot: e assim que a passada anda no ritmo certo sem que
     ninguem mande "estou andando" pela rede. Sozinho, e a velocidade que a
     simulacao daqui acabou de usar. */
  let velVista = 0
  /* Ainda nao vi este NPC no snapshot nenhuma vez. Serve pra uma coisa so: a
     PRIMEIRA leitura nao e uma transicao, e uma descoberta. Quem entra na
     partida com o zumbi ja morto ha dez minutos nao pode levar o clarao do
     tiro na cara como se ele tivesse acabado de acontecer. */
  let primeiraLeitura = true
  /* "Eu mando no corpo dele neste quadro?" — sim so no modo sozinho. Vale por
     QUADRO, e nao por sessao, porque a conexao pode cair no meio da
     perseguicao: quando cai, a simulacao daqui assume de onde o servidor
     parou, sem nenhum caso especial. */
  let mandaNoCorpo = true
  let faseAndar = 0
  let tosseEm = 2.0         // quando vem a proxima tosse
  let tosseT = -1           // -1 = nao esta tossindo
  let recuo = 0             // cambaleio do tiro (segundos)
  const empurraoRecuo = new THREE.Vector3()
  let esperaAtaque = 0
  let lentoT = 0            // camera lenta do tiro final
  let balaoT = 0
  let pulsoT = 0
  let ondaT = -1
  let claraoT = -1
  let claraoTam = 1
  let sumindo = -1          // relogio do fade do corpo
  let doenca = 0            // 0..1 — o quanto ele ja esta zumbi (visual)
  const pontoDoTiroFinal = new THREE.Vector3()
  let temPontoFinal = false
  /* Segundos desde o meu ultimo tiro. Serve pra UMA coisa: saber se a morte
     que acabou de chegar foi minha ou do outro jogador, sem precisar que isso
     viaje pela rede. Anda com o tempo REAL, como a vinheta. */
  let euAtirei = 0

  const poseAtual = {}
  for (const n of JUNTAS) poseAtual[n] = [0, 0, 0]

  // =========================================================================
  // 8. FALA E INTERACAO
  // =========================================================================
  function falar(texto, segundos) {
    const m = textPlaneMat(texto, {
      w: 1024, h: 256, bg: 'rgba(12,14,20,0.88)', color: '#e9eef7',
      font: 'bold 82px "Trebuchet MS", sans-serif',
    })
    if (matBalao.map !== m.map) { matBalao.map = m.map; matBalao.needsUpdate = true }
    balao.visible = true
    balaoT = segundos || 3.4
  }

  function desligarInteracao() {
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('zumbi-npc', false)
    }
  }

  const interactable = {
    id: 'zumbi-npc',
    position: new THREE.Vector3(CASA.x, chaoEm(CASA.x, CASA.z) + 1.5, CASA.z),
    radius: 2.4,
    label: 'Falar com o rapaz',
    onInteract(game) {
      pedir('adoecendo')
      // o sistema de interacao COPIA os campos: desligar so vale por id
      const it = (game && game.interaction) || interaction
      if (it && typeof it.setEnabled === 'function') it.setEnabled('zumbi-npc', false)
    },
  }

  // =========================================================================
  // 9. PEDIDOS (quem manda, quando existe servidor, e ele)
  // =========================================================================
  /**
   * Pede uma acao. ONLINE ele so PEDE — quem troca o estado e o servidor, e a
   * resposta chega pelo snapshot, junto com a de todo mundo. SOZINHO respondo
   * a mim mesmo no proximo microtask, pelo MESMO caminho do evento de rede,
   * pra existir um caminho so.
   *
   * Repare que online SO 'adoecendo' vira pedido. 'zumbi' e 'morto' nao sao
   * pedidos de ninguem: sao CONSEQUENCIAS que o servidor calcula (o relogio da
   * doenca acabou; a vida chegou a zero). Se o cliente pudesse pedi-los, o
   * jogador com o console aberto mataria o zumbi na tela dos outros de graca.
   */
  function pedir(novo) {
    if (novo === estado) return
    if (ehLocal()) {
      Promise.resolve().then(() => aoEventoDeRede({ tipo: 'zumbi-estado', estado: novo }))
      return
    }
    if (novo === 'adoecendo') rede.zumbiPedir('adoecer')
  }

  /** Aplica um estado vindo do servidor (ou de mim mesmo, no modo local). */
  function aplicarEstado(novo, ev) {
    if (novo === estado) return
    if (estado === 'morto') return          // idempotente: morto nao volta
    estado = novo
    tEstado = 0
    if (novo === 'sao') comecarSao()
    else if (novo === 'adoecendo') comecarDoenca()
    else if (novo === 'zumbi') comecarZumbi()
    else if (novo === 'morto') comecarMorte(ev && ev.ponto)
  }

  function aoEventoDeRede(ev) {
    if (!ev) return
    const tipo = String(ev.tipo || ev.t || ev.nome || '').toLowerCase().replace(/[^a-z]/g, '')
    if (tipo !== 'zumbiestado') return
    const novo = String(ev.estado || '').toLowerCase()
    if (novo !== 'sao' && novo !== 'adoecendo' && novo !== 'zumbi' && novo !== 'morto') return
    // O servidor e dono da posicao: se ele mandou, e ela que vale.
    if (Number.isFinite(ev.x) && Number.isFinite(ev.z)) {
      baseX = ev.x; baseZ = ev.z
      grupo.position.set(baseX, chaoEm(baseX, baseZ), baseZ)
    }
    if (Number.isFinite(ev.yaw)) { yaw = ev.yaw; grupo.rotation.y = yaw }
    if (Number.isFinite(ev.vida)) vida = ev.vida | 0
    aplicarEstado(novo, ev)
  }

  /**
   * ONLINE: le o NPC 1004 do snapshot e obedece. Chamado uma vez por quadro,
   * antes de qualquer animacao.
   *
   * A posicao que chega aqui JA VEM interpolada 100 ms atras (cliente-rede.js
   * faz isso com todos os NPCs, pelo id, nunca por indice de array). Este
   * arquivo nao interpola de novo nem prediz nada: ele copia.
   *
   * Nao achar o id e caso NORMAL, nao erro: no primeiro quadro depois de
   * conectar o buffer de snapshots ainda esta vazio. Enquanto nao acho, o
   * corpo fica onde esta — e o proximo quadro resolve.
   */
  function lerDoServidor(dt) {
    const n = rede.npcs && rede.npcs.get(ZUMBI_ID)
    if (!n) return

    if (Number.isFinite(n.x) && Number.isFinite(n.z)) {
      const dx = n.x - baseX
      const dz = n.z - baseZ
      // velocidade OBSERVADA: e o que decide se a passada toca ou se ele fica
      // so gingando parado. Media exponencial pra um quadro perdido nao fazer
      // a perna travar no meio do passo.
      const v = dt > 1e-4 ? Math.hypot(dx, dz) / dt : 0
      velVista += (v - velVista) * Math.min(1, dt * 8)
      baseX = n.x
      baseZ = n.z
    }
    if (Number.isFinite(n.yaw)) yaw = n.yaw

    const novo = NOME_DO_ESTADO[n.estado | 0]
    if (novo === undefined) return          // estado de um servidor mais novo

    if (primeiraLeitura) {
      primeiraLeitura = false
      /* A PRIMEIRA leitura nao e transicao, e descoberta. Se eu entrei na
         partida com o rapaz ja no meio da doenca, entro no estado dele sem
         disparar o balao nem o aviso do inicio — isso ja aconteceu pra quem
         estava aqui. O caso que mais importa e o SUMIDO: sem ele, quem chega
         dez minutos depois veria o corpo cair e o clarao do tiro de novo. */
      if ((n.estado | 0) === EST_NPC.SUMIDO) { estado = 'morto'; pularParaOFim(); return }
      if (novo !== 'sao') { estado = novo; tEstado = 0; entrarSemJuice(novo) }
      return
    }

    aplicarEstado(novo)
    // MORTO -> SUMIDO nao e troca de estado (os dois viram 'morto' aqui), mas
    // e a hora em que o servidor diz "acabou": o corpo some de vez.
    if ((n.estado | 0) === EST_NPC.SUMIDO) pularParaOFim()
  }

  /**
   * Entrar num estado que ja estava rolando quando eu cheguei: monta o VISUAL
   * sem tocar o que e evento (balao, aviso no HUD, onda de choque, clarao).
   * Susto de quem chega atrasado nao e susto, e barulho.
   */
  function entrarSemJuice(novo) {
    desligarInteracao()
    if (novo === 'adoecendo') {
      barraFundo.visible = true
      pulso.visible = true
      return
    }
    // zumbi e morto compartilham o rosto: boca aberta no lugar do traco de
    // boca do catalogo, e a pele ja fechada no verde-acinzentado
    doenca = 1
    const slotBoca = corpo.slots.mouth || corpo.slots.boca
    if (slotBoca) slotBoca.visible = false
    if (novo === 'morto') {
      /* O corpo cai (quadroMorto cuida disso a partir do tEstado zerado), mas
         SEM clarao, sem camera lenta, sem sangue e sem onda de choque: o tiro
         nao foi na minha frente. Efeito de tiro e pra quem viu o tiro. */
      mancha.position.set(baseX, chaoEm(baseX, baseZ) + 0.015, baseZ)
      mancha.rotation.z = Math.random() * TAU
      mancha.visible = true
    }
  }

  /**
   * O corpo ja sumiu ha tempo (o servidor mandou SUMIDO). Pula a queda, a
   * espera e o fade de uma vez: fica so a mancha no chao, que e o que sobra do
   * bicho. IDEMPOTENTE — o SUMIDO chega 15 vezes por segundo enquanto eu
   * estiver online, e todas depois da primeira nao podem fazer nada.
   */
  function pularParaOFim() {
    if (!grupo.visible && matMancha.opacity >= 0.78) return
    estado = 'morto'
    tEstado = Math.max(tEstado, DUR_MORTE + ESPERA_SUMIR + DUR_SUMIR)
    sumindo = ESPERA_SUMIR + DUR_SUMIR
    desligarInteracao()
    barraFundo.visible = false
    pulso.visible = false
    grupo.visible = false
    mancha.position.set(baseX, chaoEm(baseX, baseZ) + 0.015, baseZ)
    mancha.visible = true
    matMancha.opacity = 0.78
  }

  /**
   * Voltou a ser o rapaz sadio. Na pratica so acontece numa situacao: eu abri
   * o jogo desconectado, comecei a doenca sozinho e a conexao entrou depois —
   * e o servidor, que nunca soube de nada, diz que ele esta SAO. Sem isto o
   * estado voltava e o visual ficava preso (barra na tela, pele verde).
   */
  function comecarSao() {
    barraFundo.visible = false
    pulso.visible = false
    matBarra.opacity = 0
    matBarraFundo.opacity = 0
    matPulso.opacity = 0
    doenca = 0
    vida = VIDA_MAX
    matBoca.opacity = 0
    const slotBoca = corpo.slots.mouth || corpo.slots.boca
    if (slotBoca) slotBoca.visible = true
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('zumbi-npc', true)
    }
  }

  // =========================================================================
  // 10. TRANSICOES
  // =========================================================================
  function comecarDoenca() {
    desligarInteracao()
    falar('Ei... acho que eu nao estou nada bem.', 4.2)
    avisar('O rapaz nao esta se sentindo bem...')
    tosseEm = 1.1
    barraFundo.visible = true
    pulso.visible = true
  }

  function comecarZumbi() {
    barraFundo.visible = false
    pulso.visible = false
    matBarra.opacity = 0
    matBarraFundo.opacity = 0
    matPulso.opacity = 0
    doenca = 1
    // a boca aberta toma o lugar do traco de boca do catalogo
    const slotBoca = corpo.slots.mouth || corpo.slots.boca
    if (slotBoca) slotBoca.visible = false
    falar('AAAARGHHH!', 1.8)
    avisar('Ele nao e mais ele. CORRE.')
    dispararOnda(1.0)
    luzPico = Math.max(luzPico, 7)
    claraoT = 0; claraoTam = 0.85
  }

  function comecarMorte(ponto) {
    desligarInteracao()
    barraFundo.visible = false
    pulso.visible = false
    sumindo = -1
    lentoT = DUR_LENTO
    flashV = 1
    claraoT = 0; claraoTam = 0.62
    dispararOnda(1.4)
    // luz quente no tiro final: o verde e a doenca, o clarao branco e a bala
    luz.color.setHex(0xffd2b4)
    luzPico = Math.max(luzPico, 9)
    if (ponto) {
      _w.copy(ponto)
    } else {
      P.chest.getWorldPosition(_w)
    }
    _dir.set(baseX - (player ? player.position.x : 0), 0,
      baseZ - (player ? player.position.z : 0))
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1)
    _dir.normalize()
    jorrar(_w, _dir, 3.4)
    /* O clarao nasce NO PEITO por padrao, e quem tem um ponto melhor (o
       atirador, que guardou onde o revolver acertou) escreve por cima no
       primeiro quadro de quadroMorto. Sem esta linha, a morte que chega pela
       REDE — na tela de quem NAO atirou — acenderia o clarao onde ele estava
       da ultima vez, que e o meio do mapa quando nunca houve tiro nenhum
       naquela maquina. */
    clarao.position.copy(_w)
    // a mancha nasce aqui e fica: e a "marca" que sobra do bicho
    mancha.position.set(baseX, chaoEm(baseX, baseZ) + 0.015, baseZ)
    mancha.rotation.z = Math.random() * TAU     // nao e sempre a mesma poca
    mancha.visible = true
    /* Online a morte chega pela rede pras DUAS telas, e so uma delas puxou o
       gatilho. Quem foi e coisa que nao precisa viajar: cada maquina sabe se
       ela mesma acabou de atirar. Sem isto, o amigo que so assistiu leria
       "voce derrubou" sem ter feito nada. */
    avisar(euAtirei > 0 ? 'Voce derrubou o zumbi.' : 'O zumbi caiu.')
  }

  function dispararOnda(tam) {
    ondaT = 0
    onda.visible = true
    onda.scale.setScalar(Math.max(0.2, tam * 0.35))
    onda.position.set(baseX, chaoEm(baseX, baseZ) + 0.03, baseZ)
  }

  // =========================================================================
  // 11. DANO
  // =========================================================================
  /**
   * A PORTA DE ENTRADA DO MAIN, e ela nao mudou: o revolver diz onde acertou,
   * o main pergunta `parteAtingida(objeto)` e chama isto.
   *   parte: 'cabeca' (mata na hora) ou 'corpo' (3 tiros).
   *   info : { ponto, normal, objeto, distancia } — tudo opcional.
   * Devolve true se o tiro contou.
   *
   * O QUE MUDOU E QUEM RESPONDE. Online isto vira um PEDIDO (ZUMBI_TIRO com o
   * id do NPC e um byte dizendo a parte) e a vida nao e mais minha: quem
   * subtrai e o servidor, e o "ele morreu" volta como estado MORTO no
   * snapshot, igual pros dois jogadores. Sozinho, a conta continua sendo feita
   * aqui, exatamente como sempre foi.
   *
   * O IMPACTO SAI NA HORA NOS DOIS MODOS: sangue, clarao e cambaleio nao
   * esperam resposta nenhuma. Eles sao o retorno do gatilho pra quem atirou —
   * segurar isso por 100 ms de ida e volta faria a arma parecer quebrada. E
   * eles nao mentem sobre nada: quem decide a morte continua sendo o servidor.
   */
  function levarTiro(parte, info) {
    if (estado === 'morto') return false
    const naCabeca = parte === 'cabeca'
    const sozinho = ehLocal()

    // ponto do impacto: o que o revolver mandou, senao o centro da parte
    if (info && info.ponto && Number.isFinite(info.ponto.x)) _w.copy(info.ponto)
    else if (naCabeca) P.head.getWorldPosition(_w)
    else P.chest.getWorldPosition(_w)

    // pra onde o sangue sai: ao contrario da normal do impacto (ou seja, pra
    // dentro dele) nao le como jorro; sai pelo lado OPOSTO ao atirador
    if (info && info.normal && Number.isFinite(info.normal.x)) {
      _dir.set(-info.normal.x, 0, -info.normal.z)
    } else if (player) {
      _dir.set(baseX - player.position.x, 0, baseZ - player.position.z)
    } else _dir.set(0, 0, 1)
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1)
    _dir.normalize()

    /* O ponto do impacto e guardado SEMPRE, e nao so no tiro que mata: online
       eu nao sei qual foi o ultimo — quem sabe e o servidor. Quem consome isto
       e o primeiro quadro de quadroMorto, entao o valor certo e o do ultimo
       tiro que houve, que e exatamente o que fica aqui. */
    pontoDoTiroFinal.copy(_w)
    temPontoFinal = true
    // 2 s de folga: e mais do que a ida e volta ate o servidor, e menos do que
    // qualquer intervalo em que "foi voce" deixaria de ser verdade
    euAtirei = 2.0

    if (!sozinho) {
      /* ONLINE: a vida nao e minha. Mando o pedido e desenho o impacto; o
         resto chega no snapshot. Nao mexo em `vida` nem chuto a morte: se eu
         chutasse, o zumbi morreria na minha tela e continuaria andando na do
         meu amigo — que e exatamente o bug que esta mudanca conserta. */
      rede.zumbiPedir('tiro', naCabeca ? 'cabeca' : 'corpo')
      jorrar(_w, _dir, naCabeca ? 4.2 : 2.2)
      // so a POSE do cambaleio: o empurrao de verdade moveria o corpo, e a
      // posicao dele e do servidor
      recuo = 0.34
      empurraoRecuo.set(0, 0, 0)
      luzPico = Math.max(luzPico, 2.5)
      claraoT = 0; claraoTam = 0.30
      clarao.position.copy(_w)
      falar(naCabeca ? 'GRRRAH!' : 'RRRGH!', 0.8)
      return true
    }

    vida -= naCabeca ? VIDA_MAX : 1

    if (vida <= 0) {
      jorrar(_w, _dir, naCabeca ? 4.2 : 3.0)
      pedir('morto')
      return true
    }

    // tiro que nao mata: recua, grunhe e sangra
    jorrar(_w, _dir, 2.2)
    recuo = 0.34
    empurraoRecuo.copy(_dir).multiplyScalar(2.6)
    luzPico = Math.max(luzPico, 2.5)
    claraoT = 0; claraoTam = 0.30
    clarao.position.copy(_w)
    falar(naCabeca ? 'GRRRAH!' : 'RRRGH!', 0.8)
    return true
  }

  // =========================================================================
  // 12. POSE E ANIMACAO
  // =========================================================================
  function misturarPose(a, b, k) {
    for (let i = 0; i < JUNTAS.length; i++) {
      const n = JUNTAS[i]
      const pa = a[n] || ZERO3
      const pb = b[n] || ZERO3
      const d = poseAtual[n]
      d[0] = pa[0] + (pb[0] - pa[0]) * k
      d[1] = pa[1] + (pb[1] - pa[1]) * k
      d[2] = pa[2] + (pb[2] - pa[2]) * k
    }
  }

  function aplicarPose() {
    for (let i = 0; i < JUNTAS.length; i++) {
      const n = JUNTAS[i]
      const j = P[n]
      if (!j) continue
      const d = poseAtual[n]
      j.rotation.set(d[0], d[1], d[2])
    }
    // O que NAO esta na pose tambem precisa voltar ao zero todo quadro: o
    // tremor escreve na cabeca e a passada escreve na altura do quadril, e sem
    // este reset o valor do ultimo quadro ficaria grudado pra sempre.
    P.head.rotation.z = 0
    P.hips.position.y = QUADRIL_Y
  }

  /** Respiracao + balanco: e o que separa "boneco" de "gente parada". */
  function vidaParado(dt, forca) {
    const br = Math.sin(tempo * (1.55 + doenca * 1.9))
    P.torso.position.y = br * 0.012 * (1 + doenca)
    P.chest.scale.set(1 - br * 0.008, 1 + br * 0.020 * (1 + doenca), 1 - br * 0.008)
    const sway = Math.sin(tempo * (0.52 + doenca * 1.6)) * forca
    const sway2 = Math.sin(tempo * 0.83 + 1.1) * forca
    P.hips.rotation.y += sway * 0.05
    P.hips.rotation.z += sway2 * 0.03
    P.chest.rotation.x += br * 0.014
    void dt
  }

  /** Passada. `arrasto` faz a perna esquerda ficar pra tras: e o andar do zumbi. */
  function andar(dt, vel, arrasto) {
    faseAndar += dt * (2.0 + vel * 0.9)
    if (faseAndar > TAU) faseAndar -= TAU
    const s = Math.sin(faseAndar)
    const c = Math.cos(faseAndar)
    const amp = 0.32 + vel * 0.05
    P.legRUpper.rotation.x += -s * amp
    P.legLUpper.rotation.x += s * amp * (1 - arrasto * 0.55)
    P.legRLower.rotation.x += Math.max(0, c) * 0.5
    P.legLLower.rotation.x += Math.max(0, -c) * 0.5 + arrasto * 0.35
    P.footR.rotation.x += s * 0.12
    P.footL.rotation.x += -s * 0.12 - arrasto * 0.25
    // o tronco balanca junto: sem isso o zumbi desliza como se estivesse em trilho
    P.hips.rotation.y += s * 0.10
    P.chest.rotation.z += c * 0.07 * (1 + arrasto)
    P.hips.position.y = QUADRIL_Y - Math.abs(s) * 0.022
  }

  /** Cabeca acompanhando o jogador (ou o alvo dado). */
  function olharJogador(dt, forca) {
    if (!player) { corpo.setHeadLook(0, 0); return }
    if (character && character.parts && character.parts.head) {
      character.parts.head.getWorldPosition(_v)
    } else {
      _v.copy(player.position); _v.y += 1.6
    }
    corpo.root.worldToLocal(_v)
    const dy = _v.y - corpo.headCenterY
    const plano = Math.hypot(_v.x, _v.z)
    let wy = Math.atan2(_v.x, _v.z)
    let wp = -Math.atan2(dy, Math.max(0.2, plano))
    if (Math.abs(wy) > 1.5) { wy = 0; wp = 0 }
    olhoYaw += (wy * forca - olhoYaw) * Math.min(1, dt * 6)
    olhoPitch += (wp * forca - olhoPitch) * Math.min(1, dt * 6)
    corpo.setHeadLook(olhoPitch, olhoYaw)
  }
  let olhoYaw = 0, olhoPitch = 0

  /** Pele/olhos/boca acompanhando o quanto ele ja apodreceu (0..1). */
  const _corAlvo = new THREE.Color()
  const _corDoente = new THREE.Color(PELE_DOENTE)
  const _corZumbi = new THREE.Color(PELE_ZUMBI)
  function pintarCorpo() {
    const k = limitar(doenca, 0, 1)
    // 0..0.7 vai pro tom doente; 0.7..1 fecha no verde-acinzentado do zumbi
    const k2 = k < 0.7 ? 0 : (k - 0.7) / 0.3
    for (let i = 0; i < matsPele.length; i++) {
      const r = matsPele[i]
      _corAlvo.copy(_corDoente).lerp(_corZumbi, k2)
      r.m.color.copy(r.base).lerp(_corAlvo, Math.min(1, k * 1.35))
    }
    matOlheira.opacity = k * 0.85
    // olho: escurece na doenca e depois acende palido (o "olho claro" do zumbi)
    for (let i = 0; i < matsOlho.length; i++) {
      const m = matsOlho[i]
      if (!m.emissive) continue
      m.emissive.setHex(0xdff0e2)
      m.emissiveIntensity = k2 * 0.9            // a cor base fica; so o brilho muda
    }
  }

  // =========================================================================
  // 13. QUADRO
  // =========================================================================
  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1

    /* A PERGUNTA DO QUADRO. Com servidor, o estado e a posicao chegam prontos
       e este arquivo so desenha; sem ele, a simulacao daqui assume tudo. */
    mandaNoCorpo = ehLocal()
    if (!mandaNoCorpo) lerDoServidor(dt)

    // camera lenta LOCAL do tiro final: as animacoes deste NPC (e so elas)
    // andam devagar. `tempoLento` sai no retorno pra quem quiser diminuir o dt
    // do jogo inteiro — a decisao e do main, nao deste arquivo.
    if (lentoT > 0) lentoT = Math.max(0, lentoT - dt)
    const escala = lentoT > 0 ? FATOR_LENTO : 1
    const d = dt * escala
    tempo += d
    tEstado += d

    /* O corpo mora em baseX/baseZ. Quem escreveu esses dois numeros foi o
       servidor (online) ou a simulacao daqui (sozinho); daqui pra frente as
       animacoes so somam tremida por cima. Plantar o corpo aqui, num lugar
       so, e o que deixa o resto do arquivo nao saber se ha servidor. */
    grupo.position.set(baseX, chaoEm(baseX, baseZ), baseZ)

    if (estado === 'sao') quadroSao(d)
    else if (estado === 'adoecendo') quadroDoente(d)
    else if (estado === 'zumbi') quadroZumbi(d)
    else quadroMorto(d)

    atualizarSangue(d)
    atualizarEfeitos(dt, d)
    pintarCorpo()
  }

  function quadroSao(dt) {
    misturarPose(POSE_SAO, POSE_SAO, 0)
    aplicarPose()
    vidaParado(dt, 1)
    olharJogador(dt, 1)
    grupo.rotation.y = yaw
    interactable.position.set(grupo.position.x, grupo.position.y + 1.5, grupo.position.z)
  }

  function quadroDoente(dt) {
    const p = limitar(tEstado / DUR_DOENCA, 0, 1)
    // Expoente < 1: a piora APARECE cedo (o pedido era "piorando na cara do
    // jogador"). Com smoothstep os tres primeiros segundos nao mudavam nada.
    doenca = Math.pow(p, 0.6) * 0.85      // o verde escuro so fecha na virada
    const curva = Math.pow(p, 0.75)
    misturarPose(POSE_SAO, POSE_DOENTE, curva)
    aplicarPose()
    vidaParado(dt, 1 + p * 2.2)

    // --- tosse: espasmo que dobra o corpo e joga a mao na boca ---------------
    tosseEm -= dt
    if (tosseT < 0 && tosseEm <= 0) {
      tosseT = 0
      tosseEm = 2.6 - p * 1.5
      falar(p > 0.65 ? '*cof cof* ...que frio...' : '*cof cof*', 1.1)
    }
    if (tosseT >= 0) {
      tosseT += dt
      const k = tosseT / 0.55
      if (k >= 1) tosseT = -1
      else {
        const f = Math.sin(k * Math.PI)
        P.chest.rotation.x += f * 0.38
        P.torso.rotation.x += f * 0.12
        P.armRUpper.rotation.x -= f * 0.75
        P.armRLower.rotation.x -= f * 0.55
        corpo.setHeadLook(0.5 * f, olhoYaw * (1 - f))
        // baforada de doenca saindo da boca
        if (k < 0.2) {
          P.head.getWorldPosition(_w)
          _w.z += 0.1
          luzPico = Math.max(luzPico, 0.8)
        }
      }
    }

    // --- cambaleio: os pes se arrastam no lugar -----------------------------
    const camb = Math.sin(tempo * (1.9 + p * 2.4)) * p
    P.hips.rotation.z += camb * 0.10
    P.legRUpper.rotation.x += Math.sin(tempo * 2.3) * 0.12 * p
    P.legLUpper.rotation.x -= Math.sin(tempo * 2.3) * 0.12 * p
    grupo.rotation.y = yaw + camb * 0.22

    // --- ultimos DUR_TREMOR segundos: treme forte ---------------------------
    const faltam = DUR_DOENCA - tEstado
    const tr = faltam < DUR_TREMOR ? 1 - faltam / DUR_TREMOR : 0
    if (tr > 0) {
      // tremida SOMADA por cima de onde o corpo esta (o servidor, ou eu
      // mesmo): escrever a posicao absoluta aqui apagaria a do servidor
      const a = tr * tr * 0.035
      grupo.position.x = baseX + Math.sin(tempo * 47) * a
      grupo.position.z = baseZ + Math.cos(tempo * 39) * a
      P.chest.rotation.z += Math.sin(tempo * 53) * tr * 0.09
      P.head.rotation.z = Math.sin(tempo * 61) * tr * 0.12
    }

    if (tosseT < 0) olharJogador(dt, 1 - p * 0.5)

    // --- barra e pulso: o relogio da coisa ----------------------------------
    matBarraFundo.opacity = 0.72
    matBarra.opacity = 0.95
    barra.scale.x = Math.max(0.001, p)
    // verde -> amarelo -> vermelho, e piscando no fim
    matBarra.color.setHSL(0.33 * (1 - p), 0.85, tr > 0
      ? 0.5 + Math.sin(tempo * 18) * 0.18 : 0.52)
    pulsoT += dt * (0.9 + p * 2.2)
    if (pulsoT > 1) pulsoT -= 1
    const s = 0.5 + pulsoT * 1.5
    pulso.scale.setScalar(s)
    pulso.position.set(grupo.position.x, chaoEm(grupo.position.x, grupo.position.z) + 0.02,
      grupo.position.z)
    matPulso.opacity = (1 - pulsoT) * (0.36 + p * 0.34)
    matPulso.color.setHSL(0.33 * (1 - p), 0.9, 0.55)
    luz.color.setHSL(0.33 * (1 - p), 0.9, 0.5)
    luzPico = Math.max(luzPico, (1 - pulsoT) * (0.4 + p * 1.6))

    /* SOZINHO o relogio da doenca e meu. Online quem conta os 10 s e o
       servidor, e a virada chega no snapshot — se eu virasse aqui tambem, ele
       viraria zumbi na minha tela um instante antes da do meu amigo, que e
       exatamente o tipo de desencontro que a mudanca inteira existe pra
       apagar. A barra continua andando pelo meu tEstado: ela e desenho, e
       comecou a contar quando eu VI a doenca comecar. */
    if (mandaNoCorpo && tEstado >= DUR_DOENCA) pedir('zumbi')
  }

  function quadroZumbi(dt) {
    doenca = 1
    const grito = tEstado < DUR_GRITO

    if (grito) {
      // --- a transformacao: ele se ergue, joga a cabeca pra tras e grita -----
      const k = tEstado / DUR_GRITO
      misturarPose(POSE_DOENTE, POSE_ZUMBI, k * k * (3 - 2 * k))
      aplicarPose()
      const f = Math.sin(Math.min(1, k * 1.6) * Math.PI)
      // peito estufado, cabeca pra tras e bracos abertos pra tras: a pose de
      // quem grita, e nao a de quem ja esta perseguindo
      P.chest.rotation.x -= f * 0.5
      P.armRUpper.rotation.z += f * 0.42
      P.armLUpper.rotation.z -= f * 0.42
      P.armRUpper.rotation.x += f * 0.85
      P.armLUpper.rotation.x += f * 0.85
      P.armRLower.rotation.x -= f * 0.5
      P.armLLower.rotation.x -= f * 0.5
      corpo.setHeadLook(-0.55 * f, 0)
      matBoca.opacity = 1
      const ab = 0.014 + f * 0.055
      boca.scale.set((0.050 + f * 0.022) * HEAD_S, ab * HEAD_S, 0.036 * HEAD_S)
      // sacode SOMADO por cima de onde o corpo esta, nunca absoluto: online
      // quem diz onde ele esta e o servidor (que tambem segura os
      // ZUMBI_GRITO segundos do grito antes de sair andando)
      grupo.position.x = baseX + Math.sin(tempo * 44) * f * 0.03
      grupo.position.z = baseZ + Math.cos(tempo * 51) * f * 0.03
      luz.color.setHex(0x9be08a)
      luzPico = Math.max(luzPico, f * 3.4)
      return
    }

    // --- perseguicao --------------------------------------------------------
    misturarPose(POSE_ZUMBI, POSE_ZUMBI, 0)
    aplicarPose()
    matBoca.opacity = 1
    boca.scale.set(0.056 * HEAD_S, (0.030 + Math.sin(tempo * 3.1) * 0.008) * HEAD_S, 0.036 * HEAD_S)

    let dist = 99
    if (player) {
      _dir.set(player.position.x - grupo.position.x, 0, player.position.z - grupo.position.z)
      dist = _dir.length()
      if (dist > 1e-4) _dir.multiplyScalar(1 / dist)
    } else {
      _dir.set(0, 0, 1)
    }

    // recuo do tiro: ele para de andar por um instante e volta cambaleando
    let vel = VEL_ZUMBI
    if (recuo > 0) {
      recuo = Math.max(0, recuo - dt)
      const f = recuo / 0.34
      grupo.position.x += empurraoRecuo.x * f * dt
      grupo.position.z += empurraoRecuo.z * f * dt
      vel = 0
      P.chest.rotation.x -= f * 0.35
      P.hips.rotation.y += Math.sin(tempo * 40) * f * 0.2
    }

    /* ANDAR. Sozinho eu ando; ONLINE quem andou foi o servidor e eu descubro
       o passo pela velocidade que observei entre dois snapshots. A passada, o
       arrasto da perna e o balanco do tronco sao os mesmos nos dois casos —
       eles sao desenho, e desenho e sempre daqui. */
    const andando = mandaNoCorpo ? (dist > DIST_ATAQUE && vel > 0) : (velVista > 0.15)
    if (mandaNoCorpo && andando) {
      // passo pequeno e desigual: a velocidade oscila um pouco (nao e um trem)
      const cadencia = 1 + Math.sin(faseAndar) * 0.18
      grupo.position.x += _dir.x * vel * cadencia * dt
      grupo.position.z += _dir.z * vel * cadencia * dt
      /* Desvia de parede: quem resolve isso e o mundo, nao ele. ISTO E SO DO
         MODO SOZINHO. O servidor nao tem colisao — ele so sabe a ALTURA do
         chao — entao online o zumbi anda em LINHA RETA ate o jogador mais
         proximo, atravessando parede se for o caso. Duplicar a geometria de
         colisao do cliente no servidor seria criar uma segunda verdade sobre a
         forma da cidade, que e a doenca que o protocolo unico existe pra
         evitar. Ver passoZumbi() em servidor/sala.js. */
      if (collision && typeof collision.resolve === 'function') {
        collision.resolve(grupo.position, RAIO_ZUMBI)
      }
    }
    if (andando) {
      andar(dt, mandaNoCorpo ? vel : velVista, 0.7)
    } else {
      // parado colado em voce: ainda balanca, ainda ameaca
      vidaParado(dt, 2.2)
      P.armRUpper.rotation.x -= 0.15 + Math.sin(tempo * 6) * 0.12
      P.armLUpper.rotation.x -= 0.15 + Math.cos(tempo * 6) * 0.12
    }
    grupo.position.y = chaoEm(grupo.position.x, grupo.position.z)
    // o que a simulacao daqui andou vira a posicao oficial do corpo
    if (mandaNoCorpo) { baseX = grupo.position.x; baseZ = grupo.position.z; velVista = vel }

    // vira pra voce, com giro suave. Online o yaw ja veio do servidor, com a
    // mesma interpolacao de angulo de todo NPC — girar de novo aqui brigaria
    // com ele.
    const alvoYaw = Math.atan2(_dir.x, _dir.z)
    if (mandaNoCorpo) yaw += deltaAngulo(yaw, alvoYaw) * Math.min(1, dt * 5.5)
    grupo.rotation.y = yaw
    olharJogador(dt, 1)

    /* --- encostou: vinheta vermelha e empurrao ------------------------------
       ISTO CONTINUA 100% LOCAL, e nos dois modos, de proposito. O contrato diz
       que "o cliente e dono so do proprio corpo": cada maquina decide quando o
       zumbi encostou NO SEU jogador e empurra o SEU jogador. Mandar o empurrao
       pelo servidor seria ele mexendo no corpo de alguem, que e a unica coisa
       que ele nao faz neste jogo. E como a posicao do zumbi ja e a mesma nas
       duas telas, os dois levam a paulada na mesma hora, cada um na sua vez. */
    esperaAtaque = Math.max(0, esperaAtaque - dt)
    if (player && dist <= DIST_ATAQUE && esperaAtaque <= 0) {
      esperaAtaque = ESPERA_ATAQUE
      vinhetaV = 0.95
      // empurra de verdade: mexer so na velocidade nao adianta, o controller
      // limita a velocidade horizontal ao maximo de andar/correr todo quadro
      player.position.x += _dir.x * 0.5
      player.position.z += _dir.z * 0.5
      if (player.velocity) {
        player.velocity.x += _dir.x * 3.2
        player.velocity.z += _dir.z * 3.2
      }
      if (collision && typeof collision.resolve === 'function') {
        collision.resolve(player.position, 0.38)
      }
      falar('GRAAAH!', 0.7)
      P.armRUpper.rotation.x -= 0.7
      P.armLUpper.rotation.x -= 0.7
      luz.color.setHex(0xff4030)
      luzPico = Math.max(luzPico, 3)
    }
  }

  function quadroMorto(dt) {
    // corpo ja sumiu: so a mancha fica. Nao ha pose pra calcular, e este NPC
    // passa o resto da partida aqui — entao ele sai do caminho de vez.
    if (!grupo.visible) return
    const k = limitar(tEstado / DUR_MORTE, 0, 1)
    // tomba pra frente (o +X do root inclina o topo pro +Z, que e a frente),
    // com um quique no fim pra nao parecer uma tabua caindo
    const tomba = 1 - Math.pow(1 - k, 2.4)
    grupo.rotation.x = tomba * 1.52 + Math.sin(k * Math.PI * 3) * (1 - k) * 0.12
    grupo.rotation.z = tomba * 0.16
    grupo.position.y = chaoEm(grupo.position.x, grupo.position.z) + 0.02
    // as pernas e os bracos amolecem
    misturarPose(POSE_ZUMBI, POSE_DOENTE, tomba)
    aplicarPose()
    P.legRUpper.rotation.x += tomba * 0.35
    P.legLUpper.rotation.x += tomba * 0.15
    P.legRLower.rotation.x += tomba * 0.5
    P.armRUpper.rotation.x += tomba * 0.9
    P.armLUpper.rotation.x += tomba * 0.7
    corpo.setHeadLook(limitar(0.5 * tomba, -0.6, 0.6), 0)
    matBoca.opacity = 1 - tomba * 0.3

    // clarao do tiro final no ponto do impacto (guardado antes da troca de estado)
    if (temPontoFinal) {
      clarao.position.copy(pontoDoTiroFinal)
      temPontoFinal = false
    }

    // some depois de um tempo deitado, deixando a mancha
    if (k >= 1) {
      if (sumindo < 0) sumindo = 0
      else sumindo += dt
      const f = limitar((sumindo - ESPERA_SUMIR) / DUR_SUMIR, 0, 1)
      if (f > 0) {
        for (let i = 0; i < meusMats.length; i++) {
          const m = meusMats[i]
          m.transparent = true
          m.opacity = 1 - f
          m.depthWrite = f < 0.5
        }
        matBoca.opacity = (1 - f) * 0.7
        matOlheira.opacity = (1 - f) * 0.85
      }
      if (f >= 1) grupo.visible = false
    }
    matMancha.opacity = Math.min(0.78, tEstado * 0.34)
    void dt
  }

  /** Efeitos que existem em qualquer estado (balao, onda, clarao, luz, tela). */
  function atualizarEfeitos(dtReal, dt) {
    // balao e barra: altura FIXA acima dos pes (a cabeca desce quando ele se
    // curva, e o aviso mergulhava no chao junto)
    aviso.position.set(grupo.position.x, grupo.position.y + 2.16, grupo.position.z)
    if (player) {
      // sem `camera` na assinatura, o balao encara o JOGADOR — que e onde a
      // camera esta, nas duas pessoas
      aviso.rotation.y = Math.atan2(
        player.position.x - grupo.position.x, player.position.z - grupo.position.z)
    }
    if (balaoT > 0) {
      balaoT -= dt
      // sobe um tico e apaga no fim
      const f = Math.min(1, balaoT * 3)
      matBalao.opacity = f
      balao.position.y = 0.44 + (1 - f) * 0.08
      if (balaoT <= 0) balao.visible = false
    }

    // onda de choque do grito / da morte
    if (ondaT >= 0) {
      ondaT += dt
      const k = ondaT / 0.7
      if (k >= 1) { ondaT = -1; onda.visible = false }
      else {
        const s = 0.4 + k * 5.5
        onda.scale.set(s, s, 1)
        matOnda.opacity = (1 - k) * (1 - k) * 0.85
      }
    }

    // clarao
    if (claraoT >= 0) {
      claraoT += dt
      const k = claraoT / 0.30
      if (k >= 1) { claraoT = -1; clarao.visible = false }
      else {
        clarao.visible = true
        const s = claraoTam * (0.25 + (1 - Math.pow(1 - k, 3)) * 0.9)
        clarao.scale.setScalar(s)
        // fraco de proposito: aditivo grande vira leite na tela inteira
        matClarao.opacity = Math.pow(1 - k, 2) * 0.85
      }
    }

    // luz: persegue o corpo e recebe os picos dos eventos
    luz.position.set(grupo.position.x, grupo.position.y + 1.3, grupo.position.z)
    luzPico = Math.max(0, luzPico - dtReal * 9)
    luz.intensity += (luzPico - luz.intensity) * Math.min(1, dtReal * 14)

    // vinheta e flash usam o tempo REAL: a camera lenta nao pode segurar o
    // vermelho na tela do jogador
    vinhetaV = Math.max(0, vinhetaV - dtReal * 1.6)
    flashV = Math.max(0, flashV - dtReal * 2.6)
    euAtirei = Math.max(0, euAtirei - dtReal)
    pintarTela()
  }

  // =========================================================================
  // 14. LIMPEZA
  // =========================================================================
  function dispose() {
    desligarInteracao()
    corpo.dispose()
    if (grupo.parent) grupo.parent.remove(grupo)
    scene.remove(aviso, pulso, onda, clarao, luz, mancha)
    if (poolLuz && typeof poolLuz.devolver === 'function') poolLuz.devolver(luz)
    for (const m of gotas) { scene.remove(m); m.material.dispose() }
    geoGota.dispose()
    geoBalao.dispose(); geoBarra.dispose(); geoBarraFundo.dispose()
    geoPulso.dispose(); geoClarao.dispose(); geoMancha.dispose()
    geoOlheira.dispose(); boca.geometry.dispose()
    matBarra.dispose(); matBarraFundo.dispose(); matPulso.dispose()
    matOnda.dispose(); matClarao.dispose(); matMancha.dispose(); texMancha.dispose()
    matOlheira.dispose(); matBoca.dispose()
    for (const m of meusMats) m.dispose()
    meusMats.length = 0
    matsPele.length = 0
    matsOlho.length = 0
    if (vinheta && vinheta.parentNode) vinheta.parentNode.removeChild(vinheta)
  }

  // marca de tiro pro main (as duas formas, ver o cabecalho do arquivo)
  grupo.userData.zumbi = {
    alvoCabeca: P.head,
    alvoCorpo: grupo,
    parteAtingida,
    levarTiro,
    get estado() { return estado },
  }
  grupo.userData.parteAtingida = parteAtingida

  // pose inicial coerente antes do primeiro quadro
  misturarPose(POSE_SAO, POSE_SAO, 0)
  aplicarPose()
  pintarCorpo()

  return {
    grupo,
    interactable,
    atualizar,
    levarTiro,
    parteAtingida,
    aoEventoDeRede,
    dispose,
    get estado() { return estado },
    get vida() { return vida },
    /** 0..1: 1 = tempo normal, FATOR_LENTO durante a camera lenta do tiro final. */
    get tempoLento() { return lentoT > 0 ? FATOR_LENTO : 1 },
    // atalhos de teste (o smoke e as fotos encenam sem precisar esperar 10 s)
    adoecer() { pedir('adoecendo') },
    virarZumbi() { pedir('zumbi') },
    get posicao() { return grupo.position },
    adiantar(s) { tEstado += (Number(s) || 0) },
  }
}

// ---------------------------------------------------------------------------
// SUPOSICOES sobre os outros modulos (o que este arquivo espera encontrar):
//
//   player.position      THREE.Vector3 nos pes (existe em controller.js)
//   player.velocity      THREE.Vector3 XZ (existe; o empurrao usa os dois)
//   character.parts.head Object3D do jogador, so pra ele olhar no seu rosto
//   collision.resolve(pos, raio)   empurra pra fora das paredes (contrato)
//   groundY(x, z)        altura do piso; sem ela o chao vira 0.16 (a calcada)
//   interaction.setEnabled(id, bool)  pra apagar o "Falar com o rapaz"
//   hud.toast(msg)       opcional
//   rede.zumbiPedir(acao, parte)  os dois pedidos ('adoecer' e 'tiro'); e a
//                        existencia DELE que decide se este arquivo simula ou
//                        so desenha
//   rede.conectado       false = modo sozinho, simulo tudo aqui
//   rede.npcs            Map id -> { x, z, yaw, estado } ja interpolado 100 ms
//                        atras por cliente-rede.js; leio o ZUMBI_ID e obedeco
//
// O main deve:
//   - chamar zumbi.atualizar(dt) todo quadro;
//   - registrar zumbi.interactable no sistema de interacao (o grupo ja se
//     adiciona a cena sozinho);
//   - no aoAcerto do revolver:
//       const parte = zumbi.grupo.userData.parteAtingida(objeto)
//       if (parte) zumbi.levarTiro(parte, { ponto, normal, objeto, distancia })
//   - se quiser a camera lenta no jogo inteiro, multiplicar o dt do laco por
//     zumbi.tempoLento (o modulo ja anda devagar sozinho de qualquer jeito).
// ---------------------------------------------------------------------------
