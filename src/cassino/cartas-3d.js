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
// 1) UM ATLAS, NAO 52 TEXTURAS. As 52 faces (mais o verso e um retalho de
//    marfim liso pra borda) sao desenhadas numa unica textura de 8 x 7 celulas.
//    Uma textura e um MATERIAL SO pro baralho inteiro: sem isso, cada carta na
//    mesa seria um material diferente e o forno de nada adiantaria. O preco do
//    atlas e memoria de video (2048 x 2506 = ~20 MB), paga UMA vez e so quando
//    alguem senta numa mesa — 'criarBaralho3D' e chamado no comeco da viagem da
//    camera, que dura 0,9 s e esconde o custo do desenho.
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
// verso e uma trelica em losango com selo central. Nada foi copiado de baralho
// de fabricante nenhum.
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

// 8 colunas x 7 linhas = 56 celulas pra 52 faces + verso + marfim + 2 sobras.
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

// Meia texela de recuo em cada borda da celula. Sem isso, no mipmap a carta
// puxa a cor da vizinha e aparece um fiapo colorido na borda quando ela esta
// longe (a mesma coisa que acontece com atlas de tile em qualquer engine).
const PAD_UV = 1.5

// Cores do baralho. O vermelho NAO e 0xff0000: carmim puro estoura no tone
// mapping do jogo e o naipe vira um borrao saturado sem forma.
const TINTA_PRETA = '#191c22'
const TINTA_VERMELHA = '#bc1f38'
const MARFIM = '#f7f3e7'
const MARFIM_SOMBRA = '#e3dcc8'

// ---------------------------------------------------------------------------
// Os quatro naipes, desenhados na mao.
//
// Cada um cabe numa caixa de lado 's' centrada em (x, y) e e desenhado com o
// fillStyle que ja estiver ativo. Sao curvas e nao poligonos porque naipe de
// baralho e uma forma organica: um pique feito de triangulos le como seta.
// ---------------------------------------------------------------------------

function pique(g, x, y, s) {
  g.beginPath()
  g.moveTo(x, y - 0.52 * s)
  g.bezierCurveTo(x + 0.10 * s, y - 0.24 * s, x + 0.52 * s, y - 0.14 * s, x + 0.52 * s, y + 0.08 * s)
  g.bezierCurveTo(x + 0.52 * s, y + 0.32 * s, x + 0.22 * s, y + 0.36 * s, x + 0.07 * s, y + 0.17 * s)
  g.bezierCurveTo(x + 0.11 * s, y + 0.34 * s, x + 0.18 * s, y + 0.45 * s, x + 0.25 * s, y + 0.52 * s)
  g.lineTo(x - 0.25 * s, y + 0.52 * s)
  g.bezierCurveTo(x - 0.18 * s, y + 0.45 * s, x - 0.11 * s, y + 0.34 * s, x - 0.07 * s, y + 0.17 * s)
  g.bezierCurveTo(x - 0.22 * s, y + 0.36 * s, x - 0.52 * s, y + 0.32 * s, x - 0.52 * s, y + 0.08 * s)
  g.bezierCurveTo(x - 0.52 * s, y - 0.14 * s, x - 0.10 * s, y - 0.24 * s, x, y - 0.52 * s)
  g.closePath()
  g.fill()
}

function coracao(g, x, y, s) {
  g.beginPath()
  g.moveTo(x, y + 0.50 * s)
  g.bezierCurveTo(x - 0.17 * s, y + 0.28 * s, x - 0.54 * s, y + 0.06 * s, x - 0.54 * s, y - 0.16 * s)
  g.bezierCurveTo(x - 0.54 * s, y - 0.44 * s, x - 0.18 * s, y - 0.50 * s, x, y - 0.19 * s)
  g.bezierCurveTo(x + 0.18 * s, y - 0.50 * s, x + 0.54 * s, y - 0.44 * s, x + 0.54 * s, y - 0.16 * s)
  g.bezierCurveTo(x + 0.54 * s, y + 0.06 * s, x + 0.17 * s, y + 0.28 * s, x, y + 0.50 * s)
  g.closePath()
  g.fill()
}

function losango(g, x, y, s) {
  g.beginPath()
  g.moveTo(x, y - 0.53 * s)
  g.quadraticCurveTo(x + 0.19 * s, y - 0.19 * s, x + 0.39 * s, y)
  g.quadraticCurveTo(x + 0.19 * s, y + 0.19 * s, x, y + 0.53 * s)
  g.quadraticCurveTo(x - 0.19 * s, y + 0.19 * s, x - 0.39 * s, y)
  g.quadraticCurveTo(x - 0.19 * s, y - 0.19 * s, x, y - 0.53 * s)
  g.closePath()
  g.fill()
}

