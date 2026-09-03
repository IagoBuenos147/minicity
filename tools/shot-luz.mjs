// Fotos + MEDIDA da luz das mesas do cassino. Salva em shots/luz-*.png.
//
//   node tools/shot-luz.mjs
//
// Por que este arquivo existe em vez de olhar a foto: "as letras do feltro
// estao estourando" e uma frase sobre PIXEL, nao sobre gosto. Aqui a gente le
// o pixel. Pra cada decalque de regra impressa no pano (o material dele leva
// um .name proprio em world/casino.js exatamente pra isto) projetamos a caixa
// do mesh na tela e medimos a luminancia MAXIMA e a media do topo 1% dentro
// dela — a maxima sozinha pega um pixel de carta que passou por cima.
//
// E medimos DUAS vezes, com e sem o UnrealBloomPass, porque as duas causas do
// branco estourado sao diferentes e se consertam em lugares diferentes:
//   sem bloom alto  -> a TINTA e clara demais (arruma-se no material)
//   so com bloom alto -> a tinta passou do threshold 0.85 e o halo e o bloom
//                        somando em cima dela (arruma-se baixando a tinta ate
//                        ela caber embaixo do threshold)

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
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-luz-' + PORT),
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
// No padrao (180 s) a primeira foto ja estourava.
const browser = await puppeteer.connect({
  browserWSEndpoint: await waitForDebugger(), protocolTimeout: 600000,
})
const dir = path.join(ROOT, 'shots')
fs.mkdirSync(dir, { recursive: true })

// --- o medidor, injetado na pagina ----------------------------------------
// Roda tudo dentro de UM evaluate por leitura: render() e drawImage tem que
// acontecer na MESMA tarefa, senao o navegador ja trocou o buffer de desenho
// (o renderer nao usa preserveDrawingBuffer) e o canvas 2D copia preto.
const MEDIDOR = `
window.__luz = {
  // luminancia perceptual em 0..255, na imagem JA tonemapeada (o que o olho ve)
  lum(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b },

  // caixa na tela (px) do mesh cujo material se chama 'nome'
  caixa(nome) {
    const G = window.__game
    let alvo = null
    G.scene.traverse((o) => {
      if (alvo || !o.isMesh || !o.visible) return
      const m = o.material
      if (m && m.name === nome) alvo = o
    })
    if (!alvo) return null
    this.__dbg = { nome: alvo.name, tipo: alvo.type }
    const geo = alvo.geometry
    if (!geo.boundingBox) geo.computeBoundingBox()
    const bb = geo.boundingBox
    const cam = G.camera
    cam.updateMatrixWorld()
    alvo.updateMatrixWorld()
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    const w = window.innerWidth, h = window.innerHeight
    for (let i = 0; i < 8; i++) {
      const p = alvo.localToWorld(new alvo.position.constructor(
        i & 1 ? bb.max.x : bb.min.x,
        i & 2 ? bb.max.y : bb.min.y,
        i & 4 ? bb.max.z : bb.min.z,
      ))
      p.project(cam)
      const sx = (p.x * 0.5 + 0.5) * w, sy = (-p.y * 0.5 + 0.5) * h
      if (sx < x0) x0 = sx
      if (sy < y0) y0 = sy
      if (sx > x1) x1 = sx
      if (sy > y1) y1 = sy
    }
    this.__dbg.bb = [bb.min.toArray().map((v) => +v.toFixed(2)), bb.max.toArray().map((v) => +v.toFixed(2))]
    this.__dbg.crua = [+x0.toFixed(1), +y0.toFixed(1), +x1.toFixed(1), +y1.toFixed(1)]
    this.__dbg.cam = cam.position.toArray().map((v) => +v.toFixed(2))
    return { x0: Math.max(0, x0 | 0), y0: Math.max(0, y0 | 0), x1: Math.min(w, Math.ceil(x1)), y1: Math.min(h, Math.ceil(y1)) }
  },

  // le a tela e devolve estatistica dentro da caixa
  ler(cx) {
    const G = window.__game
    G.engine.render()
    const src = G.renderer.domElement
    const ex = src.width / window.innerWidth, ey = src.height / window.innerHeight
    const x = Math.round(cx.x0 * ex), y = Math.round(cx.y0 * ey)
    const w = Math.max(1, Math.round((cx.x1 - cx.x0) * ex))
    const h = Math.max(1, Math.round((cx.y1 - cx.y0) * ey))
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })
    g.drawImage(src, x, y, w, h, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h).data
    const lums = []
    let max = 0, estourados = 0
    for (let i = 0; i < d.length; i += 4) {
      const l = this.lum(d[i], d[i + 1], d[i + 2])
      lums.push(l)
      if (l > max) max = l
      if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) estourados++
    }
    lums.sort((a, b) => b - a)
    const n1 = Math.max(1, (lums.length * 0.01) | 0)
    let s = 0
    for (let i = 0; i < n1; i++) s += lums[i]
    return {
      max: +max.toFixed(1),
      top1: +(s / n1).toFixed(1),
      brancos: +(100 * estourados / (d.length / 4)).toFixed(2),
      px: d.length / 4,
    }
  },

  // As PONTAS do decalque, esquerda e direita.
  //
  // A caixa inteira nao mede a TINTA: a mao viva do jogador pousa no meio da
  // frase e as cartas sao quase brancas (material de cassino/cartas-3d.js, que
  // nao e deste trabalho). O maximo da caixa cheia acaba sendo a carta. Nas
  // duas pontas, que a carta nao cobre, so ha letra e pano.
  pontas(cx) {
    const w = cx.x1 - cx.x0
    return [
      { x0: cx.x0, y0: cx.y0, x1: Math.round(cx.x0 + w * 0.26), y1: cx.y1 },
      { x0: Math.round(cx.x1 - w * 0.26), y0: cx.y0, x1: cx.x1, y1: cx.y1 },
    ]
  },

  // mede com e sem bloom no mesmo enquadramento
  medir(nome) {
    const cx = this.caixa(nome)
    if (!cx) return { nome, erro: 'material ' + nome + ' nao achado na cena' }
    const bp = window.__game.engine.bloomPass
    const pts = this.pontas(cx)
    const junta = (a, b) => ({
      max: Math.max(a.max, b.max),
      top1: +Math.max(a.top1, b.top1).toFixed(1),
      brancos: +Math.max(a.brancos, b.brancos).toFixed(2),
    })
    const com = this.ler(cx)
    const tintaCom = junta(this.ler(pts[0]), this.ler(pts[1]))
    let sem = null, tintaSem = null
    if (bp) {
      bp.enabled = false
      sem = this.ler(cx)
      tintaSem = junta(this.ler(pts[0]), this.ler(pts[1]))
      bp.enabled = true
    }
    return { nome, caixa: cx, com, sem, tintaCom, tintaSem, dbg: this.__dbg }
  },
}
`

