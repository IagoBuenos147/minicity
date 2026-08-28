import { MOBILIA, CATEGORIAS, itemDe } from '../mobilia/catalogo.js'

// ---------------------------------------------------------------------------
// src/ui/loja-ui.js — a vitrine da loja de jogos.
//
// A FORMA e a que o dono do projeto pediu: barra de titulo, abas de categoria,
// grade de cards com foto e preco, um contador -/+ por item e um carrinho a
// direita com total e botao de comprar.
//
// A COR nao e nova. Cada valor daqui foi copiado de src/ui/cassino-ui.js: o
// mesmo vidro escuro, a mesma borda dourada, a mesma faixa de neon correndo no
// topo, o mesmo feltro. E o que impede a janela de parecer uma caixa de dialogo
// do sistema colada por cima do jogo — ela e o cassino falando de sinuca.
//
// A ORDEM DA COMPRA E INEGOCIAVEL, e e a mesma da aposta do cassino:
//
//   1. inventario.temEspacoPara(...)  nao tem -> avisa, NADA acontece
//   2. carteira.gastarOuro(total)     false   -> avisa, NADA acontece
//   3. inventario.adicionar(...)      so aqui o item passa a existir
//
// Cobrar antes de conferir a vaga faz o jogador pagar e nao receber; adicionar
// antes de cobrar faz ele levar de graca. E por isso que o botao COMPRAR ja
// nasce desabilitado quando falta vaga: o aviso chega antes do clique, e o
// clique so tem um caminho.
// ---------------------------------------------------------------------------

