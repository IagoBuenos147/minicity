// A BEBIDA NA MAO, EM PRIMEIRA PESSOA: parado, andando e correndo.
//
//   node tools/shot-bebida.mjs                  -> as tres bebidas, os tres estados
//   node tools/shot-bebida.mjs whiskey-garrafa  -> so uma
//   node tools/shot-bebida.mjs 3a               -> so a foto de 3a pessoa
//   node tools/shot-bebida.mjs perto            -> so o CLOSE da pega
//   node tools/shot-bebida.mjs copo             -> os copos, cheios de chope
//
// O '3a' existe porque a foto de 3a pessoa e a que mais precisou de idas e
// vindas (a pose do braco que carrega) e a que menos depende das outras: sem
// ele, conferir um ajuste de cotovelo custava as nove fotos de 1a pessoa junto,
// que sao ~15 minutos de renderizador por software.
//
// O 'perto' existe porque a queixa que mandou refazer a mao inteira foi "os
// dedos ficaram estranhos", e NAS FOTOS DE JOGO NAO DAVA PRA VER: na pose real
// a peca tem uns 120 px de altura, e a mao cabe num punhado de pixels. Este
// modo joga a peca a 20 cm do olho, centrada, so pra julgar a PEGA — se o dedo
// dobra, se a fileira de nos aparece, se o polegar le como polegar, se sobrou
// fresta entre dedo e vidro. Bebida nova passa por aqui antes de entrar.
//
// POR QUE ESTA FERRAMENTA EXISTE, e por que ela nao e um luxo: a pose de um
// item de mao sao SEIS NUMEROS (tres de posicao, tres de rotacao) em espaco de
// camera, e o que eles produzem na tela depende ao mesmo tempo do FOV, da
// altura dos olhos, do tamanho da peca e da altura em que a mao a agarra.
// Nenhum deles da pra prever lendo o codigo. Sem isto aqui, cada tentativa de
// afinar custa: salvar, abrir o jogo, comprar a bebida, olhar, repetir.
//
// E ela vai continuar sendo usada: o dono do projeto avisou que "vao entrar
// outras bebidas depois". Bebida nova = uma linha em BEBIDAS (com o bloco
// `mao`) e uma rodada aqui pra ver se o punho fechou no lugar certo.
//
// OS TRES ESTADOS SAO O PONTO. Parado mostra o enquadramento; ANDANDO mostra o
// balanco (que sai da mesma fase da camera, ver player/mao.js); CORRENDO mostra
// a POSE DE CORRIDA, que e outra pose e nao o mesmo gesto acelerado. Um item de
// mao que so foi conferido parado e um adesivo colado na tela, e e exatamente
// isso que a foto de 'correndo' denuncia.
//
// As teclas sao DISPARADAS DE VERDADE (KeyboardEvent no window, que e onde
// core/input.js escuta): o caminho e o mesmo do jogador, entao a foto nao pode
// mentir por causa de um atalho do teste.
//
// ELA NAO USA O DEV SERVER, pela mesma razao de tools/shot-catalogo.mjs: sao
// nove tomadas no renderizador por software, alguns minutos de relogio, e
// QUALQUER arquivo salvo nesse meio tempo — por outra aba do editor, por outro
// agente — faz o Vite recarregar a pagina e matar o contexto no meio da rodada.
// Foi o que aconteceu duas vezes antes desta mudanca. Servindo o `dist`
// estatico (npm run build + servidor.js), o que esta na tela fica na tela.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8700 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

const BEBIDAS = ['cerveja-lata', 'vodka-garrafa', 'whiskey-garrafa']

// Onde fotografar: a avenida em frente as lojas. Chao plano e sem parede a
// meio metro do nariz — parede perto tapa a peca e nao da pra julgar nada.
const LUGAR = { x: 2, z: 9, yaw: 0 }

