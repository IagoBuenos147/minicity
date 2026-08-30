import * as THREE from 'three'
import { CONCESSIONARIA, interiorOf, apronOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import { solid, stdMat, box, cyl, sphere, plane, textPlaneMat, tex } from './materials.js'
import { bakeStatic } from './bake.js'
import * as Props from './props.js'
import { createNPC } from '../npc/npc.js'
import { congelarPersonagem } from '../player/congelar.js'

// ---------------------------------------------------------------------------
// GARAGEM DO NANDO — a concessionaria, vizinha do hotel na calcada do anel.
//
// Era o predio de cenario que o letreiro procedural chamava de "CHAVEIRO 24H".
//
// A REGRA DA SALA e a mesma da loja de jogos: TUDO QUE ELA VENDE ESTA A VISTA,
// e cada veiculo em exposicao e um ponto de interacao que abre a loja JA
// NAQUELE ITEM. Num showroom isso nao e so conveniencia — e a coisa toda. Uma
// concessionaria em que os carros estao num menu e uma loja com telhado.
//
// O QUE ESTE ARQUIVO APRENDEU COM O HOTEL (e por que ele e mais barato):
//
//  1. A casca vem em DOIS grupos: `casca` projeta sombra, `enfeite` nao.
//     Janela, testeira, letreiro e trelica sao chapa fina colada na parede e a
//     sombra deles e a mesma da parede — mas quem projeta e desenhado duas
//     vezes por quadro, no mapa do sol e na tela.
//  2. O miolo tem LOD BINARIO: alem de 52 m ele sai da cena inteiro. E o miolo
//     que carrega o vendedor e os quatro veiculos, e nada disso tem o que
//     dizer a 60 m de distancia atras de um vidro.
//  3. O forno roda AQUI DENTRO, casca e miolo em separado. bakeStatic
//     reparenteia o que sobra na raiz que recebeu: chamado no grupo inteiro
//     (que e o que o main faz nos outros interiores) ele dissolveria os dois
//     grupos e o LOD nao teria mais o que esconder.
//  4. DUAS PointLight, e so. O numero de luzes da cena entra no shader de todo
//     material do jogo, entao luz aqui custa quadro no mapa inteiro.
//
// OS VEICULOS EM EXPOSICAO nao sao maquete: sao os MESMOS `construir()` de
// src/veiculos/, carregados por import dinamico. Eles ja vem assados de
// fabrica, entao entram num grupo proprio DEPOIS do forno daqui — e por isso
// tambem que a moto do prato giratorio pode girar.
// ---------------------------------------------------------------------------

const B = CONCESSIONARIA
const IN = interiorOf(B)          // x -27.7..-14.3 / z -47.7..-34.8
const T = WALL_T
const H = B.wallHeight            // 6.5
const BASE = LEVELS.SHOP_FLOOR    // 0.16
const CEIL = 6.0                  // forro do showroom (local)
const AV = apronOf(B, 0.9)
const DL = B.door.center - B.door.width / 2   // -22.7
const DR = B.door.center + B.door.width / 2   // -19.3
const DH = B.door.height                      // 3.2

// Vitrine: dois panos de 4 m, um de cada lado da porta. O peitoril e BAIXO
// (35 cm) porque o que esta a venda tem roda, e roda escondida atras de um
// peitoril de 85 cm — o das lojas normais — tira metade do carro da calcada.
const JAN_Y0 = 0.35, JAN_Y1 = 4.60
const VIDROS = [[-27.3, -23.3], [-18.7, -14.7]]

// --- as quatro vagas do showroom ------------------------------------------
// x, z e o giro de cada veiculo. Os dois grandes ficam em ANGULO, virados pra
// vitrine: showroom nao estaciona em fila, ele apresenta. `chave` e o modulo
// de src/veiculos/ e tambem o id do item na loja.
const VAGAS = [
  { chave: 'carro', x: -24.6, z: -44.0, yaw: -0.42, r: 2.6 },
  { chave: 'caminhonete', x: -17.4, z: -44.0, yaw: 0.42, r: 2.8 },
  { chave: 'moto', x: -21.0, z: -39.6, yaw: 0.0, r: 1.6, prato: true },
  { chave: 'skate', x: -25.8, z: -37.4, yaw: 0.5, r: 1.0, palco: 0.55 },
]

const BALCAO = { x0: -19.6, x1: -14.8, z0: -36.6, z1: -35.7, h: 1.10 }
const NANDO = { x: -17.2, z: -35.3 }

// Onde o veiculo comprado aparece: a vaga da rua, na calcada em frente.
export const VAGA_ENTREGA = { x: B.door.center + 5.6, z: -50.0, yaw: Math.PI / 2 }

// ---------------------------------------------------------------------------
// O CATALOGO — e a cola com a MESMA janela de loja do Taco de Ouro
// ---------------------------------------------------------------------------
//
// A concessionaria NAO tem UI propria: ela usa `criarLojaUI` de ui/loja-ui.js,
// que ja nasceu parametrizavel (catalogo, categorias, kicker, titulo, falas).
// Foi o pedido do dono — "use o mesmo sistema de hud" — e e tambem o que aquele
// arquivo pede no proprio cabecalho: "PARAMETRIZAR EM VEZ DE COPIAR O ARQUIVO".
//
// O que faltava encaixar era o ESTOQUE. A janela conhece um `inventario` de
// nove vagas de mochila, e caminhonete nao vai na mochila. Em vez de abrir
// excecao na loja, criarGaragem() la embaixo entrega um objeto com a MESMA
// forma que ela espera (slots / livres / adicionar) e que, no `adicionar`,
// materializa o veiculo na calcada. A loja continua sem saber que existe
// veiculo, e a garagem continua sem saber que existe carrinho de compras.
//
// `empilha: 1` porque ninguem leva dois carros iguais na mesma vaga.
export const CATALOGO_AUTO = [
  {
    id: 'carro', nome: 'Cupe preto 2 portas', cat: 'quatro',
    qualidade: 'fina', preco: 3900, empilha: 1,
    desc: 'Nando: esse ai e o mais rapido em reta que eu tenho. Curva pouco, mas voa.',
  },
  {
    id: 'caminhonete', nome: 'Caminhonete cabine simples', cat: 'quatro',
    qualidade: 'comum', preco: 2800, empilha: 1,
    desc: 'Nando: quarenta anos de estrada e nunca deixou ninguem na mao. Pesada, mas leva tudo.',
  },
  {
    id: 'moto', nome: 'Custom V-twin', cat: 'duas',
    qualidade: 'boa', preco: 1600, empilha: 1,
    desc: 'Nando: agil demais pro meu gosto. Inclina na curva que da gosto de ver.',
  },
  {
    id: 'skate', nome: 'Skate de rua', cat: 'duas',
    qualidade: 'comum', preco: 240, empilha: 1,
    desc: 'Nando: nao e veiculo, e passatempo. Mas anda, e anda barato.',
  },
]

export const CATEGORIAS_AUTO = [
  { id: 'tudo', label: 'TUDO' },
  { id: 'quatro', label: 'QUATRO RODAS' },
  { id: 'duas', label: 'DUAS RODAS' },
]

/**
 * A silhueta de cada veiculo, desenhada em canvas 2D.
 *
 * A janela de loja pede `fotoDe(id)` e o fotografo 3D dela (ui/miniatura3d.js)
 * precisa de um `build()` SINCRONO que devolva o Object3D. Os modelos de
 * veiculo chegam por import dinamico e nao tem como ser sincronos; sem foto
 * nenhuma o card fica com o esqueleto de carregamento piscando pra sempre.
 * Entao a foto e um desenho — que ainda por cima le melhor em 96 px do que um
 * render de um carro inteiro leria.
 */
const _fotos = new Map()
export function fotoDeVeiculo(id) {
  if (_fotos.has(id)) return _fotos.get(id)
  const c = document.createElement('canvas')
  c.width = c.height = 192
  const g = c.getContext('2d')
  g.fillStyle = '#12161c'; g.fillRect(0, 0, 192, 192)
  // chao e um halo atras, pra silhueta nao flutuar
  const halo = g.createRadialGradient(96, 118, 6, 96, 118, 86)
  halo.addColorStop(0, 'rgba(63,143,224,0.30)')
  halo.addColorStop(1, 'rgba(63,143,224,0)')
  g.fillStyle = halo; g.fillRect(0, 0, 192, 192)
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.fillRect(20, 132, 152, 3)

  const roda = (x, y, r) => {
    g.fillStyle = '#0d1014'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    g.strokeStyle = '#7f8a95'; g.lineWidth = 3
    g.beginPath(); g.arc(x, y, r * 0.5, 0, 7); g.stroke()
  }
  g.lineJoin = 'round'

  if (id === 'carro') {
    g.fillStyle = '#23262b'
    g.beginPath()
    g.moveTo(22, 118); g.lineTo(30, 96); g.lineTo(62, 92); g.lineTo(78, 70)
    g.lineTo(120, 70); g.lineTo(136, 94); g.lineTo(170, 100); g.lineTo(172, 118)
    g.closePath(); g.fill()
    g.fillStyle = '#5b6a78'
    g.beginPath(); g.moveTo(80, 74); g.lineTo(118, 74); g.lineTo(130, 92); g.lineTo(66, 92); g.closePath(); g.fill()
    roda(58, 120, 18); roda(140, 120, 18)
  } else if (id === 'caminhonete') {
    g.fillStyle = '#2f5f78'
    g.beginPath()
    g.moveTo(18, 116); g.lineTo(18, 88); g.lineTo(56, 88); g.lineTo(60, 62)
    g.lineTo(112, 62); g.lineTo(116, 88); g.lineTo(174, 88); g.lineTo(174, 116)
    g.closePath(); g.fill()
    g.fillStyle = '#7fa8bd'
    g.fillRect(66, 66, 42, 20)
    g.fillStyle = '#1f4356'
    g.fillRect(18, 92, 44, 22)          // a cacamba, mais escura
    roda(52, 118, 20); roda(146, 118, 20)
  } else if (id === 'moto') {
    g.strokeStyle = '#22262b'; g.lineWidth = 9
    g.beginPath(); g.moveTo(62, 112); g.lineTo(92, 82); g.lineTo(128, 92); g.stroke()
    g.fillStyle = '#22262b'
    g.beginPath(); g.moveTo(78, 88); g.lineTo(112, 82); g.lineTo(120, 96); g.lineTo(80, 100); g.closePath(); g.fill()
    g.strokeStyle = '#9aa2a8'; g.lineWidth = 5
    g.beginPath(); g.moveTo(128, 92); g.lineTo(142, 62); g.stroke()
    g.beginPath(); g.moveTo(130, 64); g.lineTo(156, 60); g.stroke()
    roda(58, 118, 24); roda(140, 118, 24)
  } else {
    g.fillStyle = '#3b2f22'
    g.beginPath()
    g.moveTo(30, 104); g.quadraticCurveTo(96, 96, 162, 104)
    g.quadraticCurveTo(96, 112, 30, 104); g.closePath(); g.fill()
    g.fillStyle = '#9aa2a8'
    g.fillRect(56, 106, 10, 10); g.fillRect(126, 106, 10, 10)
    roda(56, 122, 10); roda(136, 122, 10)
  }
  const url = c.toDataURL('image/png')
  _fotos.set(id, url)
  return url
}

/**
 * A GARAGEM: um "inventario" com a forma que ui/loja-ui.js espera, mas cujas
 * vagas sao a calcada e cujo `adicionar` poe um veiculo no mundo.
 *
 * A loja usa exatamente tres coisas do inventario — `slots` (array copiavel),
 * `livres` (numero) e `adicionar(id, qtd)` —, e nenhuma delas precisa ser
 * mochila. Ver o comentario do CATALOGO_AUTO acima.
 */
export function criarGaragem({ veiculos, hud, vagas = 6 } = {}) {
  const meus = []           // ids de veiculo ja entregues
  return {
    // NOVO array a cada leitura: vagasNecessarias() de loja-ui.js ESCREVE na
    // copia pra simular o carrinho. Devolver o mesmo array duas vezes faria a
    // segunda simulacao comecar suja da primeira.
    get slots() { return new Array(vagas).fill(null).map((_, i) => (meus[i] ? { id: meus[i], qtd: 1 } : null)) },
    get livres() { return Math.max(0, vagas - meus.length) },
    /** Entrega o veiculo na vaga da calcada. Devolve a vaga usada, ou -1. */
    adicionar(id, qtd) {
      const n = Math.max(1, qtd | 0)
      let ultima = -1
      for (let k = 0; k < n; k++) {
        if (meus.length >= vagas) break
        // as entregas ficam LADO A LADO, 3 m uma da outra, pra nao nascerem
        // uma dentro da outra quando o jogador leva duas de uma vez
        const i = meus.length
        const x = VAGA_ENTREGA.x + (i % 3) * 3.0
        const z = VAGA_ENTREGA.z + Math.floor(i / 3) * 5.8
        if (veiculos && typeof veiculos.criarComprado === 'function') {
          veiculos.criarComprado(id, x, z, VAGA_ENTREGA.yaw)
        }
        meus.push(id)
        ultima = i
      }
      if (ultima >= 0 && hud && typeof hud.toast === 'function') {
        hud.toast('Seu veiculo esta na vaga da frente da loja.', 5000)
      }
      return ultima
    },
    get comprados() { return meus.slice() },
  }
}

// ---------------------------------------------------------------------------
// TEXTURAS E MATERIAIS
// ---------------------------------------------------------------------------
const _tiled = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx + ':' + ry
  let t = _tiled.get(k)
  if (t) return t
  t = base.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  _tiled.set(k, t)
  return t
}

