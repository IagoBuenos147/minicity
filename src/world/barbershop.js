import * as THREE from 'three'
import { BARBER, interiorOf } from './layout.js'
import { LEVELS } from '../config.js'
import * as Props from './props.js'
import { createNPC, POSES } from '../npc/npc.js'
import { HIPS_Y as HIPS_REF } from '../player/character.js'
import { congelarPersonagem } from '../player/congelar.js'
import {
  PALETTE, stdMat, solid, emissive, glass, box, cyl, sphere, plane, roundedBox,
  tex, woodTex, tileTex, plasterTex, paintingMat, textPlaneMat,
} from './materials.js'

// ---------------------------------------------------------------------------
// Interior da BARBEARIA DO ZEZO.
// A casca externa (paredes, porta, vitrine, telhado, letreiro) e do city.js.
// Aqui: piso xadrez, forro, revestimento interno, moveis, decoracao, luzes,
// o barbeiro (NPC) e um cliente sentado.
// ---------------------------------------------------------------------------

const IN = interiorOf(BARBER)

// Todo o interior e montado com o piso em y = 0 LOCAL; o group inteiro sobe
// para LEVELS.SHOP_FLOOR (0.16), nivelado com a calcada. city.js nao constroi
// piso dentro do lote, entao nao ha z-fighting embaixo.
const FLOOR_Y = LEVELS.SHOP_FLOOR
// Forro em 3.30 no MUNDO: a laje do telhado da casca ocupa de 3.50 a 3.84.
const CEIL_WORLD_Y = 3.30
const CEIL_Y = CEIL_WORLD_Y - FLOOR_Y     // 3.14 local
const WALL_H = CEIL_Y                     // revestimento interno vai ate o forro
const WAINSCOT_H = 1.1                    // altura do painel de madeira

// Estacoes de corte: as DUAS lado a lado na parede x0, com 2.2 m entre elas
// (espaco de trabalho real: o barbeiro roda em volta da cadeira sem esbarrar).
const STATION_Z = [-16.3, -18.5]
const CHAIR_X = 17.15
const COUNTER_X0 = IN.x0            // 14.30
const COUNTER_X1 = IN.x0 + 0.75     // 15.05
const COUNTER_Z0 = -19.9
const COUNTER_Z1 = -14.9
const MIRROR_X = IN.x0 + 0.02

// DIVISORIA: corta a sala em SALAO (frente, do lado da porta) e AREA DE
// SERVICO (fundo: lavatorios, estoque). Sem ela o miolo de 15x15 m fica um
// deserto de piso xadrez. Dois vaos de 1.5 m garantem a circulacao.
const DIV_Z = -21.6
const DIV_T = 0.24
const DIV_H = 2.45
const DIV_A = [IN.x0, 18.3]        // pano de parede cheio (esquerda)
const DIV_GAP1 = [18.3, 19.8]      // vao de passagem
const DIV_B = [19.8, 24.4]         // balcao alto + estante vazada
const DIV_GAP2 = [24.4, 25.9]      // vao de passagem
const DIV_C = [25.9, IN.x1]        // pano cheio + armario de toalhas

// Vao da porta na fachada (z = IN.z1). Nada de colisor/movel aqui.
const DOOR_X0 = BARBER.door.center - BARBER.door.width / 2
const DOOR_X1 = BARBER.door.center + BARBER.door.width / 2

// Altura do assento da cadeira; o cliente sentado e erguido ate encostar nela.
const SEAT_Y = 0.745
const SEAT_TOP_Y = SEAT_Y + 0.09          // topo da almofada (altura 0.18)
// Altura REAL do quadril na pose 'sit', derivada do personagem. Hardcodar isso
// ja quebrou uma vez, quando o quadril desceu de 0.95 para 0.84.
const SIT_HIP_Y = HIPS_REF + (POSES.sit ? POSES.sit.rootY : 0)
const THIGH_R = 0.052                     // raio da coxa: a coxa encosta no assento
// Na pose 'sit' o femur fica quase deitado (rotacao -1.52 rad), entao o EIXO da
// coxa cai ~1.1 cm abaixo do quadril. Sem isso a bunda afunda no estofado.
const THIGH_DY = -0.011
// Erguer o NPC ate a coxa pousar no assento (e os pes no apoio de pes).
const SIT_LIFT = SEAT_TOP_Y + THIGH_R - (SIT_HIP_Y + THIGH_DY)  // ~0.356

// ---------------------------------------------------------------------------
// Materiais do modulo (todos vem do cache de materials.js)
// ---------------------------------------------------------------------------
function mats() {
  return {
    chrome: solid(PALETTE.chrome, 0.14, 1.0),
    chromeDim: solid(0xa8b0b6, 0.3, 0.95),
    steel: solid(0x848c93, 0.34, 0.9),
    darkMetal: solid(0x2f3439, 0.42, 0.8),
    black: solid(0x1b1b1f, 0.6, 0.1),
    leather: solid(0x9d2b2b, 0.48, 0.06),
    leatherLip: solid(0xb63a37, 0.44, 0.06),
    seam: solid(0x5f1616, 0.62, 0.04),
    wood: stdMat('bb-wood', { map: woodTex(4, '#6d4527'), roughness: 0.66, metalness: 0.02 }),
    woodDark: solid(0x4a2f1b, 0.72, 0.03),
    counterTop: solid(0x24262b, 0.34, 0.28),
    // Sem AmbientLight aqui (ela vazaria pra cidade inteira): o interior e
    // preenchido pelas 3 luzes do teto + um emissivo suave no forro/parede.
    wall: stdMat('bb-wall', {
      map: plasterTex(5, '#e6ddcb'), roughness: 0.96,
      emissive: 0xffeeda, emissiveIntensity: 0.12,
    }),
    ceiling: stdMat('bb-ceiling', {
      color: 0xf2eee6, roughness: 0.95,
      emissive: 0xfff1d8, emissiveIntensity: 0.34,
    }),
    baseboard: solid(0x2a2a2e, 0.7, 0.05),
    // tileTex desenha 4x4 quadrados por repeticao: 13 repeticoes em 15.4 m
    // dao ladrilhos de ~0.30 m (antes eram quase meio metro cada).
    floor: stdMat('bb-floor', {
      map: tileTex(13), roughness: 0.34, metalness: 0.06,
    }),
    // Sem envMap na cena, metalness 1.0 deixava o espelho PRETO. Metalness
    // baixo + o falso reflexo tambem no emissive faz o vidro "acender".
    mirror: stdMat('bb-mirror', {
      color: 0xf2f7fa, metalness: 0.3, roughness: 0.1,
      map: fakeReflectionTex(),
      emissive: 0xffffff, emissiveMap: fakeReflectionTex(), emissiveIntensity: 0.5,
    }),
    bulb: emissive(0xffe3b0, 2.2),
    glow: emissive(0xfff0d2, 1.6),
    glassClear: glass(0xd8ecf4, 0.3),
    glassBlue: glass(0x2f7fd6, 0.45),
    towel: solid(0xe9eef2, 0.92),
    towelAlt: solid(0xd8e2ea, 0.92),
    plantLeaf: solid(0x3f8a46, 0.85),
    plantLeafDark: solid(0x2f6a37, 0.88),
    pot: solid(0xb2603d, 0.85),
    soil: solid(0x33261c, 0.98),
    hair: solid(0x2a2119, 0.95),
    paper: solid(0xf5f2ea, 0.9),
  }
}

/** Gradiente + manchas: finge o reflexo do ambiente no espelho. */
function fakeReflectionTex() {
  return tex('bb-fakerefl', 256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s)
    grd.addColorStop(0.0, '#d5e2ea')
    grd.addColorStop(0.42, '#9fb2be')
    grd.addColorStop(0.58, '#8496a3')
    grd.addColorStop(1.0, '#5e6b75')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 14 + Math.random() * 60
      const rg = g.createRadialGradient(x, y, 0, x, y, r)
      const v = Math.random() > 0.5 ? '255,255,255' : '40,55,70'
      rg.addColorStop(0, 'rgba(' + v + ',0.20)')
      rg.addColorStop(1, 'rgba(' + v + ',0)')
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
  }, 1)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Plano vertical (parede/quadro) com normal controlada por rotY. */
function vplane(w, h, mat, x, y, z, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(x, y, z)
  m.rotation.y = rotY
  m.receiveShadow = true
  return m
}

function collider(minX, maxX, minZ, maxZ, tag) {
  return { minX, maxX, minZ, maxZ, tag }
}

/** Colisor a partir de centro + meia-extensao. */
function colAt(x, z, hx, hz, tag) {
  return collider(x - hx, x + hx, z - hz, z + hz, tag)
}

/**
 * Chama Props.makeX(...args) com ARGUMENTOS POSICIONAIS (as funcoes de props.js
 * nao recebem objeto de opcoes). Se o prop nao existe ou explode, cai num
 * fallback local para o cenario nunca ficar furado.
 */
function prop(name, args, fallback) {
  try {
    const fn = Props && Props[name]
    if (typeof fn === 'function') {
      const o = fn.apply(null, args || [])
      if (o && o.isObject3D) return o
    }
  } catch (e) { /* usa fallback */ }
  return fallback()
}

/**
 * Remove qualquer luz que venha de dentro de um prop. A barbearia controla a
 * propria iluminacao (no maximo 3 PointLights); props que trazem luz propria
 * estouravam o orcamento de luzes da cena.
 */
function stripLights(obj) {
  const found = []
  obj.traverse((c) => { if (c.isLight) found.push(c) })
  for (const l of found) if (l.parent) l.parent.remove(l)
  if (obj.userData && Array.isArray(obj.userData.lights)) obj.userData.lights.length = 0
  return obj
}

/** Escala uniforme para o objeto bater com a largura pedida (props alheios). */
function fitWidth(obj, targetW) {
  const bb = new THREE.Box3().setFromObject(obj)
  const w = bb.max.x - bb.min.x
  if (!isFinite(w) || w < 1e-4) return obj
  const k = targetW / w
  if (!isFinite(k) || k <= 0) return obj
  if (k > 0.97 && k < 1.03) return obj // ja esta na medida, nao mexe
  if (k < 0.2 || k > 5) return obj     // fator absurdo: prop errado, melhor deixar
  obj.scale.multiplyScalar(k)
  return obj
}

function shadowOn(o) {
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return o
}

// ---------------------------------------------------------------------------
// Fallbacks locais dos props compartilhados
// ---------------------------------------------------------------------------

function fbCeilingLamp(M) {
  const g = new THREE.Group()
  const base = cyl(0.09, 0.09, 0.06, M.chromeDim, 12); base.position.y = -0.03
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    solid(0xf6f1e4, 0.5),
  )
  bowl.position.y = -0.1
  bowl.castShadow = true; bowl.receiveShadow = true
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), M.glow)
  lens.rotation.x = Math.PI / 2
  lens.position.y = -0.11
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.018, 8, 22), M.chromeDim)
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.105
  ring.castShadow = true
  g.add(base, bowl, lens, ring)
  return g
}

// Mesma assinatura posicional de Props.makeFramedPicture(w, h, kind, seed).
function fbFramedPicture(M, w, h, kind, seed, gold) {
  const g = new THREE.Group()
  const frameMat = gold ? solid(0xb59243, 0.35, 0.75) : M.woodDark
  const t = 0.055, d = 0.05
  const top = box(w + t * 2, t, d, frameMat, 0, h / 2 + t / 2, 0)
  const bot = box(w + t * 2, t, d, frameMat, 0, -h / 2 - t / 2, 0)
  const lf = box(t, h, d, frameMat, -w / 2 - t / 2, 0, 0)
  const rt = box(t, h, d, frameMat, w / 2 + t / 2, 0, 0)
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), paintingMat(seed || 0, kind || 'abstract'))
  art.position.z = d / 2 - 0.004
  art.receiveShadow = true
  const back = box(w + t, h + t, 0.02, M.woodDark, 0, 0, -d / 2)
  g.add(top, bot, lf, rt, art, back)
  return g
}

function fbWallClock(M) {
  const g = new THREE.Group()
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.028, 10, 28), M.chromeDim)
  rim.castShadow = true; rim.receiveShadow = true
  const body = cyl(0.19, 0.19, 0.05, solid(0xf7f4ec, 0.85), 26)
  body.rotation.x = Math.PI / 2; body.position.z = -0.012
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.175, 26), solid(0xfbf8f0, 0.8))
  face.position.z = 0.017
  const hm = solid(0x1c1c20, 0.6)
  const tickG = new THREE.BoxGeometry(0.012, 0.028, 0.006)
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(tickG, hm)
    const a = (i / 12) * Math.PI * 2
    t.position.set(Math.sin(a) * 0.145, Math.cos(a) * 0.145, 0.02)
    t.rotation.z = -a
    g.add(t)
  }
  const hh = box(0.018, 0.085, 0.008, hm, 0, 0.04, 0.024)
  const mh = box(0.014, 0.13, 0.008, hm, 0, 0.06, 0.03)
  mh.rotation.z = -2.1
  const cap = cyl(0.016, 0.016, 0.02, solid(PALETTE.red, 0.5), 10)
  cap.rotation.x = Math.PI / 2; cap.position.z = 0.034
  g.add(rim, body, face, hh, mh, cap)
  return g
}

function fbBarberPole(M) {
  const g = new THREE.Group()
  const bracket = box(0.09, 0.09, 0.16, M.chromeDim, 0, 0.7, -0.13)
  const capT = cyl(0.11, 0.095, 0.11, M.chromeDim, 16); capT.position.y = 1.16
  const capB = cyl(0.095, 0.11, 0.11, M.chromeDim, 16); capB.position.y = 0.24
  const knob = sphere(0.06, M.chromeDim, 12); knob.position.y = 1.25
  const stripeTex = tex('bb-poletex', 128, (c, s) => {
    c.fillStyle = '#f2f2ef'; c.fillRect(0, 0, s, s)
    c.lineWidth = 16
    for (let i = -2; i < 8; i++) {
      c.strokeStyle = '#cc2b2b'
      c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32 + s, s); c.stroke()
      c.strokeStyle = '#2b57cc'
      c.beginPath(); c.moveTo(i * 32 + 16, 0); c.lineTo(i * 32 + 16 + s, s); c.stroke()
    }
  }, 1)
  const stripeMat = stdMat('bb-polemat', {
    map: stripeTex, roughness: 0.45, emissive: 0xffffff, emissiveMap: stripeTex, emissiveIntensity: 0.22,
  })
  const core = cyl(0.085, 0.085, 0.82, stripeMat, 20); core.position.y = 0.7
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.84, 20, 1, true), M.glassClear)
  tube.position.y = 0.7
  g.add(bracket, capT, capB, knob, core, tube)
  g.userData.spinTex = stripeTex
  return g
}

