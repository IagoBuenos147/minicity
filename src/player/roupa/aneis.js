import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import { soldarNormais } from '../rosto/nucleo.js'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/aneis.js — ANEIS. Ancora: armL.hand (a mao ESQUERDA).
//
// Espaco da ancora: origem no PULSO, dedos descendo em -Y, palma virada pro
// corpo e polegar pra frente. A mao esquerda e o ESPELHO da direita, entao aqui
// a palma olha pra +X e o DORSO pra -X — e o dorso e o unico lado que a camera
// ve com o braco caido. Tudo que tem desenho (pedra, caveira) mora la.
//
// O anel deita na base do dedo ANELAR, 1,4 cm abaixo do no, e ali o dedo ja se
// curvou INCLINA_DEDO (0,26 rad) pra dentro da palma. Anel deitado no plano do
// chao corta o dedo em diagonal e afunda de um lado so — foi o bug que
// posDedo()/aro() do nucleo resolveram, e por isso nenhuma medida aqui e
// escrita a mao: os tres itens saem daquele par.
//
// A MANGA NAO COBRE: toda manga comprida do catalogo morre MANGA_FIM_Y (4,5 cm)
// ACIMA do pulso e o anel esta 10,2 cm ABAIXO dele. Nao existe combinacao de
// roupa que esconda esta peca — por isso ela nunca precisa de raio de folga.
//
// Esta e a menor peca do jogo (13 mm de raio) e a unica que so aparece em
// close: o provador tem um foco 'maos'. Entao ela e DETALHADA de proposito. O
// teto e 2500 triangulos e os tres itens gastam 1088, 548 e 832.
//
// OS TRES METODOS (o dono pediu um metodo diferente por item pra poder escolher
// qual combina com o jogo; dois itens que sao a mesma funcao com outra cor
// seriam uma falha, nao uma economia):
//
//   1. ALIANCA — LATHE DE PERFIL PROPRIO. A secao do aro e DESENHADA ponto a
//      ponto (parede reta por dentro, cupula por fora, chanfro nas duas bordas,
//      canaleta no meio) e revolvida no eixo do dedo. E o que separa uma
//      alianca de uma rosquinha: o toro tem secao circular e por isso so tem
//      UMA linha de brilho; o perfil proprio tem o filete da cupula, a quebra
//      do chanfro e a sombra da canaleta, tres leituras diferentes na mesma
//      peca. Um segundo lathe de metal contrastante preenche a canaleta.
//
//   2. SOLITARIO — MONTAGEM DE ENGASTE. O aro e o do nucleo; o valor da peca
//      esta na estrutura por cima: galeria conica, colar de aperto, quatro
//      garras que abracam o pavilhao e mordem a coroa com uma bolinha, e a
//      PEDRA. A pedra e uma esfera de 8 lados com o topo grampeado num plano —
//      vira mesa + coroa + pavilhao — e material de roughness baixa com um
//      pingo de emissive, que e o unico jeito de metal e gema brilharem numa
//      cena SEM environment map (metal puro sem reflexo sai preto).
//
//   3. SELO — SHAPE 2D EXTRUDADO. O aro e a chapa do selo saem de UM contorno
//      so: um circulo que, no lado do dorso, se abre em ombros e vira um plato
//      reto. ExtrudeGeometry com bevel arredonda as quinas nas duas bocas, e a
//      caveira e um SEGUNDO shape (com furos de orbita, nariz e dentes)
//      extrudado por cima de uma chapa oxidada — os furos revelam o escuro e e
//      isso que da leitura de joia "de carater" a 1 m.
//
// AS MEDIDAS ESTAO EM MILIMETRO. Em metro (0.01372) ninguem enxerga que dois
// numeros diferem em 3 decimos de milimetro, e foi assim que a primeira versao
// da canaleta nasceu por fora da cupula. MM converte na hora de virar geometria.
// ---------------------------------------------------------------------------

const MM = 0.001

// ---------------------------------------------------------------------------
// PLANTAR NO DEDO — comum aos tres. Isto e POSICAO, nao metodo.
// ---------------------------------------------------------------------------

