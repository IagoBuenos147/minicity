import * as THREE from 'three'
import {
  solid, stdMat, box, cyl, glass, tex, textPlaneMat,
} from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// src/mobilia/video-poker.js — a maquina de video poker que o jogador poe na
// casa (cat 'caca-niquel' no catalogo). Base em y = 0, frente pra +Z, como o
// resto de mobilia.js.
//
// A TELA VIVE. Todo o resto da peca (gabinete, letreiro, botoes) e geometria
// PARADA, igual mesa de sinuca e jukebox sempre foram. So a tela roda uma
// partida sozinha, em loop, porque foi ISSO que o dono pediu: "quero que
// apareca o video de poker na tela dela ao colocar no chao".
//
// COMO A TELA GANHA QUADRO: o encaixe so chama update em quem marca
// `grupo.userData.update = (dt, obj) => {}` no GRUPO QUE build() DEVOLVE (ver
// o comentario extenso em systems/encaixe.js:atualizar — a tela do video
// poker foi a peca que fez esse caminho existir). So roda enquanto o jogador
// esta a menos de 14 m da peca; longe disso o update nem e chamado, entao a
// simulacao PAUSA sozinha sem custar nada — nao precisa de nenhum cuidado
// especial aqui pra isso.
//
// A ORDEM QUE IMPORTA: bakeStatic() FUNDE por padrao tudo que nao estiver
// marcado. O cabecalho de world/bake.js diz o que sobrevive intacto: qualquer
// no com userData.dynamic ou userData.update (subindo pelos pais ate a raiz
// que foi passada pra bakeStatic). Se o GRUPO TOPO (o que build() devolve, o
// mesmo que vai ganhar o `.update` de quadro) ja tivesse esse `.update` ANTES
// de chamar bakeStatic(grupo), a subida de pais bateria nele pra QUALQUER
// filho, e nada fundiria — o gabinete inteiro continuaria em dezenas de
// draw calls, do jeito que a mesa de sinuca NAO fica. O inverso tambem quebra:
// se a TELA nao carregar a propria marca, ela funde junto com a madeira do
// gabinete num mesh so e para de atualizar pra sempre (o erro que o dono
// avisou). A saida e a ordem abaixo, em gabineteVideoPoker():
//   1) monta tudo (gabinete PARADO + a tela, e so a tela, com
//      mesh.userData.dynamic = true)
//   2) bakeStatic(grupo) — funde o gabinete inteiro num punhado de meshes;
//      a tela sobra sozinha, sem fundir, porque so ela carrega a marca
//   3) SO DEPOIS disso o grupo ganha grupo.userData.update — tarde demais
//      pra atrapalhar o forno, a tempo de o encaixe achar
//
// CUSTO DA TELA: o canvas e 512x384 e NAO se redesenha todo quadro — isso
// custaria o mesmo que derrubar o jogo com tres maquinas na sala (o mesmo
// aviso que esta em encaixe.js). redesenhar() so roda quando alguma coisa
// realmente mudou NA TELA (uma carta virou, o placar piscou, o credito
// mexeu) e mesmo assim passa por um acumulador que trava o ritmo em ~8
// vezes por segundo — ver criarTelaDeVideoPoker() mais abaixo. Fora dos
// eventos, atualizar() so avanca temporizadores: nao toca no canvas.
//
// POR QUE A LOGICA DE MAO NAO VEM DE cassino/poker.js: aquele arquivo e
// poker de DUAS cartas, cara a cara contra o NPC ricaco, com categorias
// proprias (par > sequencia > naipe > carta alta — ORDEM INVERTIDA de
// proposito, ver o cabecalho de poker.js) e emaranhado com aposta, fichas e
// fala do NPC. Video poker de bar e outro jogo: CINCO cartas, jacks-or-better,
// ninguem aposta contra a maquina, e o placar classico de premios ('par de
// valete pra cima > dois pares > trinca > sequencia > flush > full house >
// quadra > straight flush > royal flush') nao tem NENHUMA relacao com a
// tabela de duas cartas. Reaproveitar forcaDaMao() daria uma mao errada pra
// uma mesa errada. avaliarMaoCinco() abaixo e escrita do zero pra 5 cartas.
//
// Foi alem: nem cassino/baralho.js entra aqui (o sapato multi-baralho, os
// NAIPES, nomeValor). E so um helper de deck sem estado — importar renderia
// uma dependencia cruzando mobilia -> cassino por um punhado de constantes
// que cabem em dez linhas, e esta peca precisa ficar de pe sozinha (duas
// maquinas na sala tem duas simulacoes independentes, nenhuma delas e "a
// mesa do cassino"). O baralho, os naipes e o avaliador desta peca sao
// PROPRIOS, mais abaixo.
//
// mat.userData.owned = true na tela: a CanvasTexture e propria da instancia
// (nunca cacheada — duas maquinas na sala nao podem compartilhar a mesma
// partida), entao o material que a carrega marca 'owned' pra convencao do
// projeto poder liberar textura+material quando a peca for embora (mesmo
// padrao de player/character.js:limparObjeto e do CONTRATO.md de roupa/rosto).
// O resto do gabinete usa material CACHEADO — pode: e o mesmo cabinete pintado
// em toda maquina, so a tela e unica.
// ---------------------------------------------------------------------------

// --- medidas do gabinete (metros, base em y=0) ------------------------------
const LARG = 0.58              // largura (X)
const PROF = 0.54              // profundidade do gabinete SO, sem espaco de jogo (Z)
const H_BASE = 0.14            // rodape/plinto
const H_CORPO = 0.88           // corpo principal, do rodape ate a prateleira de controle
const H_SHELF = 0.05           // espessura da prateleira de controle (onde ficam os botoes)
const H_BEZEL = 0.46           // altura da moldura da tela, medida ALONG a face inclinada
const H_MARQUEE = 0.20         // caixa do letreiro, no topo
const ANG_TELA = THREE.MathUtils.degToRad(20)   // tela inclinada 20 graus pra tras

// altura total aproximada: 0.14+0.88+0.05 + 0.46*cos(20deg) + 0.20 = ~1.70 m —
// na faixa de um gabinete de pe de verdade, mais baixo que a jukebox (1.52 m
// de CORPO, sem contar que aqui ainda soma bezel+letreiro).

const TELA_W = 0.36            // tela fisica: mesma proporcao 4:3 do canvas (512x384)
const TELA_H = 0.27

// --- materiais (cacheados por chave, como catalogo.js faz) ------------------
// Prefixo 'vp-' pra nao colidir com chaves de outros arquivos no cache
// module-level de world/materials.js (_mats/_texs sao mapas globais).

