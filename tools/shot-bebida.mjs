// A BEBIDA NA MAO, EM PRIMEIRA PESSOA: parado, andando e correndo.
//
//   node tools/shot-bebida.mjs                  -> as tres bebidas, os tres estados
//   node tools/shot-bebida.mjs whiskey-garrafa  -> so uma
//   node tools/shot-bebida.mjs 3a               -> so a foto de 3a pessoa
//   node tools/shot-bebida.mjs perto            -> so o CLOSE da pega
//   node tools/shot-bebida.mjs copo             -> os copos, cheios de chope
//   node tools/shot-bebida.mjs grade            -> FOLHA DE CONTATO da pega
//   node tools/shot-bebida.mjs espelho          -> a mesma folha com a mao ESPELHADA
//   node tools/shot-bebida.mjs par [graus]      -> UM angulo, as duas maos lado a lado
//   node tools/shot-bebida.mjs fino [graus]     -> leque FINO em volta de um angulo
//   node tools/shot-bebida.mjs pega [graus]     -> combina giro x polegar x aperto
//   node tools/shot-bebida.mjs tudo             -> uma celula por TIPO de peca
//
// O '3a' existe porque a foto de 3a pessoa e a que mais precisou de idas e
// vindas (a pose do braco que carrega) e a que menos depende das outras: sem
// ele, conferir um ajuste de cotovelo custava as nove fotos de 1a pessoa junto,
// que sao ~15 minutos de renderizador por software.
//
// O 'perto' existe porque a queixa que mandou refazer a mao inteira foi "os
// dedos ficaram estranhos", e NAS FOTOS DE JOGO NAO DAVA PRA VER: na pose real
// a peca tem uns 120 px de altura, e a mao cabe num punhado de pixels. Este
// modo joga a peca a 20 cm do olho, centrada, so pra julgar a PEGA — se o dedo
// dobra, se a fileira de nos aparece, se o polegar le como polegar, se sobrou
// fresta entre dedo e vidro. Bebida nova passa por aqui antes de entrar.
//
// POR QUE ESTA FERRAMENTA EXISTE, e por que ela nao e um luxo: a pose de um
// item de mao sao SEIS NUMEROS (tres de posicao, tres de rotacao) em espaco de
// camera, e o que eles produzem na tela depende ao mesmo tempo do FOV, da
// altura dos olhos, do tamanho da peca e da altura em que a mao a agarra.
// Nenhum deles da pra prever lendo o codigo. Sem isto aqui, cada tentativa de
// afinar custa: salvar, abrir o jogo, comprar a bebida, olhar, repetir.
//
// E ela vai continuar sendo usada: o dono do projeto avisou que "vao entrar
// outras bebidas depois". Bebida nova = uma linha em BEBIDAS (com o bloco
// `mao`) e uma rodada aqui pra ver se o punho fechou no lugar certo.
//
// OS TRES ESTADOS SAO O PONTO. Parado mostra o enquadramento; ANDANDO mostra o
// balanco (que sai da mesma fase da camera, ver player/mao.js); CORRENDO mostra
// a POSE DE CORRIDA, que e outra pose e nao o mesmo gesto acelerado. Um item de
// mao que so foi conferido parado e um adesivo colado na tela, e e exatamente
// isso que a foto de 'correndo' denuncia.
//
// As teclas sao DISPARADAS DE VERDADE (KeyboardEvent no window, que e onde
// core/input.js escuta): o caminho e o mesmo do jogador, entao a foto nao pode
// mentir por causa de um atalho do teste.
//
// ELA NAO USA O DEV SERVER, pela mesma razao de tools/shot-catalogo.mjs: sao
// nove tomadas no renderizador por software, alguns minutos de relogio, e
// QUALQUER arquivo salvo nesse meio tempo — por outra aba do editor, por outro
// agente — faz o Vite recarregar a pagina e matar o contexto no meio da rodada.
// Foi o que aconteceu duas vezes antes desta mudanca. Servindo o `dist`
// estatico (npm run build + servidor.js), o que esta na tela fica na tela.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8700 + (process.pid % 90)
const URL_BASE = process.env.GAME_URL || ('http://127.0.0.1:' + PORTA)

