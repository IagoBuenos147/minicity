import * as THREE from 'three'
import { HOTEL, interiorOf, apronOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import {
  solid, stdMat, box, cyl, sphere, plane, roundedBox,
  textPlaneMat, tex, woodTex,
} from './materials.js'
import * as Props from './props.js'
import { bakeStatic } from './bake.js'
import { createNPC } from '../npc/npc.js'
import { congelarPersonagem } from '../player/congelar.js'

// ---------------------------------------------------------------------------
// HOTEL PARAISO — o predio da esquina noroeste do anel.
//
// Era o "BAR DO TITO": um FILLERS de 22 x 17 m e 16 m de altura, caixa macica
// com letreiro sorteado. Virou o quinto lugar do mapa em que da pra ENTRAR.
//
// A CASCA E DAQUI, nao do buildShell de city.js. Pelo mesmo motivo do cassino:
// buildShell so sabe desenhar fachada virada pro +Z, e a rua deste lote e o
// anel, ao NORTE (fachada em z0). Mas tem um segundo motivo, e ele pesa mais:
// buildShell desenha LOJA — vitrine com peitoril de 85 cm, toldo listrado,
// letreiro de chapa. Hotel nao e loja. Aqui a fachada e vidro do chao ao teto,
// marquise com forro aceso, mastros de bandeira e tres andares de sacada em
// cima. Nada disso caberia como "opcao" do buildShell sem transformar ele num
// arquivo de casos especiais.
//
// O PREDIO TEM 15,5 m E O SAGUAO TEM 5,2. Os dois numeros existem de proposito
// e moram em lugares diferentes: 15.5 e o wallHeight do lote (layout.js), e e
// ele que a neve e os occluders de camera leem — e a altura da COBERTURA. 5.2 e
// o pe-direito do saguao e mora aqui, porque quem constroi o forro e este
// arquivo. Entre um e outro ha 10 m de torre macica que ninguem ve por dentro.
//
// LUZ: 3 PointLight dentro + 1 sob a marquise, nenhuma com sombra. O saguao tem
// 205 m2 (a loja de jogos tem 337 e usa 4). O resto e emissivo — que, como a
// loja de jogos aprendeu na marra, ACENDE A PROPRIA SUPERFICIE e nao ilumina
// nada na frente dela. Lustre, sanca e neon sao enfeite; quem levanta o saguao
// do preto sao as tres luzes.
// ---------------------------------------------------------------------------

const B = HOTEL
const IN = interiorOf(B)          // x -46.8..-30.3 / z -47.7..-35.3
const T = WALL_T                  // 0.3
const H = B.wallHeight            // 15.5 — altura do PREDIO
const BASE = LEVELS.SHOP_FLOOR    // 0.16
const CEIL = 5.2                  // pe-direito do SAGUAO (local, piso em 0)
const AV = apronOf(B, 0.9)        // avental: x -48..-29.1 / z -48..-34.1
const DL = B.door.center - B.door.width / 2   // -40.3
const DR = B.door.center + B.door.width / 2   // -36.7
const DH = B.door.height                      // 3.2

// --- fachada ---------------------------------------------------------------
// A fachada do terreo e uma PILHA, e as alturas se encaixam de baixo pra cima
// sem folga sobrando: vidro 0.55..4.10 -> marquise 4.10..4.44 -> painel do
// letreiro 4.50..5.80 -> cornija 6.00..6.30 -> primeiro andar. Mexer numa
// dessas sem mexer nas vizinhas e como as pecas passam a se atravessar.
const GF = 6.15                   // eixo da cornija que fecha o terreo
const JAN_Y0 = 0.55, JAN_Y1 = 4.10
// Vaos de vidro da fachada. Dois de cada lado da porta, 2.4 m cada. O que
// sobra entre eles (60 cm) e nas pontas (70 cm) vira pilar cheio.
const VIDROS = [[-46.4, -44.0], [-43.4, -41.0], [-36.0, -33.6], [-33.0, -30.6]]

// Marquise: 6.2 m de largura x 2.4 m de balanco sobre a calcada do anel (que
// tem 4 m: sobra 1.6 ate o meio-fio). Comeca exatamente onde o vidro acaba.
const MQ = { x0: -41.6, x1: -35.4, z0: -50.4, z1: -48, y: 4.10, esp: 0.34 }

// --- porta automatica ------------------------------------------------------
// Duas folhas de vidro que correm PRA DENTRO das laterais. Fechadas, cada uma
// cobre metade do vao (com 2 cm de encontro no meio); abertas, correm 1.78 m e
// ficam atras do pilar da fachada — o vao de 3,6 m fica inteiro livre, que era
// o pedido. Elas nao tem colisor NENHUM: porta automatica que empurra o jogador
// e porta que atrapalha.
const FOLHA_W = 1.82
const FOLHA_CURSO = 1.78
const PORTA_Z = B.z0 + T + 0.05   // -47.65: correm por dentro, rentes a parede

// --- miolo -----------------------------------------------------------------
// Balcao de recepcao, encostado no fundo-oeste, com a Iris atras.
const BALCAO = { x0: -46.2, x1: -39.4, z0: -37.9, z1: -37.0, h: 1.12 }
const IRIS = { x: -42.8, z: -36.4 }

// Elevador: na parede do fundo, entre o balcao e a escada.
const ELEV = { cx: -35.7, vao: 2.4, alt: 2.5 }

// Escada SIMBOLICA: encostada na parede leste, sobe 2,1 m em 12 degraus e
// morre num patamar com porta fechada. Ela e um bloco macico pro colisor — nao
// sobe de verdade, e o dono do projeto pediu exatamente isso.
const ESC = {
  x0: -32.9, x1: -30.3,     // 2.6 m de largura, encostada na parede leste
  zBase: -43.6,             // pe da escada (lado do saguao)
  zTopo: -38.4,             // fim do ultimo degrau
  zPatamar: -35.3,          // patamar vai dali ate a parede do fundo
  alt: 2.1,
  n: 12,
}

// Sala de espera: dois grupos de poltrona, um de cada lado do corredor central
// (x -40.6..-37.4) que liga a porta ao balcao. O corredor existe pra nao ter
// que desviar de poltrona pra ser atendido.
const GRUPO_O = { x: -43.7, z: -43.1 }   // oeste, 3 poltronas
const GRUPO_L = { x: -35.2, z: -43.7 }   // leste, 2 poltronas

// ---------------------------------------------------------------------------
// TEXTURAS
// ---------------------------------------------------------------------------
const _tiled = new Map()
/** Clone da textura com outra repeticao (cacheado por uuid + repeticao). */
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx.toFixed(2) + ':' + ry.toFixed(2)
  let t = _tiled.get(k)
  if (t) return t
  t = base.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  _tiled.set(k, t)
  return t
}

/** Marmore: fundo, nuvens de tom e veios finos em bezier. */
function marmoreTex(base, veia, forca) {
  return tex('hotel-marmore:' + base + ':' + veia + ':' + forca, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    // nuvens de tom (o que tira a cara de plastico)
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 14 + Math.random() * 60
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(255,255,255,' + (Math.random() * 0.16) + ')')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    // veios: sempre na mesma diagonal, com galhos
    g.strokeStyle = veia
    for (let i = 0; i < 16; i++) {
      const y0 = Math.random() * s
      g.globalAlpha = 0.18 + Math.random() * forca
      g.lineWidth = 0.6 + Math.random() * 2.2
      g.beginPath()
      g.moveTo(-10, y0)
      let y = y0
      for (let x = 0; x <= s + 10; x += 26) {
        y += (Math.random() - 0.45) * 22
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  }, 1)
}

/** Pedra de fachada: fiadas horizontais de bloco aparelhado. */
function pedraTex() {
  return tex('hotel-pedra', 256, (g, s) => {
    g.fillStyle = '#ded2b8'; g.fillRect(0, 0, s, s)
    const linhas = 4, alt = s / linhas
    for (let i = 0; i < linhas; i++) {
      const y = i * alt
      // variacao de tom por fiada
      g.fillStyle = 'rgba(' + (200 + Math.random() * 30 | 0) + ',' +
        (190 + Math.random() * 25 | 0) + ',' + (165 + Math.random() * 25 | 0) + ',0.5)'
      g.fillRect(0, y, s, alt)
      // junta horizontal
      g.fillStyle = 'rgba(150,142,124,0.75)'
      g.fillRect(0, y, s, 2)
      // juntas verticais, deslocadas meia pedra a cada fiada
      const off = (i % 2) * (s / 6)
      for (let x = off; x < s; x += s / 3) {
        g.fillRect(x, y, 2, alt)
      }
    }
    for (let i = 0; i < 2200; i++) {
      const v = 190 + Math.random() * 50
      g.fillStyle = 'rgba(' + v + ',' + (v - 8) + ',' + (v - 26) + ',' + (Math.random() * 0.28) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1)
    }
  }, 1)
}

/** Tapete de saguao: fundo, borda dupla e medalhao central. */
function tapeteTex(chave, fundo, borda, orn) {
  return tex('hotel-tapete:' + chave, 256, (g, s) => {
    g.fillStyle = fundo; g.fillRect(0, 0, s, s)
    // trama
    for (let i = 0; i < 4200; i++) {
      g.fillStyle = 'rgba(0,0,0,' + (Math.random() * 0.10) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1.6, 1.6)
    }
    g.strokeStyle = borda
    g.lineWidth = 13; g.strokeRect(9, 9, s - 18, s - 18)
    g.lineWidth = 4; g.strokeRect(26, 26, s - 52, s - 52)
    // medalhao: dois losangos e uma roseta
    g.strokeStyle = orn; g.lineWidth = 3
    g.save(); g.translate(s / 2, s / 2)
    for (const r of [64, 44]) {
      g.beginPath()
      g.moveTo(0, -r); g.lineTo(r * 0.62, 0); g.lineTo(0, r); g.lineTo(-r * 0.62, 0)
      g.closePath(); g.stroke()
    }
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4)
      g.beginPath(); g.ellipse(0, -28, 7, 15, 0, 0, 7); g.stroke()
    }
    g.restore()
    // cantos
    g.lineWidth = 2.5
    for (const [cx, cy] of [[46, 46], [s - 46, 46], [46, s - 46], [s - 46, s - 46]]) {
      g.beginPath(); g.arc(cx, cy, 15, 0, 7); g.stroke()
      g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.stroke()
    }
  }, 1)
}

/** Bronze escovado das folhas do elevador: estrias verticais finas. */
function bronzeTex() {
  return tex('hotel-bronze', 128, (g, s) => {
    g.fillStyle = '#8e7442'; g.fillRect(0, 0, s, s)
    for (let x = 0; x < s; x += 3) {
      g.fillStyle = 'rgba(255,236,180,' + (0.05 + Math.random() * 0.22) + ')'
      g.fillRect(x, 0, 1, s)
      g.fillStyle = 'rgba(60,44,18,' + (0.05 + Math.random() * 0.18) + ')'
      g.fillRect(x + 1.5, 0, 1, s)
    }
  }, 1)
}

