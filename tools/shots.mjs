// Bateria de screenshots num unico launch do navegador (bem mais rapido que
// chamar tools/shot.mjs varias vezes).
//
//   node tools/shots.mjs            -> tira o conjunto padrao
//   node tools/shots.mjs personagem -> so o grupo "personagem"
//   node tools/shots.mjs cidade barbearia
//
// Precisa do dev server rodando (npm run dev).

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// grupo -> lista de [nome, camX, camY, camZ, alvoX, alvoY, alvoZ, fov]
// Layout: barbearia x 14..30 z -28..-12 (porta x=22); mercearia x -36..-14
// z -32..-12 (porta x=-25); praca no quadrante sudoeste.
export const GROUPS = {
  cidade: [
    ['cid-01-rua', 2, 2.6, 16, 6, 1.6, -14, 62],
    ['cid-02-cruzamento', 10, 6.5, 10, -2, 0.5, -6, 70],
    ['cid-03-barbearia-fachada', 22, 2.2, -4, 22, 2.0, -13, 60],
    ['cid-04-mercearia-fachada', -25, 2.4, -4, -25, 2.0, -13, 62],
    ['cid-05-praca', -20, 3.2, 34, -33, 1.0, 22, 65],
    ['cid-06-praca-fonte', -26, 1.9, 30, -33, 0.8, 23, 58],
    ['cid-07-beco', 35, 2.0, 36, 35, 1.4, 20, 66],
    ['cid-08-alto', 30, 26, 40, -6, 0, -10, 62],
  ],
  personagem: [
    ['per-01-rosto', 0, 1.66, -0.8, 0, 1.63, 0, 40],
    ['per-02-corpo', 0, 1.05, -3.2, 0, 0.92, 0, 45],
    ['per-03-perfil', 3.0, 1.05, 0, 0, 0.92, 0, 45],
    ['per-04-tres-quartos', 1.5, 1.85, -1.7, 0, 1.4, 0, 42],
    ['per-05-costas', 0, 1.2, 2.6, 0, 1.0, 0, 45],
  ],
  barbearia: [
    ['bar-01-entrada', 22, 1.75, -13.2, 22, 1.5, -26, 70],
    ['bar-02-estacoes', 17, 1.8, -14, 24, 1.2, -24, 65],
    ['bar-03-quadros', 22, 1.7, -20, 29, 1.7, -20, 70],
    ['bar-04-espera', 24, 1.7, -16, 28, 1.5, -24, 66],
    ['bar-05-fundo', 22, 1.7, -26, 22, 1.5, -14, 70],
  ],
  mercearia: [
    ['mer-01-entrada', -25, 1.8, -13.5, -25, 1.4, -30, 70],
    ['mer-02-caixa', -19, 1.8, -15, -31, 1.3, -21, 68],
    ['mer-03-gondola', -30, 1.6, -20, -22, 1.2, -22, 62],
    ['mer-04-geladeiras', -25, 1.7, -20, -34, 1.4, -26, 66],
  ],
}

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

const wanted = process.argv.slice(2)
const groups = wanted.length ? wanted : Object.keys(GROUPS)
const list = groups.flatMap((g) => GROUPS[g] || [])
if (!list.length) {
  console.error('grupos validos: ' + Object.keys(GROUPS).join(', '))
  process.exit(1)
}

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-shots-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
  'about:blank',
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
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' && !t.includes('favicon') && !t.includes('404')) errors.push(t)
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  // O personagem posa num trecho de rua vazio pros retratos.
  await page.evaluate(() => {
    const G = window.__game
    G.player.teleport(0, 40, 0)
    G.player.update(0.05); G.player.update(0.05)
    G.character.setVisibleBody(true)
  })

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const [name, cx, cy, cz, lx, ly, lz, fov] of list) {
    const dataUrl = await page.evaluate((cam, look, fov, isChar) => {
      const G = window.__game
      // os retratos do personagem sao relativos a posicao atual dele
      const o = isChar ? G.character.root.position : { x: 0, y: 0, z: 0 }
      const c = G.camera
      c.fov = fov
      c.position.set(o.x + cam[0], cam[1], o.z + cam[2])
      c.lookAt(o.x + look[0], look[1], o.z + look[2])
      c.updateProjectionMatrix()
      if (G.lighting) { G.lighting.setTarget({ x: c.position.x, z: c.position.z }); G.lighting.update(0.0001) }
      G.engine.render()
      return G.renderer.domElement.toDataURL('image/png')
    }, [cx, cy, cz], [lx, ly, lz], fov, name.startsWith('per-'))
    const file = path.join(dir, name + '.png')
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(file)
  }

  const stats = await page.evaluate(() => {
    const G = window.__game
    let lights = 0, meshes = 0, inst = 0, nan = 0, shadowLights = 0
    G.scene.traverse((o) => {
      if (o.isLight) { lights++; if (o.castShadow) shadowLights++ }
      if (o.isInstancedMesh) inst++
      else if (o.isMesh) {
        meshes++
        const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position
        if (p) { const a = p.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) { nan++; break } }
      }
    })
    return { meshes, inst, lights, shadowLights, nan, colliders: G.collision.count, interacoes: G.interaction.items.length }
  })
  console.log('\nCENA: ' + JSON.stringify(stats))
  if (errors.length) console.log('\nERROS:\n' + errors.slice(0, 12).join('\n'))
  else console.log('sem erros de console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