const BEBIDAS = ['cerveja-lata', 'vodka-garrafa', 'whiskey-garrafa']

// Onde fotografar: a avenida em frente as lojas. Chao plano e sem parede a
// meio metro do nariz — parede perto tapa a peca e nao da pra julgar nada.
const LUGAR = { x: 2, z: 9, yaw: 0 }

// Cada estado: as teclas seguradas e por quantos quadros. Correr precisa dos
// quadros: a rampa andar<->correr da pose leva ~1 s pra chegar no fim, e uma
// foto tirada antes disso mostra uma pose que nao existe em lugar nenhum.
const ESTADOS = [
  { nome: 'parado', teclas: [], quadros: 30 },
  { nome: 'andando', teclas: ['KeyW'], quadros: 80 },
  { nome: 'correndo', teclas: ['KeyW', 'ShiftLeft'], quadros: 110 },
]

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

// Os copos entram aqui e nao numa ferramenta propria porque o que se julga e o
// MESMO: a pega. Desde que a mao passou a ser uma so (player/mao.js, usada
// tambem pelo copo), conferir a lata e nao conferir o copo e conferir metade.
// A diferenca e que o copo tem CHOPE dentro — nivel, colarinho e bolha —, entao
// ele e enchido antes da foto.
const COPOS = ['copo-americano', 'copo-tulipa', 'caneca-chope']

// A FOLHA DE CONTATO existe porque afinar a pega uma foto por vez nao estava
// funcionando: cada rodada custa alguns minutos de render por software, o dono
// olha UMA imagem, diz que esta errada, e a proxima tentativa e outro chute meu
// sobre o que ele quis dizer. Foram cinco rodadas assim.
//
// Aqui saem TODAS as posicoes de uma vez, numeradas, numa imagem so: quem olha
// aponta o numero e acabou. E o mesmo remedio que tools/shot-catalogo.mjs usa
// pros catalogos de rosto — quando as opcoes sao muitas e o julgamento e visual,
// a grade e mais barata que a conversa.
//
// A varredura e do GIRO (de que lado a mao entra e por onde os dedos passam) nos
// dois sentidos do CIMA (polegar pra cima ou pra baixo). Sao os dois unicos
// graus de liberdade da colocacao — ver PUNHO em src/player/mao.js.
const N_GIROS = 12
const POSE_GRADE = { pos: [0.0, -0.045, -0.30] }

const args = process.argv.slice(2)
// 'par': o mesmo angulo com as DUAS quiralidades, grande, lado a lado. E a
// pergunta que sobrou depois de o dono escolher a posicao na folha de contato —
// qual das duas maos e a que ele quer ali. Uma imagem, duas opcoes.
// 'fino': seis angulos de 15 em 15 em volta de um centro, ja com a quiralidade
// que o dono escolheu. Serve pra afinar DEPOIS que a folha de contato grossa
// (de 30 em 30) definiu a regiao — que foi o caminho que funcionou aqui.
// 'pega': o leque de tres eixos ao mesmo tempo — giro, inclinacao do polegar e
// aperto da palma. Quando a queixa deixa de ser "o lado esta errado" e passa a
// ser "encaixa melhor", nao adianta varrer um eixo por vez: o que se julga e a
// combinacao.
// 'tudo': uma celula por TIPO de peca — lata, garrafa, copo, erva — mais o copo
// SERVINDO e BEBENDO. A pega e uma so e o raio de cada peca e que muda tudo, do
// quanto o dedo enrola ao lugar do polegar; conferir so na lata e conferir um
// caso de seis. E as duas poses do copo (torneira e boca) sao as unicas em que a
// mao sai do lugar de sempre.
const soTudo = args.includes('tudo')

const soPega = args.includes('pega')

const soFino = args.includes('fino')

const soPar = args.includes('par')
const grausPar = Number(args.find((a) => /^\d+(\.\d+)?$/.test(a))) || 240

