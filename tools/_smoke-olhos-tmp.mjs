// Smoke adversarial dos OLHOS: 5 itens x 6 cranios.
//   node tools/_smoke-olhos-tmp.mjs
//
// Modelado no _smoke-cabelo-tmp.mjs: caixa por vertice, normais, folga contra a
// MALHA do cranio realmente desenhada, costura de revolucao, orcamento de
// triangulo, geometria compartilhada, useHead, determinismo e Z nao-fixo.
// Acrescenta o que so o olho precisa: triangulo COSTADO em peca de material
// FrontSide (iris/esclera/pupila invisiveis) e janela de altura do CONTRATO.
import * as THREE from 'three'
import { OLHOS, OLHO_GLOBO } from '../src/player/rosto/olhos.js'
import {
  CRANIOS, setActiveHead, makeHeadGeometry, HEAD, HEAD_S, EYE_ANCHOR, surfaceZ,
} from '../src/player/rosto/nucleo.js'

const S = HEAD_S
const falhas = []
const avisos = []
function ok(nome, cond, detalhe) {
  if (!cond) falhas.push(nome + (detalhe ? '  -> ' + detalhe : ''))
  console.log((cond ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const ctxDe = (cabeca, olhos = 0) => ({ cabeca, olhos, pele: 3, corCabelo: 1, corBarba: 0 })

// --------------------------------------------------------------------------
function analisa(obj) {
  const r = {
    meshes: 0, tris: 0, verts: 0, nan: 0, degen: 0, idxFora: 0,
    bbox: new THREE.Box3(), semNormal: 0, costura: 0, costadas: 0, costadasOnde: '',
    dobro: 0,
  }
  const m4 = new THREE.Matrix4()
  const nm = new THREE.Matrix3()
  obj.updateMatrixWorld(true)
  obj.traverse((o) => {
    if (!o.isMesh) return
    r.meshes++
    const g = o.geometry
    m4.copy(o.matrixWorld)
    nm.getNormalMatrix(m4)
    const pos = g.attributes.position
    r.verts += pos.count
    const idx = g.index ? g.index.array : null
    const nTri = idx ? idx.length / 3 : pos.count / 3
    r.tris += nTri
    const w = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { r.nan++; continue }
      w.set(x, y, z).applyMatrix4(m4)
      r.bbox.expandByPoint(w)
    }
    const nor = g.attributes.normal
    if (nor) {
      for (let i = 0; i < nor.count; i++) {
        const m = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))
        if (!(m > 0.5)) r.semNormal++
      }
      // COSTURA NAO SOLDADA: vertices na MESMA posicao com normais diferentes.
      const mapa = new Map()
      for (let i = 0; i < pos.count; i++) {
        const k = pos.getX(i) + '|' + pos.getY(i) + '|' + pos.getZ(i)
        const l = mapa.get(k); if (l) l.push(i); else mapa.set(k, [i])
      }
      for (const lista of mapa.values()) {
        if (lista.length < 2) continue
        const a = lista[0]
        for (let q = 1; q < lista.length; q++) {
          const b = lista[q]
          const d = nor.getX(a) * nor.getX(b) + nor.getY(a) * nor.getY(b) + nor.getZ(a) * nor.getZ(b)
          if (d < 0.999) { r.costura++; break }
        }
      }
    }
    // triangulo COSTADO: so importa em material de uma face so.
    const umaFace = !(o.material && o.material.side === THREE.DoubleSide)
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3()
    for (let t = 0; t < nTri; t++) {
      const ia = idx ? idx[t * 3] : t * 3
      const ib = idx ? idx[t * 3 + 1] : t * 3 + 1
      const ic = idx ? idx[t * 3 + 2] : t * 3 + 2
      if (ia >= pos.count || ib >= pos.count || ic >= pos.count) { r.idxFora++; continue }
      a.fromBufferAttribute(pos, ia).applyMatrix4(m4)
      b.fromBufferAttribute(pos, ib).applyMatrix4(m4)
      c.fromBufferAttribute(pos, ic).applyMatrix4(m4)
      ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac)
      const area = n.length() * 0.5
      if (!(area > 1e-12)) { r.degen++; continue }
      if (!umaFace) continue
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3
      // direcao "pra fora da cabeca" no centroide (gradiente do elipsoide base)
      const gx = cx / (HEAD.rx * HEAD.rx), gy = cy / (HEAD.ry * HEAD.ry), gz = cz / (HEAD.rz * HEAD.rz)
      const gm = Math.hypot(gx, gy, gz) || 1
      const d = (n.x / (2 * area)) * (gx / gm) + (n.y / (2 * area)) * (gy / gm) + (n.z / (2 * area)) * (gz / gm)
      if (d < -0.30) {
        r.costadas++
        if (!r.costadasOnde) r.costadasOnde = (o.material && o.material.name) || ('mesh#' + r.meshes) +
          ' em y=' + cy.toFixed(3) + ' z=' + cz.toFixed(3)
      }
    }
  })
  return r
}

