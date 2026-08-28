// ---------------------------------------------------------------------------
// src/world/hudson/entorno.js — o que se ve DEPOIS do quarteirao.
//
// Um quarteirao sozinho no meio do nada nao parece um bairro: parece uma
// maquete em cima de uma mesa. Em toda foto do levantamento da pra ver, alem da
// rua, mais telhado, mais poste, e no fundo os MORROS do cerrado — Paracatu
// fica num vale, e o horizonte sobe dos dois lados.
//
// Este arquivo desenha esse fundo, e ele tem uma regra so: NAO PODE CUSTAR.
// O jogador nunca chega la. Entao:
//
//   - as casas do entorno sao CAIXA + TELHADO, sem porta, janela ou muro;
//   - nao tem colisor (o jogador para nas ruas do quarteirao muito antes);
//   - nao tem sombra;
//   - tudo entra em duas malhas fundidas — uma de parede, uma de telha.
//
// Custo final: 4 draw calls pro bairro inteiro e pros morros.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid, stdMat } from '../materials.js'
import { telhaTex, rebocoTex } from './materiais.js'
import { mergeGeometries } from '../bake.js'
import { LIMITE } from './chao.js'

const PI = Math.PI

function rng(seed) {
  let s = (seed | 0) >>> 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uma casa de fundo: caixa e duas aguas, ja transformada pro mundo. */
function casaDeFundo(paredes, telhas, x, z, larg, prof, alt, giro, r) {
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, giro, 0))
  const e = new THREE.Vector3(1, 1, 1)

  const corpo = new THREE.BoxGeometry(larg, alt, prof)
  m.compose(new THREE.Vector3(x, alt / 2, z), q, e)
  corpo.applyMatrix4(m)
  paredes.push(corpo)

  // as duas aguas: dois planos inclinados, sem beiral (ninguem chega perto)
  const sub = 0.9 + r() * 0.5
  const meia = prof / 2 + 0.35
  const ang = Math.atan2(sub, meia)
  const comp = Math.hypot(sub, meia)
  for (const lado of [1, -1]) {
    const agua = new THREE.PlaneGeometry(larg + 0.7, comp)
    const eul = new THREE.Euler(-PI / 2 + lado * ang, lado > 0 ? 0 : PI, 0, 'YXZ')
    const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, giro, 0))
      .multiply(new THREE.Quaternion().setFromEuler(eul))
    const dz = lado * Math.cos(ang) * (comp / 2)
    const px = x + Math.sin(giro) * 0 + Math.cos(giro) * 0 + dz * Math.sin(giro)
    const pz = z + dz * Math.cos(giro)
    m.compose(new THREE.Vector3(px, alt + sub - Math.sin(ang) * (comp / 2), pz), qa, e)
    agua.applyMatrix4(m)
    telhas.push(agua)
  }
}

/**
 * O bairro que continua depois das quatro ruas, e os morros do fundo.
 *
 * @param {number} seed
 * @returns {THREE.Group}
 */