const CSS = `
.mcrp-loja, .mcrp-loja * { box-sizing: border-box; }
.mcrp-loja {
  position: fixed; inset: 0; z-index: 68;
  display: flex; align-items: center; justify-content: center;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f2ece0; opacity: 0; pointer-events: none;
  transition: opacity .18s ease;
}
.mcrp-loja.on { opacity: 1; pointer-events: auto; }
.mcrp-loja .veu {
  position: absolute; inset: 0;
  background: radial-gradient(120% 100% at 50% 34%, rgba(10,44,32,.42) 0%, rgba(3,6,9,.84) 72%, rgba(2,3,5,.92) 100%);
}
.mcrp-loja .painel {
  position: relative; width: min(1040px, 94vw); max-height: 88vh;
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 16px;
  background: linear-gradient(158deg, rgba(26,29,36,.93), rgba(10,12,16,.96));
  border: 1px solid rgba(233,196,106,.26);
  box-shadow: 0 34px 92px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.06);
  transform: translateY(10px); transition: transform .18s ease;
}
.mcrp-loja.on .painel { transform: translateY(0); }
.mcrp-loja .neon {
  height: 4px; flex: 0 0 4px;
  background: linear-gradient(90deg,#ffd98a,#c9394f,#ffd98a,#2fa87a,#ffd98a);
  background-size: 280% 100%;
  animation: lojaNeon 7s linear infinite;
}
@keyframes lojaNeon { from { background-position: 0 0 } to { background-position: 280% 0 } }

.mcrp-loja .topo {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px 10px;
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.mcrp-loja .kicker {
  font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: #e9c46a;
}
.mcrp-loja h2 { margin: 2px 0 0; font-size: 21px; font-weight: 700; letter-spacing: .01em; }
.mcrp-loja .bolso { margin-left: auto; display: flex; gap: 8px; }
.mcrp-loja .moeda {
  display: flex; align-items: center; gap: 7px;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(0,0,0,.34); border: 1px solid rgba(255,255,255,.09);
}
.mcrp-loja .moeda i {
  font-style: normal; font-size: 9px; letter-spacing: .15em;
  text-transform: uppercase; color: #9aa2b2;
}
.mcrp-loja .moeda b { font-variant-numeric: tabular-nums; font-size: 15px; color: #ffe1a4; }
.mcrp-loja .x {
  width: 30px; height: 30px; border-radius: 8px; cursor: pointer;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10);
  color: #cfd6e2; font-size: 15px; line-height: 1;
}
.mcrp-loja .x:hover { background: rgba(201,57,79,.24); border-color: rgba(201,57,79,.5); }

.mcrp-loja .abas { display: flex; gap: 6px; padding: 10px 18px 0; flex-wrap: wrap; }
.mcrp-loja .aba {
  padding: 7px 14px; border-radius: 999px; cursor: pointer;
  font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  color: #9aa2b2; transition: color .14s ease, border-color .14s ease, background .14s ease;
}
.mcrp-loja .aba:hover { color: #f2ece0; }
.mcrp-loja .aba.on {
  color: #241c0c; border-color: rgba(233,196,106,.55);
  background: linear-gradient(180deg,#ffd98a,#e2a83c);
  box-shadow: 0 4px 16px rgba(226,168,60,.32);
}

.mcrp-loja .meio {
  display: grid; grid-template-columns: 1fr 288px; gap: 14px;
  padding: 12px 18px 0; min-height: 0; flex: 1 1 auto;
}
.mcrp-loja .grade {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 10px; overflow-y: auto; padding: 10px; border-radius: 12px;
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.017) 0 3px, rgba(0,0,0,.017) 3px 6px),
    radial-gradient(130% 130% at 50% -10%, #1b6b4e 0%, #0e4232 62%, #0a3225 100%);
  border: 1px solid rgba(0,0,0,.35);
}
.mcrp-loja .card {
  border-radius: 11px; padding: 8px; cursor: pointer;
  background: linear-gradient(170deg, rgba(24,27,33,.92), rgba(12,14,18,.95));
  border: 1px solid rgba(255,255,255,.08);
  transition: border-color .14s ease, transform .1s ease;
}
.mcrp-loja .card:hover { border-color: rgba(233,196,106,.45); transform: translateY(-2px); }
.mcrp-loja .card.sel { border-color: #e9c46a; box-shadow: 0 6px 20px rgba(233,196,106,.2); }
.mcrp-loja .card .foto {
  width: 100%; aspect-ratio: 1; border-radius: 8px; margin-bottom: 6px;
  background: rgba(0,0,0,.26); display: block; object-fit: contain;
}
.mcrp-loja .card .esq {
  width: 100%; aspect-ratio: 1; border-radius: 8px; margin-bottom: 6px;
  background: linear-gradient(100deg, rgba(255,255,255,.03), rgba(255,255,255,.09), rgba(255,255,255,.03));
  background-size: 260% 100%; animation: lojaEsq 1.1s linear infinite;
}
@keyframes lojaEsq { from { background-position: 260% 0 } to { background-position: 0 0 } }
.mcrp-loja .card .q {
  display: inline-block; font-size: 8.5px; letter-spacing: .16em; text-transform: uppercase;
  padding: 2px 7px; border-radius: 999px; margin-bottom: 4px;
}
.mcrp-loja .card .q.comum { color: #8d95a4; border: 1px solid rgba(141,149,164,.4); }
.mcrp-loja .card .q.boa { color: #7ee0a6; border: 1px solid rgba(47,157,104,.55); }
.mcrp-loja .card .q.fina { color: #e9c46a; border: 1px solid rgba(233,196,106,.55); }
.mcrp-loja .card .nome { font-size: 12.5px; line-height: 1.28; min-height: 32px; }
.mcrp-loja .card .preco {
  font-size: 15px; font-weight: 700; color: #ffe1a4;
  font-variant-numeric: tabular-nums; margin: 3px 0 6px;
}
.mcrp-loja .step { display: flex; align-items: center; gap: 6px; }
.mcrp-loja .step button {
  width: 26px; height: 24px; border-radius: 6px; cursor: pointer; font-size: 14px; line-height: 1;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); color: #cfd6e2;
}
.mcrp-loja .step button:hover { background: rgba(233,196,106,.20); color: #e9c46a; }
.mcrp-loja .step .n {
  flex: 1; text-align: center; font-variant-numeric: tabular-nums;
  font-size: 13px; font-weight: 700;
}

.mcrp-loja .cart {
  display: flex; flex-direction: column; min-height: 0;
  border-radius: 12px; padding: 12px;
  background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.07);
}
.mcrp-loja .cart h3 {
  margin: 0 0 8px; font-size: 10px; letter-spacing: .2em;
  text-transform: uppercase; color: #e9c46a; font-weight: 600;
}
.mcrp-loja .linhas { flex: 1 1 auto; overflow-y: auto; min-height: 60px; }
.mcrp-loja .linha {
  display: flex; gap: 8px; font-size: 12px; padding: 4px 0;
  border-bottom: 1px dashed rgba(255,255,255,.06);
}
.mcrp-loja .linha span:first-child { flex: 1; color: #cfd6e2; }
.mcrp-loja .linha b { font-variant-numeric: tabular-nums; color: #ffe1a4; }
.mcrp-loja .vazio { color: #8d95a4; font-size: 12px; padding: 10px 0; }
.mcrp-loja .vagas { font-size: 11px; color: #9aa2b2; margin-top: 8px; }
.mcrp-loja .vagas.ruim { color: #f2a2a2; }
.mcrp-loja .total {
  display: flex; align-items: baseline; gap: 8px; margin-top: 6px;
  padding-top: 8px; border-top: 1px solid rgba(255,255,255,.09);
}
.mcrp-loja .total span { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #9aa2b2; }
.mcrp-loja .total b { margin-left: auto; font-size: 20px; color: #ffe1a4; font-variant-numeric: tabular-nums; }
.mcrp-loja .btn {
  margin-top: 10px; width: 100%; padding: 11px; border-radius: 10px; cursor: pointer;
  font-size: 12px; letter-spacing: .16em; text-transform: uppercase; font-weight: 700;
  border: 1px solid transparent; color: #241c0c;
  background: linear-gradient(180deg,#ffd98a,#e2a83c);
  box-shadow: 0 8px 22px rgba(226,168,60,.3);
}
.mcrp-loja .btn:disabled { cursor: not-allowed; filter: grayscale(.7) brightness(.62); box-shadow: none; }

.mcrp-loja .rodape {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 18px 14px; font-size: 11.5px; color: #8d95a4;
}
.mcrp-loja .recado { flex: 1; }
.mcrp-loja .recado.bom { color: #9fe6b4; }
.mcrp-loja .recado.ruim { color: #f2a2a2; }
`

