import * as THREE from 'three'
import { solid, box, cyl, sphere, roundedBox } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// A MOTO — naked classica, ~2.1 m de ponta a ponta.
//
// Contrato (VEICULOS.md): construir() -> { grupo, assento, rodas, config }
//   grupo   origem NO CHAO, no centro da moto, frente para +Z
//   assento Object3D na altura do banco (o sistema poe o boneco em cima)
//   rodas   [{ mesh, dianteira, raio }]
//   config  'moto', a chave em MUNDO.DIRIGIR
//
// POR QUE UM GRUPO SO PRA FRENTE:
// numa moto o guidao, o garfo, o farol e a roda dianteira giram TODOS juntos —
// e isso e metade da leitura de "moto sendo pilotada". Entao existe um unico
// pivo (pivoFrente) no eixo de direcao e tudo que esterca e filho dele. Como a
// roda dianteira e neta desse pivo, o sistema pode estercar a roda (rotation.y)
// ou o pivo inteiro (grupo.userData.pivoDirecao): os dois funcionam.
//
// POR QUE O PNEU E UM TORUS E NAO UM CILINDRO:
// um cilindro tapa o miolo da roda e a moto fica com dois discos pretos no
// lugar das rodas. Com o torus o meio fica vazado e aparecem aro, raios e cubo,
// que e o que faz a roda de moto parecer roda de moto.
//
// Tudo que e tubo (chassi, garfo, escape, amortecedor) sai do mesmo helper
// tubo(): dois pontos no espaco e um raio. Da pra mexer numa medida sem
// recalcular angulo nenhum na mao.
// ---------------------------------------------------------------------------

// --- medidas ---------------------------------------------------------------
const R_TRAS = 0.30       // raio da roda traseira (mais gorda)
const R_DIAN = 0.31       // raio da roda dianteira
const W_TRAS = 0.16
const W_DIAN = 0.11
const Z_TRAS = -0.68      // eixo traseiro
const Z_DIAN = 0.74       // eixo dianteiro  (entre-eixos 1.42 m)
const Z_COLUNA = 0.50     // onde o eixo de direcao corta o chao
const Y_CAB = 1.00        // altura do guidao
const BANCO_Y = 0.82      // topo do banco

const _EIXO_Y = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()

/** Cilindro entre dois pontos [x,y,z]: chassi, garfo, escape, amortecedor. */
function tubo(mat, r, a, b, seg = 10) {
  _dir.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const comp = _dir.length()
  const m = cyl(r, r, comp, mat, seg)
  m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
  m.quaternion.setFromUnitVectors(_EIXO_Y, _dir.normalize())
  return m
}

/**
 * Para-lama: um pedaco de rosca por cima do pneu.
 * ini/fim sao angulos medidos do eixo da roda (0 = pra frente, PI/2 = pra cima).
 */
function paraLama(mat, raioRoda, folga, esp, ini, fim) {
  const g = new THREE.Mesh(
    new THREE.TorusGeometry(raioRoda + folga, esp, 6, 18, fim - ini), mat)
  g.rotation.z = ini
  // o torus nasce no plano XY; girar -90 em Y poe o arco no plano ZY da moto
  const p = new THREE.Group()
  p.rotation.y = -Math.PI / 2
  p.add(g)
  g.castShadow = true; g.receiveShadow = true
  return p
}

