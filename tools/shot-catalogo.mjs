// GRADE DE UM CATALOGO INTEIRO NUMA FOTO SO.
//
//   node tools/shot-catalogo.mjs barba
//   node tools/shot-catalogo.mjs olhos sobrancelha cabelo cabeca
//   node tools/shot-catalogo.mjs            -> todos
//
// Por que isto existe: quando um catalogo passa de 4 pra 16 itens, conferir um
// por um no customizador leva mais tempo do que escrever os 16. Aqui o
// PROVADOR (o mesmo palco que a tela de customizacao usa) renderiza cada item
// do catalogo num quadro, e o script monta uma grade HTML com todos e tira UMA
// foto. Da pra ver de relance qual peca nasceu flutuando, qual sumiu e quais
// duas ficaram parecidas demais — que e a unica pergunta que importa num
// catalogo grande.
//
// ESTA FERRAMENTA NAO USA O DEV SERVER, e isso e de proposito: ela roda em
// cima do BUILD (npm run build + servidor.js servindo dist/). Renderizar 16
// bonecos leva alguns minutos no renderizador por software, e qualquer arquivo
// salvo nesse meio tempo — por outro agente, por outra aba do editor — faz o
// Vite recarregar a pagina e mata o contexto no meio da grade. Servindo o dist
// estatico, o que estiver na tela fica na tela ate o fim.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8600 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

