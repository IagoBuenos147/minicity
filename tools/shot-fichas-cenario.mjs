// Fotos + CONTAGEM da ficha de CENARIO do cassino. Salva em shots/fic-cen-*.png.
//
//   node tools/shot-fichas-cenario.mjs
//
// Por que existe: o cassino tinha DUAS fichas ao mesmo tempo. A viva, de
// cassino/mesa-3d.js (perfil torneado, 8 insercoes no aro), e a de cenario, de
// world/casino.js, que era um cilindro de 14 lados sem desenho. Elas apareciam
// no MESMO QUADRO — as pilhas do jogador na beirada e o pote no meio do pano —
// e o dono viu na hora. Uma foto do salao nao prova nada aqui: so a mesa ABERTA
// coloca as duas lado a lado.
//
// O script tambem CONTA, porque "ficou igual" e uma frase sobre draw call e
// triangulo tambem: le renderer.info nas mesmas posicoes que tools/smoke.mjs
// mede e conta quantos meshes assados sobraram com o material da ficha.
//
// Copiado de tools/shot-luz.mjs (que ja sabia chegar nas duas mesas). Em
// headless com swiftshader o jogo anda a 2-3 fps: nada aqui espera por segundo
// cravado, tudo faz poll no estado.
//
// As cenas:
//   01     salao a pe, de frente pro caixa — a vitrine continua de pe?
//   02     salao a pe, entre as duas mesas — o pano visto de longe
//   03     poker ABERTO com as fichas vivas do jogador no pano
//   04     poker ABERTO depois de uma aposta
//   05     blackjack ABERTO com o rack da casa no quadro
//   07..10 MACROS de camera solta: gaveta do caixa, pote, rack e carpete. Sao
//          elas que mostram o desenho — insercao, pastilha, chanfro — que numa
//          foto de jogo tem 30 px e nao da pra julgar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
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

const PORT = 9833 + (process.pid % 400)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-fic-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function waitForDebugger() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const browser = await puppeteer.connect({
  browserWSEndpoint: await waitForDebugger(), protocolTimeout: 600000,
})
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/** Uma aba por cena: o cassino inteiro por software come memoria demais pra uma
 *  aba atravessar salao + poker + blackjack sem perder o contexto. */
async function sessao(rotulo, corpo) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('  [erro pagina]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text()) })
  console.log('cena: ' + rotulo)
  try {
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 90000 })
    const ev = async (fn, arg) => {
      for (let i = 0; ; i++) {
        try {
          await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 90000 })
          return await page.evaluate(fn, arg)
        } catch (e) {
          if (i >= 4) throw e
          await espera(2000)
        }
      }
    }
    const shot = async (name) => {
      const f = path.join(dir, 'fic-cen-' + name + '.png')
      await page.screenshot({ path: f })
      console.log('  foto: ' + f)
    }

    // MACRO: a camera solta, pra ver a ficha de perto.
    //
    // O jogo nao tem camera livre — a de terceira pessoa persegue o boneco e a
    // da mesa e escrita por cassino/mesa-3d.js. Aqui a gente poe a camera onde
    // quer, RENDERIZA e COPIA o canvas na MESMA tarefa: o proximo quadro do
    // jogo devolve a lente ao lugar dela, mas a copia ja foi feita. Sem o
    // 'mesma tarefa' o navegador ja trocou o buffer (o renderer nao usa
    // preserveDrawingBuffer) e o canvas 2D copia preto.
    const macro = async (name, pos, alvo, fov) => {
      const url = await ev((a) => {
        const G = window.__game
        const c = G.camera
        c.position.set(a.pos[0], a.pos[1], a.pos[2])
        c.lookAt(a.alvo[0], a.alvo[1], a.alvo[2])
        c.fov = a.fov
        c.updateProjectionMatrix()
        G.engine.render()
        const src = G.renderer.domElement
        const cv = document.createElement('canvas')
        cv.width = src.width
        cv.height = src.height
        cv.getContext('2d').drawImage(src, 0, 0)
        return cv.toDataURL('image/png')
      }, { pos, alvo, fov })
      const f = path.join(dir, 'fic-cen-' + name + '.png')
      fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'))
      console.log('  macro: ' + f)
    }

    // REAPLICAVEL de proposito. O vite manda full-reload no meio da corrida (as
    // outras abas do projeto salvam arquivo) e a pagina volta pro MENU: sem
    // chamar isto de novo, a foto seguinte sai com o letreiro do menu por cima
    // da mesa. Ja aconteceu duas vezes.
    const preparar = () => ev(() => {
      const G = window.__game
      if (G.fluxo && G.fluxo.jogar) G.fluxo.jogar()
      G.carteira.ganharOuro(20000)
      G.carteira.ganharFichas(20000)
      G.hud.showHelp(false)
      for (const e of document.querySelectorAll('div[class*="mcrp-tut"]')) e.style.display = 'none'
    })
    await preparar()
    await espera(1500)
    await corpo(ev, shot, page, macro, preparar)
  } finally {
    try { await page.close() } catch (err) { void err }
  }
}

