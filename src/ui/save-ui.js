import { SLOTS, quando, duracao, VERSAO_JOGO } from '../save/save.js'

// ---------------------------------------------------------------------------
// src/ui/save-ui.js — a tela de jogos salvos.
//
// A FORMA e a da tela que o dono do projeto mandou: cinco linhas numeradas, com
// o nome do save, o patrimonio, quando foi criado, quando foi jogado, a versao
// do jogo em cinza no canto e os botoes de exportar e importar por linha. Linha
// vazia mostra so o numero e um "Novo jogo".
//
// O SOTAQUE e o da casa: a numeracao e uma FICHA de cassino (o mesmo disco
// vermelho listrado do HUD), a linha e feltro, o patrimonio e ouro e a linha
// escolhida acende com a mesma faixa de neon do topo da loja. Nao ha uma cor
// aqui que ja nao esteja no cassino ou na loja.
//
// EXPORTAR/IMPORTAR SEM SERVIDOR: exportar baixa um arquivo .json (Blob +
// <a download>) e importar abre o seletor de arquivo do proprio navegador. Nao
// ha para onde mandar — o save e da maquina, como a carteira.
// ---------------------------------------------------------------------------

const CSS = `
.mcrp-save, .mcrp-save * { box-sizing: border-box; }
.mcrp-save {
  position: fixed; inset: 0; z-index: 92;
  display: flex; align-items: center; justify-content: center;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f2ece0; opacity: 0; pointer-events: none; transition: opacity .18s ease;
}
.mcrp-save.on { opacity: 1; pointer-events: auto; }
.mcrp-save .veu {
  position: absolute; inset: 0;
  background: radial-gradient(120% 100% at 50% 30%, rgba(10,44,32,.46) 0%, rgba(3,6,9,.88) 70%, rgba(2,3,5,.95) 100%);
}
.mcrp-save .painel {
  position: relative; width: min(880px, 94vw); max-height: 88vh;
  display: flex; flex-direction: column; overflow: hidden; border-radius: 16px;
  background: linear-gradient(158deg, rgba(26,29,36,.94), rgba(10,12,16,.97));
  border: 1px solid rgba(233,196,106,.28);
  box-shadow: 0 34px 92px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.06);
}
.mcrp-save .neon {
  height: 4px; flex: 0 0 4px;
  background: linear-gradient(90deg,#ffd98a,#c9394f,#ffd98a,#2fa87a,#ffd98a);
  background-size: 280% 100%; animation: saveNeon 7s linear infinite;
}
@keyframes saveNeon { from { background-position: 0 0 } to { background-position: 280% 0 } }
.mcrp-save .topo { padding: 16px 20px 8px; }
.mcrp-save .kicker { font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: #e9c46a; }
.mcrp-save h2 { margin: 2px 0 0; font-size: 22px; font-weight: 700; }
.mcrp-save .lista { padding: 8px 20px 4px; overflow-y: auto; }

.mcrp-save .slot {
  position: relative; display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; margin-bottom: 8px; border-radius: 12px; cursor: pointer;
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.014) 0 3px, rgba(0,0,0,.014) 3px 6px),
    linear-gradient(150deg, rgba(20,60,44,.5), rgba(9,26,20,.65));
  border: 1px solid rgba(255,255,255,.07);
  transition: border-color .14s ease, transform .1s ease;
}
.mcrp-save .slot:hover { border-color: rgba(233,196,106,.45); transform: translateY(-1px); }
.mcrp-save .slot.vazio { background: rgba(255,255,255,.025); }
.mcrp-save .ficha {
  flex: 0 0 auto; width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 17px; font-weight: 700; color: #f6efe2;
  background: radial-gradient(circle at 35% 30%, #ff8f8f, #c62c3f 60%, #7d1523);
  border: 3px dashed rgba(255,255,255,.72);
  box-shadow: inset 0 -3px 5px rgba(0,0,0,.4), 0 3px 10px rgba(0,0,0,.45);
}
.mcrp-save .slot.vazio .ficha {
  background: rgba(255,255,255,.05); color: #6d7686;
  border-color: rgba(255,255,255,.14); box-shadow: none;
}
.mcrp-save .corpo { flex: 1; min-width: 0; }
.mcrp-save .nome {
  font-size: 16px; font-weight: 700; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.mcrp-save .slot.vazio .nome { color: #7c8492; font-weight: 400; }
.mcrp-save .meta { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 3px; font-size: 11.5px; }
.mcrp-save .meta i { font-style: normal; color: #8d95a4; margin-right: 5px; }
.mcrp-save .meta .ouro { color: #ffe1a4; font-variant-numeric: tabular-nums; font-weight: 700; }
.mcrp-save .meta b { color: #cfd6e2; font-weight: 400; }
.mcrp-save .ver {
  position: absolute; right: 12px; bottom: 6px;
  font-size: 10px; color: rgba(255,255,255,.20); font-style: italic;
}
.mcrp-save .acoes { display: flex; gap: 6px; }
.mcrp-save .acoes button {
  padding: 6px 11px; border-radius: 8px; cursor: pointer; font-size: 10.5px;
  letter-spacing: .1em; text-transform: uppercase;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); color: #cfd6e2;
}
.mcrp-save .acoes button:hover { background: rgba(233,196,106,.18); color: #e9c46a; border-color: rgba(233,196,106,.4); }
.mcrp-save .acoes button.perigo:hover { background: rgba(201,57,79,.22); color: #f2a2a2; border-color: rgba(201,57,79,.45); }

.mcrp-save .rodape {
  display: flex; align-items: center; gap: 12px; padding: 10px 20px 16px; font-size: 11.5px; color: #8d95a4;
}
.mcrp-save .recado { flex: 1; }
.mcrp-save .recado.bom { color: #9fe6b4; }
.mcrp-save .recado.ruim { color: #f2a2a2; }
.mcrp-save .fechar {
  padding: 9px 18px; border-radius: 9px; cursor: pointer; font-weight: 700;
  font-size: 11px; letter-spacing: .16em; text-transform: uppercase;
  color: #241c0c; border: none; background: linear-gradient(180deg,#ffd98a,#e2a83c);
}
`

