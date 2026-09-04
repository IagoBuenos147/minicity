// Teste da logica do cassino: baralho, blackjack, poker de duas cartas e
// caca-niquel. Node puro, sem navegador e sem dependencia — estes quatro
// modulos nao importam three.js nem tocam no DOM justamente pra isto ser
// possivel. Se um dia este arquivo precisar de puppeteer, alguem colou o jogo
// dentro da regra e o resto do teste ja nao vale nada.
//
//   node tools/teste-cassino.mjs
//
// Sai com codigo 1 se algum caso falhar.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { criarBaralho, NAIPES, CARTA_OCULTA, cartaTexto, nomeValor } from '../src/cassino/baralho.js'
import { criarBlackjack, valorMao } from '../src/cassino/blackjack.js'
import { melhorMao, descreverMao, criarPoker, TETO_AUMENTOS, RUAS } from '../src/cassino/poker.js'
import { criarSlots, SIMBOLOS, PAGAMENTOS } from '../src/cassino/slots.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log((ok ? 'OK   ' : 'FALHA') + '  ' + name + (detail ? '  -> ' + detail : ''))
}

// --- ferramentas de teste --------------------------------------------------

/** Gerador deterministico (mulberry32). Mesma semente, mesma sequencia: sem
 *  isso um teste de poker/slots passaria ou falharia conforme o humor do dia. */