const soGrade = args.includes('grade') || args.includes('espelho')
// A folha espelhada existe por uma duvida concreta: o dono escolheu a POSICAO e
// disse que a MAO esta errada (queria a direita). A geometria vem da tabela da
// mao direita do boneco e rotacao nao troca quiralidade, entao ela deveria ser a
// direita — mas discutir isso por escrito nao resolve. Com as duas folhas lado a
// lado ele aponta qual e, e ai da pra saber se ha um erro no caminho ou se o que
// enganava era estar vendo a palma em vez do dorso.
const espelhado = args.includes('espelho')
const so3a = args.includes('3a')
const soPerto = args.includes('perto')
const soCopo = args.includes('copo')
const pedidas = args.filter((a) => BEBIDAS.includes(a))
const escolhidas = pedidas.length ? pedidas : BEBIDAS
const lista = (so3a || soPerto || soCopo || soGrade || soPar || soFino || soPega || soTudo)
  ? [] : escolhidas

// A pose de inspecao do modo 'perto'. Centrada e a 20 cm: o near da camera e
// 0.05, entao nada corta. O giro de -0.18 tira a peca do frontal exato — de
// frente perfeita a mao fica achatada e nao da pra ver o quanto o dedo enrola.
// SO A DISTANCIA. O `rot` saiu daqui: sobrescrever a rotacao da pose apagava a
// inclinacao do conjunto (o tombo que poe o punho vindo de baixo) e o close
// mostrava um enquadramento que NAO EXISTE no jogo — eu julguei a mao duas
// vezes por uma foto assim e as duas vezes conclui errado. Agora o modo 'perto'
// so puxa a peca pra 20 cm; o angulo continua sendo o de jogo.
const POSE_PERTO = { pos: [0.0, -0.030, -0.205] }

// build + servidor estatico proprio (ver o cabecalho: sem Vite, sem HMR)
const build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
await new Promise((r) => build.on('exit', r))
const srv = process.env.GAME_URL ? null : spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }), stdio: 'ignore',
})
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(URL_BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}

const PORT = 9411 + (process.pid % 130)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-beb-' + PORT),
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

/**
 * Roda `n` quadros do jogo de verdade (o rAF nao gira sozinho em headless).
 *
 * O RELOGIO NAO E LUXO: em headless a aba so compoe quando alguem pede, e o rAF
 * pode simplesmente PARAR no meio (foi o que aconteceu na primeira versao desta
 * ferramenta — a tomada de 'correndo' ficou pendurada ate o protocolTimeout do
 * puppeteer estourar e a rodada inteira se perdeu, depois de dois minutos de
 * render por software ja gastos). Com o teto de tempo, quadro que nao vem vira
 * uma foto pior, e nao uma rodada perdida.
 */
async function quadros(page, n, msMax = 25000) {
  const houve = await page.evaluate((k, teto) => new Promise((res) => {
    let i = 0
    const fim = performance.now() + teto
    const f = () => {
      if (++i >= k || performance.now() > fim) res(i)
      else requestAnimationFrame(f)
    }
    requestAnimationFrame(f)
  }), n, msMax)
  if (houve < n) console.log('  (so ' + houve + ' de ' + n + ' quadros; o rAF parou)')
}

