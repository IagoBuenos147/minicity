// A CAMERA DE 3a PESSOA TEM QUE DEIXAR VER A CARA DO PERSONAGEM.
//
// Este teste existe por causa de duas queixas seguidas do dono do projeto, que
// sao dois lados da mesma coisa:
//
//   1. "quando olho de frente e mexo o mouse pra direita ele simplesmente
//      TELEPORTA a cabeca de um lado pro outro"
//   2. "a camera em terceira pessoa, eu nao consigo olhar pra tela com o
//      personagem"
//
// A primeira correcao tentada — fazer o CORPO girar atras da camera quando o
// pescoco chegava no limite — resolveu (1) e causou (2): o boneco fugia junto
// com a camera e o jogador orbitava 360 graus vendo as costas o tempo todo.
//
// A correcao boa e a cabeca DESISTIR de acompanhar quando a camera passa pro
// lado de tras (controller.js, passo 9), com o corpo parado. Entao o teste
// confere as duas coisas na mesma varredura:
//
//   - dando uma volta inteira com o mouse, o CORPO nao se mexe e existe um
//     instante em que a camera fica de frente pra ele;
//   - o angulo da cabeca nunca da um salto entre um quadro e o outro.
//
// E confere a tecla X (modo vitrine): a camera vai pra frente do personagem.
//
//   node tools/teste-camera.mjs

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { garantirServidor } from './servidor-dev.mjs'

const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
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
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cam-' + PORT),
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

const casos = []
function ok(nome, passou, detalhe) {
  casos.push(passou)
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

// protocolTimeout alto: a varredura de 360 graus roda quadro a quadro num
// renderizador por software, e o padrao de 30 s do puppeteer estoura no meio.
const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 240000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1500))

  await page.evaluate(() => {
    window.__game.fluxo.jogar()
    window.__game.player.teleport(43, 4, Math.PI)
  })
  await page.evaluate(() => new Promise((res) => {
    let i = 0
    const f = () => { (++i >= 90) ? res(i) : requestAnimationFrame(f) }
    requestAnimationFrame(f)
  }))

  // --- 1) uma volta inteira com o mouse, parado -------------------------------
  // A varredura sai daqui de FORA, um passo por chamada: um laco de 36 passos
  // dentro de um page.evaluate so estoura o protocolTimeout do puppeteer num
  // renderizador por software.
  const PASSOS = 36                          // 10 graus por passo
  const corpo0 = await page.evaluate(() => window.__game.character.root.rotation.y)
  let maiorSalto = 0
  let anterior = null
  let melhorFrente = -1
  for (let i = 0; i < PASSOS; i++) {
    const m = await page.evaluate(async (n) => {
      const G = window.__game
      // girarCamera e nao `yaw =`: o SETTER de yaw realinha o corpo junto (e o
      // que teleporte e cutscene querem). Usar ele aqui giraria o boneco a cada
      // passo e o teste mediria a si mesmo.
      G.player.girarCamera((Math.PI * 2) / n)
      // tres quadros por passo pra o damp da cabeca andar
      await new Promise((r) => requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(r))))
      G.character.root.updateMatrixWorld(true)
      const p = G.character.root.position
      const dx = G.camera.position.x - p.x, dz = G.camera.position.z - p.z
      const d = Math.hypot(dx, dz) || 1
      const yb = G.character.root.rotation.y
      return {
        cabeca: G.character.parts.headPivot.rotation.y + G.character.parts.neckLook.rotation.y,
        frente: (dx / d) * Math.sin(yb) + (dz / d) * Math.cos(yb),
        corpo: yb,
      }
    }, PASSOS)
    if (anterior !== null) maiorSalto = Math.max(maiorSalto, Math.abs(m.cabeca - anterior))
    anterior = m.cabeca
    melhorFrente = Math.max(melhorFrente, m.frente)
  }
  const corpo1 = await page.evaluate(() => window.__game.character.root.rotation.y)
  const volta = { girouCorpo: Math.abs(corpo1 - corpo0), maiorSalto, melhorFrente }

  ok('o corpo NAO gira quando so a camera gira',
    volta.girouCorpo < 0.02, 'girou ' + volta.girouCorpo.toFixed(3) + ' rad')
  ok('da pra por a camera DE FRENTE pro personagem',
    volta.melhorFrente > 0.98, 'melhor alinhamento ' + volta.melhorFrente.toFixed(3))
  // O QUE ESTE NUMERO SIGNIFICA. O passo do teste e grosso de proposito: a
  // camera anda 10 graus (0.175 rad) DE UMA VEZ e a cabeca tem tres quadros pra
  // alcancar. Entao o maximo medido aqui e da ordem do proprio passo da camera —
  // ou seja, a cabeca ACOMPANHA, que e o que se quer. Com o mouse a 60 quadros o
  // passo e uma fracao disso.
  //
  // O defeito original dava mais de 1.5 rad NUM QUADRO, com a camera parada. E
  // isso que o teste separa: 0.25 esta uma ordem de grandeza abaixo do bug e
  // acima do movimento continuo.
  ok('a cabeca acompanha sem saltar',
    volta.maiorSalto < 0.25, 'maior passo da cabeca ' + volta.maiorSalto.toFixed(3)
      + ' rad, pra 0.175 de camera')

  // --- 2) a tecla X ----------------------------------------------------------
  const vit = await page.evaluate(async () => {
    const G = window.__game
    G.player.vitrine(true)
    await new Promise((r) => {
      let i = 0
      const f = () => { (++i >= 120) ? r(i) : requestAnimationFrame(f) }
      requestAnimationFrame(f)
    })
    const p = G.character.root.position
    const dx = G.camera.position.x - p.x, dz = G.camera.position.z - p.z
    const d = Math.hypot(dx, dz)
    const yb = G.character.root.rotation.y
    return {
      ligado: G.player.emVitrine,
      dist: d,
      frente: (dx / d) * Math.sin(yb) + (dz / d) * Math.cos(yb),
      alturaCam: G.camera.position.y,
    }
  })
  ok('X liga a vitrine', vit.ligado === true)
  ok('na vitrine a camera fica DE FRENTE', vit.frente > 0.95, 'alinhamento ' + vit.frente.toFixed(3))
  ok('na vitrine cabe o corpo inteiro',
    vit.dist > 3.0 && vit.alturaCam > 0.7 && vit.alturaCam < 1.5,
    'dist ' + vit.dist.toFixed(2) + ' m, camera a ' + vit.alturaCam.toFixed(2) + ' m')

  const saiu = await page.evaluate(async () => {
    window.__game.player.vitrine(false)
    await new Promise((r) => {
      let i = 0
      const f = () => { (++i >= 90) ? r(i) : requestAnimationFrame(f) }
      requestAnimationFrame(f)
    })
    return window.__game.player.emVitrine
  })
  ok('X de novo desliga a vitrine', saiu === false)

  const falhas = casos.filter((c) => !c).length
  console.log('')
  console.log((casos.length - falhas) + '/' + casos.length + ' casos passaram')
  process.exitCode = falhas ? 1 : 0
} finally {
  await browser.disconnect()
  try { filho.kill() } catch (err) { void err }
}
