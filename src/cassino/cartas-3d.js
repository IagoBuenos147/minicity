import * as THREE from 'three'

// ---------------------------------------------------------------------------
// src/cassino/cartas-3d.js — A CARTA DE VERDADE, EM TRES DIMENSOES.
//
// O pedido que criou este arquivo: "aproxima a tela na mesa e ve as cartas bem
// nitidas". Uma carta desenhada em DOM nunca ia dar isso — ela vive num plano
// colado na tela, nao no feltro, e a camera nao pode chegar perto de uma div.
// Aqui a carta e um SOLIDO: tem espessura, tem canto arredondado, tem verso
// proprio e recebe a luz do salao como qualquer outra peca do mundo.
//
// TRES DECISOES MANDAM NESTE ARQUIVO, e as tres sao sobre ORCAMENTO.
//
// 1) UM ATLAS, NAO 52 TEXTURAS. As 52 faces (mais os dois versos e um retalho
//    de marfim liso pra borda) sao desenhadas numa unica textura de 8 x 7
//    celulas. Uma textura e um MATERIAL SO pro baralho inteiro: sem isso, cada
//    carta na mesa seria um material diferente e o forno de nada adiantaria. O
//    preco do atlas e memoria de video (2048 x 2506 x RGBA = 20,5 MB, ~27 MB
//    com mipmap), paga UMA vez e so quando alguem senta numa mesa —
//    'criarBaralho3D' e chamado no comeco da viagem da camera, que dura 0,9 s e
//    esconde o custo do desenho.
//
// 2) A GEOMETRIA E COMPARTILHADA, SO O 'uv' E PROPRIO. Todas as cartas usam os
//    MESMOS BufferAttribute de posicao, normal e indice — um buffer so na
//    placa de video. O que cada carta tem de seu e o array de uv, que aponta a
//    face pra celula certa do atlas. Trocar a carta e reescrever 2 floats por
//    vertice da tampa, nao construir geometria nova. (Clonar a geometria
//    inteira por carta funcionaria e seria mais simples de ler, mas sao ~100
//    triangulos x 3 buffers por carta, subidos pra GPU de novo a cada mao.)
//
// 3) O EIXO DA CARTA. Ela nasce DEITADA: X = largura, Z = comprimento, Y = a
//    espessura, e a FACE olha pra +Y. Nao e capricho de eixo — a mesa e uma
//    superficie horizontal, e uma carta que nasce em pe obrigaria toda posicao,
//    toda animacao e todo calculo de sombra deste projeto a carregar um
//    rotation.x = -PI/2 pendurado. Deitada, 'position' e a posicao no feltro e
//    'rotation.y' e o giro dela na mesa, que e como um humano descreveria.
//
// A ORIENTACAO DO DESENHO, que e onde essa historia sempre da errado: quem olha
// a mesa esta no -Z e olha pro +Z. Nessa camera o +X do mundo aparece a
// ESQUERDA da tela (a camera olha pro -Z dela, logo o X dela e o -X do mundo).
// Entao o lado ESQUERDO do desenho da carta tem que cair no +X local, e o TOPO
// do desenho no +Z local:
//
//     u = 0.5 - x/largura        v = 0.5 + z/comprimento
//
// Errar o sinal do u nao quebra nada — so imprime todas as 52 cartas
// espelhadas, que e o tipo de defeito que passa por tres revisoes.
//
// NENHUMA MARCA. O desenho e proprio: os quatro naipes sao curvas de bezier
// escritas aqui, as figuras (J/Q/K) sao um painel geometrico espelhado e o
// verso e uma trelica em losango com roseta central. Nada foi copiado de
// baralho de fabricante nenhum.
//
// ===========================================================================
// O DEFEITO DO BRILHO — e por que o conserto mora AQUI e nao na luz.
// ===========================================================================
//
// Relato do dono, com a carta ja escorada e ocupando 11% da altura da tela:
// "o brilho das cartas ta muito claro, muito mesmo". Nao era impressao. A
// medida (tools/shot-cartas.mjs) na mesa de poker dava:
//
//     luminancia LINEAR no papel da carta: max 1.36, mediana 1.21
//     82% dos pixels da carta acima de 0.85
//     o feltro logo ao lado, pra comparar: 0.052
//
// 0.85 e o threshold do UnrealBloomPass (src/core/engine.js). O bloom roda
// ENTRE o RenderPass e o OutputPass, ou seja, ele ve a cena em HDR linear e
// nao a imagem ja tonemapeada: o high-pass dele e
//     v = dot(rgb, vec3(0.299, 0.587, 0.114));  smoothstep(0.85, 0.86, v)
// Com 82% da carta acima disso, a carta inteira — nao a borda, a carta — virava
// fonte de bloom. Dai o halo e o branco lavado que engolia os pips.
//
// Somaram-se tres coisas, e so UMA delas e desta casa:
//   - o salao tem duas PointLight de 165 e 95 candelas a 4 m (world/casino.js) e
//     a mesa de poker fica quase embaixo da primeira;
//   - o threshold de 0.85 do bloom (core/engine.js);
//   - o branco do atlas, que era #fffdf6 — quase 100% de refletancia. Papel
//     nenhum e assim; cartao de baralho de verdade reflete uns 75%.
// As duas primeiras sao de outra gente. A terceira e minha, e ela sozinha nao
// resolvia: o marfim honesto (#f5f0e4) leva o atlas de 1.36 pra 1.17 medidos,
// ainda muito acima de 0.85.
//
// Entao o corte vem em TRES passos, os tres no lado da carta:
//   a) o ATLAS pinta ALBEDO honesto (marfim de cartao, nao branco de monitor);
//   b) 'material.color' e um TRIM de exposicao explicito, medido contra a luz
//      que existe hoje no salao — ver BRILHO_CARTA la embaixo;
//   c) a TINTA sai de baixo do trim: ela e declarada em albedo e dividida pelo
//      trim antes de ir pro canvas, entao mexer no trim move o PAPEL e mais
//      nada. Ver 'tinta()' e a nota do segundo defeito, logo abaixo.
// Separar assim tem uma razao pratica: quem for olhar o atlas ve o desenho como
// ele foi feito, e quem for mexer na luz da mesa mexe num numero so — sem
// arrastar o naipe junto, que foi exatamente o que deu errado da primeira vez.
//
// MEDIDO AGORA, com a luz do salao ja rebaixada pra 118 e 74 candelas, mao
// forcada em 5 de espadas e 5 de copas, carta escorada a 11,3% da altura:
//     poker ......... max 0.592 e 0.615   0% acima de 0.85   folga 28-30%
//     blackjack ..... max 0.550           0% acima de 0.85   folga 35%
// O pior caso continua sendo a carta DEITADA, 1.076 vez a escorada: 0.662, que
// ainda deixa 22% de folga.
//
// E ela NAO ficou cinza, que era a outra metade daquele pedido: a mesma
// ferramenta le a cor final na tela, depois do ACES e do bloom e do grade, e o
// papel sai em RGB 222..228 / 205..212 / 179..188.
//
// ===========================================================================
// A RESOLUCAO DA CELULA — a conta, pra ninguem refazer no escuro.
// ===========================================================================
//
// Com a carta escorada na mesa de poker ela ocupa 11,2% da altura da tela e
// ~7,2% da largura. Em cada tela isso da, em pixels de framebuffer:
//
//     720p   -> 92 x 81 px    celula 256 x 358  = 2,8x / 4,4x de sobra
//     1440p  -> 184 x 161 px                    = 1,4x / 2,2x
//     1440p com devicePixelRatio 2 (o cap do jogo) -> 207 px de largura = 1,24x
//     4K     -> 276 x 242 px                    = 0,93x / 1,5x
//
// Ou seja: a celula so fica no limite a 4K, e mesmo la e 0,93 texel por pixel
// com anisotropia 8. Subir pra 320 x 448 custaria 32 MB de textura (42 com
// mipmap) — mais que o DOBRO — pra ganhar nitidez numa resolucao so. Ficou em
// 256 x 358, e o que melhorou foi o TRACO: pip menor e mais estreito, indice
// que nao encosta mais no pip do canto, figura com adereco e rosto de verdade,
// As de espadas com o pique grande. Se um dia o alvo virar 4K, muda CEL_W e
// CEL_H e mais nada: nao ha um unico pixel cravado no desenho abaixo, tudo e
// fracao da celula (fx/fy).
// ---------------------------------------------------------------------------

import { NAIPES, nomeValor } from './baralho.js'

// --- medidas da peca -------------------------------------------------------

// A carta REAL de poker mede 63 x 88 mm. Esta e ~1,65 vez maior, e isso e de
// proposito: com a lente a 1,4 m do feltro e campo de 41 graus, a carta de
// tamanho certo ocupa 9% da altura da tela — le, mas nao e "bem nitida" nem
// "grande", que foi o pedido. Em 10,5 x 14,7 cm ela ocupa 14% na jogada e 26%
// no enquadramento de revelacao. O feltro tem 3,5 m de diametro; cabem folgado.
export const CARTA_L = 0.105          // largura (eixo X local)
export const CARTA_C = 0.147          // comprimento (eixo Z local)
export const CARTA_E = 0.0040         // espessura — 4 mm le como carta, 1 mm some
const CANTO_R = 0.0085                // raio do canto arredondado
const CANTO_SEG = 4                   // segmentos por canto: 4 ja le como curva

// --- o atlas ---------------------------------------------------------------

// 8 colunas x 7 linhas = 56 celulas pra 52 faces + 2 versos + marfim + 1 sobra.
// A celula tem a proporcao da carta (256/358 = 0.715 ~ 63/88) porque desenhar
// numa celula de outra proporcao obrigaria a esticar o desenho no uv, e naipe
// esticado e a primeira coisa que o olho pega.
const COLS = 8
const LINS = 7
const CEL_W = 256
const CEL_H = 358
const CEL_VERSO = 52
const CEL_MARFIM = 53
const CEL_VERSO_AZUL = 54

// A REGUA DO DESENHO. Todo tamanho daqui pra baixo e fracao da celula, nunca
// pixel. A versao anterior tinha 26, 34, 46, 52, 84, 122 soltos pelo arquivo:
// mexer em CEL_W obrigava a reescrever a carta inteira e por isso ninguem
// mexia. Com fx/fy, trocar a resolucao da celula e trocar duas constantes.
const fx = (t) => t * CEL_W
const fy = (t) => t * CEL_H
const TAU = Math.PI * 2

// Meia texela de recuo em cada borda da celula. Sem isso, no mipmap a carta
// puxa a cor da vizinha e aparece um fiapo colorido na borda quando ela esta
// longe (a mesma coisa que acontece com atlas de tile em qualquer engine).
const PAD_UV = 1.5

