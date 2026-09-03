import * as THREE from 'three'
import { CASINO, interiorOf, apronOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import {
  PALETTE, stdMat, solid, emissive, glass, box, cyl, sphere, plane, roundedBox,
  concreteTex, plasterTex, textPlaneMat, tex,
} from './materials.js'
import * as Props from './props.js'
import { createNPC, POSES } from '../npc/npc.js'
import { HIPS_Y } from '../player/character.js'
import { congelarPersonagem } from '../player/congelar.js'
import { SIMBOLOS as SIM_SLOT, PAGAMENTOS } from '../cassino/slots.js'
import { buildCasinoBar } from './casino-bar.js'
import { buildCasinoCozinha } from './casino-cozinha.js'

// ---------------------------------------------------------------------------
// CASSINO ESTRELA — o unico predio do mapa que traz a PROPRIA casca.
//
// Por que a casca mora aqui e nao no buildShell de city.js: aquela funcao so
// sabe desenhar uma loja com a fachada virada pra +Z (vitrine, toldo listrado,
// letreiro chapado). O cassino olha pra -Z (a rua principal esta ao NORTE
// dele) e precisa de marquise, neon, tapete vermelho e uma estrela no telhado.
// Fazer isso por parametro em city.js dobraria o tamanho daquela funcao pra
// atender um caso so; aqui a casca e o miolo nascem juntos e conversam
// (a marquise por fora e a mesma corrida de lampadas da moldura das
// caca-niqueis por dentro, compartilhando os mesmos 3 materiais).
//
// Planta do miolo (X 14.3..33.7, Z 12.3..29.7 — 19.4 m x 17.4 m):
//
//   z=29.7  [============= BAR no fundo =============]
//   z=28                banquetas
//   z=25     ( BLACKJACK )              [ POKER ]
//   z=22       atendente em pe           ricaco sentado
//   z=19     |S|
//   z=17     |S|  (3 caca-niqueis na parede oeste)     [ CAIXA em L ]
//   z=15     |S|
//   z=12.3   ----------- porta (x=24) -----------
//
// ---------------------------------------------------------------------------

const B = CASINO
const IN = interiorOf(B)
const T = WALL_T
const H = B.wallHeight                 // 6.2 — pe-direito de cassino
const BASE = LEVELS.SHOP_FLOOR         // 0.16
const CEIL = H - BASE                  // 6.04 local = 6.2 no mundo
const PAD = 0.9                        // MESMO avental do SHOP_PAD de city.js
const AV = apronOf(B, PAD)             // apronOf sabe que a fachada e a z0
const DL = B.door.center - B.door.width / 2   // 22.3
const DR = B.door.center + B.door.width / 2   // 25.7
const DH = B.door.height                      // 3.4

// A calcada da frente tem uma conifera plantada em (22, 9.4) pelo city.js (a
// lista streetTrees). Ela sobe 7~10 m bem na diagonal da porta, entao a
// marquise para em z=10.7 e as colunas ficam coladas na fachada: mais fundo
// que isso e um galho atravessa a lona. Nao da pra mexer na arvore daqui.
const MQ = { x0: 20.6, x1: 27.4, z0: 10.7, z1: 12.0, y0: 4.50, y1: 5.06 }

// --- moveis do miolo (XZ em coordenadas de MUNDO, Y local com piso em 0) ---
const CX = { x0: 27.2, x1: 32.4, z0: 14.6, z1: 15.5, h: 1.12 }   // caixa, bancada
const CXL = { x0: 31.5, x1: 32.4, z0: 15.5, z1: 18.3 }           // perna do L
const CX_NPC = { x: 29.5, z: 16.5 }

const BJ = { x: 20.0, z: 24.2, r: 1.75 }   // z = a CORDA reta (lado da atendente)
const BJ_NPC = { x: 20.0, z: 25.05 }

const PK = { x: 28.8, z: 23.2, rx: 1.55, rz: 1.05 }
const PK_NPC = { x: 28.8, z: 24.72 }       // ricaco sentado
const PK_VAZIA = { x: 28.8, z: 21.68 }     // cadeira do jogador

// Caca-niqueis encostadas na parede oeste, viradas pra +X (rotY = +PI/2).
const SLOT_D = 0.86, SLOT_W = 1.16
const SLOT_X = IN.x0 + SLOT_D / 2          // 14.73 — costas no reboco
// Passo de 1.6 m, nao a largura do gabinete (1.16) mais uma folga qualquer: a
// alavanca sai 0.90 m do EIXO da maquina (fazCacaNiquel poe a bola em x local
// 0.82 + raio 0.075) e a maquina esta girada, entao esse braco aponta pro
// vizinho de Z menor. Com passo de 1.3 as bolas vermelhas das duas ultimas
// maquinas nasciam DENTRO da travessa dourada da maquina do lado, escondidas
// atras da chapa dela. 1.6 - 0.60 (meia travessa) = 1.00 > 0.90: sobra folga.
const SLOT_Z = [15.9, 17.5, 19.1]

const BAR = { x0: 17.4, x1: 25.6, z0: 28.55, z1: 29.40, h: 1.16 }

// Assento das cadeiras de poker. A altura REAL do quadril na pose 'sit' vem do
// personagem (barbershop.js aprendeu na marra que hardcodar isso quebra quando
// o esqueleto muda de proporcao).
const CAD_TOPO = 0.47                                     // topo da almofada
const SIT_HIP = HIPS_Y + (POSES.sit ? POSES.sit.rootY : 0)
const SIT_LIFT = CAD_TOPO + 0.052 - (SIT_HIP - 0.011)     // coxa pousada no assento

// ROLETES. A tabela de simbolos NAO e escrita aqui: ela vem de cassino/slots.js
// (logica pura, sem three nem DOM), que e quem sorteia e quem paga. girarMaquina
// recebe INDICES dessa lista, entao ter uma segunda lista neste arquivo faria a
// maquina parar num desenho e o caixa pagar por outro no dia em que alguem
// mexesse numa das duas. Ate a cor de cada simbolo sai de la.
const N_SIM = SIM_SLOT.length          // 7
// Raio e comprimento escolhidos JUNTO com o canvas (ver roleteTex): a celula
// quadrada de 256 px cobre 0.230 m de arco por 0.24 m de eixo, entao a
// densidade de textel sai igual nos dois sentidos e o simbolo nao estica.
const ROL_R = 0.256
const ROL_L = 0.24
const VEL_ROL = 15.0        // rad/s com o tambor solto
const FREIO = 0.45          // segundos do ultimo empurrao ate parar
const PARAR_EM = [0.65, 1.00, 1.35]   // + FREIO = 1.8 s no ultimo rolete

// ---------------------------------------------------------------------------
// Cache local de texturas com repeat proprio. Mesmo truque do city.js: um
// CanvasTexture cru vale por muitos materiais, o que muda e a densidade.
// ---------------------------------------------------------------------------
const _tiled = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx.toFixed(2) + ':' + ry.toFixed(2)
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

/** Caminho de estrela de N pontas centrado na origem do contexto 2D. */
function estrelaPath(g, cx, cy, r, pontas, k) {
  const p = pontas || 5
  const kk = k === undefined ? 0.42 : k
  g.beginPath()
  for (let i = 0; i < p * 2; i++) {
    const rr = i % 2 ? r * kk : r
    const a = -Math.PI / 2 + (i * Math.PI) / p
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  }
  g.closePath()
}

function retArredondado(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}

// ---------------------------------------------------------------------------
// Texturas procedurais do modulo
// ---------------------------------------------------------------------------

/** Carpete de cassino: bordo profundo, trelica dourada e estrelas. */
function carpeteTex(repeat) {
  return tex('casino-carpete', 256, (g, s) => {
    g.fillStyle = '#4a1020'; g.fillRect(0, 0, s, s)
    // manchas de tom: carpete chapado le como plastico
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(120,26,52,' + (Math.random() * 0.20) + ')'
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 6 + Math.random() * 26, 0, 7); g.fill()
    }
    // losangos dourados na diagonal
    g.strokeStyle = 'rgba(196,152,58,0.55)'; g.lineWidth = 3
    for (let i = -2; i <= 6; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + s, s); g.stroke()
      g.beginPath(); g.moveTo(i * 64, s); g.lineTo(i * 64 + s, 0); g.stroke()
    }
    // estrela no centro de cada losango
    g.fillStyle = 'rgba(214,172,72,0.85)'
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        estrelaPath(g, 32 + x * 64, 32 + y * 64, 13, 5, 0.44)
        g.fill()
      }
    }
    // fiapo do carpete
    const img = g.getImageData(0, 0, s, s)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 26
      d[i] += n; d[i + 1] += n; d[i + 2] += n
    }
    g.putImageData(img, 0, 0)
  }, repeat)
}

/** Revestimento das paredes internas: damasco vinho com filete dourado. */
function damascoTex(repeat) {
  return tex('casino-damasco', 256, (g, s) => {
    g.fillStyle = '#3b1020'; g.fillRect(0, 0, s, s)
    // listras verticais alternando brilho (papel de parede de sala de jogo)
    for (let x = 0; x < s; x += 32) {
      g.fillStyle = 'rgba(90,24,44,0.55)'
      g.fillRect(x, 0, 16, s)
    }
    // ornamento: losango com ponta, repetido em duas fileiras deslocadas
    g.strokeStyle = 'rgba(180,138,58,0.42)'; g.lineWidth = 2.4
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const cx = 64 + c * 128 + r * 64, cy = 64 + r * 128
        g.beginPath()
        g.moveTo(cx, cy - 34); g.quadraticCurveTo(cx + 30, cy, cx, cy + 34)
        g.quadraticCurveTo(cx - 30, cy, cx, cy - 34)
        g.stroke()
        estrelaPath(g, cx, cy, 9, 4, 0.32)
        g.stroke()
      }
    }
    const img = g.getImageData(0, 0, s, s)
    const d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 16
      d[i] += n; d[i + 1] += n; d[i + 2] += n
    }
    g.putImageData(img, 0, 0)
  }, repeat)
}

/** Cor de um simbolo, na paleta unica de cassino/slots.js. */
function corSim(id, mul) {
  const s = SIM_SLOT.find((x) => x.id === id)
  const c = new THREE.Color(s ? s.cor : 0xffffff)
  if (mul && mul !== 1) c.multiplyScalar(mul)
  return '#' + c.getHexString()
}

/**
 * Fita de simbolos do rolete: uma celula de 256x256 por simbolo de SIM_SLOT.
 *
 * A ORIENTACAO e o pulo do gato. O tambor e um cilindro com o eixo deitado no
 * X, entao na face que o jogador ve o "u" da textura (que da a volta na
 * circunferencia) sobe na tela e o "v" (que corre ao longo do eixo) anda pra
 * ESQUERDA. Um simbolo desenhado normalmente sairia tombado 90 graus. Por isso
 * cada celula e desenhada com um rotate(PI/2): assim o "pra cima" do desenho
 * cai no +x do canvas, que e exatamente o que a superficie mostra como cima.
 */
let _roleteTex = null
function roleteTex() {
  if (_roleteTex) return _roleteTex
  const cel = 256
  const c = document.createElement('canvas')
  c.width = cel * N_SIM
  c.height = cel
  const g = c.getContext('2d')
  for (let i = 0; i < N_SIM; i++) {
    const x0 = i * cel
    g.fillStyle = i % 2 ? '#f6f1e3' : '#fffdf6'
    g.fillRect(x0, 0, cel, cel)
    // linha de emenda entre uma parada e a outra
    g.fillStyle = 'rgba(70,58,44,0.35)'
    g.fillRect(x0, 0, 4, cel)
    g.save()
    g.translate(x0 + cel / 2, cel / 2)
    g.rotate(Math.PI / 2)
    desenharSimbolo(g, SIM_SLOT[i].id)
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping        // o tambor da a volta: u tem que repetir
  t.wrapT = THREE.ClampToEdgeWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  _roleteTex = t
  return t
}

/**
 * Desenha UM simbolo numa area de 256x256 centrada na origem do contexto.
 * Recebe o ID (nao o indice) justamente pra sobreviver a uma reordenacao da
 * tabela de cassino/slots.js sem trocar um desenho pelo outro.
 */
function desenharSimbolo(g, id) {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (id === 'sete') {
    g.font = 'bold 200px "Trebuchet MS", sans-serif'
    g.fillStyle = corSim('sete'); g.fillText('7', 0, 8)
    g.lineWidth = 7; g.strokeStyle = corSim('sete', 0.5); g.strokeText('7', 0, 8)
  } else if (id === 'cereja') {
    g.strokeStyle = '#3f7a2c'; g.lineWidth = 11
    g.beginPath(); g.moveTo(-46, 34); g.quadraticCurveTo(6, -60, 44, -84); g.stroke()
    g.beginPath(); g.moveTo(44, 30); g.quadraticCurveTo(46, -40, 44, -84); g.stroke()
    for (const p of [[-52, 44, 46], [46, 44, 42]]) {
      g.fillStyle = corSim('cereja')
      g.beginPath(); g.arc(p[0], p[1], p[2], 0, 7); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.45)'
      g.beginPath(); g.arc(p[0] - p[2] * 0.3, p[1] - p[2] * 0.35, p[2] * 0.22, 0, 7); g.fill()
    }
  } else if (id === 'limao') {
    g.fillStyle = corSim('limao')
    g.beginPath(); g.ellipse(0, 12, 92, 62, 0, 0, 7); g.fill()
    g.strokeStyle = corSim('limao', 0.55); g.lineWidth = 8; g.stroke()
    // bicos das duas pontas: sem eles o limao le como uma bola amarela
    g.fillStyle = corSim('limao', 0.8)
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(s * 88, 12); g.quadraticCurveTo(s * 116, 12, s * 122, 12)
      g.quadraticCurveTo(s * 108, 34, s * 84, 34); g.closePath(); g.fill()
    }
    g.fillStyle = 'rgba(255,255,255,0.42)'
    g.beginPath(); g.ellipse(-28, -12, 30, 16, -0.4, 0, 7); g.fill()
    g.strokeStyle = '#4f7a1c'; g.lineWidth = 10
    g.beginPath(); g.moveTo(0, -46); g.lineTo(14, -84); g.stroke()
  } else if (id === 'sino') {
    g.fillStyle = corSim('sino')
    g.beginPath()
    g.moveTo(-74, 46); g.quadraticCurveTo(-62, -66, 0, -78)
    g.quadraticCurveTo(62, -66, 74, 46); g.closePath(); g.fill()
    g.fillStyle = corSim('sino', 0.72); g.fillRect(-84, 46, 168, 22)
    g.beginPath(); g.arc(0, 80, 20, 0, 7); g.fill()
    g.fillStyle = 'rgba(255,255,255,0.4)'
    g.beginPath(); g.ellipse(-30, -14, 12, 34, 0.2, 0, 7); g.fill()
  } else if (id === 'ferradura') {
    // U aberto pra cima: arco grosso + duas pernas retas + os furos do prego
    g.strokeStyle = corSim('ferradura'); g.lineWidth = 40
    g.beginPath(); g.arc(0, 6, 62, Math.PI * 0.06, Math.PI * 0.94); g.stroke()
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(s * 62, 0); g.lineTo(s * 62, -66); g.stroke()
    }
    g.strokeStyle = corSim('ferradura', 0.55); g.lineWidth = 6
    g.beginPath(); g.arc(0, 6, 62, Math.PI * 0.06, Math.PI * 0.94); g.stroke()
    g.fillStyle = '#2c3035'
    for (const p of [[-62, -44], [-46, 40], [0, 66], [46, 40], [62, -44]]) {
      g.beginPath(); g.arc(p[0], p[1], 8, 0, 7); g.fill()
    }
  } else if (id === 'estrela') {
    g.fillStyle = corSim('estrela')
    estrelaPath(g, 0, 4, 96, 5, 0.44); g.fill()
    g.lineWidth = 8; g.strokeStyle = corSim('estrela', 0.55); g.stroke()
  } else if (id === 'diamante') {
    g.fillStyle = corSim('diamante')
    g.beginPath()
    g.moveTo(0, -88); g.lineTo(84, -8); g.lineTo(0, 92); g.lineTo(-84, -8)
    g.closePath(); g.fill()
    g.strokeStyle = corSim('diamante', 0.45); g.lineWidth = 7; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5
    g.beginPath(); g.moveTo(-84, -8); g.lineTo(84, -8); g.stroke()
    g.beginPath(); g.moveTo(-40, -46); g.lineTo(0, 92); g.stroke()
    g.beginPath(); g.moveTo(40, -46); g.lineTo(0, 92); g.stroke()
  } else {
    // Simbolo novo na tabela sem desenho aqui: cai numa placa com o nome em
    // vez de sumir. Assim quem mexeu em slots.js VE o que falta.
    g.fillStyle = '#17171b'; retArredondado(g, -108, -44, 216, 88, 14); g.fill()
    g.fillStyle = '#e8dfc8'
    g.font = 'bold 62px "Trebuchet MS", sans-serif'
    g.fillText(String(id).toUpperCase(), 0, 4, 196)
  }
}

