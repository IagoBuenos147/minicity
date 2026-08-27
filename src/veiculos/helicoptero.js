import * as THREE from 'three'
import { solid, box, cyl, sphere, roundedBox, PALETTE } from '../world/materials.js'
import { COR_VERDE, COR_FUNDO, COR_NUCLEO, texturaFagulha } from '../poder/efeitos.js'

// ---------------------------------------------------------------------------
// O HELICOPTERO — o veiculo que o anel verde MONTA.
//
// Duas coisas moram aqui:
//   construir()   -> { grupo, assento, rodas, config }   (o contrato de VEICULOS.md)
//   criarMontagem -> o espetaculo de peca por peca chegando e se encaixando
//
// O verde e o MESMO do anel: COR_VERDE vem de poder/efeitos.js, que e onde o
// poder define a cor. Copiar o numero pra ca seria criar uma segunda verdade —
// mudou la, tinha que lembrar de mudar aqui.
//
// A montagem e 100% LOCAL: nenhuma linha deste arquivo fala com a rede. Quem
// avisa o servidor que existe um helicoptero novo e o sistema de veiculos.
//
// Frente = +Z, origem no chao (contrato). Comprimento ~6.9 m, rotor ~8 m.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

// --- medidas (metros) -------------------------------------------------------
// A proporcao e o que faz parecer helicoptero e nao brinquedo: cabine curta e
// alta na frente, cauda LONGA e fina atras, rotor bem acima da cabine.
const CORPO_Y = 1.28              // altura do centro da cabine
const CORPO_Z = -0.15             // a cabine fica um pouco atras do meio
const CORPO_L = 1.50              // largura da cabine
const CORPO_H = 1.32              // altura da cabine
const CORPO_C = 2.00              // comprimento da cabine (o resto e bolha e cauda)
const PISO_Y = 0.64               // piso da cabine
const PATIM_Y = 0.10              // altura do eixo dos patins
const BOOM_Y = 1.52               // altura do tubo de cauda
const BOOM_Z0 = -1.75             // onde o cone vira tubo
const BOOM_Z1 = -4.75             // ponta da cauda  (nariz +2.15 => ~6.9 m)
const ROTOR_Y = 2.88              // plano do rotor principal
const ROTOR_Z = 0.00
const PA_COMP = 3.62              // comprimento de cada pa
const PA_RAIZ = 0.32              // onde a pa comeca (no cubo) => diametro ~7.9
const CAUDA_R = 0.50              // raio do rotor de cauda
const LADO = 0.75                 // meia largura da cabine: onde mora a lateral
const BANCO_Y = 1.14              // altura do assento do banco (= quadril do piloto)

