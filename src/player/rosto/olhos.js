import * as THREE from 'three'
import { solid, stdMat, tex } from '../../world/materials.js'
import {
  HEAD_S, EYE_ANCHOR, useHead, surfaceZ, faceSpread, skinOf, hairColorFrom,
  shade, mixHex, mix, clamp, smoothstep, sh, flatPiece, wrapToHead, extrudeOpts,
  tecelagem, fio, rng, soldarNormais,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/olhos.js — CINCO OLHOS, CINCO METODOS DE CONSTRUCAO.
//
// O olho e a peca que manda no rosto: e a unica que o jogador procura antes de
// qualquer outra coisa, e um olho errado estraga um cranio bem esculpido. O
// pedido foi explicito — nao cinco olhos com o mesmo metodo e outro numero, e
// sim cinco jeitos ESTRUTURALMENTE diferentes de fabricar um olho, pra dar pra
// testar qual combina com o jogo. Entao aqui cada item difere em:
//   como a abertura e desenhada, como a palpebra vira geometria, como a iris e
//   pintada e como o brilho especular e produzido.
//
//   0 polar     UMA CALOTA SO, com esclera + fibras + anel limbal + pupila +
//               brilho + transicao pra pele PINTADOS numa textura POLAR. O mapa
//               UV de uma calota ja e um sistema polar (coluna = angulo, linha
//               = raio), entao fibra de iris — impossivel em geometria — sai de
//               graca. As palpebras sao FAIXAS VARRIDAS ao longo da curva da
//               margem, nao calotas: e isso que da canto interno e externo com
//               forma propria.
//   1 casca     UMA SUPERFICIE SO: sai da pele, sobe formando a dobra da
//               palpebra e volta pro fundo da orbita. Nao ha globo — a orbita e
//               a propria pele deformada e o olho e um disco levemente convexo
//               no fundo dela. As fibras da iris sao feitas com a MALHA (cunhas
//               alternadas em tres tons), sem textura nenhuma. E de longe o
//               mais barato dos cinco: 804 triangulos por olho, contra 3056 do
//               'calotas' e 3196 do 'recorte'.
//   2 recorte   A ABERTURA E UM SHAPE 2D com furo, extrudado e projetado na
//               pele (wrapToHead): a palpebra vira uma MOLDURA com espessura de
//               verdade e o olho aparece so por dentro dela. Iris e pupila
//               seguem o mesmo metodo (Shape com furo), entao a pupila e um
//               POCO real, nao um circulo preto pintado.
//   3 lente     Estilizado da referencia: globo pequeno bem enterrado, esclera
//               reduzida e pintada so com sombra, IRIS TORNEADA (LatheGeometry:
//               o perfil e revolucionado, entao o anel limbal e um DEGRAU de
//               verdade e a pupila e um poco), palpebra que e um ROLO fino
//               (TubeGeometry ao longo da margem) e cilios que sao FIOS.
//   4 calotas   GLOBO + CALOTAS EMPILHADAS. Esfera cor de pele, calota de
//               esclera na frente, calotas concentricas de limbo/iris/pupila e
//               palpebras que sao calotas de pele tombadas. E o metodo
//               classico, aqui com as folgas radiais medidas.
//
// A ORDEM DO CATALOGO E JULGAMENTO, NAO HISTORIA. O indice 0 e o olho que um
// jogador novo GANHA (protocolo.js, APARENCIA_DEFAULT usa olhos: 0), entao o
// melhor dos cinco tem que estar nele. Na folha de contato de perto o 'polar'
// foi o unico que leu como olho de verdade em todos os cranios, e o 'calotas'
// foi o pior — por isso a lista comeca no polar e termina no calotas. Os cinco
// METODOS continuam existindo: o pedido e poder comparar, nao escolher um so.
// (Reordenar nao mexe no protocolo: APARENCIA_OPCOES conta CINCO olhos e
// continuam sendo cinco. O que muda e qual byte desenha qual olho.)
//
// REGRAS QUE VALEM PARA OS CINCO (cada uma custou um bug):
//
// * Esclera nunca 0xffffff. Branco puro le como plastico; o olho de verdade e
//   um branco quente e fica ROSA nos cantos. Cada metodo resolve isso do jeito
//   dele (caruncula em bolota, pintura na textura, cunha extrudada, cunha do
//   proprio leque) — de proposito, pra dar pra comparar.
// * Sempre um ponto de BRILHO claro. E o unico detalhe que faz o olho parecer
//   molhado; sem ele o boneco fica com cara de manequim. Duas regras duras, as
//   duas escritas depois de a folha de contato de perto reprovar o contrario:
//     - o brilho mora DENTRO da iris e ABAIXO da camada da palpebra. Quando ele
//       era uma bolinha solta na frente do globo (esfera de raio 0.105 numa
//       casca de 1.042, com a palpebra em 1.064) ele ATRAVESSAVA a palpebra e
//       virava um pontinho branco flutuando fora do olho.
//     - o brilho e ESPELHADO entre os dois olhos. A regra antiga era "mesmo
//       lado nos dois, a luz da cena e uma so"; ela e defensavel em teoria e na
//       pratica produziu dois olhos VISIVELMENTE diferentes — no 'calotas' o
//       brilho escapava por cima da palpebra num olho e ficava enterrado no
//       outro. Um olho tem que ser o espelho do outro; a diferenca de um
//       milimetro de reflexo nao paga o preco de um rosto torto.
//     Excecao unica: o 'polar' pinta o brilho na TEXTURA, e a textura e a mesma
//     nos dois olhos (cachear duas por tom de pele dobraria a memoria de mapa a
//     toa). Como ela e identica, os dois olhos saem identicos — que e o que a
//     regra quer.
// * Anel limbal ESCURO na borda da iris. Um circulo de cor chapada le como
//   botao a 3 m; o anel escuro e o que faz a iris ter borda.
// * O globo fica DENTRO da orbita, e ele recua pela NORMAL DA PELE e nao em Z
//   (ver eixoOlho). Recuar em Z puro faz o globo sair pela tempora mais do que
//   sai pela frente — e o calombo lateral, nao o frontal, que da a leitura de
//   "cabeca de balao" que motivou esta reforma.
// * NADA daqui pode ficar atras de surfaceZ(x,y). O cranio e uma CASCA FECHADA:
//   nao existe buraco de olho nele. Orbita afundada, por mais correta que seja
//   anatomicamente, desenha o olho dentro da cabeca e nao aparece nada. Onde
//   este arquivo quer profundidade, ele SOBE a palpebra em vez de descer o
//   olho — os metodos 2 e 3 sao inteiramente construidos em cima disso.
// * A PISCADA e animation.js fazendo grupo.scale.y = abertura. Entao TUDO que
//   este arquivo devolve tem que ser achatavel: nada de sobrancelha, nada de
//   olheira solta que nao deva fechar junto.
// * NADA de vertexColors aqui. O forno de personagem (player/congelar.js) funde
//   os meshes de uma junta por material e ELE mesmo escreve o atributo `color`
//   quando precisa; uma geometria que ja chega com `color` proprio faz o merge
//   do balde inteiro falhar e o olho some do NPC congelado. Cor diferente =
//   mesh diferente, e o forno resolve.
//
// COR NAO E A VARIAVEL. O dono pediu TIPOS de olho, nao paleta: os cinco usam a
// mesma iris castanha-mel. Quem quiser variar cor mexe em UM lugar (a paleta
// logo abaixo) e os cinco mudam juntos.
// ---------------------------------------------------------------------------

const S = HEAD_S

// --- paleta unica ----------------------------------------------------------
// A esclera e f2e9dd e nao ffffff porque o branco do olho reflete a pele em
// volta: fotografado, o "branco" do olho fica em torno de 85% de luminancia e
// puxado pro quente. ESCLERA_CANTO e o rosa da carne do canto (caruncula e
// conjuntiva), que e o que impede a esclera de ler como bola de pingue-pongue.
const ESCLERA = 0xf2e9dd
const ESCLERA_CANTO = 0xcf8a7e
const IRIS = 0x6d4626
const IRIS_ALTA = 0xb5813f   // fibra acesa
const IRIS_FUNDA = 0x2e1c0d  // sombra junto da pupila
const LIMBO = 0x180f08       // anel limbal
const PUPILA = 0x08070a
const BRILHO = 0xf7fbff

// Materiais. Todos vem do cache de materials.js — ninguem da dispose neles, e
// as texturas deste arquivo tambem ficam num cache proprio, entao NENHUM
// material daqui leva userData.owned (marcar owned mandaria character.js
// destruir uma textura que os outros 19 bonecos ainda estao usando).
//
// RUGOSIDADE: iris, esclera e sobretudo a PUPILA sao superficies quase planas
// viradas pra frente, e com rugosidade baixa uma superficie assim vira ESPELHO
// do ambiente. Era o defeito "um olho castanho, o outro azul" do metodo 'casca':
// a pupila (rugosidade 0.30, quase preta) refletia o ceu, e como os dois olhos
// nascem em pontos diferentes da cara o reflexo caia diferente nos dois — prata
// num, azul no outro. O jogo tem UM ponto especular de proposito (matBrilho); a
// pupila e um BURACO e nao pode competir com ele.
const matEsclera = () => stdMat('olho:esclera', { color: ESCLERA, roughness: 0.34, metalness: 0.0 })
const matCanto = () => solid(ESCLERA_CANTO, 0.46, 0.0)
// metalness 0 e nao 0.04: em material metalico o reflexo do ambiente e TINGIDO
// pela cor base, o que dobrava a aposta do reflexo de ceu na iris escura.
const matIris = (m = 1) => solid(shade(IRIS, m), 0.36, 0.0)
const matLimbo = () => solid(LIMBO, 0.40, 0.0)
const matPupila = () => solid(PUPILA, 0.62, 0.0)
// O brilho e emissivo de proposito: um branco so difuso apaga junto com o resto
// do rosto quando o boneco anda pra sombra, e e justamente na sombra que o
// olho morre. Emissivo baixo (0.6) segura o ponto vivo sem virar lampada.
const matBrilho = () => stdMat('olho:brilho', {
  color: 0xffffff, emissive: BRILHO, emissiveIntensity: 0.6, roughness: 0.08,
})
const matPele = (skin, m = 1) => solid(shade(skin, m), 0.72, 0.0, { side: THREE.DoubleSide })
const matCilio = (ctx) => solid(mixHex(hairColorFrom(ctx), 0x140f11, 0.62), 0.62, 0.0, { side: THREE.DoubleSide })

// ---------------------------------------------------------------------------
// FERRAMENTAS COMUNS AOS CINCO
// ---------------------------------------------------------------------------

/** Onde o olho nasce neste cranio. dx/dy ajustam por metodo. */
function ancora(sgn, dx = 0, dy = 0) {
  const esp = faceSpread()
  const x = sgn * (EYE_ANCHOR.x + dx) * esp
  const y = EYE_ANCHOR.y + dy
  return { x, y, z: surfaceZ(x, y) }
}

/**
 * Inclinacao da pele no ponto do olho (radianos). Na altura dos olhos o cranio
 * ja esta virando pra lateral: sao 20 a 28 graus dependendo da cabeca.
 */
function inclinacaoDaPele(x, y) {
  const d = 0.020 * S
  const ax = Math.abs(x)
  const dz = surfaceZ(ax + d, y) - surfaceZ(ax - d, y)
  return Math.atan2(-dz, 2 * d)
}

/**
 * Quanto o olho GIRA em Y pra acompanhar a curva da cara.
 *
 * Alinhar 100% com a normal encaixa o globo mas deixa o boneco VESGO ao
 * contrario, com os dois olhos olhando pras paredes. 0.42 da inclinacao e o
 * meio termo que sobrevive nos seis cranios: o globo encaixa e o olhar continua
 * indo pra frente.
 */
const GUINADA = 0.42

/** Calota de raio 1 com o polo em +Z (esclera, iris, brilho). */
function calotaZ(arco, w = 22, h = 10) {
  const g = new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, arco)
  g.rotateX(Math.PI / 2)
  return g
}

