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
//
// ESTES NUMEROS JA SAO 20% MENORES que a primeira versao. Ela nasceu com
// rx 0.0500, e o dono pediu pra diminuir cerca de 20% — "os olhos ficaram bons,
// porem muito grandes". Diminuir a BOLA e a unica coisa que muda aqui: a
// pupila, o brilho, o contorno e as palpebras sao todos medidos em RAIOS DA
// BOLA, entao encolhem junto e a proporcao interna do olho fica intacta.
const BOLA = { rx: 0.0400 * S, ry: 0.0448 * S, rz: 0.0344 * S }

// Quanto da bola fica DENTRO da cabeca. Nos outros olhos do jogo isso fica
// entre 0.62 e 0.84 (olho encaixado na orbita); aqui e 0.40 de proposito — nas
// fotos a bola SALTA da cara, e e esse salto que faz metade da semelhanca.
const AFUNDA = 0.40

// Os dois ovais quase se tocam no meio do rosto.
// Caiu de 1.02 pra 0.93 junto com a bola: os CENTROS dos olhos sao fixos
// (EYE_ANCHOR), entao encolher a bola sem aproximar os centros abriria uma
// faixa de rosto entre os dois que nao existe na referencia.
const ESPACO = 0.93

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
function palpebra(concha, alturaRim, arco, peleM, fioM, baixo, roll) {
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
  // `roll` INCLINA a linha da palpebra. O polo da calota esta em +Y; girar em Z
  // leva o polo pro lado, e com isso a borda deixa de ser horizontal. Positivo
  // derruba o canto de FORA (cara cansada, sarcastica); negativo levanta ele
  // (cara desperta). E a diferenca entre os tres olhos deste arquivo que mais
  // muda a EXPRESSAO — mexer so no tamanho da bola muda a idade do personagem,
  // mexer no roll muda o humor dele.
  const r = roll || 0

  const fio = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, arco + 0.075), fioM))
  fio.scale.setScalar(L_FIO)
  fio.rotation.set(base, 0, r)
  concha.add(fio)

  const pele = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, arco), peleM))
  pele.scale.setScalar(L_PALPEBRA)
  pele.rotation.set(base, 0, r)
  concha.add(pele)
}

/**
 * OS TRES OLHOS DESTE ARQUIVO SAO O MESMO MODELO com a tabela trocada.
 *
 * O dono pediu "mais 2 olhos similares a ele, o mesmo olho porem com aspectos
 * diferentes pra diferenciar, pois o olho ja ficou bom". Entao aqui NAO se
 * inventa metodo novo: `fabricar()` e a peca inteira, e cada entrada do
 * catalogo e so um conjunto de numeros. Assim os tres continuam sendo o mesmo
 * desenho, e qualquer conserto num deles conserta nos tres.
 *
 * Os campos que diferenciam, e o que cada um faz na CARA:
 *   escala   tamanho da bola. Muda a idade que o personagem aparenta
 *   achata   ry / rx. > 1 e oval em pe (Rick), 1 e redondo (Morty), < 1 e
 *            oval deitado, que le como olho apertado
 *   afunda   quanto a bola entra na cabeca. Baixo = esbugalhado
 *   espaco   distancia entre os dois
 *   pupila   raio angular da pupila, em radianos
 *   olhaY    quanto a pupila desce (positivo) ou sobe (negativo)
 *   olhaX    quanto ela converge pro nariz
 *   roll     inclinacao da linha da palpebra (ver palpebra())
 *   linha    espessura do contorno preto
 */
