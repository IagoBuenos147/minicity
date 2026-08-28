// Smoke adversarial de CAMISAS + CALCAS no boneco de verdade (character.js).
//   node tools/_smoke-roupa-tmp.mjs blusa
//   node tools/_smoke-roupa-tmp.mjs calca
//
// O teste de pele/pano e feito NO ESPACO DE CADA JUNTA, entao ele vale com o
// boneco dobrado: raio horizontal saindo do eixo do osso, comparando a ultima
// superficie que a camera veria.
import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
import { CAMISAS } from '../src/player/roupa/camisas.js'
import { CALCAS } from '../src/player/roupa/calcas.js'

const falhas = []
const avisos = []
function ok(nome, cond, det) {
  if (!cond) falhas.push(nome + (det ? '  -> ' + det : ''))
  console.log((cond ? 'OK   ' : 'FALHA') + '  ' + nome + (det ? '  -> ' + det : ''))
}

const APP0 = {
  cabeca: 0, olhos: 0, pupila: 0, nariz: 0, boca: 0, barba: 0, cabelo: 0,
  pele: 3, corCabelo: 1, sobrancelha: 0, corBarba: 0,
  chapeu: 0, calcado: 0, blusa: 0, calca: 0, colar: 0, anelAcess: 0,
  tatuagem: 0, relogio: 0,
}
const fazer = (o) => createCharacter({ appearance: Object.assign({}, APP0, o) })

const REG = {
  hips: 'tronco', torso: 'tronco', chest: 'tronco', neck: 'tronco', neckLook: 'tronco',
  head: 'cabeca', headPivot: 'cabeca', face: 'cabeca',
  armRUpper: 'bracoR', armRLower: 'bracoR', handR: 'bracoR',
  armLUpper: 'bracoL', armLLower: 'bracoL', handL: 'bracoL',
  legRUpper: 'pernaR', legRLower: 'pernaR', footR: 'peR',
  legLUpper: 'pernaL', legLLower: 'pernaL', footL: 'peL',
}
function regiao(o) {
  let p = o
  while (p) { if (REG[p.name]) return REG[p.name]; p = p.parent }
  return null
}

/** Quadros de teste: junta, faixa de y LOCAL e a regiao "de casa". */
const QUADROS = [
  { junta: 'torso', y: [-0.060, 0.560], reg: 'tronco' },
  { junta: 'armRUpper', y: [-0.300, 0.050], reg: 'bracoR' },
  { junta: 'armRLower', y: [-0.280, 0.030], reg: 'bracoR' },
  { junta: 'armLUpper', y: [-0.300, 0.050], reg: 'bracoL' },
  { junta: 'armLLower', y: [-0.280, 0.030], reg: 'bracoL' },
  { junta: 'legRUpper', y: [-0.400, 0.060], reg: 'pernaR' },
  { junta: 'legRLower', y: [-0.400, 0.040], reg: 'pernaR' },
  { junta: 'legLUpper', y: [-0.400, 0.060], reg: 'pernaL' },
  { junta: 'legLLower', y: [-0.400, 0.040], reg: 'pernaL' },
]

/** Triangulos no espaco de `mInv`, separados por regiao. */
function triangulos(malhas, mInv) {
  const out = {}
  const v = new THREE.Vector3()
  for (const m of malhas) {
    const r = regiao(m)
    if (!r) continue
    const lista = out[r] || (out[r] = [])
    const g = m.geometry
    const pos = g.attributes.position
    const idx = g.index ? g.index.array : null
    const n = idx ? idx.length / 3 : pos.count / 3
    const P = []
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); m.localToWorld(v); v.applyMatrix4(mInv)
      P.push(v.x, v.y, v.z)
    }
    for (let t = 0; t < n; t++) {
      const a = (idx ? idx[t * 3] : t * 3) * 3
      const b = (idx ? idx[t * 3 + 1] : t * 3 + 1) * 3
      const c = (idx ? idx[t * 3 + 2] : t * 3 + 2) * 3
      const T = [P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]
      T.push(Math.min(T[1], T[4], T[7]), Math.max(T[1], T[4], T[7]))
      lista.push(T)
    }
  }
  return out
}