/** Calota de raio 1 com o polo em +Y (palpebra: e tombada por rotation.x). */
function calotaY(arco, w = 22, h = 10) {
  return new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, arco)
}

/**
 * ZONA de raio 1 com o polo em +Y: uma FAIXA entre dois thetas, nao uma calota.
 *
 * Existe por causa do vinco da palpebra do metodo 'calotas'. Um vinco feito com
 * calotaY cobre TUDO acima da propria margem — e como ele mora numa camada mais
 * alta que a palpebra, ele ganhava o teste de profundidade do olho inteiro pra
 * cima e pintava metade do globo de pele escura. Na folha de contato isso leu
 * como uma VISEIRA DE CAPACETE em cima de uma bola. Vinco de verdade e uma
 * faixa: pele clara embaixo dele, sombra na faixa, pele clara de novo acima.
 */
function zonaY(t0, t1, w = 20, h = 3) {
  return new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, t0, t1 - t0)
}

/**
 * BRILHO COLADO NO GLOBO: uma calota minuscula na mesma esfera das outras
 * camadas, deslocada por dois angulos (a = horizontal, b = vertical).
 *
 * Por que uma calota e nao uma bolinha: uma esfera de raio r pousada na camada
 * `camada` alcanca `camada + r`, e nos metodos com globo a palpebra fica poucos
 * centesimos acima — a bolinha do brilho ATRAVESSAVA a palpebra e aparecia como
 * um pontinho branco solto no meio da pele. Uma calota nunca passa da propria
 * camada, entao ela e, por construcao, impossivel de vazar.
 *
 * `a` ja chega multiplicado pelo lado por quem chama: o brilho e espelhado (ver
 * a regra no cabecalho).
 */
function brilhoCalota(a, b, arco, camada, seg = 12) {
  const g = calotaZ(arco, seg, 3)
  g.rotateX(-b)     // leva o polo (+Z) pra cima em b
  g.rotateY(a)      // e depois pro lado em a
  const m = flatPiece(new THREE.Mesh(g, matBrilho()))
  m.scale.setScalar(camada)
  return m
}

/**
 * Ponto unitario da esfera a partir de dois angulos SEPARADOS: `a` manda no
 * deslocamento horizontal e `b` no vertical. Nao e coordenada esferica classica
 * de proposito — com theta/phi a margem da palpebra vira uma curva que aperta
 * nos polos, e o que se quer aqui e uma margem que ande em X e Y de forma
 * independente, que e como uma palpebra se comporta.
 */
function pontoEsfera(a, b, out) {
  const x = Math.sin(a), y = Math.sin(b)
  const r2 = x * x + y * y
  const z = Math.sqrt(Math.max(0.0025, 1 - r2))
  return (out || new THREE.Vector3()).set(x, y, z).normalize()
}

/** Monta os dois olhos chamando build(sgn, grupo). +1 = olho da direita. */
function par(build) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) build(sgn, g)
  return g
}

/**
 * Eixo do olho: grupo posicionado e guinado, com uma "casca" filha que carrega
 * a escala do elipsoide. Tudo dentro da casca tem raio 1 e so ROTACAO — como o
 * Three compoe pai*filho, a escala entra DEPOIS da rotacao e qualquer calota
 * girada cai exatamente sobre o elipsoide, sem deformar.
 */
function eixoOlho(grp, sgn, g, dx = 0, dy = 0) {
  const a = ancora(sgn, dx, dy)
  const eixo = new THREE.Group()
  // O globo entra na orbita ao longo da NORMAL DA PELE, nao ao longo de -Z.
  // Essa linha vale mais que qualquer numero deste arquivo: na altura dos olhos
  // o cranio ja virou 20-28 graus pra lateral, e um globo recuado em Z puro
  // escorrega pra fora da cabeca — ele saia 3 a 5 cm pela TEMPORA (mais do que
  // sai pela frente!) e virava um calombo do tamanho do proprio olho no lado do
  // rosto. E, muito provavelmente, metade da queixa de "cabeca de balao".
  // Recuando pela normal o mesmo globo sai ~2 cm, e a sobra lateral fica menor
  // que a da frente, que e a unica ordem que le como olho encaixado na orbita.
  const inc = inclinacaoDaPele(a.x, a.y)
  const rec = g.rz * g.sink
  eixo.position.set(a.x - sgn * Math.sin(inc) * rec, a.y, a.z - Math.cos(inc) * rec)
  eixo.rotation.y = sgn * inc * GUINADA
  const casca = new THREE.Group()
  casca.scale.set(g.rx, g.ry, g.rz)
  eixo.add(casca)
  grp.add(eixo)
  return casca
}

// --- pintura de textura ----------------------------------------------------
// tex() de world/materials.js desenha num <canvas>, e canvas so existe com DOM.
// As ferramentas de teste deste repo importam os catalogos em node puro (sem
// DOM) pra conferir caixa e contagem de triangulo, e um `document` indefinido
// derrubaria o catalogo inteiro. Entao o DESENHO e sempre o mesmo (uma funcao
// que preenche bytes RGBA); muda so quem carrega os bytes pra GPU.
const _texOlho = new Map()

function texturaOlho(chave, tam, pinta) {
  const achou = _texOlho.get(chave)
  if (achou) return achou
  const px = new Uint8Array(tam * tam * 4)
  pinta(px, tam)
  let t
  if (typeof document !== 'undefined' && document.createElement) {
    t = tex(chave, tam, (g, s) => {
      const img = g.createImageData(s, s)
      img.data.set(px)
      g.putImageData(img, 0, 0)
    })
  } else {
    // DataTexture nao aplica flipY (o WebGL ignora UNPACK_FLIP_Y em upload de
    // ArrayBuffer), entao as linhas vao invertidas na mao pra o resultado ser
    // identico ao do caminho com canvas.
    const inv = new Uint8Array(px.length)
    const linha = tam * 4
    for (let y = 0; y < tam; y++) inv.set(px.subarray(y * linha, y * linha + linha), (tam - 1 - y) * linha)
    t = new THREE.DataTexture(inv, tam, tam, THREE.RGBAFormat)
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.LinearFilter
    t.minFilter = THREE.LinearFilter
    t.needsUpdate = true
  }
  _texOlho.set(chave, t)
  return t
}

// Bytes crus a partir do hex. Nao uso THREE.Color aqui porque com o color
// management ligado `new THREE.Color(hex).r` devolve o valor LINEAR, e quem
// escreve pixel de textura sRGB precisa do byte sRGB — a conversao dupla
// deixava a iris lavada.
const bts = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]
const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const mulC = (a, m) => [a[0] * m, a[1] * m, a[2] * m]

// ===========================================================================
// CALOTAS — globo + calotas empilhadas          (indice 4 do catalogo)
// ===========================================================================
//
// As camadas sao calotas de raio 1 dentro da mesma casca, entao "escala" aqui e
// literalmente ALTURA SOBRE A ESCLERA: com raio ~3 cm, 1% = 0.3 mm. Longe o
// bastante do vizinho pra nunca haver z-fighting, perto o bastante pra a
// palpebra COLAR no globo em vez de pairar sobre ele como uma casca solta.
// Foi assim que o olho antigo ficou com "palpebra flutuante": o passo era de 2%
// e a palpebra sobrava quase 2 mm acima do branco.
//
// Os passos foram ABERTOS junto com a reducao do globo (abaixo): a camada e uma
// FRACAO do raio, entao encolher o globo 22% encolheria a folga entre camadas na
// mesma proporcao e devolveria o z-fighting que estes numeros existem pra
// evitar. O que tem que ficar constante e a folga em MILIMETROS.
const A_ESCLERA = 1.006
const A_LIMBO = 1.017
const A_IRIS = 1.028
const A_PUPILA = 1.040
const A_BRILHO = 1.049
const A_CILIO = 1.060
const A_PALPEBRA = 1.074
const A_VINCO = 1.088

// GLOBO. Era 0.0400*S = 5.3 cm de meia-largura, ou seja 10.6 cm de bola numa
// cabeca de 36 cm — razao 0.30, quando num rosto humano da 0.16. Na folha de
// contato de perto isso nao lia como "olho grande": lia como BOLA SALIENTE, uma
// esfera pousada na cara em vez de um globo encaixado na orbita. 0.0312*S poe a
// razao em 0.23 (o jogo e estilizado, o alvo nao e 0.16).
//
// O `sink` NAO subiu junto, e isso e contra-intuitivo o bastante pra merecer a
// nota. Enterrar mais parecia o caminho pra "sobrar branco dos dois lados da
// iris", e faz o contrario: do lado do NARIZ a pele sobe rapido (a ponte do
// nariz esta a 1 cm dali), entao quanto menos o globo se projeta, mais cedo a
// pele CORTA o branco desse lado. Medido nos seis cranios, o cruzamento
// pele x globo do lado nasal fica em 0.40 rad com sink 0.79 e cai pra 0.28 rad
// com 0.88 — com 0.88 a propria pele comia um terco da iris. Quem tira a
// leitura de bola aqui e o tamanho, nao a profundidade.
const A_GLOBO = { rx: 0.0312 * S, ry: 0.0300 * S, rz: 0.0266 * S, sink: 0.79 }

// arco + tomba de uma palpebra: a borda dela cruza o meio do olho na altura
// cos(tomba + arco) do globo. 0.86 + 0.46 => cos(1.32) = +0.25, que e o
// semicerrado da referencia (a palpebra come o topo da iris).
//
// A de baixo soma 1.35 => -0.22, e nao pode descer mais que isso: o globo so
// aparece na frente da pele entre uy -0.27 e +0.55 (medido nos seis cranios, o
// aperto vem da 'pera'), e uma margem abaixo disso poe a palpebra inteira
// DENTRO da cabeca. Era o que acontecia com 0.44 + 0.60 = -0.51: a palpebra de
// baixo existia, custava 750 triangulos e nao aparecia em cranio nenhum.
const A_CIMA = { arco: 0.86, tomba: 0.46, cilio: 0.070, tom: 0.90 }
const A_BAIXO = { arco: 0.50, tomba: 0.85, cilio: 0.030, tom: 0.98 }

function palpebraCalota(casca, sgn, spec, skin, cilio, baixo) {
  const base = baixo ? Math.PI - spec.tomba : spec.tomba
  // roll leva o polo da calota pro lado; -sgn manda pro lado de FORA da cara,
  // que e o que derruba o canto externo e tira a cara de coruja.
  const roll = -sgn * (baixo ? 0.10 : 0.20)

  // O cilio e a MESMA calota, com arco um pouco maior e escala MENOR: fica
  // escondida por baixo da pele e so a faixa alem da borda aparece. Da um
  // tracinho de espessura constante sem precisar de textura e sem serrilhar.
  const cil = flatPiece(new THREE.Mesh(calotaY(spec.arco + spec.cilio, 22, 8), cilio))
  cil.scale.setScalar(A_CILIO)
  cil.rotation.set(baixo ? base - spec.cilio : base, 0, roll)
  casca.add(cil)

  const p = flatPiece(new THREE.Mesh(calotaY(spec.arco, 22, 10), matPele(skin, spec.tom)))
  p.scale.setScalar(A_PALPEBRA)
  p.rotation.set(base, 0, roll)
  casca.add(p)
}

