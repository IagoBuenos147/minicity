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

// A porta e o perfil saem do PID. As outras ferramentas de foto deste repo
// fazem igual, e com quatro sessoes rodando ao mesmo tempo duas ja colidiram:
// o segundo navegador achava o perfil do primeiro em uso e a pagina descolava
// no meio ('Not attached to an active page'). O deslocamento por arquivo
// separa as faixas.
const PORT = 9700 + (process.pid % 250)
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
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e.stack || e.message).slice(0, 600)))
  await page.setViewport({ width: 1280, height: 720 })
  // CORTA O HMR. Com varias sessoes editando o mesmo repositorio, todo save
  // manda um full-reload pelo /@vite/client e a pagina troca de baixo da
  // medida: no melhor caso a foto sai com o menu por cima da mesa, no pior o
  // puppeteer perde o alvo ('Not attached to an active page'). Abortar so esse
  // pedido congela o bundle que ja carregou, que e exatamente o que se quer
  // medir. O modulo do jogo em si continua vindo do dev server.
  await page.setRequestInterception(true)
  page.on('request', (r) => {
    if (r.url().indexOf('/@vite/client') >= 0) r.abort().catch(() => {})
    else r.continue().catch(() => {})
  })
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
      if (!a) return
      // v === null pede o alvo da PILHA DA APOSTA
      if (v === null ? a.tipo === 'aposta' : (a.tipo === 'caixote' && a.v === v)) alvo = o
    })
    if (!alvo) return 'sem alvo ' + v
    void 0
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
    await espera(900)
    // TIRAR PELA PILHA: clicar no monte da aposta tem que tirar a ficha DE CIMA
    // (a menor da decomposicao), e nao zerar nem tirar a maior.
    const naFaixa = () => page.evaluate(() => {
      const b = [...document.querySelectorAll('.mcrp-mesa-btn')]
        .find((x) => x.offsetParent && /TIRAR/.test(x.textContent.toUpperCase()))
      return b ? b.textContent.trim() : null
    })
    console.log('  antes de tirar:', await naFaixa())
    console.log('  ' + await clicarFicha(null))
    await espera(900)
    console.log('  depois de tirar:', await naFaixa())
    // foto NO INSTANTE do clique: e onde o "+N" que sobe existe
    await espera(260)
    await shot('08-clique')
    apostou = true
  }
  await espera(3500)
  await shot('07-apostando')
  const lerFaixa = () => page.evaluate(() => {
    const f = document.querySelector('.mcrp-mesa-faixa')
    return f ? f.innerText.split(String.fromCharCode(10)).join(' | ') : null
  })
  console.log('  faixa apostando:', JSON.stringify(await lerFaixa()))

  // 2b) LEVA A MAO ATE O RIVER so pagando/passando, fotografando cada rua. E o
  //     unico jeito de ver o flop, o turn e o river aparecerem na mesa.
  if (QUAL === 'poker') {
    const cartasNaMesa = () => page.evaluate(() => {
      const G = window.__game
      let g = null
      G.scene.traverse((o) => { if (o.name === 'mesa3d-poker') g = o })
      if (!g) return -1
      let n = 0
      const zs = []
      g.traverse((o) => {
        if (!o.isMesh || !o.geometry) return
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
        const bb = o.geometry.boundingBox
        const dx = bb.max.x - bb.min.x
        const dz = bb.max.z - bb.min.z
        if (dx < 0.06 || dx > 0.2 || dz < 0.09 || dz > 0.25) return
        // a fila comunitaria vive em z ~0.02, com espalhamento de 3 cm
        if (Math.abs(o.parent.position.z - 0.02) < 0.09) n++
        zs.push(o.parent.position.z.toFixed(2))
      })
      window.__zs = zs.join(' ')
      return n
    })
    const agir = () => page.evaluate(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      const b = bs.find((x) => x.offsetParent && !x.disabled &&
        /^(PAGAR|PASSAR)/.test(x.textContent.trim().toUpperCase()))
      if (b) { b.click(); return b.textContent.trim() }
      return null
    })
    // Devolve o que ficou no pano: com ficha empurrada o PASSAR some (empurrar
    // e passar sao contraditorios), e o laco abaixo nao teria o que clicar.
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.mcrp-mesa-btn')]
        .find((x) => x.offsetParent && /^TIRAR/.test(x.textContent.trim().toUpperCase()))
      if (b) b.click()
    })
    await espera(900)
    // ANDA UMA RUA POR VEZ, sempre pela acao mais barata, e fotografa DEPOIS
    // que a repartida assentou. Em headless a mesa anda a um quinto do tempo de
    // relogio, entao o numero grande de espera aqui vale uns 1,5 s no jogo.
    const vistas = []
    for (let i = 0; i < 16; i++) {
      const txt = await lerFaixa()
      const rua = txt && /POTE NO ([A-Z-]+)/i.exec(txt)
      const nome = rua ? rua[1].toLowerCase() : 'x'
      const n = await cartasNaMesa()
      vistas.push(nome + ':' + n)
      if (n >= 3) await shot('1' + n + '-' + nome)
      const fez = await agir()
      // ESPERA O DESFECHO DA ACAO. Ou a vez volta pra mim (proxima rua), ou a
      // mao acaba — e o fim se reconhece pelo cartaz do meio, que a faixa so
      // acende em resultado. E a unica janela em que o realce da mao vencedora
      // esta na tela.
      let pegouFim = false
      // A PRIMEIRA ESPERA E LONGA de proposito: logo depois do clique a faixa
      // ainda mostra os botoes de antes (o render sai no proximo quadro, e aqui
      // o quadro leva meio segundo), entao um poll imediato le sempre 'vez' e
      // sai do laco antes de a rua virar.
      if (fez) await espera(2600)
      for (let t = 0; t < 80 && fez; t++) {
        // 250 ms e nao 700: a janela do showdown dura T_PROXIMA_MAO = 2,6 s de
        // RELOGIO (e um setTimeout, nao tempo de jogo), e em headless a foto
        // sozinha come metade disso. Poll grosso perdia a janela toda vez.
        await espera(250)
        const cena = await page.evaluate(() => {
          // O REALCE e o sinal mais confiavel de showdown: ele fica no ar a mao
          // inteira ate a proxima repartida, enquanto o cartaz do meio dura so
          // 1,7 s de animacao CSS e escapa entre dois polls.
          const G = window.__game
          let aceso = 0
          G.scene.traverse((o) => {
            if (o.name === 'aura-realce' && o.visible && o.material && o.material.opacity > 0.15) aceso++
          })
          // SEGURA A MESA NO SHOWDOWN ZERANDO A CARTEIRA.
          //
          // Congelar o rAF nao bastava: a janela do showdown e de 2,6 s de
          // RELOGIO e a mesa reparte sozinha, entao a foto saia sempre do
          // pre-flop seguinte. Sem ficha pra pagar a entrada, o comecar()
          // agendado desiste na primeira linha e a mesa fica parada no fim da
          // mao — com as cartas vencedoras levantadas — pelo tempo que a foto
          // precisar. E o mesmo caminho que o jogador quebrado percorre.
          if (aceso > 0) {
            G.carteira.gastarFichas(G.carteira.fichas)
            return 'fim'
          }
          const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
          return bs.some((x) => x.offsetParent && !x.disabled &&
            /^(PAGAR|PASSAR)/.test(x.textContent.trim().toUpperCase())) ? 'vez' : 'espera'
        })
        if (cena === 'fim') {
          // CONGELA O QUADRO ANTES DE FOTOGRAFAR. Sem isto a mesa reparte a mao
          // seguinte enquanto o captureScreenshot roda, e a foto do showdown sai
          // com o pre-flop novo em cima. Matar o rAF para o laco de desenho e o
          // compositor guarda o ultimo quadro desenhado — que e o que se quer.
          // 9 s e nao 2,5: o halo sobe em 0,45 s de tempo de ANIMACAO, e com o
          // dt travado em 0,1 a 2 fps isso vira ~2 s de relogio — a foto
          // anterior pegou ele em 0,58 de opacidade, no meio da subida.
          await espera(9000)
          console.log('  realce no instante da foto:', JSON.stringify(await page.evaluate(() => {
            const G = window.__game
            let vis = 0, tot = 0, op = null, altura = []
            G.scene.traverse((o) => {
              if (o.name !== 'aura-realce') return
              tot++
              op = o.material.opacity
              if (o.visible) { vis++; altura.push(+o.parent.position.y.toFixed(3)) }
            })
            return { auras: tot, visiveis: vis, opacidade: op, yDasCartasRealcadas: altura }
          })))
          await shot('21-showdown')
          console.log('  showdown fotografado:', JSON.stringify(await lerFaixa()))
          pegouFim = true
          break
        }
        if (cena === 'vez') break
      }
      if (pegouFim) break
      if (!fez) {
        // Acabou a mao. O SHOWDOWN e o quadro que interessa aqui: as cinco
        // cartas da mao vencedora sobem e acendem. Ele dura ate a mesa repartir
        // de novo (2,6 s de relogio do jogo = uns 13 s em headless), entao ha
        // janela de sobra pra fotografar.
        await espera(4000)
        await shot('22-fim')
        break
      }
    }
    // A FOTO QUE VALE. As de dentro do laco pegam a mesa repartindo; esta
    // espera a ultima carta assentar de verdade — em headless a repartida do
    // river leva uns 12 s de relogio.
    await espera(14000)
    await shot('20-mesa-completa')
    console.log('  cartas na mesa na foto final:', await cartasNaMesa())
    console.log('  ruas vistas (rua:cartas na mesa):', vistas.join(' -> '))
    console.log('  faixa no river:', JSON.stringify(await lerFaixa()))
  }
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
