// Diagnostico do encaixe CHAPEU x OLHO x CABELO.
//
//   node tools/diag-chapeu.mjs
//
// Imprime, para cada chapeu do catalogo: quanto o slot subiu, onde esta o topo
// da bola do olho, onde esta o pano mais baixo que passa por cima do olho, e
// quantos vertices de cabelo ficaram do lado de fora do pano. E o mesmo
// caminho que a ferramenta de fotos usa (build + dist estatico), pra nao
// depender do dev server.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8700 + (process.pid % 80)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
await new Promise((r) => build.on('exit', r))
const srv = spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }), stdio: 'ignore',
})
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}

const CDP = 9911 + (process.pid % 70)
const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'diagchap-' + CDP),
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=900,700', 'about:blank'], { stdio: 'ignore' })
let ws = null
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
const browser = await puppeteer.connect({ browserWSEndpoint: ws, protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[err]', String(e).slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.character', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2000))

  const linhas = await page.evaluate(async (nChapeus) => {
    const G = window.__game
    const T = G.THREE
    const ch = G.character
    const out = []
    for (let h = 0; h < nChapeus; h++) {
      G.setAppearance({ chapeu: h, cabelo: 3 })
      await new Promise((r) => setTimeout(r, 30))
      const head = ch.parts.head
      head.updateWorldMatrix(true, true)
      const inv = new T.Matrix4().copy(head.matrixWorld).invert()
      const cx = new T.Box3()

      const slotCha = ch.slots.chapeu
      const slotOlh = ch.slots.olhos
      const slotCab = ch.slots.cabelo
      const temCha = slotCha && slotCha.children.length > 0

      // topo do olho no espaco da junta
      cx.setFromObject(slotOlh)
      const a = cx.max.clone().applyMatrix4(inv)
      const b = cx.min.clone().applyMatrix4(inv)
      const topoOlho = Math.max(a.y, b.y)

      // pano mais baixo por cima do olho
      let baixo = Infinity
      const zO = (a.z + b.z) / 2
      const xO = Math.max(Math.abs(a.x), Math.abs(b.x)) * 0.6
      const p = new T.Vector3()
      if (temCha) {
        slotCha.traverse((m) => {
          if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return
          const mm = new T.Matrix4().multiplyMatrices(inv, m.matrixWorld)
          const pos = m.geometry.attributes.position
          for (let i = 0; i < pos.count; i++) {
            p.fromBufferAttribute(pos, i).applyMatrix4(mm)
            if (p.y > topoOlho + 0.09) continue
            if (Math.abs(p.z - zO) > 0.05) continue
            if (Math.abs(Math.abs(p.x) - xO) > 0.05) continue
            if (p.y < baixo) baixo = p.y
          }
        })
      }

      // quantos vertices de cabelo ficaram FORA do pano
      let fora = 0, total = 0
      if (temCha && slotCab) {
        const malhas = []
        slotCha.traverse((m) => { if (m.isMesh) malhas.push(m) })
        const ray = new T.Raycaster()
        const junta = new T.Vector3()
        head.getWorldPosition(junta)
        slotCab.traverse((m) => {
          if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return
          const pos = m.geometry.attributes.position
          const passo = Math.max(1, Math.floor(pos.count / 260))
          for (let i = 0; i < pos.count; i += passo) {
            p.fromBufferAttribute(pos, i)
            m.localToWorld(p)
            const d = p.clone().sub(junta)
            const r = d.length()
            if (r < 0.02) continue
            d.divideScalar(r)
            ray.set(junta.clone().addScaledVector(d, 0.9), d.clone().negate())
            ray.far = 1.4
            const t = ray.intersectObjects(malhas, false)
            let R = 0
            for (const q of t) {
              const v = q.point.clone().sub(junta)
              if (v.dot(d) <= 0) continue
              R = v.length(); break
            }
            total++
            if (R > 0 && r > R + 0.001) fora++
          }
        })
      }
      out.push({
        i: h,
        nome: (G.character.appearance && '') || '',
        subiu: +(slotCha ? slotCha.position.y : 0).toFixed(4),
        topoOlho: +topoOlho.toFixed(4),
        panoBaixo: isFinite(baixo) ? +baixo.toFixed(4) : null,
        cabeloFora: fora + '/' + total,
      })
    }
    return out
  }, 7)

  console.log('idx  subiu   topoOlho  panoAcimaDoOlho  cabeloForaDoPano')
  for (const l of linhas) {
    console.log(String(l.i).padStart(3), String(l.subiu).padStart(7),
      String(l.topoOlho).padStart(9), String(l.panoBaixo).padStart(16),
      String(l.cabeloFora).padStart(16))
  }
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
