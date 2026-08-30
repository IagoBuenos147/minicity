import * as THREE from 'three'
import { solid, stdMat, glass } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/copos.js — OS TRES COPOS, E O LIQUIDO DENTRO DELES.
//
// Sao pecas de MAO, como as de mobilia/bebidas.js, e valem as mesmas duas
// regras daquele arquivo: a silhueta paga o preco (o jogador olha a peca a
// vinte centimetros do olho) e o orcamento e duro. Cada copo aqui cabe em 4 a 6
// malhas.
//
// O QUE MUDA EM RELACAO A UMA GARRAFA: garrafa e um SOLIDO. Copo e um copo —
// tem parede, tem fundo grosso, tem boca, e o que o jogador olha e o que esta
// DENTRO. Por isso duas decisoes:
//
//   1. O CORPO E UM LATHE SO, E O PERFIL DA A VOLTA INTEIRA. O contorno sobe
//      por fora, cruza a boca, desce por dentro e fecha no fundo. Um lathe
//      fechado assim e um copo de verdade em UMA malha: tem espessura de
//      parede, o fundo tem altura, e a boca e um aro e nao uma aresta de papel.
//      A alternativa (um cilindro aberto com DoubleSide) fica com parede de
//      espessura zero, e a vinte centimetros do olho isso e o que denuncia.
//
//   2. O LIQUIDO E REGERADO, NAO ESCALADO. A tentacao e desenhar o liquido
//      cheio e usar `scale.y = nivel`. Nao funciona em copo conico: escalando
//      em Y, o RAIO DO TOPO nao muda, e a superficie da bebida ou atravessa a
//      parede ou boia no meio do copo com uma fresta em volta. Aqui o liquido e
//      um lathe curto tirado do MESMO perfil interno, entre o fundo e a altura
//      atual — a borda da bebida encosta na parede em qualquer nivel, que e a
//      unica coisa que faz um copo pela metade parecer cheio de liquido.
//      Regerar custa uma geometria de ~200 vertices, e so acontece quando o
//      nivel muda mais de 1,5% (ou seja: enquanto enche e enquanto bebe).
//
// NENHUMA MARCA, EM LUGAR NENHUM — mesma regra de bebidas.js. Copo e forma, e
// forma nao precisa de rotulo.
//
// Escala real em metros, cada peca EM PE COM A BASE EM y = 0.
// ---------------------------------------------------------------------------

// --- materiais --------------------------------------------------------------

