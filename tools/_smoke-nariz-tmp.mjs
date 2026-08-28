// Smoke adversarial do NARIZ: 4 itens x 6 cranios.
//   node tools/_smoke-nariz-tmp.mjs
//
// Alem do basico (CONTRATO, orcamento, useHead, geometria nova), este arquivo
// mede as tres coisas que so aparecem no jogo: se a peca FECHA (ou se a borda
// aberta dela esta enterrada na MALHA da cabeca, e nao so atras da superficie
// analitica), se sobrou COSTURA (vertice co-posicionado com normal divergente)
// e se o nariz realmente APARECE (silhueta de perfil + narina visivel), com um
// rasterizador ortografico proprio — sem GPU.
import * as THREE from 'three'
import { solid } from '../src/world/materials.js'
import { NARIZES } from '../src/player/rosto/nariz.js'
import {
  CRANIOS, setActiveHead, HEAD_S, EYE_ANCHOR, faceSpread,
  makeHeadGeometry, skinOf, shade,
} from '../src/player/rosto/nucleo.js'

const S = HEAD_S
const falhas = []
function ok(nome, cond, detalhe) {
  if (!cond) falhas.push(nome + (detalhe ? '  -> ' + detalhe : ''))
  console.log((cond ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}
const ctxDe = (cabeca) => ({ cabeca, pele: 0, corCabelo: 1, corBarba: 0, nariz: 0 })
const MAT_NARINA = solid(shade(skinOf({ pele: 0 }), 0.34), 0.95, 0.0)
const ORCAMENTO = 12000

function mundo(m) {
  m.updateMatrixWorld(true)
  const g = m.geometry, p = g.attributes.position
  const idx = g.index ? g.index.array : null
  const n = idx ? idx.length : p.count
  const out = new Float32Array(n * 3), v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, idx ? idx[i] : i).applyMatrix4(m.matrixWorld)
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z
  }
  return out
}
function caixa(o) {
  const bb = new THREE.Box3(); o.updateMatrixWorld(true)
  o.traverse((m) => {
    if (!m.isMesh) return
    const t = mundo(m)
    for (let i = 0; i < t.length; i += 3) bb.expandByPoint(new THREE.Vector3(t[i], t[i + 1], t[i + 2]))
  })
  return bb
}

// ------------------------------------------------------------ 1. catalogo
console.log('=== NARIZES: ' + NARIZES.length + ' itens ===')
ok('o catalogo tem 4 itens (CONTRATO 9)', NARIZES.length === 4, String(NARIZES.length))
ok('indice 0 devolve null', NARIZES[0].build(ctxDe(0)) === null)
for (const b of NARIZES) {
  ok('item ' + b.id + ' tem id/nome/name/metodo/build',
    !!(b.id && b.nome && b.name && b.metodo && typeof b.build === 'function'))
}
{
  const ids = NARIZES.map((n) => n.id)
  ok('ids unicos', new Set(ids).size === ids.length, ids.join(','))
  ok('metodos declarados distintos', new Set(NARIZES.map((n) => n.metodo)).size === NARIZES.length)
  const tipos = NARIZES.slice(1).map((it) => {
    const o = it.build(ctxDe(0)); const t = []
    o.traverse((m) => m.isMesh && t.push(m.geometry.type))
    return t.sort().join('+')
  })
  ok('cada item usa uma CONSTRUCAO diferente, nao o mesmo metodo parametrizado',
    new Set(tipos).size === 3, tipos.join('  |  '))
}

