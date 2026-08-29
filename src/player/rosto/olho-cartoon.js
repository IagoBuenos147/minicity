import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD_S, EYE_ANCHOR, useHead, faceSpread, surfaceZ, skinOf,
  shade, sh, flatPiece, mix, fechamentoOlho,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/olho-cartoon.js — O OLHO DA REFERENCIA.
//
// O dono mandou duas fotos e pediu: "quero fazer os olhos identicos aos olhos
// das duas imagens (...) na segunda imagem ele fecha um pouco os olhos, quero
// que faca essas duas versoes no MESMO olho, com uma barra ate fechar os olhos
// completamente".
//
// Entao isto aqui nao e mais um estilo de olho entre outros: e uma COPIA, e a
// barra e parte dela. Ler as fotos com atencao da cinco coisas, e as cinco
// mudam o resultado:
//
//  1. O BRANCO E ENORME E SALTA DA CARA. Nas fotos os dois ovais brancos passam
//     do contorno do rosto pelos lados — nao ha "orbita", eles sao bolas
//     apoiadas na frente da cabeca. Por isso `AFUNDA` e baixo (0.40): quase
//     dois tercos da bola ficam pra fora.
//  2. TEM CONTORNO PRETO. E o traco do desenho, e sem ele o branco simplesmente
//     desaparece contra a pele clara. Aqui ele e feito por CASCA INVERTIDA
//     (uma copia 5% maior desenhada so pelas faces de tras): como a bola e
//     convexa, so a beirada dela aparece, e o resultado e uma linha de
//     espessura constante em qualquer angulo — que e exatamente o que um traco
//     de desenho e. Um torus ou um anel nao dariam isso: mudariam de espessura
//     conforme a cabeca gira.
//  3. A PUPILA E MINUSCULA. Nas fotos ela tem menos de um quinto do branco, e e
//     PRETA CHAPADA, sem iris colorida, sem anel limbal, sem fibra. Qualquer
//     iris desenhada aqui destroi a semelhanca na hora.
//  4. NAO HA ESCLERA ROSADA, NEM VEIA, NEM CANTO. O branco e branco, de ponta a
//     ponta, e os dois ovais quase se encostam no meio da cara.
//  5. A PALPEBRA E UMA LINHA RETA-ISH QUE DESCE. Na segunda foto ela corta o
//     branco a uns 40% do topo e o que fica acima e PELE, com um fio escuro na
//     borda. Nao ha volume de palpebra, nao ha cilio: e o mesmo traco preto.
//
// A palpebra e geometria de verdade (calota tombada), e nao textura: e ela que
// tem que varrer do topo ate embaixo com a barra, e uma textura nao varre.
// ---------------------------------------------------------------------------

const S = HEAD_S

// A BOLA. Mais alta que larga, como nas fotos; a profundidade e menor que as
// duas (a bola e um pouco achatada contra a cara, senao ela vira uma esfera
// pendurada e o perfil fica de inseto).
const BOLA = { rx: 0.0500 * S, ry: 0.0560 * S, rz: 0.0430 * S }

// Quanto da bola fica DENTRO da cabeca. Nos outros olhos do jogo isso fica
// entre 0.62 e 0.84 (olho encaixado na orbita); aqui e 0.40 de proposito — nas
// fotos a bola SALTA da cara, e e esse salto que faz metade da semelhanca.
const AFUNDA = 0.40

// Os dois ovais quase se tocam no meio do rosto. 1.02 sobre a ancora padrao os
// afasta o tanto que as fotos mostram sem colar na tempora nos cranios largos
// (faceSpread ja cuida da largura da cabeca).
const ESPACO = 1.02

// Camadas, em raios da bola. Com 5.6 cm de raio, 1% = 0.56 mm — longe o
// bastante pra o z-buffer separar, perto o bastante pra nada boiar.
const L_PUPILA = 1.012
// O FIO FICA POR DENTRO DA PELE, e nao por fora. A ordem importa e ja quebrou:
// com o fio na camada de FORA ele deixa de ser um fio e vira uma cupula escura
// cobrindo o olho inteiro — foi o primeiro render desta peca. O truque so
// funciona ao contrario: a calota escura tem arco MAIOR e raio MENOR, entao ela
// fica escondida sob a pele e so a faixa que passa da borda da pele aparece.
const L_FIO = 1.030
const L_PALPEBRA = 1.042
const L_CONTORNO = 1.058

