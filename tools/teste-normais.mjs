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
// dot(v0, cross(v1, v2)) / 6 sobre os triangulos. Numa casca fechada com a
// normal pra fora isso da o volume, positivo; virada do avesso, da o mesmo
// numero negativo. Nao depende de a peca ser convexa, o que a media de normais
// dependia — foi ela que acusou as duas maos (que sao muito concavas) sem elas
// terem defeito nenhum.
//
// Malha ABERTA (um cartao de cabelo, um plano de tatuagem, uma calota) tem
// volume perto de zero e nao e acusada: o teste so olha o que tem volume de
// verdade, comparado com o tamanho da propria peca.
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

function varrer(raiz, rotulo) {
  raiz.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return
    const g = o.geometry
    if (vistos.has(g.uuid)) return
    vistos.add(g.uuid)
    malhas++
    if (!g.boundingBox) g.computeBoundingBox()
    g.boundingBox.getSize(tam)
    // Referencia de escala: o volume da caixa da peca. Casca aberta da um
    // volume assinado desprezivel perto disso e nao entra na conta.
    const caixa = Math.max(1e-9, tam.x * tam.y * tam.z)
    const vol = volumeAssinado(g)
    if (vol < -0.06 * caixa) {
      ruins.push(rotulo + '  volume ' + (vol * 1e6).toFixed(1) + ' cm3 (caixa ' + (caixa * 1e6).toFixed(1) + ')')
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
  console.log('MALHAS VIRADAS DO AVESSO (' + ruins.length + ' de ' + malhas + '):')
  for (const r of ruins) console.log('  ' + r)
  process.exit(1)
}
console.log('nenhuma malha virada do avesso em ' + malhas + ' varridas')