/**
 * Grupo ja plantado na base do dedo anelar e inclinado como o dedo. Dentro dele
 * o quadro fica comodo: +Y sobe pelo dedo (rumo ao pulso), -X e o DORSO da mao
 * e +X a palma.
 *
 * E o MESMO quadro em que aro() deixa o toro dele: aro() gira (PI/2,
 * INCLINA_DEDO, 0), o que leva o eixo do toro pra reta (0.26, -0.97, 0) — a
 * mesma reta do +Y daqui. Entao peca do nucleo e peca desenhada aqui encaixam
 * sem correcao nenhuma.
 *
 * POR QUE NAO dorso(): dorso() anda em -X puro a partir do centro do aro, o que
 * ignora a inclinacao. Numa pedra a 8 mm do centro isso ja joga o engaste 2 mm
 * pro lado do pulso e inclina a joia 15 graus em relacao ao proprio aro que a
 * segura. Serve pra enfeite colado no aro; nao serve pra estrutura alta.
 */
function quadroDedo(c, o) {
  const p = N.posDedo(c, o)
  const g = new THREE.Group()
  g.position.set(p.x, p.y, p.z)
  g.rotation.z = N.INCLINA_DEDO
  return g
}

/** Perfil escrito em mm -> perfil em metro, do jeito que revolver() quer. */
const emMetros = (perfil) => perfil.map(([r, y]) => [r * MM, y * MM])

/** Polilinha de arco (graus, do g0 pro g1), em metros. */
function arco(r, g0, g1, n) {
  const pts = []
  for (let i = 0; i <= n; i++) {
    const a = ((g0 + (g1 - g0) * (i / n)) * Math.PI) / 180
    pts.push(new THREE.Vector2(Math.cos(a) * r * MM, Math.sin(a) * r * MM))
  }
  return pts
}

/** Elipse como polilinha ANTI-HORARIA (o sentido que ExtrudeGeometry quer num
 *  furo, ver extrudar()). */
function elipse(cx, cy, rx, ry, giro, n) {
  const pts = []
  const cg = Math.cos(giro), sg = Math.sin(giro)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry
    pts.push(new THREE.Vector2((cx + x * cg - y * sg) * MM, (cy + x * sg + y * cg) * MM))
  }
  return pts
}

/** Lista de pares [x,y] em mm -> Vector2 em metro. */
const vet = (lista) => lista.map(([x, y]) => new THREE.Vector2(x * MM, y * MM))

/**
 * Extrusao com as duas correcoes que esta peca precisa.
 *
 * 1. SENTIDO. ExtrudeGeometry so normaliza os furos quando o contorno de fora
 *    esta ANTI-HORARIO (ele inverte os dois juntos). Com o contorno ja horario
 *    — que e o caso aqui — os furos passam intactos, e furo no sentido errado
 *    sai com as paredes viradas pra dentro: da pra ver o mundo atraves do dedo.
 *    Regra da casa: contorno HORARIO, furo ANTI-HORARIO.
 * 2. NORMAIS. ExtrudeGeometry sai NAO INDEXADA, entao computeVertexNormals da a
 *    cada vertice a normal da FACE dele e o aro fica facetado como uma porca
 *    sextavada — exatamente o "parece um bloco" que esta reforma veio apagar.
 *    soldarNormais costura as normais dos vertices coincidentes: a volta fica
 *    lisa e o chanfro vira um filete arredondado, sem custar um triangulo.
 *
 * E o que NAO da pra corrigir aqui, mas todo mundo tem que saber: o chanfro do
 * three INFLA O MEIO, nao encolhe as pontas. As duas bocas ficam no contorno que
 * voce desenhou e o corpo entre elas sai bevelSize MAIOR pra fora — e, no furo,
 * bevelSize MENOR. Medido: contorno 1.0/furo 0.5 com chanfro 0.1 vira 1.1/0.4.
 * Entao o furo tem que ser desenhado com o chanfro somado (senao o aro aperta o
 * dedo no meio, que e onde ele mais aperta) e o que for grudado numa face tem
 * que ser afastado do desenho pelo mesmo tanto (a chapa do selo nasceu enterrada
 * dentro do plato assim).
 */
function extrudar(forma, prof, chanfro) {
  const geo = new THREE.ExtrudeGeometry(forma, {
    depth: prof,
    steps: 1,
    curveSegments: 1,
    bevelEnabled: chanfro > 0,
    bevelSegments: 1,
    bevelThickness: chanfro,
    bevelSize: chanfro,
    bevelOffset: 0,
  })
  geo.translate(0, 0, -prof / 2)
  soldarNormais(geo)
  return geo
}


