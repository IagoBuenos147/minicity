import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import { soldarNormais } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/colares-extra.js — 5 colares NOVOS pra somar ao catalogo
// depois da poda (colares.js perde 'elos' e 'bandana'; so 'crucifixo' fica —
// a fiacao, inclusive o import/concat deste arquivo dentro de roupas.js, e
// feita por fora desta tarefa).
//
// O PADRAO A SEGUIR E O CRUCIFIXO, quase literal do dono: "o unico colar que
// ficou bom foi a cruz de prata... ele ficou um pouco CAIDO no pescoco, dando
// o aspecto de que e colar mesmo". O que faz o crucifixo CAIDO DE VERDADE (e
// nao so parecer) e a curva: metade ARO (lados/nuca) e metade CATENARIA DE
// VERDADE (resolvida por bisseccao, nao um arco de circulo) — a corda sai
// inclinada do ombro e achata no fundo, igual corda pendurada de verdade.
// Todo colar novo aqui reusa essa MESMA curva, extraida em curvaColar() logo
// abaixo (colares.js nao exporta a dela, e a tarefa proibe tocar naquele
// arquivo — o mesmo padrao que camisas-extra.js/calcas-extra.js/
// calcados-extra.js ja usam: reescrever o miolo local em vez de importar
// funcao nao-exportada).
//
// POR QUE O CORDAO/CORRENTE CONTINUA SENDO UMA MALHA SO (nuca+frente
// fundidas), em vez de dividido em duas: acomodarColarSobreARoupa()
// (character.js) classifica CADA MALHA do slot em duas familias — ARO (centro
// no eixo: abre por ESCALA) ou PECA SOLTA (centro fora do eixo: empurra por
// POSICAO) — e as duas correcoes sao fisicamente incompativeis num mesmo
// objeto. Se o aro (lados/nuca) e a catenaria (frente) fossem dois meshes
// separados, no dia em que uma roupa grossa exige correcao os dois podem
// classificar diferente (ou igual, mas com FALTA diferente — cada malha faz o
// proprio raycast) e abrem uma FRESTA exatamente onde a corda encontra o
// ombro. E exatamente o que o comentario B de colares.js explica pro
// pingente/no da corrente de elos/bandana. A solucao de la — malha fundida e
// centrada — vale aqui tambem: cordao ou corrente e SEMPRE UMA malha so.
//
// O GRUPO 'balanco': o dono vai fazer o colar balancar sozinho quando o
// personagem anda (ver animation.js, funcao balancarColar — hoje ela gira o
// SLOT inteiro; o pedido pra este arquivo foi preparar o terreno pra girar so
// a parte que deve se mover). Tudo que deve balancar (cordao/corrente +
// pingente) mora dentro de UM THREE.Group filho da raiz, nomeado 'balanco'.
// Nestes 5 desenhos nao existe nenhuma peca RIGIDA presa na nuca separada do
// cordao (o cordao inteiro e flexivel, do mesmo jeito que o do crucifixo) —
// entao o grupo 'balanco' aqui contem a peca INTEIRA e a raiz devolvida por
// build() nao guarda mais nada fora dele. Se um colar futuro tiver
// fecho/trava rigida de verdade, ela e que ficaria de fora do grupo.
//
// OS 5, cada um com METODO DIFERENTE (a mesma exigencia que o CONTRATO.md
// coloca pros outros catalogos — duas pecas que sao a mesma funcao com outra
// cor sao uma falha, nao economia):
//
//   corrente-grossa  ELO POR TORO achatado, alternando plano/de-pe (a tecnica
//                    do 'elos' que saiu do catalogo base), mas sobre a curva
//                    aro+catenaria do crucifixo em vez da elipse justa do
//                    peito — e o que da o "caindo em V" que o pedido quer.
//                    Sem pingente.
//   dog-tag          CORRENTE DE BOLINHAS (esferas fundidas ao longo da mesma
//                    curva — ball chain de verdade, nao elo) + duas placas de
//                    ExtrudeGeometry com chanfro e FURO (Shape com hole), uma
//                    por cima da outra.
//   medalhao         CORDAO DE COURO (tubo sobre a curva) + medalhao de LATHE
//                    (revolucao em Y, girada 90 graus pra encarar a camera)
//                    com aneis concentricos em relevo — "gravado" sem gastar
//                    textura.
//   dente            CORDAO TRANCADO — duas tiras finas espiralando em fase
//                    oposta ao redor da MESMA curva central (trana de couro
//                    de verdade, nao textura) + presa de LATHE com leve
//                    curvatura e capa de metal na raiz.
//   pingente-pedra   CORRENTE FINA (elo por toro, versao pequena da tecnica
//                    do corrente-grossa) + engaste de garras (a mesma familia
//                    do solitario de aneis.js, virado pra encarar a frente do
//                    peito em vez do dorso da mao) segurando uma pedra
//                    facetada.
// ---------------------------------------------------------------------------