function fabricar(cfg, ctx) {
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
    // ASSIMETRIA: o unico campo que faz os dois olhos serem DIFERENTES.
    //
    // Todos os outros ajustes valem igual pros dois, e e por isso que os tres
    // primeiros olhos sairam parecidos demais por mais que os numeros mudassem:
    // um par de bolas simetricas com pupila simetrica sempre le como "o mesmo
    // olho, um pouco maior ou menor". Quebrar a simetria muda a CARA, e nao o
    // olho — e o efeito e desproporcional ao tamanho do numero.
    //
    // Por isso o raio sai de dentro do laco: com ele fora, os dois olhos
    // obrigatoriamente compartilham o mesmo tamanho.
    const fator = sgn < 0 ? (cfg.assim || 1) : 1
    const rx = BOLA.rx * cfg.escala * fator
    const ry = BOLA.ry * cfg.escala * cfg.achata * fator
    const rz = BOLA.rz * cfg.escala * fator

    const olho = new THREE.Group()
    const x = EYE_ANCHOR.x * cfg.espaco * spread
    const y = EYE_ANCHOR.y + 0.004 * S
    olho.position.set(sgn * x, y, surfaceZ(sgn * x, y) - rz * cfg.afunda)

    // A concha carrega a escala; tudo dentro dela tem raio 1 e so ROTACAO.
    // Como o three compoe pai*filho, a escala entra DEPOIS da rotacao — entao
    // qualquer calota girada cai exatamente sobre o elipsoide, sem deformar.
    const concha = new THREE.Group()
    concha.scale.set(rx, ry, rz)
    olho.add(concha)

    // 1) o branco
    concha.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), brancoM)))

    // 2) o contorno, por casca invertida
    const contorno = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), contornoM)
    contorno.scale.setScalar(1 + (L_CONTORNO - 1) * cfg.linha)
    contorno.castShadow = false
    contorno.receiveShadow = false
    concha.add(contorno)

    // 3) a pupila. Pequena, preta chapada e um pouco pra BAIXO e pra DENTRO —
    // e assim que ela esta nas duas fotos, e e o que faz os dois olhos parecerem
    // olhar pro mesmo ponto em vez de pra frente cada um.
    // 0.22 rad de meio-angulo = 22% do raio da bola. Nas fotos a pupila do Rick
    // tem por volta disso; passar de 0.30 ja le como olho de gato assustado.
    // No olho assimetrico a pupila do lado menor olha um pouco pra outro lado
    // (`desvio`). E ela que fecha a leitura: com os dois olhares paralelos, um
    // olho maior le so como erro de modelagem; com o olhar torto, le como cara.
    const desvio = sgn < 0 ? (cfg.desvio || 0) : 0
    const pupila = flatPiece(new THREE.Mesh(calotaZ(cfg.pupila), tracoM))
    pupila.scale.setScalar(L_PUPILA)
    pupila.rotation.x = cfg.olhaY + desvio * 0.55
    pupila.rotation.y = -sgn * cfg.olhaX + desvio
    concha.add(pupila)

    // 4) um ponto de brilho minusculo. Nas fotos ele nao existe (e desenho
    // chapado), mas em 3D sem ele o olho fica de vidro fosco: e o unico detalhe
    // que diz "molhado". Fica no canto de cima, fora da pupila.
    const brilho = flatPiece(new THREE.Mesh(calotaZ(0.085, 12, 6), brilhoM))
    brilho.scale.setScalar(L_PUPILA + 0.02)
    brilho.rotation.x = cfg.olhaY - 0.62
    brilho.rotation.y = -sgn * (cfg.olhaX + 0.28)
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
    // O roll some conforme o olho fecha: com as duas palpebras encostando, uma
    // inclinada e a outra tambem deixaria as bordas se cruzarem em X em vez de
    // se encontrarem, e sobraria uma fresta branca numa das pontas.
    const roll = -sgn * cfg.roll * (1 - k)
    // `tampa` e onde a palpebra de CIMA descansa com o olho aberto. 0.94 e o
    // padrao (so um fio escuro encostando no alto do branco). Baixar isso e a
    // outra forma de mudar a cara sem mexer na bola: com 0.45 a palpebra cobre
    // um terco do olho o tempo todo e o personagem passa a ter olhar pesado,
    // seja qual for o tamanho da pupila. O fim do curso continua em -0.10, entao
    // a barra de fechar os olhos segue funcionando igual.
    palpebra(concha, mix(cfg.tampa, -0.10, k), arco, peleM, fioM, false, roll)
    palpebra(concha, mix(-0.99, 0.02, k), arco, peleM, fioM, true, roll * 0.45)

    g.add(olho)
  }
  return g
}

const BASE = {
  escala: 1, achata: 1, afunda: AFUNDA, espaco: ESPACO,
  pupila: 0.22, olhaY: 0.20, olhaX: 0.16, roll: 0, linha: 1,
  // Os tres campos "ousados", todos neutros por padrao — os tres primeiros
  // olhos nao mudam em nada com eles aqui:
  //   tampa   altura de descanso da palpebra de cima (0.94 = so um fio)
  //   assim   quanto o olho ESQUERDO e maior/menor que o direito (1 = iguais)
  //   desvio  quanto a pupila desse olho olha pra outro lado
  tampa: 0.94, assim: 1, desvio: 0,
}

function item(id, nome, metodo, cfg) {
  const c = Object.assign({}, BASE, cfg)
  return {
    id,
    nome,
    name: nome,
    metodo,
    // Os tres desenham a propria palpebra e nao querem a persiana generica.
    propriaPalpebra: true,
    globo: {
      rx: BOLA.rx * c.escala,
      ry: BOLA.ry * c.escala * c.achata,
      rz: BOLA.rz * c.escala,
      x: EYE_ANCHOR.x * c.espaco,
      y: EYE_ANCHOR.y + 0.004 * S,
      sink: c.afunda,
    },
    build(ctx) { return fabricar(c, ctx) },
  }
}