// ===========================================================================
// 1. ALIANCA DE CONFORTO — perfil de secao proprio, revolvido
// ===========================================================================
// A secao e um LOOP FECHADO no plano (raio, altura). O sentido importa: parede
// de fora percorrida de baixo pra cima, tampa de cima de fora pra dentro,
// parede de dentro de cima pra baixo. Nesse sentido a lathe do three gera as
// faces pra fora; invertido, o anel aparece so por dentro do dedo.
//
// FURO 10,50 mm: nao e chute nem a conta do aro() do nucleo — e medida. Levando
// os vertices da MALHA da mao pro plano do aro, o dedo anelar chega a 10,14 mm
// do eixo (o dedo tem 9,6 mm de meio-eixo e ainda entra inclinado, o que engorda
// a secao aparente). Com 32 lados o poligono inscrito de um furo de 10,50 mede
// 10,45, entao sobram 0,3 mm e o metal nao afunda na carne.
//
// A "cupula" nao e enfeite: parede reta por fora devolve um brilho chapado que
// le como plastico. O ponto alto em 13,72 com quebra em 13,20 poe uma linha de
// luz que corre a volta inteira do dedo, que e o que faz o objeto parecer metal.
const SECAO_ALIANCA = [
  [10.90, -3.75], // borda de baixo, no lado de dentro
  [12.10, -3.75], // face de baixo (1,2 mm de topo reto)
  [13.20, -2.50], // chanfro de baixo
  [13.72, -1.40], // crista da cupula
  [13.40, -1.20], // parede da canaleta
  [13.38, 0.00],  // fundo da canaleta
  [13.40, 1.20],
  [13.72, 1.40],
  [13.20, 2.50],
  [12.10, 3.75],
  [10.90, 3.75],  // borda de cima, no lado de dentro
  [10.50, 0.00],  // barriga de conforto: o furo aperta so no meio
  [10.90, -3.75], // fecha o loop
]

// O filete que mora dentro da canaleta. Nasce ENTERRADO (13,25 contra os 13,38
// do fundo) e para ABAIXO da crista (13,58 contra 13,72): enterrado nao briga
// no depth buffer com o fundo e recuado le como embutido em vez de colado.
// A folga de 0,1 mm nas laterais e de proposito — vira a linha escura da junta
// dos dois metais.
const SECAO_FILETE = [
  [13.25, -1.10],
  [13.55, -1.10],
  [13.58, 0.00],
  [13.55, 1.10],
  [13.25, 1.10],
  [13.25, -1.10],
]

// 32 voltas: a peca so aparece em close e com 20 (o padrao do revolver) a
// silhueta do aro fica visivelmente poligonal a 30 cm de camera.
const VOLTAS_ALIANCA = 32


// ===========================================================================
// 2. SOLITARIO — engaste montado peca a peca
// ===========================================================================

// Onde o topo da esfera e grampeado. Os aneis de theta de uma esfera de 5
// faixas caem em y = 1, 0.809, 0.309, -0.309, -0.809, -1. Grampear em 0.62
// derruba o POLO e o PRIMEIRO ANEL no mesmo plano: o leque do polo vira o
// octogono da MESA e a faixa seguinte vira as facetas da COROA. Sem isso a
// esfera continua uma bolinha, e bolinha nao le como pedra lapidada.
const MESA = 0.62

/**
 * Pedra lapidada barata: esfera de 8 lados com a mesa grampeada, esticada nos
 * eixos da gema e ja virada pro dorso da mao. 64 triangulos.
 * As normais ficam desatualizadas de proposito — o material e flatShading, e
 * flatShading no three sai da derivada da posicao na tela, nao do atributo.
 */
function pedraLapidada(rCintura, meiaAltura, mat) {
  const g = new THREE.SphereGeometry(1, 8, 5)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > MESA) pos.setY(i, MESA)
  pos.needsUpdate = true
  g.scale(rCintura * MM, meiaAltura * MM, rCintura * MM)
  g.rotateZ(Math.PI / 2) // +Y da esfera vira -X: a mesa olha pro dorso da mao
  return N.sh(new THREE.Mesh(g, mat))
}

/**
 * Uma garra: haste conica do fundo da galeria ate a cintura da pedra, mais a
 * bolinha que dobra por cima da coroa.
 *
 * A haste NAO aponta pro centro da pedra, ela ABRE (2,90 -> 3,60 mm de raio
 * enquanto sobe): o pavilhao afina pra baixo, entao garra reta encostaria so na
 * ponta e ficaria com um vao de 1 mm no meio. Assim ela raspa o pavilhao a
 * altura toda e encosta na cintura, que e como garra segura pedra.
 *
 * A BOLINHA existe porque a coroa e CONVEXA: qualquer segmento reto entre dois
 * pontos da superficie passa por dentro dela. Uma garra reta dobrada sobre a
 * mesa atravessaria a gema. A bolinha e o unico ponto de contato la em cima e
 * de quebra e o que mais brilha na peca.
 */