/** Laminado escuro do gabinete: quase preto com um fundo arroxeado, e um
 *  punhado de flecos claros pra nao ler como plastico liso — mesma ideia do
 *  feltroTex de catalogo.js, so que mais discreto (e laminado, nao pano). */
function laminadoTex() {
  return tex('vp-laminado', 256, (g, s) => {
    g.fillStyle = '#1c1420'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 500; i++) {
      const v = 0.03 + Math.random() * 0.05
      g.fillStyle = 'rgba(255,255,255,' + v + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1 + Math.random() * 2)
    }
  })
}

const M = {
  get gabinete() {
    return stdMat('vp-gabinete', { map: laminadoTex(), color: 0x9a8aa8, roughness: 0.55, metalness: 0.1 })
  },
  // FOSCO DE VERDADE (roughness alto, metalness ZERO). Este material pinta a
  // caixa do letreiro e a moldura externa do bisel — as duas viradas 20 graus
  // PRA CIMA, apontando pras PointLight de intensidade 6 do teto. Com
  // roughness 0.45 e metalness 0.2 o lobo especular era estreito e o F0 alto,
  // e tools/diag-vp.mjs mediu o estrago: material pedindo #120e16 (quase
  // preto) SAINDO 164,139,106 na tela — bege de papelao colado num gabinete
  // preto, e o mesmo mecanismo que lavava a tela (ver o comentario grande do
  // material da tela mais abaixo).
  //
  // O remedio, porem, NAO e o mesmo da tela. Tela e FONTE de luz e por isso
  // virou MeshBasicMaterial. Isto aqui e chapa de verdade, superficie
  // ILUMINADA: com Basic ela pararia de receber luz, sombra e ambiente e
  // viraria silhueta preta chapada — sem volume, sem aresta, sem a sombra que
  // o letreiro joga na moldura, e do mesmo preto ao meio-dia e de madrugada.
  // Trocaria bege por buraco. Pra superficie iluminada o certo e ABRIR o lobo
  // ate ele nao concentrar mais: preto fosco continua preto de qualquer
  // angulo, e continua sendo superficie.
  get borda() { return stdMat('vp-borda', { color: 0x120e16, roughness: 0.88, metalness: 0.0 }) },
  get metal() { return solid(0x9aa1a8, 0.35, 0.7) },
  get metalEscuro() { return solid(0x38343c, 0.5, 0.5) },
  get moeda() { return solid(0x18151a, 0.7, 0.2) },
  get bandeja() { return solid(0x100d12, 0.55, 0.35) },
  // fosco e quase preto, roughness alto: e a cor de um buraco que nao
  // devolve luz nenhuma, o fundo da boca da bandeja de premio
  get cavidade() { return solid(0x030304, 0.95, 0.0) },
  // moldura da tela: preta de verdade, e SO da tela — nao e M.metalEscuro
  // (cinza medio, semi-metalico), que e compartilhado com a boca da bandeja
  // ja aprovada. Fosca pelo mesmo motivo do M.borda logo acima: com
  // roughness 0.75 e metalness 0.05 o diag mediu 88,70,47 nesta chapa
  // inclinada; sem metal nenhum e lobo bem aberto ela para de juntar reflexo
  // e volta a ser a borda preta que uma tela de maquina tem.
  get molduraTela() { return solid(0x08080a, 0.92, 0.0) },
  get telaVidro() { return glass(0x9fb4c0, 0.05) }, // ver diag-vp.mjs: o vidro claro a 10% ainda punha um veu leitoso na tela
  get hold() { return stdMat('vp-btn-hold', { color: 0x241a10, emissive: 0xdd8f2a, emissiveIntensity: 1.35, roughness: 0.4 }) },
  get deal() { return stdMat('vp-btn-deal', { color: 0x0e2417, emissive: 0x2ee06e, emissiveIntensity: 1.35, roughness: 0.4 }) },
  get bet() { return stdMat('vp-btn-bet', { color: 0x24101a, emissive: 0xe0324a, emissiveIntensity: 1.35, roughness: 0.4 }) },
}

// ---------------------------------------------------------------------------
// BARALHO E AVALIACAO DE MAO — proprios desta peca (ver o comentario do topo
// do arquivo pra o porque de nao vir de cassino/poker.js nem cassino/baralho.js).
//
// Carta e { r, n }: r vai de 2 a 14 (14 = As, JA alto — nao precisa de
// segunda escala porque aqui ninguem faz As valer 1 fora da sequencia mais
// baixa) e n e o indice do naipe em NAIPES. Igual ao resto do jogo: dois
// inteiros comparam com aritmetica, sem string no meio do calculo.
// ---------------------------------------------------------------------------

const NAIPES = [
  { simbolo: '♠', cor: '#1c1c22' },   // espadas
  { simbolo: '♥', cor: '#c0392b' },   // copas
  { simbolo: '♦', cor: '#c0392b' },   // ouros
  { simbolo: '♣', cor: '#1c1c22' },   // paus
]

/** 'A','2'..'10','J','Q','K' a partir do valor 2..14. */
function rotuloValor(r) {
  if (r === 14) return 'A'
  if (r === 13) return 'K'
  if (r === 12) return 'Q'
  if (r === 11) return 'J'
  return String(r)
}

// nome por extenso, plural, so pro par que da premio (J, Q, K, A) — e o que
// vira 'PAR DE VALETES' na tela quando a mao pisca.
const NOME_PLURAL = { 11: 'VALETES', 12: 'DAMAS', 13: 'REIS', 14: 'ASES' }

/** Baralho de 52 cartas, embaralhado (Fisher-Yates). Uma partida inteira
 *  (5 na mao + ate 5 na troca) cabe nele sem nunca precisar reembaralhar no
 *  meio — por isso, ao contrario do sapato de cassino/baralho.js, este
 *  baralho nao precisa saber reabastecer sozinho: uma partida nova sempre
 *  comeca de um baralho novo. */
function novoBaralho() {
  const b = []
  for (let n = 0; n < 4; n++) for (let r = 2; r <= 14; r++) b.push({ r, n })
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = b[i]; b[i] = b[j]; b[j] = t
  }
  return b
}

/** Quantas cartas de cada valor ha nas 5 — Map<valor, quantidade>. */
function contarValores(cinco) {
  const m = new Map()
  for (const c of cinco) m.set(c.r, (m.get(c.r) || 0) + 1)
  return m
}

function mesmoNaipeTodas(cinco) {
  return cinco.every((c) => c.n === cinco[0].n)
}