/** Copiado de colares.js (nao exportado la): altura do aro no espaco do
 *  pescoco — logo abaixo de onde o queixo de qualquer cranio comeca a abrir e
 *  ainda em cima do torax. Ver a explicacao completa (secao A) em colares.js. */
const Y_COLAR = 0.032

/** Copiado de colares.js: raio do aro a partir do proprio perfil do corpo —
 *  nenhum colar aqui escreve raio na mao. `h` e a meia-espessura da peca. */
function raioAro(c, h) {
  const pele = N.raioPerfil(c.perfil.PEITO, Y_COLAR + c.medida.NECK_Y)
  return pele * N.FOLGA_LARGA + N.SOBRA_ACESSORIO + 2 * h
}

/** Copiado de colares.js: parametro `a` da catenaria y=a*(cosh(x/a)-1) que
 *  cai `flecha` num meio-vao `w`, por bisseccao (sem forma fechada). */
function catenaria(w, flecha) {
  let lo = 1e-4, hi = 10
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2
    if (m * (Math.cosh(w / m) - 1) > flecha) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}

/** Copiado de colares.js: funde geometrias indexadas/nao-indexadas numa so.
 *  BufferGeometryUtils mora em three/examples e este catalogo nao traz
 *  dependencia nova. O motivo de fundir nao e so draw call — e devolver o
 *  centro pro eixo pra acomodarColarSobreARoupa classificar a peca certo
 *  (ver o cabecalho deste arquivo). */
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
 * A curva do crucifixo (colares.js), extraida: aro nos lados/nuca entre
 * aLado e 2pi-aLado, catenaria DE VERDADE (bisseccao) na frente entre -aLado
 * e aLado, tudo num laco FECHADO so (CatmullRomCurve3 'centripetal' — a mesma
 * escolha do crucifixo: uniform da overshoot no canto do ombro e enfia o laco
 * dentro do pescoco). `yFundo` escolhe onde o ponto mais baixo da curva cai;
 * cada colar deste arquivo escolhe o proprio, do mesmo jeito que o crucifixo
 * escolhe Y_FUNDO = 0.010.
 *
 * Devolve a curva pronta e o ponto do fundo (`fundo`), que quem chama usa pra
 * plantar pingente/argola exatamente onde a corda termina.
 */
function curvaColar(c, R, aLado, yFundo) {
  const FZ = c.medida.FLAT_Z
  const pts = []
  const NB = 14
  for (let i = 0; i <= NB; i++) {
    const a = aLado + (Math.PI * 2 - 2 * aLado) * (i / NB)
    const d = (1 - Math.cos(a)) / 2
    pts.push(new THREE.Vector3(Math.sin(a) * R, Y_COLAR + 0.001 * d, Math.cos(a) * R * FZ))
  }
  const w = Math.sin(aLado) * R
  const zLado = Math.cos(aLado) * R * FZ
  const zFundo = N.frentePeito(c, yFundo + c.medida.NECK_Y)
  const aCat = catenaria(w, Y_COLAR - yFundo)
  const NF = 12
  for (let i = 1; i < NF; i++) {
    const x = -w + 2 * w * (i / NF)
    const y = yFundo + aCat * (Math.cosh(x / aCat) - 1)
    const t = (Y_COLAR - y) / (Y_COLAR - yFundo)
    pts.push(new THREE.Vector3(x, y, zLado + (zFundo - zLado) * Math.pow(t, 0.55)))
  }
  const curva = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
  return { curva, fundo: new THREE.Vector3(0, yFundo, zFundo), zFundo, w, zLado }
}

