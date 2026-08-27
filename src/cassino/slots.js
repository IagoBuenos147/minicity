// ---------------------------------------------------------------------------
// src/cassino/slots.js — o caca-niquel de tres rolos.
//
// A maquina inteira e uma tabela de PESOS e uma tabela de PREMIOS. Nao existe
// "sensacao" nenhuma escondida aqui dentro: nada de "quase ganhou de proposito",
// nada de contador secreto que segura o jackpot. O sorteio de cada rolo e
// independente e usa os pesos abaixo, ponto.
//
// O RTP (retorno ao jogador) SAI DESSAS DUAS TABELAS e de mais nada. Como sao
// 7 simbolos e 3 rolos independentes, o espaco de resultados tem 343 combinacoes
// e da pra CALCULAR o retorno exato somando tudo — nao precisa (e nao deve)
// estimar por simulacao. esperado() faz essa conta, e tools/teste-cassino.mjs
// refaz ela por fora e falha se sair da faixa de 88% a 96%.
//
// Por que essa faixa: abaixo de 88% o jogador sente que a maquina rouba e para
// de puxar a alavanca; acima de 96% o caca-niquel vira uma fonte de dinheiro e
// esvazia o resto do cassino. A configuracao atual da 92,02%.
//
// COMO LER PESO: peso alto = simbolo comum. A cereja e o simbolo que mais
// aparece e o que menos paga; o sete e o mais raro e o que paga o jackpot.
// Mudou um peso, mudou o RTP — rode o teste.
//
// Logica pura: sem DOM, sem three.js. 'cor' esta aqui porque a UI e o letreiro
// 3D desenham os simbolos a partir desta lista, e ter duas paletas (uma na
// logica, outra no desenho) e como as duas saem de sincronia.
// ---------------------------------------------------------------------------

/** Os simbolos do rolo. Mesma lista nos tres rolos: rolos diferentes dariam
 *  outra distribuicao e a conta do RTP deixaria de ser esse laco triplo. */
export const SIMBOLOS = [
  { id: 'cereja', nome: 'Cereja', peso: 22, cor: 0xd6314a },
  { id: 'limao', nome: 'Limao', peso: 20, cor: 0xdfe04a },
  { id: 'sino', nome: 'Sino', peso: 16, cor: 0xd9a441 },
  { id: 'ferradura', nome: 'Ferradura', peso: 12, cor: 0x9aa0a6 },
  { id: 'estrela', nome: 'Estrela', peso: 9, cor: 0x5ec8f0 },
  { id: 'diamante', nome: 'Diamante', peso: 6, cor: 0x8be5dc },
  { id: 'sete', nome: 'Sete', peso: 4, cor: 0xff3b2f },
]

/**
 * Multiplicadores da aposta. TRINCA e tres iguais; PAR e exatamente dois iguais.
 *
 * Repare que limao e sino NAO pagam par, e cereja paga. Nao e engano: par de
 * cereja cai em ~13,8% dos giros e sozinho ja e 13,8% do retorno da maquina —
 * ele e o troco que mantem o jogador na alavanca entre um premio e outro. Se
 * limao e sino tambem pagassem par, o retorno passaria de 110% e a unica saida
 * seria cortar as trincas ate elas nao valerem mais nada.
 */
export const PAGAMENTOS = {
  trinca: { cereja: 6, limao: 10, sino: 18, ferradura: 35, estrela: 70, diamante: 180, sete: 1000 },
  par: { cereja: 1, limao: 0, sino: 0, ferradura: 1, estrela: 2, diamante: 3, sete: 5 },
}

/** Trinca de sete e o jackpot da casa. Fica numa constante porque a UI, o
 *  letreiro e o som precisam do mesmo id. */
export const ID_JACKPOT = 'sete'

const N = SIMBOLOS.length
const PESO_TOTAL = (() => {
  let s = 0
  for (let i = 0; i < N; i++) s += SIMBOLOS[i].peso
  return s
})()

/**
 * Multiplicador de uma combinacao ja sorteada, por INDICE de simbolo.
 * Usado tanto pra pagar o giro quanto pra enumerar o RTP — as duas coisas TEM
 * que passar pela mesma funcao, senao um dia a tabela de premios e a conta do
 * retorno divergem e ninguem descobre.
 */
function multiplicador(a, b, c) {
  if (a === b && b === c) return PAGAMENTOS.trinca[SIMBOLOS[a].id] || 0
  // Exatamente dois iguais: o par e o simbolo repetido.
  if (a === b || a === c) return PAGAMENTOS.par[SIMBOLOS[a].id] || 0
  if (b === c) return PAGAMENTOS.par[SIMBOLOS[b].id] || 0
  return 0
}