// ------------------------------------------- 2. os 6 cranios, peca por peca
const tabela = []
for (let ci = 0; ci < CRANIOS.length; ci++) {
  for (const item of NARIZES.slice(1)) {
    let obj = null, erro = null
    try { obj = item.build(ctxDe(ci)) } catch (e) { erro = e }
    ok('build ' + item.id + '/' + CRANIOS[ci].id + ' nao lanca', !erro, erro && String(erro.stack || erro))
    if (!obj) continue
    setActiveHead(ci)
    obj.updateMatrixWorld(true)
    const tag = '  ' + item.id + '/' + CRANIOS[ci].id
    const bb = new THREE.Box3()
    let tris = 0, nan = 0, degen = 0, semNormal = 0, meshes = 0, costura = 0, piorAng = 0
    const bordas = new Map(), pontos = new Map()
    const q = 1e5
    const kOf = (x, y, z) => Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q)
    obj.traverse((m) => {
      if (!m.isMesh) return
      meshes++
      const g = m.geometry, p = g.attributes.position, nor = g.attributes.normal
      const idx = g.index ? g.index.array : null
      const nT = idx ? idx.length / 3 : p.count / 3
      tris += nT
      const v = new THREE.Vector3(), ks = []
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld)
        if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) { nan++; ks.push(null); continue }
        bb.expandByPoint(v)
        const k = kOf(v.x, v.y, v.z); ks.push(k)
        if (!pontos.has(k)) pontos.set(k, v.clone())
      }
      if (nor) {
        for (let i = 0; i < nor.count; i++) {
          if (!(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) > 0.5)) semNormal++
        }
      }
      // COSTURA: mesma posicao, normal divergente. Nao vale pra flatShading (o
      // shader ignora a normal do vertice) nem pra caixa, onde a aresta viva e
      // o desenho.
      if (nor && !m.material.flatShading && g.type !== 'BoxGeometry') {
        const mapa = new Map()
        for (let i = 0; i < p.count; i++) {
          const k = kOf(p.getX(i), p.getY(i), p.getZ(i))
          if (!mapa.has(k)) mapa.set(k, [])
          mapa.get(k).push(i)
        }
        for (const l of mapa.values()) {
          for (let a = 1; a < l.length; a++) {
            const d = nor.getX(l[0]) * nor.getX(l[a]) + nor.getY(l[0]) * nor.getY(l[a]) + nor.getZ(l[0]) * nor.getZ(l[a])
            const ang = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI
            if (ang > 1) { costura++; if (ang > piorAng) piorAng = ang }
          }
        }
      }
      const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
      const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3()
      for (let t = 0; t < nT; t++) {
        const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2
        A.fromBufferAttribute(p, ia); B.fromBufferAttribute(p, ib); C.fromBufferAttribute(p, ic)
        ab.subVectors(B, A); ac.subVectors(C, A); cr.crossVectors(ab, ac)
        if (!(cr.length() * 0.5 > 1e-11)) degen++
        for (const [x, y] of [[ia, ib], [ib, ic], [ic, ia]]) {
          if (!ks[x] || !ks[y]) continue
          const k = ks[x] < ks[y] ? ks[x] + '/' + ks[y] : ks[y] + '/' + ks[x]
          bordas.set(k, (bordas.get(k) || 0) + 1)
        }
      }
    })
    ok(tag + ': sem NaN e sem normal nula', nan === 0 && semNormal === 0, 'nan=' + nan + ' n0=' + semNormal)
    ok(tag + ': sem triangulo degenerado', degen === 0, 'degen=' + degen)
    ok(tag + ': orcamento de triangulos', tris <= ORCAMENTO, tris + ' tris')
    ok(tag + ': sem costura de revolucao (CONTRATO 4 / 8.5)', costura === 0,
      costura + ' pares co-posicionados, pior ' + piorAng.toFixed(1) + ' graus')
    ok(tag + ': caixa na faixa do rosto (sobrancelha 0.128 .. boca -0.109)',
      bb.max.y <= 0.096 * S + 0.020 && bb.min.y >= -0.082 * S - 0.020,
      'y ' + bb.min.y.toFixed(3) + '..' + bb.max.y.toFixed(3))
    const xm = Math.max(Math.abs(bb.min.x), bb.max.x)
    ok(tag + ': nao chega ao centro do olho (' + (EYE_ANCHOR.x * faceSpread()).toFixed(3) + ')',
      xm < EYE_ANCHOR.x * faceSpread() - 0.008, '|x| ' + xm.toFixed(4))
    // BORDA ABERTA: ou a peca fecha, ou o que sobra tem que estar dentro da
    // MALHA da cabeca. Estar atras da superficie analitica nao basta: a corda
    // da malha afunda ate 2.8 mm pra dentro dela.
    const gc = makeHeadGeometry(ci, 1); setActiveHead(ci)
    const cab = new THREE.Mesh(gc, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    cab.updateMatrixWorld(true)
    // So a PELE do nariz precisa fechar contra o cranio. A narina do metodo B e
    // um decalque que mora em cima do retalho, entao a borda dela e por
    // definicao exposta — cobrar enterro nela seria cobrar que ela suma.
    const daNarina = new Set()
    obj.traverse((m) => {
      if (!m.isMesh || m.material !== MAT_NARINA) return
      const t = mundo(m)
      for (let i = 0; i < t.length; i += 3) daNarina.add(kOf(t[i], t[i + 1], t[i + 2]))
    })
    const rc = new THREE.Raycaster(); rc.far = 2
    let abertas = 0, expostos = 0, enterroMin = Infinity
    const vistos = new Set()
    for (const [k, c] of bordas) {
      if (c !== 1) continue
      abertas++
      for (const kk of k.split('/')) {
        if (vistos.has(kk) || daNarina.has(kk)) continue
        vistos.add(kk)
        const pt = pontos.get(kk)
        const dir = new THREE.Vector3(pt.x, pt.y * 0.6, pt.z).normalize()
        rc.set(pt.clone().addScaledVector(dir, 1e-5), dir)
        const h = rc.intersectObject(cab, false)
        if (!h.length) expostos++
        else if (h[0].distance < enterroMin) enterroMin = h[0].distance
      }
    }
    ok(tag + ': borda aberta enterrada na malha da cabeca', expostos === 0,
      abertas + ' arestas abertas, ' + expostos + ' vertices expostos'
      + (enterroMin === Infinity ? '' : ', enterro min ' + (enterroMin * 1000).toFixed(2) + ' mm'))
    gc.dispose()
    tabela.push({ cranio: CRANIOS[ci].id, item: item.id, meshes, tris, bb, abertas })
  }
}