// ---------------------------------------------------------------------------
// helpers locais
// ---------------------------------------------------------------------------
/** Cilindro entre dois pontos: e o jeito honesto de fazer tubo de patim. */
function tubo(mat, ax, ay, az, bx, by, bz, r, seg) {
  const a = new THREE.Vector3(ax, ay, az)
  const d = new THREE.Vector3(bx, by, bz).sub(a)
  const h = d.length()
  const m = cyl(r, r, h, mat, seg || 10)
  m.position.copy(a).addScaledVector(d, 0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  return m
}

/**
 * roundedBox() de materials.js entrega uma caixa MAIOR do que a pedida: o bevel
 * do ExtrudeGeometry empurra o contorno pra fora em bevelSize (= r*0.3) de cada
 * lado. Medido com Box3: roundedBox(1.50, 1.32, 2.0, 0.26) da 1.656 x 1.476.
 * Aqui as janelas e os batentes precisam encostar EXATAMENTE na lateral, entao
 * descontamos antes de pedir e a caixa sai do tamanho que o nome diz.
 */
function casca(w, h, d, r, mat, seg) {
  return roundedBox(w - r * 0.6, h - r * 0.6, d, r, mat, seg)
}

/** Pseudo-aleatorio ESTAVEL: a mesma peca vem sempre da mesma direcao. */
function acaso(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

// ---------------------------------------------------------------------------
// CONSTRUIR
// ---------------------------------------------------------------------------
export function construir() {
  const grupo = new THREE.Group()
  grupo.name = 'helicoptero'

  // --- materiais ------------------------------------------------------------
  // O verde do anel como pintura, com uma emissao BEM baixa: sem ela o tom
  // fica lavado ao sol e deixa de parecer a mesma coisa que o anel.
  const matVerde = solid(COR_VERDE, 0.44, 0.22, { emissive: COR_VERDE, emissiveIntensity: 0.1 })
  const matVerdeEsc = solid(COR_FUNDO, 0.5, 0.25)
  const matEscuro = solid(0x1b1e21, 0.62, 0.35)
  const matMetal = solid(PALETTE.metal, 0.35, 0.85)
  // O interior nao pode ser preto: atras do vidro fume ele viraria um disco
  // preto e a bolha deixaria de parecer bolha. Cinza medio ja le como cabine.
  const matInterior = solid(0x49535a, 0.72, 0.1)
  // vidro fume: FrontSide (bolha vista de fora) e depthWrite false, senao o
  // vidro apagaria o que esta dentro da cabine.
  const matVidro = solid(0x0e1a16, 0.08, 0.15, {
    transparent: true, opacity: 0.55, depthWrite: false, side: THREE.FrontSide,
  })
  const matLuzV = solid(0x0d2a19, 0.4, 0.1, { emissive: 0x2bff88, emissiveIntensity: 3 })
  const matLuzR = solid(0x2a0d0d, 0.4, 0.1, { emissive: 0xff3b3b, emissiveIntensity: 3 })

  // =========================================================================
  // PECA 1 — PATINS
  // =========================================================================
  const pPatins = new THREE.Group(); pPatins.name = 'patins'
  for (const sx of [-1, 1]) {
    const X = sx * 0.92
    pPatins.add(tubo(matMetal, X, PATIM_Y, -1.35, X, PATIM_Y, 1.55, 0.065, 12))
    // ponta virada pra cima: o patim so parece patim com essa curva na frente
    pPatins.add(tubo(matMetal, X, PATIM_Y, 1.5, X, 0.34, 2.0, 0.058, 10))
    // duas pernas por lado, do tubo ate a barriga (arqueadas pra dentro)
    pPatins.add(tubo(matEscuro, X, PATIM_Y + 0.03, 0.85, sx * 0.46, PISO_Y, 0.7, 0.055, 8))
    pPatins.add(tubo(matEscuro, X, PATIM_Y + 0.03, -0.85, sx * 0.46, PISO_Y, -0.7, 0.055, 8))
  }
  // travessas que ligam os dois lados por baixo
  pPatins.add(tubo(matEscuro, -0.46, PISO_Y, 0.7, 0.46, PISO_Y, 0.7, 0.06, 8))
  pPatins.add(tubo(matEscuro, -0.46, PISO_Y, -0.7, 0.46, PISO_Y, -0.7, 0.06, 8))
  grupo.add(pPatins)

  // =========================================================================
  // PECA 2 — CORPO
  // =========================================================================
  const pCorpo = new THREE.Group(); pCorpo.name = 'corpo'
  // Cantos redondos SEM virar capsula: r pequeno em relacao a largura. Com
  // r=0.44 (metade da meia-largura) a fuselagem virava um comprimido verde.
  const casco = casca(CORPO_L, CORPO_H, CORPO_C, 0.26, matVerde, 4)
  casco.position.set(0, CORPO_Y, CORPO_Z)
  pCorpo.add(casco)

  // barriga: fecha por baixo da bolha, do piso pra frente. E ela que da o
  // "queixo" do helicoptero, senao o vidro flutuaria solto no ar.
  const queixo = casca(1.24, 0.28, 1.55, 0.16, matVerde, 3)
  queixo.position.set(0, PISO_Y - 0.06, 0.92)
  queixo.rotation.x = -0.07
  pCorpo.add(queixo)
  const barriga = casca(1.34, 0.3, 1.9, 0.16, matVerdeEsc, 3)
  barriga.position.set(0, PISO_Y - 0.02, CORPO_Z)
  pCorpo.add(barriga)

  // afunilamento pra cauda: cone deitado (rotation.x = PI/2 poe o topo em +Z)
  const cone = cyl(0.62, 0.19, 1.5, matVerde, 18)
  cone.rotation.x = Math.PI / 2
  cone.position.set(0, BOOM_Y - 0.06, -1.05)
  pCorpo.add(cone)

  // faixa escura na lateral: quebra o verde e da escala ao bicho
  for (const sx of [-1, 1]) {
    const faixa = box(0.03, 0.13, 2.6, matVerdeEsc, sx * (LADO + 0.008), PISO_Y + 0.26, CORPO_Z + 0.35)
    pCorpo.add(faixa)
  }

  // luzes de navegacao: vermelha a bombordo, verde a boreste (regra de voo)
  const luzE = sphere(0.05, matLuzR, 10); luzE.position.set(-0.7, PISO_Y + 0.2, 0.9)
  const luzD = sphere(0.05, matLuzV, 10); luzD.position.set(0.7, PISO_Y + 0.2, 0.9)
  luzE.castShadow = false; luzD.castShadow = false
  pCorpo.add(luzE, luzD)
  grupo.add(pCorpo)

  // =========================================================================
  // PECA 3 — CAUDA
  // =========================================================================
  const pCauda = new THREE.Group(); pCauda.name = 'cauda'
  const boom = cyl(0.18, 0.13, BOOM_Z0 - BOOM_Z1, matVerde, 16)
  boom.rotation.x = Math.PI / 2
  boom.position.set(0, BOOM_Y, (BOOM_Z0 + BOOM_Z1) / 2)
  pCauda.add(boom)
  // carenagem por cima do tubo (onde passa o eixo do rotor de cauda)
  const carena = box(0.14, 0.12, 2.7, matVerdeEsc, 0, BOOM_Y + 0.13, -3.3)
  pCauda.add(carena)
  grupo.add(pCauda)

  // =========================================================================
  // PECA 4 — ESTABILIZADOR (+ rotor de cauda)
  // =========================================================================
  const pEstab = new THREE.Group(); pEstab.name = 'estabilizador'
  const estabH = box(1.5, 0.06, 0.42, matVerde, 0, BOOM_Y + 0.02, -3.7)
  pEstab.add(estabH)
  for (const sx of [-1, 1]) {
    const ponta = box(0.055, 0.3, 0.34, matVerdeEsc, sx * 0.71, BOOM_Y + 0.16, -3.7)
    pEstab.add(ponta)
  }
  // deriva vertical, inclinada pra tras
  const deriva = casca(0.12, 1.1, 0.8, 0.16, matVerde, 3)
  deriva.position.set(0, BOOM_Y + 0.6, -4.42)
  deriva.rotation.x = -0.24
  pEstab.add(deriva)
  const derivaBaixa = casca(0.1, 0.5, 0.4, 0.11, matVerdeEsc, 3)
  derivaBaixa.position.set(0, BOOM_Y - 0.3, -4.5)
  derivaBaixa.rotation.x = 0.2
  pEstab.add(derivaBaixa)

  // rotor de cauda: gira no eixo X, entao quem anima soma em rotation.x
  const rotorCauda = new THREE.Group()
  rotorCauda.position.set(0.19, BOOM_Y + 0.5, -4.36)
  const cuboC = cyl(0.08, 0.08, 0.14, matEscuro, 10)
  cuboC.rotation.z = Math.PI / 2
  rotorCauda.add(cuboC)
  for (let i = 0; i < 2; i++) {
    const pa = box(0.035, CAUDA_R * 2, 0.11, matEscuro, 0, 0, 0)
    pa.rotation.x = i * Math.PI / 2
    rotorCauda.add(pa)
  }
  pEstab.add(rotorCauda)
  grupo.add(pEstab)

  // =========================================================================
  // PECA 5 — CABINE (estrutura, interior e capo do motor)
  // =========================================================================
  const pCabine = new THREE.Group(); pCabine.name = 'cabine'
  // o piso avanca por baixo da bolha: e o chao que o piloto ve entre os pes
  const piso = box(1.3, 0.06, 2.5, matInterior, 0, PISO_Y + 0.04, 0.3)
  pCabine.add(piso)
  // Dois bancos, com o assento em BANCO_Y. Essa altura nao e estetica: o
  // sistema poe o quadril do boneco ai (ancora 'quadril') e a animacao dobra as
  // pernas, entao os pes caem por volta de BANCO_Y - 0.44 — que e onde esta o
  // piso. Baixar o banco enfiaria os pes dentro da barriga.
  for (const sx of [-1, 1]) {
    const banco = box(0.54, 0.12, 0.56, matInterior, sx * 0.35, BANCO_Y - 0.06, -0.02)
    const encosto = box(0.54, 0.62, 0.11, matInterior, sx * 0.35, BANCO_Y + 0.31, -0.32)
    encosto.rotation.x = -0.13
    pCabine.add(banco, encosto)
  }
  // painel de instrumentos, na boca da bolha
  const painel = box(1.06, 0.38, 0.18, matInterior, 0, 1.24, 1.12)
  painel.rotation.x = 0.42
  pCabine.add(painel)
  const consoleC = box(0.34, 0.46, 0.7, matInterior, 0, 0.94, 0.86)
  pCabine.add(consoleC)
  // manche
  const manche = cyl(0.024, 0.024, 0.5, matEscuro, 6)
  manche.position.set(0.35, 1.26, 0.36)
  manche.rotation.x = 0.28
  pCabine.add(manche)
  // batentes das portas: tubos escuros contornando o vao
  for (const sx of [-1, 1]) {
    const X = sx * (LADO + 0.03)
    pCabine.add(tubo(matEscuro, X, 0.72, 0.84, X, 1.84, 0.7, 0.028, 8))
    pCabine.add(tubo(matEscuro, X, 0.72, -0.98, X, 1.88, -0.93, 0.028, 8))
    pCabine.add(tubo(matEscuro, X, 1.84, 0.7, X, 1.88, -0.93, 0.028, 8))
    pCabine.add(tubo(matEscuro, X, 0.72, 0.84, X, 0.72, -0.98, 0.028, 8))
  }
  // capo do motor, logo atras do mastro
  const capo = casca(1.06, 0.56, 1.35, 0.2, matVerdeEsc, 3)
  capo.position.set(0, 2.0, -0.62)
  pCabine.add(capo)
  const grelha = box(0.56, 0.18, 0.06, matEscuro, 0, 2.02, 0.04)
  pCabine.add(grelha)
  for (const sx of [-1, 1]) {
    const escape = cyl(0.08, 0.095, 0.34, matEscuro, 10)
    escape.rotation.x = Math.PI / 2 - 0.25
    escape.position.set(sx * 0.34, 1.86, -1.34)
    pCabine.add(escape)
  }
  grupo.add(pCabine)

  // =========================================================================
  // PECA 6 — BOLHA DE VIDRO
  // =========================================================================
  const pBolha = new THREE.Group(); pBolha.name = 'bolha'
  // A bolha e o NARIZ INTEIRO: a fuselagem opaca para em z=0.85 e daqui pra
  // frente so tem vidro. Era isso que faltava — com a caixa verde por baixo do
  // vidro nao se via bolha nenhuma, so um verde mais claro.
  // O vidro e as barras dele vivem num grupo ESCALADO: assim as barras sao
  // toros de raio 1 (que assentam exatamente na esfera de raio 1) e so depois
  // sao esticadas junto com a bolha. Escalar cada barra sozinha nao gruda.
  const bolhaG = new THREE.Group()
  bolhaG.position.set(0, 1.14, 1.04)
  bolhaG.scale.set(0.79, 0.72, 1.16)
  const bolha = sphere(1, matVidro, 28)
  bolha.castShadow = false          // vidro projetando sombra chapada estraga tudo
  bolha.receiveShadow = false
  bolhaG.add(bolha)
  const geoRib = new THREE.TorusGeometry(1, 0.022, 6, 30)
  const ribMeio = new THREE.Mesh(geoRib, matEscuro)
  ribMeio.rotation.y = Math.PI / 2   // meridiano: passa por cima do nariz
  ribMeio.castShadow = false
  bolhaG.add(ribMeio)
  const ribFrente = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.016, 6, 26), matEscuro)
  ribFrente.position.z = 0.72        // 0.69 = raio do paralelo da esfera em z=0.72
  ribFrente.castShadow = false
  bolhaG.add(ribFrente)
  pBolha.add(bolhaG)
  // Janelas das portas. Vidro sozinho na lateral SUMIA: transparente por cima
  // de uma parede verde da... verde. Entao vai um painel ESCURO afundado atras
  // (o "buraco" da janela) e o vidro por cima dele.
  for (const sx of [-1, 1]) {
    // o "vao" e a PAREDE INTERNA da cabine vista pela janela: no mesmo cinza
    // dos bancos, senao a janela vira um buraco preto recortado na lataria
    const vao = box(0.02, 0.6, 1.4, matInterior, sx * (LADO + 0.008), 1.44, -0.12)
    vao.castShadow = false
    const jan = box(0.03, 0.58, 1.38, matVidro, sx * (LADO + 0.026), 1.44, -0.12)
    jan.castShadow = false; jan.receiveShadow = false
    pBolha.add(vao, jan)
  }
  // aro que costura a bolha na fuselagem
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.03, 8, 30), matEscuro)
  aro.scale.set(1.0, 0.85, 1.0)
  aro.position.set(0, 1.2, 0.84)
  aro.castShadow = false
  pBolha.add(aro)
  grupo.add(pBolha)

  // =========================================================================
  // PECA 7 — MASTRO
  // =========================================================================
  const pMastro = new THREE.Group(); pMastro.name = 'mastro'
  const mastro = cyl(0.085, 0.1, 0.86, matMetal, 12)
  mastro.position.set(0, ROTOR_Y - 0.44, ROTOR_Z)
  pMastro.add(mastro)
  const prato = cyl(0.26, 0.26, 0.07, matEscuro, 16)
  prato.position.set(0, ROTOR_Y - 0.34, ROTOR_Z)
  pMastro.add(prato)
  // hastes de comando: sao elas que dizem "isto e uma maquina", nao um poste
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4
    pMastro.add(tubo(matMetal,
      Math.cos(a) * 0.22, ROTOR_Y - 0.32, ROTOR_Z + Math.sin(a) * 0.22,
      Math.cos(a) * 0.24, ROTOR_Y - 0.03, ROTOR_Z + Math.sin(a) * 0.24, 0.016, 6))
  }
  grupo.add(pMastro)

  // =========================================================================
  // PECA 8 — PAS DO ROTOR
  // =========================================================================
  const pPas = new THREE.Group(); pPas.name = 'pas'
  const rotor = new THREE.Group()               // ESTE gira (rotation.y)
  rotor.position.set(0, ROTOR_Y, ROTOR_Z)
  const cubo = cyl(0.16, 0.19, 0.16, matEscuro, 14)
  rotor.add(cubo)
  const tampa = sphere(0.14, matMetal, 12)
  tampa.position.y = 0.1
  rotor.add(tampa)
  for (let i = 0; i < 3; i++) {
    const braco = new THREE.Group()
    braco.rotation.y = (i / 3) * TAU
    braco.rotation.x = -0.035               // caimento: pa parada nunca fica reta
    const punho = cyl(0.05, 0.05, 0.26, matMetal, 8)
    punho.rotation.x = Math.PI / 2
    punho.position.z = PA_RAIZ * 0.6
    braco.add(punho)
    const pa = box(0.32, 0.045, PA_COMP, matEscuro, 0, 0, PA_RAIZ + PA_COMP / 2)
    braco.add(pa)
    // faixa clara na ponta: o que faz o rotor "aparecer" quando gira
    const ponta = box(0.33, 0.048, 0.34, matVerde, 0, 0, PA_RAIZ + PA_COMP - 0.2)
    braco.add(ponta)
    rotor.add(braco)
  }
  pPas.add(rotor)
  grupo.add(pPas)

  // =========================================================================
  // ASSENTO
  // =========================================================================
  // Contrato do sistema (veiculos.js): `pose` e `ancora` dizem COMO posicionar
  // o boneco. Aqui: sentado, e o ponto marca o QUADRIL (o topo do banco) —
  // quem desce os HIPS_Y ate a raiz e o sistema.
  const assento = new THREE.Object3D()
  assento.position.set(0.35, BANCO_Y, -0.02)
  assento.name = 'assento'
  assento.userData.pose = 'sentado'
  assento.userData.ancora = 'quadril'
  grupo.add(assento)

  const pecas = [pPatins, pCorpo, pCauda, pEstab, pCabine, pBolha, pMastro, pPas]

  grupo.userData.rotor = rotor            // o sistema gira: rotor.rotation.y += ...
  grupo.userData.rotorCauda = rotorCauda  // ... e rotorCauda.rotation.x += ...
  grupo.userData.pecas = pecas            // ordem de montagem (usada por criarMontagem)
  grupo.userData.assento = assento
  grupo.userData.rodas = []
  grupo.userData.config = 'helicoptero'

  return { grupo, assento, rodas: [], config: 'helicoptero' }
}

