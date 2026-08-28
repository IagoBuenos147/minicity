import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import { soldarNormais } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/tatuagens.js — catalogo de TATUAGEM. Ancora do slot: chest.
//
// Tatuagem nao e peca de roupa: e TINTA NA PELE. Toda entrada daqui nasce como
// uma casca de 1,5 mm (FORA) por fora do corpo nu. O numero e uma faixa
// estreita e as duas bordas dela ja machucaram: abaixo de ~1 mm o depth buffer
// perde a briga a 20 m e a tinta PISCA junto com a pele; acima de ~4 mm ela
// para de parecer tinta e vira adesivo boiando no braco.
//
// Nenhuma entrada declara `esconde`, e isso e de proposito. Tatuagem nao cobre
// pele nenhuma; se a camisa cobrir o membro, a tinta fica onde esta (por baixo
// ou por cima do pano, conforme o raio da peca). E como o catalogo antigo
// sempre se comportou e nao se resolve deste lado — quem resolve e o slot de
// blusa, que sabe o que esta vestindo.
//
// TRES METODOS, um por item. O dono pediu explicitamente pra poder comparar na
// tela qual combina com o jogo, entao aqui nao ha dois itens que sejam a mesma
// funcao com outro desenho:
//
//   A. manga-tribal — FAIXA ENVOLVENTE. Casca de revolucao dando a volta
//      INTEIRA no membro, com padrao periodico que fecha na emenda. Cobre
//      muito, custa quase nada, mas so aceita desenho continuo: figura unica
//      neste metodo sai cortada ao meio na lateral do braco. E, por ser de
//      REVOLUCAO, so cobre o que e redondo em volta do osso — por isso ela
//      comeca abaixo do deltoide (ver BRACO_TOPO).
//
//   B. falcao — CHAPA FIGURATIVA. Setor de casca de arco limitado colado no
//      peito, com o desenho recortado por alpha. Nao fecha volta nenhuma,
//      entao aceita SILHUETA — e o unico dos tres que da uma imagem
//      reconhecivel a 10 m.
//
//   C. linha-viva — TINTA POR GEOMETRIA. Nao ha textura: o traco e um tubo
//      extrudado achatado contra o braco, mais um aro e tres pontos. Custa 2x
//      mais triangulo que os outros dois e paga isso com borda perfeita em
//      close (nenhum serrilhado de alphaTest), brilho especular proprio de
//      tinta fresca e um volume de decimo de milimetro que textura nao tem.
//
// Orcamento do CONTRATO: 1500 triangulos por peca. A custa 936 (o perfil dela e
// amostrado ponto a ponto na curva do membro, e e isso que a faz acompanhar a
// pele em vez de boiar), B custa 140 e C custa 932, que e o preco de nao ter
// textura.
// ---------------------------------------------------------------------------

// Quanto a tinta sobe acima da pele. Ver o cabecalho.
const FORA = 0.0015

// A PELE DO BRACO NAO E UMA CAPSULA.
//
// Nao existe mais limbGeo(0.045, ...) nem cilindro de raio unico: character.js
// gera braco e antebraco com membroGeo(), um LOFT cujo raio sai de uma curva —
// ventre do deltoide grosso em cima, afinamento no cotovelo, bojo do
// braquiorradial e pulso fino. Medido no boneco nu: o braco vai de 0.0470 a
// 0.0350 e o antebraco de 0.0414 (logo abaixo do cotovelo) a 0.0240 (pulso).
//
// Escrever UM raio pro membro inteiro faz os dois defeitos ao mesmo tempo: a
// tinta AFUNDA onde o membro e gordo e BOIA onde ele e fino. Com 0.041 no
// antebraco a faixa nascia 1,7 cm por fora do pulso — um tubo pendurado no
// braco, visivel de qualquer angulo, nao so no close.
//
// Entao aqui a tinta le a MESMA curva que gera a pele. Os pares e os
// comprimentos sao os de character.js (RAIO_BRACO / RAIO_ANTEBRACO com
// UPPER_ARM - 0.016 e FORE_ARM - 0.018): se o braco mudar la, e esta tabela que
// vai junto. E o mais perto de raioPerfil() que da pra chegar num membro —
// ctx.perfil so entrega PELVIS/PEITO/MANGA porque membro e loft, nao lathe.
const CURVA_BRACO = [
  [0.00, 0.0455],  // deltoide
  [0.18, 0.0470],  // ventre do deltoide, o ponto mais grosso
  [0.55, 0.0405],  // meio do umero
  [0.86, 0.0355],  // acima do cotovelo
  [1.00, 0.0350],
]
const CURVA_ANTE = [
  [0.00, 0.0385],
  [0.16, 0.0415],  // bojo do braquiorradial, logo abaixo do cotovelo
  [0.55, 0.0330],
  [0.86, 0.0248],  // pulso
  [1.00, 0.0240],
]