const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const relatorio = []

/**
 * Uma ABA POR CENA, e nao uma aba pra sessao inteira. Abrir mesa, fechar,
 * andar e abrir a outra numa aba so derrubava o contexto no meio (o cassino
 * inteiro num renderizador de software come memoria demais). Recarregar entre
 * as cenas custa 20 s e sempre termina.
 */
async function sessao(rotulo, corpo) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('  [erro pagina]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [browser]', m.text()) })
  console.log('cena: ' + rotulo)
  try {
    await page.setViewport({ width: 1280, height: 720 })
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 90000 })
    await page.evaluate(MEDIDOR)

    // Todo evaluate da cena passa por aqui. O vite manda full-reload de vez em quando
    // (a aba anterior deixou o cliente dele acordado) e, sem esta espera, o
    // proximo evaluate cai num window.__game undefined no meio da corrida.
    const ev = async (fn, arg) => {
      for (let i = 0; ; i++) {
        try {
          await page.waitForFunction('window.__game && window.__game.cassino', { timeout: 90000 })
          if (!await page.evaluate(() => !!window.__luz)) await page.evaluate(MEDIDOR)
          return await page.evaluate(fn, arg)
        } catch (e) {
          // a navegacao pode cair ENTRE o waitForFunction e o evaluate: nao ha
          // como esperar isso, so como tentar de novo.
          if (i >= 4) throw e
          await espera(2000)
        }
      }
    }
    const shot = async (name) => {
      const f = path.join(dir, 'luz-' + name + '.png')
      await page.screenshot({ path: f })
      console.log('  foto: ' + f)
    }
    const medir = async (nomes, quando) => {
      const r = await ev((ns) => ns.map((n) => window.__luz.medir(n)), nomes)
      for (const m of r) {
        if (m.erro) { console.log('  ' + rotulo + ' / ' + m.erro); continue }
        console.log('  ' + (quando || '') + ' ' + rotulo + ' / ' + m.nome
          + '  caixa toda: COM bloom max=' + m.com.max + ' top1%=' + m.com.top1
          + ' | SEM bloom max=' + m.sem.max + ' top1%=' + m.sem.top1)
        console.log('    SO A TINTA (pontas, sem carta em cima): COM bloom max=' + m.tintaCom.max
          + ' top1%=' + m.tintaCom.top1 + ' brancos=' + m.tintaCom.brancos + '%'
          + ' | SEM bloom max=' + m.tintaSem.max + ' top1%=' + m.tintaSem.top1)
        relatorio.push({ rotulo, quando: quando || '', ...m })
      }
    }

    // menu fora, bolso cheio, HUD de tutorial/ajuda fora do caminho da foto
    await ev(() => {
      const G = window.__game
      G.fluxo.jogar()
      G.carteira.ganharOuro(20000)
      G.carteira.ganharFichas(20000)
      G.hud.showHelp(false)
      for (const e of document.querySelectorAll('div[class*="mcrp-tut"]')) e.style.display = 'none'
    })
    await espera(1500)
    await corpo(ev, shot, medir, page)
  } finally {
    try { await page.close() } catch (err) { void err }
  }
}

