import * as THREE from 'three'
import { criarBaralho3D, CARTA_L, CARTA_C, CARTA_E } from './cartas-3d.js'
import * as som from './som-mesa.js'

// ---------------------------------------------------------------------------
// src/cassino/mesa-3d.js — O PALCO DA MESA: cartas, fichas e o tempo delas.
//
// O pedido: "aproxima a tela na mesa e ve as cartas bem nitidas... mostre as
// cartas na mesa tudo grande e COM JUICE". Este arquivo e o "juice". Ele nao
// sabe uma regra de blackjack e nao sabe o que e uma aposta em ouro: ele
// recebe "esta fila tem estas cartas" e "esta pilha vale tanto", e faz a
// diferenca ACONTECER na mesa — carta saindo do sapato num arco, pousando com
// um tap, virando pela borda; ficha caindo uma a uma com estalo; pilha perdida
// deslizando pro lado da casa.
//
// POR QUE ELE E DECLARATIVO (cartas(fila, defs)) E NAO IMPERATIVO (darCarta()).
// A maquina de estados do blackjack nao emite eventos: ela devolve um SNAPSHOT
// do que existe agora. Uma API imperativa obrigaria a UI a adivinhar o que
// mudou entre dois snapshots — e esse "adivinhar" e exatamente o bug que a
// versao em DOM ja tinha resolvido com um diff (ver pintarCartas em
// ui/cassino-ui.js). Aqui o diff mora num lugar so: `cartas()` compara o que
// esta na mesa com o que foi pedido, e SO o que mudou anima. Sem isso, todo
// 'pedir' faria a mao inteira voar de novo, que e a cara de um bug.
//
// TRES REGRAS DE ORCAMENTO, porque o cassino ja e um lugar caro:
//
//   1. UM material pras 52 cartas (o atlas de cartas-3d.js) e UM InstancedMesh
//      pras fichas todas, com cor por instancia. A mesa inteira aberta custa
//      ~30 draw calls, e ZERO enquanto ninguem esta jogando (o grupo nasce
//      invisivel e so acende em entrar()).
//   2. NENHUMA LUZ NOVA, NUNCA. Acender o feltro num blackjack e um PLANO com
//      material aditivo que sobe de opacidade — nao uma PointLight. A contagem
//      de luzes visiveis define o programa de shader de TODO material da cena;
//      ligar uma luz aqui recompilaria o cassino inteiro no meio da jogada.
//      (A armadilha esta escrita em render/luzes-efeito.js desde que existe.)
//   3. A SOMBRA DA CARTA E UM BORRAO, nao um shadow map. As duas PointLight do
//      salao nao projetam sombra, entao castShadow numa carta nao desenharia
//      nada; e um plano com degrade radial que segue o XZ da carta, cresce e
//      clareia conforme ela sobe. Custa um draw call por carta e le melhor.
//
// O SISTEMA DE EIXOS DA MESA e o mesmo nas duas mesas, e e o que permite um
// arquivo so: a origem do grupo fica no CENTRO da mesa, no chao do salao;
// +Z aponta pra CASA (a atendente em pe, o ricaco sentado) e -Z pro JOGADOR.
// Tudo — layout, enquadramento de camera, direcao de varrer ficha — e escrito
// nesse espaco e convertido pro mundo na hora de usar.
// ---------------------------------------------------------------------------

// --- fichas ----------------------------------------------------------------

// Valores e cores de mesa de verdade, os MESMOS que a faixa de botoes mostra
// (COR_FICHA em cassino/faixa-mesa.js — as duas tabelas sao a MESMA por
// contrato; mexeu numa, mexe na outra).
// Do maior pro menor porque a decomposicao e gulosa e depende dessa ordem.
//
// 'bri' e um brilho de base, so na de 500: a dourada fica um tico acima das
// outras o tempo todo, o suficiente pra chamar o olho numa pilha misturada e
// AINDA ASSIM ficar abaixo do threshold do bloom (ver FLASH_* la embaixo) —
// ela nao acende sozinha, ela so parece de metal em vez de argila.
const DENOM = [
  { v: 500, cor: 0xc9a24a, bri: 0.10 },
  { v: 250, cor: 0x8f2f45 },
  { v: 100, cor: 0x23262e },
  { v: 50, cor: 0x2f6f9f },
  { v: 25, cor: 0x2f8f5b },
  { v: 10, cor: 0x7a5ea8 },
  { v: 5, cor: 0x4a6f8f },
  { v: 1, cor: 0xe8e2d2 },
]

// PROPORCAO. Uma ficha de verdade tem 39 mm de diametro por 3,3 mm — razao
// altura/diametro de 0,085. Aqui e 0,12: ainda mais gorda que a real, porque a
// lente desta mesa e alta e uma pilha fina vira um borrao de listras. O que
// mudou em relacao a versao anterior (0,132) e que a ficha ficou um pouco
// MAIOR na tela em vez de mais fina — o aro agora tem desenho (8 insercoes) e
// desenho precisa de pixel pra existir.
const FICHA_R = 0.0315
const FICHA_H = 0.0075
const FICHA_MAX = 18            // teto de fichas por pilha; acima disso a
                                // decomposicao para e o resto vira "e mais"
// 12 E NAO 7, e a conta e de largura, nao de altura.
//
// Uma pilha cresce ate FICHA_MAX*2 = 36 fichas (o teto vem do crescimento
// incremental: dobrar uma aposta empilha por cima em vez de refazer). Com 7 por
// coluna isso abre SEIS colunas, e cada coluna nova anda FICHA_R*2.25 = 7,1 cm:
// 35 cm de pilha. No blackjack a aposta e o pagamento estao a 18,5 cm um do
// outro (LAYOUT.blackjack.pilhas), entao a pilha grande atravessava a vizinha e
// as duas viravam um monte so — que e justamente o que 'pago' ao lado de
// 'aposta' existe pra evitar. Com 12, as mesmas 36 fichas cabem em 3 colunas
// (14,2 cm) e a folga volta. Coluna de 12 tem 9 cm de altura, que e menos que a
// pilha de 20 de uma mesa de verdade.
const FICHA_COLUNA = 12         // fichas por coluna antes de abrir outra
// O TETO DE INSTANCIAS, e a conta mudou quando o caixote entrou.
//
// Antes so havia as pilhas do pote: 36 minhas mais 36 da casa, e 96 sobrava.
// Agora o CAIXOTE do jogador soma 5 pilhas de ate 8 fichas em cima do pano —
// 40 a mais — e o pior caso passou a ser 40 + 36 + 36 = 112. Em 96, quem
// apostasse grande via as pilhas do proprio caixote pararem de nascer no meio
// da mao (as duas alocacoes tem `break` no teto, entao nao quebrava nada: so
// sumia dinheiro da tela sem explicacao). 140 cobre o pior caso com folga.
//
// Custa uma matriz e uma cor por instancia num InstancedMesh que ja existe:
// nao ha draw call novo e a memoria e alguns kilobytes.
const POOL_FICHAS = 140

// --- desenho da ficha ------------------------------------------------------
// 32 segmentos e 8 insercoes no aro. POR QUE 8 E NAO 6: 32 divide por 8 exato,
// entao cada quina de mancha CAI EM CIMA de um vertice e sai uma quina de
// verdade em vez de degrade. Com 6 manchas cada uma ocuparia 30 graus e a
// ficha lida de cima vira uma estrela de seis pontas — 8 manchas de 22,5 graus
// com 22,5 de folga e a proporcao de ficha de cassino de verdade, e a que
// continua legivel quando a ficha tem 30 px na tela.
// 32 tambem e o teto: o orcamento e ~400 triangulos por ficha (ha ate 96
// instancias no mesmo InstancedMesh) e o perfil abaixo gasta 384.
const SEG_FICHA = 32
const SPOT_PERIODO = 4          // segmentos por mancha + folga (32/8)
const SPOT_LARGURA = 2          // quantos desses segmentos sao mancha

// O PERFIL DA FICHA, do centro da tampa ate o centro do fundo. Cada linha e um
// anel: [raio em fracao de FICHA_R, altura em fracao de FICHA_H/2, brilho, sp].
//
// 'brilho' vai na COR DE VERTICE e MULTIPLICA a cor da instancia — e o que
// deixa a mesa inteira num draw call: a geometria carrega o DESENHO e a
// instancia carrega o VALOR.
// 'sp' e quanto aquele anel vira INSERCAO (creme de osso, ou escuro se a ficha
// ja for clara): 0 = nada, 1 = insercao cheia, 2 = "depende do setor" (as 8
// manchas do aro). Valor quebrado no meio serve pro miolo, que e um decalque
// desbotado — a pastilha impressa que toda ficha de verdade tem no centro.
//
// Aneis REPETIDOS (mesmo raio e mesma altura, brilho diferente) nao geram
// triangulo nenhum — sao so vertices — e sao o truque que da QUINA DURA entre
// duas cores. Sem eles o anel interno vira um degrade e a ficha volta a ler
// como rodela de plastico, que era exatamente a reclamacao.
const PERFIL_FICHA = [
  [0.00, 0.78, 1.34, 0.62],  // centro do miolo REBAIXADO: a pastilha impressa
  [0.40, 0.78, 1.16, 0.62],  // borda da pastilha
  [0.40, 0.78, 0.42, 0],     // (repetido) comeca o degrau
  [0.53, 1.00, 0.52, 0],     // topo do degrau — e ELE o anel interno escuro:
                             // inclinado, pega luz de raspao e le como recorte
  [0.53, 1.00, 1.06, 0],     // (repetido) campo da tampa
  [0.80, 1.00, 0.98, 0],
  [0.80, 1.00, 0.96, 2],     // (repetido) comeca a faixa das insercoes
  [0.91, 1.00, 0.88, 2],     // fim da parte plana da insercao
  [1.00, 0.70, 0.68, 2],     // fim do CHANFRO / topo do aro
  [1.00, -1.00, 0.38, 2],    // base do aro
  [1.00, -1.00, 0.28, 0],    // (repetido) comeca o fundo
  [0.00, -1.00, 0.24, 0],    // centro do fundo
]

// Quanto tempo o flash de pouso leva pra morrer. 0,15 s e o intervalo que o
// olho le como ESTALO: mais curto vira cintilacao (parece bug de z-fighting),
// mais longo a ficha vira lampada e o UnrealBloomPass — threshold 0.85 em
// core/engine.js, so estoura o que e luz de verdade — borra a pilha inteira
// num pastel branco.
const FLASH_DUR = 0.15
const FLASH_POUSO = 0.85        // pico de quem acabou de encostar
const FLASH_VARRE = 0.95        // a pilha indo embora pisca um pouco mais

// Queda: 0,30 s no total, dos quais os primeiros 62% sao voo e o resto e o
// quique. Antes eram 0,20 s de pouso reto — a ficha aparecia no lugar em vez
// de CHEGAR nele.
const DUR_QUEDA = 0.30
const TOQUE = 0.62
// Amplitude do quique: meia ficha. Menos que isso nao le a 30 px de tela;
// mais que isso a ficha "flutua" e a pilha deixa de parecer coluna solida.
const QUIQUE = FICHA_H * 0.55