/** 5 valores em sequencia. O As fecha por baixo (A-2-3-4-5, a "escada") alem
 *  de por cima (10-J-Q-K-A, que cai no caso comum abaixo porque 14 ja e o
 *  maior valor). Sem esse caso especial a escada nunca bateria: os valores
 *  ordenados dariam 2,3,4,5,14 e o salto de 5 pra 14 quebraria a sequencia. */
function ehSequencia(cinco) {
  const v = cinco.map((c) => c.r).sort((a, b) => a - b)
  if (v[0] === 2 && v[1] === 3 && v[2] === 4 && v[3] === 5 && v[4] === 14) return true
  for (let i = 1; i < 5; i++) if (v[i] !== v[i - 1] + 1) return false
  return true
}

// Categorias, da mais fraca (0) pra mais forte (9) — a ORDEM do poker de
// verdade de 5 cartas, sem nenhuma inversao (essa e a diferenca pro
// cassino/poker.js de duas cartas, que inverte de proposito). Par so entra
// aqui — e so paga — a partir de valete: par baixo cai em NADA, que e a regra
// que da nome ao jogo ("jacks or better").
const NOME_CATEGORIA = [
  'NADA', 'VALETES OU MELHOR', 'DOIS PARES', 'TRINCA', 'SEQUENCIA',
  'FLUSH', 'FULL HOUSE', 'QUADRA', 'STRAIGHT FLUSH', 'ROYAL FLUSH',
]
// Pagamento classico do "9/6 Jacks or Better" pra aposta cheia (aqui fixa em
// 5 creditos): 9x no full house, 6x no flush por credito — dai o apelido.
// royal e bonificado (4000, nao os 1250 que a escala linear daria) porque nas
// maquinas de verdade o premio maximo so aparece assim: e o gancho do jogo.
const PAGAMENTOS = [0, 5, 10, 15, 20, 30, 45, 125, 250, 4000]
const APOSTA = 5

/**
 * Forca da mao de CINCO cartas. Devolve { categoria, nome, pagamento }.
 * 'nome' e o que a tela flasha quando a rodada fecha — igual ao 'PAR DE
 * VALETES' / 'TRINCA' / 'NADA' que o dono pediu pra ver acontecer.
 */
function avaliarMaoCinco(cinco) {
  const cont = contarValores(cinco)
  const grupos = [...cont.values()].sort((a, b) => b - a)
  const flushColor = mesmoNaipeTodas(cinco)
  const seq = ehSequencia(cinco)
  const vals = cinco.map((c) => c.r).sort((a, b) => a - b)
  const royal = seq && flushColor && vals[0] === 10   // 10-J-Q-K-A; a escada nunca cai aqui (vals[0] seria 2)

  let categoria
  if (royal) categoria = 9
  else if (seq && flushColor) categoria = 8
  else if (grupos[0] === 4) categoria = 7
  else if (grupos[0] === 3 && grupos[1] === 2) categoria = 6
  else if (flushColor) categoria = 5
  else if (seq) categoria = 4
  else if (grupos[0] === 3) categoria = 3
  else if (grupos[0] === 2 && grupos[1] === 2) categoria = 2
  else if (grupos[0] === 2) {
    let rankPar = 0
    for (const [r, v] of cont) if (v === 2) rankPar = r
    categoria = rankPar >= 11 ? 1 : 0
  } else categoria = 0

  let nome
  if (categoria === 1) {
    let rankPar = 0
    for (const [r, v] of cont) if (v === 2) rankPar = r
    nome = 'PAR DE ' + NOME_PLURAL[rankPar]
  } else {
    nome = NOME_CATEGORIA[categoria]
  }

  return { categoria, nome, pagamento: PAGAMENTOS[categoria] }
}

/**
 * Quais das 5 cartas segurar antes do DRAW. Nao e estrategia otima de
 * verdade — e uma vitrine que joga sozinha, ninguem vai estudar EV aqui —
 * mas segue a ordem que qualquer jogador de video poker reconheceria:
 * mao pronta > guarda tudo; trinca solta > guarda os tres; um ou dois
 * pares (mesmo abaixo de valete: um par baixo ainda vale mais que carta
 * solta) > guarda os pares; 4 cartas do mesmo naipe > persegue o flush;
 * senao guarda ate duas cartas altas e descarta o resto.
 */
function decidirHolds(cinco) {
  const cont = contarValores(cinco)
  let maiorGrupo = 0
  for (const v of cont.values()) if (v > maiorGrupo) maiorGrupo = v
  const nPares = [...cont.values()].filter((v) => v === 2).length
  const flushColor = mesmoNaipeTodas(cinco)
  const seq = ehSequencia(cinco)

  if (flushColor || seq || maiorGrupo === 4 || (maiorGrupo === 3 && nPares === 1)) {
    return [true, true, true, true, true]
  }
  if (maiorGrupo === 3) {
    return cinco.map((c) => cont.get(c.r) === 3)
  }
  if (nPares >= 1) {
    return cinco.map((c) => cont.get(c.r) === 2)
  }
  const porNaipe = new Map()
  for (const c of cinco) porNaipe.set(c.n, (porNaipe.get(c.n) || 0) + 1)
  let naipeGrande = -1, qtdeGrande = 0
  for (const [n, v] of porNaipe) if (v > qtdeGrande) { qtdeGrande = v; naipeGrande = n }
  if (qtdeGrande === 4) {
    return cinco.map((c) => c.n === naipeGrande)
  }
  const holds = [false, false, false, false, false]
  const altas = [0, 1, 2, 3, 4].filter((i) => cinco[i].r >= 11).sort((a, b) => cinco[b].r - cinco[a].r)
  for (let k = 0; k < Math.min(2, altas.length); k++) holds[altas[k]] = true
  return holds
}

// ---------------------------------------------------------------------------
// A TELA — canvas 2D proprio (nunca cacheado), a partida que roda nele, e o
// redesenho com throttle. Tudo dentro de UMA closure por instancia: e o que
// garante que duas maquinas na sala tocam partidas diferentes.
// ---------------------------------------------------------------------------

const TW = 512, TH = 384        // tamanho do canvas — pedido explicito, nao mexer
const FASE = Object.freeze({ IDLE: 0, DEAL: 1, SEGURANDO: 2, TROCANDO: 3, RESULTADO: 4 })

const T_IDLE = 0.7              // espera de olhos parados antes do proximo DEAL
const T_CARTA = 0.22            // intervalo entre cada carta virando (deal ou draw)
const T_PAUSA_HOLD = 1.1        // pausa mostrando quem ficou em HOLD, pra dar tempo de ler
const T_PAUSA_RESULTADO = 1.7   // quanto o nome da mao fica na tela
const T_PISCA = 0.35            // intervalo do pisca-pisca do resultado premiado

