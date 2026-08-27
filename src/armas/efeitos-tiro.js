import * as THREE from 'three'
import { solid } from '../world/materials.js'

// ---------------------------------------------------------------------------
// Efeitos do disparo: fogo na boca do cano, fumaca, faiscas, furo de impacto e
// as capsulas ejetadas. Tudo POOL: os meshes nascem uma vez e sao reciclados.
//
// Por que pool e nao criar/destruir: um tiro solta ~20 pedacos. Criando mesh
// e material a cada clique o coletor de lixo engasga no meio do tiroteio, que
// e exatamente o pior momento pra perder quadro.
//
// Regras de mistura, que valem pro jogo inteiro (ver anel/portal):
//  * tudo que e ADITIVO leva fog:false — a neblina SOMA a cor do ceu no
//    aditivo e transformaria o clarao num borrao azulado a 20 m;
//  * nada aditivo escreve profundidade (depthWrite:false), senao o quadrado
//    do sprite recorta o que esta atras dele.
// ---------------------------------------------------------------------------

// --- texturas procedurais (cache local: sao unicas deste modulo) -------------

const _cache = new Map()
function canvasTex(chave, tamanho, desenhar) {
  if (_cache.has(chave)) return _cache.get(chave)
  const c = document.createElement('canvas')
  c.width = c.height = tamanho
  desenhar(c.getContext('2d'), tamanho)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  _cache.set(chave, t)
  return t
}

/** Bola de fogo: nucleo branco, corpo amarelo, borda laranja que morre no ar. */
export function texturaChama() {
  return canvasTex('chama', 128, (g, s) => {
    const r = s / 2
    const grd = g.createRadialGradient(r, r, 0, r, r, r)
    grd.addColorStop(0.00, 'rgba(255,255,250,1)')
    grd.addColorStop(0.20, 'rgba(255,243,190,0.95)')
    grd.addColorStop(0.45, 'rgba(255,186,70,0.60)')
    grd.addColorStop(0.75, 'rgba(214,96,20,0.20)')
    grd.addColorStop(1.00, 'rgba(90,30,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
    // lingotes de chama saindo do centro: e o que faz o clarao ter FORMA de
    // fogo de polvora em vez de ser um circulo borrado
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2
      const len = r * (0.35 + Math.random() * 0.6)
      g.strokeStyle = 'rgba(255,222,150,' + (0.16 + Math.random() * 0.3) + ')'
      g.lineWidth = 2 + Math.random() * 5
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(r, r)
      g.lineTo(r + Math.cos(a) * len, r + Math.sin(a) * len)
      g.stroke()
    }
  })
}

/** Novelo de fumaca: cinza claro com bordas irregulares e alpha suave. */
export function texturaFumaca() {
  return canvasTex('fumaca', 128, (g, s) => {
    const r = s / 2
    g.clearRect(0, 0, s, s)
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * r * 0.42
      const x = r + Math.cos(a) * d, y = r + Math.sin(a) * d
      const rr = r * (0.26 + Math.random() * 0.30)
      const grd = g.createRadialGradient(x, y, 0, x, y, rr)
      const v = 190 + Math.floor(Math.random() * 50)
      grd.addColorStop(0, 'rgba(' + v + ',' + v + ',' + (v - 6) + ',0.30)')
      grd.addColorStop(1, 'rgba(' + v + ',' + v + ',' + (v - 6) + ',0)')
      g.fillStyle = grd
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill()
    }
  })
}