/**
 * Elo por elo ao longo de QUALQUER curva fechada (a mesma ideia do 'elos' de
 * colares.js, generalizada: la a curva era sempre a elipse do peito, aqui e a
 * curva de curvaColar()). Anda em passo IGUAL de comprimento de arco
 * (getPointAt reparametriza por comprimento real), alterna o elo deitado/
 * de-pe — e o alternado que le como elos ENTRELACADOS; todos no mesmo plano
 * viram serrilha chapada, mesma explicacao de colares.js — e devolve as pecas
 * SOLTAS pra quem chama fundir com o resto (pingente, argola).
 */
function elosNaCurva(curva, n, rElo, tElo, ladosAnel = 6) {
  const P = new THREE.Vector3(), Pa = new THREE.Vector3(), Pb = new THREE.Vector3()
  const T = new THREE.Vector3(), rad = new THREE.Vector3(), eixo = new THREE.Vector3()
  const xA = new THREE.Vector3(), yA = new THREE.Vector3()
  const M = new THREE.Matrix4()
  const molde = new THREE.TorusGeometry(rElo, tElo, 4, ladosAnel)
  const pecas = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    curva.getPointAt(t, P)
    curva.getPointAt((t + 0.01) % 1, Pa)
    curva.getPointAt((t - 0.01 + 1) % 1, Pb)
    T.subVectors(Pa, Pb).normalize()
    rad.set(P.x, 0, P.z)
    if (rad.lengthSq() < 1e-8) rad.set(1, 0, 0)
    else rad.normalize()
    if (i % 2) eixo.copy(rad)
    else eixo.crossVectors(T, rad).normalize()
    xA.copy(T).addScaledVector(eixo, -T.dot(eixo)).normalize()
    yA.crossVectors(eixo, xA)
    M.makeBasis(xA, yA, eixo)
    M.setPosition(P)
    pecas.push(molde.clone().applyMatrix4(M))
  }
  molde.dispose()
  return pecas
}

/** Corrente de bolinhas fundidas ao longo da curva — ball chain de verdade,
 *  nao elo. Esferas leves (4x4) porque o orcamento e 2500 triangulos pro
 *  colar INTEIRO, pingente incluso, e uma corrente fina pede muita conta. */
function bolinhasNaCurva(curva, n, r) {
  const P = new THREE.Vector3()
  const molde = new THREE.SphereGeometry(r, 4, 4)
  const pecas = []
  for (let i = 0; i < n; i++) {
    curva.getPointAt(i / n, P)
    const g = molde.clone()
    g.translate(P.x, P.y, P.z)
    pecas.push(g)
  }
  molde.dispose()
  return pecas
}

/**
 * Cordao trancado: DUAS tiras finas (fase oposta, pi rad) espiralando em
 * volta da MESMA curva central — a trana de couro classica de duas pontas.
 * `voltas` e quantas voltas completas a espiral da no comprimento inteiro da
 * curva fechada.
 */
function trancar(curva, nSeg, raioTranca, voltas, raioFio, mat) {
  const P = new THREE.Vector3(), Pa = new THREE.Vector3(), Pb = new THREE.Vector3()
  const T = new THREE.Vector3(), rad = new THREE.Vector3(), eixo = new THREE.Vector3()
  const tiras = []
  for (const fase of [0, Math.PI]) {
    const pts = []
    for (let i = 0; i <= nSeg; i++) {
      const t = (i / nSeg) % 1
      curva.getPointAt(t, P)
      curva.getPointAt((t + 0.01) % 1, Pa)
      curva.getPointAt((t - 0.01 + 1) % 1, Pb)
      T.subVectors(Pa, Pb).normalize()
      rad.set(P.x, 0, P.z)
      if (rad.lengthSq() < 1e-8) rad.set(1, 0, 0)
      else rad.normalize()
      eixo.crossVectors(T, rad).normalize()
      const ang = voltas * Math.PI * 2 * t + fase
      const co = Math.cos(ang), si = Math.sin(ang)
      pts.push(new THREE.Vector3(
        P.x + (rad.x * co + eixo.x * si) * raioTranca,
        P.y + (rad.y * co + eixo.y * si) * raioTranca,
        P.z + (rad.z * co + eixo.z * si) * raioTranca,
      ))
    }
    const c2 = new THREE.CatmullRomCurve3(pts, true, 'centripetal')
    tiras.push(new THREE.TubeGeometry(c2, nSeg, raioFio, 5, true))
  }
  return N.sh(new THREE.Mesh(fundir(tiras), mat))
}