// --- A TINTA DO PANO -------------------------------------------------------
//
// A regra impressa no feltro e TINTA, e tinta nao emite luz. O que vinha antes
// (#f0e4b8, #cfe0f5) tinha ~0,75 de luminancia LINEAR; multiplicada pela luz
// que chega na mesa isso saia da cena com radiancia ~1,5, quase o dobro do
// threshold do UnrealBloomPass (0.85, em core/engine.js) — por isso as letras
// apareciam brancas chapadas e com halo, lendo como letreiro de neon deitado
// no pano em vez de serigrafia.
//
// Estas duas cores tem ~0,33 de luminancia linear: 0,42 do que era. Com a luz
// do salao um degrau mais baixa (ver as duas PointLight la embaixo) a letra sai
// por volta de 0,45 de radiancia — folgadamente ABAIXO do threshold, entao o
// bloom nao encosta nela, e ainda 3 a 4 vezes mais clara que o pano em volta,
// que e o contraste que faz texto impresso ser legivel.
//
// O threshold do bloom NAO e o lugar de consertar isto: ele e global e vale
// tambem pros letreiros da cidade.
const TINTA_CREME = '#a89a6d'    // mesa verde (blackjack)
const TINTA_AZUL = '#8f9bb0'     // mesa azul (poker)
// Um fio de emissivo so pra a letra nao sumir na parte do pano que ja caiu pro
// escuro. 0.12 era o suficiente pra ela acender sozinha no canto sem luz.
const TINTA_EMI = 0.03

// ---------------------------------------------------------------------------
// Materiais do modulo. Getters porque assim a textura so e gerada se a peca
// que a usa realmente for construida (e stdMat/solid ja cacheiam por chave).
// ---------------------------------------------------------------------------
const M = {
  // O carpete e o degrau do salao. Ele e a maior superficie do cassino e e ele
  // que cerca as duas mesas: com `color` em branco puro o chao vermelho-e-ouro
  // saia mais claro que o pano das mesas, e o olho ia pro carpete em vez de ir
  // pra mesa. 0xdedada tira ~22% da luminancia LINEAR (o corte em sRGB parece
  // menor do que e) sem trocar a cor — o suficiente pra a mesa ganhar do chao
  // e pouco o bastante pra quem so atravessa o salao continuar enxergando o
  // caminho, que era a outra metade do pedido.
  get carpete() {
    return stdMat('casino-carpete', {
      map: carpeteTex(9), roughness: 0.96, metalness: 0.0, color: 0xdedada,
    })
  },
  get passadeira() { return solid(0x8c1224, 0.95) },
  get tapete() { return solid(0x9d1526, 0.95) },
  get ouro() { return solid(0xd8ab3e, 0.26, 0.85) },
  get ouroFosco() { return solid(0xb08528, 0.48, 0.6) },
  get ouroEscuro() { return solid(0x6f5217, 0.55, 0.5) },
  get cromo() { return solid(PALETTE.chrome, 0.22, 0.9) },
  get preto() { return solid(0x16161b, 0.72, 0.1) },
  get pretoLuz() { return solid(0x0d0d11, 0.5, 0.25) },
  get grafite() { return solid(0x24242c, 0.62, 0.2) },
  get vinho() { return solid(0x5a1626, 0.85) },
  get veludo() { return solid(0x7c1226, 0.96) },
  get couro() { return solid(0x3a1b1f, 0.5, 0.05) },
  // O POCO DE LUZ DAS MESAS MORA AQUI, NO MAP — nao numa luz.
  //
  // Nao da pra acender um foco em cima da mesa: a contagem de luzes VISIVEIS
  // define o programa de shader de todo material da cena e uma luz nova
  // recompilaria o cassino no meio da jogada (a regra esta no cabecalho de
  // cassino/mesa-3d.js). E mesmo que desse, nao adiantaria: de uma luz a 3 m de
  // altura, a borda de uma mesa de 3 m esta a 3,1 m e o centro a 3,0 — o
  // inverso do quadrado devolve MENOS de 5% de diferenca. Foi por isso que o
  // pano ficou com a mesma luz de ponta a ponta ate agora. Pra o pano ter
  // centro quente e borda caindo pro escuro a queda tem que estar PINTADA nele.
  //
  // O map ja carrega as tres coisas de uma vez e por isso nao custa nem um
  // draw call a mais: o degrade do poco, a fibra do pano (feltro nao e uma cor
  // lisa; sem o ruido o tampo lia como plastico) e a vinheta da borda — que
  // aqui e o MESMO degrade, e nao um plano preto com MultiplyBlending por cima,
  // que seria mais um mesh na fila de transparencia entre as fichas e a mesa.
  //
  // O centro do degrade nao e o centro da textura nas duas mesas: a UV da tampa
  // de um CylinderGeometry e u = (z/r)/2 + 0.5 e v = (x/r)/2 + 0.5, entao no
  // blackjack — que e MEIO cilindro com a corda (o lado da atendente) em z=0 e o
  // arco indo pro -Z — o meio do PANO JOGAVEL, que e onde as cartas caem, esta
  // em z = -0.7 e cai em u = 0.31, nao em 0.5. Com o degrade em 0.5 o poco
  // nascia debaixo da atendente e o lugar dos jogadores ficava na sombra.
  //
  // O raio do poco e menor no blackjack (0.25 contra 0.34) porque a camera da
  // mesa desce a 1,7 m do centro e enche a tela com um metro e meio de pano: se
  // a queda comeca so na borda da mesa ela nao aparece NO QUADRO e o feltro
  // volta a ser uma chapa verde. Na mesa de poker a camera pega o oval inteiro
  // e a queda pode ser mais larga.
  get feltroVerde() {
    return stdMat('casino-feltro-verde', {
      map: feltroTex('verde', [13, 68, 42], 0.31, 0.5, 0.22),
      roughness: 0.99, metalness: 0.0, name: 'feltro-verde',
    })
  },
  get feltroAzul() {
    return stdMat('casino-feltro-azul', {
      map: feltroTex('azul', [21, 48, 88], 0.5, 0.5, 0.31),
      roughness: 0.99, metalness: 0.0, name: 'feltro-azul',
    })
  },
  get madeira() { return stdMat('casino-madeira', { map: woodEscuro(), roughness: 0.55, metalness: 0.06 }) },
  get teto() { return solid(0x141118, 0.95) },
  get vidroEscuro() { return glass(0x36505f, 0.30) },
  get vidroCaixa() { return glass(0xd0e8f2, 0.16) },
  get espelho() {
    return stdMat('casino-espelho', {
      color: 0x2a2f36, roughness: 0.05, metalness: 0.95,
      emissive: 0x140d16, emissiveIntensity: 0.35,
    })
  },
}

/**
 * O pano da mesa: fibra + poco de luz + vinheta, tudo assado num canvas.
 *
 * @param {string} chave  nome do cache
 * @param {number[]} rgb  a cor do pano NO MIOLO DO POCO (o resto so escurece)
 * @param {number} cu,cv  centro do poco em UV
 * @param {number} raio   raio do poco em UV (0.5 = a borda da tampa)
 *
 * Numeros e o porque de cada um:
 *
 * 512 px pra uma mesa de 3 m sao 6 px/cm: chega pra a fibra nao virar xadrez
 * quando a camera da mesa desce a 1 m do pano, e o canvas so nasce se a mesa
 * for construida (os materiais sao getters).
 *
 * O poco vai de 1.16x no miolo a 0.32x na beirada. A conta que importa e a de
 * cima: o material multiplica o map pela luz, entao 0.32 escurece a borda em
 * um terco — mais que isso e o pano some no preto e a mesa perde o formato;
 * menos que isso e o degrade nao le como luz caindo, le como sujeira.
 *
 * O poco tambem VIRA DE COR do miolo pra borda, e nao so de brilho. As duas
 * PointLight do salao sao ambar (0xffd2a0): onde a luz bate o pano puxa pro
 * quente e onde ela nao chega sobra so o azul do ambiente. Um degrade que so
 * escurece a mesma cor le como pano manchado; com o desvio de matiz ele le como
 * luz caindo, que e o pedido.
 *
 * A fibra e ANISOTROPICA de proposito: riscos curtos deitados no eixo u, nao
 * pontinhos redondos. Feltro tem sentido de pelo, e e isso que separa "pano"
 * de "ruido de televisao velha" quando a luz bate raspando.
 */
const POCO_QUENTE = [1.14, 1.02, 0.80]   // desvio de matiz no miolo do poco
const POCO_FRIO = [0.80, 0.94, 1.22]     // ... e na borda que caiu pro escuro
function feltroTex(chave, rgb, cu, cv, raio) {
  return tex('casino-feltro-' + chave, 512, (g, s) => {
    const cor = (k) => {
      const t = Math.max(0, Math.min(1, (k - 0.32) / 0.84))
      const c = []
      for (let i = 0; i < 3; i++) {
        const b = POCO_FRIO[i] + (POCO_QUENTE[i] - POCO_FRIO[i]) * t
        c.push(Math.round(Math.min(255, rgb[i] * k * b)))
      }
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'
    }

    // 1) o poco. O gradiente comeca num raio pequeno pra o miolo ter um plato
    // chapado — sem ele o centro vira uma bola de luz e a mesa parece um ovo.
    const gr = g.createRadialGradient(cu * s, cv * s, raio * s * 0.22, cu * s, cv * s, raio * s * 1.55)
    gr.addColorStop(0.00, cor(1.16))
    gr.addColorStop(0.34, cor(0.98))
    gr.addColorStop(0.62, cor(0.68))
    gr.addColorStop(0.84, cor(0.45))
    gr.addColorStop(1.00, cor(0.32))
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)

    // 2) a fibra
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const c = Math.random() > 0.5 ? 255 : 0
      g.strokeStyle = 'rgba(' + c + ',' + c + ',' + c + ',' + (0.014 + Math.random() * 0.030) + ')'
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + 2 + Math.random() * 6, y + (Math.random() - 0.5) * 2)
      g.stroke()
    }

    // 3) o desgaste: manchas largas e claras onde a mao do dealer varre o pano
    // e a ficha e arrastada. Sem elas o poco fica perfeito demais, e mesa de
    // cassino de verdade e pano usado.
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const rr = 14 + Math.random() * 52
      const m = g.createRadialGradient(x, y, 0, x, y, rr)
      m.addColorStop(0, 'rgba(255,255,255,' + (0.012 + Math.random() * 0.022) + ')')
      m.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = m
      g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill()
    }
  }, 1)
}

/** Madeira quase preta das bordas de mesa e do bar. */
function woodEscuro() {
  return tiled(tex('casino-nogueira', 256, (g, s) => {
    g.fillStyle = '#3a2118'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * s
      g.strokeStyle = 'rgba(' + (Math.random() > 0.5 ? '20,10,6' : '110,72,44') + ',' + (Math.random() * 0.4) + ')'
      g.lineWidth = 1 + Math.random() * 3
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4)
      g.stroke()
    }
  }, 1), 2, 2)
}

/** Reboco externo: mesmo tijolo/reboco medido por segmento, como o buildShell. */
function matParedeExt(w, h, lateral) {
  const rx = Math.max(0.3, w / 3.2), ry = Math.max(0.3, h / 3.2)
  return stdMat('casino-ext:' + rx.toFixed(2) + ':' + ry.toFixed(2) + ':' + (lateral ? 1 : 0), {
    map: tiled(plasterTex(1, '#efe4d0'), rx, ry),
    color: lateral ? 0x4d1424 : 0x5e192c,
    roughness: 0.9,
  })
}

/** Piso de calcada do avental, na densidade do city.js (0.26 tile/m). */
function matCalcada(w, d) {
  const rx = Math.max(0.2, w * 0.26), ry = Math.max(0.2, d * 0.26)
  return stdMat('casino-calc:' + rx.toFixed(2) + ':' + ry.toFixed(2), {
    map: tiled(concreteTex(1), rx, ry), color: 0xd9d4cb, roughness: 0.98,
  })
}

/** Revestimento interno com a densidade certa pro tamanho do pano. */
function matDamasco(w, h) {
  const rx = Math.max(0.4, w / 2.4), ry = Math.max(0.4, h / 2.4)
  return stdMat('casino-dam:' + rx.toFixed(2) + ':' + ry.toFixed(2), {
    map: tiled(damascoTex(1), rx, ry), color: 0xffffff, roughness: 0.92,
  })
}

// ---------------------------------------------------------------------------
// Helpers de montagem
// ---------------------------------------------------------------------------

