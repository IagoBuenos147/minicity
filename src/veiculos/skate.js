import * as THREE from 'three'
import { solid, tex, PALETTE } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// O SKATE.
//
// Contrato (VEICULOS.md): construir() -> { grupo, assento, rodas, config }
//   grupo   origem NO CHAO, no centro do veiculo, frente para +Z
//   assento onde a RAIZ do personagem (que fica nos pes, ver ARCHITECTURE.md)
//           deve ficar — aqui em cima do deck, de lado
//   rodas   as quatro; TODAS giram e NENHUMA esterca (quem vira e o deck)
//   config  a chave em MUNDO.DIRIGIR
//
// Nada de numero de direcao aqui dentro: velocidade, giro e inclinacao moram
// em MUNDO.DIRIGIR.skate e quem le e o sistema de veiculos.
//
// O deck e feito de UMA forma so (vista de cima, com as pontas arredondadas),
// extrudada fina e depois DOBRADA vertice a vertice nas pontas. Dobrar e melhor
// do que empilhar caixinhas inclinadas porque as tres camadas (lixa, madeira e
// arte) sao dobradas pela MESMA funcao e continuam grudadas uma na outra.
// ---------------------------------------------------------------------------

// --- medidas do deck (metros) -----------------------------------------------
const COMP = 0.82                 // comprimento pedido
const HL = COMP / 2               // meio comprimento
const HW = 0.108                  // meia largura no centro
const ESP = 0.0125                // espessura da madeira
const ESP_LIXA = 0.0022           // a lixa e uma casquinha por cima
const ESP_ARTE = 0.0018           // e a arte outra por baixo

// A dobra das pontas e um ARCO de circulo: a partir de KICK_INI a tabua sobe
// KICK_ANG radianos ao longo de KICK_ARCO metros de tabua. R sai dessas duas.
const KICK_INI = 0.26
const KICK_ARCO = HL - KICK_INI
const KICK_ANG = 0.72             // ~41 graus: exagerado de proposito, le-se de longe
const KICK_R = KICK_ARCO / KICK_ANG

// --- trucks e rodas ---------------------------------------------------------
const RODA_R = 0.028              // 56 mm
const RODA_L = 0.034
const EIXO_Z = 0.185              // distancia entre eixos = 0.37
const EIXO_X = 0.105              // meia bitola
const DECK_Y = 0.084              // altura da face de baixo da madeira

const TAU = Math.PI * 2

// ---------------------------------------------------------------------------
// FORMA DO DECK (vista de cima)
// ---------------------------------------------------------------------------
/**
 * Meia largura em funcao de z. Expoente alto = quase reto no meio e so
 * arredonda na ponta, que e exatamente o contorno de um shape de skate.
 */
function meiaLargura(z) {
  const t = Math.min(1, Math.abs(z) / HL)
  const w = HW * Math.pow(Math.max(0, 1 - Math.pow(t, 8)), 0.32)
  return Math.max(0.013, w)       // nunca zero: ponta exata gera triangulo degenerado
}

function formaDoDeck() {
  const N = 30
  const pts = []
  for (let i = 0; i <= N; i++) {
    const z = -HL + (i / N) * COMP
    pts.push(new THREE.Vector2(meiaLargura(z), z))
  }
  for (let i = N; i >= 0; i--) {
    const z = -HL + (i / N) * COMP
    pts.push(new THREE.Vector2(-meiaLargura(z), z))
  }
  return new THREE.Shape(pts)
}

/**
 * UV pela vista de cima. O gerador padrao do ExtrudeGeometry usa as coordenadas
 * do shape em METROS, entao a arte cairia toda num cantinho da textura; aqui
 * remapeamos pro retangulo 0..1 do deck inteiro.
 */
function uvDeCima(geo) {
  const p = geo.attributes.position
  const uv = geo.attributes.uv
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) / HW) * 0.5 + 0.5, (p.getZ(i) / HL) * 0.5 + 0.5)
  }
  uv.needsUpdate = true
}

