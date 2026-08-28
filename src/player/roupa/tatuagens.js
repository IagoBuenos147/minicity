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
//      neste metodo sai cortada ao meio na lateral do braco.
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
// Orcamento do CONTRATO: 1500 triangulos. A custa 468 e B custa 140; C custa
// 932, que e o preco de nao ter textura.
// ---------------------------------------------------------------------------

// Quanto a tinta sobe acima da pele. Ver o cabecalho.
const FORA = 0.0015

// Raio das capsulas de pele do braco, de character.js (limbGeo(0.045, 0.225) no
// braco e limbGeo(0.041, ...) no antebraco). Aqui NAO da pra ler do perfil como
// a camisa faz: ctx.perfil so entrega PELVIS/PEITO/MANGA, o membro e capsula e
// nao lathe. Se o braco engordar em character.js, estes dois numeros vao junto.
const R_BRACO = 0.045
const R_ANTE = 0.041

// A capsula do braco (mesh em y = -0.1375, meio de 0.225) tem cilindro reto de
// y = -0.025 a -0.250 e o domo do ombro subindo dali ate +0.020.
const BRACO_CIL_Y0 = -0.250
const BRACO_DOMO_Y = -0.025

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
 * Perfil da faixa do BRACO: cilindro reto ate o ombro e, no ombro, a MESMA
 * esfera da ponta da capsula so que 1,5 mm maior. Fazer o domo a mao (dois
 * pontos e uma reta entre eles) afundava a tinta na pele no meio do deltoide,
 * que e onde a esfera e mais gorda.
 */
function perfilBraco() {
  const R = R_BRACO + FORA
  const p = [[R, BRACO_CIL_Y0 - 0.002], [R, BRACO_DOMO_Y]]
  for (let i = 1; i <= 4; i++) {
    const dy = (i / 4) * (R - 0.0009)   // 0.9 mm de sobra pro domo nao virar bico
    p.push([Math.sqrt(Math.max(1e-6, R * R - dy * dy)), BRACO_DOMO_Y + dy])
  }
  return p
}

// Perfil da faixa do ANTEBRACO, no espaco do cotovelo (armRLower). Os raios sao
// o ENVELOPE da pele naquela altura + 1,5 mm, e o envelope ali e a uniao de
// tres coisas: a ponta da capsula do braco (esfera r 0.045 centrada em +0.030),
// a bola do cotovelo (r 0.042 na origem) e a capsula do antebraco (r 0.041 a
// partir de -0.041). O afinamento em -0.024 nao e enfeite: e o vinco do
// cotovelo, e um tubo de raio unico passando reto por ali boiava 1 cm.
const PERFIL_ANTEBRACO = [
  [R_ANTE + FORA, -0.215],
  [R_ANTE + FORA, -0.045],
  [0.0425, -0.036],
  [0.0400, -0.024],
  [0.0420, -0.012],
  [0.0435, 0.000],
  [0.0442, 0.010],
  [0.0460, 0.020],
  [R_BRACO + FORA, 0.030],
]

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
function pontoTinta(mat, ang, y, raio, achata = 0.4) {
  const rEixo = R_ANTE + FORA - raio * achata
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
    metodo: 'faixa envolvente: casca de revolucao no braco inteiro com padrao periodico que fecha na emenda',
    build(c) {
      // faixaMembro() do nucleo e um CILINDRO reto, e o braco nao e reto: tem o
      // domo do ombro em cima e o vinco do cotovelo no meio. A faixa aqui sai
      // do mesmo lugar (uma superficie de revolucao dando a volta inteira), so
      // que com o raio certo em CADA altura — e por isso a manga cobre do
      // deltoide ao pulso sem nenhum pedaco de pele solto entre as pecas.
      const mat = tinta('tribal-manga', desenhoTribal)

      // Braco: um so mesh do cotovelo ao deltoide. O topo morre dentro do torso,
      // que e onde a manga da camisa tambem morre.
      c.montar(cascaMembro(perfilBraco(), mat), 'armRUpper')

      // Cotovelo + antebraco: outro mesh, na OUTRA junta. Tem que ser separado
      // mesmo: os dois moram em juntas diferentes e a tinta precisa dobrar com
      // o cotovelo. Uma casca so, montada numa junta, arrancaria do braco na
      // primeira flexao. O topo desta casca (0.030 no espaco do cotovelo)
      // encosta na base da de cima (-0.250 no espaco do ombro): a manga fecha.
      c.montar(cascaMembro(PERFIL_ANTEBRACO, mat), 'armRLower')
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
      const eixoDe = (rr) => R_ANTE + FORA - rr * achata

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
        const r = eixoDe(rr)
        for (let i = 0; i < 9; i++) {
          const t = t0 + (i / 8) * (t1 - t0)
          const a = ang(t, off)
          ctrl.push(new THREE.Vector3(
            Math.sin(a) * r, -0.055 - t * 0.145, Math.cos(a) * r,
          ))
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
      const aro = N.anel(R_ANTE + FORA - t, t, mat, 5, 22)
      aro.rotation.x = Math.PI / 2
      aro.position.y = -0.042
      c.montar(aro, 'armRLower')

      // Tres pontos CONTINUANDO a passada curta, do maior pro menor: e o mesmo
      // gesto perdendo forca, nao uma fileira de bolinhas ao lado do traco.
      for (let i = 0; i < 3; i++) {
        const tp = 0.72 + i * 0.085
        c.montar(pontoTinta(mat, ang(tp, 0.52), -0.055 - tp * 0.145,
          0.0038 - i * 0.0008, achata), 'armRLower')
      }
      return null
    },
  },
]

export default TATUAGENS
