// ---------------------------------------------------------------------------
// src/cassino/poker.js — TEXAS HOLD'EM mano a mano contra o ricaco.
//
// Duas cartas na mao de cada um, cinco no meio da mesa, quatro rodadas de
// aposta: pre-flop, flop (3 cartas), turn (a quarta), river (a quinta).
//
// ISTO SUBSTITUIU UM JOGO INTEIRO, e vale registrar o que caiu porque o
// comentario antigo defendia o contrario. Antes eram DUAS cartas e uma rodada
// so, com uma tabela de premios propria (par > sequencia > naipe > carta alta)
// que estava certa pra duas cartas e nao existe em lugar nenhum fora daqui. A
// razao escrita era "quem entrou no cassino pra dar uma olhada nao precisa
// aprender cinco fases de aposta". O dono pediu o contrario, e com todas as
// letras: "quero que venha o flop de 3 cartas, depois turn, depois river, quero
// esse tipo de poker". Entao a tabela de premios agora e a DE VERDADE, a que o
// jogador ja conhece de fora do jogo, e a mao tem quatro momentos de decisao em
// vez de um.
//
// COMO A MAO E AVALIADA. Sete cartas (duas minhas + cinco da mesa) e a melhor
// combinacao de CINCO entre elas. As 21 combinacoes sao enumeradas na marra —
// ver melhorMao(). Existe algoritmo mais esperto, e ele nao vale o risco aqui:
// isto roda no maximo umas poucas vezes por mao, e um avaliador de 7 cartas
// escrito a mao e exatamente o tipo de codigo que fica errado num canto raro
// (a roda A-2-3-4-5, o flush com seis cartas do mesmo naipe) e ninguem
// descobre. Enumerar e obvio e testavel.
//
// Logica pura: sem DOM, sem three.js, sem carteira. Igual ao blackjack, ELA
// NAO MEXE EM DINHEIRO — 'retorno' diz quanto o jogador recebe e a UI credita.
// ---------------------------------------------------------------------------

import { nomeValor } from './baralho.js'

/** Teto de aumentos POR RODADA. Sem ele, dois jogadores teimosos (e a IA e bem
 *  teimosa com trinca na mao) podem aumentar um por cima do outro pra sempre e
 *  a rodada vira leilao. Tres por rua e o bastante pra ter conversa; com quatro
 *  ruas, uma mao ainda cabe em pouco mais de um minuto. */
export const TETO_AUMENTOS = 3

/** Chance de o NPC apostar forte com mao ruim. 15% e o suficiente pra o
 *  jogador nunca ter certeza — que e o unico motivo de um blefe existir. */
const CHANCE_BLEFE = 0.15

/** As nove categorias do poker de cinco cartas, da pior pra melhor. O indice
 *  E o valor: e ele que entra na chave de comparacao. */
const CATEGORIAS = [
  'carta alta', 'par', 'dois pares', 'trinca',
  'sequencia', 'flush', 'full house', 'quadra', 'straight flush',
]

/** Os nomes das quatro ruas, na ordem em que acontecem. */
export const RUAS = ['pre-flop', 'flop', 'turn', 'river']

/** Quantas cartas a mesa tem em cada rua. O indice e a rua. */
const CARTAS_NA_RUA = [0, 3, 4, 5]

/** As vale 14 pra comparar. O 1 cru so serve pra indexar nome de carta. */
function alto14(r) {
  return r === 1 ? 14 : r
}

/** Caminho de volta: 14 -> 1, pra poder pedir o nome ao baralho. */
function paraRank(v) {
  return v === 14 ? 1 : v
}

/**
 * A CHAVE de uma mao: um inteiro em que comparar dois numeros e comparar duas
 * maos, com desempate completo.
 *
 * base 15 e nao 14 porque o As vale 14 e o digito precisa de um valor a mais
 * que o maior que ele carrega. Cinco digitos de desempate (15^5 = 759.375)
 * cabem folgados abaixo do degrau de categoria, entao categoria NUNCA e
 * invadida por desempate — que e o erro classico deste tipo de codificacao.
 */
function chaveDe(categoria, ordem) {
  let k = categoria
  for (let i = 0; i < 5; i++) k = k * 15 + (ordem[i] || 0)
  return k
}

/**
 * Avalia EXATAMENTE cinco cartas. Devolve { categoria, ordem } onde 'ordem' sao
 * os cinco valores na ordem de desempate — primeiro o que define a categoria,
 * depois os kickers do maior pro menor.
 */
