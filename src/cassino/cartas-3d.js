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
// Entao o corte vem em DOIS passos, os dois no lado da carta:
//   a) o ATLAS pinta ALBEDO honesto (marfim de cartao, nao branco de monitor);
//   b) 'material.color' e um TRIM de exposicao explicito, medido contra a luz
//      que existe hoje no salao — ver BRILHO_CARTA la embaixo.
// Separar assim tem uma razao pratica: quem for olhar o atlas ve o desenho como
// ele foi feito, e quem for mexer na luz da mesa mexe num numero so.
//
// MEDIDO DEPOIS, mesma carta e mesmo enquadramento:
//     poker, carta escorada .... max 0.60 e 0.64   0% acima de 0.85
//     blackjack ................ max 0.52 e 0.54   0% acima de 0.85
//
// E ela NAO ficou cinza, que era a outra metade do pedido: a mesma ferramenta
// le a cor final na tela, depois do ACES e do bloom e do grade, e a carta sai
// em RGB 220..229 / 198..211 / 168..184. O ACES comprime tanto no topo que
// derrubar a luminancia linear pela metade custou menos de 10 niveis em 255 —
// perdeu o halo, nao perdeu o papel. Escurecer nao era o pedido.
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

// --- as tintas -------------------------------------------------------------
//
// Estes valores sao ALBEDO: quanto o papel devolve da luz que chega, nao como
// a carta aparece na tela. Quem faz a carta parecer branca e o tone mapping do
// engine, e ele comprime muito no topo — ver a nota do brilho no cabecalho.
//
// O vermelho NAO e 0xff0000: carmim puro estoura no tone mapping e o naipe
// vira um borrao saturado sem forma. E a preta nao e 0x000000 — tinta de
// impressao reflete uns 8%, e preto absoluto no meio de marfim serrilha feio
// quando o mipmap comeca a misturar os dois.
// O degrade do papel e ESTREITO de proposito. A primeira tentativa ia de
// #f4efe2 a #e0d8c3 e, com a vinheta por cima, a carta na mesa lia CAQUI — o
// pico ficava certo mas a mediana despencava pra 0.46 e o dono nao pediu carta
// suja, pediu carta sem halo. Marfim de cartao varia pouco: 6% entre o canto
// mais claro e o mais escuro e o que da volume sem sujar.
const TINTA_PRETA = '#20242c'
const TINTA_VERMELHA = '#b32338'
const MARFIM = '#f0ebde'          // o marfim de referencia (bordas e retalho)
const MARFIM_ALTO = '#f5f0e4'     // canto claro do degrade do papel
const MARFIM_BAIXO = '#e9e2d0'    // canto escuro
const MARFIM_SOMBRA = '#d2c9b2'   // a fita da lateral, um tom abaixo

// TRIM DE EXPOSICAO DA CARTA — o segundo dos dois passos descritos no
// cabecalho. Multiplica o atlas inteiro (faces, versos e a fita da lateral).
//
// Como este numero foi achado, pra ninguem chutar de novo. 0xc1c5c4 vale 0.55
// de luminancia LINEAR, e ele multiplica tudo: a carta escorada da mesa de
// poker mede 0.64 com ele, logo mediria 0.64/0.55 = 1.17 sem ele. O alvo era
// ficar CONFORTAVELMENTE abaixo do 0.85 do bloom, e 0.64 deixa 25% de folga.
//
// O PIOR CASO nao e a carta escorada, e a carta DEITADA — a face olhando pro
// teto pega a PointLight de frente. Medida a 1/5 da subida, ela da 1.076 vez a
// escorada, ou seja ~0.69: 19% de folga. Foi por isso que o trim parou aqui em
// vez de subir mais: com a carta mais clara, o instante em que ela pousa e
// ainda nao levantou voltaria a estourar, e esse instante acontece toda mao.
//
// Nao e cinza neutro: c1/c5/c4 puxa pro FRIO, e isso e compensacao de luz. As
// duas PointLight do salao sao 0xffd2a0 — em linear o azul delas vale 0.36 do
// vermelho — e sem o trim frio a carta saia cor de manteiga. Ele nao neutraliza
// o ambar (nem deve: a carta esta num salao ambar), so tira o excesso.
//
// SE A LUZ DA MESA MUDAR: rode `node tools/shot-cartas.mjs poker` e leia o
// 'max'. Ele escala linear com este numero — se der 0.40, da pra subir o trim
// por 0.75/0.40 e recuperar papel; se der 1.0, desce na mesma proporcao.
const BRILHO_CARTA = 0xc1c5c4

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

