// OS NPCS DA CALCADA DA CASA, em uma folha: o trio de longe e um close de cada.
//
//   node tools/shot-npcs.mjs            -> o trio e um close de cada
//   node tools/shot-npcs.mjs conversa   -> a conversa: camera girando e centrada
//
// Por que existe: NPC se julga pela SILHUETA e pelos TRACOS (o chapeu, a barba,
// o chinelo), e nenhum dos dois aparece numa foto do jogo inteiro — eles tem uns
// 40 px de altura na rua. Aqui cada um vem de perto, com nome, ao lado do plano
// que mostra como eles se distribuem na calcada.
//
// Roda em cima do BUILD (npm run build + servidor.js), como as outras
// ferramentas deste projeto: com mais de uma sessao mexendo na pasta, um arquivo
// salvo no meio da rodada faz o Vite recarregar e a foto se perde.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8900 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

// Onde a camera fica pra cada tomada. z menor = mais longe da casa (a fachada
// esta em z = 12) e yaw PI = olhando pra ela.
// `larg/esq/topo` sao o recorte: a foto do jogo tem 1280x720 e a janela da
// celula tem 620x360, entao a imagem entra reduzida e deslocada pra centrar o
// que interessa. NA PRIMEIRA VERSAO os tres closes cortavam na altura do rosto e
// o plano geral cortava no telhado — recorte de NPC tem que pegar o CORPO
// INTEIRO, porque metade dos tracos pedidos (chinelo, bota) esta no pe.
const soConversa = process.argv.slice(2).includes('conversa')

const TOMADAS = [
  // plano geral: a foto inteira reduzida, sem deslocamento
  { nome: 'os tres na calcada', x: 44.6, z: 4.2, larg: 620, esq: 0, topo: 0 },
  // closes: 70% do tamanho, centrados no boneco (ele fica no meio do quadro,
  // um pouco abaixo da linha do horizonte)
  { nome: 'Seu Nilton — chapeu e bota', x: 40.4, z: 8.7, larg: 900, esq: -140, topo: -25 },
  { nome: 'Dede — barba cheia e chinelo', x: 46.4, z: 8.4, larg: 900, esq: -140, topo: -25 },
  { nome: 'Tonho — o da foto', x: 48.6, z: 8.6, larg: 900, esq: -140, topo: -25 },
]

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

const build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
await new Promise((r) => build.on('exit', r))
const srv = process.env.GAME_URL ? null : spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }), stdio: 'ignore',
})
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(URL_BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}

