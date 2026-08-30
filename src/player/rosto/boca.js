import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD_S, useHead, surfaceZ, wrapToHead, faceSpread,
  skinOf, mixHex, shade, sh, flatPiece, gauss,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/boca.js — TRES BOCAS, TRES GERADORES DE GEOMETRIA.
//
// O catalogo antigo era curvedBar() + facePiece() tres vezes com os numeros
// trocados: a MESMA extrusao de Shape em todas. De longe as tres liam igual, e
// e exatamente dai que vem a queixa de "boneco de bloco". Aqui cada item tem um
// gerador proprio, e a diferenca aparece na silhueta, nao no parametro:
//
//   0 traco     FITA DE DUAS BORDAS costurada estacao por estacao. A espessura
//               e funcao da posicao (cheia no meio, agulha nas pontas) — uma
//               extrusao de Shape so faria isso virando um poligono de 60
//               pontos, e mesmo assim ganharia bisel, que aqui atrapalha: a
//               referencia e uma LINHA desenhada na pele, sem volume nenhum.
//   1 labios    LOFT DE SECOES: uma secao transversal (arco que sai da pele,
//               estufa e volta) varrida ao longo da boca. E o unico dos tres
//               que tem volume de verdade — o labio pega luz em cima e vira
//               sombra embaixo, que e o que faz o rosto ler como rosto.
//   2 cavidade  ANEIS CONCENTRICOS com perfil de elevacao: a mesma volta
//               amostrada varias vezes, encolhendo pra dentro (escava o vao) e
//               deslocada pela normal 2D pra fora (levanta o rebordo do labio).
//               E o unico que da degrau de profundidade e silhueta de rebordo.
//
// POR QUE NENHUMA DELAS FURA A CABECA DE VERDADE
// A cabeca e uma casca fechada montada em outro modulo e este arquivo nao pode
// encostar nela. Todo vertice com z < surfaceZ(x,y) nasce ATRAS da pele e some.
// Entao tudo aqui e RELEVO SOBRE O CAMPO: a "cavidade" e um prato cuja borda
// sobe ~6 mm e cujo fundo encosta na pele, e comissura e sulco sao PINTADOS em
// vez de cavados. O olho le a profundidade pelo degrau local do rebordo (que
// existe) e nao pelo buraco (que nao teria como existir).
//
// Ancoragem: nenhuma peca usa z fixo. Cada vertice passa por surfaceZ() ou por
// wrapToHead(), porque a boca cai no trecho de maior curvatura do rosto — com z
// constante o canto da boca atravessa a bochecha no cranio `mandibula`
// (kx 1.14) e some dentro dela no `pera` (flare 0.42).
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da linha da boca (tabela do CONTRATO): logo abaixo da base do nariz. */
const BOCA_Y = -0.082 * S

/**
 * Marrom quase preto. 0x000000 le como buraco de bug na malha (some a forma e
 * sobra um recorte chapado que nao responde a luz nenhuma da cena); 0x2a1a18
 * ainda devolve um pouco de luz e continua lendo como boca.
 */
const COR_TRACO = 0x2a1a18
const COR_FUNDO = 0x241614

/**
 * Quad em ordem ANTI-HORARIA VISTA DE FORA (a face frontal do three.js).
 * Toda geometria deste arquivo e costurada na mao, entao a ordem dos quatro
 * cantos e a unica coisa que decide pra que lado a normal aponta. Errar aqui
 * nao quebra nada visivel na caixa envolvente: o labio simplesmente nasce
 * iluminado por dentro e fica preto, e o defeito passa por "cor errada".
 */
function quad(idx, a, b, c, d) { idx.push(a, b, c, a, c, d) }