// TRIM DE EXPOSICAO DO PAPEL — o segundo dos dois passos descritos no
// cabecalho. Multiplica o que sai do atlas: papel, verso e a fita da lateral.
// A TINTA fica de fora dele; como, esta logo abaixo em 'tinta()'.
//
// Como este numero e achado, pra ninguem chutar. Ele e um multiplicador LINEAR
// direto sobre a carta: `node tools/shot-cartas.mjs poker` imprime o 'max' da
// luminancia linear do papel, e esse max escala 1:1 com o trim. O alvo e ficar
// CONFORTAVELMENTE abaixo do 0.85 do UnrealBloomPass.
//
// O PIOR CASO nao e a carta escorada, que e a que a ferramenta mede: e a carta
// DEITADA, com a face olhando pro teto e pegando a PointLight de frente. Medida
// a 1/5 da subida ela da 1.076 vez a escorada. Entao o alvo da MEDIDA e 0.60, o
// que poe a deitada em 0.645 e deixa 24% de folga ate o corte.
//
// POR QUE ELE SUBIU DE 0xc1c5c4 (luma 0.550) PRA 0xdee3e2 (luma 0.756).
// O trim de 0.550 foi calibrado contra duas PointLight de 165 e 95 candelas.
// Outra sessao derrubou as duas pra 118 e 74 (world/casino.js) — 0.72 da luz de
// antes — e o trim ficou corrigindo um estouro que ja nao existia: a medida caiu
// de 0.64 pra 0.436, 49% de folga, e o papel na tela desabou de ~220 pra 191.
// Papel escuro nao e carta boa e ainda por cima ENCOLHE o contraste do naipe,
// porque o naipe ja esta no fundo da curva e nao desce junto. Subir o trim por
// 0.60/0.436 = 1.376 devolve o papel e, com a tinta fora do trim, todo esse
// ganho vira contraste.
//
// Nao e cinza neutro: de/e3/e2 puxa pro FRIO, e isso e compensacao de luz. As
// duas PointLight do salao sao 0xffd2a0 — em linear o azul delas vale 0.36 do
// vermelho — e sem o trim frio a carta saia cor de manteiga. Ele nao neutraliza
// o ambar (nem deve: a carta esta num salao ambar), so tira o excesso. A razao
// entre os tres canais e a mesma de 0xc1c5c4; so a altura mudou.
//
// SE A LUZ DA MESA MUDAR DE NOVO: rode a ferramenta, leia o 'max' e multiplique
// este numero por 0.60/max — em LINEAR, nao no hex. A tinta nao se mexe.
const BRILHO_CARTA = 0xdee3e2

// --- as tintas -------------------------------------------------------------
//
// Estes valores sao ALBEDO: quanto a carta devolve da luz que chega, nao como
// ela aparece na tela. Quem faz a carta parecer branca e o tone mapping do
// engine, e ele comprime muito no topo — ver a nota do brilho no cabecalho.
//
// ===========================================================================
// O SEGUNDO DEFEITO: "de uma melhorada nas cartas, ta bem apagado os nipes".
// ===========================================================================
//
// O trim multiplicava a carta INTEIRA. Papel e tinta desciam juntos, e como a
// curva ACES e quase plana em cima e quase reta embaixo, descer os dois junto
// NAO preserva a leitura: o papel perde pouco (ele so anda no trecho comprimido)
// e o naipe perde tudo. Medido na mesa de poker, com a mao forcada em 5 de
// espadas e 5 de copas (tools/shot-cartas.mjs), luma na tela em 0..255:
//
//     papel 191..195     pip preto 48 (nucleo 34)     pip vermelho 78
//     DELTA papel-pip:   preto 147      vermelho 114      INDICE DO CANTO 63
//
// O indice era o pior de todos, e por dois motivos alem do trim: ele e pequeno
// (naipinho de 24 px numa celula de 358) e o traco da fonte e fino. Com a carta
// ocupando 11% da altura da tela, a celula minifica 5 vezes — o mipmap mistura
// tinta com papel e o que sobra de um traco de 1,3 pixel e cinza.
//
// TRES CONSERTOS, e nenhum deles desfaz o conserto do brilho:
//
//   1) A TINTA SAI DE BAIXO DO TRIM. 'tinta()' recebe o albedo que se QUER e
//      devolve o texel que, depois de multiplicado pelo trim, da exatamente
//      esse albedo. Papel e tinta sao camadas diferentes do mesmo canvas, entao
//      da pra descer uma sem descer a outra — e agora mexer no trim move so o
//      papel, que e o unico que responde pelo bloom.
//   2) O VERMELHO VIROU CARMIM. Era #b32338, que com o trim dava albedo efetivo
//      #871823: razao de 5.1:1 contra o papel, e no canal R so 38 niveis de
//      diferenca em 255. Um pip cujo canal R quase nao se separa do papel perde
//      a forma no mipmap antes de perder a cor — e por isso ele lia lavado, nao
//      escuro. Agora o alvo e albedo direto, 7.6:1, com o R bem mais fundo.
//   3) O TRACO ENGROSSOU onde a medida mandou: indice maior e com contorno, pip
//      um pouco maior. Ver a regua la embaixo.
//
// MEDIDO DEPOIS, mesma mao forcada, mesmo enquadramento (luma na tela, 0..255):
//
//                        antes  ->  depois
//     papel .............. 192      209        (o trim que voltou pro lugar)
//     DELTA pip preto .... 147      165   (+12%)   nucleo 161 -> 182
//     DELTA pip vermelho . 114      148   (+30%)   nucleo 123 -> 155
//     DELTA indice preto .. 66      118   (+79%)
//     DELTA indice vermelho 63      105   (+67%)
//     razao de albedo papel/tinta: preto 42.5:1 -> 63.6:1, vermelho 5.1:1 -> 10.3:1
//
// O UNICO numero que desceu e a CROMA do vermelho na tela, R-(G+B)/2 contra o
// papel: 110 -> 92. E troca de proposito, nao perda. Croma sem contraste de luz
// e o que faz um pip de tres pixels virar uma mancha rosa; o que se comprou com
// esses 18 pontos foi o canal R descendo 60 niveis abaixo do papel em vez de 38,
// que e a diferenca entre um coracao com forma e uma marca vermelha.
//
// O vermelho continua NAO sendo 0xff0000: carmim puro estoura no tone mapping e
// o naipe vira um borrao saturado sem forma. E a preta nao e 0x000000 — preto
// absoluto no meio de marfim serrilha feio quando o mipmap mistura os dois.
//
// O degrade do papel e ESTREITO de proposito. A primeira tentativa ia de
// #f4efe2 a #e0d8c3 e, com a vinheta por cima, a carta na mesa lia CAQUI — o
// pico ficava certo mas a mediana despencava pra 0.46 e o dono nao pediu carta
// suja, pediu carta sem halo. Marfim de cartao varia pouco: 6% entre o canto
// mais claro e o mais escuro e o que da volume sem sujar.

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

// O trim decomposto em linear, canal a canal — as mesmas contas que o three faz
// com material.color (ColorManagement liga sRGB -> working space por padrao).
const TRIM_LIN = [(BRILHO_CARTA >> 16) & 255, (BRILHO_CARTA >> 8) & 255, BRILHO_CARTA & 255]
  .map((c) => s2l(c / 255))

/**
 * O ANTIDOTO DO TRIM. Recebe o ALBEDO EFETIVO que a tinta tem que ter e devolve
 * a cor pra pintar no canvas, ja dividida pelo trim: quando o material
 * multiplicar de volta, sobra o alvo.
 *
 * So faz sentido pra cor ESCURA. Um alvo mais claro que o trim satura em 1.0 e
 * a divisao para de valer — por isso papel, pele, ouro e aco NAO passam por
 * aqui: eles sao materia da carta e devem descer e subir junto com o papel. O
 * que passa por aqui e o que tem que ficar parado onde esta: as duas tintas, o
 * contorno da figura, o cabelo e o manto escuro.
 */
function tinta(alvo) {
  const canais = [(alvo >> 16) & 255, (alvo >> 8) & 255, alvo & 255]
  return '#' + canais.map((c, k) => {
    const v = Math.round(l2s(Math.min(1, s2l(c / 255) / TRIM_LIN[k])) * 255)
    return v.toString(16).padStart(2, '0')
  }).join('')
}

// Albedo ALVO das duas tintas (nao e o que vai no canvas; ver tinta()).
// preta ... luma linear 0.0090, 46:1 contra o papel. Tinta de impressao de
//           verdade reflete uns 8%, mas 8% de albedo numa carta minificada 5x
//           vira cinza no mipmap: aqui ela e mais preta que o papel de verdade
//           de proposito, e o azul de sobra e o que tira o serrilhado.
// vermelha  luma linear 0.0544, 7.6:1. O canal R desce de 0.240 pra 0.165 de
//           albedo — 60 niveis abaixo do papel em vez de 38 — que e o que faz o
//           coracao ter FORMA e nao so cor.
const TINTA_PRETA = tinta(0x14181f)
const TINTA_VERMELHA = tinta(0x711121)
const MARFIM = '#f0ebde'          // o marfim de referencia (bordas e retalho)
const MARFIM_ALTO = '#f5f0e4'     // canto claro do degrade do papel
const MARFIM_BAIXO = '#e9e2d0'    // canto escuro
const MARFIM_SOMBRA = '#d2c9b2'   // a fita da lateral, um tom abaixo

// ---------------------------------------------------------------------------
// Os quatro naipes, desenhados na mao.
//
// Cada um cabe numa caixa de ALTURA 's' centrada em (x, y) e e desenhado com o
// fillStyle que ja estiver ativo. Sao curvas e nao poligonos porque naipe de
// baralho e uma forma organica: um pique feito de triangulos le como seta.
//
// A largura NAO e 's'. Na versao anterior os quatro cabiam num quadrado e o
// resultado era um naipe gordo, que era metade do motivo de o pip encostar no
// indice do canto. Naipe de baralho de verdade e mais alto que largo — o pique
// mede uns 9 x 11 mm — e aqui cada um tem a propria razao: 0.92 pro pique,
// 0.94 pro coracao, 0.78 pro losango, 0.90 pro trevo.
// ---------------------------------------------------------------------------

/**
 * Fecha a forma: preenche e, se 'eng' vier, contorna com a MESMA cor.
 *
 * Contornar com a cor do preenchimento nao e enfeite, e um dilatador: engrossa
 * a silhueta em eng/2 pra cada lado sem redesenhar nada. E o que salva o naipe
 * do canto, que na mesa mede 5 px de altura — em vez de crescer a forma (o que
 * roubaria a rua ate o pip da coluna), engrossa-se a borda, e o mipmap passa a
 * ter mais tinta pra fazer a media.
 *
 * O trevo tem quatro sub-formas que se cruzam: contornar cada uma nao deixa
 * costura nenhuma a vista, justamente porque o contorno tem a cor do miolo.
 */
function pintar(g, eng) {
  g.fill()
  if (!eng) return
  const w = g.lineWidth
  const j = g.lineJoin
  const c = g.strokeStyle
  g.lineWidth = eng
  g.lineJoin = 'round'
  g.strokeStyle = g.fillStyle
  g.stroke()
  g.lineWidth = w
  g.lineJoin = j
  g.strokeStyle = c
}

function pique(g, x, y, s, eng) {
  const w = 0.46 * s
  const h = 0.50 * s
  g.beginPath()
  g.moveTo(x, y - h)
  g.bezierCurveTo(x + w * 0.20, y - h * 0.50, x + w, y - h * 0.22, x + w, y + h * 0.18)
  g.bezierCurveTo(x + w, y + h * 0.62, x + w * 0.44, y + h * 0.70, x + w * 0.12, y + h * 0.30)
  // O PE. Nao e um triangulo: e um talo que sai fino do corpo e ABRE na base.
  // Com triangulo o pique lia como seta apontada pra baixo — o olho pega a
  // ponta reta antes de pegar o lobo, e a carta parava de ser "espadas".
  g.bezierCurveTo(x + w * 0.18, y + h * 0.68, x + w * 0.34, y + h * 0.90, x + w * 0.50, y + h)
  g.lineTo(x - w * 0.50, y + h)
  g.bezierCurveTo(x - w * 0.34, y + h * 0.90, x - w * 0.18, y + h * 0.68, x - w * 0.12, y + h * 0.30)
  g.bezierCurveTo(x - w * 0.44, y + h * 0.70, x - w, y + h * 0.62, x - w, y + h * 0.18)
  g.bezierCurveTo(x - w, y - h * 0.22, x - w * 0.20, y - h * 0.50, x, y - h)
  g.closePath()
  pintar(g, eng)
}

function coracao(g, x, y, s, eng) {
  const w = 0.47 * s
  const h = 0.50 * s
  g.beginPath()
  g.moveTo(x, y + h)
  g.bezierCurveTo(x - w * 0.32, y + h * 0.58, x - w, y + h * 0.04, x - w, y - h * 0.36)
  g.bezierCurveTo(x - w, y - h * 1.06, x - w * 0.30, y - h * 1.02, x, y - h * 0.34)
  g.bezierCurveTo(x + w * 0.30, y - h * 1.02, x + w, y - h * 1.06, x + w, y - h * 0.36)
  g.bezierCurveTo(x + w, y + h * 0.04, x + w * 0.32, y + h * 0.58, x, y + h)
  g.closePath()
  pintar(g, eng)
}

