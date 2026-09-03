import * as THREE from 'three'
import { solid, stdMat, tex, box, cyl } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/frutas.js — A FRUTEIRA DO BAR, fruta por fruta.
//
// POR QUE UM ARQUIVO SO PRA ISTO. Uma laranja modelada como esfera laranja e a
// coisa mais rapida de escrever e a que mais denuncia o jogo: seis esferas de
// cores diferentes numa bandeja lem como bolinhas de gude, nao como fruteira. O
// que separa uma coisa da outra e SILHUETA (o limao e um ovo com bico dos dois
// lados, o morango e um cone, o abacaxi e um barril com coroa) e SUPERFICIE (a
// casca da laranja tem poro, a do abacaxi tem escama, o morango tem semente
// afundada). Cada uma dessas duas coisas resolve numa tecnica diferente, e e
// por isso que valem um arquivo.
//
// AS TRES REGRAS, herdadas de mobilia/bebidas.js e mobilia/copos.js:
//
//   1. SILHUETA PRIMEIRO. A camera do modo barman chega a vinte centimetros da
//      fruta. Perfil de torno com os pontos certos custa uma malha e da a curva
//      inteira; empilhar primitivas custa varias e mostra os degraus.
//   2. ORCAMENTO DURO — no maximo 5 malhas por fruta. Elas aparecem as duzias
//      na estante, e detalhe repetido (escama, semente, folha da coroa) vai
//      SEMPRE de InstancedMesh.
//   3. COR REPARTIDA VAI DE TEXTURA. A polpa de uma rodela de limao e um
//      desenho radial; em geometria seriam doze gomos por rodela e cada rodela
//      tem duas faces. Em canvas e um desenho de vinte linhas, e ele nasce
//      redondo porque a tampa de um cilindro ja recebe UV em disco.
//
// ESCALA REAL, EM METROS, E CADA FRUTA COM A BASE EM y=0, centrada em x/z —
// mesmo contrato das bebidas, porque quem poe fruta na bandeja, na tabua de
// corte e na mao do jogador e o mesmo codigo que ja poe garrafa na prateleira.
//
// AS RODELAS SAO PECAS SEPARADAS e nao um estado da fruta: uma rodela nao e uma
// laranja menor, e um objeto de outra forma, com outra face e outra funcao (ela
// vai na BORDA do copo). Cortar, no jogo, e trocar uma peca por N da outra.
// ---------------------------------------------------------------------------

// --- texturas ---------------------------------------------------------------

/**
 * Casca de citrico: poro. E o unico detalhe que faz uma esfera laranja parar de
 * ler como bola de plastico, e ele nao pode ser geometria (seriam centenas de
 * covinhas por fruta). Duas camadas de pontos, uma clara e uma escura, dao a
 * textura granulada sem virar chuvisco.
 */
function cascaTex(chave, base, claro, escuro) {
  return tex('fruta-casca:' + chave, 256, (g, s) => {
    g.fillStyle = base
    g.fillRect(0, 0, s, s)
    // manchas largas primeiro: casca de fruta nao tem cor uniforme, tem lados
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 18 + Math.random() * 46
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, (Math.random() < 0.5 ? claro : escuro).replace(')', ',0.20)').replace('rgb', 'rgba'))
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gr
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    // o poro: 1400 pontinhos escuros com um realce claro em cima e a direita.
    // O par (sombra + realce) e o que faz o poro parecer AFUNDADO — so o ponto
    // escuro sozinho le como sujeira.
    for (let i = 0; i < 1400; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const r = 0.8 + Math.random() * 1.6
      g.fillStyle = escuro.replace(')', ',' + (0.20 + Math.random() * 0.35) + ')').replace('rgb', 'rgba')
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
      g.fillStyle = claro.replace(')', ',0.28)').replace('rgb', 'rgba')
      g.beginPath(); g.arc(x + r * 0.5, y - r * 0.5, r * 0.55, 0, 7); g.fill()
    }
  })
}

/**
 * POLPA DE CITRICO, vista de cima — o desenho da rodela.
 *
 * A tampa de um CylinderGeometry recebe UV EM DISCO: o centro do canvas cai no
 * centro da tampa e o raio do canvas no raio da tampa. Isso e exatamente o que
 * um corte de laranja pede, e e a razao de a rodela ser um cilindro raso com
 * textura em vez de doze gomos de geometria. (Em barril.js a mesma UV em disco
 * foi um PROBLEMA — la a textura era de listras verticais e virava um leque.
 * A diferenca e que aqui o desenho E radial.)
 */
