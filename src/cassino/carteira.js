// ---------------------------------------------------------------------------
// src/cassino/carteira.js — o dinheiro do jogador.
//
// DUAS MOEDAS, e a diferenca entre elas e a regra do lugar:
//
//   OURO   e o dinheiro da rua. E com ele que se aposta no blackjack (a mesa
//          da atendente aceita dinheiro vivo) e e ele que o caixa do cassino
//          troca por ficha.
//   FICHA  e o dinheiro de DENTRO do cassino. Maquina caca-niquel e mesa de
//          poker so aceitam ficha. Quem quer jogar passa no caixa primeiro —
//          que e exatamente como funciona num cassino de verdade, e e o que
//          da sentido ao caixa existir.
//
// A conversao e 1 por 1 nos dois sentidos, de proposito: taxa de cambio e um
// imposto invisivel que so serve pra o jogador achar que foi roubado.
//
// PERSISTENCIA: localStorage, sob uma chave so. Nao vai pro servidor —
// REDE.md nao tem pacote de dinheiro, e inventar um significaria mexer no
// protocolo (que tem outro dono) e no servidor. Cada maquina guarda a propria
// carteira, do mesmo jeito que cada maquina desenha a propria chuva.
//
// TODO NUMERO E INTEIRO E NUNCA FICA NEGATIVO. As duas garantias moram aqui e
// em nenhum outro lugar: quem gasta chama gastarOuro/gastarFichas e recebe
// true/false. Um jogo que subtrai do saldo por conta propria mais cedo ou mais
// tarde deixa o jogador com -30 fichas depois de um double num saldo curto.
// ---------------------------------------------------------------------------

const CHAVE = 'mcrp-carteira'

/** Quanto o jogador tem no primeiro dia.
 *
 *  ERA 1500 — "alto o bastante pra perder algumas maos, baixo o bastante pra se
 *  importar". Subiu pra 100.000 A PEDIDO DO DONO DO PROJETO, pra dar pra testar
 *  as compras (a loja de jogos vai a 1750 a peca e o mercado abriu agora com as
 *  bebidas). E um numero de BANCADA, nao de balanceamento: quando as compras
 *  estiverem testadas, isto volta pra casa dos milhares. */
export const OURO_INICIAL = 100000

/** Versao do registro gravado no localStorage.
 *
 *  Existe por um motivo so, e o motivo e o numero acima: a carteira grava
 *  sozinha e ler() devolve o que estiver la, entao mudar OURO_INICIAL nao muda
 *  NADA pra quem ja jogou uma vez nesta maquina — o dono do projeto pediu 100
 *  mil pra testar e continuaria com os 1500 do primeiro dia dele. Quando o
 *  registro lido e mais velho que esta versao, a carteira COMPLETA a mao ate
 *  OURO_INICIAL (nunca tira: quem tiver mais que isso fica com o que tem) e
 *  passa a gravar com a versao nova, entao o remendo roda uma vez so. */
const VERSAO = 2

/** Piso de misericordia: quebrou de vez, o caixa "adianta" isto. Sem isso o
 *  cassino vira uma sala que o jogador visita uma vez e nunca mais. */
export const CORTESIA = 250

function inteiro(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? n : 0
}

function ler() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return null
    const o = JSON.parse(cru)
    if (!o || typeof o !== 'object') return null
    return {
      v: inteiro(o.v),
      ouro: Math.max(0, inteiro(o.ouro)),
      // BANCO: o terceiro inteiro. Save antigo nao tem o campo e inteiro() de
      // undefined devolve 0 — ler() ja e tolerante por construcao, entao nao
      // houve migracao nenhuma. Nenhum jogo do cassino le este campo: ele
      // existe pra aparecer no HUD e pro caixa/save escreverem.
      banco: Math.max(0, inteiro(o.banco)),
      fichas: Math.max(0, inteiro(o.fichas)),
      // Maior aposta e maior premio: nao mudam nada mecanicamente, sao
      // memoria. E o que faz o jogador contar a historia depois.
      recorde: Math.max(0, inteiro(o.recorde)),
      maosJogadas: Math.max(0, inteiro(o.maosJogadas)),
    }
  } catch (err) { void err; return null }
}

