import * as THREE from 'three'
import { solid, stdMat, tex, box, cyl, roundedBox } from '../world/materials.js'
import { SKIN_DEFAULT } from '../player/appearance.js'

// ---------------------------------------------------------------------------
// O REVOLVER — so o modelo. Nenhum estado de jogo, nenhuma rede.
//
// Referencia: Colt Single Action Army ("Peacemaker") de cano longo — cano
// octogonal, armacao com a janela do tambor aberta, tambor de 6 camaras
// canelado, martelo de esporao quadriculado, gatilho dentro do guarda-mato e
// coronha de nogueira quadriculada.
//
// Convencao do jogo: +Z = frente. O modelo ja e autorado com o cano em +Z e a
// ORIGEM NO MEIO DA CORONHA — o ponto que a mao segura — porque e essa origem
// que vira filha de character.parts.handR (3a pessoa) ou da pose de tela
// (1a pessoa).
//
// As medidas saem de um SAA de verdade, reduzidas na mesma proporcao:
// comprimento total ~0.27 m, altura ~0.13 m, eixo do cano a 0.086 m acima do
// meio da coronha. Proporcao importa mais aqui do que em qualquer prop da
// cidade: a arma fica na tela o tempo todo em 1a pessoa, e um cabo grande
// demais ou um cano grosso demais denunciam na hora.
//
// Duas pecas merecem explicacao:
//
//  * a ARMACAO e o TAMBOR sao ExtrudeGeometry de um contorno 2D com FUROS.
//    A armacao ganha a janela do tambor (um tunel de um lado ao outro) e o
//    tambor ganha as 6 CAMARAS vazadas de verdade. Sem booleana e sem asset:
//    o furo faz parte do contorno. E o unico jeito de enxergar as balas la
//    dentro, que e o ponto do pedido.
//  * a CORONHA e o GUARDA-MATO tambem sao perfis extrudados, porque os dois
//    sao silhuetas curvas — caixas arredondadas nunca leriam como tal.
// ---------------------------------------------------------------------------

// Medidas em metros.
const EIXO_CANO = 0.065        // altura do eixo do cano/tambor sobre a origem
const CANO_Z0 = 0.042          // onde o cano comeca (a frente da armacao)
const CANO_Z1 = 0.196          // boca do cano (cano de 15 cm, ~6 polegadas)
const CANO_R = 0.0098          // raio do octogono do cano
const LINHA_VISADA = 0.097     // altura do topo das duas miras (ver abaixo)
const TAMBOR_R = 0.0205        // raio externo do tambor
const TAMBOR_L = 0.042         // comprimento do tambor
const CAMARA_R = 0.0053        // raio de cada camara
const CAMARA_D = 0.0122        // distancia da camara ao eixo do tambor
const ARMACAO_T = 0.030        // espessura da armacao (o tambor sobra dos lados)
export const N_CAMARAS = 6

// Dobradica do tambor: eixo VERTICAL na frente da armacao, do lado por onde o
// tambor sai (+X, que e a ESQUERDA de quem olha pela alca de mira — revolver
// bascula pra esse lado). O tambor esta ATRAS dela em Z, e e essa distancia
// que faz o conjunto sair PRO LADO em vez de pra frente quando o pivo gira.
const DOBRADICA = { x: 0.026, z: 0.027 }
/** Angulo do pivo com o tambor totalmente aberto (negativo = pra fora). */
export const ANGULO_ABERTO = -1.28

