import { NAIPES, cartaTexto, nomeValor, criarBaralho } from '../cassino/baralho.js'
import { criarBlackjack } from '../cassino/blackjack.js'
import { criarPoker, forcaDaMao } from '../cassino/poker.js'
import { SIMBOLOS, PAGAMENTOS, criarSlots } from '../cassino/slots.js'

// ---------------------------------------------------------------------------
// src/ui/cassino-ui.js — a CARA do cassino, em DOM puro.
//
// Os modulos de src/cassino/ sao maquinas de estado PURAS: eles sabem as regras
// e nao sabem que dinheiro existe. Este arquivo e o contrario — nao sabe regra
// nenhuma, e o unico lugar do jogo que DEBITA e CREDITA a carteira. Essa divisao
// nao e capricho: quando o mesmo arquivo decide "o dealer compra" e "menos 100
// de ouro", qualquer ajuste na regra vira um bug de saldo, e bug de saldo o
// jogador percebe na hora e nunca perdoa.
//
// A ORDEM DE UMA APOSTA E SEMPRE A MESMA, e ela e o coracao do arquivo:
//   1. pergunta pra carteira se da   (gastarOuro/gastarFichas devolvem false)
//   2. so entao chama o modulo       (comecar/dobrar/apostar/girar)
//   3. no fim, credita o 'retorno'   (ganharOuro/ganharFichas)
// Nunca o contrario. Cobrar depois de jogar e como servir antes de cobrar: uma
// hora alguem sai sem pagar (aqui: joga com saldo que nao tem).
//
// MOEDA: blackjack aposta OURO (dinheiro vivo na mesa da atendente). Poker e
// caca-niquel apostam FICHA, que so se consegue no caixa. E por isso que o caixa
// existe como ponto separado no mapa.
//
// PAINEL MODAL: enquanto qualquer tela esta aberta o jogador fica travado
// (setLocked(true)) e o mouse solto. O painel engole TODO evento de mouse pra
// nenhum clique de botao virar tiro/interacao no mundo, e engole o teclado pra
// digitar "5" no campo do caixa nao trocar o item da hotbar.
//
// CSS: um <style> so, injetado uma vez, com TODA classe prefixada por
// 'mcrp-cas-' (helper cn() abaixo faz isso sozinho) pra nao brigar com o HUD,
// o customizador nem o balao de dialogo.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-cassino-style'
const P = 'mcrp-cas-'

// Limites da mesa de blackjack. Batem com os defaults de criarBlackjack, mas
// ficam aqui tambem porque a UI precisa deles ANTES do jogo existir (a tela de
// aposta desenha o "minimo 25 / maximo 2000" com a mesa ainda vazia).
const BJ_MIN = 25
const BJ_MAX = 2000

// Fichas clicaveis de cada mesa. Sao valores de cassino de verdade (25/50/100/
// 250/500): numero redondo o jogador soma de cabeca, e cada degrau e o dobro ou
// mais do anterior, entao subir a aposta e uma decisao, nao um deslizar.
const FICHAS_BJ = [25, 50, 100, 250, 500]
const ANTES_POKER = [10, 25, 50, 100]
const APOSTAS_SLOT = [5, 10, 25, 50, 100]
const AUMENTOS_POKER = [25, 50, 100, 250]
const ATALHOS_CAIXA = [50, 100, 250, 500]

// Cor da ficha por valor, como num pano de mesa real. Serve de leitura rapida:
// depois de duas maos o jogador reconhece "a bordo" sem ler o numero.
const COR_FICHA = { 5: '#4a6f8f', 10: '#7a5ea8', 25: '#2f8f5b', 50: '#2f6f9f', 100: '#23262e', 250: '#8f2f45', 500: '#c9a24a' }

// Altura de uma celula do rolete. TEM que ser igual ao .mcrp-cas-cel do CSS:
// e com ela que o JS calcula a parada exata do rolete (translateY negativo).
const CEL = 96

// Quanto o painel espera pelo aoTerminar do 3D antes de revelar sozinho. So
// entra em acao se o mundo 3D existir e nunca chamar de volta (maquina fora de
// vista, animacao interrompida): sem isso a ficha some e nada acontece.
const SOCORRO_GIRO = 3800

const NOME_NPC_POKER = 'DOM SEBASTIAO'

// Frases do caixa. Nada mecanico depende delas; elas so fazem o balcao parecer
// atendido por alguem em vez de ser um formulario.
const FALAS_CAIXA = {
  oi: 'Boa noite. Ficha aqui, sorte la dentro.',
  comprou: 'Prontinho. Bom jogo, e volte pra trocar de volta.',
  vendeu: 'Trocado. Ouro no bolso e cabeca fria.',
  semOuro: 'Faltou ouro pra essa. Escolhe um valor menor.',
  semFicha: 'Voce nao tem ficha toda essa. Confere ai.',
  zero: 'Escolhe um valor primeiro, moco.',
  cortesia: 'Olha... a casa adianta. Nao conta pra ninguem.',
}

// ---------------------------------------------------------------------------
// Helpers pequenos
// ---------------------------------------------------------------------------

/** Prefixa TODA classe com mcrp-cas-. cn('btn ouro') -> 'mcrp-cas-btn mcrp-cas-ouro'. */
function cn(nomes) {
  const partes = String(nomes).split(' ')
  let saida = ''
  for (let i = 0; i < partes.length; i++) {
    if (!partes[i]) continue
    saida += (saida ? ' ' : '') + P + partes[i]
  }
  return saida
}

function el(tag, cls, txt) {
  const e = document.createElement(tag)
  if (cls) e.className = cn(cls)
  if (txt !== undefined && txt !== null) e.textContent = String(txt)
  return e
}

/** Liga/desliga uma classe de estado (tambem prefixada). */
function marca(e, nome, ligado) {
  if (e) e.classList.toggle(P + nome, !!ligado)
}

function botao(cls, txt, aoClicar) {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), txt)
  b.type = 'button'
  if (aoClicar) b.addEventListener('click', aoClicar)
  return b
}

/** Chamada tolerante: modulo ausente ou metodo que explodiu nao derruba a UI. */
function chamar(obj, nome, ...args) {
  if (obj && typeof obj[nome] === 'function') {
    try { return obj[nome](...args) } catch (err) { console.warn('[cassino-ui] ' + nome + ':', err) }
  }
  return undefined
}

function inteiro(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? n : 0
}

/** Cor que pode vir como 0xrrggbb (jeito three) ou como string css. */
function cssCor(c, padrao) {
  if (typeof c === 'string' && c) return c
  if (typeof c === 'number' && Number.isFinite(c)) {
    return '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0')
  }
  return padrao || '#8a8f99'
}

/** Numero com separador de milhar: 12500 -> 12.500. Saldo grande sem isso vira sopa. */
function num(v) {
  const n = Math.max(0, inteiro(v))
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return
  const s = document.createElement('style')
  s.id = ID_ESTILO
  s.textContent = CSS
  document.head.appendChild(s)
}

