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
//   5. O TAMANHO E HIERARQUIA, E O ALL-IN E UM OBJETO A PARTE. O pedido foi
//      "vamos fazer os huds maiores um pouco ... de all in tem que ser algo
//      melhor, mais destacado". O teto de altura subiu de 87% pra 83% de topo
//      (ver o orcamento no bloco `.faixa`) e a folga foi gasta onde ela vira
//      leitura: botao de acao mais alto, letra maior, mais respiro. O TUDO
//      deixou de ser o botao mais apagado da tela — ele agora e uma PLAQUETA
//      DE FICHA (aro com as marcas do aro, brasa por dentro, o numero grande
//      embaixo da palavra), ver `.tudo` no CSS. Ele nao rouba a acao principal
//      porque continua de corpo ESCURO: quem manda apertar e o botao cheio de
//      cor; quem diz "esta e a jogada grande" e a moldura.
//   6. O UNICO BOTAO QUE NAO ANDA COM A FILEIRA E O SAIR DA MESA. Ele fica
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

/** "TUDO (4.950)" -> ['TUDO', '4.950']. Sem parenteses, devolve null. */
const CIFRA = /^\s*(.*?)\s*\(([^()]+)\)\s*$/

/**
 * ESCREVER O ROTULO DE UM BOTAO.
 *
 * Quase todo botao e um texto so e este e o caminho curto. O ALL-IN e a
 * excecao: o rotulo dele chega da UI como "TUDO (4.950)" e la o numero e uma
 * nota de rodape entre parenteses, quando ele e justamente a unica coisa que
 * importa ler naquele botao. Aqui a palavra vira etiqueta e o numero vira o
 * conteudo, em duas linhas (ver `.tudo` no CSS).
 *
 * O TEXTO CANONICO FICA GUARDADO em b.__txt e e ele que ajustar() compara. Nao
 * da pra comparar com textContent: com os dois pedacos em elementos separados
 * o textContent vira "TUDO4.950", que nunca bate com o que a UI mandou — e a
 * comparacao e o que impede o estalo de disparar a cada render.
 */
function escrever(b, txt) {
  const s = txt === undefined || txt === null ? '' : String(txt)
  b.__txt = s
  const m = b.classList.contains(P + 'tudo') ? s.match(CIFRA) : null
  b.textContent = ''
  if (!m) { b.appendChild(document.createTextNode(s)); return }
  b.appendChild(el('i', 'rotulo', m[1]))
  b.appendChild(el('b', 'cifra', m[2]))
}

/** O que este botao diz hoje, do jeito que a UI escreveu. */
function lido(b) { return b.__txt === undefined ? b.textContent : b.__txt }

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
  display:flex; align-items:center; gap:8px; padding:6px 14px; border-radius:999px;
  background:rgba(0,0,0,.46); border:1px solid rgba(233,196,106,.24);
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
  transition:opacity .2s ease, border-color .2s ease, box-shadow .2s ease;
}
/* A MOEDA DA MESA GANHOU MOLDURA, e nao so o contrario apagado.
   setBolso ja apagava a moeda que nao vale aqui, mas apagar diz "esta nao" sem
   dizer "esta sim" — num canto de tela com dois numeros parecidos o jogador
   ainda tinha que escolher qual ler. A que vale agora tem aro dourado e um
   brilho de fundo: e ela que casa com o numero do rodape. */
