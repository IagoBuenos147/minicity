// Fotos + MEDIDA do RODAPE DAS MESAS (cassino/faixa-mesa.js). Salva em
// shots/hud-*.png.
//
//   node tools/shot-hud.mjs
//
// Copiado de tools/shot-luz.mjs — dele vem tudo que sabe chegar na mesa (o
// navegador headless, a espera da camera aterrissar, uma aba por cena). O que
// muda e o que se mede: la era a luminancia da tinta do feltro, aqui e a
// GEOMETRIA DO RODAPE.
//
// POR QUE MEDIR EM VEZ DE SO OLHAR A FOTO:
//
//   1. O TETO DE ALTURA. O meio da tela nao e do rodape: as cartas vao ate 78%
//      da altura, a base das pilhas de ficha do jogador fica em 86% e o numero
//      flutuante da aposta vive entre 45% e 65%. O TETO DESCEU DE 87% PRA 83%
//      — o dono liberou a faixa a crescer ate encostar nas pilhas de ficha, e
//      83% e onde ela encosta. Isso e um pixel, nao um gosto — entao a gente le
//      o getBoundingClientRect().top e reprova sozinho.
//   2. O EIXO. O pedido era "botoes centralizados". "Parece centralizado" numa
//      foto de 1280 px erra por 30 px sem ninguem ver. Aqui a gente mede o meio
//      do BLOCO de botoes contra o meio da tela e reprova acima de 2 px.
//   3. A ANCORA DO SAIR. O SAIR DA MESA nao esta mais no bloco: ele mora colado
//      na beirada direita do rodape. "Colado" tambem e pixel — a gente mede a
//      distancia dele ate a borda util da faixa e reprova acima de 2 px, senao
//      ele volta a passear conforme os botoes do meio mudam de largura.
//
// As cenas, em ordem:
//   01  poker, minha vez SEM ficha no pano   (TUDO / PASSAR / PAGAR / DESISTIR)
//   02  o mesmo, de perto, com o ponteiro em cima e com o botao apertado
//   03  poker, minha vez COM ficha no pano   (TIRAR / TUDO / APOSTAR n)
//   04  poker, fim da mao (o cartaz + PROXIMA MAO promovido a ouro)
//   05  blackjack, fase de aposta            (LIMPAR / TUDO / DISTRIBUIR n)
//   06  blackjack, meio da mao               (PEDIR / PARAR / DOBRAR / DIVIDIR)
//   07  blackjack em 760 px de largura       (o celular)
//   08  poker em 760 px de largura
//
// E, no fim da cena do poker, duas conferencias que nao viram foto:
//   — a VARREDURA DE LARGURA, que acha o pixel exato em que a ancora do SAIR
//     para de caber e a fila quebra em duas linhas (e por isso que a media
//     query existe, e o numero dela tem que sair de medida, nao de chute);
//   — o TESTE DA FILA VAZIA, que simula o rodape depois que o botao PROXIMA MAO
//     deixar de existir e a chamada do poker ficar vazia: a faixa nao pode
//     encolher de altura, senao ela pulsa a cada mao.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado')
}

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-hud-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function waitForDebugger() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

// protocolTimeout generoso: o cassino inteiro renderizado por software leva
// varios segundos POR QUADRO, e o captureScreenshot do CDP espera um quadro.
const browser = await puppeteer.connect({
  browserWSEndpoint: await waitForDebugger(), protocolTimeout: 600000,
})
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

