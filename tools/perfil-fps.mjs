// PERFIL DE FPS: onde a cidade trava, e por que.
//
//   node tools/perfil-fps.mjs
//   node tools/perfil-fps.mjs --rota hotel
//
// O dono relatou TRAVAMENTOS (engasgos de varios quadros) ao chegar perto da
// concessionaria, do hotel e das outras lojas — e travao nao e a mesma coisa que
// FPS baixo. FPS baixo e geometria demais na tela; travao e alguma coisa CARA
// acontecendo num quadro so. As duas aparecem em medidas diferentes, entao este
// arquivo mede as duas.
//
// O QUE ELE OLHA, e por que cada numero importa:
//
//   ms        tempo de render por quadro. A MEDIANA diz o FPS; o MAXIMO diz o
//             travao. Um ponto com mediana 8 e maximo 400 nao tem problema de
//             FPS: tem UM quadro que custou meio segundo.
//   calls     draw calls. E o numero do FPS baixo.
//   tris      triangulos.
//   PROGRAMAS `renderer.info.programs.length` — E ESTE QUE ACHA O TRAVAO.
//             O three monta o programa de shader de cada material a partir da
//             CONTAGEM DE LUZES VISIVEIS da cena. Se alguma coisa faz uma luz
//             entrar ou sair (um LOD que esconde um grupo com luz dentro), TODOS
//             os materiais viram programa novo e a cena inteira recompila no meio
//             do quadro. O sintoma e um engasgo ao cruzar uma linha invisivel; a
//             prova e este contador mudando naquele exato passo.
//   luzes     quantas luzes VISIVEIS a cena tem naquele ponto. Se este numero
//             oscila andando, o de cima vai oscilar junto.
//
// Em headless o render e por software (swiftshader), entao os ms absolutos nao
// valem nada — o que vale e a RAZAO entre pontos e o pico contra a mediana.
// `calls`, `programas` e `luzes` sao exatos.

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

const PORT = 9611 + (process.pid % 200)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-perf-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--mute-audio',
  '--window-size=800,500', 'about:blank',
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

// --- as travessias ----------------------------------------------------------
//
// Cada uma passa POR CIMA da fronteira de LOD de um estabelecimento, andando de
// fora pra dentro em passos de 2 m. E na fronteira que o travao mora, entao
// medir parado na porta nao acha nada: tem que ATRAVESSAR.
const ROTAS = {
  hotel: {
    nome: 'HOTEL PARAISO (porta em -38.5, -48)',
    de: [-38.5, 12], para: [-38.5, -44], passo: 2.0, yaw: 0,
  },
  auto: {
    nome: 'GARAGEM DO NANDO (porta em -21, -48)',
    de: [-21, 10], para: [-21, -44], passo: 2.0, yaw: 0,
  },
  cassino: {
    nome: 'CASSINO ESTRELA (porta em 24, 12)',
    de: [24, 62], para: [24, 16], passo: 2.0, yaw: 0,
  },
  jogos: {
    nome: 'TACO DE OURO (porta em 42, -12)',
    de: [42, 40], para: [42, -8], passo: 2.0, yaw: 0,
  },
  avenida: {
    nome: 'A AVENIDA INTEIRA (norte -> sul, passando por tudo)',
    de: [0, -58], para: [0, 58], passo: 4.0, yaw: Math.PI,
  },
}

