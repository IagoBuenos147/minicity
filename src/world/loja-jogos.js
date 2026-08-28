import * as THREE from 'three'
import { LOJA_JOGOS, interiorOf } from './layout.js'
import { LEVELS } from '../config.js'
import { solid, stdMat, box, cyl, plane, textPlaneMat, woodTex, tileTex } from './materials.js'
import { createNPC } from '../npc/npc.js'
import { congelarPersonagem } from '../player/congelar.js'
import { MOBILIA, poteDeFichas, mesaDeSinuca, jukebox, baralho, maletaDeFichas } from '../mobilia/catalogo.js'

// ---------------------------------------------------------------------------
// TACO DE OURO — a loja de jogos.
//
// A casca (parede, vitrine, toldo, letreiro, telhado) e do buildShell de
// city.js: este arquivo e so o MIOLO, como a mercearia e a barbearia. Foi por
// isso que o lote nasceu com a fachada em z1 — assim apronOf, naFrenteDaPorta,
// semLotes, groundY e a neve tratam ela como tratam as outras duas, sem
// aprender caso novo nenhum.
//
// A REGRA DA SALA: tudo que ela vende esta A VISTA, e cada peca em exposicao e
// um ponto de interacao que abre a loja JA NAQUELE ITEM. E o que faz a vitrine
// ser jogo e nao decoracao — o dono pediu "os itens tb devem estar a vista".
//
// LUZ: zero PointLight. O orcamento do jogo esta em 22 de 22 (tools/smoke.mjs),
// e um interior novo nao pode ser o que estoura. A sala e acesa por EMISSIVO:
// duas calhas no forro, o letreiro atras do balcao e os tubos da jukebox. E a
// mesma saida que a mercearia documenta.
// ---------------------------------------------------------------------------

const B = LOJA_JOGOS
const IN = interiorOf(B)                 // x 32.3..51.7 / z -29.7..-12.3
const BASE = LEVELS.SHOP_FLOOR           // 0.16
const CEIL = B.wallHeight - BASE         // 4.04 local

/** O balcao: encostado na parede do fundo, com a Wanda atras. */
const BALCAO = { x: 42.0, z: -27.4, w: 5.2, d: 0.72, h: 1.08 }
const WANDA = { x: 42.0, z: -28.3 }

const M = {
  get piso() {
    // xadrez de bar: o mesmo material da barbearia, so que virado 45 graus pela
    // repeticao. Chao liso num salao de sinuca le como sala de espera.
    return stdMat('loja-piso', { map: tileTex(9, '#1d2b24', '#0e1713'), roughness: 0.72 })
  },
  get parede() {
    return stdMat('loja-parede', { map: woodTex(3, '#3a2418'), color: 0x6b5340, roughness: 0.92 })
  },
  get forro() { return solid(0x141a18, 0.95) },
  get calha() { return stdMat('loja-calha', { color: 0xfff0d0, emissive: 0xffe8bc, emissiveIntensity: 1.35, roughness: 0.4 }) },
  get madeira() { return stdMat('loja-madeira', { map: woodTex(2, '#4a2c18'), color: 0x8a5c38, roughness: 0.6 }) },
  get latao() { return solid(0xbf9a45, 0.35, 0.75) },
  get feltroParede() { return solid(0x134a35, 0.98) },
  get palco() { return solid(0x2a1c12, 0.9) },
  get neonRosa() { return stdMat('loja-neon-rosa', { color: 0xff7fd8, emissive: 0xd93bb0, emissiveIntensity: 2.1, roughness: 0.35 }) },
  get neonAmbar() { return stdMat('loja-neon-ambar', { color: 0xffd98a, emissive: 0xe2a83c, emissiveIntensity: 1.9, roughness: 0.35 }) },
}

function piso(g) {
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.piso)
  p.position.set((IN.x0 + IN.x1) / 2, 0.005, (IN.z0 + IN.z1) / 2)
  p.receiveShadow = true
  g.add(p)
  // rodape de madeira nas quatro paredes
  const R = 0.16
  for (const s of [-1, 1]) {
    g.add(box(IN.x1 - IN.x0, R, 0.05, M.madeira, (IN.x0 + IN.x1) / 2, R / 2, s > 0 ? IN.z1 - 0.03 : IN.z0 + 0.03))
    g.add(box(0.05, R, IN.z1 - IN.z0, M.madeira, s > 0 ? IN.x1 - 0.03 : IN.x0 + 0.03, R / 2, (IN.z0 + IN.z1) / 2))
  }
}