/** Piso de epoxi: cinza claro com o rodo marcado e umas manchas de oleo. */
function epoxiTex() {
  return tex('auto-epoxi', 256, (g, s) => {
    g.fillStyle = '#b9bcc0'; g.fillRect(0, 0, s, s)
    // as voltas do rodo de aplicar o epoxi
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * s
      g.strokeStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.10) + ')'
      g.lineWidth = 3 + Math.random() * 12
      g.beginPath(); g.moveTo(-10, y); g.lineTo(s + 10, y + (Math.random() - 0.5) * 20); g.stroke()
    }
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 6 + Math.random() * 20
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(60,58,58,0.30)')
      gr.addColorStop(1, 'rgba(60,58,58,0)')
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    for (let i = 0; i < 2400; i++) {
      const v = 170 + Math.random() * 40
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',' + (Math.random() * 0.25) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1)
    }
  }, 1)
}

/** Chapa metalica trapezoidal: o revestimento das paredes do galpao. */
function chapaTex() {
  return tex('auto-chapa', 128, (g, s) => {
    g.fillStyle = '#d8dbdd'; g.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 21) {
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x, 0, 7, s)
      g.fillStyle = 'rgba(120,126,132,0.5)'; g.fillRect(x + 12, 0, 5, s)
      g.fillStyle = 'rgba(70,76,82,0.35)'; g.fillRect(x + 17, 0, 2, s)
    }
  }, 1)
}