const arg = process.argv.indexOf('--rota')
const escolhida = arg > 0 ? process.argv[arg + 1] : null

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 300000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 800, height: 500 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('!!(window.__game && window.__game.fluxo)', { timeout: 90000 })
  await page.evaluate('window.__game.fluxo.jogar(); window.__game.fluxo.foto(true)')
  await new Promise((r) => setTimeout(r, 2500))

  // Aquece: o PRIMEIRO render de cada material compila o programa dele, e sem
  // isso o primeiro ponto de toda rota sai com um pico que nao e travao — e a
  // compilacao inicial, que o jogador paga uma vez na tela de carregamento.
  await page.evaluate(() => {
    const G = window.__game
    // O TICK DOS MODULOS. `moduleUpdates` e privado do main, mas os modulos que
    // tem LOD estao todos expostos no `game` pra depuracao — e sao justamente
    // eles que ligam e desligam coisa por distancia. Sem rodar isto, o perfil
    // mediria uma cidade com todos os LOD congelados no estado inicial, que e o
    // contrario do que se quer medir.
    const mods = [G.hotel, G.autoMundo, G.casinoMundo, G.lojaMundo, G.adegaMundo,
      G.cortico, G.casa, G.city]
    G.__tickModulos = (dt) => {
      for (const m of mods) if (m && typeof m.update === 'function') m.update(dt, G)
    }
    // aquecimento: o PRIMEIRO render de cada material compila o programa dele
    const pontos = [[0, 0], [-38.5, -44], [-21, -44], [24, 16], [42, -8], [22, -20],
      [-25, -22], [43, 18], [39.5, -45], [22, -40], [0, 40], [0, -40]]
    for (const [x, z] of pontos) {
      G.player.teleport(x, z, 0)
      for (let i = 0; i < 10; i++) { G.player.update(1 / 60); G.__tickModulos(1 / 60) }
      G.engine.render()
    }
  })
  await new Promise((r) => setTimeout(r, 500))

  /** Mede um ponto: N quadros de jogo COMPLETOS (update + render). */
  async function medir(x, z, yaw, quadros) {
    return page.evaluate((x, z, yaw, quadros) => {
      const G = window.__game
      const gl = G.renderer.getContext()
      G.player.teleport(x, z, yaw)
      // 8 quadros de assentamento: a camera de 3a pessoa persegue por lerp e o
      // LOD dos modulos precisa de um quadro pra reagir
      for (let i = 0; i < 8; i++) {
        G.player.update(1 / 60)
        if (G.__tickModulos) G.__tickModulos(1 / 60)
      }
      G.engine.render(); gl.finish()

      const ms = []
      let calls = 0, tris = 0
      for (let i = 0; i < quadros; i++) {
        const t0 = performance.now()
        G.player.update(1 / 60)
        if (G.__tickModulos) G.__tickModulos(1 / 60)
        G.engine.render()
        gl.finish()
        ms.push(performance.now() - t0)
        calls = G.renderer.info.render.calls
        tris = G.renderer.info.render.triangles
      }
      let luzes = 0
      G.scene.traverse((o) => { if (o.isLight && o.visible && !o.isAmbientLight) luzes++ })
      const ord = ms.slice().sort((a, b) => a - b)
      return {
        med: +ord[Math.floor(ord.length / 2)].toFixed(1),
        max: +Math.max(...ms).toFixed(1),
        calls, tris,
        prog: G.renderer.info.programs ? G.renderer.info.programs.length : -1,
        luzes,
        geo: G.renderer.info.memory.geometries,
        tex: G.renderer.info.memory.textures,
      }
    }, x, z, yaw, quadros)
  }

  const nomes = escolhida ? [escolhida] : Object.keys(ROTAS)
  const achados = []

  for (const id of nomes) {
    const r = ROTAS[id]
    if (!r) { console.log('rota desconhecida: ' + id); continue }
    console.log('\n=== ' + r.nome + ' ===')
    console.log('  ponto            ms(med)  ms(max)   calls     tris   prog  luzes  geo  tex')
    const dx = r.para[0] - r.de[0], dz = r.para[1] - r.de[1]
    const dist = Math.hypot(dx, dz)
    const n = Math.max(2, Math.round(dist / r.passo))
    let anterior = null
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = +(r.de[0] + dx * t).toFixed(1)
      const z = +(r.de[1] + dz * t).toFixed(1)
      const m = await medir(x, z, r.yaw, 10)
      const marca = []
      if (anterior) {
        if (m.prog !== anterior.prog) marca.push('PROGRAMAS ' + anterior.prog + ' -> ' + m.prog)
        if (m.luzes !== anterior.luzes) marca.push('LUZES ' + anterior.luzes + ' -> ' + m.luzes)
        if (m.geo !== anterior.geo) marca.push('geometrias ' + anterior.geo + ' -> ' + m.geo)
        if (m.max > anterior.med * 3 && m.max > 40) marca.push('PICO ' + m.max + ' ms')
      }
      console.log(
        '  ' + (x + ',' + z).padEnd(15)
        + String(m.med).padStart(7)
        + String(m.max).padStart(9)
        + String(m.calls).padStart(8)
        + String(m.tris).padStart(9)
        + String(m.prog).padStart(7)
        + String(m.luzes).padStart(7)
        + String(m.geo).padStart(5)
        + String(m.tex).padStart(5)
        + (marca.length ? '   <<< ' + marca.join(' | ') : ''),
      )
      if (marca.length) achados.push({ rota: r.nome, x, z, marca: marca.join(' | ') })
      anterior = m
    }
  }

  console.log('\n\n========== O QUE APARECEU ==========')
  if (!achados.length) console.log('  nenhuma mudanca de programa/luz/geometria e nenhum pico ao longo das rotas.')
  for (const a of achados) console.log('  ' + a.rota + '  em (' + a.x + ',' + a.z + '): ' + a.marca)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