// ---------------------------------------------------------------------------
// MATERIAIS
// ---------------------------------------------------------------------------
const M = {
  // --- fachada -------------------------------------------------------------
  get cornija() { return solid(0xefe6d2, 0.86) },
  get soco() { return stdMat('hotel-soco', { map: tiled(marmoreTex('#4c4a52', '#1d1c22', 0.35), 3, 1), roughness: 0.35, metalness: 0.12 }) },
  get ouro() { return solid(0xd8ae4e, 0.32, 0.85) },
  get ouroFosco() { return solid(0xb9954a, 0.55, 0.6) },
  get cromo() { return solid(0xc9d0d6, 0.22, 0.9) },
  get grafite() { return solid(0x2b2e34, 0.7, 0.25) },
  get turquesa() { return stdMat('hotel-turquesa', { color: 0x9ff2ea, emissive: 0x2fc4bb, emissiveIntensity: 2.4, roughness: 0.35 }) },
  get luzQuente() { return stdMat('hotel-luzq', { color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 2.1, roughness: 0.4 }) },
  // A versao mansa do de cima, pras superficies GRANDES e proximas: o forro da
  // marquise (6,2 x 2,1 m) e os globos dos postes. Com 2.1 os dois viravam
  // chapas brancas estouradas na altura dos olhos de quem chega na porta — que
  // foi metade da reclamacao de "ta muito forte a entrada". Uma calha fina de
  // vitrine aguenta 2.1; um forro do tamanho de um quarto, nao.
  get luzMansa() { return stdMat('hotel-luzm', { color: 0xfaeed6, emissive: 0xffdcaa, emissiveIntensity: 1.15, roughness: 0.5 }) },
  get vidroFachada() {
    // Vidro de saguao: precisa DAR PRA VER o lustre de fora, entao e mais limpo
    // que o das lojas. depthWrite off pra nao brigar com o que esta atras.
    return stdMat('hotel-vidro-fachada', {
      color: 0xd8eef4, transparent: true, opacity: 0.16, roughness: 0.05,
      metalness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get vidroPorta() {
    return stdMat('hotel-vidro-porta', {
      color: 0xe4f6fa, transparent: true, opacity: 0.13, roughness: 0.03,
      metalness: 0.08, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get vidroJanela() { return solid(0x2b3a46, 0.18, 0.5) },
  get toldoCarpete() { return solid(0x1f6b62, 0.95) },

  // --- miolo ---------------------------------------------------------------
  // Base #ddd3bd e nao #e9e2d2, rugosidade 0.34 e nao 0.22: com o marmore quase
  // branco e quase espelhado, as tres PointLight do saguao estouravam o piso e
  // ele virava um lencol branco liso — o veio do marmore simplesmente sumia nos
  // 8 metros centrais da sala.
  get pisoMarmore() { return stdMat('hotel-piso', { map: tiled(marmoreTex('#cdc2ab', '#8f7d62', 0.42), 7, 5), roughness: 0.46, metalness: 0.02 }) },
  // LISO, sem textura, e de proposito. Este material veste tira de rodape,
  // capacho, faixa de contorno e tapete do elevador — pecas COMPRIDAS E FINAS.
  // A UV de BoxGeometry e 0..1 por face, entao um mapa com repeat 3x3 dava tres
  // copias do veio em cada face, do tamanho que a face tivesse: numa faixa de
  // 16 m por 55 cm virava borrao, e num bloco de 2,6 x 2,1 (o patamar da
  // escada) virava um monte de entulho cinza. Marmore de verdade so onde a peca
  // tem proporcao pra ele: tampo, parede do fundo e degrau.
  get pisoEscuro() { return solid(0x2d3a38, 0.32, 0.12) },
  get degrau() { return stdMat('hotel-degrau', { map: tiled(marmoreTex('#33403e', '#93c7bc', 0.28), 1, 1), roughness: 0.26, metalness: 0.12 }) },
  // Nao ha material de parede INTERNA: o saguao mostra a mesma pedra
  // aparelhada da fachada, pelo lado de dentro (matParede). Foi escolha, nao
  // esquecimento — o bloco de 3,4 m de fiada le como revestimento de travertino
  // e ja e a linguagem do predio; reboco liso aqui dentro brigaria com a
  // fachada visivel pelo vidro do proprio saguao.
  get lambri() { return stdMat('hotel-lambri', { map: tiled(woodTex(1, '#5c3b22'), 6, 1), color: 0x9d7148, roughness: 0.55 }) },
  get madeira() { return stdMat('hotel-madeira', { map: tiled(woodTex(1, '#4a2b17'), 3, 1), color: 0x8a5a34, roughness: 0.5 }) },
  get forro() { return solid(0xf2ebdb, 0.9) },
  get forroCaixa() { return solid(0xe3d9c2, 0.92) },
  get sanca() { return stdMat('hotel-sanca', { color: 0xfff0d2, emissive: 0xffdca6, emissiveIntensity: 1.7, roughness: 0.45 }) },
  get veludo() { return solid(0x7c1f36, 0.98) },
  get estofado() { return solid(0x2e5f57, 0.95) },
  get estofadoClaro() { return solid(0x3c7a70, 0.95) },
  get vidroMesa() {
    return stdMat('hotel-vidro-mesa', {
      color: 0xd6eff4, transparent: true, opacity: 0.24, roughness: 0.04,
      metalness: 0.06, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // Metalness 0.55 e nao 0.8: nao ha environment map nesta cena, e metal alto
  // sem nada pra refletir fica PRETO. Com 0.8 o caixilho da porta de vidro,
  // que e a peca mais vista do predio, lia como madeira escura.
  get bronze() { return stdMat('hotel-bronze-mat', { map: tiled(bronzeTex(), 1, 1), color: 0xd8b070, roughness: 0.34, metalness: 0.55 }) },
  get marmoreVerde() { return stdMat('hotel-verde', { map: tiled(marmoreTex('#1f4a44', '#8fd6c8', 0.5), 4, 2), roughness: 0.2, metalness: 0.15 }) },
  get cristal() {
    return stdMat('hotel-cristal', {
      color: 0xfff6e0, emissive: 0xffe6b4, emissiveIntensity: 1.9,
      transparent: true, opacity: 0.9, roughness: 0.15,
    })
  },
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
/** Laje retangular com topo em y=h (nao projeta sombra). */
function laje(g, x0, x1, z0, z1, h, mat) {
  const m = box(x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  m.castShadow = false
  g.add(m)
  return m
}

/** Plano vertical com giro em Y (0 = olha pra +Z). */
function painel(w, h, mat, x, y, z, ry) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.set(x, y, z)
  m.rotation.y = ry || 0
  m.castShadow = false
  m.receiveShadow = true
  return m
}

/** Material de parede externa, com a pedra no mesmo tamanho em todo painel. */
function matParede(w, h, lateral) {
  const rx = Math.max(0.3, w / 3.4), ry = Math.max(0.3, h / 3.4)
  return stdMat('hotel:ext:' + rx.toFixed(2) + ':' + ry.toFixed(2) + ':' + (lateral ? 1 : 0), {
    map: tiled(pedraTex(), rx, ry),
    color: lateral ? 0xd6c9ad : 0xe8dcc0,
    roughness: 0.9,
  })
}

function sombras(o) {
  o.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  return o
}

/**
 * Tira a subarvore do MAPA DE SOMBRA, mantendo ela recebendo sombra.
 *
 * Isto vale draw call de verdade, e a conta e simples: quem projeta sombra e
 * desenhado DUAS vezes por quadro (uma no mapa do sol, outra na tela). O hotel
 * media 188 meshes e 74 mil triangulos, e 141 meshes / 67 mil triangulos deles
 * estavam marcados pra projetar — ou seja, quase o predio inteiro pagava
 * dobrado, do outro lado do mapa inclusive, porque um predio de 15,5 m aparece
 * no frustum de sombra de metade da cidade.
 *
 * O que continua projetando: as paredes (e a sombra do predio na calcada), a
 * marquise (e a sombra dela na entrada, que e o efeito da fachada) e os postes
 * e floreiras da calcada. O que saiu: janela, sacada, cornija, letreiro e
 * telhado — peca fina, colada na parede, cuja sombra a propria parede ja da.
 */
function semSombra(o) {
  o.traverse((c) => { if (c.isMesh) c.castShadow = false })
  return o
}

// ===========================================================================
// A. CASCA
// ===========================================================================

/**
 * Moldura de piso: 4 tiras que passam POR BAIXO das paredes e vao ate o
 * avental. O miolo do lote fica sem laje — quem cobre ele e o marmore do
 * saguao, e duas lajes no mesmo Y brigariam por z-fighting.
 *
 * Os limites saem de apronOf(), que e a MESMA conta do groundY de city.js. Se
 * divergirem, o jogador anda enterrado 16 cm no proprio piso.
 */
function moldura(g) {
  const mc = stdMat('hotel-calcada', { map: tiled(pedraTex(), 6, 6), color: 0xcfc7b4, roughness: 0.88 })
  laje(g, AV.x0, B.x0 + T, AV.z0, AV.z1, BASE, mc)
  laje(g, B.x1 - T, AV.x1, AV.z0, AV.z1, BASE, mc)
  laje(g, B.x0 + T, B.x1 - T, B.z1 - T, AV.z1, BASE, mc)
  laje(g, B.x0 + T, B.x1 - T, AV.z0, B.z0 + T, BASE, mc)
}

/** Pilares cheios da fachada: o que sobra entre os vidros e a porta. */
function pilaresFachada() {
  const vaos = VIDROS.map((v) => v.slice()).concat([[DL, DR]]).sort((a, b) => a[0] - b[0])
  const out = []
  let cursor = B.x0
  for (const v of vaos) {
    if (v[0] > cursor + 0.01) out.push([cursor, v[0]])
    cursor = Math.max(cursor, v[1])
  }
  if (cursor < B.x1 - 0.01) out.push([cursor, B.x1])
  return out
}

function paredes(g, colliders, occluders) {
  const fz0 = B.z0, fz1 = B.z0 + T          // fachada = parede z0

  const parede = (x0, x1, y0, y1, z0, z1, lateral) => {
    const w = Math.max(x1 - x0, z1 - z0)
    g.add(box(x1 - x0, y1 - y0, z1 - z0, matParede(w, y1 - y0, lateral),
      (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
  }

  // Laterais e fundo, do chao ao topo do predio. As laterais param a uma
  // espessura de cada ponta e quem fecha os quatro cantos e o fundo (que ja vai
  // de x0 a x1) e a fachada. Indo de z0 a z1 inteiro — era assim — cada canto
  // ficava com DUAS paredes no mesmo bloco, e as faces externas caiam no mesmo
  // plano com cores diferentes: a lateral usa 0xd6c9ad e a da frente 0xe8dcc0.
  // Sao 15,5 m de altura de tira trocando de cor a cada passo do jogador, nas
  // quatro quinas do predio — parte do que o dono viu como "bug de iluminacao
  // nas janelas, parte superior e la embaixo tambem".
  parede(B.x0, B.x0 + T, 0, H, B.z0 + T, B.z1 - T, true)
  parede(B.x1 - T, B.x1, 0, H, B.z0 + T, B.z1 - T, true)
  parede(B.x0, B.x1, 0, H, B.z1 - T, B.z1, false)

  // fachada: pilares cheios + peitoril e bandeira dos vidros + verga da porta
  for (const p of pilaresFachada()) parede(p[0], p[1], 0, H, fz0, fz1, false)
  for (const v of VIDROS) {
    parede(v[0], v[1], 0, JAN_Y0, fz0, fz1, false)
    parede(v[0], v[1], JAN_Y1, H, fz0, fz1, false)
  }
  parede(DL, DR, DH, H, fz0, fz1, false)

  // soco de marmore escuro contornando o terreo (0.55: bate com o peitoril)
  for (const s of pilaresFachada()) {
    g.add(box(s[1] - s[0], 0.5, T + 0.14, M.soco, (s[0] + s[1]) / 2, 0.25, fz0 - 0.07 + T / 2))
  }
  for (const v of VIDROS) {
    g.add(box(v[1] - v[0], 0.5, T + 0.14, M.soco, (v[0] + v[1]) / 2, 0.25, fz0 - 0.07 + T / 2))
  }
  // Nas laterais o soco sai 14 cm PRA FORA e para rente a face interna da
  // parede. Centrado no meio dela ele avancaria 7 cm pra dentro do saguao e
  // apareceria como um degrau escuro passando na frente do rodape do marmore.
  for (const s of [-1, 1]) {
    const x = s < 0 ? B.x0 + T / 2 - 0.07 : B.x1 - T / 2 + 0.07
    g.add(box(T + 0.14, 0.5, B.z1 - B.z0, M.soco, x, 0.25, (B.z0 + B.z1) / 2))
  }
  g.add(box(B.x1 - B.x0, 0.5, T + 0.14, M.soco, (B.x0 + B.x1) / 2, 0.25, B.z1 - T / 2 + 0.07))

  // --- colisores: 4 paredes, com o vao da porta LIVRE ---------------------
  colliders.push({ minX: B.x0, maxX: B.x0 + T, minZ: B.z0, maxZ: B.z1, tag: 'hotel-parede' })
  colliders.push({ minX: B.x1 - T, maxX: B.x1, minZ: B.z0, maxZ: B.z1, tag: 'hotel-parede' })
  colliders.push({ minX: B.x0, maxX: B.x1, minZ: B.z1 - T, maxZ: B.z1, tag: 'hotel-parede' })
  colliders.push({ minX: B.x0, maxX: DL, minZ: fz0, maxZ: fz1, tag: 'hotel-fachada' })
  colliders.push({ minX: DR, maxX: B.x1, minZ: fz0, maxZ: fz1, tag: 'hotel-fachada' })

  // --- occluders de camera: as mesmas paredes, agora COM altura -----------
  // So ate o forro do saguao: acima disso e torre macica, e uma caixa cheia
  // ali em cima nao muda nada pra camera de 3a pessoa, que nunca sobe.
  const HO = CEIL + BASE + 0.4
  const occ = (minX, minY, minZ, maxX, maxY, maxZ, tag) =>
    occluders.push({ minX, minY, minZ, maxX, maxY, maxZ, tag })
  occ(B.x0, 0, B.z0, B.x0 + T, HO, B.z1, 'hotel-parede')
  occ(B.x1 - T, 0, B.z0, B.x1, HO, B.z1, 'hotel-parede')
  occ(B.x0, 0, B.z1 - T, B.x1, HO, B.z1, 'hotel-parede')
  occ(B.x0, 0, fz0, DL, HO, fz1, 'hotel-fachada')
  occ(DR, 0, fz0, B.x1, HO, fz1, 'hotel-fachada')
  occ(DL, DH, fz0, DR, HO, fz1, 'hotel-verga')
}

/** Vidro do terreo: pano de vidro, montantes de bronze e verga dourada. */
function vitrines(g) {
  const fz = B.z0
  for (const v of VIDROS) {
    const w = v[1] - v[0], h = JAN_Y1 - JAN_Y0
    const cx = (v[0] + v[1]) / 2, cy = (JAN_Y0 + JAN_Y1) / 2
    const pano = box(w - 0.08, h - 0.08, 0.04, M.vidroFachada, cx, cy, fz + T / 2)
    pano.castShadow = false
    g.add(pano)
    // Caixilho: verga, peitoril e dois montantes por vao.
    //
    // As duas travessas ENTRAM 4 cm na alvenaria em vez de encostar nela. Do
    // jeito antigo a verga ia de JAN_Y1 pra cima e a bandeira de alvenaria
    // comecava exatamente em JAN_Y1: as duas faces de baixo caiam no mesmo
    // plano, uma dourada e outra bege, ao longo de cada janela da fachada. O
    // mesmo embaixo, no peitoril. Sao as linhas horizontais que o dono viu
    // "tremendo nas janelas, parte superior e la em baixo tambem" — e que
    // pareciam luz porque o dourado chama atencao contra o bege.
    g.add(box(w + 0.16, 0.20, T + 0.16, M.ouroFosco, cx, JAN_Y1 + 0.06, fz + T / 2 - 0.02))
    g.add(box(w + 0.16, 0.18, T + 0.16, M.ouroFosco, cx, JAN_Y0 - 0.05, fz + T / 2 - 0.02))
    for (let i = 1; i <= 2; i++) {
      g.add(box(0.09, h, 0.12, M.ouroFosco, v[0] + (w / 3) * i, cy, fz - 0.03))
    }
    // travessa horizontal na altura da verga da porta: alinha a fachada toda
    g.add(box(w, 0.07, 0.10, M.ouroFosco, cx, DH, fz - 0.02))
    // calha de luz por dentro do vidro (a vitrine viva a noite)
    const gl = box(w - 0.5, 0.08, 0.07, M.luzQuente, cx, JAN_Y1 - 0.22, fz + T + 0.1)
    gl.castShadow = false
    g.add(gl)
  }
}

/**
 * A PORTA DE VIDRO AUTOMATICA.
 *
 * Duas folhas que correm pros lados por dentro da fachada. Devolve os dois
 * grupos pra quem anima (o update do modulo) mexer no X deles.
 *
 * O grupo raiz e marcado como dinamico pra o forno de geometria (world/bake.js)
 * nao fundir a porta na parede — fundida, ela nunca mais abriria. Ele fica na
 * origem e as folhas carregam a posicao ABSOLUTA: assim, quando o forno
 * reparenteia o grupo pra raiz do hotel, o X que o update escreve continua
 * querendo dizer a mesma coisa.
 */
function portaAutomatica(g) {
  const raiz = new THREE.Group()
  raiz.name = 'hotel-porta-automatica'
  raiz.userData.dynamic = true

  // ALT e a altura UTIL da folha, e ela sai de DH - BASE, nao de DH.
  // A verga da fachada nasce em y = DH contando do zero do mundo, mas o piso do
  // saguao esta em BASE (16 cm acima). Uma folha de DH de altura ficaria com o
  // pe enterrado no marmore e a cabeca atravessando a verga.
  const ALT = DH - BASE
  const folhas = []
  for (const s of [-1, 1]) {
    const f = new THREE.Group()
    const cx = B.door.center + s * (FOLHA_W / 2 - 0.01)
    f.position.set(cx, BASE, PORTA_Z)
    f.userData.baseX = cx
    f.userData.dir = s

    // pano de vidro + caixilho fino de bronze em volta
    const vidro = box(FOLHA_W - 0.10, ALT - 0.26, 0.035, M.vidroPorta, 0, ALT / 2 + 0.01, 0)
    vidro.castShadow = false
    f.add(vidro)
    f.add(box(FOLHA_W, 0.09, 0.09, M.bronze, 0, ALT - 0.05, 0))      // travessa alta
    f.add(box(FOLHA_W, 0.11, 0.09, M.bronze, 0, 0.06, 0))            // travessa baixa
    f.add(box(0.08, ALT - 0.15, 0.09, M.bronze, -s * (FOLHA_W / 2 - 0.04), ALT / 2, 0))
    // montante do encontro: mais grosso, e e nele que vai o puxador
    f.add(box(0.10, ALT - 0.15, 0.10, M.bronze, s * (FOLHA_W / 2 - 0.05), ALT / 2, 0))
    const pux = cyl(0.022, 0.022, 1.15, M.ouro, 10)
    pux.position.set(s * (FOLHA_W / 2 - 0.14), 1.10, 0.09)
    f.add(pux)
    for (const py of [0.58, 1.62]) {
      f.add(box(0.05, 0.05, 0.10, M.ouro, s * (FOLHA_W / 2 - 0.14), py, 0.05))
    }
    // faixa de aviso na altura dos olhos (a marca dourada do hotel)
    const faixa = box(FOLHA_W - 0.26, 0.05, 0.05, M.ouro, 0, 1.52, 0.03)
    faixa.castShadow = false
    f.add(faixa)

    raiz.add(f)
    folhas.push(f)
  }

  // trilho de bronze cobrindo o curso das duas folhas (7,3 m: e o vao mais as
  // duas gavetas laterais em que elas somem)
  raiz.add(box(B.door.width + 3.7, 0.14, 0.26, M.bronze, B.door.center, DH - 0.07, PORTA_Z))
  // sensor: a caixinha preta acima do vao, que explica por que a porta abre
  raiz.add(box(0.34, 0.10, 0.12, M.grafite, B.door.center, DH + 0.14, B.z0 - 0.02))

  g.add(raiz)
  return folhas
}

/** Marquise de entrada: forro aceso, testeira dourada e duas colunas. */
function marquise(g, colliders) {
  const w = MQ.x1 - MQ.x0, d = MQ.z1 - MQ.z0
  const cx = (MQ.x0 + MQ.x1) / 2, cz = (MQ.z0 + MQ.z1) / 2

  // laje da marquise
  g.add(box(w, MQ.esp, d, M.cornija, cx, MQ.y + MQ.esp / 2, cz))
  // testeira dourada nos tres lados livres
  g.add(box(w + 0.2, 0.24, 0.14, M.ouro, cx, MQ.y + 0.06, MQ.z0 - 0.06))
  for (const s of [-1, 1]) {
    g.add(box(0.14, 0.24, d + 0.2, M.ouro, cx + s * (w / 2 + 0.03), MQ.y + 0.06, cz))
  }
  // forro aceso: nao e so enfeite, e a unica luz da calcada aqui (o anel so tem
  // poste na calcada de FORA)
  const forro = box(w - 0.3, 0.05, d - 0.3, M.luzMansa, cx, MQ.y - 0.02, cz)
  forro.castShadow = false
  g.add(forro)
  for (let i = 0; i < 4; i++) {
    const lx = MQ.x0 + 0.85 + i * ((w - 1.7) / 3)
    const sp = cyl(0.13, 0.13, 0.06, M.ouroFosco, 12)
    sp.position.set(lx, MQ.y - 0.05, cz)
    sp.castShadow = false
    g.add(sp)
  }

  // duas colunas na ponta da marquise
  for (const s of [-1, 1]) {
    const x = cx + s * (w / 2 - 0.4)
    const z = MQ.z0 + 0.4
    g.add(box(0.42, 0.22, 0.42, M.soco, x, BASE + 0.11, z))
    const fuste = cyl(0.13, 0.15, MQ.y - BASE - 0.3, M.ouroFosco, 14)
    fuste.position.set(x, BASE + 0.22 + (MQ.y - BASE - 0.3) / 2, z)
    g.add(fuste)
    g.add(box(0.32, 0.12, 0.32, M.ouro, x, MQ.y - 0.06, z))
    colliders.push({ minX: x - 0.24, maxX: x + 0.24, minZ: z - 0.24, maxZ: z + 0.24, tag: 'hotel-coluna' })
  }

  // Aqui havia TRES MASTROS DE BANDEIRA na testeira, e eles sairam a pedido do
  // dono do projeto ("retire tambem umas bandeira na frente do estabelecimento,
  // ficou ruim"). Fica o registro pra ninguem tentar de novo achando que
  // esqueceram: o problema nao era a posicao (ja tinham sido movidos da cornija
  // pra ca) nem o caimento do pano — e que tres retangulos chapados de cor
  // saturada na frente de uma fachada de pedra e vidro roubavam a leitura da
  // entrada inteira, que e a peca que essa fachada tem pra vender.
}

/**
 * Letreiro da fachada + a cornija que fecha o terreo.
 *
 * TODO Z AQUI E NEGATIVO PRA FORA. A fachada e a face z0 (-48), entao "na
 * frente do painel" quer dizer z MENOR. O painel ocupa -48.20..-48.00; qualquer
 * coisa colada nele (texto, neon, estrela) precisa passar de -48.20, senao
 * nasce DENTRO da chapa e nao aparece.
 */
function letreiro(g) {
  const y = 5.15                      // painel 4.50..5.80: entre a marquise
  const PZ = B.z0 - 0.10              // (topo 4.44) e a cornija (base 6.00)
  g.add(box(8.6, 1.30, 0.20, M.grafite, B.door.center, y, PZ))
  g.add(box(8.9, 0.10, 0.30, M.ouro, B.door.center, y + 0.70, PZ - 0.02))
  g.add(box(8.9, 0.10, 0.30, M.ouro, B.door.center, y - 0.70, PZ - 0.02))
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(8.1, 0.66), textPlaneMat('HOTEL PARAISO', {
    w: 1024, h: 100, color: '#ffe9b8', font: 'bold 62px "Trebuchet MS", sans-serif',
    glow: '#39c9c0', stroke: '#39c9c0', emissiveIntensity: 1.5,
  }))
  txt.position.set(B.door.center, y + 0.17, B.z0 - 0.21)
  txt.rotation.y = Math.PI
  txt.castShadow = false
  g.add(txt)
  // tubo de neon turquesa nas duas pontas do painel
  for (const s of [-1, 1]) {
    const t2 = box(0.06, 1.16, 0.06, M.turquesa, B.door.center + s * 4.34, y, B.z0 - 0.22)
    t2.castShadow = false
    g.add(t2)
  }

  // as quatro estrelas de categoria, na faixa de baixo do MESMO painel
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), textPlaneMat('*', {
      w: 128, h: 128, color: '#ffd977', font: 'bold 150px "Trebuchet MS", sans-serif',
      glow: '#ffb63c', emissiveIntensity: 1.2,
    }))
    e.position.set(B.door.center - 0.78 + i * 0.52, y - 0.40, B.z0 - 0.21)
    e.rotation.y = Math.PI
    e.castShadow = false
    g.add(e)
  }

  // cornija do terreo: a linha que separa o saguao dos andares, dando a volta
  g.add(box(B.x1 - B.x0 + 0.5, 0.30, 0.5, M.cornija, (B.x0 + B.x1) / 2, GF, B.z0 - 0.10))
  g.add(box(B.x1 - B.x0 + 0.34, 0.10, 0.36, M.ouroFosco, (B.x0 + B.x1) / 2, GF + 0.20, B.z0 - 0.05))
  for (const x of [B.x0 + 0.1, B.x1 - 0.1]) {
    g.add(box(0.5, 0.30, B.z1 - B.z0, M.cornija, x, GF, (B.z0 + B.z1) / 2))
  }
  g.add(box(B.x1 - B.x0 + 0.5, 0.30, 0.5, M.cornija, (B.x0 + B.x1) / 2, GF, B.z1 + 0.10))
}

/**
 * Os tres andares de cima. Sao CENARIO: nao ha piso la dentro nem escada que
 * chegue. Mas e o que faz o predio ler como hotel da calcada — sacada, janela
 * de porta-balcao e cortina.
 */
function andares(g) {
  const y0 = GF + 0.35
  const floorH = (H - 0.5 - y0) / 3

  const cortina = solid(0xd8cdb4, 0.95)
  const grade = solid(0x3a3f45, 0.6, 0.55)

  /** Uma janela na face fk, deslocada u do centro dela. */
  function janela(fk, u, y, w, h, sacada) {
    const n = fk === 'z-' ? -1 : fk === 'z+' ? 1 : 0
    const nx = fk === 'x-' ? -1 : fk === 'x+' ? 1 : 0
    const bx = nx ? (nx > 0 ? B.x1 : B.x0) : (B.x0 + B.x1) / 2
    const bz = n ? (n > 0 ? B.z1 : B.z0) : (B.z0 + B.z1) / 2
    const ang = nx ? nx * Math.PI / 2 : (n > 0 ? 0 : Math.PI)
    // ponto na face, deslocado 'o' pra fora
    const at = (o) => ({
      x: bx + (nx ? nx * o : u), y, z: bz + (n ? n * o : -u * (nx > 0 ? 1 : -1)),
    })
    const p0 = at(0.06)
    const moldura2 = box(w + 0.26, h + 0.26, 0.12, M.cornija, p0.x, p0.y, p0.z)
    moldura2.rotation.y = ang
    g.add(moldura2)
    const p1 = at(0.10)
    const vd = box(w, h, 0.05, M.vidroJanela, p1.x, p1.y, p1.z)
    vd.rotation.y = ang
    vd.castShadow = false
    g.add(vd)
    // A CORTINA FICA 16 CM PRA FORA, e nao 13.
    //
    // O vidro esta em at(0.10) com 5 cm de espessura, ou seja, ele ocupa de
    // 0.075 a 0.125. A cortina em at(0.13) com 3 cm ocupava 0.115 a 0.145 — um
    // centimetro DENTRO do vidro, dois planos paralelos quase colados. Foi
    // metade do "bug na iluminacao nas janelas" que o dono viu: com a camera
    // andando 3 cm, esconder so este material derrubava o tremor da faixa das
    // janelas de 11% pra 8,2%.
    //
    // Ela vai na frente do vidro (e nao atras, que seria o certo no mundo real)
    // porque M.vidroJanela e OPACO — e um solid escuro, nao um transparente.
    // Cortina atras dele simplesmente nao existiria.
    const p2 = at(0.16)
    const ct = box(w * 0.86, h * 0.6, 0.03, cortina, p2.x, p2.y + h * 0.16, p2.z)
    ct.rotation.y = ang
    ct.castShadow = false
    g.add(ct)
    // verga em arco baixo e pingadeira
    const p3 = at(0.15)
    const vg = box(w + 0.5, 0.14, 0.2, M.cornija, p3.x, p3.y + h / 2 + 0.2, p3.z)
    vg.rotation.y = ang
    g.add(vg)
    if (!sacada) {
      const pd = box(w + 0.44, 0.10, 0.3, M.cornija, p3.x, p3.y - h / 2 - 0.12, p3.z)
      pd.rotation.y = ang
      g.add(pd)
      return
    }
    // sacada: laje, guarda-corpo de balaustre e corrimao
    const pl = at(0.34)
    const lj = box(w + 0.8, 0.14, 0.62, M.cornija, pl.x, pl.y - h / 2 - 0.1, pl.z)
    lj.rotation.y = ang
    g.add(lj)
    const pg = at(0.60)
    // OS BALAUSTRES AFUNDAM 3 CM NA LAJE, e nao pousam em cima dela.
    //
    // A laje da sacada vai ate `pl.y - h/2 - 0.03` (topo). Um balaustre de 62 cm
    // centrado em `+0.28` comeca EXATAMENTE em -0.03 — o pe dele e o topo da
    // laje no mesmo Y, e as duas faces disputam o pixel. Isso e o que o dono
    // viu como "bug na iluminacao nas janelas, parte superior": nao era luz, era
    // o guarda-corpo piscando contra a propria sacada.
    //
    // A medida: com a camera andando 3 cm, 11,3% dos pixels da faixa das janelas
    // mudavam de cor; escondendo so o material do guarda-corpo, caia pra 7,7%.
    // Afundando 3 cm, a face de baixo do balaustre passa a estar DENTRO da laje,
    // onde ninguem a ve e nada disputa com ela.
    // CINCO balaustres de 8 cm, e nao oito de 5.
    //
    // O que sobrou de tremor nas sacadas depois de arrumar a geometria nao era
    // mais z-fighting: era ALIASING. Uma barra de 5 cm vista da calcada, a 15 m
    // e tres andares acima, ocupa MENOS DE UM PIXEL — e o que cabe num pixel
    // sub-amostrado muda a cada quadro em que a camera anda, ligando e
    // desligando a barra. Nenhum ajuste de profundidade resolve isso; o que
    // resolve e a barra caber no pixel.
    //
    // 8 cm a 15 m ainda e fino, mas para de piscar. E cinco em vez de oito
    // mantem o vao do guarda-corpo parecido (a barra engrossou 60%, entao tirar
    // tres deixa o ritmo igual) e ainda tira 45 caixas do predio.
    for (let i = 0; i <= 4; i++) {
      const du = -((w + 0.6) / 2) + ((w + 0.6) / 4) * i
      const bx2 = pg.x + (n ? du : 0)
      const bz2 = pg.z + (nx ? -nx * du : 0)
      const bal = box(0.08, 0.62, 0.08, grade, bx2, pl.y - h / 2 + 0.25, bz2)
      g.add(bal)
    }
    // O CORRIMAO TEM QUE ATRAVESSAR OS BALAUSTRES, e nao pousar em cima deles.
    //
    // Com os balaustres afundados na laje o topo deles passou pra +0.56, e o
    // corrimao em +0.60 com 7 cm de altura comecava em +0.565: cinco milimetros
    // de distancia entre duas faces paralelas, que e a pior situacao possivel
    // pro z-buffer — pior, inclusive, do que quando eles se cruzavam. Em +0.53
    // ele entra 6,5 cm no balaustre; peca que atravessa peca nao pisca, porque
    // nao ha face nenhuma disputando o mesmo plano.
    const cr = box(w + 0.7, 0.07, 0.09, grade, pg.x, pl.y - h / 2 + 0.53, pg.z)
    cr.rotation.y = ang
    g.add(cr)
  }

  for (let f = 0; f < 3; f++) {
    const yc = y0 + f * floorH + floorH * 0.52
    // fachada norte: 5 portas-balcao com sacada (e a face que a rua ve)
    for (let i = 0; i < 5; i++) {
      janela('z-', -6.0 + i * 3.0, yc, 1.5, 2.1, true)
    }
    // laterais e fundos: janela comum
    for (let i = 0; i < 4; i++) {
      const u = -4.5 + i * 3.0
      janela('x-', u, yc, 1.2, 1.6, false)
      janela('x+', u, yc, 1.2, 1.6, false)
    }
    for (let i = 0; i < 5; i++) {
      janela('z+', -6.0 + i * 3.0, yc, 1.2, 1.6, false)
    }
    // cinta fina marcando a laje
    if (f > 0) {
      const yb = y0 + f * floorH
      g.add(box(B.x1 - B.x0 + 0.24, 0.16, B.z1 - B.z0 + 0.24, M.cornija,
        (B.x0 + B.x1) / 2, yb, (B.z0 + B.z1) / 2))
    }
  }
}

/**
 * Cobertura. As medidas NAO sao livres: world/neve.js poe a neve do telhado
 * assumindo o padrao do buildShell de city.js — laje de (w+0.7 x 0.34 x d+0.7)
 * com topo em H+0.34, mureta de 0.70 na fachada (topo em H+1.04) e de 0.55 nos
 * outros tres lados (topo em H+0.895), recuadas 5 cm pra dentro da parede.
 * Sair disso poe a faixa branca dentro da mureta e o predio mais alto do
 * quadrante fica sem a linha de neve que todos os outros tem.
 */
function telhado(g) {
  const w = B.x1 - B.x0, d = B.z1 - B.z0
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2

  g.add(box(w + 0.7, 0.34, d + 0.7, solid(0x4f4a44, 0.95), cx, H + 0.17, cz))
  const pm = M.cornija
  g.add(box(w + 0.5, 0.70, 0.34, pm, cx, H + 0.69, B.z0 + 0.06))
  g.add(box(w + 0.5, 0.55, 0.34, pm, cx, H + 0.615, B.z1 - 0.06))
  g.add(box(0.34, 0.55, d + 0.5, pm, B.x0 + 0.06, H + 0.615, cz))
  g.add(box(0.34, 0.55, d + 0.5, pm, B.x1 - 0.06, H + 0.615, cz))
  // filete dourado coroando a mureta da frente
  g.add(box(w + 0.62, 0.09, 0.42, M.ouroFosco, cx, H + 1.08, B.z0 + 0.06))

  // letreiro de cobertura: e o que se le do outro lado do anel
  const sg = new THREE.Group()
  sg.position.set(B.door.center, H + 2.35, B.z0 + 0.12)
  sg.rotation.y = Math.PI
  const cha = box(9.4, 1.5, 0.16, M.grafite, 0, 0, 0)
  sg.add(cha)
  const t2 = new THREE.Mesh(new THREE.PlaneGeometry(8.9, 1.2), textPlaneMat('HOTEL PARAISO', {
    w: 1024, h: 140, color: '#eafffb', font: 'bold 92px "Trebuchet MS", sans-serif',
    glow: '#39c9c0', stroke: '#2fc4bb', emissiveIntensity: 2.0,
  }))
  t2.position.z = 0.11
  t2.castShadow = false
  sg.add(t2)
  for (const s of [-1, 1]) {
    const tb = box(0.08, 1.36, 0.08, M.turquesa, s * 4.6, 0, 0.10)
    tb.castShadow = false
    sg.add(tb)
  }
  // estrutura segurando a chapa
  for (const s of [-1, 1]) {
    sg.add(box(0.14, 1.6, 0.14, M.grafite, s * 3.4, -1.55, -0.1))
  }
  g.add(sg)

  // caixa d'agua sobre pes + dois condensadores: quebra a silhueta chapada
  const cd = cyl(1.15, 1.15, 1.7, solid(0x8d949a, 0.6, 0.4), 16)
  cd.position.set(B.x0 + 4.2, H + 1.55, B.z1 - 3.4)
  g.add(cd)
  const tampa = cyl(1.22, 1.22, 0.16, M.grafite, 16)
  tampa.position.set(B.x0 + 4.2, H + 2.44, B.z1 - 3.4)
  g.add(tampa)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    g.add(box(0.13, 0.7, 0.13, M.grafite,
      B.x0 + 4.2 + Math.cos(a) * 0.85, H + 0.69, B.z1 - 3.4 + Math.sin(a) * 0.85))
  }
  if (typeof Props.makeAC === 'function') {
    for (const p of [[B.x1 - 3.6, B.z1 - 2.6], [B.x1 - 6.4, B.z1 - 2.6]]) {
      let ac = null
      try { ac = Props.makeAC() } catch (err) { void err; ac = null }
      if (!ac) break
      ac.userData.update = null    // sao dois, la em cima: nao valem um update
      ac.position.set(p[0], H + 0.34, p[1])
      sombras(ac)
      g.add(ac)
    }
  }
}

/**
 * A calcada da entrada: passadeira verde ate o meio-fio, dois postes de globo e
 * duas floreiras. A calcada INTERNA do anel nao tem poste nenhum (city.js so
 * poe na de fora), entao sem isso a porta do hotel e um buraco preto a noite.
 */
function calcada(g, colliders) {
  const y = BASE + 0.012
  const x0 = B.door.center - 1.7, x1 = B.door.center + 1.7
  const tp = box(x1 - x0, 0.024, 3.9, M.toldoCarpete, (x0 + x1) / 2, y, B.z0 - 1.95)
  tp.castShadow = false
  g.add(tp)
  for (const s of [-1, 1]) {
    const b2 = box(0.16, 0.03, 3.9, M.ouroFosco, (x0 + x1) / 2 + s * 1.62, y + 0.005, B.z0 - 1.95)
    b2.castShadow = false
    g.add(b2)
  }

  // postes de globo, fora da faixa da marquise
  for (const s of [-1, 1]) {
    const x = B.door.center + s * 4.6
    const z = B.z0 - 1.7
    const p = new THREE.Group()
    p.position.set(x, BASE, z)
    p.add(box(0.34, 0.16, 0.34, M.soco, 0, 0.08, 0))
    const f = cyl(0.06, 0.09, 2.5, M.grafite, 10)
    f.position.y = 1.4
    p.add(f)
    p.add(box(0.16, 0.10, 0.16, M.ouroFosco, 0, 2.64, 0))
    const globo = sphere(0.24, M.luzMansa, 14)
    globo.position.y = 2.92
    globo.castShadow = false
    p.add(globo)
    p.add(box(0.20, 0.06, 0.20, M.ouro, 0, 3.14, 0))
    g.add(p)
    colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: z - 0.2, maxZ: z + 0.2, tag: 'hotel-poste' })
  }

  // floreiras de pedra ladeando a passadeira
  for (const s of [-1, 1]) {
    const x = B.door.center + s * 2.7
    const z = B.z0 - 1.1
    const fl = new THREE.Group()
    fl.position.set(x, BASE, z)
    fl.add(roundedBox(0.9, 0.62, 0.9, 0.07, M.soco).translateY(0.31))
    fl.add(box(1.0, 0.09, 1.0, M.cornija, 0, 0.64, 0))
    fl.add(cyl(0.36, 0.36, 0.06, solid(0x3b2c20, 1.0), 12).translateY(0.66))
    // arbusto: tres esferas achatadas
    for (let i = 0; i < 3; i++) {
      const b2 = sphere(0.26 - i * 0.05, solid(i ? 0x3f7a45 : 0x4e8c50, 0.95), 10)
      b2.position.set((i - 1) * 0.2, 0.82 + i * 0.12, (i % 2 ? 0.12 : -0.1))
      b2.scale.y = 0.8
      fl.add(b2)
    }
    g.add(fl)
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, tag: 'hotel-floreira' })
  }
}

// ===========================================================================
// B. MIOLO — tudo daqui pra baixo tem o piso do saguao em y = 0 (o grupo
// inteiro sobe pra LEVELS.SHOP_FLOOR depois)
// ===========================================================================

function piso(g) {
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.pisoMarmore)
  p.position.set((IN.x0 + IN.x1) / 2, 0.005, (IN.z0 + IN.z1) / 2)
  g.add(p)

  // faixa escura contornando o salao (o "quadro" do marmore claro)
  const fx = 0.55
  const faixa = (x0, x1, z0, z1) => {
    const f = box(x1 - x0, 0.012, z1 - z0, M.pisoEscuro, (x0 + x1) / 2, 0.011, (z0 + z1) / 2)
    f.castShadow = false
    g.add(f)
  }
  faixa(IN.x0, IN.x1, IN.z0, IN.z0 + fx)
  faixa(IN.x0, IN.x1, IN.z1 - fx, IN.z1)
  faixa(IN.x0, IN.x0 + fx, IN.z0 + fx, IN.z1 - fx)
  faixa(IN.x1 - fx, IN.x1, IN.z0 + fx, IN.z1 - fx)
  // filete de latao por dentro da faixa
  const fil = 0.05
  faixa(IN.x0 + fx, IN.x1 - fx, IN.z0 + fx, IN.z0 + fx + fil)
  faixa(IN.x0 + fx, IN.x1 - fx, IN.z1 - fx - fil, IN.z1 - fx)

  // ROSA DOS VENTOS de latao no eixo da porta: e a primeira coisa que se pisa.
  //
  // As camadas ficam em Y ESCALONADO de propósito (aro -0.005, disco 0, raios
  // +0.018, miolo +0.02). Duas dessas superficies no MESMO Y — foi como isto
  // nasceu, aro e disco os dois em zero — e um par concentrico brigando pelo
  // mesmo pixel: o chao da entrada piscava dourado/escuro ao andar.
  const med = new THREE.Group()
  med.position.set(B.door.center, 0.014, -44.9)
  const aro = cyl(1.21, 1.21, 0.010, M.ouroFosco, 40)
  aro.position.y = -0.005
  aro.castShadow = false
  med.add(aro)
  const disco = cyl(1.15, 1.15, 0.012, M.pisoEscuro, 40)
  disco.castShadow = false
  med.add(disco)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const comp = i % 2 ? 0.54 : 1.00
    const p2 = box(0.11, 0.010, comp, M.ouro, Math.sin(a) * comp / 2, 0.018, Math.cos(a) * comp / 2)
    p2.rotation.y = a
    p2.castShadow = false
    med.add(p2)
  }
  const miolo = cyl(0.15, 0.15, 0.012, M.ouro, 20)
  miolo.position.y = 0.02
  miolo.castShadow = false
  med.add(miolo)
  g.add(med)

  // rodape de marmore escuro nas quatro paredes
  const R = 0.20
  g.add(box(IN.x1 - IN.x0, R, 0.05, M.pisoEscuro, (IN.x0 + IN.x1) / 2, R / 2, IN.z1 - 0.03))
  g.add(box(IN.x1 - IN.x0, R, 0.05, M.pisoEscuro, (IN.x0 + IN.x1) / 2, R / 2, IN.z0 + 0.03))
  for (const s of [-1, 1]) {
    g.add(box(0.05, R, IN.z1 - IN.z0, M.pisoEscuro,
      s > 0 ? IN.x1 - 0.03 : IN.x0 + 0.03, R / 2, (IN.z0 + IN.z1) / 2))
  }
}

/** Lambri, quadros e arandelas nas paredes cegas. */
function revestimento(g) {
  const ALT = 1.15
  // lambri de madeira nas paredes oeste, leste e fundo, com friso por cima
  const lambri = (x0, x1, z0, z1) => {
    g.add(box(x1 - x0, ALT, z1 - z0, M.lambri, (x0 + x1) / 2, ALT / 2, (z0 + z1) / 2))
    g.add(box(x1 - x0 + 0.02, 0.09, (z1 - z0) + 0.02, M.madeira, (x0 + x1) / 2, ALT + 0.04, (z0 + z1) / 2))
  }
  lambri(IN.x0, IN.x0 + 0.05, IN.z0, IN.z1)
  lambri(IN.x1 - 0.05, IN.x1, IN.z0, IN.z1)
  lambri(IN.x0, IN.x1, IN.z1 - 0.05, IN.z1)

  // Arandelas: quatro na parede oeste, DUAS na leste. A leste so tem duas
  // porque de z = -43.6 pra tras a parede leste e a escada — uma arandela em
  // -40.3 nasceria 25 cm acima do patamar, encostada na porta de cima.
  for (const s of [-1, 1]) {
    const x = s < 0 ? IN.x0 + 0.09 : IN.x1 - 0.09
    const n = s < 0 ? 4 : 2
    for (let i = 0; i < n; i++) {
      const z = -46.3 + i * (s < 0 ? 3.0 : 1.9)
      const a = new THREE.Group()
      a.position.set(x, 2.35, z)
      a.add(box(0.10, 0.34, 0.16, M.ouroFosco, 0, 0, 0))
      const tacaG = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.07, 0.26, 12, 1, true), M.cristal)
      tacaG.position.set(-s * 0.16, 0.16, 0)
      tacaG.castShadow = false
      a.add(tacaG)
      g.add(a)
    }
  }

  // quadros na parede oeste (entre as arandelas)
  if (typeof Props.makeFramedPicture === 'function') {
    for (let i = 0; i < 3; i++) {
      let q = null
      try { q = Props.makeFramedPicture(0.9, 1.15, 'abstract', 40 + i * 7) } catch (err) { void err; q = null }
      if (!q) break
      q.position.set(IN.x0 + 0.09, 1.95, -45.0 + i * 3.0)
      q.rotation.y = Math.PI / 2
      sombras(q)
      g.add(q)
    }
  }

  // painel de vidro fosco com o nome, na parede leste sob a escada
  const pl = painel(2.6, 1.0, textPlaneMat('BEM-VINDO AO PARAISO', {
    w: 1024, h: 200, color: '#e8fbf7', font: 'bold 74px "Trebuchet MS", sans-serif',
    glow: '#2fc4bb', emissiveIntensity: 0.9,
  }), IN.x1 - 0.08, 2.05, -46.2, -Math.PI / 2)
  g.add(pl)
}