const M = {
  get piso() { return stdMat('auto-piso', { map: tiled(epoxiTex(), 5, 5), roughness: 0.38, metalness: 0.06 }) },
  // NAO HA `M.chapa` FIXO. Ver matChapa() logo abaixo: a repeticao da textura
  // TEM que sair do tamanho da peca, e um material so nao consegue servir uma
  // parede de 14 m e um pilar de 70 cm ao mesmo tempo.
  get azul() { return solid(0x2f6fbf, 0.55, 0.25) },
  get azulEsc() { return solid(0x1d4478, 0.6, 0.2) },
  get grafite() { return solid(0x2a2e33, 0.72, 0.28) },
  get aco() { return solid(0x9aa2a8, 0.5, 0.6) },
  get amarelo() { return solid(0xd9b23a, 0.7, 0.05) },
  get concreto() { return solid(0x9d9a94, 0.9) },
  get vidro() {
    return stdMat('auto-vidro', {
      color: 0xd4ecf2, transparent: true, opacity: 0.15, roughness: 0.05,
      metalness: 0.08, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get luz() { return stdMat('auto-luz', { color: 0xf6fbff, emissive: 0xdcecff, emissiveIntensity: 1.5, roughness: 0.4 }) },
  get neon() { return stdMat('auto-neon', { color: 0x9fd0ff, emissive: 0x3f8fe0, emissiveIntensity: 2.2, roughness: 0.35 }) },
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function laje(g, x0, x1, z0, z1, h, mat) {
  const m = box(x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  m.castShadow = false
  g.add(m)
  return m
}

function painel(w, h, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry || 0
  m.castShadow = false
  m.receiveShadow = true
  return m
}

/**
 * Material de chapa DIMENSIONADO PELA PECA — e nao um material so pra tudo.
 *
 * Este foi o "mesmo bug na loja de carros" que o dono viu. A causa nao era luz
 * nem profundidade: era DENSIDADE DE TEXTURA.
 *
 * A chapa trapezoidal tem estrias verticais finas, e o material antigo era um
 * so, com `repeat` fixo em (4, 1). O UV de uma BoxGeometry vai de 0 a 1 em CADA
 * face, entao esse 4 significa "quatro copias da textura na largura da peca,
 * seja ela qual for": numa parede de 14 m cada estria dava 9 cm, e num pilar de
 * fachada de 70 cm a MESMA textura comprimia as estrias pra menos de meio
 * centimetro. Meio centimetro visto da calcada e menos de um pixel, e o que nao
 * cabe num pixel cintila a cada passo do jogador — nenhum ajuste de Z resolve.
 *
 * A medida: com a camera andando 3 cm, 25,5% dos pixels da faixa da vitrine
 * mudavam; escondendo so este material, caia pra 8,4%.
 *
 * A conta e a mesma que city.js usa nas lojas (wallMatFor) e que o hotel usa em
 * matParede: divide a medida da peca por um tamanho de estampa alvo. Assim a
 * estria tem o mesmo tamanho no pilar e na parede, que e o que ela teria numa
 * chapa de verdade.
 */
function matChapa(w, h, lateral) {
  const rx = Math.max(0.25, w / 3.5)
  const ry = Math.max(0.25, h / 3.5)
  return stdMat('auto-chapa:' + rx.toFixed(2) + ':' + ry.toFixed(2) + ':' + (lateral ? 1 : 0), {
    map: tiled(chapaTex(), rx, ry),
    color: lateral ? 0xd2d7db : 0xe8ebee,
    roughness: lateral ? 0.7 : 0.68, metalness: 0.22,
  })
}

function sombras(o) {
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return o
}

/** Tira a subarvore do mapa de sombra (ver o cabecalho, item 1). */
function semSombra(o) {
  o.traverse((c) => { if (c.isMesh) c.castShadow = false })
  return o
}

// ===========================================================================
// A. CASCA
// ===========================================================================

function moldura(g) {
  const mc = M.concreto
  laje(g, AV.x0, B.x0 + T, AV.z0, AV.z1, BASE, mc)
  laje(g, B.x1 - T, AV.x1, AV.z0, AV.z1, BASE, mc)
  laje(g, B.x0 + T, B.x1 - T, B.z1 - T, AV.z1, BASE, mc)
  laje(g, B.x0 + T, B.x1 - T, AV.z0, B.z0 + T, BASE, mc)
}

function pilaresFachada() {
  const vaos = VIDROS.map((v) => v.slice()).concat([[DL, DR]]).sort((a, b) => a[0] - b[0])
  const out = []
  let cursor = B.x0
  for (const v of vaos) {
    if (v[0] > cursor + 0.01) out.push([cursor, v[0]])
    cursor = Math.max(cursor, v[1])
  }
  if (cursor < B.x1 - 0.01) out.push([cursor, B.x1])
  return out
}

function paredes(g, colliders, occluders) {
  const fz0 = B.z0, fz1 = B.z0 + T
  const parede = (x0, x1, y0, y1, z0, z1, lat) => {
    // a medida que manda e a MAIOR do plano da peca (largura em X ou em Z)
    const larg = Math.max(x1 - x0, z1 - z0)
    g.add(box(x1 - x0, y1 - y0, z1 - z0, matChapa(larg, y1 - y0, lat),
      (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
  }

  parede(B.x0, B.x0 + T, 0, H, B.z0, B.z1, true)
  parede(B.x1 - T, B.x1, 0, H, B.z0, B.z1, true)
  parede(B.x0, B.x1, 0, H, B.z1 - T, B.z1, false)

  for (const p of pilaresFachada()) parede(p[0], p[1], 0, H, fz0, fz1, false)
  for (const v of VIDROS) {
    parede(v[0], v[1], 0, JAN_Y0, fz0, fz1, false)
    parede(v[0], v[1], JAN_Y1, H, fz0, fz1, false)
  }
  parede(DL, DR, DH, H, fz0, fz1, false)

  // embasamento de concreto contornando o predio: e o que segura a chapa
  for (const s of pilaresFachada()) {
    g.add(box(s[1] - s[0], 0.34, T + 0.12, M.concreto, (s[0] + s[1]) / 2, 0.17, fz0 - 0.06 + T / 2))
  }
  for (const v of VIDROS) {
    g.add(box(v[1] - v[0], 0.34, T + 0.12, M.concreto, (v[0] + v[1]) / 2, 0.17, fz0 - 0.06 + T / 2))
  }
  for (const s of [-1, 1]) {
    const x = s < 0 ? B.x0 + T / 2 - 0.06 : B.x1 - T / 2 + 0.06
    g.add(box(T + 0.12, 0.34, B.z1 - B.z0, M.concreto, x, 0.17, (B.z0 + B.z1) / 2))
  }
  g.add(box(B.x1 - B.x0, 0.34, T + 0.12, M.concreto, (B.x0 + B.x1) / 2, 0.17, B.z1 - T / 2 + 0.06))

  colliders.push({ minX: B.x0, maxX: B.x0 + T, minZ: B.z0, maxZ: B.z1, tag: 'auto-parede' })
  colliders.push({ minX: B.x1 - T, maxX: B.x1, minZ: B.z0, maxZ: B.z1, tag: 'auto-parede' })
  colliders.push({ minX: B.x0, maxX: B.x1, minZ: B.z1 - T, maxZ: B.z1, tag: 'auto-parede' })
  colliders.push({ minX: B.x0, maxX: DL, minZ: fz0, maxZ: fz1, tag: 'auto-fachada' })
  colliders.push({ minX: DR, maxX: B.x1, minZ: fz0, maxZ: fz1, tag: 'auto-fachada' })

  const HO = CEIL + BASE + 0.4
  const occ = (a, b2, c, d, e, f, t2) => occluders.push({ minX: a, minY: b2, minZ: c, maxX: d, maxY: e, maxZ: f, tag: t2 })
  occ(B.x0, 0, B.z0, B.x0 + T, HO, B.z1, 'auto-parede')
  occ(B.x1 - T, 0, B.z0, B.x1, HO, B.z1, 'auto-parede')
  occ(B.x0, 0, B.z1 - T, B.x1, HO, B.z1, 'auto-parede')
  occ(B.x0, 0, fz0, DL, HO, fz1, 'auto-fachada')
  occ(DR, 0, fz0, B.x1, HO, fz1, 'auto-fachada')
  occ(DL, DH, fz0, DR, HO, fz1, 'auto-verga')
}

/** Vitrine: pano de vidro do peitoril ao alto, com montantes de aluminio. */
function vitrines(g) {
  const fz = B.z0
  for (const v of VIDROS) {
    const w = v[1] - v[0], h = JAN_Y1 - JAN_Y0
    const cx = (v[0] + v[1]) / 2, cy = (JAN_Y0 + JAN_Y1) / 2
    const pano = box(w - 0.06, h - 0.06, 0.04, M.vidro, cx, cy, fz + T / 2)
    pano.castShadow = false
    g.add(pano)
    g.add(box(w + 0.14, 0.14, T + 0.14, M.aco, cx, JAN_Y1 + 0.07, fz + T / 2 - 0.02))
    g.add(box(w + 0.14, 0.12, T + 0.14, M.aco, cx, JAN_Y0 - 0.06, fz + T / 2 - 0.02))
    // tres montantes por pano: a esquadria de showroom e alta e esbelta
    for (let i = 1; i <= 3; i++) {
      g.add(box(0.08, h, 0.10, M.aco, v[0] + (w / 4) * i, cy, fz - 0.02))
    }
    // travessa na altura da verga da porta, alinhando a fachada toda
    g.add(box(w, 0.06, 0.09, M.aco, cx, DH, fz - 0.02))
    // faixa adesiva azul no vidro, na altura do peito (o "jaleco" da vitrine)
    const faixa = box(w - 0.3, 0.22, 0.02, M.azul, cx, 1.55, fz + 0.02)
    faixa.castShadow = false
    g.add(faixa)
  }
  // porta de vidro de duas folhas, FIXA e aberta: por aqui entram os carros,
  // entao ela nao tem folha que feche o vao
  for (const s of [-1, 1]) {
    g.add(box(0.10, DH, 0.12, M.aco, B.door.center + s * (B.door.width / 2 - 0.05), DH / 2, fz + T / 2))
  }
  g.add(box(B.door.width + 0.3, 0.16, T + 0.16, M.aco, B.door.center, DH + 0.08, fz + T / 2))
}

/** Testeira azul com o nome, calha de luz e a bandeira de esquina. */
function letreiro(g) {
  const cx = (B.x0 + B.x1) / 2
  // testeira: a faixa cheia entre o topo do vidro e a platibanda
  g.add(box(B.x1 - B.x0 + 0.24, H - JAN_Y1 - 0.1, 0.26, M.azul, cx, (JAN_Y1 + H) / 2, B.z0 - 0.12))
  g.add(box(B.x1 - B.x0 + 0.30, 0.10, 0.34, M.aco, cx, JAN_Y1 + 0.06, B.z0 - 0.15))
  g.add(box(B.x1 - B.x0 + 0.30, 0.10, 0.34, M.aco, cx, H - 0.05, B.z0 - 0.15))

  const txt = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 0.98), textPlaneMat('GARAGEM DO NANDO', {
    w: 1024, h: 110, color: '#f2f8ff', font: 'bold 74px "Trebuchet MS", sans-serif',
    glow: '#9fd0ff', stroke: '#1d4478', emissiveIntensity: 1.35,
  }))
  txt.position.set(cx, (JAN_Y1 + H) / 2 + 0.08, B.z0 - 0.26)
  txt.rotation.y = Math.PI
  txt.castShadow = false
  g.add(txt)
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 0.34), textPlaneMat('CARROS  MOTOS  E  O  QUE  APARECER', {
    w: 1024, h: 64, color: '#bcd8f2', font: 'bold 40px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.6,
  }))
  sub.position.set(cx, JAN_Y1 + 0.42, B.z0 - 0.26)
  sub.rotation.y = Math.PI
  sub.castShadow = false
  g.add(sub)

  // dois tubos de neon correndo a testeira inteira
  for (const y of [JAN_Y1 + 0.18, H - 0.20]) {
    const n = box(B.x1 - B.x0 - 0.6, 0.07, 0.07, M.neon, cx, y, B.z0 - 0.28)
    n.castShadow = false
    g.add(n)
  }

  // marquise fina sobre a calcada, so pra dar sombra na vitrine
  g.add(box(B.x1 - B.x0 + 0.2, 0.18, 1.5, M.aco, cx, JAN_Y1 + 0.02, B.z0 - 0.82))
  for (const s of [-1, 1]) {
    const tir = box(0.06, 0.9, 0.06, M.aco, cx + s * 5.4, JAN_Y1 + 0.45, B.z0 - 0.30)
    tir.rotation.x = -0.62
    g.add(tir)
  }

  // bandeira vertical na quina oeste: e o que se le vindo pela rua do anel
  const bg = new THREE.Group()
  bg.position.set(B.x0 - 0.36, 0, B.z0 + 1.9)
  bg.add(box(0.20, 3.4, 1.7, M.azulEsc, 0, 4.3, 0))
  bg.add(box(0.26, 0.12, 1.8, M.aco, 0, 6.05, 0))
  bg.add(box(0.26, 0.12, 1.8, M.aco, 0, 2.58, 0))
  const vert = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.0), textPlaneMat('AUTOS', {
    w: 256, h: 512, color: '#eef6ff', font: 'bold 150px "Trebuchet MS", sans-serif',
    glow: '#3f8fe0', emissiveIntensity: 1.5,
  }))
  vert.position.set(-0.12, 4.3, 0)
  vert.rotation.y = -Math.PI / 2
  vert.castShadow = false
  bg.add(vert)
  g.add(bg)
}

/** Platibanda + telhado. Medidas do buildShell, pra neve.js acertar a faixa. */
function telhado(g) {
  const w = B.x1 - B.x0, d = B.z1 - B.z0
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2
  g.add(box(w + 0.7, 0.34, d + 0.7, solid(0x54585d, 0.95), cx, H + 0.17, cz))
  g.add(box(w + 0.5, 0.70, 0.34, M.azulEsc, cx, H + 0.69, B.z0 + 0.06))
  g.add(box(w + 0.5, 0.55, 0.34, M.aco, cx, H + 0.615, B.z1 - 0.06))
  g.add(box(0.34, 0.55, d + 0.5, M.aco, B.x0 + 0.06, H + 0.615, cz))
  g.add(box(0.34, 0.55, d + 0.5, M.aco, B.x1 - 0.06, H + 0.615, cz))
  // duas claraboias e um condensador: quebram a platibanda chapada
  for (const dx of [-3.4, 3.4]) {
    g.add(box(2.4, 0.34, 2.0, M.luz, cx + dx, H + 0.5, cz + 1.2))
    g.add(box(2.6, 0.12, 2.2, M.aco, cx + dx, H + 0.70, cz + 1.2))
  }
  if (typeof Props.makeAC === 'function') {
    let ac = null
    try { ac = Props.makeAC() } catch (err) { void err; ac = null }
    if (ac) {
      ac.userData.update = null
      ac.position.set(cx - 4.0, H + 0.34, B.z1 - 2.2)
      sombras(ac)
      g.add(ac)
    }
  }
}

/** Calcada da frente: vaga de entrega demarcada e dois totens de preco. */
function calcada(g, colliders) {
  const y = BASE + 0.012
  // a vaga onde o veiculo comprado aparece, pintada no chao
  const vx = VAGA_ENTREGA.x, vz = VAGA_ENTREGA.z
  const vaga = box(2.6, 0.016, 5.4, solid(0x8f8c86, 0.9), vx, y, vz)
  vaga.castShadow = false
  g.add(vaga)
  for (const s of [-1, 1]) {
    const l = box(0.10, 0.02, 5.4, M.amarelo, vx + s * 1.25, y + 0.004, vz)
    l.castShadow = false
    g.add(l)
  }
  const l2 = box(2.6, 0.02, 0.10, M.amarelo, vx, y + 0.004, vz - 2.65)
  l2.castShadow = false
  g.add(l2)
  const et = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), textPlaneMat('ENTREGA', {
    w: 512, h: 200, color: '#e8d68a', font: 'bold 110px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.15,
  }))
  et.rotation.x = -Math.PI / 2
  et.rotation.z = Math.PI
  et.position.set(vx, y + 0.02, vz + 1.9)
  et.castShadow = false
  g.add(et)

  // bandeirola? nao. Dois postes de bandeirinha na calcada seriam a mesma
  // coisa que o dono mandou tirar da frente do hotel. O que fica aqui e o que
  // uma loja de carro tem de util: um totem de preco e uma lixeira.
  const totem = new THREE.Group()
  totem.position.set(B.door.center - 5.2, BASE, B.z0 - 1.5)
  totem.add(box(0.7, 0.12, 0.5, M.grafite, 0, 0.06, 0))
  totem.add(box(0.14, 1.9, 0.14, M.aco, 0, 0.95, 0))
  totem.add(box(1.3, 1.5, 0.10, M.azulEsc, 0, 2.55, 0))
  totem.add(box(1.4, 0.09, 0.16, M.aco, 0, 3.34, 0))
  const tx = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.3), textPlaneMat('SEU CARRO AQUI', {
    w: 512, h: 580, color: '#eef6ff', font: 'bold 62px "Trebuchet MS", sans-serif',
    glow: '#3f8fe0', emissiveIntensity: 0.9,
  }))
  tx.position.set(0, 2.55, -0.06)
  tx.rotation.y = Math.PI
  tx.castShadow = false
  totem.add(tx)
  g.add(totem)
  colliders.push({
    minX: totem.position.x - 0.4, maxX: totem.position.x + 0.4,
    minZ: B.z0 - 1.8, maxZ: B.z0 - 1.2, tag: 'auto-totem',
  })
}