const POOL_CARTAS = 16

// Quanto o clarao do feltro pode somar, no maximo. Ver acender().
const BRILHO_PICO = 0.42

// --- layouts ---------------------------------------------------------------
//
// Todo numero abaixo esta no espaco da mesa (origem no centro, no chao) e foi
// escolhido contra a geometria que world/casino.js ja tem no feltro: as cartas
// do blackjack ficam ENTRE o rack de fichas da casa (z=-0.20) e a linha
// impressa "BLACKJACK PAGA 3 PARA 2" (z=-0.75), e a aposta cai exatamente
// dentro do circulo do meio do arco (raio 1.18). No poker as duas cartas do
// jogador nascem POR CIMA do par decorativo que ja estava desenhado ali — sao
// maiores que ele em todas as bordas, entao ele some por baixo em vez de virar
// um terceiro par fantasma na mesa.
const LAYOUT = {
  blackjack: {
    feltro: 0.92,
    // ASSENTO: a que altura acima do feltro a carta descansa. Nao e folga
    // estetica, e briga de profundidade: o feltro do blackjack ja tem duas
    // linhas impressas (decalChao) em +0.008 e os aneis de aposta em +0.006.
    // Carta abaixo disso ganha a linha por cima dela, e o defeito aparece como
    // texto atravessando a carta.
    assento: 0.012,
    versoAzul: false,
    sapato: { x: 0.78, z: -0.34, alt: 0.15 },
    descarte: { x: -0.86, z: -0.34, alt: 0.10 },
    // As duas fileiras ficam a 36 cm uma da outra — MENOS que numa mesa real,
    // e de proposito. Ver a nota sobre a lente logo abaixo: cada centimetro
    // entre a mao da casa e a minha e um centimetro que a camera precisa
    // recuar, e recuar encolhe a carta na tela ao quadrado.
    // AS MINHAS CARTAS FICAM DE PE aqui tambem — ver a nota longa sobre
    // 'inclina' no layout do poker. A da CASA nao: carta da casa fica deitada no
    // pano porque uma delas esta tapada, e carta virada pra baixo escorada le
    // como bug. Ela so levanta no fim, quando a tapada ganha face, e essa e a
    // virada de mesa que antes exigia um enquadramento so pra ela ('revelar').
    filas: {
      dealer: { x: 0.00, z: -0.28, passo: 0.076, leque: 0.038, inclina: 0.55 },
      mao0: { x: 0.00, z: -0.60, passo: 0.082, leque: -0.038, inclina: 0.80, inclinaVerso: 0.80 },
      mao1: { x: -0.30, z: -0.60, passo: 0.066, leque: -0.038, inclina: 0.80, inclinaVerso: 0.80 },
    },
    // A aposta cai na FRENTE da mao, como numa mesa de verdade — mas a 16 cm
    // dela, e nao no circulo impresso a 52 cm. O circulo impresso do feltro foi
    // desenhado pra cinco cadeiras; com uma so, ele fica longe demais da mao
    // pro mesmo quadro segurar os dois. 'pago' e onde a CASA poe o que deve:
    // ao lado da aposta, nunca em cima dela, porque e ver as duas pilhas
    // separadas que faz o pagamento parecer o dobro em vez de "a pilha mudou
    // de cor".
    pilhas: {
      aposta: { x: 0.000, z: -0.82 },
      pago: { x: 0.185, z: -0.82 },
      aposta1: { x: -0.260, z: -0.82 },
      pago1: { x: -0.445, z: -0.82 },
    },
    // O CAIXOTE: as MINHAS fichas, em cima do pano, uma pilha por valor.
    //
    // E o lugar mais perto da lente que ainda e feltro, e tem que ser: e dali
    // que sai toda aposta. Cinco casas espacadas de 16,5 cm — 6,3 cm de ficha
    // mais 10 de folga, o bastante pra o clique nao errar de pilha e pra as
    // pilhas nao encostarem uma na outra quando estao cheias.
    caixote: { z: -1.06, passo: 0.115, altura: 8 },
    // pra onde a ficha vai quando alguem leva o dinheiro
    casa: { x: -0.10, z: 0.14 },
    eu: { x: 0.00, z: -1.30 },
    brilho: { x: 0.00, z: -0.50, r: 0.85 },
    // OS QUATRO ENQUADRAMENTOS, e eles nao foram escolhidos no olho.
    //
    // Cada um foi MEDIDO projetando as duas bordas de uma carta e lendo que
    // fracao da ALTURA da tela ela ocupa. Isso importa porque a intuicao erra
    // feio aqui: a carta esta deitada, entao o que se ve dela encolhe com o
    // SENO da inclinacao da lente. Uma camera "de quem esta em pe na corda"
    // (25 graus) deixa a carta em 8% da tela por mais que o campo feche — foi
    // exatamente o primeiro enquadramento que este arquivo teve, e ele nao
    // atendia o pedido ("ve as cartas bem nitidas... tudo grande").
    //
    // A LENTE FOI REFEITA PRA CABER O CAIXOTE. Ela agora tem que segurar, de
    // baixo pra cima: as minhas pilhas em z=-1.06, a aposta em -0.82, a minha
    // mao em -0.60 e a da casa em -0.28. Sao 78 cm de pano num quadro so, e o
    // que paga a conta e a carta ficar de pe (ver 'filas'): deitada ela cairia
    // pra 4% da tela nesta distancia.
    //
    // Medido projetando: pilha do caixote com a base a 86% da altura da tela
    // (a faixa de botoes comeca em ~87% agora que a fileira de fichas saiu
    // dela), aposta a 67%, minha carta a 50% e 13% de altura, carta da casa a
    // 43% e 9%. Nenhum mergulho: e um quadro so a mao inteira, como no poker.
    //
    // A LENTE FICA ALTA (43 graus de inclinacao) DE PROPOSITO, e nao e
    // capricho: e a inclinacao que SEPARA as duas maos. Numa lente baixa a
    // perspectiva comprime o fundo e a mao da casa (z=-0.28) cai quase em cima
    // da minha (z=-0.60) — foi o que a primeira versao deste quadro fez, e as
    // duas maos liam como uma so no meio da tela.
    //
    // Remedido depois disso: mao da casa a 34% da altura da tela com 10% de
    // altura de carta, minha mao a 47% com 13%, aposta a 65% e a base das
    // minhas pilhas a 86%.
    quadros: {
      jogo: { pos: [0.00, 1.86, -1.60], alvo: [0.00, 0.95, -0.62], fov: 46 },
      duas: { pos: [0.00, 1.92, -1.66], alvo: [0.00, 0.95, -0.62], fov: 52 },
    },
  },
  poker: {
    feltro: 0.78,
    // Mais alto que no blackjack porque aqui ha um par de cartas DECORATIVAS
    // assadas no feltro debaixo de cada lugar (world/casino.js), e o topo delas
    // esta em +0.0142. A carta viva pousa por cima e esconde a decorativa, que
    // e menor em todas as bordas — do contrario a mesa mostraria dois pares.
    assento: 0.016,
    versoAzul: true,
    sapato: { x: 1.02, z: 0.30, alt: 0.18 },
    // 0.012 e nao 0.10 como no blackjack: la a carta descartada cai DENTRO da
    // bandeja de descarte, que tem 10 cm de altura e existe no feltro. A mesa de
    // poker nao tem bandeja nenhuma, entao os mesmos 10 cm deixavam a mao velha
    // pairando um palmo acima do pano — visivel a cada mao nova, e obvio agora
    // que a lente parou de recuar.
    descarte: { x: -1.02, z: 0.26, alt: 0.012 },
    // AS CARTAS DO JOGADOR FICAM DE PE, E ISSO E O QUE SALVA O QUADRO.
    //
    // Carta deitada encolhe na tela com o SENO da inclinacao da lente (a nota
    // dos quadros do blackjack explica). Aqui a lente tem que ficar longe pra
    // caber o ricaco, entao esse seno cobrava 5% da altura da tela por carta —
    // ilegivel, e foi o defeito que o dono relatou ("aproxima demais e depois
    // afasta demais": os dois mergulhos existiam SO pra compensar isto).
    //
    // A saida nao e mexer na lente, e mexer na CARTA: 'inclina' levanta a borda
    // de tras (+Z) e vira a face pro jogador, como carta escorada no trilho da
    // mesa. Com 50 graus a carta para de ser vista de raspao — o encurtamento
    // cai de sen(35 graus)=0.57 pra cos(5 graus)=0.996 — e ela passa a ocupar
    // 13% da altura da tela SEM a lente andar um centimetro. Um quadro so, a
    // mao inteira, que e o pedido.
    //
    // 'inclinaVerso' e a mesma coisa pra carta tapada, e por isso e ZERO no
    // ricaco: carta virada pra baixo levantada nao le como carta escondida, le
    // como bug. Ele so levanta as dele no showdown — quando ganham face — e
    // essa e a virada de mesa que antes exigia a camera atravessar o feltro.
    filas: {
      eu: { x: 0.00, z: -0.58, passo: 0.122, leque: -0.040, inclina: 0.87, inclinaVerso: 0.87 },
      ele: { x: 0.00, z: 0.62, passo: 0.116, leque: 0.055, inclina: 0.95 },
      // A MESA COMUNITARIA: flop, turn e river. Ela nasceu quando o jogo virou
      // Texas Hold'em e e a fila mais importante do feltro — os dois jogadores
      // leem ela, e ela decide a mao.
      //
      // z=0.02 e o meio geometrico entre as duas maos, que e onde o olho ja
      // procura. 'leque' zero porque board de verdade e uma fileira reta: o
      // leque existe pra mao na mao, onde a carta de cima cobre a de baixo.
      // 'passo' 0.122 contra 0.105 de largura de carta deixa 1,7 cm de rua —
      // encostadas como um dealer espalha, sem virar um bloco so.
      //
      // 45 graus de 'inclina', menos que os 50 da minha mao: a carta do board
      // fica LONGE da lente (1,9 m contra 1,1 m) e leva 7,3% da altura da tela
      // contra os 3% que teria deitada. Nao passa de 45 porque a carta de pe
      // esconde 25 cm de pano atras dela, e ai comeca a comer as fichas do
      // ricaco. Medido na foto: comecou em 35 graus e 6,7%, e os 0,6 ponto que
      // faltavam vieram de graca.
      mesa: { x: 0.00, z: 0.02, passo: 0.122, leque: 0, inclina: 0.78, inclinaVerso: 0.78 },
    },
    // AS DUAS ENTRADAS DO POTE SAIRAM DO EIXO DO MEIO, e o motivo e oclusao.
    //
    // Elas ficavam em x=0, na mesma coluna das minhas cartas. Com a carta
    // deitada isso nao era problema; com ela DE PE (11 cm de altura) a carta
    // passou a tapar tudo que esta atras dela ate uns 17 cm de pano — e a minha
    // propria aposta sumia por tras da minha mao, que e a informacao que o
    // jogador mais precisa ver enquanto decide. Empurradas 28 cm pro +X (a
    // esquerda da tela) elas viram uma coluna livre: a minha embaixo, perto de
    // mim; a dele em cima, perto dele.
    // 0.46 e nao 0.28: o board comunitario ocupa de -0.26 a +0.26 em x, e as
    // pilhas do pote estavam justamente na ponta dele. Empurradas pra 0.46 elas
    // viram uma coluna livre a esquerda da tela — a minha embaixo, perto de mim,
    // a dele em cima, perto dele — e o meio do pano fica so pras cinco cartas.
    pilhas: {
      minha: { x: 0.46, z: -0.30 },
      dele: { x: 0.46, z: 0.28 },
    },
    // O CAIXOTE: as MINHAS fichas em cima do pano, uma pilha por valor, na
    // beirada do oval do meu lado. Em z=-0.93 com x ate 0.35 a elipse do tampo
    // (rx 1.55, rz 1.05) ainda tem pano — a conta e (x/1.55)^2+(z/1.05)^2 < 1 —
    // e a pilha fica na frente das minhas cartas (z=-0.68) sem tapa-las.
    caixote: { z: -0.90, passo: 0.115, altura: 8 },
    casa: { x: 0.00, z: 0.90 },
    eu: { x: 0.00, z: -0.96 },
    brilho: { x: 0.00, z: 0.00, r: 0.85 },
    // UM QUADRO SO PRA MAO INTEIRA, medido contra a faixa de botoes.
    //
    // A versao anterior tinha quatro: um plano aberto de 5% de carta e dois
    // MERGULHOS ('minhas' com fov 32, 'revelar' com fov 30) que caiam em cima
    // das cartas e voltavam. O dono descreveu o resultado como "aproxima demais
    // nas cartas e quando afasta, afasta muito" — que e exatamente o que quatro
    // enquadramentos em vinte segundos de mao fazem. O pedido foi mesa parada,
    // cartas embaixo e no meio, "igual poker stars".
    //
    // Entao a lente para de viajar e quem passou a resolver a leitura foi a
    // INCLINACAO DA CARTA (ver 'filas' acima). Sobrou uma unica lente, e ela
    // foi medida — nao escolhida no olho — projetando tres pontos:
    //
    //   caixote      — a base das minhas pilhas a 84% da altura da tela. E a
    //                  folga de BAIXO, contra a faixa de botoes (que comecou a
    //                  caber em ~87% depois que a fileira de fichas saiu dela e
    //                  foi pro pano).
    //   carta minha  — centro a 67%, 11% de altura de tela por carta. Perdeu
    //                  dois pontos pro caixote e vale: dez vezes mais que os
    //                  5% da versao de lente aberta, e agora com o dinheiro na
    //                  mesa junto.
    //   carta dele   — na metade de cima, onde o olho procura o adversario.
    //                  Tapada ela e pequena de proposito; no showdown ela
    //                  levanta e triplica sem a lente se mexer.
    //   chapeu dele  — 7% abaixo da borda de cima. E a folga de CIMA e a que
    //                  manda no fov junto com a de baixo: 56 graus e o menor
    //                  campo em que o caixote e o ricaco INTEIRO cabem no mesmo
    //                  quadro. Fechar mais corta a aba do chapeu ou come as
    //                  minhas pilhas.
    //
    // 'aposta' e so a chegada — quase a mesma lente, um passo atras, pro corte
    // de entrada na mesa ter pra onde assentar. A diferenca e pequena de
    // proposito: e o unico movimento de camera que sobrou na mesa.
    quadros: {
      jogo: { pos: [0.00, 1.56, -1.74], alvo: [0.00, 0.81, 0.00], fov: 52 },
    },
  },
}