function avaliar5(cinco) {
  const vals = []
  const naipes = []
  for (let i = 0; i < 5; i++) {
    vals.push(alto14(cinco[i].r))
    naipes.push(cinco[i].n)
  }

  const flush = naipes[0] === naipes[1] && naipes[1] === naipes[2] &&
    naipes[2] === naipes[3] && naipes[3] === naipes[4]

  // conta por valor, do maior pro menor
  const conta = new Map()
  for (const v of vals) conta.set(v, (conta.get(v) || 0) + 1)
  // Ordena por QUANTIDADE primeiro e valor depois: e isso que poe a trinca na
  // frente do par num full house e o par na frente do kicker.
  const grupos = [...conta.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]))

  // sequencia: cinco valores distintos e consecutivos
  const unicos = [...conta.keys()].sort((a, b) => b - a)
  let seq = false
  let altoSeq = 0
  if (unicos.length === 5) {
    if (unicos[0] - unicos[4] === 4) { seq = true; altoSeq = unicos[0] }
    // A RODA: A-2-3-4-5, a unica sequencia em que o As vale UM. Sem este caso
    // ela sairia como carta alta de As, que e a mao mais forte da categoria
    // errada — o bug classico do "As dos dois lados".
    else if (unicos[0] === 14 && unicos[1] === 5 && unicos[4] === 2) { seq = true; altoSeq = 5 }
  }

  if (seq && flush) return { categoria: 8, ordem: [altoSeq, 0, 0, 0, 0] }
  if (grupos[0][1] === 4) return { categoria: 7, ordem: [grupos[0][0], grupos[1][0], 0, 0, 0] }
  if (grupos[0][1] === 3 && grupos[1][1] === 2) return { categoria: 6, ordem: [grupos[0][0], grupos[1][0], 0, 0, 0] }
  if (flush) return { categoria: 5, ordem: unicos.concat([0, 0, 0, 0, 0]).slice(0, 5) }
  if (seq) return { categoria: 4, ordem: [altoSeq, 0, 0, 0, 0] }
  if (grupos[0][1] === 3) return { categoria: 3, ordem: [grupos[0][0], grupos[1][0], grupos[2][0], 0, 0] }
  if (grupos[0][1] === 2 && grupos[1][1] === 2) {
    return { categoria: 2, ordem: [grupos[0][0], grupos[1][0], grupos[2][0], 0, 0] }
  }
  if (grupos[0][1] === 2) {
    return { categoria: 1, ordem: [grupos[0][0], grupos[1][0], grupos[2][0], grupos[3][0], 0] }
  }
  return { categoria: 0, ordem: unicos.slice(0, 5) }
}

/** O nome que a faixa mostra. Curto: cabe numa linha de rodape. */
function nomeDe(categoria, ordem) {
  const n = (v) => nomeValor(paraRank(v))
  switch (categoria) {
    case 8: return ordem[0] === 5 ? 'straight flush ate 5' : 'straight flush ate ' + n(ordem[0])
    case 7: return 'quadra de ' + n(ordem[0])
    case 6: return 'full de ' + n(ordem[0]) + ' com ' + n(ordem[1])
    case 5: return 'flush de ' + n(ordem[0])
    case 4: return ordem[0] === 5 ? 'sequencia ate 5' : 'sequencia ate ' + n(ordem[0])
    case 3: return 'trinca de ' + n(ordem[0])
    case 2: return 'dois pares, ' + n(ordem[0]) + ' e ' + n(ordem[1])
    case 1: return 'par de ' + n(ordem[0])
    default: return 'carta alta ' + n(ordem[0])
  }
}

/**
 * A MELHOR MAO DE CINCO dentro de 5 a 7 cartas.
 *
 * Enumera as combinacoes. Com 7 cartas sao 21, com 6 sao 6, com 5 e uma: o
 * custo total de uma mao inteira de poker e menos de cem avaliacoes de cinco
 * cartas, o que nao aparece em profiler nenhum.
 */
export function melhorMao(cartas) {
  const c = Array.isArray(cartas) ? cartas.filter((x) => x && x.r) : []
  if (c.length < 5) return null
  let melhor = null
  const cinco = [0, 0, 0, 0, 0]
  for (let a = 0; a < c.length - 4; a++) {
    for (let b = a + 1; b < c.length - 3; b++) {
      for (let d = b + 1; d < c.length - 2; d++) {
        for (let e = d + 1; e < c.length - 1; e++) {
          for (let f = e + 1; f < c.length; f++) {
            cinco[0] = c[a]; cinco[1] = c[b]; cinco[2] = c[d]; cinco[3] = c[e]; cinco[4] = c[f]
            const r = avaliar5(cinco)
            const chave = chaveDe(r.categoria, r.ordem)
            if (!melhor || chave > melhor.chave) {
              // 'cartas' sao as CINCO que formaram a mao, por referencia. E o que
              // permite a mesa levantar exatamente elas no showdown em vez de
              // levantar a mao inteira: com um par de reis e tres cartas soltas
              // no board, so as cinco que jogam sobem.
              melhor = {
                categoria: r.categoria,
                chave,
                nome: nomeDe(r.categoria, r.ordem),
                cartas: [c[a], c[b], c[d], c[e], c[f]],
              }
            }
          }
        }
      }
    }
  }
  return melhor
}

/**
 * O que a faixa escreve na dica. Existe porque no PRE-FLOP nao ha cinco cartas
 * pra avaliar e melhorMao() devolve null — e a UI precisa de alguma coisa pra
 * mostrar desde a primeira carta, senao a linha pisca vazia e volta.
 */