function olhoCalotas(ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const g = A_GLOBO
  const cCilio = matCilio(ctx)
  return par((sgn, grp) => {
    const casca = eixoOlho(grp, sgn, g)

    // O globo INTEIRO e cor de pele e so a calota da frente e branca. E isso
    // que faz o canto do olho ser pele em vez de duas fatias brancas
    // aparecendo dos lados da palpebra: nenhuma calota de palpebra chega a 90
    // graus, entao sempre sobraria esclera exposta na lateral do globo.
    casca.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), matPele(skin, 0.96))))

    // A esclera ia ate 0.95 rad de arco (sin = 0.81 do raio): branco quase ate a
    // silhueta do globo, que e o que fazia a bola de pingue-pongue. Em 0.74 o
    // branco para bem antes da curva e o que fecha o canto e a pele do proprio
    // globo — mas continua sobrando branco DOS DOIS LADOS da iris, que e o que o
    // olho procura pra ler "olho" (limbo em 0.485, esclera ate 0.674).
    const esc = flatPiece(new THREE.Mesh(calotaZ(0.74, 22, 8), matEsclera()))
    esc.scale.setScalar(A_ESCLERA)
    esc.receiveShadow = true
    casca.add(esc)

    // limbo: calota MAIOR em arco e MENOR em raio que a iris. A iris cobre o
    // miolo dela e sobra so o anel de fora — anel escuro de espessura constante
    // sem textura e sem geometria de anel.
    const lim = flatPiece(new THREE.Mesh(calotaZ(0.485, 22, 4), matLimbo()))
    lim.scale.setScalar(A_LIMBO)
    casca.add(lim)

    // A iris nao e UMA calota: sao tres arcos concentricos em tons diferentes.
    // Uma calota de cor unica le como botao de plastico; tres degraus (fundo
    // escuro junto da pupila, colarete claro no meio, cor cheia na borda) ja
    // dao a impressao de profundidade que a iris de verdade tem.
    const anel = (arco, tom, camada, seg) => {
      const m = flatPiece(new THREE.Mesh(calotaZ(arco, 22, seg), matIris(tom)))
      m.scale.setScalar(camada)
      casca.add(m)
    }
    anel(0.440, 1.00, A_IRIS, 4)
    anel(0.330, 1.42, A_IRIS + 0.005, 3)   // colarete claro
    anel(0.235, 0.52, A_IRIS + 0.010, 3)   // sombra junto da pupila

    const pup = flatPiece(new THREE.Mesh(calotaZ(0.185, 18, 3), matPupila()))
    pup.scale.setScalar(A_PUPILA)
    casca.add(pup)

    // BRILHO. Era um par de ESFERAS pousadas na frente do globo, de raio 0.105 e
    // 0.055 na camada 1.042 — ou seja alcancando 1.147, bem acima da palpebra
    // (1.064). Resultado medido na folha de contato: a bolinha atravessava a
    // palpebra num olho e ficava enterrada no outro (o `eixo` gira +inc num lado
    // e -inc no outro, entao a MESMA posicao local cai a 2,6 cm de distancia
    // diferente da pele nos dois), e o dono viu "pontinhos brancos soltos
    // flutuando fora do olho" e "os dois olhos diferentes".
    //
    // Agora sao calotas coladas na esfera (nunca passam da propria camada) e
    // ESPELHADAS pelo lado. Os angulos ficam dentro da iris com folga: a iris vai
    // ate 0.440 rad e o brilho grande alcanca 0.227 + 0.085 = 0.312.
    casca.add(brilhoCalota(-sgn * 0.170, 0.150, 0.085, A_BRILHO))
    casca.add(brilhoCalota(sgn * 0.140, -0.160, 0.045, A_BRILHO, 8))

    palpebraCalota(casca, sgn, A_CIMA, skin, cCilio, false)
    palpebraCalota(casca, sgn, A_BAIXO, skin, cCilio, true)

    // VINCO da palpebra superior: uma FAIXA (zonaY) e nao uma calota.
    //
    // Com calotaY ele cobria tudo acima da propria margem, e como mora na camada
    // mais alta do olho ele pintava de pele escura o globo inteiro dali pra cima
    // — a "viseira de capacete" da folha de contato. Uma faixa entre dois thetas
    // deixa pele clara embaixo E acima, que e como um vinco de palpebra se le. O
    // tom tambem subiu (0.76 -> 0.87): 24% mais escuro que a pele nao e sombra,
    // e mancha.
    const vinco = flatPiece(new THREE.Mesh(zonaY(A_CIMA.arco - 0.30, A_CIMA.arco - 0.06, 20, 2), matPele(skin, 0.87)))
    vinco.scale.setScalar(A_VINCO)
    vinco.rotation.set(A_CIMA.tomba, 0, -sgn * 0.20)
    casca.add(vinco)

    // caruncula: a bolota rosa do canto interno. E o unico jeito honesto de
    // tirar a leitura de "bola branca" sem sujar a esclera inteira de rosa.
    //
    // O CANTO INTERNO DESTE METODO NAO E ESCOLHA: e onde a pele do nariz corta o
    // globo, medido em 0.40 rad nos seis cranios (ver a nota do A_GLOBO). Por
    // isso a caruncula vai em 0.38 — um passo antes do corte — e nao em 0.80,
    // que seria o canto de um olho desenhado no papel e aqui cai 10 mm DENTRO da
    // cabeca (a peca sumia inteira, e o smoke reprovou com -9 mm).
    //
    // O raio caiu de 0.11 pra 0.070: 0.11 pousado em 1.01 alcancava 1.12 e
    // FURAVA a palpebra (1.074) — era a "bola clara e rosada" que aparecia por
    // cima do olho num lado e nao no outro. Achatada em z ela vira um canto de
    // carne em vez de uma bolota.
    const car = flatPiece(new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), matCanto()))
    car.position.copy(pontoEsfera(-sgn * 0.38, -0.02).multiplyScalar(1.014))
    car.scale.set(0.78, 1.25, 0.42)
    casca.add(car)
  })
}

// ===========================================================================
// POLAR — uma calota so, iris pintada em coordenada polar   (indice 0)
// ===========================================================================

// Este e o olho que o dono aprovou na folha de contato — o unico que leu como
// olho de verdade nos seis cranios — e por isso ele agora e o indice 0. Mexer
// aqui e mexer no rosto que todo jogador novo ganha: so entrou o que estava
// medido como defeito.
//
// GLOBO: mesma conta do 'calotas'. 0.0410*S dava 10.9 cm de bola numa cabeca de
// 36 cm (razao 0.30). 0.0330*S poe em 0.244. Como as palpebras deste metodo sao
// varridas em ANGULO sobre o globo, encolher o globo encolheria a fenda junto —
// por isso B_ABERTURA e as amplitudes da margem sobem na mesma proporcao, e a
// ABERTURA na tela fica praticamente do mesmo tamanho: o que some e so o
// calombo de globo escondido debaixo da palpebra.
const B_GLOBO = { rx: 0.0330 * S, ry: 0.0318 * S, rz: 0.0286 * S, sink: 0.79 }
const B_ARCO = 1.05          // arco da calota pintada
const B_IRIS = 0.455         // raio da iris em fracao do raio PROJETADO da calota
const B_PUPILA = 0.185

/**
 * Pintura polar. A conta que importa: numa calota, o raio que se ve na TELA e
 * sin(theta), nao theta. Distribuir a iris linearmente na linha da textura
 * engorda ela ~12% perto da borda e o anel limbal sai oval. Aqui a linha vira
 * theta e o desenho e feito em sin(theta) normalizado.
 *
 * A COLUNA da textura vira angulo em volta do polo. Depois do rotateX(PI/2) da
 * calota, u = 0 aponta pra -X local e u cresce no sentido de -Y: por isso
 * lx/ly saem negativos do cos/sin. Errar esse sinal poe a caruncula no meio da
 * testa e o brilho no canto errado.
 */
function pintarPolar(px, s, pele) {
  const senoArco = Math.sin(B_ARCO)
  const esc = bts(ESCLERA), canto = bts(ESCLERA_CANTO), cPele = bts(pele)
  const cIris = bts(IRIS), cAlta = bts(IRIS_ALTA), cFunda = bts(IRIS_FUNDA)
  const cLimbo = bts(LIMBO), cPup = bts(PUPILA), cBri = bts(BRILHO)

  for (let y = 0; y < s; y++) {
    const theta = B_ARCO * ((y + 0.5) / s)
    const rp = Math.sin(theta) / senoArco
    for (let x = 0; x < s; x++) {
      const ang = ((x + 0.5) / s) * Math.PI * 2
      const lx = -Math.cos(ang), ly = -Math.sin(ang)
      const projX = lx * rp, projY = ly * rp

      // esclera quente + rosa nos cantos. |lx|^3 concentra o rosa no eixo
      // horizontal (que e onde ficam os dois cantos) sem sujar o resto.
      let c = lerpC(esc, canto, smoothstep(0.28, 0.96, rp) * Math.pow(Math.abs(lx), 3) * 0.8)
      // a esclera embaixo da palpebra nunca e branca: sem esta sombra o olho
      // fica com um "sorriso" branco acima da iris que le como olho de zumbi.
      c = mulC(c, 1 - smoothstep(0.08, 0.9, rp) * Math.max(0, ly) * 0.28)

      const q = rp / B_IRIS
      if (q < 1.06) {
        // fibras: duas frequencias incomensuraveis (38 e 17 voltas) com uma
        // modulacao lenta por cima. Uma frequencia so vira listra de codigo de
        // barras; duas ja lem como tecido de iris.
        const fib = Math.sin(ang * 38 + Math.sin(ang * 6.3) * 1.7) * 0.55 + Math.sin(ang * 17 + 1.2) * 0.45
        let ci = lerpC(cFunda, cAlta, smoothstep(0.10, 0.60, q))
        ci = lerpC(ci, cIris, smoothstep(0.50, 0.95, q))
        ci = mulC(ci, 1 + 0.30 * fib * smoothstep(0.20, 0.95, q))
        // colarete: a crista clara que circunda a pupila em toda iris real
        ci = lerpC(ci, cAlta, 0.32 * Math.exp(-Math.pow((q - 0.36) / 0.11, 2)))
        ci = lerpC(ci, cLimbo, smoothstep(0.78, 0.99, q))
        c = lerpC(c, ci, 1 - smoothstep(0.985, 1.04, q))
      }
      c = lerpC(c, cPup, 1 - smoothstep(0.93, 1.05, rp / B_PUPILA))

      const b1 = Math.hypot(projX + 0.20, projY - 0.24) / 0.17
      c = lerpC(c, cBri, 0.94 * (1 - smoothstep(0.5, 1.0, b1)))
      const b2 = Math.hypot(projX - 0.17, projY + 0.20) / 0.10
      c = lerpC(c, cBri, 0.42 * (1 - smoothstep(0.45, 1.0, b2)))

      // a borda da calota vira PELE: assim a emenda entre a calota pintada e o
      // globo cor de pele nao existe visualmente, e nao preciso de material
      // transparente (que traria ordem de desenho e briga com a palpebra).
      //
      // `pele` chega aqui JA ESCURECIDA no mesmo fator do globo (ver matPolar).
      // Passando a cor crua a borda pintada ficava 4% mais clara que a esfera
      // debaixo dela, e essa diferenca desenhava um ANEL claro em volta do olho —
      // uma das "bordas de prato" que apareceram na folha de contato.
      //
      // A faixa comecava em rp 0.86; com a abertura de hoje o canto do olho ve
      // ate rp 0.917, ou seja a transicao pra pele entrava DENTRO da fenda e
      // comia a esclera pelas beiradas. Empurrada pra 0.93 ela volta a fazer so
      // o que tem que fazer: esconder a emenda da calota, fora do que se ve.
      c = lerpC(c, cPele, smoothstep(0.93, 0.999, rp))

      const i = (y * s + x) * 4
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255
    }
  }
}

