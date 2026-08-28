import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  sh, esc, tecido, couro, couro2, metal, malha, tubo, bloco, anel, par,
} from './nucleo.js'
import { soldarNormais, tecelagem } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/calcados.js — o catalogo de CALCADO.
// Ancora: footR. O par sai por par(c, fab), que refaz a peca e pendura a
// segunda copia em footL (o pe e simetrico em X, nao precisa espelhar — e por
// isso que nada aqui pode ter detalhe assimetrico, como o dedao num lado so).
//
// POR QUE O CALCADO ANTIGO LIA COMO BLOCO
// Ele era literalmente um bloco: sapatoBase() empilhava dois roundedBox (corpo
// + sola) e mudava a cor. Falta nesse desenho tudo o que o olho usa pra dizer
// "isto e um sapato":
//   1. SOLA com perfil proprio — entressola clara em cima, solado escuro
//      embaixo, e o REBORDO da entressola passando alem do cabedal. E a borda
//      que sobra que separa o pe do chao.
//   2. BIQUEIRA redonda de verdade. Um bloco chanfrado tem a ponta quadrada em
//      planta: visto de cima o "sapato" era um retangulo.
//   3. A CINTURA. A planta do pe afunda em ~45% do comprimento e so entao
//      engorda na cabeca dos metatarsos (~72%). Sem essa cintura, qualquer
//      calcado vira um tijolo, por mais arredondado que sejam as quinas.
//   4. COLARINHO em volta do tornozelo e a COSTURA entre cabedal e sola.
//
// AS QUATRO MEDIDAS QUE MANDAM (nao sao chute — sairam do bounding box das
// malhas do boneco de hoje, no espaco do pe, com a origem no TORNOZELO):
//   pe descalco   x +-0.050   z -0.065..0.138   topo em y -0.0085
//   canela        desce ate y -0.0184 e AFINA ATE UMA PONTA la embaixo
//   raio da perna 0.0255 em y=0 | 0.0262 em y=0.03 | 0.0329 em y=0.11
//   chao          c.medida.SOLA_Y = -0.0875
// A ponta da canela e o numero que manda no resto: 'esconde: pe' apaga o pe
// INTEIRO, e o que sobra ali e uma agulha de 2,6 cm de raio. Todo calcado deste
// arquivo sobe ate pelo menos y = -0.012 em volta do tornozelo, senao a canela
// fica boiando acima do sapato com o cone da ponta a mostra. O tornozelo
// continua sendo PELE (esconde nao lista 'canela'), so fica dentro do cano.
//
// UM METODO DE CONSTRUCAO POR ITEM — foi pedido com todas as letras, pra dar
// pra comparar qual combina com o jogo:
//
//   Bota      LOFT DE SECOES. O cabedal e uma pilha de secoes transversais
//             costuradas a mao (tecelagem): cada secao e uma superelipse cujo
//             EXPOENTE muda ao longo do pe — quase retangular no tornozelo,
//             cupula no bico. O cano e um tubo de secao ELIPTICA (rx e rz
//             independentes) que sai de dentro do cabedal.
//   Chinelo   CONTORNO EM BEZIER EXTRUDADO. A sola e um THREE.Shape de sete
//             beziers passado por ExtrudeGeometry com bisel — o bisel E o
//             rebordo redondo da borracha. A tira em Y e um TubeGeometry sobre
//             uma CatmullRomCurve3, e a marca do pe e um ShapeGeometry chapado.
//   Coturno   REVOLUCAO NO EIXO Z. Uma LatheGeometry deitada (o eixo vira o
//             comprimento do pe), achatada, modulada em altura por uma curva de
//             z e GRAMPEADA no plano da sola. Biqueira e calcanhar saem
//             redondos de graca, porque sao a propria revolucao.
//   Mocassim  ESFERA ESCULPIDA. Uma SphereGeometry inteira remapeada pela
//             funcao de forma: o polo vira o bico, o azimute vira a secao. O
//             apron (a costura em U do dorso) e um SEGUNDO pedaco da mesma
//             esfera, deslocado 2 mm pra fora — e por isso encaixa exato.
//
// CUSTO: o teto do contrato e 4 000 triangulos para O PAR. Por isso todo
// detalhe repetido (ilhos, pontos de costura, cadarco, travas do solado) entra
// num acumulador tecelagem() e vira UMA geometria: como mesh separado seriam 40
// draw calls por pe e 1 600 na tela com 20 bonecos.
// ---------------------------------------------------------------------------

// Comprimento do calcado no espaco do pe. O pe descalco vai de -0.065 a 0.138;
// o sapato sobra ~1,3 cm atras e ~1,4 cm na frente, que e a folga real de uma
// forma sobre o pe que ela calca.
const Z_TRAS = -0.078
const Z_BICO = 0.152

/** Interpolador suave de tabela [[t, valor], ...] (mesmo smoothstep do corpo). */
function curva(tab, t) {
  if (t <= tab[0][0]) return tab[0][1]
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const a = tab[i - 1], b = tab[i]
      const k = (t - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k)
    }
  }
  return tab[tab.length - 1][1]
}

/**
 * A FORMA (o "last"): meia largura da planta, NORMALIZADA em 1 no ponto mais
 * largo, ao longo do comprimento (0 = calcanhar, 1 = bico).
 *
 * E a tabela mais importante do arquivo. O pe nao e uma elipse: ele afunda na
 * CINTURA em ~45% e so entao engorda na cabeca dos metatarsos, em ~72%. Essa
 * barriga deslocada pra frente e o que da silhueta de sapato visto de cima e de
 * perfil; com uma elipse no lugar dela, todo calcado do catalogo voltava a ler
 * como tijolo arredondado por mais fillet que levasse nas quinas.
 */
const PLANTA = [
  [0.00, 0.30], [0.05, 0.60], [0.14, 0.76], [0.28, 0.78],
  [0.45, 0.73], [0.60, 0.89], [0.72, 1.00], [0.83, 0.96],
  [0.92, 0.78], [0.97, 0.54], [1.00, 0.20],
]

/** Malha de um acumulador de tecelagem, com as normais ja soldadas. */
function malhaDe(ma, mat) {
  return sh(new THREE.Mesh(soldarNormais(ma.geo()), mat))
}

