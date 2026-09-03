// ---------------------------------------------------------------------------
// src/cassino/faixa-mesa.js — A FAIXA DE RODAPE DA MESA.
//
// O que ela substitui: o painel modal de 920 px que cobria a tela inteira
// quando o jogador apertava E na mesa de blackjack. O pedido foi direto — "nao
// quero que ao iniciar o blackjack surja um HUD, quero que aproxime na mesa,
// como se fosse um simulador". A mesa agora acontece em 3D, no feltro; o que
// resta pra tela e o que a MAO precisa saber e os botoes que ela precisa
// apertar. Nada mais.
//
// AS TRES REGRAS DE DESENHO DELA:
//
//   1. NADA COBRE O FELTRO. Tudo mora no rodape e num cabecalho fininho no
//      topo; o meio da tela — que e onde as cartas estao — fica limpo. O unico
//      elemento que entra no meio e o CARTAZ (anunciar), e ele so aparece por
//      um segundo e meio, em momento de resultado, quando nao ha decisao a
//      tomar olhando as cartas.
//   2. A RAIZ ENGOLE O MOUSE, mesmo sendo transparente. Nao e capricho: o
//      main.js pede pointer lock em todo clique no canvas, e clique que escapa
//      pro canvas com a mesa aberta prenderia o ponteiro no meio da mao — o
//      jogador ficaria vendo botao que nao consegue clicar. A raiz cobre a tela
//      inteira e para todo evento de mouse ali.
//   3. VIDRO ESCURO E DOURADO, NUNCA JANELA BRANCA. A faixa e a mesma
//      linguagem do cassino (feltro, bordo, ouro fosco) e nao a de um
//      formulario. Ela tem que parecer o balcao, nao o navegador.
//
// Este arquivo NAO conhece regra de jogo nem carteira: recebe rotulos, valores
// e funcoes de clique. Quem sabe o que "DOBRAR" custa e ui/cassino-ui.js.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-mesa-style'
const P = 'mcrp-mesa-'

/** Cor da ficha por valor — a MESMA tabela do feltro 3D (DENOM em
 *  cassino/mesa-3d.js) e do painel antigo. As duas sao a MESMA tabela por
 *  contrato: mexeu numa, mexe na outra.
 *  Depois de duas maos o jogador reconhece "a bordo" sem ler o numero. */
const COR_FICHA = {
  1: '#e8e2d2', 5: '#4a6f8f', 10: '#7a5ea8', 25: '#2f8f5b',
  50: '#2f6f9f', 100: '#23262e', 250: '#8f2f45', 500: '#c9a24a',
}

/** A cor das INSERCOES (as 8 manchas do aro e a pastilha do meio) e a do numero.
 *
 * Mesma regra do shader da ficha 3D: a insercao existe pra CONTRASTAR com a
 * ficha, entao ficha escura leva insercao creme e ficha clara leva insercao
 * escura — marfim com mancha marfim nao e ficha, e disco. O corte e 0.75 e nao
 * o 0.52 do shader porque la a luminancia e LINEAR e aqui e sRGB direto do
 * hex; 0.75 e o valor que separa so a de 1 (0.89) e deixa a dourada (0.64) com
 * mancha creme, que e o mesmo resultado do 3D.
 */