/** `pele` tem que ser a cor JA ESCURECIDA do globo, nao o tom cru — ver a nota
 *  sobre o anel claro em pintarPolar(). */
function matPolar(pele) {
  const chave = 'olho-polar:' + pele
  return stdMat(chave, {
    map: texturaOlho(chave, 160, (px, s) => pintarPolar(px, s, pele)),
    roughness: 0.15, metalness: 0.02,
  })
}

/**
 * FAIXA VARRIDA — a palpebra deste metodo.
 *
 * Uma calota so consegue margem CIRCULAR. A palpebra de verdade tem uma margem
 * com forma propria: sobe rapido do canto interno, chega ao alto perto do meio
 * e desce devagar pro canto externo. Aqui a margem e uma FUNCAO, e a faixa e
 * varrida ao longo dela — cada coluna da malha nasce num ponto da margem e sobe
 * pela esfera.
 *
 * `filas` sao os pares [deslocamento em b, raio]. A primeira fila fica DENTRO
 * do globo (raio < 1) de proposito: assim a borda visivel da palpebra e a
 * INTERSECAO das duas superficies, que e uma curva perfeita. Tentar parar a
 * faixa exatamente na tangente do globo deixa um fiapo serrilhado que pisca.
 *
 * `inverter` troca a volta dos triangulos no olho espelhado. Sem isso um dos
 * dois olhos fica com as normais pra dentro e a palpebra dele acende ao
 * contrario da outra — defeito que so aparece quando a luz vem de lado.
 */
function faixaVarrida(margem, filas, nU, inverter) {
  const pos = []
  const idx = []
  const p = new THREE.Vector3()
  for (let i = 0; i <= nU; i++) {
    const [a, b] = margem(i / nU)
    for (let j = 0; j < filas.length; j++) {
      pontoEsfera(a, b + filas[j][0], p).multiplyScalar(filas[j][1])
      pos.push(p.x, p.y, p.z)
    }
  }
  const nF = filas.length
  for (let i = 0; i < nU; i++) {
    for (let j = 0; j < nF - 1; j++) {
      const a0 = i * nF + j, b0 = a0 + nF, c0 = b0 + 1, d0 = a0 + 1
      if (inverter) idx.push(a0, d0, b0, b0, d0, c0)
      else idx.push(a0, b0, d0, b0, c0, d0)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

// Meio-angulo horizontal da fenda. Subiu de 0.86 junto com a reducao do globo:
// sin(1.02) * 0.0330 recupera quase toda a largura de abertura que sin(0.86) *
// 0.0410 dava, entao o que encolheu na tela foi o CALOMBO, nao o olho.
const B_ABERTURA = 0.92

// Amplitudes verticais da margem (cima positivo, baixo negativo). Mesma logica:
// sao angulos sobre um globo que ficou 20% menor, entao subiram na mesma conta.
const B_ALTO = 0.321
const B_FUNDO = 0.257

/**
 * FILAS da palpebra — o remedio pra "placa chapada".
 *
 * Cada par e [deslocamento em b a partir da margem, raio]. A leitura de PLACA
 * vinha da distribuicao antiga ([-0.05, 0.985], [0.06, 1.040], [0.34, 1.070],
 * [0.72, 1.080]): o raio dava um salto de 0.055 na primeira fila e depois a
 * superficie ficava praticamente constante em 1.07-1.08 por 0.66 rad. Uma casca
 * de raio constante tem normal quase igual em toda a area — nao tem nada pra
 * sombrear, e le como um poligono claro colado por cima do olho.
 *
 * Aqui as filas se ADENSAM na margem e o raio sobe em curva: 0.98 -> 1.012 ->
 * 1.043 -> 1.062 -> 1.074 -> 1.081 -> 1.083. A inclinacao cai de 0.71 pra 0.006
 * ao longo de 0.3 rad, entao a normal VIRA continuamente perto da borda — que e
 * exatamente o que faz uma aresta parecer arredondada em vez de cortada.
 */
const B_PALP_CIMA = [
  [-0.055, 0.980], [-0.010, 1.012], [0.045, 1.043], [0.115, 1.062],
  [0.235, 1.074], [0.430, 1.081], [0.740, 1.083],
]
const B_PALP_BAIXO = [
  [0.045, 0.980], [0.005, 1.010], [-0.050, 1.040], [-0.115, 1.058],
  [-0.235, 1.070], [-0.430, 1.078], [-0.700, 1.081],
]

function olhoPolar(ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const g = B_GLOBO
  const cPele = matPele(skin, 0.93)
  const cCilio = matCilio(ctx)
  return par((sgn, grp) => {
    const casca = eixoOlho(grp, sgn, g)
    casca.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), matPele(skin, 0.96))))

    // a textura recebe a pele NO MESMO TOM do globo (0.96) pra que a borda
    // pintada e a esfera sejam a mesma cor e a emenda nao vire um anel claro.
    const frente = flatPiece(new THREE.Mesh(calotaZ(B_ARCO, 30, 14), matPolar(shade(skin, 0.96))))
    frente.scale.setScalar(1.006)
    frente.receiveShadow = true
    casca.add(frente)

    // w = -1 no canto INTERNO, +1 no canto EXTERNO (por isso o sgn no angulo).
    // O expoente 0.55 e o que faz a margem ficar cheia no meio e cair rapido so
    // perto dos cantos: com expoente 1 a margem vira arco de circulo e o olho
    // volta a ser redondo.
    const cima = (u) => {
      const w = u * 2 - 1
      return [B_ABERTURA * w * sgn, B_ALTO * Math.pow(Math.max(0, 1 - w * w), 0.55) + 0.080 * w - 0.107 * w * w]
    }
    const baixo = (u) => {
      const w = u * 2 - 1
      return [B_ABERTURA * 0.94 * w * sgn, -B_FUNDO * Math.pow(Math.max(0, 1 - w * w), 0.60) + 0.048 * w - 0.021 * w * w]
    }
    const inverter = sgn < 0

    // cilio primeiro (raio menor): so a faixa que sobra abaixo da palpebra
    // aparece, e ela tem espessura constante porque as duas seguem a MESMA
    // curva de margem.
    const cilioCima = flatPiece(new THREE.Mesh(faixaVarrida(cima, [[-0.095, 0.982], [0.015, 1.018], [0.220, 1.018]], 20, inverter), cCilio))
    casca.add(cilioCima)
    const palpCima = flatPiece(new THREE.Mesh(faixaVarrida(cima, B_PALP_CIMA, 20, inverter), cPele))
    casca.add(palpCima)

    const cilioBaixo = flatPiece(new THREE.Mesh(faixaVarrida(baixo, [[0.075, 0.982], [-0.012, 1.016], [-0.150, 1.016]], 18, !inverter), cCilio))
    casca.add(cilioBaixo)
    const palpBaixo = flatPiece(new THREE.Mesh(faixaVarrida(baixo, B_PALP_BAIXO, 18, !inverter), matPele(skin, 0.99)))
    casca.add(palpBaixo)
  })
}

// ===========================================================================
// RECORTE — abertura em Shape 2D com furo, colada na pele   (indice 2)
// ===========================================================================
//
// Aqui a palpebra nao e uma casca por cima do globo: e uma MOLDURA. Desenho a
// abertura em amendoa (curva de cima e curva de baixo se encontrando nos dois
// cantos), uso ela como FURO de um contorno maior e extrudo — a parede do furo
// vira o bordo palpebral com espessura de verdade, e o canto interno/externo
// tem forma propria, coisa que calota nenhuma da.
//
// Dois erros que este metodo cometeu antes, os dois valendo a pena registrar:
//
// 1. O "globo" era uma esfera rigida. Nos cranios mais curvos (pera, comprida)
//    a pele desce 4,6 cm em 5 cm de X e a esfera desce so 2 — o globo furava a
//    moldura no canto de fora. Aqui o fundo do olho TAMBEM e projetado na pele,
//    entao acompanha o cranio por construcao.
//
// 2. O olho era AFUNDADO em relacao a pele, o que parecia obvio: e uma orbita.
//    So que O CRANIO E UMA CASCA FECHADA — nao existe buraco de olho na
//    cabeca. Tudo que fica atras de surfaceZ(x,y) e desenhado DENTRO da cabeca
//    e simplesmente nao aparece; pela abertura via-se a pele da testa. A
//    profundidade aqui e feita ao contrario: o olho fica pouco acima da pele e
//    e a MOLDURA que sobe 8 mm, entao o olho le como fundo porque a palpebra
//    esta na frente dele — que e como olho fundo funciona num rosto de verdade.

const C_AW = 0.0345 * S      // meia-largura da abertura
const C_HC = 0.0175 * S      // meia-altura da curva de cima
const C_HB = 0.0140 * S      // meia-altura da curva de baixo
const C_EXT_X = 1.40         // contorno externo da moldura. Nao passar de ~1.45:
const C_EXT_Y = 1.70         // no cranio 'pera' a borda ja chega na tempora, e
                             // alem dela a moldura sai pela lateral da cabeca
const C_BASE = 0.0012        // o fundo do olho na borda, ACIMA da pele
const C_CONV = 0.0048        // bojo do olho no meio (a cornea vista pelo furo)
const C_LABIO = 0.0080       // quanto a moldura sobe acima da pele na abertura

/**
 * FATOR DE CANTO: 1 no meio da fenda, 0 nos dois cantos. E a peca que faltava.
 *
 * O defeito que a folha de contato mostrou — "abas triangulares chapadas saindo
 * pros lados, fora da pele" — nao vinha de um numero errado, vinha da MALHA. A
 * moldura e um ExtrudeGeometry de um Shape com furo: a triangulacao (earcut) so
 * conhece dois aneis de vertices, o contorno externo e a borda da abertura, e
 * NAO cria nenhum vertice entre eles. Entao qualquer curva de afundamento que se
 * escreva por vertice e amostrada em dois pontos so: a face da frente sai da
 * borda do furo (labio inteiro, +8 mm) e cai direto no contorno externo (-7 mm)
 * num triangulo so. Em cima e embaixo isso e a rampa da palpebra e esta certo;
 * nos dois CANTOS, onde os dois aneis quase se encostam, vira um triangulo
 * grande e chapado inclinado 40 graus — a aba.
 *
 * A saida nao e afundar mais rapido (nao ha onde amostrar): e nao deixar o
 * LABIO chegar ate a ponta da amendoa. Numa palpebra de verdade a espessura da
 * margem tambem morre nos dois cantos — o canto e uma dobra de pele, nao um
 * bordo. Com o labio ja enterrado na ponta, os dois aneis chegam la na MESMA
 * altura e o triangulo que os liga fica inteiro debaixo da pele.
 *
 * O fundo do olho usa o MESMO fator, senao a esclera continuaria +1,2 mm acima
 * da pele num canto onde a moldura ja nao existe pra cobrir — o branco vazaria
 * pra fora do olho exatamente onde a aba estava.
 */
const cantoRecorte = (xrel) => 1 - smoothstep(0.76, 0.95, Math.abs(xrel) / C_AW)

/**
 * Contorno de amendoa. `pont` > 1 afina as pontas: com 1 sai uma elipse e o
 * canto do olho fica redondo, que e o que fazia o rosto parecer de desenho
 * infantil. `torcao` levanta o canto externo (o de verdade fica ~2 mm acima do
 * interno) — e um cisalhamento e nao um giro pra continuar sendo facil de
 * inverter na hora de calcular o afundamento da moldura.
 */
function amendoa(n, aw, hc, hb, pont, torcao, sgn) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const c = Math.cos(t), s = Math.sin(t)
    const h = s >= 0 ? hc : hb
    const y = h * Math.sign(s) * Math.pow(Math.abs(s), pont) + torcao * c * sgn
    pts.push(new THREE.Vector2(aw * c, y))
  }
  return pts
}