// --------------------------------------- 3. dispose / useHead / z vivo / ctx
for (const item of NARIZES.slice(1)) {
  const a = item.build(ctxDe(0)), b = item.build(ctxDe(0))
  const ga = [], gb = []
  a.traverse((o) => o.isMesh && ga.push(o.geometry))
  b.traverse((o) => o.isMesh && gb.push(o.geometry))
  const pa = ga.map((g) => g.attributes.position), pb = gb.map((g) => g.attributes.position)
  ok('geometria NOVA a cada build: ' + item.id,
    ga.length > 0 && !ga.some((g) => gb.includes(g)) && !pa.some((x) => pb.includes(x)),
    ga.length + ' geos')
  a.traverse((o) => o.isMesh && o.geometry.dispose())
  ok('dispose no build #1 nao afeta o #2: ' + item.id, gb.every((g) => !!g.attributes.position))
  let owned = false
  b.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.owned) owned = true })
  ok('material do cache global nao e marcado owned: ' + item.id, !owned)
}
for (const item of NARIZES.slice(1)) {
  const s = (ci) => {
    const bb = caixa(item.build(ctxDe(ci)))
    return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(6)).join(',')
  }
  const s0a = s(0), s5 = s(5), s0b = s(0)
  ok('useHead(ctx) na primeira linha: cranio 0 depois do 5 volta identico (' + item.id + ')', s0a === s0b)
  ok('responde ao cranio (0 != 5): ' + item.id, s0a !== s5)
  const zs = []
  for (let ci = 0; ci < CRANIOS.length; ci++) zs.push(caixa(item.build(ctxDe(ci))).max.z)
  const d = Math.max(...zs) - Math.min(...zs)
  ok('z sai de surfaceZ, nao e constante: ' + item.id, d > 0.005, 'z max varia ' + (d * 1000).toFixed(1) + ' mm')
  let e = null
  try { item.build({}); item.build({ cabeca: 7 }); item.build({ cabeca: -3, skin: 0xf7c6a4 }) } catch (x) { e = x }
  ok('ctx vazio / cabeca fora de 0..5 / skin como cor crua nao lancam: ' + item.id, !e, e && String(e))
}

