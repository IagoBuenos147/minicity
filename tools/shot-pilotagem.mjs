// Fotos dos VEICULOS e de quem os pilota: parado na vaga e com o boneco em
// cima, ja andando.
//
//   node tools/shot-pilotagem.mjs               -> tira tudo
//   node tools/shot-pilotagem.mjs moto skate    -> so esses grupos
//
// Precisa do dev server (npm run dev) — ele sobe sozinho se nao estiver no ar.
//
// POR QUE ESTE ARQUIVO EXISTE, SE JA HA tools/shot-veiculos.mjs:
// aquele fotografa a tela inteira com page.screenshot() e depende do laco do
// jogo estar rodando, o que em headless nao acontece (a aba nao compoe quadro,
// entao o requestAnimationFrame nunca dispara). Aqui, como em shot-clima.mjs,
// o script CHAMA veiculos.atualizar() na mao quadro a quadro, aperta as teclas
// pelo mesmo caminho que o teclado de verdade, e so entao poe a camera onde
// quer e renderiza. Da pra fotografar o boneco no meio de uma empurrada de
// skate ou de uma derrapagem — que e justamente o que precisa ser conferido.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// Cada tomada: { nome, tipo, teclas, segundos, cam:[dx,dy,dz], alvo:[dx,dy,dz], fov }
// cam/alvo sao RELATIVOS ao veiculo, no espaco dele (x = lado, z = frente).
//
// A VAGA de cada um (MUNDO.VEICULOS). Toda tomada comeca devolvendo o veiculo
// pra ca pelo mesmo caminho da rede ('veiculo-pos'), senao a segunda foto sai
// de dentro do predio em que a primeira corrida terminou.
const VAGA = {
  carro: { id: 4000, x: 3.2, z: -5.4, yaw: Math.PI / 2 },
  moto: { id: 4001, x: 7.0, z: -5.4, yaw: Math.PI / 2 },
  skate: { id: 4002, x: 10.2, z: -5.4, yaw: Math.PI / 2 },
}
const GRUPOS = {
  moto: [
    { nome: 'mot-01-perfil', tipo: 'moto', cam: [3.0, 0.9, 0.1], alvo: [0, 0.7, 0], fov: 48 },
    { nome: 'mot-02-tres-quartos', tipo: 'moto', cam: [2.2, 1.5, 2.4], alvo: [0, 0.7, 0.1], fov: 50 },
    { nome: 'mot-03-frente', tipo: 'moto', cam: [0.2, 1.1, 3.0], alvo: [0, 0.75, 0], fov: 45 },
    { nome: 'mot-07-roda-dianteira', tipo: 'moto', cam: [1.3, 0.45, 0.86], alvo: [0, 0.35, 0.86], fov: 40 },
    { nome: 'mot-08-lado-escape', tipo: 'moto', cam: [-2.6, 0.9, -0.2], alvo: [0, 0.6, -0.1], fov: 48 },
    { nome: 'mot-09-motor', tipo: 'moto', cam: [1.1, 0.62, 0.20], alvo: [0, 0.55, 0.05], fov: 42 },
    { nome: 'mot-10-piloto-frente', tipo: 'moto', teclas: ['KeyW'], segundos: 1.1, cam: [0.3, 1.4, 3.2], alvo: [0, 0.95, 0], fov: 46 },
    { nome: 'mot-04-piloto', tipo: 'moto', teclas: ['KeyW'], segundos: 1.1, cam: [2.6, 1.4, 1.4], alvo: [0, 1.0, 0], fov: 48 },
    { nome: 'mot-05-piloto-curva', tipo: 'moto', teclas: ['KeyW', 'KeyA'], segundos: 1.9, cam: [2.4, 1.5, 2.0], alvo: [0, 1.0, 0.1], fov: 50 },
    { nome: 'mot-06-piloto-tras', tipo: 'moto', teclas: ['KeyW'], segundos: 1.1, cam: [0.6, 1.7, -2.6], alvo: [0, 0.9, 0.2], fov: 52 },
  ],
  carro: [
    { nome: 'car-01-perfil', tipo: 'carro', cam: [5.6, 1.3, 0.2], alvo: [0, 0.85, 0], fov: 46 },
    { nome: 'car-02-tres-quartos', tipo: 'carro', cam: [4.0, 2.0, 4.6], alvo: [0, 0.85, 0.2], fov: 50 },
    { nome: 'car-03-frente', tipo: 'carro', cam: [0.4, 1.5, 5.4], alvo: [0, 0.85, 0], fov: 42 },
    { nome: 'car-04-traseira', tipo: 'carro', cam: [1.6, 1.8, -5.0], alvo: [0, 0.85, 0], fov: 46 },
    { nome: 'car-08-roda', tipo: 'carro', cam: [-2.4, 0.55, 1.42], alvo: [-0.8, 0.35, 1.42], fov: 34 },
    { nome: 'car-05-motorista', tipo: 'carro', teclas: ['KeyW'], segundos: 1.2, cam: [2.7, 2.0, 2.6], alvo: [0.38, 1.0, -0.1], fov: 46 },
    { nome: 'car-06-derrapando', tipo: 'carro', inicio: { x: 24, z: -5.4, yaw: -Math.PI / 2 }, teclas: ['KeyW'], segundos: 2.0, depois: ['KeyW', 'KeyA'], maisSegundos: 0.9, cam: [4.5, 2.2, 4.0], alvo: [0, 0.8, 0], fov: 55 },
    { nome: 'car-07-freio-de-mao', tipo: 'carro', inicio: { x: 24, z: -5.4, yaw: -Math.PI / 2 }, teclas: ['KeyW'], segundos: 2.0, depois: ['KeyW', 'KeyA', 'Space'], maisSegundos: 0.9, cam: [5.0, 2.6, 3.0], alvo: [0, 0.8, 0], fov: 58 },
  ],
  skate: [
    { nome: 'ska-01-perfil', tipo: 'skate', cam: [1.6, 0.5, 0.1], alvo: [0, 0.15, 0], fov: 40 },
    { nome: 'ska-02-parado', tipo: 'skate', segundos: 0.6, cam: [-2.2, 1.2, 1.6], alvo: [0, 0.9, 0], fov: 48 },
    { nome: 'ska-03-empurrando', tipo: 'skate', teclas: ['KeyW'], segundos: 0.55, cam: [-2.4, 1.1, 1.0], alvo: [0, 0.8, -0.1], fov: 50 },
    { nome: 'ska-04-varrendo', tipo: 'skate', teclas: ['KeyW'], segundos: 1.25, cam: [-2.4, 1.0, 0.6], alvo: [0, 0.75, -0.1], fov: 50 },
    { nome: 'ska-05-rolando', tipo: 'skate', teclas: ['KeyW'], segundos: 4.0, cam: [-2.6, 1.3, 1.8], alvo: [0, 0.85, 0], fov: 50 },
    { nome: 'ska-06-freando', tipo: 'skate', teclas: ['KeyW'], segundos: 3.0, depois: ['KeyS'], maisSegundos: 0.8, cam: [-2.4, 1.1, -0.6], alvo: [0, 0.8, -0.1], fov: 52 },
    { nome: 'ska-08-zoom-quadril', tipo: 'skate', teclas: ['KeyW'], segundos: 4.0, cam: [-1.1, 0.95, 0.5], alvo: [0, 0.85, 0], fov: 40 },
    { nome: 'ska-09-re', tipo: 'skate', teclas: ['KeyS'], segundos: 2.2, cam: [-2.4, 1.1, -0.8], alvo: [0, 0.8, 0], fov: 50 },
    { nome: 'ska-07-de-tras', tipo: 'skate', teclas: ['KeyW'], segundos: 1.25, cam: [-1.2, 1.3, -2.2], alvo: [0, 0.7, 0], fov: 50 },
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

const PORT = 9833 + (process.pid % 120)
const perfil = path.join(os.tmpdir(), 'minicity-pilot-' + PORT)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + perfil, '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
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
  await page.waitForFunction('window.__game && window.__game.veiculos', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const t of tomadas) {
    const saida = await page.evaluate(async (cfg) => {
      const G = window.__game
      const T = G.THREE || window.THREE

      // --- acha o veiculo do tipo pedido ---------------------------------
      let alvoG = null
      G.veiculos.grupo.traverse((o) => { if (!alvoG && o.name === cfg.tipo) alvoG = o })
      if (!alvoG) return { erro: 'veiculo nao encontrado: ' + cfg.tipo }

      // --- desce de qualquer veiculo e devolve todos pra vaga -------------
      if (G.veiculos.dirigindo) G.veiculos.entrarSair()
      await new Promise((r) => setTimeout(r, 60))
      G.veiculos.atualizar(0.016)
      for (const k in cfg.vagas) {
        const v = (cfg.inicio && k === cfg.tipo) ? cfg.inicio : cfg.vagas[k]
        G.veiculos.aoEventoDeRede({
          tipo: 'veiculo-pos', veiculoId: cfg.vagas[k].id,
          x: v.x, y: 0, z: v.z, yaw: v.yaw, rolagem: 0,
        })
      }
      G.veiculos.atualizar(0.016)

      const tecla = (code, tipo) => window.dispatchEvent(
        new KeyboardEvent(tipo, { code, bubbles: true }))
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']) tecla(c, 'keyup')

      const passo = 1 / 60
      const rodar = (segs) => {
        const n = Math.max(1, Math.round((segs || 0) / passo))
        for (let i = 0; i < n; i++) G.veiculos.atualizar(passo)
      }

      if (cfg.teclas || cfg.segundos) {
        // entra: teleporta pro lado do veiculo e chama o mesmo E do jogo
        G.player.teleport(alvoG.position.x + 1.2, alvoG.position.z, 0)
        G.veiculos.entrarSair()
        await new Promise((r) => setTimeout(r, 80))
        rodar(0.2)
        for (const c of (cfg.teclas || [])) tecla(c, 'keydown')
        rodar(cfg.segundos || 1)
        if (cfg.depois) {
          for (const c of (cfg.teclas || [])) tecla(c, 'keyup')
          for (const c of cfg.depois) tecla(c, 'keydown')
          rodar(cfg.maisSegundos || 0.5)
          for (const c of cfg.depois) tecla(c, 'keyup')
        }
        for (const c of (cfg.teclas || [])) tecla(c, 'keyup')
      } else {
        rodar(0.1)
      }

      // --- camera no espaco do veiculo -------------------------------------
      alvoG.updateMatrixWorld(true)
      const naCena = (d) => {
        const v = new T.Vector3(d[0], d[1], d[2])
        v.applyEuler(new T.Euler(0, alvoG.rotation.y, 0))
        return v.add(alvoG.position)
      }
      const c = G.camera
      const p = naCena(cfg.cam)
      const a = naCena(cfg.alvo)
      c.fov = cfg.fov || 50
      c.position.copy(p)
      c.up.set(0, 1, 0)
      c.lookAt(a)
      c.updateProjectionMatrix()
      if (G.lighting) {
        G.lighting.setTarget({ x: alvoG.position.x, z: alvoG.position.z })
        G.lighting.update(0.0001)
      }
      G.engine.render()
      return {
        img: G.renderer.domElement.toDataURL('image/png'),
        vel: +(G.veiculos.dirigindo ? 0 : 0),
        pos: [+alvoG.position.x.toFixed(2), +alvoG.position.z.toFixed(2)],
      }
    }, Object.assign({ vagas: VAGA }, t))

    if (saida.erro) { console.log(t.nome, 'ERRO:', saida.erro); continue }
    const arq = path.join(dir, t.nome + '.png')
    fs.writeFileSync(arq, Buffer.from(saida.img.split(',')[1], 'base64'))
    console.log(arq, saida.pos.join(','))
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 15).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