/** Laje retangular (topo em y=h) que nao projeta sombra. */
function laje(g, x0, x1, z0, z1, h, mat) {
  const m = box(x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  m.castShadow = false
  g.add(m)
  return m
}

/** Plano vertical com giro em Y (0 = olha pra +Z, PI/2 = olha pra +X). */
function painel(w, h, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry || 0
  m.receiveShadow = true
  return m
}

/**
 * Plano deitado (feltro de mesa, marcacao de carpete), legivel por quem esta
 * do lado -Z olhando pra +Z — que e de onde o jogador encara toda mesa daqui.
 *
 * O PI extra no rotation.z e obrigatorio: so com rotation.x = -PI/2 o "pra
 * cima" do texto cai em -Z, ou seja, apontando PARA o leitor, e a frase sai
 * de cabeca pra baixo. O giro no plano (que o Euler XYZ aplica ANTES da
 * deitada) devolve o texto pro sentido de leitura.
 */
function decalChao(w, d, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  m.rotation.x = -Math.PI / 2
  m.rotation.z = Math.PI + (ry || 0)
  m.position.set(x, y, z)
  m.castShadow = false
  m.receiveShadow = false
  return m
}

/**
 * O decalque de TINTA NO PANO nao escreve profundidade. Chame nele todo
 * decalque que fica deitado no feltro.
 *
 * O defeito que isto conserta (achado medindo shots/bj-07-apostando.png): a
 * mesa 3D acende o feltro com um PLANO transparente por cima do pano (e a
 * regra 2 de cassino/mesa-3d.js — acender o feltro e um plano aditivo, nunca
 * uma luz). Material transparente do three ainda escreve no z-buffer por
 * padrao, e a frase impressa esta 2 mm ACIMA daquele plano: onde o retangulo
 * do decalque passava, o plano de luz era REJEITADO pelo teste de
 * profundidade. O resultado na tela era uma faixa horizontal de borda dura
 * atravessando a mesa inteira — do tamanho exato do decalque (0,20 m de fundo
 * em z = -0.75 no blackjack, que e onde as duas arestas cairam quando projetei
 * a foto de volta pro espaco da mesa).
 *
 * Sem escrever profundidade o decalque continua sendo TESTADO contra o feltro
 * e contra as fichas (nao vaza por cima de nada opaco), e o plano de luz passa
 * por cima da tinta como a luz de verdade faria.
 */
function tintaNoPano(m) {
  m.material.depthWrite = false
  return m
}

/** Marca a subarvore inteira como projetora/recebedora de sombra. */
function sombras(o) {
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return o
}

/** Estrela de neon feita de tubos: 10 segmentos ligando as pontas. */
function estrelaNeon(r, esp, mat, pontas, k) {
  const g = new THREE.Group()
  const p = pontas || 5
  const kk = k === undefined ? 0.44 : k
  const pts = []
  for (let i = 0; i < p * 2; i++) {
    const rr = i % 2 ? r * kk : r
    const a = (i * Math.PI) / p
    pts.push([Math.sin(a) * rr, Math.cos(a) * rr])
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const seg = box(Math.hypot(dx, dy), esp, esp, mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)
    seg.rotation.z = Math.atan2(dy, dx)
    seg.castShadow = false
    g.add(seg)
  }
  return g
}

// ===========================================================================
// A. CASCA — moldura de piso, paredes, vitrines, marquise, neon, telhado
// ===========================================================================

/**
 * Moldura de piso: 4 tiras que passam POR BAIXO das paredes e se estendem pelo
 * avental. O miolo do lote fica sem laje de proposito — quem cobre ele e o
 * carpete do interior, e duas lajes no mesmo Y brigariam por z-fighting.
 * Os limites vem de apronOf(): tem que bater com o groundY() do city.js, senao
 * o jogador anda enterrado 16 cm no proprio carpete.
 */
function moldura(g) {
  laje(g, AV.x0, B.x0 + T, AV.z0, AV.z1, BASE, matCalcada(B.x0 + T - AV.x0, AV.z1 - AV.z0))
  laje(g, B.x1 - T, AV.x1, AV.z0, AV.z1, BASE, matCalcada(AV.x1 - B.x1 + T, AV.z1 - AV.z0))
  laje(g, B.x0 + T, B.x1 - T, B.z1 - T, AV.z1, BASE, matCalcada(B.x1 - B.x0, AV.z1 - B.z1 + T))
  laje(g, B.x0 + T, B.x1 - T, AV.z0, B.z0 + T, BASE, matCalcada(B.x1 - B.x0, T))
}

// Vaos de vitrine da fachada (x0,x1). O resto vira pilar cheio.
const JANELAS = [[15.4, 17.9], [18.6, 21.3], [26.7, 29.4], [30.1, 32.8]]
const JAN_Y0 = 1.0, JAN_Y1 = 4.0

/** Pilares cheios da fachada: o que sobra entre as vitrines e a porta. */
function pilaresFachada() {
  const vaos = JANELAS.map((v) => v.slice()).concat([[DL, DR]]).sort((a, b) => a[0] - b[0])
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
  const fz0 = B.z0, fz1 = B.z0 + T          // a fachada e a parede z0
  const parede = (x0, x1, y0, y1, z0, z1, lateral) => {
    const w = Math.max(x1 - x0, z1 - z0)
    g.add(box(x1 - x0, y1 - y0, z1 - z0, matParedeExt(w, y1 - y0, lateral),
      (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
  }

  // laterais e fundos inteiras
  parede(B.x0, B.x0 + T, 0, H, B.z0, B.z1, true)
  parede(B.x1 - T, B.x1, 0, H, B.z0, B.z1, true)
  parede(B.x0, B.x1, 0, H, B.z1 - T, B.z1, false)

  // fachada: pilares cheios + peitoril e bandeira das vitrines + verga da porta
  for (const p of pilaresFachada()) parede(p[0], p[1], 0, H, fz0, fz1, false)
  for (const v of JANELAS) {
    parede(v[0], v[1], 0, JAN_Y0, fz0, fz1, false)
    parede(v[0], v[1], JAN_Y1, H, fz0, fz1, false)
  }
  parede(DL, DR, DH, H, fz0, fz1, false)

  // --- colisores: 4 paredes com o vao da porta LIVRE ----------------------
  colliders.push({ minX: B.x0, maxX: B.x0 + T, minZ: B.z0, maxZ: B.z1, tag: 'cassino-parede' })
  colliders.push({ minX: B.x1 - T, maxX: B.x1, minZ: B.z0, maxZ: B.z1, tag: 'cassino-parede' })
  colliders.push({ minX: B.x0, maxX: B.x1, minZ: B.z1 - T, maxZ: B.z1, tag: 'cassino-parede' })
  colliders.push({ minX: B.x0, maxX: DL, minZ: fz0, maxZ: fz1, tag: 'cassino-fachada' })
  colliders.push({ minX: DR, maxX: B.x1, minZ: fz0, maxZ: fz1, tag: 'cassino-fachada' })

  // --- occluders de camera: as mesmas paredes, agora COM altura -----------
  // Uma caixa cheia deixaria o interior inteiro sem oclusao e a camera de 3a
  // pessoa saltaria pro cangote do jogador la dentro.
  const occ = (minX, minY, minZ, maxX, maxY, maxZ, tag) =>
    occluders.push({ minX, minY, minZ, maxX, maxY, maxZ, tag })
  occ(B.x0, 0, B.z0, B.x0 + T, H, B.z1, 'cassino-parede')
  occ(B.x1 - T, 0, B.z0, B.x1, H, B.z1, 'cassino-parede')
  occ(B.x0, 0, B.z1 - T, B.x1, H, B.z1, 'cassino-parede')
  occ(B.x0, 0, fz0, DL, H, fz1, 'cassino-fachada')
  occ(DR, 0, fz0, B.x1, H, fz1, 'cassino-fachada')
  occ(DL, DH, fz0, DR, H, fz1, 'cassino-verga')
}

/** Vitrines: vidro escuro, reflexo diagonal e moldura dourada. */
function vitrines(g) {
  const fz = B.z0                       // face externa da fachada
  const reflexo = stdMat('casino-reflexo', {
    color: 0xdfe9f2, transparent: true, opacity: 0.10, roughness: 0.2,
    depthWrite: false, side: THREE.DoubleSide,
  })
  for (const v of JANELAS) {
    const w = v[1] - v[0], h = JAN_Y1 - JAN_Y0
    const cx = (v[0] + v[1]) / 2, cy = (JAN_Y0 + JAN_Y1) / 2
    const vidro = box(w - 0.10, h - 0.10, 0.05, M.vidroEscuro, cx, cy, fz + T / 2)
    vidro.castShadow = false
    g.add(vidro)
    // dois riscos de reflexo cruzando a vidraca: e o truque mais barato que
    // existe pra vidro escuro parar de parecer buraco preto na parede.
    // rotation.y = PI porque a fachada do cassino olha pra -Z: um plano no
    // padrao do three (face em +Z) estaria de costas pra rua.
    //
    // O TAMANHO tem que caber na vidraca DEPOIS do giro de 0.42 rad, e nao
    // antes: um plano inclinado ocupa (lado*cos + outro*sen) na tela. Com
    // altura 1.5*h o risco sobrava 0.7 m pra cima e pra baixo do vao e ia
    // desenhar duas manchas leitosas no reboco — o risco nao para na moldura,
    // ele passa por cima dela porque esta 2 cm a frente da parede.
    const rw = w * 0.26, rh = h * 0.76
    for (const k of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh), reflexo)
      r.position.set(cx + k * w * 0.18, cy, fz - 0.02)
      r.rotation.z = 0.42
      r.rotation.y = Math.PI
      r.castShadow = false
      g.add(r)
    }
    // moldura dourada: travessas, montantes e caixilhos internos
    g.add(box(w + 0.22, 0.16, 0.18, M.ouro, cx, JAN_Y1 + 0.05, fz - 0.05))
    g.add(box(w + 0.22, 0.22, 0.24, M.ouro, cx, JAN_Y0 - 0.06, fz - 0.06))
    for (const s of [-1, 1]) {
      g.add(box(0.14, h + 0.2, 0.16, M.ouro, cx + s * (w / 2 + 0.04), cy, fz - 0.04))
    }
    const nM = Math.max(1, Math.round(w / 1.4) - 1)
    for (let i = 1; i <= nM; i++) {
      g.add(box(0.07, h, 0.12, M.ouroFosco, v[0] + (w / (nM + 1)) * i, cy, fz - 0.03))
    }
  }
}

/**
 * MARQUISE. E ela que grita "cassino" de longe: laje saliente sobre a entrada
 * com uma fileira de lampadas na borda que acendem em sequencia no update.
 *
 * As lampadas NAO sao meshes dinamicos. Sao meshes comuns divididos entre 3
 * MATERIAIS (as fases da corrida): o forno funde cada fase num mesh so e o
 * update mexe nos 3 materiais. A corrida inteira custa 3 draw calls e nenhuma
 * alocacao por quadro.
 */
function marquise(g, colliders, matsFase) {
  const w = MQ.x1 - MQ.x0, d = MQ.z1 - MQ.z0
  const cx = (MQ.x0 + MQ.x1) / 2, cz = (MQ.z0 + MQ.z1) / 2
  const alt = MQ.y1 - MQ.y0

  g.add(box(w, alt, d, M.vinho, cx, (MQ.y0 + MQ.y1) / 2, cz))
  const forro = box(w - 0.24, 0.06, d - 0.24, M.pretoLuz, cx, MQ.y0 + 0.02, cz)
  forro.castShadow = false
  g.add(forro)
  // luminarias embutidas no forro (emissivo puro: PointLight aqui e luxo)
  const brilho = emissive(0xffd9a0, 2.2)
  for (let i = 0; i < 5; i++) {
    const l = box(w - 1.2, 0.03, 0.10, brilho, cx, MQ.y0 - 0.005, MQ.z0 + 0.28 + i * ((d - 0.56) / 4))
    l.castShadow = false
    g.add(l)
  }
  // fascia dourada em volta (frente + duas laterais)
  g.add(box(w + 0.16, 0.62, 0.14, M.ouro, cx, MQ.y0 + 0.24, MQ.z0 - 0.05))
  for (const s of [-1, 1]) {
    g.add(box(0.14, 0.62, d + 0.1, M.ouro, cx + s * (w / 2 + 0.05), MQ.y0 + 0.24, cz))
  }

  // --- fileira de lampadas na borda ---------------------------------------
  const bulbo = new THREE.SphereGeometry(0.075, 10, 6)
  let n = 0
  const por = (x, z) => {
    const m = new THREE.Mesh(bulbo, matsFase[n % matsFase.length])
    m.position.set(x, MQ.y0 - 0.02, z)
    m.castShadow = false
    g.add(m)
    n++
  }
  const nFrente = Math.max(4, Math.floor((w - 0.2) / 0.34))
  for (let i = 0; i <= nFrente; i++) por(MQ.x0 + 0.1 + i * ((w - 0.2) / nFrente), MQ.z0 - 0.14)
  const nLado = Math.max(2, Math.floor((d - 0.2) / 0.34))
  for (const s of [-1, 1]) {
    for (let i = 1; i <= nLado; i++) {
      por(cx + s * (w / 2 + 0.09), MQ.z0 + i * ((d - 0.1) / (nLado + 1)))
    }
  }

  // tirantes segurando a ponta da marquise na parede
  const tir = solid(0xcfd3d8, 0.3, 0.85)
  for (const s of [-1, 1]) {
    const dy = 1.35, dz = d - 0.2
    const t2 = cyl(0.035, 0.035, Math.hypot(dy, dz), tir, 8)
    t2.position.set(cx + s * (w / 2 - 0.5), MQ.y1 + dy / 2, MQ.z0 + dz / 2 + 0.1)
    t2.rotation.x = Math.atan2(dz, dy)
    g.add(t2)
  }

  // --- colunas douradas ladeando a entrada --------------------------------
  // Coladas na fachada (z=11.7): mais pra fora elas entrariam na saia da
  // conifera que o city.js planta em (22, 9.4), e nao da pra mexer nela daqui.
  const hFuste = MQ.y0 - BASE - 0.5
  for (const cxx of [21.5, 26.5]) {
    const col = new THREE.Group()
    col.position.set(cxx, BASE, 11.7)
    col.add(box(0.78, 0.16, 0.78, M.ouroFosco, 0, 0.08, 0))
    col.add(box(0.66, 0.10, 0.66, M.ouro, 0, 0.20, 0))
    const fuste = cyl(0.24, 0.27, hFuste, M.ouro, 18)
    fuste.position.y = 0.25 + hFuste / 2
    col.add(fuste)
    // caneluras: 8 sulcos escuros dao volume sem gastar textura
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      col.add(box(0.05, hFuste - 0.1, 0.05, M.ouroEscuro,
        Math.sin(a) * 0.245, 0.30 + hFuste / 2, Math.cos(a) * 0.245))
    }
    col.add(box(0.62, 0.12, 0.62, M.ouro, 0, hFuste + 0.31, 0))
    col.add(box(0.72, 0.14, 0.72, M.ouroFosco, 0, hFuste + 0.43, 0))
    sombras(col)
    g.add(col)
    colliders.push({ minX: cxx - 0.4, maxX: cxx + 0.4, minZ: 11.3, maxZ: 12.1, tag: 'cassino-coluna' })
  }
}

/** Letreiro principal, placa vertical da esquina e o neon de contorno. */
function letreiros(g, colliders, matsFase, anim) {
  const fz = B.z0
  const hex = '#' + new THREE.Color(B.signColor).getHexString()

  // --- painel horizontal acima da marquise --------------------------------
  const sw = 13.0, sh = 1.05, sy = 5.62, sz = fz - 0.22
  g.add(box(sw, sh + 0.34, 0.34, M.preto, B.door.center, sy, sz))
  anim.borda = emissive(B.signColor, 2.4).clone()
  for (const s of [-1, 1]) {
    const e = box(sw + 0.12, 0.10, 0.40, anim.borda, B.door.center, sy + s * (sh / 2 + 0.14), sz)
    e.castShadow = false
    g.add(e)
  }
  // canvas na proporcao do plano: texto esticado em letreiro e o erro classico
  anim.texto = textPlaneMat(B.sign, {
    w: 2048, h: 168, color: '#fff6e0',
    font: 'bold 118px "Trebuchet MS", sans-serif',
    glow: hex, stroke: hex, emissiveIntensity: 1.5,
  }).clone()
  // Todo plano de texto desta fachada leva rotation.y = PI: o cassino olha pra
  // -Z e um PlaneGeometry no padrao do three nasce de costas pra rua.
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(sw - 0.5, sh * 0.82), anim.texto)
  txt.position.set(B.door.center, sy, sz - 0.19)
  txt.rotation.y = Math.PI
  txt.castShadow = false
  g.add(txt)
  // lampadas contornando o painel, na MESMA corrida da marquise
  const bulbo = new THREE.SphereGeometry(0.062, 8, 6)
  let n = 0
  for (let i = 0; i <= 30; i++) {
    const x = B.door.center - sw / 2 + (i / 30) * sw
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(bulbo, matsFase[n % matsFase.length])
      m.position.set(x, sy + s * (sh / 2 + 0.26), sz - 0.24)
      m.castShadow = false
      g.add(m)
      n++
    }
  }

  // --- placa vertical na esquina oeste ------------------------------------
  // Letra por letra, de cima pra baixo: e a silhueta que se le de 40 m, quando
  // o painel horizontal ainda e so um borrao dourado.
  const bx = 14.82, passo = 0.62, topo = 5.72
  const letras = 'CASSINO'
  const alturaPlaca = passo * letras.length + 0.5
  const cyPlaca = topo - (passo * (letras.length - 1)) / 2
  g.add(box(0.92, alturaPlaca, 0.64, M.preto, bx, cyPlaca, fz - 0.31))
  anim.placa = emissive(0xff2f6a, 2.2).clone()
  for (const s of [-1, 1]) {
    const e = box(0.10, alturaPlaca, 0.60, anim.placa, bx + s * 0.44, cyPlaca, fz - 0.31)
    e.castShadow = false
    g.add(e)
  }
  for (let i = 0; i < letras.length; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), textPlaneMat(letras[i], {
      w: 256, h: 256, color: '#fff4dd',
      font: 'bold 190px "Trebuchet MS", sans-serif',
      glow: '#ffb327', emissiveIntensity: 1.6,
    }))
    p.position.set(bx, topo - i * passo, fz - 0.64)
    p.rotation.y = Math.PI
    p.castShadow = false
    g.add(p)
  }
  colliders.push({ minX: bx - 0.5, maxX: bx + 0.5, minZ: fz - 0.66, maxZ: fz, tag: 'cassino-placa' })

  // --- neon de tubo contornando a fachada ---------------------------------
  anim.tubo = emissive(0x2fd6ff, 2.0).clone()
  const tz = fz - 0.07
  const larg = B.x1 - B.x0
  for (const y of [0.42, H - 0.24]) {
    const m = box(larg - 0.4, 0.09, 0.09, anim.tubo, B.door.center, y, tz)
    m.castShadow = false
    g.add(m)
  }
  for (const s of [-1, 1]) {
    const m = box(0.09, H - 0.66, 0.09, anim.tubo, B.door.center + s * (larg / 2 - 0.2), H / 2 + 0.09, tz)
    m.castShadow = false
    g.add(m)
  }
  // arco de neon em volta do vao da porta
  anim.porta = emissive(0xffe07a, 2.6).clone()
  for (const s of [-1, 1]) {
    const m = box(0.10, DH + 0.2, 0.10, anim.porta,
      B.door.center + s * (B.door.width / 2 + 0.16), (DH + 0.2) / 2, fz - 0.08)
    m.castShadow = false
    g.add(m)
  }
  const verga = box(B.door.width + 0.42, 0.10, 0.10, anim.porta, B.door.center, DH + 0.2, fz - 0.08)
  verga.castShadow = false
  g.add(verga)
}

/** Telhado: laje, platibanda com cornija dourada e a estrela de neon no topo. */
function telhado(g, matsFase, anim) {
  const w = B.x1 - B.x0, d = B.z1 - B.z0
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2

  g.add(box(w + 0.7, 0.34, d + 0.7, solid(0x4a4148, 0.95), cx, H + 0.17, cz))
  const pm = solid(0x6b1f33, 0.88)
  g.add(box(w + 0.5, 0.95, 0.34, pm, cx, H + 0.82, B.z0 + 0.06))
  g.add(box(w + 0.5, 0.72, 0.34, pm, cx, H + 0.70, B.z1 - 0.06))
  g.add(box(0.34, 0.72, d + 0.5, pm, B.x0 + 0.06, H + 0.70, cz))
  g.add(box(0.34, 0.72, d + 0.5, pm, B.x1 - 0.06, H + 0.70, cz))
  g.add(box(w + 0.72, 0.14, 0.46, M.ouro, cx, H + 1.34, B.z0 + 0.06))
  g.add(box(w + 0.72, 0.14, 0.46, M.ouroFosco, cx, H + 1.10, B.z1 - 0.06))
  for (const s of [-1, 1]) {
    g.add(box(0.46, 0.14, d + 0.6, M.ouroFosco, cx + s * (w / 2 + 0.02), H + 1.10, cz))
  }

  // --- ESTRELA de neon sobre a entrada ------------------------------------
  const est = new THREE.Group()
  est.position.set(B.door.center, H + 2.55, B.z0 - 0.05)
  anim.estrela = emissive(0xffd24a, 3.0).clone()
  anim.estrela2 = emissive(0xff3d6e, 2.4).clone()
  // A chapa fica ATRAS do neon (+Z, pro lado do predio) e virada pra rua: o
  // lado de fora aqui e o -Z, entao "atras" tem o sinal invertido em relacao
  // ao resto do jogo.
  const chapa = new THREE.Mesh(new THREE.CircleGeometry(1.28, 24), M.preto)
  chapa.position.z = 0.09
  chapa.rotation.y = Math.PI
  est.add(chapa)
  est.add(estrelaNeon(1.22, 0.10, anim.estrela))
  est.add(estrelaNeon(0.72, 0.07, anim.estrela2))
  const bulbo = new THREE.SphereGeometry(0.085, 10, 6)
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5
    const m = new THREE.Mesh(bulbo, matsFase[i % matsFase.length])
    m.position.set(Math.sin(a) * 1.38, Math.cos(a) * 1.38, -0.02)
    m.castShadow = false
    est.add(m)
  }
  est.add(box(0.16, 1.5, 0.16, M.grafite, 0, -2.0, -0.12))   // mastro
  g.add(est)

  // casa de maquinas no fundo: quebra a silhueta chapada da platibanda
  g.add(box(2.6, 1.1, 2.0, solid(0x5b5560, 0.9), B.x1 - 4.0, H + 0.89, B.z1 - 3.2))
  if (typeof Props.makeAC === 'function') {
    const ac = Props.makeAC()
    ac.position.set(B.x0 + 4.2, H + 0.34, B.z1 - 3.0)
    sombras(ac)
    g.add(ac)
  }
}