// --- a regua do rodape, injetada na pagina --------------------------------
const REGUA = `
window.__hud = {
  /** A conta inteira do rodape num objeto so. */
  medir() {
    const h = window.innerHeight, w = window.innerWidth
    const f = document.querySelector('.mcrp-mesa-faixa')
    if (!f) return { erro: 'faixa nao esta na tela' }
    const r = f.getBoundingClientRect()
    const todos = [...document.querySelectorAll('.mcrp-mesa-btn')]
      .filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0)
    // O SAIR DA MESA SAIU DO BLOCO. Ele agora mora num trilho proprio colado na
    // beirada direita (o CANTO, em cassino/faixa-mesa.js) e tem um espelho
    // invisivel do outro lado que reserva a mesma largura. Medir o eixo com os
    // dois dentro nao mediria nada: eles se anulam por construcao e o numero
    // daria zero mesmo com a fila torta. Entao o EIXO e do bloco de acao SEM o
    // canto, e a ancoragem do sair virou uma segunda medida (sairDaBorda).
    // Em janela estreita nao ha ancora: a media query devolve o sair pra fila e
    // ai ele conta no bloco como qualquer outro botao. Quem diz em qual dos
    // dois mundos a gente esta e o proprio espelho — ele so existe no layout
    // enquanto a ancora existe. Ler isso do DOM em vez de repetir aqui a
    // largura de corte deixa a regua certa mesmo se o CSS mudar de numero.
    const esp = document.querySelector('.mcrp-mesa-espelho')
    const ancorado = !!(esp && esp.offsetParent)
    const vis = todos.filter((b) => !(ancorado && b.closest('.mcrp-mesa-canto')))
    const sair = ancorado
      ? todos.find((b) => b.closest('.mcrp-mesa-canto') && !b.closest('.mcrp-mesa-espelho')) || null
      : null
    const folgaDir = parseFloat(getComputedStyle(f).paddingRight) || 0
    const cx = (b) => { const q = b.getBoundingClientRect(); return q.left + q.width / 2 }
    const grande = vis.find((b) => b.classList.contains('mcrp-mesa-grande'))
    const chama = vis.find((b) => b.classList.contains('mcrp-mesa-chama'))
    const linha = vis.length
      ? { y0: Math.min(...vis.map((b) => b.getBoundingClientRect().top)),
          y1: Math.max(...vis.map((b) => b.getBoundingClientRect().bottom)) }
      : null
    const alt = (b) => { const q = b.getBoundingClientRect(); return +q.height.toFixed(0) }
    return {
      tela: [w, h],
      topoPct: +(100 * r.top / h).toFixed(2),
      alturaPx: +r.height.toFixed(0),
      alturaPct: +(100 * r.height / h).toFixed(2),
      // desvio do botao principal em relacao ao eixo da tela, em px
      eixoGrande: grande ? +(cx(grande) - w / 2).toFixed(1) : null,
      eixoChama: chama ? +(cx(chama) - w / 2).toFixed(1) : null,
      // o bloco inteiro de botoes tambem tem que estar centrado
      eixoBloco: vis.length
        ? +(((Math.min(...vis.map((b) => b.getBoundingClientRect().left))
            + Math.max(...vis.map((b) => b.getBoundingClientRect().right))) / 2) - w / 2).toFixed(1)
        : null,
      // A ANCORAGEM: quanto sobra entre a direita do SAIR e a beirada util do
      // rodape (a caixa de conteudo da faixa, ja sem o padding). Zero e o alvo.
      sairDaBorda: sair
        ? +((r.right - folgaDir) - sair.getBoundingClientRect().right).toFixed(1)
        : null,
      // E o vao entre o fim do bloco de acao e o comeco do SAIR: e ele que
      // impede o dedo de confundir SAIR DA MESA com DESISTIR.
      vaoDoSair: sair && vis.length
        ? +(sair.getBoundingClientRect().left
            - Math.max(...vis.map((b) => b.getBoundingClientRect().right))).toFixed(1)
        : null,
      linhaBotoes: linha
        ? [+(100 * linha.y0 / h).toFixed(1) + '%', +(100 * linha.y1 / h).toFixed(1) + '%']
        : null,
      // A FILA QUEBROU EM DUAS LINHAS? So a altura da linha de botoes responde:
      // com todos numa linha so, a altura do bloco e a do botao mais alto.
      duasLinhas: linha ? (linha.y1 - linha.y0) > 66 : false,
      botoes: (sair ? vis.concat([sair]) : vis).map((b) => ({
        // innerText e nao textContent: o rotulo do all-in virou dois elementos
        // (a palavra em cima, o numero embaixo) e textContent grudaria os dois
        // num "TUDO4.950" que nao se le no log. A barra dupla no \\s nao e
        // engano: esta regua inteira mora dentro de um template literal, e um
        // \\s simples chegaria na pagina como um "s" e trocaria as letras s do
        // rotulo por espaco em vez de juntar as duas linhas.
        t: (b.innerText || b.textContent).trim().replace(/\\s+/g, ' ').slice(0, 22),
        cls: b.className.replace(/mcrp-mesa-/g, ''),
        px: +cx(b).toFixed(0), h: alt(b), w: +b.getBoundingClientRect().width.toFixed(0),
        off: b.disabled ? 1 : 0,
      })),
    }
  },

  /** O ponto de tela pra pousar o ponteiro: o botao principal, ou o primeiro
   *  vivo. Devolve x/y um pouco a esquerda do meio, pra a onda do clique
   *  nascer visivelmente fora do centro.
   *
   *  O :not(espelho) nao e detalhe: o espelho do SAIR e o PRIMEIRO botao do
   *  DOM (ele abre a grade, no trilho da esquerda) e continua tendo caixa e
   *  offsetParent, so nao tem tinta. Sem o filtro, a foto do hover era o mouse
   *  parado em cima de nada. */
  ondeApontar() {
    const vis = [...document.querySelectorAll('.mcrp-mesa-btn')]
      .filter((b) => b.offsetParent && !b.disabled && !b.closest('.mcrp-mesa-espelho'))
    const b = vis.find((x) => x.classList.contains('mcrp-mesa-grande')
      || x.classList.contains('mcrp-mesa-promovido')) || vis[0]
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width * 0.34), y: Math.round(r.top + r.height / 2), t: b.textContent.trim() }
  },

  /**
   * O RODAPE SEM NADA PRA APERTAR.
   *
   * Duas mudancas do dono chegam junto: o botao PROXIMA MAO deixa de existir (a
   * mao seguinte vem sozinha) e a chamada do poker fica vazia. Entre uma mao e
   * outra sobra so o SAIR no canto — e se a fileira colapsar pra a altura dele,
   * o rodape inteiro encolhe e volta a crescer a cada mao.
   *
   * A simulacao esconde a fila e apaga a pastilha, le a altura e desfaz tudo na
   * MESMA chamada: getBoundingClientRect forca o layout na hora, entao nao ha
   * quadro nenhum em que o jogador veja o rodape mutilado.
   */
  filaVazia() {
    const f = document.querySelector('.mcrp-mesa-faixa')
    const fila = document.querySelector('.mcrp-mesa-fila')
    const cham = document.querySelector('.mcrp-mesa-chamada')
    if (!f || !fila || !cham) return null
    const antes = f.getBoundingClientRect().height
    const vis = fila.style.display, txt = cham.textContent
    fila.style.display = 'none'
    cham.textContent = ''
    const depois = f.getBoundingClientRect().height
    fila.style.display = vis
    cham.textContent = txt
    return { antes: +antes.toFixed(0), depois: +depois.toFixed(0) }
  },

  /** Aperta o botao visivel cujo rotulo casa com a expressao. */
  apertar(re) {
    const rx = new RegExp(re, 'i')
    const b = [...document.querySelectorAll('.mcrp-mesa-btn')]
      .find((x) => x.offsetParent && !x.disabled && !x.closest('.mcrp-mesa-espelho')
        && rx.test(x.textContent))
    if (!b) return null
    b.click()
    return b.textContent.trim()
  },
}
`

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const laudo = []

