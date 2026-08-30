import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD_S, useHead, surfaceZ, skinOf, shade, sh, flatPiece, soldarNormais,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/nariz-cartoon.js — O NARIZ DA REFERENCIA.
//
// "vamos fazer o modelo de nariz identico tb". Nas duas fotos o nariz e:
//
//  - UM SO TRACO CONTINUO. Ele sai da testa entre os olhos, desce e termina
//    numa ponta arredondada. Nao ha dorso largo, nao ha asas, e — o mais
//    importante — NAO HA NARINA. Os outros tres narizes deste jogo tem narina
//    de proposito; este nao pode ter, e essa e a diferenca que mais pesa na
//    semelhanca.
//  - ESTREITO EM CIMA, GORDO NA PONTA. A largura quase nao existe na raiz e
//    dobra perto do fim; o volume todo esta no ultimo terco.
//  - CURVADO PRA FORA E PRA BAIXO. Visto de lado ele faz uma virgula: sai da
//    testa quase colado, ganha projecao no meio e a ponta cai um pouco.
//  - SEM ARESTA. E uma superficie lisa; qualquer plano ou chanfro (que e o que
//    da carater aos outros narizes daqui) quebra a leitura de desenho.
//
// METODO: uma varredura ao longo de uma curva. Cada secao e uma elipse cujo
// tamanho e centro saem de tabelas em `t` (0 na raiz, 1 na ponta); os aneis sao
// costurados na mao e a ponta fecha num leque. E o unico jeito de a espessura
// crescer e o eixo curvar ao mesmo tempo sem emenda nenhuma.
//
// A raiz nasce ENTERRADA na cabeca (a primeira secao fica atras da pele) pra
// nunca aparecer um degrau entre o nariz e a testa em nenhum dos seis cranios.
// ---------------------------------------------------------------------------

const S = HEAD_S

// O EIXO, em (y, avanco) — avanco e o quanto a secao sai da pele, em metros.
// t = 0 e a raiz (entre as sobrancelhas), t = 1 e a ponta.
// A raiz tem avanco NEGATIVO: ela mora dentro do cranio.
const EIXO = [
  //  t     y (espaco da cabeca)   avanco alem da pele
  [0.00, 0.0620 * S, -0.0100 * S],
  [0.18, 0.0430 * S, -0.0030 * S],
  [0.36, 0.0200 * S, 0.0035 * S],
  [0.54, -0.0040 * S, 0.0105 * S],
  [0.72, -0.0230 * S, 0.0180 * S],
  [0.86, -0.0350 * S, 0.0215 * S],
  [0.95, -0.0430 * S, 0.0205 * S],   // a ponta CAI: o avanco recua no fim
  [1.00, -0.0480 * S, 0.0170 * S],
]

// A SECAO, em (t, meia-largura, meia-altura). Estreita na raiz, gorda no fim.
const SECAO = [
  [0.00, 0.0105 * S, 0.0130 * S],
  [0.30, 0.0098 * S, 0.0125 * S],
  [0.55, 0.0118 * S, 0.0135 * S],
  [0.78, 0.0165 * S, 0.0150 * S],
  [0.90, 0.0190 * S, 0.0152 * S],   // o bulbo
  [1.00, 0.0155 * S, 0.0120 * S],
]

function interp(tab, t) {
  if (t <= tab[0][0]) return tab[0]
  for (let i = 1; i < tab.length; i++) {
    if (t <= tab[i][0]) {
      const a = tab[i - 1], b = tab[i]
      const u = (t - a[0]) / (b[0] - a[0])
      const s = u * u * (3 - 2 * u)
      return [t, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]
    }
  }
  return tab[tab.length - 1]
}

const ANEIS = 16
const COLUNAS = 14

function build(ctx) {
  useHead(ctx)
  const pele = skinOf(ctx)
  const mat = solid(pele, 0.70, 0.0)

  const pos = []
  const idx = []
  const linhas = []
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  for (let a = 0; a <= ANEIS; a++) {
    const t = a / ANEIS
    const e = interp(EIXO, t)
    const s = interp(SECAO, t)
    const y = e[1]
    // O Z de cada secao sai da PELE naquela altura, e nao de um numero fixo:
    // e o que faz o mesmo nariz assentar nos seis cranios (a testa da cabeca
    // comprida esta 3.8 cm atras da testa da mandibula).
    const z0 = surfaceZ(0, y)
    const linha = []
    for (let c = 0; c < COLUNAS; c++) {
      const ang = (c / COLUNAS) * Math.PI * 2
      const cx = Math.sin(ang) * s[1]
      // A secao e uma elipse INCLINADA: a parte de baixo dela acompanha a
      // descida do eixo. Sem a inclinacao, as secoes se cruzam na curva da
      // ponta e aparece um vinco.
      const cy = Math.cos(ang) * s[2] * 0.62
      linha.push(put(cx, y + cy, z0 + e[2] - Math.cos(ang) * s[2] * 0.34))
    }
    linhas.push(linha)
  }

  // ponta: um leque no ultimo anel, um pouco alem dele
  {
    const e = interp(EIXO, 1)
    const z0 = surfaceZ(0, e[1])
    linhas.push([put(0, e[1] - 0.0035 * S, z0 + e[2] + 0.0030 * S)])
  }

  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (B.length === 1) {
      for (let i = 0; i < A.length; i++) idx.push(A[i], B[0], A[(i + 1) % A.length])
      continue
    }
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length
      idx.push(A[i], B[j], A[j], A[i], B[i], B[j])
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()

  const g = new THREE.Group()
  g.add(sh(new THREE.Mesh(geo, mat)))

  // A SOMBRA SOB A PONTA. Nas fotos o nariz e um traco; em 3D, sem nada
  // embaixo, a ponta some contra o labio superior quando a luz vem de cima —
  // que e o padrao do jogo. Este disquinho escurecido faz o papel do traco: ele
  // nao e uma narina (o nariz da referencia nao tem), e uma sombra.
  const e = interp(EIXO, 0.99)
  const sombra = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 8), solid(shade(pele, 0.72), 0.85, 0.0)))
  sombra.scale.set(0.0125 * S, 0.0032 * S, 0.0080 * S)
  sombra.position.set(0, e[1] - 0.0055 * S, surfaceZ(0, e[1]) + e[2] - 0.0025 * S)
  g.add(sombra)

  return g
}

export const NARIZ_CARTOON = {
  id: 'cartoon',
  nome: 'Desenho',
  name: 'Desenho',
  metodo: 'varredura de secoes elipticas ao longo de uma curva que sai da testa e cai na ponta; sem asa e SEM NARINA, que e o que separa este do resto',
  build,
}

export default NARIZ_CARTOON