// O da referencia, ja 20% menor que a primeira versao.
export const OLHO_CARTOON = item(
  'cartoon', 'Desenho',
  'bola branca saliente + contorno por casca invertida + pupila chapada; a palpebra e uma calota tombada que varre do topo ao fim pela barra da aba',
  {},
)

// REDONDO — o outro personagem da mesma referencia. A bola e circular de frente
// (achata 1), a pupila e proporcionalmente MAIOR, os dois olhos ficam mais
// juntos e a bola salta menos. Isso sozinho ja tira uns quinze anos da cara: o
// oval em pe com pupila pequena le como adulto, o redondo com pupila grande le
// como garoto.
export const OLHO_CARTOON_REDONDO = item(
  'cartoon-redondo', 'Desenho redondo',
  'o mesmo desenho com a bola circular, pupila grande e os olhos mais juntos — a leitura jovem da referencia',
  { escala: 0.96, achata: 0.90, afunda: 0.48, espaco: 0.88, pupila: 0.30, olhaY: 0.16, olhaX: 0.20 },
)

// CAIDO — a cara da segunda foto: olho um pouco mais deitado, pupila menor e
// mais alta (o branco aparece embaixo dela, que e o que da o ar de tedio) e a
// linha da palpebra INCLINADA, com o canto de fora caindo. O contorno e um
// pouco mais grosso, que pesa o olhar.
export const OLHO_CARTOON_CAIDO = item(
  'cartoon-caido', 'Desenho caido',
  'o mesmo desenho com a linha da palpebra inclinada (canto de fora pra baixo), pupila pequena e alta e contorno mais grosso — a leitura entediada da referencia',
  { escala: 0.98, achata: 0.86, afunda: 0.44, espaco: 0.95, pupila: 0.19, olhaY: -0.06, olhaX: 0.13, roll: 0.30, linha: 1.35 },
)

// ---------------------------------------------------------------------------
// OS DOIS OUSADOS
//
// "os 3 estao muito parecidos". Estavam mesmo, e o motivo e estrutural: ate
// aqui todo campo do catalogo era um NUMERO aplicado IGUALMENTE nos dois olhos
// — tamanho, achatamento, pupila, espaco. Mexer nesses numeros faz o mesmo olho
// ficar maior, menor ou mais deitado, mas nunca faz uma CARA diferente, porque
// a estrutura (duas bolas iguais, olhando pro mesmo ponto, com a palpebra
// encostada no alto) nunca muda.
//
// Estes dois mexem na estrutura, cada um de um jeito:
//   TORTO   quebra a SIMETRIA entre os dois olhos
//   FENDA   tira a palpebra do repouso e a joga por cima do olho
// ---------------------------------------------------------------------------

// TORTO — um olho 26% maior que o outro, e a pupila do menor olhando pro lado.
// E o recurso mais forte que existe num rosto de desenho e o mais barato de
// errar: com 1.5 vira deformidade e com 1.1 ninguem percebe. 1.26 e o ponto em
// que o olhar fica esquisito de proposito e o rosto continua sendo um rosto.
export const OLHO_CARTOON_TORTO = item(
  'cartoon-torto', 'Desenho torto',
  'quebra a simetria: um olho 26% maior que o outro e a pupila do menor desviada — o unico do catalogo em que os dois olhos nao sao iguais',
  { escala: 1.02, achata: 0.96, afunda: 0.38, espaco: 0.90, pupila: 0.20, olhaY: 0.14, olhaX: 0.10, assim: 1.26, desvio: 0.30, linha: 1.1 },
)

// FENDA — a palpebra de cima descansa em 0.42 em vez de 0.94, entao ela cobre
// permanentemente o terco de cima da bola, e o `roll` alto joga o canto de fora
// pra baixo. A bola e deitada (achata 0.78) e a pupila e minuscula (0.13). O
// conjunto le como olhar pesado — e a barra de fechar os olhos continua indo
// ate o fim normalmente, porque o fim do curso nao mudou.
export const OLHO_CARTOON_FENDA = item(
  'cartoon-fenda', 'Desenho em fenda',
  'a palpebra de cima descansa cobrindo um terco do olho e o canto de fora cai — bola deitada e pupila minuscula completam o olhar pesado',
  { escala: 1.04, achata: 0.78, afunda: 0.46, espaco: 0.97, pupila: 0.13, olhaY: 0.08, olhaX: 0.12, roll: 0.52, linha: 1.25, tampa: 0.42 },
)

export default OLHO_CARTOON