/** Forro em caixotoes, sanca acesa, lustre e as tres luzes de verdade. */
function forroELuz(g, raiz) {
  const cx = (IN.x0 + IN.x1) / 2, cz = (IN.z0 + IN.z1) / 2
  const t = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.forro, Math.PI / 2)
  t.position.set(cx, CEIL, cz)
  g.add(t)

  // caixotoes: grade 5 x 4 de molduras rebaixadas
  const nx = 5, nz = 4
  const cw = (IN.x1 - IN.x0 - 1.2) / nx, cd = (IN.z1 - IN.z0 - 1.2) / nz
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = IN.x0 + 0.6 + cw * (i + 0.5)
      const z = IN.z0 + 0.6 + cd * (k + 0.5)
      const cf = box(cw - 0.30, 0.10, cd - 0.30, M.forroCaixa, x, CEIL - 0.06, z)
      cf.castShadow = false
      g.add(cf)
      const ro = box(cw - 0.12, 0.14, cd - 0.12, M.forro, x, CEIL - 0.07, z)
      ro.castShadow = false
      g.add(ro)
    }
  }

  // sanca acesa contornando o forro (emissivo: acende o teto, nao a sala)
  const S = 0.34
  const sanca = (x0, x1, z0, z1) => {
    const m = box(x1 - x0, 0.10, z1 - z0, M.sanca, (x0 + x1) / 2, CEIL - 0.26, (z0 + z1) / 2)
    m.castShadow = false
    g.add(m)
  }
  sanca(IN.x0 + 0.1, IN.x1 - 0.1, IN.z0 + 0.1, IN.z0 + 0.1 + S)
  sanca(IN.x0 + 0.1, IN.x1 - 0.1, IN.z1 - 0.1 - S, IN.z1 - 0.1)
  sanca(IN.x0 + 0.1, IN.x0 + 0.1 + S, IN.z0 + 0.1 + S, IN.z1 - 0.1 - S)
  sanca(IN.x1 - 0.1 - S, IN.x1 - 0.1, IN.z0 + 0.1 + S, IN.z1 - 0.1 - S)

  // --- LUSTRE ---------------------------------------------------------------
  const lus = new THREE.Group()
  lus.position.set(B.door.center, 0, -42.6)
  const haste = cyl(0.035, 0.035, 1.35, M.ouroFosco, 8)
  haste.position.y = CEIL - 0.68
  lus.add(haste)
  lus.add(box(0.30, 0.10, 0.30, M.ouroFosco, 0, CEIL - 0.05, 0))
  // tres aros concentricos de cristal
  const AROS = [[1.30, 3.42, 16], [0.92, 3.72, 12], [0.54, 4.00, 8]]
  for (const [r, y, n] of AROS) {
    const aro = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 26), M.ouro)
    aro.rotation.x = Math.PI / 2
    aro.position.y = y
    aro.castShadow = false
    lus.add(aro)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const v = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), M.cristal)
      v.position.set(Math.cos(a) * r, y - 0.16, Math.sin(a) * r)
      v.castShadow = false
      lus.add(v)
      const fio = cyl(0.006, 0.006, 0.22, M.ouroFosco, 5)
      fio.position.set(Math.cos(a) * r, y - 0.05, Math.sin(a) * r)
      fio.castShadow = false
      lus.add(fio)
    }
  }
  const bojo = sphere(0.28, M.cristal, 14)
  bojo.position.y = 3.30
  bojo.castShadow = false
  lus.add(bojo)
  g.add(lus)

  // --- AS DUAS LUZES --------------------------------------------------------
  //
  // ERAM QUATRO (tres aqui dentro + uma sob a marquise), e as quatro juntas
  // custaram caro em dois lugares ao mesmo tempo:
  //
  //  1. NO BRILHO. O dono fotografou e disse "ta muito forte a entrada do hotel
  //     e dentro dele tambem". Com 50 + 44 + 40 num salao de 205 m2, o marmore
  //     do chao — que e liso e claro — estourava em branco no meio da sala e o
  //     veio simplesmente sumia.
  //
  //  2. NO FPS, e esta e a parte que nao e obvia. O three.js e forward
  //     renderer: o numero de PointLight da CENA entra no shader de TODO
  //     material, e cada luz a mais e um laco a mais por FRAGMENTO em cada
  //     pixel do mapa inteiro, nao so aqui dentro. A cena ja rodava com 26; o
  //     hotel levou pra 30 de uma vez, +15% no custo de sombreamento de tudo.
  //     "parece ate que tive queda de fps" nao era impressao.
  //
  // Duas, entao, e mais fracas: 34 no lustre e 30 na recepcao. O canto da
  // escada e do elevador perdeu a luz propria e passou a viver do alcance
  // dessas duas (20 m cobre o salao inteiro) mais o emissivo das arandelas e da
  // sanca — que ali basta, porque naquele canto o que precisa aparecer e
  // SUPERFICIE brilhante (o bronze da porta do elevador, o latao do corrimao),
  // e nao chao iluminado.
  //
  // Sem sombra: uma PointLight com sombra custa seis faces de mapa por quadro e
  // o orcamento de sombra da cena e do sol.
  const LUZES = [
    { x: B.door.center, y: 3.55, z: -42.6, i: 34 },  // lustre / sala de espera
    { x: -42.0, y: 3.10, z: -39.4, i: 30 },          // balcao da recepcao
  ]
  //
  // AS PointLight NAO MORAM AQUI DENTRO — ELAS VAO PRA `raiz`.
  //
  // Isto foi um BUG de travamento, medido e nao suposto. O LOD deste modulo
  // esconde o miolo por distancia, e as luzes estavam DENTRO do que ele esconde:
  // atravessar a fronteira mudava a CONTAGEM DE LUZES VISIVEIS DA CENA.
  //
  // No three.js o programa de shader de cada material e montado a partir dessa
  // contagem. Quando ela muda, TODO material da cena vira programa novo e o
  // renderer recompila a cena inteira no meio do quadro — um engasgo de varios
  // quadros, sempre no mesmo ponto do mapa, nos dois sentidos. Era exatamente o
  // que o dono descreveu: "travamentos ao chegar perto da loja de carros ou do
  // hotel". A medicao (tools/perfil-fps.mjs e a sonda de luz) mostrou a
  // contagem pulando 20 -> 22 -> 24 numa unica descida da avenida.
  //
  // E a MESMA armadilha que render/luzes-efeito.js foi escrito pra evitar, e que
  // world/adega.js e world/cortico.js ja tratam do jeito certo. A regra e uma
  // so: LUZ DE INTERIOR FICA NA RAIZ DO MODULO, que nunca e escondida. Ela
  // continua custando o laco por fragmento (a contagem e constante, que e o
  // ponto), e iluminar um comodo que ninguem esta vendo nao acende pixel nenhum
  // a mais.
  //
  // O `+ BASE` no Y existe porque `dentro` esta levantado no piso da loja e a
  // raiz nao: mudar de pai muda o referencial, e sem isso as duas luzes
  // desceriam 16 cm.
  for (const L of LUZES) {
    const pl = new THREE.PointLight(0xffeacb, L.i, 20, 2)
    pl.position.set(L.x, L.y + BASE, L.z)
    pl.castShadow = false
    raiz.add(pl)
  }
}

