import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD, HEAD_S, activeHead, useHead, surfaceZ, eggSurface, eggNormal,
  skinOf, shade, sh, flatPiece, clamp, smoothstep, gauss, faceSpread,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/nariz.js — TRES METODOS DE CONSTRUIR NARIZ (+ "sem nariz").
//
// O catalogo antigo fazia todo nariz do mesmo jeito: bolotas (esferas escaladas)
// atravessadas umas nas outras. Bolota nao tem PLANO nem ARESTA — a luz cai
// igual em toda a superficie e o resultado le como massinha grudada na cara.
// Era exatamente a queixa de "cabeca de balao sem vida". Os tres metodos abaixo
// atacam o problema por caminhos que nao se parecem em nada:
//
//   A LOFT DE SECOES  o nariz e uma pilha de secoes horizontais costuradas num
//     tubo. Cada secao e uma SUPERELIPSE com expoente proprio: expoente < 2
//     pincha o contorno e vira crista (a cana, que precisa de dorso afiado),
//     expoente > 2 arredonda (a ponta bulbosa e as asas). E o unico metodo com
//     controle real do PERFIL DE LADO — a lista de secoes E o desenho do perfil,
//     entao mudar de aquilino pra arrebitado e mudar numero, nao geometria.
//
//   B DEFORMACAO DA PROPRIA PELE  nada e colado na cara: uma calota da
//     superficie do cranio e reamostrada com eggSurface/eggNormal e PUXADA pra
//     frente por um campo gaussiano. Nao existe emenda porque nao existe duas
//     pecas — a borda da calota afunda pra dentro do cranio e some. E o que
//     melhor se adapta aos 6 cranios, porque nasce da equacao deles.
//
//   C BLOCO ESCULPIDO COM CHANFRO  um Shape 2D do perfil LATERAL extrudado na
//     largura, depois afunilado por altura. Da os PLANOS que um nariz estilizado
//     precisa: dorso, duas laterais, ponta e base, cada um pegando a luz num
//     valor diferente. E o oposto do B — la nao ha aresta nenhuma, aqui a aresta
//     E o desenho. Bevel pequeno (2 mm) porque aresta viva sem chanfro serrilha
//     assim que a camera se afasta.
//
// O QUE OS TRES COMPARTILHAM (e o que impede o traco de flutuar):
//   - nenhum Z e fixo. Raiz, cintura e base sao lidas de surfaceZ()/eggSurface()
//     do cranio ATIVO. Um Z fixo acerta na cabeca redonda e afunda quase 4 cm na
//     comprida. Os numeros, medidos em x = 0: no TOPO do nariz (y = 0.062 * S) a
//     pele esta em z 0.1761 na redonda contra 0.1725 na comprida — so 3.5 mm de
//     diferenca, que e o que engana quem confere a raiz e para por ali. Na BASE
//     (y = -0.035 * S) sao 0.1840 contra 0.1460: 38 mm. A cabeca comprida nao
//     tem a testa mais atras, ela AFUNILA pra baixo, e o erro de um Z fixo cresce
//     conforme o nariz desce — que e exatamente onde o nariz existe.
//   - a peca comeca DENTRO do cranio. A primeira secao do loft, a borda da
//     calota e a face de tras do bloco ficam 1 a 3 cm atras da pele: e o que
//     solda a peca em qualquer cranio sem CSG.
//   - narina e GEOMETRIA (volume escuro afundado), nunca textura. Textura
//     serrilha em close e nao recebe a luz da cena.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da ponta do nariz. Os tres metodos compartilham porque os tres precisam saber onde e o ponto mais avancado do rosto. */
const Y_PONTA = -0.024 * S

/**
 * Quanto do recuo da testa e descontado do dorso alto (ver recuoDorso).
 *
 * O QUE 0.55 COMPRA: na cabeca comprida, sem o desconto o dorso empina em
 * t = 0.42 e a ponta fica 6.0 mm ATRAS do ponto mais avancado da cana — de
 * perfil, um nariz amassado pra dentro. Com 0.55 o dorso volta a ser monotono
 * e a ponta e o ponto mais avancado do nariz nos seis cranios.
 *
 * O QUE 0.55 CUSTA, e o proximo a mexer aqui precisa saber: o desconto empurra
 * a cana pra dentro da pele, entao o nariz EMERGE mais embaixo. Medido (altura
 * em unidades de S onde o dorso sai da pele): 0.043 na redonda e na pera, 0.041
 * na mandibula, 0.039 na quadrada, 0.034 na realista e 0.022 na comprida —
 * contra o topo desenhado em 0.062. Ou seja, na comprida a raiz ja nasce ABAIXO
 * da linha do olho (0.035 * S), que era justamente o defeito que este numero
 * deveria evitar; ele so nao le como nariz quebrado porque o dorso ficou
 * monotono. O preco aparece na silhueta de perfil: a comprida ganha 1092 mm2
 * de nariz fora do contorno da cabeca contra 1361 a 1560 mm2 nas outras cinco.
 * Subir o valor piora esse lado; baixar devolve a corcova.
 */
