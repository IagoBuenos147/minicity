import * as THREE from 'three'
import { solid, box, cyl, sphere, roundedBox } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'

// ---------------------------------------------------------------------------
// O CARRO — muscle car preto, linhas de classico dos anos 60/70.
//
// Contrato (VEICULOS.md): construir() -> { grupo, assento, rodas, config }
//   grupo   origem NO CHAO, no centro do carro, frente para +Z
//   assento Object3D local onde o sistema poe o personagem
//   rodas   [{ mesh, dianteira, raio }] — o sistema gira e esterca
//   config  'carro', a chave em MUNDO.DIRIGIR
//
// POR QUE UM PERFIL EXTRUDADO E NAO UMA PILHA DE CAIXAS:
// a silhueta e a coisa que faz um carro parecer um carro. Desenhar o PERFIL de
// lado (capo longo, cintura baixa, traseira curta, os dois arcos de roda
// recortados) e extrudar na largura da uma linha continua que caixa nenhuma
// empilhada consegue — e de quebra os para-lamas ja nascem "vazados" em cima
// das rodas, entao a roda nunca fica solta no ar.
//
// O QUE MUDOU NESTA REVISAO (a queixa era "quadrado, sem peso, sem detalhe"):
//
// 1) A EXTRUSAO DEIXOU DE SER RETA. Extrudar um perfil na largura da um carro
//    com a MESMA largura em todo lugar: no teto, no bico, na traseira e na
//    soleira. E exatamente isso que le como "caixa". Agora a geometria passa
//    por moldar(): cada vertice tem o x multiplicado por um fator que afina o
//    carro nas PONTAS e RECOLHE a lataria acima da cintura (o "tumblehome" de
//    qualquer carro de verdade). As normais sao corrigidas pela transposta da
//    inversa do jacobiano — sem isso a lataria continuaria sendo SOMBREADA
//    como uma caixa mesmo depois de deixar de ser uma.
//
// 2) A CARROCERIA E UM GRUPO SEPARADO DAS RODAS. Antes o carro inteiro
//    (rodas juntas) mergulhava e rolava, o que faz as rodas atravessarem o
//    asfalto e tira todo o peso. Agora `grupo.userData.carroceria` recebe o
//    mergulho, a rolagem e o afundamento da suspensao, e as quatro rodas
//    ficam plantadas no chao.
//
// 3) O VOLANTE GIRA E O MOTORISTA SEGURA NELE. `grupo.userData.volante` e o
//    pivo da coluna; os alvos das maos sao filhos dele, entao quando o carro
//    esterca o volante gira, e as maos do boneco vao junto (IK em veiculos.js).
// ---------------------------------------------------------------------------

// --- as medidas, num lugar so ----------------------------------------------
const LARG = 1.92         // largura total (X) na cintura
const RODA_R = 0.35       // raio do pneu
const RODA_W = 0.30       // largura do pneu
const RODA_X = 0.815      // centro da roda em X
const EIXO_F = 1.42       // eixo dianteiro em Z
const EIXO_T = -1.44      // eixo traseiro em Z
const ARCO_R = 0.47       // raio do recorte do para-lama
const CINTA = 0.96        // linha de cintura: onde a lataria acaba e o vidro comeca
const TETO = 1.41         // topo do teto
const NARIZ = 2.32        // Z do bico
const CAUDA = -2.32       // Z da traseira  (4.64 m de ponta a ponta)
const ASSENTO_X = 0.38    // volante a ESQUERDA: quem olha pra +Z tem a esquerda em +X

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function suave(t) { t = clamp01(t); return t * t * (3 - 2 * t) }

/**
 * O AFINAMENTO DA LATARIA, em funcao da altura e da posicao no comprimento.
 * 1 = largura cheia. Sai abaixo de 1 nas pontas (o carro "fecha" no bico e na
 * traseira) e acima da cintura (a lataria recolhe pra dentro em direcao ao
 * vidro). E esta funcao, e nao mais caixinhas coladas, que tira o ar de tijolo.
 */
function fatorX(y, z) {
  let f = 1
  if (z > EIXO_F) f *= 1 - 0.17 * suave((z - EIXO_F) / (NARIZ - EIXO_F))
  if (z < EIXO_T) f *= 1 - 0.15 * suave((EIXO_T - z) / (EIXO_T - CAUDA))
  if (y > 0.70) f *= 1 - 0.115 * suave((y - 0.70) / 0.42)
  if (y < 0.38) f *= 1 - 0.085 * suave((0.38 - y) / 0.38)
  return f
}

/**
 * Aplica fatorX vertice a vertice E CORRIGE A NORMAL.
 *
 * A superficie vira P = (x*f(y,z), y, z). O jacobiano dessa deformacao nao e
 * uma escala pura: ele tem os termos x*df/dy e x*df/dz, que sao justamente a
 * INCLINACAO nova da lataria. Ignorar isso (so mexer nos vertices) deixaria o
 * carro com a silhueta certa e o sombreado de antes — a luz continuaria
 * batendo como se a lateral fosse um plano vertical.
 */
