import * as THREE from 'three'
import { WORLD, LEVELS } from '../config.js'
import { BARBER, GROCERY, FILLERS, PARK, WALL_T, LOTES, apronOf } from './layout.js'
import * as Props from './props.js'
import {
  PALETTE, solid, stdMat, emissive, glass, box, cyl, sphere, plane,
  textPlaneMat, paintingMat, asphaltTex, concreteTex, brickTex, plasterTex,
  woodTex, tex,
} from './materials.js'

// ---------------------------------------------------------------------------
// MINI CITY RP -- cidade exterior (ruas, calcadas, predios, fachadas, parque).
// Tudo procedural. Interiores das lojas sao de outros modulos.
// ---------------------------------------------------------------------------

const RH = WORLD.ROAD_HALF        // 8   -> rua de -8 a +8
const SWW = WORLD.SIDEWALK        // 4   -> calcada de 8 a 12
const CH = LEVELS.SIDEWALK        // 0.16 (= WORLD.CURB_HEIGHT): altura da calcada
const BI = WORLD.BLOCK_INNER      // 12
const BO = WORLD.BLOCK_OUTER      // 52
const RING = WORLD.RING           // 60
const RIN = RING - RH             // 52  borda interna da rua do anel
const ROUT = RING + RH            // 68  borda externa da rua do anel
const G = WORLD.GROUND            // 200

const ROAD_Y = 0.02               // asfalto flutua um pouco acima da grama
// Pintura de rua: a caixa tem 2.6 cm e a base encosta EXATAMENTE no asfalto.
// A face de baixo aponta pra -Y (fica descartada pelo backface culling), entao
// nenhuma superficie visivel fica coplanar com a rua.
const MARK_H = 0.026
const MARK_Y = ROAD_Y + MARK_H / 2
const CURB_W = 0.32               // largura do meio-fio
const CURB_OUT = 0.025            // meio-fio avanca pra rua: nao fica coplanar
const CORNER_R = 3.2              // raio das esquinas arredondadas

// Decalques deitados no chao (manchas, poças, juntas, folhas). So a folga em Y
// nao basta: a 100 m o depth buffer tem ~1 cm de resolucao. polygonOffset puxa
// o decalque pra frente em profundidade e acaba com o chapisco.
const DECAL_OFF = { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }

// --- Camadas da janela, medidas a partir da FACE DA PAREDE (z local = 0) ----
// Cada camada tem faixa propria com >= 2 cm de folga pra proxima. Antes a face
// da moldura e a do vidro caiam no MESMO plano (0.13) e piscavam preto/branco.
const WIN_BACK_Z = 0.030   // forro interno / persiana : 0.020 .. 0.040
const WIN_GLASS_Z = 0.075  // vidro                    : 0.060 .. 0.090
const WIN_FRAME_Z = 0.145  // moldura (vazada)         : 0.110 .. 0.180
const WIN_SILL_Z = 0.100   // peitoril                 : -0.050 .. 0.250 (em Y separado)
const WIN_W = 1.32         // largura do vidro
const WIN_H = 1.68         // altura do vidro

// Alturas oficiais de piso (config.js). A geometria construida aqui e o que
// groundY() devolve TEM que bater exatamente.
const PARK_Y = LEVELS.PARK        // 0.11
const ALLEY_Y = LEVELS.ALLEY      // 0.05
const SHOP_Y = LEVELS.SHOP_FLOOR  // 0.16
const SHOP_PAD = 0.9              // avental de calcada em volta do lote da loja
const CRATE_H = 0.72              // altura do engradado de props.makeCrate

// Orcamento de luzes dinamicas: MeshStandardMaterial recompila por contagem de
// luzes, entao limitamos. O resto do "brilho" vem de materiais emissivos.
const LIGHT_BUDGET = 8

// --- PRNG deterministica (mapa sempre igual) -------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- Cache de texturas com repeat customizado (densidade de textel uniforme)
const _tiled = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx.toFixed(2) + ':' + ry.toFixed(2)
  if (_tiled.has(k)) return _tiled.get(k)
  const t = base.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  _tiled.set(k, t)
  return t
}

// --- Helpers de geometria plana (shapes no plano XZ) -----------------------

/** Extrude um Shape (coords = x,z do mundo) como laje de altura h no chao. */
function slabFromShape(shape, h, mat) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 })
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = Math.PI / 2   // shape.y vira +Z, extrusao vira -Y
  m.position.y = h
  m.castShadow = false
  m.receiveShadow = true
  return m
}

function signedArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return a * 0.5
}

/** Constroi Shape a partir de pontos [x,z], corrigindo o sentido. */
function shapeFromPoints(pts) {
  const p = signedArea(pts) < 0 ? pts.slice().reverse() : pts
  const s = new THREE.Shape()
  s.moveTo(p[0][0], p[0][1])
  for (let i = 1; i < p.length; i++) s.lineTo(p[i][0], p[i][1])
  s.closePath()
  return s
}

function rectShape(x0, x1, z0, z1) {
  return shapeFromPoints([[x0, z0], [x1, z0], [x1, z1], [x0, z1]])
}

/**
 * Funde varias BufferGeometry (ja no espaco do mundo) numa so.
 * So copia position/normal/uv -- que e tudo que os materiais daqui usam.
 * Evita depender de addons do three.
 */
function mergeGeos(list) {
  let vTotal = 0, iTotal = 0, hasUV = true
  for (const g of list) {
    if (!g.attributes.uv) hasUV = false
    vTotal += g.attributes.position.count
    iTotal += g.index ? g.index.count : g.attributes.position.count
  }
  if (!vTotal) return null
  const pos = new Float32Array(vTotal * 3)
  const nor = new Float32Array(vTotal * 3)
  const uvs = hasUV ? new Float32Array(vTotal * 2) : null
  const idx = vTotal > 65000 ? new Uint32Array(iTotal) : new Uint16Array(iTotal)
  let vo = 0, io = 0
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv
    const c = p.count
    for (let i = 0; i < c; i++) {
      const o3 = (vo + i) * 3
      pos[o3] = p.getX(i); pos[o3 + 1] = p.getY(i); pos[o3 + 2] = p.getZ(i)
      if (n) { nor[o3] = n.getX(i); nor[o3 + 1] = n.getY(i); nor[o3 + 2] = n.getZ(i) }
      if (uvs && u) { uvs[(vo + i) * 2] = u.getX(i); uvs[(vo + i) * 2 + 1] = u.getY(i) }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io + i] = vo + g.index.getX(i)
      io += g.index.count
    } else {
      for (let i = 0; i < c; i++) idx[io + i] = vo + i
      io += c
    }
    vo += c
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  return out
}

// --- Ajuste de fonte dos letreiros -----------------------------------------
// O plano do letreiro e MUITO mais largo do que alto. Se o canvas nao tiver a
// mesma proporcao, ou se a frase for maior que o canvas, o texto sai cortado
// (era o caso: "BARBEARIA DO ZEZO" estourava os 1024 px e virava "ARIA DO").
// Aqui a fonte e MEDIDA antes de desenhar, entao a frase sempre cabe.
let _fitCtx = null
function fitFontPx(text, maxW, maxPx, family) {
  const fam = family || '"Trebuchet MS", sans-serif'
  if (_fitCtx === null) {
    _fitCtx = (typeof document !== 'undefined')
      ? document.createElement('canvas').getContext('2d') : false
  }
  if (!_fitCtx) return maxPx
  _fitCtx.font = 'bold ' + maxPx + 'px ' + fam
  const w = _fitCtx.measureText(text).width || 1
  if (w <= maxW) return maxPx
  return Math.max(8, Math.floor(maxPx * maxW / w))
}

/** Canvas com a MESMA proporcao do plano (evita esticar/cortar a textura). */
function canvasFor(planeW, planeH, wantW) {
  const w = wantW || 1536
  const h = Math.max(64, Math.round((w * planeH) / planeW / 2) * 2)
  return { w, h }
}

/** Amostra de bezier quadratica -> pontos do canto arredondado. */
function arcPts(p0, c, p1, n) {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push([
      u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
      u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
    ])
  }
  return out
}

// --- Texturas proprias da cidade -------------------------------------------
// materials.js e compartilhada com os interiores, entao nao da pra mexer nela.
// O que a rua precisa de diferente e desenhado aqui.
const _cityTex = new Map()
function cityTex(key, size, drawFn, srgb) {
  if (_cityTex.has(key)) return _cityTex.get(key)
  const c = document.createElement('canvas')
  c.width = c.height = size
  drawFn(c.getContext('2d'), size)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  // alphaMap le o canal VERDE cru: com sRGB o GPU decodifica e a mascara sai
  // torta. Por isso da pra pedir NoColorSpace.
  t.colorSpace = srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace
  t.anisotropy = 8
  _cityTex.set(key, t)
  return t
}

/**
 * Grama de praca de cidade: oliva lavado, com palha seca no meio. A grassTex
 * de materials.js e um verde de mesa de sinuca, saturado demais pra paleta
 * lavada do resto da cidade.
 */
function cityGrassTex() {
  return cityTex('grass-olive', 256, (g, s) => {
    g.fillStyle = '#6f7845'; g.fillRect(0, 0, s, s)
    // manchas largas de tom. Diferenca pequena de proposito: com contraste alto
    // a grama vira camuflagem militar.
    for (let i = 0; i < 34; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 14 + Math.random() * 46
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, Math.random() > 0.45
        ? 'rgba(152,140,92,0.34)'    // trecho seco / palha
        : 'rgba(76,90,52,0.34)')     // trecho mais fechado
      grd.addColorStop(1, 'rgba(120,120,90,0)')
      g.fillStyle = grd
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    // fiapos de grama: contraste medio -- sem eles a grama vira feltro liso,
    // com contraste alto vira listra.
    for (let i = 0; i < 6000; i++) {
      const v = Math.random(), a = 0.3 + Math.random() * 0.6
      g.strokeStyle = v > 0.6 ? 'rgba(154,168,92,' + a + ')'
        : v > 0.26 ? 'rgba(66,80,42,' + a + ')'
          : 'rgba(178,164,104,' + (a * 0.85) + ')'
      const x = Math.random() * s, y = Math.random() * s
      g.beginPath(); g.moveTo(x, y)
      g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4)
      g.stroke()
    }
    // tufos: grupinhos maiores que sobrevivem ao mipmap e dao a leitura de
    // grama irregular mesmo a 10 m de distancia
    for (let i = 0; i < 240; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const dark = Math.random() > 0.5
      const a = 0.1 + Math.random() * 0.16
      g.fillStyle = dark ? 'rgba(62,76,40,' + a + ')' : 'rgba(164,172,110,' + a + ')'
      g.beginPath()
      g.ellipse(x, y, 3 + Math.random() * 9, 2 + Math.random() * 7, Math.random() * 3, 0, 7)
      g.fill()
    }
  })
}

/**
 * Mascara das manchas do gramado (canal verde = opacidade). Varios gradientes
 * radiais deslocados: a silhueta nao e um circulo e o alpha chega a ZERO antes
 * da borda do plano -- e isso que acaba com as arestas retas do poligono.
 */
function blobMaskTex() {
  return cityTex('blob-mask', 128, (g, s) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, s, s)
    g.globalCompositeOperation = 'lighter'
    const c = s / 2
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283
      const d = i === 0 ? 0 : c * (0.14 + Math.random() * 0.18)
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d
      const r = c * (i === 0 ? 0.5 : 0.3 + Math.random() * 0.14)
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, 'rgba(255,255,255,0.55)')
      grd.addColorStop(0.45, 'rgba(255,255,255,0.3)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grd
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    g.globalCompositeOperation = 'source-over'
  }, false)
}

/**
 * Remendo de asfalto: recorte irregular (feito na marreta, nao a esquadro),
 * granulado proprio e sarrafo de piche na junta. O alpha do canvas define o
 * formato, entao a borda e nitida e o remendo nao parece sombra.
 */
function asphaltPatchTex() {
  return cityTex('asphalt-patch', 128, (g, s) => {
    const c = s / 2, n = 18
    g.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 6.283
      const sq = Math.min(1.34, 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))))
      const r = c * 0.9 * sq * (0.9 + Math.sin(a * 3.7) * 0.05 + Math.random() * 0.05)
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.closePath()
    g.fillStyle = '#44464e'; g.fill()
    g.save(); g.clip()
    for (let i = 0; i < 1100; i++) {
      const v = 46 + Math.random() * 66
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',' + (0.2 + Math.random() * 0.4) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2)
    }
    g.restore()
    g.lineWidth = 4; g.strokeStyle = 'rgba(28,28,32,0.7)'; g.stroke()
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(140,136,128,0.3)'; g.stroke()
  })
}

/**
 * Poça: contorno organico mas NITIDO, gradiente de reflexo do ceu (claro em
 * cima, escuro embaixo) e dois filetes de brilho. Antes era um disco de metal
 * preto sem environment map -- lia como buraco no chao.
 */
function puddleTex() {
  return cityTex('puddle', 128, (g, s) => {
    const c = s / 2, n = 44
    g.beginPath()
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 6.283
      const r = c * (0.78 + Math.sin(a * 2.1) * 0.09 + Math.sin(a * 3.3 + 1.7) * 0.055)
      const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r * 0.94
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.closePath()
    g.save(); g.clip()
    const grd = g.createLinearGradient(0, 0, 0, s)
    grd.addColorStop(0, '#8395a3')
    grd.addColorStop(0.42, '#586572')
    grd.addColorStop(1, '#333b44')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    g.fillStyle = 'rgba(228,242,252,0.45)'
    g.beginPath(); g.ellipse(c * 0.86, c * 0.74, c * 0.44, c * 0.055, -0.28, 0, 7); g.fill()
    g.fillStyle = 'rgba(228,242,252,0.26)'
    g.beginPath(); g.ellipse(c * 1.26, c * 1.06, c * 0.3, c * 0.04, 0.24, 0, 7); g.fill()
    g.restore()
    // filete escuro da borda molhada
    g.lineWidth = 3; g.strokeStyle = 'rgba(26,30,34,0.5)'; g.stroke()
  })
}

// ---------------------------------------------------------------------------
// GRAFITE DO MURO
// O muro e comprido e baixo (14 x 3 m), entao a textura precisa ser deitada --
// cityTex() so faz canvas quadrado, e esticar um quadrado em 4.4:1 borraria as
// letras justamente onde a arte precisa ser nitida.
// ---------------------------------------------------------------------------
function cityTexWH(key, w, h, drawFn) {
  if (_cityTex.has(key)) return _cityTex.get(key)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  drawFn(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  _cityTex.set(key, t)
  return t
}

// Paleta do grafite: 5 tintas que conversam. Quente (amarelo->laranja) nas
// letras, frio (turquesa) no fundo -- complementares, entao a peca "salta" do
// muro sem precisar de contraste de luminancia. O magenta so aparece como
// halo, e o roxo escuro e a linha que amarra tudo.
const GRAF = {
  linha: '#1c0f2b',    // contorno, quase preto arroxeado (nunca preto puro)
  bloco: '#7b2bd6',    // extrusao 3D das letras
  fillA: '#ffe24a',    // topo do degrade
  fillM: '#ffab2e',
  fillB: '#ff671e',    // base do degrade
  fundo: '#15bdb0',    // nuvem turquesa atras da peca
  fundoE: '#0a7370',   // borda da nuvem
  neon: '#ff2f9a',     // halo magenta
  pele: '#f3d9bd',     // o personagem usa a pele da cidade
}

/** Contorno organico fechado (nuvem/borrao). wob = quanto foge do circulo. */
function grafBlob(g, cx, cy, rx, ry, wob, seed) {
  const n = 40
  g.beginPath()
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = 1 + Math.sin(a * 3 + seed) * wob + Math.sin(a * 5.3 + seed * 2.1) * wob * 0.55
      + Math.sin(a * 8.7 + seed * 0.7) * wob * 0.25
    const x = cx + Math.cos(a) * rx * r
    const y = cy + Math.sin(a) * ry * r
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  }
  g.closePath()
}

/** Escorrido de tinta: haste + gota na ponta. E o que denuncia spray de verdade. */
function grafPingo(g, x, y, len, w, cor) {
  g.beginPath()
  g.moveTo(x - w / 2, y)
  g.lineTo(x - w / 2, y + len)
  g.quadraticCurveTo(x - w / 2, y + len + w, x, y + len + w)
  g.quadraticCurveTo(x + w / 2, y + len + w, x + w / 2, y + len)
  g.lineTo(x + w / 2, y)
  g.closePath()
  g.fillStyle = cor
  g.fill()
  g.strokeStyle = GRAF.linha
  g.lineWidth = w * 0.34
  g.stroke()
}

/** Respingo: mancha central + satelites. Sem os satelites parece adesivo. */
function grafRespingo(g, x, y, r, cor, rnd) {
  g.fillStyle = cor
  grafBlob(g, x, y, r, r * 0.9, 0.32, rnd() * 6)
  g.fill()
  const n = 5 + Math.floor(rnd() * 6)
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.28, d = r * (1.2 + rnd() * 2.4)
    g.beginPath()
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.08 + rnd() * 0.22), 0, 7)
    g.fill()
  }
}

/**
 * Uma letra do wildstyle. As camadas sao empilhadas na ordem em que um writer
 * pinta de verdade: bloco 3D atras, contorno grosso, fio branco, miolo em
 * degrade e por fim o brilho. Cada camada e o MESMO glifo redesenhado com
 * deslocamento -- e por isso que o contorno acompanha a letra perfeitamente.
 */
function grafLetra(g, ch, x, y, alt, rot) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  g.transform(1, 0, -0.17, 1, 0, 0)   // inclinacao: nenhuma letra fica a prumo
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineJoin = 'round'
  g.lineCap = 'round'

  // 1) bloco 3D indo pra baixo/direita. O contorno escuro sai so na copia mais
  // funda; as de cima cobrem o resto e sobra a silhueta certinha.
  for (let k = 14; k >= 1; k--) {
    const o = k * alt * 0.014
    if (k === 14) {
      g.strokeStyle = GRAF.linha
      g.lineWidth = alt * 0.16
      g.strokeText(ch, o, o * 1.35)
    }
    g.strokeStyle = GRAF.bloco
    g.lineWidth = alt * 0.09
    g.strokeText(ch, o, o * 1.35)
    g.fillStyle = GRAF.bloco
    g.fillText(ch, o, o * 1.35)
  }

  // 2) halo magenta: uma passada SO e com pouco desfoque. O contorno e fino de
  // proposito -- em Impact os vazios do "E" tem ~15% da altura, e um traco
  // grosso os fecha e a letra vira mancha.
  g.shadowColor = GRAF.neon
  g.shadowBlur = alt * 0.17
  g.strokeStyle = GRAF.linha
  g.lineWidth = alt * 0.125
  g.strokeText(ch, 0, 0)
  g.shadowBlur = 0
  g.strokeText(ch, 0, 0)

  // 3) fio branco entre o contorno e o miolo
  g.strokeStyle = '#ffffff'
  g.lineWidth = alt * 0.05
  g.strokeText(ch, 0, 0)

  // 4) miolo em degrade quente
  const grd = g.createLinearGradient(0, -alt * 0.58, 0, alt * 0.58)
  grd.addColorStop(0, GRAF.fillA)
  grd.addColorStop(0.5, GRAF.fillM)
  grd.addColorStop(1, GRAF.fillB)
  g.fillStyle = grd
  g.fillText(ch, 0, 0)

  // 5) brilho: o MESMO glifo repintado dentro de uma faixa. Canvas nao recorta
  // por texto, mas redesenhar a letra dentro de um clip retangular da o mesmo
  // resultado e nunca vaza pra fora do contorno.
  g.save()
  g.beginPath(); g.rect(-alt * 1.2, -alt * 0.60, alt * 2.4, alt * 0.26); g.clip()
  g.fillStyle = 'rgba(255,255,255,0.5)'
  g.fillText(ch, 0, 0)
  g.restore()
  g.save()
  g.beginPath(); g.rect(-alt * 1.2, alt * 0.30, alt * 2.4, alt * 0.16); g.clip()
  g.fillStyle = 'rgba(255,120,40,0.35)'
  g.fillText(ch, 0, 0)
  g.restore()

  g.restore()
}

/** A peca inteira: mede as letras, encaixa uma na outra e desenha. */
function grafPeca(g, texto, cx, cy, alt, hs, fam) {
  g.save()
  g.translate(cx, cy)
  g.scale(hs, 1)                      // esticar aqui tambem inclina as letras
  g.font = '900 ' + alt + 'px ' + fam
  const chars = texto.split('')
  const larg = []
  let total = 0
  for (const c of chars) { const w = g.measureText(c).width; larg.push(w); total += w }
  const over = alt * 0.05             // letras se invadem: e o que faz wildstyle
  total -= over * (chars.length - 1)
  let x = -total / 2
  const rots = [-0.11, 0.08, -0.06, 0.10, -0.08]
  for (let i = 0; i < chars.length; i++) {
    grafLetra(g, chars[i], x + larg[i] / 2, (i % 2 ? 1 : -1) * alt * 0.045, alt, rots[i % rots.length])
    x += larg[i] - over
  }
  g.restore()
  return total * hs
}

/** Seta chanfrada, elemento classico preso na peca. */
function grafSeta(g, x, y, s, rot) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  g.beginPath()
  g.moveTo(0, -s)
  g.lineTo(s * 1.5, 0)
  g.lineTo(0, s)
  g.lineTo(0, s * 0.42)
  g.lineTo(-s * 1.35, s * 0.42)
  g.lineTo(-s * 1.35, -s * 0.42)
  g.lineTo(0, -s * 0.42)
  g.closePath()
  const grd = g.createLinearGradient(0, -s, 0, s)
  grd.addColorStop(0, GRAF.fillA)
  grd.addColorStop(1, GRAF.fillB)
  g.fillStyle = grd
  g.fill()
  g.strokeStyle = GRAF.linha
  g.lineWidth = s * 0.3
  g.lineJoin = 'round'
  g.stroke()
  g.restore()
}

/** Coroa de 3 pontas em cima da peca (marca de writer). */
function grafCoroa(g, x, y, s) {
  g.beginPath()
  g.moveTo(x - s, y + s * 0.55)
  g.lineTo(x - s * 1.05, y - s * 0.7)
  g.lineTo(x - s * 0.5, y - s * 0.05)
  g.lineTo(x, y - s * 0.95)
  g.lineTo(x + s * 0.5, y - s * 0.05)
  g.lineTo(x + s * 1.05, y - s * 0.7)
  g.lineTo(x + s, y + s * 0.55)
  g.closePath()
  g.fillStyle = GRAF.fillA
  g.fill()
  g.strokeStyle = GRAF.linha
  g.lineWidth = s * 0.28
  g.lineJoin = 'round'
  g.stroke()
}

/**
 * O personagem ao lado da peca: cabeca de ovo, olhos esbugalhados e bone --
 * o mesmo boneco do jogo, so que pintado. Desenhado com contorno grosso e cor
 * chapada, que e como personagem de grafite se le a 15 m de distancia.
 */