/** Espera a camera ATERRISSAR. So conta a leitura se o renderer desenhou quadro
 *  novo desde a anterior — com 2 fps duas leituras a 700 ms caem no mesmo. */
async function esperarCamera(ev, alvo, max = 60) {
  let ant = null, quietas = 0
  for (let i = 0; i < max; i++) {
    const p = await ev(() => {
      const c = window.__game.camera
      return [c.position.x, c.position.y, c.position.z, window.__game.renderer.info.render.frame]
    })
    if (ant && p[3] < ant[3]) return { pos: [0, 0, 0], dist: 999, recarregou: true }
    if (ant && p[3] - ant[3] >= 2) {
      const d = Math.abs(p[0] - ant[0]) + Math.abs(p[1] - ant[1]) + Math.abs(p[2] - ant[2])
      quietas = d < 0.01 ? quietas + 1 : 0
      if (quietas >= 3) break
      ant = p
    } else if (!ant) ant = p
    await espera(700)
  }
  const c = ant || [0, 0, 0]
  const dist = alvo ? Math.hypot(c[0] - alvo[0], c[2] - alvo[1]) : null
  return { pos: [+c[0].toFixed(2), +c[1].toFixed(2), +c[2].toFixed(2)], dist: dist && +dist.toFixed(2) }
}

async function sentar(ev, page, mesa, abrir, alvo, raioOk, preparar) {
  for (let t = 0; t < 3; t++) {
    if (preparar) await preparar()
    await ev((m) => {
      const G = window.__game
      const a = G.casinoMundo.mesas[m]
      G.player.setMode('third')
      G.player.teleport(a.centro.x, a.centro.z - 1.6, 0)
    }, mesa)
    await espera(1500)
    await ev((m) => { window.__game.cassino[m]() }, abrir)
    await page.mouse.move(640, 360)          // a lente tem paralaxe de ponteiro
    const r = await esperarCamera(ev, alvo)
    console.log('  camera em ' + r.pos.join(', ') + ' (a ' + r.dist + ' m do centro da mesa)')
    if (r.dist !== null && r.dist < raioOk) return r
    console.log('  camera longe demais; refazendo')
  }
  return null
}

/** O inventario da ficha: quantos meshes sobraram depois do forno com o
 *  material da ficha, quantos triangulos, e o custo nos tres pontos que o
 *  smoke.mjs mede. */