/** Textura quadriculada da coronha (nogueira escura + losangos entalhados). */
function texQuadriculado(repeticoes) {
  return tex('revolver:quadriculado', 128, (g, s) => {
    // base de nogueira: veios irregulares pra nao ficar plastico
    g.fillStyle = '#7a5330'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = 'rgba(' + (Math.random() > 0.5 ? '52,30,14' : '170,122,74') + ',' + (Math.random() * 0.3) + ')'
      g.lineWidth = 1 + Math.random() * 3
      const y = Math.random() * s
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= s; x += 12) g.lineTo(x, y + Math.sin(x * 0.06 + i) * 2.5)
      g.stroke()
    }
    // O quadriculado: dois feixes de linhas a 45 graus. Cada linha leva um
    // vinco escuro e um realce claro logo ao lado — e o PAR que da relevo;
    // uma linha sozinha le como risco, nao como entalhe.
    const passo = 15
    g.lineWidth = 1.5
    for (const sinal of [1, -1]) {
      for (let i = -s; i < s * 2; i += passo) {
        g.strokeStyle = 'rgba(34,18,6,0.55)'
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + sinal * s, s); g.stroke()
        g.strokeStyle = 'rgba(226,180,124,0.28)'
        g.beginPath(); g.moveTo(i + 2.2, 0); g.lineTo(i + sinal * s + 2.2, s); g.stroke()
      }
    }
  }, repeticoes)
}

/**
 * Extruda um contorno desenhado no plano (Z, Y) do jogo ao longo de X.
 * shape-x vira +Z, shape-y vira +Y, e a espessura fica centrada em x = 0.
 */
function extrudarEmX(shape, espessura, material, bisel) {
  const b = bisel || 0
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.0005, espessura - b * 2),
    bevelEnabled: b > 0, bevelThickness: b, bevelSize: b,
    bevelSegments: 2, curveSegments: 10,
  })
  geo.rotateY(-Math.PI / 2)
  geo.translate((espessura - b * 2) / 2, 0, 0)
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Extrusao sem rotacao: o contorno ja esta no plano XY e sai ao longo de Z. */
function extrudarEmZ(shape, espessura, material) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: espessura, bevelEnabled: true,
    bevelThickness: 0.0011, bevelSize: 0.0011, bevelSegments: 1, curveSegments: 6,
  })
  geo.translate(0, 0, -espessura / 2)
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Circulo como furo de Shape. */
function furoCircular(cx, cy, r) {
  const p = new THREE.Path()
  p.absarc(cx, cy, r, 0, Math.PI * 2, true)
  return p
}

// --- contornos ---------------------------------------------------------------

/** Silhueta lateral da armacao, com a janela do tambor como furo. */
function contornoArmacao() {
  const s = new THREE.Shape()
  s.moveTo(-0.022, 0.036)                            // barriga, atras
  s.lineTo(-0.044, 0.038)
  s.quadraticCurveTo(-0.053, 0.044, -0.053, 0.060)   // escudo de recuo
  s.lineTo(-0.053, 0.084)
  s.quadraticCurveTo(-0.053, 0.093, -0.044, 0.093)
  s.lineTo(0.034, 0.093)                             // ponte superior
  s.quadraticCurveTo(0.043, 0.093, 0.043, 0.084)
  s.lineTo(0.043, 0.050)                             // frente (cone de forcamento)
  s.quadraticCurveTo(0.043, 0.039, 0.031, 0.037)
  s.lineTo(-0.020, 0.036)
  s.closePath()
  // Janela do tambor: tunel de lado a lado. Cantos redondos — a quina viva
  // denunciaria que por baixo e um retangulo.
  const j = new THREE.Path()
  const z0 = -0.028, z1 = 0.028, y0 = 0.0425, y1 = 0.0875, r = 0.005
  j.moveTo(z0 + r, y0)
  j.lineTo(z1 - r, y0); j.quadraticCurveTo(z1, y0, z1, y0 + r)
  j.lineTo(z1, y1 - r); j.quadraticCurveTo(z1, y1, z1 - r, y1)
  j.lineTo(z0 + r, y1); j.quadraticCurveTo(z0, y1, z0, y1 - r)
  j.lineTo(z0, y0 + r); j.quadraticCurveTo(z0, y0, z0 + r, y0)
  s.holes.push(j)
  return s
}

