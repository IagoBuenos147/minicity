import * as THREE from 'three'
import {
  HEAD, HEAD_S, activeHead, useHead,
  eggSurface, eggNormal, pontoNaPele,
  scalp, headShell, hairMat, peloMat,
  hairColorFrom, skinOf, mixHex, shade,
  byAz, clamp, smoothstep, gauss, rng,
  sh, soldarNormais, tecelagem, fio,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/cabelo.js — TRES CORTES, TRES METODOS DE CONSTRUCAO.
//
// O diagnostico do dono foi "cabeca de balao sem vida": o cabelo antigo era
// sempre a MESMA coisa — scalp() com um s constante e uma linha em theta. Casca
// de espessura constante le como TOUCA DE NATACAO em qualquer angulo, porque a
// silhueta dela e a silhueta do cranio deslocada 4 mm. O que faz cabelo parecer
// cabelo e (1) volume que muda de lugar pra lugar, (2) borda recortada e
// (3) separacao entre mecha e mecha. Cada corte aqui ataca isso por um caminho
// estruturalmente diferente, que e o pedido: tres jeitos pra escolher qual casa
// com o jogo, e nao o mesmo jeito com outro numero.
//
//   A 'esculpido'  MALHA PROPRIA COM CAMPO DE VOLUME. Uma grade loftada
//                  (colunas em az x linhas ate a linha do corte) onde cada
//                  vertice recebe um s(theta, az) proprio: topete na frente,
//                  coroa no alto, risca lateral cavada, laterais rentes e
//                  tufos na borda. Nao existe "espessura do cabelo" — existe um
//                  campo. E a base de qualquer corte curto e a que melhor
//                  acompanha os 6 cranios.
//   B 'mechas'     TIRAS DE QUADS. ~180 mechas que CAMINHAM na superficie do
//                  cranio (andam em theta, derivam em az) e se afastam pela
//                  normal conforme avancam. Cada mecha e uma faixa curva de
//                  DoubleSide. E o que da silhueta recortada e separacao —
//                  casca nenhuma da isso. Casca base fina escura por baixo,
//                  senao aparece couro cabeludo entre as mechas.
//   C 'raspado'    CASCAS CONCENTRICAS + FIO DE VERDADE. Tres headShell()
//                  deslocadas por ruido ao longo da PROPRIA NORMAL: como a
//                  amplitude do ruido e maior que o vao entre elas, a casca de
//                  fora so aparece em manchas — densidade decrescente sem
//                  precisar de alpha. Os fios reais (tecelagem+fio) entram so
//                  na BORDA, que e onde o olho procura a transicao pele/cabelo.
//
// DUAS REGRAS VALEM PROS TRES E ESTAO IMPLEMENTADAS UMA VEZ SO AQUI EM CIMA:
//
//   1. LINHA DE CORTE DECLARADA EM ALTURA, NAO EM THETA. Um theta fixo de 0.55
//      cai na testa da cabeca redonda (yTop 0.95) e no MEIO DA CALOTA da
//      comprida (yTop 1.18): a mesma constante da franja de um e careca do
//      outro. thetaNaAltura() inverte yAt() do cranio ativo, entao a linha
//      declarada em metros cai na mesma altura anatomica nos 6.
//   2. PISO DA TESTA. A sobrancelha mora em 0.096*S e franja comendo
//      sobrancelha e o bug classico. PISO_Y e um teto duro por azimute
//      (0.133*S na testa, liberando conforme anda pro lado e pra nuca, onde
//      cabelo comprido TEM que cair). Cada metodo clampa contra ele — e barato
//      e vale mesmo se alguem mexer nos parametros de fluxo depois.
//
// ---------------------------------------------------------------------------
// PASSE DE CORRECAO — os tres defeitos que a folha de contato (p1..p4) mostrou
// nos TRES cortes ao mesmo tempo, e o que foi feito com cada um:
//
//   1. "V" NO MEIO DA TESTA. As quatro tabelas de linha do cabelo deste arquivo
//      declaravam o MEIO da testa mais BAIXO que os cantos: esculpido 0.1425*S
//      em az 0 contra 0.1560*S em az 0.42; raspado 0.1470 contra 0.1600; casca
//      do repicado 0.1560 contra 0.1620; ponta das mechas 0.1370 contra 0.1400.
//      Como byAz le |az|, o resultado nao era bico de viuva (que e assimetrico e
//      estreito): era um ENTALHE simetrico — no cranio redondo o centro caia
//      1.8 cm abaixo dos cantos — e isso le como erro de recorte, nao como
//      entrada de cabelo. Agora as quatro tabelas tem PLATO no centro (o ponto
//      mais ALTO da frente) e caem monotonicamente ate a tempora, que e a forma
//      de uma linha do cabelo de verdade.
//
//   2. CAPACETE. Duas causas somadas. (a) As linhas desciam demais: a casca do
//      esculpido terminava em -0.070*S (abaixo da boca) dos lados e na nuca, e a
//      ponta das mechas ia a -0.140*S, que e a ALTURA DO QUEIXO — a peca fechava
//      em volta da cabeca com um buraco pro rosto. Todas as linhas laterais e de
//      nuca subiram, com um vale na frente da orelha (a patilha) e uma subida
//      POR CIMA dela: e esse degrau que quebra o anel. (b) A linha de corte era
//      uma curva limpa. Agora toda linha e modulada por DUAS senoides de periodo
//      inteiro diferente (periodo inteiro = sem degrau na nuca) e cada metodo usa
//      um par proprio, entao os tres nao ondulam iguais. Por cima disso os
//      metodos A e C ganharam uma FAIXA DE FIOS soltos na borda; o metodo B nao
//      leva fio porque a borda dele ja E feita de mechas soltas — por a fio ali
//      seria repetir o proprio metodo.
//
//   3. "CHIFRE" NA TESTA (cortes 1 e 2). No A o termo de topete valia +0.065 de
//      s numa gaussiana estreita centrada em az 0 — 2.4 cm de casca saindo num
//      ponto so no alto da testa, contra 1.1 cm na coroa ao lado: um caroco, nao
//      um topete. Virou +0.030 numa gaussiana bem mais larga e deslocada pro
//      lado (az 0.22), o que espalha o volume e da lado ao penteado. No B a
//      franja varrida nascia em `Math.max(0.12, raiz(az) - 0.34 + ...)`: como
//      raiz(az) na testa vale ~0.33 rad, a subtracao de 0.34 mandava TODAS as 24
//      mechas pro clamp de 0.12 — ou seja, brotando a 1,7 cm do alto da cabeca —
//      e com `alt` de ate 16 mm elas saiam pra frente de la. Agora nascem junto
//      da linha do cabelo (raiz - 0.10) e com `alt` de 4 a 9 mm: franja varrida
//      rente, no lugar onde franja mora.
// ---------------------------------------------------------------------------

const S = HEAD_S

/**
 * theta (0 = topo) em que uma casca de escala `s` cruza a altura `y`.
 * E a inversa exata de yAt(): y = HEAD.ry * (yTop*(uy+1) - 1) * s.
 */
function thetaNaAltura(y, s = 1) {
  const sp = activeHead()
  const uy = clamp((y / (s * HEAD.ry) + 1) / sp.yTop - 1, -1, 1)
  return Math.acos(uy)
}

/** Linha de corte declarada em ALTURA (metros), convertida pro cranio ativo. */
function linhaPorAltura(pares, s = 1) {
  const alt = byAz(pares)
  return (az) => thetaNaAltura(alt(az), s)
}

/**
 * Ate onde o cabelo pode descer em cada azimute. E um BACKSTOP, nao um estilo:
 * a forma do corte sai das tabelas de linha de cada metodo, e este piso so
 * existe pra segurar quem baixar aquelas constantes demais depois.
 *
 * O plato de 0.133*S vale ate 0.55 rad — o canto externo do olho esta em
 * atan2 0.60 — e la ele fica 4.9 cm acima da sobrancelha (0.096*S). Passando
 * dali ja e tempora/costeleta e o cabelo TEM que descer: e a entrada do "M".
 * Na nuca o valor e absurdo de proposito (-0.60 m) porque la nao existe limite
 * util — cabelo comprido cai no ombro e clampar isso cortaria a cortina do B.
 *
 * A RAMPA importa tanto quanto o plato. A versao anterior ia direto de
 * [0.62, 0.133*S] pra [1.05, 0.010*S], e como byAz interpola por smoothstep a
 * curva ficava colada no plato ate ~0.85 — ACIMA das linhas de corte deste
 * arquivo por ate 29.5 mm entre az 0.57 e 1.33. O piso, e nao o desenho, e que
 * decidia a tempora.
 *
 * Os nos abaixo passam por BAIXO da mais baixa das linhas em todo o intervalo —
 * o piso e backstop e nenhuma delas e recortada por ele no caso normal.
 */
const PISO_Y = byAz([
  [0.55, 0.133 * S],
  [0.75, 0.062 * S],
  [0.90, 0.012 * S],
  [1.05, -0.002 * S],
  [1.25, -0.050 * S],
  [1.45, -0.070 * S],
  [Math.PI, -0.60],
])

const _g = new THREE.Vector3()

/**
 * O azimute GEOMETRICO (atan2(x, z)) do azimute PARAMETRICO `az` em `theta`.
 *
 * PISO_Y esta declarado em azimute geometrico — ele ancora o fim do plato numa
 * POSICAO, o canto externo do olho em "x = 0.11, z = 0.16". Mas eggSurface
 * recebe o azimute parametrico, e os dois so coincidem quando fx == fz. Na
 * cabeca comprida (kx 0.88, kz 0.99) o parametrico 0.65 pousa em atan2 0.607:
 * o codigo achava que ja tinha saido do setor do olho e liberava o piso, e a
 * borda descia 2.9 mm ABAIXO do proprio limite ainda dentro do setor.
 *
 * A conversao sai do ponto que a propria superficie devolve — nao ha segunda
 * copia da conta do cranio aqui, so uma leitura a mais de eggSurface.
 */
function azGeo(theta, az) {
  eggSurface(theta, az, 1, _g)
  return Math.atan2(_g.x, _g.z)
}

/**
 * ONDULACAO DA LINHA DE CORTE — a peca que faltava pra matar o capacete.
 *
 * Uma linha de corte que e uma curva suave em az sai da renderizacao como aro
 * de plastico: a silhueta do cabelo passa a ser um circulo deslocado, e o olho
 * le "casco". Duas senoides de PERIODO INTEIRO DIFERENTE somadas dao uma borda
 * que nunca repete o mesmo desenho em dois lugares e mesmo assim fecha a volta
 * sem degrau na nuca (periodo inteiro => periodica em 2*PI).
 *
 * Periodo inteiro tambem e o motivo de NAO usar |az| aqui: com o angulo com
 * sinal os dois lados da cabeca ondulam diferente, o que sozinho ja tira a cara
 * de boneco de vitrine. Cada corte usa um par proprio (2/3, 3/5, 4/7) — a onda
 * e do metodo, nao do arquivo.
 */
function ondaDeCorte(a1, p1, f1, a2, p2, f2) {
  return (az) => a1 * Math.sin(az * p1 + f1) + a2 * Math.sin(az * p2 + f2)
}

/**
 * Linha declarada em ALTURA + onda + teto do piso, em theta do cranio ativo.
 * O teto vem DEPOIS da onda de proposito: assim nenhum vale da senoide escapa
 * pro lado de baixo da sobrancelha.
 */
function bordaOndulada(pares, s, onda) {
  const alt = byAz(pares)
  return (az) => {
    const th = thetaNaAltura(alt(az), s) + onda(az)
    const teto = thetaNaAltura(PISO_Y(azGeo(th, az)), s)
    return th > teto ? teto : th
  }
}

/**
 * Ruido de PRODUTO de senos. Produto e nao soma de proposito: soma vira onda
 * (padrao de listra), produto vira mancha isolada — que e o formato de tufo de
 * cabelo. E funcao continua da POSICAO, entao a mesma mancha cai no mesmo lugar
 * em qualquer topologia e nao existe costura pra remendar.
 */
function grao(x, y, z) {
  return Math.sin(x * 12.9 + y * 4.1 + 1.7)
    * Math.sin(y * 9.7 + z * 5.3 + 0.4)
    * Math.sin(z * 8.3 + x * 6.7 + 2.9)
}

// ---------------------------------------------------------------------------
// METODO A — CASCA ESCULPIDA POR CAMPO DE VOLUME
//
// Por que uma malha propria e nao scalp(): scalp() nasce de uma SphereGeometry
// inteira e joga fora tudo abaixo da linha COLAPSANDO os vertices nela. Num
// corte social isso e 60% dos triangulos empilhados num anel degenerado, e o
// que sobra distribui as linhas por theta absoluto — a borda, que e onde o
// recorte precisa de resolucao, fica com o mesmo passo do alto da cabeca.
// Aqui cada coluna de az e loftada do polo ATE A PROPRIA linha de corte, com as
// linhas concentradas perto da borda (1 - (1-t)^1.35). Zero triangulo
// degenerado, borda com o dobro de resolucao e metade do custo.
// ---------------------------------------------------------------------------

/**
 * A LINHA DO CABELO do corte social, em altura.
 *
 * O que quebrou: o no de az 0 estava em 0.1425*S e o de az 0.42 em 0.1560*S, ou
 * seja o cabelo descia 1.8 cm A MAIS no meio da testa do que nos cantos. Isso
 * nao e entrada de cabelo, e um entalhe — e como byAz e simetrico em |az| ele
 * saia igualzinho dos dois lados, que e a assinatura de erro de recorte.
 *
 * Agora: PLATO no centro ate 0.34 rad (o trecho reto que toda testa tem), queda
 * ate a tempora, VALE na frente da orelha (a patilha, o ponto mais baixo da
 * frente) e uma SUBIDA por cima da orelha antes de descer pra nuca. Esse degrau
 * em 1.28/1.62 e o que impede a casca de fechar como um aro em volta da cabeca:
 * a orelha fica de fora e a silhueta lateral tem dois cantos em vez de um arco.
 */
const LINHA_ESCULPIDO = linhaPorAltura([
  [0.00, 0.1520 * S],  // meio da testa: PLATO, o ponto mais alto da frente
  [0.34, 0.1500 * S],
  [0.66, 0.1290 * S],  // canto da testa comecando a cair
  [0.95, 0.0820 * S],  // tempora
  [1.28, 0.0180 * S],  // patilha, na frente da orelha: o ponto mais baixo
  [1.62, 0.0300 * S],  // sobe POR CIMA da orelha — o degrau que quebra o aro
  [2.20, -0.0180 * S],
  [Math.PI, -0.0460 * S],
])

/**
 * O campo de volume. u = theta/linha (0 no polo, 1 na borda) em vez de theta
 * cru: assim o topete cai no mesmo ponto do penteado nos 6 cranios, mesmo que
 * a borda deles esteja em thetas bem diferentes.
 */
function volumeEsculpido(u, th, az) {
  const a = az < 0 ? -az : az
  let s = 1.028
  s += 0.034 * gauss(th, 0.20, 0.62)                                // coroa: massa no alto
  // TOPETE. Valia 0.065 numa gaussiana de largura 0.26 em u e 0.72 em az, tudo
  // centrado em az 0: dava 24 mm de casca num ponto so no alto da testa contra
  // 11 mm na coroa ao lado — o "chifre" da folha de contato. Amplitude pela
  // metade, gaussianas bem mais largas e o centro deslocado pra 0.22 rad: o
  // volume vira uma onda varrida pra um lado (o mesmo lado da risca abaixo) em
  // vez de um caroco simetrico no meio.
  s += 0.030 * gauss(u, 0.46, 0.36) * gauss(az, 0.22, 0.95)
  s += 0.020 * gauss(u, 0.70, 0.30) * smoothstep(1.5, 2.6, a)       // volume na nuca
  // Risca lateral DE VERDADE: gauss no az COM SINAL, so no lado direito. Com
  // |az| o penteado sai espelhado e vira franja simetrica — o defeito que o
  // catalogo antigo tinha em todo corte que usava byAz.
  s -= 0.030 * gauss(az, 0.60, 0.11) * smoothstep(1.02, 0.10, u)
  s -= 0.022 * smoothstep(0.90, 1.50, a) * u                        // laterais rentes
  // Tufos: lobulos de periodo 9 logo acima da borda. Sao eles que fazem a
  // silhueta do corte ondular em vez de sair como aro de capacete.
  s += 0.018 * gauss(u, 0.86, 0.11) * (0.5 + 0.5 * Math.sin(az * 9 + 2.0))
  // A borda tem que AFINAR ate quase encostar na pele. Casca aberta terminando
  // com 1 cm de espessura mostra a face de dentro (o material e DoubleSide) e
  // le como aba de plastico; a 1.004 a emenda vira um fio de 0.7 mm.
  return 1.004 + (s - 1.004) * smoothstep(1.00, 0.80, u)
}

/**
 * Ruido da borda, em radianos de theta.
 *
 * O que quebrou: as tres frequencias eram 7, 11 e 17 — ondinha fina. Fina
 * demais pra silhueta: de longe ela some no antialias e o que sobra e o
 * contorno da curva base, ou seja o aro. A energia foi redistribuida (o total
 * continua ~0.07 rad, nao ha borda mais agressiva do que antes) botando a maior
 * parte em PERIODO 2 e 3, que e a escala em que o olho le "mecha" — e as tres
 * finas ficaram como grao por cima.
 *
 * As fases quebradas (0.9, -2.1) fazem os dois lados da cabeca receberem ondas
 * diferentes: o angulo aqui e COM SINAL, ao contrario do teto de piso.
 * Amplitude MENOR na frente (k): no setor da testa sobra 1 cm ate o piso, e um
 * dente de 6 mm ali ja passaria por franja caida na sobrancelha.
 */
function recorteDaBorda(az) {
  const a = az < 0 ? -az : az
  const k = 0.35 + 0.65 * smoothstep(0.5, 1.3, a)
  const largo = 0.026 * Math.sin(az * 2 + 0.9) + 0.017 * Math.sin(az * 3 - 2.1)
  const fino = 0.014 * Math.sin(az * 7 + 1.1)
    + 0.010 * Math.sin(az * 11 + 2.6)
    + 0.007 * Math.sin(az * 17 + 0.4)
  return k * (largo + fino)
}

/** Onde a casca do metodo A termina, ja com o teto do piso aplicado. */
function bordaEsculpida(az) {
  const lim = LINHA_ESCULPIDO(az) + recorteDaBorda(az)
  const teto = thetaNaAltura(PISO_Y(azGeo(lim, az)))
  return lim > teto ? teto : lim
}

function cascaEsculpida(cor) {
  const COLS = 72, LINHAS = 16
  const pos = []
  const idx = []
  const p = new THREE.Vector3()

  // Polo UNICO compartilhado pelas 72 colunas. Um leque de 72 vertices na mesma
  // posicao daria 72 normais diferentes e um ponto aceso no alto da cabeca.
  eggSurface(0, 0, volumeEsculpido(0, 0, 0), p)
  pos.push(p.x, p.y, p.z)

  for (let i = 0; i < COLS; i++) {
    const az = -Math.PI + ((i + 0.5) / COLS) * Math.PI * 2
    const lim = bordaEsculpida(az)
    for (let j = 1; j <= LINHAS; j++) {
      const t = j / LINHAS
      const th = lim * (1 - Math.pow(1 - t, 1.35))
      eggSurface(th, az, volumeEsculpido(th / lim, th, az), p)
      pos.push(p.x, p.y, p.z)
    }
  }

  const vid = (i, j) => 1 + ((i % COLS) * LINHAS) + (j - 1)
  for (let i = 0; i < COLS; i++) {
    idx.push(0, vid(i, 1), vid(i + 1, 1))
    for (let j = 1; j < LINHAS; j++) {
      idx.push(vid(i, j), vid(i, j + 1), vid(i + 1, j + 1))
      idx.push(vid(i, j), vid(i + 1, j + 1), vid(i + 1, j))
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return sh(new THREE.Mesh(geo, hairMat(cor)))
}

/**
 * FAIXA DE FIOS NA BORDA do corte social.
 *
 * Sem ela a casca acaba num corte de navalha: uma aresta de 0.7 mm que separa
 * cabelo de pele numa linha continua, que e metade da leitura de capacete (a
 * outra metade era a linha descer demais). Os fios nascem NA SUPERFICIE DA
 * PROPRIA CASCA — mesmo campo volumeEsculpido, entao acompanham o topete e as
 * laterais rentes sem calculo paralelo — e correm pra fora e pra BAIXO,
 * cruzando a linha de corte. Quem olha de perto ve fio; de longe ve uma borda
 * macia em vez de uma aresta.
 *
 * O clamp usa a mesma reserva do metodo C: o fio ANDA depois de nascer, entao
 * clampar so a raiz nao basta — planta-se com `comp` de folga acima do piso.
 */
function fiosEsculpido(cor) {
  const ma = tecelagem()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const eixo = new THREE.Vector3()
  const r = rng(51703)
  const N = 150
  for (let i = 0; i < N; i++) {
    const az = -Math.PI + ((i + r() * 0.85) / N) * Math.PI * 2
    const lim = bordaEsculpida(az)
    const comp = (0.007 + r() * 0.008) * S
    // nasce no ultimo quinto da casca, pra cobrir a emenda por cima
    let th = lim * (0.80 + 0.16 * r())
    const thTeto = thetaNaAltura(PISO_Y(azGeo(th, az)) + comp)
    if (th > thTeto) th = thTeto
    eggSurface(th, az, volumeEsculpido(th / lim, th, az), p)
    eggNormal(th, az, n)
    // Puxa a direcao pra baixo: fio saindo na normal pura vira ourico, e o que
    // interessa aqui e o fio DEITADO por cima da borda.
    n.y -= 0.85 + 0.55 * r()
    n.x += (r() - 0.5) * 0.35
    n.z += (r() - 0.5) * 0.35
    n.normalize()
    // Eixo tangente ao azimute: curvar em volta dele verga o fio no plano do
    // meridiano, ou seja pra baixo dos dois lados da cabeca.
    eixo.set(Math.cos(az), 0, -Math.sin(az))
    fio(ma, p, n, comp, 0.0013 * S, eixo, 0.35, 4, 3)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor)))
}

// ---------------------------------------------------------------------------
// METODO B — MECHAS COMO TIRAS DE QUADS
//
// Uma mecha nao e um cilindro reto colocado na cabeca: e uma faixa que NASCE
// deitada no couro cabeludo, desce acompanhando o cranio e so entao se solta.
// Por isso a curva e escrita em (theta, az) e nao em XYZ — quem escreve em XYZ
// acerta num cranio e enfia a raiz da mecha dentro da testa nos outros cinco.
// O afastamento vem pela NORMAL (eggNormal), nao por s: escalar s levanta a
// ponta em Y junto, e a franja subia em vez de cair.
//
// Este e o unico dos tres que NAO leva faixa de fio na borda, e de proposito: a
// borda dele ja e feita de mecha solta. Por fio ali seria o metodo repetindo a
// si mesmo com outra geometria e custando o dobro.
// ---------------------------------------------------------------------------

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()

/** Meia-largura em RADIANOS a partir de uma meia-largura em metros. */
function larguraEmAz(m, th) {
  const raio = Math.max(0.03, HEAD.rx * activeHead().kx * Math.sin(th))
  return Math.min(0.42, m / raio)
}

function pontoDaMecha(th, az, s, alt, queda) {
  eggSurface(th, az, s, _p)
  eggNormal(th, az, _n)
  _p.addScaledVector(_n, alt)
  _p.y -= queda
  // o piso e por azimute GEOMETRICO, e aqui o ponto ja esta pronto: atan2 dele
  // e exato e nao custa nada (ver azGeo)
  const lim = PISO_Y(Math.atan2(_p.x, _p.z))
  if (_p.y < lim) _p.y = lim
  return _p
}

/** Uma mecha: tira de `seg` quads seguindo a curva (theta, az, afastamento). */
function tiraDeMecha(ma, o) {
  let ea = -1, eb = -1
  for (let k = 0; k <= o.seg; k++) {
    const t = k / o.seg
    const e = t * t * (3 - 2 * t)
    const az = o.az + o.dAz * e
    let th = o.th + o.dTheta * e
    const teto = o.teto(az)
    if (th > teto) th = teto
    const alt = o.alt * t * t                 // quadratico: cola na raiz, abre na ponta
    const queda = o.queda * t * t * t
    // A ponta afina mas nao fecha em zero: quad degenerado devolve normal NaN
    // no computeVertexNormals e a mecha inteira apaga.
    const wa = larguraEmAz(o.larg * (1 - 0.70 * t * t) + 0.0008, th)
    const a = pontoDaMecha(th, az - wa, o.s, alt, queda)
    const ia = ma.v(a.x, a.y, a.z)
    const b = pontoDaMecha(th, az + wa, o.s, alt, queda)
    const ib = ma.v(b.x, b.y, b.z)
    if (k > 0) ma.quad(ea, ia, ib, eb)        // ordem que deixa a normal pra fora
    ea = ia; eb = ib
  }
}

// ---------------------------------------------------------------------------
// METODO C — CAMADAS CONCENTRICAS + FIO NA TRANSICAO
//
// Raspado e o corte que mais aparece em NPC e o que estava pior: era uma casca
// unica de cor chapada, que a 3 m le como touca. Fio por fio seria caro demais
// (um buzz de verdade tem dezenas de milhares). A saida e a tecnica de shell de
// pelagem: cascas concentricas onde o ruido de deslocamento e MAIOR que o vao
// entre elas, entao a de fora so emerge em manchas e a densidade cai sozinha
// camada a camada. Os fios de verdade ficam guardados pra BORDA INTEIRA, que e
// onde o olho consegue contar pelo.
// ---------------------------------------------------------------------------

/**
 * Linha do raspado, em altura. Tinha o mesmo entalhe central dos outros
 * (0.1470*S no meio contra 0.1600*S em az 0.45) e descia a -0.075*S na nuca,
 * o que num corte raspado le como touca puxada ate o pescoco. Plato no centro,
 * vale na patilha, degrau por cima da orelha e nuca 2.5 cm mais alta.
 */
const LINHA_RASPADO = [
  [0.00, 0.1560 * S],  // meio da testa: PLATO
  [0.36, 0.1545 * S],
  [0.68, 0.1370 * S],
  [1.00, 0.0850 * S],  // tempora
  [1.34, 0.0230 * S],  // patilha
  [1.66, 0.0330 * S],  // por cima da orelha
  [2.40, -0.0250 * S],
  [Math.PI, -0.0500 * S],
]

/** A onda do raspado: periodo 4 e 7, amplitude curta — a borda de um fade e
 *  irregular em escala pequena, nao em mecha. */
const ONDA_RASPADO = ondaDeCorte(0.020, 4, 0.6, 0.013, 7, -1.4)

/**
 * `sobe` levanta a linha SO depois da tempora (smoothstep em 0.62..1.15). E o
 * degrade: na frente as tres camadas terminam exatamente na mesma altura (o
 * corte reto do barbeiro) e dos lados cada camada para mais alto que a de
 * baixo, que e como um fade funciona.
 */
function linhaRaspado(sobe, s) {
  const base = byAz(LINHA_RASPADO)
  return (az) => {
    const y = base(az) + sobe * smoothstep(0.62, 1.15, az < 0 ? -az : az)
    const th = thetaNaAltura(y, s) + ONDA_RASPADO(az)
    const teto = thetaNaAltura(PISO_Y(azGeo(th, az)), s)
    return th > teto ? teto : th
  }
}

/** Desloca cada vertice ao longo da PROPRIA normal por ruido de posicao. */
function rugarCasca(mesh, amp, freq) {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const d = amp * grao(x * freq, y * freq, z * freq)
    let ny = y + nor.getY(i) * d
    const lim = PISO_Y(Math.atan2(x, z))
    if (ny < lim) ny = lim
    pos.setXYZ(i, x + nor.getX(i) * d, ny, z + nor.getZ(i) * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return mesh
}

export const CABELOS = [
  {
    id: 'esculpido',
    nome: 'Social esculpido',
    name: 'Social esculpido',
    metodo: 'casca propria loftada ate a linha do corte, com campo de volume s(theta,az), borda ondulada por senoides e faixa de fios soltos',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaEsculpida(c))
      g.add(fiosEsculpido(c))
      return g
    },
  },

  {
    id: 'mechas',
    nome: 'Repicado',
    name: 'Repicado',
    metodo: '180 mechas em tiras de quads que caminham no cranio e se soltam pela normal, sobre casca base escura de borda ondulada',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const g = new THREE.Group()

      // A casca base termina ~2 cm ACIMA de onde as mechas terminam. E de
      // proposito: a silhueta do corte passa a ser a das pontas, e o buraco
      // entre uma mecha e outra mostra sombra e nao couro cabeludo. Escurecida
      // porque o que se ve por entre o cabelo e a raiz na sombra.
      //
      // A tabela tinha o entalhe central (0.1560*S no meio contra 0.1620*S em
      // az 0.50) e ia a -0.095*S na nuca. Plato no centro, patilha, degrau por
      // cima da orelha, nuca mais alta — e a onda de periodo 3/5 (par proprio
      // deste corte) por cima, que e o que impede a casca escura de aparecer
      // como um aro nitido por entre as mechas.
      const linhaCasca = bordaOndulada([
        [0.00, 0.1585 * S],  // meio da testa: PLATO
        [0.34, 0.1570 * S],
        [0.66, 0.1390 * S],
        [0.95, 0.1000 * S],  // tempora
        [1.30, 0.0350 * S],  // patilha
        [1.66, 0.0430 * S],  // por cima da orelha
        [2.40, -0.0300 * S],
        [Math.PI, -0.0500 * S],
      ], 1.018, ondaDeCorte(0.024, 3, 1.9, 0.015, 5, -0.7))
      g.add(scalp(shade(c, 0.60), linhaCasca, { s: 1.018, thetaMax: 2.35, wSeg: 40, hSeg: 24 }))

      // Ate onde a PONTA pode ir. Tinha o entalhe (0.1370*S no meio contra
      // 0.1400*S em 0.55) e, pior, ia a -0.140*S na nuca e -0.125*S nos lados:
      // -0.140*S e a ALTURA DO QUEIXO. Uma cortina que desce ate o queixo em
      // toda a volta e literalmente um capacete com um buraco pro rosto — era o
      // defeito 2 da folha de contato, e vinha daqui e nao da casca. As pontas
      // agora param acima da linha do maxilar; a orelha fica exposta.
      const pontaY = byAz([
        [0.00, 0.1420 * S],  // meio da testa: PLATO
        [0.38, 0.1400 * S],
        [0.72, 0.1180 * S],
        [1.05, 0.0480 * S],  // tempora
        [1.45, -0.0250 * S],
        [2.10, -0.0620 * S],
        [Math.PI, -0.0750 * S],
      ])
      const teto = (az) => thetaNaAltura(Math.max(PISO_Y(az), pontaY(az)))
      // Ate onde as RAIZES descem. Acompanha a casca base (uns 2 mm acima
      // dela), senao a raiz da mecha nasce fora da casca e aparece flutuando.
      const raiz = (az) => thetaNaAltura(byAz([
        [0.40, 0.1600 * S], [0.95, 0.1030 * S], [1.35, 0.0330 * S], [Math.PI, -0.0450 * S],
      ])(az))

      const ma = tecelagem()
      const r = rng(90731)

      // Camada de baixo: mechas curtas e coladas que fecham o vao entre as de
      // cima. Sem ela a casca base aparece em faixa nos ombros da silhueta.
      for (let i = 0; i < 60; i++) {
        const az = -Math.PI + ((i + 0.15 + r() * 0.7) / 60) * Math.PI * 2
        const lim = Math.max(0.10, raiz(az) - 0.26)
        tiraDeMecha(ma, {
          az, th: 0.16 + lim * Math.pow(r(), 0.7),
          dAz: (r() - 0.5) * 0.16, dTheta: 0.18 + 0.28 * r(),
          s: 1.020, alt: 0.002 + 0.004 * r(), larg: 0.008 + 0.004 * r(),
          queda: 0, seg: 5, teto,
        })
      }

      // Camada de fora: mais longa, mais solta e com queda nos lados e na nuca
      // (smoothstep em |az|), que e o unico lugar onde cabelo pode cair sem
      // passar na frente do olho.
      // `alt` reduzido no setor da frente pelo mesmo motivo do topete do metodo
      // A: afastamento grande no alto da testa sai da silhueta como caroco. Nos
      // lados e atras a mecha pode se soltar a vontade, que la e volume.
      for (let i = 0; i < 96; i++) {
        const az = -Math.PI + ((i + 0.10 + r() * 0.8) / 96) * Math.PI * 2
        const a = az < 0 ? -az : az
        const lim = Math.max(0.10, raiz(az) - 0.30)
        tiraDeMecha(ma, {
          az, th: 0.18 + lim * Math.pow(r(), 0.75),
          dAz: (r() - 0.5) * 0.30, dTheta: 0.26 + 0.46 * r(),
          s: 1.022,
          alt: (0.005 + 0.009 * r()) * (0.55 + 0.45 * smoothstep(0.5, 1.2, a)),
          larg: 0.007 + 0.005 * r(),
          queda: (0.010 + 0.022 * r()) * smoothstep(0.8, 1.5, a), seg: 7, teto,
        })
      }

      // Franja varrida: dAz sempre POSITIVO, entao as mechas da testa correm
      // todas pro mesmo lado. E o detalhe que faz o corte ter lado — franja
      // simetrica e o que dava cara de boneco de vitrine.
      //
      // AQUI ESTAVA O "CHIFRE". O theta de nascimento era
      // `Math.max(0.12, raiz(az) - 0.34 + 0.10*r())`; raiz(az) na testa vale
      // ~0.33 rad, entao `raiz - 0.34` da NEGATIVO e as 24 mechas caiam todas no
      // clamp de 0.12 — brotando a 1,7 cm do alto do cranio, nao na testa. Com
      // `alt` de 8 a 16 mm elas saiam de la pra frente: um tufo no lugar errado.
      // Agora nascem 0.10 rad acima da propria linha do cabelo e com `alt` de 4
      // a 9 mm, que e o mesmo afastamento da camada de fora — a franja passa a
      // ser franja, e nao um apendice.
      for (let i = 0; i < 24; i++) {
        const az = -0.85 + ((i + r() * 0.6) / 24) * 1.70
        tiraDeMecha(ma, {
          az, th: Math.max(0.16, raiz(az) - 0.10 - 0.10 * r()),
          dAz: 0.30 + 0.26 * r(), dTheta: 0.20 + 0.16 * r(),
          s: 1.020, alt: 0.004 + 0.005 * r(), larg: 0.006 + 0.004 * r(),
          queda: 0, seg: 6, teto,
        })
      }

      g.add(sh(new THREE.Mesh(ma.geo(), hairMat(c))))
      return g
    },
  },

  {
    id: 'raspado',
    nome: 'Raspado',
    name: 'Raspado',
    metodo: '3 cascas concentricas deslocadas por ruido na normal (densidade decrescente) + fios reais cobrindo a borda inteira',
    build(ctx) {
      useHead(ctx)
      const c = hairColorFrom(ctx)
      const pele = skinOf(ctx)
      const g = new THREE.Group()

      // A camada de baixo NAO e cor de cabelo: e cabelo misturado com a pele.
      // Num raspado o couro cabeludo aparece por entre o pelo, e pintar tudo de
      // preto e o que fazia o corte ler como touca. As de cima vao ficando cor
      // de cabelo pura conforme sobem.
      // O vao entre uma casca e a seguinte e (ds * raio local) = 1.5 a 2.2 mm.
      // As amplitudes de ruido sao maiores que esse vao DE PROPOSITO: e o que
      // faz a casca de cima mergulhar pra dentro da de baixo em parte da area em
      // vez de cobrir tudo. Com amp menor que o vao (a primeira tentativa, 1.6
      // mm na do meio) as tres camadas nunca se cruzam e o resultado e uma unica
      // superficie rugosa — de novo a touca, so que com bossinhas.
      // A frequencia sobe junto: tufo grande embaixo, grao fino em cima.
      const camadas = [
        { s: 1.010, sobe: 0.000 * S, amp: 0.0000, freq: 0, mistura: 0.60, w: 36, h: 22 },
        { s: 1.019, sobe: 0.016 * S, amp: 0.0021, freq: 62, mistura: 0.85, w: 34, h: 20 },
        { s: 1.027, sobe: 0.034 * S, amp: 0.0026, freq: 92, mistura: 1.00, w: 34, h: 20 },
      ]
      for (const cam of camadas) {
        const cor = mixHex(pele, shade(c, 0.90), cam.mistura)
        const m = headShell(cor, {
          s: cam.s, t0: 0, t1: 2.15, wSeg: cam.w, hSeg: cam.h,
          hi: linhaRaspado(cam.sobe, cam.s),
        })
        if (cam.amp) rugarCasca(m, cam.amp, cam.freq)
        g.add(m)
      }

      // Fios de verdade. Dois tons (peloMat 0 e 2) porque pelo de raspado nunca
      // e um bloco de cor unica, e dois meshes custam dois draw calls.
      const teias = [tecelagem(), tecelagem()]
      const alturaLinha = byAz(LINHA_RASPADO)
      const p = new THREE.Vector3()
      const n = new THREE.Vector3()
      const eixo = new THREE.Vector3()
      const r = rng(20482)
      const planta = (az, thPedido, o) => {
        // O fio e o unico pedaco deste arquivo que anda DEPOIS de nascer, entao
        // clampar so a raiz nao basta: ele desce ate `comp` a partir dela. Plantar
        // com `comp` de reserva acima do piso e o que garante o limite mesmo no
        // cranio comprido, onde 0.05 rad de theta vale 12 mm de altura (contra 4 mm
        // no redondo) e a fileira de baixo da linha do cabelo furava a testa.
        const thTeto = thetaNaAltura(PISO_Y(azGeo(thPedido, az)) + o.comp)
        const th = thPedido > thTeto ? thTeto : thPedido
        // `fora` e `desce` sao por fileira, nao constantes: na costeleta e na
        // nuca a casca de cima ja parou (e o degrade), entao nao ha casca pra
        // esconder a raiz, e no cranio mandibula o gonio incha pra fora logo
        // ABAIXO do ponto de plantio — com a inclinacao usada na testa o fio
        // inteiro entrava no maxilar em vez de correr por cima dele.
        pontoNaPele(th, az, o.fora, p, n)
        // Inclina o fio pra baixo do proprio couro cabeludo somando -Y a normal.
        // Fio saindo perfeitamente na normal vira ourico; o pelo real cai.
        n.y -= o.desce + r() * 0.22
        n.x += (r() - 0.5) * 0.30
        n.z += (r() - 0.5) * 0.30
        n.normalize()
        // Eixo tangente ao azimute: girar em volta dele curva o fio no plano do
        // meridiano, ou seja pra baixo — que e pra onde pelo cai nos dois lados
        // da cabeca (o sinal se inverte junto com o eixo na nuca).
        eixo.set(Math.cos(az), 0, -Math.sin(az))
        fio(teias[o.tom], p, n, o.comp, o.raio, eixo, o.curva, o.aneis, 3)
      }

      // 1. Faixa da LINHA DO CABELO, da tempora esquerda a direita, com os fios
      //    espalhados pra cima e pra baixo do corte: e a franja irregular que
      //    separa pele de cabelo. Sem ela o limite e uma curva desenhada.
      for (let i = 0; i < 118; i++) {
        const az = -1.45 + ((i + r() * 0.9) / 118) * 2.90
        const th = thetaNaAltura(alturaLinha(az)) + (r() - 0.55) * 0.10
        planta(az, th, {
          comp: (0.008 + r() * 0.007) * S, raio: 0.0013 * S,
          curva: 0.30, aneis: 4, tom: i & 1, desce: 0.42, fora: 0.0008,
        })
      }
      // 2. Costeletas: az 1.20..1.50 e a frente da orelha (a orelha esta em
      //    1.57). Descem ate -0.055*S, que e a altura do lobulo.
      for (let lado = -1; lado <= 1; lado += 2) {
        for (let i = 0; i < 22; i++) {
          const az = lado * (1.20 + r() * 0.30)
          const y = 0.015 * S - ((i + r()) / 22) * 0.070 * S
          planta(az, thetaNaAltura(y), {
            comp: (0.010 + r() * 0.012) * S, raio: 0.0015 * S,
            curva: 0.30, aneis: 5, tom: i & 1, desce: 0.34, fora: 0.0016,
          })
        }
      }
      // 3. ACIMA E ATRAS DA ORELHA (az 1.52..2.50). Era o unico trecho da borda
      //    sem fio nenhum — a costeleta parava em 1.50 e a nuca so comecava em
      //    2.45 — e e justamente o setor que a folha de contato mostra de perfil:
      //    la a linha das tres cascas aparecia como um corte de navalha em volta
      //    do cranio, que e a leitura de capacete. Os fios seguem a propria
      //    linha, com espalhamento pra baixo, e desmancham a aresta.
      for (let lado = -1; lado <= 1; lado += 2) {
        for (let i = 0; i < 22; i++) {
          const az = lado * (1.52 + ((i + r() * 0.8) / 22) * 0.98)
          const y = alturaLinha(az) + (0.006 - r() * 0.018) * S
          planta(az, thetaNaAltura(y), {
            comp: (0.007 + r() * 0.007) * S, raio: 0.0013 * S,
            curva: 0.24, aneis: 4, tom: i & 1, desce: 0.30, fora: 0.0014,
          })
        }
      }
      // 4. Nuca: a mesma transicao, no unico angulo em que ela e vista de tras.
      // `desce` menor que na testa e curva menor pelo mesmo motivo do `fora`:
      // abaixo do occipital a cabeca volta a engordar e o fio muito deitado
      // mergulha nela em vez de acompanhar.
      for (let i = 0; i < 30; i++) {
        const az = (i & 1 ? 1 : -1) * (2.45 + r() * 0.69)
        const y = (-0.040 - r() * 0.035) * S
        planta(az, thetaNaAltura(y), {
          comp: (0.008 + r() * 0.008) * S, raio: 0.0013 * S,
          curva: 0.20, aneis: 4, tom: i & 1, desce: 0.24, fora: 0.0018,
        })
      }

      for (let i = 0; i < teias.length; i++) {
        if (!teias[i].vazia) g.add(sh(new THREE.Mesh(teias[i].geo(), peloMat(c, i * 2))))
      }
      return g
    },
  },
]

export default CABELOS
