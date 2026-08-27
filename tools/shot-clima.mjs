// Screenshots do CLIMA e do CASSINO num unico launch do navegador.
//
//   node tools/shot-clima.mjs             -> tira tudo
//   node tools/shot-clima.mjs chuva neve  -> so esses grupos
//
// Precisa do dev server rodando (npm run dev, porta 5173) — ele sobe sozinho
// se nao estiver no ar.
//
// A diferenca para tools/shots.mjs: aqui cada tomada pode RODAR CODIGO antes de
// renderizar (trocar a estacao, teleportar o jogador, deixar a chuva molhar o
// chao por 3 s). Sem isso nao da pra fotografar respingo nenhum: quando o
// script chega, a estacao ainda esta em transicao e a tela esta seca.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// Cada tomada: { nome, cam:[x,y,z], alvo:[x,y,z], fov, estacao, esperar, hora, antes }
//   estacao  'sol' | 'chuva' | 'neve' — trocada ANTES de esperar
//   esperar  segundos de jogo rodando de verdade antes do clique
//   hora     0..1 no ciclo de dia (0.25 = meio-dia, 0.72 = noite fechada)
//   antes    codigo extra, recebe o objeto game
export const GRUPOS = {
  cassino: [
    { nome: 'cas-01-fachada', cam: [24, 3.2, -2], alvo: [24, 4.0, 12], fov: 62, hora: 0.30 },
    { nome: 'cas-02-esquina', cam: [4, 7.5, 2], alvo: [24, 3.5, 14], fov: 66, hora: 0.30 },
    { nome: 'cas-03-fachada-noite', cam: [24, 3.0, 0], alvo: [24, 4.2, 12], fov: 62, hora: 0.74 },
    { nome: 'cas-04-entrada', cam: [24, 1.8, 10.4], alvo: [24, 1.6, 20], fov: 72 },
    { nome: 'cas-05-salao', cam: [24, 2.4, 14], alvo: [24, 1.2, 26], fov: 74 },
    { nome: 'cas-06-blackjack', cam: [20, 1.7, 18.6], alvo: [20, 1.05, 23.5], fov: 62 },
    { nome: 'cas-07-poker', cam: [28.8, 1.7, 18.0], alvo: [28.8, 1.05, 23.0], fov: 62 },
    { nome: 'cas-08-slots', cam: [19.6, 1.6, 17.5], alvo: [14.6, 1.3, 17.5], fov: 68 },
    { nome: 'cas-09-caixa', cam: [25.5, 1.8, 18.5], alvo: [30.4, 1.2, 13.6], fov: 66 },
    { nome: 'cas-10-alto', cam: [24, 22, -4], alvo: [24, 0, 21], fov: 60 },
  ],
  chuva: [
    { nome: 'chu-01-rua', cam: [4, 2.4, 14], alvo: [8, 1.0, 0], fov: 64, estacao: 'chuva', esperar: 6 },
    { nome: 'chu-02-respingo', cam: [2, 0.55, 6], alvo: [2, 0.02, 1], fov: 60, estacao: 'chuva', esperar: 6 },
    { nome: 'chu-03-respingo-raso', cam: [0, 0.30, 4], alvo: [0, 0.0, 0], fov: 52, estacao: 'chuva', esperar: 7 },
    { nome: 'chu-04-cruzamento', cam: [10, 5.0, 12], alvo: [-2, 0.4, -4], fov: 70, estacao: 'chuva', esperar: 6 },
    { nome: 'chu-05-cassino', cam: [24, 2.6, 2], alvo: [24, 3.6, 12], fov: 64, estacao: 'chuva', esperar: 6 },
    { nome: 'chu-06-dentro', cam: [24, 1.8, 14], alvo: [24, 1.4, 4], fov: 72, estacao: 'chuva', esperar: 6 },
  ],
  neve: [
    { nome: 'nev-01-rua', cam: [4, 2.4, 14], alvo: [8, 1.0, -2], fov: 64, estacao: 'neve', esperar: 32 },
    { nome: 'nev-02-praca', cam: [-20, 3.2, 34], alvo: [-33, 1.0, 22], fov: 65, estacao: 'neve', esperar: 4 },
    { nome: 'nev-03-arvores', cam: [-26, 2.2, 30], alvo: [-33, 3.5, 23], fov: 60, estacao: 'neve', esperar: 4 },
    { nome: 'nev-04-predios', cam: [10, 6.5, 10], alvo: [-2, 2.0, -14], fov: 70, estacao: 'neve', esperar: 4 },
    { nome: 'nev-05-alto', cam: [30, 30, 44], alvo: [-6, 0, -10], fov: 62, estacao: 'neve', esperar: 4 },
    { nome: 'nev-06-cassino', cam: [24, 3.2, -2], alvo: [24, 4.0, 12], fov: 62, estacao: 'neve', esperar: 4 },
    { nome: 'nev-07-calcada', cam: [16, 1.5, 6], alvo: [22, 0.4, 10], fov: 58, estacao: 'neve', esperar: 4 },
  ],
  sol: [
    { nome: 'sol-01-rua', cam: [4, 2.4, 14], alvo: [8, 1.0, -2], fov: 64, estacao: 'sol', esperar: 3 },
  ],
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function acharNavegador() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const pedidos = process.argv.slice(2)
const grupos = pedidos.length ? pedidos.filter((g) => GRUPOS[g]) : Object.keys(GRUPOS)
const tomadas = grupos.flatMap((g) => GRUPOS[g])
if (!tomadas.length) {
  console.error('grupos validos: ' + Object.keys(GRUPOS).join(' '))
  process.exit(1)
}

const PORT = 9433 + (process.pid % 400)
const perfil = path.join(os.tmpdir(), 'minicity-clima-' + PORT)
const filho = spawn(acharNavegador(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + perfil,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader',
  '--ignore-gpu-blocklist',
  '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore', detached: false })

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

const ws = await esperarDebugger()
const browser = await puppeteer.connect({ browserWSEndpoint: ws })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 90000 })
  // o mundo inteiro montado: os interiores levam alguns segundos numa maquina fraca
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  let estacaoAtual = null
  for (const t of tomadas) {
    const trocou = t.estacao && t.estacao !== estacaoAtual
    if (t.estacao) estacaoAtual = t.estacao
    // Segundos de clima a SIMULAR — nao a esperar no relogio.
    //
    // Num navegador headless a aba nao compoe quadro, o requestAnimationFrame
    // do jogo nunca dispara e o laco principal NAO RODA: esperar 30 s de
    // relogio fotografava exatamente o mesmo mundo seco do primeiro quadro
    // (foi assim que a primeira leva de fotos de chuva saiu com ceu azul).
    // Aqui o script chama clima.atualizar()/neve.atualizar() na mao — e de
    // quebra fica instantaneo: 30 s de nevasca saem em meio segundo.
    const segundos = t.esperar || (trocou ? 4 : 0.5)

    const dataUrl = await page.evaluate((cfg, segs) => {
      const G = window.__game
      const c = G.camera

      if (cfg.estacao && G.clima) G.clima.setEstacao(cfg.estacao)
      if (typeof cfg.hora === 'number' && G.lighting) G.lighting.setTimeOfDay(cfg.hora)
      // O jogador vai pra perto da camera: a gota morre no chao DELE e a sombra
      // segue ele. Fotografar de longe poria a chuva do outro lado do mapa.
      if (G.player && G.player.teleport) G.player.teleport(cfg.cam[0], cfg.cam[2])
      // ...mas o boneco nao pode APARECER: nas tomadas de perto a camera nasce
      // dentro da cabeca dele e a foto vira uma bola bege ocupando meia tela.
      if (G.character && G.character.setVisibleBody) G.character.setVisibleBody(false)

      // A camera precisa estar no lugar ANTES de simular: a caixa de gotas e
      // centrada nela e os respingos so nascem perto dela.
      c.fov = cfg.fov || 62
      c.position.set(cfg.cam[0], cfg.cam[1], cfg.cam[2])
      c.lookAt(cfg.alvo[0], cfg.alvo[1], cfg.alvo[2])
      c.updateProjectionMatrix()

      const passo = 1 / 60
      const n = Math.round(segs / passo)
      for (let i = 0; i < n; i++) {
        if (G.clima) G.clima.atualizar(passo, G.player.position)
        if (G.neve && G.clima) { G.neve.setCobertura(G.clima.cobertura); G.neve.atualizar(passo) }
      }

      if (G.lighting) {
        G.lighting.setTarget({ x: cfg.cam[0], z: cfg.cam[2] })
        G.lighting.update(0.0001)   // dt minusculo: nao adianta o ciclo de dia
      }
      G.engine.render()
      return G.renderer.domElement.toDataURL('image/png')
    }, t, segundos)

    const arq = path.join(dir, t.nome.replace(/[^a-z0-9_-]/gi, '') + '.png')
    fs.writeFileSync(arq, Buffer.from(dataUrl.split(',')[1], 'base64'))
    console.log(arq)
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
