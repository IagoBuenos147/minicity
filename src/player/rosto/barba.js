import * as THREE from 'three'
import {
  HEAD_S, HEAD, clamp, mix, smoothstep, rng, shade, sh,
  useHead, activeHead, eggSurface, pontoNaPele,
  headShell, byAz, hairMat, peloMat, tecelagem, fio, beardColorFrom, soldarNormais,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/barba.js — catalogo de BARBA.
//
// Tres barbas e TRES METODOS DE CONSTRUCAO diferentes. Nao e enfeite: cada
// tipo de barba falha de um jeito diferente quando construida do jeito errado,
// e o dono pediu explicitamente metodos distintos pra poder escolher qual
// combina com o jogo.
//
//   1 APARADA (a da referencia)  CASCA RECORTADA COM BORDA MORDIDA.
//     Barba curta e uniforme le como uma CASCA de cor solida — de longe nao ha
//     fio nenhum visivel, e tentar fazer ela de fio custa 40 mil triangulos pra
//     entregar uma mancha. O que mata a leitura de "capacete de plastico" nao e
//     o fio no meio da barba, e a BORDA: um corte de theta constante vira uma
//     linha de navalha perfeita que nenhum rosto tem. Entao a linha de corte e
//     modulada por duas senoides de periodo diferente (uma longa, que da as
//     falhas grandes, e uma curta, que serrilha) e por cima dela nasce uma
//     faixa fina de fios de verdade. E so essa faixa que precisa de pelo.
//
//   2 BIGODE                      FIOS PENTEADOS, SEM CASCA NENHUMA.
//     Bigode e a unica peca de pelo do rosto pequena o bastante pra ser feita
//     inteira de fio dentro do orcamento — e a que mais sofre quando nao e: o
//     bigode-casca da versao antiga era uma placa preta colada no buco. Aqui
//     sao ~200 tubos plantados numa grade sobre o buco, cada um saindo da
//     NORMAL da pele e vergado pra baixo e pra fora conforme se afasta do meio.
//     A forma vem do PENTEADO, nao de uma silhueta desenhada. Os fios sao
//     repartidos entre os 3 tons de peloMat: e a mistura de fio claro com fio
//     escuro que da profundidade em vez de mancha chapada.
//
//   3 CHEIA                       MASSA PENTEADA + FRANJA NA BORDA.
//     Barba cheia precisa de VOLUME, e volume feito so de fio passa de 40 mil
//     triangulos. Sao tres camadas: um MANTO parametrico amostrado direto de
//     eggSurface (com furo de verdade na boca, ondulado por senoide pra nao
//     ser liso), uma camada de MECHAS lofteadas numa grade (todas caindo na
//     MESMA direcao, com o comprimento saindo de uma tabela por azimute, que
//     e o que faz a barba ter FORMA em vez de virar arbusto) e a FRANJA:
//     muito fio CURTO e denso nas duas bordas. A primeira versao errava
//     justamente nisso (fio comprido e espalhado, giro de mecha sorteado,
//     comprimento so no sorteio) e o resultado foi recusado por causa dos
//     pelos externos.
//
// Tudo ancorado em ALTURA ANATOMICA (a tabela do CONTRATO) convertida em theta
// no cranio ativo — ver thetaEmY(). Nada de theta escrito na mao, nada de Z
// fixo: a linha do maxilar anda quase 1 cm entre a cabeca 'comprida' e a
// 'redonda'.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da boca (tabela do CONTRATO). Nenhuma barba pode fechar esse vao. */
const Y_BOCA = -0.082 * S

/**
 * Sentinela de "aqui nao tem barba": theta acima de PI nao existe na esfera,
 * entao quem recebe esse valor numa linha de corte COLAPSA no polo do queixo e
 * a peca some naquele azimute. E como a barba termina antes da nuca sem
 * precisar recortar geometria.
 */
const FORA = 3.30

/**
 * theta (0 = topo, PI = queixo) da altura y NO CRANIO ATIVO.
 *
 * Inverso exato de yAt(): a altura de um ponto so depende de uy, entao uma
 * linha de theta constante E uma linha de altura constante. Isso e o unico
 * jeito de escrever "logo abaixo da maca do rosto" e continuar valendo nos 6
 * cranios: o mesmo theta 1.64 cai na altura da boca na cabeca 'redonda'
 * (yTop 0.95) e na altura do nariz na 'comprida' (yTop 1.18).
 */
function thetaEmY(y) {
  const sp = activeHead()
  return Math.acos(clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1))
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _tg = new THREE.Vector3()
const _lat = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _alvo = new THREE.Vector3()
const _eixo = new THREE.Vector3()
const _h1 = new THREE.Vector3()
const _h2 = new THREE.Vector3()
const _tu = new THREE.Vector3()
const _tv = new THREE.Vector3()
const _tw = new THREE.Vector3()
const _hx = new THREE.Vector3()

/**
 * Meia largura da boca em METROS. A boca e desenhada com medida fixa (*S), mas
 * o AZIMUTE que corresponde a essa largura muda quase 40% entre os cranios: az
 * 0.40 cai a 4.5 cm do meio na cabeca 'comprida' (kx 0.88) e a 6.4 cm na
 * 'redonda' (kx 1.02). Toda regra de "so pode descer depois do canto da boca"
 * mede em x por causa disso — escrita em az, ela deixava a ponta do bigode em
 * cima do labio na cabeca estreita e a 2 cm de distancia na larga.
 */
const X_BOCA = 0.047

/** |x| da pele em (theta, az). */
function xEmAz(theta, az) { return Math.abs(eggSurface(theta, az, 1, _hx).x) }

/**
 * Azimute em que a pele passa por |x| = alvo, na altura `theta`.
 * x cresce quase proporcional a az perto do meio do rosto (x ~ sin(az) * raio),
 * entao escalar o palpite pela razao converge em 3 passadas sem bisseccao.
 */
function azEmX(theta, alvo) {
  let az = 0.40
  for (let k = 0; k < 3; k++) {
    const xa = xEmAz(theta, az)
    if (xa < 1e-5) break
    az = clamp(az * (alvo / xa), 0.06, 1.40)
  }
  return az
}

/**
 * Direcao "descendo PELA PELE" em (theta, az) — a direcao em que pelo de rosto
 * cai. Sai de duas amostras de eggSurface e nao de (0,-1,0): no maxilar a pele
 * inclina quase 45 graus, e um fio empurrado pra baixo no eixo do mundo entra
 * dentro da cabeca em vez de acompanhar a bochecha.
 *
 * Perto do polo do queixo nao existe "mais abaixo": ali amostra pra cima e
 * inverte, senao a diferenca da zero e o fio nasce sem direcao (NaN depois do
 * normalize, e a barba inteira some).
 */
function descidaNaPele(theta, az, out) {
  const perto = theta > Math.PI - 0.07
  const a = perto ? theta - 0.06 : theta
  const b = perto ? theta : theta + 0.06
  eggSurface(b, az, 1, _h1)
  eggSurface(a, az, 1, _h2)
  return out.subVectors(_h1, _h2).normalize()
}

/**
 * Pelo NAO projeta sombra, de proposito. Duzentos tubos de 1 mm no shadow map
 * viram cintilacao (o mapa nao tem resolucao pra eles) e ainda custam um
 * segundo desenho por luz. Receber sombra continua ligado — e o que faz a barba
 * escurecer junto com o queixo quando a luz vem de cima.
 */
function pelo(m) { m.castShadow = false; m.receiveShadow = true; return m }

/**
 * Ondulacao de baixa frequencia do manto. Senoides cruzadas em (theta, az) e
 * nao ruido tabelado porque precisa ser CONTINUA: o manto e uma grade sem
 * costura, e qualquer descontinuidade aparece como vinco reto atravessando a
 * barba. Amplitude e multiplicada por fracoes de milimetro no chamador — o
 * objetivo nao e ver a onda, e a luz raspante achar variacao.
 */
function ondaPele(theta, az) {
  return Math.sin(az * 7.3 + theta * 5.1) * 0.62 + Math.sin(az * 12.7 - theta * 8.3) * 0.38
}

/**
 * Empurra cada vertice de uma casca ao longo da propria normal por meio
 * milimetro de senoide. Sem isto a casca da barba curta e uma superficie
 * MATEMATICAMENTE LISA: com cor clara (grisalho, branca) ela le como um capacete
 * de plastico brilhante, que e exatamente a reclamacao do dono. Meio milimetro
 * nao aparece como relevo — aparece como a luz nunca encontrar o mesmo angulo
 * duas vezes seguidas.
 *
 * A amostragem e feita a partir da POSICAO do vertice, entao vertices coladas
 * (a costura da esfera, e a fileira inteira que colapsou na linha de corte)
 * recebem o mesmo deslocamento e continuam coladas — senao a linha de corte
 * abriria em leque.
 */
function rugoso(geo, amp) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const d = amp * ondaPele(Math.atan2(Math.hypot(x, z), y), Math.atan2(x, z))
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/**
 * TUFO: um lobo de pelo lofteado a mao dentro do acumulador de tecelagem.
 *
 * Por que nao usar ConeGeometry/SphereGeometry: cada tufo seria um Mesh, e 130
 * tufos = 130 draw calls por boneco (sao ate 20 na tela). Lofteando os aneis
 * direto no acumulador, a camada inteira e UMA geometria.
 *
 * A secao e uma ELIPSE girada (`achata` + `giro`), nao um circulo: tufo de
 * barba e uma mecha achatada colada na pele, e um lobo de secao circular le
 * como bolinha de massa.
 *
 * ATENCAO A ORDEM DOS INDICES: fio() monta o frame com W = -direcao, o que
 * deixa as normais dele apontando pra DENTRO. Passa despercebido porque
 * peloMat e DoubleSide e um pelo tem 1 mm de raio. Num lobo de 1 cm a normal
 * invertida le como buraco na barba, entao aqui W = +crescimento e a costura
 * sai pra fora.
 */
function tufo(ma, p, cresc, lado, comp, raio, achata, giro, verga, aneis = 4, cols = 5) {
  const W = _tw.copy(cresc).normalize()
  const U = _tu.copy(lado)
  U.addScaledVector(W, -U.dot(W))
  if (U.lengthSq() < 1e-9) return
  U.normalize()
  const V = _tv.crossVectors(W, U)
  const co = Math.cos(giro), si = Math.sin(giro)
  let ant = null
  for (let k = 0; k < aneis; k++) {
    const t = k / aneis
    // raio cheio na base e afinando por (1 - t^2)^0.55: a queda so acelera no
    // fim, que e o que faz o tufo ter barriga em vez de virar um cone.
    // expoente 0.40 (nao 0.55): segura o raio ate quase o fim e so entao
    // fecha. Com a queda cedo o lobo vira cone e a barba inteira vira escama.
    const r = raio * Math.pow(1 - t * t, 0.40)
    // -0.0015 no primeiro anel enterra a base do lobo dentro do manto; sem isso
    // aparece o furo do tubo aberto entre o tufo e a pele.
    const av = comp * t - 0.0015
    const cx = p.x + W.x * av + verga.x * t * t
    const cy = p.y + W.y * av + verga.y * t * t
    const cz = p.z + W.z * av + verga.z * t * t
    const A = []
    for (let i = 0; i < cols; i++) {
      const a = (i / cols) * Math.PI * 2
      const ex = Math.cos(a) * r, ey = Math.sin(a) * r * achata
      const rx = ex * co - ey * si, ry = ex * si + ey * co
      A.push(ma.v(cx + U.x * rx + V.x * ry, cy + U.y * rx + V.y * ry, cz + U.z * rx + V.z * ry))
    }
    if (ant) for (let i = 0; i < cols; i++) ma.quad(ant[i], ant[(i + 1) % cols], A[(i + 1) % cols], A[i])
    ant = A
  }
  const ponta = ma.v(p.x + W.x * comp + verga.x, p.y + W.y * comp + verga.y, p.z + W.z * comp + verga.z)
  for (let i = 0; i < cols; i++) ma.tri(ant[i], ant[(i + 1) % cols], ponta)
}

/**
 * Vertice do manto: ponto da pele afastado por `fora` + a ondulacao.
 *
 * A ondulacao MORRE no polo do queixo (o fator `polo`). Em theta = PI a normal
 * de eggNormal e (0,-1,0) para TODOS os azimutes, entao o afastamento decide
 * sozinho onde o vertice cai: com a onda ligada, as 45 colunas terminam em 45
 * pontos DIFERENTES do mesmo eixo em vez de num ponto so, o leque do queixo
 * vira um punhado de slivers e computeVertexNormals devolve normal NULA nos
 * vertices que sobram so em triangulo degenerado — que na tela e um vertice
 * preto no fundo do queixo. Com a onda apagada ali, o polo e UM ponto.
 */
function pontoManto(ma, theta, az, fora, onda) {
  const polo = clamp(Math.sin(theta) * 4, 0, 1)
  pontoNaPele(theta, az, fora + onda * polo * ondaPele(theta, az), _p, _n)
  return ma.v(_p.x, _p.y, _p.z)
}

/** Costura duas colunas vizinhas do manto (theta cresce em i, az cresce em j). */
function costurar(ma, cols) {
  for (let j = 0; j < cols.length - 1; j++) {
    const A = cols[j], B = cols[j + 1]
    if (A.length < 2 || B.length < 2) continue
    // (A[i] -> A[i+1]) e d/dtheta e (A[i] -> B[i]) e d/daz; o produto vetorial
    // dessa ordem aponta pra FORA da cabeca. Trocar os dois vira a barba do
    // avesso e ela escurece toda.
    for (let i = 0; i < A.length - 1; i++) ma.quad(A[i], A[i + 1], B[i + 1], B[i])
  }
}

/**
 * MANTO: retalho parametrico amostrado direto de eggSurface numa grade
 * (theta, az), com FURO DE VERDADE na boca.
 *
 * Por que nao headShell aqui: headShell so sabe cortar por UMA linha de theta
 * por azimute, entao a boca so pode ser o fim da casca — nunca um buraco no
 * meio dela. Com a boca virando furo, a barba cheia pode subir pelo buco e
 * cercar os labios num pedaco continuo, que e o desenho certo.
 *
 * Toda coluna tem SEMPRE duas faixas (acima e abaixo da boca), mesmo onde o
 * furo ja fechou — ali as duas se encostam. Emitir uma faixa em umas colunas e
 * duas em outras abriria uma fenda vertical exatamente no canto da boca, que e
 * onde o olho olha.
 */
function manto(ma, lo, hi, furoCima, furoBaixo, opts) {
  const { nA, nT, azMax, fora, onda } = opts
  const colsA = [], colsB = []
  for (let j = 0; j <= nA; j++) {
    const az = -azMax + (2 * azMax * j) / nA
    let t0 = clamp(lo(az), 0, Math.PI)
    const t1 = clamp(hi(az), 0, Math.PI)
    // coluna sem altura: colapsa em vez de sumir. Pular a coluna abriria um
    // corte reto no fim da barba; colapsada ela vira sliver invisivel.
    if (t1 - t0 < 0.02) t0 = t1
    const mA = clamp(furoCima(az), t0, t1)
    const mB = clamp(furoBaixo(az), t0, t1)
    const A = [], B = []
    for (let i = 0; i <= nT; i++) {
      const u = i / nT
      A.push(pontoManto(ma, mix(t0, mA, u), az, fora, onda))
      B.push(pontoManto(ma, mix(mB, t1, u), az, fora, onda))
    }
    colsA.push(A); colsB.push(B)
  }
  costurar(ma, colsA)
  costurar(ma, colsB)
}

export const BARBAS = [
  {
    id: 'nenhuma', nome: 'Sem barba', name: 'Sem barba',
    metodo: 'nenhuma geometria',
    build() { return null },
  },

  // -------------------------------------------------------------------------
  // 1 APARADA — casca recortada com a borda mordida + faixa de fios na linha.
  // -------------------------------------------------------------------------
  {
    id: 'aparada', nome: 'Aparada', name: 'Aparada',
    metodo: 'casca do cranio recortada por linha de altura modulada por duas senoides, com faixa de fios plantada sobre a borda',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      // Semente presa SO ao formato do cranio: se ela dependesse da cor, trocar
      // a cor da barba no customizador re-sorteava a borda inteira e a peca
      // "fervia" a cada clique.
      const rnd = rng(1471 + (((ctx && ctx.cabeca) | 0) * 131))
      const g = new THREE.Group()

      // Linha de corte escrita em ALTURA, convertida em theta no cranio ativo.
      // Frente abaixo da boca (deixa o vao dos labios), sobe ate logo abaixo da
      // maca do rosto na diagonal, e desaparece antes da orelha.
      const thBoca = thetaEmY(Y_BOCA)
      const azCanto = azEmX(thBoca, X_BOCA)
      const azFim = azEmX(thBoca, X_BOCA * 1.45)
      const base = byAz([
        // Passado o CANTO DA BOCA a linha sobe de uma vez pra altura do bigode:
        // e ali que a barba da referencia fecha em volta do labio. Com a rampa
        // suave que estava aqui antes sobrava um triangulo de pele entre a
        // ponta do bigode e a bochecha — o buraco que a foto mostrou.
        [Math.min(azCanto * 0.92, 0.44), thetaEmY(-0.096 * S)],
        [Math.min(azCanto * 1.30, 0.58), thetaEmY(-0.076 * S)],
        [0.66, thetaEmY(-0.060 * S)],
        [1.14, thetaEmY(-0.012 * S)],
        [1.62, thetaEmY(-0.026 * S)],
        [2.10, thetaEmY(-0.120 * S)],
        [2.42, FORA],
      ])
      // A BORDA MORDIDA. Duas senoides de periodo diferente: a de 6.1 ciclos da
      // as falhas grandes (uma a cada ~5 cm de linha, como barba que cresce em
      // tufo) e a de 11.7 serrilha por cima. Uma senoide so vira ondulacao
      // regular, que le pior que o corte reto. As duas somam 0.043 rad = ~1 cm
      // de variacao, o suficiente pra ler de longe.
      // Usa az CRU e nao |az| de proposito: assim o lado esquerdo nao e o
      // espelho do direito. A descontinuidade em az = +-PI nao aparece porque
      // ali a linha ja vale FORA (3.30 - 0.043 continua acima de PI).
      // A modulacao entra so depois de |az| 0.30: bem na frente ela ficaria
      // entre a barba e o labio de baixo, e 1 cm de amplitude ali e a diferenca
      // entre "borda viva" e "barba comendo a boca" — sem contar que a mordida
      // na frente nem aparece, o queixo esta de perfil pra camera.
      // O Math.min(PI, ...) e o que faz a sentinela FORA cumprir o que ela
      // promete. headShell recoloca o vertice em (sin(lim), cos(lim)) SEM
      // clamp: com lim = 3.30, sin da NEGATIVO (-0.158) e o vertice nao vai pro
      // polo do queixo — ele vai pro azimute OPOSTO, a 2 cm do eixo. O fim da
      // barba, em vez de fechar num ponto, dobrava numa aba de casca embaixo do
      // queixo (medido: 2.1 cm de raio na 'redonda', 3.6 cm na 'mandibula'),
      // escondida por 0.5 mm dentro da propria calota — e por isso ninguem viu.
      // Com o clamp o colapso e no polo de verdade e a aba some.
      const linha = (az) => {
        const g = smoothstep(0.30, 0.78, az < 0 ? -az : az)
        return Math.min(Math.PI,
          base(az) + g * (0.028 * Math.sin(az * 6.1 + 0.6) + 0.015 * Math.sin(az * 11.7 - 1.3)))
      }

      // s = 1.022: ~3.5 mm de pelo sobre a pele. Barba aparada nao tem volume
      // proprio; qualquer coisa acima de 1.03 vira o capacete da versao antiga.
      // t0 = 1.50 fica acima da linha mais alta em qualquer cranio (na cabeca
      // 'redonda' ela chega a 1.55) — vertice acima de t0 nao existe pra ser
      // colapsado e a barba nasceria cortada.
      const casca = headShell(shade(cor, 1.04), {
        s: 1.022, t0: 1.50, t1: Math.PI, lo: linha, wSeg: 72, hSeg: 24,
      })
      rugoso(casca.geometry, 0.0013)
      g.add(casca)

      // Buco: a casca principal nao pode subir alem da boca (ela e um corte
      // unico por azimute), entao o pelo acima do labio e um segundo retalho.
      // s um pouco maior (1.027) porque os dois se sobrepoem por ~5 mm no canto
      // da boca — com o mesmo s eles brigariam por z-fighting ali.
      const yBucoTopo = -0.038 * S
      const loBuco = (az) => {
        const a = az < 0 ? -az : az
        // a mesma mordida da casca grande, com um terco da amplitude: aqui a
        // borda passa embaixo do nariz e 1 cm de recorte comeria o filtro
        return thetaEmY(mix(yBucoTopo, -0.074 * S, smoothstep(0.16 * azFim / 0.54, azFim, a)))
          + 0.010 * Math.sin(az * 8.7 + 1.1) + 0.006 * Math.sin(az * 15.3)
      }
      const hiBuco = (az) => {
        // A borda de baixo so desce DEPOIS do canto da boca (medido em x, nao em
        // az): no meio ela para em -0.068*S, 2 cm acima da boca, e e esse vao
        // que o labio ocupa. Passado o canto ela cai, que e o que um bigode de
        // verdade faz na comissura.
        const fora = smoothstep(X_BOCA * 0.95, X_BOCA * 1.30, xEmAz(thBoca, az))
        const a = az < 0 ? -az : az
        const y = mix(-0.070 * S, -0.092 * S, fora)
        return thetaEmY(mix(y, -0.074 * S, smoothstep(azFim * 0.78, azFim, a))) + 0.008 * Math.sin(az * 9.3)
      }
      const buco = headShell(shade(cor, 1.04), {
        s: 1.027, t0: thetaEmY(-0.012 * S), t1: thetaEmY(-0.100 * S),
        azHalf: azFim + 0.04, lo: loBuco, hi: hiBuco, wSeg: 26, hSeg: 9,
      })
      rugoso(buco.geometry, 0.0011)
      g.add(buco)

      // FAIXA DE FIOS sobre a borda. E a transicao que mata a leitura de casca:
      // sem ela a linha lida acima, por mais mordida que seja, continua sendo
      // uma aresta de plastico. Duas fileiras, a de baixo mais curta, plantadas
      // ABAIXO da linha (a raiz fica escondida dentro da casca) e apontando pra
      // cima e pra fora, entao o que se ve sao so as pontas passando da borda.
      const maA = tecelagem(), maB = tecelagem()
      const N = 84
      for (let k = 0; k < N; k++) {
        const az = -2.28 + (4.56 * (k + 0.5)) / N + (rnd() - 0.5) * 0.045
        const th0 = linha(az)
        if (th0 > Math.PI - 0.10) continue
        for (let r = 0; r < 2; r++) {
          const theta = th0 + 0.014 + r * 0.050 + rnd() * 0.022
          pontoNaPele(theta, az, 0.0016, _p, _n)
          descidaNaPele(theta, az, _tg)
          _lat.crossVectors(_n, _tg).normalize()
          _dir.copy(_n).multiplyScalar(0.70)
            .addScaledVector(_tg, -0.62)
            .addScaledVector(_lat, (rnd() - 0.5) * 0.30)
            .normalize()
          // ponta curvando de volta pra normal: pelo curto raspado nao fica
          // reto, ele arqueia. Sem curva a faixa vira uma escova de cerdas.
          _eixo.crossVectors(_dir, _n).normalize()
          // Na FRENTE (dentro da largura da boca) o fio sai pela metade: ali a
          // borda de cima da barba passa logo abaixo do labio, e um fio de 1 cm
          // apontando pra cima encosta na boca. Nas laterais, onde a franja e o
          // que quebra a linha de navalha, ele sai inteiro.
          const curto = (az < 0 ? -az : az) < azCanto * 1.5 ? 0.5 : 1
          const comp = (0.0062 + 0.0058 * rnd() - r * 0.0016) * S * curto
          fio(rnd() < 0.5 ? maA : maB, _p, _dir, comp, 0.00105 * S, _eixo, 0.34)
        }
      }
      // mesma faixa na aresta de cima do buco, senao o bigode fica com a borda
      // reta que acabou de ser removida do resto
      for (let k = 0; k < 26; k++) {
        const az = -azFim + (2 * azFim * (k + 0.5)) / 26 + (rnd() - 0.5) * 0.03
        const theta = loBuco(az) + 0.012 + rnd() * 0.016
        pontoNaPele(theta, az, 0.0016, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize()
        _dir.copy(_n).multiplyScalar(0.66).addScaledVector(_tg, -0.55)
          .addScaledVector(_lat, (rnd() - 0.5) * 0.25).normalize()
        _eixo.crossVectors(_dir, _n).normalize()
        fio(rnd() < 0.5 ? maA : maB, _p, _dir, (0.0040 + 0.0030 * rnd()) * S, 0.00095 * S, _eixo, 0.30)
      }
      if (!maA.vazia) g.add(pelo(new THREE.Mesh(maA.geo(), peloMat(cor, 0))))
      if (!maB.vazia) g.add(pelo(new THREE.Mesh(maB.geo(), peloMat(cor, 2))))
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 2 BIGODE — so fio, penteado.
  // -------------------------------------------------------------------------
  {
    id: 'bigode', nome: 'Bigode', name: 'Bigode',
    metodo: 'grade de ~210 fios plantados na normal da pele e vergados pra fora e pra baixo — a silhueta sai do penteado, nao de um contorno desenhado',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(2803 + (((ctx && ctx.cabeca) | 0) * 197))
      const g = new THREE.Group()
      // Tres acumuladores = tres tons de peloMat no mesmo bigode. Repartir por
      // sorteio e nao por indice (i % 3): com o resto da divisao os tons caem
      // em listras regulares e o bigode ganha um xadrez.
      const mas = [tecelagem(), tecelagem(), tecelagem()]

      const LINHAS = 9, COLS = 38
      // A base do nariz do CONTRATO e -0.035*S. Este numero NAO e a altura da
      // raiz de cima: sobre ela ainda entram o sorteio (+0.002*S) e o RAIO DO
      // TUBO (0.0015*S), e os tres somados sao 3.7 mm. Com -0.036*S a
      // superficie do fio chegava a -0.0442, 2.4 mm ACIMA da base do nariz —
      // dentro da caixa onde ficava a narina (de -0.0525 a -0.0419), o que
      // punha pelo cor de barba dentro do buraco do nariz visto de baixo. O
      // catalogo de nariz nao existe mais, mas a folga fica: ela e o que separa
      // o bigode do plano subnasal em qualquer cranio. -0.0388*S poe o TOPO DO FIO em
      // -0.0470, meio milimetro abaixo da linha, e ainda sobra 6 mm de
      // sobreposicao com a asa do nariz (que desce ate -0.040*S) — nada de vao
      // de pele entre o nariz e o bigode.
      const Y_TOPO = -0.0388 * S
      // -0.064*S e a fileira de baixo. Medido: a ponta do fio central para em
      // y = -0.095, 1.4 cm acima do meio da boca e ~5 mm acima da aresta de
      // cima de um labio de 0.014*S. Em -0.068*S a ponta encostava na boca no
      // cranio 'comprida' — 4 mm de folga nao sobrevivem a uma boca mais grossa.
      const Y_BASE = -0.064 * S
      // meia largura em AZIMUTE que corresponde a um bigode de 1.6x a boca —
      // resolvido por cranio, senao o bigode nasce do tamanho do rosto errado
      const AZ_MAX = azEmX(thetaEmY(Y_BASE), X_BOCA * 1.60)

      for (let li = 0; li < LINHAS; li++) {
        const ft = li / (LINHAS - 1)
        for (let c = 0; c < COLS; c++) {
          if (rnd() < 0.05) continue // falhas: bigode com densidade uniforme le como escova
          const fa = ((c + 0.5) / COLS) * 2 - 1
          const a = fa < 0 ? -fa : fa
          const sgn = fa < 0 ? -1 : 1
          // Contorno: estreito embaixo do nariz e abrindo pra baixo, e as pontas
          // CAINDO (o -0.020*S em a^2*ft). E esse desenho de raiz que faz a
          // silhueta de guidao; a forma nao esta em lugar nenhum como geometria.
          const meiaLargura = AZ_MAX * (0.52 + 0.48 * smoothstep(0, 0.65, ft))
          const az = fa * meiaLargura + (rnd() - 0.5) * 0.028
          const y0 = mix(Y_TOPO, Y_BASE, ft) + (rnd() - 0.5) * 0.004 * S
          // Primeira passada so pra saber A QUE DISTANCIA DO MEIO, EM METROS,
          // essa raiz cai: a queda da ponta so pode comecar depois do canto da
          // boca, e o canto esta a X_BOCA do meio em qualquer cranio. Escrita
          // em `a` (azimute) a queda pousava em cima do labio na cabeca
          // estreita — foi o defeito que o teste de vertices na boca pegou.
          const fora = clamp((xEmAz(thetaEmY(y0), az) - X_BOCA) / 0.030, 0, 1)
          const y = y0 - 0.020 * S * fora * fora * ft
          const theta = thetaEmY(y)

          pontoNaPele(theta, az, 0.0012, _p, _n)
          descidaNaPele(theta, az, _tg)
          _lat.crossVectors(_n, _tg).normalize().multiplyScalar(sgn)

          // PENTEADO: no meio o fio sai quase na normal (pelo do filtro aponta
          // pra frente); conforme a coluna se afasta, a componente lateral
          // domina e a descida entra junto. E a interpolacao disso ao longo de
          // `a` que da o bigode penteado pros lados.
          const abre = 0.16 + 0.72 * a
          _dir.copy(_n).multiplyScalar(0.95 - 0.42 * a)
            .addScaledVector(_lat, abre)
            .addScaledVector(_tg, 0.15 + 0.55 * ft * fora)
            .normalize()
          // alvo da curvatura: pra fora e pra baixo. O fio sai reto da pele e vai
          // deitando — pelo que nasce ja deitado le como palha colada. No meio o
          // alvo e quase todo lateral: e la que o vao da boca tem que sobreviver.
          _alvo.copy(_tg).multiplyScalar(0.30 + 0.55 * fora)
            .addScaledVector(_lat, 0.80 - 0.22 * fora).normalize()
          _eixo.crossVectors(_dir, _alvo)
          if (_eixo.lengthSq() < 1e-9) _eixo.copy(_n)
          _eixo.normalize()

          // Filtro (o sulco sob o nariz): as duas fileiras de cima no meio saem
          // pela metade. Deixar o vao vazio abriria um buraco de pele; encurtar
          // da o degrau sem furo.
          const filtro = ft < 0.34 && a < 0.13 ? 0.45 : 1
          const comp = (0.0090 + 0.0115 * a * a + 0.0025 * rnd()) * S * filtro
          // grosso pra idade do jogo: a 1.5 m da camera um fio de 1 mm some no
          // antialiasing e o bigode vira poeira. 2 mm de raio ainda le como FIO
          // (a ponta afina) e cobre o dobro de pixel por triangulo.
          const raio = (0.00150 - 0.00035 * a) * S
          fio(mas[(rnd() * 3) | 0], _p, _dir, comp, raio, _eixo, 0.35 + 0.85 * fora)
        }
      }
      for (let i = 0; i < 3; i++) {
        if (!mas[i].vazia) g.add(pelo(new THREE.Mesh(mas[i].geo(), peloMat(cor, i))))
      }
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 3 CHEIA — manto + mechas PENTEADAS + franja densa. REFEITA DO ZERO.
  //
  // A primeira versao desta barba foi recusada com "os pelos externos e a arte
  // ficaram horriveis", e o defeito nao era densidade nem cor — eram tres
  // decisoes de construcao, todas da mesma familia:
  //
  //  1. OS FIOS DA SILHUETA ERAM POUCOS, COMPRIDOS E ESPALHADOS. 62 fios de ate
  //     1.1 cm em 4.4 rad da UM FIO A CADA 4 GRAUS. Isso nao le como barba: le
  //     como perna de inseto saindo da bochecha, cada uma contavel a olho nu.
  //     Borda de barba e o contrario disso — MUITO fio CURTO, tao junto que o
  //     olho para de contar e passa a ver contorno.
  //  2. AS MECHAS ERAM SORTEADAS EM POSICAO E EM GIRO. `rnd() * Math.PI` no
  //     giro da secao punha cada mecha num angulo proprio; com a secao
  //     achatada, uma ficava deitada, a vizinha em pe, a seguinte na diagonal.
  //     O resultado tem nome: escama. Barba de verdade e PENTEADA — todas as
  //     mechas caem na mesma direcao e o que varia e o comprimento.
  //  3. O COMPRIMENTO ERA SO SORTEIO. Sem uma tabela por azimute, o mesmo
  //     sorteio valia na costeleta e no queixo, entao o contorno serrilhava em
  //     alta frequencia e a barba nao tinha FORMA. Numa barba o comprimento
  //     varia devagar ao longo do rosto: curto na costeleta, cheio no queixo.
  //
  // O manto continua (ele e o que resolve o furo da boca, e isso estava certo).
  // Mechas e franja foram refeitas em cima de COMP(az) e de um penteado unico.
  // -------------------------------------------------------------------------
  {
    id: 'cheia', nome: 'Cheia', name: 'Cheia',
    metodo: 'manto parametrico com furo na boca + mechas PENTEADAS numa grade (giro travado na pele, comprimento por tabela de azimute) + franja densa e curta nas duas bordas',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(3517 + (((ctx && ctx.cabeca) | 0) * 257))
      const g = new THREE.Group()

      // Linha do maxilar/bochecha, em altura. Sobe mais que a 'aparada' (passa
      // do nivel do nariz na lateral) porque barba cheia comeca na costeleta.
      const loY = byAz([
        [0.00, thetaEmY(-0.038 * S)],
        [0.38, thetaEmY(-0.030 * S)],
        [0.82, thetaEmY(-0.004 * S)],
        [1.26, thetaEmY(0.012 * S)],
        [1.70, thetaEmY(0.004 * S)],
        [2.06, thetaEmY(-0.060 * S)],
        [2.36, FORA],
      ])
      const hiY = () => Math.PI

      // FURO DA BOCA: lente em (az, theta) que fecha em az = +-AZ_FURO. O
      // perfil e sqrt(1 - (a/azF)^2) e nao linear porque a boca e uma elipse
      // deitada — a rampa linear da um losango e o canto do losango bate no
      // canto do labio.
      //
      // A BOCA CRESCEU E O FURO TEVE QUE CRESCER JUNTO. As bocas novas
      // (rosto/boca-extra.js) foram desenhadas pro rosto de olho grande: tem
      // 8,5 cm de meia-largura e ate 2 cm de subida na ponta, contra os 4,7 cm
      // e 3,6 cm de vao que valiam pras antigas. Com o furo velho esta barba
      // fechava POR CIMA do sorriso — a boca simplesmente sumia debaixo dela.
      const X_FURO = 0.086
      const thBoca = thetaEmY(Y_BOCA)
      const thCima = thetaEmY(-0.054 * S)
      const thBaixo = thetaEmY(-0.124 * S)
      const AZ_FURO = azEmX(thBoca, X_FURO)
      const elipse = (az) => {
        const a = az < 0 ? -az : az
        if (a >= AZ_FURO) return 0
        return Math.sqrt(1 - (a / AZ_FURO) * (a / AZ_FURO))
      }
      const furoCima = (az) => thBoca - (thBoca - thCima) * elipse(az)
      const furoBaixo = (az) => thBoca + (thBaixo - thBoca) * elipse(az)

      /**
       * COMPRIMENTO RELATIVO DO PELO, POR AZIMUTE. A peca que faltava.
       *
       * Este e o DESENHO da barba. Ele multiplica o tamanho da mecha E o da
       * franja, entao os dois concordam: cheio no queixo (1.0), afinando pela
       * mandibula e virando quase raspado na costeleta (0.22). Uma barba em que
       * o comprimento so vem do sorteio nao tem contorno nenhum — e o que fazia
       * esta aqui parecer arbusto em vez de barba.
       *
       * A variacao e LENTA de proposito (byAz interpola com smoothstep): o
       * serrilhado tem que vir do sorteio pequeno em cima disto, nunca da
       * propria tabela.
       */
      const COMP = byAz([
        [0.00, 1.00],   // queixo, o ponto mais cheio
        [0.55, 0.95],
        [1.05, 0.74],   // mandibula
        [1.55, 0.48],
        [2.00, 0.30],
        [2.36, 0.22],   // costeleta
      ])

      // --- camada 1: o manto (a sombra da barba na propria pele) -------------
      // Cor escurecida: esta camada nunca aparece sozinha, ela e o fundo que se
      // ve ENTRE as mechas. Com a cor cheia o fundo compete com o volume e a
      // barba vira um bloco chapado.
      const maM = tecelagem()
      manto(maM, loY, hiY, furoCima, furoBaixo, {
        nA: 44, nT: 9, azMax: 2.40, fora: 0.0035, onda: 0.0016,
      })
      // SOLDAR: o manto tem vertices coincidentes de proposito — a faixa de
      // cima colapsa contra a de baixo onde o furo da boca ja fechou, e as
      // colunas do fim da barba colapsam inteiras. computeVertexNormals trata
      // cada copia como um vertice separado e da a cada uma a media dos
      // triangulos DELA, o que acende uma listra atravessando a barba na altura
      // da boca e deixa normal NULA (ponto preto) nas colunas colapsadas.
      // tecelagem().geo() nao solda sozinha.
      const geoManto = soldarNormais(maM.geo())
      g.add(sh(new THREE.Mesh(geoManto, hairMat(shade(cor, 0.78)))))

      /**
       * O PENTEADO, NUM LUGAR SO. Toda mecha e todo fio de queixo desta barba
       * sai daqui, e e por isso que ela tem uma direcao unica em vez de virar
       * arbusto:
       *
       *   _p    ponto da pele                _n    normal
       *   _tg   descida PELA PELE            _lat  lateral (n x tg)
       *   _dir  crescimento = quase toda descida + um tanto de normal
       *
       * `abre` e o unico grau de liberdade: 0 = mecha colada no rosto, 1 =
       * mecha solta. Ela cresce com a distancia da linha da bochecha, que e
       * como barba real se comporta — presa em cima, solta embaixo.
       */
      const pentear = (theta, az, fora, abre, desvio) => {
        pontoNaPele(theta, az, fora, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize()
        _dir.copy(_tg).multiplyScalar(0.88)
          .addScaledVector(_n, 0.34 + 0.40 * abre)
          .addScaledVector(_lat, desvio)
          .normalize()
      }

      // --- camada 2: as mechas -----------------------------------------------
      // GRADE, nao sorteio de posicao. Sorteio puro em 150 amostras deixa
      // buraco de 2 cm de um lado e aglomerado do outro (e so a variancia de
      // Poisson), e buraco em barba cheia le como falha de pele. A grade
      // garante a cobertura e o jitter dentro da celula devolve a
      // irregularidade — mesma aparencia, sem o defeito.
      const maT = [tecelagem(), tecelagem()]
      const N_AZ = 27, N_T = 6
      for (let ja = 0; ja < N_AZ; ja++) {
        const azBase = -2.30 + (4.60 * (ja + 0.5)) / N_AZ
        for (let jt = 0; jt < N_T; jt++) {
          const az = azBase + (rnd() - 0.5) * (4.60 / N_AZ) * 0.9
          const t0 = loY(az)
          if (t0 > Math.PI - 0.24) continue
          // PI - 0.26 e o limite de baixo: nos ultimos 0.26 rad o raio da
          // cabeca ja e menor que o raio da propria mecha, entao o lobo envolve
          // o polo e metade dele sai pelo outro lado. Alem de invisivel — e a
          // base do queixo, tapada pelo pescoco.
          const u = (jt + 0.5 + (rnd() - 0.5) * 0.8) / N_T
          const theta = mix(t0, Math.PI - 0.26, clamp(u, 0, 1))
          // Margem em volta do furo: a mecha tem raio e comprimento proprios, e
          // uma plantada na borda exata cresce por cima da boca.
          //
          // A MARGEM DE CIMA E TRES VEZES A DE BAIXO, e nao por simetria feia:
          // toda mecha desta barba CAI (e o penteado). Uma plantada 5 cm acima
          // do labio tem 2,2 cm de comprimento e vai parar exatamente em cima
          // dele. 0.16 rad e o comprimento maximo dividido pelo raio da cabeca,
          // que e a conta de quanto ela desce.
          if (theta > furoCima(az) - 0.16 && theta < furoBaixo(az) + 0.055
            && xEmAz(theta, az) < X_FURO * 1.10) continue

          const k = COMP(az)
          const solta = clamp((theta - t0) / Math.max(0.05, Math.PI - 0.26 - t0), 0, 1)
          pentear(theta, az, 0.0028, solta, (rnd() - 0.5) * 0.13)

          // verga: a ponta cai mais que a base (gravidade). Escala com o
          // comprimento — mecha de costeleta nao tem peso pra vergar.
          _alvo.copy(_tg).multiplyScalar((0.0020 + 0.0035 * rnd()) * S * k)
          // COMPRIDA E ESTREITA, nao gorda e curta: 1.2 a 2.2 cm de mecha com
          // uns 4 mm de largura. O raio passando do comprimento era o que fazia
          // cada tufo virar bolinha e a barba inteira virar escama.
          const comp = (0.0095 + 0.0090 * rnd()) * S * (0.45 + 0.55 * k)
          const raio = (0.0034 + 0.0018 * rnd()) * S * (0.6 + 0.4 * k)
          // GIRO TRAVADO PERTO DE ZERO. Com `lado` = _lat e a secao achatada em
          // 0.42, o eixo curto da elipse cai na NORMAL — a mecha fica deitada
          // contra a pele, que e o que mecha de barba faz. O sorteio de giro da
          // versao anterior punha cada uma num angulo e o conjunto virava
          // escama; o pouco de jitter que sobrou aqui e so pra elas nao ficarem
          // paralelas demais.
          tufo(
            maT[rnd() < 0.55 ? 0 : 1], _p, _dir, _lat,
            comp, raio, 0.42, (rnd() - 0.5) * 0.5, _alvo,
          )
        }
      }
      for (let i = 0; i < 2; i++) {
        if (!maT[i].vazia) g.add(pelo(new THREE.Mesh(maT[i].geo(), peloMat(cor, i))))
      }

      // --- camada 3: a franja das bordas -------------------------------------
      // MUITO fio CURTO, e nao poucos fios compridos. Este e o conserto
      // principal: a borda antiga tinha 62 fios de ate 1.1 cm espalhados por
      // 4.4 rad e cada um era contavel; aqui sao 3 fileiras de 62 colunas com 3
      // a 6 mm, o que FECHA a borda num contorno em vez de deixar cerdas
      // avulsas. Custa quase o mesmo triangulo: fio curto tem menos anel.
      const maF = [tecelagem(), tecelagem()]
      const COLS_B = 62, FILAS_B = 3
      for (let c = 0; c < COLS_B; c++) {
        const azC = -2.24 + (4.48 * (c + 0.5)) / COLS_B
        const k = COMP(azC)
        for (let f = 0; f < FILAS_B; f++) {
          const az = azC + (rnd() - 0.5) * 0.045
          const th0 = loY(az)
          if (th0 > Math.PI - 0.20) continue
          // as tres fileiras descem a partir da linha da bochecha; a de cima e
          // a mais curta, e e ela que faz a barba "morrer" na pele em vez de
          // terminar num degrau.
          const theta = th0 + 0.010 + f * 0.030 + rnd() * 0.014
          // na borda de cima o fio sobe um pouco (contra a descida): e o
          // arrepio da linha da bochecha. -0.42 e metade do que era antes — com
          // -0.55 o fio saia quase perpendicular a barba.
          pontoNaPele(theta, az, 0.0020, _p, _n)
          descidaNaPele(theta, az, _tg)
          _lat.crossVectors(_n, _tg).normalize()
          _dir.copy(_n).multiplyScalar(0.80)
            .addScaledVector(_tg, -0.42 + 0.30 * (f / (FILAS_B - 1)))
            .addScaledVector(_lat, (rnd() - 0.5) * 0.22)
            .normalize()
          _eixo.crossVectors(_dir, _n).normalize()
          const comp = (0.0030 + 0.0026 * rnd()) * S * (0.5 + 0.5 * k)
          fio(maF[rnd() < 0.5 ? 0 : 1], _p, _dir, comp, 0.00105 * S, _eixo, 0.30)
        }
      }
      // Contorno de baixo: e ele que se ve de frente, recortado contra o peito.
      // Tres fileiras densas seguindo a curva do queixo, todas descendo pelo
      // MESMO penteado — nada de fio solo apontando pra fora.
      const COLS_Q = 54, FILAS_Q = 3
      for (let c = 0; c < COLS_Q; c++) {
        const azC = -1.78 + (3.56 * (c + 0.5)) / COLS_Q
        const k = COMP(azC)
        for (let f = 0; f < FILAS_Q; f++) {
          const az = azC + (rnd() - 0.5) * 0.05
          const theta = Math.PI - 0.52 + f * 0.11 + (rnd() - 0.5) * 0.05
          pentear(theta, az, 0.0030, 1, (rnd() - 0.5) * 0.20)
          // a curva dobra a ponta PRA DENTRO, que e como barba comprida se
          // fecha embaixo do queixo em vez de abrir em leque.
          _alvo.copy(_n).multiplyScalar(-1)
          _eixo.crossVectors(_dir, _alvo)
          if (_eixo.lengthSq() < 1e-9) _eixo.copy(_lat)
          _eixo.normalize()
          const comp = (0.0042 + 0.0040 * rnd()) * S * (0.45 + 0.55 * k)
          fio(maF[rnd() < 0.5 ? 0 : 1], _p, _dir, comp, 0.00115 * S, _eixo, 0.45)
        }
      }
      if (!maF[0].vazia) g.add(pelo(new THREE.Mesh(maF[0].geo(), peloMat(cor, 2))))
      if (!maF[1].vazia) g.add(pelo(new THREE.Mesh(maF[1].geo(), peloMat(cor, 0))))
      return g
    },
  },
]
