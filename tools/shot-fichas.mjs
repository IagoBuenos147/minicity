// Fotos das FICHAS — as do feltro (3D) e as clicaveis da faixa (DOM).
//
// Existe porque ficha e uma coisa que so da pra julgar OLHANDO: se o anel
// interno le, se as 8 insercoes do aro tem quina, se a pilha parece pilha e se
// o flash de bloom estourou branco. Numero nenhum responde isso.
//
//   node tools/shot-fichas.mjs            -> shots/fic-*.png (blackjack)
//   node tools/shot-fichas.mjs poker      -> a mesa de poker
//
// A foto 'macro' e o motivo principal do arquivo: ela CONGELA o rAF, empurra a
// lente a 22 cm da pilha e chama engine.render() na mao. Sem congelar, o loop do
// jogo redesenha com a camera dele antes de o screenshot compor, e a macro sai
// igual ao quadro normal.
//
// Precisa do dev server rodando (npm run dev).

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const QUAL = (process.argv[2] || 'blackjack').toLowerCase()

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}

const PORT = 9700 + (process.pid % 260)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-fic-' + PORT),
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
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

try {
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text()) })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.setViewport({ width: 1280, height: 720 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  // prefixo por mesa: rodar poker nao pode apagar as fotos do blackjack, senao
  // nao da pra comparar as duas
  const pre = 'fic-' + (QUAL === 'poker' ? 'pk-' : 'bj-')
  const shot = async (name) => {
    const f = path.join(dir, pre + name + '.png')
    await page.screenshot({ path: f })
    console.log(f)
  }
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  // O dev server tem HMR e ha mais de uma sessao mexendo em src/: um save no
  // meio da sessao recarrega a pagina e window.__game some. Toda etapa espera
  // o jogo estar de pe de novo antes de falar com ele.
  const pronto = () => page.waitForFunction(
    'window.__game && window.__game.cassino && window.__game.casinoMundo', { timeout: 60000 })
  // ... e se a recarga cair NO MEIO de um evaluate, o contexto morre com ele.
  // Tenta de novo em vez de derrubar a sessao inteira de fotos.
  const ev = async (fn, arg) => {
    for (let i = 0; i < 4; i++) {
      try { await pronto(); return await page.evaluate(fn, arg) } catch (err) {
        if (i === 3) throw err
        console.log('  (recarregou, tentando de novo)', String(err.message).slice(0, 60))
        await espera(1200)
      }
    }
  }

  // 1) sai do menu, enche o bolso e senta na mesa
  await ev((qual) => {
    const G = window.__game
    if (G.fluxo && G.fluxo.jogar) G.fluxo.jogar()
    else if (G.hud && G.hud.hideStart) G.hud.hideStart()
    G.carteira.ganharOuro(40000)
    G.carteira.ganharFichas(40000)
    const anc = G.casinoMundo.mesas[qual]
    G.player.setMode('third')
    G.player.teleport(anc.centro.x, anc.centro.z - 1.6, 0)
  }, QUAL)
  await espera(1400)
  await ev((qual) => {
    const G = window.__game
    if (qual === 'poker') G.cassino.abrirPoker()
    else G.cassino.abrirBlackjack()
  }, QUAL)
  // 3,6 s: o voo da lente ate a mesa e longo, e foto tirada no meio dele mostra
  // o telhado do cassino em vez do feltro.
  await espera(3600)
  // paralaxe: sem nenhum mousemove a lente fica torta pro canto
  await page.mouse.move(640, 360)
  await espera(600)
  await shot('01-mesa')

  // 2) a faixa: a fileira de fichas de perto, em repouso e com o ponteiro em
  //    cima. Recortada e em 3x porque em 50 px na foto de 1280 nao da pra
  //    julgar quina de insercao nenhuma.
  const zona = await ev(() => {
    const cx = document.querySelector('.mcrp-mesa-fichas')
    const b = document.querySelector('.mcrp-mesa-fichabt')
    if (!cx || !b) return null
    const r = cx.getBoundingClientRect()
    const rb = b.getBoundingClientRect()
    return {
      // margem larga: a onda do clique estoura ate 1,9x fora do botao, e um
      // recorte justo cortava justamente o efeito que a foto existe pra provar
      clip: { x: Math.max(0, Math.floor(r.x) - 26), y: Math.max(0, Math.floor(r.y) - 34), width: Math.ceil(r.width) + 52, height: Math.ceil(r.height) + 68 },
      bt: { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 },
    }
  })
  if (zona) {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 3 })
    await espera(400)
    await page.screenshot({ path: path.join(dir, pre + '02-faixa.png'), clip: zona.clip })
    console.log(path.join(dir, pre + '02-faixa.png'))
    await page.mouse.move(zona.bt.x, zona.bt.y)
    await espera(360)
    await page.screenshot({ path: path.join(dir, pre + '02b-faixa-hover.png'), clip: zona.clip })
    console.log(path.join(dir, pre + '02b-faixa-hover.png'))
    // estados: selecionada (halo dourado), apagadas (sem saldo) e o "pop" do
    // clique pego no meio da animacao
    await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-fichabt')]
      if (bs[1]) bs[1].classList.add('mcrp-mesa-sel')
      if (bs[3]) bs[3].disabled = true
      if (bs[4]) bs[4].disabled = true
      if (bs[2]) { bs[2].classList.remove('mcrp-mesa-pop'); void bs[2].offsetWidth; bs[2].classList.add('mcrp-mesa-pop') }
    })
    // 90 ms: a onda do clique dura 460 ms e o anel so e grosso e opaco no
    // comeco. Fotografar no meio da animacao mostra um circulo apagado e da a
    // impressao errada de que o efeito nao existe.
    await espera(90)
    await page.screenshot({ path: path.join(dir, pre + '02c-faixa-estados.png'), clip: zona.clip })
    console.log(path.join(dir, pre + '02c-faixa-estados.png'))
    // e a versao de celular: o @media de 760 px baixa a ficha pra 42
    await page.setViewport({ width: 700, height: 900, deviceScaleFactor: 3 })
    await espera(500)
    const z2 = await page.evaluate(() => {
      const cx = document.querySelector('.mcrp-mesa-fichas')
      const r = cx.getBoundingClientRect()
      return { x: Math.floor(r.x) - 8, y: Math.floor(r.y) - 12, width: Math.ceil(r.width) + 16, height: Math.ceil(r.height) + 24 }
    })
    await page.screenshot({ path: path.join(dir, pre + '02d-faixa-celular.png'), clip: z2 })
    console.log(path.join(dir, pre + '02d-faixa-celular.png'))
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('.mcrp-mesa-fichabt')) {
        b.disabled = false
        b.classList.remove('mcrp-mesa-sel', 'mcrp-mesa-pop')
      }
    })
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
    await espera(400)
  }

  // 3) empilha ficha no feltro clicando nos botoes, do maior pro menor
  const clicadas = await ev(() => {
    const bs = [...document.querySelectorAll('.mcrp-mesa-fichabt')].filter((b) => !b.disabled)
    const ordem = bs.slice().reverse().slice(0, 6)
    const out = []
    for (const b of ordem) { b.click(); out.push(b.textContent.trim()) }
    return out
  })
  console.log('  fichas clicadas:', clicadas.join(' '))
  // 0,25 s: no meio da queda, com ficha no ar, quicando e piscando
  await espera(250)
  await shot('03-caindo')
  await espera(1400)
  await shot('04-pilha')

  // 4) MACRO: a lente a 22 cm da pilha, renderizada e LIDA na mao.
  //
  // page.screenshot() NAO serve aqui: ele fotografa a copia que o compositor
  // tem do canvas, e essa copia continua sendo o ultimo quadro do loop do jogo
  // — a macro saia identica a foto anterior. toDataURL() no MESMO passo do
  // render le o framebuffer de verdade (por isso o render e o toDataURL tem
  // que estar dentro do mesmo evaluate).
  const macro = await ev((qual) => {
    const G = window.__game
    const grupo = G.scene.getObjectByName('mesa3d-' + qual)
    if (!grupo) return { erro: 'sem grupo mesa3d-' + qual }
    let fichas = null
    grupo.traverse((o) => { if (o.isInstancedMesh) fichas = o })
    if (!fichas || !fichas.count) return { erro: 'nenhuma ficha viva' }
    // centro da pilha: media das instancias vivas, levada pro mundo
    const V = G.camera.position.constructor
    const M = G.camera.matrixWorld.constructor
    const m = new M()
    const alvo = new V()
    for (let i = 0; i < fichas.count; i++) {
      fichas.getMatrixAt(i, m)
      alvo.x += m.elements[12]; alvo.y += m.elements[13]; alvo.z += m.elements[14]
    }
    alvo.divideScalar(fichas.count)
    fichas.localToWorld(alvo)
    window.requestAnimationFrame = () => 0   // congela o loop do jogo
    const tiros = []
    // duas alturas: rasante (mostra o aro e a costura da pilha) e de cima
    // (mostra o anel interno, o miolo e as insercoes entrando pela tampa)
    for (const c of [[0.085, 0.055, -0.135, 30], [0.045, 0.150, -0.075, 30]]) {
      G.camera.position.set(alvo.x + c[0], alvo.y + c[1], alvo.z + c[2])
      G.camera.fov = c[3]
      G.camera.up.set(0, 1, 0)
      G.camera.lookAt(alvo)
      G.camera.updateProjectionMatrix()
      G.camera.updateMatrixWorld(true)
      G.engine.render()
      tiros.push(G.renderer.domElement.toDataURL('image/png'))
    }
    // 3o tiro: SO A FICHA DE CIMA no pico do flash, que e o caso real (quem
    // acabou de pousar). Escrevo direto no atributo aFlash da geometria porque
    // de fora nao da pra alcancar as fichas vivas, e e exatamente o mesmo canal
    // que o pouso usa. Flashear a pilha inteira dava um tijolo branco e mentia
    // sobre o efeito.
    const fl = fichas.geometry.attributes.aFlash
    if (fl) {
      fl.array.fill(0)
      fl.array[fichas.count - 1] = 0.85
      fl.needsUpdate = true
      G.camera.position.set(alvo.x + 0.085, alvo.y + 0.055, alvo.z - 0.135)
      G.camera.fov = 30
      G.camera.lookAt(alvo)
      G.camera.updateProjectionMatrix()
      G.camera.updateMatrixWorld(true)
      G.engine.render()
      tiros.push(G.renderer.domElement.toDataURL('image/png'))
    }
    const inf = G.renderer.info.render
    return {
      tiros,
      nota: fichas.count + ' fichas, ' + inf.triangles + ' tris na cena, ' +
        (fichas.geometry.attributes.position.count / 3) + ' tris por ficha',
    }
  }, QUAL)
  if (macro.erro) console.log('  macro:', macro.erro)
  else {
    console.log('  macro:', macro.nota)
    const nomes = ['05-macro-rasante', '06-macro-de-cima', '07-macro-flash']
    for (let i = 0; i < macro.tiros.length; i++) {
      const f = path.join(dir, pre + nomes[i] + '.png')
      fs.writeFileSync(f, Buffer.from(macro.tiros[i].split(',')[1], 'base64'))
      console.log(f)
    }
  }
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
