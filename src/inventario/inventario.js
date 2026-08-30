// ---------------------------------------------------------------------------
// src/inventario/inventario.js — a mochila do jogador: 9 vagas.
//
// ELE E A BARRA DE ITENS. Ate ontem nao era: havia uma hotbar separada (o que
// estava na mao — maos, revolver — nas teclas 1 e 2) e, embaixo dela, estas nove
// vagas, que so respondiam a clique. O dono do projeto pediu UMA BARRA SO, de 1
// a 9, e as duas viraram esta: as nove vagas ganharam as teclas numericas e o
// revolver passou a ocupar uma vaga como qualquer outra coisa.
//
// O QUE MUDOU AQUI DENTRO POR CAUSA DISSO: NADA. Continua sendo `{ id, qtd }`
// por vaga e nada mais. Quem decide o que acontece ao selecionar uma vaga
// (movel vai pro encaixe, revolver equipa, bebida vai pra mao) e o main, em
// aplicarVaga() — este modulo nao equipa nada e nao conhece item nenhum de
// nome, que e o que o mantem do tamanho que ele tem.
//
// O QUE CADA VAGA GUARDA: `{ id, qtd }` e mais nada. Nem Object3D, nem posicao
// no mundo, nem preco. E o que faz o save ser quatro linhas de JSON em vez de
// um serializador de cena, e e o que deixa este arquivo sem uma linha de DOM e
// sem uma linha de three.
//
// A POSICAO IMPORTA: `slots` tem SEMPRE 9 posicoes e `null` quer dizer vazia.
// Compactar a lista ao retirar reorganizaria a mochila do jogador nas costas
// dele — e mochila e uma coisa que a pessoa arruma.
//
// TODA OPERACAO E ATOMICA, igual as da carteira: `adicionar` devolve a vaga ou
// -1 SEM TER MEXIDO EM NADA. E o que permite a regra de compra da loja, que e
// inegociavel e vem na mesma ordem da aposta do cassino:
//
//   1. inventario.temEspacoPara(...)   nao tem -> avisa, nada acontece
//   2. carteira.gastarOuro(total)      false   -> avisa, nada acontece
//   3. inventario.adicionar(...)       so aqui o item passa a existir
//
// Cobrar antes de conferir a vaga = o jogador paga e nao recebe. Adicionar
// antes de cobrar = ele leva de graca.
//
// NAO PERSISTE SOZINHO, de proposito. A carteira grava numa chave global
// ('mcrp-carteira') porque nasceu antes do save em slots; repetir isso aqui
// criaria uma segunda verdade que brigaria com o slot na hora de carregar.
// Quem guarda e o save, por serializar()/aplicar().
// ---------------------------------------------------------------------------

/** Quantas vagas. Nove porque foi o que o dono do projeto pediu, e porque nove
 *  e o que cabe nas teclas de 1 a 9 sem inventar um segundo gesto pra chegar na
 *  decima. O 480 px que este comentario citava era da epoca das duas barras. */
export const VAGAS = 9

/** Teto por vaga. Fichas de sinuca empilham; movel nao (ver empilha()). */
export const PILHA_MAX = 99

function inteiro(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? n : 0
}