function polpaTex(chave, casca, polpa, veio, gomos) {
  return tex('fruta-polpa:' + chave, 256, (g, s) => {
    const c = s / 2
    g.clearRect(0, 0, s, s)
    // casca por fora
    g.fillStyle = casca
    g.beginPath(); g.arc(c, c, c * 0.98, 0, 7); g.fill()
    // albedo (a parte branca logo abaixo da casca)
    g.fillStyle = '#f6f1e2'
    g.beginPath(); g.arc(c, c, c * 0.90, 0, 7); g.fill()
    // os gomos: setores separados por uma nervura branca
    const n = gomos || 10
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + 0.045
      const a1 = ((i + 1) / n) * Math.PI * 2 - 0.045
      g.fillStyle = polpa
      g.beginPath()
      g.moveTo(c, c)
      g.arc(c, c, c * 0.855, a0, a1)
      g.closePath()
      g.fill()
      // os fiapos de suco dentro do gomo, no sentido do raio
      g.strokeStyle = veio
      g.lineWidth = 1.2
      for (let k = 0; k < 7; k++) {
        const a = a0 + (a1 - a0) * ((k + 0.5) / 7)
        g.beginPath()
        g.moveTo(c + Math.cos(a) * c * 0.16, c + Math.sin(a) * c * 0.16)
        g.lineTo(c + Math.cos(a) * c * 0.82, c + Math.sin(a) * c * 0.82)
        g.stroke()
      }
    }
    // o miolo
    g.fillStyle = '#f4efdd'
    g.beginPath(); g.arc(c, c, c * 0.10, 0, 7); g.fill()
  })
}

/** Escama do abacaxi: losangos em duas diagonais, com um olho no meio. */
function abacaxiTex() {
  return tex('fruta-abacaxi-casca', 256, (g, s) => {
    g.fillStyle = '#a8801e'
    g.fillRect(0, 0, s, s)
    const n = 9
    const p = s / n
    for (let y = -1; y < n + 1; y++) {
      for (let x = -1; x < n + 1; x++) {
        const cx = x * p + (y % 2 ? p * 0.5 : 0)
        const cy = y * p
        // o losango
        g.fillStyle = 'rgba(146,106,22,' + (0.55 + Math.random() * 0.35) + ')'
        g.beginPath()
        g.moveTo(cx, cy - p * 0.5)
        g.lineTo(cx + p * 0.5, cy)
        g.lineTo(cx, cy + p * 0.5)
        g.lineTo(cx - p * 0.5, cy)
        g.closePath()
        g.fill()
        // a borda clara do losango
        g.strokeStyle = 'rgba(214,178,72,0.75)'
        g.lineWidth = 2.2
        g.stroke()
        // o olho escuro no centro, com o tufo
        g.fillStyle = 'rgba(60,40,12,0.72)'
        g.beginPath(); g.arc(cx, cy, p * 0.13, 0, 7); g.fill()
        g.strokeStyle = 'rgba(92,110,40,0.60)'
        g.lineWidth = 1.6
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + p * 0.16, cy - p * 0.20); g.stroke()
      }
    }
  })
}

const M = {
  get laranja() { return stdMat('fruta-laranja', { map: cascaTex('laranja', '#e5811a', 'rgb(255,196,110)', 'rgb(140,70,8)'), roughness: 0.86 }) },
  get limao() { return stdMat('fruta-limao', { map: cascaTex('limao', '#b9cf2c', 'rgb(226,240,140)', 'rgb(92,110,18)'), roughness: 0.84 }) },
  get abacaxiCasca() { return stdMat('fruta-abacaxi-mat', { map: abacaxiTex(), roughness: 0.92 }) },
  get folha() { return solid(0x3f7a26, 0.88) },
  get folhaClara() { return solid(0x5a9a34, 0.86) },
  get talo() { return solid(0x5d7a2c, 0.90) },
  get cereja() { return solid(0xa8112c, 0.34, 0.02) },
  get cerejaBrilho() { return solid(0xd8253f, 0.20, 0.04) },
  get morango() { return solid(0xcc2036, 0.52, 0.0) },
  get semente() { return solid(0xe8d878, 0.66, 0.0) },
  get palito() { return solid(0xd8c48a, 0.92) },
  polpa(chave, casca, cor, veio, gomos) {
    return stdMat('fruta-polpa-mat:' + chave, {
      map: polpaTex(chave, casca, cor, veio, gomos),
      transparent: true, roughness: 0.62, side: THREE.DoubleSide,
    })
  },
}

