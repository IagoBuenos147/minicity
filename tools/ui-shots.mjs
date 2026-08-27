// Screenshots da PAGINA inteira (canvas + HUD em DOM), que o toDataURL do
// canvas sozinho nao captura. Salva em shots/ui-*.png.
//
//   node tools/ui-shots.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-ui-' + PORT),
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

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  const shot = async (name) => {
    const f = path.join(dir, 'ui-' + name + '.png')
    await page.screenshot({ path: f })
    console.log(f)
  }
  const frames = (n) => page.evaluate((n) => new Promise((res) => {
    let i = 0
    const f = () => { if (++i >= n) return res(); requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }), n)

  // 1) tela inicial
  await frames(10)
  await shot('01-tela-inicial')

  // 2) HUD em jogo, terceira pessoa, com prompt de interacao ativo
  await page.evaluate(() => {
    const G = window.__game
    G.hud.hideStart()
    const it = G.interaction.items.find((i) => i.id === 'barber-talk')
    G.player.setMode('third')
    G.player.teleport(it.position.x, it.position.z + 1.2, 0)
  })
  await frames(40)
  await shot('02-hud-terceira-pessoa')

  // 3) primeira pessoa na rua
  await page.evaluate(() => {
    const G = window.__game
    G.player.setMode('first')
    G.player.teleport(2, 9, 0)
  })
  await frames(40)
  await shot('03-primeira-pessoa')

  // 4) painel de customizacao (cabelo, como o barbeiro abre)
  await page.evaluate(() => window.__game.openCustomizer('hair'))
  await frames(50)
  await shot('04-customizador-cabelo')

  // 4b) sentado num banco, em 3a pessoa
  await page.evaluate(() => {
    const G = window.__game
    G.customizer.close()
    G.player.setMode('third')
    const seats = G.interaction.items.filter((i) => i.id.indexOf('seat-') === 0)
    if (seats.length) {
      const it = seats[0]
      G.player.teleport(it.position.x + 0.9, it.position.z + 0.9, 0)
      const found = G.interaction.update(G.player.position)
      if (found) found.onInteract(G)
    }
  })
  await frames(90)
  await shot('06-sentado')

  // 4c) correndo na rua, 3a pessoa (enquadramento em movimento)
  await page.evaluate(() => {
    const G = window.__game
    if (G.player.sitting) G.player.standUp()
    G.player.setMode('third')
    G.player.teleport(2, 20, 0)
  })
  await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    // empurra o jogador pra frente por ~1.2 s pra camera se acomodar atras
    let i = 0
    const f = () => {
      G.player.velocity.z = -6.2
      G.player.position.z -= 6.2 / 60
      if (++i >= 70) return res()
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }))
  await shot('07-correndo')

  // 5) painel completo (espelho)
  await page.evaluate(() => {
    const G = window.__game
    G.customizer.close()
    G.openCustomizer('all')
  })
  await frames(50)
  await shot('05-customizador-completo')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