/** O balcao de recepcao e a parede de tras dele. */
function balcao(g, colliders) {
  const b = BALCAO
  const w = b.x1 - b.x0, d = b.z1 - b.z0
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2

  // corpo: base escura, painel de madeira, friso de latao, tampo de marmore
  g.add(box(w, 0.16, d, M.pisoEscuro, cx, 0.08, cz))
  g.add(box(w - 0.06, b.h - 0.16, d - 0.06, M.madeira, cx, 0.16 + (b.h - 0.16) / 2, cz))
  g.add(box(w - 0.9, 0.62, 0.04, M.lambri, cx, 0.62, b.z0 - 0.015))
  g.add(box(w - 0.8, 0.05, 0.05, M.ouroFosco, cx, 0.98, b.z0 - 0.02))
  g.add(box(w - 0.8, 0.05, 0.05, M.ouroFosco, cx, 0.30, b.z0 - 0.02))
  const tampo = box(w + 0.16, 0.09, d + 0.20, M.marmoreVerde, cx, b.h + 0.045, cz)
  g.add(tampo)
  // Filete de latao contornando a BORDA do tampo — quatro barras, nao uma
  // chapa. Com a chapa inteira (que era o que estava aqui) o tampo ficava 100%
  // dourado visto de pe e o marmore verde nao aparecia em lugar nenhum.
  const tw = w + 0.16, td = d + 0.20, ty = b.h + 0.075
  g.add(box(tw + 0.06, 0.05, 0.06, M.ouro, cx, ty, cz - td / 2 - 0.01))
  g.add(box(tw + 0.06, 0.05, 0.06, M.ouro, cx, ty, cz + td / 2 + 0.01))
  for (const s of [-1, 1]) {
    g.add(box(0.06, 0.05, td + 0.02, M.ouro, cx + s * (tw / 2 + 0.01), ty, cz))
  }

  colliders.push({
    minX: b.x0 - 0.1, maxX: b.x1 + 0.1,
    minZ: b.z0 - 0.12, maxZ: b.z1 + 0.12, tag: 'hotel-balcao',
  })

  // --- coisas em cima do balcao --------------------------------------------
  // campainha de latao (o objeto que diz "recepcao" sozinho)
  const camp = new THREE.Group()
  camp.position.set(b.x1 - 0.7, b.h + 0.09, cz - 0.12)
  camp.add(cyl(0.09, 0.10, 0.025, M.ouroFosco, 14))
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.072, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.ouro)
  cup.position.y = 0.03
  camp.add(cup)
  camp.add(cyl(0.011, 0.011, 0.035, M.ouro, 6).translateY(0.115))
  g.add(camp)

  // livro de registro aberto
  g.add(box(0.52, 0.05, 0.36, solid(0x7a2230, 0.9), cx + 0.5, b.h + 0.11, cz))
  g.add(box(0.48, 0.02, 0.32, solid(0xf1ead6, 0.9), cx + 0.5, b.h + 0.145, cz))
  const pena = cyl(0.006, 0.010, 0.26, solid(0xf3efe4, 0.8), 6)
  pena.position.set(cx + 0.78, b.h + 0.22, cz - 0.05)
  pena.rotation.z = 0.5
  g.add(pena)

  // luminaria de mesa com cupula verde
  const lum = new THREE.Group()
  lum.position.set(b.x0 + 0.62, b.h + 0.09, cz)
  lum.add(cyl(0.11, 0.13, 0.035, M.ouroFosco, 14))
  lum.add(cyl(0.018, 0.018, 0.30, M.ouroFosco, 8).translateY(0.18))
  const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.19, 0.14, 16, 1, true), solid(0x1e6b4f, 0.7))
  cup2.position.y = 0.36
  lum.add(cup2)
  const bulbo = sphere(0.06, M.luzQuente, 10)
  bulbo.position.y = 0.32
  bulbo.castShadow = false
  lum.add(bulbo)
  g.add(lum)

  // orquidea num vaso alto
  const vaso = new THREE.Group()
  vaso.position.set(b.x1 - 1.9, b.h + 0.09, cz - 0.1)
  vaso.add(cyl(0.09, 0.07, 0.24, M.marmoreVerde, 12).translateY(0.12))
  for (let i = 0; i < 3; i++) {
    const cau = cyl(0.008, 0.010, 0.42, solid(0x3f6b3c, 0.9), 5)
    cau.position.set((i - 1) * 0.045, 0.44, 0)
    cau.rotation.z = (i - 1) * 0.22
    vaso.add(cau)
    for (let k = 0; k < 3; k++) {
      const fl = sphere(0.038, solid(k % 2 ? 0xf3e2ef : 0xe9c9de, 0.85), 8)
      fl.position.set((i - 1) * 0.10, 0.52 + k * 0.09, 0.01)
      fl.scale.set(1, 0.7, 0.6)
      vaso.add(fl)
    }
  }
  g.add(vaso)

  // placa de mesa: RECEPCAO
  const plq = painel(0.6, 0.13, textPlaneMat('RECEPCAO', {
    w: 512, h: 110, color: '#f6e5b0', font: 'bold 76px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.45)', emissiveIntensity: 0.15,
  }), cx - 1.5, b.h + 0.20, b.z0 - 0.04, 0)
  g.add(plq)
  g.add(box(0.66, 0.05, 0.12, M.ouroFosco, cx - 1.5, b.h + 0.12, b.z0 - 0.02))

  // --- parede de tras: marmore verde, escaninhos de chave, relogios ---------
  const pz = IN.z1 - 0.06
  g.add(box(b.x1 - b.x0 + 1.0, 3.6, 0.10, M.marmoreVerde, cx, 1.8, pz))
  g.add(box(b.x1 - b.x0 + 1.1, 0.10, 0.18, M.ouroFosco, cx, 3.64, pz - 0.02))

  // Escaninhos: 1 fundo + montantes + prateleiras (grade 8 x 3). A grade desceu
  // pra 1.34..2.22 pra caber a fileira de relogios (2.42..2.82) e as letras
  // douradas (2.99..3.61) sem que uma coisa nasca em cima da outra — foi assim
  // que o mostrador do relogio do meio saiu por cima do "DO" do letreiro.
  const ex0 = cx - 2.3, ex1 = cx + 2.3, ey0 = 1.34, ey1 = 2.22
  g.add(box(ex1 - ex0, ey1 - ey0, 0.06, M.madeira, cx, (ey0 + ey1) / 2, pz - 0.09))
  for (let i = 0; i <= 8; i++) {
    g.add(box(0.035, ey1 - ey0, 0.20, M.madeira, ex0 + ((ex1 - ex0) / 8) * i, (ey0 + ey1) / 2, pz - 0.16))
  }
  for (let k = 0; k <= 3; k++) {
    g.add(box(ex1 - ex0, 0.030, 0.20, M.madeira, cx, ey0 + ((ey1 - ey0) / 3) * k, pz - 0.16))
  }
  // Chaves penduradas em alguns escaninhos. O Z E DENTRO DO NICHO, entre o
  // fundo (-35.48) e a boca (-35.62): com pz - 0.075 elas nasciam ATRAS do
  // painel de fundo e a parede inteira ficava com escaninhos vazios.
  for (let i = 0; i < 8; i++) {
    for (let k = 0; k < 3; k++) {
      if ((i * 3 + k) % 3 === 1) continue
      const kx = ex0 + ((ex1 - ex0) / 8) * (i + 0.5)
      const ky = ey0 + ((ey1 - ey0) / 3) * (k + 0.35)
      const ch = box(0.020, 0.10, 0.012, M.ouro, kx, ky, pz - 0.17)
      ch.castShadow = false
      g.add(ch)
      const bor = box(0.045, 0.045, 0.010, M.veludo, kx, ky - 0.075, pz - 0.17)
      bor.castShadow = false
      g.add(bor)
    }
  }

  // --- tres relogios de parede, um por fuso ---------------------------------
  // Eles sao PARADOS, cada um numa hora diferente, e as duas coisas andam
  // juntas. makeWallClock() vem com userData.update que le new Date() todo
  // quadro — o que tambem impede o forno de fundir a peca: tres relogios ligados
  // custavam 57 draw calls, quase um quarto do predio inteiro, pra uma fileira
  // de mostradores de 20 cm vista so de dentro do balcao.
  //
  // Mas apagar o update sozinho deixaria os tres marcando a MESMA hora, e ai o
  // "PARAISO / LISBOA / TOQUIO" vira piada sem graca. Entao antes de congelar,
  // os ponteiros vao na mao pra HORA[i]: os pivos sao os unicos Group filhos do
  // relogio (ponteiro de hora, de minuto e de segundo, nessa ordem, ver
  // props.makeWallClock), e a rotacao e a mesma conta que o update faz.
  const CID = ['PARAISO', 'LISBOA', 'TOQUIO']
  const HORA = [[10, 12], [14, 12], [22, 12]]   // [h, min] de cada fuso
  for (let i = 0; i < 3; i++) {
    const x = cx - 1.9 + i * 1.9
    let rl = null
    if (typeof Props.makeWallClock === 'function') {
      try { rl = Props.makeWallClock() } catch (err) { void err; rl = null }
    }
    if (rl) {
      const pivos = rl.children.filter((c) => c.isGroup)
      if (pivos.length >= 2) {
        const [h, mi] = HORA[i]
        pivos[0].rotation.z = -(((h % 12) + mi / 60) / 12) * Math.PI * 2
        pivos[1].rotation.z = -(mi / 60) * Math.PI * 2
        if (pivos[2]) pivos[2].rotation.z = -(i * 17 / 60) * Math.PI * 2
      }
      rl.userData.update = null
      // 2.62 e o unico lugar que sobra: os escaninhos vao ate 2.22 e a faixa do
      // nome da casa comeca em 2.99. Com o relogio em 3.02 (raio 0.20) o disco
      // dele nascia POR CIMA das letras douradas.
      rl.position.set(x, 2.62, pz - 0.06)
      rl.rotation.y = Math.PI
      sombras(rl)
      g.add(rl)
    }
    const et = painel(0.5, 0.13, textPlaneMat(CID[i], {
      w: 384, h: 100, color: '#f0e3bc', font: 'bold 62px "Trebuchet MS", sans-serif',
      stroke: 'rgba(0,0,0,0.4)', emissiveIntensity: 0.12,
    }), x, 2.30, pz - 0.07, Math.PI)
    g.add(et)
  }

  // nome da casa em letra dourada, no alto da parede
  const nome = painel(5.4, 0.62, textPlaneMat('HOTEL PARAISO', {
    w: 1024, h: 130, color: '#ffe6ab', font: 'bold 82px "Trebuchet MS", sans-serif',
    glow: '#c99a3a', emissiveIntensity: 0.85,
  }), cx, 3.30, pz - 0.07, Math.PI)
  g.add(nome)

  // carrinho de bagagem encostado na ponta do balcao
  const car = new THREE.Group()
  car.position.set(b.x1 + 1.0, 0, b.z0 - 0.55)
  car.rotation.y = 0.5
  car.add(box(1.05, 0.07, 0.62, M.madeira, 0, 0.24, 0))
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pe = cyl(0.030, 0.030, 0.24, M.ouroFosco, 8)
    pe.position.set(sx * 0.46, 0.12, sz * 0.24)
    car.add(pe)
    const rd = cyl(0.055, 0.055, 0.035, M.grafite, 10)
    rd.rotation.z = Math.PI / 2
    rd.position.set(sx * 0.46, 0.055, sz * 0.24)
    car.add(rd)
    const col = cyl(0.026, 0.026, 1.3, M.ouro, 8)
    col.position.set(sx * 0.46, 0.92, sz * 0.24)
    car.add(col)
  }
  for (const sz of [-1, 1]) {
    car.add(box(1.0, 0.03, 0.03, M.ouro, 0, 1.55, sz * 0.24))
  }
  for (const sx of [-1, 1]) {
    car.add(box(0.03, 0.03, 0.52, M.ouro, sx * 0.46, 1.55, 0))
  }
  // duas malas em cima
  car.add(roundedBox(0.52, 0.34, 0.30, 0.05, solid(0x5b3320, 0.7)).translateY(0.45).translateZ(-0.06))
  car.add(roundedBox(0.42, 0.26, 0.26, 0.04, solid(0x2f4a63, 0.7)).translateY(0.75).translateZ(-0.02))
  sombras(car)
  g.add(car)
  colliders.push({
    minX: b.x1 + 0.4, maxX: b.x1 + 1.6, minZ: b.z0 - 1.0, maxZ: b.z0 - 0.1, tag: 'hotel-carrinho',
  })
}