/**
 * Espera a camera ATERRISSAR na mesa.
 *
 * Nao basta comparar duas leituras de posicao: em swiftshader o jogo anda a
 * 2 fps e duas leituras a 600 ms de distancia caem no MESMO quadro, entao a
 * camera "parada" era so uma camera que nao tinha andado ainda — e a foto saia
 * no meio da viagem, olhando pra parede. Aqui a leitura so conta se o
 * renderer desenhou quadro novo desde a anterior, e sao precisas TRES leituras
 * seguidas paradas.
 */
async function esperarCamera(ev, alvo, max = 60) {
  let ant = null, quietas = 0
  for (let i = 0; i < max; i++) {
    const p = await ev(() => {
      const c = window.__game.camera
      return [c.position.x, c.position.y, c.position.z, window.__game.renderer.info.render.frame]
    })
    // quadro que ANDOU PRA TRAS = o vite recarregou a pagina no meio: a cena
    // voltou pro spawn e nao adianta continuar esperando esta viagem.
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
 * MODO ANTIGO: devolve a mesa ao estado de antes deste trabalho, EM TEMPO DE
 * EXECUCAO, so pra a medida do "antes" sair no mesmo enquadramento e com a
 * mesma regua do "depois". Sem isto o antes e o depois vinham de duas fotos
 * com a camera em lugares diferentes e o numero nao comparava nada.
 *
 * Duas coisas voltam:
 *   - as duas PointLight do salao (165/38 e 95/26, os valores antigos);
 *   - a cor da tinta. Ela esta ASSADA no canvas do decalque, entao nao da pra
 *     reescreve-la aqui; o que da e multiplicar o map pelo quanto a tinta
 *     antiga era mais clara, canal a canal, em espaco LINEAR — que e onde
 *     material.color entra no shader. Os fatores sao a razao entre as
 *     luminancias lineares de #f0e4b8 / #a89a6d (creme) e #cfe0f5 / #8f9bb0
 *     (azul), com emissiveIntensity de volta pros 0.12 originais.
 */
const TINTA_ANTIGA = {
  'feltro-regra-bj1': [2.216, 2.405, 3.124],
  'feltro-regra-bj2': [2.216, 2.405, 3.124],
  'feltro-regra-pk': [2.262, 2.278, 2.101],
}
async function modoAntigo(ev, ligar, tabela) {
  return ev((arg) => {
    const G = window.__game
    const v = new G.camera.position.constructor()
    const luzes = []
    G.scene.traverse((o) => {
      if (!o.isPointLight) return
      o.getWorldPosition(v)
      if (v.x > 14.3 && v.x < 33.7 && v.z > 12.3 && v.z < 29.7 && v.y > 2) luzes.push(o)
    })
    luzes.sort((a, b) => b.intensity - a.intensity)
    const mats = []
    G.scene.traverse((o) => {
      if (o.isMesh && o.material && /^feltro-regra/.test(o.material.name)) mats.push(o.material)
    })
    if (arg.ligar) {
      if (luzes[0]) { luzes[0].intensity = 165; luzes[0].distance = 38 }
      if (luzes[1]) { luzes[1].intensity = 95; luzes[1].distance = 26 }
      for (const m of mats) {
        const f = arg.tabela[m.name]
        if (f) m.color.setRGB(f[0], f[1], f[2])
        m.emissiveIntensity = 0.12
      }
    } else {
      if (luzes[0]) { luzes[0].intensity = 118; luzes[0].distance = 30 }
      if (luzes[1]) { luzes[1].intensity = 74; luzes[1].distance = 22 }
      for (const m of mats) { m.color.setRGB(1, 1, 1); m.emissiveIntensity = 0.03 }
    }
    return { luzes: luzes.length, decalques: mats.length }
  }, { ligar, tabela })
}

/** Senta na mesa e CONFERE que a camera chegou; se o vite recarregou no meio,
 *  refaz. Sem isto a foto do poker saia do outro lado do salao. */
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
    const r = await esperarCamera(ev, alvo)
    console.log('  camera em ' + r.pos.join(', ') + ' (a ' + r.dist + ' m do centro da mesa)')
    if (r.dist !== null && r.dist < raioOk) return r
    console.log('  camera longe demais; refazendo')
  }
  return null
}