function semente(s) {
  let a = s >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Carta por nome, pra empilhar mao a mao: k('A'), k('10', 2). */
const RANKS = { A: 1, J: 11, Q: 12, K: 13 }
function k(nome, naipe = 0) {
  const r = RANKS[nome] !== undefined ? RANKS[nome] : Number(nome)
  return { r, n: naipe }
}

/**
 * Baralho de mentira com a ordem cravada. So precisa de pegar(), que e tudo o
 * que o blackjack usa — e por isso que da pra provar "o dealer PARA em 17
 * macio" em vez de torcer pra sair.
 * Quando a lista acaba devolve 2s, que servem de enchimento pro dealer puxar
 * sem nunca fechar 21 sozinho por acidente.
 */
function baralhoFixo(lista) {
  let i = 0
  return {
    pegar() {
      const c = lista[i++]
      return c ? { r: c.r, n: c.n } : { r: 2, n: 0 }
    },
    precisaEmbaralhar: false,
    embaralhar() {},
  }
}

// --- 1) baralho ------------------------------------------------------------

{
  const b = criarBaralho(6, semente(7))
  check('sapato de 6 baralhos tem 312 cartas', b.restantes === 312, String(b.restantes))

  const conta = new Map()
  let ok = true
  for (let i = 0; i < 312; i++) {
    const c = b.pegar()
    if (!c || c.r < 1 || c.r > 13 || c.n < 0 || c.n > 3) { ok = false; break }
    const chave = c.r + '/' + c.n
    conta.set(chave, (conta.get(chave) || 0) + 1)
  }
  check('312 cartas saem sem nenhuma invalida', ok)

  // 6 baralhos x 4 naipes = 24 de cada VALOR, e 6 de cada carta exata.
  const porValor = new Map()
  let maxExata = 0
  for (const [chave, n] of conta) {
    const r = Number(chave.split('/')[0])
    porValor.set(r, (porValor.get(r) || 0) + n)
    if (n > maxExata) maxExata = n
  }
  let maxValor = 0
  for (const n of porValor.values()) if (n > maxValor) maxValor = n
  check('nunca mais de 24 cartas do mesmo valor', maxValor === 24, 'maior contagem ' + maxValor)
  check('exatamente 6 copias de cada carta exata', maxExata === 6 && conta.size === 52, maxExata + ' copias, ' + conta.size + ' cartas distintas')

  check('sapato zerado antes do reembaralho', b.restantes === 0)
  const extra = b.pegar()
  check('reembaralha sozinho quando acaba', !!extra && b.restantes === 311, 'restantes ' + b.restantes)

  const c2 = criarBaralho(6, semente(9))
  let cortou = false
  for (let i = 0; i < 234; i++) { c2.pegar(); if (c2.precisaEmbaralhar) { cortou = i + 1; break } }
  check('corte avisa em 75% do sapato (234 cartas)', cortou === 234, 'avisou em ' + cortou)

  check('cartaTexto monta o rotulo', cartaTexto({ r: 1, n: 0 }) === 'A' + NAIPES[0].simbolo && cartaTexto({ r: 10, n: 1 }) === '10' + NAIPES[1].simbolo)
  check('cartaTexto da "?" pra carta virada', cartaTexto(CARTA_OCULTA) === '?', cartaTexto(CARTA_OCULTA))
  check('nomeValor cobre A..K', nomeValor(1) === 'A' && nomeValor(10) === '10' && nomeValor(11) === 'J' && nomeValor(13) === 'K')
}

// --- 2) blackjack: contagem de As ------------------------------------------

{
  const a = valorMao([k('A'), k('A'), k('9')])
  check('A+A+9 vale 21 (um As desce pra 1)', a.valor === 21 && a.macio === true, a.valor + (a.macio ? ' macio' : ' duro'))

  const b = valorMao([k('A'), k('9'), k('9')])
  check('A+9+9 vale 19 (o As vira 1)', b.valor === 19 && b.macio === false, b.valor + (b.macio ? ' macio' : ' duro'))

  const c = valorMao([k('A'), k('K')])
  check('A+K vale 21 macio', c.valor === 21 && c.macio === true, c.valor + (c.macio ? ' macio' : ' duro'))

  const d = valorMao([k('A'), k('A'), k('A'), k('8')])
  check('A+A+A+8 vale 21', d.valor === 21, String(d.valor))

  const e = valorMao([k('K'), k('Q'), k('5')])
  check('K+Q+5 estoura com 25', e.valor === 25 && !e.macio, String(e.valor))

  const f = valorMao([k('10'), k('J'), k('Q'), k('K')])
  check('figuras todas valem 10', f.valor === 40, String(f.valor))
}

// --- 3) blackjack: dealer para em 17 macio ---------------------------------

{
  // Ordem de mesa: jogador, dealer, jogador, dealer.
  // Jogador 10+7 = 17 duro. Dealer A+6 = 17 MACIO -> tem que parar.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('A'), k('7'), k('6')]), minimo: 10 })
  jogo.comecar(100)
  jogo.parar()
  const e = jogo.estado()
  check('dealer para em 17 macio (nao compra)', e.dealer.cartas.length === 2 && e.dealer.valor === 17 && e.dealer.macio === true,
    e.dealer.cartas.length + ' cartas, ' + e.dealer.valor + (e.dealer.macio ? ' macio' : ' duro'))
  check('17 contra 17 empata devolvendo a aposta', e.resultados[0].tipo === 'empate' && e.resultados[0].retorno === 100,
    e.resultados[0].tipo + ' retorno ' + e.resultados[0].retorno)
}

{
  // Dealer com 16 duro (10+6) TEM que comprar.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('10'), k('7'), k('6'), k('5')]), minimo: 10 })
  jogo.comecar(100)
  jogo.parar()
  const e = jogo.estado()
  check('dealer compra com 16 duro', e.dealer.cartas.length === 3 && e.dealer.valor === 21, e.dealer.valor + ' com ' + e.dealer.cartas.length + ' cartas')
}

// --- 4) blackjack: carta escondida -----------------------------------------

{
  // Dealer com 9 a mostra e 7 escondido. O 7 nao pode aparecer em lugar nenhum
  // do estado enquanto for a vez do jogador.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('9'), k('6'), k('7'), k('5')]), minimo: 10 })
  jogo.comecar(100)
  const antes = jogo.estado()
  check('estado traz 2 cartas do dealer mesmo com uma virada',
    antes.dealer.escondida === true && antes.dealer.cartas.length === 2,
    antes.dealer.cartas.length + ' cartas')
  check('a carta virada e CARTA_OCULTA e nao a carta de verdade',
    antes.dealer.cartas[1] === CARTA_OCULTA && antes.dealer.cartas[1].r === 0,
    cartaTexto(antes.dealer.cartas[1]))
  check('o valor escondido nao vaza por nenhum campo',
    antes.dealer.valor === 9 && JSON.stringify(antes.dealer).indexOf('"r":7') < 0,
    'dealer mostra ' + antes.dealer.valor)
  check('carta oculta nao soma ponto em valorMao', valorMao(antes.dealer.cartas).valor === 9, String(valorMao(antes.dealer.cartas).valor))
  jogo.parar()
  const depois = jogo.estado()
  check('carta vira quando a fase passa pro dealer',
    depois.dealer.escondida === false && depois.dealer.cartas.length >= 2 && depois.dealer.cartas[1].r === 7,
    depois.dealer.cartas.map(cartaTexto).join(' '))
}

// --- 5) blackjack: blackjack natural 3:2 e empate --------------------------

{
  // Jogador A+K = 21 natural. Dealer 9+5 = 14, sem natural.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('A'), k('9'), k('K'), k('5')]), minimo: 10 })
  jogo.comecar(100)
  const e = jogo.estado()
  check('blackjack natural resolve na hora', e.fase === 'fim' && e.maos[0].blackjack === true, e.fase)
  check('blackjack paga 3:2 (retorno 250 em 100)', e.resultados[0].tipo === 'blackjack' && e.resultados[0].retorno === 250,
    e.resultados[0].tipo + ' retorno ' + e.resultados[0].retorno)
}

{
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('A'), k('9'), k('K'), k('5')]), minimo: 25 })
  jogo.comecar(25)
  const r = jogo.estado().resultados[0]
  check('3:2 arredonda aposta impar (25 -> 63)', r.retorno === Math.round(25 * 2.5) && r.retorno === 63, 'retorno ' + r.retorno)
}

