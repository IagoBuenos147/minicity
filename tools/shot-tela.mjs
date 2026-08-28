// Fotos das TELAS do jogo (menu, criacao de personagem, cutscene, tutorial).
//
//   node tools/shot-tela.mjs             -> tira todas
//   node tools/shot-tela.mjs menu        -> so o grupo 'menu'
//
// Por que este arquivo existe separado de tools/shot-clima.mjs: aquele salva o
// CANVAS (toDataURL), que e o certo pra fotografar o mundo 3D e nada mais. As
// telas deste jogo sao DOM por cima do canvas — menu, painel de customizacao,
// baloes da cutscene, HUD. Num toDataURL do canvas elas simplesmente nao
// existem. Aqui a foto e page.screenshot(), que compoe as duas camadas.
//
// O outro motivo: page.screenshot() FORCA um quadro. Em headless a aba nao
// compoe sozinha e o requestAnimationFrame do jogo nao dispara — e por isso
// que cada tomada aqui pede um punhado de quadros na mao antes de clicar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// Cada tomada: { nome, antes, quadros, espera }
//   antes    codigo rodado na pagina (recebe G = window.__game)
//   quadros  quantos quadros do jogo forcar antes de clicar
//   espera   ms de relogio depois do 'antes' (pra transicao de CSS terminar)
export const GRUPOS = {
  menu: [
    { nome: 'tela-01-menu', antes: "G.menu.abrir('principal')", espera: 900 },
    { nome: 'tela-02-modo', antes: "G.menu.abrir('modo')", espera: 700 },
    {
      nome: 'tela-03-lobby',
      antes: `G.menu.abrir('lobby')
        G.menu.setSala({ fase:'lobby', anfitriao:1, meuId:1, jogadores:[
          { id:1, nome:'Iago', pronto:false }, { id:2, nome:'Irmao', pronto:false } ] })
        G.menu.setMensagem('')`,
      espera: 700,
    },
    { nome: 'tela-04-opcoes', antes: "G.menu.abrir('opcoes')", espera: 700 },
  ],
  criacao: [
    {
      nome: 'tela-05-criacao',
      // pelo FLUXO de verdade (o mesmo que o botao SOLO do menu dispara), e
      // nao abrindo o painel na mao: e o estado 'criacao' que faz o laco
      // desenhar o palco em vez da cidade
      antes: 'G.fluxo.solo()',
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-06-criacao-roupa',
      antes: `G.criacao.abrir({ modo:'coop', nome:'Iago', prontos:1, total:3 })
        G.criacao.setJogadores([{id:1,nome:'Iago',pronto:true},
          {id:2,nome:'Irmao',pronto:false},{id:3,nome:'Primo',pronto:false}])
        G.criacao.setProntos(1, 3)`,
      quadros: 40, espera: 900,
    },
  ],
  casa: [
    {
      nome: 'tela-07-casa-fora',
      antes: `G.fluxo.foto(true)
        const p = G.casa && G.casa.poseDaCutscene
        const c = G.camera
        if (p) { c.position.set(p.x, p.y, p.z); c.lookAt(p.olharX, p.olharY, p.olharZ) }
        else { c.position.set(44, 2.0, 6); c.lookAt(44, 2.0, 14) }
        c.fov = 62; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.30); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-08-casa-dentro',
      antes: `const c = G.camera
        c.position.set(43, 1.7, 13.4); c.lookAt(43, 1.5, 21)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-09-casa-corredor',
      antes: `const c = G.camera
        c.position.set(46.5, 1.7, 15.5); c.lookAt(46.5, 1.4, 21.5)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
  ],
  // O painel de DENTRO do jogo (barbeiro / provador), que era a queixa da
  // camera com movel na frente.
  barbeiro: [
    {
      nome: 'tela-12-barbeiro',
      antes: `G.fluxo.jogar()
        G.player.teleport(22, -20, 0)
        G.openCustomizer('rosto')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-13-roupa',
      antes: `G.openCustomizer('roupa')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-14-roupa-calcado',
      antes: `const b = [...document.querySelectorAll('.mcrp-cz button, .mcrp-cz [role=tab], .mcrp-cz .cz-aba')]
        const alvo = b.find(x => /CALCADO/i.test(x.textContent || ''))
        if (alvo) alvo.click()`,
      quadros: 60, espera: 900,
    },
  ],
  cutscene: [
    {
      nome: 'tela-10-porao',
      // Pelo FLUXO de verdade: comecarPartida poe o jogo em 'abertura', e e
      // esse estado que faz o laco desenhar o porao em vez da cidade.
      antes: `G.fluxo.comecar([
          { id:1, nome:'Iago',  aparencia:G.appearance, anfitriao:true },
          { id:2, nome:'Irmao', aparencia:Object.assign({}, G.appearance, {cabeca:4,cabelo:6,pele:5,blusa:9,calca:4,chapeu:2}), anfitriao:false },
          { id:3, nome:'Primo', aparencia:Object.assign({}, G.appearance, {cabeca:9,cabelo:3,pele:8,blusa:14,calca:7,colar:3}), anfitriao:false },
        ])
        for (let i=0;i<90;i++) G.abertura.atualizar(1/60)`,
      quadros: 3, espera: 500,
    },
    {
      nome: 'tela-11-porao-fala',
      antes: 'for (let i=0;i<300;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
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

const PORT = 9533 + (process.pid % 300)
const filho = spawn(acharNavegador(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-tela-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
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

const browser = await puppeteer.connect({ browserWSEndpoint: await esperarDebugger() })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text()) })

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const t of tomadas) {
    await page.evaluate((codigo) => {
      const G = window.__game
      new Function('G', codigo)(G)
    }, t.antes)

    // Quadros forcados: em headless o rAF do jogo nao roda sozinho, entao as
    // transicoes que dependem do laco (o palco chegando no foco, a camera do
    // passeio) nunca sairiam do lugar.
    if (!t.semQuadro) {
      await page.evaluate((n) => new Promise((res) => {
        let i = 0
        const f = () => { (++i >= (n || 20)) ? res(i) : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      }), t.quadros || 20)
    }
    if (t.espera) await new Promise((r) => setTimeout(r, t.espera))

    const arq = path.join(dir, t.nome.replace(/[^a-z0-9_-]/gi, '') + '.png')
    await page.screenshot({ path: arq })
    console.log(arq)
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