// --------------------------------------------------------------------------
// FOLGA CONTRA A CABECA REALMENTE DESENHADA.
// --------------------------------------------------------------------------
const NB = 96
function indiceCranio(geo) {
  const pos = geo.attributes.position
  const idx = geo.index ? geo.index.array : null
  const nTri = idx ? idx.length / 3 : pos.count / 3
  const baldes = []
  for (let i = 0; i < NB; i++) baldes.push([])
  const tris = []
  const az = (x, z) => Math.atan2(x, z)
  for (let t = 0; t < nTri; t++) {
    const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2
    const ax = pos.getX(ia), ay = pos.getY(ia), azz = pos.getZ(ia)
    const bx = pos.getX(ib), by = pos.getY(ib), bz = pos.getZ(ib)
    const cx = pos.getX(ic), cy = pos.getY(ic), cz = pos.getZ(ic)
    const id = tris.length
    tris.push([ax, ay, azz, bx, by, bz, cx, cy, cz])
    const a1 = az(ax, azz), a2 = az(bx, bz), a3 = az(cx, cz)
    const lo = Math.min(a1, a2, a3), hi = Math.max(a1, a2, a3)
    if (hi - lo > Math.PI * 0.5) { for (let i = 0; i < NB; i++) baldes[i].push(id); continue }
    const b0 = Math.floor(((lo + Math.PI) / (Math.PI * 2)) * NB) - 1
    const b1 = Math.floor(((hi + Math.PI) / (Math.PI * 2)) * NB) + 1
    for (let i = b0; i <= b1; i++) baldes[((i % NB) + NB) % NB].push(id)
  }
  return { baldes, tris }
}
function raioMalha(ind, dx, dy, dz) {
  const b = Math.floor(((Math.atan2(dx, dz) + Math.PI) / (Math.PI * 2)) * NB)
  const lista = ind.baldes[((b % NB) + NB) % NB]
  let melhor = -1
  for (let q = 0; q < lista.length; q++) {
    const T = ind.tris[lista[q]]
    const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2]
    const e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2]
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x
    const det = e1x * px + e1y * py + e1z * pz
    if (det > -1e-12 && det < 1e-12) continue
    const inv = 1 / det
    const tx = -T[0], ty = -T[1], tz = -T[2]
    const u = (tx * px + ty * py + tz * pz) * inv
    if (u < -1e-7 || u > 1 + 1e-7) continue
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
    const v = (dx * qx + dy * qy + dz * qz) * inv
    if (v < -1e-7 || u + v > 1 + 1e-7) continue
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv
    if (t > 1e-6 && t > melhor) melhor = t
  }
  return melhor
}
/** [minima, maxima, onde] folga radial (m) de TODO vertice contra a malha. */
function folgas(obj, ind) {
  let min = Infinity, max = -Infinity, ondeMin = '', ondeMax = ''
  const w = new THREE.Vector3()
  obj.updateMatrixWorld(true)
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      const m = w.length()
      if (!(m > 1e-6)) continue
      const t = raioMalha(ind, w.x / m, w.y / m, w.z / m)
      if (t < 0) continue
      const d = m - t
      const onde = 'y=' + w.y.toFixed(3) + ' az=' + Math.atan2(w.x, w.z).toFixed(2)
      if (d < min) { min = d; ondeMin = onde }
      if (d > max) { max = d; ondeMax = onde }
    }
  })
  return [min, max, ondeMin, ondeMax]
}

/** So a folga da LATERAL (|az| > 0.75 rad): o calombo da tempora. */
function folgaLateral(obj, ind) {
  let max = -Infinity, onde = ''
  const w = new THREE.Vector3()
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      w.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld)
      const m = w.length()
      if (!(m > 1e-6)) continue
      if (Math.abs(Math.atan2(w.x, w.z)) < 0.75) continue
      const t = raioMalha(ind, w.x / m, w.y / m, w.z / m)
      if (t < 0) continue
      if (m - t > max) { max = m - t; onde = 'y=' + w.y.toFixed(3) + ' az=' + Math.atan2(w.x, w.z).toFixed(2) }
    }
  })
  return [max === -Infinity ? 0 : max, onde]
}

// --------------------------------------------------------------------------
console.log('=== OLHOS: ' + OLHOS.length + ' itens ===')
ok('o catalogo tem 5 itens (CONTRATO §9)', OLHOS.length === 5, String(OLHOS.length))
for (const b of OLHOS) {
  ok('item ' + b.id + ' tem id/nome/name/metodo/build',
    !!(b.id && b.nome && b.name && b.metodo && typeof b.build === 'function'))
}
ok('OLHO_GLOBO tem uma entrada por item', OLHO_GLOBO.length === OLHOS.length,
  OLHO_GLOBO.length + ' vs ' + OLHOS.length)