/** Silhueta da coronha "plow handle": desce e volta pra tras, barriga na frente. */
function contornoCoronha() {
  const s = new THREE.Shape()
  s.moveTo(-0.020, 0.038)
  s.lineTo(-0.043, 0.041)                             // encosto no punho traseiro
  s.quadraticCurveTo(-0.058, 0.016, -0.065, -0.012)   // dorso, bem inclinado
  s.quadraticCurveTo(-0.070, -0.030, -0.062, -0.040)
  s.quadraticCurveTo(-0.052, -0.050, -0.040, -0.043)  // culatra
  s.quadraticCurveTo(-0.032, -0.038, -0.029, -0.020)
  s.quadraticCurveTo(-0.024, 0.004, -0.021, 0.022)    // barriga da frente
  s.quadraticCurveTo(-0.020, 0.031, -0.020, 0.038)
  s.closePath()
  return s
}

/** Tira metalica que corre pelas costas da coronha ate a culatra. */
function contornoDorso() {
  const s = new THREE.Shape()
  s.moveTo(-0.043, 0.042)
  s.quadraticCurveTo(-0.058, 0.016, -0.065, -0.012)
  s.quadraticCurveTo(-0.070, -0.030, -0.062, -0.040)
  s.lineTo(-0.055, -0.035)
  s.quadraticCurveTo(-0.061, -0.026, -0.057, -0.012)
  s.quadraticCurveTo(-0.050, 0.014, -0.037, 0.040)
  s.closePath()
  return s
}

/** Guarda-mato: meia-lua vazada pendurada na barriga da armacao. */
function contornoGuarda() {
  const zc = -0.008, yc = 0.031, R = 0.024, r = 0.0168
  const A0 = Math.PI * 1.06, A1 = Math.PI * 1.96
  const s = new THREE.Shape()
  const N = 20
  s.moveTo(-0.038, 0.040)                             // perna de tras, na armacao
  for (let i = 0; i <= N; i++) {
    const a = A0 + ((A1 - A0) * i) / N
    s.lineTo(zc + Math.cos(a) * R, yc + Math.sin(a) * R)
  }
  s.lineTo(0.018, 0.040)                              // perna da frente
  s.lineTo(0.010, 0.040)
  for (let i = N; i >= 0; i--) {
    const a = A0 + ((A1 - A0) * i) / N
    s.lineTo(zc + Math.cos(a) * r, yc + Math.sin(a) * r)
  }
  s.lineTo(-0.030, 0.040)
  s.closePath()
  return s
}

/** Contorno do tambor: circulo com 6 caneluras e as 6 camaras vazadas. */
function contornoTambor() {
  const s = new THREE.Shape()
  const N = 84, prof = 0.0022
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    // Caneluras ENTRE as camaras: cos(6t) vale 1 no meio de cada vao e zero
    // onde estao os furos — e assim que sobra parede pra bala.
    const c = Math.cos(6 * t)
    const r = TAMBOR_R - prof * Math.pow(Math.max(0, c), 0.55)
    const x = Math.cos(t) * r, y = Math.sin(t) * r
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y)
  }
  s.closePath()
  for (let i = 0; i < N_CAMARAS; i++) {
    const a = (i / N_CAMARAS) * Math.PI * 2 + Math.PI / N_CAMARAS
    s.holes.push(furoCircular(Math.cos(a) * CAMARA_D, Math.sin(a) * CAMARA_D, CAMARA_R))
  }
  return s
}

/**
 * Monta o revolver.
 *
 * Devolve as juntas que o sistema anima (pivoTambor, tambor, martelo, gatilho,
 * ejetor) e os pontos notaveis em espaco do grupo.
 */
