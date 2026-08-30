import * as THREE from 'three'
import { solid, stdMat, tex, box, cyl, roundedBox } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// A CAMINHONETE — pickup de cabine simples, uns quarenta anos de estrada.
//
// Contrato (VEICULOS.md): construir() -> { grupo, assento, rodas, config }
//   grupo   origem NO CHAO, no centro do veiculo, frente para +Z
//   assento Object3D onde o personagem senta (ponto do QUADRIL)
//   rodas   [{ mesh, dianteira, raio }]
//   config  'caminhonete', a chave em MUNDO.DIRIGIR
//
// O PEDIDO FOI "um pouco velha mas bem feita". As duas metades dessa frase
// puxam pra lados opostos e foi isso que guiou o modelo:
//
//   VELHA e a PINTURA, nao a FORMA. Carro velho mal feito e caixa torta com
//   textura suja. Aqui a forma e certinha — para-lama com arco, capo com
//   nervura, cabine com pilar, cacamba com friso — e quem conta a idade e o
//   acabamento: azul desbotado por cima (o sol come o teto e o capo primeiro),
//   ferrugem subindo das saias e do vinco da cacamba, cromado opaco em vez de
//   espelhado, um farol com o refletor mais amarelado que o outro.
//
//   BEM FEITA e o que ela CARREGA. Uma pickup e o unico veiculo do jogo com
//   uma superficie horizontal grande e vazia atras, e cacamba vazia le como
//   modelo inacabado. Entao ela vem com estepe deitado, caixa de ferramentas
//   de chapa e assoalho CORRUGADO — a nervura longitudinal do assoalho e o
//   detalhe que mais faz gente dizer "isso e uma caminhonete".
//
// POR QUE roundedBox NAS MASSAS: a lataria de pickup e chapa dobrada, com
// quina viva mas nunca infinitamente viva. `roundedBox` da o filete de 3-4 cm
// que pega a luz na quina — e e esse fio de luz que separa "chapa" de "caixa
// de papelao". O carro (carro.js) resolve isso extrudando um perfil, que e a
// tecnica certa pra um cupe de linha continua; aqui a linha e reta de
// proposito, e o custo de uma ExtrudeGeometry por peca nao se pagaria.
//
// CUSTO: tudo passa pelo forno (bakeStatic) — a carroceria primeiro, depois o
// grupo, como no carro. As rodas sao assadas UMA A UMA antes de entrar, senao
// o forno da carroceria fundiria elas na lataria e nenhuma giraria mais.
// ---------------------------------------------------------------------------

// --- as medidas, num lugar so ----------------------------------------------
const LARG = 1.96         // largura da lataria na cintura
const RODA_R = 0.42       // pneu alto: e o que diferencia a silhueta do carro
const RODA_W = 0.33
const RODA_X = 0.86
const EIXO_F = 1.52
const EIXO_T = -1.50      // entre-eixos 3.02
const ARCO_R = 0.56       // recorte do para-lama
const CHASSI = 0.62       // piso da lataria (a linha da soleira)
const CAPO = 1.14         // topo do capo
const CINTA = 1.30        // onde a lataria acaba e o vidro comeca
const TETO = 1.96
const CACAMBA = 1.22      // topo da parede da cacamba
const NARIZ = 2.56
const CAUDA = -2.52       // 5,08 m de ponta a ponta
const CAB_Z0 = -0.42      // parede traseira da cabine
const CAB_Z1 = 1.02       // para-brisa
const ASSENTO_X = 0.40    // volante a ESQUERDA (quem olha pra +Z tem a esquerda em +X)

// ---------------------------------------------------------------------------
// TEXTURAS — o envelhecimento mora aqui, nao na geometria
// ---------------------------------------------------------------------------

/**
 * Pintura de carro velho: a cor de fabrica, manchas de desbotado por cima e
 * riscos finos. `desgaste` de 0 a 1 controla quanto o sol ja comeu.
 */
function pinturaTex(base, claro, desgaste) {
  return tex('pickup-pint:' + base + ':' + claro + ':' + desgaste, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    // manchas de desbotado: nuvens claras e irregulares
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const r = 12 + Math.random() * 55
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, claro)
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.globalAlpha = 0.10 + Math.random() * 0.30 * desgaste
      g.fillStyle = gr
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    g.globalAlpha = 1
    // riscos: sempre horizontais, que e o sentido em que o carro esbarra nas
    // coisas e em que a flanela do posto passa
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * s
      g.strokeStyle = 'rgba(255,255,255,' + (Math.random() * 0.13 * desgaste) + ')'
      g.lineWidth = 0.6 + Math.random()
      g.beginPath()
      g.moveTo(Math.random() * s, y)
      g.lineTo(Math.random() * s, y + (Math.random() - 0.5) * 3)
      g.stroke()
    }
    // poeira acumulada, mais forte embaixo
    const gd = g.createLinearGradient(0, s, 0, 0)
    gd.addColorStop(0, 'rgba(96,84,64,' + (0.28 * desgaste) + ')')
    gd.addColorStop(0.45, 'rgba(96,84,64,0)')
    g.fillStyle = gd; g.fillRect(0, 0, s, s)
  }, 1)
}