// --- ferramentas de forma ----------------------------------------------------

/**
 * Esfera AMASSADA: uma esfera com ruido de tres frequencias na normal.
 *
 * E a mesma tecnica da coroa de espuma em copos.js e pelo mesmo motivo: fruta
 * lisa nao existe. A diferenca e a amplitude — 1,5% em vez de 11%, porque aqui
 * o que se quer e tirar a perfeicao da esfera, nao fazer relevo.
 *
 * O ruido e ESTAVEL (seno sobre a propria posicao, nunca Math.random): vertices
 * vizinhos precisam concordar, senao a casca vira serrilha.
 */
function esferaAmassada(rx, ry, rz, seg, amp) {
  const g = new THREE.SphereGeometry(1, seg || 18, Math.max(8, Math.round((seg || 18) * 0.6)))
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const a = amp === undefined ? 0.015 : amp
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const r =
      a * Math.sin(v.x * 5.3 + v.z * 4.1) +
      a * 0.6 * Math.sin(v.y * 9.7 - v.x * 7.9 + 1.3) +
      a * 0.35 * Math.sin(v.z * 15.1 + v.y * 12.3 + 0.7)
    v.multiplyScalar(1 + r)
    pos.setXYZ(i, v.x * rx, v.y * ry, v.z * rz)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Folha achatada com ponta: um losango esticado, uma malha, dois triangulos. */
function geoFolha(comp, larg) {
  const f = new THREE.Shape()
  f.moveTo(0, 0)
  f.quadraticCurveTo(larg, comp * 0.34, 0, comp)
  f.quadraticCurveTo(-larg, comp * 0.34, 0, 0)
  const g = new THREE.ShapeGeometry(f, 6)
  g.rotateX(-Math.PI / 2)          // a folha nasce deitada no plano XZ
  return g
}

// ===========================================================================
// 1. LARANJA — 7,2 cm, esfera achatada nos polos, calice e uma folha
// ===========================================================================

export function laranja() {
  const g = new THREE.Group()
  g.name = 'fruta-laranja'
  const r = 0.036

  const corpo = new THREE.Mesh(esferaAmassada(r, r * 0.94, r, 18, 0.016), M.laranja)
  corpo.position.y = r * 0.94
  corpo.castShadow = true
  corpo.receiveShadow = true
  g.add(corpo)

  // O CALICE (a estrelinha verde onde ela se prendia no galho) e uma covinha
  // rasa por cima. Sem ele a esfera nao tem em cima nem embaixo, e fruta sem
  // orientacao rola pra qualquer lado na leitura.
  const cal = cyl(0.0062, 0.0090, 0.0035, M.folha, 8)
  cal.position.y = r * 1.86
  cal.castShadow = false
  g.add(cal)

  const fo = new THREE.Mesh(geoFolha(0.030, 0.011), M.folhaClara)
  fo.position.set(0.006, r * 1.88, 0.004)
  fo.rotation.set(-0.55, 0.7, 0.18)
  fo.castShadow = false
  g.add(fo)

  return g
}

// ===========================================================================
// 2. LIMAO — 5,4 cm, ovoide com bico nos dois polos
// ===========================================================================

/**
 * O BICO E A PECA. Um limao e uma esfera esticada em Y com uma pontinha em cada
 * polo — tirando os bicos, ele e um ovo verde, e ovo verde nao le como limao.
 * Os bicos sao dois cones baixinhos, e sao a diferenca de silhueta que faz esta
 * fruta nao ser "a laranja pequena".
 */
export function limao() {
  const g = new THREE.Group()
  g.name = 'fruta-limao'
  const rx = 0.0245, ry = 0.0315

  const corpo = new THREE.Mesh(esferaAmassada(rx, ry, rx, 16, 0.012), M.limao)
  corpo.position.y = ry
  corpo.castShadow = true
  corpo.receiveShadow = true
  g.add(corpo)

  for (const s of [-1, 1]) {
    const bico = cyl(0.0022, 0.0072, 0.0090, M.limao, 10)
    bico.position.y = ry + s * (ry * 0.94)
    if (s < 0) bico.rotation.x = Math.PI
    bico.castShadow = false
    g.add(bico)
  }

  return g
}

// ===========================================================================
// 3. CEREJA — duas bolas de 1,8 cm num cabo em V
// ===========================================================================

/**
 * SAO DUAS, e nao uma. Cereja de bar vem sempre em par no mesmo cabo, e o par e
 * o que a torna reconhecivel de longe — uma bola vermelha sozinha num prato le
 * como tomatinho. O cabo e um TubeGeometry sobre uma curva em V: dois cilindros
 * retos formariam um V de arame, e cabo de cereja e curvo.
 */
export function cereja() {
  const g = new THREE.Group()
  g.name = 'fruta-cereja'
  const r = 0.0092

  const geo = esferaAmassada(r, r * 0.96, r, 12, 0.03)
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(geo, s < 0 ? M.cereja : M.cerejaBrilho)
    b.position.set(s * r * 1.05, r * 0.96, s * r * 0.20)
    b.castShadow = true
    g.add(b)
  }

  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-r * 1.05, r * 1.8, -r * 0.20),
    new THREE.Vector3(-r * 0.7, r * 3.4, -r * 0.1),
    new THREE.Vector3(0, r * 4.2, 0),
    new THREE.Vector3(r * 0.7, r * 3.4, r * 0.1),
    new THREE.Vector3(r * 1.05, r * 1.8, r * 0.20),
  ])
  const cabo = new THREE.Mesh(new THREE.TubeGeometry(curva, 12, 0.00075, 5, false), M.talo)
  cabo.castShadow = false
  g.add(cabo)

  return g
}

