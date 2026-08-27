import * as THREE from 'three'
import { solid, box, cyl, sphere, roundedBox } from '../world/materials.js'

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
// A caixaria de vidro (greenhouse) e VAZADA de proposito (colunas + teto +
// vidros) e nao um bloco macico: o motorista precisa aparecer la dentro.
// ---------------------------------------------------------------------------

// --- as medidas, num lugar so ----------------------------------------------
const LARG = 1.9          // largura total (X)
const RODA_R = 0.34       // raio do pneu
const RODA_W = 0.28       // largura do pneu
const RODA_X = 0.80       // centro da roda em X (borda do pneu quase rente a lataria)
const EIXO_F = 1.40       // eixo dianteiro em Z
const EIXO_T = -1.42      // eixo traseiro em Z
const ARCO_R = 0.46       // raio do recorte do para-lama (folga de 12 cm sobre o pneu)
const CINTA = 0.97        // linha de cintura: onde a lataria acaba e o vidro comeca
const TETO = 1.38         // topo do teto
const NARIZ = 2.30        // Z do bico
const CAUDA = -2.30       // Z da traseira  (4.6 m de ponta a ponta)

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

  // --- materiais ------------------------------------------------------------
  // Preto BRILHANTE: roughness baixa pro sol deixar um risco de luz na lataria.
  // metalness so 0.3 porque a cena nao tem environment map — metal alto sem
  // reflexo pra refletir vira um borrao preto morto.
  const pintura = solid(0x26262e, 0.32, 0.18)
  const cromo = solid(0xccd3da, 0.22, 0.32)
  const pretoFosco = solid(0x0e0e11, 0.92, 0.0)
  const pneuMat = solid(0x16161a, 0.95, 0.0)
  const flancoMat = solid(0x101013, 0.88, 0.0)
  const couro = solid(0x2a2024, 0.7, 0.0)
  const vidro = new THREE.MeshStandardMaterial({
    color: 0x141c22, roughness: 0.06, metalness: 0.2,
    emissive: 0x4a6a82, emissiveIntensity: 0.22,
    transparent: true, opacity: 0.86,
  })

  // Estes DOIS sao instancias novas, fora do cache de solid(): o sistema vai
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
  // 1. LATARIA — perfil de lado extrudado na largura
  // =========================================================================
  const perfil = new THREE.Shape()
  perfil.moveTo(-2.18, 0.34)                                  // saia traseira
  perfil.lineTo(-1.88, 0.30)
  perfil.lineTo(-1.88, RODA_R)
  perfil.absarc(EIXO_T, RODA_R, ARCO_R, Math.PI, 0, true)     // arco da roda traseira
  perfil.lineTo(-0.90, 0.26)
  perfil.lineTo(0.90, 0.26)                                   // soleira baixa entre os eixos
  perfil.lineTo(0.94, RODA_R)
  perfil.absarc(EIXO_F, RODA_R, ARCO_R, Math.PI, 0, true)     // arco da roda dianteira
  perfil.lineTo(2.10, 0.30)
  perfil.lineTo(2.26, 0.34)
  perfil.lineTo(NARIZ, 0.62)                                  // face da grade
  perfil.lineTo(2.28, 0.90)
  perfil.quadraticCurveTo(2.24, 1.00, 2.04, 1.01)             // quina arredondada do capo
  perfil.lineTo(0.66, 1.03)                                   // CAPO LONGO: 1.4 m de chapa
  perfil.lineTo(0.50, CINTA + 0.02)                           // base do para-brisa
  perfil.lineTo(-1.46, CINTA)                                 // cintura reta das portas
  perfil.lineTo(-1.74, CINTA + 0.02)                          // levantada da tampa
  perfil.lineTo(-2.20, 0.95)                                  // traseira CURTA
  perfil.lineTo(CAUDA, 0.80)
  perfil.lineTo(-2.26, 0.42)
  perfil.closePath()

  // ATENCAO: bevelSize empurra o contorno PRA FORA. Fica pequeno (2 cm) pra o
  // perfil desenhado acima valer de verdade e nada colado na lataria (grade,
  // lanterna, friso) acabar engolido. bevelThickness e o arredondamento no
  // eixo X, e ele que fecha a largura: 1.80 + 2 x 0.05 = 1.90.
  const BEV_X = 0.05, BEV_R = 0.02
  const geoCorpo = new THREE.ExtrudeGeometry(perfil, {
    depth: LARG - BEV_X * 2, bevelEnabled: true,
    bevelThickness: BEV_X, bevelSize: BEV_R, bevelSegments: 2, curveSegments: 10,
  })
  geoCorpo.rotateY(-Math.PI / 2)
  geoCorpo.translate((LARG - BEV_X * 2) / 2, 0, 0)
  const corpo = new THREE.Mesh(geoCorpo, pintura)
  corpo.castShadow = true; corpo.receiveShadow = true
  grupo.add(corpo)

  // assoalho: sem ele da pra ver a rua por baixo do carro, por entre os arcos
  grupo.add(box(1.74, 0.05, 3.5, pretoFosco, 0, 0.27, -0.1))

  // --- para-lamas marcados: um lábio de arco por roda -----------------------
  // Meia-rosca girada pro plano ZY. E o que "sela" a roda na lataria.
  const geoArco = new THREE.TorusGeometry(ARCO_R + 0.005, 0.045, 8, 16, Math.PI)
  for (const z of [EIXO_F, EIXO_T]) {
    for (const s of [1, -1]) {
      const a = new THREE.Mesh(geoArco, pintura)
      a.rotation.y = -Math.PI / 2
      a.position.set(s * (LARG / 2 - 0.02), RODA_R, z)
      a.castShadow = true; a.receiveShadow = true
      grupo.add(a)
    }
  }

  // --- capo: duas lombadas + rebaixo ---------------------------------------
  // O rebaixo (painel fosco no meio) e o que separa "capo" de "para-lama":
  // sem ele o topo da frente e uma mesa lisa de 1.9 m.
  grupo.add(box(0.94, 0.02, 1.32, solid(0x0d0d11, 0.35, 0.2), 0, 1.055, 1.34))
  for (const s of [1, -1]) {
    const lomb = roundedBox(0.28, 0.075, 1.26, 0.032, pintura)
    lomb.position.set(s * 0.29, 1.055, 1.34)
    grupo.add(lomb)
  }
  // tomada de ar entre as duas lombadas
  grupo.add(box(0.30, 0.045, 0.34, pretoFosco, 0, 1.068, 1.02))

  // =========================================================================
  // 2. FRENTE — grade vertical cromada, farois redondos, para-choque
  // =========================================================================
  const zF = NARIZ + 0.03
  grupo.add(box(1.10, 0.25, 0.06, pretoFosco, 0, 0.76, zF - 0.04))   // fundo escuro
  const geoLamina = new THREE.BoxGeometry(0.014, 0.21, 0.045)
  for (let i = 0; i < 17; i++) {
    const x = -0.48 + (i / 16) * 0.96
    const l = new THREE.Mesh(geoLamina, cromo)
    l.position.set(x, 0.76, zF - 0.008)
    l.castShadow = true; l.receiveShadow = true
    grupo.add(l)
  }
  // moldura da grade
  grupo.add(box(1.16, 0.035, 0.07, cromo, 0, 0.895, zF))
  grupo.add(box(1.16, 0.035, 0.07, cromo, 0, 0.625, zF))
  for (const s of [1, -1]) grupo.add(box(0.035, 0.30, 0.07, cromo, s * 0.565, 0.76, zF))

  // farois redondos: aro cromado + lente
  for (const s of [1, -1]) {
    const aro = cyl(0.132, 0.132, 0.07, cromo, 20)
    aro.rotation.x = Math.PI / 2
    aro.position.set(s * 0.71, 0.775, zF - 0.025)
    grupo.add(aro)
    const lente = cyl(0.104, 0.104, 0.075, farolMat, 20)
    lente.rotation.x = Math.PI / 2
    lente.position.set(s * 0.71, 0.775, zF - 0.012)
    grupo.add(lente)
  }
  // para-choque dianteiro + duas "guias" pretas nas pontas
  const pcF = roundedBox(1.80, 0.13, 0.15, 0.055, cromo)
  pcF.position.set(0, 0.50, NARIZ - 0.02)
  grupo.add(pcF)

  // =========================================================================
  // 3. TRASEIRA — lanternas, para-choque, escapes
  // =========================================================================
  const zT = CAUDA - 0.035
  grupo.add(box(1.66, 0.30, 0.06, pretoFosco, 0, 0.72, zT + 0.035))
  const lanternas = [luzFreioE, luzFreioD]
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1
    const lt = box(0.62, 0.18, 0.06, lanternas[i], s * 0.44, 0.72, zT)
    grupo.add(lt)
    grupo.add(box(0.68, 0.04, 0.07, cromo, s * 0.44, 0.825, zT))
    grupo.add(box(0.68, 0.04, 0.07, cromo, s * 0.44, 0.615, zT))
  }
  const pcT = roundedBox(1.80, 0.13, 0.15, 0.055, cromo)
  pcT.position.set(0, 0.50, CAUDA + 0.03)
  grupo.add(pcT)
  // saidas de escape: ponteira cromada com o miolo escuro
  for (const s of [1, -1]) {
    const p = cyl(0.055, 0.055, 0.16, cromo, 12)
    p.rotation.x = Math.PI / 2
    p.position.set(s * 0.44, 0.38, CAUDA + 0.06)
    grupo.add(p)
    const miolo = cyl(0.04, 0.04, 0.04, pretoFosco, 12)
    miolo.rotation.x = Math.PI / 2
    miolo.position.set(s * 0.44, 0.38, CAUDA - 0.005)
    grupo.add(miolo)
  }

  // =========================================================================
  // 4. CAIXARIA DE VIDRO — colunas, teto, vidros escuros com caixilho
  // =========================================================================
  const XP = 0.735                 // plano das colunas e do vidro lateral
  const zPB = 0.50, zTF = -0.06    // para-brisa: base e topo
  const zTR = -0.94, zVT = -1.44   // vidro traseiro: topo e base

  // teto baixo e recuado
  const teto = roundedBox(1.58, 0.075, 0.94, 0.05, pintura)
  teto.position.set(0, TETO - 0.05, (zTF + zTR) / 2)
  grupo.add(teto)

  // O vao lateral e um so (cupe 2 portas, sem coluna B). Estas quatro quinas
  // sao o vidro; a moldura e o MESMO poligono 4 cm maior, com o vidro de furo.
  const vao = [[0.44, 1.00], [-0.06, 1.30], [-0.90, 1.30], [-1.40, 1.00]]
  const vaoFolga = [[0.45, 0.99], [-0.06, 1.31], [-0.90, 1.31], [-1.41, 0.99]]
  for (const s of [1, -1]) {
    grupo.add(painel(pintura, 0.07, 0.075, zPB, CINTA + 0.02, zTF, TETO - 0.08, s * XP))  // coluna A
    grupo.add(painel(pintura, 0.07, 0.075, zTR, TETO - 0.08, zVT, CINTA, s * XP))         // coluna C
    // caixilho = quatro barras nas quatro arestas do vao. Sai mais barato e
    // mais confiavel que extrudar um poligono com furo.
    for (let i = 0; i < 4; i++) {
      const a = vao[i], b = vao[(i + 1) % 4]
      grupo.add(painel(cromo, 0.03, 0.05, a[0], a[1], b[0], b[1], s * (XP + 0.03)))
    }
    const vd = chapaZY(vaoFolga, 0.02, vidro)
    vd.position.x = s * (XP + 0.018)
    grupo.add(vd)
  }

  // para-brisa e vidro traseiro (inclinados, encaixando nas colunas)
  const pb = painel(vidro, 1.50, 0.03, zPB, CINTA + 0.03, zTF, TETO - 0.09)
  grupo.add(pb)
  const vt = painel(vidro, 1.46, 0.03, zTR, TETO - 0.09, zVT, CINTA + 0.02)
  grupo.add(vt)
  // caixilho do para-brisa
  grupo.add(painel(cromo, 1.44, 0.025, zPB + 0.02, CINTA + 0.01, zTF + 0.02, TETO - 0.11))
  grupo.add(painel(cromo, 1.40, 0.025, zTR - 0.02, TETO - 0.11, zVT - 0.02, CINTA))

  // =========================================================================
  // 5. LATERAL — friso, macanetas, retrovisores
  // =========================================================================
  for (const s of [1, -1]) {
    const xl = s * (LARG / 2 + 0.012)
    // friso corrido, so entre os dois arcos (senao ele cruzaria o vao da roda)
    grupo.add(box(0.03, 0.045, 1.86, cromo, xl, 0.60, -0.01))
    grupo.add(box(0.03, 0.03, 0.17, cromo, xl, 0.83, -0.52))          // macaneta
    // retrovisor: haste curta + espelho
    const haste = cyl(0.018, 0.018, 0.10, cromo, 8)
    haste.rotation.z = Math.PI / 2
    haste.position.set(s * (LARG / 2 + 0.04), 0.90, 0.40)
    grupo.add(haste)
    const esp = roundedBox(0.05, 0.11, 0.15, 0.035, pretoFosco)
    esp.position.set(s * (LARG / 2 + 0.10), 0.91, 0.40)
    grupo.add(esp)
    grupo.add(box(0.012, 0.085, 0.115, cromo, s * (LARG / 2 + 0.075), 0.91, 0.40))
  }

  // =========================================================================
  // 6. INTERIOR — da pra ver pelos vidros, entao existe
  // =========================================================================
  grupo.add(box(1.56, 0.24, 0.34, pretoFosco, 0, 0.86, 0.34))            // painel
  grupo.add(box(0.34, 0.30, 1.20, couro, 0, 0.46, -0.30))                // console
  const ASSENTO_X = 0.38   // volante a ESQUERDA do motorista: quem olha pra +Z tem a esquerda em +X
  for (const s of [1, -1]) {
    grupo.add(box(0.52, 0.12, 0.52, couro, s * ASSENTO_X, 0.48, -0.34))  // banco
    const encosto = box(0.52, 0.62, 0.13, couro, s * ASSENTO_X, 0.80, -0.62)
    encosto.rotation.x = -0.16
    grupo.add(encosto)
  }
  const volante = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.022, 8, 20), pretoFosco)
  volante.position.set(ASSENTO_X, 0.83, 0.10)
  volante.rotation.x = 1.16
  volante.castShadow = true
  grupo.add(volante)
  const col = cyl(0.028, 0.028, 0.24, pretoFosco, 8)
  col.position.set(ASSENTO_X, 0.77, 0.20)
  col.rotation.x = Math.PI / 2 - 0.4
  grupo.add(col)

  // =========================================================================
  // 7. RODAS — cada uma no seu Group, pras dianteiras poderem estercar
  // =========================================================================
  const geoFuro = new THREE.CylinderGeometry(0.052, 0.052, RODA_W * 1.05, 10)
  function fazerRoda() {
    const r = new THREE.Group()
    // YXZ: o esterco (Y) entra ANTES do giro (X). Com a ordem padrao XYZ o
    // sistema estercaria em torno de um eixo que ja girou junto com a roda.
    r.rotation.order = 'YXZ'
    const banda = cyl(RODA_R, RODA_R, RODA_W * 0.74, pneuMat, 22)
    banda.rotation.z = Math.PI / 2
    r.add(banda)
    const flanco = cyl(RODA_R * 0.94, RODA_R * 0.94, RODA_W, flancoMat, 22)
    flanco.rotation.z = Math.PI / 2
    r.add(flanco)
    const aro = cyl(RODA_R * 0.64, RODA_R * 0.64, RODA_W * 1.01, cromo, 20)
    aro.rotation.z = Math.PI / 2
    r.add(aro)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const f = new THREE.Mesh(geoFuro, pretoFosco)
      f.rotation.z = Math.PI / 2
      f.position.set(0, Math.cos(a) * 0.135, Math.sin(a) * 0.135)
      r.add(f)
    }
    const cubo = sphere(0.062, cromo, 12)
    cubo.scale.x = 0.6
    r.add(cubo)
    return r
  }

  const rodas = []
  for (const [z, dianteira] of [[EIXO_F, true], [EIXO_T, false]]) {
    for (const s of [1, -1]) {
      // pivo no centro do cubo: quem estercar o pai gira a roda no lugar certo
      const pivo = new THREE.Group()
      pivo.position.set(s * RODA_X, RODA_R, z)
      grupo.add(pivo)
      const roda = fazerRoda()
      pivo.add(roda)
      rodas.push({ mesh: roda, dianteira, raio: RODA_R })
    }
  }

  // =========================================================================
  // 8. ASSENTO e materiais expostos
  // =========================================================================
  const assento = new THREE.Object3D()
  assento.position.set(ASSENTO_X, 0.52, -0.36)
  grupo.add(assento)

  grupo.userData.luzesFreio = [luzFreioE, luzFreioD]
  grupo.userData.farois = [farolMat]

  return { grupo, assento, rodas, config: 'carro' }
}