{
  // Os dois com natural -> empate, aposta de volta.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('A'), k('A', 1), k('K'), k('K', 1)]), minimo: 10 })
  jogo.comecar(100)
  const e = jogo.estado()
  check('dois blackjacks empatam devolvendo a aposta', e.resultados[0].tipo === 'empate' && e.resultados[0].retorno === 100,
    e.resultados[0].tipo + ' retorno ' + e.resultados[0].retorno)
}

{
  // So o dealer tem natural -> o jogador perde na hora, sem chance de dobrar.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('A'), k('6'), k('K')]), minimo: 10 })
  jogo.comecar(100)
  const e = jogo.estado()
  check('blackjack do dealer encerra a mao na hora', e.fase === 'fim' && e.resultados[0].tipo === 'perdeu' && e.resultados[0].retorno === 0, e.fase + '/' + e.resultados[0].tipo)
}

// --- 6) blackjack: dobrar --------------------------------------------------

{
  // Jogador 5+6 = 11, dealer 9+7 = 16.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('5'), k('9'), k('6'), k('7'), k('4'), k('3')]), minimo: 10 })
  jogo.comecar(100)
  const antes = jogo.estado()
  check('dobrar aparece na primeira decisao', antes.acoes.indexOf('dobrar') >= 0, antes.acoes.join(','))
  check('custoExtra e uma aposta cheia', jogo.custoExtra() === 100, String(jogo.custoExtra()))
  jogo.dobrar()
  const e = jogo.estado()
  check('dobrar da exatamente uma carta e encerra', e.maos[0].cartas.length === 3 && e.maos[0].encerrada === true && e.fase === 'fim',
    e.maos[0].cartas.length + ' cartas, fase ' + e.fase)
  check('dobrar dobra a aposta da mao', e.maos[0].aposta === 200 && e.maos[0].dobrada === true, 'aposta ' + e.maos[0].aposta)
}

{
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('5'), k('9'), k('6'), k('7'), k('2'), k('3')]), minimo: 10 })
  jogo.comecar(100)
  jogo.pedir()
  check('dobrar some depois de pedir carta', jogo.estado().acoes.indexOf('dobrar') < 0, jogo.estado().acoes.join(','))
  check('custoExtra zera quando dobrar/dividir nao sao legais', jogo.custoExtra() === 0)
}

// --- 7) blackjack: dividir -------------------------------------------------

{
  // 10 e K valem os mesmos 10 pontos -> pode dividir.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('9'), k('K'), k('7'), k('8'), k('6'), k('5')]), minimo: 10 })
  jogo.comecar(100)
  check('10+K pode dividir (o que vale e o ponto)', jogo.estado().acoes.indexOf('dividir') >= 0, jogo.estado().acoes.join(','))
  jogo.dividir()
  const e = jogo.estado()
  check('dividir cria 2 maos de 2 cartas com a aposta original',
    e.maos.length === 2 && e.maos[0].cartas.length === 2 && e.maos[1].cartas.length === 2 && e.maos[0].aposta === 100 && e.maos[1].aposta === 100,
    e.maos.length + ' maos')
  check('depois do split, 21 em duas cartas NAO e blackjack',
    e.maos.every((m) => m.blackjack === false),
    e.maos.map((m) => m.valor + (m.blackjack ? '(bj)' : '')).join(' / '))
  check('nao da pra dividir duas vezes', e.acoes.indexOf('dividir') < 0, e.acoes.join(','))
}

{
  // 10 e 9 tem pontos diferentes -> nao pode dividir.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('5'), k('9'), k('7')]), minimo: 10 })
  jogo.comecar(100)
  check('10+9 nao pode dividir', jogo.estado().acoes.indexOf('dividir') < 0, jogo.estado().acoes.join(','))
  check('dividir() ilegal devolve false e nao mexe na mesa', jogo.dividir() === false && jogo.estado().maos.length === 1)
}

// --- 8) blackjack: estourou tudo, o dealer nao compra ----------------------

{
  // Jogador 10+6 = 16, pede um 10 e estoura com 26. Dealer 4+3 = 7: se ele
  // comprasse, iria ate 17. Como o jogador ja estourou, ele fica com 7.
  const jogo = criarBlackjack({ baralho: baralhoFixo([k('10'), k('4'), k('6'), k('3'), k('10')]), minimo: 10 })
  jogo.comecar(100)
  jogo.pedir()
  const e = jogo.estado()
  check('jogador estourou', e.maos[0].estourou === true && e.maos[0].valor === 26, String(e.maos[0].valor))
  check('dealer nao compra quando tudo estourou', e.dealer.cartas.length === 2 && e.dealer.valor === 7, e.dealer.valor + ' com ' + e.dealer.cartas.length + ' cartas')
  check('mao estourada devolve 0', e.resultados[0].tipo === 'estourou' && e.resultados[0].retorno === 0)
}