/** Uma poltrona de saguao. Nasce olhando pro +Z (contrato dos assentos). */
function poltrona(corpo, tom) {
  const g = new THREE.Group()
  const W = 0.86, D = 0.82, ASSENTO = 0.44

  // pes de latao
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pe = cyl(0.022, 0.032, 0.16, M.ouroFosco, 8)
    pe.position.set(sx * (W / 2 - 0.10), 0.08, sz * (D / 2 - 0.10))
    g.add(pe)
  }
  // caixa do assento
  g.add(box(W, 0.22, D, corpo, 0, 0.27, 0))
  const alm = roundedBox(W - 0.10, 0.16, D - 0.12, 0.05, tom)
  alm.position.set(0, ASSENTO - 0.06, 0.02)
  g.add(alm)
  // encosto inclinado, com capitone (tres botoes)
  const enc = box(W, 0.62, 0.16, corpo, 0, 0.74, -D / 2 + 0.08)
  enc.rotation.x = -0.10
  g.add(enc)
  const encAlm = roundedBox(W - 0.14, 0.54, 0.12, 0.05, tom)
  encAlm.position.set(0, 0.74, -D / 2 + 0.19)
  encAlm.rotation.x = -0.10
  g.add(encAlm)
  for (let i = 0; i < 3; i++) {
    const bt = sphere(0.022, M.ouroFosco, 8)
    bt.position.set((i - 1) * 0.22, 0.78, -D / 2 + 0.25)
    bt.castShadow = false
    g.add(bt)
  }
  // bracos rolicos
  for (const s of [-1, 1]) {
    const br = cyl(0.10, 0.10, D - 0.12, corpo, 12)
    br.rotation.x = Math.PI / 2
    br.position.set(s * (W / 2 - 0.05), 0.60, 0.02)
    g.add(br)
    g.add(box(0.14, 0.30, D - 0.12, corpo, s * (W / 2 - 0.05), 0.42, 0.02))
  }
  // friso de latao na base
  g.add(box(W + 0.03, 0.035, D + 0.03, M.ouroFosco, 0, 0.165, 0))

  // CONTRATO dos assentos: y = topo da almofada, ry = pra onde a pessoa olha
  g.userData.seats = [{ x: 0, y: ASSENTO + 0.02, z: 0.02, ry: 0 }]
  return g
}

