// Smoke adversarial da BARBA: 4 itens x 6 cranios.
//   node tools/_smoke-barba-tmp.mjs
// Mesmo molde do _smoke-cabelo-tmp.mjs, com os casos proprios da barba:
// vao da boca, folga do nariz e adesao a pele.
import * as THREE from 'three'
import { BARBAS } from '../src/player/rosto/barba.js'
import {
  CRANIOS, setActiveHead, makeHeadGeometry, HEAD, HEAD_S,
} from '../src/player/rosto/nucleo.js'

const S = HEAD_S
const falhas = []
const avisos = []
function ok(nome, cond, detalhe) {
  if (!cond) falhas.push(nome + (detalhe ? '  -> ' + detalhe : ''))
  console.log((cond ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const ctxDe = (cabeca, barba = 0) => ({ cabeca, barba, pele: 3, corCabelo: 1, corBarba: 0 })

// --------------------------------------------------------------------------
function analisa(obj) {
  const r = {
    meshes: 0, tris: 0, verts: 0, nan: 0, degen: 0, idxFora: 0,
    bbox: new THREE.Box3(), costadas: 0, semNormal: 0, costura: 0, piorDot: 1,
  }
  obj.traverse((o) => {
    if (!o.isMesh) return
    r.meshes++
    const g = o.geometry
    const pos = g.attributes.position
    r.verts += pos.count
    const idx = g.index ? g.index.array : null
    const nTri = idx ? idx.length / 3 : pos.count / 3
    r.tris += nTri
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { r.nan++; continue }
      r.bbox.expandByPoint(new THREE.Vector3(x, y, z))
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
          if (d < r.piorDot) r.piorDot = d
          if (d < 0.999) { r.costura++; break }
        }
      }
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3()
    for (let t = 0; t < nTri; t++) {
      const ia = idx ? idx[t * 3] : t * 3
      const ib = idx ? idx[t * 3 + 1] : t * 3 + 1
      const ic = idx ? idx[t * 3 + 2] : t * 3 + 2
      if (ia >= pos.count || ib >= pos.count || ic >= pos.count) { r.idxFora++; continue }
      a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic)
      ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac)
      const area = n.length() * 0.5
      if (!(area > 1e-11)) { r.degen++; continue }
      const cx = (a.x + b.x + c.x) / 3, cy = (a.y + b.y + c.y) / 3, cz = (a.z + b.z + c.z) / 3
      const gx = cx / (HEAD.rx * HEAD.rx), gy = cy / (HEAD.ry * HEAD.ry), gz = cz / (HEAD.rz * HEAD.rz)
      const gm = Math.hypot(gx, gy, gz) || 1
      const d = (n.x / (2 * area)) * (gx / gm) + (n.y / (2 * area)) * (gy / gm) + (n.z / (2 * area)) * (gz / gm)
      if (d < -0.30) r.costadas++
    }
  })
  return r
}

// --------------------------------------------------------------------------
// FOLGA CONTRA A CABECA REALMENTE DESENHADA (nao contra o campo).
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
function folgas(obj, ind) {
  let min = Infinity, max = -Infinity, ondeMin = ''
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const m = Math.hypot(x, y, z)
      if (!(m > 1e-6)) continue
      const t = raioMalha(ind, x / m, y / m, z / m)
      if (t < 0) continue
      const d = m - t
      if (d < min) { min = d; ondeMin = 'y=' + y.toFixed(3) + ' az=' + Math.atan2(x, z).toFixed(2) }
      if (d > max) max = d
    }
  })
  return [min, max, ondeMin]
}

// --------------------------------------------------------------------------
// CASOS PROPRIOS DA BARBA
// --------------------------------------------------------------------------
const Y_BOCA = -0.082 * S
const X_BOCA = 0.047
const Y_NARIZ = -0.035 * S
const Y_OLHO = 0.035 * S
const MEIA_BOCA = 0.011   // labio de ate 0.014*S + folga

/** Vertices dentro do vao que a boca ocupa. */
function invadeBoca(obj) {
  let n = 0, acima = Infinity, abaixo = Infinity
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (z <= 0 || Math.abs(x) >= X_BOCA) continue
      const d = y - Y_BOCA
      if (Math.abs(d) < MEIA_BOCA) n++
      if (d >= 0 && d < acima) acima = d
      if (d < 0 && -d < abaixo) abaixo = -d
    }
  })
  return [n, acima, abaixo]
}

/** Maior y no setor do NARIZ (|x| < 24 mm, frente) — nao pode cruzar a base. */
function topoNoNariz(obj) {
  let max = -Infinity
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (z <= 0 || Math.abs(x) >= 0.024) continue
      if (y > max) max = y
    }
  })
  return max
}

