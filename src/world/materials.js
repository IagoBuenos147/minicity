import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Paleta + fabrica de materiais/texturas procedurais (nada de assets externos).
// Tudo e cacheado por chave, entao pode chamar a vontade.
// ---------------------------------------------------------------------------

export const PALETTE = {
  skin: 0xf3d9bd,
  skinShadow: 0xd9b795,
  asphalt: 0x3a3a40,
  asphaltLine: 0xd8c96a,
  sidewalk: 0xb9b5ad,
  curb: 0x8f8b84,
  grass: 0x5f8f4b,
  grassDark: 0x4a7439,
  wood: 0x8a5a34,
  woodDark: 0x53341d,
  metal: 0x9aa0a6,
  chrome: 0xd6dadd,
  glass: 0x9fd4e8,
  white: 0xf4f4f2,
  black: 0x1a1a1e,
  red: 0xd63b3b,
  blue: 0x3b6fd6,
  green: 0x3ba05a,
  yellow: 0xe8c33d,
}

const _mats = new Map()
const _texs = new Map()

/** MeshStandardMaterial cacheado. key deve ser unica por combinacao de params. */
export function stdMat(key, params) {
  if (_mats.has(key)) return _mats.get(key)
  const m = new THREE.MeshStandardMaterial(params)
  _mats.set(key, m)
  return m
}

/** Atalho: material colorido simples. */
export function solid(color, rough = 0.85, metal = 0.0, extra = {}) {
  // Chave barata: serializar uma Texture com JSON.stringify dispara toDataURL()
  // do canvas a cada chamada, o que custava >100 encodes PNG no carregamento.
  let sig = ''
  for (const k in extra) {
    const v = extra[k]
    sig += '|' + k + '=' + (v && v.isTexture ? v.uuid : v && typeof v === 'object' ? (v.uuid || '?') : v)
  }
  const key = 'solid:' + color + ':' + rough + ':' + metal + ':' + sig
  return stdMat(key, Object.assign({ color, roughness: rough, metalness: metal }, extra))
}

/** Material emissivo (letreiros, telas, lampadas). */
export function emissive(color, intensity = 1.4) {
  return stdMat('emi:' + color + ':' + intensity, {
    color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5,
  })
}

/** Vidro translucido barato (sem refracao). */
export function glass(tint = 0xbfe4f2, opacity = 0.28) {
  return stdMat('glass:' + tint + ':' + opacity, {
    color: tint, transparent: true, opacity, roughness: 0.08, metalness: 0.0,
    side: THREE.DoubleSide, depthWrite: false,
  })
}

// --- Texturas procedurais --------------------------------------------------

function makeCanvas(size, draw) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  draw(g, size)
  return c
}

function toTex(canvas, repeat, aniso) {
  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso || 8
  return t
}

function noise(g, size, amount, alpha) {
  const img = g.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount
    d[i] += n; d[i + 1] += n; d[i + 2] += n
    if (alpha !== undefined) d[i + 3] = alpha
  }
  g.putImageData(img, 0, 0)
}

/** Textura cacheada. drawFn(ctx, size). */
export function tex(key, size, drawFn, repeat = 1) {
  const k = key + ':' + repeat
  if (_texs.has(k)) return _texs.get(k)
  const t = toTex(makeCanvas(size, drawFn), repeat)
  _texs.set(k, t)
  return t
}

function shade(hex, mul) {
  const c = new THREE.Color(hex)
  c.multiplyScalar(mul)
  return '#' + c.getHexString()
}

export function asphaltTex(repeat = 8) {
  return tex('asphalt', 256, (g, s) => {
    g.fillStyle = '#3b3b41'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 2600; i++) {
      const v = 40 + Math.random() * 60
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 4) + ',' + (Math.random() * 0.5) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2)
    }
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 30
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, 'rgba(20,20,24,0.35)')
      grd.addColorStop(1, 'rgba(20,20,24,0)')
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    noise(g, s, 14)
  }, repeat)
}