/** Mesinha de vidro. redonda=true faz a de centro; false, a lateral. */
function mesaDeVidro(redonda) {
  const g = new THREE.Group()
  const R = redonda ? 0.46 : 0.30
  const HT = redonda ? 0.44 : 0.54

  if (redonda) {
    // base de latao em X com anel embaixo
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const p = box(0.045, HT - 0.06, 0.045, M.ouro, Math.cos(a) * 0.16, (HT - 0.06) / 2, Math.sin(a) * 0.16)
      p.rotation.set(Math.sin(a) * 0.16, 0, -Math.cos(a) * 0.16)
      g.add(p)
    }
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.018, 6, 20), M.ouro)
    aro.rotation.x = Math.PI / 2
    aro.position.y = 0.14
    g.add(aro)
    // prateleira de vidro fume embaixo
    const bx = cyl(R - 0.12, R - 0.12, 0.02, M.vidroMesa, 26)
    bx.position.y = 0.16
    bx.castShadow = false
    g.add(bx)
  } else {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.add(box(0.030, HT - 0.03, 0.030, M.ouro, sx * (R - 0.05), (HT - 0.03) / 2, sz * (R - 0.05)))
    }
    for (const sz of [-1, 1]) {
      g.add(box(R * 2 - 0.10, 0.022, 0.022, M.ouro, 0, 0.16, sz * (R - 0.05)))
    }
  }

  // tampo de vidro + aro dourado
  const tampo = redonda
    ? cyl(R, R, 0.026, M.vidroMesa, 30)
    : box(R * 2, 0.026, R * 2, M.vidroMesa, 0, 0, 0)
  tampo.position.y = HT
  tampo.castShadow = false
  g.add(tampo)
  if (redonda) {
    const aro2 = new THREE.Mesh(new THREE.TorusGeometry(R, 0.020, 6, 30), M.ouro)
    aro2.rotation.x = Math.PI / 2
    aro2.position.y = HT
    g.add(aro2)
  } else {
    for (const sz of [-1, 1]) g.add(box(R * 2 + 0.03, 0.030, 0.030, M.ouro, 0, HT, sz * R))
    for (const sx of [-1, 1]) g.add(box(0.030, 0.030, R * 2 + 0.03, M.ouro, sx * R, HT, 0))
  }
  g.userData.topo = HT
  return g
}

/**
 * A SALA DE ESPERA: dois grupos de poltrona sobre tapete, um de cada lado do
 * corredor que liga a porta ao balcao. Devolve a lista de assentos ja no MUNDO
 * pra virar ponto de "Sentar" la em cima.
 */
function salaDeEspera(g, colliders) {
  const assentos = []

  /** Poe uma poltrona no mundo e registra colisor + assento. */
  const por = (x, z, ry, corpo, tom) => {
    const p = poltrona(corpo, tom)
    p.position.set(x, 0, z)
    p.rotation.y = ry
    sombras(p)
    g.add(p)
    // colisor um pouco menor que a poltrona: o jogador precisa encostar pra
    // chegar no raio do "Sentar" (mesma folga que city.js da nos bancos)
    const ca = Math.abs(Math.cos(ry)), sa = Math.abs(Math.sin(ry))
    const ex = (0.86 * ca + 0.82 * sa) - 0.30
    const ez = (0.86 * sa + 0.82 * ca) - 0.30
    colliders.push({
      minX: x - ex / 2, maxX: x + ex / 2,
      minZ: z - ez / 2, maxZ: z + ez / 2, tag: 'hotel-poltrona',
    })
    const s = p.userData.seats[0]
    const sx = x + Math.sin(ry) * s.z
    const sz = z + Math.cos(ry) * s.z
    assentos.push({ x: sx, y: s.y, z: sz, ry })
    return p
  }

  const por2 = (x, z, redonda) => {
    const m = mesaDeVidro(redonda)
    m.position.set(x, 0, z)
    sombras(m)
    g.add(m)
    const r = redonda ? 0.5 : 0.34
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, tag: 'hotel-mesa' })
    return m
  }

  // --- tapete e grupo OESTE (3 poltronas em U) ------------------------------
  const tO = box(5.6, 0.02, 5.0, stdMat('hotel-tapete-o', {
    map: tapeteTex('oeste', '#7a2436', '#d9b869', '#e6d7a8'), roughness: 0.95,
  }), GRUPO_O.x, 0.012, GRUPO_O.z)
  tO.castShadow = false
  g.add(tO)

  por(GRUPO_O.x, GRUPO_O.z - 1.55, 0, M.estofado, M.estofadoClaro)
  por(GRUPO_O.x, GRUPO_O.z + 1.55, Math.PI, M.estofado, M.estofadoClaro)
  por(GRUPO_O.x - 1.85, GRUPO_O.z, Math.PI / 2, M.estofado, M.estofadoClaro)
  por2(GRUPO_O.x + 0.15, GRUPO_O.z, true)
  // mesinha lateral quadrada, entre as duas poltronas da ponta
  por2(GRUPO_O.x - 1.85, GRUPO_O.z - 1.35, false)

  // --- tapete e grupo LESTE (2 poltronas frente a frente) -------------------
  // 4.0 e nao 4.4: com 4.4 a borda oeste do tapete chegava em x -37.4 e
  // encostava na rosa dos ventos do chao (que vai ate -37.29).
  const tL = box(4.0, 0.02, 4.0, stdMat('hotel-tapete-l', {
    map: tapeteTex('leste', '#264a48', '#d9b869', '#a8e0d6'), roughness: 0.95,
  }), GRUPO_L.x, 0.012, GRUPO_L.z)
  tL.castShadow = false
  g.add(tL)

  por(GRUPO_L.x, GRUPO_L.z - 1.35, 0, M.veludo, solid(0x8f2a42, 0.95))
  por(GRUPO_L.x, GRUPO_L.z + 1.35, Math.PI, M.veludo, solid(0x8f2a42, 0.95))
  por2(GRUPO_L.x, GRUPO_L.z, true)
  por2(GRUPO_L.x + 1.5, GRUPO_L.z - 1.20, false)

  // revistas e um par de xicaras sobre as mesas de centro
  for (const [mx, mz] of [[GRUPO_O.x + 0.15, GRUPO_O.z], [GRUPO_L.x, GRUPO_L.z]]) {
    for (let i = 0; i < 3; i++) {
      const rv = box(0.24, 0.012, 0.32, solid([0xd8d2c2, 0x2f6f8f, 0xb8452f][i], 0.8),
        mx - 0.14 + i * 0.03, 0.455 + i * 0.014, mz + 0.10 + i * 0.02)
      rv.rotation.y = 0.15 * i
      rv.castShadow = false
      g.add(rv)
    }
    const xic = cyl(0.045, 0.037, 0.06, solid(0xf4efe3, 0.5), 12)
    xic.position.set(mx + 0.20, 0.475, mz - 0.14)
    g.add(xic)
    const pir = cyl(0.075, 0.075, 0.010, solid(0xf4efe3, 0.5), 14)
    pir.position.set(mx + 0.20, 0.448, mz - 0.14)
    pir.castShadow = false
    g.add(pir)
  }

  // duas palmeiras em vaso, ladeando a entrada por dentro
  if (typeof Props.makePotPlant === 'function') {
    for (const [px, pz, sd] of [[-44.6, -46.6, 3], [-31.4, -46.6, 9]]) {
      let pt = null
      try { pt = Props.makePotPlant(sd) } catch (err) { void err; pt = null }
      if (!pt) break
      pt.position.set(px, 0, pz)
      pt.scale.setScalar(1.45)
      sombras(pt)
      g.add(pt)
      colliders.push({ minX: px - 0.42, maxX: px + 0.42, minZ: pz - 0.42, maxZ: pz + 0.42, tag: 'hotel-planta' })
    }
  }

  // aparador com arranjo de flores no eixo da porta, encostado no vidro
  const ap = new THREE.Group()
  ap.position.set(B.door.center + 3.6, 0, -46.9)
  ap.add(box(1.5, 0.06, 0.42, M.madeira, 0, 0.86, 0))
  ap.add(box(1.56, 0.05, 0.48, M.marmoreVerde, 0, 0.92, 0))
  for (const s of [-1, 1]) {
    ap.add(cyl(0.035, 0.05, 0.86, M.ouroFosco, 8).translateX(s * 0.62).translateY(0.43))
  }
  ap.add(box(1.2, 0.04, 0.3, M.madeira, 0, 0.28, 0))
  const jarro = cyl(0.14, 0.10, 0.30, M.marmoreVerde, 14)
  jarro.position.y = 1.10
  ap.add(jarro)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const fl = sphere(0.075, solid([0xe8d9a8, 0xd97f9a, 0xf0e6d0][i % 3], 0.9), 8)
    fl.position.set(Math.cos(a) * 0.17, 1.34 + Math.sin(i * 2.1) * 0.06, Math.sin(a) * 0.17)
    ap.add(fl)
  }
  sombras(ap)
  g.add(ap)
  colliders.push({ minX: ap.position.x - 0.85, maxX: ap.position.x + 0.85, minZ: -47.2, maxZ: -46.6, tag: 'hotel-aparador' })

  return assentos
}

