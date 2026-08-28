// ---------------------------------------------------------------------------
// src/world/hudson/quadra.js — a QUADRA HUDSON, em Paracatu, Minas Gerais.
//
// Um quarteirao real, reconstruido a partir de 35 fotos do Street View. As
// quatro ruas que o cercam, lidas no cabecalho das fotos:
//
//   R. Josue Felix Caixeta   (241, 244, 300)   — sul
//   R. Frei Pedro Caixito    (172, 284)        — norte
//   R. Jorge Araujo Caldas   (91 a 240)        — leste
//   R. Padre Josino          (80 a 281)        — oeste
//
// O QUE ESTE CENARIO NAO TEM, por pedido explicito do dono do projeto: carro,
// moto e gente. O bairro fica vazio de proposito.
//
// COMO ELE E MONTADO. Nada de posicao escrita na mao. A planta (planta.js) diz
// a ORDEM e a TESTADA de cada lote; este arquivo enfileira os lotes ao longo do
// lado, cada um encostado no anterior, e chama lotes.js pra construir. Trocar a
// testada de uma casa empurra as vizinhas sozinho — que e como um quarteirao
// funciona de verdade.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { buildChao, groundY, Q, RUAS, LIMITE, EIXO } from './chao.js'
import { montarLote } from './lotes.js'
import { PLANTA } from './planta.js'
import { posteConcreto, redeAerea, bocaDeLobo, pilarete } from './pecas-infra.js'
import { bakeStatic } from '../bake.js'
import { buildEntorno } from './entorno.js'
import { LEVELS } from '../../config.js'

const PI = Math.PI
const CH = LEVELS.SIDEWALK

/**
 * Onde fica e pra onde olha cada lado do quarteirao.
 *
 * `eixo`      em que coordenada os lotes se enfileiram
 * `linha`     a coordenada FIXA da divisa (a testada dos lotes)
 * `giro`      quanto girar o lote pra que o +Z dele aponte pra rua
 * `sentido`   +1 ou -1: pra que lado a numeracao cresce
 */
const LADOS = {
  sul: { eixo: 'x', linha: () => Q.z1, giro: 0, sentido: 1 },
  norte: { eixo: 'x', linha: () => Q.z0, giro: PI, sentido: -1 },
  leste: { eixo: 'z', linha: () => Q.x1, giro: PI / 2, sentido: -1 },
  oeste: { eixo: 'z', linha: () => Q.x0, giro: -PI / 2, sentido: 1 },
}

/** A calcada de frente: mesma logica, do outro lado da rua e olhando pra ca. */
const OPOSTOS = {
  sul: { eixo: 'x', linha: () => LIMITE.z1, giro: PI, sentido: 1 },
  norte: { eixo: 'x', linha: () => LIMITE.z0, giro: 0, sentido: -1 },
  leste: { eixo: 'z', linha: () => LIMITE.x1, giro: -PI / 2, sentido: -1 },
  oeste: { eixo: 'z', linha: () => LIMITE.x0, giro: PI / 2, sentido: 1 },
}

/** O comprimento util de cada lado (de divisa a divisa do quarteirao). */
function comprimentoDe(lado) {
  return (lado === 'sul' || lado === 'norte') ? (Q.x1 - Q.x0) : (Q.z1 - Q.z0)
}

/**
 * Enfileira os lotes de um lado. Devolve os colisores em coordenada do mundo.
 *
 * Quando a soma das testadas nao fecha o lado (as fotos raramente cobrem um
 * quarteirao inteiro), a fila e CENTRADA e as pontas ficam vazias. Centrar em
 * vez de esticar e proposital: esticar uma casa de 8 m pra 11 m pra fechar a
 * conta estragaria a unica coisa que foi realmente medida.
 */