const M = {
  // Vidro de copo de bar: mais opaco que o de garrafa (0.15) de proposito. Um
  // copo VAZIO com opacidade de garrafa some da tela — e a vitrine da adega
  // vende copo vazio. 0.26 ainda deixa o chope ler inteiro atras da parede.
  get vidro() { return glass(0xdfeef2, 0.26) },
  // Vidro grosso do fundo e do aro: a mesma cor, mais fechado. E ele que da a
  // LEITURA da peca (a silhueta do copo vazio e o fundo e a boca, nao a parede).
  get vidroGrosso() {
    return stdMat('copo-vidro-grosso', {
      // 0.42 e nao 0.52: com os copos pendurados de boca pra baixo sobre o
      // balcao, o fundo grosso somava alfa com a parede do corpo e os quatro
      // liam como COPOS DE PAPEL brancos. Em 0.42 o fundo ainda tem peso e a
      // peca continua sendo vidro.
      color: 0xd7e8ec, transparent: true, opacity: 0.42, roughness: 0.10,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // Chope: ambar claro, quase saturado. depthWrite falso pela mesma razao do
  // ambar do whiskey em bebidas.js — sem isso o liquido vira um bloco chapado.
  //
  // O `emissive` fraco no proprio tom e o que faz o chope PARECER CHEIO DE LUZ,
  // que e como cerveja contra a janela de um bar se comporta: ela devolve luz
  // pelo volume inteiro, nao so onde a lampada bate. Sem ele o liquido fica
  // igual a suco — cor certa, corpo nenhum. Intensidade baixa de proposito: o
  // jogo tem tone mapping ACES e emissive alto estoura pra branco.
  liquido(cor) {
    return stdMat('copo-liq:' + cor, {
      color: cor, transparent: true, opacity: 0.82, roughness: 0.08,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
      emissive: cor, emissiveIntensity: 0.20,
    })
  },
  // COLARINHO. Branco creme, aspero, e OPACO: espuma nao e translucida, e
  // espuma transparente e a coisa que faz um chope parecer refrigerante.
  //
  // vertexColors: a espuma e pintada por vertice (ver coroaDeEspuma) — clara em
  // cima, mais suja embaixo, onde ela encosta na cerveja. Sem isso ela e um
  // volume branco chapado com a silhueta certa e nenhuma profundidade.
  get espuma() {
    return stdMat('copo-espuma', {
      color: 0xf6f0e2, roughness: 0.98, metalness: 0.0, vertexColors: true,
    })
  },
  get espumaSeca() { return solid(0xe8e0cc, 1.0, 0.0) },
  // Bolha: quase invisivel sozinha, e o conjunto que conta. Branca e opaca —
  // bolha de gas dentro de liquido devolve luz, nao deixa passar.
  get bolha() { return solid(0xfdfbf4, 0.55, 0.0) },
}

// --- perfis -----------------------------------------------------------------
//
// Cada perfil e uma lista [altura, raio EXTERNO] do fundo pra boca. O raio
// interno em qualquer altura e este menos `parede`. Os numeros sao de copo de
// bar de verdade: um americano tem 19 cl e 9,8 cm; uma tulipa, 30 cl e 14,5.

const PERFIS = {
  americano: {
    alt: 0.098, parede: 0.0042, fundo: 0.0135,   // fundo grosso: e a marca dele
    pontos: [[0, 0.0300], [0.012, 0.0308], [0.050, 0.0332], [0.090, 0.0356], [0.098, 0.0358]],
  },
  tulipa: {
    alt: 0.148, parede: 0.0028, fundo: 0.0100,
    // barriga em 0.085 e boca RECOLHIDA em 0.148: e a recolhida que segura o
    // colarinho, e e ela que faz a silhueta ser tulipa e nao copo de suco.
    pontos: [
      [0, 0.0250], [0.010, 0.0262], [0.030, 0.0300], [0.055, 0.0345],
      [0.085, 0.0378], [0.112, 0.0372], [0.135, 0.0340], [0.148, 0.0332],
    ],
  },
  caneca: {
    alt: 0.152, parede: 0.0060, fundo: 0.0160,   // parede de 6 mm: caneca e peso
    pontos: [[0, 0.0430], [0.016, 0.0438], [0.130, 0.0442], [0.146, 0.0446], [0.152, 0.0452]],
  },
}

/** Raio EXTERNO do perfil na altura y (interpolado). */
function raioEm(perfil, y) {
  const p = perfil.pontos
  if (y <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][0]) {
      const t = (y - p[i - 1][0]) / Math.max(1e-6, p[i][0] - p[i - 1][0])
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t
    }
  }
  return p[p.length - 1][1]
}

/** Raio INTERNO (onde o liquido encosta) na altura y. */
function raioDentro(perfil, y) {
  return Math.max(0.002, raioEm(perfil, y) - perfil.parede)
}

/**
 * O CORPO: um lathe fechado que sobe por fora e desce por dentro.
 *
 * A ordem dos pontos importa e nao e simetrica: subindo, ele amostra o perfil
 * ponto a ponto; descendo, ele reamostra as MESMAS alturas com o raio interno.
 * Reaproveitar a lista invertida (que seria mais curto) poria os dois lados na
 * mesma densidade de vertice, e a parede interna nao precisa de tanta.
 */
function corpoDeVidro(perfil, mat, seg) {
  const p = perfil.pontos
  const topo = perfil.alt
  const pts = []
  pts.push(new THREE.Vector2(0, 0))                       // centro do fundo
  for (let i = 0; i < p.length; i++) pts.push(new THREE.Vector2(p[i][1], p[i][0]))
  // aro da boca: dois pontos bem juntos, pra a luz pegar a quina
  pts.push(new THREE.Vector2(raioEm(perfil, topo) - perfil.parede * 0.35, topo + 0.0012))
  pts.push(new THREE.Vector2(raioDentro(perfil, topo), topo - 0.0010))
  // parede interna descendo
  for (let i = p.length - 2; i >= 1; i--) {
    pts.push(new THREE.Vector2(raioDentro(perfil, p[i][0]), Math.max(perfil.fundo, p[i][0])))
  }
  pts.push(new THREE.Vector2(raioDentro(perfil, perfil.fundo), perfil.fundo))
  pts.push(new THREE.Vector2(0, perfil.fundo))            // centro do fundo por dentro
  const geo = new THREE.LatheGeometry(pts, seg || 26)
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Disco grosso do fundo: e o que se ve de um copo vazio contra a luz. */
function fundoGrosso(perfil, mat) {
  const r = raioDentro(perfil, perfil.fundo * 0.5)
  const geo = new THREE.CylinderGeometry(r, r * 0.96, perfil.fundo * 0.86, 22)
  const m = new THREE.Mesh(geo, mat)
  m.position.y = perfil.fundo * 0.43
  return m
}

// --- liquido ----------------------------------------------------------------

/** Lathe do liquido do fundo ate `topo` (metros, absoluto). */
function geoLiquido(perfil, topo, seg) {
  const base = perfil.fundo + 0.0008
  const alto = Math.max(base + 0.0015, topo)
  const pts = [new THREE.Vector2(0, base)]
  const passos = 6
  for (let i = 0; i <= passos; i++) {
    const y = base + (alto - base) * (i / passos)
    pts.push(new THREE.Vector2(raioDentro(perfil, y) - 0.0006, y))
  }
  pts.push(new THREE.Vector2(0, alto))     // a superficie, fechada no eixo
  return new THREE.LatheGeometry(pts, seg || 22)
}

/**
 * A COROA DE ESPUMA — uma cupula AMASSADA, e nao uma meia-bola.
 *
 * A versao anterior era uma SphereGeometry lisa escalada. Espuma lisa nao
 * existe: o que o olho reconhece como colarinho e a superficie irregular, cheia
 * de bolha estourada, e o contraste entre o topo iluminado e os vaos. Uma
 * meia-bola branca em cima da cerveja le como TAMPA DE PLASTICO — era
 * literalmente o que estava na tela.
 *
 * Duas coisas de uma vez, as duas de graca porque acontecem UMA VEZ:
 *
 *  1. os vertices sao empurrados pra fora por um ruido de tres frequencias. Tres
 *     e o minimo pra nao virar padrao: uma onda larga da os morros do
 *     colarinho, a media da os aglomerados e a fina da a bolha.
 *  2. COR POR VERTICE: claro em cima, mais escuro e amarelado embaixo, onde a
 *     espuma encosta na cerveja e fica encharcada. Esta malha nao tem UV util,
 *     entao cor por vertice e o caminho — o mesmo de player/mao.js.
 *
 * A geometria e UNITARIA e compartilhada: quem usa escala. Espuma de 4 mm e de
 * 3 cm sao a mesma malha em tamanhos diferentes, e o ruido escala junto.
 */
let GEO_COROA = null
function coroaDeEspuma(seg) {
  if (GEO_COROA) return GEO_COROA
  // 1.15 rad de abertura: a cupula passa um pouco do equador, entao ela ENCOSTA
  // na parede do copo em vez de pousar sobre o liquido como um chapeu.
  const g = new THREE.SphereGeometry(1, seg || 22, 10, 0, Math.PI * 2, 0, 1.15)
  const pos = g.attributes.position
  const cor = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = v.length() || 1
    // ruido barato e ESTAVEL: seno de tres frequencias sobre a propria posicao.
    // Nada de Math.random aqui — vertices vizinhos precisam concordar, senao a
    // malha vira serrilha em vez de bolha.
    const r =
      0.055 * Math.sin(v.x * 9.1 + v.z * 7.3) +
      0.032 * Math.sin(v.x * 21.7 - v.y * 18.2 + 1.7) +
      0.018 * Math.sin(v.z * 41.3 + v.x * 33.9 + 0.6)
    v.multiplyScalar(1 + r / n)
    pos.setXYZ(i, v.x, v.y, v.z)

    // topo claro, base encharcada. `v.y` vai de 0 (equador) a 1 (topo).
    const alto = Math.max(0, Math.min(1, v.y))
    const luz = 0.72 + 0.28 * alto
    cor[i * 3 + 0] = luz
    cor[i * 3 + 1] = luz * (1 - 0.03 * (1 - alto))
    cor[i * 3 + 2] = luz * (1 - 0.11 * (1 - alto))
  }
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3))
  g.computeVertexNormals()
  GEO_COROA = g
  return g
}