export function concreteTex(repeat = 6) {
  return tex('concrete', 256, (g, s) => {
    g.fillStyle = '#bcb8b0'; g.fillRect(0, 0, s, s)
    noise(g, s, 26)
    g.strokeStyle = 'rgba(120,116,110,0.55)'; g.lineWidth = 2
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * s
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke()
      g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke()
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = 'rgba(150,146,140,' + (Math.random() * 0.4) + ')'
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 3, 0, 7); g.fill()
    }
  }, repeat)
}

export function brickTex(repeat = 4, base = '#a9603f', mortar = '#cfc7b8') {
  return tex('brick:' + base + ':' + mortar, 256, (g, s) => {
    g.fillStyle = mortar; g.fillRect(0, 0, s, s)
    const rows = 10, bh = s / rows
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (s / 8)
      for (let c = -1; c < 8; c++) {
        const x = c * (s / 4) + off, y = r * bh
        const v = 0.82 + Math.random() * 0.3
        g.fillStyle = shade(base, v)
        g.fillRect(x + 2, y + 2, s / 4 - 4, bh - 4)
      }
    }
    noise(g, s, 16)
  }, repeat)
}

export function plasterTex(repeat = 3, base = '#cfc3ae') {
  return tex('plaster:' + base, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.12) + ')'
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, Math.random() * 8, 0, 7); g.fill()
    }
    noise(g, s, 18)
  }, repeat)
}

export function woodTex(repeat = 2, base = '#8b5a33') {
  return tex('wood:' + base, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * s
      g.strokeStyle = 'rgba(' + (Math.random() > 0.5 ? '60,36,18' : '180,130,80') + ',' + (Math.random() * 0.35) + ')'
      g.lineWidth = 1 + Math.random() * 3
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 3)
      g.stroke()
    }
    noise(g, s, 10)
  }, repeat)
}

export function tileTex(repeat = 8, a = '#e9e6df', b = '#2c2c31') {
  return tex('tile:' + a + ':' + b, 256, (g, s) => {
    const n = 4, c = s / n
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? b : a
      g.fillRect(x * c, y * c, c, c)
    }
    g.strokeStyle = 'rgba(120,120,120,0.35)'; g.lineWidth = 2
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.stroke()
      g.beginPath(); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke()
    }
    noise(g, s, 8)
  }, repeat)
}

export function grassTex(repeat = 12) {
  return tex('grass', 256, (g, s) => {
    g.fillStyle = '#5c8b48'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 4000; i++) {
      const v = Math.random()
      g.strokeStyle = v > 0.5
        ? 'rgba(110,150,80,' + Math.random() + ')'
        : 'rgba(60,100,50,' + Math.random() + ')'
      const x = Math.random() * s, y = Math.random() * s
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 2 - Math.random() * 4); g.stroke()
    }
  }, repeat)
}

// --- Helpers de geometria --------------------------------------------------

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true; m.receiveShadow = true
  return m
}

export function cyl(rTop, rBot, h, material, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material)
  m.castShadow = true; m.receiveShadow = true
  return m
}

export function sphere(r, material, seg = 20) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, Math.floor(seg / 2))), material)
  m.castShadow = true; m.receiveShadow = true
  return m
}

export function plane(w, d, material, rotX = -Math.PI / 2) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material)
  m.rotation.x = rotX
  m.receiveShadow = true
  return m
}

/** Caixa com cantos arredondados (bem util pro visual "cartoon"). */
export function roundedBox(w, h, d, r = 0.08, material, seg = 3) {
  const shape = new THREE.Shape()
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001)
  const x = -w / 2, y = -h / 2
  shape.moveTo(x + rr, y)
  shape.lineTo(x + w - rr, y); shape.quadraticCurveTo(x + w, y, x + w, y + rr)
  shape.lineTo(x + w, y + h - rr); shape.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  shape.lineTo(x + rr, y + h); shape.quadraticCurveTo(x, y + h, x, y + h - rr)
  shape.lineTo(x, y + rr); shape.quadraticCurveTo(x, y, x + rr, y)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - r * 0.6), bevelEnabled: true,
    bevelThickness: r * 0.3, bevelSize: r * 0.3, bevelSegments: seg, curveSegments: seg + 2,
  })
  geo.center()
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true; m.receiveShadow = true
  return m
}

