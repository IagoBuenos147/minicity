// Fotos das TELAS do jogo (menu, criacao de personagem, cutscene, tutorial).
//
//   node tools/shot-tela.mjs             -> tira todas
//   node tools/shot-tela.mjs menu        -> so o grupo 'menu'
//
// Por que este arquivo existe separado de tools/shot-clima.mjs: aquele salva o
// CANVAS (toDataURL), que e o certo pra fotografar o mundo 3D e nada mais. As
// telas deste jogo sao DOM por cima do canvas — menu, painel de customizacao,
// baloes da cutscene, HUD. Num toDataURL do canvas elas simplesmente nao
// existem. Aqui a foto e page.screenshot(), que compoe as duas camadas.
//
// O outro motivo: page.screenshot() FORCA um quadro. Em headless a aba nao
// compoe sozinha e o requestAnimationFrame do jogo nao dispara — e por isso
// que cada tomada aqui pede um punhado de quadros na mao antes de clicar.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { garantirServidor } from './servidor-dev.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL_BASE = process.env.GAME_URL || 'http://localhost:5173'

// Cada tomada: { nome, antes, quadros, espera }
//   antes    codigo rodado na pagina (recebe G = window.__game)
//   quadros  quantos quadros do jogo forcar antes de clicar
//   espera   ms de relogio depois do 'antes' (pra transicao de CSS terminar)
export const GRUPOS = {
  menu: [
    { nome: 'tela-01-menu', antes: "G.menu.abrir('principal')", espera: 900 },
    { nome: 'tela-02-modo', antes: "G.menu.abrir('modo')", espera: 700 },
    {
      nome: 'tela-03-lobby',
      antes: `G.menu.abrir('lobby')
        G.menu.setSala({ fase:'lobby', anfitriao:1, meuId:1, jogadores:[
          { id:1, nome:'Iago', pronto:false }, { id:2, nome:'Irmao', pronto:false } ] })
        G.menu.setMensagem('')`,
      espera: 700,
    },
    { nome: 'tela-04-opcoes', antes: "G.menu.abrir('opcoes')", espera: 700 },
  ],
  criacao: [
    {
      nome: 'tela-05-criacao',
      // pelo FLUXO de verdade (o mesmo que o botao SOLO do menu dispara), e
      // nao abrindo o painel na mao: e o estado 'criacao' que faz o laco
      // desenhar o palco em vez da cidade
      antes: 'G.fluxo.solo()',
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-06-criacao-roupa',
      antes: `G.criacao.abrir({ modo:'coop', nome:'Iago', prontos:1, total:3 })
        G.criacao.setJogadores([{id:1,nome:'Iago',pronto:true},
          {id:2,nome:'Irmao',pronto:false},{id:3,nome:'Primo',pronto:false}])
        G.criacao.setProntos(1, 3)`,
      quadros: 40, espera: 900,
    },
  ],
  casa: [
    {
      nome: 'tela-07-casa-fora',
      antes: `G.fluxo.foto(true)
        const p = G.casa && G.casa.poseDaCutscene
        const c = G.camera
        if (p) { c.position.set(p.x, p.y, p.z); c.lookAt(p.olharX, p.olharY, p.olharZ) }
        else { c.position.set(44, 2.0, 6); c.lookAt(44, 2.0, 14) }
        c.fov = 62; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.30); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-08a-porta-fechada',
      antes: `const c = G.camera
        c.position.set(44.6, 1.72, 8.6); c.lookAt(43.2, 1.6, 12.1)
        c.fov = 68; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'tela-08b-porta-aberta',
      antes: `const it = G.interaction.items.find(i=>i.id==='casa-porta')
        if (it) it.onInteract(G)
        for (let i=0;i<180;i++) G.casa.update(1/60, G)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'tela-08-casa-dentro',
      antes: `const c = G.camera
        c.position.set(39.6, 1.75, 13.2); c.lookAt(45.6, 1.35, 20.5)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'tela-09-casa-corredor',
      antes: `const c = G.camera
        c.position.set(49.0, 1.75, 19.0); c.lookAt(43.0, 1.30, 22.6)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
  ],
  // O painel de DENTRO do jogo (barbeiro / provador), que era a queixa da
  // camera com movel na frente.
  barbeiro: [
    {
      nome: 'tela-12-barbeiro',
      antes: `G.fluxo.jogar()
        G.player.teleport(22, -20, 0)
        G.openCustomizer('rosto')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-13-roupa',
      antes: `G.openCustomizer('roupa')`,
      quadros: 60, espera: 900,
    },
    {
      nome: 'tela-14-roupa-calcado',
      antes: `const b = [...document.querySelectorAll('.mcrp-cz button, .mcrp-cz [role=tab], .mcrp-cz .cz-aba')]
        const alvo = b.find(x => /CALCADO/i.test(x.textContent || ''))
        if (alvo) alvo.click()`,
      quadros: 60, espera: 900,
    },
  ],
  // contato das miniaturas: uma folha com todas as fotos de alguns campos
  minis: [
    {
      nome: 'minis-1-rosto',
      antes: `G.fluxo.foto(true)
        const campos = ['olhos','pupila','boca','cabelo','sobrancelha','barba','nariz','colar','tatuagem']
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:12px monospace;color:#ddd;padding:6px'
        for (const f of campos) {
          const lin = document.createElement('div')
          lin.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px'
          const t = document.createElement('b'); t.textContent = f; t.style.width='90px'
          lin.appendChild(t)
          for (let i=0;i<8;i++) {
            const u = G.provador.miniatura(f, i)
            if (!u) continue
            const im = document.createElement('img'); im.src = u
            im.style.cssText = 'width:88px;height:88px;background:#222;border:1px solid #444'
            lin.appendChild(im)
          }
          d.appendChild(lin)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
    {
      nome: 'minis-2-pupilas',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:12px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:3px'
        for (let i=0;i<22;i++) {
          const u = G.provador.miniatura('pupila', i)
          if (!u) continue
          const im = document.createElement('img'); im.src = u
          im.style.cssText = 'width:150px;height:150px;background:#222;border:1px solid #444'
          d.appendChild(im)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  colar: [
    {
      nome: 'colar-1-combos',
      antes: `G.fluxo.foto(true)
        const combos = [[0,1],[0,2],[0,3],[0,4],[0,5],[0,6],[0,7],[0,8],[0,9],[0,10],[12,3],[12,5],[12,8],[12,10],[2,4],[9,7]]
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const [bl,co] of combos) {
          const w = document.createElement('div')
          const t = document.createElement('div'); t.textContent = 'blusa '+bl+' colar '+co
          G.provador.setAparencia(Object.assign({}, G.appearance, {blusa:bl, colar:co}))
          G.provador.focar('tronco', true)
          G.provador.atualizar(0.5)
          G.provador.render()
          const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
          im.style.cssText = 'width:196px;height:172px;object-fit:cover;object-position:50% 30%;background:#222;border:1px solid #444'
          w.appendChild(t); w.appendChild(im); d.appendChild(w)
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  tatu: [
    {
      nome: 'tatu-1-corpo',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const pele of [0]) {
          for (let t = 1; t < 11; t++) {
            const w = document.createElement('div')
            const lb = document.createElement('div'); lb.textContent = 'pele '+pele+' tatu '+t
            G.provador.setAparencia(Object.assign({}, G.appearance, {blusa:0, tatuagem:t, pele:pele}))
            G.provador.focar('tronco', true)
            G.provador.atualizar(0.5); G.provador.render()
            const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
            im.style.cssText = 'width:300px;height:340px;object-fit:none;object-position:50% 70%;background:#222;border:1px solid #444'
            w.appendChild(lb); w.appendChild(im); d.appendChild(w)
          }
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  chapeu: [
    {
      nome: 'chapeu-1-cabelo',
      antes: `G.fluxo.foto(true)
        const d = document.createElement('div')
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;overflow:auto;font:11px monospace;color:#ddd;padding:6px;display:flex;flex-wrap:wrap;gap:4px'
        for (const ch of [8, 2, 10]) {
          for (const cb of [12, 4, 0]) {
            const w = document.createElement('div')
            const lb = document.createElement('div'); lb.textContent = 'chapeu '+ch+' cabeca '+cb
            G.provador.setAparencia(Object.assign({}, G.appearance, {chapeu:ch, cabelo:0, sobrancelha:3, cabeca:cb}))
            G.provador.focar('rosto', true)
            G.provador.atualizar(0.5); G.provador.render()
            const im = document.createElement('img'); im.src = G.renderer.domElement.toDataURL('image/png')
            im.style.cssText = 'width:400px;height:300px;object-fit:contain;background:#222;border:1px solid #444'
            w.appendChild(lb); w.appendChild(im); d.appendChild(w)
          }
        }
        document.body.appendChild(d)`,
      espera: 900, semQuadro: true,
    },
  ],
  // As teias de perto: silhueta rasgada, aranha e o balanco de vento.
  teia: [
    {
      nome: 'teia-1-canto',
      antes: `G.fluxo.foto(true)
        const c = G.camera
        c.position.set(38.6, 2.15, 17.0); c.lookAt(37.4, 2.75, 17.4)
        c.fov = 46; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.28); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        for (let i=0;i<60;i++) G.casa.update(1/60, G)
        G.engine.render()`,
      espera: 400, semQuadro: true,
    },
    {
      nome: 'teia-2-fachada',
      antes: `const c = G.camera
        c.position.set(41.4, 2.05, 10.9); c.lookAt(40.2, 2.45, 12.1)
        c.fov = 48; c.updateProjectionMatrix()
        G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
  ],
  // Dentro da casa velha, de dia e de noite. E o par que mostra se a luz
  // interna resolve o "ta muito escuro dentro da casa".
  // Dentro da casa velha, de dia e de noite. E o par que mostra se a luz
  // interna resolve o "ta muito escuro dentro da casa".
  casaluz: [
    {
      nome: 'casa-luz-1-noite',
      antes: `G.fluxo.foto(true)
        G.lighting.pauseCycle = true
        const c = G.camera
        c.position.set(46.4, 1.95, 15.9); c.lookAt(40.6, 0.95, 13.1)
        c.fov = 70; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 500, semQuadro: true,
    },
    {
      nome: 'casa-luz-2-dia',
      antes: `const c = G.camera
        G.lighting.setTimeOfDay(0.22); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'casa-luz-3-porta-noite',
      antes: `const c = G.camera
        c.position.set(44.2, 1.76, 15.4); c.lookAt(42.6, 0.45, 12.5)
        c.fov = 74; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      // A fachada VISTA DE FORA, a noite. A PointLight de dentro nao projeta
      // sombra (uma PointLight com sombra sao seis mapas por quadro), entao ela
      // atravessa a parede: esta foto e quem diz se o vazamento aparece.
      nome: 'casa-luz-5-fora-noite',
      antes: `const c = G.camera
        c.position.set(43.6, 2.20, 4.4); c.lookAt(43.2, 1.70, 12.0)
        c.fov = 58; c.updateProjectionMatrix()
        G.lighting.setTimeOfDay(0.80); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
    {
      nome: 'casa-luz-4-porta-dia',
      antes: `const c = G.camera
        G.lighting.setTimeOfDay(0.22); G.lighting.setTarget(c.position); G.lighting.update(0.0001)
        G.engine.render()`,
      espera: 300, semQuadro: true,
    },
  ],
  cutscene: [
    {
      nome: 'tela-10-porao',
      // Pelo FLUXO de verdade: comecarPartida poe o jogo em 'abertura', e e
      // esse estado que faz o laco desenhar o porao em vez da cidade.
      //
      // As duas primeiras linhas desfazem o que os grupos ANTERIORES deixaram:
      // 'casa', 'barbeiro' e 'casaluz' chamam fluxo.foto(true), que trava a
      // camera e poe o estado em 'jogo' — e comecarPartida comeca com
      // `if (estado === 'abertura' || estado === 'jogo') return`. Rodando a
      // ferramenta SEM ARGUMENTO (todos os grupos em sequencia) a cutscene nao
      // saia do lugar e G.abertura ficava undefined. 'casaluz' ainda deixa o
      // ciclo de dia pausado no meio da noite.
      antes: `G.fluxo.foto(false)
        G.fluxo.menu()
        G.lighting.pauseCycle = false
        G.fluxo.comecar([
          { id:1, nome:'Iago',  aparencia:G.appearance, anfitriao:true },
          { id:2, nome:'Irmao', aparencia:Object.assign({}, G.appearance, {cabeca:4,cabelo:6,pele:5,blusa:9,calca:4,chapeu:2}), anfitriao:false },
          { id:3, nome:'Primo', aparencia:Object.assign({}, G.appearance, {cabeca:9,cabelo:3,pele:8,blusa:14,calca:7,colar:3}), anfitriao:false },
          { id:4, nome:'Amigo', aparencia:Object.assign({}, G.appearance, {cabeca:6,cabelo:8,pele:3,blusa:5,calca:9,chapeu:4}), anfitriao:false },
        ])
        for (let i=0;i<90;i++) G.abertura.atualizar(1/60)`,
      quadros: 3, espera: 500,
    },
    {
      nome: 'tela-11-porao-fala',
      antes: 'for (let i=0;i<450;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // o instante do CASSINO: e onde todos falam e (agora) levantam juntos
      nome: 'tela-12-porao-cassino',
      antes: 'for (let i=0;i<1890;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // a parte 2: a fila em frente a casa
      nome: 'tela-13-rua-fila',
      antes: 'for (let i=0;i<780;i++) G.abertura.atualizar(1/60)',
      quadros: 3, espera: 400,
    },
    {
      // O PRIMEIRO QUADRO DE JOGO, logo depois da cutscene. E a foto que prova
      // que o jogador nasce em 3a pessoa OLHANDO PRA CASA: com o yaw errado a
      // camera ia parar dentro da porta e a tela virava uma tabua.
      nome: 'tela-15-jogo-comeco',
      antes: `G.abertura.pular()
        for (let i=0;i<40;i++) G.player.update(1/60)
        G.player.mode = 'third'
        for (let i=0;i<40;i++) G.player.update(1/60)`,
      quadros: 8, espera: 600,
    },
    {
      // SOLO: um jogador so no sofa de quatro. E o caso que o dono nao ve, mas
      // que e o padrao pra quem joga sozinho.
      nome: 'tela-14-porao-solo',
      antes: `G.fluxo.foto(false)
        G.fluxo.menu()
        G.fluxo.comecar([{ id:1, nome:'Iago', aparencia:G.appearance, anfitriao:true }])
        for (let i=0;i<2430;i++) G.abertura.atualizar(1/60)`,
      quadros: 3, espera: 500,
    },
  ],
}

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function acharNavegador() {
  for (const p of CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('nenhum Chrome/Edge encontrado; defina CHROME_PATH')
}

const pedidos = process.argv.slice(2)
const grupos = pedidos.length ? pedidos.filter((g) => GRUPOS[g]) : Object.keys(GRUPOS)
const tomadas = grupos.flatMap((g) => GRUPOS[g])
if (!tomadas.length) {
  console.error('grupos validos: ' + Object.keys(GRUPOS).join(' '))
  process.exit(1)
}

const PORT = 9533 + (process.pid % 300)
const filho = spawn(acharNavegador(), [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-tela-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,MediaRouter',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--ignore-gpu-blocklist', '--window-size=1280,720',
  'about:blank',
], { stdio: 'ignore', detached: false })

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

const browser = await puppeteer.connect({ browserWSEndpoint: await esperarDebugger() })

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error' && !/404|favicon|WebSocket/.test(m.text())) erros.push(m.text()) })

  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const t of tomadas) {
    await page.evaluate((codigo) => {
      const G = window.__game
      new Function('G', codigo)(G)
    }, t.antes)

    // Quadros forcados: em headless o rAF do jogo nao roda sozinho, entao as
    // transicoes que dependem do laco (o palco chegando no foco, a camera do
    // passeio) nunca sairiam do lugar.
    if (!t.semQuadro) {
      await page.evaluate((n) => new Promise((res) => {
        let i = 0
        const f = () => { (++i >= (n || 20)) ? res(i) : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      }), t.quadros || 20)
    }
    if (t.espera) await new Promise((r) => setTimeout(r, t.espera))

    const arq = path.join(dir, t.nome.replace(/[^a-z0-9_-]/gi, '') + '.png')
    await page.screenshot({ path: arq })
    console.log(arq)
    const diag = await page.evaluate(() => window.__diagTexto || '')
    if (diag) { console.log(diag); await page.evaluate(() => { window.__diagTexto = '' }) }
  }

  if (erros.length) console.log('ERROS NO CONSOLE:\n' + erros.slice(0, 12).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}