// ---------------------------------------------------------------------------
// A MONTAGEM
// ---------------------------------------------------------------------------
// Segurar o anel monta o bicho no ar, peca por peca. O sistema so precisa
// empurrar o progresso (0..1) e, no fim, chamar concluir().
//
//   const m = criarMontagem(scene, x, y, z, yaw)
//   m.atualizar(dt, t / MUNDO.HELI_MONTAGEM)
//   const grupoPronto = m.concluir()     // ou m.cancelar()
//
// Tres decisoes que valem o arquivo inteiro:
//
// 1) NENHUMA PointLight. Ligar uma luz nova muda a contagem de luzes da cena e
//    o three RECOMPILA todos os materiais — um engasgo de varios quadros bem no
//    momento que tem que ser bonito. Tudo aqui e emissivo + aditivo.
// 2) Os materiais do helicoptero em montagem sao CLONADOS. Os de materials.js
//    sao cacheados e compartilhados com a cidade inteira: mexer na opacidade
//    deles deixaria as lojas transparentes junto.
// 3) cancelar() e concluir() animam a saida com um rAF PROPRIO. Elas costumam
//    ser a ultima coisa que o sistema chama; se dependessem de mais um
//    atualizar() que nunca vem, as pecas ficariam congeladas na cena.
// ---------------------------------------------------------------------------