function pique(g, x, y, s) {
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
  g.fill()
}

function coracao(g, x, y, s) {
  const w = 0.47 * s
  const h = 0.50 * s
  g.beginPath()
  g.moveTo(x, y + h)
  g.bezierCurveTo(x - w * 0.32, y + h * 0.58, x - w, y + h * 0.04, x - w, y - h * 0.36)
  g.bezierCurveTo(x - w, y - h * 1.06, x - w * 0.30, y - h * 1.02, x, y - h * 0.34)
  g.bezierCurveTo(x + w * 0.30, y - h * 1.02, x + w, y - h * 1.06, x + w, y - h * 0.36)
  g.bezierCurveTo(x + w, y + h * 0.04, x + w * 0.32, y + h * 0.58, x, y + h)
  g.closePath()
  g.fill()
}

function losango(g, x, y, s) {
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
  g.fill()
}

function trevo(g, x, y, s) {
  const r = 0.192 * s
  // tres discos: um em cima e dois embaixo, encostados o suficiente pra o vao
  // entre eles fechar sozinho quando o mipmap comeca a misturar
  g.beginPath(); g.arc(x, y - 0.235 * s, r, 0, TAU); g.fill()
  g.beginPath(); g.arc(x - 0.238 * s, y + 0.105 * s, r, 0, TAU); g.fill()
  g.beginPath(); g.arc(x + 0.238 * s, y + 0.105 * s, r, 0, TAU); g.fill()
  g.beginPath()
  g.moveTo(x - 0.052 * s, y + 0.02 * s)
  g.bezierCurveTo(x - 0.062 * s, y + 0.26 * s, x - 0.16 * s, y + 0.42 * s, x - 0.215 * s, y + 0.50 * s)
  g.lineTo(x + 0.215 * s, y + 0.50 * s)
  g.bezierCurveTo(x + 0.16 * s, y + 0.42 * s, x + 0.062 * s, y + 0.26 * s, x + 0.052 * s, y + 0.02 * s)
  g.closePath()
  g.fill()
}

const DESENHO_NAIPE = [pique, coracao, losango, trevo]