/** Texto -> textura, pra placas e letreiros. Retorna material com alpha. */
export function textPlaneMat(text, opts = {}) {
  const w = opts.w || 1024
  const h = opts.h || 256
  const bg = opts.bg || 'rgba(0,0,0,0)'
  const color = opts.color || '#ffffff'
  const font = opts.font || 'bold 120px "Trebuchet MS", sans-serif'
  const stroke = opts.stroke || null
  const glow = opts.glow || null
  const key = ['text', text, w, h, bg, color, font, stroke, glow,
    opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.25].join('|')
  if (_mats.has(key)) return _mats.get(key)
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')
  g.fillStyle = bg; g.fillRect(0, 0, w, h)
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'
  if (glow) { g.shadowColor = glow; g.shadowBlur = 34 }
  g.fillStyle = color
  g.fillText(text, w / 2, h / 2, w * 0.92)
  if (stroke) {
    g.shadowBlur = 0; g.lineWidth = 5; g.strokeStyle = stroke
    g.strokeText(text, w / 2, h / 2, w * 0.92)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const m = new THREE.MeshStandardMaterial({
    map: t, transparent: true, roughness: 0.6,
    emissive: 0xffffff, emissiveMap: t,
    emissiveIntensity: opts.emissiveIntensity !== undefined ? opts.emissiveIntensity : 0.25,
  })
  _mats.set(key, m)
  return m
}

/** Quadro/poster: retorna material com uma "pintura" procedural. */
export function paintingMat(seed = 0, kind = 'abstract') {
  const key = 'paint:' + seed + ':' + kind
  if (_mats.has(key)) return _mats.get(key)
  const c = document.createElement('canvas'); c.width = 512; c.height = 512
  const g = c.getContext('2d')
  let r = seed * 9301 + 49297
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280 }
  if (kind === 'barber') {
    g.fillStyle = '#f0e6d2'; g.fillRect(0, 0, 512, 512)
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 6
    g.beginPath(); g.arc(256, 210, 110, Math.PI, 0); g.stroke()
    g.fillStyle = '#3a2a1c'
    g.beginPath(); g.ellipse(256, 250, 92, 120, 0, 0, 7); g.fill()
    g.fillStyle = '#f3d9bd'
    g.beginPath(); g.ellipse(256, 268, 74, 100, 0, 0, 7); g.fill()
    g.fillStyle = '#2b2b2b'
    g.beginPath(); g.ellipse(230, 252, 9, 12, 0, 0, 7); g.fill()
    g.beginPath(); g.ellipse(282, 252, 9, 12, 0, 0, 7); g.fill()
    g.fillRect(206, 300, 100, 14)
    g.font = 'bold 44px "Trebuchet MS", sans-serif'
    g.textAlign = 'center'; g.fillStyle = '#8a2b2b'
    g.fillText('CLASSIC CUT', 256, 430)
  } else if (kind === 'sale') {
    g.fillStyle = '#ffe9a8'; g.fillRect(0, 0, 512, 512)
    g.fillStyle = '#d63b3b'
    g.beginPath(); g.arc(256, 220, 150, 0, 7); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 120px "Trebuchet MS", sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('50%', 256, 210)
    g.fillStyle = '#3a3a3a'; g.font = 'bold 56px "Trebuchet MS", sans-serif'
    g.fillText('PROMOCAO', 256, 420)
  } else {
    const hue = Math.floor(rnd() * 360)
    g.fillStyle = 'hsl(' + hue + ',35%,82%)'; g.fillRect(0, 0, 512, 512)
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'hsla(' + ((hue + rnd() * 120) | 0) + ',' + (40 + rnd() * 50) + '%,' + (30 + rnd() * 45) + '%,' + (0.35 + rnd() * 0.5) + ')'
      const x = rnd() * 512, y = rnd() * 512, w = 40 + rnd() * 190, h = 40 + rnd() * 190
      if (rnd() > 0.5) g.fillRect(x, y, w, h)
      else { g.beginPath(); g.ellipse(x, y, w / 2, h / 2, rnd() * 3, 0, 7); g.fill() }
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 })
  _mats.set(key, m)
  return m
}
