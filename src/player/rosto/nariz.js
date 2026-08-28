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
// ---------------------------------------------------------------------------
// A ORDEM DO CATALOGO (mexida no passe de correcao — leia antes de reordenar de
// novo). O indice 0 e "sem nariz" e o resto do jogo depende disso; a partir dai
// a ordem e do MELHOR pro mais estilizado, porque defaultAppearance() entrega
// `nariz: 1` pro jogador novo e era o LOFT que caia ali. O loft era o pior dos
// tres na folha de contato de perto, entao quem criava personagem ganhava o
// nariz mais fraco do catalogo sem nunca abrir o customizador.
//
//   0 nenhum   (build devolve null)
//   1 pele     metodo B — o que menos denuncia que e uma peca colada
//   2 loft     metodo A
//   3 bloco    metodo C
//
// A QUANTIDADE nao pode mudar (4): src/comum/protocolo.js manda o INDICE em um
// byte e APARENCIA_OPCOES conta os itens pra validar o pacote.
//
// ---------------------------------------------------------------------------
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
//   - a BASE do nariz tem que ter largura de verdade. Medida pedida: 2.6 a
//     3.2 cm de largura TOTAL na asa. Nem "0", que le como lamina, nem os 6.7 cm
//     que o loft tinha antes — largura demais somada a asa ENTERRADA na pele da
//     no mesmo lugar, porque o que o olho ve nao e o x do vertice, e onde a peca
//     se descola da bochecha.
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
 *   w        MEIA-largura da secao, em unidades de S
 *   cintura  onde a "cintura" da secao (o ponto mais lateral) fica em relacao a
 *            PELE, em metros. Negativo = dentro do cranio, positivo = fora.
 *   proj     quanto o dorso avanca A PARTIR da cintura, em metros
 *   p        expoente da superelipse da metade da frente
 *
 * O QUE ESTAVA ERRADO AQUI (o defeito da folha de contato: "uma lamina vertical
 * fina, uma barbatana saindo do meio da cara"). A tabela antiga tinha w = 0.0252
 * na asa — 6.7 cm de largura TOTAL, o dobro do pedido — e mesmo assim o nariz
 * lia como uma quilha sem base. As duas coisas sao a mesma coisa:
 *
 *   1. a cintura era NEGATIVA em quase toda a tabela (-0.0160 na raiz a -0.0030
 *      na asa). Cintura negativa quer dizer que o ponto mais lateral da secao
 *      mora DENTRO da bochecha; a peca so aparece onde a projecao do dorso
 *      vence o enterro. O resultado e uma crista central saindo da pele lisa,
 *      sem sulco alar, sem lobulo, sem nada que separe nariz de face.
 *   2. como a largura era gigante, esse encontro sem aresta se espalhava por
 *      3.3 cm de cada lado — uma rampa suave que o olho le como bochecha, nao
 *      como asa. Largura no vertice nao e largura no olho.
 *
 * O conserto e o inverso dos dois: w cai pra 0.0120 (3.19 cm de largura total,
 * dentro dos 2.6 a 3.2 pedidos) e a cintura VIRA POSITIVA nas tres ultimas
 * secoes (+0.0032, +0.0055, +0.0048). Com a cintura fora da pele o lobulo da
 * asa e um volume de verdade: a secao sobe da bochecha, faz a volta e mergulha
 * de novo, e a linha onde ela mergulha E o sulco alar.
 *
 * A CANA nao acompanhou a queda: ela vai de 1.8 cm na raiz a 3.2 cm na asa,
 * uma razao de 1.8 (a de um nariz de verdade). A PONTA tambem afinou (0.0094,
 * 2.5 cm) pra asa poder abrir 28% alem dela: se a ponta for tao larga quanto a
 * asa, de frente a asa desaparece atras do bulbo e o nariz volta a nao ter base. Numa primeira tentativa a cana
 * caiu junto pra 1.1 cm e o resultado foi PIOR que o defeito original — uma
 * agulha. Estreitar a cana nao e o que da base ao nariz; a cintura e.
 *
 * O expoente tambem subiu no meio da tabela (era 1.45 a 1.60, agora 1.90 a
 * 2.05). Abaixo de 2 a secao vira losango e o dorso sai como GUME: com o
 * material de pele (roughness 0.68) aquilo pegava um risco especular branco de
 * ponta a ponta. Perto de 2 o dorso continua sendo uma crista, mas com raio.
 *
 * A soma cintura+proj e a projecao alem da pele e ela tem que ser MONOTONA ate
 * a ponta, senao o ponto mais avancado do rosto vira a cana:
 *   -0.0125, -0.0035, +0.0045, +0.0113, +0.0158, +0.0200, +0.0235 (ponta),
 *   +0.0223, +0.0184, +0.0135 (a borda da asa).
 * 2.35 cm na ponta fica dentro da faixa de 1.5 a 3 cm pedida; com 3.5 cm o
 * nariz furava o campo de visao da camera em primeira pessoa.
 * Os 1.35 cm do ULTIMO anel nao sao enfeite: e a profundidade da SOLA. Com os
 * 0.55 cm da primeira tentativa nao sobrava plano virado pra baixo onde as duas
 * narinas coubessem, e elas mediam 7 mm2 vistas de baixo contra os 140 do
 * metodo B.
 */
const SECOES_LOFT = [
  // t      y       w        cintura   proj     p
  [0.00,  0.062, 0.0068, -0.0170, 0.0045, 2.40],
  [0.14,  0.047, 0.0071, -0.0140, 0.0105, 2.10],
  [0.28,  0.032, 0.0076, -0.0120, 0.0165, 1.95],
  [0.42,  0.016, 0.0082, -0.0105, 0.0218, 1.90],
  [0.55,  0.000, 0.0089, -0.0090, 0.0248, 1.95],
  [0.67, -0.014, 0.0088, -0.0060, 0.0260, 2.05],
  [0.78, -0.024, 0.0094, -0.0010, 0.0245, 2.40],
  [0.88, -0.031, 0.0114,  0.0032, 0.0195, 2.70],
  [0.95, -0.036, 0.0120,  0.0055, 0.0138, 2.90],
  [1.00, -0.040, 0.0108,  0.0048, 0.0095, 3.00],
]

/** Profundidade que a metade de TRAS de cada secao enfia no cranio. 3 cm passa folgado do ponto mais raso do catalogo (comprida, base do nariz em z = 0.132). */
const ENTERRO_LOFT = 0.030

const N_ANEL = 20
/**
 * 26 colunas, e nao as 22 de antes. A asa nova mergulha de volta na bochecha em
 * uns 9 graus de volta (a cintura sai 4.6 mm da pele e a metade de tras cai
 * 30 mm por radiano): com 22 colunas cabia UMA aresta nesse mergulho e o sulco
 * alar saia como um degrau. Com 26 cabem duas.
 */
const N_COL = 26

// ---------------------------------------------------------------------------
// A SOLA — a base do nariz, e onde moram as narinas do metodo A.
//
// Antes a base era um cone de um triangulo so (contorno -> um vertice no meio) e
// as narinas eram dois elipsoides enfiados nele. Os elipsoides mal furavam o
// cone e o que aparecia era um risco escuro de 2 mm no fundo da base: na folha
// de contato "nao da pra ver narina" estava literalmente certo.
//
// Agora a base e uma GRADE RADIAL parametrizada em (u, v) — u = 0 no meio,
// u = 1 no ultimo anel do loft; v = a volta, a mesma do anel. Ter uma
// parametrizacao (e nao so um leque) e o que permite as duas coisas que faltavam:
//   - cavar as narinas COMO RELEVO da propria sola (duas gaussianas em (u,v)),
//     em vez de atravessar um corpo estranho por baixo dela;
//   - desenhar o disco escuro da narina NA MESMA funcao, 0.7 mm por fora, entao
//     ele acompanha a cavidade em qualquer cranio sem calibragem nova.
// ---------------------------------------------------------------------------

/** Aneis radiais da sola. 6 e o minimo pra cavidade da narina ter fundo e parede em vez de virar um bico. */
const NR_SOLA = 6
/**
 * Quanto o meio da sola sobe (base concava). E dela que sai a sombra debaixo da
 * ponta — sombra de forma, nao de decalque.
 *
 * 3.5 mm e o TETO util, e o motivo nao e estetico. A sola tem so 6 mm de fundo
 * em z entre o meio e a borda da asa: com 6 mm de subida a rampa da sola fica a
 * 45 graus e, olhada de baixo (o angulo em que se ve narina, uns 38 graus acima
 * da horizontal), ela e uma parede virada PRA LONGE — a base inteira some atras
 * da propria borda. Foi assim que a primeira tentativa desta correcao mediu
 * 0 mm2 de narina visivel. Com 3.5 mm a rampa cai pra 30 graus e a sola aparece.
 */
const CONC_SOLA = 0.0035
/** Onde a narina fica no raio da sola (0 = meio, 1 = borda). 0.56 poe o centro dela a 6 mm do eixo, 40% da meia-largura da asa. */
const U_NARINA = 0.56
/** E na volta: 0.145 = 52 graus fora do meio. O que sobra entre as duas e a columela. */
const V_NARINA = 0.145
/** Raios da CAVIDADE. Largos de proposito: ver PROF_NARINA. */
const RU_NARINA = 0.44
const RV_NARINA = 0.125
/**
 * Fundo da cavidade da narina, em metros.
 * Mesma armadilha da CONC_SOLA, so que pior: a narina mede uns 5 mm em z, entao
 * uma cavidade de 7 mm tem parede a 70 graus e o proprio labio da frente tapa o
 * fundo dela. 2.6 mm sobre um buraco largo e o que se ve de baixo; e a mesma
 * proporcao rasa que o metodo B usa (-0.0034 sobre 15 mm de campo) e que na
 * folha de contato leu como narina de verdade.
 */
const PROF_NARINA = 0.0026
/** Raio do DISCO escuro dentro da cavidade (um pouco menor que a cavidade, pra sobrar borda de pele). */
const RU_DISCO = 0.34
const RV_DISCO = 0.095
/** Folga do disco escuro sobre a sola, na direcao da NORMAL dela (nao em -y: onde a sola inclina, um empurrao em -y nao tira o disco de dentro dela). */
const FOLGA_NARINA = 0.0007

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
      // metade de tras com inclinacao fixa (esta enterrada, ninguem a ve; o que
      // importa la e nao gastar triangulo em forma que nao aparece). Nas secoes
      // de cintura POSITIVA e este trecho que desce da asa de volta pra
      // bochecha: ele cruza a pele uns 9 graus depois do ponto mais lateral, e
      // essa linha de cruzamento e o sulco alar.
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

  // -------------------------------------------------------------------------
  // A SOLA, no MESMO buffer do tubo.
  //
  // Por que no mesmo buffer e nao numa malha propria: o ultimo anel do loft e
  // literalmente a borda da sola, e reaproveitar os vertices dele (em vez de
  // copiar) mantem a malha FECHADA — o smoke do nariz cobra que toda aresta de
  // borda esteja enterrada no cranio, e uma base solta deixaria 26 arestas
  // abertas a 9 mm da pele. O preco e que a aresta entre a face da frente e a
  // sola sai suavizada em vez de viva; duplicar os vertices pra ter a aresta
  // devolveria a LISTRA de costura (CONTRATO 4), que e pior.
  // -------------------------------------------------------------------------
  const ult = aneis[N_ANEL - 1]
  const rx = [], rz = []
  for (let c = 0; c < N_COL; c++) { const k = ult[c] * 3; rx.push(pos[k]); rz.push(pos[k + 2]) }
  const zSolaC = zcUlt - 0.0015

  /** Distancia na volta (v e circular: 0.98 e 0.02 sao vizinhos). */
  const distV = (v, vn) => { const d = Math.abs(v - vn); return d > 0.5 ? 1 - d : d }

  function alturaSola(u, v) {
    // concavidade geral: sobe indo pro meio e vale exatamente yUlt na borda,
    // que e o que faz a sola casar com o anel do loft sem degrau
    let y = yUlt + CONC_SOLA * (1 - u) * (1 - u)
    // a cavidade da narina tem que morrer ANTES da borda, senao ela puxaria o
    // proprio contorno da asa pra dentro e o sulco alar sumia
    const fade = 1 - smoothstep(0.80, 1.0, u)
    if (fade > 0) {
      const du = (u - U_NARINA) / RU_NARINA
      const a = distV(v, V_NARINA) / RV_NARINA
      const b = distV(v, 1 - V_NARINA) / RV_NARINA
      y += PROF_NARINA * fade * Math.exp(-du * du) * (Math.exp(-a * a) + Math.exp(-b * b))
    }
    return y
  }

  const _ps = new THREE.Vector3()
  /** Ponto da sola em (u, v). v e interpolado ENTRE colunas do anel, entao a narina nao fica presa na grade. */
  function pontoSola(u, v, out) {
    const vv = v - Math.floor(v)
    const f = vv * N_COL
    const c0 = Math.floor(f) % N_COL
    const c1 = (c0 + 1) % N_COL
    const tt = f - Math.floor(f)
    const X = rx[c0] + (rx[c1] - rx[c0]) * tt
    const Z = rz[c0] + (rz[c1] - rz[c0]) * tt
    return out.set(X * u, alturaSola(u, vv), zSolaC + (Z - zSolaC) * u)
  }

  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3()
  const _sc = new THREE.Vector3(), _sn = new THREE.Vector3()
  /**
   * O mesmo ponto, empurrado `fora` na direcao da NORMAL da sola (pra baixo).
   * A normal sai de diferenca finita nas duas tangentes; cross(radial, angular)
   * aponta pra CIMA nesta parametrizacao, dai o sinal negativo.
   */
  function pontoSolaFora(u, v, fora, out) {
    pontoSola(u, v, out)
    pontoSola(u + 0.02, v, _sa)
    pontoSola(u - 0.02, v, _sb)
    _sa.sub(_sb)
    pontoSola(u, v + 0.01, _sb)
    pontoSola(u, v - 0.01, _sc)
    _sb.sub(_sc)
    _sn.crossVectors(_sa, _sb)
    if (_sn.lengthSq() > 1e-14) out.addScaledVector(_sn.normalize(), -fora)
    return out
  }

  const linhasSola = [[put(0, alturaSola(0, 0), zSolaC)]]
  for (let r = 1; r < NR_SOLA; r++) {
    const linha = []
    for (let c = 0; c < N_COL; c++) {
      pontoSola(r / NR_SOLA, c / N_COL, _ps)
      linha.push(put(_ps.x, _ps.y, _ps.z))
    }
    linhasSola.push(linha)
  }
  linhasSola.push(ult)
  // (meio, seguinte, atual) e a ordem que poe a normal pra BAIXO: a sola e a
  // unica parte do nariz que se ve por baixo, e com a volta na ordem oposta ela
  // some (material de uma face so) e o nariz fica com um buraco na base.
  for (let r = 0; r < linhasSola.length - 1; r++) {
    const A = linhasSola[r], B = linhasSola[r + 1]
    if (A.length === 1) {
      for (let c = 0; c < N_COL; c++) idx.push(A[0], B[(c + 1) % N_COL], B[c])
      continue
    }
    for (let c = 0; c < N_COL; c++) {
      const c1 = (c + 1) % N_COL
      idx.push(A[c], B[c1], B[c], A[c], A[c1], B[c1])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  // sem soldarNormais de proposito: o anel fecha com (c+1) % N_COL, entao nao ha
  // coluna duplicada e nao ha listra de costura pra soldar.
  g.add(sh(new THREE.Mesh(geo, matPele(skin))))

  // Narinas: dois discos da PROPRIA sola, 0.7 mm por fora dela, em material
  // escuro. Sao a mesma funcao pontoSola() da base — entao nao existe o risco
  // da versao anterior, em que a narina era um elipsoide separado que ora nao
  // furava a base (invisivel) ora furava a ponta do nariz. O que faz o disco ler
  // como buraco e a cavidade que alturaSola() ja cavou debaixo dele: 2.6 mm de
  // desnivel contra a sola vizinha, medidos pra caber no angulo de quem olha de
  // baixo (ver PROF_NARINA).
  const pos2 = []
  const idx2 = []
  const put2 = (x, y, z) => { const i = pos2.length / 3; pos2.push(x, y, z); return i }
  const NRN = 4, NCN = 12
  for (const vn of [V_NARINA, 1 - V_NARINA]) {
    const base = pos2.length / 3
    pontoSolaFora(U_NARINA, vn, FOLGA_NARINA, _ps)
    put2(_ps.x, _ps.y, _ps.z)
    for (let r = 1; r <= NRN; r++) {
      const q = r / NRN
      for (let c = 0; c < NCN; c++) {
        const a = (c / NCN) * Math.PI * 2
        // elipse esticada no RAIO da sola: a narina real e uma fenda que aponta
        // pra columela, e um circulo perfeito aqui le como bolinha de tinta
        pontoSolaFora(U_NARINA + RU_DISCO * q * Math.cos(a), vn + RV_DISCO * q * Math.sin(a), FOLGA_NARINA, _ps)
        put2(_ps.x, _ps.y, _ps.z)
      }
    }
    for (let c = 0; c < NCN; c++) idx2.push(base, base + 1 + (c + 1) % NCN, base + 1 + c)
    for (let r = 1; r < NRN; r++) {
      const A = base + 1 + (r - 1) * NCN, B = base + 1 + r * NCN
      for (let c = 0; c < NCN; c++) {
        const c1 = (c + 1) % NCN
        idx2.push(A + c, B + c1, B + c, A + c, A + c1, B + c1)
      }
    }
  }
  const geo2 = new THREE.BufferGeometry()
  geo2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3))
  geo2.setIndex(idx2)
  geo2.computeVertexNormals()
  geo2.computeBoundingSphere()
  // flatPiece e nao sh: casca colada na sola com 0.6 mm de folga projetando
  // sombra em si mesma vira mancha preta que pisca (CONTRATO 7).
  g.add(flatPiece(new THREE.Mesh(geo2, matNarina(skin))))
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
 *
 * O QUE ESTAVA ERRADO (folha de contato: "um cone claro e quase translucido com
 * um BLOCO ESCURO na base saindo pra fora, que nao encosta na pele do labio
 * superior"). O perfil antigo caia de 2.32 cm de avanco na ponta pra 0.4 cm na
 * base em 2 cm de altura: a "base" do nariz era uma rampa quase VERTICAL, e nao
 * existia nenhum plano virado pra baixo onde uma narina pudesse morar. Por isso
 * as duas caixas escuras tinham que sair PRA FORA do bloco pra aparecer — e uma
 * caixa que sai do volume nao le como narina, le como peca solta pendurada.
 *
 * A correcao e dar SOLA ao nariz: do canto externo da asa (-0.0392) ate o fim
 * (-0.0424) a base desce 4.3 mm de altura enquanto anda 14.2 mm pra tras, ou
 * seja um plano quase deitado, amostrado em CINCO pontos — a amostragem existe pra esse plano poder ser
 * CAVADO depois (as narinas sao um relevo dele, ver a passada de vertices).
 * O ultimo ponto ja e negativo: a sola termina ATRAS da pele, entao ela encosta
 * no labio superior em vez de flutuar na frente dele.
 */
const PERFIL_BLOCO = [
  [0.0620, -0.0110],
  [0.0470, -0.0030],
  [0.0320,  0.0060],
  [0.0160,  0.0125],
  [0.0000,  0.0180],
  [-0.0140, 0.0215],
  [-0.0240, 0.0232],
  [-0.0300, 0.0200],
  [-0.0350, 0.0140],
  [-0.0392, 0.0092],
  [-0.0402, 0.0066],
  [-0.0410, 0.0040],
  [-0.0416, 0.0012],
  [-0.0420, -0.0018],
  [-0.0424, -0.0050],
]

/**
 * Afunilamento: [-y em unidades de S, fator de largura].
 * A chave e -y so pra tabela ficar crescente (porChave exige isso).
 * O salto de 0.85 pra 1.00 entre a ponta e a asa e o afunilamento pedido: e
 * dele que sai a aresta viva onde a asa se descola da lateral do dorso.
 *
 * A raiz subiu de 0.26 pra 0.50: com 0.26 o bloco saia da testa com 9 mm de
 * largura e abria pra 33 — quase 4 vezes, e de frente isso nao le como nariz,
 * le como CONE, que foi a palavra usada na folha de contato. Com 0.50 a razao
 * raiz/asa cai pra 2.0 e o dorso vira uma cana de largura quase constante, com
 * a asa abrindo so nos ultimos 8 mm de altura.
 */
const LARGURA_BLOCO = [
  [-0.0620, 0.50],
  [-0.0470, 0.52],
  [-0.0320, 0.56],
  [-0.0160, 0.62],
  [0.0000,  0.68],
  [0.0140,  0.76],
  [0.0240,  0.85],
  [0.0350,  1.00],
  [0.0424,  0.88],
]

/**
 * Largura TOTAL do bloco na asa. Era 0.052 * S = 6.9 cm, o dobro do que um
 * nariz ocupa numa cara: com a sola nova aparecendo, 6.9 cm viravam um pedestal.
 * O numero e a largura do MIOLO: o chanfro poe mais 2 mm de cada lado, entao
 * 0.0216 * S = 2.87 cm de miolo fecha em 3.4 cm de asa medida na caixa. Fica na
 * faixa pedida (2.6 a 3.2 pro loft; o bloco sai 4 mm mais largo de proposito,
 * pra os dois nao lerem como o mesmo nariz de material diferente).
 */
const LARG_BLOCO = 0.0216 * S
/** Quanto a face de tras do bloco enfia no cranio. */
const ENTERRO_BLOCO = 0.026
/** Chanfro. 2 mm: abaixo disso a aresta serrilha na distancia de jogo, acima o bloco perde os planos e volta a ser bolota. */
const CHANFRO = 0.0020 * S

/** Altura de referencia da sola (onde as narinas sao cavadas). */
const Y_SOLA_BLOCO = -0.0408 * S
/** Onde a cavidade da narina comeca a valer, em altura. Acima disso a asa fica intacta. */
const Y_TETO_SOLA = -0.0330 * S
/** Centro e raios da cavidade da narina no plano da sola, em metros. */
const X_NARINA_BLOCO = 0.0055 * S
const RX_NARINA_BLOCO = 0.0042 * S
const DZ_NARINA_BLOCO = 0.0048
const RZ_NARINA_BLOCO = 0.0042
/** Fundo da cavidade. 7.5 mm e o que faz a caixa escura caber DENTRO dela com folga. */
const PROF_NARINA_BLOCO = 0.0075

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

  // steps: 14 nao e enfeite, e o que faz o metodo funcionar. Com o extrude
  // padrao (1 passo) a peca so tem vertice nas DUAS pontas da largura: o
  // afunilamento de profundidade la embaixo achatava o dorso inteiro no valor
  // da lateral e o nariz saia com 1 cm de projecao no lugar de 2.3, sem crista
  // nenhuma. As 15 camadas poem um vertice em x = 0 (a crista do dorso) e dao
  // resolucao pras duas cavidades de narina serem cavadas na sola — com os 6
  // passos antigos cada narina tinha 1.5 coluna e virava um entalhe reto.
  const geo = new THREE.ExtrudeGeometry(s2, {
    depth: LARG_BLOCO, steps: 14, bevelEnabled: true,
    bevelThickness: CHANFRO, bevelSize: CHANFRO, bevelSegments: 2, curveSegments: 1,
  })
  // (x,y,z) -> (-z, y, x): a profundidade do Shape vira Z do mundo e o eixo do
  // extrude vira X. Determinante +1, entao a orientacao dos triangulos (e a
  // sombra) continua certa; um espelho simples inverteria as normais.
  geo.rotateY(-Math.PI / 2)
  geo.translate(LARG_BLOCO / 2, 0, 0)

  const meia = LARG_BLOCO / 2
  const zNar = surfaceZ(0, Y_SOLA_BLOCO) + DZ_NARINA_BLOCO
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
    const nx = x * f * kw
    let ny = y
    let nz = zb + (z - zb) * (1 - 0.26 * u * u)
    // AS NARINAS DESTE METODO SAO RELEVO DA SOLA, nao uma peca por cima dela:
    // duas gaussianas empurram o plano subnasal pra DENTRO do bloco (+y) e um
    // pouco pra tras. A mascara em altura garante que a asa e o dorso nao se
    // mexem — quem sobe e so o plano virado pra baixo.
    const m = smoothstep(Y_TETO_SOLA, Y_SOLA_BLOCO - 0.0002, ny)
    if (m > 0) {
      const dx = (Math.abs(nx) - X_NARINA_BLOCO * kw) / (RX_NARINA_BLOCO * kw)
      const dz = (nz - zNar) / RZ_NARINA_BLOCO
      const cav = PROF_NARINA_BLOCO * m * Math.exp(-dx * dx - dz * dz)
      ny += cav
      nz -= cav * 0.45
    }
    p.setXYZ(i, nx, ny, nz)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  // flatShading aqui e SEGURO (e o ponto do metodo): o bloco nao e uma casca
  // colada na pele curva — a unica emenda dele esta 2.6 cm dentro do cranio.
  g.add(sh(new THREE.Mesh(geo, solid(skin, 0.68, 0.0, { flatShading: true }))))

  // Narinas em CAIXA, pra combinar com o metodo — mas agora DENTRO da cavidade
  // que a passada acima cavou, e nao penduradas embaixo do nariz.
  // A regra que a versao anterior quebrava: nenhum vertice da caixa pode ficar
  // abaixo da sola nem fora da largura do bloco. Aqui a caixa mede 8 x 6.9 x
  // 9.3 mm, o centro fica 6 mm acima da sola e a metade inferior dela ainda
  // sobra 2 mm ACIMA do plano de fora — ou seja, o escuro aparece afundado no
  // buraco, que e o que faz ler como narina em vez de retangulo colado.
  const mn = matNarina(skin)
  for (const sgn of [1, -1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.0060 * S, 0.0052 * S, 0.0070 * S), mn)
    b.position.set(sgn * X_NARINA_BLOCO * kw, Y_SOLA_BLOCO + 0.0040, zNar + 0.0004)
    // girada nos dois eixos: narina alinhada com os eixos do mundo denuncia a
    // caixa; inclinada ela le como fenda que aponta pra dentro e pra tras
    b.rotation.set(0.20, sgn * 0.32, 0)
    g.add(flatPiece(b))
  }
  return g
}

