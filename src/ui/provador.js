import * as THREE from 'three'
import { createCharacter } from '../player/character.js'
import { createAnimator } from '../player/animation.js'
import { CABELOS } from '../player/appearance.js'
import * as mats from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/ui/provador.js — o PALCO da customizacao.
//
// POR QUE ESTE ARQUIVO EXISTE. Ate agora o painel de customizacao apontava a
// camera do JOGO pro boneco parado onde ele estivesse: na cadeira do barbeiro,
// na frente do espelho, ao lado da atendente de roupas. O resultado era o que o
// dono do jogo descreveu — cadeira, balcao, espelho e prateleira entrando entre
// a lente e o cliente, e o personagem nunca centralizado. Nao da pra consertar
// isso com raycast e correcao de camera: o problema e o CENARIO, nao a lente.
//
// Entao a camera para de brigar com a loja. Este modulo monta uma THREE.Scene
// SEPARADA — fundo liso, um pedestal e luz de estudio — com uma copia do
// personagem em cima. Nao existe movel nenhum pra entrar na frente porque nao
// existe movel nenhum na cena. Enquanto o painel esta aberto o jogo desenha
// ESTE palco no lugar da cidade; ao fechar, volta tudo como estava.
//
// O palco tambem e a fabrica das MINIATURAS dos cards do painel: um mini-palco
// proprio, um render target de 384px e um segundo boneco reaproveitado
// desenham a peca DE VERDADE, do jeito que ela vai ficar no corpo do jogador.
//
// Nao passa pelo pos-processamento do engine (bloom, grao, vinheta, aberracao)
// de proposito: aquilo e o "look" da rua, e num close de rosto o grao vira
// sujeira na pele e a aberracao pinta a borda do olho de vermelho.
//
// ORCAMENTO DE QUADRO: zero alocacao em atualizar()/render(). Todo Vector3,
// Box3 e Vector2 usado no laco nasce aqui em cima, uma vez.
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180

// lerp exponencial: mesma sensacao de "chegar em ~0.25 s" em qualquer framerate
function damp(cur, tgt, lambda, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt))
}

// Menor angulo equivalente, em [-PI, PI]. Serve pra "virar pra ali" nunca
// virar "dar tres voltas ate ali" — ver focar().
function curto(a) {
  const t = Math.PI * 2
  let r = a % t
  if (r > Math.PI) r -= t
  else if (r < -Math.PI) r += t
  return r
}

function dampV(v, tx, ty, tz, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt)
  v.x += (tx - v.x) * k
  v.y += (ty - v.y) * k
  v.z += (tz - v.z) * k
}

// ---------------------------------------------------------------------------
// ENQUADRAMENTOS
//
// Regra que resolve a queixa "a camera nao mostra 100% o player e nao fica
// centralizada": nada aqui e uma distancia chutada. Cada foco declara QUANTO
// MUNDO precisa caber no quadro (em metros) e a distancia sai disso com o fov,
// entao mudar de lente ou de janela nao corta o personagem. E o alvo sai da
// JUNTA de verdade (parts.head, .neck, .chest, .handL, .footL): quando o
// jogador troca a cabeca por uma mais alta, o close do rosto acompanha sozinho.
//
//   junta      nome em character.parts; null = usa a caixa do boneco inteiro
//   quadro     altura visivel em metros (null = altura do boneco * folga)
//   larguraMin largura visivel MINIMA em metros — e o que salva a janela
//              estreita/vertical, onde caber na altura ainda corta os ombros
//   fov        lente. Close usa lente longa: 30 graus nao deforma o nariz
//   orbY/orbP  angulo da camera em volta do alvo (0 = de frente, olhando o +Z
//              do personagem). Um pouco de tres-quartos da volume ao rosto
//   giro       para onde o PEDESTAL vira sozinho neste foco (radianos). E o
//              que poe a mao do anel virada pra camera sem o jogador arrastar
//   deriva     giro lento do pedestal, rad/s. Perto do rosto quase zero: um
//              rosto girando enquanto se escolhe o olho e nauseante
//   sobe       ajuste fino em metros sobre a altura da junta
// ---------------------------------------------------------------------------
const FOCOS = {
  corpo: {
    junta: null, quadro: null, folga: 1.12, larguraMin: 1.15, fov: 34,
    orbY: 0.24, orbP: 0.055, giro: 0.20, deriva: 0.085, sobe: 0,
  },
  rosto: {
    junta: 'head', quadro: 0.72, larguraMin: 0.58, fov: 30,
    orbY: 0.20, orbP: 0.030, giro: 0.10, deriva: 0.016, sobe: 0.005,
  },
  // Pescoco e tronco sobem o alvo pra CABECA INTEIRA entrar no quadro. Com o
  // enquadramento apertado na junta, a borda de cima cortava o boneco na altura
  // da boca — e um sorriso decapitado num painel de customizacao nao le como
  // "close no colar", le como camera quebrada, que e o que estamos consertando.
  pescoco: {
    junta: 'neck', quadro: 0.98, larguraMin: 0.66, fov: 32,
    orbY: 0.16, orbP: 0.060, giro: 0.06, deriva: 0.018, sobe: 0.13,
  },
  tronco: {
    junta: 'chest', quadro: 1.38, larguraMin: 1.00, fov: 34,
    orbY: 0.28, orbP: 0.040, giro: 0.22, deriva: 0.030, sobe: 0.10,
  },
  pernas: {
    junta: 'legLLower', quadro: 1.10, larguraMin: 0.72, fov: 34,
    orbY: 0.24, orbP: 0.050, giro: 0.18, deriva: 0.030, sobe: 0.02,
  },
  // PES: a camera olha DE CIMA, e nao de lado.
  //
  // Com orbP 0.36 (20 graus) ela nascia a 35 cm do chao e a 90 cm do eixo — ou
  // seja, DENTRO do disco do pedestal (raio 1.02) e quase na altura do aro
  // dourado. O que aparecia no quadro era o aro atravessado na tela e um
  // borrao escuro; o tenis ficava atras dele. Foi fotografado.
  // Com 0.85 rad (49 graus) ela sobe pra ~90 cm e passa por cima do aro, com o
  // par de pes inteiro no meio do quadro e a borda do pedestal servindo de
  // moldura embaixo. O quadro tambem abriu (0.62 x 0.70) porque calcado de cano
  // alto e bota nao cabiam nos 52 cm de antes.
  pes: {
    junta: 'footL', quadro: 0.62, larguraMin: 0.70, fov: 34,
    orbY: 0.30, orbP: 0.850, giro: 0.34, deriva: 0.024, sobe: 0.06,
  },
  // A mao esquerda (anel e relogio) fica no lado -X. Sem esse orbY negativo a
  // camera olhava a mao POR CIMA da perna e o anel sumia contra a calca.
  maos: {
    junta: 'handL', quadro: 0.46, larguraMin: 0.40, fov: 32,
    orbY: -0.78, orbP: 0.220, giro: 0.55, deriva: 0.014, sobe: 0.01,
  },
}