export function descreverMao(minhas, mesa) {
  const mao = Array.isArray(minhas) ? minhas.filter((c) => c && c.r) : []
  const board = Array.isArray(mesa) ? mesa.filter((c) => c && c.r) : []
  if (!mao.length) return ''
  const f = melhorMao(mao.concat(board))
  if (f) return f.nome
  if (mao.length < 2) return nomeValor(mao[0].r)
  const a = alto14(mao[0].r)
  const b = alto14(mao[1].r)
  const alto = Math.max(a, b)
  const baixo = Math.min(a, b)
  if (a === b) return 'par de ' + nomeValor(mao[0].r)
  const juntas = mao[0].n === mao[1].n ? ' do mesmo naipe' : ''
  return nomeValor(paraRank(alto)) + '-' + nomeValor(paraRank(baixo)) + juntas
}

// --- o nome da mao POR EXTENSO ---------------------------------------------
//
// 'par de K' serve pra uma linha de dica; nao serve pro lugar mais visivel do
// rodape. O pedido foi literal — "vamos deixar ali o jogo que tenho atualmente
// formado, por exemplo para de reis, flush, full house, vamos deixar bem
// destacado" — e "PAR DE REIS" e outra coisa de "PAR DE K": a letra e um
// simbolo pra ler NA CARTA, onde ela esta ao lado do naipe e do desenho; solta
// num rodape ela vira sigla.
//
// Duas listas porque o portugues plural aqui nao e regular o bastante pra uma
// regra ('as' -> 'ases', 'dez' -> 'dezes', 'seis' -> 'seis'), e uma tabela de
// treze palavras e mais curta que a excecao que a regra precisaria.
const EXTENSO = ['', 'as', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete',
  'oito', 'nove', 'dez', 'valete', 'dama', 'rei']
const EXTENSO_PL = ['', 'ases', 'dois', 'tres', 'quatros', 'cincos', 'seis',
  'setes', 'oitos', 'noves', 'dezes', 'valetes', 'damas', 'reis']

/** Nome da carta por extenso. `pl` pede o plural. */
function porExtenso(v, pl) {
  const r = paraRank(v)
  const t = (pl ? EXTENSO_PL : EXTENSO)[r]
  return t || '?'
}

/**
 * O TITULO da mao: o texto grande do rodape, ja em prosa e sem sigla.
 *
 * Difere de nomeDe() em tres coisas, e todas as tres sao do lugar em que ele
 * aparece e nao de gosto: usa a carta por extenso, concorda o plural, e o
 * ROYAL FLUSH ganha nome proprio. Esse ultimo importa: um straight flush ate o
 * as e a melhor mao do poker e chama-lo de "straight flush ate as" seria
 * enterrar a unica mao que o jogador vai querer contar pra alguem.
 */
function tituloDe(categoria, ordem) {
  const s = (v) => porExtenso(v, false)
  const p = (v) => porExtenso(v, true)
  switch (categoria) {
    case 8: return ordem[0] === 14 ? 'royal flush'
      : ordem[0] === 5 ? 'straight flush ate o cinco'
        : 'straight flush ate o ' + s(ordem[0])
    case 7: return 'quadra de ' + p(ordem[0])
    case 6: return 'full house, ' + p(ordem[0]) + ' com ' + p(ordem[1])
    case 5: return 'flush de ' + s(ordem[0])
    case 4: return ordem[0] === 5 ? 'sequencia ate o cinco' : 'sequencia ate o ' + s(ordem[0])
    case 3: return 'trinca de ' + p(ordem[0])
    case 2: return 'dois pares, ' + p(ordem[0]) + ' e ' + p(ordem[1])
    case 1: return 'par de ' + p(ordem[0])
    default: return s(ordem[0]) + ' alto'
  }
}

/**
 * O que o rodape mostra como "meu jogo agora". Devolve texto E categoria,
 * porque quem desenha precisa das duas: o texto pra escrever e a categoria pra
 * decidir o quanto aquilo brilha.
 *
 * No PRE-FLOP nao ha cinco cartas e melhorMao devolve null. Ali o "jogo
 * formado" honesto e o par na mao, quando ha um, e senao as duas cartas com a
 * unica coisa que vale dizer sobre elas antes do flop: se sao do mesmo naipe.
 * Devolver vazio seria pior — a plaqueta piscaria pra dentro e pra fora do
 * rodape a cada mao.
 */