.${P}moeda.${P}ativa{
  border-color:rgba(255,214,140,.52);
  box-shadow:0 0 0 1px rgba(255,214,140,.10), 0 4px 16px rgba(0,0,0,.45);
}
.${P}moeda b{ font-variant-numeric:tabular-nums; font-size:16px; font-weight:700; }
.${P}moeda.${P}ativa b{ color:#ffe1a4; }
.${P}pino{ width:15px; height:15px; border-radius:50%; flex:0 0 auto; box-shadow:inset 0 -2px 3px rgba(0,0,0,.45); }
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

/* --- cartaz do meio: so em momento de resultado ----------------------------
   ELE SUBIU DE 22% PRA 17%. O showdown passou a LEVANTAR e contornar em 3D as
   cinco cartas da mao vencedora, e as cartas comunitarias vivem a partir de
   35% da altura: em 22% o cartaz ficava logo em cima delas e os dois momentos
   — o desenho que explica e o texto que resume — brigavam pelo mesmo olhar.
   Em 17% ele encosta na faixa do cabecalho (que acaba por volta de 9%) e
   deixa o meio do feltro inteiro pro 3D.

   O VIDRO EM VEZ DE MAIS TINTA: com blur atras, o cartaz fica legivel sobre
   qualquer coisa que o feltro esteja fazendo sem precisar de fundo mais opaco
   — opacidade a mais tampa a mesa, que e justamente o que se quer ver. */
.${P}cartaz{
  position:absolute; left:0; right:0; top:17%;
  text-align:center; pointer-events:none; opacity:0;
}
.${P}cartaz b{
  display:inline-block; padding:9px 30px; border-radius:14px;
  font-size:clamp(22px,3.6vw,42px); font-weight:700; letter-spacing:.10em; text-transform:uppercase;
  color:#fff4d6; background:linear-gradient(180deg, rgba(20,26,24,.62), rgba(8,12,11,.74));
  border:1px solid rgba(233,196,106,.55);
  backdrop-filter:blur(7px); -webkit-backdrop-filter:blur(7px);
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
   jogador fica em 86%. O TETO SUBIU: o dono liberou o rodape ate 83% de topo
   (era 87%), o que numa tela de 720 px da 122 px. Acima disso a faixa comeca a
   comer as pilhas de ficha, entao 83% e teto duro, medido a cada rodada por
   tools/shot-hud.mjs. A conta nova:

     9 (padding topo) + 32 (linha de informacao) + 7 (respiro)
       + 54 (fileira de acao) + 12 (padding base)  =  114 px  =  15,8% de 720

   Medido pelo tools/shot-hud.mjs: a faixa comeca em 84,13% nos cinco estados de
   1280 (114 px) e em 87,22% nos tres de 760 (92 px), com 8 px de folga contra o
   teto — e e a MESMA altura nos cinco, inclusive na fileira sem botao nenhum.

   Onde os 27 px a mais foram parar: 12 no botao (42 -> 54), 7 na linha de
   informacao (25 -> 32) e 8 em respiro (padding e gap). Nao foi so o botao que
   cresceu — botao maior com o mesmo aperto em volta le como botao apertado.
   Se um dia faltar peso, cresca antes a LARGURA (min-width abaixo), que nao
   custa altura nenhuma. */
.${P}faixa{
  position:absolute; left:0; right:0; bottom:0;
  display:flex; flex-direction:column; gap:7px;
  padding:9px clamp(14px,2.4vw,30px) clamp(12px,1.7vh,18px);
  /* A RAMPA DO ESCURO SUBIU JUNTO COM A FAIXA. Com 114 px de rodape, a linha de
     informacao passou a cair sobre as pilhas de ficha do jogador — no blackjack
     elas descem ate uns 90% da tela — e um texto de 11 px em cima de uma ficha
     branca de 500 nao se le. Os 30% de antes deixavam a linha inteira sobre um
     fundo de 40% de preto; a rampa nova ja esta em 72% quando a informacao
     comeca. Os primeiros 14% continuam quase limpos de proposito: e ali que
     ficam as PLAQUETAS DE VALOR das pilhas, e escurecer aquilo seria apagar o
     numero que diz quanto vale cada monte. */
  background:linear-gradient(180deg,
    rgba(4,8,7,0) 0%, rgba(5,10,9,.30) 14%, rgba(4,8,7,.72) 38%, rgba(4,7,6,.96) 100%);
  transform:translateY(22px); opacity:0;
  transition:transform .30s cubic-bezier(.18,.9,.3,1.1), opacity .24s ease;
}
.${P}raiz.${P}on .${P}faixa{ transform:none; opacity:1; }
/* O FIO DE OURO DO TOPO VIROU UMA CUPULA DE LUZ, e o motivo e o teto novo.
   Enquanto o rodape comecava em 88% ele passava por baixo das pilhas de ficha
   do jogador e um fio de 1 px marcando a beirada era so isso: uma beirada.
   Com 84% de topo a MESMA linha passa a cruzar o terco de baixo das pilhas — e
   o pedaco mais aceso dela (o meio) cai justo em cima das pilhas de 100 e 250.
   Fio bem definido em cima de objeto vira risco na foto; foi o primeiro defeito
   que apareceu ao crescer a faixa.

   O que resolve nao e apagar a luz, e tirar dela a BORDA: um radial que nasce
   no meio do topo e apaga pros lados e pra baixo em 14 px continua dizendo
   "o rodape comeca aqui e o eixo dele e o meio" — que e o mesmo recado do fio
   antigo — sem ter em lugar nenhum uma aresta pra cortar a ficha. */
.${P}faixa::before{
  content:''; position:absolute; left:0; right:0; top:0; height:14px;
  background:radial-gradient(66% 100% at 50% 0%,
    rgba(255,226,158,.30), rgba(255,226,158,.06) 52%, rgba(255,226,158,0) 78%);
}

/* --- andar de cima: informacao nas beiradas, estado no meio --- */
.${P}linha{
  display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
  align-items:center; gap:clamp(10px,2vw,26px); min-height:32px;
}
.${P}lado{ display:flex; align-items:baseline; gap:8px; min-width:0; white-space:nowrap; overflow:hidden; }
/* SOMBRA NAS DUAS PONTAS DA LINHA. O rotulo da esquerda e a dica da direita sao
   os dois textos mais fracos do rodape e agora eles passam por cima das pilhas
   de ficha; sem halo preto atras, "APOSTA" em cima da ficha de 500 (que e
   marfim) simplesmente some. O recado do meio ja tinha o dele. */
.${P}rot{
  font-size:10.5px; letter-spacing:.2em; text-transform:uppercase; color:#8a939f;
  font-weight:700; flex:0 0 auto; text-shadow:0 1px 6px rgba(0,0,0,.95);
}
.${P}rot:empty{ display:none; }
/* O numero e a unica coisa da beirada que compete com o botao — ele tem que
   ser lido de canto de olho, sem virar titulo. 2.05vw da 26 px em 1280.
   O TETO DE 31 px NAO E ESTETICA: e ele quem manda na altura da linha de
   informacao, e essa altura sai do orcamento da faixa. Com o teto novo de 83%
   cabem 32 px de linha; 31 px de letra com line-height 1.05 da 32,6 e ainda
   sobra folga em toda largura medida (600 a 1920), porque quem cresce com a
   janela e o vw e ele bate no teto antes de 1600. */
.${P}valor{
  font-size:clamp(23px,2.05vw,31px); font-weight:700; font-variant-numeric:tabular-nums;
  color:#ffe1a4; line-height:1.05; text-shadow:0 2px 10px rgba(0,0,0,.85); flex:0 0 auto;
}
.${P}valor small{ font-size:12px; color:#939ba6; letter-spacing:.06em; margin-left:8px; font-weight:600; }
/* O HALO DO MEIO DA LINHA. As pilhas de ficha do jogador ficam no meio da
   largura e, na mesa de blackjack, descem ate uns 90% da altura — ou seja,
   passam por baixo da linha de informacao. A pastilha da vez e o recado caem
   exatamente em cima delas, e ficha e um objeto de alto contraste: marfim,
   vermelho e branco em listras. So a rampa da faixa nao resolve, porque
   escurecer a faixa inteira o bastante pra isso seria tapar as pilhas — e elas
   sao clicaveis, e por elas que se aposta.
   O halo escurece SO onde o texto esta, sem borda nenhuma pra denunciar a
   forma: de longe le como uma sombra da propria luz do rodape. */
.${P}aviso{
  display:flex; align-items:center; justify-content:center; gap:10px; min-width:0;
  padding:3px 20px;
  background:radial-gradient(66% 150% at 50% 50%, rgba(3,7,6,.80), rgba(3,7,6,0) 80%);
}
/* A CHAMADA (setChamada) e o unico texto do rodape que pode dar ORDEM. Ela e
   pequena e dourada de proposito: quem grita e o botao, ela so nomeia a vez. */
.${P}chamada{
  font-size:11px; font-weight:700; letter-spacing:.2em; text-transform:uppercase;
  color:#22190a; background:linear-gradient(180deg,#ffdf9e,#e0a93f);
  padding:4px 11px; border-radius:999px; flex:0 0 auto;
  box-shadow:0 2px 10px rgba(226,168,60,.30);
}
/* PASTILHA VAZIA SOME SEM DEIXAR BURACO. O poker esta ficando sem chamada em
   varios momentos (o dono mandou tirar "EMPURRE FICHAS OU PASSE" e a linha do
   pre-flop), e uma pastilha de largura zero ainda cobraria o gap do .aviso — o
   recado ficaria fora do eixo justo nas maos silenciosas. Com display:none ela
   sai do fluxo inteira e o recado herda o centro. */
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
  font-size:14.5px; font-weight:600; color:#ded3bc; min-height:21px; line-height:1.35;
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
  font-size:11.5px; color:#79828e; letter-spacing:.04em; text-align:right;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0;
  text-shadow:0 1px 6px rgba(0,0,0,.95), 0 0 3px rgba(0,0,0,.85);
}
.${P}tecla{
  display:inline-block; padding:0 5px; margin:0 2px; border-radius:4px;
  font-size:10.5px; font-weight:700; letter-spacing:.06em; color:#e6dcc4;
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
/* A ALTURA MINIMA DA FILEIRA E DO TAMANHO DO BOTAO PRINCIPAL, mesmo sem
   nenhum botao vivo. O poker esta deixando de ter o PROXIMA MAO — a mao
   seguinte vem sozinha —, e entre uma mao e outra sobra so o SAIR no canto. Sem
   este minimo a fileira colapsava pra a altura do SAIR, o rodape inteiro
   encolhia 18 px e voltava a crescer na mao seguinte: um rodape que pulsa de
   tamanho a cada 3 segundos. O piso e o mesmo 54 px do .grande. */
.${P}acao{
  display:grid; grid-template-columns:1fr auto 1fr;
  align-items:center; column-gap:12px; min-height:54px;
}
/* A fila e o trilho do meio da grade: e ELA que fica centrada na tela, e e ela
   que quebra em duas linhas quando a largura aperta (o trilho encolhe, o
   flex-wrap resolve) em vez de empurrar botao pra fora da tela. */
.${P}fila{
  display:flex; align-items:center; justify-content:center;
  gap:12px; flex-wrap:wrap; min-width:0;
}
.${P}grupo{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; min-width:0; }
.${P}grupo.${P}esq{ justify-content:flex-end; }
.${P}grupo.${P}meio{ justify-content:center; gap:11px; }
/* DESISTIR fica depois de um vao maior que o resto: acao que tira o jogador da
   mao nao pode encostar na que o mantem nela — 26 px de vao (14 daqui + 12 do
   gap da fila) e o que separa "apertei sem querer" de "apertei de proposito".
   O vao cresceu junto com os botoes: com botao de 54 px, os 18 px de antes
   viravam quase encosto. */
.${P}grupo.${P}dir{ justify-content:flex-start; padding-left:14px; }
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
   QUATRO PESOS, e a diferenca entre eles e de TAMANHO antes de ser de cor:
     principal (.grande)   54 px de altura, 160..210 px de largura, ouro/verde
     all-in    (.tudo)     54 px, plaqueta escura de aro dourado, duas linhas
     acao      (padrao)    46 px, vidro escuro, largura do rotulo
     ajuste    (.fantasma) 42 px, quase so contorno
     saida     (.saida)    36 px — de proposito a MENOR: ela e a porta da sala,
                           nao uma jogada, e crescer junto com o resto tambem
                           custaria 2x a largura dela no orcamento da ancora.
   Antes todos tinham a mesma caixa e so trocavam de cor, e num rodape de
   cinco botoes isso e o mesmo que nao ter hierarquia nenhuma. */
.${P}btn{
  position:relative; overflow:hidden; appearance:none; cursor:pointer; font:inherit;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-size:14px; font-weight:700; letter-spacing:.06em;
  min-height:46px; padding:0 20px; border-radius:12px; color:#e8e0d0; white-space:nowrap;
  background:linear-gradient(180deg, rgba(255,255,255,.11), rgba(255,255,255,.04));
  border:1px solid rgba(255,255,255,.16);
  box-shadow:0 5px 14px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.08);
  transition:background .14s ease, transform .12s cubic-bezier(.2,.9,.3,1.4),
             box-shadow .16s ease, filter .14s ease, opacity .14s ease;
}
/* PESO NO HOVER, AFUNDAR NO CLIQUE. O curso subiu de 3 px pra 5 (-3 no hover,
   +2 no active) junto com o botao: deslocamento e lido em PROPORCAO do objeto,
   e os 3 px que davam relevo num botao de 38 px somem num de 54. */
.${P}btn:hover{
  background:linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,.08));
  transform:translateY(-3px);
  box-shadow:0 13px 26px rgba(0,0,0,.54), inset 0 1px 0 rgba(255,255,255,.14);
}
.${P}btn:active{
  transform:translateY(2px) scale(.982);
  box-shadow:0 2px 6px rgba(0,0,0,.5), inset 0 2px 8px rgba(0,0,0,.40);
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
/* DOIS ESTALOS DIFERENTES, PORQUE SAO DUAS NOTICIAS DIFERENTES.
   Ate aqui, "o botao acabou de existir" e "o preco dentro dele mudou" davam a
   MESMA animacao — e como o preco muda a cada ficha empurrada no pano, quem
   monta uma aposta de 400 em ficha de 25 levava dezesseis pulos seguidos. Pulo
   repetido nao avisa nada, so cansa.

   ACENDE e a noticia grande: o botao DESTRAVOU ou APARECEU. Ele salta, brilha e
   solta um halo quente em volta (o drop-shadow e de cor propria, entao serve
   pro verde, pro ouro e pro vidro escuro sem repintar nada). E o "empurrei uma
   ficha e o APOSTAR nasceu" — sem ele, o unico sinal era um cinza virando verde
   do outro lado da tela, que ninguem ve.

   TROCA e a noticia pequena: o mesmo botao, outro numero. Sem salto e sem
   deslocamento — so a tinta esquentando por um terco de segundo, o suficiente
   pra o olho voltar no numero e ler o valor novo. */
.${P}btn.${P}acende{ animation:${P}acende .46s cubic-bezier(.2,.9,.3,1.5); }
@keyframes ${P}acende{
  /* 1.52 e nao 1.7: o promovido e o ouro sao amarelos claros e acima de 1.55 o
     estalo os estoura em branco — some a cor justo no botao que a cor nomeia.
     Quem carrega o peso do salto aqui e o halo do drop-shadow, que nao lava a
     tinta de ninguem porque e luz DO LADO DE FORA da caixa. */
  0%{ transform:scale(.90) translateY(3px); filter:brightness(1.52) drop-shadow(0 0 0 rgba(255,226,170,0)); }
  46%{ transform:scale(1.055) translateY(-2px); filter:brightness(1.18) drop-shadow(0 5px 20px rgba(255,222,158,.62)); }
  100%{ transform:none; filter:none; }
}
.${P}btn.${P}troca{ animation:${P}troca .32s ease-out; }
@keyframes ${P}troca{
  0%{ filter:brightness(1.42) drop-shadow(0 2px 10px rgba(255,222,158,.42)); }
  100%{ filter:none; }
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
  min-height:42px; padding:0 15px; font-size:12.5px; letter-spacing:.05em;
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
   font-size), e ELE NAO CRESCEU quando o resto do rodape cresceu. Duas razoes,
   e as duas valem:
     — sentido: sair da mesa nao e uma jogada. Num rodape em que a acao foi de
       42 pra 54 px, a porta ficar em 36 e o que diz "isto aqui e mobilia".
     — geometria: ancorar o SAIR na beirada custa DUAS larguras dele (a dele e a
       do espelho invisivel da esquerda). Cada 10 px de largura a mais sao 20 px
       que a fila de acao perde e 20 px a menos ate a janela apertar. Engordar a
       saida junto com o resto derrubaria a ancora por volta de 1000 px.
   Repetir o tamanho aqui, em vez de herdar do 'fantasma' que a UI manda junto,
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
  min-height:36px; padding:0 13px; font-size:11.5px; letter-spacing:.05em;
  --porta:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M10.9 2.9 L15.3 1 V15 L10.9 13.1 Z' fill='white' opacity='.95'/%3E%3Crect x='1.5' y='1.6' width='8.2' height='12.8' rx='1.1' fill='white' fill-opacity='.15' stroke='white' stroke-opacity='.66' stroke-width='1.5'/%3E%3Ccircle cx='7.8' cy='8' r='1' fill='white' fill-opacity='.8'/%3E%3C/svg%3E");
}
/* O PRINCIPAL. Ele nao e "o mesmo botao pintado de ouro": e mais alto, MUITO
   mais largo (min-width) e com a letra mais espacada. Largura e o unico eixo
   de peso que sobra depois do teto de altura — por isso ela e que carrega a
   hierarquia aqui. O clamp deixa o rotulo longo ("JOGAR DE NOVO (250)") caber
   sem quebrar em tela pequena.

   COM O TETO NOVO ELE FICOU 12 PX MAIS ALTO (42 -> 54) e 20 mais largo. A
   letra foi de 15 pra 16,5: crescer a caixa sem crescer o rotulo faz o botao
   parecer vazio, nao maior. */