/**
 * A ESCADA SIMBOLICA.
 *
 * Sobe 2,1 m em 12 degraus encostada na parede leste e morre num patamar com
 * uma porta fechada e uma placa. Ela e um BLOCO MACICO pro colisor: nao sobe de
 * verdade, e nao deve mesmo — o pedido foi "apenas simbolica". Como o colisor e
 * cheio do chao ao topo, ninguem sobe e ninguem entra por baixo.
 */
function escada(g, colliders) {
  const w = ESC.x1 - ESC.x0
  const cx = (ESC.x0 + ESC.x1) / 2
  const run = (ESC.zTopo - ESC.zBase) / ESC.n     // 0.4333 de piso
  const rise = ESC.alt / ESC.n                    // 0.175 de espelho

  const pedra = M.degrau
  for (let i = 0; i < ESC.n; i++) {
    const z0 = ESC.zBase + run * i
    const y = rise * (i + 1)
    // espelho + piso do degrau (o piso avanca 3 cm de bico)
    g.add(box(w, rise, run, pedra, cx, y - rise / 2, z0 + run / 2))
    const bico = box(w, 0.035, run + 0.03, M.marmoreVerde, cx, y - 0.017, z0 + run / 2 - 0.015)
    bico.castShadow = false
    g.add(bico)
    // filete de latao antiderrapante
    const fil = box(w - 0.2, 0.012, 0.04, M.ouroFosco, cx, y + 0.002, z0 + 0.06)
    fil.castShadow = false
    g.add(fil)
  }

  // --- patamar ate a parede do fundo ---------------------------------------
  // A MASSA DO PATAMAR PRECISA DE RECORTE. Ela e a maior peca cega do saguao
  // (2,6 x 3,1 x 2,1 m) e, chapada, le como um pedregulho no canto da sala. O
  // que a transforma em base de escada e o que qualquer base de escada tem:
  // plinto embaixo, friso no meio e coroamento no topo.
  const pzc = (ESC.zTopo + ESC.zPatamar) / 2
  const pd = ESC.zPatamar - ESC.zTopo
  g.add(box(w, ESC.alt, pd, pedra, cx, ESC.alt / 2, pzc))
  g.add(box(w + 0.06, 0.26, pd, M.pisoEscuro, cx, 0.13, pzc))          // plinto
  g.add(box(w + 0.05, 0.06, pd, M.ouroFosco, cx, 1.12, pzc))           // friso
  const pt = box(w + 0.05, 0.05, pd + 0.02, M.marmoreVerde, cx, ESC.alt + 0.02, pzc)
  pt.castShadow = false
  g.add(pt)
  // o mesmo plinto acompanhando o lance, pra costurar patamar e degraus
  for (let i = 0; i < ESC.n; i++) {
    const z0 = ESC.zBase + run * i
    const pl2 = box(w + 0.06, 0.26, run, M.pisoEscuro, cx, 0.13, z0 + run / 2)
    pl2.castShadow = false
    if (rise * (i + 1) > 0.26) g.add(pl2)
  }

  // guarda-corpo no lado do saguao: pilarete, balaustres e corrimao inclinado
  const bx = ESC.x0 - 0.02
  for (let i = 0; i <= ESC.n; i += 1) {
    const z = ESC.zBase + run * i
    const y = rise * i
    const bal = cyl(0.030, 0.042, 0.86, M.ouroFosco, 8)
    bal.position.set(bx, y + 0.43, z)
    g.add(bal)
  }
  // corrimao: uma barra inclinada acompanhando o lance
  const comp = Math.hypot(ESC.zTopo - ESC.zBase, ESC.alt)
  const cor = box(0.09, 0.09, comp, M.madeira, bx, (ESC.alt) / 2 + 0.90, (ESC.zBase + ESC.zTopo) / 2)
  cor.rotation.x = -Math.atan2(ESC.alt, ESC.zTopo - ESC.zBase)
  g.add(cor)
  // trecho reto do corrimao sobre o patamar
  g.add(box(0.09, 0.09, ESC.zPatamar - ESC.zTopo, M.madeira, bx, ESC.alt + 0.90, (ESC.zTopo + ESC.zPatamar) / 2))
  for (let i = 0; i < 4; i++) {
    const z = ESC.zTopo + ((ESC.zPatamar - ESC.zTopo) / 3) * i
    g.add(cyl(0.030, 0.042, 0.86, M.ouroFosco, 8).translateX(bx).translateY(ESC.alt + 0.43).translateZ(z))
  }
  // pilarete de arranque com bola de latao
  const arr = box(0.16, 1.05, 0.16, M.madeira, bx, 0.52, ESC.zBase - 0.12)
  g.add(arr)
  const bola = sphere(0.10, M.ouro, 12)
  bola.position.set(bx, 1.10, ESC.zBase - 0.12)
  g.add(bola)

  // porta fechada no topo + placa: e ela que diz que a escada e cenario
  const pz = IN.z1 - 0.06
  g.add(box(2.0, 2.35, 0.10, M.madeira, cx, ESC.alt + 1.20, pz - 0.02))
  for (const s of [-1, 1]) {
    g.add(box(0.10, 2.45, 0.14, M.ouroFosco, cx + s * 1.02, ESC.alt + 1.24, pz - 0.04))
  }
  g.add(box(2.24, 0.12, 0.16, M.ouroFosco, cx, ESC.alt + 2.44, pz - 0.04))
  for (const s of [-1, 1]) {
    const mac = sphere(0.055, M.ouro, 10)
    mac.position.set(cx + s * 0.16, ESC.alt + 1.05, pz - 0.09)
    g.add(mac)
  }
  const plc = painel(1.5, 0.30, textPlaneMat('SUITES  1 - 24', {
    w: 640, h: 128, color: '#ffe6ab', font: 'bold 78px "Trebuchet MS", sans-serif',
    glow: '#c99a3a', emissiveIntensity: 0.7,
  }), cx, ESC.alt + 2.66, pz - 0.05, Math.PI)
  g.add(plc)

  // cordao de veludo barrando o primeiro degrau
  for (const s of [-1, 1]) {
    const x = cx + s * (w / 2 - 0.25)
    const z = ESC.zBase - 0.42
    g.add(cyl(0.16, 0.18, 0.05, M.ouroFosco, 14).translateX(x).translateY(0.025).translateZ(z))
    g.add(cyl(0.030, 0.030, 0.94, M.ouro, 8).translateX(x).translateY(0.50).translateZ(z))
    const top = sphere(0.055, M.ouro, 10)
    top.position.set(x, 1.00, z)
    g.add(top)
  }
  const cordao = cyl(0.028, 0.028, w - 0.5, M.veludo, 8)
  cordao.rotation.z = Math.PI / 2
  cordao.position.set(cx, 0.86, ESC.zBase - 0.42)
  g.add(cordao)

  // --- COLISOR: um bloco cheio. A escada e cenario, ninguem sobe -----------
  colliders.push({
    minX: ESC.x0 - 0.16, maxX: ESC.x1,
    minZ: ESC.zBase - 0.55, maxZ: ESC.zPatamar, tag: 'hotel-escada',
  })
}

/** O elevador: portal de bronze na parede do fundo, entre o balcao e a escada. */
function elevador(g, colliders) {
  const pz = IN.z1 - 0.04
  const cx = ELEV.cx, vao = ELEV.vao, alt = ELEV.alt

  // portal de marmore verde com pilastras e verga dourada
  g.add(box(vao + 1.1, alt + 0.75, 0.12, M.marmoreVerde, cx, (alt + 0.75) / 2, pz - 0.01))
  for (const s of [-1, 1]) {
    g.add(box(0.22, alt + 0.55, 0.20, M.ouroFosco, cx + s * (vao / 2 + 0.14), (alt + 0.55) / 2, pz - 0.10))
  }
  g.add(box(vao + 0.6, 0.20, 0.22, M.ouroFosco, cx, alt + 0.20, pz - 0.10))
  g.add(box(vao + 0.8, 0.10, 0.26, M.ouro, cx, alt + 0.40, pz - 0.12))

  // duas folhas de bronze escovado, com friso vertical no encontro
  for (const s of [-1, 1]) {
    const fx = cx + s * vao / 4
    g.add(box(vao / 2 - 0.01, alt, 0.06, M.bronze, fx, alt / 2, pz - 0.13))
    g.add(box(vao / 2 - 0.22, alt - 0.24, 0.02, M.ouroFosco, fx, alt / 2, pz - 0.17))
    g.add(box(0.05, alt, 0.08, M.ouro, cx + s * 0.02, alt / 2, pz - 0.17))
  }
  // soleira de latao no chao
  const sol = box(vao + 0.1, 0.02, 0.16, M.ouroFosco, cx, 0.012, pz - 0.14)
  sol.castShadow = false
  g.add(sol)

  // indicador de andar: arco de cinco numeros, com o 3 aceso
  const ind = new THREE.Group()
  ind.position.set(cx, alt + 0.62, pz - 0.16)
  ind.add(box(1.5, 0.42, 0.08, M.grafite, 0, 0, 0))
  ind.add(box(1.6, 0.06, 0.12, M.ouro, 0, 0.22, 0))
  for (let i = 0; i < 5; i++) {
    const aceso = i === 2
    const n = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), textPlaneMat(String(i + 1), {
      w: 128, h: 160, color: aceso ? '#ffe08a' : '#4a4f55',
      font: 'bold 120px "Trebuchet MS", sans-serif',
      glow: aceso ? '#ffb63c' : null, emissiveIntensity: aceso ? 1.8 : 0.05,
    }))
    n.position.set(-0.52 + i * 0.26, 0, -0.05)
    n.rotation.y = Math.PI
    n.castShadow = false
    ind.add(n)
  }
  g.add(ind)

  // botoeira de chamada, com a seta de subir acesa
  const bt = new THREE.Group()
  bt.position.set(cx + vao / 2 + 0.48, 1.15, pz - 0.13)
  bt.add(box(0.20, 0.40, 0.05, M.ouroFosco, 0, 0, 0))
  for (let i = 0; i < 2; i++) {
    const acesa = i === 0
    const b2 = cyl(0.045, 0.045, 0.03, acesa ? M.turquesa : M.grafite, 12)
    b2.rotation.x = Math.PI / 2
    b2.position.set(0, 0.09 - i * 0.18, -0.03)
    b2.castShadow = false
    bt.add(b2)
  }
  g.add(bt)

  // duas arandelas altas ladeando o portal
  for (const s of [-1, 1]) {
    const x = cx + s * (vao / 2 + 0.62)
    g.add(box(0.12, 0.9, 0.10, M.ouroFosco, x, 2.05, pz - 0.09))
    const tubo = box(0.07, 0.78, 0.07, M.luzQuente, x, 2.05, pz - 0.15)
    tubo.castShadow = false
    g.add(tubo)
  }

  // tapete de marmore escuro na frente do portal
  const tp = box(vao + 1.2, 0.012, 1.5, M.pisoEscuro, cx, 0.013, pz - 0.9)
  tp.castShadow = false
  g.add(tp)

  colliders.push({
    minX: cx - (vao + 1.1) / 2, maxX: cx + (vao + 1.1) / 2,
    minZ: pz - 0.24, maxZ: IN.z1, tag: 'hotel-elevador',
  })
}