/** Anel de espuma entre o liquido e a coroa, tambem irregular. */
let GEO_ANEL_ESPUMA = null
function anelDeEspuma(seg) {
  if (GEO_ANEL_ESPUMA) return GEO_ANEL_ESPUMA
  const g = new THREE.CylinderGeometry(1, 1, 1, seg || 22, 3)
  const pos = g.attributes.position
  const cor = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const rad = Math.hypot(v.x, v.z)
    if (rad > 0.001) {
      const r = 1 + 0.045 * Math.sin(v.x * 17.3 + v.z * 13.1) + 0.022 * Math.sin(v.z * 29.7 - 0.9)
      v.x *= r; v.z *= r
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    const alto = Math.max(0, Math.min(1, v.y + 0.5))
    const luz = 0.66 + 0.30 * alto
    cor[i * 3 + 0] = luz
    cor[i * 3 + 1] = luz * 0.985
    cor[i * 3 + 2] = luz * 0.90
  }
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3))
  g.computeVertexNormals()
  GEO_ANEL_ESPUMA = g
  return g
}

/**
 * Liga um copo montado ao seu nivel: devolve `setNivel(n, cor, espuma)`.
 *
 * `n` de 0 a 1. `espuma` de 0 a 1 e a ALTURA DO COLARINHO como fracao do que
 * sobra ate a boca — chope vem com 0.5, destilado com 0.
 *
 * A guarda dos 1,5% existe porque isto e chamado TODO QUADRO enquanto a
 * torneira esta jorrando: sem ela seriam 60 geometrias novas por segundo.
 */
