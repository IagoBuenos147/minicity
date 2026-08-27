import { CATALOGS } from '../player/appearance.js'
import { CATALOGOS_ROUPA } from '../player/roupas.js'

// ---------------------------------------------------------------------------
// Painel de customizacao do personagem.
//
// Dois grupos de abas sobre os MESMOS catalogos do jogo:
//   "rosto"  -> a cadeira do barbeiro (cabeca, olhos, pupila, nariz, boca,
//               barba, cabelo, cor do cabelo, sobrancelha, pele)
//   "roupa"  -> o provador (chapeu, blusa, jaqueta, calca, calcado, colar,
//               anel, relogio, tatuagem)
//
// NADA de lista escrita na mao aqui: as opcoes saem de CATALOGS
// (src/player/appearance.js) e de CATALOGOS_ROUPA (src/player/roupas.js). Quem
// acrescentar uma barba nova la ve a aba crescer aqui sozinha, sem tocar neste
// arquivo.
//
// DOM puro + <style> injetado. Preview ao vivo: toda mudanca chama
// game.setAppearance() na hora, e o snapshot da abertura permite cancelar.
// A cada troca de aba chama game.beginPreview(foco) pra camera do main saber
// que parte do corpo aproximar.
// ---------------------------------------------------------------------------

const STYLE_ID = 'mcrp-customizer-style'

// Fontes de catalogo, na ordem de busca. O campo da aparencia e a chave nos
// dois objetos, entao achar a lista de uma aba e so procurar pelo nome do campo.
const FONTES = [CATALOGS, CATALOGOS_ROUPA]

/** Lista de opcoes de um campo da aparencia (vazia se o catalogo nao existir). */
function catalogo(field) {
  for (const src of FONTES) {
    const l = src && src[field]
    if (Array.isArray(l) && l.length > 0) return l
  }
  return []
}

/**
 * Catalogo de abas.
 *   field  chave usada em game.setAppearance() (o nome do contrato, 20 bytes)
 *   grupo  'rosto' (barbeiro) ou 'roupa' (provador)
 *   foco   o que o main deve enquadrar: rosto | corpo | pescoco | pes | mao | braco
 * O chapeu entra como foco 'rosto' porque e a cabeca que precisa de close.
 */
const TAB_DEFS = [
  { field: 'cabeca', label: 'CABECA', title: 'Formato da cabeca', glyph: 'cabeca', grupo: 'rosto', foco: 'rosto' },
  { field: 'olhos', label: 'OLHOS', title: 'Olhos', glyph: 'olhos', grupo: 'rosto', foco: 'rosto' },
  { field: 'pupila', label: 'PUPILA', title: 'Pupila', glyph: 'pupila', grupo: 'rosto', foco: 'rosto' },
  { field: 'nariz', label: 'NARIZ', title: 'Nariz', glyph: 'nariz', grupo: 'rosto', foco: 'rosto' },
  { field: 'boca', label: 'BOCA', title: 'Boca', glyph: 'boca', grupo: 'rosto', foco: 'rosto' },
  { field: 'barba', label: 'BARBA', title: 'Barba', glyph: 'barba', grupo: 'rosto', foco: 'rosto' },
  { field: 'cabelo', label: 'CABELO', title: 'Corte de cabelo', glyph: 'cabelo', grupo: 'rosto', foco: 'rosto' },
  { field: 'corCabelo', label: 'COR', title: 'Cor do cabelo', glyph: 'pele', grupo: 'rosto', foco: 'rosto' },
  { field: 'sobrancelha', label: 'SOBRANC.', title: 'Sobrancelhas', glyph: 'sobrancelha', grupo: 'rosto', foco: 'rosto' },
  { field: 'pele', label: 'PELE', title: 'Tom de pele', glyph: 'pele', grupo: 'rosto', foco: 'rosto' },

  { field: 'chapeu', label: 'CHAPEU', title: 'Chapeu', glyph: 'chapeu', grupo: 'roupa', foco: 'rosto' },
  { field: 'blusa', label: 'BLUSA', title: 'Blusa', glyph: 'blusa', grupo: 'roupa', foco: 'corpo' },
  { field: 'jaqueta', label: 'JAQUETA', title: 'Jaqueta', glyph: 'jaqueta', grupo: 'roupa', foco: 'corpo' },
  { field: 'calca', label: 'CALCA', title: 'Calca', glyph: 'calca', grupo: 'roupa', foco: 'corpo' },
  { field: 'calcado', label: 'CALCADO', title: 'Calcado', glyph: 'calcado', grupo: 'roupa', foco: 'pes' },
  { field: 'colar', label: 'COLAR', title: 'Colar', glyph: 'colar', grupo: 'roupa', foco: 'pescoco' },
  { field: 'anelAcess', label: 'ANEL', title: 'Anel', glyph: 'anel', grupo: 'roupa', foco: 'mao' },
  { field: 'relogio', label: 'RELOGIO', title: 'Relogio', glyph: 'relogio', grupo: 'roupa', foco: 'mao' },
  { field: 'tatuagem', label: 'TATUAGEM', title: 'Tatuagem', glyph: 'tatuagem', grupo: 'roupa', foco: 'braco' },
]