/**
 * Dobra as pontas. Cada vertice alem de KICK_INI e enrolado num circulo de raio
 * KICK_R: a distancia percorrida na tabua vira angulo. Como a formula leva o y
 * do vertice em conta, a espessura acompanha a curva em vez de achatar.
 */
function dobrarPontas(geo) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i)
    const az = Math.abs(z)
    if (az <= KICK_INI) continue
    const y = p.getY(i)
    const a = (az - KICK_INI) / KICK_R
    const raio = KICK_R - y
    p.setZ(i, Math.sign(z) * (KICK_INI + raio * Math.sin(a)))
    p.setY(i, KICK_R - raio * Math.cos(a))
  }
  p.needsUpdate = true
  geo.computeVertexNormals()      // nao-indexada: sai normal por face, bem chapado
}

/** Uma camada do deck: extruda a forma, poe na altura certa e dobra. */
function camada(forma, espessura, offsetY) {
  const geo = new THREE.ExtrudeGeometry(forma, { depth: espessura, bevelEnabled: false })
  geo.translate(0, 0, -espessura / 2)   // espessura centrada na propria camada
  geo.rotateX(-Math.PI / 2)             // comprimento vai pro Z, espessura pro Y
  geo.translate(0, offsetY, 0)          // empilha ANTES de dobrar: assim ela dobra junto
  uvDeCima(geo)
  dobrarPontas(geo)
  return geo
}

// ---------------------------------------------------------------------------
// TEXTURAS
// ---------------------------------------------------------------------------
/** Lixa: preto fosco cheio de graozinho. E o que faz o deck parecer aspero. */
function texLixa() {
  return tex('skate-lixa', 128, (g, s) => {
    g.fillStyle = '#141417'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 5200; i++) {
      const v = 20 + Math.random() * 70
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',' + (0.25 + Math.random() * 0.6) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1)
    }
  }, 7)
}

/** Arte de baixo: um anel verde com raios — o aceno pro poder do jogo. */
function texArte() {
  return tex('skate-arte', 256, (g, s) => {
    const c = s / 2
    g.fillStyle = '#161a2e'
    g.fillRect(0, 0, s, s)
    const grd = g.createLinearGradient(0, 0, 0, s)
    grd.addColorStop(0, 'rgba(20,60,120,0.85)')
    grd.addColorStop(0.5, 'rgba(10,14,30,0.2)')
    grd.addColorStop(1, 'rgba(120,40,20,0.85)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
    // raios saindo do centro
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      g.fillStyle = i % 2 ? 'rgba(61,255,154,0.16)' : 'rgba(232,195,61,0.12)'
      g.beginPath()
      g.moveTo(c, c)
      g.arc(c, c, s, a, a + 0.16)
      g.closePath()
      g.fill()
    }
    g.strokeStyle = '#3dff9a'
    g.lineWidth = 16
    g.beginPath(); g.arc(c, c, s * 0.29, 0, TAU); g.stroke()
    g.strokeStyle = 'rgba(217,255,233,0.9)'
    g.lineWidth = 5
    g.beginPath(); g.arc(c, c, s * 0.29, 0, TAU); g.stroke()
    g.strokeStyle = '#e8813d'
    g.lineWidth = 9
    g.beginPath(); g.arc(c, c, s * 0.4, 0.5, 3.2); g.stroke()
    g.beginPath(); g.arc(c, c, s * 0.4, 3.7, 6.1); g.stroke()
  }, 1)
}