function shapeDe(pts) {
  const sp = new THREE.Shape()
  sp.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) sp.lineTo(pts[i].x, pts[i].y)
  sp.closePath()
  return sp
}

/**
 * Remapeia o Z da moldura antes de projetar na pele.
 *
 * A moldura crua e um bloco de espessura constante: a borda externa dela vira
 * um degrau de 4 mm em volta do olho que acende com luz raspante e denuncia o
 * truque. Aqui a espessura AFUNDA conforme se afasta da abertura — junto do
 * furo a moldura tem o labio inteiro, e no contorno externo tanto a face da
 * frente quanto a de tras ficam ABAIXO da pele, entao a borda da moldura nao
 * existe: ela simplesmente sai de dentro da pele.
 *
 * AS ABAS TRIANGULARES DOS CANTOS: o porque esta na nota de `cantoRecorte`, e o
 * remedio e o fator dela — o labio morre antes das duas pontas da amendoa.
 * Verticalmente `cantoRecorte` vale 1 e a rampa generosa da palpebra continua
 * exatamente como estava.
 */
function afundarMoldura(geo, cx, cy, aw, hc, hb, torcao, sgn) {
  geo.computeBoundingBox()
  const z0 = geo.boundingBox.min.z, z1 = geo.boundingBox.max.z
  const dz = Math.max(1e-6, z1 - z0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    // As coordenadas do Shape sao ABSOLUTAS (a abertura ja nasce no lugar do
    // olho), entao o centro tem que sair da conta antes de medir a distancia.
    // Sem isso rho > 1 no rosto inteiro, a moldura afunda por completo e o olho
    // fica sem palpebra nenhuma — foi assim que ela sumiu na primeira versao.
    const x = pos.getX(i) - cx
    const y = pos.getY(i) - cy - torcao * (x / aw) * sgn
    const h = y >= 0 ? hc : hb
    const rho = Math.hypot(x / aw, y / h)
    const f = Math.min(1 - smoothstep(1.02, 1.45, rho), cantoRecorte(x))
    const u = (pos.getZ(i) - z0) / dz          // 0 = fundo da moldura, 1 = frente
    // -7 mm / -9 mm e nao -4/-6: a pele que esconde a moldura e uma MALHA, e
    // entre dois vertices dela a corda passa por dentro da superficie analitica
    // que surfaceZ devolve. 4 mm de folga sobrevivia no cranio liso e raspava
    // nos amostrados por anel; 7 mm sobra em todos os seis.
    pos.setZ(i, mix(-0.009, mix(-0.007, C_LABIO, f), u))
  }
  pos.needsUpdate = true
  // A caixa foi calculada ACIMA, com o Z antigo, e ninguem a invalida sozinho:
  // deixada ali ela mente sobre onde a moldura esta (raycast e cull de camera
  // leem dela) e ainda envenena qualquer medicao de caixa da peca.
  geo.boundingBox = null
  return geo
}

/**
 * Fundo do olho: um leque com a forma DA PROPRIA ABERTURA, nao um circulo.
 *
 * Com disco circular a esclera vazava por cima e por baixo da moldura: o disco
 * precisa ser mais largo que a abertura pra cobri-la, e a abertura e tres vezes
 * mais larga que alta — o excedente vertical saia 5 mm fora da palpebra e virava
 * um calombo claro acima do olho. Um leque que e a abertura escalada por 1.10
 * cobre o furo inteiro e continua debaixo da moldura em toda a volta.
 *
 * A volta dos triangulos e (a, d, c) e nao (a, b, c): andar no sentido do
 * ANGULO e depois pra fora deixa a frente do leque virada pra DENTRO da cabeca,
 * e como as pecas do olho usam material FrontSide o resultado nao e uma cor
 * errada, e sim iris e esclera INVISIVEIS. Vale pros tres leques deste arquivo.
 */
function fundoDoOlho(cx, cy, contorno, folga, nA, nR, fz) {
  const pos = []
  const idx = []
  pos.push(cx, cy, fz(cx, cy))
  for (let j = 1; j <= nR; j++) {
    const k = (j / nR) * folga
    for (let i = 0; i < nA; i++) {
      const [dx, dy] = contorno((i / nA) * Math.PI * 2)
      const x = cx + dx * k, y = cy + dy * k
      pos.push(x, y, fz(x, y))
    }
  }
  const anel = (j, i) => 1 + (j - 1) * nA + (i % nA)
  // O MIOLO segue a MESMA regra dos aneis: andar no sentido do angulo com o
  // centro fixo (0, i, i+1). Estava (0, i+1, i) — a volta contraria da dos
  // aneis, o que deixava as 24 fatias do centro da esclera com a frente virada
  // pra dentro da cabeca. Hoje elas nascem escondidas atras da iris, mas o
  // furo aparece assim que a iris encolhe, e o resto do arquivo confia nesta
  // funcao pra devolver uma superficie de face UNICA e consistente.
  for (let i = 0; i < nA; i++) idx.push(0, anel(1, i), anel(1, i + 1))
  for (let j = 1; j < nR; j++) {
    for (let i = 0; i < nA; i++) {
      const a = anel(j, i), b = anel(j, i + 1), c = anel(j + 1, i + 1), d = anel(j + 1, i)
      idx.push(a, d, c, a, c, b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * Peca chapada deste metodo: Shape extrudado e ASSENTADO no fundo do olho.
 *
 * Nao da pra pousar num Z fixo. A abertura tem quase 10 cm de largura e nesse
 * trecho a pele do cranio desce ate 5 cm — uma iris chapada num Z so nasce
 * enterrada de um lado e flutuando 4 cm do outro (foi exatamente o que a
 * primeira versao fez). Aqui cada vertice pergunta a `fz` onde esta o fundo do
 * olho naquele ponto, entao iris, pupila, limbo e brilho acompanham o bojo.
 */
function pecaPlana(shape_, mat, fz, alt, prof = 0.0016, bisel = 0.0006) {
  const geo = new THREE.ExtrudeGeometry(shape_, extrudeOpts(prof, bisel, 8))
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, fz(pos.getX(i), pos.getY(i)) + alt + pos.getZ(i))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return flatPiece(new THREE.Mesh(geo, mat))
}

function circulo(cx, cy, r, n = 22) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r))
  }
  return pts
}

function olhoRecorte(ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const torcao = 0.0022 * S
  return par((sgn, grp) => {
    const a = ancora(sgn)
    const rIris = 0.0128 * S
    const rPup = 0.0052 * S
    // rho: distancia medida em UNIDADES DA ABERTURA (1 = em cima do contorno).
    // E a mesma medida que a moldura usa pra afundar, entao as duas concordam
    // sobre onde a abertura acaba, que e o que garante que o fundo do olho
    // nunca apareca por fora da palpebra.
    const rho = (x, y) => {
      const dx = x - a.x
      const dy = y - a.y - torcao * (dx / C_AW) * sgn
      return Math.hypot(dx / C_AW, dy / (dy >= 0 ? C_HC : C_HB))
    }
    // O fundo do olho: a pele, um pouco ACIMA dela, com o bojo da cornea no
    // meio. E a superficie de referencia de TODAS as pecas deste metodo.
    //
    // `cantoRecorte` faz o fundo MERGULHAR nos dois cantos junto com a moldura.
    // Sem isso o branco continuaria 1,2 mm acima da pele num canto onde a
    // moldura ja nao esta la pra cobrir, e vazaria pra cima do rosto. As pecas
    // do miolo (iris, pupila, limbo, brilho) vivem em rho < 0.4, onde o fator
    // vale 1: nada muda pra elas.
    const fz = (x, y) => {
      const k = cantoRecorte(x - a.x)
      return surfaceZ(x, y) + mix(-0.0035, C_BASE, k)
        + C_CONV * k * Math.max(0, 1 - Math.pow(rho(x, y) / 0.85, 2))
    }

    // --- moldura: contorno externo com a abertura como FURO ------------------
    const abertura = amendoa(34, C_AW, C_HC, C_HB, 1.32, torcao, sgn)
    const externo = amendoa(30, C_AW * C_EXT_X, C_HC * C_EXT_Y, C_HB * C_EXT_Y, 0.88, torcao * 1.4, sgn)
    const molde = shapeDe(externo.map((p) => new THREE.Vector2(p.x + a.x, p.y + a.y)))
    const furo = new THREE.Path()
    // O furo vai na volta CONTRARIA da de fora. O ExtrudeGeometry corrige
    // sozinho, mas a triangulacao sai mais limpa quando ja chega certa.
    for (let i = abertura.length - 1; i >= 0; i--) {
      const p = abertura[i]
      if (i === abertura.length - 1) furo.moveTo(p.x + a.x, p.y + a.y)
      else furo.lineTo(p.x + a.x, p.y + a.y)
    }
    furo.closePath()
    molde.holes.push(furo)

    const geoM = new THREE.ExtrudeGeometry(molde, extrudeOpts(0.010, 0.0014, 3))
    afundarMoldura(geoM, a.x, a.y, C_AW, C_HC, C_HB, torcao, sgn)
    // pad 0 porque o afundamento acima ja escolheu o Z de cada vertice: somar
    // folga por cima levantaria a moldura inteira e devolveria o degrau.
    wrapToHead(geoM, 0)
    const moldura = sh(new THREE.Mesh(geoM, matPele(skin, 0.94)))
    moldura.castShadow = false   // moldura fina projetando em si mesma = mancha
    grp.add(moldura)

    // --- fundo do olho, tambem projetado na pele ----------------------------
    const contorno = (t) => {
      const c = Math.cos(t), s = Math.sin(t)
      const h = s >= 0 ? C_HC : C_HB
      return [C_AW * c, h * Math.sign(s) * Math.pow(Math.abs(s), 1.32) + torcao * c * sgn]
    }
    const fundo = flatPiece(new THREE.Mesh(
      fundoDoOlho(a.x, a.y, contorno, 1.10, 24, 4, fz),
      matEsclera(),
    ))
    fundo.receiveShadow = true
    grp.add(fundo)

    // cantos rosados: duas cunhas extrudadas nos dois extremos da abertura,
    // pousadas em cima do fundo. Sao o mesmo metodo da moldura (Shape) e nao
    // uma bolota, de proposito — assim o canto tem a forma do canto.
    //
    // A ponta ia ate 0.80 + 0.24 = 1.04 da meia-largura, ou seja 2 mm PARA FORA
    // da abertura: as duas cunhas apareciam como triangulinhos rosa em cima da
    // pele, fora da moldura, um em cada canto. Agora a ponta para em 0.92 e a
    // cunha inteira mora dentro do furo.
    for (const lado of [-1, 1]) {
      const cx = a.x + lado * C_AW * 0.62
      const cy = a.y + torcao * lado * sgn * 0.8
      const cunha = shapeDe([
        new THREE.Vector2(cx + lado * C_AW * 0.18, cy),
        new THREE.Vector2(cx - lado * C_AW * 0.06, cy + C_HC * 0.34),
        new THREE.Vector2(cx - lado * C_AW * 0.10, cy),
        new THREE.Vector2(cx - lado * C_AW * 0.06, cy - C_HB * 0.34),
      ])
      grp.add(pecaPlana(cunha, matCanto(), fz, 0.0006, 0.0012, 0.0004))
    }

    // --- iris pelo MESMO metodo: aneis que sao Shape com furo ---------------
    // A pupila e um POCO: o anel da iris tem furo e o disco preto fica ATRAS
    // dele. Le como buraco de verdade, com o degrau pegando sombra, em vez do
    // circulo preto chapado que todo olho de jogo tem.
    grp.add(pecaPlana(shapeDe(circulo(a.x, a.y, rPup * 1.15, 18)), matPupila(), fz, 0.0006, 0.0010, 0.0003))

    const anelIris = shapeDe(circulo(a.x, a.y, rIris, 26))
    const furoPup = new THREE.Path()
    const pp = circulo(a.x, a.y, rPup, 18)
    furoPup.moveTo(pp[pp.length - 1].x, pp[pp.length - 1].y)
    for (let i = pp.length - 2; i >= 0; i--) furoPup.lineTo(pp[i].x, pp[i].y)
    furoPup.closePath()
    anelIris.holes.push(furoPup)
    // a iris fica 1,6 mm acima do chao da pupila: e essa diferenca, e nao uma
    // cor mais escura, que faz a pupila ler como buraco.
    grp.add(pecaPlana(anelIris, matIris(1.0), fz, 0.0022, 0.0016, 0.0005))

    // anel limbal: outro Shape com furo, so que fino e escuro, POR CIMA da
    // borda da iris. O bisel dele e o que da o degrau escuro que a iris precisa
    // pra nao virar botao.
    const limbo = shapeDe(circulo(a.x, a.y, rIris * 1.10, 26))
    const furoL = new THREE.Path()
    const pl = circulo(a.x, a.y, rIris * 0.86, 26)
    furoL.moveTo(pl[pl.length - 1].x, pl[pl.length - 1].y)
    for (let i = pl.length - 2; i >= 0; i--) furoL.lineTo(pl[i].x, pl[i].y)
    furoL.closePath()
    limbo.holes.push(furoL)
    grp.add(pecaPlana(limbo, matLimbo(), fz, 0.0026, 0.0018, 0.0006))

    // brilho: uma meia-lua, nao um circulo. O reflexo de uma janela num olho e
    // sempre um arco (a cornea e curva), e a meia-lua le como umidade enquanto
    // o circulo le como adesivo.
    //
    // O deslocamento leva `sgn`: sem ele o mesmo `-0.0062` empurrava a lua pro
    // NARIZ num olho e pra ORELHA no outro, e os dois olhos saiam diferentes.
    // Ver a regra do brilho no cabecalho.
    const bx = a.x - sgn * 0.0062 * S, by = a.y + 0.0072 * S
    const rb = 0.0050 * S
    const lua = new THREE.Shape()
    const nb = 14
    for (let i = 0; i <= nb; i++) {
      const t = Math.PI * 0.15 + (i / nb) * Math.PI * 1.30
      const x = bx + Math.cos(t) * rb, y = by + Math.sin(t) * rb
      if (i === 0) lua.moveTo(x, y); else lua.lineTo(x, y)
    }
    for (let i = nb; i >= 0; i--) {
      const t = Math.PI * 0.15 + (i / nb) * Math.PI * 1.30
      lua.lineTo(bx + Math.cos(t) * rb * 0.55, by + Math.sin(t) * rb * 0.55)
    }
    lua.closePath()
    grp.add(pecaPlana(lua, matBrilho(), fz, 0.0050, 0.0008, 0.0002))

    // cilio: uma faixa fina extrudada colada na borda de cima da abertura, ja
    // por dentro do labio da moldura.
    const cil = new THREE.Shape()
    const nc = 18
    const borda = (t, esp) => {
      const ang = Math.PI * (0.06 + t * 0.88)
      const c = Math.cos(ang), s = Math.sin(ang)
      const x = C_AW * c
      const y = (C_HC + esp) * Math.pow(Math.abs(s), 1.32) + torcao * c * sgn
      return [a.x + x, a.y + y]
    }
    for (let i = 0; i <= nc; i++) { const [x, y] = borda(i / nc, 0); if (i === 0) cil.moveTo(x, y); else cil.lineTo(x, y) }
    for (let i = nc; i >= 0; i--) { const [x, y] = borda(i / nc, -0.0026 * S); cil.lineTo(x, y) }
    cil.closePath()
    grp.add(pecaPlana(cil, matCilio(ctx), fz, 0.0014, 0.0012, 0.0003))
  })
}

