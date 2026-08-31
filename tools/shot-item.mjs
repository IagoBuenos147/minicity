// FOTO DE UM ITEM DE MAO, do jeito que o jogador ve.
//
//   node tools/shot-item.mjs                 -> todos os itens do mercado
//   node tools/shot-item.mjs erva-broto      -> so esse
//
// Peca de mao e a unica coisa deste jogo que o jogador ve a vinte centimetros
// do olho, e a grade do provador (shot-catalogo) nao serve: la o boneco esta a
// dois metros e o item cabe em doze pixels. Aqui o caminho e o mesmo do jogo —
// poe no inventario, seleciona a vaga, o main manda pra mao — e a foto sai da
// camera de primeira pessoa.
//
// Como shot-catalogo, roda sobre o BUILD (dist estatico) e nao sobre o dev
// server: com outra sessao salvando arquivo, o Vite recarrega a pagina no meio
// e mata o contexto.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8820 + (process.pid % 60)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

// a lista sai do proprio catalogo, em Node (o bundle nao da pra importar por
// caminho e o jogo nao expoe o modulo no window)
const MK = await import(pathToFileURL(
  path.join(ROOT, 'src', 'mobilia', 'mercado.js')).href)
const pedidos = process.argv.slice(2)
const itens = MK.CATALOGO_MERCADO
  .filter((m) => !pedidos.length || pedidos.indexOf(m.id) >= 0)
  .map((m) => ({ id: m.id, nome: m.nome }))
if (!itens.length) {
  console.error('ids validos: ' + MK.CATALOGO_MERCADO.map((m) => m.id).join(' '))
  process.exit(1)
}

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

const CDP = 9880 + (process.pid % 40)
const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'shotitem-' + CDP),
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' })
let ws = null
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
const browser = await puppeteer.connect({ browserWSEndpoint: ws, protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.mao', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const it of itens) {
    const img = await page.evaluate(async (id) => {
      const G = window.__game
      const T = G.THREE
      // ENTRAR NO JOGO PRIMEIRO. Sem isto a camera fica no sobrevoo da
      // abertura e a foto sai da cidade vista de cima, com a mao do jogador
      // fora de cena — foi exatamente o que a primeira tomada mostrou.
      if (G.fluxo && typeof G.fluxo.jogar === 'function') G.fluxo.jogar()
      await new Promise((r) => setTimeout(r, 400))
      G.fluxo.foto(true)
      G.player.teleport(6, -2.0, Math.PI)
      G.player.setMode('first')
      G.inventario.limpar()
      G.inventario.adicionar(id, 1)
      // acha a vaga onde ele caiu e seleciona, que e o caminho do jogo
      let vaga = -1
      for (let i = 0; i < G.inventario.vagas; i++) {
        const s = G.inventario.ver(i)
        if (s && s.id === id) { vaga = i; break }
      }
      if (vaga >= 0) G.selecionarVaga(vaga)
      // o saque e animado: 40 quadros pra peca subir e assentar
      // O SAQUE E ANIMADO e mora no laco do jogo, que em headless nao roda:
      // pedir quadros de verdade e o unico jeito de a peca chegar na altura de
      // segurar antes da foto.
      await new Promise((res) => {
        let n = 0
        const f = () => { (++n >= 50) ? res() : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      })
      G.engine.render()
      const larga = G.renderer.domElement.toDataURL('image/png')
      // A SEGUNDA FOTO E O QUE IMPORTA. A mao fica num canto da tela e, no
      // enquadramento normal, uma peca de 8 cm ocupa poucos pixels — nao da
      // pra julgar cor nem detalhe. Fechar o FOV aproxima a peca sem mover a
      // camera (a mao e filha dela, entao andar com a camera levaria a peca
      // junto e nao aproximaria nada).
      // CAMERA PROPRIA, e nao um FOV fechado: a peca e filha da camera do
      // jogo, entao mexer nela nao aproxima nada — e fechar o FOV pegou a
      // camera no meio do movimento da abertura e a foto saiu da cidade vista
      // de cima. Aqui a camera nova e posta a 18 cm da peca, no espaco do
      // mundo, e o render usa ela.
      let perto = larga
      const grupo = G.mao && G.mao.grupo
      if (grupo) {
        const cx = new T.Box3().setFromObject(grupo)
        if (!cx.isEmpty()) {
          const centro = cx.getCenter(new T.Vector3())
          const cam2 = new T.PerspectiveCamera(38, 16 / 9, 0.01, 6)
          // de frente pra peca, do lado da camera do jogo, um tico acima
          const paraCamera = new T.Vector3()
          G.camera.getWorldPosition(paraCamera).sub(centro).normalize()
          cam2.position.copy(centro).addScaledVector(paraCamera, 0.17)
          cam2.position.y += 0.035
          cam2.lookAt(centro)
          G.renderer.render(G.scene, cam2)
          perto = G.renderer.domElement.toDataURL('image/png')
        }
      }
      return { larga, perto }
    }, it.id)
    const arq = path.join(dir, 'item-' + it.id + '.png')
    fs.writeFileSync(arq, Buffer.from(img.larga.split(',')[1], 'base64'))
    const arqP = path.join(dir, 'item-' + it.id + '-perto.png')
    fs.writeFileSync(arqP, Buffer.from(img.perto.split(',')[1], 'base64'))
    console.log(arq + '  ' + it.nome)
    console.log(arqP)

    // TERCEIRA FOTO: a LOJA. Nao adianta o item existir e ficar bonito na mao
    // se ele nao aparece na prateleira — e a vitrine e DOM por cima do canvas,
    // entao ela so sai num page.screenshot, nunca num toDataURL do canvas.
    await page.evaluate((id) => {
      const G = window.__game
      G.fluxo.foto(false)
      if (G.mercado && typeof G.mercado.abrir === 'function') G.mercado.abrir(id)
    }, it.id)
    // A MINIATURA DO CARD E ASSINCRONA: ela e renderizada num canvas proprio
    // e so entao vira <img>. Setecentos milissegundos pegavam o card ainda
    // vazio e a foto mentia dizendo que o item nao tinha imagem.
    await new Promise((r) => setTimeout(r, 3000))
    const arqL = path.join(dir, 'item-' + it.id + '-loja.png')
    await page.screenshot({ path: arqL })
    console.log(arqL)
    await page.evaluate(() => {
      const G = window.__game
      if (G.mercado && typeof G.mercado.fechar === 'function') G.mercado.fechar()
    })
  }

  if (erros.length) console.log('ERROS:\n' + erros.slice(0, 6).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