/**
 * Material das pecas ABERTAS (labio, comissura, sulco, prato, dente).
 *
 * Elas sao RETALHOS, nao solidos: tem borda, e atras da borda nao existe face
 * nenhuma. Com FrontSide o three.js descarta o verso, e num angulo rasante por
 * baixo do queixo — que e onde a camera de 3a pessoa chega quando o jogador
 * olha pra cima — o labio simplesmente SOME em vez de virar silhueta. O menor
 * cosseno medido nesses retalhos e 0.19 (labios) e 0.32 (cavidade), ou seja: a
 * partir de ~79 graus fora do eixo da cara o verso ja aparece, e o pitch da
 * camera vai a 57 graus antes de somar a rotacao da cabeca.
 *
 * E a mesma escolha que os retalhos de pele do olho ja fazem. So o `traco`
 * fica de fora: aquele e casca FECHADA
 * (volume com sinal positivo nos seis cranios), entao o verso e sempre invisivel
 * e descartar ele e de graca.
 */
function matAberto(cor, rough) {
  return solid(cor, rough, 0.0, { side: THREE.DoubleSide })
}

/** Fecha um par posicao/indice em BufferGeometry (normais por vertice). */
function malha(pos, idx) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/**
 * Geometria com SO os vertices que a lista de indices usa.
 * A boca por cavidade monta prato, dentes e labio a partir do MESMO pool de
 * aneis — e o que garante que o rebordo compartilhe vertice por vertice com a
 * borda do prato e nao abra fresta entre os dois. Mas cada material precisa da
 * propria geometria, e mandar o pool inteiro em todas deixaria vertice orfao
 * com normal (0,0,0) e caixa envolvente do tamanho da boca inteira em cada
 * pedaco.
 */
function recorte(pos, idx) {
  const mapa = new Map()
  const p = []
  const novo = []
  for (const i of idx) {
    let n = mapa.get(i)
    if (n === undefined) {
      n = p.length / 3
      mapa.set(i, n)
      p.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    }
    novo.push(n)
  }
  return malha(p, novo)
}

// ---------------------------------------------------------------------------
// METODO 0 — FITA DE DUAS BORDAS
// ---------------------------------------------------------------------------

/**
 * A boca da referencia: um traco escuro fino, largo quase como a distancia
 * entre as pupilas, mais grosso no meio e afinando ate quase nada nas pontas,
 * com as duas pontas subindo num sorriso discreto e fechado.
 *
 * A fita e uma tira de 4 vertices por estacao (borda de cima e de baixo, em
 * duas profundidades). O par de profundidades existe por um motivo so: uma
 * folha de espessura zero desaparece em angulo raso e mostra o vao entre ela e
 * a pele. 1,3 mm de espessura resolve e continua lendo como linha.
 *
 * A subida das pontas usa |u|^2.6, nao u^2: com u^2 a boca inteira vira um
 * arco de sorriso escancarado; com expoente alto o meio fica reto (que e o que
 * a foto mostra) e so o ultimo quarto curva pra cima.
 */
function fitaTraco() {
  // 0.060 * S de meia-largura da a boca praticamente na distancia entre as
  // pupilas (EYE_ANCHOR.x = 0.062 * S), que e a proporcao da referencia.
  const MEIA = 0.060 * S * faceSpread()
  const ESP = 0.0100 * S    // espessura no meio do traco
  const SUBIDA = 0.0075 * S // quanto a ponta sobe em relacao ao meio
  const ALT = 0.0010 * S    // espessura da fita pra fora da pele
  const PAD = 0.0015 * S    // folga anti z-fighting contra a casca da cabeca
  const N = 30              // 30 estacoes = ~5 mm de passo: a corda da fita
                            // acompanha a curva do rosto sem afundar nela

  const pos = []
  const idx = []
  const put = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1 }
  const est = []

  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1
    const x = u * MEIA
    const y = BOCA_Y + SUBIDA * Math.pow(Math.abs(u), 2.6)
    // 5% de espessura minima na ponta: zerar de vez cria triangulo degenerado,
    // e vertice degenerado sai com normal (0,0,0) e mancha preta na ponta.
    const h = ESP * 0.5 * (0.05 + 0.95 * Math.pow(1 - u * u, 0.62))
    est.push([
      put(x, y + h, ALT), put(x, y - h, ALT),
      put(x, y + h, 0), put(x, y - h, 0),
    ])
  }

  for (let i = 0; i < N; i++) {
    const A = est[i], B = est[i + 1]
    quad(idx, A[0], A[1], B[1], B[0]) // frente
    quad(idx, B[2], B[3], A[3], A[2]) // fundo (contra a pele)
    quad(idx, A[0], B[0], B[2], A[2]) // borda de cima
    quad(idx, A[1], A[3], B[3], B[1]) // borda de baixo
  }
  const P = est[0], U = est[N]
  quad(idx, P[0], P[2], P[3], P[1])   // tampa da ponta esquerda
  quad(idx, U[0], U[1], U[3], U[2])   // tampa da ponta direita

  return wrapToHead(malha(pos, idx), PAD)
}