.${P}btn.${P}grande, .${P}btn.${P}promovido{
  min-height:54px; min-width:clamp(160px,15vw,210px); padding:0 26px;
  font-size:16.5px; letter-spacing:.11em;
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
  46%{ box-shadow:0 10px 26px rgba(226,168,60,.42), 0 0 0 14px rgba(255,222,150,0), inset 0 1px 0 rgba(255,255,255,.5); }
  100%{ box-shadow:0 8px 20px rgba(226,168,60,.32), 0 0 0 0 rgba(255,222,150,0), inset 0 1px 0 rgba(255,255,255,.45); }
}
/* Os dois ao mesmo tempo. A propriedade 'animation' e uma so: sem estas linhas
   o .chama (declarado depois) engoliria o estalo do .acende e justo o botao
   mais importante da mesa seria o unico que nao reage a ficha entrando. O
   mesmo vale pro .troca, que e o estalo do preco novo — e o PAGAR e ao mesmo
   tempo o botao que chama e o que muda de preco a cada aumento do adversario. */
.${P}btn.${P}chama.${P}acende{
  animation:${P}acende .46s cubic-bezier(.2,.9,.3,1.5),
            ${P}chama 2.4s cubic-bezier(.22,.7,.3,1) .46s infinite;
}
.${P}btn.${P}chama.${P}troca{
  animation:${P}troca .32s ease-out,
            ${P}chama 2.4s cubic-bezier(.22,.7,.3,1) .32s infinite;
}
/* O selo de ENTER so aparece no botao que esta chamando — e cassino-ui.js so
   liga 'chama' em botao que o Enter realmente dispara (o principal() dele),
   entao o selo nunca mente. Ele e ::after de proposito: ajustar({txt}) troca o
   textContent do botao e apagaria qualquer filho de verdade. */
