// Harness de QC descartavel, so pra ver os 3 calcados novos de calcados-extra2.js
// ANTES da fiacao existir em roupas.js (o dono fez essa fiacao por fora, entao
// shot-catalogo.mjs nao acha os itens novos ainda). Nao toca em nenhum arquivo
// existente: sobe o dev server do proprio projeto e renderiza os 3 build()
// direto, com um ctx minimo (so o que calcado usa: medida.SOLA_Y, cor.calcado,
// montar). Apagado no fim da conferencia.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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

const server = await createServer({
  root: ROOT, logLevel: 'warn',
  server: { port: 8710, host: '127.0.0.1', strictPort: true },
})
await server.listen()
server.printUrls()
const url = 'http://127.0.0.1:8710/tools/_qc_render_tmp.html'
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(url); if (r.ok || r.status === 200) break } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 200))
}

const browser = await puppeteer.launch({
  executablePath: acharNavegador(),
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1000,800'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1000, height: 800 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__qc_ready === true', { timeout: 60000 })

  const saidas = await page.evaluate('window.__qc_saidas')
  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })
  for (const [id, dataUrl] of Object.entries(saidas)) {
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    const arq = path.join(dir, 'qc-' + id + '.png')
    fs.writeFileSync(arq, Buffer.from(b64, 'base64'))
    console.log('salvo: ' + arq)
  }
  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 10).join('\n'))
  else console.log('sem erro no console')
} finally {
  await browser.close()
  await server.close()
}