/** Chapa comida de ferrugem, pra saia e vinco de cacamba. */
function ferrugemTex() {
  return tex('pickup-ferrugem', 128, (g, s) => {
    g.fillStyle = '#5d3c28'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const r = 2 + Math.random() * 13
      g.fillStyle = ['#4a2d1c', '#6e4a30', '#3d2414', '#7a563a'][(Math.random() * 4) | 0]
      g.globalAlpha = 0.35 + Math.random() * 0.5
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    g.globalAlpha = 1
    // furos: pontos quase pretos, o estagio final
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(30,18,10,0.75)'
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 0, 7); g.fill()
    }
  }, 1)
}

/** Assoalho de cacamba: nervura longitudinal, o detalhe que diz "pickup". */
function assoalhoTex() {
  return tex('pickup-assoalho', 128, (g, s) => {
    g.fillStyle = '#4a4a4e'; g.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 16) {
      g.fillStyle = 'rgba(120,120,126,0.55)'; g.fillRect(x, 0, 5, s)
      g.fillStyle = 'rgba(24,24,28,0.6)'; g.fillRect(x + 5, 0, 3, s)
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.3) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2)
    }
    // arranhoes de carga arrastada
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = 'rgba(150,140,120,' + (0.1 + Math.random() * 0.25) + ')'
      g.lineWidth = 0.8
      const x = Math.random() * s
      g.beginPath(); g.moveTo(x, Math.random() * s); g.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * s); g.stroke()
    }
  }, 1)
}

const _tiled = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx + ':' + ry
  let t = _tiled.get(k)
  if (t) return t
  t = base.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  _tiled.set(k, t)
  return t
}