function losango(g, x, y, s, eng) {
  const w = 0.39 * s
  const h = 0.50 * s
  // As laterais sao levemente CONVEXAS (o controle a 0.46 e nao no meio). Um
  // losango de quatro retas le como pixel de jogo velho; a barriga de meio
  // milimetro e o que faz ele ler como ouros impresso.
  g.beginPath()
  g.moveTo(x, y - h)
  g.quadraticCurveTo(x + w * 0.46, y - h * 0.34, x + w, y)
  g.quadraticCurveTo(x + w * 0.46, y + h * 0.34, x, y + h)
  g.quadraticCurveTo(x - w * 0.46, y + h * 0.34, x - w, y)
  g.quadraticCurveTo(x - w * 0.46, y - h * 0.34, x, y - h)
  g.closePath()
  pintar(g, eng)
}

function trevo(g, x, y, s, eng) {
  const r = 0.192 * s
  // tres discos: um em cima e dois embaixo, encostados o suficiente pra o vao
  // entre eles fechar sozinho quando o mipmap comeca a misturar
  g.beginPath(); g.arc(x, y - 0.235 * s, r, 0, TAU); pintar(g, eng)
  g.beginPath(); g.arc(x - 0.238 * s, y + 0.105 * s, r, 0, TAU); pintar(g, eng)
  g.beginPath(); g.arc(x + 0.238 * s, y + 0.105 * s, r, 0, TAU); pintar(g, eng)
  g.beginPath()
  g.moveTo(x - 0.052 * s, y + 0.02 * s)
  g.bezierCurveTo(x - 0.062 * s, y + 0.26 * s, x - 0.16 * s, y + 0.42 * s, x - 0.215 * s, y + 0.50 * s)
  g.lineTo(x + 0.215 * s, y + 0.50 * s)
  g.bezierCurveTo(x + 0.16 * s, y + 0.42 * s, x + 0.062 * s, y + 0.26 * s, x + 0.052 * s, y + 0.02 * s)
  g.closePath()
  pintar(g, eng)
}

const DESENHO_NAIPE = [pique, coracao, losango, trevo]

/**
 * Desenha o naipe 'n' em (x,y) com ALTURA 's'. Ordem = a de baralho.js.
 * 'eng' engrossa a silhueta (ver pintar) e so os simbolos pequenos usam.
 */
function naipe(g, n, x, y, s, eng) {
  const f = DESENHO_NAIPE[n] || pique
  f(g, x, y, s, eng)
}

// ---------------------------------------------------------------------------
// O PAPEL: um retalho de ruido que se repete por tras de tudo.
//
// Papel chapado brilha uniforme, e superficie que brilha uniforme le como
// adesivo colado no feltro — foi metade da queixa de "muito claro". O ruido
// resolve duas coisas de uma vez: de perto vira fibra, e de longe o mipmap o
// dissolve na MEDIA dele, que e 5% mais escura que o papel puro.
//
// Gerador proprio (xorshift com semente fixa) e nao Math.random porque o atlas
// precisa sair IDENTICO em toda execucao: com ruido aleatorio, duas fotos da
// mesma carta tiradas pela ferramenta de medida nunca batiam pixel a pixel e
// nao dava pra saber se a diferenca era da mudanca ou do sorteio.
// ---------------------------------------------------------------------------
const TILE_PAPEL = 64

function tilePapel() {
  const t = document.createElement('canvas')
  t.width = TILE_PAPEL
  t.height = TILE_PAPEL
  const c = t.getContext('2d')
  const img = c.createImageData(TILE_PAPEL, TILE_PAPEL)
  let semente = 0x9e3779b9
  const sorteio = () => {
    semente ^= semente << 13
    semente ^= semente >>> 17
    semente ^= semente << 5
    return (semente >>> 0) / 4294967296
  }
  for (let i = 0; i < TILE_PAPEL * TILE_PAPEL; i++) {
    // preto com alfa baixo: escurece o papel de leve, nunca clareia. Ruido que
    // clareia empurraria pixel pra cima do threshold do bloom, que e o defeito
    // que este arquivo inteiro esta consertando. Alfa ate 20/255 (media 10) =
    // 4% mais escuro na media, que e o que o mipmap enxerga de longe.
    img.data[i * 4 + 3] = Math.floor(sorteio() * 20)
  }
  c.putImageData(img, 0, 0)
  // fibra: uns riscos horizontais bem apagados por cima do ruido, que e o que
  // separa "granulado" de "papel". Sem eles o ruido le como poeira na lente.
  const cg = t.getContext('2d')
  cg.strokeStyle = 'rgba(0,0,0,0.045)'
  cg.lineWidth = 1
  for (let i = 0; i < 10; i++) {
    const y = sorteio() * TILE_PAPEL
    cg.beginPath()
    cg.moveTo(0, y)
    cg.bezierCurveTo(TILE_PAPEL * 0.3, y + 1.5, TILE_PAPEL * 0.7, y - 1.5, TILE_PAPEL, y)
    cg.stroke()
  }
  return t
}

let _papel = null
function padraoPapel(g) {
  if (!_papel) _papel = tilePapel()
  return g.createPattern(_papel, 'repeat')
}

/** Retangulo de canto redondo. O canto do desenho segue o canto do CORTE. */
function caminhoArredondado(x, y, w, h, r) {
  const p = new Path2D()
  p.moveTo(x + r, y)
  p.lineTo(x + w - r, y)
  p.quadraticCurveTo(x + w, y, x + w, y + r)
  p.lineTo(x + w, y + h - r)
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  p.lineTo(x + r, y + h)
  p.quadraticCurveTo(x, y + h, x, y + h - r)
  p.lineTo(x, y + r)
  p.quadraticCurveTo(x, y, x + r, y)
  return p
}

/** O fundo de papel de uma celula: degrade + ruido + vinheta. */
function fundoDePapel(g) {
  const W = CEL_W
  const H = CEL_H
  const grad = g.createLinearGradient(0, 0, W * 0.45, H)
  grad.addColorStop(0, MARFIM_ALTO)
  grad.addColorStop(0.55, MARFIM)
  grad.addColorStop(1, MARFIM_BAIXO)
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)

  g.save()
  g.globalAlpha = 0.9
  g.fillStyle = padraoPapel(g)
  g.fillRect(0, 0, W, H)
  g.restore()

  // VINHETA. A borda da carta e o que primeiro estourava: e ali que a normal
  // pega a PointLight de raspao e onde o bloom vazava pro feltro. Escurecer 6,5%
  // no perimetro tira o contorno branco e ainda faz a carta ler como um objeto
  // com volume em vez de um recorte de papel. Com 12% (a primeira tentativa) o
  // canto ficava marrom e a carta inteira lia como envelhecida.
  const vin = g.createRadialGradient(W * 0.5, H * 0.5, H * 0.22, W * 0.5, H * 0.5, H * 0.64)
  vin.addColorStop(0, 'rgba(0,0,0,0)')
  vin.addColorStop(1, 'rgba(30,24,12,0.065)')
  g.fillStyle = vin
  g.fillRect(0, 0, W, H)
}

