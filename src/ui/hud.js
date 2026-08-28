// ---------------------------------------------------------------------------
// HUD em DOM puro: crosshair, prompt de interacao, toasts, ajuda, FPS e a
// tela inicial de "clique para jogar". Nada aqui toca no index.html.
// Tudo com pointer-events: none, menos a tela inicial.
// ---------------------------------------------------------------------------

const CSS = `
#hud, #hud * { box-sizing: border-box; }
#hud {
  position: fixed; inset: 0; z-index: 20;
  pointer-events: none;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f2f5f8;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}
#hud .panel {
  background: rgba(14, 17, 24, 0.52);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  backdrop-filter: blur(9px) saturate(1.1);
  -webkit-backdrop-filter: blur(9px) saturate(1.1);
  box-shadow: 0 6px 22px rgba(0,0,0,0.32);
}
#hud .key {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 24px; padding: 0 6px;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(214,222,232,0.88));
  color: #14181f;
  font-weight: bold; font-size: 13px; line-height: 1;
  border-bottom: 2px solid rgba(0,0,0,0.30);
  text-shadow: none;
}

/* --- fora do jogo (menu, criacao de personagem, cutscene) ---
   O HUD inteiro some, MENOS os toasts: eles sao o unico canal de aviso que o
   jogo tem, e uma mensagem de "sala cheia" ou "sem servidor" precisa aparecer
   justamente enquanto o jogador esta no menu. */
#hud.fora-do-jogo #hud-status,
#hud.fora-do-jogo #hud-canto,
#hud.fora-do-jogo #hud-help,
#hud.fora-do-jogo #hud-cross,
#hud.fora-do-jogo #hud-prompt,
#hud.fora-do-jogo .mcrp-f3 { display: none !important; }

/* --- crosshair --- */
#hud-cross {
  position: absolute; left: 50%; top: 50%;
  width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px;
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  box-shadow: 0 0 0 1.6px rgba(0,0,0,0.55), 0 0 8px rgba(0,0,0,0.4);
  opacity: 1; transition: opacity .18s ease, transform .18s ease;
}
#hud-cross.off { opacity: 0; transform: scale(0.4); }

/* --- prompt de interacao --- */
#hud-prompt {
  position: absolute; left: 50%; bottom: 16%;
  transform: translate(-50%, 10px) scale(0.96);
  display: flex; align-items: center; gap: 10px;
  padding: 9px 16px 9px 11px;
  font-size: 16px; letter-spacing: .2px;
  opacity: 0; transition: opacity .16s ease, transform .16s ease;
  white-space: nowrap;
}
#hud-prompt.on { opacity: 1; transform: translate(-50%, 0) scale(1); }
#hud-prompt .key { min-width: 28px; height: 28px; font-size: 15px; }

/* --- toasts --- */
#hud-toasts {
  position: absolute; top: 16px; right: 16px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  max-width: 320px;
}
#hud-toasts .toast {
  padding: 10px 14px; font-size: 14px; line-height: 1.25;
  border-left: 3px solid rgba(120,190,255,0.85);
  opacity: 0; transform: translateX(18px);
  transition: opacity .22s ease, transform .22s ease;
}
#hud-toasts .toast.on { opacity: 1; transform: translateX(0); }

/* --- canto superior esquerdo: modo de camera + fps --- */
#hud-status {
  position: absolute; top: 16px; left: 16px;
  display: flex; flex-direction: column; gap: 6px; align-items: flex-start;
}
#hud-status .row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 11px; font-size: 13px;
  opacity: .92;
}
#hud-mode .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #7fd8a0; box-shadow: 0 0 7px #7fd8a0;
}
#hud-fps b { font-variant-numeric: tabular-nums; font-size: 14px; }

/* --- CANTO INFERIOR DIREITO: mao, dinheiro e mochila ----------------------
   A ordem da coluna, de cima pra baixo, e a que o dono do projeto pediu: o que
   esta na mao, o dinheiro (na mao e no banco, lado a lado) e as vagas logo
   abaixo.
   A HOTBAR entra aqui como FILHA (main.js passa pai: hud.canto). Ela era fixa
   em left:50%, e nove vagas de 48 px com oito folgas de 6 dao 480 px: abaixo de
   ~1174 px de janela o bloco da direita encostava na barra centrada. Uma coluna
   so acaba com a colisao em qualquer largura, sem media query. */
#hud-canto {
  position: absolute; right: 18px; bottom: 18px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
  pointer-events: none;
}

/* --- carteira: mao, banco e as fichas do cassino --- */
#hud-money { display: none; gap: 8px; align-items: stretch; }
#hud-money.on { display: flex; }
#hud-money .m {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 11px; border-radius: 999px;
  background: rgba(0,0,0,.34); border: 1px solid rgba(255,255,255,.09);
}
#hud-money .m i {
  font-style: normal; font-size: 9px; letter-spacing: .15em;
  text-transform: uppercase; color: #9da5b4;
}
#hud-money b { font-variant-numeric: tabular-nums; font-size: 15px; font-weight: 700; }

/* --- MOCHILA: as nove vagas ----------------------------------------------
   Elas NAO sao a hotbar. A hotbar e o que esta na mao (maos, revolver) e cada
   entrada dela tem icone desenhado a mao e tecla numerica; a mochila guarda o
   que foi comprado. Por isso ela nao rouba Digit1/Digit2: seleciona-se no
   clique. */
#hud-bag { display: none; gap: 6px; pointer-events: auto; }
#hud-bag.on { display: flex; }
#hud-bag .vaga {
  position: relative; width: 48px; height: 48px; border-radius: 9px;
  background: rgba(10,12,16,.62); border: 1px solid rgba(255,255,255,.10);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
  cursor: pointer; overflow: hidden;
  transition: border-color .14s ease, transform .1s ease;
}
#hud-bag .vaga:hover { border-color: rgba(233,196,106,.5); }
#hud-bag .vaga.cheia { background: rgba(20,24,30,.78); }
#hud-bag .vaga.sel {
  border-color: #e9c46a; transform: translateY(-3px);
  box-shadow: 0 6px 18px rgba(233,196,106,.28), inset 0 1px 0 rgba(255,255,255,.08);
}
#hud-bag .vaga img { width: 100%; height: 100%; object-fit: contain; display: block; }
#hud-bag .vaga .n {
  position: absolute; right: 3px; bottom: 2px;
  font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
  color: #f2ece0; text-shadow: 0 1px 3px rgba(0,0,0,.95);
}
#hud-bag .vaga .i {
  position: absolute; left: 4px; top: 2px; font-size: 9px;
  color: rgba(255,255,255,.28); font-variant-numeric: tabular-nums;
}
#hud-bag .vaga.piscou { animation: hudVagaPisca .55s ease; }
@keyframes hudVagaPisca {
  0% { border-color: #e9c46a; box-shadow: 0 0 0 0 rgba(233,196,106,.55); }
  100% { border-color: rgba(255,255,255,.10); box-shadow: 0 0 0 14px rgba(233,196,106,0); }
}
#hud-bag.negou { animation: hudBagNega .36s ease; }
@keyframes hudBagNega {
  0%,100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  50% { transform: translateX(5px); }
  80% { transform: translateX(-3px); }
}
#hud-bag.negou .vaga.cheia { border-color: #c9394f; }
#hud-money .pin {
  width: 13px; height: 13px; border-radius: 50%;
  box-shadow: inset 0 -2px 3px rgba(0,0,0,.35), 0 0 6px rgba(0,0,0,.35);
}
#hud-money .pin.ouro {
  background: radial-gradient(circle at 35% 30%, #ffe89a, #e0a713 62%, #a97a06);
}
#hud-money .pin.ficha {
  background: radial-gradient(circle at 35% 30%, #ff8f8f, #c62c3f 60%, #7d1523);
  border: 2px dashed rgba(255,255,255,.75);
}
/* Banco: um cofre azul-aco, quadrado. Precisa ser um pino DIFERENTE do ouro
   porque os dois numeros ficam lado a lado — dois discos dourados iguais e o
   jogador somando o saldo errado no meio de uma compra. */
#hud-money .pin.banco {
  background: linear-gradient(160deg, #cfe0f0 0%, #6f88a8 48%, #33465e 100%);
  border-radius: 3px;
}
#hud-money .sobe { animation: hudMoneyUp .5s ease; }
@keyframes hudMoneyUp {
  0% { transform: scale(1); color: #f2f5f8; }
  35% { transform: scale(1.28); color: #9ff0b4; }
  100% { transform: scale(1); color: #f2f5f8; }
}
#hud-money .desce { animation: hudMoneyDown .5s ease; }
@keyframes hudMoneyDown {
  0% { transform: scale(1); color: #f2f5f8; }
  35% { transform: scale(1.16); color: #f09a9a; }
  100% { transform: scale(1); color: #f2f5f8; }
}
#hud-debug {
  padding: 8px 11px; font-size: 12px; line-height: 1.5;
  font-family: Consolas, "Courier New", monospace;
  color: #cfe0f0; opacity: .85; display: none;
}
#hud-debug span { color: #8fa5bb; }

/* --- ajuda --- */
#hud-help {
  position: absolute; left: 16px; bottom: 16px;
  padding: 12px 14px; font-size: 13px;
  display: grid; grid-template-columns: auto 1fr; gap: 7px 11px;
  align-items: center;
  opacity: 1; transition: opacity .2s ease, transform .2s ease;
}
#hud-help.off { opacity: 0; transform: translateY(8px); }
#hud-help .t { font-weight: bold; font-size: 12px; letter-spacing: 1.2px;
  text-transform: uppercase; color: #9fb6cc; grid-column: 1 / -1; margin-bottom: 2px; }
#hud-help .lbl { opacity: .9; }
#hud-help .keys { display: flex; gap: 4px; }

/* --- tela inicial --- */
#hud-start {
  position: absolute; inset: 0; pointer-events: auto; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; text-align: center;
  background: radial-gradient(120% 90% at 50% 30%, rgba(24,36,58,0.72), rgba(6,8,13,0.94));
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  opacity: 1; transition: opacity .35s ease;
}
#hud-start.off { opacity: 0; pointer-events: none; }
#hud-start h1 {
  font-size: clamp(34px, 7vw, 68px); letter-spacing: 3px; font-weight: bold;
  text-transform: uppercase; margin: 0;
  background: linear-gradient(180deg, #ffffff, #9fc4e8);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  text-shadow: 0 8px 40px rgba(80,150,220,0.35);
}
#hud-start .sub { font-size: 15px; color: #b7c6d6; margin-top: -10px; }
#hud-start .cta {
  margin-top: 6px; padding: 13px 30px; font-size: 17px; font-weight: bold;
  letter-spacing: .6px; cursor: pointer;
  background: rgba(255,255,255,0.10);
  animation: hudPulse 2.1s ease-in-out infinite;
}
#hud-start .grid {
  margin-top: 14px; padding: 14px 20px;
  display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 9px 14px;
  font-size: 13px; align-items: center; text-align: left;
}
@keyframes hudPulse {
  0%,100% { transform: scale(1); box-shadow: 0 6px 22px rgba(0,0,0,0.32); }
  50% { transform: scale(1.035); box-shadow: 0 10px 30px rgba(90,160,230,0.30); }
}
`