/** A MESMA interpolacao suave de curvaR() em character.js. */
function curvaR(pares, t) {
  if (t <= pares[0][0]) return pares[0][1]
  for (let i = 1; i < pares.length; i++) {
    if (t <= pares[i][0]) {
      const a = pares[i - 1], b = pares[i]
      const k = (t - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)
    }
  }
  return pares[pares.length - 1][1]
}

/**
 * Raio da pele do membro na altura y — y = 0 na junta, o membro desce em -Y.
 * Fora do trecho do loft vale a CUPULA que membroGeo poe nas duas pontas (meia
 * esfera achatada em 0.72). Nao e enfeite: e a cupula do topo do antebraco que
 * cobre o cotovelo dobrado, e por causa dela que character.js pode ter tirado a
 * bola de cotovelo.
 */
function raioMembro(pares, len, y) {
  const rTopo = pares[0][1]
  const rBase = pares[pares.length - 1][1]
  if (y > 0) {
    const k = Math.min(1, y / (rTopo * 0.72))
    return rTopo * Math.sqrt(Math.max(0, 1 - k * k))
  }
  if (y < -len) {
    const k = Math.min(1, (-y - len) / (rBase * 0.72))
    return rBase * Math.sqrt(Math.max(0, 1 - k * k))
  }
  return curvaR(pares, -y / len)
}

// ONDE A FAIXA DO BRACO PARA, e por que nao no ombro.
//
// character.js pendura no braco o DELTOIDE: um elipsoide (0.052, 0.058, 0.050)
// centrado em y = -0.020 e deslocado 8 mm pra DENTRO do corpo. Ele chega a
// 6,0 cm do eixo do braco do lado de dentro contra 4,4 cm do lado de fora — ou
// seja, ele NAO e um solido de revolucao em volta do osso. Uma casca revolvida
// que o cobrisse teria que ter 6,1 cm de raio e boiaria 1,6 cm do lado de fora;
// a versao anterior desta faixa escolheu o contrario, ficou em 4,65 cm, e
// enterrou 1,35 cm do ombro DENTRO da tinta (a bola do deltoide atravessava o
// desenho). Nenhum dos dois e aceitavel, entao a faixa comeca abaixo dele: a
// manga nasce no biceps, que e onde manga tribal nasce mesmo.
// O deltoide passa da casca acima de y = -0.058; -0.062 deixa 4 mm de margem.
const BRACO_TOPO = -0.062
// A base da faixa do braco entra 8 mm na CUPULA DE BAIXO do loft (por isso sai
// do comprimento do membro e nao de um numero fixo): e la que a cupula do
// antebraco, que vem pela OUTRA junta e e mais gorda, engole a borda desta.
// Assim a manga nao abre vao no cotovelo nem com ele dobrado.
const bracoBase = (len) => -(len + 0.008)

// Tinta de verdade em pele clara LE CINZA-AZULADO. Preto puro num boneco
// estilizado nao le como tatuagem, le como buraco no braco.
//
// A MASSA da figura e o tom CLARO da faixa aprovada (0x14121e a 0x1e2a33), e
// nao o escuro. Fotografando o peito no jogo com a massa em 0x14121e, o falcao
// chega na tela como uma silhueta preta chapada: 8% de luminancia debaixo do
// sol da cidade nao deixa cor nenhuma sobrar. Em 0x1e2a33 a mesma figura le
// azul-ardosia, que e como tinta de agulha se comporta na pele.
// O tom fundo (o do nucleo) sobrou pro que e CONTORNO e detalhe: no fio fino
// ele nao vira mancha e ainda separa o desenho de si mesmo.
const TINTA_BASE = 'rgba(30,42,51,1)'   // 0x1e2a33 — massa
const TINTA_FUNDA = N.TINTA             // rgba(20,18,30) = 0x14121e — contorno
const COR_GEO = 0x1a2028                // tinta do item C, em geometria

