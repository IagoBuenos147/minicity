// A MECANICA DE DIRIGIR: aderencia, derrapagem e a empurrada do skate.
//
//   node tools/teste-dirigir.mjs
//
// O que este teste protege, e por que ele existe:
//
//   O dono pediu "que se ele fizer uma curva tenha aderencia e derrape um
//   pouco". Isso e uma faixa, nao um valor: curva devagar tem que GRUDAR
//   (angulo de deriva quase zero) e curva rapida tem que SAIR DE LADO, e a
//   derrapagem tem que TERMINAR sozinha quando o volante volta pro meio. Um
//   numero mal mexido em MUNDO.DIRIGIR quebra qualquer uma das tres coisas sem
//   quebrar nada mais no jogo — nao daria erro em lugar nenhum.
//
//   E pediu o skate "pegando impulso as vezes com a perna" e "variacao de
//   velocidade". Isso quer dizer velocidade em DEGRAUS (empurra, rola,
//   empurra) e uma velocidade de cruzeiro abaixo do teto — se alguem trocar a
//   empurrada por aceleracao continua, a rampa lisa passa despercebida a olho.
//
// COMO SE MEDE, JA QUE A FISICA E PRIVADA: pela POSE, que e o que o jogador ve.
// O angulo de deriva e o angulo entre PRA ONDE O VEICULO APONTA (rotation.y) e
// PRA ONDE ELE ANDOU (delta de posicao). E exatamente o que se le na tela como
// "esta escorregando".
//
// Em headless o requestAnimationFrame nao dispara, entao o teste chama
// veiculos.atualizar() na mao, quadro a quadro, com o mesmo passo do jogo.

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

