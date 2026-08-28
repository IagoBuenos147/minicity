import * as THREE from 'three'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/colares.js — ancora: neck (origem na base do pescoco, +Z e a
// frente). Tres colares, TRES METODOS DE CONSTRUCAO diferentes:
//
//   1 'elos'      ELO POR ELO. 50 toros pequenos girados 90 graus alternadamente
//                 ao longo de uma curva, fundidos numa geometria so. Um toro
//                 liso do tamanho do pescoco le como arco de plastico; o que faz
//                 uma corrente parecer corrente e o serrilhado dos elos pegando
//                 luz em angulos diferentes.
//   2 'crucifixo' CATENARIA + EXTRUSAO. O cordao e um tubo sobre a curva que uma
//                 corda pendurada faz DE VERDADE (resolvida na hora por
//                 bisseccao), e a cruz sai de ExtrudeGeometry com chanfro, que e
//                 o unico jeito barato de ter aresta biselada de verdade em vez
//                 de uma caixa com cor.
//   3 'bandana'   REVOLUCAO DE SECAO FECHADA + FITA NA MAO. O rolo de pano e uma
//                 lathe cujo perfil FECHA (sobe pela cara de fora e desce pela
//                 de dentro), entao o pano tem espessura em vez de ser uma casca
//                 de 0 mm; as duas pontas sao tiras construidas vertice a
//                 vertice, com torcao e barriga, deitadas na elipse do peito.
//
// ---------------------------------------------------------------------------
// A) NAO EXISTE CINTURA NO PESCOCO — O COLAR MORA NO OMBRO.
//
//    A primeira versao deste arquivo mediu o boneco com UM cranio so e achou
//    uma ampulheta: gargalo de 6,0 cm de raio em y = 1.346, subindo 4,4 cm por
//    centimetro pros dois lados. A medida vale pra TRES dos SEIS cranios. Nos
//    outros tres nao existe gargalo nenhum. Varredura por raycast, 32 setores
//    por altura, raio da superficie MAIS EXTERNA (pele ou pano), em cm:
//
//      y mundo   redonda comprida quadrada  pera  realista mandibula
//      1.330       9.86    9.86    9.86    9.86    9.86    9.86   <- torax
//      1.335       9.02    9.02    9.02    9.02    9.02    9.02   <- torax
//      1.340       8.11    8.11    8.11    8.11    8.11    8.20
//      1.345       5.83    5.48    7.83    8.95    5.48   10.06   <- QUEIXO
//      1.350       6.65    5.42    9.03   10.13    6.07   11.40
//      1.355       7.43    5.35   10.03   11.07    6.76   12.42
//
//    A cabeca deste boneco e um cone que nasce em y = 1.328 e abre pra cima;
//    nas tres cabecas largas (quadrada, pera, mandibula) ela ja tem 10 a 12 cm
//    de raio exatamente na altura em que a versao anterior pendurava a
//    corrente. Medido: a corrente de elos ficava 46 mm DENTRO do queixo, com
//    30% dos pontos enterrados — ou seja, sumia. E a queixa original do dono
//    ("nao esta mostrando"), so que vinda da reforma da cabeca, nao do raio.
//
//    A saida nao e um aro maior, e um aro MAIS BAIXO. Em y = 1.337 o queixo de
//    qualquer um dos seis ainda mede menos de 7 cm e quem manda no raio volta a
//    ser o TORAX — que e justamente o que o contrato sabe medir. Entao aqui
//    ninguem escreve raio na mao: raioAro() le o perfil do peito, multiplica
//    pela peca MAIS LARGA do catalogo (FOLGA_LARGA) e soma SOBRA_ACESSORIO,
//    igualzinho ao que frentePeito() ja faz pro pingente. Depois da mudanca, o
//    pior ponto de cada peca (6 cranios x 4 blusas): corrente 5,2 mm (0,5% dos
//    pontos), crucifixo 0,0 mm, bandana 1,4 mm — e o MESMO nos seis cranios.
//
//    O achatamento mudou junto, pelo mesmo motivo. Em cima (y = 1.35) quem esta
//    ali e o pescoco, que e redondo, e o aro saia quase circular (0.96). Em
//    baixo (y = 1.337) quem esta ali e o torax, que e a elipse de FLAT_Z (0.76).
//    Aro circular no torax boia 3,4 cm na frente do esterno e raspa os lados;
//    com FLAT_Z a folga fica uniforme (7 a 9 mm) na volta inteira.
//
//    R_CORRENTE do nucleo (RAIO_GOLA_ALTA + SOBRA_ACESSORIO = 5,95 cm) ficou
//    pequeno pra QUALQUER altura depois da reforma da cabeca, entao nenhuma
//    peca daqui o usa. E um numero de nucleo.js que pede revisao; nao mexi.
//
// B) ARO E PECA SOLTA SAO OPOSTOS PRO character.js. O acomodarColarSobreARoupa
//    mede por raycast quanto de pano ha na frente e corrige: aro (centro NO
//    eixo) ele ABRE pela escala, peca solta (centro fora do eixo, z positivo)
//    ele EMPURRA pela posicao. Por isso a corrente de elos e UMA malha fundida
//    e centrada, e o pingente/no/franja sao malhas separadas la na frente.
//    Nada aqui le posicao ou escala de outra peca: o desenho e o natural, com
//    o raio saindo de raioAro(), e quem acomoda e o character.
// ---------------------------------------------------------------------------

/**
 * Altura do aro no espaco do pescoco (mundo y = 1.337): logo ABAIXO do ponto
 * onde o queixo de qualquer cranio comeca a abrir, e ainda em cima do torax.
 * Subir 1 cm daqui enfia a peca no queixo das tres cabecas largas; descer 1 cm
 * joga ela na rampa do trapezio, que engorda 3,8 cm de raio por centimetro.
 */
const Y_COLAR = 0.032

/**
 * Raio do aro do colar. NAO tem numero escrito na mao: sai do perfil do proprio
 * corpo, como manda o contrato.
 *
 * O `2 * h` (e nao `1 * h`) e o preco da altura da peca: o aro tem espessura, e
 * a BORDA DE CIMA dele mora h acima do centro, onde o torax ja acabou e o
 * queixo ja comecou. Com uma folga de so h a borda de cima da corrente raspava
 * 13 mm no queixo do cranio 'mandibula'; com 2h ela passa em todos os seis.
 *
 * @param h meia-espessura da peca (o quanto ela sobe/desce/engrossa do centro)
 */
function raioAro(c, h) {
  const pele = N.raioPerfil(c.perfil.PEITO, Y_COLAR + c.medida.NECK_Y)
  return pele * N.FOLGA_LARGA + N.SOBRA_ACESSORIO + 2 * h
}

/**
 * Junta varias geometrias numa so. Aceita indexada e nao-indexada na mesma
 * lista (TorusGeometry vem com indice, ExtrudeGeometry nao).
 *
 * Existe por dois motivos, e o segundo importa mais que o primeiro: 50 elos
 * soltos sao 50 draw calls por boneco (1000 com a tela cheia), e — pior — 50
 * malhas cada uma com o centro FORA do eixo, que e exatamente o que o
 * character.js empurra pra frente uma por uma em vez de abrir o aro inteiro.
 * Fundido, o colar volta a ser um aro centrado.
 *
 * BufferGeometryUtils faria isso, mas mora em three/examples e este catalogo
 * nao pode trazer dependencia nova.
 */
function fundir(geos) {
  let nv = 0, ni = 0
  for (const g of geos) {
    nv += g.attributes.position.count
    ni += g.index ? g.index.count : g.attributes.position.count
  }
  const pos = new Float32Array(nv * 3)
  const nor = new Float32Array(nv * 3)
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni)
  let vo = 0, io = 0
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal
    pos.set(p.array, vo * 3)
    if (n) nor.set(n.array, vo * 3)
    const ix = g.index
    const c = ix ? ix.count : p.count
    for (let i = 0; i < c; i++) idx[io + i] = (ix ? ix.getX(i) : i) + vo
    vo += p.count; io += c
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  return out
}