// Vocabulario de foco aceito de fora. O customizer antigo (e o main.js de hoje)
// falam 'mao', 'braco', 'body', 'head'; o palco fala 'maos', 'tronco', 'corpo'.
// Traduzir aqui e mais barato do que sincronizar dois arquivos que trocam de
// dono, e um nome desconhecido cai no corpo inteiro — que e o enquadramento
// que nunca esta errado, so generico.
const ALIAS = {
  corpo: 'corpo', body: 'corpo', all: 'corpo', geral: 'corpo',
  rosto: 'rosto', face: 'rosto', head: 'rosto', cabeca: 'rosto', cabelo: 'rosto',
  pescoco: 'pescoco', neck: 'pescoco', colar: 'pescoco',
  tronco: 'tronco', torso: 'tronco', peito: 'tronco', chest: 'tronco', braco: 'tronco',
  pernas: 'pernas', legs: 'pernas', perna: 'pernas',
  pes: 'pes', pe: 'pes', feet: 'pes', foot: 'pes',
  maos: 'maos', mao: 'maos', hand: 'maos', hands: 'maos',
}

function resolverFoco(nome) {
  return ALIAS[String(nome || 'corpo')] || 'corpo'
}

// ---------------------------------------------------------------------------
// MINIATURAS - enquadramento por CAMPO da aparencia.
//
// Duas geracoes de tabela convivem aqui, e a diferenca entre elas e o que
// consertou os cards vazios.
//
// A PRIMEIRA (quadro/sobe na mao) aponta a camera pra JUNTA e recorta um
// numero de metros escolhido a olho. Funciona pra peca grande e presa a junta
// - a camisa, a calca. Falha em tudo que e pequeno ou que anda de lugar: o
// card do olho mostrava meia cabeca, o da boca mostrava um cranio careca com
// um risco embaixo, o do cabelo cortava a franja no alto do quadro. Cada uma
// dessas fotos so ficava certa com um par de numeros diferente, e qualquer
// cabeca nova do catalogo desmanchava o ajuste.
//
// A SEGUNDA (alvo: 'peca') nao tem numero de posicao nenhum: ela MEDE a caixa
// da peca ja construida no boneco auxiliar e enquadra em volta dela. O card
// passa a estar certo por construcao, e continua certo quando o catalogo
// cresce - que e a diferenca entre consertar as dez fotos de hoje e consertar
// a regra que gera todas elas.
//
//   alvo:'peca'  liga a medicao. A tabela vira so a MOLDURA: quanta folga em
//                volta e de que angulo
//   medePor      de qual slot sai a caixa (padrao: o proprio campo). A pupila
//                mora dentro do slot dos olhos e nao tem slot proprio
//   folga        quadro = maior lado da caixa x folga. 1.0 corta a peca rente;
//                abaixo de 1 e close DENTRO dela
//   metade       -1/+1 centraliza numa das metades em X. E o que faz a pupila
//                virar UM olho grande em vez de dois olhos minusculos
//   soPeca       esconde o RESTO do boneco. O card do colar mostrava um busto
//                inteiro com um fio dourado de tres pixels; agora mostra o
//                colar, que era o pedido
//   fundo        'claro' troca o cartao escuro por um claro. So a tatuagem
//                usa: a tinta e quase preta e sumia no cartao escuro assim que
//                o corpo por tras dela saiu
//   quadro       altura visivel em metros - vira RESERVA quando a peca medida
//                da caixa vazia ('Nenhum' nao constroi nada pra medir)
//   giro         posicao do pedestal so pra esta foto
//   orbY/orbP    angulo da camera, quando o do foco nao serve
//   lado         desloca a peca no quadro, em fracao da largura (so a via
//                antiga usa; na via medida quem faz isso e 'metade')
//   esconde      campos zerados NA MINIATURA (nunca no boneco do jogador). Sem
//                isto a foto do corte de cabelo sai com o chapeu por cima e as
//                opcoes ficam identicas
// ---------------------------------------------------------------------------
const MINI = {
  cabeca: { foco: 'rosto', quadro: 0.60, giro: 0.34, esconde: ['chapeu', 'cabelo'] },

  // --- rosto: tudo aqui e medido -------------------------------------------
  // O cabelo entra no 'esconde' dos tracos do olho pra cima porque a franja do
  // corte padrao cobre a sobrancelha, e foto de sobrancelha sem sobrancelha a
  // vista e a definicao de card inutil.
  olhos: {
    alvo: 'peca', folga: 1.05, quadro: 0.34, foco: 'rosto', giro: 0.03,
    orbY: 0.10, esconde: ['chapeu', 'cabelo'],
  },
  pupila: {
    alvo: 'peca', medePor: 'olhos', metade: -1, folga: 1.30, quadro: 0.15,
    foco: 'rosto', giro: 0.02, orbY: 0.04, esconde: ['chapeu', 'cabelo'],
  },
  nariz: {
    alvo: 'peca', folga: 2.10, quadro: 0.30, foco: 'rosto', giro: 0.40,
    orbY: 0.52, esconde: ['chapeu'],
  },
  boca: {
    alvo: 'peca', folga: 1.45, quadro: 0.26, foco: 'rosto', giro: 0.20,
    orbY: 0.24, esconde: ['chapeu', 'barba'],
  },
  barba: {
    alvo: 'peca', folga: 1.22, quadro: 0.46, foco: 'rosto', giro: 0.30,
    orbY: 0.34, esconde: ['chapeu'],
  },
  cabelo: {
    alvo: 'peca', folga: 1.22, quadro: 0.60, foco: 'rosto', giro: 0.42,
    orbY: 0.40, esconde: ['chapeu'],
  },
  sobrancelha: {
    alvo: 'peca', folga: 1.12, quadro: 0.30, foco: 'rosto', giro: 0.03,
    orbY: 0.08, esconde: ['chapeu', 'cabelo'],
  },
  pele: { foco: 'rosto', quadro: 0.58, giro: 0.24, esconde: ['chapeu'] },
  corCabelo: { foco: 'rosto', quadro: 0.60, giro: 0.42, sobe: 0.045, esconde: ['chapeu'] },

  // --- roupa: peca grande e presa a junta, a via antiga serve ---------------
  chapeu: { foco: 'rosto', quadro: 0.66, giro: 0.36, sobe: 0.055 },
  // 'sobe' aqui SOMA ao do foco (que ja levanta o alvo pra cabeca caber);
  // por isso estes ficam em zero e so o tamanho do quadro muda.
  blusa: { foco: 'tronco', quadro: 1.32, giro: 0.30 },
  jaqueta: { foco: 'tronco', quadro: 1.34, giro: 0.30 },
  calca: { foco: 'pernas', quadro: 1.14, giro: 0.22 },
  calcado: { foco: 'pes', quadro: 0.44, giro: 0.36 },

  // --- acessorio: medido E sozinho no cartao --------------------------------
  // A tatuagem muda de LUGAR conforme a opcao (braco, antebraco, pescoco,
  // dorso da mao, peito). Nao existe numero fixo de enquadramento que sirva
  // pras cinco: com o quadro do peito, a do antebraco ficava fora da foto.
  tatuagem: {
    alvo: 'peca', soPeca: true, fundo: 'claro', folga: 1.30, quadro: 0.68,
    foco: 'tronco', giro: 0, orbY: 0.78, orbP: 0.06, esconde: ['blusa', 'jaqueta'],
  },
  colar: {
    alvo: 'peca', soPeca: true, folga: 1.45, quadro: 0.80,
    foco: 'pescoco', giro: 0.06, orbY: 0.10, orbP: 0.10,
  },
  // O anel fica ~9 cm ABAIXO da junta da mao (ele mora no dedo anelar, e o
  // dedo aponta pra baixo no boneco parado). Enquadrar pela junta punha a foto
  // no antebraco e o anel virava um ponto dourado no canto.
  anelAcess: { foco: 'maos', quadro: 0.13, giro: 0.62, sobe: -0.088, orbY: -0.55, orbP: 0.35 },
  relogio: { foco: 'maos', quadro: 0.34, giro: 0.70, sobe: 0.08 },
}