// ===========================================================================
// 4. ABACAXI — 20 cm de corpo mais 12 de coroa
// ===========================================================================

/**
 * O corpo e um torno de barril (mais gordo no meio, ombro no alto) com a
 * textura de escama; a COROA sao 11 folhas numa InstancedMesh so.
 *
 * Onze e nao cinco: com poucas folhas a coroa vira um tufo de capim, e a coroa e
 * metade da silhueta desta fruta. Onze cabem numa instanced e custam uma malha.
 */
export function abacaxi() {
  const g = new THREE.Group()
  g.name = 'fruta-abacaxi'

  const pts = [
    [0.0000, 0.0000], [0.0400, 0.0060], [0.0530, 0.0230], [0.0585, 0.0620],
    [0.0600, 0.1050], [0.0575, 0.1420], [0.0500, 0.1720], [0.0380, 0.1930],
    [0.0230, 0.2010], [0.0000, 0.2035],
  ]
  const v = []
  for (const p of pts) v.push(new THREE.Vector2(p[0], p[1]))
  const corpo = new THREE.Mesh(new THREE.LatheGeometry(v, 22), M.abacaxiCasca)
  corpo.castShadow = true
  corpo.receiveShadow = true
  g.add(corpo)

  const n = 11
  const folha = geoFolha(0.115, 0.017)
  folha.rotateX(Math.PI / 2)           // fica em pe: a coroa aponta pra cima
  const im = new THREE.InstancedMesh(folha, M.folha, n)
  const d = new THREE.Object3D()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 * 2.4     // espiral, nao anel
    const alt = 0.198 + (i % 3) * 0.006
    const abre = 0.30 + (i % 4) * 0.16        // as de fora abrem mais
    d.position.set(Math.cos(a) * 0.012, alt, Math.sin(a) * 0.012)
    d.rotation.set(Math.cos(a) * abre, -a, Math.sin(a) * abre)
    d.scale.setScalar(0.72 + (i % 3) * 0.16)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = true
  g.add(im)

  return g
}

// ===========================================================================
// 5. MORANGO — cone de 4 cm com semente afundada e o capuz de folhas
// ===========================================================================