// Preto do traco. Preto puro (0x000000) le como buraco na cena com sombra; este
// e um quase-preto levemente azulado, que e o que tinta preta faz na luz.
const TRACO = 0x14111a

// Arco da calota da palpebra, ABERTO e FECHADO.
//
// Com o olho aberto a palpebra varre so por inclinacao e o arco fica em 0.95
// (54 graus): a borda mantem a mesma curvatura ao longo de quase todo o curso,
// que e o que faz a linha continuar parecendo a mesma linha em qualquer altura.
//
// Perto do fim o arco TEM que crescer, e isso e geometria e nao gosto. A borda
// de uma calota e um circulo na esfera, e a altura dela nao e a mesma em toda a
// volta: na frente ela fica em cos(beta + arco), mas de LADO fica em
// cos(beta)*cos(arco). Com arco 0.95, cos(arco) e 0.58 — ou seja, de lado a
// borda para 42% acima de onde para na frente, e as duas palpebras fechavam no
// meio da cara e deixavam uma CUNHA BRANCA nos dois cantos. Da pra ver isso no
// render da versao anterior.
// Com o arco em 1.52 (87 graus) cos(arco) cai pra 0.05: a borda fica quase
// horizontal em toda a volta e as duas se encontram nos cantos tambem.
const ARCO_ABERTO = 0.95
const ARCO_FECHADO = 1.52

/** Calota com o polo virado pra +Z (pupila, brilho). */
function calotaZ(arco, wSeg = 20, hSeg = 8) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, arco)
  g.rotateX(Math.PI / 2)
  return g
}

/**
 * A palpebra: calota de PELE + o fio escuro da borda.
 *
 * O fio e a MESMA calota com o arco um pouco maior e a escala um pouco menor:
 * ela fica escondida por baixo da pele e so a faixa que passa da borda aparece.
 * E um tracinho de espessura constante sem precisar de textura — e o mesmo
 * truque que o jogo ja usava pro cilio, aqui usado pro traco do desenho.
 *
 * `alturaRim` e onde a borda cruza o meio do olho, em raios da bola: +1 e o
 * topo (nao cobre nada), -1 e embaixo (cobre tudo). A conta e cos(tilt + arco),
 * entao tilt = acos(alturaRim) - arco.
 */
function palpebra(concha, alturaRim, arco, peleM, fioM, baixo) {
  // A calota nasce em volta de +Y com meio-angulo ARCO; girar em X por `base`
  // leva o polo dela. A borda que interessa e a que cruza a FRENTE do olho, e
  // ela fica a ARCO do polo — do lado de dentro pra palpebra de cima, do lado
  // de fora pra de baixo. Dai os dois sinais:
  //
  //   cima   base = acos(altura) - ARCO   (polo tomba pra TRAS)
  //   baixo  base = acos(altura) + ARCO   (polo passa de -Y e vai pra tras)
  //
  // A conta de baixo ja esteve como `PI - tilt`, e com isso o polo da palpebra
  // INFERIOR apontava pra FRENTE: ela virava uma tampa cobrindo o olho inteiro,
  // e o olho aberto saia com uma bolha de pele no lugar do branco. Foi o
  // segundo render desta peca.
  const a = Math.acos(Math.max(-1, Math.min(1, alturaRim)))
  const base = baixo ? a + arco : a - arco

  const fio = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, arco + 0.075), fioM))
  fio.scale.setScalar(L_FIO)
  fio.rotation.x = base
  concha.add(fio)

  const pele = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, arco), peleM))
  pele.scale.setScalar(L_PALPEBRA)
  pele.rotation.x = base
  concha.add(pele)
}