export function criarModeloRevolver(opts = {}) {
  const grupo = new THREE.Group()
  grupo.name = 'revolver'

  const geos = []
  const reg = (m) => { geos.push(m.geometry); return m }

  // Aco pavonado e quase preto na vida real, mas o jogo tem tone mapping ACES
  // e a arma passa metade do tempo na sombra: no valor de verdade ela vira uma
  // silhueta chapada. Estes tons sao o azulado clareado o bastante pra as
  // quinas ainda aparecerem contra o asfalto. A armacao puxa pro quente
  // (cementacao) e separa as pecas sem precisar de cor chapada.
  const matCano = solid(0x3e424b, 0.33, 0.82)
  const matArmacao = solid(0x554f40, 0.44, 0.68)
  const matPreto = solid(0x16171b, 0.52, 0.60)
  const matLatao = solid(0xc0913c, 0.30, 0.88)
  const matChumbo = solid(0x9a9ca1, 0.44, 0.55)
  const matFuligem = solid(0x6f5c37, 0.62, 0.55)
  const matMadeira = stdMat('revolver:madeira', {
    map: texQuadriculado(34), color: 0xc09468, roughness: 0.58, metalness: 0.04,
  })

  // =========================================================================
  // 1. ARMACAO
  // =========================================================================
  const armacao = reg(extrudarEmX(contornoArmacao(), ARMACAO_T, matArmacao, 0.0020))
  grupo.add(armacao)

  // Entalhe da mira traseira: dois blocos na ponte deixando um vao no meio.
  // O TOPO deles e LINHA_VISADA — a massa de mira la na frente termina
  // exatamente nessa altura, senao mirar pela alca aponta pro ceu.
  for (const sx of [-1, 1]) {
    grupo.add(reg(box(0.011, 0.006, 0.019, matArmacao, sx * 0.0085, LINHA_VISADA - 0.003, -0.034)))
  }

  // parafusos de cabeca: eixo do tambor e do gatilho
  const geoParafuso = new THREE.CylinderGeometry(0.0038, 0.0038, 0.0016, 10)
  geos.push(geoParafuso)
  for (const p of [[-0.042, 0.060], [-0.015, 0.042]]) {
    for (const sx of [-1, 1]) {
      const pf = new THREE.Mesh(geoParafuso, matCano)
      pf.rotation.z = Math.PI / 2
      pf.position.set(sx * (ARMACAO_T / 2 + 0.0006), p[1], p[0])
      pf.castShadow = true; pf.receiveShadow = true
      grupo.add(pf)
    }
  }

  // portinhola de carga, no flanco oposto ao que o tambor bascula
  const portinhola = reg(box(0.0035, 0.022, 0.017, matCano, -0.0163, 0.064, -0.024))
  portinhola.rotation.x = 0.05
  grupo.add(portinhola)

  // =========================================================================
  // 2. CANO OCTOGONAL + MIRA + HASTE EJETORA
  // =========================================================================
  const canoL = CANO_Z1 - CANO_Z0
  const cano = reg(cyl(CANO_R, CANO_R, canoL, matCano, 8))
  cano.rotation.x = Math.PI / 2              // o eixo do cilindro (+Y) vira +Z
  cano.rotation.y = Math.PI / 8              // face plana em cima, nao quina
  cano.position.set(0, EIXO_CANO, CANO_Z0 + canoL / 2)
  grupo.add(cano)

  // colar da boca: engorda a ponta, como o anel de reforco de arma velha
  const colar = reg(cyl(CANO_R * 1.14, CANO_R * 1.14, 0.009, matCano, 8))
  colar.rotation.x = Math.PI / 2
  colar.rotation.y = Math.PI / 8
  colar.position.set(0, EIXO_CANO, CANO_Z1 - 0.005)
  grupo.add(colar)

  // furo escuro da boca: sem ele a ponta le como um bastao macico
  const geoAlma = new THREE.CylinderGeometry(0.0046, 0.0046, 0.018, 12)
  geos.push(geoAlma)
  const alma = new THREE.Mesh(geoAlma, matPreto)
  alma.rotation.x = Math.PI / 2
  alma.position.set(0, EIXO_CANO, CANO_Z1 - 0.009)
  grupo.add(alma)

  // Massa de mira: lamina alta o bastante pra o topo bater em LINHA_VISADA.
  // Exagerada pro padrao de arma de verdade, e de proposito: e ela que o
  // jogador enxerga no centro da tela ao mirar.
  const mira = reg(box(0.0038, 0.024, 0.010, matCano, 0, LINHA_VISADA - 0.011, CANO_Z1 - 0.013))
  grupo.add(mira)

  // haste ejetora alojada ao lado e abaixo do cano (marca do Peacemaker)
  const tuboEj = reg(cyl(0.0062, 0.0062, 0.106, matCano, 10))
  tuboEj.rotation.x = Math.PI / 2
  tuboEj.position.set(-0.0118, EIXO_CANO - 0.0118, 0.122)
  grupo.add(tuboEj)
  const cabecaEj = reg(cyl(0.0050, 0.0070, 0.014, matCano, 10))
  cabecaEj.rotation.x = Math.PI / 2
  cabecaEj.position.set(-0.0118, EIXO_CANO - 0.0118, 0.064)
  grupo.add(cabecaEj)

  // =========================================================================
  // 3. TAMBOR — bascula pro lado num pivo de eixo vertical
  // =========================================================================
  const pivoTambor = new THREE.Group()
  pivoTambor.name = 'revolver-crane'
  pivoTambor.position.set(DOBRADICA.x, EIXO_CANO, DOBRADICA.z)
  grupo.add(pivoTambor)

  // braco da dobradica: so aparece de verdade com o tambor aberto
  pivoTambor.add(reg(box(0.010, 0.016, 0.034, matArmacao, -0.005, 0, -0.017)))

  const tambor = new THREE.Group()
  tambor.name = 'revolver-tambor'
  tambor.position.set(-DOBRADICA.x, 0, -DOBRADICA.z)
  pivoTambor.add(tambor)

  tambor.add(reg(extrudarEmZ(contornoTambor(), TAMBOR_L, matCano)))

  // aro de trava traseiro
  const aroTras = reg(cyl(TAMBOR_R * 0.985, TAMBOR_R * 0.985, 0.005, matCano, 24))
  aroTras.rotation.x = Math.PI / 2
  aroTras.position.set(0, 0, -TAMBOR_L / 2 + 0.0025)
  tambor.add(aroTras)

  // eixo central + estrela extratora, que empurra as capsulas na recarga
  const ejetor = new THREE.Group()
  ejetor.name = 'revolver-ejetor'
  tambor.add(ejetor)
  const estrela = reg(cyl(0.0082, 0.0082, 0.0035, matCano, 12))
  estrela.rotation.x = Math.PI / 2
  estrela.position.set(0, 0, -TAMBOR_L / 2 - 0.0018)
  ejetor.add(estrela)
  const eixo = reg(cyl(0.0030, 0.0030, TAMBOR_L + 0.028, matCano, 8))
  eixo.rotation.x = Math.PI / 2
  eixo.position.set(0, 0, 0.004)
  ejetor.add(eixo)

  // --- as 6 municoes ---------------------------------------------------------
  // Geometrias criadas UMA vez e reusadas nas 6 camaras.
  const geoEstojo = new THREE.CylinderGeometry(CAMARA_R * 0.92, CAMARA_R * 0.92, 0.018, 12)
  const geoAro = new THREE.CylinderGeometry(CAMARA_R * 1.02, CAMARA_R * 1.02, 0.0020, 12)
  const geoOgiva = new THREE.SphereGeometry(CAMARA_R * 0.84, 12, 8)
  geos.push(geoEstojo, geoAro, geoOgiva)

  const camaras = []
  for (let i = 0; i < N_CAMARAS; i++) {
    const a = (i / N_CAMARAS) * Math.PI * 2 + Math.PI / N_CAMARAS
    const gc = new THREE.Group()
    gc.position.set(Math.cos(a) * CAMARA_D, Math.sin(a) * CAMARA_D, 0)
    tambor.add(gc)

    // bala inteira: estojo de latao + aro de fundo + ogiva de chumbo
    const bala = new THREE.Group()
    const est = new THREE.Mesh(geoEstojo, matLatao)
    est.rotation.x = Math.PI / 2
    est.position.z = -TAMBOR_L / 2 + 0.010
    est.receiveShadow = true
    bala.add(est)
    const aro = new THREE.Mesh(geoAro, matLatao)
    aro.rotation.x = Math.PI / 2
    aro.position.z = -TAMBOR_L / 2 + 0.0010
    bala.add(aro)
    const ogiva = new THREE.Mesh(geoOgiva, matChumbo)
    ogiva.scale.set(1, 1, 1.4)
    ogiva.position.z = -TAMBOR_L / 2 + 0.0215
    bala.add(ogiva)
    gc.add(bala)

    // capsula deflagrada: o mesmo estojo, sem ogiva e sujo de fuligem
    const capsula = new THREE.Group()
    const est2 = new THREE.Mesh(geoEstojo, matFuligem)
    est2.rotation.x = Math.PI / 2
    est2.position.z = -TAMBOR_L / 2 + 0.010
    capsula.add(est2)
    const aro2 = new THREE.Mesh(geoAro, matFuligem)
    aro2.rotation.x = Math.PI / 2
    aro2.position.z = -TAMBOR_L / 2 + 0.0010
    capsula.add(aro2)
    capsula.visible = false
    gc.add(capsula)

    camaras.push({ grupo: gc, bala, capsula, angulo: a })
  }

  // =========================================================================
  // 4. MARTELO E GATILHO
  // =========================================================================
  const martelo = new THREE.Group()
  martelo.name = 'revolver-martelo'
  // O esporao NAO pode passar de LINHA_VISADA: em repouso ele fica logo atras
  // da alca de mira, e um milimetro mais alto tapa a alca exatamente na hora
  // em que o jogador esta mirando.
  martelo.position.set(0, 0.060, -0.040)
  grupo.add(martelo)
  martelo.add(reg(box(0.010, 0.026, 0.013, matCano, 0, 0.012, -0.004)))
  // esporao: a aba larga onde o polegar arma o revolver
  const esporao = reg(box(0.011, 0.007, 0.019, matCano, 0, 0.020, -0.013))
  esporao.rotation.x = 0.32
  martelo.add(esporao)
  martelo.add(reg(box(0.004, 0.006, 0.007, matCano, 0, 0.003, 0.006)))

  const gatilho = new THREE.Group()
  gatilho.name = 'revolver-gatilho'
  gatilho.position.set(0, 0.038, -0.015)
  grupo.add(gatilho)
  const lamina = reg(box(0.005, 0.021, 0.008, matCano, 0, -0.0095, -0.002))
  lamina.rotation.x = -0.22
  gatilho.add(lamina)

  grupo.add(reg(extrudarEmX(contornoGuarda(), 0.016, matArmacao, 0.0015)))

  // =========================================================================
  // 5. CORONHA
  // =========================================================================
  grupo.add(reg(extrudarEmX(contornoCoronha(), 0.032, matMadeira, 0.0030)))
  // Armacao do punho em metal: dorso + culatra. A madeira fica encaixada
  // entre eles, e e isso que faz a coronha parecer montada, nao esculpida.
  grupo.add(reg(extrudarEmX(contornoDorso(), 0.017, matArmacao, 0.0012)))
  const culatra = reg(box(0.026, 0.007, 0.034, matArmacao, 0, -0.047, -0.049))
  culatra.rotation.x = 0.38
  grupo.add(culatra)

  // argola de cordao: detalhe de arma antiga, custa 60 triangulos
  const geoArgola = new THREE.TorusGeometry(0.0055, 0.0014, 6, 12)
  geos.push(geoArgola)
  const argola = new THREE.Mesh(geoArgola, matCano)
  argola.rotation.y = Math.PI / 2
  argola.position.set(0, -0.049, -0.062)
  grupo.add(argola)

  // =========================================================================
  // 6. MAO POSTICA (so aparece no modelo de tela, em 1a pessoa)
  // =========================================================================
  const mao = criarMaoPostica(opts.pele || SKIN_DEFAULT, opts.manga || 0x3f5d86, geos)
  mao.visible = false
  grupo.add(mao)

  // --- pontos notaveis, em espaco do GRUPO ------------------------------------
  const bocaLocal = new THREE.Vector3(0, EIXO_CANO, CANO_Z1 + 0.004)
  const miraLocal = new THREE.Vector3(0, LINHA_VISADA, CANO_Z1 - 0.013)
  const ejecaoLocal = new THREE.Vector3(0, EIXO_CANO, -TAMBOR_L / 2)

  /** Mostra bala inteira, capsula deflagrada ou camara vazia. */
  function definirCamara(i, estado) {
    const c = camaras[i]
    if (!c) return
    c.bala.visible = estado === 'bala'
    c.capsula.visible = estado === 'capsula'
  }

  function dispose() {
    if (grupo.parent) grupo.parent.remove(grupo)
    for (const g of geos) g.dispose()
    geos.length = 0
    // os materiais vem do cache de materials.js e sao compartilhados com o
    // resto da cidade: liberar aqui quebraria outros modulos.
  }

  return {
    grupo, pivoTambor, tambor, martelo, gatilho, ejetor, mao,
    camaras, definirCamara,
    bocaLocal, miraLocal, ejecaoLocal,
    eixoCano: EIXO_CANO,
    linhaVisada: LINHA_VISADA,
    dispose,
  }
}