function ligarNivel(grupo, perfil, seg) {
  const utilTopo = perfil.alt - 0.004      // 4 mm de sobra: copo nao enche ate a borda
  const matEspuma = M.espuma

  let liq = null
  let nivel = -1
  let cor = 0xd8901c
  let espumaK = 0

  const colarinho = new THREE.Mesh(anelDeEspuma(seg), matEspuma)
  colarinho.visible = false
  colarinho.castShadow = false
  grupo.add(colarinho)
  // cupula: o colarinho nao e um cilindro cortado a faca, ele estufa no meio
  const cupula = new THREE.Mesh(coroaDeEspuma(seg), matEspuma)
  cupula.visible = false
  cupula.castShadow = false
  grupo.add(cupula)

  // --- BOLHAS -------------------------------------------------------------
  //
  // E o detalhe que diz CHOPE. Sem elas o liquido e um volume ambar parado, e
  // volume ambar parado e refrigerante — a cor sozinha nao resolve, o
  // movimento resolve.
  //
  // Uma InstancedMesh de 26: em malhas separadas seriam 26 draw calls por copo,
  // e o copo aparece na prateleira do bar as duzias. Cada bolha sobe do fundo,
  // some ao encostar na superficie e volta pra baixo com outra fase — o ciclo e
  // por bolha, entao elas nunca sobem em bloco.
  const N_BOLHA = 26
  const bolhas = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 6, 4), M.bolha, N_BOLHA,
  )
  bolhas.visible = false
  bolhas.castShadow = false
  bolhas.frustumCulled = false
  grupo.add(bolhas)
  // por bolha: raio no copo, angulo, tamanho e fase (0 a 1, onde ela esta na
  // subida). Sorteado UMA vez, na montagem.
  const dadosBolha = []
  for (let i = 0; i < N_BOLHA; i++) {
    dadosBolha.push({
      // a raiz espalha as bolhas por AREA e nao por raio: sem ela elas se
      // amontoam no eixo do copo
      rr: Math.sqrt(Math.random()) * 0.86,
      ang: Math.random() * Math.PI * 2,
      tam: 0.0006 + Math.random() * 0.0011,
      fase: Math.random(),
      // as grandes sobem mais rapido, como na vida real
      vel: 0.22 + Math.random() * 0.45,
    })
  }
  const _m = new THREE.Matrix4()
  let tBolha = 0

  function aplicar(n, novaCor, esp) {
    if (typeof novaCor === 'number') cor = novaCor
    if (typeof esp === 'number') espumaK = Math.max(0, Math.min(1, esp))
    const alvo = Math.max(0, Math.min(1, n))
    if (nivel >= 0 && Math.abs(alvo - nivel) < 0.015 && liq && liq.material.color.getHex() === cor) return
    nivel = alvo

    const topoLiq = perfil.fundo + (utilTopo - perfil.fundo) * nivel
    if (!liq) {
      liq = new THREE.Mesh(geoLiquido(perfil, topoLiq, seg), M.liquido(cor))
      liq.castShadow = false
      liq.receiveShadow = false
      grupo.add(liq)
    } else {
      liq.geometry.dispose()
      liq.geometry = geoLiquido(perfil, topoLiq, seg)
      if (liq.material.color.getHex() !== cor) liq.material = M.liquido(cor)
    }
    liq.visible = nivel > 0.005

    // COLARINHO. Ele sobe COM o liquido e, no copo cheio, passa da boca — que e
    // o unico jeito de um chope tirado na hora nao parecer suco servido.
    const alturaEsp = 0.004 + 0.026 * espumaK
    const mostrar = nivel > 0.02 && espumaK > 0.01
    colarinho.visible = mostrar
    cupula.visible = mostrar
    if (mostrar) {
      const r = raioDentro(perfil, Math.min(perfil.alt, topoLiq + alturaEsp * 0.5)) - 0.0004
      colarinho.scale.set(r, alturaEsp, r)
      colarinho.position.y = topoLiq + alturaEsp / 2
      // A CUPULA E ACHATADA (0.62 na vertical), e nao uma bola.
      // Colarinho nao e uma bolha de sabao em cima do copo: ele e um domo baixo,
      // mais largo que alto. Com a esfera uniforme que havia antes, um copo
      // cheio ganhava uma cabeca redonda de 3 cm que parecia sorvete.
      cupula.scale.set(r * 0.99, alturaEsp * 0.62, r * 0.99)
      cupula.position.y = topoLiq + alturaEsp * 0.5
    }

    // as bolhas so existem onde ha liquido COM gas: chope tem, cachaca nao
    bolhas.visible = nivel > 0.03 && espumaK > 0.01
    bolhas.count = N_BOLHA
  }

  /**
   * Anima as bolhas. Quem chama e o dono do copo (player/copo.js no que esta na
   * mao, o bar no que esta no balcao); copo que ninguem atualiza simplesmente
   * fica com o gas parado, que e melhor do que um copo na prateleira gastando
   * quadro.
   */
  function animar(dt) {
    if (!bolhas.visible) return
    tBolha += dt || 0
    const base = perfil.fundo + 0.0015
    const topoLiq = perfil.fundo + (utilTopo - perfil.fundo) * nivel
    const alturaLiq = Math.max(0.001, topoLiq - base)
    for (let i = 0; i < N_BOLHA; i++) {
      const b = dadosBolha[i]
      // fracao da subida, de 0 (fundo) a 1 (superficie), ciclica
      const f = (b.fase + tBolha * b.vel) % 1
      const y = base + alturaLiq * f
      const raio = raioDentro(perfil, y) - 0.0012
      // a bolha ENCOLHE ao chegar na superficie em vez de sumir de um quadro
      // pro outro: some estourando, que e o que ela faz
      const some = f > 0.88 ? (1 - f) / 0.12 : 1
      const e = b.tam * some * (0.7 + 0.3 * f)
      _m.makeScale(e, e, e)
      _m.setPosition(
        Math.cos(b.ang) * raio * b.rr,
        y,
        Math.sin(b.ang) * raio * b.rr,
      )
      bolhas.setMatrixAt(i, _m)
    }
    bolhas.instanceMatrix.needsUpdate = true
  }

  aplicar(0, cor, 0)
  grupo.userData.setNivel = aplicar
  grupo.userData.animarBebida = animar
  grupo.userData.perfil = perfil
  return aplicar
}

