import * as THREE from 'three'
import { solid, box, cyl, sphere, roundedBox } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// A MOTO — custom/cruiser preta com cromados, no desenho da foto de referencia
// (V-twin, tanque gota, garfo comprido e inclinado, para-lamas fundos, roda
// dianteira grande raiada). ~2.3 m de ponta a ponta.
//
// Contrato (VEICULOS.md): construir() -> { grupo, assento, rodas, config }
//   grupo   origem NO CHAO, no centro da moto, frente para +Z
//   assento Object3D na altura do banco (o sistema poe o boneco em cima)
//   rodas   [{ mesh, dianteira, raio }]
//   config  'moto', a chave em MUNDO.DIRIGIR
//
// AS TRES DECISOES QUE MUDARAM DA VERSAO ANTERIOR:
//
// 1) O EIXO DE DIRECAO E INCLINADO DE VERDADE (RAKE).
//    Numa custom o garfo sai da caixa de direcao com uns 30 graus de caimento,
//    e o guidao gira em volta DESSE eixo — nao em volta da vertical. Girando na
//    vertical (o que a versao anterior fazia, porque o sistema escreve
//    rotation.y no pivo) a roda de um garfo inclinado varre pro lado e sai do
//    rastro da moto. Aqui existem DOIS nos: `pivoRake`, que so inclina, e
//    dentro dele `pivoDir`, que e o que o sistema gira. Como pivoDir vive no
//    espaco ja inclinado, o rotation.y dele E o eixo de direcao real.
//    Tudo que e desenhado ali dentro passa por noPivo(): eu escrevo as medidas
//    no espaco da MOTO (que e onde da pra pensar) e a funcao converte.
//
// 2) A RODA E RAIADA DE VERDADE.
//    A roda dianteira de 21" da foto e o detalhe que mais grita "custom". Sao
//    raios laceados: cada um sai de um lado do cubo e chega no aro do outro
//    lado, cruzando com o vizinho. Vinte e quatro tubinhos por roda saem caros
//    de escrever e baratos de rodar — o forno funde todos num mesh so.
//
// 3) O PILOTO TEM ONDE POR AS MAOS E OS PES.
//    `grupo.userData.piloto` entrega os quatro Object3D de destino (punhos e
//    pedaleiras). Os punhos sao filhos do pivoDir: quando o guidao esterca, o
//    alvo esterca junto e o braco do boneco vai atras (veiculos.js resolve o
//    cotovelo por IK). E isso, mais que qualquer peca cromada, que faz a moto
//    parecer PILOTADA.
//
// Tudo que e tubo (chassi, garfo, escape, raio) sai do mesmo helper tubo():
// dois pontos no espaco e um raio. Da pra mexer numa medida sem recalcular
// angulo nenhum na mao.
// ---------------------------------------------------------------------------

// --- medidas (metros, espaco da moto: origem no chao, frente +Z) ------------
const R_TRAS = 0.305      // roda traseira 15", pneu gordo
const R_DIAN = 0.355      // roda dianteira grande, de custom
const W_TRAS = 0.185
const W_DIAN = 0.105
const Z_TRAS = -0.72      // eixo traseiro
const Z_DIAN = 0.86       // eixo dianteiro  (entre-eixos 1.58 m)

// Caimento do eixo de direcao e ponto onde ele articula. Com estes numeros o
// eixo corta o chao 15 cm a frente do contato do pneu: e o "trail" que faz uma
// moto de verdade se endireitar sozinha, e o que da a silhueta de custom.
const RAKE = 0.53
const CAB = [0, 0.97, 0.44]

const BANCO_Y = 0.70      // topo do banco (custom = banco baixo)
const Y_GUIDAO = 1.03     // altura dos punhos
const Z_PUNHO = 0.24      // punhos recuados: guidao puxado pro piloto
const X_PUNHO = 0.285
const PEDAL = [0.285, 0.30, 0.30]   // pedaleira: |x|, y, z (avancada, de custom)

const _EIXO_Y = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()

// --- helpers ----------------------------------------------------------------

/** Cilindro entre dois pontos [x,y,z]: chassi, garfo, escape, raio, suporte. */
function tubo(mat, r, a, b, seg = 10) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const comp = _dir.length()
  const m = cyl(r, r, comp, mat, seg)
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  m.quaternion.setFromUnitVectors(_EIXO_Y, _dir.normalize())
  return m
}

/**
 * Leva um ponto do espaco da MOTO para dentro do pivo de direcao. O pivo esta
 * em CAB com rotation.x = -RAKE, entao a volta e transladar e girar +RAKE.
 */
function noPivo(p) {
  const c = Math.cos(RAKE), s = Math.sin(RAKE)
  const y = p[1] - CAB[1], z = p[2] - CAB[2]
  return [p[0], y * c - z * s, y * s + z * c]
}

/** Como noPivo, mas para uma peca que precisa continuar EM PE (farol, roda). */
function emPeNoPivo(obj, p) {
  const g = new THREE.Group()
  const q = noPivo(p)
  g.position.set(q[0], q[1], q[2])
  g.rotation.x = RAKE          // desfaz o caimento do pivo
  g.add(obj)
  return g
}