// Cada estado: as teclas seguradas e por quantos quadros. Correr precisa dos
// quadros: a rampa andar<->correr da pose leva ~1 s pra chegar no fim, e uma
// foto tirada antes disso mostra uma pose que nao existe em lugar nenhum.
const ESTADOS = [
  { nome: 'parado', teclas: [], quadros: 30 },
  { nome: 'andando', teclas: ['KeyW'], quadros: 80 },
  { nome: 'correndo', teclas: ['KeyW', 'ShiftLeft'], quadros: 110 },
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

// Os copos entram aqui e nao numa ferramenta propria porque o que se julga e o
// MESMO: a pega. Desde que a mao passou a ser uma so (player/mao.js, usada
// tambem pelo copo), conferir a lata e nao conferir o copo e conferir metade.
// A diferenca e que o copo tem CHOPE dentro — nivel, colarinho e bolha —, entao
// ele e enchido antes da foto.
const COPOS = ['copo-americano', 'copo-tulipa', 'caneca-chope']

const args = process.argv.slice(2)
const so3a = args.includes('3a')
const soPerto = args.includes('perto')
const soCopo = args.includes('copo')
const pedidas = args.filter((a) => BEBIDAS.includes(a))
const escolhidas = pedidas.length ? pedidas : BEBIDAS
const lista = (so3a || soPerto || soCopo) ? [] : escolhidas

// A pose de inspecao do modo 'perto'. Centrada e a 20 cm: o near da camera e
// 0.05, entao nada corta. O giro de -0.18 tira a peca do frontal exato — de
// frente perfeita a mao fica achatada e nao da pra ver o quanto o dedo enrola.
const POSE_PERTO = { pos: [0.0, -0.030, -0.205], rot: [0.0, -0.18, 0.0] }

// build + servidor estatico proprio (ver o cabecalho: sem Vite, sem HMR)
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

const PORT = 9411 + (process.pid % 130)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-beb-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
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

/**
 * Roda `n` quadros do jogo de verdade (o rAF nao gira sozinho em headless).
 *
 * O RELOGIO NAO E LUXO: em headless a aba so compoe quando alguem pede, e o rAF
 * pode simplesmente PARAR no meio (foi o que aconteceu na primeira versao desta
 * ferramenta — a tomada de 'correndo' ficou pendurada ate o protocolTimeout do
 * puppeteer estourar e a rodada inteira se perdeu, depois de dois minutos de
 * render por software ja gastos). Com o teto de tempo, quadro que nao vem vira
 * uma foto pior, e nao uma rodada perdida.
 */
async function quadros(page, n, msMax = 25000) {
  const houve = await page.evaluate((k, teto) => new Promise((res) => {
    let i = 0
    const fim = performance.now() + teto
    const f = () => {
      if (++i >= k || performance.now() > fim) res(i)
      else requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), n, msMax)
  if (houve < n) console.log('  (so ' + houve + ' de ' + n + ' quadros; o rAF parou)')
}

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 480000,
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 220)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text().slice(0, 220))
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.mao', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2200))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  // Entra no jogo uma vez so. A ajuda sai da tela: ela ocupa a metade de baixo
  // da esquerda e nao tem nada a ver com o que estamos julgando aqui.
  await page.evaluate((lugar) => {
    const G = window.__game
    G.fluxo.jogar()
    G.hud.showHelp(false)
    G.player.teleport(lugar.x, lugar.z, lugar.yaw)
  }, LUGAR)
  await quadros(page, 40)

  for (const id of lista) {
    for (const est of ESTADOS) {
      await page.evaluate((idBebida, teclas, lugar) => {
        const G = window.__game
        // volta pro ponto de partida a cada tomada: correndo, a tomada anterior
        // deixou o jogador vinte metros adiante, dentro de outra rua
        G.player.teleport(lugar.x, lugar.z, lugar.yaw)
        G.inventario.limpar()
        G.pegouItem(idBebida)
        for (const code of teclas) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
        }
      }, id, est.teclas, LUGAR)

      await quadros(page, est.quadros)

      const arq = path.join(dir, 'mao-' + id + '-' + est.nome + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)

      await page.evaluate((teclas) => {
        for (const code of teclas) {
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
        }
      }, est.teclas)
      await quadros(page, 20)
    }
  }

  // --- copos com chope -----------------------------------------------------
  if (soCopo) {
    for (const id of COPOS) {
      await page.evaluate(async (idCopo, pose) => {
        const G = window.__game
        G.hud.setJogando(false)
        G.inventario.limpar()
        G.pegouItem(idCopo)
        for (const nome of ['andar', 'correr']) {
          const P = G.mao.poses[nome]
          P.pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
          P.rot.set(pose.rot[0], pose.rot[1], pose.rot[2])
        }
        // ESTICA A MAO ANTES: encher() recusa com a mao ociosa (`estendido`),
        // que e a mesma trava que impede o jogador de encher o copo andando
        // pela rua. Sem isto a foto saia com o copo VAZIO — foi o que
        // aconteceu na primeira rodada.
        const f = G.copo && G.copo.ficha
        const esp = (f && f.copo && f.copo.espuma) || 0.5
        if (G.copo) {
          G.copo.usar()
          for (let i = 0; i < 40; i++) G.copo.encher(0.2, 0xd8901c, esp, 'Chope')
        }
      }, id, POSE_PERTO)
      await quadros(page, 40)
      const arq = path.join(dir, 'mao-copo-' + id + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)
    }
  }

  // --- close da pega -------------------------------------------------------
  if (soPerto) {
    for (const id of escolhidas) {
      await page.evaluate((idBebida, pose) => {
        const G = window.__game
        // o HUD sai inteiro: aqui so interessa a mao
        G.hud.setJogando(false)
        G.inventario.limpar()
        G.pegouItem(idBebida)
        // as DUAS poses, senao um Shift acidental no meio da tomada troca o
        // enquadramento; e elas sao objetos vivos (ver api.poses em mao.js)
        for (const nome of ['andar', 'correr']) {
          G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
          G.mao.poses[nome].rot.set(pose.rot[0], pose.rot[1], pose.rot[2])
        }
      }, id, POSE_PERTO)
      await quadros(page, 40)
      const arq = path.join(dir, 'mao-perto-' + id + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)
    }
  }

  // UMA em terceira pessoa, com o whiskey: e o outro caminho do modulo (a peca
  // pendurada na junta handR do boneco em vez de colada na camera), e ele quebra
  // calado — na tela do jogador em 1a pessoa nada muda.
  if (!soPerto && !soCopo) {
    await page.evaluate(() => {
      const G = window.__game
      G.inventario.limpar()
      G.pegouItem('whiskey-garrafa')
      G.player.setMode('third')
    })
    await quadros(page, 60)
    const arq3 = path.join(ROOT, 'shots', 'mao-3a-pessoa.png')
    await page.screenshot({ path: arq3 })
    console.log(arq3)
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