// campo da aparencia -> { catalogo, foco, base, corte }
//   catalogo  nome exportado por appearance.js (pra saber quantos itens tem)
//   base      o que zerar pra a peca aparecer sozinha (chapeu tapa cabelo, etc)
//   corte     onde a janelinha 1:1 cai na foto. CADA ABA PRECISA DA SUA: o
//             cabelo mora no topo do cranio e a barba no queixo, e uma unica
//             posicao boa pra um deixa o outro inteiro fora do quadro (foi o
//             que aconteceu na primeira leva de fotos).
const ABAS = {
  cabeca: { catalogo: 'CABECAS', foco: 'pescoco', base: { chapeu: 0, cabelo: 0, barba: 0 }, corte: '50% 42%' },
  olhos: { catalogo: 'OLHOS', foco: 'pescoco', base: { chapeu: 0, cabelo: 0, barba: 0 }, corte: '50% 42%' },
  sobrancelha: { catalogo: 'SOBRANCELHAS', foco: 'pescoco', base: { chapeu: 0, cabelo: 0, barba: 0 }, corte: '50% 42%' },
  barba: { catalogo: 'BARBAS', foco: 'pescoco', base: { chapeu: 0, cabelo: 0 }, corte: '50% 46%' },
  cabelo: { catalogo: 'CABELOS', foco: 'pescoco', base: { chapeu: 0, barba: 0 }, corte: '50% 38%' },
  boca: { catalogo: 'BOCAS', foco: 'pescoco', base: { chapeu: 0, cabelo: 0, barba: 0 }, corte: '50% 46%' },
  // ROUPA: o catalogo vem de roupas.js, e nao de appearance.js — por isso a
  // aba diz de onde ler. O foco 'corpo' pega o boneco inteiro, que e o unico
  // enquadramento em que da pra julgar se a calca encaixa na barra da camisa e
  // se o cano do calcado some por baixo dela.
  // CHAPEU sai com o cabelo 3 (arrepiado) de proposito: o que interessa nesta
  // aba nao e o chapeu sozinho, e a relacao dele com o cabelo e com o olho —
  // e o arrepiado e o penteado que mais fura pano.
  chapeu: { modulo: 'roupas', catalogo: 'CHAPEUS', foco: 'pescoco', base: { cabelo: 3 }, corte: '50% 40%' },
  blusa: { modulo: 'roupas', catalogo: 'BLUSAS', foco: 'corpo', base: { chapeu: 0 }, corte: '50% 42%' },
  calca: { modulo: 'roupas', catalogo: 'CALCAS', foco: 'corpo', base: { chapeu: 0 }, corte: '50% 42%' },
  // 'pernas' e nao 'pes': o foco 'pes' olha o boneco DE CIMA, e visto de cima
  // um tenis de corrida e um sapato social sao a mesma mancha. O que separa um
  // calcado do outro e o PERFIL.
  calcado: { modulo: 'roupas', catalogo: 'CALCADOS', foco: 'pernas', base: { chapeu: 0 }, corte: '50% 62%' },
  // COLAR mora mais abaixo que rosto/barba (base do pescoco ate o meio do
  // peito, nao o queixo): corte desce pra 56% pra sobrar peito na foto em vez
  // de cortar o pingente fora do quadro.
  colar: { modulo: 'roupas', catalogo: 'COLARES', foco: 'pescoco', corte: '50% 56%' },
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

// O CATALOGO E LIDO AQUI, EM NODE, e nao dentro da pagina. No build o modulo
// vira um chunk com nome de hash e nao da pra importar por caminho; e o jogo
// nao expoe appearance.js no window. Como o arquivo e ESM puro (so numeros e
// funcoes de geometria; nada de DOM em tempo de import), o proprio Node
// consegue ler a lista e mandar os nomes prontos pra pagina.
const AP = await import(pathToFileURL(
  path.join(ROOT, 'src', 'player', 'appearance.js')).href)
const RP = await import(pathToFileURL(
  path.join(ROOT, 'src', 'player', 'roupas.js')).href)
const modDe = (cfg) => (cfg.modulo === 'roupas' ? RP : AP)

const pedidos = process.argv.slice(2).filter((a) => ABAS[a])
const abas = pedidos.length ? pedidos : Object.keys(ABAS)

// build + servidor estatico proprio
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

const PORT = 9511 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cat-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1400,900', 'about:blank',
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
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 300000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1400, height: 900 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 200)) })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.provador', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const aba of abas) {
    const cfg = ABAS[aba]
    // Um item por chamada: renderizar 16 bonecos dentro de um page.evaluate so
    // estoura o protocolTimeout no renderizador por software.
    const itens = (modDe(cfg)[cfg.catalogo] || []).map((x, i) => ({
      i, nome: (x && (x.nome || x.name || x.id)) || String(i),
    }))
    await page.evaluate(async () => {
      const G = window.__game
      G.fluxo.foto(true)
      let grade = document.getElementById('grade-catalogo')
      if (grade) grade.remove()
      grade = document.createElement('div')
      grade.id = 'grade-catalogo'
      // ABSOLUTE, e nao FIXED: elemento fixo nao empurra a altura da pagina, e
      // o screenshot de pagina inteira sai do tamanho da janela — cortava a
      // grade na terceira linha e as ultimas pecas do catalogo nunca apareciam.
      grade.style.cssText = 'position:absolute;left:0;top:0;width:100%;'
        + 'z-index:99999;background:#15161a;min-height:100vh;'
        + 'font:12px monospace;color:#ddd;padding:8px;box-sizing:border-box;'
        + 'display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start'
      document.documentElement.style.background = '#15161a'
      document.body.appendChild(grade)
    })

    for (const it of itens) {
      await page.evaluate(async (aba, i, foco, base, nome, corte) => {
        const G = window.__game
        const ap = Object.assign({}, G.appearance, base)
        ap[aba] = i
        G.provador.setAparencia(ap)
        G.provador.focar(foco, true)
        G.provador.atualizar(0.6)
        G.provador.render()
        const cel = document.createElement('div')
        cel.style.cssText = 'width:340px'
        const rot = document.createElement('div')
        rot.textContent = String(i).padStart(2, '0') + ' ' + nome
        rot.style.cssText = 'padding:2px 0;color:#9fe'
        const im = document.createElement('img')
        im.src = G.renderer.domElement.toDataURL('image/png')
        // COVER, e nao recorte 1:1. Com janelinha de pixel a pixel cada aba
        // precisava do proprio deslocamento (cabelo no topo do cranio, barba no
        // queixo, sobrancelha logo acima do olho) e sempre sobrava uma aba com
        // a peca fora do quadro. Com cover a foto inteira do provador entra na
        // altura da celula: perde-se detalhe, ganha-se a garantia de que a peca
        // esta sempre visivel — que e a pergunta que uma grade de catalogo
        // responde.
        im.style.cssText = 'width:340px;height:340px;object-fit:cover;'
          + 'object-position:' + corte + ';background:#202228;border:1px solid #3a3d45'
        cel.appendChild(rot); cel.appendChild(im)
        document.getElementById('grade-catalogo').appendChild(cel)
      }, aba, it.i, cfg.foco, cfg.base, it.nome, cfg.corte)
    }

    const arq = path.join(dir, 'cat-' + aba + '.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq + '  (' + itens.length + ' itens)')
    await page.evaluate(() => {
      const g = document.getElementById('grade-catalogo')
      if (g) g.remove()
    })
  }

  if (erros.length) console.log('ERROS:\n' + erros.slice(0, 10).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