function moldar(geo) {
  const p = geo.attributes.position
  const n = geo.attributes.normal
  const h = 0.02
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const f = fatorX(y, z)
    const fy = (fatorX(y + h, z) - fatorX(y - h, z)) / (2 * h)
    const fz = (fatorX(y, z + h) - fatorX(y, z - h)) / (2 * h)
    p.setX(i, x * f)
    if (n) {
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i)
      const k = nx / f
      const vx = k, vy = ny - x * fy * k, vz = nz - x * fz * k
      const m = Math.hypot(vx, vy, vz) || 1
      n.setXYZ(i, vx / m, vy / m, vz / m)
    }
  }
  p.needsUpdate = true
  if (n) n.needsUpdate = true
  geo.computeBoundingSphere()
  return geo
}

/** Painel/coluna reta entre dois pontos do plano ZY, com espessura. */
function painel(mat, larg, esp, z1, y1, z2, y2, x = 0) {
  const dz = z2 - z1, dy = y2 - y1
  const comp = Math.hypot(dz, dy)
  const m = box(larg, esp, comp, mat, x, (y1 + y2) / 2, (z1 + z2) / 2)
  // o +Z local do box tem que apontar de (z1,y1) para (z2,y2)
  m.rotation.x = Math.atan2(-dy, dz)
  return m
}

/** Trapezio fechado (lista de [z,y]) extrudado em X — usado no vidro lateral. */
function chapaZY(pontos, esp, mat, furo) {
  const s = new THREE.Shape()
  s.moveTo(pontos[0][0], pontos[0][1])
  for (let i = 1; i < pontos.length; i++) s.lineTo(pontos[i][0], pontos[i][1])
  s.closePath()
  if (furo) {
    const h = new THREE.Path()
    h.moveTo(furo[0][0], furo[0][1])
    for (let i = 1; i < furo.length; i++) h.lineTo(furo[i][0], furo[i][1])
    h.closePath()
    s.holes.push(h)
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: false })
  g.rotateY(-Math.PI / 2)   // X do desenho vira Z do carro; a profundidade vira -X
  g.translate(esp / 2, 0, 0)
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true; m.receiveShadow = true
  return m
}