const PESO_RECUO = 0.55

/**
 * Theta (0 = topo do cranio) da altura y no cranio ativo.
 * A conta e a mesma do surfaceZ; existe aqui porque o metodo B trabalha em
 * coordenada esferica e o perfil do nariz esta escrito em ALTURA — sem esta
 * ponte o mesmo campo gaussiano cairia no queixo da cabeca comprida (yTop 1.18)
 * e na testa da quadrada (yTop 0.99).
 */
function thetaDeY(y) {
  const sp = activeHead()
  const uy = clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1)
  return Math.acos(uy)
}

/**
 * Interpola uma tabela [[chave, v1, v2, ...], ...] em ordem crescente de chave.
 * O passo e smoothstep e nao linear de proposito: rampa linear entre duas
 * secoes deixa um CANTO no perfil, e canto no meio da cana do nariz a luz le
 * como osso quebrado. Devolve um array com os valores ja interpolados.
 */
function porChave(tab, k) {
  if (k <= tab[0][0]) return tab[0].slice(1)
  const ult = tab[tab.length - 1]
  if (k >= ult[0]) return ult.slice(1)
  for (let i = 1; i < tab.length; i++) {
    if (k <= tab[i][0]) {
      const a = tab[i - 1], b = tab[i]
      const u = (k - a[0]) / (b[0] - a[0])
      const s = u * u * (3 - 2 * u)
      const out = []
      for (let c = 1; c < a.length; c++) out.push(a[c] + (b[c] - a[c]) * s)
      return out
    }
  }
  return ult.slice(1)
}

/**
 * RECUO DO DORSO ALTO — a correcao que os tres metodos precisam.
 *
 * O bug que isto conserta: com o nariz medido sempre A PARTIR da pele local, na
 * cabeca COMPRIDA (a pele recua de z 0.172 na glabela pra 0.149 na ponta, 2.3 cm
 * de queda) o ponto mais avancado do rosto virava a RAIZ do nariz, e a ponta
 * ficava 5.7 mm ATRAS dela. De perfil isso le como nariz amassado pra dentro.
 *
 * A conta e direta: onde a pele ainda esta mais pra frente do que esta na altura
 * da ponta, o dorso desconta parte dessa diferenca. Numa cabeca de perfil reto
 * (redonda, quadrada, mandibula) a diferenca e quase zero e nada muda; na pera,
 * que avanca pra baixo em vez de recuar, o max(0, ...) zera o termo e a raiz
 * fica intacta. Descontar em vez de empurrar a ponta e de proposito: empurrar
 * estouraria o limite de 3 cm de projecao pedido.
 */
function recuoDorso(y, zPonta) {
  // porta suave logo acima da ponta: abaixo dela o termo tem que ser zero, ou
  // ele puxaria a ASA pra dentro da bochecha na cabeca pera
  const porta = smoothstep(Y_PONTA - 0.004, Y_PONTA + 0.014, y)
  if (porta <= 0) return 0
  return -PESO_RECUO * Math.max(0, surfaceZ(0, y) - zPonta) * porta
}

/**
 * Coordenada de superelipse: |v|^(2/p) com o sinal de v.
 * p = 2 devolve o circulo; p > 2 empurra o contorno pro quadrado (ponta gorda,
 * asa cheia); p < 2 PINCHA o contorno num losango — e esse ramo, e so ele, que
 * transforma a secao da cana numa crista com dorso afiado em vez de um tubo.
 */
function supEl(v, p) {
  const r = Math.pow(Math.abs(v), 2 / p)
  return v < 0 ? -r : r
}

