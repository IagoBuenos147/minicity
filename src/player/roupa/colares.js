import * as THREE from 'three'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/colares.js — ancora: neck (origem na base do pescoco, +Z e a
// frente). Tres colares, TRES METODOS DE CONSTRUCAO diferentes:
//
//   1 'elos'      ELO POR ELO. 36 toros pequenos girados 90 graus alternadamente
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
// A) A CINTURA DE AMPULHETA. O colar nao mora "em volta do pescoco": mora no
//    unico ponto estreito entre o QUEIXO (que abre pra cima) e o OMBRO (que abre
//    pra baixo). Medido por raycast no boneco nu, em 12 setores, raio da
//    superficie por altura de MUNDO:
//
//      1.336 .0883   1.342 .0772   1.348 .0633   1.354 .0727   1.360 .0819
//      1.338 .0846   1.344 .0733   1.350 .0665   1.356 .0759   1.362 .0845
//      1.340 .0810   1.346 .0602   1.352 .0696   1.358 .0790
//
//    O gargalo e 6,0 cm em y = 1.346, e sobe 4,4 cm de raio por centimetro de
//    altura pros dois lados. Consequencia dura: um aro de MEIA-ESPESSURA h so
//    passa se o raio dele for maior que 0.060 + 4.4 * h. Um cordao fino (h =
//    3 mm) passa com 7,2 cm; a corrente de elos gordos (h = 9,7 mm) precisa de
//    8,8 cm. E por isso que as tres pecas deste arquivo tem raios DIFERENTES:
//    o raio nao e gosto, e a espessura de cada uma.
//
//    R_CORRENTE (RAIO_GOLA_ALTA + SOBRA_ACESSORIO = 5,95 cm) e MENOR que o
//    gargalo de 6,0 cm depois da reforma da cabeca — um aro desenhado nele
//    nasce dentro do queixo em qualquer altura. Ele continua sendo o PISO do
//    slot (nenhuma peca daqui nasce abaixo dele), mas parou de ser alvo.
//
// B) ARO E PECA SOLTA SAO OPOSTOS PRO character.js. O acomodarColarSobreARoupa
//    mede por raycast quanto de pano ha na frente e corrige: aro (centro NO
//    eixo) ele ABRE pela escala, peca solta (centro fora do eixo, z positivo)
//    ele EMPURRA pela posicao. Por isso a corrente de elos e UMA malha fundida
//    e centrada, e o pingente/no/franja sao malhas separadas la na frente.
//    Nada aqui le posicao ou escala de outra peca: o desenho e o natural, com
//    o raio saindo da tabela acima, e quem acomoda e o character.
// ---------------------------------------------------------------------------

const FZ_PESCOCO = 0.96   // o pescoco e redondo; 4% de oval so tira o ar de tubo

/**
 * Junta varias geometrias numa so. Aceita indexada e nao-indexada na mesma
 * lista (TorusGeometry vem com indice, ExtrudeGeometry nao).
 *
 * Existe por dois motivos, e o segundo importa mais que o primeiro: 36 elos
 * soltos sao 36 draw calls por boneco (720 com a tela cheia), e — pior — 36
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
      // 8,8 cm sai da conta do cabecalho: elo de 7,5 + 2,2 mm tem 9,7 mm de
      // meia-espessura, e 0.060 + 4.4 * 0.0097 = 0.0827 e o minimo que passa
      // pela cintura. 8,8 deixa 6 mm de sobra pros dois lados. Nao e "grande":
      // e a corrente mais FINA que cabe entre o queixo e o ombro deste boneco.
      const R = 0.0880
      const Y = 0.0445
      // 36 elos na volta de ~55 cm dao 15,4 mm de passo, praticamente o vao
      // interno do elo (2 * R_ELO = 15 mm): o passo bate com o vao e os elos se
      // ENFIAM um no outro em vez de ficarem enfileirados com folga. Mexer em
      // um dos dois numeros sem o outro desmonta a corrente. Numero PAR de
      // proposito: com impar os elos 0 e n-1 caem no mesmo giro e a emenda, que
      // fica bem na frente do pescoco, mostra dois elos deitados colados.
      const NE = 36
      const R_ELO = 0.0075, T_ELO = 0.0022

      /**
       * Curva da corrente. O mergulho e de so 2 mm (q = d^2, concentrado na
       * frente) e o que abre mesmo e o Z: a corrente afasta 13 mm do gogo. A
       * cintura da ampulheta nao deixa mergulhar: cada milimetro que a corrente
       * desce custa 4,4 mm de raio, e corrente que desce ate o esterno ficaria
       * com 20 cm de diametro. Quem quer peso no peito pendura pingente.
       */
      const ponto = (a, v) => {
        const d = (1 + Math.cos(a)) / 2
        const q = d * d
        return v.set(
          Math.sin(a) * (R + 0.006 * q),
          Y - 0.002 * q,
          Math.cos(a) * (R * FZ_PESCOCO + 0.013 * q),
        )
      }

      const P = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3()
      const T = new THREE.Vector3(), rad = new THREE.Vector3(), eixo = new THREE.Vector3()
      const xA = new THREE.Vector3(), yA = new THREE.Vector3()
      const esc = new THREE.Vector3()
      const M = new THREE.Matrix4()
      const molde = new THREE.TorusGeometry(R_ELO, T_ELO, 4, 8)
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
      // Cordao de 3 mm de raio: pela conta da cintura basta 0.060 + 4.4*0.003 =
      // 7,3 cm. 7,6 e a mesma folga de 3 mm que a corrente tem, num aro 1,2 cm
      // mais fino — e a peca mais discreta das tres de proposito.
      const R = 0.0760
      const Y_ARO = 0.0435, Y_TRAS = 0.0445, Y_FUNDO = 0.010
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
          Math.cos(a) * R * FZ_PESCOCO,
        ))
      }
      // metade da frente: a catenaria de verdade. O z acompanha a queda com
      // expoente 0.55 (e nao linear) porque o ombro abre 4,4 mm de raio por
      // milimetro de descida: com interpolacao reta os dois primeiros
      // milimetros da corda ja nasciam dentro da clavicula.
      const w = Math.sin(A_LADO) * R
      const zLado = Math.cos(A_LADO) * R * FZ_PESCOCO
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
        new THREE.TubeGeometry(curva, 72, 0.0030, 5, true), mFio,
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
      // A faixa tem 1,5 cm de altura, entao pela conta da cintura (0.060 +
      // 4.4*h, h = 7,5 mm) ela so passa a partir de 9,3 cm de raio — e por isso
      // que a bandana e a peca GORDA das tres. Nao e escolha estetica: com o
      // raio da corrente ela some metade dentro do ombro e metade dentro do
      // queixo. As bordas de cima e de baixo recolhem 1 cm (0.084 e 0.086)
      // porque e la que a ampulheta aperta.
      const perfil = [
        [0.0860, 0.0370],
        [0.0920, 0.0405],
        [0.0935, 0.0450],
        [0.0910, 0.0495],
        [0.0840, 0.0525],
        [0.0815, 0.0505],
        [0.0850, 0.0450],
        [0.0830, 0.0400],
        [0.0860, 0.0370],
      ]
      g.add(N.sh(new THREE.Mesh(N.revolver(perfil, 20, 0.98), mPano)))

      // --- o no -------------------------------------------------------------
      // Fora do eixo de proposito (0.42 rad = 24 graus pra um lado): no de
      // bandana no meio da garganta le como gravata, e o desalinho e metade da
      // identidade da peca. Malha unica (fundida) porque o character.js empurra
      // peca solta uma por uma e as tres bolas do no descolariam entre si.
      const aNo = 0.42
      const rNo = 0.1005, yNo = 0.0450
      const cx = Math.sin(aNo) * rNo, cz = Math.cos(aNo) * rNo * 0.98
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
      g.add(fita(c, mFita, {
        x0: cx + 0.007, x1: cx + 0.026, y0: 0.0390, y1: -0.0175,
        w0: 0.027, w1: 0.013, torcao: 0.95, zAlto: cz + 0.004,
      }))
      g.add(fita(c, mFita, {
        x0: cx - 0.005, x1: cx - 0.018, y0: 0.0370, y1: -0.0265,
        w0: 0.025, w1: 0.010, torcao: -1.35, zAlto: cz + 0.002,
      }))
      return g
    },
  },
]

export default COLARES