/**
 * Punho fechado + antebraco simplificados, no estilo do personagem (luva
 * arredondada, dedos grossos). So existe pro modelo de 1a pessoa: la a arma
 * e colada na tela, e sem uma mao ela flutuaria sozinha na frente do rosto.
 */
function criarMaoPostica(pele, manga, geos) {
  const g = new THREE.Group()
  g.name = 'revolver-mao'
  const matPele = solid(pele, 0.78, 0.0)
  const matManga = solid(manga, 0.85, 0.0)
  const reg = (m) => { geos.push(m.geometry); return m }

  // Dorso da mao: bloco ATRAS da coronha (o dorso dela vai de z = -0.052 em
  // cima a -0.068 embaixo), inclinado como o cabo — um punho vertical num
  // cabo raked le como enxerto. A almofada da palma entra por dentro.
  const punho = new THREE.Group()
  punho.position.set(0.002, -0.002, -0.078)
  punho.rotation.x = 0.28
  g.add(punho)
  const dorso = reg(roundedBox(0.046, 0.068, 0.038, 0.015, matPele))
  punho.add(dorso)
  const palma = reg(roundedBox(0.040, 0.056, 0.026, 0.011, matPele))
  palma.position.set(0, -0.002, 0.024)
  punho.add(palma)

  // 4 dedos DOBRADOS por cima da barriga da coronha: capsulas deitadas no
  // eixo X, escalonadas acompanhando a curva do cabo. O no de cada dedo e uma
  // esfera do lado +X, que e o lado por onde a camera de 1a pessoa olha.
  const geoDedo = new THREE.CapsuleGeometry(0.0088, 0.030, 3, 8)
  const geoNo = new THREE.SphereGeometry(0.0094, 8, 6)
  geos.push(geoDedo, geoNo)
  const dedos = [[0.018, -0.024], [0.001, -0.027], [-0.016, -0.031], [-0.032, -0.036]]
  for (const [dy, dz] of dedos) {
    const d = new THREE.Mesh(geoDedo, matPele)
    d.rotation.z = Math.PI / 2
    d.rotation.y = 0.12
    d.position.set(-0.001, dy, dz)
    d.receiveShadow = true
    g.add(d)
    const no = new THREE.Mesh(geoNo, matPele)
    no.position.set(0.020, dy, dz + 0.003)
    g.add(no)
  }

  // polegar cruzando a coronha por cima, do lado da camera
  const polegar = new THREE.Mesh(geoDedo, matPele)
  polegar.rotation.set(0.0, 0.60, 1.20)
  polegar.position.set(0.020, 0.030, -0.046)
  polegar.receiveShadow = true
  g.add(polegar)

  // punho da manga + antebraco descendo pra fora do enquadramento
  const canhao = reg(cyl(0.037, 0.037, 0.028, matManga, 12))
  canhao.rotation.x = Math.PI / 4
  canhao.position.set(0.005, -0.050, -0.100)
  g.add(canhao)
  const braco = reg(cyl(0.034, 0.042, 0.20, matManga, 12))
  braco.rotation.x = Math.PI / 4
  braco.position.set(0.008, -0.126, -0.176)
  g.add(braco)

  return g
}