// ----------------------- 4. o nariz APARECE? (rasterizador ortografico proprio)
const N = 400, EXT = 0.30, CENTRO = new THREE.Vector3(0, 0, 0.02)
function mascara(listas, dir) {
  const up = new THREE.Vector3(0, 1, 0)
  const e1 = new THREE.Vector3().crossVectors(up, dir)
  if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0)
  e1.normalize()
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize()
  const buf = new Uint8Array(N * N)
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const pr = (p) => {
    v.subVectors(p, CENTRO)
    return [((v.dot(e1) / EXT) * 0.5 + 0.5) * (N - 1), ((v.dot(e2) / EXT) * 0.5 + 0.5) * (N - 1)]
  }
  for (const t of listas) {
    for (let k = 0; k < t.length; k += 9) {
      a.set(t[k], t[k + 1], t[k + 2]); b.set(t[k + 3], t[k + 4], t[k + 5]); c.set(t[k + 6], t[k + 7], t[k + 8])
      const A = pr(a), B = pr(b), C = pr(c)
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(A[0], B[0], C[0])))
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(A[1], B[1], C[1])))
      const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
      if (Math.abs(den) < 1e-12) continue
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den
          const w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den
          if (w0 < 0 || w1 < 0 || 1 - w0 - w1 < 0) continue
          buf[y * N + x] = 1
        }
      }
    }
  }
  return buf
}
/** Z-buffer ortografico: devolve quantos pixels cada id GANHOU (o que se ve). */
function zbuffer(pecas, dir, ext, centro) {
  const up = new THREE.Vector3(0, 1, 0)
  const e1 = new THREE.Vector3().crossVectors(up, dir)
  if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0)
  e1.normalize()
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize()
  const depth = new Float32Array(N * N).fill(Infinity)
  const ids = new Int16Array(N * N).fill(-1)
  const v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const pr = (p) => {
    v.subVectors(p, centro)
    return [((v.dot(e1) / ext) * 0.5 + 0.5) * (N - 1), ((v.dot(e2) / ext) * 0.5 + 0.5) * (N - 1), v.dot(dir)]
  }
  for (const peca of pecas) {
    const t = peca.tris
    for (let k = 0; k < t.length; k += 9) {
      a.set(t[k], t[k + 1], t[k + 2]); b.set(t[k + 3], t[k + 4], t[k + 5]); c.set(t[k + 6], t[k + 7], t[k + 8])
      const A = pr(a), B = pr(b), C = pr(c)
      const x0 = Math.max(0, Math.floor(Math.min(A[0], B[0], C[0]))), x1 = Math.min(N - 1, Math.ceil(Math.max(A[0], B[0], C[0])))
      const y0 = Math.max(0, Math.floor(Math.min(A[1], B[1], C[1]))), y1 = Math.min(N - 1, Math.ceil(Math.max(A[1], B[1], C[1])))
      const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
      if (Math.abs(den) < 1e-12) continue
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const w0 = ((B[1] - C[1]) * (x - C[0]) + (C[0] - B[0]) * (y - C[1])) / den
          const w1 = ((C[1] - A[1]) * (x - C[0]) + (A[0] - C[0]) * (y - C[1])) / den
          const w2 = 1 - w0 - w1
          if (w0 < 0 || w1 < 0 || w2 < 0) continue
          const z = w0 * A[2] + w1 * B[2] + w2 * C[2]
          const i = y * N + x
          if (z < depth[i]) { depth[i] = z; ids[i] = peca.id }
        }
      }
    }
  }
  const conta = [0, 0, 0]
  for (let i = 0; i < ids.length; i++) if (ids[i] >= 0) conta[ids[i]]++
  return conta
}