export function morango() {
  const g = new THREE.Group()
  g.name = 'fruta-morango'
  const alt = 0.040, r = 0.0175

  // Perfil de morango: largo no ombro (perto do cabo), afinando ate a ponta
  // arredondada embaixo. Torno, e nao cone: a ponta de um cone e uma agulha.
  const corpo = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000),
    new THREE.Vector2(0.0060, 0.0018),
    new THREE.Vector2(0.0118, 0.0080),
    new THREE.Vector2(0.0160, 0.0190),
    new THREE.Vector2(0.0175, 0.0300),
    new THREE.Vector2(0.0160, 0.0378),
    new THREE.Vector2(0.0110, 0.0400),
    new THREE.Vector2(0.0000, 0.0402),
  ], 16), M.morango)
  corpo.castShadow = true
  corpo.receiveShadow = true
  g.add(corpo)

  // AS SEMENTES sao 34 grãozinhos ENTERRADOS (o centro fica dentro da polpa, so
  // a calota aparece) — o mesmo truque das covinhas da caneca em copos.js. Sem
  // elas o morango e um cone vermelho.
  const ns = 34
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0018, 5, 4), M.semente, ns)
  const d = new THREE.Object3D()
  for (let i = 0; i < ns; i++) {
    const t = (i + 0.5) / ns
    const y = 0.004 + t * 0.031
    const rr = (0.0060 + (0.0175 - 0.0060) * Math.min(1, y / 0.030)) * 0.98
    const a = i * 2.399                       // angulo de ouro: nunca alinha
    d.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr)
    d.scale.set(1, 0.8, 0.55)
    d.rotation.set(0, -a, 0)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = false
  g.add(im)

  // o capuz: 5 folhas numa instanced
  const folha = geoFolha(0.017, 0.007)
  const cap = new THREE.InstancedMesh(folha, M.folha, 5)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    d.position.set(0, alt + 0.0008, 0)
    d.rotation.set(-0.42, -a, 0)
    d.scale.setScalar(1)
    d.updateMatrix()
    cap.setMatrixAt(i, d.matrix)
  }
  cap.instanceMatrix.needsUpdate = true
  cap.castShadow = false
  g.add(cap)

  g.add(cyl(0.0016, 0.0020, 0.010, M.talo, 6).translateY(alt + 0.005))
  return g
}

// ===========================================================================
// 6. HORTELA — um ramo de 14 cm
// ===========================================================================

/**
 * Hortela nao e uma fruta e nao se parece com nenhuma: e o unico item da
 * fruteira que e FOLHA. Um talo fino com 8 folhas em pares opostos, subindo em
 * cruz (que e como a hortela cresce de verdade — folhas opostas, cada par
 * girado 90 graus do anterior).
 */
export function hortela() {
  const g = new THREE.Group()
  g.name = 'fruta-hortela'
  const alt = 0.140

  const talo = cyl(0.0016, 0.0024, alt, M.talo, 6)
  talo.position.y = alt / 2
  talo.castShadow = false
  g.add(talo)

  // DEZ FOLHAS NUMA INSTANCED SO: oito nos quatro pares opostos e duas no tufo
  // do topo.
  //
  // Elas eram DUAS InstancedMesh (uma clara pros pares, uma escura pro tufo) e
  // viraram uma. O motivo e de custo e nao de gosto: InstancedMesh SOBREVIVE AO
  // FORNO — world/bake.js nao funde instanced com nada — entao cada uma e um
  // draw call que anda junto com a peca pra sempre, e a fruteira do bar tem
  // varios ramos na mesma caixa. O tufo continua se distinguindo pela ESCALA e
  // pelo angulo fechado, que e o que o olho de fato le num maco de hortela; a
  // segunda cor nao pagava o segundo draw call.
  const n = 10
  const folha = geoFolha(0.036, 0.016)
  const im = new THREE.InstancedMesh(folha, M.folhaClara, n)
  const d = new THREE.Object3D()
  for (let i = 0; i < 8; i++) {
    const par = Math.floor(i / 2)
    const lado = i % 2 ? 1 : -1
    const y = 0.045 + par * 0.026
    const giro = par * (Math.PI / 2) + (lado > 0 ? 0 : Math.PI)
    d.position.set(0, y, 0)
    d.rotation.set(-0.85 + par * 0.10, giro, 0)
    d.scale.setScalar(1.05 - par * 0.12)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
  }
  for (let i = 0; i < 2; i++) {
    d.position.set(0, alt - 0.004, 0)
    d.rotation.set(-1.30, i * Math.PI, 0)
    d.scale.setScalar(0.62)
    d.updateMatrix()
    im.setMatrixAt(8 + i, d.matrix)
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = false
  g.add(im)

  return g
}

// ===========================================================================
// AS RODELAS E FATIAS — o que sai da tabua de corte
// ===========================================================================

/**
 * RODELA DE CITRICO: o aro de casca e duas faces de polpa.
 *
 * Tres malhas, e as duas faces existem porque a rodela vai na BORDA DO COPO,
 * onde ela e vista dos dois lados no mesmo enquadramento. Uma face so, com
 * DoubleSide, mostraria o desenho ESPELHADO por tras — e num desenho radial de
 * gomos isso e visivel na hora.
 *
 * O disco de polpa fica 0,1 mm pra dentro da casca: encostado na face, o
 * z-fighting aparece justamente na quina que a luz do bar mais pega.
 */
export function rodelaCitrica(tipo) {
  const eLimao = tipo === 'limao'
  const g = new THREE.Group()
  g.name = 'rodela-' + (eLimao ? 'limao' : 'laranja')
  const r = eLimao ? 0.0225 : 0.0335
  const esp = 0.0055

  const aro = cyl(r, r, esp, eLimao ? M.limao : M.laranja, 24)
  aro.rotation.x = Math.PI / 2       // fica EM PE, como ela fica na borda do copo
  aro.position.y = r
  aro.castShadow = true
  g.add(aro)

  const mat = eLimao
    ? M.polpa('limao', '#b9cf2c', '#e9f39a', 'rgba(255,255,255,0.55)', 10)
    : M.polpa('laranja', '#e5811a', '#f6a63a', 'rgba(255,236,190,0.6)', 11)
  const disco = new THREE.CircleGeometry(r * 0.985, 24)
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(disco, mat)
    f.position.set(0, r, s * (esp / 2 + 0.0001))
    if (s < 0) f.rotation.y = Math.PI
    f.castShadow = false
    g.add(f)
  }
  return g
}

