// A BARRA DE ITENS, O MERCADO E A BEBIDA NA MAO — conferencia no jogo rodando.
//
//   node tools/teste-bebida.mjs
//
// Sai com codigo 1 se algum caso falhar.
//
// O QUE ELE CUIDA, e por que cada um esta aqui:
//
//   1. UMA BARRA SO. Era o pedido, e a unica prova de que ela e uma so e nao
//      existir mais um segundo elemento de barra na pagina.
//   2. AS TECLAS 1 A 9. E a metade da barra que NAO da pra ver numa foto. Elas
//      passam pelo mesmo caminho do jogador (KeyboardEvent no window ->
//      core/input.js -> wasPressed no laco), entao um atalho no teste nao
//      esconderia um erro de fiacao.
//   3. APERTAR DE NOVO GUARDA. Foi decisao de design (nao ha tecla de "guardar"),
//      e decisao de design sem teste vira regressao silenciosa.
//   4. A ORDEM DA COMPRA. Espaco -> ouro -> entrega. O caso que importa e o
//      NEGATIVO: mochila cheia nao pode cobrar. Um erro aqui tira ouro do
//      jogador sem entregar nada, e ele so descobre depois.
//   5. MOVEL NAO VAI PRA MAO. As duas coisas moram nas mesmas nove vagas desde
//      que a barra virou uma so, e e a ficha (naCasa) que separa quem vai pro
//      chao de quem vai pra mao.
//
// RODA EM CIMA DO BUILD (npm run build + servidor.js), e nao do dev server, pela
// mesma razao de tools/shot-bebida.mjs: com tres sessoes mexendo na pasta, um
// arquivo salvo no meio da rodada faz o Vite recarregar a pagina e o teste morre
// sem ter testado nada.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8800 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

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