// ---------------------------------------------------------------------------
// CADEIRA DE BARBEIRO
// Base cromada pesada, pistao com alavanca, estofado vermelho com costuras,
// bracos curvos, apoio de pes com estrias. Origem no chao, frente = +Z.
// ---------------------------------------------------------------------------
function makeBarberChair(M) {
  const g = new THREE.Group()

  // --- base em disco pesado
  // Larguras enxugadas (~12%) em relacao ao esboco original: com a base de 1 m
  // de diametro e o assento de 0.68 o cliente sentado parecia uma crianca.
  const foot = cyl(0.38, 0.43, 0.07, M.chrome, 28); foot.position.y = 0.035
  const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.03, 8, 30), M.chromeDim)
  footRing.rotation.x = Math.PI / 2; footRing.position.y = 0.062
  footRing.castShadow = true; footRing.receiveShadow = true
  const hub = cyl(0.26, 0.35, 0.09, M.chrome, 24); hub.position.y = 0.115
  const collar = cyl(0.18, 0.23, 0.06, M.darkMetal, 20); collar.position.y = 0.18
  g.add(foot, footRing, hub, collar)

  // --- pistao hidraulico (camisa canelada + haste cromada)
  const sleeve = cyl(0.115, 0.115, 0.26, M.darkMetal, 18); sleeve.position.y = 0.32
  g.add(sleeve)
  const ribG = new THREE.TorusGeometry(0.118, 0.016, 6, 20)
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ribG, M.chromeDim)
    r.rotation.x = Math.PI / 2
    r.position.y = 0.24 + i * 0.08
    r.castShadow = true; r.receiveShadow = true
    g.add(r)
  }
  const rod = cyl(0.072, 0.072, 0.3, M.chrome, 16); rod.position.y = 0.56
  const swivel = cyl(0.21, 0.17, 0.055, M.chrome, 22); swivel.position.y = 0.63
  g.add(rod, swivel)

  // --- alavanca de altura, saindo pra direita
  const leverBoss = cyl(0.05, 0.05, 0.1, M.darkMetal, 12)
  leverBoss.rotation.z = Math.PI / 2; leverBoss.position.set(0.14, 0.34, 0.04)
  const lever = cyl(0.021, 0.021, 0.4, M.chrome, 10)
  lever.rotation.z = Math.PI / 2; lever.rotation.y = -0.22
  lever.position.set(0.36, 0.34, 0.09)
  const leverKnob = sphere(0.048, M.black, 12); leverKnob.position.set(0.56, 0.34, 0.14)
  g.add(leverBoss, lever, leverKnob)

  // --- apoio de pes: braco curvo + degrau com estrias
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.17, 0.2),
    new THREE.Vector3(0, 0.2, 0.36),
    new THREE.Vector3(0, 0.28, 0.5),
    new THREE.Vector3(0, 0.33, 0.58),
  ])
  const footArm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 16, 0.035, 8, false), M.chrome)
  footArm.castShadow = true; footArm.receiveShadow = true
  const step = box(0.42, 0.035, 0.24, M.chromeDim, 0, 0.355, 0.6)
  const stepLip = box(0.42, 0.05, 0.03, M.chromeDim, 0, 0.375, 0.715)
  g.add(footArm, step, stepLip)
  const striG = new THREE.BoxGeometry(0.36, 0.013, 0.017) // estrias antiderrapantes
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(striG, M.steel)
    s.position.set(0, 0.377, 0.52 + i * 0.032)
    s.castShadow = true; s.receiveShadow = true
    g.add(s)
  }

  // --- assento estofado
  const seatFrame = box(0.54, 0.07, 0.56, M.darkMetal, 0, 0.665, 0.02)
  const seat = roundedBox(0.6, 0.18, 0.64, 0.075, M.leather)
  seat.position.set(0, SEAT_Y, 0.02)
  const seatLip = roundedBox(0.62, 0.06, 0.66, 0.03, M.leatherLip)
  seatLip.position.set(0, 0.665, 0.02)
  g.add(seatFrame, seat, seatLip)
  // costuras: sulcos escuros no estofado
  const seamG = new THREE.BoxGeometry(0.54, 0.014, 0.022)
  for (let i = -1; i <= 1; i++) {
    const s = new THREE.Mesh(seamG, M.seam)
    s.position.set(0, 0.825, 0.02 + i * 0.18)
    s.castShadow = false; s.receiveShadow = true
    g.add(s)
  }

  // --- encosto (inclinado) + apoio de cabeca
  const backPivot = new THREE.Group()
  backPivot.position.set(0, 0.79, -0.3)
  backPivot.rotation.x = 0.15
  const back = roundedBox(0.56, 0.9, 0.19, 0.085, M.leather)
  back.position.set(0, 0.45, 0)
  backPivot.add(back)
  const backSeamG = new THREE.BoxGeometry(0.49, 0.016, 0.022)
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(backSeamG, M.seam)
    s.position.set(0, 0.22 + i * 0.23, 0.096)
    s.receiveShadow = true
    backPivot.add(s)
  }
  // trim cromado nas laterais do encosto
  const trimG = new THREE.BoxGeometry(0.035, 0.86, 0.035)
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(trimG, M.chromeDim)
    t.position.set(sx * 0.29, 0.45, -0.02)
    t.castShadow = true; t.receiveShadow = true
    backPivot.add(t)
  }
  const hrStem = cyl(0.022, 0.022, 0.16, M.chrome, 10); hrStem.position.set(0, 0.94, -0.01)
  const headrest = roundedBox(0.3, 0.22, 0.16, 0.07, M.leather)
  headrest.position.set(0, 1.09, 0.0)
  const hrSeam = box(0.25, 0.014, 0.02, M.seam, 0, 1.09, 0.082)
  backPivot.add(hrStem, headrest, hrSeam)
  g.add(backPivot)

  // --- apoios de braco cromados curvos com almofada
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.27, 0.68, -0.24),
      new THREE.Vector3(sx * 0.325, 0.86, -0.14),
      new THREE.Vector3(sx * 0.325, 0.93, 0.08),
      new THREE.Vector3(sx * 0.31, 0.86, 0.3),
      new THREE.Vector3(sx * 0.28, 0.7, 0.38),
    ])
    const tube = new THREE.Mesh(new THREE.TubeGeometry(c, 22, 0.029, 8, false), M.chrome)
    tube.castShadow = true; tube.receiveShadow = true
    const pad = roundedBox(0.1, 0.055, 0.44, 0.026, M.black)
    pad.position.set(sx * 0.32, 0.955, 0.06)
    g.add(tube, pad)
  }

  shadowOn(g)
  return g
}

// ---------------------------------------------------------------------------
// ACESSORIOS DA BANCADA
// ---------------------------------------------------------------------------

function makeScissors(M) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const blade = box(0.012, 0.006, 0.11, M.chrome, sx * 0.007, 0, 0.055)
    blade.rotation.y = sx * 0.05
    const arm = box(0.011, 0.006, 0.06, M.chrome, sx * 0.014, 0, -0.03)
    arm.rotation.y = -sx * 0.16
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), M.black)
    ring.rotation.x = Math.PI / 2
    ring.position.set(sx * 0.028, 0, -0.075)
    ring.castShadow = true; ring.receiveShadow = true
    g.add(blade, arm, ring)
  }
  const pin = cyl(0.008, 0.008, 0.018, M.chromeDim, 8)
  pin.rotation.x = Math.PI / 2
  g.add(pin)
  return shadowOn(g)
}

function makeClipper(M) {
  const g = new THREE.Group()
  const body = roundedBox(0.055, 0.14, 0.05, 0.016, M.black)
  body.position.y = 0.07
  const strip = box(0.05, 0.012, 0.052, solid(0xc8a13a, 0.4, 0.7), 0, 0.108, 0)
  const comb = box(0.058, 0.012, 0.03, M.chrome, 0, 0.148, 0.006)
  const teeth = box(0.056, 0.006, 0.014, M.chromeDim, 0, 0.154, 0.022)
  const sw = box(0.014, 0.03, 0.01, solid(0x9b2222, 0.5), 0, 0.05, 0.03)
  g.add(body, strip, comb, teeth, sw)
  // fio enrolando pra tras
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.005, -0.02),
    new THREE.Vector3(0.06, 0.004, -0.09),
    new THREE.Vector3(-0.03, 0.004, -0.16),
    new THREE.Vector3(-0.12, 0.004, -0.12),
  ])
  const cord = new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.007, 6, false), M.black)
  cord.castShadow = true; cord.receiveShadow = true
  g.add(cord)
  return shadowOn(g)
}

function makeCombJar(M) {
  const g = new THREE.Group()
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.19, 18, 1, true), M.glassClear)
  jar.position.y = 0.095
  const liquid = cyl(0.05, 0.046, 0.13, solid(0x2f7fd6, 0.2, 0.1, { transparent: true, opacity: 0.75 }), 18)
  liquid.position.y = 0.068
  const bottom = cyl(0.05, 0.05, 0.012, M.glassClear, 18); bottom.position.y = 0.006
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.007, 6, 20), solid(0xd9e6ee, 0.25, 0.3))
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.19
  g.add(jar, liquid, bottom, rim)
  const combG = new THREE.BoxGeometry(0.035, 0.2, 0.005)
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(combG, solid(i % 2 ? 0x1e1e22 : 0x3b3b44, 0.55))
    const a = (i / 5) * Math.PI * 2
    c.position.set(Math.cos(a) * 0.022, 0.17, Math.sin(a) * 0.022)
    c.rotation.set(Math.sin(a) * 0.18, -a, Math.cos(a) * 0.18)
    c.castShadow = true; c.receiveShadow = true
    g.add(c)
  }
  return g
}

function makeSprayBottle(M) {
  const g = new THREE.Group()
  const body = cyl(0.038, 0.042, 0.16, M.glassClear, 16); body.position.y = 0.08
  const water = cyl(0.034, 0.038, 0.09, solid(0x8fd0e8, 0.15, 0.05, { transparent: true, opacity: 0.6 }), 16)
  water.position.y = 0.05
  const neck = cyl(0.02, 0.026, 0.03, M.black, 12); neck.position.y = 0.175
  const head = box(0.05, 0.05, 0.07, M.black, 0, 0.21, 0.01)
  const nozzle = cyl(0.012, 0.012, 0.04, M.chromeDim, 10)
  nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, 0.222, 0.06)
  const trigger = box(0.016, 0.05, 0.02, M.black, 0, 0.175, -0.035)
  trigger.rotation.x = 0.3
  const tube = cyl(0.005, 0.005, 0.14, M.chromeDim, 6); tube.position.y = 0.085
  g.add(body, water, neck, head, nozzle, trigger, tube)
  return shadowOn(g)
}

function makeBottle(M, color, h, r) {
  const g = new THREE.Group()
  const body = cyl(r * 0.94, r, h, solid(color, 0.25, 0.1, { transparent: true, opacity: 0.85 }), 16)
  body.position.y = h / 2
  const shoulder = cyl(0.018, r * 0.94, h * 0.16, solid(color, 0.25, 0.1, { transparent: true, opacity: 0.85 }), 16)
  shoulder.position.y = h + h * 0.08
  const neck = cyl(0.017, 0.017, h * 0.14, solid(color, 0.3, 0.1), 10)
  neck.position.y = h + h * 0.22
  const cap = cyl(0.023, 0.023, h * 0.13, M.black, 12)
  cap.position.y = h + h * 0.34
  const label = cyl(r * 1.01, r * 1.01, h * 0.34, solid(0xf3efe4, 0.85), 16)
  label.position.y = h * 0.42
  const band = cyl(r * 1.02, r * 1.02, h * 0.06, solid(0x2a2a30, 0.7), 16)
  band.position.y = h * 0.27
  g.add(body, shoulder, neck, cap, label, band)
  return shadowOn(g)
}

function makeTowelStack(M, n) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const t = roundedBox(0.26, 0.045, 0.19, 0.018, i % 2 ? M.towelAlt : M.towel)
    t.position.set((Math.random() - 0.5) * 0.012, 0.024 + i * 0.047, (Math.random() - 0.5) * 0.012)
    t.rotation.y = (Math.random() - 0.5) * 0.09
    g.add(t)
    const fold = box(0.26, 0.008, 0.014, solid(0xc9d3db, 0.9), t.position.x, t.position.y, t.position.z + 0.09)
    fold.rotation.y = t.rotation.y
    g.add(fold)
  }
  return shadowOn(g)
}

function makeHairdryer(M) {
  const g = new THREE.Group()
  const barrel = cyl(0.048, 0.052, 0.17, M.black, 16)
  barrel.rotation.z = Math.PI / 2
  barrel.position.set(0, 0.085, 0)
  const nozzle = cyl(0.03, 0.048, 0.06, M.darkMetal, 14)
  nozzle.rotation.z = Math.PI / 2
  nozzle.position.set(0.115, 0.085, 0)
  const backGrid = cyl(0.05, 0.05, 0.012, M.steel, 14)
  backGrid.rotation.z = Math.PI / 2
  backGrid.position.set(-0.088, 0.085, 0)
  const handle = roundedBox(0.045, 0.13, 0.05, 0.016, M.black)
  handle.position.set(-0.035, 0.02, 0)
  handle.rotation.z = 0.16
  const sw = box(0.02, 0.028, 0.052, solid(0xb02a2a, 0.5), -0.03, 0.045, 0)
  g.add(barrel, nozzle, backGrid, handle, sw)
  const c = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 0.0, 0),
    new THREE.Vector3(-0.13, 0.004, 0.06),
    new THREE.Vector3(-0.24, 0.004, -0.02),
  ])
  const cord = new THREE.Mesh(new THREE.TubeGeometry(c, 16, 0.007, 6, false), M.black)
  cord.castShadow = true; cord.receiveShadow = true
  g.add(cord)
  return shadowOn(g)
}

function makeCashRegister(M) {
  const g = new THREE.Group()
  const base = roundedBox(0.42, 0.16, 0.36, 0.03, solid(0xe2ded3, 0.7))
  base.position.y = 0.08
  const drawer = box(0.4, 0.09, 0.03, solid(0xc9c4b8, 0.7), 0, 0.08, 0.183)
  const handle = cyl(0.01, 0.01, 0.16, M.chromeDim, 8)
  handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.08, 0.2)
  const upper = roundedBox(0.34, 0.2, 0.3, 0.03, solid(0xe6e2d8, 0.7))
  upper.position.set(0, 0.26, -0.02)
  const screen = box(0.24, 0.13, 0.03, solid(0x1f2a24, 0.4))
  screen.position.set(0, 0.42, -0.04)
  screen.rotation.x = -0.32
  const screenGlow = box(0.2, 0.09, 0.01, emissive(0x63d69a, 1.0), 0, 0.425, -0.023)
  screenGlow.rotation.x = -0.32
  g.add(base, drawer, handle, upper, screen, screenGlow)
  const keyG = new THREE.BoxGeometry(0.028, 0.012, 0.028)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const k = new THREE.Mesh(keyG, solid(c === 3 ? 0x9b2b2b : 0x33363c, 0.6))
      k.position.set(-0.06 + c * 0.04, 0.365, 0.06 - r * 0.038)
      k.castShadow = true; k.receiveShadow = true
      g.add(k)
    }
  }
  const roll = cyl(0.032, 0.032, 0.1, M.paper, 12)
  roll.rotation.z = Math.PI / 2
  roll.position.set(0.14, 0.4, -0.06)
  const slip = box(0.07, 0.001, 0.09, M.paper, 0.14, 0.43, 0.02)
  slip.rotation.x = 0.2
  g.add(roll, slip)
  return shadowOn(g)
}

function makeCandyJar(M) {
  const g = new THREE.Group()
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.2, 20, 1, true), M.glassClear)
  jar.position.y = 0.1
  const bottom = cyl(0.085, 0.085, 0.014, M.glassClear, 20); bottom.position.y = 0.007
  const lid = cyl(0.095, 0.095, 0.03, solid(0xc3a04a, 0.35, 0.65), 20); lid.position.y = 0.215
  const knob = sphere(0.026, solid(0xc3a04a, 0.35, 0.65), 12); knob.position.y = 0.245
  g.add(jar, bottom, lid, knob)
  // balas: instanced pra ficar barato
  const cG = new THREE.SphereGeometry(0.017, 8, 6)
  const N = 46
  const inst = new THREE.InstancedMesh(cG, new THREE.MeshStandardMaterial({ roughness: 0.35 }), N)
  const dummy = new THREE.Object3D()
  const col = new THREE.Color()
  const hues = [0xe04b4b, 0xf0c437, 0x4bb45f, 0x4b7fe0, 0xd857c8]
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.06
    dummy.position.set(Math.cos(a) * rr, 0.022 + Math.random() * 0.13, Math.sin(a) * rr)
    dummy.rotation.set(Math.random() * 3, Math.random() * 3, 0)
    dummy.updateMatrix()
    inst.setMatrixAt(i, dummy.matrix)
    inst.setColorAt(i, col.setHex(hues[i % hues.length]))
  }
  inst.castShadow = true
  g.add(inst)
  return g
}

// ---------------------------------------------------------------------------
// MOVEIS DE ESPERA / SERVICO
// ---------------------------------------------------------------------------

function makeWaitBench(M) {
  // Banco de 3 lugares, encosto e divisorias. Frente = +Z.
  const g = new THREE.Group()
  const railG = new THREE.CylinderGeometry(0.022, 0.022, 2.5, 10)
  for (const zz of [-0.22, 0.22]) {
    for (const yy of [0.14, 0.36]) {
      const r = new THREE.Mesh(railG, M.chrome)
      r.rotation.z = Math.PI / 2
      r.position.set(0, yy, zz)
      r.castShadow = true; r.receiveShadow = true
      g.add(r)
    }
  }
  const legG = new THREE.CylinderGeometry(0.028, 0.032, 0.4, 10)
  for (const xx of [-1.1, 0, 1.1]) {
    for (const zz of [-0.22, 0.22]) {
      const l = new THREE.Mesh(legG, M.chrome)
      l.position.set(xx, 0.2, zz)
      l.castShadow = true; l.receiveShadow = true
      g.add(l)
    }
  }
  for (let i = -1; i <= 1; i++) {
    const cushion = roundedBox(0.72, 0.13, 0.52, 0.05, M.leather)
    cushion.position.set(i * 0.8, 0.46, 0.02)
    const seam = box(0.62, 0.012, 0.02, M.seam, i * 0.8, 0.53, 0.02)
    const backP = roundedBox(0.72, 0.44, 0.13, 0.05, M.leather)
    backP.position.set(i * 0.8, 0.72, -0.24)
    backP.rotation.x = -0.12
    const bseam = box(0.62, 0.012, 0.02, M.seam, i * 0.8, 0.72, -0.175)
    g.add(cushion, seam, backP, bseam)
  }
  // divisorias / apoios de braco
  const armG = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8)
  for (const xx of [-1.22, -0.4, 0.4, 1.22]) {
    const a = new THREE.Mesh(armG, M.chrome)
    a.rotation.x = Math.PI / 2
    a.position.set(xx, 0.62, 0.02)
    a.castShadow = true; a.receiveShadow = true
    const post = cyl(0.02, 0.02, 0.2, M.chrome, 8)
    post.position.set(xx, 0.53, -0.2)
    g.add(a, post)
  }
  const backFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 2.5, 10), M.chrome)
  backFrame.rotation.z = Math.PI / 2
  backFrame.position.set(0, 0.96, -0.29)
  backFrame.castShadow = true; backFrame.receiveShadow = true
  g.add(backFrame)
  return shadowOn(g)
}

function makeMagazineTable(M) {
  const g = new THREE.Group()
  const top = roundedBox(1.0, 0.05, 0.58, 0.02, M.wood)
  top.position.y = 0.44
  const shelf = box(0.86, 0.03, 0.46, M.woodDark, 0, 0.16, 0)
  g.add(top, shelf)
  const legG = new THREE.CylinderGeometry(0.022, 0.022, 0.44, 10)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(legG, M.chrome)
    l.position.set(sx * 0.44, 0.22, sz * 0.24)
    l.castShadow = true; l.receiveShadow = true
    g.add(l)
  }
  // pilha de revistas
  const magG = new THREE.BoxGeometry(0.22, 0.012, 0.3)
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(magG, paintingMat(30 + (i % 3), i % 2 ? 'abstract' : 'sale'))
    m.position.set(-0.2 + (Math.random() - 0.5) * 0.03, 0.472 + i * 0.013, 0.02 + (Math.random() - 0.5) * 0.03)
    m.rotation.y = (Math.random() - 0.5) * 0.5
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(magG, paintingMat(40 + i, 'barber'))
    m.position.set(0.24, 0.472 + i * 0.013, -0.02)
    m.rotation.y = 0.3 + (Math.random() - 0.5) * 0.4
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
  return shadowOn(g)
}