/**
 * Chapa curva de para-lama: um anel entre rIn e rOut, do angulo ini ao fim,
 * extrudado na largura. Diferente de um torus fino (que le como CANO por cima
 * do pneu), isto tem borda, espessura e cara de chapa dobrada — que e o que os
 * para-lamas fundos da foto sao.
 * Angulo 0 = pra frente (+Z), PI/2 = pra cima.
 */
function chapaArco(mat, rIn, rOut, ini, fim, larg) {
  const s = new THREE.Shape()
  s.absarc(0, 0, rOut, ini, fim, false)
  s.absarc(0, 0, rIn, fim, ini, true)
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: larg, bevelEnabled: false, curveSegments: 16 })
  g.rotateY(-Math.PI / 2)      // X do desenho vira Z da moto; a profundidade vai pro -X
  g.translate(larg / 2, 0, 0)
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}

/**
 * Volume "de chapa estampada" a partir do PERFIL de lado: tanque, banco,
 * rabeta. E o mesmo truque da lataria do carro — bevel grosso nas duas faces
 * da um corpo cheio e arredondado que caixa empilhada nenhuma alcanca.
 */
function perfilCheio(pontos, larg, mat, bevel) {
  const b = bevel !== undefined ? bevel : Math.min(0.05, larg * 0.34)
  const s = new THREE.Shape()
  s.moveTo(pontos[0][0], pontos[0][1])
  for (let i = 1; i < pontos.length; i++) {
    const p = pontos[i]
    if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3])
    else s.lineTo(p[0], p[1])
  }
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.002, larg - b * 2), bevelEnabled: true,
    bevelThickness: b, bevelSize: b * 0.42, bevelSegments: 3, curveSegments: 12,
  })
  g.rotateY(-Math.PI / 2)
  g.translate((larg - b * 2) / 2, 0, 0)
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}