/**
 * tintaMat() pinta num canvas, e canvas so existe onde ha DOM. As conferencias
 * do repositorio (tools/*.mjs e o node -e que mede a caixa de cada peca) montam
 * o boneco em node puro, sem DOM: la dentro document.createElement estoura
 * antes de existir um unico triangulo, e o catalogo inteiro fica impossivel de
 * medir por causa do desenho.
 *
 * O desvio devolve a MESMA casca com tinta chapada. A geometria — que e o que a
 * conferencia mede — sai identica, e o desenho so falta onde nao ha tela pra
 * mostrar ele. No navegador nada disto roda.
 */
function tinta(id, desenho, voltas) {
  if (typeof document === 'undefined') {
    return solid(0x14121e, 0.95, 0, { side: THREE.DoubleSide })
  }
  return N.tintaMat(id, desenho, voltas)
}

/**
 * LatheGeometry reparte o v pelo INDICE do ponto do perfil, nao pela altura.
 * Os perfis daqui tem pontos em alturas MUITO irregulares (22 cm de cilindro e
 * depois quatro pontos em 4 cm de domo): sem corrigir, 4/6 da textura cai
 * dentro do ombro e a manga inteira chega comprimida no biceps. E a mesma
 * correcao que chapaPeito() ja faz no nucleo, pelo mesmo motivo.
 */
function uvPorAltura(geo, y0, y1) {
  const pos = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0))
  uv.needsUpdate = true
  return geo
}

/** Casca de tinta em volta de um membro, a partir de um perfil [[r, y], ...]. */
function cascaMembro(perfil, mat, seg = 18) {
  const geo = N.revolver(perfil, seg)   // revolver ja solda a emenda da lathe
  return N.sh(new THREE.Mesh(
    uvPorAltura(geo, perfil[0][1], perfil[perfil.length - 1][1]), mat,
  ))
}

// ===========================================================================
// A. FAIXA ENVOLVENTE — o desenho tem que FECHAR na emenda
// ===========================================================================
// A textura da a volta inteira: a coluna 0 encosta na coluna final. Qualquer
// motivo que nao caia num divisor exato da largura vira um CORTE visivel
// descendo pela lateral do braco. Por isso tudo aqui tem periodo s/8 ou um
// numero INTEIRO de senoides na largura, e os motivos que caem em cima da
// emenda sao desenhados dos dois lados (o laco vai de -1 a 8).

