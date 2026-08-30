// O CORTICO 117: os tres andares, a escada, a colisao por andar e a batida.
//
//   node tools/teste-cortico.mjs
//
// O QUE ESTE TESTE PROTEGE, e por que cada caso existe:
//
//   1. ANDAR E COISA NOVA NESTE JOGO. Ate o cortico, a altura do chao era uma
//      funcao (x, z) -> y: uma cota por metro quadrado. O predio quebrou isso e
//      a peca que resolveu (src/systems/pisos.js) e invisivel — nao da pra ver
//      numa foto se a laje do segundo andar esta registrada. Da pra MEDIR: em
//      cima do corredor tem que haver TRES cotas empilhadas, e o amostrador tem
//      que devolver a certa pra cada altura de jogador.
//
//   2. A ESCADA TEM QUE SER SUBIVEL ANDANDO. Ela e rampa pro pe e degrau pro
//      olho; se alguem trocar a rampa por degraus de verdade, o controller
//      cancela o avanco (ele barra tudo que sobe mais que 45 cm num quadro) e a
//      escada vira parede. O teste sobe os dois lances de cada andar apertando
//      W, como o jogador faz.
//
//   3. A COLISAO E POR ANDAR. A grade de colisao e XZ sem altura: a parede do
//      2o andar empurra quem esta no terreo. O predio liga so o conjunto do
//      andar em que o jogador esta, e isso e uma engrenagem que quebra em
//      silencio — o sintoma seria "tem parede invisivel no corredor".
//
//   4. A BATIDA. Bater -> 2 s -> o morador vem, abre, fala, sai da frente e
//      volta pro sofa. E uma maquina de estados com seis fases; o caso mede as
//      duas pontas (a porta abriu, ele voltou a sentar) e o meio (a fala saiu).
//
// Em headless o requestAnimationFrame nao dispara: tudo que precisa de tempo e
// avancado na mao, quadro a quadro, com o passo do jogo.

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

const PORT = 9811 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cortico-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--mute-audio',
  '--window-size=960,600', 'about:blank',
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