// --- ferramentas -----------------------------------------------------------

function suave(k) {
  if (k <= 0) return 0
  if (k >= 1) return 1
  return k * k * (3 - 2 * k)
}

/** Sai rapido e chega parando: o passo certo pra carta que voa. */
function freia(k) {
  return 1 - (1 - k) * (1 - k) * (1 - k)
}

/** Identidade de uma posicao da fila. Verso e sempre a MESMA chave: duas
 *  cartas viradas pra baixo sao indistinguiveis, e tem que ser. */
export function chaveDef(d) {
  if (!d) return '~'
  if (d.verso || !d.carta || !d.carta.r) return '##'
  return d.carta.n + ':' + d.carta.r
}

/** Decompoe um valor em fichas, da maior pra menor. Devolve as ENTRADAS da
 *  DENOM (nao so a cor) porque a ficha precisa saber tambem o brilho de base. */
function decompor(valor) {
  const out = []
  let v = Math.max(0, Math.floor(valor) || 0)
  for (let i = 0; i < DENOM.length && out.length < FICHA_MAX; i++) {
    const d = DENOM[i]
    while (v >= d.v && out.length < FICHA_MAX) { out.push(d); v -= d.v }
  }
  return out
}

/** Barulho determinista 0..1 a partir de um inteiro.
 *  DETERMINISTA importa: a ficha de indice 3 tem que cair sempre no mesmo
 *  angulo, senao a pilha se remexe sozinha toda vez que ela e redesenhada. */
function hash01(i) {
  const s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453
  return s - Math.floor(s)
}

/**
 * Onde a n-esima ficha de uma pilha pousa, em relacao a base da pilha.
 *
 * O DESALINHO NAO E ENFEITE. Pilha com todas as fichas no mesmo eixo e no
 * mesmo angulo vira um CILINDRO LISO na tela: some a costura entre uma ficha e
 * a de baixo, e o olho para de contar quantas sao. 3% de raio de bagunca em
 * x/z mais um angulo sorteado por ficha e o que faz as 8 insercoes do aro
 * cairem em lugares diferentes a cada nivel — e e esse serrilhado em espiral
 * que o olho le como PILHA.
 */
function posicaoNaPilha(i) {
  const col = Math.floor(i / FICHA_COLUNA)
  const nivel = i % FICHA_COLUNA
  return {
    dx: col * (FICHA_R * 2.25) + (hash01(i * 2 + 1) - 0.5) * FICHA_R * 0.06,
    dz: (hash01(i * 2 + 9) - 0.5) * FICHA_R * 0.06,
    dy: FICHA_H * (nivel + 0.5),
    ry: hash01(i * 31 + 7) * Math.PI * 2,
  }
}

/** Degrade radial preto: a sombra de tudo que voa nesta mesa. */
let _texSombra = null
function texSombra() {
  if (_texSombra) return _texSombra
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(0,0,0,0.85)')
  gr.addColorStop(0.55, 'rgba(0,0,0,0.42)')
  gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  _texSombra = new THREE.CanvasTexture(c)
  _texSombra.colorSpace = THREE.SRGBColorSpace
  return _texSombra
}

/** Disco de luz suave, pro brilho do feltro. Aditivo: nao e luz, e pintura. */
let _texBrilho = null
function texBrilho() {
  if (_texBrilho) return _texBrilho
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  _texBrilho = new THREE.CanvasTexture(c)
  _texBrilho.colorSpace = THREE.SRGBColorSpace
  return _texBrilho
}

/**
 * A FICHA, torneada a mao a partir de PERFIL_FICHA.
 *
 * Era um CylinderGeometry liso com traquinho no aro, e lia como rodela de
 * plastico. Agora tem o que uma ficha de argila tem: miolo rebaixado, degrau
 * escuro em volta dele fazendo o anel interno, chanfro na borda da tampa e 8
 * insercoes claras que ENTRAM PELA TAMPA e descem o aro inteiro — nao um
 * tracejado, insercoes com quina, como as de verdade.
 *
 * TRES DECISOES QUE SEGURAM O ORCAMENTO:
 *
 *   1. Um InstancedMesh so pras 96 fichas. `instanceColor` e a cor de vertice
 *      se MULTIPLICAM no shader: a geometria carrega o DESENHO (multiplicador
 *      de brilho por vertice) e a instancia carrega o VALOR. Sem isso seriam
 *      oito meshes, um por denominacao.
 *   2. NAO E INDEXADA de proposito. Cada quadradinho e emitido sozinho, com os
 *      proprios vertices: e o unico jeito de a mancha do aro ter QUINA em vez
 *      de degrade, porque vertice compartilhado interpola a cor por cima da
 *      quina. O custo e 1152 vertices, pagos UMA vez pras 96 instancias.
 *   3. As normais sao CALCULADAS do perfil, nao das faces. Assim o aro fica
 *      redondo (normal radial) mesmo com 32 lados e cada faixa do perfil pega
 *      luz no angulo dela — que e o que faz o chanfro existir.
 *
 * Sao 384 triangulos: 32 no leque do miolo, 32 no leque do fundo e 64 em cada
 * uma das cinco faixas com area (degrau, campo, insercao plana, chanfro, aro).
 *
 * NAO E CACHEADA. O atributo 'aFlash' e POR INSTANCIA e mora na geometria; se
 * as duas mesas (blackjack e poker) dividissem uma geometria so, o flash de
 * uma piscaria as fichas da outra.
 */
function geoFicha() {
  const meia = FICHA_H / 2
  const pos = []
  const nor = []
  const cor = []
  const spo = []

  function vert(c, s, r, y, nr, nv, sh, sp) {
    pos.push(c * r, y, s * r)
    nor.push(nr * c, nv, nr * s)
    cor.push(sh, sh, sh)
    spo.push(sp)
  }

  for (let p = 0; p < PERFIL_FICHA.length - 1; p++) {
    const a = PERFIL_FICHA[p]
    const b = PERFIL_FICHA[p + 1]
    const r0 = a[0] * FICHA_R, y0 = a[1] * meia
    const r1 = b[0] * FICHA_R, y1 = b[1] * meia
    // anel repetido: so troca de cor, nao tem area. Nao gera triangulo.
    if (r0 === r1 && y0 === y1) continue
    // Normal do segmento do perfil girada 90 graus: (-dy, dr) normalizado. Da
    // (0,1) na tampa, (1,0) no aro e o angulo certo no chanfro e no degrau,
    // tudo com a mesma conta.
    const dr = r1 - r0, dy = y1 - y0
    const ln = Math.hypot(dr, dy) || 1
    const nr = -dy / ln, nv = dr / ln
    for (let s = 0; s < SEG_FICHA; s++) {
      const t0 = (s / SEG_FICHA) * Math.PI * 2
      const t1 = ((s + 1) / SEG_FICHA) * Math.PI * 2
      const c0 = Math.cos(t0), s0 = Math.sin(t0)
      const c1 = Math.cos(t1), s1 = Math.sin(t1)
      const mancha = (s % SPOT_PERIODO) < SPOT_LARGURA ? 1 : 0
      const spA = a[3] === 2 ? mancha : a[3]
      const spB = b[3] === 2 ? mancha : b[3]
      // Ordem (A0,A1,B1) + (A0,B1,B0), com o perfil andando do centro da tampa
      // pra fora e depois pra baixo: da a face pro lado de FORA em todas as
      // faixas, inclusive no aro vertical e no leque do fundo.
      if (r0 > 0) {
        vert(c0, s0, r0, y0, nr, nv, a[2], spA)
        vert(c1, s1, r0, y0, nr, nv, a[2], spA)
        vert(c1, s1, r1, y1, nr, nv, b[2], spB)
      }
      if (r1 > 0) {
        vert(c0, s0, r0, y0, nr, nv, a[2], spA)
        vert(c1, s1, r1, y1, nr, nv, b[2], spB)
        vert(c0, s0, r1, y1, nr, nv, b[2], spB)
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cor), 3))
  g.setAttribute('aSpot', new THREE.BufferAttribute(new Float32Array(spo), 1))
  g.computeBoundingSphere()
  return g
}

