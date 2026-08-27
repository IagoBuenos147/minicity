// Teste de fumaca do jogo rodando de verdade no navegador: movimento, colisao,
// altura do chao, troca de camera, interacoes e o painel de customizacao.
//
//   node tools/smoke.mjs        (precisa do dev server em pe: npm run dev)
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
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function findBrowser() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const PORT = 9333 + (process.pid % 500)
const child = spawn(findBrowser(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-smoke-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
  'about:blank',
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
  results.push({ name, ok, detail })
  console.log((ok ? 'OK   ' : 'FALHA') + '  ' + name + (detail ? '  -> ' + detail : ''))
}

const browser = await puppeteer.connect({ browserWSEndpoint: await waitForDebugger() })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  // O headless renderiza por software: um evaluate que espera quadros pode
  // passar bem dos 30 s padrao do puppeteer sem que nada esteja errado.
  page.setDefaultTimeout(120000)
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    const t = m.text()
    // O dev server do Vite nao tem o WebSocket do jogo: o cliente tenta,
    // falha e cai no modo sozinho — que e o comportamento desejado. Esse erro
    // de console e esperado AQUI (o online tem teste proprio: teste-online.mjs).
    if (m.type() === 'error' && !/favicon|404|WebSocket/i.test(t)) errors.push(t)
  })

  // domcontentloaded, nao networkidle2: o cliente abre um WebSocket assim que
  // carrega, entao a rede nunca fica ociosa e o networkidle2 estoura o tempo
  // mesmo com a pagina funcionando.
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction('window.__game && window.__game.scene', { timeout: 60000 })

  // O headless renderiza por software e o cenario e pesado: sem isso o laco
  // fica em ~2 fps e cada evaluate que espera quadros estoura os 30 s de
  // timeout. O que se testa aqui e a LOGICA (colisao, chao, camera, interacao),
  // nao o desempenho grafico -- esse e medido no fim, em separado.
  await page.evaluate(() => {
    const G = window.__game
    try { G.engine.setPostEnabled(false) } catch (e) { void e }
    G.renderer.setSize(320, 240, false)
    G.camera.aspect = 320 / 240
    G.camera.updateProjectionMatrix()
    G.renderer.shadowMap.enabled = false
  })

  // helper: roda N frames do loop de verdade
  const step = (n, before) => page.evaluate((n, before) => new Promise((res) => {
    const G = window.__game
    if (before) new Function('G', before)(G)
    let i = 0
    const t0 = performance.now()
    // teto por relogio: numa maquina lenta esperar N quadros pode nunca acabar
    const f = () => {
      if (++i >= n || performance.now() - t0 > 8000) return res(i)
      requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), n, before || null)

  // 1) cena montada
  const scene = await page.evaluate(() => {
    const G = window.__game
    let nan = 0, lights = 0, shadow = 0, luzCara = 0
    G.scene.traverse((o) => {
      if (o.isLight) {
        lights++
        if (o.castShadow) shadow++
        // AmbientLight nao entra na permutacao de shader do three: ela vira uma
        // soma de cor num uniforme e nao custa laco por fragmento. Direcional,
        // ponto, foco e hemisferio custam. O orcamento que importa e o das
        // CARAS -- contar a ambiente junto so faz o numero subir sem que a
        // conta de GPU mude.
        if (!o.isAmbientLight) luzCara++
      }
      if (o.isMesh) {
        const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position
        if (p) { const a = p.array; for (let i = 0; i < a.length; i++) if (!isFinite(a[i])) { nan++; break } }
      }
    })
    return { nan, lights, luzCara, shadow, colliders: G.collision.count, inter: G.interaction.items.map((i) => i.id) }
  })
  check('sem geometria NaN', scene.nan === 0, 'nan=' + scene.nan)
  check('so o sol projeta sombra', scene.shadow === 1, 'luzes com sombra=' + scene.shadow)
  /* 21 luzes CARAS: 2 direcionais + 1 hemisferio + 18 pontuais (2 do pool de
     efeito, 8 dos postes de rua, 3 da barbearia, 3 da mercearia, 2 do salao do
     cassino). O teto era 20 contando TODAS; subiu com o cassino, que e um
     salao de 19 x 17 m sem uma janela virada pro sol — com uma luz so, o canto
     das caca-niqueis e o balcao do caixa ficavam pretos, porque o emissivo do
     neon acende o proprio neon e nao a parede na frente dele. Duas para o
     predio inteiro continua sendo menos por metro quadrado do que a barbearia
     gasta. Se este numero voltar a subir, o caminho NAO e subir o teto de novo:
     e trocar luz por emissivo, que e o que o resto do jogo faz. */
  check('orcamento de luzes caras <= 21', scene.luzCara <= 21,
    'caras=' + scene.luzCara + ' (total com as ambientes=' + scene.lights + ')')
  check('colisores registrados', scene.colliders > 100, String(scene.colliders))
  for (const id of ['barber-talk', 'barber-chair', 'barber-mirror', 'grocery-clerk', 'grocery-buy']) {
    check('interacao "' + id + '" existe', scene.inter.includes(id))
  }

  // 2) altura do chao acompanha calcada / loja
  const ground = await page.evaluate(() => {
    const G = window.__game
    const at = (x, z) => { G.player.teleport(x, z, 0); for (let i = 0; i < 40; i++) G.player.update(1 / 60); return +G.player.position.y.toFixed(3) }
    return { rua: at(0, 0), calcada: at(10, -10), loja: at(22, -20), parque: at(-30, 20) }
  })
  check('jogador no nivel da rua', Math.abs(ground.rua - 0) < 0.02, 'y=' + ground.rua)
  check('jogador sobe na calcada', Math.abs(ground.calcada - 0.16) < 0.02, 'y=' + ground.calcada)
  check('jogador no piso da loja', Math.abs(ground.loja - 0.16) < 0.02, 'y=' + ground.loja)
  check('jogador no nivel do parque', Math.abs(ground.parque - 0.11) < 0.02, 'y=' + ground.parque)

  // 3) troca de camera
  const cam = await page.evaluate(() => {
    const G = window.__game
    const a = G.player.mode
    G.player.toggleMode(); for (let i = 0; i < 30; i++) G.player.update(1 / 60)
    const b = G.player.mode
    const posB = G.camera.position.clone()
    G.player.toggleMode(); for (let i = 0; i < 30; i++) G.player.update(1 / 60)
    return { a, b, c: G.player.mode, distB: posB.distanceTo(G.character.root.position) }
  })
  check('V alterna 1a/3a pessoa', cam.a !== cam.b && cam.a === cam.c, cam.a + ' -> ' + cam.b + ' -> ' + cam.c)

  // 4) colisao: andar contra a parede da barbearia nao atravessa
  const wall = await page.evaluate(() => {
    const G = window.__game
    G.player.teleport(22, -20, 0)
    for (let i = 0; i < 30; i++) G.player.update(1 / 60)
    const before = G.player.position.clone()
    // empurra pra dentro da parede dos fundos (z = -28)
    for (let i = 0; i < 200; i++) {
      G.player.position.z -= 0.05
      G.collision.resolve(G.player.position, 0.38)
    }
    return { z: +G.player.position.z.toFixed(2), antes: +before.z.toFixed(2) }
  })
  check('parede da barbearia segura o jogador', wall.z > -28.2, 'z parou em ' + wall.z)

  // 5) interacao com o barbeiro abre o customizador de cabelo
  const inter = await page.evaluate(() => {
    const G = window.__game
    const it = G.interaction.items.find((i) => i.id === 'barber-talk')
    G.player.teleport(it.position.x, it.position.z, 0)
    for (let i = 0; i < 20; i++) G.player.update(1 / 60)
    const found = G.interaction.update(G.player.position)
    const label = found && found.label
    if (found) found.onInteract(G)
    return { label, aberto: G.customizer.isOpen() }
  })
  check('prompt do barbeiro aparece', !!inter.label, inter.label || '(nenhum)')
  check('barbeiro abre o painel de cabelo', inter.aberto === true)

  // 6) trocar aparencia muda o personagem de verdade
  const app = await page.evaluate(() => {
    const G = window.__game
    const conta = () => { let n = 0; G.character.slots.hair.traverse(() => n++); return n }
    const antes = { hair: G.appearance.hair, meshes: conta() }
    G.setAppearance({ hair: 2 })
    const depois = { hair: G.appearance.hair, meshes: conta() }
    G.setAppearance({ eyes: 1, brows: 2, mouth: 2 })
    const cara = { eyes: G.appearance.eyes, brows: G.appearance.brows, mouth: G.appearance.mouth }
    G.setAppearance({ hair: 0, eyes: 0, brows: 0, mouth: 0 })
    return { antes, depois, cara }
  })
  check('trocar cabelo reconstroi o slot',
    app.antes.hair !== app.depois.hair && app.depois.meshes > 1,
    'hair ' + app.antes.hair + ' -> ' + app.depois.hair + ', meshes=' + app.depois.meshes)
  check('trocar olhos/sobrancelha/boca aplica',
    app.cara.eyes === 1 && app.cara.brows === 2 && app.cara.mouth === 2,
    JSON.stringify(app.cara))

  await page.evaluate(() => window.__game.customizer.close())

  // 6b) CAMERA DE 3a PESSOA (o jogador reclamou de varios bugs aqui)
  const cam3 = await page.evaluate(() => {
    const G = window.__game
    G.customizer.close()
    G.player.setMode('third')
    G.player.teleport(2, 9, 0)
    const settle = (n) => { for (let i = 0; i < n; i++) G.player.update(1 / 60) }
    settle(120)

    // a) girar o yaw em campo aberto NAO pode mudar a distancia da camera
    const dists = []
    for (let step = 0; step < 12; step++) {
      G.player.yaw = (step / 12) * Math.PI * 2 - Math.PI
      settle(45)
      dists.push(G.camera.position.distanceTo(G.character.root.position))
    }
    const dMin = Math.min(...dists), dMax = Math.max(...dists)

    // b) pitch limitado: nao da pra virar visao aerea
    G.player.pitch = -3
    const pitchDown = G.player.pitch
    G.player.pitch = 3
    const pitchUp = G.player.pitch
    G.player.pitch = 0
    settle(30)

    // c) a camera fica ATRAS do personagem (do lado oposto ao que ele encara)
    G.player.yaw = 0
    settle(90)
    const cam = G.camera.position, ch = G.character.root.position
    const behind = (cam.z - ch.z) // yaw 0 = personagem olha pra -Z, camera em +Z

    // d) o personagem aparece no quadro (a camera mira nele)
    const v = new (Object.getPrototypeOf(cam).constructor)(ch.x, ch.y + 1.3, ch.z)
    v.project(G.camera)
    return {
      dMin: +dMin.toFixed(2), dMax: +dMax.toFixed(2),
      pitchDown: +pitchDown.toFixed(2), pitchUp: +pitchUp.toFixed(2),
      behind: +behind.toFixed(2),
      ndc: [+v.x.toFixed(2), +v.y.toFixed(2)],
    }
  })
  check('girar a camera nao muda a distancia (campo aberto)',
    cam3.dMax - cam3.dMin < 0.6, 'dist ' + cam3.dMin + '..' + cam3.dMax)
  check('nao da pra virar visao aerea',
    cam3.pitchDown > -1.0 && cam3.pitchUp < 1.0,
    'pitch limitado a ' + cam3.pitchDown + '..' + cam3.pitchUp)
  check('camera fica atras do personagem', cam3.behind > 1.5, 'offset z=' + cam3.behind)
  check('personagem enquadrado', Math.abs(cam3.ndc[0]) < 0.85 && Math.abs(cam3.ndc[1]) < 0.85,
    'ndc=' + cam3.ndc.join(','))

  // 6c) SENTAR (o jogador pediu "ao apertar E sente nos bancos")
  const sit = await page.evaluate(() => {
    const G = window.__game
    const settle = (n) => { for (let i = 0; i < n; i++) G.player.update(1 / 60) }
    const seats = G.interaction.items.filter((i) => i.id.indexOf('seat-') === 0)
    if (!seats.length) return { seats: 0 }
    const it = seats[0]
    G.player.teleport(it.position.x + 0.8, it.position.z + 0.8, 0)
    settle(30)
    const found = G.interaction.update(G.player.position)
    const label = found && found.label
    if (found) found.onInteract(G)
    settle(60)
    const sentado = G.player.sitting
    const alturaOk = Math.abs((G.player.position.y + 0.84) - it.position.y) < 0.12
    G.player.standUp()
    settle(30)
    return { seats: seats.length, label, sentado, alturaOk, levantou: !G.player.sitting }
  })
  check('bancos tem ponto de sentar', sit.seats > 0, sit.seats + ' assentos')
  if (sit.seats) {
    check('E senta no banco', sit.sentado === true, sit.label || '')
    check('quadril pousa no assento', sit.alturaOk === true)
    check('E levanta do banco', sit.levantou === true)
  }

  // 7) o loop roda sem estourar erro por alguns segundos, perto dos NPCs
  await step(120, "G.player.teleport(-25, -18, 0)")
  await step(120, "G.player.teleport(22, -17, 0)")
  check('loop roda perto dos NPCs sem erro', errors.length === 0, errors.slice(0, 3).join(' | '))

  // 7b) clima, neve e cassino ------------------------------------------------
  // Tudo aqui passa pelo LACO DE VERDADE (step), e nao por chamada direta: o
  // que estes casos protegem nao e a funcao isolada, e a fiacao dentro do
  // frame() do main -- que e onde uma tecla vira estacao e a estacao vira neve
  // no chao.
  const tecla = (code) => "window.dispatchEvent(new KeyboardEvent('keydown',{code:'" + code + "'}));"
    + "setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'" + code + "'})),60)"

  const est0 = await page.evaluate(() => window.__game.clima.estacao)
  await step(12, tecla('KeyC'))
  const est1 = await page.evaluate(() => window.__game.clima.estacao)
  await step(12, tecla('KeyC'))
  const est2 = await page.evaluate(() => window.__game.clima.estacao)
  await step(12, tecla('KeyC'))
  const est3 = await page.evaluate(() => window.__game.clima.estacao)
  check('C cicla sol -> chuva -> neve -> sol',
    est0 === 'sol' && est1 === 'chuva' && est2 === 'neve' && est3 === 'sol',
    [est0, est1, est2, est3].join(' -> '))

  // nevando de verdade: a cobertura do chao tem que SUBIR e a neve acumulada
  // tem que sair do esconderijo. Sem esta ponte, nevar so mexe no ceu.
  await step(2, "G.clima.setEstacao('neve'); G.clima.setNeve(1)")
  const nevou = await page.evaluate(() => new Promise((res) => {
    const G = window.__game
    // 12 s de nevasca simulados na mao (o laco real levaria 12 s de relogio)
    for (let i = 0; i < 720; i++) {
      G.clima.atualizar(1 / 60, G.player.position)
      G.neve.setCobertura(G.clima.cobertura)
      G.neve.atualizar(1 / 60)
    }
    res({ cobertura: +G.clima.cobertura.toFixed(3), visivel: G.neve.grupo.visible,
      desenhada: +G.neve.cobertura.toFixed(3) })
  }))
  check('nevar acumula neve no chao', nevou.cobertura > 0.3 && nevou.visivel && nevou.desenhada > 0.2,
    'cobertura=' + nevou.cobertura + ' desenhada=' + nevou.desenhada + ' visivel=' + nevou.visivel)
  await step(4, "G.clima.setEstacao('sol')")

  // o cassino: os cinco pontos de interacao e o piso na altura certa
  const cas = await page.evaluate(() => {
    const G = window.__game
    const ids = G.interaction.items.map((i) => i.id).filter((i) => /^cassino-/.test(i))
    G.player.teleport(24, 20)      // no meio do salao
    return { ids, piso: G.groundY(24, 20), pisoPorta: G.groundY(24, 11.5) }
  })
  for (const id of ['cassino-caixa', 'cassino-blackjack', 'cassino-poker', 'cassino-slot-0']) {
    check('interacao "' + id + '" existe', cas.ids.indexOf(id) >= 0, cas.ids.join(','))
  }
  check('piso do cassino nivelado com a calcada da porta',
    Math.abs(cas.piso - 0.16) < 0.001 && Math.abs(cas.pisoPorta - 0.16) < 0.001,
    'salao=' + cas.piso + ' porta=' + cas.pisoPorta)

  // o painel trava o jogador e o Esc devolve o controle
  await step(6, "G.cassino.abrirBlackjack()")
  const abriu = await page.evaluate(() => ({
    aberto: window.__game.cassino.aberto,
    travado: !!(window.__game.player.locked !== undefined
      ? window.__game.player.locked : document.querySelector('.mcrp-cas-raiz.aberto')),
    painel: !!document.querySelector('.mcrp-cas-raiz'),
  }))
  await step(6, "G.cassino.fechar()")
  const fechou = await page.evaluate(() => window.__game.cassino.aberto)
  check('painel do cassino abre e fecha', abriu.aberto && abriu.painel && !fechou,
    'abriu=' + abriu.aberto + ' painel=' + abriu.painel + ' fechou=' + !fechou)

  // andar dentro do cassino sem cair pelo chao nem atravessar a parede do fundo
  await step(90, "G.player.teleport(24, 14); G.input.__t=1")
  const dentro = await page.evaluate(() => {
    const G = window.__game
    G.player.teleport(24, 14)
    for (let i = 0; i < 240; i++) { G.player.position.z += 0.08; G.player.update(1 / 60) }
    return { z: +G.player.position.z.toFixed(2), y: +G.player.position.y.toFixed(2) }
  })
  check('parede do fundo do cassino segura o jogador', dentro.z < 29.9 && dentro.y > 0.1,
    'parou em z=' + dentro.z + ' y=' + dentro.y)

  // 8) desempenho
  // Antes de medir, devolve o tempo pro sol E DERRETE a neve ate o fim. Sem
  // isto, o numero medido aqui e o do mapa nevado (a nevasca acabou de rodar,
  // logo acima) e nao da pra comparar com a medida de antes -- o que faz a
  // linha de desempenho parecer que piorou sozinha entre dois commits.
  await page.evaluate(() => {
    const G = window.__game
    // Volta pro MEIO DA TARDE. Os casos acima rodam centenas de quadros e o
    // ciclo de dia anda junto; se a medicao pegar a noite, os 8 postes acendem
    // (eles ficam com visible = false de dia) e o custo por fragmento dobra --
    // um numero honesto, mas de outra cena, que ninguem consegue comparar com
    // a medida da semana passada.
    G.lighting.setTimeOfDay(0.33)
    G.clima.setEstacao('sol')
    for (let i = 0; i < 900; i++) {
      G.clima.atualizar(0.1, G.player.position)
      G.neve.setCobertura(G.clima.cobertura)
      G.neve.atualizar(0.1)
    }
  })
  const perf = await page.evaluate(() => {
    const G = window.__game
    const gl = G.renderer.getContext()
    const bench = (x, z) => {
      G.player.teleport(x, z, 0)
      // 40 updates, e nao 1: a camera de 3a pessoa PERSEGUE o alvo por lerp, e
      // com um unico passo ela ainda esta no meio do caminho de onde o teste
      // anterior a deixou. Media-se entao um enquadramento diferente a cada
      // execucao — foi assim que a mesma cena marcou 55 ms num dia e 99 no
      // outro sem ninguem ter mexido no render.
      for (let i = 0; i < 40; i++) G.player.update(1 / 60)
      G.engine.render(); gl.finish()
      const t0 = performance.now()
      for (let i = 0; i < 15; i++) G.engine.render()
      gl.finish()
      return { ms: +((performance.now() - t0) / 15).toFixed(2), calls: G.renderer.info.render.calls }
    }
    return { rua: bench(2, 9), barbearia: bench(22, -20), mercearia: bench(-25, -22) }
  })
  console.log('\nDESEMPENHO (render por frame, SwiftShader por software — no PC real e muito mais rapido):')
  for (const k in perf) console.log('  ' + k.padEnd(11) + perf[k].ms + ' ms   ' + perf[k].calls + ' draw calls')
  check('draw calls sob controle', Math.max(...Object.values(perf).map((p) => p.calls)) < 1200,
    'maximo=' + Math.max(...Object.values(perf).map((p) => p.calls)))

  const falhas = results.filter((r) => !r.ok)
  console.log('\n' + (results.length - falhas.length) + '/' + results.length + ' casos passaram')
  if (errors.length) console.log('\nERROS DE CONSOLE:\n' + errors.slice(0, 10).join('\n'))
  process.exitCode = falhas.length ? 1 : 0
} finally {
  try { await browser.close() } catch (err) { void err }
  try { child.kill() } catch (err) { void err }
}