// ===========================================================================
// CASCA — uma superficie so: a orbita e a pele deformada    (indice 1)
// ===========================================================================
//
// Nao existe globo aqui. Uma casca sai da pele, sobe formando a dobra da
// palpebra e desce de volta pro fundo da orbita, onde mora um disco levemente
// convexo — o olho. E o metodo mais barato dos cinco (nenhuma esfera, nenhuma
// textura) e o unico em que palpebra, orbita e pele sao a MESMA superficie.
//
// A profundidade e feita SUBINDO, nao descendo. O cranio e uma casca fechada:
// afundar a orbita alguns milimetros abaixo de surfaceZ poe o olho inteiro
// dentro da cabeca e nao se ve nada. Entao o fundo da orbita fica pouco acima
// da pele (1,4 mm) e o que sobe e o anel da palpebra (5,5 mm): o olho fica 4 mm
// atras da dobra que o cerca, que e a leitura de olho fundo — e agora a sombra
// da orbita e sombra de verdade, projetada pela dobra sobre o disco.
//
// A cor sai da MALHA, nao de textura nem de vertexColors: as fibras da iris sao
// cunhas alternadas entre tres meshes de tons diferentes. Custa 2 draw calls a
// mais e le como iris fibrosa de perto e como iris de cor cheia de longe, que e
// exatamente o que se quer.

const D_RW = 0.0400 * S      // meia-largura da orbita
const D_HC = 0.0250 * S
const D_HB = 0.0205 * S
const D_INT = 0.50           // fracao onde a casca chega ao fundo da orbita
const D_FUNDO = 0.0014       // fundo da orbita, ACIMA da pele (ver nota acima)
const D_DOBRA = 0.0055       // altura da dobra da palpebra superior

/** Contorno da orbita, em coordenadas relativas ao centro do olho. */
function contornoOrbita(a, k) {
  const c = Math.cos(a), s = Math.sin(a)
  const h = s >= 0 ? D_HC : D_HB
  return [D_RW * c * k, h * Math.sign(s) * Math.pow(Math.abs(s), 1.25) * k]
}

/**
 * Altura da casca sobre a pele. t = 0 no fundo da orbita, 1 na borda de fora.
 *
 * A gaussiana da dobra e centrada em t = 0.5 com largura 0.28 de proposito: em
 * t = 1 ela ja vale 4% (0,2 mm), entao a casca CHEGA na pele em vez de terminar
 * num degrau de meio milimetro que acende com luz raspante. A palpebra de baixo
 * leva 35% da dobra — existe, mas nao compete com a de cima.
 */
function alturaOrbita(k, sa) {
  const t = clamp((k - D_INT) / (1 - D_INT), 0, 1)
  const dobra = D_DOBRA * (Math.max(0, sa) + 0.35 * Math.max(0, -sa))
    * Math.exp(-Math.pow((t - 0.5) / 0.28, 2))
  return D_FUNDO * Math.pow(1 - t, 1.25) + dobra
}

/**
 * Casca da orbita entre duas fracoes do contorno. Duas cascas (uma clara por
 * fora, uma escura no fundo) e o jeito de ter a sombra da orbita sem escrever
 * atributo `color` — ver a nota sobre o forno de personagem no cabecalho.
 */