let falhas = 0
function check(nome, ok, extra) {
  if (ok) { console.log('  ok   ' + nome); return }
  falhas++
  console.log('  FALHOU ' + nome + (extra ? ('  [' + extra + ']') : ''))
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

const PORT = 9611 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-tbeb-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
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
  browserWSEndpoint: await esperarDebugger(), protocolTimeout: 600000,
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text().slice(0, 200))
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.mao', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2000))

  // TUDO NUMA AVALIACAO SO. As teclas precisam de QUADROS entre uma e outra (o
  // wasPressed vive um quadro), e quadro em headless so anda dentro de um
  // requestAnimationFrame — atravessar a fronteira do puppeteer entre cada
  // tecla custaria um round-trip por passo e ainda arriscaria pegar a pagina no
  // meio de um reload.
  const r = await page.evaluate(async () => {
    const G = window.__game
    // O TETO DE TEMPO E OBRIGATORIO. Em headless a aba so compoe quando alguem
    // pede, o renderizador e por software (~5 quadros por segundo) e o rAF as
    // vezes simplesmente PARA. Sem o setTimeout de socorro, um quadro que nao
    // vem pendura a avaliacao inteira ate o protocolTimeout do puppeteer
    // estourar — e ai a rodada nao falha, ela se perde, que e pior.
    const passo = (n) => new Promise((res) => {
      let i = 0
      let pronto = false
      const fim = () => { if (!pronto) { pronto = true; res(i) } }
      setTimeout(fim, 3500)
      const f = () => { if (pronto) return; (++i >= n) ? fim() : requestAnimationFrame(f) }
      requestAnimationFrame(f)
    })
    const tecla = async (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code }))
      await passo(3)
      // o keyup importa: core/input.js ignora o segundo keydown de uma tecla
      // que continua "em baixo", e a barra vive de apertar a MESMA tecla 2x
      window.dispatchEvent(new KeyboardEvent('keyup', { code }))
      await passo(10)
    }

    G.fluxo.jogar()
    await passo(15)

    const out = {}
    // --- 1) uma barra so ---------------------------------------------------
    out.temBarra = !!document.getElementById('hud-barra')
    out.temHotbarVelha = !!document.getElementById('hotbar')
    out.nVagas = document.querySelectorAll('#hud-bag .vaga').length
    const b = document.getElementById('hud-barra')
    if (b) {
      const cx = b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2
      out.desvioDoCentro = Math.round(Math.abs(cx - window.innerWidth / 2))
    }

    // --- 2) o mercado --------------------------------------------------------
    out.temMercado = !!G.mercado
    G.inventario.limpar()
    const ouro0 = G.carteira.ouro
    out.ouroInicial = ouro0
    G.mercado.abrir()
    G.mercado.porNoCarrinho('cerveja-lata', 2)
    out.comprou = G.mercado.comprar()
    G.mercado.fechar()
    await passo(15)
    out.cobrou = ouro0 - G.carteira.ouro
    out.vaga0 = JSON.stringify(G.inventario.ver(0))
    out.naMaoDepoisDaCompra = G.mao.id

    // --- 3) as teclas --------------------------------------------------------
    G.inventario.limpar()
    G.inventario.adicionar('whiskey-garrafa', 1)   // vaga 0
    G.inventario.adicionar('cerveja-lata', 1)      // vaga 1
    G.inventario.adicionar('sinuca-bar', 1)        // vaga 2 (movel)
    await passo(10)
    await tecla('Digit1'); out.tecla1 = G.mao.id
    await tecla('Digit2'); out.tecla2 = G.mao.id
    await tecla('Digit2'); await passo(22); out.tecla2DeNovo = G.mao.id   // guarda
    await tecla('Digit1'); out.voltou = G.mao.id
    await tecla('Digit5'); await passo(22); out.vagaVazia = G.mao.id       // vaga vazia = mao vazia
    await tecla('Digit3'); await passo(22)
    out.movelNaoVaiPraMao = G.mao.id
    out.movelAbriuEncaixe = !!(G.encaixe && G.encaixe.ativo)
    if (G.encaixe) G.encaixe.sair()
    await passo(10)

    // --- 4) mochila cheia nao cobra -----------------------------------------
    G.inventario.limpar()
    for (let i = 0; i < 9; i++) G.inventario.adicionar('sinuca-bar', 1)
    out.mochilaCheia = G.inventario.livres === 0
    const ouro1 = G.carteira.ouro
    G.mercado.abrir()
    G.mercado.porNoCarrinho('vodka-garrafa', 1)
    out.recusou = G.mercado.comprar() === false
    G.mercado.fechar()
    out.naoCobrou = G.carteira.ouro === ouro1
    G.inventario.limpar()
    await passo(10)
    return out
  })

  console.log('BARRA')
  check('a barra existe e e uma so', r.temBarra && !r.temHotbarVelha,
    'barra=' + r.temBarra + ' hotbarVelha=' + r.temHotbarVelha)
  check('nove vagas', r.nVagas === 9, 'vagas=' + r.nVagas)
  check('centrada no rodape', r.desvioDoCentro <= 1, 'desvio=' + r.desvioDoCentro + 'px')

  console.log('MERCADO')
  check('o mercado existe', r.temMercado)
  check('comeca com 100.000 de ouro', r.ouroInicial >= 100000, 'ouro=' + r.ouroInicial)
  check('a compra passa', r.comprou === true)
  check('cobrou 36 por duas latas', r.cobrou === 36, 'cobrou=' + r.cobrou)
  check('as duas latas foram pra vaga 0', r.vaga0 === '{"id":"cerveja-lata","qtd":2}', r.vaga0)
  check('a bebida comprada ja vai pra mao', r.naMaoDepoisDaCompra === 'cerveja-lata',
    'naMao=' + r.naMaoDepoisDaCompra)

  console.log('TECLAS 1 A 9')
  check('1 pega o da vaga 1', r.tecla1 === 'whiskey-garrafa', 'naMao=' + r.tecla1)
  check('2 troca pro da vaga 2', r.tecla2 === 'cerveja-lata', 'naMao=' + r.tecla2)
  check('2 de novo guarda', r.tecla2DeNovo === null, 'naMao=' + r.tecla2DeNovo)
  check('1 pega de volta', r.voltou === 'whiskey-garrafa', 'naMao=' + r.voltou)
  check('vaga vazia esvazia a mao', r.vagaVazia === null, 'naMao=' + r.vagaVazia)
  check('movel NAO vai pra mao', r.movelNaoVaiPraMao === null, 'naMao=' + r.movelNaoVaiPraMao)
  check('movel abre o modo de encaixe', r.movelAbriuEncaixe === true)

  console.log('ORDEM DA COMPRA')
  check('a mochila encheu', r.mochilaCheia === true)
  check('mochila cheia recusa a compra', r.recusou === true)
  check('e NAO cobra', r.naoCobrou === true)

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 10).join('\n'))
  console.log(falhas ? ('\n' + falhas + ' caso(s) falharam') : '\ntudo certo')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
process.exit(falhas ? 1 : 0)
