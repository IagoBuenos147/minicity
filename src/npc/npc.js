import * as THREE from 'three'
import { createCharacter } from '../player/character.js'
import { EYE_ANCHOR } from '../player/appearance.js'
import { solid, PALETTE } from '../world/materials.js'

// ---------------------------------------------------------------------------
// NPC: um Character parado com vida propria — respiracao, micro-balanco,
// piscada e cabeca que acompanha o jogador (npc.lookTarget = Object3D).
// ---------------------------------------------------------------------------

const ZERO = [0, 0, 0]

// Rotacoes base por junta. Lembrando: membro aponta pra -Y, entao
// rotation.x NEGATIVO joga o membro pra FRENTE (+Z). +X = lado direito.
export const POSES = {
  idle: {
    rootY: 0,
    j: {
      armRUpper: [0.04, 0, 0.10], armRLower: [-0.22, 0, 0],
      armLUpper: [0.04, 0, -0.10], armLLower: [-0.22, 0, 0],
      handR: [-0.10, 0, 0], handL: [-0.10, 0, 0],
    },
  },
  work: {
    rootY: 0,
    j: {
      armRUpper: [-0.72, 0, 0.16], armRLower: [-0.62, 0, -0.10],
      armLUpper: [-0.72, 0, -0.16], armLLower: [-0.62, 0, 0.10],
      handR: [-0.18, 0, 0], handL: [-0.18, 0, 0],
      chest: [0.06, 0, 0],
    },
  },
  cut: {
    rootY: 0,
    j: {
      // braco direito erguido segurando a tesoura na altura da cabeca
      armRUpper: [-1.34, 0.10, -0.30], armRLower: [-0.95, 0, 0.18],
      handR: [-0.25, 0.35, 0],
      // esquerdo apoiando o corte, mais baixo
      armLUpper: [-0.95, -0.15, -0.28], armLLower: [-0.85, 0, 0.10],
      handL: [-0.30, -0.25, 0],
      chest: [0.05, -0.12, 0],
    },
  },
  sit: {
    // desce o corpo ate a altura de um assento de cadeira de barbeiro;
    // a altura resultante do quadril sai em api.hipHeight (nao hardcode isso)
    rootY: -0.408,
    j: {
      legRUpper: [-1.52, 0.05, 0.06], legRLower: [1.46, 0, 0], footR: [0.08, 0, 0],
      legLUpper: [-1.52, -0.05, -0.06], legLLower: [1.46, 0, 0], footL: [0.08, 0, 0],
      armRUpper: [-0.42, 0, 0.14], armRLower: [-0.95, 0, -0.12],
      armLUpper: [-0.42, 0, -0.14], armLLower: [-0.95, 0, 0.12],
      handR: [-0.25, 0, 0], handL: [-0.25, 0, 0],
      chest: [-0.04, 0, 0],
    },
  },
}

const JOINT_NAMES = [
  'hips', 'torso', 'chest',
  'armRUpper', 'armRLower', 'handR',
  'armLUpper', 'armLLower', 'handL',
  'legRUpper', 'legRLower', 'footR',
  'legLUpper', 'legLLower', 'footL',
]

/** Tesoura de barbeiro (opcional na pose 'cut'). */
function makeScissors() {
  const g = new THREE.Group()
  const steel = solid(PALETTE.chrome, 0.25, 0.9)
  const grip = solid(0x23262b, 0.6, 0.1)

  const bladeGeo = new THREE.BoxGeometry(0.008, 0.115, 0.020)
  const ringGeo = new THREE.TorusGeometry(0.020, 0.005, 6, 14)

  const half = (sgn) => {
    const h = new THREE.Group()
    const blade = new THREE.Mesh(bladeGeo, steel)
    blade.castShadow = true; blade.receiveShadow = true
    blade.position.y = 0.062
    blade.rotation.z = sgn * 0.05
    h.add(blade)
    const ring = new THREE.Mesh(ringGeo, grip)
    ring.castShadow = true; ring.receiveShadow = true
    ring.position.set(sgn * 0.016, -0.038, 0)
    ring.rotation.y = Math.PI / 2
    h.add(ring)
    const shank = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.048, 0.012), grip)
    shank.castShadow = true; shank.receiveShadow = true
    shank.position.set(sgn * 0.010, -0.015, 0)
    h.add(shank)
    return h
  }

  const a = half(1), b = half(-1)
  g.add(a, b)
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.024, 8), steel)
  screw.castShadow = true; screw.receiveShadow = true
  screw.rotation.x = Math.PI / 2
  g.add(screw)
  return { group: g, a, b }
}

