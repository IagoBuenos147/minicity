// FOTO DE UM MOVEL POSTO NO CHAO DA CASA.
//
//   node tools/shot-movel.mjs                  -> todos os moveis (naCasa)
//   node tools/shot-movel.mjs slot-madeira     -> so esse
//
// Movel e a unica coisa do catalogo que so existe DEPOIS de colocada: o card da
// loja mostra a miniatura, mas quem diz se a peca ficou boa e ela no chao, na
// altura do olho de quem anda pela casa. Por isso esta ferramenta usa o caminho
// do SAVE (encaixe.aplicar) pra por a peca no lugar sem passar pela mira, e
// fotografa de tres angulos: de frente, de lado e de perto.
//
// Como as outras, roda sobre o BUILD (dist estatico) e nao sobre o dev server.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// FAIXA LARGA de proposito: esta ferramenta e rodada em paralelo (por mim e
// por agentes ao mesmo tempo), e com 50 portas duas execucoes caem na mesma e
// a segunda morre sem dizer por que.
const PORTA = 8300 + (process.pid % 600)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const CAT = await import(pathToFileURL(
  path.join(ROOT, 'src', 'mobilia', 'catalogo.js')).href)
const pedidos = process.argv.slice(2)
const itens = CAT.MOBILIA
  .filter((m) => m.naCasa && (!pedidos.length || pedidos.indexOf(m.id) >= 0))
  .map((m) => ({ id: m.id, nome: m.nome }))
if (!itens.length) {
  console.error('ids validos: '
    + CAT.MOBILIA.filter((m) => m.naCasa).map((m) => m.id).join(' '))
  process.exit(1)
}

const build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' })
await new Promise((r) => build.on('exit', r))
const srv = spawn(process.execPath, ['servidor.js'], {
  cwd: ROOT, env: Object.assign({}, process.env, { PORTA: String(PORTA) }), stdio: 'ignore',
})
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(BASE + '/saude'); if (r.ok) break } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}

const CDP = 9200 + (process.pid % 600)
const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'shotmovel-' + CDP),
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' })
let ws = null
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
const browser = await puppeteer.connect({ browserWSEndpoint: ws, protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.encaixe', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const dir = path.join(ROOT, 'shots')
  fs.mkdirSync(dir, { recursive: true })

  for (const it of itens) {
    const fotos = await page.evaluate(async (id) => {
      const G = window.__game
      const T = G.THREE
      if (G.fluxo && typeof G.fluxo.jogar === 'function') G.fluxo.jogar()
      await new Promise((r) => setTimeout(r, 300))
      G.fluxo.foto(true)

      // O CENTRO DA MAIOR ZONA DE MOVEL da casa. Nao ha coordenada escrita
      // aqui: a planta e da casa, e um numero copiado pra ca envelheceria na
      // primeira vez que alguem mexesse no comodo.
      const zonas = (G.casa && G.casa.zonasDeMovel && G.casa.zonasDeMovel.zonas) || []
      let z0 = zonas[0]
      for (const z of zonas) {
        const a = (z.x1 - z.x0) * (z.z1 - z.z0)
        if (!z0 || a > (z0.x1 - z0.x0) * (z0.z1 - z0.z0)) z0 = z
      }
      const cx = z0 ? (z0.x0 + z0.x1) / 2 : 0
      const cz = z0 ? (z0.z0 + z0.z1) / 2 : 0

      G.encaixe.aplicar([{ id, x: +cx.toFixed(2), z: +cz.toFixed(2), g: 0 }])
      // ADIANTAR A TELA SEM PEDIR QUADRO DO JOGO.
      //
      // A primeira versao esperava 150 requestAnimationFrame pra a partida do
      // video poker sair da tela de espera. Num renderizador por software cada
      // quadro desenha a casa inteira, e 150 deles estouravam o tempo do
      // protocolo — a ferramenta morria sem foto nenhuma. Como o unico que
      // precisa de tempo e o proprio movel, da pra chamar o update DELE na mao:
      // sao 200 passos de 1/30 s (uns 6 segundos de partida) que custam so o
      // que a peca custa, e nao o que a cena custa.
      const posto0 = G.encaixe.grupo.children[G.encaixe.grupo.children.length - 1]
      const upd = posto0 && posto0.userData && posto0.userData.update
      if (typeof upd === 'function') {
        for (let i = 0; i < 200; i++) upd(1 / 30, posto0)
      }
      await new Promise((res) => {
        let n = 0
        const f = () => { (++n >= 3) ? res() : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      })

      // a caixa da peca decide de que distancia fotografar
      // A PECA POSTA E O ULTIMO FILHO do grupo: os dois primeiros sao os
      // ajudantes da mira (a pegada pintada no chao e a moldura de arestas), e
      // eles ficam invisiveis fora do modo de encaixe. Procurar por id nao
      // funciona — o encaixe nao marca o objeto com o id da peca.
      const filhos = G.encaixe.grupo.children.filter((o) => o.visible !== false
        && !o.isLineSegments && o.type !== 'Mesh')
      const posto = filhos.length ? filhos[filhos.length - 1] : null
      const alvo = new T.Vector3(cx, 0.9, cz)
      const cx3 = new T.Box3()
      if (posto) {
        cx3.setFromObject(posto)
        cx3.getCenter(alvo)
      }
      const tam = cx3.isEmpty() ? new T.Vector3(1, 1, 1) : cx3.getSize(new T.Vector3())
      const raio = Math.max(tam.x, tam.y, tam.z)

      // A CAMERA FICA DENTRO DO COMODO. A primeira versao afastava 2x o raio
      // da peca e, com a mesa de sinuca (2,2 m), isso poe a camera do outro
      // lado da parede — a foto saiu do papel de parede visto de dentro. O
      // afastamento agora e curto e o angulo e mais de cima, que e como se
      // olha um movel de quem esta na sala.
      const cam = new T.PerspectiveCamera(46, 16 / 9, 0.05, 60)
      const tira = (dx, dy, dz, d) => {
        const n = Math.hypot(dx, dy, dz) || 1
        cam.position.set(alvo.x + (dx / n) * d, alvo.y + (dy / n) * d, alvo.z + (dz / n) * d)
        cam.lookAt(alvo)
        G.renderer.render(G.scene, cam)
        return G.renderer.domElement.toDataURL('image/png')
      }
      const d1 = Math.max(1.5, raio * 1.15)
      const frente = tira(0.12, 0.42, 1.0, d1)
      const lado = tira(1.0, 0.34, 0.42, d1)
      const perto = tira(0.10, 0.30, 1.0, Math.max(0.85, raio * 0.60))
      G.encaixe.aplicar([])
      return { frente, lado, perto }
    }, it.id)

    for (const k of ['frente', 'lado', 'perto']) {
      const arq = path.join(dir, 'movel-' + it.id + '-' + k + '.png')
      fs.writeFileSync(arq, Buffer.from(fotos[k].split(',')[1], 'base64'))
      console.log(arq)
    }
  }

  if (erros.length) console.log('ERROS:\n' + erros.slice(0, 6).join('\n'))
  else console.log('sem erro no console')
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
