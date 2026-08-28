// ---------------------------------------------------------------------------
// src/ui/menu.js — a porta de entrada do jogo, em DOM puro.
//
// Quatro telas e uma placa. A PLACA e o ponto: o jogo se chama Cassino Buenos
// e o menu tem que dizer isso do mesmo jeito que a fachada de src/world/casino.js
// diz — neon, moldura e uma corrida de lampadas. Por isso as cores daqui nao
// sao escolhidas de novo: sao as MESMAS da fachada (o dourado 0xffb327 do
// letreiro, o rosa 0xff2f6a da placa vertical, o 0xffd24a das lampadas da
// marquise). Quem sai do menu e ve o predio tem que reconhecer o lugar.
//
// A placa e DOM, nao imagem, e nao e um <h1> com um brilho: neon que le como
// neon precisa de tres coisas que um text-shadow so nao da —
//   1. o miolo da letra quase BRANCO (o tubo de vidro estoura o sensor do
//      olho), com halos CURTOS na cor por cima e halos LARGOS e fracos por
//      fora (a luz batendo no ar e na parede atras);
//   2. a caixa em volta: moldura com sombra interna e externa na mesma cor,
//      com pes de sustentacao — sem a caixa, letra brilhante e so texto
//      brilhante, nao uma placa pendurada em algum lugar;
//   3. as lampadas acendendo EM SEQUENCIA em volta da moldura. E a marquise
//      correndo, e e ela que faz a placa parecer ligada na tomada.
// O flicker de uma letra so fecha a conta, e ele e IRREGULAR de proposito:
// pisca-pisca de intervalo fixo vira enfeite de natal, defeito de verdade tem
// ritmo quebrado.
//
// O FUNDO nao e opaco. O jogo continua desenhando a cidade atras (o menu abre
// com o mundo ja carregado), entao o veu so desfoca e escurece com vinheta —
// tapar a cidade inteira jogaria fora o unico cenario que o menu tem.
//
// FLUXO que o dono do jogo pediu, e que as telas seguem na ordem:
//   principal -> INICIAR O JOGO -> modo -> SOLO   -> criacao de personagem
//                                       -> COOP   -> lobby -> (o anfitriao
//                                          aperta INICIAR) -> criacao, pra
//                                          TODO MUNDO ao mesmo tempo.
//
// O menu NAO fala com a rede. Ele desenha o que setSala() conta e avisa o main
// pelos callbacks de opcoes. Toda a conversa com o servidor (pedirComecar,
// marcarPronto, conectar) e do main — aqui nao ha um unico import.
//
// CSS: um <style> so, injetado uma vez, com TODA classe prefixada por
// 'mcrp-menu-' (o helper cn() faz isso sozinho) pra nao brigar com o HUD, o
// painel do cassino nem o customizador, que vivem na mesma pagina.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-menu-style'
const P = 'mcrp-menu-'

// A chave do menu no localStorage. Uma so, com o objeto inteiro dentro.
const CHAVE_OPCOES = 'mcrp-opcoes'

// O main.js le o nome do jogador de 'mcrp-nome' quando o jogo sobe, muito antes
// deste menu existir. Entao o campo NOME daqui grava nos DOIS lugares: aqui
// dentro (pra desenhar o campo de novo) e la (pra a rede pegar na proxima
// partida). Duplicar uma string e mais barato que fazer o main aprender a ler
// um formato novo — e a alternativa era o jogador trocar o nome nas opcoes e o
// jogo continuar chamando ele de Jogador417 pra sempre.
const CHAVE_NOME = 'mcrp-nome'

// Cabem 4 pessoas na sala. O numero e do servidor, mas o desenho precisa dele
// antes de qualquer resposta chegar: as 4 vagas aparecem vazias na hora que a
// tela abre, e nao vao nascendo conforme a sala responde.
const VAGAS = 4

// O nome na placa. Fica aqui em cima, sozinho, porque e a unica coisa deste
// arquivo que alguem vai querer trocar sem ler o resto.
const NOME_PLACA = 'CASSINO BUENOS'

// Qual letra treme. Palavra 1, letra 1 = o "U" de BUENOS. Uma letra so: duas
// piscando ao mesmo tempo o olho le como animacao, nao como tubo com mau
// contato.
const LETRA_TREMULA = { palavra: 1, letra: 1 }

// Lampadas da moldura: 13 em cima e embaixo, 4 de cada lado = 34 no total. A
// corrida inteira leva VOLTA_LAMPADAS segundos, e cada lampada fica acesa uma
// fracao disso — o que anda em volta da placa e uma FAIXA de luz, nao um ponto.
const LAMP_X = 13
const LAMP_Y = 4
const VOLTA_LAMPADAS = 2.4

// Faixas da sensibilidade do mouse. O passo de 0.05 e grosso o bastante pra
// cada tecladinha na seta mudar algo que se sente, e fino pra dar pra parar no
// numero certo.
const SENS_MIN = 0.30
const SENS_MAX = 2.50
const SENS_PASSO = 0.05

/** O que o jogo assume quando nao ha nada gravado. */
export const OPCOES_PADRAO = {
  volume: 70,
  sombras: 'alta',
  inverterMouse: false,
  sensibilidade: 1.0,
  nome: '',
}

// ---------------------------------------------------------------------------
// Helpers pequenos
// ---------------------------------------------------------------------------

/** Prefixa TODA classe com mcrp-menu-. cn('bt ouro') -> 'mcrp-menu-bt mcrp-menu-ouro'. */
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

/**
 * Botao do menu. data-nav e o que faz a navegacao por teclado existir: o
 * teclado nao procura <button>, procura [data-nav] na tela ativa, entao um
 * botao decorativo que nao deve receber foco e so nao passar por aqui.
 */
function botao(cls, txt, aoClicar) {
  const b = el('button', 'bt' + (cls ? ' ' + cls : ''), txt)
  b.type = 'button'
  b.setAttribute('data-nav', '1')
  if (aoClicar) b.addEventListener('click', aoClicar)
  return b
}

/** Chamada tolerante: callback ausente ou que explodiu nao derruba o menu. */
function chamar(obj, nome, ...args) {
  if (obj && typeof obj[nome] === 'function') {
    try { return obj[nome](...args) } catch (err) { console.warn('[menu] ' + nome + ':', err) }
  }
  return undefined
}

function limitar(v, min, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return n < min ? min : n > max ? max : n
}

function texto16(v) {
  return String(v === null || v === undefined ? '' : v).trim().slice(0, 16)
}

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return
  const s = document.createElement('style')
  s.id = ID_ESTILO
  s.textContent = CSS
  document.head.appendChild(s)
}

// ---------------------------------------------------------------------------
// Opcoes: o menu e o DONO delas. Grava, le e sanitiza aqui dentro.
//
// O main NAO guarda nada: ele recebe aoTrocarOpcao(chave, valor) e APLICA
// (muda a sombra do renderer, a sensibilidade do olhar), e chama lerOpcoes()
// uma vez no boot pra aplicar o que ja estava salvo antes do menu abrir. Se um
// dia o menu sumir, as opcoes continuam gravadas e legiveis por essa funcao.
// ---------------------------------------------------------------------------

/**
 * Le as opcoes salvas, ja limpas e completas (todo campo existe). Valor
 * estragado no localStorage vira o padrao em vez de vazar pro jogo: um
 * sensibilidade: "abc" que chegasse na camera trava o olhar em NaN e o jogador
 * nao teria como descobrir por que o mouse parou.
 */
export function lerOpcoes() {
  const o = Object.assign({}, OPCOES_PADRAO)
  let cru = null
  try { cru = localStorage.getItem(CHAVE_OPCOES) } catch (err) { void err }
  if (cru) {
    try {
      const s = JSON.parse(cru)
      if (s && typeof s === 'object') {
        o.volume = Math.round(limitar(s.volume, 0, 100))
        o.sombras = s.sombras === 'baixa' ? 'baixa' : 'alta'
        o.inverterMouse = !!s.inverterMouse
        o.sensibilidade = limitar(s.sensibilidade, SENS_MIN, SENS_MAX)
        o.nome = texto16(s.nome)
      }
    } catch (err) { void err }
  }
  // Nome vazio: aproveita o que o main ja tinha sorteado/salvo, senao o campo
  // abre em branco pra quem tem nome ha dez partidas.
  if (!o.nome) {
    try { o.nome = texto16(localStorage.getItem(CHAVE_NOME)) } catch (err) { void err }
  }
  return o
}