/**
 * Quanto a largura do nariz acompanha a largura do cranio.
 * faceSpread() vai de 0.916 (comprida) a 1.098 (mandibula); aplicar ele inteiro
 * daria um nariz visivelmente gordo na cabeca larga, porque nariz humano quase
 * nao varia com a largura do cranio. Metade da diferenca mantem a proporcao sem
 * deixar o nariz parecer emprestado de outra cabeca.
 */
function larguraCranio() { return 1 + (faceSpread() - 1) * 0.5 }

/** Material da pele do nariz. Roughness 0.68: pele de nariz reflete mais que a bochecha (e onde o oleo junta), e esse brilho fraco e metade do "juice". */
function matPele(skin) { return solid(skin, 0.68, 0.0) }

/** Fundo de narina. 0.34 e escuro o bastante pra ler como buraco a 10 m sem virar mancha preta chapada em close. */
function matNarina(skin) { return solid(shade(skin, 0.34), 0.95, 0.0) }

// ===========================================================================
// METODO A — LOFT DE SECOES SUPERELIPTICAS
// ===========================================================================

/**
 * O perfil inteiro do nariz em uma tabela. Colunas:
 *
 *   t        posicao ao longo do nariz (0 = glabela, 1 = base)
 *   y        altura em unidades de S (a tabela do CONTRATO: glabela +0.06,
 *            base do nariz -0.035; a base aqui desce ate -0.040 porque a asa
 *            fica ABAIXO do ponto subnasal)
 *   w        meia-largura da secao, em unidades de S
 *   cintura  onde a "cintura" da secao (o ponto mais lateral) fica em relacao a
 *            PELE, em metros. Negativo = dentro do cranio. E este numero que
 *            solda o nariz: na raiz a secao inteira mora dentro da cabeca e vai
 *            saindo conforme desce, que e como o nariz humano emerge da testa.
 *   proj     quanto o dorso avanca A PARTIR da cintura, em metros
 *   p        expoente da superelipse da metade da frente
 *
 * Os numeros de proj foram fechados olhando a soma cintura+proj: na ponta da
 * 0.0235 alem da pele, dentro da faixa de 1.5 a 3 cm pedida. Com 0.035 o nariz
 * furava o campo de visao da camera em primeira pessoa.
 */
const SECOES_LOFT = [
  // t      y       w        cintura   proj     p
  [0.00,  0.062, 0.0070, -0.0160, 0.0050, 2.60],
  [0.14,  0.047, 0.0076, -0.0130, 0.0110, 1.90],
  [0.28,  0.032, 0.0086, -0.0110, 0.0170, 1.58],
  [0.42,  0.016, 0.0097, -0.0100, 0.0222, 1.45],
  [0.55,  0.000, 0.0110, -0.0092, 0.0250, 1.50],
  [0.67, -0.014, 0.0132, -0.0080, 0.0282, 1.80],
  [0.78, -0.024, 0.0163, -0.0060, 0.0295, 2.30],
  [0.88, -0.031, 0.0215, -0.0030, 0.0245, 2.45],
  [0.95, -0.036, 0.0252,  0.0012, 0.0150, 2.60],
  [1.00, -0.040, 0.0240,  0.0016, 0.0065, 2.80],
]

/** Profundidade que a metade de TRAS de cada secao enfia no cranio. 3 cm passa folgado do ponto mais raso do catalogo (comprida, base do nariz em z = 0.132). */
const ENTERRO_LOFT = 0.030

const N_ANEL = 20
const N_COL = 22