/**
 * Pedra lapidada facetada, adaptada de aneis.js (mesma ideia: esfera de 8
 * lados com o topo grampeado vira mesa+coroa+pavilhao — 64 triangulos, ver
 * explicacao completa la). LA a mesa gira pra encarar o dorso da mao
 * (rotateZ); AQUI ela gira pra encarar a FRENTE do peito (rotateX), porque
 * quem olha um pingente esta na frente do personagem, nao do lado da mao.
 */
function pedraLapidada(rCintura, meiaAltura, mat) {
  const MESA = 0.62
  const g = new THREE.SphereGeometry(1, 8, 5)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > MESA) pos.setY(i, MESA)
  pos.needsUpdate = true
  g.scale(rCintura, meiaAltura, rCintura)
  g.rotateX(Math.PI / 2)   // +Y (a mesa) vira +Z: a pedra passa a encarar a
                            // camera em vez de encarar pra cima
  return N.sh(new THREE.Mesh(g, mat))
}

/**
 * Uma garra do engaste, adaptada de aneis.js (garra() la, mesma ideia: haste
 * que ABRE conforme sobe — o pavilhao afina enquanto desce, garra reta so
 * encostaria na ponta — mais a bolinha que dobra por cima da coroa, porque a
 * coroa e CONVEXA e um segmento reto entre dois pontos da superficie passa
 * por dentro dela). So os eixos trocam: la o pavilhao apontava em -X (dorso
 * da mao) com azimute girando em Y-Z; aqui aponta em -Z (pra dentro do peito)
 * com azimute girando em X-Y, porque pedraLapidada() daqui encara +Z.
 * Parametrizada pelo tamanho real da pedra (rCintura/meiaAltura), em vez de
 * milimetro escrito na mao, porque a pedra do colar nao tem o mesmo tamanho
 * da do anel.
 */
function garraColar(azimute, rCintura, meiaAltura, mat) {
  const g = new THREE.Group()
  const ca = Math.cos(azimute), sa = Math.sin(azimute)
  const base = new THREE.Vector3(rCintura * 0.55 * ca, rCintura * 0.55 * sa, -meiaAltura * 0.60)
  const topo = new THREE.Vector3(rCintura * ca, rCintura * sa, 0)
  const eixo = new THREE.Vector3().subVectors(topo, base)
  const comp = eixo.length()
  const haste = N.malha(new THREE.CylinderGeometry(rCintura * 0.095, rCintura * 0.135, comp, 5), mat)
  haste.position.copy(base).addScaledVector(eixo, 0.5)
  haste.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eixo.clone().normalize())
  g.add(haste)
  const rPonta = rCintura * 0.90
  const ponta = N.malha(new THREE.SphereGeometry(rCintura * 0.13, 5, 4), mat,
    rPonta * ca, rPonta * sa, meiaAltura * 0.18)
  g.add(ponta)
  return g
}