/** t maximo de um raio horizontal (0,y,0)+(dx,0,dz). -1 se nao acerta nada. */
function raioMax(lista, y, dx, dz) {
  let melhor = -1
  for (let q = 0; q < lista.length; q++) {
    const T = lista[q]
    if (y < T[9] || y > T[10]) continue
    const e1x = T[3] - T[0], e1y = T[4] - T[1], e1z = T[5] - T[2]
    const e2x = T[6] - T[0], e2y = T[7] - T[1], e2z = T[8] - T[2]
    const px = -dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y
    const det = e1x * px + e1y * py + e1z * pz
    if (det > -1e-14 && det < 1e-14) continue
    const inv = 1 / det
    const tx = -T[0], ty = y - T[1], tz = -T[2]
    const u = (tx * px + ty * py + tz * pz) * inv
    if (u < -1e-7 || u > 1 + 1e-7) continue
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x
    const vv = (dx * qx + dz * qz) * inv
    if (vv < -1e-7 || u + vv > 1 + 1e-7) continue
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv
    if (t > 1e-6 && t > melhor) melhor = t
  }
  return melhor
}

function analisa(malhas) {
  const r = { meshes: 0, tris: 0, nan: 0, degen: 0, idxFora: 0, semNormal: 0, costura: 0 }
  for (const o of malhas) {
    r.meshes++
    const g = o.geometry
    const pos = g.attributes.position
    const idx = g.index ? g.index.array : null
    const n = idx ? idx.length / 3 : pos.count / 3
    r.tris += n
    for (let i = 0; i < pos.count; i++) {
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(pos.getY(i)) || !Number.isFinite(pos.getZ(i))) r.nan++
    }
    const nor = g.attributes.normal
    if (nor) {
      for (let i = 0; i < nor.count; i++) {
        const m = Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i))
        if (!(m > 0.5)) r.semNormal++
      }
      // COSTURA DE REVOLUCAO x QUINA LEGITIMA. Os dois casos sao "mesma posicao,
      // normais diferentes": a quina da tampa de um cilindro (uma normal olha
      // pro eixo) e a quina de uma caixa (as duas sao perpendiculares) sao
      // legitimas. A emenda de lathe que acende como listra tem as duas normais
      // RADIAIS e quase paralelas — e so ela que conta aqui.
      const mapa = new Map()
      for (let i = 0; i < pos.count; i++) {
        const k = pos.getX(i) + '|' + pos.getY(i) + '|' + pos.getZ(i)
        const l = mapa.get(k); if (l) l.push(i); else mapa.set(k, [i])
      }
      for (const lista of mapa.values()) {
        if (lista.length < 2) continue
        const a = lista[0]
        if (Math.abs(nor.getY(a)) > 0.7) continue
        for (let q = 1; q < lista.length; q++) {
          const b = lista[q]
          if (Math.abs(nor.getY(b)) > 0.7) continue
          const d = nor.getX(a) * nor.getX(b) + nor.getY(a) * nor.getY(b) + nor.getZ(a) * nor.getZ(b)
          if (d < 0.999 && d > 0.2) { r.costura++; break }
        }
      }
    }
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3()
    for (let t = 0; t < n; t++) {
      const ia = idx ? idx[t * 3] : t * 3, ib = idx ? idx[t * 3 + 1] : t * 3 + 1, ic = idx ? idx[t * 3 + 2] : t * 3 + 2
      if (ia >= pos.count || ib >= pos.count || ic >= pos.count) { r.idxFora++; continue }
      A.fromBufferAttribute(pos, ia); B.fromBufferAttribute(pos, ib); C.fromBufferAttribute(pos, ic)
      B.sub(A); C.sub(A); A.crossVectors(B, C)
      if (!(A.length() * 0.5 > 1e-12)) r.degen++
    }
  }
  return r
}

function malhasDe(ch, kind) {
  const out = []
  for (const o of ch.pecasDe(kind)) o.traverse((x) => { if (x.isMesh) out.push(x) })
  return out
}
const SLOTS = ['blusa', 'calca', 'calcado', 'chapeu', 'colar', 'anelAcess', 'tatuagem', 'relogio']
function peleVisivel(ch) {
  const roupa = new Set()
  for (const k of SLOTS) for (const m of malhasDe(ch, k)) roupa.add(m)
  const out = []
  ch.root.traverse((x) => { if (x.isMesh && x.visible && !roupa.has(x)) out.push(x) })
  return out
}
function tudo(t) {
  const out = []
  for (const k in t) for (const T of t[k]) out.push(T)
  return out
}