export function tituloMao(minhas, mesa) {
  const mao = Array.isArray(minhas) ? minhas.filter((c) => c && c.r) : []
  const board = Array.isArray(mesa) ? mesa.filter((c) => c && c.r) : []
  if (!mao.length) return { texto: '', categoria: -1 }
  const cinco = mao.concat(board)
  if (cinco.length >= 5) {
    const f = melhorMao(cinco)
    if (f) {
      // melhorMao guarda a chave, e a chave CARREGA a ordem de desempate: os
      // cinco digitos de base 15 sao exatamente o `ordem` que a avaliacao usou.
      // Desempacotar aqui evita que melhorMao passe a alocar um array a mais em
      // cada uma das 21 combinacoes que ela testa por mao.
      const ordem = []
      let k = f.chave
      for (let i = 0; i < 5; i++) { ordem.unshift(k % 15); k = Math.floor(k / 15) }
      return { texto: tituloDe(f.categoria, ordem), categoria: f.categoria }
    }
  }
  if (mao.length < 2) return { texto: porExtenso(alto14(mao[0].r), false), categoria: 0 }
  const a = alto14(mao[0].r)
  const b = alto14(mao[1].r)
  if (a === b) return { texto: 'par de ' + porExtenso(a, true), categoria: 1 }
  const alto = Math.max(a, b)
  const baixo = Math.min(a, b)
  const juntas = mao[0].n === mao[1].n ? ' do mesmo naipe' : ''
  return {
    texto: porExtenso(alto, false) + ' e ' + porExtenso(baixo, false) + juntas,
    categoria: 0,
  }
}

/** Nome da categoria pura, pra tabela de maos da UI. */
export function nomeCategoria(i) {
  return CATEGORIAS[i] || '?'
}

// --- falas do ricaco -------------------------------------------------------
// Ele e o cara de chapeu no fundo da mesa, o que trata a aposta do jogador
// como troco. Todas curtas: cabem num balao de fala sem virar paragrafo.
const FALAS = {
  inicio: ['Senta ai, moleque.', 'Cartas na mesa.', 'Dinheiro nao me falta.'],
  passa: ['Passo. Sem pressa.', 'Nada de mais por aqui.', 'Te dou essa de graca.'],
  aposta: ['Ponho mais um tanto.', 'Isso aqui e trocado.', 'Vamos esquentar.'],
  blefe: ['Confia no chapeu.', 'Voce nao vai querer ver.', 'Tenho o que preciso.'],
  paga: ['Pago pra ver.', 'Voce nao me assusta.', 'Cubro essa.'],
  aumenta: ['Dobro a dose.', 'Agora e dinheiro serio.', 'Ponho mais em cima.'],
  desiste: ['Fica com o troco.', 'Essa eu deixo passar.', 'Nao vale meu tempo.'],
  ganhei: ['Chapeu paga as contas.', 'Facil demais.', 'Volta com mais dinheiro.'],
  perdi: ['Sorte de principiante.', 'Anota, foi so uma.', 'Perdi trocado.'],
  empate: ['Empate. Que sem graca.', 'Dividimos, entao.'],
  vira: ['Vamos ver o que vem.', 'Abre ai.', 'Mostra a proxima.'],
}

// Congelado de proposito: e devolvido por estado() em varios lugares e um
// push() distraido da UI corromperia todas as leituras seguintes. Congelado,
// esse push estoura na hora em vez de virar bug fantasma tres telas depois.
const VAZIO = Object.freeze([])