// ---------------------------------------------------------------------------
// CSS — dourado sobre vinho, o mesmo par da fachada do cassino.
// ---------------------------------------------------------------------------
const CSS = `
.${P}raiz, .${P}raiz *{ box-sizing:border-box; }
.${P}raiz{
  --${P}neon:#ffb327;          /* dourado do letreiro (casino.js signColor) */
  --${P}rosa:#ff2f6a;          /* rosa da placa vertical da esquina */
  --${P}lamp:#ffd24a;          /* lampada da marquise */
  --${P}creme:#f7e9cf;
  --${P}vinho:#5a1626;
  position:fixed; inset:0; z-index:90;
  display:flex; align-items:center; justify-content:center;
  padding:clamp(10px,3vw,42px) clamp(10px,3vw,42px) clamp(14px,3vw,46px);
  font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;
  color:var(--${P}creme); -webkit-font-smoothing:antialiased; user-select:none;
  opacity:0; pointer-events:none; transition:opacity .18s ease;
}
.${P}raiz.${P}on{ opacity:1; pointer-events:auto; }

/* veu: desfoca a cidade e escurece com vinheta, sem tapar */
.${P}veu{
  position:absolute; inset:0;
  -webkit-backdrop-filter:blur(7px) saturate(112%); backdrop-filter:blur(7px) saturate(112%);
  background:
    linear-gradient(180deg, rgba(0,0,0,.38) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 68%, rgba(0,0,0,.48) 100%),
    radial-gradient(122% 94% at 50% 36%, rgba(38,8,20,.42) 0%, rgba(9,4,9,.80) 58%, rgba(2,2,4,.94) 100%);
}

.${P}palco{
  position:relative; width:min(880px,100%); max-height:100%;
  display:flex; flex-direction:column; align-items:center;
  overflow-y:auto; overflow-x:hidden;
  /* O padding nao e respiro: e onde as lampadas moram. Elas ficam 10 px pra
     FORA da moldura, e caixa com overflow corta na borda do padding — com
     padding 2px a fileira de cima sumia inteira e a placa parecia ter luz so
     embaixo. */
  padding:16px;
}
.${P}palco::-webkit-scrollbar{ width:8px; }
.${P}palco::-webkit-scrollbar-thumb{ background:rgba(233,196,106,.24); border-radius:8px; }

.${P}tela{ display:none; width:100%; }
.${P}tela.${P}ativa{ display:block; animation:${P}entra .18s ease both; }
@keyframes ${P}entra{ from{ opacity:0; transform:translateY(8px); } to{ opacity:1; transform:none; } }

/* =========================================================================
   A PLACA
   ========================================================================= */
.${P}placa{
  position:relative; margin:0 auto 70px; width:fit-content; max-width:100%;
  padding:clamp(16px,3.2vw,30px) clamp(26px,5.4vw,64px) clamp(18px,3.4vw,32px);
  border:2px solid rgba(255,47,106,.52); border-radius:16px;
  background:linear-gradient(180deg, rgba(44,9,21,.70), rgba(14,4,9,.84));
  box-shadow:
    inset 0 0 0 1px rgba(255,179,39,.16),
    inset 0 0 36px rgba(255,47,106,.20),
    0 0 16px rgba(255,47,106,.42),
    0 0 58px rgba(255,47,106,.18),
    0 26px 74px rgba(0,0,0,.62);
}
/* poca de luz no chao embaixo da placa: e o que a coloca NUM lugar */
.${P}placa::after{
  content:''; position:absolute; left:6%; right:6%; bottom:-46px; height:70px;
  background:radial-gradient(60% 100% at 50% 0%, rgba(255,150,60,.20), rgba(255,60,110,.07) 55%, rgba(0,0,0,0) 78%);
  pointer-events:none;
}
/* Pes: a placa esta APOIADA em alguma coisa, nao flutuando. Comecam abaixo de
   -10px porque e ali que passa a fileira de lampadas de baixo — encostados na
   moldura eles cortavam a corrida de luz no meio. */
.${P}pe{
  position:absolute; bottom:-46px; width:13px; height:36px;
  background:linear-gradient(90deg,#241a1e,#4a373d 40%,#1a1216);
}
.${P}pe.${P}esq{ left:22%; }
.${P}pe.${P}dir{ right:22%; }
.${P}pe::after{
  content:''; position:absolute; left:-10px; bottom:-5px; width:33px; height:6px;
  border-radius:2px; background:linear-gradient(180deg,#4a373d,#140e12);
  box-shadow:0 4px 12px rgba(0,0,0,.55);
}

.${P}lampadas{ position:absolute; inset:-10px; pointer-events:none; }
.${P}lamp{
  position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px;
  border-radius:50%; background:var(--${P}lamp);
  animation:${P}correr ${VOLTA_LAMPADAS}s linear infinite;
}
/* Cada lampada roda a MESMA animacao com um atraso proprio; o atraso e que faz
   a luz caminhar em volta da moldura. Acesa nos primeiros 16% do ciclo: com 34
   lampadas isso e uma faixa de ~5 acesas correndo, e nao um vaga-lume. */
@keyframes ${P}correr{
  0%{ opacity:1; transform:scale(1.15);
      box-shadow:0 0 7px 2px var(--${P}lamp), 0 0 18px 5px rgba(255,190,90,.5); }
  16%{ opacity:.34; transform:scale(1);
      box-shadow:0 0 3px 1px rgba(255,190,90,.30); }
  100%{ opacity:.34; transform:scale(1);
      box-shadow:0 0 3px 1px rgba(255,190,90,.30); }
}

/* Uma palavra por linha, SEMPRE. Deixado por conta do flex-wrap, o nome cabia
   numa linha so em tela larga e quebrava em duas na estreita — e uma placa que
   muda de formato conforme a janela nao parece uma placa, parece texto.
   Empilhado tambem e o que marquise de cassino de verdade faz.
   O min-width segura a moldura larga: sem ele o quadro encolhia ate a largura
   de "CASSINO" e a placa virava um quadradinho. */
.${P}nome{
  display:flex; flex-direction:column; align-items:center;
  min-width:min(620px,70vw); gap:clamp(1px,.5vw,6px);
  font-size:clamp(34px,7.6vw,86px); font-weight:700; line-height:1;
  letter-spacing:.04em; white-space:nowrap;
}
.${P}palavra{ display:inline-flex; }
/* O neon: miolo quase branco, dois halos curtos na cor, dois largos e fracos.
   A ordem importa — halo curto por cima do largo, senao o miolo some no borrao. */
.${P}letra{
  display:inline-block; color:#fff7e6;
  text-shadow:
    0 0 2px rgba(255,255,255,.95),
    0 0 7px var(--${P}neon),
    0 0 14px var(--${P}neon),
    0 0 34px rgba(255,140,40,.62),
    0 0 74px rgba(255,80,50,.38);
}
/* Flicker de mau contato: passos DESIGUAIS e um ciclo que nao bate com a volta
   das lampadas (7.3s contra 2.4s), pra os dois nunca acertarem o passo. */
.${P}letra.${P}treme{ animation:${P}treme 7.3s linear infinite; }
@keyframes ${P}treme{
  0%,17.4%{ opacity:1; }
  17.9%{ opacity:.24; }
  18.6%{ opacity:1; }
  19.3%{ opacity:.36; }
  20.1%{ opacity:.92; }
  20.9%,58.2%{ opacity:1; }
  58.7%{ opacity:.2; }
  59.9%{ opacity:.86; }
  60.6%{ opacity:.3; }
  62.2%{ opacity:1; }
  89.3%{ opacity:1; }
  89.8%{ opacity:.5; }
  90.4%{ opacity:1; }
  100%{ opacity:1; }
}

/* linha miuda dentro da moldura, em rosa: a placa vira uma placa, com recado */
.${P}recado-placa{
  margin-top:clamp(8px,1.4vw,14px); text-align:center;
  font-size:clamp(9.5px,1.25vw,12.5px); font-weight:700; letter-spacing:.42em;
  text-indent:.42em; color:#ffd7e2;
  text-shadow:0 0 5px var(--${P}rosa), 0 0 16px rgba(255,47,106,.7), 0 0 40px rgba(255,47,106,.35);
}

/* =========================================================================
   BOTOES
   ========================================================================= */
.${P}pilha{ display:flex; flex-direction:column; gap:11px; width:min(400px,100%); margin:0 auto; }
.${P}bt{
  appearance:none; cursor:pointer; font:inherit; display:block; width:100%;
  padding:15px 24px; border-radius:12px;
  font-size:clamp(13px,1.5vw,16px); font-weight:700; letter-spacing:.17em; text-transform:uppercase;
  color:#ffdf9e; text-shadow:0 1px 2px rgba(0,0,0,.5);
  background:linear-gradient(180deg, rgba(122,30,51,.80), rgba(56,12,26,.90));
  border:1px solid rgba(233,196,106,.36);
  box-shadow:0 10px 26px rgba(0,0,0,.44), inset 0 1px 0 rgba(255,255,255,.07);
  transition:background .18s, color .18s, border-color .18s, box-shadow .18s, transform .18s;
}
.${P}bt:hover{
  color:#fff3d6; border-color:rgba(255,179,39,.85);
  background:linear-gradient(180deg, rgba(150,38,64,.88), rgba(74,16,34,.94));
  box-shadow:0 12px 30px rgba(0,0,0,.5), 0 0 22px rgba(255,179,39,.28), inset 0 1px 0 rgba(255,255,255,.12);
}
/* Foco visivel de teclado. So aparece depois que alguem usou as setas (a raiz
   ganha .teclado): senao todo clique de mouse deixava um anel dourado plantado
   no botao clicado. */
.${P}raiz.${P}teclado .${P}bt:focus,
.${P}raiz.${P}teclado .${P}cartao:focus,
.${P}raiz.${P}teclado .${P}mini:focus,
.${P}raiz.${P}teclado .${P}seg button:focus,
.${P}raiz.${P}teclado .${P}campo:focus{
  outline:none; border-color:var(--${P}neon);
  box-shadow:0 0 0 2px rgba(255,179,39,.9), 0 0 26px rgba(255,179,39,.45);
}
/* pressao no clique: afunda e perde a sombra de baixo */
.${P}bt:active{
  transform:translateY(2px) scale(.994);
  box-shadow:inset 0 4px 12px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4);
}
.${P}bt[disabled]{
  cursor:default; opacity:.42; color:#c9b79a; transform:none;
  border-color:rgba(233,196,106,.16);
  background:linear-gradient(180deg, rgba(70,22,36,.5), rgba(34,10,18,.6));
  box-shadow:none;
}
.${P}bt.${P}ouro{
  color:#2a1a06; text-shadow:none; border-color:rgba(255,232,170,.9);
  background:linear-gradient(180deg,#ffdf9e,#e2a83c);
  box-shadow:0 10px 28px rgba(226,168,60,.34), inset 0 1px 0 rgba(255,255,255,.5);
}
.${P}bt.${P}ouro:hover{ background:linear-gradient(180deg,#ffeec4,#f2bb4e); }
/* Precisa vir DEPOIS do .ouro: mesma especificidade, e sem esta linha o
   "aguardando o anfitriao" continuava dourado e convidando o clique. */
.${P}bt.${P}ouro[disabled]{
  color:#c9b79a; text-shadow:none; border-color:rgba(233,196,106,.16);
  background:linear-gradient(180deg, rgba(70,22,36,.5), rgba(34,10,18,.6));
  box-shadow:none;
}
.${P}bt.${P}fraco{
  color:#d8c6ab; letter-spacing:.14em; font-size:12.5px; padding:11px 20px;
  background:rgba(255,255,255,.05); border-color:rgba(255,255,255,.13);
  box-shadow:none;
}
.${P}bt.${P}fraco:hover{ background:rgba(255,255,255,.11); color:#fff0d4; }
.${P}mini{
  appearance:none; cursor:pointer; font:inherit; font-size:11px; font-weight:700;
  letter-spacing:.14em; text-transform:uppercase; padding:9px 15px; border-radius:9px;
  color:#ffdf9e; background:rgba(255,179,39,.12); border:1px solid rgba(233,196,106,.42);
  transition:background .18s, color .18s, transform .18s, box-shadow .18s;
}
.${P}mini:hover{ background:rgba(255,179,39,.26); color:#fff3d6; }
.${P}mini:active{ transform:translateY(1px) scale(.97); }

/* =========================================================================
   CABECALHOS DAS TELAS INTERNAS
   ========================================================================= */
.${P}chapeu{ text-align:center; margin-bottom:clamp(16px,2.6vw,26px); }
.${P}kicker{
  font-size:10.5px; letter-spacing:.34em; text-indent:.34em; font-weight:700;
  color:var(--${P}neon); text-shadow:0 0 12px rgba(255,179,39,.55);
}
.${P}titulo{
  margin:7px 0 0; font-size:clamp(21px,3vw,30px); font-weight:700; letter-spacing:.05em;
  color:#fff2da; text-shadow:0 2px 18px rgba(0,0,0,.6);
}
.${P}sub{ margin-top:7px; font-size:13px; color:#bda893; line-height:1.5; }
.${P}dica{ margin-top:16px; text-align:center; font-size:11px; color:#8c7d6e; letter-spacing:.05em; }

/* linha de status compartilhada (setMensagem) */
.${P}status{
  min-height:20px; margin:14px auto 0; max-width:520px; text-align:center;
  font-size:12.5px; font-weight:700; color:#c8b393; line-height:1.45;
}
.${P}status.${P}ruim{ color:#f3a7a7; }
.${P}status.${P}bom{ color:#9fe6b4; }
.${P}status.${P}pisca{ animation:${P}pisca .32s ease; }
@keyframes ${P}pisca{ from{ opacity:.35; transform:translateY(-3px); } to{ opacity:1; transform:none; } }

/* =========================================================================
   TELA MODO — dois cartoes
   ========================================================================= */
.${P}cartoes{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
@media (max-width:560px){ .${P}cartoes{ grid-template-columns:1fr; } }
.${P}cartao{
  appearance:none; cursor:pointer; font:inherit; text-align:left;
  display:flex; flex-direction:column; gap:11px; padding:22px 22px 24px;
  border-radius:16px; color:inherit;
  background:linear-gradient(168deg, rgba(255,255,255,.055), rgba(255,255,255,.012));
  border:1px solid rgba(233,196,106,.22);
  box-shadow:0 14px 34px rgba(0,0,0,.4);
  transition:background .18s, border-color .18s, box-shadow .18s, transform .18s;
}
.${P}cartao:hover{
  transform:translateY(-3px); border-color:rgba(255,179,39,.7);
  background:linear-gradient(168deg, rgba(255,179,39,.14), rgba(255,255,255,.02));
  box-shadow:0 18px 40px rgba(0,0,0,.5), 0 0 26px rgba(255,179,39,.2);
}
.${P}cartao:active{ transform:translateY(0) scale(.99); }
.${P}cartao h3{ margin:0; font-size:19px; font-weight:700; letter-spacing:.14em; color:#ffdf9e; }
.${P}cartao p{ margin:0; font-size:13px; line-height:1.55; color:#c2ae97; }
.${P}cartao em{ font-style:normal; font-size:10.5px; letter-spacing:.22em; color:#8f8071; font-weight:700; }
/* As fichas do cartao sao CSS: nenhum asset entra neste projeto, nem aqui. */
.${P}fichas{ display:flex; height:40px; align-items:center; }
.${P}fic{
  width:38px; height:38px; border-radius:50%; flex:0 0 auto;
  border:3px dashed rgba(255,255,255,.7);
  box-shadow:0 5px 12px rgba(0,0,0,.45), inset 0 -6px 11px rgba(0,0,0,.3);
}
.${P}fic + .${P}fic{ margin-left:-15px; }
.${P}fic.${P}a{ background:radial-gradient(circle at 34% 28%,#5fd39a,#2f8f5b 62%,#1c5c3a); }
.${P}fic.${P}b{ background:radial-gradient(circle at 34% 28%,#ff8f8f,#c62c3f 60%,#7d1523); }
.${P}fic.${P}c{ background:radial-gradient(circle at 34% 28%,#ffe89a,#e0a713 62%,#a97a06); }

/* =========================================================================
   TELA LOBBY
   ========================================================================= */
.${P}vagas{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
@media (max-width:700px){ .${P}vagas{ grid-template-columns:1fr 1fr; } }
.${P}vaga{
  position:relative; padding:15px 13px 16px; border-radius:14px; min-height:118px;
  display:flex; flex-direction:column; gap:5px;
  background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
  border:1px solid rgba(255,255,255,.08);
  transition:border-color .18s, background .18s, box-shadow .18s;
}
.${P}vaga.${P}cheia{
  border-color:rgba(233,196,106,.42);
  background:linear-gradient(180deg, rgba(255,179,39,.10), rgba(255,255,255,.02));
}
.${P}vaga.${P}eu{ border-color:var(--${P}neon); box-shadow:0 0 22px rgba(255,179,39,.24); }
.${P}vaga .${P}n{
  font-size:9.5px; letter-spacing:.24em; font-weight:700; color:#8b7c6c;
}
.${P}vaga .${P}quem{
  font-size:15px; font-weight:700; color:#fff0d2; word-break:break-word; line-height:1.25;
}
.${P}vaga.${P}vazia .${P}quem{ color:#7d7062; font-weight:600; font-size:13px; }
.${P}vaga .${P}est{ margin-top:auto; font-size:10.5px; letter-spacing:.14em; font-weight:700; color:#9bb0a2; }
.${P}vaga .${P}est.${P}ok{ color:#8fe0a8; }
.${P}coroa{
  align-self:flex-start; padding:2px 8px; border-radius:999px;
  font-size:9px; letter-spacing:.16em; font-weight:700; color:#2a1a06;
  background:linear-gradient(180deg,#ffdf9e,#e2a83c);
}
/* pontinhos da vaga vazia: o unico jeito de "esperando" parecer vivo */
.${P}pontos{ display:inline-flex; align-items:center; gap:3px; margin-left:4px; padding-bottom:2px; }
.${P}pontos i{
  width:3px; height:3px; border-radius:50%; background:#7d7062; font-style:normal;
  animation:${P}pontos 1.25s ease-in-out infinite;
}
.${P}pontos i:nth-child(2){ animation-delay:.16s; }
.${P}pontos i:nth-child(3){ animation-delay:.32s; }
@keyframes ${P}pontos{ 0%,60%,100%{ opacity:.22; transform:translateY(0); } 30%{ opacity:1; transform:translateY(-3px); } }

.${P}convite{
  margin-top:16px; padding:14px 16px; border-radius:14px;
  background:rgba(0,0,0,.32); border:1px solid rgba(233,196,106,.2);
}
.${P}convite .${P}rot{
  font-size:9.5px; letter-spacing:.22em; font-weight:700; color:#9c8b78; margin-bottom:9px;
}
.${P}linha{ display:flex; align-items:center; gap:11px; flex-wrap:wrap; }
.${P}url{
  flex:1; min-width:180px; padding:10px 13px; border-radius:10px;
  font-family:Consolas,"Courier New",monospace; font-size:clamp(14px,2vw,19px); font-weight:700;
  color:#ffe6b4; background:rgba(0,0,0,.42); border:1px solid rgba(255,255,255,.1);
  word-break:break-all; user-select:text; cursor:text;
}
.${P}aviso{ margin-top:9px; font-size:11px; line-height:1.5; color:#c9a06a; }

.${P}acoes{ display:flex; gap:11px; margin-top:18px; flex-wrap:wrap; }
.${P}acoes .${P}bt{ flex:1; min-width:170px; width:auto; }

/* =========================================================================
   TELA OPCOES
   ========================================================================= */
.${P}opc{ display:flex; flex-direction:column; gap:9px; }
.${P}op{
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
  padding:13px 16px; border-radius:13px;
  background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.012));
  border:1px solid rgba(255,255,255,.08);
}
.${P}op.${P}mudo{ opacity:.5; }
.${P}op .${P}lbl{ flex:1; min-width:150px; }
.${P}op .${P}lbl b{ display:block; font-size:13.5px; font-weight:700; color:#f2e2c8; letter-spacing:.03em; }
.${P}op .${P}lbl span{ display:block; margin-top:3px; font-size:11px; color:#93857a; line-height:1.45; }
.${P}valor{ min-width:52px; text-align:right; font-size:14px; font-weight:700; color:#ffdf9e; font-variant-numeric:tabular-nums; }
.${P}barra{ width:min(190px,44vw); accent-color:var(--${P}neon); cursor:pointer; }
.${P}barra[disabled]{ cursor:default; }
.${P}seg{ display:flex; gap:0; border-radius:10px; overflow:hidden; border:1px solid rgba(233,196,106,.3); }
.${P}seg button{
  appearance:none; cursor:pointer; font:inherit; font-size:11.5px; font-weight:700;
  letter-spacing:.12em; padding:9px 16px; border:0; color:#c9b79a;
  background:rgba(0,0,0,.3); transition:background .18s, color .18s;
}
.${P}seg button:hover{ background:rgba(255,179,39,.16); color:#fff0d4; }
.${P}seg button.${P}sel{ background:linear-gradient(180deg,#ffdf9e,#e2a83c); color:#2a1a06; }
.${P}campo{
  appearance:none; font:inherit; font-size:14px; font-weight:700; width:180px; padding:9px 12px;
  border-radius:10px; color:#fff0d2; background:rgba(0,0,0,.42);
  border:1px solid rgba(255,255,255,.14); transition:border-color .18s, box-shadow .18s;
}
.${P}campo:focus{ outline:none; border-color:rgba(255,179,39,.8); }
.${P}emBreve{
  font-size:9px; letter-spacing:.16em; font-weight:700; padding:3px 8px; border-radius:999px;
  color:#0f0d0a; background:#8c7f6d;
}
`