let estiloPosto = false
function injetarEstilo() {
  if (estiloPosto) return
  estiloPosto = true
  const s = document.createElement('style')
  s.id = 'mcrp-save-css'
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

export function criarSaveUI({ save, aoEscolher } = {}) {
  injetarEstilo()

  const raiz = el('div', 'mcrp-save')
  raiz.setAttribute('aria-hidden', 'true')
  const veu = el('div', 'veu', raiz)
  const painel = el('div', 'painel', raiz)
  el('div', 'neon', painel)
  const topo = el('div', 'topo', painel)
  el('div', 'kicker', topo, 'CASSINO BUENOS')
  const titulo = el('h2', null, topo, 'Continuar')
  const lista = el('div', 'lista', painel)
  const rodape = el('div', 'rodape', painel)
  const recado = el('div', 'recado', rodape)
  const btFechar = el('button', 'fechar', rodape, 'Voltar')
  document.body.appendChild(raiz)

  const entrada = document.createElement('input')
  entrada.type = 'file'
  entrada.accept = '.json,application/json'
  entrada.style.display = 'none'
  document.body.appendChild(entrada)
  let alvoImport = -1

  entrada.addEventListener('change', () => {
    const arq = entrada.files && entrada.files[0]
    entrada.value = ''
    if (!arq || alvoImport < 0) return
    const leitor = new FileReader()
    leitor.onload = () => {
      const erro = save.importar(alvoImport, leitor.result)
      avisar(erro ? ('Nao deu: ' + erro) : 'Save importado no lugar ' + (alvoImport + 1) + '.', erro ? 'ruim' : 'bom')
      pintar()
    }
    leitor.readAsText(arq)
  })

  let aberto = false
  let modo = 'continuar'          // 'continuar' | 'salvar'

  function avisar(txt, tom) {
    recado.textContent = txt || ''
    recado.classList.toggle('bom', tom === 'bom')
    recado.classList.toggle('ruim', tom === 'ruim')
  }

  function exportar(i) {
    const txt = save.exportar(i)
    if (!txt) { avisar('Esse lugar esta vazio.', 'ruim'); return }
    const s = save.ler(i)
    const nome = (s && s.nome ? s.nome : 'save').replace(/[^\w-]+/g, '-')
    const blob = new Blob([txt], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cassino-buenos-' + nome + '.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    avisar('Arquivo gerado.', 'bom')
  }

  function pintar() {
    lista.innerHTML = ''
    const agora = Date.now()
    const dados = save.listar()
    for (let i = 0; i < SLOTS; i++) {
      const s = dados[i]
      const linha = el('div', 'slot' + (s ? '' : ' vazio'), lista)
      el('div', 'ficha', linha, String(i + 1))
      const corpo = el('div', 'corpo', linha)
      el('div', 'nome', corpo, s ? s.nome : 'Lugar vazio')
      const meta = el('div', 'meta', corpo)
      if (s) {
        const m1 = el('span', null, meta)
        el('i', null, m1, 'Patrimonio')
        el('b', 'ouro', m1, milhar(s.patrimonio || 0))
        const m2 = el('span', null, meta)
        el('i', null, m2, 'Criado')
        el('b', null, m2, quando(s.criadoEm, agora))
        const m3 = el('span', null, meta)
        el('i', null, m3, 'Jogado')
        el('b', null, m3, quando(s.jogadoEm, agora))
        const m4 = el('span', null, meta)
        el('i', null, m4, 'Tempo')
        el('b', null, m4, duracao(s.segundos))
        el('div', 'ver', linha, s.versaoJogo || VERSAO_JOGO)
      } else {
        el('span', null, meta, modo === 'salvar' ? 'Clique para salvar aqui' : 'Clique para comecar um jogo novo')
      }

      const acoes = el('div', 'acoes', linha)
      if (s) {
        const bx = el('button', null, acoes, 'Exportar')
        bx.addEventListener('click', (e) => { e.stopPropagation(); exportar(i) })
      }
      const bi = el('button', null, acoes, 'Importar')
      bi.addEventListener('click', (e) => {
        e.stopPropagation()
        alvoImport = i
        entrada.click()
      })
      if (s) {
        const bd = el('button', 'perigo', acoes, 'Apagar')
        bd.addEventListener('click', (e) => {
          e.stopPropagation()
          save.apagar(i)
          avisar('Lugar ' + (i + 1) + ' apagado.')
          pintar()
        })
      }

      linha.addEventListener('click', () => {
        if (typeof aoEscolher === 'function') aoEscolher(i, s, modo)
      })
    }
  }

  function aoTeclar(e) {
    if (!aberto) return
    if (e.code === 'Escape') { e.preventDefault(); api.fechar() }
  }

  btFechar.addEventListener('click', () => api.fechar())
  veu.addEventListener('click', () => api.fechar())

  const api = {
    get aberto() { return aberto },

    /** `qual` = 'continuar' (carregar) ou 'salvar' (escolher onde gravar). */
    abrir(qual) {
      modo = qual === 'salvar' ? 'salvar' : 'continuar'
      titulo.textContent = modo === 'salvar' ? 'Salvar em' : 'Continuar'
      aberto = true
      raiz.classList.add('on')
      raiz.setAttribute('aria-hidden', 'false')
      avisar(modo === 'salvar'
        ? 'Escolha um lugar. O jogo salva sozinho a cada passo importante.'
        : 'Cinco lugares. Cada um guarda um personagem e a casa dele.')
      pintar()
      window.addEventListener('keydown', aoTeclar)
      try { document.exitPointerLock() } catch (err) { void err }
    },

    fechar() {
      if (!aberto) return
      aberto = false
      raiz.classList.remove('on')
      raiz.setAttribute('aria-hidden', 'true')
      window.removeEventListener('keydown', aoTeclar)
    },

    avisar,
    pintar,
    dispose() { api.fechar(); raiz.remove(); entrada.remove() },
  }

  return api
}

export default criarSaveUI