function insercaoDe(hex) {
  const n = parseInt(String(hex).slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  // 'spa' e a mesma cor com alfa: a pastilha do meio nao e creme CHAPADO, e
  // creme deixando a cor da ficha subir por baixo (o mesmo 'sp: 0.62' que o
  // perfil 3D usa no miolo). Pastilha opaca ocupa metade do diametro e a ficha
  // vira um circulo branco com anel colorido — some justamente a cor, que e o
  // que o jogador usa pra reconhecer o valor de longe.
  return lum > 0.75
    ? { sp: '#14161b', spa: 'rgba(20,22,27,.70)', tx: '#efe9dc' }
    : { sp: '#efe9dc', spa: 'rgba(239,233,220,.72)', tx: '#23252c' }
}

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

function marca(e, nome, ligado) {
  if (e) e.classList.toggle(P + nome, !!ligado)
}

/** Numero com separador de milhar: 12500 -> 12.500. */
function num(v) {
  const n = Math.max(0, Math.floor(Number(v)) || 0)
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const CSS = `
.${P}raiz, .${P}raiz *{ box-sizing:border-box; }
.${P}raiz{
  position:fixed; inset:0; z-index:68; pointer-events:none;
  font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;
  color:#f2ece0; opacity:0; transition:opacity .2s ease;
  -webkit-font-smoothing:antialiased; user-select:none;
}
/* a raiz vira "auto" ao abrir: ela precisa comer o clique que iria pro canvas */
.${P}raiz.${P}on{ opacity:1; pointer-events:auto; }

/* vinheta: escurece so as bordas, o feltro no meio continua limpo */
.${P}vinheta{
  position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(120% 78% at 50% 42%, rgba(0,0,0,0) 42%, rgba(0,0,0,.42) 82%, rgba(0,0,0,.66) 100%);
  opacity:0; transition:opacity .35s ease;
}
.${P}raiz.${P}on .${P}vinheta{ opacity:1; }

/* clarao de resultado: dourado no premio, bordo no estouro */
.${P}flash{
  position:absolute; inset:0; pointer-events:none; opacity:0;
  background:radial-gradient(90% 70% at 50% 45%, rgba(255,214,128,.30), rgba(255,190,90,0) 70%);
}
.${P}flash.${P}bom{ animation:${P}flashBom .55s ease-out; }
.${P}flash.${P}ruim{
  background:radial-gradient(110% 90% at 50% 50%, rgba(120,10,24,.28), rgba(20,0,4,.72) 78%);
  animation:${P}flashRuim .48s ease-out;
}
@keyframes ${P}flashBom{ 0%{ opacity:0; } 18%{ opacity:1; } 100%{ opacity:0; } }
@keyframes ${P}flashRuim{ 0%{ opacity:0; } 12%{ opacity:1; } 100%{ opacity:0; } }

/* --- cabecalho: placa fina no topo --- */
.${P}topo{
  position:absolute; top:0; left:0; right:0;
  display:flex; align-items:center; gap:16px;
  padding:10px 22px 12px;
  background:linear-gradient(180deg, rgba(6,10,9,.80), rgba(6,10,9,0));
  transform:translateY(-14px); opacity:0;
  transition:transform .28s cubic-bezier(.18,.9,.3,1.1), opacity .22s ease;
}
.${P}raiz.${P}on .${P}topo{ transform:none; opacity:1; }
.${P}quem{ flex:1; min-width:0; }
.${P}kicker{ font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:#e9c46a; font-weight:700; }
.${P}titulo{ margin:1px 0 0; font-size:20px; font-weight:700; letter-spacing:.01em; text-shadow:0 2px 10px rgba(0,0,0,.8); }
.${P}bolso{ display:flex; gap:8px; align-items:center; flex:0 0 auto; }
.${P}moeda{
  display:flex; align-items:center; gap:7px; padding:6px 13px; border-radius:999px;
  background:rgba(0,0,0,.46); border:1px solid rgba(233,196,106,.24);
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
}
.${P}moeda b{ font-variant-numeric:tabular-nums; font-size:15px; font-weight:700; }
.${P}pino{ width:14px; height:14px; border-radius:50%; flex:0 0 auto; box-shadow:inset 0 -2px 3px rgba(0,0,0,.45); }
.${P}pino.${P}ouro{ background:radial-gradient(circle at 35% 30%,#ffe89a,#e0a713 62%,#a97a06); }
/* a mesma ficha do rodape, em 14 px: pastilha no meio, insercoes no aro. Em
   14 px nao cabe mask nenhum — o radial de cima simplesmente TAPA o miolo do
   conico, e a mancha so sobra na beirada. */
.${P}pino.${P}ficha{
  background:
    radial-gradient(circle closest-side at 50% 32%, #ffc9c9 0 26%, #d33a4d 28% 62%, rgba(0,0,0,0) 64%),
    repeating-conic-gradient(from -13deg, #f0eadd 0 13deg, #a51f31 13deg 45deg);
  box-shadow:inset 0 -2px 3px rgba(0,0,0,.5), inset 0 0 0 1px rgba(0,0,0,.35);
}

/* --- cartaz do meio: so em momento de resultado --- */
.${P}cartaz{
  position:absolute; left:0; right:0; top:22%;
  text-align:center; pointer-events:none; opacity:0;
}
.${P}cartaz b{
  display:inline-block; padding:9px 30px; border-radius:14px;
  font-size:clamp(22px,3.6vw,42px); font-weight:700; letter-spacing:.10em; text-transform:uppercase;
  color:#fff4d6; background:linear-gradient(180deg, rgba(20,26,24,.72), rgba(8,12,11,.82));
  border:1px solid rgba(233,196,106,.55);
  box-shadow:0 18px 50px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.10);
  text-shadow:0 3px 16px rgba(0,0,0,.8);
}
.${P}cartaz small{
  display:block; margin-top:7px; font-size:13px; letter-spacing:.06em;
  color:#d8cdb4; text-shadow:0 2px 8px rgba(0,0,0,.9);
}
.${P}cartaz.${P}on{ animation:${P}cartaz 1.7s cubic-bezier(.2,.9,.3,1.1) both; }
.${P}cartaz.${P}top b{ color:#241c0c; background:linear-gradient(180deg,#ffe6ab,#e2a83c); border-color:transparent; }
.${P}cartaz.${P}ruim b{ color:#ffe2e6; border-color:rgba(201,57,79,.7); }
@keyframes ${P}cartaz{
  0%{ opacity:0; transform:translateY(16px) scale(.9); }
  12%{ opacity:1; transform:none; }
  78%{ opacity:1; transform:none; }
  100%{ opacity:0; transform:translateY(-10px) scale(1.02); }
}

/* --- a faixa --- */
.${P}faixa{
  position:absolute; left:0; right:0; bottom:0;
  display:flex; align-items:flex-end; gap:18px; flex-wrap:wrap;
  padding:14px clamp(14px,3vw,34px) clamp(14px,2.4vh,22px);
  background:linear-gradient(180deg, rgba(4,8,7,0) 0%, rgba(5,10,9,.72) 34%, rgba(4,7,6,.94) 100%);
  transform:translateY(22px); opacity:0;
  transition:transform .30s cubic-bezier(.18,.9,.3,1.1), opacity .24s ease;
}
.${P}raiz.${P}on .${P}faixa{ transform:none; opacity:1; }
.${P}faixa::before{
  content:''; position:absolute; left:0; right:0; top:0; height:1px;
  background:linear-gradient(90deg, rgba(233,196,106,0), rgba(233,196,106,.55) 22%, rgba(233,196,106,.55) 78%, rgba(233,196,106,0));
}

.${P}col{ display:flex; flex-direction:column; gap:8px; }
.${P}col.${P}cresce{ flex:1 1 260px; min-width:200px; }
.${P}rot{ font-size:9.5px; letter-spacing:.22em; text-transform:uppercase; color:#8f9aa4; font-weight:700; }
.${P}valor{ font-size:26px; font-weight:700; font-variant-numeric:tabular-nums; color:#ffe1a4; line-height:1; text-shadow:0 2px 10px rgba(0,0,0,.8); }
.${P}valor small{ font-size:11px; color:#8f9aa4; letter-spacing:.08em; margin-left:7px; font-weight:600; }
.${P}recado{ font-size:13.5px; font-weight:600; color:#cfc4ac; min-height:19px; text-shadow:0 2px 8px rgba(0,0,0,.85); }
.${P}recado.${P}bom{ color:#9fe6b4; }
.${P}recado.${P}ruim{ color:#f2a2a2; }
.${P}recado.${P}pisca{ animation:${P}pisca .4s ease; }
@keyframes ${P}pisca{ 0%{ transform:translateX(-5px); opacity:.35; } 100%{ transform:none; opacity:1; } }
.${P}dica{ font-size:10.5px; color:#77808c; letter-spacing:.05em; }

/* --- fichas clicaveis -------------------------------------------------------
 *
 * Eram circulos com 'border:3px dashed', que e a coisa mais parecida com ficha
 * que o CSS faz de graca — e nao e parecida. Uma ficha de cassino nao tem
 * tracejado: tem INSERCOES, quatro camadas concentricas e espessura.
 *
 * As camadas, de fora pra dentro, e como cada uma e feita:
 *   - o corpo de argila       : degrade radial + inset shadow em baixo (o
 *                               volume) e em cima (o verniz)
 *   - as 8 insercoes do aro   : repeating-conic-gradient de 22,5 em 22,5 graus,
 *                               RECORTADO por um mask radial pra viver so nos
 *                               20% de fora. Setor tem QUINA; dashed nao tem.
 *   - o chanfro               : uma listra clara de 1px em 80% do raio
 *   - a pastilha do meio      : ::after com anel escuro por fora (box-shadow
 *                               0 0 0 2px) e sombra por dentro (o rebaixo)
 *
 * As fracoes de raio (pastilha em ~50%, insercao a partir de 80%) sao as
 * MESMAS do PERFIL_FICHA do 3D de proposito: a ficha do rodape e a mesma peca
 * da que cai no feltro, e o olho compara as duas o tempo todo.
 *
 * O 'pop' do clique ANIMA o proprio botao, entao por 0,3 s ele ganha do
 * 'fichaHalo' da selecionada (regra de cascata: animacao ganha de declaracao
 * normal, e as duas mexem em coisas diferentes mas na mesma propriedade
 * 'animation'). E de proposito — nesses 0,3 s quem esta contando a historia e
 * a onda dourada, nao o halo.
 */
.${P}fichas{ display:flex; flex-wrap:wrap; gap:11px; align-items:center; padding:3px 0 5px; }
.${P}fichabt{
  position:relative; appearance:none; -webkit-appearance:none; border:0; padding:0;
  cursor:pointer; font:inherit; flex:0 0 auto;
  width:50px; height:50px; border-radius:50%;
  display:grid; place-items:center;
  background:
    radial-gradient(circle closest-side at 50% 24%, rgba(255,255,255,.32), rgba(255,255,255,0) 74%),
    radial-gradient(circle closest-side, rgba(0,0,0,0) 0 77%, rgba(255,255,255,.13) 79% 84%, rgba(0,0,0,0) 86%),
    var(--${P}c,#2f8f5b);
  box-shadow:
    0 7px 15px rgba(0,0,0,.55),
    inset 0 -7px 12px rgba(0,0,0,.44),
    inset 0 5px 9px rgba(255,255,255,.16),
    inset 0 0 0 1px rgba(0,0,0,.32);
  transition:transform .13s cubic-bezier(.2,.9,.3,1.5), filter .14s, opacity .14s;
}
/* as 8 insercoes, so nos 20% de fora do raio */
.${P}fichabt::before{
  content:''; position:absolute; inset:0; border-radius:50%; pointer-events:none;
  background:repeating-conic-gradient(from -11.25deg,
    var(--${P}sp,#efe9dc) 0 22.5deg, rgba(0,0,0,0) 22.5deg 45deg);
  -webkit-mask:radial-gradient(circle closest-side, rgba(0,0,0,0) 0 79%, #000 80%);
  mask:radial-gradient(circle closest-side, rgba(0,0,0,0) 0 79%, #000 80%);
  box-shadow:inset 0 -7px 12px rgba(0,0,0,.34);
}
/* a pastilha rebaixada do meio, com o anel escuro em volta */
.${P}fichabt::after{
  content:''; position:absolute; left:50%; top:50%; width:50%; height:50%;
  transform:translate(-50%,-50%); border-radius:50%; pointer-events:none;
  background:
    radial-gradient(circle closest-side at 50% 28%, rgba(255,255,255,.42), rgba(255,255,255,0) 80%),
    linear-gradient(var(--${P}spa,rgba(239,233,220,.72)), var(--${P}spa,rgba(239,233,220,.72)));
  box-shadow:
    0 0 0 2px rgba(0,0,0,.36),
    inset 0 2px 4px rgba(0,0,0,.34),
    inset 0 -1px 0 rgba(255,255,255,.40);
}
/* o numero e GRAVADO na pastilha: luz embaixo, sombra em cima */
.${P}fichabt .${P}num{
  position:relative; z-index:2; font-size:12.5px; font-weight:800; letter-spacing:-.02em;
  color:var(--${P}tx,#23252c);
  text-shadow:0 1px 0 rgba(255,255,255,.5), 0 -1px 0 rgba(0,0,0,.20);
}
/* o anel que estoura no clique. Elemento proprio e nao box-shadow do botao
   porque a selecionada JA usa a box-shadow dela pro halo, e as duas brigariam */
.${P}fichabt .${P}onda{
  position:absolute; inset:-3px; border-radius:50%; pointer-events:none; z-index:3;
  border:3px solid rgba(255,226,158,.95); opacity:0; transform:scale(.84);
  box-shadow:0 0 10px rgba(255,214,128,.5);
}

.${P}fichabt.${P}sel{ animation:${P}fichaHalo 1.3s ease-in-out infinite; }
/* pega e inclina: ficha girada de leve mostra que as insercoes sao setores */
.${P}fichabt:hover:not([disabled]){ transform:translateY(-5px) rotate(-7deg) scale(1.07); }
.${P}fichabt:active:not([disabled]){ transform:translateY(-1px) scale(.95); }
.${P}fichabt.${P}pop{ animation:${P}fichaPop .30s cubic-bezier(.2,.9,.3,1.5); }
.${P}fichabt.${P}pop .${P}onda{ animation:${P}fichaOnda .46s cubic-bezier(.16,.8,.3,1) both; }
.${P}fichabt[disabled]{
  opacity:.26; cursor:default; transform:none; animation:none;
  filter:grayscale(.55) brightness(.82);
}
@keyframes ${P}fichaHalo{
  0%,100%{ box-shadow:0 0 0 2px rgba(233,196,106,.90), 0 7px 15px rgba(0,0,0,.55),
    inset 0 -7px 12px rgba(0,0,0,.44), inset 0 5px 9px rgba(255,255,255,.16); }
  50%{ box-shadow:0 0 0 3px rgba(255,217,138,.95), 0 0 17px 4px rgba(233,196,106,.45),
    0 7px 15px rgba(0,0,0,.55), inset 0 -7px 12px rgba(0,0,0,.44), inset 0 5px 9px rgba(255,255,255,.16); }
}
/* termina exatamente no estado de hover: o ponteiro continua em cima do botao
   depois do clique, e parar num transform diferente daria um salto */
@keyframes ${P}fichaPop{
  0%{ transform:translateY(-3px) scale(.90) rotate(4deg); }
  45%{ transform:translateY(-11px) scale(1.13) rotate(-13deg); }
  100%{ transform:translateY(-5px) scale(1.07) rotate(-7deg); }
}
@keyframes ${P}fichaOnda{
  0%{ opacity:1; transform:scale(.80); border-width:4px; }
  55%{ opacity:.46; }
  100%{ opacity:0; transform:scale(1.9); border-width:1px; }
}

/* --- botoes --- */
.${P}botoes{ display:flex; gap:9px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
.${P}btn{
  appearance:none; cursor:pointer; font:inherit; font-size:13px; font-weight:700; letter-spacing:.06em;
  padding:12px 20px; border-radius:11px; color:#e8e0d0; white-space:nowrap;
  background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04));
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 6px 16px rgba(0,0,0,.45);
  transition:background .14s, transform .1s, box-shadow .14s, opacity .14s;
}
.${P}btn:hover{ background:linear-gradient(180deg, rgba(255,255,255,.19), rgba(255,255,255,.08)); }
.${P}btn:active{ transform:translateY(1px); }
.${P}btn[disabled]{ opacity:.30; cursor:default; transform:none; }
.${P}btn[disabled]:hover{ background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04)); }
.${P}btn.${P}ouro{
  color:#241c0c; border-color:transparent;
  background:linear-gradient(180deg,#ffd98a,#e2a83c); box-shadow:0 8px 22px rgba(226,168,60,.34);
}
.${P}btn.${P}ouro:hover{ background:linear-gradient(180deg,#ffe6ab,#f0b64c); }
.${P}btn.${P}verde{
  color:#0b1a13; border-color:transparent;
  background:linear-gradient(180deg,#7ee0a6,#2f9d68); box-shadow:0 8px 22px rgba(47,157,104,.30);
}
.${P}btn.${P}bordo{
  color:#ffe9ec; border-color:rgba(201,57,79,.55);
  background:linear-gradient(180deg,rgba(160,32,52,.80),rgba(109,26,44,.88));
}
.${P}btn.${P}bordo:hover{ background:linear-gradient(180deg,rgba(186,42,64,.9),rgba(132,30,50,.94)); }
.${P}btn.${P}fantasma{
  background:rgba(0,0,0,.34); border-color:rgba(255,255,255,.13); color:#b9c0cb; font-size:12px; padding:10px 15px;
}
.${P}btn.${P}grande{ font-size:15px; padding:14px 28px; letter-spacing:.10em; }
.${P}btn.${P}pisca{ animation:${P}chama 1.1s ease-in-out infinite; }
@keyframes ${P}chama{
  0%,100%{ box-shadow:0 8px 22px rgba(226,168,60,.34); }
  50%{ box-shadow:0 8px 26px rgba(226,168,60,.34), 0 0 0 3px rgba(255,217,138,.45); }
}

@media (max-width:760px){
  .${P}faixa{ gap:10px; padding:10px 12px 12px; }
  .${P}valor{ font-size:21px; }
  /* 42 px: as camadas sao todas em % do raio, entao encolhem juntas. So o
     numero e a sombra e que sao em px e precisam ser puxados na mao. */
  .${P}fichas{ gap:8px; }
  .${P}fichabt{
    width:42px; height:42px;
    box-shadow:
      0 5px 11px rgba(0,0,0,.55),
      inset 0 -6px 10px rgba(0,0,0,.44),
      inset 0 4px 7px rgba(255,255,255,.16),
      inset 0 0 0 1px rgba(0,0,0,.32);
  }
  .${P}fichabt .${P}num{ font-size:11px; }
  .${P}btn{ padding:10px 14px; font-size:12px; }
}
`

function injetarEstilo() {
  if (document.getElementById(ID_ESTILO)) return
  const s = document.createElement('style')
  s.id = ID_ESTILO
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * Monta a faixa. Ela nasce escondida e fora do caminho; quem a usa chama
 * mostrar(true) quando a camera chega na mesa.
 */
export function criarFaixaMesa() {
  injetarEstilo()

  const raiz = el('div', 'raiz')
  raiz.setAttribute('aria-hidden', 'true')
  const vinheta = el('div', 'vinheta')
  const flash = el('div', 'flash')

  // --- topo ---------------------------------------------------------------
  const topo = el('div', 'topo')
  const quem = el('div', 'quem')
  const kicker = el('div', 'kicker', 'MESA')
  const titulo = el('div', 'titulo', 'Mesa')
  quem.append(kicker, titulo)
  const bolso = el('div', 'bolso')
  const moedaOuro = el('div', 'moeda')
  const valOuro = el('b', null, '0')
  moedaOuro.append(el('span', 'pino ouro'), valOuro)
  moedaOuro.title = 'Ouro'
  const moedaFicha = el('div', 'moeda')
  const valFicha = el('b', null, '0')
  moedaFicha.append(el('span', 'pino ficha'), valFicha)
  moedaFicha.title = 'Fichas'
  bolso.append(moedaOuro, moedaFicha)
  topo.append(quem, bolso)

  // --- cartaz do meio -----------------------------------------------------
  const cartaz = el('div', 'cartaz')
  const cartazTxt = el('b', null, '')
  const cartazSub = el('small', null, '')
  cartaz.append(cartazTxt, cartazSub)

  // --- faixa --------------------------------------------------------------
  const faixa = el('div', 'faixa')

  const colValor = el('div', 'col')
  const rotValor = el('div', 'rot', 'Aposta')
  const valorTxt = el('div', 'valor', '0')
  colValor.append(rotValor, valorTxt)

  const colMeio = el('div', 'col cresce')
  const caixaFichas = el('div', 'fichas')
  const recado = el('div', 'recado', '')
  const dica = el('div', 'dica', 'Esc sai da mesa')
  colMeio.append(caixaFichas, recado, dica)

  const colBotoes = el('div', 'col')
  const botoes = el('div', 'botoes')
  colBotoes.append(botoes)

  faixa.append(colValor, colMeio, colBotoes)
  raiz.append(vinheta, flash, topo, cartaz, faixa)
  document.body.appendChild(raiz)

  // A raiz engole TODO evento de mouse. Ver a regra 2 do cabecalho: sem isto,
  // clicar em qualquer canto da tela pede pointer lock ao main.js e o ponteiro
  // some no meio da mao.
  function engolir(e) { e.stopPropagation() }
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    raiz.addEventListener(ev, engolir)
  }

  let aberta = false
  let timerCartaz = 0
  let timerFlash = 0
  const mapaBotoes = new Map()
  let fichasBt = []
  let fichasVal = []

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  function mostrar(v) {
    const on = !!v
    if (on === aberta) return
    aberta = on
    raiz.setAttribute('aria-hidden', on ? 'false' : 'true')
    if (on) requestAnimationFrame(() => marca(raiz, 'on', true))
    else marca(raiz, 'on', false)
  }

  function setCabecalho(k, t) {
    kicker.textContent = k || ''
    titulo.textContent = t || ''
  }

  function setBolso(ouro, fichas, destaque) {
    valOuro.textContent = num(ouro)
    valFicha.textContent = num(fichas)
    // A moeda que NAO vale nesta mesa fica apagada: e o jeito mais curto de
    // dizer "aqui se aposta ouro" sem escrever uma frase.
    moedaOuro.style.opacity = destaque === 'ficha' ? '0.42' : '1'
    moedaFicha.style.opacity = destaque === 'ouro' ? '0.42' : '1'
  }

  function setValor(rotulo, valor, sufixo) {
    rotValor.textContent = rotulo || ''
    valorTxt.textContent = ''
    valorTxt.appendChild(document.createTextNode(num(valor)))
    if (sufixo) valorTxt.appendChild(el('small', null, sufixo))
  }

  function setRecado(txt, tom) {
    recado.textContent = txt || ''
    marca(recado, 'bom', tom === 'bom')
    marca(recado, 'ruim', tom === 'ruim')
    marca(recado, 'pisca', false)
    void recado.offsetWidth
    marca(recado, 'pisca', !!txt)
  }

  function setDica(txt) { dica.textContent = txt || '' }

  /** Fileira de fichas clicaveis. aoClicar(valor) decide o que o valor faz. */
  function definirFichas(valores, aoClicar) {
    caixaFichas.textContent = ''
    fichasBt = []
    fichasVal = valores.slice()
    for (let i = 0; i < valores.length; i++) {
      const v = valores[i]
      const cor = COR_FICHA[v] || '#4a6f8f'
      const ins = insercaoDe(cor)
      // Tres filhos e nao so texto: o ::before e o ::after ja estao gastos com
      // as insercoes e a pastilha, entao o numero precisa de um elemento pra
      // ficar POR CIMA das duas camadas, e a onda do clique precisa de outro
      // pra poder estourar pra fora do botao sem mexer no halo da selecionada.
      const b = el('button', 'fichabt')
      b.type = 'button'
      b.style.setProperty('--' + P + 'c', cor)
      b.style.setProperty('--' + P + 'sp', ins.sp)
      b.style.setProperty('--' + P + 'spa', ins.spa)
      b.style.setProperty('--' + P + 'tx', ins.tx)
      b.append(el('i', 'onda'), el('span', 'num', String(v)))
      b.addEventListener('click', () => { estourar(b); aoClicar(v) })
      caixaFichas.appendChild(b)
      fichasBt.push(b)
    }
  }

  /** O "pop" do clique. Tira e recoloca a classe no mesmo quadro (o
   *  offsetWidth no meio e o que forca o reflow) pra a animacao REINICIAR em
   *  cliques seguidos — sem isso, apertar a mesma ficha cinco vezes seguidas
   *  so anima a primeira. */
  function estourar(b) {
    marca(b, 'pop', false)
    void b.offsetWidth
    marca(b, 'pop', true)
    setTimeout(() => marca(b, 'pop', false), 480)
  }

  /** limite = quanto ainda cabe; sel = valor destacado (ou -1). */
  function atualizarFichas(limite, sel) {
    for (let i = 0; i < fichasBt.length; i++) {
      fichasBt[i].disabled = fichasVal[i] > limite
      marca(fichasBt[i], 'sel', fichasVal[i] === sel)
    }
  }

  function mostrarFichas(v) {
    caixaFichas.style.display = v ? '' : 'none'
  }

  /** defs = [{ id, txt, cls, ao }]. Devolve nada; use botao(id) pra mexer. */
  function definirBotoes(defs) {
    botoes.textContent = ''
    mapaBotoes.clear()
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]
      const b = el('button', 'btn' + (d.cls ? ' ' + d.cls : ''), d.txt)
      b.type = 'button'
      if (d.ao) b.addEventListener('click', d.ao)
      botoes.appendChild(b)
      mapaBotoes.set(d.id, b)
    }
  }

  function botao(id) { return mapaBotoes.get(id) || null }

  /**
   * Liga/desliga/renomeia um botao numa chamada so.
   * `cfg`: { ver, ligado, txt, chama } — 'chama' e o pulso dourado do botao
   * principal, que existe pra o jogador nunca ficar procurando o que apertar.
   */
  function ajustar(id, cfg) {
    const b = mapaBotoes.get(id)
    if (!b) return
    if (cfg.txt !== undefined) b.textContent = cfg.txt
    if (cfg.ver !== undefined) b.style.display = cfg.ver ? '' : 'none'
    if (cfg.ligado !== undefined) b.disabled = !cfg.ligado
    if (cfg.chama !== undefined) marca(b, 'pisca', !!cfg.chama && !b.disabled)
  }

  /** O cartaz grande do meio. tom: '' | 'top' | 'ruim'. */
  function anunciar(texto, tom, sub) {
    clearTimeout(timerCartaz)
    cartazTxt.textContent = texto || ''
    cartazSub.textContent = sub || ''
    cartazSub.style.display = sub ? '' : 'none'
    marca(cartaz, 'top', tom === 'top')
    marca(cartaz, 'ruim', tom === 'ruim')
    marca(cartaz, 'on', false)
    void cartaz.offsetWidth
    if (!texto) return
    marca(cartaz, 'on', true)
    timerCartaz = setTimeout(() => marca(cartaz, 'on', false), 1750)
  }

  /** Clarao de tela cheia. tom: 'bom' | 'ruim'. */
  function piscar(tom) {
    clearTimeout(timerFlash)
    marca(flash, 'bom', false)
    marca(flash, 'ruim', false)
    void flash.offsetWidth
    marca(flash, tom === 'ruim' ? 'ruim' : 'bom', true)
    timerFlash = setTimeout(() => {
      marca(flash, 'bom', false)
      marca(flash, 'ruim', false)
    }, 700)
  }

  function dispose() {
    clearTimeout(timerCartaz)
    clearTimeout(timerFlash)
    if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
    mapaBotoes.clear()
  }

  return {
    el: raiz,
    get aberta() { return aberta },
    mostrar,
    setCabecalho,
    setBolso,
    setValor,
    setRecado,
    setDica,
    definirFichas,
    atualizarFichas,
    mostrarFichas,
    definirBotoes,
    botao,
    ajustar,
    anunciar,
    piscar,
    dispose,
  }
}

export default criarFaixaMesa
