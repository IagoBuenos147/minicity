import { HAIR, EYES, BROWS, MOUTH, HAIR_COLORS } from '../player/appearance.js'

// ---------------------------------------------------------------------------
// Painel de customizacao do personagem ("cadeira do barbeiro").
// DOM puro + <style> injetado. Preview ao vivo: toda mudanca chama
// game.setAppearance() na hora, e o snapshot da abertura permite cancelar.
// ---------------------------------------------------------------------------

const STYLE_ID = 'mcrp-customizer-style'

// Catalogo de abas. field = chave usada em game.setAppearance().
const TAB_DEFS = [
  { key: 'hair', field: 'hair', label: 'CABELO', title: 'Corte de cabelo', list: HAIR, glyph: 'hair', colors: true },
  { key: 'eyes', field: 'eyes', label: 'OLHOS', title: 'Olhos', list: EYES, glyph: 'eyes' },
  { key: 'brows', field: 'brows', label: 'SOBRANCELHAS', title: 'Sobrancelhas', list: BROWS, glyph: 'brows' },
  { key: 'mouth', field: 'mouth', label: 'BOCA', title: 'Boca', list: MOUTH, glyph: 'mouth' },
]

const KIND_TABS = {
  hair: ['hair'],
  face: ['eyes', 'brows', 'mouth'],
  all: ['hair', 'eyes', 'brows', 'mouth'],
}

const COLORS = Array.isArray(HAIR_COLORS) ? HAIR_COLORS : []

// hex pode vir como 0xrrggbb (three) ou como string css
function cssHex(h) {
  if (typeof h === 'string') return h
  const n = (Number(h) >>> 0) & 0xffffff
  return '#' + n.toString(16).padStart(6, '0')
}

