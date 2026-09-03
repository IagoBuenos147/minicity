import { criarBaralho } from '../cassino/baralho.js'
import { criarBlackjack } from '../cassino/blackjack.js'
import { criarPoker, forcaDaMao } from '../cassino/poker.js'
import { SIMBOLOS, PAGAMENTOS, criarSlots } from '../cassino/slots.js'
import { criarCameraCena } from '../systems/camera-cena.js'
import { criarMesa3D } from '../cassino/mesa-3d.js'
import { criarFaixaMesa } from '../cassino/faixa-mesa.js'
import { acharNPC, criarReacao } from '../cassino/reacao-npc.js'
import * as somMesa from '../cassino/som-mesa.js'

// ---------------------------------------------------------------------------
// src/ui/cassino-ui.js — a CARA do cassino.
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
// ---------------------------------------------------------------------------
// DOIS MODOS, E ELES SAO DIFERENTES ATE O OSSO
// ---------------------------------------------------------------------------
//
// MODO 'painel' — o caixa e o caca-niquel. Sao BALCOES: o jogador chega, mexe
// num numero e sai. Uma janela modal e a forma certa pra isso, e continua sendo
// a mesma de sempre.
//
// MODO 'mesa' — o blackjack e o poker. Aqui o pedido do dono foi literal e em
// maiusculas: "N QUERO QUE AO INICIAR O BLACKJACK SURJA UM HUD, QUERO QUE
// APROXIME NA MESA, COMO SE FOSSE UM SIMULADOR MESMO". Entao nao ha janela: a
// CAMERA VIAJA ate o feltro (systems/camera-cena.js), as cartas sao objetos 3D
// de verdade em cima da mesa (cassino/mesa-3d.js + cassino/cartas-3d.js) e o
// que sobra pra tela e uma faixa fina no rodape (cassino/faixa-mesa.js).
//
// A DIVISAO DE TRABALHO NO MODO MESA, que e o que impede este arquivo de virar
// um monstro:
//   - cassino/blackjack.js e poker.js  -> a REGRA (nada de 3D, nada de dinheiro)
//   - cassino/mesa-3d.js               -> o TEMPO e o MOVIMENTO (nada de regra)
//   - cassino/faixa-mesa.js            -> os BOTOES (nada de regra)
//   - aqui                             -> quem liga um no outro E O DINHEIRO
//
// A ARMADILHA DO DESTRAVAMENTO, que custou um paragrafo pra nao custar um bug:
// `camera-cena.cortar()` (que roda sozinho no fim de `sair()`) ja chama
// player.setLocked(false). Se `aberto` virasse false junto, o main.js voltaria a
// ouvir E, as teclas 1-9 e o clique de tiro ENQUANTO a camera ainda esta
// voltando — o jogador sacaria o revolver na mesa. Por isso a saida tem ordem
// fixa: esconde a faixa -> camera.sair({ aoSair }) -> so no aoSair o modo cai
// pra null. `aberto` fica true a viagem inteira.
//
// A ORDEM DENTRO DO QUADRO: `atualizarCamera(dt, game)` e chamado por
// world/casino.js DEPOIS de player.update(), porque quem escreve na camera por
// ultimo ganha o quadro. Ver o cabecalho de systems/camera-cena.js.
//
// CSS: dois <style>, injetados uma vez cada. O do painel mora aqui com TODA
// classe prefixada por 'mcrp-cas-' (helper cn() abaixo faz isso sozinho); o da
// faixa mora em faixa-mesa.js com prefixo proprio. Nenhum dos dois briga com o
// HUD, o customizador ou o balao de dialogo.
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
// AS FICHAS DO CAIXOTE — as MESMAS nas duas mesas, e isso e o pedido ("um
// sistema unico tb com as fichas na mesa"). Elas nao sao mais botao redondo no
// rodape: sao cinco pilhas em cima do pano, uma por valor, e o jogador aposta
// clicando nelas (ver caixote() e apontar() em cassino/mesa-3d.js).
const FICHAS_MESA = [25, 50, 100, 250, 500]
const APOSTAS_SLOT = [5, 10, 25, 50, 100]

// A ANTE DO POKER E DA MESA, NAO DO JOGADOR — e isso e uma mudanca de desenho,
// nao um numero que encolheu.
//
// Antes o jogador escolhia a ante numa fileira de fichas e apertava REPARTIR
// pra a mao comecar. O pedido do dono foi literal: "tira isso de distribuir
// ante e coloca igual poker stars". E ele tem razao — em mesa de verdade (e no
// PokerStars) ninguem escolhe a entrada: a MESA tem uma entrada, quem senta
// paga, e a mao vem sozinha. Escolher a ante a cada mao punha uma decisao
// morta (sempre a mesma) na frente da unica decisao que interessa, que e o que
// fazer com as duas cartas.
//
// Consequencia direta: a fileira de fichas da faixa passa a significar UMA
// coisa so a mao inteira — o tamanho do aumento. Antes ela trocava de sentido
// no meio da mao (ante antes de repartir, aumento depois), que era a receita
// pra clicar 100 achando que era ante e ter apostado 100.
const ANTE_POKER = 25

// Quanto a mesa espera entre pagar o pote e repartir de novo. Tem que caber a
// apresentacao do resultado (o cartaz da faixa dura 1,7 s) e ainda sobrar uma
// batida de silencio: repartir por cima do cartaz le como a mesa atropelando o
// jogador. Ver agendarMao().
const T_PROXIMA_MAO = 2600
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

// O nome com que world/casino.js batiza o corpo do ricaco na cena. E por ele
// que reacao-npc.js acha o boneco — buildCasino nao devolve os NPCs.
const CORPO_RICACO = 'Dom Sebastiao'

// Tempos da camera. Entrar demora quase o dobro de sair de proposito: entrar e
// apresentacao (o jogador quer ver a mesa chegando), sair e saida (ninguem
// quer esperar pra ir embora).
const T_ENTRAR = 0.90
const T_SAIR = 0.55
const T_TROCA = 0.50        // viagem de um enquadramento pro outro, ja dentro

// Quanto a mesa espera, depois da ultima carta pousar, pra pagar e anunciar o
// resultado. E a ANTECIPACAO: sem ela o placar aparece junto com a carta e o
// jogador nunca chega a ler o que saiu.
const T_REVELACAO = 900

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

/* --- balcao do NPC (caixa) --- */
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
// UMA POSICAO DE FILA DE CARTA.
//
// E o unico pedaco do desenho de carta que sobrou neste arquivo. Ate a mesa
// virar 3D havia aqui um baralho inteiro em DOM — carta como <div>, naipe como
// texto, virada como animacao de CSS, mais um diff de fileira pra carta que ja
// estava na mesa nao reanimar. Tudo isso mudou de casa: o desenho foi pra
// cassino/cartas-3d.js (atlas de canvas) e o diff pra cassino/mesa-3d.js, que e
// quem sabe o que mudou entre dois snapshots. O que ficou e a FORMA de dizer
// "nesta posicao ha esta carta, ou ha uma virada pra baixo", que e o que as
// duas mesas passam pro palco.
// ---------------------------------------------------------------------------

/** carta null + verso true = carta que existe mas o jogador nao pode ver. */
function def(carta, verso) {
  return { carta: verso ? null : (carta || null), verso: !!verso }
}