const browser = await puppeteer.connect({
  browserWSEndpoint: await esperarDebugger(),
  protocolTimeout: 480000,
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 220)))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text().slice(0, 220))
  })

  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.mao', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2200))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  // Entra no jogo uma vez so. A ajuda sai da tela: ela ocupa a metade de baixo
  // da esquerda e nao tem nada a ver com o que estamos julgando aqui.
  await page.evaluate((lugar) => {
    const G = window.__game
    G.fluxo.jogar()
    G.hud.showHelp(false)
    G.player.teleport(lugar.x, lugar.z, lugar.yaw)
  }, LUGAR)
  await quadros(page, 40)

  for (const id of lista) {
    for (const est of ESTADOS) {
      await page.evaluate((idBebida, teclas, lugar) => {
        const G = window.__game
        // volta pro ponto de partida a cada tomada: correndo, a tomada anterior
        // deixou o jogador vinte metros adiante, dentro de outra rua
        G.player.teleport(lugar.x, lugar.z, lugar.yaw)
        G.inventario.limpar()
        G.pegouItem(idBebida)
        for (const code of teclas) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
        }
      }, id, est.teclas, LUGAR)

      await quadros(page, est.quadros)

      const arq = path.join(dir, 'mao-' + id + '-' + est.nome + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)

      await page.evaluate((teclas) => {
        for (const code of teclas) {
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
        }
      }, est.teclas)
      await quadros(page, 20)
    }
  }

  // --- uma celula por tipo de peca -----------------------------------------
  if (soTudo) {
    const cels = []
    const tomar = async (rotulo, codigo) => {
      const url = await page.evaluate(async (cod) => {
        const G = window.__game
        G.hud.setJogando(false)
        G.inventario.limpar()
        // eslint-disable-next-line no-new-func
        await new Function('G', 'return (async () => { ' + cod + ' })()')(G)
        for (let k = 0; k < 12; k++) {
          G.player.update(1 / 60)
          G.mao.atualizar(1 / 60)
          if (G.copo) G.copo.atualizar(1 / 60)
        }
        G.engine.render()
        return G.renderer.domElement.toDataURL('image/png')
      }, codigo)
      cels.push({ url, rotulo, n: cels.length + 1 })
    }

    await tomar('lata de cerveja', "G.pegouItem('cerveja-lata')")
    await tomar('garrafa de vodka', "G.pegouItem('vodka-garrafa')")
    await tomar('garrafa de whiskey', "G.pegouItem('whiskey-garrafa')")
    await tomar('folha seca (erva)', "G.pegouItem('erva-broto')")
    await tomar('copo cheio de chope',
      "G.pegouItem('copo-tulipa'); G.copo.usar();"
      + " for (let i=0;i<40;i++) G.copo.encher(0.2, 0xe0a02c, 0.55, 'Chope')")
    await tomar('SERVINDO (mao estendida)',
      "G.pegouItem('copo-tulipa'); G.copo.usar();"
      + " for (let i=0;i<10;i++) G.copo.encher(0.2, 0xe0a02c, 0.55, 'Chope')")
    await tomar('BEBENDO (copo na boca)',
      "G.pegouItem('copo-tulipa'); G.copo.usar();"
      + " for (let i=0;i<40;i++) G.copo.encher(0.2, 0xe0a02c, 0.55, 'Chope');"
      + " G.copo.usar();"
      + " for (let i=0;i<22;i++) { G.player.update(1/60); G.copo.atualizar(1/60) }")

    await page.evaluate((c) => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;padding:12px;'
        + 'overflow:auto;font:14px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
      const t = document.createElement('div')
      t.textContent = 'A MESMA PEGA EM TUDO'
      t.style.cssText = 'font-size:19px;font-weight:bold;margin-bottom:10px'
      d.appendChild(t)
      const g = document.createElement('div')
      g.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
      for (const cel of c) {
        const w = document.createElement('div')
        const lb = document.createElement('div')
        lb.textContent = '#' + cel.n + '   ' + cel.rotulo
        lb.style.cssText = 'padding:3px 0;color:#9fe8c0;font-weight:bold;font-size:15px'
        const jan = document.createElement('div')
        jan.style.cssText = 'width:410px;height:320px;overflow:hidden;position:relative;'
          + 'background:#202228;border:1px solid #3a3d45'
        const im = document.createElement('img')
        im.src = cel.url
        im.style.cssText = 'width:700px;position:absolute;left:-145px;top:-60px'
        jan.appendChild(im)
        w.appendChild(lb); w.appendChild(jan); g.appendChild(w)
      }
      d.appendChild(g)
      document.body.appendChild(d)
    }, cels)
    await new Promise((r) => setTimeout(r, 700))
    const arq = path.join(dir, 'pega-tudo.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  // --- leque de PEGA (giro x polegar x aperto) -------------------------------
  if (soPega) {
    const idBebida = pedidas[0] || 'cerveja-lata'
    await page.evaluate((id, pose) => {
      const G = window.__game
      G.hud.setJogando(false)
      G.inventario.limpar()
      G.pegouItem(id)
      for (const nome of ['andar', 'correr']) {
        G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
      }
    }, idBebida, POSE_GRADE)
    await quadros(page, 20)

    // Seis combinacoes: o giro avanca alem do ultimo que o dono viu, o polegar
    // vai deitando e a palma vai fechando. Sao os tres pedidos dele juntos.
    const base = grausPar
    // Partindo da combinacao que o dono aprovou (o #6 da rodada anterior:
    // 120 graus, polegar 1.15, aperto 7 mm), o que varia agora e o GIRO e o
    // quanto o POLEGAR ENROLA — os dois pedidos que sobraram: "gire um pouco
    // mais" e "o dedao na frente da lata, servindo de apoio".
    const combos = [
      { graus: base, polegarX: 1.15, aperto: 0.007, polegarCurva: 1.3 },
      { graus: base, polegarX: 1.15, aperto: 0.007, polegarCurva: 1.7 },
      { graus: base + 15, polegarX: 1.15, aperto: 0.008, polegarCurva: 1.3 },
      { graus: base + 15, polegarX: 1.15, aperto: 0.008, polegarCurva: 1.7 },
      { graus: base + 30, polegarX: 1.30, aperto: 0.008, polegarCurva: 1.5 },
      { graus: base + 30, polegarX: 1.30, aperto: 0.009, polegarCurva: 1.9 },
    ]
    const cels = []
    for (const c of combos) {
      const url = await page.evaluate((o) => {
        const G = window.__game
        G.mao.ajustarPunho({
          giro: (o.graus * Math.PI) / 180, cima: true, espelhar: true,
          polegarX: o.polegarX, aperto: o.aperto, polegarCurva: o.polegarCurva,
        })
        for (let k = 0; k < 10; k++) { G.player.update(1 / 60); G.mao.atualizar(1 / 60) }
        G.engine.render()
        return G.renderer.domElement.toDataURL('image/png')
      }, c)
      cels.push(Object.assign({ url, n: cels.length + 1 }, c))
    }

    await page.evaluate((c) => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;padding:12px;'
        + 'overflow:auto;font:14px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
      const t = document.createElement('div')
      t.textContent = 'PEGADA — giro + polegar deitado + palma fechada'
      t.style.cssText = 'font-size:19px;font-weight:bold;margin-bottom:10px'
      d.appendChild(t)
      const g = document.createElement('div')
      g.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
      for (const cel of c) {
        const w = document.createElement('div')
        const lb = document.createElement('div')
        lb.textContent = '#' + cel.n + '   ' + cel.graus + ' graus  ·  polegar '
          + cel.polegarX.toFixed(2) + ' / enrola ' + cel.polegarCurva.toFixed(1)
          + '  ·  aperto ' + (cel.aperto * 1000).toFixed(0) + 'mm'
        lb.style.cssText = 'padding:3px 0;color:#9fe8c0;font-weight:bold;font-size:15px'
        const jan = document.createElement('div')
        jan.style.cssText = 'width:410px;height:320px;overflow:hidden;position:relative;'
          + 'background:#202228;border:1px solid #3a3d45'
        const im = document.createElement('img')
        im.src = cel.url
        im.style.cssText = 'width:700px;position:absolute;left:-145px;top:-60px'
        jan.appendChild(im)
        w.appendChild(lb); w.appendChild(jan); g.appendChild(w)
      }
      d.appendChild(g)
      document.body.appendChild(d)
    }, cels)
    await new Promise((r) => setTimeout(r, 700))
    const arq = path.join(dir, 'pegada.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  // --- leque fino ----------------------------------------------------------
  if (soFino) {
    const idBebida = pedidas[0] || 'cerveja-lata'
    await page.evaluate((id, pose) => {
      const G = window.__game
      G.hud.setJogando(false)
      G.inventario.limpar()
      G.pegouItem(id)
      for (const nome of ['andar', 'correr']) {
        G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
      }
    }, idBebida, POSE_GRADE)
    await quadros(page, 20)

    const centro = grausPar
    const cels = []
    for (let i = -2; i <= 3; i++) {
      const graus = centro + i * 15
      const url = await page.evaluate((g) => {
        const G = window.__game
        // espelhada: e a quiralidade que o dono escolheu (opcao B)
        G.mao.ajustarPunho({ giro: (g * Math.PI) / 180, cima: true, espelhar: true })
        for (let k = 0; k < 10; k++) { G.player.update(1 / 60); G.mao.atualizar(1 / 60) }
        G.engine.render()
        return G.renderer.domElement.toDataURL('image/png')
      }, graus)
      cels.push({ url, graus, n: cels.length + 1 })
    }

    await page.evaluate((c) => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;padding:12px;'
        + 'overflow:auto;font:14px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
      const t = document.createElement('div')
      t.textContent = 'AJUSTE FINO — mao espelhada (opcao B) · escolha o numero'
      t.style.cssText = 'font-size:19px;font-weight:bold;margin-bottom:10px'
      d.appendChild(t)
      const g = document.createElement('div')
      g.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'
      for (const cel of c) {
        const w = document.createElement('div')
        const lb = document.createElement('div')
        lb.textContent = '#' + cel.n + '   ' + cel.graus + ' graus'
        lb.style.cssText = 'padding:3px 0;color:#9fe8c0;font-weight:bold;font-size:16px'
        const jan = document.createElement('div')
        jan.style.cssText = 'width:410px;height:320px;overflow:hidden;position:relative;'
          + 'background:#202228;border:1px solid #3a3d45'
        const im = document.createElement('img')
        im.src = cel.url
        // ENQUADRAMENTO MAIS ABERTO que o da folha grossa: aqui a pergunta e se
        // a mao ENCAIXA na peca, e pra responder isso e preciso ver a peca
        // inteira — a lata acima e abaixo do punho. Recortado apertado, toda
        // celula vira um punho fechado no ar e nao da pra julgar nada.
        im.style.cssText = 'width:700px;position:absolute;left:-145px;top:-60px'
        jan.appendChild(im)
        w.appendChild(lb); w.appendChild(jan); g.appendChild(w)
      }
      d.appendChild(g)
      document.body.appendChild(d)
    }, cels)
    await new Promise((r) => setTimeout(r, 700))
    const arq = path.join(dir, 'fino-pega.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  // --- as duas maos no mesmo angulo ----------------------------------------
  if (soPar) {
    const idBebida = pedidas[0] || 'cerveja-lata'
    await page.evaluate((id, pose) => {
      const G = window.__game
      G.hud.setJogando(false)
      G.inventario.limpar()
      G.pegouItem(id)
      for (const nome of ['andar', 'correr']) {
        G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
      }
    }, idBebida, POSE_GRADE)
    await quadros(page, 20)

    const cels = []
    for (const esp of [false, true]) {
      const url = await page.evaluate((g, e) => {
        const G = window.__game
        G.mao.ajustarPunho({ giro: g, cima: true, espelhar: e })
        for (let i = 0; i < 10; i++) { G.player.update(1 / 60); G.mao.atualizar(1 / 60) }
        G.engine.render()
        return G.renderer.domElement.toDataURL('image/png')
      }, (grausPar * Math.PI) / 180, esp)
      cels.push({ url, esp })
    }

    await page.evaluate((c, graus) => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;padding:14px;'
        + 'font:15px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
      const t = document.createElement('div')
      t.textContent = 'POSICAO ' + graus + ' GRAUS — qual mao?'
      t.style.cssText = 'font-size:20px;font-weight:bold;margin-bottom:12px'
      d.appendChild(t)
      const g = document.createElement('div')
      g.style.cssText = 'display:flex;gap:14px'
      for (const cel of c) {
        const w = document.createElement('div')
        const lb = document.createElement('div')
        lb.textContent = cel.esp ? 'B — ESPELHADA' : 'A — COMO ESTA'
        lb.style.cssText = 'padding:4px 0;font-size:17px;font-weight:bold;color:'
          + (cel.esp ? '#9fe8c0' : '#ffd98a')
        const jan = document.createElement('div')
        jan.style.cssText = 'width:600px;height:460px;overflow:hidden;position:relative;'
          + 'background:#202228;border:1px solid #3a3d45'
        const im = document.createElement('img')
        im.src = cel.url
        im.style.cssText = 'width:1280px;position:absolute;left:-340px;top:-170px'
        jan.appendChild(im)
        w.appendChild(lb); w.appendChild(jan); g.appendChild(w)
      }
      d.appendChild(g)
      document.body.appendChild(d)
    }, cels, graus2 => graus2)
    await page.evaluate((graus) => {
      const t = document.querySelector('div[style*="99999"] div')
      if (t) t.textContent = 'POSICAO ' + graus + ' GRAUS — qual mao?'
    }, grausPar)
    await new Promise((r) => setTimeout(r, 700))
    const arq = path.join(dir, 'par-maos.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  // --- folha de contato da pega --------------------------------------------
  if (soGrade) {
    const idBebida = pedidas[0] || 'cerveja-lata'
    await page.evaluate((id, pose) => {
      const G = window.__game
      G.hud.setJogando(false)
      G.inventario.limpar()
      G.pegouItem(id)
      for (const nome of ['andar', 'correr']) {
        G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
      }
    }, idBebida, POSE_GRADE)
    await quadros(page, 20)

    // uma celula por vez: renderizar 24 quadros dentro de um evaluate so
    // estoura o protocolTimeout no renderizador por software
    const celulas = []
    for (let ci = 0; ci < 2; ci++) {
      for (let gi = 0; gi < N_GIROS; gi++) {
        const giro = (gi / N_GIROS) * Math.PI * 2
        const cima = ci === 0
        const url = await page.evaluate((g, c, esp) => {
          const G = window.__game
          G.mao.ajustarPunho({ giro: g, cima: c, espelhar: esp })
          // o item so se move dentro do atualizar da mao; sem estes passos a
          // celula sai com a pose da celula anterior
          for (let i = 0; i < 8; i++) { G.player.update(1 / 60); G.mao.atualizar(1 / 60) }
          G.engine.render()
          // toDataURL logo apos o render, no MESMO turno de JS: depois disso o
          // buffer ja foi trocado e a imagem sai preta
          return G.renderer.domElement.toDataURL('image/png')
        }, giro, cima, espelhado)
        celulas.push({ url, rot: (giro * 180 / Math.PI).toFixed(0), cima, n: celulas.length + 1 })
      }
    }

    await page.evaluate((esp) => { window.__espelhado = esp }, espelhado)
    await page.evaluate((cels, nome) => {
      const d = document.createElement('div')
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#15171c;'
        + 'overflow:auto;padding:10px;font:13px "Trebuchet MS",system-ui,sans-serif;color:#dbe6f2'
      const t = document.createElement('div')
      t.textContent = 'PEGA — ' + nome + (window.__espelhado ? '  ·  MAO ESPELHADA' : '')
        + '  ·  escolha o numero'
      t.style.cssText = 'font-size:17px;font-weight:bold;margin:2px 0 10px'
      d.appendChild(t)
      const g = document.createElement('div')
      g.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px'
      for (const c of cels) {
        const cel = document.createElement('div')
        cel.style.cssText = 'width:300px'
        const lb = document.createElement('div')
        lb.textContent = '#' + c.n + '   ' + c.rot + ' graus   ' + (c.cima ? 'polegar p/ cima' : 'polegar p/ baixo')
        lb.style.cssText = 'padding:3px 0;color:#9fe8c0;font-weight:bold'
        // RECORTE COM ESCALA. A primeira versao usava object-fit:none, que
        // recorta 300x230 do quadro de 1280x720 em 1:1 — e como a peca ocupa
        // meia tela nessa pose, cada celula mostrava um PEDACO ampliado da mao
        // em vez da pega inteira. Aqui a imagem entra pela metade do tamanho
        // dentro de uma janela com overflow, deslocada pra centrar a peca:
        // mostra uma regiao de 600x460 do original, reduzida pra caber.
        const jan = document.createElement('div')
        jan.style.cssText = 'width:300px;height:230px;overflow:hidden;position:relative;'
          + 'background:#202228;border:1px solid #3a3d45'
        const im = document.createElement('img')
        im.src = c.url
        im.style.cssText = 'width:640px;position:absolute;left:-170px;top:-85px'
        jan.appendChild(im)
        cel.appendChild(lb); cel.appendChild(jan); g.appendChild(cel)
      }
      d.appendChild(g)
      document.body.appendChild(d)
      void 0
    }, celulas, idBebida)
    await new Promise((r) => setTimeout(r, 800))
    const arq = path.join(dir, espelhado ? 'grade-pega-espelhada.png' : 'grade-pega.png')
    await page.screenshot({ path: arq, fullPage: true })
    console.log(arq)
  }

  // --- copos com chope -----------------------------------------------------
  if (soCopo) {
    for (const id of COPOS) {
      await page.evaluate(async (idCopo, pose) => {
        const G = window.__game
        G.hud.setJogando(false)
        G.inventario.limpar()
        G.pegouItem(idCopo)
        // O COPO TEM POSES PROPRIAS (ele e uma maquina de estados com quatro
        // delas), entao mexer nas de player/mao.js nao move copo nenhum — foi
        // por isso que a primeira rodada saiu na distancia de jogo, com o
        // colarinho do tamanho de um risco.
        const P = (G.copo && G.copo.poses) || null
        if (P) {
          for (const nome of ['ociosa', 'correr', 'estendida', 'boca']) {
            if (!P[nome]) continue
            P[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
          }
        }
        // ESTICA A MAO ANTES: encher() recusa com a mao ociosa (`estendido`),
        // que e a mesma trava que impede o jogador de encher o copo andando
        // pela rua. Sem isto a foto saia com o copo VAZIO — foi o que
        // aconteceu na primeira rodada.
        const f = G.copo && G.copo.ficha
        const esp = (f && f.copo && f.copo.espuma) || 0.5
        if (G.copo) {
          G.copo.usar()
          for (let i = 0; i < 40; i++) G.copo.encher(0.2, 0xd8901c, esp, 'Chope')
        }
      }, id, POSE_PERTO)
      await quadros(page, 40)
      const arq = path.join(dir, 'mao-copo-' + id + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)
    }
  }

  // --- close da pega -------------------------------------------------------
  if (soPerto) {
    for (const id of escolhidas) {
      await page.evaluate((idBebida, pose) => {
        const G = window.__game
        // o HUD sai inteiro: aqui so interessa a mao
        G.hud.setJogando(false)
        G.inventario.limpar()
        G.pegouItem(idBebida)
        // as DUAS poses, senao um Shift acidental no meio da tomada troca o
        // enquadramento; e elas sao objetos vivos (ver api.poses em mao.js)
        for (const nome of ['andar', 'correr']) {
          G.mao.poses[nome].pos.set(pose.pos[0], pose.pos[1], pose.pos[2])
        }
      }, id, POSE_PERTO)
      await quadros(page, 40)
      const arq = path.join(dir, 'mao-perto-' + id + '.png')
      await page.screenshot({ path: arq })
      console.log(arq)
    }
  }

  // UMA em terceira pessoa, com o whiskey: e o outro caminho do modulo (a peca
  // pendurada na junta handR do boneco em vez de colada na camera), e ele quebra
  // calado — na tela do jogador em 1a pessoa nada muda.
  if (!soPerto && !soCopo && !soGrade && !soPar && !soFino && !soPega && !soTudo) {
    await page.evaluate(() => {
      const G = window.__game
      G.inventario.limpar()
      G.pegouItem('whiskey-garrafa')
      G.player.setMode('third')
    })
    await quadros(page, 60)
    const arq3 = path.join(ROOT, 'shots', 'mao-3a-pessoa.png')
    await page.screenshot({ path: arq3 })
    console.log(arq3)
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
  try { if (srv) srv.kill() } catch (err) { void err }
}