function makeWaterCooler(M) {
  const g = new THREE.Group()
  const body = roundedBox(0.44, 0.98, 0.42, 0.05, solid(0xe8e6e0, 0.6))
  body.position.y = 0.49
  const backPanel = box(0.4, 0.4, 0.03, solid(0x3a4046, 0.5), 0, 0.72, 0.205)
  const tray = box(0.26, 0.02, 0.16, M.steel, 0, 0.5, 0.21)
  const trayGrid = box(0.24, 0.012, 0.14, M.chromeDim, 0, 0.512, 0.21)
  for (const sx of [-1, 1]) {
    const tap = cyl(0.018, 0.018, 0.08, M.chromeDim, 8)
    tap.rotation.x = Math.PI / 2
    tap.position.set(sx * 0.08, 0.7, 0.24)
    const lever = box(0.05, 0.03, 0.05, solid(sx < 0 ? 0x3b6fd6 : 0xd63b3b, 0.5), sx * 0.08, 0.75, 0.245)
    g.add(tap, lever)
  }
  const collar = cyl(0.15, 0.19, 0.08, solid(0xd6d3cc, 0.6), 18); collar.position.y = 1.01
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.44, 20), M.glassBlue)
  bottle.position.y = 1.26
  bottle.castShadow = true
  const bNeck = cyl(0.07, 0.11, 0.12, M.glassBlue, 14); bNeck.position.y = 1.03
  const cups = cyl(0.045, 0.045, 0.28, solid(0xf0eee8, 0.8), 12)
  cups.position.set(0.28, 0.86, 0.0)
  g.add(body, backPanel, tray, trayGrid, collar, bottle, bNeck, cups)
  return shadowOn(g)
}

function makeCoatRack(M) {
  const g = new THREE.Group()
  const base = cyl(0.05, 0.24, 0.06, M.darkMetal, 18); base.position.y = 0.03
  const pole = cyl(0.035, 0.045, 1.78, M.wood, 14); pole.position.y = 0.92
  const top = sphere(0.055, M.woodDark, 12); top.position.y = 1.83
  g.add(base, pole, top)
  const hookG = new THREE.TorusGeometry(0.05, 0.014, 6, 12, Math.PI * 1.2)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const arm = cyl(0.018, 0.018, 0.18, M.wood, 8)
    arm.rotation.z = Math.PI / 2
    arm.rotation.y = -a
    arm.position.set(Math.cos(a) * 0.09, 1.66 - (i % 2) * 0.16, Math.sin(a) * 0.09)
    const hook = new THREE.Mesh(hookG, M.chromeDim)
    hook.position.set(Math.cos(a) * 0.19, 1.64 - (i % 2) * 0.16, Math.sin(a) * 0.19)
    hook.rotation.y = -a
    hook.castShadow = true; hook.receiveShadow = true
    g.add(arm, hook)
  }
  // um casaco pendurado, pra nao ficar vazio
  const coat = roundedBox(0.3, 0.7, 0.16, 0.07, solid(0x35506b, 0.9))
  coat.position.set(0.2, 1.28, 0.05)
  g.add(coat)
  return shadowOn(g)
}

function makeTrashBin(M) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.56, 18, 1, true), M.steel)
  body.position.y = 0.28
  body.castShadow = true; body.receiveShadow = true
  const bottom = cyl(0.17, 0.17, 0.02, M.darkMetal, 18); bottom.position.y = 0.01
  const lidRing = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 22), M.chromeDim)
  lidRing.rotation.x = Math.PI / 2; lidRing.position.y = 0.56
  lidRing.castShadow = true; lidRing.receiveShadow = true
  const lid = cyl(0.2, 0.2, 0.035, M.darkMetal, 20); lid.position.y = 0.58
  const flap = box(0.19, 0.01, 0.13, M.black, 0, 0.6, 0)
  g.add(body, bottom, lidRing, lid, flap)
  const ribG = new THREE.TorusGeometry(0.185, 0.008, 6, 20)
  for (let i = 0; i < 2; i++) {
    const r = new THREE.Mesh(ribG, M.chromeDim)
    r.rotation.x = Math.PI / 2
    r.position.y = 0.2 + i * 0.18
    g.add(r)
  }
  return shadowOn(g)
}

function makeBroom(M) {
  const g = new THREE.Group()
  const stick = cyl(0.018, 0.02, 1.45, M.wood, 10); stick.position.y = 0.78
  const collarB = cyl(0.035, 0.05, 0.09, M.darkMetal, 12); collarB.position.y = 0.1
  const head = box(0.34, 0.07, 0.09, M.woodDark, 0, 0.055, 0)
  const bristles = box(0.34, 0.11, 0.075, solid(0x8a6a34, 0.95), 0, -0.02, 0)
  g.add(stick, collarB, head, bristles)
  const brG = new THREE.BoxGeometry(0.012, 0.12, 0.07)
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(brG, solid(i % 2 ? 0x7d5f2e : 0x99763c, 0.95))
    b.position.set(-0.15 + i * 0.0375, -0.03, 0)
    b.castShadow = true; b.receiveShadow = true
    g.add(b)
  }
  const grip = cyl(0.024, 0.024, 0.14, M.black, 10); grip.position.y = 1.4
  g.add(grip)
  return shadowOn(g)
}

function makePlant(M) {
  const g = new THREE.Group()
  const pot = cyl(0.24, 0.18, 0.34, M.pot, 18); pot.position.y = 0.17
  const rim = cyl(0.26, 0.24, 0.06, solid(0x9d5133, 0.85), 18); rim.position.y = 0.33
  const soil = cyl(0.22, 0.22, 0.03, M.soil, 18); soil.position.y = 0.345
  g.add(pot, rim, soil)
  const stemG = new THREE.CylinderGeometry(0.012, 0.018, 0.6, 6)
  const leafG = new THREE.SphereGeometry(0.15, 10, 7)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random()
    const lean = 0.25 + Math.random() * 0.35
    const stem = new THREE.Mesh(stemG, M.plantLeafDark)
    stem.position.set(Math.sin(a) * 0.09, 0.62, Math.cos(a) * 0.09)
    stem.rotation.set(Math.cos(a) * lean, 0, -Math.sin(a) * lean)
    stem.castShadow = true; stem.receiveShadow = true
    const leaf = new THREE.Mesh(leafG, i % 2 ? M.plantLeaf : M.plantLeafDark)
    const h = 0.9 + Math.random() * 0.35
    leaf.position.set(Math.sin(a) * (0.16 + lean * 0.5), h, Math.cos(a) * (0.16 + lean * 0.5))
    leaf.scale.set(1.0, 0.32, 0.55)
    leaf.rotation.set(0, -a, Math.sin(a) * 0.5)
    leaf.castShadow = true; leaf.receiveShadow = true
    g.add(stem, leaf)
  }
  return g
}

/** Capa de corte presa no pescoco do cliente. Origem no pescoco. */
function makeCape(M) {
  const g = new THREE.Group()
  const capeMat = solid(0x1d1d24, 0.82, 0.02, { side: THREE.DoubleSide })
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.92, 20, 3, true), capeMat)
  body.position.y = -0.42
  body.castShadow = true; body.receiveShadow = true
  const collarC = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.035, 8, 20), solid(0xf0eee6, 0.85))
  collarC.rotation.x = Math.PI / 2
  collarC.castShadow = true; collarC.receiveShadow = true
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), capeMat)
  shoulders.position.y = -0.08
  shoulders.scale.set(1.0, 0.88, 0.88)
  shoulders.castShadow = true; shoulders.receiveShadow = true
  g.add(body, collarC, shoulders)
  return g
}

// ---------------------------------------------------------------------------
// MOBILIA DE OCUPACAO
// A sala tem 15.4 x 15.4 m: sem estes moveis o miolo vira um deserto de piso.
// Tudo aqui e "coisa de barbearia de verdade": lavatorio, carrinho, estoque.
// ---------------------------------------------------------------------------

/** Sofa/poltrona estofada. Comprimento em X, frente = +Z. */
function makeSofa(M, len = 2.6) {
  const g = new THREE.Group()
  const fabric = solid(0x3f4b5c, 0.94)
  const fabricDark = solid(0x2e3949, 0.94)
  const base = roundedBox(len, 0.3, 0.86, 0.06, fabricDark)
  base.position.set(0, 0.26, 0)
  g.add(base)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = cyl(0.028, 0.024, 0.11, M.chrome, 8)
    l.position.set(sx * (len / 2 - 0.16), 0.055, sz * 0.33)
    g.add(l)
  }
  const back = roundedBox(len, 0.6, 0.2, 0.07, fabric)
  back.position.set(0, 0.7, -0.33)
  back.rotation.x = -0.13
  g.add(back)
  for (const sx of [-1, 1]) {
    const arm = roundedBox(0.19, 0.32, 0.84, 0.07, fabric)
    arm.position.set(sx * (len / 2 - 0.095), 0.57, 0.01)
    g.add(arm)
  }
  const n = Math.max(1, Math.round(len / 0.86))
  const cw = (len - 0.38) / n
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.19 + cw * (i + 0.5)
    const cush = roundedBox(cw - 0.03, 0.17, 0.72, 0.06, fabric)
    cush.position.set(x, 0.49, 0.05)
    const pil = roundedBox(cw - 0.08, 0.4, 0.13, 0.06, i % 2 ? fabricDark : fabric)
    pil.position.set(x, 0.76, -0.25)
    pil.rotation.x = -0.11
    g.add(cush, pil)
  }
  return shadowOn(g)
}

/** Carrinho de ferramentas com rodinhas (um ao lado de cada cadeira). */
function makeToolCart(M) {
  const g = new THREE.Group()
  const w = 0.46, d = 0.36
  const shelfG = new THREE.BoxGeometry(w, 0.028, d)
  const lipG = new THREE.BoxGeometry(w, 0.04, 0.018)
  for (const y of [0.24, 0.51, 0.78]) {
    const s = new THREE.Mesh(shelfG, M.steel)
    s.position.y = y
    g.add(s)
    for (const sz of [-1, 1]) {
      const lip = new THREE.Mesh(lipG, M.chromeDim)
      lip.position.set(0, y + 0.026, sz * (d / 2 - 0.009))
      g.add(lip)
    }
  }
  const postG = new THREE.CylinderGeometry(0.017, 0.017, 0.7, 8)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (w / 2 - 0.03), pz = sz * (d / 2 - 0.03)
    const p = new THREE.Mesh(postG, M.chrome)
    p.position.set(px, 0.47, pz)
    const wheel = sphere(0.035, M.darkMetal, 8)
    wheel.position.set(px, 0.045, pz)
    const fork = box(0.022, 0.07, 0.022, M.chromeDim, px, 0.115, pz)
    g.add(p, wheel, fork)
  }
  const bar = cyl(0.015, 0.015, w + 0.05, M.chrome, 8)
  bar.rotation.z = Math.PI / 2
  bar.position.set(0, 0.92, -d / 2 + 0.03)
  g.add(bar)
  for (const sx of [-1, 1]) {
    const st = cyl(0.013, 0.013, 0.15, M.chrome, 8)
    st.position.set(sx * (w / 2 - 0.03), 0.85, -d / 2 + 0.03)
    g.add(st)
  }
  return shadowOn(g)
}

/**
 * Estacao de lavagem: gabinete + cuba + torneira + cadeira reclinada.
 * Origem no chao; o gabinete encosta na parede (-Z) e o cliente entra por +Z.
 */
function makeShampooStation(M) {
  const g = new THREE.Group()
  const porcelain = solid(0xf2f3f1, 0.26, 0.03)
  g.add(box(1.1, 0.78, 0.48, M.wood, 0, 0.39, -0.38))
  g.add(box(1.18, 0.06, 0.54, M.counterTop, 0, 0.81, -0.38))
  for (const sx of [-1, 1]) {
    g.add(box(0.5, 0.62, 0.03, M.woodDark, sx * 0.27, 0.4, -0.145))
    const p = cyl(0.011, 0.011, 0.16, M.chromeDim, 8)
    p.rotation.z = Math.PI / 2
    p.position.set(sx * 0.27, 0.62, -0.12)
    g.add(p)
  }
  // cuba: meia esfera achatada com apoio de pescoco na borda da frente
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.27, 20, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    porcelain,
  )
  bowl.position.set(0, 0.98, -0.36)
  bowl.scale.set(1, 0.6, 1)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.026, 8, 24), porcelain)
  rim.rotation.x = Math.PI / 2
  rim.position.set(0, 0.98, -0.36)
  g.add(bowl, rim, box(0.2, 0.05, 0.1, porcelain, 0, 0.985, -0.11))
  // torneira, registros e ducha
  const stem = cyl(0.02, 0.022, 0.34, M.chrome, 10)
  stem.position.set(0, 1.03, -0.6)
  const spout = cyl(0.016, 0.016, 0.22, M.chrome, 10)
  spout.rotation.x = Math.PI / 2
  spout.position.set(0, 1.2, -0.5)
  g.add(stem, spout)
  for (const sx of [-1, 1]) {
    const h = cyl(0.012, 0.012, 0.1, M.chrome, 8)
    h.rotation.z = Math.PI / 2
    h.position.set(sx * 0.1, 1.03, -0.6)
    g.add(h)
  }
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.14, 1.0, -0.6),
    new THREE.Vector3(0.29, 0.86, -0.52),
    new THREE.Vector3(0.3, 0.96, -0.4),
    new THREE.Vector3(0.24, 1.06, -0.34),
  ]), 22, 0.012, 6, false), M.chromeDim)
  const showerHead = cyl(0.032, 0.02, 0.11, M.chrome, 10)
  showerHead.rotation.set(0.7, 0, 0.3)
  showerHead.position.set(0.24, 1.1, -0.32)
  g.add(hose, showerHead)
  // cadeira reclinada
  const foot = cyl(0.3, 0.32, 0.05, M.chromeDim, 20)
  foot.position.set(0, 0.025, 0.62)
  const ped = cyl(0.11, 0.22, 0.4, M.darkMetal, 16)
  ped.position.set(0, 0.24, 0.62)
  const seat = roundedBox(0.6, 0.16, 0.72, 0.06, M.leather)
  seat.position.set(0, 0.47, 0.66)
  g.add(foot, ped, seat)
  const piv = new THREE.Group()
  piv.position.set(0, 0.5, 0.36)
  piv.rotation.x = -0.72                 // encosto deitado por cima da cuba
  const back = roundedBox(0.56, 0.8, 0.18, 0.07, M.leather)
  back.position.set(0, 0.4, 0)
  const hr = roundedBox(0.28, 0.16, 0.14, 0.06, M.leather)
  hr.position.set(0, 0.86, 0)
  piv.add(back, hr)
  g.add(piv)
  for (const sx of [-1, 1]) {
    const arm = cyl(0.026, 0.026, 0.5, M.chrome, 8)
    arm.rotation.x = Math.PI / 2
    arm.position.set(sx * 0.31, 0.66, 0.68)
    const post = cyl(0.022, 0.022, 0.2, M.chrome, 8)
    post.position.set(sx * 0.31, 0.57, 0.86)
    g.add(arm, post)
  }
  const step = box(0.46, 0.04, 0.28, M.chromeDim, 0, 0.26, 1.16)
  const stepArm = cyl(0.026, 0.026, 0.42, M.chrome, 8)
  stepArm.rotation.x = Math.PI / 2 - 0.5
  stepArm.position.set(0, 0.36, 1.02)
  g.add(step, stepArm)
  return shadowOn(g)
}

/** Armario baixo de toalhas com portas de vidro. Frente = +Z. */
function makeTowelCabinet(M, w = 1.6, h = 1.1) {
  const g = new THREE.Group()
  const d = 0.44
  g.add(box(w, 0.1, d, M.woodDark, 0, 0.05, 0))
  g.add(box(w, h - 0.16, d, M.wood, 0, 0.1 + (h - 0.16) / 2, -0.01))
  g.add(box(w + 0.06, 0.06, d + 0.06, M.counterTop, 0, h - 0.03, 0))
  const nD = Math.max(2, Math.round(w / 0.8))
  const dw = (w - 0.08) / nD
  for (let i = 0; i < nD; i++) {
    const x = -w / 2 + 0.04 + dw * (i + 0.5)
    g.add(box(dw - 0.03, h - 0.3, 0.03, M.woodDark, x, h / 2, d / 2 - 0.005))
    const gl = box(dw - 0.14, h - 0.44, 0.012, M.glassClear, x, h / 2, d / 2 + 0.012)
    gl.castShadow = false
    g.add(gl)
    const pull = cyl(0.01, 0.01, 0.12, M.chromeDim, 8)
    pull.position.set(x + dw / 2 - 0.07, h / 2, d / 2 + 0.03)
    g.add(pull)
    // pilha de toalhas aparecendo pelo vidro
    for (let k = 0; k < 5; k++) {
      g.add(box(dw - 0.16, 0.05, d - 0.14, k % 2 ? M.towelAlt : M.towel, x, 0.24 + k * 0.058, -0.02))
    }
  }
  return shadowOn(g)
}

/** Estante metalica de estoque com caixas de papelao. Frente = +Z. */
function makeStockRack(M, w = 3.8, h = 2.0, d = 0.6) {
  const g = new THREE.Group()
  const postG = new THREE.BoxGeometry(0.06, h, 0.06)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(postG, M.steel)
    p.position.set(sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03))
    g.add(p)
  }
  const nShelf = 4
  const shelfG = new THREE.BoxGeometry(w - 0.02, 0.04, d - 0.02)
  const boxG = new THREE.BoxGeometry(0.4, 0.3, 0.42)
  const boxMats = [solid(0xb08a58, 0.95), solid(0x9c7a4c, 0.95), solid(0xc3a274, 0.95)]
  for (let i = 0; i < nShelf; i++) {
    const y = 0.25 + i * ((h - 0.35) / (nShelf - 1))
    const s = new THREE.Mesh(shelfG, M.chromeDim)
    s.position.y = y
    g.add(s)
    const n = Math.floor((w - 0.2) / 0.48)
    for (let k = 0; k < n; k++) {
      if ((i * 7 + k * 3) % 5 === 0) continue   // prateleira nunca 100% cheia
      const b = new THREE.Mesh(boxG, boxMats[(i + k) % 3])
      b.position.set(-w / 2 + 0.34 + k * 0.48, y + 0.17, ((i + k) % 2) * 0.06 - 0.03)
      b.rotation.y = (((i * 3 + k) % 5) - 2) * 0.05
      g.add(b)
    }
  }
  return shadowOn(g)
}

