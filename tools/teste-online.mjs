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
import { MAX_JOGADORES } from '../src/comum/mundo.js'
import { GROCERY, WALL_T } from '../src/world/layout.js'

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

  // ---- 0. os pacotes do LOBBY, ida e volta -------------------------------
  // Barato, e vale a pena antes de subir navegador nenhum: se o pacote que
  // carrega a sala estiver torto, todo o resto do teste falharia por um motivo
  // que nao tem nada a ver com rede.
  {
    const b = Proto.escreverSalaEstado(Proto.FASE_CRIANDO, 7,
      [{ id: 7, pronto: true }, { id: 9, pronto: false }])
    const m = Proto.lerSalaEstado(new DataView(b))
    ok('SALA_ESTADO ida e volta',
      !!m && m.fase === Proto.FASE_CRIANDO && m.anfitriao === 7
      && m.jogadores.length === 2 && m.jogadores[0].pronto === true
      && m.jogadores[1].pronto === false,
      b.byteLength + ' bytes, anfitriao ' + (m && m.anfitriao))
  }
  ok('a sala e de 2 a 4 pessoas', MAX_JOGADORES === 4, 'MAX_JOGADORES=' + MAX_JOGADORES)
  ok('PRONTO, COMECAR e MEU_NOME sao confiaveis',
    Proto.ehConfiavel(Proto.P.PRONTO) && Proto.ehConfiavel(Proto.P.COMECAR)
    && Proto.ehConfiavel(Proto.P.MEU_NOME),
    'tipos ' + Proto.P.PRONTO + '/' + Proto.P.COMECAR + '/' + Proto.P.MEU_NOME)

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
      // Conta quantos WebSocket a PAGINA abre. E o que separa "o cliente
      // conecta duas vezes" de "o servidor cria dois jogadores por conexao".
      const Orig = window.WebSocket
      window.__wsAbertos = []
      window.WebSocket = function (url, protos) {
        window.__wsAbertos.push(String(url))
        return protos === undefined ? new Orig(url) : new Orig(url, protos)
      }
      window.WebSocket.prototype = Orig.prototype
      for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) window.WebSocket[k] = Orig[k]
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
    // O jogo abre no MENU e NAO conecta sozinho (quem conecta e o botao COOP).
    // Este teste e sobre o mundo compartilhado, nao sobre o fluxo de entrada —
    // entao ele usa o mesmo atalho do teste de fumaca, pedindo a versao que ja
    // entra na sala. O fluxo em si e testado em tools/teste-lobby.mjs.
    await pg.evaluate(() => window.__game.fluxo.jogar({ online: true }))
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

  const wsA = await a.evaluate(() => window.__wsAbertos || [])
  const wsB = await b.evaluate(() => window.__wsAbertos || [])
  // Guarda de regressao com historia: o pedaco carregado sob demanda (carro,
  // moto, skate) importa o pedaco principal pelo caminho ESCRITO DENTRO DO JS,
  // sem o ?v= que o servidor carimba no HTML. Duas URLs para o mesmo arquivo =
  // dois modulos = o jogo inteiro iniciando duas vezes, com duas conexoes e um
  // sosia parado do lado de cada jogador. Se este caso falhar de novo, olhe
  // carimbarVersao em servidor/rede-ws.js antes de qualquer outra coisa.
  ok('cada pagina abre UM WebSocket', wsA.length === 1 && wsB.length === 1,
    'A abriu ' + wsA.length + ', B abriu ' + wsB.length)

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
    const ids = []
    window.__game.scene.traverse((o) => {
      if (o.userData && o.userData.avatarId) ids.push(o.userData.avatarId)
    })
    const nomes = []
    for (const [id, j] of window.__game.rede.jogadores) nomes.push(id + ':' + (j.nome || '?'))
    return { ids, nomes, eu: window.__game.rede.meuId }
  })
  ok('B desenha o boneco de A', bonecoEmB.ids.length > 0,
    'avatares=[' + bonecoEmB.ids.join(',') + '] sala=[' + bonecoEmB.nomes.join(' ') + '] eu=' + bonecoEmB.eu)
  // Cada navegador tem que valer UM jogador. Dois ids com o mesmo nome quer
  // dizer sessao duplicada — em sala de 20 isso dobra a conta do servidor e
  // poe um sosia parado do lado de cada jogador.
  const semDuplicata = new Set(bonecoEmB.nomes.map((n) => n.split(':')[1])).size === bonecoEmB.nomes.length
  ok('nenhum jogador aparece duas vezes', semDuplicata, bonecoEmB.nomes.join(' '))

  // ---- 1b. o VISUAL viaja: A vai no barbeiro, B ve na hora ----------------
  // Este e o pedido literal da wave 6: "tudo isso tem que modificar no online
  // tb". Nao basta o pacote chegar — o boneco de A na cena de B tem que ser
  // RECONSTRUIDO com a cara nova.
  const apNova = { cabeca: 5, olhos: 1, pupila: 3, nariz: 2, boca: 4, barba: 2, cabelo: 3, pele: 4 }
  await a.evaluate((ap) => { window.__game.setAppearance(ap) }, apNova)
  await espera(2000)

  const bVeCara = await b.evaluate((id) => {
    const j = window.__game.rede.jogadores.get(id)
    if (!j || !j.aparencia) return null
    const ap = j.aparencia
    return { cabeca: ap.cabeca, olhos: ap.olhos, pupila: ap.pupila, nariz: ap.nariz,
      boca: ap.boca, barba: ap.barba, cabelo: ap.cabelo, pele: ap.pele }
  }, idA)
  const bate = bVeCara && Object.keys(apNova).every((k) => bVeCara[k] === apNova[k])
  ok('B recebe a cara nova de A', !!bate, bVeCara ? JSON.stringify(bVeCara) : 'nao chegou')

  // e o boneco foi realmente refeito? o avatar guarda a ultima aparencia
  // desenhada; se ela nao acompanhou, a cara nova ficou so no pacote.
  const desenhou = await b.evaluate((id) => {
    // o boneco carrega no proprio no da cena a aparencia que foi DESENHADA
    let achou = null
    window.__game.scene.traverse((o) => {
      if (o.userData && o.userData.avatarId === id && o.userData.aparencia) achou = o.userData.aparencia
    })
    return achou ? { cabeca: achou.cabeca, cabelo: achou.cabelo, pele: achou.pele } : null
  }, idA)
  ok('o boneco de A e refeito com a cara nova',
    !!(desenhou && desenhou.cabeca === apNova.cabeca && desenhou.cabelo === apNova.cabelo),
    desenhou ? JSON.stringify(desenhou) : 'avatar sem aparencia registrada')

  // ---- 1c. roupa tambem viaja (o provador) --------------------------------
  await a.evaluate(() => { window.__game.setAppearance({ chapeu: 2, blusa: 3, calca: 1, colar: 4, jaqueta: 2 }) })
  await espera(2000)
  const bVeRoupa = await b.evaluate((id) => {
    const j = window.__game.rede.jogadores.get(id)
    if (!j || !j.aparencia) return null
    const ap = j.aparencia
    return { chapeu: ap.chapeu, blusa: ap.blusa, calca: ap.calca, colar: ap.colar, jaqueta: ap.jaqueta }
  }, idA)
  ok('B recebe a roupa nova de A',
    !!(bVeRoupa && bVeRoupa.chapeu === 2 && bVeRoupa.blusa === 3 && bVeRoupa.colar === 4),
    bVeRoupa ? JSON.stringify(bVeRoupa) : 'nao chegou')

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
    // Espera ATE CHEGAR, com prazo largo, em vez de dormir um tempo fixo.
    // O prazo fixo de 800 ms reprovava por lentidao e nao por defeito: aqui o
    // navegador desenha por software e um quadro sozinho pode segurar o laco
    // por meio segundo — a resposta ja tinha chegado no socket e o timeout
    // disparava antes de ela ser lida. Com o prazo largo, um NEGADO que nao
    // vem continua reprovando, que e o que o caso quer provar.
    const limite = performance.now() + 6000
    while (!visto && performance.now() < limite) {
      await new Promise((r) => setTimeout(r, 50))
    }
    window.__game.rede.aoEvento = antes
    return visto
  })
  ok('o segundo a pedir e recusado', !!negou, negou ? 'oque=' + negou.oque : 'nao veio NEGADO')

  // A sai do dialogo: o NPC volta a ficar livre
  await a.evaluate(() => window.__game.rede.sairDialogo())
  await espera(800)
  const livre = await b.evaluate(() => { const n = window.__game.rede.npcs.get(1000); return n ? n.falandoCom : -1 })
  ok('sair libera o NPC', livre === 0, 'falandoCom=' + livre)

  // ---- 3. AQUI MORAVAM A TELECINESE E O ZUMBI ---------------------------
  // Eram os dois maiores blocos deste arquivo: "o servidor decide quem pegou o
  // caixote" e "o rapaz vira zumbi UMA vez, para os dois". Os dois sistemas
  // sairam do jogo (o anel esta em backup/poder/anel.js; o zumbi foi apagado),
  // entao os casos sairam com eles.
  //
  // O que eles protegiam continua protegido por outros arquivos: a regra de
  // "um dono por objeto" pelo proprio servidor (os pacotes OBJ_* seguem
  // inteiros) e a de "o servidor e a verdade do mundo" pelos casos de dialogo
  // logo acima, que testam exatamente a mesma coisa com o barbeiro.

  // ---- 4. sair libera tudo na hora --------------------------------------
  await a.close()
  await espera(3500)
  const depois = await b.evaluate(() => {
    const R = window.__game.rede
    const av = []
    window.__game.scene.traverse((n) => {
      if (n.userData && n.userData.avatarId) av.push(n.userData.avatarId)
    })
    return {
      jogadores: R.jogadores.size,
      ids: [...R.jogadores.keys()],
      meuId: R.meuId,
      avatares: av,
    }
  })
  ok('sair tira o jogador da sala', depois.jogadores === 0,
    'restam ' + depois.jogadores + ' ids=[' + depois.ids.join(',') + '] eu=' + depois.meuId
    + ' avatares=[' + depois.avatares.join(',') + ']')

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