function forroELuz(g) {
  const t = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.forro, Math.PI / 2)
  t.position.set((IN.x0 + IN.x1) / 2, CEIL, (IN.z0 + IN.z1) / 2)
  g.add(t)
  // Duas calhas compridas. Emissivo puro: elas ACENDEM o forro visualmente sem
  // custar uma luz de shader, que e o unico orcamento realmente apertado.
  for (const z of [-25.0, -17.5]) {
    g.add(box(IN.x1 - IN.x0 - 3.0, 0.10, 0.34, M.calha, (IN.x0 + IN.x1) / 2, CEIL - 0.10, z))
    g.add(box(IN.x1 - IN.x0 - 2.6, 0.06, 0.46, M.madeira, (IN.x0 + IN.x1) / 2, CEIL - 0.02, z))
  }
  // luminarias baixas sobre as mesas: cupula de metal com miolo aceso
  for (const x of [37.6, 46.4]) {
    for (const dz of [-0.7, 0.7]) {
      const fio = cyl(0.008, 0.008, CEIL - 1.95, M.madeira, 5)
      fio.position.set(x, CEIL - (CEIL - 1.95) / 2, -20.4 + dz)
      g.add(fio)
      const cup = cyl(0.20, 0.09, 0.16, M.madeira, 12, true)
      cup.position.set(x, 1.93, -20.4 + dz)
      g.add(cup)
      const bulbo = cyl(0.16, 0.16, 0.02, M.calha, 12)
      bulbo.position.set(x, 1.86, -20.4 + dz)
      g.add(bulbo)
    }
  }
}

function paredes(g, occluders) {
  // feltro verde na parede do fundo, atras do balcao: e a cor da casa
  g.add(box(IN.x1 - IN.x0, 2.4, 0.04, M.feltroParede, (IN.x0 + IN.x1) / 2, 1.5, IN.z0 + 0.04))
  // letreiro de neon do fundo
  const letra = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), textPlaneMat('TACO DE OURO', {
    w: 640, h: 100, color: '#ffd98a', font: 'bold 68px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 1.6,
  }))
  letra.position.set(BALCAO.x, 2.34, IN.z0 + 0.07)
  letra.castShadow = false
  g.add(letra)
  // dois tubos de neon emoldurando
  for (const s of [-1, 1]) {
    g.add(box(0.05, 1.1, 0.05, s > 0 ? M.neonRosa : M.neonAmbar, BALCAO.x + s * 2.6, 2.2, IN.z0 + 0.08))
  }
  void occluders
}

function balcao(g, colliders) {
  const b = BALCAO
  g.add(box(b.w, b.h, b.d, M.madeira, b.x, b.h / 2, b.z))
  g.add(box(b.w + 0.10, 0.05, b.d + 0.10, M.latao, b.x, b.h + 0.02, b.z))
  // frente com painel de feltro e filete de latao
  g.add(box(b.w - 0.24, 0.62, 0.03, M.feltroParede, b.x, 0.56, b.z + b.d / 2 + 0.016))
  g.add(box(b.w - 0.20, 0.03, 0.04, M.latao, b.x, 0.90, b.z + b.d / 2 + 0.02))
  colliders.push({
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, tag: 'loja-balcao',
  })
  // prateleira atras, com caixas de baralho de mostruario
  g.add(box(b.w, 0.05, 0.30, M.madeira, b.x, 1.55, IN.z0 + 0.20))
  g.add(box(b.w, 0.05, 0.30, M.madeira, b.x, 1.92, IN.z0 + 0.20))
  // registradora
  g.add(box(0.34, 0.24, 0.30, solid(0x2a2f36, 0.6), b.x + 1.9, b.h + 0.14, b.z))
  g.add(box(0.30, 0.02, 0.20, M.latao, b.x + 1.9, b.h + 0.27, b.z - 0.03))
}

/**
 * O MOSTRUARIO. Cada peca em exposicao e um `interactable` que abre a loja ja
 * naquele item — e o que transforma "os itens estao a vista" em jogo.
 *
 * As mesas ficam num palco de 25 cm porque o peitoril da vitrine do buildShell
 * comeca em y = 0.85 e o tampo de uma mesa de bar fica em 0.80: sem o palco,
 * quem passa na calcada ve so a borda da mesa.
 */