export function createNPC(opts = {}) {
  const character = createCharacter({
    appearance: opts.appearance,
    skin: opts.skin, shirt: opts.shirt, pants: opts.pants, shoes: opts.shoes,
    scale: opts.scale,
  })

  const root = new THREE.Group()
  // marca a subarvore como dinamica: o forno de geometria (world/bake.js) nao
  // pode fundir um corpo que anima junta por junta
  root.userData.dynamic = true
  root.name = opts.name || 'npc'
  // baseY: altura do piso onde o NPC esta (interiores usam LEVELS.SHOP_FLOOR)
  let baseY = opts.baseY || 0
  root.position.set(opts.x || 0, (opts.y || 0) + baseY, opts.z || 0)
  root.rotation.y = opts.rotY || 0
  root.add(character.root)

  const P = character.parts
  const base = {}
  let poseName = 'idle'
  let poseRootY = 0

  let scissors = null

  function setPose(p) {
    const pose = POSES[p] || POSES.idle
    poseName = POSES[p] ? p : 'idle'
    poseRootY = pose.rootY || 0
    for (const n of JOINT_NAMES) base[n] = pose.j[n] || ZERO
    character.root.position.y = poseRootY
    // tesoura so aparece na pose de corte
    if (poseName === 'cut' && opts.scissors && !scissors) {
      scissors = makeScissors()
      scissors.group.position.set(0, -0.075, 0.030)
      scissors.group.rotation.set(-0.35, 0, 0.25)
      P.handR.add(scissors.group)
    }
    if (scissors) scissors.group.visible = poseName === 'cut'
  }

  // fase aleatoria: dois NPCs lado a lado nao respiram em sincronia
  let t = Math.random() * 12
  let blinkIn = 1.2 + Math.random() * 3.5
  let blinkT = -1
  let lookYaw = 0, lookPitch = 0

  const _v = new THREE.Vector3()

  function update(dt) {
    const d = Math.min(dt || 0, 0.1)
    t += d

    // --- respiracao: o peito infla e o tronco sobe ~1.2 cm
    const br = Math.sin(t * 1.55)
    P.torso.position.y = br * 0.012
    P.chest.scale.set(1 - br * 0.008, 1 + br * 0.020, 1 - br * 0.008)

    // --- balanco sutil de peso
    const sway = Math.sin(t * 0.52)
    const sway2 = Math.sin(t * 0.83 + 1.1)
    P.hips.rotation.y = base.hips[1] + sway * 0.045
    P.hips.rotation.z = base.hips[2] + sway2 * 0.014
    P.hips.rotation.x = base.hips[0]
    P.torso.rotation.set(base.torso[0], base.torso[1] - sway * 0.02, base.torso[2])
    P.chest.rotation.set(base.chest[0] + br * 0.012, base.chest[1] + sway * 0.03, base.chest[2])

    // --- bracos e pernas: base da pose + deriva lenta
    const armSwing = Math.sin(t * 0.9) * 0.035
    for (const n of JOINT_NAMES) {
      if (n === 'hips' || n === 'torso' || n === 'chest') continue
      const b = base[n]
      const j = P[n]
      if (!j) continue
      let ax = b[0]
      if (n === 'armRUpper') ax += armSwing
      else if (n === 'armLUpper') ax -= armSwing
      j.rotation.set(ax, b[1], b[2])
    }

    // tesoura abrindo e fechando enquanto "corta"
    if (scissors && poseName === 'cut') {
      const snip = (Math.sin(t * 5.2) * 0.5 + 0.5) * 0.30
      scissors.a.rotation.z = snip
      scissors.b.rotation.z = -snip
      P.armRLower.rotation.x += Math.sin(t * 2.6) * 0.05
    }

    // --- piscada: achata os olhos em Y por ~90 ms
    blinkIn -= d
    if (blinkT < 0 && blinkIn <= 0) { blinkT = 0; blinkIn = 2.0 + Math.random() * 4.5 }
    const eyes = character.slots.eyes
    if (blinkT >= 0) {
      blinkT += d
      const k = Math.min(1, blinkT / 0.09)
      const s = 1 - Math.sin(k * Math.PI) * 0.93
      eyes.scale.y = s
      // compensa a posicao pra piscada nao "escorrer" o olho pra baixo
      eyes.position.y = EYE_ANCHOR.y * (1 - s)
      if (k >= 1) { blinkT = -1; eyes.scale.y = 1; eyes.position.y = 0 }
    }

    // --- cabeca: segue o alvo, senao olha em volta devagar
    // lookTarget aceita Object3D, Vector3 ou null: nunca pode lancar no loop
    const target = api.lookTarget
    let hasTarget = false
    if (target) {
      if (target.isVector3) { _v.copy(target); hasTarget = true }
      else if (target.matrixWorld) { _v.setFromMatrixPosition(target.matrixWorld); hasTarget = true }
      else if (target.position && target.position.isVector3) { _v.copy(target.position); hasTarget = true }
    }
    let wantYaw, wantPitch
    if (hasTarget) {
      character.root.worldToLocal(_v)
      // _v ja esta no espaco do character.root, que inclui o offset da pose
      const dy = _v.y - character.headCenterY
      const flat = Math.hypot(_v.x, _v.z)
      wantYaw = Math.atan2(_v.x, _v.z)
      wantPitch = -Math.atan2(dy, Math.max(0.2, flat))
      // se o alvo esta fora do campo confortavel, volta pro repouso
      if (Math.abs(wantYaw) > 1.5) { wantYaw = 0; wantPitch = 0 }
    } else {
      wantYaw = Math.sin(t * 0.31) * 0.20
      wantPitch = Math.sin(t * 0.57 + 2.0) * 0.05
    }
    const k = 1 - Math.exp(-6 * d)
    lookYaw += (wantYaw - lookYaw) * k
    lookPitch += (wantPitch - lookPitch) * k
    character.setHeadLook(lookPitch, lookYaw)
  }

  function dispose() {
    if (scissors) {
      scissors.group.traverse((o) => { if (o.geometry) o.geometry.dispose() })
      scissors = null
    }
    character.dispose()
    if (root.parent) root.parent.remove(root)
  }

  // desloca o NPC para outro nivel de piso sem mexer em X/Z
  function setBaseY(v) {
    const y = (typeof v === 'number' && isFinite(v)) ? v : 0
    root.position.y += y - baseY
    baseY = y
  }

  const api = {
    root,
    character,
    lookTarget: opts.lookAt || null,
    get pose() { return poseName },
    get baseY() { return baseY },
    // Altura do quadril no espaco do root do NPC, ja considerando a pose.
    // Os interiores usam isso pra assentar o NPC em cadeiras sem chutar numero.
    get hipHeight() { return character.hipsY + (POSES[poseName] ? POSES[poseName].rootY || 0 : 0) },
    update,
    setPose,
    setBaseY,
    setAppearance: (a) => character.setAppearance(a),
    dispose,
  }

  setPose(opts.pose || 'idle')
  update(0)
  return api
}
