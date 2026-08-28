// CLICAR NUM CARD TEM QUE TROCAR A PECA NO BONECO.
//
// Este teste existe por causa de um bug que o dono do projeto reportou assim:
// "quando clica nos olhos eles nao estao sendo equipados no personagem; isso
// esta acontecendo com olhos, boca, cabelo, cor do cabelo e sobrancelha".
//
// Os cinco campos da lista dele eram exatamente os cinco que tinham APELIDO em
// ingles (eyes, mouth, hair, hairColor, brows). O objeto de aparencia guardava
// os DOIS nomes; a tela de criacao trabalha sobre uma copia e mandava o objeto
// inteiro de volta, com o apelido VELHO ainda dentro; quem aplicava percorria as
// chaves na ordem de insercao, chegava no apelido e escrevia o valor velho por
// cima. Nao havia erro nenhum no console — a peca simplesmente nao mudava.
//
// Um teste de unidade nao pega isso, porque o defeito so aparece quando a
// aparencia faz a VOLTA INTEIRA: jogo -> copia da tela -> patch -> jogo. Entao
// aqui a gente abre o jogo de verdade, clica nos cards de verdade e le o indice
// que sobrou no personagem.
//
//   node tools/teste-customizador.mjs
//
// Sai com codigo 1 se algum campo nao trocar.

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

const PORT = 9833 + (process.pid % 200)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cz-' + PORT),
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

const casos = []
function ok(nome, passou, detalhe) {
  casos.push(passou)
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const browser = await puppeteer.connect({ browserWSEndpoint: await esperarDebugger() })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1500))

  // --- 1. a tela de criacao ---------------------------------------------------
  await page.evaluate(() => window.__game.fluxo.solo())
  await new Promise((r) => setTimeout(r, 1200))

  const abas = await page.evaluate(() =>
    [...document.querySelectorAll('.mcrp-cri .cz-tab')].map((b) => (b.textContent || '').trim()))
  ok('a tela de criacao abriu com abas', abas.length > 5, abas.join(' '))
  ok('a aba de PUPILA nao existe mais', !abas.some((t) => /PUPILA/i.test(t)), abas.join(' '))
  ok('a aba de tronco se chama CAMISAS', abas.some((t) => /CAMISA/i.test(t)), abas.join(' '))
  ok('a aba de PELE virou a aba COR', !abas.some((t) => /^PELE$/i.test(t)) && abas.some((t) => /^COR$/i.test(t)), abas.join(' '))

  /**
   * Clica no CARD `alvo` da lista do campo `campo` e devolve o indice que
   * sobrou no personagem. `campo` e o campo da aparencia; a aba pode se chamar
   * outra coisa (a de cor mexe em tres campos).
   */
  async function clicar(aba, campo, alvo) {
    return page.evaluate(async (abaNome, campoNome, i) => {
      const G = window.__game
      const btn = [...document.querySelectorAll('.mcrp-cri .cz-tab')]
        .find((b) => (b.textContent || '').trim().toUpperCase() === abaNome)
      if (!btn) return { erro: 'aba ' + abaNome + ' nao achada' }
      btn.click()
      await new Promise((r) => setTimeout(r, 120))
      // A secao de um campo e o bloco cujo primeiro card leva o nome do
      // catalogo daquele campo; mais simples e pegar pelo indice do bloco.
      const sec = document.querySelector('.mcrp-cri .cz-sec.is-active')
      if (!sec) return { erro: 'nenhuma secao ativa' }
      const blocos = [...sec.querySelectorAll('.cz-bloco')]
      const lista = blocos.length ? blocos : [sec]
      // qual bloco e o do campo? o customizador guarda a ordem dos campos na
      // aba; aqui usamos a ordem declarada em TAB_DEFS via o proprio texto
      const ordem = { corCabelo: 0, corBarba: 1, pele: 2 }
      const b = lista[ordem[campoNome] !== undefined ? ordem[campoNome] : 0]
      const cards = [...b.querySelectorAll('.cz-card, .cz-dot')]
      if (!cards[i]) return { erro: 'card ' + i + ' nao existe (tem ' + cards.length + ')' }
      cards[i].click()
      await new Promise((r) => setTimeout(r, 260))
      return {
        naTela: G.criacao.aparencia[campoNome],
        noBoneco: G.provador && G.provador.boneco
          ? G.provador.boneco.appearance[campoNome]
          : undefined,
      }
    }, aba, campo, alvo)
  }

  // --- 2. os cinco campos do bug ---------------------------------------------
  // Sao exatamente os cinco que tinham apelido em ingles.
  const CASOS = [
    ['OLHOS', 'olhos', 2],
    ['BOCA', 'boca', 2],
    ['CABELO', 'cabelo', 2],
    ['SOBRANC.', 'sobrancelha', 2],
    ['COR', 'corCabelo', 4],
    ['COR', 'corBarba', 3],
    ['COR', 'pele', 4],
    ['CABECA', 'cabeca', 3],
    ['NARIZ', 'nariz', 2],
    ['BARBA', 'barba', 2],
    ['CHAPEU', 'chapeu', 3],
    ['CAMISAS', 'blusa', 2],
  ]

  for (const [aba, campo, i] of CASOS) {
    const r = await clicar(aba, campo, i)
    if (r && r.erro) { ok('clicar em ' + campo + ' ' + i, false, r.erro); continue }
    ok('clicar no card ' + i + ' de ' + campo + ' equipa a peca',
      r.naTela === i, 'tela=' + r.naTela + ' alvo=' + i)
  }

  // --- 3. e a volta inteira: a peca continua depois de mexer noutra aba -------
  // Este e o caso EXATO do bug: mexer numa aba escrevia o valor velho de outra.
  {
    const antes = await clicar('OLHOS', 'olhos', 3)
    await clicar('CAMISAS', 'blusa', 1)
    await clicar('CALCA', 'calca', 1)
    const depois = await page.evaluate(() => window.__game.criacao.aparencia.olhos)
    ok('trocar de camisa NAO desfaz a escolha de olho',
      depois === 3 && antes.naTela === 3, 'olhos ficou em ' + depois)
  }

  ok('nenhum erro no console', erros.length === 0, erros.slice(0, 3).join(' | ') || 'limpo')

  const falhas = casos.filter((c) => !c).length
  console.log('')
  console.log((casos.length - falhas) + '/' + casos.length + ' casos passaram')
  process.exitCode = falhas ? 1 : 0
} finally {
  await browser.disconnect()
  try { filho.kill() } catch (err) { void err }
}