/**
 * Costura os aneis de um loft (todos com o MESMO numero de pontos) e fecha as
 * duas pontas num leque.
 *
 * Serve pros dois sentidos de empilhamento — secoes avancando em +Z (o cabedal
 * e as solas) e aneis subindo em +Y (o cano da bota). A regra de enrolamento e
 * a mesma nos dois casos: com o parametro do anel andando no sentido
 * anti-horario visto DE FORA, quad(i_j, i_j+1, i+1_j+1, i+1_j) ja sai com a
 * face pra fora. Quem gera o anel e que tem que respeitar o sentido:
 *   avanco em +Z  ->  (x, y) = (cos, sin)
 *   avanco em +Y  ->  (x, z) = (sin, cos)   (a mesma convencao da LatheGeometry)
 */
function lofte(ma, aneis, tampaIni = true, tampaFim = true) {
  const n = aneis[0].length
  const ids = aneis.map((r) => r.map((p) => ma.v(p[0], p[1], p[2])))
  for (let i = 0; i + 1 < ids.length; i++) {
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      ma.quad(ids[i][j], ids[i][k], ids[i + 1][k], ids[i + 1][j])
    }
  }
  const leque = (pts, id, fim) => {
    let x = 0, y = 0, z = 0
    for (const p of pts) { x += p[0]; y += p[1]; z += p[2] }
    const c = ma.v(x / n, y / n, z / n)
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n
      if (fim) ma.tri(c, id[j], id[k])
      else ma.tri(c, id[k], id[j])
    }
  }
  if (tampaIni) leque(aneis[0], ids[0], false)
  if (tampaFim) leque(aneis[aneis.length - 1], ids[ids.length - 1], true)
}

/**
 * Caixinha somada a UMA malha compartilhada. Ilho, ponto de costura, trava de
 * solado e cadarco sao 20 a 40 volumes por sapato: como mesh separado dariam 40
 * draw calls por pe. Aqui tudo vira uma geometria indexada e um draw call.
 * Os 8 vertices sao compartilhados pelas 6 faces de proposito: o
 * computeVertexNormals do tecelagem() entao MEDIA as normais e o cubinho sai
 * arredondado — que e o que se quer num ponto de linha de 2 mm, e nunca uma
 * quina viva a mais no boneco.
 */
const CANTOS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
]
const _v = new THREE.Vector3()
function cubo(ma, m4, w, h, d) {
  const id = []
  for (const p of CANTOS) {
    _v.set(p[0] * w / 2, p[1] * h / 2, p[2] * d / 2).applyMatrix4(m4)
    id.push(ma.v(_v.x, _v.y, _v.z))
  }
  const q = (a, b, c, e) => ma.quad(id[a], id[b], id[c], id[e])
  q(4, 5, 6, 7); q(1, 0, 3, 2); q(5, 1, 2, 6)
  q(0, 4, 7, 3); q(3, 7, 6, 2); q(0, 1, 5, 4)
}

/**
 * Secao TRANSVERSAL do cabedal: fundo apoiado na sola, laterais quase verticais
 * e topo abaulado.
 *
 * `quina` e o expoente da superelipse e MUDA ao longo do pe. Com o mesmo
 * expoente do bico ao calcanhar a secao fecha em ponta em cima do tornozelo, e
 * ai qualquer cano colado por fora aparece boiando do lado do sapato — foi
 * exatamente assim que a bota antiga virou um balde com um pe dentro. Perto do
 * tornozelo a secao e quase um retangulo de canto redondo (o peito do pe sobe
 * reto) e no bico ela vira cupula.
 *
 * A borda de baixo mergulha 4 mm PRA DENTRO da sola em vez de morrer no mesmo
 * plano dela: duas superficies coplanares brigam no depth buffer e a emenda
 * pisca conforme a camera anda.
 */
function secaoCabedal(n, w, h, base, z, quina) {
  const pts = []
  const px = 2 / quina
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    const ca = Math.cos(a), sa = Math.sin(a)
    let x = w * Math.sign(ca) * Math.pow(Math.abs(ca), px)
    let y
    if (sa >= 0) {
      y = h * Math.pow(sa, px)
      x *= 1 - 0.16 * Math.pow(sa, 1.4)   // o cabedal se recolhe pra dentro em cima
    } else {
      y = -0.004 * (-sa)
    }
    pts.push([x, base + y, z])
  }
  return pts
}

/**
 * Secao de uma camada de SOLA: laje de canto redondo. `estreita` recolhe so a
 * metade de baixo — e o chanfro da borracha indo pro chao, sem o qual a sola le
 * como um tijolo com o sapato equilibrado em cima.
 */
function secaoSola(n, w, h, y0, z, quina, estreita) {
  const pts = []
  const px = 2 / quina
  const yc = y0 + h / 2
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    const ca = Math.cos(a), sa = Math.sin(a)
    let x = w * Math.sign(ca) * Math.pow(Math.abs(ca), px)
    if (sa < 0) x *= 1 - estreita * Math.pow(-sa, 1.6)
    pts.push([x, yc + (h / 2) * Math.sign(sa) * Math.pow(Math.abs(sa), px), z])
  }
  return pts
}

/** Anel de cano: secao ELIPTICA (rx e rz independentes) centrada em zc. */
function secaoCano(n, rx, rz, zc, y) {
  const pts = []
  for (let j = 0; j < n; j++) {
    const a = (j / n) * Math.PI * 2
    pts.push([Math.sin(a) * rx, y, zc + Math.cos(a) * rz])
  }
  return pts
}

/** Z da FRENTE do cano na altura x (pra ilho e cadarco nascerem NA superficie). */
function frenteCano(rx, rz, zc, x) {
  const k = Math.min(0.96, Math.abs(x) / rx)
  return zc + rz * Math.sqrt(1 - k * k)
}

/**
 * Lingueta: placa INCLINADA colada na frente do cano.
 * O cano anda pra frente conforme sobe (o zc do perfil cresce), entao uma placa
 * vertical descola do couro la em cima e some por dentro dele embaixo. A
 * inclinacao sai dos dois pontos extremos do proprio perfil — nao e um numero
 * escolhido a olho.
 */
