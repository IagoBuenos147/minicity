// Fotos + MEDIDA das cartas 3D na mesa. Existe por causa de um pedido que o
// olho nao resolve: "o brilho das cartas ta muito claro". Claro QUANTO? O bloom
// do engine (src/core/engine.js) corta em luminancia 0.85 no espaco LINEAR da
// cena, ANTES do tone mapping — entao a pergunta tem resposta numerica, e esta
// ferramenta le o numero em vez de chutar.
//
//   node tools/shot-cartas.mjs             -> mesa de poker
//   node tools/shot-cartas.mjs blackjack   -> a outra mesa
//
// O QUE ELA MEDE, e por que assim:
//
// O UnrealBloomPass roda entre o RenderPass e o OutputPass, ou seja, ele ve a
// cena em HDR linear (o composer usa render target HalfFloat) e nao a imagem
// tonemapeada que aparece na tela. O high-pass dele e
//     v = dot(rgb, vec3(0.299, 0.587, 0.114))
//     alpha = smoothstep(0.85, 0.86, v)
// Logo: medir a tela com toDataURL responderia a pergunta errada. Aqui a cena e
// desenhada num render target HalfFloat proprio (o MESMO par toneMapping=None +
// colorSpace linear que o composer ja usa, entao nenhum shader recompila) e os
// pixels voltam crus. 'v' e calculado com os pesos exatos do high-pass.
//
// A REGIAO medida e o quadrilatero da FACE da carta projetado na tela, encolhido
// 14% pro centro pra nao pegar o feltro na borda. Medir um retangulo da tela
// pegaria o feltro e a ficha e o numero nao diria nada sobre a carta.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const QUAL = (process.argv[2] || 'poker').toLowerCase()
const TAG = process.argv[3] || 'agora'

// Neste ambiente so existe o Edge x86; os caminhos vao com barra normal porque
// contrabarra em string JS ja custou uma corrida perdida aqui.
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}

const PORT = 9700 + (process.pid % 250)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cartas-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function waitForDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const browser = await puppeteer.connect({ browserWSEndpoint: await waitForDebugger() })
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })
const pre = (QUAL === 'poker' ? 'cartas-pk-' : 'cartas-bj-') + TAG + '-'

function salvarDataURL(nome, dataURL) {
  if (!dataURL) return null
  const f = path.join(dir, pre + nome + '.png')
  fs.writeFileSync(f, Buffer.from(dataURL.split(',')[1], 'base64'))
  console.log('  ' + f)
  return f
}