export function criarPoker(opts = {}) {
  const baralho = opts.baralho
  const sorteio = typeof opts.rng === 'function' ? opts.rng : Math.random
  const ante = Math.max(1, Math.floor(opts.aposta) || 25)
  // npcAutomatico:false faz a maquina PARAR na fase 'npc' esperando agirNpc().
  // Serve pra uma UI que queira mostrar o balao "ele esta pensando" antes de
  // revelar a jogada. Por padrao ele age na hora, porque uma UI que nao sabe
  // do agirNpc() nunca pode ficar com a mao travada.
  const automatico = opts.npcAutomatico !== false

  let npcFichas = Math.max(0, Math.floor(opts.fichasNpc) || 2000)

  let fase = 'aposta'
  let minhas = []
  let dele = []
  let mesa = []               // as comunitarias JA VIRADAS
  let rua = 0                 // 0 pre-flop, 1 flop, 2 turn, 3 river
  let revelado = false
  let pote = 0
  let minhaEntrada = 0        // total meu na mao inteira
  let entradaDele = 0
  // AS ENTRADAS DA RUA sao contas separadas das da mao, e essa separacao e o
  // coracao do Hold'em. 'paraPagar' e a diferenca DESTA rua: quem pagou 200 no
  // flop comeca o turn devendo zero, e sem esse par de variaveis o jogador
  // ficaria pagando de novo, toda rua, o que ja pagou.
  let minhaRua = 0
  let deleRua = 0
  let euAgi = false           // ja agi NESTA rua?
  let eleAgiu = false
  let aumentos = 0            // aumentos NESTA rua
  let fala = ''
  let resultado = null
  let mensagem = 'Pague a ante pra ver as cartas'

  // A ULTIMA COISA QUE O RICACO FEZ, em dado e nao em prosa.
  //
  // Existe porque a UI precisa REAGIR a acao dele — corpo, etiqueta e as fichas
  // saindo do monte — e ate agora ela descobria o que tinha acontecido lendo a
  // frase de `mensagem` com indexOf('apostou'). Isso e fragil de um jeito que
  // nao aparece em teste nenhum: mudar 'Ele apostou. Sua vez' pra 'Ele abriu'
  // apagaria a animacao de aposta e nada quebraria.
  //
  // 'seq' e o que faz a UI conseguir distinguir DUAS acoes iguais em sequencia
  // (ele passa no flop e passa no turn). Comparar o objeto nao serve, comparar
  // {nome,valor} da igual — o contador nao.
  //
  // 'valor' e o que ele acabou de por no pote NESTA acao, nao o total: e o
  // numero que a etiqueta mostra e a altura que a pilha dele cresce.
  let acaoDele = null
  let seqAcao = 0

  /** Registra o que ele fez. Chamada SO de dentro do bloco da IA. */
  function marcarAcao(nome, valor, tudo) {
    seqAcao++
    acaoDele = {
      nome,
      valor: Math.max(0, Math.round(valor || 0)),
      // 'tudo' e all-in: o cofre dele zerou nesta acao. E uma informacao que a
      // UI nao consegue deduzir depois, porque no quadro seguinte ele ja pode
      // ter sido recomposto pela regra do "manda buscar mais".
      tudo: !!tudo,
      seq: seqAcao,
    }
  }

  function frase(tipo) {
    const lista = FALAS[tipo] || FALAS.passa
    return lista[Math.min(lista.length - 1, Math.floor(sorteio() * lista.length))]
  }

  function paraPagar() {
    const d = deleRua - minhaRua
    return d > 0 ? d : 0
  }

  /**
   * Aposta valida: nunca menos que a ante e nunca mais do que o ricaco pode
   * cobrir. Mais nada.
   *
   * A MESA E CASH GAME, e o pedido do dono foi literal: "n quero que limite o
   * quanto pode apostar, tem que ser cash in, entao n pode limitar". Esta
   * funcao ja teve dois tetos artificiais e os dois cairam: limite de pote e
   * depois quatro vezes o pote. O que sobrou e o unico limite honesto de uma
   * mesa de verdade — nao da pra apostar mais do que o adversario tem pra
   * cobrir, porque o excedente seria dinheiro morto no pote. E a regra de
   * "table stakes", e a faixa mostra o numero ('ele tem 4.975') pra ela nunca
   * ser uma recusa sem explicacao.
   */
  function limitarAposta(v) {
    const teto = Math.max(ante, npcFichas)
    const bruto = Math.floor(v)
    if (!Number.isFinite(bruto)) return Math.min(ante, teto)
    return Math.max(Math.min(ante, teto), Math.min(teto, bruto))
  }

  function acoesLegais() {
    if (fase !== 'jogador') return VAZIO
    const falta = paraPagar()
    const lista = []
    const podeSubir = aumentos < TETO_AUMENTOS && npcFichas > 0
    if (falta > 0) {
      lista.push('pagar')
      if (podeSubir) lista.push('aumentar')
    } else {
      lista.push('passar')
      if (podeSubir) lista.push('apostar')
    }
    // Desistir sempre aparece, mesmo sem nada a pagar. E jogada legal (perde o
    // que ja esta no pote), e a UI ganha um botao que nunca some do lugar.
    lista.push('desistir')
    return lista
  }

  /** A rodada de aposta desta rua acabou? So quando os DOIS agiram e as duas
   *  entradas da rua se igualaram. Sem exigir os dois, o 'passo' de abertura do
   *  jogador fecharia a rua antes de o ricaco poder apostar. */
  function ruaFechada() {
    return euAgi && eleAgiu && minhaRua === deleRua
  }

  /** Vira as cartas que faltam pra rua `r`. O flop sai de uma vez; turn e river
   *  saem uma a uma. Quem desenha isso na mesa e a UI, pelo estado(). */
  function abrirMesa(r) {
    const quer = CARTAS_NA_RUA[r] || 0
    while (mesa.length < quer) mesa.push(baralho.pegar())
  }

  function avancarRua() {
    if (rua >= 3) { showdown(); return }
    rua++
    abrirMesa(rua)
    minhaRua = 0
    deleRua = 0
    euAgi = false
    eleAgiu = false
    aumentos = 0
    fala = frase('vira')
    fase = 'jogador'
    // A MENSAGEM FICA VAZIA. O dono mandou tirar o "PRE-FLOP. Sua vez" e o
    // "EMPURRE FICHAS OU PASSE" do rodape: sao dois lugares dizendo o que a
    // mesa ja mostra. A rua continua na tela, no rotulo do pote ("POTE NO
    // FLOP"), e de quem e a vez se ve pelos botoes que acendem.
    mensagem = ''
  }

  /** Uma acao terminou: ou a rua fecha e a proxima carta vem, ou a vez passa. */
  function seguir(quemAgiu) {
    if (ruaFechada()) { avancarRua(); return }
    if (quemAgiu === 'eu') {
      fase = 'npc'
      mensagem = 'Ele esta pensando...'
      if (automatico) agirNpc()
    } else {
      fase = 'jogador'
    }
  }

  /**
   * Onde cada carta de uma combinacao esta, em INDICE DE FILA.
   *
   * A mesa 3D nao conhece carta, conhece "a terceira da fila do meio". Traduzir
   * aqui e o que deixa o destaque do showdown ser uma chamada boba la
   * (realcar('mesa', [0,2,4])) em vez de a UI ter que casar carta com carta.
   * A comparacao e por valor+naipe porque o baralho e de UM deck: nao existe
   * carta repetida numa mao, entao valor+naipe e identidade.
   */
  function ondeEstao(combo) {
    const ache = (lista) => {
      const out = []
      for (let i = 0; i < lista.length; i++) {
        for (let k = 0; k < combo.length; k++) {
          const c = combo[k]
          if (c && lista[i] && c.r === lista[i].r && c.n === lista[i].n) { out.push(i); break }
        }
      }
      return out
    }
    return { eu: ache(minhas), mesa: ache(mesa), ele: ache(dele) }
  }

  function showdown() {
    revelado = true
    // No showdown as CINCO cartas da mesa existem mesmo que a rua tenha
    // acabado antes (all-in, por exemplo): sem isso, duas maos de duas cartas
    // seriam comparadas com regra de cinco e o resultado nao faria sentido.
    abrirMesa(3)
    const minha = melhorMao(minhas.concat(mesa))
    const dela = melhorMao(dele.concat(mesa))

    let tipo
    let retorno
    if (minha.chave > dela.chave) {
      tipo = 'ganhou'
      retorno = pote
    } else if (minha.chave < dela.chave) {
      tipo = 'perdeu'
      retorno = 0
      npcFichas += pote
    } else {
      // Empate devolve o que cada um pos, sem divisao e sem arredondamento:
      // 'pote' e sempre minhaEntrada + entradaDele, entao devolver a propria
      // entrada e exato mesmo quando um dos dois entrou com menos.
      tipo = 'empate'
      retorno = minhaEntrada
      npcFichas += pote - minhaEntrada
    }

    // O DESTAQUE E SEMPRE DA MAO QUE GANHOU. No empate as duas ganharam, entao
    // as duas sobem — e o board, que e comum, sobe uma vez so (a uniao).
    const destaque = ondeEstao(tipo === 'perdeu' ? dela.cartas : minha.cartas)
    if (tipo === 'empate') {
      const outro = ondeEstao(dela.cartas)
      destaque.ele = outro.ele
      destaque.mesa = [...new Set(destaque.mesa.concat(outro.mesa))].sort((x, y) => x - y)
    }
    resultado = { tipo, retorno, minhaMao: minha, maoDele: dela, destaque }
    fala = frase(tipo === 'ganhou' ? 'perdi' : tipo === 'perdeu' ? 'ganhei' : 'empate')
    mensagem = tipo === 'ganhou' ? 'Voce leva ' + retorno + ' — ' + minha.nome
      : tipo === 'perdeu' ? 'Ele leva o pote — ' + dela.nome
        : 'Empate em ' + minha.nome
    fase = 'fim'
  }

  function eleDesiste() {
    fase = 'fim'
    fala = frase('desiste')
    marcarAcao('desistiu', 0)
    resultado = {
      tipo: 'ele-desistiu',
      retorno: pote,
      minhaMao: melhorMao(minhas.concat(mesa)),
      // Quem corre nao mostra. E a regra da mesa e tambem o que impede o
      // jogador de aprender a ler a IA olhando as maos que ela larga.
      maoDele: null,
    }
    mensagem = 'Ele correu. O pote e seu: ' + pote
  }

  // --- IA-NPC-INICIO ---------------------------------------------------------
  // A IA DECIDE OLHANDO SO PRA `dele` (a mao DELA), PRA `mesa` (que e publica) E
  // PROS NUMEROS DO POTE.
  // NUNCA leia `minhas` daqui pra baixo ate o marcador de fim. Um NPC que
  // espia as cartas do jogador nao joga melhor: ele joga PERFEITO, e um
  // adversario perfeito nao e dificil, e chato — ele desiste toda vez que o
  // jogador tem mao boa e paga toda vez que tem mao ruim, e o jogador percebe
  // isso em cinco maos e para de jogar. E a primeira coisa que alguem quebra
  // ao "melhorar a IA" aqui.
  // O teste tools/teste-cassino.mjs le este bloco e falha se a palavra
  // 'minhas' aparecer dentro dele.

  /**
   * Nota 0..1 da mao DELE na rua atual.
   *
   * Pre-flop nao ha cinco cartas pra avaliar, entao vale uma regra de bolso —
   * par, cartas altas, mesmo naipe, conectadas — que e como qualquer jogador
   * humano decide antes do flop. Do flop em diante a nota vem da CATEGORIA da
   * melhor mao, com uma faixa por categoria.
   *
   * O QUE ESTA NOTA NAO SABE: que um par formado pela MESA vale pouco, porque o
   * adversario tem o mesmo par. Isso deixa a IA um pouco otimista com board
   * pairs — e um erro conhecido e barato: ele paga um pouco demais, o que e o
   * jeito certo de errar num adversario de cassino.
   */
  function notaDele() {
    if (mesa.length < 3) {
      const a = alto14(dele[0].r)
      const b = alto14(dele[1].r)
      const alto = Math.max(a, b)
      const baixo = Math.min(a, b)
      if (a === b) return 0.62 + (alto / 14) * 0.30
      let n = 0.10 + (alto / 14) * 0.28 + (baixo / 14) * 0.10
      if (dele[0].n === dele[1].n) n += 0.08
      if (alto - baixo === 1) n += 0.06
      return Math.min(0.92, n)
    }
    const f = melhorMao(dele.concat(mesa))
    if (!f) return 0.2
    // As faixas nao se tocam: a pior trinca tem que valer mais que o melhor
    // dois pares, senao a IA fica agressiva com a mao errada e joga fora da
    // ordem do proprio jogo.
    const BASE = [0.05, 0.34, 0.52, 0.64, 0.74, 0.82, 0.88, 0.94, 0.99]
    const LARG = [0.26, 0.16, 0.10, 0.08, 0.06, 0.04, 0.04, 0.03, 0.01]
    // A parte fracionaria da chave dentro da categoria, normalizada. 15^5 e o
    // tamanho de um degrau de categoria (ver chaveDe).
    const dentro = (f.chave % 759375) / 759375
    return Math.min(0.999, BASE[f.categoria] + LARG[f.categoria] * dentro)
  }

  function agirNpc() {
    if (fase !== 'npc') return false
    const forca = notaDele()
    const blefe = sorteio() < CHANCE_BLEFE
    const falta = minhaRua - deleRua

    function poe(v) {
      const real = Math.max(0, Math.min(v, npcFichas))
      deleRua += real
      entradaDele += real
      pote += real
      npcFichas -= real
      return real
    }

    if (falta <= 0) {
      // Ninguem apostou nesta rua. Ele abre com mao boa, ou de vez em quando
      // com nada. O tamanho sobe com a rua: apostar 75% do pote no river e
      // outra conversa que apostar 75% no pre-flop.
      const podeAbrir = aumentos < TETO_AUMENTOS && npcFichas > 0
      if (podeAbrir && (forca >= 0.62 || blefe)) {
        const posto = poe(Math.max(ante, Math.round(pote * (blefe ? 0.5 : 0.75))))
        aumentos++
        eleAgiu = true
        euAgi = false
        fala = frase(blefe ? 'blefe' : 'aposta')
        marcarAcao('apostou', posto, npcFichas <= 0)
        fase = 'jogador'
        mensagem = 'Ele apostou. Sua vez'
      } else {
        eleAgiu = true
        fala = frase('passa')
        marcarAcao('passou', 0)
        if (ruaFechada()) avancarRua()
        else { fase = 'jogador'; mensagem = 'Ele passou. Sua vez' }
      }
      return true
    }

    // Tem aposta na mesa. A conta de pagar e a mesma de qualquer poker: o que
    // falta pagar vale a pena se a nota da mao for maior que a fatia do pote
    // que esse pagamento representa.
    const odds = falta / (pote + falta)

    if (forca >= 0.82 && aumentos < TETO_AUMENTOS && npcFichas > falta) {
      const posto = poe(falta + Math.max(ante, Math.round(pote * 0.6)))
      aumentos++
      eleAgiu = true
      euAgi = false
      fala = frase('aumenta')
      marcarAcao('aumentou', posto, npcFichas <= 0)
      fase = 'jogador'
      mensagem = 'Ele aumentou. Sua vez'
      return true
    }

    if (forca >= odds + 0.12 || (blefe && falta <= pote * 0.5)) {
      const posto = poe(falta)
      eleAgiu = true
      fala = frase('paga')
      marcarAcao('pagou', posto, npcFichas <= 0)
      // Pagar iguala a rua. Se eu ja agi, a rua fecha e a proxima carta vem —
      // no river isso e o showdown.
      if (ruaFechada()) avancarRua()
      else { fase = 'jogador'; mensagem = 'Ele pagou. Sua vez' }
      return true
    }

    eleDesiste()
    return true
  }
  // --- IA-NPC-FIM ------------------------------------------------------------

  const api = {
    get ante() { return ante },
    get apostaMinima() { return limitarAposta(ante) },
    get apostaMaxima() { return limitarAposta(Number.MAX_SAFE_INTEGER) },

    /** Snapshot. Aloca — chame depois de uma acao, nao a cada quadro. */
    estado() {
      return {
        fase,
        rua,
        nomeRua: RUAS[rua] || '',
        minhas: minhas.slice(),
        // 'dele' so aparece no showdown. Mesma regra da carta escondida do
        // blackjack: segredo escondido no DADO, nao no desenho.
        dele: revelado ? dele.slice() : VAZIO,
        mesa: mesa.slice(),
        pote,
        minhaEntrada,
        entradaDele,
        minhaRua,
        deleRua,
        paraPagar: paraPagar(),
        fichasNpc: npcFichas,
        aumentos,
        acoes: acoesLegais(),
        fala,
        acaoDele,
        resultado,
        mensagem,
      }
    },

    /**
     * Reparte. A UI ja debitou a ante do jogador antes de chamar — aqui a ante
     * so entra na conta do pote.
     */
    comecar() {
      if (fase !== 'aposta' && fase !== 'fim') return false
      if (baralho.precisaEmbaralhar && typeof baralho.embaralhar === 'function') {
        baralho.embaralhar()
      }

      // O ricaco nunca quebra: se o cofre secou, ele "manda buscar mais". E
      // coerente com o personagem e evita a mesa morta, que e o que acontece
      // se o NPC zerar e o jogador ficar com um botao de jogar que nao joga.
      // O gatilho e alto porque a banca dele e o TETO DA APOSTA: sem limite de
      // pote, o maximo que o jogador pode empurrar e o que ele tem pra cobrir.
      if (npcFichas < ante * 40) npcFichas += 4000

      minhas = [baralho.pegar(), baralho.pegar()]
      dele = [baralho.pegar(), baralho.pegar()]
      mesa = []
      rua = 0
      revelado = false

      // A ANTE E A ENTRADA DA PRIMEIRA RUA, e nao um pagamento a parte. Contada
      // como entrada de rua, os dois comecam empatados e o pre-flop abre com
      // 'passar' disponivel — que e o que se espera de uma mesa em que os dois
      // pagaram o mesmo pra entrar.
      minhaEntrada = ante
      entradaDele = Math.min(ante, npcFichas)
      npcFichas -= entradaDele
      minhaRua = minhaEntrada
      deleRua = entradaDele
      pote = minhaEntrada + entradaDele

      aumentos = 0
      euAgi = false
      eleAgiu = false
      resultado = null
      // A mao nova nasce sem acao dele. Deixar a ultima acao da mao anterior
      // aqui faria a UI, que reage a mudanca de `seq`, nao repetir a animacao
      // — mas faria a etiqueta "ELE PAGOU 200" nascer junto com as cartas.
      acaoDele = null
      fala = frase('inicio')
      fase = 'jogador'
      mensagem = ''
      return true
    },

    passar() {
      if (fase !== 'jogador' || paraPagar() > 0) return false
      euAgi = true
      seguir('eu')
      return true
    },

    apostar(v) {
      if (fase !== 'jogador' || paraPagar() > 0) return false
      if (aumentos >= TETO_AUMENTOS || npcFichas <= 0) return false
      const val = limitarAposta(v)
      minhaEntrada += val
      minhaRua += val
      pote += val
      aumentos++
      euAgi = true
      // Ele TEM que responder: apostar reabre a rua pra ele mesmo que ele ja
      // tenha passado antes.
      eleAgiu = false
      seguir('eu')
      return true
    },

    /** Pagar iguala a rua. Se ele ja agiu, a rua fecha aqui — no river isso e o
     *  showdown, nas outras e a carta seguinte. */
    pagar() {
      if (fase !== 'jogador') return false
      const falta = paraPagar()
      if (falta <= 0) return false
      minhaEntrada += falta
      minhaRua += falta
      pote += falta
      euAgi = true
      seguir('eu')
      return true
    },

    aumentar(v) {
      if (fase !== 'jogador') return false
      const falta = paraPagar()
      if (falta <= 0) return false
      if (aumentos >= TETO_AUMENTOS || npcFichas <= 0) return false
      const extra = limitarAposta(v)
      minhaEntrada += falta + extra
      minhaRua += falta + extra
      pote += falta + extra
      aumentos++
      euAgi = true
      eleAgiu = false
      seguir('eu')
      return true
    },

    desistir() {
      if (fase !== 'jogador') return false
      fase = 'fim'
      npcFichas += pote
      fala = frase('ganhei')
      resultado = {
        tipo: 'desistiu',
        retorno: 0,
        minhaMao: melhorMao(minhas.concat(mesa)),
        maoDele: null,
      }
      mensagem = 'Voce correu. O pote ficou com ele'
      return true
    },

    /**
     * Quanto a UI precisa DEBITAR pela proxima acao. Sem argumento devolve o
     * custo de PAGAR, que e o caso comum. Com argumento da pra perguntar por
     * qualquer acao antes de mexer na carteira:
     *   custoExtra('apostar', 50)  custoExtra('aumentar', 50)  custoExtra()
     */
    custoExtra(acao, v) {
      if (fase !== 'jogador') return 0
      if (acao === 'apostar') return limitarAposta(v)
      if (acao === 'aumentar') return paraPagar() + limitarAposta(v)
      if (acao === 'passar' || acao === 'desistir') return 0
      return paraPagar()
    },

    /** So faz alguma coisa com npcAutomatico:false. Com o padrao, o ricaco ja
     *  jogou antes de estado() ser lido. */
    agirNpc,

    reiniciar() {
      fase = 'aposta'
      minhas = []
      dele = []
      mesa = []
      rua = 0
      revelado = false
      pote = 0
      minhaEntrada = 0
      entradaDele = 0
      minhaRua = 0
      deleRua = 0
      euAgi = false
      eleAgiu = false
      aumentos = 0
      resultado = null
      fala = ''
      mensagem = 'Pague a ante pra ver as cartas'
    },
  }

  return api
}

export default criarPoker
