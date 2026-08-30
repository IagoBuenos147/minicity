import * as THREE from 'three'

// SOLA_Y exato, documentado no cabecalho de calcados.js
const SOLA_Y = -0.0875

function ctxFake(corCalcado) {
  const parts = {}
  return {
    medida: { SOLA_Y },
    cor: { calcado: corCalcado },
    montar(obj, nome) {
      if (!parts[nome]) parts[nome] = new THREE.Group()
      parts[nome].add(obj)
      return obj
    },
    parts,
  }
}

function analisa(nome, grupo) {
  let meshes = 0, tris = 0, nanFound = false
  const box = new THREE.Box3()
  grupo.traverse((o) => {
    if (o.isMesh) {
      meshes++
      const pos = o.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) nanFound = true
      }
      const idx = o.geometry.index
      tris += idx ? idx.count / 3 : pos.count / 3
      o.updateWorldMatrix(true, false)
      box.expandByObject(o)
    }
  })
  const size = new THREE.Vector3()
  box.getSize(size)
  const min = box.min, max = box.max
  console.log(`--- ${nome} ---`)
  console.log(`  meshes=${meshes} tris=${Math.round(tris)} nanFound=${nanFound}`)
  console.log(`  bbox min=(${min.x.toFixed(4)},${min.y.toFixed(4)},${min.z.toFixed(4)}) max=(${max.x.toFixed(4)},${max.y.toFixed(4)},${max.z.toFixed(4)})`)
  console.log(`  size=(${size.x.toFixed(4)},${size.y.toFixed(4)},${size.z.toFixed(4)})`)
  const okColarinho = min.y <= -0.012 + 1e-6
  console.log(`  colarinho ate y<=-0.012 ? ${okColarinho ? 'OK' : 'FALHOU -> ' + min.y.toFixed(4)}`)
}

const mod = await import('./src/player/roupa/calcados-extra2.js')
for (const item of mod.CALCADOS_EXTRA2) {
  const ctx = ctxFake(0x4a6fa5)
  const obj = item.build(ctx)
  const grupo = new THREE.Group()
  if (obj) grupo.add(obj)
  if (ctx.parts.footL) grupo.add(ctx.parts.footL)
  analisa(item.id, grupo)
}
console.log('fim')