function lingueta(ma, perfil, i0, i1, larg, fora) {
  const a = perfil[i0], b = perfil[i1]
  const za = frenteCano(a[0], a[1], a[2], 0) + fora
  const zb = frenteCano(b[0], b[1], b[2], 0) + fora
  const dy = b[3] - a[3], dz = zb - za
  _m4.makeRotationX(Math.atan2(dz, dy))
  _m4.setPosition(0, (a[3] + b[3]) / 2, (za + zb) / 2)
  cubo(ma, _m4, larg, Math.hypot(dy, dz), 0.006)
}

/**
 * A COSTURA entre cabedal e sola: fileira de pontos deitados na tangente do
 * contorno. Nao e enfeite — e a linha que o olho usa pra separar duas pecas de
 * material diferente. Sem ela o cabedal parece ter brotado da sola.
 */
const _m4 = new THREE.Matrix4()
function costura(ma, o) {
  for (let i = 0; i < o.n; i++) {
    const t = o.t0 + (o.t1 - o.t0) * (i / (o.n - 1))
    const t2 = Math.min(o.t1, t + 0.02)
    // `ponto(t)` devolve [meia largura, altura] da SUPERFICIE naquela fatia.
    // Ele existe porque a altura da linha muda de peca pra peca: numa laje de
    // altura constante (bota) o y e fixo, mas numa sola de revolucao ou de
    // esfera a linha mais grossa da sola sobe e desce ao longo do pe, e uma
    // costura de y fixo la ficava boiando 1,5 cm fora do sapato no calcanhar.
    const a = o.ponto(t), b = o.ponto(t2)
    const z = o.z0 + (o.z1 - o.z0) * t
    const z2 = o.z0 + (o.z1 - o.z0) * t2
    const ang = Math.atan2(b[0] - a[0], z2 - z)
    for (const s of [1, -1]) {
      _m4.makeRotationY(s * ang)
      _m4.setPosition(s * a[0], a[1], z)
      cubo(ma, _m4, 0.0028, 0.0022, o.comp || 0.0090)
    }
  }
}

// ===========================================================================
// 1. BOTA — loft de secoes
// ===========================================================================
// Altura do cabedal acima da sola, normalizada. O pico fica em 24% (o peito do
// pe), nao no meio: e de la que o cano sai.
const BOTA_ALTURA = [
  [0.00, 0.62], [0.10, 0.96], [0.24, 1.00], [0.38, 0.98],
  [0.52, 0.90], [0.66, 0.78], [0.80, 0.62], [0.90, 0.48], [1.00, 0.30],
]
// Expoente da superelipse: 5.0 no tornozelo (secao de cano), 2.2 no bico
// (cupula). Ver secaoCabedal.
const BOTA_QUINA = [[0.00, 4.4], [0.30, 5.0], [0.55, 3.6], [0.80, 2.6], [1.00, 2.2]]
// Cano: [rx, rz, zc, altura]. As oscilacoes de 1,5 mm em rx sao as DOBRAS do
// couro — sem elas o cano e um cano de PVC. O rz e maior que o rx porque o cano
// nasce em cima do calcanhar e do peito do pe, que sao mais longos que largos.
// As tres ultimas linhas ROLAM PRA DENTRO ate 0.0255: e o raio da canela em
// y = 0, entao o rebordo fecha DENTRO da perna e nao sobra fresta pra se ver o
// avesso do cano (a lathe so tem face pra fora — pela fresta se veria o mundo).
function canoBota(S) {
  return [
    [0.0370, 0.0500, -0.026, S + 0.020],
    [0.0384, 0.0508, -0.025, S + 0.040],
    [0.0372, 0.0494, -0.024, S + 0.056],
    [0.0398, 0.0514, -0.023, S + 0.074],
    [0.0386, 0.0500, -0.022, S + 0.090],
    [0.0412, 0.0522, -0.021, S + 0.108],
    [0.0402, 0.0508, -0.020, S + 0.118],
    [0.0432, 0.0534, -0.019, S + 0.132],
    [0.0448, 0.0548, -0.018, S + 0.140],  // rebordo acolchoado
    [0.0430, 0.0522, -0.018, S + 0.146],
    [0.0330, 0.0378, -0.018, S + 0.143],  // rola pra dentro
    [0.0250, 0.0268, -0.018, S + 0.135],  // fecha dentro da canela
  ]
}