// --- as tres pecas ----------------------------------------------------------

/**
 * COPO AMERICANO. O copo de boteco: 19 cl, parede reta, fundo de 13 mm e as
 * caneluras verticais na metade de baixo. As caneluras sao UMA InstancedMesh de
 * 12 cunhas — em malhas separadas seriam 12 draw calls por copo na prateleira.
 */
export function copoAmericano() {
  const g = new THREE.Group()
  g.name = 'copo-americano'
  const perfil = PERFIS.americano
  g.add(corpoDeVidro(perfil, M.vidro, 24))
  g.add(fundoGrosso(perfil, M.vidroGrosso))

  const n = 12
  const geo = new THREE.BoxGeometry(0.0052, 0.046, 0.0052)
  const im = new THREE.InstancedMesh(geo, M.vidroGrosso, n)
  const d = new THREE.Object3D()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const y = 0.036
    const r = raioEm(perfil, y) - 0.0016
    d.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
    d.rotation.set(0, -a, 0)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = false
  g.add(im)

  ligarNivel(g, perfil, 24)
  return g
}

/**
 * TULIPA. 30 cl, barriga em 8,5 cm e boca recolhida. E o copo que a adega vende
 * caro: nao porque o vidro seja melhor, mas porque a boca recolhida SEGURA o
 * colarinho, e quem tira chope sabe disso.
 *
 * O filete gravado em volta da barriga e uma malha so (torus achatado) e existe
 * pelo mesmo motivo do medalhao das garrafas de bebidas.js: vidro liso a vinte
 * centimetros do olho nao tem onde a luz pegar.
 */