const JANELA = 0.30              // fatia do progresso que cada peca leva pra assentar
const N_PART = 120               // particulas convergindo
const CENTRO_Y = 1.5             // pra onde as particulas e o brilho convergem

function agoraMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}

/**
 * Animacao curta que anda sozinha (ver decisao 3). Sem janela — teste headless —
 * executa o ultimo quadro na hora, pra limpeza nunca ficar pendurada.
 */
function animarSozinho(dur, passo) {
  if (typeof requestAnimationFrame !== 'function') { passo(1, dur); return }
  let t = 0
  let ant = agoraMs()
  const quadro = () => {
    const ag = agoraMs()
    const dt = Math.min(0.05, (ag - ant) / 1000)
    ant = ag
    t += dt
    const k = Math.min(1, t / dur)
    passo(k, dt)
    if (k < 1) requestAnimationFrame(quadro)
  }
  requestAnimationFrame(quadro)
}

/** Material aditivo verde padrao dos efeitos daqui (nunca cacheado: cada montagem tem o seu). */
function matAditivo(cor, opacidade, porVertice) {
  // vertexColors entra no CONSTRUTOR: ligar depois obrigaria needsUpdate, e o
  // three recompila o shader do material.
  return new THREE.MeshBasicMaterial({
    color: cor, transparent: true, opacity: opacidade,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, vertexColors: !!porVertice,
  })
}

