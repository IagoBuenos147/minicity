// ---------------------------------------------------------------------------
// Animador 100% procedural do personagem: idle / caminhada / corrida / ar.
// Nao existe clipe nenhum: tudo e senoide aplicada SOBRE a pose base, que e
// capturada no primeiro update. Nunca acumula rotacao.
// Convencao de sinal (membro pendurado, personagem olhando +Z):
//   rotation.x > 0  -> o membro vai para TRAS;  < 0 -> para a FRENTE
//   no torso, rotation.x > 0 -> inclina o tronco para a FRENTE
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2
const DEG = Math.PI / 180

// lerp exponencial: mesma sensacao em qualquer framerate
function damp(cur, tgt, lambda, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt))
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v) }
function mix(a, b, t) { return a + (b - a) * t }

// headPivot fica de fora de proposito: quem escreve nele e o controller
// (character.setHeadLook). Escrever aqui brigaria com o head look.
const PARTS = [
  'hips', 'torso', 'chest', 'neck', 'head',
  'armLUpper', 'armLLower', 'handL',
  'armRUpper', 'armRLower', 'handR',
  'legLUpper', 'legLLower', 'footL',
  'legRUpper', 'legRLower', 'footR',
]

// Amplitudes da passada. Interpolamos walk->run pelo blend de corrida.
const WALK = {
  thigh: 0.60, knee: 0.80, foot: 0.34, arm: 0.50, elbow: 0.42,
  twist: 0.10, hipTwist: 0.13, bob: 0.042, sway: 0.028, lean: 4 * DEG,
  shoulder: 0.05,
}
const RUN = {
  thigh: 1.02, knee: 1.35, foot: 0.52, arm: 0.98, elbow: 0.95,
  twist: 0.19, hipTwist: 0.22, bob: 0.085, sway: 0.045, lean: 10 * DEG,
  shoulder: 0.10,
}