function cascaOrbita(cx, cy, k0, k1, nA) {
  const pos = []
  const idx = []
  const nK = 3
  const zDe = alturaOrbita
  for (let j = 0; j <= nK; j++) {
    const k = mix(k0, k1, j / nK)
    for (let i = 0; i < nA; i++) {
      const a = (i / nA) * Math.PI * 2
      const [dx, dy] = contornoOrbita(a, k)
      const x = cx + dx, y = cy + dy
      pos.push(x, y, surfaceZ(x, y) + zDe(k, Math.sin(a)))
    }
  }
  for (let j = 0; j < nK; j++) {
    for (let i = 0; i < nA; i++) {
      const i2 = (i + 1) % nA
      const a = j * nA + i, b = j * nA + i2, c = (j + 1) * nA + i2, d = (j + 1) * nA + i
      idx.push(a, d, c, a, c, b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * Um pedaco do leque do olho: aneis entre r0 e r1 e cunhas escolhidas por
 * `filtro(i)`. E com ele que saem a esclera, os cantos rosados e as tres
 * familias de fibra da iris — todos do MESMO leque, so em meshes diferentes.
 */
function leque(cx, cy, z0, aneis, nA, filtro) {
  const pos = []
  const idx = []
  const mapa = new Map()
  const put = (j, i) => {
    // A chave leva i % nA, e nao i. Sem o resto, a ultima cunha fecha a volta
    // num vertice NOVO em cima do primeiro: duas normais diferentes na mesma
    // posicao, que e a listra acesa que soldarNormais() existe pra consertar em
    // nucleo.js. Chaveando com o resto a costura simplesmente nao nasce.
    const ch = j * 1000 + (i % nA)
    let v = mapa.get(ch)
    if (v === undefined) {
      const a = (i % nA / nA) * Math.PI * 2
      const r = aneis[j]
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
      v = pos.length / 3
      pos.push(x, y, z0(x, y, r))
      mapa.set(ch, v)
    }
    return v
  }
  for (let j = 0; j < aneis.length - 1; j++) {
    // Anel de LARGURA ZERO (dois raios iguais na lista) nao vira banda: vira um
    // par de triangulos de area nula por fatia. Eles nao desenham nada, mas
    // computeVertexNormals soma normal ZERO neles, e o vertice que so participa
    // dessa banda sai com normal (0,0,0) — normalize() de vetor nulo e NaN no
    // shader. Era o caso de rPup*1.05 e rIris*0.42, que dao exatamente o mesmo
    // numero: 104 triangulos mortos e 104 normais nulas por par de olhos.
    // (o mesmo teste pega uma lista fora de ordem: banda que "anda pra tras"
    // sai com a volta invertida, ou seja invisivel em material de uma face.)
    if (aneis[j + 1] - aneis[j] < 1e-6 && aneis[j] > 1e-6) continue
    for (let i = 0; i < nA; i++) {
      if (filtro && !filtro(i, j)) continue
      const a = put(j, i), b = put(j, i + 1), c = put(j + 1, i + 1), d = put(j + 1, i)
      if (aneis[j] < 1e-6) idx.push(a, d, c)   // miolo: leque de triangulos
      else idx.push(a, d, c, a, c, b)
    }
  }
  if (!idx.length) return null
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  // O miolo do leque tem nA vertices na MESMA posicao (um por fatia, todos em
  // r = 0) e cada um recebe a normal de UMA fatia so: e a costura de revolucao
  // do CONTRATO §4, aqui no centro da pupila. soldarNormais funde as nA.
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return geo
}

function olhoCasca(ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const nA = 26
  return par((sgn, grp) => {
    const a = ancora(sgn, 0, -0.0015)
    const rD = D_RW * D_INT * 1.10          // disco do olho, cobre o furo da casca
    const rIris = 0.0145 * S
    const rPup = 0.0058 * S
    // O disco do olho e PARALELO a orbita, nao um plano. Num plano ele saia
    // pela frente da casca do lado de fora e sumia atras dela do lado de dentro
    // — o cranio desce ~6 mm por centimetro de X nessa altura. Aqui cada
    // vertice le a pele no proprio ponto e sobe o mesmo tanto.
    // A borda do disco fica 1 mm ABAIXO do fundo da casca (D_FUNDO): assim o
    // pedaco do disco que passa do furo some por tras da casca, inclusive em
    // cima e embaixo, onde o furo e mais estreito. E o bojo morre antes da
    // borda (rD * 0.62) pra nao empurrar ela pra frente de novo.
    const conv = 0.0042
    const perfil = (x, y, r) => surfaceZ(x, y) + D_FUNDO - 0.0010
      + conv * Math.max(0, 1 - Math.pow(r / (rD * 0.62), 2))

    // duas cascas: a de fora e pele, a do fundo e pele escurecida. A emenda cai
    // em k = 0.74, longe da borda visivel dos dois lados.
    //
    // As duas terminam no MESMO k, e nao sobrepostas (a de dentro ia ate 0.755).
    // Sobrepor parece seguro contra fenda, mas `alturaOrbita` so depende de k:
    // no trecho comum as duas cascas caem no mesmo Z, e duas superficies
    // coplanares de tom diferente e z-fighting — um anel de 0,8 mm piscando
    // entre os dois tons de pele. Com o k identico os vertices da emenda saem
    // bit a bit iguais (mesmo nA, mesmo contorno, mesma altura), entao nao ha
    // nem fenda nem sobreposicao.
    const EMENDA = 0.74
    const fora = new THREE.Mesh(cascaOrbita(a.x, a.y, EMENDA, 1.0, nA), matPele(skin, 0.99))
    fora.castShadow = false; fora.receiveShadow = true
    grp.add(fora)
    const dentro = new THREE.Mesh(cascaOrbita(a.x, a.y, D_INT, EMENDA, nA), matPele(skin, 0.66))
    dentro.castShadow = false; dentro.receiveShadow = true
    grp.add(dentro)

    // --- o disco do olho, tudo tirado do mesmo leque -------------------------
    // A lista TEM que ser crescente: `leque` monta cada banda do anel j pro j+1
    // e a volta dos triangulos sai do sentido "pra fora". O anel intermediario
    // da esclera vem de mix() e nao de uma fracao de rD justamente por isso —
    // escrito como rD * 0.68 ele dava 0.0199, MENOR que rIris * 1.07 (0.0206):
    // a primeira banda da esclera andava pra tras, saia com a frente virada pra
    // dentro (metade do branco do olho e dos cantos rosados INVISIVEL, 52
    // triangulos por par) e ainda deitava 0,8 mm em cima do anel limbal, que e
    // z-fighting entre o preto do limbo e o branco da esclera.
    const aneis = [
      0, rPup * 0.6, rPup, rPup * 1.05, rIris * 0.42, rIris * 0.72, rIris * 0.93,
      rIris, rIris * 1.07, mix(rIris * 1.07, rD, 0.45), rD,
    ]
    const IPUP = 2          // aneis[0..2] = pupila
    const IIRIS0 = 3, IIRIS1 = 7
    const ILIMBO = 8

    grp.add(flatPiece(new THREE.Mesh(leque(a.x, a.y, perfil, aneis.slice(0, IPUP + 1), nA), matPupila())))

    // As tres familias de cunha: i%3. Sao o MESMO anel, em tres tons — de longe
    // viram uma cor so, de perto viram fibra. Nao da pra fazer isso com uma
    // calota lisa e nao precisou de uma textura.
    // Os tres tons eram [1.0, 1.34, 0.72] — 62% de amplitude entre a cunha mais
    // clara e a mais escura. Com a iris menos especular (ver a nota de
    // rugosidade na paleta) nao ha mais brilho lavando por cima, e essa
    // amplitude passou a ler como CATAVENTO em vez de fibra. 34% ja da a textura
    // de perto e continua virando uma cor so a tres metros, que era o pedido.
    const tons = [1.0, 1.18, 0.84]
    for (let f = 0; f < 3; f++) {
      const g2 = leque(a.x, a.y, perfil, aneis.slice(IIRIS0, IIRIS1 + 1), nA, (i) => i % 3 === f)
      if (g2) grp.add(flatPiece(new THREE.Mesh(g2, matIris(tons[f]))))
    }
    // liga a pupila a iris (o anel que sobrou entre elas) com o tom fundo
    grp.add(flatPiece(new THREE.Mesh(leque(a.x, a.y, perfil, aneis.slice(IPUP, IIRIS0 + 1), nA), matIris(0.42))))

    grp.add(flatPiece(new THREE.Mesh(leque(a.x, a.y, perfil, aneis.slice(IIRIS1, ILIMBO + 1), nA), matLimbo())))

    // esclera: as cunhas do meio; os extremos horizontais viram os cantos
    // rosados. A conta e so "esta cunha aponta pro lado?" — o rosa nasce da
    // propria malha, sem textura e sem uma segunda geometria.
    // 0.88 e nao 0.80: com 0.80 as cunhas rosadas tomavam 41% da volta e o
    // branco do olho virava um anel rosa. 0.88 deixa 31%, que le como canto.
    const horizontal = (i) => {
      const c = Math.abs(Math.cos((i / nA) * Math.PI * 2))
      return c > 0.88
    }
    const brancos = leque(a.x, a.y, perfil, aneis.slice(ILIMBO), nA, (i) => !horizontal(i))
    if (brancos) grp.add(flatPiece(new THREE.Mesh(brancos, matEsclera())))
    const rosas = leque(a.x, a.y, perfil, aneis.slice(ILIMBO), nA, (i) => horizontal(i))
    if (rosas) grp.add(flatPiece(new THREE.Mesh(rosas, matCanto())))

    // BRILHO. Era um QUAD de dois triangulos: um retangulo alinhado aos eixos,
    // de 11 x 8 mm, ao lado de uma pupila de 15 mm. Na folha de contato de perto
    // ele nao lia como reflexo, lia como um QUADRADO BRANCO colado no olho —
    // "o ponto especular mais barato que existe" saiu caro na leitura.
    //
    // Agora e um leque eliptico: 14 fatias em volta de um centro, mais alto que
    // largo, com um terco do diametro da pupila. E o deslocamento leva `sgn`,
    // senao o realce cai no lado do nariz num olho e no da orelha no outro.
    const bx = a.x - sgn * 0.0052 * S, by = a.y + 0.0058 * S
    const brx = 0.0021 * S, bry = 0.0029 * S
    const zb = (px, py) => perfil(px, py, Math.hypot(px - a.x, py - a.y)) + 0.0012
    const bp = [bx, by, zb(bx, by)]
    const bi = []
    const nBri = 14
    for (let i = 0; i < nBri; i++) {
      const t = (i / nBri) * Math.PI * 2
      const px = bx + Math.cos(t) * brx, py = by + Math.sin(t) * bry
      bp.push(px, py, zb(px, py))
      // (0, i, i+1) e a mesma volta do resto do arquivo: no sentido do angulo
      // com o centro fixo, que e a que deixa a frente virada pra FORA da cabeca.
      bi.push(0, 1 + i, 1 + ((i + 1) % nBri))
    }
    const gBri = new THREE.BufferGeometry()
    gBri.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3))
    gBri.setIndex(bi)
    // (aqui o centro e UM vertice so, compartilhado pelas 14 fatias, entao nao
    // ha a costura de revolucao que `leque` precisa soldar)
    gBri.computeVertexNormals()
    gBri.computeBoundingSphere()
    grp.add(flatPiece(new THREE.Mesh(gBri, matBrilho())))

    // linha de cilio: uma tira estreita na borda de cima do furo da casca.
    const cil = []
    const idc = []
    const nc = 18
    for (let i = 0; i <= nc; i++) {
      const ang = Math.PI * (0.05 + (i / nc) * 0.90)
      for (let j = 0; j < 2; j++) {
        const k = D_INT * (j ? 1.0 : 1.16)
        const [dx, dy] = contornoOrbita(ang, k)
        const x = a.x + dx, y = a.y + dy
        cil.push(x, y, surfaceZ(x, y) + alturaOrbita(k, Math.sin(ang)) + 0.0006)
      }
    }
    for (let i = 0; i < nc; i++) idc.push(i * 2, i * 2 + 2, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 1)
    const gc = new THREE.BufferGeometry()
    gc.setAttribute('position', new THREE.Float32BufferAttribute(cil, 3))
    gc.setIndex(idc)
    gc.computeVertexNormals()
    gc.computeBoundingSphere()
    grp.add(flatPiece(new THREE.Mesh(gc, matCilio(ctx))))
  })
}

// ===========================================================================
// LENTE — globo enterrado, iris TORNEADA e palpebra em rolo  (indice 3)
// ===========================================================================
//
// O mais proximo da referencia: globo pequeno e fundo, esclera reduzida, iris
// grande e uma palpebra que e um rolo de verdade (TubeGeometry varrido ao longo
// da margem), com cilios que sao fios de tecelagem().
//
// A iris sai de LatheGeometry: um perfil 2D revolucionado. Isso da o que nem
// calota nem textura dao — RELEVO: o anel limbal e um degrau inclinado (fica
// escuro porque a superficie vira de lado, nao porque foi pintado de preto) e a
// pupila e um poco com parede.
//
// Armadilha do Lathe: a normal sai de (dy, -dx) do proprio perfil, entao os
// pontos tem que ir do raio MAIOR pro MENOR pra normal apontar pra frente.
// Na ordem contraria a iris renderiza preta e parece um bug de material.
//
// ---------------------------------------------------------------------------
// A "PILHA DE PRATOS CONCENTRICOS"
//
// Foi o veredito da folha de contato, e era literal: cada peca deste metodo
// pousava numa ALTURA PROPRIA sobre o globo, e cada degrau entre elas desenhava
// um circulo. Contando de fora pra dentro davam cinco aneis visiveis:
//
//   1. o rolo da palpebra, de raio 0.165 num globo de raio 1 — ele sozinho
//      subia 26 mm acima da pele (e os cilios, 30 mm);
//   2. a borda da calota de esclera, que ficava ACIMA do rolo (sin(0.66) = 0.61
//      contra uma margem em 0.33) e portanto exposta, com a pintura da borda
//      num tom de pele diferente do globo — um anel claro;
//   3. o anel limbal, comecando 1.5% fora da esfera;
//   4. a iris, uma cupula 3.6% acima da esfera;
//   5. a pupila, outro disco 1.8% acima.
//
// E no meio de tudo isso o olho em si era pequeno: E_ARCO 0.66 e E_ABERTURA
// 0.64 num globo largo demais.
//
// O conserto tem tres partes e todas as tres estao nos numeros abaixo:
//   - o globo encolhe (razao 0.30 -> 0.23) e afunda mais na orbita;
//   - o rolo emagrece pra pouco mais da metade e a linha da margem desce pra
//     cima da propria esfera, entao metade dele fica DENTRO do globo como o
//     metodo sempre prometeu;
//   - os perfis do torno passam a SEGUIR a esfera em vez de flutuar sobre ela,
//     e cada perfil comeca EXATAMENTE onde o anterior termina. Sem degrau nao
//     ha aro; o anel limbal continua escuro porque a superficie vira de lado
//     ali, que era a ideia do metodo desde o comeco.
// E a abertura cresce: E_ARCO 0.86 e E_ABERTURA 0.80 num globo menor deixam o
// olho MAIOR na tela do que ele era antes de tudo isso.
// ---------------------------------------------------------------------------

const E_GLOBO = { rx: 0.0310 * S, ry: 0.0301 * S, rz: 0.0288 * S, sink: 0.86 }
const E_ARCO = 0.86
const E_ABERTURA = 0.80

// Perfis do torno, em [raio, altura] sobre a esfera de raio 1. A altura de cada
// ponto e sqrt(1 - r^2) vezes um fator de 1.002 a 1.016: e o que faz a peca
// ACOMPANHAR o globo com uma cupula corneana de meio milimetro em vez de pousar
// como um prato. O ultimo ponto de um perfil e o primeiro do seguinte.
const E_LIMBO = [[0.545, 0.8385], [0.512, 0.8598], [0.480, 0.8809]]
const E_IRIS = [
  [0.480, 0.8809], [0.400, 0.9238], [0.310, 0.9612],
  [0.230, 0.9858], [0.170, 1.0002], [0.152, 1.0032], [0.150, 0.9990],
]
const E_PUPILA = [[0.150, 0.9990], [0.115, 0.9982], [0.058, 0.9976], [0.000, 0.9974]]

function torneada(perfil, seg) {
  const pts = perfil.map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(pts, seg)
  g.rotateX(Math.PI / 2)     // o eixo do torno (+Y) vira o eixo do olhar (+Z)
  return g
}

/** Sombra da palpebra + rosa dos cantos, pintados na esclera reduzida. */
function pintarEsclera(px, s, pele) {
  const seno = Math.sin(E_ARCO)
  const esc = bts(ESCLERA), canto = bts(ESCLERA_CANTO), cPele = bts(pele)
  for (let y = 0; y < s; y++) {
    const theta = E_ARCO * ((y + 0.5) / s)
    const rp = Math.sin(theta) / seno
    for (let x = 0; x < s; x++) {
      const ang = ((x + 0.5) / s) * Math.PI * 2
      const lx = -Math.cos(ang), ly = -Math.sin(ang)
      // a sombra do rolo da palpebra: forte em cima, sumindo pra baixo. Sem
      // ela a faixa de branco entre o rolo e a iris fica acesa demais e o
      // boneco parece assustado.
      //
      // As tres faixas foram EMPURRADAS PRA FORA junto com o aumento de E_ARCO.
      // Elas sao escritas em rp, que e fracao do raio da calota: com a calota
      // maior os mesmos numeros passaram a cair muito mais perto da iris, e o
      // resultado era um olho onde a esclera nao existia — sombra, depois rosa,
      // depois pele, sem branco nenhum no meio.
      let c = mulC(esc, 1 - (0.30 * Math.max(0, ly) + 0.05) * smoothstep(0.20, 0.85, rp))
      c = lerpC(c, canto, smoothstep(0.62, 0.99, rp) * Math.pow(Math.abs(lx), 2.4) * 0.85)
      c = lerpC(c, cPele, smoothstep(0.90, 0.995, rp))
      const i = (y * s + x) * 4
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255
    }
  }
}

function matEscleraPintada(pele) {
  const chave = 'olho-lente:' + pele
  return stdMat(chave, {
    map: texturaOlho(chave, 96, (px, s) => pintarEsclera(px, s, pele)),
    roughness: 0.15, metalness: 0.0,
  })
}

/**
 * Margem da palpebra deste metodo, em (a, b) e raio.
 *
 * O raio caiu de 1.06 pra 1.00 no meio da margem: com 1.06 o EIXO do rolo ja
 * nascia 6% fora do globo e o tubo inteiro ficava por cima dele, virando um
 * bracelete em vez de uma palpebra. Em 1.00 o eixo corre EM CIMA da esfera e
 * metade da cana fica enterrada, que e o que o metodo sempre disse fazer.
 */
function margemLente(w, sgn, alto, queda) {
  const ww = clamp(w, -1.2, 1.2)
  const a = E_ABERTURA * ww * sgn
  const b = alto * Math.sqrt(Math.max(0, 1 - ww * ww)) - queda * ww * ww
  const r = ww * ww > 1 ? 0.70 : mix(1.00, 0.84, smoothstep(0.80, 1.0, Math.abs(ww)))
  return [a, b, r]
}

function rolo(sgn, alto, queda, raio, nPontos) {
  const pts = []
  for (let i = 0; i <= nPontos; i++) {
    const w = -1.16 + (i / nPontos) * 2.32
    const [a, b, r] = margemLente(w, sgn, alto, queda)
    pts.push(pontoEsfera(a, b).multiplyScalar(r))
  }
  const curva = new THREE.CatmullRomCurve3(pts)
  return new THREE.TubeGeometry(curva, 20, raio, 7, false)
}

function olhoLente(ctx) {
  useHead(ctx)
  const skin = skinOf(ctx)
  const g = E_GLOBO
  const cCilio = matCilio(ctx)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const eixo = new THREE.Vector3()
  return par((sgn, grp) => {
    const casca = eixoOlho(grp, sgn, g)
    casca.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), matPele(skin, 0.95))))

    // 1.0025 e nao 1.006: a calota da esclera e a esfera do globo tem a MESMA
    // forma, entao o degrau entre elas so serve pra evitar z-fighting, e quanto
    // menor menos ele desenha um aro na borda. A pintura tambem recebe a pele ja
    // escurecida no tom do globo (0.95) — com o tom cru a borda saia 5% mais
    // clara e virava, ela sozinha, um dos "pratos".
    const esc = flatPiece(new THREE.Mesh(calotaZ(E_ARCO, 24, 10), matEscleraPintada(shade(skin, 0.95))))
    esc.scale.setScalar(1.0025)
    esc.receiveShadow = true
    casca.add(esc)

    casca.add(flatPiece(new THREE.Mesh(torneada(E_LIMBO, 26), matLimbo())))
    casca.add(flatPiece(new THREE.Mesh(torneada(E_IRIS, 26), matIris(1.06))))
    casca.add(flatPiece(new THREE.Mesh(torneada(E_PUPILA, 22), matPupila())))

    // BRILHO. Eram duas esferas pousadas em z = 1.030 — bolas soltas na frente
    // da iris, que num globo maior ainda apareciam do lado de fora do rolo. Aqui
    // sao calotas na propria esfera (ver brilhoCalota) e espelhadas pelo lado.
    // A iris vai ate 0.480 de raio = 0.50 rad de arco; o realce grande alcanca
    // 0.205 + 0.058 = 0.26. Fica dentro, com folga.
    casca.add(brilhoCalota(-sgn * 0.150, 0.140, 0.058, 1.040))
    casca.add(brilhoCalota(sgn * 0.120, -0.135, 0.030, 1.040, 8))

    // rolo da palpebra: metade dele fica DENTRO do globo, entao o que se ve e
    // meia cana e a linha da margem e a intersecao das duas superficies — limpa,
    // sem serrilhado e sem precisar cortar geometria.
    // as duas margens usam a MESMA queda (0.14): e o que faz o rolo de cima e o
    // de baixo se encontrarem exatamente no canto em vez de se cruzarem.
    //
    // Os raios cairam de 0.165/0.105 pra 0.092/0.066. 0.165 num globo de raio 1
    // e uma cana de 1/3 do olho: era o "prato" mais grosso da pilha, e ele
    // sozinho punha 26 mm de calombo na frente da cara.
    casca.add(flatPiece(new THREE.Mesh(rolo(sgn, 0.34, 0.14, 0.092, 9), matPele(skin, 0.92))))
    casca.add(flatPiece(new THREE.Mesh(rolo(sgn, -0.28, 0.14, 0.066, 9), matPele(skin, 1.02))))

    // cilios de verdade: fios de tecelagem() plantados ao longo da margem de
    // cima. Sao 11 e nao 30 porque a esta distancia o que o olho ve e a
    // SILHUETA da franja, nao os fios; 11 ja quebram a linha reta do rolo.
    //
    // Nasciam em 1.10 do raio e mediam ate 0.30 dele: 30 mm de espeto saindo da
    // cara, medidos contra a pele. Com o rolo fino a margem esta em ~1.09, entao
    // 1.10 continua sendo o lugar certo pra nascer — o que encolheu foi o
    // COMPRIMENTO (0.30 -> 0.16 no pior fio) e a espessura.
    const ma = tecelagem()
    const r = rng(7)
    for (let i = 0; i < 11; i++) {
      const w = -0.82 + (i / 10) * 1.64
      const [a, b] = margemLente(w, sgn, 0.34, 0.14)
      pontoEsfera(a, b - 0.06, p).multiplyScalar(1.10)
      n.copy(p).normalize()
      // o fio sai da margem pra fora e pra cima; a mistura 0.62/0.55 e o que
      // deixa a franja visivel de frente sem ela virar um leque de espinhos
      n.set(n.x * 0.62, n.y * 0.55 + 0.55, n.z * 0.62).normalize()
      eixo.set(Math.cos(a), 0, -Math.sin(a))
      const comp = 0.11 + r() * 0.05
      fio(ma, p, n, comp, 0.013, eixo, -0.5 - r() * 0.4, 4, 3)
    }
    casca.add(flatPiece(new THREE.Mesh(ma.geo(), cCilio)))
  })
}

