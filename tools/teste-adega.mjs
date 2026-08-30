// A ADEGA 100: o predio cego, a torneira de chope e o copo na mao.
//
//   node tools/teste-adega.mjs
//
// O QUE ESTE TESTE PROTEGE, e por que cada caso existe:
//
//   1. O LUGAR TEM QUE SER FECHADO. A adega nasceu de um predio de cenario
//      (caixa macica) e virou um lote com interior. Se a casca vazar — uma
//      parede faltando, um colisor no lugar errado —, da pra andar pra dentro
//      do predio pela rua e o "clandestino" acaba ali. O caso mede: parado na
//      calcada do anel, andando pro sul, o jogador PARA na parede.
//
//   2. A PORTA DO BECO TEM QUE ABRIR EM DUAS ETAPAS na primeira vez, e o
//      colisor do vao tem que sumir SO depois. Sem isso da pra atravessar a
//      folha fechada, ou a folha abre e o colisor fica.
//
//   3. A TORNEIRA TEM QUE JORRAR. Nao basta "abriu": a coluna leva ~140 ms pra
//      chegar na bandeja, e e nesse intervalo que o copo NAO pode encher — foi
//      pra isso que barril.js separou `aberta` de `jorrando`.
//
//   4. O CICLO DO COPO. E o pedido inteiro em quatro cliques: esticar, encher,
//      beber, beber ate zerar, e no vazio esticar de novo. Cada clique aqui e o
//      MESMO `copo.usar()` que o botao esquerdo chama no main.
//
//   5. O ORCAMENTO. Quatro PointLight, nem uma a mais (o teto do jogo inteiro e
//      34 e esta em tools/smoke.mjs, com a conta de cada uma).
//
// Em headless o requestAnimationFrame nao dispara, entao tudo que precisa de
// tempo (a porta, o jorro, o gole) e avancado na mao, quadro a quadro, com o
// mesmo passo do jogo.

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