function fazBota(c) {
  const S = c.medida.SOLA_Y
  const cor = c.cor.calcado
  const g = new THREE.Group()
  const mCouro = couro(cor)
  const mCano = couro(esc(cor, 0.90))
  // Entressola CLARA e solado ESCURO: e o contraste das duas faixas que faz a
  // sola ter espessura legivel a 20 m. Uma sola de uma cor so vira sombra.
  const mEntre = tecido(0xd7c39a, 0.86)
  const mSolado = tecido(0x2b2723, 0.96)
  const mLinha = tecido(0xe9d7ac, 0.75)
  const mMetal = metal(0xb9a06a)

  const N = 10                     // pontos por secao
  const W = 0.050                  // meia largura do cabedal no ponto mais largo
  const H = 0.058                  // altura do cabedal acima da sola, no peito do pe
  const TOPO_SOLA = S + 0.032

  // --- cabedal ---
  const maUp = tecelagem()
  const aneis = []
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    aneis.push(secaoCabedal(N, curva(PLANTA, t) * W, curva(BOTA_ALTURA, t) * H,
      TOPO_SOLA, Z_TRAS + (Z_BICO - Z_TRAS) * t, curva(BOTA_QUINA, t)))
  }
  lofte(maUp, aneis)
  g.add(malhaDe(maUp, mCouro))

  // --- sola: tres pecas escuras numa malha so + a entressola clara ---
  // O SALTO e a PLANTA da frente descem ate o chao e o solado passa por cima
  // das duas: entre 36% e 46% do comprimento nao ha nada, e esse vao de 1 cm na
  // cintura e o que faz a bota ter salto em vez de plataforma.
  const maSola = tecelagem()
  const laje = (ma, t0, t1, y0, y1, fora, quina, estreita, nSec) => {
    const rs = []
    for (let i = 0; i < nSec; i++) {
      const t = t0 + (t1 - t0) * (i / (nSec - 1))
      rs.push(secaoSola(8, curva(PLANTA, t) * W + fora, y1 - y0, y0,
        Z_TRAS + (Z_BICO - Z_TRAS) * t, quina, estreita))
    }
    lofte(ma, rs)
  }
  laje(maSola, 0.00, 0.36, S, S + 0.011, 0.0035, 5.0, 0.26, 4)          // salto
  laje(maSola, 0.46, 1.00, S, S + 0.011, 0.0030, 4.4, 0.26, 6)          // planta
  laje(maSola, 0.00, 1.00, S + 0.010, S + 0.021, 0.0050, 5.2, 0.10, 9)  // solado
  g.add(malhaDe(maSola, mSolado))

  const maEntre = tecelagem()
  laje(maEntre, 0.00, 1.00, S + 0.019, TOPO_SOLA, 0.0074, 5.6, 0.06, 9)
  g.add(malhaDe(maEntre, mEntre))

  // --- cano ---
  const perfilCano = canoBota(S)
  const maCano = tecelagem()
  lofte(maCano, perfilCano.map((p) => secaoCano(12, p[0], p[1], p[2], p[3])), false, true)
  g.add(malhaDe(maCano, mCano))

  // --- ilhos, cadarco e lingueta ---
  const maMetal = tecelagem()
  const maFio = tecelagem()
  lingueta(maFio, perfilCano, 2, 7, 0.036, 0.0015)
  // Os ilhos saem dos PROPRIOS aneis do perfil (o y vem de p[3]): escrever uma
  // progressao a parte foi como o quarto par acabou pousado em cima do rebordo
  // do cano, 6 cm acima de onde a amarracao termina.
  for (let i = 0; i < 4; i++) {
    const p = perfilCano[2 + i]
    const y = p[3]
    for (const s of [1, -1]) {
      const x = s * 0.023
      _m4.identity()
      _m4.setPosition(x, y, frenteCano(p[0], p[1], p[2], x) + 0.0030)
      cubo(maMetal, _m4, 0.0075, 0.0075, 0.0035)
    }
    if (i < 3) {
      // cadarco em X: cada tramo liga um ilho ao ilho de cima do outro lado
      const q = perfilCano[3 + i]
      for (const s of [1, -1]) {
        _m4.makeRotationZ(s * 0.72)
        _m4.setPosition(0, (y + q[3]) / 2, frenteCano(q[0], q[1], q[2], 0) + 0.0045)
        cubo(maFio, _m4, 0.052, 0.0042, 0.0042)
      }
    }
  }
  g.add(malhaDe(maMetal, mMetal))

  // --- costura da vira, no encontro do cabedal com a entressola ---
  costura(maFio, {
    n: 7, t0: 0.10, t1: 0.94, z0: Z_TRAS, z1: Z_BICO,
    ponto: (t) => [curva(PLANTA, t) * W + 0.0068, TOPO_SOLA - 0.004],
  })
  g.add(malhaDe(maFio, mLinha))
  return g
}

// ===========================================================================
// 2. CHINELO — contorno em bezier extrudado
// ===========================================================================
// Contorno da palmilha, em (x, z) do espaco do pe. Sete beziers: dois no
// calcanhar, dois nas laterais, tres no bico. Cada trecho vira curveSegments
// pontos no ExtrudeGeometry, e e o BISEL do extrude que faz o rebordo redondo
// da borracha — o mesmo lugar onde um roundedBox teria uma quina chanfrada.
const CHINELO_CURVA = [
  [0.030, -0.078, 0.040, -0.058, 0.040, -0.028],
  [0.040, 0.004, 0.048, 0.042, 0.054, 0.076],
  [0.058, 0.116, 0.044, 0.144, 0.022, 0.150],
  [0.006, 0.158, -0.006, 0.158, -0.022, 0.150],
  [-0.044, 0.144, -0.058, 0.116, -0.054, 0.076],
  [-0.048, 0.042, -0.040, 0.004, -0.040, -0.028],
  [-0.040, -0.058, -0.030, -0.078, 0.000, -0.078],
]

/** O contorno como THREE.Shape. `k` encolhe tudo em volta do centro da planta
 *  (a palmilha nasce ~3 mm pra dentro do solado). O eixo Y da shape e -Z do
 *  mundo, porque o extrude sai em +Z local e a peca e depois deitada. */
function shapeChinelo(k) {
  const zc = 0.036
  const P = (x, z) => [x * k, -(zc + (z - zc) * k)]
  const s = new THREE.Shape()
  const a = P(0, -0.078)
  s.moveTo(a[0], a[1])
  for (const q of CHINELO_CURVA) {
    const c1 = P(q[0], q[1]), c2 = P(q[2], q[3]), p = P(q[4], q[5])
    s.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], p[0], p[1])
  }
  return s
}

/** Extrude deitado: a espessura sai em +Y e a base fica exatamente em `y0`. */
function laminaChinelo(shape, y0, esp, bisel, seg, curvSeg) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: esp, bevelEnabled: true, bevelThickness: bisel, bevelSize: bisel,
    bevelSegments: seg, curveSegments: curvSeg,
  })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0 + bisel, 0)
  g.computeVertexNormals()
  return g
}

// Altura do pe nu acima da palmilha, normalizada; e a curva do peito do pe.
const PE_ALTURA = [
  [0.00, 0.78], [0.12, 1.00], [0.30, 0.98], [0.50, 0.84],
  [0.70, 0.66], [0.85, 0.50], [1.00, 0.34],
]
// Cinco dedos SIMETRICOS em X. Nao e anatomia: par() monta a MESMA malha nos
// dois pes sem espelhar, entao um dedao num lado so apareceria por fora no pe
// esquerdo. Simetrico com o do meio mais comprido le como fileira de dedos dos
// dois lados.
const DEDOS_PE = [
  [-0.028, 0.126, 0.0074], [-0.014, 0.131, 0.0086], [0.000, 0.132, 0.0092],
  [0.014, 0.131, 0.0086], [0.028, 0.126, 0.0074],
]