function garra(azimute, mat) {
  const g = new THREE.Group()
  const ca = Math.cos(azimute), sa = Math.sin(azimute)
  const base = new THREE.Vector3(-14.0 * MM, 2.90 * MM * ca, 2.90 * MM * sa)
  const topo = new THREE.Vector3(-17.90 * MM, 3.60 * MM * ca, 3.60 * MM * sa)
  const eixo = new THREE.Vector3().subVectors(topo, base)
  const comp = eixo.length()
  const haste = N.malha(new THREE.CylinderGeometry(0.46 * MM, 0.62 * MM, comp, 5), mat)
  haste.position.copy(base).addScaledVector(eixo, 0.5)
  haste.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eixo.normalize())
  g.add(haste)
  const ponta = N.malha(new THREE.SphereGeometry(0.55 * MM, 5, 4), mat,
    -18.55 * MM, 3.32 * MM * ca, 3.32 * MM * sa)
  g.add(ponta)
  return g
}


// ===========================================================================
// 3. SELO — um contorno so vira aro e chapa
// ===========================================================================

// O contorno do aro visto DE CIMA DO DEDO (o plano em que ele e extrudado).
// Circulo de 13,2 mm no lado da palma; a partir de +-122 graus ele abre em
// ombros e termina num plato reto a 15,8 mm do eixo. O plato e a face do selo:
// 2,6 mm mais alto que o aro, que e o que da o degrau de joia de sinete em vez
// de um adesivo colado no anel.
const PLATO_X = -15.80          // face do selo COMO DESENHADA (ver CHANFRO_ARO)
const PLATO_Y = 4.30            // meia-largura do trecho reto
const CHANFRO_ARO = 0.35
const FURO_SELO = 10.55         // furo QUE SE QUER no meio do aro
const OMBRO_SELO = [
  [-9.60, -10.60],
  [-11.90, -9.20],
  [-13.70, -7.40],
  [-15.10, -5.90],
  [-15.65, -5.00],
  [PLATO_X, -PLATO_Y],
  [PLATO_X, PLATO_Y],
  [-15.65, 5.00],
  [-15.10, 5.90],
  [-13.70, 7.40],
  [-11.90, 9.20],
  [-9.60, 10.60],
]

// Caveira desenhada por METADE e espelhada: e a unica forma de garantir que o
// cranio saia simetrico depois de dez ajustes de ponto. O contorno comeca no
// topo e desce pelo lado +x, entao a volta fica HORARIA (o que extrudar() quer).
const CAVEIRA_MEIA = [
  [0.00, 3.50],
  [1.20, 3.40],
  [2.30, 2.90],
  [3.00, 2.00],
  [3.20, 0.90],  // tempora
  [3.00, 0.10],
  [2.20, -0.50], // maca do rosto
  [2.00, -1.30],
  [1.90, -2.40], // mandibula
  [1.30, -3.10],
  [0.00, -3.30], // queixo
]

// Boca: faixa com a borda de baixo em zigue-zague. Tres dentes desenhados um a
// um custariam tres furos a mais na triangulacao e a 1 m nao se distinguem
// deste recorte unico.
// Boca e nariz sao FUROS, entao vao ANTI-HORARIOS (ver extrudar()): a lista
// esta escrita da esquerda pra direita por cima e volta por baixo.
const BOCA = [
  [-1.45, -2.35], [-0.90, -2.35], [-0.30, -1.85], [0.30, -2.35],
  [0.90, -1.85], [1.45, -2.35], [1.45, -1.55], [-1.45, -1.55],
]

const NARIZ = [[0.00, 0.50], [-0.62, -0.75], [0.62, -0.75]]

/** Contorno fechado da caveira (meia + espelho), no sentido horario. */
function contornoCaveira() {
  const p = CAVEIRA_MEIA.slice()
  for (let i = CAVEIRA_MEIA.length - 2; i >= 1; i--) {
    p.push([-CAVEIRA_MEIA[i][0], CAVEIRA_MEIA[i][1]])
  }
  return vet(p)
}