function enfileirar(grupo, lado, lotes, ondeFica, seedBase) {
  const cfg = ondeFica === 'oposto' ? OPOSTOS[lado] : LADOS[lado]
  const comp = comprimentoDe(lado)
  const total = lotes.reduce((s, l) => s + (Number(l.frente) || 0), 0)
  const inicio = -comp / 2 + Math.max(0, (comp - total) / 2)
  const linha = cfg.linha()
  const colisores = []
  let andado = 0

  for (let i = 0; i < lotes.length; i++) {
    const spec = lotes[i]
    const frente = Number(spec.frente) || 8
    // t = o centro deste lote ao longo do lado, no referencial do quarteirao
    const t = (inicio + andado + frente / 2) * cfg.sentido
    andado += frente

    const { grupo: g, colisores: cols } = montarLote(spec, { seed: seedBase + i * 13 })
    if (cfg.eixo === 'x') g.position.set(t, CH, linha)
    else g.position.set(linha, CH, t)
    g.rotation.y = cfg.giro
    grupo.add(g)

    // Os colisores do lote saem em coordenada LOCAL. O mundo de colisao e de
    // caixas alinhadas ao eixo (AABB) e nao aceita rotacao, entao gira os
    // quatro cantos na mao e fica com o retangulo que os contem.
    const cs = Math.cos(cfg.giro), sn = Math.sin(cfg.giro)
    for (const c of cols) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (const [lx, lz] of [[c.minX, c.minZ], [c.maxX, c.minZ], [c.minX, c.maxZ], [c.maxX, c.maxZ]]) {
        const wx = lx * cs + lz * sn
        const wz = -lx * sn + lz * cs
        const px = (cfg.eixo === 'x' ? t : linha) + wx
        const pz = (cfg.eixo === 'x' ? linha : t) + wz
        if (px < minX) minX = px
        if (px > maxX) maxX = px
        if (pz < minZ) minZ = pz
        if (pz > maxZ) maxZ = pz
      }
      colisores.push({ minX, maxX, minZ, maxZ, tag: 'hudson-' + (c.tag || 'lote') })
    }
  }
  return colisores
}

/**
 * Os postes e a rede aerea de um lado da rua.
 *
 * Eles ficam na calcada DO QUARTEIRAO, encostados no meio-fio. A rede liga um
 * poste ao seguinte e, de dois em dois, atravessa a rua ate o poste de frente:
 * e esse cruzamento na diagonal que faz o ceu do bairro parecer o das fotos.
 */
function iluminarLado(grupo, lado, vaos, luzes, mats, seedBase) {
  const cfg = LADOS[lado]
  const rua = RUAS[lado]
  const comp = comprimentoDe(lado)
  const linha = cfg.linha()
  const paraFora = (lado === 'sul' || lado === 'leste') ? 1 : -1
  const vPoste = linha + paraFora * (rua.calcada - 0.5)
  const vFrente = lado === 'sul' ? LIMITE.z1 - rua.calcada + 0.5
    : lado === 'norte' ? LIMITE.z0 + rua.calcada - 0.5
      : lado === 'leste' ? LIMITE.x1 - rua.calcada + 0.5
        : LIMITE.x0 + rua.calcada - 0.5

  const n = Math.max(2, Math.round(comp / 30))
  const topos = []
  const toposFrente = []
  for (let k = 0; k <= n; k++) {
    const t = -comp / 2 + (k / n) * comp
    const p = posteConcreto({
      altura: 9.2 + (k % 3) * 0.35,
      transformador: k === Math.floor(n / 2),
      seed: seedBase + k,
    })
    // a luminaria sai no +Z do poste: gira pra que ela aponte pra pista
    p.grupo.rotation.y = cfg.giro + PI
    if (cfg.eixo === 'x') p.grupo.position.set(t, CH, vPoste)
    else p.grupo.position.set(vPoste, CH, t)
    grupo.add(p.grupo)
    if (p.luz) luzes.push(p.luz)
    if (p.matLuz) mats.push(p.matLuz)
    topos.push(cfg.eixo === 'x'
      ? { x: t, y: CH + p.alturaFio, z: vPoste }
      : { x: vPoste, y: CH + p.alturaFio, z: t })

    // o poste da calcada de frente, sem luminaria (a rua so tem luz de um lado)
    if (k % 2 === 0) {
      const q = posteConcreto({ altura: 8.8, luminaria: false, seed: seedBase + 100 + k })
      q.grupo.rotation.y = cfg.giro
      if (cfg.eixo === 'x') q.grupo.position.set(t + 5, CH, vFrente)
      else q.grupo.position.set(vFrente, CH, t + 5)
      grupo.add(q.grupo)
      toposFrente.push(cfg.eixo === 'x'
        ? { x: t + 5, y: CH + q.alturaFio, z: vFrente }
        : { x: vFrente, y: CH + q.alturaFio, z: t + 5 })
    }
  }
  for (let k = 0; k + 1 < topos.length; k++) {
    vaos.push({ a: topos[k], b: topos[k + 1], fios: 4, flecha: 0.8 })
  }
  for (let k = 0; k + 1 < toposFrente.length; k++) {
    vaos.push({ a: toposFrente[k], b: toposFrente[k + 1], fios: 3, flecha: 0.95, telecom: false })
  }
  // O CRUZAMENTO DA RUA na diagonal
  for (let k = 0; k < toposFrente.length; k++) {
    const par = topos[k * 2]
    if (par) vaos.push({ a: par, b: toposFrente[k], fios: 2, flecha: 1.15, telecom: false })
  }
}