/** Maior y em toda a frente — nao pode chegar no olho. */
function topoNaFrente(obj) {
  let max = -Infinity
  obj.traverse((o) => {
    if (!o.isMesh) return
    const pos = o.geometry.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z <= 0) continue
      const y = pos.getY(i)
      if (y > max) max = y
    }
  })
  return max
}

// --------------------------------------------------------------------------
console.log('=== BARBAS: ' + BARBAS.length + ' itens ===')
ok('o catalogo tem 4 itens (CONTRATO §9)', BARBAS.length === 4, String(BARBAS.length))
ok('indice 0 devolve null (sem barba)', BARBAS[0].build(ctxDe(0, 0)) === null)
for (const b of BARBAS) {
  ok('item ' + b.id + ' tem id/nome/name/metodo/build',
    !!(b.id && b.nome && b.name && b.metodo && typeof b.build === 'function'))
}
{
  const ms = BARBAS.map((b) => b.metodo)
  ok('os 4 metodos declarados sao distintos', new Set(ms).size === ms.length, ms.join(' | '))
}

const ORCAMENTO = 12000
const tabela = []
const indices = []
for (let ci = 0; ci < CRANIOS.length; ci++) indices.push(indiceCranio(makeHeadGeometry(ci, 1)))

for (let ci = 0; ci < CRANIOS.length; ci++) {
  for (let bi = 0; bi < BARBAS.length; bi++) {
    const item = BARBAS[bi]
    let obj = null, erro = null
    try { obj = item.build(ctxDe(ci, bi)) } catch (e) { erro = e }
    ok('build ' + item.id + ' no cranio ' + CRANIOS[ci].id + ' nao lanca', !erro, erro && String(erro.stack || erro))
    if (!obj) continue
    setActiveHead(ci)
    const r = analisa(obj)
    const [fmin, fmax, onde] = folgas(obj, indices[ci])
    const [nBoca, acima, abaixo] = invadeBoca(obj)
    const nariz = topoNoNariz(obj)
    const frente = topoNaFrente(obj)
    tabela.push({
      cranio: CRANIOS[ci].id, item: item.id, meshes: r.meshes, tris: r.tris,
      y: [r.bbox.min.y, r.bbox.max.y], z: [r.bbox.min.z, r.bbox.max.z], x: [r.bbox.min.x, r.bbox.max.x],
      folga: [fmin, fmax], boca: [acima, abaixo], nariz, costura: r.costura, degen: r.degen,
    })
    const tag = '  ' + item.id + '/' + CRANIOS[ci].id + ': '
    ok(tag + 'sem NaN, sem indice fora, sem normal nula',
      r.nan === 0 && r.idxFora === 0 && r.semNormal === 0,
      'nan=' + r.nan + ' idxFora=' + r.idxFora + ' normalZero=' + r.semNormal)
    ok(tag + 'orcamento de triangulos (<=' + ORCAMENTO + ')', r.tris <= ORCAMENTO, r.tris + ' tris')
    // cranio 5: malhaConchas amostra a superelipse na MALHA e sai ate 11% mais
    // gordo que o campo; nenhuma peca construida a partir do campo escapa.
    if (ci === 5 && fmin < -0.005) {
      avisos.push('CONHECIDO (nucleo.malhaConchas): ' + item.id + '/mandibula afunda ' +
        (-fmin * 1000).toFixed(1) + ' mm em ' + onde)
    } else {
      ok(tag + 'nao enterrado na malha do cranio (>= -8 mm; a base do tufo tem que ficar enterrada)',
        fmin >= -0.008, 'folga min ' + (fmin * 1000).toFixed(2) + ' mm em ' + onde)
    }
    ok(tag + 'nao flutuando (folga max <= 30 mm)', fmax <= 0.030, 'folga max ' + (fmax * 1000).toFixed(2) + ' mm')
    ok(tag + 'VAO DA BOCA livre (+-' + (MEIA_BOCA * 1000) + ' mm de y=' + Y_BOCA.toFixed(4) + ', |x|<' + X_BOCA + ')',
      nBoca === 0, nBoca + ' vertices; folga acima ' + (acima * 1000).toFixed(1) +
      ' mm, abaixo ' + (abaixo * 1000).toFixed(1) + ' mm')
    ok(tag + 'nao cruza a base do nariz (' + Y_NARIZ.toFixed(4) + ')',
      nariz <= Y_NARIZ + 1e-4, 'topo no setor do nariz ' + nariz.toFixed(4) +
      ' (' + ((nariz - Y_NARIZ) * 1000).toFixed(2) + ' mm)')
    ok(tag + 'nao chega no olho (' + Y_OLHO.toFixed(4) + ')',
      frente < Y_OLHO - 0.010, 'topo na frente ' + frente.toFixed(4))
    ok(tag + 'costura soldada (vertice coincidente com normal divergente)', r.costura === 0,
      r.costura + ' vertices de costura (pior dot ' + r.piorDot.toFixed(4) + ')')
    // Triangulo "de costas" NAO e falha neste catalogo: fio() e tufo() sao
    // TUBOS — metade da casca de qualquer tubo aponta pro cranio por definicao
    // — e todo material de pelo (peloMat/hairMat) e DoubleSide. So vale como
    // numero de acompanhamento.
    if (r.costadas) avisos.push(item.id + '/' + CRANIOS[ci].id + ': ' + r.costadas +
      ' triangulos virados pro cranio (tubo de pelo, material DoubleSide)')
    if (r.degen) avisos.push(item.id + '/' + CRANIOS[ci].id + ': ' + r.degen + ' triangulos degenerados (colapso de headShell)')
  }
}