const px = ((EXT * 2 / N) * 1000) ** 2
const pxN = ((0.08 * 2 / N) * 1000) ** 2
const sil = []
for (let ci = 0; ci < CRANIOS.length; ci++) {
  for (const item of NARIZES.slice(1)) {
    const o = item.build(ctxDe(ci)); setActiveHead(ci)
    const gc = makeHeadGeometry(ci, 1); setActiveHead(ci)
    const cab = mundo(new THREE.Mesh(gc))
    const pele = [], nar = []
    o.traverse((m) => { if (m.isMesh) (m.material === MAT_NARINA ? nar : pele).push(mundo(m)) })
    const so = mascara([cab], new THREE.Vector3(-1, 0, 0))
    const com = mascara([cab, ...pele], new THREE.Vector3(-1, 0, 0))
    let g = 0
    for (let i = 0; i < so.length; i++) if (com[i] && !so[i]) g++
    // A narina esta DENTRO do contorno do nariz, entao ela nao muda silhueta
    // nenhuma: quem responde "aparece?" e o z-buffer, nao a uniao de mascaras.
    const dB = new THREE.Vector3(0, 0.62, -0.78).normalize()
    const cont = zbuffer([
      { tris: cab, id: 0 }, ...pele.map((t) => ({ tris: t, id: 1 })), ...nar.map((t) => ({ tris: t, id: 2 })),
    ], dB, 0.08, new THREE.Vector3(0, -0.045, 0.16))
    const gn = cont[2] * pxN
    sil.push({ cranio: CRANIOS[ci].id, item: item.id, perfil: g * px, narina: gn })
    ok('  ' + item.id + '/' + CRANIOS[ci].id + ': o nariz muda a silhueta de perfil (> 800 mm2)',
      g * px > 800, (g * px).toFixed(0) + ' mm2')
    ok('  ' + item.id + '/' + CRANIOS[ci].id + ': a narina aparece de baixo (> 20 mm2)',
      gn * px > 20, (gn * px).toFixed(0) + ' mm2')
    gc.dispose()
  }
}

// ------------------------------------------------------------------- tabela
console.log('\ncranio      item    mesh   tris   y-min   y-max   z-min   z-max    |x|   borda  silhueta  narina')
for (const t of tabela) {
  const s = sil.find((x) => x.cranio === t.cranio && x.item === t.item)
  console.log(t.cranio.padEnd(11) + t.item.padEnd(8)
    + String(t.meshes).padStart(3) + String(t.tris).padStart(7)
    + t.bb.min.y.toFixed(3).padStart(8) + t.bb.max.y.toFixed(3).padStart(8)
    + t.bb.min.z.toFixed(3).padStart(8) + t.bb.max.z.toFixed(3).padStart(8)
    + Math.max(Math.abs(t.bb.min.x), t.bb.max.x).toFixed(3).padStart(8)
    + String(t.abertas).padStart(7)
    + s.perfil.toFixed(0).padStart(10) + s.narina.toFixed(0).padStart(8))
}
console.log('(silhueta = mm2 de nariz fora do contorno da cabeca, de perfil; narina = mm2 vistos de baixo)')
console.log('\n' + (falhas.length ? falhas.length + ' FALHAS:\n  ' + falhas.join('\n  ') : 'TUDO PASSOU'))
process.exit(falhas.length ? 1 : 0)
