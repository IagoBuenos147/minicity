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
import { ZUMBI_ID } from '../src/comum/mundo.js'
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

  // ---- 0. o pacote do tiro no zumbi, ida e volta -------------------------
  // Barato e vale a pena antes de subir navegador nenhum: se o unico pacote
  // novo estiver torto, todo o resto do teste do zumbi falharia por um motivo
  // que nao tem nada a ver com rede.
  {
    const b = Proto.escreverZumbiTiro(ZUMBI_ID, Proto.PARTE_CABECA)
    const m = Proto.lerZumbiTiro(new DataView(b))
    ok('ZUMBI_TIRO ida e volta',
      b.byteLength === 4 && m && m.npcId === ZUMBI_ID && m.parte === Proto.PARTE_CABECA,
      b.byteLength + ' bytes, npc ' + (m && m.npcId) + ', parte ' + (m && m.parte))
  }
  ok('ZUMBI_TIRO e confiavel e nao leva vida nenhuma',
    Proto.ehConfiavel(Proto.P.ZUMBI_TIRO) === true
    && Proto.escreverZumbiTiro(ZUMBI_ID, Proto.PARTE_CORPO).byteLength === 4,
    'tipo ' + Proto.P.ZUMBI_TIRO + ', 4 bytes (id + parte, e so)')
  // Os estados do zumbi entraram no enum de NPC que o snapshot JA tinha: e
  // isso que faz o bicho inteiro custar zero byte a mais por quadro.
  ok('os estados do zumbi sao valores do EST_NPC de sempre',
    Proto.EST_NPC.SAO === 5 && Proto.EST_NPC.ADOECENDO === 6
    && Proto.EST_NPC.ZUMBI === 7 && Proto.EST_NPC.MORTO === 8
    && Proto.EST_NPC.SUMIDO === 9,
    'sao/adoecendo/zumbi/morto/sumido = 5..9')

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

  // ---- 3. telecinese: o servidor decide quem pegou ----------------------
  const objId = 2000
  const r1 = await a.evaluate(async (id) => {
    let dono = null
    const antes = window.__game.rede.aoEvento
    window.__game.rede.aoEvento = (ev) => { if (ev.tipo === 'obj-dono' && ev.objId === id) dono = ev.donoId; if (antes) antes(ev) }
    window.__game.rede.pegar(id)
    // mesma razao do caso do NEGADO acima: espera CHEGAR, com prazo largo,
    // em vez de dormir um tempo fixo que o render por software estoura
    const limite = performance.now() + 6000
    while (dono === null && performance.now() < limite) {
      await new Promise((r) => setTimeout(r, 50))
    }
    window.__game.rede.aoEvento = antes
    return dono
  }, objId)
  ok('A pega o objeto', r1 === idA, 'dono=' + r1)

  const r2 = await b.evaluate(async (id) => {
    let neg = null
    const antes = window.__game.rede.aoEvento
    window.__game.rede.aoEvento = (ev) => { if (ev.tipo === 'negado') neg = ev; if (antes) antes(ev) }
    window.__game.rede.pegar(id)
    // mesma razao do caso do NEGADO acima: espera CHEGAR, com prazo largo,
    // em vez de dormir um tempo fixo que o render por software estoura
    const limite = performance.now() + 6000
    while (!neg && performance.now() < limite) {
      await new Promise((r) => setTimeout(r, 50))
    }
    window.__game.rede.aoEvento = antes
    return neg
  }, objId)
  ok('B nao rouba o objeto de A', !!r2, r2 ? 'negado oque=' + r2.oque : 'nao veio NEGADO')

  // ---- 3b. O RAPAZ QUE VIRA ZUMBI: UM SO, PARA OS DOIS -------------------
  //
  // Este e o caso que prova o conserto. Antes dele, o NPC decidia tudo no
  // cliente e cada jogador tinha o seu zumbi particular: A falava com o rapaz,
  // via ele adoecer, virar bicho e vir pra cima — e B continuava vendo um
  // rapaz sadio parado na porta da mercearia. Nao havia bug no console, nao
  // havia pacote perdido; simplesmente nao existia pacote nenhum.
  //
  // O que se confere aqui, em ordem: o mesmo ESTADO nas duas telas, a mesma
  // POSICAO enquanto ele persegue, e a morte decidida pelo SERVIDOR aparecendo
  // na tela de quem NAO atirou.
  {
    const CASA_Z = { x: -23.6, z: -10.7 }   // a calcada da porta da mercearia
    await a.evaluate((p) => window.__game.player.teleport(p.x, p.z + 2.6, 0), CASA_Z)
    await b.evaluate((p) => window.__game.player.teleport(p.x - 3.4, p.z + 2.6, 0), CASA_Z)
    await espera(2000)

    const antes = await Promise.all([
      a.evaluate((id) => { const n = window.__game.rede.npcs.get(id); return n ? n.estado : -1 }, ZUMBI_ID),
      b.evaluate((id) => { const n = window.__game.rede.npcs.get(id); return n ? n.estado : -1 }, ZUMBI_ID),
    ])
    ok('o rapaz e um NPC de verdade, e comeca SAO nas duas telas',
      antes[0] === Proto.EST_NPC.SAO && antes[1] === Proto.EST_NPC.SAO,
      'A=' + antes[0] + ' B=' + antes[1])

    // A fala com ele pelo caminho do jogo (o "E" da interacao), nao por um
    // atalho de teste: e esse aperto de E que vira o pedido FALAR no NPC 1004.
    await a.evaluate(() => {
      const G = window.__game
      G.interaction.items.find((i) => i.id === 'zumbi-npc').onInteract(G)
    })
    await espera(1500)

    const doente = await Promise.all([
      a.evaluate((id) => { const n = window.__game.rede.npcs.get(id); return n ? n.estado : -1 }, ZUMBI_ID),
      b.evaluate((id) => { const n = window.__game.rede.npcs.get(id); return n ? n.estado : -1 }, ZUMBI_ID),
    ])
    ok('A fala com ele e os DOIS veem a doenca comecar',
      doente[0] === Proto.EST_NPC.ADOECENDO && doente[1] === Proto.EST_NPC.ADOECENDO,
      'A=' + doente[0] + ' B=' + doente[1] + ' (esperado ' + Proto.EST_NPC.ADOECENDO + ')')

    // 10 s de doenca + o grito. QUEM CONTA E O SERVIDOR: nao ha nada pra
    // adiantar aqui, e e esse o ponto — os dois navegadores veem a virada no
    // mesmo instante porque nenhum dos dois tem cronometro proprio.
    await espera(13000)

    /* Espera a pagina DESENHAR alguns quadros antes de ler.
       Sem isto a medida vira uma loteria: e o laco de quadro que chama
       rede.atualizar(), entao uma pagina que travou por meio segundo continua
       devolvendo a posicao de meio segundo atras, e a conta acusa a REDE por
       uma lentidao que e do render por software do headless. Com os dois
       navegadores recem-desenhados, o que sobra e o atraso da interpolacao,
       que e o que estes casos querem medir. */
    const quadros = (pg, n) => pg.evaluate((n) => new Promise((res) => {
      let i = 0
      const t0 = performance.now()
      const f = () => {
        if (++i >= n || performance.now() - t0 > 8000) return res(i)
        requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    }), n)
    const frescos = () => Promise.all([quadros(a, 2), quadros(b, 2)])

    const lerNpc = (pg) => pg.evaluate((id) => {
      const n = window.__game.rede.npcs.get(id)
      return {
        estado: n ? n.estado : -1,
        x: n ? +n.x.toFixed(3) : 0,
        z: n ? +n.z.toFixed(3) : 0,
        local: window.__game.zumbi.estado,
      }
    }, ZUMBI_ID)

    await frescos()
    const [vA, vB] = await Promise.all([lerNpc(a), lerNpc(b)])
    ok('os DOIS veem o rapaz virar zumbi (mesmo estado no NPC 1004)',
      vA.estado === Proto.EST_NPC.ZUMBI && vB.estado === Proto.EST_NPC.ZUMBI,
      'A=' + vA.estado + ' B=' + vB.estado)
    // O boneco desenhado tem que ter seguido o snapshot: nao basta o pacote
    // chegar, o modulo de render precisa ter trocado de estado por causa dele.
    ok('o boneco desenhado seguiu o estado do servidor nas duas telas',
      vA.local === 'zumbi' && vB.local === 'zumbi', 'A=' + vA.local + ' B=' + vB.local)

    /* MESMA POSICAO, E COM ELE ANDANDO. Os dois correm pra longe: parado, o
       zumbi estaria no mesmo lugar nas duas telas ate no codigo antigo (nasce
       na mesma constante). O que so a rede resolve e ele ANDAR igual — e por
       isso a medida e tirada no meio da travessia.
       As duas leituras saem JUNTAS (Promise.all): a 4,5 m/s, ler uma depois
       da outra mediria o tempo entre as duas chamadas, nao a diferenca entre
       as telas. */
    await Promise.all([
      a.evaluate(() => window.__game.player.teleport(-23.6, 12, 0)),
      b.evaluate(() => window.__game.player.teleport(-27.4, 12, 0)),
    ])
    await espera(3000)
    await frescos()
    const [pA, pB] = await Promise.all([lerNpc(a), lerNpc(b)])
    const dist = Math.hypot(pA.x - pB.x, pA.z - pB.z)
    const andou = Math.hypot(pA.x - vA.x, pA.z - vA.z)
    // 3 s a 4,5 m/s sao mais de 13 m de caminhada; pedir 2 deixa folga de sobra
    // pra qualquer engasgo do headless sem deixar de provar que ele anda
    ok('o zumbi persegue (o servidor e quem move o corpo dele)',
      andou > 2, 'andou ' + andou.toFixed(2) + ' m em 3 s')

    /* A DIFERENCA E MEDIDA EM TEMPO, nao em metros, e o motivo e que metro
       aqui nao quer dizer nada sozinho: com um bicho a 4,5 m/s, meio segundo
       de atraso de video ja vale mais de dois metros, e um bicho parado
       ficaria a zero metro mesmo com o codigo antigo, que nao tinha rede
       nenhuma. O que interessa e se as duas telas estao mostrando o MESMO
       instante do MESMO bicho.
       O limite e generoso de proposito: os dois desenham 100 ms atras, mas
       cada um com o seu relogio, e aqui eles rodam em headless com render por
       SOFTWARE — o quadro deles e a maior parte deste numero, nao a rede. O
       bug que este caso existe pra pegar dava DEZENAS de metros, ou um zumbi
       que nem existia na outra tela. */
    const atraso = dist / 4.5      // MUNDO.ZUMBI_VEL: metros viram segundos
    ok('os DOIS veem o zumbi ANDANDO no mesmo lugar (tolerancia da interpolacao)',
      atraso < 0.9, dist.toFixed(2) + ' m = ' + atraso.toFixed(2) + ' s entre as telas'
      + '  (A ' + pA.x + ',' + pA.z + '  B ' + pB.x + ',' + pB.z + ')')
    // e os DOIS o viram sair de casa: se um deles ainda o visse na porta da
    // mercearia, a diferenca acima seria pequena e mentirosa
    const saiuA = Math.hypot(pA.x - CASA_Z.x, pA.z - CASA_Z.z)
    const saiuB = Math.hypot(pB.x - CASA_Z.x, pB.z - CASA_Z.z)
    ok('nas DUAS telas ele saiu da porta da mercearia',
      saiuA > 3 && saiuB > 3,
      'A ' + saiuA.toFixed(1) + ' m da casa, B ' + saiuB.toFixed(1) + ' m')

    /* ---- ele nao atravessa parede, e entra pela porta ---------------------
       A vitima se tranca no fundo da mercearia, longe da porta, e o outro
       jogador vai pro outro lado da cidade — assim quem o zumbi persegue e
       quem esta dentro da loja, e quem AMOSTRA o caminho e quem esta longe
       (se ate a tela do vizinho ve o caminho certo, o caminho e do servidor).

       As amostras sao colhidas DENTRO da pagina, num laco de quadro, e nao por
       chamadas de fora: a 4,5 m/s, uma ida e volta de CDP entre uma amostra e
       a outra deixaria buracos de metros no caminho, e um zumbi que atravessa
       uma parede de 30 cm passaria por dentro de um deles sem aparecer. */
    await Promise.all([
      a.evaluate(() => window.__game.player.teleport(-33, -28, 0)),   // fundo da mercearia
      b.evaluate(() => window.__game.player.teleport(30, 30, 0)),     // do outro lado da cidade
    ])
    await espera(1500)
    const caminho = await b.evaluate((id) => new Promise((res) => {
      const pontos = []
      const t0 = performance.now()
      const f = () => {
        const n = window.__game.rede.npcs.get(id)
        if (n) pontos.push([+n.x.toFixed(3), +n.z.toFixed(3)])
        if (performance.now() - t0 > 9000) return res(pontos)
        requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    }), ZUMBI_ID)

    /* Os retangulos de parede da mercearia, montados aqui do MESMO layout.js
       que o servidor le. Se um dia alguem mexer no lote da loja, este teste
       acompanha sozinho — nenhum numero de parede escrito na mao. */
    const dl = GROCERY.door.center - GROCERY.door.width / 2
    const dr = GROCERY.door.center + GROCERY.door.width / 2
    const tijolos = [
      ['oeste', GROCERY.x0, GROCERY.x0 + WALL_T, GROCERY.z0, GROCERY.z1],
      ['leste', GROCERY.x1 - WALL_T, GROCERY.x1, GROCERY.z0, GROCERY.z1],
      ['fundos', GROCERY.x0, GROCERY.x1, GROCERY.z0, GROCERY.z0 + WALL_T],
      ['fachada-oeste', GROCERY.x0, dl, GROCERY.z1 - WALL_T, GROCERY.z1],
      ['fachada-leste', dr, GROCERY.x1, GROCERY.z1 - WALL_T, GROCERY.z1],
    ]
    /* O teste e no TRECHO entre duas amostras, e nao no ponto: em headless o
       jogo roda a uns 2 quadros por segundo, entao ha metros entre uma amostra
       e a seguinte e um zumbi que atravessasse uma parede de 30 cm passaria
       inteiro por dentro do buraco, sem nenhuma amostra cair no tijolo. Testar
       o segmento nao depende da taxa de quadros nenhuma. */
    const MARGEM = 0.15   // o ponto vem interpolado: um trecho pode cortar canto
    const cruzaCaixa = (ax, az, bx, bz, x0, x1, z0, z1) => {
      // Liang-Barsky: sobra algum pedaco do segmento dentro da caixa?
      let t0 = 0, t1 = 1
      const dx = bx - ax, dz = bz - az
      const lados = [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]
      for (const [p, q] of lados) {
        if (p === 0) { if (q < 0) return false; continue }
        const r = q / p
        if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r }
        else { if (r < t0) return false; if (r < t1) t1 = r }
      }
      return true
    }
    let noTijolo = null
    for (let i = 1; i < caminho.length && !noTijolo; i++) {
      const [ax, az] = caminho[i - 1]
      const [bx, bz] = caminho[i]
      for (const [nome, x0, x1, z0, z1] of tijolos) {
        /* A folga entra so no eixo LONGO da parede. No eixo da espessura ela
           nao entra: a parede tem 30 cm e encolher 15 de cada lado apagaria o
           tijolo inteiro — o teste passaria sempre, inclusive com o zumbi
           atravessando. Assim, para acusar, o trecho tem que cruzar os 30 cm
           inteiros, que e exatamente o que "atravessou a parede" quer dizer. */
        const mx = (x1 - x0) > MARGEM * 2 ? MARGEM : 0
        const mz = (z1 - z0) > MARGEM * 2 ? MARGEM : 0
        if (cruzaCaixa(ax, az, bx, bz, x0 + mx, x1 - mx, z0 + mz, z1 - mz)) {
          noTijolo = nome + ' no trecho ' + ax + ',' + az + ' -> ' + bx + ',' + bz
          break
        }
      }
    }
    ok('o caminho do zumbi nunca passa DENTRO de uma parede da mercearia',
      caminho.length > 8 && !noTijolo,
      noTijolo ? ('atravessou o ' + noTijolo)
        : (caminho.length + ' amostras, ' + (caminho.length - 1) + ' trechos, nenhum no tijolo'))

    // ...e ele entrou mesmo: se nunca entra, o vao ficou estreito demais e o
    // caso de cima passaria por um motivo errado (ele so nao chegou perto).
    const dentro = caminho.filter(([x, z]) => x > GROCERY.x0 + WALL_T && x < GROCERY.x1 - WALL_T
      && z > GROCERY.z0 + WALL_T && z < GROCERY.z1 - WALL_T)
    ok('o zumbi ENTRA na mercearia atras de quem se escondeu',
      dentro.length > 0,
      dentro.length + ' amostras dentro da loja' + (dentro.length
        ? ' (primeira em ' + dentro[0][0] + ',' + dentro[0][1] + ')' : ''))

    /* E entrou PELA PORTA. Este e o caso forte: nao depende de o amostrador ter
       pegado o instante em que ele estaria no meio do tijolo. Toda vez que o
       caminho cruza a linha da fachada, o x daquele cruzamento tem que cair no
       vao — atravessar a parede deixaria um cruzamento longe dele. */
    let cruzouForaDaPorta = null
    for (let i = 1; i < caminho.length; i++) {
      const [x0, z0] = caminho[i - 1]
      const [x1, z1] = caminho[i]
      if ((z0 > GROCERY.z1) === (z1 > GROCERY.z1)) continue
      const t = (GROCERY.z1 - z0) / (z1 - z0)
      const xc = x0 + (x1 - x0) * t
      // 0,1 m de folga: o ponto vem interpolado entre dois tiques do servidor
      if (xc < dl - 0.1 || xc > dr + 0.1) { cruzouForaDaPorta = xc.toFixed(2); break }
    }
    ok('toda travessia da fachada foi pelo vao da porta',
      !cruzouForaDaPorta,
      cruzouForaDaPorta ? ('cruzou em x=' + cruzouForaDaPorta + ', porta em '
        + dl.toFixed(1) + '..' + dr.toFixed(1)) : 'vao ' + dl.toFixed(1) + '..' + dr.toFixed(1))

    // A volta pro combate: A precisa estar perto pro tiro valer o alcance do
    // servidor, e ele ja esta — o zumbi foi atras dele pra dentro da loja.

    /* QUEM CONTA A VIDA E O SERVIDOR. Um tiro no corpo nao mata: se o cliente
       mandasse "morreu" (ou a vida resultante), este caso passaria errado. */
    await a.evaluate(() => window.__game.zumbi.levarTiro('corpo', {}))
    await espera(1200)
    const umTiro = await b.evaluate((id) => {
      const n = window.__game.rede.npcs.get(id); return n ? n.estado : -1
    }, ZUMBI_ID)
    ok('1 tiro no corpo NAO mata (a conta e do servidor)',
      umTiro === Proto.EST_NPC.ZUMBI, 'estado em B = ' + umTiro)

    // ...e o tiro na cabeca mata, na tela de quem NAO atirou tambem.
    await a.evaluate(() => window.__game.zumbi.levarTiro('cabeca', {}))
    await espera(1500)
    const [mA, mB] = await Promise.all([
      a.evaluate((id) => {
        const n = window.__game.rede.npcs.get(id)
        return { estado: n ? n.estado : -1, local: window.__game.zumbi.estado }
      }, ZUMBI_ID),
      b.evaluate((id) => {
        const n = window.__game.rede.npcs.get(id)
        return { estado: n ? n.estado : -1, local: window.__game.zumbi.estado }
      }, ZUMBI_ID),
    ])
    ok('o tiro de A na cabeca mata o zumbi na tela de B tambem',
      mB.estado === Proto.EST_NPC.MORTO && mB.local === 'morto',
      'B: NPC=' + mB.estado + ' boneco=' + mB.local + ' | A: NPC=' + mA.estado
      + ' boneco=' + mA.local)
  }

  // ---- 4. sair libera tudo na hora --------------------------------------
  await a.close()
  await espera(3500)
  const depois = await b.evaluate((id) => {
    const o = window.__game.rede.objetos.get(id)
    const R = window.__game.rede
    const av = []
    window.__game.scene.traverse((n) => {
      if (n.userData && n.userData.avatarId) av.push(n.userData.avatarId)
    })
    return {
      dono: o ? o.dono : -1,
      jogadores: R.jogadores.size,
      ids: [...R.jogadores.keys()],
      meuId: R.meuId,
      avatares: av,
    }
  }, objId)
  ok('sair solta o objeto que ele segurava', depois.dono === 0, 'dono=' + depois.dono)
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
