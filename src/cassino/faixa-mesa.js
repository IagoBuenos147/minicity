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
// AS REGRAS DE DESENHO DELA:
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
//   4. O EIXO DO RODAPE E O CENTRO DA TELA. A versao anterior era uma linha de
//      tres colunas com os botoes empurrados pra DIREITA: o jogador lia o
//      numero na esquerda, o recado no meio, e so achava o que apertar no canto
//      oposto ao que estava olhando. Agora a ACAO fica no meio da largura e a
//      INFORMACAO vai pras beiradas, que e como uma mesa de verdade se arruma —
//      o pano na frente, o rack e a placa de limite nas laterais. O meio da
//      fileira de botoes bate com o meio da tela em 0 px, medido em toda mao
//      das duas mesas por tools/shot-hud.mjs; o que faz a acao principal
//      saltar dentro dela e o TAMANHO dela, nao a coordenada (ver `.acao`).
//   5. O UNICO BOTAO QUE NAO ANDA COM A FILEIRA E O SAIR DA MESA. Ele fica
//      preso na beirada direita do rodape, com uma portinha desenhada do lado
//      do rotulo. Porta e parte da SALA, nao da mao: ela nao muda de parede
//      quando os moveis mudam de lugar, e com o Hold'em os moveis vao mudar a
//      cada rua. Como ele se solta pra direita sem levar a fileira de acao
//      junto — nem um pixel — esta no bloco do CANTO, no CSS.
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

/* --- a faixa: DOIS ANDARES, UM EIXO SO -------------------------------------
   Andar de cima = INFORMACAO, esparramada nas beiradas (numero na esquerda,
   estado no meio, regra na direita). Andar de baixo = ACAO, no eixo da tela.

   O ORCAMENTO DE ALTURA e a regra dura deste bloco. O meio da tela nao e meu:
   as cartas vivem entre 35% e 78% da altura e a base das pilhas de ficha do
   jogador fica em 86%. Entao a faixa inteira tem que caber DEPOIS de 87%, e
   numa tela de 720 px isso da 93 px de teto. A conta que cabe:

     6 (padding topo) + 25 (linha de informacao) + 4 (respiro)
       + 42 (botao principal) + 11 (padding base)  =  87 px  =  12,1% de 720

   Medido em 1280x720 pelo tools/shot-hud.mjs: o rodape comeca em 87,94%, com
   6 px de folga contra o teto. Se um dia o botao principal precisar de mais
   peso, cresca a LARGURA dele (min-width abaixo), que nao custa altura;
   crescer a ALTURA come a pilha de fichas do jogador. */
.${P}faixa{
  position:absolute; left:0; right:0; bottom:0;
  display:flex; flex-direction:column; gap:4px;
  padding:6px clamp(12px,2.2vw,26px) clamp(10px,1.5vh,16px);
  background:linear-gradient(180deg, rgba(4,8,7,0) 0%, rgba(5,10,9,.60) 30%, rgba(4,7,6,.95) 100%);
  transform:translateY(22px); opacity:0;
  transition:transform .30s cubic-bezier(.18,.9,.3,1.1), opacity .24s ease;
}
.${P}raiz.${P}on .${P}faixa{ transform:none; opacity:1; }
/* O fio de ouro do topo NAO e mais uma barra uniforme: ele acende no meio e
   apaga nas pontas. E o mesmo eixo que a fileira de acao ocupa embaixo, so que
   em luz — de longe o rodape ja aponta pro proprio centro. */
.${P}faixa::before{
  content:''; position:absolute; left:0; right:0; top:0; height:1px;
  background:linear-gradient(90deg,
    rgba(233,196,106,0) 6%, rgba(233,196,106,.18) 24%,
    rgba(255,224,152,.85) 50%, rgba(233,196,106,.18) 76%, rgba(233,196,106,0) 94%);
}