export function buildEntorno(seed = 7) {
  const g = new THREE.Group()
  g.name = 'hudson-entorno'
  const r = rng(seed)
  const paredes = []
  const telhas = []

  // --- OS QUARTEIROES VIZINHOS ---------------------------------------------
  // Tres aneis de lotes em volta, cada um mais longe e mais rarefeito. O
  // primeiro anel comeca logo depois da calcada oposta: e ele que fecha o fundo
  // das fotos de rua.
  const L = LIMITE
  const aneis = [
    { recuo: 12, passo: 9.5, alt: [2.7, 3.4], falha: 0.10 },
    { recuo: 46, passo: 11, alt: [2.6, 4.2], falha: 0.28 },
    { recuo: 92, passo: 14, alt: [2.5, 5.0], falha: 0.45 },
  ]
  for (const a of aneis) {
    const x0 = L.x0 - a.recuo, x1 = L.x1 + a.recuo
    const z0 = L.z0 - a.recuo, z1 = L.z1 + a.recuo
    // as quatro fitas de casas do anel, viradas pra dentro
    const fitas = [
      { fixo: z1, de: x0, ate: x1, eixo: 'x', giro: PI },
      { fixo: z0, de: x0, ate: x1, eixo: 'x', giro: 0 },
      { fixo: x1, de: z0, ate: z1, eixo: 'z', giro: -PI / 2 },
      { fixo: x0, de: z0, ate: z1, eixo: 'z', giro: PI / 2 },
    ]
    for (const f of fitas) {
      for (let t = f.de; t < f.ate; t += a.passo) {
        if (r() < a.falha) continue          // vazios: quarteirao nao e continuo
        const larg = a.passo * (0.68 + r() * 0.26)
        const prof = 7 + r() * 5
        const alt = a.alt[0] + r() * (a.alt[1] - a.alt[0])
        // JITTER em tudo. Sem ele os aneis viram um cemiterio de caixinhas
        // identicas enfileiradas — da rua nao aparece, mas de cima grita.
        const jitter = (r() - 0.5) * 3.4
        const x = f.eixo === 'x' ? t + a.passo / 2 + (r() - 0.5) * 1.6 : f.fixo + jitter
        const z = f.eixo === 'x' ? f.fixo + jitter : t + a.passo / 2 + (r() - 0.5) * 1.6
        const torto = f.giro + (r() - 0.5) * 0.22
        casaDeFundo(paredes, telhas, x, z, larg, prof, alt, torto, r)
        // uma em cada seis vira de lado: rua interna, fundo de lote, puxadinho
        if (r() < 0.17) {
          casaDeFundo(paredes, telhas, x + (r() - 0.5) * 6, z + (r() - 0.5) * 6,
            larg * 0.6, prof * 0.6, alt * 0.82, torto + PI / 2, r)
        }
      }
    }
  }

  if (paredes.length) {
    const geo = mergeGeometries(paredes)
    for (const p of paredes) p.dispose()
    if (geo) {
      const m = new THREE.Mesh(geo, stdMat('hud-fundo-parede', {
        map: rebocoTex('#c9c1b2', { pintado: true, umidade: 0.3, seed: 3, repeatX: 40 }),
        roughness: 0.95,
      }))
      m.castShadow = false
      m.receiveShadow = false
      g.add(m)
    }
  }
  if (telhas.length) {
    const geo = mergeGeometries(telhas)
    for (const t of telhas) t.dispose()
    if (geo) {
      const m = new THREE.Mesh(geo, stdMat('hud-fundo-telha', {
        map: telhaTex(60, 24, '#ab5a38'), roughness: 0.95, side: THREE.DoubleSide,
      }))
      m.castShadow = false
      m.receiveShadow = false
      g.add(m)
    }
  }

  // --- OS MORROS -----------------------------------------------------------
  // Paracatu fica num vale. Nas fotos o horizonte e uma linha de morros baixos
  // e azulados de bruma, com o casario subindo pelas encostas. Cones achatados
  // resolvem: a 500 m de distancia ninguem ve a silhueta poligonal, e o fog do
  // jogo termina de dissolver a base.
  const morros = []
  const nM = 26
  for (let i = 0; i < nM; i++) {
    const a = (i / nM) * PI * 2 + r() * 0.2
    const d = 420 + r() * 240
    const raio = 90 + r() * 130
    const alt = 26 + r() * 44
    const c = new THREE.ConeGeometry(raio, alt, 7, 1)
    const m4 = new THREE.Matrix4()
    m4.compose(
      new THREE.Vector3(Math.cos(a) * d, alt / 2 - 6, Math.sin(a) * d),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)),
      new THREE.Vector3(1, 1, 0.7 + r() * 0.6))
    c.applyMatrix4(m4)
    morros.push(c)
  }
  const geoM = mergeGeometries(morros)
  for (const m of morros) m.dispose()
  if (geoM) {
    const m = new THREE.Mesh(geoM, solid(0x8f9a91, 0.99))
    m.castShadow = false
    m.receiveShadow = false
    g.add(m)
  }

  return g
}

export default buildEntorno