/** Tapete vermelho da calcada, com postes dourados e cordao de veludo. */
function tapeteVermelho(g, colliders) {
  const x0 = 22.6, x1 = 25.4, z0 = 9.8, z1 = B.z0
  const y = BASE + 0.012
  const t = box(x1 - x0, 0.024, z1 - z0, M.tapete, (x0 + x1) / 2, y, (z0 + z1) / 2)
  t.castShadow = false
  g.add(t)
  for (const s of [-1, 1]) {
    const b2 = box(0.14, 0.028, z1 - z0, M.ouroFosco,
      (x0 + x1) / 2 + s * ((x1 - x0) / 2 - 0.07), y + 0.004, (z0 + z1) / 2)
    b2.castShadow = false
    g.add(b2)
  }
  const est = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), textPlaneMat('*', {
    w: 256, h: 256, color: '#e8c86a',
    font: 'bold 320px "Trebuchet MS", sans-serif', emissiveIntensity: 0.2,
  }))
  est.rotation.x = -Math.PI / 2
  est.position.set(24, y + 0.02, 10.9)
  est.castShadow = false
  g.add(est)

  const zs = [10.25, 11.45]
  for (const s of [-1, 1]) {
    const px = 24 + s * 1.75
    for (const pz of zs) {
      const p = new THREE.Group()
      p.position.set(px, BASE, pz)
      p.add(cyl(0.19, 0.21, 0.05, M.ouroFosco, 14).translateY(0.025))
      p.add(cyl(0.035, 0.035, 0.86, M.ouro, 10).translateY(0.45))
      p.add(sphere(0.075, M.ouro, 12).translateY(0.92))
      sombras(p)
      g.add(p)
      colliders.push({ minX: px - 0.16, maxX: px + 0.16, minZ: pz - 0.16, maxZ: pz + 0.16, tag: 'cassino-poste' })
    }
    // cordao em 4 segmentos: o meio cai, as pontas sobem (catenaria de pobre)
    const nS = 4
    for (let i = 0; i < nS; i++) {
      const a = zs[0] + (i / nS) * (zs[1] - zs[0])
      const b2 = zs[0] + ((i + 1) / nS) * (zs[1] - zs[0])
      const ya = 0.80 - Math.sin((i / nS) * Math.PI) * 0.14
      const yb = 0.80 - Math.sin(((i + 1) / nS) * Math.PI) * 0.14
      const c = cyl(0.028, 0.028, Math.hypot(b2 - a, yb - ya), M.veludo, 8)
      c.position.set(px, BASE + (ya + yb) / 2, (a + b2) / 2)
      c.rotation.x = Math.PI / 2 - Math.atan2(yb - ya, b2 - a)
      c.castShadow = false
      g.add(c)
    }
  }
}

// ===========================================================================
// B. MIOLO — carpete, revestimento, teto, lustres
// ===========================================================================

/** Carpete estampado, passadeira da entrada e rodape dourado. */
function pisoInterno(g) {
  const f = plane(IN.w, IN.d, M.carpete)
  f.position.set(IN.cx, 0.004, IN.cz)
  g.add(f)

  // passadeira: leva o olho da porta ate o meio do salao
  const pass = box(B.door.width - 0.4, 0.012, 4.2, M.passadeira, B.door.center, 0.013, IN.z0 + 2.1)
  pass.castShadow = false
  g.add(pass)

  // rodape dourado: 4 corridas, com o vao da porta livre na fachada
  const hR = 0.17, tR = 0.06
  const segs = [
    [IN.x0, DL, IN.z0 + tR / 2],
    [DR, IN.x1, IN.z0 + tR / 2],
    [IN.x0, IN.x1, IN.z1 - tR / 2],
  ]
  for (const [a, b2, z] of segs) {
    if (b2 - a <= 0.05) continue
    g.add(box(b2 - a, hR, tR, M.ouroFosco, (a + b2) / 2, hR / 2, z))
  }
  for (const x of [IN.x0 + tR / 2, IN.x1 - tR / 2]) {
    g.add(box(tR, hR, IN.d - tR * 2, M.ouroFosco, x, hR / 2, IN.cz))
  }
}

/**
 * Revestimento das paredes por dentro. Sao planos finos colados na face
 * interna da casca: pintar a caixa da parede inteira de damasco deixaria a
 * fachada de fora com papel de parede.
 * A fachada e o unico pano recortado — a vitrine e a porta sao buracos, e um
 * plano por cima deles taparia a vista da rua que justifica o vidro.
 */
function revestimento(g) {
  const alto = CEIL
  for (const s of [1, -1]) {
    const x = s > 0 ? IN.x0 + 0.02 : IN.x1 - 0.02
    g.add(painel(IN.d, alto, matDamasco(IN.d, alto), x, alto / 2, IN.cz, s * Math.PI / 2))
  }
  g.add(painel(IN.w, alto, matDamasco(IN.w, alto), IN.cx, alto / 2, IN.z1 - 0.02, Math.PI))

  // fachada: pilares inteiros, faixa abaixo/acima das vitrines, verga da porta
  const zf = IN.z0 + 0.02
  const jl = JAN_Y0 - BASE, jh = JAN_Y1 - BASE
  for (const p of pilaresFachada()) {
    const a = Math.max(p[0], IN.x0), b2 = Math.min(p[1], IN.x1)
    if (b2 - a <= 0.02) continue
    g.add(painel(b2 - a, alto, matDamasco(b2 - a, alto), (a + b2) / 2, alto / 2, zf, 0))
  }
  for (const v of JANELAS) {
    const w = v[1] - v[0], cx = (v[0] + v[1]) / 2
    g.add(painel(w, jl, matDamasco(w, jl), cx, jl / 2, zf, 0))
    g.add(painel(w, alto - jh, matDamasco(w, alto - jh), cx, (alto + jh) / 2, zf, 0))
  }
  const dv = DH - BASE
  g.add(painel(B.door.width, alto - dv, matDamasco(B.door.width, alto - dv),
    B.door.center, (alto + dv) / 2, zf, 0))
}

/** Teto escuro, cornija dourada, vigas e os lustres. */
function tetoELustres(g, luzes) {
  const c = plane(IN.w, IN.d, M.teto, Math.PI / 2)
  c.position.set(IN.cx, CEIL - 0.02, IN.cz)
  g.add(c)

  // cornija: filete dourado + moldura escura, correndo pelas 4 paredes
  const yC = 4.55
  const cornija = (w, x, z, ry) => {
    const u = new THREE.Group()
    u.position.set(x, yC, z)
    u.rotation.y = ry
    u.add(box(w, 0.16, 0.14, M.ouro, 0, 0, 0))
    u.add(box(w, 0.09, 0.22, M.ouroEscuro, 0, -0.13, 0.02))
    u.add(box(w, 0.05, 0.30, M.vinho, 0, 0.11, 0.05))
    sombras(u)
    g.add(u)
  }
  cornija(IN.w, IN.cx, IN.z0 + 0.14, 0)
  cornija(IN.w, IN.cx, IN.z1 - 0.14, Math.PI)
  cornija(IN.d, IN.x0 + 0.14, IN.cz, Math.PI / 2)
  cornija(IN.d, IN.x1 - 0.14, IN.cz, -Math.PI / 2)

  // vigas do forro: sem elas 19 x 17 m de teto preto viram um buraco
  const vigaMat = solid(0x211a24, 0.9)
  for (let i = 0; i < 5; i++) {
    const v = box(IN.w, 0.16, 0.22, vigaMat, IN.cx, CEIL - 0.12, IN.z0 + 2.0 + i * ((IN.d - 4.0) / 4))
    v.receiveShadow = true
    g.add(v)
  }
  // faixa de neon acompanhando as vigas: o brilho do teto vem daqui, nao de luz
  const matForro = emissive(0x8a3bff, 1.3)
  for (let i = 0; i < 5; i++) {
    const l = box(IN.w - 1.0, 0.03, 0.08, matForro, IN.cx, CEIL - 0.22, IN.z0 + 2.0 + i * ((IN.d - 4.0) / 4) + 0.18)
    l.castShadow = false
    g.add(l)
  }

  // --- 3 candelabros ------------------------------------------------------
  const cristal = stdMat('casino-cristal', {
    color: 0xdff0ff, roughness: 0.05, metalness: 0.15,
    transparent: true, opacity: 0.66, emissive: 0xbfe0ff, emissiveIntensity: 0.5,
  })
  const vela = emissive(0xffdca0, 2.8)
  const geoCristal = new THREE.OctahedronGeometry(0.055, 0)
  const geoGota = new THREE.OctahedronGeometry(0.045, 0)

  const lustre = (x, z, escala, foco) => {
    const u = new THREE.Group()
    u.position.set(x, 4.28, z)
    u.scale.setScalar(escala)
    // Corrente ate o forro. DIVIDIDA pela escala: o grupo inteiro e escalado,
    // entao um comprimento cru encurta junto e os dois lustres menores ficam
    // pendurados no ar. O alvo e o proprio plano do forro (CEIL - 0.02) menos
    // meia campanula, e nao a linha das fitas de neon: nenhuma das tres
    // correntes cai debaixo de uma viga, entao ali em cima nao ha em que
    // encostar — sobrava um palmo de vazio entre a campanula e o teto.
    const lc = (CEIL - 0.065 - 4.28) / escala
    u.add(cyl(0.022, 0.022, lc, M.ouroFosco, 6).translateY(lc / 2))
    u.add(cyl(0.10, 0.13, 0.09, M.ouroFosco, 12).translateY(lc))
    u.add(sphere(0.10, M.ouro, 12).translateY(0.30))
    // dois aros com velas
    for (const [r, y, n] of [[0.62, 0.02, 8], [0.40, -0.26, 6]]) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(r, 0.026, 6, 26), M.ouro)
      aro.rotation.x = Math.PI / 2
      aro.position.y = y
      // Mesh cru nao herda as flags que box/cyl/sphere ja marcam, e ele e a
      // unica peca do lustre que precisa delas na mao (ver o fim da funcao).
      aro.castShadow = true
      aro.receiveShadow = true
      u.add(aro)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const px = Math.sin(a) * r, pz = Math.cos(a) * r
        u.add(cyl(0.028, 0.032, 0.16, solid(0xf0e6d0, 0.85), 8).translateY(y + 0.10).translateX(px).translateZ(pz))
        const ch = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), vela)
        ch.position.set(px, y + 0.22, pz)
        ch.scale.y = 1.5
        ch.castShadow = false
        u.add(ch)
        // pingente de cristal pendurado entre uma vela e outra
        const gota = new THREE.Mesh(geoGota, cristal)
        gota.position.set(Math.sin(a + Math.PI / n) * r, y - 0.14, Math.cos(a + Math.PI / n) * r)
        gota.castShadow = false
        u.add(gota)
      }
    }
    // cachos de cristal descendo do aro maior
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const r = 0.20 + (i % 3) * 0.14
      const cr = new THREE.Mesh(geoCristal, cristal)
      cr.position.set(Math.sin(a) * r, -0.42 - (i % 4) * 0.09, Math.cos(a) * r)
      cr.castShadow = false
      u.add(cr)
    }
    u.add(cyl(0.03, 0.10, 0.26, M.ouro, 10).translateY(-0.66))
    // FOCO: o prato aceso na barriga do lustre, virado pro chao.
    //
    // Ele existe pra a mesa ter de onde a luz VIR. O poco de luz esta pintado
    // no pano (feltroTex) e o pano nao explica sozinho por que ele esta ali;
    // um disco quente logo acima, na vertical do centro da mesa, fecha a
    // historia. Nao e luz: e emissivo, como as luminarias do forro da marquise.
    //
    // Usa o MESMO material das chamas de proposito. Material novo seria um
    // balde novo no forno (bake.js funde por material) e um draw call a mais
    // pros tres lustres; reaproveitando o 'vela' o prato entra no mesh que ja
    // existe e nao custa nada. So os dois lustres das MESAS ganham o prato — o
    // da entrada nao tem mesa embaixo pra iluminar.
    if (foco) {
      const prato = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), vela)
      prato.rotation.x = Math.PI / 2       // virado pra baixo
      prato.position.y = -0.60
      prato.castShadow = false
      u.add(prato)
    }
    // Sem sombras() aqui: a varredura cega devolvia castShadow pros ~40
    // cristais e chamas de cada lustre, apagando os castShadow = false de tres
    // linhas acima. Cristal e material TRANSPARENTE — no shadow map ele vira
    // uma pedra opaca e o lustre pinta uma mancha preta no carpete — e ainda
    // arrasta 120 casters a mais pro balde do forno. box/cyl/sphere ja marcam
    // a sombra sozinhos; o unico mesh cru que precisava dela e o aro.
    g.add(u)
  }
  lustre(BJ.x, BJ.z - 0.7, 1.0, true)
  lustre(PK.x, PK.z, 0.9, true)
  lustre(B.door.center, IN.z0 + 4.4, 0.85, false)

  // DUAS PointLight pro salao inteiro, e nenhuma delas projeta sombra.
  //
  // Por que duas e nao uma: o salao tem 19 x 17 m e NAO tem janela nenhuma
  // virada pro sol (a fachada e toda vidro escuro). Com uma luz so no centro,
  // o canto das caca-niqueis e o balcao do caixa ficavam pretos — o emissivo
  // do neon acende o PROPRIO neon, nao a parede na frente dele: nao ha luz
  // indireta neste renderizador.
  //
  // Por que nao tres ou quatro: cada luz da cena entra em TODOS os shaders, e
  // o city.js ja gasta o orcamento dele (LIGHT_BUDGET = 8) com os postes. Duas
  // e o que cobre o salao sem mexer nessa conta de novo.
  //
  // Intensidade alta (candela, com decay 2) porque o teto esta a 4 m e a mesa
  // a 1 m: o que chega no feltro e intensidade / distancia^2.
  //
  // ---- UM DEGRAU MAIS ESCURO, e por que so um degrau ----------------------
  //
  // 165 -> 118 e 95 -> 74 (~ -28%). O pedido era "o resto do salao um degrau
  // mais escuro em volta das mesas, pra a mesa ser o lugar mais claro do
  // quadro", e a conta que decide o quanto e a do BLOOM: com 165 candelas o
  // que chegava no feltro dava radiancia ~1,5 na tinta do decalque, quase o
  // dobro do threshold de 0.85 — nao havia cor de tinta que salvasse aquilo
  // sozinha sem virar cinza-chumbo. Com 118 sobra folga pras letras caberem
  // embaixo do threshold ainda claras.
  //
  // Nao pode ser MUITO mais que isso: quem so atravessa o cassino a pe precisa
  // enxergar o caminho, e nao ha luz indireta neste renderizador — o que a
  // PointLight nao alcanca fica preto de verdade. Um terco a menos e o limite
  // em que a parede do fundo e o balcao do caixa ainda leem.
  //
  // O ALCANCE encurtou junto (38 -> 30, 26 -> 22) e ele e que faz o trabalho
  // de "em volta das mesas": com decay 2 o `distance` e a janela que empurra a
  // contribuicao a zero na ponta, entao encurtar escurece a PERIFERIA sem tirar
  // nada do miolo — e o miolo e onde estao as duas mesas. Com 38 m de alcance
  // num salao de 19 m a janela nunca entrava em acao e a luz era chapada de
  // parede a parede.
  //
  // A luz principal desceu 20 cm (4.0 -> 3.8) e andou 40 cm pro fundo pra ficar
  // entre os dois lustres das mesas: o poco de luz do pano (assado no map do
  // feltro, ver feltroTex) mente melhor quando a luz de verdade vem de cima e
  // de perto do lugar onde o lustre esta pendurado.
  const pl = new THREE.PointLight(0xffd2a0, 118, 30, 2)
  pl.position.set(IN.cx + 1.5, 3.8, IN.cz + 1.4)
  pl.castShadow = false
  g.add(pl)
  luzes.push(pl)

  // a segunda mira o corredor das caca-niqueis e o caixa (lado -X / -Z)
  const pl2 = new THREE.PointLight(0xffcf9a, 74, 22, 2)
  pl2.position.set(IN.x0 + 4.5, 3.7, IN.z0 + 5.0)
  pl2.castShadow = false
  g.add(pl2)
  luzes.push(pl2)
}

// ===========================================================================
// Pecas reaproveitadas pelas tres mesas
// ===========================================================================

// Geometria de ficha e de carta: uma so pro modulo inteiro. Sao centenas de
// pecas e o forno vai fundir tudo por material — o que nao pode e cada ficha
// nascer com a propria BufferGeometry antes disso.
// A ficha real tem 39 mm de diametro por 3.3 mm de espessura. Aqui ela e mais
// gorda de proposito: no tamanho certo uma pilha de 10 tem 3 cm e some no
// feltro a dois metros de distancia — e a pilha de fichas e metade da leitura
// de uma mesa de cassino.
let _geoFicha = null
function geoFicha() {
  if (!_geoFicha) _geoFicha = new THREE.CylinderGeometry(0.026, 0.026, 0.0062, 14)
  return _geoFicha
}
const ALT_FICHA = 0.0062
let _geoCarta = null
function geoCarta() {
  if (!_geoCarta) _geoCarta = new THREE.BoxGeometry(0.066, 0.003, 0.093)
  return _geoCarta
}
let _geoDorso = null
function geoDorso() {
  if (!_geoDorso) _geoDorso = new THREE.BoxGeometry(0.052, 0.0012, 0.078)
  return _geoDorso
}

const MAT_FICHA = () => [
  solid(0xf2f0e8, 0.5), solid(0xc8102e, 0.5), solid(0x1f52a8, 0.5),
  solid(0x1f8a4c, 0.5), solid(0x18181c, 0.55), solid(0xd8ab3e, 0.35, 0.6),
]

/** Pilha de fichas: n discos empilhados, com o filete branco da borda. */
function pilhaFichas(g, x, y, z, n, cor, mats) {
  const mat = mats[cor % mats.length]
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(geoFicha(), mat)
    f.position.set(x, y + ALT_FICHA / 2 + i * ALT_FICHA, z)
    f.rotation.y = i * 0.35
    f.castShadow = true
    f.receiveShadow = true
    g.add(f)
  }
}