const ORCAMENTO = 12000
// janela do CONTRATO §5: sobrancelha em +0.096*S, base do nariz em -0.035*S
const Y_SOBRANCELHA = 0.096 * S
const Y_NARIZ = -0.035 * S
const Y_OLHO = EYE_ANCHOR.y

const tabela = []
const indices = []
for (let ci = 0; ci < CRANIOS.length; ci++) indices.push(indiceCranio(makeHeadGeometry(ci, 1)))

for (let ci = 0; ci < CRANIOS.length; ci++) {
  for (let bi = 0; bi < OLHOS.length; bi++) {
    const item = OLHOS[bi]
    let obj = null, erro = null
    try { obj = item.build(ctxDe(ci, bi)) } catch (e) { erro = e }
    ok('build ' + item.id + ' no cranio ' + CRANIOS[ci].id + ' nao lanca', !erro, erro && String(erro.stack || erro))
    if (!obj) continue
    setActiveHead(ci)
    const r = analisa(obj)
    const [fmin, fmax, ondeMin, ondeMax] = folgas(obj, indices[ci])
    const [flat, ondeLat] = folgaLateral(obj, indices[ci])
    tabela.push({
      cranio: CRANIOS[ci].id, item: item.id, meshes: r.meshes, tris: r.tris,
      y: [r.bbox.min.y, r.bbox.max.y], z: [r.bbox.min.z, r.bbox.max.z], x: [r.bbox.min.x, r.bbox.max.x],
      folga: [fmin, fmax], lat: flat,
    })
    const tag = '  ' + item.id + '/' + CRANIOS[ci].id + ': '
    ok(tag + 'sem NaN, sem indice fora, sem normal nula',
      r.nan === 0 && r.idxFora === 0 && r.semNormal === 0,
      'nan=' + r.nan + ' idxFora=' + r.idxFora + ' normalZero=' + r.semNormal)
    ok(tag + 'orcamento de triangulos (<=' + ORCAMENTO + ')', r.tris <= ORCAMENTO, r.tris + ' tris')
    ok(tag + 'nenhum triangulo COSTADO em material de uma face', r.costadas === 0,
      r.costadas + ' costados ' + r.costadasOnde)
    ok(tag + 'costura de revolucao soldada', r.costura === 0, r.costura + ' vertices de costura')
    ok(tag + 'nao enterrado na malha do cranio (>= -2 mm)', fmin >= -0.002,
      'folga min ' + (fmin * 1000).toFixed(2) + ' mm em ' + ondeMin)
    ok(tag + 'nao flutuando (folga max <= 30 mm)', fmax <= 0.030,
      'folga max ' + (fmax * 1000).toFixed(2) + ' mm em ' + ondeMax)
    ok(tag + 'calombo LATERAL menor que o frontal', flat <= fmax + 1e-9 && flat <= 0.022,
      'lateral ' + (flat * 1000).toFixed(2) + ' mm em ' + ondeLat + ' (max ' + (fmax * 1000).toFixed(2) + ')')
    ok(tag + 'caixa na janela do rosto (abaixo da sobrancelha, acima do nariz)',
      r.bbox.max.y <= Y_SOBRANCELHA + 0.030 && r.bbox.min.y >= Y_NARIZ - 0.030,
      'y ' + r.bbox.min.y.toFixed(4) + '..' + r.bbox.max.y.toFixed(4) +
      ' (sobrancelha ' + Y_SOBRANCELHA.toFixed(4) + ', nariz ' + Y_NARIZ.toFixed(4) + ')')
    ok(tag + 'o olho cobre a ancora y=' + Y_OLHO.toFixed(4),
      r.bbox.min.y < Y_OLHO && r.bbox.max.y > Y_OLHO)
    ok(tag + 'nao passa da lateral da cabeca', r.bbox.max.x <= HEAD.rx * 1.02,
      'x max ' + r.bbox.max.x.toFixed(4) + ' vs rx ' + HEAD.rx.toFixed(4))
    ok(tag + 'simetrico', Math.abs(r.bbox.max.x + r.bbox.min.x) < 1e-6,
      r.bbox.min.x.toFixed(5) + ' / ' + r.bbox.max.x.toFixed(5))
    if (r.degen) avisos.push(item.id + '/' + CRANIOS[ci].id + ': ' + r.degen + ' triangulos degenerados')
  }
}

