import * as THREE from 'three'

// ---------------------------------------------------------------------------
// "Forno" de geometria: funde os meshes estaticos de uma subarvore em um mesh
// por material. Os interiores das lojas ficam visiveis da rua pelas vitrines,
// entao sem isso a cena passa de 1900 draw calls andando na calcada.
//
// Sobrevive intacto (nao e fundido):
//  - qualquer subarvore com userData.dynamic (NPCs animam junta por junta)
//  - qualquer no com userData.update / userData.setPhase (props animados)
//  - luzes, sprites, InstancedMesh, SkinnedMesh e multi-material
// ---------------------------------------------------------------------------

/** Funde varias BufferGeometry ja transformadas para o espaco do grupo. */
export function mergeGeometries(list) {
  let vTotal = 0, iTotal = 0, hasUV = true
  for (const g of list) {
    if (!g.attributes.uv) hasUV = false
    vTotal += g.attributes.position.count
    iTotal += g.index ? g.index.count : g.attributes.position.count
  }
  if (!vTotal) return null
  const pos = new Float32Array(vTotal * 3)
  const nor = new Float32Array(vTotal * 3)
  const uvs = hasUV ? new Float32Array(vTotal * 2) : null
  const idx = vTotal > 65000 ? new Uint32Array(iTotal) : new Uint16Array(iTotal)
  let vo = 0, io = 0
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv
    const c = p.count
    for (let i = 0; i < c; i++) {
      const o3 = (vo + i) * 3
      pos[o3] = p.getX(i); pos[o3 + 1] = p.getY(i); pos[o3 + 2] = p.getZ(i)
      if (n) { nor[o3] = n.getX(i); nor[o3 + 1] = n.getY(i); nor[o3 + 2] = n.getZ(i) }
      if (uvs && u) { uvs[(vo + i) * 2] = u.getX(i); uvs[(vo + i) * 2 + 1] = u.getY(i) }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = vo + g.index.getX(i)
      io += g.index.count
    } else {
      for (let i = 0; i < c; i++) idx[io + i] = vo + i
      io += c
    }
    vo += c
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  return out
}

/**
 * Funde a subarvore de `root` no lugar. Retorna estatisticas.
 * O que nao pode ser fundido e reparentado em `root` mantendo a pose no mundo.
 */
export function bakeStatic(root, opts = {}) {
  if (!root) return { before: 0, after: 0, merged: 0 }
  const keepFn = opts.keep || null
  root.updateMatrixWorld(true)

  const before = countDrawables(root)
  const buckets = new Map()
  const keep = []

  // O inverso da matriz do root leva do mundo para o espaco local do grupo,
  // assim o grupo continua podendo ser movido/rotacionado depois.
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  const local = new THREE.Matrix4()

  function isDynamicBranch(node) {
    for (let n = node; n && n !== root.parent; n = n.parent) {
      const u = n.userData
      if (!u) continue
      if (u.dynamic || u.noBake) return true
      if (typeof u.update === 'function' || typeof u.setPhase === 'function') return true
      if (keepFn && keepFn(n)) return true
    }
    return false
  }

  root.traverse((n) => {
    if (n === root) return
    if (isDynamicBranch(n)) {
      // preserva o topo da subarvore dinamica, nao cada filho dela
      if (!isDynamicBranch(n.parent) || n.parent === root) keep.push(n)
      return
    }
    if (n.isLight || n.isSprite || n.isPoints || n.isLine) { keep.push(n); return }
    // Nada que nao possa ser fundido pode ser simplesmente ignorado: a arvore
    // antiga e descartada no fim, entao o que nao entra no forno tem que ser
    // explicitamente preservado (InstancedMesh dos produtos, por exemplo).
    if (!n.isMesh) return // grupos vazios somem junto com a arvore antiga
    if (n.isInstancedMesh || n.isSkinnedMesh) { keep.push(n); return }
    const g = n.geometry
    if (!g || !g.attributes || !g.attributes.position) { keep.push(n); return }
    if (Array.isArray(n.material) || !n.material) { keep.push(n); return }
    if (n.visible === false) { keep.push(n); return }

    const key = n.material.uuid + (n.castShadow ? '|c' : '|n') + (n.receiveShadow ? '|r' : '|x')
    let b = buckets.get(key)
    if (!b) {
      b = { mat: n.material, cast: n.castShadow, receive: n.receiveShadow, geos: [] }
      buckets.set(key, b)
    }
    const gc = g.clone()
    if (!gc.attributes.normal) gc.computeVertexNormals()
    local.copy(invRoot).multiply(n.matrixWorld)
    gc.applyMatrix4(local)
    b.geos.push(gc)
  })

  // tira do lugar antigo o que sobrevive e recoloca no root, mantendo a pose
  for (const n of keep) {
    if (n.parent === root) continue
    const mw = n.matrixWorld.clone()
    if (n.parent) n.parent.remove(n)
    local.copy(invRoot).multiply(mw)
    local.decompose(n.position, n.quaternion, n.scale)
    root.add(n)
  }

  // limpa a arvore antiga (os meshes fundidos e os grupos vazios)
  const oldChildren = root.children.filter((c) => !keep.includes(c))
  for (const c of oldChildren) root.remove(c)

  // NAO damos dispose() na geometria ORIGINAL do mesh que entrou no forno.
  //
  // Muita geometria deste jogo e COMPARTILHADA de proposito: a esfera do furo
  // serve aos 20 furos das rodas, a mao com dedos e uma so pro jogo inteiro, o
  // catalogo de rosto guarda olho e orelha em cache. dispose() nao pergunta
  // quantos meshes ainda apontam pra ela: libera o buffer, e todo mundo que
  // ainda usava aquela geometria vira mesh quebrado. Como o forno tambem e
  // chamado em subarvore (um carro, um objeto agarravel) enquanto o resto do
  // jogo continua desenhando a MESMA geometria, daqui nao da pra saber se ela
  // ficou sem dono.
  //
  // Soltar a referencia basta: o forno roda na montagem do mundo, ANTES do
  // primeiro render, entao a geometria descartada nunca virou buffer de GPU e
  // o coletor de lixo leva os arrays. Quem tem dono claro (o personagem)
  // libera as suas no proprio dispose().

  let merged = 0
  for (const b of buckets.values()) {
    const geo = mergeGeometries(b.geos)
    // Estes SIM sao descartaveis: b.geos guarda CLONES transformados, feitos
    // aqui dentro e que ninguem mais viu (ver o g.clone() la em cima).
    for (const g of b.geos) g.dispose()
    if (!geo) continue
    const m = new THREE.Mesh(geo, b.mat)
    m.castShadow = b.cast
    m.receiveShadow = b.receive
    m.name = 'baked'
    root.add(m)
    merged++
  }

  return { before, after: countDrawables(root), merged }
}

function countDrawables(root) {
  let n = 0
  root.traverse((o) => { if (o.isMesh) n++ })
  return n
}