function trevo(g, x, y, s) {
  g.beginPath()
  g.arc(x, y - 0.23 * s, 0.205 * s, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(x - 0.245 * s, y + 0.11 * s, 0.205 * s, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(x + 0.245 * s, y + 0.11 * s, 0.205 * s, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(x - 0.055 * s, y + 0.04 * s)
  g.bezierCurveTo(x - 0.065 * s, y + 0.28 * s, x - 0.17 * s, y + 0.44 * s, x - 0.23 * s, y + 0.52 * s)
  g.lineTo(x + 0.23 * s, y + 0.52 * s)
  g.bezierCurveTo(x + 0.17 * s, y + 0.44 * s, x + 0.065 * s, y + 0.28 * s, x + 0.055 * s, y + 0.04 * s)
  g.closePath()
  g.fill()
}

const DESENHO_NAIPE = [pique, coracao, losango, trevo]

/** Desenha o naipe 'n' em (x,y) com lado 's'. Ordem = a de baralho.js. */
function naipe(g, n, x, y, s) {
  const f = DESENHO_NAIPE[n] || pique
  f(g, x, y, s)
}

// ---------------------------------------------------------------------------
// O arranjo dos simbolos do meio, carta por carta.
//
// Sao as posicoes classicas: coluna esquerda/direita em -1/+1, coluna do meio
// em 0; a linha de cima em -1 e a de baixo em +1. Nao ha nada de arbitrario
// aqui — e o arranjo que qualquer jogador reconhece sem contar os simbolos, e e
// por isso que ele existe: um 8 com oito simbolos espalhados de qualquer jeito
// obriga a CONTAR, e contar e o que a gente esta tentando evitar.
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

// Tons da figura. O manto vem do NAIPE (vermelho ou azul-ardosia), mas o
// contorno, a cabeca e o adorno tem cor propria — e essa separacao e o que faz
// a figura ler. A primeira versao pintava tudo na cor do naipe e, num Q de
// ouros a 20 cm de distancia, o resultado era uma mancha vermelha sem forma:
// vermelho sobre marfim tem contraste baixo demais pra carregar desenho
// sozinho. Contorno escuro sempre; cor so no manto e no adorno.
const FIG_TINTA = '#23272f'
const FIG_PELE = '#e6c7a4'
const FIG_OURO = '#c8a24a'
const FIG_MANTO_PRETO = '#3d4a5c'

/**
 * A FIGURA de J, Q e K.
 *
 * Nao ha ilustracao de corte francesa aqui, e nem podia haver: as figuras dos
 * baralhos de banca sao desenho de fabricante. O que se desenha e um painel
 * espelhado — a metade de cima e a de baixo iguais e viradas, como na carta de
 * verdade — com um busto geometrico: manto, gola, cabeca e um adorno que muda
 * por posto (coroa no rei, diadema na dama, elmo com pena no valete).
 */
function figura(g, letra, x, y, w, h, corManto) {
  const meia = h / 2

  // painel: fundo claro com moldura dupla, como o quadro central da carta
  g.fillStyle = '#f3ecdd'
  g.fillRect(x - w / 2, y - meia, w, h)
  g.strokeStyle = FIG_TINTA
  g.lineWidth = Math.max(2, w * 0.024)
  g.strokeRect(x - w / 2, y - meia, w, h)
  g.strokeStyle = corManto
  g.lineWidth = Math.max(1.5, w * 0.014)
  g.strokeRect(x - w / 2 + w * 0.055, y - meia + w * 0.055, w - w * 0.11, h - w * 0.11)

  // a diagonal que separa as duas metades — e ela que faz a carta "virar"
  g.strokeStyle = 'rgba(35,39,47,0.45)'
  g.lineWidth = Math.max(1.5, w * 0.012)
  g.beginPath()
  g.moveTo(x - w / 2, y + meia)
  g.lineTo(x + w / 2, y - meia)
  g.stroke()

  const busto = (dir) => {
    g.save()
    g.translate(x, y)
    g.scale(1, dir)
    g.translate(0, -meia * 0.46)
    const s = w * 0.5
    const traco = Math.max(1.4, s * 0.045)
    g.lineJoin = 'round'
    g.strokeStyle = FIG_TINTA
    g.lineWidth = traco

    // manto
    g.fillStyle = corManto
    g.beginPath()
    g.moveTo(-s * 0.94, s * 0.92)
    g.quadraticCurveTo(-s * 0.74, s * 0.16, 0, s * 0.16)
    g.quadraticCurveTo(s * 0.74, s * 0.16, s * 0.94, s * 0.92)
    g.closePath()
    g.fill()
    g.stroke()
    // gola em V, clara: e ela que separa o manto da cabeca
    g.fillStyle = '#f3ecdd'
    g.beginPath()
    g.moveTo(-s * 0.26, s * 0.18)
    g.lineTo(0, s * 0.66)
    g.lineTo(s * 0.26, s * 0.18)
    g.closePath()
    g.fill()
    g.stroke()
    // cabeca
    g.fillStyle = FIG_PELE
    g.beginPath()
    g.ellipse(0, -s * 0.26, s * 0.29, s * 0.35, 0, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    // dois olhos: sem eles a cabeca vira um ovo
    g.fillStyle = FIG_TINTA
    g.beginPath(); g.ellipse(-s * 0.11, -s * 0.30, s * 0.035, s * 0.05, 0, 0, Math.PI * 2); g.fill()
    g.beginPath(); g.ellipse(s * 0.11, -s * 0.30, s * 0.035, s * 0.05, 0, 0, Math.PI * 2); g.fill()

    g.fillStyle = FIG_OURO
    if (letra === 'K') {
      g.beginPath()
      g.moveTo(-s * 0.44, -s * 0.54)
      g.lineTo(-s * 0.30, -s * 0.94)
      g.lineTo(-s * 0.14, -s * 0.62)
      g.lineTo(0, -s * 1.04)
      g.lineTo(s * 0.14, -s * 0.62)
      g.lineTo(s * 0.30, -s * 0.94)
      g.lineTo(s * 0.44, -s * 0.54)
      g.closePath()
      g.fill(); g.stroke()
    } else if (letra === 'Q') {
      g.beginPath()
      g.moveTo(-s * 0.42, -s * 0.52)
      g.quadraticCurveTo(0, -s * 0.90, s * 0.42, -s * 0.52)
      g.lineTo(s * 0.34, -s * 0.42)
      g.quadraticCurveTo(0, -s * 0.72, -s * 0.34, -s * 0.42)
      g.closePath()
      g.fill(); g.stroke()
      g.beginPath(); g.arc(0, -s * 0.76, s * 0.10, 0, Math.PI * 2); g.fill(); g.stroke()
    } else {
      g.beginPath()
      g.moveTo(-s * 0.38, -s * 0.46)
      g.quadraticCurveTo(-s * 0.34, -s * 0.84, 0, -s * 0.84)
      g.quadraticCurveTo(s * 0.34, -s * 0.84, s * 0.38, -s * 0.46)
      g.closePath()
      g.fill(); g.stroke()
      // a pena do elmo: o unico traco solto da figura
      g.fillStyle = corManto
      g.beginPath()
      g.moveTo(s * 0.30, -s * 0.72)
      g.quadraticCurveTo(s * 0.92, -s * 1.00, s * 0.76, -s * 0.32)
      g.quadraticCurveTo(s * 0.60, -s * 0.66, s * 0.30, -s * 0.60)
      g.closePath()
      g.fill(); g.stroke()
    }
    g.restore()
  }

  busto(1)
  busto(-1)
}

/** Uma face inteira, desenhada dentro da celula (0,0)-(CEL_W,CEL_H). */
function desenharFace(g, r, n) {
  const info = NAIPES[n] || NAIPES[0]
  const tinta = info.vermelho ? TINTA_VERMELHA : TINTA_PRETA
  const W = CEL_W
  const H = CEL_H

  // fundo marfim com um leve degrade: papel de carta nao e branco chapado, e
  // chapado demais ele brilha uniforme e a carta parece um adesivo.
  const fundo = g.createLinearGradient(0, 0, W * 0.4, H)
  fundo.addColorStop(0, '#fffdf6')
  fundo.addColorStop(1, '#eee7d6')
  g.fillStyle = fundo
  g.fillRect(0, 0, W, H)

  // moldura interna fininha
  g.strokeStyle = 'rgba(25,28,34,0.16)'
  g.lineWidth = 3
  g.strokeRect(9, 9, W - 18, H - 18)

  const nome = nomeValor(r)
  const cantoX = 26
  const cantoY = 34

  // --- indice nos DOIS cantos, o de baixo virado -------------------------
  const indice = (dir) => {
    g.save()
    g.translate(W / 2, H / 2)
    g.scale(dir, dir)
    g.translate(-W / 2, -H / 2)
    g.fillStyle = tinta
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    // '10' e o unico com dois digitos: aperta a fonte pra ele nao encostar na
    // borda nem no naipe de baixo.
    g.font = 'bold ' + (nome.length > 1 ? 46 : 54) + 'px "Trebuchet MS", "Segoe UI", sans-serif'
    g.fillText(nome, cantoX, cantoY, 44)
    naipe(g, n, cantoX, cantoY + 45, 34)
    g.restore()
  }
  indice(1)
  indice(-1)

  // --- miolo --------------------------------------------------------------
  const cx = W / 2
  const cy = H / 2
  if (r === 1) {
    // As: um naipe grande e um anel discreto atras. E a carta mais reconhecida
    // do baralho de longe, entao ela ganha o desenho maior.
    g.strokeStyle = 'rgba(25,28,34,0.10)'
    g.lineWidth = 5
    g.beginPath()
    g.arc(cx, cy, 84, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = tinta
    naipe(g, n, cx, cy, 122)
  } else if (r >= 11) {
    figura(g, nome, cx, cy, W * 0.60, H * 0.56, info.vermelho ? TINTA_VERMELHA : FIG_MANTO_PRETO)
  } else {
    const pontos = ARRANJO[r] || ARRANJO[2]
    const meiaX = W * 0.235      // afastamento das colunas laterais
    const meiaY = H * 0.285      // afastamento das linhas de cima e de baixo
    const lado = 52
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

/** O VERSO. Trelica em losango sobre campo escuro, borda dourada e selo. */
function desenharVerso(g, campo, campo2, aro) {
  const W = CEL_W
  const H = CEL_H

  g.fillStyle = MARFIM
  g.fillRect(0, 0, W, H)

  const m = 12
  const gr = g.createLinearGradient(0, 0, W, H)
  gr.addColorStop(0, campo)
  gr.addColorStop(1, campo2)
  g.fillStyle = gr
  g.fillRect(m, m, W - m * 2, H - m * 2)

  // trelica: duas famflias de retas a 45 graus, recortadas pelo campo
  g.save()
  g.beginPath()
  g.rect(m, m, W - m * 2, H - m * 2)
  g.clip()
  g.strokeStyle = 'rgba(255,255,255,0.14)'
  g.lineWidth = 2
  for (let i = -H; i < W + H; i += 17) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke()
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke()
  }
  // pontinhos no cruzamento: e o que separa "listrado" de "trabalhado"
  g.fillStyle = 'rgba(255,255,255,0.20)'
  for (let y = m; y < H - m; y += 34) {
    for (let x = m + ((y / 34) % 2) * 17; x < W - m; x += 34) {
      g.beginPath(); g.arc(x, y, 2.4, 0, Math.PI * 2); g.fill()
    }
  }
  g.restore()

  // aro dourado duplo
  g.strokeStyle = aro
  g.lineWidth = 4
  g.strokeRect(m + 6, m + 6, W - (m + 6) * 2, H - (m + 6) * 2)
  g.lineWidth = 1.5
  g.strokeRect(m + 13, m + 13, W - (m + 13) * 2, H - (m + 13) * 2)

  // selo central: losango com uma estrela de cinco pontas, a mesma do telhado
  g.save()
  g.translate(W / 2, H / 2)
  g.rotate(Math.PI / 4)
  g.fillStyle = 'rgba(0,0,0,0.30)'
  g.fillRect(-46, -46, 92, 92)
  g.strokeStyle = aro
  g.lineWidth = 3
  g.strokeRect(-46, -46, 92, 92)
  g.restore()
  g.fillStyle = aro
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 === 0 ? 38 : 16
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const px = W / 2 + Math.cos(a) * raio
    const py = H / 2 + Math.sin(a) * raio
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py)
  }
  g.closePath()
  g.fill()
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
  desenharVerso(g, '#8e1b31', '#4d0d1c', '#e6c377')
  g.restore()

  g.save()
  g.translate((CEL_VERSO_AZUL % COLS) * CEL_W, Math.floor(CEL_VERSO_AZUL / COLS) * CEL_H)
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
  const material = new THREE.MeshStandardMaterial({
    map: textura,
    roughness: 0.62,
    metalness: 0.0,
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