function narizLoft(ctx) {
  const skin = skinOf(ctx)
  const kw = larguraCranio()
  const g = new THREE.Group()

  const pos = []
  const idx = []
  const aneis = []
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  const zPonta = surfaceZ(0, Y_PONTA)
  let yPrim = 0, zcPrim = 0, yUlt = 0, zcUlt = 0
  for (let i = 0; i < N_ANEL; i++) {
    const t = i / (N_ANEL - 1)
    const [ys, ws, cint, projT, p] = porChave(SECOES_LOFT, t)
    const y = ys * S
    const w = ws * S * kw
    // o recuo entra so na PROJECAO (o dorso), nunca na cintura: a cintura e o
    // que mantem a secao soldada na bochecha e mexer nela abriria fenda
    const proj = projT + recuoDorso(y, zPonta)
    const zEixo = surfaceZ(0, y) + cint
    if (i === 0) { yPrim = y; zcPrim = zEixo }
    if (i === N_ANEL - 1) { yUlt = y; zcUlt = zEixo }
    const anel = []
    for (let c = 0; c < N_COL; c++) {
      const a = (c / N_COL) * Math.PI * 2
      const sa = Math.sin(a), ca = Math.cos(a)
      const x = w * supEl(sa, p)
      // A cintura de CADA vertice le surfaceZ no x dele, nao no x = 0: assim o
      // contorno de tras da secao acompanha a curva da bochecha e a asa do
      // nariz encosta na pele com a mesma folga na cabeca redonda e na quadrada.
      const zc = surfaceZ(x, y) + cint
      // metade de tras com expoente 2 fixo (esta enterrada, ninguem a ve; o que
      // importa la e nao gastar triangulo em forma que nao aparece)
      const z = ca >= 0 ? zc + proj * Math.pow(ca, 2 / p) : zc + ENTERRO_LOFT * ca
      anel.push(put(x, y, z))
    }
    aneis.push(anel)
  }

  for (let i = 0; i < N_ANEL - 1; i++) {
    const A = aneis[i], B = aneis[i + 1]
    for (let c = 0; c < N_COL; c++) {
      const c1 = (c + 1) % N_COL
      idx.push(A[c], B[c], B[c1], A[c], B[c1], A[c1])
    }
  }
  // tampa de cima: mora inteira dentro do cranio, so existe pra malha fechar
  const apice = put(0, yPrim + 0.006 * S, zcPrim - 0.004)
  for (let c = 0; c < N_COL; c++) idx.push(apice, aneis[0][c], aneis[0][(c + 1) % N_COL])

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  // sem soldarNormais de proposito: o anel fecha com (c+1) % N_COL, entao nao ha
  // coluna duplicada e nao ha listra de costura pra soldar.
  g.add(sh(new THREE.Mesh(geo, matPele(skin))))

  // Base do nariz em MESH e MATERIAL proprios. Duas razoes: o vertice do centro
  // sobe 0.006 * S e deixa a base concava (a sombra sob a ponta nasce da forma,
  // nao de um decalque), e o tom 0.85 vende o plano subnasal como o unico que
  // nunca pega luz direta.
  const pos2 = []
  const idx2 = []
  const put2 = (x, y, z) => { const i = pos2.length / 3; pos2.push(x, y, z); return i }
  const ult = aneis[N_ANEL - 1]
  const mapa = []
  for (let c = 0; c < N_COL; c++) {
    const k = ult[c] * 3
    mapa.push(put2(pos[k], pos[k + 1], pos[k + 2]))
  }
  const fundo = put2(0, yUlt + 0.006 * S, zcUlt - 0.002)
  for (let c = 0; c < N_COL; c++) idx2.push(fundo, mapa[(c + 1) % N_COL], mapa[c])
  const geo2 = new THREE.BufferGeometry()
  geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3))
  geo2.setIndex(idx2)
  geo2.computeVertexNormals()
  geo2.computeBoundingSphere()
  g.add(sh(new THREE.Mesh(geo2, solid(shade(skin, 0.85), 0.8, 0.0))))

  // Narinas: dois elipsoides escuros ATRAVESSANDO a base concava por baixo.
  // Os numeros sao apertados de proposito e todos medidos contra a mesma
  // referencia (surfaceZ na altura DELES, nao na do ultimo anel — as duas
  // diferem ate 1 mm na cabeca comprida). O elipsoide tem que atravessar o cone
  // da base pra aparecer e ao mesmo tempo parar antes do contorno da frente:
  // na primeira versao ele tinha 3 cm de fundo e saia furando a ponta do nariz.
  const mn = matNarina(skin)
  const yNar = yUlt + 0.0035 * S
  const zNar = surfaceZ(0, yNar)
  for (const sgn of [1, -1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mn)
    n.scale.set(0.0038 * S, 0.0024 * S, 0.0040 * S)
    n.position.set(sgn * 0.0105 * S * kw, yNar, zNar + 0.0005)
    n.rotation.y = sgn * 0.30
    // flatPiece e nao sh: sombra propria de uma bolota metida dentro de uma
    // concavidade vira acne de sombra que pisca quando o boneco anda.
    g.add(flatPiece(n))
  }
  return g
}

// ===========================================================================
// METODO B — DEFORMACAO DA PROPRIA PELE
// ===========================================================================