/**
 * Carta virada pra baixo. O corpo e BRANCO e o dorso colorido e um retangulo
 * menor por cima: carta inteira na cor do dorso vira um borrao escuro em cima
 * do feltro escuro e ninguem enxerga que tem carta na mesa.
 */
function carta(g, x, y, z, ry, dorso) {
  const c = new THREE.Mesh(geoCarta(), solid(0xf6f3ea, 0.5))
  c.position.set(x, y + 0.0015, z)
  c.rotation.y = ry
  c.castShadow = false
  c.receiveShadow = true
  g.add(c)
  const d = new THREE.Mesh(geoDorso(), dorso)
  d.position.set(x, y + 0.0036, z)
  d.rotation.y = ry
  d.castShadow = false
  g.add(d)
  return c
}

/** Cadeira estofada de mesa de jogo (encosto alto, pes dourados). */
function fazCadeira() {
  const g = new THREE.Group()
  const veludo = M.veludo
  g.add(box(0.50, 0.10, 0.48, veludo, 0, CAD_TOPO - 0.05, 0))
  g.add(box(0.52, 0.06, 0.50, M.ouroFosco, 0, CAD_TOPO - 0.12, 0))
  // encosto inclinado
  const enc = box(0.48, 0.56, 0.09, veludo, 0, CAD_TOPO + 0.32, -0.21)
  enc.rotation.x = -0.12
  g.add(enc)
  g.add(box(0.52, 0.07, 0.11, M.ouro, 0, CAD_TOPO + 0.60, -0.24))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(cyl(0.022, 0.026, CAD_TOPO - 0.15, M.ouroFosco, 8)
        .translateY((CAD_TOPO - 0.15) / 2).translateX(sx * 0.21).translateZ(sz * 0.20))
    }
    g.add(box(0.05, 0.42, 0.05, M.ouroFosco, sx * 0.23, CAD_TOPO + 0.24, -0.20))
  }
  return sombras(g)
}

/** Banqueta alta de bar / de caca-niquel. */
function fazBanqueta(h) {
  const g = new THREE.Group()
  const alt = h || 0.74
  g.add(cyl(0.19, 0.22, 0.05, M.ouroFosco, 14).translateY(0.025))
  g.add(cyl(0.045, 0.045, alt - 0.09, M.ouro, 10).translateY(alt / 2))
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.016, 6, 18), M.ouroFosco)
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.22
  g.add(aro)
  g.add(cyl(0.21, 0.19, 0.10, M.veludo, 16).translateY(alt + 0.04))
  g.add(cyl(0.215, 0.215, 0.03, M.couro, 16).translateY(alt + 0.10))
  return sombras(g)
}

/** Garrafa de bar: corpo, gargalo e tampa, tudo na cor pedida. */
function fazGarrafa(cor, alt) {
  const g = new THREE.Group()
  const m = stdMat('casino-garrafa:' + cor, {
    color: cor, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.82,
  })
  const h = alt || 0.30
  g.add(cyl(0.038, 0.042, h * 0.62, m, 12).translateY(h * 0.31))
  g.add(cyl(0.016, 0.038, h * 0.16, m, 10).translateY(h * 0.70))
  g.add(cyl(0.016, 0.016, h * 0.22, m, 10).translateY(h * 0.89))
  g.add(cyl(0.019, 0.019, 0.022, M.ouro, 10).translateY(h + 0.005))
  const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.0435, h * 0.24, 12, 1, true),
    solid(0xe8dfc8, 0.7))
  rot.position.y = h * 0.32
  g.add(rot)
  return sombras(g)
}

// ===========================================================================
// CAIXA — onde o ouro vira ficha
// ===========================================================================
function buildCaixa(g, colliders, mats) {
  const bancada = (r) => {
    const w = r.x1 - r.x0, d = r.z1 - r.z0
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2
    g.add(box(w, CX.h - 0.10, d, M.madeira, cx, (CX.h - 0.10) / 2, cz))
    g.add(box(w + 0.08, 0.08, d + 0.08, M.preto, cx, CX.h - 0.04, cz))       // tampo
    g.add(box(w + 0.04, 0.12, d + 0.04, M.ouroFosco, cx, 0.06, cz))          // rodape
    g.add(box(w - 0.1, 0.06, 0.03, M.ouro, cx, CX.h * 0.55, r.z0 - 0.015))   // filete
    return { cx, cz, w, d }
  }
  const A = bancada(CX)
  bancada(CXL)

  // guiche: vidro ate quase o teto do balcao, com grade dourada e o rasgo por
  // onde passa o dinheiro. E o unico movel do salao que separa jogador de NPC.
  const vh = 0.86
  const vidro = box(A.w - 0.3, vh, 0.03, M.vidroCaixa, A.cx, CX.h + vh / 2 + 0.02, CX.z0 + 0.1)
  vidro.castShadow = false
  g.add(vidro)
  for (const s of [-1, 1]) {
    g.add(box(0.07, vh + 0.12, 0.09, M.ouro, A.cx + s * (A.w / 2 - 0.13), CX.h + vh / 2 + 0.02, CX.z0 + 0.1))
  }
  g.add(box(A.w - 0.24, 0.09, 0.11, M.ouro, A.cx, CX.h + vh + 0.08, CX.z0 + 0.1))
  // grade: 7 barras verticais + 3 horizontais
  for (let i = 0; i < 7; i++) {
    g.add(box(0.035, vh, 0.035, M.ouroFosco, CX.x0 + 0.4 + i * ((A.w - 0.8) / 6), CX.h + vh / 2 + 0.02, CX.z0 + 0.1))
  }
  for (let i = 0; i < 3; i++) {
    g.add(box(A.w - 0.34, 0.03, 0.03, M.ouroFosco, A.cx, CX.h + 0.18 + i * 0.30, CX.z0 + 0.1))
  }
  // bandeja de troca no tampo
  const bandeja = box(0.52, 0.03, 0.30, M.cromo, A.cx, CX.h + 0.02, CX.z0 - 0.02)
  bandeja.castShadow = false
  g.add(bandeja)

  // placa suspensa: e ela que responde "onde compro ficha?" antes de o jogador
  // precisar chegar perto o bastante pro rotulo de interacao aparecer
  const placa = new THREE.Group()
  placa.position.set(A.cx, 2.62, CX.z0 - 0.05)
  placa.add(box(3.5, 0.86, 0.10, M.preto, 0, 0, 0))
  const matPlaca = emissive(0xffc93c, 2.0)
  for (const s of [-1, 1]) {
    const e = box(3.6, 0.07, 0.14, matPlaca, 0, s * 0.46, 0)
    e.castShadow = false
    placa.add(e)
  }
  const t1 = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.34), textPlaneMat('CAIXA', {
    w: 1024, h: 112, color: '#fff3d2', font: 'bold 92px "Trebuchet MS", sans-serif',
    glow: '#ffc93c', emissiveIntensity: 1.4,
  }))
  // A placa fica sobre o balcao e quem le esta do lado -Z (o lado da porta),
  // entao os dois planos de texto viram de costas pro guiche.
  t1.position.set(0, 0.20, -0.06)
  t1.rotation.y = Math.PI
  placa.add(t1)
  const t2 = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.26), textPlaneMat('TROQUE SEU OURO POR FICHAS', {
    w: 1024, h: 84, color: '#e9f4ff', font: 'bold 56px "Trebuchet MS", sans-serif',
    glow: '#63d5ff', emissiveIntensity: 1.0,
  }))
  t2.position.set(0, -0.16, -0.06)
  t2.rotation.y = Math.PI
  placa.add(t2)
  for (const c2 of placa.children) c2.castShadow = false
  // tirantes ate o forro
  for (const s of [-1, 1]) {
    const lc = CEIL - 0.24 - 3.05
    placa.add(cyl(0.012, 0.012, lc, M.cromo, 6).translateY(0.43 + lc / 2).translateX(s * 1.5))
  }
  g.add(placa)

  // fichas expostas no tampo, atras do vidro (a vitrine da mercadoria)
  for (let i = 0; i < 6; i++) {
    pilhaFichas(g, CX.x0 + 0.7 + i * 0.28, CX.h + 0.03, CX.z1 - 0.26, 5 + (i % 4) * 4, i, mats)
  }
  // gaveta de ouro: barrinhas empilhadas do lado de dentro
  for (let i = 0; i < 5; i++) {
    const b2 = box(0.16, 0.045, 0.075, M.ouro, CX.x1 - 0.55, CX.h + 0.045 + (i > 2 ? 0.045 : 0), CX.z1 - 0.5 + (i % 3) * 0.10)
    b2.rotation.y = 0.1 * i
    g.add(b2)
  }
  // monitor do caixa virado pra atendente
  const mon = box(0.44, 0.28, 0.03, M.grafite, A.cx + 1.5, CX.h + 0.24, CX.z1 - 0.2)
  mon.rotation.y = Math.PI + 0.3
  g.add(mon)
  g.add(cyl(0.05, 0.09, 0.10, M.grafite, 10).translateX(A.cx + 1.5).translateY(CX.h + 0.05).translateZ(CX.z1 - 0.2))

  colliders.push({ minX: CX.x0, maxX: CX.x1, minZ: CX.z0, maxZ: CX.z1, tag: 'cassino-caixa' })
  colliders.push({ minX: CXL.x0, maxX: CXL.x1, minZ: CXL.z0, maxZ: CXL.z1, tag: 'cassino-caixa' })
}

// ===========================================================================
// BLACKJACK — mesa semicircular, atendente do lado reto
// ===========================================================================
function buildBlackjack(g, colliders, mats) {
  const r = BJ.r
  const yT = 0.92                       // altura do feltro
  const u = new THREE.Group()
  u.position.set(BJ.x, 0, BJ.z)         // origem no MEIO DA CORDA reta

  // Tampo em D: meio cilindro com thetaStart PI/2, que joga o arco pro -Z (o
  // lado dos jogadores). A corda fica em z=0, que e onde a atendente encosta.
  const tampo = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.10, 44, 1, false, Math.PI / 2, Math.PI), M.feltroVerde)
  tampo.position.y = yT - 0.05
  sombras(tampo)
  u.add(tampo)
  // saia de madeira e base
  const saia = new THREE.Mesh(
    new THREE.CylinderGeometry(r - 0.02, r - 0.16, yT - 0.12, 40, 1, false, Math.PI / 2, Math.PI), M.madeira)
  saia.position.y = (yT - 0.12) / 2
  sombras(saia)
  u.add(saia)
  u.add(box(r * 2 - 0.2, yT - 0.12, 0.24, M.madeira, 0, (yT - 0.12) / 2, -0.1))

  // borda estofada: meio toro no arco + travessa reta na corda
  const borda = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 8, 34, Math.PI), M.couro)
  borda.rotation.x = -Math.PI / 2
  borda.position.y = yT
  sombras(borda)
  u.add(borda)
  u.add(box(r * 2, 0.15, 0.16, M.couro, 0, yT, -0.02))

  // arco de aposta + as 5 posicoes marcadas no feltro
  //
  // 0xe8dcb4 era quase branco: multiplicado pela luz do salao o arco passava do
  // threshold do bloom (0.85 em core/engine.js) e a linha de tinta virava um
  // tubo de neon deitado no pano — repare que na foto antiga ela brilha MAIS
  // que a lampada do lustre. 0x9e9068 e a mesma cor de creme com metade da
  // reflexao: continua o traco mais claro do pano e nao acende nada.
  const linha = solid(0x9e9068, 0.92)
  const arco = new THREE.Mesh(new THREE.RingGeometry(1.36, 1.40, 46, 1, 0, Math.PI), linha)
  arco.rotation.x = -Math.PI / 2
  arco.position.y = yT + 0.006
  arco.castShadow = false
  u.add(arco)
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 2 + Math.PI * ((i + 0.5) / 5)
    const px = Math.sin(a) * 1.18, pz = Math.cos(a) * 1.18
    const anel = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.185, 22), linha)
    anel.rotation.x = -Math.PI / 2
    anel.position.set(px, yT + 0.006, pz)
    anel.castShadow = false
    u.add(anel)
    // duas cartas viradas em duas das posicoes: mesa em jogo, nao mesa de loja
    if (i === 1 || i === 3) {
      const dorso = solid(0x8c1224, 0.55)
      carta(u, px - 0.05, yT + 0.010, pz + 0.03, 0.2 + i, dorso)
      carta(u, px + 0.04, yT + 0.010, pz - 0.02, -0.4 + i, dorso)
      pilhaFichas(u, px, yT + 0.010, pz + 0.16, 4 + i, i, mats)
    }
  }
  // As duas linhas impressas no feltro. As DUAS saem de regras que
  // cassino/blackjack.js cumpre de verdade: o natural devolve aposta * 2.5
  // (3:2) e o laco do dealer e `while (v.valor < 17) comprar()`, que para em
  // 17 inclusive no 17 macio. Uma mesa de verdade tambem imprime a linha do
  // seguro, mas aqui nao existe seguro pra comprar — regra impressa que o
  // caixa nao paga e a mesma promessa falsa que o cartaz da caca-niquel evita
  // lendo o multiplicador da tabela em vez de digitar um numero.
  //
  // A COR DELAS E TINTA, NAO LAMPADA (ver TINTA_* la em cima). O #f0e4b8 de
  // antes tinha 0,87 de luminancia linear; multiplicado pela luz que chega no
  // pano ele saia da cena com radiancia ~1,5 — quase o dobro do threshold do
  // bloom — e o que a foto mostrava era letra branca chapada com halo, lendo
  // como letreiro de neon deitado na mesa. Tinta impressa nao emite.
  const l1 = decalChao(1.9, 0.20, textPlaneMat('BLACKJACK PAGA 3 PARA 2', {
    w: 1024, h: 108, color: TINTA_CREME, font: 'bold 74px "Trebuchet MS", sans-serif',
    emissiveIntensity: TINTA_EMI,
  }), 0, yT + 0.008, -0.75)
  l1.material.name = 'feltro-regra-bj1'
  u.add(tintaNoPano(l1))
  const l2 = decalChao(1.6, 0.15, textPlaneMat('A CASA PARA EM QUALQUER 17', {
    w: 1024, h: 96, color: '#8e8259', font: 'bold 60px "Trebuchet MS", sans-serif',
    emissiveIntensity: TINTA_EMI,
  }), 0, yT + 0.008, -1.62)
  l2.material.name = 'feltro-regra-bj2'
  u.add(tintaNoPano(l2))

  // SHOE (suporte de cartas) na mao esquerda da atendente
  const shoe = new THREE.Group()
  shoe.position.set(0.78, yT, -0.42)
  shoe.rotation.y = -0.5
  shoe.add(box(0.19, 0.12, 0.30, M.grafite, 0, 0.06, 0))
  const rampa = box(0.19, 0.03, 0.30, M.pretoLuz, 0, 0.14, 0)
  rampa.rotation.x = -0.34
  shoe.add(rampa)
  shoe.add(box(0.21, 0.04, 0.05, M.ouroFosco, 0, 0.02, 0.16))
  const baralho = box(0.16, 0.07, 0.10, solid(0x8c1224, 0.6), 0, 0.16, -0.06)
  baralho.rotation.x = -0.34
  shoe.add(baralho)
  sombras(shoe)
  u.add(shoe)
  // descarte
  const desc = box(0.20, 0.14, 0.24, M.grafite, -0.85, yT + 0.07, -0.40)
  desc.rotation.y = 0.4
  sombras(desc)
  u.add(desc)

  // RACK de fichas da casa, encaixado na corda
  const rack = new THREE.Group()
  rack.position.set(0, yT, -0.20)
  rack.add(box(0.86, 0.07, 0.26, M.madeira, 0, 0.035, 0))
  for (let i = 0; i < 5; i++) {
    const x = -0.32 + i * 0.16
    rack.add(box(0.02, 0.09, 0.24, M.ouroEscuro, x + 0.08, 0.09, 0))
    pilhaFichas(rack, x, 0.07, 0, 9, i, mats)
  }
  rack.add(box(0.02, 0.09, 0.24, M.ouroEscuro, -0.40, 0.09, 0))
  sombras(rack)
  u.add(rack)

  g.add(u)

  // 4 banquetas no arco, deixando o meio (z = -r) livre: e por ali que o
  // jogador chega no ponto de interacao sem esbarrar em movel.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 2 + Math.PI * ((i + 0.5) / 4)
    const px = BJ.x + Math.sin(a) * (r + 0.62), pz = BJ.z + Math.cos(a) * (r + 0.62)
    const bq = fazBanqueta(0.70)
    bq.position.set(px, 0, pz)
    g.add(bq)
    colliders.push({ minX: px - 0.2, maxX: px + 0.2, minZ: pz - 0.2, maxZ: pz + 0.2, tag: 'cassino-banqueta' })
  }

  // colisor: a caixa do D inteiro (o arco cabe dentro dela com folga de 3 cm)
  colliders.push({
    minX: BJ.x - r, maxX: BJ.x + r,
    minZ: BJ.z - r, maxZ: BJ.z + 0.24, tag: 'cassino-blackjack',
  })
}