/** Balcao alto com estante vazada: e a parte central da divisoria. */
function makeBackBar(M, w) {
  const g = new THREE.Group()
  const d = 0.52
  g.add(box(w, 0.08, d - 0.1, M.woodDark, 0, 0.04, 0))
  g.add(box(w, 0.92, d, M.wood, 0, 0.52, 0))
  g.add(box(w + 0.1, 0.08, d + 0.1, M.counterTop, 0, 1.02, 0))
  const slatG = new THREE.BoxGeometry(0.07, 0.76, 0.03)
  const nS = Math.floor(w / 0.16)
  for (let i = 0; i < nS; i++) {
    const s = new THREE.Mesh(slatG, M.woodDark)
    s.position.set(-w / 2 + 0.08 + i * 0.16, 0.5, d / 2 + 0.015)
    g.add(s)
  }
  // estante vazada: montantes + prateleiras (da pra ver o fundo entre elas)
  const postG = new THREE.BoxGeometry(0.08, 1.35, 0.26)
  const nP = Math.max(2, Math.round(w / 1.5))
  for (let i = 0; i <= nP; i++) {
    const p = new THREE.Mesh(postG, M.woodDark)
    p.position.set(-w / 2 + (w / nP) * i, 1.72, 0)
    g.add(p)
  }
  const shG = new THREE.BoxGeometry(w, 0.05, 0.28)
  for (const y of [1.45, 1.95, 2.4]) {
    const s = new THREE.Mesh(shG, M.wood)
    s.position.set(0, y, 0)
    g.add(s)
  }
  return shadowOn(g)
}

/** Tapete de tres faixas (sem colisor: da pra pisar em cima). */
function makeRug(base = 0x7a2f34, border = 0xd9c9a8, w = 2.6, d = 3.6) {
  const g = new THREE.Group()
  const a = box(w, 0.014, d, solid(base, 0.98), 0, 0.007, 0)
  const b = box(w - 0.26, 0.016, d - 0.26, solid(border, 0.98), 0, 0.009, 0)
  const c = box(w - 0.46, 0.018, d - 0.46, solid(base, 0.98), 0, 0.011, 0)
  for (const m of [a, b, c]) { m.castShadow = false; m.receiveShadow = true }
  g.add(a, b, c)
  return g
}

/** Ventilador de teto. userData.blades gira no update(). */
function makeCeilingFan(M) {
  const g = new THREE.Group()
  const base = cyl(0.09, 0.11, 0.07, M.chromeDim, 12); base.position.y = -0.035
  const rod = cyl(0.024, 0.024, 0.4, M.chromeDim, 8); rod.position.y = -0.24
  const motor = cyl(0.16, 0.19, 0.14, M.darkMetal, 16); motor.position.y = -0.5
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 20), M.chromeDim)
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.44
  g.add(base, rod, motor, ring)
  const blades = new THREE.Group()
  blades.position.y = -0.52
  blades.userData.dynamic = true   // bake.js nao pode fundir o que gira
  const bladeG = new THREE.BoxGeometry(0.52, 0.016, 0.19)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const holder = box(0.16, 0.02, 0.08, M.chromeDim, Math.cos(a) * 0.18, 0.02, Math.sin(a) * 0.18)
    holder.rotation.y = -a
    const bl = new THREE.Mesh(bladeG, M.woodDark)
    bl.position.set(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46)
    bl.rotation.y = -a
    bl.rotation.z = 0.12
    blades.add(holder, bl)
  }
  shadowOn(blades)
  g.add(blades)
  // luminaria embaixo: so emissiva, sem PointLight (orcamento de 3 luzes)
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
    solid(0xf6f1e4, 0.5),
  )
  bowl.position.y = -0.6
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), M.glow)
  lens.rotation.x = Math.PI / 2
  lens.position.y = -0.62
  g.add(bowl, lens)
  g.userData.blades = blades
  return shadowOn(g)
}

/** Ventilador de pe. userData.blades gira no update(). */
function makePedestalFan(M) {
  const g = new THREE.Group()
  const base = cyl(0.05, 0.26, 0.06, M.darkMetal, 18); base.position.y = 0.03
  const pole = cyl(0.028, 0.034, 1.2, M.chromeDim, 10); pole.position.y = 0.66
  const motor = cyl(0.09, 0.1, 0.2, M.black, 14)
  motor.rotation.x = Math.PI / 2
  motor.position.set(0, 1.32, -0.07)
  g.add(base, pole, motor)
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 6, 26), M.chromeDim)
  cage.position.set(0, 1.32, 0.09)
  const cage2 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.011, 6, 22), M.chromeDim)
  cage2.position.set(0, 1.32, 0.1)
  g.add(cage, cage2)
  const barG = new THREE.BoxGeometry(0.5, 0.01, 0.01)
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(barG, M.chromeDim)
    b.position.set(0, 1.32, 0.09)
    b.rotation.z = (i / 6) * Math.PI
    g.add(b)
  }
  const blades = new THREE.Group()
  blades.position.set(0, 1.32, 0.02)
  blades.userData.dynamic = true
  const bladeG = new THREE.BoxGeometry(0.2, 0.011, 0.1)
  const bladeMat = solid(0xdfe3e6, 0.5)
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group()
    arm.rotation.z = (i / 3) * Math.PI * 2
    const bl = new THREE.Mesh(bladeG, bladeMat)
    bl.position.set(0.12, 0, 0)
    bl.rotation.x = 0.45
    arm.add(bl)
    blades.add(arm)
  }
  const hub = cyl(0.03, 0.03, 0.05, M.chromeDim, 10)
  hub.rotation.x = Math.PI / 2
  blades.add(hub)
  shadowOn(blades)
  g.add(blades)
  g.userData.blades = blades
  return shadowOn(g)
}

/** Radio de bancada (fica no balcao de atendimento). */
function makeRadio(M) {
  const g = new THREE.Group()
  const body = roundedBox(0.36, 0.2, 0.16, 0.03, M.wood)
  body.position.y = 0.1
  const dial = cyl(0.03, 0.03, 0.02, M.chromeDim, 12)
  dial.rotation.x = Math.PI / 2
  dial.position.set(0.12, 0.14, 0.082)
  const dial2 = cyl(0.026, 0.026, 0.02, M.chromeDim, 12)
  dial2.rotation.x = Math.PI / 2
  dial2.position.set(0.12, 0.06, 0.082)
  const scale = box(0.11, 0.045, 0.012, emissive(0xffd9a0, 0.9), 0.015, 0.15, 0.082)
  const ant = cyl(0.005, 0.008, 0.42, M.chromeDim, 6)
  ant.position.set(-0.15, 0.34, -0.05)
  ant.rotation.z = 0.32
  g.add(body, dial, dial2, scale, ant)
  const meshG = new THREE.BoxGeometry(0.15, 0.009, 0.012)
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(meshG, M.darkMetal)
    m.position.set(-0.09, 0.05 + i * 0.027, 0.084)
    g.add(m)
  }
  return shadowOn(g)
}

/** Quadro de precos pintado. Frente = +Z. */
function makePriceBoard(M, w = 0.98, h = 0.82) {
  const t = tex('bb-precos', 512, (c, s) => {
    c.fillStyle = '#20242b'; c.fillRect(0, 0, s, s)
    c.strokeStyle = '#c9a24a'; c.lineWidth = 7
    c.strokeRect(14, 14, s - 28, s - 28)
    c.textAlign = 'center'
    c.fillStyle = '#e8d29a'
    c.font = 'bold 46px "Trebuchet MS", sans-serif'
    c.fillText('TABELA DE PRECOS', s / 2, 76)
    const items = [
      ['CORTE', '35'], ['BARBA', '25'], ['CORTE + BARBA', '55'],
      ['NAVALHA', '20'], ['INFANTIL', '30'], ['SOBRANCELHA', '15'],
    ]
    c.font = '33px "Trebuchet MS", sans-serif'
    for (let i = 0; i < items.length; i++) {
      const y = 152 + i * 60
      c.fillStyle = '#f1ece0'
      c.textAlign = 'left'; c.fillText(items[i][0], 48, y)
      c.textAlign = 'right'; c.fillText('R$ ' + items[i][1], s - 48, y)
      c.strokeStyle = 'rgba(201,162,74,0.32)'; c.lineWidth = 2
      c.beginPath(); c.moveTo(48, y + 14); c.lineTo(s - 48, y + 14); c.stroke()
    }
  }, 1)
  const boardMat = stdMat('bb-precosmat', {
    map: t, roughness: 0.7, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.16,
  })
  const g = new THREE.Group()
  const f = 0.055
  g.add(box(w + f * 2, f, 0.055, M.woodDark, 0, h / 2 + f / 2, 0))
  g.add(box(w + f * 2, f, 0.055, M.woodDark, 0, -h / 2 - f / 2, 0))
  g.add(box(f, h, 0.055, M.woodDark, -w / 2 - f / 2, 0, 0))
  g.add(box(f, h, 0.055, M.woodDark, w / 2 + f / 2, 0, 0))
  g.add(box(w, h, 0.04, boardMat, 0, 0, 0.003))
  return shadowOn(g)
}

/** Espelho de corpo inteiro com moldura dourada. Frente = +Z. */
function makeFullMirror(M, w = 0.85, h = 1.9) {
  const g = new THREE.Group()
  const f = 0.07
  const frameMat = solid(0x8f7331, 0.34, 0.7)
  g.add(box(w + f * 2, f, 0.08, frameMat, 0, h / 2 + f / 2, 0))
  g.add(box(w + f * 2, f, 0.08, frameMat, 0, -h / 2 - f / 2, 0))
  g.add(box(f, h, 0.08, frameMat, -w / 2 - f / 2, 0, 0))
  g.add(box(f, h, 0.08, frameMat, w / 2 + f / 2, 0, 0))
  g.add(box(w, h, 0.03, M.woodDark, 0, 0, -0.012))
  const mg = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.mirror)
  mg.position.z = 0.012
  mg.receiveShadow = true
  g.add(mg)
  return shadowOn(g)
}

/** Revisteiro de chao. Frente = +Z. */
function makeMagRack(M) {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) g.add(box(0.04, 1.0, 0.3, M.woodDark, sx * 0.26, 0.5, 0))
  const magG = new THREE.BoxGeometry(0.21, 0.012, 0.28)
  for (let i = 0; i < 3; i++) {
    const y = 0.3 + i * 0.32
    g.add(box(0.5, 0.03, 0.28, M.wood, 0, y, 0))
    g.add(box(0.5, 0.14, 0.02, M.wood, 0, y + 0.08, 0.13))
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(magG, paintingMat(50 + i * 2 + k, k ? 'barber' : 'sale'))
      m.position.set(-0.12 + k * 0.24, y + 0.06, 0.01)
      m.rotation.x = -0.35
      g.add(m)
    }
  }
  return shadowOn(g)
}

/** Pilha de caixas de estoque. */
function makeCrateStack(seed = 0) {
  const g = new THREE.Group()
  const cardboard = [solid(0xb08a58, 0.96), solid(0x9c7a4c, 0.96), solid(0xc3a274, 0.96)]
  const tapeMat = solid(0xd8cdb6, 0.9)
  let r = seed * 9301 + 49297
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
  const cG = new THREE.BoxGeometry(0.62, 0.4, 0.5)
  const tapeG = new THREE.BoxGeometry(0.1, 0.006, 0.5)
  const n = 3 + Math.floor(rnd() * 2)
  for (let i = 0; i < n; i++) {
    const c = new THREE.Mesh(cG, cardboard[i % 3])
    c.position.set((rnd() - 0.5) * 0.11, i * 0.4 + 0.2, (rnd() - 0.5) * 0.11)
    c.rotation.y = (rnd() - 0.5) * 0.32
    const tp = new THREE.Mesh(tapeG, tapeMat)
    tp.position.set(c.position.x, i * 0.4 + 0.403, c.position.z)
    tp.rotation.y = c.rotation.y
    g.add(c, tp)
  }
  return shadowOn(g)
}

/** Balde de limpeza com rodo encostado. */
function makeMopBucket(M) {
  const g = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.16, 0.34, 14, 1, true), solid(0xd9b23a, 0.7))
  body.position.y = 0.17
  const bottom = cyl(0.16, 0.16, 0.02, solid(0xb8942c, 0.8), 14); bottom.position.y = 0.01
  const water = cyl(0.175, 0.175, 0.01, solid(0x6fa8c8, 0.2, 0.1), 14); water.position.y = 0.26
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.012, 6, 16, Math.PI), M.chromeDim)
  handle.rotation.y = Math.PI / 2
  handle.position.y = 0.34
  const stick = cyl(0.016, 0.018, 1.3, M.wood, 8)
  stick.position.set(0.15, 0.74, -0.06)
  stick.rotation.z = -0.17
  const head = box(0.32, 0.06, 0.11, M.woodDark, 0.03, 0.12, -0.06)
  const felt = box(0.32, 0.09, 0.13, solid(0x8a99a6, 0.95), 0.03, 0.06, -0.06)
  g.add(body, bottom, water, handle, stick, head, felt)
  return shadowOn(g)
}

/** Banqueta de barbeiro com rodinhas. */
function makeStool(M) {
  const g = new THREE.Group()
  const base = cyl(0.06, 0.2, 0.05, M.darkMetal, 16); base.position.y = 0.025
  const rod = cyl(0.035, 0.045, 0.42, M.chrome, 12); rod.position.y = 0.26
  const seat = cyl(0.19, 0.19, 0.09, M.leather, 20); seat.position.y = 0.5
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 22), M.seam)
  lip.rotation.x = Math.PI / 2
  lip.position.y = 0.462
  g.add(base, rod, seat, lip)
  const legG = new THREE.BoxGeometry(0.05, 0.03, 0.18)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const l = new THREE.Mesh(legG, M.darkMetal)
    l.position.set(Math.cos(a) * 0.11, 0.03, Math.sin(a) * 0.11)
    l.rotation.y = Math.PI / 2 - a
    const wheel = sphere(0.028, M.black, 8)
    wheel.position.set(Math.cos(a) * 0.19, 0.028, Math.sin(a) * 0.19)
    g.add(l, wheel)
  }
  return shadowOn(g)
}

/** Cabideiro de parede com capas de corte. Origem no trilho. */
function makeCapeRail(M, n = 4) {
  const g = new THREE.Group()
  const L = 0.4 + n * 0.36
  const rail = cyl(0.018, 0.018, L, M.chromeDim, 10)
  rail.rotation.z = Math.PI / 2
  g.add(rail)
  for (const sx of [-1, 1]) g.add(box(0.05, 0.05, 0.16, M.darkMetal, sx * L / 2, 0, -0.08))
  const capeA = solid(0x1d1d24, 0.85, 0.02, { side: THREE.DoubleSide })
  const capeB = solid(0x2b3a4a, 0.85, 0.02, { side: THREE.DoubleSide })
  const coneG = new THREE.ConeGeometry(0.2, 0.95, 12, 2, true)
  const hookG = new THREE.TorusGeometry(0.035, 0.008, 6, 12, Math.PI * 1.4)
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.2 + i * 0.36
    const hook = new THREE.Mesh(hookG, M.chromeDim)
    hook.position.set(x, -0.03, 0)
    hook.rotation.y = Math.PI / 2
    const cape = new THREE.Mesh(coneG, i % 2 ? capeA : capeB)
    cape.position.set(x, -0.56, 0.02)
    g.add(hook, cape, box(0.3, 0.05, 0.1, M.woodDark, x, -0.1, 0.02))
  }
  return shadowOn(g)
}

// ---------------------------------------------------------------------------
// CANTO DO PROVADOR
// A barbearia cuida do ROSTO (barbeiro) e da ROUPA (a Rosa, NPC 1003). Este
// bloco e a mobilia do canto dela: arara de roupas, prateleira de chapeus e
// tenis, espelho de corpo inteiro, pufe e a cabine com cortina.
// Convencao dos props daqui: origem no CHAO, no centro da peca, frente = +Z.
// ---------------------------------------------------------------------------

/** Tecido colorido: e a cor das pecas que da vida ao canto. */
function pano(hex, rough = 0.9) { return solid(hex, rough, 0.0) }

/** Mesma cor, mais escura (costura, gola, sombra da peca). */
function tomEscuro(hex, k = 0.68) {
  return new THREE.Color(hex).multiplyScalar(k).getHex()
}

// Paleta das roupas penduradas. Cores bem separadas entre si: de longe o que
// se le de uma arara e a listra de cores, nao o corte de cada peca.
const CORES_ROUPA = [
  0xb8434a, 0x2f6bb8, 0xd7a33a, 0x35784f,
  0x8d5bb0, 0x2b3b4a, 0xd06a3c, 0xe4e0d6,
]

/**
 * Peca num cabide. Origem no GANCHO: a peca desce a partir dela, entao basta
 * pousar a origem na barra da arara. jaqueta = true poe gola, ziper e manga
 * comprida; false e camisa de manga curta com botoes.
 */