/** O teto duro: o rodape nao pode comecar antes de 83% da altura da tela.
 *  Era 87%; o dono liberou os 4 pontos que faltavam ate as pilhas de ficha. */
const TETO_TOPO = 83

/**
 * O que reprova e o EIXO DO BLOCO, nao o do botao principal.
 *
 * O pedido do dono era "quero eles centralizado" — o conjunto. A faixa
 * centraliza a fila inteira (justify-content:center) e deixa o principal cair
 * onde a ordem da mesa manda; prender o principal no pixel do meio joga o
 * bloco pra um lado e troca a ordem que o jogador ja conhece. Entao a regua e:
 * o meio da fila tem que bater com o meio da tela em 2 px.
 *
 * A SEGUNDA REGUA e a do SAIR DA MESA: o pedido foi "localizado a direita", e
 * direita aqui e a BEIRADA, nao "depois dos outros". Ele tem que encostar na
 * borda util do rodape em 2 px e continuar encostado quando os botoes do meio
 * trocarem de largura, que e o que passa a acontecer a cada rua do Hold'em.
 */
function conferir(rotulo, m) {
  if (!m || m.erro) { console.log('  !! ' + rotulo + ': ' + (m && m.erro)); return }
  const okTopo = m.topoPct >= TETO_TOPO
  const okEixo = m.eixoBloco === null || Math.abs(m.eixoBloco) <= 2
  const okAncora = m.sairDaBorda === null || Math.abs(m.sairDaBorda) <= 2
  console.log('  ' + rotulo
    + '  topo=' + m.topoPct + '%' + (okTopo ? ' ok' : ' ESTOUROU (teto ' + TETO_TOPO + '%)')
    + '  altura=' + m.alturaPx + 'px/' + m.alturaPct + '%'
    + '  eixo do bloco=' + m.eixoBloco + 'px' + (okEixo ? ' ok' : ' FORA DO CENTRO')
    + '  (principal em ' + (m.eixoGrande === null ? '-' : m.eixoGrande + 'px') + ')'
    + '  sair ' + (m.sairDaBorda === null ? 'na fila (janela estreita)'
      : 'a ' + m.sairDaBorda + 'px da borda' + (okAncora ? ' ok' : ' SOLTO')
        + ' com vao de ' + m.vaoDoSair + 'px')
    + '  botoes em ' + (m.linhaBotoes ? m.linhaBotoes.join('..') : '-'))
  for (const b of m.botoes) {
    console.log('      ' + (b.off ? '[off] ' : '      ') + b.t.padEnd(22)
      + ' h=' + String(b.h).padStart(3) + ' w=' + String(b.w).padStart(4)
      + ' x=' + String(b.px).padStart(5) + '  ' + b.cls.replace('btn ', ''))
  }
  laudo.push({ rotulo, ...m, okTopo, okEixo, okAncora })
}

