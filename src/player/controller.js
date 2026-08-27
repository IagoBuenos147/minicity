import * as THREE from 'three'
import { PLAYER, CAMERA, LEVELS } from '../config.js'
import { createAnimator } from './animation.js'
import { HIPS_Y } from './character.js'

// Sentado, o quadril tem que pousar no topo do assento. O root do personagem
// fica nos pes, entao ele desce essa distancia (a pose sentada dobra as pernas
// e os pes voltam pra perto do chao).
const SIT_HIP_OFFSET = HIPS_Y

// ---------------------------------------------------------------------------
// Movimento do jogador + cameras 1a/3a pessoa (estilo GTA).
// A altura do chao NAO e fixa: vem de setGroundSampler(fn), com fn(x,z) -> y
// (rua 0, calcada 0.16, parque 0.11, beco 0.05, piso de loja 0.16).
// Colisao horizontal delegada para collision.resolve(pos, raio), que empurra a
// posicao pra fora dos AABBs XZ.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

function damp(cur, tgt, lambda, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt))
}
// interpolacao angular pelo caminho curto
function dampAngle(cur, tgt, lambda, dt) {
  let diff = (tgt - cur + Math.PI) % TAU
  if (diff < 0) diff += TAU
  diff -= Math.PI
  return cur + diff * (1 - Math.exp(-lambda * dt))
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

export function createPlayerController({ camera, character, input, collision, scene }) {
  const position = new THREE.Vector3(0, 0, 0)     // pes do personagem
  const velocity = new THREE.Vector3(0, 0, 0)     // so XZ; Y anda em vy

  let yaw = Math.PI          // olhando para +Z no comeco
  let pitch = 0
  let vy = 0
  let grounded = true
  let mode = 'third'
  let locked = false
  let jumpHeld = false

  // amostragem de chao: default cidade plana em y = 0
  let groundSampler = () => 0
  let floorY = 0            // altura do piso que sustenta o jogador agora

  // corpo gira suave, nunca instantaneo
  let bodyYaw = yaw + Math.PI
  // velocidade "real" (depois da colisao) usada pela animacao
  let animSpeed = 0

  // camera 3a pessoa
  const camPos = new THREE.Vector3()
  const camTarget = new THREE.Vector3()   // ponto focal suavizado
  const camGoal = new THREE.Vector3()     // ponto focal cru (segue o personagem)
  let tpDist = CAMERA.TP_DISTANCE
  let camReady = false
  let sinceLook = 99                      // segundos desde a ultima mexida no mouse

  // 3a pessoa tem limite proprio de inclinacao; 1a pessoa usa o limite geral
  function clampPitch(p) {
    return mode === 'third'
      ? clamp(p, CAMERA.TP_PITCH_MIN, CAMERA.TP_PITCH_MAX)
      : clamp(p, -PLAYER.PITCH_LIMIT, PLAYER.PITCH_LIMIT)
  }

  // estado de "sentado" (bancos da cidade)
  let seat = null

  // camera 1a pessoa
  let bobPhase = 0
  let bobAmt = 0
  let rollCur = 0
  let fovCur = mode === 'first' ? CAMERA.FOV_FP : CAMERA.FOV_TP

  const animator = createAnimator(character)

  // temporarios (nada de alocar por frame)
  const _fwd = new THREE.Vector3()
  const _right = new THREE.Vector3()
  const _wish = new THREE.Vector3()
  const _prev = new THREE.Vector3()
  const _tmp = new THREE.Vector3()
  const _desired = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  let rayTick = 0

  // raio do "probe" da camera contra os AABBs de colisao
  const CAM_PROBE = 0.25

  camera.fov = fovCur
  camera.near = CAMERA.NEAR
  camera.far = CAMERA.FAR
  camera.rotation.order = 'YXZ'
  camera.updateProjectionMatrix()

  // --- helpers -------------------------------------------------------------

  // altura do chao no ponto, blindada contra sampler que devolva lixo
  function sampleGround(x, z) {
    const y = groundSampler(x, z)
    return (typeof y === 'number' && isFinite(y)) ? y : 0
  }

  function setGroundSampler(fn) {
    groundSampler = (typeof fn === 'function') ? fn : () => 0
    floorY = sampleGround(position.x, position.z)
    if (grounded) position.y = floorY
  }

  // Ate onde a camera pode ir sem atravessar parede. Usa os OCCLUDERS 3D
  // (paredes e predios, com altura de verdade), nao os colisores XZ do jogador:
  // com os colisores planos, um banco de 45 cm bloqueava uma camera a 2 m e ela
  // saltava pra cima do personagem toda vez que o mouse girava.
  function occludedDistance(from, to, want) {
    if (!collision || !collision.segmentHit) return want
    const t = collision.segmentHit(from, to, 0.24)
    if (t >= 1) return want
    return clamp(want * t, CAMERA.TP_MIN_DISTANCE, want)
  }

  function setMode(m) {
    if (m !== 'first' && m !== 'third') return
    if (m === mode) return
    mode = m
    camReady = false
    pitch = clampPitch(pitch) // a 3a pessoa tem limite mais apertado
    if (character && character.setVisibleBody) character.setVisibleBody(mode !== 'first')
  }

  function toggleMode() { setMode(mode === 'first' ? 'third' : 'first') }

  function setLocked(b) {
    locked = !!b
    if (locked) {
      velocity.set(0, 0, 0)
      if (input && input.mouseDelta) input.mouseDelta() // descarta acumulo
    }
  }

  function teleport(x, z, y) {
    floorY = sampleGround(x, z)
    position.set(x, floorY, z)
    velocity.set(0, 0, 0)
    vy = 0
    grounded = true
    if (y !== undefined) { yaw = y; bodyYaw = y + Math.PI }
    camReady = false
    if (character && character.root) {
      character.root.position.copy(position)
      character.root.rotation.y = bodyYaw
      character.root.updateMatrixWorld(true)
    }
  }

  function getState() {
    return {
      speed: animSpeed,
      moving: animSpeed > 0.15,
      running: animSpeed > 3.5,
      grounded,
      airborne: !grounded,
      vy,
    }
  }

  // --- update --------------------------------------------------------------

  function update(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1

    // 1) mouse look (sempre consome o delta, pra nao acumular quando travado)
    const md = input && input.mouseDelta ? input.mouseDelta() : null
    const canLook = !locked && (!input || !input.isLocked || input.isLocked())
    if (md && canLook) {
      const dxm = md.dx * PLAYER.MOUSE_SENSITIVITY
      const dym = md.dy * PLAYER.MOUSE_SENSITIVITY
      yaw -= dxm
      pitch -= dym
      pitch = clampPitch(pitch)
      if (yaw > Math.PI) yaw -= TAU; else if (yaw < -Math.PI) yaw += TAU
      // qualquer mexida no mouse suspende o auto-alinhamento por um instante
      if (Math.abs(dxm) > 1e-5 || Math.abs(dym) > 1e-5) sinceLook = 0
    }

    // 2) troca de camera
    if (!locked && input) {
      const pressed = input.wasPressed ? input.wasPressed('KeyV') : false
      if (pressed) toggleMode()
    }

    // 3) entrada de movimento, relativa a camera
    let ax = 0, az = 0, wantRun = false, wantJump = false
    if (!locked && !seat && input && input.isDown) {
      if (input.isDown('KeyW')) az += 1
      if (input.isDown('KeyS')) az -= 1
      if (input.isDown('KeyD')) ax += 1
      if (input.isDown('KeyA')) ax -= 1
      wantRun = input.isDown('ShiftLeft')
      wantJump = input.isDown('Space')
    }

    _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw))
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    _wish.set(0, 0, 0)
      .addScaledVector(_fwd, az)
      .addScaledVector(_right, ax)
    const inputMag = _wish.length()
    if (inputMag > 0.0001) _wish.multiplyScalar(1 / inputMag)

    let running = false
    let runBlend = 0

    if (seat) {
      // Sentado: sem fisica. O corpo fica preso ao assento e a camera continua
      // livre em volta dele.
      velocity.set(0, 0, 0)
      vy = 0
      grounded = true
      position.set(seat.x, seat.y - SIT_HIP_OFFSET, seat.z)
      floorY = position.y
      bodyYaw = seat.rotY
      animSpeed = 0
    } else {
      // 4) aceleracao / atrito
      running = wantRun && inputMag > 0 && az >= 0 // nao corre andando de re
      const maxSpeed = running ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED
      const airFactor = grounded ? 1 : 0.35
      if (inputMag > 0.0001) {
        const dx = _wish.x * maxSpeed - velocity.x
        const dz = _wish.z * maxSpeed - velocity.z
        const dl = Math.hypot(dx, dz)
        const step = PLAYER.ACCEL * airFactor * dt
        if (dl > 0.0001) {
          const s = Math.min(1, step / dl)
          velocity.x += dx * s
          velocity.z += dz * s
        }
      } else {
        const f = Math.exp(-PLAYER.FRICTION * (grounded ? 1 : 0.15) * dt)
        velocity.x *= f
        velocity.z *= f
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0
      }
      // trava a velocidade horizontal no maximo do modo atual
      const hsp = Math.hypot(velocity.x, velocity.z)
      if (hsp > maxSpeed && grounded) {
        const s = maxSpeed / hsp
        velocity.x *= s; velocity.z *= s
      }

      // 5) pulo. A gravidade so age no ar: no chao quem manda e o piso amostrado.
      if (wantJump && grounded && !jumpHeld) {
        vy = PLAYER.JUMP
        grounded = false
      }
      jumpHeld = wantJump
      if (!grounded) {
        vy -= PLAYER.GRAVITY * dt
        position.y += vy * dt
      } else {
        vy = 0
      }

      // 6) integra XZ e resolve colisao
      _prev.copy(position)
      position.x += velocity.x * dt
      position.z += velocity.z * dt
      if (collision && collision.resolve) collision.resolve(position, PLAYER.RADIUS)

      // 6b) amostra o piso no novo ponto e resolve o contato vertical
      const prevFloor = floorY
      let f = sampleGround(position.x, position.z)
      // degrau alto demais nao se escala: cancela o avanco horizontal
      if (grounded && f - prevFloor > LEVELS.STEP_MAX) {
        position.x = _prev.x
        position.z = _prev.z
        f = prevFloor
      }
      floorY = f

      if (grounded) {
        if (position.y - floorY > LEVELS.STEP_MAX) {
          grounded = false          // saiu de uma borda alta: passa a cair
        } else {
          // sobe/desce meio-fio suave, sem solavanco
          position.y = damp(position.y, floorY, 14, dt)
          if (Math.abs(position.y - floorY) < 0.003) position.y = floorY
        }
      } else if (vy <= 0 && position.y <= floorY) {
        position.y = floorY
        vy = 0
        grounded = true
      }

      // velocidade real (bate na parede -> animacao para junto)
      const realSpeed = Math.hypot(position.x - _prev.x, position.z - _prev.z) / dt
      animSpeed = damp(animSpeed, Math.min(realSpeed, hsp), 18, dt)
      if (animSpeed < 0.02) animSpeed = 0
      runBlend = clamp01((animSpeed - 3.4) / 2.4) * (running ? 1 : 0.4)
    }

    // 7) rotacao do corpo
    if (mode === 'first') {
      bodyYaw = dampAngle(bodyYaw, yaw + Math.PI, 22, dt)
    } else if (animSpeed > 0.35 && inputMag > 0.0001) {
      // personagem olha pra onde anda, com giro suave
      const moveYaw = Math.atan2(velocity.x, velocity.z)
      bodyYaw = dampAngle(bodyYaw, moveYaw, 11, dt)
    }

    if (character && character.root) {
      character.root.position.copy(position)
      character.root.rotation.y = bodyYaw
    }

    // 8) animacao antes de ler o fpAnchor (a cabeca se mexe com a pose)
    animator.update(dt, {
      speed: animSpeed,
      moving: animSpeed > 0.15,
      running: running && animSpeed > 3.2,
      grounded,
      vy,
      sitting: !!seat,
    })

    // 9) head look
    if (character && character.setHeadLook) {
      if (mode === 'first') {
        character.setHeadLook(pitch, 0)
      } else {
        let rel = (yaw + Math.PI - bodyYaw + Math.PI) % TAU
        if (rel < 0) rel += TAU
        rel -= Math.PI
        character.setHeadLook(pitch * 0.45, clamp(rel * 0.55, -0.7, 0.7))
      }
    }

    if (character && character.root) character.root.updateMatrixWorld(true)

    // 10) camera
    const targetFov = mode === 'first'
      ? CAMERA.FOV_FP
      : CAMERA.FOV_TP + 6 * runBlend
    fovCur = damp(fovCur, targetFov, 6, dt)
    if (Math.abs(camera.fov - fovCur) > 0.01) {
      camera.fov = fovCur
      camera.updateProjectionMatrix()
    }

    if (mode === 'first') updateFirstPerson(dt, runBlend, ax)
    else updateThirdPerson(dt)

    camReady = true
  }

  function updateFirstPerson(dt, runBlend, strafe) {
    // segue a posicao do anchor dos olhos
    if (character && character.fpAnchor) {
      character.fpAnchor.getWorldPosition(_tmp)
    } else {
      _tmp.set(position.x, position.y + PLAYER.EYE_HEIGHT, position.z)
    }

    // head bob: 2 batidas por ciclo de passada
    const hz = Math.min(animSpeed, 9) / 1.6
    bobPhase += TAU * hz * dt
    if (bobPhase > TAU) bobPhase -= TAU * Math.floor(bobPhase / TAU)
    const moveAmt = clamp01(animSpeed / 2.2) * (grounded ? 1 : 0)
    bobAmt = damp(bobAmt, moveAmt, 9, dt)
    const amp = (0.018 + 0.017 * runBlend) * bobAmt
    _tmp.y += Math.sin(bobPhase * 2) * amp
    // balanco lateral no eixo direito da camera
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    _tmp.addScaledVector(_right, Math.sin(bobPhase) * amp * 0.8)

    camera.position.copy(_tmp)

    // roll: leve inclinacao andando de lado + micro roll do passo
    const rollT = -strafe * 0.028 * bobAmt + Math.sin(bobPhase) * 0.008 * bobAmt
    rollCur = damp(rollCur, rollT, 7, dt)
    camera.rotation.order = 'YXZ'
    camera.rotation.set(pitch, yaw, rollCur)
  }

  function updateThirdPerson(dt) {
    // --- 1) ponto focal: peito do personagem, com deslocamento de ombro -----
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    const focusY = seat ? seat.y + 0.62 : position.y + CAMERA.TP_HEIGHT
    camGoal.set(position.x, focusY, position.z)
    camGoal.addScaledVector(_right, CAMERA.TP_SHOULDER)
    if (!camReady) camTarget.copy(camGoal)
    else camTarget.lerp(camGoal, 1 - Math.exp(-CAMERA.TP_TARGET_SMOOTH * dt))

    // --- 2) auto-alinhamento: andando pra frente, a camera volta pras costas -
    // So quando o movimento e mais ou menos pra frente. Em andar de lado a
    // camera nao gira, senao o personagem (que anda relativo a ela) ficaria
    // fazendo curva sozinho.
    sinceLook += dt
    if (!seat && animSpeed > 1.2 && sinceLook > CAMERA.TP_FOLLOW_DELAY) {
      const moveYaw = Math.atan2(velocity.x, velocity.z)
      // yaw da camera aponta pras costas: o "atras" do personagem e moveYaw + PI
      const wantYaw = moveYaw + Math.PI
      let diff = (wantYaw - yaw + Math.PI) % TAU
      if (diff < 0) diff += TAU
      diff -= Math.PI
      // dot entre a direcao do movimento e a frente da camera
      const camFwdX = -Math.sin(yaw), camFwdZ = -Math.cos(yaw)
      const mLen = Math.hypot(velocity.x, velocity.z) || 1
      const dot = (velocity.x / mLen) * camFwdX + (velocity.z / mLen) * camFwdZ
      if (dot > 0.45) {
        const gain = CAMERA.TP_FOLLOW * clamp01((animSpeed - 1.2) / 3) * clamp01(Math.abs(diff) / 0.25)
        const stepA = clamp(diff, -gain * dt, gain * dt)
        yaw += stepA
        if (yaw > Math.PI) yaw -= TAU; else if (yaw < -Math.PI) yaw += TAU
      }
    }

    // --- 3) posicao ideal na orbita ---------------------------------------
    // pitch negativo = camera acima olhando pra baixo (ja vem limitado)
    const cp = Math.cos(pitch)
    const ox = Math.sin(yaw) * cp
    const oy = -Math.sin(pitch)
    const oz = Math.cos(yaw) * cp

    _desired.set(
      camTarget.x + ox * CAMERA.TP_DISTANCE,
      camTarget.y + oy * CAMERA.TP_DISTANCE,
      camTarget.z + oz * CAMERA.TP_DISTANCE,
    )

    // --- 4) oclusao: encurta o braco em vez de atravessar parede -----------
    const want = occludedDistance(camTarget, _desired, CAMERA.TP_DISTANCE)
    tpDist = want < tpDist
      ? damp(tpDist, want, CAMERA.TP_IN_SPEED, dt)   // entra rapido
      : damp(tpDist, want, CAMERA.TP_OUT_SPEED, dt)  // sai devagar

    _desired.set(
      camTarget.x + ox * tpDist,
      camTarget.y + oy * tpDist,
      camTarget.z + oz * tpDist,
    )
    // nunca abaixo do piso sob a propria camera
    const desiredFloor = sampleGround(_desired.x, _desired.z) + 0.28
    if (_desired.y < desiredFloor) _desired.y = desiredFloor

    if (!camReady) { camPos.copy(_desired); camReady = true }
    else camPos.lerp(_desired, 1 - Math.exp(-CAMERA.TP_SMOOTH * dt))

    const camFloor = sampleGround(camPos.x, camPos.z) + 0.28
    if (camPos.y < camFloor) camPos.y = camFloor
    camera.position.copy(camPos)

    // --- 5) mira: olha SEMPRE pro ponto focal ------------------------------
    // Fixar a rotacao em (pitch, yaw) faria o personagem escorregar pra fora do
    // quadro sempre que a suavizacao ou a oclusao tirassem a camera da linha.
    camera.up.set(0, 1, 0)
    camera.lookAt(camTarget)
    rollCur = damp(rollCur, 0, 8, dt)
  }

  // --- sentar (bancos da cidade) -------------------------------------------

  /** spot: { x, y, z, rotY, standX, standZ } — y = topo do assento. */
  function sitOn(spot) {
    if (!spot || seat) return false
    seat = {
      x: spot.x, y: spot.y, z: spot.z,
      rotY: spot.rotY || 0,
      standX: spot.standX !== undefined ? spot.standX : spot.x,
      standZ: spot.standZ !== undefined ? spot.standZ : spot.z,
    }
    velocity.set(0, 0, 0)
    vy = 0
    grounded = true
    // o root fica nos pes: baixa o personagem ate o quadril pousar no assento
    position.set(seat.x, seat.y - SIT_HIP_OFFSET, seat.z)
    bodyYaw = seat.rotY
    // a camera vai pra frente dele, pra dar pra ver o personagem sentado
    yaw = seat.rotY + Math.PI
    pitch = clamp(pitch, CAMERA.TP_PITCH_MIN, CAMERA.TP_PITCH_MAX)
    return true
  }

  function standUp() {
    if (!seat) return false
    const s = seat
    seat = null
    position.set(s.standX, sampleGround(s.standX, s.standZ), s.standZ)
    if (collision && collision.resolve) collision.resolve(position, PLAYER.RADIUS)
    floorY = sampleGround(position.x, position.z)
    position.y = floorY
    velocity.set(0, 0, 0)
    return true
  }

  // estado inicial coerente
  if (character && character.setVisibleBody) character.setVisibleBody(mode !== 'first')
  if (character && character.root) {
    character.root.position.copy(position)
    character.root.rotation.y = bodyYaw
  }

  const player = {
    position,
    velocity,
    animator,
    get yaw() { return yaw },
    set yaw(v) { yaw = v; bodyYaw = v + Math.PI; camReady = false },
    get pitch() { return pitch },
    set pitch(v) { pitch = clampPitch(v) },
    get mode() { return mode },
    set mode(m) { setMode(m) },
    get grounded() { return grounded },
    get speed() { return animSpeed },
    get locked() { return locked },
    get floorY() { return floorY },
    toggleMode,
    setMode,
    update,
    getState,
    setLocked,
    setGroundSampler,
    teleport,
    playWave: () => animator.playWave(),
    sitOn,
    standUp,
    get sitting() { return !!seat },
    get seat() { return seat },
  }
  return player
}

export default createPlayerController