export function criarInventario(opcoes = {}) {
  const vagas = Math.max(1, inteiro(opcoes.vagas) || VAGAS)
  /**
   * Quantos cabem numa vaga de cada id. Quem responde e o CATALOGO (a mobilia
   * diz `empilha: 99` na ficha da ficha de sinuca e nada nas outras), e nao uma
   * regra escrita aqui: este modulo nao conhece item nenhum de nome.
   */
  const limiteDe = typeof opcoes.limiteDe === 'function' ? opcoes.limiteDe : () => 1

  const slots = new Array(vagas).fill(null)
  const ouvintes = []

  function avisar(motivo) {
    for (let i = 0; i < ouvintes.length; i++) {
      try { ouvintes[i](api, motivo) } catch (err) { void err }
    }
  }

  /** Quantas unidades de `id` ainda cabem numa vaga que ja tem esse id. */
  function folgaDaVaga(i, id) {
    const s = slots[i]
    if (!s || s.id !== id) return 0
    return Math.max(0, limiteDe(id) - s.qtd)
  }

  /**
   * Simula a distribuicao de `qtd` unidades de `id` e devolve quantas VAGAS
   * NOVAS seriam gastas, ou -1 se nao couber. Nao escreve nada — e a mesma
   * funcao que responde `temEspacoPara`, `vagasPara` e o proprio `adicionar`,
   * pra nao existirem tres contas que podem discordar.
   */
  function simular(id, qtd) {
    let falta = Math.max(0, inteiro(qtd))
    if (!id || !falta) return 0
    // primeiro completa as pilhas que ja existem
    for (let i = 0; i < slots.length && falta > 0; i++) falta -= Math.min(falta, folgaDaVaga(i, id))
    if (falta <= 0) return 0
    // depois abre vagas novas
    const porVaga = Math.max(1, limiteDe(id))
    let novas = 0
    for (let i = 0; i < slots.length && falta > 0; i++) {
      if (slots[i]) continue
      novas++
      falta -= Math.min(falta, porVaga)
    }
    return falta > 0 ? -1 : novas
  }

  const api = {
    get vagas() { return vagas },

    /** Copia rasa pra leitura: quem desenha o HUD nao pode escrever na mochila. */
    get slots() {
      const out = new Array(vagas)
      for (let i = 0; i < vagas; i++) out[i] = slots[i] ? { id: slots[i].id, qtd: slots[i].qtd } : null
      return out
    },

    /** A vaga `i`, ou null. Objeto vivo NAO: mesma razao do getter acima. */
    ver(i) {
      const s = slots[i | 0]
      return s ? { id: s.id, qtd: s.qtd } : null
    },

    /** Quantas unidades deste id existem somando todas as vagas. */
    quantidade(id) {
      let n = 0
      for (let i = 0; i < slots.length; i++) if (slots[i] && slots[i].id === id) n += slots[i].qtd
      return n
    },

    get livres() {
      let n = 0
      for (let i = 0; i < slots.length; i++) if (!slots[i]) n++
      return n
    },

    /** Cabe? Pergunta que a LOJA faz antes de cobrar. */
    temEspacoPara(id, qtd) { return simular(id, qtd) >= 0 },

    /** Quantas vagas VAZIAS a compra gastaria (pro carrinho mostrar). -1 = nao cabe. */
    vagasPara(id, qtd) { return simular(id, qtd) },

    /**
     * Guarda. Devolve a ULTIMA vaga usada (pra ela piscar no HUD) ou -1 quando
     * nao cabe — e nesse caso nada foi escrito.
     */
    adicionar(id, qtd) {
      const total = Math.max(0, inteiro(qtd))
      if (!id || !total) return -1
      if (simular(id, total) < 0) return -1
      let falta = total
      let ultima = -1
      for (let i = 0; i < slots.length && falta > 0; i++) {
        const cabe = folgaDaVaga(i, id)
        if (!cabe) continue
        const leva = Math.min(falta, cabe)
        slots[i].qtd += leva
        falta -= leva
        ultima = i
      }
      const porVaga = Math.max(1, limiteDe(id))
      for (let i = 0; i < slots.length && falta > 0; i++) {
        if (slots[i]) continue
        const leva = Math.min(falta, porVaga)
        slots[i] = { id, qtd: leva }
        falta -= leva
        ultima = i
      }
      avisar('adicionar')
      return ultima
    },

    /**
     * Tira da vaga `i`. Devolve `{ id, qtd }` do que saiu, ou null.
     * E quem o ENCAIXE chama, e so DEPOIS que o jogador confirma o movel no
     * chao: cancelar nao precisa de desfazer porque nada tinha saido.
     */
    retirar(i, qtd) {
      const s = slots[i | 0]
      if (!s) return null
      const leva = Math.min(s.qtd, Math.max(1, inteiro(qtd) || 1))
      s.qtd -= leva
      const saiu = { id: s.id, qtd: leva }
      if (s.qtd <= 0) slots[i | 0] = null
      avisar('retirar')
      return saiu
    },

    /** Troca duas vagas de lugar. E como o jogador arruma a mochila. */
    mover(a, b) {
      const i = a | 0, j = b | 0
      if (i === j || i < 0 || j < 0 || i >= vagas || j >= vagas) return false
      const t = slots[i]; slots[i] = slots[j]; slots[j] = t
      avisar('mover')
      return true
    },

    limpar() {
      for (let i = 0; i < slots.length; i++) slots[i] = null
      avisar('limpar')
    },

    /** Pro save. `v` existe pra quando 9 virar 12. */
    serializar() {
      return {
        v: 1,
        vagas,
        slots: slots.map((s) => (s ? { id: s.id, q: s.qtd } : null)),
      }
    },

    /**
     * Do save de volta. Tolerante por construcao, igual ao ler() da carteira:
     * arquivo estragado devolve mochila vazia em silencio, porque o pior caso e
     * o jogador perder a mochila e o melhor caso de um throw aqui e a tela
     * branca.
     */
    aplicar(dados) {
      for (let i = 0; i < slots.length; i++) slots[i] = null
      const lista = dados && Array.isArray(dados.slots) ? dados.slots : []
      for (let i = 0; i < Math.min(vagas, lista.length); i++) {
        const s = lista[i]
        if (!s || typeof s.id !== 'string') continue
        const q = Math.max(1, inteiro(s.q))
        slots[i] = { id: s.id, qtd: Math.min(q, Math.max(1, limiteDe(s.id))) }
      }
      avisar('aplicar')
    },

    aoMudar(fn) {
      if (typeof fn !== 'function') return () => {}
      ouvintes.push(fn)
      return () => {
        const i = ouvintes.indexOf(fn)
        if (i >= 0) ouvintes.splice(i, 1)
      }
    },
  }

  return api
}

export default criarInventario