// --- 9) blackjack: aposta fora da mesa -------------------------------------

{
  const jogo = criarBlackjack({ baralho: baralhoFixo([]), minimo: 25, maximo: 500 })
  check('aposta abaixo do minimo e recusada sem repartir', jogo.comecar(10) === false && jogo.estado().fase === 'aposta')
  check('aposta acima do maximo e recusada', jogo.comecar(9999) === false && jogo.estado().fase === 'aposta')
  check('aposta valida e aceita', jogo.comecar(25) === true)
}

// --- 10) poker: as nove categorias do Hold'em ------------------------------

{
  // Naipes: 0 espadas, 1 copas, 2 ouros, 3 paus.
  const m = (...cs) => melhorMao(cs)
  const sf = m(k('9', 0), k('8', 0), k('7', 0), k('6', 0), k('5', 0))
  const quadra = m(k('9', 0), k('9', 1), k('9', 2), k('9', 3), k('5', 0))
  const full = m(k('9', 0), k('9', 1), k('9', 2), k('5', 3), k('5', 0))
  const flush = m(k('A', 0), k('J', 0), k('8', 0), k('4', 0), k('2', 0))
  const seq = m(k('9', 0), k('8', 1), k('7', 0), k('6', 0), k('5', 0))
  const trinca = m(k('9', 0), k('9', 1), k('9', 2), k('J', 3), k('5', 0))
  const dois = m(k('9', 0), k('9', 1), k('5', 2), k('5', 3), k('J', 0))
  const par = m(k('9', 0), k('9', 1), k('5', 2), k('J', 3), k('3', 0))
  const alta = m(k('A', 0), k('J', 1), k('8', 2), k('4', 3), k('2', 0))

  check('as nove categorias saem certas',
    sf.categoria === 8 && quadra.categoria === 7 && full.categoria === 6 &&
    flush.categoria === 5 && seq.categoria === 4 && trinca.categoria === 3 &&
    dois.categoria === 2 && par.categoria === 1 && alta.categoria === 0,
    [sf, quadra, full, flush, seq, trinca, dois, par, alta].map((f) => f.categoria).join(','))

  const escada = [alta, par, dois, trinca, seq, flush, full, quadra, sf]
  let fora = 0
  for (let i = 1; i < escada.length; i++) if (escada[i].chave <= escada[i - 1].chave) fora++
  check('a escada de categorias e estritamente crescente', fora === 0, fora + ' degraus fora de ordem')

  // A RODA. A-2-3-4-5 e sequencia com o As valendo UM, entao e a MAIS FRACA de
  // todas — mais fraca que 6-5-4-3-2. E o caso que quase todo avaliador erra.
  const roda = m(k('A', 0), k('2', 1), k('3', 2), k('4', 3), k('5', 0))
  const seq6 = m(k('6', 0), k('5', 1), k('4', 2), k('3', 3), k('2', 0))
  check('A-2-3-4-5 e sequencia', roda.categoria === 4, roda.nome)
  check('a roda e a sequencia MAIS FRACA', roda.chave < seq6.chave, roda.chave + ' < ' + seq6.chave)
  const rodaSF = m(k('A', 0), k('2', 0), k('3', 0), k('4', 0), k('5', 0))
  const sf6 = m(k('6', 1), k('5', 1), k('4', 1), k('3', 1), k('2', 1))
  check('a roda do mesmo naipe e straight flush', rodaSF.categoria === 8, rodaSF.nome)
  check('e e o straight flush MAIS FRACO', rodaSF.chave < sf6.chave, rodaSF.chave + ' < ' + sf6.chave)

  // KICKER. Mesmo par, kicker diferente: quem tem o kicker maior ganha.
  const parAK = m(k('9', 0), k('9', 1), k('A', 2), k('7', 3), k('3', 0))
  const parQK = m(k('9', 2), k('9', 3), k('Q', 0), k('7', 1), k('3', 1))
  check('kicker desempata par igual', parAK.chave > parQK.chave, parAK.chave + ' > ' + parQK.chave)

  check('nome da mao sai legivel',
    quadra.nome === 'quadra de 9' && dois.nome === 'dois pares, 9 e 5',
    quadra.nome + ' | ' + dois.nome)

  // A dica da faixa tem que dizer alguma coisa desde o pre-flop, quando ainda
  // nao ha cinco cartas pra avaliar.
  const pre = descreverMao([k('A', 0), k('K', 0)], [])
  check('descreverMao fala do pre-flop sem mesa', pre.indexOf('A-K') === 0 && pre.indexOf('naipe') > 0, pre)
  check('descreverMao usa a mesa quando ela existe',
    descreverMao([k('9', 1), k('9', 2)], [k('9', 0), k('J', 0), k('4', 3)]) === 'trinca de 9',
    descreverMao([k('9', 1), k('9', 2)], [k('9', 0), k('J', 0), k('4', 3)]))
}