// ---------------------------------------------------------------------------
// CONSTRUIR
// ---------------------------------------------------------------------------
export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'skate'

  // O pivo carrega TUDO: o sistema inclina o skate na curva girando este no
  // eixo Z, e como ele fica na altura do eixo das rodas o deck tomba em volta
  // das rodas (e nao em volta do chao, que pareceria o skate escorregando).
  const pivo = new THREE.Group()
  pivo.position.y = RODA_R
  grupo.add(pivo)

  // --- materiais ------------------------------------------------------------
  const matMadeira = solid(0x9a6b41, 0.82, 0.02)
  const matLixa = solid(0x2a2a2e, 0.98, 0.0, { map: texLixa() })
  const matArte = solid(0xffffff, 0.55, 0.05, { map: texArte() })
  const matMetal = solid(PALETTE.chrome, 0.28, 0.9)
  const matMetalEscuro = solid(0x51555c, 0.42, 0.8)
  const matBucha = solid(0xe8a33d, 0.55, 0.0)      // uretano do amortecedor
  const matRoda = solid(0xf2ede0, 0.42, 0.0)
  const matNucleo = solid(0xe8813d, 0.5, 0.1)

  // --- deck (tres camadas dobradas juntas) ----------------------------------
  const forma = formaDoDeck()
  const deck = new THREE.Group()
  deck.position.y = DECK_Y - RODA_R + ESP / 2   // o pivo ja subiu ate o eixo
  pivo.add(deck)

  const geoMadeira = camada(forma, ESP, 0)
  const madeira = new THREE.Mesh(geoMadeira, matMadeira)
  madeira.castShadow = true; madeira.receiveShadow = true
  deck.add(madeira)

  const geoLixa = camada(forma, ESP_LIXA, ESP / 2 + ESP_LIXA / 2)
  const lixa = new THREE.Mesh(geoLixa, matLixa)
  lixa.castShadow = false           // casquinha de 2 mm em cima da madeira: sombra so briga
  lixa.receiveShadow = true
  deck.add(lixa)

  const geoArte = camada(forma, ESP_ARTE, -ESP / 2 - ESP_ARTE / 2)
  const arte = new THREE.Mesh(geoArte, matArte)
  arte.castShadow = false
  arte.receiveShadow = true
  deck.add(arte)

  // --- parafusos: 4 por truck, aparecendo na lixa ---------------------------
  const geoParafuso = new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 6)
  for (const sz of [-1, 1]) {
    for (const dx of [-0.032, 0.032]) {
      for (const dz of [-0.026, 0.026]) {
        const p = new THREE.Mesh(geoParafuso, matMetalEscuro)
        p.position.set(dx, ESP / 2 + ESP_LIXA + 0.001, sz * EIXO_Z + dz)
        p.castShadow = false
        deck.add(p)
      }
    }
  }

  // --- trucks ---------------------------------------------------------------
  // Um truck e: base presa na madeira, pino inclinado com a bucha (o
  // amortecedor), o hanger atravessado e o eixo passando pelas rodas.
  const rodas = []
  const geoRoda = new THREE.CylinderGeometry(RODA_R, RODA_R, RODA_L, 20)
  geoRoda.rotateZ(Math.PI / 2)      // eixo da roda no X: sobra o rotation.x pro giro
  const geoNucleo = new THREE.CylinderGeometry(RODA_R * 0.45, RODA_R * 0.45, RODA_L + 0.002, 12)
  geoNucleo.rotateZ(Math.PI / 2)
  const geoEixo = new THREE.CylinderGeometry(0.0075, 0.0075, EIXO_X * 2 + RODA_L, 8)
  geoEixo.rotateZ(Math.PI / 2)

  for (const sz of [1, -1]) {       // 1 = truck da frente (+Z)
    const truck = new THREE.Group()
    truck.position.set(0, 0, sz * EIXO_Z)
    pivo.add(truck)

    const yBase = DECK_Y - RODA_R   // face de baixo da madeira, no espaco do pivo

    // tudo do truck e METAL CLARO de proposito: em preto ele vira uma mancha
    // escura debaixo do deck e o skate perde a maquininha embaixo
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.014, 0.072), matMetal)
    base.position.y = yBase - 0.007
    base.castShadow = true; base.receiveShadow = true
    truck.add(base)

    // pino do rei: inclinado pra dentro do skate, como no truck de verdade
    const pino = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.052, 8), matMetal)
    pino.position.set(0, yBase - 0.028, sz * -0.014)
    pino.rotation.x = sz * 0.55
    pino.castShadow = false
    truck.add(pino)

    // bucha: o AMORTECEDOR. Duas, uma de cada lado da placa, no laranja do
    // uretano — e a unica cor viva embaixo do deck, entao ela conta a historia
    // de que aquilo ali e o que deixa o truck virar.
    for (const s2 of [-1, 1]) {
      const bucha = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.014, 0.013, 12), matBucha)
      bucha.position.set(0, yBase - 0.021 + s2 * 0.013, sz * (-0.018 - s2 * 0.008))
      bucha.rotation.x = sz * 0.55
      bucha.castShadow = true; bucha.receiveShadow = true
      truck.add(bucha)
    }

    // hanger: a peca atravessada que segura o eixo. Fica logo acima do eixo pra
    // ler como uma coisa so com ele.
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.027, 0.09, 10), matMetal)
    hanger.position.set(0, yBase - 0.042, sz * 0.004)
    hanger.rotation.z = Math.PI / 2
    hanger.rotation.y = sz * 0.35   // aponta pro centro do skate
    hanger.castShadow = true; hanger.receiveShadow = true
    truck.add(hanger)

    const braco = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.016, 0.056), matMetal)
    braco.position.set(0, yBase - 0.026, sz * 0.026)
    braco.castShadow = true; braco.receiveShadow = true
    truck.add(braco)

    const eixo = new THREE.Mesh(geoEixo, matMetalEscuro)
    eixo.position.y = 0
    eixo.castShadow = false
    truck.add(eixo)

    // As duas rodas deste truck num EIXO so. O truck ja tem a origem no centro
    // do eixo e as duas rodas ficam em cima do proprio X local (y = z = 0),
    // ou seja, EM CIMA do eixo de giro: girar este grupo em X gira cada roda em
    // torno do proprio centro, exatamente como girar as duas separadas. Com
    // isso as quatro rodas custam 4 draw calls em vez de 8, e o resto do truck
    // (base, pino, buchas, hanger) fica de fora, parado, como tem que ficar.
    const eixoRodas = new THREE.Group()
    truck.add(eixoRodas)
    for (const sx of [-1, 1]) {
      const roda = new THREE.Mesh(geoRoda, matRoda)
      roda.position.set(sx * EIXO_X, 0, 0)
      roda.castShadow = true; roda.receiveShadow = true
      const nucleo = new THREE.Mesh(geoNucleo, matNucleo)
      nucleo.castShadow = false
      roda.add(nucleo)                // gira junto: e o que deixa o giro visivel
      eixoRodas.add(roda)
    }
    // uretano e nucleo sao rigidos entre si: viram dois meshes, um por material
    bakeStatic(eixoRodas)
    eixoRodas.userData.dynamic = true      // o forno do skate nao pode engoli-lo
    // O contrato de veiculos.js le estes dois campos do proprio no:
    //   raio    senao ele mede a caixa do PAR de rodas (larga demais) e o giro
    //           sairia lento demais pro chao que passa embaixo;
    //   esterca senao ele deduz pelo z > 0.05 e o eixo da frente comecaria a
    //           estercar — e no skate quem vira e o deck, nunca a roda.
    eixoRodas.userData.raio = RODA_R
    eixoRodas.userData.esterca = false
    // O HANGER, pra quem quiser fazer o truck virar.
    //
    // Um skate nao esterca com as maos: quando o deck tomba, a bucha cede e o
    // hanger GIRA junto do pino, virando as duas rodas daquele truck. Sao os
    // trucks que fazem a curva, e sem eles virando o deck inclina com as
    // quatro rodas apontando pra frente, feito carrinho de rolima.
    //
    // Ele vai pelo userData e nao por eixoRodas.parent porque o forno de
    // geometria pode dissolver grupos intermediarios; `dynamic` o protege, e
    // o campo garante que quem le sempre ache o no certo.
    truck.userData.dynamic = true
    eixoRodas.userData.truck = truck
    rodas.push(eixoRodas)
  }

  // --- assento: em pe, de lado ----------------------------------------------
  // De pe base ("regular"): pe esquerdo pra frente. Com a frente do skate em
  // +Z, isso poe o corpo olhando pra -X — dai o -PI/2. O +0.30 abre o tronco um
  // pouco pra frente, que e como se anda de verdade.
  const assento = new THREE.Object3D()
  // ATENCAO AO -RODA_R: o assento e filho do PIVO, que ja esta pendurado na
  // altura do eixo. Sem descontar isso o skatista nascia 2.8 cm ACIMA da lixa
  // — os pes no ar, que era metade da queixa de "parece um skate voador".
  assento.position.set(0, DECK_Y + ESP + ESP_LIXA - RODA_R, -0.02)
  assento.rotation.y = -Math.PI / 2 + 0.30
  assento.name = 'assento'
  // contrato de veiculos.js: 'empe' + ancora 'pes' = o ponto JA e onde a raiz
  // do boneco (que fica nos pes) encosta
  assento.userData.pose = 'empe'
  assento.userData.ancora = 'pes'
  // nao e mesh: sem a marca o forno o varreria junto com os grupos vazios e o
  // skatista perderia o ponto onde apoia os pes
  assento.userData.dynamic = true
  pivo.add(assento)                  // dentro do pivo: o skatista tomba com o deck

  // --- alvos dos pes (contrato de pose de veiculos.js) ----------------------
  // Onde cada pe REPOUSA em cima da lixa: em cima dos parafusos de cada truck,
  // que e onde um skatista poe o pe de verdade. O sistema usa estes dois
  // pontos como base e leva o pe de tras ate o chao quando ele empurra.
  // Lado +X = pe da frente (o nariz do skate fica no +X do boneco, ver o giro
  // do assento logo acima).
  const pesAlvo = []
  for (const sz of [1, -1]) {
    const a = new THREE.Object3D()
    a.position.set(0, DECK_Y + ESP + ESP_LIXA - RODA_R, sz * EIXO_Z)
    a.userData.dynamic = true
    pivo.add(a)
    pesAlvo.push(a)
  }

  grupo.userData.pivo = pivo         // o sistema inclina ESTE, nao o grupo
  grupo.userData.assento = assento
  grupo.userData.rodas = rodas
  grupo.userData.config = 'skate'
  grupo.userData.piloto = { pes: pesAlvo }

  // FORNO. Funde o PIVO, nao o grupo: e o pivo que o sistema tomba na curva
  // (rotation.z), entao ele tem que continuar existindo como no. Por dentro
  // dele o deck (madeira + lixa + arte + 16 parafusos) e os dois trucks sao
  // rigidos — nada disso se mexe enquanto o skate anda. Ficam de fora so os
  // dois eixos de roda, o assento e os alvos dos pes, ja marcados acima.
  bakeStatic(pivo)

  return { grupo, assento, rodas, config: 'skate' }
}

// ---------------------------------------------------------------------------
// SUPOSICOES
//
// - `assento` marca onde vai a RAIZ do personagem, que em character.js fica NOS
//   PES (ARCHITECTURE.md). Por isso ele esta na face de cima do deck.
// - `rodas` sao os DOIS eixos (um por truck), nao as quatro rodas: cada eixo e
//   um Object3D com as duas rodas do truck em cima do proprio X, entao somar em
//   eixo.rotation.x (rad = distancia / RODA_R) gira as duas em torno do centro
//   delas, que e o mesmo efeito de girar cada roda separada — por metade dos
//   draw calls. Cada eixo leva userData.raio (senao o sistema mede a caixa do
//   par e o giro sai lento) e userData.esterca = false (nenhuma esterca).
// - `grupo.userData.pivo` existe pro sistema inclinar o skate na curva
//   (rotation.z) sem tirar as rodas do chao. Ignorar isso e inclinar o grupo
//   inteiro tambem funciona — so afunda um pouco as rodas.
// ---------------------------------------------------------------------------