// ===========================================================================
// CATALOGO
//
// A ordem e o contrato de rede: o indice viaja em um byte e APARENCIA_OPCOES
// (src/comum/protocolo.js) conta QUANTOS itens existem. Reordenar e permitido,
// acrescentar ou remover nao — quatro itens, sempre.
// ===========================================================================

export const NARIZES = [
  {
    id: 'nenhum', nome: 'Sem nariz', name: 'Sem nariz',
    metodo: 'nenhuma geometria — o slot fica vazio',
    build() { return null },
  },
  {
    // INDICE 1 = o padrao de defaultAppearance(). Fica com o metodo B porque e o
    // unico que nao tem emenda nenhuma com a pele em nenhum dos seis cranios:
    // e o nariz certo pra quem nunca vai abrir o customizador.
    id: 'pele', nome: 'Modelado na pele', name: 'Modelado na pele',
    metodo: 'calota do proprio cranio puxada por campo gaussiano (sem emenda)',
    build(ctx) {
      useHead(ctx)
      return narizPele(ctx)
    },
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
    id: 'bloco', nome: 'Facetado', name: 'Facetado',
    metodo: 'Shape do perfil lateral extrudado na largura, afunilado e chanfrado',
    build(ctx) {
      useHead(ctx)
      return narizBloco(ctx)
    },
  },
]