// --- 11) poker: a melhor de cinco entre sete -------------------------------

{
  // SETE CARTAS: o flush do board tem que ganhar do par da mao. Um avaliador
  // que so olhasse as duas da mao mais tres do board acharia o par.
  const seteFlush = melhorMao([
    k('9', 1), k('9', 2),
    k('A', 0), k('J', 0), k('8', 0), k('4', 0), k('2', 0)])
  check('entre 7 cartas ele acha o flush e nao o par', seteFlush.categoria === 5, seteFlush.nome)

  // O BOARD JOGA: quando as cinco do meio sao a melhor mao, duas maos
  // diferentes tem que empatar EXATAMENTE.
  const board = [k('A', 0), k('K', 0), k('Q', 0), k('J', 0), k('10', 0)]
  const x = melhorMao([k('2', 1), k('3', 2)].concat(board))
  const y = melhorMao([k('7', 3), k('8', 1)].concat(board))
  check('board com royal: as duas maos empatam', x.chave === y.chave, x.chave + ' vs ' + y.chave)

  // A ORDEM DAS CARTAS NAO PODE MUDAR NADA.
  const rng = semente(99)
  const bar = criarBaralho(1, rng)
  let assimetrico = 0
  for (let n = 0; n < 400; n++) {
    if (bar.precisaEmbaralhar) bar.embaralhar()
    const sete = []
    for (let i = 0; i < 7; i++) sete.push(bar.pegar())
    if (melhorMao(sete).chave !== melhorMao(sete.slice().reverse()).chave) assimetrico++
  }
  check('melhorMao nao depende da ordem das cartas', assimetrico === 0, assimetrico + ' assimetrias')

  // FREQUENCIA. Este e o teste que pega erro de categoria de verdade: as
  // proporcoes de 7 cartas sao conhecidas, e um avaliador com um caso errado
  // sai da faixa na hora. Alvos (7 cartas, em %): alta 17,4 - par 43,8 -
  // dois pares 23,5 - trinca 4,8 - sequencia 4,6 - flush 3,0 - full 2,6 -
  // quadra 0,17 - straight flush 0,031. A folga e larga de proposito: o que se
  // quer pegar aqui e categoria trocada, nao ruido de amostragem.
  const rng2 = semente(4242)
  const bar2 = criarBaralho(1, rng2)
  const conta = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const N = 40000
  for (let n = 0; n < N; n++) {
    if (bar2.precisaEmbaralhar) bar2.embaralhar()
    const sete = []
    for (let i = 0; i < 7; i++) sete.push(bar2.pegar())
    conta[melhorMao(sete).categoria]++
  }
  const pct = conta.map((c) => (c / N) * 100)
  const perto = (i, alvo, folga) => Math.abs(pct[i] - alvo) <= folga
  check('frequencia de par bate com a teoria', perto(1, 43.8, 3), pct[1].toFixed(2) + '% (alvo 43,8)')
  check('frequencia de dois pares bate', perto(2, 23.5, 3), pct[2].toFixed(2) + '% (alvo 23,5)')
  check('frequencia de carta alta bate', perto(0, 17.4, 3), pct[0].toFixed(2) + '% (alvo 17,4)')
  check('trinca, sequencia e flush ficam na casa certa',
    perto(3, 4.8, 1.5) && perto(4, 4.6, 1.5) && perto(5, 3.0, 1.5),
    [pct[3], pct[4], pct[5]].map((v) => v.toFixed(2)).join(' / '))
  check('full house e raro mas existe', perto(6, 2.6, 1.2), pct[6].toFixed(2) + '% (alvo 2,6)')
  check('quadra e straight flush aparecem e sao raros',
    conta[7] > 0 && pct[7] < 1 && pct[8] < 0.3,
    'quadra ' + pct[7].toFixed(3) + '% / SF ' + pct[8].toFixed(3) + '%')
}

// --- 11b) poker: as quatro ruas acontecem na ordem -------------------------