function fazChinelo(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  const mSolado = tecido(0x1e242c, 0.92)
  const mPalmilha = tecido(0x39434f, 0.88)
  const mMarca = solid(esc(0x39434f, 0.74), 0.9, 0.0, { side: THREE.DoubleSide })
  const mTira = couro(c.cor.calcado)
  const pele = solid(c.cor.pele, 0.68, 0.0)

  const BASE = S + 0.021               // topo da palmilha: e onde o pe pisa
  g.add(sh(new THREE.Mesh(laminaChinelo(shapeChinelo(1), S, 0.009, 0.0034, 2, 5), mSolado)))
  g.add(sh(new THREE.Mesh(laminaChinelo(shapeChinelo(0.93), S + 0.013, 0.004, 0.0020, 1, 4), mPalmilha)))

  // --- marca do pe: ShapeGeometry chapado 0,8 mm acima da palmilha ---
  // Chapa e nao relevo de proposito: sete elipses custam 50 triangulos, e um
  // relevo de verdade custaria 400 num detalhe que so aparece com o chinelo
  // no chao. DoubleSide porque o sentido do contorno de um ShapeGeometry
  // depende de como a elipse foi escrita, e uma marca invisivel de um lado
  // seria pior que o custo do DoubleSide.
  const marcas = []
  const oval = (x, z, rx, rz) => {
    const s = new THREE.Shape()
    s.absellipse(x, -z, rx, rz, 0, Math.PI * 2, false, 0)
    marcas.push(s)
  }
  oval(0, -0.046, 0.026, 0.030)
  oval(0, 0.062, 0.036, 0.044)
  for (const d of DEDOS_PE) oval(d[0], d[1] - 0.012, d[2] * 0.85, d[2] * 0.95)
  const gm = new THREE.ShapeGeometry(marcas, 8)
  gm.rotateX(-Math.PI / 2)
  gm.translate(0, BASE + 0.0008, 0)
  const mm = new THREE.Mesh(gm, mMarca)
  mm.receiveShadow = true
  g.add(mm)

  // --- o pe nu, redesenhado 2 cm mais alto ---
  // O chinelo APAGA o pe do corpo e desenha o seu porque a sola precisa entrar
  // POR BAIXO, e o pe do corpo ja nasce plantado no chao: sem isso a sola
  // afundaria no cenario.
  const maPe = tecelagem()
  const aneis = []
  for (let i = 0; i < 10; i++) {
    const t = i / 9
    aneis.push(secaoCabedal(8, curva(PLANTA, t) * 0.040, curva(PE_ALTURA, t) * 0.050,
      BASE, -0.062 + 0.182 * t, curva([[0, 3.0], [0.5, 2.8], [1, 2.2]], t)))
  }
  lofte(maPe, aneis)
  g.add(malhaDe(maPe, pele))
  for (const d of DEDOS_PE) {
    const t = malha(new THREE.SphereGeometry(1, 7, 4), pele)
    soldarNormais(t.geometry)
    t.scale.set(d[2], d[2] * 0.86, d[2] * 1.5)
    t.position.set(d[0], BASE + d[2] * 0.85, d[1])
    g.add(t)
  }
  // Coluna do tornozelo. O topo sobe ate y = +0.004 com raio 0.0262 porque a
  // canela tem 0.0256 ali: um centimetro mais baixo e a tampa do cilindro fica
  // exposta como uma arruela em volta da perna, e mais estreito que isso a
  // canela atravessa a coluna. O raio de baixo (0.0315) e o do proprio pe na
  // altura em que ela nasce — dai o encontro nao ter degrau.
  const tor = tubo(0.0262, 0.0315, 0.050, pele, 10)
  tor.position.set(0, -0.021, -0.010)
  g.add(tor)

  // --- tira em Y: TubeGeometry sobre uma CatmullRomCurve3 ---
  // Tira de caixa nao existe: ela tem que MERGULHAR na sola nas tres pontas e
  // acompanhar a curva do peito do pe. O tubo faz as duas coisas de graca.
  // A ancora fica em x = 0.034 e nao na borda: somado o raio de 7,2 mm do tubo
  // a tira ja encosta exatamente no contorno da sola em z = 0.008. Em 0.038 ela
  // passava 4 mm ALEM da borda e ficava pendurada no ar do lado do chinelo.
  const pts = [
    [-0.034, S + 0.012, 0.008], [-0.031, S + 0.038, 0.026], [-0.024, S + 0.050, 0.050],
    [-0.010, S + 0.052, 0.080], [0.000, S + 0.048, 0.100],
    [0.010, S + 0.052, 0.080], [0.024, S + 0.050, 0.050],
    [0.031, S + 0.038, 0.026], [0.034, S + 0.012, 0.008],
  ].map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  const tuboGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0072, 6, false)
  soldarNormais(tuboGeo)
  g.add(sh(new THREE.Mesh(tuboGeo, mTira)))
  // Poste do dedo: entra na palmilha e engorda pra cima, como o pino de borracha
  const poste = malha(new THREE.CylinderGeometry(0.0062, 0.0038, 0.030, 6), mTira)
  poste.position.set(0, S + 0.033, 0.104)
  poste.rotation.x = -0.18
  g.add(poste)
  return g
}

// ===========================================================================
// 3. COTURNO — revolucao no eixo Z
// ===========================================================================
/**
 * Torpedo: LatheGeometry DEITADA. O eixo da revolucao passa a ser o
 * comprimento do pe, entao a biqueira e o calcanhar saem redondos por
 * construcao — nao ha o que chanfrar. Depois a peca e achatada em Y, modulada
 * por uma curva de altura (a revolucao pura faria o ponto mais LARGO ser
 * tambem o mais ALTO, e a bota ficaria com uma corcova em cima dos
 * metatarsos) e GRAMPEADA no plano `chao`, que e o que da a base plana.
 *
 * O arco comeca em 1.30 rad e nao em pi/2 de proposito: assim a saia desce um
 * pouco ABAIXO do plano de corte e o grampo enterra a borda dentro da sola, em
 * vez de deixar as duas superficies coplanares brigando no depth buffer.
 */