// ---------------------------------------------------------------------------
// METODO 1 — LOFT DE SECOES
// ---------------------------------------------------------------------------

/**
 * Varre uma secao transversal ao longo da boca.
 *   nu    estacoes ao longo do eixo X (a largura da boca)
 *   ns    pontos da secao (da borda de cima da faixa ate a de baixo)
 *   ponto (u em [-1,1], s em [0,1]) -> [x, y, altura sobre a pele]
 * O Z devolvido por `ponto` e ALTURA SOBRE A PELE: wrapToHead troca ele pelo
 * surfaceZ do lugar e soma de volta, entao a faixa gruda na curva do rosto em
 * qualquer cranio.
 */
function loft(nu, ns, ponto, pad) {
  const pos = []
  const idx = []
  const grade = []
  for (let i = 0; i <= nu; i++) {
    const u = (i / nu) * 2 - 1
    const linha = []
    for (let j = 0; j <= ns; j++) {
      const p = ponto(u, j / ns)
      pos.push(p[0], p[1], p[2])
      linha.push(pos.length / 3 - 1)
    }
    grade.push(linha)
  }
  // j cresce PRA BAIXO e i cresce pra direita: o canto de cima-esquerda seguido
  // do de baixo-esquerda e o giro anti-horario visto de fora da cara.
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < ns; j++) {
      quad(idx, grade[i][j], grade[i][j + 1], grade[i + 1][j + 1], grade[i + 1][j])
    }
  }
  return wrapToHead(malha(pos, idx), pad)
}

/**
 * Labios com volume: arco do cupido em cima, labio inferior mais cheio, linha
 * de comissura escura no meio e sulco mentolabial embaixo.
 *
 * O arco do cupido nao e enfeite: e ele que faz a boca ler como boca de perto.
 * A borda de cima do labio superior e (1-u^2)^0.62 — um arco cheio — MENOS uma
 * gaussiana estreita no meio (o vale do filtro). O que sobra sao as duas ondas
 * com o vale central, e os dois picos caem sozinhos em |u| ~ 0.33, que e onde a
 * anatomia poe eles.
 *
 * A secao usa sin(PI * s^k) porque ela precisa valer ZERO nas duas pontas (o
 * labio nasce e morre na pele) e ter UM pico no meio; o expoente k desloca esse
 * pico: 1.25 joga o volume do labio superior pra baixo, perto da comissura, e
 * 0.82 joga o do inferior pra cima. Perfil simetrico daria dois cilindros.
 */