/** FATIA DE ABACAXI: um quarto de disco extrudado. Uma malha so. */
export function fatiaAbacaxi() {
  const g = new THREE.Group()
  g.name = 'fatia-abacaxi'
  const r = 0.042
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  s.absarc(0, 0, r, -0.35, 1.20, false)
  s.lineTo(0, 0)
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false, curveSegments: 10 })
  geo.rotateX(Math.PI / 2)
  const m = new THREE.Mesh(geo, M.polpa('abacaxi', '#a8801e', '#f0d055', 'rgba(255,246,200,0.5)', 8))
  m.position.y = 0.004
  m.castShadow = true
  g.add(m)
  return g
}

/** CEREJA NO PALITO: a guarnicao pronta, uma bola e um espeto. */
export function cerejaNoPalito() {
  const g = new THREE.Group()
  g.name = 'cereja-palito'
  const r = 0.0092
  const b = new THREE.Mesh(esferaAmassada(r, r * 0.96, r, 12, 0.03), M.cereja)
  b.position.y = r
  b.castShadow = true
  g.add(b)
  const p = cyl(0.0011, 0.0011, 0.075, M.palito, 6)
  p.position.y = 0.030
  p.castShadow = false
  g.add(p)
  return g
}

// ===========================================================================
// A CAIXA DE FEIRA — onde a fruta mora na estante
// ===========================================================================

/**
 * Caixa de ripa, aberta em cima. Cinco malhas: fundo, duas laterais, duas
 * cabeceiras — e as ripas sao FALSAS, desenhadas na textura da madeira, porque
 * ripa de verdade seriam 14 caixinhas por caixa e a estante tem seis caixas.
 */
export function caixaDeFeira(larg, prof, alt, cor) {
  const L = larg || 0.42, P = prof || 0.30, A = alt || 0.14
  const g = new THREE.Group()
  g.name = 'caixa-feira'
  const mat = stdMat('fruta-caixa:' + (cor || 0xb08a52), {
    map: tex('fruta-caixa-ripa', 128, (c, s) => {
      c.fillStyle = '#c9a877'
      c.fillRect(0, 0, s, s)
      // as frestas entre ripas: escuras e finas, com um filete claro embaixo
      for (let i = 0; i < 5; i++) {
        const y = (i / 5) * s + 4
        c.fillStyle = 'rgba(40,26,12,0.72)'
        c.fillRect(0, y, s, 3)
        c.fillStyle = 'rgba(255,238,200,0.25)'
        c.fillRect(0, y + 3, s, 2)
      }
      for (let i = 0; i < 120; i++) {
        c.fillStyle = 'rgba(90,58,26,' + (0.05 + Math.random() * 0.16) + ')'
        c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 14, 1)
      }
    }),
    color: cor || 0xb08a52, roughness: 0.92,
  })
  const esp = 0.010
  g.add(box(L, esp, P, mat, 0, esp / 2, 0))
  for (const s of [-1, 1]) {
    g.add(box(esp, A, P, mat, s * (L / 2 - esp / 2), A / 2, 0))
    g.add(box(L, A, esp, mat, 0, A / 2, s * (P / 2 - esp / 2)))
  }
  return g
}

