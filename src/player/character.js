import * as THREE from 'three'
import { PLAYER } from '../config.js'
import * as mats from '../world/materials.js'
import {
  HEAD, HEAD_S, EYE_ANCHOR, HAIR, EYES, BROWS, MOUTH, HAIR_COLORS,
  defaultAppearance, hairColorOf, makeHeadGeometry, surfaceZ, shadeColor,
} from './appearance.js'

const { solid, roundedBox } = mats

// ---------------------------------------------------------------------------
// Boneco procedural estilo Schedule I: cabeca de ovo enorme, ombros estreitos,
// membros finos. Origem do root NOS PES, +Z = frente.
//
// Cadeia de juntas (cada Group fica NO PONTO DE ROTACAO, o mesh e filho
// deslocado) — o animator so precisa mexer nas rotacoes:
//   hips -> torso -> chest -> neck -> headPivot -> head -> face
//   chest -> arm?Upper -> arm?Lower -> hand?
//   hips  -> leg?Upper -> leg?Lower -> foot?
// Convencao: +X = lado DIREITO do personagem (ele olha pra +Z).
// ---------------------------------------------------------------------------

// Proporcoes calibradas pela referencia: pernas ~46% da altura (eram 52%),
// torso proporcionalmente mais longo e cabeca grande encostando nos ombros.
// Exportado porque os interiores precisam assentar NPCs em cadeiras sem
// hardcodar a altura do quadril (ja quebrou uma vez).
export const HIPS_Y = 0.84 // altura do quadril (46.2% de 1.82)
const CHEST_Y = 0.30       // chest relativo a hips
const NECK_Y = 0.165       // neck relativo a chest
const HEADPIVOT_Y = 0.0229 // base do craneo relativo ao neck
const HEAD_CENTER_Y = HIPS_Y + CHEST_Y + NECK_Y + HEADPIVOT_Y + HEAD.ry // 1.574
// topo do craneo = HEAD_CENTER_Y + HEAD.ry = 1.82 = PLAYER.HEIGHT

// Ombros estreitos: na referencia a largura do ombro mal passa do torso.
const SHOULDER_X = 0.124
const SHOULDER_Y = 0.120   // relativo ao chest
const UPPER_ARM = 0.28
const FORE_ARM = 0.26
const HIP_X = 0.070
// coxa + canela + 0.0905 (tornozelo->chao) = HIPS_Y
const THIGH = 0.384
const SHIN = 0.3655

const LOOK_LIMIT = 0.6

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Junta: Group posicionado no ponto de rotacao. */
function joint(name, x, y, z, parent) {
  const g = new THREE.Group()
  g.name = name
  g.position.set(x, y, z)
  if (parent) parent.add(g)
  return g
}

/** Capsula: a junta fica no topo, o mesh desce a partir dela. */
function limbGeo(r, len, seg = 12) {
  return new THREE.CapsuleGeometry(r, len, 4, seg)
}