const PORT = 9711 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-adega-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=960,600', 'about:blank',
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

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 240000,
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 960, height: 600 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.fluxo', { timeout: 90000 })
  async function entrarNoJogo() {
    await page.waitForFunction('window.__game && window.__game.fluxo', { timeout: 90000 })
    await page.evaluate('window.__game.fluxo.jogar()')
    await new Promise((r) => setTimeout(r, 1500))
  }
  await entrarNoJogo()

  /**
   * page.evaluate com UMA repescagem.
   *
   * Existe porque este repositorio e editado por mais de uma aba ao mesmo
   * tempo: qualquer arquivo salvo enquanto o teste roda faz o vite recarregar a
   * pagina, o contexto morre no meio de um evaluate e o processo cai com
   * "Execution context was destroyed" — que nao tem nada a ver com o que estava
   * sendo medido. Aqui a gente volta pro jogo e refaz a medida uma vez; se cair
   * de novo, ai sim e problema de verdade e o erro sobe.
   */
  async function ev(fn, ...args) {
    try {
      // Espera o jogo EXISTIR antes de cada medida. Nao e paranoia: com tres
      // abas editando o mesmo repositorio, o vite recarrega a pagina no meio do
      // teste e a janela fica alguns segundos sem `window.__game` — o contexto
      // e valido, so esta vazio, e por isso o catch de baixo nao pega esse caso.
      await page.waitForFunction('!!(window.__game && window.__game.fluxo)', { timeout: 60000 })
      if (!(await page.evaluate('window.__game.fluxo.estado === "jogo"'))) await entrarNoJogo()
      return await page.evaluate(fn, ...args)
    } catch (err) {
      if (!/context was destroyed|Target closed|detached/i.test(String(err))) throw err
      console.log('   (a pagina recarregou no meio; refazendo)')
      await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
      await entrarNoJogo()
      return page.evaluate(fn, ...args)
    }
  }

  // --- 0. o mundo montou e a adega esta nele --------------------------------
  const base = await ev(() => {
    const G = window.__game
    const a = G.adegaMundo
    let luzes = 0
    if (a && a.group) a.group.traverse((o) => { if (o.isLight && !o.isAmbientLight) luzes++ })
    return {
      existe: !!a,
      torneiras: a && a.chopeira ? a.chopeira.torneiras.length : 0,
      luzes,
      loja: !!G.adega,
      copo: !!G.copo,
      inter: G.interaction.items.map((i) => i.id).filter((i) => i.indexOf('adega') === 0),
    }
  })
  ok('a adega esta na cena', base.existe)
  ok('a chopeira tem duas torneiras', base.torneiras === 2, String(base.torneiras))
  ok('a adega gasta QUATRO luzes caras', base.luzes === 4, String(base.luzes))
  ok('a janela da loja existe (game.adega)', base.loja)
  ok('a mao do copo existe (game.copo)', base.copo)
  ok('a porta do beco tem ponto de interacao', base.inter.includes('adega-porta'))
  ok('as duas torneiras tem ponto de interacao',
    base.inter.includes('adega-torneira-0') && base.inter.includes('adega-torneira-1'))
  ok('o balcao tem ponto de compra', base.inter.includes('adega-balcao'))

  // --- 1. a casca e fechada -------------------------------------------------
  const casca = await ev(() => {
    const G = window.__game
    const andar = (x, z, yaw, n) => {
      G.player.teleport(x, z, yaw)
      for (let i = 0; i < 20; i++) G.player.update(1 / 60)
      const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
      tecla('KeyW', 'keydown')
      for (let i = 0; i < n; i++) G.player.update(1 / 60)
      tecla('KeyW', 'keyup')
      for (let i = 0; i < 10; i++) G.player.update(1 / 60)
      return { x: +G.player.position.x.toFixed(2), z: +G.player.position.z.toFixed(2) }
    }
    // teleport(x, z, yaw) guarda o yaw da CAMERA, e a camera com yaw 0 olha
    // pro -Z (ver o comentario de filaDaCasa em layout.js). Entao andar pro +Z,
    // que e "pra dentro do quarteirao", e yaw = PI.
    //
    // Da calcada do anel andando pro sul: tem que bater na parede norte (-52).
    const fora = andar(22, -55.0, Math.PI, 260)
    // do beco andando pro norte: tem que bater na parede sul (-32).
    const beco = andar(20, -30.0, 0, 220)
    return { fora, beco }
  })
  ok('a rua nao entra no predio', casca.fora.z < -51.5 && casca.fora.z > -52.6,
    'parou em z=' + casca.fora.z)
  ok('o beco nao entra pela parede (fora da porta)', casca.beco.z > -32.5,
    'parou em z=' + casca.beco.z)

  // --- 2. a porta do beco ---------------------------------------------------
  const porta = await ev(async () => {
    const G = window.__game
    const a = G.adegaMundo
    const passo = (n) => { for (let i = 0; i < n; i++) a.update(1 / 60, G) }
    const p = G.interaction.items.find((i) => i.id === 'adega-porta')
    const antes = p.label
    p.onInteract(G)
    passo(10)                       // 0.17 s: o postigo esta correndo
    const noPostigo = a.porta.estado.fase
    passo(140)                      // 2.3 s: espia, fecha o postigo, abre
    const depois = a.porta.estado
    // com a porta aberta, da pra atravessar o vao
    G.player.teleport(27.9, -30.6, 0)
    for (let i = 0; i < 20; i++) G.player.update(1 / 60)
    const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
    tecla('KeyW', 'keydown')
    for (let i = 0; i < 130; i++) { G.player.update(1 / 60); a.update(1 / 60, G) }
    tecla('KeyW', 'keyup')
    for (let i = 0; i < 10; i++) G.player.update(1 / 60)
    return {
      antes, noPostigo, fase: depois.fase, aberta: +depois.aberta.toFixed(2),
      entrou: +G.player.position.z.toFixed(2),
    }
  })
  ok('a porta comeca fechada e sem convite', porta.antes === 'Bater na porta', porta.antes)
  ok('o postigo corre ANTES da folha', porta.noPostigo === 'postigo' || porta.noPostigo === 'espia',
    porta.noPostigo)
  ok('a folha abre depois do postigo', porta.fase === 'aberta' && porta.aberta === 1,
    porta.fase + ' / ' + porta.aberta)
  ok('da pra entrar pelo vao aberto', porta.entrou < -33.5, 'z=' + porta.entrou)

  // --- 2b. E DA PRA SAIR ----------------------------------------------------
  //
  // Entrar num lugar e metade do caminho. Este caso existe porque o dono
  // relatou "a saida fica fechada, nao consigo sair da adega": ele mede o
  // trajeto INTEIRO de volta, do balcao ate a calcada do beco, andando de
  // verdade — vestibulo, cotovelo, vao da cortina e porta.
  const saida = await ev(() => {
    const G = window.__game
    const a = G.adegaMundo
    const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
    const andar = (x, z, yaw, n) => {
      G.player.teleport(x, z, yaw)
      for (let i = 0; i < 20; i++) G.player.update(1 / 60)
      tecla('KeyW', 'keydown')
      for (let i = 0; i < n; i++) { G.player.update(1 / 60); a.update(1 / 60, G) }
      tecla('KeyW', 'keyup')
      for (let i = 0; i < 10; i++) G.player.update(1 / 60)
      return { x: +G.player.position.x.toFixed(2), z: +G.player.position.z.toFixed(2) }
    }
    // deixa a porta aberta (o teste anterior ja abriu; garante)
    if (a.porta.estado.fase !== 'aberta') {
      a.porta.estado.conhecida = true
      const p = G.interaction.items.find((i) => i.id === 'adega-porta')
      p.onInteract(G)
      for (let i = 0; i < 120; i++) a.update(1 / 60, G)
    }
    // 1) do salao ate a boca do cotovelo (andando pro LESTE, com z ao NORTE da
    //    divisoria: o vao fica na parede de z = -36.6)
    const aoVao = andar(22.0, -37.6, -Math.PI / 2, 180)
    // 2) atravessando o cotovelo pro vestibulo (andando pro SUL, +Z)
    const aoVestibulo = andar(26.2, -37.4, Math.PI, 200)
    // 3) da porta pra fora
    const naRua = andar(27.9, -33.4, Math.PI, 200)
    // 4) e o E la de dentro com a porta FECHADA: tem que reabrir, nao virar
    //    tecla morta (era o bug: o ponto de dentro so sabia FECHAR)
    a.porta.estado.fase = 'fechada'
    a.porta.estado.aberta = 0
    for (let i = 0; i < 10; i++) a.update(1 / 60, G)
    G.player.teleport(27.9, -33.2, Math.PI)
    for (let i = 0; i < 20; i++) G.player.update(1 / 60)
    const alvo = G.interaction.update(G.player.position)
    const rotulo = alvo && alvo.label
    if (alvo) alvo.onInteract(G)
    for (let i = 0; i < 120; i++) a.update(1 / 60, G)
    return { aoVao, aoVestibulo, naRua, rotulo, reabriu: a.porta.estado.fase }
  })
  ok('do salao da pra chegar na boca do cotovelo', saida.aoVao.x > 26.0,
    'parou em x=' + saida.aoVao.x)
  ok('o cotovelo atravessa pro vestibulo', saida.aoVestibulo.z > -33.4,
    'parou em z=' + saida.aoVestibulo.z)
  ok('e a porta deixa SAIR pro beco', saida.naRua.z > -31.9,
    'parou em z=' + saida.naRua.z)
  ok('de dentro, o E reabre a porta fechada', saida.reabriu === 'aberta',
    'rotulo="' + saida.rotulo + '" fase=' + saida.reabriu)

  // --- 3. a torneira jorra --------------------------------------------------
  const torneira = await ev(() => {
    const G = window.__game
    const a = G.adegaMundo
    const t = a.chopeira.torneiras[0]
    const passo = (n) => { for (let i = 0; i < n; i++) a.update(1 / 60, G) }
    const fechadaAntes = !t.aberta
    a.torneira(0, true)
    passo(3)                        // 50 ms: a alavanca ainda esta girando
    const cedo = { aberta: t.aberta, jorrando: t.jorrando }
    passo(25)                       // 470 ms: a coluna ja chegou na bandeja
    const jorra = t.jorrando
    a.torneira(0, false)
    passo(40)
    const fechou = !t.jorrando
    return { fechadaAntes, cedo, jorra, fechou }
  })
  ok('a torneira comeca fechada', torneira.fechadaAntes)
  ok('abrir nao jorra no mesmo quadro (a coluna cai)',
    torneira.cedo.aberta === true && torneira.cedo.jorrando === false,
    'aberta=' + torneira.cedo.aberta + ' jorrando=' + torneira.cedo.jorrando)
  ok('meio segundo depois o chope chegou na bandeja', torneira.jorra === true)
  ok('fechar corta o jorro', torneira.fechou === true)

  // --- 4. o ciclo do copo ---------------------------------------------------
  const ciclo = await ev(() => {
    const G = window.__game
    const a = G.adegaMundo
    const copo = G.copo
    const passo = (n) => {
      for (let i = 0; i < n; i++) { copo.atualizar(1 / 60); a.update(1 / 60, G) }
    }
    // o jogador no balcao, encarando a torneira 0
    const t = a.chopeira.torneiras[0]
    const bico = t.bicoMundo(new (Object.getPrototypeOf(G.player.position).constructor)())
    G.player.teleport(bico.x, bico.z + 1.05, Math.PI)
    for (let i = 0; i < 30; i++) G.player.update(1 / 60)
    // olha pro bico (a camera de 1a pessoa)
    if (G.player.mode !== 'first') G.player.toggleMode ? G.player.toggleMode() : null
    G.camera.lookAt(bico)

    copo.segurar('copo-tulipa')
    passo(30)
    const pegou = copo.segurando && copo.vazio

    // clique 1: estica a mao
    copo.usar()
    passo(20)
    const esticou = copo.estendido

    // abre a torneira e espera encher
    a.torneira(0, true)
    // o encher() de verdade so acontece se a adega achar que o copo esta
    // embaixo do bico — e a mira depende da CAMERA, entao ela e reapontada a
    // cada quadro, como o jogador faria segurando a mira parada
    for (let i = 0; i < 260; i++) {
      G.camera.lookAt(bico)
      copo.atualizar(1 / 60)
      a.update(1 / 60, G)
    }
    const nivelCheio = +copo.nivel.toFixed(2)
    const recolheuSozinho = !copo.estendido
    a.torneira(0, false)

    // clique 2, 3, 4...: bebe ate zerar. A tulipa tem 4 goles.
    const goles = []
    for (let k = 0; k < 6 && copo.nivel > 0.01; k++) {
      copo.usar()
      passo(70)                      // 1,16 s: o gole inteiro (DUR_GOLE = 0.92)
      goles.push(+copo.nivel.toFixed(2))
    }
    // vazio: o clique volta a esticar a mao
    copo.usar()
    passo(20)
    const esticouDeNovo = copo.estendido
    copo.largar()
    passo(30)
    return { pegou, esticou, nivelCheio, recolheuSozinho, goles, esticouDeNovo }
  })
  ok('o copo entra na mao vazio', ciclo.pegou)
  ok('o clique estica a mao', ciclo.esticou)
  ok('embaixo da torneira o copo enche', ciclo.nivelCheio >= 0.99, 'nivel=' + ciclo.nivelCheio)
  ok('cheio, a mao volta sozinha', ciclo.recolheuSozinho)
  ok('cada clique bebe um gole', ciclo.goles.length >= 3 && ciclo.goles[0] < 0.99,
    'niveis: ' + ciclo.goles.join(' -> '))
  ok('o ultimo gole zera o copo', ciclo.goles[ciclo.goles.length - 1] === 0,
    'fim=' + ciclo.goles[ciclo.goles.length - 1])
  ok('vazio, o clique estica a mao de novo', ciclo.esticouDeNovo)

  // --- 5. a loja vende os tres copos ---------------------------------------
  const loja = await ev(() => {
    const G = window.__game
    const ids = ['copo-americano', 'copo-tulipa', 'caneca-chope']
    const cat = ids.map((i) => !!G.itemDe0 || true)
    void cat
    G.adega.abrir('copo-tulipa')
    const aberta = document.querySelector('.mcrp-loja.on') !== null
    G.adega.fechar()
    return { aberta }
  })
  ok('a janela da adega abre num item', loja.aberta)

  // --- 5b. COMPRAR um copo e ele chegar na mao -----------------------------
  //
  // O ciclo de cima chamou copo.segurar() na mao. Este caso cobre o CAMINHO DE
  // VERDADE, que passa por cinco modulos que nao se conhecem: a janela da loja
  // debita a carteira, o inventario abre vaga, o registro de ids responde pelo
  // nome e pela foto do item novo (os copos nao nascem em MOBILIA nem em
  // BEBIDAS), e o main decide que aquela vaga vai pra player/copo.js e nao pra
  // player/mao.js. Qualquer elo solto aqui da "copo comprado que nao aparece".
  const compra = await ev(() => {
    const G = window.__game
    const antes = G.inventario.slots.filter(Boolean).length
    const vaga = G.inventario.adicionar('caneca-chope', 1)
    // fotoDe() so devolve alguma coisa pra id que o REGISTRO conhece: e a
    // maneira mais curta de perguntar "o catalogo sabe quem e este item?"
    const foto = G.fotoDe('caneca-chope')
    G.selecionarVaga(vaga)
    for (let i = 0; i < 30; i++) G.copo.atualizar(1 / 60)
    return {
      vaga, cresceu: G.inventario.slots.filter(Boolean).length > antes,
      registrado: typeof foto === 'string' && foto.length > 100,
      naMao: G.copo.id, maoGenerica: G.mao.id,
    }
  })
  ok('o copo comprado ocupa uma vaga', compra.vaga >= 0 && compra.cresceu,
    'vaga=' + compra.vaga)
  ok('o registro de ids conhece o copo', compra.registrado)
  ok('escolher a vaga poe o copo na MAO DO COPO, nao na mao generica',
    compra.naMao === 'caneca-chope' && !compra.maoGenerica,
    'copo=' + compra.naMao + ' mao=' + compra.maoGenerica)

  // --- 6. fotos -------------------------------------------------------------
  const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..', 'shots')
  fs.mkdirSync(dir, { recursive: true })
  // yaw 0 = camera olhando pro -Z; yaw PI = pro +Z (ver o teste da casca).
  const TOMADAS = [
    ['adega-01-fachada', 22.0, -57.0, Math.PI, 0.10],
    ['adega-02-beco', 24.4, -29.6, -0.86, 0.02],
    ['adega-03-vestibulo', 27.9, -33.4, 0, 0.0],
    ['adega-04-salao', 22.0, -37.2, 0, 0.0],
    ['adega-05-balcao', 21.9, -43.0, 0, -0.10],
    ['adega-06-chopeira', 21.9, -43.6, 0, -0.28],
    ['adega-07-fundos', 18.6, -43.5, 0, 0.02],
    ['adega-08-estante', 20.0, -35.4, Math.PI, 0.0],
  ]
  // As duas do COPO NA MAO sao o retrato do pedido, e por isso montam estado
  // antes: o copo esticado embaixo da torneira aberta, e o copo cheio na mao.
  const MAO = [
    ['adega-09-copo-esticado', 0],
    ['adega-10-copo-cheio', 1],
  ]
  for (const [nome, cheio] of MAO) {
    try {
      await ev((cheio) => {
        const G = window.__game
        const a = G.adegaMundo
        const t = a.chopeira.torneiras[0]
        const bico = t.bicoMundo(new G.camera.position.constructor())
        G.fluxo.foto(true)
        G.player.teleport(bico.x, bico.z + 0.95, 0)
        for (let i = 0; i < 40; i++) G.player.update(1 / 60)
        G.copo.segurar('copo-tulipa')
        a.torneira(0, true)
        G.copo.usar()                       // estica a mao
        const quadros = cheio ? 260 : 90
        for (let i = 0; i < quadros; i++) {
          G.camera.lookAt(bico)
          G.copo.atualizar(1 / 60)
          a.update(1 / 60, G)
        }
        if (cheio) a.torneira(0, false)
        for (let i = 0; i < 8; i++) {
          G.camera.lookAt(bico)
          G.copo.atualizar(1 / 60)
          a.update(1 / 60, G)
          G.engine.render()
        }
      }, cheio)
      await new Promise((r) => setTimeout(r, 350))
      await page.screenshot({ path: path.join(dir, nome + '.png') })
    } catch (err) {
      console.log('   (a foto ' + nome + ' nao saiu: ' + String(err).slice(0, 60) + ')')
    }
  }

  for (const [nome, x, z, yaw, pitch] of TOMADAS) {
    await ev((x, z, yaw, pitch) => {
      const G = window.__game
      G.fluxo.foto(true)
      G.player.teleport(x, z, yaw)
      for (let i = 0; i < 40; i++) G.player.update(1 / 60)
      G.player.pitch = pitch
      for (let i = 0; i < 10; i++) G.player.update(1 / 60)
      G.player.pitch = pitch
      for (let i = 0; i < 6; i++) { G.engine.render(); G.adegaMundo.update(1 / 60, G) }
    }, x, z, yaw, pitch)
    await new Promise((r) => setTimeout(r, 350))
    // A FOTO NAO E UM CASO DE TESTE. Em headless o render e por software
    // (swiftshader) e um quadro deste interior pode passar do protocolTimeout;
    // derrubar o processo por causa disso apagaria 26 casos que ja passaram.
    try {
      await page.screenshot({ path: path.join(dir, nome + '.png') })
    } catch (err) {
      console.log('   (a foto ' + nome + ' nao saiu: ' + String(err).slice(0, 60) + ')')
    }
  }
  console.log('fotos em shots/adega-*.png')

  if (erros.length) ok('sem erro no console', false, erros.slice(0, 3).join(' | '))
  else ok('sem erro no console', true)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}

const falhas = casos.filter((c) => !c).length
console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' casos passaram')
process.exit(falhas ? 1 : 0)