{
  const rng = semente(7)
  const baralho = criarBaralho(1, rng)
  const jogo = criarPoker({ baralho, rng, aposta: 25, fichasNpc: 500000 })

  // Um jogador que so PASSA e PAGA nunca fecha a mao cedo: ela tem que
  // atravessar as quatro ruas e chegar no showdown com cinco cartas na mesa.
  let chegouNoRiver = 0
  let ruaFora = 0
  let mesaErrada = 0
  const vistas = new Set()
  const ESPERADO = [0, 3, 4, 5]
  for (let n = 0; n < 300; n++) {
    jogo.comecar()
    let passos = 0
    while (jogo.estado().fase === 'jogador' && passos < 60) {
      const e = jogo.estado()
      vistas.add(e.rua)
      if (e.rua < 0 || e.rua > 3) ruaFora++
      // A mesa tem que ter exatamente as cartas da rua em que esta.
      if (e.mesa.length !== ESPERADO[e.rua]) mesaErrada++
      if (e.acoes.indexOf('pagar') >= 0) jogo.pagar()
      else jogo.passar()
      passos++
    }
    const fim = jogo.estado()
    if (fim.resultado && fim.resultado.tipo !== 'ele-desistiu' && fim.mesa.length === 5) chegouNoRiver++
  }
  check('a mesa tem 0/3/4/5 cartas conforme a rua', mesaErrada === 0, mesaErrada + ' desencontros')
  check('a rua nunca sai da faixa 0..3', ruaFora === 0, ruaFora + ' fora')
  check('as quatro ruas sao visitadas', [0, 1, 2, 3].every((r) => vistas.has(r)), [...vistas].join(','))
  check('quem so paga chega ao showdown com 5 na mesa', chegouNoRiver > 200, chegouNoRiver + '/300')
  check('os nomes das ruas existem', RUAS.length === 4 && RUAS[0] === 'pre-flop' && RUAS[3] === 'river', RUAS.join('/'))
}

// --- 12) poker: a mao sempre termina e a IA nao trapaceia -------------------

{
  const rng = semente(1234)
  const baralho = criarBaralho(1, rng)
  const jogo = criarPoker({ baralho, rng, aposta: 25, fichasNpc: 5000 })

  let maosCompletas = 0
  let travou = 0
  let maxAumentos = 0
  let passouDoTeto = 0
  let tetoAtingido = 0
  let ofereceuDemais = 0
  for (let n = 0; n < 1500; n++) {
    jogo.comecar()
    let passos = 0
    while (jogo.estado().fase === 'jogador' && passos < 90) {
      const e = jogo.estado()
      if (e.aumentos > maxAumentos) maxAumentos = e.aumentos
      if (e.aumentos > TETO_AUMENTOS) passouDoTeto++
      if (e.aumentos >= TETO_AUMENTOS) {
        tetoAtingido++
        // No teto, subir a aposta nao pode nem aparecer como opcao.
        if (e.acoes.indexOf('apostar') >= 0 || e.acoes.indexOf('aumentar') >= 0) ofereceuDemais++
      }
      // Jogador de mentira: escolhe uma acao legal qualquer. Aleatorio de
      // proposito — um jogador "sensato" so visitaria os caminhos que o autor
      // do teste ja imaginou, e o que a gente quer aqui e o caminho que ele
      // NAO imaginou.
      const acao = e.acoes[Math.floor(rng() * e.acoes.length)]
      if (acao === 'passar') jogo.passar()
      else if (acao === 'apostar') jogo.apostar(e.pote)
      else if (acao === 'pagar') jogo.pagar()
      else if (acao === 'aumentar') jogo.aumentar(e.pote)
      else jogo.desistir()
      passos++
    }
    const fim = jogo.estado()
    if (fim.fase === 'fim' && fim.resultado) maosCompletas++
    if (passos >= 90) travou++
  }
  check('1500 maos de poker terminam sempre em fim com resultado', maosCompletas === 1500, maosCompletas + '/1500')
  check('nenhuma mao vira leilao infinito', travou === 0, travou + ' travadas')
  check('aumentos nunca passam do teto', passouDoTeto === 0 && maxAumentos <= TETO_AUMENTOS, 'maximo visto ' + maxAumentos + ', teto ' + TETO_AUMENTOS)
  check('no teto, subir a aposta some das acoes', tetoAtingido > 0 && ofereceuDemais === 0, tetoAtingido + ' vezes no teto, ' + ofereceuDemais + ' ofertas indevidas')
}