let estiloPosto = false
function injetarEstilo() {
  if (estiloPosto) return
  estiloPosto = true
  const s = document.createElement('style')
  s.id = 'mcrp-loja-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

function el(tag, cls, pai, txt) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (txt !== undefined) e.textContent = txt
  if (pai) pai.appendChild(e)
  return e
}

function milhar(n) {
  const s = String(Math.abs(Math.round(n)))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.'
    out += s[i]
  }
  return (n < 0 ? '-' : '') + out
}

export function criarLojaUI({ game, carteira, inventario, fotoDe } = {}) {
  injetarEstilo()

  const raiz = el('div', 'mcrp-loja')
  raiz.setAttribute('aria-hidden', 'true')
  const veu = el('div', 'veu', raiz)
  const painel = el('div', 'painel', raiz)
  painel.tabIndex = -1
  el('div', 'neon', painel)

  const topo = el('div', 'topo', painel)
  const quem = el('div', null, topo)
  el('div', 'kicker', quem, 'CASA DE JOGOS')
  el('h2', null, quem, 'Taco de Ouro')
  const bolso = el('div', 'bolso', topo)
  const mMao = el('div', 'moeda', bolso)
  el('i', null, mMao, 'mao')
  const vMao = el('b', null, mMao, '0')
  const mBanco = el('div', 'moeda', bolso)
  el('i', null, mBanco, 'banco')
  const vBanco = el('b', null, mBanco, '0')
  const btnX = el('button', 'x', topo, '✕')

  const abas = el('div', 'abas', painel)
  const botoesAba = new Map()
  for (const c of CATEGORIAS) {
    const b = el('button', 'aba', abas, c.label)
    b.addEventListener('click', () => { categoria = c.id; pintar() })
    botoesAba.set(c.id, b)
  }

  const meio = el('div', 'meio', painel)
  const grade = el('div', 'grade', meio)
  const cart = el('div', 'cart', meio)
  el('h3', null, cart, 'Carrinho')
  const linhas = el('div', 'linhas', cart)
  const vagasTxt = el('div', 'vagas', cart)
  const totalBox = el('div', 'total', cart)
  el('span', null, totalBox, 'Total')
  const totalVal = el('b', null, totalBox, '0')
  const btnComprar = el('button', 'btn', cart, 'Comprar')

  const rodape = el('div', 'rodape', painel)
  const recado = el('div', 'recado', rodape)
  el('div', null, rodape, 'Esc fecha')

  document.body.appendChild(raiz)

  let aberto = false
  let categoria = 'tudo'
  let selecionado = null
  const carrinho = new Map()          // id -> quantidade
  const cards = new Map()             // id -> { raiz, foto, esq, n }
  let pendentes = []                  // ids sem foto ainda

  function avisar(txt, tom) {
    recado.textContent = txt || ''
    recado.classList.toggle('bom', tom === 'bom')
    recado.classList.toggle('ruim', tom === 'ruim')
  }

  function totalDoCarrinho() {
    let t = 0
    for (const [id, q] of carrinho) {
      const m = itemDe(id)
      if (m) t += m.preco * q
    }
    return t
  }

  /**
   * Quantas vagas o carrinho INTEIRO gastaria. Nao da pra somar o
   * `vagasPara` de cada item: dois baralhos diferentes nao dividem pilha, e
   * duas fichas somam na mesma. Entao a conta simula o carrinho todo de uma vez
   * numa copia do estado — e a copia e barata porque sao nove numeros.
   */
  function vagasNecessarias() {
    const copia = inventario.slots
    let usadas = 0
    for (const [id, q] of carrinho) {
      const m = itemDe(id)
      if (!m) continue
      let falta = q
      for (let i = 0; i < copia.length && falta > 0; i++) {
        const s = copia[i]
        if (!s || s.id !== id) continue
        const cabe = Math.max(0, m.empilha - s.qtd)
        const leva = Math.min(falta, cabe)
        s.qtd += leva
        falta -= leva
      }
      for (let i = 0; i < copia.length && falta > 0; i++) {
        if (copia[i]) continue
        const leva = Math.min(falta, m.empilha)
        copia[i] = { id, qtd: leva }
        falta -= leva
        usadas++
      }
      if (falta > 0) return -1
    }
    return usadas
  }

  function pintarCarrinho() {
    linhas.innerHTML = ''
    if (!carrinho.size) {
      el('div', 'vazio', linhas, 'Nada escolhido ainda.')
    } else {
      for (const [id, q] of carrinho) {
        const m = itemDe(id)
        if (!m) continue
        const l = el('div', 'linha', linhas)
        el('span', null, l, q + 'x ' + m.nome)
        el('b', null, l, milhar(m.preco * q))
      }
    }
    const total = totalDoCarrinho()
    totalVal.textContent = milhar(total)

    const vagas = vagasNecessarias()
    const livres = inventario.livres
    const cabe = vagas >= 0
    const temOuro = carteira.ouro >= total
    vagasTxt.textContent = cabe
      ? ('Vagas: ' + vagas + ' de ' + livres + ' livres')
      : ('Nao cabe na mochila (' + livres + ' vagas livres)')
    vagasTxt.classList.toggle('ruim', !cabe)

    btnComprar.disabled = !carrinho.size || !cabe || !temOuro
    if (!carrinho.size) btnComprar.textContent = 'Comprar'
    else if (!cabe) btnComprar.textContent = 'Sem espaco'
    else if (!temOuro) btnComprar.textContent = 'Falta ouro'
    else btnComprar.textContent = 'Comprar por ' + milhar(total)
  }

  function pintarBolso() {
    vMao.textContent = milhar(carteira.ouro)
    vBanco.textContent = milhar(carteira.banco || 0)
  }

  function mudarQtd(id, d) {
    const q = Math.max(0, (carrinho.get(id) || 0) + d)
    if (q) carrinho.set(id, q)
    else carrinho.delete(id)
    const c = cards.get(id)
    if (c) c.n.textContent = String(q)
    pintarCarrinho()
  }

  function montarCard(m) {
    const c = el('div', 'card', grade)
    c.setAttribute('role', 'group')
    // O card NAO e um <button>: os steppers sao botoes, e botao dentro de botao
    // e HTML invalido (e o navegador desmonta a arvore de um jeito imprevisivel).
    const esq = el('div', 'esq', c)
    const foto = el('img', 'foto', c)
    foto.alt = ''
    foto.style.display = 'none'
    el('div', 'q ' + m.qualidade, c, m.qualidade)
    el('div', 'nome', c, m.nome)
    el('div', 'preco', c, milhar(m.preco))
    const step = el('div', 'step', c)
    const menos = el('button', null, step, '−')
    const n = el('span', 'n', step, String(carrinho.get(m.id) || 0))
    const mais = el('button', null, step, '+')
    menos.addEventListener('click', (e) => { e.stopPropagation(); mudarQtd(m.id, -1) })
    mais.addEventListener('click', (e) => { e.stopPropagation(); mudarQtd(m.id, +1) })
    c.addEventListener('click', () => {
      selecionado = m.id
      avisar(m.desc)
      mudarQtd(m.id, +1)
      for (const [k, v] of cards) v.raiz.classList.toggle('sel', k === selecionado)
    })
    cards.set(m.id, { raiz: c, foto, esq, n })
    return c
  }

  function pintar() {
    for (const [id, b] of botoesAba) b.classList.toggle('on', id === categoria)
    grade.innerHTML = ''
    cards.clear()
    pendentes = []
    for (const m of MOBILIA) {
      if (categoria !== 'tudo' && m.cat !== categoria) continue
      montarCard(m)
      pendentes.push(m.id)
    }
    for (const [k, v] of cards) v.raiz.classList.toggle('sel', k === selecionado)
    pintarCarrinho()
    pintarBolso()
  }

  /**
   * Uma foto por quadro, dentro de 7 ms. E o mesmo orcamento da grade de roupas
   * do customizador: fotografar as nove pecas de uma vez trava a abertura da
   * janela por quase meio segundo, e o esqueleto animado cobre a espera.
   */
  function atualizar() {
    if (!aberto || !pendentes.length) return
    const t0 = performance.now()
    while (pendentes.length && performance.now() - t0 < 7) {
      const id = pendentes.shift()
      const c = cards.get(id)
      if (!c) continue
      const url = typeof fotoDe === 'function' ? fotoDe(id) : null
      if (!url) continue
      c.foto.src = url
      c.foto.style.display = ''
      c.esq.style.display = 'none'
    }
  }

  /**
   * A ORDEM E A REGRA: espaco, depois ouro, depois entrega. Trocada, o jogador
   * paga por um movel que nao tem onde caber. Devolve true so quando a compra
   * aconteceu inteira — quem chama (o botao, o teste) precisa saber.
   */
  function comprar() {
    const total = totalDoCarrinho()
    if (!carrinho.size) return false
    // 1) cabe?
    if (vagasNecessarias() < 0) {
      avisar('Sem espaco no inventario.', 'ruim')
      if (game && game.hud) { game.hud.negarMochila(); game.hud.toast('Sem espaco no inventario.') }
      return false
    }
    // 2) tem ouro?
    if (!carteira.gastarOuro(total)) {
      avisar('Wanda: volta quando o cassino for generoso.', 'ruim')
      return false
    }
    // 3) so agora o item existe
    let ultima = -1
    for (const [id, q] of carrinho) {
      const i = inventario.adicionar(id, q)
      if (i >= 0) ultima = i
    }
    carrinho.clear()
    if (game && game.hud && ultima >= 0) game.hud.piscarVaga(ultima)
    avisar('Wanda: bom negocio. Cuida bem dela.', 'bom')
    // Ponto de gravacao: gastar ouro e ganhar movel e a coisa que o jogador
    // menos quer perder por um F5.
    if (game && typeof game.salvarAgora === 'function') game.salvarAgora('compra')
    pintar()
    return true
  }

  btnComprar.addEventListener('click', comprar)
  btnX.addEventListener('click', () => api.fechar())
  veu.addEventListener('click', () => api.fechar())

  function aoTeclar(e) {
    if (!aberto) return
    if (e.code === 'Escape') { e.preventDefault(); api.fechar() }
  }

  const desligar = carteira.aoMudar(() => { if (aberto) { pintarBolso(); pintarCarrinho() } })

  const api = {
    get aberto() { return aberto },

    // --- o carrinho por fora ------------------------------------------------
    // Existe pro teste de fumaca e pro console. A janela e feita de cliques, e
    // um teste que precisa clicar num <button> testa o navegador, nao a loja.
    get total() { return totalDoCarrinho() },
    porNoCarrinho(id, qtd) {
      const m = itemDe(id)
      if (!m) return false
      mudarQtd(id, Math.max(1, qtd | 0))
      return true
    },
    limparCarrinho() { carrinho.clear(); if (aberto) pintar() },
    comprar,

    /** `foco` opcional: o id do item que a peca em exposicao representa. */
    abrir(foco) {
      if (aberto) return
      aberto = true
      selecionado = foco && itemDe(foco) ? foco : null
      categoria = 'tudo'
      carrinho.clear()
      raiz.classList.add('on')
      raiz.setAttribute('aria-hidden', 'false')
      pintar()
      if (selecionado) {
        const m = itemDe(selecionado)
        avisar(m.desc)
        const c = cards.get(selecionado)
        if (c) c.raiz.scrollIntoView({ block: 'nearest' })
      } else {
        avisar('Wanda: tudo aqui e de segunda mao, menos o preco.')
      }
      window.addEventListener('keydown', aoTeclar)
      try { document.exitPointerLock() } catch (err) { void err }
      painel.focus()
    },

    fechar() {
      if (!aberto) return
      aberto = false
      raiz.classList.remove('on')
      raiz.setAttribute('aria-hidden', 'true')
      carrinho.clear()
      window.removeEventListener('keydown', aoTeclar)
    },

    atualizar,

    dispose() {
      api.fechar()
      desligar()
      raiz.remove()
    },
  }

  return api
}

export default criarLojaUI