// ===========================================================================
// B. MIOLO — piso local em y = 0
// ===========================================================================

function piso(g) {
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.piso)
  p.position.set((IN.x0 + IN.x1) / 2, 0.005, (IN.z0 + IN.z1) / 2)
  g.add(p)

  // demarcacao amarela de cada vaga, no chao. E ela que faz o showroom ler
  // como showroom e nao como sala com carros dentro.
  for (const v of VAGAS) {
    if (v.palco || v.prato) continue
    const marca = new THREE.Group()
    marca.position.set(v.x, 0.012, v.z)
    marca.rotation.y = v.yaw
    for (const s of [-1, 1]) {
      const l = box(0.09, 0.014, 5.6, M.amarelo, s * 1.45, 0, 0)
      l.castShadow = false
      marca.add(l)
    }
    const t2 = box(2.9, 0.014, 0.09, M.amarelo, 0, 0, -2.8)
    t2.castShadow = false
    marca.add(t2)
    g.add(marca)
  }

  // faixa de circulacao: a linha que separa a area de exposicao do corredor
  const faixa = box(IN.x1 - IN.x0 - 0.6, 0.012, 0.10, M.amarelo, (IN.x0 + IN.x1) / 2, 0.012, -47.0)
  faixa.castShadow = false
  g.add(faixa)

  // rodape de concreto nas quatro paredes
  const R = 0.22
  g.add(box(IN.x1 - IN.x0, R, 0.06, M.concreto, (IN.x0 + IN.x1) / 2, R / 2, IN.z1 - 0.03))
  g.add(box(IN.x1 - IN.x0, R, 0.06, M.concreto, (IN.x0 + IN.x1) / 2, R / 2, IN.z0 + 0.03))
  for (const s of [-1, 1]) {
    g.add(box(0.06, R, IN.z1 - IN.z0, M.concreto,
      s > 0 ? IN.x1 - 0.03 : IN.x0 + 0.03, R / 2, (IN.z0 + IN.z1) / 2))
  }
}