try {
  await garantirServidor(URL_BASE)

  // 1) O SALAO ANDANDO. Existe pra provar que escurecer em volta das mesas nao
  // apagou o cassino: quem passeia tem que enxergar o caminho.
  await sessao('salao', async (ev, shot, _m, page) => {
    await ev(() => {
      const G = window.__game
      G.player.setMode('third')
      G.player.teleport(24.0, 16.4, 0)
    })
    await page.mouse.move(640, 360)
    await espera(3000)
    await shot('01-salao-entrada')
    await ev(() => window.__game.player.teleport(24.4, 27.2, 0))
    await espera(3000)
    await shot('02-salao-fundo')
    await ev(() => window.__game.player.teleport(17.5, 21.0, 0))
    await espera(3000)
    await shot('03-salao-slots')
  })

  // 2) POKER, enquadramento de quem senta
  await sessao('poker', async (ev, shot, medir, page) => {
    await sentar(ev, page, 'poker', 'abrirPoker', [28.8, 23.2], 3.2)
    await espera(4000)

    // ANTES: mesmo enquadramento, luz e tinta antigas
    console.log('  modo antigo:', JSON.stringify(await modoAntigo(ev, true, TINTA_ANTIGA)))
    await espera(2500)
    await shot('04a-poker-antes')
    await medir(['feltro-regra-pk'], 'ANTES ')
    await modoAntigo(ev, false, TINTA_ANTIGA)
    await espera(2500)
    await shot('04-poker')
    await medir(['feltro-regra-pk'], 'DEPOIS')
  })

  // 3) BLACKJACK, e a MAO REPARTIDA logo depois.
  //
  // A mao repartida nao e capricho: e o quadro em que a outra sessao viu uma
  // faixa horizontal de borda dura atravessando o pano. Aqui ela e fotografada
  // duas vezes, com e SEM o sol da cidade, porque a suspeita e que a borda
  // dura seja o limite do shadow map da DirectionalLight — fora da caixa dele
  // o `getShadow()` devolve 1 e o sol acende o feltro de uma vez so.
  await sessao('blackjack', async (ev, shot, medir, page) => {
    await sentar(ev, page, 'blackjack', 'abrirBlackjack', [20.0, 24.2], 3.6)
    await espera(4000)

    console.log('  modo antigo:', JSON.stringify(await modoAntigo(ev, true, TINTA_ANTIGA)))
    await espera(2500)
    await shot('05a-blackjack-antes')
    await medir(['feltro-regra-bj1'], 'ANTES ')
    await modoAntigo(ev, false, TINTA_ANTIGA)
    await espera(2500)
    await shot('05-blackjack')
    await medir(['feltro-regra-bj1'], 'DEPOIS')

    const btn = await ev(() => {
      const bs = [...document.querySelectorAll('.mcrp-mesa-btn')]
      const b = bs.find((x) => x.offsetParent && !x.disabled && /DISTRIBUIR/.test(x.textContent.toUpperCase()))
      if (b) { b.click(); return b.textContent.trim() }
      return null
    })
    console.log('  clique:', btn)
    await espera(9000)
    await shot('06-blackjack-mao')

    // VARREDURA DO RELOGIO. O sol da cidade e uma DirectionalLight com sombra,
    // e o feltro recebe sombra: se em algum horario o sol alcanca a mesa, ele
    // passa por cima do poco de luz e pinta uma faixa de borda dura no pano
    // (a borda e o limite da sombra de alguma peca da casca). Aqui a gente
    // mede o pano num retangulo fixo hora a hora em vez de torcer.
    const varredura = await ev(() => {
      const G = window.__game
      G.lighting.pauseCycle = true
      const cx = { x0: 760, y0: 290, x1: 900, y1: 370 }   // so pano, sem carta
      const out = []
      for (let i = 0; i < 24; i++) {
        const t = i / 24
        G.lighting.setTimeOfDay(t)
        const s = window.__luz.ler(cx)
        out.push([+t.toFixed(3), s.max, s.top1])
      }
      return out
    })
    let pior = varredura[0]
    for (const v of varredura) if (v[2] > pior[2]) pior = v
    console.log('  pano hora a hora (t, max, top1%):')
    console.log('   ', varredura.map((v) => v[0] + ':' + v[2]).join('  '))
    console.log('  pior hora: t=' + pior[0] + ' top1%=' + pior[2])
    await ev((t) => { window.__game.lighting.setTimeOfDay(t) }, pior[0])
    await espera(2500)
    await shot('07-blackjack-pior-hora')
    await ev(() => { window.__game.lighting.pauseCycle = false })

    // A TINTA NAO PODE FURAR O PLANO DE LUZ DA MESA.
    //
    // Reproduz o defeito relatado pela outra sessao: um plano transparente
    // BRILHANTE logo acima do pano (que e como cassino/mesa-3d.js acende o
    // feltro). Se o decalque da regra escrever profundidade, ele rejeita esse
    // plano e abre uma faixa retangular de borda dura na mesa. Aqui o plano
    // falso e um clone do proprio tampo, entao tem o formato exato do feltro.
    const achou = await ev(() => {
      const G = window.__game
      let tampo = null
      G.scene.traverse((o) => { if (!tampo && o.isMesh && o.material && o.material.name === 'feltro-verde') tampo = o })
      if (!tampo) return false
      const falso = tampo.clone()
      falso.material = tampo.material.clone()
      falso.material.map = null
      falso.material.color.setHex(0x000000)
      falso.material.emissive.setHex(0xffa860)
      falso.material.emissiveIntensity = 2.4
      falso.material.transparent = true
      falso.material.depthWrite = false
      falso.material.blending = 2          // THREE.AdditiveBlending
      falso.material.needsUpdate = true
      falso.position.y += 0.005            // ENTRE o feltro e o decalque
      falso.name = 'luz-falsa'
      tampo.parent.add(falso)
      return true
    })
    console.log('  plano de luz falso:', achou)
    await espera(2500)
    await shot('08-bj-plano-de-luz')

    await ev(() => {
      window.__game.scene.traverse((o) => {
        if (o.isMesh && o.material && /^feltro-regra/.test(o.material.name)) o.material.depthWrite = true
      })
    })
    await espera(2500)
    await shot('09-bj-plano-de-luz-com-o-defeito')
    await ev(() => {
      const G = window.__game
      G.scene.traverse((o) => {
        if (o.isMesh && o.material && /^feltro-regra/.test(o.material.name)) o.material.depthWrite = false
      })
      const f = G.scene.getObjectByName('luz-falsa')
      if (f && f.parent) f.parent.remove(f)
    })
  })

  const saida = path.join(os.tmpdir(), 'luz-medida.json')
  fs.writeFileSync(saida, JSON.stringify(relatorio, null, 1))
  console.log('medidas em ' + saida)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