try {
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text()) })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.setViewport({ width: 1280, height: 720 })

  // HMR DESLIGADO A MARTELO. Ha outras sessoes editando este repositorio ao
  // mesmo tempo, e cada save do vite recarrega a pagina: o evaluate seguinte
  // morre com "Execution context was destroyed" e a corrida inteira se perde no
  // meio da medida. Bloquear o /@vite/client so tira o cliente de HMR — os
  // modulos do jogo continuam carregando normalmente.
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    if (req.url().indexOf('@vite/client') >= 0) req.abort().catch(() => {})
    else req.continue().catch(() => {})
  })

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  const espera = (ms) => new Promise((r) => setTimeout(r, ms))

  // 1) menu -> mesa
  await page.evaluate((qual) => {
    const G = window.__game
    G.fluxo.jogar()
    G.carteira.ganharFichas(20000)
    G.carteira.ganharOuro(20000)
    const anc = G.casinoMundo.mesas[qual]
    G.player.setMode('third')
    G.player.teleport(anc.centro.x, anc.centro.z - 1.6, 0)
  }, QUAL)
  await espera(900)
  // HMR do vite pode recarregar a pagina no meio; esperar de novo custa nada
  await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 60000 })
  await page.evaluate((qual) => {
    const G = window.__game
    if (qual === 'poker') G.cassino.abrirPoker()
    else G.cassino.abrirBlackjack()
  }, QUAL)
  await espera(1800)
  // paralaxe de ponteiro: sem um mousemove a lente fica torta pro canto
  await page.mouse.move(640, 360)
  await espera(600)

  // blackjack nao reparte sozinho
  if (QUAL !== 'poker') {
    await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      const b = bs.find((x) => x.offsetParent && !x.disabled && /DISTRIBUIR/.test(x.textContent.toUpperCase()))
      if (b) b.click()
    })
  }

  // 2) espera a carta ESCORAR. Em headless com swiftshader o jogo anda a 2-3 fps
  //    e o clamp de dt da mesa faz a animacao correr a um quinto do relogio:
  //    poll no estado, nunca sleep cravado.
  const estadoCartas = () => page.evaluate(() => {
    const G = window.__game
    let grupo = null
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('mesa3d-') === 0 && o.visible) grupo = o })
    const out = []
    if (!grupo) return out
    grupo.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      const dx = bb.max.x - bb.min.x, dz = bb.max.z - bb.min.z
      if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
      const p = o.parent
      out.push({ z: +p.position.z.toFixed(3), rx: +p.rotation.x.toFixed(3), rz: +o.rotation.z.toFixed(3) })
    })
    return out
  })
  //    TRES leituras iguais seguidas, e nao uma leitura boa nem duas: a carta
  //    passa por -0.80 subindo, e a 2-3 fps duas leituras a 500 ms de distancia
  //    podem cair no MESMO quadro e mentir que a mesa parou. Foi assim que uma
  //    rodada mediu a mao a 94% da subida e outra a 100%, com numeros
  //    diferentes. Como a luz do salao vem de cima, carta deitada mede mais
  //    claro que carta escorada — medir no meio da subida da um numero que nao
  //    existe em jogo nenhum.
  //
  //    A espera final de 2,5 s tambem nao e folga: a ficha que acabou de pousar
  //    acende um flash de 0,15 s (mesa-3d.js) e ela cai NA FRENTE da metade de
  //    baixo da carta. Uma medida tirada nesse instante devolvia max 1.36 com
  //    p99 0.61 — o pico nao era a carta, era a ficha por cima dela.
  let cartas = []
  let anterior = ''
  let iguais = 0
  for (let i = 0; i < 160; i++) {
    cartas = await estadoCartas()
    const minhas = cartas.filter((c) => c.z < -0.5)
    const chave = JSON.stringify(minhas.map((c) => c.rx))
    iguais = chave === anterior ? iguais + 1 : 0
    anterior = chave
    if (minhas.length >= 2 && minhas.every((c) => c.rx <= -0.85) && iguais >= 2) break
    await espera(500)
  }
  console.log('  cartas na mesa:', JSON.stringify(cartas))
  await espera(2500)

  // 3) A MEDIDA
  const medida = await page.evaluate(() => {
    const G = window.__game
    const r = G.renderer
    const cam = G.camera
    const Vec = G.scene.position.constructor

    // acha as cartas da minha fila (z < -0.5) que estao com a FACE pra cima
    let grupo = null
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('mesa3d-') === 0 && o.visible) grupo = o })
    if (!grupo) return { erro: 'mesa3d nao encontrada' }
    const alvos = []
    grupo.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      const dx = bb.max.x - bb.min.x, dz = bb.max.z - bb.min.z
      if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
      if (o.parent.position.z > -0.5) return
      alvos.push(o)
    })
    if (!alvos.length) return { erro: 'nenhuma carta minha na mesa' }

    const gl = r.getContext()
    const W = gl.drawingBufferWidth
    const H = gl.drawingBufferHeight

    // Render target HalfFloat proprio. NAO recompila shader nenhum: renderizar
    // pra target ja e o caminho que o composer usa todo frame (toneMapping
    // None + espaco linear), entao o cache de programa acerta.
    const RT = G.engine.composer.renderTarget1.constructor
    const rt = new RT(W, H, { type: 1016 /* HalfFloatType */, colorSpace: 'srgb-linear', depthBuffer: true })
    const anterior = r.getRenderTarget()
    r.setRenderTarget(rt)
    r.render(G.scene, cam)
    r.setRenderTarget(anterior)

    const buf = new Uint16Array(W * H * 4)
    let ok = true
    try { r.readRenderTargetPixels(rt, 0, 0, W, H, buf) } catch (e) { ok = false; void e }
    if (!ok) { rt.dispose(); return { erro: 'readRenderTargetPixels falhou' } }

    const h2f = (h) => {
      const s = (h & 0x8000) ? -1 : 1
      const e = (h & 0x7C00) >> 10
      const f = h & 0x03FF
      if (e === 0) return s * 5.9604644775390625e-8 * f
      if (e === 0x1F) return f ? NaN : s * Infinity
      return s * Math.pow(2, e - 15) * (1 + f / 1024)
    }

    // quad da FACE (tampa) projetado, encolhido pro centro
    function quadDaFace(o) {
      const bb = o.geometry.boundingBox
      o.updateWorldMatrix(true, false)
      const locais = [
        [bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
        [bb.max.x, bb.max.y, bb.max.z], [bb.min.x, bb.max.y, bb.max.z],
      ]
      const pts = locais.map((l) => {
        const p = new Vec(l[0], l[1], l[2]).applyMatrix4(o.matrixWorld).project(cam)
        // coordenada de readPixels: origem embaixo a esquerda
        return [(p.x * 0.5 + 0.5) * W, (p.y * 0.5 + 0.5) * H]
      })
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4
      const k = 0.86
      return pts.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k])
    }

    function dentro(q, x, y) {
      let pos = 0, neg = 0
      for (let i = 0; i < 4; i++) {
        const a = q[i], b = q[(i + 1) % 4]
        const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0])
        if (c > 0) pos++; else if (c < 0) neg++
      }
      return pos === 0 || neg === 0
    }

    const saida = { W, H, cartas: [] }
    const quads = []
    for (const o of alvos) {
      const q = quadDaFace(o)
      quads.push(q)
      const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0], q[3][0])))
      const x1 = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0], q[3][0])))
      const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1], q[3][1])))
      const y1 = Math.min(H - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1], q[3][1])))
      const lumas = []
      let acimaLimiar = 0
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!dentro(q, x + 0.5, y + 0.5)) continue
          const i = (y * W + x) * 4
          const R = h2f(buf[i]), Gc = h2f(buf[i + 1]), B = h2f(buf[i + 2])
          const v = 0.299 * R + 0.587 * Gc + 0.114 * B
          if (!Number.isFinite(v)) continue
          lumas.push(v)
          if (v >= 0.85) acimaLimiar++
        }
      }
      lumas.sort((a, b) => a - b)
      const pc = (p) => (lumas.length ? +lumas[Math.min(lumas.length - 1, Math.floor(p * lumas.length))].toFixed(4) : null)
      const max = pc(0.9999)
      const p99 = pc(0.99)
      saida.cartas.push({
        px: lumas.length,
        alturaTelaPct: +(((Math.max(q[0][1], q[1][1], q[2][1], q[3][1]) -
          Math.min(q[0][1], q[1][1], q[2][1], q[3][1])) / H) * 100 / 0.86).toFixed(1),
        max, p99, p90: pc(0.90), mediana: pc(0.5), min: pc(0),
        pctAcima085: +((acimaLimiar / Math.max(1, lumas.length)) * 100).toFixed(2),
        // Um max muito acima do p99 nao e a carta: e alguma coisa POR CIMA dela
        // no quadro (ficha recem-pousada, faisca do pote). O quadrilatero medido
        // e o da face da carta, mas ele nao sabe quem esta na frente — entao a
        // ferramenta avisa em vez de deixar o numero passar por brilho de papel.
        sujo: max > p99 * 1.6,
      })
    }

    // controle: o feltro logo abaixo do centro da tela, pra saber se o salao
    // inteiro esta claro ou se e a carta
    let feltroMax = 0
    for (let y = Math.floor(H * 0.20); y < Math.floor(H * 0.30); y++) {
      for (let x = Math.floor(W * 0.10); x < Math.floor(W * 0.20); x++) {
        const i = (y * W + x) * 4
        const v = 0.299 * h2f(buf[i]) + 0.587 * h2f(buf[i + 1]) + 0.114 * h2f(buf[i + 2])
        if (Number.isFinite(v) && v > feltroMax) feltroMax = v
      }
    }
    saida.feltroMax = +feltroMax.toFixed(4)
    rt.dispose()

    // --- e como a carta SAI NA TELA, depois de ACES + bloom + grade ---------
    // A luminancia linear responde "ela estoura?". Esta segunda leitura responde
    // a outra metade do pedido — "ficou cinza?" — e nao da pra deduzir uma da
    // outra: o ACES comprime tanto no topo que linear 0.62 e linear 1.36 saem a
    // 30 niveis de distancia em 255. Sem este numero, corrigir o bloom no olho
    // levaria direto pra carta de cimento.
    const cv2 = document.createElement('canvas')
    cv2.width = W; cv2.height = H
    const g2 = cv2.getContext('2d', { willReadFrequently: true })
    G.engine.render()
    g2.drawImage(r.domElement, 0, 0, W, H)
    saida.telaSRGB = quads.map((q) => {
      const px = []
      const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0], q[3][0])))
      const x1 = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0], q[3][0])))
      const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1], q[3][1])))
      const y1 = Math.min(H - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1], q[3][1])))
      const dado = g2.getImageData(x0, H - 1 - y1, x1 - x0 + 1, y1 - y0 + 1)
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!dentro(q, x + 0.5, y + 0.5)) continue
          const i = ((y1 - y) * dado.width + (x - x0)) * 4
          px.push([dado.data[i], dado.data[i + 1], dado.data[i + 2]])
        }
      }
      if (!px.length) return null
      const canal = (k) => {
        const v = px.map((p) => p[k]).sort((a, b) => a - b)
        return { p50: v[Math.floor(v.length * 0.5)], p95: v[Math.floor(v.length * 0.95)] }
      }
      const R = canal(0), Gc = canal(1), B = canal(2)
      return { medianaRGB: [R.p50, Gc.p50, B.p50], p95RGB: [R.p95, Gc.p95, B.p95] }
    })
    return saida
  })
  console.log('  MEDIDA (luminancia linear, limiar do bloom = 0.85):')
  console.log('  ' + JSON.stringify(medida))

  // 4) fotos
  await espera(400)
  await page.screenshot({ path: path.join(dir, pre + '01-mesa.png') })
  console.log('  ' + path.join(dir, pre + '01-mesa.png'))

  // recorte 3x em cima das cartas: o toDataURL tem que sair no MESMO bloco
  // sincrono do render, senao o drawing buffer ja foi apagado
  const recorte = await page.evaluate(() => {
    const G = window.__game
    const cam = G.camera
    const Vec = G.scene.position.constructor
    let grupo = null
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('mesa3d-') === 0 && o.visible) grupo = o })
    if (!grupo) return null
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9
    const cv = G.renderer.domElement
    const W = cv.clientWidth, H = cv.clientHeight
    grupo.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      const dx = bb.max.x - bb.min.x, dz = bb.max.z - bb.min.z
      if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
      if (o.parent.position.z > -0.5) return
      o.updateWorldMatrix(true, false)
      for (let i = 0; i < 8; i++) {
        const p = new Vec(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
        p.applyMatrix4(o.matrixWorld).project(cam)
        const sx = (p.x * 0.5 + 0.5) * W, sy = (1 - (p.y * 0.5 + 0.5)) * H
        minX = Math.min(minX, sx); maxX = Math.max(maxX, sx)
        minY = Math.min(minY, sy); maxY = Math.max(maxY, sy)
      }
    })
    if (minX > maxX) return null
    const pad = 24
    const rx = Math.max(0, Math.floor(minX - pad)), ry = Math.max(0, Math.floor(minY - pad))
    const rw = Math.min(W - rx, Math.ceil(maxX - minX + pad * 2))
    const rh = Math.min(H - ry, Math.ceil(maxY - minY + pad * 2))
    G.engine.render()
    const c = document.createElement('canvas')
    c.width = rw * 3; c.height = rh * 3
    const g = c.getContext('2d')
    g.imageSmoothingEnabled = false
    const esc = cv.width / W
    g.drawImage(cv, rx * esc, ry * esc, rw * esc, rh * esc, 0, 0, c.width, c.height)
    return c.toDataURL('image/png')
  })
  salvarDataURL('02-zoom3x', recorte)

  // 5) folha de contato do ATLAS: o desenho cru, sem luz e sem bloom no meio.
  //    E aqui que se julga a QUALIDADE do traco; a foto da mesa julga o brilho.
  const folha = await page.evaluate(() => {
    const G = window.__game
    let tex = null
    G.scene.traverse((o) => {
      if (tex || !o.isMesh || !o.geometry) return
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
      const bb = o.geometry.boundingBox
      const dx = bb.max.x - bb.min.x, dz = bb.max.z - bb.min.z
      if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
      const m = o.material
      if (m && m.map && m.map.image && m.map.image.width > 1000) tex = m.map.image
    })
    if (!tex) return null
    const CW = Math.round(tex.width / 8), CH = Math.round(tex.height / 7)
    // A♠ 9♥ 10♦ K♦ Q♣ / J♠ 5♥ 7♣ verso-bordo verso-azul
    const cels = [0, 21, 35, 38, 50, 10, 17, 45, 52, 54]
    const c = document.createElement('canvas')
    c.width = CW * 5; c.height = CH * 2
    const g = c.getContext('2d')
    g.fillStyle = '#202020'; g.fillRect(0, 0, c.width, c.height)
    cels.forEach((cel, i) => {
      const sx = (cel % 8) * CW, sy = Math.floor(cel / 8) * CH
      g.drawImage(tex, sx, sy, CW, CH, (i % 5) * CW, Math.floor(i / 5) * CH, CW, CH)
    })
    return c.toDataURL('image/png')
  })
  salvarDataURL('03-atlas', folha)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