{
  // A IA nao pode enxergar a mao do jogador. Isso nao da pra medir rodando o
  // jogo, entao o teste le o proprio arquivo: o bloco marcado como IA nao pode
  // citar 'minhas' em lugar nenhum.
  const fonte = fs.readFileSync(path.join(AQUI, '..', 'src', 'cassino', 'poker.js'), 'utf8')
  const ini = fonte.indexOf('IA-NPC-INICIO')
  const fim = fonte.indexOf('IA-NPC-FIM')
  const bloco = ini >= 0 && fim > ini ? fonte.slice(ini, fim) : ''
  // Tira os comentarios antes de procurar: o proprio aviso dentro do bloco diz
  // "nunca leia `minhas` aqui", e seria ridiculo o teste falhar por causa do
  // texto que existe pra impedir a falha.
  // O split e por /\r?\n/ e nao por '\n': este repositorio esta com
  // core.autocrlf=true, entao o arquivo na copia de trabalho vem com CRLF. Com
  // CRLF a linha termina em '\r', e em JavaScript o '.' NAO casa '\r' — o
  // '//.*$' entao nao casava nada e o teste acusava o proprio aviso ("NUNCA
  // leia `minhas` aqui") como se fosse codigo da IA.
  const codigo = bloco.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  check('bloco da IA existe e esta marcado', bloco.length > 200, bloco.length + ' chars')
  check('a IA nao le a mao do jogador (nenhum "minhas" no codigo do bloco)', bloco.length > 200 && codigo.indexOf('minhas') < 0)
}

{
  // A mao do NPC so aparece no showdown.
  const rng = semente(99)
  const baralho = criarBaralho(1, rng)
  const jogo = criarPoker({ baralho, rng, aposta: 25 })
  jogo.comecar()
  check('mao do NPC fica escondida antes do showdown', jogo.estado().dele.length === 0)
  let vistas = 0
  let escondidas = 0
  let vazou = 0
  const tipos = new Set()
  for (let n = 0; n < 400; n++) {
    jogo.comecar()
    let passos = 0
    while (jogo.estado().fase === 'jogador' && passos < 90) {
      const e = jogo.estado()
      // Acao aleatoria pra as duas pontas correrem: sem desistir do lado do
      // jogador, o NPC nunca enfrenta aposta e nunca corre tambem.
      const acao = e.acoes[Math.floor(rng() * e.acoes.length)]
      if (acao === 'passar') jogo.passar()
      else if (acao === 'apostar') jogo.apostar(e.pote)
      else if (acao === 'pagar') jogo.pagar()
      else if (acao === 'aumentar') jogo.aumentar(e.pote)
      else jogo.desistir()
      passos++
    }
    const e = jogo.estado()
    tipos.add(e.resultado.tipo)
    const showdown = e.resultado.tipo === 'ganhou' || e.resultado.tipo === 'perdeu' || e.resultado.tipo === 'empate'
    if (showdown) {
      if (e.dele.length === 2 && e.resultado.maoDele) vistas++
    } else {
      if (e.dele.length === 0 && e.resultado.maoDele === null) escondidas++
      else vazou++
    }
  }
  check('showdown revela as duas cartas dele', vistas > 0, vistas + ' showdowns')
  check('quem corre nao mostra a mao', escondidas > 0 && vazou === 0, escondidas + ' desistencias, ' + vazou + ' vazamentos')
  check('os dois lados correm alguma vez', tipos.has('desistiu') && tipos.has('ele-desistiu'), [...tipos].join(','))
}

{
  // Conservacao do pote: o que entra e o que sai tem que fechar.
  const rng = semente(777)
  const baralho = criarBaralho(2, rng)
  const jogo = criarPoker({ baralho, rng, aposta: 25, fichasNpc: 100000 })
  let quebrou = 0
  for (let n = 0; n < 300; n++) {
    jogo.comecar()
    let passos = 0
    while (jogo.estado().fase === 'jogador' && passos < 90) {
      const e = jogo.estado()
      const acao = e.acoes[Math.floor(rng() * e.acoes.length)]
      if (acao === 'passar') jogo.passar()
      else if (acao === 'apostar') jogo.apostar(e.pote)
      else if (acao === 'pagar') jogo.pagar()
      else if (acao === 'aumentar') jogo.aumentar(e.pote)
      else jogo.desistir()
      passos++
    }
    const e = jogo.estado()
    if (e.pote !== e.minhaEntrada + e.entradaDele) quebrou++
    if (e.resultado.retorno > e.pote) quebrou++
    if (e.resultado.tipo === 'empate' && e.resultado.retorno !== e.minhaEntrada) quebrou++
  }
  check('o pote sempre fecha (entrada dos dois = pote, retorno <= pote)', quebrou === 0, quebrou + ' maos furadas')
}

// --- 13) caca-niquel: RTP exato por enumeracao -----------------------------