/** Classifica a combinacao pro painel e pro efeito na tela. */
function classificar(a, b, c) {
  if (a === b && b === c) {
    const s = SIMBOLOS[a]
    if (s.id === ID_JACKPOT) return { tipo: 'jackpot', nome: 'JACKPOT — trinca de ' + s.nome }
    return { tipo: 'trinca', nome: 'Trinca de ' + s.nome }
  }
  let rep = -1
  if (a === b || a === c) rep = a
  else if (b === c) rep = b
  if (rep >= 0 && (PAGAMENTOS.par[SIMBOLOS[rep].id] || 0) > 0) {
    return { tipo: 'par', nome: 'Par de ' + SIMBOLOS[rep].nome }
  }
  return { tipo: 'nada', nome: 'Nada' }
}

/**
 * RTP exato, em porcentagem. Enumera as 343 combinacoes: cada uma acontece
 * peso[a]*peso[b]*peso[c] vezes em PESO_TOTAL^3 casos igualmente provaveis,
 * entao somar casos*multiplicador e dividir pelo total da o retorno medio por
 * unidade apostada — sem amostragem, sem margem de erro.
 */
function calcularRtp() {
  const total = PESO_TOTAL * PESO_TOTAL * PESO_TOTAL
  let soma = 0
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      for (let c = 0; c < N; c++) {
        const m = multiplicador(a, b, c)
        if (m > 0) soma += SIMBOLOS[a].peso * SIMBOLOS[b].peso * SIMBOLOS[c].peso * m
      }
    }
  }
  return (soma / total) * 100
}

// Constante da tabela, nao do estado: calcula uma vez no carregamento do modulo.
const RTP = calcularRtp()

/** Chance de o giro pagar alguma coisa, em %. So pro painel — nao muda regra
 *  nenhuma, mas e o numero que explica por que a maquina parece "morta" em
 *  tres de cada quatro giros. */
function calcularFrequencia() {
  const total = PESO_TOTAL * PESO_TOTAL * PESO_TOTAL
  let casos = 0
  for (let a = 0; a < N; a++) {
    for (let b = 0; b < N; b++) {
      for (let c = 0; c < N; c++) {
        if (multiplicador(a, b, c) > 0) casos += SIMBOLOS[a].peso * SIMBOLOS[b].peso * SIMBOLOS[c].peso
      }
    }
  }
  return (casos / total) * 100
}

const FREQUENCIA = calcularFrequencia()

export function criarSlots(opts = {}) {
  const sorteio = typeof opts.rng === 'function' ? opts.rng : Math.random

  /** Um rolo. Roleta de pesos: sorteia um ponto na soma dos pesos e anda a
   *  tabela ate passar dele. Com 7 simbolos o laco linear e mais barato que
   *  qualquer tabela pre-montada, e nao aloca nada. */
  function rolo() {
    const alvo = sorteio() * PESO_TOTAL
    let acc = 0
    for (let i = 0; i < N; i++) {
      acc += SIMBOLOS[i].peso
      if (alvo < acc) return i
    }
    // So chega aqui se o rng devolver 1.0 cravado. Sem esse return, a funcao
    // devolveria undefined e a combinacao inteira viraria NaN.
    return N - 1
  }

  return {
    /**
     * Gira. 'premio' e QUANTO O JOGADOR RECEBE (a aposta ja foi debitada pela
     * UI, igual ao blackjack e ao poker) — nao e lucro. Mesma convencao nos
     * tres jogos, de proposito: um jogo com convencao diferente e um bug de
     * pagamento esperando o dia certo.
     */
    girar(aposta) {
      const v = Math.max(0, Math.floor(aposta) || 0)
      const a = rolo()
      const b = rolo()
      const c = rolo()
      const mult = multiplicador(a, b, c)
      const cls = classificar(a, b, c)
      return {
        simbolos: [a, b, c],
        premio: mult > 0 ? Math.round(v * mult) : 0,
        multiplicador: mult,
        tipo: cls.tipo,
        nome: cls.nome,
      }
    },

    /** Retorno esperado em %, exato. Vai no painel da maquina — um caca-niquel
     *  que mostra o proprio RTP e mais honesto que qualquer um de verdade. */
    esperado() { return RTP },

    /** Chance de o giro pagar algo, em %. */
    frequencia() { return FREQUENCIA },

    /** Tabela de premios pronta pra UI desenhar, do maior pro menor. */
    tabela() {
      return SIMBOLOS.map((s) => ({
        id: s.id,
        nome: s.nome,
        cor: s.cor,
        trinca: PAGAMENTOS.trinca[s.id] || 0,
        par: PAGAMENTOS.par[s.id] || 0,
      })).sort((x, y) => y.trinca - x.trinca)
    },
  }
}

export default criarSlots