// ===========================================================================
// POKER — mesa oval de heads-up, so duas cadeiras
// ===========================================================================
/** @returns {THREE.Group} o par de cartas de enfeite do feltro (ver abaixo). */
function buildPoker(g, colliders, mats) {
  const yT = 0.78                       // mesa de poker e mais baixa: joga-se sentado
  const u = new THREE.Group()
  u.position.set(PK.x, 0, PK.z)

  // O oval sai de um cilindro escalado: 40 lados a 1.55 m de raio ja leem como
  // curva lisa e nao paga o preco de uma LatheGeometry.
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.09, 40), M.feltroAzul)
  tampo.scale.set(PK.rx, 1, PK.rz)
  tampo.position.y = yT - 0.045
  sombras(tampo)
  u.add(tampo)
  const saia = new THREE.Mesh(new THREE.CylinderGeometry(0.99, 0.88, yT - 0.10, 34), M.madeira)
  saia.scale.set(PK.rx, 1, PK.rz)
  saia.position.y = (yT - 0.10) / 2
  sombras(saia)
  u.add(saia)
  // borda estofada acompanhando o oval
  const borda = new THREE.Mesh(new THREE.TorusGeometry(1, 0.085, 8, 40), M.couro)
  borda.rotation.x = -Math.PI / 2
  borda.scale.set(PK.rx, PK.rz, 1)
  borda.position.y = yT
  sombras(borda)
  u.add(borda)
  // pe central em cruz
  u.add(box(0.30, yT - 0.14, 0.30, M.madeira, 0, (yT - 0.14) / 2, 0))
  for (const a of [0, Math.PI / 2]) {
    const p = box(1.7, 0.10, 0.26, M.ouroEscuro, 0, 0.05, 0)
    p.rotation.y = a
    sombras(p)
    u.add(p)
  }

  // Linha de aposta desenhada no feltro. Mesmo caso do arco do blackjack:
  // 0xd9e4f2 e branco de fato e o anel saia da cena acima do threshold do
  // bloom — na foto antiga ele e um aro de neon em volta do pote.
  const linha = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 44), solid(0x8e9cb2, 0.92))
  linha.rotation.x = -Math.PI / 2
  linha.scale.set(0.62 * PK.rx, 0.62 * PK.rz, 1)
  linha.position.y = yT + 0.006
  linha.castShadow = false
  u.add(linha)
  const marca = decalChao(1.6, 0.20, textPlaneMat('MAO A MAO - DUAS CARTAS', {
    w: 1024, h: 128, color: TINTA_AZUL, font: 'bold 66px "Trebuchet MS", sans-serif',
    emissiveIntensity: TINTA_EMI,
  }), 0, yT + 0.008, -0.42)
  marca.material.name = 'feltro-regra-pk'
  u.add(tintaNoPano(marca))

  // Duas cartas viradas na frente de cada lugar: e "heads up de duas cartas".
  //
  // ELAS VIVEM NUM GRUPO PROPRIO, e nao e organizacao: e o unico jeito de a
  // mesa 3D poder APAGA-LAS enquanto alguem esta jogando. Antes as cartas vivas
  // pousavam exatamente em cima deste par e o escondiam por serem maiores em
  // toda borda; agora elas ficam de pe e mais pra frente (ver LAYOUT.poker em
  // cassino/mesa-3d.js), e o que sobrava embaixo era um TERCEIRO par fantasma
  // no feltro. 'noBake' porque bakeStatic funde mesh estatica e levaria junto a
  // referencia que o grupo precisa ter pra sumir.
  const enfeite = new THREE.Group()
  enfeite.name = 'poker-cartas-enfeite'
  enfeite.userData.noBake = true
  const dorso = solid(0x14315f, 0.55)
  const dorso2 = solid(0x8c1224, 0.55)
  for (const s of [-1, 1]) {
    const zc = s * 0.62
    carta(enfeite, -0.06, yT + 0.010, zc, 0.06, s > 0 ? dorso : dorso2)
    carta(enfeite, 0.06, yT + 0.010, zc, -0.05, s > 0 ? dorso : dorso2)
  }
  u.add(enfeite)
  // botao do dealer
  const bt = new THREE.Mesh(geoFicha(), solid(0xf4f2ea, 0.4))
  bt.scale.set(1.5, 2.2, 1.5)
  bt.position.set(-0.55, yT + 0.016, 0.18)
  u.add(bt)
  // pote no meio
  for (let i = 0; i < 5; i++) {
    pilhaFichas(u, -0.22 + i * 0.11, yT + 0.010, -0.05, 3 + (i % 3) * 3, (i + 2) % 6, mats)
  }
  // a muralha de fichas do ricaco (lado +Z) contra as poucas do jogador
  for (let i = 0; i < 6; i++) {
    pilhaFichas(u, -0.42 + i * 0.15, yT + 0.010, 0.74, 6 + (i % 4) * 3, (i + 1) % 6, mats)
  }
  for (let i = 0; i < 3; i++) {
    pilhaFichas(u, -0.18 + i * 0.15, yT + 0.010, -0.74, 4, i, mats)
  }

  // copo de uisque e charuto apagado no cinzeiro, do lado do ricaco
  const copo = new THREE.Group()
  copo.position.set(0.92, yT, 0.52)
  const vidroCopo = glass(0xdfeef5, 0.30)
  copo.add(cyl(0.042, 0.038, 0.10, vidroCopo, 14).translateY(0.05))
  copo.add(cyl(0.038, 0.034, 0.045, solid(0xb5761f, 0.25), 14).translateY(0.032))
  copo.add(cyl(0.042, 0.042, 0.012, vidroCopo, 14).translateY(0.006))
  sombras(copo)
  u.add(copo)
  const cinz = new THREE.Group()
  cinz.position.set(-0.95, yT, 0.50)
  cinz.add(cyl(0.085, 0.075, 0.030, solid(0x2a2b30, 0.35, 0.4), 16).translateY(0.015))
  const charuto = cyl(0.011, 0.013, 0.13, solid(0x6b4425, 0.85), 8)
  charuto.rotation.z = Math.PI / 2
  charuto.rotation.y = 0.4
  charuto.position.set(0.02, 0.036, 0)
  cinz.add(charuto)
  cinz.add(box(0.018, 0.008, 0.014, solid(0x1a1a1a, 0.95), -0.055, 0.036, -0.026))
  sombras(cinz)
  u.add(cinz)

  g.add(u)

  // --- cadeiras: a do ricaco e a VAZIA do jogador -------------------------
  const cRicaco = fazCadeira()
  cRicaco.position.set(PK_NPC.x, 0, PK_NPC.z)
  cRicaco.rotation.y = Math.PI            // encosto pro fundo, olhando pra -Z
  g.add(cRicaco)
  const cVazia = fazCadeira()
  cVazia.position.set(PK_VAZIA.x, 0, PK_VAZIA.z)
  g.add(cVazia)
  // seta discreta no carpete indicando o lugar do jogador
  g.add(decalChao(0.9, 0.22, textPlaneMat('SEU LUGAR', {
    w: 512, h: 128, color: '#e8c86a', font: 'bold 72px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.25,
  }), PK_VAZIA.x, 0.02, PK_VAZIA.z - 0.75))

  colliders.push({
    minX: PK.x - PK.rx - 0.1, maxX: PK.x + PK.rx + 0.1,
    minZ: PK.z - PK.rz - 0.1, maxZ: PK.z + PK.rz + 0.1, tag: 'cassino-poker',
  })
  for (const c2 of [PK_NPC, PK_VAZIA]) {
    colliders.push({ minX: c2.x - 0.28, maxX: c2.x + 0.28, minZ: c2.z - 0.28, maxZ: c2.z + 0.28, tag: 'cassino-cadeira' })
  }
  return enfeite
}

// ===========================================================================
// CACA-NIQUEIS — tres gabinetes com roletes que giram de verdade
// ===========================================================================

/**
 * Um gabinete. Nasce em espaco LOCAL com a frente em +Z e a origem no chao;
 * quem posiciona e o buildSlots. Devolve os 3 tambores pro update animar.
 *
 * O que e dinamico aqui e SO o grupo dos roletes: o resto (inclusive as
 * lampadas da moldura, que piscam) e mesh estatico com material animado, entao
 * o forno funde tudo e a maquina inteira sai por meia duzia de draw calls.
 */
function fazCacaNiquel(idx, matsFase, matRolete) {
  const g = new THREE.Group()
  const W = SLOT_W, D = SLOT_D, fz = D / 2

  // Corpo em tres pedacos porque a janela dos roletes TEM que ser um vazio:
  // um gabinete macico deixaria os tambores enterrados dentro da madeira e a
  // janela ficaria um retangulo preto.
  const jy0 = 1.00, jy1 = 1.36, jcy = (jy0 + jy1) / 2
  g.add(box(W, 0.22, D, M.preto, 0, 0.11, 0))
  g.add(box(W - 0.06, jy0 - 0.22, D, M.vinho, 0, (0.22 + jy0) / 2, 0))
  g.add(box(W - 0.06, 1.46 - jy1, D, M.vinho, 0, (jy1 + 1.46) / 2, 0))
  for (const s of [-1, 1]) {          // montantes ao lado do vao
    g.add(box(0.06, jy1 - jy0, D, M.vinho, s * (W / 2 - 0.06), jcy, 0))
  }
  // caixa escura envolvendo os tambores por tras e por baixo
  g.add(box(W - 0.06, jy1 - jy0, 0.26, M.pretoLuz, 0, jcy, -D / 2 + 0.13))
  g.add(box(W, 0.10, D + 0.04, M.ouroFosco, 0, 0.27, 0))
  // Frente inclinada com os botoes. Painel e botoes moram no MESMO grupo
  // girado: posicionar botao por botao em coordenadas do mundo poe todos eles
  // boiando 20 cm na frente da chapa (a inclinacao empurra a superficie).
  const botoes = new THREE.Group()
  // Adiantado 12 cm da face do gabinete: com o deck rente a chapa a
  // inclinacao joga a superficie PRA DENTRO do corpo e os botoes somem.
  botoes.position.set(0, 0.90, fz + 0.12)
  botoes.rotation.x = -0.55
  botoes.add(box(W - 0.18, 0.14, 0.26, M.grafite, 0, 0, 0))
  botoes.add(box(W - 0.16, 0.04, 0.28, M.ouroFosco, 0, -0.08, 0))
  const corBotao = [0xd8342f, 0xf0b429, 0x35a85c, 0x3a7fd5, 0xf0f0ea]
  for (let i = 0; i < 5; i++) {
    const b2 = cyl(0.040, 0.040, 0.034, solid(corBotao[i], 0.35), 14)
    b2.position.set(-0.34 + i * 0.17, 0.086, 0.0)
    botoes.add(b2)
  }
  sombras(botoes)
  g.add(botoes)
  // bandeja de moedas
  g.add(box(W - 0.30, 0.02, 0.14, M.pretoLuz, 0, 0.56, fz + 0.03))
  g.add(box(W - 0.30, 0.16, 0.03, M.grafite, 0, 0.64, fz + 0.09))
  g.add(box(W - 0.26, 0.06, 0.16, M.cromo, 0, 0.55, fz + 0.04))
  const marcaBandeja = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.42, 0.13), textPlaneMat('PAGAMENTO', {
    w: 512, h: 96, color: '#e8c86a', font: 'bold 60px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.3,
  }))
  marcaBandeja.position.set(0, 0.74, fz + 0.006)
  marcaBandeja.castShadow = false
  g.add(marcaBandeja)

  // --- moldura da janela dos roletes --------------------------------------
  g.add(box(W - 0.02, 0.09, 0.10, M.ouro, 0, jy1 + 0.045, fz + 0.005))
  g.add(box(W - 0.02, 0.09, 0.10, M.ouro, 0, jy0 - 0.045, fz + 0.005))
  for (const s of [-1, 1]) {
    g.add(box(0.10, jy1 - jy0 + 0.18, 0.10, M.ouro, s * 0.52, jcy, fz + 0.005))
  }
  const vidro = box(W - 0.16, jy1 - jy0, 0.02, glass(0xdcecf5, 0.14), 0, jcy, fz - 0.015)
  vidro.castShadow = false
  g.add(vidro)

  // tambores
  const roletes = []
  const dinamico = new THREE.Group()
  dinamico.userData.dynamic = true       // o forno nao pode fundir o que gira
  const geoTambor = geoTamborRolete()
  for (let i = 0; i < 3; i++) {
    const drum = new THREE.Group()
    drum.position.set(-0.34 + i * 0.34, jcy, 0.14)
    const m = new THREE.Mesh(geoTambor, matRolete)
    m.rotation.z = Math.PI / 2           // deita o eixo do tambor no X local
    m.castShadow = false
    m.receiveShadow = true
    drum.add(m)
    dinamico.add(drum)
    // Comeca com um simbolo CENTRADO na janela. Com rotacao zero a janela
    // pegaria a emenda entre a ultima parada e a primeira, e a maquina nasceria
    // parecendo quebrada.
    const ang0 = (Math.PI * 2 * (((i + idx * 2) % N_SIM) + 0.5)) / N_SIM
    drum.rotation.x = ang0
    roletes.push({ obj: drum, ang: ang0, fase: 0, t: 0, tParar: 0, alvo: 0, a0: 0, a1: 0 })
  }
  g.add(dinamico)
  // Separadores entre os roletes, rentes ao vidro: recuados eles esbarrariam
  // na barriga do tambor, que avanca ate z = 0.396.
  for (const s of [-1, 1]) {
    g.add(box(0.035, jy1 - jy0, 0.04, M.ouroEscuro, s * 0.17, jcy, fz))
  }

  // --- travessa + painel de premios --------------------------------------
  g.add(box(W + 0.04, 0.08, D + 0.04, M.ouro, 0, 1.50, 0))
  g.add(box(W - 0.04, 0.48, D - 0.10, M.preto, 0, 1.78, 0))
  const matPainel = emissive(0xff7ad0, 1.9).clone()
  // O multiplicador do cartaz sai da MESMA tabela que paga o giro. Numero
  // digitado na mao aqui e uma promessa que o caixa nao cumpre.
  const idCartaz = ['sete', 'diamante', 'estrela'][idx % 3]
  const simCartaz = SIM_SLOT.find((s) => s.id === idCartaz)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.14, 0.42), textPlaneMat(
    'TRINCA DE ' + (simCartaz ? simCartaz.nome : idCartaz).toUpperCase()
    + ' PAGA ' + (PAGAMENTOS.trinca[idCartaz] || 0) + 'x', {
      w: 768, h: 256, color: '#fff2ff', font: 'bold 84px "Trebuchet MS", sans-serif',
      glow: '#ff7ad0', emissiveIntensity: 1.5,
    }))
  face.position.set(0, 1.78, fz - 0.045)
  face.castShadow = false
  g.add(face)
  const bordaPainel = box(W - 0.06, 0.05, 0.06, matPainel, 0, 1.55, fz - 0.05)
  bordaPainel.castShadow = false
  g.add(bordaPainel)
  const bordaPainel2 = box(W - 0.06, 0.05, 0.06, matPainel, 0, 2.01, fz - 0.05)
  bordaPainel2.castShadow = false
  g.add(bordaPainel2)

  // topo curvo: cilindro deitado no X, com a metade de baixo dentro do corpo
  const matTopo = emissive(0xffd24a, 1.7).clone()
  const topo = cyl(0.26, 0.26, W, matTopo, 18)
  topo.rotation.z = Math.PI / 2
  topo.position.set(0, 2.02, -0.01)
  topo.castShadow = false
  g.add(topo)
  g.add(box(W + 0.06, 0.06, D - 0.16, M.ouro, 0, 2.03, 0))
  const nomeTopo = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.2, 0.26), textPlaneMat('ESTRELA', {
    w: 512, h: 160, color: '#3a1a00', font: 'bold 108px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.15,
  }))
  nomeTopo.position.set(0, 2.10, 0.235)
  nomeTopo.rotation.x = -0.55
  nomeTopo.castShadow = false
  g.add(nomeTopo)

  // --- alavanca vermelha do lado direito ---------------------------------
  // Direita de quem OLHA a maquina: o jogador encara a frente (+Z), entao a
  // direita dele e o +X local.
  const alav = new THREE.Group()
  alav.position.set(W / 2 + 0.03, 1.05, 0.12)
  alav.add(cyl(0.062, 0.068, 0.11, M.cromo, 12).rotateZ(Math.PI / 2))
  const haste = cyl(0.026, 0.026, 0.48, M.cromo, 10)
  haste.position.set(0.07, 0.20, 0.07)
  haste.rotation.z = -0.30
  haste.rotation.x = -0.22
  alav.add(haste)
  const bola = sphere(0.075, solid(0xd8342f, 0.32), 14)
  bola.position.set(0.21, 0.41, 0.15)
  alav.add(bola)
  sombras(alav)
  g.add(alav)

  // --- moldura de lampadas correndo --------------------------------------
  const bulbo = new THREE.SphereGeometry(0.045, 8, 6)
  let n = idx                    // desencontra a fase entre as tres maquinas
  const por = (x, y) => {
    const m = new THREE.Mesh(bulbo, matsFase[n % matsFase.length])
    m.position.set(x, y, fz + 0.03)
    m.castShadow = false
    g.add(m)
    n++
  }
  for (let i = 0; i <= 9; i++) {
    const y = 0.34 + i * ((2.0 - 0.34) / 9)
    por(-W / 2 - 0.01, y)
    por(W / 2 + 0.01, y)
  }
  for (let i = 1; i < 6; i++) por(-W / 2 + i * (W / 6), 2.05)

  // pes: a maquina nao pode parecer colada no carpete
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.09, 0.06, 0.09, M.grafite, sx * (W / 2 - 0.1), 0.03, sz * (D / 2 - 0.1)))
    }
  }

  // Sem sombras() em cima de tudo de proposito: box/cyl/sphere ja marcam a
  // sombra, e uma varredura cega poria castShadow nas lampadas da moldura.
  // Isso as tiraria do balde do forno das OUTRAS lampadas (o forno separa por
  // material + flags de sombra) e a corrida de luzes viraria 6 draw calls.
  return { grupo: g, roletes, matPainel, matTopo, festaT: 0, parados: 3, aoTerminar: null }
}

/** O tambor e IGUAL nas 9 unidades: uma geometria so pro modulo. */
let _geoTambor = null
function geoTamborRolete() {
  if (!_geoTambor) _geoTambor = new THREE.CylinderGeometry(ROL_R, ROL_R, ROL_L, 26, 1, true)
  return _geoTambor
}