// ---------------------------------------------------------------------------
// O CATALOGO
//
// Mesma forma das fichas de bebidas.js e copos.js — id, nome, build. O que e
// NOVO e o bloco `bar`, e ele existe pra src/bar/ nao precisar conhecer fruta
// nenhuma de nome:
//
//   suco       o id do ingrediente que sai desta fruta ao ser espremida ou
//              batida (ver bar/receitas.js). null = so serve de guarnicao.
//   rodelas    quantas guarnicoes um corte rende. Uma laranja da 6 rodelas;
//              uma cereja nao se corta, ela ja E a guarnicao.
//   guarnicao  o id da guarnicao que o corte produz.
//   raio       a metade da pegada, pra a bandeja saber espacar sem encavalar.
// ---------------------------------------------------------------------------

export const FRUTAS = [
  {
    id: 'fruta-laranja', nome: 'Laranja', cat: 'fruta', cor: 0xe5811a,
    mao: { pegaY: 0.034, pegaR: 0.0360 },
    bar: { suco: 'suco-laranja', rodelas: 6, guarnicao: 'rodela-laranja', raio: 0.040, alt: 0.078, instanciada: 0 },
    build: () => laranja(),
  },
  {
    id: 'fruta-limao', nome: 'Limao', cat: 'fruta', cor: 0xb9cf2c,
    mao: { pegaY: 0.030, pegaR: 0.0245 },
    bar: { suco: 'suco-limao', rodelas: 5, guarnicao: 'rodela-limao', raio: 0.028, alt: 0.066, instanciada: 0 },
    build: () => limao(),
  },
  {
    id: 'fruta-cereja', nome: 'Cerejas', cat: 'fruta', cor: 0xa8112c,
    mao: { pegaY: 0.014, pegaR: 0.0120 },
    bar: { suco: null, rodelas: 2, guarnicao: 'cereja', raio: 0.022, alt: 0.042, instanciada: 0 },
    build: () => cereja(),
  },
  {
    id: 'fruta-abacaxi', nome: 'Abacaxi', cat: 'fruta', cor: 0xd0a02c,
    mao: { pegaY: 0.090, pegaR: 0.0600 },
    bar: { suco: 'suco-abacaxi', rodelas: 8, guarnicao: 'rodela-abacaxi', raio: 0.062, alt: 0.320, instanciada: 1 },
    build: () => abacaxi(),
  },
  {
    id: 'fruta-morango', nome: 'Morango', cat: 'fruta', cor: 0xcc2036,
    mao: { pegaY: 0.020, pegaR: 0.0175 },
    bar: { suco: 'polpa-morango', rodelas: 3, guarnicao: 'morango', raio: 0.020, alt: 0.050, instanciada: 2 },
    build: () => morango(),
  },
  {
    id: 'fruta-hortela', nome: 'Hortela', cat: 'fruta', cor: 0x4f9a3a,
    mao: { pegaY: 0.060, pegaR: 0.0080 },
    bar: { suco: 'hortela', rodelas: 4, guarnicao: 'folha-hortela', raio: 0.026, alt: 0.140, instanciada: 1 },
    build: () => hortela(),
  },
]

const POR_ID = new Map()
for (const f of FRUTAS) POR_ID.set(f.id, f)

/** Espelha bebidaDe()/copoDe()/itemDe(): uma porta so por familia. */
export function frutaDe(id) { return POR_ID.get(id) || null }

/** O modelo da guarnicao que sai de cortar a fruta `id`. */
export function guarnicaoDaFruta(id) {
  switch (id) {
    case 'fruta-laranja': return rodelaCitrica('laranja')
    case 'fruta-limao': return rodelaCitrica('limao')
    case 'fruta-abacaxi': return fatiaAbacaxi()
    case 'fruta-cereja': return cerejaNoPalito()
    case 'fruta-morango': return morango()
    case 'fruta-hortela': return hortela()
    default: return null
  }
}

export default FRUTAS