const PORT = 9711 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-npc-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1280,720', 'about:blank',
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
  browserWSEndpoint: await esperarDebugger(), protocolTimeout: 300000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text().slice(0, 200))
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2200))

  await page.evaluate(() => {
    const G = window.__game
    G.fluxo.jogar()
    if (G.menu && G.menu.fechar) G.menu.fechar()
    G.hud.showHelp(false)
    // o HUD inteiro sai: aqui so interessa a rua
    G.hud.setJogando(false)
    document.querySelectorAll('.mcrp-menu, #hud-start').forEach((e) => { e.style.display = 'none' })
  })

  // --- a conversa ----------------------------------------------------------
  // Duas tomadas do MESMO gesto: a camera no meio do caminho e a camera ja
  // centrada. Uma foto so nao mostra movimento, e movimento e metade do pedido.
  if (soConversa) {
    // AQUI E page.screenshot, E NAO toDataURL DO CANVAS — e a diferenca entre
    // ver a conversa e ver so a rua. O diálogo e DOM POR CIMA do canvas (a
    // saudacao, as opcoes, o "Esc voltar"), e toDataURL devolve unicamente o
    // buffer do WebGL: a primeira versao deste modo saiu com a camera girando
    // certinho e nenhuma interface na tela. O mesmo motivo esta escrito no
    // cabecalho de tools/shot-tela.mjs.
    //
    // Como page.screenshot nao da pra montar em grade dentro da pagina, saem
    // dois arquivos em vez de uma folha.
    const dirC = path.join(ROOT, 'shots')
    fs.mkdirSync(dirC, { recursive: true })

    await page.evaluate(() => {
      const G = window.__game
      // de costas pro NPC de proposito: e o giro que se quer ver
      G.player.teleport(46.4, 8.2, 0.9)
      for (let i = 0; i < 20; i++) G.player.update(1 / 60)
      G.hud.setJogando(true)
      const it = G.interaction.items.find((x) => x.id === 'npc-casa-ded')
      if (it) it.onInteract(G)
      for (let i = 0; i < 6; i++) { G.player.update(1 / 60); G.conversa.atualizar(1 / 60) }
      G.engine.render()
    })
    const a1 = path.join(dirC, 'conversa-1-girando.png')
    await page.screenshot({ path: a1 })
    console.log(a1)

    await page.evaluate(() => {
      const G = window.__game
      for (let i = 0; i < 45; i++) { G.player.update(1 / 60); G.conversa.atualizar(1 / 60) }
      G.engine.render()
    })
    const a2 = path.join(dirC, 'conversa-2-centrada.png')
    await page.screenshot({ path: a2 })
    console.log(a2)

    // 3a tomada: a RESPOSTA. E o quadro que faltava — a versao anterior mandava
    // a fala pro toast, no canto superior direito, e nenhuma das duas fotos
    // acima mostrava isso (elas param antes de escolher). Aqui a escolha e
    // feita de verdade, pelo teclado, pra ver onde o texto sai.
    await page.evaluate(() => {
      const G = window.__game
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true }))
      for (let i = 0; i < 10; i++) { G.player.update(1 / 60); G.conversa.atualizar(1 / 60) }
      G.engine.render()
    })
    const a3 = path.join(dirC, 'conversa-3-resposta.png')
    await page.screenshot({ path: a3 })
    console.log(a3)
  }

  const cels = []
  for (const t of (soConversa ? [] : TOMADAS)) {
    const url = await page.evaluate((tom) => {
      const G = window.__game
      G.player.teleport(tom.x, tom.z, Math.PI)
      // quadros na mao: o passeio ate a pose final leva alguns, e em headless o
      // rAF nao gira sozinho
      for (let i = 0; i < 30; i++) G.player.update(1 / 60)
      G.engine.render()
      return G.renderer.domElement.toDataURL('image/png')
    }, t)
    cels.push(Object.assign({ url }, t))
  }

  await page.evaluate((c) => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;padding:12px;'
      + 'overflow:auto;font:14px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
    const t = document.createElement('div')
    t.textContent = 'OS TRES DA CALCADA DA CASA 42'
    t.style.cssText = 'font-size:20px;font-weight:bold;margin-bottom:10px'
    d.appendChild(t)
    const g = document.createElement('div')
    g.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
    for (const cel of c) {
      const w = document.createElement('div')
      const lb = document.createElement('div')
      lb.textContent = cel.nome
      lb.style.cssText = 'padding:3px 0;color:#9fe8c0;font-weight:bold;font-size:16px'
      const jan = document.createElement('div')
      jan.style.cssText = 'width:620px;height:360px;overflow:hidden;position:relative;'
        + 'background:#202228;border:1px solid #3a3d45'
      const im = document.createElement('img')
      im.src = cel.url
      im.style.cssText = 'width:' + cel.larg + 'px;position:absolute;left:'
        + cel.esq + 'px;top:' + cel.topo + 'px'
      jan.appendChild(im)
      w.appendChild(lb); w.appendChild(jan); g.appendChild(w)
    }
    d.appendChild(g)
    document.body.appendChild(d)
  }, cels)
  await new Promise((r) => setTimeout(r, 700))

  if (!soConversa) {
    const dir = path.join(ROOT, 'shots')
    fs.mkdirSync(dir, { recursive: true })
    const arq = path.join(dir, 'npcs-casa.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 8).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
