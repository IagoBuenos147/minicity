// So a montagem do helicoptero, do comeco ao fim, com a camera parada olhando
// pro ponto onde ele nasce.
//
//   node tools/shot-heli.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8600 + (process.pid % 70)
const BASE = 'http://127.0.0.1:' + PORTA
const CDP = 9800 + (process.pid % 60)

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

const srv = spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }),
  stdio: ['ignore', 'pipe', 'pipe'],
})
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await espera(250)
}

const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'heli-' + CDP),
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
  pg.setDefaultTimeout(120000)
  pg.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 220)))
  await pg.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await pg.waitForFunction('window.__game && window.__game.anel', { timeout: 60000 })
  await pg.waitForFunction('window.__game.rede.conectado === true', { timeout: 45000 })

  const limparTela = () => pg.evaluate(() => {
    const G = window.__game
    try { G.hud.hideStart(); G.hud.showHelp(false) } catch (e) { void e }
    document.querySelectorAll('div').forEach((d) => {
      if ((d.textContent || '').indexOf('Clique para jogar') >= 0 && d.parentElement === document.body) d.style.display = 'none'
    })
  })
  const shot = async (nome) => {
    await limparTela()
    const f = path.join(dir, 'heli-' + nome + '.png')
    await pg.screenshot({ path: f })
    console.log(f)
  }
  const quadros = (n) => pg.evaluate((n) => new Promise((res) => {
    let i = 0
    const t0 = performance.now()
    const f = () => { if (++i >= n || performance.now() - t0 > 9000) return res(i); requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }), n)

  // praca, espaco aberto: o jogador olha pro sul e monta 7 m a frente
  await pg.evaluate(() => {
    const G = window.__game
    G.player.setMode('third')
    // rua principal, bem longe de arvore e banco: a montagem exige 3.2 m
    // livres em volta e a praca tem colisor demais
    G.player.teleport(0, 30, Math.PI)
    // Caminho de verdade: destravar o slot na barra e seleciona-lo. So chamar
    // anel.equipar() nao basta -- a barra derruba um item que esta travado.
    G.hotbar.marcarDisponivel(1, true)
    G.hotbar.selecionar(1)
  })
  await quadros(14)
  await shot('00-antes')

  await pg.waitForFunction('window.__game.anel.equipado === true', { timeout: 20000 })
  const inicio = await pg.evaluate(() => {
    const G = window.__game
    G.anel.montarHelicoptero()
    return { equipado: G.anel.equipado, montandoLogo: G.anel.montando }
  })
  console.log('inicio da montagem:', JSON.stringify(inicio))

  // acompanha a montagem inteira, tirando foto pelo caminho
  for (let i = 1; i <= 6; i++) {
    await quadros(5)
    const p = await pg.evaluate(() => +(window.__game.anel.montando || 0).toFixed(2))
    await shot('0' + i + '-p' + String(Math.round(p * 100)))
    if (p >= 1) break
  }

  await quadros(10)
  const fim = await pg.evaluate(() => {
    const G = window.__game
    let pecas = 0
    G.scene.traverse((o) => { if (o.name && /heli/i.test(o.name)) pecas++ })
    const perto = G.veiculos && G.veiculos.veiculoPerto ? G.veiculos.veiculoPerto(G.player.position) : null
    return { montando: +(G.anel.montando || 0).toFixed(2), objetosHeli: pecas, veiculoPerto: perto }
  })
  console.log('depois da montagem:', JSON.stringify(fim))
  await shot('99-pronto')
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