async function sessao(rotulo, largura, corpo) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('  [erro pagina]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text()) })
  console.log('cena: ' + rotulo + ' (' + largura + 'px)')
  // O HMR DO VITE FICA DE FORA. Com quatro sessoes salvando arquivo, qualquer
  // save manda full-reload pelo /@vite/client e a pagina troca de baixo da
  // medida: a foto sai com o menu por cima da mesa e o laudo mede o rodape que
  // nao existe mais. Abortar so o cliente de HMR nao muda nada do que se ve —
  // a pagina ja carregou o codigo do disco na hora do goto.
  await page.setRequestInterception(true)
  page.on('request', (r) => {
    if (r.url().indexOf('/@vite/client') >= 0) r.abort().catch(() => {})
    else r.continue().catch(() => {})
  })
  try {
    await page.setViewport({ width: largura, height: 720 })
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction('window.__game && window.__game.scene', { timeout: 90000 })
    await page.evaluate(REGUA)

    const ev = async (fn, arg) => {
      for (let i = 0; ; i++) {
        try {
          await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 90000 })
          if (!await page.evaluate(() => !!window.__hud)) await page.evaluate(REGUA)
          return await page.evaluate(fn, arg)
        } catch (e) {
          if (i >= 4) throw e
          await espera(2000)
        }
      }
    }
    const shot = async (name, perto) => {
      const f = path.join(dir, 'hud-' + name + '.png')
      // 'perto' recorta so a faixa: o juice mora em 2-3 px de deslocamento e
      // some numa foto de 1280x720 inteira. 175 px e a faixa nova (114) mais um
      // dedo de feltro em cima — e nessa faixa de sobra que se ve se o topo do
      // rodape esta cortando as pilhas de ficha do jogador.
      await page.screenshot(perto
        ? { path: f, clip: { x: 0, y: 720 - 175, width: largura, height: 175 } }
        : { path: f })
      console.log('  foto: ' + f)
    }
    /**
     * HOVER E CLIQUE COM MOUSE DE VERDADE.
     *
     * Nada de clonar o :hover numa classe: o que a foto tem que provar e o CSS
     * que o jogador vai ver, e clone diverge do original no primeiro ajuste.
     * O botao e solto LONGE dele — mouse.up fora do alvo nao vira clique — pra
     * a foto do estado apertado nao disparar a jogada.
     */
    const juice = async (nome) => {
      const alvo = await ev(() => window.__hud.ondeApontar())
      if (!alvo) { console.log('  juice: nenhum botao vivo'); return }
      console.log('  juice em "' + alvo.t + '"')
      await page.mouse.move(alvo.x, alvo.y)
      await espera(700)
      await shot(nome + '-hover', true)
      await page.mouse.down()
      // 130 ms de 460: a onda esta com um quarto do caminho andado, que e onde
      // ela se ve.
      await espera(130)
      await shot(nome + '-press', true)
      await page.mouse.move(6, 6)
      await page.mouse.up()
      await espera(400)
    }
    const medir = async (nome) => {
      const m = await ev(() => window.__hud.medir())
      conferir(nome, m)
      return m
    }

    await ev(() => {
      const G = window.__game
      G.fluxo.jogar()
      G.carteira.ganharOuro(20000)
      G.carteira.ganharFichas(20000)
      G.hud.showHelp(false)
      for (const e of document.querySelectorAll('div[class*="mcrp-tut"]')) e.style.display = 'none'
    })
    await espera(1500)
    await corpo({ ev, shot, medir, juice, page })
  } finally {
    try { await page.close() } catch (err) { void err }
  }
}