const POSES = {
  parado: {},
  passada: {
    legRUpper: 0.62, legRLower: -0.85, legLUpper: -0.45, legLLower: -0.15,
    armRUpper: -0.55, armRLower: -0.80, armLUpper: 0.50, armLLower: -0.35,
  },
  agachado: {
    legRUpper: 1.25, legRLower: -1.80, legLUpper: 1.25, legLLower: -1.80,
    armRUpper: -1.60, armRLower: -1.10, armLUpper: -1.60, armLLower: -1.10,
  },
}
function pose(ch, p) {
  for (const k in REG) if (ch.parts[k]) ch.parts[k].rotation.set(0, 0, 0)
  for (const k in p) ch.parts[k].rotation.x = p[k]
  ch.root.updateMatrixWorld(true)
}

/**
 * Pele x pano, raio a raio, no espaco de cada junta.
 *
 * Pele por fora do pano so conta quando (a) existe pano DAQUELE osso no mesmo
 * raio — pano do osso vizinho tapa por outro caminho — e (b) essa pele e a
 * ULTIMA superficie do raio: se ha pano mais pra fora (o peito cobrindo o topo
 * do ombro), a camera nao ve pele nenhuma ali.
 */
function varre(ch, kind, nuTri) {
  const roupaM = malhasDe(ch, kind).filter((m) => m.visible)
  const peleM = peleVisivel(ch)
  const res = { fura: 0, piorFura: 0, ondeFura: '', buraco: 0, ondeBuraco: '', dentro: 0, ondeDentro: '' }
  const NA = 20
  const NY = 44
  const inv = new THREE.Matrix4()
  for (const Q of QUADROS) {
    inv.copy(ch.parts[Q.junta].matrixWorld).invert()
    const roupaR = triangulos(roupaM, inv)
    const peleR = triangulos(peleM, inv)
    const nuR = triangulos(nuTri, inv)
    const roupa = tudo(roupaR), pele = tudo(peleR), nu = tudo(nuR)
    const rl = roupaR[Q.reg] || [], pl = peleR[Q.reg] || []
    const [y0, y1] = Q.y
    for (let iy = 0; iy <= NY; iy++) {
      const y = y0 + (y1 - y0) * (iy / NY)
      for (let ia = 0; ia < NA; ia++) {
        const a = (ia / NA) * Math.PI * 2
        const dx = Math.sin(a), dz = Math.cos(a)
        if (raioMax(nu, y, dx, dz) < 0) continue
        const rp = raioMax(pele, y, dx, dz)
        const rr = raioMax(roupa, y, dx, dz)
        const rpL = raioMax(pl, y, dx, dz)
        const rrL = raioMax(rl, y, dx, dz)
        if (rrL > 0 && rpL > rrL && rpL - rrL < 0.025 && rpL - rrL > res.dentro) {
          res.dentro = rpL - rrL
          res.ondeDentro = Q.junta + ' y=' + y.toFixed(3) + ' az=' + a.toFixed(2) +
            ' pele=' + rpL.toFixed(4) + ' pano=' + rrL.toFixed(4)
        }
        if (rr < 0 && rp < 0) {
          res.buraco++
          if (!res.ondeBuraco) res.ondeBuraco = Q.junta + ' y=' + y.toFixed(3) + ' az=' + a.toFixed(2)
        } else if (rrL > 0 && rpL > rrL + 0.0005 && rpL - rrL < 0.025 && rpL > rr - 0.0005 && rpL > rp - 0.0005) {
          const d = rpL - rrL
          res.fura++
          if (d > res.piorFura) {
            res.piorFura = d
            res.ondeFura = Q.junta + ' y=' + y.toFixed(3) + ' az=' + a.toFixed(2) +
              ' pele=' + rpL.toFixed(4) + ' pano=' + rrL.toFixed(4)
          }
        }
      }
    }
  }
  return res
}

// ---------------------------------------------------------------------------
const VALIDOS = ['torso', 'peito', 'braco', 'antebraco', 'coxa', 'canela', 'pe']
const alvo = process.argv[2] === 'calca' ? 'calca' : 'blusa'
const CAT = alvo === 'calca' ? CALCAS : CAMISAS
console.log('=== ' + alvo + ': ' + CAT.length + ' itens ===')

for (const it of CAT) {
  ok('item ' + it.id + ' tem id/nome/metodo/build',
    !!(it.id && it.nome && it.metodo && typeof it.build === 'function'))
  if (it.esconde) {
    ok('  esconde valido: ' + it.id, it.esconde.every((k) => VALIDOS.includes(k)), String(it.esconde))
  }
}
const metodos = CAT.map((i) => i.metodo)
ok('metodo declarado diferente em cada item', new Set(metodos).size === metodos.length)

