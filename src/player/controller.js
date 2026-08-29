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
/**
 * Menor angulo equivalente, em [-PI, PI].
 *
 * E o que impede "virar pra ali" de virar "dar quase uma volta inteira ate
 * ali" — e, no head look, e o que faz a diferenca entre a cabeca acompanhar a
 * camera e a cabeca dar um salto de 120 graus quando o jogador passa dos 180.
 */
function anguloCurto(a) {
  let r = a % TAU
  if (r > Math.PI) r -= TAU
  else if (r < -Math.PI) r += TAU
  return r
}

// Ate quantos graus a cabeca vira SEM o corpo. 1.05 rad = 60 graus, o limite
// confortavel de um pescoco. E o mesmo LOOK_LIMIT de character.js; passado ele,
// quem vira e o corpo.
const LIMITE_PESCOCO = 1.05

function dampAngle(cur, tgt, lambda, dt) {
  let diff = (tgt - cur + Math.PI) % TAU
  if (diff < 0) diff += TAU
  diff -= Math.PI
  return cur + diff * (1 - Math.exp(-lambda * dt))
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function smooth01(v) { const t = clamp01(v); return t * t * (3 - 2 * t) }
function mix(a, b, t) { return a + (b - a) * t }

// --- 1a pessoa: bob pequeno e FILTRADO ---------------------------------------
// O que embrulhava o estomago nao era so a amplitude. Eram tres coisas juntas:
// a camera colava no osso da cabeca (que carrega a chacoalhada inteira da
// animacao), pulava direto pra senoide do bob a cada quadro, e trocava de
// amplitude de um quadro pro outro ao soltar o Shift. Agora ela sai de um ponto
// RIGIDO sobre os pes, PERSEGUE o alvo do bob com filtro, e a troca
// andar<->correr entra por rampa.
const FP = {
  AMP_WALK: 0.006,    // era 0.018 (um terco)
  AMP_RUN: 0.011,     // era 0.035 (um terco)
  LATERAL: 0.30,      // fracao da amplitude vertical que vai pro lado
  FOLLOW: 14,         // lambda do filtro que persegue o alvo do bob
  AMT: 6,             // lambda do "esta andando?" (era 9)
  ROLL_STRAFE: 0.006, // era 0.028
  ROLL_STEP: 0.0015,  // era 0.008
  RAMP: 3.2,          // lambda da rampa andar<->correr
}

// Numeros do modo vitrine (tecla X). Foram escolhidos pra o boneco de 1.82 m
// caber inteiro com folga na lente de 3a pessoa: com o foco em 0.95 (o meio do
// corpo) e 3.6 m de braco, sobra cerca de meio metro acima da cabeca e outro
// tanto abaixo dos pes — o bastante pra o cenario atras aparecer, que era metade
// do pedido.
const VITRINE = {
  ALTURA: 0.95,
  DISTANCIA: 3.6,
}

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
  // cabeca: alvo perseguido com damp, nunca escrito cru (ver o passo 9)
  let lookYaw = 0
  let lookPitch = 0

  // MODO VITRINE (tecla X): o personagem de frente e de corpo inteiro.
  //
  // O pedido foi "mostrar o player de frente e de corpo todo pra tela, pra
  // gente ver ele e o cenario, como se fosse tirar uma foto, porem sem a foto".
  // Entao nao ha arquivo nenhum: e so um enquadramento. O jogador continua
  // podendo GIRAR a camera em volta de si com o mouse — e o que deixa olhar o
  // cenario atras — mas nao anda, senao a pose desmancha no primeiro passo.
  //
  // Ele reaproveita o caminho da camera de 3a pessoa inteiro (oclusao de
  // parede, piso, suavizacao); o que muda sao tres numeros: o alvo sobe pro
  // MEIO do corpo em vez do peito, o desvio de ombro vai a zero (centralizado)
  // e o braco cresce pra caber o boneco todo.
  let vitrine = false
  let vitrineK = 0        // 0..1, a transicao suave entre os dois enquadramentos
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
  let bobY = 0        // deslocamento vertical JA filtrado (nao e a senoide crua)
  let bobX = 0        // idem, no eixo lateral da camera
  let fpRun = 0       // rampa andar->correr da amplitude do bob
  let eyeOffsetY = PLAYER.EYE_HEIGHT  // altura dos olhos medida no boneco
  let stillT = 0      // ha quanto tempo esta parado (pra remedir os olhos)
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

  // Altura dos olhos em POSE DE REPOUSO. Sobe a corrente do fpAnchor ate o root
  // somando so os offsets locais: rotacao nenhuma entra na conta, entao o valor
  // e o mesmo esteja o boneco olhando pra onde estiver. E a camera de 1a pessoa
  // usa esta constante em vez de ler o anchor todo quadro — o anchor viaja com a
  // pose, e era ele quem chacoalhava a tela. So se remede com o corpo PARADO
  // (andando, a passada desloca o quadril de verdade, em position.y).
  function medirAlturaDosOlhos() {
    const a = character && character.fpAnchor
    const root = character && character.root
    if (!a || !root) return
    let h = 0
    let o = a
    for (let i = 0; i < 24 && o && o !== root; i++) { h += o.position.y; o = o.parent }
    if (o !== root) return       // anchor pendurado fora do boneco: nao mexe
    h *= root.scale.y || 1
    if (isFinite(h) && h > 1.0 && h < 2.2) eyeOffsetY = h
  }

  function setMode(m) {
    if (m !== 'first' && m !== 'third') return
    if (m === mode) return
    mode = m
    camReady = false
    pitch = clampPitch(pitch) // a 3a pessoa tem limite mais apertado
    if (character && character.setVisibleBody) character.setVisibleBody(mode !== 'first')
  }

  /**
   * Liga/desliga a vitrine. Ao LIGAR, a camera vai pra FRENTE do personagem.
   *
   * O offset da orbita e (sin(yaw), 0, cos(yaw)) e a frente do personagem e
   * (sin(bodyYaw), 0, cos(bodyYaw)) — logo `yaw = bodyYaw` poe a camera
   * exatamente de frente pra ele. (Nao e `bodyYaw + PI`: aquilo poria a camera
   * nas costas, que e onde ela ja fica.)
   *
   * O pitch vai a zero: um pouco de contra-plongee ja deforma o boneco na lente
   * de 3a pessoa, e a graca aqui e ver ele direito.
   */
  function toggleVitrine(v) {
    const alvo = v === undefined ? !vitrine : !!v
    if (alvo === vitrine) return vitrine
    vitrine = alvo
    if (vitrine) {
      if (mode === 'first') setMode('third')
      yaw = bodyYaw
      if (yaw > Math.PI) yaw -= TAU; else if (yaw < -Math.PI) yaw += TAU
      pitch = 0
      sinceLook = 0
    }
    return vitrine
  }

  function toggleMode() {
    // Trocar pra 1a pessoa desliga a vitrine: nao existe "de frente e de corpo
    // inteiro" quando a camera esta dentro da cabeca.
    if (vitrine) toggleVitrine(false)
    setMode(mode === 'first' ? 'third' : 'first')
  }

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
      if (input.wasPressed && input.wasPressed('KeyX')) toggleVitrine()
    }
    // A transicao entre os dois enquadramentos e uma rampa e nao um corte: o
    // ponto focal sobe e o braco cresce ao longo dela, entao a camera VIAJA ate
    // a frente do personagem em vez de aparecer la.
    vitrineK = damp(vitrineK, vitrine ? 1 : 0, 6, dt)

    // 3) entrada de movimento, relativa a camera
    let ax = 0, az = 0, wantRun = false, wantJump = false
    if (!locked && !vitrine && !seat && input && input.isDown) {
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
    // PARADO, O CORPO NAO GIRA. Ele fica onde a ultima caminhada deixou.
    //
    // Houve aqui uma versao em que o corpo PERSEGUIA a camera assim que o
    // jogador passava dos 60 graus de pescoco. A ideia era boa no papel — e o
    // que uma pessoa faz ao olhar por cima do ombro — e destruia uma coisa de
    // que o jogo precisa: DAR A VOLTA NO PERSONAGEM PRA VER A CARA DELE. Como o
    // corpo fugia junto com a camera, o jogador orbitava 360 graus e continuava
    // vendo as costas. Foi a primeira coisa que o dono do projeto notou.
    //
    // O salto da cabeca que aquilo tentava resolver esta resolvido no passo 9,
    // onde ele nasceu: a cabeca DESISTE de acompanhar quando a camera passa pro
    // lado de tras, em vez de acompanhar ate o angulo dar a volta.

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

    // 9) head look — SEMPRE AMORTECIDO
    //
    // A versao antiga escrevia o angulo cru da camera na cabeca a cada quadro.
    // Mesmo sem o salto de fase, isso e um acoplamento rigido: qualquer tranco
    // do mouse aparecia inteiro no pescoco no mesmo quadro. Aqui a cabeca
    // PERSEGUE o alvo com damp — o pedido foi "onde ele olhar a cabeca dele vai
    // virar suavemente junto, de maneira coerente com o corpo".
    //
    // lambda 12 = a cabeca cobre ~63% da diferenca em 80 ms. Rapido o bastante
    // pra nao parecer atrasada, lento o bastante pra o tranco virar um gesto.
    if (character && character.setHeadLook) {
      let alvoP = 0
      let alvoY = 0
      if (mode === 'first') {
        alvoP = pitch
      } else {
        const rel = anguloCurto((yaw + Math.PI) - bodyYaw)
        const volta = Math.abs(rel)
        // A CABECA DESISTE QUANDO A CAMERA PASSA PRO LADO DE TRAS.
        //
        // Era daqui que vinha o "teleporta a cabeca de um lado para o outro":
        // `rel` e o angulo mais curto, entao ele salta de +PI pra -PI quando o
        // jogador passa dos 180 graus, e o alvo da cabeca pulava de
        // todo-a-esquerda pra todo-a-direita num quadro.
        //
        // A saida nao e girar o corpo (isso impedia ver a cara do personagem) e
        // nem so amortecer (amortecer um salto de 2 rad ainda le como chicote).
        // E PARAR DE OLHAR: de 1.70 rad (97 graus) em diante o peso cai a zero
        // em 0.90 rad, e a cabeca volta pra frente sozinha. No angulo em que
        // `rel` da a volta o peso JA E ZERO dos dois lados — nao ha o que
        // saltar. E e o que uma pessoa faz: ninguem torce o pescoco pra olhar
        // atras de si, olha pra frente.
        // A faixa de desistencia e LARGA (1.55 -> 2.85 rad, ou seja 1.30 rad de
        // transicao) de proposito. Ela ja foi de 0.90 rad, e ai a cabeca voltava
        // pra frente rapido demais no meio da varredura: nao era um salto de
        // fase como o bug original, mas dava 17 graus num passo de 10 graus de
        // camera — o gesto lia como um tranco. Quanto mais larga a faixa, mais
        // devagar o peso muda e mais o movimento parece decisao, nao correcao.
        const peso = 1 - smooth01((volta - 1.55) / 1.30)
        alvoP = pitch * 0.45 * peso
        alvoY = clamp(rel * 0.75, -LIMITE_PESCOCO, LIMITE_PESCOCO) * peso
      }
      lookPitch = damp(lookPitch, alvoP, 12, dt)
      lookYaw = dampAngle(lookYaw, alvoY, 12, dt)
      character.setHeadLook(lookPitch, lookYaw)
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
    // 1) ponto de olho RIGIDO, tirado do corpo do jogador e nao do osso da
    // cabeca. Parado ha mais de meio segundo, remede a altura: se o jogador
    // trocou de cabeca no barbeiro, os olhos mudaram de lugar.
    stillT = animSpeed === 0 && grounded && !seat ? stillT + dt : 0
    if (stillT > 0.6) medirAlturaDosOlhos()
    _tmp.set(position.x, position.y + eyeOffsetY, position.z)

    // 2) rampa andar<->correr. Sem ela, soltar o Shift trocava a amplitude do
    // bob de um quadro pro outro (runBlend cai de *1 pra *0.4 na hora).
    fpRun = damp(fpRun, clamp01(runBlend), FP.RAMP, dt)

    // 3) alvo do bob: 2 batidas por ciclo de passada. A cadencia e a MESMA
    // formula da animacao (animation.js): com o proporcional puro que havia
    // aqui, correndo a camera batia a 7.8 Hz enquanto os pes pisavam a 4.3 Hz —
    // duas batidas fora de fase, e a tela virava um zumbido.
    const sp = Math.min(animSpeed, 9)
    const hz = Math.min(sp / 1.6, 1.35 + sp * 0.13)
    bobPhase += TAU * hz * dt
    if (bobPhase > TAU) bobPhase -= TAU * Math.floor(bobPhase / TAU)
    const moveAmt = clamp01(animSpeed / 2.2) * (grounded ? 1 : 0)
    bobAmt = damp(bobAmt, moveAmt, FP.AMT, dt)
    const amp = mix(FP.AMP_WALK, FP.AMP_RUN, fpRun) * bobAmt
    const tgtY = Math.sin(bobPhase * 2) * amp
    const tgtX = Math.sin(bobPhase) * amp * FP.LATERAL

    // 4) o filtro. A camera PERSEGUE o alvo em vez de pousar nele: qualquer
    // salto de fase, de frequencia ou de estado vira uma curva, e a variacao de
    // altura por quadro cai junto.
    bobY = damp(bobY, tgtY, FP.FOLLOW, dt)
    bobX = damp(bobX, tgtX, FP.FOLLOW, dt)
    _tmp.y += bobY
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    _tmp.addScaledVector(_right, bobX)

    camera.position.copy(_tmp)

    // 5) roll: quase nada. Inclinar o horizonte e o que mais enjoa.
    const rollT = -strafe * FP.ROLL_STRAFE * bobAmt + Math.sin(bobPhase) * FP.ROLL_STEP * bobAmt
    rollCur = damp(rollCur, rollT, 5, dt)
    camera.rotation.order = 'YXZ'
    camera.rotation.set(pitch, yaw, rollCur)
  }

  function updateThirdPerson(dt) {
    // --- 1) ponto focal: peito do personagem, com deslocamento de ombro -----
    // Na VITRINE o alvo desce pro meio do corpo e o ombro vai a zero: quem
    // quer ver o boneco inteiro precisa dele CENTRADO, e o desvio de ombro
    // existe pra deixar a mira livre, que ali nao interessa.
    _right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    const alturaFoco = mix(CAMERA.TP_HEIGHT, VITRINE.ALTURA, vitrineK)
    const focusY = seat ? seat.y + 0.62 : position.y + alturaFoco
    camGoal.set(position.x, focusY, position.z)
    camGoal.addScaledVector(_right, CAMERA.TP_SHOULDER * (1 - vitrineK))
    if (!camReady) camTarget.copy(camGoal)
    else camTarget.lerp(camGoal, 1 - Math.exp(-CAMERA.TP_TARGET_SMOOTH * dt))

    // --- 2) auto-alinhamento: andando pra frente, a camera volta pras costas -
    // So quando o movimento e mais ou menos pra frente. Em andar de lado a
    // camera nao gira, senao o personagem (que anda relativo a ela) ficaria
    // fazendo curva sozinho.
    sinceLook += dt
    if (!seat && !vitrine && animSpeed > 1.2 && sinceLook > CAMERA.TP_FOLLOW_DELAY) {
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

    const braco = mix(CAMERA.TP_DISTANCE, VITRINE.DISTANCIA, vitrineK)
    _desired.set(
      camTarget.x + ox * braco,
      camTarget.y + oy * braco,
      camTarget.z + oz * braco,
    )

    // --- 4) oclusao: encurta o braco em vez de atravessar parede -----------
    const want = occludedDistance(camTarget, _desired, braco)
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
  medirAlturaDosOlhos()   // pose de repouso: a medida boa e agora

  const player = {
    position,
    velocity,
    animator,
    /** Modo vitrine (tecla X). Sem argumento, alterna. */
    vitrine(v) { return toggleVitrine(v) },
    get emVitrine() { return vitrine },
    get yaw() { return yaw },
    /**
     * ATENCAO: escrever `yaw` REALINHA O CORPO junto (bodyYaw = yaw + PI). E o
     * que se quer em teleporte e em nascer numa cena — a camera e o boneco
     * chegam olhando pro mesmo lado —, mas NAO e "girar a camera".
     * Pra girar so a camera, use girarCamera().
     */
    set yaw(v) { yaw = v; bodyYaw = v + Math.PI; camReady = false },
    /**
     * Gira SO a camera em volta do personagem, como o mouse faz. O corpo fica
     * onde esta — e ele ficar parado e o que permite dar a volta e ver a cara
     * do boneco, que foi um pedido explicito do dono.
     */
    girarCamera(dRad) {
      yaw += dRad || 0
      if (yaw > Math.PI) yaw -= TAU; else if (yaw < -Math.PI) yaw += TAU
      sinceLook = 0
      return yaw
    },
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
