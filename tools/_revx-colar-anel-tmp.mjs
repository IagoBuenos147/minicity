// Smoke adversarial de COLAR / ANEL.
//   node tools/_revx-colar-anel-tmp.mjs <CAMPO> <N>
import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
import * as ROUPAS from '../src/player/roupas.js'
import * as AP from '../src/player/appearance.js'

const CAMPO = process.argv[2] || 'colar'
const N = parseInt(process.argv[3] || '4', 10)
const CAT = { colar: ROUPAS.COLARES, anelAcess: ROUPAS.ANEIS }[CAMPO]
const TETO = 2500

const falhas = []
function ok(nome, cond, det) {
  if (!cond) falhas.push(nome + (det ? '  -> ' + det : ''))
  console.log((cond ? 'OK   ' : 'FALHA') + '  ' + nome + (det ? '  -> ' + det : ''))
}

console.log('=== ' + CAMPO + ': ' + CAT.length + ' itens (esperado ' + N + ') ===')
ok('catalogo tem ' + N + ' itens', CAT.length === N, String(CAT.length))
ok('indice 0 devolve null', CAT[0].build({}) === null)
ok('ids distintos', new Set(CAT.map((x) => x.id)).size === CAT.length)
ok('metodos distintos', new Set(CAT.map((x) => x.metodo)).size === CAT.length)
const VALIDO = ['torso', 'peito', 'braco', 'antebraco', 'coxa', 'canela', 'pe']
for (const it of CAT) {
  if (!it.esconde) continue
  ok('esconde de ' + it.id + ' valido', it.esconde.every((k) => VALIDO.includes(k)), it.esconde.join(','))
}

function analisa(objs) {
  const r = { meshes: 0, tris: 0, nan: 0, degen: 0, semNormal: 0, bbox: new THREE.Box3(), geos: [] }
  const wp = new THREE.Vector3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (const raiz of objs) {
    raiz.updateWorldMatrix(true, true)
    raiz.traverse((o) => {
      if (!o.isMesh) return
      r.meshes++; r.geos.push(o.geometry)
      const g = o.geometry, pos = g.attributes.position
      const idx = g.index ? g.index.array : null
      const nT = idx ? idx.length / 3 : pos.count / 3
      r.tris += nT
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { r.nan++; continue }
        wp.set(x, y, z).applyMatrix4(o.matrixWorld); r.bbox.expandByPoint(wp)
      }
      const nor = g.attributes.normal
      if (!nor) r.semNormal += pos.count
      else for (let i = 0; i < nor.count; i++) {
        if (!(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) > 0.5)) r.semNormal++
      }
      for (let t = 0; t < nT; t++) {
        const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1
        const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
        if (!(b.sub(a).cross(c.sub(a)).length() * 0.5 > 1e-11)) r.degen++
      }
    })
  }
  return r
}

function volumeSinal(geo) {
  const pos = geo.attributes.position, idx = geo.index ? geo.index.array : null
  const nT = idx ? idx.length / 3 : pos.count / 3
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let v = 0
  for (let t = 0; t < nT; t++) {
    const i0 = idx ? idx[t * 3] : t * 3, i1 = idx ? idx[t * 3 + 1] : t * 3 + 1
    const i2 = idx ? idx[t * 3 + 2] : t * 3 + 2
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2)
    v += a.dot(b.clone().cross(c)) / 6
  }
  return v
}

const NCAB = (AP.CABECAS || []).length || 1
const tabela = []
for (let cab = 0; cab < NCAB; cab++) {
  for (let i = 1; i < CAT.length; i++) {
    const it = CAT[i]
    let p = null, erro = null
    try { p = createCharacter({ appearance: { [CAMPO]: i, cabeca: cab } }) } catch (e) { erro = e }
    ok('build ' + it.id + ' cranio ' + cab, !erro, erro && String(erro.stack || erro))
    if (erro) continue
    p.root.updateWorldMatrix(true, true)
    const r = analisa(p.pecasDe(CAMPO))
    if (cab === 0) {
      tabela.push({ id: it.id, meshes: r.meshes, tris: r.tris, bb: r.bbox, degen: r.degen })
    }
    const tag = '  ' + it.id + '/c' + cab + ': '
    ok(tag + 'sem NaN / normal nula', r.nan === 0 && r.semNormal === 0, 'nan=' + r.nan + ' nrm=' + r.semNormal)
    ok(tag + 'orcamento <= ' + TETO, r.tris <= TETO, r.tris + ' tris')
    p.dispose()
  }
}

for (let i = 1; i < CAT.length; i++) {
  const a = createCharacter({ appearance: { [CAMPO]: i } })
  const b = createCharacter({ appearance: { [CAMPO]: i } })
  const ga = analisa(a.pecasDe(CAMPO)).geos, gb = analisa(b.pecasDe(CAMPO)).geos
  const comp = ga.filter((g) => gb.includes(g))
  ok('geometria NOVA a cada build: ' + CAT[i].id, comp.length === 0 && ga.length > 0,
    comp.length ? comp.length + ' COMPARTILHADAS' : ga.length + ' geos')
  a.dispose(); b.dispose()
}

{
  const p = createCharacter({ appearance: { [CAMPO]: 1 } })
  let erro = null
  try { for (let v = 0; v < 3; v++) for (let i = 0; i < CAT.length; i++) p.setAppearance({ [CAMPO]: i }) } catch (e) { erro = e }
  ok('trocar 3 voltas (dispose) nao lanca', !erro, erro && String(erro.stack || erro))
  p.dispose()
}

for (let i = 1; i < CAT.length; i++) {
  const p = createCharacter({ appearance: { [CAMPO]: i } })
  const ruins = []
  for (const raiz of p.pecasDe(CAMPO)) {
    raiz.traverse((o) => {
      if (!o.isMesh || (o.material && o.material.side === THREE.DoubleSide)) return
      if (volumeSinal(o.geometry) < -1e-9) ruins.push(o.geometry.type)
    })
  }
  ok('malha FrontSide nao esta do avesso: ' + CAT[i].id, ruins.length === 0, ruins.join(','))
  p.dispose()
}

console.log('\nitem              mesh   tris     y-min    y-max     x-min    x-max     z-min    z-max  degen')
for (const t of tabela) {
  console.log(t.id.padEnd(18) + String(t.meshes).padStart(4) + String(t.tris).padStart(7)
    + t.bb.min.y.toFixed(3).padStart(10) + t.bb.max.y.toFixed(3).padStart(9)
    + t.bb.min.x.toFixed(3).padStart(10) + t.bb.max.x.toFixed(3).padStart(9)
    + t.bb.min.z.toFixed(3).padStart(10) + t.bb.max.z.toFixed(3).padStart(9)
    + String(t.degen).padStart(7))
}
console.log('\n' + (falhas.length ? falhas.length + ' FALHAS:\n  ' + falhas.join('\n  ') : 'sem falhas'))
process.exit(falhas.length ? 1 : 0)