// ---------------------------------------------------------------------------
// CSS — verde-feltro, bordo e dourado por cima do mesmo vidro escuro do HUD.
// ---------------------------------------------------------------------------
const CSS = `
.${P}raiz, .${P}raiz *{ box-sizing:border-box; }
.${P}raiz{
  position:fixed; inset:0; z-index:70; display:flex; align-items:center; justify-content:center;
  padding:clamp(8px,2.5vw,38px);
  font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;
  color:#f2ece0; opacity:0; pointer-events:none;
  transition:opacity .16s ease; -webkit-font-smoothing:antialiased; user-select:none;
}
.${P}raiz.${P}on{ opacity:1; pointer-events:auto; }
.${P}veu{
  position:absolute; inset:0;
  background:radial-gradient(120% 100% at 50% 34%, rgba(10,44,32,.42) 0%, rgba(3,6,9,.84) 72%, rgba(2,3,5,.92) 100%);
}
.${P}painel{
  position:relative; width:min(920px,100%); max-height:100%;
  display:flex; flex-direction:column; overflow:hidden;
  background:linear-gradient(158deg, rgba(26,29,36,.93), rgba(10,12,16,.96));
  -webkit-backdrop-filter:blur(20px) saturate(150%); backdrop-filter:blur(20px) saturate(150%);
  border:1px solid rgba(233,196,106,.26); border-radius:20px;
  box-shadow:0 34px 92px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.06);
  transform:translateY(18px) scale(.975); opacity:0;
  transition:transform .26s cubic-bezier(.18,.9,.3,1.1), opacity .2s ease, box-shadow .3s ease;
  outline:none;
}
.${P}raiz.${P}on .${P}painel{ transform:none; opacity:1; }
.${P}painel.${P}festa{ box-shadow:0 34px 92px rgba(0,0,0,.66), 0 0 0 2px rgba(255,214,128,.75), 0 0 60px rgba(255,196,80,.45); }

/* letreiro de neon do topo: e o unico enfeite animado do painel */
.${P}neon{
  height:4px; flex:0 0 auto;
  background:linear-gradient(90deg,#ffd98a,#c9394f,#ffd98a,#2fa87a,#ffd98a);
  background-size:280% 100%; animation:${P}neon 7s linear infinite; opacity:.85;
}
@keyframes ${P}neon{ from{ background-position:0% 0; } to{ background-position:280% 0; } }

.${P}topo{ display:flex; align-items:center; gap:14px; padding:13px 20px 8px; }
.${P}quem{ flex:1; min-width:0; }
.${P}kicker{ font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:#e9c46a; font-weight:700; }
.${P}titulo{ margin:2px 0 0; font-size:23px; font-weight:700; letter-spacing:.01em; }
.${P}bolso{ display:flex; gap:9px; align-items:center; flex:0 0 auto; }
.${P}moeda{
  display:flex; align-items:center; gap:7px; padding:6px 12px; border-radius:999px;
  background:rgba(0,0,0,.34); border:1px solid rgba(255,255,255,.09);
}
.${P}moeda b{ font-variant-numeric:tabular-nums; font-size:15px; font-weight:700; }
.${P}moeda i{ font-style:normal; font-size:10px; letter-spacing:.14em; color:#9da5b4; }
.${P}pino{ width:15px; height:15px; border-radius:50%; flex:0 0 auto; box-shadow:inset 0 -2px 3px rgba(0,0,0,.4); }
.${P}pino.${P}ouro{ background:radial-gradient(circle at 35% 30%,#ffe89a,#e0a713 62%,#a97a06); }
.${P}pino.${P}ficha{ background:radial-gradient(circle at 35% 30%,#ff8f8f,#c62c3f 60%,#7d1523); border:2px dashed rgba(255,255,255,.75); }
.${P}x{
  appearance:none; cursor:pointer; font:inherit; font-size:16px; font-weight:700; line-height:1;
  width:32px; height:32px; border-radius:10px; flex:0 0 auto; color:#e6dbc6;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  transition:background .12s, transform .1s;
}
.${P}x:hover{ background:rgba(201,57,79,.35); }
.${P}x:active{ transform:scale(.92); }

.${P}corpo{ padding:8px 20px 14px; overflow-y:auto; overflow-x:hidden; }
.${P}corpo::-webkit-scrollbar{ width:8px; }
.${P}corpo::-webkit-scrollbar-thumb{ background:rgba(233,196,106,.22); border-radius:8px; }
.${P}tela{ display:none; }
.${P}tela.${P}ativa{ display:block; animation:${P}entra .2s ease both; }
@keyframes ${P}entra{ from{ opacity:0; transform:translateY(7px); } to{ opacity:1; transform:none; } }

.${P}rodape{
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding:11px 20px 13px; border-top:1px solid rgba(255,255,255,.07);
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,.22));
}
.${P}recado{ flex:1; min-width:160px; min-height:19px; font-size:13px; font-weight:600; color:#c8bda6; }
.${P}recado.${P}bom{ color:#9fe6b4; }
.${P}recado.${P}ruim{ color:#f2a2a2; }
.${P}recado.${P}pisca{ animation:${P}pisca .45s ease; }
@keyframes ${P}pisca{ 0%{ transform:translateX(-4px); opacity:.4; } 100%{ transform:none; opacity:1; } }
.${P}dica{ font-size:10.5px; color:#7d8494; letter-spacing:.04em; }

/* --- botoes --- */
.${P}btn{
  appearance:none; cursor:pointer; font:inherit; font-size:13px; font-weight:700; letter-spacing:.04em;
  padding:10px 18px; border-radius:11px; color:#e8e0d0;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
  transition:background .14s, transform .1s, box-shadow .14s, opacity .14s;
}
.${P}btn:hover{ background:rgba(255,255,255,.13); }
.${P}btn:active{ transform:translateY(1px); }
.${P}btn[disabled]{ opacity:.34; cursor:default; transform:none; }
.${P}btn[disabled]:hover{ background:rgba(255,255,255,.06); }
.${P}btn.${P}ouro{
  color:#241c0c; border-color:transparent;
  background:linear-gradient(180deg,#ffd98a,#e2a83c); box-shadow:0 8px 22px rgba(226,168,60,.3);
}
.${P}btn.${P}ouro:hover{ background:linear-gradient(180deg,#ffe6ab,#f0b64c); }
.${P}btn.${P}verde{
  color:#0b1a13; border-color:transparent;
  background:linear-gradient(180deg,#7ee0a6,#2f9d68); box-shadow:0 8px 22px rgba(47,157,104,.28);
}
.${P}btn.${P}bordo{
  color:#ffe9ec; border-color:rgba(201,57,79,.5);
  background:linear-gradient(180deg,rgba(160,32,52,.75),rgba(109,26,44,.85));
}
.${P}btn.${P}bordo:hover{ background:linear-gradient(180deg,rgba(186,42,64,.85),rgba(132,30,50,.9)); }
.${P}btn.${P}enorme{ font-size:17px; padding:15px 40px; border-radius:14px; letter-spacing:.1em; }
.${P}btn.${P}mini{ font-size:11px; padding:7px 12px; border-radius:9px; }

/* --- fichas de aposta --- */
.${P}fichas{ display:flex; flex-wrap:wrap; gap:11px; align-items:center; }
.${P}fichabt{
  position:relative; appearance:none; cursor:pointer; font:inherit; font-size:13px; font-weight:700;
  width:54px; height:54px; border-radius:50%; color:#fff; flex:0 0 auto;
  background:var(--${P}c,#2f8f5b); border:3px dashed rgba(255,255,255,.72);
  box-shadow:0 6px 15px rgba(0,0,0,.45), inset 0 -7px 13px rgba(0,0,0,.32);
  text-shadow:0 1px 2px rgba(0,0,0,.55);
  transition:transform .12s cubic-bezier(.2,.9,.3,1.4), box-shadow .14s, opacity .14s;
}
.${P}fichabt:hover{ transform:translateY(-3px) scale(1.06); }
.${P}fichabt:active{ transform:translateY(0) scale(.96); }
.${P}fichabt.${P}sel{ box-shadow:0 0 0 3px rgba(233,196,106,.85), 0 8px 20px rgba(0,0,0,.5); }
.${P}fichabt[disabled]{ opacity:.3; cursor:default; transform:none; }

/* --- blocos e grades --- */
.${P}linha{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.${P}duas{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.${P}caixa2{
  padding:14px 16px 16px; border-radius:15px;
  background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015));
  border:1px solid rgba(255,255,255,.09);
}
.${P}rot{ font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:#9aa2b2; font-weight:700; margin-bottom:9px; }
.${P}grande{ font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; }
.${P}nota{ font-size:11.5px; color:#8d95a4; line-height:1.55; }
.${P}campo{
  appearance:none; font:inherit; font-size:15px; font-weight:700; width:110px; padding:9px 11px;
  border-radius:10px; color:#f2ece0; background:rgba(0,0,0,.35);
  border:1px solid rgba(255,255,255,.14); font-variant-numeric:tabular-nums;
}
.${P}campo:focus{ outline:none; border-color:rgba(233,196,106,.7); }

/* --- mesa de feltro --- */
.${P}mesa{
  position:relative; padding:16px 18px; border-radius:16px; margin-bottom:12px;
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.017) 0 3px, rgba(0,0,0,.017) 3px 6px),
    radial-gradient(130% 130% at 50% -10%, #1b6b4e 0%, #0e4232 62%, #0a3225 100%);
  border:1px solid rgba(233,196,106,.2);
  box-shadow:inset 0 0 70px rgba(0,0,0,.5), 0 8px 26px rgba(0,0,0,.35);
}
.${P}mesa::after{
  content:''; position:absolute; inset:9px; border-radius:11px;
  border:1px dashed rgba(233,196,106,.16); pointer-events:none;
}
.${P}lado{ position:relative; margin-bottom:12px; }
.${P}lado:last-child{ margin-bottom:0; }
.${P}cab{ display:flex; align-items:baseline; gap:10px; margin-bottom:7px; flex-wrap:wrap; }
.${P}cab .${P}rot{ margin:0; color:#cfe3d6; }
.${P}pontos{
  font-size:17px; font-weight:700; font-variant-numeric:tabular-nums; color:#ffe1a4;
  padding:1px 9px; border-radius:8px; background:rgba(0,0,0,.32);
}
.${P}tag{ font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#9fd8b8; font-weight:700; }
.${P}tag.${P}ruim{ color:#f09a9a; }
.${P}tag.${P}bom{ color:#ffd98a; }
.${P}mao{ padding:9px 10px; border-radius:12px; border:1px solid transparent; margin-bottom:8px; }
.${P}mao.${P}ativa{ border-color:rgba(233,196,106,.55); background:rgba(233,196,106,.07); }
.${P}fila{ display:flex; gap:7px; min-height:84px; align-items:flex-start; }

/* --- carta --- */
.${P}carta{
  position:relative; width:60px; height:84px; flex:0 0 auto; border-radius:8px;
  background:linear-gradient(180deg,#fffdf6,#ece4d2); color:#1b1f27;
  box-shadow:0 6px 15px rgba(0,0,0,.45), inset 0 0 0 1px rgba(0,0,0,.14);
  transform-origin:50% 60%;
}
.${P}carta.${P}vermelha{ color:#c0243a; }
.${P}carta .${P}cantoa, .${P}carta .${P}cantob{
  position:absolute; display:flex; flex-direction:column; align-items:center; line-height:1;
  font-size:13px; font-weight:700;
}
.${P}carta .${P}cantoa{ left:5px; top:5px; }
.${P}carta .${P}cantob{ right:5px; bottom:5px; transform:rotate(180deg); }
.${P}carta .${P}cantoa i, .${P}carta .${P}cantob i{ font-style:normal; font-size:11px; margin-top:1px; }
.${P}carta .${P}meio{
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-size:31px; opacity:.92;
}
.${P}carta.${P}verso{
  background:
    repeating-linear-gradient(45deg, rgba(255,255,255,.09) 0 5px, rgba(0,0,0,0) 5px 10px),
    linear-gradient(180deg,#8a2338,#5e1526);
  box-shadow:0 6px 15px rgba(0,0,0,.45), inset 0 0 0 3px #efe4cd, inset 0 0 0 4px #8a2338;
}
.${P}carta.${P}verso .${P}selo{
  position:absolute; left:50%; top:50%; width:20px; height:20px; margin:-10px 0 0 -10px;
  background:rgba(239,228,205,.55); transform:rotate(45deg); border-radius:3px;
}
.${P}carta.${P}nova{ animation:${P}dar .32s cubic-bezier(.2,.9,.3,1.15) both; }
@keyframes ${P}dar{
  from{ opacity:0; transform:translate(46px,-54px) rotate(15deg) scale(.88); }
  to{ opacity:1; transform:none; }
}
.${P}carta.${P}vira{ animation:${P}vira .34s cubic-bezier(.3,.8,.4,1) both; }
@keyframes ${P}vira{
  from{ transform:perspective(420px) rotateY(-94deg) scale(1.05); }
  to{ transform:perspective(420px) rotateY(0) scale(1); }
}

/* --- placar de resultado --- */
.${P}placar{ display:flex; flex-direction:column; gap:6px; margin:2px 0 10px; }
.${P}res{
  display:flex; align-items:center; justify-content:space-between; gap:14px;
  padding:9px 14px; border-radius:11px; font-size:14px; font-weight:700;
  background:rgba(255,255,255,.05); border-left:3px solid rgba(255,255,255,.2);
  animation:${P}entra .26s ease both;
}
.${P}res.${P}bom{ border-left-color:#7ee0a6; background:rgba(126,224,166,.11); color:#c6f5d8; }
.${P}res.${P}ruim{ border-left-color:#d9566d; background:rgba(217,86,109,.1); color:#f4bcc4; }
.${P}res.${P}top{ border-left-color:#ffd98a; background:linear-gradient(90deg,rgba(255,217,138,.22),rgba(255,217,138,.05)); color:#ffeec4; }
.${P}res b{ font-variant-numeric:tabular-nums; font-size:16px; }

/* --- poker --- */
.${P}npc{ display:flex; align-items:center; gap:13px; margin-bottom:11px; }
.${P}retrato{
  width:62px; height:62px; flex:0 0 auto; border-radius:50%; display:block;
  border:2px solid rgba(233,196,106,.55); background:#141821;
  box-shadow:0 6px 18px rgba(0,0,0,.5);
}
.${P}balao{
  position:relative; flex:1; min-width:0; padding:10px 14px; border-radius:13px;
  background:linear-gradient(180deg,#fdf6e6,#efe4cb); color:#2b2216;
  font-size:13.5px; font-weight:600; line-height:1.35; box-shadow:0 8px 22px rgba(0,0,0,.4);
}
.${P}balao b{ display:block; font-size:9.5px; letter-spacing:.18em; text-transform:uppercase; color:#9a6a2c; margin-bottom:2px; }
.${P}balao::after{
  content:''; position:absolute; left:-6px; top:24px; width:13px; height:13px;
  background:#fdf6e6; transform:rotate(45deg); border-radius:2px;
}
.${P}placas{ display:flex; gap:9px; flex-wrap:wrap; margin:10px 0 4px; }
.${P}placa{
  flex:1 1 92px; padding:8px 11px; border-radius:11px; text-align:center;
  background:rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.09);
}
.${P}placa span{ display:block; font-size:9.5px; letter-spacing:.16em; text-transform:uppercase; color:#93a0ae; }
.${P}placa b{ font-size:19px; font-variant-numeric:tabular-nums; color:#ffe1a4; }
.${P}mao1{ font-size:12.5px; font-weight:700; color:#cfe3d6; margin-top:6px; min-height:16px; }
.${P}ranking{
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:9px 12px; border-radius:11px; font-size:11.5px; color:#a9b2c0;
  background:rgba(0,0,0,.24); border:1px solid rgba(255,255,255,.07);
}
.${P}ranking em{ font-style:normal; color:#ffd98a; font-weight:700; }
.${P}ranking s{ text-decoration:none; color:#6f7787; }

/* --- caca-niquel --- */
.${P}maquina{
  padding:16px; border-radius:18px; margin-bottom:12px;
  background:linear-gradient(180deg,#7a1e33,#4a1120);
  border:1px solid rgba(233,196,106,.4);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.12), 0 12px 30px rgba(0,0,0,.45);
}
.${P}roletes{ display:flex; gap:12px; justify-content:center; }
.${P}rolete{
  width:112px; height:${CEL}px; overflow:hidden; border-radius:12px; flex:0 0 auto;
  background:linear-gradient(180deg,#1c212a,#0c0f14);
  border:1px solid rgba(233,196,106,.35);
  box-shadow:inset 0 14px 22px rgba(0,0,0,.65), inset 0 -14px 22px rgba(0,0,0,.65);
}
.${P}fita{ display:flex; flex-direction:column; will-change:transform; }
.${P}fita.${P}girando{ animation:${P}rolar .26s linear infinite; }
@keyframes ${P}rolar{ from{ transform:translateY(0); } to{ transform:translateY(var(--${P}volta,-600px)); } }
.${P}cel{
  height:${CEL}px; flex:0 0 ${CEL}px; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:7px;
}
.${P}simb{
  width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-size:21px; font-weight:700; color:#fff; text-shadow:0 1px 3px rgba(0,0,0,.6);
  background:var(--${P}c,#888);
  box-shadow:inset 0 -6px 12px rgba(0,0,0,.35), 0 4px 10px rgba(0,0,0,.4);
}
.${P}simbnome{ font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:#b9c2cf; }
.${P}visor{
  margin-top:12px; padding:10px 14px; border-radius:11px; text-align:center;
  background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.09);
  font-size:15px; font-weight:700; color:#ffe1a4; min-height:42px;
  display:flex; align-items:center; justify-content:center;
}
.${P}visor.${P}top{ animation:${P}festa .5s ease 3; color:#fff3cf; }
@keyframes ${P}festa{ 0%{ transform:scale(1); } 40%{ transform:scale(1.09); } 100%{ transform:scale(1); } }
.${P}tabela{ width:100%; border-collapse:collapse; font-size:12px; }
.${P}tabela th{
  text-align:left; font-size:9.5px; letter-spacing:.16em; text-transform:uppercase;
  color:#93a0ae; font-weight:700; padding:4px 8px;
}
.${P}tabela td{ padding:4px 8px; border-top:1px solid rgba(255,255,255,.06); font-variant-numeric:tabular-nums; }
.${P}tabela td:first-child{ display:flex; align-items:center; gap:8px; }
.${P}bolinha{ width:13px; height:13px; border-radius:50%; background:var(--${P}c,#888); flex:0 0 auto; }

@media (max-width:820px){
  .${P}duas{ grid-template-columns:1fr; }
  .${P}rolete{ width:92px; }
  .${P}topo{ flex-wrap:wrap; }
}
`

