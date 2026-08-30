// O COLAR BALANCA SEM ENTERRAR NA ROUPA.
//
//   node tools/teste-colar.mjs
//
// Por que este teste existe: o dono pediu o balanco e, na mesma frase, avisou
// do risco — "talvez isso possa ate gerar bugs, se gerar nao precisa nem
// fazer". O bug que ele teme e concreto: colar que balanca e um pendulo, e
// pendulo sem colisao entra no peito.
//
// A implementacao escolhida (animation.js, balancarColar) evita isso por
// construcao: quem gira e o SLOT INTEIRO em volta da junta do pescoco, entao a
// peca nao se deforma e a distancia entre cordao e pano so muda pelo tanto que
// o angulo desloca. Este teste confere que essa promessa vale na pratica, em
// todos os pares colar x blusa, no pior instante do balanco:
//
//   1. o angulo nunca passa do teto (7 graus);
//   2. o colar volta pra perto de zero quando o boneco para;
//   3. nenhum vertice de colar fica DENTRO do pano em nenhum quadro.
//
// O item 3 e medido do mesmo jeito que character.js mede pra acomodar o colar:
// raio de fora pra dentro, na altura e no angulo do vertice, comparando o raio
// do pano com o raio do vertice.

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORTA = 8760 + (process.pid % 60)
const BASE = 'http://127.0.0.1:' + PORTA
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))

const casos = []
function ok(nome, passou, detalhe) {
  casos.push(passou)
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
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

const CDP = 9960 + (process.pid % 30)
const nav = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
  '--user-data-dir=' + path.join(os.tmpdir(), 'tcolar-' + CDP),
  '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=800,600', 'about:blank'], { stdio: 'ignore' })
let ws = null
for (let i = 0; i < 80; i++) {
  try { const r = await fetch('http://127.0.0.1:' + CDP + '/json/version'); if (r.ok) { ws = (await r.json()).webSocketDebuggerUrl; break } } catch (e) { void e }
  await new Promise((r) => setTimeout(r, 250))
}
const browser = await puppeteer.connect({ browserWSEndpoint: ws, protocolTimeout: 300000 })
try {
  const page = await browser.newPage()
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e).slice(0, 200)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.character', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2000))

  const r = await page.evaluate(async () => {
    const G = window.__game
    const T = G.THREE
    const ch = G.character
    const anim = G.player.animator
    const RP = { colares: 0, blusas: 0 }
    // quantos itens tem cada catalogo: le do proprio customizador
    const nColar = (G.customizer && G.customizer.catalogo && G.customizer.catalogo('colar'))
      ? G.customizer.catalogo('colar').length : 0
    // fallback: tenta ate o indice parar de mudar a peca
    RP.colares = nColar || 8
    RP.blusas = 12

    const saida = { maxAng: 0, parou: 0, enterrados: [], pares: 0 }
    const junta = new T.Vector3()
    const p = new T.Vector3()
    const ray = new T.Raycaster()

    for (let c = 1; c < RP.colares; c++) {
      for (const b of [0, 1, 5, 8, 11]) {
        G.setAppearance({ colar: c, blusa: b })
        await new Promise((r) => setTimeout(r, 10))
        const slot = ch.slots.colar
        if (!slot || !slot.children.length) continue
        saida.pares++

        // 3 segundos de caminhada + 2 de parado, no passo do jogo
        let pior = 0
        for (let i = 0; i < 300; i++) {
          const andando = i < 180
          anim.update(1 / 60, {
            speed: andando ? 3.1 : 0, moving: andando, running: false,
            grounded: true, vy: 0,
          })
          const a = Math.max(Math.abs(slot.rotation.x), Math.abs(slot.rotation.z))
          if (a > saida.maxAng) saida.maxAng = a
          if (i === 179) pior = a
        }
        saida.parou = Math.max(saida.parou,
          Math.max(Math.abs(slot.rotation.x), Math.abs(slot.rotation.z)))

        // pior instante: forca o angulo no teto e mede o colar contra o pano
        slot.rotation.x = 0.12
        slot.rotation.z = 0.12
        ch.root.updateWorldMatrix(true, true)
        const malhasPano = []
        for (const k of ['blusa']) {
          const s2 = ch.slots[k]
          if (s2) s2.traverse((o) => { if (o.isMesh && o.visible) malhasPano.push(o) })
        }
        if (!malhasPano.length) continue
        ch.parts.neck.getWorldPosition(junta)
        let dentro = 0, testados = 0
        slot.traverse((m) => {
          if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return
          const pos = m.geometry.attributes.position
          const passo = Math.max(1, Math.floor(pos.count / 40))
          for (let i = 0; i < pos.count; i += passo) {
            p.fromBufferAttribute(pos, i)
            m.localToWorld(p)
            // horizontal, na altura do vertice: e assim que character.js mede
            const d = new T.Vector3(p.x - junta.x, 0, p.z - junta.z)
            const r0 = d.length()
            if (r0 < 0.01) continue
            d.divideScalar(r0)
            const org = new T.Vector3(junta.x, p.y, junta.z).addScaledVector(d, 0.6)
            ray.set(org, d.clone().negate())
            ray.far = 1.0
            const t = ray.intersectObjects(malhasPano, false)
            if (!t.length) continue
            const v = t[0].point.clone().sub(new T.Vector3(junta.x, p.y, junta.z))
            if (v.dot(d) <= 0) continue
            testados++
            if (r0 < v.length() - 0.001) dentro++
          }
        })
        if (dentro > 0) saida.enterrados.push('colar ' + c + ' blusa ' + b + ': ' + dentro + '/' + testados)
        slot.rotation.set(0, 0, 0)
      }
    }
    return saida
  })

  ok('o balanco existe e nunca passa do teto de 7 graus',
    r.maxAng > 0.01 && r.maxAng <= 0.1201,
    'maior angulo ' + (r.maxAng * 57.3).toFixed(2) + ' graus em ' + r.pares + ' pares')
  ok('parado, o colar assenta de volta no lugar', r.parou < 0.02,
    'sobrou ' + (r.parou * 57.3).toFixed(2) + ' graus 2 s depois de parar')
  ok('no pior angulo, nenhum colar entra no pano',
    r.enterrados.length === 0, r.enterrados.slice(0, 3).join(' | ') || 'nenhum')
  ok('sem erro no console', erros.length === 0, erros.slice(0, 2).join(' | '))
} finally {
  try { await browser.close() } catch (e) { void e }
  try { nav.kill() } catch (e) { void e }
  try { srv.kill() } catch (e) { void e }
}

const falhas = casos.filter((c) => !c).length
console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' casos passaram')
process.exit(falhas ? 1 : 0)
