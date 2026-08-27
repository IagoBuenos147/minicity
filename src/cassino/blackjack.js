// ---------------------------------------------------------------------------
// src/cassino/blackjack.js — a mesa de blackjack da atendente.
//
// ESTA MAQUINA NAO TOCA EM DINHEIRO. Ela sabe quanto vale cada mao e quanto
// cada mao PAGA, e para por ai. Quem debita e credita a carteira e a UI.
//
// Isso nao e purismo: e a unica forma de nao pagar duas vezes. Se a maquina
// creditasse sozinha e a UI tambem lesse 'resultados' pra creditar, um refresh
// no meio da mao ou um clique duplo em "dobrar" ja bastaria pra o jogador
// ganhar de graca. Um lugar so mexe no saldo, e esse lugar e a carteira.
//
// O CONTRATO DE DINHEIRO com quem chama, entao, e:
//   - antes de comecar(v): a UI debita v;
//   - antes de dobrar()/dividir(): a UI debita custoExtra();
//   - na fase 'fim': a UI credita a SOMA dos 'retorno' de resultados.
// 'retorno' e sempre QUANTO O JOGADOR RECEBE de volta, nao o lucro. Mao ganha
// devolve 2x a aposta (a dele + a do dealer), empate devolve 1x, mao perdida
// devolve 0. Se fosse lucro, empate teria que devolver 0 e a UI ia ter que
// lembrar de repor a aposta — e um dia ela esquece.
//
// Logica pura: sem DOM, sem three.js, sem carteira. So precisa de um objeto
// com pegar(). E por isso que o teste consegue empilhar um baralho de mentira
// e provar "com A e 6 na mao, o dealer PARA".
// ---------------------------------------------------------------------------

import { CARTA_OCULTA } from './baralho.js'

/** Pontos de UMA carta com o As valendo 11. Figura (J/Q/K) vale 10, e e por
 *  isso que 10, J, Q e K podem ser divididos entre si: o que importa pro split
 *  e o PONTO, nao a figura. */
function pontos(r) {
  if (r === 1) return 11
  return r > 10 ? 10 : r
}

/**
 * Valor de uma mao com a regra do As, e a unica parte do blackjack que quase
 * todo mundo escreve errado.
 *
 * O As vale 1 OU 11, e a mao vale o MAIOR total que ainda nao estoura. Somando
 * todo As como 11 e depois descontando 10 por As enquanto passar de 21, cai
 * naturalmente no maior valor valido — sem tentar combinacoes.
 *
 * 'macio' e true quando sobrou um As contando 11. Nao e enfeite de painel: mao
 * macia NAO ESTOURA se pedir carta (o As desce pra 1), e e essa a informacao
 * que faz o jogador entender por que pedir com "17 macio" nao e loucura.
 */
export function valorMao(cartas) {
  let soma = 0
  let ases = 0
  for (let i = 0; i < cartas.length; i++) {
    const c = cartas[i]
    if (!c) continue
    if (c.r === 1) ases++
    soma += pontos(c.r)
  }
  while (soma > 21 && ases > 0) {
    soma -= 10
    ases--
  }
  return { valor: soma, macio: ases > 0 }
}

// Congelado: sai por estado().acoes, e um push() da UI num array compartilhado
// contaminaria toda leitura seguinte. Congelado, o erro estoura no ato.
const SEM_ACOES = Object.freeze([])

/** As cartas do dealer como o jogador as ve. Enquanto a segunda esta virada,
 *  ela sai como CARTA_OCULTA e NAO como a carta de verdade — o array continua
 *  com duas posicoes (a UI desenha duas cartas do mesmo jeito), mas a de baixo
 *  nao carrega valor nenhum. Segredo escondido no DADO, nao no desenho: se a
 *  carta real saisse daqui, a primeira UI que fizer um for nas cartas do
 *  dealer imprime o segredo na tela sem nem perceber. */
function cartasVisiveis(cartas, escondida) {
  if (!escondida || cartas.length < 2) return cartas.slice()
  const vis = cartas.slice(0, 1)
  vis.push(CARTA_OCULTA)
  return vis
}