function build(ctx) {
  useHead(ctx)
  const pele = skinOf(ctx)
  const k = fechamentoOlho(ctx)

  // Rugosidade ALTA: nas fotos o branco e tinta chapada. Com 0.30 a bola ganhava
  // um reflexo de plastico que nao existe em desenho nenhum.
  const brancoM = solid(0xf6f4ef, 0.62, 0.0)
  const tracoM = solid(TRACO, 0.45, 0.0)
  const contornoM = solid(TRACO, 0.6, 0.0, { side: THREE.BackSide })
  const peleM = solid(pele, 0.72, 0.0, { side: THREE.DoubleSide })
  const fioM = solid(shade(pele, 0.16), 0.6, 0.0, { side: THREE.DoubleSide })
  const brilhoM = solid(0xffffff, 0.08, 0.0)

  const g = new THREE.Group()
  const spread = faceSpread()

  for (const sgn of [1, -1]) {
    const olho = new THREE.Group()
    const x = EYE_ANCHOR.x * ESPACO * spread
    const y = EYE_ANCHOR.y + 0.004 * S
    olho.position.set(sgn * x, y, surfaceZ(sgn * x, y) - BOLA.rz * AFUNDA)

    // A concha carrega a escala; tudo dentro dela tem raio 1 e so ROTACAO.
    // Como o three compoe pai*filho, a escala entra DEPOIS da rotacao — entao
    // qualquer calota girada cai exatamente sobre o elipsoide, sem deformar.
    const concha = new THREE.Group()
    concha.scale.set(BOLA.rx, BOLA.ry, BOLA.rz)
    olho.add(concha)

    // 1) o branco
    concha.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), brancoM)))

    // 2) o contorno, por casca invertida
    const contorno = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), contornoM)
    contorno.scale.setScalar(L_CONTORNO)
    contorno.castShadow = false
    contorno.receiveShadow = false
    concha.add(contorno)

    // 3) a pupila. Pequena, preta chapada e um pouco pra BAIXO e pra DENTRO —
    // e assim que ela esta nas duas fotos, e e o que faz os dois olhos parecerem
    // olhar pro mesmo ponto em vez de pra frente cada um.
    // 0.22 rad de meio-angulo = 22% do raio da bola. Nas fotos a pupila do Rick
    // tem por volta disso; passar de 0.30 ja le como olho de gato assustado.
    const pupila = flatPiece(new THREE.Mesh(calotaZ(0.22), tracoM))
    pupila.scale.setScalar(L_PUPILA)
    pupila.rotation.x = 0.20
    pupila.rotation.y = -sgn * 0.16
    concha.add(pupila)

    // 4) um ponto de brilho minusculo. Nas fotos ele nao existe (e desenho
    // chapado), mas em 3D sem ele o olho fica de vidro fosco: e o unico detalhe
    // que diz "molhado". Fica no canto de cima, fora da pupila.
    const brilho = flatPiece(new THREE.Mesh(calotaZ(0.085, 12, 6), brilhoM))
    brilho.scale.setScalar(L_PUPILA + 0.02)
    brilho.rotation.x = -0.42
    brilho.rotation.y = -sgn * 0.44
    concha.add(brilho)

    // 5) as palpebras.
    // AS DUAS PALPEBRAS VAO PRO MEIO, e nao a de cima ate embaixo.
    //
    // Foi a terceira tentativa. Mandar so a de cima ate a base (-1.02) parece o
    // certo e nao fecha: uma calota tem meio-angulo fixo (54 graus aqui), entao
    // quando o polo dela chega apontando pra baixo-frente ela ja DESCOBRIU o
    // topo da bola — o olho fechava embaixo e reabria em cima, com uma meia-lua
    // branca no alto. Da pra ver isso no render.
    // Duas palpebras indo pro meio fecham por construcao, e e o que um olho faz.
    //
    // Aberto (k = 0) a de cima para em +0.94: nas fotos ha um fio escuro
    // encostando no alto do branco mesmo com o olho bem aberto.
    // As duas bordas se CRUZAM no fim (-0.10 contra +0.02): sobrepor e o que
    // garante que nao sobre uma nesga de branco entre elas no ultimo degrau.
    const arco = mix(ARCO_ABERTO, ARCO_FECHADO, k)
    palpebra(concha, mix(0.94, -0.10, k), arco, peleM, fioM, false)
    palpebra(concha, mix(-0.99, 0.02, k), arco, peleM, fioM, true)

    g.add(olho)
  }
  return g
}

export const OLHO_CARTOON = {
  id: 'cartoon',
  nome: 'Desenho',
  name: 'Desenho',
  metodo: 'bola branca saliente + contorno por casca invertida + pupila chapada; a palpebra e uma calota tombada que varre do topo ao fim pela barra da aba',
  // Ele desenha a propria palpebra e nao quer a persiana generica por cima.
  propriaPalpebra: true,
  globo: { rx: BOLA.rx, ry: BOLA.ry, rz: BOLA.rz, x: EYE_ANCHOR.x * ESPACO, y: EYE_ANCHOR.y + 0.004 * S, sink: AFUNDA },
  build,
}

export default OLHO_CARTOON