/**
 * Espera a camera ATERRISSAR na mesa. Mesma logica do shot-luz: em swiftshader
 * o jogo anda a 2 fps e duas leituras de posicao caem no mesmo quadro, entao a
 * leitura so vale se o renderer desenhou quadro novo desde a anterior.
 */
async function esperarCamera(ev, alvo, max = 60) {
  let ant = null, quietas = 0
  for (let i = 0; i < max; i++) {
    const p = await ev(() => {
      const c = window.__game.camera
      return [c.position.x, c.position.y, c.position.z, window.__game.renderer.info.render.frame]
    })
    if (ant && p[3] < ant[3]) return { pos: [0, 0, 0], dist: 999, recarregou: true }
    if (ant && p[3] - ant[3] >= 2) {
      const d = Math.abs(p[0] - ant[0]) + Math.abs(p[1] - ant[1]) + Math.abs(p[2] - ant[2])
      quietas = d < 0.01 ? quietas + 1 : 0
      if (quietas >= 3) break
      ant = p
    } else if (!ant) ant = p
    await espera(700)
  }
  const c = ant || [0, 0, 0]
  const dist = alvo ? Math.hypot(c[0] - alvo[0], c[2] - alvo[1]) : null
  return { pos: [+c[0].toFixed(2), +c[1].toFixed(2), +c[2].toFixed(2)], dist: dist && +dist.toFixed(2) }
}

/**
 * A VARREDURA DE LARGURA.
 *
 * A ancora do SAIR custa DUAS larguras dele (a dele e a do espelho invisivel do
 * outro lado), e essa conta muda toda vez que um botao engorda. Em vez de
 * chutar onde a media query tem que cortar, a gente estreita a janela de
 * verdade e olha tres coisas por largura: o topo em %, se a fila quebrou em
 * duas linhas e se a ancora ainda esta de pe. Nao tira foto — o que interessa
 * aqui e a tabela.
 */