export function criarMontagem(scene, x, y, z, yaw) {
  const heli = construir()
  const grupo = new THREE.Group()
  grupo.name = 'heli-montagem'
  grupo.position.set(x || 0, y || 0, z || 0)
  grupo.rotation.y = yaw || 0
  grupo.add(heli.grupo)
  scene.add(grupo)

  // Duas listas: o que e EFEITO morre nos dois finais; o que e do helicoptero
  // so morre se a montagem for cancelada — em concluir() ele vai embora vivo
  // junto com o grupo devolvido.
  const descartar = []
  const descartarHeli = []

  // --- pecas: clona material, guarda o estado de repouso ---------------------
  const pecas = heli.grupo.userData.pecas.map((obj, i) => {
    const mats = []
    obj.traverse((o) => {
      if (!o.isMesh || !o.material) return
      const lista = Array.isArray(o.material) ? o.material : [o.material]
      const clones = lista.map((m) => {
        const c = m.clone()
        descartarHeli.push(c)
        mats.push({
          mat: c,
          opacidade: c.opacity,
          transparente: c.transparent,
          emiHex: c.emissive ? c.emissive.getHex() : 0,
          emiInt: c.emissiveIntensity !== undefined ? c.emissiveIntensity : 1,
        })
        return c
      })
      o.material = Array.isArray(o.material) ? clones : clones[0]
    })
    // direcao de chegada: estavel por peca (acaso() e determinista no indice)
    const ang = acaso(i * 3 + 1) * TAU
    const alt = 0.35 + acaso(i * 3 + 2) * 1.2
    const dir = new THREE.Vector3(Math.cos(ang), alt, Math.sin(ang)).normalize()
    const eixo = new THREE.Vector3(
      acaso(i * 7 + 3) - 0.5, acaso(i * 7 + 4) - 0.5, acaso(i * 7 + 5) - 0.5)
    if (eixo.lengthSq() < 1e-4) eixo.set(0, 1, 0)
    eixo.normalize()
    obj.visible = false          // peca que ainda nao chegou nao aparece
    return {
      obj, mats, dir, eixo,
      dist: 7 + acaso(i * 3 + 6) * 5,
      voltas: 1.2 + acaso(i * 3 + 7) * 2.4,
      ini: (i / heli.grupo.userData.pecas.length) * (1 - JANELA),
      k: 0,
    }
  })

  // --- particulas convergindo ----------------------------------------------
  const geoPart = new THREE.BufferGeometry()
  const posPart = new Float32Array(N_PART * 3)
  const corPart = new Float32Array(N_PART * 3)
  const velPart = new Float32Array(N_PART)
  geoPart.setAttribute('position', new THREE.BufferAttribute(posPart, 3))
  geoPart.setAttribute('color', new THREE.BufferAttribute(corPart, 3))
  const matPart = new THREE.PointsMaterial({
    map: texturaFagulha(), size: 0.3, sizeAttenuation: true, transparent: true,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending, vertexColors: true,
  })
  const particulas = new THREE.Points(geoPart, matPart)
  particulas.frustumCulled = false      // a geometria muda todo quadro
  grupo.add(particulas)
  descartar.push(geoPart, matPart)

  function nascerParticula(i) {
    const a = Math.random() * TAU
    const r = 3.5 + Math.random() * 5
    const o = i * 3
    posPart[o] = Math.cos(a) * r
    posPart[o + 1] = 0.15 + Math.random() * 3.6
    posPart[o + 2] = Math.sin(a) * r
    velPart[i] = 2.6 + Math.random() * 3.4
  }
  for (let i = 0; i < N_PART; i++) nascerParticula(i)

  // --- anel que gira e vai fechando ----------------------------------------
  const geoGira = new THREE.RingGeometry(2.55, 2.82, 64, 1)
  geoGira.rotateX(-Math.PI / 2)
  const matGira = matAditivo(COR_VERDE, 0.8)
  const anelGira = new THREE.Mesh(geoGira, matGira)
  anelGira.position.y = 0.03
  anelGira.renderOrder = 2
  grupo.add(anelGira)
  descartar.push(geoGira, matGira)

  // --- anel-medidor: enche conforme o progresso ----------------------------
  // A fatia acesa NAO e geometria nova a cada quadro (isso alocaria por frame):
  // e a cor por vertice indo a zero, que no aditivo simplesmente some.
  const geoMed = new THREE.RingGeometry(3.02, 3.34, 96, 1)
  geoMed.rotateX(-Math.PI / 2)
  const nMed = geoMed.attributes.position.count
  const angMed = new Float32Array(nMed)
  const corMed = new Float32Array(nMed * 3)
  for (let i = 0; i < nMed; i++) {
    const px = geoMed.attributes.position.getX(i)
    const pz = geoMed.attributes.position.getZ(i)
    let a = Math.atan2(px, -pz)
    if (a < 0) a += TAU
    angMed[i] = a
  }
  geoMed.setAttribute('color', new THREE.BufferAttribute(corMed, 3))
  const matMed = matAditivo(0xffffff, 0.85, true)
  const anelMed = new THREE.Mesh(geoMed, matMed)
  anelMed.position.y = 0.03
  anelMed.renderOrder = 2
  grupo.add(anelMed)
  descartar.push(geoMed, matMed)

  const _q = new THREE.Quaternion()
  let tempo = 0
  let morrendo = false
  let acabou = false

  function limpar(comHeli) {
    if (grupo.parent) grupo.parent.remove(grupo)
    for (const d of descartar) if (d && d.dispose) d.dispose()
    descartar.length = 0
    if (!comHeli) return
    for (const d of descartarHeli) if (d && d.dispose) d.dispose()
    descartarHeli.length = 0
    heli.grupo.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose() })
  }

  /** Devolve uma peca ao repouso: identidade, opaca e sem brilho extra. */
  function assentarPeca(p) {
    p.obj.visible = true
    p.obj.position.set(0, 0, 0)
    p.obj.quaternion.identity()
    p.obj.scale.setScalar(1)
    for (const m of p.mats) {
      m.mat.opacity = m.opacidade
      // trocar o flag de transparencia troca o balde de render do material;
      // so mexemos quando ele REALMENTE muda, pra nao sujar quadro nenhum
      if (m.mat.transparent !== m.transparente) {
        m.mat.transparent = m.transparente
        m.mat.needsUpdate = true
      }
      if (m.mat.emissive) {
        m.mat.emissive.setHex(m.emiHex)
        m.mat.emissiveIntensity = m.emiInt
      }
    }
    p.pronto = true
  }

  // =========================================================================
  // QUADRO
  // =========================================================================
  function atualizar(dt, progresso) {
    if (morrendo || acabou) return
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1
    tempo += dt
    let p = Number.isFinite(progresso) ? progresso : 0
    if (p < 0) p = 0
    if (p > 1) p = 1

    // --- pecas --------------------------------------------------------------
    for (const peca of pecas) {
      const k = Math.min(1, Math.max(0, (p - peca.ini) / JANELA))
      peca.k = k
      if (k <= 0) { peca.obj.visible = false; peca.pronto = false; continue }
      if (k >= 1) { if (!peca.pronto) assentarPeca(peca); continue }
      peca.pronto = false
      peca.obj.visible = true
      // desacelera na chegada: a peca ASSENTA, nao cai de tabela
      const e = 1 - Math.pow(1 - k, 3)
      const fora = 1 - e
      peca.obj.position.copy(peca.dir).multiplyScalar(peca.dist * fora)
      peca.obj.quaternion.copy(_q.setFromAxisAngle(peca.eixo, fora * fora * TAU * peca.voltas))
      peca.obj.scale.setScalar(0.74 + 0.26 * e)
      // chegando: meio transparente e queimando verde; assentada: solida e normal
      const opac = Math.min(1, k * 2.1)
      const brilho = Math.pow(1 - k, 1.4)
      for (const m of peca.mats) {
        m.mat.transparent = true
        m.mat.opacity = m.opacidade * opac
        if (m.mat.emissive) {
          // COR_FUNDO (verde escuro) e nao COR_VERDE: a peca ja e clara, e
          // somar o verde claro forte estoura os tres canais e a peca chega
          // BRANCA. Com o verde fundo o canal verde domina e ela chega verde.
          m.mat.emissive.setHex(COR_FUNDO)
          m.mat.emissiveIntensity = m.emiInt + brilho * 3.2
        }
      }
    }

    // --- rotor esquentando no fim -------------------------------------------
    // Assim que as pas assentam elas ja comecam a girar: e a promessa de que
    // aquilo ali voa.
    const pas = pecas[pecas.length - 1]
    if (pas.k > 0.6) {
      heli.grupo.userData.rotor.rotation.y += dt * 5.5 * (pas.k - 0.6) / 0.4
      heli.grupo.userData.rotorCauda.rotation.x += dt * 9 * (pas.k - 0.6) / 0.4
    }

    // --- particulas ---------------------------------------------------------
    const forca = 0.35 + p * 0.65
    for (let i = 0; i < N_PART; i++) {
      const o = i * 3
      let dx = -posPart[o]
      let dy = CENTRO_Y - posPart[o + 1]
      let dz = -posPart[o + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      if (d < 0.45) { nascerParticula(i); continue }
      const v = velPart[i] * (0.5 + forca)
      const passo = Math.min(d, v * dt)
      dx /= d; dy /= d; dz /= d
      // um empurrao lateral: a particula ESPIRALA pro centro em vez de cair reta
      posPart[o] += dx * passo - dz * passo * 0.55
      posPart[o + 1] += dy * passo
      posPart[o + 2] += dz * passo + dx * passo * 0.55
      const perto = 1 - Math.min(1, d / 7)          // acende quando chega perto
      const b = (0.3 + perto * 1.3) * forca
      corPart[o] = 0.24 * b
      corPart[o + 1] = 1.0 * b
      corPart[o + 2] = 0.6 * b
    }
    geoPart.attributes.position.needsUpdate = true
    geoPart.attributes.color.needsUpdate = true

    // --- aneis do chao ------------------------------------------------------
    anelGira.rotation.y += dt * 1.35
    const s = 1.55 - p * 0.72                        // vai fechando conforme monta
    anelGira.scale.set(s, s, s)
    matGira.opacity = (0.3 + 0.22 * Math.sin(tempo * 6)) * (0.5 + forca * 0.5)

    const limite = p * TAU
    const pulso = 0.75 + 0.25 * Math.sin(tempo * 9)
    for (let i = 0; i < nMed; i++) {
      const o = i * 3
      // a borda do medidor queima mais forte: e ela que marca "quanto falta"
      const d = limite - angMed[i]
      const b = d < 0 ? 0 : (d < 0.35 ? 2.2 : 0.8) * pulso
      corMed[o] = 0.24 * b
      corMed[o + 1] = 1.0 * b
      corMed[o + 2] = 0.62 * b
    }
    geoMed.attributes.color.needsUpdate = true
  }

  // =========================================================================
  // CANCELAR — as pecas se desfazem voando pra fora
  // =========================================================================
  function cancelar() {
    if (morrendo || acabou) return
    morrendo = true
    const partida = pecas.map((peca) => ({
      peca,
      de: peca.obj.position.clone(),
      giro: peca.obj.quaternion.clone(),
      escala: peca.obj.scale.x,
      visivel: peca.obj.visible,
    }))
    animarSozinho(0.6, (k) => {
      const solta = k * k * 9                         // acelera pra fora
      for (const it of partida) {
        if (!it.visivel) continue
        const peca = it.peca
        peca.obj.position.copy(it.de).addScaledVector(peca.dir, solta)
        peca.obj.quaternion.copy(_q.setFromAxisAngle(peca.eixo, k * TAU * 1.6).multiply(it.giro))
        peca.obj.scale.setScalar(it.escala * (1 - k * 0.5))
        for (const m of peca.mats) {
          m.mat.transparent = true
          m.mat.opacity = m.opacidade * (1 - k)
          if (m.mat.emissive) {
            m.mat.emissive.setHex(COR_FUNDO)   // mesmo motivo da chegada: nao estourar pra branco
            m.mat.emissiveIntensity = m.emiInt + (1 - k) * 2.6
          }
        }
      }
      // os efeitos apagam junto
      matGira.opacity = 0.4 * (1 - k)
      matMed.opacity = 0.85 * (1 - k)
      matPart.opacity = 1 - k
      const sc = 1.5 + k * 1.2
      anelGira.scale.set(sc, sc, sc)
      if (k >= 1) limpar(true)
    })
  }

  // =========================================================================
  // CONCLUIR — clarao verde e o helicoptero pronto na mao de quem pediu
  // =========================================================================
  function concluir() {
    if (acabou) return heli.grupo
    acabou = true
    for (const peca of pecas) assentarPeca(peca)
    heli.grupo.userData.rotor.rotation.y = 0

    // o grupo sai da montagem com a pose do MUNDO ja aplicada; quem chamou e
    // que decide em qual pai ele entra (o grupo de veiculos, tipicamente)
    grupo.remove(heli.grupo)
    heli.grupo.position.set(grupo.position.x, grupo.position.y, grupo.position.z)
    heli.grupo.rotation.y = grupo.rotation.y

    clarao(scene, grupo.position.x, grupo.position.y, grupo.position.z)
    limpar()
    return heli.grupo
  }

  return { grupo, atualizar, concluir, cancelar }
}

