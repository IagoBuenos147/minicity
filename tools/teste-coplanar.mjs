// CACA DUAS SUPERFICIES DISPUTANDO O MESMO PIXEL.
//
// Este teste existe por causa de uma sequencia de queixas do dono que pareciam
// cinco problemas diferentes e eram UM SO:
//
//   "a parte onde fica escrito ofertas tem a cor azul e verde, ele fica bugado
//    quando eu estou andando entre a cor azul e verde"
//   "na entrada da mercearia central, logo abaixo do traco verde, ele fica
//    bugando entre verde e preto"
//   "na barbearia tem o bug logo abaixo do banner, dessa vez entra a cor preta
//    tambem rosa"
//   "a luz do teto do taco de ouro ta toda tremendo"
//
// Nenhum deles era iluminacao. Todos eram DUAS FACES NO MESMO PLANO, com cores
// diferentes. O z-buffer nao tem como decidir qual das duas esta na frente
// quando as duas estao na MESMA distancia, entao ele decide de novo a cada
// quadro, e a cada quadro pode decidir diferente — o pixel troca de cor
// sozinho conforme o jogador anda. Quanto mais distantes as duas cores, mais
// escandaloso: verde contra preto berra, bege contra bege so chia.
//
// E o defeito nasce sem ninguem errar nada. Duas pecas certas, cada uma no seu
// lugar certo, montadas por duas funcoes diferentes que nao se conhecem: uma
// testeira que comeca em `h` e uma coroa que tambem comeca em `h`. Ler o
// codigo nao acusa. So medindo a cena montada.
//
// O CRITERIO tem tres partes, e as tres importam:
//
//   1. as duas faces tem que ser PARALELAS A UM EIXO e estar na mesma posicao
//      (dentro da folga), senao nao disputam pixel nenhum;
//   2. tem que APONTAR PRO MESMO LADO. Duas faces encostadas de costas uma pra
//      outra (o topo de um rodape contra a base de uma parede) estao enterradas
//      e ninguem ve — sao a maioria esmagadora dos pares e todas inofensivas;
//   3. tem que ter COR DIFERENTE. Duas faces coplanares da mesma cor trocam de
//      dono do mesmo jeito, mas o resultado na tela e identico.
//
// A LINHA DE CORTE E 1,5 mm, e ela nao e chute. A 20 m de distancia, com o
// near em 0.05 e um z-buffer de 24 bits, a resolucao de profundidade e melhor
// que meio milimetro — um quadro pendurado com 3 mm entre a moldura e o papel
// nunca vai piscar, e o teste tem que deixar passar, senao vira ruido e
// ninguem olha mais pra ele. O que ele caca e o ENCOSTO: as duas superficies
// exatamente na mesma coordenada, que e o unico caso que o z-buffer nao tem
// como resolver.
//
//   node tools/teste-coplanar.mjs

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

const PORT = 9911 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-cop-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1280,720', 'about:blank',
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

// Onde varrer. Cada regiao e um lugar onde o jogador ENTRA e fica perto das
// paredes — que e onde este defeito incomoda. Ruas e telhados ficam de fora:
// la a distancia e o angulo escondem quase tudo, e a varredura custa caro.
//
// `perto` = o jogador precisa estar dentro pra o interior existir (os
// interiores somem por LOD quando ninguem esta olhando).
const REGIOES = [
  { nome: 'mercearia (interior)', perto: [-25, -20], caixa: [-36, -14, -32, -12, 0.2, 6] },
  { nome: 'mercearia (fachada)', perto: [-25, -9], caixa: [-37, -13, -12.6, -11.0, 0.2, 8] },
  { nome: 'barbearia (interior)', perto: [22, -20], caixa: [14, 30, -28, -12, 0.2, 6] },
  { nome: 'barbearia (fachada)', perto: [22, -9], caixa: [13, 31, -12.6, -11.0, 0.2, 8] },
  { nome: 'loja de jogos (interior)', perto: [42, -20], caixa: [35, 51, -30, -10, 0.2, 6] },
  { nome: 'loja de jogos (fachada)', perto: [42, -7], caixa: [35, 51, -10.6, -8.9, 0.2, 8] },
  { nome: 'hotel (saguao)', perto: [-38, -42], caixa: [-47, -30, -48, -35, 0.2, 6] },
  { nome: 'concessionaria', perto: [-21, -41], caixa: [-28, -14, -48, -34.5, 0.2, 6] },
]