/**
 * Parametro `a` da catenaria y = a*(cosh(x/a) - 1) que, com meio vao `w`, cai
 * exatamente `flecha`. Nao tem forma fechada; a flecha CRESCE quando `a` cai
 * (corda mais bamba), entao 40 bisseccoes num intervalo de 10 m chegam em
 * 1e-11 — folga absurda pra um cordao de 6 mm, e custa nada porque roda uma
 * vez por troca de roupa.
 *
 * Por que catenaria e nao um arco de circulo: o arco tem curvatura constante e
 * sai do apoio quase reto, o que da aquele "aro de plastico" que o dono
 * reclamou. A corda de verdade sai INCLINADA do apoio e achata no fundo.
 */
function catenaria(w, flecha) {
  let lo = 1e-4, hi = 10
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (m * (Math.cosh(w / m) - 1) > flecha) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/** Elipse do peito (ja por fora da peca mais larga) na altura yn do pescoco. */
function elipsePeito(c, yn) {
  const a = N.raioPerfil(c.perfil.PEITO, yn + c.medida.NECK_Y) * N.FOLGA_LARGA
    + N.SOBRA_ACESSORIO
  return { a, b: a * c.medida.FLAT_Z }
}

/** Z da superficie do peito no desvio lateral x, na altura yn do pescoco. */
function zPeito(c, x, yn) {
  return N.frenteXZ(c, c.perfil.PEITO, x, yn + c.medida.NECK_Y,
    N.FOLGA_LARGA, N.SOBRA_ACESSORIO)
}

/**
 * Fita de pano feita vertice a vertice: TRES colunas (borda, meio empurrado pra
 * fora, borda) por K+1 linhas descendo pelo peito.
 *
 * A coluna do meio nao e enfeite. Uma fita de duas colunas e um plano de 0 mm:
 * de perfil ela SOME, e num boneco que anda de lado pra camera metade do tempo
 * a franja piscava. Com a barriga no meio ela tem secao curva e continua lendo
 * como pano de qualquer angulo.
 *
 * A torcao gira a largura em volta do eixo vertical, entre "de cara pra frente"
 * (cos) e "de perfil" (sen): e o que impede as duas pontas de sairem paralelas
 * como duas reguas.
 *
 * O `zAlto` resolve a emenda com o no: a superficie do peito, no primeiro
 * centimetro abaixo da gola, esta 3 cm mais para dentro do que o rolo da
 * bandana, entao uma fita que ja nascesse deitada no peito comecaria dentro do
 * queixo. Ela sai do Z DO NO e decai pro peito em exponencial — sempre por
 * fora dos dois, porque a mistura de dois valores externos nunca entra.
 */
function fita(c, mat, o) {
  const K = 8
  const pos = new Float32Array((K + 1) * 3 * 3)
  const idx = []
  for (let i = 0; i <= K; i++) {
    const t = i / K
    const y = o.y0 + (o.y1 - o.y0) * t
    const x = o.x0 + (o.x1 - o.x0) * t
    const w = o.w0 + (o.w1 - o.w0) * t
    const tw = o.torcao * t
    const zp = zPeito(c, x, y)
    const z = zp + (o.zAlto - zp) * Math.exp(-4.2 * t)
    const e = elipsePeito(c, y)
    // normal da elipse (x/a2, z/b2) e a tangente horizontal dela: e nessa base
    // que a largura gira. Usar (1,0,0) fixo deitava a fita atravessada no peito
    // conforme ela caminhava pro lado.
    let nx = x / (e.a * e.a), nz = zp / (e.b * e.b)
    const nl = Math.hypot(nx, nz) || 1
    nx /= nl; nz /= nl
    const ux = nz, uz = -nx
    const ct = Math.cos(tw), st = Math.sin(tw)
    const wx = ux * ct + nx * st, wz = uz * ct + nz * st
    const barriga = 0.0042 * (1 - 0.45 * t)
    const p = [
      [x - wx * w / 2, y, z - wz * w / 2],
      [x + nx * barriga, y - 0.0015, z + nz * barriga],
      [x + wx * w / 2, y, z + wz * w / 2],
    ]
    for (let k = 0; k < 3; k++) {
      pos[(i * 3 + k) * 3] = p[k][0]
      pos[(i * 3 + k) * 3 + 1] = p[k][1]
      pos[(i * 3 + k) * 3 + 2] = p[k][2]
    }
    if (i === 0) continue
    for (let k = 0; k < 2; k++) {
      const a0 = (i - 1) * 3 + k, b0 = i * 3 + k
      idx.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return N.sh(new THREE.Mesh(g, mat))
}

export const COLARES = [
  { id: 'nenhum', nome: 'Nenhum', metodo: 'sem peca', build() { return null } },

  {
    id: 'elos',
    nome: 'Corrente de elos',
    metodo: 'elos de toro girados 90 graus alternadamente sobre uma curva, fundidos num mesh so',
    build(c) {
      const g = new THREE.Group()
      const FZ = c.medida.FLAT_Z
      // MEIA-ESPESSURA PRIMEIRO, RAIO DEPOIS: o raio sai de raioAro(), que
      // precisa saber o quanto a peca sobe do centro. Elo de R_ELO + T_ELO.
      // 50 elos e o maximo que cabe no orcamento (50 x 48 = 2400 de 2500), e
      // e ele que fixa o tamanho do elo: o passo da volta tem que ser o VAO
      // INTERNO do elo (2 * R_ELO), senao os elos param de se enfiar um no
      // outro e viram contas enfileiradas com folga. Dai R_ELO = pi * R / NE.
      // Numero PAR de proposito: com impar os elos 0 e n-1 caem no mesmo giro
      // e a emenda, que fica na frente do pescoco, mostra dois elos colados.
      const NE = 50
      const T_SOBRE_R = 0.293          // a proporcao da grossura do arame
      // Ponto fixo de uma linha so: R depende de h, h depende de R_ELO e
      // R_ELO depende de R. Duas passadas ja convergem em decimo de milimetro.
      let R = raioAro(c, 0.0097)
      let R_ELO = Math.PI * R / NE
      R = raioAro(c, R_ELO * (1 + T_SOBRE_R))
      R_ELO = Math.PI * R / NE
      const T_ELO = R_ELO * T_SOBRE_R
      const Y = Y_COLAR

      /**
       * Curva da corrente. O mergulho e de so 3 mm (q = d^2, concentrado na
       * frente) e o afastamento da frente, 4 mm. Os dois eram 3x maiores quando
       * a corrente morava no pescoco: la ela precisava contornar o gogo. Aqui
       * ela deita na elipse do torax e cada milimetro a mais na frente vira
       * milimetro de corrente BOIANDO na frente do esterno.
       */
      const ponto = (a, v) => {
        const d = (1 + Math.cos(a)) / 2
        const q = d * d
        return v.set(
          Math.sin(a) * (R + 0.002 * q),
          Y - 0.003 * q,
          Math.cos(a) * R * FZ + 0.004 * q,
        )
      }

      const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3()
      const T = new THREE.Vector3(), rad = new THREE.Vector3(), eixo = new THREE.Vector3()
      const xA = new THREE.Vector3(), yA = new THREE.Vector3()
      const esc = new THREE.Vector3()
      const M = new THREE.Matrix4()
      // 4 x 6 e nao 4 x 8: com 50 elos (contra os 36 de antes) o octogono
      // custaria 3200 triangulos, 700 acima do teto do slot. O hexagono de 48
      // fecha em 2400 — e um elo de 15 mm com seis lados nao le diferente de um
      // com oito nem no close do provador.
      const molde = new THREE.TorusGeometry(R_ELO, T_ELO, 4, 6)
      const pecas = []
      for (let i = 0; i < NE; i++) {
        const a = (i / NE) * Math.PI * 2
        ponto(a, P)
        T.copy(ponto(a + 0.05, A)).sub(ponto(a - 0.05, B)).normalize()
        rad.set(P.x, 0, P.z).normalize()
        // O par alternado E a corrente: elo deitado na pele, elo em pe, elo
        // deitado. Todos no mesmo plano viram uma serrilha chapada de fita.
        if (i % 2) eixo.copy(rad)
        else eixo.crossVectors(T, rad).normalize()
        xA.copy(T).addScaledVector(eixo, -T.dot(eixo)).normalize()
        yA.crossVectors(eixo, xA)
        // elo 8% maior na frente: corrente de verdade e graduada, e o peso
        // aparente vai todo pro pedaco que a camera ve. Passou de 8% e a borda
        // de baixo do elo da frente voltou a encostar no peitoral.
        const d = (1 + Math.cos(a)) / 2
        const s = 1 + 0.08 * d * d
        M.makeBasis(xA, yA, eixo)
        M.scale(esc.set(s, s, s))
        M.setPosition(P)
        pecas.push(molde.clone().applyMatrix4(M))
      }
      molde.dispose()
      // ouro escuro: 0xd8b134 puro estourava de branco no sol da tarde
      g.add(N.sh(new THREE.Mesh(fundir(pecas), N.metal(0xcfa02e))))
      return g
    },
  },

  {
    id: 'crucifixo',
    nome: 'Cruz de prata',
    metodo: 'tubo sobre catenaria resolvida por bisseccao + cruz de ExtrudeGeometry com chanfro',
    build(c) {
      const g = new THREE.Group()
      const NECK = c.medida.NECK_Y
      const FZ = c.medida.FLAT_Z
      // Cordao de 3 mm de raio. Por ser a peca mais FINA das tres, o raio que
      // raioAro() devolve pra ela e o menor do arquivo (1,3 cm menos que a
      // corrente): a folga que um aro precisa e a espessura dele, nao gosto.
      const R_FIO = 0.0030
      const R = raioAro(c, R_FIO)
      const Y_ARO = Y_COLAR, Y_TRAS = Y_COLAR + 0.001, Y_FUNDO = 0.010
      // Onde o V da frente desprende do aro: 0.60 rad (34 graus). Mais aberto e
      // a corda desce pelo ombro, que naquela altura ja tem 8 cm de raio.
      const A_LADO = 0.60

      const pts = []
      // metade de tras: aro simples, subindo 1 mm na nuca
      const NB = 14
      for (let i = 0; i <= NB; i++) {
        const a = A_LADO + (Math.PI * 2 - 2 * A_LADO) * (i / NB)
        const d = (1 - Math.cos(a)) / 2
        pts.push(new THREE.Vector3(
          Math.sin(a) * R,
          Y_ARO + (Y_TRAS - Y_ARO) * d,
          Math.cos(a) * R * FZ,
        ))
      }
      // metade da frente: a catenaria de verdade. O z acompanha a queda com
      // expoente 0.55 (e nao linear) porque o ombro abre 4,4 mm de raio por
      // milimetro de descida: com interpolacao reta os dois primeiros
      // milimetros da corda ja nasciam dentro da clavicula.
      const w = Math.sin(A_LADO) * R
      const zLado = Math.cos(A_LADO) * R * FZ
      const zFundo = N.frentePeito(c, Y_FUNDO + NECK)
      const aCat = catenaria(w, Y_ARO - Y_FUNDO)
      const NF = 12
      for (let i = 1; i < NF; i++) {
        const x = -w + 2 * w * (i / NF)
        const y = Y_FUNDO + aCat * (Math.cosh(x / aCat) - 1)
        const t = (Y_ARO - y) / (Y_ARO - Y_FUNDO)
        pts.push(new THREE.Vector3(x, y, zLado + (zFundo - zLado) * Math.pow(t, 0.55)))
      }
      // 'centripetal' e nao o catmull-rom padrao: o encontro do aro com a
      // catenaria e um canto de verdade (a corda dobra em cima do ombro), e a
      // versao uniforme dava overshoot ali e enfiava o laco dentro do pescoco.
      const curva = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
      const mFio = N.couro(0x2a2521)
      g.add(N.sh(new THREE.Mesh(
        new THREE.TubeGeometry(curva, 72, R_FIO, 5, true), mFio,
      )))

      const mPrata = N.metal(0xd7dae0)
      // argola: raio interno 2,9 mm contra os 3,0 mm do cordao, entao ela
      // ABRACA o fio em vez de boiar em volta. Eixo em X porque no fundo da
      // catenaria o cordao corre lateralmente.
      const arg = N.anel(0.0045, 0.0016, mPrata, 5, 10)
      arg.rotation.y = Math.PI / 2
      arg.position.set(0, Y_FUNDO, zFundo)
      g.add(arg)

      // --- a cruz: contorno de 12 pontos extrudado COM CHANFRO ---------------
      // O chanfro e o item inteiro. Uma cruz de duas caixas cruzadas tem 12
      // arestas vivas que somem contra o peito; com 1,4 mm de bisel cada aresta
      // vira uma linha de luz e a peca se destaca de longe, que era a queixa.
      const ALT = 0.040, LARG = 0.026, ESP = 0.0105, PROF = 0.0055
      const s = new THREE.Shape()
      const hx = LARG / 2, hy = ALT / 2, t = ESP / 2
      const yb = hy - ALT * 0.30
      s.moveTo(-t, -hy); s.lineTo(t, -hy); s.lineTo(t, yb - t)
      s.lineTo(hx, yb - t); s.lineTo(hx, yb + t); s.lineTo(t, yb + t)
      s.lineTo(t, hy); s.lineTo(-t, hy); s.lineTo(-t, yb + t)
      s.lineTo(-hx, yb + t); s.lineTo(-hx, yb - t); s.lineTo(-t, yb - t)
      s.closePath()
      const gCruz = new THREE.ExtrudeGeometry(s, {
        depth: PROF, bevelEnabled: true, bevelThickness: 0.0014,
        bevelSize: 0.0014, bevelSegments: 1, curveSegments: 1, steps: 1,
      })
      // losango em relevo no cruzamento: 40 triangulos que dao um ponto de luz
      // no centro da peca. Vai FUNDIDO na cruz, e nao como mesh irmao, porque o
      // acomodarColarSobreARoupa empurra malha por malha e duas malhas coladas
      // podem receber empurroes diferentes e descolar uma da outra.
      const l = new THREE.Shape()
      l.moveTo(0, 0.0062); l.lineTo(0.0042, 0); l.lineTo(0, -0.0062)
      l.lineTo(-0.0042, 0); l.closePath()
      const gLos = new THREE.ExtrudeGeometry(l, {
        depth: 0.0016, bevelEnabled: true, bevelThickness: 0.0009,
        bevelSize: 0.0009, bevelSegments: 1, curveSegments: 1, steps: 1,
      })
      gCruz.computeBoundingBox()
      gLos.translate(0, yb, gCruz.boundingBox.max.z)
      const geoCruz = fundir([gCruz, gLos])
      // centra a espessura no plano do pingente: o ExtrudeGeometry nasce todo
      // de z=0 pra frente (mais o bisel), entao sem isto a cruz fica meio
      // centimetro na frente de onde a conta do peito colocou ela.
      geoCruz.computeBoundingBox()
      const cz = (geoCruz.boundingBox.min.z + geoCruz.boundingBox.max.z) / 2
      geoCruz.translate(0, 0, -cz)

      const cruz = N.sh(new THREE.Mesh(geoCruz, mPrata))
      const yCruz = -0.010
      cruz.position.set(0, yCruz, N.frentePeito(c, yCruz + NECK))
      // 0.35 rad de tombo pra tras: o torax abre pra fora conforme desce, entao
      // pingente deitado nele encosta pela ponta de baixo e afasta o topo. Cruz
      // vertical num peito inclinado boiava no ar pelo queixo.
      cruz.rotation.x = -0.35
      g.add(cruz)
      return g
    },
  },

  {
    id: 'bandana',
    nome: 'Bandana',
    metodo: 'lathe de secao FECHADA (pano com espessura) + no fundido + duas fitas montadas na mao',
    build(c) {
      const g = new THREE.Group()
      const COR = 0xb0342f
      const mPano = N.tecido(COR, 0.95)
      const mNo = N.tecido(N.esc(COR, 0.78), 0.95)
      // DoubleSide obrigatorio: a fita tem uma face so e ela vira de costas
      // quando a torcao passa de 90 graus — sem isto a ponta some no meio.
      const mFita = N.tecido2(N.esc(COR, 1.06), 0.95)

      // --- o rolo de pano ---------------------------------------------------
      // O perfil FECHA: sobe pela cara de fora, passa pela borda de cima e
      // volta pela cara de dentro ate o ponto inicial. Uma faixa aberta seria
      // uma casca de 0 mm e pela borda de cima se via o avesso.
      //
      // O desenho e RELATIVO ao par (R, Y_COLAR): [quanto pra fora do raio do
      // aro, quanto acima do centro]. Escrever os nove raios na mao era o que
      // fazia a bandana ser a unica das tres que nao acompanhava o corpo — e
      // quando a cabeca mudou de forma, a unica que nao dava pra corrigir num
      // numero so. A faixa tem 1,55 cm de altura, entao a meia-espessura que
      // raioAro() precisa saber e 7,75 mm.
      const H_PANO = 0.00775
      const R = raioAro(c, H_PANO)
      const perfil = [
        [R - 0.0015, Y_COLAR - 0.0080],
        [R + 0.0045, Y_COLAR - 0.0045],
        [R + 0.0060, Y_COLAR + 0.0000],
        [R + 0.0035, Y_COLAR + 0.0045],
        [R - 0.0035, Y_COLAR + 0.0075],
        [R - 0.0060, Y_COLAR + 0.0055],
        [R - 0.0025, Y_COLAR + 0.0000],
        [R - 0.0045, Y_COLAR - 0.0050],
        [R - 0.0015, Y_COLAR - 0.0080],
      ]
      g.add(N.sh(new THREE.Mesh(N.revolver(perfil, 20, c.medida.FLAT_Z), mPano)))

      // --- o no -------------------------------------------------------------
      // Fora do eixo de proposito (0.42 rad = 24 graus pra um lado): no de
      // bandana no meio da garganta le como gravata, e o desalinho e metade da
      // identidade da peca. Malha unica (fundida) porque o character.js empurra
      // peca solta uma por uma e as tres bolas do no descolariam entre si.
      // O no mora 1,2 cm por fora do rolo (a metade da propria grossura mais o
      // pano que ele amarra), no MESMO elipsoide do rolo — com o aro achatado
      // por FLAT_Z, um no colocado num circulo saltaria pra frente do peito.
      const aNo = 0.42
      // 2,5 mm ABAIXO do centro do rolo: o no e a peca mais alta do arquivo
      // (1,5 cm de meia-altura com a volta que o aperta) e era so ele que ainda
      // raspava 8,6 mm no queixo do cranio 'mandibula'. Descendo o no — e nao o
      // rolo — a bandana continua deitada na altura certa e o pano do no cai um
      // pouco, que e o que um no de pano faz mesmo.
      const rNo = R + 0.0120, yNo = Y_COLAR - 0.0025
      const cx = Math.sin(aNo) * rNo, cz = Math.cos(aNo) * rNo * c.medida.FLAT_Z
      const partesNo = []
      const bolo = new THREE.SphereGeometry(1, 10, 6)
      bolo.scale(0.0175, 0.0140, 0.0130)
      partesNo.push(bolo)
      for (const sgn of [1, -1]) {
        const orelha = new THREE.SphereGeometry(1, 8, 5)
        orelha.scale(0.0110, 0.0082, 0.0078)
        orelha.translate(sgn * 0.0150, -0.0058, -0.0015)
        partesNo.push(orelha)
      }
      // volta apertando o meio do no: e ela que conta que aquilo e um NO e nao
      // uma bola de pano grudada no pescoco
      const volta = new THREE.TorusGeometry(0.0120, 0.0033, 5, 10)
      volta.rotateY(Math.PI / 2)
      volta.scale(1, 1, 0.85)
      partesNo.push(volta)
      const no = N.sh(new THREE.Mesh(fundir(partesNo), mNo))
      no.position.set(cx, yNo, cz)
      g.add(no)

      // --- as duas pontas ---------------------------------------------------
      // Comprimentos e torcoes diferentes de proposito: iguais, as duas ficam
      // paralelas e a bandana vira um bibe. A curta cai pela clavicula, a longa
      // atravessa pro meio do peito. As duas saem do Z DO NO (ver fita()).
      // y0 sai do no (yNo - 6 e - 8 mm), nao de um numero fixo: o no desceu 1,3
      // cm junto com o aro e as fitas tem que descer com ele, senao nascem
      // penduradas no ar acima do proprio no.
      g.add(fita(c, mFita, {
        x0: cx + 0.007, x1: cx + 0.026, y0: yNo - 0.0060, y1: -0.0175,
        w0: 0.027, w1: 0.013, torcao: 0.95, zAlto: cz + 0.004,
      }))
      g.add(fita(c, mFita, {
        x0: cx - 0.005, x1: cx - 0.018, y0: yNo - 0.0080, y1: -0.0265,
        w0: 0.025, w1: 0.010, torcao: -1.35, zAlto: cz + 0.002,
      }))
      return g
    },
  },
]

export default COLARES