{
  const slots = criarSlots({ rng: semente(5) })

  // Refaz a conta AQUI, do zero, sem chamar nada do modulo alem das tabelas.
  // Se esperado() e este laco discordarem, um dos dois esta errado — e e
  // exatamente isso que o teste precisa pegar.
  const pesos = SIMBOLOS.map((s) => s.peso)
  const W = pesos.reduce((a, b) => a + b, 0)
  const totalCasos = W * W * W
  let retorno = 0
  let casosComPremio = 0
  for (let a = 0; a < SIMBOLOS.length; a++) {
    for (let b = 0; b < SIMBOLOS.length; b++) {
      for (let c = 0; c < SIMBOLOS.length; c++) {
        const casos = pesos[a] * pesos[b] * pesos[c]
        let mult = 0
        if (a === b && b === c) mult = PAGAMENTOS.trinca[SIMBOLOS[a].id] || 0
        else if (a === b || a === c) mult = PAGAMENTOS.par[SIMBOLOS[a].id] || 0
        else if (b === c) mult = PAGAMENTOS.par[SIMBOLOS[b].id] || 0
        if (mult > 0) { retorno += casos * mult; casosComPremio += casos }
      }
    }
  }
  const rtp = (retorno / totalCasos) * 100
  const freq = (casosComPremio / totalCasos) * 100

  check('caca-niquel tem 6 a 8 simbolos', SIMBOLOS.length >= 6 && SIMBOLOS.length <= 8, SIMBOLOS.length + ' simbolos')
  check('todo simbolo tem id, nome, peso e cor',
    SIMBOLOS.every((s) => s.id && s.nome && s.peso > 0 && typeof s.cor === 'number'))
  check('RTP entre 88% e 96%', rtp >= 88 && rtp <= 96, rtp.toFixed(2) + '%')
  check('esperado() bate com a enumeracao', Math.abs(slots.esperado() - rtp) < 1e-9, slots.esperado().toFixed(4) + '% vs ' + rtp.toFixed(4) + '%')
  check('frequencia() bate com a enumeracao', Math.abs(slots.frequencia() - freq) < 1e-9, freq.toFixed(2) + '% dos giros pagam')

  // Trinca tem que pagar muito mais que par, e o sete tem que ser o jackpot.
  let ordemOk = true
  for (const s of SIMBOLOS) {
    const t = PAGAMENTOS.trinca[s.id] || 0
    const p = PAGAMENTOS.par[s.id] || 0
    if (t <= p) ordemOk = false
  }
  check('trinca paga mais que par em todo simbolo', ordemOk)

  const maiorTrinca = Math.max(...SIMBOLOS.map((s) => PAGAMENTOS.trinca[s.id] || 0))
  check('o sete e o jackpot', PAGAMENTOS.trinca.sete === maiorTrinca && maiorTrinca >= 500, 'trinca de sete paga ' + PAGAMENTOS.trinca.sete + 'x')

  // Peso vs premio: quanto mais raro, mais paga.
  let monotono = true
  for (let i = 1; i < SIMBOLOS.length; i++) {
    if (SIMBOLOS[i].peso > SIMBOLOS[i - 1].peso) monotono = false
    if ((PAGAMENTOS.trinca[SIMBOLOS[i].id] || 0) < (PAGAMENTOS.trinca[SIMBOLOS[i - 1].id] || 0)) monotono = false
  }
  check('simbolo mais raro paga mais (lista ordenada)', monotono)
}

// --- 14) caca-niquel: girar() se comporta ----------------------------------

{
  const slots = criarSlots({ rng: semente(31337) })
  let ruins = 0
  let pago = 0
  let apostado = 0
  const N = 200000
  const APOSTA = 10
  const vistos = new Set()
  for (let i = 0; i < N; i++) {
    const g = slots.girar(APOSTA)
    apostado += APOSTA
    pago += g.premio
    if (g.simbolos.length !== 3) ruins++
    if (g.simbolos.some((s) => !Number.isInteger(s) || s < 0 || s >= SIMBOLOS.length)) ruins++
    if (!Number.isInteger(g.premio) || g.premio < 0) ruins++
    if (g.tipo === 'nada' && g.premio !== 0) ruins++
    if (g.tipo !== 'nada' && g.premio === 0) ruins++
    const [a, b, c] = g.simbolos
    if (a === b && b === c && SIMBOLOS[a].id === 'sete' && g.tipo !== 'jackpot') ruins++
    vistos.add(g.tipo)
  }
  check('girar() sempre devolve 3 simbolos validos e premio inteiro', ruins === 0, ruins + ' giros ruins')
  check('todos os tipos aparecem em 200k giros', vistos.has('nada') && vistos.has('par') && vistos.has('trinca'), [...vistos].join(','))

  // A simulacao nao PROVA o RTP (isso a enumeracao ja fez), mas se ela sair
  // longe demais e porque o sorteio nao esta respeitando os pesos.
  const medido = (pago / apostado) * 100
  check('simulacao de 200k giros fica perto do RTP calculado', Math.abs(medido - slots.esperado()) < 6,
    medido.toFixed(2) + '% medido vs ' + slots.esperado().toFixed(2) + '% calculado')
}

// --- resultado -------------------------------------------------------------

const bad = results.filter((r) => !r.ok).length
console.log('\n' + (results.length - bad) + '/' + results.length + ' casos passaram')
process.exit(bad ? 1 : 0)