function makeHangerPiece(M, color, jaqueta) {
  const g = new THREE.Group()
  const tecido = pano(color)
  const debrum = pano(tomEscuro(color))

  // cabide de arame: gancho + travessa + os dois diagonais do ombro
  const hook = new THREE.Mesh(
    new THREE.TorusGeometry(0.026, 0.005, 6, 12, Math.PI * 1.45), M.chromeDim)
  hook.position.y = 0.026
  hook.rotation.z = Math.PI * 0.15
  g.add(hook)
  g.add(box(0.30, 0.010, 0.010, M.chromeDim, 0, -0.082, 0))
  for (const sx of [-1, 1]) {
    const diag = box(0.19, 0.009, 0.009, M.chromeDim, sx * 0.083, -0.046, 0)
    diag.rotation.z = sx * 0.43
    g.add(diag)
  }

  // corpo da peca
  const alt = jaqueta ? 0.50 : 0.44
  const corpo = roundedBox(0.33, alt, 0.10, 0.045, tecido)
  corpo.position.y = -0.10 - alt / 2
  g.add(corpo)
  g.add(box(0.36, 0.055, 0.10, tecido, 0, -0.085, 0))          // linha do ombro
  g.add(box(0.115, 0.045, 0.095, debrum, 0, -0.055, 0.004))    // gola

  // mangas: curtas na camisa, compridas na jaqueta
  const mL = jaqueta ? 0.30 : 0.13
  for (const sx of [-1, 1]) {
    const manga = roundedBox(0.085, mL, 0.085, 0.035, tecido)
    manga.position.set(sx * 0.185, -0.10 - mL / 2, 0)
    manga.rotation.z = sx * 0.16
    g.add(manga)
    if (jaqueta) {
      const punho = box(0.088, 0.045, 0.088, debrum, sx * 0.20, -0.10 - mL, 0)
      punho.rotation.z = sx * 0.16
      g.add(punho)
    }
  }

  if (jaqueta) {
    g.add(box(0.018, alt - 0.05, 0.012, M.chromeDim, 0, -0.12 - alt / 2, 0.053))
    for (const sx of [-1, 1]) {
      const lapela = box(0.075, 0.15, 0.014, debrum, sx * 0.058, -0.135, 0.052)
      lapela.rotation.z = sx * 0.22
      g.add(lapela)
    }
  } else {
    g.add(box(0.03, alt - 0.06, 0.012, debrum, 0, -0.11 - alt / 2, 0.053))
    for (let i = 0; i < 3; i++) {
      const bt = cyl(0.008, 0.008, 0.006, M.paper, 8)
      bt.rotation.x = Math.PI / 2
      bt.position.set(0, -0.19 - i * 0.10, 0.058)
      g.add(bt)
    }
  }
  return shadowOn(g)
}

/**
 * Arara de loja: barra alta com pecas penduradas e travessa baixa. A barra
 * corre no X local, entao girar o grupo em Y decide se ela fica ao longo da
 * parede ou atravessada.
 */
function makeClothesRack(M, len = 1.5, n = 7) {
  const g = new THREE.Group()
  const H = 1.60
  const half = len / 2
  for (const sx of [-1, 1]) {
    const px = sx * (half - 0.07)
    g.add(box(0.06, 0.045, 0.46, M.darkMetal, px, 0.055, 0))   // pe
    const poste = cyl(0.020, 0.026, H, M.chromeDim, 12)
    poste.position.set(px, H / 2, 0)
    g.add(poste)
    for (const sz of [-1, 1]) {
      const roda = sphere(0.028, M.black, 8)
      roda.position.set(px, 0.028, sz * 0.20)
      g.add(roda)
    }
  }
  const bar = cyl(0.019, 0.019, len, M.chrome, 12)
  bar.rotation.z = Math.PI / 2
  bar.position.y = H
  g.add(bar)
  const trav = cyl(0.015, 0.015, len - 0.18, M.chromeDim, 10)
  trav.rotation.z = Math.PI / 2
  trav.position.y = 0.26
  g.add(trav)

  const passo = n > 1 ? (len - 0.30) / (n - 1) : 0
  for (let i = 0; i < n; i++) {
    // a cada tres pecas uma e jaqueta: a arara nao pode ser sete camisas iguais
    const peca = makeHangerPiece(M, CORES_ROUPA[i % CORES_ROUPA.length], i % 3 === 0)
    peca.position.set(-half + 0.15 + i * passo, H - 0.012, 0)
    peca.rotation.y = (i % 2 ? 0.07 : -0.06)
    g.add(peca)
  }
  return shadowOn(g)
}

/** Chapeu de vitrine. kind: 0 chapeu de aba, 1 bone, 2 gorro. */
function makeHat(M, kind, color) {
  const g = new THREE.Group()
  const c = pano(color, 0.94)
  const d = pano(tomEscuro(color), 0.94)
  if (kind === 1) {
    // bone: copa mais alta que meia esfera (achatada demais virava mancha) e
    // aba larga o bastante para se ler de longe
    const copa = sphere(0.10, c, 14)
    copa.scale.set(1, 0.95, 1.05)
    copa.position.y = 0.046
    // a aba nao pode ser MAIOR que a copa, senao o bone vira frigideira
    const aba = cyl(0.118, 0.118, 0.015, d, 18)
    aba.position.set(0, 0.042, 0.086)
    aba.rotation.x = -0.18
    aba.scale.set(1.0, 1, 0.62)
    const bt = sphere(0.017, d, 8); bt.position.y = 0.138
    g.add(copa, aba, bt)
  } else if (kind === 2) {
    const copa = cyl(0.098, 0.104, 0.16, c, 16); copa.position.y = 0.08
    const dobra = cyl(0.119, 0.119, 0.058, d, 16); dobra.position.y = 0.029
    const pom = sphere(0.045, d, 10); pom.position.y = 0.185
    g.add(copa, dobra, pom)
  } else {
    const copa = cyl(0.092, 0.102, 0.135, c, 18); copa.position.y = 0.088
    const vinco = box(0.03, 0.05, 0.16, d, 0, 0.148, 0)
    const aba = cyl(0.185, 0.185, 0.013, c, 22); aba.position.y = 0.026
    const fita = cyl(0.106, 0.106, 0.038, d, 18); fita.position.y = 0.042
    g.add(copa, vinco, aba, fita)
  }
  return shadowOn(g)
}

/** Par de tenis lado a lado, virado para +Z. */
function makeShoePair(M, color) {
  const g = new THREE.Group()
  const c = pano(color, 0.82)
  const sola = pano(0xf1efe7, 0.86)
  for (const sx of [-1, 1]) {
    const px = sx * 0.062
    const corpo = roundedBox(0.098, 0.072, 0.24, 0.03, c)
    corpo.position.set(px, 0.062, 0)
    g.add(corpo)
    g.add(box(0.104, 0.028, 0.245, sola, px, 0.016, 0))
    g.add(box(0.086, 0.05, 0.055, sola, px, 0.086, -0.075))   // lingua/cano
    const cad = box(0.05, 0.008, 0.10, sola, px, 0.098, 0.02)
    cad.rotation.x = -0.12
    g.add(cad)
  }
  return shadowOn(g)
}

/** Pilha de roupa dobrada (enche prateleira sem custar geometria). */
function makeFoldedPile(M, n = 3, w = 0.32, d = 0.24) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const c = CORES_ROUPA[(i * 3 + 1) % CORES_ROUPA.length]
    const p = box(w, 0.052, d, pano(c, 0.94), (i % 2 ? 0.012 : -0.01), 0.026 + i * 0.055, 0)
    p.rotation.y = (i % 2 ? 0.05 : -0.04)
    g.add(p)
  }
  return shadowOn(g)
}

/** Caixa de chapeu redonda, empilhavel. */
function makeHatBox(M, r, color) {
  const g = new THREE.Group()
  const c = pano(color, 0.95)
  g.add(cyl(r, r, 0.19, c, 18))
  const tampa = cyl(r + 0.012, r + 0.012, 0.05, pano(tomEscuro(color, 0.8), 0.95), 18)
  tampa.position.y = 0.11
  g.add(tampa)
  const fita = cyl(r + 0.014, r + 0.014, 0.02, pano(0xe6dcc4, 0.95), 18)
  fita.position.y = -0.02
  g.add(fita)
  g.children.forEach((m) => { m.position.y += 0.095 })
  return shadowOn(g)
}

/**
 * Prateleira de vitrine: chapeus em cima, tenis no meio, roupa dobrada
 * embaixo. Frente = +Z, origem no chao.
 */
function makeClothesShelf(M, w = 2.2, h = 1.05, d = 0.42) {
  const g = new THREE.Group()
  const t = 0.05
  g.add(box(w, 0.10, d, M.woodDark, 0, 0.05, 0))                          // base
  g.add(box(w, h - 0.14, 0.03, M.woodDark, 0, 0.10 + (h - 0.14) / 2, -d / 2 + 0.015))
  for (const sx of [-1, 1]) g.add(box(t, h - 0.10, d, M.wood, sx * (w / 2 - t / 2), 0.10 + (h - 0.10) / 2, 0))
  const yPrat = [0.44, 0.76]
  for (const y of yPrat) g.add(box(w - t * 2, 0.035, d - 0.05, M.wood, 0, y, 0.012))
  // divisorias verticais: sem elas a prateleira longa vira uma tabua solta
  const nDiv = Math.max(1, Math.round(w / 0.75) - 1)
  for (let i = 1; i <= nDiv; i++) {
    const x = -w / 2 + (w / (nDiv + 1)) * i
    g.add(box(0.028, h - 0.16, d - 0.06, M.woodDark, x, 0.10 + (h - 0.16) / 2, 0.012))
  }
  g.add(box(w + 0.07, 0.05, d + 0.06, M.counterTop, 0, h - 0.025, 0))     // tampo

  // chapeus em cima do tampo. Quantos cabem depende da LARGURA: cinco chapeus
  // numa prateleira de 1 m viram uma pilha unica.
  const TODOS_CHAPEUS = [[0, 0xb8434a], [1, 0x2b3b4a], [2, 0xd7a33a], [0, 0x35784f], [1, 0xe4e0d6]]
  const nCh = Math.max(2, Math.min(TODOS_CHAPEUS.length, Math.round(w / 0.42)))
  const chapeus = TODOS_CHAPEUS.slice(0, nCh)
  const passoC = chapeus.length > 1 ? (w - 0.52) / (chapeus.length - 1) : 0
  chapeus.forEach((hc, i) => {
    const hat = makeHat(M, hc[0], hc[1])
    hat.position.set(-w / 2 + 0.26 + i * passoC, h, 0.012)
    hat.rotation.y = i * 0.8
    g.add(hat)
  })
  // tenis na prateleira do meio, roupa dobrada na de baixo
  const nPar = Math.max(2, Math.round(w / 0.62))
  for (let i = 0; i < nPar; i++) {
    const x = -w / 2 + (w / (nPar + 1)) * (i + 1)
    const par = makeShoePair(M, CORES_ROUPA[(i * 2) % CORES_ROUPA.length])
    par.position.set(x, 0.778, 0.03)
    par.rotation.y = (i % 2 ? 0.16 : -0.13)
    g.add(par)
    const pilha = makeFoldedPile(M, 2 + (i % 3), 0.30, 0.23)
    pilha.position.set(x, 0.462, 0.02)
    g.add(pilha)
    // vao de baixo: caixas de sapato empilhadas (vazio ali fica buraco preto)
    for (let k = 0; k < 2; k++) {
      const cx = box(0.30, 0.115, 0.26, pano(k ? 0xd8d2c4 : 0xb9b2a2, 0.96),
        x + (k ? 0.015 : -0.012), 0.165 + k * 0.125, 0.015)
      cx.rotation.y = (k ? 0.05 : -0.04)
      const tampa = box(0.312, 0.028, 0.272, pano(k ? 0x9a4a4a : 0x3f5a72, 0.96),
        x + (k ? 0.015 : -0.012), 0.165 + k * 0.125 + 0.058, 0.015)
      tampa.rotation.y = cx.rotation.y
      g.add(cx, tampa)
    }
  }
  return shadowOn(g)
}

/**
 * Cabine de provador: quatro postes, forro, painel lateral e de fundo, e a
 * cortina na frente (+Z) meio aberta. Dentro: banquinho e ganchos.
 * As paredes reais da loja ficam do lado de fora dos paineis, entao a cabine
 * fecha sozinha em qualquer canto.
 */
function makeFittingBooth(M, w = 1.08, d = 1.46, h = 2.24) {
  const g = new THREE.Group()
  const poste = M.woodDark
  const painel = stdMat('bb-cabine-painel', {
    map: woodTex(3, '#7a4f2c'), roughness: 0.8, metalness: 0.02,
  })
  const hw = w / 2, hd = d / 2, pr = 0.045

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(pr * 2, h, pr * 2, poste, sx * (hw - pr), h / 2, sz * (hd - pr)))
    }
  }
  // forro + travessas de topo
  g.add(box(w + 0.06, 0.07, d + 0.06, poste, 0, h - 0.035, 0))
  g.add(box(w - 0.04, 0.02, d - 0.04, M.ceiling, 0, h - 0.075, 0))
  // painel de fundo (-Z) e lateral (-X); o outro lado encosta na parede da loja
  g.add(box(w - 0.02, h - 0.16, 0.05, painel, 0, 0.10 + (h - 0.16) / 2, -hd + 0.03))
  g.add(box(0.05, h - 0.16, d - 0.02, painel, -hw + 0.03, 0.10 + (h - 0.16) / 2, 0))
  g.add(box(w - 0.02, 0.12, 0.055, M.wood, 0, 0.06, -hd + 0.03))
  g.add(box(0.055, 0.12, d - 0.02, M.wood, -hw + 0.03, 0.06, 0))

  // trilho e cortina meio aberta (as pregas sao barras finas, nao um pano so)
  const trilho = cyl(0.016, 0.016, w, M.chromeDim, 10)
  trilho.rotation.z = Math.PI / 2
  trilho.position.set(0, h - 0.14, hd - 0.045)
  g.add(trilho)
  const cortina = pano(0x7d2b3c, 0.95)
  const cortinaEsc = pano(tomEscuro(0x7d2b3c, 0.74), 0.95)
  const nPrega = 11
  for (let i = 0; i < nPrega; i++) {
    // amontoadas do lado -X: a cabine fica ABERTA, dando pra ver o banquinho
    const x = -hw + 0.06 + i * (w * 0.55 / nPrega)
    const larg = 0.062 + (i % 2) * 0.012
    const p = box(larg, h - 0.34, 0.05, i % 2 ? cortina : cortinaEsc,
      x, (h - 0.34) / 2 + 0.16, hd - 0.045 + (i % 2 ? 0.014 : -0.014))
    p.rotation.y = (i % 2 ? 0.10 : -0.10)
    g.add(p)
    const arg = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.004, 6, 10), M.chromeDim)
    arg.rotation.y = Math.PI / 2
    arg.position.set(x, h - 0.14, hd - 0.045)
    g.add(arg)
  }

  // dentro: banquinho, ganchos e um tapetinho
  const banco = box(0.42, 0.05, 0.28, M.wood, 0.10, 0.42, -hd + 0.20)
  g.add(banco)
  for (const sx of [-1, 1]) {
    g.add(box(0.05, 0.42, 0.05, M.woodDark, 0.10 + sx * 0.16, 0.21, -hd + 0.20))
  }
  for (let i = 0; i < 3; i++) {
    const gancho = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 12, Math.PI), M.chromeDim)
    gancho.rotation.y = Math.PI / 2
    gancho.position.set(-hw + 0.09, 1.62, -0.34 + i * 0.34)
    g.add(gancho)
  }
  const tapete = box(w - 0.24, 0.014, d - 0.34, pano(0x3d4a5c, 0.98), 0, 0.007, 0.06)
  tapete.castShadow = false
  g.add(tapete)

  // placa PROVADOR no alto, virada pra loja
  const placa = box(0.66, 0.20, 0.05, M.woodDark, 0, h + 0.13, hd - 0.04)
  g.add(placa)
  const letras = new THREE.Mesh(
    new THREE.PlaneGeometry(0.58, 0.13),
    textPlaneMat('PROVADOR', {
      color: '#ffe6b0', glow: '#ffb44a', font: 'bold 130px "Trebuchet MS", sans-serif',
      emissiveIntensity: 0.85,
    }),
  )
  letras.position.set(0, h + 0.13, hd - 0.008)
  g.add(letras)
  return shadowOn(g)
}

/** Pufe redondo de estofado, pra sentar e experimentar o calcado. */
function makePouf(M, r = 0.32, h = 0.40, color = 0x3f5a72) {
  const g = new THREE.Group()
  const c = pano(color, 0.92)
  const corpo = cyl(r, r * 0.94, h - 0.06, c, 20)
  corpo.position.y = (h - 0.06) / 2 + 0.03
  g.add(corpo)
  const topo = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c)
  topo.scale.y = 0.34
  topo.position.y = h - 0.06
  topo.castShadow = true; topo.receiveShadow = true
  g.add(topo)
  const cinta = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.018, 8, 24), pano(tomEscuro(color, 0.72), 0.92))
  cinta.rotation.x = Math.PI / 2
  cinta.position.y = h * 0.55
  g.add(cinta)
  const bt = sphere(0.026, pano(tomEscuro(color, 0.6), 0.9), 10)
  bt.position.y = h - 0.055
  g.add(bt)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const pe = cyl(0.018, 0.014, 0.06, M.woodDark, 8)
    pe.position.set(Math.cos(a) * r * 0.7, 0.03, Math.sin(a) * r * 0.7)
    g.add(pe)
  }
  return shadowOn(g)
}

// ---------------------------------------------------------------------------
// NPCs (createNPC ainda pode nao existir com essa assinatura -> fallback)
// ---------------------------------------------------------------------------
function spawnNPC(opts, M) {
  let npc = null
  try {
    npc = createNPC(opts)
  } catch (e) { npc = null }
  if (!npc || !(npc.root || npc.group)) {
    npc = fallbackNPC(opts, M)
  }
  if (!npc.root && npc.group) npc.root = npc.group
  npc.root.position.copy(opts.position)
  npc.root.rotation.y = opts.yaw || 0
  shadowOn(npc.root)
  return npc
}