// Area minima pra reclamar. Abaixo disso e uma quina de peca pequena que
// ninguem repara; 0.4 m2 e mais ou menos meia porta.
const AREA_MIN = 0.4
const FOLGA = 0.015

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
  await page.setViewport({ width: 1280, height: 720 })
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.menu', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 1500))
  await page.evaluate(() => window.__game.fluxo.jogar())

  for (const reg of REGIOES) {
    // leva o jogador pra dentro e deixa alguns quadros rodarem, senao o LOD
    // ainda nao ligou o interior e a varredura acha uma sala vazia
    await page.evaluate(async (p) => {
      window.__game.player.teleport(p[0], p[1], 0)
      await new Promise((res) => {
        let i = 0
        const f = () => { (++i >= 20) ? res(i) : requestAnimationFrame(f) }
        requestAnimationFrame(f)
      })
    }, reg.perto)

    const achados = await page.evaluate((caixa, folga, areaMin) => {
      const [x0, x1, z0, z1, y0, y1] = caixa
      const G = window.__game
      const THREE_V = G.player.position.constructor
      const v = new THREE_V(), nv = new THREE_V()
      const faces = []
      G.scene.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry) return
        const g = o.geometry
        const pos = g.attributes && g.attributes.position
        const nor = g.attributes && g.attributes.normal
        if (!pos || !nor) return
        const cor = o.material && o.material.color ? o.material.color.getHexString() : '?'
        o.updateMatrixWorld(true)
        const idx = g.index
        const n = idx ? idx.count : pos.count
        for (let i = 0; i < n; i += 3) {
          const ii = [0, 1, 2].map((k) => (idx ? idx.getX(i + k) : i + k))
          const P = ii.map((a) => {
            v.fromBufferAttribute(pos, a).applyMatrix4(o.matrixWorld)
            return [v.x, v.y, v.z]
          })
          const mx = (P[0][0] + P[1][0] + P[2][0]) / 3
          const my = (P[0][1] + P[1][1] + P[2][1]) / 3
          const mz = (P[0][2] + P[1][2] + P[2][2]) / 3
          if (mx < x0 || mx > x1 || mz < z0 || mz > z1 || my < y0 || my > y1) continue
          nv.fromBufferAttribute(nor, ii[0]).transformDirection(o.matrixWorld)
          for (const [ax, c1, c2] of [[0, 1, 2], [1, 0, 2], [2, 0, 1]]) {
            if (Math.abs(P[0][ax] - P[1][ax]) > 1e-4) continue
            if (Math.abs(P[0][ax] - P[2][ax]) > 1e-4) continue
            const nAx = [nv.x, nv.y, nv.z][ax]
            if (Math.abs(nAx) < 0.7) continue     // face nao encara o eixo
            const ar = Math.abs(
              (P[1][c1] - P[0][c1]) * (P[2][c2] - P[0][c2]) -
              (P[2][c1] - P[0][c1]) * (P[1][c2] - P[0][c2])) / 2
            faces.push({
              ax, d: P[0][ax], sinal: nAx >= 0 ? 1 : -1, cor, ar, id: o.id,
              a0: Math.min(P[0][c1], P[1][c1], P[2][c1]),
              a1: Math.max(P[0][c1], P[1][c1], P[2][c1]),
              b0: Math.min(P[0][c2], P[1][c2], P[2][c2]),
              b1: Math.max(P[0][c2], P[1][c2], P[2][c2]),
            })
          }
        }
      })
      // TAPADA POR UMA FACE OPOSTA = ENTERRADA, e nao interessa.
      //
      // O caso classico: um rodape encostado na parede. A face de TRAS do
      // rodape e a face de tras do painel do fundo caem as duas no plano da
      // parede, as duas olhando pra DENTRO dela — coplanares, cores
      // diferentes, e completamente invisiveis, porque a superficie da parede
      // (que olha pra sala, normal contraria) esta na frente das duas.
      //
      // Sem este filtro o teste acusa dezenas de pares desses e vira ruido.
      // Com ele, o que sobra e o que o jogador enxerga de fato.
      function tapada(f) {
        for (const o of faces) {
          if (o.ax !== f.ax || o.sinal === f.sinal) continue
          if (Math.abs(o.d - f.d) > 0.002) continue
          if (o.a1 <= f.a0 + 0.01 || f.a1 <= o.a0 + 0.01) continue
          if (o.b1 <= f.b0 + 0.01 || f.b1 <= o.b0 + 0.01) continue
          return true
        }
        return false
      }
      const acc = {}
      for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          const a = faces[i], b = faces[j]
          if (a.ax !== b.ax) continue
          if (a.sinal !== b.sinal) continue      // de costas uma pra outra: enterrada
          if (a.cor === b.cor) continue          // mesma cor: troca de dono nao aparece
          if (a.id === b.id) continue            // a peca consigo mesma
          const dd = Math.abs(a.d - b.d)
          if (dd > folga) continue
          if (a.a1 <= b.a0 + 0.01 || b.a1 <= a.a0 + 0.01) continue
          if (a.b1 <= b.b0 + 0.01 || b.b1 <= a.b0 + 0.01) continue
          if (tapada(a) || tapada(b)) continue
          const k = 'xyz'[a.ax] + '=' + a.d.toFixed(2) + (a.sinal > 0 ? '+' : '-') +
            ' ' + a.cor + ' vs ' + b.cor
          if (!acc[k]) acc[k] = { ar: 0, folga: dd }
          acc[k].ar += Math.min(a.ar, b.ar)
          acc[k].folga = Math.min(acc[k].folga, dd)
        }
      }
      return Object.entries(acc)
        .filter(([, x]) => x.ar >= areaMin && x.folga < 0.0015)
        .sort((p, q) => q[1].ar - p[1].ar)
        .slice(0, 6)
        .map(([k, x]) => k + '  ' + x.ar.toFixed(1) + ' m2, folga ' + (x.folga * 1000).toFixed(0) + ' mm')
    }, reg.caixa, FOLGA, AREA_MIN)

    ok('nada disputando pixel em ' + reg.nome,
      achados.length === 0,
      achados.length ? achados.join(' | ') : 'limpo')
  }

  const falhas = casos.filter((c) => !c).length
  console.log('')
  console.log((casos.length - falhas) + '/' + casos.length + ' casos passaram')
  if (falhas) {
    console.log('')
    console.log('Como ler: "y=2.06- 2f6fbf vs 2f9e57  14.0 m2, folga 0 mm" quer dizer')
    console.log('que ha 14 m2 de faces horizontais na altura 2.06, viradas pra baixo,')
    console.log('uma azul e outra verde, encostadas. Separe as duas em Y (ou tire uma:')
    console.log('quase sempre sao duas pecas fazendo o mesmo papel).')
  }
  process.exitCode = falhas ? 1 : 0
} finally {
  await browser.disconnect()
  try { filho.kill() } catch (err) { void err }
}