const MINI_PADRAO = { foco: 'corpo', quadro: null, giro: 0.24 }

// Indice que significa "nada" em cada catalogo, pro 'esconde' acima.
//
// Quase todo catalogo poe o Nenhum no ZERO — chapeu, blusa, barba, colar, anel,
// relogio, tatuagem e calcado, todos. CABELOS e a excecao e ela quebra a foto
// que mais precisa do esconde: o indice 0 la e o corte 'Curto', nao a careca.
// Zerar o cabelo pra fotografar o FORMATO DA CABECA punha a mesma franja
// cobrindo a moleira nos dez cards, e as dez cabecas saiam iguais — o defeito
// que a miniatura veio consertar, de volta pela porta dos fundos. Procurado
// pelo id e nao escrito na mao porque a careca ja andou de lugar uma vez,
// quando o catalogo de cabelo cresceu.
const VAZIO = {
  cabelo: Math.max(0, CABELOS.findIndex((o) => o && o.id === 'careca')),
}

// Lado do render target. Renderizamos em 2x e reduzimos pro card de 192: e
// supersampling na mao. Sem isso a borda do chapeu vira escada — e num render
// target multisample o readRenderTargetPixels nem sempre resolve o buffer, o
// que faria a serrilha voltar em algumas maquinas.
const MINI_RT = 384
const MINI_PX = 192

// --- fundos procedurais (zero asset externo) --------------------------------