const NB_T = 26
const NB_A = 22
/**
 * Meia-abertura da calota em azimute. 0.36 rad poe a borda entre x = 0.055
 * (comprida) e x = 0.073 (mandibula).
 *
 * CUIDADO ao comparar isso com o olho: a referencia NAO e o centro do olho
 * (EYE_ANCHOR.x * faceSpread(), 0.076 a 0.090). E o CANTO INTERNO da orbita,
 * que fica em EYE_ANCHOR.x * faceSpread() - 0.040 * S, ou seja x = 0.022 na
 * comprida e x = 0.037 na mandibula. O retalho passa por cima desse canto nos
 * seis cranios. O que segura a briga nao e distancia, e altura: naquele x o
 * retalho ja esta descendo pra dentro do cranio (folga medida 0.6 a 1.3 mm)
 * enquanto a palpebra de olhos.js nasce em surfaceZ + 0.0016. A margem e de
 * meio milimetro — quem mexer em AZ_CALOTA, em FOLGA_CALOTA ou no pad do olho
 * tem que remedir isso.
 */
const AZ_CALOTA = 0.36
/**
 * Quanto a BORDA da calota afunda no cranio.
 * A flecha da malha da cabeca na faixa do nariz e MAIOR do que parece: 1.7 mm
 * na pera, 2.8 mm na realista (corda medida contra a superficie analitica).
 * 3.2 mm ainda passa porque o enterro e aplicado ao longo da NORMAL e nao de Z,
 * e onde a normal deita a profundidade em Z cresce. Medido contra a malha de
 * verdade dos 6 cranios: nenhum dos 92 vertices de borda fica exposto, e o mais
 * raso ainda entra 1.17 mm (realista) a 1.79 mm (pera). Abaixar este numero
 * come essa margem direto.
 */
const ENTERRO_CALOTA = 0.0032
/** Folga do miolo da calota sobre a pele: 1.1 mm, so pra nao brigar em z com a cabeca. Mesma cor, mesmo material — o degrau nao le. */
const FOLGA_CALOTA = 0.0011

/**
 * O campo que vira nariz. Quatro termos somados, todos em metros:
 *
 *   dorso    crista estreita em azimute, ligada por uma janela em ALTURA que
 *            morre na glabela e antes do buco. Sozinho da um nariz de tabua.
 *   ponta    gaussiana curta e gorda na altura da ponta. E a soma dorso+ponta
 *            que fecha os 2.4 cm de projecao pedidos.
 *   asas     duas gaussianas em az = +-0.155 rad, mais baixas que a ponta.
 *            Sem elas o nariz vira uma quilha e a base nao fecha com a face.
 *   narina   termo NEGATIVO. Puxar pra dentro e o que da a concavidade onde a
 *            narina escura assenta — narina desenhada por cima da pele lisa
 *            fica boiando.
 */
function campoNariz(y, az, zPonta) {
  const janelaY = smoothstep(0.072 * S, 0.016 * S, y) * smoothstep(-0.054 * S, -0.030 * S, y)
  const dorso = 0.0115 * gauss(az, 0, 0.105) * janelaY
  const ponta = 0.0125 * gauss(az, 0, 0.135) * gauss(y, Y_PONTA, 0.020 * S)
  const asas = 0.0085 * (gauss(az, 0.155, 0.075) + gauss(az, -0.155, 0.075)) * gauss(y, -0.033 * S, 0.016 * S)
  const narina = -0.0034 * (gauss(az, 0.090, 0.044) + gauss(az, -0.090, 0.044)) * gauss(y, -0.041 * S, 0.011 * S)
  // o recuo do dorso alto vem multiplicado pela MESMA janela em altura e por
  // uma gaussiana em azimute um pouco mais larga que a do dorso: fora da faixa
  // do nariz ele tem que ser exatamente zero, senao abriria uma depressao na
  // testa da cabeca comprida, que e onde o termo e maior
  const recuo = recuoDorso(y, zPonta) * janelaY * gauss(az, 0, 0.145)
  return dorso + ponta + asas + recuo + narina
}

