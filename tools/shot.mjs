// Screenshot do jogo sem navegador aberto: sobe o Edge/Chrome em headless,
// aponta a camera pra onde voce pedir e salva shots/<nome>.png.
//
//   node tools/shot.mjs <nome> <camX> <camY> <camZ> <alvoX> <alvoY> <alvoZ> [fov]
//   node tools/shot.mjs rosto 0 1.66 -0.8 0 1.63 0 40
//
// Precisa do dev server rodando (npm run dev, porta 5173).
// Depois de rodar, olhe o PNG em shots/<nome>.png.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const [, , name = 'shot', ...rest] = process.argv
const n = rest.map(Number)
const cam = [n[0] ?? 4, n[1] ?? 2, n[2] ?? 10]
const look = [n[3] ?? 0, n[4] ?? 1.2, n[5] ?? 0]
const fov = n[6] ?? 60

// O launch() do puppeteer nao negocia bem com o Edge, entao subimos o navegador
// na mao com uma porta de debug e conectamos nela.
const PORT = 9333 + (process.pid % 500)
const profile = path.join(os.tmpdir(), 'minicity-shot-' + PORT)
const child = spawn(findBrowser(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
  '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore', detached: false })

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

const wsEndpoint = await waitForDebugger()
const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await garantirServidor(URL_BASE)

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  const dataUrl = await page.evaluate((cam, look, fov) => {
    const G = window.__game
    const c = G.camera
    c.fov = fov
    c.position.set(cam[0], cam[1], cam[2])
    c.lookAt(look[0], look[1], look[2])
    c.updateProjectionMatrix()
    if (G.lighting) {
      G.lighting.setTarget({ x: cam[0], z: cam[2] })
      G.lighting.update(0.0001)
    }
    G.engine.render()
    return G.renderer.domElement.toDataURL('image/png')
  }, cam, look, fov)

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, name.replace(/[^a-z0-9_-]/gi, '') + '.png')
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(file)
  if (errors.length) console.log('ERROS NO CONSOLE:\n' + errors.slice(0, 10).join('\n'))
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