function labiosLoft(ctx) {
  const MEIA = 0.058 * S * faceSpread()
  const E = 0.0022 * S       // meia-largura da faixa de comissura
  const PAD = 0.0016 * S
  const PAD_COM = 0.0011 * S // a comissura fica MEIO MILIMETRO atras dos labios:
                             // e esse degrau que faz a linha ler como sulco e
                             // nao como adesivo colado por cima da boca
  const NU = 34, NS = 6

  // A linha de fechamento sobe nas pontas — sem isso a boca fica com cara de
  // emburrada, que le como personagem desligado.
  const comissura = (u) => BOCA_Y + 0.0060 * S * Math.pow(Math.abs(u), 2.2)
  const arco = (u) => 0.0010 * S + 0.0130 * S
    * Math.pow(Math.max(0, 1 - u * u), 0.62) * (1 - 0.30 * gauss(u, 0, 0.20))
  const cheio = (u) => 0.0010 * S + 0.0160 * S * Math.pow(Math.max(0, 1 - u * u), 0.55)

  const g = new THREE.Group()
  const pele = skinOf(ctx)
  // Labio nao e pele mais escura: e pele com sangue por baixo. Puxar 32% pra um
  // vermelho terroso funciona nos dez tons do catalogo, inclusive nos escuros,
  // onde so escurecer daria um borrao sem cor.
  const matLabio = matAberto(mixHex(shade(pele, 0.92), 0x9c4a3e, 0.32), 0.62)
  const matCom = matAberto(0x2c1b18, 0.78)
  const matSulco = matAberto(mixHex(shade(pele, 0.86), 0x8a4438, 0.18), 0.85)

  // superior: da borda com a pele (s=0) ate a comissura (s=1)
  g.add(sh(new THREE.Mesh(loft(NU, NS, (u, s) => {
    const yTopo = comissura(u) + E + arco(u)
    const yBase = comissura(u) + E
    const rel = 0.0042 * S * Math.pow(Math.max(0, 1 - u * u), 0.80)
    return [u * MEIA, yTopo + (yBase - yTopo) * s, rel * Math.sin(Math.PI * Math.pow(s, 1.25))]
  }, PAD), matLabio)))

  // inferior: mais cheio e mais projetado — a diferenca de projecao entre os
  // dois labios e o que cria a sombra que separa um do outro
  g.add(sh(new THREE.Mesh(loft(NU, NS, (u, s) => {
    const yTopo = comissura(u) - E
    const yBase = yTopo - cheio(u)
    const rel = 0.0056 * S * Math.pow(Math.max(0, 1 - u * u), 0.70)
    return [u * MEIA, yTopo + (yBase - yTopo) * s, rel * Math.sin(Math.PI * Math.pow(s, 0.82))]
  }, PAD), matLabio)))

  // comissura: faixa fina escura no vale entre os dois labios. flatPiece porque
  // sombra propria numa faixa colada vira mancha que pisca com a camera.
  g.add(flatPiece(new THREE.Mesh(loft(NU, 2, (u, s) => {
    const y = comissura(u) + E - 2 * E * s
    return [u * MEIA * 1.02, y, 0.0002 * S]
  }, PAD_COM), matCom)))

  // sulco mentolabial: PINTADO, nao cavado (ver cabecalho). Um filete de pele
  // mais escura e quente logo abaixo do labio inferior; junto com o volume real
  // do labio acima dele o olho fecha a leitura de "queixo comeca aqui".
  g.add(flatPiece(new THREE.Mesh(loft(NU, 3, (u, s) => {
    const yTopo = comissura(u) - E - cheio(u)
    // O 0.0008 * S de altura minima nao e estetica: sem ele a faixa colapsa num
    // ponto em u = +/-1, os dois vertices do meio da coluna caem no mesmo lugar
    // e sobram triangulos de area zero na ponta do sulco.
    const alt = 0.0008 * S + 0.0067 * S * Math.pow(Math.max(0, 1 - u * u), 0.45)
    return [u * MEIA * 0.92, yTopo - alt * s, 0.0005 * S * Math.sin(Math.PI * s)]
  }, PAD), matSulco)))

  return g
}

// ---------------------------------------------------------------------------
// METODO 2 — ANEIS CONCENTRICOS
// ---------------------------------------------------------------------------

/**
 * Boca por cavidade: a abertura e um prato escuro escavado, cercado por um
 * rebordo de labio fino, com uma faixa clara de dentes la dentro.
 *
 * Os aneis de DENTRO encolhem por escala radial (convergem no centro, e o prato
 * fecha num leque). Os aneis de FORA nao podem: escalar a abertura por 1.5
 * jogaria o canto da boca 2 cm pra fora e o labio ficaria com cara de bigode.
 * Eles sao deslocados pela NORMAL 2D da curva da abertura, com distancia por
 * angulo — grossa em cima e embaixo, quase zero nos cantos, que e como um labio
 * e de verdade.
 *
 * A volta fecha com % NSEG em vez de repetir a primeira coluna: sem coluna
 * duplicada nao existe a costura que soldarNormais() teria que consertar.
 */