function buildSlots(g, colliders, interactables, matsFase) {
  const matRolete = stdMat('casino-rolete', {
    // O salao e escuro de proposito; sem um emissivo generoso o rolete some
    // atras do vidro e a janela vira um buraco preto.
    map: roleteTex(), roughness: 0.55, metalness: 0.05,
    emissive: 0xffffff, emissiveMap: roleteTex(), emissiveIntensity: 0.62,
  })
  const maquinas = []
  for (let i = 0; i < 3; i++) {
    const m = fazCacaNiquel(i, matsFase, matRolete)
    m.grupo.position.set(SLOT_X, 0, SLOT_Z[i])
    m.grupo.rotation.y = Math.PI / 2          // frente local (+Z) vira +X: olha pro salao
    g.add(m.grupo)
    maquinas.push(m)

    // A frente local vira +X, entao a LARGURA do gabinete deita no Z do mundo.
    colliders.push({
      minX: SLOT_X - SLOT_D / 2, maxX: SLOT_X + SLOT_D / 2,
      minZ: SLOT_Z[i] - SLOT_W / 2 - 0.04, maxZ: SLOT_Z[i] + SLOT_W / 2 + 0.04,
      tag: 'cassino-slot',
    })
    interactables.push({
      id: 'cassino-slot-' + i,
      position: new THREE.Vector3(SLOT_X + SLOT_D / 2 + 0.85, BASE + 1.15, SLOT_Z[i]),
      radius: 1.9,
      label: 'Jogar na caca-niquel',
      onInteract: (gm) => gm.cassino && gm.cassino.abrirSlot(i),
    })
  }

  // Banquetas na frente das maquinas, COM colisor. Sem ele o jogador ficaria
  // em pe dentro do estofado; com ele para a 0.55 m do ponto de interacao, que
  // tem raio 1.9 — sobra folga de sobra pro rotulo aparecer.
  const bqX = SLOT_X + SLOT_D / 2 + 0.80
  for (let i = 0; i < 3; i++) {
    const bq = fazBanqueta(0.66)
    bq.position.set(bqX, 0, SLOT_Z[i])
    g.add(bq)
    colliders.push({
      minX: bqX - 0.21, maxX: bqX + 0.21,
      minZ: SLOT_Z[i] - 0.21, maxZ: SLOT_Z[i] + 0.21, tag: 'cassino-banqueta',
    })
  }

  // letreiro da fileira, na parede acima das maquinas
  const placa = new THREE.Group()
  placa.position.set(IN.x0 + 0.10, 2.85, SLOT_Z[1])
  placa.rotation.y = Math.PI / 2
  placa.add(box(4.2, 0.72, 0.10, M.preto, 0, 0, 0))
  const matBorda = emissive(0x2fd6ff, 2.0)
  for (const s of [-1, 1]) {
    const e = box(4.3, 0.06, 0.14, matBorda, 0, s * 0.39, 0)
    e.castShadow = false
    placa.add(e)
  }
  const t = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 0.5), textPlaneMat('CACA-NIQUEIS', {
    w: 1024, h: 160, color: '#eafaff', font: 'bold 116px "Trebuchet MS", sans-serif',
    glow: '#2fd6ff', emissiveIntensity: 1.5,
  }))
  t.position.set(0, 0, 0.06)
  t.castShadow = false
  placa.add(t)
  g.add(placa)

  return maquinas
}

// ===========================================================================
// BAR do fundo + juice do salao
// ===========================================================================
function buildBar(g, colliders) {
  const w = BAR.x1 - BAR.x0, d = BAR.z1 - BAR.z0
  const cx = (BAR.x0 + BAR.x1) / 2, cz = (BAR.z0 + BAR.z1) / 2

  g.add(box(w, BAR.h - 0.08, d, M.madeira, cx, (BAR.h - 0.08) / 2, cz))
  g.add(box(w + 0.16, 0.08, d + 0.16, M.preto, cx, BAR.h - 0.04, cz))
  g.add(box(w + 0.06, 0.14, d + 0.06, M.ouroFosco, cx, 0.07, cz))
  g.add(box(w - 0.2, 0.05, 0.03, M.ouro, cx, BAR.h * 0.62, BAR.z0 - 0.02))
  // apoio de pe de latao na frente do balcao
  const apoio = cyl(0.03, 0.03, w - 0.4, M.ouro, 10)
  apoio.rotation.z = Math.PI / 2
  apoio.position.set(cx, 0.22, BAR.z0 - 0.18)
  g.add(apoio)

  // espelho e prateleiras de garrafa na parede do fundo
  const esp = painel(w - 0.6, 2.0, M.espelho, cx, 2.2, IN.z1 - 0.05, Math.PI)
  esp.castShadow = false
  g.add(esp)
  g.add(box(w - 0.4, 0.10, 0.34, M.ouroFosco, cx, 3.24, IN.z1 - 0.2))
  const corGarrafa = [0x8a5a1e, 0x2e6b3a, 0x6b2038, 0x1f3f6b, 0xa8801f, 0x3a2a5c]
  for (let p = 0; p < 3; p++) {
    const y = 1.42 + p * 0.52
    g.add(box(w - 0.8, 0.06, 0.28, M.madeira, cx, y, IN.z1 - 0.2))
    const matLuz = emissive(0xffcf8a, 1.6)
    const l = box(w - 0.9, 0.03, 0.05, matLuz, cx, y + 0.44, IN.z1 - 0.33)
    l.castShadow = false
    g.add(l)
    const n = 14
    for (let i = 0; i < n; i++) {
      const gr = fazGarrafa(corGarrafa[(i + p * 2) % corGarrafa.length], 0.26 + ((i + p) % 3) * 0.04)
      gr.position.set(BAR.x0 + 0.5 + i * ((w - 1.0) / (n - 1)), y + 0.03, IN.z1 - 0.22)
      g.add(gr)
    }
  }
  // copos de cabeca pra baixo no balcao
  for (let i = 0; i < 7; i++) {
    const c2 = cyl(0.032, 0.038, 0.11, glass(0xdfeef5, 0.26), 12)
    c2.position.set(BAR.x0 + 0.8 + i * 0.5, BAR.h + 0.055, cz + 0.2)
    c2.castShadow = false
    g.add(c2)
  }

  // banquetas altas
  for (let i = 0; i < 5; i++) {
    const bx = BAR.x0 + 0.9 + i * ((w - 1.8) / 4)
    const bq = fazBanqueta(0.78)
    bq.position.set(bx, 0, BAR.z0 - 0.78)
    g.add(bq)
    colliders.push({ minX: bx - 0.2, maxX: bx + 0.2, minZ: BAR.z0 - 0.98, maxZ: BAR.z0 - 0.58, tag: 'cassino-banqueta' })
  }

  // neon BOA SORTE acima do espelho
  const bs = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), textPlaneMat('BOA SORTE', {
    w: 1024, h: 224, color: '#ffe9f6', font: 'bold 150px "Trebuchet MS", sans-serif',
    glow: '#ff2f8e', emissiveIntensity: 1.7,
  }))
  bs.position.set(cx, 3.72, IN.z1 - 0.06)
  bs.rotation.y = Math.PI
  bs.castShadow = false
  g.add(bs)
  const matBs = emissive(0xff2f8e, 2.0)
  for (const s of [-1, 1]) {
    const e = box(3.5, 0.06, 0.05, matBs, cx, 3.72 + s * 0.42, IN.z1 - 0.09)
    e.castShadow = false
    g.add(e)
  }

  colliders.push({ minX: BAR.x0, maxX: BAR.x1, minZ: BAR.z0, maxZ: BAR.z1, tag: 'cassino-bar' })
}

/** O que sobra: plantas, quadros, corda de veludo e sujeira de mesa. */
function buildJuice(g, colliders, mats) {
  // corda de veludo canalizando quem entra (dois postes + cordao)
  for (const s of [-1, 1]) {
    const px = B.door.center + s * 2.5
    for (const pz of [IN.z0 + 0.9, IN.z0 + 2.3]) {
      const p = new THREE.Group()
      p.position.set(px, 0, pz)
      p.add(cyl(0.17, 0.19, 0.05, M.ouroFosco, 14).translateY(0.025))
      p.add(cyl(0.032, 0.032, 0.82, M.ouro, 10).translateY(0.43))
      p.add(sphere(0.068, M.ouro, 12).translateY(0.88))
      sombras(p)
      g.add(p)
      colliders.push({ minX: px - 0.14, maxX: px + 0.14, minZ: pz - 0.14, maxZ: pz + 0.14, tag: 'cassino-poste' })
    }
    const c2 = cyl(0.026, 0.026, 1.4, M.veludo, 8)
    c2.position.set(px, 0.72, IN.z0 + 1.6)
    c2.rotation.x = Math.PI / 2
    c2.castShadow = false
    g.add(c2)
  }

  // plantas nos cantos (props.js resolve o vaso e a folhagem)
  const plantas = [
    [IN.x0 + 0.9, IN.z0 + 1.0, 3], [IN.x1 - 0.9, IN.z0 + 1.0, 7],
    [IN.x0 + 0.9, IN.z1 - 1.0, 11],
    [IN.x1 - 0.9, 21.0, 9],
  ]
  // A quinta planta ficava em (IN.x1-0.9, IN.z1-1.0) — o canto nordeste, que
  // hoje e DENTRO da cozinha (world/casino-cozinha.js). Ela sai daqui e nao da
  // limpeza de la: construir um vaso pra outro modulo apagar no quadro seguinte
  // e trabalho que o jogador paga em malha e ninguem ve.
  for (const p of plantas) {
    if (typeof Props.makePotPlant !== 'function') break
    const o = Props.makePotPlant(p[2])
    o.position.set(p[0], 0, p[1])
    o.rotation.y = p[2]
    sombras(o)
    g.add(o)
    colliders.push({ minX: p[0] - 0.28, maxX: p[0] + 0.28, minZ: p[1] - 0.28, maxZ: p[1] + 0.28, tag: 'cassino-planta' })
  }

  // quadros na parede leste (a unica parede grande sem movel encostado)
  if (typeof Props.makeFramedPicture === 'function') {
    // O terceiro quadro ficava em z=26.5, que hoje e parede DE DENTRO da
    // cozinha — sairia virado pro azulejo. Mesma razao da quinta planta acima.
    const quadros = [[19.6, 2.3, 12], [21.6, 2.3, 21]]
    for (const q of quadros) {
      const pic = Props.makeFramedPicture(1.1, 1.4, 'abstract', q[2])
      pic.position.set(IN.x1 - 0.07, q[1], q[0])
      pic.rotation.y = -Math.PI / 2
      sombras(pic)
      g.add(pic)
    }
  }

  // mesinhas de canto com fichas e um baralho esquecido
  const dorso = solid(0x8c1224, 0.55)
  for (const m of [[17.2, 21.4], [31.6, 20.4]]) {
    const t = new THREE.Group()
    t.position.set(m[0], 0, m[1])
    t.add(cyl(0.30, 0.34, 0.05, M.ouroFosco, 16).translateY(0.025))
    t.add(cyl(0.05, 0.05, 0.62, M.ouro, 10).translateY(0.33))
    t.add(cyl(0.42, 0.42, 0.06, M.madeira, 22).translateY(0.67))
    sombras(t)
    g.add(t)
    pilhaFichas(g, m[0] - 0.12, 0.70, m[1] + 0.06, 7, 1, mats)
    pilhaFichas(g, m[0] + 0.10, 0.70, m[1] - 0.08, 4, 4, mats)
    const bar2 = box(0.065, 0.022, 0.092, dorso, m[0] + 0.16, 0.711, m[1] + 0.14)
    bar2.rotation.y = 0.6
    g.add(bar2)
    colliders.push({ minX: m[0] - 0.3, maxX: m[0] + 0.3, minZ: m[1] - 0.3, maxZ: m[1] + 0.3, tag: 'cassino-mesinha' })
  }

  // fichas caidas no carpete: o detalhe que diz que alguem ja jogou aqui
  const soltas = [
    [23.2, 20.6, 0], [23.5, 20.9, 2], [22.9, 21.3, 4],
    [26.6, 26.0, 1], [26.9, 25.7, 3], [18.4, 20.0, 5], [30.2, 18.4, 2],
  ]
  for (const f of soltas) {
    const m = new THREE.Mesh(geoFicha(), mats[f[2]])
    m.position.set(f[0], 0.008, f[1])
    m.rotation.y = f[0]
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }

  // Regulamento emoldurado ao lado da porta (o cassino tem que ter as regras).
  // O pilar cheio entre a porta e a primeira vitrine tem UM metro (25.7..26.7,
  // ver pilaresFachada), entao a moldura mede 0.94: com 1.2 ela avancava 10 cm
  // pra dentro do vao da porta — na altura do peito de quem entra — e outros
  // 10 cm por cima da vidraca.
  const reg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.63), textPlaneMat('APOSTE COM JUIZO', {
    w: 512, h: 384, color: '#f0e6c8', bg: '#2a1018',
    font: 'bold 54px "Trebuchet MS", sans-serif', emissiveIntensity: 0.15,
  }))
  reg.position.set(26.2, 1.9, IN.z0 + 0.05)
  reg.castShadow = false
  g.add(reg)
  g.add(box(0.94, 0.71, 0.05, M.ouroFosco, 26.2, 1.9, IN.z0 + 0.02))
}

// ===========================================================================
// C. NPCs — tres, de aparencia FIXA e congelados
// ===========================================================================

/** Colete de uniforme preso na raiz do NPC (a raiz fica nos pes). */
function fazColete(cor, nome) {
  const g = new THREE.Group()
  const pano = solid(cor, 0.8)
  const debrum = solid(0x14161a, 0.75)
  const frente = roundedBox(0.32, 0.40, 0.06, 0.05, pano)
  frente.position.set(0, 1.20, 0.126)
  g.add(frente)
  const costas = roundedBox(0.34, 0.40, 0.05, 0.05, pano)
  costas.position.set(0, 1.20, -0.116)
  g.add(costas)
  for (const s of [-1, 1]) {
    const lado = box(0.06, 0.38, 0.20, pano, s * 0.155, 1.20, 0.005)
    g.add(lado)
  }
  g.add(box(0.34, 0.05, 0.09, debrum, 0, 1.00, 0.115))     // barra
  // gravata borboleta
  for (const s of [-1, 1]) {
    const asa = box(0.055, 0.05, 0.035, debrum, s * 0.038, 1.475, 0.108)
    asa.rotation.z = s * 0.25
    g.add(asa)
  }
  g.add(box(0.022, 0.03, 0.03, debrum, 0, 1.475, 0.112))
  const cracha = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05), textPlaneMat(nome, {
    w: 512, h: 192, color: '#1f2429', bg: '#e8d8a8',
    font: 'bold 96px "Trebuchet MS", sans-serif', emissiveIntensity: 0.1,
  }))
  cracha.position.set(0.06, 1.30, 0.158)
  g.add(cracha)
  return sombras(g)
}

function spawnNPC(g, colliders, cfg) {
  let npc = null
  try {
    npc = createNPC(cfg.opts)
  } catch (e) { npc = null }
  if (!npc || !npc.root) return null
  sombras(npc.root)
  if (cfg.extra) npc.root.add(cfg.extra)
  g.add(npc.root)

  // Aparencia FIXA: ninguem chama setAppearance nestes tres, entao os ~85
  // meshes soltos de cada boneco viram um punhado por junta. O forno de
  // personagem preserva as JUNTAS — respiracao, balanco e piscada continuam
  // iguais. Tem que vir DEPOIS do colete, senao ele fica de fora da fusao.
  if (npc.character && npc.character.parts) {
    congelarPersonagem(npc.root, { juntas: npc.character.parts })
  }
  colliders.push({
    minX: cfg.opts.x - 0.3, maxX: cfg.opts.x + 0.3,
    minZ: cfg.opts.z - 0.3, maxZ: cfg.opts.z + 0.3, tag: cfg.tag,
  })
  return npc
}

function buildNPCs(g, colliders) {
  // --- atendente do blackjack: EM PE atras da corda, virada pro salao ------
  const dealer = spawnNPC(g, colliders, {
    tag: 'cassino-dealer',
    extra: fazColete(0x6d1224, 'CRUPIE'),
    opts: {
      name: 'Dara', pose: 'idle',
      x: BJ_NPC.x, y: 0, z: BJ_NPC.z,
      rotY: Math.PI,                     // olha para -Z, o lado dos jogadores
      shirt: 0xf2ece0, pants: 0x22262d, shoes: 0x17191d,
      appearance: {
        cabeca: 1, olhos: 2, nariz: 0, boca: 1, barba: 0,
        cabelo: 2, pele: 0, corCabelo: 0, corBarba: 0, sobrancelha: 1,
        chapeu: 0, calcado: 3, blusa: 2, calca: 2, colar: 0,
        anelAcess: 0, tatuagem: 0, relogio: 1, jaqueta: 0,
      },
    },
  })

  // --- o ricaco do poker: SENTADO, de chapeu e corrente de ouro -----------
  const ricaco = spawnNPC(g, colliders, {
    tag: 'cassino-ricaco',
    opts: {
      name: 'Dom Sebastiao', pose: 'sit',   // o MESMO nome que o painel do poker usa
      x: PK_NPC.x, y: SIT_LIFT, z: PK_NPC.z,
      rotY: Math.PI,                     // encara a cadeira vazia do jogador
      shirt: 0xd8c9a8, pants: 0x2b2b33, shoes: 0x241a12,
      appearance: {
        cabeca: 3, olhos: 1, nariz: 0, boca: 3, barba: 3,
        cabelo: 1, pele: 1, corCabelo: 4, corBarba: 6, sobrancelha: 2,
        chapeu: 1,                       // CHAPEUS[1] = chapeu de aba (fedora)
        calcado: 3,                      // CALCADOS[3] = coturno (a lista encolheu)
        blusa: 2,                        // BLUSAS[2] = camisa social
        calca: 2,                        // CALCAS[2] = calca social
        colar: 1,                        // COLARES[1] = corrente de ouro
        anelAcess: 1, tatuagem: 0, relogio: 1, jaqueta: 0,
      },
    },
  })

  // --- atendente do caixa -------------------------------------------------
  const caixa = spawnNPC(g, colliders, {
    tag: 'cassino-caixa-npc',
    extra: fazColete(0x1f3f6b, 'CAIXA'),
    opts: {
      name: 'Nilza', pose: 'work',
      x: CX_NPC.x, y: 0, z: CX_NPC.z,
      rotY: Math.PI,
      shirt: 0xe8e4d8, pants: 0x2a2f38, shoes: 0x1c1f24,
      appearance: {
        // nariz 0 e "sem nariz": aqui vale 1, o modelado na pele.
        cabeca: 0, olhos: 0, nariz: 0, boca: 0, barba: 0,
        cabelo: 2, pele: 2, corCabelo: 2, corBarba: 0, sobrancelha: 0,
        chapeu: 0, calcado: 3, blusa: 2, calca: 2, colar: 2,
        anelAcess: 0, tatuagem: 0, relogio: 0, jaqueta: 0,
      },
    },
  })

  return { dealer, ricaco, caixa }
}