export function criarBlackjack(opts = {}) {
  const baralho = opts.baralho
  const minimo = Math.max(1, Math.floor(opts.minimo) || 25)
  const maximo = Math.max(minimo, Math.floor(opts.maximo) || 2000)

  let fase = 'aposta'
  let maos = []
  let maoAtual = -1
  let dealer = []
  let escondida = true
  let houveSplit = false
  let resultados = []
  let mensagem = 'Faca sua aposta'

  function novaMao(aposta) {
    return { cartas: [], aposta, dobrada: false, encerrada: false }
  }

  function comprar(destino) {
    destino.push(baralho.pegar())
  }

  /** Blackjack NATURAL: 21 nas duas primeiras cartas e SEM ter dividido.
   *  A segunda condicao e regra de cassino, nao capricho — depois de um split
   *  um A+10 e so um 21 comum e paga 1:1. Sem isso, dividir dois ases viraria
   *  a jogada mais lucrativa da mesa. */
  function ehBlackjack(m) {
    return !houveSplit && m.cartas.length === 2 && valorMao(m.cartas).valor === 21
  }

  function dealerTemBlackjack() {
    return dealer.length === 2 && valorMao(dealer).valor === 21
  }

  /** Fecha a mao quando nao ha mais o que decidir. 21 encerra sozinho: nao
   *  existe jogada valida com 21 na mao, e deixar o botao "pedir" aceso ali so
   *  serve pra o jogador estourar sem querer. */
  function fecharSePronta(m) {
    if (valorMao(m.cartas).valor >= 21) m.encerrada = true
  }

  /** Passa a vez pra proxima mao viva a partir de 'desde'. Se nao sobrou
   *  nenhuma, e a vez do dealer. */
  function posicionar(desde) {
    for (let i = desde; i < maos.length; i++) {
      if (!maos[i].encerrada) {
        maoAtual = i
        fase = 'jogador'
        mensagem = textoDaVez(i)
        return
      }
    }
    maoAtual = -1
    jogarDealer()
  }

  function textoDaVez(i) {
    const v = valorMao(maos[i].cartas)
    const prefixo = maos.length > 1 ? 'Mao ' + (i + 1) + ' de ' + maos.length + ' — ' : 'Sua vez — '
    return prefixo + v.valor + (v.macio ? ' macio' : '')
  }

  function jogarDealer() {
    fase = 'dealer'
    // So agora a carta virada aparece. Antes disso ela existe no array mas
    // NUNCA sai em estado() — ver o comentario do snapshot la embaixo.
    escondida = false

    // Se o jogador estourou tudo, o dealer nao compra: nao ha o que bater, e
    // puxar carta so serviria pra dar a falsa impressao de que ele "podia ter
    // estourado tambem". A aposta ja esta perdida.
    let algumaViva = false
    for (let i = 0; i < maos.length; i++) {
      if (valorMao(maos[i].cartas).valor <= 21) { algumaViva = true; break }
    }

    if (algumaViva) {
      // Compra ate 17 e PARA em 17, inclusive 17 macio (A+6). E a regra
      // "stand on soft 17", que e a versao boa pro jogador — e a mesa da
      // atendente e o lugar onde a gente quer que ele volte.
      let v = valorMao(dealer)
      while (v.valor < 17) {
        comprar(dealer)
        v = valorMao(dealer)
      }
    }

    fase = 'fim'
    resolver()
  }

  function resolver() {
    resultados = []
    const d = valorMao(dealer)
    const dBj = dealerTemBlackjack()
    let ganhos = 0

    for (let i = 0; i < maos.length; i++) {
      const m = maos[i]
      const v = valorMao(m.cartas)
      const bj = ehBlackjack(m)
      let tipo
      let retorno

      if (v.valor > 21) {
        tipo = 'estourou'
        retorno = 0
      } else if (bj && dBj) {
        // Os dois com natural: ninguem paga ninguem, a aposta volta inteira.
        tipo = 'empate'
        retorno = m.aposta
      } else if (bj) {
        // 3:2. Math.round porque aposta impar (25 -> 62.5) tem que virar
        // inteiro em algum momento, e a carteira so aceita inteiro.
        tipo = 'blackjack'
        retorno = Math.round(m.aposta * 2.5)
      } else if (dBj) {
        tipo = 'perdeu'
        retorno = 0
      } else if (d.valor > 21 || v.valor > d.valor) {
        tipo = 'ganhou'
        retorno = m.aposta * 2
      } else if (v.valor === d.valor) {
        tipo = 'empate'
        retorno = m.aposta
      } else {
        tipo = 'perdeu'
        retorno = 0
      }

      ganhos += retorno
      resultados.push({ mao: i, tipo, aposta: m.aposta, retorno })
    }

    mensagem = textoDoFim(d, dBj, ganhos)
  }

  function textoDoFim(d, dBj, ganhos) {
    let apostado = 0
    for (let i = 0; i < maos.length; i++) apostado += maos[i].aposta

    let cabeca
    if (dBj) cabeca = 'Blackjack do dealer'
    else if (d.valor > 21) cabeca = 'Dealer estourou com ' + d.valor
    else cabeca = 'Dealer com ' + d.valor

    if (ganhos > apostado) return cabeca + ' — voce leva ' + ganhos
    if (ganhos === apostado) return cabeca + ' — empate'
    if (ganhos > 0) return cabeca + ' — voce leva ' + ganhos
    return cabeca + ' — a mesa fica com a aposta'
  }

  function acoesLegais() {
    if (fase !== 'jogador' || maoAtual < 0) return SEM_ACOES
    const m = maos[maoAtual]
    const lista = ['pedir', 'parar']

    // Dobrar e dividir so existem na PRIMEIRA decisao da mao. Depois de pedir
    // uma carta a mao tem 3 cartas e as duas jogadas somem sozinhas.
    const primeira = m.cartas.length === 2 && !m.dobrada
    if (primeira) lista.push('dobrar')

    if (primeira && !houveSplit && maos.length === 1 &&
        pontos(m.cartas[0].r) === pontos(m.cartas[1].r)) {
      lista.push('dividir')
    }
    return lista
  }

  const api = {
    get minimo() { return minimo },
    get maximo() { return maximo },

    /**
     * SNAPSHOT do que a UI pode ver. Repare no dealer: enquanto 'escondida'
     * for true, a segunda carta sai como CARTA_OCULTA e 'valor' e so o da
     * carta virada pra cima — exatamente o que se enxerga numa mesa de
     * verdade, onde o dealer "mostra 10" e ninguem sabe o resto.
     *
     * Isto ALOCA objetos novos a cada chamada. Chame quando algo muda (depois
     * de uma acao), nao a cada quadro.
     */
    estado() {
      const dv = escondida ? valorMao(dealer.slice(0, 1)) : valorMao(dealer)
      return {
        fase,
        maos: maos.map((m, i) => {
          const v = valorMao(m.cartas)
          return {
            cartas: m.cartas.slice(),
            aposta: m.aposta,
            valor: v.valor,
            macio: v.macio,
            estourou: v.valor > 21,
            blackjack: ehBlackjack(m),
            dobrada: m.dobrada,
            encerrada: m.encerrada,
            atual: i === maoAtual,
          }
        }),
        maoAtual,
        dealer: {
          cartas: cartasVisiveis(dealer, escondida),
          valor: dv.valor,
          macio: dv.macio,
          escondida,
        },
        acoes: acoesLegais(),
        resultados: fase === 'fim' ? resultados.slice() : [],
        mensagem,
      }
    },

    /**
     * Reparte a mao. Devolve false e NAO cobra nada se a aposta estiver fora
     * da mesa — quem chama ja debitou, entao false quer dizer "devolve o
     * dinheiro pro jogador". Use minimo/maximo pra travar os botoes ANTES de
     * debitar e esse caso nunca acontece.
     */
    comecar(aposta) {
      if (fase !== 'aposta' && fase !== 'fim') return false
      const v = Math.floor(aposta)
      if (!Number.isFinite(v) || v < minimo || v > maximo) return false

      // Embaralhar so entre maos, nunca no meio de uma.
      if (baralho.precisaEmbaralhar && typeof baralho.embaralhar === 'function') {
        baralho.embaralhar()
      }

      maos = [novaMao(v)]
      dealer = []
      houveSplit = false
      resultados = []
      escondida = true
      maoAtual = 0

      // Ordem de mesa: uma pro jogador, uma pro dealer, outra pro jogador,
      // outra pro dealer. Nao e decorativo — com baralho empilhado no teste, a
      // ordem e o que define quem recebe o que.
      comprar(maos[0].cartas)
      comprar(dealer)
      comprar(maos[0].cartas)
      comprar(dealer)

      // "Espiada" do dealer. Se qualquer um dos dois fechou 21 nas duas
      // primeiras cartas, a mao ja acabou: resolver naturais aqui e o que
      // impede o jogador de dobrar a aposta contra um blackjack ja fechado.
      if (valorMao(maos[0].cartas).valor === 21 || dealerTemBlackjack()) {
        maos[0].encerrada = true
        maoAtual = -1
        escondida = false
        fase = 'fim'
        resolver()
        return true
      }

      fase = 'jogador'
      mensagem = textoDaVez(0)
      return true
    },

    pedir() {
      if (fase !== 'jogador' || maoAtual < 0) return false
      const m = maos[maoAtual]
      comprar(m.cartas)
      fecharSePronta(m)
      if (m.encerrada) posicionar(maoAtual + 1)
      else mensagem = textoDaVez(maoAtual)
      return true
    },

    parar() {
      if (fase !== 'jogador' || maoAtual < 0) return false
      maos[maoAtual].encerrada = true
      posicionar(maoAtual + 1)
      return true
    },

    /** Dobra a aposta e recebe EXATAMENTE uma carta. A mao acaba ali, tenha
     *  dado 12 ou 20 — e esse o preco de pagar em dobro. */
    dobrar() {
      if (acoesLegais().indexOf('dobrar') < 0) return false
      const m = maos[maoAtual]
      m.aposta *= 2
      m.dobrada = true
      comprar(m.cartas)
      m.encerrada = true
      posicionar(maoAtual + 1)
      return true
    },

    /** Divide um par em duas maos, cada uma com a aposta original, e da uma
     *  carta nova pra cada. So uma vez por mao: sem esse teto, um jogador com
     *  saldo grande poderia dividir em cascata e transformar uma aposta de 25
     *  numa exposicao de centenas sem nunca decidir nada. */
    dividir() {
      if (acoesLegais().indexOf('dividir') < 0) return false
      const m = maos[0]
      const segunda = novaMao(m.aposta)
      segunda.cartas.push(m.cartas.pop())
      maos.push(segunda)
      houveSplit = true

      comprar(maos[0].cartas)
      comprar(maos[1].cartas)
      fecharSePronta(maos[0])
      fecharSePronta(maos[1])

      posicionar(0)
      return true
    },

    /** Quanto a UI precisa DEBITAR se a proxima acao for dobrar ou dividir.
     *  As duas custam a mesma coisa (mais uma aposta cheia), por isso um numero
     *  so resolve. Zero quando nenhuma das duas e legal agora. */
    custoExtra() {
      const acoes = acoesLegais()
      if (acoes.indexOf('dobrar') < 0 && acoes.indexOf('dividir') < 0) return 0
      return maos[maoAtual].aposta
    },

    /** Volta pra tela de aposta. So limpa a mesa; nao paga nada. */
    reiniciar() {
      fase = 'aposta'
      maos = []
      maoAtual = -1
      dealer = []
      escondida = true
      houveSplit = false
      resultados = []
      mensagem = 'Faca sua aposta'
    },
  }

  return api
}

export default criarBlackjack
