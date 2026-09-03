// ---------------------------------------------------------------------------
// src/cassino/poker.js — poker de DUAS cartas, mano a mano contra o ricaco.
//
// Nao e Texas Hold'em: nao existe mesa comunitaria, nao existe flop. Cada um
// recebe duas cartas e aposta em cima delas. A escolha e proposital — sem
// cartas comunitarias a mao inteira cabe em dois cliques, e o jogador que
// entrou no cassino pra dar uma olhada nao precisa aprender cinco fases de
// aposta pra jogar uma mao.
//
// A ORDEM DAS CATEGORIAS E DE PROPOSITO DIFERENTE DO POKER DE VERDADE:
//
//     par  >  sequencia  >  naipe  >  carta alta
//
// No poker de 5 cartas o flush ganha da sequencia porque flush e mais raro.
// Com DUAS cartas a raridade inverte. Contando as 1326 maos do baralho e
// classificando cada uma como forcaDaMao() classifica de verdade (sequencia do
// mesmo naipe cai em SEQUENCIA, nao em naipe), da:
//
//     par 78 (5,9%)   sequencia 208 (15,7%)   naipe 260 (19,6%)   alta 780 (58,8%)
//
// Sequencia e mesmo mais rara que naipe, entao a ordem esta certa — mas os dois
// numeros que a gente cita de cabeca aqui estao errados e induzem a mexer:
//   - "mesmo naipe = 12/51 = 23,5%" e a chance CRUA de duas cartas do mesmo
//     naipe; ela ainda inclui as 52 sequencias do mesmo naipe, que nesta funcao
//     nao sao naipe. A categoria 'naipe' de verdade e 260/1326 = 19,6%.
//   - "sequencia = 14,5%" so vale contando 12 pares de valores vizinhos
//     (192 maos), ou seja, esquecendo que o As fecha dos DOIS lados. Aqui A-K
//     tambem e sequencia, sao 13 pares, 208 maos, 15,7%.
//
// Manter a ordem do poker de 5 aqui pagaria melhor pela mao mais comum — que e
// exatamente o contrario do que uma tabela de premios deve fazer. Quem mexer
// nisso depois: a ordem esta certa, ela so parece errada.
//
// Logica pura: sem DOM, sem three.js, sem carteira. Igual ao blackjack, ELA
// NAO MEXE EM DINHEIRO — 'retorno' diz quanto o jogador recebe e a UI credita.
// ---------------------------------------------------------------------------

import { nomeValor } from './baralho.js'

/** Teto de aumentos por mao. Sem ele, dois jogadores teimosos (e a IA e bem
 *  teimosa com par na mao) podem aumentar um por cima do outro pra sempre e a
 *  mao vira leilao. Tres e o bastante pra ter conversa e pouco o bastante pra
 *  a mao caber em meio minuto. */
export const TETO_AUMENTOS = 3

/** Chance de o NPC apostar forte com mao ruim. 15% e o suficiente pra o
 *  jogador nunca ter certeza — que e o unico motivo de um blefe existir. */
const CHANCE_BLEFE = 0.15

const CATEGORIAS = ['carta alta', 'naipe', 'sequencia', 'par']

/** As vale 14 pra comparar. O 1 cru so serve pra indexar nome de carta. */
function alto14(r) {
  return r === 1 ? 14 : r
}

/** Caminho de volta: 14 -> 1, pra poder pedir o nome ao baralho. */
function paraRank(v) {
  return v === 14 ? 1 : v
}

/**
 * Forca de uma mao de duas cartas.
 *
 * 'chave' e um inteiro comparavel: categoria * 10000 + alto * 100 + baixo.
 * As tres faixas nunca se invadem porque alto e baixo cabem em 14 (1400 + 14 =
 * 1414, bem abaixo dos 10000 de um degrau de categoria). Comparar duas maos e
 * comparar dois numeros, e a ordem e TOTAL: chave igual so acontece quando as
 * maos tem mesma categoria e mesmos dois valores — e ai elas sao mesmo
 * equivalentes, porque naipe nao tem hierarquia.
 */