const DEF_POR_CAMPO = new Map(TAB_DEFS.map((d) => [d.field, d]))

function camposDoGrupo(grupo) {
  return TAB_DEFS.filter((d) => d.grupo === grupo).map((d) => d.field)
}

const GRUPO_ROSTO = camposDoGrupo('rosto')
const GRUPO_ROUPA = camposDoGrupo('roupa')

// open(kind) aceita os nomes novos e os antigos ('hair'/'face' = a cadeira do
// barbeiro de antes, que so mexia no rosto).
const KIND_TABS = {
  rosto: GRUPO_ROSTO,
  roupa: GRUPO_ROUPA,
  all: GRUPO_ROSTO.concat(GRUPO_ROUPA),
  hair: GRUPO_ROSTO,
  face: GRUPO_ROSTO,
  barbeiro: GRUPO_ROSTO,
  provador: GRUPO_ROUPA,
}

// Cabecalho por grupo.
const KIND_HEAD = {
  rosto: { kicker: 'CADEIRA DO BARBEIRO', title: 'Novo visual', npc: 'ZEZO' },
  roupa: { kicker: 'PROVADOR', title: 'Provar roupa', npc: 'ROSA' },
  all: { kicker: 'BARBEIRO E PROVADOR', title: 'Visual completo', npc: 'ZEZO' },
}

// Apelidos antigos aceitos na LEITURA de game.appearance (o jogo pode ter sido
// salvo antes da reforma dos 20 campos).
const APELIDOS = {
  cabelo: 'hair', olhos: 'eyes', sobrancelha: 'brows', boca: 'mouth', corCabelo: 'hairColor',
}

/** Nome que aparece no card. Os catalogos usam `nome`; os antigos, `name`. */
function nomeDe(opt, i) {
  if (opt && typeof opt.nome === 'string' && opt.nome) return opt.nome
  if (opt && typeof opt.name === 'string' && opt.name) return opt.name
  if (opt && typeof opt.id === 'string' && opt.id) return opt.id
  return 'Opcao ' + (i + 1)
}

/** Aba de amostra de cor: quando TODA opcao do catalogo traz um hex proprio. */
function ehAmostra(list) {
  return list.length > 0 && list.every((o) => o && typeof o.hex === 'number')
}

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
  position:relative; width:min(580px,100%); max-height:100%;
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

/* Faixa de abas ROLAVEL: com 10 (ou 19) categorias o wrap empurrava os cards
   pra fora da tela. position:relative pra que offsetLeft dos botoes seja
   medido dentro da faixa (e o revealTab acertar o scroll). */
