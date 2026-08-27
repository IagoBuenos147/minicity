// ---------------------------------------------------------------------------
// src/cassino/baralho.js — o sapato de cartas do cassino.
//
// Um cassino de verdade nao usa um baralho: usa um SAPATO com varios baralhos
// misturados. Isso importa pra o jogo em duas coisas concretas:
//
//   1) contar carta fica inutil. Com 6 baralhos o jogador nao consegue deduzir
//      nada olhando a mesa, e o blackjack volta a ser uma decisao de risco em
//      vez de uma decisao de memoria — que e o que a gente quer que ele sinta.
//   2) o sapato REEMBARALHA sozinho quando acaba. Nunca existe o estado "o
//      baralho zerou no meio da mao" — se o dealer precisa de uma carta, ele
//      recebe uma carta. Quem chama pegar() nunca leva undefined.
//
// CARTA e { r, n }: 'r' e o valor cru 1..13 (1=As, 11=J, 12=Q, 13=K) e 'n' e o
// INDICE do naipe dentro de NAIPES. Guardar dois inteiros em vez de strings faz
// diferenca em todo lugar depois: comparar naipe vira a.n === b.n, comparar
// valor vira aritmetica, e a UI so consulta a tabela quando vai desenhar.
//
// Logica pura: nada de DOM, nada de three.js, nada de localStorage. E por isso
// que tools/teste-cassino.mjs consegue rodar isso no Node sem navegador.
// ---------------------------------------------------------------------------

/** Os quatro naipes, na ordem em que 'n' indexa.
 *  'vermelho' existe porque a UI pinta a carta a partir daqui — ela nunca
 *  deveria precisar saber que copas e ouros sao os vermelhos. */
export const NAIPES = [
  { id: 'espadas', simbolo: '♠', vermelho: false },
  { id: 'copas', simbolo: '♥', vermelho: true },
  { id: 'ouros', simbolo: '♦', vermelho: true },
  { id: 'paus', simbolo: '♣', vermelho: false },
]

// Indice 0 fica vazio de proposito: assim NOMES[r] le direto pelo valor cru da
// carta, sem um -1 espalhado por todo canto que le nome de carta.
const NOMES = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/**
 * A carta virada pra baixo. Nao e uma carta do baralho: e o BURACO no lugar de
 * uma, que os jogos devolvem quando existe uma carta ali que quem esta olhando
 * nao pode ver (a segunda do dealer no blackjack).
 *
 * Existir como valor concreto e o que faz o segredo ser inviolavel: quem le o
 * estado recebe um objeto que nao carrega a carta de verdade, entao nao ha
 * como vazar por descuido. Desenhar da certo sem tratamento especial —
 * cartaTexto() devolve '?' e r:0 nao soma ponto nenhum em valorMao().
 * 'oculta: true' esta ai pra a UI escolher desenhar o verso em vez do '?'.
 */
export const CARTA_OCULTA = Object.freeze({ r: 0, n: -1, oculta: true })

/** 'A', '2'..'10', 'J', 'Q', 'K' a partir do valor cru 1..13. */
export function nomeValor(r) {
  return NOMES[r] || '?'
}

/** Texto curto pra desenhar na carta: 'A♠', '10♥'. Carta virada da '?'. */
export function cartaTexto(c) {
  if (!c) return ''
  if (c.oculta || !c.r) return '?'
  const naipe = NAIPES[c.n]
  return nomeValor(c.r) + (naipe ? naipe.simbolo : '')
}

/**
 * Cria o sapato. 'rng' e opcional e serve pra o teste: passando um gerador
 * deterministico a mesma semente da sempre a mesma sequencia de cartas, e ai
 * da pra escrever "com essa mao o dealer PRECISA parar em 17" e provar.
 */
export function criarBaralho(nBaralhos = 6, rng) {
  const sorteio = typeof rng === 'function' ? rng : Math.random
  const quantos = Math.max(1, Math.floor(nBaralhos) || 1)

  const cartas = []
  for (let b = 0; b < quantos; b++) {
    for (let naipe = 0; naipe < 4; naipe++) {
      for (let r = 1; r <= 13; r++) cartas.push({ r, n: naipe })
    }
  }
  const total = cartas.length

  // O CORTE e o cartao plastico que o dealer enfia no meio do sapato. Passou
  // dele, a proxima mao comeca com baralho novo. 75% e o padrao de mesa: sobra
  // carta suficiente pra nenhuma mao terminar no meio de um reembaralhamento.
  const CORTE = Math.floor(total * 0.75)

  let topo = 0

  function embaralhar() {
    // Fisher-Yates. O Math.min protege contra um rng de teste que devolva 1.0
    // cravado — sem ele, j viraria i+1 e a troca escreveria undefined no monte.
    for (let i = total - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(sorteio() * (i + 1)))
      const t = cartas[i]
      cartas[i] = cartas[j]
      cartas[j] = t
    }
    topo = 0
  }

  embaralhar()

  return {
    embaralhar,

    /** Tira a carta de cima. Se o sapato acabou, ele se reembaralha sozinho —
     *  ninguem precisa checar 'restantes' antes de pedir carta.
     *
     *  Devolve uma COPIA e nao a carta guardada: a UI costuma pendurar estado
     *  de animacao no objeto da carta ('virando', 'x', 'y'), e se ela mexesse
     *  no objeto do monte esse lixo voltaria colado na proxima vez que a mesma
     *  carta saisse. Sao 2 campos por carta, algumas vezes por mao — nao e
     *  laco de render, entao a copia nao custa nada aqui. */
    pegar() {
      if (topo >= total) embaralhar()
      const c = cartas[topo++]
      return { r: c.r, n: c.n }
    },

    get restantes() { return total - topo },
    get total() { return total },

    /** true quando ja passamos do corte. Quem controla a mesa consulta isso
     *  ENTRE maos e embaralha — nunca no meio de uma. */
    get precisaEmbaralhar() { return topo >= CORTE },
  }
}

export default criarBaralho