/** Trelica metalica aparente, calhas de luz e as duas luzes de verdade. */
function forroELuz(g) {
  const cx = (IN.x0 + IN.x1) / 2, cz = (IN.z0 + IN.z1) / 2
  const t = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, solid(0x3d4249, 0.92), Math.PI / 2)
  t.position.set(cx, CEIL, cz)
  g.add(t)

  // TRELICA: quatro tesouras cruzando o vao. E o que da altura ao galpao —
  // forro liso a 6 m le como sala grande, trelica le como galpao.
  for (let i = 0; i < 4; i++) {
    const z = IN.z0 + 1.9 + i * 3.1
    g.add(box(IN.x1 - IN.x0, 0.14, 0.14, M.aco, cx, CEIL - 0.30, z))
    g.add(box(IN.x1 - IN.x0, 0.10, 0.10, M.aco, cx, CEIL - 0.92, z))
    for (let k = 0; k <= 8; k++) {
      const x = IN.x0 + 0.4 + k * ((IN.x1 - IN.x0 - 0.8) / 8)
      const dia = box(0.06, 0.72, 0.06, M.aco, x, CEIL - 0.61, z)
      dia.rotation.z = k % 2 ? 0.42 : -0.42
      g.add(dia)
    }
  }
  // longarinas ligando as tesouras
  for (const dx of [-4.4, 0, 4.4]) {
    g.add(box(0.08, 0.08, IN.z1 - IN.z0 - 1.0, M.aco, cx + dx, CEIL - 0.34, cz))
  }

  // calhas de luz penduradas: quatro barras compridas de emissivo
  for (let i = 0; i < 4; i++) {
    const z = IN.z0 + 2.4 + i * 3.0
    for (const dx of [-3.2, 3.2]) {
      const c = box(4.2, 0.12, 0.26, M.luz, cx + dx, CEIL - 1.10, z)
      c.castShadow = false
      g.add(c)
      g.add(box(4.3, 0.08, 0.34, M.aco, cx + dx, CEIL - 1.00, z))
      for (const s of [-1, 1]) {
        g.add(box(0.04, 0.62, 0.04, M.aco, cx + dx + s * 1.9, CEIL - 0.66, z))
      }
    }
  }

  // --- AS DUAS LUZES -------------------------------------------------------
  // Duas, e nao quatro: o numero de PointLight da cena entra no shader de todo
  // material do jogo (ver o mesmo paragrafo em world/hotel.js e o orcamento em
  // tools/smoke.mjs). O que enche este galpao de luz visual sao as oito calhas
  // emissivas la em cima; estas duas sao as que de fato poem luz na lataria dos
  // carros, que e a unica coisa aqui que precisa de brilho especular.
  for (const L of [
    { x: -21.0, y: 4.2, z: -43.4, i: 42 },   // as duas vagas da frente
    { x: -20.4, y: 4.0, z: -37.6, i: 34 },   // prato, balcao e o fundo
  ]) {
    const pl = new THREE.PointLight(0xeaf2ff, L.i, 22, 2)
    pl.position.set(L.x, L.y, L.z)
    pl.castShadow = false
    g.add(pl)
  }
}