export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'caminhonete'

  // A carroceria e um grupo SEPARADO das rodas: e nela que o sistema aplica
  // mergulho, rolagem e suspensao, e por isso as rodas ficam plantadas no chao
  // em vez de subirem junto com o corpo (ver VEICULOS.md).
  const carroceria = new THREE.Group()
  carroceria.name = 'caminhonete-carroceria'
  grupo.add(carroceria)

  // --- materiais ------------------------------------------------------------
  // Duas pinturas da MESMA cor: a de cima levou mais sol. Duas, e nao um
  // gradiente, porque a divisa cai exatamente na linha de cintura — que e
  // onde ela cai num carro de verdade.
  const pintura = stdMat('pickup-azul', {
    map: tiled(pinturaTex('#2f5f78', 'rgba(190,214,224,1)', 0.55), 2, 1),
    color: 0xbcd0d8, roughness: 0.62, metalness: 0.22,
  })
  const pinturaSol = stdMat('pickup-azul-sol', {
    map: tiled(pinturaTex('#3f7186', 'rgba(214,232,238,1)', 0.9), 2, 1),
    color: 0xc8dae0, roughness: 0.74, metalness: 0.14,
  })
  const ferrugem = stdMat('pickup-fer', { map: tiled(ferrugemTex(), 3, 1), roughness: 0.95, metalness: 0.05 })
  const assoalho = stdMat('pickup-cacamba', { map: tiled(assoalhoTex(), 1, 2), roughness: 0.8, metalness: 0.3 })
  // Cromo OPACO: 0.30 de rugosidade em vez dos 0.15 do carro novo. Cromado de
  // caminhonete velha e fosco de tanto ser lixado pela poeira.
  const cromo = solid(0xc2c8cc, 0.30, 0.85)
  const cromoSujo = solid(0x9aa0a4, 0.48, 0.7)
  const preto = solid(0x24262a, 0.75, 0.15)
  const borracha = solid(0x1a1c1f, 0.95, 0.02)
  const plastico = solid(0x33373c, 0.85, 0.05)
  const vidro = stdMat('pickup-vidro', {
    color: 0xa9c6d2, transparent: true, opacity: 0.42, roughness: 0.12,
    metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  })
  const estofado = stdMat('pickup-banco', {
    map: tiled(pinturaTex('#6a5238', 'rgba(160,140,110,1)', 0.8), 2, 2),
    color: 0xbaa88c, roughness: 0.95,
  })
  // Instancias PROPRIAS (nunca do cache): estes materiais acendem, e mexer no
  // material cacheado acenderia o farol de todo carro do mapa.
  const farolMat = stdMat('pickup-farol', {
    color: 0xfff4d8, emissive: 0xffe6a8, emissiveIntensity: 0.35, roughness: 0.2,
  }).clone()
  const farolMat2 = farolMat.clone()
  farolMat2.color = new THREE.Color(0xf2e2b8)     // o outro ja amarelou
  const luzFreio = stdMat('pickup-freio', {
    color: 0xd4402f, emissive: 0xc02418, emissiveIntensity: 0.35, roughness: 0.35,
  }).clone()
  const luzFreio2 = luzFreio.clone()

  const add = (m) => { carroceria.add(m); return m }

  // =========================================================================
  // 1. CHASSI E SAIAS
  // =========================================================================
  // Duas longarinas visiveis por baixo. Uma pickup e alta, e sem elas da pra
  // ver o vazio embaixo dela de qualquer angulo de camera.
  for (const s of [-1, 1]) {
    add(box(0.13, 0.17, 4.5, preto, s * 0.62, 0.36, 0.02))
  }
  add(box(1.36, 0.11, 0.16, preto, 0, 0.36, EIXO_F - 0.1))     // travessa
  add(box(1.36, 0.11, 0.16, preto, 0, 0.36, EIXO_T + 0.1))

  /**
   * Cilindro deitado. ATENCAO: e position/rotation, NUNCA
   * `cyl(...).rotateZ(a).translateY(h)`.
   *
   * `translateY` do three anda no eixo Y LOCAL, que depois do rotateZ ja nao
   * aponta mais pra cima — um eixo traseiro escrito assim nasce deitado no
   * lugar certo e depois se muda 42 cm pro lado de fora da caminhonete. O
   * encadeamento so e seguro em objeto SEM rotacao (a e position.set com
   * outro nome).
   */
  function deitado(rTop, rBot, comp, mat, seg, eixo, x, y, z) {
    const m = cyl(rTop, rBot, comp, mat, seg)
    if (eixo === 'x') m.rotation.z = Math.PI / 2
    else m.rotation.x = Math.PI / 2
    m.position.set(x, y, z)
    return m
  }

  // eixo traseiro rigido, com o diferencial no meio (pickup nao esconde isso)
  add(deitado(0.055, 0.055, 1.62, preto, 10, 'x', 0, RODA_R, EIXO_T))
  const dif = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), preto)
  dif.position.set(0, RODA_R, EIXO_T)
  dif.scale.z = 0.75
  add(dif)
  // cardan indo pro cambio
  add(deitado(0.045, 0.045, 2.1, cromoSujo, 8, 'z', 0, RODA_R + 0.02, 0.1))

  // Saia de ferrugem por baixo das portas: e onde a lama bate a vida inteira,
  // e por isso o primeiro lugar a furar.
  //
  // ELA E BAIXA E CURTA DE PROPOSITO. A primeira versao era uma faixa de 3,3 m
  // correndo a meia altura da lateral, e de longe lia como se a caminhonete
  // fosse laranja com uma listra azul. Ferrugem tem que estar onde ninguem
  // olha primeiro: 9 cm de altura, colada na soleira, e so no trecho da porta.
  for (const s of [-1, 1]) {
    add(box(0.05, 0.09, 1.5, ferrugem, s * (LARG / 2 - 0.02), CHASSI - 0.12, (CAB_Z0 + CAB_Z1) / 2))
  }

  // =========================================================================
  // 2. CABINE
  // =========================================================================
  const cabZ = (CAB_Z0 + CAB_Z1) / 2
  const cabD = CAB_Z1 - CAB_Z0

  // corpo da cabine ate a cintura (chapa)
  const cabBaixo = roundedBox(LARG, CINTA - CHASSI + 0.1, cabD, 0.05, pintura)
  cabBaixo.position.set(0, (CHASSI + CINTA) / 2, cabZ)
  add(cabBaixo)

  // a "estufa": pilares + teto. O vidro entra depois, por dentro.
  const PIL = 0.10
  const topo = roundedBox(LARG - 0.10, 0.10, cabD - 0.06, 0.035, pinturaSol)
  topo.position.set(0, TETO - 0.05, cabZ)
  add(topo)
  // pilar A (inclinado, acompanha o para-brisa), B (reto, atras da porta)
  for (const s of [-1, 1]) {
    const a = box(PIL, CINTA + 0.1, PIL, pinturaSol, s * (LARG / 2 - PIL / 2 - 0.02), 0, 0)
    a.position.set(s * (LARG / 2 - PIL / 2 - 0.02), (CINTA + TETO) / 2, CAB_Z1 - 0.13)
    a.rotation.x = -0.30
    a.scale.y = (TETO - CINTA) / (CINTA + 0.1) * 1.16
    add(a)
    add(box(PIL, TETO - CINTA, PIL, pinturaSol, s * (LARG / 2 - PIL / 2 - 0.02), (CINTA + TETO) / 2, CAB_Z0 + 0.06))
  }
  // parede traseira da cabine, cheia (pickup de cabine simples nao tem vigia
  // grande; esta tem um vidrinho no meio)
  add(box(LARG - 0.14, TETO - CINTA, 0.07, pinturaSol, 0, (CINTA + TETO) / 2, CAB_Z0 + 0.04))
  add(box(0.72, 0.34, 0.03, vidro, 0, CINTA + 0.44, CAB_Z0 + 0.01))
  add(box(0.80, 0.05, 0.05, cromoSujo, 0, CINTA + 0.63, CAB_Z0 + 0.005))

  // para-brisa e vidros laterais
  const pb = box(LARG - 0.22, 0.82, 0.03, vidro, 0, CINTA + 0.36, CAB_Z1 - 0.06)
  pb.rotation.x = -0.30
  add(pb)
  for (const s of [-1, 1]) {
    add(box(0.03, TETO - CINTA - 0.16, cabD - 0.30, vidro, s * (LARG / 2 - 0.04), (CINTA + TETO) / 2 - 0.02, cabZ + 0.02))
  }
  // borracha do para-brisa: o fio preto que emoldura o vidro
  const bor = box(LARG - 0.16, 0.90, 0.05, borracha, 0, CINTA + 0.35, CAB_Z1 - 0.09)
  bor.rotation.x = -0.30
  add(bor)

  // --- portas: vinco, macaneta, fechadura, espelho -------------------------
  for (const s of [-1, 1]) {
    const x = s * (LARG / 2 + 0.005)
    // vinco horizontal no meio da porta (a nervura da chapa)
    add(box(0.03, 0.06, cabD - 0.22, pinturaSol, x, CHASSI + 0.42, cabZ))
    // recorte da porta: dois frisos verticais marcando onde ela abre
    add(box(0.03, CINTA - CHASSI - 0.02, 0.035, preto, x, (CHASSI + CINTA) / 2, CAB_Z1 - 0.12))
    add(box(0.03, CINTA - CHASSI - 0.02, 0.035, preto, x, (CHASSI + CINTA) / 2, CAB_Z0 + 0.10))
    // macaneta de puxar, cromada
    add(box(0.05, 0.055, 0.20, cromo, x + s * 0.02, CINTA - 0.14, cabZ - 0.16))
    add(box(0.04, 0.09, 0.09, cromoSujo, x + s * 0.01, CINTA - 0.14, cabZ + 0.01))
    // espelho de braco, no pilar A — a peca que mais diz "caminhonete"
    const braco = box(0.16, 0.035, 0.035, cromoSujo, x + s * 0.09, CINTA + 0.10, CAB_Z1 - 0.16)
    add(braco)
    const esp = box(0.05, 0.22, 0.15, plastico, x + s * 0.19, CINTA + 0.14, CAB_Z1 - 0.17)
    add(esp)
    add(box(0.015, 0.18, 0.12, solid(0xcfe0e6, 0.15, 0.9), x + s * 0.215, CINTA + 0.14, CAB_Z1 - 0.17))
  }

  // =========================================================================
  // 3. CAPO, GRADE E FRENTE
  // =========================================================================
  const capoZ0 = CAB_Z1, capoZ1 = NARIZ - 0.16
  const capo = roundedBox(LARG - 0.06, 0.13, capoZ1 - capoZ0, 0.04, pinturaSol)
  capo.position.set(0, CAPO, (capoZ0 + capoZ1) / 2)
  capo.rotation.x = 0.035           // caimento pra frente
  add(capo)
  // duas nervuras longitudinais: sem elas o capo e uma tabua
  for (const s of [-1, 1]) {
    add(box(0.10, 0.045, capoZ1 - capoZ0 - 0.2, pinturaSol, s * 0.42, CAPO + 0.08, (capoZ0 + capoZ1) / 2))
  }
  // laterais do compartimento do motor, ligando capo e para-lamas
  for (const s of [-1, 1]) {
    add(box(0.12, CAPO - CHASSI, capoZ1 - capoZ0, pintura, s * (LARG / 2 - 0.06), (CHASSI + CAPO) / 2, (capoZ0 + capoZ1) / 2))
  }
  add(box(LARG - 0.12, CAPO - CHASSI - 0.1, 0.10, preto, 0, (CHASSI + CAPO) / 2, capoZ0 + 0.04))

  // frente: painel da grade, grade horizontal, dois farois redondos
  add(box(LARG - 0.10, CAPO - CHASSI + 0.06, 0.12, pintura, 0, (CHASSI + CAPO) / 2 + 0.02, NARIZ - 0.12))
  const grade = box(1.14, 0.30, 0.06, preto, 0, CAPO - 0.22, NARIZ - 0.06)
  add(grade)
  for (let i = 0; i < 5; i++) {
    add(box(1.10, 0.022, 0.05, cromoSujo, 0, CAPO - 0.33 + i * 0.055, NARIZ - 0.04))
  }
  // emblema: uma barra cromada no meio da grade
  add(box(0.30, 0.05, 0.05, cromo, 0, CAPO - 0.22, NARIZ - 0.02))

  for (const s of [-1, 1]) {
    const x = s * 0.70
    // aro do farol + refletor + lente
    add(deitado(0.155, 0.155, 0.07, cromo, 18, 'z', x, CAPO - 0.20, NARIZ - 0.09))
    add(deitado(0.128, 0.128, 0.05, s > 0 ? farolMat : farolMat2, 18, 'z', x, CAPO - 0.20, NARIZ - 0.045))
    // pisca ambar embaixo do farol
    add(box(0.20, 0.075, 0.05, solid(0xd8912f, 0.4), x, CAPO - 0.40, NARIZ - 0.05))
  }

  // para-choque cromado de barra, com os dois suportes aparecendo
  add(box(LARG + 0.10, 0.15, 0.14, cromo, 0, CHASSI - 0.03, NARIZ + 0.02))
  for (const s of [-1, 1]) {
    add(box(0.09, 0.20, 0.12, cromoSujo, s * 0.52, CHASSI - 0.02, NARIZ - 0.06))
  }
  add(box(0.34, 0.16, 0.02, solid(0xe6e2d4, 0.8), 0, CHASSI - 0.03, NARIZ + 0.10))   // placa

  // para-lamas dianteiros: chapa curvada sobre o arco da roda
  for (const s of [-1, 1]) {
    const px = s * (LARG / 2 - 0.03)
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * Math.PI
      const seg = box(0.13, 0.09, 0.30, pintura,
        px, RODA_R + Math.sin(a) * ARCO_R, EIXO_F - Math.cos(a) * ARCO_R)
      seg.rotation.x = -a + Math.PI / 2
      add(seg)
    }
  }

  // =========================================================================
  // 4. CACAMBA
  // =========================================================================
  const cacZ0 = CAUDA + 0.10, cacZ1 = CAB_Z0 - 0.06
  const cacL = LARG - 0.06
  // assoalho corrugado, 8 cm acima da linha do chassi
  const piso = box(cacL - 0.14, 0.06, cacZ1 - cacZ0 - 0.10, assoalho, 0, CHASSI + 0.06, (cacZ0 + cacZ1) / 2)
  add(piso)
  // paredes laterais (chapa dupla: externa pintada, interna cinza)
  for (const s of [-1, 1]) {
    const x = s * (cacL / 2 - 0.04)
    add(box(0.08, CACAMBA - CHASSI, cacZ1 - cacZ0, pintura, x, (CHASSI + CACAMBA) / 2, (cacZ0 + cacZ1) / 2))
    // friso alto da parede (o vinco de chapa) e a ferrugem que nasce nele
    add(box(0.03, 0.05, cacZ1 - cacZ0 - 0.08, pinturaSol, s * (cacL / 2 + 0.005), CACAMBA - 0.16, (cacZ0 + cacZ1) / 2))
    add(box(0.03, 0.10, 0.62, ferrugem, s * (cacL / 2 + 0.008), CHASSI + 0.16, cacZ0 + 0.55))
    // borda de cima, arredondada
    add(box(0.13, 0.055, cacZ1 - cacZ0, pinturaSol, x, CACAMBA, (cacZ0 + cacZ1) / 2))
    // arco da roda traseira, POR DENTRO da cacamba (a caixa de roda)
    add(box(0.30, 0.30, 0.86, pintura, s * (cacL / 2 - 0.19), CHASSI + 0.20, EIXO_T))
  }
  // parede da frente da cacamba (encosta na cabine)
  add(box(cacL, CACAMBA - CHASSI, 0.08, pintura, 0, (CHASSI + CACAMBA) / 2, cacZ1))
  add(box(cacL + 0.04, 0.055, 0.12, pinturaSol, 0, CACAMBA, cacZ1))

  // tampa traseira, com o nome estampado em relevo e as duas dobradicas
  add(box(cacL, CACAMBA - CHASSI, 0.07, pintura, 0, (CHASSI + CACAMBA) / 2, cacZ0))
  add(box(cacL + 0.04, 0.055, 0.11, pinturaSol, 0, CACAMBA, cacZ0 - 0.01))
  for (let i = 0; i < 4; i++) {
    add(box(0.16, 0.05, 0.03, pinturaSol, -0.30 + i * 0.20, CHASSI + 0.34, cacZ0 - 0.045))
  }
  for (const s of [-1, 1]) {
    add(box(0.10, 0.08, 0.08, cromoSujo, s * (cacL / 2 - 0.10), CHASSI + 0.06, cacZ0 - 0.03))
  }

  // --- o que vai na cacamba (cacamba vazia le como modelo inacabado) -------
  // estepe deitado no canto, preso por uma cinta
  const estepe = new THREE.Group()
  estepe.position.set(-0.42, CHASSI + 0.19, cacZ0 + 0.62)
  estepe.rotation.x = Math.PI / 2
  estepe.add(cyl(RODA_R, RODA_R, RODA_W * 0.92, borracha, 20))
  estepe.add(cyl(RODA_R * 0.62, RODA_R * 0.62, RODA_W * 0.95, cromoSujo, 18))
  estepe.add(cyl(0.07, 0.07, RODA_W, preto, 12))
  carroceria.add(estepe)
  add(box(0.10, 0.02, 0.90, solid(0x2d2f33, 0.9), -0.42, CHASSI + 0.40, cacZ0 + 0.62))

  // caixa de ferramentas de chapa, encostada na parede da frente
  const cx = new THREE.Group()
  cx.position.set(0.42, CHASSI + 0.09, cacZ1 - 0.42)
  cx.add(roundedBox(0.86, 0.28, 0.52, 0.03, cromoSujo).translateY(0.14))
  cx.add(box(0.88, 0.03, 0.54, cromo, 0, 0.29, 0))
  cx.add(box(0.10, 0.05, 0.06, preto, 0, 0.30, -0.28))     // trinco
  carroceria.add(cx)

  // dois caibros de madeira jogados, e uma lona amassada
  for (let i = 0; i < 2; i++) {
    const t = box(0.09, 0.09, 1.5, stdMat('pickup-madeira', {
      map: tiled(pinturaTex('#7a5a38', 'rgba(190,160,120,1)', 0.9), 1, 3), roughness: 0.95,
    }), -0.02 + i * 0.13, CHASSI + 0.14, cacZ0 + 1.15)
    t.rotation.y = 0.05 - i * 0.09
    add(t)
  }

  // =========================================================================
  // 5. TRASEIRA
  // =========================================================================
  add(box(LARG + 0.08, 0.14, 0.13, cromoSujo, 0, CHASSI - 0.06, CAUDA + 0.02))
  for (const s of [-1, 1]) {
    add(box(0.09, 0.18, 0.10, cromoSujo, s * 0.56, CHASSI - 0.04, CAUDA + 0.10))
    // lanterna de tres faixas: freio, seta e re
    const lx = s * (cacL / 2 - 0.16)
    add(box(0.26, 0.30, 0.06, preto, lx, CHASSI + 0.30, cacZ0 - 0.05))
    add(box(0.22, 0.11, 0.05, s > 0 ? luzFreio : luzFreio2, lx, CHASSI + 0.38, cacZ0 - 0.075))
    add(box(0.22, 0.07, 0.05, solid(0xd8912f, 0.4), lx, CHASSI + 0.28, cacZ0 - 0.075))
    add(box(0.22, 0.06, 0.05, solid(0xdfe4e6, 0.4), lx, CHASSI + 0.20, cacZ0 - 0.075))
  }
  add(box(0.34, 0.16, 0.02, solid(0xe6e2d4, 0.8), 0.32, CHASSI - 0.06, CAUDA - 0.05))
  // escapamento saindo por baixo, do lado direito
  add(deitado(0.045, 0.045, 1.5, cromoSujo, 8, 'z', -0.55, 0.34, -1.5))
  add(deitado(0.062, 0.055, 0.22, cromo, 10, 'z', -0.55, 0.34, CAUDA + 0.02))

  // estribo lateral (o degrau de subir na cabine)
  for (const s of [-1, 1]) {
    add(box(0.22, 0.05, 1.30, cromoSujo, s * (LARG / 2 - 0.02), CHASSI - 0.20, cabZ - 0.05))
    for (const dz of [-0.5, 0.5]) {
      add(box(0.10, 0.16, 0.05, preto, s * (LARG / 2 - 0.08), CHASSI - 0.12, cabZ + dz))
    }
  }
  // antena fina no para-lama dianteiro
  const ant = cyl(0.008, 0.012, 0.85, cromoSujo, 6)
  ant.position.set(0.86, CAPO + 0.40, EIXO_F + 0.30)
  ant.rotation.z = 0.10
  add(ant)

  // =========================================================================
  // 6. INTERIOR
  // =========================================================================
  // banco CORRIDO (cabine simples nao tem dois bancos), painel e alavanca
  add(box(LARG - 0.24, 0.16, 0.52, estofado, 0, CHASSI + 0.19, CAB_Z0 + 0.36))
  const encosto = box(LARG - 0.24, 0.56, 0.14, estofado, 0, CHASSI + 0.48, CAB_Z0 + 0.14)
  encosto.rotation.x = -0.13
  add(encosto)
  // costura do banco: tres vincos verticais no encosto
  for (const dx of [-0.5, 0, 0.5]) {
    add(box(0.025, 0.50, 0.03, solid(0x4a3a26, 0.95), dx, CHASSI + 0.48, CAB_Z0 + 0.21))
  }
  // painel + porta-luvas + capa do console
  add(box(LARG - 0.14, 0.26, 0.30, plastico, 0, CINTA - 0.16, CAB_Z1 - 0.30))
  add(box(0.44, 0.16, 0.03, solid(0x3d4147, 0.8), -0.34, CINTA - 0.18, CAB_Z1 - 0.45))
  // quadro de instrumentos: dois mostradores redondos atras do volante
  for (const dx of [-0.11, 0.11]) {
    add(deitado(0.075, 0.075, 0.02, solid(0x14161a, 0.6), 14, 'z', ASSENTO_X + dx, CINTA - 0.12, CAB_Z1 - 0.44))
  }
  // alavanca de cambio no assoalho
  const alav = cyl(0.018, 0.024, 0.42, cromoSujo, 8)
  alav.position.set(0.02, CHASSI + 0.28, CAB_Z0 + 0.62)
  alav.rotation.x = -0.22
  add(alav)
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 7), solid(0x2a1c12, 0.7))
  bola.position.set(0.02, CHASSI + 0.50, CAB_Z0 + 0.57)
  add(bola)

  // --- volante ------------------------------------------------------------
  // O pivo e o que o sistema gira: os alvos das maos sao FILHOS dele, entao
  // quando a caminhonete esterca as maos do motorista vao junto de graca.
  const volante = new THREE.Group()
  volante.position.set(ASSENTO_X, CINTA - 0.06, CAB_Z1 - 0.34)
  volante.rotation.x = -1.02          // deitado, como em picape antiga
  volante.userData.dynamic = true
  carroceria.add(volante)
  const RV = 0.185
  const aro = new THREE.Mesh(new THREE.TorusGeometry(RV, 0.019, 8, 26), solid(0x2b2f34, 0.8))
  volante.add(aro)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const raio = box(0.030, RV, 0.012, cromoSujo, Math.cos(a) * RV / 2, Math.sin(a) * RV / 2, -0.01)
    raio.rotation.z = a - Math.PI / 2
    volante.add(raio)
  }
  const cubo = cyl(0.048, 0.048, 0.04, cromo, 14)
  cubo.rotation.x = Math.PI / 2
  cubo.position.z = -0.02
  volante.add(cubo)
  // coluna de direcao ligando o volante ao painel
  const col = cyl(0.030, 0.030, 0.34, plastico, 8)
  col.position.set(ASSENTO_X, CINTA - 0.19, CAB_Z1 - 0.44)
  col.rotation.x = 0.55
  add(col)

  // alvos das maos: filhos do volante, em cima do aro, as 9h15
  const maos = []
  for (const s of [1, -1]) {
    const alvo = new THREE.Object3D()
    alvo.position.set(s * RV * 0.94, RV * 0.16, 0.045)
    alvo.userData.dynamic = true
    volante.add(alvo)
    maos.push(alvo)
  }

  // =========================================================================
  // 7. RODAS
  // =========================================================================
  // Aro de ACO com calota pequena, nao liga polida: e o que uma pickup de
  // trabalho calca, e e o que separa a silhueta dela da do carro preto.
  const pneuMat = stdMat('pickup-pneu', {
    map: tiled(tex('pickup-taco', 64, (g, s) => {
      g.fillStyle = '#1c1e21'; g.fillRect(0, 0, s, s)
      for (let i = 0; i < s; i += 8) {
        g.fillStyle = 'rgba(70,72,78,0.85)'
        g.fillRect(i, 0, 4, s * 0.42)
        g.fillRect(i + 4, s * 0.55, 4, s * 0.45)
      }
    }, 1), 10, 1),
    roughness: 0.97, metalness: 0.02,
  })

  function fazerRoda(lado) {
    const r = new THREE.Group()
    // banda de rodagem com taco (pneu de pickup e cravado, nao liso)
    const banda = cyl(RODA_R, RODA_R, RODA_W, pneuMat, 22)
    banda.rotation.z = Math.PI / 2
    r.add(banda)
    for (const sx of [1, -1]) {
      const ombro = new THREE.Mesh(new THREE.TorusGeometry(RODA_R - 0.04, 0.04, 7, 22), borracha)
      ombro.rotation.y = Math.PI / 2
      ombro.position.x = sx * RODA_W * 0.35
      r.add(ombro)
    }
    const flanco = cyl(RODA_R * 0.90, RODA_R * 0.90, RODA_W * 0.94, borracha, 22)
    flanco.rotation.z = Math.PI / 2
    r.add(flanco)

    // A FACE EXTERNA DA RODA, e todo o disco tem que morar aqui.
    //
    // O flanco e um cilindro de raio 0.378 e largura 0.31: qualquer peca com
    // menos de 0.155 de x fica DENTRO dele e some. Foi assim na primeira
    // versao — aro, furos e calota estavam em 0.066 — e as quatro rodas viraram
    // discos pretos chapados, sem nada no meio.
    const xFora = lado * RODA_W * 0.47
    const xAro = lado * RODA_W * 0.38

    // aro de aco: barril aberto (so a parede) mais o disco no fundo. O barril
    // vazado e o que da profundidade — com um disco cheio a roda vira moeda.
    const aroMat = solid(0x6d7276, 0.55, 0.5)
    const barril = new THREE.Mesh(
      new THREE.CylinderGeometry(RODA_R * 0.68, RODA_R * 0.68, RODA_W * 0.34, 22, 1, true), aroMat)
    barril.rotation.z = Math.PI / 2
    barril.position.x = xAro - lado * 0.02
    r.add(barril)
    const labio = new THREE.Mesh(new THREE.TorusGeometry(RODA_R * 0.68, 0.024, 7, 24), aroMat)
    labio.rotation.y = Math.PI / 2
    labio.position.x = xFora
    r.add(labio)
    // fundo escuro do aro: e ele que faz o vao dos furos ter profundidade
    const fundo = cyl(RODA_R * 0.66, RODA_R * 0.66, RODA_W * 0.14, solid(0x35383c, 0.9), 20)
    fundo.rotation.z = Math.PI / 2
    fundo.position.x = xAro - lado * 0.06
    r.add(fundo)
    // disco do aro com QUATRO furos ovais — o aro de aco de caminhonete de
    // trabalho, que e chapa furada e nao liga de cinco raios
    const disco = cyl(RODA_R * 0.66, RODA_R * 0.66, RODA_W * 0.07, aroMat, 20)
    disco.rotation.z = Math.PI / 2
    disco.position.x = xAro
    r.add(disco)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4
      const furo = cyl(0.058, 0.058, RODA_W * 0.16, solid(0x24262a, 0.95), 12)
      furo.rotation.z = Math.PI / 2
      furo.position.set(xAro, Math.cos(a) * RODA_R * 0.40, Math.sin(a) * RODA_R * 0.40)
      r.add(furo)
    }
    // calota pequena de cromo no centro, com as cinco porcas em volta
    const calota = cyl(0.10, 0.115, RODA_W * 0.13, cromo, 16)
    calota.rotation.z = Math.PI / 2
    calota.position.x = xFora + lado * 0.012
    r.add(calota)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5
      const porca = cyl(0.018, 0.018, 0.035, cromoSujo, 6)
      porca.rotation.z = Math.PI / 2
      porca.position.set(xAro + lado * 0.03, Math.cos(a) * 0.088, Math.sin(a) * 0.088)
      r.add(porca)
    }
    return r
  }

  const rodas = []
  for (const [z, dianteira] of [[EIXO_F, true], [EIXO_T, false]]) {
    for (const s of [1, -1]) {
      const pivo = new THREE.Group()
      pivo.position.set(s * RODA_X, RODA_R, z)
      grupo.add(pivo)
      const roda = fazerRoda(s)
      pivo.add(roda)
      // assa a roda SOZINHA e so depois marca como dinamica: e assim que o
      // forno da carroceria sabe que nao pode fundir ela na lataria
      bakeStatic(roda)
      roda.userData.dynamic = true
      rodas.push({ mesh: roda, dianteira, raio: RODA_R })
    }
  }

  // para-lamas traseiros, POR FORA da cacamba (a saia sobre a roda)
  for (const s of [-1, 1]) {
    const px = s * (cacL / 2 + 0.02)
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * Math.PI
      const seg = box(0.10, 0.08, 0.28, pinturaSol,
        px, RODA_R + Math.sin(a) * (ARCO_R - 0.02), EIXO_T - Math.cos(a) * (ARCO_R - 0.02))
      seg.rotation.x = -a + Math.PI / 2
      add(seg)
    }
  }

  // =========================================================================
  // 8. ASSENTO, PILOTO E O QUE O SISTEMA LE
  // =========================================================================
  const assento = new THREE.Object3D()
  // no banco corrido, o motorista senta do lado do volante. Y e o TOPO do
  // assento (convencao 'quadril' de veiculos.js).
  assento.position.set(ASSENTO_X, CHASSI + 0.27, CAB_Z0 + 0.36)
  assento.userData.dynamic = true
  carroceria.add(assento)

  grupo.userData.carroceria = carroceria
  grupo.userData.volante = volante
  // 2.0 e nao 2.4 (a do carro): direcao de caminhonete velha e mais direta e
  // mais dura, e o volante grande ja anda muito com pouco giro.
  grupo.userData.voltaVolante = 2.0
  grupo.userData.farois = [farolMat, farolMat2]
  grupo.userData.luzesFreio = [luzFreio, luzFreio2]
  grupo.userData.piloto = {
    maos: [maos[0], maos[1]],
    // 0.06 e menos que o carro (0.10): pickup e alta e o volante fica quase
    // no colo, entao o motorista senta ERETO. Inclinar aqui daria a pose de
    // quem esta encolhido dentro de um cupe.
    tronco: 0.06,
    cotovelo: 0.55,
  }

  bakeStatic(carroceria)
  carroceria.userData.dynamic = true
  bakeStatic(grupo)

  return { grupo, assento, rodas, config: 'caminhonete' }
}

export default construir