// Redesenho tem TETO: mesmo em rajada de eventos (a troca de 4 cartas em
// sequencia, por exemplo) o canvas nao atualiza mais rapido que isto. 0.125 s
// = 8 vezes por segundo, dentro da faixa de 6 a 10 que foi pedida.
const INTERVALO_REDESENHO = 0.125

/**
 * Constroi a tela viva: canvas, textura, material PROPRIO (nao cacheado) e a
 * simulacao de uma partida sozinha. Devolve { mesh, atualizar(dt) } — quem
 * monta o gabinete pendura o mesh na moldura da tela e liga atualizar ao
 * userData.update do grupo (ver gabineteVideoPoker() mais abaixo).
 */
function criarTelaDeVideoPoker() {
  const canvas = document.createElement('canvas')
  canvas.width = TW
  canvas.height = TH
  const ctx = canvas.getContext('2d')

  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 4

  // TELA E FONTE DE LUZ, NAO SUPERFICIE ILUMINADA — por isso Basic, e nao
  // Standard.
  //
  // As duas primeiras versoes tentaram resolver o fundo lavado dentro do
  // MeshStandardMaterial: primeiro baixando emissiveIntensity, depois pondo
  // color quase-preto pra matar o canal difuso e toneMapped:false. Nada disso
  // adiantou, e a medicao (tools/diag-vp.mjs) mostrou por que. Escondendo a
  // peca inteira menos a tela e lendo o pixel do canto do fundo:
  //
  //   canvas naquele ponto ............... 2, 4, 8    (preto, como devia)
  //   tela como estava ................... 105, 89, 67
  //   sem emissivo ....................... 105, 89, 66   <- nao mudou nada
  //   sem o map difuso ................... 108, 92, 69   <- nem isso
  //   sem environment .................... 108, 92, 69
  //   sem fog ............................ 108, 92, 69
  //   metalness 0 + roughness 1 .......... 55, 47, 34    <- caiu pela metade
  //
  // Ou seja: o cinza NAO vinha do canvas nem do emissivo — vinha da LUZ DA
  // CASA batendo no painel. Um MeshStandardMaterial e dieletrico: mesmo com
  // albedo preto ele mantem o lobo especular (F0 = 0,04), e a sala tem uma
  // direcional 2,7 mais varias PointLight 6 em cima. Foi esse reflexo, e so
  // ele, que deixou o preto do canvas em cinza medio — tanto que abrir o lobo
  // (roughness 1) derrubou o valor pela metade. E toneMapped:false ainda
  // piorava: tirava do reflexo a compressao do ACES que o resto da sala leva.
  //
  // MeshBasicMaterial nao tem lobo nenhum: ignora luz, sombra e ambiente, e
  // mostra a textura exatamente como o canvas desenhou. Preto do canvas vira
  // preto na tela em qualquer comodo, de qualquer angulo, a qualquer hora do
  // dia — que e como uma tela se comporta. toneMapped:false continua, agora
  // pelo motivo certo: o canvas ja E o resultado final, nao pode levar mais
  // uma rodada de compressao por cima. O branco do texto sai em 1,0 e passa
  // do limiar do bloom (0,85, ver BLOOM em core/engine.js) — o halo suave em
  // volta das letras e de graca, e e o que faz ler como tela acesa.
  const mat = new THREE.MeshBasicMaterial({ map: textura, toneMapped: false })
  // Textura propria da instancia: marca 'owned' pra convencao do projeto
  // poder liberar map+material quando a peca for guardada (ver o comentario
  // grande no topo do arquivo).
  mat.userData.owned = true

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(TELA_W, TELA_H), mat)
  // Nome proprio: depois da confusao da segunda rodada de fotos (uma sonda
  // que varre "todo mesh com map ou emissiveMap" tambem acha as 6 placas de
  // legenda() coladas no gabinete — HOLD, BET, DEAL/DRAW, naipes, JACKS OR
  // BETTER, o letreiro — e pode logar QUALQUER uma delas em vez desta), um
  // nome sem ambiguidade deixa a peca certa achavel na hora.
  mesh.name = 'tela-video-poker'
  // dynamic: e a marca que faz bakeStatic() PULAR este mesh (ver cabecalho de
  // bake.js) — sem ela a tela funde no gabinete e para de atualizar pra sempre.
  mesh.userData.dynamic = true
  mesh.castShadow = false
  mesh.receiveShadow = false

  // --- estado da partida ----------------------------------------------------
  let fase = FASE.IDLE
  let timer = T_IDLE
  let creditos = 500
  let maos = [null, null, null, null, null]
  let viradas = [false, false, false, false, false]
  let holds = [false, false, false, false, false]
  let baralho = []
  let posBaralho = 0
  let idxAnim = 0
  let mensagem = 'APOSTE PARA JOGAR'
  let nomeResultado = ''
  let pagamentoResultado = 0
  let categoriaResultado = -1
  let piscar = true
  let piscaTimer = T_PISCA

  // Linhas da tabela de premio, da mais forte pra mais fraca (NADA nunca
  // aparece numa tabela de premio de verdade — ela so lista quem paga).
  const linhasPagtable = []
  for (let cat = 9; cat >= 1; cat--) linhasPagtable.push([NOME_CATEGORIA[cat], PAGAMENTOS[cat]])

  // --- desenho ---------------------------------------------------------------
  // Cada desenharX() cuida de uma faixa horizontal do canvas. redesenhar() as
  // chama em sequencia e marca a textura suja UMA vez no fim — nunca durante,
  // que seria redesenhar a GPU a cada fillRect.

  // Preto-azulado, quase sem luz propria — o pedido depois da primeira foto
  // foi EXATAMENTE isto: fundo escuro de verdade, pra cor saturada (carta,
  // texto, pisca-pisca) ser a UNICA coisa que chama atencao em cima dele. O
  // verde escuro da primeira versao ja era "escuro" no papel, mas dividia a
  // tela inteira com o canal difuso (ver o comentario do material acima) e
  // saia lavado.
  function desenharFundo() {
    const grad = ctx.createLinearGradient(0, 0, 0, TH)
    grad.addColorStop(0, '#060a14')
    grad.addColorStop(1, '#000000')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, TW, TH)
  }

  /** Tabela pequena no topo, duas colunas. A linha da categoria que acabou de
   *  sair pisca em destaque enquanto o resultado esta na tela — o mesmo truque
   *  que uma maquina de verdade usa pra apontar onde voce ganhou. */
  function desenharPaytable() {
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif'
    ctx.textBaseline = 'middle'
    const colX = [14, 264]
    const rowH = 15
    const y0 = 10
    for (let i = 0; i < linhasPagtable.length; i++) {
      const col = i < 5 ? 0 : 1
      const row = i < 5 ? i : i - 5
      const x = colX[col]
      const y = y0 + row * rowH + rowH / 2
      const categoriaLinha = 9 - i
      const destacar = fase === FASE.RESULTADO && piscar && categoriaLinha === categoriaResultado
      if (destacar) {
        ctx.fillStyle = 'rgba(230,190,60,0.32)'
        ctx.fillRect(x - 6, y - rowH / 2 + 1, 236, rowH - 2)
      }
      ctx.fillStyle = destacar ? '#ffe27a' : '#4fe0a8'
      ctx.textAlign = 'left'
      ctx.fillText(linhasPagtable[i][0], x, y)
      ctx.textAlign = 'right'
      ctx.fillText(String(linhasPagtable[i][1]), x + 226, y)
    }
  }

  function desenharHud() {
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#f0e6c8'
    ctx.fillText('CREDITOS ' + creditos, 14, 112)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#4fe0a8'
    ctx.fillText('APOSTA ' + APOSTA, TW - 14, 112)
  }

  const CARTA_W = 76, CARTA_H = 112, CARTA_GAP = 10
  const CARTAS_X0 = (TW - (CARTA_W * 5 + CARTA_GAP * 4)) / 2
  const CARTAS_Y = 132

  /** Caminho do retangulo arredondado da carta. Funcao a parte porque ele
   *  precisa ser tracado MAIS DE UMA VEZ por carta: o miolo (verso ou frente)
   *  desenha dentro de um clip() que usa este caminho, e o path 'atual' do
   *  canvas nao sobrevive a isso — clip() nao redefine o path, mas qualquer
   *  beginPath() novo dentro do miolo (o verso risca varias linhas, cada
   *  uma com o proprio beginPath) substitui o path ATIVO. Sem retracar aqui
   *  antes do contorno final, o stroke() da moldura pegaria o ultimo
   *  tracinho da rajada de listras em vez do retangulo inteiro. */
  function caminhoCarta(x, y, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + CARTA_W, y, x + CARTA_W, y + CARTA_H, r)
    ctx.arcTo(x + CARTA_W, y + CARTA_H, x, y + CARTA_H, r)
    ctx.arcTo(x, y + CARTA_H, x, y, r)
    ctx.arcTo(x, y, x + CARTA_W, y, r)
    ctx.closePath()
  }

  function desenharCartas() {
    for (let i = 0; i < 5; i++) {
      const x = CARTAS_X0 + i * (CARTA_W + CARTA_GAP)
      const y = CARTAS_Y
      const r = 7

      ctx.save()
      caminhoCarta(x, y, r)

      const carta = maos[i]
      const virada = viradas[i] && carta
      if (!virada) {
        ctx.fillStyle = '#7a1620'
        ctx.fill()
        ctx.clip()
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'
        ctx.lineWidth = 3
        for (let d = -CARTA_H; d < CARTA_W; d += 12) {
          ctx.beginPath()
          ctx.moveTo(x + d, y)
          ctx.lineTo(x + d + CARTA_H, y + CARTA_H)
          ctx.stroke()
        }
        ctx.strokeStyle = '#e8c25a'
        ctx.lineWidth = 2
        ctx.strokeRect(x + 5, y + 5, CARTA_W - 10, CARTA_H - 10)
      } else {
        ctx.fillStyle = '#f5f1e6'
        ctx.fill()
        ctx.clip()
        const info = NAIPES[carta.n]
        ctx.fillStyle = info.cor
        ctx.font = 'bold 24px "Trebuchet MS", sans-serif'
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(rotuloValor(carta.r), x + 6, y + 4)
        ctx.font = 'bold 18px "Trebuchet MS", sans-serif'
        ctx.fillText(info.simbolo, x + 7, y + 30)
        ctx.font = 'bold 38px "Trebuchet MS", sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(info.simbolo, x + CARTA_W / 2, y + CARTA_H / 2 + 6)
      }
      ctx.restore()

      caminhoCarta(x, y, r)
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      if (holds[i] && (fase === FASE.SEGURANDO || fase === FASE.TROCANDO || fase === FASE.RESULTADO)) {
        ctx.fillStyle = '#e8a83c'
        ctx.font = 'bold 13px "Trebuchet MS", sans-serif'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('HOLD', x + CARTA_W / 2, y + CARTA_H + 13)
      }
    }
  }

  function desenharMensagem() {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    const y = 352
    if (fase === FASE.RESULTADO) {
      const ganhou = pagamentoResultado > 0
      if (ganhou && !piscar) return   // pisca: some em metade dos ciclos
      ctx.font = 'bold 28px "Trebuchet MS", sans-serif'
      ctx.fillStyle = ganhou ? '#ffd85c' : '#8fa89a'
      ctx.shadowColor = ganhou ? '#ffb400' : 'transparent'
      ctx.shadowBlur = ganhou ? 16 : 0
      ctx.fillText(nomeResultado, TW / 2, y)
      ctx.shadowBlur = 0
    } else {
      ctx.font = 'bold 19px "Trebuchet MS", sans-serif'
      ctx.fillStyle = '#dfe8e2'
      ctx.fillText(mensagem, TW / 2, y)
    }
  }

  /** Textura de tubo de CRT: linhas finas + moldura verde-fosforo. Barato de
   *  proposito — e refeito a cada redesenho, entao nada de loop por pixel
   *  (isso e coisa de textura ASSADA UMA VEZ, como as de world/materials.js). */
  function desenharScanlines() {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let y = 0; y < TH; y += 6) ctx.fillRect(0, y, TW, 2)
    ctx.strokeStyle = 'rgba(120,255,190,0.22)'
    ctx.lineWidth = 3
    ctx.strokeRect(2, 2, TW - 4, TH - 4)
  }

  function redesenhar() {
    desenharFundo()
    desenharPaytable()
    desenharHud()
    desenharCartas()
    desenharMensagem()
    desenharScanlines()
    textura.needsUpdate = true
  }

  // --- a partida ---------------------------------------------------------
  // Uma maquina de vitrine nao pode secar: se o credito nao da pra proxima
  // aposta ela "recarrega" sozinha. Nao e caixa registradora — 'retorno' de
  // verdade fica com cassino/*, aqui e so a tela mostrando um jogo rodando.
  function iniciarMao() {
    if (creditos < APOSTA) creditos = 500
    creditos -= APOSTA
    baralho = novoBaralho()
    posBaralho = 0
    for (let i = 0; i < 5; i++) {
      maos[i] = baralho[posBaralho++]
      viradas[i] = false
      holds[i] = false
    }
    idxAnim = 0
    fase = FASE.DEAL
    timer = T_CARTA
    mensagem = 'BOA SORTE'
  }

  /** Avanca um passo da simulacao. Devolve true quando algo mudou NA TELA —
   *  e o sinal que redesenhar() precisa pra saber que vale a pena rodar (ver
   *  atualizar() logo abaixo, que so chama redesenhar() quando isto for true
   *  E o acumulador de throttle tiver passado do teto). */
  function avancarSimulacao(dt) {
    timer -= dt

    if (fase === FASE.IDLE) {
      if (timer <= 0) { iniciarMao(); return true }
      return false
    }

    if (fase === FASE.DEAL) {
      if (timer > 0) return false
      viradas[idxAnim] = true
      idxAnim++
      if (idxAnim >= 5) {
        holds = decidirHolds(maos)
        fase = FASE.SEGURANDO
        timer = T_PAUSA_HOLD
        mensagem = 'SEGURANDO...'
      } else {
        timer = T_CARTA
      }
      return true
    }

    if (fase === FASE.SEGURANDO) {
      if (timer > 0) return false
      // as nao seguradas viram de bruco juntas — e o "flip pra baixo" antes
      // do draw trazer carta nova, uma a uma, na fase seguinte
      for (let i = 0; i < 5; i++) if (!holds[i]) viradas[i] = false
      idxAnim = 0
      fase = FASE.TROCANDO
      timer = T_CARTA * 0.6
      mensagem = 'COMPRANDO...'
      return true
    }

    if (fase === FASE.TROCANDO) {
      if (timer > 0) return false
      while (idxAnim < 5 && holds[idxAnim]) idxAnim++
      if (idxAnim < 5) {
        maos[idxAnim] = baralho[posBaralho++]
        viradas[idxAnim] = true
        idxAnim++
        timer = T_CARTA
        return true
      }
      const r = avaliarMaoCinco(maos)
      nomeResultado = r.nome
      pagamentoResultado = r.pagamento
      categoriaResultado = r.categoria
      creditos += r.pagamento
      mensagem = r.nome
      fase = FASE.RESULTADO
      timer = T_PAUSA_RESULTADO
      piscar = true
      piscaTimer = T_PISCA
      return true
    }

    // FASE.RESULTADO: o pisca-pisca do premio conta como mudanca por si so;
    // mao sem premio so espera parada (nada pra piscar, nada pra redesenhar
    // ate a fase acabar).
    let mudou = false
    if (pagamentoResultado > 0) {
      piscaTimer -= dt
      if (piscaTimer <= 0) { piscar = !piscar; piscaTimer = T_PISCA; mudou = true }
    }
    if (timer <= 0) {
      fase = FASE.IDLE
      timer = T_IDLE
      mensagem = 'APOSTE PARA JOGAR'
      mudou = true
    }
    return mudou
  }

  redesenhar()   // primeiro quadro: a peca nao pode nascer com a tela vazia
  // (o encaixe so chama atualizar() quando o jogador esta perto — se ele
  // nascer longe, o primeiro redesenho de verdade pode demorar a acontecer)

  let acumulador = 0
  let sujo = false   // true = ha mudanca pendente que ainda nao foi desenhada

  /** Chamado pelo update do grupo, todo quadro em que o jogador esta perto
   *  (ver encaixe.atualizar). So MEXE NO CANVAS quando ha mudanca pendente E
   *  o acumulador passou do teto de ~8 Hz — ver INTERVALO_REDESENHO.
   *
   *  O flag 'sujo' e o que impede uma mudanca de se perder: se ela cair
   *  DENTRO do teto (redesenhou faz pouco), sujo continua true e a proxima
   *  chamada que passar do teto ainda redesenha — mesmo que NENHUM evento
   *  novo tenha acontecido nesse meio tempo. Sem o flag persistente (so
   *  olhando o retorno desta chamada) uma mudanca assim nunca apareceria na
   *  tela ate o proximo evento vir empurrar o redesenho — que pode ser a
   *  pausa inteira de SEGURANDO (1.1 s) de atraso. */
  function atualizar(dt) {
    if (avancarSimulacao(dt)) sujo = true
    acumulador += dt
    if (sujo && acumulador >= INTERVALO_REDESENHO) {
      redesenhar()
      acumulador = 0
      sujo = false
    }
  }

  return { mesh, atualizar }
}