/** Degrade vertical + halo: o fundo do palco grande. */
function fundoPalco() {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 256
  const g = c.getContext('2d')
  const lin = g.createLinearGradient(0, 0, 0, 256)
  lin.addColorStop(0.00, '#232838')
  lin.addColorStop(0.42, '#141824')
  lin.addColorStop(1.00, '#05070c')
  g.fillStyle = lin
  g.fillRect(0, 0, 16, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Halo radial atras do boneco, num plano — o degrade sozinho fica chapado. */
function haloTex() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  r.addColorStop(0.0, 'rgba(126,152,196,0.55)')
  r.addColorStop(0.45, 'rgba(74,92,128,0.22)')
  r.addColorStop(1.0, 'rgba(0,0,0,0)')
  g.fillStyle = r
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Cartao CLARO, pras pecas que sao quase pretas.
 *
 * A tatuagem e tinta rgba(26,24,38) - no cartao escuro, e com o corpo por tras
 * dela escondido, o desenho ficava preto sobre azul-escuro e o card saia
 * vazio. Num cartao claro a mesma tinta le como desenho em papel, que e o que
 * uma folha de tatuagem e de verdade.
 */
function fundoMiniClaro() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const r = g.createRadialGradient(32, 26, 2, 32, 32, 44)
  r.addColorStop(0.0, '#e9e3d5')
  r.addColorStop(0.60, '#cfc6b3')
  r.addColorStop(1.0, '#8e8575')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Fundo da miniatura: mais claro no centro pra peca escura nao sumir. */
function fundoMini() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const r = g.createRadialGradient(32, 26, 2, 32, 32, 40)
  r.addColorStop(0.0, '#3a4256')
  r.addColorStop(0.55, '#232936')
  r.addColorStop(1.0, '#0e1119')
  g.fillStyle = r
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------------------

export function criarProvador(opcoes = {}) {
  const renderer = opcoes.renderer
  if (!renderer) throw new Error('criarProvador precisa do renderer do jogo')

  const descartaveis = []   // geometrias/texturas nossas, liberadas no dispose
  const guarda = (x) => { descartaveis.push(x); return x }

  // --- cena ------------------------------------------------------------------
  const cena = new THREE.Scene()
  cena.background = guarda(fundoPalco())

  const camera = new THREE.PerspectiveCamera(34, 1.6, 0.05, 60)
  camera.rotation.order = 'YXZ'

  // Pivo do pedestal. O boneco e o pedestal moram DENTRO dele, entao girar e
  // uma linha so e nada no palco precisa saber que houve giro.
  const pivo = new THREE.Group()
  cena.add(pivo)

  // --- pedestal ---------------------------------------------------------------
  // Topo em y = 0 (os pes do boneco nascem em y = 0), corpo descendo. O aro
  // quente e os pinos existem por um motivo pratico: um cilindro liso girando
  // parece parado, e o jogador nao entende que arrastar o mouse esta girando.
  const pedestal = new THREE.Group()
  pivo.add(pedestal)

  const gBase = guarda(new THREE.CylinderGeometry(1.06, 1.20, 0.13, 48, 1))
  const base = new THREE.Mesh(gBase, mats.solid(0x1a1e28, 0.72, 0.06))
  base.position.y = -0.065
  base.receiveShadow = true
  pedestal.add(base)

  const gTampo = guarda(new THREE.CylinderGeometry(1.02, 1.02, 0.014, 48, 1))
  const tampo = new THREE.Mesh(gTampo, mats.solid(0x262b38, 0.55, 0.10))
  tampo.position.y = 0.001
  tampo.receiveShadow = true
  pedestal.add(tampo)

  const gAro = guarda(new THREE.TorusGeometry(1.015, 0.011, 8, 72))
  const aro = new THREE.Mesh(gAro, mats.solid(0x3a2a12, 0.42, 0.55, {
    emissive: 0xffb457, emissiveIntensity: 0.5,
  }))
  aro.rotation.x = -Math.PI / 2
  aro.position.y = 0.010
  pedestal.add(aro)

  const gPino = guarda(new THREE.CylinderGeometry(0.021, 0.021, 0.020, 10, 1))
  const matPino = mats.solid(0x4a3a18, 0.4, 0.6, { emissive: 0xffc879, emissiveIntensity: 0.45 })
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const p = new THREE.Mesh(gPino, matPino)
    p.position.set(Math.sin(a) * 0.84, 0.010, Math.cos(a) * 0.84)
    pedestal.add(p)
  }

  // halo atras do boneco: fica FORA do pivo pra nao girar junto (um halo
  // girando aparece como uma mancha varrendo o fundo)
  const gHalo = guarda(new THREE.PlaneGeometry(6.4, 6.4))
  const texHalo = guarda(haloTex())
  const halo = new THREE.Mesh(gHalo, new THREE.MeshBasicMaterial({
    map: texHalo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  halo.position.set(0, 1.15, -2.4)
  guarda(halo.material)
  cena.add(halo)

  // --- luz de tres pontos ------------------------------------------------------
  // Principal quente 45 graus a frente-esquerda (e a unica que faz sombra),
  // preenchimento frio a direita bem mais fraca so pra sombra nao virar buraco
  // preto, e contraluz atras desenhando a silhueta contra o fundo escuro.
  // Intensidades no mesmo patamar do sol da cidade (lighting.js usa 2.1): o
  // renderer tem tone mapping ACES, entao passar disso lava a pele clara.
  const principal = new THREE.DirectionalLight(0xffeacd, 2.55)
  principal.position.set(-2.3, 3.1, 3.0)
  principal.castShadow = true
  principal.shadow.mapSize.set(1024, 1024)
  principal.shadow.camera.left = -1.4
  principal.shadow.camera.right = 1.4
  principal.shadow.camera.top = 2.6
  principal.shadow.camera.bottom = -0.6
  principal.shadow.camera.near = 0.6
  principal.shadow.camera.far = 9
  principal.shadow.bias = -0.0007
  principal.shadow.normalBias = 0.018
  cena.add(principal)
  cena.add(principal.target)
  principal.target.position.set(0, 1.0, 0)

  const preenche = new THREE.DirectionalLight(0x9dbcf0, 0.62)
  preenche.position.set(3.0, 1.5, 2.2)
  cena.add(preenche)

  const contraluz = new THREE.DirectionalLight(0xffd9a8, 2.3)
  contraluz.position.set(0.9, 2.7, -3.4)
  cena.add(contraluz)

  const hemi = new THREE.HemisphereLight(0xa8bde4, 0x1b1810, 0.55)
  cena.add(hemi)

  // --- o boneco ----------------------------------------------------------------
  const aparencia = Object.assign({}, opcoes.aparencia || null)
  const boneco = createCharacter({ appearance: aparencia })
  boneco.root.position.set(0, 0, 0)
  pivo.add(boneco.root)

  // Respiracao, piscada e balanco de parado saem do MESMO animador do jogo.
  // Reescrever "so a respiracao" aqui daria um boneco que respira diferente do
  // que anda na rua — e o jogador ve os dois na mesma sessao.
  const animador = createAnimator(boneco)
  const parado = { speed: 0, moving: false, grounded: true, running: false, vy: 0, sitting: false }

  // Caixa do boneco: so a ALTURA e o CENTRO interessam, e os dois nao mudam com
  // o giro do pedestal. Recalculada quando a aparencia muda (chapeu alto,
  // cabeca comprida), nunca por quadro.
  const _caixa = new THREE.Box3()
  let alturaBoneco = boneco.height || 1.82
  let centroY = alturaBoneco * 0.5

  function medirBoneco() {
    boneco.root.updateWorldMatrix(true, true)
    _caixa.setFromObject(boneco.root)
    if (!isFinite(_caixa.min.y) || !isFinite(_caixa.max.y)) return
    const alt = _caixa.max.y - _caixa.min.y
    if (alt > 0.5) {
      alturaBoneco = alt
      centroY = (_caixa.min.y + _caixa.max.y) * 0.5
    }
  }
  medirBoneco()

  // --- estado do palco ---------------------------------------------------------
  let focoNome = 'corpo'
  let foco = FOCOS.corpo
  let desvio = 0          // quanto o boneco sai do centro do quadro (ver setDesvio)
  let aspecto = 1.6
  let fovAtual = foco.fov

  let giro = 0            // onde o pedestal esta
  let giroAlvo = 0        // pra onde ele vai
  let giroVel = 0         // resto de velocidade do arraste (inercia)
  let carencia = 0        // segundos ainda "na mao do jogador"

  const _alvo = new THREE.Vector3(0, 1, 0)      // alvo suavizado (a camera olha aqui)
  const _alvoDes = new THREE.Vector3(0, 1, 0)   // alvo desejado neste quadro
  const _posDes = new THREE.Vector3(0, 1, 3)    // posicao desejada da camera
  const _v = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _lado = new THREE.Vector3()
  const _tam = new THREE.Vector2()
  const _cima = new THREE.Vector3(0, 1, 0)

  /**
   * Distancia que faz `quadro` metros de altura E `larguraMin` metros de largura
   * caberem numa lente de `fov` graus. E o coracao do "cabe com margem": a
   * janela pode ser 21:9 ou um celular em pe que o personagem continua inteiro.
   */
  function distanciaDe(f, quadro, asp) {
    const meia = Math.tan(f.fov * 0.5 * DEG)
    const dv = (quadro * 0.5) / meia
    const dh = (f.larguraMin * 0.5) / (meia * Math.max(0.35, asp))
    return Math.max(dv, dh)
  }

  /** Altura de quadro do foco: fixa, ou o boneco inteiro com folga. */
  function quadroDe(f) {
    return f.quadro || (alturaBoneco * (f.folga || 1.12))
  }

  /**
   * Calcula alvo e posicao desejados de um foco. Escreve em _alvoDes/_posDes.
   * `personagem` e o character (o do palco ou o auxiliar das miniaturas) e
   * `baseY` a altura de recuo quando o foco nao tem junta (o corpo inteiro).
   *
   * A orbita e calculada em MUNDO, nao presa ao corpo: assim o pedestal pode
   * girar sozinho que o quadro nao sai junto com ele. O alvo, ao contrario,
   * segue a junta de verdade — inclusive quando ela roda com o pedestal, o que
   * mantem a mao do anel dentro do quadro em vez de sair pela borda.
   */
  function enquadrar(personagem, f, quadro, asp, sobeExtra, baseY) {
    // 1) alvo: a JUNTA de verdade quando existe
    let ax = 0, ay = baseY, az = 0
    const j = f.junta && personagem.parts && personagem.parts[f.junta]
    if (j) {
      j.getWorldPosition(_v)
      ax = _v.x
      ay = _v.y
      az = _v.z
    }
    ay += (f.sobe || 0) + (sobeExtra || 0)
    _alvoDes.set(ax, ay, az)

    // 2) orbita. yaw 0 = de frente pro personagem (ele olha pro +Z).
    const cp = Math.cos(f.orbP)
    _dir.set(Math.sin(f.orbY) * cp, Math.sin(f.orbP), Math.cos(f.orbY) * cp)
    const dist = distanciaDe(f, quadro, asp)
    _posDes.copy(_alvoDes).addScaledVector(_dir, dist)

    // 3) desvio lateral. O painel de customizacao ocupa um lado da tela; em vez
    // de deixar o boneco atras dele, a camera anda de lado JUNTO com o alvo —
    // um travelling, nao um giro. Girar aqui deixaria o personagem de perfil.
    if (desvio !== 0) {
      _lado.copy(_dir).cross(_cima).normalize()
      const largura = 2 * dist * Math.tan(f.fov * 0.5 * DEG) * Math.max(0.35, asp)
      const d = desvio * largura
      _posDes.addScaledVector(_lado, -d)
      _alvoDes.addScaledVector(_lado, -d)
    }
  }

  function ajustarAspecto() {
    renderer.getSize(_tam)
    const a = _tam.x / Math.max(1, _tam.y)
    if (Math.abs(a - aspecto) > 0.002) {
      aspecto = a
      camera.aspect = a
      camera.updateProjectionMatrix()
    }
  }

  // --- API do palco -------------------------------------------------------------

  /**
   * Aponta o palco pra parte que esta sendo mexida. `imediato` corta a
   * transicao (usar so na abertura: no meio da sessao o corte confunde).
   */
  function focar(nome, imediato) {
    const novo = resolverFoco(nome)
    const trocou = novo !== focoNome
    focoNome = novo
    foco = FOCOS[focoNome] || FOCOS.corpo
    // Duas coisas que 'giroAlvo = foco.giro' fazia errado.
    //
    // 1) As DEZ abas do rosto compartilham o foco 'rosto'. Reancorar a cada
    //    clique jogava fora o angulo que o jogador acabou de escolher com o
    //    mouse — e o proprio jogo ja tinha decidido o contrario ("trocar de aba
    //    NAO reseta o angulo", em main.js). So foco NOVO reposiciona.
    // 2) giroAlvo ACUMULA: o arraste soma e a deriva soma 0.085 rad/s. Depois
    //    de dois minutos parado no corpo ele passa de 10 rad, e voltar pro
    //    valor absoluto da tabela desenrolava uma volta e meia em meio segundo.
    //    Pelo caminho curto o pedestal vira no maximo meia volta, sempre.
    if (trocou || imediato) giroAlvo = giro + curto(foco.giro - giro)
    if (imediato) {
      ajustarAspecto()
      fovAtual = foco.fov
      camera.fov = fovAtual
      camera.updateProjectionMatrix()
      giro = giroAlvo
      pivo.rotation.y = giro
      giroVel = 0
      boneco.root.updateWorldMatrix(true, true)
      enquadrar(boneco, foco, quadroDe(foco), aspecto, 0, centroY)
      _alvo.copy(_alvoDes)
      camera.position.copy(_posDes)
      camera.lookAt(_alvo)
    }
    return focoNome
  }

  /** Arrastar com o mouse. dxRad ja vem em radianos (delta de pixel * fator). */
  function girar(dxRad) {
    if (!dxRad) return
    giroAlvo += dxRad
    // impulso guardado pra soltar como inercia; o 9 e so a escala que faz um
    // arraste rapido "jogar" o pedestal por meia volta e parar sozinho
    giroVel = dxRad * 9
    carencia = 0.12
  }

  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1

    // 1) giro: enquanto a mao esta no mouse o alvo e do jogador; solto, a
    // velocidade que sobrou morre em ~0.6 s e a deriva lenta assume.
    if (carencia > 0) {
      carencia -= dt
    } else {
      giroAlvo += giroVel * dt
      giroVel *= Math.exp(-5 * dt)
      giroAlvo += (foco.deriva || 0) * dt
    }
    giro = damp(giro, giroAlvo, 10, dt)
    pivo.rotation.y = giro

    // 2) respiro/piscada
    animador.update(dt, parado)

    // 3) camera. O alvo e recalculado TODO quadro porque a junta se mexe com a
    // respiracao; a suavizacao e que impede isso de virar tremor.
    ajustarAspecto()
    enquadrar(boneco, foco, quadroDe(foco), aspecto, 0, centroY)
    dampV(_alvo, _alvoDes.x, _alvoDes.y, _alvoDes.z, 14, dt)
    dampV(camera.position, _posDes.x, _posDes.y, _posDes.z, 14, dt)

    const fovNovo = damp(fovAtual, foco.fov, 14, dt)
    if (Math.abs(fovNovo - fovAtual) > 0.01) {
      fovAtual = fovNovo
      camera.fov = fovAtual
      camera.updateProjectionMatrix()
    }
    camera.lookAt(_alvo)

    // a sombra segue o alvo: com o shadow camera apertado (1.4 m de raio) um
    // close nos pes ficaria fora do mapa e a sombra sumiria
    principal.target.position.set(0, Math.min(1.4, _alvo.y), 0)
    principal.target.updateMatrixWorld()
  }

  function render() {
    const rtAntes = renderer.getRenderTarget()
    if (rtAntes) renderer.setRenderTarget(null)
    const limpavaAntes = renderer.autoClear
    renderer.autoClear = true
    ajustarAspecto()
    renderer.render(cena, camera)
    renderer.autoClear = limpavaAntes
  }

  /**
   * Troca a aparencia do boneco do palco.
   * Tambem e o gatilho de invalidacao do cache de miniaturas — ver invalidar().
   */
  function setAparencia(ap) {
    if (!ap) return aparencia
    const mudados = []
    for (const k in ap) {
      const v = ap[k]
      if (v === undefined) continue
      if (aparencia[k] !== v) mudados.push(k)
      aparencia[k] = v
    }
    boneco.setAppearance(ap)
    // 'pele' e indice e 'skin' e cor crua; character.js resolve um pelo outro.
    // Copiar de volta impede que um 'skin' velho no nosso objeto repinte o
    // boneco auxiliar com a cor de pele de tres cliques atras.
    if (boneco.appearance && boneco.appearance.skin !== undefined) {
      aparencia.skin = boneco.appearance.skin
    }
    medirBoneco()
    if (mudados.length > 0) invalidar(mudados)
    return aparencia
  }

  /**
   * Desloca o personagem no quadro pra ele nao ficar atras do painel.
   * frac 0 = centralizado; 0.15 = 15% da largura do quadro pra ESQUERDA (que e
   * o que se quer com o painel encostado na direita). Aceita negativo.
   */
  function setDesvio(frac) {
    desvio = Math.max(-0.4, Math.min(0.4, Number(frac) || 0))
  }

  // ===========================================================================
  // MINI-PALCO — as fotos dos cards
  //
  // SINCRONO DE PROPOSITO. Render target no WebGL e sincrono: renderiza, le os
  // pixels e devolve a string, tudo na mesma chamada. Uma Promise aqui so
  // adiaria o mesmo custo pro quadro seguinte e obrigaria cada chamador a ter
  // dois caminhos (com e sem cache) pro mesmo card. Quem chama e que decide o
  // ritmo: o customizer pede UMA miniatura por quadro durante o stagger da
  // grade, entao o custo se dilui no proprio efeito de entrada.
  // ===========================================================================

  const cache = new Map()   // 'campo:indice' -> dataURL
  // foco temporario da miniatura: e uma copia do foco com o piso de largura
  // trocado. Reusado pra nao alocar um objeto por foto.
  const _fMini = { junta: null, fov: 34, orbY: 0, orbP: 0, sobe: 0, larguraMin: 1 }
  let miniPronto = false
  let cenaMini = null
  let camMini = null
  let fundoEscuro = null
  let fundoClaro = null
  // Medida da peca fotografada. De modulo, e nao locais: miniatura() e chamada
  // em rajada (a grade inteira de uma aba) e alocar tres objetos por card
  // pagaria coletor de lixo no meio da animacao de entrada dos cards.
  const _cxPeca = new THREE.Box3()
  const _centroPeca = new THREE.Vector3()
  const _tamPeca = new THREE.Vector3()
  const _ocultos = []
  let aux = null
  let auxCampo = null       // campo que esta sobrescrito no boneco auxiliar
  let rt = null
  let pixels = null
  let cvGrande = null
  let ctxGrande = null
  let imgData = null
  let cvPequeno = null
  let ctxPequeno = null

  /** Monta o mini-palco na PRIMEIRA miniatura pedida: quem nunca abre o painel nao paga. */
  function montarMini() {
    if (miniPronto) return
    miniPronto = true

    cenaMini = new THREE.Scene()
    fundoEscuro = guarda(fundoMini())
    fundoClaro = guarda(fundoMiniClaro())
    cenaMini.background = fundoEscuro

    camMini = new THREE.PerspectiveCamera(34, 1, 0.02, 30)

    // mesma receita de tres pontos, um tico mais suave: o render target NAO
    // passa pelo tone mapping do renderer (o three so aplica ACES quando
    // desenha na tela), entao o que ali seria "bem exposto" aqui estoura
    const l1 = new THREE.DirectionalLight(0xffeacd, 1.85)
    l1.position.set(-2.2, 3.0, 3.2)
    cenaMini.add(l1)
    const l2 = new THREE.DirectionalLight(0x9dbcf0, 0.5)
    l2.position.set(3.0, 1.4, 2.2)
    cenaMini.add(l2)
    const l3 = new THREE.DirectionalLight(0xffd9a8, 1.5)
    l3.position.set(0.8, 2.6, -3.2)
    cenaMini.add(l3)
    cenaMini.add(new THREE.HemisphereLight(0xa8bde4, 0x1b1810, 0.5))

    // UM boneco auxiliar pra vida toda da pagina. Um character por miniatura
    // seriam dezenas de geometrias e materiais por card — o custo de abrir a
    // aba BLUSA passaria de milissegundos pra segundos.
    aux = createCharacter({ appearance: Object.assign({}, aparencia) })
    aux.root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })
    cenaMini.add(aux.root)

    rt = new THREE.WebGLRenderTarget(MINI_RT, MINI_RT, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    })
    // sem isto a foto sai lavada: render target nasce em espaco linear
    rt.texture.colorSpace = THREE.SRGBColorSpace

    pixels = new Uint8Array(MINI_RT * MINI_RT * 4)
    cvGrande = document.createElement('canvas')
    cvGrande.width = cvGrande.height = MINI_RT
    ctxGrande = cvGrande.getContext('2d')
    imgData = ctxGrande.createImageData(MINI_RT, MINI_RT)
    cvPequeno = document.createElement('canvas')
    cvPequeno.width = cvPequeno.height = MINI_PX
    ctxPequeno = cvPequeno.getContext('2d')
    ctxPequeno.imageSmoothingEnabled = true
    ctxPequeno.imageSmoothingQuality = 'high'
    // O WebGL entrega as linhas de baixo pra cima. Virar no proprio drawImage
    // (que ja reduz de 384 pra 192) e de graca; a versao anterior copiava as
    // 384 linhas invertidas na mao e sozinha custava 23 ms por foto — mais que
    // o render, a leitura e o PNG somados.
    ctxPequeno.translate(0, MINI_PX)
    ctxPequeno.scale(1, -1)
  }

  /**
   * Poe o boneco auxiliar na aparencia do jogador com UM campo trocado.
   * Guarda qual campo estava sobrescrito pra devolver o valor do jogador antes
   * de sobrescrever outro — sem isso a foto da calca sairia com a barba errada
   * escolhida tres cliques atras.
   */
  function prepararAux(campo, indice, mini) {
    // A base vem do boneco do PALCO (boneco.appearance), nao da nossa copia: e
    // o objeto que o character ja resolveu (apelidos EN/PT, pele -> skin), e
    // portanto o unico que nunca esta meio caminho.
    const base = boneco.appearance || aparencia
    const patch = {}
    for (const k in base) patch[k] = base[k]
    if (auxCampo && auxCampo !== campo) patch[auxCampo] = base[auxCampo]
    patch[campo] = indice
    // sobrando 'skin' (cor crua) no patch, ele ganha do 'pele' novo quando o
    // indice por acaso ja e o do auxiliar — e a foto sai com a pele do jogador
    // em vez da do tom que se esta escolhendo
    if (campo === 'pele') delete patch.skin
    const esconde = mini.esconde
    if (esconde) for (let i = 0; i < esconde.length; i++) {
      const oculto = esconde[i]
      if (oculto !== campo) patch[oculto] = VAZIO[oculto] || 0
    }
    auxCampo = campo
    aux.setAppearance(patch)
    aux.root.updateWorldMatrix(true, true)
  }

  /**
   * Mede a caixa da peca `kind` no boneco auxiliar. Devolve false quando o
   * slot esta vazio - que e o caso normal do 'Nenhum' de cada catalogo, e
   * tambem o de peca que desenha em cima da pele sem geometria propria.
   */
  function medirPeca(kind) {
    const alvos = aux.pecasDe ? aux.pecasDe(kind) : null
    if (!alvos || !alvos.length) return false
    _cxPeca.makeEmpty()
    for (let i = 0; i < alvos.length; i++) {
      if (alvos[i].children.length || alvos[i].isMesh) _cxPeca.expandByObject(alvos[i])
    }
    if (_cxPeca.isEmpty()) return false
    _cxPeca.getCenter(_centroPeca)
    _cxPeca.getSize(_tamPeca)
    // caixa degenerada (peca de espessura zero em todos os eixos) nao serve
    return (_tamPeca.x + _tamPeca.y + _tamPeca.z) > 1e-4
  }

  /**
   * Esconde todo mesh do auxiliar que NAO pertence a peca fotografada.
   *
   * Mexe so em `visible`, e guarda quem foi apagado pra devolver depois: o
   * auxiliar e um so pra pagina inteira e a proxima foto pode ser de um campo
   * que precisa do corpo. Grupo fica visivel de proposito - em three.js pai
   * invisivel apaga o filho, e o caminho da ancora ate a peca passa por varios
   * grupos que nao sao dela.
   */
  function isolarPeca(kind) {
    const alvos = aux.pecasDe ? aux.pecasDe(kind) : null
    if (!alvos || !alvos.length) return
    for (let i = 0; i < alvos.length; i++) alvos[i].userData.miniAlvo = true
    aux.root.traverse((o) => {
      if (!o.isMesh || !o.visible) return
      let n = o
      while (n) {
        if (n.userData.miniAlvo) return
        n = n.parent
      }
      o.visible = false
      _ocultos.push(o)
    })
    for (let i = 0; i < alvos.length; i++) alvos[i].userData.miniAlvo = false
  }

  /** Devolve o corpo que isolarPeca escondeu. */
  function devolverCorpo() {
    for (let i = 0; i < _ocultos.length; i++) _ocultos[i].visible = true
    _ocultos.length = 0
  }

  /** Le o render target e devolve o PNG ja reduzido pro tamanho do card. */
  function lerPNG() {
    renderer.readRenderTargetPixels(rt, 0, 0, MINI_RT, MINI_RT, pixels)
    imgData.data.set(pixels)          // uma copia nativa, sem laco em JS
    ctxGrande.putImageData(imgData, 0, 0)
    // o ctxPequeno esta com a vertical invertida (ver montarMini): este
    // drawImage reduz de 384 pra 192 E desvira a imagem de uma vez so
    ctxPequeno.clearRect(0, 0, MINI_PX, MINI_PX)
    ctxPequeno.drawImage(cvGrande, 0, 0, MINI_PX, MINI_PX)
    return cvPequeno.toDataURL('image/png')
  }

  /**
   * Foto da peca `indice` do catalogo `campo`, como dataURL PNG 192x192.
   * Sincrona. Cada peca e renderizada UMA vez na vida da pagina.
   */
  function miniatura(campo, indice) {
    const chave = campo + ':' + indice
    const pronta = cache.get(chave)
    if (pronta !== undefined) return pronta

    montarMini()
    const mini = MINI[campo] || MINI_PADRAO
    const f = FOCOS[mini.foco] || FOCOS.corpo

    prepararAux(campo, indice, mini)

    // caixa do auxiliar: o quadro do corpo inteiro depende dela (chapeu alto)
    _caixa.setFromObject(aux.root)
    const altAux = (_caixa.max.y - _caixa.min.y) || alturaBoneco
    const centroAux = (_caixa.max.y + _caixa.min.y) * 0.5

    aux.root.rotation.y = mini.giro || 0
    aux.root.updateWorldMatrix(true, true)

    // --- via MEDIDA -----------------------------------------------------------
    // Tudo que e pequeno ou que anda de lugar passa por aqui. Ela nao usa
    // enquadrar(): enquadrar mira na JUNTA, e o ponto desta via e justamente
    // mirar na PECA. O resto (orbita, distancia pelo fov) e a mesma conta.
    const orbY = mini.orbY !== undefined ? mini.orbY : f.orbY
    const orbP = mini.orbP !== undefined ? mini.orbP : f.orbP
    let medida = false
    if (mini.alvo === 'peca') medida = medirPeca(mini.medePor || campo)
    // 'Nenhum' num campo que fotografa a peca sozinha: cartao VAZIO. Cair na
    // via antiga aqui traria o boneco inteiro de volta so nesse card, e a
    // primeira foto da grade do colar seria a unica com um corpo dentro.
    const vazio = !medida && mini.soPeca
    if (vazio) aux.root.visible = false
    if (medida) {
      let lx = _tamPeca.x
      let cx = _centroPeca.x
      // 'metade' e a pupila: a caixa dos DOIS olhos vira a caixa de UM. Sai da
      // propria medida (e nao de um deslocamento em metros escrito na tabela)
      // pra continuar certa quando o catalogo mudar o afastamento dos olhos.
      if (mini.metade) {
        lx *= 0.5
        cx += mini.metade * lx * 0.5
      }
      // O maior lado manda: o card e quadrado, entao caber na altura nao basta
      // (o par de olhos e tres vezes mais largo que alto).
      const maior = Math.max(lx, _tamPeca.y, _tamPeca.z * 0.7)
      const quadroM = Math.max(0.02, maior * (mini.folga || 1.30))
      _alvoDes.set(cx, _centroPeca.y, _centroPeca.z)
      const cpM = Math.cos(orbP)
      _dir.set(Math.sin(orbY) * cpM, Math.sin(orbP), Math.cos(orbY) * cpM)
      _posDes.copy(_alvoDes).addScaledVector(_dir, (quadroM * 0.5) / Math.tan(f.fov * 0.5 * DEG))
      if (mini.soPeca) isolarPeca(mini.medePor || campo)
      const claro = mini.fundo === 'claro'
      cenaMini.background = claro && fundoClaro ? fundoClaro : fundoEscuro
      const png = renderMini(f.fov)
      cenaMini.background = fundoEscuro
      devolverCorpo()
      cache.set(chave, png)
      return png
    }

    const desvioAntes = desvio
    // o card nao tem painel em cima, entao a peca fica centralizada — a nao ser
    // que ela nao more no eixo do corpo (ver 'lado' na tabela MINI)
    desvio = mini.lado || 0
    const quadro = mini.quadro || (altAux * (f.folga || 1.12))
    // larguraMin do foco e um PISO pensado pra tela cheia (nao cortar os ombros
    // numa janela estreita). Na miniatura ele so atrapalha: com o piso do rosto
    // (0.58 m) o close do OLHO virava um retrato de cabeca inteira, e a aba de
    // olhos mostrava seis cabecas iguais. O card e quadrado, entao o piso aqui
    // e o proprio quadro.
    _fMini.junta = f.junta
    _fMini.fov = f.fov
    _fMini.orbY = orbY
    _fMini.orbP = orbP
    _fMini.sobe = f.sobe
    _fMini.larguraMin = quadro
    enquadrar(aux, _fMini, quadro, 1, mini.sobe || 0, centroAux)
    desvio = desvioAntes

    const claroVazio = vazio && mini.fundo === 'claro'
    if (claroVazio && fundoClaro) cenaMini.background = fundoClaro
    const url = renderMini(f.fov)
    if (claroVazio) cenaMini.background = fundoEscuro
    if (vazio) aux.root.visible = true
    cache.set(chave, url)
    return url
  }

  /** Desenha o que estiver em _posDes/_alvoDes no render target e le o PNG. */
  function renderMini(fov) {
    camMini.fov = fov
    camMini.aspect = 1
    camMini.updateProjectionMatrix()
    camMini.position.copy(_posDes)
    camMini.lookAt(_alvoDes)

    const rtAntes = renderer.getRenderTarget()
    const sombraAntes = renderer.shadowMap.enabled
    renderer.shadowMap.enabled = false      // 192 px nao mostram sombra, so custam
    renderer.setRenderTarget(rt)
    renderer.clear()
    renderer.render(cenaMini, camMini)
    renderer.setRenderTarget(rtAntes)
    renderer.shadowMap.enabled = sombraAntes
    return lerPNG()
  }

  /** Ja tenho a foto desta peca? (o customizer usa pra decidir o esqueleto) */
  function temMiniatura(campo, indice) {
    return cache.has(campo + ':' + indice)
  }

  /**
   * Joga fora o que a mudanca de aparencia estragou.
   *
   * A regra que evita re-renderizar a grade inteira a cada clique: uma foto do
   * campo C JA sobrescreve C, entao mudar C nao a estraga — e a grade na tela
   * e justamente a do campo C. Trocar de camiseta invalida as fotos das OUTRAS
   * abas, que serao refeitas quando (e se) o jogador entrar nelas, diluidas no
   * stagger de entrada. Campo escondido na foto (o chapeu na foto do cabelo)
   * tambem nao a estraga. Duas ou mais mudancas de uma vez: limpa tudo, e caso
   * raro (carregar um preset) e nao vale o cruzamento.
   */
  function invalidar(mudados) {
    if (cache.size === 0) return
    if (mudados.length > 1) { cache.clear(); return }
    const f = mudados[0]
    // 'skin' anda junto com 'pele' (character.js resolve um pelo outro): tratar
    // como campo separado limparia o cache duas vezes por clique no tom de pele
    if (f === 'skin') return
    for (const chave of Array.from(cache.keys())) {
      const campo = chave.slice(0, chave.indexOf(':'))
      if (campo === f) continue
      const mini = MINI[campo]
      if (mini && mini.esconde && mini.esconde.indexOf(f) >= 0) continue
      cache.delete(chave)
    }
  }

  function limparCache() { cache.clear() }

  // --- fim ----------------------------------------------------------------------
  function dispose() {
    cache.clear()
    try { boneco.dispose() } catch (err) { void err }
    if (aux) { try { aux.dispose() } catch (err) { void err } }
    if (rt) rt.dispose()
    // O shadow map da principal e um render target de 1024x1024 vivo na GPU:
    // cena.clear() tira a luz da arvore mas nao devolve a textura, e o palco
    // pode ser montado de novo (menu -> criacao -> jogo -> menu).
    principal.dispose()
    for (const d of descartaveis) { if (d && typeof d.dispose === 'function') d.dispose() }
    descartaveis.length = 0
    cena.clear()
    if (cenaMini) cenaMini.clear()
    pixels = null
    imgData = null
    cvGrande = null
    cvPequeno = null
  }

  focar('corpo', true)

  return {
    cena,
    camera,
    boneco,
    /** aparencia atual do boneco do palco (o mesmo objeto, nao uma copia) */
    get aparencia() { return aparencia },
    /** nome do foco atual, ja normalizado */
    get foco() { return focoNome },
    setAparencia,
    focar,
    girar,
    setDesvio,
    atualizar,
    render,
    miniatura,
    temMiniatura,
    limparCache,
    dispose,
  }
}

export default criarProvador
