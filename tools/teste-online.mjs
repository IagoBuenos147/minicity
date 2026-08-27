// Teste do modo online com jogadores DE VERDADE.
//
//   1. sobe o servidor (porta de teste)
//   2. abre dois navegadores headless no jogo
//   3. confere que um ve o outro, que o dialogo e compartilhado e que o
//      servidor decide quem pega o objeto
//   4. mede a banda por jogador com 5 conectados (clientes 'ws' em Node)
//
//   node tools/teste-online.mjs
//
// Sai com codigo 1 se algum caso falhar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import * as Proto from '../src/comum/protocolo.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = Number(process.env.PORTA_TESTE || (8200 + (process.pid % 300)))
const BASE = 'http://127.0.0.1:' + PORTA

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
function acharNavegador() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

// --------------------------------------------------------------- servidor
const srv = spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { PORTA: String(PORTA), NODE_ENV: '' }),
  stdio: ['ignore', 'pipe', 'pipe'],
})
let logSrv = ''
srv.stdout.on('data', (d) => { logSrv += d })
srv.stderr.on('data', (d) => { logSrv += d })

async function esperarSaude() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/saude')
      if (r.ok) return await r.json()
    } catch (err) { void err }
    await espera(250)
  }
  throw new Error('servidor nao subiu\n' + logSrv)
}

// ----------------------------------------------------------- navegadores
// UM NAVEGADOR POR JOGADOR, de proposito.
// Com os dois jogadores em ABAS do mesmo navegador, o Chrome congela o
// requestAnimationFrame da aba que nao esta na frente — medi 1 quadro em 3
// segundos — e as flags de --disable-*-backgrounding nao dao jeito no headless.
// O jogador congelado nao envia nem interpola, e o teste acusa "bug de rede"
// que nao existe. Processos separados ficam os dois em primeiro plano.
const navs = []
function subirNavegador(indice) {
  const porta = 9400 + indice * 7 + (process.pid % 50)
  const proc = spawn(acharNavegador(), [
    '--headless=new', '--remote-debugging-port=' + porta,
    '--user-data-dir=' + path.join(os.tmpdir(), 'mcrp-online-' + porta),
    '--no-first-run', '--no-default-browser-check',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--ignore-gpu-blocklist', '--window-size=640,480',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' })
  navs.push(proc)
  return porta
}

async function esperarCdp(porta) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + porta + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await espera(250)
  }
  throw new Error('navegador nao abriu a porta de debug ' + porta)
}

