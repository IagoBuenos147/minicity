// Screenshot do jogo COM O LACO RODANDO. Diferente do tools/shot.mjs, que
// teleporta a camera e renderiza um quadro solto: aqui o JOGADOR vai pra um
// lugar, o laco de verdade roda N quadros e so entao a foto sai da camera do
// jogo. E o unico jeito de ver o que so existe em movimento — a chuva (a caixa
// de gotas segue a camera), a agua da fonte, o zumbi andando, a arma na mao.
//
//   node tools/shot-jogo.mjs <nome> <x> <z> [yaw] [quadros] [antes-js]
//   node tools/shot-jogo.mjs chuva 0 6 3.14 120
//
// Precisa do dev server em pe (porta 5173).

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { spawn } from 'node:child_process'
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
  for (const p of CANDIDATES) if (p && fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const [, , nome = 'jogo', ...rest] = process.argv
const x = Number(rest[0] ?? 0)
const z = Number(rest[1] ?? 6)
const yaw = rest[2] === undefined ? 0 : Number(rest[2])
const quadros = Number(rest[3] ?? 90)
const antes = rest[4] || null

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-shotjogo-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
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
  page.setDefaultTimeout(180000)
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|WebSocket/i.test(m.text())) errs.push(m.text()) })

  // O dev server as vezes cai sozinho (ele morre quando um arquivo e reescrito
  // no meio de um build). Tentar de novo custa 3 s e evita perder a foto.
  let tentativas = 0
  for (;;) {
    try {
      await garantirServidor(URL_BASE)
      await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
      break
    } catch (e) {
      if (++tentativas > 6) throw e
      console.log('servidor fora do ar, tentando de novo (' + tentativas + '/6)...')
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 90000 })

  const saida = await page.evaluate((x, z, yaw, quadros, antes) => new Promise((res) => {
    const G = window.__game
    G.player.teleport(x, z, yaw)
    if (antes) { try { new Function('G', antes)(G) } catch (e) { console.error(e) } }
    let i = 0
    const t0 = performance.now()
    const f = () => {
      // teto por relogio: o headless renderiza por software e pode nao chegar
      // aos N quadros em tempo util
      if (++i >= quadros || performance.now() - t0 > 40000) {
        G.engine.render()
        // o script de "antes" pode deixar numeros em window.__probe; eles saem
        // no terminal junto com o caminho da foto. Serve pra conferir angulo,
        // posicao e distancia sem escrever uma ferramenta nova a cada duvida.
        return res({
          png: G.renderer.domElement.toDataURL('image/png'),
          probe: window.__probe === undefined ? null : window.__probe,
        })
      }
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), x, z, yaw, quadros, antes)

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, nome.replace(/[^a-z0-9_-]/gi, '') + '.png')
  fs.writeFileSync(file, Buffer.from(saida.png.split(',')[1], 'base64'))
  console.log(file)
  if (saida.probe !== null) console.log('PROBE: ' + JSON.stringify(saida.probe))
  if (errs.length) console.log('ERROS:\n' + errs.slice(0, 6).join('\n'))
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