.${P}btn.${P}chama::after{
  content:'\\21B5'; font-size:13px; line-height:1; font-weight:700;
  padding:3px 6px 4px; border-radius:6px; opacity:.82;
  background:rgba(0,0,0,.16); border:1px solid rgba(0,0,0,.20);
}

/* --- O ALL-IN: uma PLAQUETA DE FICHA, nao um botao ------------------------
   O PROBLEMA. O all-in do jogo estava desenhado como o botao mais apagado da
   tela: a UI manda o TUDO com a classe 'fantasma', a mesma roupa do LIMPAR e
   do TIRAR. "Empurrar tudo o que eu tenho" e "tirar as fichas de volta" liam
   igual — e all-in e o momento mais dramatico de uma mao de poker.

   O QUE ELE NAO PODE SER. Um segundo botao cheio de cor ao lado do
   APOSTAR/PAGAR: dois blocos acesos lado a lado e o mesmo que nenhum, e a
   acao principal e que tem que ganhar a briga do "aperte isto agora".

   A SAIDA E TROCAR DE CATEGORIA em vez de trocar de intensidade. Ele fica com
   CORPO ESCURO — mais escuro que o fantasma, ate — e ganha a linguagem que o
   resto do rodape nao usa: o ARO DE FICHA. As duas fitas tracejadas em cima e
   embaixo sao as insercoes do aro (a mesma tabela do feltro 3D e do pino do
   cabecalho); por dentro tem uma brasa subindo da base, e uma luz atravessa a
   plaqueta de tempos em tempos. Bate o olho e nao ha como confundir com o
   LIMPAR ao lado: um e vidro cinza, o outro e metal com fogo dentro.

   E DUAS LINHAS, e nao uma. O rotulo chega da UI como "TUDO (4.950)" — a
   palavra e o numero disputando a mesma linha em 12,5 px, com o numero ainda
   por cima entre parenteses, que e a tipografia do rodape para NOTA DE RODAPE.
   Aqui a palavra vira etiqueta (10 px, bem espacada, o nome da jogada) e o
   NUMERO vira o conteudo (19 px, tabular): o jogador le quanto e o all-in de
   longe, que e a unica informacao que importa nessa hora. Quem reparte os dois
   e escrever(), no JS.

   POR QUE ELE VEM DEPOIS DO .fantasma E ANTES DO [disabled]: o fantasma tem a
   mesma especificidade e reescreveria fundo, borda e cor; o [disabled] TEM que
   continuar ganhando dele, senao um all-in que o jogador nao pode dar continua
   brilhando (e o TUDO fica desligado o tempo todo em que ja ha ficha no pano). */