function torpedo(perfil, o) {
  const pts = perfil.map((p) => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, o.seg, 1.30, Math.PI * 2 - 2.60)
  g.rotateX(Math.PI / 2)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const k = o.modY ? curva(o.modY, (pos.getZ(i) - Z_TRAS) / (Z_BICO - Z_TRAS)) : 1
    const y = pos.getY(i) * o.escala * k + o.base
    pos.setY(i, y < o.chao ? o.chao : y)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  // Volta parcial nao duplica coluna, mas o grampo junta dezenas de vertices no
  // mesmo plano: sem soldar, a borda da saia acende como um risco em volta da
  // sola inteira.
  soldarNormais(g)
  return g
}

/** Perfil [raio, z] tirado da planta. `ondula` serrilha o contorno — sao as
 *  travas do solado tratorado, de graca, sem uma peca a mais. */
function perfilPlanta(w, fora, n, ondula = 0) {
  const p = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    p.push([curva(PLANTA, t) * w + fora + (ondula ? Math.sin(t * 26) * ondula : 0),
      Z_TRAS + (Z_BICO - Z_TRAS) * t])
  }
  return p
}

// Modulacao de altura do coturno ao longo do pe: alto no peito do pe, baixo no
// bico. Sem ela o cabedal fica com a corcova na cabeca dos metatarsos.
const COTURNO_ALTURA = [
  [0.00, 0.84], [0.16, 1.08], [0.34, 1.06], [0.52, 0.94],
  [0.70, 0.80], [0.86, 0.66], [1.00, 0.52],
]
function canoCoturno(S) {
  return [
    [0.0392, 0.0500, -0.024, S + 0.022],
    [0.0404, 0.0512, -0.024, S + 0.042],
    [0.0390, 0.0496, -0.023, S + 0.062],
    [0.0416, 0.0516, -0.022, S + 0.084],
    [0.0402, 0.0500, -0.021, S + 0.106],
    [0.0428, 0.0524, -0.019, S + 0.130],
    [0.0416, 0.0510, -0.018, S + 0.154],
    [0.0448, 0.0538, -0.016, S + 0.180],
    [0.0436, 0.0524, -0.015, S + 0.204],
    [0.0472, 0.0558, -0.013, S + 0.226],  // rebordo acolchoado
    [0.0456, 0.0536, -0.012, S + 0.238],
    [0.0392, 0.0442, -0.012, S + 0.236],  // rola pra dentro
    [0.0330, 0.0352, -0.012, S + 0.228],  // fecha dentro da canela (raio ~0.035 la)
  ]
}

function fazCoturno(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // Preto puro some na sombra: 0x25242a ainda le como coturno preto e mantem a
  // forma visivel no fim da tarde. (Herdado do coturno antigo, so vale.)
  const mCouro = couro(0x25242a)
  const mBico = couro(0x3a3843)          // biqueira gasta, mais clara
  const mEntre = tecido(0x4c4a52, 0.9)
  const mSolado = tecido(0x141519, 0.98)
  const mSalto = tecido(0x24262b, 0.9)   // um tom acima do solado: e o degrau que aparece
  const mMetal = metal(0xa9b0b8)
  const mFio = tecido(0xc9b98e, 0.8)

  const TOPO_SOLA = S + 0.032
  const W = 0.050

  // --- solas: dois domes achatados, o de cima mais LARGO (e o rebordo) ---
  // O `ondula` serrilha o contorno do solado: sao as travas do solado tratorado,
  // de graca, no proprio perfil e sem uma peca a mais na cena.
  g.add(sh(new THREE.Mesh(torpedo(perfilPlanta(W, 0.0052, 11, 0.0016), {
    seg: 12, escala: 0.020 / (W + 0.0052), base: S, chao: S,
  }), mSolado)))
  // SALTO separado: a mesma revolucao, recortada no terco de tras e descida
  // 3 mm. Ela some 8 mm por dentro do solado e sobra so o degrau embaixo do
  // calcanhar — que e o que o olho le como salto num sapato cujo pe nao pode
  // inclinar (a junta do tornozelo e fixa). As duas pontas do perfil fecham em
  // raio quase zero de proposito: LatheGeometry nao tampa as pontas e um anel
  // aberto ali apareceria por tras da bota.
  const pl = perfilPlanta(W, 0.0030, 11)
  const perfilSalto = [[0.004, Z_TRAS + 0.002]].concat(pl.slice(1, 5), [[0.010, Z_TRAS + 0.098]])
  g.add(sh(new THREE.Mesh(torpedo(perfilSalto, {
    seg: 10, escala: 0.011 / (W * 0.755 + 0.0030), base: S - 0.003, chao: S - 0.003,
  }), mSalto)))
  g.add(sh(new THREE.Mesh(torpedo(perfilPlanta(W, 0.0080, 11), {
    seg: 12, escala: 0.014 / (W + 0.0080), base: S + 0.018, chao: S + 0.014,
  }), mEntre)))

  // --- cabedal ---
  const perfilPe = perfilPlanta(W, 0, 12)
  g.add(sh(new THREE.Mesh(torpedo(perfilPe, {
    seg: 14, escala: 1.26, base: TOPO_SOLA, chao: TOPO_SOLA - 0.006,
    modY: COTURNO_ALTURA,
  }), mCouro)))
  // Biqueira: a MESMA revolucao, so que 2 mm por fora e recortada no bico. Como
  // sai da mesma formula, ela assenta exata em vez de flutuar como uma casca
  // colada.
  g.add(sh(new THREE.Mesh(torpedo(perfilPe.slice(8).map((p) => [p[0] + 0.002, p[1]]), {
    seg: 14, escala: 1.26, base: TOPO_SOLA, chao: TOPO_SOLA - 0.004,
    modY: COTURNO_ALTURA,
  }), mBico)))

  // --- cano ---
  const perfilCano = canoCoturno(S)
  const maCano = tecelagem()
  lofte(maCano, perfilCano.map((p) => secaoCano(12, p[0], p[1], p[2], p[3])), false, true)
  g.add(malhaDe(maCano, mCouro))

  // --- ilhos e cadarco em ziguezague ---
  const maMetal = tecelagem()
  const maFio = tecelagem()
  lingueta(maFio, perfilCano, 2, 9, 0.040, 0.0015)
  for (let i = 0; i < 6; i++) {
    const p = perfilCano[3 + i]
    const y = p[3]
    for (const s of [1, -1]) {
      const x = s * 0.024
      _m4.identity()
      _m4.setPosition(x, y, frenteCano(p[0], p[1], p[2], x) + 0.0030)
      cubo(maMetal, _m4, 0.0080, 0.0080, 0.0038)
    }
    if (i < 5) {
      const q = perfilCano[4 + i]
      _m4.makeRotationZ((i % 2 ? 1 : -1) * 0.66)
      _m4.setPosition(0, (y + q[3]) / 2, frenteCano(q[0], q[1], q[2], 0) + 0.0045)
      cubo(maFio, _m4, 0.056, 0.0046, 0.0046)
    }
  }
  g.add(malhaDe(maMetal, mMetal))

  // A entressola do coturno e uma revolucao: a linha mais grossa dela fica na
  // altura da base do torpedo (S + 0.018) e nao no topo. E la que a costura
  // encosta em toda a volta.
  costura(maFio, {
    n: 7, t0: 0.10, t1: 0.94, z0: Z_TRAS, z1: Z_BICO, comp: 0.0080,
    ponto: (t) => [curva(PLANTA, t) * W + 0.0086, S + 0.019],
  })
  g.add(malhaDe(maFio, mFio))
  return g
}