export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'moto'

  // --- materiais ------------------------------------------------------------
  // Preto de verdade, como na foto. roughness baixa pro sol deixar um risco de
  // luz na lataria; metalness so 0.22 porque a cena nao tem environment map e
  // metal alto sem reflexo pra refletir vira um borrao morto.
  const pintura = solid(0x131318, 0.22, 0.22)
  const cromo = solid(0xa3abb3, 0.24, 0.62)
  const cromoEscuro = solid(0x767d85, 0.36, 0.55)
  const aluminio = solid(0x9aa1a8, 0.38, 0.5)
  const pretoFosco = solid(0x111114, 0.9, 0.0)
  const motorMat = solid(0x6e747b, 0.42, 0.55)     // aluminio jateado do motor
  const pneuMat = solid(0x161619, 0.94, 0.0)
  const bandaMat = solid(0x1d1d21, 0.99, 0.0)      // banda de rodagem, um tom acima
  const couro = solid(0x17141a, 0.66, 0.0)
  const ambar = solid(0xd98a1e, 0.35, 0.1)

  // Instancias novas (nao o cache de solid()): o sistema acende o freio e o
  // farol mexendo no emissiveIntensity, e um material cacheado acenderia a moto
  // de todo mundo — e qualquer outro objeto vermelho da cidade junto.
  const luzFreio = new THREE.MeshStandardMaterial({
    color: 0x6b0e0e, emissive: 0xff1d1d, emissiveIntensity: 0.5, roughness: 0.3,
  })
  const farolMat = new THREE.MeshStandardMaterial({
    color: 0xf6f4e8, emissive: 0xffe9b0, emissiveIntensity: 0.3, roughness: 0.12,
  })

  // =========================================================================
  // 1. RODAS RAIADAS
  // =========================================================================
  /**
   * Pneu (torus vazado, pra o miolo aparecer), aro duplo, cubo e raios
   * laceados. `nRaios` e por LADO: 12 de cada lado = 24 tubinhos cruzando.
   */
  function fazerRoda(raio, larg, nRaios, gordo) {
    const r = new THREE.Group()
    // YXZ: o esterco (Y) tem que entrar ANTES do giro (X), senao a roda
    // estercaria em torno de um eixo que ja rodou junto com ela.
    r.rotation.order = 'YXZ'

    const tuboR = raio * (gordo ? 0.205 : 0.175)
    const pneu = new THREE.Mesh(
      new THREE.TorusGeometry(raio - tuboR, tuboR, 9, 30), pneuMat)
    pneu.rotation.y = Math.PI / 2            // eixo do torus vira o eixo X
    pneu.scale.z = larg / (tuboR * 2)        // achata o pneu ate a largura pedida
    pneu.castShadow = true; pneu.receiveShadow = true
    r.add(pneu)

    // Banda de rodagem: um anel mais claro so onde o pneu toca o chao.
    // ABERTO NAS PONTAS de proposito — um cilindro fechado tem duas tampas do
    // raio inteiro, e sao elas que tapam aro, raios e cubo e transformam a roda
    // num disco preto. Foi exatamente esse o bug da primeira versao.
    const banda = new THREE.Mesh(
      new THREE.CylinderGeometry(raio + 0.0015, raio + 0.0015, larg * 0.72, 26, 1, true),
      bandaMat)
    banda.rotation.z = Math.PI / 2
    banda.castShadow = false
    r.add(banda)

    // o furo do pneu tem raio (raio - 2*tuboR); o aro encosta nele por dentro
    const rAro = raio - tuboR * 2 + 0.006
    // aro: dois aneis (as duas bordas) + a base cilindrica entre eles
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(rAro, 0.014, 6, 26), cromo)
      a.rotation.y = Math.PI / 2
      a.position.x = s * larg * 0.26
      a.castShadow = true
      r.add(a)
    }
    // a base do aro tambem e ABERTA: fechada, as duas tampas dela viram um
    // disco cinza no meio da roda e engolem cubo e raios
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(rAro - 0.008, rAro - 0.008, larg * 0.52, 26, 1, true),
      cromoEscuro)
    base.rotation.z = Math.PI / 2
    base.castShadow = true
    r.add(base)

    // cubo: corpo + as duas flanges de onde saem os raios
    const cubo = cyl(0.045, 0.045, larg * 0.86, cromo, 14)
    cubo.rotation.z = Math.PI / 2
    r.add(cubo)
    for (const s of [1, -1]) {
      const fl = cyl(0.062, 0.048, 0.016, cromo, 14)
      fl.rotation.z = Math.PI / 2
      fl.position.x = s * larg * 0.30
      r.add(fl)
    }

    // RAIOS LACEADOS: o raio sai da flange de um lado e chega no aro com um
    // desvio angular (o "lace"). Alternar o desvio pra frente e pra tras e o
    // que faz a roda parecer trancada em vez de um leque chapado.
    const xFl = larg * 0.30, rFl = 0.058
    for (const s of [1, -1]) {
      for (let i = 0; i < nRaios; i++) {
        const a0 = (i / nRaios) * Math.PI * 2 + (s > 0 ? 0 : Math.PI / nRaios)
        const a1 = a0 + (i % 2 ? 1 : -1) * (Math.PI * 2 / nRaios) * 0.85
        r.add(tubo(cromo, 0.0052,
          [s * xFl, Math.sin(a0) * rFl, Math.cos(a0) * rFl],
          [s * larg * 0.14, Math.sin(a1) * (rAro - 0.012), Math.cos(a1) * (rAro - 0.012)], 4))
      }
    }
    // A roda gira e esterca, mas por DENTRO ela e rigida: pneu, aro, cubo e os
    // 24 raios andam sempre juntos. O forno funde tudo em tres meshes (um por
    // material) e o no `r` continua sendo quem recebe rotation.x/.y.
    bakeStatic(r)
    r.userData.dynamic = true   // sem esta marca o forno da moto a engoliria
    return r
  }

  /** Disco de freio furado + pinca. So aparece na roda dianteira. */
  function disco(raioRoda, x) {
    const g = new THREE.Group()
    const d = cyl(raioRoda * 0.62, raioRoda * 0.62, 0.008, cromoEscuro, 22)
    d.rotation.z = Math.PI / 2
    d.position.x = x
    g.add(d)
    const anel = new THREE.Mesh(
      new THREE.TorusGeometry(raioRoda * 0.5, 0.012, 5, 22), cromo)
    anel.rotation.y = Math.PI / 2
    anel.position.x = x
    g.add(anel)
    // furos do disco: dois aneis de furinhos, como no disco da foto
    const geoFuro = new THREE.CylinderGeometry(0.011, 0.011, 0.012, 6)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const f = new THREE.Mesh(geoFuro, pretoFosco)
      f.rotation.z = Math.PI / 2
      f.position.set(x, Math.sin(a) * raioRoda * 0.45, Math.cos(a) * raioRoda * 0.45)
      g.add(f)
    }
    return g
  }

  const rodas = []
  const rodaTras = fazerRoda(R_TRAS, W_TRAS, 10, true)
  const pivoTras = new THREE.Group()
  pivoTras.position.set(0, R_TRAS, Z_TRAS)
  pivoTras.add(rodaTras)
  grupo.add(pivoTras)
  rodas.push({ mesh: rodaTras, dianteira: false, raio: R_TRAS })

  // polia/coroa do lado esquerdo, presa na roda? Nao: ela nao gira junto no
  // desenho de correia da foto — fica no chassi, ao lado do cubo.
  const coroa = cyl(0.115, 0.115, 0.022, cromoEscuro, 20)
  coroa.rotation.z = Math.PI / 2
  coroa.position.set(0.095, R_TRAS, Z_TRAS)
  grupo.add(coroa)

  // =========================================================================
  // 2. CHASSI — espinha da caixa de direcao ao rabo, berco duplo no motor
  // =========================================================================
  const CAB_B = [0, 0.74, CAB[2] + 0.10]     // base da caixa de direcao

  // espinha: caixa de direcao -> debaixo do banco. E nela que o tanque senta.
  grupo.add(tubo(pretoFosco, 0.035, [0, CAB[1] - 0.04, CAB[2] + 0.02], [0, 0.68, -0.30]))
  // berco duplo: desce na frente do motor, passa por baixo e sobe pro rabo
  for (const s of [1, -1]) {
    grupo.add(tubo(pretoFosco, 0.026, CAB_B, [s * 0.075, 0.44, 0.42]))
    grupo.add(tubo(pretoFosco, 0.026, [s * 0.075, 0.44, 0.42], [s * 0.085, 0.26, 0.16]))
    grupo.add(tubo(pretoFosco, 0.026, [s * 0.085, 0.26, 0.16], [s * 0.085, 0.26, -0.24]))
    grupo.add(tubo(pretoFosco, 0.026, [s * 0.085, 0.26, -0.24], [s * 0.09, 0.60, -0.34]))
    grupo.add(tubo(pretoFosco, 0.022, [s * 0.09, 0.62, -0.32], [s * 0.10, 0.60, -0.70]))
  }
  // caixa de direcao: o tubo grosso onde o garfo articula
  grupo.add(tubo(pretoFosco, 0.052, [0, CAB[1] + 0.02, CAB[2] - 0.015],
    [CAB_B[0], CAB_B[1] - 0.02, CAB_B[2] + 0.015]))

  // =========================================================================
  // 3. MOTOR V-TWIN — dois cilindros aletados em V, carter e tampas cromadas
  // =========================================================================
  const Z_MOTOR = 0.06
  // O CARTER TEM QUE SER BAIXO. Na primeira versao ele tinha 30 cm de altura e
  // engolia a metade de baixo dos dois cilindros: o V-twin sumia dentro do
  // proprio bloco e o motor virava uma caixa cinza. Aqui ele para em 0.48 e os
  // cilindros comecam logo acima.
  const carter = roundedBox(0.28, 0.22, 0.36, 0.05, motorMat)
  carter.position.set(0, 0.37, Z_MOTOR - 0.02)
  grupo.add(carter)
  grupo.add(box(0.24, 0.07, 0.30, aluminio, 0, 0.255, Z_MOTOR - 0.02))   // carter de oleo
  // tampas laterais do carter: alternador de um lado, embreagem do outro
  for (const s of [1, -1]) {
    const t = cyl(0.085, 0.085, 0.030, aluminio, 18)
    t.rotation.z = Math.PI / 2
    t.position.set(s * 0.150, 0.37, Z_MOTOR - 0.05)
    grupo.add(t)
    const p = cyl(0.045, 0.045, 0.040, cromo, 14)
    p.rotation.z = Math.PI / 2
    p.position.set(s * 0.164, 0.37, Z_MOTOR - 0.05)
    grupo.add(p)
  }

  /**
   * Um cilindro do V: base, camisa aletada, cabecote e tampa de balancim.
   * `inc` e a inclinacao no plano ZY (positivo = deitado pra frente).
   */
  function cilindro(inc) {
    const c = new THREE.Group()
    c.position.set(0, 0.46, Z_MOTOR)
    c.rotation.x = inc
    // camisa: seis aletas de diametro decrescente. Aleta e disco fino e largo —
    // e a sombra entre elas que faz o motor parecer motor.
    for (let i = 0; i < 6; i++) {
      const y = 0.05 + i * 0.028
      const rr = 0.098 - i * 0.0035
      const a = cyl(rr, rr, 0.014, motorMat, 14)
      a.position.y = y
      c.add(a)
    }
    const corpo = cyl(0.068, 0.076, 0.20, motorMat, 14)
    corpo.position.y = 0.13
    c.add(corpo)
    // cabecote e tampa de balancim (a peca cromada la em cima)
    const cab = roundedBox(0.175, 0.075, 0.175, 0.03, motorMat)
    cab.position.y = 0.245
    c.add(cab)
    const tampa = roundedBox(0.145, 0.05, 0.145, 0.026, cromo)
    tampa.position.y = 0.292
    c.add(tampa)
    // tubo de vela + cachimbo, saindo pra fora
    const vela = cyl(0.014, 0.014, 0.07, cromoEscuro, 8)
    vela.rotation.z = Math.PI / 2 - 0.3
    vela.position.set(0.095, 0.25, 0.02)
    c.add(vela)
    return c
  }
  const cilFrente = cilindro(0.55)
  const cilTras = cilindro(-0.50)
  grupo.add(cilFrente)
  grupo.add(cilTras)

  // radiador entre os tubos do berco (a moto da foto e liquida)
  const radiador = box(0.24, 0.26, 0.045, pretoFosco, 0, 0.46, 0.44)
  grupo.add(radiador)
  for (let i = 0; i < 7; i++) {
    grupo.add(box(0.015, 0.24, 0.012, cromoEscuro, -0.10 + i * 0.033, 0.46, 0.466))
  }
  grupo.add(box(0.26, 0.028, 0.055, cromo, 0, 0.60, 0.44))
  grupo.add(box(0.26, 0.028, 0.055, cromo, 0, 0.33, 0.44))

  // caixa de ar / carburador no V, entre os dois cilindros
  const airbox = roundedBox(0.19, 0.14, 0.15, 0.04, pretoFosco)
  airbox.position.set(0, 0.63, Z_MOTOR - 0.13)
  grupo.add(airbox)
  for (const s of [1, -1]) {
    const t = cyl(0.052, 0.052, 0.05, cromo, 12)
    t.rotation.z = Math.PI / 2
    t.position.set(s * 0.115, 0.63, Z_MOTOR - 0.13)
    grupo.add(t)
  }

  // =========================================================================
  // 4. TANQUE GOTA — o perfil e o que da a silhueta da moto
  // =========================================================================
  const tanque = perfilCheio([
    [-0.02, 0.740],
    [0.02, 0.850, 0.14, 0.888],     // sobe do rabo pro topo
    [0.30, 0.895],
    [0.50, 0.885, 0.60, 0.815],      // desce no bico
    [0.635, 0.745],
    [0.50, 0.700, 0.24, 0.700],      // barriga do tanque
    [-0.04, 0.706],
  ], 0.30, pintura, 0.075)
  tanque.position.set(0, 0, 0)
  grupo.add(tanque)
  // console do tanque: a faixa cromada com a tampa e o relogio em cima
  grupo.add(box(0.115, 0.02, 0.40, cromo, 0, 0.925, 0.14))
  const bocal = cyl(0.055, 0.055, 0.028, cromo, 16)
  bocal.position.set(0, 0.932, 0.26)
  grupo.add(bocal)
  // friso cromado na lateral do tanque (o "risco" que a foto tem dos dois lados)
  for (const s of [1, -1]) {
    const f = box(0.012, 0.016, 0.38, cromoEscuro, s * 0.145, 0.828, 0.17)
    f.rotation.x = -0.06
    grupo.add(f)
  }

  // =========================================================================
  // 5. BANCO, RABETA, PARA-LAMA TRASEIRO
  // =========================================================================
  // Banco de custom: rebaixado no meio (onde o piloto senta) e subindo atras.
  const banco = perfilCheio([
    [0.12, 0.700],
    [-0.02, 0.700, -0.16, 0.664],     // a "cuia" onde o piloto senta
    [-0.36, 0.668],
    [-0.50, 0.672, -0.58, 0.752],     // sobe pro encosto da garupa
    [-0.645, 0.778],
    [-0.668, 0.742, -0.62, 0.706],    // quina traseira
    [-0.34, 0.646, -0.04, 0.636],     // barriga do banco
    [0.108, 0.652],
  ], 0.30, couro, 0.06)
  grupo.add(banco)
  // base do banco (a chapa que sustenta), so pra nao ver o chassi por baixo
  grupo.add(box(0.20, 0.06, 0.62, pretoFosco, 0, 0.635, -0.24))

  // para-lama traseiro fundo, com aba dos dois lados
  const plt = chapaArco(pintura, R_TRAS + 0.055, R_TRAS + 0.085, 0.62, 3.10, 0.26)
  plt.position.set(0, R_TRAS, Z_TRAS)
  grupo.add(plt)
  for (const s of [1, -1]) {
    const aba = chapaArco(pintura, R_TRAS + 0.030, R_TRAS + 0.085, 0.62, 3.10, 0.016)
    aba.position.set(s * 0.122, R_TRAS, Z_TRAS)
    grupo.add(aba)
  }
  // friso cromado correndo em cima do para-lama
  const friso = chapaArco(cromo, R_TRAS + 0.086, R_TRAS + 0.094, 1.05, 2.60, 0.05)
  friso.position.set(0, R_TRAS, Z_TRAS)
  grupo.add(friso)

  // lanterna: corpo cromado + lente vermelha, na ponta do para-lama
  const lanterna = roundedBox(0.13, 0.085, 0.09, 0.03, cromo)
  lanterna.position.set(0, R_TRAS + 0.14, Z_TRAS - 0.30)
  grupo.add(lanterna)
  grupo.add(box(0.105, 0.06, 0.03, luzFreio, 0, R_TRAS + 0.14, Z_TRAS - 0.345))
  // placa, inclinada como a da foto
  const placa = box(0.16, 0.11, 0.008, cromoEscuro, 0, R_TRAS + 0.02, Z_TRAS - 0.34)
  placa.rotation.x = 0.35
  grupo.add(placa)

  // =========================================================================
  // 6. BALANCA, AMORTECEDORES, ESCAPE, PEDALEIRAS
  // =========================================================================
  for (const s of [1, -1]) {
    // balanca: dois tubos do pivo do motor ate o eixo da roda
    grupo.add(tubo(pretoFosco, 0.030, [s * 0.095, 0.36, -0.20], [s * 0.105, R_TRAS, Z_TRAS]))
    // amortecedor: haste cromada + mola fingida com aneis (mais barato que uma
    // helice de verdade e, de longe, identico)
    const a = [s * 0.105, 0.66, -0.44], b = [s * 0.105, R_TRAS + 0.01, Z_TRAS + 0.03]
    grupo.add(tubo(cromoEscuro, 0.014, a, b, 8))
    for (let i = 0; i < 9; i++) {
      const k = 0.10 + (i / 8) * 0.72
      const anel = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.010, 5, 12), cromo)
      anel.position.set(
        a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)
      anel.rotation.x = Math.PI / 2 - 0.30
      anel.castShadow = true
      grupo.add(anel)
    }
    // capa cromada em cima da mola
    const capa = cyl(0.042, 0.042, 0.09, cromo, 12)
    capa.position.set(s * 0.105, 0.62, -0.42)
    capa.rotation.x = -0.30
    grupo.add(capa)
  }

  // ESCAPE: dois tubos cromados descendo dos cilindros e correndo pela direita
  // (quem olha pra +Z tem a direita em -X), com duas ponteiras alinhadas.
  const xEsc = -0.16
  grupo.add(tubo(cromo, 0.027, [-0.07, 0.72, 0.24], [-0.13, 0.44, 0.30], 10))
  grupo.add(tubo(cromo, 0.027, [-0.13, 0.44, 0.30], [xEsc, 0.30, 0.10], 10))
  grupo.add(tubo(cromo, 0.027, [-0.07, 0.62, -0.06], [-0.14, 0.40, -0.02], 10))
  grupo.add(tubo(cromo, 0.027, [-0.14, 0.40, -0.02], [xEsc - 0.045, 0.32, -0.14], 10))
  for (let i = 0; i < 2; i++) {
    const x = xEsc - i * 0.045
    const y = 0.30 - i * 0.02
    const pont = cyl(0.048, 0.038, 0.62, cromo, 16)
    pont.rotation.x = Math.PI / 2 + 0.05
    pont.position.set(x, y + 0.015, -0.36)
    grupo.add(pont)
    // corte diagonal da ponteira: um anel escuro no fim, pra ler como cano oco
    const fim = cyl(0.045, 0.045, 0.02, pretoFosco, 14)
    fim.rotation.x = Math.PI / 2 + 0.05
    fim.position.set(x, y - 0.001, -0.67)
    grupo.add(fim)
    // protetor de calor: uma casca perfurada por cima do cano
    const prot = chapaArco(cromoEscuro, 0.050, 0.056, 0.6, 2.5, 0.30)
    prot.rotation.y = -Math.PI / 2
    prot.position.set(x, y + 0.015, -0.30)
    grupo.add(prot)
  }

  // pedaleiras (avancadas, de custom) + pedal de freio e de cambio
  const pedais = []
  for (const s of [1, -1]) {
    const p = cyl(0.018, 0.018, 0.115, pretoFosco, 8)
    p.rotation.z = Math.PI / 2
    p.position.set(s * PEDAL[0], PEDAL[1], PEDAL[2])
    grupo.add(p)
    const sup = tubo(cromo, 0.013, [s * 0.10, PEDAL[1] + 0.02, PEDAL[2] - 0.04],
      [s * (PEDAL[0] - 0.05), PEDAL[1], PEDAL[2]], 8)
    grupo.add(sup)
    // alvo do pe do piloto: em cima da pedaleira, um pouco pra dentro
    const alvo = new THREE.Object3D()
    alvo.position.set(s * (PEDAL[0] - 0.035), PEDAL[1] + 0.035, PEDAL[2])
    alvo.userData.dynamic = true
    grupo.add(alvo)
    pedais.push(alvo)
  }
  // pedal de freio (direita = -X) e alavanca de cambio (esquerda = +X)
  grupo.add(tubo(cromo, 0.010, [-0.20, PEDAL[1], PEDAL[2] - 0.02],
    [-0.19, PEDAL[1] - 0.02, PEDAL[2] + 0.14], 6))
  grupo.add(box(0.03, 0.014, 0.06, cromo, -0.19, PEDAL[1] - 0.03, PEDAL[2] + 0.17))
  grupo.add(tubo(cromo, 0.010, [0.20, PEDAL[1] - 0.02, PEDAL[2] - 0.02],
    [0.19, PEDAL[1] - 0.04, PEDAL[2] + 0.15], 6))
  grupo.add(box(0.03, 0.014, 0.055, cromo, 0.19, PEDAL[1] - 0.05, PEDAL[2] + 0.18))

  // =========================================================================
  // 7. A FRENTE INTEIRA, NO EIXO DE DIRECAO INCLINADO
  // =========================================================================
  const pivoRake = new THREE.Group()
  pivoRake.position.set(CAB[0], CAB[1], CAB[2])
  pivoRake.rotation.x = -RAKE       // caimento: o eixo cai pra tras
  grupo.add(pivoRake)

  const pivoDir = new THREE.Group()  // ESTE e o que o sistema gira (rotation.y)
  pivoRake.add(pivoDir)

  /** Atalho: poe no pivo uma peca desenhada em coordenadas da moto. */
  function frente(mesh, p) {
    const q = noPivo(p)
    mesh.position.set(q[0], q[1], q[2])
    pivoDir.add(mesh)
    return mesh
  }
  /** Tubo desenhado em coordenadas da moto, ja convertido pro pivo. */
  function tuboFrente(mat, r, a, b, seg = 10) {
    const t = tubo(mat, r, noPivo(a), noPivo(b), seg)
    pivoDir.add(t)
    return t
  }

  // mesas (triple clamp): duas chapas grossas presas na caixa de direcao
  const mesaSup = box(0.235, 0.038, 0.10, cromoEscuro)
  mesaSup.rotation.x = -RAKE
  frente(mesaSup, [0, CAB[1] + 0.035, CAB[2] - 0.02])
  const mesaInf = box(0.225, 0.036, 0.095, cromoEscuro)
  mesaInf.rotation.x = -RAKE
  frente(mesaInf, [CAB_B[0], CAB_B[1] - 0.01, CAB_B[2] + 0.01])

  // GARFO: bengala cromada grossa em cima, tubo preto embaixo (o curso), e a
  // capa cromada por fora — e o conjunto que a foto mostra: garfo comprido,
  // todo cromado, com o guarda-po.
  const AXO = [0, R_DIAN, Z_DIAN]          // eixo dianteiro, no espaco da moto
  for (const s of [1, -1]) {
    // topo da bengala: sai da mesa de cima
    const topo = noPivo([s * 0.098, CAB[1] + 0.05, CAB[2] - 0.03])
    const meio = noPivo([s * 0.108, 0.62, 0.70])
    const pe = noPivo([s * 0.113, R_DIAN, Z_DIAN - 0.02])
    pivoDir.add(tubo(cromo, 0.026, topo, meio, 10))
    pivoDir.add(tubo(cromoEscuro, 0.033, meio, pe, 10))
    // capa/guarda-po no meio do curso
    const capa = cyl(0.040, 0.040, 0.16, cromo, 12)
    const qc = noPivo([s * 0.106, 0.70, 0.655])
    capa.position.set(qc[0], qc[1], qc[2])
    capa.rotation.x = 0.045   // o tubo do garfo e um tico mais em pe que o rake
    pivoDir.add(capa)
  }

  // para-lama dianteiro fundo, com abas — o da foto cobre meia roda
  const pld = chapaArco(pintura, R_DIAN + 0.045, R_DIAN + 0.072, 0.72, 2.75, 0.20)
  const uprightPld = emPeNoPivo(pld, AXO)
  pivoDir.add(uprightPld)
  for (const s of [1, -1]) {
    const aba = chapaArco(pintura, R_DIAN + 0.020, R_DIAN + 0.072, 0.85, 2.60, 0.014)
    aba.position.x = s * 0.093
    uprightPld.add(aba)
  }
  // suportes do para-lama no garfo
  for (const s of [1, -1]) {
    tuboFrente(cromo, 0.008, [s * 0.108, R_DIAN + 0.06, Z_DIAN - 0.02],
      [s * 0.085, R_DIAN + 0.09, Z_DIAN + 0.05], 6)
  }

  // farol redondo grande dentro de um copo cromado
  const copo = cyl(0.115, 0.088, 0.14, cromo, 20)
  copo.rotation.x = Math.PI / 2
  const casaFarol = emPeNoPivo(copo, [0, 0.885, 0.605])
  pivoDir.add(casaFarol)
  const lente = cyl(0.108, 0.108, 0.055, farolMat, 20)
  lente.rotation.x = Math.PI / 2
  lente.position.z = 0.085
  casaFarol.add(lente)
  const aroFarol = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.011, 6, 22), cromo)
  aroFarol.position.z = 0.088
  casaFarol.add(aroFarol)
  // orelhas: o que prende o farol nas bengalas
  for (const s of [1, -1]) {
    tuboFrente(cromoEscuro, 0.010, [s * 0.09, 0.90, 0.585], [s * 0.104, 0.86, 0.66], 6)
  }

  // piscas dianteiros, nas laterais do farol
  for (const s of [1, -1]) {
    tuboFrente(cromo, 0.009, [s * 0.10, 0.90, 0.60], [s * 0.185, 0.93, 0.585], 6)
    const pisca = sphere(0.032, ambar, 12)
    frente(pisca, [s * 0.20, 0.935, 0.58])
  }

  // GUIDAO: barra puxada pra tras (custom), punhos, manetes e retrovisores
  const gA = [0.055, Y_GUIDAO - 0.02, Z_PUNHO + 0.14]
  const gB = [X_PUNHO - 0.02, Y_GUIDAO, Z_PUNHO + 0.01]
  // riser: o suporte que levanta o guidao da mesa
  for (const s of [1, -1]) {
    const rz = cyl(0.019, 0.023, 0.10, cromo, 10)
    const q = noPivo([s * 0.055, CAB[1] + 0.09, CAB[2] - 0.035])
    rz.position.set(q[0], q[1], q[2])
    rz.rotation.x = -RAKE
    pivoDir.add(rz)
  }
  const maos = []
  for (const s of [1, -1]) {
    // do centro pra fora e pra tras, em dois trechos (o "puxado" do guidao)
    tuboFrente(cromo, 0.0165, [s * gA[0], gA[1], gA[2]], [s * gB[0], gB[1], gB[2]], 8)
    tuboFrente(cromo, 0.0165, [s * 0.02, Y_GUIDAO - 0.035, Z_PUNHO + 0.20],
      [s * gA[0], gA[1], gA[2]], 8)
    const punho = cyl(0.024, 0.024, 0.115, pretoFosco, 12)
    punho.rotation.z = Math.PI / 2
    punho.rotation.y = -s * 0.22
    frente(punho, [s * X_PUNHO, Y_GUIDAO + 0.004, Z_PUNHO - 0.025])
    // ponteira cromada na ponta do punho
    const pont = cyl(0.026, 0.020, 0.028, cromo, 12)
    pont.rotation.z = Math.PI / 2
    pont.rotation.y = -s * 0.22
    frente(pont, [s * (X_PUNHO + 0.068), Y_GUIDAO + 0.017, Z_PUNHO - 0.04])
    // manete: lamina fina a frente do punho
    const manete = box(0.105, 0.011, 0.026, cromo)
    manete.rotation.y = -s * 0.62
    frente(manete, [s * (X_PUNHO - 0.045), Y_GUIDAO + 0.006, Z_PUNHO + 0.055])
    // punho de comandos (o bloco preto com os botoes)
    const bloco = roundedBox(0.055, 0.05, 0.06, 0.018, pretoFosco)
    frente(bloco, [s * (X_PUNHO - 0.085), Y_GUIDAO, Z_PUNHO + 0.005])
    // retrovisor: haste alta e espelho grande, como o da foto
    tuboFrente(cromo, 0.010, [s * (X_PUNHO - 0.10), Y_GUIDAO + 0.02, Z_PUNHO],
      [s * (X_PUNHO - 0.03), Y_GUIDAO + 0.20, Z_PUNHO - 0.03], 6)
    const esp = roundedBox(0.115, 0.075, 0.014, 0.025, cromo)
    esp.rotation.y = -s * 0.34
    esp.rotation.x = 0.22
    frente(esp, [s * (X_PUNHO - 0.02), Y_GUIDAO + 0.225, Z_PUNHO - 0.035])

    // ALVO DA MAO: em cima do punho, ja dentro do pivo — quando o guidao
    // esterca, a mao do boneco vai junto.
    const alvo = new THREE.Object3D()
    const qa = noPivo([s * (X_PUNHO - 0.012), Y_GUIDAO + 0.022, Z_PUNHO - 0.02])
    alvo.position.set(qa[0], qa[1], qa[2])
    alvo.userData.dynamic = true
    pivoDir.add(alvo)
    maos.push(alvo)
  }
  // painel: dois relogios em cima da mesa
  for (const s of [1, -1]) {
    const rel = cyl(0.045, 0.045, 0.03, cromo, 14)
    rel.rotation.x = Math.PI / 2 - 0.5
    frente(rel, [s * 0.05, Y_GUIDAO - 0.055, Z_PUNHO + 0.16])
  }

  // disco de freio + pinca, e a roda dianteira (em pe dentro do pivo)
  const discoD = disco(R_DIAN, -0.075)
  pivoDir.add(emPeNoPivo(discoD, AXO))
  const pinca = roundedBox(0.05, 0.13, 0.085, 0.02, aluminio)
  pivoDir.add(emPeNoPivo(pinca, [-0.10, R_DIAN + 0.20, Z_DIAN + 0.03]))

  const rodaDian = fazerRoda(R_DIAN, W_DIAN, 12, false)
  const suporteRodaD = emPeNoPivo(rodaDian, AXO)
  // O grupo "em pe" e que sobrevive ao forno: ele CARREGA a rotacao que
  // desfaz o rake, e um no que o sistema gira em X nao pode ter rotacao
  // propria (escrever rotation.x apagaria a inclinacao guardada aqui).
  suporteRodaD.userData.dynamic = true
  pivoDir.add(suporteRodaD)
  rodas.push({ mesh: rodaDian, dianteira: true, raio: R_DIAN })

  // =========================================================================
  // 8. ASSENTO, ALVOS DO PILOTO E MATERIAIS EXPOSTOS
  // =========================================================================
  const assento = new THREE.Object3D()
  assento.position.set(0, BANCO_Y, -0.22)
  // nao e mesh: sem a marca o forno o varreria junto com os grupos vazios e o
  // piloto perderia o lugar onde senta
  assento.userData.dynamic = true
  grupo.add(assento)

  grupo.userData.luzesFreio = [luzFreio]
  grupo.userData.farois = [farolMat]
  grupo.userData.pivoDirecao = pivoDir      // quem esterca a frente inteira

  // Contrato da pose (veiculos.js): maos nos punhos, pes nas pedaleiras, tronco
  // inclinado pra frente. maos[0]/pes[0] sao do lado +X, que e a ESQUERDA de
  // quem olha pra +Z.
  grupo.userData.piloto = {
    maos: [maos[0], maos[1]],
    pes: [pedais[0], pedais[1]],
    tronco: 0.32,          // inclinacao do tronco (rad) pra frente
    corpoNaCurva: 0.35,    // o piloto joga o corpo pra dentro da curva
    quadril: -0.10,        // e o quadril gira um pouco pra tras, pra nao curvar
    cotovelo: 0.62,        // cotovelos abertos pra fora
    joelho: 0.62,          // joelhos abertos, abracando o tanque
  }

  // FORNO. Duas passadas, de dentro pra fora, porque a moto tem DOIS niveis de
  // coisa que se mexe:
  //   1) a frente inteira (guidao, garfo, farol, para-lama, alvos das maos)
  //      esterca junto no pivoDir — por dentro dela so a roda e os alvos se
  //      mexem, entao ela vira um punhado de meshes por material e depois e
  //      marcada pra sobreviver;
  //   2) o chassi, o motor, o tanque e o escape nunca se mexem: viram o corpo.
  bakeStatic(pivoDir)
  pivoDir.userData.dynamic = true
  bakeStatic(grupo)

  return { grupo, assento, rodas, config: 'moto' }
}