.${P}btn.${P}tudo{
  flex-direction:column; gap:1px; min-height:54px; min-width:104px; padding:0 18px;
  color:#ffd08a; border-color:rgba(255,200,100,.62);
  background:
    repeating-linear-gradient(90deg, rgba(255,232,190,.40) 0 13px, rgba(255,232,190,0) 13px 31px) top/100% 3px no-repeat,
    repeating-linear-gradient(90deg, rgba(255,232,190,.40) 0 13px, rgba(255,232,190,0) 13px 31px) bottom/100% 3px no-repeat,
    radial-gradient(118% 130% at 50% 122%, rgba(255,146,36,.46), rgba(255,120,20,0) 64%),
    linear-gradient(180deg, #35200c, #150c05);
  box-shadow:0 7px 20px rgba(0,0,0,.52), 0 0 18px -6px rgba(255,150,50,.34),
             inset 0 0 0 1px rgba(255,206,130,.14), inset 0 -13px 20px -12px rgba(255,150,50,.60);
}
.${P}btn.${P}tudo:hover{
  color:#ffe6bb; border-color:rgba(255,220,150,.86);
  box-shadow:0 15px 30px rgba(0,0,0,.55), 0 0 26px -4px rgba(255,160,54,.60),
             inset 0 0 0 1px rgba(255,224,164,.26), inset 0 -15px 24px -12px rgba(255,164,60,.85);
}
/* A etiqueta e o numero. 'color:inherit' nos dois nao e enfeite: e o que faz o
   rotulo desbotar junto quando o botao desliga, sem repetir a cor no bloco do
   [disabled]. */
.${P}btn .${P}rotulo{
  font-size:10px; letter-spacing:.26em; font-weight:700; line-height:1;
  color:inherit; opacity:.72;
}
.${P}btn .${P}cifra{
  font-size:19px; letter-spacing:.02em; font-weight:700; line-height:1.05;
  font-variant-numeric:tabular-nums; color:inherit;
}
/* A LUZ QUE ATRAVESSA. Ela usa o ::after porque o ::before ja e a onda do
   clique — e o TUDO nunca e o botao que chama (a UI so liga 'chama' no
   principal) nem a saida, entao o ::after esta livre justo neste botao.
   4,8 s com 74% de pausa: o mesmo criterio do anel do .chama — chamar uma vez,
   respirar, chamar de novo. Luz continua vira aviso de incendio. */
.${P}btn.${P}tudo::after{
  content:''; position:absolute; inset:-40% -14%; pointer-events:none;
  background:linear-gradient(102deg,
    rgba(255,226,170,0) 42%, rgba(255,232,186,.26) 50%, rgba(255,226,170,0) 58%);
  animation:${P}brasa 4.8s cubic-bezier(.45,0,.55,1) infinite;
}
@keyframes ${P}brasa{
  0%, 74%{ transform:translateX(-135%); }
  100%{ transform:translateX(135%); }
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
   ancora e conforto.

   O CORTE SUBIU DE 960 PRA 1000 porque a fila engordou. Medido pela varredura
   de largura do tools/shot-hud.mjs: o estado mais largo das duas mesas e o meio
   da mao do blackjack — PEDIR 192 + PARAR 88 + DOBRAR (25) 135 + DIVIDIR (25)
   130, mais 30 de vao, mais os 264 da ancora (132 do SAIR de cada lado), mais
   24 dos vaos da grade e 60 de padding = 923 px. Em 1000 sobram 77, que e a
   folga de um digito a mais em cada rotulo; a varredura confirma uma linha so e
   ancora de pe em 1010 px. Abaixo do corte a grade vira flex de novo, o espelho
   some e o SAIR fecha a fila — onde ele continua sendo o botao mais a direita,
   so que sem colar na moldura.

   POR QUE NAO ESTICAR ATE 940. Quebrar em duas linhas custa 48 px de ALTURA, e
   altura e o orcamento duro deste rodape: a 940 px de janela a faixa iria a
   162 px e comecaria em 77% da tela, em cima das cartas. Ancora e conforto,
   altura e regra — na duvida se perde a ancora. */
@media (max-width:1000px){
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

   O SAIR ja voltou pra fila no bloco de cima (1000 px); aqui ele so acompanha o
   aperto do resto — que num telefone e o canto direito da ultima linha de
   qualquer jeito.

   AQUI TAMBEM SE CRESCEU. A altura da tela nao muda por ser estreita: o
   orcamento continua sendo o mesmo teto de 83%. Medido em 760x720, a faixa deu
   89 px e 87,63% de topo — sobra e o que nao falta. Entao o dedo ganha 8 px de
   alvo no botao de acao (34 -> 42) e o principal ganha 8 tambem (38 -> 46), que
   num telefone e a diferenca entre acertar e quase.

   POR QUE NAO GASTAR OS 33 PX QUE AINDA SOBRAM ATE O TETO. Aqui o corte e por
   LARGURA e nao por altura: 760 px de largura tanto pode ser um telefone em pe
   (onde a tela e curta e 89 px ja sao um quinto dela) quanto uma janela de
   navegador espremida numa tela grande. Gastar o orcamento inteiro so seria
   seguro no segundo caso, entao a faixa fica com o tamanho que serve nos dois.
   Quem manda no alvo do dedo aqui e o botao, e ele ja cresceu 24%. */
@media (max-width:760px){
  .${P}faixa{ gap:5px; padding:6px 10px 10px; }
  .${P}linha{ grid-template-columns:auto minmax(0,1fr); gap:10px; min-height:0; }
  .${P}dica{ display:none; }
  /* O halo do meio muda de lado junto com o texto: aqui a linha de cima tem
     duas colunas e o estado vai pra DIREITA, entao o escurecimento tem que
     nascer na direita tambem — centrado, ele cairia no vao vazio a esquerda do
     texto e deixaria justo a palavra em cima da ficha. */
  .${P}aviso{
    justify-content:flex-end; padding:2px 0;
    background:radial-gradient(72% 150% at 100% 50%, rgba(3,7,6,.80), rgba(3,7,6,0) 86%);
  }
  .${P}valor{ font-size:21px; }
  .${P}recado{ font-size:12.5px; }
  .${P}acao{ gap:7px; min-height:46px; }
  .${P}fila{ gap:7px; }
  .${P}grupo{ justify-content:center !important; padding-left:0; gap:7px; }
  .${P}btn{ min-height:42px; padding:0 14px; font-size:12.5px; }
  .${P}btn.${P}fantasma{ min-height:36px; padding:0 11px; font-size:11px; }
  .${P}btn.${P}saida{ min-height:32px; padding:0 10px; font-size:10.5px; }
  /* 13 px acompanha a letra de 10,5 px da saida: mantida em 15, a porta ficaria
     maior que o rotulo que ela ilustra. */
  .${P}btn.${P}saida::after{ width:13px; height:13px; }
  .${P}btn.${P}grande, .${P}btn.${P}promovido{
    min-height:46px; min-width:140px; padding:0 18px; font-size:14.5px;
  }
  /* A plaqueta do all-in encolhe junto, mas continua a mais alta empatada com o
     principal: e a altura que diz que os dois sao da mesma categoria. */
  .${P}btn.${P}tudo{ min-height:46px; min-width:92px; padding:0 13px; }
  .${P}btn .${P}rotulo{ font-size:9px; letter-spacing:.22em; }
  .${P}btn .${P}cifra{ font-size:16px; }
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
    // A moeda que NAO vale nesta mesa fica apagada e a que vale ganha aro
    // dourado. So apagar a outra dizia "esta nao" sem dizer "esta sim", e no
    // canto da tela sobravam dois numeros parecidos pro jogador escolher qual
    // ler; com a moldura, a moeda da mesa e a mesma tinta do numero do rodape.
    moedaOuro.style.opacity = destaque === 'ficha' ? '0.42' : '1'
    moedaFicha.style.opacity = destaque === 'ouro' ? '0.42' : '1'
    marca(moedaOuro, 'ativa', destaque === 'ouro')
    marca(moedaFicha, 'ativa', destaque === 'ficha')
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
   *   2. SEMPRE HA UM BOTAO PRINCIPAL, e MORTO NAO CONTA. Se nenhum 'grande'
   *      esta visivel E VIVO, o primeiro botao vivo do grupo do MEIO — o das
   *      acoes — e promovido ao ouro. So o meio concorre: promover um ajuste de
   *      aposta (TUDO) a acao principal seria apontar pro botao errado.
   *
   *      O "e vivo" e o conserto de um buraco antigo. Na vez do poker sem ficha
   *      no pano, o APOSTAR esta na tela mas desligado (nao ha o que apostar) —
   *      e como ele carregava a classe 'grande', a faixa dava por resolvido que
   *      havia principal e deixava o PASSAR vestido de botao secundario. So que
   *      PASSAR e exatamente o que o Enter dispara nesse estado (o principal()
   *      do poker), ou seja, a jogada da vez era o botao mais discreto da
   *      fileira e um botao morto ocupava o lugar dela.
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
        if (k !== 'meio' || b.disabled) continue
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
      // O ALL-IN ganha a classe 'tudo' AQUI, pelo id, pela mesma razao da
      // saida: a UI manda ele com 'fantasma' — a roupa do LIMPAR e do TIRAR —
      // e all-in vestido de ajuste de aposta e o botao mais apagado da tela no
      // momento mais dramatico da mao. 'tudo' e o id do all-in nas duas mesas e
      // nunca e outra coisa; a classe homonima ja fica aceita pro dia em que a
      // UI quiser dizer isso por classe, que e o contrato do resto do arquivo.
      const onde = ladoDe(d)
      const cls = ' ' + (d.cls || '') + ' '
      const allIn = d.id === 'tudo' && cls.indexOf(' tudo ') < 0
      const b = el('button', 'btn' + (d.cls ? ' ' + d.cls : '')
        + (onde === 'canto' ? ' saida' : '') + (allIn ? ' tudo' : ''))
      escrever(b, d.txt)
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
        if (ev.animationName === P + 'troca') marca(b, 'troca', false)
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
    // comparar, o estalo dispararia sem parar e viraria ruido em vez de aviso.
    const eraOff = b.disabled
    const eraTxt = lido(b)
    const eraFora = b.style.display === 'none'
    if (cfg.txt !== undefined && String(cfg.txt) !== eraTxt) {
      escrever(b, cfg.txt)
      // Rotulo do canto que muda tem que mudar no espelho junto, senao o trilho
      // da esquerda passa a reservar a largura errada e a fila sai do eixo.
      if (b.parentNode === grupos.canto) espelhar()
    }
    if (cfg.ver !== undefined) {
      const ver = cfg.ver ? '' : 'none'
      if (b.style.display !== ver) { b.style.display = ver; revisarGrupos() }
    }
    if (cfg.ligado !== undefined) b.disabled = !cfg.ligado
    // PRINCIPAL QUE MORRE OU RENASCE TROCA QUEM MANDA NA FILEIRA. Quem promove
    // e revisarGrupos, e ele so era chamado quando um botao aparecia ou sumia —
    // mas o APOSTAR do poker nao some quando falta ficha, ele DESLIGA, e a
    // promocao ficava congelada no estado errado ate a proxima rua. A guarda
    // pelo 'grande' e por mudanca de verdade evita refazer o espelho a cada
    // render: so o botao que disputa o posto de principal mexe na conta.
    if (cfg.ligado !== undefined && b.disabled !== eraOff
      && b.classList.contains(P + 'grande')) revisarGrupos()
    if (cfg.chama !== undefined) marca(b, 'chama', !!cfg.chama && !b.disabled)
    // Desligar um botao que estava chamando tem que apagar o anel junto: anel
    // aceso em botao morto e a pior mentira que este rodape pode contar.
    if (b.disabled) marca(b, 'chama', false)
    // OS DOIS ESTALOS, e a diferenca entre eles e o tamanho da noticia.
    //
    // ACENDE (salto + halo) e pra quando o botao passa a EXISTIR: destravou ou
    // voltou pra tela. E a noticia de que ha uma jogada nova disponivel.
    //
    // TROCA (so a tinta esquentando) e pra quando o mesmo botao vivo muda de
    // PRECO. Antes os dois davam a mesma animacao, e como o preco muda a cada
    // ficha empurrada no pano, montar 400 em ficha de 25 dava dezesseis saltos
    // seguidos no APOSTAR — a essa altura o salto ja nao avisava nada.
    //
    // Nenhum dos dois toca em botao invisivel ou morto: animacao em coisa que
    // o jogador nao pode usar e so ruido.
    const vivo = !b.disabled && b.style.display !== 'none'
    const nasceu = vivo && (eraOff || eraFora)
    const virou = vivo && !nasceu && lido(b) !== eraTxt
    if (nasceu || virou) {
      marca(b, 'acende', false)
      marca(b, 'troca', false)
      void b.offsetWidth
      marca(b, nasceu ? 'acende' : 'troca', true)
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