function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function callSafe(obj, name, ...args) {
  if (obj && typeof obj[name] === 'function') {
    try { return obj[name](...args) } catch (err) { console.warn('[customizer] ' + name + ':', err) }
  }
  return undefined
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

const CSS = `
.mcrp-cz{
  position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:flex-end;
  padding:clamp(10px,3vw,44px);
  font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;
  color:#e8edf7; opacity:0; pointer-events:none;
  transition:opacity .16s ease; -webkit-font-smoothing:antialiased;
}
.mcrp-cz.is-open{ opacity:1; pointer-events:auto; }
.mcrp-cz .cz-veil{
  position:absolute; inset:0;
  background:radial-gradient(115% 95% at 22% 52%, rgba(0,0,0,0) 30%, rgba(3,5,9,.55) 78%, rgba(3,5,9,.78) 100%);
}
.mcrp-cz .cz-panel{
  position:relative; width:min(560px,100%); max-height:100%;
  display:flex; flex-direction:column; overflow:hidden;
  background:linear-gradient(158deg, rgba(26,29,39,.88), rgba(12,14,20,.93));
  -webkit-backdrop-filter:blur(20px) saturate(150%); backdrop-filter:blur(20px) saturate(150%);
  border:1px solid rgba(255,255,255,.11); border-radius:22px;
  box-shadow:0 32px 90px rgba(0,0,0,.60), 0 2px 0 rgba(255,255,255,.05) inset;
  transform:translateY(20px) scale(.975); opacity:0;
  transition:transform .26s cubic-bezier(.18,.9,.3,1.1), opacity .2s ease;
  outline:none;
}
.mcrp-cz.is-open .cz-panel{ transform:none; opacity:1; }

/* faixa poste de barbeiro no topo */
.mcrp-cz .cz-pole{
  height:5px; flex:0 0 auto;
  background:repeating-linear-gradient(115deg,#e24b45 0 12px,#f2efe8 12px 24px,#3b6fd6 24px 36px,#f2efe8 36px 48px);
  opacity:.9;
}
.mcrp-cz .cz-head{ padding:16px 20px 0; }
.mcrp-cz .cz-kicker{
  font-size:10.5px; letter-spacing:.22em; text-transform:uppercase;
  color:#ffb84d; opacity:.9; font-weight:700;
}
.mcrp-cz .cz-title{ margin:2px 0 12px; font-size:24px; font-weight:700; letter-spacing:.01em; }
.mcrp-cz .cz-tabs{ display:flex; gap:6px; flex-wrap:wrap; }
.mcrp-cz .cz-tab{
  appearance:none; cursor:pointer; font:inherit; font-size:11.5px; font-weight:700; letter-spacing:.09em;
  padding:8px 13px; border-radius:999px; color:#aab3c4;
  background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08);
  transition:background .14s, color .14s, border-color .14s, transform .12s;
}
.mcrp-cz .cz-tab:hover{ color:#eef2fa; background:rgba(255,255,255,.09); }
.mcrp-cz .cz-tab.is-active{
  color:#20232c; background:linear-gradient(180deg,#ffce74,#f0a93a);
  border-color:rgba(255,206,116,.7); box-shadow:0 4px 16px rgba(240,169,58,.28);
}

.mcrp-cz .cz-body{ padding:14px 20px 4px; overflow-y:auto; overflow-x:hidden; }
.mcrp-cz .cz-body::-webkit-scrollbar{ width:8px; }
.mcrp-cz .cz-body::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.14); border-radius:8px; }

.mcrp-cz .cz-sec{ display:none; animation:czIn .2s ease both; }
.mcrp-cz .cz-sec.is-active{ display:block; }
@keyframes czIn{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:none; } }

.mcrp-cz .cz-secbar{ display:flex; align-items:center; gap:10px; margin:2px 0 10px; }
.mcrp-cz .cz-seclabel{
  font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:#8b93a5; font-weight:700;
}
.mcrp-cz .cz-current{
  flex:1; text-align:right; font-size:13.5px; font-weight:700; color:#ffce74;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.mcrp-cz .cz-arrow{
  appearance:none; cursor:pointer; font:inherit; font-size:15px; font-weight:700; line-height:1;
  width:30px; height:30px; border-radius:10px; color:#dfe5f0;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  transition:background .12s, transform .1s;
}
.mcrp-cz .cz-arrow:hover{ background:rgba(255,255,255,.14); }
.mcrp-cz .cz-arrow:active{ transform:scale(.9); }

.mcrp-cz .cz-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.mcrp-cz .cz-card{
  position:relative; appearance:none; cursor:pointer; font:inherit; text-align:left;
  display:flex; flex-direction:column; gap:8px; padding:11px 11px 10px;
  border-radius:14px; color:#cfd6e4;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.09);
  transition:transform .12s cubic-bezier(.2,.9,.3,1.3), border-color .14s, background .14s, box-shadow .14s;
}
.mcrp-cz .cz-card:hover{ transform:translateY(-2px); border-color:rgba(255,206,116,.42); color:#f2f5fb; }
.mcrp-cz .cz-card.is-sel{
  color:#fff; border-color:#ffce74;
  background:linear-gradient(180deg,rgba(255,206,116,.20),rgba(255,206,116,.06));
  box-shadow:0 8px 24px rgba(240,169,58,.20), 0 0 0 1px rgba(255,206,116,.35) inset;
}
.mcrp-cz .cz-card.is-sel .cz-num{ color:#20232c; background:#ffce74; border-color:transparent; }
.mcrp-cz .cz-num{
  display:inline-block; align-self:flex-start; min-width:22px; text-align:center;
  font-size:10.5px; font-weight:700; letter-spacing:.05em; padding:2px 5px; border-radius:6px;
  color:#9aa3b5; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08);
}
.mcrp-cz .cz-name{ font-size:12.5px; font-weight:700; line-height:1.25; }

/* glifos css: silhueta simplificada de cada categoria */
.mcrp-cz .cz-glyph{ position:relative; height:34px; }
.mcrp-cz .cz-glyph::before, .mcrp-cz .cz-glyph::after{
  content:''; position:absolute; background:currentColor; opacity:.55;
}
.mcrp-cz .cz-glyph.g-hair::before{ left:6%; right:6%; top:6px; height:16px; border-radius:16px 16px 4px 4px; }
.mcrp-cz .cz-glyph.g-hair.v1::before{ left:22%; right:22%; top:0; height:26px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-hair.v2::before{ left:4%; right:4%; top:9px; height:22px; border-radius:12px 12px 12px 12px; }
.mcrp-cz .cz-glyph.g-eyes::before{ left:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-eyes::after{ right:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-eyes.v1::before, .mcrp-cz .cz-glyph.g-eyes.v1::after{ height:9px; top:13px; border-radius:9px; }
.mcrp-cz .cz-glyph.g-eyes.v2::before, .mcrp-cz .cz-glyph.g-eyes.v2::after{ width:20px; height:20px; top:7px; }
.mcrp-cz .cz-glyph.g-brows::before{ left:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(-8deg); }
.mcrp-cz .cz-glyph.g-brows::after{ right:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(8deg); }
.mcrp-cz .cz-glyph.g-brows.v1::before, .mcrp-cz .cz-glyph.g-brows.v1::after{ height:9px; transform:none; }
.mcrp-cz .cz-glyph.g-brows.v2::before{ transform:rotate(12deg); }
.mcrp-cz .cz-glyph.g-brows.v2::after{ transform:rotate(-12deg); }
.mcrp-cz .cz-glyph.g-mouth::before{ left:24%; right:24%; top:12px; height:6px; border-radius:0 0 14px 14px; }
.mcrp-cz .cz-glyph.g-mouth.v1::before{ height:14px; border-radius:0 0 18px 18px; }
.mcrp-cz .cz-glyph.g-mouth.v2::before{ top:16px; height:5px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-mouth.v2::after{ left:18%; right:18%; top:6px; height:7px; border-radius:8px; opacity:.4; }

.mcrp-cz .cz-colors{ margin-top:16px; }
.mcrp-cz .cz-dots{ display:flex; flex-wrap:wrap; gap:9px; }
.mcrp-cz .cz-dot{
  appearance:none; cursor:pointer; width:30px; height:30px; padding:0; border-radius:50%;
  background:var(--c,#888); border:2px solid rgba(255,255,255,.16);
  box-shadow:0 3px 10px rgba(0,0,0,.4), inset 0 -6px 10px rgba(0,0,0,.25);
  transition:transform .12s cubic-bezier(.2,.9,.3,1.4), border-color .14s, box-shadow .14s;
}
.mcrp-cz .cz-dot:hover{ transform:scale(1.12); }
.mcrp-cz .cz-dot.is-sel{
  border-color:#ffce74; transform:scale(1.14);
  box-shadow:0 0 0 3px rgba(255,206,116,.28), 0 4px 12px rgba(0,0,0,.45);
}

.mcrp-cz .cz-bubble{
  display:none; position:relative; margin:14px 20px 0; padding:11px 14px;
  background:linear-gradient(180deg,#fdf6e6,#f0e6cf); color:#2a2118;
  border-radius:14px; font-size:13px; font-weight:600; line-height:1.35;
  box-shadow:0 10px 28px rgba(0,0,0,.4);
}
.mcrp-cz .cz-bubble.is-on{ display:block; animation:czPop .26s cubic-bezier(.2,.9,.3,1.4) both; }
.mcrp-cz .cz-bubble::after{
  content:''; position:absolute; left:26px; bottom:-7px; width:14px; height:14px;
  background:#f0e6cf; transform:rotate(45deg); border-radius:2px;
}
.mcrp-cz .cz-bubble b{ display:block; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#9a6a2c; }
@keyframes czPop{ from{ opacity:0; transform:translateY(8px) scale(.94); } to{ opacity:1; transform:none; } }

.mcrp-cz .cz-foot{
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding:14px 20px 16px; margin-top:6px;
  border-top:1px solid rgba(255,255,255,.07);
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,.18));
}
.mcrp-cz .cz-hints{ flex:1; min-width:180px; font-size:10.5px; color:#7f889a; line-height:1.8; }
.mcrp-cz .cz-hints kbd{
  display:inline-block; padding:1px 6px; margin:0 2px; border-radius:5px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12);
  color:#c7cfdd; font:inherit; font-size:10px;
}
.mcrp-cz .cz-btn{
  appearance:none; cursor:pointer; font:inherit; font-size:13px; font-weight:700;
  padding:10px 20px; border-radius:12px; border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06); color:#dde3ef;
  transition:background .14s, transform .1s, box-shadow .14s;
}
.mcrp-cz .cz-btn:hover{ background:rgba(255,255,255,.13); }
.mcrp-cz .cz-btn:active{ transform:translateY(1px); }
.mcrp-cz .cz-btn.cz-ok{
  color:#221c10; border-color:transparent;
  background:linear-gradient(180deg,#ffd583,#f0a93a);
  box-shadow:0 8px 22px rgba(240,169,58,.32);
}
.mcrp-cz .cz-btn.cz-ok:hover{ background:linear-gradient(180deg,#ffe0a0,#f6b44a); }
.mcrp-cz .cz-btn[disabled]{ opacity:.5; cursor:default; }

@media (max-width:900px){
  .mcrp-cz{ justify-content:center; align-items:flex-end; }
  .mcrp-cz .cz-panel{ width:100%; }
}
`

export function createCustomizer(game) {
  injectStyle()

  // --- DOM base (criado uma vez; o conteudo das abas e refeito a cada open) --
  const root = el('div', 'mcrp-cz')
  root.setAttribute('aria-hidden', 'true')
  const veil = el('div', 'cz-veil')
  const panel = el('div', 'cz-panel')
  panel.tabIndex = -1

  const pole = el('div', 'cz-pole')
  const head = el('div', 'cz-head')
  const kicker = el('div', 'cz-kicker', 'CADEIRA DO BARBEIRO')
  const title = el('h2', 'cz-title', 'Novo visual')
  const tabsBar = el('div', 'cz-tabs')
  head.append(kicker, title, tabsBar)

  const body = el('div', 'cz-body')
  const bubble = el('div', 'cz-bubble')

  const foot = el('div', 'cz-foot')
  const hints = el('div', 'cz-hints')
  hints.innerHTML =
    '<kbd>&larr;</kbd><kbd>&rarr;</kbd> trocar opcao &nbsp; <kbd>1</kbd>-<kbd>3</kbd> escolher<br>' +
    '<kbd>Tab</kbd> proxima aba &nbsp; <kbd>C</kbd> cor &nbsp; <kbd>Enter</kbd> pronto &nbsp; <kbd>Esc</kbd> cancelar'
  const btnCancel = el('button', 'cz-btn cz-cancel', 'Cancelar')
  const btnOk = el('button', 'cz-btn cz-ok', 'Pronto')
  btnCancel.type = 'button'; btnOk.type = 'button'
  foot.append(hints, btnCancel, btnOk)

  panel.append(pole, head, body, bubble, foot)
  root.append(veil, panel)
  document.body.appendChild(root)

  // --- Estado ---------------------------------------------------------------
  let opened = false
  let snapshot = null      // aparencia no momento da abertura (para cancelar)
  let tabKeys = []         // abas visiveis no kind atual
  let activeTab = null
  let closing = false
  let bubbleTimer = 0
  const sections = new Map() // key -> { def, secEl, cards[], currentEl }
  const tabBtns = new Map()
  let dotEls = []
  const state = { hair: 0, eyes: 0, brows: 0, mouth: 0, hairColor: 0 }

  // --- Helpers de integracao com o game -------------------------------------
  function apply(patch) {
    callSafe(game, 'setAppearance', patch)
  }

  function readAppearance() {
    const a = (game && game.appearance) || {}
    for (const k of Object.keys(state)) {
      const v = a[k]
      state[k] = typeof v === 'number' && isFinite(v) ? v : 0
    }
  }

  function clampState() {
    for (const def of TAB_DEFS) {
      const n = def.list ? def.list.length : 0
      if (n > 0) state[def.field] = ((state[def.field] % n) + n) % n
      else state[def.field] = 0
    }
    const cn = COLORS.length
    state.hairColor = cn > 0 ? ((state.hairColor % cn) + cn) % cn : 0
  }

  // --- Construcao das abas --------------------------------------------------
  function buildTabs(kind) {
    tabsBar.innerHTML = ''
    body.innerHTML = ''
    sections.clear()
    tabBtns.clear()
    dotEls = []

    tabKeys = KIND_TABS[kind] || KIND_TABS.all
    // so mostra aba com catalogo valido
    tabKeys = tabKeys.filter((k) => {
      const d = TAB_DEFS.find((t) => t.key === k)
      return d && Array.isArray(d.list) && d.list.length > 0
    })
    if (tabKeys.length === 0) tabKeys = ['hair']

    for (const key of tabKeys) {
      const def = TAB_DEFS.find((t) => t.key === key)
      const tab = el('button', 'cz-tab', def.label)
      tab.type = 'button'
      tab.addEventListener('click', () => setTab(key))
      tabsBar.appendChild(tab)
      tabBtns.set(key, tab)

      const sec = el('section', 'cz-sec')

      const bar = el('div', 'cz-secbar')
      const prev = el('button', 'cz-arrow', '<')
      const next = el('button', 'cz-arrow', '>')
      prev.type = 'button'; next.type = 'button'
      prev.title = 'Anterior'; next.title = 'Proximo'
      prev.addEventListener('click', () => step(key, -1))
      next.addEventListener('click', () => step(key, +1))
      const label = el('span', 'cz-seclabel', def.title)
      const current = el('span', 'cz-current', '')
      bar.append(prev, next, label, current)

      const grid = el('div', 'cz-grid')
      const cards = []
      def.list.forEach((opt, i) => {
        const card = el('button', 'cz-card')
        card.type = 'button'
        card.append(
          el('span', 'cz-num', String(i + 1).padStart(2, '0')),
          el('span', 'cz-glyph g-' + def.glyph + ' v' + i),
          el('span', 'cz-name', opt && opt.name ? opt.name : 'Opcao ' + (i + 1)),
        )
        card.addEventListener('click', () => select(key, i))
        grid.appendChild(card)
        cards.push(card)
      })

      sec.append(bar, grid)

      // paleta de cor so na aba de cabelo
      if (def.colors && COLORS.length > 0) {
        const wrap = el('div', 'cz-colors')
        const cbar = el('div', 'cz-secbar')
        cbar.append(el('span', 'cz-seclabel', 'Cor do cabelo'))
        const cname = el('span', 'cz-current', '')
        cbar.appendChild(cname)
        const dots = el('div', 'cz-dots')
        COLORS.forEach((c, i) => {
          const dot = el('button', 'cz-dot')
          dot.type = 'button'
          dot.style.setProperty('--c', cssHex(c && c.hex))
          dot.title = (c && c.name) || 'Cor ' + (i + 1)
          dot.addEventListener('click', () => selectColor(i))
          dots.appendChild(dot)
          dotEls.push(dot)
        })
        wrap.append(cbar, dots)
        sec.appendChild(wrap)
        sections.set(key + ':color', { nameEl: cname })
      }

      body.appendChild(sec)
      sections.set(key, { def, secEl: sec, cards, currentEl: current })
    }
  }

  function setTab(key) {
    if (!sections.has(key)) return
    activeTab = key
    for (const [k, s] of sections) {
      if (!s.secEl) continue
      s.secEl.classList.toggle('is-active', k === key)
    }
    for (const [k, b] of tabBtns) b.classList.toggle('is-active', k === key)
    body.scrollTop = 0
  }

  function cycleTab(dir) {
    if (tabKeys.length < 2) return
    const i = tabKeys.indexOf(activeTab)
    setTab(tabKeys[((i + dir) % tabKeys.length + tabKeys.length) % tabKeys.length])
  }

  // --- Selecao --------------------------------------------------------------
  function select(key, index) {
    const s = sections.get(key)
    if (!s) return
    const n = s.def.list.length
    const i = ((index % n) + n) % n
    state[s.def.field] = i
    apply({ [s.def.field]: i })   // preview ao vivo
    refresh()
  }

  function step(key, dir) {
    const s = sections.get(key)
    if (!s) return
    select(key, state[s.def.field] + dir)
  }

  function selectColor(index) {
    if (COLORS.length === 0) return
    const i = ((index % COLORS.length) + COLORS.length) % COLORS.length
    state.hairColor = i
    apply({ hairColor: i })
    refresh()
  }

  function refresh() {
    for (const s of sections.values()) {
      if (!s.def) continue
      const cur = state[s.def.field]
      s.cards.forEach((c, i) => c.classList.toggle('is-sel', i === cur))
      const opt = s.def.list[cur]
      s.currentEl.textContent = (opt && opt.name ? opt.name : '-') + '  ' + (cur + 1) + '/' + s.def.list.length
    }
    dotEls.forEach((d, i) => d.classList.toggle('is-sel', i === state.hairColor))
    const cs = sections.get('hair:color')
    if (cs && COLORS[state.hairColor]) cs.nameEl.textContent = COLORS[state.hairColor].name || ''
  }

  // --- Teclado --------------------------------------------------------------
  function onKey(e) {
    if (!opened) return
    const k = e.key
    let used = true
    if (k === 'Escape') finish(false)
    else if (k === 'Enter' || k === 'NumpadEnter') confirm()
    else if (k === 'Tab') cycleTab(e.shiftKey ? -1 : 1)
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') step(activeTab, -1)
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') step(activeTab, +1)
    else if (k === 'ArrowUp') cycleTab(-1)
    else if (k === 'ArrowDown') cycleTab(1)
    else if (k === 'c' || k === 'C') selectColor(state.hairColor + 1)
    else if (k >= '1' && k <= '9') select(activeTab, Number(k) - 1)
    else used = false
    if (used) { e.preventDefault(); e.stopPropagation() }
  }

  // engole cliques para o main nao re-travar o pointer no painel
  function swallow(e) { e.stopPropagation() }

  // se algo re-travar o mouse com o painel aberto, solta de novo
  function onPointerLockChange() {
    if (opened && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  // --- Balao do barbeiro ----------------------------------------------------
  function showBubble(text) {
    bubble.innerHTML = ''
    bubble.append(el('b', null, 'ZEZO'), document.createTextNode(text))
    bubble.classList.add('is-on')
  }

  function hideBubble() {
    bubble.classList.remove('is-on')
    bubble.innerHTML = ''
  }

  // --- Abrir / fechar -------------------------------------------------------
  function open(kind = 'all', opts = {}) {
    if (opened) { setTab(tabKeys[0]); return }
    opened = true
    closing = false

    readAppearance()
    clampState()
    snapshot = { hair: state.hair, eyes: state.eyes, brows: state.brows, mouth: state.mouth, hairColor: state.hairColor }

    buildTabs(kind)
    setTab(tabKeys[0])
    refresh()

    title.textContent = opts.title || (kind === 'hair' ? 'Corte de cabelo' : kind === 'face' ? 'Tracos do rosto' : 'Novo visual')
    kicker.textContent = opts.kicker || 'CADEIRA DO BARBEIRO'
    btnOk.disabled = false
    btnCancel.disabled = false
    hideBubble()
    if (opts.intro) showBubble(opts.intro)

    // trava o jogador e solta o mouse enquanto o painel esta aberto
    callSafe(game && game.player, 'setLocked', true)
    try { document.exitPointerLock() } catch (err) { void err }
    document.addEventListener('pointerlockchange', onPointerLockChange)
    window.addEventListener('keydown', onKey, true)

    // camera de preview: rosto para cabelo/face, corpo inteiro no 'all'
    const focus = opts.focus || (kind === 'all' ? 'body' : 'head')
    callSafe(game, 'beginPreview', focus)

    root.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => root.classList.add('is-open'))
    setTimeout(() => { if (opened) panel.focus() }, 30)
  }

  function confirm() {
    if (!opened || closing) return
    const line = confirm._line
    callSafe(game, 'toast', 'Novo visual salvo!')
    if (line) {
      // fala do barbeiro antes de fechar
      closing = true
      btnOk.disabled = true
      btnCancel.disabled = true
      showBubble(line)
      clearTimeout(bubbleTimer)
      bubbleTimer = setTimeout(() => { closing = false; finish(true) }, 1700)
    } else {
      finish(true)
    }
  }

  function finish(save) {
    if (!opened) return
    clearTimeout(bubbleTimer)
    closing = false

    if (!save && snapshot) apply({ ...snapshot }) // Esc/Cancelar restaura o visual original

    opened = false
    snapshot = null
    confirm._line = null

    window.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerlockchange', onPointerLockChange)

    root.classList.remove('is-open')
    root.setAttribute('aria-hidden', 'true')
    setTimeout(() => { if (!opened) hideBubble() }, 220)

    callSafe(game, 'endPreview')
    callSafe(game && game.player, 'setLocked', false) // o main re-trava o mouse no proximo clique
  }

  // --- Listeners fixos ------------------------------------------------------
  btnOk.addEventListener('click', confirm)
  btnCancel.addEventListener('click', () => finish(false))
  for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    root.addEventListener(ev, swallow)
  }
  veil.addEventListener('click', () => finish(false))

  return {
    root,
    open(kind, opts) {
      const o = opts || {}
      confirm._line = o.npcLine || null
      open(kind || 'all', o)
    },
    close() { finish(true) },
    isOpen() { return opened },
  }
}