// ---------------------------------------------------------------------------
// CLARAO — o "pronto!" verde. Vive sozinho e se limpa (ver decisao 3).
// ---------------------------------------------------------------------------
function clarao(scene, x, y, z) {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  scene.add(g)

  // bola verde + um miolo quase branco: o verde sozinho fica fraco no meio do
  // estouro, e o branco sozinho nao le como "o poder do anel"
  const geoBola = new THREE.SphereGeometry(1, 18, 12)
  const matBola = matAditivo(COR_VERDE, 0.85)
  const bola = new THREE.Mesh(geoBola, matBola)
  bola.position.y = CENTRO_Y
  bola.scale.setScalar(0.33)
  g.add(bola)
  const matMiolo = matAditivo(COR_NUCLEO, 0.8)
  const miolo = new THREE.Mesh(geoBola, matMiolo)
  miolo.position.y = CENTRO_Y
  miolo.scale.setScalar(0.2)
  g.add(miolo)

  const geoOnda = new THREE.RingGeometry(0.9, 1.1, 60, 1)
  geoOnda.rotateX(-Math.PI / 2)
  const matOnda = matAditivo(COR_VERDE, 0.9)
  const onda = new THREE.Mesh(geoOnda, matOnda)
  onda.position.y = 0.04
  onda.scale.set(0.6, 1, 0.6)
  g.add(onda)

  animarSozinho(0.55, (k) => {
    const abre = 1 - Math.pow(1 - k, 3)
    const s = 0.6 + abre * 6
    bola.scale.setScalar(s * 0.55)
    matBola.opacity = Math.pow(1 - k, 2.2) * 0.85
    miolo.scale.setScalar(s * 0.3)
    matMiolo.opacity = Math.pow(1 - k, 3.4) * 0.8
    onda.scale.set(0.6 + abre * 5.5, 1, 0.6 + abre * 5.5)
    matOnda.opacity = Math.pow(1 - k, 1.7) * 0.85
    if (k >= 1) {
      scene.remove(g)
      geoBola.dispose(); matBola.dispose(); matMiolo.dispose()
      geoOnda.dispose(); matOnda.dispose()
    }
  })
}