function mostruario(g, colliders, interactables) {
  const pecas = []

  const palcoDe = (x, z, w, d) => {
    g.add(box(w, 0.25, d, M.palco, x, 0.125, z))
    g.add(box(w + 0.06, 0.03, d + 0.06, M.latao, x, 0.255, z))
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, tag: 'loja-palco' })
  }

  // --- as duas mesas de sinuca, em palco, viradas pra vitrine ---------------
  const mesas = [
    { id: 'sinuca-bar', x: 37.4, z: -20.4, obj: () => mesaDeSinuca(2.24, 1.24, '#2c7a52', true), w: 3.0, d: 2.0 },
    { id: 'sinuca-recond', x: 46.6, z: -20.4, obj: () => mesaDeSinuca(2.60, 1.45, '#1e5aa8', false), w: 3.3, d: 2.2 },
  ]
  for (const m of mesas) {
    palcoDe(m.x, m.z, m.w, m.d)
    const o = m.obj()
    o.position.set(m.x, 0.25, m.z)
    o.rotation.y = Math.PI / 2
    g.add(o)
    pecas.push({ id: m.id, x: m.x, y: 1.15, z: m.z })
  }

  // --- a jukebox, encostada na parede oeste --------------------------------
  const jb = jukebox()
  jb.position.set(IN.x0 + 0.85, 0, -25.2)
  jb.rotation.y = Math.PI / 2
  g.add(jb)
  colliders.push({ minX: IN.x0 + 0.4, maxX: IN.x0 + 1.3, minZ: -25.7, maxZ: -24.7, tag: 'loja-jukebox' })
  pecas.push({ id: 'jukebox', x: IN.x0 + 1.1, y: 1.0, z: -25.2 })

  // --- ilha de baralhos, no meio do salao ----------------------------------
  g.add(box(1.30, 0.92, 0.80, M.madeira, 42.0, 0.46, -16.4))
  g.add(box(1.40, 0.05, 0.90, M.latao, 42.0, 0.95, -16.4))
  colliders.push({ minX: 41.3, maxX: 42.7, minZ: -16.85, maxZ: -15.95, tag: 'loja-ilha' })
  const marcas = [
    ['baralho-beira', 0x9c3b32, 'BEIRA', false, -0.42],
    ['baralho-naipe', 0x1f4f7a, 'NAIPE', false, 0.0],
    ['baralho-estrela', 0x8a6a1f, 'ESTRELA', true, 0.42],
  ]
  for (const b of marcas) {
    for (let k = 0; k < 4; k++) {
      const c = baralho(b[1], b[2], b[3])
      c.position.set(42.0 + b[4], 0.975 + k * 0.020, -16.4 + (k % 2) * 0.01)
      c.rotation.x = -Math.PI / 2
      c.rotation.z = (k % 2 ? 0.05 : -0.04)
      g.add(c)
    }
    pecas.push({ id: b[0], x: 42.0 + b[4], y: 1.10, z: -16.4 })
  }

  // --- as duas maletas, na parede leste ------------------------------------
  g.add(box(0.60, 0.90, 1.90, M.madeira, IN.x1 - 0.55, 0.45, -24.6))
  g.add(box(0.70, 0.05, 2.00, M.latao, IN.x1 - 0.55, 0.93, -24.6))
  colliders.push({ minX: IN.x1 - 0.9, maxX: IN.x1 - 0.2, minZ: -25.6, maxZ: -23.6, tag: 'loja-maletas' })
  const maletas = [
    { id: 'maleta-200', z: -25.2, obj: () => maletaDeFichas(96, 0x9aa1a8, false) },
    { id: 'maleta-300', z: -23.9, obj: () => maletaDeFichas(132, 0x5a3a2a, true) },
  ]
  for (const m of maletas) {
    const o = m.obj()
    o.position.set(IN.x1 - 0.55, 0.955, m.z)
    o.rotation.y = -Math.PI / 2
    g.add(o)
    pecas.push({ id: m.id, x: IN.x1 - 0.8, y: 1.15, z: m.z })
  }

  // --- o pote de fichas de sinuca, no balcao -------------------------------
  const pote = poteDeFichas()
  pote.position.set(BALCAO.x - 1.9, BALCAO.h + 0.05, BALCAO.z + 0.06)
  g.add(pote)
  pecas.push({ id: 'ficha-sinuca', x: BALCAO.x - 1.9, y: BALCAO.h + 0.2, z: BALCAO.z + 0.5 })

  const porId = new Map()
  for (const m of MOBILIA) porId.set(m.id, m)
  for (const p of pecas) {
    const m = porId.get(p.id)
    if (!m) continue
    interactables.push({
      id: 'loja-item-' + p.id,
      position: new THREE.Vector3(p.x, BASE + p.y, p.z),
      radius: 1.9,
      label: 'Ver: ' + m.nome + ' — ' + m.preco,
      onInteract: (gm) => {
        if (gm.loja && typeof gm.loja.abrir === 'function') gm.loja.abrir(p.id)
        else gm.toast(m.nome + ' — ' + m.preco + ' de ouro')
      },
    })
  }
  return jb
}