export function criarCarteira(opts = {}) {
  const salvo = ler()
  const est = salvo || {
    v: VERSAO,
    ouro: OURO_INICIAL,
    banco: 0,
    fichas: 0,
    recorde: 0,
    maosJogadas: 0,
  }
  // Registro de antes da VERSAO 2: completa a mao ate o inicial novo. Ver o
  // comentario de VERSAO — e um remendo de bancada, e ele se apaga sozinho
  // porque a proxima gravacao ja sai carimbada.
  if (salvo && est.v < VERSAO) {
    est.v = VERSAO
    if (est.ouro < OURO_INICIAL) est.ouro = OURO_INICIAL
  }

  const ouvintes = []
  let salvarPendente = 0

  function gravar() {
    // Agrupa gravacoes: uma mao de blackjack mexe no saldo 3 ou 4 vezes e
    // escrever no localStorage e sincrono (trava a thread do desenho).
    if (salvarPendente) return
    salvarPendente = setTimeout(() => {
      salvarPendente = 0
      try { localStorage.setItem(CHAVE, JSON.stringify(est)) } catch (err) { void err }
    }, 250)
  }

  function avisar(motivo) {
    gravar()
    for (let i = 0; i < ouvintes.length; i++) {
      try { ouvintes[i](api, motivo) } catch (err) { void err }
    }
  }

  const api = {
    get ouro() { return est.ouro },
    get banco() { return est.banco },
    get fichas() { return est.fichas },
    get recorde() { return est.recorde },
    get maosJogadas() { return est.maosJogadas },

    /** Registra um ouvinte de mudanca. Devolve a funcao que o remove. */
    aoMudar(fn) {
      if (typeof fn !== 'function') return () => {}
      ouvintes.push(fn)
      return () => {
        const i = ouvintes.indexOf(fn)
        if (i >= 0) ouvintes.splice(i, 1)
      }
    },

    temOuro(n) { return est.ouro >= Math.max(0, inteiro(n)) },
    temFichas(n) { return est.fichas >= Math.max(0, inteiro(n)) },

    /** Tira ouro. false = nao tinha, e NADA foi cobrado. */
    gastarOuro(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return true
      if (est.ouro < v) return false
      est.ouro -= v
      avisar('ouro')
      return true
    },

    ganharOuro(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return 0
      est.ouro += v
      if (v > est.recorde) est.recorde = v
      avisar('ouro')
      return v
    },

    gastarFichas(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return true
      if (est.fichas < v) return false
      est.fichas -= v
      avisar('fichas')
      return true
    },

    ganharFichas(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return 0
      est.fichas += v
      if (v > est.recorde) est.recorde = v
      avisar('fichas')
      return v
    },

    /** Guarda ouro no banco. false = nao tinha, e nada saiu da mao. */
    depositar(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return true
      if (est.ouro < v) return false
      est.ouro -= v
      est.banco += v
      avisar('banco')
      return true
    },

    /** Tira do banco pra mao. */
    sacar(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0) return true
      if (est.banco < v) return false
      est.banco -= v
      est.ouro += v
      avisar('banco')
      return true
    },

    /**
     * Escreve a carteira inteira. So o SAVE chama isto.
     *
     * Ele existe porque esta carteira grava sozinha numa chave GLOBAL do
     * localStorage: sem um caminho de escrita, carregar o slot 3 deixaria o
     * jogador com o ouro do slot 1.
     */
    aplicar(dados) {
      const d = dados || {}
      est.v = VERSAO
      est.ouro = Math.max(0, inteiro(d.ouro))
      est.banco = Math.max(0, inteiro(d.banco))
      est.fichas = Math.max(0, inteiro(d.fichas))
      est.recorde = Math.max(0, inteiro(d.recorde))
      est.maosJogadas = Math.max(0, inteiro(d.maosJogadas))
      avisar('aplicar')
    },

    /** Pro save. E o MESMO formato que ler() aceita de volta. */
    serializar() {
      return {
        v: VERSAO,
        ouro: est.ouro, banco: est.banco, fichas: est.fichas,
        recorde: est.recorde, maosJogadas: est.maosJogadas,
      }
    },

    /** Caixa: ouro -> ficha, 1 por 1. */
    comprarFichas(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0 || est.ouro < v) return false
      est.ouro -= v
      est.fichas += v
      avisar('cambio')
      return true
    },

    /** Caixa: ficha -> ouro, 1 por 1. */
    venderFichas(n) {
      const v = Math.max(0, inteiro(n))
      if (v === 0 || est.fichas < v) return false
      est.fichas -= v
      est.ouro += v
      avisar('cambio')
      return true
    },

    /** Contador de maos jogadas (blackjack, poker, giro de caca-niquel). */
    contarMao() { est.maosJogadas += 1; gravar() },

    /** Quebrou? So quando NAO tem como jogar nada: nem ouro nem ficha. */
    get quebrado() { return est.ouro <= 0 && est.fichas <= 0 },

    /** O caixa adianta uma cortesia pra quem zerou. Devolve quanto entrou
     *  (0 se o jogador ainda tinha com que jogar). */
    cortesia() {
      if (!api.quebrado) return 0
      est.ouro += CORTESIA
      avisar('cortesia')
      return CORTESIA
    },

    /** So para teste e para o console: zera tudo e volta ao primeiro dia. */
    reiniciar() {
      est.ouro = OURO_INICIAL
      est.fichas = 0
      est.recorde = 0
      est.maosJogadas = 0
      avisar('reiniciar')
    },
  }

  // HUD opcional: se veio, ja recebe o saldo inicial e cada mudanca depois.
  if (opts.hud && typeof opts.hud.setDinheiro === 'function') {
    api.aoMudar(() => opts.hud.setDinheiro(est.ouro, est.fichas, est.banco))
    opts.hud.setDinheiro(est.ouro, est.fichas, est.banco)
  }

  return api
}

export default criarCarteira