async function varrer(ev, page, larguras) {
  console.log('  varredura de largura (fila numa linha so?):')
  for (const w of larguras) {
    await page.setViewport({ width: w, height: 720 })
    await espera(450)
    const m = await ev(() => window.__hud.medir())
    if (!m || m.erro) { console.log('    ' + w + 'px  ?'); continue }
    console.log('    ' + String(w).padStart(4) + 'px  topo=' + String(m.topoPct).padStart(6) + '%'
      + '  alt=' + String(m.alturaPx).padStart(3) + 'px'
      + '  ' + (m.duasLinhas ? 'DUAS LINHAS' : 'uma linha  ')
      + '  ancora=' + (m.sairDaBorda === null ? 'devolvida' : m.sairDaBorda + 'px')
      + '  eixo=' + m.eixoBloco + 'px'
      + (m.topoPct >= TETO_TOPO ? '' : '   <== ESTOUROU O TETO'))
  }
}

async function sentar(ev, page, mesa, abrir, alvo, raioOk) {
  for (let t = 0; t < 3; t++) {
    await ev((m) => {
      const G = window.__game
      const a = G.casinoMundo.mesas[m]
      G.player.setMode('third')
      G.player.teleport(a.centro.x, a.centro.z - 1.6, 0)
    }, mesa)
    await espera(1500)
    await ev((m) => { window.__game.cassino[m]() }, abrir)
    await page.mouse.move(640, 360)
    const r = await esperarCamera(ev, alvo, 40)
    console.log('  camera em ' + r.pos.join(', ') + ' (a ' + r.dist + ' m do centro da mesa)')
    if (r.dist !== null && r.dist < raioOk) return r
    console.log('  camera longe demais; refazendo')
  }
  return null
}

/**
 * A MESA AINDA ESTA ABERTA? Se nao, senta de novo.
 *
 * Nao e paranoia: o vite manda full-reload sempre que QUALQUER sessao salva um
 * arquivo do projeto, e numa rodada de vinte minutos isso acontece. Na volta o
 * jogador esta no spawn e a faixa nem existe — sem esta checagem a ferramenta
 * morria com "Cannot read properties of null" na primeira leitura depois do
 * recarregamento e jogava fora a rodada inteira.
 */
async function garantirMesa(ev, page, mesa, abrir, alvo, raio) {
  if (await ev(() => !!document.querySelector('.mcrp-mesa-faixa'))) return true
  console.log('  a mesa fechou (a pagina recarregou); sentando de novo')
  await ev(() => {
    const G = window.__game
    G.fluxo.jogar()
    G.carteira.ganharOuro(20000)
    G.carteira.ganharFichas(20000)
    G.hud.showHelp(false)
  })
  await sentar(ev, page, mesa, abrir, alvo, raio)
  await espera(7000)
  return await ev(() => !!document.querySelector('.mcrp-mesa-faixa'))
}