/** Perfil revolucionado e achatado em Z — torso conico cartoon. */
function latheGeo(profile, flatZ = FLAT_Z, seg = TORSO_SEG) {
  const pts = profile.map((p) => new THREE.Vector2(Math.max(0.0008, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, seg)
  g.scale(1, 1, flatZ)
  g.computeVertexNormals()
  return g
}

// A barra da camiseta e a aresta larga em y = -0.008; abaixo dela o perfil so
// fecha o fundo. Antes o fundo era um domo alto e a camiseta virava um sino.
const PELVIS_PROFILE = [
  [0.020, -0.048], [0.086, -0.040], [0.116, -0.026], [0.126, -0.008],
  [0.130, 0.030], [0.134, 0.090], [0.128, 0.170], [0.124, 0.240], [0.130, 0.300],
]
// Termina em r=0.074 (e nao quase zero): a lathe deixa o decote aberto e o
// pescoco passa por ele. O ultimo trecho e o que a gola cobre.
const CHEST_PROFILE = [
  [0.130, 0.000], [0.140, 0.048], [0.144, 0.095], [0.140, 0.140],
  [0.122, 0.175], [0.095, 0.196], [0.074, 0.205],
]

// Barra da camiseta: faixa reta COLADA no corpo. Os raios sao exatamente os da
// PELVIS_PROFILE nas alturas -0.012 e 0.014 (a lathe interpola linear entre os
// pontos), so 1% maiores — sem isso vira um pratinho preso na cintura.
const HEM_Y0 = -0.012, HEM_Y1 = 0.014
const HEM_R0 = 0.1238, HEM_R1 = 0.1283
const FLAT_Z = 0.76        // achatamento em Z do torso (ver latheGeo)
const TORSO_SEG = 24       // faces do torso; a barra usa o MESMO numero e a
                           // mesma fase, senao os poligonos se cruzam e a borda
                           // vira um serrilhado

// Manga curta: perfil revolucionado (domo + tubo + bainha). Antes eram um
// cilindro e uma meia-esfera separados, e a emenda entre os dois lia como
// ombreira. Coordenadas relativas a junta do ombro.
// (de baixo pra cima: a LatheGeometry so gera as faces pra fora nessa ordem)
// O topo do domo tem que morrer DENTRO do torso, senao as duas superficies se
// cruzam de raspao e a costura vira um serrilhado.
const SLEEVE_PROFILE = [
  [0.047, -0.100], [0.052, -0.096], [0.054, -0.070], [0.055, -0.034],
  [0.052, -0.008], [0.044, 0.008], [0.026, 0.021], [0.000, 0.026],
]

export function createCharacter(opts = {}) {
  const app = Object.assign(defaultAppearance(), opts.appearance || {})
  if (opts.skin !== undefined) app.skin = opts.skin
  if (opts.shirt !== undefined) app.shirt = opts.shirt
  if (opts.pants !== undefined) app.pants = opts.pants
  if (opts.shoes !== undefined) app.shoes = opts.shoes

  // Materiais por "tom": os meshes guardam so a chave, entao trocar de cor e
  // regerar o mapa e reatribuir. O cache de materials.js compartilha entre NPCs.
  const M = {}
  const tinted = []              // { mesh, tone }
  const ownGeos = []             // geometrias criadas aqui (dispose no fim)
  const track = (g) => { ownGeos.push(g); return g }

  function refreshMats() {
    M.skin = solid(app.skin, 0.68, 0.0)
    M.skinDark = solid(shadeColor(app.skin, 0.86), 0.7, 0.0)
    M.shirt = solid(app.shirt, 0.88, 0.0)
    M.shirtDark = solid(shadeColor(app.shirt, 0.76), 0.9, 0.0)
    M.pants = solid(app.pants, 0.92, 0.0)
    M.pantsDark = solid(shadeColor(app.pants, 0.78), 0.94, 0.0)
    M.shoe = solid(app.shoes, 0.55, 0.02)
    M.sole = solid(shadeColor(app.shoes, 0.38), 0.9, 0.0)
    M.lace = solid(shadeColor(app.shoes, 0.62), 0.8, 0.0)
  }
  refreshMats()

  /** Cria o mesh ja com sombra, tom registrado e geometria rastreada. */
  function part(geo, tone, own = true) {
    if (own) track(geo)
    const m = sh(new THREE.Mesh(geo, M[tone]))
    tinted.push({ mesh: m, tone })
    return m
  }

  const root = new THREE.Group()
  root.name = 'character'

  // --- tronco ---------------------------------------------------------------
  const hips = joint('hips', 0, HIPS_Y, 0, root)
  const torso = joint('torso', 0, 0, 0, hips)
  const chest = joint('chest', 0, CHEST_Y, 0, torso)

  torso.add(part(latheGeo(PELVIS_PROFILE), 'shirt'))
  chest.add(part(latheGeo(CHEST_PROFILE), 'shirt'))

  // barra da camiseta: cilindro aberto seguindo a mesma reta do perfil
  const hem = part(new THREE.CylinderGeometry(HEM_R1, HEM_R0, HEM_Y1 - HEM_Y0, TORSO_SEG, 1, true), 'shirtDark')
  hem.scale.set(1.010, 1, FLAT_Z * 1.010)
  hem.position.y = (HEM_Y0 + HEM_Y1) / 2
  torso.add(hem)

  // gola: anel fino tampando o decote aberto da lathe
  const collar = part(new THREE.TorusGeometry(0.070, 0.012, 8, 22), 'shirtDark')
  collar.rotation.x = Math.PI / 2
  collar.scale.z = 0.80
  collar.position.y = 0.203
  chest.add(collar)

  // --- pescoco e cabeca -----------------------------------------------------
  const neck = joint('neck', 0, NECK_Y, 0, chest)
  // pescoco fino e curto: so uns 3 cm ficam entre a gola e o queixo
  const neckMesh = part(new THREE.CylinderGeometry(0.047, 0.058, 0.11, 14), 'skinDark')
  neckMesh.position.y = 0.030
  neck.add(neckMesh)

  const headPivot = joint('headPivot', 0, HEADPIVOT_Y, 0, neck)
  const head = joint('head', 0, HEAD.ry, 0, headPivot)

  head.add(part(makeHeadGeometry(1, 30, 24), 'skin'))

  // orelhas
  const earGeo = track(new THREE.SphereGeometry(1, 14, 10))
  for (const sgn of [1, -1]) {
    const ear = part(earGeo, 'skinDark', false)
    ear.scale.set(0.019 * HEAD_S, 0.045 * HEAD_S, 0.033 * HEAD_S)
    // recuada: no lugar antigo (z ~ 0) a orelha nascia no meio da bochecha
    ear.position.set(sgn * 0.1225 * HEAD_S, -0.008 * HEAD_S, -0.045 * HEAD_S)
    ear.rotation.z = sgn * 0.12
    head.add(ear)
  }

  // nariz pequeno encostado na curva do rosto
  const nose = part(new THREE.SphereGeometry(1, 14, 10), 'skin')
  nose.scale.set(0.023 * HEAD_S, 0.026 * HEAD_S, 0.030 * HEAD_S)
  const noseY = -0.014 * HEAD_S
  nose.position.set(0, noseY, surfaceZ(0, noseY) - 0.007 * HEAD_S)
  head.add(nose)

  // face: ancora dos slots faciais, olhando pra +Z
  const face = new THREE.Group()
  face.name = 'face'
  head.add(face)

  const slots = {
    hair: new THREE.Group(),
    eyes: new THREE.Group(),
    brows: new THREE.Group(),
    mouth: new THREE.Group(),
  }
  for (const k in slots) slots[k].name = 'slot:' + k
  head.add(slots.hair)
  face.add(slots.eyes, slots.brows, slots.mouth)

  // camera de 1a pessoa na altura dos olhos
  const fpAnchor = new THREE.Object3D()
  fpAnchor.name = 'fpAnchor'
  // Fica exatamente onde estao os globos oculares (EYE_ANCHOR.y, no espaco da
  // cabeca), pra camera de 1a pessoa e o rosto visto em 3a pessoa concordarem.
  // PLAYER.EYE_HEIGHT segue como fallback do controller.
  fpAnchor.position.set(0, EYE_ANCHOR.y, 0.06 * HEAD_S)
  head.add(fpAnchor)

  // --- bracos ---------------------------------------------------------------
  // Capsula do braco encurtada em cima: se o topo passar do domo da manga
  // (+0.026 acima da junta) aparece um triangulo de pele no ombro.
  const upperArmGeo = track(limbGeo(0.045, 0.225))
  const foreArmGeo = track(limbGeo(0.041, FORE_ARM))
  // Manga curta e justa, peca unica (ver SLEEVE_PROFILE)
  const sleeveGeo = track(latheGeo(SLEEVE_PROFILE, 1, 18))
  const handGeo = track(roundedBox(0.070, 0.098, 0.052, 0.026, M.skin).geometry)
  const thumbGeo = track(limbGeo(0.016, 0.026, 8))
  const elbowGeo = track(new THREE.SphereGeometry(0.042, 12, 8))

  function buildArm(sgn, side) {
    const up = joint('arm' + side + 'Upper', sgn * SHOULDER_X, SHOULDER_Y, 0, chest)
    const upMesh = part(upperArmGeo, 'skin', false)
    upMesh.position.y = -0.1375   // topo em +0.020, base em -0.295 (dentro do cotovelo)
    up.add(upMesh)

    // manga curta da camiseta: cilindro maior no topo do braco
    const sleeve = part(sleeveGeo, 'shirt', false)
    up.add(sleeve)

    const low = joint('arm' + side + 'Lower', 0, -UPPER_ARM, 0, up)
    low.add(part(elbowGeo, 'skin', false))
    const lowMesh = part(foreArmGeo, 'skin', false)
    lowMesh.position.y = -FORE_ARM / 2
    low.add(lowMesh)

    const hand = joint('hand' + side, 0, -FORE_ARM, 0, low)
    const handMesh = part(handGeo, 'skin', false)
    handMesh.position.y = -0.044
    hand.add(handMesh)
    const thumb = part(thumbGeo, 'skin', false)
    thumb.position.set(-sgn * 0.036, -0.030, 0.012)
    thumb.rotation.z = sgn * 0.85
    hand.add(thumb)

    return { up, low, hand }
  }

  const armR = buildArm(1, 'R')
  const armL = buildArm(-1, 'L')

  // --- pernas ---------------------------------------------------------------
  const thighGeo = track(limbGeo(0.052, THIGH, 14))
  const shinGeo = track(limbGeo(0.045, SHIN, 14))
  const kneeGeo = track(new THREE.SphereGeometry(0.048, 12, 8))
  const shoeGeo = track(roundedBox(0.100, 0.086, 0.250, 0.034, M.shoe).geometry)
  const soleGeo = track(new THREE.BoxGeometry(0.106, 0.026, 0.256))
  const toeGeo = track(new THREE.SphereGeometry(1, 14, 10))
  const laceGeo = track(new THREE.BoxGeometry(0.052, 0.008, 0.012))

  function buildLeg(sgn, side) {
    const up = joint('leg' + side + 'Upper', sgn * HIP_X, 0, 0, hips)
    const upMesh = part(thighGeo, 'pants', false)
    upMesh.position.y = -THIGH / 2
    up.add(upMesh)

    const low = joint('leg' + side + 'Lower', 0, -THIGH, 0, up)
    low.add(part(kneeGeo, 'pants', false))
    const lowMesh = part(shinGeo, 'pants', false)
    lowMesh.position.y = -SHIN / 2
    low.add(lowMesh)
    // barra da calca em cima do tenis
    const cuff = part(kneeGeo, 'pantsDark', false)
    cuff.scale.set(0.98, 0.42, 0.98)
    cuff.position.y = -SHIN + 0.040
    low.add(cuff)

    // tenis: bloco arredondado apontando pra frente + sola escura + cadarcos
    const foot = joint('foot' + side, 0, -SHIN, 0, low)
    const shoe = part(shoeGeo, 'shoe', false)
    shoe.position.set(0, -0.033, 0.045)
    foot.add(shoe)
    const sole = part(soleGeo, 'sole', false)
    // sola 2.5 mm acima do chao: o balanco do idle nao afunda o pe no piso
    sole.position.set(0, -0.0745, 0.045)
    foot.add(sole)
    const toe = part(toeGeo, 'shoe', false)
    toe.scale.set(0.050, 0.040, 0.046)
    toe.position.set(0, -0.046, 0.158)
    foot.add(toe)
    for (let i = 0; i < 3; i++) {
      const lace = part(laceGeo, 'lace', false)
      lace.position.set(0, -0.004 - i * 0.006, 0.040 + i * 0.036)
      foot.add(lace)
    }
    return { up, low, foot }
  }

  const legR = buildLeg(1, 'R')
  const legL = buildLeg(-1, 'L')

  // --- aparencia ------------------------------------------------------------

  function ctx() {
    return {
      skin: app.skin,
      shirt: app.shirt,
      pants: app.pants,
      shoes: app.shoes,
      hairColor: hairColorOf(app.hairColor),
      THREE,
      mats,
    }
  }

  /** Limpa um slot liberando so as geometrias (materiais vem do cache global). */
  function clearSlot(slot) {
    for (let i = slot.children.length - 1; i >= 0; i--) {
      const child = slot.children[i]
      child.traverse((o) => {
        if (o.geometry) o.geometry.dispose()
        const mt = o.material
        if (mt && mt.userData && mt.userData.owned) {
          if (mt.map) mt.map.dispose()
          mt.dispose()
        }
      })
      slot.remove(child)
    }
  }

  const CATALOG = { hair: HAIR, eyes: EYES, brows: BROWS, mouth: MOUTH }

  function rebuild(kind) {
    const catalog = CATALOG[kind]
    const slot = slots[kind]
    clearSlot(slot)
    const i = Math.max(0, Math.min(catalog.length - 1, app[kind] | 0))
    const obj = catalog[i].build(ctx())
    if (obj) slot.add(obj)
  }

  function applyColors() {
    refreshMats()
    for (const t of tinted) t.mesh.material = M[t.tone]
  }

  function setAppearance(next) {
    const prev = Object.assign({}, app)
    Object.assign(app, next || {})
    if (prev.skin !== app.skin || prev.shirt !== app.shirt
      || prev.pants !== app.pants || prev.shoes !== app.shoes) applyColors()
    if (prev.hair !== app.hair || prev.hairColor !== app.hairColor) rebuild('hair')
    if (prev.eyes !== app.eyes || prev.skin !== app.skin) rebuild('eyes')
    if (prev.brows !== app.brows || prev.hairColor !== app.hairColor) rebuild('brows')
    if (prev.mouth !== app.mouth || prev.hairColor !== app.hairColor
      || prev.skin !== app.skin) rebuild('mouth')
    return app
  }

  // montagem inicial dos slots
  rebuild('hair'); rebuild('eyes'); rebuild('brows'); rebuild('mouth')

  // --- API ------------------------------------------------------------------

  function setHeadLook(pitch, yaw) {
    headPivot.rotation.x = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, pitch || 0))
    headPivot.rotation.y = Math.max(-LOOK_LIMIT, Math.min(LOOK_LIMIT, yaw || 0))
  }

  let bodyVisible = true
  function setVisibleBody(v) {
    bodyVisible = !!v
    // em 1a pessoa some so a cabeca (com cabelo e face); os bracos continuam
    head.visible = bodyVisible
    neckMesh.visible = bodyVisible
  }

  function dispose() {
    for (const k in slots) clearSlot(slots[k])
    for (const g of ownGeos) g.dispose()
    ownGeos.length = 0
    tinted.length = 0
    if (root.parent) root.parent.remove(root)
  }

  if (opts.scale && opts.scale !== 1) root.scale.setScalar(opts.scale)

  return {
    root,
    height: PLAYER.HEIGHT,
    appearance: app,
    parts: {
      hips, torso, chest, neck, head, headPivot, face,
      armLUpper: armL.up, armLLower: armL.low, handL: armL.hand,
      armRUpper: armR.up, armRLower: armR.low, handR: armR.hand,
      legLUpper: legL.up, legLLower: legL.low, footL: legL.foot,
      legRUpper: legR.up, legRLower: legR.low, footR: legR.foot,
    },
    slots,
    fpAnchor,
    headCenterY: HEAD_CENTER_Y,
    hipsY: HIPS_Y,
    setAppearance,
    setHeadLook,
    setVisibleBody,
    isBodyVisible: () => bodyVisible,
    dispose,
  }
}

export { HEAD_CENTER_Y, HAIR_COLORS }