const INVENTARIO = () => {
  const G = window.__game
  const grupo = G.casinoMundo.group
  let meshes = 0, tris = 0, semUV = 0
  grupo.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.name !== 'ficha-cenario') return
    meshes++
    const g = o.geometry
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3
    if (!g.attributes.uv) semUV++
  })
  let cassinoMeshes = 0, cassinoTris = 0
  grupo.traverse((o) => {
    if (!o.isMesh) return
    cassinoMeshes++
    const g = o.geometry
    cassinoTris += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  const bench = (x, z) => {
    G.player.teleport(x, z, 0)
    for (let i = 0; i < 40; i++) G.player.update(1 / 60)
    G.engine.render()
    const r = G.renderer.info.render
    return { calls: r.calls, tris: r.triangles }
  }
  G.lighting.setTimeOfDay(0.33)
  G.clima.setEstacao('sol')
  return {
    ficha: { meshes, tris, semUV },
    cassino: { meshes: cassinoMeshes, tris: cassinoTris },
    rua: bench(2, 9), barbearia: bench(22, -20), mercearia: bench(-25, -22),
    salao: bench(24.0, 16.4), poker: bench(28.8, 21.6),
  }
}

try {
  await garantirServidor(URL_BASE)

  // 1) O SALAO A PE + os tres MACROS. Prova que a vitrine do caixa continua de
  // pe e mostra a ficha de perto, que e onde o desenho tem que aparecer.
  await sessao('salao', async (ev, shot, page, macro, preparar) => {
    console.log('  inventario:', JSON.stringify(await ev(INVENTARIO), null, 1))
    await preparar()
    await ev(() => {
      const G = window.__game
      G.player.setMode('third')
      G.player.teleport(29.6, 17.6, 0)
    })
    await page.mouse.move(640, 300)
    await espera(4000)
    await shot('01-caixa')
    await ev(() => window.__game.player.teleport(24.4, 21.2, 0))
    await espera(4000)
    await shot('02-salao')
    // TODO Y AQUI JA TEM O DEGRAU DA LOJA SOMADO. O miolo do cassino mora num
    // grupo em LEVELS.SHOP_FLOOR = 0.16, entao a altura que world/casino.js
    // escreve (CX.h, yT) e LOCAL: a primeira versao deste macro apontou pra
    // 1.16 no caixa e fotografou a saia do balcao.
    // gaveta do caixa (x 27.9..29.3, tampo em y=1.31, atras do vidro)
    await macro('07-macro-caixa', [28.6, 1.80, 13.92], [28.6, 1.33, 15.24], 26)
    // pote do poker (centro 28.8/23.2, feltro em y=0.94)
    await macro('08-macro-pote', [28.72, 1.32, 22.72], [28.70, 0.96, 23.18], 26)
    // rack do blackjack (20.0 / 24.0, base do rack em y=1.15)
    await macro('09-macro-rack', [20.0, 1.52, 23.30], [20.0, 1.16, 24.00], 26)
    // fichas caidas no carpete (23.2/20.6)
    await macro('10-macro-carpete', [23.2, 0.42, 19.95], [23.2, 0.17, 20.75], 26)
  })

  // 2) POKER ABERTO. As pilhas vivas do jogador (z=-0.90) na mesma foto que o
  // pote, a muralha do ricaco e o botao do dealer.
  await sessao('poker', async (ev, shot, page, macro, preparar) => {
    await sentar(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2, preparar)
    await espera(5000)
    await shot('03-poker')
    const btn = await ev(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      const b = bs.find((x) => x.offsetParent && !x.disabled && /APOSTAR|PAGAR|IGUALAR|JOGAR/.test(x.textContent.toUpperCase()))
      if (b) { b.click(); return b.textContent.trim() }
      return null
    })
    console.log('  clique:', btn)
    await espera(9000)
    await shot('04-poker-apostando')
  })

  // 3) BLACKJACK ABERTO. O rack da casa (5 denominacoes) no alto do quadro e o
  // caixote vivo do jogador embaixo: as duas fichas na mesma foto.
  await sessao('blackjack', async (ev, shot, page, macro, preparar) => {
    await sentar(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6, preparar)
    await espera(5000)
    await shot('05-blackjack')
  })
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