/** Parede do fundo: painel do logo, prateleira de pecas e quadro de chaves. */
function fundo(g) {
  const pz = IN.z1 - 0.05
  const cx = (IN.x0 + IN.x1) / 2
  g.add(box(IN.x1 - IN.x0, CEIL - 0.4, 0.08, M.azulEsc, cx, (CEIL - 0.4) / 2, pz))
  g.add(box(IN.x1 - IN.x0, 0.10, 0.14, M.aco, cx, CEIL - 0.42, pz - 0.02))

  const logo = painel(6.4, 0.9, textPlaneMat('GARAGEM DO NANDO', {
    w: 1024, h: 140, color: '#eef6ff', font: 'bold 88px "Trebuchet MS", sans-serif',
    glow: '#3f8fe0', emissiveIntensity: 1.1,
  }), cx - 1.6, 3.5, pz - 0.06, Math.PI)
  g.add(logo)
  const desde = painel(3.0, 0.34, textPlaneMat('DESDE 1974', {
    w: 512, h: 80, color: '#9fc6e8', font: 'bold 52px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.4,
  }), cx - 1.6, 2.9, pz - 0.06, Math.PI)
  g.add(desde)

  // prateleira de pecas na parede oeste do fundo: pneus e latas
  const px = IN.x0 + 0.5
  for (let k = 0; k < 3; k++) {
    g.add(box(1.9, 0.06, 0.5, M.aco, px + 0.5, 0.6 + k * 0.75, pz - 0.32))
  }
  for (const s of [-1, 1]) {
    g.add(box(0.06, 2.3, 0.5, M.aco, px + 0.5 + s * 0.92, 1.2, pz - 0.32))
  }
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 4; i++) {
      const lata = cyl(0.10, 0.10, 0.24, i % 2 ? M.azul : M.amarelo, 10)
      lata.position.set(px - 0.14 + i * 0.42, 0.75 + k * 0.75, pz - 0.32)
      g.add(lata)
    }
  }
  // pilha de pneus no canto
  for (let i = 0; i < 4; i++) {
    const pn = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.14, 8, 18), solid(0x1b1d20, 0.96))
    pn.rotation.x = Math.PI / 2
    pn.position.set(IN.x0 + 0.9, 0.16 + i * 0.26, pz - 1.5)
    pn.rotation.z = i * 0.4
    g.add(pn)
  }
}

