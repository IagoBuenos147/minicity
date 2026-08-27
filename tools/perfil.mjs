// Diagnostico de orcamento: de onde vem cada luz e cada draw call na rua.
//
//   node tools/perfil.mjs        (precisa do dev server em pe)

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { garantirServidor } from './servidor-dev.mjs'

const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
function findBrowser() {
  for (const p of CANDIDATES) if (p && fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}
const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-perfil-' + PORT),
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
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  page.setDefaultTimeout(120000)
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  const luzes = await page.evaluate(() => {
    const G = window.__game
    const out = []
    G.scene.traverse((o) => {
      if (!o.isLight) return
      const cadeia = []
      for (let p = o; p; p = p.parent) if (p.name) cadeia.unshift(p.name)
      out.push({
        tipo: o.type, nome: o.name || '(sem nome)',
        pai: cadeia.join('/') || '(raiz)',
        visivel: o.visible, int: +(o.intensity || 0).toFixed(2),
      })
    })
    return out
  })
  console.log('LUZES: ' + luzes.length)
  const porTipo = {}
  for (const l of luzes) {
    const k = l.tipo + '  ' + l.pai
    porTipo[k] = (porTipo[k] || 0) + 1
  }
  for (const k of Object.keys(porTipo).sort()) console.log('  ' + String(porTipo[k]).padStart(3) + 'x  ' + k)

  const calls = await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    G.player.position.set(2, G.groundY(2, 9), 9)
    G.camera.position.set(2, 1.7, 9)
    let i = 0
    const f = () => {
      if (++i < 20) return requestAnimationFrame(f)
      G.renderer.info.reset()
      G.engine.render()
      const info = G.renderer.info.render
      // quem esta no frustum: conta mesh visivel por origem
      const cam = G.camera
      cam.updateMatrixWorld()
      const fr = null   // sem THREE exposto: conta mesh visivel, sem frustum
      const porOrigem = {}
      G.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return
        let vis = true
        for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break }
        if (!vis) return
        if (o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere()
        void fr
        const cadeia = []
        for (let p = o; p; p = p.parent) if (p.name) cadeia.unshift(p.name)
        const k = cadeia.slice(0, 2).join('/') || '(sem nome)'
        porOrigem[k] = (porOrigem[k] || 0) + (o.isInstancedMesh ? 1 : 1)
      })
      res({ calls: info.calls, tris: info.triangles, porOrigem })
    }
    requestAnimationFrame(f)
  }))
  console.log('\nDRAW CALLS na rua: ' + calls.calls + '   triangulos: ' + calls.tris)
  const ent = Object.entries(calls.porOrigem).sort((a, b) => b[1] - a[1]).slice(0, 25)
  for (const [k, v] of ent) console.log('  ' + String(v).padStart(4) + '  ' + k)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