// ---------------------------------------------------------------------------
// SUPOSICOES
//
// - `assento` segue o contrato de veiculos.js: userData.pose = 'sentado' e
//   userData.ancora = 'quadril', ou seja, o ponto e o TOPO DO BANCO. O sistema
//   desce HIPS_Y ate a raiz do boneco e a animacao dobra as pernas; por isso o
//   banco esta em BANCO_Y = 1.14 e nao rente ao piso (1.14 - 0.44 = piso).
// - `rodas` volta vazio de proposito: helicoptero nao tem roda. O que gira sao
//   grupo.userData.rotor (eixo Y) e grupo.userData.rotorCauda (eixo X), e quem
//   soma o angulo por quadro e o sistema — daqui nao sai animacao de voo.
// - criarMontagem(scene, x, y, z, yaw): x,y,z e o PONTO NO CHAO onde o
//   helicoptero vai nascer (o mesmo ponto que o anel mirou). O progresso vem de
//   fora, ja dividido por MUNDO.HELI_MONTAGEM — este arquivo nao conta tempo de
//   montagem nem decide quando acabou.
// - concluir() devolve o grupo JA com a pose do mundo e SEM pai: quem chamou
//   adiciona onde quiser. Ele carrega em userData tudo que o sistema precisa
//   (rotor, rotorCauda, assento, config), entao nao e preciso construir() de novo.
// - Depois da montagem os materiais do helicoptero sao CLONES (nao os do cache
//   de materials.js). E de proposito: sao eles que foram animados. Custa um
//   punhado de materiais por helicoptero criado.
// ---------------------------------------------------------------------------