const HELP_ROWS = [
  [['W', 'A', 'S', 'D'], 'Mover'],
  [['Shift'], 'Correr'],
  [['Espaco'], 'Pular'],
  [['E'], 'Interagir / entrar no veiculo'],
  [['V'], 'Trocar camera'],
  // A barra de itens e o unico jeito de descobrir que o revolver existe: sem
  // esta linha o jogador so acha por acidente. (O anel verde e a arma de
  // portal sairam do jogo; estao em backup/poder/.)
  [['1', '2'], 'Maos / revolver'],
  [['Bt.Esq'], 'Atirar'],
  [['Bt.Dir'], 'Mirar'],
  [['R'], 'Recarregar o revolver'],
  [['C'], 'Trocar a estacao: sol / chuva / neve'],
  [['F3'], 'Painel de rede'],
  [['F5'], 'Salvar o jogo'],
  [['F6'], 'Trocar de cenario'],
  [['F7'], 'Fazer o cenario sumir'],
  [['F8', 'F8'], 'Reiniciar o mundo (aperte duas vezes)'],
  [['Tab'], 'Ajuda'],
  [['Esc'], 'Liberar mouse'],
]

/** 1500 -> "1.500". Separador de milhar com ponto, que e o do jogo (pt-BR). */
function milhar(n) {
  const s = String(Math.abs(Math.round(n)))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.'
    out += s[i]
  }
  return (n < 0 ? '-' : '') + out
}