function cavidadeAneis(ctx) {
  const ESP = faceSpread()
  const A = 0.038 * S * ESP  // meia-largura da abertura
  const B = 0.0150 * S       // meia-altura da abertura
  const REBORDO = 0.0046 * S // altura da crista do labio sobre a pele
  const PAD = 0.0014 * S
  const NSEG = 30

  // Abertura em forma de lente, nao elipse: o |sin|^0.35 puxa os angulos do
  // meio pra perto do eixo e afia os dois cantos. Elipse pura deixa a boca com
  // canto redondo de bocarra de desenho animado.
  // O cos^2 levanta os dois cantos: a boca fecha com uma insinuacao de sorriso.
  const abertura = (t) => {
    const st = Math.sin(t), ct = Math.cos(t)
    return [
      A * ct,
      BOCA_Y + B * st * Math.pow(Math.abs(st), 0.35) + 0.0040 * S * ct * ct,
    ]
  }

  // Elevacao do prato por escala radial: 0.85 do rebordo na borda, quase zero no
  // fundo. Fundo abaixo de zero seria escondido pela propria cabeca.
  const altPrato = (e) => REBORDO * (0.03 + 0.82 * e * e)

  const pos = []
  const put = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1 }

  const borda = []
  for (let i = 0; i < NSEG; i++) borda.push(abertura((i / NSEG) * Math.PI * 2))

  // normal 2D pra fora por diferenca finita: (dy, -dx) aponta pra fora quando a
  // curva e percorrida no sentido anti-horario, que e o caso aqui (t=0 no canto
  // direito, t=PI/2 no alto).
  const nor = []
  for (let i = 0; i < NSEG; i++) {
    const a = borda[(i + NSEG - 1) % NSEG], b = borda[(i + 1) % NSEG]
    let nx = b[1] - a[1], ny = -(b[0] - a[0])
    const m = Math.hypot(nx, ny) || 1
    nor.push([nx / m, ny / m])
  }

  const anelDentro = (e) => {
    const l = []
    for (let i = 0; i < NSEG; i++) {
      const x = borda[i][0] * e
      const y = BOCA_Y + (borda[i][1] - BOCA_Y) * e
      l.push(put(x, y, surfaceZ(x, y, PAD) + altPrato(e)))
    }
    return l
  }
  // Espessura do labio por angulo: o de baixo e mais cheio que o de cima e os
  // dois somem no canto. sin(t) > 0 e a metade de cima da abertura.
  const espLabio = (t) => {
    const st = Math.sin(t)
    return 0.0030 * S + (st > 0 ? 0.0072 * S : 0.0104 * S) * Math.pow(Math.abs(st), 1.1)
  }
  const anelFora = (k, alt) => {
    const l = []
    for (let i = 0; i < NSEG; i++) {
      const d = espLabio((i / NSEG) * Math.PI * 2) * k
      const x = borda[i][0] + nor[i][0] * d
      const y = borda[i][1] + nor[i][1] * d
      l.push(put(x, y, surfaceZ(x, y, PAD) + alt))
    }
    return l
  }

  // --- prato escavado -------------------------------------------------------
  const ESCALAS = [1, 0.86, 0.66, 0.40]
  const aneis = ESCALAS.map(anelDentro)
  const centro = put(0, BOCA_Y, surfaceZ(0, BOCA_Y, PAD) + altPrato(0))
  const idxPrato = []
  for (let k = 0; k < aneis.length - 1; k++) {
    const F = aneis[k], D = aneis[k + 1]
    for (let i = 0; i < NSEG; i++) {
      const j = (i + 1) % NSEG
      quad(idxPrato, F[i], F[j], D[j], D[i])
    }
  }
  const ult = aneis[aneis.length - 1]
  for (let i = 0; i < NSEG; i++) idxPrato.push(ult[i], ult[(i + 1) % NSEG], centro)

  // --- rebordo do labio -----------------------------------------------------
  // crista no meio da largura do labio (k = 0.45), nao na beirada da abertura:
  // crista na beirada vira uma aresta viva que le como plastico injetado.
  const idxLabio = []
  const anelCrista = anelFora(0.45, REBORDO)
  const anelPele = anelFora(1.0, 0.0004 * S)
  for (const [F, D] of [[anelCrista, aneis[0]], [anelPele, anelCrista]]) {
    for (let i = 0; i < NSEG; i++) {
      const j = (i + 1) % NSEG
      quad(idxLabio, F[i], F[j], D[j], D[i])
    }
  }

  // --- dentes ---------------------------------------------------------------
  // faixa clara na metade de CIMA do vao (indices cujo angulo cai entre ~36 e
  // ~144 graus), 1 mm a frente do prato no mesmo raio pra nao brigar com ele.
  const idxDente = []
  const i0 = Math.ceil(NSEG * 0.10), i1 = Math.floor(NSEG * 0.40)
  const dFora = [], dDentro = []
  for (let i = i0; i <= i1; i++) {
    for (const [e, saida] of [[0.90, dFora], [0.62, dDentro]]) {
      const x = borda[i][0] * e
      const y = BOCA_Y + (borda[i][1] - BOCA_Y) * e
      saida.push(put(x, y, surfaceZ(x, y, PAD) + altPrato(e) + 0.0008 * S))
    }
  }
  for (let i = 0; i < dFora.length - 1; i++) {
    quad(idxDente, dFora[i], dFora[i + 1], dDentro[i + 1], dDentro[i])
  }

  const g = new THREE.Group()
  // Fundo com roughness 0.66 e nao 1.0: fosco total le como mancha de textura
  // chapada; um resto de especular devolve o brilho de boca umida e denuncia
  // que ali tem uma superficie inclinada, que e a leitura de profundidade.
  // flatPiece nos dois de dentro: o prato e quase colado na pele e sombra
  // propria ali vira poeira preta piscando com o movimento da camera.
  g.add(flatPiece(new THREE.Mesh(recorte(pos, idxPrato), matAberto(COR_FUNDO, 0.66))))
  g.add(flatPiece(new THREE.Mesh(recorte(pos, idxDente), matAberto(0xe4dac9, 0.52))))
  g.add(sh(new THREE.Mesh(recorte(pos, idxLabio),
    matAberto(mixHex(shade(skinOf(ctx), 0.94), 0x9c4a3e, 0.28), 0.60))))
  return g
}