export function forcaDaMao(a, b) {
  const va = alto14(a.r)
  const vb = alto14(b.r)
  let alto = va > vb ? va : vb
  let baixo = va > vb ? vb : va

  const par = va === vb
  const mesmoNaipe = a.n === b.n

  // Sequencia: dois valores vizinhos. O As fecha dos DOIS lados — A-K por cima
  // e A-2 por baixo.
  let seq = alto - baixo === 1
  if (!seq && alto === 14 && baixo === 2) {
    seq = true
    // Aqui o As passa a valer 1 pra montar a chave. Sem essa troca, A-2 sairia
    // com alto=14 e ficaria ACIMA de K-Q na comparacao — a sequencia mais
    // fraca do jogo ganhando da segunda mais forte. E o bug classico do "As
    // dos dois lados": lembrar que ele e alto e facil, lembrar de rebaixa-lo
    // quando ele fecha por baixo e que ninguem faz.
    alto = 2
    baixo = 1
  }

  let categoria
  if (par) categoria = 3
  else if (seq) categoria = 2
  else if (mesmoNaipe) categoria = 1
  else categoria = 0

  // Sequencia do mesmo naipe (A♠K♠) cai em 'sequencia' e nao ganha degrau
  // extra: sao so quatro categorias, e inventar uma quinta aqui quebraria a
  // tabela de premios que a UI desenha a partir de CATEGORIAS.

  let nome
  if (categoria === 3) nome = 'par de ' + nomeValor(a.r)
  else if (categoria === 2) nome = 'sequencia ' + nomeValor(paraRank(Math.max(va, vb))) + '-' + nomeValor(paraRank(Math.min(va, vb)))
  else if (categoria === 1) nome = 'naipe ' + nomeValor(paraRank(alto)) + '-' + nomeValor(paraRank(baixo))
  else nome = 'carta alta ' + nomeValor(paraRank(alto))

  return { categoria, nome, chave: categoria * 10000 + alto * 100 + baixo }
}