// ===========================================================================
// 4. MOCASSIM — esfera esculpida
// ===========================================================================
const MOC_ALTURA = [
  [0.00, 0.72], [0.12, 0.95], [0.28, 1.00], [0.42, 0.96],
  [0.58, 0.86], [0.72, 0.72], [0.86, 0.55], [1.00, 0.34],
]
// A SOLA tem a curva de altura dela, e ela e o "salto": grossa no calcanhar,
// fina da cintura pra frente. Nao da pra inclinar o pe (a junta do tornozelo e
// fixa), entao o salto de um sapato baixo tem que estar na ESPESSURA da sola —
// e o degrau entre 30% e 42% do comprimento que o olho le como salto.
const MOC_SOLA = [
  [0.00, 1.00], [0.30, 0.96], [0.42, 0.58], [0.70, 0.52], [1.00, 0.44],
]

/**
 * Ponto da forma do mocassim: `u` corre do calcanhar ao bico, `phi` da a volta
 * na secao (phi = pi/2 e o dorso do pe).
 *
 * O truque do metodo esta no `k`: a esfera ja afina sozinha perto dos polos, e
 * e disso que sai a ponta fechada. Mas se essa afinada entrasse inteira, a
 * cintura do pe emagreceria junto e a forma viraria um charuto. Guardar so
 * sin(theta) elevado a 0.30 deixa a TABELA mandar no meio do pe e a esfera
 * mandar so nas duas pontas.
 */
function pontoMoc(u, phi, o, fora = 0) {
  const sen = Math.sqrt(Math.max(1e-8, 1 - (2 * u - 1) * (2 * u - 1)))
  const k = Math.pow(sen, 0.30)
  const w = curva(PLANTA, u) * o.w * k + fora
  const h = curva(o.perfil || MOC_ALTURA, u) * o.h * k + fora
  return [
    -Math.cos(phi) * w,
    o.base + Math.sin(phi) * h,
    o.z0 + (o.z1 - o.z0) * u,
  ]
}

/** Remapeia uma SphereGeometry inteira (ou um pedaco dela) pela forma. */
function esculpir(g, o, fora = 0) {
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const u = (y + 1) / 2
    const rr = Math.max(1e-6, Math.hypot(x, z))
    const p = pontoMoc(u, Math.atan2(z / rr, -x / rr), o, fora)
    // A metade de BAIXO da esfera nao vira sola: ela vira um prato raso alguns
    // milimetros abaixo da linha de apoio, so pra FECHAR a casca. Achatar tudo
    // no mesmo plano poria dezenas de triangulos coplanares brigando no depth
    // buffer debaixo do sapato.
    const cz = z / rr
    pos.setXYZ(i, p[0], cz > 0 ? p[1] : o.base + cz * (o.prato || 0.005), p[2])
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  // A esfera fecha a volta DUPLICANDO a coluna de vertices — sem soldar, um
  // risco aceso desce pelo meio do bico.
  soldarNormais(g)
  return g
}