/** O balcao do Nando, no canto leste do fundo. */
function balcao(g, colliders) {
  const b = BALCAO
  const w = b.x1 - b.x0, d = b.z1 - b.z0
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
  g.add(box(w, 0.14, d, M.grafite, cx, 0.07, cz))
  g.add(box(w - 0.06, b.h - 0.14, d - 0.06, M.azulEsc, cx, 0.14 + (b.h - 0.14) / 2, cz))
  g.add(box(w - 0.5, 0.5, 0.03, M.azul, cx, 0.62, b.z0 - 0.02))
  g.add(box(w + 0.18, 0.08, d + 0.22, M.aco, cx, b.h + 0.04, cz))
  g.add(box(w + 0.22, 0.03, d + 0.26, M.amarelo, cx, b.h + 0.09, cz))
  colliders.push({
    minX: b.x0 - 0.1, maxX: b.x1 + 0.1,
    minZ: b.z0 - 0.14, maxZ: b.z1 + 0.14, tag: 'auto-balcao',
  })

  // computador velho de tubo, um telefone e um cinzeiro: mesa de vendedor
  g.add(box(0.36, 0.30, 0.32, solid(0xd6d2c4, 0.85), cx - 1.5, b.h + 0.23, cz))
  g.add(box(0.30, 0.22, 0.02, solid(0x2b3a44, 0.4), cx - 1.5, b.h + 0.24, cz - 0.17))
  g.add(box(0.40, 0.03, 0.16, solid(0xd6d2c4, 0.85), cx - 1.5, b.h + 0.09, cz - 0.34))
  g.add(box(0.22, 0.09, 0.20, M.grafite, cx + 1.4, b.h + 0.12, cz))
  g.add(cyl(0.09, 0.10, 0.05, M.aco, 12).translateX(cx + 0.7).translateY(b.h + 0.10).translateZ(cz - 0.1))

  // quadro de chaves atras do balcao
  const kz = IN.z1 - 0.14
  g.add(box(1.5, 0.9, 0.05, M.grafite, cx, 1.95, kz))
  for (let i = 0; i < 5; i++) {
    for (let k = 0; k < 2; k++) {
      const ch = box(0.02, 0.11, 0.012, M.amarelo, cx - 0.56 + i * 0.28, 2.18 - k * 0.4, kz - 0.035)
      ch.castShadow = false
      g.add(ch)
    }
  }
  const plq = painel(1.3, 0.16, textPlaneMat('CHAVES', {
    w: 512, h: 90, color: '#e8d68a', font: 'bold 62px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.3,
  }), cx, 2.48, kz - 0.04, Math.PI)
  g.add(plq)
}

/**
 * O prato giratorio e o palco do skate.
 *
 * O prato gira de verdade (0,25 rad/s, uma volta a cada 25 s). E o unico
 * update por quadro deste predio e ele existe porque prato giratorio parado e
 * so um degrau redondo: o giro e a coisa inteira.
 */
function palcos(g, colliders) {
  const v = VAGAS.find((x) => x.prato)
  const prato = new THREE.Group()
  prato.position.set(v.x, 0, v.z)
  prato.userData.dynamic = true
  const disco = cyl(2.3, 2.35, 0.22, M.grafite, 40)
  disco.position.y = 0.11
  prato.add(disco)
  const tampo = cyl(2.24, 2.24, 0.03, M.aco, 40)
  tampo.position.y = 0.23
  prato.add(tampo)
  // aro de luz na borda: o prato tem que se ler como palco, nao como caixote
  const aro = new THREE.Mesh(new THREE.TorusGeometry(2.32, 0.05, 8, 40), M.neon)
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.20
  aro.castShadow = false
  prato.add(aro)
  // marca de referencia no tampo, pra dar pra VER que ele esta girando
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const m = box(0.10, 0.02, 0.9, M.azul, Math.sin(a) * 1.5, 0.245, Math.cos(a) * 1.5)
    m.rotation.y = a
    m.castShadow = false
    prato.add(m)
  }
  g.add(prato)
  colliders.push({ minX: v.x - 2.4, maxX: v.x + 2.4, minZ: v.z - 2.4, maxZ: v.z + 2.4, tag: 'auto-prato' })

  // palco do skate: pedestal quadrado com vitrine de acrilico
  const s = VAGAS.find((x) => x.palco)
  const ped = new THREE.Group()
  ped.position.set(s.x, 0, s.z)
  ped.add(box(1.5, s.palco, 1.5, M.azulEsc, 0, s.palco / 2, 0))
  ped.add(box(1.62, 0.05, 1.62, M.aco, 0, s.palco + 0.02, 0))
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ped.add(box(0.05, 1.5, 0.05, M.aco, dx * 0.7, s.palco + 0.78, dz * 0.7))
  }
  ped.add(box(1.5, 0.06, 1.5, M.aco, 0, s.palco + 1.55, 0))
  for (const [dx, dz, ry] of [[0, -0.74, 0], [0, 0.74, 0], [-0.74, 0, Math.PI / 2], [0.74, 0, Math.PI / 2]]) {
    const p = box(1.42, 1.44, 0.02, M.vidro, dx, s.palco + 0.78, dz)
    p.rotation.y = ry
    p.castShadow = false
    ped.add(p)
  }
  g.add(ped)
  colliders.push({ minX: s.x - 0.85, maxX: s.x + 0.85, minZ: s.z - 0.85, maxZ: s.z + 0.85, tag: 'auto-palco' })

  // DEVOLVE o prato. A referencia continua valendo depois do forno: bakeStatic
  // preserva a subarvore marcada como dinamica e so a reparenteia mantendo a
  // pose, entao o objeto e o mesmo. Sair cacando ele em dentro.children por
  // heuristica ("o dinamico que tem mais de tres filhos") era pedir pra quebrar
  // no dia em que outra peca do showroom virar dinamica.
  return prato
}

/** Um cavalete de preco ao lado de cada vaga. */
function cavaletes(g, itens) {
  for (const v of VAGAS) {
    const it = itens.find((i) => i.chave === v.chave)
    if (!it) continue
    const cav = new THREE.Group()
    // sempre do lado leste da vaga, na diagonal do capo: e onde quem entra ve
    cav.position.set(v.x + v.r + 0.55, 0, v.z - 1.2)
    cav.rotation.y = -0.5
    cav.add(box(0.5, 0.08, 0.4, M.grafite, 0, 0.04, 0))
    cav.add(box(0.07, 1.0, 0.07, M.aco, 0, 0.55, 0))
    cav.add(box(0.86, 0.62, 0.06, solid(0xf2f2ee, 0.85), 0, 1.32, 0))
    cav.add(box(0.92, 0.07, 0.10, M.azul, 0, 1.66, 0))
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.5), textPlaneMat(it.nome + '\n' + it.preco, {
      w: 512, h: 330, color: '#1d2530', font: 'bold 58px "Trebuchet MS", sans-serif',
      emissiveIntensity: 0.05,
    }))
    t.position.set(0, 1.32, -0.035)
    t.rotation.y = Math.PI
    t.castShadow = false
    cav.add(t)
    sombras(cav)
    g.add(cav)
  }
}

/**
 * NANDO, o dono.
 *
 * Aparencia enxuta pelo mesmo motivo da Iris e da Wanda: acessorio e a
 * diferenca entre 15 e 65 meshes por NPC. O que ele ganha e um colete de
 * oficina por cima da roupa, que e pano so.
 */