/* --- andar de cima: informacao nas beiradas, estado no meio --- */
.${P}linha{
  display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
  align-items:center; gap:clamp(10px,2vw,26px); min-height:24px;
}
.${P}lado{ display:flex; align-items:baseline; gap:7px; min-width:0; white-space:nowrap; overflow:hidden; }
.${P}rot{ font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:#8a939f; font-weight:700; flex:0 0 auto; }
.${P}rot:empty{ display:none; }
/* O numero e a unica coisa da beirada que compete com o botao — ele tem que
   ser lido de canto de olho, sem virar titulo. 1.75vw da 22 px em 1280.
   O TETO DE 26 px NAO E ESTETICA: e ele quem manda na altura da linha de
   informacao, e essa altura sai do orcamento da faixa. Com 28 px, uma janela
   de 1920x720 empurrava o rodape pra 87.2% — na trave. Com 26 sobra folga em
   toda largura medida (600 a 1920). */
.${P}valor{
  font-size:clamp(20px,1.75vw,26px); font-weight:700; font-variant-numeric:tabular-nums;
  color:#ffe1a4; line-height:1.05; text-shadow:0 2px 10px rgba(0,0,0,.85); flex:0 0 auto;
}
.${P}valor small{ font-size:11px; color:#939ba6; letter-spacing:.06em; margin-left:7px; font-weight:600; }
.${P}aviso{ display:flex; align-items:center; justify-content:center; gap:9px; min-width:0; }
/* A CHAMADA (setChamada) e o unico texto do rodape que pode dar ORDEM. Ela e
   pequena e dourada de proposito: quem grita e o botao, ela so nomeia a vez. */
.${P}chamada{
  font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
  color:#22190a; background:linear-gradient(180deg,#ffdf9e,#e0a93f);
  padding:3px 9px; border-radius:999px; flex:0 0 auto;
  box-shadow:0 2px 10px rgba(226,168,60,.30);
}
.${P}chamada:empty{ display:none; }
/* O ESTALO DA VIRADA. A chamada e uma pastilha de 10 px parada num rodape que
   nao para: trocada em silencio, FLOP virando TURN nao chama o olho de
   ninguem. Com o estalo, o texto NOVO se apresenta e o jogador entende que a
   rodada virou sem precisar ler duas vezes. Ele so dispara quando o texto MUDA
   de verdade (ver setChamada) — a UI reescreve a mesma chamada a cada render, e
   um pulo por quadro seria um tique nervoso. 380 ms: dura o suficiente pra ser
   visto de canto de olho e acaba antes de a proxima carta cair. */
.${P}chamada.${P}vira{ animation:${P}vira .38s cubic-bezier(.2,.9,.3,1.5); }
@keyframes ${P}vira{
  0%{ transform:scale(.80); filter:brightness(1.65); }
  52%{ transform:scale(1.07); filter:brightness(1.12); }
  100%{ transform:none; filter:none; }
}
.${P}recado{
  font-size:13.5px; font-weight:600; color:#ded3bc; min-height:19px; line-height:1.35;
  text-shadow:0 2px 8px rgba(0,0,0,.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.${P}recado.${P}bom{ color:#9fe6b4; }
.${P}recado.${P}ruim{ color:#f2a2a2; }
.${P}recado.${P}entra{ animation:${P}entra .34s cubic-bezier(.2,.9,.3,1.1); }
@keyframes ${P}entra{ 0%{ transform:translateY(4px); opacity:.2; } 100%{ transform:none; opacity:1; } }
/* A dica e REFERENCIA, nao instrucao: uma linha so, cortada com reticencia. Ela
   perdeu a briga por espaco de proposito — o que o jogador precisa AGORA esta
   no botao e no recado. */
.${P}dica{
  font-size:10.5px; color:#79828e; letter-spacing:.04em; text-align:right;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;
}
.${P}tecla{
  display:inline-block; padding:0 5px; margin:0 2px; border-radius:4px;
  font-size:9.5px; font-weight:700; letter-spacing:.06em; color:#e6dcc4;
  background:rgba(255,255,255,.10); border:1px solid rgba(255,255,255,.20);
  border-bottom-width:2px;
}

/* A FILEIRA DE FICHAS CLICAVEIS SAIU DAQUI e foi pro pano, em 3D. O pedido do
   dono foi "quero que fique em cima da mesa as fichas que eu tenho, cada monte
   separadinho por valor": o dinheiro dele virou objeto do mundo (ver caixote()
   em cassino/mesa-3d.js) e um botao redondo no rodape passou a ser a MESMA
   coisa desenhada duas vezes. O que sobrou aqui do desenho de ficha e o pino do
   cabecalho, que continua sendo uma ficha em miniatura. */

/* --- andar de baixo: a fileira de acao ------------------------------------
   TRES GRUPOS NUMA FILA CENTRADA. O pedido era literal — "quero eles
   centralizado e abaixo" — e quem centraliza o BLOCO INTEIRO e o
   justify-content:center da FILA, dentro do trilho do meio da grade: seja qual
   for a combinacao de botoes da vez, o meio da fileira cai no meio da tela (o
   shot-hud.mjs mede isso e reprova acima de 2 px de desvio).

   Ja tentei a outra leitura — prender o botao PRINCIPAL no pixel central, com
   o resto se arrumando em volta. Prende mesmo, mas o preco e o
   bloco todo escorregar: na vez do poker sem ficha no pano ele ficava 66 px a
   direita do centro (medido), porque DESISTIR e SAIR pesam mais que o TUDO
   sozinho do outro lado. E, no blackjack, forcar PEDIR pro centro obrigaria
   PARAR/DOBRAR/DIVIDIR a mudar de ordem — e pedir/parar/dobrar/dividir e uma
   ordem que o jogador ja traz de fora. Bloco centrado ganhou; quem faz o
   principal saltar aqui e o TAMANHO dele, nao a coordenada.

   A ORDEM dentro da fila e a hierarquia:
     ajustes da aposta  |  ACAO (o principal e os irmaos dele)  |  correr da mao

   O SAIR DA MESA NAO ESTA MAIS NESSA FILA — ver o CANTO, logo abaixo. */
.${P}acao{
  display:grid; grid-template-columns:1fr auto 1fr;
  align-items:center; column-gap:10px;
}
/* A fila e o trilho do meio da grade: e ELA que fica centrada na tela, e e ela
   que quebra em duas linhas quando a largura aperta (o trilho encolhe, o
   flex-wrap resolve) em vez de empurrar botao pra fora da tela. */
.${P}fila{
  display:flex; align-items:center; justify-content:center;
  gap:10px; flex-wrap:wrap; min-width:0;
}
.${P}grupo{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.${P}grupo.${P}esq{ justify-content:flex-end; }
.${P}grupo.${P}meio{ justify-content:center; gap:9px; }
/* DESISTIR fica depois de um vao maior que o resto: acao que tira o jogador da
   mao nao pode encostar na que o mantem nela — 18 px de vao (10 daqui + 8 do
   gap) e o que separa "apertei sem querer" de "apertei de proposito". */
.${P}grupo.${P}dir{ justify-content:flex-start; padding-left:10px; }
/* Grupo sem botao visivel sai da fila: senao o gap e o padding-left dele
   continuariam contando e o bloco ficaria torto justo nas maos mais vazias. */
.${P}grupo.${P}vazio{ display:none; }

/* --- o canto: SAIR DA MESA colado na beirada direita ------------------------
   O pedido foi literal — "o sair da mesa localizado a direita". Ele ja caia no
   grupo da direita, mas o grupo da direita ANDA JUNTO com o bloco centralizado:
   a cada rodada os botoes do meio mudam de largura e o SAIR passeava dezenas de
   pixels pra um lado e pro outro. Botao de sair que muda de lugar e botao que
   se procura — e com o Texas Hold'em o rodape troca de botao mais vezes por
   mao, entao esse passeio so ia piorar.

   COMO ELE VAI PRA DIREITA SEM TIRAR A ACAO DO CENTRO. A fileira virou uma
   grade de tres trilhos, 1fr | auto | 1fr. O trilho do meio carrega a fila de
   acao; os dois 1fr dividem em partes IGUAIS o que sobra — e trilho igual dos
   dois lados quer dizer, por construcao, meio da fila no meio da tela (a medida
   que tools/shot-hud.mjs reprova acima de 2 px de desvio). O SAIR mora no
   trilho da direita, encostado no fim dele; e o fim desse trilho e exatamente a
   beirada do rodape.

   O ESPELHO DA ESQUERDA. Dois 1fr so ficam iguais enquanto sobra espaco: no
   aperto, o da direita para de encolher no tamanho do SAIR e o da esquerda
   continua ate zero — e o bloco do meio escorrega pra esquerda meio SAIR. Por
   isso o trilho da esquerda carrega um SAIR INVISIVEL (espelhar(), no JS): a
   mesma caixa, a mesma largura, visibility:hidden. Com o mesmo minimo dos dois
   lados, a fila fica no centro em QUALQUER largura — nao por sorte de caber. */
.${P}canto{ justify-content:flex-end; flex-wrap:nowrap; min-width:auto; }
.${P}canto.${P}espelho{ visibility:hidden; pointer-events:none; justify-content:flex-start; }

/* --- botoes ---------------------------------------------------------------
   TRES PESOS, e a diferenca entre eles e de TAMANHO antes de ser de cor:
     principal (.grande)   42 px de altura, 140..190 px de largura, ouro/verde
     acao      (padrao)    38 px, vidro escuro, largura do rotulo
     ajuste    (.fantasma) 34 px, quase so contorno
   Antes os tres tinham a mesma caixa e so trocavam de cor, e num rodape de
   cinco botoes isso e o mesmo que nao ter hierarquia nenhuma. */
.${P}btn{
  position:relative; overflow:hidden; appearance:none; cursor:pointer; font:inherit;
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  font-size:12.5px; font-weight:700; letter-spacing:.06em;
  min-height:38px; padding:0 18px; border-radius:10px; color:#e8e0d0; white-space:nowrap;
  background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 5px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
  transition:background .14s ease, transform .12s cubic-bezier(.2,.9,.3,1.4),
             box-shadow .16s ease, filter .14s ease, opacity .14s ease;
}
/* PESO NO HOVER, AFUNDAR NO CLIQUE. O -2px do hover e o +1px do active dao 3 px
   de curso: e o minimo que o olho registra como "isto e um objeto" num botao
   de 38 px. Mais que isso e o texto que comeca a tremer. */
.${P}btn:hover{
  background:linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,.08));
  transform:translateY(-2px);
  box-shadow:0 10px 22px rgba(0,0,0,.52), inset 0 1px 0 rgba(255,255,255,.14);
}
.${P}btn:active{
  transform:translateY(1px) scale(.985);
  box-shadow:0 2px 6px rgba(0,0,0,.5), inset 0 2px 7px rgba(0,0,0,.38);
}
/* A ONDA nasce ONDE O DEDO ENCOSTOU (--px/--py sao escritos no pointerdown),
   nao no meio do botao: e o que faz o clique parecer que tocou em alguma coisa
   em vez de so trocar de cor. */
.${P}btn::before{
  content:''; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
  opacity:0; transform-origin:var(--px,50%) var(--py,50%);
  background:radial-gradient(circle at var(--px,50%) var(--py,50%),
    rgba(255,255,255,.62), rgba(255,255,255,.18) 34%, rgba(255,255,255,0) 62%);
}
.${P}btn.${P}onda::before{ animation:${P}onda .46s ease-out; }
@keyframes ${P}onda{
  0%{ opacity:.85; transform:scale(.18); }
  100%{ opacity:0; transform:scale(1.9); }
}
/* ACENDE: o botao ACORDA na hora em que passa a valer.
   Este e o pedido "deixar intuitivo quando apostar" em uma animacao so. O
   jogador empurra uma ficha no pano e o APOSTAR — que estava cinza e mudo —
   estala e ja mostra o preco no rotulo. Sem isso o unico sinal de que a ficha
   entrou era um cinza virando verde do outro lado da tela, que ninguem ve. Ver
   ajustar(): o gatilho e a transicao desligado->ligado e a troca de rotulo,
   nunca o render repetido com o mesmo estado. */
.${P}btn.${P}acende{ animation:${P}acende .40s cubic-bezier(.2,.9,.3,1.5); }
@keyframes ${P}acende{
  0%{ transform:scale(.93); filter:brightness(1.55); }
  55%{ transform:scale(1.045); filter:brightness(1.16); }
  100%{ transform:none; filter:none; }
}
.${P}btn.${P}ouro{
  color:#241c0c; border-color:rgba(255,240,200,.34);
  background:linear-gradient(180deg,#ffdd93,#e2a83c);
  box-shadow:0 8px 20px rgba(226,168,60,.32), inset 0 1px 0 rgba(255,255,255,.45);
}
.${P}btn.${P}ouro:hover{
  background:linear-gradient(180deg,#ffeab6,#f2ba52);
  box-shadow:0 14px 30px rgba(226,168,60,.44), inset 0 1px 0 rgba(255,255,255,.55);
}
.${P}btn.${P}verde{
  color:#07160f; border-color:rgba(190,255,220,.30);
  background:linear-gradient(180deg,#86e6ad,#2f9d68);
  box-shadow:0 8px 20px rgba(47,157,104,.32), inset 0 1px 0 rgba(255,255,255,.35);
}
.${P}btn.${P}verde:hover{
  background:linear-gradient(180deg,#9df0c0,#37b077);
  box-shadow:0 14px 30px rgba(47,157,104,.44), inset 0 1px 0 rgba(255,255,255,.45);
}
/* BORDO VIROU CONTORNO. Bloco vermelho cheio ao lado do botao principal
   disputava o olho com ele — e DESISTIR nunca e a jogada que se quer sugerir.
   Vazado, ele continua sendo reconhecivel de longe pela cor da borda e do
   texto, mas so ganha corpo quando o mouse chega. */
.${P}btn.${P}bordo{
  color:#f3a9b3; border-color:rgba(201,57,79,.55);
  background:linear-gradient(180deg, rgba(84,16,28,.42), rgba(46,10,18,.60));
  box-shadow:0 4px 12px rgba(0,0,0,.42);
}
.${P}btn.${P}bordo:hover{
  color:#ffe9ec; border-color:rgba(226,74,98,.9);
  background:linear-gradient(180deg,rgba(168,34,56,.88),rgba(118,26,44,.94));
  box-shadow:0 10px 22px rgba(150,25,45,.42);
}
.${P}btn.${P}fantasma{
  min-height:34px; padding:0 13px; font-size:11.5px; letter-spacing:.05em;
  background:rgba(0,0,0,.34); border-color:rgba(255,255,255,.12); color:#aab2be;
  box-shadow:0 3px 9px rgba(0,0,0,.36);
}
.${P}btn.${P}fantasma:hover{ color:#e6ecf4; background:rgba(255,255,255,.12); }

/* --- SAIR DA MESA: a portinha ---------------------------------------------
   SAIR NAO E DESISTIR, e o rodape estava dizendo que era. A UI manda o sair
   com 'bordo fantasma': o fantasma (declarado depois) reescreve cor, fundo e
   borda e o botao nasce cinza, certo — mas no HOVER o .bordo:hover pinta a
   BORDA de vermelho e ninguem sobrescreve, entao encostar o mouse no sair
   fazia dele um segundo DESISTIR. Aqui a borda do hover vira ouro fosco: sair
   da mesa e uma porta, correr de uma mao e sangue. Estas regras vem depois de
   .bordo:hover no arquivo de proposito — mesma especificidade, quem vem depois
   ganha.

   O ICONE E ::after, e nao um filho de verdade, pela mesma razao do selo de
   Enter: ajustar({txt}) troca o textContent do botao e apagaria qualquer
   elemento dentro dele.

   POR QUE 15 px. O rotulo tem 11,5 px de letra (caixa alta, ~8 px de altura de
   traco) num botao de 34. Icone do tamanho da letra vira outra letra; acima de
   16 vira ilustracao e engorda um botao que e secundario. 15 px e o ponto em
   que a folha, o vao e a macaneta ainda se separam.

   A PORTA E UMA MASCARA, nao um desenho colorido: a tinta e currentColor, o
   SVG so diz ONDE tem tinta e com QUANTO alfa. Assim o icone acompanha sozinho
   os dois estados do botao (cinza parado, quase branco no hover) e qualquer cor
   que ele venha a ter.

   Os tres pedacos e o alfa de cada um — e o alfa aqui e o desenho: a folha e um
   contorno a 66% com o miolo a 15% (a madeira, que e a parte escura), o VAO e
   cheio a 95%, e a macaneta fica a 80% pra pertencer a folha e nao ao vao. A primeira
   versao tinha contorno a 85% contra vao a 92%: com os dois no mesmo tom o
   olho lia um retangulo com um apendice, e nao uma porta aberta. Quem diz
   "aberta" e a diferenca de luz, nao a forma. O vao abre pra FORA (mais alto na
   beirada de fora) porque o botao mora na beirada direita da tela: a luz aponta
   pra onde o jogador vai.

   O TAMANHO DO BOTAO E DAQUI TAMBEM (as quatro linhas de min-height/padding/
   font-size). Hoje ele chega da UI com 'fantasma' junto e herdaria isso de
   graca, mas se um dia a classe da UI virar so 'sair' o botao pularia pros 38
   px do padrao e ficaria mais pesado que o DESISTIR — repetir o tamanho aqui
   deixa a saida certa com qualquer roupa que a UI mandar. */
.${P}btn.${P}saida:hover{
  color:#f2f6fb; border-color:rgba(233,196,106,.42);
  background:rgba(255,255,255,.13);
}
@supports ((-webkit-mask-image:url('')) or (mask-image:url(''))){
  .${P}btn.${P}saida::after{
    content:''; flex:0 0 auto; width:15px; height:15px; opacity:.92;
    background:currentColor;
    -webkit-mask:var(--porta) center/contain no-repeat;
            mask:var(--porta) center/contain no-repeat;
  }
  .${P}btn.${P}saida:hover::after{ opacity:1; }
}
.${P}btn.${P}saida{
  min-height:34px; padding:0 13px; font-size:11.5px; letter-spacing:.05em;
  --porta:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M10.9 2.9 L15.3 1 V15 L10.9 13.1 Z' fill='white' opacity='.95'/%3E%3Crect x='1.5' y='1.6' width='8.2' height='12.8' rx='1.1' fill='white' fill-opacity='.15' stroke='white' stroke-opacity='.66' stroke-width='1.5'/%3E%3Ccircle cx='7.8' cy='8' r='1' fill='white' fill-opacity='.8'/%3E%3C/svg%3E");
}
/* O PRINCIPAL. Ele nao e "o mesmo botao pintado de ouro": e mais alto, MUITO
   mais largo (min-width) e com a letra mais espacada. Largura e o unico eixo
   de peso que sobra depois do teto de altura — por isso ela e que carrega a
   hierarquia aqui. O clamp deixa o rotulo longo ("JOGAR DE NOVO (250)") caber
   sem quebrar em tela pequena. */
.${P}btn.${P}grande, .${P}btn.${P}promovido{
  min-height:42px; min-width:clamp(140px,14vw,190px); padding:0 26px;
  font-size:15px; letter-spacing:.11em;
}
/* PROMOVIDO: o rodape se recusa a ficar sem um botao principal.
   Entre uma mao e outra do poker o unico botao vivo e PROXIMA MAO, e
   cassino-ui.js o manda com cls 'fantasma' — a roupa mais fraca da faixa, no
   momento em que ele e a UNICA coisa a fazer. Em vez de pedir mudanca la
   (aquele arquivo tem outro dono), a faixa promove sozinha: sem nenhum
   'grande' visivel, o primeiro botao de acao veste o ouro. Ver revisarGrupos. */
.${P}btn.${P}promovido{
  color:#241c0c; border-color:rgba(255,240,200,.34);
  background:linear-gradient(180deg,#ffdd93,#e2a83c);
  box-shadow:0 8px 20px rgba(226,168,60,.32), inset 0 1px 0 rgba(255,255,255,.45);
}
.${P}btn.${P}promovido:hover{
  color:#241c0c; background:linear-gradient(180deg,#ffeab6,#f2ba52);
  box-shadow:0 14px 30px rgba(226,168,60,.44), inset 0 1px 0 rgba(255,255,255,.55);
}
/* A CHAMADA DO BOTAO NAO PISCA. Antes era um box-shadow ligando e desligando a
   cada 1,1 s — no canto do olho isso vira alarme e cansa em duas maos. Agora e
   um anel que nasce na borda, cresce e some, com 2,4 s de ciclo e uma pausa
   longa no fim: chama atencao uma vez, respira, chama de novo. */
.${P}btn.${P}chama{ animation:${P}chama 2.4s cubic-bezier(.22,.7,.3,1) infinite; }
@keyframes ${P}chama{
  0%{ box-shadow:0 8px 20px rgba(226,168,60,.32), 0 0 0 0 rgba(255,222,150,.55), inset 0 1px 0 rgba(255,255,255,.45); }
  46%{ box-shadow:0 10px 26px rgba(226,168,60,.42), 0 0 0 11px rgba(255,222,150,0), inset 0 1px 0 rgba(255,255,255,.5); }
  100%{ box-shadow:0 8px 20px rgba(226,168,60,.32), 0 0 0 0 rgba(255,222,150,0), inset 0 1px 0 rgba(255,255,255,.45); }
}
/* Os dois ao mesmo tempo. A propriedade 'animation' e uma so: sem esta linha o
   .chama (declarado depois) engolia o estalo do .acende e justo o botao mais
   importante da mesa era o unico que nao reagia a ficha entrando. */
.${P}btn.${P}chama.${P}acende{
  animation:${P}acende .40s cubic-bezier(.2,.9,.3,1.5),
            ${P}chama 2.4s cubic-bezier(.22,.7,.3,1) .4s infinite;
}
/* O selo de ENTER so aparece no botao que esta chamando — e cassino-ui.js so
   liga 'chama' em botao que o Enter realmente dispara (o principal() dele),
   entao o selo nunca mente. Ele e ::after de proposito: ajustar({txt}) troca o
   textContent do botao e apagaria qualquer filho de verdade. */
.${P}btn.${P}chama::after{
  content:'\\21B5'; font-size:12px; line-height:1; font-weight:700;
  padding:2px 5px 3px; border-radius:5px; opacity:.82;
  background:rgba(0,0,0,.16); border:1px solid rgba(0,0,0,.20);
}

/* DESLIGADO TEM QUE CONTINUAR LEGIVEL. O opacity .30 de antes apagava o rotulo
   e o jogador nao conseguia ler "TUDO (2.000)" pra entender POR QUE nao da —
   ele so via um borrao. Agora o botao perde a COR (saturate) e o relevo, mas o
   texto fica: quem olha entende que a informacao vale e o botao e que nao.

   Este bloco fica no FIM do arquivo de proposito. As regras de cor
   (.ouro/.verde/.bordo) tem a mesma especificidade que .btn[disabled], entao
   quem vem depois ganha — escrito antes delas, o desligado nao conseguia
   apagar o brilho dourado e um botao morto continuava chamando. */
.${P}btn[disabled], .${P}btn[disabled]:hover{
  cursor:not-allowed; opacity:.62; filter:saturate(.10) brightness(.92);
  box-shadow:none; transform:none; animation:none;
  background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  border-color:rgba(255,255,255,.14); color:#dfd9cd;
}
.${P}btn[disabled]::before, .${P}btn[disabled]::after{ display:none; }
/* PRINCIPAL DESLIGADO PERDE A LARGURA, nao a altura.
   Medido: na vez do poker sem ficha no pano, o AUMENTAR desligado ocupava os
   190 px de largura minima do principal e virava o maior objeto da fileira,
   empurrando o PAGAR — o botao que estava CHAMANDO — 165 px pra esquerda do
   centro. Botao morto nao pode ser o maior da tela. A altura fica nos 42 px de
   proposito: encolher em pe faria a fileira inteira pular de altura toda vez
   que a aposta cruzasse o minimo da mesa. */
.${P}btn.${P}grande[disabled], .${P}btn.${P}promovido[disabled]{
  min-width:0; padding:0 18px; font-size:13px; letter-spacing:.07em;
}

/* --- janela estreita: a ancora e devolvida ---------------------------------
   ATE ONDE DA PRA ANCORAR. Prender o SAIR na beirada E manter a fila no eixo
   da tela custa DUAS larguras de SAIR: a dele na direita e a do espelho na
   esquerda. Sao 262 px de largura que a fila deixa de ter — nao e escolha de
   CSS, e geometria: bloco no centro com objeto encostado numa das bordas so
   fecha se a outra borda reservar o mesmo tanto.

   Medido: na vez do poker (TUDO + PAGAR + AUMENTAR + DESISTIR = 526 px de
   botao), com os 262 da ancora e os vaos, a fila para de caber numa linha por
   volta de 900 px de janela. E quebrar em duas linhas custa 48 px de ALTURA —
   em 820 px a faixa media 135 px e comecava em 81,3% da tela, dentro da regiao
   das pilhas de ficha do jogador. Altura e o orcamento duro deste rodape;
   ancora e conforto. Entao abaixo de 960 (com 110 px de folga pro estado mais
   largo) a grade vira flex de novo, o espelho some e o SAIR fecha a fila — onde
   ele continua sendo o botao mais a direita, so que sem colar na moldura. */
@media (max-width:960px){
  .${P}acao{ display:flex; flex-wrap:wrap; justify-content:center; gap:10px; }
  .${P}canto{ justify-content:flex-start; }
  .${P}canto.${P}espelho{ display:none; }
}

/* --- celular ---------------------------------------------------------------
   Em 760 px nao ha beirada pra tres: a linha de cima vira duas colunas
   (numero na esquerda, estado na direita) e a dica sai de cena inteira — ela e
   regra impressa, a regra nao decide jogada, e metade dela fala de tecla, que
   num telefone nao existe. Embaixo, os grupos deixam de ter coluna propria e
   viram uma fila que quebra sozinha, ainda centrada. O que sobra e exatamente
   o que o dedo precisa: numero, estado e a fileira de acao.

   O SAIR ja voltou pra fila no bloco de cima (960 px); aqui ele so acompanha o
   aperto do resto — que num telefone e o canto direito da ultima linha de
   qualquer jeito. */
@media (max-width:760px){
  .${P}faixa{ gap:3px; padding:5px 10px 9px; }
  .${P}linha{ grid-template-columns:auto minmax(0,1fr); gap:10px; min-height:0; }
  .${P}dica{ display:none; }
  .${P}aviso{ justify-content:flex-end; }
  .${P}valor{ font-size:18px; }
  .${P}recado{ font-size:12px; }
  .${P}acao{ gap:6px; }
  .${P}fila{ gap:6px; }
  .${P}grupo{ justify-content:center !important; padding-left:0; gap:6px; }
  .${P}btn{ min-height:34px; padding:0 13px; font-size:11.5px; }
  .${P}btn.${P}fantasma, .${P}btn.${P}saida{ min-height:30px; padding:0 10px; font-size:10.5px; }
  /* 13 px acompanha a letra de 10,5 px do botao fantasma: mantida em 15, a
     porta ficaria maior que o rotulo que ela ilustra. */
  .${P}btn.${P}saida::after{ width:13px; height:13px; }
  .${P}btn.${P}grande, .${P}btn.${P}promovido{
    min-height:38px; min-width:132px; padding:0 18px; font-size:13.5px;
  }
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

  // andar de cima: numero na beirada esquerda, estado no eixo, regra na direita
  const linha = el('div', 'linha')
  const ladoValor = el('div', 'lado')
  const rotValor = el('div', 'rot', 'Aposta')
  const valorTxt = el('div', 'valor', '0')
  ladoValor.append(rotValor, valorTxt)
  const aviso = el('div', 'aviso')
  const chamada = el('div', 'chamada', '')
  const recado = el('div', 'recado', '')
  aviso.append(chamada, recado)
  const dica = el('div', 'dica', '')
  linha.append(ladoValor, aviso, dica)

  // andar de baixo: os grupos da fileira. Eles sao PERMANENTES — quem troca e
  // o conteudo dentro deles — porque e a ORDEM deles (ajuste, acao, correr)
  // que da a hierarquia, e recria-los a cada definirBotoes deixaria essa ordem
  // na mao de quem chama.
  //
  // Tres deles vivem dentro da FILA, que e o trilho centralizado da grade. O
  // quarto, o CANTO, e um trilho proprio colado na beirada direita: e ali que
  // mora o SAIR DA MESA. O espelho e o trilho gemeo da esquerda, invisivel, que
  // devolve a fila o pixel que o canto tirou da direita (ver espelhar()).
  const acao = el('div', 'acao')
  const fila = el('div', 'fila')
  const espelho = el('div', 'grupo canto espelho')
  espelho.setAttribute('aria-hidden', 'true')
  const grupos = {
    esq: el('div', 'grupo esq'),
    meio: el('div', 'grupo meio'),
    dir: el('div', 'grupo dir'),
    canto: el('div', 'grupo canto'),
  }
  fila.append(grupos.esq, grupos.meio, grupos.dir)
  acao.append(espelho, fila, grupos.canto)

  faixa.append(linha, acao)
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
    marca(recado, 'entra', false)
    void recado.offsetWidth
    marca(recado, 'entra', !!txt)
  }

  /**
   * A CHAMADA: a etiqueta dourada que nomeia a vez ("SUA VEZ", "FLOP", "RIVER").
   *
   * Ela nao repete o recado: recado e o que ACONTECEU, chamada e o que se
   * ESPERA do jogador — ou que rua da mao acabou de entrar no feltro.
   *
   * A ASSINATURA E A MESMA (um texto, ou nada pra apagar). O que mudou por
   * dentro: ela so escreve quando o texto e OUTRO, e nesse caso da o estalo.
   * A guarda nao e economia de DOM, e o proprio efeito — a UI reescreve a mesma
   * chamada a cada render, e sem ela a pastilha pularia uma vez por quadro.
   */
  function setChamada(txt) {
    const novo = txt ? String(txt).toUpperCase() : ''
    if (novo === chamada.textContent) return
    chamada.textContent = novo
    marca(chamada, 'vira', false)
    void chamada.offsetWidth
    marca(chamada, 'vira', !!novo)
  }

  /**
   * A dica com as TECLAS EM RELEVO.
   *
   * O texto chega em prosa ("... · Esc sai da mesa") e a tecla se perde no meio
   * dele. Recortar 'Esc'/'Enter' num <kbd> e a diferenca entre uma frase que
   * ninguem le e um atalho que se ve de relance. O split com grupo de captura
   * devolve os pedacos capturados nos indices IMPARES — e por isso o i % 2.
   */
  function setDica(txt) {
    dica.textContent = ''
    const s = String(txt || '')
    if (!s) return
    const partes = s.split(/\b(Esc|Enter|Espaco|Shift|Tab)\b/)
    for (let i = 0; i < partes.length; i++) {
      if (!partes[i]) continue
      if (i % 2) dica.appendChild(el('kbd', 'tecla', partes[i]))
      else dica.appendChild(document.createTextNode(partes[i]))
    }
  }

  /**
   * EM QUE GRUPO DA FILA O BOTAO CAI.
   *
   * O contrato com ui/cassino-ui.js e por CLASSE, nao por id — 'bordo' ja quer
   * dizer "isto tira o jogador da mao" nas duas mesas. A unica excecao e a
   * lista AJUSTE: 'fantasma' virou classe de dois papeis diferentes (TUDO e
   * TIRAR ajustam a aposta, mas PROXIMA MAO e a jogada da vez), e um PROXIMA
   * MAO tratado como ajuste ficaria na ponta da fila, do tamanho de um TUDO,
   * na unica hora em que ele e a unica coisa a fazer na tela. Estes tres ids
   * sao a lista inteira; qualquer id novo cai no meio, que e o padrao seguro.
   *
   * A SAIDA SAI PELO ID, e nao pela classe, porque hoje nao existe classe pra
   * ela: as duas mesas mandam o sair como 'bordo fantasma' — a mesma roupa do
   * DESISTIR. 'sair' e o unico id de saida das duas listas (poker e blackjack)
   * e ele nunca e outra coisa. A classe 'sair' ja fica aceita pro dia em que a
   * UI quiser dizer isso por classe, que e o contrato do resto do arquivo.
   */
  const AJUSTE = { tudo: 1, devolver: 1, limpar: 1 }
  function ladoDe(d) {
    const cls = ' ' + (d.cls || '') + ' '
    if (d.id === 'sair' || cls.indexOf(' sair ') >= 0) return 'canto'
    if (cls.indexOf(' bordo ') >= 0) return 'dir'
    if (AJUSTE[d.id]) return 'esq'
    return 'meio'
  }

  /**
   * A COPIA INVISIVEL DO CANTO, no trilho da esquerda da grade.
   *
   * O trilho da direita (o SAIR) nunca encolhe abaixo da largura do botao; o da
   * esquerda, vazio, encolhe ate zero. Quando a largura aperta e os dois param
   * de ser iguais, a fila de acao escorrega meio SAIR pra esquerda — e o centro
   * do rodape passa a depender de quanto espaco sobrou, que e exatamente o que
   * a versao anterior conquistou nao depender. Com o clone, o minimo dos dois
   * trilhos e o mesmo e a fila fica no eixo por construcao.
   *
   * O clone e do botao pronto, e nao um espacador de largura fixa, porque ele
   * acompanha sozinho o que mudar no original: rotulo, icone, media query.
   */
  function espelhar() {
    espelho.textContent = ''
    const g = grupos.canto
    for (let i = 0; i < g.children.length; i++) {
      const b = g.children[i]
      if (b.style.display === 'none') continue
      const c = b.cloneNode(true)
      // O style inline do original guarda --px/--py do ultimo clique; num
      // fantasma nao ha o que animar, e display:'' viria junto sem precisar.
      c.removeAttribute('style')
      c.tabIndex = -1
      c.setAttribute('aria-hidden', 'true')
      espelho.appendChild(c)
    }
  }

  /**
   * Tres contas que so podem ser feitas depois de todo `ver` do render:
   *
   *   1. GRUPO VAZIO SAI DA FILA. Um grupo sem botao visivel continuaria
   *      cobrando o gap e o padding-left dele, e o bloco centralizado sairia
   *      do centro justo nas maos mais vazias.
   *   2. SEMPRE HA UM BOTAO PRINCIPAL. Se nenhum 'grande' esta visivel, o
   *      primeiro botao do grupo do MEIO — o das acoes — e promovido ao ouro.
   *      E o caso da espera entre maos do poker, onde PROXIMA MAO chega
   *      vestido de 'fantasma' sendo a unica coisa a fazer na tela. So o meio
   *      concorre: promover um ajuste de aposta (TUDO) a acao principal seria
   *      apontar pro botao errado.
   *   3. O ESPELHO ACOMPANHA O CANTO. Ele e refeito aqui, e nao no
   *      definirBotoes, porque o canto tambem muda quando um botao some ou
   *      volta no meio da mao.
   */
  function revisarGrupos() {
    let temGrande = false
    let primeiro = null
    for (const k of ['esq', 'meio', 'dir', 'canto']) {
      const g = grupos[k]
      let vivo = false
      for (let i = 0; i < g.children.length; i++) {
        const b = g.children[i]
        if (b.style.display === 'none') continue
        vivo = true
        if (k !== 'meio') continue
        if (b.classList.contains(P + 'grande')) temGrande = true
        if (!primeiro) primeiro = b
      }
      marca(g, 'vazio', !vivo)
    }
    for (const b of mapaBotoes.values()) marca(b, 'promovido', !temGrande && b === primeiro)
    espelhar()
  }

  /** defs = [{ id, txt, cls, ao }]. Devolve nada; use botao(id) pra mexer. */
  function definirBotoes(defs) {
    for (const k in grupos) grupos[k].textContent = ''
    mapaBotoes.clear()
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]
      // Quem cai no canto ganha a classe 'saida' AQUI DENTRO: e ela que veste a
      // portinha e desfaz a borda vermelha que o 'bordo' da UI acende no hover.
      // A UI nao manda essa classe hoje e este arquivo nao depende de ela mandar.
      const onde = ladoDe(d)
      const b = el('button', 'btn' + (d.cls ? ' ' + d.cls : '') + (onde === 'canto' ? ' saida' : ''), d.txt)
      b.type = 'button'
      if (d.ao) b.addEventListener('click', d.ao)
      // A onda do clique precisa saber ONDE o dedo encostou; o CSS le isso em
      // --px/--py. 'pointerdown' e nao 'click' porque a resposta tem que sair
      // junto com o dedo descendo — meio segundo depois ja nao e resposta.
      b.addEventListener('pointerdown', (ev) => {
        if (b.disabled) return
        const r = b.getBoundingClientRect()
        if (!r.width || !r.height) return
        b.style.setProperty('--px', (((ev.clientX - r.left) / r.width) * 100).toFixed(1) + '%')
        b.style.setProperty('--py', (((ev.clientY - r.top) / r.height) * 100).toFixed(1) + '%')
        marca(b, 'onda', false)
        void b.offsetWidth
        marca(b, 'onda', true)
      })
      b.addEventListener('animationend', (ev) => {
        if (ev.animationName === P + 'onda') marca(b, 'onda', false)
        if (ev.animationName === P + 'acende') marca(b, 'acende', false)
      })
      grupos[onde].appendChild(b)
      mapaBotoes.set(d.id, b)
    }
    revisarGrupos()
  }

  function botao(id) { return mapaBotoes.get(id) || null }

  /**
   * Liga/desliga/renomeia um botao numa chamada so.
   * `cfg`: { ver, ligado, txt, chama } — 'chama' e o anel dourado do botao
   * principal, que existe pra o jogador nunca ficar procurando o que apertar
   * (e e ele quem faz nascer o selo de Enter, ver o ::after no CSS).
   */
  function ajustar(id, cfg) {
    const b = mapaBotoes.get(id)
    if (!b) return
    // O ESTADO DE ANTES, guardado antes de qualquer escrita. A UI chama ajustar
    // com o mesmo objeto a cada render (varias vezes por segundo); sem
    // comparar, o 'acende' dispararia sem parar e viraria ruido em vez de aviso.
    const eraOff = b.disabled
    const eraTxt = b.textContent
    if (cfg.txt !== undefined && String(cfg.txt) !== eraTxt) {
      b.textContent = cfg.txt
      // Rotulo do canto que muda tem que mudar no espelho junto, senao o trilho
      // da esquerda passa a reservar a largura errada e a fila sai do eixo.
      if (b.parentNode === grupos.canto) espelhar()
    }
    if (cfg.ver !== undefined) {
      const ver = cfg.ver ? '' : 'none'
      if (b.style.display !== ver) { b.style.display = ver; revisarGrupos() }
    }
    if (cfg.ligado !== undefined) b.disabled = !cfg.ligado
    if (cfg.chama !== undefined) marca(b, 'chama', !!cfg.chama && !b.disabled)
    // Desligar um botao que estava chamando tem que apagar o anel junto: anel
    // aceso em botao morto e a pior mentira que este rodape pode contar.
    if (b.disabled) marca(b, 'chama', false)
    // O estalo. So em botao vivo e visivel, e so quando ele MUDOU de verdade:
    // acabou de destravar, ou o preco dentro dele e outro.
    const acordou = eraOff && !b.disabled
    const trocou = !b.disabled && b.textContent !== eraTxt
    if ((acordou || trocou) && b.style.display !== 'none') {
      marca(b, 'acende', false)
      void b.offsetWidth
      marca(b, 'acende', true)
    }
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
    setChamada,
    setDica,
    definirBotoes,
    botao,
    ajustar,
    anunciar,
    piscar,
    dispose,
  }
}

export default criarFaixaMesa