/** Retangulo de cantos redondos, HORARIO (contorno de fora, ver extrudar()). */
function chapaFundo(w, h, r, n) {
  const pts = []
  // (+x,+y) -> (+x,-y) -> (-x,-y) -> (-x,+y), cada canto varrido 90 graus pra tras
  for (const [sx, sy, ini] of [[1, 1, 90], [1, -1, 0], [-1, -1, -90], [-1, 1, 180]]) {
    const cx = sx * (w / 2 - r), cy = sy * (h / 2 - r)
    for (let i = 0; i <= n; i++) {
      const a = ((ini - (i / n) * 90) * Math.PI) / 180
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  return pts
}


export const ANEIS = [
  { id: 'nenhum', nome: 'Nenhum', metodo: 'slot vazio', build() { return null } },

  {
    id: 'alianca-conforto',
    nome: 'Alianca de conforto',
    metodo: 'lathe de PERFIL PROPRIO: secao fechada (parede reta, cupula, chanfro nas duas bordas, canaleta) revolvida no eixo do dedo, com um segundo lathe de metal claro embutido na canaleta',
    build(c) {
      const g = quadroDedo(c)
      // Ouro rose contra o filete de ouro branco. Dois metais na mesma peca e o
      // que faz a canaleta LER como canaleta: com um metal so, a sombra dela
      // some no primeiro sol que bate de frente.
      g.add(N.sh(new THREE.Mesh(
        N.revolver(emMetros(SECAO_ALIANCA), VOLTAS_ALIANCA), N.metal(0xc9927c),
      )))
      g.add(N.sh(new THREE.Mesh(
        N.revolver(emMetros(SECAO_FILETE), VOLTAS_ALIANCA), N.metal(0xdfe3e6),
      )))
      return g
    },
  },

  {
    id: 'solitario-garras',
    nome: 'Solitario de garras',
    metodo: 'engaste montado: aro do nucleo + galeria conica + colar + quatro garras que abracam o pavilhao, segurando uma esfera de 8 lados com a mesa grampeada (flatShading + emissive, que e como pedra brilha sem environment map)',
    build(c) {
      const g = new THREE.Group()
      const branco = N.metal(0xd0d5da)
      // O aro sai do nucleo de proposito: ele ja resolve posicao e inclinacao, e
      // num solitario o aro e so o suporte — o que a camera olha e o engaste.
      // Furo 10,7 mm (e nao os 10,4 do padrao): o toro do nucleo da 14 lados, e
      // o poligono INSCRITO num furo de 10,4 mede 10,14 — exatamente o raio do
      // dedo medido na malha. Empatado assim, um vertice de pele fura o metal.
      g.add(N.aro(c, branco, { r: 0.0127, t: 0.0020 }))

      const eng = quadroDedo(c)
      g.add(eng)

      // GALERIA: cone aberto, boca larga pra fora. O fundo dele (-13,8 mm)
      // nasce DENTRO do aro (que termina em -14,7 mm), entao os dois se soldam
      // sozinhos; galeria pousada na superficie do aro deixa uma fresta que
      // acende quando o sol passa por tras da mao.
      const galeria = N.malha(
        new THREE.CylinderGeometry(4.4 * MM, 2.4 * MM, 3.4 * MM, 8, 1, true), branco)
      galeria.rotation.z = Math.PI / 2 // +Y do cilindro vira -X: boca pro dorso
      galeria.position.x = -15.5 * MM
      soldarNormais(galeria.geometry)
      eng.add(galeria)

      // COLAR de aperto na boca da galeria: morde 0,2 mm no pavilhao e some a
      // junta entre pedra e metal, que e o lugar onde o olho procura o erro.
      const colar = N.malha(new THREE.TorusGeometry(3.9 * MM, 0.55 * MM, 5, 10), branco)
      colar.rotation.y = Math.PI / 2
      colar.position.x = -17.0 * MM
      eng.add(colar)

      for (let i = 0; i < 4; i++) eng.add(garra(Math.PI / 4 + i * Math.PI / 2, branco))

      // Safira: roughness quase zero pro especular virar um ponto duro, e um
      // pingo de emissive porque a cena nao tem environment map — sem ele a
      // gema fica um vidro fosco e some contra o metal na sombra do corpo.
      const gema = solid(0x2f6fd6, 0.05, 0.0, {
        flatShading: true, emissive: 0x123a86, emissiveIntensity: 0.55,
      })
      const p = pedraLapidada(3.6, 3.4, gema)
      p.position.x = -17.6 * MM
      eng.add(p)
      return g
    },
  },

  {
    id: 'selo-caveira',
    nome: 'Selo de caveira',
    metodo: 'shape 2D extrudado: aro e chapa saem de UM contorno so (circulo que abre em ombros e vira plato), e a caveira e um segundo shape com furos de orbita/nariz/dentes extrudado sobre uma chapa oxidada',
    build(c) {
      const g = quadroDedo(c)
      const prata = N.metal(0xaeb3b9)

      // --- o aro e o plato, de uma peca so -------------------------------
      const contorno = arco(13.2, 122, -122, 21).concat(vet(OMBRO_SELO))
      const forma = new THREE.Shape()
      forma.setFromPoints(contorno)
      const furo = new THREE.Path()
      // furo desenhado com o chanfro SOMADO: o chanfro do three come esse tanto
      // do furo no meio da extrusao, que e justamente onde o dedo e mais gordo
      const rFuro = FURO_SELO + CHANFRO_ARO
      furo.setFromPoints(elipse(0, 0, rFuro, rFuro, 0, 16))
      forma.holes.push(furo)
      const aro = N.sh(new THREE.Mesh(extrudar(forma, 8.8 * MM, CHANFRO_ARO * MM), prata))
      // O shape e extrudado em +Z; girar a GEOMETRIA (e nao a malha) poe o eixo
      // da extrusao no dedo e deixa a malha livre pra so herdar a inclinacao do
      // grupo. Depois disso: x do shape = x do grupo (o plato cai no dorso, em
      // -x) e y do shape = -z (a largura da chapa atravessa a mao).
      aro.geometry.rotateX(-Math.PI / 2)
      g.add(aro)

      // A FACE DE VERDADE nao esta em PLATO_X: o chanfro inflou o meio da
      // extrusao pra fora. Quem esquece isso encosta a chapa no numero do
      // desenho e ela nasce enterrada dentro do plato, invisivel.
      const FACE = PLATO_X - CHANFRO_ARO
      const ESP_CHAPA = 0.25
      const FACE_CHAPA = FACE + 0.02 - ESP_CHAPA  // 0,02 de mordida no plato

      // --- chapa oxidada: o fundo que aparece pelos furos da caveira -----
      const fundo = new THREE.Shape()
      fundo.setFromPoints(vet(chapaFundo(7.8, 8.0, 1.3, 2)))
      const chapa = N.sh(new THREE.Mesh(
        extrudar(fundo, ESP_CHAPA * MM, 0), solid(0x25232a, 0.62, 0.12)))
      chapa.geometry.rotateY(-Math.PI / 2) // extrusao vira -X: cresce pro dorso
      // extrudar() CENTRA a extrusao, entao a posicao e o MEIO da peca: da face
      // de fora pra dentro, meia espessura. A mordida existe pra junta nao ficar
      // coplanar com o plato; superficie exatamente colada pisca com a camera.
      chapa.position.x = (FACE_CHAPA + ESP_CHAPA / 2) * MM
      g.add(chapa)

      // --- a caveira, em relevo por cima ---------------------------------
      const PROF_CAV = 0.70, CH_CAV = 0.09
      const cav = new THREE.Shape()
      cav.setFromPoints(contornoCaveira())
      cav.holes.push(new THREE.Path().setFromPoints(elipse(1.55, 1.30, 1.15, 1.00, -0.22, 8)))
      cav.holes.push(new THREE.Path().setFromPoints(elipse(-1.55, 1.30, 1.15, 1.00, 0.22, 8)))
      cav.holes.push(new THREE.Path().setFromPoints(vet(NARIZ)))
      cav.holes.push(new THREE.Path().setFromPoints(vet(BOCA)))
      // Chanfro de 0,09 mm e nao de 0,12: no bico dos dentes e do nariz o
      // chanfro anda pela BISSETRIZ, o que num angulo agudo vale o dobro do
      // numero pedido. Com 0,12 a boca fechava sozinha.
      const cranio = N.sh(new THREE.Mesh(
        extrudar(cav, PROF_CAV * MM, CH_CAV * MM), N.metal(0xc9ced4)))
      cranio.geometry.rotateY(-Math.PI / 2)
      // Quase 1 mm de relevo sobre a chapa: a orbita vira um poco fundo e a
      // caveira continua legivel a contra-luz, que e quando ela mais importa.
      cranio.position.x = (FACE_CHAPA + 0.03 - (PROF_CAV / 2 + CH_CAV)) * MM
      g.add(cranio)
      return g
    },
  },
]

export default ANEIS