/** Placa de orientacao e cinzeiro/lixeira: o que sobra pra dar vida. */
function detalhes(g, colliders) {
  // Totem de orientacao ao lado da porta, por dentro. GIRADO PI: quem entra vem
  // do -Z e anda pro +Z, entao a face que ele encara e a -Z. Sem o giro, o
  // hospede que chega ve o verso preto da placa e o texto so aparece pra quem
  // esta saindo — que e justamente quem nao precisa dele.
  const tt = new THREE.Group()
  tt.position.set(B.door.center - 3.6, 0, -46.9)
  tt.rotation.y = Math.PI
  tt.add(box(0.44, 0.10, 0.30, M.pisoEscuro, 0, 0.05, 0))
  tt.add(box(0.08, 1.70, 0.08, M.ouroFosco, 0, 0.86, 0))
  tt.add(box(0.86, 0.58, 0.05, M.grafite, 0, 1.56, 0))
  tt.add(box(0.90, 0.05, 0.07, M.ouroFosco, 0, 1.87, 0))
  const tx = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.50), textPlaneMat('RECEPCAO  >', {
    w: 512, h: 320, color: '#e8fbf7', font: 'bold 62px "Trebuchet MS", sans-serif',
    glow: '#2fc4bb', emissiveIntensity: 0.9,
  }))
  tx.position.set(0, 1.56, 0.031)
  tx.castShadow = false
  tt.add(tx)
  sombras(tt)
  g.add(tt)
  colliders.push({
    minX: tt.position.x - 0.3, maxX: tt.position.x + 0.3,
    minZ: -47.1, maxZ: -46.7, tag: 'hotel-totem',
  })

  // Capacho de latao logo depois da porta. Vai de -47.6 a -46.3, ou seja,
  // acaba 25 cm antes da rosa dos ventos (que comeca em -46.05): dois
  // decalques de chao encavalados brigam por pixel.
  const cap = box(3.4, 0.014, 1.3, M.pisoEscuro, B.door.center, 0.013, -46.95)
  cap.castShadow = false
  g.add(cap)
  for (let i = 0; i < 11; i++) {
    const b2 = box(0.05, 0.016, 1.2, M.ouroFosco, B.door.center - 1.5 + i * 0.3, 0.017, -46.95)
    b2.castShadow = false
    g.add(b2)
  }
}

/**
 * IRIS, a recepcao.
 *
 * Aparencia ENXUTA (sem chapeu, colar, anel, relogio nem jaqueta): esses
 * acessorios sao a diferenca entre 15 e 65 meshes por NPC, e o saguao ja carrega
 * lustre, escada e cinco poltronas. Por cima da roupa vai um colete de hotel,
 * que e pano so.
 *
 * FALA UMA COISA SO, e e de proposito: o dono do projeto pediu um atendente
 * "que ainda nao fala nada a nao ser bem vindo". Quando ele tiver o que dizer,
 * o lugar de por e o onInteract do ponto 'hotel-recepcao'.
 */
function criarIris(g, colliders) {
  let npc = null
  try {
    npc = createNPC({
      name: 'Iris',
      pose: 'work',
      x: IRIS.x, y: 0, z: IRIS.z,
      // PI e nao 0: a fachada deste predio e a z0, entao quem entra vem do -Z.
      // Com rotY 0 a recepcao ficaria de costas pra porta.
      rotY: Math.PI,
      shirt: 0xf0ece1,
      pants: 0x1f2933,
      shoes: 0x15191f,
      appearance: {
        cabeca: 3, olhos: 2, nariz: 0, boca: 4, barba: 0,
        cabelo: 3, pele: 4, corCabelo: 6, corBarba: 0, sobrancelha: 1,
        chapeu: 0, calcado: 1, blusa: 1, calca: 1,
      },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

  // colete de hotel: verde-escuro com vivo dourado e um cracha
  const colete = new THREE.Group()
  colete.add(box(0.41, 0.46, 0.27, solid(0x1c4a44, 0.95), 0, 1.15, 0.005))
  colete.add(box(0.43, 0.035, 0.28, M.ouroFosco, 0, 0.93, 0.005))
  colete.add(box(0.055, 0.46, 0.28, M.ouroFosco, 0.13, 1.15, 0.006))
  // lenco no pescoco
  colete.add(box(0.30, 0.09, 0.24, solid(0x9c2c46, 0.9), 0, 1.42, 0.01))
  const cracha = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.048), textPlaneMat('IRIS', {
    w: 128, h: 52, color: '#f6e6bc', font: 'bold 30px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.12,
  }))
  cracha.position.set(-0.10, 1.24, 0.140)
  cracha.castShadow = false
  colete.add(cracha)
  root.add(colete)

  g.add(root)

  // O forno vem DEPOIS do colete, senao ele fica de fora da fusao. Preserva as
  // juntas, que e onde npc.js escreve a respiracao, o balanco e a piscada.
  if (npc.character && npc.character.parts) {
    congelarPersonagem(root, { juntas: npc.character.parts })
  }
  colliders.push({
    minX: IRIS.x - 0.3, maxX: IRIS.x + 0.3,
    minZ: IRIS.z - 0.3, maxZ: IRIS.z + 0.3, tag: 'hotel-recepcao',
  })
  return npc
}

// ===========================================================================
// MONTAGEM
// ===========================================================================
export function buildHotel(game) {
  void game
  const group = new THREE.Group()
  group.name = 'hotel'
  const colliders = []
  const occluders = []
  const interactables = []

  // --- casca (coordenadas de MUNDO, chao em y = 0) ------------------------
  // Dividida em dois grupos POR CAUSA DA SOMBRA, nao por organizacao: o que
  // esta em `casca` projeta no mapa do sol, o que esta em `enfeite` nao. Ver
  // semSombra() la em cima pra conta.
  const casca = new THREE.Group()
  casca.name = 'hotel-casca'
  moldura(casca)
  paredes(casca, colliders, occluders)
  marquise(casca, colliders)
  calcada(casca, colliders)

  const enfeite = new THREE.Group()
  enfeite.name = 'hotel-enfeite'
  vitrines(enfeite)
  letreiro(enfeite)
  andares(enfeite)
  telhado(enfeite)
  semSombra(enfeite)
  casca.add(enfeite)

  const folhas = portaAutomatica(casca)
  group.add(casca)

  // AQUI HAVIA UMA POINTLIGHT SOB A MARQUISE, e ela saiu.
  //
  // Era ela a "entrada muito forte": 26 de intensidade a 3,7 m do chao, com
  // decaimento quadratico, dava mais que 1.0 de irradiancia na calcada — ou
  // seja, branco estourado num circulo de 4 m bem na porta, de dia inclusive,
  // quando o sol ja resolve tudo sozinho.
  //
  // O que sobrou no lugar dela: o forro emissivo da marquise e os dois globos
  // dos postes. Emissivo NAO ilumina o chao (isso esta escrito em tres arquivos
  // deste projeto e continua verdade), mas aqui isso deixou de ser problema —
  // o que a marquise precisa dizer a noite e "esta aceso", e uma superficie
  // acesa diz exatamente isso. O chao da calcada em frente ao hotel fica no
  // escuro como o resto da calcada interna do anel, que e o que ele sempre foi.

  // --- miolo (piso local em y = 0; o grupo sobe pra LEVELS.SHOP_FLOOR) -----
  const dentro = new THREE.Group()
  dentro.name = 'hotel-saguao'
  dentro.position.y = BASE
  piso(dentro)
  revestimento(dentro)
  forroELuz(dentro, group)
  balcao(dentro, colliders)
  const assentos = salaDeEspera(dentro, colliders)
  escada(dentro, colliders)
  elevador(dentro, colliders)
  detalhes(dentro, colliders)
  const npc = criarIris(dentro, colliders)
  // O MIOLO INTEIRO SAI DO MAPA DE SOMBRA. Quem acende este salao sao duas
  // PointLight que nao projetam sombra (nenhuma luz de interior deste jogo
  // projeta: o orcamento de sombra e do sol). Sobra o sol entrando pela vitrine
  // norte em angulo raso, algumas horas por dia — e so por isso 74 mil
  // triangulos, a Iris inclusive, estavam sendo desenhados duas vezes por
  // quadro. So a Iris sao 38 mil deles.
  semSombra(dentro)
  group.add(dentro)

  // --- O FORNO RODA AQUI, E NAO NO main.js -------------------------------
  //
  // Todos os outros interiores deixam o main chamar bakeStatic(modulo.group).
  // Este nao pode, e a razao e o LOD do miolo la embaixo: bakeStatic funde os
  // filhos e REPARENTEIA o que sobra na raiz que recebeu, dissolvendo os grupos
  // intermediarios. Chamado no group inteiro, ele apaga `casca` e `dentro` do
  // mapa — e `dentro.visible = false` passa a nao esconder nada, porque `dentro`
  // ficou um grupo vazio com o saguao todo pendurado um nivel acima.
  //
  // Assado em separado, cada grupo sobrevive como grupo e ainda ganha uma
  // segunda coisa de graca: duas bounding spheres menores em vez de uma do
  // tamanho do quarteirao, o que faz o culling por frustum do three finalmente
  // ter o que descartar.
  console.info('hotel casca:', bakeStatic(casca))
  console.info('hotel saguao:', bakeStatic(dentro))

  // --- pontos de interacao -------------------------------------------------
  // Do lado do CLIENTE do balcao e na altura da cintura: a interacao pesa o Y
  // pela metade, entao na cintura o rotulo aparece na hora certa tambem em
  // primeira pessoa.
  interactables.push({
    id: 'hotel-recepcao',
    position: new THREE.Vector3(IRIS.x, BASE + 1.05, BALCAO.z0 - 0.9),
    radius: 2.4,
    label: 'Falar com a recepcao',
    onInteract: (gm) => gm.toast('Iris: Bem-vindo ao Hotel Paraiso.'),
  })

  // Cada poltrona vira um "Sentar", pelo mesmo contrato dos bancos de rua
  // (props.userData.seats -> game.sitPlayer). Os assentos ja voltaram de
  // salaDeEspera em coordenadas de mundo, faltando so somar o piso.
  assentos.forEach((s, i) => {
    interactables.push({
      id: 'hotel-poltrona-' + i,
      position: new THREE.Vector3(s.x, BASE + s.y, s.z),
      radius: 1.7,
      label: 'Sentar',
      onInteract: (gm) => {
        if (gm && typeof gm.sitPlayer === 'function') {
          gm.sitPlayer({
            x: s.x, y: BASE + s.y, z: s.z, rotY: s.ry,
            standX: s.x + Math.sin(s.ry) * 0.95,
            standZ: s.z + Math.cos(s.ry) * 0.95,
          })
        }
      },
    })
  })

  // -------------------------------------------------------------------------
  // ANIMACAO: a porta automatica e o olhar da Iris
  // -------------------------------------------------------------------------
  // A porta abre por PROXIMIDADE, nao por tecla: e o que faz ela parecer
  // automatica em vez de destrancada. A caixa de sensor e generosa em Z (3,4 m
  // pra cada lado do vao) porque o jogador andando corre a 6,2 m/s — com 2 m a
  // folha ainda estaria correndo quando ele chegasse no vao.
  const SENSOR_X = 2.9
  const SENSOR_Z = 3.4
  let abertura = 0        // 0 fechada, 1 aberta
  let alvo = 0

  // --- LOD do miolo ---------------------------------------------------------
  //
  // Alem de 52 m da porta, o saguao inteiro sai da cena (`dentro.visible`).
  //
  // O motivo esta na medicao: parado no cruzamento central, a 70 m daqui, o
  // hotel ainda custava 183 draw calls e 71 mil triangulos. Um predio de 15,5 m
  // na esquina do anel entra no frustum de meia cidade, e o culling do three e
  // por mesh — os meshes fundidos pelo forno tem bounding sphere do predio
  // inteiro, entao nenhum deles e descartado nunca. A Iris sozinha e 54 draw
  // calls e 38 mil triangulos de mobilia que, a 70 m, ocupa uns poucos pixels
  // atras de um vidro.
  //
  // 52 e medido, nao chutado: a calcada do anel em frente vai ate z = -52 (4 m
  // da fachada) e a pista externa do anel acaba em z = -68, a 20 m. Com 52 m de
  // raio o miolo esta ligado em qualquer ponto de onde da pra enxergar dentro
  // dele, inclusive do outro lado da rua do anel, e desligado do cruzamento
  // central pra ca. A troca e binaria de proposito: um fade custaria transparen-
  // cia em 100 materiais pra esconder uma transicao que ninguem chega a ver.
  const LOD2 = 52 * 52
  let mioloLigado = true

  let lookObj = null
  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    const p = gm && gm.player && gm.player.position

    if (p) {
      const dx = Math.abs(p.x - B.door.center)
      const dz = Math.abs(p.z - B.z0)
      alvo = (dx < SENSOR_X && dz < SENSOR_Z) ? 1 : 0
      // LOD: uma subtracao e uma comparacao por quadro
      const ax = p.x - B.door.center, az = p.z - B.z0
      const perto = ax * ax + az * az < LOD2
      if (perto !== mioloLigado) {
        mioloLigado = perto
        dentro.visible = perto
      }
    } else {
      alvo = 0
    }
    if (abertura !== alvo) {
      // 4,2 por segundo: o vao inteiro em ~0,24 s. Mais devagar que isso e o
      // jogador esbarra no vidro que ainda esta abrindo.
      const passo = Math.min(1, d * 4.2)
      abertura += (alvo - abertura) * passo
      if (Math.abs(alvo - abertura) < 0.002) abertura = alvo
      for (const f of folhas) {
        f.position.x = f.userData.baseX + f.userData.dir * FOLHA_CURSO * abertura
      }
    }

    // Miolo apagado: nao ha o que animar. A respiracao e a piscada da Iris nao
    // precisam continuar rodando num grupo que nao esta sendo desenhado.
    if (!npc || !mioloLigado) return
    if (p) {
      const ddx = p.x - IRIS.x, ddz = p.z - IRIS.z
      if (ddx * ddx + ddz * ddz < 64) {
        const a = alvoDoOlhar(gm)
        if (a) npc.lookTarget = a
      } else if (npc.lookTarget) {
        npc.lookTarget = null
      }
    }
    if (typeof npc.update === 'function') npc.update(d)
  }

  return { group, colliders, interactables, occluders, update }
}

export default buildHotel