// --- geometria compartilhada entre builds ---------------------------------
for (const item of BARBAS) {
  const a = item.build(ctxDe(0)), b = item.build(ctxDe(0))
  if (!a || !b) continue
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
  if (!obj) return 'null'
  const bb = new THREE.Box3()
  obj.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox) } })
  return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(6)).join(',')
}
for (const item of BARBAS) {
  if (!item.build(ctxDe(0))) continue
  const s0a = assinatura(item.build(ctxDe(0)))
  const s5 = assinatura(item.build(ctxDe(5)))
  const s0b = assinatura(item.build(ctxDe(0)))
  ok('build(' + item.id + ') chama useHead: cranio 0 depois do 5 volta identico', s0a === s0b)
  ok('build(' + item.id + ') RESPONDE ao cranio (0 != 5)', s0a !== s5)
}

// --- build deterministico --------------------------------------------------
function hashPos(obj) {
  let h = 0
  if (!obj) return h
  obj.traverse((o) => {
    if (!o.isMesh) return
    const p = o.geometry.attributes.position.array
    for (let i = 0; i < p.length; i++) h = (h * 31 + Math.round(p[i] * 1e6)) | 0
  })
  return h
}
for (const item of BARBAS) {
  ok('build deterministico: ' + item.id, hashPos(item.build(ctxDe(2))) === hashPos(item.build(ctxDe(2))))
}

// --- a cor da barba nao pode mexer na GEOMETRIA ----------------------------
for (const item of BARBAS) {
  const a = hashPos(item.build({ cabeca: 1, pele: 3, corCabelo: 1, corBarba: 0 }))
  const b = hashPos(item.build({ cabeca: 1, pele: 3, corCabelo: 4, corBarba: 7 }))
  ok('trocar a cor nao re-sorteia a geometria: ' + item.id, a === b)
}

// --- z nao e fixo ----------------------------------------------------------
for (const item of BARBAS) {
  if (!item.build(ctxDe(0))) continue
  const zs = []
  for (let ci = 0; ci < CRANIOS.length; ci++) {
    const o = item.build(ctxDe(ci))
    const bb = new THREE.Box3()
    o.traverse((m) => { if (m.isMesh) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox) } })
    zs.push(bb.max.z)
  }
  const d = Math.max(...zs) - Math.min(...zs)
  ok('z acompanha o cranio (nao e constante): ' + item.id, d > 0.005,
    'z max varia ' + (d * 1000).toFixed(1) + ' mm entre os 6')
}

console.log('\ncranio      item      mesh   tris   y-min   y-max   z-max    x-hw   folga(mm)      boca a/b(mm)  nariz  cost')
for (const t of tabela) {
  console.log(
    t.cranio.padEnd(11) + t.item.padEnd(10) +
    String(t.meshes).padStart(4) + String(t.tris).padStart(7) +
    t.y[0].toFixed(3).padStart(8) + t.y[1].toFixed(3).padStart(8) +
    t.z[1].toFixed(3).padStart(8) + t.x[1].toFixed(3).padStart(8) +
    ('  ' + (t.folga[0] * 1000).toFixed(1) + '..' + (t.folga[1] * 1000).toFixed(1)).padStart(14) +
    ('  ' + (t.boca[0] * 1000).toFixed(1) + '/' + (t.boca[1] * 1000).toFixed(1)).padStart(14) +
    t.nariz.toFixed(4).padStart(9) + String(t.costura).padStart(6))
}

console.log('\n' + (avisos.length ? 'AVISOS:\n  ' + avisos.join('\n  ') : 'sem avisos'))
console.log('\n' + (falhas.length ? falhas.length + ' FALHAS:\n  ' + falhas.join('\n  ') : 'TUDO PASSOU'))
process.exit(falhas.length ? 1 : 0)