/** Nome da categoria pura, pra tabela de premios da UI. */
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
  let revelado = false
  let pote = 0
  let minhaEntrada = 0
  let entradaDele = 0
  let aumentos = 0
  let euPassei = false
  let elePassou = false
  let fala = ''
  let resultado = null
  let mensagem = 'Pague a ante pra ver as cartas'

  function frase(tipo) {
    const lista = FALAS[tipo] || FALAS.passa
    return lista[Math.min(lista.length - 1, Math.floor(sorteio() * lista.length))]
  }

  function paraPagar() {
    const d = entradaDele - minhaEntrada
    return d > 0 ? d : 0
  }

  /**
   * Aposta valida: nunca menos que a ante, nunca mais do que o ricaco pode
   * cobrir (senao o pote fica com dinheiro morto) e nunca mais do que QUATRO
   * VEZES o pote.
   *
   * ERA LIMITE DE POTE — teto = min(pote, npcFichas) — e a razao escrita era
   * "evita o all-in que acaba com a noite em uma mao". O TETO_AUMENTOS de 3
   * ja evitava isso sozinho, e o limite de pote cobrava um preco que so
   * apareceu quando as fichas viraram objeto na mesa: com ante 25, o pote
   * abre em 50 e a aposta maxima era 50, entao as pilhas de 100, 250 e 500 do
   * caixote nunca podiam ser empurradas. Uma mesa que mostra cinco pilhas e so
   * aceita duas nao e uma regra, e uma promessa quebrada.
   *
   * Quatro vezes o pote deixa a escalada acontecer (50 -> 200 -> 1000) sem
   * virar "aposto tudo na primeira" — e o all-in continua existindo, agora
   * limitado pelo que o adversario tem, que e o limite honesto de uma mesa.
   */
  function limitarAposta(v) {
    const teto = Math.max(ante, Math.min(pote * 4, npcFichas))
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
    // Desistir sempre aparece, mesmo sem nada a pagar. E jogada legal (perde a
    // ante), e a UI ganha um botao que nunca some do lugar.
    lista.push('desistir')
    return lista
  }

  function showdown() {
    fase = 'showdown'
    revelado = true
    const minha = forcaDaMao(minhas[0], minhas[1])
    const dela = forcaDaMao(dele[0], dele[1])

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

    resultado = { tipo, retorno, minhaMao: minha, maoDele: dela }
    fala = frase(tipo === 'ganhou' ? 'perdi' : tipo === 'perdeu' ? 'ganhei' : 'empate')
    mensagem = tipo === 'ganhou' ? 'Voce leva ' + retorno + ' — ' + minha.nome
      : tipo === 'perdeu' ? 'Ele leva o pote — ' + dela.nome
        : 'Empate em ' + minha.nome
    fase = 'fim'
  }

  function eleDesiste() {
    fase = 'fim'
    fala = frase('desiste')
    resultado = {
      tipo: 'ele-desistiu',
      retorno: pote,
      minhaMao: forcaDaMao(minhas[0], minhas[1]),
      // Quem corre nao mostra. E a regra da mesa e tambem o que impede o
      // jogador de aprender a ler a IA olhando as maos que ela larga.
      maoDele: null,
    }
    mensagem = 'Ele correu. O pote e seu: ' + pote
  }

  // --- IA-NPC-INICIO ---------------------------------------------------------
  // A IA DECIDE OLHANDO SO PRA `dele` (a mao DELA) E PROS NUMEROS DO POTE.
  // NUNCA leia `minhas` daqui pra baixo ate o marcador de fim. Um NPC que
  // espia as cartas do jogador nao joga melhor: ele joga PERFEITO, e um
  // adversario perfeito nao e dificil, e chato — ele desiste toda vez que o
  // jogador tem mao boa e paga toda vez que tem mao ruim, e o jogador percebe
  // isso em cinco maos e para de jogar. E a primeira coisa que alguem quebra
  // ao "melhorar a IA" aqui.
  // O teste tools/teste-cassino.mjs le este bloco e falha se a palavra
  // 'minhas' aparecer dentro dele.

  /** Traduz a chave da mao pra uma nota 0..1. Nao da pra usar chave/31414
   *  direto: quase toda mao e carta alta e cairia perto de zero, e a IA
   *  desistiria de tudo. Cada categoria ganha a propria faixa. */
  function nota(f) {
    // As faixas nao podem se tocar: a pior sequencia tem que valer mais que o
    // melhor naipe, senao a IA fica agressiva com flush e passiva com trinca —
    // e joga na ordem errada do proprio jogo.
    const escala = (f.chave % 10000) / 1414
    if (f.categoria === 3) return 0.80 + 0.20 * escala
    if (f.categoria === 2) return 0.55 + 0.20 * escala
    if (f.categoria === 1) return 0.38 + 0.15 * escala
    return 0.05 + 0.30 * escala
  }

  function agirNpc() {
    if (fase !== 'npc') return false
    const forca = nota(forcaDaMao(dele[0], dele[1]))
    const blefe = sorteio() < CHANCE_BLEFE
    const falta = minhaEntrada - entradaDele

    function poe(v) {
      const real = Math.max(0, Math.min(v, npcFichas))
      entradaDele += real
      pote += real
      npcFichas -= real
      return real
    }

    if (falta <= 0) {
      // Ninguem apostou. Ele abre com mao boa, ou de vez em quando com nada.
      const podeAbrir = aumentos < TETO_AUMENTOS && npcFichas > 0
      if (podeAbrir && (forca >= 0.62 || blefe)) {
        poe(Math.max(ante, Math.round(pote * (blefe ? 0.5 : 0.75))))
        aumentos++
        euPassei = false
        elePassou = false
        fala = frase(blefe ? 'blefe' : 'aposta')
        fase = 'jogador'
        mensagem = 'Ele apostou. Sua vez'
      } else {
        elePassou = true
        fala = frase('passa')
        if (euPassei) showdown()
        else { fase = 'jogador'; mensagem = 'Ele passou. Sua vez' }
      }
      return true
    }

    // Tem aposta na mesa. A conta de pagar e a mesma de qualquer poker: o que
    // falta pagar vale a pena se a nota da mao for maior que a fatia do pote
    // que esse pagamento representa.
    const odds = falta / (pote + falta)

    if (forca >= 0.82 && aumentos < TETO_AUMENTOS && npcFichas > falta) {
      poe(falta + Math.max(ante, Math.round(pote * 0.6)))
      aumentos++
      euPassei = false
      fala = frase('aumenta')
      fase = 'jogador'
      mensagem = 'Ele aumentou. Sua vez'
      return true
    }

    if (forca >= odds + 0.12 || (blefe && falta <= pote * 0.5)) {
      poe(falta)
      fala = frase('paga')
      showdown()
      return true
    }

    eleDesiste()
    return true
  }
  // --- IA-NPC-FIM ------------------------------------------------------------

  function passarAVez() {
    fase = 'npc'
    mensagem = 'Ele esta pensando...'
    if (automatico) agirNpc()
  }

  const api = {
    get ante() { return ante },
    get apostaMinima() { return limitarAposta(ante) },
    get apostaMaxima() { return limitarAposta(Number.MAX_SAFE_INTEGER) },

    /** Snapshot. Aloca — chame depois de uma acao, nao a cada quadro. */
    estado() {
      return {
        fase,
        minhas: minhas.slice(),
        // 'dele' so aparece no showdown. Mesma regra da carta escondida do
        // blackjack: segredo escondido no DADO, nao no desenho.
        dele: revelado ? dele.slice() : VAZIO,
        pote,
        minhaEntrada,
        entradaDele,
        paraPagar: paraPagar(),
        fichasNpc: npcFichas,
        aumentos,
        acoes: acoesLegais(),
        fala,
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
      if (npcFichas < ante * 20) npcFichas += 2000

      minhas = [baralho.pegar(), baralho.pegar()]
      dele = [baralho.pegar(), baralho.pegar()]
      revelado = false

      minhaEntrada = ante
      entradaDele = Math.min(ante, npcFichas)
      npcFichas -= entradaDele
      pote = minhaEntrada + entradaDele

      aumentos = 0
      euPassei = false
      elePassou = false
      resultado = null
      fala = frase('inicio')
      fase = 'jogador'
      mensagem = 'Sua vez'
      return true
    },

    passar() {
      if (fase !== 'jogador' || paraPagar() > 0) return false
      euPassei = true
      if (elePassou) showdown()
      else passarAVez()
      return true
    },

    apostar(v) {
      if (fase !== 'jogador' || paraPagar() > 0) return false
      if (aumentos >= TETO_AUMENTOS || npcFichas <= 0) return false
      const val = limitarAposta(v)
      minhaEntrada += val
      pote += val
      aumentos++
      euPassei = false
      elePassou = false
      passarAVez()
      return true
    },

    /** Pagar FECHA a rodada: iguala e vai pro showdown. E o que faz a mao ter
     *  fim garantido — sem isso, dois "pago" seguidos ficariam girando. */
    pagar() {
      if (fase !== 'jogador') return false
      const falta = paraPagar()
      if (falta <= 0) return false
      minhaEntrada += falta
      pote += falta
      showdown()
      return true
    },

    aumentar(v) {
      if (fase !== 'jogador') return false
      const falta = paraPagar()
      if (falta <= 0) return false
      if (aumentos >= TETO_AUMENTOS || npcFichas <= 0) return false
      const extra = limitarAposta(v)
      minhaEntrada += falta + extra
      pote += falta + extra
      aumentos++
      elePassou = false
      passarAVez()
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
        minhaMao: forcaDaMao(minhas[0], minhas[1]),
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
      revelado = false
      pote = 0
      minhaEntrada = 0
      entradaDele = 0
      aumentos = 0
      euPassei = false
      elePassou = false
      resultado = null
      fala = ''
      mensagem = 'Pague a ante pra ver as cartas'
    },
  }

  return api
}

export default criarPoker