/**
 * O SHADER DA FICHA, injetado no MeshStandardMaterial. Duas coisas que a cor
 * de vertice sozinha nao consegue fazer:
 *
 * 1. A INSERCAO NAO PODE SER MULTIPLICACAO. Cor de vertice multiplica a cor da
 *    instancia, e multiplicar preto por 1,5 continua dando preto — a ficha de
 *    100 (0x23262e) ficaria com manchas pretas em cima de preto. Aqui a mancha
 *    SUBSTITUI a cor por um creme de osso, guardando so o brilho do vertice.
 *    E o creme vira ESCURO quando a ficha ja e clara (a de 1 e 0xe8e2d2):
 *    marfim com mancha marfim nao e ficha, e disco. O corte em 0.52 de
 *    luminancia separa so a de 1 — a dourada (0.40) fica com mancha creme.
 * 2. O FLASH DE BLOOM. O UnrealBloomPass do jogo tem threshold 0.85 (linear,
 *    core/engine.js): so passa o que e luz. Empurrar a COR da instancia pra
 *    cima nao chega la — a cor e albedo, ela ainda depende da luz que bate.
 *    Entao a ficha ganha EMISSIVO por instancia (aFlash), que entra direto na
 *    radiancia e passa do corte sem acender nenhuma PointLight. A parte
 *    somada e quente e fixa: assim a ficha preta tambem estoura, senao so a
 *    dourada piscaria e o pouso das outras seria invisivel.
 *
 *    O emissivo e MULTIPLICADO PELO BRILHO DO VERTICE, e essa multiplicacao e
 *    a diferenca entre "ficha pega a luz do lustre" e "ficha de neon". O
 *    high-pass do bloom nao le "quanto passou" — passou do corte, a cor
 *    INTEIRA daquele pixel vai pro borrao. Logo o que decide o tamanho do
 *    clarao e a AREA que passa, nao a intensidade. Com o vShade dentro, so a
 *    pastilha do meio e a tampa passam; o aro (0,38) e o fundo ficam abaixo do
 *    corte e a ficha continua tendo silhueta durante o flash. Sem ele, a ficha
 *    inteira estoura e a pilha vira um tijolo branco (ja aconteceu, ver
 *    shots/fic-07-macro-flash.png da primeira tentativa).
 */