/**
 * WANDA, a dona da casa.
 *
 * Aparencia ENXUTA de proposito: sem chapeu, colar, anel, relogio nem jaqueta.
 * Esses acessorios sao a diferenca entre os 15 meshes do NPC da casa velha e os
 * 65 de cada NPC do cassino, e esta sala ja carrega duas mesas de sinuca. Por
 * cima da roupa vai um colete de crupie proprio, que e uma peca de pano so.
 */
function criarWanda(g, colliders) {
  let npc = null
  try {
    npc = createNPC({
      name: 'Wanda',
      pose: 'work',
      x: WANDA.x, y: 0, z: WANDA.z,
      rotY: 0,                       // olha pro +Z, ou seja, pra quem entra
      shirt: 0xe8e2d2,
      pants: 0x23282f,
      shoes: 0x1a1d22,
      appearance: { hair: 2, hairColor: 3, eyes: 4, brows: 1, mouth: 2 },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

  // colete de crupie: verde-feltro com debrum preto e um cracha
  const colete = new THREE.Group()
  colete.add(box(0.40, 0.44, 0.26, solid(0x134a35, 0.95), 0, 1.16, 0.005))
  colete.add(box(0.42, 0.04, 0.27, solid(0x101418, 0.9), 0, 0.95, 0.005))
  const cracha = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.045), textPlaneMat('WANDA', {
    w: 128, h: 52, color: '#f3e6c2', font: 'bold 30px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.1,
  }))
  cracha.position.set(0.10, 1.24, 0.135)
  cracha.castShadow = false
  colete.add(cracha)
  // ligas de braco: a silhueta de salao de sinuca
  for (const s of [-1, 1]) {
    colete.add(box(0.10, 0.05, 0.10, solid(0x101418, 0.9), s * 0.235, 1.06, 0))
  }
  root.add(colete)

  g.add(root)

  // O forno vem DEPOIS do colete, senao ele fica de fora da fusao. Preserva as
  // juntas, que e onde npc.js escreve a respiracao, o balanco e a piscada.
  if (npc.character && npc.character.parts) {
    congelarPersonagem(root, { juntas: npc.character.parts })
  }
  colliders.push({
    minX: WANDA.x - 0.3, maxX: WANDA.x + 0.3,
    minZ: WANDA.z - 0.3, maxZ: WANDA.z + 0.3, tag: 'loja-clerk',
  })
  return npc
}

export function buildLojaJogos(game) {
  const group = new THREE.Group()
  group.name = 'loja-jogos-interior'
  const colliders = []
  const interactables = []
  const occluders = []

  piso(group)
  forroELuz(group)
  paredes(group, occluders)
  balcao(group, colliders)
  const jb = mostruario(group, colliders, interactables)
  const npc = criarWanda(group, colliders)

  group.position.y = BASE

  interactables.push({
    id: 'loja-jogos-balcao',
    // do lado do CLIENTE do balcao e na altura da cintura: a interacao pesa o Y
    // pela metade, entao na cintura o rotulo aparece na hora certa tambem em
    // primeira pessoa
    position: new THREE.Vector3(BALCAO.x, BASE + 1.05, BALCAO.z + 1.5),
    radius: 2.4,
    label: 'Falar com a Wanda',
    onInteract: (gm) => {
      if (gm.loja && typeof gm.loja.abrir === 'function') gm.loja.abrir()
      else gm.toast('Wanda: entra. Tudo aqui e de segunda mao, menos o preco.')
    },
  })

  // ---- animacao ------------------------------------------------------------
  let lookObj = null
  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  let t = 0
  function update(dt, gm) {
    t += Math.min(dt || 0, 0.1)
    if (jb && jb.userData && typeof jb.userData.animar === 'function') jb.userData.animar(t)
    if (!npc) return
    const p = gm && gm.player && gm.player.position
    if (p) {
      const dx = p.x - WANDA.x, dz = p.z - WANDA.z
      if (dx * dx + dz * dz < 49) {
        const alvo = alvoDoOlhar(gm)
        if (alvo) npc.lookTarget = alvo
      } else if (npc.lookTarget) {
        npc.lookTarget = null
      }
    }
    if (typeof npc.update === 'function') npc.update(dt)
  }

  return { group, colliders, interactables, occluders, update }
}

export default buildLojaJogos
