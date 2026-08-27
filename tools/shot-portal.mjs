// Fotos da arma de portal e do portal: no chao, na mao, o tiro e a travessia.
//
//   node tools/shot-portal.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8450 + (process.pid % 90)
const BASE = 'http://127.0.0.1:' + PORTA
const CDP = 9600 + (process.pid % 80)

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
  '--user-data-dir=' + path.join(os.tmpdir(), 'pg-' + CDP),
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
  await pg.waitForFunction('window.__game && window.__game.portalgun', { timeout: 60000 })
  await pg.waitForFunction('window.__game.rede.conectado === true', { timeout: 45000 })
  console.log('conectado')

  const shot = async (nome) => {
    const f = path.join(dir, 'pg-' + nome + '.png')
    await pg.screenshot({ path: f })
    console.log(f)
  }
  // teto por quadro E por relogio: o headless roda por software, devagar
  const quadros = (n) => pg.evaluate((n) => new Promise((res) => {
    let i = 0
    const t0 = performance.now()
    const f = () => { if (++i >= n || performance.now() - t0 > 9000) return res(i); requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }), n)

  // 1) a arma largada na mercearia
  await pg.evaluate(() => {
    const G = window.__game
    G.hud.hideStart()
    G.player.setMode('third')
    G.player.teleport(-21.5, -15.2, 0)
  })
  await quadros(14)
  await shot('01-arma-no-chao')

  // camera perto, pra ver o modelo
  await pg.evaluate(() => {
    const G = window.__game
    const M = { x: -21.5, y: 1.06, z: -16.9 }
    G.camera.position.set(M.x + 0.9, M.y + 0.35, M.z + 1.15)
    G.camera.lookAt(M.x, M.y, M.z)
    G.camera.fov = 38
    G.camera.updateProjectionMatrix()
    G.engine.render()
  })
  await shot('02-arma-detalhe')

  // 2) pega e equipa
  const pegou = await pg.evaluate(() => {
    const G = window.__game
    G.player.teleport(-21.5, -15.2, 0)
    const it = G.interaction.items.find((i) => i.id === 'portal-gun')
    if (it) it.onInteract(G)
    if (G.pegouItem) G.pegouItem('portal')
    return { equipado: G.portalgun.equipado, slot: G.hotbar.selecionado }
  })
  console.log('pegar:', JSON.stringify(pegou))
  await quadros(14)
  await shot('03-equipada')

  // 3) atira: vai pra rua e abre o portal
  await pg.evaluate(() => {
    const G = window.__game
    G.player.teleport(-25, -6, 0)
  })
  await quadros(12)
  await pg.evaluate(() => { window.__game.portalgun.atirar() })
  await quadros(6)
  await shot('04-abrindo')

  // ---- travessia PRIMEIRO -------------------------------------------------
  // O portal dura PORTAL_DURACAO (25 s). No headless por software o laco anda
  // a ~2 fps, entao tirar varias fotos antes faria o portal EXPIRAR e o teste
  // acusaria "travessia nao funciona" quando o que houve foi o tempo passar.
  const antes = await pg.evaluate(() => ({ x: +window.__game.player.position.x.toFixed(1), z: +window.__game.player.position.z.toFixed(1) }))
  const diag = await pg.evaluate(() => {
    const G = window.__game
    let p = null
    if (G.portalgun.portais) G.portalgun.portais.forEach((x) => { if (!p) p = x })
    if (!p) return { semPortal: true }
    G.player.teleport(p.x, p.z, 0)
    const dx = G.player.position.x - p.x, dz = G.player.position.z - p.z
    return {
      portal: { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) },
      distXZ: +Math.sqrt(dx * dx + dz * dz).toFixed(2),
      brilho: p.visual ? +(p.visual.brilho || 0).toFixed(2) : null,
      fechando: p.visual ? !!p.visual.fechando : null,
      difAltura: +Math.abs((G.player.position.y + 0.9) - p.y).toFixed(2),
    }
  })
  console.log('no momento da travessia:', JSON.stringify(diag))
  await quadros(6)
  const depois = await pg.evaluate(() => ({ x: +window.__game.player.position.x.toFixed(1), z: +window.__game.player.position.z.toFixed(1) }))
  const foiParaBarbearia = Math.abs(depois.x - 22) < 2 && Math.abs(depois.z + 14.2) < 2
  console.log('travessia: de', JSON.stringify(antes), 'para', JSON.stringify(depois),
    foiParaBarbearia ? '=> CHEGOU NA BARBEARIA' : '=> NAO ATRAVESSOU')
  await shot('07-depois-de-atravessar')

  // ---- so agora as fotos do portal (abre outro, ja que o de cima foi usado)
  await pg.evaluate(() => { window.__game.portalgun.atirar() })
  await quadros(8)
  await shot('05-portal')

  const estado = await pg.evaluate(() => {
    const G = window.__game
    const ps = []
    if (G.portalgun.portais) G.portalgun.portais.forEach((p, id) => ps.push({ id, dono: p.dono }))
    return { equipado: G.portalgun.equipado, portais: ps, meuId: G.rede.meuId }
  })
  console.log('portais:', JSON.stringify(estado))

  // camera de frente pro portal, pra ver o redemoinho
  await pg.evaluate(() => {
    const G = window.__game
    let alvo = null
    if (G.portalgun.portais) G.portalgun.portais.forEach((p) => { if (!alvo) alvo = p })
    // o portal guarda x/y/z direto (nao ha .grupo/.root/.mesh)
    const pos = alvo ? { x: alvo.x, y: alvo.y, z: alvo.z } : { x: -25, y: 1.6, z: -9 }
    G.camera.position.set(pos.x, pos.y + 0.1, pos.z + 4.2)
    G.camera.lookAt(pos.x, pos.y, pos.z)
    G.camera.fov = 55
    G.camera.updateProjectionMatrix()
    G.engine.render()
  })
  await shot('06-portal-de-frente')

  // 5) a barra de itens
  await pg.evaluate(() => { window.__game.hotbar.selecionar(2) })
  await quadros(8)
  await shot('08-hotbar')
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