export function createAnimator(character) {
  const parts = (character && character.parts) || {}

  // pose base (rot/pos/escala originais de cada junta)
  const base = Object.create(null)
  let captured = false

  // deltas do frame, zerados e recalculados sempre do zero
  const d = Object.create(null)
  for (let i = 0; i < PARTS.length; i++) {
    d[PARTS[i]] = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0, s: 1 }
  }

  // fases independentes
  let stride = 0      // ciclo da passada (1 ciclo = 2 passos)
  let tBreath = 0     // respiracao
  let tIdle = 0       // balanco/ deslocamento de peso do idle

  // pesos suavizados dos estados
  let wLoco = 0, wRun = 0, wAir = 0
  let wSit = 0      // peso da pose de sentado
  let leanCur = 0
  let waveT = -1      // < 0 = aceno desligado

  function capture() {
    for (let i = 0; i < PARTS.length; i++) {
      const n = PARTS[i]
      const o = parts[n]
      if (!o) continue
      base[n] = {
        rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
        px: o.position.x, py: o.position.y, pz: o.position.z,
        sx: o.scale.x, sy: o.scale.y, sz: o.scale.z,
      }
    }
    captured = true
  }

  function clearDeltas() {
    for (let i = 0; i < PARTS.length; i++) {
      const k = d[PARTS[i]]
      k.rx = 0; k.ry = 0; k.rz = 0
      k.px = 0; k.py = 0; k.pz = 0
      k.s = 1
    }
  }

  function apply() {
    for (let i = 0; i < PARTS.length; i++) {
      const n = PARTS[i]
      const o = parts[n]
      const b = base[n]
      if (!o || !b) continue
      const k = d[n]
      o.rotation.set(b.rx + k.rx, b.ry + k.ry, b.rz + k.rz)
      o.position.set(b.px + k.px, b.py + k.py, b.pz + k.pz)
      if (k.s !== 1) o.scale.set(b.sx * k.s, b.sy * k.s, b.sz * k.s)
      else o.scale.set(b.sx, b.sy, b.sz)
    }
  }

  // --- poses ---------------------------------------------------------------

  // Sentado num banco: coxa quase horizontal, canela pra baixo, maos no colo.
  // Mesmos angulos da pose 'sit' dos NPCs, pra jogador e NPC sentarem igual.
  const SIT = {
    legLUpper: [-1.52, -0.05, -0.06], legLLower: [1.46, 0, 0], footL: [0.10, 0, 0],
    legRUpper: [-1.52, 0.05, 0.06], legRLower: [1.46, 0, 0], footR: [0.10, 0, 0],
    armLUpper: [-0.40, 0, -0.16], armLLower: [-0.92, 0, 0.12], handL: [-0.25, 0, 0],
    armRUpper: [-0.40, 0, 0.16], armRLower: [-0.92, 0, -0.12], handR: [-0.25, 0, 0],
    chest: [-0.05, 0, 0], torso: [0.03, 0, 0],
  }

  function poseSit(w) {
    if (w <= 0.001) return
    for (const name in SIT) {
      const k = d[name]
      if (!k) continue
      const a = SIT[name]
      k.rx += a[0] * w
      k.ry += a[1] * w
      k.rz += a[2] * w
    }
    // respiracao continua, so que bem mais contida
    const br = 0.5 + 0.5 * Math.sin(tBreath * TAU * 0.26)
    if (d.chest) d.chest.s = mix(d.chest.s, 1.008, br * w)
  }

  // Respiracao + micro balanco. w = peso do idle.
  function poseIdle(w) {
    if (w <= 0.001) return
    const br = Math.sin(tBreath * TAU * 0.28)       // ~4.3 s por ciclo
    const br01 = 0.5 + 0.5 * br
    // peito sobe e "infla" um tico
    if (d.chest) {
      // sem py: subir o peito 1.2 cm a cada respiracao lia como flutuacao
      d.chest.s = mix(1, 1.010, br01 * w)
      d.chest.rx += -0.020 * br01 * w
    }
    if (d.torso) d.torso.rx += -0.010 * br01 * w

    // Deslocamento de peso lento (~4 s). Mexer o QUADRIL em Y ou X levanta e
    // desliza os pes junto (as pernas sao filhas dele) e o personagem parado
    // parecia flutuar. Entao o quadril so gira de leve, e quem sugere o peso
    // mudando de perna e o tronco.
    const shift = Math.sin(tIdle * TAU / 4)
    if (d.hips) {
      d.hips.rz += 0.016 * shift * w
      d.hips.ry += 0.022 * shift * w
    }
    if (d.chest) d.chest.ry += -0.035 * shift * w
    if (d.neck) d.neck.ry += 0.020 * shift * w
    if (d.head) {
      d.head.ry += 0.030 * Math.sin(tIdle * 0.37) * w
      d.head.rx += 0.020 * Math.sin(tIdle * 0.52 + 1.1) * w
    }

    // pernas acompanham o peso: a perna do lado carregado estica
    if (d.legLUpper) d.legLUpper.rz += 0.020 * shift * w
    if (d.legRUpper) d.legRUpper.rz += 0.020 * shift * w
    if (d.legLLower) d.legLLower.rx += (0.06 + 0.05 * Math.max(0, -shift)) * w
    if (d.legRLower) d.legRLower.rx += (0.06 + 0.05 * Math.max(0, shift)) * w

    // pendulo dos bracos, defasado entre os lados
    const pl = Math.sin(tIdle * 0.8)
    const pr = Math.sin(tIdle * 0.8 + 0.7)
    if (d.armLUpper) { d.armLUpper.rx += 0.055 * pl * w; d.armLUpper.rz += (-0.03 + 0.02 * pl) * w }
    if (d.armRUpper) { d.armRUpper.rx += 0.055 * pr * w; d.armRUpper.rz += (0.03 - 0.02 * pr) * w }
    if (d.armLLower) d.armLLower.rx += (-0.16 - 0.04 * pl) * w
    if (d.armRLower) d.armRLower.rx += (-0.16 - 0.04 * pr) * w
  }

  // Passada. w = peso da locomocao, run = blend walk->run.
  function poseLocomotion(w, run) {
    if (w <= 0.001) return
    const A = {
      thigh: mix(WALK.thigh, RUN.thigh, run),
      knee: mix(WALK.knee, RUN.knee, run),
      foot: mix(WALK.foot, RUN.foot, run),
      arm: mix(WALK.arm, RUN.arm, run),
      elbow: mix(WALK.elbow, RUN.elbow, run),
      twist: mix(WALK.twist, RUN.twist, run),
      hipTwist: mix(WALK.hipTwist, RUN.hipTwist, run),
      bob: mix(WALK.bob, RUN.bob, run),
      sway: mix(WALK.sway, RUN.sway, run),
      shoulder: mix(WALK.shoulder, RUN.shoulder, run),
    }
    const p = stride
    const s = Math.sin(p)
    const sL = s, sR = -s   // pernas em contrafase

    // coxas: sin > 0 -> perna a frente (rot negativa)
    if (d.legLUpper) d.legLUpper.rx += -A.thigh * sL * w
    if (d.legRUpper) d.legRUpper.rx += -A.thigh * sR * w

    // joelho: flexiona mais quando a perna esta atras (impulso / balanco)
    const kL = A.knee * Math.max(0, -Math.sin(p + 0.45)) + 0.10
    const kR = A.knee * Math.max(0, -Math.sin(p + 0.45 + Math.PI)) + 0.10
    if (d.legLLower) d.legLLower.rx += kL * w
    if (d.legRLower) d.legRLower.rx += kR * w

    // tornozelo: gira no fim do passo (ponta do pe empurra o chao)
    if (d.footL) d.footL.rx += (A.foot * Math.sin(p + 2.35) - kL * 0.45) * w
    if (d.footR) d.footR.rx += (A.foot * Math.sin(p + 2.35 + Math.PI) - kR * 0.45) * w

    // quadril: sobe/desce 2x por ciclo + desliza para a perna de apoio
    if (d.hips) {
      d.hips.py += (A.bob * Math.cos(2 * p) - A.bob * 0.5) * w
      d.hips.px += -A.sway * s * w
      d.hips.ry += -A.hipTwist * s * w
      d.hips.rz += 0.05 * s * w
    }

    // tronco faz a contra-rotacao do quadril
    if (d.torso) { d.torso.ry += A.twist * 0.55 * s * w; d.torso.rz += -0.03 * s * w }
    if (d.chest) { d.chest.ry += A.twist * s * w; d.chest.rx += -0.02 * Math.cos(2 * p) * w }
    if (d.neck) d.neck.ry += -A.twist * 0.4 * s * w
    if (d.head) {
      d.head.rx += 0.035 * Math.cos(2 * p) * w
      d.head.rz += 0.03 * s * w
    }

    // bracos em contrafase com as pernas do mesmo lado
    if (d.armLUpper) {
      d.armLUpper.rx += A.arm * sL * w
      d.armLUpper.rz += (-A.shoulder - 0.05 * Math.abs(s)) * w
      d.armLUpper.ry += -0.06 * s * w
    }
    if (d.armRUpper) {
      d.armRUpper.rx += A.arm * sR * w
      d.armRUpper.rz += (A.shoulder + 0.05 * Math.abs(s)) * w
      d.armRUpper.ry += 0.06 * s * w
    }
    // cotovelo: fecha mais quando a mao vem para a frente
    const eL = A.elbow * (0.35 + 0.65 * Math.max(0, -sL)) + 0.12
    const eR = A.elbow * (0.35 + 0.65 * Math.max(0, -sR)) + 0.12
    if (d.armLLower) d.armLLower.rx += -eL * w
    if (d.armRLower) d.armRLower.rx += -eR * w
    if (d.handL) d.handL.rx += -0.10 * eL * w
    if (d.handR) d.handR.rx += -0.10 * eR * w
  }

  // No ar: pernas recolhidas, bracos levemente pra cima.
  function poseAir(w, vy) {
    if (w <= 0.001) return
    const up = clamp01(vy * 0.25 + 0.5)  // 1 subindo, 0 caindo
    const tuck = mix(0.45, 0.95, up)
    if (d.legLUpper) d.legLUpper.rx += -0.70 * tuck * w
    if (d.legRUpper) d.legRUpper.rx += -0.42 * tuck * w
    if (d.legLLower) d.legLLower.rx += 1.15 * tuck * w
    if (d.legRLower) d.legRLower.rx += 0.70 * tuck * w
    if (d.footL) d.footL.rx += 0.30 * w
    if (d.footR) d.footR.rx += 0.42 * w
    if (d.armLUpper) { d.armLUpper.rx += -1.05 * w; d.armLUpper.rz += -0.42 * w }
    if (d.armRUpper) { d.armRUpper.rx += -0.90 * w; d.armRUpper.rz += 0.42 * w }
    if (d.armLLower) d.armLLower.rx += -0.55 * w
    if (d.armRLower) d.armRLower.rx += -0.45 * w
    if (d.hips) { d.hips.py += -0.05 * w; d.hips.rx += -0.10 * w }
    if (d.torso) d.torso.rx += mix(0.16, -0.06, up) * w
    if (d.chest) d.chest.rx += 0.05 * w
  }

  // Aceno: sobrescreve o braco direito por ~1.9 s com envelope suave.
  function poseWave() {
    if (waveT < 0) return
    const DUR = 1.9
    const t = waveT / DUR
    // envelope: entra em 20%, sai nos ultimos 25%
    const env = smooth01(t / 0.2) * smooth01((1 - t) / 0.25)
    const osc = Math.sin(waveT * 11.5)
    const set = (part, rx, ry, rz) => {
      const k = d[part]
      if (!k) return
      k.rx = mix(k.rx, rx, env)
      k.ry = mix(k.ry, ry, env)
      k.rz = mix(k.rz, rz, env)
    }
    set('armRUpper', -2.05, 0.10, 0.62 + 0.10 * osc)
    set('armRLower', -0.45, 0.0, 0.30 * osc)
    set('handR', 0, 0, 0.35 * osc)
    if (d.chest) { d.chest.ry += -0.10 * env; d.chest.rx += -0.04 * env }
    if (d.head) d.head.rz += 0.05 * env * osc * 0.4
  }

  // --- update --------------------------------------------------------------

  function update(dt, state) {
    if (!captured) capture()
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1 // evita salto feio depois de um freeze

    const st = state || {}
    const speed = st.speed || 0
    const grounded = st.grounded !== false
    const running = !!st.running
    const moving = st.moving !== undefined ? !!st.moving : speed > 0.15
    const vy = st.vy || 0

    // pesos alvo
    const locoT = grounded ? smooth01(speed / 1.5) * (moving ? 1 : smooth01(speed / 0.8)) : 0
    const runT = clamp01((speed - 3.4) / 2.4) * (running ? 1 : 0.65)
    const airT = grounded ? 0 : 1

    wSit = damp(wSit, state && state.sitting ? 1 : 0, 8, dt)
    wLoco = damp(wLoco, locoT, 11, dt)
    wRun = damp(wRun, runT, 7, dt)
    wAir = damp(wAir, airT, grounded ? 9 : 16, dt)

    // Cadencia da passada. Proporcional a velocidade so enquanto ele anda
    // devagar; a partir dai satura, porque quem cresce na corrida e o TAMANHO
    // do passo, nao a frequencia. Com o proporcional puro que havia aqui, a
    // 6.2 m/s davam 3.9 ciclos/s e a corrida virava um tremor.
    const sp = Math.min(speed, 9)
    const hz = Math.min(sp / 1.6, 1.35 + sp * 0.13)
    stride += TAU * hz * dt
    if (stride > TAU) stride -= TAU * Math.floor(stride / TAU)
    tBreath += dt
    tIdle += dt
    if (waveT >= 0) { waveT += dt; if (waveT > 1.9) waveT = -1 }

    clearDeltas()

    const sitK = 1 - wSit
    const ground = (1 - wAir) * sitK
    poseIdle((1 - wLoco) * ground)
    poseLocomotion(wLoco * ground, wRun)
    poseAir(wAir * sitK, vy)
    poseSit(wSit)

    // inclinacao do tronco pra frente cresce com a corrida
    const leanT = (mix(WALK.lean, RUN.lean, wRun) * wLoco) * ground
    leanCur = damp(leanCur, leanT, 8, dt)
    if (d.torso) d.torso.rx += leanCur * 0.65
    if (d.chest) d.chest.rx += leanCur * 0.35
    if (d.neck) d.neck.rx += -leanCur * 0.8   // mantem a cabeca no eixo

    poseWave()
    apply()
  }

  function playWave() { waveT = 0 }

  return { update, playWave, isWaving: () => waveT >= 0 }
}

export default createAnimator