function el(tag, cls, parent, text) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text !== undefined) n.textContent = text
  if (parent) parent.appendChild(n)
  return n
}

function keyChip(parent, label) {
  const k = el('span', 'key', parent, label)
  return k
}

export function createHUD() {
  if (!document.getElementById('hud-style')) {
    const s = document.createElement('style')
    s.id = 'hud-style'
    s.textContent = CSS
    document.head.appendChild(s)
  }

  const root = el('div', null, document.body)
  root.id = 'hud'

  // crosshair
  const cross = el('div', null, root)
  cross.id = 'hud-cross'

  // prompt de interacao
  const prompt = el('div', 'panel', root)
  prompt.id = 'hud-prompt'
  const promptKey = keyChip(prompt, 'E')
  const promptTxt = el('span', null, prompt, '')

  // toasts
  const toasts = el('div', null, root)
  toasts.id = 'hud-toasts'

  // status: camera + fps + debug
  const status = el('div', null, root)
  status.id = 'hud-status'
  const modeRow = el('div', 'row panel', status)
  modeRow.id = 'hud-mode'
  el('span', 'dot', modeRow)
  const modeTxt = el('span', null, modeRow, 'Camera 1a pessoa')
  const fpsRow = el('div', 'row panel', status)
  fpsRow.id = 'hud-fps'
  const fpsVal = el('b', null, fpsRow, '--')
  el('span', null, fpsRow, 'FPS')
  const debug = el('div', 'panel', status)
  debug.id = 'hud-debug'

  // --- canto inferior direito: hotbar (main.js pendura), dinheiro, mochila ---
  const canto = el('div', null, root)
  canto.id = 'hud-canto'

  const money = el('div', 'row panel', canto)
  money.id = 'hud-money'
  const ouroBox = el('div', 'm', money)
  el('span', 'pin ouro', ouroBox)
  el('i', null, ouroBox, 'mao')
  const ouroVal = el('b', null, ouroBox, '0')
  const bancoBox = el('div', 'm', money)
  el('span', 'pin banco', bancoBox)
  el('i', null, bancoBox, 'banco')
  const bancoVal = el('b', null, bancoBox, '0')
  const fichaBox = el('div', 'm', money)
  el('span', 'pin ficha', fichaBox)
  el('i', null, fichaBox, 'ficha')
  const fichaVal = el('b', null, fichaBox, '0')

  const bag = el('div', null, canto)
  bag.id = 'hud-bag'
  const vagas = []
  for (let i = 0; i < 9; i++) {
    const v = el('div', 'vaga', bag)
    el('span', 'i', v, String(i + 1))
    const img = el('img', null, v)
    img.alt = ''
    img.style.display = 'none'
    const n = el('span', 'n', v)
    n.style.display = 'none'
    v.addEventListener('click', () => { if (aoClicarVaga) aoClicarVaga(i) })
    v.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (aoClicarVaga) aoClicarVaga(-1)
    })
    vagas.push({ el: v, img, n })
  }
  let aoClicarVaga = null

  // ajuda
  const help = el('div', 'panel', root)
  help.id = 'hud-help'
  el('div', 't', help, 'Controles')
  for (const [keys, label] of HELP_ROWS) {
    const kw = el('div', 'keys', help)
    for (const k of keys) keyChip(kw, k)
    el('div', 'lbl', help, label)
  }

  // tela inicial
  const start = el('div', null, root)
  start.id = 'hud-start'
  start.classList.add('off')
  start.style.display = 'none'
  el('h1', null, start, 'Mini City RP')
  el('div', 'sub', start, 'Uma cidadezinha pra andar, conversar e cortar o cabelo.')
  el('div', 'cta panel', start, 'Clique para jogar')
  const grid = el('div', 'grid panel', start)
  for (const [keys, label] of HELP_ROWS) {
    const kw = el('div', 'keys', grid)
    for (const k of keys) keyChip(kw, k)
    el('div', 'lbl', grid, label)
  }

  // --- estado -------------------------------------------------------------
  let wantCross = true
  let mode = 'first'
  let startCb = null

  function refreshCross() {
    // em 3a pessoa a mira nao faz sentido: some
    const on = wantCross && mode === 'first'
    cross.classList.toggle('off', !on)
  }

  // UM clique, uma vez. O 'jaComecou' nao e paranoia: o overlay so ganha
  // pointer-events: none 380 ms depois do clique (o tempo do fade), e um duplo
  // clique nesse intervalo chamava o callback DUAS vezes -- que era o segundo
  // "clique pra iniciar" que o jogador via. O { once: true } sozinho nao
  // bastaria: quem quiser voltar pra tela inicial chama showStart() de novo, e
  // ai o ouvinte precisa existir.
  let jaComecou = false
  function onStartClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    if (jaComecou) return
    jaComecou = true
    api.hideStart()
    if (startCb) { const cb = startCb; startCb = null; cb() }
  }
  start.addEventListener('click', onStartClick)

  // --- painel F3 -----------------------------------------------------------
  // FPS, ms de rede, jogadores, e quantos NPCs/objetos o servidor esta mandando.
  const f3 = document.createElement('div')
  f3.className = 'mcrp-f3 off'
  f3.innerHTML =
    '<div class="t">REDE (F3)</div>' +
    '<div class="l"><span>fps</span><b data-k="fps">-</b></div>' +
    '<div class="l"><span>rede</span><b data-k="ping">-</b></div>' +
    '<div class="l"><span>jogadores</span><b data-k="jog">-</b></div>' +
    '<div class="l"><span>npcs</span><b data-k="npc">-</b></div>' +
    '<div class="l"><span>objetos</span><b data-k="obj">-</b></div>' +
    '<div class="l"><span>entrada</span><b data-k="bps">-</b></div>' +
    '<div class="l"><span>estado</span><b data-k="est">-</b></div>'
  root.appendChild(f3)
  const f3v = {}
  f3.querySelectorAll('[data-k]').forEach((e) => { f3v[e.getAttribute('data-k')] = e })

  const estiloF3 = document.createElement('style')
  estiloF3.textContent =
    '.mcrp-f3{position:fixed;top:12px;right:12px;min-width:186px;padding:10px 12px;' +
    'background:rgba(14,16,22,.82);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.10);' +
    'border-radius:10px;font:12px/1.55 "Trebuchet MS",system-ui,sans-serif;color:#dfe6f2;' +
    'pointer-events:none;transition:opacity .12s}' +
    '.mcrp-f3.off{opacity:0}' +
    '.mcrp-f3 .t{font-size:10px;letter-spacing:.14em;color:#8fa0bb;margin-bottom:6px}' +
    '.mcrp-f3 .l{display:flex;justify-content:space-between;gap:14px}' +
    '.mcrp-f3 .l span{color:#93a2b8}' +
    '.mcrp-f3 .l b{font-weight:600;font-variant-numeric:tabular-nums}'
  document.head.appendChild(estiloF3)

  let f3on = false

  /** Anima o numero quando ele muda: verde subindo, vermelho descendo. */
  /**
   * O numero pisca verde quando sobe e vermelho quando desce.
   *
   * Le o valor CRU de dataset.v, e nao do textContent, porque o texto ganhou
   * separador de milhar: `Number('1.500')` da 1.5, e todo saldo acima de mil
   * piscaria verde pra sempre.
   */
  function pulo(elNum, novoValor) {
    const antes = Number(elNum.dataset.v) || 0
    elNum.dataset.v = String(novoValor)
    if (novoValor === antes) return
    const cls = novoValor > antes ? 'sobe' : 'desce'
    elNum.classList.remove('sobe', 'desce')
    void elNum.offsetWidth          // reinicia a animacao CSS
    elNum.classList.add(cls)
  }

  const api = {
    root,

    /** Prompt central-baixo. text null/'' esconde. */
    setPrompt(text, key) {
      if (!text) { prompt.classList.remove('on'); return }
      promptTxt.textContent = text
      promptKey.textContent = key || 'E'
      prompt.classList.add('on')
    },

    /** Mensagem rapida no canto superior direito. */
    toast(msg, ms = 2600) {
      const t = el('div', 'toast panel', toasts, String(msg))
      requestAnimationFrame(() => t.classList.add('on'))
      setTimeout(() => {
        t.classList.remove('on')
        setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t) }, 260)
      }, ms)
      // nao deixa empilhar demais
      while (toasts.children.length > 5) toasts.removeChild(toasts.firstChild)
      return t
    },

    setMode(m) {
      mode = m === 'third' ? 'third' : 'first'
      modeTxt.textContent = mode === 'third' ? 'Camera 3a pessoa' : 'Camera 1a pessoa'
      refreshCross()
    },

    /** obj = { chave: valor }. null/vazio esconde o painel. */
    setDebug(obj) {
      if (!obj) { debug.style.display = 'none'; debug.textContent = ''; return }
      const keys = Object.keys(obj)
      if (!keys.length) { debug.style.display = 'none'; debug.textContent = ''; return }
      debug.textContent = ''
      for (const k of keys) {
        const line = el('div', null, debug)
        el('span', null, line, k + ': ')
        line.appendChild(document.createTextNode(String(obj[k])))
      }
      debug.style.display = 'block'
    },

    setCrosshair(visible) {
      wantCross = !!visible
      refreshCross()
    },

    showHelp(v) {
      if (v === 'toggle') help.classList.toggle('off')
      else help.classList.toggle('off', !v)
    },

    /**
     * Carteira do cassino. Passar null esconde a linha inteira (quem nunca
     * entrou no cassino nao precisa de um contador de fichas na tela).
     * O pulinho verde/vermelho e o unico feedback de "ganhei/perdi" que existe
     * fora do painel do jogo, e ele importa: sem ele, ganhar 300 fichas e um
     * numero que muda calado no canto da tela.
     */
    /**
     * `banco` e opcional: chamada com dois argumentos (a do cassino, que e
     * antiga) nao mexe no que ja esta na tela. Foi assim que o campo novo entrou
     * sem tocar em nenhum dos jogos.
     */
    setDinheiro(ouro, fichas, banco) {
      if (ouro === null || ouro === undefined) { money.classList.remove('on'); return }
      money.classList.add('on')
      const o = Math.max(0, Math.round(ouro || 0))
      const f = Math.max(0, Math.round(fichas || 0))
      pulo(ouroVal, o)
      pulo(fichaVal, f)
      ouroVal.textContent = milhar(o)
      fichaVal.textContent = milhar(f)
      if (banco !== undefined && banco !== null) {
        const b = Math.max(0, Math.round(banco))
        pulo(bancoVal, b)
        bancoVal.textContent = milhar(b)
      }
      // fichas so aparecem depois de existir uma pela primeira vez
      fichaBox.style.display = (f > 0 || money.dataset.viuFicha === '1') ? '' : 'none'
      if (f > 0) money.dataset.viuFicha = '1'
    },

    /** A coluna do canto, pro main pendurar a hotbar dentro dela. */
    get canto() { return canto },

    /**
     * Redesenha a mochila. `slots` e a copia do inventario (9 posicoes, null =
     * vazia), `fotos` responde a foto de cada id e `sel` e a vaga escolhida.
     */
    setMochila(slots, fotos, sel) {
      if (!Array.isArray(slots)) { bag.classList.remove('on'); return }
      bag.classList.add('on')
      for (let i = 0; i < vagas.length; i++) {
        const v = vagas[i]
        const s = slots[i]
        v.el.classList.toggle('cheia', !!s)
        v.el.classList.toggle('sel', sel === i)
        if (!s) {
          v.img.style.display = 'none'
          v.n.style.display = 'none'
          v.el.title = ''
          continue
        }
        const url = typeof fotos === 'function' ? fotos(s.id) : null
        if (url && v.img.dataset.id !== s.id) { v.img.src = url; v.img.dataset.id = s.id }
        v.img.style.display = url ? '' : 'none'
        v.n.style.display = s.qtd > 1 ? '' : 'none'
        v.n.textContent = String(s.qtd)
      }
    },

    /** A vaga que acabou de receber pisca dourado. */
    piscarVaga(i) {
      const v = vagas[i | 0]
      if (!v) return
      v.el.classList.remove('piscou')
      void v.el.offsetWidth
      v.el.classList.add('piscou')
    },

    /** Nao coube: a fileira treme e as vagas cheias acendem em vermelho. */
    negarMochila() {
      bag.classList.remove('negou')
      void bag.offsetWidth
      bag.classList.add('negou')
      setTimeout(() => bag.classList.remove('negou'), 420)
    },

    aoClicarVaga(fn) { aoClicarVaga = typeof fn === 'function' ? fn : null },

    /**
     * Estou DENTRO do jogo? false esconde o HUD inteiro (camera, fps, ajuda,
     * mira, prompt, painel F3) e deixa so os toasts. Chamado pelo main a cada
     * troca de estado: menu, criacao de personagem e cutscene nao sao o jogo, e
     * ver "Camera 1a pessoa" por cima da placa de neon do menu e a diferenca
     * entre um jogo e uma demo tecnica.
     */
    setJogando(v) {
      root.classList.toggle('fora-do-jogo', !v)
    },

    setFps(n) {
      const v = Math.round(n || 0)
      fpsVal.textContent = String(v)
      fpsVal.style.color = v >= 50 ? '#8fe0a8' : v >= 30 ? '#e8d07a' : '#e88a8a'
    },

    /** Overlay inicial. cb roda no clique (pedir pointer lock, etc). */
    showStart(cb) {
      startCb = typeof cb === 'function' ? cb : null
      jaComecou = false
      start.style.display = 'flex'
      requestAnimationFrame(() => start.classList.remove('off'))
    },

    hideStart() {
      start.classList.add('off')
      setTimeout(() => { start.style.display = 'none' }, 380)
    },

    dispose() {
      start.removeEventListener('click', onStartClick)
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }

  // tambem no elemento: o contrato pede root.showStart / root.hideStart
  root.showStart = api.showStart
  root.hideStart = api.hideStart

  api.setMode('first')
  api.setDebug(null)
  /** Liga/desliga o painel. Sem argumento, alterna. */
  api.toggleF3 = function (v) {
    f3on = (v === undefined) ? !f3on : !!v
    f3.classList.toggle('off', !f3on)
    return f3on
  }

  /**
   * Alimenta o painel. stats vem de rede.stats; fps do laco principal.
   * Chamar a cada ~0.25 s basta: numero piscando a 60 Hz nao da pra ler.
   */
  api.setRede = function (fps, stats, estado) {
    if (!f3on) return
    f3v.fps.textContent = Math.round(fps || 0)
    if (!stats) {
      f3v.ping.textContent = f3v.jog.textContent = f3v.npc.textContent =
        f3v.obj.textContent = f3v.bps.textContent = '-'
    } else {
      f3v.ping.textContent = Math.round(stats.ping || 0) + ' ms'
      f3v.jog.textContent = stats.nJogadores || 0
      f3v.npc.textContent = stats.nNpcs || 0
      f3v.obj.textContent = stats.nObjetos || 0
      const bps = stats.bytesPorSegundo || 0
      f3v.bps.textContent = bps > 1024
        ? (bps / 1024).toFixed(1) + ' KB/s'
        : Math.round(bps) + ' B/s'
    }
    f3v.est.textContent = estado || '-'
  }

  return api
}