export const COLARES_EXTRA = [
  {
    id: 'corrente-grossa',
    nome: 'Corrente cubana',
    metodo: 'elo por toro achatado alternando plano/de-pe sobre a curva aro+catenaria do crucifixo (nao a elipse justa do peito), fundido numa malha so — sem pingente, caindo em V',
    build(c) {
      const g = new THREE.Group()
      const balanco = new THREE.Group()
      balanco.name = 'balanco'
      g.add(balanco)

      const A_LADO = 0.58
      // mergulho mais fundo que o crucifixo (22 -> 26 mm): e ele que faz uma
      // corrente grossa ler como "caindo em V" e nao "aro justo com um vinco"
      const Y_FUNDO = 0.006
      const NE = 38   // bem menos elos que o 'elos' do catalogo base (50): elo
                       // GROSSO e mais espacado — poucos elos GRANDES, nao
                       // muitos pequenos, e o que separa "grossa" de "fina"

      // duas passadas pra convergir R (o raio depende do elo, o elo depende
      // do raio — mesma ressalva de colares.js)
      let R = raioAro(c, 0.0060)
      let cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      let R_ELO = cc.curva.getLength() / NE / 2
      R = raioAro(c, R_ELO * 1.42)
      cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      R_ELO = cc.curva.getLength() / NE / 2
      // elo bem mais CHATO/grosso que o do catalogo base (0.293): e a
      // proporcao que le como corrente cubana grossa em vez de corrente fina
      const T_ELO = R_ELO * 0.42

      const elos = elosNaCurva(cc.curva, NE, R_ELO, T_ELO, 6)
      balanco.add(N.sh(new THREE.Mesh(fundir(elos), N.metal(0xcfa02e))))
      return g
    },
  },

  {
    id: 'dog-tag',
    nome: 'Dog tag',
    metodo: 'corrente de bolinhas fundidas (ball chain) sobre a curva aro+catenaria + duas placas de ExtrudeGeometry com chanfro e furo (Shape com hole), uma sobreposta a outra',
    build(c) {
      const g = new THREE.Group()
      const balanco = new THREE.Group()
      balanco.name = 'balanco'
      g.add(balanco)

      const NECK = c.medida.NECK_Y
      const A_LADO = 0.56
      const Y_FUNDO = 0.008
      const NB = 44

      let R = raioAro(c, 0.0034)
      let cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      R = raioAro(c, cc.curva.getLength() / NB / 2 + 0.0006)
      cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      const rBola = cc.curva.getLength() / NB / 2
      const mAco = N.metal(0x9aa0a6)
      const bolas = bolinhasNaCurva(cc.curva, NB, rBola)
      balanco.add(N.sh(new THREE.Mesh(fundir(bolas), mAco)))

      // --- as duas placas ---------------------------------------------------
      // Contorno com canto arredondado (curva quadratica nos quatro vertices)
      // + FURO oval perto da ponta de cima, por onde passaria a correntinha —
      // o detalhe que faz ler "placa militar" e nao "retangulo de metal".
      const placaGeo = (larg, alt, esp, furoY) => {
        const s = new THREE.Shape()
        const hx = larg / 2, hy = alt / 2, rC = 0.0028
        s.moveTo(-hx + rC, -hy)
        s.lineTo(hx - rC, -hy); s.quadraticCurveTo(hx, -hy, hx, -hy + rC)
        s.lineTo(hx, hy - rC); s.quadraticCurveTo(hx, hy, hx - rC, hy)
        s.lineTo(-hx + rC, hy); s.quadraticCurveTo(-hx, hy, -hx, hy - rC)
        s.lineTo(-hx, -hy + rC); s.quadraticCurveTo(-hx, -hy, -hx + rC, -hy)
        const furo = new THREE.Path()
        furo.absellipse(0, furoY, 0.0026, 0.0040, 0, Math.PI * 2, false, 0)
        s.holes.push(furo)
        const geo = new THREE.ExtrudeGeometry(s, {
          depth: esp, bevelEnabled: true, bevelThickness: 0.0006,
          bevelSize: 0.0006, bevelSegments: 1, curveSegments: 4, steps: 1,
        })
        geo.computeBoundingBox()
        const cz = (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2
        geo.translate(0, 0, -cz)
        return geo
      }

      // Placa de TRAS primeiro (mais alta, mais reta) — a de CIMA (mais baixa,
      // mais tombada) e que teria de aparecer por cima dela na tela; ordem de
      // insercao nao decide isso (as duas sao opacas, quem decide e o
      // z-buffer), mas deixar a mais reta atras e a mais tombada na frente e
      // como duas placas soltas realmente se acomodam par a par.
      const yBase = Y_FUNDO - 0.006
      const zA = N.frentePeito(c, yBase + NECK)
      const a = N.sh(new THREE.Mesh(placaGeo(0.026, 0.042, 0.0018, 0.013), mAco))
      a.position.set(-0.0040, yBase, zA)
      a.rotation.set(-0.10, 0.08, 0.05)
      balanco.add(a)

      // 14 mm de separacao em Y (1/3 da altura da placa, nao 1/6 como antes):
      // com pouca separacao as duas siluetas se fundiam num borrao so na
      // tela — separar de verdade E o que faz ler "duas placas", nao so a
      // geometria por baixo.
      const mAco2 = N.metal(0x83898f)
      const yB = yBase - 0.014
      const zB = N.frentePeito(c, yB + NECK) + 0.0020
      const b = N.sh(new THREE.Mesh(placaGeo(0.026, 0.042, 0.0018, 0.013), mAco2))
      b.position.set(0.0045, yB, zB)
      b.rotation.set(-0.16, -0.12, -0.09)
      balanco.add(b)

      // argola: prende a corrente nas duas placas, no fundo da curva
      const arg = N.anel(0.0040, 0.0013, mAco, 5, 10)
      arg.rotation.y = Math.PI / 2
      arg.position.copy(cc.fundo)
      balanco.add(arg)
      return g
    },
  },

  {
    id: 'medalhao',
    nome: 'Medalhao de couro',
    metodo: 'cordao de couro (tubo sobre a curva aro+catenaria) + medalhao de LATHE (revolucao em Y girada 90 graus pra encarar a camera) com aneis concentricos em relevo',
    build(c) {
      const g = new THREE.Group()
      const balanco = new THREE.Group()
      balanco.name = 'balanco'
      g.add(balanco)

      const NECK = c.medida.NECK_Y
      const A_LADO = 0.60
      const Y_FUNDO = 0.002
      const R_FIO = 0.0034
      const R = raioAro(c, R_FIO)
      const { curva, fundo } = curvaColar(c, R, A_LADO, Y_FUNDO)

      const mCouro = N.couro(0x6b4328)
      balanco.add(N.sh(new THREE.Mesh(
        new THREE.TubeGeometry(curva, 64, R_FIO, 6, true), mCouro,
      )))

      // argola de metal prendendo o medalhao no cordao (bronze/ouro velho —
      // contraste quente contra o couro escuro)
      const mMetal = N.metal(0xb99552)
      const arg = N.anel(0.0044, 0.0015, mMetal, 5, 10)
      arg.rotation.y = Math.PI / 2
      arg.position.copy(fundo)
      balanco.add(arg)

      // --- o medalhao: perfil fechado (frente -> borda -> costas) revolvido
      // em Y (como um coco/vaso) e depois girado 90 graus pra encarar +Z. Os
      // DOIS degraus do perfil (0.0004->0.0022 e 0.0022->0.0008) viram dois
      // aneis concentricos em relevo na frente — a leitura de "gravado" sem
      // gastar um pixel de textura.
      const RM = 0.0185
      const perfil = [
        [0, 0.0016], [RM * 0.55, 0.0016], [RM * 0.55, 0.0004], [RM * 0.72, 0.0004],
        [RM * 0.72, 0.0022], [RM * 0.90, 0.0022], [RM * 0.90, 0.0008], [RM, 0.0008],
        [RM, -0.0008], [RM * 0.90, -0.0016], [RM * 0.55, -0.0016], [0, -0.0016],
      ]
      const geoMed = N.revolver(perfil, 22, 1, 0, Math.PI * 2)
      geoMed.rotateX(Math.PI / 2)
      const yMed = Y_FUNDO - 0.021
      const zMed = N.frentePeito(c, yMed + NECK)
      const med = N.sh(new THREE.Mesh(geoMed, mMetal))
      med.position.set(0, yMed, zMed)
      // tombo pra tras, igual o crucifixo: o torax abre pra fora conforme
      // desce, entao pingente deitado nele encosta pela ponta de baixo
      med.rotation.x = -0.30
      balanco.add(med)

      // fiozinho ligando a argola ao medalhao (senao ele parece flutuar
      // solto, descolado do cordao)
      const dy = fundo.y - yMed, dz = fundo.z - zMed
      const elo2 = N.tubo(0.0014, 0.0014, Math.hypot(dy, dz), mMetal, 5)
      elo2.position.set(0, (fundo.y + yMed) / 2, (fundo.z + zMed) / 2)
      elo2.rotation.x = Math.atan2(-dz, -dy)
      balanco.add(elo2)
      return g
    },
  },

  {
    id: 'dente',
    nome: 'Presa tribal',
    metodo: 'cordao de couro TRANCADO (duas tiras espiralando em fase oposta ao redor da mesma curva central) + presa de LATHE com leve curvatura e capa de metal na raiz',
    build(c) {
      const g = new THREE.Group()
      const balanco = new THREE.Group()
      balanco.name = 'balanco'
      g.add(balanco)

      const NECK = c.medida.NECK_Y
      const A_LADO = 0.62
      const Y_FUNDO = 0.004
      const R_TRANCA = 0.0044
      const R = raioAro(c, R_TRANCA + 0.0016)
      const { curva, fundo } = curvaColar(c, R, A_LADO, Y_FUNDO)

      const mCouro = N.couro(0x4a3320)
      balanco.add(trancar(curva, 60, R_TRANCA, 5.5, 0.0016, mCouro))

      const mMetal = N.metal(0xb8b0a0)   // peltre/prata velha — tribal, nao polido
      const arg = N.anel(0.0040, 0.0014, mMetal, 5, 10)
      arg.rotation.y = Math.PI / 2
      arg.position.copy(fundo)
      balanco.add(arg)

      // --- a presa: LATHE de perfil organico (raiz larga, corpo afinando,
      // ponta fina) — ja nasce de cabeca pra baixo porque o proprio perfil
      // desce em Y, sem precisar girar como o medalhao.
      const perfilDente = [
        [0.0068, 0.0000], [0.0071, -0.0020], [0.0066, -0.0050], [0.0055, -0.0090],
        [0.0040, -0.0130], [0.0022, -0.0168], [0.0007, -0.0195], [0.0000, -0.0205],
      ]
      const geoDente = N.revolver(perfilDente, 10, 1, 0, Math.PI * 2)
      // leve curvatura pra frente — presa/dente de verdade nao e um cone reto.
      // Cisalhamento simples (desloca em Z proporcional a y^2, sem tocar no
      // raio, que e quem da a silhueta) — e por isso, e nao por acidente, que
      // revolver()/soldarNormais() roda de NOVO depois: mexer na posicao
      // sem resoldar a costura da lathe reabriria a listra vertical que
      // soldarNormais existe pra apagar (nucleo.js, regra 6).
      const posD = geoDente.attributes.position
      for (let i = 0; i < posD.count; i++) {
        const y = posD.getY(i)
        posD.setZ(i, posD.getZ(i) + 3.2 * y * y)
      }
      posD.needsUpdate = true
      geoDente.computeVertexNormals()
      soldarNormais(geoDente)

      const mOsso = solid(0xe8ddc4, 0.55, 0.02)
      const yDente = Y_FUNDO - 0.006
      const zDente = N.frentePeito(c, yDente + NECK)
      const dente = N.sh(new THREE.Mesh(geoDente, mOsso))
      dente.position.set(0, yDente, zDente)
      dente.rotation.x = -0.20
      balanco.add(dente)

      // capa de metal na raiz (onde o cordao "prende" o dente)
      const capa = N.tubo(0.0075, 0.0060, 0.0060, mMetal, 10)
      capa.position.set(0, yDente + 0.0012 * Math.cos(dente.rotation.x),
        zDente - 0.0012 * Math.sin(dente.rotation.x))
      capa.rotation.x = dente.rotation.x
      balanco.add(capa)

      // fiozinho da argola ate a capa
      const dy = fundo.y - capa.position.y, dz = fundo.z - capa.position.z
      const fio = N.tubo(0.0013, 0.0013, Math.hypot(dy, dz), mMetal, 5)
      fio.position.set(0, (fundo.y + capa.position.y) / 2, (fundo.z + capa.position.z) / 2)
      fio.rotation.x = Math.atan2(-dz, -dy)
      balanco.add(fio)
      return g
    },
  },

  {
    id: 'pingente-pedra',
    nome: 'Pedra em garras',
    metodo: 'corrente fina (elo por toro, versao pequena da tecnica do corrente-grossa) + engaste de garras (a mesma familia do solitario de aneis.js, virado pra encarar a frente) segurando uma pedra facetada',
    build(c) {
      const g = new THREE.Group()
      const balanco = new THREE.Group()
      balanco.name = 'balanco'
      g.add(balanco)

      const NECK = c.medida.NECK_Y
      const A_LADO = 0.56
      // corrente curta e delicada de proposito — pedra solitaria fica perto
      // da base do pescoco, nao descendo o peito inteiro como as outras
      const Y_FUNDO = 0.014
      // MAIS elos que o corrente-grossa (44) apesar do mesmo orcamento: e
      // NUMERO DE ELOS, e nao so a espessura do fio, que separa uma corrente
      // fina de uma grossa — elo pequeno demais pro proprio raio vira conta
      // solta em vez de elo entrelacado, entao ladosAnel cai pra 4 (32
      // triangulos/elo em vez de 40) pra abrir espaco no orcamento.
      const NE = 56

      let R = raioAro(c, 0.0026)
      let cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      let R_ELO = cc.curva.getLength() / NE / 2
      R = raioAro(c, R_ELO * 1.30)
      cc = curvaColar(c, R, A_LADO, Y_FUNDO)
      R_ELO = cc.curva.getLength() / NE / 2
      const T_ELO = R_ELO * 0.30

      const mPrata = N.metal(0xd7dae0)
      const elos = elosNaCurva(cc.curva, NE, R_ELO, T_ELO, 4)
      balanco.add(N.sh(new THREE.Mesh(fundir(elos), mPrata)))

      // --- engaste + pedra ---------------------------------------------------
      // Maior que uma pedra de anel de proposito: de longe uma pedra do
      // tamanho da de aneis.js (6,8/6,4 mm) some contra o peito — o pingente
      // de colar precisa ler a 2-3 m, o anel so precisa ler em close.
      const R_GEMA = 0.0100, H_GEMA = 0.0092
      const yGema = Y_FUNDO - 0.010
      const zGema = N.frentePeito(c, yGema + NECK)
      const eng = new THREE.Group()
      eng.position.set(0, yGema, zGema)
      eng.rotation.x = -0.25
      balanco.add(eng)

      // cesto atras da pedra: base do engaste (o toro ja nasce deitado no
      // plano XY, que e o mesmo plano da cintura da pedra — nenhuma rotacao
      // extra necessaria, diferente da argola do cordao)
      const cesto = N.anel(0.0052, 0.0011, mPrata, 5, 10)
      cesto.position.z = -0.0020
      eng.add(cesto)

      for (let i = 0; i < 4; i++) {
        eng.add(garraColar(Math.PI / 4 + i * Math.PI / 2, R_GEMA, H_GEMA, mPrata))
      }

      // safira clara: roughness quase zero pro especular virar ponto duro, e
      // um pingo de emissive porque a cena nao tem environment map — sem ele
      // a gema fica um vidro fosco e some contra o metal na sombra do corpo
      // (mesma razao do solitario em aneis.js).
      const gema = solid(0x63d2e0, 0.05, 0.0, {
        flatShading: true, emissive: 0x1c7e8c, emissiveIntensity: 0.55,
      })
      eng.add(pedraLapidada(R_GEMA, H_GEMA, gema))

      // fio da argola do cordao ate o cesto do engaste
      const dy = cc.fundo.y - yGema, dz = cc.fundo.z - zGema
      const fio = N.tubo(0.0013, 0.0013, Math.hypot(dy, dz), mPrata, 5)
      fio.position.set(0, (cc.fundo.y + yGema) / 2, (cc.fundo.z + zGema) / 2)
      fio.rotation.x = Math.atan2(-dz, -dy)
      balanco.add(fio)
      const argF = N.anel(0.0036, 0.0012, mPrata, 5, 10)
      argF.rotation.y = Math.PI / 2
      argF.position.copy(cc.fundo)
      balanco.add(argF)
      return g
    },
  },
]

export default COLARES_EXTRA