const browsers = []
try {
  const saude = await esperarSaude()
  ok('servidor no ar', saude.ok === true, 'protocolo v' + saude.versaoProtocolo)

  async function abrirJogador(nome, indice) {
    const porta = subirNavegador(indice)
    const br = await puppeteer.connect({ browserWSEndpoint: await esperarCdp(porta) })
    browsers.push(br)
    const pg = await br.newPage()
    await pg.setViewport({ width: 640, height: 480 })
    const erros = []
    pg.on('pageerror', (e) => erros.push(String(e)))
    pg.on('console', (m) => {
      const t = m.text()
      if (m.type() === 'error' && !/favicon|404/.test(t)) erros.push(t)
    })
    // o nome vem do localStorage: fixa antes de carregar
    await pg.evaluateOnNewDocument((n) => {
      try { localStorage.setItem('mcrp-nome', n) } catch (e) { void e }
    }, nome)
    // domcontentloaded, nao networkidle2: o jogo abre um WebSocket que troca 15
    // pacotes por segundo pra sempre, entao a rede NUNCA fica ociosa e o
    // networkidle2 estoura o tempo mesmo com a pagina funcionando.
    await pg.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await pg.waitForFunction('window.__game && window.__game.rede', { timeout: 60000 })
    // O headless renderiza por software (SwiftShader) e este cenario e pesado:
    // sem isso o laco fica em ~2 fps e o envio a 15 Hz vira 2 Hz, o que faz o
    // teste medir lentidao em vez de rede. Tela pequena e sem pos-processamento
    // devolve o laco pra uma taxa util. O que se testa aqui e a REDE.
    await pg.evaluate(() => {
      const G = window.__game
      try { G.engine.setPostEnabled(false) } catch (e) { void e }
      G.renderer.setSize(320, 240, false)
      G.camera.aspect = 320 / 240
      G.camera.updateProjectionMatrix()
      G.renderer.shadowMap.enabled = false
    })
    await pg.waitForFunction('window.__game.rede.conectado === true', { timeout: 30000 })
    // espera o laco ficar utilizavel antes de medir qualquer coisa
    await pg.evaluate(() => new Promise((res) => {
      let q = 0
      const t0 = performance.now()
      const f = () => { q++; if (q >= 20 || performance.now() - t0 > 6000) return res(q); requestAnimationFrame(f) }
      requestAnimationFrame(f)
    }))
    pg._erros = erros
    return pg
  }

  const a = await abrirJogador('AAA', 0)
  const b = await abrirJogador('BBB', 1)
  await espera(1500)

  const idA = await a.evaluate(() => window.__game.rede.meuId)
  const idB = await b.evaluate(() => window.__game.rede.meuId)
  ok('os dois entraram com id proprio', idA > 0 && idB > 0 && idA !== idB, 'A=' + idA + ' B=' + idB)

  // ---- 1. um ve o outro, e ve o outro SE MEXER --------------------------
  await a.evaluate(() => { window.__game.player.teleport(6, 4, 0) })
  await espera(2500)
  const bVeA1 = await b.evaluate((id) => {
    const j = window.__game.rede.jogadores.get(id)
    return j ? { x: +j.x.toFixed(2), z: +j.z.toFixed(2) } : null
  }, idA)
  await a.evaluate(() => { window.__game.player.teleport(-6, 4, 0) })
  await espera(2500)
  const bVeA2 = await b.evaluate((id) => {
    const j = window.__game.rede.jogadores.get(id)
    return j ? { x: +j.x.toFixed(2), z: +j.z.toFixed(2) } : null
  }, idA)
  ok('B ve A na sala', !!bVeA1, bVeA1 ? JSON.stringify(bVeA1) : 'nao viu')
  ok('B ve A se mexendo', !!(bVeA1 && bVeA2 && Math.abs(bVeA2.x - bVeA1.x) > 3),
    bVeA1 && bVeA2 ? bVeA1.x + ' -> ' + bVeA2.x : '')

  // o boneco de A existe mesmo na cena de B?
  const bonecoEmB = await b.evaluate(() => {
    let n = 0
    window.__game.scene.traverse((o) => { if ((o.userData && o.userData.avatarId) || /^avatar:/.test(o.name || '')) n++ })
    return n
  })
  ok('B desenha o boneco de A', bonecoEmB > 0, bonecoEmB + ' avatares na cena')

  // ---- 2. dialogo compartilhado ----------------------------------------
  // os dois ficam perto do barbeiro; A pede pra falar
  await a.evaluate(() => window.__game.player.teleport(18.5, -15.5, 0))
  await b.evaluate(() => window.__game.player.teleport(19.5, -16.5, 0))
  await espera(2500)
  await a.evaluate(() => window.__game.rede.falar(1000))
  await espera(1800)

  const dlgA = await a.evaluate(() => ({ aberto: window.__game.dialogo.aberto, meu: window.__game.dialogo.meu }))
  const dlgB = await b.evaluate(() => ({ aberto: window.__game.dialogo.aberto, meu: window.__game.dialogo.meu }))
  ok('quem pediu ve o dialogo', dlgA.aberto === true)
  ok('quem esta perto TAMBEM ve', dlgB.aberto === true)
  ok('so quem iniciou responde', dlgA.meu === true && dlgB.meu === false)

  // o NPC virou de frente pro A, na tela dos DOIS?
  const npcA = await a.evaluate(() => { const n = window.__game.rede.npcs.get(1000); return n ? +n.yaw.toFixed(2) : null })
  const npcB = await b.evaluate(() => { const n = window.__game.rede.npcs.get(1000); return n ? +n.yaw.toFixed(2) : null })
  ok('o NPC virou igual nas duas telas', npcA !== null && npcB !== null && Math.abs(npcA - npcB) < 0.2,
    'A=' + npcA + ' B=' + npcB)

  // B tenta falar com o mesmo NPC: tem que ser negado
  const negou = await b.evaluate(async () => {
    let visto = null
    const antes = window.__game.rede.aoEvento
    window.__game.rede.aoEvento = (ev) => { if (ev.tipo === 'negado') visto = ev; if (antes) antes(ev) }
    window.__game.rede.falar(1000)
    await new Promise((r) => setTimeout(r, 800))
    window.__game.rede.aoEvento = antes
    return visto
  })
  ok('o segundo a pedir e recusado', !!negou, negou ? 'oque=' + negou.oque : 'nao veio NEGADO')

  // A sai do dialogo: o NPC volta a ficar livre
  await a.evaluate(() => window.__game.rede.sairDialogo())
  await espera(800)
  const livre = await b.evaluate(() => { const n = window.__game.rede.npcs.get(1000); return n ? n.falandoCom : -1 })
  ok('sair libera o NPC', livre === 0, 'falandoCom=' + livre)

  // ---- 3. telecinese: o servidor decide quem pegou ----------------------
  const objId = 2000
  const r1 = await a.evaluate(async (id) => {
    let dono = null
    const antes = window.__game.rede.aoEvento
    window.__game.rede.aoEvento = (ev) => { if (ev.tipo === 'obj-dono' && ev.objId === id) dono = ev.donoId; if (antes) antes(ev) }
    window.__game.rede.pegar(id)
    await new Promise((r) => setTimeout(r, 700))
    window.__game.rede.aoEvento = antes
    return dono
  }, objId)
  ok('A pega o objeto', r1 === idA, 'dono=' + r1)

  const r2 = await b.evaluate(async (id) => {
    let neg = null
    const antes = window.__game.rede.aoEvento
    window.__game.rede.aoEvento = (ev) => { if (ev.tipo === 'negado') neg = ev; if (antes) antes(ev) }
    window.__game.rede.pegar(id)
    await new Promise((r) => setTimeout(r, 700))
    window.__game.rede.aoEvento = antes
    return neg
  }, objId)
  ok('B nao rouba o objeto de A', !!r2, r2 ? 'negado oque=' + r2.oque : 'nao veio NEGADO')

  // ---- 4. sair libera tudo na hora --------------------------------------
  await a.close()
  await espera(3500)
  const depois = await b.evaluate((id) => {
    const o = window.__game.rede.objetos.get(id)
    return { dono: o ? o.dono : -1, jogadores: window.__game.rede.jogadores.size }
  }, objId)
  ok('sair solta o objeto que ele segurava', depois.dono === 0, 'dono=' + depois.dono)
  ok('sair tira o jogador da sala', depois.jogadores === 0, 'restam ' + depois.jogadores)

  const errosB = await b.evaluate(() => 0)
  void errosB
  ok('sem erro de console no cliente', b._erros.length === 0, b._erros.slice(0, 2).join(' | '))

  await b.close()

  // ---- 5. banda por jogador com 5 conectados ----------------------------
  console.log('\n--- banda com 5 jogadores conectados (medida por 10 s) ---')
  const socks = []
  const recebido = []
  for (let i = 0; i < 5; i++) {
    const ws = new WebSocket('ws://127.0.0.1:' + PORTA)
    ws.binaryType = 'arraybuffer'
    recebido[i] = 0
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej) })
    ws.on('message', (d) => { recebido[i] += d.byteLength || d.length || 0 })
    ws.send(Buffer.from(new Uint8Array(Proto.escreverEntrar('Bot' + i, {
      hair: i % 3, eyes: i % 3, brows: 0, mouth: 0, hairColor: i % 5, skin: 0,
    }))))
    socks.push(ws)
  }
  await espera(1200)
  for (const s of socks) recebido[socks.indexOf(s)] = 0   // zera depois do BEMVINDO

  const t0 = Date.now()
  const timer = setInterval(() => {
    for (let i = 0; i < socks.length; i++) {
      const ang = (Date.now() / 1000 + i) % (Math.PI * 2)
      socks[i].send(Buffer.from(new Uint8Array(Proto.escreverMeuEstado(
        Math.cos(ang) * 8, 0, Math.sin(ang) * 8, ang, 1, 0))))
    }
  }, 1000 / 15)
  await espera(10000)
  clearInterval(timer)
  const segundos = (Date.now() - t0) / 1000
  const media = recebido.reduce((a, b2) => a + b2, 0) / recebido.length / segundos
  console.log('  recebido por jogador: ' + (media / 1024).toFixed(1) + ' KB/s  (' +
    Math.round(media) + ' B/s)  ·  ' + (media * 8 / 1000).toFixed(0) + ' kbps')
  ok('banda por jogador abaixo de 40 KB/s', media < 40 * 1024, (media / 1024).toFixed(1) + ' KB/s')
  for (const s of socks) s.close()

  const falhas = casos.filter((c) => !c.passou)
  console.log('\n' + (casos.length - falhas.length) + '/' + casos.length + ' casos passaram')
  process.exitCode = falhas.length ? 1 : 0
} catch (e) {
  console.error('ERRO NO TESTE: ' + (e && e.message))
  console.error(logSrv.slice(-2000))
  process.exitCode = 1
} finally {
  for (const br of browsers) { try { await br.close() } catch (err) { void err } }
  for (const n of navs) { try { n.kill() } catch (err) { void err } }
  try { srv.kill() } catch (err) { void err }
}
