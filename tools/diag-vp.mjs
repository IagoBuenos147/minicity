// DE QUE COR CADA MESH DA MAQUINA SAI NA TELA, contra a cor que o material diz.
//
// Serviu primeiro pra achar por que o fundo da tela saia cinza (era reflexo
// especular da luz da casa num MeshStandardMaterial de albedo preto — ver o
// comentario grande em video-poker.js). Agora mede a peca inteira: esconde
// tudo menos um mesh de cada vez, renderiza e le o pixel no centro dele. A
// coluna 'saiu' e a unica verdade; 'material' e so o que o codigo pediu.
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = 'C:/Users/Pichau/Desktop/RP'
const ALVO = process.argv[2] || 'video-poker'
const PORTA = 8300 + (process.pid % 600)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const build = spawn('npm.cmd', ['run', 'build'], { cwd: ROOT, stdio: 'ignore', shell: true })
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
  '--user-data-dir=' + path.join(os.tmpdir(), 'diagvp-' + CDP),
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
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.encaixe', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2500))

  const linhas = await page.evaluate(async (id) => {
    const G = window.__game
    const T = G.THREE
    if (G.fluxo && typeof G.fluxo.jogar === 'function') G.fluxo.jogar()
    await new Promise((r) => setTimeout(r, 300))
    G.fluxo.foto(true)
    const zonas = (G.casa && G.casa.zonasDeMovel && G.casa.zonasDeMovel.zonas) || []
    let z0 = zonas[0]
    for (const z of zonas) {
      const a = (z.x1 - z.x0) * (z.z1 - z.z0)
      if (!z0 || a > (z0.x1 - z0.x0) * (z0.z1 - z0.z0)) z0 = z
    }
    const cx = z0 ? (z0.x0 + z0.x1) / 2 : 0
    const cz = z0 ? (z0.z0 + z0.z1) / 2 : 0
    G.encaixe.aplicar([{ id, x: +cx.toFixed(2), z: +cz.toFixed(2), g: 0 }])
    const posto = G.encaixe.grupo.children[G.encaixe.grupo.children.length - 1]
    const upd = posto && posto.userData && posto.userData.update
    if (typeof upd === 'function') for (let i = 0; i < 200; i++) upd(1 / 30, posto)

    const todos = []
    posto.traverse((o) => { if (o.isMesh) todos.push(o) })

    const caixa = new T.Box3().setFromObject(posto)
    const alvo = caixa.getCenter(new T.Vector3())
    const tam = caixa.getSize(new T.Vector3())
    const cam = new T.PerspectiveCamera(46, 16 / 9, 0.05, 60)
    cam.position.set(alvo.x + 0.2, alvo.y + 0.35, alvo.z + Math.max(tam.z, tam.y) * 1.3)
    const W = G.renderer.domElement.width, H = G.renderer.domElement.height
    const gl = G.renderer.getContext()
    const buf = new Uint8Array(4)

    const saida = []
    for (const alvoMesh of todos) {
      todos.forEach((o) => { o.visible = (o === alvoMesh) })
      const bb = new T.Box3().setFromObject(alvoMesh)
      const c = bb.getCenter(new T.Vector3())
      const s = bb.getSize(new T.Vector3())
      cam.lookAt(c)
      G.renderer.render(G.scene, cam)
      // le uma cruz de 5 pontos no centro do mesh e fica com a MEDIANA, pra
      // um pixel de aresta ou de furo nao passar por cor da peca
      const v = c.clone().project(cam)
      const px = Math.round((v.x * 0.5 + 0.5) * W), py = Math.round((v.y * 0.5 + 0.5) * H)
      const lidos = []
      for (const [dx, dy] of [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]]) {
        gl.readPixels(px + dx, py + dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf)
        lidos.push([buf[0], buf[1], buf[2]])
      }
      lidos.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]))
      const m = alvoMesh.material
      saida.push({
        nome: alvoMesh.name || '(baked)',
        tipo: m ? m.type.replace('Mesh', '').replace('Material', '') : '?',
        pediu: m && m.color ? '#' + m.color.getHexString() : '-',
        saiu: lidos[2].join(','),
        rough: m ? m.roughness : '-', metal: m ? m.metalness : '-',
        ei: m ? m.emissiveIntensity : '-',
        tam: [s.x, s.y, s.z].map((n) => n.toFixed(2)).join('x'),
        y: +c.y.toFixed(2),
      })
    }
    todos.forEach((o) => { o.visible = true })
    return saida
  }, ALVO)

  linhas.sort((a, b) => b.y - a.y)
  console.log(ALVO + ' — ' + linhas.length + ' meshes, de cima pra baixo\n')
  console.log('  y     tam            tipo      pediu     saiu          r/m/ei   nome')
  for (const l of linhas) {
    console.log('  ' + String(l.y).padEnd(6) + l.tam.padEnd(15) + l.tipo.padEnd(10)
      + String(l.pediu).padEnd(10) + String(l.saiu).padEnd(14)
      + (l.rough + '/' + l.metal + '/' + l.ei).padEnd(9) + l.nome)
  }
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}