// ---------------------------------------------------------------------------
// O arranjo dos simbolos do meio, carta por carta.
//
// Sao as posicoes classicas: coluna esquerda/direita em -1/+1, coluna do meio
// em 0; a linha de cima em -1 e a de baixo em +1. Nao ha nada de arbitrario
// aqui — e o arranjo que qualquer jogador reconhece sem contar os simbolos, e e
// por isso que ele existe: um 8 com oito simbolos espalhados de qualquer jeito
// obriga a CONTAR, e contar e o que a gente esta tentando evitar.
//
// O 7 e o 8 tem o pip do meio ENTRE a linha de cima e a do meio (-0.5), e o 10
// tem os dois entre as linhas 1-2 e 3-4 (+-0.66). Isso nao e enfeite: e o que
// distingue um 10 de um 8 no canto do olho, sem contar nada.
// ---------------------------------------------------------------------------
const ARRANJO = {
  2: [[0, -1], [0, 1]],
  3: [[0, -1], [0, 0], [0, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  7: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  8: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
  9: [[-1, -1], [1, -1], [-1, -0.34], [1, -0.34], [0, 0], [-1, 0.34], [1, 0.34], [-1, 1], [1, 1]],
  10: [[-1, -1], [1, -1], [0, -0.66], [-1, -0.34], [1, -0.34], [-1, 0.34], [1, 0.34], [0, 0.66], [-1, 1], [1, 1]],
}

// ONDE O INDICE E O PIP MORAM, e por que esses numeros e nao outros.
//
// Na versao anterior o pip da linha de cima ENCOSTAVA no naipe do canto: o
// canto ficava em x 9..43 e a coluna de pips em 42..94. Dava pra ver no 5 de
// copas e no 9 de copas — dois coracoes grudados, que le como um borrao. A
// carta de verdade resolve isso deixando 5 mm de rua entre os dois, e o unico
// jeito de ter essa rua numa celula de 256 e o pip ser MENOR: caiu de 52 pra
// 41 de altura (e ficou mais estreito, ver a nota dos naipes).
//
// O naipe do canto tambem encolheu (de 34 pra 24), e por um motivo que so
// apareceu na foto: com ele grande, o naipe do canto e o pip da coluna eram do
// MESMO tamanho e o olho lia os dois como um PAR de simbolos — o 5 de copas
// parecia ter seis coracoes. O indice tem que ser miniatura, nao irmao gemeo.
//
// O QUE MUDOU AGORA, e o que decidiu cada numero.
//
// A medida do indice na tela era um delta de 63 em 255 contra o papel, menos da
// METADE do delta de um pip (147). O indice nao estava mal desenhado: ele
// estava PEQUENO pro tamanho em que a carta aparece. Com a carta ocupando 11%
// da tela, a celula de 358 minifica 5 vezes; o naipinho de 24 px virava 4,6 px
// e o traco da fonte, 1,3 px. O mipmap nao apaga o desenho, ele faz a MEDIA —
// e a media de um traco de 1,3 px com o papel em volta e cinza claro.
//
// Entao o indice cresceu ate onde o '10' deixa, e nao um decimo alem:
//     naipe do canto  0.068 -> 0.080   (24 -> 29 px de altura, +46% de tinta)
//     fonte 1 digito  0.134 -> 0.146   (48 -> 52 px)
//     fonte '10'      0.117 (PARADO)   — ver abaixo
//     contorno do numero  0 -> 0.0072  (2,6 px: haste de 8 px vira 10,5)
//     pip             0.108 -> 0.118   (39 -> 42 px)
//     coluna dos pips 0.240 -> 0.228   (recuou 3 px pro centro pra devolver a
//                                       rua que o naipe maior comeu)
//
// O '10' NAO CRESCE, e e ele que trava tudo. Ele e o unico indice de dois
// digitos: em 0.117 ele ja ocupa x 6..44 na celula, com a moldura em 9. Um
// corpo maior o joga pra fora da moldura de um lado e em cima do pip do outro.
// Quem carrega o '10' e o CONTORNO (ver 'indice' em desenharFace), que engrossa
// o traco sem mexer na caixa da letra.
//
// Com os numeros de agora, na regua de 256 x 358:
//     '10' do indice ..... x  5..45     pip da coluna .... x 49..88
//     naipe do canto ..... x 11..40     rua entre eles ... 9 px (3,6% da carta)
const IDX_X = 0.098          // centro do indice, em fracao da largura
// 0.093 e nao 0.088: a fonte maior subiu a cabeca do numero pra y 12 e a moldura
// interna mora em y 9. Um '7' encostando na moldura le como erro de impressao,
// e sao 2 px pra resolver — o indice inteiro desce junto e nada mais se move.
const IDX_Y = 0.093          // centro do numero, em fracao da altura
const IDX_FONTE = 0.146      // corpo da fonte pra 1 digito
const IDX_FONTE_2 = 0.117    // ... e pra '10' (travado pela largura, ver acima)
const IDX_TRACO = 0.0072     // contorno do numero, em fracao da altura (~2,6 px)
const IDX_NAIPE = 0.080      // altura do naipe do canto
const IDX_NAIPE_DY = 0.104   // quanto ele fica abaixo do numero
const PIP_COL = 0.228        // afastamento das colunas laterais (fracao de W)
const PIP_LIN = 0.283        // afastamento das linhas (fracao de H)
const PIP_ALT = 0.118        // altura do pip (fracao de H)

// Tons da figura. O manto vem do NAIPE (vermelho ou azul-ardosia), mas o
// contorno, a pele, o cabelo e o adorno tem cor propria — e essa separacao e o
// que faz a figura ler. A primeira versao pintava tudo na cor do naipe e, num Q
// de ouros a 20 cm de distancia, o resultado era uma mancha vermelha sem forma:
// vermelho sobre marfim tem contraste baixo demais pra carregar desenho
// sozinho. Contorno escuro sempre; cor so no manto, no cabelo e no adorno.
//
// QUEM PASSA POR tinta() E QUEM NAO PASSA. O contorno, o cabelo e o manto
// escuro sao TINTA: eles seguram a figura e nao podem descer quando o trim
// desce. O painel, a pele, o ouro e o aco sao MATERIA da carta e ficam de fora
// — se o painel nao subisse junto com o papel, a figura viraria um selo escuro
// colado num cartao claro. Os alvos do cabelo e do manto sao exatamente o que
// eles JA rendiam com o trim antigo (albedo efetivo #362619 e #253345); eles
// nao mudaram de cor, so pararam de andar.
const FIG_TINTA = TINTA_PRETA
const FIG_CLARO = '#f1ecde'
const FIG_PELE = '#dcb694'
const FIG_OURO = '#c39b3d'
const FIG_ACO = '#8e99a5'
const FIG_CABELO = tinta(0x352518)
const FIG_HASTE = '#6d4c2e'
const FIG_MANTO_PRETO = tinta(0x263548)

/**
 * O ADERECO — o que a figura segura. Desenhado ANTES do manto de proposito:
 * assim ele nasce por tras do ombro, como na carta de verdade, em vez de flutuar
 * grudado na frente do peito.
 *
 * Existe porque foi ele que fez a figura parar de ser um boneco. A silhueta de
 * um busto com cabeca redonda e ombros e a mesma pra J, Q e K — so o chapeu
 * mudava, e chapeu tem 8 px na tela. Uma diagonal comprida saindo do ombro,
 * essa o olho pega de longe: cetro e rei, flor e dama, alabarda e valete.
 *
 * ELES ENGROSSARAM. O relato foi "as figuras tao muito feinhas", e a espada do
 * rei era parte do problema: uma lamina de 0.11 s de largura, o que na tela do
 * jogo da MENOS DE UM PIXEL de traco. Um risco de meio pixel nao le como
 * espada, le como sujeira no atlas. O cetro que entrou no lugar tem haste de
 * 0.10 s e uma cabeca redonda de 0.19 s: a cabeca sozinha ja e uma FORMA, e
 * forma sobrevive a minificacao. Um fio, nao.
 */
function adereco(g, letra, s, corNaipe) {
  const traco = Math.max(1.1, s * 0.036)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco

  if (letra === 'K') {
    // CETRO. Trocou a espada pela razao da nota acima, e ele diz 'rei' melhor
    // que ela de quebra: espada e do soldado, cetro e de quem manda.
    g.save()
    g.translate(s * 0.70, s * 0.10)
    g.rotate(0.13)
    const haste = new Path2D()
    haste.rect(-s * 0.050, -s * 0.50, s * 0.10, s * 0.94)
    g.fillStyle = FIG_OURO
    g.fill(haste); g.stroke(haste)
    // tres aneis na haste: e o que separa 'cetro' de 'cabo de vassoura'
    g.fillStyle = '#8d6a20'
    for (const ay of [-0.24, 0.06, 0.36]) {
      const a = new Path2D()
      a.rect(-s * 0.086, ay * s, s * 0.172, s * 0.052)
      g.fill(a); g.stroke(a)
    }
    const bola = new Path2D()
    bola.arc(0, -s * 0.62, s * 0.175, 0, TAU)
    g.fillStyle = FIG_OURO
    g.fill(bola); g.stroke(bola)
    // a pedra da bola, na cor do naipe: e o unico ponto do adereco que amarra
    // a figura ao naipe dela
    const pedra = new Path2D()
    pedra.arc(0, -s * 0.62, s * 0.072, 0, TAU)
    g.fillStyle = corNaipe === TINTA_VERMELHA ? corNaipe : '#8d6a20'
    g.fill(pedra); g.stroke(pedra)
    // cruz no topo
    const cruz = new Path2D()
    cruz.rect(-s * 0.030, -s * 0.95, s * 0.060, s * 0.20)
    cruz.rect(-s * 0.098, -s * 0.895, s * 0.196, s * 0.058)
    g.fillStyle = FIG_OURO
    g.fill(cruz); g.stroke(cruz)
    g.restore()
    return
  }

  if (letra === 'Q') {
    // FLOR: haste curva e uma roseta de cinco petalas.
    //
    // A roseta ENCOSTOU no ombro e cresceu de 0.155 pra 0.175 de raio. Antes
    // ela ficava sozinha no canto do painel, com um palmo de vazio entre ela e
    // a dama, e o par lia como dois desenhos e nao como uma pessoa segurando
    // uma flor.
    //
    // A petala e VERMELHA so nos naipes vermelhos. Nos pretos ela sai dourada,
    // e nao preta: uma roseta de tinta preta no canto do painel virava um borrao
    // escuro do tamanho da cabeca da dama — na foto do atlas a Q de paus lia
    // como se ela tivesse duas cabecas.
    const petala = corNaipe === TINTA_VERMELHA ? corNaipe : FIG_OURO
    g.strokeStyle = '#4d6b3c'
    g.lineWidth = traco * 1.5
    g.beginPath()
    g.moveTo(s * 0.46, s * 0.58)
    g.quadraticCurveTo(s * 0.76, s * 0.14, s * 0.62, -s * 0.30)
    g.stroke()
    // duas folhas na haste: sem elas a haste le como arame
    g.fillStyle = '#4d6b3c'
    for (const [lx, ly, ex, ey] of [[0.65, 0.14, 0.95, -0.08], [0.70, 0.36, 0.42, 0.34]]) {
      g.beginPath()
      g.moveTo(s * lx, s * ly)
      g.quadraticCurveTo(s * ex, s * (ly - 0.10), s * ex, s * ey)
      g.quadraticCurveTo(s * (lx + (ex - lx) * 0.3), s * (ly - 0.02), s * lx, s * ly)
      g.fill()
    }
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco
    g.fillStyle = petala
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5
      const p = new Path2D()
      p.ellipse(s * 0.62 + Math.cos(a) * s * 0.170, -s * 0.48 + Math.sin(a) * s * 0.170,
        s * 0.132, s * 0.102, a, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    const miolo = new Path2D()
    miolo.arc(s * 0.62, -s * 0.48, s * 0.098, 0, TAU)
    g.fillStyle = petala === FIG_OURO ? '#8d6a20' : FIG_OURO
    g.fill(miolo); g.stroke(miolo)
    return
  }

  // J: ALABARDA — haste comprida e uma lamina em folha na ponta. Ela fica toda
  // DENTRO do painel: a primeira versao punha a lamina em s*1.06 e o clip do
  // painel cortava a ponta, o que lia como um risco solto no canto e nao como
  // uma arma. A haste dobrou de espessura pelo motivo da nota do cabecalho.
  g.strokeStyle = FIG_HASTE
  g.lineWidth = s * 0.100
  g.beginPath()
  g.moveTo(s * 0.44, s * 0.82)
  g.lineTo(s * 0.70, -s * 0.42)
  g.stroke()
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
  // A LAMINA E UMA FOLHA COM PONTA, e nao uma meia-lua. A primeira versao
  // abria ate 1.00 s com a base larga e o resultado lia como CONCHA — na foto
  // do atlas a alabarda do valete parecia uma colher. Estreitando a barriga
  // (0.94 em vez de 1.00) e fechando a base num angulo, a silhueta volta a ser
  // uma ponta, que e o que uma arma precisa ter.
  const folha = new Path2D()
  folha.moveTo(s * 0.76, -s * 0.96)
  folha.quadraticCurveTo(s * 0.94, -s * 0.68, s * 0.77, -s * 0.36)
  folha.quadraticCurveTo(s * 0.62, -s * 0.66, s * 0.76, -s * 0.96)
  g.fillStyle = FIG_ACO
  g.fill(folha); g.stroke(folha)
  // gume: um fio claro colado no dorso da lamina. Ele e FINO — na versao
  // anterior ocupava a barriga inteira e a folha ficava oca, o que ajudava a
  // colher a parecer colher.
  g.fillStyle = 'rgba(255,255,255,0.42)'
  g.beginPath()
  g.moveTo(s * 0.765, -s * 0.92)
  g.quadraticCurveTo(s * 0.885, -s * 0.68, s * 0.772, -s * 0.41)
  g.quadraticCurveTo(s * 0.825, -s * 0.68, s * 0.765, -s * 0.92)
  g.fill()
  // bico curto no lado oposto: a silhueta de alabarda, e nao de lanca
  g.strokeStyle = FIG_TINTA
  const bico = new Path2D()
  bico.moveTo(s * 0.70, -s * 0.70)
  bico.lineTo(s * 0.46, -s * 0.55)
  bico.lineTo(s * 0.695, -s * 0.49)
  bico.closePath()
  g.fillStyle = FIG_ACO
  g.fill(bico); g.stroke(bico)
}

/**
 * O ADORNO DE CABECA, por posto. Vai por ULTIMO, por cima do cabelo.
 *
 * ELE COUBE, e essa foi a correcao maior desta revisao — maior que qualquer
 * redesenho. Na versao anterior a coroa do rei ia a 1.13 s acima da ancora do
 * busto, e a ancora estava a 0.46 da meia-altura do painel: com s valendo 0.52
 * da largura, o pico da coroa caia 35 px ACIMA da borda do painel e o clip
 * comia ele. O que sobrava na carta era um aro dourado com dois dentes
 * cortados no meio — e como o diadema da dama e a aba do valete sofriam o
 * mesmo corte, os tres postos acabavam com a MESMA faixa dourada na testa.
 * "Feinhas" ali era literalmente "sem coroa".
 *
 * Agora a conta e explicita e esta na nota de figura(): o busto inteiro cabe
 * entre -1.04 s e +0.88 s da ancora, e nenhum adorno passa disso.
 */
function coroa(g, letra, s) {
  const traco = Math.max(1.1, s * 0.036)
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
  g.fillStyle = FIG_OURO

  if (letra === 'K') {
    // O VELUDO PRIMEIRO: o miolo da coroa e um chapeu de tecido, e sem ele os
    // dentes dourados ficam pendurados no ar em cima do cabelo. Ele e o que faz
    // a coroa ter volume em vez de ser uma serra.
    const veludo = new Path2D()
    veludo.moveTo(-s * 0.42, -s * 0.58)
    veludo.quadraticCurveTo(0, -s * 0.99, s * 0.42, -s * 0.58)
    veludo.closePath()
    g.fillStyle = '#8a2135'
    g.fill(veludo); g.stroke(veludo)

    const c = new Path2D()
    c.moveTo(-s * 0.44, -s * 0.56)
    c.lineTo(-s * 0.47, -s * 0.80)
    c.lineTo(-s * 0.23, -s * 0.64)
    c.lineTo(0, -s * 0.92)
    c.lineTo(s * 0.23, -s * 0.64)
    c.lineTo(s * 0.47, -s * 0.80)
    c.lineTo(s * 0.44, -s * 0.56)
    c.closePath()
    g.fillStyle = FIG_OURO
    g.fill(c); g.stroke(c)
    // as tres perolas das pontas: e o que faz a coroa nao virar uma serra
    g.fillStyle = FIG_CLARO
    for (const px of [-0.47, 0, 0.47]) {
      const p = new Path2D()
      p.arc(px * s, (px === 0 ? -0.975 : -0.855) * s, s * 0.058, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    // aro da base, com tres pedras
    const aro = new Path2D()
    aro.rect(-s * 0.46, -s * 0.61, s * 0.92, s * 0.145)
    g.fillStyle = FIG_OURO
    g.fill(aro); g.stroke(aro)
    for (const px of [-0.25, 0, 0.25]) {
      const pedra = new Path2D()
      pedra.ellipse(px * s, -s * 0.538, s * 0.058, s * 0.045, 0, 0, TAU)
      g.fillStyle = px === 0 ? '#a83a4c' : '#2f5d7a'
      g.fill(pedra); g.stroke(pedra)
    }
    return
  }

  if (letra === 'Q') {
    // DIADEMA: um arco baixo com tres pontas e uma gema em cada. Mais leve que
    // a coroa do rei — a diferenca entre os dois tem que ler no CONTORNO, e por
    // isso ele nao tem veludo: e metal vazado, o oposto da massa da coroa.
    const d = new Path2D()
    d.moveTo(-s * 0.42, -s * 0.54)
    d.quadraticCurveTo(-s * 0.33, -s * 0.80, -s * 0.21, -s * 0.62)
    d.quadraticCurveTo(-s * 0.10, -s * 0.88, 0, -s * 0.86)
    d.quadraticCurveTo(s * 0.10, -s * 0.88, s * 0.21, -s * 0.62)
    d.quadraticCurveTo(s * 0.33, -s * 0.80, s * 0.42, -s * 0.54)
    d.closePath()
    g.fillStyle = FIG_OURO
    g.fill(d); g.stroke(d)
    g.fillStyle = FIG_CLARO
    for (const [px, py, r] of [[0, -0.915, 0.072], [-0.295, -0.78, 0.046], [0.295, -0.78, 0.046]]) {
      const p = new Path2D()
      p.arc(px * s, py * s, s * r, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    // fio de perolas na testa: e ele que assenta o diadema na cabeca em vez de
    // deixar o arco flutuando acima do cabelo
    g.fillStyle = '#e8d9ae'
    for (let i = -3; i <= 3; i++) {
      const p = new Path2D()
      p.arc(i * s * 0.108, -s * 0.552, s * 0.037, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    return
  }

  // J: BARRETE de tecido com aba CURVA e uma pena atravessada.
  //
  // A aba era um retangulo reto de ponta a ponta e lia como uma tabua pregada
  // na testa — a cabeca ficava com cara de mesa. Curvada, ela acompanha o
  // craneo e o barrete vira roupa.
  //
  // A pena cruza a cabeca DA DIREITA PRA ESQUERDA e termina dentro do painel.
  // Antes ela saia reto pro lado em -0.92 s e o clip a cortava no meio: o que
  // aparecia na carta era um chifre branco.
  const gorro = new Path2D()
  gorro.moveTo(-s * 0.40, -s * 0.54)
  gorro.bezierCurveTo(-s * 0.44, -s * 0.92, s * 0.28, -s * 0.96, s * 0.40, -s * 0.66)
  gorro.lineTo(s * 0.40, -s * 0.54)
  gorro.closePath()
  g.fillStyle = FIG_MANTO_PRETO
  g.fill(gorro); g.stroke(gorro)
  // vinco do tecido: duas linhas que seguem a curva do barrete
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = traco * 0.9
  for (const k of [0.0, 0.16]) {
    g.beginPath()
    g.moveTo(-s * 0.32, -s * (0.64 + k))
    g.quadraticCurveTo(0, -s * (0.86 + k), s * 0.30, -s * (0.66 + k))
    g.stroke()
  }
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
  const aba = new Path2D()
  aba.moveTo(-s * 0.45, -s * 0.545)
  aba.quadraticCurveTo(0, -s * 0.685, s * 0.45, -s * 0.545)
  aba.quadraticCurveTo(0, -s * 0.575, -s * 0.45, -s * 0.545)
  aba.closePath()
  g.fillStyle = FIG_OURO
  g.fill(aba); g.stroke(aba)
  const pena = new Path2D()
  pena.moveTo(s * 0.20, -s * 0.76)
  pena.bezierCurveTo(-s * 0.16, -s * 1.02, -s * 0.58, -s * 0.94, -s * 0.62, -s * 0.60)
  pena.bezierCurveTo(-s * 0.40, -s * 0.80, -s * 0.10, -s * 0.74, s * 0.20, -s * 0.68)
  pena.closePath()
  g.fillStyle = FIG_CLARO
  g.fill(pena); g.stroke(pena)
  // a raque da pena: sem ela a forma le como uma nuvem branca
  g.strokeStyle = 'rgba(60,52,40,0.55)'
  g.lineWidth = traco * 0.8
  g.beginPath()
  g.moveTo(s * 0.18, -s * 0.72)
  g.bezierCurveTo(-s * 0.14, -s * 0.88, -s * 0.46, -s * 0.85, -s * 0.60, -s * 0.63)
  g.stroke()
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
}

/**
 * O ROSTO. Separado do busto porque as tres figuras dividem tudo dele menos
 * duas coisas: a barba do rei e as mechas da dama.
 *
 * A EXPRESSAO MUDOU, e essa e a metade do "tao muito feinhas" que nao estava no
 * tamanho. A versao anterior tinha sobrancelhas em diagonal descendente pro
 * meio — a forma universal de "bravo" — e as tres figuras usavam a MESMA, o que
 * dava um baralho inteiro de gente irritada e identica. As de agora sao arcos
 * levemente abaulados: a 12 px elas leem como sombra da testa, que e o que
 * sobrancelha faz num rosto pequeno, e param de dar carater.
 */
function rosto(g, letra, s, traco) {
  // pescoco, por tras de tudo: sem ele a cabeca nasce colada na gola e a
  // figura parece um busto de gesso em cima de uma caixa
  const pesc = new Path2D()
  pesc.rect(-s * 0.105, -s * 0.12, s * 0.21, s * 0.26)
  g.fillStyle = FIG_PELE
  g.fill(pesc); g.stroke(pesc)

  // cabelo por tras, rosto por cima: a massa escura em volta e o que da
  // contraste pro rosto num campo de marfim
  const cabelo = new Path2D()
  cabelo.ellipse(0, -s * 0.30, s * 0.335, s * 0.375, 0, 0, TAU)
  g.fillStyle = FIG_CABELO
  g.fill(cabelo); g.stroke(cabelo)

  const face = new Path2D()
  face.ellipse(0, -s * 0.265, s * 0.232, s * 0.288, 0, 0, TAU)
  g.fillStyle = FIG_PELE
  g.fill(face); g.stroke(face)

  // olhos
  g.fillStyle = FIG_TINTA
  for (const ox of [-0.092, 0.092]) {
    g.beginPath()
    g.ellipse(ox * s, -s * 0.310, s * 0.030, s * 0.039, 0, 0, TAU)
    g.fill()
  }
  // sobrancelhas: arcos, nao diagonais (ver a nota da funcao)
  g.lineWidth = traco * 0.8
  for (const lado of [-1, 1]) {
    g.beginPath()
    g.moveTo(lado * s * 0.030, -s * 0.380)
    g.quadraticCurveTo(lado * s * 0.096, -s * 0.418, lado * s * 0.158, -s * 0.373)
    g.stroke()
  }
  // nariz: uma linha curta com a asa marcada de um lado so, que e como um
  // nariz de tres quartos aparece
  g.beginPath()
  g.moveTo(0, -s * 0.290)
  g.lineTo(-s * 0.018, -s * 0.196)
  g.lineTo(s * 0.042, -s * 0.183)
  g.stroke()
  // boca
  g.beginPath()
  g.moveTo(-s * 0.070, -s * 0.120)
  g.quadraticCurveTo(0, -s * 0.100, s * 0.070, -s * 0.120)
  g.stroke()
  g.lineWidth = traco

  if (letra === 'K') {
    // BARBA: cobre a boca e desce ate a gola. E o unico jeito de o rei ler como
    // rei num rosto de 12 px — coroa sozinha se confunde com o diadema.
    const barba = new Path2D()
    barba.moveTo(-s * 0.228, -s * 0.212)
    barba.quadraticCurveTo(-s * 0.228, s * 0.14, 0, s * 0.18)
    barba.quadraticCurveTo(s * 0.228, s * 0.14, s * 0.228, -s * 0.212)
    barba.quadraticCurveTo(0, -s * 0.030, -s * 0.228, -s * 0.212)
    barba.closePath()
    g.fillStyle = FIG_CABELO
    g.fill(barba); g.stroke(barba)
    // bigode por cima da barba, tapando a boca: dois arcos que saem do nariz
    const big = new Path2D()
    big.moveTo(-s * 0.020, -s * 0.166)
    big.quadraticCurveTo(-s * 0.146, -s * 0.186, -s * 0.184, -s * 0.082)
    big.quadraticCurveTo(-s * 0.088, -s * 0.112, 0, -s * 0.107)
    big.quadraticCurveTo(s * 0.088, -s * 0.112, s * 0.184, -s * 0.082)
    big.quadraticCurveTo(s * 0.146, -s * 0.186, s * 0.020, -s * 0.166)
    big.closePath()
    g.fill(big); g.stroke(big)
  } else if (letra === 'Q') {
    // duas mechas caindo dos lados: silhueta de dama
    for (const lado of [-1, 1]) {
      const m = new Path2D()
      m.moveTo(lado * s * 0.305, -s * 0.36)
      m.quadraticCurveTo(lado * s * 0.460, -s * 0.04, lado * s * 0.315, s * 0.14)
      m.quadraticCurveTo(lado * s * 0.238, -s * 0.06, lado * s * 0.238, -s * 0.32)
      m.closePath()
      g.fillStyle = FIG_CABELO
      g.fill(m); g.stroke(m)
    }
  }
}

/**
 * A FIGURA de J, Q e K.
 *
 * Nao ha ilustracao de corte francesa aqui, e nem podia haver: as figuras dos
 * baralhos de banca sao desenho de fabricante. O que se desenha e um painel
 * espelhado — a metade de cima e a de baixo iguais e viradas, como na carta de
 * verdade — com um busto: manto, gola de arminho, cabelo, rosto, adorno por
 * posto e um adereco na mao.
 *
 * ===========================================================================
 * A CONTA VERTICAL, que e o que faltava antes
 * ===========================================================================
 *
 * O painel mede w x h (hoje 0.62 x 0.60 da celula, ou 158 x 215 px). O busto e
 * desenhado num sistema de unidades 's', ancorado a `-meia * ANCORA` do centro
 * do painel, e ele vai de -1.04 s (a perola da coroa) a +0.88 s (a barra do
 * manto). Pra o desenho INTEIRO caber e os dois bustos ainda se cruzarem no
 * meio — que e o que faz uma carta de corte parecer uma carta de corte — as
 * duas pontas tem que cair assim:
 *
 *     topo   = -meia*ANCORA - 1.04 s  >=  -meia + margem
 *     fundo  = -meia*ANCORA + 0.88 s  ~=  +meia * 0.25
 *
 * Com meia = 107 px, s = 0.43 w = 68 px e ANCORA = 0.31, isso da topo em -104
 * (3 px dentro da moldura) e fundo em +27, ou seja os dois bustos se cobrem por
 * 54 px — um quarto do painel. Foi assim que os numeros abaixo sairam.
 *
 * ===========================================================================
 * O QUE MUDOU NESTA REVISAO, e por que
 * ===========================================================================
 *
 * O relato foi curto e direto: "quero que melhore e de juice nas figuras rei,
 * valete e rainha, tao muito feinhas". Olhando o atlas ampliado, "feinha" tinha
 * quatro causas separadas, e nenhuma delas era 'falta de detalhe':
 *
 *   1. O ADORNO NAO CABIA NO PAINEL. Ver a nota de coroa(): a coroa, o diadema
 *      e o barrete eram todos cortados pelo clip na mesma altura, e os tres
 *      postos acabavam com a mesma faixa dourada na testa. Esta e a causa
 *      numero um, e ela nao se resolve desenhando melhor — se resolve com a
 *      conta acima.
 *   2. A GOLA DE RUFO. Cinco discos claros encostados embaixo do queixo liam
 *      como BARBA BRANCA nas tres figuras, inclusive na dama. Ela saiu e entrou
 *      uma gola de ARMINHO: uma faixa sobre os ombros com tres caudas pretas.
 *      Faixa nao vira barba, e de quebra diz 'realeza' sem custar detalhe.
 *   3. A CARA DE BRAVO. Ver a nota de rosto().
 *   4. O ADERECO FINO. Ver a nota de adereco().
 *
 * O que NAO mudou e a arquitetura: painel espelhado, clip no painel, adereco
 * antes do manto. Ela estava certa e e o que faz a carta ler como carta.
 *
 * Tudo dentro do painel e RECORTADO nele: o busto e maior que a metade que ele
 * ocupa (e assim que corte francesa funciona, os dois se interpenetram no
 * meio), e sem o clip o manto vazava por cima do indice do canto.
 */
const FIG_S = 0.43        // tamanho do busto, em fracao da largura do painel
const FIG_ANCORA = 0.31   // altura da ancora, em fracao da meia-altura

function figura(g, letra, n, x, y, w, h, corManto, corNaipe) {
  const meia = h / 2
  const painel = caminhoArredondado(x - w / 2, y - meia, w, h, w * 0.05)

  g.save()
  g.fillStyle = FIG_CLARO
  g.fill(painel)
  g.save()
  g.clip(painel)

  // trama do fundo do painel, na cor do naipe e bem apagada: da temperatura ao
  // quadro sem competir com a figura
  g.strokeStyle = corNaipe
  g.globalAlpha = 0.10
  g.lineWidth = Math.max(1, w * 0.010)
  for (let i = -h; i < w + h; i += w * 0.055) {
    g.beginPath()
    g.moveTo(x - w / 2 + i, y - meia)
    g.lineTo(x - w / 2 + i - h, y + meia)
    g.stroke()
  }
  g.globalAlpha = 1

  // a diagonal que separa as duas metades — e ela que faz a carta "virar"
  g.strokeStyle = 'rgba(32,36,44,0.34)'
  g.lineWidth = Math.max(1, w * 0.009)
  g.beginPath()
  g.moveTo(x - w / 2, y + meia)
  g.lineTo(x + w / 2, y - meia)
  g.stroke()

  const busto = (dir) => {
    g.save()
    g.translate(x, y)
    g.scale(1, dir)
    g.translate(0, -meia * FIG_ANCORA)
    const s = w * FIG_S
    const traco = Math.max(1.1, s * 0.036)
    g.lineJoin = 'round'
    g.lineCap = 'round'

    adereco(g, letra, s, corNaipe)

    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco

    // --- manto ---------------------------------------------------------
    // Ele abre ate 1.16 s na barra e nao 1.00: com s menor (ver a conta
    // vertical), 1.00 deixava uma tira de painel vazia dos dois lados e a
    // figura voltava a ler como selo pequeno num quadro grande. 1.16 s e
    // exatamente a meia-largura do painel — o ombro ENCOSTA na moldura.
    const manto = new Path2D()
    manto.moveTo(-s * 1.16, s * 0.88)
    manto.bezierCurveTo(-s * 1.02, s * 0.34, -s * 0.60, s * 0.13, -s * 0.30, s * 0.10)
    manto.lineTo(s * 0.30, s * 0.10)
    manto.bezierCurveTo(s * 0.60, s * 0.13, s * 1.02, s * 0.34, s * 1.16, s * 0.88)
    manto.closePath()
    g.fillStyle = corManto
    g.fill(manto)
    g.save()
    g.clip(manto)
    g.strokeStyle = 'rgba(0,0,0,0.24)'
    g.lineWidth = Math.max(1, s * 0.030)
    for (let i = -1.8; i <= 2.6; i += 0.150) {
      g.beginPath()
      g.moveTo(i * s, s * 1.1)
      g.lineTo(i * s + s * 1.3, -s * 0.2)
      g.stroke()
    }
    g.restore()
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco
    g.stroke(manto)

    // --- peitilho, com o naipe no peito --------------------------------
    // Ele encolheu (0.32 -> 0.19 de meia-largura) e DESCEU pra comecar embaixo
    // da gola. As duas coisas pelo mesmo motivo: sao as duas unicas pecas
    // claras do busto, e encostadas elas viravam uma mancha branca so — o V
    // deixava de ler como abertura de gola e o conjunto ficava com cara de
    // babador. Separados por um dedo de manto colorido, cada um volta a ser
    // uma peca de roupa.
    const peito = new Path2D()
    peito.moveTo(-s * 0.19, s * 0.30)
    peito.lineTo(0, s * 0.82)
    peito.lineTo(s * 0.19, s * 0.30)
    peito.closePath()
    g.fillStyle = FIG_CLARO
    g.fill(peito); g.stroke(peito)
    g.fillStyle = corNaipe
    naipe(g, n, 0, s * 0.50, s * 0.24, traco * 0.35)

    // --- gola de arminho ------------------------------------------------
    // A faixa sobre os ombros que substituiu o rufo (causa 2 da nota da
    // funcao). Ela e desenhada DEPOIS do manto e ANTES da cabeca, que e a
    // ordem em que as tres camadas se encaixam num retrato.
    //
    // Ela e uma FAIXA e nao um capote, e passou por DUAS correcoes ate chegar
    // nisto. Na primeira ela ia do ombro ate 0.86 s: uma tigela branca ocupando
    // metade do painel, e trocar uma barba por uma tigela nao e progresso. Na
    // segunda ela ainda abria ate 0.98 s de largura, e o problema mudou de
    // forma sem sumir — as golas dos DOIS bustos espelhados encostavam uma na
    // outra no meio do painel e o par lia como uma faixa branca atravessando a
    // carta inteira. Uma peca que so fica errada quando espelhada e o tipo de
    // coisa que so a foto do atlas mostra.
    //
    // Agora ela para em 0.76 s — dentro da linha do ombro do manto, que vai a
    // 1.16 — entao sobra pano COLORIDO dos dois lados dela. E o colorido dos
    // ombros que separa as duas metades no meio do painel.
    const gola = new Path2D()
    gola.moveTo(-s * 0.76, s * 0.34)
    gola.bezierCurveTo(-s * 0.68, s * 0.22, -s * 0.50, s * 0.12, -s * 0.28, s * 0.10)
    gola.lineTo(s * 0.28, s * 0.10)
    gola.bezierCurveTo(s * 0.50, s * 0.12, s * 0.68, s * 0.22, s * 0.76, s * 0.34)
    gola.bezierCurveTo(s * 0.44, s * 0.22, -s * 0.44, s * 0.22, -s * 0.76, s * 0.34)
    gola.closePath()
    g.fillStyle = FIG_CLARO
    g.fill(gola)
    g.save()
    g.clip(gola)
    // as caudas pretas do arminho: dois tracinhos com um ponto embaixo. E o
    // desenho que faz um retalho branco virar pele, e ele funciona em 8 px
    // porque sao so quatro manchas escuras contra um campo claro.
    g.fillStyle = FIG_TINTA
    for (const [cx, cy] of [[-0.50, 0.155], [0.50, 0.155]]) {
      const t = new Path2D()
      t.moveTo(cx * s - s * 0.024, cy * s)
      t.lineTo(cx * s + s * 0.024, cy * s)
      t.lineTo(cx * s, cy * s + s * 0.075)
      t.closePath()
      g.fill(t)
      const d = new Path2D()
      d.arc(cx * s, cy * s + s * 0.112, s * 0.022, 0, TAU)
      g.fill(d)
    }
    g.restore()
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco
    g.stroke(gola)

    rosto(g, letra, s, traco)
    coroa(g, letra, s)
    g.restore()
  }

  busto(1)
  busto(-1)
  g.restore()   // solta o clip do painel

  // moldura dupla por cima de tudo, pra o busto que vazou ficar cortado limpo
  g.strokeStyle = FIG_TINTA
  g.lineWidth = Math.max(2, w * 0.022)
  g.stroke(painel)
  g.strokeStyle = corManto
  g.lineWidth = Math.max(1.2, w * 0.013)
  g.stroke(caminhoArredondado(x - w / 2 + w * 0.050, y - meia + w * 0.050,
    w - w * 0.100, h - w * 0.100, w * 0.035))
  g.restore()
}

/**
 * O PIQUE GRANDE do As de espadas.
 *
 * Costume de baralho, nao capricho: em todo baralho de banca o As de espadas e
 * a carta trabalhada — historicamente e nela que ia o selo do imposto. Aqui ela
 * ganha o pique grande com miolo vazado e um pedestal de volutas.
 *
 * O miolo vazado (marfim dentro do pique, e um pique pequeno de novo dentro do
 * marfim) resolve um problema alem do enfeite: um pique de 143 px chapado de
 * tinta e a maior mancha escura do baralho inteiro, e ela ficava pesada demais
 * ao lado das outras cartas. Vazado, o As pesa como as outras e ainda le como
 * "o As" de longe.
 *
 * NENHUMA MARCA: onde um fabricante poria o nome dele, aqui nao vai nada. O
 * lugar dele e o fleuron.
 */
function asDeEspadas(g, cx, cy) {
  const s = fy(0.40)
  const yc = cy - fy(0.022)

  // As VOLUTAS que ladeiam o pe do pique — a coisa mais parecida com arabesco
  // que todo As de espadas tem. Vao ANTES do pique: assim a ponta interna
  // delas fica escondida embaixo do talo e o encaixe nao precisa ser exato.
  //
  // (A primeira versao punha uma base curva e um cartucho embaixo do pique. Na
  // foto isso virou um bigode com uma pastilha flutuando: forma fechada e
  // simetrica embaixo de outra forma fechada e simetrica le como um segundo
  // objeto, nao como pedestal.)
  //
  // A SEGUNDA versao errou de outro jeito e vale anotar: as volutas nasciam em
  // 0.080 W do centro, que fica DENTRO do pe do pique (o pe abre ate 0.128 W).
  // Fundidas com o pe elas viravam uma barra preta atravessada. Agora elas
  // nascem em 0.140 W — encostadas no pe, fora dele — e sobem so ate 0.24 s, que
  // e abaixo dos lobos do pique. E assim que voluta le como voluta: ela tem que
  // ter ceu de um lado e a peca do outro.
  g.fillStyle = TINTA_PRETA
  for (const lado of [-1, 1]) {
    const v = new Path2D()
    v.moveTo(cx + lado * fx(0.140), yc + s * 0.485)
    v.bezierCurveTo(
      cx + lado * fx(0.292), yc + s * 0.455,
      cx + lado * fx(0.300), yc + s * 0.235,
      cx + lado * fx(0.203), yc + s * 0.255)
    v.bezierCurveTo(
      cx + lado * fx(0.252), yc + s * 0.300,
      cx + lado * fx(0.236), yc + s * 0.425,
      cx + lado * fx(0.140), yc + s * 0.485)
    v.closePath()
    g.fill(v)
  }

  g.fillStyle = TINTA_PRETA
  naipe(g, 0, cx, yc, s)
  g.fillStyle = MARFIM_ALTO
  naipe(g, 0, cx, yc + s * 0.014, s * 0.66)
  g.fillStyle = TINTA_PRETA
  naipe(g, 0, cx, yc + s * 0.018, s * 0.29)

  // fleuron: um losango entre dois pingos, na altura em que o pip da linha de
  // baixo estaria numa carta numerada — e o que fecha a composicao pra baixo
  g.fillStyle = TINTA_PRETA
  losango(g, cx, cy + fy(0.240), fy(0.058))
  for (const lado of [-1, 1]) {
    g.beginPath()
    g.arc(cx + lado * fx(0.072), cy + fy(0.240), fx(0.0135), 0, TAU)
    g.fill()
  }
}

/** Uma face inteira, desenhada dentro da celula (0,0)-(CEL_W,CEL_H). */
function desenharFace(g, r, n) {
  const info = NAIPES[n] || NAIPES[0]
  const tinta = info.vermelho ? TINTA_VERMELHA : TINTA_PRETA
  const W = CEL_W
  const H = CEL_H

  fundoDePapel(g)

  // Moldura de canto REDONDO, com o mesmo raio proporcional do corte da peca
  // (CANTO_R / CARTA_L = 8,1% da largura). Com moldura de canto reto o desenho
  // brigava com a silhueta arredondada da geometria e a carta lia como um
  // adesivo quadrado colado num cartao redondo.
  g.strokeStyle = 'rgba(32,36,44,0.14)'
  g.lineWidth = fx(0.011)
  g.stroke(caminhoArredondado(fx(0.036), fy(0.026), W - fx(0.072), H - fy(0.052),
    (CANTO_R / CARTA_L) * W * 0.80))

  const nome = nomeValor(r)
  const cantoX = fx(IDX_X)
  const cantoY = fy(IDX_Y)

  // --- indice nos DOIS cantos, o de baixo virado -------------------------
  //
  // O numero e CONDENSADO por transformacao e nao por fonte estreita: a lista
  // de fontes muda de maquina pra maquina (e o jogo vai pra Steam), entao
  // "Arial Narrow" nao e garantia de nada. Um scale(0.92, 1) da o mesmo aperto
  // em qualquer fonte que o sistema tiver. O '10' aperta mais, 0.82, porque e
  // o unico de dois digitos e e ele que decide o quanto o pip pode crescer.
  //
  // O CONTORNO DO NUMERO (strokeText na cor do fill) e o que carrega o indice
  // depois que o '10' proibiu crescer a fonte. Ele engorda cada haste em ~1,9 px
  // na celula — de 8 pra 10 — o que e +25% de tinta num traco que na mesa tem
  // pouco mais de um pixel. Sem ele, o indice media 63 de delta contra o papel
  // enquanto o pip media 147.
  const dois = nome.length > 1
  const traco = fy(IDX_TRACO)
  const indice = (dir) => {
    g.save()
    g.translate(W / 2, H / 2)
    g.scale(dir, dir)
    g.translate(-W / 2, -H / 2)
    g.fillStyle = tinta
    g.strokeStyle = tinta
    g.lineJoin = 'round'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.save()
    g.translate(cantoX, cantoY)
    g.scale(dois ? 0.82 : 0.92, 1)
    g.font = 'bold ' + fy(dois ? IDX_FONTE_2 : IDX_FONTE).toFixed(1) +
      'px "Trebuchet MS", "Segoe UI", Arial, sans-serif'
    g.lineWidth = traco
    g.strokeText(nome, 0, 0)
    g.fillText(nome, 0, 0)
    g.restore()
    naipe(g, n, cantoX, cantoY + fy(IDX_NAIPE_DY), fy(IDX_NAIPE), traco)
    g.restore()
  }
  indice(1)
  indice(-1)

  // --- miolo --------------------------------------------------------------
  const cx = W / 2
  const cy = H / 2
  if (r === 1 && n === 0) {
    asDeEspadas(g, cx, cy)
  } else if (r === 1) {
    // Os outros tres ases levam UM pip grande e um anel discreto atras — que e
    // o que baralho de verdade faz. So espadas e trabalhado.
    g.strokeStyle = 'rgba(32,36,44,0.10)'
    g.lineWidth = fx(0.018)
    g.beginPath()
    g.arc(cx, cy, fy(0.215), 0, TAU)
    g.stroke()
    g.fillStyle = tinta
    naipe(g, n, cx, cy, fy(0.335))
  } else if (r >= 11) {
    figura(g, nome, n, cx, cy, W * 0.62, H * 0.60,
      info.vermelho ? TINTA_VERMELHA : FIG_MANTO_PRETO, tinta)
  } else {
    const pontos = ARRANJO[r] || ARRANJO[2]
    const meiaX = fx(PIP_COL)
    const meiaY = fy(PIP_LIN)
    const lado = fy(PIP_ALT)
    g.fillStyle = tinta
    for (let i = 0; i < pontos.length; i++) {
      const px = cx + pontos[i][0] * meiaX
      const py = cy + pontos[i][1] * meiaY
      // simbolo da metade de baixo entra virado, como na carta de verdade
      if (pontos[i][1] > 0.001) {
        g.save()
        g.translate(px, py)
        g.rotate(Math.PI)
        naipe(g, n, 0, 0, lado)
        g.restore()
      } else {
        naipe(g, n, px, py, lado)
      }
    }
  }
}

/**
 * O VERSO. Trelica dupla sobre campo escuro, aro dourado e roseta central.
 *
 * Ele tambem cresceu na tela junto com a face (a carta tapada do ricaco fica
 * deitada, mas o baralho, o descarte e a mao dele no comeco sao verso puro), e
 * a trelica de UMA familia de retas a 45 graus lia como listra quando a carta
 * ficou grande. Duas familias com passos diferentes (17 e 25) nunca coincidem
 * na mesma celula e o olho le TECIDO, que e o que se quer.
 *
 * A roseta substituiu uma estrela solta num quadrado. Anel + dentes radiais +
 * estrela e o desenho que todo verso de baralho tem no meio, e ele existe por
 * um motivo pratico: e uma forma que continua sendo "um selo" quando encolhe
 * pra 12 px, enquanto uma estrela sozinha vira um borrao com pontas.
 */
function desenharVerso(g, campo, campo2, aro) {
  const W = CEL_W
  const H = CEL_H

  fundoDePapel(g)

  const m = fx(0.047)
  const campoP = caminhoArredondado(m, m, W - m * 2, H - m * 2, fx(0.055))
  const gr = g.createLinearGradient(0, 0, W, H)
  gr.addColorStop(0, campo)
  gr.addColorStop(1, campo2)
  g.fillStyle = gr
  g.fill(campoP)

  g.save()
  g.clip(campoP)

  // duas familias de retas a 45 graus, com passos primos entre si
  g.strokeStyle = 'rgba(255,255,255,0.13)'
  g.lineWidth = fx(0.0075)
  for (let i = -H; i < W + H; i += fx(0.066)) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke()
  }
  g.strokeStyle = 'rgba(0,0,0,0.16)'
  g.lineWidth = fx(0.0055)
  for (let i = -H; i < W + H; i += fx(0.098)) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke()
  }
  // pontinhos no cruzamento: e o que separa "listrado" de "trabalhado"
  g.fillStyle = 'rgba(255,255,255,0.20)'
  const passo = fx(0.133)
  for (let y = m; y < H - m; y += passo) {
    for (let x = m + ((Math.round(y / passo)) % 2) * passo * 0.5; x < W - m; x += passo) {
      g.beginPath(); g.arc(x, y, fx(0.0094), 0, TAU); g.fill()
    }
  }

  // leques nos quatro cantos: quebram o campo uniforme sem competir com o selo
  g.strokeStyle = 'rgba(255,255,255,0.16)'
  g.lineWidth = fx(0.0075)
  for (const qx of [0, 1]) {
    for (const qy of [0, 1]) {
      const ox = qx ? W - m : m
      const oy = qy ? H - m : m
      for (let k = 1; k <= 3; k++) {
        g.beginPath()
        g.arc(ox, oy, fx(0.055) * k, 0, TAU)
        g.stroke()
      }
    }
  }
  g.restore()

  // aro dourado duplo, acompanhando o canto redondo
  g.strokeStyle = aro
  g.lineWidth = fx(0.0156)
  g.stroke(caminhoArredondado(m + fx(0.023), m + fx(0.023),
    W - (m + fx(0.023)) * 2, H - (m + fx(0.023)) * 2, fx(0.043)))
  g.lineWidth = fx(0.0059)
  g.stroke(caminhoArredondado(m + fx(0.051), m + fx(0.051),
    W - (m + fx(0.051)) * 2, H - (m + fx(0.051)) * 2, fx(0.035)))

  // --- a roseta -----------------------------------------------------------
  const R = fy(0.135)
  g.save()
  g.translate(W / 2, H / 2)

  // losango escuro por tras, como na versao anterior: e ele que separa o selo
  // da trelica sem precisar de um contorno grosso
  g.save()
  g.rotate(Math.PI / 4)
  g.fillStyle = 'rgba(0,0,0,0.34)'
  const lado = R * 1.62
  g.fillRect(-lado / 2, -lado / 2, lado, lado)
  g.strokeStyle = aro
  g.lineWidth = fx(0.0117)
  g.strokeRect(-lado / 2, -lado / 2, lado, lado)
  g.restore()

  g.strokeStyle = aro
  g.lineWidth = fx(0.0078)
  g.beginPath(); g.arc(0, 0, R * 0.94, 0, TAU); g.stroke()
  g.lineWidth = fx(0.0047)
  g.beginPath(); g.arc(0, 0, R * 0.58, 0, TAU); g.stroke()
  g.lineWidth = fx(0.0086)
  for (let i = 0; i < 20; i++) {
    const a = (i * TAU) / 20
    g.beginPath()
    g.moveTo(Math.cos(a) * R * 0.64, Math.sin(a) * R * 0.64)
    g.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88)
    g.stroke()
  }
  g.fillStyle = aro
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 === 0 ? R * 0.52 : R * 0.21
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = Math.cos(a) * raio
    const py = Math.sin(a) * raio
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py)
  }
  g.closePath()
  g.fill()
  g.restore()
}

// ---------------------------------------------------------------------------
// A geometria: contorno arredondado, tampa, fundo e a fita da lateral.
//
// Feita na mao e nao com ExtrudeGeometry por causa do uv: o gerador padrao do
// extrude escreve o uv da tampa a partir da posicao em METROS, e a lateral
// entra no mesmo mapa. Aqui a tampa recebe o uv normalizado da carta (0..1) e a
// lateral aponta pro retalho de marfim liso do atlas — o que permite atlas,
// material unico e troca de carta reescrevendo so a tampa.
// ---------------------------------------------------------------------------

function contorno() {
  const pts = []
  const hx = CARTA_L / 2 - CANTO_R
  const hz = CARTA_C / 2 - CANTO_R
  const cantos = [[hx, hz, 0], [-hx, hz, Math.PI / 2], [-hx, -hz, Math.PI], [hx, -hz, -Math.PI / 2]]
  for (let c = 0; c < 4; c++) {
    const [cx, cz, a0] = cantos[c]
    for (let i = 0; i <= CANTO_SEG; i++) {
      const a = a0 + (i / CANTO_SEG) * (Math.PI / 2)
      pts.push(cx + Math.cos(a) * CANTO_R, cz + Math.sin(a) * CANTO_R)
    }
  }
  return pts
}

/** Modelo compartilhado: buffers que TODA carta usa sem copiar. */
function montarModelo() {
  const c = contorno()
  const n = c.length / 2
  const ey = CARTA_E / 2

  const pos = []
  const nor = []
  const uv = []
  const idx = []

  // A ORDEM DOS INDICES ABAIXO NAO E ESCOLHA DE ESTILO, E O QUE DECIDE PRA QUE
  // LADO A CARA DA CARTA OLHA.
  //
  // O contorno sai de contorno() em sentido ANTI-HORARIO quando se olha o plano
  // XZ com o +Z pra cima — que, visto DE CIMA (a camera na mesa olhando pra
  // baixo), e sentido HORARIO. Fechar o leque da tampa na ordem natural
  // (0, i, i+1) produz triangulos com a normal GEOMETRICA apontando pra -Y, e o
  // three descarta face de costas: a tampa some e quem aparece de cima e o
  // FUNDO. O sintoma nao e um buraco na carta — e a carta inteira mostrando o
  // VERSO com a face virada pra cima, que le como "a carta nao virou".
  //
  // A armadilha e velha neste projeto (PERSONAGEM.md, defeito 2) e ela engana
  // porque o atributo `normal` esta certo: a iluminacao fica boa, so a peca
  // aparece do lado errado. Escrever a normal a mao NAO conserta winding.

  // 0) centro da tampa (a FACE, olhando pra +Y)
  pos.push(0, ey, 0); nor.push(0, 1, 0); uv.push(0.5, 0.5)
  // 1..n) aro da tampa
  for (let i = 0; i < n; i++) {
    const x = c[i * 2], z = c[i * 2 + 1]
    pos.push(x, ey, z); nor.push(0, 1, 0)
    uv.push(0.5 - x / CARTA_L, 0.5 + z / CARTA_C)
  }
  for (let i = 0; i < n; i++) idx.push(0, 1 + ((i + 1) % n), 1 + i)

  // centro e aro do fundo (o VERSO, olhando pra -Y). O u NAO inverte de sinal
  // aqui: o fundo so e visto depois de a carta girar PI em Z, e esse giro ja
  // espelha o X.
  const b0 = pos.length / 3
  pos.push(0, -ey, 0); nor.push(0, -1, 0); uv.push(0.5, 0.5)
  for (let i = 0; i < n; i++) {
    const x = c[i * 2], z = c[i * 2 + 1]
    pos.push(x, -ey, z); nor.push(0, -1, 0)
    uv.push(0.5 + x / CARTA_L, 0.5 + z / CARTA_C)
  }
  for (let i = 0; i < n; i++) idx.push(b0, b0 + 1 + i, b0 + 1 + ((i + 1) % n))

  // fita da lateral: dois aros com a normal saindo do contorno
  const s0 = pos.length / 3
  for (let i = 0; i < n; i++) {
    const x = c[i * 2], z = c[i * 2 + 1]
    const l = Math.hypot(x, z) || 1
    const nx = x / l, nz = z / l
    pos.push(x, ey, z); nor.push(nx, 0, nz); uv.push(0.5, 0.5)
    pos.push(x, -ey, z); nor.push(nx, 0, nz); uv.push(0.5, 0.5)
  }
  for (let i = 0; i < n; i++) {
    const a = s0 + i * 2
    const b = s0 + ((i + 1) % n) * 2
    idx.push(a, b, a + 1)
    idx.push(b, b + 1, a + 1)
  }

  return {
    posicao: new THREE.BufferAttribute(new Float32Array(pos), 3),
    normal: new THREE.BufferAttribute(new Float32Array(nor), 3),
    indice: new THREE.BufferAttribute(new Uint16Array(idx), 1),
    uvBase: new Float32Array(uv),
    nAro: n,
    // A tampa ocupa [0, n] no array de uv; o fundo [n+1, 2n+1]; a lateral o
    // resto. Guardar as faixas evita recalcular indice em toda troca de carta.
    tampa: { ini: 0, fim: n },
    fundo: { ini: n + 1, fim: 2 * n + 1 },
    lateral: { ini: 2 * n + 2, fim: 4 * n + 1 },
  }
}

let _modelo = null
function modelo() {
  if (!_modelo) _modelo = montarModelo()
  return _modelo
}

// ---------------------------------------------------------------------------
// A FABRICA
// ---------------------------------------------------------------------------

let _cache = null

/**
 * O baralho 3D: um atlas, um material, e cartas que compartilham geometria.
 *
 * Construido UMA vez por sessao e guardado num cache de modulo — as duas mesas
 * (blackjack e poker) usam o MESMO material, entao abrir a segunda mesa nao
 * paga o desenho das 52 cartas de novo. O verso azul do poker sai da mesma
 * textura, e por isso ele e uma celula do atlas e nao uma segunda imagem.
 */
export function criarBaralho3D() {
  if (_cache) return _cache

  const cv = document.createElement('canvas')
  cv.width = COLS * CEL_W
  cv.height = LINS * CEL_H
  const g = cv.getContext('2d')

  // fundo do atlas: marfim. As celulas nao usadas viram retalho liso, que e
  // exatamente o que a lateral da carta quer.
  g.fillStyle = MARFIM
  g.fillRect(0, 0, cv.width, cv.height)

  for (let cel = 0; cel < 52; cel++) {
    const n = Math.floor(cel / 13)
    const r = (cel % 13) + 1
    g.save()
    g.translate((cel % COLS) * CEL_W, Math.floor(cel / COLS) * CEL_H)
    g.beginPath(); g.rect(0, 0, CEL_W, CEL_H); g.clip()
    desenharFace(g, r, n)
    g.restore()
  }

  g.save()
  g.translate((CEL_VERSO % COLS) * CEL_W, Math.floor(CEL_VERSO / COLS) * CEL_H)
  g.beginPath(); g.rect(0, 0, CEL_W, CEL_H); g.clip()
  desenharVerso(g, '#8e1b31', '#4d0d1c', '#e6c377')
  g.restore()

  g.save()
  g.translate((CEL_VERSO_AZUL % COLS) * CEL_W, Math.floor(CEL_VERSO_AZUL / COLS) * CEL_H)
  g.beginPath(); g.rect(0, 0, CEL_W, CEL_H); g.clip()
  desenharVerso(g, '#1c3f74', '#0c1c38', '#d9c48a')
  g.restore()

  // o retalho liso da lateral: marfim com um fio de sombra, pra a espessura da
  // carta nao ficar chapada quando a carta esta de lado no meio do giro
  g.save()
  g.translate((CEL_MARFIM % COLS) * CEL_W, Math.floor(CEL_MARFIM / COLS) * CEL_H)
  g.fillStyle = MARFIM
  g.fillRect(0, 0, CEL_W, CEL_H)
  g.fillStyle = MARFIM_SOMBRA
  g.fillRect(0, CEL_H * 0.5, CEL_W, CEL_H * 0.5)
  g.restore()

  const textura = new THREE.CanvasTexture(cv)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 8
  textura.generateMipmaps = true
  textura.minFilter = THREE.LinearMipmapLinearFilter
  textura.magFilter = THREE.LinearFilter
  textura.needsUpdate = true

  // Material UNICO do baralho. Nao vem de materials.js porque ele e dono de uma
  // textura propria e de nada mais: por o atlas no cache global daquele arquivo
  // so faria a chave crescer sem ninguem nunca reaproveitar.
  //
  // roughness 0.78 e nao 0.62 por HONESTIDADE DE MATERIAL, e nao pra consertar
  // brilho — e vale registrar isso porque foi a primeira suspeita e ela estava
  // ERRADA. Medido com material.color preto (o que zera o difuso e deixa so o
  // especular) na carta escorada da mesa de poker:
  //     roughness 0.62 -> especular ~0.032    roughness 1.00 -> 0.015
  // contra 0.61 de carta inteira. Ou seja: o especular vale de 2% a 5% do que a
  // carta devolve, e mexer nele nao muda nada no bloom. Quem estourava era o
  // ALBEDO. 0.78 fica porque carta de baralho e acetinada e nao envernizada, e
  // porque 0.62 e o unico numero deste arquivo que nunca teve justificativa.
  //
  // envMapIntensity nao faz nada HOJE (esta cena nao tem environment map), e
  // esta aqui como trava: no dia em que alguem por um env map no salao, a carta
  // nao vai voltar a estourar sozinha.
  const material = new THREE.MeshStandardMaterial({
    map: textura,
    color: BRILHO_CARTA,
    roughness: 0.78,
    metalness: 0.0,
    envMapIntensity: 0.35,
  })

  const md = modelo()

  /** Retangulo uv da celula, ja com o recuo de meio texel. */
  function celula(i) {
    const cx = (i % COLS) * CEL_W
    const cy = Math.floor(i / COLS) * CEL_H
    return {
      u0: (cx + PAD_UV) / cv.width,
      u1: (cx + CEL_W - PAD_UV) / cv.width,
      // v cresce de baixo pra cima na textura (flipY do CanvasTexture ja
      // inverte a imagem), entao a linha 0 do canvas e a de v mais alto.
      v0: 1 - (cy + CEL_H - PAD_UV) / cv.height,
      v1: 1 - (cy + PAD_UV) / cv.height,
    }
  }

  const UV_VERSO = celula(CEL_VERSO)
  const UV_VERSO_AZUL = celula(CEL_VERSO_AZUL)
  const UV_MARFIM = celula(CEL_MARFIM)

  /** Escreve a faixa 'faixa' do uv apontando pro retangulo da celula. */
  function pintarFaixa(arr, faixa, cel) {
    const du = cel.u1 - cel.u0
    const dv = cel.v1 - cel.v0
    for (let i = faixa.ini; i <= faixa.fim; i++) {
      arr[i * 2] = cel.u0 + md.uvBase[i * 2] * du
      arr[i * 2 + 1] = cel.v0 + md.uvBase[i * 2 + 1] * dv
    }
  }

  /**
   * Uma carta nova. 'verso' escolhe o desenho do dorso (0 = bordo do blackjack,
   * 1 = azul do poker) — e so isso que separa o baralho de uma mesa do da
   * outra, porque as faces sao as mesmas 52 nas duas.
   */
  function novaCarta(versoAzul) {
    const geo = new THREE.BufferGeometry()
    // Os TRES buffers pesados sao os mesmos objetos pra toda carta: um upload
    // so pra placa de video, independente de quantas cartas a mesa tenha.
    geo.setAttribute('position', md.posicao)
    geo.setAttribute('normal', md.normal)
    geo.setIndex(md.indice)
    const uv = new Float32Array(md.uvBase.length)
    const attr = new THREE.BufferAttribute(uv, 2)
    attr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('uv', attr)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), CARTA_C * 0.6)

    pintarFaixa(uv, md.fundo, versoAzul ? UV_VERSO_AZUL : UV_VERSO)
    pintarFaixa(uv, md.lateral, UV_MARFIM)
    pintarFaixa(uv, md.tampa, UV_MARFIM)

    const mesh = new THREE.Mesh(geo, material)
    mesh.castShadow = false      // a sombra da carta e um borrao no feltro, nao
    mesh.receiveShadow = true    // shadow map: ver mesa-3d.js
    mesh.frustumCulled = false   // a mesa e pequena e a carta voa: cortar aqui
                                 // so gera pisca-pisca na borda da tela
    mesh.userData.uv = uv
    mesh.userData.attr = attr
    return mesh
  }

  /**
   * Troca a FACE de uma carta ja criada. carta = { r, n } ou null pra deixar a
   * face lisa (carta que ninguem vai ver de frente).
   */
  function definirFace(mesh, carta) {
    const uv = mesh.userData.uv
    if (!uv) return
    let cel = UV_MARFIM
    if (carta && carta.r >= 1 && carta.r <= 13 && carta.n >= 0 && carta.n <= 3) {
      cel = celula(carta.n * 13 + (carta.r - 1))
    }
    pintarFaixa(uv, md.tampa, cel)
    mesh.userData.attr.needsUpdate = true
  }

  _cache = {
    material,
    textura,
    novaCarta,
    definirFace,
    LARGURA: CARTA_L,
    COMPRIMENTO: CARTA_C,
    ESPESSURA: CARTA_E,
  }
  return _cache
}

export default criarBaralho3D
