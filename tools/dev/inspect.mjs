// Roda uma expressao dentro do jogo e imprime o resultado.
//   node tools/dev/inspect.mjs "<codigo>"     (recebe G = window.__game)
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { garantirServidor } from '../servidor-dev.mjs'

const URL_BASE = 'http://localhost:5173'
const CAND = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const bin = CAND.find((p) => fs.existsSync(p))
const PORT = 9711 + (process.pid % 200)
const filho = spawn(bin, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'mc-insp-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function ws() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (e) { void e }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('sem debugger')
}

const browser = await puppeteer.connect({ browserWSEndpoint: await ws() })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)))
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.provador', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))
  const codigo = process.argv[2] || 'return "sem codigo"'
  const out = await page.evaluate((c) => {
    const G = window.__game
    try { return JSON.stringify(new Function('G', c)(G), null, 1) } catch (e) { return 'ERRO: ' + e.message + '\n' + e.stack }
  }, codigo)
  console.log(out)
} finally {
  try { await browser.close() } catch (e) { void e }
  try { filho.kill() } catch (e) { void e }
}
