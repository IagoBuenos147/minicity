// ---------------------------------------------------------------------------
// src/bar/ui-bar.js — A FAIXA FINA DO RODAPE, E MAIS NADA.
//
// O dono do projeto foi explicito duas vezes: nada de painel modal cobrindo a
// tela (foi a queixa do blackjack) e nada de HUD de janela no bar. Entao TUDO
// que da pra ser objeto do mundo E objeto do mundo:
//
//   a receita              -> quadro-negro 3D na bancada (bar/estacao.js)
//   a barra do chacoalho   -> anel de tacos em volta da coqueteleira
//   a marca da dose        -> anel gravado no copo
//   a nota do drink        -> texto flutuando SOBRE o copo
//
// Sobra o que nao tem onde morar no mundo: o nome do que esta na mira, o que ja
// caiu no copo e as duas teclas do momento. Isso e uma FAIXA DE 44 px colada no
// rodape — a mesma altura da barra de itens do jogo, pra as duas nao brigarem
// por atencao — e um rotulo que segue o ponteiro.
//
// CSS: um <style> so, injetado uma vez, com TODA classe prefixada por
// 'mcrp-bar-' (o helper cn() faz isso sozinho). E a mesma regra de
// ui/cassino-ui.js, e ela existe porque o HUD, o customizador, o balao de
// dialogo e agora o bar dividem o mesmo document.
//
// NADA AQUI ENGOLE EVENTO. `pointer-events: none` em tudo: o bar e um modo
// DIEGETICO, o ponteiro esta solto sobre o mundo 3D e cada clique pertence a
// bancada. Um unico div opaco por cima da tela roubaria o clique da garrafa
// que esta exatamente atras dele.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-bar-style'
const P = 'mcrp-bar-'

const CSS = `
.${P}raiz{position:fixed;inset:0;pointer-events:none;z-index:44;font-family:"Trebuchet MS",system-ui,sans-serif;opacity:0;transition:opacity .28s ease}
.${P}raiz.${P}on{opacity:1}

.${P}faixa{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);
  display:flex;align-items:center;gap:14px;max-width:min(1080px,94vw);
  padding:7px 16px;border-radius:22px;
  background:linear-gradient(180deg,rgba(20,14,10,.86),rgba(10,7,5,.92));
  border:1px solid rgba(255,200,120,.22);
  box-shadow:0 8px 26px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,215,150,.10);
  color:#f0e2c8;font-size:13px;letter-spacing:.3px;white-space:nowrap}

.${P}est{font-weight:bold;color:#ffc978;text-transform:uppercase;font-size:12px;letter-spacing:1.2px}
.${P}sep{width:1px;height:18px;background:rgba(255,200,120,.22)}

.${P}chips{display:flex;align-items:center;gap:6px;overflow:hidden}
.${P}chip{display:inline-flex;align-items:center;gap:5px;
  padding:2px 9px 2px 5px;border-radius:11px;font-size:12px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10)}
.${P}pin{width:10px;height:10px;border-radius:50%;box-shadow:0 0 5px currentColor;background:currentColor}
.${P}qtd{opacity:.72;font-size:11px}
.${P}vazio{opacity:.42;font-style:italic}

.${P}dica{margin-left:auto;opacity:.68;font-size:11.5px;letter-spacing:.4px}
.${P}tec{display:inline-block;min-width:15px;padding:1px 5px;margin:0 3px;border-radius:4px;
  background:rgba(255,215,150,.14);border:1px solid rgba(255,215,150,.28);
  font-size:10.5px;font-weight:bold;color:#ffdca8}

.${P}rot{position:absolute;transform:translate(-50%,-135%);
  padding:4px 11px;border-radius:13px;font-size:12.5px;color:#fff4e0;
  background:rgba(16,11,8,.88);border:1px solid rgba(255,200,120,.34);
  box-shadow:0 4px 14px rgba(0,0,0,.45);white-space:nowrap;
  opacity:0;transition:opacity .12s ease}
.${P}rot.${P}on{opacity:1}

.${P}flut{position:absolute;transform:translate(-50%,-50%);
  font-size:26px;font-weight:bold;letter-spacing:.5px;
  text-shadow:0 2px 10px rgba(0,0,0,.75),0 0 22px currentColor;
  white-space:nowrap;pointer-events:none}
.${P}flut small{display:block;font-size:13px;font-weight:normal;opacity:.86;letter-spacing:.6px;margin-top:2px}
`

/** Prefixa TODA classe. cn('chip pin') -> 'mcrp-bar-chip mcrp-bar-pin'. */
function cn(nomes) {
  const partes = String(nomes).split(' ')
  let saida = ''
  for (let i = 0; i < partes.length; i++) {
    if (!partes[i]) continue
    saida += (saida ? ' ' : '') + P + partes[i]
  }
  return saida
}

function el(tag, cls, pai, txt) {
  const e = document.createElement(tag)
  if (cls) e.className = cn(cls)
  if (txt !== undefined && txt !== null) e.textContent = String(txt)
  if (pai) pai.appendChild(e)
  return e
}