const PORT = 9611 + (process.pid % 120)
const filho = spawn(acharNavegador(), [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + path.join(os.tmpdir(), 'minicity-dir-' + PORT),
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=800,600', 'about:blank',
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
  await page.setViewport({ width: 800, height: 600 })
  const erros = []
  page.on('pageerror', (e) => erros.push(String(e)))
  await garantirServidor(URL_BASE)
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction('window.__game && window.__game.veiculos', { timeout: 90000 })
  await new Promise((r) => setTimeout(r, 2000))

  // Roda um roteiro de teclas e devolve a serie medida quadro a quadro.
  // roteiro: [{ teclas:[...], segundos }] — as teclas ficam apertadas no trecho.
  async function correr(tipo, vaga, roteiro) {
    return page.evaluate(async (tipo, vaga, roteiro) => {
      const G = window.__game
      const IDS = { carro: 4000, moto: 4001, skate: 4002 }
      if (G.veiculos.dirigindo) G.veiculos.entrarSair()
      await new Promise((r) => setTimeout(r, 60))
      G.veiculos.aoEventoDeRede({
        tipo: 'veiculo-pos', veiculoId: IDS[tipo],
        x: vaga[0], y: 0, z: vaga[1], yaw: vaga[2], rolagem: 0,
      })
      G.veiculos.atualizar(1 / 60)
      G.player.teleport(vaga[0] + 1.2, vaga[1], 0)
      G.veiculos.entrarSair()
      await new Promise((r) => setTimeout(r, 80))

      let vg = null
      G.veiculos.grupo.traverse((o) => { if (!vg && o.name === tipo) vg = o })
      const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
      const TODAS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']
      for (const c of TODAS) tecla(c, 'keyup')

      const passo = 1 / 60
      const serie = []
      let px = vg.position.x, pz = vg.position.z
      let t = 0
      for (const trecho of roteiro) {
        for (const c of TODAS) tecla(c, trecho.teclas.indexOf(c) >= 0 ? 'keydown' : 'keyup')
        const n = Math.round(trecho.segundos / passo)
        for (let i = 0; i < n; i++) {
          G.veiculos.atualizar(passo)
          t += passo
          const dx = vg.position.x - px, dz = vg.position.z - pz
          px = vg.position.x; pz = vg.position.z
          const dist = Math.hypot(dx, dz)
          // angulo entre PRA ONDE APONTA e PRA ONDE ANDOU: e a derrapagem
          let deriva = 0
          if (dist > 1e-4) {
            const aAponta = vg.rotation.y
            const aAndou = Math.atan2(dx, dz)
            deriva = ((aAndou - aAponta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
          }
          serie.push({
            t: +t.toFixed(3),
            v: +(dist / passo).toFixed(3),
            deriva: +deriva.toFixed(4),
          })
        }
      }
      for (const c of TODAS) tecla(c, 'keyup')
      const carroceria = vg.getObjectByName('carroceria')
      const fim = {
        mergulho: carroceria ? +carroceria.rotation.x.toFixed(4) : 0,
        rolagem: carroceria ? +carroceria.rotation.z.toFixed(4) : +vg.rotation.z.toFixed(4),
      }
      G.veiculos.entrarSair()
      return { serie, fim }
    }, tipo, vaga, roteiro)
  }

  const maxDeriva = (serie, de, ate) => serie
    .filter((p) => p.t >= de && p.t <= ate)
    .reduce((m, p) => Math.max(m, Math.abs(p.deriva)), 0)
  const velEm = (serie, t) => {
    let melhor = serie[0]
    for (const p of serie) if (Math.abs(p.t - t) < Math.abs(melhor.t - t)) melhor = p
    return melhor.v
  }

  // A avenida corre em X; entrar de ponta (yaw = -PI/2) da 40 m de reta livre.
  const RETA = [24, -5.4, -Math.PI / 2]

  // --- 1. CARRO: curva devagar GRUDA -----------------------------------------
  // meio segundo de arranque (uns 5 m/s) e volante no talo: nessa velocidade a
  // curva pede menos que o teto de aderencia, entao nao pode escorregar nada.
  const lento = await correr('carro', RETA, [
    { teclas: ['KeyW'], segundos: 0.35 },
    { teclas: ['KeyW', 'KeyA'], segundos: 0.75 },
    { teclas: ['KeyS'], segundos: 0.4 },
  ])
  const dLento = maxDeriva(lento.serie, 0.5, 1.1)
  ok('carro gruda em curva devagar', dLento < 0.03,
    'deriva max ' + (dLento * 57.3).toFixed(1) + ' graus a ' + velEm(lento.serie, 1.0).toFixed(1) + ' m/s')

  // --- 2. CARRO: curva rapida DERRAPA ---------------------------------------
  const rapido = await correr('carro', RETA, [
    { teclas: ['KeyW'], segundos: 1.6 },
    { teclas: ['KeyW', 'KeyA'], segundos: 0.9 },
  ])
  // A FAIXA, e nao um piso. O pedido do dono tem os dois lados: "que tenha
  // aderencia e derrape um pouco". Derivar de menos e carro de trilho; derivar
  // de mais foi a primeira versao, que ele reprovou com "parece que ele ta
  // derrapando sempre". Entre 2.5 e 7.5 graus e o "um pouco".
  const dRapido = maxDeriva(rapido.serie, 1.8, 2.5)
  ok('carro derrapa um pouco em curva rapida', dRapido > 0.045 && dRapido < 0.13,
    'deriva max ' + (dRapido * 57.3).toFixed(1) + ' graus a ' + velEm(rapido.serie, 1.7).toFixed(1) + ' m/s')
  ok('e derrapa MAIS rapido do que devagar', dRapido > dLento * 2.5,
    (dRapido / Math.max(dLento, 1e-4)).toFixed(1) + 'x')

  // --- 3. a derrapagem termina sozinha --------------------------------------
  // O terceiro trecho segue ACELERANDO EM LINHA RETA de proposito. Frear ate
  // parar poria o carro em marcha a re, e andar pra tras da 180 graus de
  // "deriva" por definicao — o teste mediria a re, nao a derrapagem.
  const solta = await correr('carro', RETA, [
    { teclas: ['KeyW'], segundos: 1.6 },
    { teclas: ['KeyW', 'KeyA'], segundos: 0.8 },
    { teclas: ['KeyW'], segundos: 0.9 },
  ])
  // O criterio e a QUEDA, e nao um angulo absoluto: a derrapagem morre a
  // agarra*6.5 por segundo (0.26 -> meio segundo de meia-vida), entao meio
  // segundo depois de endireitar o volante ela tem que ter caido pela metade.
  const dDepois = maxDeriva(solta.serie, 3.0, 3.3)
  ok('a derrapagem termina sozinha ao soltar o volante',
    dDepois < dRapido * 0.6 && dDepois < 0.05,
    'de ' + (dRapido * 57.3).toFixed(1) + ' para ' + (dDepois * 57.3).toFixed(1)
    + ' graus, a ' + velEm(solta.serie, 3.2).toFixed(1) + ' m/s')

  // --- 4. freio de mao derrapa mais -----------------------------------------
  const mao = await correr('carro', RETA, [
    { teclas: ['KeyW'], segundos: 1.6 },
    { teclas: ['KeyW', 'KeyA', 'Space'], segundos: 0.9 },
  ])
  const dMao = maxDeriva(mao.serie, 1.8, 2.5)
  ok('freio de mao derrapa mais que a curva normal', dMao > dRapido * 1.8,
    (dMao * 57.3).toFixed(1) + ' vs ' + (dRapido * 57.3).toFixed(1) + ' graus')

  // --- 5. a carroceria mergulha no freio ------------------------------------
  const freada = await correr('carro', RETA, [
    { teclas: ['KeyW'], segundos: 2.0 },
    { teclas: ['KeyS'], segundos: 0.45 },
  ])
  ok('a carroceria mergulha na freada', freada.fim.mergulho > 0.02,
    'mergulho ' + freada.fim.mergulho.toFixed(3) + ' rad')

  // --- 6. MOTO: mais agil e menos escorregadia que o carro ------------------
  const moto = await correr('moto', [24, -5.4, -Math.PI / 2], [
    { teclas: ['KeyW'], segundos: 1.6 },
    { teclas: ['KeyW', 'KeyA'], segundos: 0.9 },
  ])
  const dMoto = maxDeriva(moto.serie, 1.8, 2.5)
  ok('a moto agarra mais que o carro na mesma curva', dMoto < dRapido,
    (dMoto * 57.3).toFixed(1) + ' vs ' + (dRapido * 57.3).toFixed(1) + ' graus')

  // --- 7. SKATE: velocidade em DEGRAUS, nao em rampa ------------------------
  const skate = await correr('skate', [24, -5.4, -Math.PI / 2], [
    { teclas: ['KeyW'], segundos: 10.0 },
    { teclas: [], segundos: 6.0 },
  ])
  // amostra a cada 0.1 s e conta em quantas amostras a velocidade SUBIU
  const amostras = []
  for (let t = 0.2; t < 9.4; t += 0.1) amostras.push(velEm(skate.serie, t))
  let subindo = 0
  for (let i = 1; i < amostras.length; i++) if (amostras[i] > amostras[i - 1] + 0.02) subindo++
  const fracao = subindo / (amostras.length - 1)
  ok('o skate acelera so nas empurradas (nao em rampa continua)',
    fracao > 0.15 && fracao < 0.75, 'subiu em ' + Math.round(fracao * 100) + '% das amostras')

  // 32 km/h = 8.9 m/s foi o numero que o dono pediu ("faca ao menos algo em
  // torno de 32 por hora"). Abaixo do teto de 11.5 continua valendo: e a
  // empurrada que rende menos em alta que segura a velocidade, nao o clamp.
  const vCruzeiro = velEm(skate.serie, 9.5)
  ok('o skate chega nos 32 km/h pedidos',
    vCruzeiro > 8.9 && vCruzeiro < 11.5,
    vCruzeiro.toFixed(2) + ' m/s = ' + Math.round(vCruzeiro * 3.6) + ' km/h')

  // --- 8. SKATE: rola sozinho por muito tempo -------------------------------
  //
  // A segunda amostra e em 12.0 s e nao em 13.0 por um motivo bobo e real: com
  // a empurrada nova o skate arranca mais rapido, e nesses 12 s ele ja andou os
  // 97 m que separam a vaga do fim da rua (x = -73). Em 13 s a serie ja esta
  // medindo o skate ENCOSTADO na parede, que da velocidade zero e nao diz nada
  // sobre inercia. Entre 10.1 e 12.0 a queda medida e de 0.55 m/s por segundo,
  // que e exatamente o `atrito` de MUNDO.DIRIGIR.skate — que e o que este caso
  // quer provar.
  const vSolto0 = velEm(skate.serie, 10.1)
  const vSolto1 = velEm(skate.serie, 12.0)
  ok('solto, o skate rola por inercia em vez de parar',
    vSolto1 > vSolto0 * 0.6, vSolto0.toFixed(2) + ' -> ' + vSolto1.toFixed(2) + ' m/s em 1.9 s')

  // --- 8a. SKATE: ele PARA de empurrar entre uma empurrada e outra ----------
  //
  // O dono pediu isto com todas as letras: "quero que ele use a perna um pouco
  // depois espera um pouco pra aproveitar o skate sem pegar impulso". Antes,
  // com o W segurado, o ciclo reiniciava no quadro seguinte ao que terminava e
  // a perna varria sem parar — e uma perna que nunca para nao tem impacto
  // nenhum, porque nao ha contraste.
  //
  // Como se mede sem espiar variavel interna: em regime, a velocidade do skate
  // SOBE so durante a varredura e CAI no resto (o atrito). Contando as amostras
  // que sobem no trecho de cruzeiro da pra saber que fatia do tempo ele passa
  // empurrando. Sem pausa isso fica perto de 40%; com a pausa que a fisica usa
  // hoje (0.34 s parado ate 1.15 s em cruzeiro), cai pra menos de um quarto.
  const trecho = []
  for (let t = 6.0; t < 9.4; t += 0.05) trecho.push(velEm(skate.serie, t))
  let empurrando = 0
  for (let i = 1; i < trecho.length; i++) if (trecho[i] > trecho[i - 1] + 0.005) empurrando++
  const fEmpurra = empurrando / (trecho.length - 1)
  ok('em cruzeiro ele passa mais tempo planando do que empurrando',
    fEmpurra > 0.05 && fEmpurra < 0.40,
    'empurrando em ' + Math.round(fEmpurra * 100) + '% do tempo')

  // --- 8b. SKATE: da RE -----------------------------------------------------
  const re = await correr('skate', [24, -5.4, -Math.PI / 2], [
    { teclas: ['KeyS'], segundos: 3.0 },
  ])
  // deriva ~180 graus = anda para o lado oposto ao que aponta, que e a re
  const derivaRe = Math.abs(maxDeriva(re.serie, 2.0, 3.0))
  ok('o skate anda para tras com o S', derivaRe > 2.8 && velEm(re.serie, 2.8) > 1,
    (velEm(re.serie, 2.8)).toFixed(2) + ' m/s de re')

  // --- 8c. MOTO: o Espaco NAO derrapa mais ---------------------------------
  const motoEspaco = await correr('moto', [24, -5.4, -Math.PI / 2], [
    { teclas: ['KeyW'], segundos: 1.6 },
    { teclas: ['KeyW', 'KeyA', 'Space'], segundos: 0.9 },
  ])
  const dMotoEspaco = maxDeriva(motoEspaco.serie, 1.8, 2.5)
  ok('o Espaco nao faz a moto derrapar', dMotoEspaco < dMoto * 1.25 + 0.01,
    (dMotoEspaco * 57.3).toFixed(1) + ' vs ' + (dMoto * 57.3).toFixed(1) + ' graus sem Espaco')

  // --- 9. as maos do piloto ficam NO guidao e no volante -------------------
  const maos = await page.evaluate(async () => {
    const G = window.__game
    const T = G.THREE
    const VAGA = { carro: [3.2, -5.4, 4000], moto: [7.0, -5.4, 4001] }
    const out = {}
    for (const tipo of ['carro', 'moto']) {
      if (G.veiculos.dirigindo) G.veiculos.entrarSair()
      await new Promise((r) => setTimeout(r, 60))
      G.veiculos.aoEventoDeRede({
        tipo: 'veiculo-pos', veiculoId: VAGA[tipo][2],
        x: VAGA[tipo][0], y: 0, z: VAGA[tipo][1], yaw: Math.PI / 2, rolagem: 0,
      })
      G.veiculos.atualizar(1 / 60)
      G.player.teleport(VAGA[tipo][0] + 1.2, VAGA[tipo][1], 0)
      G.veiculos.entrarSair()
      await new Promise((r) => setTimeout(r, 80))
      const tecla = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true }))
      tecla('KeyW', 'keydown'); tecla('KeyA', 'keydown')
      for (let i = 0; i < 70; i++) G.veiculos.atualizar(1 / 60)
      tecla('KeyW', 'keyup'); tecla('KeyA', 'keyup')
      let vg = null
      G.veiculos.grupo.traverse((o) => { if (!vg && o.name === tipo) vg = o })
      vg.updateMatrixWorld(true)
      const ud = vg.userData.piloto || {}
      const p = G.character.parts
      const dist = (j, a) => {
        const u = new T.Vector3(), w = new T.Vector3()
        j.getWorldPosition(u); a.getWorldPosition(w)
        return +u.distanceTo(w).toFixed(3)
      }
      out[tipo] = {
        mao: Math.max(dist(p.handR, ud.maos[0]), dist(p.handL, ud.maos[1])),
        pe: ud.pes ? Math.max(dist(p.footR, ud.pes[0]), dist(p.footL, ud.pes[1])) : 0,
      }
    }
    if (G.veiculos.dirigindo) G.veiculos.entrarSair()
    return out
  })
  ok('as maos caem no volante com o carro em curva', maos.carro.mao < 0.02,
    maos.carro.mao + ' m de folga')
  ok('as maos caem no guidao com a moto em curva', maos.moto.mao < 0.02,
    maos.moto.mao + ' m de folga')
  ok('os pes caem nas pedaleiras da moto', maos.moto.pe < 0.02,
    maos.moto.pe + ' m de folga')

  if (erros.length) {
    ok('sem erro no console', false, erros.slice(0, 3).join(' | '))
  } else ok('sem erro no console', true)
} finally {
  try { await browser.close() } catch (err) { void err }
  try { filho.kill() } catch (err) { void err }
}

const falhas = casos.filter((c) => !c).length
console.log('\n' + (casos.length - falhas) + '/' + casos.length + ' casos passaram')
process.exit(falhas ? 1 : 0)