export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'moto'

  // --- materiais ------------------------------------------------------------
  const pintura = solid(0x9e2226, 0.24, 0.24)     // vermelho escuro brilhante
  const cromo = solid(0xc3cad1, 0.22, 0.34)
  const cromoEscuro = solid(0x8d949b, 0.34, 0.4)
  const pretoFosco = solid(0x141418, 0.88, 0.0)
  const motorMat = solid(0x767b81, 0.44, 0.5)     // aluminio do motor
  const pneuMat = solid(0x18181d, 0.95, 0.0)
  const couro = solid(0x1b1418, 0.62, 0.0)

  // Instancia nova (nao o cache de solid()): o sistema acende o freio mexendo
  // no emissiveIntensity, e um material cacheado acenderia a moto de todo mundo.
  const luzFreio = new THREE.MeshStandardMaterial({
    color: 0x6b0e0e, emissive: 0xff1d1d, emissiveIntensity: 0.55, roughness: 0.3,
  })
  const farolMat = new THREE.MeshStandardMaterial({
    color: 0xf4f2e6, emissive: 0xffe9b0, emissiveIntensity: 0.35, roughness: 0.14,
  })

  // =========================================================================
  // 1. RODAS — pneu vazado, aro, raios finos e cubo
  // =========================================================================
  function fazerRoda(raio, larg, nBarras) {
    const r = new THREE.Group()
    // YXZ: o esterco (Y) tem que entrar ANTES do giro (X), senao a roda
    // estercaria em torno de um eixo que ja rodou junto com ela.
    r.rotation.order = 'YXZ'

    const tuboR = raio * 0.22
    const pneu = new THREE.Mesh(
      new THREE.TorusGeometry(raio - tuboR, tuboR, 8, 26), pneuMat)
    pneu.rotation.y = Math.PI / 2            // eixo do torus vira o eixo X
    pneu.scale.z = larg / (tuboR * 2)        // achata o pneu ate a largura pedida
    pneu.castShadow = true; pneu.receiveShadow = true
    r.add(pneu)

    const rAro = raio * 0.58
    const aro = new THREE.Mesh(new THREE.TorusGeometry(rAro, 0.022, 6, 22), cromo)
    aro.rotation.y = Math.PI / 2
    aro.castShadow = true
    r.add(aro)

    // raios: barras de diametro inteiro, que e como a roda raiada se le de
    // longe — n barras cruzando no cubo valem 2n raios e custam metade.
    const geoBarra = new THREE.BoxGeometry(0.011, rAro * 2, 0.011)
    for (let i = 0; i < nBarras; i++) {
      const b = new THREE.Mesh(geoBarra, cromo)
      b.rotation.x = (i / nBarras) * Math.PI
      b.position.x = (i % 2 ? 1 : -1) * larg * 0.14   // laceado: alterna de lado
      b.castShadow = true
      r.add(b)
    }
    const cubo = cyl(0.05, 0.05, larg * 0.95, cromo, 12)
    cubo.rotation.z = Math.PI / 2
    r.add(cubo)
    const disco = cyl(raio * 0.34, raio * 0.34, 0.012, cromoEscuro, 16)
    disco.rotation.z = Math.PI / 2
    disco.position.x = larg * 0.55
    r.add(disco)
    // A roda gira e esterca, mas por DENTRO ela e rigida: pneu, aro, raios,
    // cubo e disco andam sempre juntos. O forno funde as nove pecas em quatro
    // (uma por material) e o no `r` continua sendo quem recebe rotation.x/.y.
    bakeStatic(r)
    // sem esta marca o forno da moto engoliria a roda dentro do chassi
    r.userData.dynamic = true
    return r
  }

  const rodas = []
  const rodaTras = fazerRoda(R_TRAS, W_TRAS, 5)
  const pivoTras = new THREE.Group()
  pivoTras.position.set(0, R_TRAS, Z_TRAS)
  pivoTras.add(rodaTras)
  grupo.add(pivoTras)
  rodas.push({ mesh: rodaTras, dianteira: false, raio: R_TRAS })

  // =========================================================================
  // 2. CHASSI, MOTOR, TANQUE, BANCO — a parte que nao esterca
  // =========================================================================
  const CABECA = [0, 0.94, Z_COLUNA - 0.02]    // topo da coluna de direcao
  const CABECA_B = [0, 0.78, Z_COLUNA + 0.01]  // base da coluna

  // espinha: da coluna ate debaixo do banco; e nela que tanque e banco sentam
  grupo.add(tubo(pretoFosco, 0.032, CABECA, [0, 0.70, -0.24]))
  // berco: desce na frente do motor, passa por baixo e sobe pro rabo
  grupo.add(tubo(pretoFosco, 0.028, CABECA_B, [0, 0.42, 0.30]))
  grupo.add(tubo(pretoFosco, 0.028, [0, 0.42, 0.30], [0, 0.34, -0.04]))
  grupo.add(tubo(pretoFosco, 0.028, [0, 0.34, -0.04], [0, 0.64, -0.26]))
  for (const s of [1, -1]) {
    grupo.add(tubo(pretoFosco, 0.022, [s * 0.09, 0.70, -0.26], [s * 0.09, 0.62, -0.66]))
  }

  // --- motor no meio: bloco com aletas + dois cilindros em V ---------------
  const bloco = roundedBox(0.28, 0.28, 0.30, 0.05, motorMat)
  bloco.position.set(0, 0.44, 0.06)
  grupo.add(bloco)
  const geoAleta = new THREE.BoxGeometry(0.31, 0.015, 0.27)
  for (let i = 0; i < 5; i++) {
    const a = new THREE.Mesh(geoAleta, motorMat)
    a.position.set(0, 0.35 + i * 0.05, 0.06)
    a.castShadow = true; a.receiveShadow = true
    grupo.add(a)
  }
  for (const inc of [0.40, -0.40]) {
    const cil = roundedBox(0.24, 0.22, 0.18, 0.05, motorMat)
    cil.position.set(0, 0.63, 0.06 + inc * 0.28)
    cil.rotation.x = inc
    grupo.add(cil)
  }
  // carter e tampa da embreagem, pra base do motor nao ficar um corte seco
  grupo.add(box(0.30, 0.10, 0.30, motorMat, 0, 0.30, 0.05))
  for (const s of [1, -1]) {
    const t = cyl(0.10, 0.10, 0.04, motorMat, 16)
    t.rotation.z = Math.PI / 2
    t.position.set(s * 0.16, 0.36, 0.03)
    grupo.add(t)
  }

  // --- tanque: elipsoide, nao caixa. E a peca que da a silhueta -------------
  const tanque = sphere(1, pintura, 20)
  tanque.scale.set(0.19, 0.155, 0.34)
  tanque.position.set(0, 0.80, 0.22)
  grupo.add(tanque)
  const tanqueTras = sphere(1, pintura, 16)       // afina em direcao ao banco
  tanqueTras.scale.set(0.13, 0.115, 0.16)
  tanqueTras.position.set(0, 0.775, -0.06)
  grupo.add(tanqueTras)
  const bocal = cyl(0.05, 0.05, 0.03, cromo, 14)
  bocal.position.set(0, 0.955, 0.30)
  grupo.add(bocal)

  // --- banco e rabeta -------------------------------------------------------
  const banco = roundedBox(0.26, 0.10, 0.52, 0.045, couro)
  banco.position.set(0, BANCO_Y - 0.05, -0.34)
  grupo.add(banco)
  grupo.add(box(0.19, 0.12, 0.46, pretoFosco, 0, 0.70, -0.34))
  const rabo = roundedBox(0.22, 0.14, 0.22, 0.06, pintura)
  rabo.position.set(0, BANCO_Y - 0.01, -0.68)
  grupo.add(rabo)
  grupo.add(box(0.14, 0.08, 0.04, luzFreio, 0, BANCO_Y - 0.02, -0.80))

  // para-lama traseiro: comeca um pouco antes do topo e morre atras do pneu
  const plt = paraLama(pintura, R_TRAS, 0.075, 0.04, 1.20, 3.02)
  plt.position.set(0, R_TRAS, Z_TRAS)
  grupo.add(plt)

  // --- balanca e amortecedor traseiro --------------------------------------
  for (const s of [1, -1]) {
    grupo.add(tubo(pretoFosco, 0.032, [s * 0.09, 0.40, -0.06], [s * 0.105, R_TRAS, Z_TRAS]))
    // amortecedor: haste + mola fingida com aneis (mais barato que uma helice)
    const a = [s * 0.11, 0.70, -0.30], b = [s * 0.105, R_TRAS + 0.02, -0.60]
    grupo.add(tubo(cromo, 0.018, a, b, 8))
    for (let i = 0; i < 7; i++) {
      const k = 0.12 + (i / 6) * 0.76
      const anel = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 5, 10), cromo)
      anel.position.set(
        a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k)
      anel.rotation.x = Math.PI / 2 - 0.55
      anel.castShadow = true
      grupo.add(anel)
    }
  }

  // --- escapamento: sai do cilindro da frente e passa rente pela direita ----
  grupo.add(tubo(cromo, 0.026, [0.08, 0.60, 0.22], [0.13, 0.34, 0.14], 10))
  grupo.add(tubo(cromo, 0.026, [0.13, 0.34, 0.14], [0.17, 0.30, -0.14], 10))
  const ponteira = cyl(0.052, 0.04, 0.46, cromo, 14)
  ponteira.rotation.x = Math.PI / 2 + 0.04
  ponteira.position.set(0.185, 0.32, -0.40)
  grupo.add(ponteira)
  grupo.add(box(0.085, 0.085, 0.03, pretoFosco, 0.19, 0.33, -0.625))

  // pedaleiras
  for (const s of [1, -1]) {
    const p = cyl(0.016, 0.016, 0.11, pretoFosco, 8)
    p.rotation.z = Math.PI / 2
    p.position.set(s * 0.20, 0.30, -0.06)
    grupo.add(p)
  }

  // =========================================================================
  // 3. A FRENTE INTEIRA NUM PIVO — guidao, garfo, farol e roda dianteira
  // =========================================================================
  const pivoFrente = new THREE.Group()
  pivoFrente.position.set(0, 0, Z_COLUNA)
  grupo.add(pivoFrente)
  const zd = Z_DIAN - Z_COLUNA    // eixo dianteiro no espaco do pivo

  // coluna de direcao + as duas mesas que seguram o garfo
  pivoFrente.add(tubo(pretoFosco, 0.038, [0, 0.76, 0.02], [0, 0.98, -0.05]))
  pivoFrente.add(box(0.26, 0.04, 0.11, cromoEscuro, 0, 0.97, -0.045))
  pivoFrente.add(box(0.25, 0.036, 0.10, cromoEscuro, 0, 0.79, 0.015))

  // garfo: bengala cromada em cima, tubo escuro embaixo (o curso da suspensao)
  for (const s of [1, -1]) {
    pivoFrente.add(tubo(cromo, 0.024, [s * 0.095, 0.98, -0.05], [s * 0.105, 0.58, zd - 0.03], 8))
    pivoFrente.add(tubo(pretoFosco, 0.032, [s * 0.104, 0.62, zd - 0.04], [s * 0.11, R_DIAN, zd], 8))
  }

  // para-lama dianteiro, colado no garfo (so a capa de cima)
  const pld = paraLama(pintura, R_DIAN, 0.065, 0.035, 1.05, 2.55)
  pld.position.set(0, R_DIAN, zd)
  pivoFrente.add(pld)

  // farol redondo dentro de um copo cromado
  const copo = cyl(0.105, 0.085, 0.13, cromo, 18)
  copo.rotation.x = Math.PI / 2
  copo.position.set(0, 0.85, 0.15)
  pivoFrente.add(copo)
  // a lente sobra pra fora do copo: encaixada rente da pra ver o fundo do copo
  const lente = cyl(0.098, 0.098, 0.05, farolMat, 18)
  lente.rotation.x = Math.PI / 2
  lente.position.set(0, 0.85, 0.225)
  pivoFrente.add(lente)
  // orelhas: e o que prende o farol nas bengalas do garfo
  for (const s of [1, -1]) {
    pivoFrente.add(tubo(cromoEscuro, 0.011, [s * 0.085, 0.86, 0.13], [s * 0.10, 0.90, 0.02], 6))
  }

  // guidao: barra unica com punhos, manetes e retrovisores
  const barra = cyl(0.016, 0.016, 0.62, cromo, 10)
  barra.rotation.z = Math.PI / 2
  barra.position.set(0, Y_CAB, -0.07)
  pivoFrente.add(barra)
  for (const s of [1, -1]) {
    // as pontas do guidao sobem e recuam um pouco
    pivoFrente.add(tubo(cromo, 0.016, [s * 0.30, Y_CAB, -0.07], [s * 0.36, Y_CAB + 0.04, -0.11], 8))
    const punho = cyl(0.024, 0.024, 0.12, pretoFosco, 10)
    punho.rotation.z = Math.PI / 2
    punho.rotation.y = -s * 0.14
    punho.position.set(s * 0.42, Y_CAB + 0.045, -0.12)
    pivoFrente.add(punho)
    // manete: uma lamina fina na frente do punho
    const manete = box(0.10, 0.012, 0.03, cromo, s * 0.38, Y_CAB + 0.04, -0.05)
    manete.rotation.y = -s * 0.55
    pivoFrente.add(manete)
    // retrovisor: haste curta e espelho pequeno virado pra tras
    pivoFrente.add(tubo(cromoEscuro, 0.011, [s * 0.26, Y_CAB + 0.02, -0.08], [s * 0.30, Y_CAB + 0.17, -0.10], 6))
    const esp = cyl(0.042, 0.042, 0.016, cromo, 14)
    esp.rotation.x = Math.PI / 2 - 0.3
    esp.rotation.y = -s * 0.3
    esp.scale.x = 1.3
    esp.position.set(s * 0.305, Y_CAB + 0.185, -0.10)
    pivoFrente.add(esp)
  }
  // painelzinho entre o guidao e o tanque
  const relogio = cyl(0.05, 0.05, 0.03, pretoFosco, 14)
  relogio.rotation.x = Math.PI / 2 - 0.55
  relogio.position.set(0, Y_CAB - 0.03, -0.01)
  pivoFrente.add(relogio)

  // roda dianteira, filha do pivo: esterca junto com o guidao
  const rodaDian = fazerRoda(R_DIAN, W_DIAN, 5)
  const pivoRodaD = new THREE.Group()
  pivoRodaD.position.set(0, R_DIAN, zd)
  pivoRodaD.add(rodaDian)
  pivoFrente.add(pivoRodaD)
  rodas.push({ mesh: rodaDian, dianteira: true, raio: R_DIAN })

  // =========================================================================
  // 4. ASSENTO e materiais expostos
  // =========================================================================
  const assento = new THREE.Object3D()
  assento.position.set(0, BANCO_Y, -0.30)
  // nao e mesh: sem a marca o forno o varreria junto com os grupos vazios e o
  // piloto perderia o lugar onde senta
  assento.userData.dynamic = true
  grupo.add(assento)

  grupo.userData.luzesFreio = [luzFreio]
  grupo.userData.farois = [farolMat]
  grupo.userData.pivoDirecao = pivoFrente   // quem quiser estercar a frente inteira

  // FORNO. Duas passadas, de dentro pra fora, porque a moto tem DOIS niveis de
  // coisa que se mexe:
  //   1) a frente inteira (guidao, garfo, farol, para-lama) esterca junto no
  //      pivoFrente — por dentro dela nada se mexe, entao ela vira um punhado
  //      de meshes por material e depois e marcada pra sobreviver;
  //   2) o chassi, o motor, o tanque e o escape nunca se mexem: viram o corpo.
  // As rodas ja sairam do forno marcadas la em fazerRoda(), e a roda dianteira
  // e neta do pivoFrente — o forno preserva a subarvore dinamica inteira,
  // entao ela continua pendurada la e continua estercando junto.
  bakeStatic(pivoFrente)
  pivoFrente.userData.dynamic = true
  bakeStatic(grupo)

  return { grupo, assento, rodas, config: 'moto' }
}