try {
  await garantirServidor(URL_BASE)

  // 1) POKER. A mesa se reparte sozinha; a foto sai na vez do jogador.
  await sessao('poker', 1280, async ({ ev, shot, medir, juice, page }) => {
    await sentar(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2)
    await espera(9000)
    await shot('01-poker-vez')
    await medir('poker / minha vez')

    await juice('02-poker')

    // COM FICHA NO PANO: o clique cai na raiz e vira raycast no caixote. As
    // pilhas ficam na faixa de 62%..78% da altura, mais ou menos no meio da
    // largura; a varredura acha a primeira que responde.
    await garantirMesa(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2)
    const clicou = await ev(() => {
      const raiz = document.querySelector('.mcrp-mesa-raiz')
      if (!raiz) return null
      const W = window.innerWidth, H = window.innerHeight
      for (let y = 0.90; y > 0.60; y -= 0.012) {
        for (let x = 0.20; x < 0.82; x += 0.010) {
          const e = new MouseEvent('click', {
            bubbles: false, clientX: Math.round(x * W), clientY: Math.round(y * H),
          })
          raiz.dispatchEvent(e)
          const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
          if (bs.some((b) => b.offsetParent && /APOSTAR\s+\d/.test(b.textContent))) {
            return { x: +x.toFixed(3), y: +y.toFixed(3) }
          }
        }
      }
      return null
    })
    console.log('  ficha no pano:', JSON.stringify(clicou))
    await espera(2500)
    await shot('03-poker-apostando')
    await medir('poker / com ficha no pano')

    await juice('03b-poker-apostando')

    // A FILEIRA VAZIA: o rodape depois que o PROXIMA MAO sumir e a chamada do
    // poker ficar vazia. A altura tem que ser a MESMA — ver filaVazia().
    const fv = await ev(() => window.__hud.filaVazia())
    console.log('  fila vazia: faixa ' + (fv ? fv.antes + 'px -> ' + fv.depois + 'px'
      + (fv.antes === fv.depois ? ' ok (nao encolhe)' : ' ENCOLHEU') : '?'))

    // FIM DA MAO: correr resolve a mao na hora e traz o cartaz + PROXIMA MAO.
    await garantirMesa(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2)
    console.log('  ' + await ev(() => window.__hud.apertar('DESISTIR')))
    await espera(2200)
    await shot('04-poker-fim')
    await medir('poker / fim da mao')
  })

  // 2) BLACKJACK: fase de aposta e meio da mao.
  await sessao('blackjack', 1280, async ({ ev, shot, medir, juice, page }) => {
    await sentar(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6)
    await espera(6000)
    await shot('05-bj-aposta')
    await medir('blackjack / aposta')

    await juice('05b-bj-aposta')

    await garantirMesa(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6)
    console.log('  ' + await ev(() => window.__hud.apertar('DISTRIBUIR|JOGAR DE NOVO')))
    await espera(9000)
    await shot('06-bj-mao')
    await medir('blackjack / meio da mao')

    // O ESTADO MAIS LARGO DAS DUAS MESAS e este: PEDIR + PARAR + DOBRAR (n) +
    // DIVIDIR (n) na fila, mais a ancora. E o unico que fica PARADO esperando o
    // jogador, entao e nele que a varredura vale — no poker a mao anda sozinha
    // e a fila troca de largura no meio da medida.
    await varrer(ev, page, [1440, 1280, 1160, 1080, 1010, 1000, 940, 860, 780])
  })

  // 3) CELULAR. 760 px e a largura exata da media query — o pior caso dela.
  await sessao('bj-celular', 760, async ({ ev, shot, medir, page }) => {
    await sentar(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6)
    await espera(6000)
    await shot('07-bj-760')
    await medir('blackjack 760 / aposta')
    await garantirMesa(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6)
    console.log('  ' + await ev(() => window.__hud.apertar('DISTRIBUIR|JOGAR DE NOVO')))
    await espera(9000)
    await shot('07b-bj-760-mao')
    await medir('blackjack 760 / mao')
  })

  await sessao('pk-celular', 760, async ({ ev, shot, medir, page }) => {
    await sentar(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2)
    await espera(9000)
    await shot('08-pk-760')
    await medir('poker 760 / minha vez')
  })

  // --- laudo ---------------------------------------------------------------
  console.log('')
  console.log('LAUDO — o rodape tem que comecar em ' + TETO_TOPO + '% ou mais')
  let ruim = 0
  for (const l of laudo) {
    const s = (l.okTopo && l.okEixo && l.okAncora ? 'ok  ' : 'RUIM')
      + '  topo=' + String(l.topoPct).padStart(6)
      + '%  alt=' + String(l.alturaPx).padStart(3) + 'px'
      + '  eixo do bloco=' + String(l.eixoBloco === null ? '-' : l.eixoBloco).padStart(6)
      + '  sair da borda=' + String(l.sairDaBorda === null ? '-' : l.sairDaBorda).padStart(5)
      + '  ' + l.rotulo
    if (!l.okTopo || !l.okEixo || !l.okAncora) ruim++
    console.log('  ' + s)
  }
  console.log(ruim ? '  ' + ruim + ' cena(s) fora do orcamento' : '  todas dentro do orcamento')
} finally {
  try { await browser.disconnect() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