const casos = []
function ok(nome, passou, detalhe) {
  casos.push(passou)
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 240000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 960, height: 600 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })

  async function entrarNoJogo() {
    await page.waitForFunction('window.__game && window.__game.fluxo', { timeout: 90000 })
    await page.evaluate('window.__game.fluxo.jogar()')
    await new Promise((r) => setTimeout(r, 1500))
  }
  await entrarNoJogo()

  /** page.evaluate com uma repescagem (ver o mesmo helper em teste-adega.mjs). */
  async function ev(fn, ...args) {
    try {
      // Espera o jogo EXISTIR antes de cada medida. Nao e paranoia: com tres
      // abas editando o mesmo repositorio, o vite recarrega a pagina no meio do
      // teste e a janela fica alguns segundos sem `window.__game` — o contexto
      // e valido, so esta vazio, e por isso o catch de baixo nao pega esse caso.
      await page.waitForFunction('!!(window.__game && window.__game.fluxo)', { timeout: 60000 })
      if (!(await page.evaluate('window.__game.fluxo.estado === "jogo"'))) await entrarNoJogo()
      return await page.evaluate(fn, ...args)
    } catch (err) {
      if (!/context was destroyed|Target closed|detached/i.test(String(err))) throw err
      console.log('   (a pagina recarregou no meio; refazendo)')
      await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await entrarNoJogo()
      return page.evaluate(fn, ...args)
    }
  }

  // --- 0. o predio esta na cena --------------------------------------------
  const base = await ev(() => {
    const G = window.__game
    const c = G.cortico
    return {
      existe: !!c,
      andares: c ? c.andares.length : 0,
      aptos: c ? c.aptos.length : 0,
      moradores: c ? c.moradores.length : 0,
      lajes: G.pisos ? G.pisos.quantas : 0,
      inter: G.interaction.items.map((i) => i.id).filter((i) => i.indexOf('cortico') === 0),
      legenda: !!G.legenda,
    }
  })
  ok('o cortico esta na cena', base.existe)
  ok('ele tem tres andares', base.andares === 3, String(base.andares))
  ok('e dois apartamentos que abrem', base.aptos === 2, String(base.aptos))
  ok('com um morador em cada', base.moradores === 2, String(base.moradores))
  ok('as duas portas tem ponto de interacao',
    base.inter.indexOf('cortico-porta-a') >= 0 && base.inter.indexOf('cortico-porta-b') >= 0,
    base.inter.join(','))
  ok('a legenda do rodape existe', base.legenda)

  // --- 1. O CHAO DE VARIOS ANDARES -----------------------------------------
  const chao = await ev(() => {
    const G = window.__game
    const P = G.pisos
    // no meio do corredor: tres cotas empilhadas, uma por andar
    const cotas = P.cotasEm(37.0, -41.9)
    // e o amostrador tem que escolher pela altura do jogador
    const em = (y) => +P.altura(37.0, -41.9, y).toFixed(3)
    // fora do predio o chao continua sendo o da cidade
    const naRua = +P.altura(20, 0, 0).toFixed(3)
    const naCalcada = +P.altura(39.5, -50, 0.16).toFixed(3)
    return { cotas, t0: em(0.16), t1: em(3.16), t2: em(6.16), naRua, naCalcada }
  })
  ok('o corredor tem TRES cotas empilhadas', chao.cotas.length === 3, chao.cotas.join(' / '))
  ok('quem esta no terreo pisa no terreo', Math.abs(chao.t0 - 0.16) < 0.02, 'y=' + chao.t0)
  ok('quem esta no 1o pisa no 1o', Math.abs(chao.t1 - 3.16) < 0.02, 'y=' + chao.t1)
  ok('quem esta no 2o pisa no 2o', Math.abs(chao.t2 - 6.16) < 0.02, 'y=' + chao.t2)
  ok('fora do predio vale o chao da cidade', chao.naRua === 0 && chao.naCalcada === 0.16,
    'rua=' + chao.naRua + ' calcada=' + chao.naCalcada)

  // --- 2. DA RUA ATE O 2o ANDAR, ANDANDO -----------------------------------
  const subida = await ev(() => {
    const G = window.__game
    const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
    const perna = (x, z, yaw, n) => {
      G.player.teleport(x, z, yaw)
      for (let i = 0; i < 24; i++) G.player.update(1 / 60)
      tecla('KeyW', 'keydown')
      for (let i = 0; i < n; i++) {
        G.player.update(1 / 60)
        G.cortico.update(1 / 60, G)
      }
      tecla('KeyW', 'keyup')
      for (let i = 0; i < 14; i++) G.player.update(1 / 60)
      return {
        x: +G.player.position.x.toFixed(2),
        y: +G.player.position.y.toFixed(2),
        z: +G.player.position.z.toFixed(2),
        andar: G.cortico.andarAtual,
      }
    }
    // yaw 0 = camera olhando pro -Z; yaw PI = pro +Z.
    // 1) da calcada do anel pra dentro do saguao
    const entrou = perna(39.5, -49.6, Math.PI, 170)
    // 2) do corredor pro primeiro lance (norte, lado oeste da caixa)
    const lance1 = perna(42.5, -41.4, 0, 220)
    // 3) do patamar pro 1o andar (sul, lado leste)
    const lance2 = perna(43.9, -46.5, Math.PI, 220)
    // 4) e de novo, do 1o pro 2o
    const lance3 = perna(42.5, -42.4, 0, 220)
    const lance4 = perna(43.9, -46.5, Math.PI, 220)
    return { entrou, lance1, lance2, lance3, lance4 }
  })
  // ele atravessa o saguao inteiro e so para na parede SUL do corredor
  // (-40.8): entrar quer dizer passar de -47.7, e chegar no corredor quer dizer
  // passar de -43.0.
  ok('da rua da pra entrar e chegar no corredor',
    subida.entrou.z > -43.0 && subida.entrou.z < -40.8,
    'parou em z=' + subida.entrou.z)
  ok('o primeiro lance sobe meio andar', subida.lance1.y > 1.4 && subida.lance1.y < 1.9,
    'y=' + subida.lance1.y + ' z=' + subida.lance1.z)
  ok('o segundo lance chega no 1o andar', Math.abs(subida.lance2.y - 3.16) < 0.25,
    'y=' + subida.lance2.y + ' andar=' + subida.lance2.andar)
  ok('e do 1o da pra subir pro patamar de cima', subida.lance3.y > 4.4 && subida.lance3.y < 4.9,
    'y=' + subida.lance3.y)
  ok('chegando no 2o andar', Math.abs(subida.lance4.y - 6.16) < 0.25,
    'y=' + subida.lance4.y + ' andar=' + subida.lance4.andar)

  // --- 3. A COLISAO TROCA COM O ANDAR --------------------------------------
  const colisao = await ev(() => {
    const G = window.__game
    const conta = () => {
      let liga = 0, total = 0
      // a grade nao expoe as caixas; o predio expoe o andar que ele ligou
      total = G.collision.count
      liga = G.cortico.andarAtual
      return { total, liga }
    }
    // POR NUM ANDAR: a ordem e y PRIMEIRO, teleport DEPOIS.
    //
    // `teleport(x, z, yaw)` amostra o chao no ponto novo, e o amostrador de
    // andares le a altura atual do jogador pra decidir QUAL laje vale. Fazendo
    // o contrario (teleport e depois escrever position.y), o controller ja
    // travou floorY no terreo e o quadro seguinte trata os 3 m de diferenca
    // como "saiu de uma borda alta" — o jogador despenca.
    const pondo = (x, z, yaw, y) => {
      G.player.position.y = y
      G.player.teleport(x, z, yaw)
      for (let i = 0; i < 20; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
    }
    pondo(37.0, -41.9, 0, 0.16)
    const a0 = conta().liga
    pondo(37.0, -41.9, 0, 3.16)
    const a1 = G.cortico.andarAtual
    pondo(37.0, -41.9, 0, 6.16)
    const a2 = G.cortico.andarAtual
    // fora do predio volta pro terreo
    G.player.teleport(0, 0, 0)
    for (let i = 0; i < 20; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
    const fora = G.cortico.andarAtual
    return { a0, a1, a2, fora }
  })
  ok('no terreo o predio liga o andar 0', colisao.a0 === 0, String(colisao.a0))
  ok('no 1o andar ele liga o andar 1', colisao.a1 === 1, String(colisao.a1))
  ok('no 2o andar ele liga o andar 2', colisao.a2 === 2, String(colisao.a2))
  ok('fora do predio ele volta pro andar 0', colisao.fora === 0, String(colisao.fora))

  // --- 4. A BATIDA E O MORADOR ---------------------------------------------
  const batida = await ev(() => {
    const G = window.__game
    const c = G.cortico
    const mor = c.moradores[0]
    const ap = mor.ap
    const passo = (n) => { for (let i = 0; i < n; i++) c.update(1 / 60, G) }
    // o jogador no corredor, na frente da porta do apartamento do 1o andar
    // (y antes do teleport: ver o comentario no caso da colisao)
    G.player.position.y = 3.16
    G.player.teleport(ap.spec.portaX, -41.9, Math.PI)
    for (let i = 0; i < 20; i++) { G.player.update(1 / 60); c.update(1 / 60, G) }
    const antes = { fase: mor.mor.estado.fase, aberta: mor.mor.estado.aberta }

    c.bater('a')
    passo(30)                         // 0,5 s: ele ainda nao se mexeu
    const logoApos = mor.mor.estado.fase
    passo(120)                        // 2,5 s: ja veio, abriu e esta falando
    const falando = { fase: mor.mor.estado.fase, legenda: G.legenda.texto, porta: +mor.mor.estado.porta.toFixed(2) }
    passo(320)                        // + 5,3 s: ja voltou e sentou
    const fim = {
      fase: mor.mor.estado.fase,
      aberta: mor.mor.estado.aberta,
      pose: mor.mor.npc.pose,
      dx: +Math.abs(mor.mor.npc.root.position.x - ap.assento.x).toFixed(2),
      dz: +Math.abs(mor.mor.npc.root.position.z - ap.assento.z).toFixed(2),
    }
    // e agora da pra entrar: anda pra dentro do apartamento
    const tecla = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'KeyW', bubbles: true }))
    G.player.position.y = 3.16
    G.player.teleport(ap.spec.portaX, -41.6, Math.PI)
    for (let i = 0; i < 20; i++) { G.player.update(1 / 60); c.update(1 / 60, G) }
    tecla('keydown')
    for (let i = 0; i < 150; i++) { G.player.update(1 / 60); c.update(1 / 60, G) }
    tecla('keyup')
    for (let i = 0; i < 12; i++) G.player.update(1 / 60)
    const entrou = { z: +G.player.position.z.toFixed(2), y: +G.player.position.y.toFixed(2) }
    return { antes, logoApos, falando, fim, entrou }
  })
  ok('o morador comeca sentado', batida.antes.fase === 'sentado' && !batida.antes.aberta,
    batida.antes.fase)
  ok('meio segundo depois da batida ele ainda nao veio', batida.logoApos === 'batendo',
    batida.logoApos)
  ok('em 2,5 s ele veio e esta falando', batida.falando.fase === 'falando',
    batida.falando.fase + ' porta=' + batida.falando.porta)
  ok('a fala saiu na legenda do rodape', /tudo bem|Entra/i.test(batida.falando.legenda || ''),
    '"' + batida.falando.legenda + '"')
  ok('a porta ficou aberta', batida.fim.aberta === true)
  ok('e ele voltou a sentar no sofa',
    batida.fim.fase === 'sentado' && batida.fim.pose === 'sit'
    && batida.fim.dx < 0.15 && batida.fim.dz < 0.15,
    batida.fim.fase + '/' + batida.fim.pose + ' folga=' + batida.fim.dx + ',' + batida.fim.dz)
  ok('e da pra entrar no apartamento', batida.entrou.z > -39.5,
    'z=' + batida.entrou.z + ' y=' + batida.entrou.y)

  // --- 5. o quarto de tras existe e da pra chegar nele ----------------------
  const quarto = await ev(() => {
    const G = window.__game
    const ap = G.cortico.aptos[0]
    const tecla = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'KeyW', bubbles: true }))
    // do meio da sala pro quarto, atravessando o vao da divisoria
    const vao = ap.spec.id === 'a' ? ap.spec.x1 - 1.2 : ap.spec.x0 + 1.2
    G.player.position.y = 3.16
    G.player.teleport(vao, ap.spec.divisao + 1.4, Math.PI)
    for (let i = 0; i < 20; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
    tecla('keydown')
    for (let i = 0; i < 170; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
    tecla('keyup')
    for (let i = 0; i < 12; i++) G.player.update(1 / 60)
    return { z: +G.player.position.z.toFixed(2), y: +G.player.position.y.toFixed(2), alvo: ap.spec.divisao }
  })
  ok('da sala da pra passar pro quarto', quarto.z > quarto.alvo + 0.6,
    'parou em z=' + quarto.z + ' (divisoria em ' + quarto.alvo + ')')
  ok('sem cair de andar no caminho', Math.abs(quarto.y - 3.16) < 0.2, 'y=' + quarto.y)

  // --- 6. fotos -------------------------------------------------------------
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', 'shots')
  fs.mkdirSync(dir, { recursive: true })
  const TOMADAS = [
    ['cortico-01-fachada', 39.5, -58.5, Math.PI, 0.14, 0.16],
    ['cortico-02-saguao', 39.5, -46.4, Math.PI, 0.0, 0.16],
    ['cortico-03-corredor', 33.4, -41.9, -Math.PI / 2, 0.0, 0.16],
    ['cortico-04-escada', 42.5, -42.4, 0, 0.16, 0.16],
    ['cortico-05-corredor-1', 45.4, -41.9, Math.PI / 2, 0.0, 3.16],
    ['cortico-06-porta-12', 36.9, -41.6, Math.PI, 0.0, 3.16],
    ['cortico-07-sala', 36.5, -40.2, 2.08, -0.06, 3.16],
    ['cortico-08-mesa', 35.7, -39.3, 1.85, -0.34, 3.16],
    ['cortico-09-quarto', 36.4, -35.4, Math.PI / 2, -0.06, 3.16],
    ['cortico-10-corredor-2', 40.0, -41.9, Math.PI / 2, 0.0, 6.16],
    ['cortico-11-sala-b', 41.6, -40.2, -2.20, -0.06, 6.16],
  ]
  for (const [nome, x, z, yaw, pitch, y] of TOMADAS) {
    try {
      await ev((x, z, yaw, pitch, y) => {
        const G = window.__game
        G.fluxo.foto(true)
        // y ANTES do teleport (ver o comentario no caso da colisao)
        G.player.position.y = y
        G.player.teleport(x, z, yaw)
        for (let i = 0; i < 30; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
        G.player.pitch = pitch
        for (let i = 0; i < 10; i++) { G.player.update(1 / 60); G.cortico.update(1 / 60, G) }
        G.player.pitch = pitch
        for (let i = 0; i < 8; i++) { G.engine.render(); G.cortico.update(1 / 60, G) }
      }, x, z, yaw, pitch, y)
      await new Promise((r) => setTimeout(r, 350))
      await page.screenshot({ path: path.join(dir, nome + '.png') })
    } catch (err) {
      console.log('   (a foto ' + nome + ' nao saiu: ' + String(err).slice(0, 60) + ')')
    }
  }
  console.log('fotos em shots/cortico-*.png')

  if (erros.length) ok('sem erro no console', false, erros.slice(0, 3).join(' | '))
  else ok('sem erro no console', true)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}

const falhas = casos.filter((c) => !c).length
console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' casos passaram')
process.exit(falhas ? 1 : 0)