function grafPersonagem(g, cx, cy, s) {
  const LW = s * 0.11
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const traco = () => { g.strokeStyle = GRAF.linha; g.lineWidth = LW; g.stroke() }

  // --- tronco (camiseta) ----------------------------------------------------
  g.beginPath()
  g.moveTo(cx - s * 0.62, cy + s * 1.02)
  g.lineTo(cx - s * 1.02, cy + s * 1.5)
  g.lineTo(cx - s * 0.94, cy + s * 2.6)
  g.lineTo(cx + s * 0.94, cy + s * 2.6)
  g.lineTo(cx + s * 1.02, cy + s * 1.5)
  g.lineTo(cx + s * 0.62, cy + s * 1.02)
  g.closePath()
  g.fillStyle = GRAF.bloco
  g.fill(); traco()
  // dobra de luz na camiseta
  g.beginPath()
  g.moveTo(cx - s * 0.86, cy + s * 1.5)
  g.lineTo(cx - s * 0.5, cy + s * 1.42)
  g.lineTo(cx - s * 0.58, cy + s * 2.55)
  g.lineTo(cx - s * 0.9, cy + s * 2.55)
  g.closePath()
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill()

  // --- braco levantado segurando a lata ------------------------------------
  // manga primeiro, antebraco depois: sem a manga o braco vira um graveto
  g.beginPath()
  g.moveTo(cx + s * 0.86, cy + s * 1.3)
  g.lineTo(cx + s * 1.34, cy + s * 0.82)
  g.lineWidth = s * 0.5
  g.strokeStyle = GRAF.bloco
  g.stroke()
  g.lineWidth = LW * 0.9
  g.strokeStyle = GRAF.linha
  g.stroke()
  g.beginPath()
  g.moveTo(cx + s * 1.3, cy + s * 0.86)
  g.lineTo(cx + s * 1.82, cy + s * 0.3)
  g.lineWidth = s * 0.42
  g.strokeStyle = GRAF.pele
  g.stroke()
  g.lineWidth = LW * 0.9
  g.strokeStyle = GRAF.linha
  g.stroke()
  // mao fechada na lata
  g.beginPath(); g.arc(cx + s * 1.9, cy + s * 0.2, s * 0.26, 0, 7)
  g.fillStyle = GRAF.pele; g.fill(); traco()
  // lata de spray: corpo, faixa de rotulo, tampa e valvula
  g.beginPath()
  g.rect(cx + s * 1.6, cy - s * 0.62, s * 0.6, s * 0.95)
  g.fillStyle = GRAF.neon; g.fill(); traco()
  g.beginPath()
  g.rect(cx + s * 1.6, cy - s * 0.3, s * 0.6, s * 0.22)
  g.fillStyle = '#f2f0ea'; g.fill()
  g.beginPath()
  g.rect(cx + s * 1.66, cy - s * 0.86, s * 0.48, s * 0.26)
  g.fillStyle = '#d9d9de'; g.fill(); traco()
  g.beginPath()
  g.rect(cx + s * 1.82, cy - s * 1.0, s * 0.16, s * 0.16)
  g.fillStyle = '#8e8e96'; g.fill(); traco()
  // jato: leque de tinta saindo da valvula, subindo pra direita
  g.strokeStyle = GRAF.fundoE
  g.lineWidth = s * 0.1
  g.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.arc(cx + s * 1.9, cy - s * 1.06, s * (0.3 + i * 0.24), Math.PI * 1.08, Math.PI * 1.75)
    g.stroke()
  }
  g.fillStyle = GRAF.fundoE
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (1.1 + i * 0.16)
    const d = s * 1.15
    g.beginPath()
    g.arc(cx + s * 1.9 + Math.cos(a) * d, cy - s * 1.06 + Math.sin(a) * d, s * 0.06, 0, 7)
    g.fill()
  }

  // --- cabeca de ovo --------------------------------------------------------
  g.beginPath()
  g.ellipse(cx, cy, s * 0.98, s * 1.22, 0, 0, 7)
  g.fillStyle = GRAF.pele
  g.fill(); traco()
  // sombra lateral da cabeca (cel shading de uma camada so)
  g.save()
  g.beginPath(); g.ellipse(cx, cy, s * 0.98, s * 1.22, 0, 0, 7); g.clip()
  g.fillStyle = 'rgba(120,70,50,0.22)'
  g.fillRect(cx + s * 0.42, cy - s * 1.3, s * 1.2, s * 2.6)
  g.restore()

  // --- olhos esbugalhados ---------------------------------------------------
  for (const sx of [-1, 1]) {
    g.beginPath()
    g.ellipse(cx + sx * s * 0.4, cy - s * 0.12, s * 0.35, s * 0.4, sx * 0.1, 0, 7)
    g.fillStyle = '#ffffff'; g.fill(); traco()
    g.beginPath()
    g.arc(cx + sx * s * 0.44, cy - s * 0.06, s * 0.15, 0, 7)
    g.fillStyle = GRAF.linha; g.fill()
    g.beginPath()
    g.arc(cx + sx * s * 0.38, cy - s * 0.14, s * 0.055, 0, 7)
    g.fillStyle = '#ffffff'; g.fill()
  }
  // sobrancelhas grossas e retas
  for (const sx of [-1, 1]) {
    g.beginPath()
    g.moveTo(cx + sx * s * 0.15, cy - s * 0.58)
    g.lineTo(cx + sx * s * 0.74, cy - s * 0.5)
    g.lineWidth = s * 0.16
    g.strokeStyle = GRAF.linha
    g.stroke()
  }

  // --- sorriso aberto -------------------------------------------------------
  g.beginPath()
  g.moveTo(cx - s * 0.46, cy + s * 0.5)
  g.quadraticCurveTo(cx, cy + s * 1.02, cx + s * 0.46, cy + s * 0.5)
  g.quadraticCurveTo(cx, cy + s * 0.66, cx - s * 0.46, cy + s * 0.5)
  g.closePath()
  g.fillStyle = GRAF.linha; g.fill()
  g.beginPath()
  g.moveTo(cx - s * 0.4, cy + s * 0.53)
  g.lineTo(cx + s * 0.4, cy + s * 0.53)
  g.lineWidth = s * 0.1
  g.strokeStyle = '#ffffff'
  g.stroke()

  // --- bone virado pra tras -------------------------------------------------
  // amarelo/laranja de proposito: o bone fica em cima da nuvem turquesa, e um
  // bone turquesa sumiria dentro dela
  g.beginPath()
  g.moveTo(cx - s * 1.0, cy - s * 0.62)
  g.quadraticCurveTo(cx, cy - s * 1.75, cx + s * 1.0, cy - s * 0.62)
  g.closePath()
  g.fillStyle = GRAF.fillA; g.fill(); traco()
  g.beginPath()
  g.moveTo(cx - s * 1.02, cy - s * 0.62)
  g.lineTo(cx - s * 1.85, cy - s * 0.44)
  g.lineTo(cx - s * 1.8, cy - s * 0.76)
  g.lineTo(cx - s * 1.0, cy - s * 0.88)
  g.closePath()
  g.fillStyle = GRAF.fillB; g.fill(); traco()
}

/**
 * Rabisco de tag: assinatura de marcador. Sobe reto, desce reto e fecha em
 * laco -- e esse vai-e-vem anguloso que le como caligrafia de rua; curva pura
 * saia parecendo onda de agua.
 */
function grafTag(g, x, y, w, h, cor, lw, rnd) {
  g.save()
  g.strokeStyle = cor
  g.lineWidth = lw
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const n = 4
  g.beginPath()
  g.moveTo(x, y + h * 0.7)
  for (let i = 0; i < n; i++) {
    const a = x + (i / n) * w
    const b = x + ((i + 0.45) / n) * w
    const c = x + ((i + 1) / n) * w
    g.lineTo(b + (rnd() - 0.5) * lw, y - h * (0.9 + rnd() * 0.4))
    g.lineTo(b + w * 0.06, y + h * (0.5 + rnd() * 0.4))
    g.quadraticCurveTo(c + w * 0.05, y + h * 1.2, c, y - h * 0.1)
    void a
  }
  g.stroke()
  // rabo comprido cortando a tag: e o que toda assinatura tem no fim
  g.beginPath()
  g.moveTo(x - w * 0.14, y + h * 1.1)
  g.lineTo(x + w * 1.22, y - h * 1.2)
  g.lineWidth = lw * 0.7
  g.stroke()
  g.restore()
}

/**
 * O grafite do muro do beco/lateral: concreto sujo + peca wildstyle "ZEZO"
 * (o barbeiro da cidade) + personagem + throw-up + tags e respingos.
 * 2048 x 468 = a mesma proporcao do muro (14 x 3.2 m), entao nada estica.
 */
function grafiteTex() {
  return cityTexWH('grafite-muro', 2048, 468, (g, W, H) => {
    const rnd = mulberry32(90210)
    const fam = '"Impact", "Arial Black", "Trebuchet MS", sans-serif'

    // ---- concreto de base ------------------------------------------------
    g.fillStyle = '#b0aba1'; g.fillRect(0, 0, W, H)
    for (let i = 0; i < 4200; i++) {
      const v = 150 + rnd() * 45
      g.fillStyle = 'rgba(' + v + ',' + (v - 3) + ',' + (v - 10) + ',' + (rnd() * 0.5) + ')'
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3)
    }
    // juntas verticais das placas (a cada ~2 m de muro)
    g.strokeStyle = 'rgba(120,116,108,0.5)'; g.lineWidth = 3
    for (let x = 292; x < W; x += 292) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke()
    }
    // escorridos de chuva descendo do topo
    for (let i = 0; i < 30; i++) {
      const x = rnd() * W
      g.fillStyle = 'rgba(96,92,86,' + (0.05 + rnd() * 0.10) + ')'
      g.fillRect(x, 0, 3 + rnd() * 16, H * (0.2 + rnd() * 0.75))
    }
    // barra suja embaixo (respingo de rua)
    const sujo = g.createLinearGradient(0, H * 0.62, 0, H)
    sujo.addColorStop(0, 'rgba(84,78,68,0)')
    sujo.addColorStop(1, 'rgba(70,64,54,0.55)')
    g.fillStyle = sujo; g.fillRect(0, H * 0.62, W, H * 0.38)

    // ---- nuvem turquesa atras da peca ------------------------------------
    g.save()
    g.globalAlpha = 0.95
    g.fillStyle = GRAF.fundoE
    grafBlob(g, 1130, 226, 610, 200, 0.13, 1.7); g.fill()
    g.fillStyle = GRAF.fundo
    grafBlob(g, 1122, 218, 585, 188, 0.13, 1.7); g.fill()
    g.restore()
    // riscos claros dentro da nuvem: da textura e evita fundo chapado
    g.save()
    grafBlob(g, 1122, 218, 585, 188, 0.13, 1.7); g.clip()
    g.strokeStyle = 'rgba(255,255,255,0.13)'
    g.lineWidth = 16
    for (let i = -6; i < 22; i++) {
      g.beginPath(); g.moveTo(i * 70, 460); g.lineTo(i * 70 + 240, -40); g.stroke()
    }
    g.restore()

    // respingos no fundo, antes das letras (ficam por baixo, como na parede)
    for (let i = 0; i < 9; i++) {
      grafRespingo(g, 560 + rnd() * 1150, 40 + rnd() * 380,
        7 + rnd() * 13, i % 2 ? GRAF.neon : GRAF.fundoE, rnd)
    }

    // ---- peca principal ---------------------------------------------------
    grafSeta(g, 660, 92, 40, -0.45)
    grafSeta(g, 1660, 330, 44, 2.85)
    grafPeca(g, 'ZEZO', 1140, 214, 268, 1.72, fam)
    grafCoroa(g, 742, 66, 48)

    // escorridos saindo da base do BLOCO 3D (nao das letras): a tinta que
    // escorre e a da ultima demao, e a ultima demao aqui e o roxo do bloco
    for (const d of [[812, 398, 42], [1006, 412, 26], [1198, 404, 54],
      [1372, 396, 34], [1470, 386, 46]]) {
      grafPingo(g, d[0], d[1], d[2], 15, GRAF.bloco)
    }
    for (const d of [[660, 372, 30], [1596, 350, 38]]) {
      grafPingo(g, d[0], d[1], d[2], 13, GRAF.fundoE)
    }

    // ---- throw-up de bolha a direita -------------------------------------
    g.save()
    g.translate(1830, 208)
    g.font = '900 210px ' + fam
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.transform(1, 0, -0.1, 1, 0, 0)
    g.strokeStyle = GRAF.linha; g.lineWidth = 52
    g.strokeText('RP', 0, 0)
    g.strokeStyle = '#f2f0ea'; g.lineWidth = 30
    g.strokeText('RP', 0, 0)
    g.fillStyle = '#f2f0ea'
    g.fillText('RP', 0, 0)
    g.strokeStyle = GRAF.neon; g.lineWidth = 8
    g.strokeText('RP', 0, 0)
    g.restore()
    grafPingo(g, 1780, 300, 40, 12, '#f2f0ea')
    grafPingo(g, 1888, 312, 26, 11, '#f2f0ea')

    // ---- personagem -------------------------------------------------------
    // nuvem propria atras do boneco, na MESMA familia de cor da peca: separa
    // ele do concreto e amarra os dois blocos da composicao
    g.fillStyle = GRAF.fundoE
    grafBlob(g, 300, 236, 232, 208, 0.15, 4.2); g.fill()
    g.fillStyle = GRAF.fundo
    grafBlob(g, 294, 230, 214, 194, 0.15, 4.2); g.fill()
    grafPersonagem(g, 292, 196, 82)

    // ---- tags menores em volta -------------------------------------------
    grafTag(g, 84, 384, 210, 34, GRAF.linha, 9, rnd)
    grafTag(g, 556, 74, 140, 24, '#f2f0ea', 7, rnd)
    grafTag(g, 1706, 100, 150, 26, GRAF.linha, 8, rnd)
    grafTag(g, 1580, 406, 180, 22, '#2b2b30', 7, rnd)
    g.save()
    g.font = 'bold 28px "Trebuchet MS", sans-serif'
    g.fillStyle = 'rgba(30,26,36,0.7)'
    g.fillText('MINI CITY  //  2026', 74, 444)
    g.restore()

    // ---- respingos por cima de tudo (a tinta que caiu depois) -------------
    for (let i = 0; i < 7; i++) {
      grafRespingo(g, rnd() * W, 60 + rnd() * 340, 5 + rnd() * 9,
        i % 3 === 0 ? GRAF.fillA : (i % 3 === 1 ? GRAF.neon : GRAF.fundo), rnd)
    }
    // poeira do concreto por cima, pra tinta nao ficar "adesivada"
    g.fillStyle = 'rgba(176,171,161,0.10)'
    for (let i = 0; i < 900; i++) {
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 7, 1 + rnd() * 3)
    }
  })
}

// ---------------------------------------------------------------------------