// ---------------------------------------------------------------------------
// O GABINETE — de pe, bartop alto, tela inclinada. Geometria nova a cada
// chamada (nenhum box/cyl/roundedBox daqui e reaproveitado entre instancias);
// so os materiais em M (e os textPlaneMat, que sao texto fixo) sao cacheados.
// ---------------------------------------------------------------------------

// placar do letreiro e as legendas dos botoes: texto fixo, entao CACHEADO —
// nao muda de maquina pra maquina, so a tela por tras muda.
function legenda(texto, w, h, fonte) {
  return textPlaneMat(texto, {
    w, h, color: '#f0e6c8', font: fonte || 'bold 60px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.35,
  })
}

// O LETREIRO NAO PODE SER legenda()/textPlaneMat(): aquele helper monta um
// MeshStandardMaterial com fundo TRANSPARENTE por baixo do texto, e o
// letreiro mora no topo do gabinete — a MESMA altura que o diag-vp2 mediu
// saindo bege (217,201,172) mesmo num material escuro por causa das
// PointLight do teto. Painel aceso de verdade nao pode confiar em ficar
// escuro sob luz forte: ele TEM que ser a fonte, igual a tela (ver o
// comentario grande do topo do arquivo) — cacheado, porque ao contrario da
// tela o letreiro e IDENTICO em toda maquina. Fundo do canvas e OPACO de
// proposito: um fundo transparente deixaria a caixa clara atras vazar de
// novo nas bordas da placa.
let _matLetreiro = null
function materialLetreiro() {
  if (_matLetreiro) return _matLetreiro
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 128
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 0, 128)
  grad.addColorStop(0, '#2a1440')
  grad.addColorStop(1, '#0a0414')
  g.fillStyle = grad
  g.fillRect(0, 0, 512, 128)
  g.font = 'bold 74px "Trebuchet MS", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = '#ffcf5c'
  g.shadowBlur = 26
  g.fillStyle = '#ffe27a'
  g.fillText('VIDEO POKER', 256, 66)
  g.shadowBlur = 0
  g.strokeStyle = 'rgba(0,0,0,0.55)'
  g.lineWidth = 3
  g.strokeText('VIDEO POKER', 256, 66)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  // Basic + toneMapped:false: mesma dupla razao da tela — nao pode ter lobo
  // especular pra luz nenhuma pegar, e o ACES nao pode comprimir o amarelo
  // que ja foi desenhado pra ficar no ponto.
  _matLetreiro = new THREE.MeshBasicMaterial({ map: t, toneMapped: false })
  return _matLetreiro
}

