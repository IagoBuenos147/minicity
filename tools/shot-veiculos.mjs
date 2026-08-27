// Fotos dos veiculos: os tres estacionados, dirigindo, e a montagem do
// helicoptero pelo anel.
//
//   node tools/shot-veiculos.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8500 + (process.pid % 80)
const BASE = 'http://127.0.0.1:' + PORTA
const CDP = 9700 + (process.pid % 70)

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
  '--user-data-dir=' + path.join(os.tmpdir(), 'vei-' + CDP),
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
  await pg.waitForFunction('window.__game && window.__game.veiculos', { timeout: 60000 })
  await pg.waitForFunction('window.__game.rede.conectado === true', { timeout: 45000 })
  console.log('conectado')
  // fecha a tela inicial UMA vez, antes de tudo: ela cobre as fotos
  await pg.evaluate(() => {
    const G = window.__game
    G.hud.hideStart()
    G.hud.showHelp(false)
    const el = document.querySelector('.mcrp-start, #mcrp-start, [class*="start"]')
    if (el && el.style) el.style.display = 'none'
  })

  const shot = async (nome) => {
    // A tela inicial volta a aparecer entre uma foto e outra (hideStart so
    // esconde de verdade 380 ms depois). Aqui ela e removida no braco, sempre.
    await pg.evaluate(() => {
      const G = window.__game
      try { G.hud.hideStart() } catch (e) { void e }
      document.querySelectorAll('div').forEach((d) => {
        const t = (d.textContent || '')
        if (t.indexOf('Clique para jogar') >= 0 && d.parentElement === document.body) {
          d.style.display = 'none'
        }
      })
    })
    const f = path.join(dir, 'vei-' + nome + '.png')
    await pg.screenshot({ path: f })
    console.log(f)
  }
  const quadros = (n) => pg.evaluate((n) => new Promise((res) => {
    let i = 0
    const t0 = performance.now()
    const f = () => { if (++i >= n || performance.now() - t0 > 9000) return res(i); requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }), n)

  // Mover a camera direto nao adianta: o laco do jogo a reposiciona todo
  // quadro. Quem manda na camera e a posicao do JOGADOR e o yaw dele.
  const posar = async (x, z, yaw) => {
    await pg.evaluate((x, z, yaw) => {
      const G = window.__game
      G.player.setMode('third')
      G.player.teleport(x, z, yaw)
    }, x, z, yaw)
    await quadros(10)
  }

  // 1) os tres estacionados
  await pg.evaluate(() => { window.__game.player.teleport(7, -2.5, Math.PI) })
  await quadros(12)
  await posar(7, -1.6, Math.PI)
  await shot('01-os-tres')
  await posar(3.2, -2.6, Math.PI)
  await shot('02-carro')
  await posar(7.0, -2.6, Math.PI)
  await shot('03-moto')
  await posar(10.2, -2.8, Math.PI)
  await shot('04-skate')

  // 2) entrar no carro e andar
  const entrou = await pg.evaluate(async () => {
    const G = window.__game
    G.player.teleport(4.6, -5.4, Math.PI)
    await new Promise((r) => setTimeout(r, 400))
    G.veiculos.entrarSair()
    await new Promise((r) => setTimeout(r, 900))
    return { dirigindo: G.veiculos.dirigindo }
  })
  console.log('entrar no carro:', JSON.stringify(entrou))
  await quadros(14)
  await shot('05-dentro-do-carro')

  // 3) montagem do helicoptero pelo anel
  const heli = await pg.evaluate(async () => {
    const G = window.__game
    if (G.veiculos.dirigindo) G.veiculos.entrarSair()
    await new Promise((r) => setTimeout(r, 300))
    G.player.teleport(-2, 14, Math.PI)
    G.anel.equipar()
    return { equipado: G.anel.equipado }
  })
  console.log('anel:', JSON.stringify(heli))
  // o clique direito real exige ponteiro travado, que o headless nao tem:
  // chama a montagem pela API
  await pg.evaluate(() => { window.__game.anel.montarHelicoptero() })
  await quadros(8)
  await shot('06-montando')
  await quadros(10)
  await shot('07-montando-mais')

  const fim = await pg.evaluate(() => {
    const G = window.__game
    let heli = 0
    if (G.veiculos && G.veiculos.grupo) {
      G.veiculos.grupo.traverse((o) => { if (o.name && /heli/i.test(o.name)) heli++ })
    }
    return { progresso: +(G.anel.montando || 0).toFixed(2), pecasHeli: heli }
  })
  console.log('estado:', JSON.stringify(fim))
  await quadros(14)
  await shot('08-heli-pronto')
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