function hex(n) { return '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6) }

export function criarUIBar() {
  // Em node (teste, ferramenta de foto) nao ha document: o modo do bar tem que
  // continuar montavel sem interface nenhuma.
  if (typeof document === 'undefined') {
    const nada = () => {}
    return {
      mostrar: nada, setEstacao: nada, setPreparo: nada, setDica: nada,
      setRotulo: nada, flutuar: nada, atualizar: nada, dispose: nada,
    }
  }

  if (!document.getElementById(ID_ESTILO)) {
    const s = document.createElement('style')
    s.id = ID_ESTILO
    s.textContent = CSS
    document.head.appendChild(s)
  }

  const raiz = el('div', 'raiz', document.body)
  const faixa = el('div', 'faixa', raiz)
  const est = el('span', 'est', faixa, 'BANCADA')
  el('span', 'sep', faixa)
  const chips = el('div', 'chips', faixa)
  const dica = el('span', 'dica', faixa)
  const rot = el('div', 'rot', raiz)

  const flutuantes = []
  let ligado = false

  /** Troca os <b>x</b> por teclinhas. Aceita texto puro tambem. */
  function comTeclas(txt) {
    dica.innerHTML = ''
    const partes = String(txt || '').split(/\[([^\]]+)\]/)
    for (let i = 0; i < partes.length; i++) {
      if (i % 2) {
        const k = document.createElement('span')
        k.className = cn('tec')
        k.textContent = partes[i]
        dica.appendChild(k)
      } else if (partes[i]) {
        dica.appendChild(document.createTextNode(partes[i]))
      }
    }
  }

  const api = {
    mostrar(v) {
      const on = !!v
      if (on === ligado) return
      ligado = on
      raiz.classList.toggle(P + 'on', on)
      if (!on) rot.classList.remove(P + 'on')
    },

    /** O nome da estacao onde o barman esta. */
    setEstacao(nome) {
      const t = String(nome || 'BANCADA').toUpperCase()
      if (est.textContent !== t) est.textContent = t
    },

    /**
     * O QUE JA CAIU NO COPO. `lista` e [{nome, cor, doses}]; a bolinha de cor
     * de cada chip e o que faz a leitura ser instantanea — o jogador confere a
     * mistura pelas cores, do mesmo jeito que confere olhando o copo.
     */
    setPreparo(lista) {
      chips.innerHTML = ''
      const l = lista || []
      if (!l.length) {
        el('span', 'vazio', chips, 'copo vazio')
        return
      }
      // so os 7 ultimos cabem na faixa sem ela virar uma regua
      const mostra = l.slice(-7)
      for (const it of mostra) {
        const c = el('span', 'chip', chips)
        const pin = el('span', 'pin', c)
        pin.style.color = typeof it.cor === 'number' ? hex(it.cor) : (it.cor || '#ccc')
        el('span', null, c, it.nome || '?')
        if (it.doses !== undefined && it.doses !== null) {
          const q = Number(it.doses)
          el('span', 'qtd', c, q >= 1 ? ('x' + (Math.round(q * 4) / 4)) : ('x' + q.toFixed(2).replace(/0+$/, '')))
        }
      }
    },

    /** A dica do momento. `[E]` vira uma teclinha desenhada. */
    setDica(txt) { comTeclas(txt) },

    /** O rotulo que segue o ponteiro. `null` esconde. */
    setRotulo(txt, x, y) {
      if (!txt) { rot.classList.remove(P + 'on'); return }
      if (rot.textContent !== txt) rot.textContent = txt
      rot.style.left = Math.round(x) + 'px'
      rot.style.top = Math.round(y) + 'px'
      rot.classList.add(P + 'on')
    },

    /**
     * TEXTO FLUTUANDO SOBRE O COPO — a nota do drink, o "+40 de ouro", o
     * "derramou". Ele sobe e some sozinho.
     *
     * Nao e um elemento fixo: cada chamada cria o seu e o remove no fim. Sao
     * poucos por minuto, e um pool aqui seria complexidade por nada.
     */
    flutuar(texto, sub, x, y, cor, dur) {
      const f = el('div', 'flut', raiz)
      f.style.color = typeof cor === 'number' ? hex(cor) : (cor || '#ffd27a')
      f.textContent = texto
      if (sub) {
        const s = document.createElement('small')
        s.textContent = sub
        f.appendChild(s)
      }
      f.style.left = Math.round(x) + 'px'
      f.style.top = Math.round(y) + 'px'
      flutuantes.push({ el: f, x, y, t: 0, dur: dur || 2.1 })
      return f
    },

    /** Chamado todo quadro pelo modo: so anima o que esta flutuando. */
    atualizar(dt) {
      for (let i = flutuantes.length - 1; i >= 0; i--) {
        const f = flutuantes[i]
        f.t += dt || 0
        const k = Math.min(1, f.t / f.dur)
        // sobe 54 px e some nos ultimos 35% — some antes de terminar de subir,
        // que e o que faz o texto parecer evaporar em vez de sumir de uma vez
        f.el.style.top = Math.round(f.y - k * 54) + 'px'
        f.el.style.opacity = String(k < 0.12 ? k / 0.12 : (k > 0.65 ? 1 - (k - 0.65) / 0.35 : 1))
        f.el.style.transform = 'translate(-50%,-50%) scale(' + (0.86 + Math.min(1, k * 6) * 0.14) + ')'
        if (k >= 1) {
          if (f.el.parentNode) f.el.parentNode.removeChild(f.el)
          flutuantes.splice(i, 1)
        }
      }
    },

    /** Move um flutuante que ja existe (a nota acompanha o copo na tela). */
    mover(f, x, y) {
      const reg = flutuantes.find((r) => r.el === f)
      if (reg) { reg.x = x; reg.y = y }
    },

    dispose() {
      for (const f of flutuantes) if (f.el.parentNode) f.el.parentNode.removeChild(f.el)
      flutuantes.length = 0
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
    },
  }

  return api
}

export default criarUIBar