// ---------------------------------------------------------------------------
// CATALOGO
// ---------------------------------------------------------------------------

export const BOCAS = [
  {
    id: 'traco', nome: 'Traco', name: 'Traco',
    metodo: 'fita de duas bordas com espessura por estacao, projetada com wrapToHead',
    build(ctx) {
      useHead(ctx)
      const g = new THREE.Group()
      // flatPiece: e uma LINHA na pele. Com sombra propria a fita projeta a
      // propria espessura no rosto e a boca vira um borrao cinza de 4 mm.
      g.add(flatPiece(new THREE.Mesh(fitaTraco(), solid(COR_TRACO, 0.86, 0.0))))
      return g
    },
  },
  {
    id: 'labios', nome: 'Labios cheios', name: 'Labios cheios',
    metodo: 'loft de secoes transversais varridas ao longo da boca (arco do cupido no perfil da borda)',
    build(ctx) {
      useHead(ctx)
      return labiosLoft(ctx)
    },
  },
  {
    id: 'cavidade', nome: 'Boca escavada', name: 'Boca escavada',
    metodo: 'aneis concentricos sobre o campo da pele: escala radial escava o vao, deslocamento pela normal 2D levanta o labio',
    build(ctx) {
      useHead(ctx)
      return cavidadeAneis(ctx)
    },
  },
]
