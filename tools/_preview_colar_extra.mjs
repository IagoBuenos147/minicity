// Driver puppeteer TEMPORARIO (apagado no fim da tarefa) so pra enxergar os
// 5 colares novos de colares-extra.js ANTES da fiacao em roupas.js existir —
// character.js resolve o catalogo do slot 'colar' via ROUPAS.COLARES, que
// ainda nao inclui COLARES_EXTRA (a fiacao e do dono, fora do alcance desta
// tarefa). Este script NAO passa pelo character.js/provador: abre
// _preview_colar_extra.html direto (file://), que importa colares-extra.js
// de verdade e chama build() com um ctx simulado, so pra conferencia visual
// da geometria/proporcao/material antes da integracao.
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ES module import precisa de http:// — file:// leva CORS ("origin null") no
// import de 'three' e do proprio colares-extra.js. Servidor estatico mais
// simples possivel, so pra este preview.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' }
const HTTP_PORT = 9800 + (process.pid % 90)
const servidor = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0])
  const fp = path.join(ROOT, rel)
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' })
    res.end(data)
  })
}).listen(HTTP_PORT)

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
function acharNavegador() {
  for (const p of CANDIDATOS) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const PORT = 9711 + (process.pid % 120)
const filho = (await import('node:child_process')).spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-prev-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1900,420', 'about:blank',
], { stdio: 'ignore' })

async function esperarDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(), protocolTimeout: 120000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1900, height: 420 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 400)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 400)) })

  const url = 'http://127.0.0.1:' + HTTP_PORT + '/tools/_preview_colar_extra.html'
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  try {
    await page.waitForFunction('window.__pronto === true', { timeout: 15000 })
  } catch (e) {
    console.log('NAO FICOU PRONTO:', String(e).slice(0, 200))
  }
  await new Promise((r) => setTimeout(r, 300))

  const out = path.join(ROOT, 'shots', 'preview-colar-extra.png')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  await page.screenshot({ path: out, fullPage: true })
  console.log(out)
  console.log(erros.length ? 'ERROS:\n' + erros.join('\n') : 'sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { servidor.close() } catch (err) { void err }
}