function criarNando(g, colliders) {
  let npc = null
  try {
    npc = createNPC({
      name: 'Nando',
      pose: 'work',
      x: NANDO.x, y: 0, z: NANDO.z,
      rotY: Math.PI,              // a fachada e a z0: quem entra vem do -Z
      shirt: 0x2f6fbf,
      pants: 0x2a2f36,
      shoes: 0x1a1d22,
      appearance: {
        cabeca: 4, olhos: 3, nariz: 0, boca: 6, barba: 2,
        cabelo: 4, pele: 5, corCabelo: 8, corBarba: 0, sobrancelha: 2,
        chapeu: 0, calcado: 1, blusa: 1, calca: 1,
      },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

  const colete = new THREE.Group()
  colete.add(box(0.42, 0.44, 0.27, solid(0x1d4478, 0.95), 0, 1.15, 0.005))
  colete.add(box(0.44, 0.05, 0.28, solid(0xd9b23a, 0.7), 0, 1.02, 0.006))
  colete.add(box(0.44, 0.05, 0.28, solid(0xd9b23a, 0.7), 0, 0.90, 0.006))
  const cracha = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05), textPlaneMat('NANDO', {
    w: 128, h: 52, color: '#eef6ff', font: 'bold 30px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.12,
  }))
  cracha.position.set(-0.10, 1.25, 0.140)
  cracha.castShadow = false
  colete.add(cracha)
  root.add(colete)
  g.add(root)

  if (npc.character && npc.character.parts) {
    congelarPersonagem(root, { juntas: npc.character.parts })
  }
  colliders.push({
    minX: NANDO.x - 0.3, maxX: NANDO.x + 0.3,
    minZ: NANDO.z - 0.3, maxZ: NANDO.z + 0.3, tag: 'auto-vendedor',
  })
  return npc
}

// ===========================================================================
// MONTAGEM
// ===========================================================================
export function buildConcessionaria(game) {
  const group = new THREE.Group()
  group.name = 'auto'
  const colliders = []
  const occluders = []
  const interactables = []

  void game
  // Os cavaletes de preco leem o MESMO CATALOGO_AUTO que a janela da loja usa.
  // Uma segunda lista aqui (foi o primeiro esboco) e a receita para o cavalete
  // dizer 2.800 e a loja cobrar 3.100 depois de um ajuste de preco.
  const itens = CATALOGO_AUTO.map((m) => ({
    chave: m.id,
    nome: m.nome.toUpperCase(),
    preco: 'R$ ' + String(m.preco).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
  }))

  // --- casca -------------------------------------------------------------
  const casca = new THREE.Group()
  casca.name = 'auto-casca'
  moldura(casca)
  paredes(casca, colliders, occluders)
  calcada(casca, colliders)

  const enfeite = new THREE.Group()
  enfeite.name = 'auto-enfeite'
  vitrines(enfeite)
  letreiro(enfeite)
  telhado(enfeite)
  semSombra(enfeite)
  casca.add(enfeite)
  group.add(casca)

  // --- miolo -------------------------------------------------------------
  const dentro = new THREE.Group()
  dentro.name = 'auto-showroom'
  dentro.position.y = BASE
  piso(dentro)
  forroELuz(dentro)
  fundo(dentro)
  balcao(dentro, colliders)
  const prato = palcos(dentro, colliders)
  cavaletes(dentro, itens)
  const npc = criarNando(dentro, colliders)
  // Como no hotel: quem acende o showroom sao duas PointLight que nao projetam
  // sombra, entao o miolo inteiro pode sair do mapa do sol.
  semSombra(dentro)
  group.add(dentro)

  console.info('auto casca:', bakeStatic(casca))
  console.info('auto showroom:', bakeStatic(dentro))

  // --- exposicao: os veiculos de verdade ----------------------------------
  // Entram DEPOIS do forno e num grupo proprio, porque cada `construir()` ja
  // assa o proprio modelo — passar de novo pelo bakeStatic daqui fundiria as
  // rodas na lataria e mataria o prato giratorio junto.
  const exposicao = new THREE.Group()
  exposicao.name = 'auto-exposicao'
  exposicao.position.y = BASE
  group.add(exposicao)

  const MODELOS = import.meta.glob('../veiculos/*.js')
  for (const v of VAGAS) {
    const carregar = MODELOS['../veiculos/' + v.chave + '.js']
    if (!carregar) continue
    carregar().then((mod) => {
      if (!mod || typeof mod.construir !== 'function') return
      let m = null
      try { m = mod.construir() } catch (err) { void err; return }
      if (!m || !m.grupo) return
      m.grupo.position.set(v.x, v.palco ? v.palco + 0.05 : (v.prato ? 0.245 : 0), v.z)
      m.grupo.rotation.y = v.yaw
      if (v.prato && prato) {
        // no prato, o veiculo vira FILHO dele: assim gira junto de graca
        m.grupo.position.set(0, 0.245, 0)
        m.grupo.rotation.y = 0
        prato.add(m.grupo)
      } else {
        exposicao.add(m.grupo)
      }
    }).catch(() => {})
    // colisor da vaga, pra ninguem andar dentro do carro em exposicao
    if (!v.prato && !v.palco) {
      colliders.push({
        minX: v.x - v.r * 0.5, maxX: v.x + v.r * 0.5,
        minZ: v.z - 2.4, maxZ: v.z + 2.4, tag: 'auto-vaga',
      })
    }
  }

  // --- pontos de interacao -----------------------------------------------
  const abrir = (chave) => (gm) => {
    if (gm && gm.autoLoja && typeof gm.autoLoja.abrir === 'function') gm.autoLoja.abrir(chave)
    else if (gm) gm.toast('Nando: da uma olhada a vontade.')
  }
  interactables.push({
    id: 'auto-balcao',
    position: new THREE.Vector3(NANDO.x, BASE + 1.05, BALCAO.z0 - 0.9),
    radius: 2.4,
    label: 'Falar com o Nando',
    onInteract: abrir(null),
  })
  const ROTULO = {
    carro: 'Ver o carro', caminhonete: 'Ver a caminhonete',
    moto: 'Ver a moto', skate: 'Ver o skate',
  }
  for (const v of VAGAS) {
    interactables.push({
      id: 'auto-' + v.chave,
      position: new THREE.Vector3(v.x, BASE + 1.0, v.z - (v.prato ? 2.7 : 3.0)),
      radius: 2.2,
      label: ROTULO[v.chave] || 'Ver',
      onInteract: abrir(v.chave),
    })
  }

  // -------------------------------------------------------------------------
  // ANIMACAO
  // -------------------------------------------------------------------------
  const LOD2 = 52 * 52
  let ligado = true
  let lookObj = null
  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    const p = gm && gm.player && gm.player.position
    if (p) {
      const dx = p.x - B.door.center, dz = p.z - B.z0
      const perto = dx * dx + dz * dz < LOD2
      if (perto !== ligado) {
        ligado = perto
        dentro.visible = perto
        exposicao.visible = perto
      }
    }
    if (!ligado) return
    // uma volta a cada 25 s
    if (prato) prato.rotation.y += d * 0.25
    if (!npc) return
    if (p) {
      const ddx = p.x - NANDO.x, ddz = p.z - NANDO.z
      if (ddx * ddx + ddz * ddz < 64) {
        const a = alvoDoOlhar(gm)
        if (a) npc.lookTarget = a
      } else if (npc.lookTarget) {
        npc.lookTarget = null
      }
    }
    if (typeof npc.update === 'function') npc.update(d)
  }

  return { group, colliders, interactables, occluders, update }
}

export default buildConcessionaria
