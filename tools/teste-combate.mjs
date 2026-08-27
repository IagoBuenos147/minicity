// Teste do que a wave 6 pediu de combate: pegar o revolver, o NPC da mercearia
// adoecer e virar zumbi, e a arma matar com 1 tiro na cabeca ou 3 no corpo.
//
//   node tools/teste-combate.mjs      (precisa do dev server em pe)
//
// Sai com codigo 1 se algum caso falhar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { garantirServidor } from './servidor-dev.mjs'

const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)
function findBrowser() {
  for (const p of CANDIDATES) if (p && fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-combate-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
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

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log((ok ? 'OK   ' : 'FALHA') + '  ' + name + (detail ? '  -> ' + detail : ''))
}

const browser = await puppeteer.connect({ browserWSEndpoint: await waitForDebugger() })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  page.setDefaultTimeout(120000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' && !/favicon|404|WebSocket/i.test(t)) errors.push(t)
  })

  await garantirServidor(URL_BASE)

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })
  await page.evaluate(() => {
    const G = window.__game
    try { G.engine.setPostEnabled(false) } catch (e) { void e }
    G.renderer.setSize(320, 240, false)
    G.camera.aspect = 320 / 240
    G.camera.updateProjectionMatrix()
    G.renderer.shadowMap.enabled = false
  })

  // roda N quadros de verdade (com teto por relogio pra nao travar)
  const step = (n, before) => page.evaluate((n, before) => new Promise((res) => {
    const G = window.__game
    if (before) new Function('G', before)(G)
    let i = 0
    const t0 = performance.now()
    const f = () => {
      if (++i >= n || performance.now() - t0 > 12000) return res(i)
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), n, before || null)

  // --- 1) o revolver esta no mundo e da pra pegar ---------------------------
  const noMundo = await page.evaluate(() => {
    const G = window.__game
    const it = G.interaction.items.find((i) => i.id === 'revolver')
    const p = G.revolver.grupoNoMundo ? G.revolver.grupoNoMundo.position : null
    return { tem: !!it, label: it && it.label, x: p && +p.x.toFixed(2), z: p && +p.z.toFixed(2), balas: G.revolver.balas }
  })
  check('revolver esta no cenario', noMundo.tem, noMundo.label + ' em ' + noMundo.x + ',' + noMundo.z)
  check('tambor com 6 balas', noMundo.balas === 6, 'balas=' + noMundo.balas)

  await step(30, [
    'const p = G.revolver.grupoNoMundo.position',
    'G.player.position.set(p.x, G.groundY(p.x, p.z), p.z + 0.8)',
  ].join('\n'))
  const pego = await page.evaluate(() => {
    const G = window.__game
    const it = G.interaction.items.find((i) => i.id === 'revolver')
    it.onInteract(G)
    return { equipado: G.revolver.equipado, slot: G.hotbar.selecionado }
  })
  check('pegar o revolver equipa na mao', pego.equipado === true)
  check('revolver ocupa o slot 4 da barra', pego.slot === 3, 'slot=' + pego.slot)

  // --- 2) o NPC da mercearia adoece e vira zumbi ----------------------------
  const npc = await page.evaluate(() => {
    const G = window.__game
    const it = G.interaction.items.find((i) => i.id === 'zumbi-npc')
    return { tem: !!it, label: it && it.label, estado: G.zumbi.estado }
  })
  check('NPC da porta da mercearia existe', npc.tem, npc.label)
  check('comeca sao', npc.estado === 'sao', 'estado=' + npc.estado)

  await page.evaluate(() => {
    const G = window.__game
    const p = G.zumbi.grupo.position
    G.player.position.set(p.x, G.groundY(p.x, p.z), p.z + 1.6)
    G.interaction.items.find((i) => i.id === 'zumbi-npc').onInteract(G)
  })
  const adoecendo = await page.evaluate(() => window.__game.zumbi.estado)
  check('E faz ele dizer que nao esta bem', adoecendo === 'adoecendo', 'estado=' + adoecendo)

  // 10 s de contagem. Em headless o rAF e lento, entao empurramos o relogio do
  // proprio modulo em passos de dt em vez de esperar 10 s de parede.
  const virou = await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    let t = 0
    const f = () => {
      G.zumbi.atualizar(0.25); t += 0.25
      if (G.zumbi.estado === 'zumbi' || t > 20) return res({ estado: G.zumbi.estado, t: +t.toFixed(1) })
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }))
  check('vira zumbi por volta dos 10 s', virou.estado === 'zumbi', 'virou em ' + virou.t + 's')

  // --- 3) o zumbi persegue --------------------------------------------------
  const persegue = await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    const p = G.zumbi.grupo.position
    G.player.position.set(p.x + 6, G.groundY(p.x + 6, p.z), p.z)
    const d0 = Math.hypot(p.x - G.player.position.x, p.z - G.player.position.z)
    let i = 0
    const f = () => {
      G.zumbi.atualizar(0.1)
      if (++i < 40) return requestAnimationFrame(f)
      const d1 = Math.hypot(G.zumbi.grupo.position.x - G.player.position.x, G.zumbi.grupo.position.z - G.player.position.z)
      res({ d0: +d0.toFixed(2), d1: +d1.toFixed(2) })
    }
    requestAnimationFrame(f)
  }))
  check('o zumbi vem pra cima do jogador', persegue.d1 < persegue.d0 - 0.5, persegue.d0 + 'm -> ' + persegue.d1 + 'm')

  // --- 4) o dano: 3 no corpo, 1 na cabeca -----------------------------------
  const corpo = await page.evaluate(async () => {
    const G = window.__game
    G.zumbi.virarZumbi()
    await Promise.resolve()
    const r = []
    // o modulo troca de estado pelo caminho da rede (no modo local, um
    // microtask depois), entao le-se DEPOIS de dar essa volta
    for (let i = 0; i < 3; i++) {
      G.zumbi.levarTiro('corpo', {})
      await Promise.resolve(); await Promise.resolve()
      r.push({ estado: G.zumbi.estado, vida: G.zumbi.vida })
    }
    return { r }
  })
  const est = corpo.r.map((x) => x.estado)
  check('3 tiros no corpo matam', est[2] === 'morto', est.join(' -> '))
  check('1 e 2 tiros no corpo NAO matam', est[0] === 'zumbi' && est[1] === 'zumbi',
    'vida ' + corpo.r.map((x) => x.vida).join(' -> '))

  // Morto nao ressuscita (e proposital: aplicarEstado ignora sair de 'morto'),
  // entao o tiro na cabeca precisa de um zumbi novo — recarrega a pagina.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })
  await page.evaluate(() => {
    const G = window.__game
    try { G.engine.setPostEnabled(false) } catch (e) { void e }
    G.renderer.setSize(320, 240, false)
    G.renderer.shadowMap.enabled = false
  })
  const cabeca = await page.evaluate(async () => {
    const G = window.__game
    G.zumbi.virarZumbi()
    await Promise.resolve(); await Promise.resolve()
    const a = G.zumbi.estado
    G.zumbi.levarTiro('cabeca', {})
    await Promise.resolve(); await Promise.resolve()
    return { antes: a, depois: G.zumbi.estado }
  })
  check('1 tiro na cabeca mata', cabeca.antes === 'zumbi' && cabeca.depois === 'morto',
    cabeca.antes + ' -> ' + cabeca.depois)

  // --- 4b) O TIRO DE VERDADE, pelo raycast ----------------------------------
  // Os casos acima chamam levarTiro() na mao, o que prova a CONTA do dano mas
  // pula justamente o caminho que quebra: mirar, tracar o raio, decidir o que
  // foi atingido. Foi assim que passou batido um semTiro na raiz do zumbi, que
  // apagava o corpo inteiro do raycast — dano certo, arma que nunca acerta.
  // Este caso atira de verdade e olha o resultado.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })
  await page.evaluate(() => {
    const G = window.__game
    try { G.engine.setPostEnabled(false) } catch (e) { void e }
    G.renderer.setSize(320, 240, false)
    G.renderer.shadowMap.enabled = false
  })

  const mira = await page.evaluate(async () => {
    const G = window.__game
    G.zumbi.virarZumbi()
    await Promise.resolve(); await Promise.resolve()

    // fica de frente pro zumbi, a 4 m, com a camera na altura do peito dele
    const z = G.zumbi.grupo.position
    G.player.teleport(z.x, z.z + 4, Math.PI)          // olhando pro -Z... ajustado abaixo
    // aponta a camera para o alvo, sem depender da convencao de yaw
    const alvoCabeca = G.zumbi.grupo.userData.ponto ? null : null
    void alvoCabeca
    await new Promise((r) => requestAnimationFrame(r))

    G.revolver.equipar()
    for (let k = 0; k < 6; k++) G.revolver.atualizar(0.1)

    // o que o raio encontra quando aponto pro peito do zumbi?
    const alvo = G.zumbi.grupo.position.clone()
    alvo.y += 1.25
    G.camera.lookAt(alvo)
    G.camera.updateMatrixWorld(true)

    const antes = G.zumbi.vida
    const acertos = []
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 8; k++) G.revolver.atualizar(0.1)
      G.camera.lookAt(alvo)
      G.camera.updateMatrixWorld(true)
      G.revolver.atirar()
      await Promise.resolve(); await Promise.resolve()
      acertos.push({ vida: G.zumbi.vida, estado: G.zumbi.estado })
    }
    return { antes, acertos, balas: G.revolver.balas }
  })
  const perdeuVida = mira.acertos.length > 0 && mira.acertos[0].vida < mira.antes
  check('atirar de VERDADE (raycast) acerta o zumbi', perdeuVida,
    'vida ' + mira.antes + ' -> ' + mira.acertos.map((a) => a.vida).join(','))
  check('3 tiros de verdade no corpo derrubam o zumbi',
    mira.acertos[2] && mira.acertos[2].estado === 'morto',
    mira.acertos.map((a) => a.estado).join(' -> '))

  // --- 5) recarga: 6 balas, municao infinita --------------------------------
  const municao = await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    if (!G.revolver.equipado) G.revolver.equipar()
    // o caso anterior atirou de verdade: comeca do tambor CHEIO, senao a
    // sequencia esperada 5,4,3,2,1,0 mede o resto do teste passado
    G.revolver.recarregar()
    // esperar as BALAS nao basta: o tambor ainda esta aberto quando a sexta
    // entra, e atirar de tambor aberto e recusado de proposito
    for (let k = 0; k < 90 && (G.revolver.balas < 6 || G.revolver.recarregando); k++) {
      G.revolver.atualizar(0.1)
    }
    const seq = []
    // CADENCIA: dois tiros no mesmo quadro sao recusados de proposito, entao
    // o relogio da arma anda entre um e outro.
    for (let i = 0; i < 6; i++) {
      for (let k = 0; k < 6; k++) G.revolver.atualizar(0.1)
      G.revolver.atirar()
      seq.push(G.revolver.balas)
    }
    for (let k = 0; k < 6; k++) G.revolver.atualizar(0.1)
    G.revolver.atirar()
    const semBala = G.revolver.balas
    G.revolver.recarregar()
    let t = 0
    const f = () => {
      G.revolver.atualizar(0.1); t += 0.1
      if (G.revolver.balas === 6 || t > 8) return res({ seq, semBala, depois: G.revolver.balas, t: +t.toFixed(1) })
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }))
  check('cada tiro gasta 1 bala', municao.seq.join(',') === '5,4,3,2,1,0', municao.seq.join(','))
  check('tambor vazio nao dispara', municao.semBala === 0)
  check('recarrega de volta pra 6 (bala infinita)', municao.depois === 6, 'em ' + municao.t + 's')

  // --- 6) o tiro nao acerta os proprios efeitos -----------------------------
  const efeitos = await page.evaluate(() => {
    const G = window.__game
    let semTiro = 0, total = 0
    G.scene.traverse((o) => { if (o.isMesh) { total++; if (o.userData.semTiro) semTiro++ } })
    return { semTiro, total }
  })
  check('efeitos marcados como nao-alvo', efeitos.semTiro > 0, efeitos.semTiro + ' de ' + efeitos.total + ' meshes')

  await step(30)
  check('sem erro de console durante o combate', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}

const bad = results.filter((r) => !r.ok).length
console.log('\n' + (results.length - bad) + '/' + results.length + ' casos passaram')
process.exit(bad ? 1 : 0)
