import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Colisao 2D no plano XZ: circulo do jogador contra AABBs.
// Grid uniforme pra nao testar centenas de caixas por frame.
// ---------------------------------------------------------------------------

const CELL = 8

export function createCollisionWorld() {
  const boxes = []
  const grid = new Map()

  const key = (cx, cz) => cx + ',' + cz

  function insert(b, index) {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL)
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = key(x, z)
        let arr = grid.get(k)
        if (!arr) { arr = []; grid.set(k, arr) }
        arr.push(index)
      }
    }
  }

  /**
   * Registra colisores e DEVOLVE as caixas internas, na mesma ordem.
   *
   * Devolver serve pra uma coisa so, e ela justifica: colisor que LIGA E
   * DESLIGA. A porta da casa velha barra o vao quando esta fechada e some
   * quando abre — quem a construiu guarda a caixa devolvida aqui e mexe no
   * `ativo` dela. Sem isto so restaria mover a caixa pra longe, e mover quebra
   * o indice da grade (a caixa continuaria listada na celula velha).
   */
  function add(list) {
    if (!list) return []
    const arr = Array.isArray(list) ? list : [list]
    const feitas = []
    for (const raw of arr) {
      if (!raw) continue
      // normaliza: aceita min/max fora de ordem
      const b = {
        minX: Math.min(raw.minX, raw.maxX),
        maxX: Math.max(raw.minX, raw.maxX),
        minZ: Math.min(raw.minZ, raw.maxZ),
        maxZ: Math.max(raw.minZ, raw.maxZ),
        tag: raw.tag || '',
        // false = existe na grade mas nao empurra ninguem. O padrao e true, e
        // e o que 99% dos colisores deste jogo sao pra sempre.
        ativo: raw.ativo !== false,
      }
      if (!isFinite(b.minX) || !isFinite(b.minZ) || !isFinite(b.maxX) || !isFinite(b.maxZ)) continue
      boxes.push(b)
      insert(b, boxes.length - 1)
      feitas.push(b)
    }
    return feitas
  }

  /** Cria um colisor a partir de centro + tamanho. */
  function addBox(cx, cz, w, d, tag) {
    add({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, tag })
  }

  const near = []
  function query(x, z, r) {
    near.length = 0
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL)
    const z0 = Math.floor((z - r) / CELL), z1 = Math.floor((z + r) / CELL)
    const seen = new Set()
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = grid.get(key(cx, cz))
        if (!arr) continue
        for (let i = 0; i < arr.length; i++) {
          if (seen.has(arr[i])) continue
          seen.add(arr[i])
          near.push(boxes[arr[i]])
        }
      }
    }
    return near
  }

  /**
   * Empurra a posicao para fora dos colisores. Muta o vetor.
   * Duas passadas resolvem bem os cantos entre duas caixas.
   */
  function resolve(pos, radius) {
    for (let pass = 0; pass < 2; pass++) {
      const list = query(pos.x, pos.z, radius + 0.5)
      let hit = false
      for (let i = 0; i < list.length; i++) {
        const b = list[i]
        if (b.ativo === false) continue
        // ponto mais proximo da caixa em relacao ao centro do circulo
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX))
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ))
        const dx = pos.x - cx, dz = pos.z - cz
        const d2 = dx * dx + dz * dz
        if (d2 > radius * radius) continue
        hit = true
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2)
          const push = radius - d
          pos.x += (dx / d) * push
          pos.z += (dz / d) * push
        } else {
          // centro dentro da caixa: sai pelo lado de menor penetracao
          const left = pos.x - b.minX, right = b.maxX - pos.x
          const back = pos.z - b.minZ, front = b.maxZ - pos.z
          const m = Math.min(left, right, back, front)
          if (m === left) pos.x = b.minX - radius
          else if (m === right) pos.x = b.maxX + radius
          else if (m === back) pos.z = b.minZ - radius
          else pos.z = b.maxZ + radius
        }
      }
      if (!hit) break
    }
    return pos
  }

  /** True se o ponto (com raio) esta livre. Util pra spawnar coisas. */
  function isFree(x, z, radius) {
    const list = query(x, z, radius)
    for (let i = 0; i < list.length; i++) {
      const b = list[i]
      if (b.ativo === false) continue
      const cx = Math.max(b.minX, Math.min(x, b.maxX))
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ))
      const dx = x - cx, dz = z - cz
      if (dx * dx + dz * dz <= radius * radius) return false
    }
    return true
  }

  // --- Occluders 3D (so pra camera) ----------------------------------------
  // Os colisores acima sao caixas XZ sem altura: servem pro jogador, mas nao
  // pra camera, porque um banco de 45 cm "bloquearia" uma camera a 2 m e ela
  // saltaria pra perto do personagem ao girar. Occluders tem altura de verdade
  // e so incluem o que realmente tapa a visao: paredes e predios.
  const occluders = []

  function addOccluder(minX, minY, minZ, maxX, maxY, maxZ, tag) {
    occluders.push({
      minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX),
      minY: Math.min(minY, maxY), maxY: Math.max(minY, maxY),
      minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ),
      tag: tag || '',
    })
  }

  function pointInside(b, x, y, z) {
    return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY && z >= b.minZ && z <= b.maxZ
  }

  /**
   * Fracao (0..1) do segmento from->to ate o primeiro occluder, ou 1 se livre.
   * Occluders que ja contem o ponto de partida sao ignorados: se a camera esta
   * dentro da loja, a casca da loja nao deve empurrar a camera pra dentro dela.
   * `pad` engorda a caixa pra camera nao encostar na parede.
   */
  function segmentHit(from, to, pad = 0.22) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z
    let best = 1
    for (let i = 0; i < occluders.length; i++) {
      const o = occluders[i]
      const minX = o.minX - pad, maxX = o.maxX + pad
      const minY = o.minY - pad, maxY = o.maxY + pad
      const minZ = o.minZ - pad, maxZ = o.maxZ + pad
      if (from.x >= minX && from.x <= maxX && from.y >= minY && from.y <= maxY &&
          from.z >= minZ && from.z <= maxZ) continue // ja esta dentro: ignora
      // slab test do segmento contra a caixa
      let t0 = 0, t1 = best
      let ok = true
      for (let a = 0; a < 3; a++) {
        const o0 = a === 0 ? from.x : a === 1 ? from.y : from.z
        const d = a === 0 ? dx : a === 1 ? dy : dz
        const lo = a === 0 ? minX : a === 1 ? minY : minZ
        const hi = a === 0 ? maxX : a === 1 ? maxY : maxZ
        if (Math.abs(d) < 1e-9) {
          if (o0 < lo || o0 > hi) { ok = false; break }
        } else {
          let ta = (lo - o0) / d, tb = (hi - o0) / d
          if (ta > tb) { const t = ta; ta = tb; tb = t }
          if (ta > t0) t0 = ta
          if (tb < t1) t1 = tb
          if (t0 > t1) { ok = false; break }
        }
      }
      if (ok && t0 < best) best = t0
    }
    return best
  }

  /** Debug: caixas dos occluders da camera. */
  function buildOccluderMesh() {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5588, wireframe: true })
    for (const b of occluders) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(
        b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), mat)
      m.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2)
      g.add(m)
    }
    g.userData.noCollide = true
    return g
  }

  /** Debug: wireframes dos colisores. */
  function buildDebugMesh() {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
    for (const b of boxes) {
      const w = b.maxX - b.minX, d = b.maxZ - b.minZ
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), mat)
      m.position.set((b.minX + b.maxX) / 2, 1, (b.minZ + b.maxZ) / 2)
      g.add(m)
    }
    g.userData.noCollide = true
    return g
  }

  return {
    add, addBox, resolve, isFree, query, buildDebugMesh,
    addOccluder, segmentHit, buildOccluderMesh, pointInside,
    get count() { return boxes.length },
    get occluderCount() { return occluders.length },
  }
}