.mcrp-cz .cz-tabs{
  position:relative; display:flex; gap:6px; flex-wrap:nowrap;
  overflow-x:auto; overflow-y:hidden; padding-bottom:9px;
  scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.18) transparent;
  overscroll-behavior-x:contain;
}
.mcrp-cz .cz-tabs::-webkit-scrollbar{ height:6px; }
.mcrp-cz .cz-tabs::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.14); border-radius:6px; }
.mcrp-cz .cz-tabs::-webkit-scrollbar-track{ background:transparent; }
.mcrp-cz .cz-tab{
  flex:0 0 auto; appearance:none; cursor:pointer; font:inherit; font-size:11px; font-weight:700; letter-spacing:.08em;
  padding:8px 12px; border-radius:999px; color:#aab3c4; white-space:nowrap;
  background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08);
  transition:background .14s, color .14s, border-color .14s, transform .12s;
}
.mcrp-cz .cz-tab:hover{ color:#eef2fa; background:rgba(255,255,255,.09); }
.mcrp-cz .cz-tab.is-active{
  color:#20232c; background:linear-gradient(180deg,#ffce74,#f0a93a);
  border-color:rgba(255,206,116,.7); box-shadow:0 4px 16px rgba(240,169,58,.28);
}
/* separador entre o grupo do rosto e o grupo da roupa (so no modo 'all') */
.mcrp-cz .cz-tabsep{
  flex:0 0 auto; align-self:center; width:1px; height:18px; margin:0 4px;
  background:rgba(255,255,255,.16);
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
  width:30px; height:30px; border-radius:10px; color:#dfe5f0; flex:0 0 auto;
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

/* glifos css: silhueta simplificada de cada categoria. A variacao por opcao sai
   da variavel --v (o indice do card), sem precisar de uma regra por item. */
.mcrp-cz .cz-glyph{
  position:relative; height:34px;
  transform:scale(calc(.88 + var(--v,0) * .042)); transform-origin:50% 60%;
}
.mcrp-cz .cz-glyph::before, .mcrp-cz .cz-glyph::after{
  content:''; position:absolute; background:currentColor; opacity:.55;
}
.mcrp-cz .cz-glyph.g-cabeca::before{ left:28%; right:28%; top:2px; bottom:2px; border-radius:48% 48% 44% 44%; }
.mcrp-cz .cz-glyph.g-cabelo::before{ left:6%; right:6%; top:6px; height:16px; border-radius:16px 16px 4px 4px; }
.mcrp-cz .cz-glyph.g-cabelo.v1::before{ left:22%; right:22%; top:0; height:26px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-cabelo.v2::before{ left:4%; right:4%; top:9px; height:22px; border-radius:12px; }
.mcrp-cz .cz-glyph.g-olhos::before{ left:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-olhos::after{ right:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-olhos.v1::before, .mcrp-cz .cz-glyph.g-olhos.v1::after{ height:9px; top:13px; border-radius:9px; }
.mcrp-cz .cz-glyph.g-olhos.v2::before, .mcrp-cz .cz-glyph.g-olhos.v2::after{ width:20px; height:20px; top:7px; }
.mcrp-cz .cz-glyph.g-pupila::before{
  left:50%; top:7px; width:20px; height:20px; margin-left:-10px; border-radius:50%;
  background:transparent; border:2px solid currentColor;
}
.mcrp-cz .cz-glyph.g-pupila::after{ left:50%; top:13px; width:8px; height:8px; margin-left:-4px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-nariz::before{ left:50%; top:5px; width:11px; height:20px; margin-left:-5.5px; border-radius:44% 44% 50% 50%; }
.mcrp-cz .cz-glyph.g-nariz::after{ left:50%; top:22px; width:19px; height:6px; margin-left:-9.5px; border-radius:6px; opacity:.32; }
.mcrp-cz .cz-glyph.g-boca::before{ left:24%; right:24%; top:12px; height:6px; border-radius:0 0 14px 14px; }
.mcrp-cz .cz-glyph.g-boca.v1::before{ height:14px; border-radius:0 0 18px 18px; }
.mcrp-cz .cz-glyph.g-boca.v2::before{ top:16px; height:5px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-boca.v2::after{ left:18%; right:18%; top:6px; height:7px; border-radius:8px; opacity:.4; }
.mcrp-cz .cz-glyph.g-barba::before{ left:22%; right:22%; top:9px; bottom:0; border-radius:8px 8px 22px 22px; }
.mcrp-cz .cz-glyph.g-barba::after{ left:33%; right:33%; top:2px; height:6px; border-radius:6px; opacity:.4; }
.mcrp-cz .cz-glyph.g-sobrancelha::before{ left:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(-8deg); }
.mcrp-cz .cz-glyph.g-sobrancelha::after{ right:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(8deg); }
.mcrp-cz .cz-glyph.g-sobrancelha.v1::before, .mcrp-cz .cz-glyph.g-sobrancelha.v1::after{ height:9px; transform:none; }
.mcrp-cz .cz-glyph.g-sobrancelha.v2::before{ transform:rotate(12deg); }
.mcrp-cz .cz-glyph.g-sobrancelha.v2::after{ transform:rotate(-12deg); }
.mcrp-cz .cz-glyph.g-pele::before{ left:20%; right:20%; top:4px; bottom:4px; border-radius:11px; }
.mcrp-cz .cz-glyph.g-chapeu::before{ left:6%; right:6%; top:20px; height:7px; border-radius:7px; }
.mcrp-cz .cz-glyph.g-chapeu::after{ left:26%; right:26%; top:5px; height:16px; border-radius:11px 11px 2px 2px; }
.mcrp-cz .cz-glyph.g-blusa::before{ left:18%; right:18%; top:6px; bottom:2px; border-radius:11px 11px 6px 6px; }
.mcrp-cz .cz-glyph.g-blusa::after{ left:40%; right:40%; top:3px; height:8px; border-radius:0 0 9px 9px; opacity:.33; }
.mcrp-cz .cz-glyph.g-jaqueta::before{ left:16%; right:16%; top:6px; bottom:2px; border-radius:11px 11px 6px 6px; }
.mcrp-cz .cz-glyph.g-jaqueta::after{ left:50%; top:7px; bottom:3px; width:4px; margin-left:-2px; border-radius:3px; opacity:.32; }
.mcrp-cz .cz-glyph.g-calca::before{ left:26%; top:4px; bottom:1px; width:9px; border-radius:5px 5px 3px 3px; }
.mcrp-cz .cz-glyph.g-calca::after{ right:26%; top:4px; bottom:1px; width:9px; border-radius:5px 5px 3px 3px; }
.mcrp-cz .cz-glyph.g-calcado::before{ left:14%; right:14%; top:11px; height:14px; border-radius:7px 13px 8px 4px; }
.mcrp-cz .cz-glyph.g-calcado::after{ left:9%; right:9%; top:25px; height:5px; border-radius:4px; opacity:.33; }
.mcrp-cz .cz-glyph.g-colar::before{
  left:50%; top:4px; width:24px; height:24px; margin-left:-12px; border-radius:50%;
  background:transparent; border:3px solid currentColor;
}
.mcrp-cz .cz-glyph.g-colar::after{ left:50%; top:24px; width:8px; height:9px; margin-left:-4px; border-radius:3px; }
.mcrp-cz .cz-glyph.g-anel::before{
  left:50%; top:10px; width:17px; height:17px; margin-left:-8.5px; border-radius:50%;
  background:transparent; border:3px solid currentColor;
}
.mcrp-cz .cz-glyph.g-anel::after{ left:50%; top:4px; width:8px; height:8px; margin-left:-4px; border-radius:50%; opacity:.4; }
.mcrp-cz .cz-glyph.g-relogio::before{ left:50%; top:1px; bottom:1px; width:9px; margin-left:-4.5px; border-radius:4px; opacity:.32; }
.mcrp-cz .cz-glyph.g-relogio::after{ left:50%; top:10px; width:19px; height:16px; margin-left:-9.5px; border-radius:5px; }
.mcrp-cz .cz-glyph.g-tatuagem::before{ left:30%; right:30%; top:1px; bottom:1px; border-radius:7px; opacity:.28; }
.mcrp-cz .cz-glyph.g-tatuagem::after{ left:34%; right:34%; top:11px; height:11px; border-radius:3px; }

.mcrp-cz .cz-dots{ display:flex; flex-wrap:wrap; gap:11px; padding:4px 0 2px; }
.mcrp-cz .cz-dot{
  appearance:none; cursor:pointer; width:38px; height:38px; padding:0; border-radius:50%;
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
  .mcrp-cz .cz-grid{ grid-template-columns:repeat(2,1fr); }
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
    '<kbd>&larr;</kbd><kbd>&rarr;</kbd> trocar opcao &nbsp; <kbd>1</kbd>-<kbd>9</kbd> escolher<br>' +
    '<kbd>Tab</kbd> proxima aba &nbsp; <kbd>C</kbd> cor do cabelo &nbsp; <kbd>Enter</kbd> pronto &nbsp; <kbd>Esc</kbd> cancelar'
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
  let tabKeys = []         // campos visiveis no kind atual
  let activeTab = null
  let activeKind = 'all'
  let closing = false
  let bubbleTimer = 0
  let npcNome = 'ZEZO'
  const sections = new Map() // campo -> { def, list, secEl, cards[], currentEl }
  const tabBtns = new Map()

  // Um indice por campo do contrato. Nasce zerado e e relido de game.appearance
  // a cada abertura.
  const state = {}
  for (const d of TAB_DEFS) state[d.field] = 0

  // --- Helpers de integracao com o game -------------------------------------
  function apply(patch) {
    callSafe(game, 'setAppearance', patch)
  }

  function readAppearance() {
    const a = (game && game.appearance) || {}
    for (const d of TAB_DEFS) {
      let v = a[d.field]
      // aparencia antiga (hair/eyes/brows/mouth/hairColor) ainda e aceita
      if (typeof v !== 'number' && APELIDOS[d.field]) v = a[APELIDOS[d.field]]
      state[d.field] = typeof v === 'number' && isFinite(v) ? v : 0
    }
  }

  function clampState() {
    for (const d of TAB_DEFS) {
      const n = catalogo(d.field).length
      state[d.field] = n > 0 ? ((state[d.field] % n) + n) % n : 0
    }
  }

  // --- Construcao das abas --------------------------------------------------
  function buildTabs(kind) {
    tabsBar.innerHTML = ''
    body.innerHTML = ''
    sections.clear()
    tabBtns.clear()

    // so entra aba com catalogo de verdade: catalogo vazio viraria uma aba morta
    tabKeys = (KIND_TABS[kind] || KIND_TABS.all).filter((f) => catalogo(f).length > 0)
    if (tabKeys.length === 0) tabKeys = ['cabelo']

    let grupoAnterior = null
    for (const campo of tabKeys) {
      const def = DEF_POR_CAMPO.get(campo)
      if (!def) continue
      const list = catalogo(campo)

      // risquinho separando o grupo do rosto do grupo da roupa (modo 'all')
      if (grupoAnterior !== null && def.grupo !== grupoAnterior) tabsBar.appendChild(el('span', 'cz-tabsep'))
      grupoAnterior = def.grupo

      const tab = el('button', 'cz-tab', def.label)
      tab.type = 'button'
      tab.title = def.title
      tab.addEventListener('click', () => setTab(campo))
      tabsBar.appendChild(tab)
      tabBtns.set(campo, tab)

      const sec = el('section', 'cz-sec')

      const bar = el('div', 'cz-secbar')
      const prev = el('button', 'cz-arrow', '<')
      const next = el('button', 'cz-arrow', '>')
      prev.type = 'button'; next.type = 'button'
      prev.title = 'Anterior'; next.title = 'Proximo'
      prev.addEventListener('click', () => step(campo, -1))
      next.addEventListener('click', () => step(campo, +1))
      const label = el('span', 'cz-seclabel', def.title)
      const current = el('span', 'cz-current', '')
      bar.append(prev, next, label, current)
      sec.appendChild(bar)

      const cards = []
      if (ehAmostra(list)) {
        // catalogo de COR (cor do cabelo, tom de pele): bolinha em vez de card
        const dots = el('div', 'cz-dots')
        list.forEach((opt, i) => {
          const dot = el('button', 'cz-dot')
          dot.type = 'button'
          dot.style.setProperty('--c', cssHex(opt && opt.hex))
          dot.title = nomeDe(opt, i)
          dot.addEventListener('click', () => select(campo, i))
          dots.appendChild(dot)
          cards.push(dot)
        })
        sec.appendChild(dots)
      } else {
        const grid = el('div', 'cz-grid')
        list.forEach((opt, i) => {
          const card = el('button', 'cz-card')
          card.type = 'button'
          card.style.setProperty('--v', String(i))
          card.append(
            el('span', 'cz-num', String(i + 1).padStart(2, '0')),
            el('span', 'cz-glyph g-' + def.glyph + ' v' + i),
            el('span', 'cz-name', nomeDe(opt, i)),
          )
          card.addEventListener('click', () => select(campo, i))
          grid.appendChild(card)
          cards.push(card)
        })
        sec.appendChild(grid)
      }

      body.appendChild(sec)
      sections.set(campo, { def, list, secEl: sec, cards, currentEl: current })
    }
  }

  /** Puxa a aba ativa pra dentro da faixa rolavel (com 10+ abas ela sai da vista). */
  function revealTab(btn) {
    if (!btn) return
    const left = btn.offsetLeft
    const right = left + btn.offsetWidth
    if (left < tabsBar.scrollLeft) tabsBar.scrollLeft = left - 12
    else if (right > tabsBar.scrollLeft + tabsBar.clientWidth) {
      tabsBar.scrollLeft = right - tabsBar.clientWidth + 12
    }
  }

  function setTab(campo) {
    const s = sections.get(campo)
    if (!s) return
    activeTab = campo
    for (const [k, sec] of sections) sec.secEl.classList.toggle('is-active', k === campo)
    for (const [k, b] of tabBtns) b.classList.toggle('is-active', k === campo)
    body.scrollTop = 0
    revealTab(tabBtns.get(campo))
    // e AQUI que o main aproxima a camera da parte que esta sendo mexida
    if (opened) callSafe(game, 'beginPreview', s.def.foco)
  }

  function cycleTab(dir) {
    if (tabKeys.length < 2) return
    const i = tabKeys.indexOf(activeTab)
    setTab(tabKeys[((i + dir) % tabKeys.length + tabKeys.length) % tabKeys.length])
  }

  // --- Selecao --------------------------------------------------------------
  function select(campo, index) {
    const s = sections.get(campo)
    if (!s || s.list.length === 0) return
    const n = s.list.length
    const i = ((index % n) + n) % n
    if (state[campo] === i) { refresh(); return }
    state[campo] = i
    apply({ [campo]: i })   // preview ao vivo
    refresh()
  }

  function step(campo, dir) {
    if (!sections.has(campo)) return
    select(campo, state[campo] + dir)
  }

  function refresh() {
    for (const [campo, s] of sections) {
      const cur = state[campo]
      s.cards.forEach((c, i) => c.classList.toggle('is-sel', i === cur))
      const opt = s.list[cur]
      s.currentEl.textContent = nomeDe(opt, cur) + '  ' + (cur + 1) + '/' + s.list.length
    }
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
    else if (k === 'c' || k === 'C') {
      // atalho velho do barbeiro: pula direto pra cor do cabelo (se ela existe
      // neste grupo); ja estando la, so avanca a cor
      if (activeTab === 'corCabelo') step('corCabelo', +1)
      else if (sections.has('corCabelo')) setTab('corCabelo')
      else used = false
    } else if (k >= '1' && k <= '9') select(activeTab, Number(k) - 1)
    else used = false
    if (used) { e.preventDefault(); e.stopPropagation() }
  }

  // engole cliques para o main nao re-travar o pointer no painel
  function swallow(e) { e.stopPropagation() }

  // roda do mouse sobre as abas rola a faixa na horizontal
  function onTabsWheel(e) {
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (!d) return
    tabsBar.scrollLeft += d
    e.preventDefault()
  }

  // se algo re-travar o mouse com o painel aberto, solta de novo
  function onPointerLockChange() {
    if (opened && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  // --- Balao do NPC ---------------------------------------------------------
  function showBubble(text) {
    bubble.innerHTML = ''
    bubble.append(el('b', null, npcNome), document.createTextNode(text))
    bubble.classList.add('is-on')
  }

  function hideBubble() {
    bubble.classList.remove('is-on')
    bubble.innerHTML = ''
  }

  // --- Abrir / fechar -------------------------------------------------------

  /** 'hair'/'face' continuam valendo: viram o grupo do rosto. */
  function normalizaKind(kind) {
    const k = String(kind || 'all')
    return KIND_TABS[k] ? k : 'all'
  }

  function open(kind, opts = {}) {
    const alvo = normalizaKind(kind)

    // ja aberto: se e o mesmo grupo so volta pra primeira aba; se e outro
    // (o jogador saiu do barbeiro e foi no provador) remonta as abas
    if (opened) {
      if (alvo !== activeKind) {
        activeKind = alvo
        buildTabs(alvo)
        aplicaCabecalho(alvo, opts)
      }
      setTab(tabKeys[0])
      refresh()
      return
    }

    opened = true
    closing = false
    activeKind = alvo

    readAppearance()
    clampState()
    // snapshot so dos campos deste painel: e o que o Cancelar restaura
    snapshot = {}
    for (const d of TAB_DEFS) snapshot[d.field] = state[d.field]

    buildTabs(alvo)
    aplicaCabecalho(alvo, opts)
    btnOk.disabled = false
    btnCancel.disabled = false
    hideBubble()
    if (opts.intro) showBubble(opts.intro)

    // trava o jogador e solta o mouse enquanto o painel esta aberto
    callSafe(game && game.player, 'setLocked', true)
    try { document.exitPointerLock() } catch (err) { void err }
    document.addEventListener('pointerlockchange', onPointerLockChange)
    window.addEventListener('keydown', onKey, true)

    // setTab ja avisa o main do foco da primeira aba (rosto no barbeiro,
    // corpo/cabeca no provador). opts.focus so serve pra forcar outro.
    setTab(tabKeys[0])
    refresh()
    if (opts.focus) callSafe(game, 'beginPreview', opts.focus)

    root.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => root.classList.add('is-open'))
    setTimeout(() => { if (opened) panel.focus() }, 30)
  }

  function aplicaCabecalho(kind, opts) {
    const h = KIND_HEAD[kind] || KIND_HEAD.all
    title.textContent = opts.title || h.title
    kicker.textContent = opts.kicker || h.kicker
    npcNome = opts.npc || h.npc
  }

  function confirm() {
    if (!opened || closing) return
    const line = confirm._line
    callSafe(game, 'toast', activeKind === 'roupa' ? 'Roupa nova!' : 'Novo visual salvo!')
    if (line) {
      // fala do NPC antes de fechar
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

    // Esc/Cancelar restaura o visual da abertura. So os campos que MUDARAM
    // entram no patch: mandar os 19 de uma vez faria a rede reenviar tudo.
    if (!save && snapshot) {
      const volta = {}
      let mexeu = false
      for (const d of TAB_DEFS) {
        if (state[d.field] !== snapshot[d.field]) { volta[d.field] = snapshot[d.field]; mexeu = true }
      }
      if (mexeu) apply(volta)
    }

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
  tabsBar.addEventListener('wheel', onTabsWheel, { passive: false })
  veil.addEventListener('click', () => finish(false))

  return {
    root,
    open(kind, opts) {
      const o = opts || {}
      confirm._line = o.npcLine || null
      open(kind, o)
    },
    close() { finish(true) },
    isOpen() { return opened },
    /** Foco atual (o main usa pra saber que parte enquadrar). */
    focus() {
      const s = sections.get(activeTab)
      return s ? s.def.foco : null
    },
    /** Aba (campo da aparencia) que esta sendo mexida. */
    activeField() { return activeTab },
  }
}