// ---------------------------------------------------------------------------
// criarMenu
// ---------------------------------------------------------------------------

/**
 * Monta o menu inteiro (as 4 telas ficam no DOM desde o inicio, so uma visivel)
 * e devolve o controle. Nao abre sozinho: o main chama abrir('principal').
 *
 * opcoes = {
 *   aoSolo(), aoCoop(), aoComecar(), aoVoltar(), aoSair(),
 *   aoTrocarOpcao(chave, valor),
 * }
 */
export function criarMenu({ opcoes } = {}) {
  injetarEstilo()
  const cb = opcoes || {}

  // --- estado --------------------------------------------------------------
  let aberto = false
  let telaAtual = 'principal'
  let mensagem = ''
  let tomMensagem = ''
  let fechando = 0

  // O que setSala() conta. Comeca vazio e HONESTO: meuId 0 quer dizer "o
  // servidor ainda nao me deu numero", e a tela sabe desenhar esse estado (que
  // e o estado real nos dois primeiros segundos de todo coop).
  const sala = { fase: 'lobby', anfitriao: 0, meuId: 0, jogadores: [] }

  const val = lerOpcoes()

  // --- raiz ----------------------------------------------------------------
  const raiz = el('div', 'raiz')
  raiz.setAttribute('aria-hidden', 'true')
  const veu = el('div', 'veu')
  const palco = el('div', 'palco')
  raiz.append(veu, palco)
  document.body.appendChild(raiz)

  // =========================================================================
  // TELA 1 — PRINCIPAL
  // =========================================================================
  const telaPrincipal = el('section', 'tela')

  const placa = el('div', 'placa')
  const lampadas = el('div', 'lampadas')
  placa.appendChild(lampadas)

  // Perimetro no sentido horario: topo esq->dir, direita, baixo dir->esq,
  // esquerda baixo->cima. A ORDEM desta lista e a corrida — o indice de cada
  // lampada vira o atraso da animacao, entao a luz caminha em volta em vez de
  // acender em ordem aleatoria.
  const cantos = []
  for (let i = 0; i < LAMP_X; i++) cantos.push([i / (LAMP_X - 1), 0])
  for (let i = 1; i <= LAMP_Y; i++) cantos.push([1, i / (LAMP_Y + 1)])
  for (let i = LAMP_X - 1; i >= 0; i--) cantos.push([i / (LAMP_X - 1), 1])
  for (let i = LAMP_Y; i >= 1; i--) cantos.push([0, i / (LAMP_Y + 1)])
  for (let i = 0; i < cantos.length; i++) {
    const b = el('span', 'lamp')
    b.style.left = (cantos[i][0] * 100).toFixed(3) + '%'
    b.style.top = (cantos[i][1] * 100).toFixed(3) + '%'
    // Atraso NEGATIVO: a animacao ja comeca no meio, entao a corrida esta
    // pronta no primeiro quadro em vez de levar 2.4 s pra "carregar".
    b.style.animationDelay = (-(i / cantos.length) * VOLTA_LAMPADAS).toFixed(3) + 's'
    lampadas.appendChild(b)
  }

  const nomePlaca = el('div', 'nome')
  const palavras = NOME_PLACA.split(' ')
  for (let p = 0; p < palavras.length; p++) {
    const w = el('span', 'palavra')
    for (let c = 0; c < palavras[p].length; c++) {
      const l = el('span', 'letra', palavras[p][c])
      if (p === LETRA_TREMULA.palavra && c === LETRA_TREMULA.letra) marca(l, 'treme', true)
      w.appendChild(l)
    }
    nomePlaca.appendChild(w)
  }
  placa.appendChild(nomePlaca)
  placa.appendChild(el('div', 'recado-placa', 'ABERTO A NOITE TODA'))
  placa.appendChild(el('span', 'pe esq'))
  placa.appendChild(el('span', 'pe dir'))
  telaPrincipal.appendChild(placa)

  const pilhaP = el('div', 'pilha')
  const btIniciar = botao('ouro', 'Iniciar o jogo', () => abrir('modo'))
  // CONTINUAR abre a tela dos cinco lugares (ui/save-ui.js). Quem monta a tela
  // e o main: o menu so avisa que o botao foi apertado, do mesmo jeito que faz
  // com o SAIR.
  const btContinuar = botao('', 'Continuar', () => chamar(cb, 'aoContinuar'))
  const btOpcoes = botao('', 'Opcoes', () => abrir('opcoes'))
  // SAIR nao tenta window.close(): aba aberta pelo usuario o navegador nao
  // deixa fechar, e um botao que nao faz nada e pior que nenhum. Quem decide o
  // que "sair" significa (voltar pro site, encerrar a sessao) e o main.
  const btSair = botao('fraco', 'Sair', () => chamar(cb, 'aoSair'))
  pilhaP.append(btIniciar, btContinuar, btOpcoes, btSair)
  telaPrincipal.appendChild(pilhaP)
  telaPrincipal.appendChild(el('div', 'dica', 'Setas para escolher, Enter para confirmar'))

  // =========================================================================
  // TELA 2 — MODO
  // =========================================================================
  const telaModo = el('section', 'tela')
  const chapeuM = el('div', 'chapeu')
  chapeuM.append(
    el('div', 'kicker', 'CASSINO BUENOS'),
    el('h2', 'titulo', 'Como voce quer jogar'),
  )
  telaModo.appendChild(chapeuM)

  const cartoes = el('div', 'cartoes')

  function cartao(tag, titulo, desc, fichas, aoClicar) {
    const c = el('button', 'cartao')
    c.type = 'button'
    c.setAttribute('data-nav', '1')
    const f = el('div', 'fichas')
    for (let i = 0; i < fichas.length; i++) f.appendChild(el('span', 'fic ' + fichas[i]))
    c.append(f, el('em', null, tag), el('h3', null, titulo), el('p', null, desc))
    c.addEventListener('click', aoClicar)
    cartoes.appendChild(c)
    return c
  }

  cartao('UM JOGADOR', 'SOLO', 'Voce, a cidade e a sua sorte.', ['c'],
    () => chamar(cb, 'aoSolo'))
  cartao('MULTIJOGADOR', 'COOP', 'De 2 a 4 pessoas na mesma sala.', ['a', 'b', 'c'],
    () => chamar(cb, 'aoCoop'))
  telaModo.appendChild(cartoes)

  // A mesma linha de setMensagem aparece aqui e no lobby: "sem servidor: so da
  // pra jogar solo" e uma informacao que o jogador precisa ANTES de clicar em
  // COOP, nao depois de entrar numa sala que nunca vai encher.
  const statusModo = el('div', 'status')
  telaModo.appendChild(statusModo)

  const acoesModo = el('div', 'pilha')
  acoesModo.style.marginTop = '16px'
  acoesModo.appendChild(botao('fraco', 'Voltar', () => voltar()))
  telaModo.appendChild(acoesModo)

  // =========================================================================
  // TELA 3 — LOBBY
  // =========================================================================
  const telaLobby = el('section', 'tela')
  const chapeuL = el('div', 'chapeu')
  const subLobby = el('div', 'sub', 'De 2 a 4 pessoas. Quando o anfitriao comecar, todo mundo vai junto pra criacao de personagem.')
  chapeuL.append(
    el('div', 'kicker', 'SALA COOPERATIVA'),
    el('h2', 'titulo', 'Esperando a mesa encher'),
    subLobby,
  )
  telaLobby.appendChild(chapeuL)

  // As 4 vagas sao construidas UMA vez e so repintadas depois. Recriar os
  // cartoes a cada sala-estado (que chega a cada entrada e saida) mataria o
  // foco do teclado e reiniciaria a animacao dos pontinhos no meio do caminho.
  const grade = el('div', 'vagas')
  const vagas = []
  for (let i = 0; i < VAGAS; i++) {
    const v = el('div', 'vaga vazia')
    const n = el('div', 'n', 'VAGA ' + (i + 1))
    const coroa = el('span', 'coroa', 'ANFITRIAO')
    coroa.style.display = 'none'
    const quem = el('div', 'quem')
    const pontos = el('span', 'pontos')
    pontos.append(el('i'), el('i'), el('i'))
    quem.append(document.createTextNode('esperando'), pontos)
    const est = el('div', 'est', '')
    v.append(n, coroa, quem, est)
    grade.appendChild(v)
    vagas.push({ raiz: v, quem, coroa, est, pontos })
  }
  telaLobby.appendChild(grade)

  const convite = el('div', 'convite')
  convite.appendChild(el('div', 'rot', 'MANDE ESTE ENDERECO PRA QUEM VAI ENTRAR'))
  const linhaUrl = el('div', 'linha')
  // location.origin e o endereco que ESTA maquina usou pra abrir o jogo. E o
  // certo pra copiar: se o anfitriao abriu por http://192.168.0.14:5173, e isso
  // que o irmao precisa digitar. Nao da pra descobrir o IP da LAN do navegador.
  const endereco = (typeof location !== 'undefined' && location.origin) ? location.origin : ''
  const urlBox = el('div', 'url', endereco || 'endereco indisponivel')
  const btCopiar = el('button', 'mini', 'Copiar')
  btCopiar.type = 'button'
  btCopiar.setAttribute('data-nav', '1')
  btCopiar.addEventListener('click', copiar)
  linhaUrl.append(urlBox, btCopiar)
  convite.appendChild(linhaUrl)
  // localhost so funciona na propria maquina. Quem nao souber disso vai mandar
  // "http://localhost:5173" pro irmao e culpar o jogo quando nao abrir.
  const avisoLocal = el('div', 'aviso',
    'Este endereco so abre nesta maquina. Pro seu irmao entrar, troque "localhost" pelo IP da sua maquina na rede (algo como 192.168.0.10).')
  avisoLocal.style.display = /localhost|127\.0\.0\.1/.test(endereco) ? '' : 'none'
  convite.appendChild(avisoLocal)
  telaLobby.appendChild(convite)

  const statusLobby = el('div', 'status')
  telaLobby.appendChild(statusLobby)

  const acoesLobby = el('div', 'acoes')
  const btComecar = botao('ouro', 'Iniciar o jogo', () => chamar(cb, 'aoComecar'))
  const btSairSala = botao('fraco', 'Sair da sala', () => voltar())
  acoesLobby.append(btComecar, btSairSala)
  telaLobby.appendChild(acoesLobby)

  // =========================================================================
  // TELA 4 — OPCOES
  // =========================================================================
  const telaOpcoes = el('section', 'tela')
  const chapeuO = el('div', 'chapeu')
  chapeuO.append(
    el('div', 'kicker', 'AJUSTES'),
    el('h2', 'titulo', 'Opcoes'),
    el('div', 'sub', 'Tudo aqui e salvo neste navegador e vale pra proxima partida.'),
  )
  telaOpcoes.appendChild(chapeuO)

  const listaOpc = el('div', 'opc')
  telaOpcoes.appendChild(listaOpc)

  /** Linha da lista: rotulo a esquerda, controle a direita. */
  function linhaOpc(titulo, nota, mudo) {
    const l = el('div', 'op' + (mudo ? ' mudo' : ''))
    const lbl = el('div', 'lbl')
    lbl.append(el('b', null, titulo), el('span', null, nota))
    l.appendChild(lbl)
    listaOpc.appendChild(l)
    return l
  }

  // --- volume: existe, esta desligado, e o menu diz isso na cara -----------
  // Nao ha uma linha de audio no jogo hoje. Esconder o controle daria a
  // impressao de que o jogo e mudo por opcao; deixar habilitado seria mentir
  // (o jogador arrastaria e nada aconteceria). Desabilitado + "em breve" e a
  // unica das tres que nao engana ninguem.
  const opVolume = linhaOpc('Volume', 'O jogo ainda nao tem som.', true)
  const barraVol = document.createElement('input')
  barraVol.type = 'range'
  barraVol.className = cn('barra')
  barraVol.min = '0'
  barraVol.max = '100'
  barraVol.step = '5'
  barraVol.disabled = true
  const valVol = el('span', 'valor', '')
  opVolume.append(el('span', 'emBreve', 'EM BREVE'), barraVol, valVol)

  // --- sombras ------------------------------------------------------------
  const opSombra = linhaOpc('Qualidade da sombra', 'Baixa devolve quadros em maquina fraca.', false)
  const segSombra = el('div', 'seg')
  const btSombraAlta = segBotao(segSombra, 'ALTA', () => trocar('sombras', 'alta'))
  const btSombraBaixa = segBotao(segSombra, 'BAIXA', () => trocar('sombras', 'baixa'))
  opSombra.appendChild(segSombra)

  // --- inverter mouse -----------------------------------------------------
  const opInv = linhaOpc('Inverter o mouse', 'Puxar pra baixo faz olhar pra cima.', false)
  const segInv = el('div', 'seg')
  const btInvNao = segBotao(segInv, 'NAO', () => trocar('inverterMouse', false))
  const btInvSim = segBotao(segInv, 'SIM', () => trocar('inverterMouse', true))
  opInv.appendChild(segInv)

  // --- sensibilidade ------------------------------------------------------
  const opSens = linhaOpc('Sensibilidade do mouse', 'Quanto a camera gira pra cada centimetro de mouse.', false)
  const barraSens = document.createElement('input')
  barraSens.type = 'range'
  barraSens.className = cn('barra')
  barraSens.min = String(SENS_MIN)
  barraSens.max = String(SENS_MAX)
  barraSens.step = String(SENS_PASSO)
  barraSens.setAttribute('data-nav', '1')
  const valSens = el('span', 'valor', '')
  barraSens.addEventListener('input', () => trocar('sensibilidade', Number(barraSens.value)))
  opSens.append(barraSens, valSens)

  // --- nome ---------------------------------------------------------------
  const opNome = linhaOpc('Seu nome', 'Ate 16 letras. E o que aparece em cima da sua cabeca.', false)
  const campoNome = document.createElement('input')
  campoNome.type = 'text'
  campoNome.className = cn('campo')
  campoNome.maxLength = 16
  campoNome.spellcheck = false
  campoNome.autocomplete = 'off'
  campoNome.placeholder = 'Jogador'
  campoNome.setAttribute('data-nav', '1')
  campoNome.addEventListener('input', () => trocar('nome', campoNome.value))
  opNome.appendChild(campoNome)

  const acoesOpc = el('div', 'pilha')
  acoesOpc.style.marginTop = '16px'
  acoesOpc.appendChild(botao('fraco', 'Voltar', () => voltar()))
  telaOpcoes.appendChild(acoesOpc)
  telaOpcoes.appendChild(el('div', 'dica',
    'Cima e baixo trocam de linha. Esquerda e direita mudam o valor.'))

  /** Botao de um segmentado (ALTA/BAIXA, SIM/NAO). */
  function segBotao(pai, txt, aoClicar) {
    const b = el('button', null, txt)
    b.type = 'button'
    b.setAttribute('data-nav', '1')
    b.addEventListener('click', aoClicar)
    pai.appendChild(b)
    return b
  }

  palco.append(telaPrincipal, telaModo, telaLobby, telaOpcoes)
  const TELAS = {
    principal: telaPrincipal,
    modo: telaModo,
    lobby: telaLobby,
    opcoes: telaOpcoes,
  }

  // =========================================================================
  // Pintura
  // =========================================================================

  function pintarMensagem() {
    for (const s of [statusModo, statusLobby]) {
      s.textContent = mensagem || ''
      marca(s, 'ruim', tomMensagem === 'ruim')
      marca(s, 'bom', tomMensagem === 'bom')
      marca(s, 'pisca', false)
      void s.offsetWidth        // reinicia a animacao de entrada
      marca(s, 'pisca', !!mensagem)
    }
  }

  function pintarLobby() {
    const gente = Array.isArray(sala.jogadores) ? sala.jogadores : []
    for (let i = 0; i < VAGAS; i++) {
      const v = vagas[i]
      const j = gente[i]
      if (!j) {
        marca(v.raiz, 'cheia', false)
        marca(v.raiz, 'vazia', true)
        marca(v.raiz, 'eu', false)
        v.quem.firstChild.nodeValue = 'esperando'
        v.pontos.style.display = ''
        v.coroa.style.display = 'none'
        v.est.textContent = ''
        marca(v.est, 'ok', false)
        continue
      }
      marca(v.raiz, 'cheia', true)
      marca(v.raiz, 'vazia', false)
      marca(v.raiz, 'eu', j.id === sala.meuId)
      v.quem.firstChild.nodeValue = texto16(j.nome) || ('Jogador ' + j.id)
      v.pontos.style.display = 'none'
      v.coroa.style.display = j.id === sala.anfitriao ? '' : 'none'
      // Na fase LOBBY ninguem esta "pronto" ainda — pronto e coisa da tela de
      // criacao. Mostrar "pronto: nao" aqui so faria o jogador procurar um
      // botao de pronto que nao existe nesta tela.
      if (sala.fase === 'criando') {
        v.est.textContent = j.pronto ? 'PRONTO' : 'CRIANDO...'
        marca(v.est, 'ok', !!j.pronto)
      } else {
        v.est.textContent = j.id === sala.meuId ? 'VOCE' : 'NA SALA'
        marca(v.est, 'ok', false)
      }
    }

    const n = gente.length
    const souAnfitriao = sala.meuId !== 0 && sala.meuId === sala.anfitriao

    if (sala.fase === 'criando' || sala.fase === 'jogando') {
      // A partida ja saiu do lobby. O botao vira aviso pra ninguem clicar duas
      // vezes enquanto a tela troca.
      btComecar.textContent = 'Comecou! Indo pra criacao'
      btComecar.disabled = true
      subLobby.textContent = 'A mesa fechou. Todo mundo esta criando o personagem agora.'
    } else if (sala.meuId === 0) {
      // Ainda sem BEMVINDO. Dizer "aguardando o anfitriao" aqui seria chute:
      // nem da pra saber ainda se o anfitriao sou eu.
      btComecar.textContent = 'Conectando...'
      btComecar.disabled = true
      subLobby.textContent = 'Procurando o servidor da sala.'
    } else if (souAnfitriao) {
      btComecar.textContent = 'Iniciar o jogo'
      btComecar.disabled = n < 2
      subLobby.textContent = n < 2
        ? 'Voce e o anfitriao. Falta pelo menos mais uma pessoa entrar.'
        : 'Voce e o anfitriao. Quando comecar, todos vao juntos pra criacao de personagem.'
    } else {
      btComecar.textContent = 'Aguardando o anfitriao...'
      btComecar.disabled = true
      subLobby.textContent = 'Quem abriu a sala e quem aperta o botao. Enquanto isso, e so esperar.'
    }
  }

  function pintarOpcoes() {
    barraVol.value = String(val.volume)
    valVol.textContent = val.volume + '%'
    marca(btSombraAlta, 'sel', val.sombras === 'alta')
    marca(btSombraBaixa, 'sel', val.sombras === 'baixa')
    marca(btInvSim, 'sel', val.inverterMouse === true)
    marca(btInvNao, 'sel', val.inverterMouse === false)
    barraSens.value = String(val.sensibilidade)
    valSens.textContent = val.sensibilidade.toFixed(2)
    // Nao pisa no que a pessoa esta digitando: reescrever o value com o campo
    // focado joga o cursor pro fim a cada letra.
    if (document.activeElement !== campoNome) campoNome.value = val.nome
  }

  // =========================================================================
  // Opcoes: gravar e avisar
  // =========================================================================

  let gravarPendente = 0

  /** A escrita de verdade. Separada porque o dispose precisa dela SEM o atraso. */
  function gravarAgora() {
    gravarPendente = 0
    try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify(val)) } catch (err) { void err }
    // Espelha o nome na chave que o main ja le no boot (ver CHAVE_NOME).
    try { if (val.nome) localStorage.setItem(CHAVE_NOME, val.nome) } catch (err) { void err }
  }

  function gravar() {
    // Agrupa gravacoes: arrastar a barra de sensibilidade dispara 'input' a
    // cada pixel, e localStorage.setItem e sincrono — gravar em todos travaria
    // a barra debaixo do dedo.
    if (gravarPendente) return
    gravarPendente = setTimeout(gravarAgora, 250)
  }

  /** Uma opcao mudou POR CLIQUE do jogador: guarda, redesenha e avisa o main. */
  function trocar(chave, bruto) {
    let v = bruto
    if (chave === 'volume') v = Math.round(limitar(bruto, 0, 100))
    else if (chave === 'sensibilidade') v = limitar(bruto, SENS_MIN, SENS_MAX)
    else if (chave === 'sombras') v = bruto === 'baixa' ? 'baixa' : 'alta'
    else if (chave === 'inverterMouse') v = !!bruto
    else if (chave === 'nome') v = texto16(bruto)
    if (val[chave] === v) return
    val[chave] = v
    gravar()
    pintarOpcoes()
    // O aviso NAO e agrupado: a sensibilidade tem que mudar debaixo do dedo,
    // senao o jogador nao consegue calibrar arrastando.
    if (typeof cb.aoTrocarOpcao === 'function') {
      try { cb.aoTrocarOpcao(chave, v) } catch (err) { console.warn('[menu] aoTrocarOpcao:', err) }
    }
  }

  // =========================================================================
  // Copiar o endereco
  // =========================================================================

  let copiarTimer = 0
  function avisarCopiado(txt) {
    btCopiar.textContent = txt
    clearTimeout(copiarTimer)
    copiarTimer = setTimeout(() => { btCopiar.textContent = 'Copiar' }, 1800)
  }

  /** Fallback: seleciona o texto pro jogador dar Ctrl+C. */
  function selecionarEndereco() {
    try {
      const r = document.createRange()
      r.selectNodeContents(urlBox)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(r)
      avisarCopiado('Ctrl+C')
    } catch (err) { void err; avisarCopiado('copie a mao') }
  }

  function copiar() {
    if (!endereco) return
    // navigator.clipboard so existe em contexto seguro. Numa LAN o jogo abre em
    // http://192.168.x.x — ou seja, JUSTO no caso que este botao serve, a API
    // costuma nao existir. Por isso o fallback nao e enfeite: e o caminho
    // principal na metade das vezes.
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(endereco).then(
          () => avisarCopiado('Copiado!'),
          () => selecionarEndereco(),
        )
        return
      }
    } catch (err) { void err }
    selecionarEndereco()
  }

  // =========================================================================
  // Navegacao por teclado
  // =========================================================================

  /** Itens focaveis da tela ATIVA, em ordem de leitura. */
  function itens() {
    const t = TELAS[telaAtual]
    if (!t) return []
    const l = []
    const achados = t.querySelectorAll('[data-nav]')
    for (let i = 0; i < achados.length; i++) {
      const e = achados[i]
      if (!e.disabled && e.offsetParent !== null) l.push(e)
    }
    return l
  }

  function mover(passo) {
    const l = itens()
    if (!l.length) return
    let i = l.indexOf(document.activeElement)
    i = i < 0 ? (passo > 0 ? 0 : l.length - 1) : (i + passo + l.length) % l.length
    marca(raiz, 'teclado', true)
    l[i].focus()
  }

  function voltar() {
    // O menu navega SOZINHO pro lugar obvio e avisa o main depois. Assim o
    // botao funciona mesmo se o main nao tratar aoVoltar; e quando trata (sair
    // da sala fecha o socket) ele so chama abrir() de novo, o que e inofensivo.
    const de = telaAtual
    if (de === 'opcoes' || de === 'modo') abrir('principal')
    else if (de === 'lobby') abrir('modo')
    chamar(cb, 'aoVoltar', de)
  }

  function aoTeclar(e) {
    if (!aberto) return
    const alvo = e.target
    const emTexto = alvo && alvo.tagName === 'INPUT' && alvo.type === 'text'

    if (e.key === 'Escape') {
      if (telaAtual !== 'principal') voltar()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      // Vertical SEMPRE navega, inclusive de dentro de um campo: sem isso, quem
      // entra no campo do nome com o teclado nao tem como sair dele.
      mover(e.key === 'ArrowDown' ? 1 : -1)
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'Enter' || e.key === 'NumpadEnter') {
      // Quem responde ao Enter e quem tem o FOCO, nao e.target: os dois sao a
      // mesma coisa num teclado de verdade, mas o alvo some quando o evento
      // vem de fora (um teste, um gamepad emulado, uma extensao).
      // O preventDefault e obrigatorio: <button> ja dispara click sozinho no
      // Enter, e sem cancelar isso o menu avancaria DUAS telas.
      const foco = document.activeElement
      if (emTexto) alvo.blur()
      else if (foco && foco.hasAttribute && foco.hasAttribute('data-nav')) foco.click()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Horizontal e do CONTROLE: barra anda de um passo, campo move o cursor,
      // e o par ALTA/BAIXA troca de lado. Por isso aqui nao ha preventDefault.
      const par = alvo && alvo.parentNode
      if (par && par.classList && par.classList.contains(P + 'seg')) {
        const irmaos = par.children
        const i = Array.prototype.indexOf.call(irmaos, alvo)
        const j = e.key === 'ArrowRight' ? (i + 1) % irmaos.length : (i - 1 + irmaos.length) % irmaos.length
        marca(raiz, 'teclado', true)
        irmaos[j].focus()
        irmaos[j].click()
        e.preventDefault()
      }
      e.stopPropagation()
      return
    }
    // Todo o resto morre aqui: com o menu aberto o jogo nao pode ouvir tecla
    // nenhuma (digitar o nome trocaria de arma e mudaria a estacao).
    e.stopPropagation()
  }

  // Mexeu o mouse, o anel de foco de teclado some. Um anel dourado esquecido no
  // botao que a pessoa acabou de clicar parece bug.
  function aoMexerMouse() { marca(raiz, 'teclado', false) }

  // O menu engole todo evento de ponteiro: sem isto, clicar em INICIAR tambem
  // virava tiro/interacao no mundo que continua desenhando atras.
  function engolir(e) { e.stopPropagation() }
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    raiz.addEventListener(ev, engolir)
  }
  raiz.addEventListener('mousemove', aoMexerMouse)

  // Se qualquer outro sistema re-trancar o ponteiro com o menu aberto (o main
  // faz isso no clique da tela), solta de novo: menu aberto com mouse preso e
  // um monte de botao que nao da pra clicar.
  function aoTrancarMouse() {
    if (aberto && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  // =========================================================================
  // Abrir / fechar
  // =========================================================================

  function abrir(nome) {
    const alvo = TELAS[nome] ? nome : 'principal'
    if (TELAS[telaAtual]) marca(TELAS[telaAtual], 'ativa', false)
    telaAtual = alvo
    marca(TELAS[alvo], 'ativa', true)
    if (alvo === 'lobby') pintarLobby()
    if (alvo === 'opcoes') pintarOpcoes()
    pintarMensagem()
    palco.scrollTop = 0

    if (!aberto) {
      aberto = true
      clearTimeout(fechando)
      raiz.style.display = ''
      raiz.setAttribute('aria-hidden', 'false')
      window.addEventListener('keydown', aoTeclar, true)
      document.addEventListener('pointerlockchange', aoTrancarMouse)
      try { document.exitPointerLock() } catch (err) { void err }
      requestAnimationFrame(() => marca(raiz, 'on', true))
    }
    // Foca o primeiro item DEPOIS do quadro: a tela que acabou de virar
    // 'ativa' ainda tem display:none no quadro atual, e .focus() num elemento
    // invisivel nao pega.
    requestAnimationFrame(() => {
      if (!aberto || telaAtual !== alvo) return
      const l = itens()
      if (l.length) l[0].focus()
    })
  }

  function fechar() {
    if (!aberto) return
    aberto = false
    window.removeEventListener('keydown', aoTeclar, true)
    document.removeEventListener('pointerlockchange', aoTrancarMouse)
    marca(raiz, 'on', false)
    marca(raiz, 'teclado', false)
    raiz.setAttribute('aria-hidden', 'true')
    if (document.activeElement && raiz.contains(document.activeElement)) {
      try { document.activeElement.blur() } catch (err) { void err }
    }
    // O .on ja tirou o pointer-events; o display:none no fim do fade e pro
    // menu fechado nao custar nem uma camada de blur por quadro (o veu tem
    // backdrop-filter, que o compositor paga mesmo com opacidade 0).
    clearTimeout(fechando)
    fechando = setTimeout(() => { if (!aberto) raiz.style.display = 'none' }, 220)
  }

  // Estado inicial: montado, invisivel, sem custo.
  pintarOpcoes()
  pintarLobby()
  raiz.style.display = 'none'

  return {
    abrir,
    fechar,

    get aberto() { return aberto },
    get tela() { return telaAtual },

    /**
     * Estado da sala vindo da rede: { fase, anfitriao, meuId, jogadores }.
     * Pode chegar a qualquer hora (inclusive com o menu fechado ou noutra
     * tela) — guarda sempre, redesenha so se o lobby estiver na frente.
     */
    setSala(estado) {
      const e = estado || {}
      sala.fase = e.fase === 'criando' || e.fase === 'jogando' ? e.fase : 'lobby'
      sala.anfitriao = Number(e.anfitriao) || 0
      // meuId so e sobrescrito quando REALMENTE vem no pacote. A foto da sala
      // que o cliente-rede.js emite (e o rede.sala que o main tem na mao) leva
      // fase, anfitriao e jogadores, mais nada — o meuId chega uma vez so, no
      // BEMVINDO. Zerar aqui a cada foto trancava o lobby em "Conectando..."
      // pra sempre, e o anfitriao nunca mais via o botao de comecar.
      if (e.meuId !== undefined && e.meuId !== null) sala.meuId = Number(e.meuId) || 0
      // Copia a lista em vez de guardar a referencia: quem manda pode reusar o
      // mesmo array no proximo pacote, e ai o menu estaria desenhando um
      // estado que muda debaixo dele.
      const lista = Array.isArray(e.jogadores) ? e.jogadores : []
      sala.jogadores.length = 0
      for (let i = 0; i < lista.length && i < VAGAS; i++) {
        const j = lista[i] || {}
        sala.jogadores.push({ id: Number(j.id) || 0, nome: texto16(j.nome), pronto: !!j.pronto })
      }
      pintarLobby()
    },

    /** Linha de status ("conectando...", "sala cheia"). tom: 'ruim' | 'bom'. */
    setMensagem(txt, tom) {
      mensagem = txt ? String(txt) : ''
      tomMensagem = tom === 'ruim' || tom === 'bom' ? tom : ''
      pintarMensagem()
    },

    /**
     * O main empurra valores (na maioria das vezes os que ele mesmo leu de
     * lerOpcoes no boot). NAO dispara aoTrocarOpcao de volta: isso seria o
     * menu mandando o main aplicar o que o main acabou de mandar.
     */
    setOpcoes(valores) {
      const v = valores || {}
      if (v.volume !== undefined) val.volume = Math.round(limitar(v.volume, 0, 100))
      if (v.sombras !== undefined) val.sombras = v.sombras === 'baixa' ? 'baixa' : 'alta'
      if (v.inverterMouse !== undefined) val.inverterMouse = !!v.inverterMouse
      if (v.sensibilidade !== undefined) val.sensibilidade = limitar(v.sensibilidade, SENS_MIN, SENS_MAX)
      if (v.nome !== undefined) val.nome = texto16(v.nome)
      gravar()
      pintarOpcoes()
    },

    /**
     * Os VALORES das opcoes agora, ja limpos. Copia: mexer nela nao mexe no
     * menu. Nao se chama 'opcoes' de proposito — no construtor essa palavra ja
     * quer dizer os callbacks, e dois 'opcoes' com sentidos diferentes no
     * mesmo arquivo seria pedir pro integrador errar.
     */
    get opcoesAtuais() { return Object.assign({}, val) },

    /**
     * Existe pra fechar o contrato com o main. Nao faz nada de proposito: toda
     * animacao daqui e CSS (a corrida das lampadas, o flicker, os pontinhos),
     * entao o menu funciona igual se o laco de render nunca chamar isto — e
     * nao ha uma unica alocacao por quadro para o coletor.
     */
    atualizar() {},

    dispose() {
      fechar()
      // Descarrega a gravacao que estava na fila ANTES de matar o timer. O
      // main fecha e joga fora o menu no mesmo instante em que a partida
      // comeca; sem isto, quem mexeu na sensibilidade nos 250 ms antes de
      // apertar INICIAR perdia o ajuste sem nenhum aviso.
      if (gravarPendente) { clearTimeout(gravarPendente); gravarAgora() }
      clearTimeout(fechando)
      clearTimeout(copiarTimer)
      window.removeEventListener('keydown', aoTeclar, true)
      document.removeEventListener('pointerlockchange', aoTrancarMouse)
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
    },
  }
}

export default criarMenu