/**
 * @param {object} game
 * @returns {{ grupo, groundY, spawn, lampLights, lampMaterials }}
 */
export function buildQuadraHudson(game) {
  const grupo = new THREE.Group()
  grupo.name = 'quadra-hudson'

  const chao = buildChao()
  grupo.add(chao.grupo)

  const colisores = []
  const luzes = []
  const mats = []
  const vaos = []

  let seed = 100
  for (const lado of ['sul', 'norte', 'leste', 'oeste']) {
    const rua = PLANTA[lado]
    if (!rua) continue
    const daQuadra = rua.lotes.filter((l) => l.ladoDaRua !== 'oposto')
    const daFrente = rua.lotes.filter((l) => l.ladoDaRua === 'oposto')
    colisores.push(...enfileirar(grupo, lado, daQuadra, 'quarteirao', seed))
    seed += 500
    colisores.push(...enfileirar(grupo, lado, daFrente, 'oposto', seed))
    seed += 500
    iluminarLado(grupo, lado, vaos, luzes, mats, seed)
    seed += 500
  }

  const fios = redeAerea(vaos)
  if (fios) grupo.add(fios)

  // BOCA DE LOBO nas quatro esquinas: e onde ela fica de verdade, porque e o
  // ponto baixo da sarjeta.
  for (const [x, z] of [
    [Q.x0 - 1, Q.z1 + RUAS.sul.calcada - 0.2],
    [Q.x1 + 1, Q.z1 + RUAS.sul.calcada - 0.2],
    [Q.x0 - 1, Q.z0 - RUAS.norte.calcada + 0.2],
    [Q.x1 + 1, Q.z0 - RUAS.norte.calcada + 0.2],
  ]) {
    const b = bocaDeLobo()
    b.position.set(x, CH, z)
    grupo.add(b)
  }

  // PILARETES na calcada larga da Frei Pedro Caixito (aparecem na foto-35).
  for (let i = 0; i < 8; i++) {
    const p = pilarete({ altura: 0.72 })
    p.position.set(Q.x0 + 14 + i * 3.2, CH, Q.z0 - RUAS.norte.calcada + 0.5)
    grupo.add(p)
  }

  // O ENTORNO fica FORA do forno: ele ja nasce fundido em tres malhas, e passar
  // de novo pelo bakeStatic so gastaria tempo de carregamento.
  const entorno = buildEntorno(7)

  // O FORNO. Sem ele o bairro sai com 17 mil malhas e 7.800 draw calls — seis
  // vezes o orcamento do jogo inteiro. Cada tufo de folha, cada telha, cada
  // barra de grade e uma malha; fundidas por material viram algumas centenas.
  // As luzes de poste e o que tem userData.dynamic passam intactos.
  const antes = bakeStatic(grupo)
  console.info('quadra hudson:', antes)

  grupo.add(entorno)

  game.scene.add(grupo)
  if (colisores.length) game.addColliders(colisores)

  return {
    grupo,
    groundY,
    // nasce na calcada da R. Jorge Araujo Caldas, a rua mais fotografada,
    // olhando pras casas
    // nasce na CALCADA (nao no meio da pista), encostado no muro do quarteirao
    spawn: { x: Q.x1 + RUAS.leste.calcada / 2, z: 6, yaw: PI / 2 },
    lampLights: luzes,
    lampMaterials: mats,
  }
}

export default buildQuadraHudson