function gabineteVideoPoker() {
  const g = new THREE.Group()

  // --- rodape ----------------------------------------------------------------
  g.add(box(LARG, H_BASE, PROF, M.gabinete, 0, H_BASE / 2, 0))
  // sombra do rodape recuado (toe-kick) — sem ela a peca le como uma caixa
  // lisa do chao ao topo, sem apoio
  g.add(box(LARG - 0.08, H_BASE - 0.035, 0.02, M.metalEscuro, 0, H_BASE / 2, PROF / 2 - 0.015))

  // friso cromado separando rodape do corpo — a segunda foto mostrou meio
  // metro de painel liso abaixo da moeda; uma faixa so ja quebra a caixa em
  // duas massas em vez de uma coluna sem fim
  g.add(box(LARG + 0.015, 0.028, PROF + 0.015, M.metal, 0, H_BASE, 0))

  // --- corpo principal ---------------------------------------------------------
  const yCorpoC = H_BASE + H_CORPO / 2
  g.add(box(LARG, H_CORPO, PROF, M.gabinete, 0, yCorpoC, 0))

  // quinas cromadas na frente, de cima a baixo do corpo
  for (const s of [-1, 1]) {
    g.add(box(0.022, H_CORPO, 0.022, M.metal, s * (LARG / 2 - 0.015), yCorpoC, PROF / 2 - 0.008))
  }

  // porta de moedas + fenda
  const yMoeda = H_BASE + H_CORPO * 0.62
  g.add(box(0.11, 0.13, 0.018, M.metal, LARG * 0.28, yMoeda, PROF / 2 + 0.001))
  g.add(box(0.024, 0.05, 0.022, M.moeda, LARG * 0.28, yMoeda, PROF / 2 + 0.012))

  // --- bandeja de premio: BOCA de verdade, nao um risco -----------------------
  // Quatro pecas fazem a leitura de "buraco com labio", nao de adesivo: uma
  // cavidade ESCURA recuada PRA DENTRO do corpo (e o "olhar pro fundo" que
  // falta quando so ha uma caixa rasa colada na frente), uma moldura rente a
  // frente prendendo essa cavidade, um capuz saindo por cima (esconde o
  // mecanismo, joga sombra na boca) e o labio de verdade saindo por baixo —
  // a calha rasa onde a ficha realmente cai.
  const TRAY_X = -LARG * 0.22
  const TRAY_W = 0.24
  const TRAY_H = 0.17
  const trayYC = H_BASE + 0.05 + TRAY_H / 2
  g.add(box(TRAY_W - 0.02, TRAY_H - 0.02, 0.05, M.cavidade, TRAY_X, trayYC, PROF / 2 - 0.03))
  g.add(box(TRAY_W + 0.03, TRAY_H + 0.03, 0.016, M.metalEscuro, TRAY_X, trayYC, PROF / 2 + 0.003))
  g.add(box(TRAY_W + 0.06, 0.025, 0.10, M.metal, TRAY_X, trayYC + TRAY_H / 2 + 0.012, PROF / 2 + 0.055))
  g.add(box(TRAY_W + 0.02, 0.032, 0.12, M.bandeja, TRAY_X, trayYC - TRAY_H / 2, PROF / 2 + 0.065))
  g.add(box(TRAY_W - 0.04, 0.014, 0.095, M.cavidade, TRAY_X, trayYC - TRAY_H / 2 + 0.011, PROF / 2 + 0.075))

  // placa "JACKS OR BETTER" no vao entre a bandeja e a porta de moeda — o
  // mesmo vao vazio que a foto mostrou, agora ocupado por informacao de
  // verdade em vez de mais uma decoracao repetida
  const placaRegra = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.075),
    legenda('JACKS OR BETTER', 460, 100, 'bold 58px "Trebuchet MS", sans-serif'),
  )
  placaRegra.position.set(0.02, (trayYC + TRAY_H / 2 + 0.03 + yMoeda - 0.08) / 2, PROF / 2 + 0.001)
  placaRegra.castShadow = false
  g.add(placaRegra)

  // naipes pintados nas laterais — decoracao pequena, material cacheado (e a
  // mesma placa em toda maquina, so a tela por tras e que nunca se repete)
  const naipesTxt = legenda('♠  ♥  ♦  ♣', 320, 90, '52px "Trebuchet MS", sans-serif')
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.085), naipesTxt)
    p.position.set(s * (LARG / 2 + 0.001), yCorpoC + 0.10, 0)
    p.rotation.y = s * Math.PI / 2
    p.castShadow = false
    g.add(p)
  }

  // --- prateleira de controle --------------------------------------------------
  // flush com a frente do gabinete, estendendo pra tras — e onde os botoes
  // ficam ao alcance da mao de quem esta jogando.
  const yShelf = H_BASE + H_CORPO + H_SHELF
  const SHELF_DEPTH = 0.30
  const shelfZC = PROF / 2 - SHELF_DEPTH / 2
  g.add(box(LARG + 0.03, H_SHELF, SHELF_DEPTH, M.borda, 0, H_BASE + H_CORPO + H_SHELF / 2, shelfZC))

  const zBotao = PROF / 2 - 0.07
  const zLegenda = zBotao - 0.06

  // 5 HOLD, alinhados com as 5 cartas da tela; BET na ponta esquerda, DEAL/DRAW
  // na direita — o botao que fecha a jogada fica maior, como em maquina de verdade.
  const xHold = [-0.16, -0.08, 0, 0.08, 0.16]
  for (const x of xHold) {
    const btn = cyl(0.020, 0.020, 0.018, M.hold, 14)
    btn.position.set(x, yShelf + 0.009, zBotao)
    g.add(btn)
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.020), legenda('HOLD', 180, 70))
    lbl.rotation.x = -Math.PI / 2
    lbl.position.set(x, yShelf + 0.001, zLegenda)
    lbl.castShadow = false
    g.add(lbl)
  }

  const xBet = -0.25
  const btnBet = cyl(0.022, 0.022, 0.018, M.bet, 16)
  btnBet.position.set(xBet, yShelf + 0.009, zBotao)
  g.add(btnBet)
  const lblBet = new THREE.Mesh(new THREE.PlaneGeometry(0.052, 0.020), legenda('BET', 180, 70))
  lblBet.rotation.x = -Math.PI / 2
  lblBet.position.set(xBet, yShelf + 0.001, zLegenda)
  lblBet.castShadow = false
  g.add(lblBet)

  const xDeal = 0.25
  const btnDeal = cyl(0.027, 0.027, 0.022, M.deal, 16)
  btnDeal.position.set(xDeal, yShelf + 0.011, zBotao)
  g.add(btnDeal)
  const lblDeal = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.020), legenda('DEAL / DRAW', 320, 70, 'bold 50px "Trebuchet MS", sans-serif'))
  lblDeal.rotation.x = -Math.PI / 2
  lblDeal.position.set(xDeal, yShelf + 0.001, zLegenda)
  lblDeal.castShadow = false
  g.add(lblDeal)

  // --- moldura da tela, inclinada 20 graus pra tras -----------------------------
  // Group proprio: o pivo fica na base da moldura, ATRAS da fileira de
  // botoes (zBotao) mas perto dela — a PRIMEIRA foto pivotou isto la no fundo
  // da prateleira (perto de shelfZC-SHELF_DEPTH/2, quase 0,3 m atras dos
  // botoes) e a tela parecia flutuar: da camera, dava pra ver a prateleira
  // NUA inteira entre a fileira de botoes e a base da moldura. Pivotar perto
  // dos botoes fecha esse vao.
  const bezel = new THREE.Group()
  bezel.position.set(0, yShelf, zBotao - 0.10)
  bezel.rotation.x = -ANG_TELA
  g.add(bezel)

  // A CAIXA DA MOLDURA DESCE ABAIXO DO PIVO (BEZEL_EXT) DE PROPOSITO: girada
  // -20 graus, uma caixa fina que comeca EXATAMENTE no pivo (y local 0) sobra
  // curta na frente — o canto de baixo-na-frente dela recua pra tras do pivo
  // em vez de descer ate encostar na prateleira, e e ESSE canto que a
  // primeira foto mostrou boiando. Descendo a caixa pra dentro da prateleira/
  // corpo (que ninguem ve, e interior solido) garante que nao sobra vao de
  // NENHUM angulo de camera, sem precisar acertar a decima milimetrica.
  const BEZEL_EXT = 0.10
  const bezW = LARG - 0.04
  // O bisel inteiro fica colado no topo do gabinete, virado pra cima e perto
  // das PointLight do teto — e por causa DESTA caixa (e da do letreiro) que
  // M.borda teve de virar fosco de metalness zero; ver o comentario dele.
  // A frente desta caixa fecha em z=+0,025 (centro -0,03 + meia espessura
  // 0,055).
  bezel.add(box(bezW, H_BEZEL + BEZEL_EXT, 0.11, M.borda, 0, (H_BEZEL - BEZEL_EXT) / 2, -0.03))
  // O ARO INTERNO TINHA A FRENTE DELE EXATAMENTE SOBRE a frente da caixa de
  // cima (as duas fechavam em z=0,025) — duas faces coincidentes competindo
  // pelo mesmo valor de profundidade e o que da o padrao de tracinhos
  // cruzados (z-fighting), que foi o "mosquiteiro" do lado direito da tela na
  // ultima foto. 0,0165 poe a frente do aro em z=0,0265: 1,5 mm a frente da
  // caixa de baixo e 1,5 mm atras da tela (z=0,028) em cima — folga curta,
  // mas ordens de grandeza maior que a precisao de z-buffer nessa distancia.
  bezel.add(box(bezW - 0.05, H_BEZEL - 0.05, 0.02, M.molduraTela, 0, H_BEZEL / 2, 0.0165))

  // a tela de verdade — UNICA nao-fundida do gabinete inteiro (ver o
  // comentario grande no topo do arquivo)
  const tela = criarTelaDeVideoPoker()
  tela.mesh.position.set(0, H_BEZEL / 2, 0.028)
  bezel.add(tela.mesh)

  // vidro de protecao, um triz na frente do vidro da tela
  const vidro = box(TELA_W + 0.02, TELA_H + 0.02, 0.006, M.telaVidro, 0, H_BEZEL / 2, 0.034)
  vidro.castShadow = false
  bezel.add(vidro)

  // --- letreiro, no topo -----------------------------------------------------
  const yTopoBezel = yShelf + H_BEZEL * Math.cos(ANG_TELA)
  const zTopoBezel = bezel.position.z - H_BEZEL * Math.sin(ANG_TELA)
  const yMarquee = yTopoBezel + H_MARQUEE / 2
  const zMarquee = zTopoBezel + 0.08
  // Esta caixa e o topo mais exposto do gabinete inteiro, bem debaixo da
  // PointLight do teto: com o M.borda antigo (roughness 0.45, metalness 0.2)
  // ela saia bege enquanto o MESMO material, mais perto do chao, saia quase
  // preto — a medida que mandou o material inteiro virar fosco.
  g.add(box(LARG, H_MARQUEE, 0.20, M.borda, 0, yMarquee, zMarquee))
  const placa = new THREE.Mesh(
    new THREE.PlaneGeometry(LARG * 0.85, H_MARQUEE * 0.55),
    materialLetreiro(),
  )
  placa.position.set(0, yMarquee, zMarquee + 0.101)
  placa.castShadow = false
  g.add(placa)

  // --- forno + vida ------------------------------------------------------------
  // bakeStatic AQUI, ANTES de userData.update entrar no grupo — ver o
  // comentario grande no topo do arquivo pro porque da ordem importar. A tela
  // (marcada dynamic la em cima) sobrevive sozinha; o resto vira um punhado
  // de meshes fundidos por material.
  bakeStatic(g)

  g.userData.update = (dt) => tela.atualizar(dt)

  return g
}

// ---------------------------------------------------------------------------
// LINHA DE CATALOGO — mesmo formato de mobilia/catalogo.js (entrada
// 'sinuca-bar'). cat e qualidade sao os valores que o dono pediu; o resto
// segue o padrao do arquivo.
// ---------------------------------------------------------------------------
export const VIDEO_POKER = [
  {
    id: 'video-poker', nome: 'Video Poker Valete ou Melhor', cat: 'caca-niquel',
    qualidade: 'fina', preco: 2400, empilha: 1, naCasa: true,
    // 0,58 x 0,54 de gabinete. Largura +0,10 (5 cm de folga de cada lado, pra
    // quem passa do lado nao rocar a quina — mesma ideia da folga lateral da
    // jukebox). Profundidade +0,70 m na frente: e o espaco de quem esta
    // jogando, parado de frente pra tela e pros botoes (o numero que o dono
    // pediu direto, igual os 0,40 m da jukebox pra quem para escolher musica).
    pegada: { larg: 0.68, prof: 1.24 },
    desc: 'Laminado importado, tela sem queima de fosforo, botoes com estalo '
      + 'de fabrica — so a fechadura da porta de moeda que ainda emperra.',
    build: () => gabineteVideoPoker(),
  },
]
