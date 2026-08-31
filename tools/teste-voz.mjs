// CHAT DE VOZ POR PROXIMIDADE — o teste.
//
//   node tools/teste-voz.mjs
//
// O que NAO da pra testar aqui: se sai som. Isso precisa de duas maquinas, dois
// microfones e um par de ouvidos. O que da — e e onde os bugs de verdade moram —
// e a MAQUINA DE ESTADO: quem liga pra quem, quando liga, quando desliga, e o
// que acontece quando alguem some no meio da conversa.
//
// Duas mentiras deixam isso rodar numa maquina so:
//
//   1. o Peer e falso. `window.Peer` vira um dublê que anota as chamadas em vez
//      de abrir WebRTC. Assim "ligou pro id 2" vira uma asserção, e nao um
//      pedido a um servidor publico na internet.
//   2. o microfone e falso, mas nao e dublê: as flags
//      --use-fake-device-for-media-stream / --use-fake-ui-for-media-stream
//      fazem o proprio Chrome entregar um microfone sintetico e responder "sim"
//      ao pedido de permissao. Entao getUserMedia, AudioContext, PannerNode e
//      createMediaStreamSource sao os DE VERDADE — o grafo de audio que este
//      teste monta e exatamente o que roda no jogo.
//
// Roda em cima do BUILD, como o resto das ferramentas do projeto.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8700 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

let ok = 0
let falhas = 0
function checar(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome) }
  else { falhas++; console.log('  FALHOU  ' + nome + (extra ? '   -> ' + extra : '')) }
}
function secao(t) { console.log(t) }

/**
 * Espera uma CONDICAO, e nao um tempo.
 *
 * A primeira versao dormia 400 ms e conferia o botao. Falhava — nao por bug no
 * jogo, mas porque `fluxo.jogar()` levanta a cidade inteira e o primeiro quadro
 * depois disso demora bem mais que isso em headless (o proprio smoke mede
 * 40 ms/quadro na rua, com o SwiftShader). Como e o laco de quadro que mostra e
 * esconde o botao, dormir um numero fixo mede a velocidade da maquina, e nao o
 * comportamento. E a mesma armadilha ja documentada em tools/teste-bebida.mjs.
 */
async function ate(page, expr, max) {
  try {
    await page.waitForFunction(expr, { timeout: max || 15000, polling: 100 })
    return true
  } catch (e) { void e; return false }
}

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