function narizPele(ctx) {
  const skin = skinOf(ctx)
  const g = new THREE.Group()
  // A calota e recortada em ANGULO, nao em x: numa cabeca larga o mesmo
  // azimute cai mais longe do meio, entao o nariz ja acompanha a largura do
  // cranio sem precisar do fator de larguraCranio() que os outros dois usam.
  const th0 = thetaDeY(0.100 * S)
  const th1 = thetaDeY(-0.070 * S)
  const zPonta = surfaceZ(0, Y_PONTA)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()

  /**
   * O ponto da calota ja deformado. UMA funcao so pro retalho da pele e pras
   * narinas: se as duas contas vivessem separadas, mexer no campo deslocaria a
   * narina do buraco dela e ninguem perceberia ate ver o boneco de perto.
   * `fora` afasta na direcao da normal (usado so pela narina).
   */
  function calota(theta, az, fora, out) {
    eggSurface(theta, az, 1, out)
    eggNormal(theta, az, n)
    const ti = (theta - th0) / (th1 - th0)
    const aj = (az + AZ_CALOTA) / (2 * AZ_CALOTA)
    // Janela da CALOTA (nao do nariz): vai a zero nas quatro bordas. Ela faz
    // duas coisas de uma vez — garante que o campo do nariz nunca vaze pra
    // fora do retalho e afunda a borda no cranio, que e o que faz a emenda
    // deixar de existir em vez de so ficar disfarcada.
    const jan = smoothstep(0, 0.20, ti) * smoothstep(0, 0.20, 1 - ti)
      * smoothstep(0, 0.22, aj) * smoothstep(0, 0.22, 1 - aj)
    const base = -ENTERRO_CALOTA + (ENTERRO_CALOTA + FOLGA_CALOTA) * jan
    const d = base + campoNariz(out.y, az, zPonta) * jan + (fora || 0)
    out.set(out.x + n.x * d, out.y + n.y * d, out.z + n.z * d)
    return out
  }

  const pos = []
  const idx = []
  for (let i = 0; i < NB_T; i++) {
    const theta = th0 + (th1 - th0) * (i / (NB_T - 1))
    for (let j = 0; j < NB_A; j++) {
      const az = -AZ_CALOTA + 2 * AZ_CALOTA * (j / (NB_A - 1))
      calota(theta, az, 0, p)
      pos.push(p.x, p.y, p.z)
    }
  }
  for (let i = 0; i < NB_T - 1; i++) {
    for (let j = 0; j < NB_A - 1; j++) {
      const a = i * NB_A + j, b = a + 1, c = a + NB_A + 1, d = a + NB_A
      idx.push(a, d, c, a, c, b)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  g.add(sh(new THREE.Mesh(geo, matPele(skin))))

  // NARINA DESTE METODO: um disco eliptico da PROPRIA superficie deformada,
  // 0.6 mm por fora dela, em material escuro. Bolota metida na pele nao serve
  // aqui — a versao anterior era um elipsoide de 2 cm que furava a ponta do
  // nariz nos seis cranios. Este disco nao pode furar nada: e a mesma equacao
  // do retalho, so que amostrada num pedacinho. O que faz ele ler como buraco e
  // o termo NEGATIVO `narina` do campo, que ja cavou a depressao debaixo dele.
  const mn = matNarina(skin)
  const Y_NAR = -0.041 * S
  const thC = thetaDeY(Y_NAR)
  // raio em THETA medido em metros de altura e convertido: theta por metro muda
  // 18% entre a cabeca comprida (yTop 1.18) e a redonda (0.95), e uma narina
  // escrita direto em radianos ficava 1 cm mais alta numa que na outra
  const rTheta = Math.abs(thC - thetaDeY(Y_NAR + 0.0032))
  const NR = 4, NC = 12
  for (const sgn of [1, -1]) {
    const azC = sgn * 0.092
    const pos3 = []
    const idx3 = []
    const centro = calota(thC, azC, 0.0006, p)
    pos3.push(centro.x, centro.y, centro.z)
    for (let r = 1; r <= NR; r++) {
      const u = r / NR
      for (let c = 0; c < NC; c++) {
        const a = (c / NC) * Math.PI * 2
        // elipse mais larga em azimute que em altura: a narina real e uma fenda
        // deitada, e um circulo perfeito aqui le como bolinha de tinta
        calota(thC + rTheta * u * Math.sin(a), azC + 0.030 * u * Math.cos(a), 0.0006, p)
        pos3.push(p.x, p.y, p.z)
      }
    }
    // Ordem (centro, seguinte, atual): o sentido de `a` anda de +azimute pra
    // +theta, ou seja de +X pra -Y, e a ordem ingenua deixaria a normal virada
    // PRA DENTRO do nariz — o disco simplesmente sumia (material de uma face so).
    for (let c = 0; c < NC; c++) idx3.push(0, 1 + (c + 1) % NC, 1 + c)
    for (let r = 1; r < NR; r++) {
      const A = 1 + (r - 1) * NC, B = 1 + r * NC
      for (let c = 0; c < NC; c++) {
        const c1 = (c + 1) % NC
        idx3.push(A + c, A + c1, B + c1, A + c, B + c1, B + c)
      }
    }
    const geo3 = new THREE.BufferGeometry()
    geo3.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3))
    geo3.setIndex(idx3)
    geo3.computeVertexNormals()
    geo3.computeBoundingSphere()
    // flatPiece: casca colada na pele com 0.6 mm de folga projetando sombra em
    // si mesma vira mancha preta que pisca (item 7 do CONTRATO).
    g.add(flatPiece(new THREE.Mesh(geo3, mn)))
  }
  return g
}