// ===========================================================================
// BUILDER
// ===========================================================================
export function buildCasino(game) {
  const group = new THREE.Group()
  group.name = 'casino'
  const colliders = []
  const occluders = []
  const interactables = []
  const luzes = []
  const anim = {}
  // 0 = dia, 1 = noite. Quem escreve e o main, uma vez por quadro, com o
  // lighting.noite (que ja vem interpolado entre os stops do ciclo).
  let noite = 1
  let noiteAplicada = -1

  // As 3 fases da corrida de lampadas. Sao CLONES: mexer no material cacheado
  // de materials.js acenderia toda lampada amarela da cidade junto.
  const matsFase = [
    emissive(0xffd24a, 3.2).clone(),
    emissive(0xffd24a, 3.2).clone(),
    emissive(0xffd24a, 3.2).clone(),
  ]
  const matsFicha = MAT_FICHA()

  // --- casca (coordenadas de mundo, chao em y=0) --------------------------
  const casca = new THREE.Group()
  casca.name = 'casino-casca'
  moldura(casca)
  paredes(casca, colliders, occluders)
  vitrines(casca)
  marquise(casca, colliders, matsFase)
  letreiros(casca, colliders, matsFase, anim)
  telhado(casca, matsFase, anim)
  tapeteVermelho(casca, colliders)
  group.add(casca)

  // --- miolo (piso local em y=0; o grupo inteiro sobe pra LEVELS.SHOP_FLOOR)
  const dentro = new THREE.Group()
  dentro.name = 'casino-miolo'
  dentro.position.y = BASE
  pisoInterno(dentro)
  revestimento(dentro)
  tetoELustres(dentro, luzes)
  buildCaixa(dentro, colliders, matsFicha)
  buildBlackjack(dentro, colliders, matsFicha)
  const enfeitePoker = buildPoker(dentro, colliders, matsFicha)
  const maquinas = buildSlots(dentro, colliders, interactables, matsFase)
  // O bar VELHO (balcao encostado na parede do fundo, espelho, garrafas de
  // enfeite) nasce dentro de um grupo NOMEADO e num contador de colisores
  // marcado. E o unico jeito de world/casino-bar.js poder aposenta-lo inteiro
  // — grupo e colisores — sem precisar editar este arquivo: quem constroi o
  // bar de verdade tem que poder tirar o desenho de bar que estava no lugar.
  const barAntigo = new THREE.Group()
  barAntigo.name = 'casino-bar-antigo'
  buildBar(barAntigo, colliders)
  dentro.add(barAntigo)
  buildJuice(dentro, colliders, matsFicha)

  // --- OS DOIS COMODOS QUE MORAM EM MODULO PROPRIO -----------------------
  //
  // O BAR DO BARMAN (bancada de trabalho, parede de bebidas, fruteira, o
  // preparo do drink) e a COZINHA (porta + pia) nao entram neste arquivo de
  // proposito. Cada um e um sistema com estado proprio, e este arquivo ja e o
  // maior do mundo do jogo. Mais concreto que o tamanho: tres abas do projeto
  // mexem nele ao mesmo tempo, e sistema novo em arquivo novo e o que faz duas
  // mudancas grandes caberem no mesmo dia sem uma comer a outra.
  //
  // Eles recebem o MIOLO ja montado e penduram o que precisam nele; o que
  // empurrarem em colliders/interactables sobe junto com o do cassino.
  const barman = buildCasinoBar({
    raiz: dentro, colliders, interactables, occluders, base: BASE, dentro: IN, predio: B,
    barAntigo,
  })
  const cozinha = buildCasinoCozinha({
    raiz: dentro, colliders, interactables, occluders, base: BASE, dentro: IN, predio: B,
  })
  const npcs = buildNPCs(dentro, colliders)
  group.add(dentro)

  // --- pontos de interacao ------------------------------------------------
  // Sempre do lado do JOGADOR do movel e na altura da cintura: a interacao
  // pesa o Y pela metade, entao um ponto no tampo da mesa ja bastaria, mas na
  // cintura o rotulo aparece na hora certa tambem em primeira pessoa.
  interactables.push({
    id: 'cassino-caixa',
    position: new THREE.Vector3((CX.x0 + CX.x1) / 2, BASE + 1.1, CX.z0 - 0.85),
    radius: 2.0,
    label: 'Comprar fichas',
    onInteract: (gm) => gm.cassino && gm.cassino.abrirCaixa(),
  })
  interactables.push({
    id: 'cassino-blackjack',
    position: new THREE.Vector3(BJ.x, BASE + 1.05, BJ.z - BJ.r - 0.55),
    radius: 2.2,
    label: 'Jogar Blackjack',
    onInteract: (gm) => gm.cassino && gm.cassino.abrirBlackjack(),
  })
  interactables.push({
    id: 'cassino-poker',
    position: new THREE.Vector3(PK_VAZIA.x, BASE + 1.05, PK_VAZIA.z - 0.75),
    radius: 2.0,
    label: 'Jogar poker com o ricaco',
    onInteract: (gm) => gm.cassino && gm.cassino.abrirPoker(),
  })

  // -------------------------------------------------------------------------
  // API DOS ROLETES
  // -------------------------------------------------------------------------
  const VOLTA = Math.PI * 2
  const PASSO = VOLTA / N_SIM

  /**
   * Menor angulo >= ang + folga que deixa o simbolo k centrado na janela.
   * A conta vem da geometria do tambor: o ponto que fica de frente pro jogador
   * e o que esta em theta = ang, e o simbolo k ocupa a fatia de u centrada em
   * (k + 0.5) / N — ou seja, theta = PASSO * (k + 0.5).
   */
  function anguloDe(ang, k) {
    const alvo = PASSO * ((k % N_SIM) + 0.5)
    const voltas = Math.ceil((ang + 1.8 - alvo) / VOLTA)
    return alvo + voltas * VOLTA
  }

  function girarMaquina(i, simbolos, aoTerminar) {
    const m = maquinas[i]
    if (!m) { if (typeof aoTerminar === 'function') aoTerminar(); return }
    m.parados = 0
    m.aoTerminar = typeof aoTerminar === 'function' ? aoTerminar : null
    for (let r = 0; r < 3; r++) {
      const rl = m.roletes[r]
      let k = simbolos && simbolos.length > r ? simbolos[r] : Math.floor(Math.random() * N_SIM)
      k = ((k | 0) % N_SIM + N_SIM) % N_SIM     // a UI pode mandar indice fora da faixa
      rl.alvo = k
      rl.fase = 1
      rl.t = 0
      rl.tParar = PARAR_EM[r]
    }
  }

  function festa(i) {
    const m = maquinas[i]
    if (m) m.festaT = 2.0
  }

  // -------------------------------------------------------------------------
  // UPDATE — nada de 'new' daqui pra baixo
  // -------------------------------------------------------------------------
  const NIVEL_FASE = [3.4, 1.15, 0.30]
  const PAINEL_BASE = 1.9
  const TOPO_BASE = 1.7
  let t = 0
  let faseF = 0
  let faseAtual = -1
  let lookObj = null

  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  /** A atendente vira a cabeca quando o jogador chega perto (igual a mercearia). */
  function olhar(npc, x, z, gm, alcance2) {
    if (!npc) return
    const p = gm && gm.player && gm.player.position
    if (!p) return
    const dx = p.x - x, dz = p.z - z
    if (dx * dx + dz * dz < alcance2) {
      const tgt = alvoDoOlhar(gm)
      if (tgt) npc.lookTarget = tgt
    } else if (npc.lookTarget) {
      npc.lookTarget = null
    }
  }

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    t += d

    // --- O FATOR DE NOITE ---------------------------------------------------
    //
    // O neon do cassino so acende a noite, a pedido do dono. Mas ele NAO pode
    // entrar na lista de materiais do ciclo dia/noite (cenario/cenarios.js),
    // que e por onde os postes de rua acendem: aquela lista escreve
    // emissiveIntensity UMA vez na virada, e este update aqui reescreve a mesma
    // propriedade em TODO quadro (corrida de lampadas, neon respirando, estrela
    // piscando). O ciclo perderia a briga no quadro seguinte, sempre.
    //
    // Entao quem aplica a noite e o proprio dono do valor — a mesma regra que
    // lighting.js usa pro `nublado`: "o ciclo de dia reescreve tudo todo quadro,
    // entao existe um dono so de cada valor". `noite` chega de fora por
    // setNoite() e multiplica tudo no fim da conta.
    //
    // 0.06 e nao 0 no piso: de dia o neon apagado ainda e um tubo de vidro
    // colorido na fachada, e nao um tubo preto.
    //
    // O valor vem do PROPRIO game, e nao de uma chamada do main: `update`
    // ja recebe o game, e `lighting.noite` e 0..1 interpolado entre os stops do
    // ciclo (ver world/lighting.js). Ler daqui evita mais uma linha de fiacao
    // no main.js — que e o arquivo que tres abas do projeto disputam.
    const lg = gm && gm.lighting
    if (lg && typeof lg.noite === 'number') noite = lg.noite
    const N = 0.06 + 0.94 * noite

    // --- corrida de lampadas: 3 materiais, 1 troca por passo ---------------
    faseF += d * 7.0
    const f = Math.floor(faseF) % 3
    if (f !== faseAtual || noite !== noiteAplicada) {
      faseAtual = f
      for (let i = 0; i < 3; i++) matsFase[i].emissiveIntensity = NIVEL_FASE[(i - f + 3) % 3] * N
    }

    // --- neon da fachada respirando ---------------------------------------
    const p1 = Math.sin(t * 2.1)
    if (anim.borda) anim.borda.emissiveIntensity = (2.1 + p1 * 0.6) * N
    if (anim.texto) anim.texto.emissiveIntensity = (1.4 + p1 * 0.25) * N
    if (anim.tubo) anim.tubo.emissiveIntensity = (1.8 + Math.sin(t * 1.3) * 0.55) * N
    if (anim.porta) anim.porta.emissiveIntensity = (2.3 + Math.sin(t * 4.2) * 0.7) * N
    if (anim.placa) anim.placa.emissiveIntensity = (1.7 + Math.sin(t * 5.6) * 0.8) * N
    const est = Math.sin(t * 3.4)
    if (anim.estrela) anim.estrela.emissiveIntensity = (2.4 + est * 1.1) * N
    if (anim.estrela2) anim.estrela2.emissiveIntensity = (2.0 - est * 0.9) * N
    noiteAplicada = noite

    // --- maquinas ---------------------------------------------------------
    for (let i = 0; i < maquinas.length; i++) {
      const m = maquinas[i]
      for (let r = 0; r < 3; r++) {
        const rl = m.roletes[r]
        if (rl.fase === 0) continue
        rl.t += d
        if (rl.fase === 1) {
          rl.ang += VEL_ROL * d
          if (rl.t >= rl.tParar) {
            rl.a0 = rl.ang
            rl.a1 = anguloDe(rl.ang, rl.alvo)
            rl.t = 0
            rl.fase = 2
          }
        } else {
          const k = Math.min(1, rl.t / FREIO)
          const e = 1 - (1 - k) * (1 - k) * (1 - k)     // freia sem tranco
          rl.ang = rl.a0 + (rl.a1 - rl.a0) * e
          if (k >= 1) {
            rl.ang = rl.a1
            rl.fase = 0
            m.parados++
            if (m.parados >= 3 && m.aoTerminar) {
              // zera ANTES de chamar: o callback pode mandar girar de novo
              const fim = m.aoTerminar
              m.aoTerminar = null
              fim()
            }
          }
        }
        rl.obj.rotation.x = rl.ang
      }
      if (m.festaT > 0) {
        m.festaT -= d
        const on = (m.festaT * 11) % 2 < 1
        m.matPainel.emissiveIntensity = on ? 4.6 : 0.45
        m.matTopo.emissiveIntensity = on ? 4.0 : 0.35
        if (m.festaT <= 0) {
          m.festaT = 0
          m.matPainel.emissiveIntensity = PAINEL_BASE
          m.matTopo.emissiveIntensity = TOPO_BASE
        }
      }
    }

    // --- os dois modulos vizinhos ------------------------------------------
    if (barman && barman.update) barman.update(d, gm)
    if (cozinha && cozinha.update) cozinha.update(d, gm)

    // A CAMERA CINEMATOGRAFICA DAS MESAS roda daqui, e nao do main.js, por um
    // motivo de ORDEM: este update esta em moduleUpdates, que o laco chama
    // DEPOIS de player.update(). Quem escreve na camera por ultimo ganha o
    // quadro — chamada de qualquer ponto anterior, a camera da mesa seria
    // sobrescrita pelo controller do jogador no mesmo quadro em que nasceu.
    if (gm && gm.cassino && typeof gm.cassino.atualizarCamera === 'function') {
      gm.cassino.atualizarCamera(d, gm)
    }

    // --- NPCs: escolhe o alvo do olhar ANTES de animar, senao a cabeca so
    // acompanha o jogador com um quadro de atraso -------------------------
    olhar(npcs.dealer, BJ_NPC.x, BJ_NPC.z, gm, 36)
    olhar(npcs.caixa, CX_NPC.x, CX_NPC.z, gm, 25)
    olhar(npcs.ricaco, PK_NPC.x, PK_NPC.z, gm, 20)
    if (npcs.dealer) npcs.dealer.update(d)
    if (npcs.ricaco) npcs.ricaco.update(d)
    if (npcs.caixa) npcs.caixa.update(d)
  }

  return {
    group,
    colliders,
    interactables,
    occluders,
    luzes,
    update,

    /**
     * Quanto de noite, 0..1. Apaga o neon da fachada, a corrida de lampadas
     * da marquise e a estrela do telhado durante o dia.
     *
     * As DUAS PointLight do salao ficam de fora de proposito: elas nao sao
     * enfeite, sao a iluminacao de um salao fechado sem uma janela virada pro
     * sol. Apagar as duas de dia deixaria o jogador jogando blackjack no
     * escuro.
     */
    setNoite(v) {
      const n = Number(v)
      noite = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1
    },
    girarMaquina,
    festa,
    barman,
    cozinha,
    // OS TRES NPCs (dealer, ricaco, caixa). Saem daqui pra quem enquadra a mesa
    // poder pedir uma POSE ao ricaco em vez de so girar o corpo dele: setPose e
    // do NPC, e achar o boneco por getObjectByName('Dom Sebastiao') — que era o
    // contorno — quebra no dia em que ele mudar de nome.
    npcs,
    // AS ANCORAS DAS DUAS MESAS, em coordenadas de MUNDO. Existem pra quem
    // enquadra a camera (ui/cassino-ui.js) nao precisar copiar numero daqui:
    // numero copiado e numero que envelhece sozinho no dia em que a mesa andar
    // 20 cm. 'tampo' ja e o Y do feltro NO MUNDO (o miolo inteiro sobe BASE).
    mesas: {
      blackjack: {
        centro: new THREE.Vector3(BJ.x, BASE, BJ.z),
        raio: BJ.r,
        tampo: BASE + 0.92,
        dealer: new THREE.Vector3(BJ_NPC.x, BASE, BJ_NPC.z),
        jogador: new THREE.Vector3(BJ.x, BASE, BJ.z - BJ.r - 0.55),
      },
      poker: {
        centro: new THREE.Vector3(PK.x, BASE, PK.z),
        rx: PK.rx, rz: PK.rz,
        tampo: BASE + 0.78,
        // O par de cartas desenhado no feltro em cada lugar. Quem senta na mesa
        // APAGA isto (cassino/mesa-3d.js, em entrar()) e acende de volta ao
        // sair: as cartas vivas nao ficam mais em cima dele, e o feltro com dois
        // pares le como mesa bugada.
        enfeite: enfeitePoker,
        npc: new THREE.Vector3(PK_NPC.x, BASE, PK_NPC.z),
        jogador: new THREE.Vector3(PK_VAZIA.x, BASE, PK_VAZIA.z),
      },
    },
    // Quantas paradas o tambor tem. E o mesmo SIM_SLOT.length de
    // cassino/slots.js, exposto aqui so pra quem tem o 'mundo' na mao nao
    // precisar importar a logica so pra validar um indice.
    nSimbolos: N_SIM,
  }
}