// ===========================================================================
// CATALOGO
// ===========================================================================

// CINCO itens, e cinco e o numero que o protocolo conta (comum/protocolo.js,
// APARENCIA_OPCOES). Acrescentar ou remover um muda o significado de um byte da
// rede pros dois lados; REORDENAR nao, e foi o que se fez aqui — o melhor olho
// da folha de contato subiu pro indice 0, que e o que o jogador novo ganha.
export const OLHOS = [
  {
    id: 'polar', nome: 'Pintado', name: 'Pintado',
    metodo: 'uma calota so com iris/fibra/limbo/pupila/brilho pintados em textura POLAR; palpebras varridas ao longo da curva da margem',
    build: olhoPolar,
  },
  {
    id: 'casca', nome: 'Fundo', name: 'Fundo',
    metodo: 'casca unica que mergulha na orbita (sem globo) + leque radial cujas cunhas alternadas em 3 tons viram as fibras da iris',
    build: olhoCasca,
  },
  {
    id: 'recorte', nome: 'Recortado', name: 'Recortado',
    metodo: 'abertura em amendoa como FURO de um Shape 2D extrudado e projetado na pele; iris e pupila pelo mesmo metodo (anel com furo = poco real)',
    build: olhoRecorte,
  },
  {
    id: 'lente', nome: 'Lente', name: 'Lente',
    metodo: 'globo enterrado com iris TORNEADA (LatheGeometry: limbo em degrau, pupila em poco), palpebra em rolo (TubeGeometry) e cilios de fio',
    build: olhoLente,
  },
  {
    id: 'calotas', nome: 'Empilhado', name: 'Empilhado',
    metodo: 'globo + calotas concentricas (esclera, limbo, 3 aneis de iris, pupila, brilho) e palpebras de calota tombada',
    build: olhoCalotas,
  },
]

/**
 * Elipsoide equivalente de cada olho, por INDICE do catalogo. Serve pra quem
 * precisa saber onde o globo esta sem reconstruir a peca (sobrancelha que
 * quer distancia do olho, olheira, oculos).
 * 'recorte' e 'casca' nao tem globo de verdade: os numeros ali sao a caixa da
 * abertura, que e o que qualquer consumidor realmente quer saber.
 *
 * ESTA LISTA E LIDA POR INDICE, entao ela tem que andar junto com OLHOS. Uma
 * reordenacao que esquecesse daqui devolveria o globo do olho errado pra quem
 * pergunta — e o consumidor tipico (sobrancelha, olheira, oculos) posicionaria
 * a peca dele em cima de um olho que nao esta na cara. Os ids estao escritos em
 * comentario justamente pra a proxima reordenacao nao passar batido.
 */
export const OLHO_GLOBO = [
  /* 0 polar   */ { rx: B_GLOBO.rx, ry: B_GLOBO.ry, rz: B_GLOBO.rz, x: EYE_ANCHOR.x, y: EYE_ANCHOR.y, sink: B_GLOBO.sink },
  /* 1 casca   */ { rx: D_RW * D_INT, ry: D_HC * D_INT, rz: D_DOBRA, x: EYE_ANCHOR.x, y: EYE_ANCHOR.y - 0.0015, sink: 1 },
  /* 2 recorte */ { rx: C_AW, ry: C_HC, rz: C_LABIO, x: EYE_ANCHOR.x, y: EYE_ANCHOR.y, sink: 1 },
  /* 3 lente   */ { rx: E_GLOBO.rx, ry: E_GLOBO.ry, rz: E_GLOBO.rz, x: EYE_ANCHOR.x, y: EYE_ANCHOR.y, sink: E_GLOBO.sink },
  /* 4 calotas */ { rx: A_GLOBO.rx, ry: A_GLOBO.ry, rz: A_GLOBO.rz, x: EYE_ANCHOR.x, y: EYE_ANCHOR.y, sink: A_GLOBO.sink },
]

export default OLHOS