function desenhoTribal(g, s) {
  g.clearRect(0, 0, s, s)
  const P = s / 8            // 8 modulos na volta do membro
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.fillStyle = TINTA_BASE
  g.strokeStyle = TINTA_BASE

  // ESTES 128 px VIRAM 27 cm DE BRACO: 1 px da textura chega na pele com 2 mm.
  // A primeira versao tinha trilho de 9 px, dente de 40 e trancado de 10 px de
  // traco — no boneco isso deu 70% de cobertura e o braco virou uma MANGA PRETA
  // com uns recortes claros, que e o mesmo defeito que derrubou o tribal
  // antigo. O que faz ler como tribal e o VAZIO entre os motivos, nao a tinta.
  // Cobertura de agora: ~38%.
  g.fillRect(0, 8, s, 5)
  g.fillRect(0, 118, s, 5)

  // Dentes pendurados no trilho de cima, alternando alto e baixo, com base de
  // 2/3 do modulo pra sobrar pele entre um dente e o outro. A alternancia e por
  // paridade de i e sao 8 modulos (par), entao o dente que cai em cima da
  // emenda sai igual dos dois lados.
  for (let i = -1; i <= 8; i++) {
    const x = i * P + P / 2
    const b = P * 0.33
    g.beginPath()
    g.moveTo(x - b, 12)
    g.lineTo(x + b, 12)
    g.lineTo(x, 12 + ((i & 1) ? 16 : 27))
    g.closePath()
    g.fill()
  }

  // Trancado do meio: duas senoides em antifase, TRES periodos inteiros na
  // largura (por isso fecha na emenda). Elas se cruzam seis vezes e e o
  // cruzamento que da leitura de corda trancada em vez de listra ondulada — mas
  // so se a amplitude for bem maior que o traco, senao as duas se encostam e
  // viram uma faixa cheia.
  g.lineWidth = 4 * N.GROSSO
  for (const fase of [0, Math.PI]) {
    g.beginPath()
    for (let x = 0; x <= s; x += 4) {
      const y = 74 + Math.sin((x / s) * Math.PI * 6 + fase) * 17
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.stroke()
  }

  // Ponto fundo no olho do trancado. O olho fica no ANTINODO das senoides (meio
  // caminho entre dois cruzamentos, a cada s/6), e nao no modulo de s/8 dos
  // dentes: colocado no ritmo errado ele cai em cima do traco e some.
  g.fillStyle = TINTA_FUNDA
  for (let k = -1; k <= 6; k++) {
    g.beginPath()
    g.arc((k + 0.5) * (s / 6), 74, 3.5, 0, 7)
    g.fill()
  }

  // Setas subindo pro trilho de baixo, meio modulo fora de fase com os dentes.
  g.strokeStyle = TINTA_BASE
  g.lineWidth = 3.5 * N.GROSSO
  for (let i = -1; i <= 8; i++) {
    const x = i * P + P / 2
    g.beginPath()
    g.moveTo(x - P / 2, 112)
    g.lineTo(x, 100)
    g.lineTo(x + P / 2, 112)
    g.stroke()
  }
}

/**
 * Perfil da faixa do BRACO: a curva de raio da PELE + FORA, amostrada ponto a
 * ponto. Nao ha cilindro nem domo escrito a mao — o loft ja tem os dois, e foi
 * exatamente isso que a versao anterior errou (cilindro de raio unico com um
 * domo de esfera colado em cima de um membro que nao e nem cilindro nem esfera).
 */
function perfilBraco(c) {
  const len = c.medida.UPPER_ARM - 0.016
  const base = bracoBase(len)
  const p = []
  for (let i = 0; i <= 10; i++) {
    const y = base + (BRACO_TOPO - base) * (i / 10)
    p.push([raioMembro(CURVA_BRACO, len, y) + FORA, y])
  }
  return p
}

/**
 * Perfil da faixa do ANTEBRACO, no espaco do COTOVELO (armRLower): do pulso ate
 * a junta, e dali a CUPULA do proprio antebraco.
 *
 * A cupula tem que estar aqui. Ela e a peca que cobre a articulacao — o topo do
 * antebraco (3,85 cm) e mais gordo que a ponta do braco (3,5 cm), e e por isso
 * que character.js nao precisa mais de bola de cotovelo. A versao anterior
 * terminava esta faixa num ARO de 4,65 cm de raio no y = +0.030: um disco
 * pendurado no cotovelo, 2 cm mais largo que a pele, que abria conforme o braco
 * dobrava.
 */
function perfilAntebraco(c) {
  const len = c.medida.FORE_ARM - 0.018
  // Para 1,8 cm antes do fim do loft: dali pra baixo comeca a cupula do pulso,
  // que ja e a mao. Sai do comprimento do membro, nao de um numero fixo.
  const baixo = -(len - 0.018)
  const p = []
  for (let i = 0; i <= 12; i++) {
    const y = baixo * (1 - i / 12)
    p.push([raioMembro(CURVA_ANTE, len, y) + FORA, y])
  }
  const rT = CURVA_ANTE[0][1] + FORA
  for (let i = 1; i <= 4; i++) {
    const phi = (i / 4) * (Math.PI / 2)
    p.push([rT * Math.cos(phi), rT * 0.72 * Math.sin(phi)])
  }
  return p
}

// ===========================================================================
// B. CHAPA FIGURATIVA — silhueta, e nao padrao
// ===========================================================================
// Aqui o desenho NAO precisa fechar, entao pode ter figura. Duas decisoes que
// vem disso:
//  - a arte e desenhada quase quadrada no canvas mesmo sabendo que a chapa e
//    larga (19 cm) e baixa (10 cm): o esticamento e o que abre as asas. Desenho
//    ja largo no canvas sairia um borrao horizontal no peito;
//  - as penas sao CORTADAS com destination-out, nao pintadas. O vao entre elas
//    passa a ser pele de verdade, com o tom do jogador. Pintar o vao de "cor de
//    pele" so acerta num tom de pele e erra nos outros doze.

function desenhoFalcao(g, s) {
  g.clearRect(0, 0, s, s)
  const cx = s / 2
  g.lineJoin = 'round'
  g.lineCap = 'round'

  // Arco de sol por tras do bicho. Ele existe pela silhueta: onde a asa afina,
  // o falcao sozinho perde contorno e vira mancha; o arco devolve uma borda
  // externa que se le de longe. Raio 50 e nao 44: com 44 o arco passava RENTE a
  // cabeca e os dois viravam um capacete.
  g.strokeStyle = TINTA_FUNDA
  g.lineWidth = 2.2 * N.GROSSO
  g.beginPath()
  g.arc(cx, 70, 50, Math.PI * 1.15, Math.PI * 1.85)
  g.stroke()

  g.fillStyle = TINTA_BASE

  // Corpo: gota que afina do peito pro rabo. O tronco e ESTREITO (12 px de
  // pescoco) de proposito — a chapa estica 1,8x em x, entao o que e largo no
  // canvas chega gordo no peito, e com 18 px o corpo e a cabeca fundiam num
  // pinguim.
  g.beginPath()
  g.moveTo(cx - 6, 36)
  g.quadraticCurveTo(cx - 12, 68, cx - 7, 94)
  g.lineTo(cx + 7, 94)
  g.quadraticCurveTo(cx + 12, 68, cx + 6, 36)
  g.closePath()
  g.fill()

  // cabeca (o bicho olha pro observador)
  g.beginPath(); g.arc(cx, 29, 9, 0, 7); g.fill()

  // Leque do rabo, com o bico do meio recortado no proprio contorno. A versao
  // anterior era um leque liso cortado por dois riscos compridos, e o rabo saia
  // parecendo DUAS PERNAS finas penduradas no bicho.
  g.beginPath()
  g.moveTo(cx - 7, 90)
  g.lineTo(cx + 7, 90)
  g.lineTo(cx + 13, 119)
  g.lineTo(cx + 4, 112)
  g.lineTo(cx, 121)
  g.lineTo(cx - 4, 112)
  g.lineTo(cx - 13, 119)
  g.closePath()
  g.fill()

  // A asa e desenhada uma vez e espelhada pelo canvas inteiro (x -> s - x).
  // Com cx = s/2 isso e o espelho exato em torno do corpo — desenhar a segunda
  // asa a mao dava um bicho torto de dois pixels que so aparecia no jogo.
  const asa = () => {
    g.beginPath()
    g.moveTo(cx + 6, 44)
    g.quadraticCurveTo(cx + 34, 22, cx + 60, 20)
    g.quadraticCurveTo(cx + 56, 34, cx + 48, 44)
    g.quadraticCurveTo(cx + 30, 60, cx + 8, 74)
    g.closePath()
    g.fill()
  }
  const espelhado = (fn) => { g.save(); g.translate(s, 0); g.scale(-1, 1); fn(); g.restore() }
  asa()
  espelhado(asa)

  // Cortes das penas: cada risco atravessa a asa de ponta a ponta, do bordo de
  // ataque ao de fuga. Risco que morre no meio do pano nao separa pena nenhuma,
  // so afina a asa.
  //
  // O primeiro corte comeca em t = 0.42 e nao em 0.30: mais pra dentro que isso
  // ele cai na RAIZ da asa e decepa a asa inteira do corpo — o falcao saia com
  // dois blocos soltos boiando ao lado do tronco.
  g.globalCompositeOperation = 'destination-out'
  g.strokeStyle = 'rgba(0,0,0,1)'
  g.lineWidth = 2.8
  const penas = () => {
    for (let i = 0; i < 4; i++) {
      const t = 0.42 + i * 0.17
      const px = cx + 6 + t * 50, py = 44 - t * 18
      g.beginPath()
      g.moveTo(px - 3.4, py - 9.4)
      g.lineTo(px + 8.8, py + 24.4)
      g.stroke()
    }
  }
  penas()
  espelhado(penas)
  // duas ranhuras CURTAS no leque, so o bastante pra sugerir as penas do rabo
  g.lineWidth = 2.0
  for (const sgn of [1, -1]) {
    g.beginPath()
    g.moveTo(cx + sgn * 4, 102)
    g.lineTo(cx + sgn * 7, 112)
    g.stroke()
  }
  g.globalCompositeOperation = 'source-over'
}

// ===========================================================================
// C. TINTA POR GEOMETRIA — sem textura nenhuma
// ===========================================================================

/**
 * Traco de tinta: tubo ao longo da curva que AFINA da raiz pra ponta e e
 * ACHATADO contra o membro.
 *
 * As duas correcoes existem pela mesma razao: um tubo de raio constante colado
 * no braco nao le como tinta, le como ARAME. Tinta de agulha comeca cheia e
 * termina em fio, e tem secao de fita — nao de cano.
 *
 * O achatamento e feito contra o EIXO DO MEMBRO (o Y local da junta): a normal
 * da pele naquele ponto e a direcao radial (x, 0, z), entao basta encolher a
 * componente radial de cada vertice. Achatar em Z fixo entortava a fita conforme
 * o traco dava a volta no braco.
 */
function tracoTinta(curva, rRaiz, rPonta, achata, segT = 32, segR = 5) {
  const g = new THREE.TubeGeometry(curva, segT, rRaiz, segR, false)
  const pos = g.attributes.position
  const nR = segR + 1
  const cen = new THREE.Vector3()
  const d = new THREE.Vector3()
  for (let i = 0; i <= segT; i++) {
    const t = i / segT
    // t^0.7 e nao t: afinamento linear da um cone de brinquedo, com a metade
    // grossa ocupando metade do traco. Tinta perde grossura devagar e some no
    // ultimo quarto.
    const k = 1 - (1 - rPonta / rRaiz) * Math.pow(t, 0.7)
    curva.getPointAt(t, cen)
    const m = Math.hypot(cen.x, cen.z) || 1
    const nx = cen.x / m, nz = cen.z / m
    for (let j = 0; j < nR; j++) {
      const id = i * nR + j
      d.set(pos.getX(id) - cen.x, pos.getY(id) - cen.y, pos.getZ(id) - cen.z).multiplyScalar(k)
      const dr = d.x * nx + d.z * nz
      const corte = dr * (1 - achata)
      pos.setXYZ(id, cen.x + d.x - nx * corte, cen.y + d.y, cen.z + d.z - nz * corte)
    }
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  // O tubo fecha a volta duplicando a coluna j = segR, igualzinho a lathe: sem
  // soldar, a emenda acende uma listra clara ao longo do traco inteiro.
  soldarNormais(g)
  return g
}

/**
 * Ponto de tinta: esfera achatada contra o membro, deitada no plano da pele.
 *
 * A ordem YXZ nao e capricho. O eixo achatado da esfera e o Y dela, e ele tem
 * que acabar apontando pra FORA do braco (a direcao radial daquele angulo). Com
 * a ordem padrao (XYZ) o giro em Y entra antes do X de 90 graus e se perde: o
 * eixo achatado para sempre em +Z, e o ponto que nao estivesse exatamente na
 * frente do braco nascia de perfil — um risco fino em vez de um ponto.
 */
function pontoTinta(mat, ang, y, rTinta, raio, achata = 0.4) {
  const rEixo = rTinta - raio * achata
  const m = N.malha(new THREE.SphereGeometry(raio, 8, 5), mat,
    Math.sin(ang) * rEixo, y, Math.cos(ang) * rEixo)
  m.scale.set(1, achata, 1)
  m.rotation.order = 'YXZ'
  m.rotation.set(Math.PI / 2, ang, 0)
  return m
}

export const TATUAGENS = [
  { id: 'nenhuma', nome: 'Nenhuma', metodo: 'sem peca', build() { return null } },

  {
    id: 'manga-tribal',
    nome: 'Manga tribal',
    metodo: 'faixa envolvente: casca de revolucao do biceps ao pulso, com o raio saindo da curva de pele do proprio membro e padrao periodico que fecha na emenda',
    build(c) {
      // faixaMembro() do nucleo e um CILINDRO reto, e o braco nao e reto: ele
      // engorda no ventre do deltoide e afina do cotovelo pro pulso. A faixa
      // aqui sai do mesmo lugar (uma superficie de revolucao dando a volta
      // inteira), so que com o raio da PELE em CADA altura — e por isso a manga
      // acompanha o membro do biceps ao pulso em vez de afundar em cima e boiar
      // embaixo.
      const mat = tinta('tribal-manga', desenhoTribal)

      // Braco: um so mesh, do biceps ate dentro da cupula do cotovelo. O topo
      // para abaixo do deltoide — ver BRACO_TOPO.
      c.montar(cascaMembro(perfilBraco(c), mat), 'armRUpper')

      // Cotovelo + antebraco: outro mesh, na OUTRA junta. Tem que ser separado
      // mesmo: os dois moram em juntas diferentes e a tinta precisa dobrar com
      // o cotovelo. Uma casca so, montada numa junta, arrancaria do braco na
      // primeira flexao. A cupula desta casca sobe ate +0.0288 no espaco do
      // cotovelo e engole a borda da de cima (-0.272 no espaco do ombro, que e
      // -0.008 aqui): a manga fecha, dobrada ou esticada.
      c.montar(cascaMembro(perfilAntebraco(c), mat), 'armRLower')
      return null
    },
  },

  {
    id: 'falcao',
    nome: 'Falcao no peito',
    metodo: 'chapa: setor de casca no torax com figura recortada por alpha e penas cortadas em destination-out',
    build(c) {
      // ALTO do peito, de proposito: e a unica faixa do torax que a regata e o
      // peito nu deixam a mostra. Mais pra baixo qualquer blusa do catalogo
      // tapa a tinta e o jogador acha que a tatuagem sumiu.
      //
      // Vai montado no 'chest' em vez de voltar pelo slot porque animation.js
      // so faz RESPIRAR os meshes que sao filhos DIRETOS do peito: dentro do
      // grupo do slot a tinta ficaria parada enquanto o peitoral por baixo dela
      // abre 1,4% a cada inspiracao.
      c.montar(N.chapaPeito(c, tinta('falcao', desenhoFalcao), 0.082, 0.186, 1.50, 14), 'chest')
      return null
    },
  },

  {
    id: 'linha-viva',
    nome: 'Linha viva',
    metodo: 'geometria: traco extrudado com afinamento e secao de fita, aro e pontos — nenhuma textura',
    build(c) {
      // Tinta FRESCA: rugosidade baixa pra pegar um brilho especular do sol que
      // a pele em volta (0.68) nao pega. E o unico item do catalogo que
      // consegue isso — textura com alphaTest divide o material com a casca
      // inteira e brilharia tambem no vao entre os tracos.
      const mat = solid(COR_GEO, 0.34, 0.05)

      // 9 mm de fita na raiz. A primeira versao tinha 4,4 mm e o resultado
      // fotografado a 60 cm do braco ja era um FIO — um risco de cabelo escuro,
      // nao uma tatuagem; a 4 m sumia. Vale a mesma conta da textura: a volta do
      // antebraco tem 26 cm e a camera ve um terco dela, entao tudo que se
      // desenha aqui chega na tela com um terco do tamanho que parece ter.
      const rRaiz = 0.0045
      // Achatamento MENOR que a fita e larga: 0.30 de 9 mm ainda da 2,7 mm de
      // relevo, o suficiente pro sol pegar a lombada da tinta fresca sem virar
      // cano de novo.
      const achata = 0.30
      // O eixo do tubo desce o quanto o achatamento levanta: assim a CRISTA da
      // fita fica nos 1,5 mm de sempre e a barriga dela morre dentro da pele.
      // Fita apoiada exatamente na pele mostrava uma fresta de luz por baixo em
      // qualquer angulo rasante. A conta e por TRACO e nao uma so: a passada
      // fina e mais rasa, e usando o eixo da passada grossa ela nascia com 0,8
      // mm de crista — meio milimetro de tinta em cima de um braco a 4 m.
      //
      // E e por ALTURA, nao um raio so. O antebraco vai de 0.0396 em y = -0.055
      // a 0.0243 em y = -0.200: com um raio unico o comeco do traco encostava na
      // pele e a ponta dele terminava 1,7 cm no ar, junto com os tres pontos.
      const LEN_A = c.medida.FORE_ARM - 0.018
      const yDe = (t) => -0.055 - t * 0.145
      const eixoDe = (y, rr) => raioMembro(CURVA_ANTE, LEN_A, y) + FORA - rr * achata

      // A LINHA MESTRA, em funcao de um t de 0 a 1. Tudo do item sai dela: as
      // duas passadas e os tres pontos. Desenhar cada pedaco com angulo proprio
      // dava um ajuntamento de riscos que nao pertenciam uns aos outros.
      //   - 145 graus de volta e nao 360: o traco entra pela frente do antebraco
      //     e sai pela lateral de fora. Volta inteira e desperdicio, a camera ve
      //     um terco do braco;
      //   - a ondulacao (o seno) e o que separa tinta de cabo de aco enrolado.
      const ang = (t, off) => -0.30 + t * 2.55 + off + Math.sin(t * Math.PI * 2) * 0.20
      const espiral = (t0, t1, off, rr) => {
        const ctrl = []
        for (let i = 0; i < 9; i++) {
          const t = t0 + (i / 8) * (t1 - t0)
          const a = ang(t, off)
          const y = yDe(t)
          const r = eixoDe(y, rr)
          ctrl.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r))
        }
        // tensao 0.4 (o padrao e 0.5): com a curva mais frouxa os pontos de
        // controle ficam sobre o cilindro do antebraco mas a curva ENTRE eles
        // afunda, e o traco desaparecia na pele nos trechos do meio.
        return new THREE.CatmullRomCurve3(ctrl, false, 'catmullrom', 0.4)
      }

      // DUAS passadas, e nao uma. Fotografado no braco, um traco solitario
      // dando a volta le como CORREIA — uma tira escura amarrada no antebraco.
      // A segunda passada, com a MESMA inclinacao e metade do comprimento,
      // muda a leitura: duas linhas paralelas so acontecem de proposito.
      c.montar(N.sh(new THREE.Mesh(
        tracoTinta(espiral(0, 1, 0, rRaiz), rRaiz, 0.0013, achata), mat,
      )), 'armRLower')
      const rFino = rRaiz * 0.58
      c.montar(N.sh(new THREE.Mesh(
        tracoTinta(espiral(0.14, 0.64, 0.52, rFino), rFino, 0.0010, achata, 20), mat,
      )), 'armRLower')

      // Aro fechado logo abaixo do cotovelo: e a ancora do desenho. As duas
      // passadas sozinhas ainda sao diagonais soltas; com uma linha reta
      // fechando em cima delas o conjunto ganha comeco. O raio do toro ja
      // desconta a espessura pra crista ficar nos mesmos 1,5 mm da fita.
      const t = 0.0022
      const aro = N.anel(raioMembro(CURVA_ANTE, LEN_A, -0.042) + FORA - t, t, mat, 5, 22)
      aro.rotation.x = Math.PI / 2
      aro.position.y = -0.042
      c.montar(aro, 'armRLower')

      // Tres pontos CONTINUANDO a passada curta, do maior pro menor: e o mesmo
      // gesto perdendo forca, nao uma fileira de bolinhas ao lado do traco.
      for (let i = 0; i < 3; i++) {
        const tp = 0.72 + i * 0.085
        const y = yDe(tp)
        c.montar(pontoTinta(mat, ang(tp, 0.52), y,
          raioMembro(CURVA_ANTE, LEN_A, y) + FORA,
          0.0038 - i * 0.0008, achata), 'armRLower')
      }
      return null
    },
  },
]

export default TATUAGENS