/**
 * Valor das cartas VISIVEIS de uma mao.
 *
 * Com a carta do dealer tapada nao da pra confiar no estado.valor: ele pode ja
 * estar somando a carta que o jogador nao viu. A conta do As e a mesma de
 * cassino/blackjack.js de proposito — e a regra do jogo, nao uma variante.
 */
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
  //
  // 'modo' e a UNICA verdade sobre "tem UI de cassino no ar". `aberto` sai
  // dele. Duas flags (uma pro painel, outra pra mesa) e o desenho que sempre
  // termina com as duas discordando — e discordar aqui significa o jogador
  // atirando no meio de uma mao de blackjack.
  let modo = null               // null | 'painel' | 'mesa'
  let telaAtual = null          // { nome, sec, render, principal }
  let renderizando = false      // trava de reentrada (carteira -> render -> carteira)
  let festaTimer = 0
  const telas = new Map()       // nome -> tela; cada uma e montada uma vez so

  // Baralhos. Dois, porque as mesas nao dividem sapato: o blackjack usa 6
  // baralhos (contar carta fica inutil, que e o ponto) e o poker usa 1.
  let baralhoBJ = null
  let baralhoPk = null

  // --- o modo mesa ---------------------------------------------------------
  // Tudo nasce SOB DEMANDA: quem so passa no caixa nunca paga o atlas das 52
  // cartas nem a geometria das duas mesas.
  let cena = null               // systems/camera-cena.js
  let faixa = null              // cassino/faixa-mesa.js
  let mesaAtiva = null          // a mesa no ar agora
  const mesas3d = new Map()     // 'blackjack' | 'poker' -> cassino/mesa-3d.js
  let ricaco = null             // cassino/reacao-npc.js
  let tremorT = 0               // relogio proprio do tremor de camera
  let modoAntes = null          // 1a ou 3a pessoa, pra devolver na saida
  let escondeuTutorial = false  // o cartao de missao foi apagado por nos?

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

  // --- entrada: teclado e ponteiro, comuns aos dois modos -------------------
  //
  // Um par de funcoes so, e nao um pedaco disso em cada modo: era assim que a
  // versao anterior fazia (com um modo so) e e o que garante que abrir a mesa e
  // abrir o painel travem o jogador EXATAMENTE do mesmo jeito.
  function capturarEntrada() {
    // A ordem importa: travar ANTES de soltar o mouse, senao um frame de
    // movimento entra entre as duas chamadas e o jogador anda meio passo.
    chamar(game && game.player, 'setLocked', true)
    try { document.exitPointerLock() } catch (err) { void err }
    document.addEventListener('pointerlockchange', aoTrancarMouse)
    window.addEventListener('keydown', aoTeclar, true)
  }

  function soltarEntrada() {
    window.removeEventListener('keydown', aoTeclar, true)
    document.removeEventListener('pointerlockchange', aoTrancarMouse)
    // O main re-trava o mouse no proximo clique; aqui so devolvemos o controle.
    chamar(game && game.player, 'setLocked', false)
  }

  // Se qualquer outro sistema re-trancar o ponteiro com a UI aberta (o main faz
  // isso no clique), solta de novo: UI aberta e mouse preso = jogador vendo
  // botao que nao consegue clicar.
  function aoTrancarMouse() {
    if (modo && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  function aoTeclar(e) {
    if (!modo) return
    const emCampo = e.target && e.target.tagName === 'INPUT'
    if (e.key === 'Escape') {
      fechar()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (!emCampo && (e.key === 'Enter' || e.key === 'NumpadEnter')) {
      const b = modo === 'mesa'
        ? (mesaAtiva && mesaAtiva.principal && mesaAtiva.principal())
        : (telaAtual && telaAtual.principal && telaAtual.principal())
      if (b && !b.disabled) { b.click(); e.preventDefault() }
    }
    // TUDO o mais para aqui: com a UI aberta o jogo nao pode ouvir tecla
    // nenhuma (digitar 250 no caixa trocaria de arma tres vezes; um "3" na
    // mesa de blackjack sacaria o revolver no meio da mao).
    e.stopPropagation()
  }

  // --- abrir / fechar o PAINEL ---------------------------------------------
  function renderTela() {
    if (!telaAtual || renderizando) return
    renderizando = true
    try { telaAtual.render() } catch (err) { console.warn('[cassino-ui] render:', err) }
    renderizando = false
  }

  function abrirTela(nome) {
    // Balcao e mesa nao convivem: chegar no caixa com a mesa aberta e sair da
    // mesa. Sem isto a camera ficaria na mesa por tras da janela do caixa.
    if (modo === 'mesa') fecharMesa(true)
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

    if (modo === 'painel') return
    modo = 'painel'
    capturarEntrada()
    raiz.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => marca(raiz, 'on', true))
    setTimeout(() => { if (modo === 'painel') painel.focus() }, 30)
  }

  function fecharPainel() {
    if (modo !== 'painel') return
    modo = null
    marca(raiz, 'on', false)
    marca(painel, 'festa', false)
    raiz.setAttribute('aria-hidden', 'true')
    soltarEntrada()
  }

  /** Esc / botao X / clique no veu: fecha o que estiver no ar. */
  function fechar() {
    if (modo === 'mesa') fecharMesa(false)
    else fecharPainel()
  }

  // -------------------------------------------------------------------------
  // MODO MESA — a infraestrutura que blackjack e poker dividem
  // -------------------------------------------------------------------------

  function garantirCena() {
    if (cena) return cena
    if (!game || !game.camera) return null
    cena = criarCameraCena({ camera: game.camera, player: game.player, hud: game.hud })
    return cena
  }

  function garantirFaixa() {
    if (!faixa) faixa = criarFaixaMesa()
    return faixa
  }

  /**
   * O palco 3D de uma mesa. Construido na PRIMEIRA vez que alguem senta nela:
   * o atlas das 52 cartas custa uns milissegundos de canvas e 20 MB de textura,
   * e cobrar isso de quem so passa no caca-niquel seria cobrar de todo mundo
   * pelo que poucos usam. A viagem da camera (0,9 s) cobre o custo.
   */
  function garantirMesa3D(nome) {
    let m = mesas3d.get(nome)
    if (m) return m
    const anc = mundo && mundo.mesas ? mundo.mesas[nome] : null
    if (!anc || !game || !game.scene) return null
    try {
      m = criarMesa3D({ scene: game.scene, ancora: anc, tipo: nome })
    } catch (err) {
      console.warn('[cassino-ui] nao consegui montar a mesa 3D ' + nome + ':', err)
      return null
    }
    mesas3d.set(nome, m)
    return m
  }

  /**
   * O ricaco, pelo caminho bom quando ele existe.
   *
   * `buildCasino` devolve `npcs`, e o NPC INTEIRO e o que interessa: e nele que
   * mora o setPose, e setPose e a unica forma de mudar a postura dele sem
   * brigar com o update do proprio NPC (ver reacao-npc.js). O caminho por nome
   * e SO o de volta — pra um mundo montado sem o cassino inteiro, pra foto e
   * pro teste. Nome de objeto e contrato fraco; a referencia direta nao.
   */
  function garantirRicaco() {
    if (ricaco) return ricaco
    const anc = mundo && mundo.mesas ? mundo.mesas.poker : null
    let alvo = (mundo && mundo.npcs) ? mundo.npcs.ricaco : null
    if (!alvo) alvo = acharNPC(mundo && mundo.group, CORPO_RICACO, anc ? anc.npc : null)
    ricaco = criarReacao(alvo)
    return ricaco
  }

  function pintarBolsoMesa() {
    if (!faixa || !mesaAtiva) return
    faixa.setBolso(
      carteira ? carteira.ouro : 0,
      carteira ? carteira.fichas : 0,
      mesaAtiva.moeda)
  }

  /** Mesma trava de reentrada do painel: creditar dispara aoMudar da carteira,
   *  que chamaria o render de volta no meio do proprio render. */
  function renderMesa() {
    if (!mesaAtiva || renderizando) return
    renderizando = true
    try { mesaAtiva.render() } catch (err) { console.warn('[cassino-ui] mesa:', err) }
    renderizando = false
  }

  // -------------------------------------------------------------------------
  // O PANO E CLICAVEL: o caixote de fichas em 3D
  //
  // A faixa cobre a tela inteira e engole todo evento de mouse (regra 2 do
  // cabecalho de cassino/faixa-mesa.js: sem isso o main pede pointer lock em
  // todo clique e o ponteiro some no meio da mao). Isso, que era uma trava,
  // virou a porta de entrada: o clique que cai NA RAIZ — e nao num botao, nem
  // na faixa, nem no cabecalho — e um clique no feltro, e e esse que vira
  // raycast nas pilhas do caixote.
  //
  // Repare que a checagem e `ev.target === faixa.el` e nao um closest(): a
  // vinheta, o clarao e o cartaz do meio ja tem pointer-events:none, entao tudo
  // que cai no meio da tela chega na raiz em pessoa. Um closest() por classe
  // amarraria este arquivo ao prefixo CSS do outro.
  // -------------------------------------------------------------------------

  /**
   * Tira a ficha DE CIMA de uma aposta de `v`.
   *
   * A pilha e montada da maior pra menor (decomposicao gulosa), entao a ficha
   * do topo e sempre a MENOR da decomposicao — 300 e uma de 250 com uma de 50
   * em cima, e puxar do topo tira 50, nao 250. Sem essa conta, clicar na pilha
   * pra corrigir um clique errado tirava o valor errado e o jogador aprendia a
   * nao clicar ali.
   */
  function tirarDeCima(v) {
    const total = Math.max(0, inteiro(v))
    if (total <= 0) return 0
    let resto = total
    let ultima = 0
    for (let i = FICHAS_MESA.length - 1; i >= 0; i--) {
      const d = FICHAS_MESA[i]
      while (resto >= d) { resto -= d; ultima = d }
    }
    if (!ultima) return 0
    return Math.max(0, total - ultima)
  }

  /** Coordenada de tela do three (-1..1) a partir do evento do mouse. */
  function pontoDaTela(ev) {
    const cv = game && game.renderer ? game.renderer.domElement : null
    const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
    return {
      nx: ((ev.clientX - r.left) / (r.width || 1)) * 2 - 1,
      ny: -((ev.clientY - r.top) / (r.height || 1)) * 2 + 1,
    }
  }

  /** O que esta debaixo do ponteiro NO PANO, ou null. */
  function alvoDoPano(ev) {
    if (!mesaAtiva || !mesaAtiva.mesa || !faixa) return null
    if (ev.target !== faixa.el) return null
    const cam = game && game.camera
    if (!cam) return null
    const p = pontoDaTela(ev)
    return mesaAtiva.mesa.apontar(p.nx, p.ny, cam)
  }

  function aoClicarPano(ev) {
    const alvo = alvoDoPano(ev)
    if (!alvo) return
    chamar(mesaAtiva, 'aoTocar', alvo)
  }

  /** Ponteiro de mao em cima de pilha clicavel: sem isto ninguem descobre que
   *  as fichas do pano respondem ao clique. */
  function aoMoverPano(ev) {
    if (!faixa) return
    faixa.el.style.cursor = alvoDoPano(ev) ? 'pointer' : ''
  }

  function ligarPano(v) {
    if (!faixa) return
    const modo = v ? 'addEventListener' : 'removeEventListener'
    faixa.el[modo]('click', aoClicarPano)
    faixa.el[modo]('mousemove', aoMoverPano)
    if (!v) faixa.el.style.cursor = ''
  }

  /** Viaja pro enquadramento `nome` da mesa no ar, sem soltar a camera. */
  function irPara(nome, tempo) {
    if (!cena || !mesaAtiva || !mesaAtiva.mesa) return
    if (mesaAtiva.quadro === nome) return
    mesaAtiva.quadro = nome
    const q = mesaAtiva.mesa.quadro(nome)
    cena.entrar({
      pos: q.pos, alvo: q.alvo, fov: q.fov,
      tempo: Number.isFinite(tempo) ? tempo : T_TROCA,
      // Paralaxe fraca de proposito: a mesa e um lugar de LER carta, e lente
      // que persegue o ponteiro cansa em uma mao. O suficiente pra nao parecer
      // foto colada, e so.
      paralaxe: 0.55,
    })
  }

  function abrirMesa(quem) {
    if (modo === 'painel') fecharPainel()
    if (modo === 'mesa' && mesaAtiva === quem) return
    if (modo === 'mesa') fecharMesa(true)

    const c = garantirCena()
    const m = garantirMesa3D(quem.nome)
    // Sem camera ou sem ancora de mesa (mundo carregado sem cassino, teste,
    // ferramenta de foto) a mesa nao abre — e melhor nao abrir nada do que
    // travar o jogador numa cena que nao existe.
    if (!c || !m) {
      chamar(game && game.hud, 'toast', 'A mesa esta fechada agora.')
      return
    }
    garantirFaixa()
    ligarPano(true)

    mesaAtiva = quem
    quem.mesa = m
    quem.quadro = null
    modo = 'mesa'
    capturarEntrada()

    // O HUD INTEIRO SOME enquanto a mesa esta no ar, e nao e so estetica: a
    // barra de itens fica exatamente onde a faixa da mesa fica, e o prompt
    // "Jogar Blackjack" continuaria escrito no meio da tela (o main so
    // reescreve o prompt quando nenhuma UI esta aberta). setJogando(false)
    // apaga status, carteira, barra, ajuda, mira e prompt de uma vez — e
    // mantem os toasts, que sao o unico canal de aviso do jogo.
    modoAntes = (game && game.player) ? game.player.mode : null
    chamar(game && game.hud, 'setJogando', false)
    // TERCEIRA PESSOA A FORCA, pelo mesmo motivo pratico: em primeira pessoa o
    // que o jogador segura (garrafa, copo, revolver) e FILHO DA CAMERA — ele
    // viajaria junto com a lente e ficaria pendurado no meio do feltro. Em
    // terceira, mao.js, copo.js e revolver.js escondem sozinhos a peca de mao
    // (todos leem player.mode), e o boneco fica atras da lente, fora do quadro.
    if (modoAntes && modoAntes !== 'third') chamar(game.player, 'setMode', 'third')

    // E O BONECO SOME, que e a correcao de um defeito visto no jogo rodando: na
    // mesa de poker o jogador aparecia como um borrao marrom tapando METADE do
    // quadro. A causa e que a lente da mesa e posicionada a partir da MESA e
    // nao a partir do jogador — entao onde o corpo dele cai depende de onde ele
    // estava em pe quando apertou E, e no poker ele estava a 10 cm da lente.
    //
    // Terceira pessoa continua sendo o modo certo (ver acima: em 1a pessoa o
    // que ele segura e filho da camera e viajaria junto). O que nao da e contar
    // com o corpo ficar atras da lente por sorte. Esconder o boneco resolve os
    // dois casos de uma vez, e a mesa nunca mostra o jogador de todo jeito.
    //
    // Nao ha quem reescreva isto por quadro: setVisibleBody so e chamado por
    // player.setMode e por game.setAppearance — nenhum dos dois roda no laco.
    if (game && game.character && game.character.setVisibleBody) {
      game.character.setVisibleBody(false)
    }
    // O CARTAO DE MISSAO tambem sai. Ele nao mora no HUD (e de ui/tutorial.js),
    // entao o setJogando(false) de cima nao o alcanca — e ele nasce exatamente
    // no canto superior esquerdo, por cima do cabecalho da faixa da mesa. Duas
    // caixas de texto empilhadas no mesmo canto era o que a foto mostrava.
    //
    // Devolver na saida e um `mostrar(true)` sem condicao, e isso e seguro de
    // proposito: ui/tutorial.js nao expoe se estava visivel, mas o `mostrar`
    // dele ja soma as duas razoes de ficar escondido ('fim' e 'vazio') na
    // propria conta — entao pedir true sem objetivo nenhum na fila continua
    // deixando o cartao apagado.
    escondeuTutorial = !!(game && game.tutorial)
    chamar(game && game.tutorial, 'mostrar', false)

    m.entrar()
    chamar(quem, 'aoEntrar')
    faixa.setCabecalho(quem.kicker, quem.titulo)
    faixa.mostrar(true)
    pintarBolsoMesa()

    // A VIAGEM VEM ANTES DO PRIMEIRO RENDER, e nao depois. O render de cada
    // mesa termina pedindo o enquadramento que combina com a fase; se ele
    // rodasse primeiro, esse pedido entraria com o tempo de TROCA (meio
    // segundo) e a viagem de ENTRADA logo em seguida o atropelaria — duas
    // partidas no mesmo quadro, e a primeira aparece como um solavanco.
    const nome = quem.quadroInicial || 'aposta'
    const q = m.quadro(nome)
    quem.quadro = nome
    c.entrar({ pos: q.pos, alvo: q.alvo, fov: q.fov, tempo: T_ENTRAR, paralaxe: 0.55 })
    renderMesa()
  }

  /**
   * A SAIDA, e a ordem dela e a parte delicada do arquivo.
   *
   * `imediato` e pro caso em que outra tela vai assumir a camera agora (o
   * jogador apertou E no caixa com a mesa aberta): ai nao ha viagem de volta,
   * so um corte.
   *
   * No caso normal: esconde a faixa -> pede a viagem de volta -> e SO no fim
   * dela o modo cai pra null e a entrada e devolvida. Enquanto a camera volta,
   * `aberto` continua true, e e isso que impede o main.js de ouvir E, as teclas
   * 1-9 e o clique de tiro no meio do movimento.
   */
  function fecharMesa(imediato) {
    if (modo !== 'mesa') return
    const quem = mesaAtiva
    ligarPano(false)
    chamar(quem, 'aoSair')
    if (faixa) faixa.mostrar(false)
    if (ricaco) ricaco.soltar()
    chamar(game && game.hud, 'setJogando', true)
    // O modo de camera volta AGORA, e nao no fim da viagem: camera-cena
    // interpola ate onde o controller poe a lente NESTE quadro, entao trocar de
    // modo no fim faria a camera chegar num lugar e pular pra outro no ultimo
    // quadro. Voltando antes, a volta ja mira o enquadramento final.
    if (modoAntes && game && game.player && game.player.mode !== modoAntes) {
      chamar(game.player, 'setMode', modoAntes)
    }
    // O BONECO VOLTA AQUI, NA MAO, e nao de carona no setMode acima. setMode
    // desiste na primeira linha quando o modo pedido e o que ja esta valendo
    // (`if (m === mode) return`), e o caso comum e justamente esse — quem entrou
    // na mesa em 3a pessoa sai pra 3a pessoa. Confiar nele deixaria o jogador
    // invisivel pro resto da partida, e num jogo em 3a pessoa isso e fatal.
    if (game && game.character && game.character.setVisibleBody) {
      const m3 = game.player ? game.player.mode : 'third'
      game.character.setVisibleBody(m3 !== 'first')
    }
    if (escondeuTutorial) chamar(game && game.tutorial, 'mostrar', true)
    escondeuTutorial = false
    modoAntes = null

    const encerrar = () => {
      if (quem && quem.mesa) quem.mesa.sair()
      if (mesaAtiva === quem) {
        mesaAtiva = null
        modo = null
      }
      soltarEntrada()
    }

    if (imediato || !cena) {
      if (cena) cena.cortar()
      encerrar()
      return
    }
    // Varre a mesa ANTES de a camera sair: o jogador ve o dealer recolhendo as
    // cartas enquanto a lente recua, que e como se levanta de uma mesa.
    if (quem && quem.mesa) quem.mesa.limparCartas(0)
    cena.sair({ tempo: T_SAIR, aoSair: encerrar })
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
    ? carteira.aoMudar(() => {
      pintarBolso()
      pintarBolsoMesa()
      if (modo === 'painel') renderTela()
      else if (modo === 'mesa') renderMesa()
    })
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
  // MESA 1 — BLACKJACK (OURO), no feltro de verdade
  //
  // A regra continua inteira em cassino/blackjack.js e o dinheiro continua
  // inteiro aqui. O que mudou e o CORPO da coisa: em vez de desenhar a mao numa
  // fileira de divs, esta funcao traduz o snapshot da maquina de estados em
  // "estas cartas estao nesta fila" e deixa cassino/mesa-3d.js descobrir o que
  // mudou e anima-lo.
  //
  // O SUSPENSE TEM DONO, e e o mesmo padrao que o caca-niquel deste arquivo ja
  // usava: quando a mao acaba, o resultado JA EXISTE, mas o pagamento fica
  // PENDENTE ate a ultima carta do dealer pousar. Quem sai da mesa no meio
  // dessa espera perde o suspense, nunca o premio — `aoSair` quita na hora.
  // Sem esse cuidado, apertar Esc um segundo cedo demais engoliria a aposta.
  // -------------------------------------------------------------------------
  function construirMesaBlackjack() {
    let jogo = null
    let aposta = BJ_MIN        // ultima aposta: 'jogar de novo' repete ela
    let pago = false           // o resultado desta mao ja foi lido do modulo?
    let pendente = null        // { rs } resultado lido e ainda nao apresentado
    let varrido = false        // a aposta desta mao ja saiu do feltro?
    let tPagar = 0
    let tVoltar = 0
    let escondidaAntes = true
    let esperaDealer = 0       // segundos ate a ultima carta da casa pousar
    const jaAvisado = new Set()

    const M = {
      nome: 'blackjack',
      // ESTA MESA PASSOU A APOSTAR FICHA, e nao ouro. Era a ultima coisa do
      // cassino que cobrava em dinheiro vivo, e o pedido do dono foi um sistema
      // SO ("quero que aposte fichas no black jack e que tenha um sistema unico
      // tb com as fichas na mesa"). Tambem conserta a queixa antiga por tabela:
      // quem trocava tudo no caixa pra jogar poker chegava aqui e encontrava a
      // mesa travada sem entender por que.
      moeda: 'ficha',
      kicker: 'MESA DA ATENDENTE',
      titulo: 'Blackjack',
      quadroInicial: 'jogo',
      mesa: null,
      quadro: null,
    }

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

    function limparRelogios() {
      clearTimeout(tPagar); tPagar = 0
      clearTimeout(tVoltar); tVoltar = 0
    }

    function comecar() {
      const v = Math.max(0, Math.min(BJ_MAX, inteiro(aposta)))
      if (v < BJ_MIN) { faixa.setRecado('A mesa nao aceita menos que ' + BJ_MIN + '.', 'ruim'); return }
      const j = garantirJogo(true)
      // 1) cobra  2) so entao reparte. Nunca ao contrario.
      if (!chamar(carteira, 'gastarFichas', v)) {
        faixa.setRecado('Fichas insuficientes. Passe no caixa ou aposte menos.', 'ruim')
        return
      }
      // Daqui pra baixo a ficha JA SAIU: 'pago' so cai depois da cobranca porque
      // gastarFichas avisa a carteira, que redesenha a mesa — e um render com a
      // mao anterior ainda em 'fim' e 'pago' zerado leria o placar duas vezes.
      quitarMao()
      limparRelogios()
      aposta = v
      pago = false
      varrido = false
      escondidaAntes = true
      jaAvisado.clear()
      if (M.mesa) M.mesa.limparCartas(0)
      // sapato passou do corte: embaralha ANTES de repartir, nunca no meio
      if (baralhoBJ && baralhoBJ.precisaEmbaralhar) {
        chamar(baralhoBJ, 'embaralhar')
        faixa.setRecado('Baralho novo na mesa.', '')
      } else {
        faixa.setRecado('')
      }
      chamar(carteira, 'contarMao')
      chamar(j, 'comecar', v)
      // A mesa recusou (aposta fora do limite, sei la): devolve a ficha na hora.
      const depois = chamar(j, 'estado')
      if (!depois || depois.fase === 'aposta') {
        chamar(carteira, 'ganharFichas', v)
        pago = true
        faixa.setRecado('A mesa nao aceitou essa aposta. Fichas devolvidas.', 'ruim')
      }
      // Quem move a lente daqui pra frente e o render, por quadroBase().
      renderMesa()
    }

    function acao(nome) {
      const j = garantirJogo()
      const est = chamar(j, 'estado')
      if (!est || !Array.isArray(est.acoes) || est.acoes.indexOf(nome) < 0) return
      if (nome === 'dobrar' || nome === 'dividir') {
        const custo = Math.max(0, inteiro(chamar(j, 'custoExtra')))
        // Cobra ANTES: se a carteira recusar, o botao simplesmente nao acontece
        // e a mao segue exatamente como estava.
        if (custo > 0 && !chamar(carteira, 'gastarFichas', custo)) {
          faixa.setRecado('Fichas insuficientes pra ' + nome + '.', 'ruim')
          return
        }
        faixa.setRecado(nome === 'dobrar'
          ? 'Dobrou: -' + num(custo) + ' em fichas.'
          : 'Dividiu: -' + num(custo) + ' em fichas.', '')
      }
      chamar(j, nome)
      renderMesa()
    }

    function rotuloResultado(t) {
      if (t === 'blackjack') return 'BLACKJACK'
      if (t === 'ganhou') return 'VOCE GANHOU'
      if (t === 'perdeu') return 'A CASA LEVOU'
      if (t === 'empate') return 'EMPATE'
      if (t === 'estourou') return 'ESTOUROU'
      return String(t || '')
    }

    /**
     * Le o resultado da mao, PAGA e mostra o dinheiro andando no feltro.
     *
     * Idempotente de proposito (sai fora se 'pendente' for null): ela e chamada
     * pelo relogio da revelacao, por comecar() e por aoSair(), e pagar duas
     * vezes seria o pior defeito que este arquivo pode ter.
     */
    function quitarMao() {
      if (!pendente) return
      const rs = pendente.rs
      pendente = null
      clearTimeout(tPagar); tPagar = 0
      const m = M.mesa
      let total = 0
      let apostado = 0
      let melhor = ''
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i]
        const ganho = inteiro(chamar(carteira, 'ganharFichas', r.retorno))
        total += ganho
        apostado += inteiro(r.aposta)
        if (r.tipo === 'blackjack') melhor = 'blackjack'
        else if (r.tipo === 'ganhou' && melhor !== 'blackjack') melhor = 'ganhou'
        else if (!melhor) melhor = r.tipo
        if (!m) continue
        const slot = i === 0 ? 'aposta' : 'aposta1'
        const slotPago = i === 0 ? 'pago' : 'pago1'
        // O pagamento nasce ao lado da aposta que ele paga: com a mesa dividida
        // a primeira aposta esta deslocada, e o pagamento dela acompanha.
        const xPago = i === 0 ? (rs.length > 1 ? 0.445 : 0.185) : -0.445
        if (ganho > 0) {
          // A CASA PAGA AO LADO da sua aposta e so entao tudo desliza pra voce.
          // E o gesto de mesa de verdade, e e o unico jeito de o jogador VER
          // que levou o dobro em vez de so ver um numero mudar no rodape.
          const lucro = Math.max(0, ganho - inteiro(r.aposta))
          let at = 0
          if (lucro > 0) at = m.fichas(slotPago, lucro, { de: 'casa', x: xPago })
          m.varrer(slot, 'jogador', at + 0.32)
          m.varrer(slotPago, 'jogador', at + 0.32)
        } else {
          m.varrer(slot, 'casa', 0.12 + i * 0.10)
        }
      }
      varrido = true

      if (m) {
        if (melhor === 'blackjack') { m.acender(0xffe0a0, 1.0, 1.5); m.tremer(0.35) }
        else if (total > apostado) m.acender(0x9fe6b4, 0.5, 0.9)
      }
      if (total > 0) {
        faixa.setRecado('Voce recebeu ' + num(total) + ' em fichas.', 'bom')
        faixa.anunciar(rotuloResultado(melhor), melhor === 'blackjack' ? 'top' : '',
          '+' + num(total) + ' em fichas')
        if (melhor === 'blackjack') { somMesa.dourado(0.05); faixa.piscar('bom') }
        else somMesa.selo(0.05)
      } else {
        faixa.setRecado('A casa levou essa. A proxima e sua.', 'ruim')
        faixa.anunciar(rotuloResultado(melhor || 'perdeu'), 'ruim', '-' + num(apostado) + ' em fichas')
        somMesa.selo(0.05)
      }
      renderMesa()
    }

    /**
     * Efeito de mao, disparado no INSTANTE em que a carta que causou o efeito
     * pousa (mesa-3d chama isto de volta). Estourar so tem peso se o baque e o
     * tremor caem junto com a carta que estourou.
     */
    function avaliarMao(i) {
      const est = jogo ? chamar(jogo, 'estado') : null
      const m = M.mesa
      if (!est || !m) return
      const mm = (est.maos || [])[i]
      if (!mm) return
      const marcaBj = 'bj' + i
      const marcaEs = 'es' + i
      if (mm.blackjack && !jaAvisado.has(marcaBj)) {
        jaAvisado.add(marcaBj)
        m.acender(0xffe0a0, 1.0, 1.4)
        m.tremer(0.42)
        somMesa.dourado(0)
        faixa.piscar('bom')
        faixa.anunciar('BLACKJACK', 'top', 'paga 3 para 2')
      } else if (mm.estourou && !jaAvisado.has(marcaEs)) {
        jaAvisado.add(marcaEs)
        m.tremer(0.85)
        somMesa.baque(0)
        faixa.piscar('ruim')
        faixa.anunciar('ESTOUROU', 'ruim', String(inteiro(mm.valor)))
      }
    }

    /**
     * O enquadramento que combina com a fase. Nao e chamado so no comeco: o
     * render termina pedindo ele, e como irPara() nao faz nada quando ja se
     * esta la, a lente se conserta sozinha depois de qualquer mergulho.
     */
    function quadroBase() {
      const est = jogo ? chamar(jogo, 'estado') : null
      // 'aposta' saiu da rotacao: o caixote de fichas tem que estar no quadro
      // pra o jogador apostar, e ele so cabe na lente de 'jogo'. Recuar entre
      // maos era, alem disso, o mesmo vaivem de lente que o dono ja reclamou no
      // poker. Sobrou uma lente pra mao normal e uma pro split.
      return (est && est.maos && est.maos.length > 1) ? 'duas' : 'jogo'
    }

    /** Quanto de ficha esta no circulo de aposta de cada mao, agora. */
    function apostaNoFeltro(est, fase, i) {
      if (varrido) return 0
      if (!est || fase === 'aposta') return i === 0 ? Math.max(0, inteiro(aposta)) : 0
      const mm = (est.maos || [])[i]
      return mm ? Math.max(0, inteiro(mm.aposta)) : 0
    }

    function render() {
      const m = M.mesa
      if (!m || !faixa) return
      const est = jogo ? chamar(jogo, 'estado') : null
      const fase = est ? est.fase : 'aposta'
      // 'bolso' e o que sobra NA CARTEIRA; a aposta que ainda esta em cima do
      // pano nao saiu dela. Quem manda no caixote e a diferenca dos dois, senao
      // o jogador ve a mesma ficha duas vezes: uma na pilha da aposta e outra
      // ainda no caixote, como se ele pudesse gastar de novo.
      const bolso = carteira ? carteira.fichas : 0

      // --- a casa -----------------------------------------------------------
      let escondida = true
      let valorCasa = '-'
      if (est) {
        const d = est.dealer || { cartas: [] }
        const cartas = Array.isArray(d.cartas) ? d.cartas : []
        escondida = !!d.escondida
        const defs = []
        if (escondida) {
          // O modulo pode guardar a 2a carta no array (marcada como segredo) ou
          // segurar ela fora dele. Os dois casos desenham a MESMA coisa aqui.
          const visiveis = Math.max(1, Math.min(cartas.length, 1))
          for (let i = 0; i < visiveis; i++) defs.push(def(cartas[i], false))
          defs.push(def(null, true))
          valorCasa = String(valorVisivel(cartas, visiveis)) + ' + ?'
        } else {
          for (let i = 0; i < cartas.length; i++) defs.push(def(cartas[i], false))
          valorCasa = cartas.length ? String(inteiro(d.valor)) : '-'
        }
        esperaDealer = m.cartas('dealer', defs)
      } else {
        m.cartas('dealer', [])
        esperaDealer = 0
      }

      // --- minhas maos -------------------------------------------------------
      const maos = (est && Array.isArray(est.maos)) ? est.maos : []
      const partido = maos.length > 1
      for (let i = 0; i < 2; i++) {
        const slot = i === 0 ? 'mao0' : 'mao1'
        const mm = maos[i]
        if (!mm) { m.cartas(slot, []); continue }
        const cartas = Array.isArray(mm.cartas) ? mm.cartas : []
        const defs = []
        for (let k = 0; k < cartas.length; k++) defs.push(def(cartas[k], false))
        // Dividiu: a primeira mao sai do meio pra abrir espaco pra segunda. O
        // leque encolhe junto (o layout ja da um passo menor pra mao1), senao
        // as duas maos se tocam com tres cartas cada.
        m.cartas(slot, defs, {
          x: i === 0 ? (partido ? 0.20 : 0) : undefined,
          aoRevelar: () => avaliarMao(i),
        })
      }
      m.destacar(est && est.maoAtual === 1 ? 'mao1' : 'mao0',
        partido && fase === 'jogador')

      // --- fichas no feltro --------------------------------------------------
      // Dividiu: a aposta da primeira mao acompanha a mao dela pro lado. O
      // deslocamento so pega com a pilha vazia, que e sempre o caso aqui — o
      // split acontece com a mesa ja apostada e a pilha nova comeca do zero.
      m.fichas('aposta', apostaNoFeltro(est, fase, 0),
        { de: 'jogador', x: partido ? 0.26 : 0.00 })
      m.fichas('aposta1', apostaNoFeltro(est, fase, 1), { de: 'jogador' })

      // A VIRADA DA CARTA TAPADA NAO MEXE MAIS A CAMERA. Havia um mergulho
      // ('revelar', fov 26) que caia na mao da casa e voltava; ele saiu junto
      // com os dois mergulhos do poker, pela mesma queixa ("aproxima demais e
      // depois afasta demais"). Quem faz a revelacao agora e a propria mao da
      // casa: ela esta deitada enquanto ha carta tapada e ESCORA no instante em
      // que a ultima ganha face (LAYOUT.blackjack.filas.dealer tem 'inclina' e
      // nao tem 'inclinaVerso'), o que dobra o tamanho dela na tela sem a lente
      // andar um centimetro.
      escondidaAntes = escondida

      // --- fim da mao: le UMA vez e agenda a apresentacao ---------------------
      if (est && fase === 'fim' && !pago) {
        pago = true
        pendente = { rs: Array.isArray(est.resultados) ? est.resultados.slice() : [] }
        clearTimeout(tPagar)
        // 0.8 s e o voo mais o giro da ultima carta; T_REVELACAO e a pausa que
        // separa "a carta caiu" de "e agora o resultado".
        tPagar = setTimeout(quitarMao,
          Math.max(900, Math.round((esperaDealer + 0.8) * 1000) + T_REVELACAO))
      }

      // --- a faixa ------------------------------------------------------------
      // O 'fim' TAMBEM E FASE DE APOSTA — e isso conserta o defeito relatado
      // ("no black jack nao consigo apostar as fichas").
      //
      // Antes: 'apostando' era so `!est || fase === 'aposta'`, e a mesa nunca
      // volta pra 'aposta' sozinha — quem reinicia o modulo e comecar(). Entao
      // depois da PRIMEIRA mao a fileira de fichas sumia e nao voltava mais:
      // sobrava um JOGAR DE NOVO que repetia eternamente o mesmo valor. Sair da
      // mesa e voltar tambem nao resolvia, porque a mao terminada fica guardada
      // de proposito (quem aperta Esc sem querer nao perde a aposta) e o render
      // de volta lia 'fim' de novo. Sem recarregar a pagina, o jogador escolhia
      // a aposta UMA vez por sessao.
      const apostando = !est || fase === 'aposta' || fase === 'fim'
      // Aparar a aposta pelo saldo so vale enquanto ela AINDA PODE SER GASTA.
      // No meio da mao a ficha ja saiu, entao 'bolso' e o que sobrou DEPOIS de
      // pagar — cortar a aposta ali zerava ela em toda mao apostada por inteiro,
      // e o jogador terminava com o premio no bolso e um JOGAR DE NOVO
      // desabilitado por um valor que ele nunca escolheu.
      const emJogo = fase === 'jogador' || fase === 'dealer'
      if (!emJogo && aposta > bolso) aposta = Math.min(BJ_MAX, bolso)
      // Caminho de volta: passar no caixa e voltar tem que destravar a mesa.
      if (fase === 'fim' && aposta < BJ_MIN && bolso >= BJ_MIN) aposta = BJ_MIN

      const fim = fase === 'fim'
      faixa.setBolso(carteira ? carteira.ouro : 0, bolso, 'ficha')
      const minha = maos.length ? maos[Math.max(0, est.maoAtual)] || maos[0] : null
      if (apostando) {
        faixa.setValor(fim ? 'Proxima aposta' : 'Sua aposta', aposta,
          aposta >= BJ_MAX ? 'teto da mesa' : 'em fichas')
      } else {
        faixa.setValor('Voce', minha ? inteiro(minha.valor) : 0,
          'casa ' + valorCasa + (minha && minha.macio ? '  ·  macio' : ''))
      }

      // O CAIXOTE. Fora da fase de aposta ele some: ficha clicavel no meio de
      // uma mao ja repartida so ensina a clicar a toa, e a pilha vazia deixa o
      // pano limpo pras cartas, que sao o assunto naquele instante.
      m.caixote(FICHAS_MESA, apostando ? Math.max(0, bolso - aposta) : 0)

      if (apostando && bolso < BJ_MIN) {
        faixa.setRecado(carteira && carteira.ouro >= BJ_MIN
          ? 'Sem fichas na mesa. O caixa troca ouro por ficha.'
          : 'Sem fichas pra apostar. Passe no caixa.', 'ruim')
      } else if (apostando && aposta <= 0) {
        faixa.setRecado('Clique nas suas fichas na mesa pra apostar.', '')
      } else if (!est) faixa.setRecado('Mande distribuir.', '')
      else if (!fim && est.mensagem) faixa.setRecado(est.mensagem, '')

      const acoes = (est && Array.isArray(est.acoes)) ? est.acoes : []
      const extra = (est && fase === 'jogador') ? Math.max(0, inteiro(chamar(jogo, 'custoExtra'))) : 0
      faixa.ajustar('limpar', { ver: apostando, ligado: aposta > 0 })
      // UM BOTAO SO PRA REPARTIR. 'dar' cobre a mesa vazia e o 'fim' — com a
      // aposta editavel no fim, um JOGAR DE NOVO separado nao repetiria mais
      // "a mesma aposta" e viraria um segundo botao dizendo a mesma coisa —
      // por isso ele saiu e este aqui so troca de rotulo.
      const podeDar = aposta >= BJ_MIN && aposta <= bolso
      faixa.ajustar('dar', {
        ver: apostando,
        ligado: podeDar,
        txt: aposta >= BJ_MIN
          ? (fim ? 'JOGAR DE NOVO (' + num(aposta) + ')' : 'DISTRIBUIR (' + num(aposta) + ')')
          : 'DISTRIBUIR',
        chama: podeDar,
      })
      faixa.ajustar('limpar', { ver: apostando, ligado: aposta > 0 })
      // TUDO e o all-in da mesa: o teto e o MENOR entre o que sobra na carteira
      // e o maximo que a mesa aceita. Sem a segunda metade, quem tem 20 mil
      // apertava TUDO e a mesa recusava a aposta calada.
      const tetoBJ = Math.min(bolso, BJ_MAX)
      faixa.ajustar('tudo', {
        ver: apostando,
        ligado: tetoBJ >= BJ_MIN && aposta !== tetoBJ,
        txt: 'TUDO (' + num(tetoBJ) + ')',
      })
      faixa.ajustar('pedir', { ver: !apostando, ligado: acoes.indexOf('pedir') >= 0 })
      faixa.ajustar('parar', { ver: !apostando, ligado: acoes.indexOf('parar') >= 0 })
      faixa.ajustar('dobrar', {
        ver: !apostando,
        ligado: acoes.indexOf('dobrar') >= 0,
        txt: extra > 0 ? 'DOBRAR (' + num(extra) + ')' : 'DOBRAR',
      })
      faixa.ajustar('dividir', {
        ver: !apostando,
        ligado: acoes.indexOf('dividir') >= 0,
        txt: extra > 0 ? 'DIVIDIR (' + num(extra) + ')' : 'DIVIDIR',
      })
      faixa.setDica('Sapato: ' + (baralhoBJ ? inteiro(baralhoBJ.restantes) : 0) +
        ' cartas  ·  a casa para em qualquer 17  ·  Esc sai da mesa')

      // A lente sempre volta pro enquadramento da fase — a nao ser que um
      // mergulho esteja em curso, e ai quem devolve a lente e o relogio dele.
      if (!tVoltar) irPara(quadroBase(), T_TROCA)
    }

    M.render = render

    /**
     * CLIQUE NUMA PILHA DO PANO. E a unica forma de apostar nesta mesa agora.
     *
     * Clicar no caixote EMPILHA, como numa mesa de verdade: subir a aposta e um
     * gesto repetido, nao um numero que se escolhe de uma vez. Clicar na PILHA
     * DA APOSTA tira a ficha de cima — e o gesto inverso, e existe pra o
     * jogador poder corrigir sem zerar tudo no LIMPAR.
     */
    M.aoTocar = (alvo) => {
      const est = jogo ? chamar(jogo, 'estado') : null
      const fase = est ? est.fase : 'aposta'
      if (est && fase !== 'aposta' && fase !== 'fim') return
      const bolso = carteira ? carteira.fichas : 0
      if (alvo.tipo === 'caixote') {
        const v = Math.max(1, inteiro(alvo.v))
        if (aposta + v > BJ_MAX) {
          faixa.setRecado('O teto da mesa e ' + num(BJ_MAX) + '.', 'ruim')
          renderMesa()
          return
        }
        if (aposta + v > bolso) {
          faixa.setRecado('Voce nao tem ficha de ' + num(v) + ' sobrando.', 'ruim')
          renderMesa()
          return
        }
        aposta += v
        renderMesa()
        return
      }
      if (alvo.tipo === 'aposta') { aposta = tirarDeCima(aposta); renderMesa() }
    }

    M.aoEntrar = () => {
      M.mesa.montarAlvos(FICHAS_MESA)
      faixa.definirBotoes([
        { id: 'limpar', txt: 'LIMPAR', cls: 'fantasma', ao: () => { aposta = 0; renderMesa() } },
        { id: 'tudo', txt: 'TUDO', cls: 'fantasma', ao: () => {
          aposta = Math.min(carteira ? carteira.fichas : 0, BJ_MAX)
          renderMesa()
        } },
        { id: 'dar', txt: 'DISTRIBUIR', cls: 'ouro grande', ao: comecar },
        { id: 'pedir', txt: 'PEDIR', cls: 'verde grande', ao: () => acao('pedir') },
        { id: 'parar', txt: 'PARAR', cls: '', ao: () => acao('parar') },
        { id: 'dobrar', txt: 'DOBRAR', cls: '', ao: () => acao('dobrar') },
        { id: 'dividir', txt: 'DIVIDIR', cls: '', ao: () => acao('dividir') },
        { id: 'sair', txt: 'SAIR DA MESA', cls: 'bordo', ao: () => fechar() },
      ])
      escondidaAntes = true
    }

    // Sair no meio da espera nao pode comer o premio: quita antes de tudo.
    M.aoSair = () => { quitarMao(); limparRelogios() }

    M.principal = () => {
      const est = jogo ? chamar(jogo, 'estado') : null
      if (!est || est.fase === 'aposta' || est.fase === 'fim') return faixa.botao('dar')
      return faixa.botao('pedir')
    }

    return M
  }

  // -------------------------------------------------------------------------
  // MESA 2 — POKER HEADS-UP DE 2 CARTAS (FICHAS)
  //
  // A diferenca em relacao ao blackjack nao e de regra, e de COMPOSICAO: aqui
  // ha um adversario, e ele e metade do jogo. A lente do 'jogo' tem que caber o
  // ricaco inteiro do outro lado do feltro E o caixote de fichas do meu lado —
  // sao 2,5 m de profundidade num quadro so, e quem paga essa conta e a carta
  // ficar de pe em vez de deitada. Os numeros estao medidos em
  // cassino/mesa-3d.js; nao ha mergulho nenhum, a lente nao se mexe.
  //
  // POR QUE O JOGADOR NAO SENTA NA CADEIRA. Chegou-se a usar player.sitOn na
  // cadeira vazia que world/casino.js ja deixa pronta ali. O problema e
  // geometrico: pra caber o ricaco, a lente precisa ficar POR CIMA DO OMBRO do
  // jogador, uns 60 cm atras da cadeira. Com o boneco sentado, a cabeca dele
  // fica entre a lente e o feltro e tapa justamente as duas cartas do jogador.
  // Em pe, ele fica ATRAS da lente e some do quadro. Sentar so ficaria bem com
  // a camera na altura do olho de quem esta sentado — e ai o ricaco nao cabe.
  // -------------------------------------------------------------------------
  function construirMesaPoker() {
    let jogo = null
    const ante = ANTE_POKER
    let entradaPaga = 0        // quanto ja saiu da carteira NESTA mao
    let pago = false           // resultado ja creditado?
    let pendente = null
    // O QUE ESTA NO PANO E AINDA NAO FOI APOSTADO. Substituiu o antigo 'subida'
    // (um tamanho de aumento escolhido num botao): agora o valor da jogada e a
    // pilha que o jogador monta clicando nas proprias fichas. Ele volta a zero
    // em toda acao e em toda mao nova — ficha esquecida no pano de uma mao pra
    // outra seria dinheiro apostado sem ninguem ter mandado.
    let naMesa = 0
    let fichasDele = 2000      // a banca dele atravessa as maos
    let tPagar = 0
    let tMao = 0               // relogio da proxima mao (a mesa reparte sozinha)
    let ultimaFala = ''

    const M = {
      nome: 'poker',
      moeda: 'ficha',
      kicker: 'MESA DE POKER',
      titulo: NOME_NPC_POKER,
      quadroInicial: 'jogo',
      mesa: null,
      quadro: null,
    }

    function limparRelogios() {
      clearTimeout(tPagar); tPagar = 0
      clearTimeout(tMao); tMao = 0
    }

    /**
     * Marca a proxima mao. E o coracao do "igual poker stars": ninguem manda
     * repartir, a mesa reparte. Chamada na entrada e no fim de cada mao.
     *
     * Ela e a UNICA porta pra comecar(), e por isso e aqui que mora a checagem
     * de saldo: sem fichas, nao se marca nada e a faixa fica dizendo o que
     * fazer. Sem essa trava, uma mesa que reparte sozinha viraria um laco de
     * "fichas insuficientes" a cada 2,6 segundos.
     */
    function agendarMao(ms) {
      clearTimeout(tMao)
      tMao = 0
      if (!carteira || !carteira.temFichas(ante)) return
      tMao = setTimeout(() => { tMao = 0; comecar() }, Math.max(0, ms))
    }

    function comecar() {
      if (!baralhoPk) baralhoPk = criarBaralho(1)
      const v = Math.max(1, inteiro(ante))
      if (!chamar(carteira, 'temFichas', v)) {
        faixa.setRecado('Fichas insuficientes pra entrar na mao. Passe no caixa.', 'ruim')
        renderMesa()
        return
      }
      // 1) cobra a ante  2) so entao cria a mao (comecar() cobra a dele)
      if (!chamar(carteira, 'gastarFichas', v)) {
        faixa.setRecado('Fichas insuficientes.', 'ruim')
        renderMesa()
        return
      }
      quitarMao()
      limparRelogios()
      if (baralhoPk && baralhoPk.precisaEmbaralhar) chamar(baralhoPk, 'embaralhar')
      pago = false
      naMesa = 0
      ultimaFala = ''
      if (M.mesa) { M.mesa.limparCartas(0); M.mesa.limparFichas() }
      jogo = criarPoker({ baralho: baralhoPk, aposta: v, fichasNpc: fichasDele })
      chamar(carteira, 'contarMao')
      chamar(jogo, 'comecar')
      // Baliza da cobranca: o que o modulo ja conta como minha entrada agora e
      // exatamente a ante que EU acabei de pagar. Tudo acima disso e que sera
      // debitado dali pra frente.
      const est = chamar(jogo, 'estado')
      entradaPaga = est ? Math.max(0, inteiro(est.minhaEntrada)) : v
      faixa.setRecado('')
      renderMesa()
      // NAO HA MERGULHO DE LENTE AQUI, e a ausencia dele e a correcao.
      // Havia dois — um caindo nas minhas cartas depois de repartir, outro
      // atravessando a mesa no showdown — e o dono descreveu o par como
      // "aproxima demais nas cartas e quando afasta, afasta muito". Quem
      // resolve a leitura da carta agora e a INCLINACAO dela no feltro (ver
      // LAYOUT.poker.filas em cassino/mesa-3d.js), com a lente parada.
    }

    function novaMao() {
      // A banca dele atravessa as maos: e o que faz "quebrar o ricaco" ser um
      // objetivo, em vez de cada mao comecar do zero contra um cofre infinito.
      const est = jogo ? chamar(jogo, 'estado') : null
      if (est) fichasDele = Math.max(0, inteiro(est.fichasNpc))
      quitarMao()
      jogo = null
      pago = false
      if (carteira && carteira.temFichas(ante)) { comecar(); return }
      faixa.setRecado('Fichas insuficientes pra entrar na mao. Passe no caixa.', 'ruim')
      renderMesa()
    }

    /**
     * Quanto essa acao vai custar de ficha. Quem responde e o modulo —
     * custoExtra(acao, valor) ja aplica o limite da mesa, entao pedir 25 numa
     * mesa de minimo 50 devolve 50 e o botao mostra o numero VERDADEIRO.
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
        faixa.setRecado('Suas fichas acabaram no meio da mao.', 'ruim')
      }
      entradaPaga = alvo
    }

    function acao(nome) {
      if (!jogo) return
      const est = chamar(jogo, 'estado')
      if (!est || !Array.isArray(est.acoes) || est.acoes.indexOf(nome) < 0) return
      const aposta = nome === 'apostar' || nome === 'aumentar'
      const valor = Math.max(1, inteiro(naMesa))
      if (aposta && naMesa <= 0) {
        faixa.setRecado('Empurre fichas pra mesa primeiro.', 'ruim')
        return
      }
      const custo = custoDe(nome, valor)
      if (custo > 0 && !chamar(carteira, 'temFichas', custo)) {
        faixa.setRecado('Fichas insuficientes: essa jogada custa ' + num(custo) + '.', 'ruim')
        return
      }
      // O PANO ESVAZIA ANTES da jogada, e nao depois: acertarEntrada() cobra a
      // carteira contra o que o modulo diz que ja esta no pote, e a pilha do
      // feltro e desenhada como 'minhaEntrada + naMesa'. Zerar so no fim
      // desenharia a aposta duas vezes no quadro do meio.
      naMesa = 0
      if (aposta) chamar(jogo, nome, valor)
      else chamar(jogo, nome)
      // O NPC responde dentro da propria chamada; aqui so acertamos o caixa.
      acertarEntrada()
      renderMesa()
    }

    /**
     * O TETO DO ALL-IN nesta mesa. Nao e o saldo: o modulo limita toda aposta
     * ao tamanho do pote e ao que o adversario tem (limitarAposta em
     * cassino/poker.js), entao empurrar 20 mil numa mesa de pote 50 daria uma
     * aposta de 50 e um monte de ficha voltando sozinha. Perguntar o custo real
     * pro modulo e a unica forma de o botao TUDO nunca mentir o numero.
     */
    function tetoDaMesa() {
      const est = jogo ? chamar(jogo, 'estado') : null
      if (!est) return 0
      const saldo = carteira ? carteira.fichas : 0
      if (saldo <= 0) return 0
      const nome = (est.acoes || []).indexOf('aumentar') >= 0 ? 'aumentar' : 'apostar'
      const bruto = Math.max(0, inteiro(chamar(jogo, 'custoExtra', nome, saldo)))
      // custoExtra devolve o CUSTO (a diferenca a pagar + a subida). O que vai
      // pro pano e a subida: descontar o que falta pagar evita o pano mostrar
      // mais ficha do que a jogada vale.
      const falta = nome === 'aumentar' ? Math.max(0, inteiro(est.paraPagar)) : 0
      return Math.max(0, Math.min(saldo, bruto - falta))
    }

    function nomeMao(m) {
      if (!m) return ''
      if (typeof m === 'string') return m
      return String(m.nome || '')
    }

    function rotuloResultado(t) {
      if (t === 'ganhou') return 'VOCE LEVOU O POTE'
      if (t === 'perdeu') return 'ELE LEVOU O POTE'
      if (t === 'empate') return 'EMPATE'
      if (t === 'desistiu') return 'VOCE CORREU'
      if (t === 'ele-desistiu') return 'ELE CORREU'
      return String(t || '')
    }

    /** O corpo do ricaco responde ao que acabou de acontecer na mesa. */
    function reagir(est) {
      const r = garantirRicaco()
      if (!r || !r.disponivel) return
      if (!est) { r.gesto('repouso'); return }
      if (est.resultado) {
        const t = est.resultado.tipo
        if (t === 'ele-desistiu') r.gesto('recua')
        else if (t === 'ganhou') r.gesto('perde')
        else if (t === 'perdeu' || t === 'desistiu') r.gesto('ganha')
        else r.gesto('olha')
        return
      }
      const msg = String(est.mensagem || '')
      if (msg.indexOf('aumentou') >= 0 || msg.indexOf('apostou') >= 0) r.gesto('aposta')
      else if (msg.indexOf('passou') >= 0) r.gesto('apoia')
      else if (est.fase === 'npc') r.gesto('pensa')
      else r.gesto('olha')
    }

    function quitarMao() {
      if (!pendente) return
      const r = pendente.r
      pendente = null
      clearTimeout(tPagar); tPagar = 0
      const m = M.mesa
      const ganho = inteiro(chamar(carteira, 'ganharFichas', r.retorno))
      if (m) {
        const destino = ganho > 0 ? 'jogador' : 'casa'
        m.varrer('minha', destino, 0.05)
        m.varrer('dele', destino, 0.14)
        if (ganho > 0) m.acender(0x9fe6b4, 0.7, 1.1)
      }
      const sub = nomeMao(r.minhaMao) && nomeMao(r.maoDele)
        ? nomeMao(r.minhaMao) + '  x  ' + nomeMao(r.maoDele)
        : (ganho > 0 ? '+' + num(ganho) + ' em fichas' : '')
      if (ganho > 0) {
        faixa.setRecado('Voce recebeu ' + num(ganho) + ' em fichas.', 'bom')
        faixa.anunciar(rotuloResultado(r.tipo), 'top', sub)
        somMesa.dourado(0.05)
        faixa.piscar('bom')
      } else {
        faixa.setRecado('Essa foi dele.', 'ruim')
        faixa.anunciar(rotuloResultado(r.tipo), 'ruim', sub)
        somMesa.selo(0.05)
      }
      // A mao acabou de ser paga: a mesa ja marca a proxima. Ninguem aperta
      // botao pra jogar de novo — quem quer sair usa SAIR DA MESA, que e o
      // gesto certo, e quem so quer a proxima nao faz nada.
      agendarMao(T_PROXIMA_MAO)
      renderMesa()
    }

    function render() {
      const m = M.mesa
      if (!m || !faixa) return
      const est = jogo ? chamar(jogo, 'estado') : null
      const fase = est ? est.fase : 'aposta'
      const meuSaldo = carteira ? carteira.fichas : 0

      // --- cartas dele: dois versos ate o showdown ---------------------------
      const dele = (est && Array.isArray(est.dele)) ? est.dele : []
      const revelado = dele.length >= 2
      if (!est) m.cartas('ele', [])
      else if (revelado) m.cartas('ele', [def(dele[0], false), def(dele[1], false)])
      else m.cartas('ele', [def(null, true), def(null, true)])

      // --- minhas cartas ------------------------------------------------------
      const minhas = (est && Array.isArray(est.minhas)) ? est.minhas : []
      const defsEu = []
      for (let i = 0; i < minhas.length; i++) defsEu.push(def(minhas[i], false))
      m.cartas('eu', defsEu)

      // --- as duas pilhas do pote, mais o que EU acabei de empurrar ----------
      //
      // 'naMesa' sao as fichas que o jogador tirou do caixote e ainda NAO
      // apostou. Elas entram na MESMA pilha da minha entrada de proposito: numa
      // mesa de verdade a ficha empurrada pra frente ja esta ali, e uma segunda
      // pilha de "quase aposta" ao lado seria uma invencao de interface. O
      // numero do botao (APOSTAR 150) e quem diz que ainda da pra voltar atras.
      m.fichas('minha', (est ? Math.max(0, inteiro(est.minhaEntrada)) : 0) + naMesa, { de: 'jogador' })
      m.fichas('dele', est ? Math.max(0, inteiro(est.entradaDele)) : 0, { de: 'casa' })

      // O SHOWDOWN NAO MEXE A CAMERA. Quem mostra a mao dele e a propria mesa:
      // as duas cartas viram e ESCORAM (LAYOUT.poker.filas.ele tem 'inclina' e
      // nao tem 'inclinaVerso'), o que as triplica na tela sem a lente andar.

      // --- fim: le UMA vez e agenda a apresentacao -----------------------------
      if (est && est.resultado && !pago) {
        pago = true
        pendente = { r: est.resultado }
        fichasDele = Math.max(0, inteiro(est.fichasNpc))
        clearTimeout(tPagar)
        tPagar = setTimeout(quitarMao, revelado ? T_REVELACAO + 700 : 500)
      }

      // --- o ricaco -----------------------------------------------------------
      const fala = est ? String(est.mensagem || '') + '|' + String(est.fala || '') : ''
      if (fala !== ultimaFala) { ultimaFala = fala; reagir(est) }

      // --- a faixa -------------------------------------------------------------
      const emMao = !!est && fase !== 'fim'
      const fim = !!est && fase === 'fim'
      const semFichas = !carteira || !carteira.temFichas(ante)

      // A MESA SE REPARTE SOZINHA, e este e o ponto onde ela se conserta.
      // quitarMao() ja marca a proxima, mas ha dois caminhos que chegam aqui
      // sem passar por ela: entrar na mesa, e voltar do caixa depois de ter
      // ficado sem ficha no meio da sessao. Marcar daqui cobre os dois sem
      // ninguem precisar lembrar de chamar agendarMao em cada um.
      if (!est && !tMao && !semFichas) agendarMao(600)

      faixa.setBolso(carteira ? carteira.ouro : 0, meuSaldo, 'ficha')
      if (!est) {
        faixa.setValor('Entrada da mesa', ante, 'em fichas')
        if (semFichas) faixa.setRecado('Sem fichas pra entrar na mao. Passe no caixa.', 'ruim')
        else faixa.setRecado('Repartindo...', '')
      } else {
        faixa.setValor('Pote', inteiro(est.pote),
          est.paraPagar > 0 ? 'pra pagar ' + num(est.paraPagar) : ('ele tem ' + num(est.fichasNpc)))
        if (!fim && est.mensagem) faixa.setRecado(est.mensagem, '')
      }

      // O CAIXOTE so aparece na MINHA VEZ. Fora dela nao ha nada pra fazer com
      // ficha, e pilha clicavel que nao responde ensina a nao clicar. O saldo
      // que ele mostra ja desconta o que esta empurrado no pano — senao a mesma
      // ficha apareceria duas vezes, uma na aposta e outra ainda no caixote.
      const minhaVez = emMao && fase === 'jogador'
      // O CAIXOTE MOSTRA TUDO QUE O JOGADOR TEM, e nao so o que cabe nesta
      // jogada. Cheguei a esconder as pilhas acima do teto da mao (a mesa
      // limita a aposta a quatro vezes o pote) e o resultado era um caixote de
      // duas pilhas num jogador com vinte mil em ficha — o oposto do pedido,
      // que e ver o proprio dinheiro na mesa. Clique acima do teto responde com
      // o numero exato, e isso ensina a regra sem esconder o dinheiro.
      m.caixote(FICHAS_MESA, minhaVez ? Math.max(0, meuSaldo - naMesa) : 0)

      const acoes = (est && Array.isArray(est.acoes)) ? est.acoes : []
      const tem = (n) => acoes.indexOf(n) >= 0
      const custoPagar = tem('pagar') ? custoDe('pagar', 0) : 0
      // APOSTAR e AUMENTAR agora valem O QUE ESTA NO PANO. Nao ha mais um
      // "tamanho da subida" escolhido num botao: o valor e a pilha que o
      // jogador montou clicando no caixote, e o rotulo mostra o que a MESA vai
      // cobrar de verdade (custoDe ja aplica o limite de pote do modulo, entao
      // empurrar 400 numa mesa que so aceita 300 mostra 300 e nao mente).
      const custoApostar = naMesa > 0 ? custoDe('apostar', naMesa) : 0
      const custoAumentar = naMesa > 0 ? custoDe('aumentar', naMesa) : 0
      const tetoTudo = minhaVez ? Math.max(0, tetoDaMesa()) : 0

      faixa.ajustar('passar', { ver: tem('passar') && naMesa === 0, ligado: true })
      faixa.ajustar('apostar', {
        ver: tem('apostar'),
        ligado: naMesa > 0 && !!(carteira && carteira.temFichas(custoApostar)),
        txt: naMesa > 0 ? 'APOSTAR ' + num(custoApostar) : 'APOSTAR',
      })
      faixa.ajustar('pagar', {
        ver: tem('pagar') && naMesa === 0,
        ligado: !!(carteira && carteira.temFichas(custoPagar)),
        txt: custoPagar > 0 ? 'PAGAR ' + num(custoPagar) : 'PAGAR',
        chama: !!(carteira && carteira.temFichas(custoPagar)),
      })
      faixa.ajustar('aumentar', {
        ver: tem('aumentar'),
        ligado: naMesa > 0 && !!(carteira && carteira.temFichas(custoAumentar)),
        txt: naMesa > 0 ? 'AUMENTAR ' + num(custoAumentar) : 'AUMENTAR',
      })
      // TUDO e o all-in: empurra o maximo que esta mesa aceita de uma vez. Ele
      // nao aposta sozinho — enche o pano e deixa o dedo no gatilho, porque
      // all-in que acontece num clique so e all-in dado sem querer.
      faixa.ajustar('tudo', {
        ver: minhaVez && (tem('apostar') || tem('aumentar')),
        ligado: tetoTudo > naMesa,
        txt: 'TUDO (' + num(tetoTudo) + ')',
      })
      faixa.ajustar('devolver', {
        ver: minhaVez && naMesa > 0,
        ligado: true,
        txt: 'TIRAR (' + num(naMesa) + ')',
      })
      // DESISTIR nunca some, nem com ficha no pano. PASSAR some (passar com
      // ficha empurrada e uma contradicao), mas correr nao e: as fichas do pano
      // ainda nao foram cobradas, e acao() zera o pano antes de qualquer
      // jogada. Um botao de correr que desaparece quando o jogador mexe nas
      // fichas le como mesa travada.
      faixa.ajustar('desistir', { ver: tem('desistir'), ligado: true })
      // 'denovo' deixou de ser o botao que faz a mao acontecer — ela acontece
      // sozinha — e virou o de ADIANTAR. Ele so aparece na espera entre maos, e
      // e por isso que 'ver' olha o relogio e nao a fase: sem ficha o relogio
      // nao existe, e um botao que promete outra mao sem poder cumprir e pior
      // que botao nenhum.
      faixa.ajustar('denovo', {
        ver: (fim || !est) && !!tMao,
        ligado: !semFichas,
        txt: 'PROXIMA MAO',
      })

      // Tabela de maos na dica: e um jogo inventado, entao a regra fica na tela.
      // Sem isto o jogador perde uma mao com dois reis e acha que a UI errou.
      let meu = ''
      if (minhas.length >= 2) {
        try { meu = nomeMao(forcaDaMao(minhas[0], minhas[1])) } catch (err) { void err }
      }
      faixa.setDica((meu ? 'Sua mao: ' + meu + '  ·  ' : '') +
        'Entrada ' + num(ante) + '  ·  PAR > SEQUENCIA > NAIPE > CARTA ALTA  ·  Esc sai da mesa')
      if (minhaVez && naMesa === 0 && !est.mensagem) {
        faixa.setRecado('Clique nas suas fichas na mesa pra apostar.', '')
      }

      // UMA LENTE SO, A SESSAO INTEIRA. Nao ha nem o recuo de 'aposta' entre
      // maos: com a mesa repartindo sozinha a cada 2,6 segundos, um recuo por
      // mao seria o zoom-in/zoom-out de volta, so que mais vezes. A viagem de
      // chegada (T_ENTRAR, do olho do jogador ate aqui) ja e a apresentacao.
      irPara('jogo', T_TROCA)
    }

    M.render = render
    M.atualizar = (dt) => { if (ricaco) ricaco.atualizar(dt) }

    /**
     * CLIQUE NUMA PILHA DO PANO — o unico jeito de montar uma aposta aqui.
     *
     * A trava do teto vem do MODULO e nao de um numero deste arquivo: o poker
     * limita a aposta ao tamanho do pote, e deixar o jogador empilhar 2000 num
     * pote de 50 pra depois a mesa aceitar 50 seria mentir com ficha na mao.
     */
    M.aoTocar = (alvo) => {
      const est = jogo ? chamar(jogo, 'estado') : null
      if (!est || est.fase !== 'jogador') return
      if (alvo.tipo === 'aposta') { naMesa = tirarDeCima(naMesa); renderMesa(); return }
      if (alvo.tipo !== 'caixote') return
      const v = Math.max(1, inteiro(alvo.v))
      const saldo = carteira ? carteira.fichas : 0
      if (naMesa + v > saldo) {
        faixa.setRecado('Voce nao tem ficha de ' + num(v) + ' sobrando.', 'ruim')
        renderMesa()
        return
      }
      const teto = tetoDaMesa()
      if (teto > 0 && naMesa + v > teto) {
        faixa.setRecado('O maximo desta mao e ' + num(teto) + ' (limite de pote).', 'ruim')
        renderMesa()
        return
      }
      naMesa += v
      renderMesa()
    }

    M.aoEntrar = () => {
      // A pose de mesa entra AQUI, antes de a camera comecar a viajar: a troca
      // de pose e um corte seco, e a 3,5 m com a lente ja em movimento ela nao
      // se ve. Trocada mais tarde, no meio da mao, seria um salto.
      chamar(garantirRicaco(), 'entrar')
      M.mesa.montarAlvos(FICHAS_MESA)
      faixa.definirBotoes([
        { id: 'devolver', txt: 'TIRAR', cls: 'fantasma', ao: () => { naMesa = 0; renderMesa() } },
        { id: 'tudo', txt: 'TUDO', cls: 'fantasma', ao: () => { naMesa = tetoDaMesa(); renderMesa() } },
        { id: 'passar', txt: 'PASSAR', cls: '', ao: () => acao('passar') },
        { id: 'apostar', txt: 'APOSTAR', cls: 'verde grande', ao: () => acao('apostar') },
        { id: 'pagar', txt: 'PAGAR', cls: 'verde grande', ao: () => acao('pagar') },
        { id: 'aumentar', txt: 'AUMENTAR', cls: 'ouro grande', ao: () => acao('aumentar') },
        { id: 'desistir', txt: 'DESISTIR', cls: 'bordo', ao: () => acao('desistir') },
        { id: 'denovo', txt: 'PROXIMA MAO', cls: 'fantasma', ao: novaMao },
        { id: 'sair', txt: 'SAIR DA MESA', cls: 'bordo', ao: () => fechar() },
      ])
      // Sem isto, quem sai da mesa com uma mao paga e volta encontra a mesa
      // parada: quitarMao ja tinha agendado, aoSair limpou o relogio e ninguem
      // reagendou. O render de entrada resolve, mas so se a mao anterior tiver
      // sido zerada aqui.
      if (jogo && (chamar(jogo, 'estado') || {}).fase === 'fim') jogo = null
    }

    M.aoSair = () => {
      quitarMao()
      limparRelogios()
    }

    M.principal = () => {
      const est = jogo ? chamar(jogo, 'estado') : null
      if (!est || est.fase === 'fim') return faixa.botao('denovo')
      // Com ficha no pano, o Enter confirma a APOSTA — que e a jogada que o
      // jogador acabou de montar com a mao. Sem ficha no pano ele faz o de
      // sempre: paga se ha o que pagar, passa se nao ha.
      const acoes = Array.isArray(est.acoes) ? est.acoes : []
      if (naMesa > 0) {
        if (acoes.indexOf('aumentar') >= 0) return faixa.botao('aumentar')
        if (acoes.indexOf('apostar') >= 0) return faixa.botao('apostar')
      }
      if (acoes.indexOf('pagar') >= 0) return faixa.botao('pagar')
      return faixa.botao('passar')
    }

    return M
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
  // Montagem sob demanda: quem so passa no caixa nunca constroi o caca-niquel.
  // -------------------------------------------------------------------------
  function construir(nome) {
    let t = null
    try {
      if (nome === 'caixa') t = construirCaixa()
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

  // As duas mesas sao montadas na primeira vez que alguem senta nelas. Elas nao
  // vivem em `telas` (que e o mapa das telas do painel modal) porque nao tem
  // <section> nenhuma: a "tela" delas e o feltro.
  let mesaBlackjack = null
  let mesaPoker = null

  // -------------------------------------------------------------------------
  // API publica
  // -------------------------------------------------------------------------
  pintarBolso()

  return {
    abrirCaixa() { abrirTela('caixa') },

    // Blackjack e poker guardam a mao em andamento: quem sai no meio e volta
    // encontra a mesa como deixou, em vez de perder a aposta por ter apertado
    // Esc sem querer.
    abrirBlackjack() {
      if (!mesaBlackjack) mesaBlackjack = construirMesaBlackjack()
      abrirMesa(mesaBlackjack)
    },
    abrirPoker() {
      if (!mesaPoker) mesaPoker = construirMesaPoker()
      abrirMesa(mesaPoker)
    },

    abrirSlot(i) {
      const t = telas.get('slot') || construir('slot')
      if (!t) return
      chamar(t, 'escolher', i)
      abrirTela('slot')
    },

    fechar() { fechar() },

    /**
     * A UNICA pergunta que o main.js faz a este modulo, e ela vale ouro: e por
     * ela que `uiAberta()` decide se o E de interacao, as teclas 1-9 da barra de
     * itens, o F5/F6/F8 e o clique de tiro valem. Repare que ela continua TRUE
     * durante a viagem de volta da camera — ver a armadilha do destravamento no
     * cabecalho do arquivo.
     */
    get aberto() { return modo !== null },

    /** Qual mesa esta no ar, ou null. Existe pro teste e pro console. */
    get mesa() { return mesaAtiva ? mesaAtiva.nome : null },

    /**
     * O laco de desenho do main chama isto. O painel modal nao precisa dele
     * (toda animacao dele e CSS ou setTimeout), mas a FAIXA da mesa tem o
     * cartaz e o clarao, e a mesa 3D tem cartas voando — quem move essas duas
     * e atualizarCamera, chamado de world/casino.js na ordem certa do quadro.
     * Este aqui fica de proposito vazio pra o contrato com o main nao mudar.
     */
    atualizar() {},

    /**
     * O QUADRO DA MESA. Chamado por world/casino.js DEPOIS de player.update(),
     * que e a unica ordem em que a camera da cena sobrevive ao quadro (ver o
     * cabecalho de systems/camera-cena.js).
     *
     * A ordem AQUI DENTRO tambem importa, e por um motivo diferente: o tremor
     * e somado DEPOIS de camera-cena.atualizar(), porque ela escreve
     * camera.position e camera.quaternion inteiros — somar antes seria somar
     * num valor que ela vai jogar fora no mesmo quadro.
     */
    atualizarCamera(dt, gm) {
      const d = Math.min(Math.max(dt || 0, 0), 0.1)
      tremorT += d
      const m = mesaAtiva && mesaAtiva.mesa
      if (m) m.atualizar(d)
      if (mesaAtiva && typeof mesaAtiva.atualizar === 'function') mesaAtiva.atualizar(d)
      if (!cena) return
      if (!cena.atualizar(d)) return

      const forca = m ? m.tremorAtual : 0
      if (forca <= 0.001) return
      const cam = (gm && gm.camera) || (game && game.camera)
      if (!cam) return
      // Tremor de camera, escrito na mao em vez de com um Vector3: este arquivo
      // e o unico do cassino que nao importa three, e mantê-lo assim vale mais
      // que a elegancia de um applyQuaternion. Tres senoides de frequencia
      // irracional entre si nao repetem padrao no meio segundo que ele dura.
      const t = tremorT
      const a = forca * 0.020
      cam.position.x += Math.sin(t * 47.3) * a
      cam.position.y += Math.sin(t * 61.7 + 1.3) * a
      cam.position.z += Math.sin(t * 53.1 + 2.7) * a * 0.6
      cam.rotateZ(Math.sin(t * 39.1) * forca * 0.010)
    },

    dispose() {
      if (modo === 'mesa') fecharMesa(true)
      fecharPainel()
      clearTimeout(festaTimer)
      for (const t of telas.values()) chamar(t, 'soltar')
      chamar(mesaBlackjack, 'aoSair')
      chamar(mesaPoker, 'aoSair')
      for (const m of mesas3d.values()) chamar(m, 'dispose')
      mesas3d.clear()
      if (faixa) { faixa.dispose(); faixa = null }
      if (ricaco) { ricaco.soltar(); ricaco = null }
      if (cena) { cena.cortar(); cena = null }
      try { desligarCarteira() } catch (err) { void err }
      window.removeEventListener('keydown', aoTeclar, true)
      document.removeEventListener('pointerlockchange', aoTrancarMouse)
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
      telas.clear()
      telaAtual = null
      mesaBlackjack = null
      mesaPoker = null
    },
  }
}

export default criarCassinoUI