// ===========================================================================
// METODO C — BLOCO ESCULPIDO COM CHANFRO
// ===========================================================================

/**
 * Perfil LATERAL: [y em unidades de S, avanco em metros a partir da PELE].
 * E o contorno da frente do bloco, do alto da glabela ate a base. O primeiro
 * ponto e negativo — a testa come o comeco do nariz, que e o que impede o bloco
 * de comecar como um degrau colado na cara.
 * A quebra entre -0.031 (ponta, 2.32 cm) e -0.040 e de proposito: e a aresta da
 * supraponta, o plano que separa dorso de base e o que mais denuncia a forma do
 * nariz num personagem estilizado.
 */
const PERFIL_BLOCO = [
  [0.062, -0.0110],
  [0.047, -0.0030],
  [0.032,  0.0060],
  [0.016,  0.0125],
  [0.000,  0.0180],
  [-0.014, 0.0215],
  [-0.024, 0.0232],
  [-0.033, 0.0150],
  [-0.040, 0.0040],
]

/**
 * Afunilamento: [-y em unidades de S, fator de largura].
 * A chave e -y so pra tabela ficar crescente (porChave exige isso).
 * O salto de 0.62 pra 1.00 entre a ponta e a asa e o afunilamento pedido: e
 * dele que sai a aresta viva onde a asa se descola da lateral do dorso.
 */
const LARGURA_BLOCO = [
  [-0.062, 0.26],
  [-0.047, 0.29],
  [-0.032, 0.33],
  [-0.016, 0.40],
  [0.000,  0.50],
  [0.014,  0.62],
  [0.024,  0.78],
  [0.033,  1.00],
  [0.040,  0.90],
]

/** Largura total do bloco na asa. 0.052 * S = 6.9 cm, 19% da largura da cabeca — a mesma razao de um nariz humano contra o cranio. */
const LARG_BLOCO = 0.052 * S
/** Quanto a face de tras do bloco enfia no cranio. */
const ENTERRO_BLOCO = 0.026
/** Chanfro. 2 mm: abaixo disso a aresta serrilha na distancia de jogo, acima o bloco perde os planos e volta a ser bolota. */
const CHANFRO = 0.0020 * S

