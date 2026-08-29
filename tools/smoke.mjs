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

  // 0) ENTRAR NO JOGO.
  // O jogo abre no MENU (Cassino Buenos) e so vira jogo depois de escolher o
  // modo, criar o personagem e ver a cutscene. Este teste e sobre o MUNDO, nao
  // sobre o fluxo de entrada — entao ele usa o atalho que existe pra isso, o
  // mesmo que as ferramentas de foto usam. O fluxo tem os testes dele em
  // tools/teste-lobby.mjs e nos casos de menu mais abaixo.
  await page.evaluate(() => window.__game.fluxo.jogar())
  await step(20)
  check('o atalho de teste entra no jogo',
    await page.evaluate(() => window.__game.fluxo.estado === 'jogo'),
    await page.evaluate(() => window.__game.fluxo.estado))

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
  /* 22 luzes CARAS: 2 direcionais + 1 hemisferio + 19 pontuais (2 do pool de
     efeito, 8 dos postes de rua, 3 da barbearia, 3 da mercearia, 2 do salao do
     cassino, 1 da casa velha). O teto era 20 contando TODAS; subiu com o
     cassino, que e um salao de 19 x 17 m sem uma janela virada pro sol — com
     uma luz so, o canto das caca-niqueis e o balcao do caixa ficavam pretos,
     porque o emissivo do neon acende o proprio neon e nao a parede na frente
     dele.

     Subiu de novo, de 21 pra 22, pela lampada da CASA VELHA — e vale registrar
     por que, porque a versao anterior deste comentario dizia o contrario ("o
     caminho NAO e subir o teto: e trocar luz por emissivo").

     Essa regra vale quando o problema e "a peca nao brilha o bastante". Nao
     valia aqui: a casa ja era so emissivo, o bulbo BRILHAVA e nao ILUMINAVA, e
     fotografado a noite o chao logo abaixo dele ficava tao preto quanto o canto
     mais distante. Emissivo, por definicao, nao resolve escuro — ele acende a
     propria superficie. Trocar mais luz por emissivo aqui daria mais um ponto
     amarelo num quarto preto.

     A casa fica com UMA luz. A barbearia tem tres e a mercearia tres, as duas
     em comodos menores; este e o interior mais barato do jogo por metro
     quadrado, e e onde o jogador vai passar o comeco da partida. */
  check('orcamento de luzes caras <= 22', scene.luzCara <= 22,
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

  // 7c) reiniciar o mundo (F8) ------------------------------------------------
  // So o PRIMEIRO toque e testado aqui, de proposito: o segundo recarrega a
  // pagina, e recarregar no meio da bateria mataria o resto dos casos. O que
  // importa provar e justamente que UM toque NAO reinicia nada — essa tecla
  // apaga o progresso da sala inteira, inclusive o dos outros jogadores.
  //
  // Tudo dentro de UM evaluate, do disparo ate a leitura: o toast vive alguns
  // segundos e cada round-trip pro navegador headless custa quase um deles.
  await page.evaluate(() => { window.__marcaDeVida = 1 })
  const f8 = await page.evaluate(() => new Promise((res) => {
    const urlAntes = location.href
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }))
    let n = 0
    const f = () => {
      // 3 quadros e nao 8: aqui o render e por SOFTWARE e um quadro custa
      // centenas de milissegundos -- em 8 quadros o proprio toast que viemos
      // conferir ja teria expirado (ele vive 4 s). O jogo le a tecla no
      // PRIMEIRO quadro depois do disparo; 3 e folga de sobra.
      if (++n < 3) return requestAnimationFrame(f)
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F8' }))
      const cx = document.getElementById('hud-toasts')
      res({
        aviso: [...cx.children].some((x) => /F8 de novo/.test(x.textContent)),
        vivo: window.__marcaDeVida === 1 && location.href === urlAntes,
        // o que ESTAVA na caixa: sem isto, uma falha aqui e um "false" mudo
        textos: [...cx.children].map((x) => x.textContent.slice(0, 34)),
      })
    }
    requestAnimationFrame(f)
  }))
  check('F8 uma vez so avisa, nao reinicia', f8.vivo && f8.aviso,
    'pagina intacta=' + f8.vivo + ' avisou=' + f8.aviso
    + ' toasts=' + JSON.stringify(f8.textos))

  // A confirmacao EXPIRA: apertar de novo um minuto depois pede confirmacao
  // outra vez em vez de reiniciar direto. Sem esta janela, um F8 esquecido de
  // manha derrubaria o mundo com um F8 dado a tarde.
  const f8b = await page.evaluate(() => new Promise((res) => {
    const urlAntes = location.href
    window.__game.time += 60                 // envelhece o pedido anterior
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F8' }))
    let n = 0
    const f = () => {
      // 3 quadros e nao 8: aqui o render e por SOFTWARE e um quadro custa
      // centenas de milissegundos -- em 8 quadros o proprio toast que viemos
      // conferir ja teria expirado (ele vive 4 s). O jogo le a tecla no
      // PRIMEIRO quadro depois do disparo; 3 e folga de sobra.
      if (++n < 3) return requestAnimationFrame(f)
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'F8' }))
      const cx = document.getElementById('hud-toasts')
      res({
        aviso: [...cx.children].some((x) => /F8 de novo/.test(x.textContent)),
        vivo: window.__marcaDeVida === 1 && location.href === urlAntes,
        // o que ESTAVA na caixa: sem isto, uma falha aqui e um "false" mudo
        textos: [...cx.children].map((x) => x.textContent.slice(0, 34)),
      })
    }
    requestAnimationFrame(f)
  }))
  check('a confirmacao do F8 expira e ele pede de novo', f8b.vivo && f8b.aviso,
    'pagina intacta=' + f8b.vivo + ' avisou=' + f8b.aviso
    + ' toasts=' + JSON.stringify(f8b.textos))

  // 7d) a tabela de opcoes de aparencia bate com os catalogos ------------------
  // Este caso existe por causa de um bug que nao da erro nenhum: quando os
  // catalogos crescem e APARENCIA_OPCOES (src/comum/protocolo.js) fica pra
  // tras, o boneco LOCAL fica certo e o byte que VIAJA e cortado — a cabeca 12
  // chega como 7 na tela dos outros. A tabela mora no protocolo de proposito
  // (o servidor nao importa THREE), entao ela nao tem como se derivar sozinha.
  const tabela = await page.evaluate(async () => {
    const [P, A, R] = await Promise.all([
      import('/src/comum/protocolo.js'),
      import('/src/player/appearance.js'),
      import('/src/player/roupas.js'),
    ])
    const reais = [A.CABECAS, A.OLHOS, A.PUPILAS, A.NARIZES, A.BOCAS, A.BARBAS,
      A.CABELOS, A.SKIN_TONES, A.HAIR_COLORS, A.SOBRANCELHAS,
      R.CHAPEUS, R.CALCADOS, R.BLUSAS, R.CALCAS, R.COLARES, R.ANEIS,
      R.TATUAGENS, R.RELOGIOS].map((c) => (Array.isArray(c) ? c.length : -1))
    const ruins = []
    for (let i = 0; i < reais.length; i++) {
      // CATALOGO VAZIO E UM CAMPO MORTO, e o certo pra ele na tabela e 1.
      // Sao dois hoje: 'pupila' (a iris virou parte do olho e a aba sumiu) e
      // 'jaqueta' (virou camisa). Os dois seguem ocupando um byte do pacote,
      // valendo sempre 0 — e 1 opcao e exatamente "so o zero e valido".
      // Sem esta linha o teste exigiria tabela=0, que faria o clamp da rede
      // dividir por zero na fronteira.
      const esperado = reais[i] === 0 ? 1 : reais[i]
      if (esperado !== P.APARENCIA_OPCOES[i]) {
        ruins.push(P.CAMPOS_APARENCIA[i] + ' catalogo=' + reais[i] + ' tabela=' + P.APARENCIA_OPCOES[i])
      }
    }
    return {
      ruins,
      jaqueta: P.APARENCIA_OPCOES[18], nJaquetas: R.JAQUETAS.length,
      pupila: P.APARENCIA_OPCOES[2], nPupilas: A.PUPILAS.length,
    }
  })
  check('APARENCIA_OPCOES bate com os catalogos', tabela.ruins.length === 0,
    tabela.ruins.join(' | ') || 'os 18 campos batem')
  check('blusa e jaqueta viraram UMA aba',
    tabela.nJaquetas === 0 && tabela.jaqueta === 1,
    'JAQUETAS=' + tabela.nJaquetas + ' opcoes[jaqueta]=' + tabela.jaqueta)
  // A aba de pupila foi apagada: a iris passou a fazer parte de cada olho, com
  // um metodo proprio em cada um dos cinco. Catalogo vazio e o que faz o
  // customizador esconder a aba sozinho.
  check('a pupila virou parte do olho (a aba sumiu)',
    tabela.nPupilas === 0 && tabela.pupila === 1,
    'PUPILAS=' + tabela.nPupilas + ' opcoes[pupila]=' + tabela.pupila)

  // 7e) o fluxo de entrada: menu -> criacao -> cutscene -> jogo ---------------
  // O caminho que o jogador percorre de verdade, do jeito que ele o percorre:
  // clicando. A cutscene e PULADA (Esc) em vez de assistida — sao mais de vinte
  // segundos, e o que este caso protege e a fiacao entre as telas, nao o tempo
  // de cada fala.
  await page.evaluate(() => { window.__game.fluxo.menu() })
  await step(10)
  const noMenu = await page.evaluate(() => ({
    estado: window.__game.fluxo.estado,
    menu: !!document.querySelector('.mcrp-menu-raiz, [class*=mcrp-menu]'),
    hudEscondido: document.getElementById('hud').classList.contains('fora-do-jogo'),
  }))
  check('o jogo abre no MENU, com o HUD fora do caminho',
    noMenu.estado === 'menu' && noMenu.menu && noMenu.hudEscondido,
    'estado=' + noMenu.estado + ' menu=' + noMenu.menu + ' hud=' + noMenu.hudEscondido)

  await page.evaluate(() => window.__game.fluxo.solo())
  await step(20)
  const naCriacao = await page.evaluate(() => ({
    estado: window.__game.fluxo.estado,
    aberto: window.__game.criacao.aberto,
    nome: window.__game.criacao.nome,
  }))
  check('SOLO leva direto pra criacao de personagem',
    naCriacao.estado === 'criacao' && naCriacao.aberto,
    'estado=' + naCriacao.estado + ' painel=' + naCriacao.aberto)

  // --- a CUTSCENE com quatro jogadores -------------------------------------
  //
  // Este bloco existe por causa de tres defeitos que ja aconteceram, todos
  // invisiveis pro resto do teste porque o fluxo normal do smoke roda SOLO:
  //  1. o quarto jogador sentava no braco do sofa, de pernas penduradas;
  //  2. ninguem levantava na ideia do cassino (o pedido era "levantar juntos");
  //  3. na parte 2 nao havia ninguem na calcada — a camera de 3a pessoa
  //     apontava pra uma rua vazia.
  const quatro = await page.evaluate(async () => {
    const G = window.__game
    const cru = { id: 1, nome: 'A', aparencia: G.appearance, anfitriao: true }
    const outro = (i) => ({ id: i, nome: 'J' + i, aparencia: G.appearance, anfitriao: false })
    G.fluxo.comecar([cru, outro(2), outro(3), outro(4)])
    const A = G.abertura
    // 6 s: os quatro ja estao no sofa, ninguem levantou. Eles moram na cena
    // PROPRIA da cutscene, entao a cena do jogo ainda nao tem nenhum deles.
    for (let i = 0; i < 360; i++) A.atualizar(1 / 60)
    let noPorao = 0
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('abertura:') === 0) noPorao++ })
    // 52 s: passou a fala do cassino (todos de pe) e a cena ja virou pra rua.
    // O roteiro ficou mais lento a pedido do dono, entao este numero cresceu
    // junto: parte 1 sao 46 s.
    for (let i = 0; i < 2760; i++) A.atualizar(1 / 60)
    const fila = []
    G.scene.traverse((o) => {
      if (o.name && o.name.indexOf('abertura:') === 0) fila.push({ x: +o.position.x.toFixed(2), z: +o.position.z.toFixed(2) })
    })
    const parte = A.parte
    // dispose e nao pular: pular roda o callback do fim (teleporte, tutorial,
    // trava de mouse) e este bloco esta so inspecionando a cutscene.
    A.dispose()
    let sobrou = 0
    G.scene.traverse((o) => { if (o.name && o.name.indexOf('abertura:') === 0) sobrou++ })
    return { noPorao, fila, parte, sobrou }
  })
  check('a cutscene monta UM boneco por jogador do coop', quatro.fila.length === 4,
    'na fila=' + quatro.fila.length)
  // O porao e cena PROPRIA da cutscene: enquanto ela roda, a cena do jogo nao
  // pode ter boneco nenhum dela dentro (seria o grupo aparecendo na rua antes
  // da hora, e depois em dobro).
  check('o porao nao vaza pra cena do jogo', quatro.noPorao === 0,
    'na cena do jogo durante a parte 1=' + quatro.noPorao)
  check('na parte 2 eles estao em FILA, cada um num x', (() => {
    const xs = quatro.fila.map((f) => f.x).sort((a, b) => a - b)
    if (xs.length !== 4) return false
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - xs[i - 1]) < 0.9) return false
    return quatro.fila.every((f) => Math.abs(f.z - quatro.fila[0].z) < 0.01)
  })(), quatro.fila.map((f) => f.x).join(' | ') + ' em z=' + (quatro.fila[0] && quatro.fila[0].z))
  check('a parte 2 e a da rua', quatro.parte === 2, 'parte=' + quatro.parte)
  // Os bonecos da rua vivem na cena do JOGO, entao soltarPorao nao os alcanca:
  // sem soltarAtores() no dispose eles ficariam parados na calcada pra sempre.
  check('abortar a cutscene tira os bonecos da rua', quatro.sobrou === 0,
    'sobraram=' + quatro.sobrou)

  // A FILA e o TELEPORTE saem da MESMA conta. Se divergirem, o jogador nasce
  // no lugar do boneco de outro — o defeito que o dono chamou de "nascer em
  // local igual", so que ao contrario.
  const filaOk = await page.evaluate(async () => {
    const L = await import('/src/world/layout.js')
    const G = window.__game
    const fora = []
    for (let n = 1; n <= 4; n++) {
      const vistos = []
      for (let i = 0; i < n; i++) {
        const f = L.filaDaCasa(i, n)
        if (vistos.some((v) => Math.abs(v - f.x) < 0.5)) fora.push(n + ':' + i + ' colado')
        vistos.push(f.x)
        if (!G.collision.isFree(f.x, f.z, 0.42)) fora.push(n + ':' + i + ' em colisor')
        // PI e nao 0: com yaw 0 a camera de 3a pessoa vai parar DENTRO da casa
        // (medido: z = 13.2, com a fachada em z = 12). Ver filaDaCasa.
        if (Math.abs(f.yaw - Math.PI) > 1e-6) fora.push(n + ':' + i + ' virado pro lado errado')
      }
    }
    return fora
  })
  check('todo lugar da fila e livre, distinto e virado pra casa', filaOk.length === 0,
    filaOk.join(' | ') || '1..4 jogadores, 10 lugares conferidos')

  await page.evaluate(() => { window.__game.fluxo.menu() })
  await step(6)
  await page.evaluate(() => window.__game.fluxo.solo())
  await step(10)
  await page.evaluate(() => window.__game.fluxo.comecar())
  await step(10)
  const naAbertura = await page.evaluate(() => ({
    estado: window.__game.fluxo.estado,
    rodando: !!(window.__game.abertura && window.__game.abertura.rodando),
    parte: window.__game.abertura && window.__game.abertura.parte,
  }))
  check('PRONTO cai na cutscene de abertura, na parte do porao',
    naAbertura.estado === 'abertura' && naAbertura.rodando && naAbertura.parte === 1,
    'estado=' + naAbertura.estado + ' rodando=' + naAbertura.rodando + ' parte=' + naAbertura.parte)

  await page.evaluate(() => window.__game.abertura.pular())
  await step(120)
  const noJogo = await page.evaluate(() => {
    const G = window.__game
    return {
      estado: G.fluxo.estado,
      hudVisivel: !document.getElementById('hud').classList.contains('fora-do-jogo'),
      objetivo: G.tutorial.atual ? G.tutorial.atual.id : null,
      feitas: Array.from(G.tutorial.concluidas || []),
      x: +G.player.position.x.toFixed(1), z: +G.player.position.z.toFixed(1),
    }
  })
  check('a cutscene termina e o jogo comeca', noJogo.estado === 'jogo' && noJogo.hudVisivel,
    'estado=' + noJogo.estado + ' hud=' + noJogo.hudVisivel)
  check('o jogador nasce na frente da casa velha',
    Math.abs(noJogo.x - 43) < 4 && noJogo.z > 4 && noJogo.z < 12,
    'x=' + noJogo.x + ' z=' + noJogo.z)
  check('a primeira missao do tutorial esta na tela',
    noJogo.objetivo === 'entrar-na-casa',
    'objetivo=' + noJogo.objetivo + ' ja feitas=[' + (noJogo.feitas || []).join(',') + ']')

  // --- a porta da casa: fechada, ela BARRA; aberta, ela deixa passar ---------
  // Andar de verdade contra o vao, e nao teleportar pra dentro: o que este caso
  // protege e o colisor que liga e desliga com a folha, e teleporte atravessa
  // colisor nenhum — ele so escreve a posicao.
  const andarPraCasa = () => page.evaluate(() => {
    const G = window.__game
    G.player.teleport(43.0, 9.6, 0)
    for (let i = 0; i < 200; i++) { G.player.position.z += 0.03; G.player.update(1 / 60) }
    return +G.player.position.z.toFixed(2)
  })

  const zBarrado = await andarPraCasa()
  check('a porta fechada barra a entrada', zBarrado < 12.1,
    'parou em z=' + zBarrado + ' (a fachada esta em z=12)')

  const portaAbriu = await page.evaluate(() => {
    const G = window.__game
    const it = G.interaction.items.find((i) => i.id === 'casa-porta')
    if (!it) return { achou: false }
    const rotulo = it.label
    it.onInteract(G)
    for (let i = 0; i < 180; i++) G.casa.update(1 / 60, G)
    return { achou: true, antes: rotulo, depois: it.label }
  })
  check('o E na porta troca o rotulo pra fechar',
    portaAbriu.achou && portaAbriu.antes === 'Abrir a porta' && portaAbriu.depois === 'Fechar a porta',
    portaAbriu.antes + ' -> ' + portaAbriu.depois)

  const zDentro = await andarPraCasa()
  check('a porta aberta deixa entrar', zDentro > 13,
    'chegou em z=' + zDentro)

  await step(40)
  const missao = await page.evaluate(() => ({
    feita: window.__game.tutorial.concluidas.has('entrar-na-casa'),
    piso: +window.__game.groundY(43, 16).toFixed(2),
  }))
  check('entrar na casa conclui a primeira missao', missao.feita === true,
    'concluida=' + missao.feita + ' piso=' + missao.piso)

  // --- o chao da casa e SO o assoalho ---------------------------------------
  // O bug que este caso guarda: a calcada do anel de city.js (x 48..52) cruzava
  // o lote da casa (x 38..50) e as duas lajes ficavam no MESMO y = 0.16,
  // brigando por profundidade. Do lado de dentro aparecia uma mancha de
  // calcada quadriculada no meio da sala.
  const chao = await page.evaluate(() => {
    const G = window.__game
    const T = G.THREE
    const rc = new T.Raycaster()
    const baixo = new T.Vector3(0, -1, 0)
    const nomes = []
    for (const p of [[48.6, 13.5], [49.2, 16.0], [48.8, 20.5], [44, 14], [40, 19]]) {
      rc.set(new T.Vector3(p[0], 1.4, p[1]), baixo)
      const h = rc.intersectObjects(G.scene.children, true)[0]
      if (!h) { nomes.push(p + ':nada'); continue }
      let raiz = h.object
      while (raiz.parent && raiz.parent !== G.scene) raiz = raiz.parent
      nomes.push(p[0] + ',' + p[1] + ':' + raiz.name + '@' + h.point.y.toFixed(3))
    }
    return nomes
  })
  check('dentro da casa so ha o assoalho da casa',
    chao.every((n) => /casa-velha/.test(n)), chao.join(' | '))

  await page.evaluate(() => window.__game.fluxo.jogar())
  await step(10)

  // --- 7b) OS QUATRO SISTEMAS NOVOS ------------------------------------------
  // Mochila, loja, encaixe e save. Sao quatro modulos que se seguram pelas
  // bordas (comprar escreve na mochila, encaixar tira da mochila, o save le os
  // tres), e e exatamente ai que quebra em silencio.

  // MOCHILA. O que este caso guarda: a compra tinha que ser ATOMICA. A versao
  // ingenua ("tem espaco?" e depois "adiciona") mente quando o item ocupa mais
  // de uma vaga — ela responde sim contando vaga por vaga e depois enche o
  // inventario pela metade, cobrando o preco inteiro.
  const mochila = await page.evaluate(() => {
    const G = window.__game
    G.inventario.limpar()
    const cabe9 = []
    for (let i = 0; i < 9; i++) cabe9.push(G.inventario.adicionar('sinuca-bar', 1) >= 0)
    const decimo = G.inventario.adicionar('sinuca-bar', 1)
    G.inventario.limpar()
    // fichas empilham (limite alto) — 60 fichas tem que caber numa vaga so
    G.inventario.adicionar('ficha-sinuca', 60)
    const usadasPorFicha = G.inventario.slots.filter(Boolean).length
    // a pergunta e a acao concordam?
    G.inventario.limpar()
    for (let i = 0; i < 8; i++) G.inventario.adicionar('jukebox', 1)
    const perguntaDuas = G.inventario.temEspacoPara('jukebox', 2)
    const poeDuas = [G.inventario.adicionar('jukebox', 1), G.inventario.adicionar('jukebox', 1)]
    G.inventario.limpar()
    return { cabe9: cabe9.every(Boolean), decimo, usadasPorFicha, perguntaDuas, poeDuas }
  })
  check('a mochila tem exatamente 9 vagas', mochila.cabe9 && mochila.decimo < 0,
    'nove=' + mochila.cabe9 + ' decimo=' + mochila.decimo)
  check('item empilhavel ocupa uma vaga so', mochila.usadasPorFicha === 1,
    '60 fichas ocuparam ' + mochila.usadasPorFicha + ' vagas')
  check('a pergunta de espaco concorda com o resultado',
    mochila.perguntaDuas === false && mochila.poeDuas[1] < 0,
    'temEspacoPara(2)=' + mochila.perguntaDuas + ' resultado=' + mochila.poeDuas.join(','))

  // LOJA. A ordem da compra e a regra: ESPACO, depois OURO, depois entrega. Na
  // ordem trocada o jogador paga por um movel que nao tem onde caber.
  const loja = await page.evaluate(() => {
    const G = window.__game
    G.inventario.limpar()
    G.carteira.aplicar({ ouro: 0, banco: 0, fichas: 0 })
    G.carteira.ganharOuro(3000)
    G.loja.abrir()
    const semDinheiro = (() => {
      G.carteira.gastarOuro(G.carteira.ouro)
      G.loja.porNoCarrinho('sinuca-bar', 1)
      const r = G.loja.comprar()
      G.loja.limparCarrinho()
      return r
    })()
    G.carteira.ganharOuro(3000)
    // mochila cheia: a compra tem que ser RECUSADA, e o ouro nao pode sumir
    for (let i = 0; i < 9; i++) G.inventario.adicionar('baralho-comum', 1)
    G.loja.porNoCarrinho('jukebox', 1)
    const cheia = G.loja.comprar()
    const ouroDepoisDaRecusa = G.carteira.ouro
    G.loja.limparCarrinho()
    G.inventario.limpar()
    // agora com espaco: passa, cobra o preco certo e entrega
    G.loja.porNoCarrinho('baralho-estrela', 2)
    const preco = G.loja.total
    const ok = G.loja.comprar()
    const gastou = ouroDepoisDaRecusa - G.carteira.ouro
    const naMochila = G.inventario.quantidade('baralho-estrela')
    G.loja.fechar()
    G.inventario.limpar()
    return { semDinheiro, cheia, ouroDepoisDaRecusa, ok, preco, gastou, naMochila }
  })
  check('sem ouro a loja recusa', loja.semDinheiro !== true, 'comprou=' + loja.semDinheiro)
  check('mochila cheia recusa a compra E nao cobra',
    loja.cheia !== true && loja.ouroDepoisDaRecusa === 3000,
    'comprou=' + loja.cheia + ' ouro=' + loja.ouroDepoisDaRecusa)
  check('a compra cobra o preco do carrinho e entrega',
    loja.ok === true && loja.gastou === loja.preco && loja.naMochila === 2,
    'gastou=' + loja.gastou + ' preco=' + loja.preco + ' entregou=' + loja.naMochila)

  // ENCAIXE. O ponto do sistema e a resposta VERDE/VERMELHO ser honesta: se ele
  // pinta verde e o movel atravessa a parede, o sistema inteiro perde a graca.
  const enc = await page.evaluate(() => {
    const G = window.__game
    G.inventario.limpar()
    const vaga = G.inventario.adicionar('sinuca-bar', 1)
    G.player.teleport(43, 16.5, Math.PI)
    G.encaixe.entrar(vaga, 'sinuca-bar')
    const segurando = G.encaixe.ativo
    // no salao da frente: cabe
    const dentro = G.encaixe.podeEm('sinuca-bar', 39.2, 14.8, 0)
    // fora da casa, na rua: nao cabe
    const rua = G.encaixe.podeEm('sinuca-bar', 43.0, 6.0, 0)
    // em cima do vao da porta: nao cabe. A jukebox e pequena e CABERIA na zona
    // ali — quem recusa e a area proibida, que e o que este caso testa.
    const porta = G.encaixe.podeEm('jukebox', 43.0, 13.0, 0)
    // e a jukebox um metro pra dentro ja pode: prova que a recusa acima e do
    // vao da porta, e nao de a jukebox nao caber em lugar nenhum
    const perto = G.encaixe.podeEm('jukebox', 43.0, 15.0, 0)
    return {
      segurando, dentro: dentro.pode, rua: rua.pode,
      porta: porta.pode, motivo: porta.motivo, perto: perto.pode,
    }
  })
  check('pegar da mochila liga o fantasma do encaixe', enc.segurando === true,
    'ativo=' + enc.segurando)
  check('o encaixe pinta verde dentro e vermelho fora',
    enc.dentro === true && enc.rua === false,
    'sala=' + enc.dentro + ' rua=' + enc.rua)
  check('o vao da porta e area proibida, e so ele',
    enc.porta === false && enc.perto === true && /porta/.test(enc.motivo || ''),
    'no vao=' + enc.porta + ' (' + enc.motivo + ') um metro adiante=' + enc.perto)

  const posta = await page.evaluate(() => {
    const G = window.__game
    G.encaixe.mirarEm(39.2, 14.8, 0)
    const ok = G.encaixe.confirmar()
    const mochilaVazia = G.inventario.slots.every((s) => !s)
    const lista = G.encaixe.serializar()
    // guardar de volta devolve pra mochila
    const guardou = G.encaixe.guardarEm(0)
    const voltou = G.inventario.quantidade('sinuca-bar')
    G.inventario.limpar()
    return { ok, mochilaVazia, postas: lista.length, guardou, voltou }
  })
  check('instalar tira da mochila e poe na casa',
    posta.ok === true && posta.mochilaVazia === true && posta.postas === 1,
    'instalou=' + posta.ok + ' mochila vazia=' + posta.mochilaVazia + ' postas=' + posta.postas)
  check('guardar devolve o movel pra mochila',
    posta.guardou === true && posta.voltou === 1,
    'guardou=' + posta.guardou + ' voltou=' + posta.voltou)

  // A TECLA F5. Ela tinha dono antes de virar tecla de jogo (recarregar a
  // pagina), entao este caso guarda duas coisas de uma vez: que a tela abre, e
  // que a pagina continua de pe — se o preventDefault sumisse do core/input, o
  // navegador recarregaria e o teste inteiro morreria aqui.
  const f5 = await page.evaluate(() => {
    const G = window.__game
    G.saveUI.fechar()
    return { antes: G.saveUI.aberto, marca: (window.__marcaF5 = 'viva') }
  })
  await step(6, "window.dispatchEvent(new KeyboardEvent('keydown',{code:'F5'}));"
    + "setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'F5'})),60)")
  const f5Depois = await page.evaluate(() => ({
    aberto: window.__game.saveUI.aberto,
    marca: window.__marcaF5 || null,
    linhas: document.querySelectorAll('.mcrp-save .slot').length,
  }))
  await page.evaluate(() => window.__game.saveUI.fechar())
  check('F5 abre a tela dos 5 lugares sem recarregar a pagina',
    f5.antes === false && f5Depois.aberto === true && f5Depois.marca === 'viva'
    && f5Depois.linhas === 5,
    'aberto=' + f5Depois.aberto + ' pagina intacta=' + (f5Depois.marca === 'viva')
    + ' lugares=' + f5Depois.linhas)

  // As duas mesas de sinuca sao o movel maior da loja (3,10x4,14 e 3,50x4,35 com
  // a folga do taco). Vender uma mesa que nao tem onde caber seria vender uma
  // parede: este caso prova que as DUAS cabem ao mesmo tempo na casa.
  const duasMesas = await page.evaluate(() => {
    const G = window.__game
    G.encaixe.aplicar([])
    G.inventario.limpar()
    const a = G.inventario.adicionar('sinuca-bar', 1)
    G.encaixe.entrar(a, 'sinuca-bar')
    G.encaixe.mirarEm(39.2, 14.8, 0)
    const posA = G.encaixe.confirmar()
    const b = G.inventario.adicionar('sinuca-recond', 1)
    G.encaixe.entrar(b, 'sinuca-recond')
    G.encaixe.mirarEm(39.4, 20.4, 1)
    const posB = G.encaixe.confirmar()
    // e a segunda nao pode entrar POR CIMA da primeira
    const c = G.inventario.adicionar('sinuca-bar', 1)
    G.encaixe.entrar(c, 'sinuca-bar')
    const emCima = G.encaixe.podeEm('sinuca-bar', 39.2, 14.8, 0)
    G.encaixe.sair()
    const postas = G.encaixe.serializar().length
    G.encaixe.aplicar([])
    G.inventario.limpar()
    return { posA, posB, postas, emCima: emCima.pode, motivo: emCima.motivo }
  })
  check('as duas mesas de sinuca cabem juntas na casa',
    duasMesas.posA === true && duasMesas.posB === true && duasMesas.postas === 2,
    'bar=' + duasMesas.posA + ' recond=' + duasMesas.posB + ' postas=' + duasMesas.postas)
  check('movel nao entra em cima de movel',
    duasMesas.emCima === false, 'pode=' + duasMesas.emCima + ' (' + duasMesas.motivo + ')')

  // SAVE. A ida e a volta inteira: grava, estraga tudo de proposito, carrega e
  // confere que voltou igual. E o unico caso que prova que o save serve.
  const save = await page.evaluate(() => {
    const G = window.__game
    localStorage.removeItem('mcrp-saves')
    G.carteira.aplicar({ ouro: 1234, banco: 5678, fichas: 90 })
    G.inventario.limpar()
    G.inventario.adicionar('jukebox', 1)
    G.inventario.adicionar('ficha-sinuca', 17)
    G.player.teleport(44.2, 18.4, 1.25)
    G.setAppearance({ pele: 4, cabelo: 3 })
    const peleAntes = G.appearance.skin
    G.save.comecarEm(2, 'Teste')
    G.save.salvar(2, 'Teste', true)
    const card = G.save.listar()[2]
    // estraga tudo
    G.carteira.aplicar({ ouro: 0, banco: 0, fichas: 0 })
    G.inventario.limpar()
    G.player.teleport(2, 9, 0)
    G.setAppearance({ pele: 0 })
    const carregou = G.save.carregar(2)
    return {
      card: card && { nome: card.nome, pat: card.patrimonio, esquema: card.esquema },
      carregou,
      ouro: G.carteira.ouro, banco: G.carteira.banco, fichas: G.carteira.fichas,
      juke: G.inventario.quantidade('jukebox'), fichaSinuca: G.inventario.quantidade('ficha-sinuca'),
      x: +G.player.position.x.toFixed(1), z: +G.player.position.z.toFixed(1),
      pele: G.appearance.skin, peleAntes,
      livre: G.save.primeiroLivre(),
      // um arquivo de um jogo mais novo nao pode ser lido como se fosse deste
      futuro: (() => {
        const t = JSON.parse(G.save.exportar(2)); t.esquema = 99
        G.save.importar(3, JSON.stringify(t))
        return G.save.ler(3)
      })(),
      lixo: G.save.importar(4, 'nao sou json'),
    }
  })
  check('o card do save mostra nome e patrimonio',
    save.card && save.card.nome === 'Teste' && save.card.pat === 1234 + 5678 + 90,
    JSON.stringify(save.card))
  check('carregar devolve carteira, mochila e posicao',
    save.carregou === true && save.ouro === 1234 && save.banco === 5678 && save.fichas === 90
    && save.juke === 1 && save.fichaSinuca === 17
    && Math.abs(save.x - 44.2) < 0.3 && Math.abs(save.z - 18.4) < 0.3,
    'ouro=' + save.ouro + ' banco=' + save.banco + ' fichas=' + save.fichas
    + ' juke=' + save.juke + ' fichaSinuca=' + save.fichaSinuca + ' pos=' + save.x + ',' + save.z)
  check('o save guarda a cor da pele (que nao cabe no protocolo)',
    save.pele === save.peleAntes, 'antes=' + save.peleAntes + ' depois=' + save.pele)
  check('save de esquema mais novo nao e lido como se fosse deste',
    save.futuro === null, 'leu=' + JSON.stringify(save.futuro))
  check('arquivo estragado e recusado com motivo', typeof save.lixo === 'string' && save.lixo.length > 0,
    'motivo=' + JSON.stringify(save.lixo))
  check('primeiroLivre pula os lugares ocupados', save.livre === 0, 'livre=' + save.livre)

  // --- 7c) OS DOIS MUNDOS ----------------------------------------------------
  // A cidade do cassino e a Quadra Hudson, e as duas teclas que trocam entre
  // elas. O que estes casos guardam nao e o desenho: e o DESLIGAMENTO. Um
  // cenario fora de cena que deixa colisor ligado poe o jogador batendo numa
  // parede invisivel, e esse e o pior bug que um jogo pode ter.

  const troca = await page.evaluate(() => {
    const G = window.__game
    const C = G.cenarios
    C.mostrar('cidade')
    const regC = C.registroDe('cidade')
    const antes = {
      atual: C.atual,
      ids: C.ids,
      colisores: regC.colisores.length,
      colisoresAtivos: regC.colisores.filter((b) => b.ativo).length,
      occluders: regC.occluders.length,
      interativos: regC.interativos.length,
      grupos: regC.grupos.length,
      updates: regC.updates.length,
      chao: +G.groundY(43, 8.8).toFixed(2),
    }
    const t0 = performance.now()
    C.mostrar('hudson')
    const montou = Math.round(performance.now() - t0)
    const regH = C.registroDe('hudson')
    const depois = {
      atual: C.atual,
      cidadeColisoresAtivos: regC.colisores.filter((b) => b.ativo).length,
      cidadeOccludersAtivos: regC.occluders.filter((o) => o.ativo).length,
      cidadeInterativosAtivos: regC.interativos.filter((i) => i.enabled).length,
      cidadeVisivel: regC.grupos.some((g) => g.visible),
      hudsonColisores: regH.colisores.length,
      hudsonVisivel: regH.grupos.some((g) => g.visible),
      chao: +G.groundY(G.player.position.x, G.player.position.z).toFixed(2),
      y: +G.player.position.y.toFixed(2),
    }
    C.mostrar('cidade')
    const volta = {
      atual: C.atual,
      colisoresAtivos: regC.colisores.filter((b) => b.ativo).length,
      interativosAtivos: regC.interativos.filter((i) => i.enabled).length,
      hudsonColisoresAtivos: regH.colisores.filter((b) => b.ativo).length,
      visivel: regC.grupos.some((g) => g.visible),
      chao: +G.groundY(43, 8.8).toFixed(2),
    }
    return { antes, depois, volta, montou }
  })
  check('o jogo tem os dois cenarios registrados',
    troca.antes.ids.length === 2 && troca.antes.ids.indexOf('hudson') >= 0,
    'ids=' + troca.antes.ids.join(','))
  check('a GRAVACAO pegou o mundo inteiro da cidade',
    troca.antes.colisores > 200 && troca.antes.occluders > 10
    && troca.antes.interativos > 20 && troca.antes.grupos > 5 && troca.antes.updates > 3,
    'colisores=' + troca.antes.colisores + ' occluders=' + troca.antes.occluders
    + ' interativos=' + troca.antes.interativos + ' grupos=' + troca.antes.grupos
    + ' updates=' + troca.antes.updates)
  check('trocar de cenario DESLIGA a cidade inteira',
    troca.depois.cidadeColisoresAtivos === 0 && troca.depois.cidadeOccludersAtivos === 0
    && troca.depois.cidadeInterativosAtivos === 0 && troca.depois.cidadeVisivel === false,
    'colisores=' + troca.depois.cidadeColisoresAtivos
    + ' occluders=' + troca.depois.cidadeOccludersAtivos
    + ' interativos=' + troca.depois.cidadeInterativosAtivos
    + ' visivel=' + troca.depois.cidadeVisivel)
  check('a Quadra Hudson entra em cena com colisor e chao proprios',
    troca.depois.hudsonVisivel === true && troca.depois.hudsonColisores > 20
    && troca.depois.y === troca.depois.chao,
    'colisores=' + troca.depois.hudsonColisores + ' y=' + troca.depois.y
    + ' chao=' + troca.depois.chao)
  check('voltar pra cidade religa tudo e nao deixa nada da Hudson ligado',
    troca.volta.colisoresAtivos === troca.antes.colisoresAtivos
    && troca.volta.interativosAtivos > 20
    && troca.volta.hudsonColisoresAtivos === 0
    && troca.volta.visivel === true && troca.volta.chao === troca.antes.chao,
    'cidade=' + troca.volta.colisoresAtivos + '/' + troca.antes.colisoresAtivos
    + ' interativos=' + troca.volta.interativosAtivos
    + ' hudson ligada=' + troca.volta.hudsonColisoresAtivos
    + ' chao=' + troca.volta.chao)

  // A TECLA DE SUMIR. Ela nao pode teleportar ninguem: e usada pra tirar foto
  // do personagem no vazio, e mover o jogador estragaria o enquadramento.
  const sumir = await page.evaluate(() => {
    const G = window.__game
    G.cenarios.mostrar('cidade')
    G.player.teleport(20, -10, 1)
    const onde = [+G.player.position.x.toFixed(1), +G.player.position.z.toFixed(1)]
    G.cenarios.sumir(true)
    const reg = G.cenarios.registroDe('cidade')
    const escondido = {
      flag: G.cenarios.escondido,
      visivel: reg.grupos.some((g) => g.visible),
      colisores: reg.colisores.filter((b) => b.ativo).length,
      onde: [+G.player.position.x.toFixed(1), +G.player.position.z.toFixed(1)],
    }
    G.cenarios.sumir(false)
    return {
      onde,
      escondido,
      voltou: reg.grupos.some((g) => g.visible) && reg.colisores.filter((b) => b.ativo).length > 200,
    }
  })
  check('a tecla de SUMIR apaga o cenario sem mexer no jogador',
    sumir.escondido.flag === true && sumir.escondido.visivel === false
    && sumir.escondido.colisores === 0
    && sumir.escondido.onde[0] === sumir.onde[0] && sumir.escondido.onde[1] === sumir.onde[1],
    'escondido=' + sumir.escondido.flag + ' colisores=' + sumir.escondido.colisores
    + ' jogador ' + sumir.onde.join(',') + ' -> ' + sumir.escondido.onde.join(','))
  check('e trazer de volta devolve o cenario inteiro', sumir.voltou === true, 'voltou=' + sumir.voltou)

  // F6 e F7 no teclado, passando pelo laco de verdade
  await page.evaluate(() => { window.__game.cenarios.mostrar('cidade') })
  await step(6, "window.dispatchEvent(new KeyboardEvent('keydown',{code:'F6'}));"
    + "setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'F6'})),60)")
  const f6 = await page.evaluate(() => window.__game.cenarios.atual)
  await step(6, "window.dispatchEvent(new KeyboardEvent('keydown',{code:'F7'}));"
    + "setTimeout(()=>window.dispatchEvent(new KeyboardEvent('keyup',{code:'F7'})),60)")
  const f7 = await page.evaluate(() => window.__game.cenarios.escondido)
  await page.evaluate(() => {
    window.__game.cenarios.sumir(false)
    window.__game.cenarios.mostrar('cidade')
  })
  check('F6 troca de cenario e F7 faz sumir', f6 === 'hudson' && f7 === true,
    'F6 levou pra ' + f6 + ' / F7 escondeu=' + f7)

  // --- A QUADRA HUDSON ------------------------------------------------------
  // O bairro e feito de DADO (planta.js) mais um montador (lotes.js). Estes
  // casos guardam a planta, e nao o desenho: se um lote sumir da lista ou se o
  // quarteirao deixar de fechar, quem descobre e o teste, e nao o jogador.
  const hud = await page.evaluate(async () => {
    const G = window.__game
    G.cenarios.mostrar('hudson')
    const P = (await import('/src/world/hudson/planta.js')).PLANTA
    const C = await import('/src/world/hudson/chao.js')
    const lados = Object.keys(P)
    const soma = {}
    const tipos = {}
    const ids = new Set()
    let repetido = null
    for (const lado of lados) {
      let q = 0, o = 0
      for (const l of P[lado].lotes) {
        if (ids.has(l.id)) repetido = l.id
        ids.add(l.id)
        tipos[l.tipo] = (tipos[l.tipo] || 0) + 1
        if (l.ladoDaRua === 'oposto') o += l.frente; else q += l.frente
      }
      soma[lado] = { q: +q.toFixed(1), o: +o.toFixed(1) }
    }
    const reg = G.cenarios.registroDe('hudson')
    G.engine.render()
    return {
      lados, soma, tipos, repetido, lotes: ids.size,
      draw: G.renderer.info.render.calls,
      colisores: reg.colisores.length,
      // o chao: calcada no quarteirao, asfalto no meio da rua
      chaoLote: +C.groundY(0, 0).toFixed(2),
      chaoRua: +C.groundY(C.EIXO.leste, 0).toFixed(2),
      chaoCalcada: +C.groundY(C.Q.x1 + 1, 0).toFixed(2),
      largura: +(C.Q.x1 - C.Q.x0).toFixed(1),
      profund: +(C.Q.z1 - C.Q.z0).toFixed(1),
    }
  })
  check('a planta tem as quatro ruas do quarteirao',
    hud.lados.length === 4 && hud.lados.indexOf('sul') >= 0 && hud.lados.indexOf('norte') >= 0
    && hud.lados.indexOf('leste') >= 0 && hud.lados.indexOf('oeste') >= 0,
    hud.lados.join(','))
  check('nenhum lote esta na planta duas vezes',
    hud.repetido === null && hud.lotes === 49,
    'repetido=' + hud.repetido + ' lotes unicos=' + hud.lotes)
  check('ha UMA quadra coberta, e nao uma por rua',
    hud.tipos['quadra-coberta'] === 1,
    'quadra-coberta=' + hud.tipos['quadra-coberta'] + ' (as 3 ruas viam o mesmo ginasio)')
  check('as testadas fecham um quarteirao plausivel nos quatro lados',
    Object.values(hud.soma).every((s) => s.q > 80 && s.q < 140 && s.o > 80 && s.o < 140),
    Object.entries(hud.soma).map(([k, v]) => k + ' ' + v.q + '/' + v.o).join('  '))
  check('o quarteirao tem a medida lida nas fotos',
    Math.abs(hud.largura - 118) < 2 && Math.abs(hud.profund - 121) < 3,
    hud.largura + ' x ' + hud.profund + ' m')
  check('o chao da Hudson sobe na calcada e cai na rua',
    hud.chaoLote === 0.16 && hud.chaoCalcada === 0.16 && hud.chaoRua === 0,
    'lote=' + hud.chaoLote + ' calcada=' + hud.chaoCalcada + ' rua=' + hud.chaoRua)
  check('a Quadra Hudson cabe no orcamento de draw calls',
    hud.draw < 1200, 'draw calls=' + hud.draw)
  await page.evaluate(() => window.__game.cenarios.mostrar('cidade'))

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