// ---------------------------------------------------------------------------
// Retrato do ricaco, desenhado em canvas (o projeto nao usa asset externo).
// Silhueta chapada de proposito: dois tons e uma faixa dourada leem melhor em
// 62 px do que um rosto detalhado, que nesse tamanho vira borrao.
// ---------------------------------------------------------------------------
function retratoRicaco(px) {
  const c = document.createElement('canvas')
  c.width = px
  c.height = px
  const g = c.getContext('2d')
  if (!g) return c
  const u = px / 100   // tudo desenhado numa grade de 100x100 e escalado

  // fundo: veludo bordo com vinheta, pra silhueta escura nao sumir
  const fundo = g.createRadialGradient(50 * u, 38 * u, 6 * u, 50 * u, 55 * u, 62 * u)
  fundo.addColorStop(0, '#8e3450')
  fundo.addColorStop(1, '#2a1020')
  g.fillStyle = fundo
  g.fillRect(0, 0, px, px)

  g.fillStyle = '#14181f'
  // ombros do terno: um arco largo que sai da base
  g.beginPath()
  g.moveTo(6 * u, 100 * u)
  g.quadraticCurveTo(20 * u, 70 * u, 50 * u, 70 * u)
  g.quadraticCurveTo(80 * u, 70 * u, 94 * u, 100 * u)
  g.closePath()
  g.fill()
  // pescoco
  g.fillRect(43 * u, 56 * u, 14 * u, 16 * u)
  // cabeca
  g.beginPath()
  g.ellipse(50 * u, 45 * u, 16 * u, 19 * u, 0, 0, Math.PI * 2)
  g.fill()

  // gravata clara: o unico ponto vivo no meio do terno
  g.fillStyle = '#e9c46a'
  g.beginPath()
  g.moveTo(50 * u, 71 * u)
  g.lineTo(45 * u, 78 * u)
  g.lineTo(50 * u, 100 * u)
  g.lineTo(55 * u, 78 * u)
  g.closePath()
  g.fill()

  // chapeu: aba larga + copa. E o que faz o NPC ser "o de chapeu" a 62 px.
  g.fillStyle = '#0d1016'
  g.beginPath()
  g.ellipse(50 * u, 30 * u, 32 * u, 7 * u, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(33 * u, 30 * u)
  g.quadraticCurveTo(34 * u, 9 * u, 50 * u, 9 * u)
  g.quadraticCurveTo(66 * u, 9 * u, 67 * u, 30 * u)
  g.closePath()
  g.fill()
  // fita dourada da copa
  g.fillStyle = '#e9c46a'
  g.fillRect(33.5 * u, 24 * u, 33 * u, 5 * u)

  // bigode e o brilho do charuto: dois riscos que dao idade e vicio
  g.fillStyle = '#e6dcc8'
  g.fillRect(42 * u, 50 * u, 16 * u, 3 * u)
  g.fillStyle = '#5b3a22'
  g.fillRect(58 * u, 56 * u, 16 * u, 4 * u)
  g.fillStyle = '#ff7a3c'
  g.fillRect(74 * u, 56 * u, 4 * u, 4 * u)

  return c
}

// ---------------------------------------------------------------------------
// Cartas em DOM
//
// A regra da animacao: carta que ja estava na mesa NAO pode reanimar. Por isso
// cada fileira guarda a lista do que desenhou (_defs) e o desenho novo e um
// diff contra ela: prefixo igual fica parado, verso que ganhou face GIRA no
// lugar, o resto entra voando. Sem esse diff, cada 'pedir' fazia a mao inteira
// piscar de novo — que e exatamente a cara de um bug.
// ---------------------------------------------------------------------------

/** Uma posicao da fileira. carta null + verso true = carta que o jogador nao ve. */
function def(carta, verso) {
  return { carta: verso ? null : (carta || null), verso: !!verso }
}

function chaveDef(d) {
  if (!d) return '~'
  if (d.verso || !d.carta) return '##'
  try { return cartaTexto(d.carta) } catch (err) { void err; return d.carta.r + '/' + d.carta.n }
}

function preencherCarta(e, carta) {
  e.textContent = ''
  const naipe = (Array.isArray(NAIPES) && NAIPES[carta.n]) || null
  const simbolo = naipe ? naipe.simbolo : '?'
  marca(e, 'verso', false)
  marca(e, 'vermelha', !!(naipe && naipe.vermelho))
  const v = nomeValor(carta.r)
  const a = el('span', 'cantoa')
  a.append(el('b', null, v), el('i', null, simbolo))
  const b = el('span', 'cantob')
  b.append(el('b', null, v), el('i', null, simbolo))
  e.append(a, el('span', 'meio', simbolo), b)
}

function virarPraBaixo(e) {
  e.textContent = ''
  marca(e, 'vermelha', false)
  marca(e, 'verso', true)
  e.append(el('span', 'selo'))
}

function criarCartaEl(d, animar, atraso) {
  const e = el('div', 'carta')
  if (d.verso || !d.carta) virarPraBaixo(e)
  else preencherCarta(e, d.carta)
  if (animar) {
    marca(e, 'nova', true)
    if (atraso) e.style.animationDelay = atraso + 'ms'
  }
  return e
}

/** Reinicia uma animacao CSS que ja rodou no mesmo elemento. */
function reanimar(e, nome, atraso) {
  marca(e, nome, false)
  void e.offsetWidth
  e.style.animationDelay = (atraso || 0) + 'ms'
  marca(e, nome, true)
}

function pintarCartas(cont, defs) {
  const velhos = cont._defs || []
  let i = 0
  while (i < defs.length && i < velhos.length && chaveDef(defs[i]) === chaveDef(velhos[i])) i++

  // viradas: mesma posicao, era verso e agora tem face. Uma de cada vez, com um
  // atraso curto entre elas, senao o showdown do poker vira um pisca so.
  let atraso = 0
  while (i < defs.length && i < velhos.length && velhos[i].verso && !defs[i].verso && defs[i].carta) {
    const alvo = cont.children[i]
    if (!alvo) break
    preencherCarta(alvo, defs[i].carta)
    reanimar(alvo, 'vira', atraso)
    atraso += 140
    i++
  }

  // sobrou elemento velho que nao casa (split, mao nova, carta que sumiu):
  // refaz a fileira inteira. E raro e a reanimacao geral ate ajuda a leitura.
  if (i < velhos.length) {
    cont.textContent = ''
    let d = 0
    for (let k = 0; k < defs.length; k++) {
      cont.appendChild(criarCartaEl(defs[k], true, d))
      d += 90
    }
    cont._defs = defs
    return
  }

  for (; i < defs.length; i++) {
    cont.appendChild(criarCartaEl(defs[i], true, atraso))
    atraso += 90
  }
  cont._defs = defs
}

// ---------------------------------------------------------------------------
// Leitura defensiva da tabela do caca-niquel.
//
// O contrato diz "PAGAMENTOS = multiplicador por trinca e por par" sem fixar o
// formato. Em vez de apostar num deles e mostrar 'undefined' no painel, tenta
// os arranjos plausiveis e desiste em silencio (a coluna vira '-').
// ---------------------------------------------------------------------------
function premioDe(sim, i, tipo) {
  const T = PAGAMENTOS
  if (!T || !sim) return null
  const id = sim.id
  const tentativas = [
    T[tipo] && T[tipo][id],          // { trinca:{ cereja:20 } }
    T[tipo] && T[tipo][i],           // { trinca:[20,15,...] }
    T[id] && T[id][tipo],            // { cereja:{ trinca:20 } }
    T[i] && T[i][tipo],              // [ { trinca:20 }, ... ]
    tipo === 'trinca' ? T[id] : null, // { cereja:20 } (so trinca)
    tipo === 'trinca' ? T[i] : null,
  ]
  for (let k = 0; k < tentativas.length; k++) {
    const v = tentativas[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return null
}

/** SIMBOLOS[i] a partir do que o modulo devolveu (indice, id ou o proprio objeto). */
function acharSimbolo(v) {
  const lista = Array.isArray(SIMBOLOS) ? SIMBOLOS : []
  if (typeof v === 'number' && v >= 0 && v < lista.length) return lista[v]
  if (v && typeof v === 'object') return v
  for (let i = 0; i < lista.length; i++) if (lista[i] && lista[i].id === v) return lista[i]
  return lista[0] || { id: '?', nome: '?', cor: '#888' }
}

function indiceSimbolo(v) {
  const lista = Array.isArray(SIMBOLOS) ? SIMBOLOS : []
  if (typeof v === 'number' && v >= 0 && v < lista.length) return v
  const s = acharSimbolo(v)
  const i = lista.indexOf(s)
  return i >= 0 ? i : 0
}

/** Primeira letra do nome vira o desenho do simbolo. Sem asset, sem emoji. */
function letraDe(sim) {
  const n = String((sim && (sim.nome || sim.id)) || '?')
  return n.charAt(0).toUpperCase()
}

// ---------------------------------------------------------------------------
// A UI
// ---------------------------------------------------------------------------
export function criarCassinoUI({ game, carteira, mundo } = {}) {
  injetarEstilo()

  // --- casca comum ---------------------------------------------------------
  const raiz = el('div', 'raiz')
  raiz.setAttribute('aria-hidden', 'true')
  const veu = el('div', 'veu')
  const painel = el('div', 'painel')
  painel.tabIndex = -1

  const topo = el('div', 'topo')
  const quem = el('div', 'quem')
  const kicker = el('div', 'kicker', 'CASSINO')
  const titulo = el('h2', 'titulo', 'Cassino')
  quem.append(kicker, titulo)

  const bolso = el('div', 'bolso')
  const moedaOuro = el('div', 'moeda')
  const valOuro = el('b', null, '0')
  moedaOuro.append(el('span', 'pino ouro'), valOuro)
  moedaOuro.title = 'Ouro — aposta do blackjack e o que o caixa troca'
  const moedaFicha = el('div', 'moeda')
  const valFicha = el('b', null, '0')
  moedaFicha.append(el('span', 'pino ficha'), valFicha)
  moedaFicha.title = 'Fichas — poker e caca-niquel so aceitam ficha'
  bolso.append(moedaOuro, moedaFicha)

  const btnX = el('button', 'x', '✕')
  btnX.type = 'button'
  btnX.title = 'Fechar (Esc)'
  btnX.addEventListener('click', () => fechar())
  topo.append(quem, bolso, btnX)

  const corpo = el('div', 'corpo')

  const rodape = el('div', 'rodape')
  const recado = el('div', 'recado', '')
  const dica = el('div', 'dica', 'Esc fecha')
  const btnSair = botao('', 'SAIR', () => fechar())
  rodape.append(recado, dica, btnSair)

  painel.append(el('div', 'neon'), topo, corpo, rodape)
  raiz.append(veu, painel)
  document.body.appendChild(raiz)

  // --- estado geral --------------------------------------------------------
  let aberto = false
  let telaAtual = null          // { nome, sec, render, principal }
  let renderizando = false      // trava de reentrada (carteira -> render -> carteira)
  let festaTimer = 0
  const telas = new Map()       // nome -> tela; cada uma e montada uma vez so

  // Baralhos. Dois, porque as mesas nao dividem sapato: o blackjack usa 6
  // baralhos (contar carta fica inutil, que e o ponto) e o poker usa 1.
  let baralhoBJ = null
  let baralhoPk = null

  // --- feedback ------------------------------------------------------------
  function avisar(texto, tom) {
    recado.textContent = texto || ''
    marca(recado, 'bom', tom === 'bom')
    marca(recado, 'ruim', tom === 'ruim')
    marca(recado, 'pisca', false)
    void recado.offsetWidth
    marca(recado, 'pisca', !!texto)
  }

  function pintarBolso() {
    valOuro.textContent = num(carteira ? carteira.ouro : 0)
    valFicha.textContent = num(carteira ? carteira.fichas : 0)
  }

  function comemorar(ms) {
    marca(painel, 'festa', true)
    clearTimeout(festaTimer)
    festaTimer = setTimeout(() => marca(painel, 'festa', false), ms || 1600)
  }

  // --- abrir / fechar ------------------------------------------------------
  function renderTela() {
    if (!telaAtual || renderizando) return
    renderizando = true
    try { telaAtual.render() } catch (err) { console.warn('[cassino-ui] render:', err) }
    renderizando = false
  }

  function abrirTela(nome) {
    const t = telas.get(nome) || construir(nome)
    if (!t) return
    if (telaAtual && telaAtual !== t) marca(telaAtual.sec, 'ativa', false)
    telaAtual = t
    marca(t.sec, 'ativa', true)
    kicker.textContent = t.kicker
    titulo.textContent = t.titulo
    avisar('')
    pintarBolso()
    renderTela()

    if (aberto) return
    aberto = true
    // A ordem importa: travar ANTES de soltar o mouse, senao um frame de
    // movimento entra entre as duas chamadas e o jogador anda meio passo.
    chamar(game && game.player, 'setLocked', true)
    try { document.exitPointerLock() } catch (err) { void err }
    document.addEventListener('pointerlockchange', aoTrancarMouse)
    window.addEventListener('keydown', aoTeclar, true)
    raiz.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => marca(raiz, 'on', true))
    setTimeout(() => { if (aberto) painel.focus() }, 30)
  }

  function fechar() {
    if (!aberto) return
    aberto = false
    window.removeEventListener('keydown', aoTeclar, true)
    document.removeEventListener('pointerlockchange', aoTrancarMouse)
    marca(raiz, 'on', false)
    marca(painel, 'festa', false)
    raiz.setAttribute('aria-hidden', 'true')
    // O main re-trava o mouse no proximo clique; aqui so devolvemos o controle.
    chamar(game && game.player, 'setLocked', false)
  }

  // Se qualquer outro sistema re-trancar o ponteiro com o painel aberto (o main
  // faz isso no clique), solta de novo: painel aberto e mouse preso = jogador
  // vendo botao que nao consegue clicar.
  function aoTrancarMouse() {
    if (aberto && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  function aoTeclar(e) {
    if (!aberto) return
    const emCampo = e.target && e.target.tagName === 'INPUT'
    if (e.key === 'Escape') {
      fechar()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (!emCampo && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
      const b = telaAtual && telaAtual.principal && telaAtual.principal()
      if (b && !b.disabled) { b.click(); e.preventDefault() }
    }
    // TUDO o mais para aqui: com painel aberto o jogo nao pode ouvir tecla
    // nenhuma (digitar 250 no caixa trocaria de arma tres vezes).
    e.stopPropagation()
  }

  // O painel come todo evento de mouse: sem isto, clicar em PEDIR tambem
  // atirava/interagia no mundo atras do painel.
  function engolir(e) { e.stopPropagation() }
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    raiz.addEventListener(ev, engolir)
  }
  veu.addEventListener('click', () => fechar())

  // Carteira mudou (aqui ou fora daqui): cabecalho sempre, tela so quando faz
  // diferenca visivel. A trava renderizando evita o ciclo credito -> render ->
  // credito, que existiria porque e o render do blackjack que paga a mao.
  const desligarCarteira = carteira && typeof carteira.aoMudar === 'function'
    ? carteira.aoMudar(() => { pintarBolso(); if (aberto) renderTela() })
    : () => {}

  // -------------------------------------------------------------------------
  // Pecas reaproveitadas pelas telas
  // -------------------------------------------------------------------------

  /** Fileira de fichas clicaveis. aoClicar(valor) decide o que o valor significa. */
  function fileiraFichas(valores, aoClicar) {
    const cx = el('div', 'fichas')
    const bts = []
    for (let i = 0; i < valores.length; i++) {
      const v = valores[i]
      const b = el('button', 'fichabt', String(v))
      b.type = 'button'
      b.style.setProperty('--' + P + 'c', COR_FICHA[v] || '#4a6f8f')
      b.addEventListener('click', () => aoClicar(v))
      cx.appendChild(b)
      bts.push(b)
    }
    return {
      el: cx,
      /** limite = saldo disponivel; sel = valor destacado (ou -1). */
      atualizar(limite, sel) {
        for (let i = 0; i < bts.length; i++) {
          bts[i].disabled = valores[i] > limite
          marca(bts[i], 'sel', valores[i] === sel)
        }
      },
    }
  }

  function placa(rotulo) {
    const p = el('div', 'placa')
    const b = el('b', null, '0')
    p.append(el('span', null, rotulo), b)
    return { el: p, valor: b }
  }

  // -------------------------------------------------------------------------
  // TELA 1 — CAIXA
  // -------------------------------------------------------------------------
  function construirCaixa() {
    const sec = el('section', 'tela')

    const npc = el('div', 'npc')
    const balao = el('div', 'balao')
    const falaCaixa = document.createTextNode(FALAS_CAIXA.oi)
    balao.append(el('b', null, 'CAIXA'), falaCaixa)
    const retrato = el('div', 'retrato')
    retrato.style.background = 'radial-gradient(circle at 40% 32%, #2f9d68, #123a2a)'
    npc.append(retrato, balao)

    const duas = el('div', 'duas')

    // --- lado esquerdo: ouro -> ficha ---
    const ladoC = el('div', 'caixa2')
    ladoC.append(el('div', 'rot', 'Comprar fichas'))
    const saldoC = el('div', 'grande', '0')
    ladoC.append(saldoC, el('div', 'nota', 'ouro no bolso'))
    let valorC = 0
    const campoC = el('input', 'campo')
    campoC.type = 'number'
    campoC.min = '0'
    campoC.step = '1'
    const fichasC = fileiraFichas(ATALHOS_CAIXA, (v) => { valorC = v; sincC() })
    const btTudoC = botao('mini', 'TUDO', () => { valorC = carteira ? carteira.ouro : 0; sincC() })
    const btComprar = botao('ouro', 'COMPRAR', () => operar(true))
    campoC.addEventListener('input', () => { valorC = Math.max(0, inteiro(campoC.value)); sincC(false) })
    const linhaC = el('div', 'linha')
    linhaC.append(campoC, btTudoC, btComprar)
    ladoC.append(el('div', 'nota', 'Troca 1 por 1. Sem taxa — taxa de cambio so serve pra o jogador achar que foi roubado.'))
    ladoC.append(fichasC.el, linhaC)

    // --- lado direito: ficha -> ouro ---
    const ladoV = el('div', 'caixa2')
    ladoV.append(el('div', 'rot', 'Trocar por ouro'))
    const saldoV = el('div', 'grande', '0')
    ladoV.append(saldoV, el('div', 'nota', 'fichas no bolso'))
    let valorV = 0
    const campoV = el('input', 'campo')
    campoV.type = 'number'
    campoV.min = '0'
    campoV.step = '1'
    const fichasV = fileiraFichas(ATALHOS_CAIXA, (v) => { valorV = v; sincV() })
    const btTudoV = botao('mini', 'TUDO', () => { valorV = carteira ? carteira.fichas : 0; sincV() })
    const btVender = botao('', 'TROCAR', () => operar(false))
    campoV.addEventListener('input', () => { valorV = Math.max(0, inteiro(campoV.value)); sincV(false) })
    const linhaV = el('div', 'linha')
    linhaV.append(campoV, btTudoV, btVender)
    ladoV.append(el('div', 'nota', 'Saiu do cassino com ficha no bolso? Ela nao compra nada la fora.'))
    ladoV.append(fichasV.el, linhaV)

    duas.append(ladoC, ladoV)

    // --- cortesia: so aparece pra quem zerou tudo ---
    const cortesia = el('div', 'caixa2')
    cortesia.style.display = 'none'
    cortesia.append(el('div', 'rot', 'Cortesia da casa'))
    cortesia.append(el('div', 'nota', 'Voce esta sem ouro e sem ficha. O caixa faz vista grossa e adianta um trocado pra voce nao ir embora agora.'))
    const btCortesia = botao('verde', 'ACEITAR A CORTESIA', () => {
      const v = inteiro(chamar(carteira, 'cortesia'))
      if (v > 0) {
        falaCaixa.nodeValue = FALAS_CAIXA.cortesia
        avisar('O caixa adiantou ' + num(v) + ' de ouro. Nao gaste tudo num giro so.', 'bom')
        comemorar(1200)
      } else {
        avisar('Voce ainda tem com que jogar.', '')
      }
      renderTela()
    })
    const linhaCort = el('div', 'linha')
    linhaCort.append(btCortesia)
    cortesia.append(linhaCort)

    sec.append(npc, duas, cortesia)

    function sincC(mexerCampo) {
      const teto = carteira ? carteira.ouro : 0
      valorC = Math.max(0, Math.min(valorC, teto))
      if (mexerCampo !== false) campoC.value = valorC ? String(valorC) : ''
      render()
    }
    function sincV(mexerCampo) {
      const teto = carteira ? carteira.fichas : 0
      valorV = Math.max(0, Math.min(valorV, teto))
      if (mexerCampo !== false) campoV.value = valorV ? String(valorV) : ''
      render()
    }

    function operar(comprando) {
      const v = comprando ? valorC : valorV
      if (v <= 0) { avisar(FALAS_CAIXA.zero, ''); return }
      const ok = comprando ? chamar(carteira, 'comprarFichas', v) : chamar(carteira, 'venderFichas', v)
      if (!ok) {
        falaCaixa.nodeValue = comprando ? FALAS_CAIXA.semOuro : FALAS_CAIXA.semFicha
        avisar(comprando ? 'Ouro insuficiente.' : 'Fichas insuficientes.', 'ruim')
        renderTela()
        return
      }
      falaCaixa.nodeValue = comprando ? FALAS_CAIXA.comprou : FALAS_CAIXA.vendeu
      avisar(comprando
        ? '-' + num(v) + ' de ouro  ->  +' + num(v) + ' em fichas'
        : '-' + num(v) + ' em fichas  ->  +' + num(v) + ' de ouro', 'bom')
      if (comprando) valorC = 0
      else valorV = 0
      campoC.value = ''
      campoV.value = ''
      renderTela()
    }

    function render() {
      const ouro = carteira ? carteira.ouro : 0
      const fichas = carteira ? carteira.fichas : 0
      saldoC.textContent = num(ouro)
      saldoV.textContent = num(fichas)
      valorC = Math.min(valorC, ouro)
      valorV = Math.min(valorV, fichas)
      fichasC.atualizar(ouro, valorC)
      fichasV.atualizar(fichas, valorV)
      btComprar.textContent = valorC > 0 ? 'COMPRAR ' + num(valorC) : 'COMPRAR'
      btVender.textContent = valorV > 0 ? 'TROCAR ' + num(valorV) : 'TROCAR'
      btComprar.disabled = valorC <= 0
      btVender.disabled = valorV <= 0
      btTudoC.disabled = ouro <= 0
      btTudoV.disabled = fichas <= 0
      cortesia.style.display = (carteira && carteira.quebrado) ? '' : 'none'
    }

    return { nome: 'caixa', sec, render, principal: () => btComprar, kicker: 'CAIXA DO CASSINO', titulo: 'Ficha aqui, sorte la dentro' }
  }

  // -------------------------------------------------------------------------
  // TELA 2 — BLACKJACK (OURO)
  // -------------------------------------------------------------------------
  function construirBlackjack() {
    const sec = el('section', 'tela')

    let jogo = null
    let aposta = BJ_MIN        // ultima aposta: 'jogar de novo' repete ela
    let pago = false           // a mao atual ja foi creditada?

    const mesa = el('div', 'mesa')

    const ladoCasa = el('div', 'lado')
    const cabCasa = el('div', 'cab')
    const pontosCasa = el('span', 'pontos', '-')
    const tagCasa = el('span', 'tag', '')
    cabCasa.append(el('span', 'rot', 'A casa'), pontosCasa, tagCasa)
    const filaCasa = el('div', 'fila')
    ladoCasa.append(cabCasa, filaCasa)

    const ladoEu = el('div', 'lado')
    const zonaMaos = el('div', null)
    ladoEu.append(zonaMaos)

    mesa.append(ladoCasa, ladoEu)

    const placar = el('div', 'placar')
    const msgMesa = el('div', 'nota', '')

    // --- barra de aposta ---
    const barraAposta = el('div', 'caixa2')
    barraAposta.append(el('div', 'rot', 'Sua aposta'))
    const mostraAposta = el('div', 'grande', String(BJ_MIN))
    barraAposta.append(mostraAposta, el('div', 'nota', 'em OURO — a atendente aceita dinheiro vivo. Mesa: minimo ' + BJ_MIN + ', maximo ' + num(BJ_MAX) + '.'))
    const fichas = fileiraFichas(FICHAS_BJ, (v) => {
      // clicar EMPILHA, como numa mesa de verdade: subir a aposta e um gesto
      // repetido, nao um numero que se escolhe de uma vez.
      aposta = Math.min(BJ_MAX, aposta + v)
      const teto = carteira ? carteira.ouro : 0
      if (aposta > teto) aposta = Math.max(0, teto)
      renderTela()
    })
    const btLimpar = botao('mini', 'LIMPAR', () => { aposta = 0; renderTela() })
    const btDar = botao('ouro', 'DISTRIBUIR', () => comecar())
    const linhaAposta = el('div', 'linha')
    linhaAposta.append(btLimpar, btDar)
    barraAposta.append(fichas.el, linhaAposta)

    // --- barra de acoes ---
    const barraAcoes = el('div', 'linha')
    const btPedir = botao('verde', 'PEDIR', () => acao('pedir'))
    const btParar = botao('', 'PARAR', () => acao('parar'))
    const btDobrar = botao('', 'DOBRAR', () => acao('dobrar'))
    const btDividir = botao('', 'DIVIDIR', () => acao('dividir'))
    const btDeNovo = botao('ouro', 'JOGAR DE NOVO', () => novaMao())
    barraAcoes.append(btPedir, btParar, btDobrar, btDividir, btDeNovo)

    const sapato = el('div', 'dica', '')

    sec.append(mesa, placar, msgMesa, barraAposta, barraAcoes, sapato)

    /**
     * A mesa volta pra fase de aposta ANTES de cada mao nova. Ficar preso num
     * 'fim' que ja foi pago seria pagar o mesmo placar duas vezes, entao aqui
     * nao se supoe nada: usa o reiniciar() do modulo e, se por algum motivo a
     * fase nao voltar, troca a maquina inteira. O sapato e externo e atravessa
     * as maos de qualquer jeito.
     */
    function garantirJogo(maoNova) {
      if (!baralhoBJ) baralhoBJ = criarBaralho(6)
      if (!jogo) jogo = criarBlackjack({ baralho: baralhoBJ, minimo: BJ_MIN, maximo: BJ_MAX })
      if (maoNova && (chamar(jogo, 'estado') || {}).fase !== 'aposta') {
        chamar(jogo, 'reiniciar')
        if ((chamar(jogo, 'estado') || {}).fase !== 'aposta') {
          jogo = criarBlackjack({ baralho: baralhoBJ, minimo: BJ_MIN, maximo: BJ_MAX })
        }
      }
      return jogo
    }

    function comecar() {
      const v = Math.max(0, Math.min(BJ_MAX, inteiro(aposta)))
      if (v < BJ_MIN) { avisar('A mesa nao aceita menos que ' + BJ_MIN + '.', 'ruim'); return }
      const j = garantirJogo(true)
      // 1) cobra  2) so entao reparte. Nunca ao contrario.
      if (!chamar(carteira, 'gastarOuro', v)) { avisar('Ouro insuficiente. Passe no caixa ou aposte menos.', 'ruim'); return }
      // Daqui pra baixo o ouro JA SAIU: 'pago' so cai depois da cobranca porque
      // gastarOuro avisa a carteira, que redesenha a tela — e um render com a
      // mao anterior ainda em 'fim' e 'pago' zerado pagaria o placar duas vezes.
      aposta = v
      pago = false
      placar.textContent = ''
      // sapato passou do corte: embaralha ANTES de repartir, nunca no meio da mao
      if (baralhoBJ && baralhoBJ.precisaEmbaralhar) {
        chamar(baralhoBJ, 'embaralhar')
        avisar('Baralho novo na mesa.', '')
      } else {
        avisar('')
      }
      chamar(carteira, 'contarMao')
      chamar(j, 'comecar', v)
      // A mesa recusou (aposta fora do limite, sei la): devolve o ouro na hora.
      const depois = chamar(j, 'estado')
      if (!depois || depois.fase === 'aposta') {
        chamar(carteira, 'ganharOuro', v)
        pago = true
        avisar('A mesa nao aceitou essa aposta. Ouro devolvido.', 'ruim')
      }
      renderTela()
    }

    function novaMao() {
      const teto = carteira ? carteira.ouro : 0
      if (aposta > teto) aposta = Math.min(BJ_MAX, teto)
      if (aposta >= BJ_MIN) { comecar(); return }
      placar.textContent = ''
      avisar('Sem ouro pra outra mao. O caixa troca fichas de volta.', 'ruim')
      renderTela()
    }

    function acao(nome) {
      const j = garantirJogo()
      const est = chamar(j, 'estado')
      if (!est || !Array.isArray(est.acoes) || est.acoes.indexOf(nome) < 0) return
      if (nome === 'dobrar' || nome === 'dividir') {
        const custo = Math.max(0, inteiro(chamar(j, 'custoExtra')))
        // Cobra ANTES: se a carteira recusar, o botao simplesmente nao acontece
        // e a mao segue exatamente como estava.
        if (custo > 0 && !chamar(carteira, 'gastarOuro', custo)) {
          avisar('Ouro insuficiente pra ' + nome + '.', 'ruim')
          return
        }
        avisar(nome === 'dobrar' ? 'Dobrou: -' + num(custo) + ' de ouro.' : 'Dividiu: -' + num(custo) + ' de ouro.', '')
      }
      chamar(j, nome)
      renderTela()
    }

    /** Valor das cartas VISIVEIS. Com a do dealer tapada nao da pra confiar no
     *  estado.valor: ele pode ja estar somando a carta que o jogador nao viu. */
    function valorVisivel(cartas, quantas) {
      let total = 0
      let ases = 0
      for (let i = 0; i < quantas && i < cartas.length; i++) {
        const r = cartas[i] ? cartas[i].r : 0
        if (r === 1) { ases++; total += 11 } else total += Math.min(10, r)
      }
      while (total > 21 && ases > 0) { total -= 10; ases-- }
      return total
    }

    function rotuloResultado(t) {
      if (t === 'blackjack') return 'Blackjack!'
      if (t === 'ganhou') return 'Voce ganhou'
      if (t === 'perdeu') return 'A casa levou'
      if (t === 'empate') return 'Empate — aposta de volta'
      if (t === 'estourou') return 'Estourou'
      return String(t || '')
    }

    function render() {
      const j = jogo
      const est = j ? chamar(j, 'estado') : null
      const fase = est ? est.fase : 'aposta'
      const ouro = carteira ? carteira.ouro : 0

      // --- casa ---
      if (est) {
        const d = est.dealer || { cartas: [] }
        const cartas = Array.isArray(d.cartas) ? d.cartas : []
        const defs = []
        if (d.escondida) {
          // O modulo pode guardar a 2a carta no array (marcada como segredo) ou
          // segurar ela fora dele. Os dois casos desenham a MESMA coisa aqui.
          const visiveis = Math.max(1, Math.min(cartas.length, 1))
          for (let i = 0; i < visiveis; i++) defs.push(def(cartas[i], false))
          defs.push(def(null, true))
          pontosCasa.textContent = String(valorVisivel(cartas, visiveis)) + ' + ?'
        } else {
          for (let i = 0; i < cartas.length; i++) defs.push(def(cartas[i], false))
          pontosCasa.textContent = cartas.length ? String(inteiro(d.valor)) : '-'
        }
        pintarCartas(filaCasa, defs)
        const estourouCasa = !d.escondida && inteiro(d.valor) > 21
        tagCasa.textContent = estourouCasa ? 'ESTOUROU' : ''
        marca(tagCasa, 'ruim', estourouCasa)
      } else {
        pintarCartas(filaCasa, [])
        pontosCasa.textContent = '-'
        tagCasa.textContent = ''
      }

      // --- minhas maos ---
      const maos = (est && Array.isArray(est.maos)) ? est.maos : []
      if (zonaMaos.childElementCount !== Math.max(1, maos.length)) {
        zonaMaos.textContent = ''
        const quantas = Math.max(1, maos.length)
        for (let i = 0; i < quantas; i++) {
          const linha = el('div', 'mao')
          const cab = el('div', 'cab')
          const rot = el('span', 'rot', maos.length > 1 ? 'Voce — mao ' + (i + 1) : 'Voce')
          const pts = el('span', 'pontos', '-')
          const tag = el('span', 'tag', '')
          const ap = el('span', 'nota', '')
          cab.append(rot, pts, tag, ap)
          const fila = el('div', 'fila')
          linha.append(cab, fila)
          linha._pts = pts
          linha._tag = tag
          linha._ap = ap
          linha._fila = fila
          zonaMaos.appendChild(linha)
        }
      }
      for (let i = 0; i < zonaMaos.childElementCount; i++) {
        const linha = zonaMaos.children[i]
        const m = maos[i]
        if (!m) {
          pintarCartas(linha._fila, [])
          linha._pts.textContent = '-'
          linha._tag.textContent = ''
          linha._ap.textContent = ''
          marca(linha, 'ativa', false)
          continue
        }
        const cartas = Array.isArray(m.cartas) ? m.cartas : []
        const defs = []
        for (let k = 0; k < cartas.length; k++) defs.push(def(cartas[k], false))
        pintarCartas(linha._fila, defs)
        linha._pts.textContent = String(inteiro(m.valor))
        let tag = ''
        if (m.blackjack) tag = 'BLACKJACK'
        else if (m.estourou) tag = 'ESTOUROU'
        else if (m.macio) tag = 'MACIO'
        linha._tag.textContent = tag
        marca(linha._tag, 'ruim', !!m.estourou)
        marca(linha._tag, 'bom', !!m.blackjack)
        linha._ap.textContent = 'aposta ' + num(m.aposta) + (m.dobrada ? ' (dobrada)' : '')
        marca(linha, 'ativa', fase === 'jogador' && est.maoAtual === i)
      }

      msgMesa.textContent = est ? (est.mensagem || '') : 'Escolha a aposta e mande distribuir.'

      // --- fim da mao: paga UMA vez so ---
      if (est && fase === 'fim' && !pago) {
        pago = true
        placar.textContent = ''
        const rs = Array.isArray(est.resultados) ? est.resultados : []
        let total = 0
        for (let i = 0; i < rs.length; i++) {
          const r = rs[i]
          const ganho = inteiro(chamar(carteira, 'ganharOuro', r.retorno))
          total += ganho
          const linha = el('div', 'res' +
            (r.tipo === 'blackjack' ? ' top' : (r.tipo === 'ganhou' ? ' bom' : (r.tipo === 'empate' ? '' : ' ruim'))))
          const esq = el('span', null, rotuloResultado(r.tipo) + (rs.length > 1 ? ' (mao ' + (i + 1) + ')' : ''))
          const dir = el('b', null, ganho > 0 ? '+' + num(ganho) : '—')
          linha.append(esq, dir)
          placar.appendChild(linha)
        }
        if (total > 0) {
          avisar('Voce recebeu ' + num(total) + ' de ouro.', 'bom')
          if (rs.some((r) => r && r.tipo === 'blackjack')) comemorar(1500)
        } else {
          avisar('A casa levou essa. A proxima e sua.', 'ruim')
        }
      }
      if (fase !== 'fim') placar.textContent = ''

      // --- botoes ---
      const apostando = !est || fase === 'aposta'
      barraAposta.style.display = apostando ? '' : 'none'
      barraAcoes.style.display = apostando ? 'none' : ''
      // Aparar a aposta pelo saldo so vale enquanto ela AINDA PODE SER GASTA.
      // No meio da mao o ouro ja saiu da carteira, entao 'ouro' e o que sobrou
      // DEPOIS de pagar — cortar a aposta ali zerava ela em toda mao apostada
      // por inteiro, e o jogador terminava a mao com o premio no bolso, a barra
      // de aposta escondida (fase 'fim' nao mostra ela) e um JOGAR DE NOVO
      // desabilitado por um valor que ele nunca escolheu: mesa travada pra
      // sempre, sem nenhum botao que desfaca.
      const emJogo = fase === 'jogador' || fase === 'dealer'
      if (!emJogo && aposta > ouro) aposta = Math.min(BJ_MAX, ouro)
      // Caminho de volta: no fim da mao nao ha fichas na tela pra corrigir uma
      // aposta abaixo do minimo (ela so cai ai por falta de ouro, nunca por
      // escolha). Deu pra pagar a mesa de novo, ela volta sozinha pro minimo —
      // e o que faz "passar no caixa e voltar" destravar a mesa.
      if (fase === 'fim' && aposta < BJ_MIN && ouro >= BJ_MIN) aposta = BJ_MIN
      mostraAposta.textContent = num(aposta) + (aposta >= BJ_MAX ? '  (teto da mesa)' : '')
      fichas.atualizar(Math.min(ouro, BJ_MAX - aposta), -1)
      btLimpar.disabled = aposta <= 0
      btDar.disabled = aposta < BJ_MIN || aposta > ouro
      btDar.textContent = aposta >= BJ_MIN ? 'DISTRIBUIR (' + num(aposta) + ')' : 'DISTRIBUIR'

      const acoes = (est && Array.isArray(est.acoes)) ? est.acoes : []
      const extra = (est && fase === 'jogador') ? Math.max(0, inteiro(chamar(jogo, 'custoExtra'))) : 0
      btPedir.disabled = acoes.indexOf('pedir') < 0
      btParar.disabled = acoes.indexOf('parar') < 0
      btDobrar.disabled = acoes.indexOf('dobrar') < 0
      btDividir.disabled = acoes.indexOf('dividir') < 0
      btDobrar.textContent = extra > 0 ? 'DOBRAR (' + num(extra) + ')' : 'DOBRAR'
      btDividir.textContent = extra > 0 ? 'DIVIDIR (' + num(extra) + ')' : 'DIVIDIR'
      const fim = fase === 'fim'
      btDeNovo.style.display = fim ? '' : 'none'
      btPedir.style.display = fim ? 'none' : ''
      btParar.style.display = fim ? 'none' : ''
      btDobrar.style.display = fim ? 'none' : ''
      btDividir.style.display = fim ? 'none' : ''
      btDeNovo.disabled = aposta < BJ_MIN || aposta > ouro
      btDeNovo.textContent = 'JOGAR DE NOVO (' + num(aposta) + ')'

      sapato.textContent = baralhoBJ ? ('Sapato: ' + inteiro(baralhoBJ.restantes) + ' cartas  ·  a casa compra ate 17') : ''
    }

    return {
      nome: 'blackjack',
      sec,
      render,
      principal() {
        const est = jogo ? chamar(jogo, 'estado') : null
        if (!est || est.fase === 'aposta') return btDar
        if (est.fase === 'fim') return btDeNovo
        return btPedir
      },
      kicker: 'MESA DA ATENDENTE',
      titulo: 'Blackjack',
    }
  }

  // -------------------------------------------------------------------------
  // TELA 3 — POKER HEADS-UP DE 2 CARTAS (FICHAS)
  // -------------------------------------------------------------------------
  function construirPoker() {
    const sec = el('section', 'tela')

    let jogo = null
    let ante = ANTES_POKER[1]
    let entradaPaga = 0        // quanto ja saiu da carteira NESTA mao
    let pago = false           // resultado ja creditado?
    let subida = AUMENTOS_POKER[0]
    let fichasDele = 2000      // a banca dele atravessa as maos

    const npc = el('div', 'npc')
    const retrato = retratoRicaco(128)
    retrato.className = cn('retrato')
    const balao = el('div', 'balao')
    const nomeNpc = el('b', null, NOME_NPC_POKER)
    const falaNpc = document.createTextNode('Senta ai. Ficha na mesa e sem conversa mole.')
    balao.append(nomeNpc, falaNpc)
    npc.append(retrato, balao)

    const mesa = el('div', 'mesa')
    const ladoDele = el('div', 'lado')
    const cabDele = el('div', 'cab')
    const maoDeleTxt = el('span', 'tag', '')
    cabDele.append(el('span', 'rot', 'Dom Sebastiao'), maoDeleTxt)
    const filaDele = el('div', 'fila')
    ladoDele.append(cabDele, filaDele)

    const placas = el('div', 'placas')
    const pPote = placa('pote')
    const pFalta = placa('pra pagar')
    const pBanca = placa('fichas dele')
    placas.append(pPote.el, pFalta.el, pBanca.el)

    const ladoEu = el('div', 'lado')
    const cabEu = el('div', 'cab')
    const minhaEntradaTxt = el('span', 'nota', '')
    cabEu.append(el('span', 'rot', 'Voce'), minhaEntradaTxt)
    const filaEu = el('div', 'fila')
    const minhaMaoTxt = el('div', 'mao1', '')
    ladoEu.append(cabEu, filaEu, minhaMaoTxt)

    mesa.append(ladoDele, placas, ladoEu)

    const placar = el('div', 'placar')
    const msgMesa = el('div', 'nota', '')

    // --- barra da ante ---
    const barraAnte = el('div', 'caixa2')
    barraAnte.append(el('div', 'rot', 'Ante da mao'))
    const mostraAnte = el('div', 'grande', String(ante))
    barraAnte.append(mostraAnte, el('div', 'nota', 'em FICHAS. Os dois pagam a ante; quem desistir depois deixa o que ja botou.'))
    const fichasAnte = fileiraFichas(ANTES_POKER, (v) => { ante = v; renderTela() })
    const btRepartir = botao('ouro', 'REPARTIR', () => comecar())
    const linhaAnte = el('div', 'linha')
    linhaAnte.append(btRepartir)
    barraAnte.append(fichasAnte.el, linhaAnte)

    // --- barra de acoes ---
    const barraSubida = el('div', 'caixa2')
    barraSubida.append(el('div', 'rot', 'Tamanho da subida'))
    const fichasSubida = fileiraFichas(AUMENTOS_POKER, (v) => { subida = v; renderTela() })
    barraSubida.append(fichasSubida.el)

    const barraAcoes = el('div', 'linha')
    const btPassar = botao('', 'PASSAR', () => acao('passar'))
    const btApostar = botao('verde', 'APOSTAR', () => acao('apostar'))
    const btPagar = botao('verde', 'PAGAR', () => acao('pagar'))
    const btAumentar = botao('ouro', 'AUMENTAR', () => acao('aumentar'))
    const btDesistir = botao('bordo', 'DESISTIR', () => acao('desistir'))
    const btDeNovo = botao('ouro', 'OUTRA MAO', () => novaMao())
    barraAcoes.append(btPassar, btApostar, btPagar, btAumentar, btDesistir, btDeNovo)

    // Tabela de maos: e um jogo inventado, entao a regra fica na tela. Sem isto
    // o jogador perde uma mao com dois reis e acha que a UI errou.
    const ranking = el('div', 'ranking')
    ranking.append(
      el('em', null, 'PAR'), el('s', null, '>'),
      el('em', null, 'SEQUENCIA'), el('s', null, '>'),
      el('em', null, 'NAIPE'), el('s', null, '>'),
      el('em', null, 'CARTA ALTA'),
      el('span', null, '· com 2 cartas o mesmo naipe (23,5%) e mais comum que cartas seguidas (~14,5%), entao sequencia vale mais.'),
    )

    sec.append(npc, mesa, placar, msgMesa, barraAnte, barraSubida, barraAcoes, ranking)

    function comecar() {
      if (!baralhoPk) baralhoPk = criarBaralho(1)
      const v = Math.max(1, inteiro(ante))
      if (!chamar(carteira, 'temFichas', v)) { avisar('Fichas insuficientes pra ante. Passe no caixa.', 'ruim'); return }
      // 1) cobra a ante  2) so entao cria a mao (comecar() cobra a dele)
      if (!chamar(carteira, 'gastarFichas', v)) { avisar('Fichas insuficientes.', 'ruim'); return }
      if (baralhoPk && baralhoPk.precisaEmbaralhar) chamar(baralhoPk, 'embaralhar')
      ante = v
      pago = false
      placar.textContent = ''
      jogo = criarPoker({ baralho: baralhoPk, aposta: v, fichasNpc: fichasDele })
      chamar(carteira, 'contarMao')
      chamar(jogo, 'comecar')
      // Baliza da cobranca: o que o modulo ja conta como minha entrada agora e
      // exatamente a ante que EU acabei de pagar. Tudo acima disso e que sera
      // debitado dali pra frente — assim nao importa se o modulo conta a ante
      // dentro ou fora de minhaEntrada.
      const est = chamar(jogo, 'estado')
      entradaPaga = est ? Math.max(0, inteiro(est.minhaEntrada)) : v
      avisar('')
      renderTela()
    }

    function novaMao() {
      // A banca dele atravessa as maos: e o que faz "quebrar o ricaco" ser um
      // objetivo, em vez de cada mao comecar do zero contra um cofre infinito.
      const est = jogo ? chamar(jogo, 'estado') : null
      if (est) fichasDele = Math.max(0, inteiro(est.fichasNpc))
      jogo = null
      pago = false
      placar.textContent = ''
      // limpa a mesa pras cartas da proxima mao entrarem voando de novo
      pintarCartas(filaDele, [])
      pintarCartas(filaEu, [])
      // ja reparte: quem clicou "outra mao" quer jogar, nao voltar pra tela de
      // ante e apertar mais um botao. Trocar a ante continua possivel — as
      // fichas dela ficam na tela e mudam o valor da proxima.
      if (carteira && carteira.temFichas(ante)) { comecar(); return }
      avisar('Fichas insuficientes pra outra ante. Passe no caixa.', 'ruim')
      renderTela()
    }

    /**
     * Quanto essa acao vai custar de ficha. Quem responde e o modulo —
     * custoExtra(acao, valor) ja aplica o limite da mesa, entao pedir 25 numa
     * mesa de minimo 50 devolve 50 e o botao mostra o numero VERDADEIRO. A
     * conta na mao aqui embaixo e so rede de seguranca.
     */
    function custoDe(nome, valor) {
      if (nome === 'passar' || nome === 'desistir') return 0
      const dele = Math.max(0, inteiro(chamar(jogo, 'custoExtra', nome, valor)))
      if (dele > 0) return dele
      const est = chamar(jogo, 'estado') || {}
      const falta = Math.max(0, inteiro(est.paraPagar))
      if (nome === 'pagar') return falta
      if (nome === 'apostar') return Math.max(0, inteiro(valor))
      if (nome === 'aumentar') return falta + Math.max(0, inteiro(valor))
      return 0
    }

    /** Acerta a carteira com o que o modulo diz que eu ja botei no pote. */
    function acertarEntrada() {
      const est = chamar(jogo, 'estado')
      if (!est) return
      const alvo = Math.max(0, inteiro(est.minhaEntrada))
      const falta = alvo - entradaPaga
      if (falta <= 0) return
      if (!chamar(carteira, 'gastarFichas', falta)) {
        // Inalcancavel: toda acao checa o saldo antes. Se chegar aqui, cobra o
        // que existe — a carteira nunca fica negativa, esse e o contrato dela.
        const cabe = Math.min(falta, carteira ? carteira.fichas : 0)
        if (cabe > 0) chamar(carteira, 'gastarFichas', cabe)
        avisar('Suas fichas acabaram no meio da mao.', 'ruim')
      }
      entradaPaga = alvo
    }

    function acao(nome) {
      if (!jogo) return
      const est = chamar(jogo, 'estado')
      if (!est || !Array.isArray(est.acoes) || est.acoes.indexOf(nome) < 0) return
      const valor = Math.max(1, inteiro(subida))
      const custo = custoDe(nome, valor)
      if (custo > 0 && !chamar(carteira, 'temFichas', custo)) {
        avisar('Fichas insuficientes: essa jogada custa ' + num(custo) + '.', 'ruim')
        return
      }
      if (nome === 'apostar' || nome === 'aumentar') chamar(jogo, nome, valor)
      else chamar(jogo, nome)
      // O NPC responde dentro da propria chamada; aqui so acertamos o caixa.
      acertarEntrada()
      renderTela()
    }

    function nomeMao(m) {
      if (!m) return ''
      if (typeof m === 'string') return m
      return String(m.nome || '')
    }

    function rotuloResultado(t) {
      if (t === 'ganhou') return 'Voce levou o pote'
      if (t === 'perdeu') return 'Ele levou o pote'
      if (t === 'empate') return 'Empate — divide o pote'
      if (t === 'desistiu') return 'Voce correu'
      if (t === 'ele-desistiu') return 'Ele correu'
      return String(t || '')
    }

    function render() {
      const est = jogo ? chamar(jogo, 'estado') : null
      const fase = est ? est.fase : 'aposta'
      const meuSaldo = carteira ? carteira.fichas : 0

      if (est && est.fala) falaNpc.nodeValue = String(est.fala)

      // --- cartas dele: dois versos ate o showdown ---
      const dele = (est && Array.isArray(est.dele)) ? est.dele : []
      if (!est) {
        pintarCartas(filaDele, [])
        maoDeleTxt.textContent = ''
      } else if (dele.length >= 2) {
        pintarCartas(filaDele, [def(dele[0], false), def(dele[1], false)])
      } else {
        pintarCartas(filaDele, [def(null, true), def(null, true)])
        maoDeleTxt.textContent = ''
      }

      // --- minhas cartas ---
      const minhas = (est && Array.isArray(est.minhas)) ? est.minhas : []
      const defsEu = []
      for (let i = 0; i < minhas.length; i++) defsEu.push(def(minhas[i], false))
      pintarCartas(filaEu, defsEu)
      if (minhas.length >= 2) {
        let f = null
        try { f = forcaDaMao(minhas[0], minhas[1]) } catch (err) { void err }
        minhaMaoTxt.textContent = f ? 'Sua mao: ' + nomeMao(f) : ''
      } else {
        minhaMaoTxt.textContent = ''
      }

      pPote.valor.textContent = num(est ? est.pote : 0)
      pFalta.valor.textContent = num(est ? est.paraPagar : 0)
      pBanca.valor.textContent = num(est ? est.fichasNpc : fichasDele)
      minhaEntradaTxt.textContent = est ? ('no pote: ' + num(est.minhaEntrada)) : ''
      msgMesa.textContent = est ? (est.mensagem || '') : 'Escolha a ante e mande repartir.'

      // --- fim: credita UMA vez ---
      if (est && est.resultado && !pago) {
        pago = true
        const r = est.resultado
        const ganho = inteiro(chamar(carteira, 'ganharFichas', r.retorno))
        fichasDele = Math.max(0, inteiro(est.fichasNpc))
        maoDeleTxt.textContent = nomeMao(r.maoDele) ? ('MAO DELE: ' + nomeMao(r.maoDele)) : ''
        placar.textContent = ''
        const linha = el('div', 'res' + (r.tipo === 'ganhou' || r.tipo === 'ele-desistiu' ? ' bom' : (r.tipo === 'empate' ? '' : ' ruim')))
        const esq = el('span', null, rotuloResultado(r.tipo) +
          (nomeMao(r.minhaMao) && nomeMao(r.maoDele) ? '  ·  ' + nomeMao(r.minhaMao) + ' x ' + nomeMao(r.maoDele) : ''))
        const dir = el('b', null, ganho > 0 ? '+' + num(ganho) : '—')
        linha.append(esq, dir)
        placar.appendChild(linha)
        if (ganho > 0) { avisar('Voce recebeu ' + num(ganho) + ' em fichas.', 'bom'); comemorar(1200) }
        else avisar('Essa foi dele.', 'ruim')
      }
      if (!est || !est.resultado) placar.textContent = ''

      // --- botoes ---
      const emMao = !!est && fase !== 'fim'
      barraAnte.style.display = emMao ? 'none' : ''
      barraSubida.style.display = (emMao && fase === 'jogador') ? '' : 'none'
      barraAcoes.style.display = est ? '' : 'none'

      // Mesma armadilha do blackjack: dentro da mao 'meuSaldo' e o que sobrou
      // DEPOIS de pagar a ante, entao aparar aqui derrubava a ante escolhida
      // pra 1 em toda mao paga com o saldo justo — e a proxima 'OUTRA MAO'
      // repartia por 1 ficha sem o jogador ter mexido em nada.
      if (!emMao && ante > meuSaldo) ante = Math.min(ante, Math.max(1, meuSaldo))
      mostraAnte.textContent = num(ante)
      fichasAnte.atualizar(meuSaldo, ante)
      btRepartir.disabled = !(carteira && carteira.temFichas(ante)) || ante <= 0
      btRepartir.textContent = 'REPARTIR (ante ' + num(ante) + ')'
      // No fim da mao quem reparte e o OUTRA MAO: dois botoes que fazem a mesma
      // coisa, lado a lado, so servem pra o jogador escolher errado.
      btRepartir.style.display = (est && fase === 'fim') ? 'none' : ''

      const acoes = (est && Array.isArray(est.acoes)) ? est.acoes : []
      const temAcao = (n) => acoes.indexOf(n) >= 0
      fichasSubida.atualizar(meuSaldo, subida)
      // Cada botao mostra o que vai sair da carteira SE for clicado. Botao de
      // aposta com numero errado e a unica coisa que o jogador nunca perdoa.
      const custoPagar = temAcao('pagar') ? custoDe('pagar', 0) : 0
      const custoApostar = temAcao('apostar') ? custoDe('apostar', subida) : subida
      const custoAumentar = temAcao('aumentar') ? custoDe('aumentar', subida) : subida
      btPassar.style.display = temAcao('passar') ? '' : 'none'
      btApostar.style.display = temAcao('apostar') ? '' : 'none'
      btPagar.style.display = temAcao('pagar') ? '' : 'none'
      btAumentar.style.display = temAcao('aumentar') ? '' : 'none'
      btDesistir.style.display = temAcao('desistir') ? '' : 'none'
      btDeNovo.style.display = (est && fase === 'fim') ? '' : 'none'
      btApostar.textContent = 'APOSTAR ' + num(custoApostar)
      btAumentar.textContent = 'AUMENTAR ' + num(custoAumentar)
      btPagar.textContent = custoPagar > 0 ? 'PAGAR ' + num(custoPagar) : 'PAGAR'
      btApostar.disabled = !carteira || !carteira.temFichas(custoApostar)
      btAumentar.disabled = !carteira || !carteira.temFichas(custoAumentar)
      btPagar.disabled = !carteira || !carteira.temFichas(custoPagar)
      btDeNovo.disabled = !(carteira && carteira.temFichas(ante))
    }

    return {
      nome: 'poker',
      sec,
      render,
      principal() {
        const est = jogo ? chamar(jogo, 'estado') : null
        if (!est) return btRepartir
        if (est.fase === 'fim') return btDeNovo
        if (Array.isArray(est.acoes) && est.acoes.indexOf('pagar') >= 0) return btPagar
        return btPassar
      },
      kicker: 'MESA DE POKER',
      titulo: 'Cabeca a cabeca',
    }
  }

  // -------------------------------------------------------------------------
  // TELA 4 — CACA-NIQUEL (FICHAS)
  // -------------------------------------------------------------------------
  function construirSlot() {
    const sec = el('section', 'tela')

    let jogo = null
    let maquina = 0
    let aposta = APOSTAS_SLOT[1]
    let girando = false
    let socorro = 0
    const paradas = [0, 0, 0]   // timers de parada escalonada dos roletes
    // Giro em voo: a ficha JA SAIU da carteira e o modulo JA sorteou o premio,
    // mas os roletes ainda estao andando. Guardar o resultado aqui e o que
    // permite pagar quem for interrompido — sem isto, sair da maquina no meio
    // do giro (Esc e correr pra maquina do lado, coisa de dois segundos) fazia
    // pararTimers() apagar a revelacao e a ficha sumir sem premio nenhum.
    let pendente = null   // { res, valor }

    const lista = Array.isArray(SIMBOLOS) ? SIMBOLOS : []

    const gabinete = el('div', 'maquina')
    const roletes = el('div', 'roletes')
    const fitas = []
    for (let r = 0; r < 3; r++) {
      const rol = el('div', 'rolete')
      const fita = el('div', 'fita')
      // A fita repete a lista 3 vezes e a animacao anda EXATAMENTE uma lista:
      // no fim do ciclo o desenho e identico ao do inicio, entao o giro parece
      // continuo sem nenhum salto.
      for (let c = 0; c < 3; c++) {
        for (let i = 0; i < lista.length; i++) {
          const s = lista[i]
          const cel = el('div', 'cel')
          const disco = el('div', 'simb', letraDe(s))
          disco.style.setProperty('--' + P + 'c', cssCor(s && s.cor, '#8a8f99'))
          cel.append(disco, el('div', 'simbnome', (s && s.nome) || (s && s.id) || '?'))
          fita.appendChild(cel)
        }
      }
      fita.style.setProperty('--' + P + 'volta', (-lista.length * CEL) + 'px')
      rol.appendChild(fita)
      roletes.appendChild(rol)
      fitas.push(fita)
    }
    const visor = el('div', 'visor', 'Aposte e puxe a alavanca.')
    gabinete.append(roletes, visor)

    const barra = el('div', 'caixa2')
    barra.append(el('div', 'rot', 'Aposta por giro'))
    const mostraAposta = el('div', 'grande', String(aposta))
    barra.append(mostraAposta, el('div', 'nota', 'em FICHAS — a maquina nao aceita ouro.'))
    const fichas = fileiraFichas(APOSTAS_SLOT, (v) => { aposta = v; renderTela() })
    const btGirar = botao('ouro enorme', 'GIRAR', () => girar())
    const linha = el('div', 'linha')
    linha.append(btGirar)
    barra.append(fichas.el, linha)

    // Tabela de premios + RTP. Numero honesto na tela e o que separa uma maquina
    // de um golpe: o jogador perde sabendo por que perdeu.
    const tabelaCx = el('div', 'caixa2')
    tabelaCx.append(el('div', 'rot', 'Pagamentos'))
    const tabela = el('table', 'tabela')
    tabelaCx.append(tabela)
    const rtp = el('div', 'nota', '')
    tabelaCx.append(rtp)

    sec.append(gabinete, barra, tabelaCx)

    function garantirJogo() {
      if (!jogo) jogo = criarSlots({})
      return jogo
    }

    function montarTabela() {
      const j = garantirJogo()
      // A maquina sabe apresentar a propria tabela (e ja vem do premio maior
      // pro menor, que e a ordem que o jogador quer ler). Se ela nao souber,
      // a lista crua + premioDe() cobrem o buraco.
      let linhas = chamar(j, 'tabela')
      if (!Array.isArray(linhas) || !linhas.length) {
        linhas = []
        for (let i = 0; i < lista.length; i++) {
          const s = lista[i]
          linhas.push({
            nome: (s && s.nome) || (s && s.id) || '?',
            cor: s && s.cor,
            trinca: premioDe(s, i, 'trinca'),
            par: premioDe(s, i, 'par'),
          })
        }
      }

      tabela.textContent = ''
      const thead = document.createElement('thead')
      const tr = document.createElement('tr')
      for (const t of ['Simbolo', 'Trinca', 'Par']) {
        const th = document.createElement('th')
        th.textContent = t
        tr.appendChild(th)
      }
      thead.appendChild(tr)
      tabela.appendChild(thead)
      const tbody = document.createElement('tbody')
      for (let i = 0; i < linhas.length; i++) {
        const r = linhas[i]
        const l = document.createElement('tr')
        const c0 = document.createElement('td')
        const bolinha = el('span', 'bolinha')
        bolinha.style.setProperty('--' + P + 'c', cssCor(r.cor, '#8a8f99'))
        c0.append(bolinha, document.createTextNode(r.nome || r.id || '?'))
        const c1 = document.createElement('td')
        c1.textContent = r.trinca ? (r.trinca + 'x') : '-'
        const c2 = document.createElement('td')
        c2.textContent = r.par ? (r.par + 'x') : '-'
        l.append(c0, c1, c2)
        tbody.appendChild(l)
      }
      tabela.appendChild(tbody)

      let e = Number(chamar(j, 'esperado'))
      const f = Number(chamar(j, 'frequencia'))
      if (Number.isFinite(e)) {
        // aceita 0.92 ou 92 — o painel mostra sempre em porcento
        if (e > 0 && e <= 1.5) e *= 100
        rtp.textContent = 'Retorno esperado: ' + e.toFixed(1) + '%' +
          (Number.isFinite(f) ? '  ·  paga alguma coisa em ' + f.toFixed(1) + '% dos giros' : '') +
          '  ·  a casa fica com o resto. Sempre.'
      } else {
        rtp.textContent = 'A casa sempre fica com uma parte.'
      }
    }

    function pararTimers() {
      for (let i = 0; i < paradas.length; i++) { clearTimeout(paradas[i]); paradas[i] = 0 }
      clearTimeout(socorro)
      socorro = 0
    }

    function mostrarSimbolos(simbolos) {
      for (let r = 0; r < 3; r++) {
        const i = indiceSimbolo(simbolos ? simbolos[r] : 0)
        marca(fitas[r], 'girando', false)
        fitas[r].style.transform = 'translateY(' + (-i * CEL) + 'px)'
      }
    }

    /** Encerra na hora um giro que ficou em voo, PAGANDO. Quem interrompe o
     *  suspense perde o suspense, nunca o premio: a aposta ja foi debitada e o
     *  resultado ja existe, entao engolir ele seria a maquina roubando. */
    function quitarGiro() {
      if (!pendente) return
      const p = pendente
      pararTimers()
      mostrarSimbolos(p.res.simbolos)
      revelar(p.res, p.valor)
    }

    function girar() {
      if (girando) return
      const j = garantirJogo()
      const v = Math.max(1, inteiro(aposta))
      // 1) cobra  2) so entao gira. A ficha sai antes do rolete andar.
      if (!chamar(carteira, 'gastarFichas', v)) { avisar('Fichas insuficientes. Passe no caixa.', 'ruim'); return }
      const res = chamar(j, 'girar', v)
      if (!res) { chamar(carteira, 'ganharFichas', v); avisar('A maquina engasgou. Ficha devolvida.', 'ruim'); return }
      chamar(carteira, 'contarMao')

      girando = true
      pendente = { res, valor: v }
      pararTimers()
      visor.textContent = 'Girando...'
      marca(visor, 'top', false)
      avisar('')
      for (let r = 0; r < 3; r++) {
        fitas[r].style.transform = ''
        marca(fitas[r], 'girando', true)
      }
      renderTela()

      let acabou = false
      const terminar = () => {
        if (acabou) return
        acabou = true
        pararTimers()
        // Para um rolete de cada vez: o suspense do caca-niquel MORA aqui. Com
        // os tres parando juntos o resultado vira um numero, nao um momento.
        for (let r = 0; r < 3; r++) {
          paradas[r] = setTimeout(() => {
            const i = indiceSimbolo(res.simbolos ? res.simbolos[r] : 0)
            marca(fitas[r], 'girando', false)
            fitas[r].style.transform = 'translateY(' + (-i * CEL) + 'px)'
            if (r === 2) revelar(res, v)
          }, r * 190)
        }
      }

      // O 3D manda no tempo: os roletes do painel param junto com os de verdade.
      const pediu = mundo && typeof mundo.girarMaquina === 'function'
      if (pediu) {
        chamar(mundo, 'girarMaquina', maquina, res.simbolos, terminar)
        socorro = setTimeout(terminar, SOCORRO_GIRO)
      } else {
        // Sem mundo 3D (ou sem o metodo) o painel se vira sozinho.
        socorro = setTimeout(terminar, 1600)
      }
    }

    function revelar(res, valor) {
      girando = false
      pendente = null
      const premio = Math.max(0, inteiro(res.premio))
      const tipo = String(res.tipo || 'nada')
      const grande = tipo === 'trinca' || tipo === 'jackpot'
      if (premio > 0) {
        chamar(carteira, 'ganharFichas', premio)
        const vezes = valor > 0 ? (premio / valor) : 0
        visor.textContent = (res.nome ? res.nome + '  ·  ' : '') + '+' + num(premio) + ' fichas' +
          (vezes >= 2 ? '  (' + vezes.toFixed(vezes < 10 ? 1 : 0) + 'x)' : '')
        avisar(tipo === 'jackpot' ? 'JACKPOT! A maquina inteira acendeu.' : 'Premio: ' + num(premio) + ' fichas.', 'bom')
      } else {
        visor.textContent = 'Nada dessa vez.'
        avisar('Nada. Roda de novo?', '')
      }
      marca(visor, 'top', grande && premio > 0)
      if (grande && premio > 0) {
        comemorar(2000)
        chamar(mundo, 'festa', maquina)
      }
      renderTela()
    }

    function render() {
      const saldo = carteira ? carteira.fichas : 0
      if (!tabela.childElementCount) montarTabela()
      mostraAposta.textContent = num(aposta)
      fichas.atualizar(saldo, aposta)
      btGirar.disabled = girando || !(carteira && carteira.temFichas(aposta))
      btGirar.textContent = girando ? 'GIRANDO...' : 'GIRAR (' + num(aposta) + ')'
    }

    return {
      nome: 'slot',
      sec,
      render,
      principal: () => btGirar,
      kicker: 'CACA-NIQUEL',
      titulo: 'Maquina 1',
      /** Trocou de maquina: zera o visor pra nao herdar o giro da anterior. */
      escolher(i) {
        const novo = Math.max(0, inteiro(i))
        if (novo !== maquina) {
          // Quita ANTES de trocar 'maquina': o premio (e a festa no 3D) e da
          // maquina que girou, nao da que o jogador acabou de abrir.
          quitarGiro()
          maquina = novo
          pararTimers()
          girando = false
          mostrarSimbolos([0, 0, 0])
          visor.textContent = 'Aposte e puxe a alavanca.'
          marca(visor, 'top', false)
        }
        this.titulo = 'Maquina ' + (maquina + 1)
      },
      soltar() { quitarGiro(); pararTimers() },
    }
  }

  // -------------------------------------------------------------------------
  // Montagem sob demanda: quem so passa no caixa nunca constroi a mesa de poker.
  // -------------------------------------------------------------------------
  function construir(nome) {
    let t = null
    try {
      if (nome === 'caixa') t = construirCaixa()
      else if (nome === 'blackjack') t = construirBlackjack()
      else if (nome === 'poker') t = construirPoker()
      else if (nome === 'slot') t = construirSlot()
    } catch (err) {
      console.warn('[cassino-ui] nao consegui montar a tela ' + nome + ':', err)
      return null
    }
    if (!t) return null
    corpo.appendChild(t.sec)
    telas.set(nome, t)
    return t
  }

  // -------------------------------------------------------------------------
  // API publica
  // -------------------------------------------------------------------------
  pintarBolso()

  return {
    abrirCaixa() { abrirTela('caixa') },

    // Blackjack e poker guardam a mao em andamento: quem fecha no meio e volta
    // encontra a mesa como deixou, em vez de perder a aposta por ter apertado
    // Esc sem querer.
    abrirBlackjack() { abrirTela('blackjack') },
    abrirPoker() { abrirTela('poker') },

    abrirSlot(i) {
      const t = telas.get('slot') || construir('slot')
      if (!t) return
      chamar(t, 'escolher', i)
      abrirTela('slot')
    },

    fechar() { fechar() },

    get aberto() { return aberto },

    /**
     * Existe pra fechar o contrato com o main. Nao faz nada de proposito: TODA
     * animacao daqui e CSS (giro do rolete, carta entrando, carta virando) ou
     * setTimeout, entao o painel funciona igual se o laco de render nunca
     * chamar isto — e nao ha uma unica alocacao por quadro para o coletor.
     */
    atualizar() {},

    dispose() {
      fechar()
      clearTimeout(festaTimer)
      for (const t of telas.values()) chamar(t, 'soltar')
      try { desligarCarteira() } catch (err) { void err }
      window.removeEventListener('keydown', aoTeclar, true)
      document.removeEventListener('pointerlockchange', aoTrancarMouse)
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
      telas.clear()
      telaAtual = null
    },
  }
}

export default criarCassinoUI