function compilarFicha(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
attribute float aSpot;
attribute float aFlash;
varying float vSpot;
varying float vShade;
varying float vFlash;`)
    .replace('#include <color_vertex>', `#include <color_vertex>
vSpot = aSpot;
vShade = color.r;
vFlash = aFlash;`)
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vSpot;
varying float vShade;
varying float vFlash;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
float lumFicha = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
vec3 insercao = mix( vec3( 0.80, 0.77, 0.69 ), vec3( 0.07, 0.08, 0.10 ), step( 0.52, lumFicha ) );
diffuseColor.rgb = mix( diffuseColor.rgb, vShade * insercao, vSpot );`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vFlash * vShade * ( diffuseColor.rgb * 0.6 + vec3( 0.95, 0.80, 0.52 ) );`)
}

// ---------------------------------------------------------------------------
// A MESA
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {object} o.ancora  o objeto de `casino.mesas.blackjack` ou `.poker`
 * @param {'blackjack'|'poker'} o.tipo
 */
export function criarMesa3D({ scene, ancora, tipo } = {}) {
  const L = LAYOUT[tipo] || LAYOUT.blackjack
  const baralho = criarBaralho3D()

  const grupo = new THREE.Group()
  grupo.name = 'mesa3d-' + tipo
  // A mesa nasce APAGADA. Ela fica na cena a sessao inteira (montar e
  // desmontar geometria toda vez que alguem senta seria um engasgo por mao),
  // mas grupo invisivel nao entra em draw call nenhum.
  grupo.visible = false
  if (ancora && ancora.centro) grupo.position.copy(ancora.centro)
  // Altura do feltro no espaco da mesa. Vem da ancora quando ela existe, senao
  // do layout: numero copiado envelhece sozinho no dia em que a mesa subir.
  const feltro = (ancora && Number.isFinite(ancora.tampo) && ancora.centro)
    ? ancora.tampo - ancora.centro.y
    : L.feltro
  // Y de descanso da carta e dos enfeites de chao desta mesa, ja somado.
  const ASSENTO = Number.isFinite(L.assento) ? L.assento : 0.012
  const Y_CARTA = feltro + ASSENTO
  const Y_SOMBRA = Y_CARTA - 0.0025
  const Y_CHAO = Y_CARTA - 0.005
  if (scene) scene.add(grupo)

  // --- animacoes -----------------------------------------------------------
  // Uma lista simples. Cada tarefa tem atraso, duracao, um passo(k) e um fim().
  // Nao ha "tween engine" porque nao ha o que reaproveitar: sao seis tipos de
  // movimento e todos cabem num passo() de tres linhas.
  const tarefas = []
  function anima(t) {
    t.t = 0
    if (!Number.isFinite(t.atraso)) t.atraso = 0
    if (!Number.isFinite(t.dur)) t.dur = 0.3
    tarefas.push(t)
    return t
  }
  function pararTarefas(marca) {
    for (let i = tarefas.length - 1; i >= 0; i--) {
      if (!marca || tarefas[i].marca === marca) {
        const t = tarefas[i]
        tarefas.splice(i, 1)
        if (t.cancelar) t.cancelar()
      }
    }
  }

  // --- fichas: um InstancedMesh, cor por instancia --------------------------
  // 0.38 de roughness e nao 0.48: argila polida de cassino tem um verniz. Com
  // o brilho mais fechado o chanfro e o degrau da tampa aparecem como duas
  // linhas de luz quando a ficha gira — que e o motivo de eles existirem.
  const matFicha = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.38, metalness: 0.06, vertexColors: true,
  })
  matFicha.onBeforeCompile = compilarFicha
  const geoFichas = geoFicha()
  // aFlash: um float POR INSTANCIA com o emissivo do momento. E o canal que
  // faz a ficha estourar o bloom sem existir nenhuma luz nova na cena.
  const flashAttr = new THREE.InstancedBufferAttribute(new Float32Array(POOL_FICHAS), 1)
  flashAttr.setUsage(THREE.DynamicDrawUsage)
  geoFichas.setAttribute('aFlash', flashAttr)
  const fichasMesh = new THREE.InstancedMesh(geoFichas, matFicha, POOL_FICHAS)
  fichasMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  fichasMesh.count = 0
  fichasMesh.castShadow = false
  fichasMesh.receiveShadow = true
  fichasMesh.frustumCulled = false
  grupo.add(fichasMesh)
  const _dummy = new THREE.Object3D()
  const _cor = new THREE.Color()
  // cada ficha viva: ver novaFicha() logo abaixo
  const fichasVivas = []

  /** Uma ficha na mesa. Todo campo nasce com valor: um undefined aqui vira
   *  NaN na matriz da instancia e a ficha some sem erro nenhum no console. */
  function novaFicha(x, y, z, ry, cor, bri) {
    return {
      x, y, z, cor,
      ry, rx: 0, rz: 0,
      bri: bri || 0,   // brilho de base da denominacao (so a de 500 tem)
      flash: 0,        // pico emissivo que morre em FLASH_DUR
      sq: 0,           // esmagada do impacto, 1 -> 0
      tr: 0,           // tremor herdado de quem caiu em cima, 1 -> 0
      fase: 0,         // fase do tremor, comum a coluna inteira
      sc: 1,           // escala geral (varrer usa pra sumir)
    }
  }

  function repintarFichas() {
    const n = Math.min(fichasVivas.length, POOL_FICHAS)
    for (let i = 0; i < n; i++) {
      const f = fichasVivas[i]
      // TREMOR: quando cai ficha nova em cima, a coluna inteira balanca. O
      // deslocamento e so de DESENHO — f.x/f.y continuam sendo o lugar de
      // verdade, senao o tremor ia grudando na posicao a cada quadro e a pilha
      // andava sozinha pela mesa.
      const bal = f.tr > 0 ? Math.sin(tempo * 46 + f.fase) * f.tr : 0
      const q = f.sq
      _dummy.position.set(
        f.x + bal * FICHA_R * 0.05,
        f.y + Math.abs(bal) * FICHA_H * 0.30,
        f.z)
      _dummy.rotation.set(f.rx, f.ry + bal * 0.06, f.rz)
      // ESMAGA no toque: achata em y e engorda em xz, com volume mais ou menos
      // constante. E o unico jeito de uma ficha rigida ter peso sem simular
      // fisica nenhuma — e some em 0,18 s, antes de alguem notar que a ficha
      // deformou.
      _dummy.scale.set(f.sc * (1 + q * 0.20), f.sc * (1 - q * 0.42), f.sc * (1 + q * 0.20))
      _dummy.updateMatrix()
      fichasMesh.setMatrixAt(i, _dummy.matrix)
      _cor.setHex(f.cor)
      fichasMesh.setColorAt(i, _cor)
      flashAttr.array[i] = f.flash + f.bri
    }
    fichasMesh.count = n
    fichasMesh.instanceMatrix.needsUpdate = true
    if (fichasMesh.instanceColor) fichasMesh.instanceColor.needsUpdate = true
    flashAttr.needsUpdate = true
  }

  // --- pilhas de ficha por nome --------------------------------------------
  // pilha = { base:{x,z}, valor, itens:[ref pra fichasVivas] }
  //
  // A pilha guarda o VALOR e nao a lista de cores, e isso e a coisa mais
  // importante deste bloco. Uma pilha que se redesenha a partir do total
  // decompoe 25 em [25] e 75 em [50,25] — nao ha prefixo comum, e o resultado
  // na tela e a pilha inteira sumindo e voltando a cada aumento. Guardando o
  // valor, subir de 25 pra 75 e simplesmente EMPILHAR 50 em cima do que ja
  // estava, que e o que acontece numa mesa de verdade.
  const pilhas = new Map()
  function pilha(id) {
    let p = pilhas.get(id)
    if (!p) {
      const b = L.pilhas[id] || { x: 0, z: 0 }
      p = { id, base: { x: b.x, z: b.z }, valor: 0, itens: [] }
      pilhas.set(id, p)
    }
    return p
  }

  function soltarFicha(f) {
    const i = fichasVivas.indexOf(f)
    if (i >= 0) fichasVivas.splice(i, 1)
  }

  // --- cartas: pool de meshes ----------------------------------------------
  const matSombraBase = new THREE.MeshBasicMaterial({
    map: texSombra(), color: 0x000000, transparent: true, opacity: 0.5,
    depthWrite: false, depthTest: true,
  })
  const geoSombra = new THREE.PlaneGeometry(1, 1)

  const pool = []
  function pegarCarta() {
    for (let i = 0; i < pool.length; i++) if (!pool[i].usada) { pool[i].usada = true; return pool[i] }
    if (pool.length >= POOL_CARTAS * 3) return null
    const pivo = new THREE.Group()
    const mesh = baralho.novaCarta(L.versoAzul)
    pivo.add(mesh)
    grupo.add(pivo)
    const sombra = new THREE.Mesh(geoSombra, matSombraBase.clone())
    sombra.rotation.x = -Math.PI / 2
    sombra.renderOrder = 1
    sombra.frustumCulled = false
    grupo.add(sombra)
    const c = {
      pivo, mesh, sombra, usada: true,
      chave: '~', virada: true, alvo: { x: 0, z: 0, ry: 0, y: 0 },
    }
    pool.push(c)
    return c
  }

  function devolverCarta(c) {
    c.usada = false
    c.pivo.visible = false
    c.sombra.visible = false
    c.chave = '~'
  }

  /**
   * Poe a carta num ponto do feltro e acerta a sombra de acordo.
   *
   * `rx` e a INCLINACAO: quanto a borda de tras da carta levanta, em radianos.
   * O sinal e negativo no pivo porque girar +X joga a normal pro +Z (o lado da
   * casa) e o que se quer e a face virada pro -Z, que e onde a lente esta.
   */
  function pousar(c, x, y, z, ry, rx) {
    const inc = rx || 0
    c.pivo.position.set(x, y, z)
    c.pivo.rotation.y = ry
    c.pivo.rotation.x = -inc
    // Altura pro desenho da sombra. Carta inclinada esta ALTA pelo proprio
    // levante da borda, e nao por estar voando: descontar isso e o que evita a
    // carta escorada nascer com a sombra enorme de carta em pleno arco.
    const alt = Math.max(0, y - Y_CARTA - Math.sin(inc) * CARTA_C * 0.5)
    // sombra: cresce e clareia com a altura. Ela tambem ESCORREGA um pouco em
    // +x e +z conforme a carta sobe, porque a luz do salao vem de cima e de
    // tras — sombra que so cresce no lugar le como halo, nao como sombra.
    const k = 1 + alt * 5.0
    // A carta de pe toca o feltro so pela borda da FRENTE, e a sombra tem que
    // sair dali: ancorada no centro ela ficaria metade pra tras da carta, e o
    // par lia como carta flutuando um palmo acima da mesa.
    const recuo = Math.sin(inc) * CARTA_C * 0.5
    c.sombra.position.set(x + alt * 0.10, Y_SOMBRA, z + alt * 0.16 - recuo)
    c.sombra.rotation.z = -ry
    c.sombra.scale.set(
      CARTA_L * 1.9 * k,
      CARTA_C * 1.55 * k * Math.max(0.34, Math.cos(inc)),
      1)
    c.sombra.material.opacity = 0.52 / (1 + alt * 6.5)
  }

  // --- filas de carta -------------------------------------------------------
  // fila = { cfg, itens:[carta], deslocX }
  const filas = new Map()
  function fila(id) {
    let f = filas.get(id)
    if (!f) {
      const cfg = L.filas[id] || { x: 0, z: 0, passo: 0.09, leque: 0 }
      f = { id, cfg, itens: [], deslocX: cfg.x }
      filas.set(id, f)
    }
    return f
  }

  /** Onde a i-esima carta de uma fila de n cartas pousa. O leque e CENTRADO:
   *  cada carta nova empurra as anteriores, como a mao de um dealer. */
  function lugarNaFila(f, i, n) {
    const cfg = f.cfg
    const meio = (n - 1) / 2
    // Quanto esta fila levanta a borda de tras AGORA. Depende de a fila estar
    // aberta (mostrando face) ou tapada, porque sao dois gestos diferentes:
    // carta na mesa virada pra baixo fica deitada, carta com face fica de pe.
    const inc = (f.aberta ? cfg.inclina : cfg.inclinaVerso) || 0
    // Levantar a carta em torno do CENTRO enfia a borda da frente no feltro.
    // Subir metade do comprimento vezes o seno devolve a borda pro tampo — sem
    // isto a carta de pe atravessa a mesa e some pela metade.
    const sobe = Math.sin(inc) * CARTA_C * 0.5
    // O passo e NEGATIVO em x porque a tela desta camera tem o +X a esquerda:
    // carta nova entra pela DIREITA da tela e cobre a anterior pela metade,
    // deixando o indice do canto da anterior sempre a vista.
    return {
      x: f.deslocX - (i - meio) * cfg.passo,
      z: cfg.z + Math.abs(i - meio) * 0.006,
      y: Y_CARTA + i * 0.0018 + CARTA_E / 2 + sobe,
      ry: (i - meio) * cfg.leque,
      rx: inc,
    }
  }

  /**
   * Acerta a fila inteira nos lugares que ela tem AGORA.
   *
   * `atrasar` existe pro par escorar depois de virar (ver cartas()). E por
   * causa dele que o ponto de partida `de` e lido no PRIMEIRO PASSO e nao aqui:
   * com atraso, a carta que interessa ainda esta no ar quando esta funcao roda,
   * e um `de` colhido agora faria ela voltar pro sapato antes de subir.
   */
  function reacomodar(f, dur, atrasar) {
    const n = f.itens.length
    for (let i = 0; i < n; i++) {
      const c = f.itens[i]
      const alvo = lugarNaFila(f, i, n)
      c.alvo = alvo
      if (c.voando && !atrasar) continue
      let de = null
      anima({
        atraso: atrasar || 0,
        dur: dur || 0.22,
        marca: 'acomoda',
        passo(k) {
          if (!de) {
            de = {
              x: c.pivo.position.x, y: c.pivo.position.y, z: c.pivo.position.z,
              ry: c.pivo.rotation.y, rx: -c.pivo.rotation.x,
            }
          }
          pousar(c,
            de.x + (alvo.x - de.x) * k,
            de.y + (alvo.y - de.y) * k,
            de.z + (alvo.z - de.z) * k,
            de.ry + (alvo.ry - de.ry) * k,
            de.rx + (alvo.rx - de.rx) * k)
        },
      })
    }
  }

  /**
   * A carta sai do sapato num arco, girando, com o verso pra cima.
   *
   * `deitada` = a carta vai VIRAR depois de pousar, entao ela chega DEITADA
   * mesmo que a fila seja escorada. Virar uma carta ja de pe faz ela rolar em
   * volta de um eixo inclinado e varrer a vizinha; deitada, o giro e o de
   * sempre e quem levanta o par e o reacomodar, depois, num gesto so.
   */
  function distribuir(c, alvo, atraso, aoPousar, deitada) {
    const incFim = deitada ? 0 : (alvo.rx || 0)
    const yFim = deitada ? alvo.y - Math.sin(alvo.rx || 0) * CARTA_C * 0.5 : alvo.y
    const s = L.sapato
    const de = { x: s.x, y: feltro + s.alt, z: s.z }
    c.voando = true
    c.pivo.visible = true
    c.sombra.visible = true
    c.mesh.rotation.z = Math.PI          // verso pra cima
    c.mesh.position.y = 0
    c.pivo.rotation.y = -0.9
    pousar(c, de.x, de.y, de.z, -0.9)
    const giroInicial = -0.9
    anima({
      atraso,
      dur: 0.40,
      marca: 'da',
      passo(k, cru) {
        const e = freia(cru)
        // arco: a altura e uma parabola, entao a carta sobe e desce em vez de
        // deslizar pelo feltro. 0.20 e o pico — carta rasante nao le como
        // "dada", parece empurrada.
        const alt = Math.sin(Math.PI * cru) * 0.20
        // A inclinacao entra so no FIM do voo (e^2): a carta viaja deitada, como
        // carta jogada de verdade, e so escora nos ultimos centimetros. Subir
        // ela junto com o arco faria a carta chegar de pe voando, que le como
        // carta em pe atravessando a mesa.
        pousar(c,
          de.x + (alvo.x - de.x) * e,
          de.y + (yFim - de.y) * e + alt,
          de.z + (alvo.z - de.z) * e,
          giroInicial + (alvo.ry - giroInicial) * e,
          incFim * e * e)
        void k
      },
      fim() {
        c.voando = false
        pousar(c, alvo.x, yFim, alvo.z, alvo.ry, incFim)
        som.carta(0, 1)
        if (aoPousar) aoPousar()
      },
    })
  }

  /**
   * O VIRAR. A carta rola pela borda longa (rotacao no Z local dela) e SOBE o
   * tanto que a borda desceria — sem essa compensacao ela atravessa o feltro
   * na metade do giro, que e o defeito classico de flip de carta.
   */
  function virarCarta(c, carta, atraso, aoFim) {
    const de = c.mesh.rotation.z
    const para = 0
    c.virada = false
    anima({
      atraso,
      dur: 0.30,
      marca: 'vira',
      passo(k) {
        const a = de + (para - de) * k
        c.mesh.rotation.z = a
        c.mesh.position.y = Math.abs(Math.sin(a)) * (CARTA_L / 2 + 0.006)
        // troca a face no meio do giro, quando a carta esta de perfil: virar a
        // face antes disso mostra a carta antes de o jogador "poder" ver.
        if (k >= 0.5 && !c._trocou) { c._trocou = true; baralho.definirFace(c.mesh, carta) }
      },
      fim() {
        c._trocou = false
        c.mesh.rotation.z = 0
        c.mesh.position.y = 0
        baralho.definirFace(c.mesh, carta)
        som.virar(0)
        if (aoFim) aoFim()
      },
    })
  }

  // --- brilho do feltro (NAO e luz) ----------------------------------------
  const matBrilho = new THREE.MeshBasicMaterial({
    map: texBrilho(), color: 0xffd98a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const brilho = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matBrilho)
  brilho.rotation.x = -Math.PI / 2
  brilho.position.set(L.brilho.x, Y_CHAO - 0.001, L.brilho.z)
  brilho.scale.set(L.brilho.r * 2.4, L.brilho.r * 2.4, 1)
  brilho.renderOrder = 2
  brilho.visible = false
  brilho.frustumCulled = false
  grupo.add(brilho)

  // --- destaque da mao da vez ----------------------------------------------
  const matAnel = new THREE.MeshBasicMaterial({
    color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false,
  })
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.335, 40), matAnel)
  anel.rotation.x = -Math.PI / 2
  anel.position.set(0, Y_CHAO, 0)
  anel.renderOrder = 2
  anel.visible = false
  anel.frustumCulled = false
  grupo.add(anel)

  // --- tremor (a camera le isto; a mesa nao mexe na camera) ----------------
  let tremor = 0
  let tempo = 0

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  /** Um enquadramento do layout, em coordenadas de MUNDO. */
  function quadro(nome) {
    const q = L.quadros[nome] || L.quadros.jogo
    return {
      pos: grupo.localToWorld(new THREE.Vector3(q.pos[0], q.pos[1], q.pos[2])),
      alvo: grupo.localToWorld(new THREE.Vector3(q.alvo[0], q.alvo[1], q.alvo[2])),
      fov: q.fov,
    }
  }

  /**
   * O CORACAO: sincroniza uma fila com a lista de cartas pedida.
   *
   * defs = [{ carta:{r,n}|null, verso:bool }]. O diff e o mesmo da versao em
   * DOM: prefixo igual fica parado, verso que ganhou face VIRA no lugar, o
   * resto entra voando do sapato. Qualquer desencontro fora disso (split, mao
   * nova) manda tudo pro descarte e reparte — e raro, e a repartida geral ate
   * ajuda o jogador a entender que a mesa mudou.
   */
  function cartas(id, defs, opts) {
    const f = fila(id)
    const lista = Array.isArray(defs) ? defs : []
    const o = opts || {}
    if (Number.isFinite(o.x)) f.deslocX = o.x
    else f.deslocX = f.cfg.x

    // A FILA ESTA ABERTA quando TODA carta dela tem face. E ela quem decide se
    // a fila fica deitada ou escorada (ver 'inclina' em lugarNaFila), e tem que
    // ser decidido ANTES do diff: tanto o alvo de quem entra voando quanto o
    // reacomodar do fim leem isto. Exigir TODAS e de proposito — uma mao com
    // uma carta tapada ainda e uma mao tapada, e levantar so a que ja virou
    // daria um degrau no meio do par.
    f.aberta = lista.length > 0 && lista.every((d) => d && !d.verso && d.carta && d.carta.r)

    let i = 0
    while (i < lista.length && i < f.itens.length && f.itens[i].chave === chaveDef(lista[i])) i++

    // viradas: mesma posicao, era verso e agora tem face
    let atraso = Number.isFinite(o.atraso) ? o.atraso : 0
    let virou = false
    let deitou = false          // entrou alguma carta que ainda tem que virar?
    while (i < lista.length && i < f.itens.length &&
           f.itens[i].chave === '##' && chaveDef(lista[i]) !== '##') {
      const c = f.itens[i]
      c.chave = chaveDef(lista[i])
      virarCarta(c, lista[i].carta, atraso, i === lista.length - 1 ? o.aoRevelar : null)
      atraso += 0.16
      virou = true
      i++
    }

    // sobrou carta velha que nao casa: refaz a fila inteira
    if (i < f.itens.length) {
      const velhas = f.itens.splice(0)
      varrerCartas(velhas, 0)
      i = 0
      atraso = Math.max(atraso, 0.18)
    }

    for (; i < lista.length; i++) {
      const c = pegarCarta()
      if (!c) break
      c.chave = chaveDef(lista[i])
      c.virada = true
      c._trocou = false
      baralho.definirFace(c.mesh, null)
      f.itens.push(c)
      const idx = f.itens.length - 1
      const alvo = lugarNaFila(f, idx, Math.max(lista.length, f.itens.length))
      const def = lista[i]
      const ultima = i === lista.length - 1
      const vaiVirar = !(def.verso || !def.carta || !def.carta.r)
      if (vaiVirar) deitou = true
      distribuir(c, alvo, atraso, () => {
        if (!vaiVirar) {
          if (ultima && o.aoPousar) o.aoPousar()
          return
        }
        c.virada = false
        // 0.09 s entre pousar e virar: e a pausa que faz a carta "chegar" antes
        // de mostrar o que e. Sem ela as duas coisas viram um evento so.
        virarCarta(c, def.carta, 0.09, ultima ? (o.aoRevelar || o.aoPousar) : null)
      }, vaiVirar)
      atraso += 0.24
    }

    // QUEM LEVANTA O PAR E ESTE reacomodar, e o atraso dele e o gesto inteiro.
    // Tanto no showdown (carta que vira no lugar) quanto na repartida (carta que
    // chega deitada e vira depois de pousar), a ordem tem que ser: mostra a
    // face, DEPOIS escora. Invertido — levantar a carta ainda tapada e so entao
    // virar — le como a mesa se arrumando sozinha antes de alguem decidir
    // mostrar. Quando nada virou, nao ha o que esperar e o acerto e imediato.
    // 0.60 pra carta que ainda vai voar (0.40 de voo + 0.09 de pausa + 0.30 de
    // giro, contados a partir do atraso da ULTIMA, que e `atraso - 0.24`), e
    // 0.30 pra quem so vira no lugar.
    const espera = deitou ? atraso + 0.60 : (virou ? atraso + 0.30 : 0)
    reacomodar(f, 0.26, espera)
    return atraso
  }

  function varrerCartas(itens, atraso) {
    const d = L.descarte
    for (let k = 0; k < itens.length; k++) {
      const c = itens[k]
      const de = {
        x: c.pivo.position.x, y: c.pivo.position.y, z: c.pivo.position.z,
        ry: c.pivo.rotation.y, rx: -c.pivo.rotation.x,
      }
      anima({
        atraso: (atraso || 0) + k * 0.035,
        dur: 0.30,
        marca: 'varre',
        passo(t) {
          pousar(c,
            de.x + (d.x - de.x) * t,
            de.y + (feltro + d.alt - de.y) * t + Math.sin(Math.PI * t) * 0.06,
            de.z + (d.z - de.z) * t,
            // O giro do descarte parte do ry GUARDADO, nao do ry atual: lendo a
            // rotacao viva a cada passo o incremento se somava a si mesmo e a
            // carta saia rodopiando meia dezena de voltas.
            de.ry + t * 1.2,
            // Carta escorada DEITA ao ser varrida — ela e recolhida, nao
            // continua de pe atravessando o feltro ate o descarte.
            de.rx * (1 - t))
        },
        fim() { devolverCarta(c) },
        cancelar() { devolverCarta(c) },
      })
    }
    if (itens.length) som.deslizar(atraso || 0, 0.30)
  }

  /** Varre TUDO pro descarte: fim de mao, saida da mesa. */
  function limparCartas(atraso) {
    for (const f of filas.values()) {
      const itens = f.itens.splice(0)
      varrerCartas(itens, atraso || 0)
    }
  }

  /**
   * UMA ficha caindo no nivel `i` da pilha `p`. Saiu de dentro de fichas() pra
   * o CAIXOTE poder reusar o mesmo gesto: la a pilha nao vem de decompor um
   * valor, vem de uma denominacao so, e duplicar 40 linhas de queda seria ter
   * duas fisicas diferentes na mesma mesa.
   *
   * `de` diz de onde ela vem: 'casa' (a atendente pagando, do outro lado),
   * 'caixote' (a minha mao empurrando do meu lado) ou 'jogador' (o padrao).
   */
  function cairNaPilha(p, d, i, atraso, de) {
    const lugar = posicaoNaPilha(i)
    const pouso = {
      x: p.base.x + lugar.dx, y: Y_CHAO + lugar.dy, z: p.base.z + lugar.dz,
    }
    const f = novaFicha(pouso.x, pouso.y, pouso.z, lugar.ry, d.cor, d.bri)
    fichasVivas.push(f)
    p.itens.push(f)
    // De onde a ficha cai. Muda so o ponto de partida, e e o que faz "apostei",
    // "recebi" e "tirei do caixote" parecerem tres coisas diferentes: a da casa
    // vem de la de cima do outro lado do pano, a minha vem de baixo, e a do
    // caixote vem RASANTE, do lado, porque e ficha empurrada e nao jogada.
    const origem = de === 'casa'
      ? { x: p.base.x - 0.25, y: Y_CHAO + 0.34, z: p.base.z + 0.55 }
      : de === 'caixote'
        ? { x: p.base.x + 0.10, y: Y_CHAO + 0.10, z: p.base.z - 0.30 }
        : { x: p.base.x + 0.16, y: Y_CHAO + 0.30, z: p.base.z - 0.34 }
    const nivel = i
    // GIRO NO AR. Meia volta e o teto do que da pra ler nos 0,19 s de voo —
    // uma volta inteira, com 8 insercoes simetricas no aro, vira serrilhado
    // (o olho ve a mancha piscar 8 vezes e nao entende que girou).
    const ry0 = lugar.ry - (1.9 + hash01(i * 7 + 3) * 1.8)
    // TOMBO: a ficha nao cai deitada, cai de canto e assenta. O eixo do
    // tombo e sorteado, senao todas as fichas caem do mesmo lado e a pilha
    // inteira pisca junto.
    const tombo = 0.28 + hash01(i * 13 + 5) * 0.34
    const eixo = hash01(i * 17 + 11) * Math.PI * 2
    f.x = origem.x; f.y = origem.y; f.z = origem.z; f.ry = ry0
    let tocou = false
    anima({
      atraso,
      dur: DUR_QUEDA,
      marca: 'ficha',
      passo(k2, cru) {
        const q = Math.min(1, cru / TOQUE)
        const e = freia(q)
        f.x = origem.x + (pouso.x - origem.x) * e
        f.z = origem.z + (pouso.z - origem.z) * e
        f.ry = ry0 + (lugar.ry - ry0) * e
        if (cru < TOQUE) {
          // A DESCIDA E q*q (gravidade) e nao o mesmo 'freia' do horizontal.
          // Com um ease so nos tres eixos a ficha chega devagar no fim e
          // parece descer de paraquedas; com q*q ela chega ACELERANDO, e e
          // isso que faz o toque no feltro ter peso. O seno por cima e o
          // arco: ela sobe um dedo antes de cair, como quem joga a ficha.
          f.y = origem.y + (pouso.y - origem.y) * (q * q) + Math.sin(Math.PI * q) * 0.030
          f.rx = Math.cos(eixo) * tombo * (1 - e)
          f.rz = Math.sin(eixo) * tombo * (1 - e)
        } else {
          if (!tocou) { tocou = true; impacto(p, f, i, nivel) }
          // QUIQUE: um pulo e meio morrendo em (1-b)^2. Sem ele o pouso e
          // reto e a ficha parece imantada no feltro.
          const b = (cru - TOQUE) / (1 - TOQUE)
          f.y = pouso.y + Math.abs(Math.sin(Math.PI * b * 1.6)) * QUIQUE * (1 - b) * (1 - b)
          f.rx = 0; f.rz = 0
        }
        void k2
      },
      fim() {
        if (!tocou) impacto(p, f, i, nivel)
        f.x = pouso.x; f.y = pouso.y; f.z = pouso.z
        f.rx = 0; f.rz = 0; f.ry = lugar.ry
      },
      cancelar() {
        f.x = pouso.x; f.y = pouso.y; f.z = pouso.z
        f.rx = 0; f.rz = 0; f.ry = lugar.ry; f.sq = 0
      },
    })
    return f
  }

  /**
   * Sincroniza uma pilha de fichas com um valor.
   *
   * Crescer EMPILHA ficha por ficha, com estalo por ficha e um atraso entre
   * elas — e o gesto de apostar, e ele nao pode acontecer num quadro so.
   * Encolher e instantaneo de proposito: quem tira ficha da mesa e a casa
   * varrendo (varrer()), e essa animacao e outra.
   */
  function fichas(id, valor, opts) {
    const p = pilha(id)
    const o = opts || {}
    const alvo = Math.max(0, Math.floor(valor) || 0)
    // Mudar a base de uma pilha ARRASTA junto o que ja esta nela. O caso que
    // existe e o split: a aposta da primeira mao sai do meio pra abrir espaco
    // pra segunda, e nesse instante ela JA TEM ficha em cima. Sem arrastar, as
    // cartas iam pro lado e o dinheiro ficava pra tras.
    if (Number.isFinite(o.x) && Math.abs(o.x - p.base.x) > 1e-4) {
      const dx = o.x - p.base.x
      p.base.x = o.x
      for (let k = 0; k < p.itens.length; k++) p.itens[k].x += dx
    }
    if (Number.isFinite(o.z) && Math.abs(o.z - p.base.z) > 1e-4) {
      const dz = o.z - p.base.z
      p.base.z = o.z
      for (let k = 0; k < p.itens.length; k++) p.itens[k].z += dz
    }
    if (alvo === p.valor) return 0

    // Encolheu (mao nova, aposta limpa): desmancha e refaz. E raro, e a
    // alternativa — tirar ficha do meio da pilha — nao existe em mesa nenhuma.
    if (alvo < p.valor) {
      for (let k = 0; k < p.itens.length; k++) soltarFicha(p.itens[k])
      p.itens.length = 0
      p.valor = 0
      if (alvo === 0) return 0
    }

    const lista = decompor(alvo - p.valor)
    p.valor = alvo

    let atraso = Number.isFinite(o.atraso) ? o.atraso : 0
    for (let c = 0; c < lista.length; c++) {
      if (fichasVivas.length >= POOL_FICHAS || p.itens.length >= FICHA_MAX * 2) break
      cairNaPilha(p, lista[c], p.itens.length, atraso, o.de)
      atraso += 0.075
    }
    return atraso
  }

  /**
   * O INSTANTE EM QUE A FICHA ENCOSTA. Tres coisas ao mesmo tempo, e e a
   * simultaneidade que vende o peso: a ficha esmaga, ela pisca (o flash que
   * passa do threshold do bloom por 0,15 s) e a COLUNA INTEIRA embaixo dela
   * treme. O tremor cai com a distancia — a ficha logo abaixo sacode quase
   * tudo, a do fundo quase nada — porque e assim que impacto viaja por uma
   * pilha, e sem essa queda a pilha vira gelatina.
   */
  function impacto(p, f, i, nivel) {
    f.sq = 1
    f.flash = FLASH_POUSO
    som.ficha(0, nivel)
    // Pilha alta ganha um SEGUNDO estalo mais grave logo depois: e a coluna
    // assentando. So a partir de 6 fichas, senao vira matraca.
    if (nivel >= 6) som.ficha(0.055, nivel - 5)
    // fase comum: a coluna toda comeca o seno em zero, no quadro do impacto
    const fase = -tempo * 46
    const colF = Math.floor(i / FICHA_COLUNA)
    for (let k = 0; k < p.itens.length; k++) {
      const g = p.itens[k]
      if (g === f) continue
      // coluna ao lado e outra pilha fisica: nao treme junto
      if (Math.floor(k / FICHA_COLUNA) !== colF) continue
      g.tr = Math.min(0.9, g.tr + 0.55 / (1 + (i - k) * 0.85))
      g.fase = fase
    }
  }

  /**
   * A pilha DESLIZA pro lado de quem levou. Nao some: o dinheiro vai pra algum
   * lugar, e ver pra onde ele foi e metade da dor (ou da alegria) da mao.
   *
   * O QUE MUDOU. Antes era uma reta com um seno por cima e um `f.ry += 0.06`
   * por QUADRO — o giro dependia do framerate, entao a mesma varrida girava o
   * dobro num monitor de 120 Hz. Agora a ficha: pisca (flash de saida), quica
   * DUAS vezes no feltro, tomba de lado enquanto roda, sai da linha reta um
   * pouco pra cada lado (ficha varrida por uma pa se espalha, nao vira trem)
   * e some ENCOLHENDO no ultimo quarto em vez de piscar pra fora existencia.
   */
  function varrer(id, destino, atraso, aoFim) {
    const p = pilhas.get(id)
    if (!p || !p.itens.length) { if (aoFim) aoFim(); return 0 }
    const alvo = destino === 'jogador' ? L.eu : L.casa
    const itens = p.itens.splice(0)
    p.valor = 0
    const dur = 0.46
    som.deslizar(atraso || 0, dur)
    // Quatro estalos no comeco, do agudo pro grave: e a pa batendo na pilha
    // antes de arrastar. Mais que quatro vira chocalho.
    for (let k = 0; k < Math.min(4, itens.length); k++) som.ficha((atraso || 0) + k * 0.035, 7 - k * 2)
    for (let k = 0; k < itens.length; k++) {
      const f = itens[k]
      const de = { x: f.x, y: f.y, z: f.z }
      const ry0 = f.ry
      const giro = 2.4 + hash01(k * 5 + 1) * 3.4
      const desvio = (hash01(k * 3 + 7) - 0.5) * 0.09
      f.tr = 0
      f.flash = FLASH_VARRE
      anima({
        atraso: (atraso || 0) + k * 0.018,
        dur,
        marca: 'varre',
        passo(t, cru) {
          f.x = de.x + (alvo.x - de.x) * t + Math.sin(Math.PI * cru) * desvio
          f.z = de.z + (alvo.z - de.z) * t
          f.y = de.y + (Y_CHAO + FICHA_H * 0.5 - de.y) * t
            + Math.abs(Math.sin(Math.PI * cru * 2)) * 0.030 * (1 - cru)
          f.ry = ry0 + giro * t
          f.rz = Math.sin(cru * 11) * 0.20 * (1 - cru)
          // O ultimo quarto e a saida: encolhe e da um ultimo brilho. Ficha
          // que some de escala parece guardada; ficha que some de uma vez
          // parece bug de pool.
          if (cru > 0.74) {
            const s = 1 - (cru - 0.74) / 0.26
            f.sc = Math.max(0, s)
            f.flash = Math.max(f.flash, s * 0.85)
          }
        },
        fim() {
          soltarFicha(f)
          if (k === itens.length - 1 && aoFim) aoFim()
        },
        cancelar() { soltarFicha(f) },
      })
    }
    return dur + itens.length * 0.018
  }

  function limparFichas() {
    for (const p of pilhas.values()) {
      if (p.caixote) continue
      for (const f of p.itens) soltarFicha(f)
      p.itens.length = 0
      p.valor = 0
    }
  }

  // -------------------------------------------------------------------------
  // O CAIXOTE: as MINHAS fichas em cima do pano
  //
  // O pedido do dono foi literal: "quero que fique em cima da mesa as fichas
  // que eu tenho, e quando eu quiser apostar quero as fichas cada monte delas
  // separadinho por valor". Entao a fileira de botoes redondos do rodape
  // acabou: o dinheiro do jogador virou objeto do mundo, uma pilha por
  // denominacao, na beirada do pano do lado dele.
  //
  // O QUE A ALTURA DA PILHA SIGNIFICA, porque isso e decisao de desenho e nao
  // detalhe: cada pilha mostra QUANTAS FICHAS DAQUELE VALOR o saldo compra,
  // ate o teto de `L.caixote.altura`. Um saldo de 300 vira dez de 25, seis de
  // 50, tres de 100, uma de 250 e nenhuma de 500 — e a pilha vazia e o proprio
  // "voce nao tem como apostar 500", sem botao apagado nenhum. A alternativa
  // (decompor o saldo de verdade, gulosamente) daria uma pilha de 500 gorda e
  // UMA ficha de 25 solta, e ai apostar 25 duas vezes seria impossivel numa
  // mesa onde o jogador tem 20 mil.
  //
  // As pilhas do caixote vivem no MESMO mapa das outras (id 'cx:500'), e a
  // unica diferenca e a marca `caixote`: ela e o que faz limparFichas() nao
  // levar o dinheiro do jogador junto com o pote no fim da mao.
  // -------------------------------------------------------------------------

  /**
   * x da casa `i` de `n`, centrada em zero.
   *
   * O SINAL E NEGATIVO porque a lente destas mesas olha pro +Z: o +X do espaco
   * da mesa cai na ESQUERDA da tela (a mesma inversao que lugarNaFila ja
   * documenta). Sem ele o caixote aparecia com o 500 a esquerda e o 25 a
   * direita, ou seja, de tras pra frente pra quem le da esquerda pra direita.
   */
  function casaCaixote(i, n) {
    const cx = L.caixote || { z: -1.0, passo: 0.16, altura: 10 }
    return -cx.passo * (i - (n - 1) / 2)
  }

  /**
   * Sincroniza o caixote com o saldo. `valores` e a lista de denominacoes da
   * mesa, da menor pra maior; `saldo` e quanto o jogador tem em ficha.
   *
   * Crescer cai ficha por ficha (o gesto de a casa pagar); encolher e seco,
   * porque quem tira ficha do caixote e o proprio jogador empurrando pra
   * aposta — a animacao daquele movimento e a pilha da aposta subindo.
   */
  function caixote(lista) {
    const cx = L.caixote
    if (!cx || !Array.isArray(lista)) return
    const teto = Math.max(1, Math.floor(cx.altura) || 10)
    const n = lista.length
    let atraso = 0
    for (let i = 0; i < n; i++) {
      const v = Math.max(1, Math.floor(lista[i].v) || 1)
      const p = pilha('cx:' + v)
      p.caixote = true
      p.valorFicha = v
      p.base.x = casaCaixote(i, n)
      p.base.z = cx.z
      const d = DENOM.find((k) => k.v === v) || { v, cor: 0xe8e2d2 }
      // Quem conta e quem chama: a UI sabe quantas fichas ja sairam pro pano e
      // precisa dessa conta pro caixote ENCOLHER na hora do clique ("quando eu
      // apostar minhas fichas diminuam pq estao indo pra mesa"). Aqui so se
      // apara pelo teto de altura da pilha.
      const quer = Math.max(0, Math.min(teto, Math.floor(lista[i].n) || 0))
      const tem = p.itens.length
      if (quer === tem) continue
      if (quer < tem) {
        for (let k = quer; k < tem; k++) soltarFicha(p.itens[k])
        p.itens.length = quer
        continue
      }
      for (let k = tem; k < quer; k++) {
        if (fichasVivas.length >= POOL_FICHAS) break
        // 'caixote' e nao 'casa': a ficha do meu proprio dinheiro entra RASANTE,
        // do meu lado, deslizando pro lugar. Vindo do alto do outro lado do
        // pano ela lia como a casa me pagando toda vez que o saldo mudava.
        cairNaPilha(p, d, k, atraso, 'caixote')
        atraso += 0.045
      }
    }
  }

  /** Todas as pilhas do caixote somem (saida da mesa). */
  /** Quantas fichas cabem numa pilha do caixote. A UI precisa dela pra aparar
   *  a contagem ANTES de descontar o que ja foi empurrado — aparar depois faria
   *  um saldo de 20 mil nunca mudar de altura. */
  function alturaCaixote() {
    const cx = L.caixote
    return Math.max(1, Math.floor(cx && cx.altura) || 10)
  }

  function limparCaixote() {
    for (const p of pilhas.values()) {
      if (!p.caixote) continue
      for (const f of p.itens) soltarFicha(f)
      p.itens.length = 0
    }
  }

  // --- mira: qual pilha esta debaixo do ponteiro ---------------------------
  //
  // ALVOS INVISIVEIS, e nao raycast no InstancedMesh das fichas. Sao duas
  // razoes: a pilha de uma ficha so tem 7 mm de altura e vira um alvo de tres
  // pixels na tela, e a pilha VAZIA (o valor que o jogador nao pode pagar) nao
  // tem instancia nenhuma pra acertar — mas continua precisando responder ao
  // clique com "voce nao tem 500". Um cilindro generoso por casa resolve os
  // dois. `material.visible = false` NAO tira o objeto do raycast, so do
  // desenho: custo zero de draw call.
  const alvos = []
  const _raio = new THREE.Raycaster()
  const _pt = new THREE.Vector2()
  const matAlvo = new THREE.MeshBasicMaterial({ visible: false })
  const geoAlvo = new THREE.CylinderGeometry(0.051, 0.051, 0.16, 8)

  function montarAlvos(valores) {
    const cx = L.caixote
    if (!cx) return
    for (const a of alvos) grupo.remove(a)
    alvos.length = 0
    const n = valores.length
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geoAlvo, matAlvo)
      m.position.set(casaCaixote(i, n), Y_CHAO + 0.06, cx.z)
      m.userData.alvo = { tipo: 'caixote', v: valores[i], pilha: 'cx:' + valores[i] }
      grupo.add(m)
      alvos.push(m)
    }
    // a pilha da aposta tambem e clicavel: e por ela que se DESFAZ uma ficha
    const ap = L.pilhas.aposta || L.pilhas.minha
    if (ap) {
      const m = new THREE.Mesh(geoAlvo, matAlvo)
      m.scale.set(1.7, 1.4, 1.7)
      m.position.set(ap.x, Y_CHAO + 0.09, ap.z)
      m.userData.alvo = { tipo: 'aposta', pilha: L.pilhas.aposta ? 'aposta' : 'minha' }
      grupo.add(m)
      alvos.push(m)
    }
  }

  /**
   * ONDE PENDURAR OS NUMEROS, em coordenadas de MUNDO.
   *
   * Devolve um ponto por pilha clicavel, no TOPO dela: a pilha cresce e o
   * numero sobe junto. Quem projeta pra tela e desenha e ui/cassino-ui.js — uma
   * etiqueta em DOM le melhor que texto em 3D nesse tamanho (a ficha tem 8 a 14
   * px de altura na tela) e nao custa draw call nenhum.
   *
   * Escreve num array reaproveitado porque isto roda TODO QUADRO: alocar seis
   * objetos por quadro so pra descartar seria lixo de graca.
   */
  const _mv = new THREE.Vector3()
  function marcadores(saida, cam) {
    const lista = saida || []
    lista.length = 0
    if (!grupo.visible || !cam) return lista
    // A camera acabou de ser reposicionada neste quadro e o three so recalcula
    // matrixWorld/matrixWorldInverse no render — que ainda nao aconteceu.
    // Projetar sem isto usa a matriz do quadro ANTERIOR, e com lente em viagem
    // (a entrada na mesa) a etiqueta anda um quadro atras da propria pilha.
    cam.updateMatrixWorld()
    for (let i = 0; i < alvos.length; i++) {
      const d = alvos[i].userData && alvos[i].userData.alvo
      if (!d) continue
      const p = pilhas.get(d.pilha)
      const n = p ? p.itens.length : 0
      const base = p ? p.base : alvos[i].position
      _mv.set(base.x, Y_CHAO + FICHA_H * n + 0.022, base.z)
      grupo.localToWorld(_mv)
      // A PROJECAO ACONTECE AQUI, e nao em quem chama, porque ui/cassino-ui.js
      // e o unico arquivo do cassino que NAO importa three (esta escrito no
      // cabecalho dele) e nao vale quebrar isso por uma multiplicacao de
      // matriz. Ele recebe -1..1 e so converte pra pixel.
      _mv.project(cam)
      lista.push({
        tipo: d.tipo,
        v: d.v || 0,
        fichas: n,
        valor: p ? p.valor : 0,
        nx: _mv.x, ny: _mv.y,
        atras: _mv.z > 1,
      })
    }
    return lista
  }

  /**
   * O que esta debaixo do ponteiro. `nx`/`ny` em -1..1 (coordenada de tela do
   * three), `cam` a camera do quadro. Devolve { tipo:'caixote', v } ou
   * { tipo:'aposta' }, ou null.
   */
  function apontar(nx, ny, cam) {
    if (!cam || !alvos.length || !grupo.visible) return null
    _pt.set(nx, ny)
    _raio.setFromCamera(_pt, cam)
    const hits = _raio.intersectObjects(alvos, false)
    return hits.length ? hits[0].object.userData.alvo : null
  }

  // --- efeitos --------------------------------------------------------------

  /** Acende o feltro. `cor` em 0xrrggbb, `forca` 0..1, `dur` em segundos. */
  function acender(cor, forca, dur) {
    matBrilho.color.setHex(cor === undefined ? 0xffd98a : cor)
    brilho.visible = true
    const pico = Math.max(0.05, Math.min(1.2, forca === undefined ? 0.7 : forca))
    const d = Math.max(0.2, dur || 0.9)
    anima({
      dur: d,
      marca: 'brilho',
      passo(k, cru) {
        // sobe rapido, cai devagar: e assim que uma luz de mesa se comporta
        matBrilho.opacity = cru < 0.18
          ? pico * (cru / 0.18)
          : pico * (1 - (cru - 0.18) / 0.82)
        void k
      },
      fim() { matBrilho.opacity = 0; brilho.visible = false },
      cancelar() { matBrilho.opacity = 0; brilho.visible = false },
    })
  }

  /** Sacode a lente. Quem APLICA e quem manda na camera; aqui so mede. */
  function tremer(forca) {
    tremor = Math.max(tremor, Math.max(0, Math.min(1, forca === undefined ? 0.5 : forca)))
  }

  /** Anel pulsante em volta de uma fila (a mao da vez, no split). */
  function destacar(id, ligado) {
    if (!ligado) { anel.visible = false; matAnel.opacity = 0; return }
    const f = filas.get(id) || fila(id)
    anel.position.set(f.deslocX, Y_CHAO, f.cfg.z)
    anel.visible = true
  }

  function atualizar(dt) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1)
    tempo += d

    // Os tres estados que MORREM SOZINHOS numa ficha. Ficam aqui, e nao dentro
    // das tarefas, porque nao pertencem a nenhuma animacao: o flash de um
    // pouso tem que continuar apagando mesmo que a tarefa que o acendeu ja
    // tenha acabado, e o tremor de uma pilha atravessa varias quedas. Roda
    // ANTES das tarefas pra que um valor aceso neste quadro chegue inteiro na
    // tela.
    for (let i = 0; i < fichasVivas.length; i++) {
      const f = fichasVivas[i]
      if (f.flash > 0) f.flash = Math.max(0, f.flash - d / FLASH_DUR)
      if (f.sq > 0) f.sq = Math.max(0, f.sq - d * 5.6)
      if (f.tr > 0) f.tr = Math.max(0, f.tr - d * 4.4)
    }

    for (let i = tarefas.length - 1; i >= 0; i--) {
      const t = tarefas[i]
      t.t += d
      if (t.t < t.atraso) continue
      const cru = Math.min(1, (t.t - t.atraso) / t.dur)
      if (t.passo) t.passo(suave(cru), cru)
      if (cru >= 1) {
        tarefas.splice(i, 1)
        if (t.fim) t.fim()
      }
    }

    if (anel.visible) matAnel.opacity = 0.28 + Math.sin(tempo * 4.2) * 0.16
    if (tremor > 0) tremor = Math.max(0, tremor - d * 2.6)
    repintarFichas()
  }

  function entrar() {
    grupo.visible = true
    // O feltro tem um par de cartas DESENHADO em cada lugar (world/casino.js:
    // 'mesa em jogo, nao mesa de loja'). Ele existe pra quem passa andando, e
    // atrapalha quem senta: as cartas vivas nao ficam mais deitadas em cima
    // dele, e dois pares no mesmo lugar leem como defeito. Some enquanto a mao
    // acontece e volta em sair() — a mesa vazia continua parecendo mesa em jogo.
    if (ancora && ancora.enfeite) ancora.enfeite.visible = false
  }

  /** Sai da mesa AGORA, sem cerimonia: cancela tudo e apaga o grupo. Quem quer
   *  a mesa sendo varrida com estilo chama limparCartas() ANTES. */
  function sair() {
    pararTarefas()
    for (const c of pool) devolverCarta(c)
    for (const f of filas.values()) f.itens.length = 0
    limparFichas()
    repintarFichas()
    matBrilho.opacity = 0
    brilho.visible = false
    anel.visible = false
    matAnel.opacity = 0
    limparCaixote()
    tremor = 0
    grupo.visible = false
    if (ancora && ancora.enfeite) ancora.enfeite.visible = true
  }

  function dispose() {
    sair()
    if (grupo.parent) grupo.parent.remove(grupo)
    // A GEOMETRIA DA CARTA NAO E DESCARTADA AQUI, de proposito: os buffers de
    // posicao, normal e indice sao os MESMOS objetos em toda carta do jogo (ver
    // cartas-3d.js), e a outra mesa continua usando eles. dispose() numa dessas
    // geometrias apagaria da placa de video o baralho da mesa do lado.
    for (const c of pool) {
      if (c.sombra.material) c.sombra.material.dispose()
    }
    pool.length = 0
    fichasMesh.dispose()
    // A da FICHA, ao contrario da carta, e SO desta mesa (ver geoFicha: o
    // atributo aFlash e por instancia e nao pode ser dividido com a outra
    // mesa), entao aqui ela pode e deve ir embora.
    geoFichas.dispose()
    matFicha.dispose()
    matBrilho.dispose()
    matAnel.dispose()
    matSombraBase.dispose()
    geoSombra.dispose()
    anel.geometry.dispose()
    brilho.geometry.dispose()
    for (const a of alvos) grupo.remove(a)
    alvos.length = 0
    geoAlvo.dispose()
    matAlvo.dispose()
  }

  return {
    grupo,
    tipo,
    feltro,
    quadro,
    cartas,
    limparCartas,
    fichas,
    varrer,
    limparFichas,
    caixote,
    limparCaixote,
    alturaCaixote,
    montarAlvos,
    apontar,
    marcadores,
    acender,
    tremer,
    destacar,
    atualizar,
    entrar,
    sair,
    dispose,
    /** Amplitude do tremor pedido, 0..1. Quem manda na camera aplica. */
    get tremorAtual() { return tremor },
    /** Ha alguma animacao correndo? A UI usa pra nao pisar no proprio efeito. */
    get ocupada() { return tarefas.length > 0 },
    /** Ponto do mundo pra onde o jogador esta olhando nesta mesa. */
    paraMundo(x, y, z) { return grupo.localToWorld(new THREE.Vector3(x, y, z)) },
  }
}

export default criarMesa3D
