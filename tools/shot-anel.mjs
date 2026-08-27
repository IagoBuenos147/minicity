// Fotos do anel verde: no chao, equipado, mirando, levitando e arremessando.
// Sobe o servidor, abre um jogador e encena cada momento.
//
//   node tools/shot-anel.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8350 + (process.pid % 100)
const BASE = 'http://127.0.0.1:' + PORTA
const CDP = 9500 + (process.pid % 90)

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const srv = spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }),
  stdio: ['ignore', 'pipe', 'pipe'],
})
let log = ''
srv.stdout.on('data', (d) => { log += d })
srv.stderr.on('data', (d) => { log += d })

for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await espera(250)
}

const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'anel-' + CDP),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
  '--disable-background-timer-throttling', 'about:blank'], { stdio: 'ignore' })

let wsUrl = null
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { wsUrl = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await espera(250)
}

const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl })
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

try {
  const pg = await browser.newPage()
  await pg.setViewport({ width: 1280, height: 720 })
  pg.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
  await pg.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await pg.waitForFunction('window.__game && window.__game.anel', { timeout: 60000 })
  await pg.waitForFunction('window.__game.rede.conectado === true', { timeout: 40000 })

  const shot = async (nome) => {
    const f = path.join(dir, 'anel-' + nome + '.png')
    await pg.screenshot({ path: f })
    console.log(f)
  }
  // O headless roda por software a ~2 fps. Esperar 60 quadros passaria dos 30 s
  // de timeout do evaluate, entao o limite e por quadro E por relogio.
  const quadros = (n) => pg.evaluate((n) => new Promise((res) => {
    let i = 0
    const t0 = performance.now()
    const f = () => {
      if (++i >= n || performance.now() - t0 > 8000) return res(i)
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), n)

  // camera olhando o anel no chao da barbearia
  await pg.evaluate(() => {
    const G = window.__game
    G.hud.hideStart()
    G.player.setMode('third')
    G.player.teleport(25.8, -14.4, 0)
  })
  await quadros(12)
  await shot('01-no-chao')

  // equipa e mira num objeto
  await pg.evaluate(() => {
    const G = window.__game
    G.anel.equipar()
    // olha para o caixote 2024, que fica na barbearia
    const alvo = G.rede.objetos.get(2024) || { x: 26.5, y: 0.37, z: -14.2 }
    G.player.teleport(26.5, -12.6, 0)
    G.camera.lookAt(alvo.x, alvo.y + 0.3, alvo.z)
  })
  await quadros(12)
  await shot('02-equipado-mirando')

  // pede pra agarrar e espera o servidor confirmar
  const pegou = await pg.evaluate(async () => {
    const G = window.__game
    G.rede.pegar(2024)
    await new Promise((r) => setTimeout(r, 900))
    return { segurando: G.anel.segurando, dono: (G.rede.objetos.get(2024) || {}).dono, meuId: G.rede.meuId }
  })
  console.log('pegar:', JSON.stringify(pegou))
  await quadros(14)
  await shot('03-levitando')

  await quadros(12)
  await shot('04-levitando-depois')

  // arremessa pela assinatura certa: (objId, pos, dir, forca)
  await pg.evaluate(() => {
    const G = window.__game
    const p = G.player.position
    G.rede.arremessar(2024,
      { x: p.x, y: p.y + 1.4, z: p.z },
      { x: 0, y: 0.18, z: -0.98 },
      18)
  })
  await quadros(12)
  await shot('05-arremesso')
  await quadros(10)
  await shot('05b-voando')

  const depoisDoTiro = await pg.evaluate(() => {
    const o = window.__game.rede.objetos.get(2024)
    return { segurando: window.__game.anel.segurando, estado: o ? o.estado : null, dono: o ? o.dono : null }
  })
  console.log('depois do arremesso:', JSON.stringify(depoisDoTiro))

  // painel F3
  await pg.evaluate(() => { window.__game.hud.toggleF3(true) })
  await quadros(10)
  await shot('06-f3')

  const estado = await pg.evaluate(() => ({
    equipado: window.__game.anel.equipado,
    segurando: window.__game.anel.segurando,
    alvo: window.__game.anel.alvoAtual,
    stats: window.__game.rede.stats,
  }))
  console.log('estado do anel:', JSON.stringify(estado))
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