function narizBloco(ctx) {
  const skin = skinOf(ctx)
  const kw = larguraCranio()
  const g = new THREE.Group()

  // O Shape mora no plano XY do extrude: x = profundidade, y = altura. Vira
  // (z, y) do mundo depois do rotateY.
  const zPonta = surfaceZ(0, Y_PONTA)
  const s2 = new THREE.Shape()
  const frente = PERFIL_BLOCO.map(([ys, dz]) => {
    const y = ys * S
    return [surfaceZ(0, y) + dz + recuoDorso(y, zPonta), y]
  })
  s2.moveTo(frente[0][0], frente[0][1])
  for (let i = 1; i < frente.length; i++) s2.lineTo(frente[i][0], frente[i][1])
  // Contorno de TRAS amostrado em 6 alturas: ele COPIA a curva do cranio em vez
  // de ser uma reta. Com uma reta o bloco enfiava 3 cm na testa da cabeca pera
  // (z 0.157 no alto) e saia pela pele na base (z 0.186).
  const yTopo = PERFIL_BLOCO[0][0] * S
  const yBase = PERFIL_BLOCO[PERFIL_BLOCO.length - 1][0] * S
  for (let i = 0; i <= 6; i++) {
    const y = yBase + (yTopo - yBase) * (i / 6)
    s2.lineTo(surfaceZ(0, y) - ENTERRO_BLOCO, y)
  }
  s2.closePath()

  // steps: 6 nao e enfeite, e o que faz o metodo funcionar. Com o extrude
  // padrao (1 passo) a peca so tem vertice nas DUAS pontas da largura: o
  // afunilamento de profundidade la embaixo achatava o dorso inteiro no valor
  // da lateral e o nariz saia com 1 cm de projecao no lugar de 2.3, sem crista
  // nenhuma. Sete camadas poem um vertice em x = 0 — a crista do dorso.
  const geo = new THREE.ExtrudeGeometry(s2, {
    depth: LARG_BLOCO, steps: 6, bevelEnabled: true,
    bevelThickness: CHANFRO, bevelSize: CHANFRO, bevelSegments: 2, curveSegments: 1,
  })
  // (x,y,z) -> (-z, y, x): a profundidade do Shape vira Z do mundo e o eixo do
  // extrude vira X. Determinante +1, entao a orientacao dos triangulos (e a
  // sombra) continua certa; um espelho simples inverteria as normais.
  geo.rotateY(-Math.PI / 2)
  geo.translate(LARG_BLOCO / 2, 0, 0)

  const meia = LARG_BLOCO / 2
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    // u vem do x ORIGINAL (antes do afunilamento), senao a conta do dorso
    // mudaria de significado a cada altura.
    const u = clamp(Math.abs(x) / meia, 0, 1)
    const f = porChave(LARGURA_BLOCO, -y / S)[0]
    const zb = surfaceZ(0, y) - ENTERRO_BLOCO
    // As laterais recuam 26% da profundidade: e o que transforma o prisma reto
    // (que so tinha o plano do dorso) em tres planos — dorso no meio e duas
    // faces inclinadas pegando a luz num valor mais baixo.
    p.setXYZ(i, x * f * kw, y, zb + (z - zb) * (1 - 0.26 * u * u))
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  // flatShading aqui e SEGURO (e o ponto do metodo): o bloco nao e uma casca
  // colada na pele curva — a unica emenda dele esta 2.6 cm dentro do cranio.
  g.add(sh(new THREE.Mesh(geo, solid(skin, 0.68, 0.0, { flatShading: true }))))

  // Narinas em BLOCO tambem, pra combinar com o metodo: duas caixas escuras
  // ATRAVESSANDO o plano subnasal (o trecho do perfil entre y -0.040 e -0.048,
  // que e o unico plano do bloco virado pra baixo).
  // O +0.0035 em z e o numero critico: naquela altura a face da frente esta em
  // surfaceZ + 0.010, entao a caixa precisa chegar a surfaceZ + 0.0125 pra
  // FURAR o plano e virar fenda. Com a caixa toda dentro (foi a primeira
  // versao) ela ficava invisivel; com 3 mm a mais ela saia pela ponta.
  const mn = matNarina(skin)
  const yN = -0.0355 * S
  const zN = surfaceZ(0, yN)
  for (const sgn of [1, -1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.0072 * S, 0.0080 * S, 0.0100 * S), mn)
    b.position.set(sgn * 0.0130 * S * kw, yN, zN + 0.0035)
    // girada nos dois eixos: narina alinhada com os eixos do mundo denuncia a
    // caixa; inclinada ela le como fenda que aponta pra dentro e pra tras
    b.rotation.set(0.24, sgn * 0.30, 0)
    g.add(flatPiece(b))
  }
  return g
}

// ===========================================================================
// CATALOGO
// ===========================================================================

export const NARIZES = [
  {
    id: 'nenhum', nome: 'Sem nariz', name: 'Sem nariz',
    metodo: 'nenhuma geometria — o slot fica vazio',
    build() { return null },
  },
  {
    id: 'loft', nome: 'Perfilado', name: 'Perfilado',
    metodo: 'loft de secoes superelipticas costuradas num tubo (expoente por secao)',
    build(ctx) {
      useHead(ctx)
      return narizLoft(ctx)
    },
  },
  {
    id: 'pele', nome: 'Modelado na pele', name: 'Modelado na pele',
    metodo: 'calota do proprio cranio puxada por campo gaussiano (sem emenda)',
    build(ctx) {
      useHead(ctx)
      return narizPele(ctx)
    },
  },
  {
    id: 'bloco', nome: 'Facetado', name: 'Facetado',
    metodo: 'Shape do perfil lateral extrudado na largura, afunilado e chanfrado',
    build(ctx) {
      useHead(ctx)
      return narizBloco(ctx)
    },
  },
]