/** Faisca: pontinho branco-quente que apaga rapido. */
export function texturaFaisca() {
  return canvasTex('faisca', 64, (g, s) => {
    const r = s / 2
    const grd = g.createRadialGradient(r, r, 0, r, r, r)
    grd.addColorStop(0.00, 'rgba(255,255,255,1)')
    grd.addColorStop(0.30, 'rgba(255,226,150,0.85)')
    grd.addColorStop(0.70, 'rgba(255,140,40,0.25)')
    grd.addColorStop(1.00, 'rgba(120,40,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
  })
}

/** Furo de bala: miolo preto, borda de poeira clara, contorno irregular. */
export function texturaFuro() {
  return canvasTex('furo', 128, (g, s) => {
    const r = s / 2
    g.clearRect(0, 0, s, s)
    // halo de poeira arrancada
    const grd = g.createRadialGradient(r, r, r * 0.12, r, r, r * 0.5)
    grd.addColorStop(0.0, 'rgba(150,140,128,0.55)')
    grd.addColorStop(1.0, 'rgba(150,140,128,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(r, r, r * 0.5, 0, 7); g.fill()
    // buraco: circulo dentado, nunca perfeito
    g.fillStyle = 'rgba(12,10,9,0.95)'
    g.beginPath()
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const rr = r * (0.17 + Math.random() * 0.05)
      const x = r + Math.cos(a) * rr, y = r + Math.sin(a) * rr
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.closePath(); g.fill()
    // trincas curtas saindo do furo
    g.strokeStyle = 'rgba(40,34,30,0.5)'
    g.lineWidth = 1.6
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2
      g.beginPath()
      g.moveTo(r + Math.cos(a) * r * 0.19, r + Math.sin(a) * r * 0.19)
      g.lineTo(r + Math.cos(a) * r * (0.28 + Math.random() * 0.16),
        r + Math.sin(a) * r * (0.28 + Math.random() * 0.16))
      g.stroke()
    }
  })
}

// ============================================================================
// FOGO DE BOCA — vive 2 ou 3 quadros, entao e um grupo so, nao um pool
// ============================================================================
/**
 * Duas pecas, e as duas precisam existir:
 *
 *  * o JATO — tres laminas que CONTEM o eixo do cano, giradas em volta dele.
 *    Uma lamina perpendicular ao cano (o erro obvio) some justamente em 1a
 *    pessoa, que e quando se olha o clarao de tras, quase alinhado com o tiro.
 *  * a ESTRELA — uma placa que encara a camera, no ponto da boca. E ela que
 *    entrega o "estouro" seja de que angulo for.
 *
 * disparar() recebe a pose da boca do cano no mundo, entao quem chama nao
 * precisa pendurar nada na arma.
 */
export function criarFogoDeBoca(scene) {
  const raiz = new THREE.Group()
  raiz.visible = false
  scene.add(raiz)

  // Tinta quente e nao branca: aditivo branco satura no primeiro pixel e o
  // bloom transforma o clarao numa bola de leite. Com laranja, so o miolo
  // estoura em branco — que e exatamente o que fogo de polvora faz.
  const mat = new THREE.MeshBasicMaterial({
    map: texturaChama(), color: 0xffa848, transparent: true, opacity: 1,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
  const geo = new THREE.PlaneGeometry(1, 1)

  // jato: 3 laminas em leque em volta do eixo do cano
  const laminas = []
  for (let i = 0; i < 3; i++) {
    const giro = new THREE.Group()
    giro.rotation.z = (i / 3) * Math.PI
    raiz.add(giro)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = Math.PI / 2          // o plano passa a conter o eixo Z
    m.frustumCulled = false
    m.renderOrder = 5
    giro.add(m)
    laminas.push({ giro, mesh: m })
  }

  // estrela: sempre de frente pra camera, no ponto da boca
  const estrela = new THREE.Mesh(geo, mat)
  estrela.frustumCulled = false
  estrela.renderOrder = 6
  raiz.add(estrela)

  let t = 0, dur = 0.075, tam = 1

  /** pos e quat sao a pose da BOCA no mundo (+Z = pra onde o tiro sai). */
  function disparar(pos, quat, tamanho, duracao) {
    raiz.position.copy(pos)
    if (quat) raiz.quaternion.copy(quat)
    tam = tamanho || 0.3
    dur = duracao || 0.075
    t = 0
    raiz.visible = true
    // cada tiro gira o leque: dois claroes identicos seguidos denunciam sprite
    const base = Math.random() * Math.PI
    for (let i = 0; i < laminas.length; i++) {
      laminas[i].giro.rotation.z = base + (i / 3) * Math.PI
    }
    estrela.rotation.z = Math.random() * Math.PI
  }

  function atualizar(dt, camera) {
    if (!raiz.visible) return
    t += dt
    const k = t / dur
    if (k >= 1) { raiz.visible = false; return }
    // estoura no primeiro quadro e encolhe: fogo de polvora nao cresce devagar
    const abre = 1 - Math.pow(1 - k, 2.4)
    const comp = tam * (0.75 + abre * 0.6)          // comprimento da lingua
    const larg = tam * (0.42 + abre * 0.5)
    for (const l of laminas) {
      l.mesh.scale.set(larg, comp, 1)
      l.mesh.position.z = comp * 0.42               // sai da boca pra frente
    }
    const e = tam * (0.85 + abre * 0.7)
    estrela.scale.set(e, e, e)
    if (camera) {
      // quaternion da camera no espaco da raiz (a raiz esta girada com a arma)
      raiz.getWorldQuaternion(_qA).invert()
      camera.getWorldQuaternion(_qB)
      estrela.quaternion.copy(_qA.multiply(_qB))
      estrela.rotateZ(t * 6)
    }
    mat.opacity = Math.pow(1 - k, 1.3)
  }

  function dispose() {
    scene.remove(raiz)
    geo.dispose(); mat.dispose()
  }

  return { disparar, atualizar, dispose, get aceso() { return raiz.visible } }
}

const _qA = new THREE.Quaternion()
const _qB = new THREE.Quaternion()

// ============================================================================
// POOL DE BILLBOARDS — serve pra fumaca e pra faisca (muda so o material)
// ============================================================================
function criarPoolBillboard(scene, n, mat, tamBase) {
  const geo = new THREE.PlaneGeometry(1, 1)
  const itens = []
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat.clone())
    m.visible = false
    m.frustumCulled = false
    m.renderOrder = 4
    scene.add(m)
    itens.push({ mesh: m, vel: new THREE.Vector3(), t: 0, dur: 1, s0: 1, s1: 1, giro: 0, op: 1 })
  }
  let proximo = 0

  function emitir(pos, vel, dur, s0, s1, opacidade) {
    const it = itens[proximo]
    proximo = (proximo + 1) % itens.length
    it.mesh.position.copy(pos)
    it.vel.copy(vel)
    it.t = 0
    it.dur = dur
    it.s0 = s0
    it.s1 = s1
    it.op = opacidade === undefined ? 1 : opacidade
    it.giro = (Math.random() - 0.5) * 2.2
    it.mesh.visible = true
    it.mesh.scale.setScalar(s0 * tamBase)
    return it
  }

  function atualizar(dt, camera, arrasto, gravidade) {
    for (const it of itens) {
      if (!it.mesh.visible) continue
      it.t += dt
      const k = it.t / it.dur
      if (k >= 1) { it.mesh.visible = false; continue }
      it.vel.multiplyScalar(Math.exp(-(arrasto || 0) * dt))
      it.vel.y += (gravidade || 0) * dt
      it.mesh.position.addScaledVector(it.vel, dt)
      const s = (it.s0 + (it.s1 - it.s0) * k) * tamBase
      it.mesh.scale.setScalar(s)
      if (camera) it.mesh.quaternion.copy(camera.quaternion)
      it.mesh.rotateZ(it.giro * it.t)
      // sobe rapido e apaga devagar: a curva e o que separa "puff" de "mancha"
      it.mesh.material.opacity = it.op * Math.min(1, k * 6) * Math.pow(1 - k, 1.6)
    }
  }

  function dispose() {
    for (const it of itens) { scene.remove(it.mesh); it.mesh.material.dispose() }
    geo.dispose()
    itens.length = 0
  }

  return { emitir, atualizar, dispose, itens }
}

/** Fumaca branca de polvora: nao e aditiva, senao vira luz em vez de nuvem. */
export function criarFumaca(scene, n = 22) {
  const mat = new THREE.MeshBasicMaterial({
    map: texturaFumaca(), color: 0xd8d6cf, transparent: true, opacity: 0,
    depthWrite: false, fog: false,
  })
  const pool = criarPoolBillboard(scene, n, mat, 1)
  mat.dispose()
  const _v = new THREE.Vector3()

  /** Baforada saindo da boca do cano na direcao do tiro. */
  function baforada(pos, dir, quantidade = 6) {
    for (let i = 0; i < quantidade; i++) {
      _v.copy(dir).multiplyScalar(0.9 + Math.random() * 1.5)
      _v.x += (Math.random() - 0.5) * 0.5
      _v.y += 0.22 + Math.random() * 0.42
      _v.z += (Math.random() - 0.5) * 0.5
      pool.emitir(pos, _v, 1.1 + Math.random() * 0.9,
        0.06 + Math.random() * 0.05, 0.40 + Math.random() * 0.26, 0.85)
    }
  }

  function atualizar(dt, camera) { pool.atualizar(dt, camera, 2.6, 0.28) }

  return { baforada, atualizar, dispose: pool.dispose }
}

/** Faiscas: usadas no impacto e nos respingos da boca do cano. */
export function criarFaiscas(scene, n = 40) {
  const mat = new THREE.MeshBasicMaterial({
    map: texturaFaisca(), color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const pool = criarPoolBillboard(scene, n, mat, 1)
  mat.dispose()
  const _v = new THREE.Vector3()

  /** Leque de faiscas saindo de um ponto na direcao de `dir`. */
  function estourar(pos, dir, quantidade = 8, forca = 4.5) {
    for (let i = 0; i < quantidade; i++) {
      _v.copy(dir).multiplyScalar(forca * (0.4 + Math.random() * 0.8))
      _v.x += (Math.random() - 0.5) * forca * 0.9
      _v.y += (Math.random() - 0.5) * forca * 0.9
      _v.z += (Math.random() - 0.5) * forca * 0.9
      pool.emitir(pos, _v, 0.16 + Math.random() * 0.26,
        0.016 + Math.random() * 0.014, 0.002, 1)
    }
  }

  function atualizar(dt, camera) { pool.atualizar(dt, camera, 5.5, -7.5) }

  return { estourar, atualizar, dispose: pool.dispose }
}

// ============================================================================
// FUROS DE BALA — placas coladas na superficie, somem sozinhas
// ============================================================================
export function criarFuros(scene, n = 14) {
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.MeshBasicMaterial({
    map: texturaFuro(), transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide,
    // polygonOffset puxa a placa pra frente NO DEPTH BUFFER: sem isso ela
    // briga com a parede e pisca (z-fighting) a cada movimento de camera.
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -6,
  })
  const itens = []
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat.clone())
    m.visible = false
    m.renderOrder = 3
    scene.add(m)
    itens.push({ mesh: m, t: 0, dur: 9 })
  }
  mat.dispose()
  let proximo = 0
  const _q = new THREE.Quaternion()
  const _n = new THREE.Vector3()
  const EIXO = new THREE.Vector3(0, 0, 1)

  function marcar(ponto, normal, tamanho = 0.1) {
    const it = itens[proximo]
    proximo = (proximo + 1) % itens.length
    _n.copy(normal)
    if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0)
    _n.normalize()
    // a placa nasce olhando pra +Z; girar +Z ate a normal a deita na parede
    _q.setFromUnitVectors(EIXO, _n)
    it.mesh.quaternion.copy(_q)
    it.mesh.rotateZ(Math.random() * Math.PI * 2)
    it.mesh.position.copy(ponto).addScaledVector(_n, 0.006)
    it.mesh.scale.setScalar(tamanho)
    it.mesh.material.opacity = 1
    it.mesh.visible = true
    it.t = 0
  }

  function atualizar(dt) {
    for (const it of itens) {
      if (!it.mesh.visible) continue
      it.t += dt
      if (it.t >= it.dur) { it.mesh.visible = false; continue }
      // fica cheio quase o tempo todo e some no ultimo terco
      const k = it.t / it.dur
      it.mesh.material.opacity = k < 0.6 ? 1 : Math.pow(1 - (k - 0.6) / 0.4, 1.5)
    }
  }

  function dispose() {
    for (const it of itens) { scene.remove(it.mesh); it.mesh.material.dispose() }
    geo.dispose()
    itens.length = 0
  }

  return { marcar, atualizar, dispose }
}