// --- geometria compartilhada entre builds ---------------------------------
for (const item of OLHOS) {
  const a = item.build(ctxDe(0)), b = item.build(ctxDe(0))
  const ga = [], gb = []
  a.traverse((o) => o.isMesh && ga.push(o.geometry))
  b.traverse((o) => o.isMesh && gb.push(o.geometry))
  const compartilha = ga.some((g) => gb.includes(g))
  ok('geometria NOVA a cada build: ' + item.id, !compartilha && ga.length > 0,
    compartilha ? 'MESMA geometria em dois builds' : ga.length + ' geos, todas novas')
  const attrA = ga.map((g) => g.attributes.position)
  const attrB = gb.map((g) => g.attributes.position)
  ok('atributo de posicao novo a cada build: ' + item.id, !attrA.some((x) => attrB.includes(x)))
}

// --- useHead() de verdade --------------------------------------------------
function assinatura(obj) {
  const bb = new THREE.Box3()
  obj.updateMatrixWorld(true)
  obj.traverse((o) => {
    if (!o.isMesh) return
    o.geometry.computeBoundingBox()
    bb.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld))
  })
  return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(6)).join(',')
}
for (const item of OLHOS) {
  const s0a = assinatura(item.build(ctxDe(0)))
  const s5 = assinatura(item.build(ctxDe(5)))
  const s0b = assinatura(item.build(ctxDe(0)))
  ok('build(' + item.id + ') chama useHead: cranio 0 depois do 5 volta identico', s0a === s0b)
  ok('build(' + item.id + ') RESPONDE ao cranio (0 != 5)', s0a !== s5)
}

// --- build deterministico --------------------------------------------------
function hashPos(obj) {
  let h = 0
  obj.traverse((o) => {
    if (!o.isMesh) return
    const p = o.geometry.attributes.position.array
    for (let i = 0; i < p.length; i++) h = (h * 31 + Math.round(p[i] * 1e6)) | 0
  })
  return h
}
for (const item of OLHOS) {
  ok('build deterministico: ' + item.id, hashPos(item.build(ctxDe(2))) === hashPos(item.build(ctxDe(2))))
}

// --- z nao e fixo ----------------------------------------------------------
for (const item of OLHOS) {
  const zs = []
  for (let ci = 0; ci < CRANIOS.length; ci++) {
    const o = item.build(ctxDe(ci))
    const bb = new THREE.Box3()
    o.updateMatrixWorld(true)
    o.traverse((m) => {
      if (!m.isMesh) return
      m.geometry.computeBoundingBox()
      bb.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld))
    })
    zs.push(bb.max.z)
  }
  const d = Math.max(...zs) - Math.min(...zs)
  ok('z acompanha o cranio (nao e constante): ' + item.id, d > 0.003,
    'z max varia ' + (d * 1000).toFixed(1) + ' mm entre os 6')
}

// --- a piscada achata em Y: nada pode estar fora do grupo ------------------
for (const item of OLHOS) {
  const o = item.build(ctxDe(0))
  let solto = 0
  o.traverse((c) => { if (c !== o && c.parent === o && !c.isMesh && !c.isGroup) solto++ })
  ok('a raiz devolvida e um Object3D unico: ' + item.id, o && o.isObject3D && solto === 0)
}

// --- vertexColors proibido (congelar.js) ----------------------------------
for (const item of OLHOS) {
  let comCor = 0
  const o = item.build(ctxDe(0))
  o.traverse((c) => { if (c.isMesh && c.geometry.attributes.color) comCor++ })
  ok('nenhuma geometria traz atributo `color`: ' + item.id, comCor === 0, comCor + ' geos com color')
}

console.log('\ncranio      item        mesh   tris    y-min   y-max   z-max    x-hw   folga(mm)      lat(mm)')
for (const t of tabela) {
  console.log(
    t.cranio.padEnd(11) + t.item.padEnd(12) +
    String(t.meshes).padStart(4) + String(t.tris).padStart(7) +
    t.y[0].toFixed(3).padStart(9) + t.y[1].toFixed(3).padStart(8) +
    t.z[1].toFixed(3).padStart(8) + t.x[1].toFixed(3).padStart(8) +
    ('  ' + (t.folga[0] * 1000).toFixed(1) + '..' + (t.folga[1] * 1000).toFixed(1)).padStart(14) +
    (t.lat * 1000).toFixed(1).padStart(11))
}
const porItem = new Map()
for (const t of tabela) porItem.set(t.item, Math.max(porItem.get(t.item) || 0, t.tris))
console.log('\ntris (par, pior cranio): ' + [...porItem].map(([k, v]) => k + '=' + v).join('  '))

console.log('\n' + (avisos.length ? 'AVISOS:\n  ' + avisos.join('\n  ') : 'sem avisos'))
console.log('\n' + (falhas.length ? falhas.length + ' FALHAS:\n  ' + falhas.join('\n  ') : 'TUDO PASSOU'))
process.exit(falhas.length ? 1 : 0)