/**
 * Cola os meshes rigidos de cada junta do NPC (ver player/congelar.js).
 *
 * Os tres bonecos da loja nascem vestidos e NUNCA mais trocam de aparencia:
 * ninguem chama setAppearance/setPose neles depois daqui. Entao os ~85 meshes
 * soltos de cada um (olho, pupila, nariz, boca, cabelo, blusa, calca, sapato)
 * podem virar um punhado de meshes por junta. A animacao de npc.js escreve em
 * JUNTA (rotacao dos bracos, escala do peito, piscada no slot dos olhos) e o
 * forno preserva junta por junta, entao ela continua funcionando igual.
 *
 * Chamar SO depois que tudo que fica pendurado no corpo ja esta no lugar
 * (avental, fita metrica, capa): o que chegar depois nao entra no bolo.
 */
function congelarNPC(npc) {
  if (!npc || !npc.character || !npc.character.parts) return null
  return congelarPersonagem(npc.root, { juntas: npc.character.parts })
}

/** Boneco simplificado caso o modulo de NPC ainda nao esteja pronto. */
function fallbackNPC(opts, M) {
  const skin = solid(PALETTE.skin, 0.85)
  const shirt = solid(opts.shirt || 0x2a2f38, 0.9)
  const pants = solid(opts.pants || 0x22252b, 0.9)
  const root = new THREE.Group()
  const sit = opts.pose === 'sit'
  // mesma altura de quadril que npc.js usa na pose 'sit'
  const hipY = sit ? SIT_HIP_Y : 0.92
  const legG = new THREE.CylinderGeometry(0.075, 0.065, 0.44, 10)
  for (const sx of [-1, 1]) {
    const upper = new THREE.Mesh(legG, pants)
    if (sit) { upper.position.set(sx * 0.11, hipY - 0.02, 0.2); upper.rotation.x = Math.PI / 2 }
    else upper.position.set(sx * 0.11, hipY - 0.22, 0)
    const lower = new THREE.Mesh(legG, pants)
    lower.position.set(sx * 0.11, sit ? hipY - 0.24 : hipY - 0.66, sit ? 0.4 : 0)
    const foot = box(0.13, 0.09, 0.26, solid(0xf0f0ee, 0.8), sx * 0.11, sit ? 0.05 : 0.045, sit ? 0.42 : 0.05)
    root.add(upper, lower, foot)
  }
  const torso = roundedBox(0.42, 0.6, 0.26, 0.1, shirt)
  torso.position.set(0, hipY + 0.32, sit ? -0.02 : 0)
  const head = sphere(0.16, skin, 18)
  head.scale.set(0.85, 1.15, 0.82)
  head.position.set(0, hipY + 0.78, sit ? -0.02 : 0)
  root.add(torso, head)
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.56, 10), skin)
    arm.position.set(sx * 0.26, hipY + 0.3, 0.02)
    root.add(arm)
  }
  return { root, parts: {}, update() {} }
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------
export function buildBarbershop(game) {
  const M = mats()
  const group = new THREE.Group()
  group.name = 'barbershop-interior'
  // Interior montado com piso em y=0 local; sobe inteiro para o nivel oficial.
  group.position.y = FLOOR_Y
  const colliders = []
  const interactables = []
  const spinTexs = []
  const spinners = []   // { obj, axis, speed } — ventiladores

  // ======================= PISO =======================
  // piso exatamente em y=0 local (= LEVELS.SHOP_FLOOR no mundo): os moveis
  // apoiados em y=0 nao ficam mais 2 cm enterrados.
  const floor = plane(IN.x1 - IN.x0, 15.4, M.floor)
  floor.position.set(IN.cx, 0, -20)
  group.add(floor)

  // rodape: contorna as 4 paredes, com vao na porta
  const bbH = 0.15
  group.add(box(15.4, bbH, 0.06, M.baseboard, IN.cx, bbH / 2, IN.z0 + 0.03))
  group.add(box(0.06, bbH, 15.4, M.baseboard, IN.x0 + 0.03, bbH / 2, -20))
  group.add(box(0.06, bbH, 15.4, M.baseboard, IN.x1 - 0.03, bbH / 2, -20))
  const fL = DOOR_X0 - IN.x0
  const fR = IN.x1 - DOOR_X1
  group.add(box(fL, bbH, 0.06, M.baseboard, IN.x0 + fL / 2, bbH / 2, IN.z1 - 0.03))
  group.add(box(fR, bbH, 0.06, M.baseboard, IN.x1 - fR / 2, bbH / 2, IN.z1 - 0.03))

  // ======================= PAREDES POR DENTRO =======================
  // parede de tras: painel de madeira ate 1.1 m + pintura acima
  group.add(box(15.4, WAINSCOT_H, 0.05, M.wood, IN.cx, WAINSCOT_H / 2, IN.z0 + 0.025))
  group.add(box(15.4, 0.075, 0.1, M.woodDark, IN.cx, WAINSCOT_H + 0.04, IN.z0 + 0.05))
  const battenG = new THREE.BoxGeometry(0.075, WAINSCOT_H - 0.1, 0.03)
  for (let i = 0; i < 17; i++) {
    const b = new THREE.Mesh(battenG, M.woodDark)
    b.position.set(IN.x0 + 0.35 + i * 0.92, (WAINSCOT_H - 0.1) / 2 + 0.02, IN.z0 + 0.062)
    b.castShadow = true; b.receiveShadow = true
    group.add(b)
  }
  group.add(vplane(15.4, WALL_H - WAINSCOT_H - 0.09,
    M.wall, IN.cx, WAINSCOT_H + 0.09 + (WALL_H - WAINSCOT_H - 0.09) / 2, IN.z0 + 0.02, 0))

  // parede esquerda (estacoes de corte): so pintura, a bancada cobre a base
  group.add(vplane(15.4, WALL_H, M.wall, IN.x0 + 0.02, WALL_H / 2, -20, Math.PI / 2))

  // parede direita (espera): painel de madeira tambem
  group.add(box(0.05, WAINSCOT_H, 15.4, M.wood, IN.x1 - 0.025, WAINSCOT_H / 2, -20))
  group.add(box(0.1, 0.075, 15.4, M.woodDark, IN.x1 - 0.05, WAINSCOT_H + 0.04, -20))
  group.add(vplane(15.4, WALL_H - WAINSCOT_H - 0.09,
    M.wall, IN.x1 - 0.02, WAINSCOT_H + 0.09 + (WALL_H - WAINSCOT_H - 0.09) / 2, -20, -Math.PI / 2))

  // ======================= FORRO =======================
  const ceil = plane(15.4, 15.4, M.ceiling, Math.PI / 2)
  ceil.position.set(IN.cx, CEIL_Y, -20)
  group.add(ceil)
  // sanca no perimetro
  const crown = solid(0xe4dfd4, 0.9)
  group.add(box(15.4, 0.12, 0.12, crown, IN.cx, CEIL_Y - 0.06, IN.z0 + 0.06))
  group.add(box(15.4, 0.12, 0.12, crown, IN.cx, CEIL_Y - 0.06, IN.z1 - 0.06))
  group.add(box(0.12, 0.12, 15.4, crown, IN.x0 + 0.06, CEIL_Y - 0.06, -20))
  group.add(box(0.12, 0.12, 15.4, crown, IN.x1 - 0.06, CEIL_Y - 0.06, -20))
  // vigas decorativas
  const beamG = new THREE.BoxGeometry(15.0, 0.16, 0.22)
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(beamG, M.woodDark)
    b.position.set(IN.cx, CEIL_Y - 0.09, -25.4 + i * 4.6)
    b.castShadow = true; b.receiveShadow = true
    group.add(b)
  }

  // ======================= ILUMINACAO INTERNA =======================
  // Orcamento: NO MAXIMO 3 PointLights, nenhuma com sombra (uma PointLight com
  // castShadow custa 6 render passes por frame). Nada de AmbientLight nem
  // HemisphereLight aqui: luz ambiente nao tem alcance e lavaria a cidade toda.
  // O resto do preenchimento vem do emissivo do forro e das lampadas.
  const lampSpots = [
    [16.6, -17.4, 15],   // sobre as duas estacoes de corte
    [27.8, -18.2, 12],   // sala de espera
    [20.6, -24.6, 12],   // area de servico, atras da divisoria
  ]
  for (const [lx, lz, intensity] of lampSpots) {
    const lamp = prop('makeCeilingLamp', [], () => fbCeilingLamp(M))
    stripLights(lamp) // o plafon de props.js ja vem com PointLight propria
    lamp.position.set(lx, CEIL_Y - 0.02, lz)
    shadowOn(lamp)
    group.add(lamp)
    const pl = new THREE.PointLight(0xffe7c2, intensity, 9, 2)
    pl.castShadow = false
    pl.position.set(lx, CEIL_Y - 0.4, lz)
    group.add(pl)
  }
  // plafons extras SEM luz propria: o teto nao pode ficar vazio, mas o
  // orcamento e de 3 PointLights (o emissivo do forro faz o preenchimento).
  for (const [lx, lz] of [[21.8, -14.4], [25.2, -19.8], [16.6, -24.6], [26.4, -25.2]]) {
    const lamp = prop('makeCeilingLamp', [], () => fbCeilingLamp(M))
    stripLights(lamp)
    lamp.position.set(lx, CEIL_Y - 0.02, lz)
    shadowOn(lamp)
    group.add(lamp)
  }

  // ventilador de teto no meio do salao (gira no update)
  const fan = makeCeilingFan(M)
  fan.position.set(21.0, CEIL_Y - 0.02, -17.6)
  group.add(fan)
  spinners.push({ obj: fan.userData.blades, axis: 'y', speed: 2.2 })

  // ======================= BANCADA DE TRABALHO =======================
  const cLen = COUNTER_Z1 - COUNTER_Z0          // 9.4
  const cCx = (COUNTER_X0 + COUNTER_X1) / 2
  const cCz = (COUNTER_Z0 + COUNTER_Z1) / 2
  group.add(box(0.6, 0.12, cLen - 0.1, M.woodDark, cCx + 0.05, 0.06, cCz))          // rodape recuado
  group.add(box(0.75, 0.74, cLen, M.wood, cCx, 0.49, cCz))                          // corpo
  group.add(box(0.86, 0.07, cLen + 0.1, M.counterTop, cCx + 0.05, 0.895, cCz))      // tampo
  group.add(box(0.88, 0.02, cLen + 0.12, solid(0x3a3d43, 0.3, 0.4), cCx + 0.055, 0.855, cCz))
  // portas, gavetas e puxadores
  const doorG = new THREE.BoxGeometry(0.03, 0.46, 1.32)
  const drawerG = new THREE.BoxGeometry(0.03, 0.18, 1.32)
  const pullG = new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8)
  const nMod = 6
  for (let i = 0; i < nMod; i++) {
    const z = COUNTER_Z0 + 0.25 + (i + 0.5) * ((cLen - 0.5) / nMod)
    const d = new THREE.Mesh(doorG, M.woodDark)
    d.position.set(COUNTER_X1 + 0.005, 0.42, z)
    d.castShadow = true; d.receiveShadow = true
    const dr = new THREE.Mesh(drawerG, M.woodDark)
    dr.position.set(COUNTER_X1 + 0.005, 0.74, z)
    dr.castShadow = true; dr.receiveShadow = true
    const p1 = new THREE.Mesh(pullG, M.chromeDim)
    p1.rotation.x = Math.PI / 2
    p1.position.set(COUNTER_X1 + 0.035, 0.6, z)
    const p2 = new THREE.Mesh(pullG, M.chromeDim)
    p2.rotation.x = Math.PI / 2
    p2.position.set(COUNTER_X1 + 0.035, 0.74, z)
    group.add(d, dr, p1, p2)
  }
  colliders.push(collider(COUNTER_X0 - 0.05, COUNTER_X1 + 0.06, COUNTER_Z0 - 0.06, COUNTER_Z1 + 0.06, 'bancada'))

  // ======================= ESPELHOS + CADEIRAS =======================
  const chairProto = makeBarberChair(M)
  const mirrorGlassG = new THREE.PlaneGeometry(1.16, 1.74)
  const bulbG = new THREE.SphereGeometry(0.055, 12, 8)
  const socketG = new THREE.CylinderGeometry(0.032, 0.038, 0.05, 10)

  STATION_Z.forEach((sz, idx) => {
    // moldura do espelho (4 barras). Largura reduzida: com as estacoes a 2.2 m
    // uma de 1.52 encostava na outra.
    const fw = 1.3, fh = 1.88, ft = 0.09
    const frameMat = solid(0x8f7331, 0.34, 0.7) // dourado escovado
    group.add(box(ft, ft, fw, frameMat, MIRROR_X + 0.03, 1.95 + fh / 2, sz))
    group.add(box(ft, ft, fw, frameMat, MIRROR_X + 0.03, 1.95 - fh / 2, sz))
    group.add(box(ft, fh + ft, ft, frameMat, MIRROR_X + 0.03, 1.95, sz - fw / 2))
    group.add(box(ft, fh + ft, ft, frameMat, MIRROR_X + 0.03, 1.95, sz + fw / 2))
    // vidro espelhado (metalness 1 / roughness baixa + falso reflexo)
    const mg = new THREE.Mesh(mirrorGlassG, M.mirror)
    mg.position.set(MIRROR_X + 0.045, 1.95, sz)
    mg.rotation.y = Math.PI / 2
    mg.receiveShadow = true
    group.add(mg)
    // lampadas de camarim dos dois lados
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y = 1.35 + i * 0.6
        const sock = new THREE.Mesh(socketG, M.chromeDim)
        sock.rotation.z = Math.PI / 2
        sock.position.set(MIRROR_X + 0.06, y, sz + s * 0.77)
        sock.castShadow = true; sock.receiveShadow = true
        const b = new THREE.Mesh(bulbG, M.bulb)
        b.position.set(MIRROR_X + 0.11, y, sz + s * 0.77)
        group.add(sock, b)
      }
    }
    // Sem PointLight de camarim: seriam +2 luzes. As lampadas ja sao emissivas
    // e a estacao recebe a luz do plafon logo acima.

    // cadeira virada para o espelho (-X)
    const chair = idx === 0 ? chairProto : chairProto.clone(true)
    chair.position.set(CHAIR_X, 0, sz)
    chair.rotation.y = -Math.PI / 2
    group.add(chair)
    // colisor assimetrico: o apoio de pes avanca 0.72 m para -X (o espelho),
    // e sem isso o jogador atravessava o degrau cromado.
    colliders.push(collider(CHAIR_X - 0.73, CHAIR_X + 0.6, sz - 0.6, sz + 0.6, 'cadeira-barbeiro'))
  })

  // ======================= ITENS SOBRE A BANCADA =======================
  const topY = 0.93
  const bx = cCx + 0.06
  const place = (obj, z, rotY) => {
    obj.position.set(bx, topY, z)
    if (rotY !== undefined) obj.rotation.y = rotY
    group.add(obj)
    return obj
  }
  place(makeTowelStack(M, 4), -19.68, 0.15)
  place(makeCombJar(M), -19.3)
  const sc1 = makeScissors(M); sc1.rotation.y = 0.5; place(sc1, -19.0)
  sc1.position.y = topY + 0.006
  place(makeClipper(M), -18.72, -0.3)
  place(makeBottle(M, 0x2f8f5c, 0.17, 0.036), -18.42)
  place(makeBottle(M, 0xd08a2a, 0.2, 0.032), -18.2)
  place(makeBottle(M, 0x8f3fa8, 0.15, 0.034), -17.98)
  place(makeBottle(M, 0x2f6bb8, 0.19, 0.03), -17.76)
  place(makeHairdryer(M), -17.35, 1.2)
  place(makeSprayBottle(M), -16.95, 0.4)
  place(makeCombJar(M), -16.6)
  const sc2 = makeScissors(M); sc2.rotation.y = -0.8; place(sc2, -16.3)
  sc2.position.y = topY + 0.006
  const sc3 = makeScissors(M); sc3.rotation.y = 1.1; place(sc3, -16.05)
  sc3.position.y = topY + 0.006
  place(makeClipper(M), -15.75, 0.5)
  place(makeSprayBottle(M), -15.45, -0.6)
  place(makeTowelStack(M, 3), -15.1, -0.2)
  place(makeBottle(M, 0xb03a3a, 0.18, 0.033), -14.98)

  // ======================= QUADROS =======================
  // Props.makeFramedPicture(w, h, kind, seed) — ARGUMENTOS POSICIONAIS.
  // Passar um objeto aqui gerava BoxGeometry com NaN e o quadro sumia.
  // Origem do prop = CENTRO do quadro (excecao documentada em props.js).
  // Altura do centro entre 1.6 e 1.8 m; a moldura tem 0.05 de profundidade,
  // entao o verso fica a ~2.5 cm da parede, sem atravessar nada.
  // Quadros GRANDES (0.85 a 1.4 m) na altura dos olhos e agrupados: uma
  // galeria de 3 sobre o sofa, um quadrao sozinho de frente pra porta, outra
  // galeria de 3 sobre o armario de toalhas. Base sempre acima do friso do
  // lambri (1.18) pra moldura nao bater na madeira.
  const BACK_Z = IN.z0 + 0.07     // parede do fundo esta em IN.z0 + 0.02
  const RIGHT_X = IN.x1 - 0.07    // parede da espera esta em IN.x1 - 0.02
  const DIV_FRONT = DIV_Z + DIV_T / 2 + 0.03   // cara da divisoria virada pro salao
  const pics = [
    // galeria de 3 sobre o sofa da espera (parede direita)
    // (subiram junto com o sofa; a de baixo para de encostar na cabine)
    { x: RIGHT_X, y: 1.74, z: -17.8, rot: -Math.PI / 2, w: 1.3, h: 0.95, kind: 'barber', seed: 3, gold: true },
    { x: RIGHT_X, y: 1.74, z: -16.3, rot: -Math.PI / 2, w: 0.84, h: 0.64, kind: 'abstract', seed: 11 },
    { x: RIGHT_X, y: 1.74, z: -19.35, rot: -Math.PI / 2, w: 0.84, h: 0.64, kind: 'abstract', seed: 17 },
    // quadrao sozinho no pano cheio da divisoria: e o que se ve da porta
    { x: 16.3, y: 1.75, z: DIV_FRONT, rot: 0, w: 1.4, h: 1.05, kind: 'barber', seed: 5, gold: true },
    // dupla sobre a prateleira do provador. Subiram para 1.82 (a prateleira e
    // os chapeus em cima dela chegam a 1.25) e a terceira saiu: aquele pedaco
    // de parede e a cabine, que tem 2.24 m de altura.
    { x: 26.5, y: 2.0, z: DIV_FRONT, rot: 0, w: 0.85, h: 0.66, kind: 'abstract', seed: 23 },
    { x: 27.8, y: 1.82, z: DIV_FRONT, rot: 0, w: 1.25, h: 0.95, kind: 'barber', seed: 8, gold: true },
    // area de servico: dupla sobre a bancada de apoio
    { x: 21.5, y: 1.7, z: BACK_Z, rot: 0, w: 0.95, h: 0.72, kind: 'abstract', seed: 41 },
    { x: 22.9, y: 1.7, z: BACK_Z, rot: 0, w: 0.95, h: 0.72, kind: 'barber', seed: 47 },
  ]
  for (const p of pics) {
    const pic = prop('makeFramedPicture', [p.w, p.h, p.kind, p.seed],
      () => fbFramedPicture(M, p.w, p.h, p.kind, p.seed, p.gold))
    fitWidth(pic, p.w)   // medido antes de girar: a largura do quadro esta em X
    pic.position.set(p.x, p.y, p.z)
    pic.rotation.y = p.rot
    shadowOn(pic)
    group.add(pic)
  }

  // ======================= RELOGIO =======================
  // relogio na parede da direita, logo acima do balcao: e o que o cliente ve
  // quando entra pela porta.
  const clock = prop('makeWallClock', [], () => fbWallClock(M))
  clock.position.set(RIGHT_X, 2.35, -14.7)
  clock.rotation.y = -Math.PI / 2
  shadowOn(clock)
  group.add(clock)

  // ======================= DIVISORIA =======================
  // Parede parcial de 2.45 m com DOIS vaos de 1.5 m. Sem ela a loja e um
  // galpao; com ela o salao vira um comodo apertado e o fundo vira servico.
  const DIV_HALF = DIV_T / 2
  function divPanel(x0, x1) {
    const w = x1 - x0, px = (x0 + x1) / 2
    group.add(box(w, DIV_H, DIV_T, M.wall, px, DIV_H / 2, DIV_Z))
    for (const s of [-1, 1]) {
      const fz = DIV_Z + s * (DIV_HALF + 0.02)
      group.add(box(w, WAINSCOT_H, 0.04, M.wood, px, WAINSCOT_H / 2, fz))
      group.add(box(w, 0.07, 0.09, M.woodDark, px, WAINSCOT_H + 0.04, fz))
      group.add(box(w, bbH, 0.055, M.baseboard, px, bbH / 2, fz + s * 0.01))
    }
    group.add(box(w + 0.05, 0.1, DIV_T + 0.1, solid(0xe4dfd4, 0.9), px, DIV_H - 0.05, DIV_Z))
  }
  divPanel(DIV_A[0], DIV_A[1])
  divPanel(DIV_C[0], DIV_C[1])
  // batentes de madeira nos vaos + verga atravessando a loja inteira
  for (const jx of [DIV_GAP1[0], DIV_GAP1[1], DIV_GAP2[0], DIV_GAP2[1]]) {
    group.add(box(0.1, DIV_H, DIV_T + 0.07, M.woodDark, jx, DIV_H / 2, DIV_Z))
  }
  group.add(box(IN.x1 - IN.x0, 0.24, DIV_T + 0.05, M.woodDark, IN.cx, DIV_H + 0.12, DIV_Z))
  // O colisor da esquerda avanca pro lado do servico: ali ficam as capas.
  colliders.push(collider(DIV_A[0], DIV_A[1], DIV_Z - 0.36, DIV_Z + 0.18, 'divisoria'))
  colliders.push(collider(DIV_C[0], DIV_C[1], DIV_Z - 0.18, DIV_Z + 0.66, 'divisoria'))

  // balcao alto + estante vazada: o "meio" da divisoria deixa ver o fundo
  const barW = DIV_B[1] - DIV_B[0]
  const barCx = (DIV_B[0] + DIV_B[1]) / 2
  const backBar = makeBackBar(M, barW)
  backBar.position.set(barCx, 0, DIV_Z)
  group.add(backBar)
  colliders.push(collider(DIV_B[0], DIV_B[1], DIV_Z - 0.32, DIV_Z + 0.34, 'balcao-alto'))
  // produtos e toalhas nas prateleiras da estante
  for (let i = 0; i < 14; i++) {
    const bx2 = DIV_B[0] + 0.35 + i * 0.31
    const yb = i % 2 ? 1.48 : 1.98
    const b = makeBottle(M, [0x2f8f5c, 0xd08a2a, 0x8f3fa8, 0x2f6bb8, 0xb03a3a][i % 5], 0.16 + (i % 3) * 0.02, 0.032)
    b.position.set(bx2, yb, DIV_Z + 0.02)
    group.add(b)
  }
  for (const tx of [20.4, 21.6, 23.2, 24.0]) {
    const t2 = makeTowelStack(M, 3)
    t2.position.set(tx, 2.43, DIV_Z)
    t2.rotation.y = (tx % 1) * 0.4
    group.add(t2)
  }
  // Armario de toalhas: passou para o lado da AREA DE SERVICO. A cara do
  // salao nesta divisoria e agora a prateleira do provador.
  const towelCab = makeTowelCabinet(M, 2.2, 1.1)
  towelCab.position.set(28.4, 0, DIV_Z - DIV_HALF - 0.24)
  towelCab.rotation.y = Math.PI
  group.add(towelCab)
  colliders.push(collider(27.25, 29.55, -22.25, -21.68, 'armario-toalhas'))
  // cabideiro com capas de corte, do lado da area de servico
  const capes = makeCapeRail(M, 4)
  capes.position.set(16.4, 1.95, DIV_Z - DIV_HALF - 0.05)
  capes.rotation.y = Math.PI
  group.add(capes)

  // ======================= SALA DE ESPERA =======================
  // A espera subiu ~0.7 m para o norte (e o sofa encolheu de 2.6 para 2.0):
  // a faixa de z < -19.1 desta parede virou o CANTO DO PROVADOR. Sem isso a
  // Rosa (NPC 1003, fixa em 27.4 / -19.2 no mundo.js) nasceria dentro da
  // poltrona e o provador nao teria onde caber.
  const rug = makeRug(0x7a2f34, 0xd9c9a8, 2.6, 2.8)
  rug.position.set(28.1, 0, -17.5)
  group.add(rug)

  const sofa = makeSofa(M, 2.0)
  sofa.position.set(IN.x1 - 0.48, 0, -17.9)
  sofa.rotation.y = -Math.PI / 2
  group.add(sofa)
  colliders.push(collider(IN.x1 - 0.96, IN.x1, -18.95, -16.85, 'sofa'))

  for (const az of [-16.75, -18.0]) {
    const chairW = makeSofa(M, 0.95)   // mesma familia: poltrona de um lugar
    chairW.position.set(26.5, 0, az)
    chairW.rotation.y = -Math.PI / 2 + (az > -18 ? 0.3 : -0.3)
    group.add(chairW)
    colliders.push(colAt(26.5, az, 0.5, 0.5, 'poltrona'))
  }

  const table = makeMagazineTable(M)
  table.position.set(27.7, 0, -17.6)
  table.rotation.y = Math.PI / 2
  group.add(table)
  colliders.push(colAt(27.7, -17.6, 0.32, 0.52, 'mesinha'))

  // Bebedouro ao lado do balcao de atendimento: o lugar dele na parede da
  // espera virou a cabine do provador.
  const cooler = makeWaterCooler(M)
  cooler.position.set(25.15, 0, -14.35)
  group.add(cooler)
  colliders.push(colAt(25.15, -14.35, 0.3, 0.3, 'bebedouro'))

  const magRack = makeMagRack(M)
  magRack.position.set(IN.x1 - 0.24, 0, -16.3)
  magRack.rotation.y = -Math.PI / 2
  group.add(magRack)
  colliders.push(colAt(IN.x1 - 0.24, -16.3, 0.2, 0.3, 'revisteiro'))

  const plant = makePlant(M)
  plant.position.set(IN.x1 - 0.5, 0, -15.65)
  group.add(plant)
  colliders.push(colAt(IN.x1 - 0.5, -15.65, 0.3, 0.3, 'planta'))

  const board = makePriceBoard(M)
  board.position.set(IN.x0 + 0.07, 1.66, -14.05)
  board.rotation.y = Math.PI / 2
  group.add(board)

  const fullMirror = makeFullMirror(M)
  fullMirror.position.set(IN.x0 + 0.09, 1.15, -12.95)
  fullMirror.rotation.y = Math.PI / 2
  group.add(fullMirror)

  // ======================= ENTRADA =======================
  const bench = makeWaitBench(M)
  bench.position.set(16.3, 0, -12.64)
  bench.rotation.y = Math.PI       // encostado na fachada, virado pro salao
  group.add(bench)
  colliders.push(collider(15.0, 17.6, -13.28, -12.35, 'banco-espera'))

  const doormat = makeRug(0x2e3b44, 0xb8442f, 2.4, 1.3)
  doormat.position.set(22.0, 0, -13.5)
  group.add(doormat)

  const rack = makeCoatRack(M)
  rack.position.set(18.75, 0, -12.95)
  group.add(rack)
  colliders.push(colAt(18.75, -12.95, 0.28, 0.28, 'cabideiro'))

  const bin = makeTrashBin(M)
  bin.position.set(14.72, 0, -14.4)
  group.add(bin)
  colliders.push(colAt(14.72, -14.4, 0.24, 0.24, 'lixeira'))

  // ======================= CARRINHOS DE FERRAMENTA =======================
  // Um por estacao, entre as cadeiras: e o que enche o vao de trabalho.
  STATION_Z.forEach((sz, i) => {
    const cz = sz - 1.0
    const cart = makeToolCart(M)
    cart.position.set(17.2, 0, cz)
    cart.rotation.y = -Math.PI / 2 + (i ? 0.2 : -0.2)
    group.add(cart)
    colliders.push(colAt(17.2, cz, 0.24, 0.28, 'carrinho'))
    const sc = makeScissors(M)
    sc.position.set(17.11, 0.81, cz - 0.06); sc.rotation.y = 0.6
    const cl = makeClipper(M)
    cl.position.set(17.3, 0.795, cz + 0.06); cl.rotation.y = -0.4
    const bt = makeBottle(M, i ? 0x2f6bb8 : 0xb03a3a, 0.15, 0.03)
    bt.position.set(17.15, 0.795, cz + 0.15)
    const tw = makeTowelStack(M, 3)
    tw.position.set(17.2, 0.525, cz); tw.rotation.y = 0.15
    group.add(sc, cl, bt, tw)
  })

  // Fila de espera VIRADA PARA AS ESTACOES: e o que mata a area morta no meio
  // do salao (e e o arranjo classico de barbearia grande).
  const rowBench = makeWaitBench(M)
  rowBench.position.set(20.9, 0, -17.8)
  rowBench.rotation.y = -Math.PI / 2
  group.add(rowBench)
  colliders.push(collider(20.45, 21.35, -19.1, -16.5, 'fila-espera'))

  const rowTable = makeMagazineTable(M)
  rowTable.position.set(21.65, 0, -17.8)
  rowTable.rotation.y = Math.PI / 2
  group.add(rowTable)
  colliders.push(colAt(21.65, -17.8, 0.32, 0.52, 'mesinha'))

  const rowPlant = makePlant(M)
  rowPlant.position.set(20.9, 0, -19.9)
  group.add(rowPlant)
  colliders.push(colAt(20.9, -19.9, 0.3, 0.3, 'planta'))

  const rowRug = makeRug(0x394a3b, 0xcfc2a2, 2.2, 3.6)
  rowRug.position.set(21.4, 0, -17.8)
  group.add(rowRug)

  const stool = makeStool(M)
  stool.position.set(18.4, 0, STATION_Z[1] - 0.35)
  group.add(stool)
  colliders.push(colAt(18.4, STATION_Z[1] - 0.35, 0.26, 0.26, 'banqueta'))

  const fanFloor = makePedestalFan(M)
  fanFloor.position.set(14.95, 0, -20.75)
  fanFloor.rotation.y = 1.1
  group.add(fanFloor)
  colliders.push(colAt(14.95, -20.75, 0.28, 0.28, 'ventilador'))
  spinners.push({ obj: fanFloor.userData.blades, axis: 'z', speed: 9 })

  // ======================= AREA DE SERVICO (fundo) =======================
  // dois lavatorios de cabelo encostados na parede do fundo
  for (const lx of [16.0, 18.0]) {
    const wash = makeShampooStation(M)
    wash.position.set(lx, 0, IN.z0 + 0.7)
    group.add(wash)
    colliders.push(collider(lx - 0.62, lx + 0.62, IN.z0, IN.z0 + 2.05, 'lavatorio'))
  }

  // bancada de apoio com cuba de servico
  const utX0 = 20.4, utX1 = 24.2, utZ = IN.z0 + 0.36
  const utW = utX1 - utX0, utCx = (utX0 + utX1) / 2
  group.add(box(utW - 0.16, 0.12, 0.46, M.woodDark, utCx, 0.06, utZ))
  group.add(box(utW, 0.78, 0.56, M.wood, utCx, 0.51, utZ))
  group.add(box(utW + 0.08, 0.06, 0.62, M.counterTop, utCx, 0.93, utZ))
  colliders.push(collider(utX0 - 0.06, utX1 + 0.06, utZ - 0.36, utZ + 0.36, 'bancada-servico'))
  group.add(box(0.62, 0.26, 0.46, M.steel, 21.4, 0.83, utZ))
  group.add(box(0.54, 0.22, 0.38, M.darkMetal, 21.4, 0.87, utZ))
  const utTap = cyl(0.02, 0.02, 0.36, M.chrome, 10)
  utTap.position.set(21.4, 1.14, utZ - 0.22)
  const utArm = cyl(0.016, 0.016, 0.26, M.chrome, 10)
  utArm.rotation.x = Math.PI / 2
  utArm.position.set(21.4, 1.3, utZ - 0.1)
  group.add(utTap, utArm)
  const utTowels = makeTowelStack(M, 5)
  utTowels.position.set(22.7, 0.96, utZ)
  const utTowels2 = makeTowelStack(M, 4)
  utTowels2.position.set(23.5, 0.96, utZ); utTowels2.rotation.y = 0.24
  group.add(utTowels, utTowels2)
  for (let i = 0; i < 4; i++) {
    const b = makeBottle(M, [0x2f8f5c, 0xd08a2a, 0x8f3fa8, 0x2f6bb8][i], 0.2, 0.038)
    b.position.set(20.7 + i * 0.16, 0.96, utZ - 0.06)
    group.add(b)
  }

  // estante de estoque cheia de caixas
  const stock = makeStockRack(M, 3.9, 2.05, 0.6)
  stock.position.set(27.4, 0, IN.z0 + 0.38)
  group.add(stock)
  colliders.push(collider(25.4, 29.4, IN.z0, IN.z0 + 0.74, 'estoque'))

  // armario alto de material no canto direito do fundo
  const lockers = makeTowelCabinet(M, 1.8, 1.9)
  lockers.position.set(IN.x1 - 0.28, 0, -24.6)
  lockers.rotation.y = -Math.PI / 2
  group.add(lockers)
  colliders.push(collider(IN.x1 - 0.52, IN.x1, -25.52, -23.68, 'armario'))

  const crates1 = makeCrateStack(3)
  crates1.position.set(15.0, 0, -24.4); crates1.rotation.y = 0.3
  const crates2 = makeCrateStack(7)
  crates2.position.set(15.1, 0, -23.2); crates2.rotation.y = -0.5
  group.add(crates1, crates2)
  colliders.push(colAt(15.0, -24.4, 0.42, 0.38, 'caixas'))
  colliders.push(colAt(15.1, -23.2, 0.42, 0.38, 'caixas'))

  const crates3 = makeCrateStack(11)
  crates3.position.set(26.3, 0, -26.3); crates3.rotation.y = 0.22
  const crates4 = makeCrateStack(19)
  crates4.position.set(28.8, 0, -26.4); crates4.rotation.y = -0.35
  group.add(crates3, crates4)
  colliders.push(colAt(26.3, -26.3, 0.42, 0.38, 'caixas'))
  colliders.push(colAt(28.8, -26.4, 0.42, 0.38, 'caixas'))

  const bucket = makeMopBucket(M)
  bucket.position.set(15.3, 0, -26.2)
  bucket.rotation.y = -0.6
  group.add(bucket)
  colliders.push(colAt(15.3, -26.2, 0.26, 0.26, 'balde'))

  const stool2 = makeStool(M)
  stool2.position.set(19.5, 0, -25.4)
  group.add(stool2)
  colliders.push(colAt(19.5, -25.4, 0.26, 0.26, 'banqueta'))

  const broom = makeBroom(M)
  broom.position.set(14.72, 0, -25.6)
  broom.rotation.set(0.0, 1.4, -0.2) // encostada na parede da esquerda
  group.add(broom)

  // longe dos dois vaos (18.3-19.8 e 24.4-25.9) pra nao estreitar a passagem
  const plant2 = makePlant(M)
  plant2.position.set(26.7, 0, -22.75)
  group.add(plant2)
  colliders.push(colAt(26.7, -22.75, 0.3, 0.3, 'planta'))

  // ======================= BALCAO DE ATENDIMENTO =======================
  const rx0 = 25.6, rx1 = 29.5, rz = -14.45
  const rw = rx1 - rx0, rcx = (rx0 + rx1) / 2
  group.add(box(rw - 0.16, 0.12, 0.66, M.woodDark, rcx, 0.06, rz))
  group.add(box(rw, 0.86, 0.8, M.wood, rcx, 0.55, rz))
  group.add(box(rw + 0.12, 0.08, 0.94, M.counterTop, rcx, 1.02, rz))
  // painel frontal ripado
  const slatG = new THREE.BoxGeometry(0.06, 0.7, 0.03)
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Mesh(slatG, M.woodDark)
    s.position.set(rx0 + 0.12 + i * 0.16, 0.52, rz + 0.415)
    s.castShadow = true; s.receiveShadow = true
    group.add(s)
  }
  colliders.push(collider(rx0 - 0.1, rx1 + 0.1, rz - 0.52, rz + 0.52, 'balcao'))

  const reg = makeCashRegister(M)
  reg.position.set(26.5, 1.06, rz - 0.05)
  reg.rotation.y = Math.PI
  group.add(reg)
  const candy = makeCandyJar(M)
  candy.position.set(27.9, 1.06, rz + 0.05)
  group.add(candy)
  const cardTray = box(0.24, 0.03, 0.16, M.woodDark, 28.6, 1.075, rz + 0.1)
  group.add(cardTray)
  const towelsR = makeTowelStack(M, 3)
  towelsR.position.set(29.0, 1.06, rz - 0.1)
  towelsR.rotation.y = Math.PI / 2
  group.add(towelsR)
  const radio = makeRadio(M)
  radio.position.set(25.95, 1.06, rz - 0.12)
  radio.rotation.y = Math.PI - 0.4
  group.add(radio)
  const stoolR = makeStool(M)
  stoolR.position.set(27.4, 0, rz - 0.85)
  group.add(stoolR)
  colliders.push(colAt(27.4, rz - 0.85, 0.26, 0.26, 'banqueta'))

  // poste de barbeiro dentro, entre a porta e o balcao
  const pole = prop('makeBarberPole', [], () => fbBarberPole(M))
  stripLights(pole) // o poste de props.js traz uma PointLight propria
  pole.position.set(24.0, 0.35, -13.1)
  shadowOn(pole)
  group.add(pole)
  if (pole.userData && pole.userData.spinTex) spinTexs.push(pole.userData.spinTex)
  const poleStand = cyl(0.09, 0.16, 0.35, M.darkMetal, 16)
  poleStand.position.set(24.0, 0.175, -13.1)
  group.add(poleStand)
  colliders.push(colAt(24.0, -13.1, 0.24, 0.24, 'poste-barbeiro'))

  // ======================= CABELOS CORTADOS NO CHAO =======================
  const tuftG = new THREE.SphereGeometry(0.05, 6, 4)
  const N_TUFT = 44
  const tufts = new THREE.InstancedMesh(tuftG, M.hair, N_TUFT)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < N_TUFT; i++) {
    // concentra os tufos em volta das duas cadeiras
    const sz = STATION_Z[i % 2]
    dummy.position.set(
      CHAIR_X - 0.9 + Math.random() * 2.4,
      0.028,
      sz - 1.3 + Math.random() * 2.6,
    )
    dummy.rotation.set(0, Math.random() * Math.PI, 0)
    dummy.scale.set(0.5 + Math.random() * 1.1, 0.16, 0.35 + Math.random() * 0.9)
    dummy.updateMatrix()
    tufts.setMatrixAt(i, dummy.matrix)
  }
  tufts.castShadow = true
  tufts.receiveShadow = true
  group.add(tufts)

  // ======================= CANTO DO PROVADOR =======================
  // Canto sudeste do salao, entre a espera e a divisoria. A Rosa (NPC 1003)
  // tem posicao FIXA no mundo.js (27.4 / -19.2, yaw -PI/2), entao o canto foi
  // desenhado em volta dela e nao o contrario. Ela fica na boca do canto,
  // virada para -X (o salao), e atras dela ficam a arara, a prateleira, o
  // espelho de corpo inteiro, o pufe e a cabine.
  const PROV_WALL_Z = DIV_Z + DIV_HALF          // -21.48: cara da divisoria
  const ROSA = { x: 27.4, z: -19.2 }

  // TUDO o que e movel encosta na divisoria. O colisor dela ja empurra o
  // jogador para z > -20.56 (raio 0.38), entao movel nessa faixa nao custa
  // passagem nenhuma — e sobra um corredor limpo entre a divisoria e a Rosa,
  // que e por onde se entra no canto (pelo lado oeste, vindo do salao).
  const provRack = makeClothesRack(M, 1.25, 5)
  provRack.position.set(26.53, 0, PROV_WALL_Z + 0.32)
  group.add(provRack)
  colliders.push(collider(25.88, 27.18, -21.41, -20.91, 'arara-provador'))

  // prateleira de chapeus e tenis, ao lado da arara
  const provShelf = makeClothesShelf(M, 1.15, 1.05, 0.42)
  provShelf.position.set(27.83, 0, PROV_WALL_Z + 0.26)
  group.add(provShelf)

  // cabine com cortina, encaixada entre a divisoria e a parede da direita
  const booth = makeFittingBooth(M, 1.08, 1.46, 2.24)
  booth.position.set(29.05, 0, -20.67)
  group.add(booth)
  // so o painel lateral vira colisor: a cabine e para ENTRAR, e a boca dela
  // (norte) fica livre. O fundo e a lateral direita ja sao parede da loja.
  colliders.push(collider(28.49, 28.60, -21.42, -19.90, 'cabine-provador'))

  // espelho de corpo inteiro na lateral da cabine, virado para o salao (-X):
  // quem esta na frente dele tem 1.6 m de piso livre para se ver inteiro.
  const provMirror = makeFullMirror(M, 0.9, 2.0)
  provMirror.position.set(28.47, 1.15, -20.72)
  provMirror.rotation.y = -Math.PI / 2
  group.add(provMirror)

  const provRug = makeRug(0x2f3b52, 0xd9c9a8, 2.0, 1.5)
  provRug.position.set(27.4, 0, -20.2)
  group.add(provRug)

  // pufe na boca do canto, entre a Rosa e o sofa: fora do corredor que leva
  // ao espelho (foi por isso que ele saiu do meio do canto)
  const pouf = makePouf(M, 0.28, 0.38, 0x3f5a72)
  pouf.position.set(28.2, 0, -19.42)
  group.add(pouf)
  colliders.push(colAt(28.2, -19.42, 0.30, 0.30, 'pufe'))

  // caixas de chapeu dentro da cabine, aparecendo pela cortina aberta
  const hatBoxA = makeHatBox(M, 0.19, 0xb8434a)
  hatBoxA.position.set(29.12, 0, -20.95)
  const hatBoxB = makeHatBox(M, 0.165, 0xe4e0d6)
  hatBoxB.position.set(29.12, 0.30, -20.95)
  hatBoxB.rotation.y = 0.5
  group.add(hatBoxA, hatBoxB)

  // ======================= NPCs =======================
  // Encenacao: o cliente SENTADO na cadeira da estacao 0 e o barbeiro EM PE
  // ao lado dele, virado para o cliente. Os dois na MESMA estacao.
  const cutZ = STATION_Z[0]

  // --- cliente sentado -------------------------------------------------------
  // A cadeira esta girada -PI/2, entao a frente dela (apoio de pes) aponta para
  // -X, na direcao do espelho. O assento fica no z=+0.02 local da cadeira, o
  // que no mundo vira x = CHAIR_X - 0.02. SIT_LIFT poe a bunda no assento e,
  // por consequencia, os pes em cima do apoio de pes.
  const clientPos = new THREE.Vector3(CHAIR_X - 0.04, SIT_LIFT, cutZ)
  const client = spawnNPC({
    id: 'cliente',
    name: 'Cliente',
    pose: 'sit',
    position: clientPos,
    yaw: -Math.PI / 2,   // olhando para -X (espelho), igual a cadeira
    shirt: 0x486a8c,
    pants: 0x3a3f46,
    shoes: 0xe8e6e0,
    // Aparencia nos 20 campos do contrato (PERSONAGEM.md secao 1). Cabeca
    // comprida, olhos semicerrados e barba por fazer: e o freguês do meio da
    // tarde, e nao se parece com nenhum dos outros dois.
    appearance: {
      cabeca: 2, olhos: 1, pupila: 2, nariz: 3, boca: 3, barba: 4,
      cabelo: 0, pele: 1, corCabelo: 1, sobrancelha: 2,
      chapeu: 0, calcado: 1, blusa: 1, calca: 0, colar: 2,
      anelAcess: 0, tatuagem: 0, relogio: 1, jaqueta: 0,
    },
  }, M)
  group.add(client.root)
  // capa presa no pescoco: no espaco do root do NPC, o pescoco fica em
  // SIT_HIP_Y + 0.30 (chest) + 0.17 (neck).
  const cape = makeCape(M)
  cape.position.set(0, SIT_HIP_Y + 0.47, 0.02)
  cape.scale.set(1.0, 0.62, 1.0) // sentado: a capa so cobre ate o colo
  client.root.add(cape)
  congelarNPC(client)

  // --- barbeiro em pe, do lado direito do cliente ----------------------------
  // Com yaw -PI/2 o lado direito do cliente aponta para +Z do mundo.
  // ~0.98 m do cliente: perto o bastante pra tesoura ficar na altura da cabeca.
  const barberPos = new THREE.Vector3(CHAIR_X + 0.30, 0, cutZ + 0.92)
  const barberYaw = Math.atan2(clientPos.x - barberPos.x, cutZ - barberPos.z)
  const barber = spawnNPC({
    id: 'zezo',
    name: 'Zezo',
    pose: 'cut',
    scissors: true,
    position: barberPos,
    yaw: barberYaw,
    shirt: 0x24272e,
    pants: 0x1d1f24,
    shoes: 0x141416,
    // O bigode agora e campo proprio: barba 2 (o antigo 'mouth 2' virou boca
    // seria + barba de bigode). Cabeca quadrada de maxilar largo, cabelo
    // raspado, grisalho, pele escura e roupa social escura: o dono da loja.
    appearance: {
      cabeca: 3, olhos: 4, pupila: 0, nariz: 1, boca: 2, barba: 2,
      cabelo: 3, pele: 4, corCabelo: 4, sobrancelha: 0,
      chapeu: 0, calcado: 3, blusa: 2, calca: 2, colar: 0,
      anelAcess: 3, tatuagem: 1, relogio: 2, jaqueta: 0,
    },
  }, M)
  group.add(barber.root)
  // Avental preso ao TRONCO (nao ao root) pra acompanhar respiracao e balanco.
  const apronMat = solid(0x191b20, 0.9)
  const apronHost = (barber.character && barber.character.parts && barber.character.parts.torso) || barber.root
  const apron = new THREE.Group()
  apron.add(box(0.32, 0.46, 0.05, apronMat, 0, -0.06, 0.132))   // saia
  apron.add(box(0.26, 0.32, 0.05, apronMat, 0, 0.30, 0.142))    // peitilho
  apron.add(box(0.30, 0.04, 0.03, solid(0x2e3138, 0.85), 0, 0.455, 0.142)) // alca
  // o root do NPC tem origem nos PES; o torso ja nasce na altura do quadril
  apron.position.y = apronHost === barber.root ? 0.95 : 0
  apronHost.add(apron)
  shadowOn(barber.root)
  // A tesoura e pendurada em handR por npc.js e as DUAS METADES giram (o
  // "snip"): marca a subarvore dela como animada pro forno nao colar as duas
  // metades numa peca so. Os slots (anel, relogio) continuam liberados.
  const maoDaTesoura = barber.character && barber.character.parts
    && barber.character.parts.handR
  if (maoDaTesoura) {
    for (const o of maoDaTesoura.children) {
      if (o.isMesh || String(o.name).startsWith('slot:')) continue
      o.traverse((n) => { n.userData.anima = true })
    }
  }
  congelarNPC(barber)
  colliders.push(colAt(barberPos.x, barberPos.z, 0.36, 0.36, 'barbeiro'))

  // --- Rosa, a vendedora do provador ----------------------------------------
  // Posicao e yaw sao os do mundo.js (NPC 1003): x 27.4, z -19.2, yaw -PI/2.
  // Ela e a unica da loja de roupa arrumada: camisa social, colete, calca e
  // sapato social, corrente com pingente, relogio dourado e anel de pedra.
  const rosaPos = new THREE.Vector3(ROSA.x, 0, ROSA.z)
  const rosa = spawnNPC({
    id: 'rosa',
    name: 'Rosa',
    pose: 'work',
    position: rosaPos,
    yaw: -Math.PI / 2,
    shirt: 0xe7e2d6,      // camisa clara
    pants: 0x2c3140,      // calca social escura
    shoes: 0x241c17,
    appearance: {
      cabeca: 1, olhos: 0, pupila: 3, nariz: 4, boca: 0, barba: 0,
      cabelo: 2, pele: 2, corCabelo: 2, sobrancelha: 1,
      chapeu: 0, calcado: 3, blusa: 2, calca: 2, colar: 5,
      anelAcess: 2, tatuagem: 0, relogio: 3, jaqueta: 5,
    },
  }, M)
  group.add(rosa.root)
  shadowOn(rosa.root)
  colliders.push(colAt(rosaPos.x, rosaPos.z, 0.34, 0.34, 'rosa'))
  // fita metrica no pescoco: e o que diz "aqui se prova roupa" a distancia
  const fitaHost = (rosa.character && rosa.character.parts && rosa.character.parts.chest) || rosa.root
  const fita = new THREE.Group()
  const fitaMat = solid(0xd9b64a, 0.85)
  // no espaco do 'chest' o pescoco fica em +0.165: a fita sai dali e desce
  for (const sx of [-1, 1]) {
    const tira = box(0.026, 0.34, 0.012, fitaMat, sx * 0.075, 0.02, 0.072)
    tira.rotation.z = sx * 0.18
    fita.add(tira)
  }
  fita.add(box(0.17, 0.024, 0.012, fitaMat, 0, 0.185, 0.055))
  fita.position.y = fitaHost === rosa.root ? 1.14 : 0
  fitaHost.add(fita)
  congelarNPC(rosa)

  // ======================= INTERACOES =======================
  // Posicoes sao ABSOLUTAS no mundo (ficam fora do group), entao somam FLOOR_Y.
  interactables.push({
    id: 'barber-talk',
    // no peito do barbeiro: o jogador chega pelo corredor livre (x > 17.7)
    position: new THREE.Vector3(barberPos.x, FLOOR_Y + 1.35, barberPos.z),
    radius: 2.4,
    label: 'Falar com o barbeiro',
    onInteract: (g) => g.openCustomizer('hair'),
  })
  interactables.push({
    id: 'barber-chair',
    // a cadeira LIVRE (a da estacao 0 esta ocupada pelo cliente)
    position: new THREE.Vector3(CHAIR_X + 0.35, FLOOR_Y + 1.0, STATION_Z[1]),
    radius: 1.8,
    label: 'Sentar e cortar o cabelo',
    onInteract: (g) => g.openCustomizer('hair'),
  })
  interactables.push({
    id: 'barber-mirror',
    // vao livre entre as duas cadeiras, de frente pros espelhos de camarim
    position: new THREE.Vector3(COUNTER_X1 + 0.85, FLOOR_Y + 1.5, -17.4),
    radius: 2.0,
    label: 'Se olhar no espelho',
    onInteract: (g) => g.openCustomizer('all'),
  })
  // O provador: o barbeiro cuida do rosto, a Rosa cuida da roupa.
  interactables.push({
    id: 'provador-roupa',
    position: new THREE.Vector3(rosaPos.x, FLOOR_Y + 1.35, rosaPos.z),
    radius: 2.4,
    label: 'Provar roupa',
    onInteract: (game) => game.openCustomizer('roupa'),
  })
  interactables.push({
    // no espelho de corpo inteiro do canto, mesma acao: quem entrou pelo lado
    // da cabine nao precisa voltar ate a Rosa para trocar de roupa
    id: 'provador-espelho',
    position: new THREE.Vector3(28.1, FLOOR_Y + 1.3, -20.72),
    radius: 2.0,
    label: 'Provar roupa',
    onInteract: (game) => game.openCustomizer('roupa'),
  })

  // ======================= UPDATE =======================
  let lookBound = false
  const update = (dt, g) => {
    if (barber.update) barber.update(dt, g)
    if (client.update) client.update(dt, g)
    if (rosa.update) rosa.update(dt, g)
    // o barbeiro acompanha o jogador com o olhar.
    // lookTarget PRECISA ser um Object3D (npc.js le target.matrixWorld);
    // um Vector3 nao tem matrixWorld e a cabeca travaria.
    if (!lookBound && g && g.character) {
      const parts = g.character.parts
      const target = (parts && parts.head) || g.character.root
      if (target && target.isObject3D) {
        barber.lookTarget = target
        client.lookTarget = target
        rosa.lookTarget = target
        lookBound = true
      }
    }
    // poste girando (so quando usamos o fallback local)
    for (const t of spinTexs) t.offset.y = (t.offset.y - dt * 0.35) % 1
    // ventiladores. rotateX/Y/Z e INCREMENTAL: depois do bake.js os grupos
    // podem ter sido reparentados com uma rotacao base, e escrever
    // rotation.y = t apagaria essa base.
    const d2 = Math.min(dt || 0, 0.1)
    for (const s of spinners) {
      if (s.axis === 'z') s.obj.rotateZ(d2 * s.speed)
      else s.obj.rotateY(d2 * s.speed)
    }
  }

  return { group, colliders, interactables, update }
}