/** Desenha o naipe 'n' em (x,y) com ALTURA 's'. Ordem = a de baralho.js. */
function naipe(g, n, x, y, s) {
  const f = DESENHO_NAIPE[n] || pique
  f(g, x, y, s)
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
// Com os numeros abaixo, na regua de 256 x 358:
//     '10' do indice ..... x  6..44     pip da coluna .... x 49..84
//     naipe do canto ..... x 15..36     rua entre eles ... 13 px (5% da carta)
const IDX_X = 0.098          // centro do indice, em fracao da largura
const IDX_Y = 0.088          // centro do numero, em fracao da altura
const IDX_FONTE = 0.134      // corpo da fonte pra 1 digito
const IDX_FONTE_2 = 0.117    // ... e pra '10'
const IDX_NAIPE = 0.068      // altura do naipe do canto
const IDX_NAIPE_DY = 0.100   // quanto ele fica abaixo do numero
const PIP_COL = 0.240        // afastamento das colunas laterais (fracao de W)
const PIP_LIN = 0.283        // afastamento das linhas (fracao de H)
const PIP_ALT = 0.108        // altura do pip (fracao de H)

// Tons da figura. O manto vem do NAIPE (vermelho ou azul-ardosia), mas o
// contorno, a pele, o cabelo e o adorno tem cor propria — e essa separacao e o
// que faz a figura ler. A primeira versao pintava tudo na cor do naipe e, num Q
// de ouros a 20 cm de distancia, o resultado era uma mancha vermelha sem forma:
// vermelho sobre marfim tem contraste baixo demais pra carregar desenho
// sozinho. Contorno escuro sempre; cor so no manto, no cabelo e no adorno.
const FIG_TINTA = '#20242c'
const FIG_CLARO = '#f1ecde'
const FIG_PELE = '#dcb694'
const FIG_OURO = '#c39b3d'
const FIG_ACO = '#8e99a5'
const FIG_CABELO = '#4b3524'
const FIG_HASTE = '#6d4c2e'
const FIG_MANTO_PRETO = '#36455c'

/**
 * O ADERECO — o que a figura segura. Desenhado ANTES do manto de proposito:
 * assim ele nasce por tras do ombro, como na carta de verdade, em vez de flutuar
 * grudado na frente do peito.
 *
 * Existe porque foi ele que fez a figura parar de ser um boneco. A silhueta de
 * um busto com cabeca redonda e ombros e a mesma pra J, Q e K — so o chapeu
 * mudava, e chapeu tem 8 px na tela. Uma diagonal comprida saindo do ombro,
 * essa o olho pega de longe: espada e rei, flor e dama, alabarda e valete.
 */
function adereco(g, letra, s, corNaipe) {
  const traco = Math.max(1.1, s * 0.036)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco

  if (letra === 'K') {
    // espada: lamina reta com ponta, guarda dourada e punho curto
    g.save()
    g.translate(s * 0.70, s * 0.10)
    g.rotate(0.16)
    const lam = new Path2D()
    lam.moveTo(0, -s * 1.00)
    lam.lineTo(s * 0.055, -s * 0.88)
    lam.lineTo(s * 0.055, s * 0.16)
    lam.lineTo(-s * 0.055, s * 0.16)
    lam.lineTo(-s * 0.055, -s * 0.88)
    lam.closePath()
    g.fillStyle = FIG_ACO
    g.fill(lam); g.stroke(lam)
    const guarda = new Path2D()
    guarda.rect(-s * 0.20, s * 0.16, s * 0.40, s * 0.085)
    g.fillStyle = FIG_OURO
    g.fill(guarda); g.stroke(guarda)
    const punho = new Path2D()
    punho.rect(-s * 0.055, s * 0.245, s * 0.11, s * 0.24)
    g.fill(punho); g.stroke(punho)
    g.restore()
    return
  }

  if (letra === 'Q') {
    // flor: haste curva e uma roseta de cinco petalas.
    //
    // A petala e VERMELHA so nos naipes vermelhos. Nos pretos ela sai dourada,
    // e nao preta: uma roseta de tinta preta no canto do painel virava um borrao
    // escuro do tamanho da cabeca da dama — na foto do atlas a Q de paus lia
    // como se ela tivesse duas cabecas.
    const petala = corNaipe === TINTA_VERMELHA ? corNaipe : FIG_OURO
    g.strokeStyle = '#4d6b3c'
    g.lineWidth = traco * 1.1
    g.beginPath()
    g.moveTo(s * 0.46, s * 0.54)
    g.quadraticCurveTo(s * 0.76, s * 0.04, s * 0.62, -s * 0.44)
    g.stroke()
    // uma folha na haste: sem ela a haste le como arame
    g.fillStyle = '#4d6b3c'
    g.beginPath()
    g.moveTo(s * 0.62, s * 0.08)
    g.quadraticCurveTo(s * 0.88, s * 0.00, s * 0.84, -s * 0.18)
    g.quadraticCurveTo(s * 0.68, -s * 0.14, s * 0.62, s * 0.08)
    g.fill()
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco
    g.fillStyle = petala
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * TAU) / 5
      const p = new Path2D()
      p.ellipse(s * 0.62 + Math.cos(a) * s * 0.155, -s * 0.50 + Math.sin(a) * s * 0.155,
        s * 0.12, s * 0.092, a, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    const miolo = new Path2D()
    miolo.arc(s * 0.62, -s * 0.50, s * 0.088, 0, TAU)
    g.fillStyle = petala === FIG_OURO ? '#8d6a20' : FIG_OURO
    g.fill(miolo); g.stroke(miolo)
    return
  }

  // J: alabarda — haste comprida e uma lamina em folha na ponta. Ela fica toda
  // DENTRO do painel: a primeira versao punha a lamina em s*1.06 e o clip do
  // painel cortava a ponta, o que lia como um risco solto no canto e nao como
  // uma arma.
  g.strokeStyle = FIG_HASTE
  g.lineWidth = s * 0.072
  g.beginPath()
  g.moveTo(s * 0.42, s * 0.74)
  g.lineTo(s * 0.70, -s * 0.56)
  g.stroke()
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
  const folha = new Path2D()
  folha.moveTo(s * 0.74, -s * 0.94)
  folha.quadraticCurveTo(s * 0.92, -s * 0.72, s * 0.77, -s * 0.46)
  folha.quadraticCurveTo(s * 0.60, -s * 0.66, s * 0.74, -s * 0.94)
  g.fillStyle = FIG_ACO
  g.fill(folha); g.stroke(folha)
}

/** O adorno de cabeca, por posto. Vai por ULTIMO, por cima do cabelo. */
function coroa(g, letra, s) {
  const traco = Math.max(1.1, s * 0.036)
  g.strokeStyle = FIG_TINTA
  g.lineWidth = traco
  g.fillStyle = FIG_OURO

  if (letra === 'K') {
    const c = new Path2D()
    c.moveTo(-s * 0.42, -s * 0.50)
    c.lineTo(-s * 0.46, -s * 0.92)
    c.lineTo(-s * 0.22, -s * 0.68)
    c.lineTo(0, -s * 1.06)
    c.lineTo(s * 0.22, -s * 0.68)
    c.lineTo(s * 0.46, -s * 0.92)
    c.lineTo(s * 0.42, -s * 0.50)
    c.closePath()
    g.fill(c); g.stroke(c)
    // as tres perolas das pontas: e o que faz a coroa nao virar uma serra.
    // Ficam em 0.42 e nao 0.46 porque na foto, mais abertas, elas caiam na
    // altura da tempora e liam como ORELHA.
    g.fillStyle = FIG_CLARO
    for (const px of [-0.44, 0, 0.44]) {
      const p = new Path2D()
      p.arc(px * s, (px === 0 ? -1.13 : -0.98) * s, s * 0.062, 0, TAU)
      g.fill(p); g.stroke(p)
    }
    // aro da base, com uma pedra no meio
    const aro = new Path2D()
    aro.rect(-s * 0.44, -s * 0.54, s * 0.88, s * 0.13)
    g.fillStyle = FIG_OURO
    g.fill(aro); g.stroke(aro)
    const pedra = new Path2D()
    pedra.ellipse(0, -s * 0.475, s * 0.075, s * 0.055, 0, 0, TAU)
    g.fillStyle = '#a83a4c'
    g.fill(pedra); g.stroke(pedra)
    return
  }

  if (letra === 'Q') {
    // diadema: um arco baixo com tres pontas curtas, mais leve que a coroa do
    // rei — a diferenca entre os dois tem que ler no contorno, nao no detalhe
    const d = new Path2D()
    d.moveTo(-s * 0.40, -s * 0.48)
    d.quadraticCurveTo(-s * 0.30, -s * 0.80, -s * 0.20, -s * 0.58)
    d.quadraticCurveTo(-s * 0.10, -s * 0.92, 0, -s * 0.90)
    d.quadraticCurveTo(s * 0.10, -s * 0.92, s * 0.20, -s * 0.58)
    d.quadraticCurveTo(s * 0.30, -s * 0.80, s * 0.40, -s * 0.48)
    d.closePath()
    g.fill(d); g.stroke(d)
    const p = new Path2D()
    p.arc(0, -s * 0.94, s * 0.085, 0, TAU)
    g.fillStyle = FIG_CLARO
    g.fill(p); g.stroke(p)
    return
  }

  // J: barrete com aba e uma pena. A pena e o unico traco solto da figura e
  // por isso ela e comprida: e ela que da assimetria ao valete e o separa da
  // dama no canto do olho.
  const gorro = new Path2D()
  gorro.moveTo(-s * 0.38, -s * 0.50)
  gorro.quadraticCurveTo(-s * 0.36, -s * 0.90, 0, -s * 0.88)
  gorro.quadraticCurveTo(s * 0.36, -s * 0.90, s * 0.38, -s * 0.50)
  gorro.closePath()
  g.fillStyle = FIG_MANTO_PRETO
  g.fill(gorro); g.stroke(gorro)
  const aba = new Path2D()
  aba.rect(-s * 0.44, -s * 0.54, s * 0.88, s * 0.11)
  g.fillStyle = FIG_OURO
  g.fill(aba); g.stroke(aba)
  const pena = new Path2D()
  pena.moveTo(-s * 0.24, -s * 0.76)
  pena.quadraticCurveTo(-s * 0.92, -s * 1.08, -s * 0.82, -s * 0.42)
  pena.quadraticCurveTo(-s * 0.56, -s * 0.70, -s * 0.24, -s * 0.62)
  pena.closePath()
  g.fillStyle = FIG_CLARO
  g.fill(pena); g.stroke(pena)
}

/**
 * A FIGURA de J, Q e K.
 *
 * Nao ha ilustracao de corte francesa aqui, e nem podia haver: as figuras dos
 * baralhos de banca sao desenho de fabricante. O que se desenha e um painel
 * espelhado — a metade de cima e a de baixo iguais e viradas, como na carta de
 * verdade — com um busto: manto com trama, gola de rufo, cabelo, rosto com
 * sobrancelha e nariz, adorno por posto e um adereco na mao.
 *
 * O QUE MUDOU E POR QUE. A versao anterior era cabeca-ovo com dois pontos de
 * olho, gola em V e um chapeu; a 90 px de carta na tela ela lia como boneco de
 * neve. Tres coisas consertaram, em ordem de quanto renderam:
 *   1) o ADERECO (diagonal comprida saindo do ombro) — silhueta, que e a unica
 *      coisa que sobrevive a minificacao;
 *   2) o CABELO como massa escura em volta do rosto — sem ele o rosto era um
 *      oval claro no meio de marfim, sem contraste nenhum;
 *   3) a TRAMA do manto — bloco de cor chapado vira mancha quando encolhe.
 * Sobrancelha, nariz e boca so aparecem no zoom, e e por isso que eles vem por
 * ultimo na lista: sao o premio de quem chega perto, nao o que faz a carta ler.
 *
 * Tudo dentro do painel e RECORTADO nele: o busto e maior que a metade que ele
 * ocupa (e assim que corte francesa funciona, os dois se interpenetram no
 * meio), e sem o clip o manto vazava por cima do indice do canto.
 */
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
  g.strokeStyle = 'rgba(32,36,44,0.40)'
  g.lineWidth = Math.max(1.2, w * 0.011)
  g.beginPath()
  g.moveTo(x - w / 2, y + meia)
  g.lineTo(x + w / 2, y - meia)
  g.stroke()

  const busto = (dir) => {
    g.save()
    g.translate(x, y)
    g.scale(1, dir)
    // O busto ancora a 46% da meia-altura pra cima. Mais alto e a cabeca bate
    // na moldura; mais baixo e os dois mantos se cobrem no meio e o painel vira
    // uma faixa de cor so.
    g.translate(0, -meia * 0.46)
    // 0.52 e nao 0.50: o busto tem que ENCOSTAR na moldura pelos ombros. Com
    // 0.50 sobrava uma faixa de painel vazia dos dois lados e a figura lia como
    // um selo pequeno no meio de um quadro grande.
    const s = w * 0.52
    const traco = Math.max(1.1, s * 0.036)
    g.lineJoin = 'round'
    g.lineCap = 'round'

    adereco(g, letra, s, corNaipe)

    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco

    // manto
    const manto = new Path2D()
    manto.moveTo(-s * 1.00, s * 1.02)
    manto.bezierCurveTo(-s * 0.88, s * 0.32, -s * 0.54, s * 0.10, -s * 0.28, s * 0.08)
    manto.lineTo(s * 0.28, s * 0.08)
    manto.bezierCurveTo(s * 0.54, s * 0.10, s * 0.88, s * 0.32, s * 1.00, s * 1.02)
    manto.closePath()
    g.fillStyle = corManto
    g.fill(manto)
    g.save()
    g.clip(manto)
    g.strokeStyle = 'rgba(0,0,0,0.24)'
    g.lineWidth = Math.max(1, s * 0.030)
    for (let i = -1.6; i <= 2.4; i += 0.155) {
      g.beginPath()
      g.moveTo(i * s, s * 1.2)
      g.lineTo(i * s + s * 1.3, -s * 0.2)
      g.stroke()
    }
    g.restore()
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco
    g.stroke(manto)

    // peitilho claro em V + o naipe no peito: e o que amarra a figura ao naipe
    // sem pintar a figura inteira de vermelho
    const peito = new Path2D()
    peito.moveTo(-s * 0.32, s * 0.10)
    peito.lineTo(0, s * 0.76)
    peito.lineTo(s * 0.32, s * 0.10)
    peito.closePath()
    g.fillStyle = FIG_CLARO
    g.fill(peito); g.stroke(peito)
    g.fillStyle = corNaipe
    naipe(g, n, 0, s * 0.36, s * 0.30)

    // gola de rufo: cinco discos encostados na linha do ombro. Discos com
    // contorno se cruzando SAO o rufo — nao ha desenho especial pra isso.
    g.fillStyle = FIG_CLARO
    for (let i = -2; i <= 2; i++) {
      const d = new Path2D()
      d.arc(i * s * 0.165, s * 0.11, s * 0.118, 0, TAU)
      g.fill(d); g.stroke(d)
    }

    // cabelo por tras, rosto por cima: a massa escura em volta e o que da
    // contraste pro rosto num campo de marfim
    const cabelo = new Path2D()
    cabelo.ellipse(0, -s * 0.24, s * 0.375, s * 0.415, 0, 0, TAU)
    g.fillStyle = FIG_CABELO
    g.fill(cabelo); g.stroke(cabelo)

    const rosto = new Path2D()
    rosto.ellipse(0, -s * 0.19, s * 0.265, s * 0.325, 0, 0, TAU)
    g.fillStyle = FIG_PELE
    g.fill(rosto); g.stroke(rosto)

    // olhos, sobrancelha, nariz, boca
    g.fillStyle = FIG_TINTA
    for (const ox of [-0.105, 0.105]) {
      g.beginPath()
      g.ellipse(ox * s, -s * 0.245, s * 0.032, s * 0.042, 0, 0, TAU)
      g.fill()
    }
    g.lineWidth = traco * 0.85
    g.beginPath(); g.moveTo(-s * 0.175, -s * 0.335); g.lineTo(-s * 0.045, -s * 0.305); g.stroke()
    g.beginPath(); g.moveTo(s * 0.175, -s * 0.335); g.lineTo(s * 0.045, -s * 0.305); g.stroke()
    g.beginPath()
    g.moveTo(0, -s * 0.215)
    g.lineTo(-s * 0.02, -s * 0.115)
    g.lineTo(s * 0.045, -s * 0.100)
    g.stroke()
    g.beginPath(); g.moveTo(-s * 0.075, -s * 0.030); g.lineTo(s * 0.075, -s * 0.030); g.stroke()
    g.lineWidth = traco

    if (letra === 'K') {
      // barba: cobre a boca e desce ate a gola. E o unico jeito de o rei ler
      // como rei num rosto de 12 px — coroa sozinha se confunde com o diadema.
      const barba = new Path2D()
      barba.moveTo(-s * 0.255, -s * 0.155)
      barba.quadraticCurveTo(-s * 0.245, s * 0.20, 0, s * 0.24)
      barba.quadraticCurveTo(s * 0.245, s * 0.20, s * 0.255, -s * 0.155)
      barba.quadraticCurveTo(0, s * 0.03, -s * 0.255, -s * 0.155)
      barba.closePath()
      g.fillStyle = FIG_CABELO
      g.fill(barba); g.stroke(barba)
    } else if (letra === 'Q') {
      // duas mechas caindo dos lados: silhueta de dama
      for (const lado of [-1, 1]) {
        const m = new Path2D()
        m.moveTo(lado * s * 0.34, -s * 0.30)
        m.quadraticCurveTo(lado * s * 0.50, s * 0.02, lado * s * 0.34, s * 0.20)
        m.quadraticCurveTo(lado * s * 0.26, s * 0.00, lado * s * 0.26, -s * 0.26)
        m.closePath()
        g.fillStyle = FIG_CABELO
        g.fill(m); g.stroke(m)
      }
    }

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
  const dois = nome.length > 1
  const indice = (dir) => {
    g.save()
    g.translate(W / 2, H / 2)
    g.scale(dir, dir)
    g.translate(-W / 2, -H / 2)
    g.fillStyle = tinta
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.save()
    g.translate(cantoX, cantoY)
    g.scale(dois ? 0.82 : 0.92, 1)
    g.font = 'bold ' + fy(dois ? IDX_FONTE_2 : IDX_FONTE).toFixed(1) +
      'px "Trebuchet MS", "Segoe UI", Arial, sans-serif'
    g.fillText(nome, 0, 0)
    g.restore()
    naipe(g, n, cantoX, cantoY + fy(IDX_NAIPE_DY), fy(IDX_NAIPE))
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
