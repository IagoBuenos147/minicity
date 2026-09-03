// Fotos da MESA DE POKER como o jogador ve: canvas + faixa em DOM, com a mao
// ja repartida. Existe pra medir enquadramento — onde a carta cai na tela e
// quanto dela sobra acima da faixa de botoes — em vez de chutar no olho.
//
//   node tools/shot-mesa-poker.mjs            -> shots/pk-*.png
//   node tools/shot-mesa-poker.mjs blackjack  -> a outra mesa
//
// Precisa do dev server rodando (npm run dev).

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const QUAL = (process.argv[2] || 'poker').toLowerCase()

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

const PORT = 9400 + (process.pid % 400)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-pk-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

async function waitForDebugger() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/version')
      if (r.ok) return (await r.json()).webSocketDebuggerUrl
    } catch (err) { void err }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('navegador nao abriu a porta de debug')
}

const browser = await puppeteer.connect({ browserWSEndpoint: await waitForDebugger() })
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

try {
  const page = await browser.newPage()
  page.on('console', (m) => {
    const t = m.type()
    if (t === 'error' || t === 'warning' || t === 'warn') console.log('  [browser ' + t + ']', m.text())
  })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  await page.setViewport({ width: 1280, height: 720 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  const pre = (n) => n + '-'
  const shot = async (name) => {
    const f = path.join(dir, (QUAL === 'poker' ? 'pk-' : 'bj-') + name + '.png')
    await page.screenshot({ path: f })
    console.log(f)
  }
  const espera = (ms) => new Promise((r) => setTimeout(r, ms))
  void pre

  // 1) sai do menu, enche o bolso e senta na mesa
  await page.evaluate((qual) => {
    const G = window.__game
    G.fluxo.jogar()
    G.carteira.ganharOuro(20000)
    G.carteira.ganharFichas(20000)
    const anc = G.casinoMundo.mesas[qual]
    G.player.setMode('third')
    G.player.teleport(anc.centro.x, anc.centro.z - 1.6, 0)
  }, QUAL)
  await espera(900)
  // O dev server recarrega a pagina a cada save (HMR). Se isso pegar o meio da
  // sessao, __game some e o evaluate seguinte estoura — esperar de novo custa
  // nada e salva a corrida.
  await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 60000 })
  await page.evaluate((qual) => {
    const G = window.__game
    if (qual === 'poker') G.cassino.abrirPoker()
    else G.cassino.abrirBlackjack()
  }, QUAL)
  await espera(1800)
  // Paralaxe: a lente acompanha o ponteiro, e sem nenhum mousemove o modulo
  // fica com o ponteiro no canto. Centraliza pra a foto medir o quadro LIMPO.
  await page.mouse.move(640, 360)
  await espera(700)
  await shot('01-entrada')

  // 2) reparte a mao pelo botao principal da faixa, como o jogador faria
  const clicar = (txt) => page.evaluate((t) => {
    const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
    const b = bs.find((x) => x.offsetParent && !x.disabled && x.textContent.toUpperCase().indexOf(t) >= 0)
    if (b) { b.click(); return b.textContent.trim() }
    return null
  }, txt)

  // O poker reparte SOZINHO agora (agendarMao). O blackjack ainda precisa do
  // botao, e ele agora se chama DISTRIBUIR tanto na mesa vazia quanto no fim.
  if (QUAL !== 'poker') console.log('  clique:', await clicar('DISTRIBUIR'))
  await espera(1200)
  await shot('02-repartido')

  /** Espera a VEZ DO JOGADOR com a mesa parada. Sem isto a foto cai no meio de
   *  uma repartida (a mesa reparte sozinha a cada 2,6 s) e mede carta em voo. */
  const esperarVez = async () => {
    for (let i = 0; i < 40; i++) {
      const pronto = await page.evaluate(() => {
        const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
        return bs.some((x) => x.offsetParent && !x.disabled &&
          /PASSAR|PEDIR/.test(x.textContent.toUpperCase()))
      })
      if (pronto) { await espera(1500); return true }
      await espera(300)
    }
    return false
  }
  console.log('  vez do jogador:', await esperarVez())

  // ESPERA A CARTA ESCORAR DE VERDADE. Em headless com swiftshader o jogo roda
  // a 2-3 fps e o `Math.min(dt, 0.1)` de mesa-3d faz a animacao andar a um
  // quinto do tempo de relogio: o que na maquina do jogador leva 1,3 s aqui
  // leva 8. Esperar por segundo cravado fotografava carta no meio do giro.
  const esperarEscora = async () => {
    for (let i = 0; i < 60; i++) {
      const rx = await page.evaluate(() => {
        const G = window.__game
        let g = null
        G.scene.traverse((o) => { if (o.name === 'mesa3d-poker') g = o })
        let v = 0
        if (g) {
          g.traverse((o) => {
            if (!o.isMesh || !o.geometry) return
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
            const bb = o.geometry.boundingBox
            const dx = bb.max.x - bb.min.x
            const dz = bb.max.z - bb.min.z
            if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
            if (o.parent.position.z < -0.5) v = Math.min(v, o.parent.rotation.x)
          })
        }
        return v
      })
      if (rx <= -0.85) { await espera(400); return +rx.toFixed(3) }
      await espera(500)
    }
    return null
  }
  if (QUAL === 'poker') console.log('  carta escorada em rx =', await esperarEscora())
  else await espera(6000)

  // CLICA NUMA PILHA DO CAIXOTE. O clique tem que cair na RAIZ da faixa (o
  // resto da tela e botao), entao dispara o evento no elemento certo com as
  // coordenadas da pilha ja projetadas.
  const clicarFicha = async (valor) => page.evaluate((v) => {
    const G = window.__game
    let g = null
    G.scene.traverse((o) => { if (/^mesa3d-/.test(o.name || '')) g = o })
    if (!g) return 'sem mesa'
    let alvo = null
    g.traverse((o) => {
      const a = o.userData && o.userData.alvo
      if (a && a.tipo === 'caixote' && a.v === v) alvo = o
    })
    if (!alvo) return 'sem alvo ' + v
    alvo.updateWorldMatrix(true, false)
    const e = alvo.matrixWorld.elements
    const p = new alvo.position.constructor(e[12], e[13], e[14])
    p.project(G.camera)
    const cv = G.renderer.domElement.getBoundingClientRect()
    const x = cv.left + (p.x * 0.5 + 0.5) * cv.width
    const y = cv.top + (-p.y * 0.5 + 0.5) * cv.height
    const raiz = document.querySelector('.mcrp-mesa-raiz')
    raiz.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }))
    return 'clicou ' + v + ' em ' + Math.round(x) + ',' + Math.round(y)
  }, valor)
  // Espera a VEZ mesmo (o caixote so existe na fase 'jogador'), tentando ate
  // uma mao dar. A mesa reparte sozinha, entao basta insistir.
  let apostou = false
  for (let t = 0; t < 30 && !apostou; t++) {
    const pronto = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      return bs.some((x) => x.offsetParent && /PASSAR|DESISTIR|DISTRIBUIR|JOGAR DE NOVO/.test(x.textContent.toUpperCase()))
    })
    if (!pronto) { await espera(700); continue }
    for (const v of [25, 100, 100]) console.log('  ' + await clicarFicha(v))
    apostou = true
  }
  await espera(3500)
  await shot('07-apostando')
  console.log('  faixa apostando:', JSON.stringify(await page.evaluate(() => {
    const f = document.querySelector('.mcrp-mesa-faixa')
    return f ? f.innerText.split(String.fromCharCode(10)).join(' | ') : null
  })))
  await shot('03-assentado')

  // 3) mede onde as cartas caem na tela: projeta as quinas de cada carta viva
  const medida = await page.evaluate(() => {
    const G = window.__game
    const cam = G.camera
    const alvo = []
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('mesa3d-') === 0) alvo.push(o) })
    const out = { fov: cam.fov, cam: [cam.position.x, cam.position.y, cam.position.z], cartas: [] }
    const grupo = alvo[0]
    if (!grupo) return out
    grupo.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.boundingBox) {
        if (o.isMesh && o.geometry) o.geometry.computeBoundingBox()
      }
      if (!o.isMesh || !o.geometry || !o.geometry.boundingBox) return
      const bb = o.geometry.boundingBox
      // so o que tem cara de carta: ~10x15 cm
      const dx = bb.max.x - bb.min.x
      const dz = bb.max.z - bb.min.z
      if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
      o.updateWorldMatrix(true, false)
      let minY = 9, maxY = -9, minX = 9, maxX = -9
      const V = G.scene.position.constructor
      for (let i = 0; i < 8; i++) {
        const p = new V(
          i & 1 ? bb.max.x : bb.min.x,
          i & 2 ? bb.max.y : bb.min.y,
          i & 4 ? bb.max.z : bb.min.z)
        p.applyMatrix4(o.matrixWorld).project(cam)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      }
      // NDC -> % da tela, com 0% no topo
      const pv = o.parent
      out.cartas.push({
        topo: +((1 - maxY) * 50).toFixed(1),
        base: +((1 - minY) * 50).toFixed(1),
        alturaPct: +((maxY - minY) * 50).toFixed(1),
        cx: +((minX + maxX) * 50).toFixed(1),
        // estado cru da carta: e o que diz se a inclinacao chegou
        pivoRx: +pv.rotation.x.toFixed(3),
        pivoRy: +pv.rotation.y.toFixed(3),
        pivoP: [+pv.position.x.toFixed(3), +pv.position.y.toFixed(3), +pv.position.z.toFixed(3)],
        meshRz: +o.rotation.z.toFixed(3),
        meshPy: +o.position.y.toFixed(4),
      })
    })
    out.cartas.sort((a, b) => a.topo - b.topo)
    // onde as pilhas do caixote caem na tela (base e topo de cada uma)
    out.caixote = []
    const V = G.scene.position.constructor
    grupo.traverse((o) => {
      const a = o.userData && o.userData.alvo
      if (!a) return
      o.updateWorldMatrix(true, false)
      const e = o.matrixWorld.elements
      const base = new V(e[12], e[13] - 0.06, e[14]).project(cam)
      const topo = new V(e[12], e[13] + 0.002, e[14]).project(cam)
      out.caixote.push({
        alvo: a.tipo + (a.v ? ':' + a.v : ''),
        base: +((1 - base.y) * 50).toFixed(1),
        topo: +((1 - topo.y) * 50).toFixed(1),
        cx: +(base.x * 100).toFixed(1),
      })
    })
    return out
  })
  console.log(JSON.stringify(medida, null, 2))

  // 4) desenha as caixas medidas por cima da tela: e a unica forma de provar
  //    que o numero e a imagem falam da mesma carta.
  await page.evaluate((m) => {
    const d = document.createElement('div')
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none'
    for (const c of m.cartas) {
      const b = document.createElement('div')
      b.style.cssText = 'position:absolute;border:2px solid #ff2d55;' +
        'left:' + (50 + c.cx - 3) + '%;top:' + c.topo + '%;' +
        'width:6%;height:' + c.alturaPct + '%'
      d.appendChild(b)
    }
    const g = document.createElement('div')
    g.style.cssText = 'position:absolute;left:50%;top:0;bottom:0;width:1px;background:#0ff'
    d.appendChild(g)
    const h = document.createElement('div')
    h.style.cssText = 'position:absolute;top:50%;left:0;right:0;height:1px;background:#0ff'
    d.appendChild(h)
    document.body.appendChild(d)
  }, medida)
  await shot('04-medida')

  // 5) leva a mao ate o fim so com PASSAR/PAGAR: e o showdown que interessa,
  //    porque e la que as cartas DELE tem que levantar sem a lente se mexer.
  await page.evaluate(() => {
    const d = document.querySelector('div[style*="9999"]')
    if (d) d.remove()
  })
  for (let i = 0; i < 6; i++) {
    const b = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      const alvo = bs.find((x) => x.offsetParent && !x.disabled &&
        /PAGAR|PASSAR|PARAR/.test(x.textContent.toUpperCase()))
      if (alvo) { alvo.click(); return alvo.textContent.trim() }
      return null
    })
    console.log('  acao:', b)
    await espera(1200)
    if (!b) break
  }
  await espera(4000)
  await shot('05-showdown')
  await espera(6000)
  await shot('06-proxima-mao')
  const faixaTxt = await page.evaluate(() => {
    const f = document.querySelector('.mcrp-mesa-faixa')
    const fichas = [...document.querySelectorAll('.mcrp-mesa-fichabt')]
    return {
      texto: f ? f.innerText.split(String.fromCharCode(10)).join(' | ') : null,
      fichasVisiveis: fichas.filter((b) => b.offsetParent).length,
      fichasLigadas: fichas.filter((b) => b.offsetParent && !b.disabled).length,
    }
  })
  console.log('  faixa no fim:', JSON.stringify(faixaTxt))
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