export function buildCity() {
  const group = new THREE.Group()
  group.name = 'city'
  const colliders = []
  const interactables = []
  const rnd = mulberry32(20260826)

  // posicoes coletadas pro "juice" de rua (folhas caidas, fios entre postes)
  const treePos = []
  // Os objetos de arvore, guardados so ate o forno de geometria rodar: e deles
  // que sai a caixa (altura e raio da copa) que world/neve.js usa pra por neve
  // em cima. Depois do bake() as arvores nao existem mais como objeto separado,
  // entao esta medida TEM que ser tirada antes.
  const treeObjs = []
  const bushPos = []
  const benchPos = []
  const lampPos = []
  const trashPos = []
  const seatTmp = new THREE.Vector3()
  let seatCount = 0


  // Luzes de rua e materiais de lampada exportados pro ciclo dia/noite.
  const lampLights = []
  const lampMatSet = new Set()

  let lightBudget = LIGHT_BUDGET
  function claimLight(l) {
    if (!l || !l.isLight) return false
    if (lightBudget <= 0) { if (l.parent) l.parent.remove(l); return false }
    // toda luz da cidade: sem sombra, com alcance e decaimento fisico
    l.castShadow = false
    l.decay = 2
    if (!l.distance || l.distance <= 0) l.distance = 14
    l.userData.baseIntensity = l.intensity
    lampLights.push(l)
    lightBudget--
    return true
  }

  /** Registra um material emissivo de lampada (o dia/noite acende/apaga). */
  function claimLampMat(m) {
    if (!m || !m.isMeshStandardMaterial || !m.emissive) return m
    if (m.userData.baseEmissive === undefined) m.userData.baseEmissive = m.emissiveIntensity
    lampMatSet.add(m)
    return m
  }
  /** Varre um objeto atras dos materiais brilhantes (lente do poste, etc). */
  function claimLampMats(o) {
    if (!o) return
    o.traverse((n) => {
      const m = n.material
      if (!m || Array.isArray(m) || !m.isMeshStandardMaterial || !m.emissive) return
      // ja registrado antes (o dia/noite pode ter abaixado a intensidade) ou
      // brilhante o bastante pra ser uma lampada
      if (m.userData.baseEmissive === undefined && m.emissiveIntensity < 1) return
      if (m.emissive.getHex() === 0) return
      claimLampMat(m)
    })
  }

  function col(minX, maxX, minZ, maxZ, tag) {
    colliders.push({ minX, maxX, minZ, maxZ, tag: tag || 'city' })
  }
  function colBox(cx, cz, w, d, tag) {
    col(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, tag)
  }

  // Occluders da camera: caixas COM altura. So entra aqui o que e alto o
  // bastante pra a camera de 3a pessoa nao poder atravessar (a fonte, o abrigo
  // de onibus, cacambas). Banco e lixeira ficam de fora de proposito: se
  // bloqueassem, a camera saltaria pra perto do jogador a cada giro.
  const occluders = []
  function occBox(cx, cz, w, d, h, tag) {
    occluders.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minY: 0, maxY: h,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      tag: tag || 'city',
    })
  }
  // Tudo que e estatico entra no "forno": no fim vira poucas meshes fundidas
  // por material. Sem isso a cidade passa de 3500 draw calls.
  const bakeBin = new THREE.Group()
  group.add(bakeBin)

  function add(m) { bakeBin.add(m); return m }
  function addLive(m) { group.add(m); return m }

  // Objetos animados (poste de barbeiro, ventoinha do AC, semaforo...) NAO
  // podem ser fundidos: a fusao mata o userData.update / userData.setPhase.
  const animUpdates = []
  const phaseSetters = []
  function registerAnimated(o) {
    const u = o.userData || {}
    if (typeof u.update === 'function') {
      animUpdates.push(u.update)
      // main.js tambem varre a cena atras de userData.update; tirar daqui
      // garante que a animacao rode uma vez so por frame.
      u.update = null
    }
    if (typeof u.setPhase === 'function') phaseSetters.push({ set: u.setPhase, last: -1 })
  }

  /** Funde o conteudo do forno por (material + castShadow). */
  function bake() {
    bakeBin.updateMatrixWorld(true)
    // 1) resgata do forno tudo que anima, mantendo a pose no mundo
    const animated = []
    bakeBin.traverse((n) => {
      if (n === bakeBin) return
      const u = n.userData
      if (!u) return
      if (typeof u.update === 'function' || typeof u.setPhase === 'function') animated.push(n)
    })
    for (const n of animated) {
      const mw = n.matrixWorld.clone()
      if (n.parent) n.parent.remove(n)
      mw.decompose(n.position, n.quaternion, n.scale)
      group.add(n)
      registerAnimated(n)
    }
    const buckets = new Map()
    const strays = []
    bakeBin.traverse((n) => {
      if (n === bakeBin) return
      // qualquer coisa que nao seja mesh/group (luzes, sprites) sobrevive inteira
      if (!n.isMesh && !n.isGroup && n.type !== 'Object3D') { strays.push(n); return }
      if (!n.isMesh || n.isInstancedMesh) return
      const g = n.geometry
      if (!g || !g.attributes || !g.attributes.position) return
      if (Array.isArray(n.material) || !n.material) return
      const key = n.material.uuid + (n.castShadow ? '|c' : '|n')
      let b = buckets.get(key)
      if (!b) { b = { mat: n.material, cast: n.castShadow, geos: [] }; buckets.set(key, b) }
      const gc = g.clone()
      if (!gc.attributes.normal) gc.computeVertexNormals()
      gc.applyMatrix4(n.matrixWorld)
      b.geos.push(gc)
    })
    // luzes e afins voltam pro grupo raiz mantendo a pose no mundo
    for (const l of strays) {
      const mw = l.matrixWorld.clone()
      if (l.parent) l.parent.remove(l)
      mw.decompose(l.position, l.quaternion, l.scale)
      group.add(l)
    }
    group.remove(bakeBin)
    bakeBin.clear()
    for (const b of buckets.values()) {
      const merged = mergeGeos(b.geos)
      if (!merged) continue
      const m = new THREE.Mesh(merged, b.mat)
      m.castShadow = b.cast
      m.receiveShadow = true
      group.add(m)
    }
  }

  // Lajes do beco (x0, x1, z0, z1) -- a geometria abaixo usa a mesma lista.
  const ALLEY_PADS = [
    [14, 34, 30, 34],
    [36, 52, 28, 32],
    [34, 36, 12, 34],
  ]
  // Piso das lojas: lote + avental. O miolo (interior) fica no mesmo nivel,
  // construido por barbershop.js / grocery.js.
  // LOTES (e nao [BARBER, GROCERY] na mao): o cassino tem a fachada virada pro
  // outro lado, e apronOf sabe disso. Com a lista escrita na mao, o cassino
  // ficaria com o piso do lote no nivel da RUA e o jogador andaria enterrado
  // 16 cm no proprio carpete.
  const SHOP_PADS = LOTES.map((b) => apronOf(b, SHOP_PAD))

  // Recorte em bezier da esquina arredondada: com u,v = distancia da quina
  // normalizada pelo raio, a curva e sqrt(u) + sqrt(v) = 1. Dentro dela e rua.
  function inCornerNotch(ax, az) {
    if (ax > RH + CORNER_R || az > RH + CORNER_R) return false
    return Math.sqrt((ax - RH) / CORNER_R) + Math.sqrt((az - RH) / CORNER_R) < 1
  }

  /**
   * Altura do piso num ponto XZ. Roda TODO frame no controller, entao e so
   * comparacao -- nada de raycast. Devolve as constantes de LEVELS.
   */
  function groundY(x, z) {
    const ax = Math.abs(x), az = Math.abs(z)
    // calcadas das avenidas centrais: bracos + quadrado da esquina (com o
    // recorte arredondado, onde volta a ser rua)
    if (ax >= RH && ax <= BI && az >= RH && az <= BO) {
      return inCornerNotch(ax, az) ? LEVELS.ROAD : LEVELS.SIDEWALK
    }
    if (az >= RH && az <= BI && ax >= RH && ax <= BO) {
      return inCornerNotch(ax, az) ? LEVELS.ROAD : LEVELS.SIDEWALK
    }
    // calcadas do anel: lado interno (sob os predios) e lado externo
    if (ax >= BO - SWW && ax <= BO && az >= BI && az <= BO) return LEVELS.SIDEWALK
    if (az >= BO - SWW && az <= BO && ax >= BI && ax <= BO) return LEVELS.SIDEWALK
    if (ax >= ROUT && ax <= ROUT + SWW && az <= ROUT + SWW) return LEVELS.SIDEWALK
    if (az >= ROUT && az <= ROUT + SWW && ax <= ROUT + SWW) return LEVELS.SIDEWALK
    // lojas (lote + avental), nivelado com a calcada
    for (let i = 0; i < SHOP_PADS.length; i++) {
      const p = SHOP_PADS[i]
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return LEVELS.SHOP_FLOOR
    }
    // parque e beco
    if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return LEVELS.PARK
    for (let i = 0; i < ALLEY_PADS.length; i++) {
      const p = ALLEY_PADS[i]
      if (x >= p[0] && x <= p[1] && z >= p[2] && z <= p[3]) return LEVELS.ALLEY
    }
    return LEVELS.ROAD   // asfalto e grama do resto do mapa
  }

  // -------------------------------------------------------------------------
  // MATERIAIS BASE
  // -------------------------------------------------------------------------
  // Grama: oliva lavada, na mesma familia dessaturada do resto da cidade.
  // A textura e a da cidade (cityGrassTex), nao a verde-neon de materials.js.
  const grassMap = cityGrassTex()
  // O chao base e um plano de 200 m com UV 0..1; as lajes de ExtrudeGeometry
  // usam UV em METROS. Deixando os dois com a MESMA densidade de textel
  // (0.45 tile/m) a emenda do parque com o gramado de fora some.
  const GRASS_PER_M = 0.45
  const matGrass = stdMat('city:grass', {
    map: tiled(grassMap, G * GRASS_PER_M, G * GRASS_PER_M), color: 0xc4cbaf, roughness: 1.0,
  })
  const matGrassPark = stdMat('city:grasspark', {
    map: tiled(grassMap, GRASS_PER_M, GRASS_PER_M), color: 0xc4cbaf, roughness: 1.0,
  })
  // Manchas de tom na grama. Antes eram discos de 20 lados com tom chapado: as
  // arestas do poligono viravam LINHAS RETAS atravessando o gramado. Agora sao
  // planos tingidos com alphaMap radial -- a mancha some antes da borda, entao
  // nao existe aresta pra aparecer, e duas manchas vizinhas se misturam.
  // No PARQUE as camadas sao empilhadas so por altura (grama 0 / mancha 6 mm /
  // terra 12 mm / lajota 24 mm): polygonOffset aqui fazia a mancha passar por
  // cima das lajotas do caminho.
  const grassBlob = blobMaskTex()
  function grassStainMat(key, color, opacity, extra) {
    return stdMat(key, Object.assign({
      color, alphaMap: grassBlob, transparent: true, opacity,
      depthWrite: false, roughness: 1.0,
    }, extra || {}))
  }
  const matGrassParkDark = grassStainMat('city:grassparkdark', 0x64703f, 0.26)
  const matGrassParkLight = grassStainMat('city:grassparklight', 0xc9cd9e, 0.2)
  const matGrassParkDry = grassStainMat('city:grassparkdry', 0xb5a56e, 0.22)
  // No gramado externo o chao e um plano de 200 m visto de longe: la a
  // precisao do depth buffer e pior, entao vale o polygonOffset.
  const GPOFF = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }
  const matGrassDark = grassStainMat('city:grassdark', 0x64703f, 0.26, GPOFF)
  const matGrassLight = grassStainMat('city:grasslight', 0xc9cd9e, 0.2, GPOFF)
  const matGrassDry = grassStainMat('city:grassdry', 0xb5a56e, 0.22, GPOFF)
  // terra batida: contorno onde a grama encontra os caminhos de pedra
  const matDirt = stdMat('city:dirt', {
    map: tiled(concreteTex(1), 0.55, 0.55), color: 0x9d8a72, roughness: 1.0,
  })
  const matWalk = stdMat('city:walk', {
    map: tiled(concreteTex(1), 0.26, 0.26), color: 0xf0ede7, roughness: 0.95,
  })
  const matWalkDirty = stdMat('city:walk2', {
    map: tiled(concreteTex(1), 0.26, 0.26), color: 0xd9d4cb, roughness: 0.98,
  })
  const matCurb = solid(PALETTE.curb, 0.92)
  const matCurbPaint = solid(0xe9e4d6, 0.9)
  const matLine = stdMat('city:line', Object.assign({
    color: 0xe2cf62, roughness: 0.72, emissive: 0x4a3f12, emissiveIntensity: 0.3,
  }, DECAL_OFF))
  const matLineW = stdMat('city:linew', Object.assign({
    color: 0xeeeae0, roughness: 0.72, emissive: 0x333333, emissiveIntensity: 0.22,
  }, DECAL_OFF))
  // faixa gasta: mesma pintura, mais suja e menos "nova"
  const matLineWorn = stdMat('city:linewworn', Object.assign({
    color: 0xb9b4a6, roughness: 0.95, emissive: 0x222222, emissiveIntensity: 0.12,
  }, DECAL_OFF))
  // Remendo de asfalto: recorte irregular vindo da textura, translucido e com
  // pouco contraste. Chapado e opaco como antes, lia como sombra sem objeto.
  const matPatch = stdMat('city:patch', Object.assign({
    map: asphaltPatchTex(), color: 0xa8a8ac, roughness: 0.99,
    transparent: true, opacity: 0.58, depthWrite: false,
  }, DECAL_OFF))
  // remendo velho, ja clareado pelo sol (mistura os dois na rua)
  const matPatchOld = stdMat('city:patchold', Object.assign({
    map: asphaltPatchTex(), color: 0xd2cec4, roughness: 1.0,
    transparent: true, opacity: 0.42, depthWrite: false,
  }, DECAL_OFF))
  const matIron = solid(0x3b3a38, 0.6, 0.7)
  const matTactile = solid(0xd9a520, 0.85)
  const matStone = stdMat('city:stone', {
    map: tiled(concreteTex(1), 0.9, 0.9), color: 0xcbc3b2, roughness: 0.95,
  })
  // Agua da fonte: cor mais viva, bem lisa (reflexo especular do sol) e
  // translucida o bastante pra deixar o azulejo do fundo aparecer.
  const matWater = stdMat('city:water', {
    color: 0x35bfe2, transparent: true, opacity: 0.5, roughness: 0.04,
    metalness: 0.35, emissive: 0x0e4a5e, emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  })
  // Jatos/gotas: mais claros e opacos, quase espuma
  const matJet = stdMat('city:jet', {
    color: 0xdff6ff, transparent: true, opacity: 0.72, roughness: 0.12,
    metalness: 0.1, emissive: 0x2b6f88, emissiveIntensity: 0.35,
  })
  const matFoam = stdMat('city:foam', {
    color: 0xf4fbff, transparent: true, opacity: 0.34, roughness: 0.95,
    depthWrite: false,
  })
  // Poça: o formato, a borda nitida e o reflexo do ceu vem da textura. Antes
  // era metalness 0.75 sem environment map, ou seja: um disco preto no asfalto.
  const puddleMap = puddleTex()
  const matPuddle = stdMat('city:puddle', Object.assign({
    map: puddleMap, transparent: true, opacity: 0.78,
    roughness: 0.16, metalness: 0.12,
    emissive: 0xffffff, emissiveMap: puddleMap, emissiveIntensity: 0.07,
    depthWrite: false,
  }, DECAL_OFF))
  // Junta de dilatacao / sujeira de calcada
  const matJoint = stdMat('city:joint', Object.assign({
    color: 0x6f6b64, roughness: 1.0, transparent: true, opacity: 0.5, depthWrite: false,
  }, DECAL_OFF))

  // -------------------------------------------------------------------------
  // 1. CHAO BASE (grama)
  // -------------------------------------------------------------------------
  const ground = plane(G, G, matGrass)
  ground.position.y = 0
  ground.receiveShadow = true
  addLive(ground)

  // -------------------------------------------------------------------------
  // 2. ASFALTO
  // -------------------------------------------------------------------------
  const asph = asphaltTex(1)
  function road(x0, x1, z0, z1, shadeMul) {
    const w = x1 - x0, d = z1 - z0
    const s = shadeMul || 1
    // um material por (tom + densidade de textel), cacheado
    const mm = stdMat('city:road:' + s + ':' + w.toFixed(1) + ':' + d.toFixed(1), {
      map: tiled(asph, w / 7, d / 7),
      color: new THREE.Color(0xffffff).multiplyScalar(s).getHex(),
      roughness: 0.96,
    })
    const mesh = plane(w, d, mm)
    mesh.position.set((x0 + x1) / 2, ROAD_Y, (z0 + z1) / 2)
    mesh.receiveShadow = true
    return addLive(mesh)
  }

  road(-RH, RH, -ROUT, ROUT, 1.0)            // avenida vertical (x=0)
  road(-RIN, -RH, -RH, RH, 0.97)             // avenida horizontal oeste
  road(RH, RIN, -RH, RH, 0.97)               // avenida horizontal leste
  road(-ROUT, -RIN, -ROUT, ROUT, 0.93)       // anel oeste
  road(RIN, ROUT, -ROUT, ROUT, 0.93)         // anel leste
  road(-RIN, -RH, -ROUT, -RIN, 0.9)          // anel norte (2 pedacos)
  road(RH, RIN, -ROUT, -RIN, 0.9)
  road(-RIN, -RH, RIN, ROUT, 0.9)            // anel sul
  road(RH, RIN, RIN, ROUT, 0.9)

  // --- faixa central tracejada (uma unica InstancedMesh) -------------------
  const dashes = []
  const DASH_L = 2.6, DASH_GAP = 2.6
  function dashLine(a0, a1, fixed, axis, skip) {
    for (let a = a0; a < a1; a += DASH_L + DASH_GAP) {
      const c = a + DASH_L / 2
      if (skip && skip(c)) continue
      if (axis === 'z') dashes.push({ x: fixed, z: c, ry: 0 })
      else dashes.push({ x: c, z: fixed, ry: Math.PI / 2 })
    }
  }
  const skipCross = (v) => Math.abs(v) < BI + 1 || (Math.abs(v) > RIN - 1 && Math.abs(v) < ROUT + 1)
  dashLine(-ROUT, ROUT, 0, 'z', skipCross)
  dashLine(-ROUT, ROUT, 0, 'x', skipCross)
  dashLine(-ROUT, ROUT, RING, 'z', (v) => Math.abs(v) < BI + 1 || Math.abs(Math.abs(v) - RING) < RH + 1)
  dashLine(-ROUT, ROUT, -RING, 'z', (v) => Math.abs(v) < BI + 1 || Math.abs(Math.abs(v) - RING) < RH + 1)
  dashLine(-ROUT, ROUT, RING, 'x', (v) => Math.abs(v) < BI + 1 || Math.abs(Math.abs(v) - RING) < RH + 1)
  dashLine(-ROUT, ROUT, -RING, 'x', (v) => Math.abs(v) < BI + 1 || Math.abs(Math.abs(v) - RING) < RH + 1)

  const dashGeo = new THREE.BoxGeometry(0.18, MARK_H, DASH_L)
  const dashIM = new THREE.InstancedMesh(dashGeo, matLine, dashes.length)
  const dummy = new THREE.Object3D()
  dashes.forEach((d, i) => {
    dummy.position.set(d.x, MARK_Y, d.z)
    dummy.rotation.set(0, d.ry, 0)
    dummy.scale.set(1, 1, 1)
    dummy.updateMatrix()
    dashIM.setMatrixAt(i, dummy.matrix)
  })
  dashIM.castShadow = false; dashIM.receiveShadow = true
  addLive(dashIM)

  // --- faixas de pedestre (zebra) nos 4 acessos do cruzamento --------------
  const zebra = []
  const ZW = 0.55, ZSP = 1.28, ZLEN = 3.2
  function crossing(axis, at) {
    // axis 'x' = travessia atravessa a avenida vertical (anda em X)
    const half = RH - 0.6
    for (let v = -half; v <= half - ZW; v += ZSP) {
      if (axis === 'x') zebra.push({ x: v + ZW / 2, z: at, ry: 0 })
      else zebra.push({ x: at, z: v + ZW / 2, ry: Math.PI / 2 })
    }
  }
  crossing('x', -BI + 1.6)
  crossing('x', BI - 1.6)
  crossing('z', -BI + 1.6)
  crossing('z', BI - 1.6)
  // faixa com desgaste: cada risco perde um pouco de largura/comprimento e
  // 1 em 4 vai pro material "gasto" (a rua nao e pintada ontem)
  const zebraGeo = new THREE.BoxGeometry(ZW, MARK_H, ZLEN)
  const zebraFresh = [], zebraOld = []
  zebra.forEach((d, i) => { (i % 4 === 1 || rnd() > 0.78 ? zebraOld : zebraFresh).push(d) })
  function zebraIM(list, mat) {
    if (!list.length) return
    const im = new THREE.InstancedMesh(zebraGeo, mat, list.length)
    list.forEach((d, i) => {
      dummy.position.set(d.x, MARK_Y, d.z)
      dummy.rotation.set(0, d.ry, 0)
      dummy.scale.set(0.86 + rnd() * 0.14, 1, 0.9 + rnd() * 0.1)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    })
    im.castShadow = false; im.receiveShadow = true
    addLive(im)
  }
  zebraIM(zebraFresh, matLineW)
  zebraIM(zebraOld, matLineWorn)

  // --- linhas de retencao (stop lines) -------------------------------------
  const stopGeo = new THREE.BoxGeometry(RH - 0.8, MARK_H, 0.42)
  for (const s of [
    { x: RH / 2 + 0.2, z: -BI - 0.4, ry: 0 },
    { x: -RH / 2 - 0.2, z: BI + 0.4, ry: 0 },
    { x: -BI - 0.4, z: -RH / 2 - 0.2, ry: Math.PI / 2 },
    { x: BI + 0.4, z: RH / 2 + 0.2, ry: Math.PI / 2 },
  ]) {
    const m = new THREE.Mesh(stopGeo, matLineW)
    m.position.set(s.x, MARK_Y, s.z)
    m.rotation.y = s.ry
    m.receiveShadow = true
    add(m)
  }

  // --- remendos escuros e bueiros ------------------------------------------
  // Menos remendos, menores e sem nenhum no miolo do cruzamento -- la um deles
  // ficava exatamente no meio da pista e parecia um buraco.
  const patches = []
  for (let i = 0; i < 24; i++) {
    let x, z
    if (rnd() > 0.5) { x = (rnd() - 0.5) * 13; z = (rnd() - 0.5) * 2 * ROUT }
    else { x = (rnd() - 0.5) * 2 * ROUT; z = (rnd() - 0.5) * 13 }
    if (Math.abs(x) > RIN - 2 || Math.abs(z) > RIN - 2) continue
    if (Math.abs(x) < BI + 2 && Math.abs(z) < BI + 2) continue
    patches.push({ x, z, s: 0.55 + rnd() * 0.85, ry: rnd() * Math.PI, old: rnd() > 0.55 })
  }
  const patchGeo = new THREE.PlaneGeometry(1, 1)
  function patchIM(list, mat) {
    if (!list.length) return
    const im = new THREE.InstancedMesh(patchGeo, mat, list.length)
    list.forEach((p, i) => {
      dummy.position.set(p.x, ROAD_Y + 0.004, p.z)   // decalque rente ao asfalto
      dummy.rotation.set(-Math.PI / 2, 0, p.ry)
      dummy.scale.set(p.s * 2.1, p.s * 2.1 * (0.55 + rnd() * 0.8), 1)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    })
    im.castShadow = false; im.receiveShadow = true
    addLive(im)
  }
  patchIM(patches.filter((p) => !p.old), matPatch)
  patchIM(patches.filter((p) => p.old), matPatchOld)

  // bueiros: usa prop se existir, senao um disco de ferro
  const manholeGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 16)
  const manholeSpots = [
    [4.5, -22], [-4.5, 18], [-4.5, -40], [4.5, 42],
    [22, 4.5], [-30, -4.5], [44, -4.5], [-44, 4.5],
    [4.5, 56], [-4.5, -56], [56, 4.5], [-56, -4.5],
  ]
  // colar de concreto em volta: a tampa deixa de ser um disco solto no asfalto
  const collarGeo = new THREE.CylinderGeometry(0.62, 0.66, 0.05, 18)
  const collarMat = solid(0x6e6a63, 0.98)
  const stainGeo = new THREE.CircleGeometry(1, 14)
  const stainMat = stdMat('city:manholestain', Object.assign({
    color: 0x1d2024, roughness: 1.0, transparent: true, opacity: 0.32, depthWrite: false,
  }, DECAL_OFF))
  for (const [mx, mz] of manholeSpots) {
    const collar = new THREE.Mesh(collarGeo, collarMat)
    collar.position.set(mx, ROAD_Y + 0.012, mz)   // base rente ao asfalto
    collar.castShadow = false; collar.receiveShadow = true
    add(collar)
    const st = new THREE.Mesh(stainGeo, stainMat)
    st.rotation.x = -Math.PI / 2
    st.rotation.z = rnd() * 6.28
    st.position.set(mx, ROAD_Y + 0.004, mz)
    st.scale.set(1.1 + rnd() * 0.7, 0.9 + rnd() * 0.6, 1)
    st.castShadow = false
    add(st)
    if (typeof Props.makeManhole === 'function') {
      const p = Props.makeManhole()
      p.position.set(mx, ROAD_Y + 0.036, mz)
      add(p); harvest(p)
    } else {
      const m = new THREE.Mesh(manholeGeo, matIron)
      m.position.set(mx, ROAD_Y + 0.06, mz)
      m.receiveShadow = true
      add(m)
    }
  }

  // -------------------------------------------------------------------------
  // 3. CALCADAS + MEIO-FIO + ESQUINAS ARREDONDADAS + RAMPAS
  // -------------------------------------------------------------------------

  /**
   * O que sobra de um retangulo depois de tirar a pegada dos predios COM
   * INTERIOR (LOTES). Devolve uma lista de retangulos.
   *
   * Existe por causa de um bug que so aparece de dentro da casa: a calcada do
   * anel vai de x=48 a x=52, e o lote da casa velha vai de 38 a 50 — os dois
   * metros que se cruzam ficavam com DUAS lajes no mesmo Y (0.16), a calcada
   * daqui e o assoalho de tabua de casa-velha.js. O resultado era uma mancha de
   * calcada quadriculada brigando com a madeira no meio da sala, que e
   * exatamente o "piso bugando" que o dono do projeto fotografou.
   *
   * Corta em faixas em vez de furar a laje com um `hole`: o recorte encosta na
   * borda do retangulo (a casa comeca em z=12, que e onde a calcada comeca), e
   * furo que toca o contorno e caso degenerado pra triangulacao.
   *
   * So os LOTES entram. Predio de cenario (FILLERS) e caixa macica: a calcada
   * por baixo dele nao aparece pra ninguem, e recortar seria trabalho e
   * geometria a mais por nada.
   */
  function semLotes(x0, x1, z0, z1) {
    let pecas = [[x0, x1, z0, z1]]
    for (let i = 0; i < LOTES.length; i++) {
      const b = LOTES[i]
      const prox = []
      for (let k = 0; k < pecas.length; k++) {
        const p = pecas[k]
        if (b.x1 <= p[0] || b.x0 >= p[1] || b.z1 <= p[2] || b.z0 >= p[3]) { prox.push(p); continue }
        const cx0 = Math.max(p[0], b.x0), cx1 = Math.min(p[1], b.x1)
        const cz0 = Math.max(p[2], b.z0), cz1 = Math.min(p[3], b.z1)
        if (p[2] < cz0 - 0.001) prox.push([p[0], p[1], p[2], cz0])
        if (cz1 < p[3] - 0.001) prox.push([p[0], p[1], cz1, p[3]])
        if (p[0] < cx0 - 0.001) prox.push([p[0], cx0, cz0, cz1])
        if (cx1 < p[1] - 0.001) prox.push([cx1, p[1], cz0, cz1])
      }
      pecas = prox
    }
    return pecas
  }

  /** Laje de calcada retangular. sides = quais bordas ganham meio-fio. */
  function walk(x0, x1, z0, z1, sides, dirty) {
    // A LAJE e recortada nos lotes; o MEIO-FIO nao. Ele fica na borda externa,
    // encostado na rua, e nenhum predio chega la — recortar so criaria emenda.
    const pedacos = semLotes(x0, x1, z0, z1)
    for (let i = 0; i < pedacos.length; i++) {
      const q = pedacos[i]
      add(slabFromShape(rectShape(q[0], q[1], q[2], q[3]), CH, dirty ? matWalkDirty : matWalk))
    }
    const ss = sides || []
    for (const side of ss) {
      let bx0 = x0, bx1 = x1, bz0 = z0, bz1 = z1
      // O meio-fio AVANCA 2.5 cm pra fora da laje: antes a face externa dele
      // caia no mesmo plano da lateral da calcada e as duas piscavam.
      if (side === 'x-') { bx0 = x0 - CURB_OUT; bx1 = x0 + CURB_W }
      else if (side === 'x+') { bx0 = x1 - CURB_W; bx1 = x1 + CURB_OUT }
      else if (side === 'z-') { bz0 = z0 - CURB_OUT; bz1 = z0 + CURB_W }
      else if (side === 'z+') { bz0 = z1 - CURB_W; bz1 = z1 + CURB_OUT }
      // recorta o canto pra duas barras de meio-fio nao coincidirem (z-fight)
      if (side === 'z-' || side === 'z+') {
        if (ss.indexOf('x-') >= 0) bx0 = x0 + CURB_W
        if (ss.indexOf('x+') >= 0) bx1 = x1 - CURB_W
      }
      const c = box(bx1 - bx0, CH + 0.02, bz1 - bz0, matCurb,
        (bx0 + bx1) / 2, (CH + 0.02) / 2, (bz0 + bz1) / 2)
      c.castShadow = false
      add(c)
    }
  }

  // Calcadas das avenidas centrais: vao de BI ate BO e encostam no anel.
  walk(RH, BI, BI, BO, ['x-', 'z+'])
  walk(RH, BI, -BO, -BI, ['x-', 'z-'])
  walk(-BI, -RH, BI, BO, ['x+', 'z+'])
  walk(-BI, -RH, -BO, -BI, ['x+', 'z-'])
  walk(BI, BO, RH, BI, ['z-', 'x+'])
  walk(-BO, -BI, RH, BI, ['z-', 'x-'])
  walk(BI, BO, -BI, -RH, ['z+', 'x+'])
  walk(-BO, -BI, -BI, -RH, ['z+', 'x-'])

  // Calcadas do anel, lado interno. Cortadas em |v| < BI para NAO tapar o
  // encontro das avenidas centrais com a rua do anel.
  const IN0 = BO - SWW
  walk(IN0, BO, BI, BO, ['x+'], true)
  walk(IN0, BO, -BO, -BI, ['x+'], true)
  walk(-BO, -IN0, BI, BO, ['x-'], true)
  walk(-BO, -IN0, -BO, -BI, ['x-'], true)
  walk(BI, IN0, IN0, BO, ['z+'], true)
  walk(-IN0, -BI, IN0, BO, ['z+'], true)
  walk(BI, IN0, -BO, -IN0, ['z-'], true)
  walk(-IN0, -BI, -BO, -IN0, ['z-'], true)

  // Calcadas do anel, lado externo (borda do mapa)
  walk(ROUT, ROUT + SWW, -ROUT - SWW, ROUT + SWW, ['x-'], true)
  walk(-ROUT - SWW, -ROUT, -ROUT - SWW, ROUT + SWW, ['x+'], true)
  walk(-ROUT, ROUT, ROUT, ROUT + SWW, ['z-'], true)
  walk(-ROUT, ROUT, -ROUT - SWW, -ROUT, ['z+'], true)

  // --- 4 esquinas arredondadas do cruzamento central -----------------------
  function cornerWalk(sx, sz) {
    const r = CORNER_R
    const gw = CURB_W
    const inner = [
      [sx * BI, sz * BI],
      [sx * BI, sz * RH],
    ].concat(arcPts([sx * (RH + r), sz * RH], [sx * RH, sz * RH], [sx * RH, sz * (RH + r)], 8))
      .concat([[sx * RH, sz * BI]])
    add(slabFromShape(shapeFromPoints(inner), CH, matWalk))

    // meio-fio da esquina: banda de largura gw seguindo a borda arredondada.
    // Fica em [RH, RH+gw], igual as retas, pra nao criar degrau na emenda.
    // borda externa 2.5 cm pra dentro da rua: nao fica coplanar com a lateral
    // da laje da esquina (que termina exatamente em RH)
    const RO = RH - CURB_OUT
    const outPath = [[sx * BI, sz * RO]]
      .concat(arcPts([sx * (RO + r), sz * RO], [sx * RO, sz * RO], [sx * RO, sz * (RO + r)], 8))
      .concat([[sx * RO, sz * BI]])
    const inPath = [[sx * (RH + gw), sz * BI]]
      .concat(arcPts([sx * (RH + gw), sz * (RH + r)], [sx * (RH + gw), sz * (RH + gw)],
        [sx * (RH + r), sz * (RH + gw)], 8))
      .concat([[sx * BI, sz * (RH + gw)]])
    const band = shapeFromPoints(outPath.concat(inPath))
    const bm = slabFromShape(band, CH + 0.02, matCurb)
    bm.castShadow = false
    add(bm)

    // rampas de acesso (uma pra cada rua) + piso tatil amarelo
    ramp(sx * (RH + 1.0), sz * (RH + 3.4), sx > 0 ? -Math.PI / 2 : Math.PI / 2)
    ramp(sx * (RH + 3.4), sz * (RH + 1.0), sz > 0 ? Math.PI : 0)
  }

  const rampGeo = new THREE.BoxGeometry(2.4, 0.12, 1.7)
  const padGeo = new THREE.BoxGeometry(2.0, 0.03, 0.7)
  function ramp(x, z, ry) {
    const g2 = new THREE.Group()
    g2.position.set(x, 0, z)
    g2.rotation.y = ry
    // +Z local aponta pra rua: inclina pra baixo nesse sentido
    const slope = Math.atan2(CH, 1.5)
    const r = new THREE.Mesh(rampGeo, matWalkDirty)
    r.rotation.x = slope
    r.position.set(0, CH / 2 - 0.03, 0)
    r.castShadow = false; r.receiveShadow = true
    g2.add(r)
    const pad = new THREE.Mesh(padGeo, matTactile)
    pad.rotation.x = slope
    pad.position.set(0, CH - 0.02, -0.4)
    pad.receiveShadow = true
    g2.add(pad)
    add(g2)
  }

  cornerWalk(1, 1); cornerWalk(1, -1); cornerWalk(-1, 1); cornerWalk(-1, -1)

  // --- sujeira/manchas na calcada (decalques instanciados, quase de graca) --
  const grime = []
  const grimeMat = stdMat('city:grime', Object.assign({
    color: 0x6d6a63, roughness: 1.0, transparent: true, opacity: 0.34, depthWrite: false,
  }, DECAL_OFF))
  for (let i = 0; i < 140; i++) {
    const along = (rnd() - 0.5) * 2 * (BO - 2)
    const across = RH + 0.6 + rnd() * (SWW - 1.2)
    const s1 = rnd() > 0.5 ? 1 : -1
    let x, z
    if (rnd() > 0.5) { x = s1 * across; z = along }
    else { x = along; z = s1 * across }
    if (Math.abs(x) > BO || Math.abs(z) > BO) continue
    grime.push({ x, z, s: 0.35 + rnd() * 1.25, ry: rnd() * Math.PI })
  }
  const grimeGeo = new THREE.CircleGeometry(1, 8)
  if (grime.length) {
    const gim = new THREE.InstancedMesh(grimeGeo, grimeMat, grime.length)
    grime.forEach((p, i) => {
      dummy.position.set(p.x, CH + 0.006, p.z)
      dummy.rotation.set(-Math.PI / 2, 0, p.ry)
      dummy.scale.set(p.s, p.s * (0.5 + rnd() * 0.8), 1)
      dummy.updateMatrix()
      gim.setMatrixAt(i, dummy.matrix)
    })
    gim.castShadow = false; gim.receiveShadow = false
    addLive(gim)
  }

  // --- juntas de dilatacao das calcadas (uma InstancedMesh, 1 draw call) ----
  // Sem as juntas a calcada e um lencol liso de 40 m; com elas o olho le
  // "placas de concreto" e a escala do mundo fica certa.
  const joints = []
  const JOINT_STEP = 2.4
  // A tira tem comprimento no X local; com rotation.set(-PI/2, 0, ry) ela
  // aponta pra (cos ry, 0, -sin ry). Logo: ry = 0 -> corre em X,
  // ry = PI/2 -> corre em Z. Os dois estavam TROCADOS, e a junta longitudinal
  // de 40 m virava uma tira atravessada saindo da calcada e cruzando o
  // gramado do parque a 5 cm do chao (a "linha reta no meio da grama").
  function jointRun(along0, along1, acrossCenter, acrossW, axis) {
    for (let a = along0; a <= along1 + 0.01; a += JOINT_STEP) {
      // junta transversal: atravessa a LARGURA da calcada
      if (axis === 'z') joints.push({ x: acrossCenter, z: a, ry: 0, len: acrossW })
      else joints.push({ x: a, z: acrossCenter, ry: Math.PI / 2, len: acrossW })
    }
    // junta longitudinal no meio: acompanha o COMPRIMENTO do braco
    if (axis === 'z') joints.push({ x: acrossCenter, z: (along0 + along1) / 2, ry: Math.PI / 2, len: along1 - along0 })
    else joints.push({ x: (along0 + along1) / 2, z: acrossCenter, ry: 0, len: along1 - along0 })
  }
  const ARM_C = (RH + BI) / 2
  for (const s of [1, -1]) {
    jointRun(BI, BO, s * ARM_C, SWW, 'z')
    jointRun(-BO, -BI, s * ARM_C, SWW, 'z')
    jointRun(BI, BO, s * ARM_C, SWW, 'x')
    jointRun(-BO, -BI, s * ARM_C, SWW, 'x')
  }
  if (joints.length) {
    const jGeo = new THREE.PlaneGeometry(1, 0.055)
    const jim = new THREE.InstancedMesh(jGeo, matJoint, joints.length)
    joints.forEach((j, i) => {
      dummy.position.set(j.x, CH + 0.004, j.z)
      dummy.rotation.set(-Math.PI / 2, 0, j.ry)
      dummy.scale.set(j.len, 1, 1)
      dummy.updateMatrix()
      jim.setMatrixAt(i, dummy.matrix)
    })
    jim.castShadow = false; jim.receiveShadow = false
    addLive(jim)
  }

  // --- poças na sarjeta (juice: reflexo especular do sol / dos postes) ------
  // Ficam DENTRO da pista encostadas no meio-fio (|across| < RH), que e onde a
  // agua realmente empoça -- antes caiam em |across| > RH, ou seja, escondidas
  // debaixo da calcada. |along| >= 14 mantem fora das faixas de pedestre.
  const puddleSpots = []
  for (let i = 0; i < 11; i++) {
    const along = (rnd() > 0.5 ? 1 : -1) * (14 + rnd() * (BO - 20))
    const s1 = rnd() > 0.5 ? 1 : -1
    const across = s1 * (RH - 1.25 + rnd() * 0.7)
    const flip = rnd() > 0.5
    puddleSpots.push({
      x: flip ? across : along, z: flip ? along : across,
      sx: 1.1 + rnd() * 1.5, sz: 0.7 + rnd() * 0.9, ry: rnd() * 3,
    })
  }
  const puddleDisc = new THREE.PlaneGeometry(1, 1)
  const pim = new THREE.InstancedMesh(puddleDisc, matPuddle, puddleSpots.length)
  puddleSpots.forEach((p, i) => {
    dummy.position.set(p.x, ROAD_Y + 0.005, p.z)
    dummy.rotation.set(-Math.PI / 2, 0, p.ry)
    dummy.scale.set(p.sx, p.sz, 1)
    dummy.updateMatrix()
    pim.setMatrixAt(i, dummy.matrix)
  })
  pim.castShadow = false; pim.receiveShadow = false
  addLive(pim)

  // -------------------------------------------------------------------------
  // 4. PREDIOS DE FUNDO (FILLERS)
  // -------------------------------------------------------------------------

  // acumuladores globais das janelas -> pouquissimos draw calls.
  // Cada lista vira UMA InstancedMesh no fim; as camadas (forro, vidro,
  // moldura, peitoril) tem faixas de Z separadas (ver WIN_*_Z la em cima).
  const winFrames = [], winSills = [], winStreaks = []
  const winBack = []        // forro escuro do comodo
  const winBlind = []       // persiana horizontal
  const winCurtain = []     // cortina clara
  const winGlass = [[], [], []]   // 3 tons de vidro apagado
  const winWarm = [], winCool = []

  const FACE_DEF = {
    'z+': { ang: 0, nx: 0, nz: 1, tx: 1, tz: 0 },
    'z-': { ang: Math.PI, nx: 0, nz: -1, tx: -1, tz: 0 },
    'x+': { ang: Math.PI / 2, nx: 1, nz: 0, tx: 0, tz: -1 },
    'x-': { ang: -Math.PI / 2, nx: -1, nz: 0, tx: 0, tz: 1 },
  }

  const STREET_EDGES = [-RIN, -RH, RH, RIN]
  function nearestStreetFace(b) {
    const cand = []
    let best = Infinity
    for (const c of STREET_EDGES) { if (c >= b.x1) { best = Math.min(best, c - b.x1) } }
    cand.push({ face: 'x+', d: best })
    best = Infinity
    for (const c of STREET_EDGES) { if (c <= b.x0) { best = Math.min(best, b.x0 - c) } }
    cand.push({ face: 'x-', d: best })
    best = Infinity
    for (const c of STREET_EDGES) { if (c >= b.z1) { best = Math.min(best, c - b.z1) } }
    cand.push({ face: 'z+', d: best })
    best = Infinity
    for (const c of STREET_EDGES) { if (c <= b.z0) { best = Math.min(best, b.z0 - c) } }
    cand.push({ face: 'z-', d: best })
    cand.sort((a, b2) => a.d - b2.d)
    return cand[0].face
  }

  // Recorta um retangulo de lote contra os ja colocados (e contra as lajes do
  // beco): retangulos coplanares no mesmo Y sao a receita do z-fighting.
  const lotRects = ALLEY_PADS.map((p) => ({ x0: p[0], x1: p[1], z0: p[2], z1: p[3] }))
  function clipLotRect(x0, x1, z0, z1) {
    for (const r of lotRects) {
      let guard = 0
      while (x0 < r.x1 - 0.001 && x1 > r.x0 + 0.001 && z0 < r.z1 - 0.001 && z1 > r.z0 + 0.001 && guard++ < 4) {
        const px = Math.min(x1 - r.x0, r.x1 - x0)
        const pz = Math.min(z1 - r.z0, r.z1 - z0)
        if (px <= pz) {
          if (x1 - r.x0 < r.x1 - x0) x1 = r.x0; else x0 = r.x1
        } else {
          if (z1 - r.z0 < r.z1 - z0) z1 = r.z0; else z0 = r.z1
        }
      }
    }
    lotRects.push({ x0, x1, z0, z1 })
    return [x0, x1, z0, z1]
  }

  const trimMat = solid(0xe6e0d2, 0.85)
  const doorWood = stdMat('city:doorwood', { map: tiled(woodTex(1), 1, 2), roughness: 0.7 })
  const shopGlow = emissive(0xffe4b0, 0.9)

  const bandGeoCache = new Map()
  function bandGeo(w, d, hh) {
    const k = w.toFixed(1) + ':' + d.toFixed(1) + ':' + hh
    if (!bandGeoCache.has(k)) bandGeoCache.set(k, new THREE.BoxGeometry(w, hh, d))
    return bandGeoCache.get(k)
  }

  // --- pecas reutilizadas nos predios --------------------------------------
  const railMat = solid(0x3d4249, 0.55, 0.6)
  const pipeMat = solid(0x585c60, 0.7, 0.35)
  const escapeMat = solid(0x4a4340, 0.8, 0.35)
  // Manchas de encardido: alpha vertical, escuro em cima. Sao decalques
  // transparentes com polygonOffset, colados na parede.
  const dirtStreakMat = stdMat('city:streak', Object.assign({
    map: tex('streakv', 64, (g, s) => {
      const grd = g.createLinearGradient(0, 0, 0, s)
      grd.addColorStop(0, 'rgba(40,36,30,0.85)')
      grd.addColorStop(0.55, 'rgba(50,45,38,0.35)')
      grd.addColorStop(1, 'rgba(60,55,48,0)')
      g.fillStyle = grd; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 90; i++) {
        g.fillStyle = 'rgba(30,26,22,' + (Math.random() * 0.35) + ')'
        g.fillRect(Math.random() * s, 0, 1 + Math.random() * 2, Math.random() * s)
      }
    }, 1),
    transparent: true, opacity: 0.55, roughness: 1.0, depthWrite: false,
    color: 0x9a9086,
  }, DECAL_OFF))
  // Porta de aco de enrolar (servico/garagem) -- ripa horizontal
  const shutterMat = stdMat('city:shutter', {
    map: tiled(tex('shutter', 64, (g, s) => {
      g.fillStyle = '#8d9298'; g.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += 6) {
        g.fillStyle = 'rgba(60,64,70,0.55)'; g.fillRect(0, y, s, 2)
        g.fillStyle = 'rgba(210,214,220,0.35)'; g.fillRect(0, y + 3, s, 1)
      }
    }, 1), 1, 5),
    roughness: 0.6, metalness: 0.35,
  })
  const barMat = solid(0x3a3d42, 0.6, 0.5)
  const darkPane = solid(0x14161a, 0.5, 0.3)

  // Saia de sujeira na base do predio (respingo de chuva)
  const baseGrimeMat = stdMat('city:basegrime', Object.assign({
    map: tex('basegrime', 128, (g, s) => {
      const grd = g.createLinearGradient(0, s, 0, 0)
      grd.addColorStop(0, 'rgba(45,42,36,0.8)')
      grd.addColorStop(0.6, 'rgba(55,50,44,0.28)')
      grd.addColorStop(1, 'rgba(60,55,48,0)')
      g.fillStyle = grd; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) {
        const y = s - Math.random() * Math.random() * s
        g.fillStyle = 'rgba(35,32,27,' + (Math.random() * 0.4) + ')'
        g.fillRect(Math.random() * s, y, 1 + Math.random() * 3, 1 + Math.random() * 6)
      }
    }, 1),
    transparent: true, opacity: 0.55, roughness: 1.0, depthWrite: false,
    color: 0x8e857a,
  }, DECAL_OFF))

  FILLERS.forEach((b, bi) => {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, h = b.h
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2

    // lote pavimentado embaixo (a cidade nao pode ser so grama)
    // cada lote num Y levemente diferente: lotes vizinhos se tocam e
    // coplanares dariam z-fighting
    // topo quase rente ao chao: groundY devolve 0 aqui, entao a laje nao pode
    // criar um degrau invisivel na frente dos predios
    // Avental do lote. Lotes vizinhos se SOBREPUNHAM e as duas lajes (a 2 mm
    // uma da outra) piscavam; agora cada retangulo e RECORTADO contra os que
    // ja existem, entao nenhum par divide superficie.
    const lr = clipLotRect(b.x0 - 1.4, b.x1 + 1.4, b.z0 - 1.4, b.z1 + 1.4)
    const lot = slabFromShape(rectShape(lr[0], lr[1], lr[2], lr[3]), 0.06, matWalkDirty)
    lot.position.y = 0.03
    add(lot)

    // corpo
    let baseTex, tile
    if (b.style === 'brick') { baseTex = brickTex(1); tile = 2.4 }
    else if (b.style === 'panel') { baseTex = plasterTex(1); tile = 3.4 }
    else { baseTex = plasterTex(1); tile = 3.2 }
    const bodyMat = stdMat('city:bld:' + bi, {
      map: tiled(baseTex, w / tile, h / tile), color: b.c, roughness: 0.93,
    })
    const body = box(w, h, d, bodyMat, cx, h / 2, cz)
    add(body)

    // embasamento mais escuro (sai pouco da parede pra nao comer a vitrine)
    const plinthMat = solid(new THREE.Color(b.c).multiplyScalar(0.55).getHex(), 0.95)
    add(box(w + 0.24, 1.05, d + 0.24, plinthMat, cx, 0.52, cz))

    // face voltada pra rua (define onde vai a porta e a vitrine do terreo)
    const face = nearestStreetFace(b)

    // --- ritmo dos andares ---------------------------------------------------
    // Terreo (loja) bem mais alto que os andares tipo: so isso ja tira a cara
    // de "caixa com fileiras iguais de janela".
    const GF_H = 4.4
    const floors = Math.max(1, Math.round((h - GF_H - 1.0) / 3.15))
    const floorH = (h - GF_H - 0.6) / floors

    /** Cola um decalque (plano) numa das faces do predio. u = deslocamento
     *  lateral na face, out = quanto afasta da parede. */
    function faceDecal(fk, u, y, wid, hei, mat, out) {
      const f = FACE_DEF[fk]
      const bx = (fk === 'x+') ? b.x1 : (fk === 'x-') ? b.x0 : cx
      const bz = (fk === 'z+') ? b.z1 : (fk === 'z-') ? b.z0 : cz
      const o = out === undefined ? 0.02 : out
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wid, hei), mat)
      m.position.set(bx + f.tx * u + f.nx * o, y, bz + f.tz * u + f.nz * o)
      m.rotation.y = f.ang
      m.castShadow = false; m.receiveShadow = false
      add(m)
      return m
    }

    // saia de encardido na base: respingo de chuva subindo do chao.
    // Vai colada no embasamento (que ja avanca 0.12), entao 0.14 de folga.
    for (const fk of ['z+', 'z-', 'x+', 'x-']) {
      const len = (fk === 'z+' || fk === 'z-') ? w : d
      faceDecal(fk, 0, 0.55, len + 0.2, 1.05, baseGrimeMat, 0.14)
    }

    // tom claro derivado da cor do predio (cornijas, platibanda, vergas)
    const cornMat = solid(new THREE.Color(b.c).multiplyScalar(1.18).getHex(), 0.88)

    // --- terreo das faces de servico -----------------------------------------
    // Sem isso a lateral do predio e uma parede cega de 4.4 m. Aqui entram
    // portas de aco e janelas gradeadas, sempre a frente do embasamento (0.12)
    // e com cada camada num Z proprio.
    for (const fk of ['z+', 'z-', 'x+', 'x-']) {
      if (fk === face) continue
      const f = FACE_DEF[fk]
      const len = (fk === 'z+' || fk === 'z-') ? w : d
      const bx = (fk === 'x+') ? b.x1 : (fk === 'x-') ? b.x0 : cx
      const bz = (fk === 'z+') ? b.z1 : (fk === 'z-') ? b.z0 : cz
      const n = Math.max(1, Math.floor(len / 8))
      for (let k = 0; k < n; k++) {
        const u = -len / 2 + (len / n) * (k + 0.5)
        const at2 = (o, du, y) => {
          const uu = u + (du || 0)
          return [bx + f.tx * uu + f.nx * o, y, bz + f.tz * uu + f.nz * o]
        }
        if (rnd() < 0.5) {
          // porta de aco de enrolar
          const p1 = at2(0.20, 0, 1.45)
          const dm = box(3.0, 2.8, 0.12, shutterMat, p1[0], p1[1], p1[2])
          dm.rotation.y = f.ang
          add(dm)
          const p2 = at2(0.16, 0, 3.0)
          const lin = box(3.34, 0.22, 0.24, cornMat, p2[0], p2[1], p2[2])
          lin.rotation.y = f.ang
          add(lin)
        } else {
          // janela gradeada do terreo
          const p0 = at2(0.13, 0, 2.1)
          const fr = box(1.72, 1.44, 0.10, trimMat, p0[0], p0[1], p0[2])
          fr.rotation.y = f.ang
          add(fr)
          const p1 = at2(0.17, 0, 2.1)
          const pn = box(1.5, 1.22, 0.06, darkPane, p1[0], p1[1], p1[2])
          pn.rotation.y = f.ang
          pn.castShadow = false
          add(pn)
          for (let g3 = 0; g3 < 5; g3++) {
            const du = -0.6 + g3 * 0.3
            const p2 = at2(0.24, du, 2.1)
            const bar = box(0.045, 1.34, 0.045, barMat, p2[0], p2[1], p2[2])
            bar.rotation.y = f.ang
            add(bar)
          }
          const p3 = at2(0.24, 0, 2.1)
          const cross = box(1.4, 0.045, 0.045, barMat, p3[0], p3[1], p3[2])
          cross.rotation.y = f.ang
          add(cross)
        }
      }
    }

    // --- cintas horizontais: uma cornija fina em cada laje -------------------
    // cinta grossa separando o terreo dos andares tipo
    {
      const bg = bandGeo(w + 0.42, d + 0.42, 0.34)
      const m = new THREE.Mesh(bg, cornMat)
      m.position.set(cx, GF_H - 0.17, cz)
      m.castShadow = true; m.receiveShadow = true
      add(m)
    }
    // cornija fina entre os andares (protusao 0.09 < 0.18 da moldura da janela)
    const thinBand = bandGeo(w + 0.18, d + 0.18, 0.13)
    for (let f = 1; f < floors; f++) {
      const m = new THREE.Mesh(thinBand, f % 2 || b.style !== 'brick' ? cornMat : trimMat)
      m.position.set(cx, GF_H + f * floorH - 0.07, cz)
      m.castShadow = true; m.receiveShadow = true
      add(m)
    }

    // --- coroamento: cornija -> laje de cobertura -> platibanda --------------
    add(box(w + 0.7, 0.24, d + 0.7, cornMat, cx, h - 0.02, cz))
    const ROOF_Y = h + 0.20                       // topo da laje de cobertura
    const deckMat = stdMat('city:roofdeck', {
      map: tiled(asphaltTex(1), 8, 8), color: 0x8b8478, roughness: 0.99,
    })
    add(box(w + 0.42, 0.2, d + 0.42, deckMat, cx, ROOF_Y - 0.1, cz))
    // Platibanda com espessura de verdade. As 4 barras se ENCOSTAM em vez de
    // sobrepor: duas barras iguais no mesmo Y davam z-fight nas quinas.
    const pw = 0.32, ph = 0.95, py = ROOF_Y - 0.06 + ph / 2
    const pOut = 0.28
    const px0 = b.x0 - pOut, px1 = b.x1 + pOut
    const pz0 = b.z0 - pOut, pz1 = b.z1 + pOut
    function parapetBar(ax0, ax1, az0, az1) {
      add(box(ax1 - ax0, ph, az1 - az0, cornMat, (ax0 + ax1) / 2, py, (az0 + az1) / 2))
      // rebordo (coping) mais claro em cima
      add(box(ax1 - ax0 + 0.1, 0.1, az1 - az0 + 0.1, trimMat,
        (ax0 + ax1) / 2, py + ph / 2 + 0.04, (az0 + az1) / 2))
    }
    parapetBar(px0, px1, pz0, pz0 + pw)
    parapetBar(px0, px1, pz1 - pw, pz1)
    parapetBar(px0, px0 + pw, pz0 + pw, pz1 - pw)
    parapetBar(px1 - pw, px1, pz0 + pw, pz1 - pw)

    // --- coisas do telhado ---------------------------------------------------
    // casa de maquinas / caixa d'agua / antena variam de predio pra predio
    const stW = 3.0 + rnd() * 1.2, stD = 2.6 + rnd() * 1.0
    const stX = cx + (rnd() - 0.5) * (w - stW - 2.5)
    const stZ = cz + (rnd() - 0.5) * (d - stD - 2.5)
    const stH = 2.2 + rnd() * 1.0
    add(box(stW, stH, stD, cornMat, stX, ROOF_Y + stH / 2 - 0.06, stZ))
    add(box(stW + 0.3, 0.18, stD + 0.3, solid(0x44423d, 0.95), stX, ROOF_Y + stH + 0.03, stZ))
    // porta da casa de maquinas
    add(box(0.9, 1.9, 0.08, solid(0x6b5a44, 0.8), stX, ROOF_Y + 0.95, stZ + stD / 2 + 0.05))
    // duto de exaustao saindo da casa de maquinas
    const duct = cyl(0.24, 0.24, 0.9, solid(0x7d8288, 0.6, 0.5), 12)
    duct.position.set(stX + stW * 0.3, ROOF_Y + stH + 0.5, stZ - stD * 0.25)
    add(duct)
    const ductCap = cyl(0.34, 0.2, 0.18, solid(0x6b7076, 0.6, 0.5), 12)
    ductCap.position.set(stX + stW * 0.3, ROOF_Y + stH + 1.02, stZ - stD * 0.25)
    add(ductCap)

    const tX = cx - (stX - cx) * 0.8, tZ = cz - (stZ - cz) * 0.8
    const roofKind = rnd()
    if (roofKind > 0.58) {
      // caixa d'agua sobre pes (tom varia por predio)
      const tankHue = [0x2f6fa8, 0x3c7f5a, 0x9a6b3f, 0x8c8f93][bi % 4]
      const tankDark = new THREE.Color(tankHue).multiplyScalar(0.78).getHex()
      const legMat = solid(0x6d6a64, 0.7, 0.4)
      const legGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(legGeo, legMat)
        l.position.set(tX + sx * 0.8, ROOF_Y + 0.7, tZ + sz * 0.8)
        l.castShadow = true; l.receiveShadow = true
        add(l)
      }
      const tank = cyl(1.1, 1.1, 1.5, solid(tankHue, 0.7), 14)
      tank.position.set(tX, ROOF_Y + 2.2, tZ)
      add(tank)
      const lid = cyl(1.18, 1.18, 0.16, solid(tankDark, 0.7), 14)
      lid.position.set(tX, ROOF_Y + 3.0, tZ)
      add(lid)
      const knob = cyl(0.22, 0.22, 0.22, solid(tankDark, 0.7), 10)
      knob.position.set(tX, ROOF_Y + 3.17, tZ)
      add(knob)
      // cano descendo do tanque ate a laje
      const dp = cyl(0.06, 0.06, 1.45, pipeMat, 8)
      dp.position.set(tX + 1.0, ROOF_Y + 0.72, tZ + 0.3)
      add(dp)
    } else if (roofKind > 0.3) {
      // antena de TV
      const mast = cyl(0.05, 0.07, 4.2, solid(PALETTE.metal, 0.5, 0.7), 8)
      mast.position.set(tX, ROOF_Y + 2.1, tZ)
      add(mast)
      const armGeo = new THREE.BoxGeometry(1.7, 0.05, 0.05)
      for (let i = 0; i < 4; i++) {
        const a = new THREE.Mesh(armGeo, solid(PALETTE.metal, 0.5, 0.7))
        a.position.set(tX, ROOF_Y + 2.4 + i * 0.55, tZ)
        a.scale.x = 1 - i * 0.16
        a.castShadow = true
        add(a)
      }
      const blink = box(0.16, 0.16, 0.16, emissive(0xff3b3b, 2.2), tX, ROOF_Y + 4.25, tZ)
      blink.castShadow = false
      add(blink)
    } else {
      // chamine de tijolo + parabolicas
      add(box(1.0, 2.6, 1.0, solid(0x8a5b46, 0.95), tX, ROOF_Y + 1.3, tZ))
      add(box(1.2, 0.18, 1.2, solid(0x4d4a45, 0.9), tX, ROOF_Y + 2.68, tZ))
      for (let i = 0; i < 2; i++) {
        const dish = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, 6.283, 0, 1.0),
          solid(0xd8d5cd, 0.7))
        dish.rotation.set(-0.9, i * 1.4, 0)
        dish.position.set(tX + 1.3 + i * 0.9, ROOF_Y + 0.5, tZ + 1.2)
        dish.castShadow = true; dish.receiveShadow = true
        add(dish)
      }
    }

    // grades de exaustao / condensadores espalhados na laje
    for (let i = 0; i < 2; i++) {
      const uw = 0.9 + rnd() * 0.7
      const ux = cx + (rnd() - 0.5) * (w - 4)
      const uz = cz + (rnd() - 0.5) * (d - 4)
      add(box(uw, 0.55, uw * 0.8, solid(0x9aa0a6, 0.6, 0.4), ux, ROOF_Y + 0.28, uz))
      add(box(uw * 0.7, 0.06, uw * 0.55, solid(0x6e7378, 0.5, 0.6), ux, ROOF_Y + 0.58, uz))
    }

    // --- canos de descida nas quinas da fachada ------------------------------
    const pipeH = h - 0.2
    for (const s of [-1, 1]) {
      const off = 0.16
      const qx = (face === 'x+') ? b.x1 + off : (face === 'x-') ? b.x0 - off
        : cx + s * (w / 2 - 0.35)
      const qz = (face === 'z+') ? b.z1 + off : (face === 'z-') ? b.z0 - off
        : cz + s * (d / 2 - 0.35)
      const fx = (face === 'x+' || face === 'x-') ? cz + s * (d / 2 - 0.35) : qz
      const px2 = (face === 'x+' || face === 'x-') ? qx : cx + s * (w / 2 - 0.35)
      const pz2 = (face === 'x+' || face === 'x-') ? fx : qz
      const pipe = cyl(0.075, 0.075, pipeH, pipeMat, 8)
      pipe.position.set(px2, pipeH / 2 + 0.1, pz2)
      add(pipe)
      // bracadeiras
      for (let k = 1; k < 4; k++) {
        add(box(0.2, 0.06, 0.2, pipeMat, px2, (pipeH / 4) * k, pz2))
      }
      // curva final jogando na calcada
      const elbow = cyl(0.075, 0.075, 0.4, pipeMat, 8)
      elbow.rotation.x = Math.PI / 2
      elbow.position.set(px2, 0.16, pz2 + 0.18)
      add(elbow)
    }

    // --- sacadas com guarda-corpo (alguns predios) ---------------------------
    const fdSt = FACE_DEF[face]
    const bxF = (face === 'x+') ? b.x1 : (face === 'x-') ? b.x0 : cx
    const bzF = (face === 'z+') ? b.z1 : (face === 'z-') ? b.z0 : cz
    const faceSpan = (face === 'z+' || face === 'z-') ? w : d
    if (bi % 3 === 0 && floors >= 2) {
      const balW = Math.min(faceSpan - 2.4, 6.5)
      const balD = 1.05
      for (let f = 1; f < floors; f++) {
        const by = GF_H + f * floorH + 0.06
        const g2 = new THREE.Group()
        g2.position.set(bxF + fdSt.nx * 0.02, by, bzF + fdSt.nz * 0.02)
        g2.rotation.y = fdSt.ang
        // laje da sacada
        g2.add(box(balW, 0.16, balD, cornMat, 0, 0.08, balD / 2))
        g2.add(box(balW + 0.08, 0.06, balD + 0.06, trimMat, 0, 0.19, balD / 2))
        // guarda-corpo: 2 travessas + balaustres
        const railY = 1.02
        g2.add(box(balW, 0.07, 0.07, railMat, 0, railY, balD - 0.06))
        g2.add(box(balW, 0.05, 0.05, railMat, 0, railY * 0.5, balD - 0.06))
        for (const sg of [-1, 1]) {
          g2.add(box(0.07, railY, 0.07, railMat, sg * (balW / 2 - 0.04), railY / 2, balD - 0.06))
          g2.add(box(0.06, railY, 0.06, railMat, sg * (balW / 2 - 0.04), railY / 2, 0.1))
          g2.add(box(0.06, 0.06, balD - 0.2, railMat, sg * (balW / 2 - 0.04), railY, balD / 2 + 0.02))
        }
        const nB = Math.max(6, Math.round(balW / 0.34))
        for (let k = 1; k < nB; k++) {
          g2.add(box(0.035, railY - 0.08, 0.035, railMat,
            -balW / 2 + (balW / nB) * k, (railY - 0.08) / 2, balD - 0.06))
        }
        add(g2)
      }
    }

    // --- escada de incendio em zigue-zague (1 ou 2 predios) ------------------
    if (bi === 1 || bi === 6) {
      // vai numa face LATERAL (nao na da rua), do 1o andar ate a platibanda
      const sideKey = (face === 'z+' || face === 'z-') ? 'x+' : 'z+'
      const fs = FACE_DEF[sideKey]
      const sbx = (sideKey === 'x+') ? b.x1 : cx
      const sbz = (sideKey === 'z+') ? b.z1 : cz
      const g2 = new THREE.Group()
      g2.position.set(sbx + fs.nx * 0.05, 0, sbz + fs.nz * 0.05)
      g2.rotation.y = fs.ang
      const uOff = ((sideKey === 'x+') ? d : w) * 0.28
      const PLAT_W = 3.2, PLAT_D = 1.15
      const STAIR_Z = PLAT_D * 0.52
      for (let f = 1; f <= floors; f++) {
        const y = GF_H + f * floorH - 0.15
        // patamar de grade
        g2.add(box(PLAT_W, 0.08, PLAT_D, escapeMat, uOff, y, PLAT_D / 2))
        // guarda-corpo do patamar
        g2.add(box(PLAT_W, 0.05, 0.05, escapeMat, uOff, y + 0.95, PLAT_D - 0.05))
        g2.add(box(PLAT_W, 0.05, 0.05, escapeMat, uOff, y + 0.5, PLAT_D - 0.05))
        for (let k = 0; k <= 6; k++) {
          g2.add(box(0.04, 0.95, 0.04, escapeMat,
            uOff - PLAT_W / 2 + (PLAT_W / 6) * k, y + 0.48, PLAT_D - 0.05))
        }
        // suportes presos na parede
        for (const sgn of [-1, 1]) {
          g2.add(box(0.06, 0.06, PLAT_D, escapeMat, uOff + sgn * (PLAT_W / 2 - 0.1), y - 0.1, PLAT_D / 2))
        }
        // lance inclinado ligando ao patamar de baixo, alternando o lado
        if (f > 1) {
          const dir = f % 2 ? 1 : -1
          const run = PLAT_W * 0.8
          const rise = floorH
          const len = Math.hypot(run, rise)
          const ang = Math.atan2(rise, dir * run)
          const lance = box(len, 0.06, 0.85, escapeMat, uOff, y - rise / 2, STAIR_Z)
          lance.rotation.z = ang
          g2.add(lance)
          // corrimao acompanhando o lance
          const hand = box(len, 0.045, 0.045, escapeMat, uOff, y - rise / 2 + 0.9, STAIR_Z + 0.36)
          hand.rotation.z = ang
          g2.add(hand)
          // degraus distribuidos ao longo do lance
          const nStep = 8
          for (let k = 1; k < nStep; k++) {
            const t2 = k / nStep - 0.5
            g2.add(box(0.78, 0.035, 0.17, escapeMat,
              uOff + dir * run * t2, y - rise / 2 + rise * t2 + 0.05, STAIR_Z))
          }
        }
      }
      // ultimo lance retratil pendurado sobre a calcada
      const dropY = GF_H + floorH - 0.15
      const drop = box(0.85, 0.06, 2.4, escapeMat, uOff - PLAT_W * 0.32, dropY - 1.4, STAIR_Z)
      drop.rotation.x = 0.45
      g2.add(drop)
      add(g2)
    }

    // ares-condicionados na fachada (tamanhos e alturas variados)
    for (let i = 0; i < 4; i++) {
      if (typeof Props.makeAC !== 'function') break
      if (rnd() > 0.72) continue
      const ac = Props.makeAC()
      // LOD: sao dezenas, la em cima e longe. Sem update eles entram no forno
      // (senao seriam ~20 grupos soltos e centenas de draw calls).
      ac.userData.update = null
      const fdef = FACE_DEF[rnd() > 0.5 ? 'z+' : 'x+']
      const pxA = fdef.nx > 0 ? b.x1 + 0.1 : cx + (rnd() - 0.5) * (w - 4)
      const pzA = fdef.nz > 0 ? b.z1 + 0.1 : cz + (rnd() - 0.5) * (d - 4)
      ac.position.set(pxA, GF_H + Math.floor(rnd() * floors) * floorH + 1.1, pzA)
      ac.rotation.y = fdef.ang
      ac.scale.setScalar(0.82 + rnd() * 0.5)
      add(ac); harvest(ac, true)
      // mancha de agua condensada escorrendo embaixo do aparelho
      const fkA = fdef.nx > 0 ? 'x+' : 'z+'
      const uA = fdef.nx > 0 ? -(pzA - cz) : (pxA - cx)
      faceDecal(fkA, uA, ac.position.y - 1.35, 0.6, 2.2, dirtStreakMat, 0.03)
    }

    // --- letreiro proprio na fachada (alguns predios) ------------------------
    const SHOP_NAMES = ['LAVANDERIA', 'FARMACIA SAO JORGE', 'PADARIA SOL',
      'BAR DO TITO', 'ELETRO SHOP', 'HOTEL AURORA', 'SAPATARIA']
    if (bi % 2 === 1) {
      const nm = SHOP_NAMES[bi % SHOP_NAMES.length]
      const sw2 = Math.min(faceSpan - 3.0, 7.4)
      const sh2 = 0.75
      const sCol = [0xd63b3b, 0x2f9e57, 0x3b6fd6, 0xe8a33d][bi % 4]
      const sg = new THREE.Group()
      // logo acima da marquise e ABAIXO da primeira fileira de janelas
      sg.position.set(bxF + fdSt.nx * 0.2, GF_H - 0.18, bzF + fdSt.nz * 0.2)
      sg.rotation.y = fdSt.ang
      sg.add(box(sw2, sh2, 0.28, solid(0x232227, 0.85), 0, 0, 0))
      const eg = emissive(sCol, 2.0)
      const eA = box(sw2 + 0.08, 0.07, 0.32, eg, 0, sh2 / 2 + 0.06, 0)
      const eB = box(sw2 + 0.08, 0.07, 0.32, eg, 0, -sh2 / 2 - 0.06, 0)
      eA.castShadow = false; eB.castShadow = false
      sg.add(eA, eB)
      const hx = '#' + new THREE.Color(sCol).getHexString()
      const cv = canvasFor(sw2 - 0.3, sh2 - 0.16, 1024)
      const fpx = fitFontPx(nm, cv.w * 0.9, Math.floor(cv.h * 0.7))
      const tm = textPlaneMat(nm, {
        w: cv.w, h: cv.h, color: '#fdf7ea',
        font: 'bold ' + fpx + 'px "Trebuchet MS", sans-serif',
        glow: hx, stroke: hx, emissiveIntensity: 1.3,
      })
      const tp = new THREE.Mesh(new THREE.PlaneGeometry(sw2 - 0.3, sh2 - 0.16), tm)
      tp.position.set(0, 0, 0.16)
      sg.add(tp)
      add(sg)
    }

    // marquise corrida sobre o terreo (sombra na vitrine, leitura de rua)
    const hasCanopy = bi % 3 !== 1
    if (hasCanopy) {
      const mg = new THREE.Group()
      mg.position.set(bxF + fdSt.nx * 0.02, GF_H - 0.75, bzF + fdSt.nz * 0.02)
      mg.rotation.y = fdSt.ang
      const mw = faceSpan - 0.6
      mg.add(box(mw, 0.16, 1.35, solid(0x3d3f44, 0.75, 0.25), 0, 0, 0.66))
      mg.add(box(mw, 0.1, 0.1, cornMat, 0, -0.1, 1.28))
      for (const s of [-1, 0.5]) {
        const tie = cyl(0.03, 0.03, 1.5, pipeMat, 6)
        tie.rotation.x = -0.85
        tie.position.set(s * (mw / 2 - 1.2), 0.5, 0.66)
        mg.add(tie)
      }
      add(mg)
    }

    // --- janelas ------------------------------------------------------------
    // Cada janela vira 4-5 instancias, uma por CAMADA, e cada camada mora numa
    // faixa de Z propria (WIN_*_Z). Antes a face da moldura e a do vidro caiam
    // no mesmo plano e a fachada inteira piscava preto/branco ao andar.
    const faces = ['z+', 'z-', 'x+', 'x-']
    for (const fk of faces) {
      const f = FACE_DEF[fk]
      const faceW = (fk === 'z+' || fk === 'z-') ? w : d
      const px0 = (fk === 'z+') ? b.z1 : (fk === 'z-') ? b.z0 : 0
      const cols = Math.max(2, Math.floor(faceW / 3.1))
      const sp = faceW / cols
      for (let ci = 0; ci < cols; ci++) {
        const u = -faceW / 2 + sp * (ci + 0.5)
        for (let fi = 0; fi < floors; fi++) {
          const y = GF_H + fi * floorH + floorH * 0.52
          if (y + 1.05 > h - 0.35) continue
          const bx = (fk === 'x+') ? b.x1 : (fk === 'x-') ? b.x0 : cx
          const bz = (fk === 'z+' || fk === 'z-') ? px0 : cz
          // helper: ponto na face deslocado 'o' pra fora da parede
          const at = (o) => ({
            x: bx + f.tx * u + f.nx * o, y, z: bz + f.tz * u + f.nz * o, ry: f.ang,
          })
          winFrames.push(at(WIN_FRAME_Z))
          const gl = at(WIN_GLASS_Z)
          const bk = at(WIN_BACK_Z)
          const r = rnd()
          if (r < 0.13) { winWarm.push(gl); winCurtain.push(bk) }
          else if (r < 0.18) { winCool.push(gl); winBack.push(bk) }
          else {
            winGlass[Math.floor(rnd() * 3)].push(gl)
            const rb = rnd()
            if (rb < 0.28) winBlind.push(bk)
            else if (rb < 0.42) winCurtain.push(bk)
            else winBack.push(bk)
          }
          // peitoril: fica ABAIXO da moldura, com 2 cm de folga em Y
          const sl = at(WIN_SILL_Z)
          sl.y = y - 1.08
          winSills.push(sl)
          // escorrido de sujeira embaixo do peitoril (so em parte deles)
          if (rnd() < 0.42) {
            const st = at(0.012)
            st.y = y - 1.9
            winStreaks.push(st)
          }
        }
      }
    }

    // --- porta de rua + vitrines no terreo na face voltada pra rua ----------
    const fd = FACE_DEF[face]
    const doorG = new THREE.Group()
    const OUT = 0.14   // afasta o conjunto da parede pra passar do embasamento
    const dxp = (face === 'x+') ? b.x1 : (face === 'x-') ? b.x0 : cx
    const dzp = (face === 'z+') ? b.z1 : (face === 'z-') ? b.z0 : cz
    doorG.position.set(dxp + fd.nx * OUT, 0, dzp + fd.nz * OUT)
    doorG.rotation.y = fd.ang
    const faceLen = (face === 'z+' || face === 'z-') ? w : d

    // painel escuro do vao + folhas + moldura
    doorG.add(box(2.5, 3.1, 0.08, solid(0x241f1a, 0.95), 0, 1.55, 0))
    const leafA = box(1.05, 2.5, 0.1, doorWood, -0.55, 1.28, 0.08)
    const leafB = box(1.05, 2.5, 0.1, doorWood, 0.55, 1.28, 0.08)
    doorG.add(leafA, leafB)
    doorG.add(box(0.09, 0.09, 0.1, solid(PALETTE.chrome, 0.3, 0.9), -0.12, 1.15, 0.18))
    doorG.add(box(0.09, 0.09, 0.1, solid(PALETTE.chrome, 0.3, 0.9), 0.12, 1.15, 0.18))
    doorG.add(box(2.9, 0.22, 0.2, trimMat, 0, 3.2, 0.08))
    doorG.add(box(0.22, 3.2, 0.2, trimMat, -1.42, 1.6, 0.08))
    doorG.add(box(0.22, 3.2, 0.2, trimMat, 1.42, 1.6, 0.08))
    // degrau
    doorG.add(box(3.2, 0.16, 0.9, matWalk, 0, 0.08, 0.5))
    // marquise so quando o predio NAO tem a marquise corrida (senao as duas
    // lajes se atravessam)
    if (!hasCanopy) doorG.add(box(3.6, 0.14, 1.15, solid(0x3a3a3f, 0.7, 0.3), 0, 3.55, 0.5))
    const lamp = box(0.5, 0.16, 0.3, emissive(0xffd9a0, 2.0), 0, 3.4, 0.4)
    lamp.castShadow = false
    doorG.add(lamp)
    // numero do predio
    const numMat = textPlaneMat(String(100 + bi * 17), {
      w: 256, h: 256, color: '#e9e4d6',
      font: 'bold 150px "Trebuchet MS", sans-serif', emissiveIntensity: 0.5,
    })
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), numMat)
    num.position.set(1.05, 3.05, 0.22)
    doorG.add(num)

    // vitrines do terreo dos dois lados da porta
    const shopMat = glass(0xcfe8f4, 0.2)
    const avail = faceLen / 2 - 1.9
    if (avail >= 2.6) {
      const sw = Math.min(6.0, avail - 0.5)
      const nM = Math.max(1, Math.round(sw / 2.0) - 1)
      // Camadas em Z (local do doorG, que ja esta 0.14 fora da parede):
      // fundo aceso -> silhuetas -> vidro -> montantes. Todas com >= 1.5 cm
      // de folga, e o fundo passa na frente do embasamento (que sai 0.12).
      const silMat = solid(0x2a2723, 0.92)
      for (const side of [-1, 1]) {
        const scx = side * (1.9 + sw / 2 + 0.3)
        const inner = box(sw - 0.2, 1.9, 0.04, shopGlow, scx, 1.75, 0.015)
        inner.castShadow = false
        doorG.add(inner)
        // balcao + prateleiras + mercadoria: silhueta contra o fundo aceso
        const cnt = box(sw - 0.5, 0.62, 0.05, silMat, scx, 1.1, 0.075)
        cnt.castShadow = false
        doorG.add(cnt)
        for (const shY of [1.72, 2.24]) {
          const sh = box(sw - 0.55, 0.06, 0.05, silMat, scx, shY, 0.075)
          sh.castShadow = false
          doorG.add(sh)
          const nBox = Math.max(3, Math.round((sw - 0.55) / 0.55))
          for (let k = 0; k < nBox; k++) {
            if (rnd() < 0.18) continue
            const bw2 = 0.14 + rnd() * 0.22
            const bh2 = 0.16 + rnd() * 0.26
            const si = box(bw2, bh2, 0.05, silMat,
              scx - (sw - 0.55) / 2 + ((sw - 0.55) / nBox) * (k + 0.5), shY + 0.03 + bh2 / 2, 0.075)
            si.castShadow = false
            doorG.add(si)
          }
        }
        const pane = box(sw, 2.0, 0.05, shopMat, scx, 1.75, 0.14)
        pane.castShadow = false
        doorG.add(pane)
        doorG.add(box(sw + 0.3, 0.2, 0.22, trimMat, scx, 2.85, 0.12))
        doorG.add(box(sw + 0.3, 0.75, 0.24, plinthMat, scx, 0.38, 0.12))
        // divisorias da vitrine
        for (let mI = 1; mI <= nM; mI++) {
          doorG.add(box(0.09, 2.0, 0.1, trimMat, scx - sw / 2 + (sw / (nM + 1)) * mI, 1.75, 0.185))
        }
      }
    }
    add(doorG)

    // colisor AABB do predio (usa o embasamento)
    col(b.x0 - 0.12, b.x1 + 0.12, b.z0 - 0.12, b.z1 + 0.12, 'building')
  })

  // --- monta as InstancedMesh das janelas ----------------------------------
  function instances(geo, mat, list, shadows) {
    if (!list.length) return
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    for (let i = 0; i < list.length; i++) {
      const t = list[i]
      dummy.position.set(t.x, t.y, t.z)
      dummy.rotation.set(0, t.ry, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    }
    im.instanceMatrix.needsUpdate = true
    im.castShadow = !!shadows
    im.receiveShadow = true
    addLive(im)
  }

  /**
   * Moldura VAZADA (4 barras fundidas numa geometria so). O vidro fica no vao,
   * recuado 5.5 cm: nenhuma face da moldura e do vidro divide o mesmo plano,
   * que era exatamente a causa do chapisco preto/branco nas fachadas.
   */
  function frameRingGeo(inW, inH, bar, thick) {
    const ow = inW + bar * 2, oh = inH + bar * 2
    const parts = []
    const mk = (bw, bh, bx, by) => {
      const g = new THREE.BoxGeometry(bw, bh, thick)
      g.translate(bx, by, 0)
      return g
    }
    parts.push(mk(ow, bar, 0, (inH + bar) / 2))     // travessa de cima
    parts.push(mk(ow, bar, 0, -(inH + bar) / 2))    // travessa de baixo
    parts.push(mk(bar, inH, -(inW + bar) / 2, 0))   // montante esquerdo
    parts.push(mk(bar, inH, (inW + bar) / 2, 0))    // montante direito
    // caixilho central (divide a folha em duas)
    parts.push(mk(0.06, inH, 0, 0))
    const merged = mergeGeos(parts)
    for (const p of parts) p.dispose()
    return merged
  }

  const FRAME_BAR = 0.13
  const frameGeo = frameRingGeo(WIN_W - 0.02, WIN_H - 0.02, FRAME_BAR, 0.07)
  const glassGeo = new THREE.BoxGeometry(WIN_W, WIN_H, 0.03)
  const backGeo = new THREE.BoxGeometry(WIN_W + 0.04, WIN_H + 0.04, 0.02)
  const sillGeo = new THREE.BoxGeometry(WIN_W + 0.44, 0.14, 0.30)
  const streakGeo = new THREE.PlaneGeometry(WIN_W * 0.8, 1.9)

  // vidros: 3 tons de "apagado" com reflexo diferente (roughness/metalness),
  // mais os dois acesos. A variacao quebra a parede de janelas iguais.
  const glassMats = [
    stdMat('city:glassA', {
      color: 0x1d2734, roughness: 0.08, metalness: 0.72,
      emissive: 0x0a1520, emissiveIntensity: 0.4,
    }),
    stdMat('city:glassB', {
      color: 0x27343a, roughness: 0.18, metalness: 0.5,
      emissive: 0x0d1a1c, emissiveIntensity: 0.3,
    }),
    stdMat('city:glassC', {
      color: 0x2b3340, roughness: 0.04, metalness: 0.85,
      emissive: 0x101a26, emissiveIntensity: 0.45,
    }),
  ]
  // persiana horizontal: textura de listras finas
  const blindMat = stdMat('city:blind', {
    map: tex('blind', 64, (g, s) => {
      g.fillStyle = '#cfc7b4'; g.fillRect(0, 0, s, s)
      g.fillStyle = 'rgba(90,84,74,0.5)'
      for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 2)
    }, 1),
    roughness: 0.85,
  })
  const curtainMat = solid(0xe8e2d4, 0.95)
  const roomMat = solid(0x14161c, 0.98)

  instances(frameGeo, solid(0xe4ded0, 0.86), winFrames, false)
  instances(backGeo, roomMat, winBack, false)
  instances(backGeo, blindMat, winBlind, false)
  instances(backGeo, curtainMat, winCurtain, false)
  for (let i = 0; i < glassMats.length; i++) instances(glassGeo, glassMats[i], winGlass[i], false)
  instances(glassGeo, emissive(0xffcf8a, 1.9), winWarm, false)
  instances(glassGeo, emissive(0x9ec9ff, 1.5), winCool, false)
  instances(sillGeo, solid(0xcfc9ba, 0.9), winSills, true)
  instances(streakGeo, dirtStreakMat, winStreaks, false)

  // -------------------------------------------------------------------------
  // 5. FACHADAS (casca externa) DA BARBEARIA E DA MERCEARIA
  // -------------------------------------------------------------------------
  function buildShell(b, opts) {
    const T = WALL_T
    const H = b.wallHeight
    const w = b.x1 - b.x0, d = b.z1 - b.z0
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
    const dL = b.door.center - b.door.width / 2
    const dR = b.door.center + b.door.width / 2
    const dh = b.door.height
    const gRoot = new THREE.Group()
    gRoot.name = b.id + '-shell'

    // Piso da loja: apenas uma MOLDURA em volta do lote (4 tiras que passam por
    // baixo das paredes). O miolo fica livre pro piso que barbershop.js /
    // grocery.js constroem -- duas lajes no mesmo Y brigariam por z-fighting.
    // Topo em LEVELS.SHOP_FLOOR, nivelado com a calcada da frente.
    function padStrip(px0, px1, pz0, pz1) {
      const s = slabFromShape(rectShape(px0, px1, pz0, pz1), SHOP_Y, matWalkDirty)
      s.castShadow = false
      gRoot.add(s)
    }
    padStrip(b.x0 - SHOP_PAD, b.x0 + T, b.z0 - SHOP_PAD, b.z1)   // lateral oeste
    padStrip(b.x1 - T, b.x1 + SHOP_PAD, b.z0 - SHOP_PAD, b.z1)   // lateral leste
    padStrip(b.x0 + T, b.x1 - T, b.z0 - SHOP_PAD, b.z0 + T)      // fundos
    padStrip(b.x0 + T, b.x1 - T, b.z1 - T, b.z1)                 // sob a fachada

    const sideColor = new THREE.Color(opts.wallColor).multiplyScalar(0.94).getHex()
    const baseMat = solid(new THREE.Color(opts.wallColor).multiplyScalar(0.42).getHex(), 0.95)

    // material por segmento: mantem o tamanho do tijolo igual em pilares e panos
    function wallMatFor(wid, hei, side) {
      const rx = Math.max(0.25, wid / 2.6), ry = Math.max(0.25, hei / 2.6)
      return stdMat('city:shellw:' + b.id + ':' + rx.toFixed(2) + ':' + ry.toFixed(2) + ':' + (side ? 1 : 0), {
        map: tiled(opts.tex, rx, ry),
        color: side ? sideColor : opts.wallColor,
        roughness: 0.93,
      })
    }

    function wall(x0, x1, y0, y1, z0, z1, mat) {
      const wid = Math.max(x1 - x0, z1 - z0)
      const m = mat || wallMatFor(wid, y1 - y0, (z1 - z0) > (x1 - x0))
      gRoot.add(box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    }

    // laterais e fundo (inteiras)
    wall(b.x0, b.x0 + T, 0, H, b.z0, b.z1, null)
    wall(b.x1 - T, b.x1, 0, H, b.z0, b.z1, null)
    wall(b.x0, b.x1, 0, H, b.z0, b.z0 + T, null)
    col(b.x0, b.x0 + T, b.z0, b.z1, 'shop')
    col(b.x1 - T, b.x1, b.z0, b.z1, 'shop')
    col(b.x0, b.x1, b.z0, b.z0 + T, 'shop')

    // --- fachada (z = z1) com vao da porta e vitrines -----------------------
    const fz0 = b.z1 - T, fz1 = b.z1
    // reserva a faixa de cima pro letreiro: vitrine -> toldo -> letreiro
    const vitTop = H - 1.05
    const vitBot = 0.85
    const vits = []
    const leftSpan = (dL - 0.55) - (b.x0 + 0.7)
    if (leftSpan > 2.6) vits.push([b.x0 + 0.7, dL - 0.55])
    const rightSpan = (b.x1 - 0.7) - (dR + 0.55)
    if (rightSpan > 2.6) vits.push([dR + 0.55, b.x1 - 0.7])

    // pilares cheios entre os vaos (vitrines + porta)
    const solidSpans = []
    let cursor = b.x0
    const holes = vits.map(v => v.slice()).concat([[dL, dR]]).sort((a, c) => a[0] - c[0])
    for (const hSpan of holes) {
      if (hSpan[0] > cursor + 0.01) solidSpans.push([cursor, hSpan[0]])
      cursor = Math.max(cursor, hSpan[1])
    }
    if (cursor < b.x1 - 0.01) solidSpans.push([cursor, b.x1])
    for (const s of solidSpans) wall(s[0], s[1], 0, H, fz0, fz1, null)
    // peitoril e bandeira das vitrines
    for (const v of vits) {
      wall(v[0], v[1], 0, vitBot, fz0, fz1, baseMat)
      wall(v[0], v[1], vitTop, H, fz0, fz1, null)
    }
    // verga acima da porta (o vao fica livre embaixo)
    wall(dL, dR, dh, H, fz0, fz1, null)

    // colisores da fachada: dois segmentos, vao da porta livre
    col(b.x0, dL, fz0, fz1, 'shop')
    col(dR, b.x1, fz0, fz1, 'shop')

    // Vidro de verdade: o interior da loja tem que ser visivel da calcada.
    // Quase transparente, tom azulado frio, sem depthWrite (helper glass()).
    const vitGlass = glass(0xcbe6f4, 0.14)
    for (const v of vits) {
      const vw = v[1] - v[0], vh = vitTop - vitBot, vcx = (v[0] + v[1]) / 2
      const gpane = box(vw - 0.12, vh - 0.12, 0.04, vitGlass, vcx, (vitBot + vitTop) / 2, fz0 + T / 2)
      gpane.castShadow = false
      gRoot.add(gpane)
      // luminaria da vitrine: barra fina no alto, DENTRO da loja (da vida a
      // noite sem virar um painel leitoso na frente do vidro)
      const glow = box(vw - 0.6, 0.09, 0.07, emissive(opts.glowColor, 1.8),
        vcx, vitTop - 0.16, fz0 - 0.1)
      glow.castShadow = false
      gRoot.add(glow)
      // moldura
      gRoot.add(box(vw + 0.2, 0.16, 0.16, trimMat, vcx, vitTop + 0.05, fz1 + 0.03))
      gRoot.add(box(vw + 0.2, 0.2, 0.28, trimMat, vcx, vitBot - 0.02, fz1 + 0.06))
      const nM = Math.max(1, Math.round(vw / 1.9) - 1)
      for (let i = 1; i <= nM; i++) {
        gRoot.add(box(0.1, vh, 0.14, trimMat, v[0] + (vw / (nM + 1)) * i, (vitBot + vitTop) / 2, fz1 + 0.01))
      }
      // toldo listrado sobre a vitrine
      gRoot.add(makeAwning(vw + 0.5, 1.15, opts.awnA, opts.awnB, vcx, vitTop + 0.05, fz1 + 0.02))
    }

    // moldura da porta + soleira. Calcada, avental e piso interno estao todos
    // em LEVELS.SHOP_FLOOR: a soleira e a pedra que costura os tres (sem
    // degrau, o vao fica acessivel), e o degrauzinho de rua fica na rampa.
    gRoot.add(box(b.door.width + 0.5, 0.24, 0.3, trimMat, b.door.center, dh + 0.1, fz1 + 0.06))
    gRoot.add(box(0.25, dh + 0.2, 0.3, trimMat, dL - 0.12, (dh + 0.2) / 2, fz1 + 0.06))
    gRoot.add(box(0.25, dh + 0.2, 0.3, trimMat, dR + 0.12, (dh + 0.2) / 2, fz1 + 0.06))
    // 8 mm acima do piso: marca a entrada e evita topo coplanar com o avental
    const sillH = SHOP_Y + 0.008
    const sill = box(b.door.width + 0.3, sillH, 1.1, matStone,
      b.door.center, sillH / 2, fz1 - T / 2 + 0.1)
    sill.castShadow = false
    gRoot.add(sill)
    // filete de latao marcando a linha da porta
    const sillEdge = box(b.door.width + 0.3, 0.03, 0.07, solid(0xb99a52, 0.4, 0.8),
      b.door.center, sillH + 0.004, fz1 + 0.02)
    sillEdge.castShadow = false
    gRoot.add(sillEdge)
    const mat0 = box(b.door.width + 0.4, 0.04, 1.0, solid(0x4a3b30, 0.98), b.door.center, SHOP_Y + 0.02, fz1 + 0.75)
    mat0.castShadow = false
    gRoot.add(mat0)

    // --- telhado ------------------------------------------------------------
    gRoot.add(box(w + 0.7, 0.34, d + 0.7, solid(0x6b675f, 0.95), cx, H + 0.17, cz))
    const pmat = solid(new THREE.Color(opts.wallColor).multiplyScalar(1.1).getHex(), 0.9)
    gRoot.add(box(w + 0.5, 0.7, 0.3, pmat, cx, H + 0.69, b.z1 - 0.05))
    gRoot.add(box(w + 0.5, 0.55, 0.3, pmat, cx, H + 0.62, b.z0 + 0.05))
    gRoot.add(box(0.3, 0.55, d + 0.5, pmat, b.x0 + 0.05, H + 0.62, cz))
    gRoot.add(box(0.3, 0.55, d + 0.5, pmat, b.x1 - 0.05, H + 0.62, cz))

    // --- letreiro luminoso --------------------------------------------------
    // Largura do painel dimensionada pelo TEXTO: com letras de ~0.45 m de altura
    // a frase ocupa ~4 m, entao um painel de 9 m deixava tudo perdido no meio.
    const signH = 0.62
    const signW = Math.min(w - 1.6, 6.8)
    const signY = H - 0.52        // encaixa logo abaixo da laje do telhado
    const signZ = b.z1 + 0.18
    gRoot.add(box(signW, signH + 0.3, 0.3, solid(0x232227, 0.85), b.door.center, signY, signZ))
    const edge = emissive(b.signColor, 2.4)
    const e1 = box(signW + 0.06, 0.08, 0.34, edge, b.door.center, signY + signH / 2 + 0.11, signZ)
    const e2 = box(signW + 0.06, 0.08, 0.34, edge, b.door.center, signY - signH / 2 - 0.11, signZ)
    e1.castShadow = false; e2.castShadow = false
    gRoot.add(e1, e2)
    const hexStr = '#' + new THREE.Color(b.signColor).getHexString()
    // canvas na MESMA proporcao do plano + fonte medida = texto inteiro
    const signPW = signW - 0.3, signPH = signH
    const scv = canvasFor(signPW, signPH, 1536)
    const signPx = fitFontPx(b.sign, scv.w * 0.9, Math.floor(scv.h * 0.74))
    const signMat = textPlaneMat(b.sign, {
      w: scv.w, h: scv.h, color: '#fdf7ea',
      font: 'bold ' + signPx + 'px "Trebuchet MS", sans-serif',
      glow: hexStr, stroke: hexStr, emissiveIntensity: 1.35,
    })
    const signPlane = new THREE.Mesh(new THREE.PlaneGeometry(signPW, signPH), signMat)
    signPlane.position.set(b.door.center, signY, signZ + 0.17)
    gRoot.add(signPlane)

    // duas luminarias penduradas na sacada do telhado, iluminando o letreiro
    for (const side of [-1, 1]) {
      const lx = b.door.center + side * (signW / 2 - 0.5)
      const lz = signZ + 0.14
      gRoot.add(box(0.08, 0.16, 0.08, solid(PALETTE.metal, 0.5, 0.6), lx, H - 0.08, lz))
      const shade = cyl(0.06, 0.2, 0.22, solid(0x2c2b2f, 0.8), 12)
      shade.position.set(lx, H - 0.27, lz)
      gRoot.add(shade)
      const bulb = sphere(0.09, claimLampMat(emissive(0xfff0cc, 2.6)), 10)
      bulb.castShadow = false
      bulb.position.set(lx, H - 0.4, lz)
      gRoot.add(bulb)
      // uma luz de verdade por loja (a outra luminaria fica so emissiva)
      if (side === 1) {
        const pl = new THREE.PointLight(0xffe0b0, 6.0, 11, 2)
        pl.position.set(b.door.center, H - 0.5, lz + 0.35)
        if (claimLight(pl)) gRoot.add(pl)
      }
    }

    // placa lateral perpendicular (bandeirola) -- silhueta reconhecivel
    const fcv = canvasFor(1.4, 1.0, 512)
    const flagPx = fitFontPx(opts.flagText, fcv.w * 0.86, Math.floor(fcv.h * 0.46))
    const flagMat = textPlaneMat(opts.flagText, {
      w: fcv.w, h: fcv.h, color: '#ffffff',
      font: 'bold ' + flagPx + 'px "Trebuchet MS", sans-serif',
      glow: hexStr, emissiveIntensity: 1.1,
    })
    const flagG = new THREE.Group()
    // fica na ponta da fachada pra nao brigar com o toldo nem com o letreiro
    flagG.position.set(b.x1 - 0.35, vitTop + 0.35, b.z1 + 0.1)
    flagG.add(box(0.08, 0.08, 0.9, solid(PALETTE.metal, 0.4, 0.7), 0, 0.5, 0.45))
    flagG.add(box(0.1, 1.15, 1.5, solid(0x232227, 0.85), 0, 0, 0.85))
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), flagMat)
    fp.rotation.y = -Math.PI / 2
    fp.position.set(0.07, 0, 0.85)
    flagG.add(fp)
    const fp2 = fp.clone()
    fp2.rotation.y = Math.PI / 2
    fp2.position.x = -0.07
    flagG.add(fp2)
    gRoot.add(flagG)

    // ar condicionado no telhado
    if (typeof Props.makeAC === 'function') {
      const ac = Props.makeAC()
      ac.position.set(cx + w * 0.25, H + 0.34, cz - d * 0.2)
      gRoot.add(ac); harvest(ac, true)
    }

    add(gRoot)
    return gRoot
  }

  // toldo listrado reutilizavel (origem na parede, avanca pra +Z e DESCE)
  const stripeGeoCache = new Map()
  function makeAwning(w, depth, colA, colB, x, y, z) {
    const g2 = new THREE.Group()
    g2.position.set(x, y, z)
    const tilt = 0.2                       // caimento pra fora
    const drop = Math.sin(tilt) * depth    // quanto a ponta desce
    const reach = Math.cos(tilt) * depth   // quanto a ponta avanca
    const nS = Math.max(4, Math.round(w / 0.42))
    const sw = w / nS
    const key = sw.toFixed(3) + ':' + depth.toFixed(2)
    if (!stripeGeoCache.has(key)) stripeGeoCache.set(key, new THREE.BoxGeometry(sw, 0.07, depth))
    const sg = stripeGeoCache.get(key)
    const mA = solid(colA, 0.85), mB = solid(colB, 0.85)
    const slab = new THREE.Group()
    slab.rotation.x = tilt
    for (let i = 0; i < nS; i++) {
      const s = new THREE.Mesh(sg, i % 2 ? mA : mB)
      s.position.set(-w / 2 + sw * (i + 0.5), 0, depth / 2)
      s.castShadow = true; s.receiveShadow = true
      slab.add(s)
    }
    g2.add(slab)
    // Bambole frontal: PRESO na ponta do toldo. Antes ficava boiando ~1.1 m
    // abaixo da lona e virava uma faixa opaca atravessada na vitrine inteira.
    const VAL_H = 0.2
    const valGeo = new THREE.BoxGeometry(sw, VAL_H, 0.05)
    const val = new THREE.Group()
    val.position.set(0, -drop - VAL_H / 2 + 0.02, reach)
    for (let i = 0; i < nS; i++) {
      const s = new THREE.Mesh(valGeo, i % 2 ? mA : mB)
      s.position.set(-w / 2 + sw * (i + 0.5), (i % 2) ? 0 : -0.04, 0)
      s.castShadow = true
      val.add(s)
    }
    g2.add(val)
    // hastes de sustentacao: da parede ate a ponta da lona
    const rodMat = solid(PALETTE.metal, 0.45, 0.7)
    const dy = 0.55 - drop
    for (const s of [-1, 1]) {
      const rod = cyl(0.035, 0.035, Math.hypot(dy, reach), rodMat, 8)
      rod.position.set(s * (w / 2 - 0.2), (-0.55 - drop) / 2, reach / 2)
      rod.rotation.x = Math.atan2(reach, dy)
      g2.add(rod)
    }
    return g2
  }

  buildShell(BARBER, {
    tex: brickTex(1), wallColor: 0xd9c3ae, glowColor: 0xffe0c0,
    awnA: 0xd63b3b, awnB: 0xf0ece2, flagText: 'BARBER',
  })
  buildShell(GROCERY, {
    tex: plasterTex(1), wallColor: 0xe6e2cf, glowColor: 0xfff3cf,
    awnA: 0x2f9e57, awnB: 0xf0ece2, flagText: 'MERCADO',
  })

  // poste de barbeiro girando (juice classico) na fachada da barbearia
  const poleTex = tiled(tex('barberpole', 128, (g, s) => {
    g.fillStyle = '#f5f2ea'; g.fillRect(0, 0, s, s)
    g.lineWidth = 22
    for (let i = -2; i < 8; i++) {
      g.strokeStyle = i % 2 ? '#d32f2f' : '#1f4fa8'
      g.beginPath()
      g.moveTo(i * 32, 0); g.lineTo(i * 32 + s, s)
      g.stroke()
    }
  }, 1), 1, 2.2)
  const poleMat = stdMat('city:barberpole', { map: poleTex, roughness: 0.35, metalness: 0.05 })
  // Fica no pilar cheio entre a vitrine da esquerda e a moldura da porta
  // (x livre de 20.3 a 20.6) e afastado o bastante em Z pra nao entrar na
  // fachada nem no letreiro (que comeca em BARBER.z1 - 0.33 e y 2.57).
  const POLE_X = BARBER.door.center - BARBER.door.width / 2 - 0.35
  const POLE_Z = BARBER.z1 + 0.5
  const poleG = new THREE.Group()
  poleG.position.set(POLE_X, groundY(POLE_X, POLE_Z), POLE_Z)
  const poleTube = cyl(0.1, 0.1, 1.2, poleMat, 16)
  poleTube.position.y = 1.66
  poleG.add(poleTube)
  const chrome = solid(PALETTE.chrome, 0.25, 0.9)
  const capA = cyl(0.14, 0.12, 0.14, chrome, 16); capA.position.y = 2.33; poleG.add(capA)
  const capB = cyl(0.12, 0.14, 0.14, chrome, 16); capB.position.y = 0.99; poleG.add(capB)
  const domeA = sphere(0.12, chrome, 12); domeA.position.y = 2.43; domeA.scale.y = 0.7; poleG.add(domeA)
  const domeB = sphere(0.12, chrome, 12); domeB.position.y = 0.89; domeB.scale.y = 0.7; poleG.add(domeB)
  // braco fino ligando na parede: so ele cruza a faixa das molduras
  const poleBrk = box(0.08, 0.08, 0.52, chrome, 0, 1.66, -0.26)
  poleG.add(poleBrk)
  poleG.add(box(0.16, 0.3, 0.06, chrome, 0, 1.66, -0.49))
  addLive(poleG)

  // caixas de feira na calcada da mercearia
  if (typeof Props.makeCrate === 'function') {
    for (let i = 0; i < 5; i++) {
      const c = Props.makeCrate()
      // i 0..2 no chao; i 3..4 empilhados EXATAMENTE em cima de 0 e 1
      const cxp = GROCERY.door.center + 3.4 + (i % 3) * 0.95
      const czp = GROCERY.z1 + 0.9
      c.position.set(cxp, groundY(cxp, czp) + (i > 2 ? CRATE_H : 0), czp)
      c.rotation.y = (rnd() - 0.5) * 0.4
      add(c); harvest(c, true)
      if (i <= 2) colBox(cxp, czp, 0.9, 0.9, 'crate')
    }
  }

  // -------------------------------------------------------------------------
  // 6. PARQUE / PRACA (quadrante sudoeste)
  // -------------------------------------------------------------------------
  const pcx = (PARK.x0 + PARK.x1) / 2
  const pcz = (PARK.z0 + PARK.z1) / 2
  // laje de grama do parque: topo exatamente em LEVELS.PARK (= groundY)
  const parkGrass = slabFromShape(rectShape(PARK.x0, PARK.x1, PARK.z0, PARK.z1), PARK_Y, matGrassPark)
  add(parkGrass)

  // caminhos de pedra em cruz (InstancedMesh de lajotas)
  const PATH_W = 3.2
  const slabsList = []
  const step = 1.05
  for (let x = PARK.x0 + 0.5; x < PARK.x1 - 0.5; x += step) {
    if (Math.abs(x - pcx) < 4.4) continue          // area da fonte
    for (let k = -1; k <= 1; k++) {
      slabsList.push({ x: x + step / 2, z: pcz + k * step, s: 0.94 + rnd() * 0.06, r: (rnd() - 0.5) * 0.06 })
    }
  }
  for (let z = PARK.z0 + 0.5; z < PARK.z1 - 0.5; z += step) {
    if (Math.abs(z - pcz) < 4.4) continue
    for (let k = -1; k <= 1; k++) {
      slabsList.push({ x: pcx + k * step, z: z + step / 2, s: 0.94 + rnd() * 0.06, r: (rnd() - 0.5) * 0.06 })
    }
  }
  const pathGeo = new THREE.BoxGeometry(step * 0.96, 0.08, step * 0.96)
  const pathIM = new THREE.InstancedMesh(pathGeo, matStone, slabsList.length)
  slabsList.forEach((s, i) => {
    dummy.position.set(s.x, PARK_Y - 0.016, s.z)  // topo 2.4 cm acima da grama
    dummy.rotation.set(0, s.r, 0)
    dummy.scale.set(s.s, 1, s.s)
    dummy.updateMatrix()
    pathIM.setMatrixAt(i, dummy.matrix)
  })
  pathIM.castShadow = false; pathIM.receiveShadow = true
  addLive(pathIM)

  // --- variacao da grama ----------------------------------------------------
  // Manchas de tom por cima da laje + uma orla de terra batida onde a grama
  // encontra os caminhos. As manchas usam alphaMap radial: o tom entra e sai
  // sem borda, entao dois planos vizinhos se sobrepoem sem deixar costura.
  // Sao mais numerosas e menos contrastantes do que antes -- grama de praca,
  // meio seca em partes, nao tapete de sinuca.
  const rndPark = mulberry32(0x5EED17)
  const patchGeo2 = new THREE.PlaneGeometry(1, 1)
  function grassPatch(x, y, z, mat, sMin, sMax) {
    const m = new THREE.Mesh(patchGeo2, mat)
    const s = sMin + rndPark() * (sMax - sMin)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = rndPark() * 6.283
    m.position.set(x, y, z)
    // *2 porque o plano tem lado 1 (o disco antigo tinha raio 1)
    m.scale.set(s * 2, s * 2 * (0.6 + rndPark() * 0.7), 1)
    m.castShadow = false; m.receiveShadow = true
    add(m)
  }
  const PARK_STAINS = [matGrassParkDark, matGrassParkLight, matGrassParkDry]
  for (let i = 0; i < 40; i++) {
    const x = PARK.x0 + 1.2 + rndPark() * (PARK.x1 - PARK.x0 - 2.4)
    const z = PARK.z0 + 1.2 + rndPark() * (PARK.z1 - PARK.z0 - 2.4)
    grassPatch(x, PARK_Y + 0.006, z, PARK_STAINS[i % 3], 1.8, 5.2)
  }
  // gramado externo do mapa (fora do anel viario): mesma quebra de tom
  const OUTER_STAINS = [matGrassDark, matGrassLight, matGrassDry]
  const OUTER = ROUT + SWW + 1
  for (let i = 0; i < 36; i++) {
    const a = rndPark() * Math.PI * 2
    const r = OUTER + 2 + rndPark() * (G / 2 - OUTER - 8)
    grassPatch(Math.cos(a) * r, 0.004, Math.sin(a) * r,
      OUTER_STAINS[i % 3], 4, 13)
  }

  // orla de terra: fica DEBAIXO das lajotas, sobrando alguns cm de cada lado
  const PATH_HALF = step * 1.5
  const DIRT_LIP = 0.6
  function dirtStrip(x0, x1, z0, z1) {
    if (x1 - x0 < 0.2 || z1 - z0 < 0.2) return
    const m = plane(x1 - x0, z1 - z0, matDirt)
    m.position.set((x0 + x1) / 2, PARK_Y + 0.012, (z0 + z1) / 2)
    add(m)
  }
  dirtStrip(PARK.x0 + 0.2, pcx - 4.3, pcz - PATH_HALF - DIRT_LIP, pcz + PATH_HALF + DIRT_LIP)
  dirtStrip(pcx + 4.3, PARK.x1 - 0.2, pcz - PATH_HALF - DIRT_LIP, pcz + PATH_HALF + DIRT_LIP)
  dirtStrip(pcx - PATH_HALF - DIRT_LIP, pcx + PATH_HALF + DIRT_LIP, PARK.z0 + 0.2, pcz - 4.3)
  dirtStrip(pcx - PATH_HALF - DIRT_LIP, pcx + PATH_HALF + DIRT_LIP, pcz + 4.3, PARK.z1 - 0.2)
  // largo de terra batida em volta da fonte
  const apron = new THREE.Mesh(new THREE.CircleGeometry(4.9, 36), matDirt)
  apron.rotation.x = -Math.PI / 2
  apron.position.set(pcx, PARK_Y + 0.012, pcz)
  apron.castShadow = false; apron.receiveShadow = true
  add(apron)

  // --- fonte central --------------------------------------------------------
  // Ponto focal da praca: bacia redonda de verdade (44 lados), borda em torus,
  // degrau de acesso, jatos em arco e agua translucida.
  const FSEG = 44
  const fountain = new THREE.Group()
  fountain.position.set(pcx, PARK_Y, pcz)
  const stoneMat = solid(0xd6cfbe, 0.9)
  const stoneDark = solid(0xb3a994, 0.92)

  // degrau baixo em volta (fica fora do colisor, e so leitura visual)
  const stepRing = cyl(4.0, 4.12, 0.12, stoneDark, FSEG)
  stepRing.position.y = 0.06
  fountain.add(stepRing)

  // parede da bacia: anel extrudado (nada de tampo tapando a agua)
  const basinRing = new THREE.Shape()
  basinRing.absarc(0, 0, 3.5, 0, Math.PI * 2, false)
  const basinHole = new THREE.Path()
  basinHole.absarc(0, 0, 3.18, 0, Math.PI * 2, true)
  basinRing.holes.push(basinHole)
  const basin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(basinRing, { depth: 0.66, bevelEnabled: false, curveSegments: FSEG }),
    stoneMat)
  basin.rotation.x = -Math.PI / 2
  basin.position.y = 0.12
  basin.castShadow = true; basin.receiveShadow = true
  fountain.add(basin)

  // fundo da bacia (azulejo escuro) -- da profundidade pra agua
  const basinFloor = cyl(3.2, 3.2, 0.1, solid(0x2e5f6d, 0.55), FSEG)
  basinFloor.position.y = 0.17
  basinFloor.receiveShadow = true
  fountain.add(basinFloor)

  // borda arredondada em torus
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.34, 0.16, 8, FSEG), stoneDark)
  rim.rotation.x = -Math.PI / 2
  rim.position.y = 0.78
  rim.castShadow = true; rim.receiveShadow = true
  fountain.add(rim)

  // --- superficie da agua: malha de verdade, deformada no update -----------
  // Um disco chapado nunca vai parecer agua. Aqui e um anel com 8 aneis de
  // vertices; o update soma senoides radiais + direcionais e recalcula as
  // normais, entao a luz do sol corre pela ondulacao.
  const waterSurfaces = []
  function makeWaterSurface(rOut, seg, rings, y) {
    const geo = new THREE.RingGeometry(rOut * 0.03, rOut, seg, rings)
    geo.rotateX(-Math.PI / 2)
    const m = new THREE.Mesh(geo, matWater)
    m.position.y = y
    m.castShadow = false
    m.receiveShadow = true
    m.userData.base = Float32Array.from(geo.attributes.position.array)
    fountain.add(m)
    waterSurfaces.push(m)
    return m
  }
  const water1 = makeWaterSurface(3.16, 56, 8, 0.58)
  water1.userData.amp = 0.055
  water1.userData.freq = 3.4
  water1.userData.speed = 2.6

  // torre central: pedestal -> taca -> pedestal -> taca de topo
  const ped = cyl(0.55, 0.95, 1.35, stoneMat, 24)
  ped.position.y = 0.84
  fountain.add(ped)
  const bowl2 = cyl(1.5, 0.7, 0.34, stoneMat, 32)
  bowl2.position.y = 1.66
  fountain.add(bowl2)
  const water2 = makeWaterSurface(1.4, 36, 5, 1.8)
  water2.userData.amp = 0.03
  water2.userData.freq = 7.0
  water2.userData.speed = 3.4
  const ped2 = cyl(0.28, 0.42, 0.92, stoneMat, 20)
  ped2.position.y = 2.28
  fountain.add(ped2)
  const topBowl = cyl(0.78, 0.34, 0.26, stoneMat, 28)
  topBowl.position.y = 2.85
  fountain.add(topBowl)

  // jato central
  const jet = cyl(0.055, 0.13, 1.5, matJet, 10)
  jet.position.y = 3.7
  jet.castShadow = false
  fountain.add(jet)
  const jetTop = sphere(0.16, matJet, 10)
  jetTop.position.y = 4.45
  jetTop.castShadow = false
  fountain.add(jetTop)

  // jatos em arco da taca de topo pra bacia (tubo seguindo a curva)
  const jetArcs = []
  const jetCurves = []
  const N_ARC = 6
  for (let i = 0; i < N_ARC; i++) {
    const a = (i / N_ARC) * Math.PI * 2
    const dx = Math.cos(a), dz = Math.sin(a)
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dx * 0.6, 2.94, dz * 0.6),
      new THREE.Vector3(dx * 1.5, 3.2, dz * 1.5),
      new THREE.Vector3(dx * 2.2, 2.1, dz * 2.2),
      new THREE.Vector3(dx * 2.55, 0.64, dz * 2.55),
    ])
    jetCurves.push(curve)
    const arcM = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.032, 6, false), matJet)
    arcM.castShadow = false
    fountain.add(arcM)
    jetArcs.push(arcM)
  }

  // cortinas de agua caindo da taca do meio
  const fallGeo = new THREE.CylinderGeometry(0.028, 0.016, 0.92, 5)
  const falls = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const f = new THREE.Mesh(fallGeo, matJet)
    f.position.set(Math.cos(a) * 1.36, 1.06, Math.sin(a) * 1.36)
    f.castShadow = false
    fountain.add(f)
    falls.push(f)
  }

  // --- gotas: 1 InstancedMesh cobre spray dos arcos + respingo da borda ----
  // Metade acompanha a curva dos jatos (spray que se solta), metade e
  // balistica saindo de onde a agua bate na bacia.
  const N_SPRAY = 6 * 7, N_SPLASH = 40
  const N_DROP = N_SPRAY + N_SPLASH
  const dropGeo = new THREE.IcosahedronGeometry(0.05, 0)
  const dropIM = new THREE.InstancedMesh(dropGeo, matJet, N_DROP)
  dropIM.castShadow = false
  dropIM.frustumCulled = false
  fountain.add(dropIM)
  const drops = []
  for (let i = 0; i < N_SPRAY; i++) {
    drops.push({
      kind: 0,
      arc: i % N_ARC,
      t0: rnd(),
      dur: 1.5 + rnd() * 0.8,
      off: (rnd() - 0.5) * 0.16,
      side: (rnd() - 0.5) * 0.16,
      s: 0.5 + rnd() * 0.8,
    })
  }
  for (let i = 0; i < N_SPLASH; i++) {
    const a = rnd() * Math.PI * 2
    // 2/3 respingam onde os arcos caem (r 2.55), 1/3 no jato central
    const central = rnd() < 0.34
    drops.push({
      kind: 1,
      ca: Math.cos(a), sa: Math.sin(a),
      r0: central ? 0.25 : 2.55,
      vr: (0.35 + rnd() * 0.8) * (central ? 1.6 : 1),
      vy: 1.5 + rnd() * 1.9,
      t0: rnd(),
      dur: 0.55 + rnd() * 0.55,
      s: 0.35 + rnd() * 0.7,
    })
  }
  const dropDummy = new THREE.Object3D()
  const dropTmp = new THREE.Vector3()

  // --- espuma: anel claro na borda + roseta onde o jato central bate -------
  const foamRing = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.085, 6, 40), matFoam)
  foamRing.rotation.x = -Math.PI / 2
  foamRing.position.y = 0.585
  foamRing.castShadow = false
  fountain.add(foamRing)
  const foamCore = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.075, 6, 22), matFoam)
  foamCore.rotation.x = -Math.PI / 2
  foamCore.position.y = 0.588
  foamCore.castShadow = false
  fountain.add(foamCore)
  // espuma na borda da bacia (onde a agua lambe a pedra)
  const foamEdge = new THREE.Mesh(new THREE.TorusGeometry(3.08, 0.055, 6, 44), matFoam)
  foamEdge.rotation.x = -Math.PI / 2
  foamEdge.position.y = 0.578
  foamEdge.castShadow = false
  fountain.add(foamEdge)
  const foams = [foamRing, foamCore, foamEdge]
  const fLight = new THREE.PointLight(0x9fe0ff, 6, 12, 2)
  fLight.position.set(0, 1.2, 0)
  if (claimLight(fLight)) fountain.add(fLight)
  addLive(fountain)
  // colisor cobre bacia + degrau (r 4.12), senao o jogador entra na pedra
  colBox(pcx, pcz, 8.3, 8.3, 'fountain')
  // a camera nao pode entrar na bacia; o miolo (torre) e mais alto
  occBox(pcx, pcz, 8.3, 8.3, 1.9, 'fountain')
  occBox(pcx, pcz, 3.6, 3.6, 3.4, 'fountain-core')

  interactables.push({
    id: 'city-fountain',
    position: new THREE.Vector3(pcx, 1.2, pcz + 4.2),
    radius: 3.0,
    label: 'Jogar uma moeda',
    onInteract: (game) => { if (game && game.toast) game.toast('Voce fez um pedido na fonte...') },
  })

  // --- bancos ao redor da fonte + arvores + arbustos -----------------------
  const benchRing = [
    [pcx, pcz - 6.2, Math.PI],
    [pcx, pcz + 6.2, 0],
    [pcx - 6.2, pcz, Math.PI / 2],
    [pcx + 6.2, pcz, -Math.PI / 2],
  ]
  for (const [bx, bz, br] of benchRing) placeProp('makeBench', bx, bz, br)

  // arvores do parque em posicoes deterministicas fora dos caminhos
  const treeSpots = []
  for (let i = 0; i < 400 && treeSpots.length < 22; i++) {
    const x = PARK.x0 + 2.5 + rnd() * (PARK.x1 - PARK.x0 - 5)
    const z = PARK.z0 + 2.5 + rnd() * (PARK.z1 - PARK.z0 - 5)
    if (Math.abs(z - pcz) < PATH_W && Math.abs(x - pcx) < 30) continue
    if (Math.abs(x - pcx) < PATH_W) continue
    if (Math.hypot(x - pcx, z - pcz) < 9) continue
    let ok = true
    for (const t of treeSpots) if (Math.hypot(t[0] - x, t[1] - z) < 5) { ok = false; break }
    if (!ok) continue
    treeSpots.push([x, z])
  }
  treeSpots.forEach((t, i) => {
    const o = placeProp('makeTree', t[0], t[1], rnd() * Math.PI * 2, [i * 7 + 3])
    if (!o) return
    o.scale.setScalar(0.85 + rnd() * 0.45)
  })

  // --- arbustos -------------------------------------------------------------
  // Antes era UM icosaedro de 1.5-2 m -> parecia uma pedra verde cristalizada.
  // Agora cada arbusto e um aglomerado de 3-6 bolotas de 0.35-0.7 m em tons de
  // verde diferentes, com altura irregular. Geometrias e materiais reusados,
  // entao tudo funde no forno em poucos draw calls.
  const rndBush = mulberry32(0xB05A17)
  const bushGeos = [
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.IcosahedronGeometry(0.5, 1),
    new THREE.SphereGeometry(0.5, 8, 6),
  ]
  const bushMats = [
    solid(0x4d7a3a, 0.98), solid(0x62914e, 0.98),
    solid(0x3f6b31, 0.98), solid(0x71a057, 0.98),
  ]
  for (let i = 0; i < 34; i++) {
    const x = PARK.x0 + 1.8 + rndBush() * (PARK.x1 - PARK.x0 - 3.6)
    const z = PARK.z0 + 1.8 + rndBush() * (PARK.z1 - PARK.z0 - 3.6)
    if (Math.abs(z - pcz) < PATH_W * 0.9 || Math.abs(x - pcx) < PATH_W * 0.9) continue
    if (Math.hypot(x - pcx, z - pcz) < 8.5) continue
    const n = 3 + Math.floor(rndBush() * 4)          // 3..6 bolotas
    const spread = 0.25 + rndBush() * 0.22
    const tone = Math.floor(rndBush() * bushMats.length)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rndBush() * 0.9
      const rr = k === 0 ? 0 : spread * (0.4 + rndBush() * 0.7)
      // d = diametro da bolota em metros (a geometria base tem raio 0.5),
      // a do meio e a maior; as de fora encostam nela e variam de altura
      const d = k === 0 ? 0.58 + rndBush() * 0.14 : 0.34 + rndBush() * 0.32
      const flat = 0.85 + rndBush() * 0.35
      const m = new THREE.Mesh(bushGeos[(i + k) % bushGeos.length],
        bushMats[(tone + k) % bushMats.length])
      m.position.set(x + Math.cos(a) * rr,
        PARK_Y + d * 0.36 * flat,
        z + Math.sin(a) * rr)
      m.scale.set(d, d * flat, d)
      m.rotation.set(rndBush() * 3, rndBush() * 6, rndBush() * 3)
      m.castShadow = true; m.receiveShadow = true
      add(m)
      // bolota por bolota: a neve por cima de um arbusto tem que seguir o
      // aglomerado, senao vira uma bola branca boiando no meio da moita
      bushPos.push({
        x: x + Math.cos(a) * rr, y: PARK_Y + d * 0.36 * flat, z: z + Math.sin(a) * rr,
        r: d * 0.5, alt: d * flat * 0.5,
      })
    }
  }

  // --- canteiros de flores --------------------------------------------------
  // Antes eram cones rosa/amarelos espetados na grama (cone de transito em
  // miniatura). Agora: uma moita verde baixa com 3-8 florzinhas de 0.1-0.2 m
  // por cima, agrupadas em canteiros ao redor da fonte.
  const rndFlw = mulberry32(0xF10A11)
  const clumpGeo = new THREE.IcosahedronGeometry(0.3, 0)
  const petalGeo = new THREE.IcosahedronGeometry(0.075, 0)
  const stemGeo = new THREE.CylinderGeometry(0.014, 0.02, 0.2, 4)
  const stemMat = solid(0x3f6b31, 0.95)
  const bedMats = [solid(0x4f7d3c, 0.98), solid(0x5d8f47, 0.98)]
  const petalMats = [
    solid(0xe86a8f, 0.85), solid(0xf0c94a, 0.85), solid(0xd8543f, 0.85),
    solid(0xc07fd6, 0.85), solid(0xf6f0dd, 0.85),
  ]
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.3
    const r = 5.4 + rndFlw() * 2.0
    const bx = pcx + Math.cos(a) * r
    const bz = pcz + Math.sin(a) * r
    // fora dos caminhos de pedra
    if (Math.abs(bx - pcx) < PATH_W * 0.8 || Math.abs(bz - pcz) < PATH_W * 0.8) continue
    // moita: 2-3 bolotas verdes bem baixas formando o canteiro
    const nC = 2 + Math.floor(rndFlw() * 2)
    for (let c = 0; c < nC; c++) {
      const ca = rndFlw() * 6.283, cr = c === 0 ? 0 : 0.2 + rndFlw() * 0.18
      const s = 0.8 + rndFlw() * 0.5
      const m = new THREE.Mesh(clumpGeo, bedMats[c % 2])
      m.position.set(bx + Math.cos(ca) * cr, PARK_Y + 0.05, bz + Math.sin(ca) * cr)
      m.scale.set(s * 1.3, s * 0.55, s * 1.3)
      m.rotation.y = rndFlw() * 6
      m.castShadow = true; m.receiveShadow = true
      add(m)
    }
    // 3-8 flores: caule curtinho + botao colorido de 0.14-0.21 m
    const nF = 3 + Math.floor(rndFlw() * 6)
    const pA = petalMats[Math.floor(rndFlw() * petalMats.length)]
    const pB = petalMats[Math.floor(rndFlw() * petalMats.length)]
    for (let f = 0; f < nF; f++) {
      const fa = rndFlw() * 6.283, fr = rndFlw() * 0.36
      const fx = bx + Math.cos(fa) * fr, fz = bz + Math.sin(fa) * fr
      const hgt = 0.15 + rndFlw() * 0.12
      const st = new THREE.Mesh(stemGeo, stemMat)
      st.position.set(fx, PARK_Y + hgt * 0.5, fz)
      st.scale.y = hgt / 0.2
      st.castShadow = false; st.receiveShadow = true
      add(st)
      const p = new THREE.Mesh(petalGeo, f % 2 ? pA : pB)
      // pd = diametro do botao (geometria base tem raio 0.075 = 0.15 de diam.)
      const pd = 0.11 + rndFlw() * 0.09
      const ps = pd / 0.15
      p.position.set(fx, PARK_Y + hgt + pd * 0.35, fz)
      p.scale.set(ps, ps * 0.8, ps)
      p.rotation.set(rndFlw() * 3, rndFlw() * 6, rndFlw() * 3)
      p.castShadow = true; p.receiveShadow = true
      add(p)
    }
  }

  // --- cerquinha baixa do parque -------------------------------------------
  const postList = [], railList = []
  const fenceInset = 0.6
  const fx0 = PARK.x0 + fenceInset, fx1 = PARK.x1 - fenceInset
  const fz0 = PARK.z0 + fenceInset, fz1 = PARK.z1 - fenceInset
  function fenceRun(ax, az, bx, bz, gapCenter, gapHalf, axis) {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.round(len / 2.2))
    let segStart = null
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t
      const v = axis === 'x' ? x : z
      const inGap = gapCenter !== null && Math.abs(v - gapCenter) < gapHalf
      if (!inGap) postList.push({ x, y: 0, z, ry: 0 })
      if (!inGap && segStart === null) segStart = [x, z]
      if ((inGap || i === n) && segStart) {
        const ex = x, ez = z
        railList.push({ a: segStart, b: [ex, ez] })
        if (axis === 'x') col(Math.min(segStart[0], ex) - 0.1, Math.max(segStart[0], ex) + 0.1, z - 0.15, z + 0.15, 'fence')
        else col(x - 0.15, x + 0.15, Math.min(segStart[1], ez) - 0.1, Math.max(segStart[1], ez) + 0.1, 'fence')
        segStart = null
      }
    }
  }
  fenceRun(fx0, fz0, fx1, fz0, pcx, 2.4, 'x')
  fenceRun(fx0, fz1, fx1, fz1, pcx, 2.4, 'x')
  fenceRun(fx0, fz0, fx0, fz1, pcz, 2.4, 'z')
  fenceRun(fx1, fz0, fx1, fz1, pcz, 2.4, 'z')

  const fenceMat = solid(0x2f3a33, 0.55, 0.6)
  const postGeo = new THREE.BoxGeometry(0.09, 0.72, 0.09)
  instances(postGeo, fenceMat, postList.map(p => ({ x: p.x, y: PARK_Y + 0.36, z: p.z, ry: 0 })), true)
  const railBits = []
  for (const r of railList) {
    const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1])
    if (len < 0.3) continue
    const ang = Math.atan2(r.b[0] - r.a[0], r.b[1] - r.a[1])
    const mx = (r.a[0] + r.b[0]) / 2, mz = (r.a[1] + r.b[1]) / 2
    for (const y of [0.28, 0.58]) railBits.push({ x: mx, y: PARK_Y + y, z: mz, ry: ang, len })
  }
  // barras: uma geometria unitaria escalada por instancia
  if (railBits.length) {
    const railGeo = new THREE.BoxGeometry(0.05, 0.05, 1)
    const im = new THREE.InstancedMesh(railGeo, fenceMat, railBits.length)
    railBits.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z)
      dummy.rotation.set(0, r.ry, 0)
      dummy.scale.set(1, 1, r.len)
      dummy.updateMatrix()
      im.setMatrixAt(i, dummy.matrix)
    })
    im.castShadow = true; im.receiveShadow = true
    addLive(im)
  }

  // postes e lixeiras nas bocas do parque
  placeProp('makeStreetLight', pcx - 2.4, pcz - 8.5, 0)
  placeProp('makeStreetLight', pcx + 2.4, pcz + 8.5, Math.PI)
  placeProp('makeTrashCan', pcx + 3.0, pcz - 6.4, 0)
  placeProp('makeTrashCan', pcx - 3.0, pcz + 6.4, Math.PI)
  placeProp('makePlanter', PARK.x1 - 2.0, pcz - 1.8, 0)
  placeProp('makePlanter', PARK.x1 - 2.0, pcz + 1.8, 0)
  placeProp('makeSign', pcx - 4.5, PARK.z0 + 1.2, Math.PI, ['PRACA CENTRAL', 0x2f9e57])

  // -------------------------------------------------------------------------
  // 7. MOBILIARIO URBANO
  // -------------------------------------------------------------------------
  // wantLight = false: descarta as luzes do prop e fica so com o emissivo.
  // Point lights sao caras em MeshStandardMaterial, entao poucas e escolhidas.
  function harvest(o, castOverride, wantLight) {
    if (!o) return
    const ls = (o.userData && o.userData.lights) || []
    for (const l of ls) {
      if (wantLight) claimLight(l)
      else if (l.parent) l.parent.remove(l)
    }
    o.traverse((n) => {
      if (n.isMesh) {
        if (castOverride !== undefined) n.castShadow = castOverride
        n.receiveShadow = true
      }
    })
  }

  /**
   * O ponto esta no CORREDOR DA PORTA de algum lote?
   *
   * O mobiliario de rua e distribuido por ritmo fixo (a cada 8 m), sem olhar
   * pra o que ha atras da calcada — e por isso um jornaleiro nasceu bem na
   * frente da porta da casa velha e uma conifera de 2.4 m de raio na da
   * barbearia. Nao da pra resolver caso a caso na lista: a lista e ritmo, e o
   * ritmo e o que faz a rua nao parecer arrumada a mao.
   *
   * Entao a regra e aqui, uma vez, pra todos os lotes: nada nasce no retangulo
   * que vai da porta ate 3.5 m pra fora dela. E o corredor por onde o jogador
   * entra, e tambem o eixo de onde qualquer camera fotografa a fachada.
   */
  function naFrenteDaPorta(x, z) {
    for (let i = 0; i < LOTES.length; i++) {
      const b = LOTES[i]
      const meia = b.door.width / 2 + 1.4
      if (x < b.door.center - meia || x > b.door.center + meia) continue
      if (b.facade === 'z0') { if (z > b.z0 - 3.5 && z < b.z0 + 0.5) return true }
      else if (z > b.z1 - 0.5 && z < b.z1 + 3.5) return true
    }
    return false
  }

  function placeProp(name, x, z, ry, args, wantLight) {
    const fn = Props[name]
    if (typeof fn !== 'function') return null   // prop ainda nao existe -> pula
    // porta livre: ver naFrenteDaPorta acima
    if (naFrenteDaPorta(x, z)) return null
    let o = null
    try { o = fn.apply(null, args || []) } catch (e) { o = null }
    if (!o || !o.isObject3D) return null
    // props tem origem na BASE: sobe pra altura do piso (calcada e elevada)
    const gy = groundY(x, z)
    o.position.set(x, gy + (o.position.y || 0), z)
    o.rotation.y = ry || 0
    bakeBin.add(o)
    harvest(o, undefined, wantLight === true)
    // lente do poste: material emissivo que o ciclo dia/noite controla
    if (name === 'makeStreetLight') { claimLampMats(o); lampPos.push({ x, z, y: gy }) }
    if (name === 'makeTree') { treePos.push({ x, z, y: gy }); treeObjs.push(o) }
    if (name === 'makeTrashCan') trashPos.push({ x, z, y: gy })
    // banco guarda tambem o GIRO: a neve deitada em cima do assento tem que
    // acompanhar o banco, e sem o angulo ela ficaria atravessada nele
    if (name === 'makeBench') benchPos.push({ x, z, y: gy, ry: ry || 0 })

    // --- assentos (contrato com props.js) ----------------------------------
    // props.js pode ainda nao expor userData.seats: Array.isArray protege.
    // Cada assento local vira um ponto de interacao no MUNDO.
    const seats = o.userData && o.userData.seats
    let seated = false
    if (Array.isArray(seats) && seats.length) {
      o.updateMatrixWorld(true)
      for (const s of seats) {
        if (!s || typeof s.x !== 'number' || typeof s.z !== 'number') continue
        seatTmp.set(s.x, typeof s.y === 'number' ? s.y : 0, s.z)
        seatTmp.applyMatrix4(o.matrixWorld)
        const wx = seatTmp.x, wy = seatTmp.y, wz = seatTmp.z
        const worldRy = (ry || 0) + (typeof s.ry === 'number' ? s.ry : 0)
        seated = true
        interactables.push({
          id: 'seat-' + (seatCount++),
          position: new THREE.Vector3(wx, wy, wz),
          radius: 1.7,
          label: 'Sentar',
          onInteract: (game) => {
            if (game && typeof game.sitPlayer === 'function') {
              game.sitPlayer({
                x: wx, y: wy, z: wz, rotY: worldRy,
                standX: wx + Math.sin(worldRy) * 0.9,
                standZ: wz + Math.cos(worldRy) * 0.9,
              })
            }
          },
        })
      }
    }

    const c = o.userData && o.userData.collider
    if (c && c.w && c.d) {
      const ang = ry || 0
      const ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang))
      let ex = c.w * ca + c.d * sa
      let ez = c.w * sa + c.d * ca
      // Banco/cadeira: encolhe o colisor 15 cm de cada lado pro jogador
      // conseguir encostar e chegar no raio de interacao do assento.
      if (seated) { ex = Math.max(0.2, ex - 0.3); ez = Math.max(0.2, ez - 0.3) }
      // offset opcional (ox/oz, no espaco local do prop): deixa bloquear so uma
      // parte, tipo a parede de fundo do abrigo de onibus
      const co = Math.cos(ang), so = Math.sin(ang)
      const ox = c.ox || 0, oz = c.oz || 0
      const bx = x + ox * co + oz * so
      const bz = z - ox * so + oz * co
      colBox(bx, bz, ex, ez, name)
      // props altos (abrigo de onibus etc.) tambem tapam a camera
      if (c.h && c.h >= 1.5) occBox(bx, bz, ex, ez, c.h, name)
    }
    return o
  }

  // --- postes a cada ~16m nas calcadas das avenidas centrais ---------------
  const LAMP_OFF = RH + SWW / 2 - 0.6   // ~9.4 do eixo
  // So 4 postes tem PointLight (um por braco do cruzamento): o resto ilumina
  // por material emissivo, que nao entra na conta de luzes do shader.
  for (let z = -48; z <= 48; z += 16) {
    if (Math.abs(z) < 14) continue
    const lit = z === 16
    placeProp('makeStreetLight', LAMP_OFF, z, -Math.PI / 2, null, lit)
    placeProp('makeStreetLight', -LAMP_OFF, z, Math.PI / 2, null, lit)
  }
  for (let x = -48; x <= 48; x += 16) {
    if (Math.abs(x) < 14) continue
    const lit = x === -16
    placeProp('makeStreetLight', x, LAMP_OFF, Math.PI, null, lit)
    placeProp('makeStreetLight', x, -LAMP_OFF, 0, null, lit)
  }
  // rua do anel: postes na calcada EXTERNA (a interna fica sob os predios)
  const RLAMP = ROUT + 1.6
  for (let v = -56; v <= 56; v += 28) {
    placeProp('makeStreetLight', RLAMP, v, Math.PI / 2)
    placeProp('makeStreetLight', -RLAMP, v, -Math.PI / 2)
    placeProp('makeStreetLight', v, RLAMP, 0)
    placeProp('makeStreetLight', v, -RLAMP, Math.PI)
  }

  // --- semaforos no cruzamento central -------------------------------------
  const TL = BI - 1.2
  placeProp('makeTrafficLight', TL, TL, -Math.PI * 0.75)
  placeProp('makeTrafficLight', -TL, TL, Math.PI * 0.75)
  placeProp('makeTrafficLight', TL, -TL, -Math.PI * 0.25)
  placeProp('makeTrafficLight', -TL, -TL, Math.PI * 0.25)

  // --- bancos, lixeiras e placas nas esquinas ------------------------------
  const cornerSpots = [
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  for (const [sx, sz] of cornerSpots) {
    placeProp('makeBench', sx * 16.5, sz * (RH + 1.6), sz > 0 ? Math.PI : 0)
    placeProp('makeTrashCan', sx * (RH + 1.3), sz * 16.0, sx > 0 ? -Math.PI / 2 : Math.PI / 2)
    placeProp('makeBollard', sx * (RH + 1.7), sz * (RH + 1.7), 0)
    placeProp('makeSign', sx * (BI - 0.9), sz * (BI - 0.9), sx * sz > 0 ? Math.PI / 4 : -Math.PI / 4,
      [sz > 0 ? 'AV. SUL' : 'AV. NORTE', 0x2b3d5c])
  }

  // --- mobiliario ao longo das calcadas, ritmo fixo entre os postes --------
  // (posicoes multiplas de 16 ficam reservadas pros postes)
  const ARM_PROPS = [
    'makeTrashCan', 'makeBench', 'makeHydrant', 'makeNewsBox',
    'makeTree', 'makeMailbox', 'makePlanter', 'makeBench',
    'makeTree', 'makeTrashCan', 'makeBollard', 'makeHydrant',
  ]
  let armIdx = 0
  for (const side of [1, -1]) {
    for (let v = -44; v <= 44; v += 8) {
      if (Math.abs(v) < 14 || Math.abs(v) % 16 === 0) continue
      const off = side * (LAMP_OFF - 0.3)
      const nA = ARM_PROPS[armIdx++ % ARM_PROPS.length]
      placeProp(nA, off, v, side > 0 ? -Math.PI / 2 : Math.PI / 2, nA === 'makeTree' ? [armIdx * 7 + 5] : null)
      const nB = ARM_PROPS[armIdx++ % ARM_PROPS.length]
      placeProp(nB, v, off, side > 0 ? Math.PI : 0, nB === 'makeTree' ? [armIdx * 7 + 5] : null)
    }
  }
  // alguns hidrantes/floreiras marcados nas frentes das lojas
  for (const s of [
    ['makeHydrant', LAMP_OFF, -34, -Math.PI / 2],
    ['makeHydrant', -LAMP_OFF, 26, Math.PI / 2],
    ['makePlanter', BARBER.door.center + 4.6, BARBER.z1 + 1.3, 0],
    ['makePlanter', GROCERY.door.center - 4.6, GROCERY.z1 + 1.3, 0],
    ['makeNewsBox', BARBER.door.center - 4.2, BARBER.z1 + 1.2, 0],
    ['makeMailbox', GROCERY.door.center - 7.5, GROCERY.z1 + 1.2, 0],
  ]) placeProp(s[0], s[1], s[2], s[3])

  // --- ponto de onibus -----------------------------------------------------
  placeProp('makeBusStop', 30, -(RH + 2.2), 0)
  placeProp('makeBusStop', -20, RH + 2.2, Math.PI)
  // baia de onibus pintada no asfalto
  const bay = box(9, MARK_H, 0.35, matLineW, 30, MARK_Y, -(RH - 0.5))
  bay.castShadow = false
  add(bay)

  // --- arvores de rua nos canteiros da calcada -----------------------------
  const streetTrees = [
    [LAMP_OFF, -8 - 34, 0], [LAMP_OFF, 42, 0], [-LAMP_OFF, -44, 0], [-LAMP_OFF, 22, 0],
    // Aqui havia uma arvore de rua em (22, 9.4), e ela saiu da lista.
    //
    // A calcada sul da avenida (z = 9.4) e a vitrine do jogo: nela ficam a
    // fachada do CASSINO (x 14..34, a mais chamativa do mapa) e a da CASA
    // VELHA (x 38..50, onde a cena de abertura para pra olhar). Uma conifera
    // tem 2.4 m de raio de copa e 10 m de altura — em 22 ela tapava metade da
    // porta do cassino, e movida pra 44 tapava a casa inteira de qualquer
    // altura de olho, que foi o que obrigou a cutscene a subir 10 m no ar.
    // Nao ha ponto livre nessa calcada que nao esbarre num poste (16, 32, 48),
    // num banco (36) ou na outra arvore (38). Entao ela sai: onze arvores de
    // rua em vez de doze, e as duas fachadas que importam ficam limpas.
    [-34, -LAMP_OFF, 0], [46, -LAMP_OFF, 0], [-46, LAMP_OFF, 0],
    [LAMP_OFF, -26, 0], [-LAMP_OFF, -28, 0], [38, LAMP_OFF, 0], [-18, -LAMP_OFF, 0],
  ]
  streetTrees.forEach((t, i) => {
    const o = placeProp('makeTree', t[0], t[1], rnd() * 6, [i * 13 + 11])
    if (o) o.scale.setScalar(0.75 + rnd() * 0.3)
  })

  // -------------------------------------------------------------------------
  // 7b. JUICE DE RUA: folhas caidas, lixo, fios entre postes
  // -------------------------------------------------------------------------

  // --- fios de energia ligando postes vizinhos da mesma calcada ------------
  const wireMat = solid(0x1e2026, 0.9, 0.25)
  function wireBetween(a, b) {
    const ay = a.y + 5.55, by = b.y + 5.55
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    const sag = 0.06 * dist
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(a.x, ay, a.z),
      new THREE.Vector3(a.x * 0.75 + b.x * 0.25, (ay + by) / 2 - sag * 0.75, a.z * 0.75 + b.z * 0.25),
      new THREE.Vector3((a.x + b.x) / 2, (ay + by) / 2 - sag, (a.z + b.z) / 2),
      new THREE.Vector3(a.x * 0.25 + b.x * 0.75, (ay + by) / 2 - sag * 0.75, a.z * 0.25 + b.z * 0.75),
      new THREE.Vector3(b.x, by, b.z),
    ])
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.022, 4, false), wireMat)
    m.castShadow = false; m.receiveShadow = false
    add(m)
    // isoladorzinho na ponta de cada poste
    add(box(0.07, 0.12, 0.07, wireMat, a.x, ay + 0.06, a.z))
    add(box(0.07, 0.12, 0.07, wireMat, b.x, by + 0.06, b.z))
  }
  for (let i = 0; i < lampPos.length; i++) {
    for (let j = i + 1; j < lampPos.length; j++) {
      const a = lampPos[i], b2 = lampPos[j]
      const dx = Math.abs(a.x - b2.x), dz = Math.abs(a.z - b2.z)
      const aligned = (dx < 0.25 && dz > 6 && dz < 18) || (dz < 0.25 && dx > 6 && dx < 18)
      if (aligned) wireBetween(a, b2)
    }
  }

  // --- folhas caidas em volta das arvores ----------------------------------
  const leafMats = [solid(0x7e8f52, 0.98), solid(0x9a7f43, 0.98), solid(0x6d7f48, 0.98)]
  for (const m of leafMats) {
    m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -6
  }
  const leafGeo = new THREE.PlaneGeometry(0.13, 0.085)
  const leafLists = [[], [], []]
  for (const tp of treePos) {
    const n = 7 + Math.floor(rnd() * 8)
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2
      const r = 0.7 + rnd() * 2.4
      const lx = tp.x + Math.cos(a) * r, lz = tp.z + Math.sin(a) * r
      // so cai onde o piso e o mesmo da arvore (nao "flutua" na rua)
      if (Math.abs(groundY(lx, lz) - tp.y) > 0.01) continue
      leafLists[Math.floor(rnd() * 3)].push({ x: lx, y: tp.y + 0.006, z: lz, ry: rnd() * 6.28 })
    }
  }
  leafLists.forEach((list, i) => {
    if (!list.length) return
    const im = new THREE.InstancedMesh(leafGeo, leafMats[i], list.length)
    list.forEach((l, k) => {
      dummy.position.set(l.x, l.y, l.z)
      dummy.rotation.set(-Math.PI / 2, 0, l.ry)
      dummy.scale.set(0.7 + rnd() * 0.6, 0.7 + rnd() * 0.6, 1)
      dummy.updateMatrix()
      im.setMatrixAt(k, dummy.matrix)
    })
    im.castShadow = false; im.receiveShadow = true
    addLive(im)
  })

  // --- lixo perto das lixeiras e na sarjeta --------------------------------
  const litterMat = solid(0xb8b2a2, 0.97)
  const litterGeo = new THREE.BoxGeometry(0.11, 0.015, 0.085)
  const litter = []
  for (const tc of trashPos) {
    const n = 1 + Math.floor(rnd() * 2)
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 1.0
      const lx = tc.x + Math.cos(a) * r, lz = tc.z + Math.sin(a) * r
      if (Math.abs(groundY(lx, lz) - tc.y) > 0.01) continue
      litter.push({ x: lx, y: tc.y + 0.012, z: lz, ry: rnd() * 6.28, s: 0.6 + rnd() * 0.5 })
    }
  }
  // papeis parados na sarjeta das avenidas centrais
  for (let i = 0; i < 26; i++) {
    const along = (rnd() - 0.5) * 2 * (BO - 8)
    const s1 = rnd() > 0.5 ? 1 : -1
    const across = s1 * (RH + 0.25 + rnd() * 0.5)
    const flip = rnd() > 0.5
    const lx = flip ? across : along, lz = flip ? along : across
    litter.push({ x: lx, y: ROAD_Y + 0.014, z: lz, ry: rnd() * 6.28, s: 0.6 + rnd() * 0.5 })
  }
  if (litter.length) {
    const im = new THREE.InstancedMesh(litterGeo, litterMat, litter.length)
    litter.forEach((l, k) => {
      dummy.position.set(l.x, l.y, l.z)
      dummy.rotation.set((rnd() - 0.5) * 0.5, l.ry, (rnd() - 0.5) * 0.5)
      dummy.scale.set(l.s, 1, l.s)
      dummy.updateMatrix()
      im.setMatrixAt(k, dummy.matrix)
    })
    im.castShadow = true; im.receiveShadow = true
    addLive(im)
  }

  // -------------------------------------------------------------------------
  // 8. BECO ATRAS DOS PREDIOS DO QUADRANTE SE
  // -------------------------------------------------------------------------
  const alleyMat = stdMat('city:alley', {
    map: tiled(asphaltTex(1), 0.3, 0.3), color: 0x8f8b83, roughness: 0.98,
  })
  // mesma lista que groundY usa -> topo exatamente em LEVELS.ALLEY
  const alleyPads = ALLEY_PADS
  for (const p of alleyPads) {
    add(slabFromShape(rectShape(p[0], p[1], p[2], p[3]), ALLEY_Y, alleyMat))
  }
  // pocas d'agua (juice barato: reflexo escuro)
  // reusa o material de poça da rua (ja vem com polygonOffset)
  const puddleMat = matPuddle
  // plano (nao disco): o contorno da poça vem do alpha da textura
  const puddleGeo = new THREE.PlaneGeometry(1, 1)
  for (let i = 0; i < 6; i++) {
    const pm = new THREE.Mesh(puddleGeo, puddleMat)
    pm.rotation.set(-Math.PI / 2, 0, rnd() * 3)
    const p = alleyPads[Math.floor(rnd() * 3)]
    pm.position.set(p[0] + rnd() * (p[1] - p[0]), ALLEY_Y + 0.006, p[2] + rnd() * (p[3] - p[2]))
    pm.scale.set(0.9 + rnd() * 1.5, 0.7 + rnd() * 1.0, 1)
    pm.receiveShadow = true
    add(pm)
  }

  // caixotes + lixeiras + cacamba
  const alleyCrates = [
    [16.4, 32.4, 0.3], [17.5, 33.1, -0.6], [16.9, 31.2, 0.9], [16.6, 32.4, 1.2],
    [28.0, 33.0, 0.2], [29.1, 32.6, -0.4], [42.0, 30.6, 0.5], [43.2, 30.3, -0.2],
    [31.5, 31.0, 0.7], [48.5, 31.2, -0.5],
  ]
  alleyCrates.forEach((c, i) => {
    // os empilhados vao EXATAMENTE em cima do engradado 3 posicoes atras
    // (antes ficavam boiando ao lado) e o colisor cobre a pilha toda
    const stacked = i % 4 === 3
    const bx = stacked ? alleyCrates[i - 3][0] : c[0]
    const bz = stacked ? alleyCrates[i - 3][1] : c[1]
    const o = placeProp('makeCrate', bx, bz, c[2])
    if (o && stacked) o.position.y += CRATE_H
  })
  // o corredor estreito (x 34..36) fica livre pro jogador passar
  for (const t of [[19.0, 31.0, Math.PI], [24.5, 32.8, 0], [40.0, 29.4, Math.PI], [50.5, 29.2, Math.PI]]) {
    placeProp('makeTrashCan', t[0], t[1], t[2])
  }

  // cacamba de lixo (dumpster) procedural -- nao existe prop pra isso
  function dumpster(x, z, ry) {
    const g2 = new THREE.Group()
    g2.position.set(x, groundY(x, z), z)
    g2.rotation.y = ry
    const green = solid(0x2f6b3f, 0.85, 0.15)
    const dark = solid(0x1f4a2c, 0.85, 0.15)
    g2.add(box(2.9, 1.25, 1.5, green, 0, 0.72, 0))
    g2.add(box(3.0, 0.12, 1.6, dark, 0, 1.36, 0))
    g2.add(box(1.42, 0.1, 1.5, dark, -0.74, 1.44, -0.06))
    g2.add(box(1.42, 0.1, 1.5, dark, 0.74, 1.46, 0.06))
    g2.add(box(3.05, 0.16, 0.16, dark, 0, 0.95, 0.77))
    const wheel = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10)
    const wm = solid(0x1a1a1e, 0.9)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wl = new THREE.Mesh(wheel, wm)
      wl.rotation.z = Math.PI / 2
      wl.position.set(sx * 1.2, 0.16, sz * 0.6)
      wl.castShadow = true; wl.receiveShadow = true
      g2.add(wl)
    }
    add(g2)
    colBox(x, z, ry ? 1.7 : 3.1, ry ? 3.1 : 1.7, 'dumpster')
    occBox(x, z, ry ? 1.7 : 3.1, ry ? 3.1 : 1.7, 1.6, 'dumpster')
  }
  dumpster(21.5, 32.2, 0)
  dumpster(46.5, 30.0, 0)

  // grafite na parede do beco
  // 8 cm da parede: 2 cm nao bastavam e o grafite chapiscava contra o tijolo
  for (const gf of [[20, 30.08, 0, 4], [44, 28.08, 0, 7]]) {
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), paintingMat(gf[3], 'abstract'))
    gm.position.set(gf[0], 2.0, gf[1])
    gm.rotation.y = gf[2]
    add(gm)
  }

  // --- luminaria de parede do beco -----------------------------------------
  // braco + gaiola de protecao + cupula + lampada (antes eram dois cubos)
  const cageBarGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5)
  const cageRingGeo = new THREE.TorusGeometry(0.155, 0.014, 5, 14)
  function alleyLamp(x, wallZ, lit) {
    const g2 = new THREE.Group()
    g2.position.set(x, 3.1, wallZ)
    const iron = solid(0x33312e, 0.65, 0.5)
    const bulbMat = claimLampMat(emissive(0xffcf8a, 2.2))

    // placa de fixacao na parede + braco inclinado pra fora
    g2.add(box(0.2, 0.34, 0.05, iron, 0, 0.02, 0.03))
    const arm = cyl(0.035, 0.035, 0.6, iron, 8)
    arm.rotation.x = Math.PI / 2 - 0.5
    arm.position.set(0, 0.16, 0.26)
    g2.add(arm)
    // tirante segurando o braco
    const stay = cyl(0.018, 0.018, 0.42, iron, 6)
    stay.rotation.x = Math.PI / 2 + 0.75
    stay.position.set(0, -0.06, 0.16)
    g2.add(stay)

    // cupula conica esmaltada
    const hood = cyl(0.07, 0.3, 0.2, solid(0x4a4640, 0.7, 0.25), 16)
    hood.position.set(0, 0.34, 0.5)
    g2.add(hood)
    const hoodLip = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.02, 5, 16), iron)
    hoodLip.rotation.x = -Math.PI / 2
    hoodLip.position.set(0, 0.24, 0.5)
    g2.add(hoodLip)

    // lampada
    const bulb = sphere(0.1, bulbMat, 10)
    bulb.scale.y = 1.25
    bulb.castShadow = false
    bulb.position.set(0, 0.13, 0.5)
    g2.add(bulb)

    // gaiola: dois aros e barras finas em volta da lampada
    for (const ry of [0.24, -0.06]) {
      const ring = new THREE.Mesh(cageRingGeo, iron)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(0, ry, 0.5)
      ring.castShadow = false
      g2.add(ring)
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const bar = new THREE.Mesh(cageBarGeo, iron)
      bar.position.set(Math.cos(a) * 0.15, 0.09, 0.5 + Math.sin(a) * 0.15)
      bar.castShadow = false
      g2.add(bar)
    }
    // fundo da gaiola
    const capG = new THREE.Mesh(cageRingGeo, iron)
    capG.rotation.x = -Math.PI / 2
    capG.scale.setScalar(0.45)
    capG.position.set(0, -0.06, 0.5)
    g2.add(capG)

    if (lit) {
      const pl = new THREE.PointLight(0xffc98a, 5.5, 9, 2)
      pl.position.set(0, 0.0, 0.5)
      if (claimLight(pl)) g2.add(pl)
    }
    add(g2)
  }
  alleyLamp(18.0, 30.06, true)
  alleyLamp(38.0, 28.06, false)

  // -------------------------------------------------------------------------
  // 9. MURO COM GRAFITE (lateral leste da mercearia, de frente pra avenida)
  // -------------------------------------------------------------------------
  // Por que aqui: a parede leste da mercearia e a unica superficie grande e
  // LISA da cidade virada pra uma rua -- e, como o sol nasce sempre do lado
  // +X neste ciclo, ela e a unica que fica iluminada o dia inteiro. Grafite em
  // parede na sombra nao se le.
  const MURO = {
    x: -13.55,        // centro da espessura; frente (pintada) olhando pra +X
    z0: -30, z1: -16, // 14 m de comprimento
    h: 3.0,
    esp: 0.30,
    base: SHOP_Y,     // o lote da mercearia esta no nivel da calcada
  }
  {
    const mz = (MURO.z0 + MURO.z1) / 2
    const comp = MURO.z1 - MURO.z0
    const concreto = stdMat('city:muro-concreto', {
      map: tiled(concreteTex(1), 4, 1.1), color: 0x9f9b93, roughness: 0.97,
    })
    // corpo
    add(box(MURO.esp, MURO.h, comp, concreto, MURO.x, MURO.base + MURO.h / 2, mz))
    // capa do topo: transborda 7 cm de cada lado, e o que faz ler como MURO
    // (uma caixa sem capa le como bloco de concreto solto no chao)
    add(box(MURO.esp + 0.14, 0.16, comp + 0.2, solid(0x8b877f, 0.9),
      MURO.x, MURO.base + MURO.h + 0.08, mz))
    // rodape saliente e mais escuro: a sujeira que sobe do chao por capilaridade
    add(box(MURO.esp + 0.10, 0.28, comp, solid(0x6d6a63, 0.98),
      MURO.x, MURO.base + 0.14, mz))

    // A pintura e um plano na frente do corpo, nao a textura da caixa: a caixa
    // usaria a MESMA imagem nas 6 faces e o grafite apareceria no topo e nos
    // fundos. 4 cm de folga + polygonOffset matam qualquer chapisco.
    const pintura = new THREE.Mesh(
      new THREE.PlaneGeometry(comp, MURO.h),
      stdMat('city:muro-grafite', Object.assign({
        map: grafiteTex(), roughness: 0.9,
      }, DECAL_OFF)),
    )
    pintura.rotation.y = Math.PI / 2   // normal pra +X (a rua)
    pintura.position.set(MURO.x + MURO.esp / 2 + 0.04, MURO.base + MURO.h / 2, mz)
    pintura.castShadow = false
    pintura.receiveShadow = true
    add(pintura)

    col(MURO.x - 0.3, MURO.x + 0.3, MURO.z0 - 0.15, MURO.z1 + 0.15, 'muro')
    occBox(MURO.x, mz, 0.6, comp + 0.3, MURO.base + MURO.h + 0.16, 'muro')
  }

  // -------------------------------------------------------------------------
  // COLISORES DE BORDA (o jogador nao sai do mapa)
  // -------------------------------------------------------------------------
  const EDGE = ROUT + SWW + 2
  col(-EDGE - 4, -EDGE, -EDGE - 4, EDGE + 4, 'edge')
  col(EDGE, EDGE + 4, -EDGE - 4, EDGE + 4, 'edge')
  col(-EDGE - 4, EDGE + 4, -EDGE - 4, -EDGE, 'edge')
  col(-EDGE - 4, EDGE + 4, EDGE, EDGE + 4, 'edge')

  // -------------------------------------------------------------------------
  // UPDATE (animacoes leves do modulo)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // ANCORAS DE NEVE (medidas ANTES do forno)
  // -------------------------------------------------------------------------
  // Depois de bake() as arvores viram pedacos de um mesh gigante e nao da mais
  // pra perguntar "onde termina a copa desta arvore". Entao a medida sai daqui,
  // enquanto cada arvore ainda e um objeto: caixa envolvente -> centro, raio e
  // altura da copa. world/neve.js empilha os discos brancos em cima disso.
  const caixaTmp = new THREE.Box3()
  const neveArvores = []
  for (const o of treeObjs) {
    if (!o || !o.parent) continue
    o.updateMatrixWorld(true)
    caixaTmp.setFromObject(o)
    if (!isFinite(caixaTmp.min.y) || !isFinite(caixaTmp.max.y)) continue
    neveArvores.push({
      x: o.position.x, z: o.position.z,
      base: caixaTmp.min.y, topo: caixaTmp.max.y,
      raio: Math.max(caixaTmp.max.x - caixaTmp.min.x, caixaTmp.max.z - caixaTmp.min.z) * 0.5,
    })
  }
  treeObjs.length = 0

  // funde tudo que e estatico -> derruba drasticamente os draw calls.
  // Objetos com userData.update / setPhase saem do forno inteiros.
  bake()

  // ciclo do semaforo: verde -> amarelo -> vermelho (fases de props.js)
  const TL_CYCLE = 15.2
  function phaseAt(time) {
    const u = ((time % TL_CYCLE) + TL_CYCLE) % TL_CYCLE
    if (u < 6.0) return 2
    if (u < 7.6) return 1
    return 0
  }

  let t = 0
  function update(dt) {
    t += dt
    // animacoes dos props resgatados do forno (ventoinha de AC, relogio...)
    for (let i = 0; i < animUpdates.length; i++) animUpdates[i](dt)
    // semaforos: pares cruzados ficam em contrafase
    for (let i = 0; i < phaseSetters.length; i++) {
      const s = phaseSetters[i]
      const p = phaseAt(t + (i % 2) * (TL_CYCLE / 2))
      if (p !== s.last) { s.last = p; s.set(p) }
    }
    // poste de barbeiro girando
    poleTex.offset.y = (poleTex.offset.y - dt * 0.28) % 1

    // --- agua da fonte -----------------------------------------------------
    // 1) superficies: senoides radiais + direcionais deformando os vertices
    for (let s = 0; s < waterSurfaces.length; s++) {
      const m = waterSurfaces[s]
      const u = m.userData
      const pos = m.geometry.attributes.position
      const base = u.base
      const amp = u.amp, fq = u.freq, sp = u.speed
      for (let i = 0, n = pos.count; i < n; i++) {
        const i3 = i * 3
        const bx = base[i3], bz = base[i3 + 2]
        const r = Math.sqrt(bx * bx + bz * bz)
        const y = Math.sin(r * fq - t * sp) * amp
          + Math.sin(bx * fq * 0.68 + t * sp * 0.75) * amp * 0.55
          + Math.sin(bz * fq * 0.93 - t * sp * 1.25) * amp * 0.45
        pos.array[i3 + 1] = y
      }
      pos.needsUpdate = true
      m.geometry.computeVertexNormals()
    }
    // 2) jatos
    const p = 1 + Math.sin(t * 5.5) * 0.06
    jet.scale.set(p, 1 + Math.sin(t * 3.1) * 0.05, p)
    jetTop.position.y = 4.45 + Math.sin(t * 3.1) * 0.07
    for (let i = 0; i < falls.length; i++) {
      falls[i].scale.y = 1 + Math.sin(t * 4 + i) * 0.08
    }
    for (let i = 0; i < jetArcs.length; i++) {
      const s = 1 + Math.sin(t * 3.4 + i * 1.1) * 0.12
      jetArcs[i].scale.set(s, 1, s)
    }
    // 3) gotas: spray nos arcos + respingo balistico na borda
    for (let i = 0; i < drops.length; i++) {
      const dd = drops[i]
      const u = ((t / dd.dur) + dd.t0) % 1
      let sc = dd.s
      if (dd.kind === 0) {
        jetCurves[dd.arc].getPoint(Math.min(0.999, u), dropTmp)
        dropTmp.x += dd.off
        dropTmp.z += dd.side
        dropTmp.y += Math.sin(u * 9 + i) * 0.03
        sc *= 0.55 + u * 0.7        // a gota "engorda" enquanto cai
      } else {
        const tau = u * dd.dur
        const r = dd.r0 + dd.vr * tau
        const y = 0.62 + dd.vy * tau - 4.9 * tau * tau
        dropTmp.set(dd.ca * r, Math.max(0.6, y), dd.sa * r)
        sc *= 1 - u * 0.55
      }
      dropDummy.position.copy(dropTmp)
      dropDummy.rotation.set(u * 6.2, i, u * 4.1)
      dropDummy.scale.setScalar(Math.max(0.05, sc))
      dropDummy.updateMatrix()
      dropIM.setMatrixAt(i, dropDummy.matrix)
    }
    dropIM.instanceMatrix.needsUpdate = true
    // 4) espuma pulsando (a borda "respira" com as ondas)
    foams[0].scale.setScalar(1 + Math.sin(t * 2.2) * 0.02)
    foams[0].position.y = 0.585 + Math.sin(t * 2.2) * 0.014
    foams[1].scale.setScalar(1 + Math.sin(t * 5.1 + 1.3) * 0.11)
    foams[1].position.y = 0.588 + Math.sin(t * 4.4) * 0.022
    foams[2].position.y = 0.578 + Math.sin(t * 1.6 + 2.1) * 0.014
    matFoam.opacity = 0.3 + Math.sin(t * 3.3) * 0.09
  }

  return {
    group, colliders, interactables, update, occluders,
    // contrato novo: altura de piso + luzes/materiais pro ciclo dia/noite
    groundY,
    lampLights,
    lampMaterials: Array.from(lampMatSet),
    /* Onde a neve pode se acumular. Medido aqui porque so aqui as arvores e os
       arbustos ainda existem como objetos separados (ver ANCORAS DE NEVE). */
    neveAncoras: {
      arvores: neveArvores,
      arbustos: bushPos,
      postes: lampPos.slice(),
      lixeiras: trashPos.slice(),
      bancos: benchPos.slice(),
    },
  }
}