export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'carro'

  // TUDO que nao e roda vive aqui: e este grupo que mergulha no freio, rola na
  // curva e afunda na suspensao, com as rodas continuando no chao.
  const carroceria = new THREE.Group()
  carroceria.name = 'carroceria'
  grupo.add(carroceria)

  // --- materiais ------------------------------------------------------------
  // Preto BRILHANTE: roughness baixa pro sol deixar um risco de luz na lataria.
  // metalness so 0.3 porque a cena nao tem environment map — metal alto sem
  // reflexo pra refletir vira um borrao preto morto.
  const pintura = solid(0x2a2a33, 0.22, 0.28)
  const pinturaEsc = solid(0x15151b, 0.34, 0.2)
  const cromo = solid(0x99a1a9, 0.26, 0.66)
  const cromoEsc = solid(0x6e757d, 0.36, 0.6)
  const pretoFosco = solid(0x0e0e11, 0.92, 0.0)
  const pneuMat = solid(0x16161a, 0.95, 0.0)
  const flancoMat = solid(0x101013, 0.88, 0.0)
  const couro = solid(0x2a2024, 0.7, 0.0)
  // VIDRO QUE DEIXA VER O MOTORISTA. Com opacidade 0.86 e um emissivo azul
  // forte, o para-brisa virava uma chapa azul clara e o interior inteiro (que
  // existe, com banco, painel e volante) nao aparecia. Fica escuro e bem mais
  // transparente; o emissivo sobra so como o brilho de reflexo do ceu.
  const vidro = new THREE.MeshStandardMaterial({
    color: 0x0d1318, roughness: 0.05, metalness: 0.25,
    emissive: 0x35506a, emissiveIntensity: 0.10,
    transparent: true, opacity: 0.52,
  })

  // Estes SIM sao instancias novas, fora do cache de solid(): o sistema vai
  // mexer no emissiveIntensity pra acender o freio, e um material cacheado
  // acenderia a lanterna de todo mundo (e de qualquer outro objeto vermelho).
  const luzFreioE = new THREE.MeshStandardMaterial({
    color: 0x6b0e0e, emissive: 0xff1d1d, emissiveIntensity: 0.55, roughness: 0.3,
  })
  const luzFreioD = luzFreioE.clone()
  const farolMat = new THREE.MeshStandardMaterial({
    color: 0xf2f0e2, emissive: 0xffe9b0, emissiveIntensity: 0.25, roughness: 0.15,
  })

  // =========================================================================
  // 1. LATARIA — perfil de lado extrudado e depois MOLDADO na largura
  // =========================================================================
  const perfil = new THREE.Shape()
  perfil.moveTo(-2.18, 0.34)                                  // saia traseira
  perfil.lineTo(-1.90, 0.29)
  perfil.lineTo(-1.90, RODA_R)
  perfil.absarc(EIXO_T, RODA_R, ARCO_R, Math.PI, 0, true)     // arco da roda traseira
  perfil.lineTo(-0.92, 0.25)
  perfil.lineTo(0.92, 0.25)                                   // soleira baixa entre os eixos
  perfil.lineTo(0.95, RODA_R)
  perfil.absarc(EIXO_F, RODA_R, ARCO_R, Math.PI, 0, true)     // arco da roda dianteira
  perfil.lineTo(2.12, 0.29)
  perfil.lineTo(2.28, 0.33)
  perfil.lineTo(NARIZ, 0.60)                                  // face da grade
  perfil.quadraticCurveTo(NARIZ + 0.02, 0.86, 2.24, 0.95)     // bico levemente caido
  perfil.quadraticCurveTo(2.10, 1.005, 1.94, 1.015)
  perfil.lineTo(0.70, 1.045)                                  // CAPO LONGO: 1.4 m de chapa
  perfil.lineTo(0.52, CINTA + 0.02)                           // base do para-brisa
  perfil.lineTo(-1.44, CINTA)                                 // cintura reta das portas
  perfil.quadraticCurveTo(-1.66, CINTA + 0.03, -1.80, CINTA + 0.045)
  perfil.lineTo(-2.16, 0.95)                                  // traseira CURTA
  perfil.quadraticCurveTo(CAUDA, 0.90, CAUDA, 0.78)
  perfil.lineTo(-2.28, 0.40)
  perfil.closePath()

  // ATENCAO: bevelSize empurra o contorno PRA FORA. Fica pequeno (2 cm) pra o
  // perfil desenhado acima valer de verdade e nada colado na lataria (grade,
  // lanterna, friso) acabar engolido. bevelThickness e o arredondamento no
  // eixo X, e ele que fecha a largura: 1.80 + 2 x 0.06 = 1.92.
  const BEV_X = 0.06, BEV_R = 0.02
  const geoCorpo = new THREE.ExtrudeGeometry(perfil, {
    depth: LARG - BEV_X * 2, bevelEnabled: true,
    bevelThickness: BEV_X, bevelSize: BEV_R, bevelSegments: 3, curveSegments: 14,
  })
  geoCorpo.rotateY(-Math.PI / 2)
  geoCorpo.translate((LARG - BEV_X * 2) / 2, 0, 0)
  moldar(geoCorpo)
  const corpo = new THREE.Mesh(geoCorpo, pintura)
  corpo.castShadow = true; corpo.receiveShadow = true
  carroceria.add(corpo)

  // assoalho: sem ele da pra ver a rua por baixo do carro, por entre os arcos
  carroceria.add(box(1.70, 0.05, 3.5, pretoFosco, 0, 0.26, -0.1))

  // --- caixas de roda: o "buraco" escuro atras do pneu ---------------------
  // Sem elas, por cima do pneu se ve o ceu atraves do vao do para-lama e a
  // roda parece colada por fora do carro.
  // A meia-rosca nasce com o eixo em Y e cobrindo a metade do +X; um unico
  // rotation.z = 90 deita o eixo em X e joga essa metade pra CIMA, que e onde
  // a caixa de roda tem que estar. Material proprio e de dois lados: por
  // dentro do para-lama a face de tras e a que fica virada pra gente.
  const caixaMat = new THREE.MeshStandardMaterial({
    color: 0x08080a, roughness: 1, side: THREE.DoubleSide,
  })
  for (const z of [EIXO_F, EIXO_T]) {
    for (const s of [1, -1]) {
      const caixa = new THREE.Mesh(
        new THREE.CylinderGeometry(ARCO_R - 0.02, ARCO_R - 0.02, 0.34, 16, 1, true,
          0, Math.PI), caixaMat)
      caixa.rotation.z = Math.PI / 2
      caixa.position.set(s * (LARG / 2 - 0.20), RODA_R, z)
      caixa.receiveShadow = true
      carroceria.add(caixa)
    }
  }

  // --- para-lamas marcados: um labio de arco por roda -----------------------
  // Meia-rosca girada pro plano ZY. E o que "sela" a roda na lataria.
  const geoArco = new THREE.TorusGeometry(ARCO_R + 0.008, 0.05, 8, 18, Math.PI)
  for (const z of [EIXO_F, EIXO_T]) {
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(geoArco, pintura)
      a.rotation.y = -Math.PI / 2
      a.position.set(s * (fatorX(RODA_R + 0.2, z) * LARG / 2 - 0.015), RODA_R, z)
      a.castShadow = true; a.receiveShadow = true
      carroceria.add(a)
    }
  }

  // --- capo: duas lombadas, rebaixo e tomada de ar -------------------------
  // O rebaixo (painel fosco no meio) e o que separa "capo" de "para-lama":
  // sem ele o topo da frente e uma mesa lisa de 1.9 m.
  carroceria.add(box(0.90, 0.02, 1.30, pinturaEsc, 0, 1.062, 1.32))
  for (const s of [1, -1]) {
    const lomb = roundedBox(0.30, 0.08, 1.30, 0.035, pintura)
    lomb.position.set(s * 0.30, 1.058, 1.32)
    carroceria.add(lomb)
  }
  // tomada de ar: caixa levantada com a boca preta virada pro para-brisa
  const scoop = roundedBox(0.46, 0.10, 0.40, 0.04, pintura)
  scoop.position.set(0, 1.10, 1.10)
  carroceria.add(scoop)
  carroceria.add(box(0.38, 0.06, 0.03, pretoFosco, 0, 1.11, 0.905))
  // vincos do capo: dois riscos escuros correndo ate o para-brisa
  for (const s of [1, -1]) {
    carroceria.add(box(0.012, 0.02, 1.24, pinturaEsc, s * 0.455, 1.052, 1.34))
  }

  // =========================================================================
  // 2. FRENTE — grade vertical cromada, quatro farois, para-choque
  // =========================================================================
  // ONDE A FRENTE REALMENTE ACABA: o perfil vai ate NARIZ, e o bevel da
  // extrusao so recua a chapa NAS PONTAS em X — no meio do carro a face do
  // bico esta exatamente em z = NARIZ. Tudo que for grade, farol ou moldura
  // tem que ficar A FRENTE disso; posto atras, some dentro da lataria (foi o
  // que aconteceu na primeira tentativa: a frente inteira virou um bloco preto).
  const zF = NARIZ
  const geoLamina = new THREE.BoxGeometry(0.016, 0.24, 0.06)
  for (let i = 0; i < 13; i++) {
    const x = -0.36 + (i / 12) * 0.72
    const l = new THREE.Mesh(geoLamina, cromo)
    l.position.set(x, 0.755, zF + 0.012)
    l.castShadow = true; l.receiveShadow = true
    carroceria.add(l)
  }
  // moldura da grade: fina, e no cromo escuro
  carroceria.add(box(1.50, 0.032, 0.09, cromoEsc, 0, 0.905, zF + 0.015))
  carroceria.add(box(1.50, 0.032, 0.09, cromoEsc, 0, 0.605, zF + 0.015))
  for (const s of [1, -1]) carroceria.add(box(0.032, 0.33, 0.09, cromoEsc, s * 0.735, 0.755, zF + 0.015))
  // travessa central, dividindo a grade em dois — marca de classico
  carroceria.add(box(0.042, 0.30, 0.07, cromoEsc, 0, 0.755, zF + 0.016))

  // DOIS farois redondos grandes, um em cada ponta da grade, com aro cromado
  for (const s of [1, -1]) {
    const copo = cyl(0.124, 0.108, 0.10, cromoEsc, 20)
    copo.rotation.x = Math.PI / 2
    copo.position.set(s * 0.545, 0.775, zF - 0.01)
    carroceria.add(copo)
    const lente = cyl(0.114, 0.114, 0.06, farolMat, 20)
    lente.rotation.x = Math.PI / 2
    lente.position.set(s * 0.545, 0.775, zF + 0.035)
    carroceria.add(lente)
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.126, 0.020, 8, 20), cromo)
    aro.position.set(s * 0.545, 0.775, zF + 0.042)
    carroceria.add(aro)
    // pisca ambar embaixo da grade
    carroceria.add(box(0.20, 0.055, 0.06, solid(0xd98a1e, 0.4, 0.1), s * 0.30, 0.565, zF + 0.005))
  }
  // para-choque dianteiro: mais fino, cromo escuro, com dois dentes
  const pcF = roundedBox(1.88, 0.12, 0.16, 0.05, cromoEsc)
  pcF.position.set(0, 0.475, NARIZ - 0.03)
  carroceria.add(pcF)
  for (const s of [1, -1]) {
    const dente = roundedBox(0.09, 0.22, 0.14, 0.035, cromoEsc)
    dente.position.set(s * 0.40, 0.535, NARIZ - 0.04)
    carroceria.add(dente)
  }
  carroceria.add(box(1.60, 0.10, 0.06, pretoFosco, 0, 0.355, NARIZ - 0.11))   // queixo

  // =========================================================================
  // 3. TRASEIRA — lanternas, para-choque, escapes, rabo de pato
  // =========================================================================
  const zT = CAUDA - 0.025
  carroceria.add(box(1.60, 0.32, 0.06, pretoFosco, 0, 0.71, zT + 0.05))
  const lanternas = [luzFreioE, luzFreioD]
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1
    // tres pastilhas por lado, com friso cromado em volta: le como lanterna de
    // classico, e nao como uma barra vermelha
    for (let k = 0; k < 3; k++) {
      const lt = box(0.185, 0.16, 0.05, lanternas[i], s * (0.26 + k * 0.20), 0.71, zT)
      carroceria.add(lt)
    }
    carroceria.add(box(0.64, 0.030, 0.065, cromoEsc, s * 0.46, 0.805, zT))
    carroceria.add(box(0.64, 0.030, 0.065, cromoEsc, s * 0.46, 0.615, zT))
  }
  // rabo de pato: a dobrinha levantada no fim da tampa
  const rabo = roundedBox(1.58, 0.055, 0.20, 0.025, pintura)
  rabo.position.set(0, CINTA + 0.075, -2.12)
  rabo.rotation.x = -0.16
  carroceria.add(rabo)

  const pcT = roundedBox(1.88, 0.12, 0.16, 0.05, cromoEsc)
  pcT.position.set(0, 0.475, CAUDA + 0.04)
  carroceria.add(pcT)
  // placa
  carroceria.add(box(0.36, 0.14, 0.02, cromoEsc, 0, 0.50, CAUDA + 0.00))
  // saidas de escape: ponteira cromada com o miolo escuro
  for (const s of [1, -1]) {
    const p = cyl(0.058, 0.058, 0.18, cromoEsc, 14)
    p.rotation.x = Math.PI / 2
    p.position.set(s * 0.52, 0.36, CAUDA + 0.10)
    carroceria.add(p)
    const miolo = cyl(0.042, 0.042, 0.04, pretoFosco, 12)
    miolo.rotation.x = Math.PI / 2
    miolo.position.set(s * 0.52, 0.36, CAUDA + 0.02)
    carroceria.add(miolo)
  }

  // =========================================================================
  // 4. CAIXARIA DE VIDRO — colunas, teto, vidros escuros com caixilho
  // =========================================================================
  const XP = 0.700                 // plano das colunas e do vidro lateral
  const zPB = 0.52, zTF = -0.06    // para-brisa: base e topo
  const zTR = -0.94, zVT = -1.44   // vidro traseiro: topo e base

  // teto baixo e recuado
  const teto = roundedBox(1.50, 0.075, 0.98, 0.06, pintura)
  teto.position.set(0, TETO - 0.05, (zTF + zTR) / 2)
  carroceria.add(teto)

  // O vao lateral e um so (cupe 2 portas, sem coluna B). Estas quatro quinas
  // sao o vidro; a moldura e o MESMO poligono 4 cm maior, com o vidro de furo.
  const vao = [[0.46, 0.99], [-0.06, 1.29], [-0.90, 1.29], [-1.38, 0.99]]
  const vaoFolga = [[0.47, 0.98], [-0.06, 1.30], [-0.90, 1.30], [-1.39, 0.98]]
  for (const s of [1, -1]) {
    carroceria.add(painel(pintura, 0.07, 0.075, zPB, CINTA + 0.02, zTF, TETO - 0.08, s * XP))
    carroceria.add(painel(pintura, 0.07, 0.075, zTR, TETO - 0.08, zVT, CINTA, s * XP))
    // caixilho = quatro barras nas quatro arestas do vao. Sai mais barato e
    // mais confiavel que extrudar um poligono com furo.
    for (let i = 0; i < 4; i++) {
      const a = vao[i], b = vao[(i + 1) % 4]
      carroceria.add(painel(cromo, 0.03, 0.05, a[0], a[1], b[0], b[1], s * (XP + 0.03)))
    }
    const vd = chapaZY(vaoFolga, 0.02, vidro)
    vd.position.x = s * (XP + 0.018)
    carroceria.add(vd)
  }

  // para-brisa e vidro traseiro (inclinados, encaixando nas colunas)
  carroceria.add(painel(vidro, 1.44, 0.03, zPB, CINTA + 0.03, zTF, TETO - 0.09))
  carroceria.add(painel(vidro, 1.40, 0.03, zTR, TETO - 0.09, zVT, CINTA + 0.02))
  // caixilho do para-brisa
  carroceria.add(painel(cromo, 1.40, 0.025, zPB + 0.02, CINTA + 0.01, zTF + 0.02, TETO - 0.11))
  carroceria.add(painel(cromo, 1.36, 0.025, zTR - 0.02, TETO - 0.11, zVT - 0.02, CINTA))

  // =========================================================================
  // 5. LATERAL — friso, portas, macanetas, retrovisores, saida de ar
  // =========================================================================
  for (const s of [1, -1]) {
    const xl = s * (LARG / 2 * fatorX(0.60, 0) + 0.008)
    // friso corrido, so entre os dois arcos (senao ele cruzaria o vao da roda)
    carroceria.add(box(0.03, 0.05, 1.88, cromo, xl, 0.60, -0.01))
    // RISCO DA PORTA: e um detalhe de 1 cm que muda tudo, porque e ele que diz
    // onde a porta comeca e acaba — sem isso a lateral e uma chapa so.
    carroceria.add(box(0.014, 0.60, 0.016, pinturaEsc, xl - s * 0.004, 0.66, 0.50))
    carroceria.add(box(0.014, 0.60, 0.016, pinturaEsc, xl - s * 0.004, 0.66, -1.10))
    carroceria.add(box(0.03, 0.03, 0.18, cromo, xl, 0.84, -0.60))          // macaneta
    // grelha de saida de ar atras do para-lama dianteiro
    for (let i = 0; i < 3; i++) {
      carroceria.add(box(0.02, 0.02, 0.16, pretoFosco, xl, 0.72 + i * 0.05, 0.98))
    }
    // retrovisor: haste curta + espelho
    const haste = cyl(0.018, 0.018, 0.10, cromo, 8)
    haste.rotation.z = Math.PI / 2
    haste.position.set(s * (LARG / 2 + 0.03), 0.90, 0.42)
    carroceria.add(haste)
    const esp = roundedBox(0.05, 0.115, 0.16, 0.035, pretoFosco)
    esp.position.set(s * (LARG / 2 + 0.09), 0.91, 0.42)
    carroceria.add(esp)
    carroceria.add(box(0.012, 0.09, 0.12, cromo, s * (LARG / 2 + 0.065), 0.91, 0.42))
  }
  // bocal do tanque, so de um lado (assimetria de proposito: e o que faz o
  // olho acreditar que o carro foi projetado e nao espelhado)
  const bocal = cyl(0.055, 0.055, 0.02, cromo, 14)
  bocal.rotation.z = Math.PI / 2
  bocal.position.set(LARG / 2 * fatorX(0.80, -1.7) + 0.005, 0.80, -1.72)
  carroceria.add(bocal)

  // =========================================================================
  // 6. INTERIOR — da pra ver pelos vidros, entao existe
  // =========================================================================
  carroceria.add(box(1.52, 0.26, 0.36, pretoFosco, 0, 0.85, 0.36))          // painel
  // capela dos relogios em frente ao motorista
  const capela = roundedBox(0.52, 0.20, 0.20, 0.05, pretoFosco)
  capela.position.set(ASSENTO_X, 0.97, 0.28)
  carroceria.add(capela)
  for (const dx of [-0.11, 0.11]) {
    const rel = cyl(0.062, 0.062, 0.02, solid(0x1b1b20, 0.4, 0.3), 14)
    rel.rotation.x = Math.PI / 2 - 0.35
    rel.position.set(ASSENTO_X + dx, 0.97, 0.20)
    carroceria.add(rel)
  }
  carroceria.add(box(0.34, 0.30, 1.30, couro, 0, 0.45, -0.34))              // console
  // alavanca do cambio
  const alav = cyl(0.016, 0.020, 0.20, cromo, 8)
  alav.position.set(0, 0.67, -0.10)
  alav.rotation.x = 0.18
  carroceria.add(alav)
  carroceria.add(sphere(0.038, pretoFosco, 12).translateY(0.77).translateZ(-0.08))

  for (const s of [1, -1]) {
    // banco concha: assento + encosto + apoio de cabeca
    carroceria.add(roundedBox(0.54, 0.14, 0.54, 0.05, couro).translateX(s * ASSENTO_X)
      .translateY(0.47).translateZ(-0.30))
    const encosto = roundedBox(0.54, 0.66, 0.16, 0.05, couro)
    encosto.position.set(s * ASSENTO_X, 0.81, -0.60)
    encosto.rotation.x = -0.14
    carroceria.add(encosto)
    const apoio = roundedBox(0.26, 0.16, 0.12, 0.045, couro)
    apoio.position.set(s * ASSENTO_X, 1.14, -0.66)
    carroceria.add(apoio)
  }

  // --- VOLANTE: um pivo proprio, que o sistema gira com o esterco -----------
  // O eixo do volante e o Z LOCAL deste grupo; a inclinacao da coluna esta no
  // rotation.x. Como a ordem de Euler e a padrao (XYZ), escrever rotation.z
  // gira o aro em torno do proprio eixo mesmo com a coluna inclinada.
  const volante = new THREE.Group()
  volante.position.set(ASSENTO_X, 0.855, 0.04)
  volante.rotation.x = 1.16
  volante.userData.dynamic = true
  carroceria.add(volante)

  const aroVol = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.020, 8, 24), pretoFosco)
  aroVol.castShadow = true
  volante.add(aroVol)
  // tres raios cromados, como num volante de classico
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    const raio = box(0.026, 0.155, 0.012, cromo)
    raio.position.set(Math.cos(a) * 0.082, Math.sin(a) * 0.082, 0)
    raio.rotation.z = a - Math.PI / 2
    volante.add(raio)
  }
  const cubo = cyl(0.045, 0.045, 0.035, cromo, 14)
  cubo.rotation.x = Math.PI / 2
  volante.add(cubo)
  const coluna = cyl(0.026, 0.026, 0.26, pretoFosco, 8)
  coluna.rotation.x = Math.PI / 2
  coluna.position.z = -0.14
  volante.add(coluna)

  // ALVOS DAS MAOS: as 9 e as 3 horas do aro, filhos do pivo — quando o
  // volante gira, a mao do motorista gira junto (o IK resolve o cotovelo).
  const maos = []
  for (const s of [1, -1]) {
    const alvo = new THREE.Object3D()
    alvo.position.set(s * 0.158, 0.005, 0.03)
    alvo.userData.dynamic = true
    volante.add(alvo)
    maos.push(alvo)
  }

  // =========================================================================
  // 7. RODAS — cada uma no seu Group, pras dianteiras poderem estercar
  // =========================================================================
  // O ARO E A PECA MAIS OLHADA DO CARRO, e por isso ele tem material proprio.
  //
  // O dono foi direto: "as rodas nao ficaram boas... na verdade nao e a roda em
  // si, e sim o aro, quero algo um pouco brilhante pra dar destaque". O erro da
  // versao anterior nao era a forma, era o MATERIAL: cromo claro com
  // rugosidade media, numa cena sem environment map, vira plastico branco
  // chapado — claro em todo lugar e sem brilho em lugar nenhum.
  //
  // Metal de verdade se le pelo CONTRASTE: base escura com um risco de luz
  // curto e forte onde a normal aponta pro sol. Isso e metalness quase 1 com
  // rugosidade quase 0. O preco e que a maior parte do aro fica escura — e e
  // justamente isso que faz o risco de luz aparecer.
  // Metalness 0.55 e nao 0.95: sem environment map, metal puro nao tem nada
  // pra refletir e o aro sai PRETO com dois riscos de luz — foi a primeira
  // tentativa, e de longe a roda sumia. Com pouco mais da metade sobra difusa
  // suficiente pra a peca existir na sombra, e a rugosidade baixa mantem o
  // risco de luz curto e forte que da o brilho pedido.
  const aroPolido = solid(0xaab5c0, 0.22, 0.55)
  const aroFundo = solid(0x25282d, 0.6, 0.5)     // o vao entre os raios

  const geoPorca = new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6)

  /**
   * Uma roda: pneu (banda + ombro arredondado + flanco), aro polido de cinco
   * raios com labio, e o cubo com as cinco porcas.
   * `lado` = +1/-1: as pecas do lado de FORA vao para o lado certo em cada
   * roda (nao da pra espelhar com escala negativa — isso inverteria tambem o
   * esterco, que o sistema escreve neste mesmo no).
   */
  function fazerRoda(lado) {
    const r = new THREE.Group()
    // YXZ: o esterco (Y) entra ANTES do giro (X). Com a ordem padrao XYZ o
    // sistema estercaria em torno de um eixo que ja girou junto com a roda.
    r.rotation.order = 'YXZ'

    // --- pneu ---------------------------------------------------------------
    const banda = new THREE.Mesh(
      new THREE.CylinderGeometry(RODA_R, RODA_R, RODA_W * 0.72, 28, 1, true), pneuMat)
    banda.rotation.z = Math.PI / 2
    banda.castShadow = true; banda.receiveShadow = true
    r.add(banda)
    // ombro: dois aneis arredondando a quina da banda. Sem eles o pneu e um
    // cilindro de bordas vivas, que e o que mais denuncia "isto e um cilindro".
    for (const sx of [1, -1]) {
      const ombro = new THREE.Mesh(
        new THREE.TorusGeometry(RODA_R - 0.035, 0.035, 8, 26), pneuMat)
      ombro.rotation.y = Math.PI / 2
      ombro.position.x = sx * RODA_W * 0.36
      ombro.castShadow = true
      r.add(ombro)
    }
    const flanco = cyl(RODA_R * 0.90, RODA_R * 0.90, RODA_W * 0.94, flancoMat, 26)
    flanco.rotation.z = Math.PI / 2
    r.add(flanco)

    // --- aro ----------------------------------------------------------------
    const xFora = lado * RODA_W * 0.44           // face externa da roda
    // fundo escuro: e ele que da PROFUNDIDADE ao vao entre os raios. Sem ele
    // da pra ver a rua atraves da roda, e com um disco claro no lugar a roda
    // vira uma moeda.
    const fundo = cyl(RODA_R * 0.66, RODA_R * 0.66, RODA_W * 0.20, aroFundo, 24)
    fundo.rotation.z = Math.PI / 2
    fundo.position.x = lado * RODA_W * 0.22
    r.add(fundo)
    // barril e labio: o aro visto de lado e um anel brilhante em volta do vao
    const barril = new THREE.Mesh(
      new THREE.CylinderGeometry(RODA_R * 0.70, RODA_R * 0.70, RODA_W * 0.30, 26, 1, true),
      aroPolido)
    barril.rotation.z = Math.PI / 2
    barril.position.x = lado * RODA_W * 0.30
    barril.castShadow = true
    r.add(barril)
    const labio = new THREE.Mesh(
      new THREE.TorusGeometry(RODA_R * 0.70, 0.026, 8, 28), aroPolido)
    labio.rotation.y = Math.PI / 2
    labio.position.x = xFora
    labio.castShadow = true
    r.add(labio)

    // --- cinco raios --------------------------------------------------------
    // ATENCAO A ORIENTACAO. A roda vive no plano YZ (o eixo dela e o X), entao
    // um raio no angulo `a` aponta para (0, cos a, sin a) — e girar em X por
    // `a` e exatamente o que leva o +Y do cilindro para essa direcao. A versao
    // anterior girava por -a com a posicao em (sin a, cos a): os raios ficavam
    // tortos em relacao ao proprio lugar, e a roda lia como cinco chapas
    // desencontradas em vez de uma estrela.
    //
    // O raio e um cilindro de QUATRO lados (uma cunha) e nao uma caixa: assim
    // ele AFINA do cubo para o labio, que e o que separa roda de liga de
    // grade de ventilador. O giro de 45 graus no proprio eixo poe as faces
    // chatas viradas para frente.
    const rCubo = 0.058, rLabio = RODA_R * 0.685
    const rMeio = (rCubo + rLabio) / 2
    // A ponta e larga de proposito: com ela fina o raio virava uma agulha que
    // morria antes de encostar no labio, e a roda ficava com um vao preto entre
    // a estrela e o aro. Ela tem que ENTRAR no labio.
    const geoRaio = new THREE.CylinderGeometry(
      0.048, 0.056, rLabio - rCubo + 0.075, 4)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const p = new THREE.Mesh(geoRaio, aroPolido)
      p.position.set(xFora - lado * 0.016, Math.cos(a) * rMeio, Math.sin(a) * rMeio)
      p.rotation.set(a, Math.PI / 4, 0)
      p.scale.x = 0.55            // achata o raio contra o plano da roda
      p.castShadow = true
      r.add(p)
    }

    // --- cubo e porcas ------------------------------------------------------
    const cubo = cyl(rCubo, rCubo * 0.88, RODA_W * 0.22, aroPolido, 18)
    cubo.rotation.z = Math.PI / 2
    cubo.position.x = xFora - lado * 0.008
    cubo.castShadow = true
    r.add(cubo)
    const capa = cyl(0.026, 0.026, RODA_W * 0.05, cromoEsc, 14)
    capa.rotation.z = Math.PI / 2
    capa.position.x = xFora + lado * 0.012
    r.add(capa)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.63
      const porca = new THREE.Mesh(geoPorca, cromoEsc)
      porca.rotation.z = Math.PI / 2
      porca.position.set(xFora + lado * 0.010, Math.cos(a) * 0.040, Math.sin(a) * 0.040)
      r.add(porca)
    }
    return r
  }

  const rodas = []
  for (const [z, dianteira] of [[EIXO_F, true], [EIXO_T, false]]) {
    for (const s of [1, -1]) {
      // pivo no centro do cubo: quem estercar o pai gira a roda no lugar certo
      const pivo = new THREE.Group()
      pivo.position.set(s * RODA_X, RODA_R, z)
      grupo.add(pivo)
      const roda = fazerRoda(s)
      pivo.add(roda)
      // A roda gira e esterca, mas POR DENTRO ela e rigida: banda, flanco, aro,
      // raios e calota andam juntos. Entao o forno funde as pecas em tres
      // (uma por material) e o no `roda` continua sendo o que recebe
      // rotation.x/.y do sistema de veiculos.
      bakeStatic(roda)
      // marca DEPOIS do proprio forno e ANTES do forno da carroceria: e assim
      // que bakeStatic sabe que esta subarvore nao pode ser fundida no corpo
      roda.userData.dynamic = true
      rodas.push({ mesh: roda, dianteira, raio: RODA_R })
    }
  }

  // =========================================================================
  // 8. ASSENTO, PILOTO E MATERIAIS EXPOSTOS
  // =========================================================================
  const assento = new THREE.Object3D()
  assento.position.set(ASSENTO_X, 0.52, -0.32)
  // O assento nao e mesh: sem esta marca o forno o varreria junto com os grupos
  // vazios e o motorista perderia o lugar onde senta. Ele mora na CARROCERIA:
  // assim o motorista mergulha e rola junto com o carro, e nao flutua parado
  // dentro de uma carroceria que se mexe.
  assento.userData.dynamic = true
  carroceria.add(assento)

  grupo.userData.luzesFreio = [luzFreioE, luzFreioD]
  grupo.userData.farois = [farolMat]
  grupo.userData.carroceria = carroceria
  grupo.userData.volante = volante
  grupo.userData.voltaVolante = 2.4      // quantas voltas de volante por rad de esterco
  grupo.userData.piloto = {
    maos: [maos[0], maos[1]],            // [0] e o lado +X, como em character.js
    tronco: 0.10,                        // so um tico pra frente: e carro, nao moto
    cotovelo: 0.45,
  }

  // FORNO. A carroceria primeiro (por dentro dela so o volante e os alvos das
  // maos se mexem, e ja estao marcados), e depois o grupo — que preserva a
  // carroceria inteira e as quatro rodas.
  bakeStatic(carroceria)
  carroceria.userData.dynamic = true
  bakeStatic(grupo)

  return { grupo, assento, rodas, config: 'carro' }
}