function fazMocassim(c) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  const mCouro = couro(0x6a3f28)
  const mApron = couro2(0x74472d)
  const mSola = couro(0x3a2a1c)
  const mFio = tecido(0xe4cf9c, 0.78)
  const mMoeda = metal(0xd8b134)

  // h = 0.068 e nao 0.062: e o unico item baixo do catalogo, e o cone da canela
  // so alcanca raio 0.0176 em y = -0.006. Com a boca 6 mm mais baixa aparecia
  // um palito de tornozelo saindo do sapato antes de a perna engrossar.
  const F = { w: 0.048, h: 0.068, base: S + 0.014, z0: Z_TRAS + 0.002, z1: Z_BICO - 0.002 }

  // --- cabedal: a esfera inteira ---
  g.add(sh(new THREE.Mesh(esculpir(new THREE.SphereGeometry(1, 16, 10), F), mCouro)))

  // --- apron: o MESMO mapeamento num pedaco da esfera, 2 mm pra fora ---
  // theta corta o comprimento (0 e o bico) e phi corta a faixa do dorso: o que
  // sobra e o U caracteristico do mocassim. Como o patch sai da mesma formula
  // do cabedal, o degrau de 2 mm e constante em toda a volta — nao ha lugar em
  // que ele afunde no couro nem em que descole.
  g.add(sh(new THREE.Mesh(esculpir(
    new THREE.SphereGeometry(1, 12, 7, 0.62, 1.90, 0.45, 1.43), F, 0.0020,
  ), mApron)))

  // --- costura do apron: pontos ao longo das duas bordas do U ---
  const maFio = tecelagem()
  const a = new THREE.Vector3(), b = new THREE.Vector3()
  const eixoX = new THREE.Vector3(), eixoY = new THREE.Vector3(), eixoZ = new THREE.Vector3()
  for (const phi of [0.62, Math.PI - 0.62]) {
    for (let i = 0; i < 6; i++) {
      const u = 0.40 + (0.90 - 0.40) * (i / 5)
      a.fromArray(pontoMoc(u, phi, F, 0.0026))
      b.fromArray(pontoMoc(Math.min(0.98, u + 0.02), phi, F, 0.0026))
      eixoZ.subVectors(b, a).normalize()
      // normal aproximada da secao: a elipse e quase circular aqui (w 0.048 x
      // h 0.062), entao o raio serve de normal sem conta de elipse
      eixoY.set(-Math.cos(phi), Math.sin(phi), 0).normalize()
      eixoX.crossVectors(eixoY, eixoZ).normalize()
      eixoY.crossVectors(eixoZ, eixoX)
      _m4.makeBasis(eixoX, eixoY, eixoZ)
      _m4.setPosition(a)
      cubo(maFio, _m4, 0.0024, 0.0022, 0.0090)
    }
  }
  // Costura lateral do cabedal, logo acima do rebordo da sola. Sai de pontoMoc
  // com phi = 0.26 (um pouco acima da linha mais larga), entao eles pousam na
  // casca de verdade — a altura da forma muda muito do calcanhar pro peito do
  // pe e uma linha de y fixo la sai 1,5 cm do couro.
  costura(maFio, {
    n: 9, t0: 0.08, t1: 0.95, z0: F.z0, z1: F.z1, comp: 0.0085,
    ponto: (t) => {
      const q = pontoMoc(t, 0.26, F, 0.0018)
      return [Math.abs(q[0]), q[1]]
    },
  })
  g.add(malhaDe(maFio, mFio))

  // --- sola: a mesma escultura, esmagada e com a curva de salto ---
  // base em S + 0.004 e nao em S porque o prato de fechamento da casca desce
  // 4 mm (ver esculpir): com a base no chao a sola furava o piso.
  g.add(sh(new THREE.Mesh(esculpir(new THREE.SphereGeometry(1, 14, 6), {
    w: 0.055, h: 0.024, base: S + 0.004, prato: 0.004,
    perfil: MOC_SOLA, z0: Z_TRAS, z1: Z_BICO,
  }), mSola)))
  // Tapa do salto: a lamina escura que encosta no chao. So ela desce abaixo da
  // sola (2 mm), e e esse fio escuro embaixo do calcanhar que faz o salto
  // existir na silhueta de perfil em vez de virar uma sola grossa.
  const salto = bloco(0.054, 0.011, 0.056, 0.007, couro(esc(0x3a2a1c, 0.70)))
  salto.position.set(0, S + 0.0035, -0.046)
  g.add(salto)

  // --- colarinho: a boca do sapato, oval e comprida ---
  // O mocassim nao tem furo: a casca e fechada e a canela ATRAVESSA ela por
  // cima. O colarinho e o que esconde essa travessia — sem ele a perna parece
  // espetada no couro.
  // A escala vai em (x, y, z) LOCAIS e o anel ja esta deitado por rotation.x:
  // depois de deitado o y local aponta pro +Z do mundo e o z local pro -Y. Foi
  // escalando o eixo errado que a gola virou um pneu de 16 mm de altura.
  const gola = anel(0.030, 0.0058, mCouro, 4, 14)
  gola.rotation.x = Math.PI / 2
  gola.scale.set(0.64, 1.38, 1)
  gola.position.set(0, S + 0.076, -0.016)
  g.add(gola)

  // --- tira com a moeda: o carimbo visual do penny loafer ---
  // Ela e feita de seis cubinhos POUSADOS na propria forma (pontoMoc de novo,
  // 2,2 mm por fora), e nao de um torus escalado: a secao do sapato nao e um
  // circulo, e o arco de raio fixo saia 1 cm do couro no meio do peito do pe.
  const maTira = tecelagem()
  const uT = 0.56
  const eX = new THREE.Vector3(), eY = new THREE.Vector3(), eZ = new THREE.Vector3(0, 0, 1)
  const secW = curva(PLANTA, uT) * F.w, secH = curva(MOC_ALTURA, uT) * F.h
  for (let i = 0; i < 6; i++) {
    const phi = 0.52 + (Math.PI - 1.04) * (i / 5)
    const q = pontoMoc(uT, phi, F, 0.0022)
    eX.set(Math.sin(phi) * secW, Math.cos(phi) * secH, 0).normalize()
    eY.set(-Math.cos(phi) / secW, Math.sin(phi) / secH, 0).normalize()
    _m4.makeBasis(eX, eY, eZ)
    _m4.setPosition(q[0], q[1], q[2])
    cubo(maTira, _m4, 0.019, 0.0050, 0.014)
  }
  g.add(malhaDe(maTira, mApron))
  const alto = pontoMoc(uT, Math.PI / 2, F, 0.0062)
  const moeda = malha(new THREE.CylinderGeometry(0.0068, 0.0068, 0.0030, 8), mMoeda)
  moeda.position.set(alto[0], alto[1], alto[2])
  g.add(moeda)
  return g
}

// ===========================================================================
export const CALCADOS = [
  {
    id: 'descalco',
    nome: 'Descalco',
    metodo: 'nenhum: o pe nu do corpo e que fica a vista',
    build() { return null },
  },
  {
    id: 'bota',
    nome: 'Bota',
    metodo: 'loft de secoes: pilha de superelipses com expoente variavel + cano de secao eliptica',
    esconde: ['pe'],
    build(c) { return par(c, () => fazBota(c)) },
  },
  {
    id: 'chinelo',
    nome: 'Chinelo',
    // Apaga o pe do corpo e desenha o SEU: a sola precisa entrar por baixo, e o
    // pe do corpo ja nasce plantado no chao.
    metodo: 'contorno em bezier extrudado com bisel + tira em Y por TubeGeometry',
    esconde: ['pe'],
    build(c) { return par(c, () => fazChinelo(c)) },
  },
  {
    id: 'coturno',
    nome: 'Coturno',
    metodo: 'revolucao no eixo Z, achatada, modulada em altura e grampeada no chao',
    esconde: ['pe'],
    build(c) { return par(c, () => fazCoturno(c)) },
  },
  {
    id: 'mocassim',
    nome: 'Mocassim',
    metodo: 'esfera remapeada pela forma; o apron em U e um pedaco da mesma esfera 2 mm por fora',
    esconde: ['pe'],
    build(c) { return par(c, () => fazMocassim(c)) },
  },
]

export default CALCADOS