const nuCh = fazer({})

const tab = []
for (let i = 0; i < CAT.length; i++) {
  const it = CAT[i]
  let ch = null, erro = null
  try { ch = fazer({ [alvo]: i }) } catch (e) { erro = e }
  ok('build ' + it.id + ' nao lanca', !erro, erro && String(erro.stack || erro))
  if (!ch) continue
  ch.root.updateMatrixWorld(true)
  const malhas = malhasDe(ch, alvo)
  const r = analisa(malhas)
  const bb = new THREE.Box3()
  const v = new THREE.Vector3()
  for (const m of malhas) {
    const pos = m.geometry.attributes.position
    for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k); m.localToWorld(v); bb.expandByPoint(v) }
  }
  const tag = '  ' + it.id + ': '
  ok(tag + 'sem NaN / indice fora', r.nan === 0 && r.idxFora === 0, 'nan=' + r.nan + ' idxFora=' + r.idxFora)
  if (r.semNormal) avisos.push(it.id + ': ' + r.semNormal + ' normais nulas (polo de N.bloco, do nucleo)')
  ok(tag + 'orcamento 6000 tris', r.tris <= 6000, r.tris + ' tris em ' + r.meshes + ' meshes')
  ok(tag + 'costura de revolucao soldada', r.costura === 0, r.costura + ' vertices de costura')
  if (r.degen) avisos.push(it.id + ': ' + r.degen + ' triangulos degenerados')

  for (const nome in POSES) {
    pose(nuCh, POSES[nome])
    pose(ch, POSES[nome])
    const nuTri = peleVisivel(nuCh)
    const s = malhas.length ? varre(ch, alvo, nuTri) : { fura: 0, buraco: 0, piorFura: 0, ondeFura: '', ondeBuraco: '', dentro: 0, ondeDentro: '' }
    if (s.dentro > 0) console.log('info ' + tag + '[' + nome + '] pano por dentro da pele: ' +
      (s.dentro * 1000).toFixed(2) + ' mm em ' + s.ondeDentro)
    ok(tag + '[' + nome + '] pele nao atravessa o pano', s.fura === 0,
      s.fura + ' raios, pior ' + (s.piorFura * 1000).toFixed(2) + ' mm em ' + s.ondeFura)
    ok(tag + '[' + nome + '] sem buraco (nem pele nem pano onde o nu tinha corpo)', s.buraco === 0,
      s.buraco + ' raios, ex: ' + s.ondeBuraco)
  }
  pose(ch, {})

  const ch2 = fazer({ [alvo]: i })
  const g1 = new Set(malhas.map((m) => m.geometry))
  const compart = malhasDe(ch2, alvo).filter((m) => g1.has(m.geometry))
  ok(tag + 'geometria NOVA a cada build', compart.length === 0,
    compart.length + ' geometrias compartilhadas entre dois bonecos')
  const a1 = new Set(malhas.map((m) => m.geometry.attributes.position))
  ok(tag + 'atributo de posicao novo a cada build',
    !malhasDe(ch2, alvo).some((m) => a1.has(m.geometry.attributes.position)))
  ch2.dispose()
  let erroDispose = null
  try { ch.dispose() } catch (e) { erroDispose = e }
  ok(tag + 'dispose nao lanca', !erroDispose, erroDispose && String(erroDispose))

  tab.push({ id: it.id, meshes: r.meshes, tris: r.tris, y: [bb.min.y, bb.max.y] })
}

console.log('\nitem         meshes   tris    y-min    y-max   (mundo, pes em y=0)')
for (const t of tab) {
  console.log(t.id.padEnd(13) + String(t.meshes).padStart(5) + String(t.tris).padStart(8) +
    (isFinite(t.y[0]) ? t.y[0].toFixed(3) : '-').padStart(9) +
    (isFinite(t.y[1]) ? t.y[1].toFixed(3) : '-').padStart(9))
}
console.log('\n' + (avisos.length ? 'AVISOS:\n  ' + avisos.join('\n  ') : 'sem avisos'))
console.log('\n' + (falhas.length ? falhas.length + ' FALHAS:\n  ' + falhas.join('\n  ') : 'TUDO PASSOU'))
process.exit(falhas.length ? 1 : 0)