// ============================================================================
// CAPSULAS EJETADAS — caem girando e apagam depois de uns segundos
// ============================================================================
export function criarCapsulas(scene, n = 8) {
  const geo = new THREE.CylinderGeometry(0.0052, 0.0055, 0.019, 8)
  const mat = solid(0x8a6c2c, 0.45, 0.85)
  const itens = []
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat)
    m.visible = false
    m.castShadow = true
    scene.add(m)
    itens.push({ mesh: m, vel: new THREE.Vector3(), giro: new THREE.Vector3(), t: 0, chao: 0 })
  }
  let proximo = 0

  /** `chaoY` e a altura onde a capsula para de cair (o piso naquele ponto). */
  function ejetar(pos, vel, chaoY) {
    const it = itens[proximo]
    proximo = (proximo + 1) % itens.length
    it.mesh.position.copy(pos)
    it.mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    it.mesh.scale.setScalar(1)
    it.vel.copy(vel)
    // giro rapido e desalinhado: e o tombo da capsula que le como "metal leve"
    it.giro.set((Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26, (Math.random() - 0.5) * 26)
    it.t = 0
    it.chao = chaoY === undefined ? 0 : chaoY
    it.mesh.visible = true
  }

  function atualizar(dt) {
    for (const it of itens) {
      if (!it.mesh.visible) continue
      it.t += dt
      if (it.t > 4.2) { it.mesh.visible = false; continue }
      it.vel.y -= 16 * dt
      it.mesh.position.addScaledVector(it.vel, dt)
      it.mesh.rotation.x += it.giro.x * dt
      it.mesh.rotation.y += it.giro.y * dt
      it.mesh.rotation.z += it.giro.z * dt
      const piso = it.chao + 0.006
      if (it.mesh.position.y < piso) {
        it.mesh.position.y = piso
        // quica perdendo quase toda a energia; a segunda batida ja e o fim
        it.vel.y = Math.abs(it.vel.y) * 0.28
        it.vel.x *= 0.55; it.vel.z *= 0.55
        it.giro.multiplyScalar(0.5)
        if (it.vel.y < 0.35) { it.vel.set(0, 0, 0); it.giro.set(0, 0, 0) }
      }
      // encolhe no ultimo segundo em vez de sumir num quadro
      if (it.t > 3.2) it.mesh.scale.setScalar(Math.max(0.001, 1 - (it.t - 3.2) / 1))
    }
  }

  function dispose() {
    for (const it of itens) scene.remove(it.mesh)
    geo.dispose()
    itens.length = 0
  }

  return { ejetar, atualizar, dispose }
}