export function copoTulipa() {
  const g = new THREE.Group()
  g.name = 'copo-tulipa'
  const perfil = PERFIS.tulipa
  g.add(corpoDeVidro(perfil, M.vidro, 28))
  g.add(fundoGrosso(perfil, M.vidroGrosso))

  const filete = new THREE.Mesh(
    new THREE.TorusGeometry(raioEm(perfil, 0.118) - 0.0004, 0.0016, 6, 30), M.vidroGrosso,
  )
  filete.rotation.x = Math.PI / 2
  filete.position.y = 0.118
  filete.castShadow = false
  g.add(filete)

  ligarNivel(g, perfil, 28)
  return g
}

/**
 * CANECA DE CHOPE. Meio litro, parede de 6 mm, asa grossa e as covinhas.
 *
 * As covinhas sao InstancedMesh de esferas ENTERRADAS na parede (o centro fica
 * dentro do vidro, so a calota aparece), 6 fileiras de 9. E o unico jeito
 * barato de ter a superficie facetada da caneca sem uma textura de normal — e
 * uma textura de normal em vidro transparente quase nao aparece.
 */
export function canecaDeChope() {
  const g = new THREE.Group()
  g.name = 'caneca-chope'
  const perfil = PERFIS.caneca
  g.add(corpoDeVidro(perfil, M.vidro, 26))
  g.add(fundoGrosso(perfil, M.vidroGrosso))

  const fil = 6, porFil = 9
  const geo = new THREE.SphereGeometry(0.0125, 8, 6)
  const im = new THREE.InstancedMesh(geo, M.vidroGrosso, fil * porFil)
  const d = new THREE.Object3D()
  let k = 0
  for (let f = 0; f < fil; f++) {
    const y = 0.026 + f * 0.0205
    const r = raioEm(perfil, y) + 0.0028         // enterrada: so a calota sai
    for (let i = 0; i < porFil; i++) {
      const a = (i / porFil) * Math.PI * 2 + (f % 2) * (Math.PI / porFil)
      d.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      d.rotation.set(0, -a, 0)
      d.scale.set(1, 0.86, 0.34)
      d.updateMatrix()
      im.setMatrixAt(k++, d.matrix)
    }
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = false
  g.add(im)

  // A ASA. Meio torus, achatado no eixo de fora: asa de secao redonda escorrega
  // na leitura e vira alca de xicara.
  const asa = new THREE.Mesh(
    new THREE.TorusGeometry(0.0335, 0.0072, 8, 20, Math.PI * 1.12), M.vidroGrosso,
  )
  asa.rotation.set(0, Math.PI / 2, -Math.PI * 0.56)
  asa.position.set(raioEm(perfil, 0.078) + 0.0245, 0.078, 0)
  asa.scale.set(1, 1, 0.78)
  asa.castShadow = true
  g.add(asa)

  ligarNivel(g, perfil, 26)
  return g
}

// ---------------------------------------------------------------------------
// O CATALOGO
//
// Mesma forma das fichas de bebidas.js — a janela da loja, o inventario e a mao
// leem os mesmos campos. O que e NOVO aqui e o bloco `copo`, e ele existe pra
// player/copo.js nao precisar conhecer copo nenhum de nome:
//
//   capacidade  litros. So aparece no texto do card e no HUD.
//   goles       quantos cliques ate esvaziar. Caneca de meio litro aguenta mais
//               gole que um americano de 19 cl, e a diferenca tem que se SENTIR
//               na mao — senao os tres copos sao o mesmo copo com outra forma.
//   espuma      quanto colarinho ele segura (0 a 1). A tulipa segura mais.
//   encheEm     segundos embaixo da torneira aberta pra ir de vazio a cheio.
// ---------------------------------------------------------------------------

export const COPOS = [
  {
    id: 'copo-americano', nome: 'Copo americano', cat: 'copos',
    qualidade: 'comum', preco: 9, empilha: 8, naCasa: false,
    desc: 'Vidro grosso de boteco. Sobrevive a queda, nao sobrevive a briga.',
    // pega no meio do corpo, acima do fundo grosso
    mao: { pegaY: 0.048, pegaR: 0.0335 },
    copo: { capacidade: 0.19, goles: 3, espuma: 0.34, encheEm: 1.5 },
    build: () => copoAmericano(),
  },
  {
    id: 'copo-tulipa', nome: 'Tulipa 300 ml', cat: 'copos',
    qualidade: 'boa', preco: 26, empilha: 6, naCasa: false,
    desc: 'Boca recolhida, do jeito que segura colarinho. Vem gelada da pia.',
    mao: { pegaY: 0.052, pegaR: 0.0330 },
    copo: { capacidade: 0.30, goles: 4, espuma: 0.62, encheEm: 2.1 },
    build: () => copoTulipa(),
  },
  {
    id: 'caneca-chope', nome: 'Caneca de chope 500 ml', cat: 'copos',
    qualidade: 'fina', preco: 48, empilha: 4, naCasa: false,
    desc: 'Meio litro de vidro com covinhas e asa. Pesa cheia, e e esse o ponto.',
    // a mao vai na ASA, entao a pega e mais estreita que a caneca
    mao: { pegaY: 0.078, pegaR: 0.0230 },
    copo: { capacidade: 0.50, goles: 6, espuma: 0.50, encheEm: 3.2 },
    build: () => canecaDeChope(),
  },
]

const POR_ID = new Map()
for (const c of COPOS) POR_ID.set(c.id, c)

/** Espelha bebidaDe()/itemDe(): quem vende e quem serve usam a mesma porta. */
export function copoDe(id) { return POR_ID.get(id) || null }

/** true se o item daquele id e um copo (o main usa pra escolher a mao certa). */
export function ehCopo(id) { return POR_ID.has(id) }

export default COPOS
