// O ARQUIVO UNICO TEM QUE ABRIR POR file://, DE VERDADE.
//
// Este teste existe porque "deu build sem erro" nao prova nada aqui: o defeito
// que ele previne (modulo ES barrado pelo CORS de origem opaca) so aparece na
// hora em que o navegador ABRE o arquivo do disco. Entao ele abre mesmo,
// pelo protocolo file://, e confere que o jogo subiu.
//
//   npm run local && node tools/teste-local.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARQ = path.join(RAIZ, 'MiniCityRP.html')
if (!fs.existsSync(ARQ)) {
  console.error('MiniCityRP.html nao existe. Rode `npm run local` antes.')
  process.exit(1)
}

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
const bin = CANDIDATOS.find((p) => fs.existsSync(p))
if (!bin) throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')

const PORT = 9611 + (process.pid % 120)
// SEM --allow-file-access-from-files de proposito: o jogador nao vai abrir o
// navegador com flag nenhuma. Se so passar com a flag, nao passou.
const filho = spawn(bin, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-local-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function ws() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (e) { void e }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const casos = []
function ok(nome, passou, detalhe) {
  casos.push(passou)
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const browser = await puppeteer.connect({ browserWSEndpoint: await ws(), protocolTimeout: 120000 })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|WebSocket|net::ERR/.test(m.text())) erros.push(m.text())
  })

  const url = pathToFileURL(ARQ).href
  ok('a URL e file://', url.startsWith('file://'), url)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  let subiu = true
  try {
    await page.waitForFunction('window.__game && window.__game.menu', { timeout: 60000 })
  } catch (e) { void e; subiu = false }
  ok('o jogo subiu abrindo o arquivo do disco', subiu)
  if (!subiu) {
    console.log('  erros:', erros.slice(0, 4).join(' | ') || '(nenhum)')
  }

  if (subiu) {
    const info = await page.evaluate(async () => {
      const G = window.__game
      G.fluxo.jogar()
      G.player.teleport(43, 4, Math.PI)
      await new Promise((r) => { let i = 0; const f = () => { (++i >= 60) ? r(i) : requestAnimationFrame(f) }; requestAnimationFrame(f) })
      const cv = G.renderer.domElement
      let pintou = false
      try { pintou = cv.toDataURL('image/png').length > 5000 } catch (e) { void e }
      return {
        catalogos: {
          olhos: G.provador ? undefined : undefined,
        },
        pintou,
        w: cv.width,
        h: cv.height,
        veiculos: !!G.veiculos,
        cidade: !!G.city,
      }
    })
    ok('o canvas WebGL desenhou', info.pintou, info.w + 'x' + info.h)
    ok('a cidade e os veiculos montaram', info.cidade && info.veiculos)

    // a tela de criacao de personagem e o caminho que ele quer testar
    const criacao = await page.evaluate(async () => {
      const G = window.__game
      G.fluxo.menu()
      G.fluxo.solo()
      await new Promise((r) => setTimeout(r, 900))
      const abas = [...document.querySelectorAll('.mcrp-cri .cz-tab')].map((b) => (b.textContent || '').trim())
      const cards = document.querySelectorAll('.mcrp-cri .cz-sec.is-active .cz-card').length
      return { abas: abas.length, cards }
    })
    ok('a tela de criacao abre e monta os cards', criacao.abas > 10 && criacao.cards > 0,
      criacao.abas + ' abas, ' + criacao.cards + ' cards')

    fs.mkdirSync(path.join(RAIZ, 'shots'), { recursive: true })
    fs.writeFileSync(path.join(RAIZ, 'shots', 'p17-arquivo-local.png'), await page.screenshot())
  }

  ok('nenhum erro no console', erros.length === 0, erros.slice(0, 3).join(' | ') || 'limpo')

  const falhas = casos.filter((c) => !c).length
  console.log('')
  console.log((casos.length - falhas) + '/' + casos.length + ' casos passaram')
  process.exitCode = falhas ? 1 : 0
} finally {
  await browser.disconnect()
  try { filho.kill() } catch (e) { void e }
}
