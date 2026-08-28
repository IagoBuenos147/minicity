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
      if (reais[i] !== P.APARENCIA_OPCOES[i]) {
        ruins.push(P.CAMPOS_APARENCIA[i] + ' catalogo=' + reais[i] + ' tabela=' + P.APARENCIA_OPCOES[i])
      }
    }
    return { ruins, jaqueta: P.APARENCIA_OPCOES[18], nJaquetas: R.JAQUETAS.length }
  })
  check('APARENCIA_OPCOES bate com os catalogos', tabela.ruins.length === 0,
    tabela.ruins.join(' | ') || 'os 18 campos batem')
  check('blusa e jaqueta viraram UMA aba',
    tabela.nJaquetas === 0 && tabela.jaqueta === 1,
    'JAQUETAS=' + tabela.nJaquetas + ' opcoes[jaqueta]=' + tabela.jaqueta)

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
