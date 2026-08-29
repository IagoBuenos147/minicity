// Caca a malha VIRADA DO AVESSO — a que tem os triangulos na ordem que joga a
// normal pra dentro.
//
// Este teste existe porque o defeito nao aparece como buraco nem como erro no
// console: a peca fica CINZA E CHAPADA, porque a luz passa a bater no avesso
// dela. Numa cabeca inteira e obvio (dois dos seis cranios sairam pretos na
// primeira folha de contato); num dedo, num anel ou numa sola, ninguem nota. E a
// causa — a ordem dos tres indices de um triangulo — e invisivel lendo o codigo.
//
// O CRITERIO E O VOLUME ASSINADO, pelo teorema da divergencia: a soma de
// dot(v0, cross(v1, v2)) / 6 sobre os triangulos. Numa casca FECHADA com a
// normal pra fora isso da o volume, positivo; virada do avesso, da o mesmo
// numero negativo. Nao depende de a peca ser convexa, o que a media de normais
// dependia — foi ela que acusou as duas maos (que sao muito concavas) sem elas
// terem defeito nenhum.
//
// SO VALE EM MALHA FECHADA, e por isso o teste comeca conferindo isso: numa
// superficie ABERTA o volume assinado depende de onde esta a origem e nao quer
// dizer nada. Foi um falso positivo de verdade — a boca da calca jeans e um
// anel aberto de 3.4 cm com a face virada PRA DENTRO DE PROPOSITO (e o avesso
// do pano, que so se ve por baixo da barra), e o teste a acusava.
//
// Fechada = toda aresta usada por exatamente DOIS triangulos. Malha aberta
// (cartao de cabelo, decalque de tatuagem, calota de olho, casca de camisa) sai
// da conta em silencio.
//
// Material DoubleSide tambem sai: com as duas faces desenhadas, a ordem dos
// indices nao muda nada do que se ve.
//
//   node tools/teste-normais.mjs
import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
import * as A from '../src/player/appearance.js'
import * as R from '../src/player/roupas.js'

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
const cru = new THREE.Vector3()
const tam = new THREE.Vector3()
const ruins = []
const vistos = new Set()
let malhas = 0
let abertas = 0
let ignoradas = 0

/**
 * A malha e fechada? Toda aresta tem que aparecer em exatamente dois
 * triangulos. Fica em O(n) com um mapa de "menor indice|maior indice".
 */
function fechada(g) {
  const idx = g.index
  if (!idx) return false            // sem indice nao ha aresta compartilhada
  const conta = new Map()
  const n = idx.count
  if (n < 12) return false
  for (let i = 0; i < n; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2)
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = p < q ? p + '|' + q : q + '|' + p
      conta.set(k, (conta.get(k) || 0) + 1)
    }
  }
  for (const v of conta.values()) if (v !== 2) return false
  return true
}

function volumeAssinado(g) {
  const pos = g.attributes.position
  const idx = g.index
  const n = idx ? idx.count : pos.count
  let v = 0
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i
    const i1 = idx ? idx.getX(i + 1) : i + 1
    const i2 = idx ? idx.getX(i + 2) : i + 2
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    cru.crossVectors(b, c)
    v += a.dot(cru)
  }
  return v / 6
}

function pos0(g) { return g.attributes.position.count / 3 }

function varrer(raiz, rotulo) {
  raiz.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return
    const g = o.geometry
    if (vistos.has(g.uuid)) return
    vistos.add(g.uuid)
    malhas++
    // DoubleSide desenha os dois lados: a ordem dos indices nao muda nada
    const mat = o.material
    if (mat && !Array.isArray(mat) && mat.side !== undefined && mat.side !== 0) { ignoradas++; return }
    if (!fechada(g)) { abertas++; return }
    if (!g.boundingBox) g.computeBoundingBox()
    g.boundingBox.getSize(tam)
    // Referencia de escala: o volume da caixa da peca. Casca aberta da um
    // volume assinado desprezivel perto disso e nao entra na conta.
    const caixa = Math.max(1e-9, tam.x * tam.y * tam.z)
    const vol = volumeAssinado(g)
    if (vol < -0.06 * caixa) {
      const quem = (o.name || '(sem nome)') + ' em ' + ((o.parent && o.parent.name) || '?')
      ruins.push(rotulo.padEnd(14) + quem.padEnd(34)
        + ' volume ' + (vol * 1e6).toFixed(1) + ' cm3, caixa ' + (caixa * 1e6).toFixed(1)
        + ', ' + (g.index ? g.index.count / 3 : pos0(g)) + ' tris')
    }
  })
}

const ch = createCharacter({})
const campos = {
  cabeca: A.CABECAS.length, olhos: A.OLHOS.length, nariz: A.NARIZES.length,
  boca: A.BOCAS.length, barba: A.BARBAS.length, cabelo: A.CABELOS.length,
  sobrancelha: A.SOBRANCELHAS.length,
  chapeu: R.CHAPEUS.length, calcado: R.CALCADOS.length, blusa: R.BLUSAS.length,
  calca: R.CALCAS.length, colar: R.COLARES.length, anelAcess: R.ANEIS.length,
  relogio: R.RELOGIOS.length, tatuagem: R.TATUAGENS.length,
}

varrer(ch.root, 'corpo nu')
for (const k in campos) {
  for (let i = 0; i < campos[k]; i++) {
    ch.setAppearance({ [k]: i })
    varrer(ch.root, k + ' ' + i)
  }
  ch.setAppearance({ [k]: (k === 'blusa' || k === 'calcado') ? 1 : 0 })
}

if (ruins.length) {
  console.log('MALHAS VIRADAS DO AVESSO (' + ruins.length + ' de '
    + (malhas - abertas - ignoradas) + ' malhas fechadas de um lado so):')
  for (const r of ruins) console.log('  ' + r)
  process.exit(1)
}
console.log('nenhuma malha virada do avesso'
  + '  (' + malhas + ' varridas: ' + (malhas - abertas - ignoradas) + ' fechadas conferidas, '
  + abertas + ' abertas e ' + ignoradas + ' de dois lados ficaram fora)')