const PORT = 9820 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-voz-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  // as tres que dao microfone e audio sem gente na frente da maquina
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
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
    if (m.type() === 'error' && !/404|favicon|WebSocket|unpkg|peerjs/i.test(m.text())) {
      erros.push(m.text().slice(0, 200))
    }
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.voz', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1800))

  // --- o dublê do PeerJS ---------------------------------------------------
  // Ele registra em window.__peerLog tudo que o voz.js pediu. As asserções
  // adiante leem essa lista.
  await page.evaluate(() => {
    const G = window.__game
    G.fluxo.jogar()
    if (G.menu && G.menu.fechar) G.menu.fechar()
    // o veu inicial fica por cima de tudo e roubaria o clique no botao
    document.querySelectorAll('.mcrp-menu, #hud-start').forEach((e) => { e.style.display = 'none' })

    window.__peerLog = { criados: [], chamadas: [], fechadas: [] }

    function Conexao(peerId) {
      this.peer = peerId
      this.ouvintes = {}
      this.fechada = false
    }
    Conexao.prototype.on = function (ev, cb) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(cb) }
    Conexao.prototype.emitir = function (ev, arg) {
      for (const cb of (this.ouvintes[ev] || [])) cb(arg)
    }
    Conexao.prototype.answer = function () {}
    Conexao.prototype.close = function () {
      this.fechada = true
      window.__peerLog.fechadas.push(this.peer)
    }
    window.__Conexao = Conexao

    window.Peer = function FalsoPeer(id) {
      window.__peerLog.criados.push(id)
      this.id = id
      this.ouvintes = {}
      window.__peer = this
      // 'open' tem que chegar DEPOIS, e nao durante o construtor: no PeerJS de
      // verdade ele vem de uma volta na rede, e voz.js espera por ele.
      setTimeout(() => { for (const cb of (this.ouvintes.open || [])) cb(id) }, 0)
    }
    window.Peer.prototype.on = function (ev, cb) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(cb) }
    window.Peer.prototype.call = function (peerId) {
      window.__peerLog.chamadas.push(peerId)
      const c = new Conexao(peerId)
      window.__ultimaChamada = c
      return c
    }
    window.Peer.prototype.destroy = function () { window.__peer = null }
    window.Peer.prototype.reconnect = function () {}

    // --- a sala falsa ---
    // Sem servidor de verdade nao ha snapshot, entao `rede.atualizar` nao mexe
    // em `rede.jogadores` (sem par de snapshots ele nem entra na interpolacao)
    // e o mapa que eu escrever aqui fica de pe.
    G.rede.conectado = true
    G.rede.meuId = 1
    G.rede.jogadores.clear()
    G.player.teleport(0, 0, 0)
    for (let i = 0; i < 10; i++) G.player.update(1 / 60)

    window.__por = (id, x, z) => {
      G.rede.jogadores.set(id, { id, nome: 'p' + id, x, y: G.player.position.y, z, yaw: 0, anim: 0, flags: 0 })
    }
    window.__tique = (segundos, passo) => {
      const p = passo || 1 / 60
      for (let t = 0; t < segundos; t += p) G.voz.atualizar(p)
    }
  })

  // --- o botao -------------------------------------------------------------
  // A parte que NAO da pra testar com element.click(): um clique disparado por
  // script nao e ativacao de usuario. `page.click` manda o evento pelo CDP, que
  // e confiavel do ponto de vista do navegador — o mesmo tipo de clique que
  // libera a pergunta da permissao. Testar com o clique falso mediria outra
  // coisa que nao a que interessa.
  secao('O BOTAO')
  const apareceu = await ate(page, "document.querySelector('#hud-mic').classList.contains('on')")
  const botao = await page.evaluate(() => {
    const b = document.querySelector('#hud-mic')
    if (!b) return null
    return {
      texto: (b.querySelector('span') || {}).textContent,
      tag: b.tagName,
      visivel: b.classList.contains('on'),
      clicavel: getComputedStyle(b).pointerEvents,
      atalho: (b.querySelector('kbd') || {}).textContent,
    }
  })
  checar('o botao existe no HUD', !!botao)
  checar('com o texto pedido', botao && botao.texto === 'Ativar Microfone', botao && botao.texto)
  checar('e um <button>, nao uma div clicavel', botao && botao.tag === 'BUTTON', botao && botao.tag)
  checar('aparece com o cursor livre', apareceu && botao && botao.visivel === true)
  checar('aceita clique (o resto do HUD e pointer-events: none)',
    botao && botao.clicavel === 'auto', botao && botao.clicavel)
  checar('ensina a tecla V', botao && botao.atalho === 'V', botao && botao.atalho)

  await page.click('#hud-mic')
  await page.waitForFunction('window.__game.voz.ativa === true', { timeout: 15000 }).catch(() => {})

  secao('LIGAR (pelo clique do botao)')
  const ligou = await page.evaluate(() => {
    return { r: window.__game.voz.ativa, est: window.__game.voz.estado(), criados: window.__peerLog.criados }
  })
  checar('o clique abre o microfone e sobe o Peer', ligou.r === true && ligou.est.ativa === true, ligou.est.erro)
  checar('o peer id deriva do id do jogador (sem pacote novo)',
    /^mcrp-[a-z0-9]+-1$/.test(ligou.est.meuPeerId), ligou.est.meuPeerId)
  checar('registrou exatamente um id no broker', ligou.criados.length === 1, String(ligou.criados))

  const sumiu0 = await ate(page, "!document.querySelector('#hud-mic').classList.contains('on')")
  checar('e o botao some depois de ligado', sumiu0 === true)

  // --- proximidade ---------------------------------------------------------
  secao('PROXIMIDADE (perto 15 m, longe 18 m)')
  const longe = await page.evaluate(() => {
    window.__por(2, 40, 0)
    window.__tique(0.5)
    return window.__peerLog.chamadas.slice()
  })
  checar('a 40 m nao liga pra ninguem', longe.length === 0, String(longe))

  const perto = await page.evaluate(() => {
    window.__por(2, 10, 0)
    window.__tique(0.2)
    return { chamadas: window.__peerLog.chamadas.slice(), est: window.__game.voz.estado() }
  })
  checar('a 10 m liga pro jogador 2', perto.chamadas.length === 1 && /-2$/.test(perto.chamadas[0]),
    String(perto.chamadas))
  checar('enquanto a stream nao chega, ele conta como "abrindo"',
    perto.est.abrindo.indexOf(2) >= 0 && perto.est.ouvindo.length === 0)

  const soUma = await page.evaluate(() => {
    window.__tique(2)
    return window.__peerLog.chamadas.length
  })
  checar('nao liga de novo a cada quadro', soUma === 1, 'chamadas=' + soUma)

  // --- o grafo de audio de verdade ----------------------------------------
  secao('AUDIO POSICIONAL')
  const comStream = await page.evaluate(async () => {
    // um segundo microfone falso serve de "voz do outro" — e uma MediaStream
    // com faixa de audio de verdade, que e o que createMediaStreamSource exige
    const s = await navigator.mediaDevices.getUserMedia({ audio: true })
    window.__ultimaChamada.emitir('stream', s)
    window.__tique(0.2)
    return window.__game.voz.estado()
  })
  checar('a stream vira audio tocando', comStream.ouvindo.indexOf(2) >= 0 && comStream.abrindo.length === 0)

  const panner = await page.evaluate(() => {
    // o <audio> mudo tem que existir: sem ele o Chrome nao entrega amostra
    // nenhuma ao Web Audio (ver o cabecalho de voz.js)
    const els = Array.from(document.querySelectorAll('audio'))
    return { n: els.length, mudos: els.filter((e) => e.muted).length }
  })
  checar('cada voz tem seu <audio> mudo (a armadilha do Chrome)',
    panner.n >= 1 && panner.mudos === panner.n, JSON.stringify(panner))

  // --- histerese -----------------------------------------------------------
  secao('HISTERESE E PACIENCIA')
  const zonaMorta = await page.evaluate(() => {
    window.__por(2, 16.5, 0)   // passou de PERTO, nao chegou em LONGE
    window.__tique(3)
    return window.__game.voz.estado()
  })
  checar('entre 15 e 18 m a conversa continua', zonaMorta.ouvindo.indexOf(2) >= 0)

  const pouco = await page.evaluate(() => {
    window.__por(2, 30, 0)
    window.__tique(1.0)
    return window.__game.voz.estado()
  })
  checar('1 s longe ainda nao desliga (paciencia de 2 s)', pouco.ouvindo.indexOf(2) >= 0)

  const voltou = await page.evaluate(() => {
    window.__por(2, 5, 0)      // voltou antes de estourar a paciencia
    window.__tique(0.5)
    return { est: window.__game.voz.estado(), chamadas: window.__peerLog.chamadas.length }
  })
  checar('voltar antes dos 2 s nao paga chamada nova',
    voltou.est.ouvindo.indexOf(2) >= 0 && voltou.chamadas === 1, 'chamadas=' + voltou.chamadas)

  const caiu = await page.evaluate(() => {
    window.__por(2, 30, 0)
    window.__tique(2.4)
    return { est: window.__game.voz.estado(), fechadas: window.__peerLog.fechadas.slice() }
  })
  checar('passou dos 2 s longe, desliga', caiu.est.ouvindo.length === 0 && caiu.est.abrindo.length === 0)
  checar('e fecha a chamada, nao so solta a referencia', caiu.fechadas.length === 1, String(caiu.fechadas))

  const limpou = await page.evaluate(() => document.querySelectorAll('audio').length)
  checar('o <audio> vai junto (sem vazar elemento por chamada)', limpou === 0, 'sobraram ' + limpou)

  // --- quem liga pra quem --------------------------------------------------
  secao('SO O ID MENOR LIGA')
  const glare = await page.evaluate(() => {
    window.__peerLog.chamadas.length = 0
    window.__game.rede.meuId = 9        // agora EU sou o maior
    window.__por(2, 3, 0)
    window.__tique(1)
    return window.__peerLog.chamadas.slice()
  })
  checar('sendo o id maior, eu espero — nao ligo', glare.length === 0, String(glare))

  const atende = await page.evaluate(() => {
    const est0 = window.__game.voz.estado()
    const c = new window.__Conexao(est0.meuPeerId.replace(/-\d+$/, '-2'))
    window.__peer.ouvintes.call[0](c)
    window.__tique(0.1)
    return { est: window.__game.voz.estado(), fechada: c.fechada }
  })
  checar('mas atendo quem liga pra mim', atende.est.abrindo.indexOf(2) >= 0 && !atende.fechada)

  secao('O BROKER E PUBLICO')
  const estranho = await page.evaluate(() => {
    const c = new window.__Conexao('mcrp-outraSala-77')
    window.__peer.ouvintes.call[0](c)
    const c2 = new window.__Conexao(window.__game.voz.estado().meuPeerId.replace(/-\d+$/, '-404'))
    window.__peer.ouvintes.call[0](c2)
    return { est: window.__game.voz.estado(), f1: c.fechada, f2: c2.fechada }
  })
  checar('recusa chamada de fora da sala', estranho.f1 === true)
  checar('recusa id que o servidor do jogo nao conhece', estranho.f2 === true)
  checar('e nenhuma das duas entrou na lista',
    estranho.est.ouvindo.indexOf(77) < 0 && estranho.est.abrindo.indexOf(404) < 0)

  // --- saidas --------------------------------------------------------------
  secao('SAIDAS')
  const sumiu = await page.evaluate(() => {
    window.__game.rede.jogadores.delete(2)
    window.__tique(1 / 60, 1 / 60)      // UM quadro: sem paciencia nenhuma
    return window.__game.voz.estado()
  })
  checar('quem sai do jogo cai na hora, sem esperar os 2 s',
    sumiu.ouvindo.length === 0 && sumiu.abrindo.length === 0)

  const mudo = await page.evaluate(() => {
    const antes = window.__game.voz.alternarMudo()
    const est = window.__game.voz.estado()
    const depois = window.__game.voz.alternarMudo()
    return { antes, mudoNoEstado: est.mudo, depois, hud: !!document.querySelector('#hud-voz.mudo') }
  })
  checar('V alterna mudo (e volta)', mudo.antes === true && mudo.mudoNoEstado === true && mudo.depois === false)

  const hudLigado = await page.evaluate(() => {
    const G = window.__game
    G.hud.setVoz(G.voz.estado())
    const el = document.querySelector('#hud-voz')
    return { visivel: el && el.style.display !== 'none', mudo: el && el.classList.contains('mudo') }
  })
  checar('o HUD mostra a linha do microfone', hudLigado.visivel === true)
  checar('e ela nao esta em vermelho depois de desmutar', hudLigado.mudo === false)

  const desligou = await page.evaluate(() => {
    window.__game.voz.desligar()
    const G = window.__game
    G.hud.setVoz(G.voz.estado())
    const el = document.querySelector('#hud-voz')
    return { ativa: G.voz.ativa, hud: el.style.display, audios: document.querySelectorAll('audio').length }
  })
  checar('desligar mata o microfone', desligou.ativa === false)
  const voltou0 = await ate(page, "document.querySelector('#hud-mic').classList.contains('on')")
  checar('e o botao volta pra quem quiser ligar de novo', voltou0 === true)
  checar('e some com a linha do HUD', desligou.hud === 'none')
  checar('sem sobrar elemento de audio', desligou.audios === 0)

  console.log('')
  if (erros.length) {
    console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 8).join('\n'))
    falhas += erros.length
  }
  console.log(falhas ? (falhas + ' caso(s) falharam') : ('tudo certo — ' + ok + ' casos'))
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
process.exit(falhas ? 1 : 0)
