// Harness PROPRIO (nao faz parte do projeto) pra testar chapeus-extra.js
// ANTES de roupas.js importar o arquivo (a fiacao e do dono, nao minha).
// Usa o DEV SERVER (vite) pra poder dynamic-import um arquivo fonte que
// nenhum bundle referencia ainda, builda um ctx minimo igual ao que
// character.js passa pro build() de cada chapeu, e mede a mesma janela de
// panoAcimaDoOlho que tools/diag-chapeu.mjs mede pros chapeus do catalogo.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = 'C:/Users/Pichau/Desktop/RP'
const PORTA = 5180 + (process.pid % 300)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const vite = spawn(path.join(ROOT, 'node_modules', '.bin', 'vite.cmd'),
  ['--host', '--port', String(PORTA), '--strictPort'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
let viteOut = ''
vite.stdout.on('data', (d) => { viteOut += String(d) })
vite.stderr.on('data', (d) => { viteOut += String(d) })
let up = false
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(BASE); if (r.status) { up = true; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
console.log('vite up=' + up)
console.log(viteOut.slice(0, 2000))
await new Promise((r) => setTimeout(r, 500))

const CDP = 9700 + (process.pid % 200)
const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'testextra-' + CDP),
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=760,760', 'about:blank'], { stdio: 'ignore' })
let ws = null
for (let i = 0; i < 100; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
const browser = await puppeteer.connect({ browserWSEndpoint: ws, protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 760, height: 760 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 400)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 400)) })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.character', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1500))

  const HEAD = { rx: 0.1795, ry: 0.246, rz: 0.1729 }

  const linhas = await page.evaluate(async (HEAD) => {
    const G = window.__game
    const T = G.THREE
    const mod = await import('/src/player/roupa/chapeus-extra.js')
    const hats = mod.CHAPEUS_EXTRA
    G.setAppearance({ chapeu: 0, cabelo: 3 })
    await new Promise((r) => setTimeout(r, 30))

    const head = G.character.parts.head
    const ctx = { partes: G.character.parts, medida: { HEAD } }

    // topo/centro da bola do olho no espaco da junta (igual diag-chapeu.mjs)
    head.updateWorldMatrix(true, true)
    const inv = new T.Matrix4().copy(head.matrixWorld).invert()
    const cx = new T.Box3().setFromObject(G.character.slots.olhos)
    const a = cx.max.clone().applyMatrix4(inv)
    const b = cx.min.clone().applyMatrix4(inv)
    const topoOlho = Math.max(a.y, b.y)
    const zO = (a.z + b.z) / 2
    const xO = Math.max(Math.abs(a.x), Math.abs(b.x)) * 0.6

    const out = []
    for (const hat of hats) {
      let grupo = null
      let erro = null
      try {
        grupo = hat.build(ctx)
      } catch (e) {
        erro = String(e && e.stack || e).slice(0, 500)
      }
      if (!grupo) {
        out.push({ id: hat.id, erro: erro || 'build() nao devolveu grupo', nMesh: 0 })
        continue
      }
      head.add(grupo)
      head.updateWorldMatrix(true, true)
      const invNow = new T.Matrix4().copy(head.matrixWorld).invert()
      const mm = new T.Matrix4()
      let baixo = Infinity
      let nMesh = 0
      const p = new T.Vector3()
      grupo.traverse((o) => {
        if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return
        nMesh++
        mm.multiplyMatrices(invNow, o.matrixWorld)
        const pos = o.geometry.attributes.position
        for (let i = 0; i < pos.count; i++) {
          p.fromBufferAttribute(pos, i).applyMatrix4(mm)
          if (p.y > topoOlho + 0.09) continue
          if (Math.abs(p.z - zO) > 0.05) continue
          if (Math.abs(Math.abs(p.x) - xO) > 0.05) continue
          if (p.y < baixo) baixo = p.y
        }
      })
      // screenshot: camera close no rosto, de frente
      const wp = new T.Vector3()
      head.getWorldPosition(wp)
      const camPrev = { pos: G.camera.position.clone(), quat: G.camera.quaternion.clone() }
      G.camera.position.set(wp.x, wp.y + 0.02, wp.z + 0.62)
      G.camera.lookAt(wp.x, wp.y - 0.02, wp.z)
      G.renderer.render(G.scene, G.camera)
      const img = G.renderer.domElement.toDataURL('image/png')
      G.camera.position.copy(camPrev.pos)
      G.camera.quaternion.copy(camPrev.quat)

      out.push({
        id: hat.id, nMesh,
        topoOlho: +topoOlho.toFixed(4),
        panoAcimaDoOlho: isFinite(baixo) ? +baixo.toFixed(4) : null,
        img,
      })
      head.remove(grupo)
      grupo.traverse((o) => { if (o.geometry) o.geometry.dispose() })
    }
    return out
  }, HEAD)

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })
  for (const l of linhas) {
    if (l.erro) { console.log(l.id, 'ERRO:', l.erro); continue }
    console.log(l.id.padEnd(14), 'nMesh=' + l.nMesh, 'topoOlho=' + l.topoOlho,
      'panoAcimaDoOlho=' + l.panoAcimaDoOlho,
      l.panoAcimaDoOlho >= 0.136 ? 'OK' : '*** ABAIXO DE 0.136 ***')
    if (l.img) {
      const buf = Buffer.from(l.img.split(',')[1], 'base64')
      fs.writeFileSync(path.join(dir, 'extra-' + l.id + '.png'), buf)
    }
  }
  if (erros.length) console.log('ERROS DE PAGINA:\n' + erros.slice(0, 10).join('\n'))
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { vite.kill() } catch (e) { void e }
}
