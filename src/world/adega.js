import * as THREE from 'three'
import { ADEGA, interiorOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import {
  solid, stdMat, box, cyl, sphere, plane, tex, textPlaneMat,
  brickTex, concreteTex, woodTex,
} from './materials.js'
import { bakeStatic } from './bake.js'
import { createNPC } from '../npc/npc.js'
import { congelarPersonagem } from '../player/congelar.js'
import { criarChopeira } from '../mobilia/barril.js'
import { garrafaGin, garrafaPinga, garrafaLongNeck, garrafaoDeVidro, garrafaBatizada } from '../mobilia/destilados.js'
import { lataCerveja, garrafaVodka, garrafaWhiskey } from '../mobilia/bebidas.js'
import { copoAmericano, copoTulipa, canecaDeChope } from '../mobilia/copos.js'

// ---------------------------------------------------------------------------
// world/adega.js — O CEM. A adega clandestina do predio 100.
//
// O PEDIDO, e como cada parte dele virou geometria:
//
// "o lugar nao e legalizado, nao pode parecer uma adega". Entao a ADEGA NAO TEM
// FACHADA. O predio 100 continua sendo o que sempre foi da rua do anel: um
// galpao cego de painel cinza, de 14 m, com a porta de carga SOLDADA (chapa
// ondulada com dois cordoes de solda por cima e uma corrente passada), as
// janelas do terreo emparedadas de tijolo e a placa 100 pendurada por um
// parafuso so. Nao ha letreiro, nao ha vitrine, nao ha luz na frente. Quem
// passa na rua nao ve nada porque NAO HA NADA PRA VER: a unica pista e uma
// marca de giz de dois palmos no reboco, do lado da chapa, apontando pro beco.
//
// A PORTA DE VERDADE E NO BECO — a fresta de 3 m entre este predio e os fundos
// da barbearia. Porta de aco pintada da cor da parede, sem macaneta do lado de
// fora, um postigo na altura dos olhos e uma lampada nua. Na primeira vez o
// postigo abre ANTES da porta: alguem olha, e so entao a tranca corre. Depois
// disso ela fica destrancada.
//
// E ENTRA-SE DE LADO. O vestibulo nao da pro salao: da numa parede. O vao fica
// na quina noroeste dele, com uma cortina de tiras. Isso e um COTOVELO, e o
// cotovelo e a razao de o lugar existir num predio cego — com a porta alinhada
// com o salao, o beco enxergaria o balcao inteiro toda vez que alguem entrasse.
//
// "bebidas ilegais e adulteradas": o salao nao esconde de onde vem a mercadoria.
// Atras do barman ha uma TELA DE ARAME, e atras da tela esta a operacao —
// alambique de cobre no fogo, bombonas de granel, a mesa de envase com o funil,
// as garrafas vazias de rotulo arrancado e a caixa de tampas trocadas. O
// jogador pede um chope olhando pra dentro daquilo.
//
// A LUZ: TRES PointLight, nenhuma com sombra, e o resto e emissivo.
//
//   1. balcao      (ambar forte)  — e onde a cena acontece
//   2. meio do salao (ambar fraca) — pras mesas nao ficarem pretas
//   3. os fundos   (verde-fria)   — E ELA QUE FAZ O LUGAR SER CLANDESTINO
//
// A terceira e a decisao que vale registrar. Ela nao esta ali pra iluminar —
// esta ali pra CONTRASTAR. Um salao inteiro na mesma temperatura le como bar; o
// mesmo salao quente com um fundo esverdeado atras da tela le como bar com
// alguma coisa acontecendo la atras. E o unico truque de luz do arquivo e custa
// exatamente uma luz.
//
// O orcamento de tools/smoke.mjs subiu de 28 pra 31 por causa destas tres, e o
// comentario de la explica por que emissivo nao substituiria nenhuma delas.
// ---------------------------------------------------------------------------

const B = ADEGA
const IN = interiorOf(B)                  // x 14.3..29.7 / z -51.7..-32.3
const BASE = LEVELS.SHOP_FLOOR            // 0.16
const CEIL = 3.30                         // pe-direito local (3.46 no mundo)

// --- a planta, em numeros ----------------------------------------------------
// Tudo em X/Z de MUNDO; o Y e local (o grupo inteiro sobe BASE no fim).

const PORTA = { x: 27.90, larg: 1.10, alt: 2.10 }   // a porta do beco, na parede z1
const VEST = { x0: 25.20, z0: -36.60 }              // canto noroeste do vestibulo
// 2,0 m e nao 1,5: o cotovelo e o UNICO caminho entre o vestibulo e o salao, e
// caminho unico se atravessa nos dois sentidos com pressa. Com 1,5 m ele lia
// como fresta, e o dono do projeto relatou que nao achava a saida.
const VAO = { x0: 25.20, x1: 27.20 }                // o cotovelo: vao do vestibulo
const BALCAO = { x0: 16.20, x1: 24.40, z: -44.60, d: 0.95, h: 1.02 }
const TELA_Z = -46.60                               // a tela de arame
const TELA_VAO = { x0: 25.00, x1: 26.80 }           // o portao da tela
const DONO = { x: 20.30, z: -45.55 }
const ALAMBIQUE = { x: 17.60, z: -49.60 }

// --- materiais ---------------------------------------------------------------

// materials.js exporta tex() com UM numero de repeticao pros dois eixos, e
// parede de 15 m nao se azuleja com o mesmo numero em X e em Y. Este e o mesmo
// `tiled` que city.js tem, e pela mesma razao: clona a textura (barato, o
// canvas e compartilhado) e guarda por chave.
const _tiles = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx + ':' + ry
  const achado = _tiles.get(k)
  if (achado) return achado
  const t = base.clone()
  t.needsUpdate = true
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  _tiles.set(k, t)
  return t
}

/** Tela de arame galvanizada: losangos. O desenho e o ALPHA, nao a cor. */
function telaTex() {
  return tex('adega-tela', 128, (g, s) => {
    g.fillStyle = '#000000'
    g.fillRect(0, 0, s, s)
    g.strokeStyle = '#ffffff'
    // 3 px de arame em 128 de losango: a proporcao de um alambrado de verdade
    // (3 mm de fio numa malha de 10 cm). Em 4 px a tela vira grade de cadeia.
    g.lineWidth = 3
    const p = 128
    for (let i = -s; i < s * 2; i += p) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke()
      g.beginPath(); g.moveTo(i, s); g.lineTo(i + s, 0); g.stroke()
    }
  })
}

/** Reboco caindo: mancha de umidade e tijolo aparecendo por baixo. */
function rebocoTex() {
  return tex('adega-reboco', 256, (g, s) => {
    // tijolo por baixo
    g.fillStyle = '#7a4a36'
    g.fillRect(0, 0, s, s)
    const lh = s / 10
    for (let r = 0; r < 10; r++) {
      const off = (r % 2) * (s / 8)
      g.fillStyle = '#b9ab98'
      g.fillRect(0, r * lh + lh - 3, s, 3)
      for (let c = 0; c <= 8; c++) {
        g.fillRect((c * s) / 8 + off - 1.5, r * lh, 3, lh)
      }
    }
    // reboco por cima, comido nas bordas
    g.fillStyle = '#9a9086'
    for (let i = 0; i < 34; i++) {
      const w = s * (0.16 + Math.random() * 0.5)
      const h = s * (0.12 + Math.random() * 0.42)
      g.globalAlpha = 0.72 + Math.random() * 0.28
      g.fillRect(Math.random() * s - w * 0.3, Math.random() * s - h * 0.3, w, h)
    }
    g.globalAlpha = 1
    // umidade subindo do rodape
    const grd = g.createLinearGradient(0, s, 0, s * 0.45)
    grd.addColorStop(0, 'rgba(48,42,34,0.72)')
    grd.addColorStop(1, 'rgba(60,54,44,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 240; i++) {
      g.fillStyle = 'rgba(30,26,20,' + (Math.random() * 0.22) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
  })
}

/** Cimento queimado com poca escura perto do ralo. */
function pisoTex() {
  return tex('adega-piso', 256, (g, s) => {
    g.fillStyle = '#4d4a45'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const v = Math.random()
      g.fillStyle = 'rgba(' + (v > 0.5 ? '120,116,108' : '30,28,25') + ',' + (Math.random() * 0.22) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 1 + Math.random() * 4)
    }
    // juntas de dilatacao
    g.strokeStyle = 'rgba(24,22,20,0.55)'
    g.lineWidth = 2
    for (const k of [0.5]) {
      g.beginPath(); g.moveTo(0, s * k); g.lineTo(s, s * k); g.stroke()
      g.beginPath(); g.moveTo(s * k, 0); g.lineTo(s * k, s); g.stroke()
    }
    // manchas de bebida derramada
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 26
      const gr = g.createRadialGradient(x, y, 1, x, y, r)
      gr.addColorStop(0, 'rgba(28,20,12,0.42)')
      gr.addColorStop(1, 'rgba(28,20,12,0)')
      g.fillStyle = gr
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
  })
}

const M = {
  get piso() { return stdMat('adega-piso-mat', { map: tiled(pisoTex(), 5, 6), roughness: 0.92 }) },
  get parede() { return stdMat('adega-parede', { map: tiled(rebocoTex(), 3.2, 1.1), color: 0xa79c8e, roughness: 0.96 }) },
  get paredeExt() { return stdMat('adega-parede-ext', { map: tiled(concreteTex(1), 5.2, 4.6), color: 0x7f8a97, roughness: 0.94 }) },
  get tijolo() { return stdMat('adega-tijolo', { map: tiled(brickTex(1), 2.2, 1.2), color: 0x9a7060, roughness: 0.95 }) },
  get forro() { return solid(0x24211d, 0.96) },
  get viga() { return stdMat('adega-viga', { map: woodTex(2, '#3a2412'), color: 0x6a5238, roughness: 0.9 }) },
  get madeira() { return stdMat('adega-madeira', { map: woodTex(2, '#4a2c18'), color: 0x8a5c38, roughness: 0.72 }) },
  get madeiraVelha() { return stdMat('adega-madeira-velha', { map: woodTex(3, '#3d2a1a'), color: 0x6f5539, roughness: 0.94 }) },
  get chapa() { return solid(0x6d7278, 0.55, 0.55) },
  get chapaPintada() { return solid(0x5c6169, 0.72, 0.30) },
  get ferro() { return solid(0x35383d, 0.72, 0.45) },
  get ferrugem() { return solid(0x6d4526, 0.94, 0.18) },
  get cobre() { return solid(0xb06a2c, 0.38, 0.72) },
  get inox() { return solid(0xb0b6bc, 0.34, 0.80) },
  get plasticoAzul() { return solid(0x2c4a86, 0.62, 0.02) },
  get plasticoBranco() { return solid(0xcfc9ba, 0.72, 0.02) },
  get borracha() { return solid(0x15171a, 0.96) },
  get corda() { return solid(0x8a7748, 0.98) },
  get feltro() { return solid(0x3a1f1a, 0.98) },
  // vidro verde-garrafa OPACO: sao 176 instancias na prateleira e transparencia
  // nessa quantidade custa ordenacao por quadro sem mudar nada na leitura a dois
  // metros — o que se ve de uma garrafa deitada no escuro e a silhueta.
  get vidroGarrafa() { return solid(0x24402c, 0.34, 0.10) },
  get vidroAmbar() { return solid(0x53300f, 0.36, 0.10) },
  /**
   * A TELA, COM A MALHA NA ESCALA CERTA.
   *
   * Ela precisa do TAMANHO do pano porque um plane tem UV de 0 a 1: com repeat
   * 1, os losangos de uma tela de 10 x 3 m ficam de UM METRO cada e o resultado
   * nao le como alambrado — le como papel de parede geometrico. Foi exatamente
   * o que apareceu no primeiro render.
   *
   * 0.10 m e o passo da malha (4 polegadas, tela de galpao). Nao e 5 cm de
   * proposito: com o losango menor a linha de 3 px cai abaixo de um pixel na
   * tela ja a tres metros, o mipmap come o arame e a tela some. O material e
   * cacheado pela repeticao, entao os dois panos e o portao dividem no maximo
   * tres materiais.
   */
  telaDe(larg, alt) {
    const rx = Math.max(1, Math.round(larg / 0.10))
    const ry = Math.max(1, Math.round(alt / 0.10))
    return stdMat('adega-tela:' + rx + 'x' + ry, {
      // cinza escuro e nao claro: arame galvanizado velho num comodo escuro nao
      // devolve luz, e tela clara vira renda na frente do alambique
      // alphaTest SEM transparent: com os dois ligados a tela entra na fila
      // TRANSPARENTE, que ordena por distancia a cada quadro e desliga o
      // z-buffer — caro, e desnecessario, porque arame nao tem meio-tom. Com
      // alphaTest sozinho ela e opaca e recortada, que e o que ela e.
      color: 0x5a6064, alphaMap: tiled(telaTex(), rx, ry), transparent: false,
      alphaTest: 0.5, roughness: 0.72, metalness: 0.35, side: THREE.DoubleSide,
    })
  },
  // --- emissivos (nao iluminam nada; acendem a si mesmos) ------------------
  get bulboQuente() { return stdMat('adega-bulbo', { color: 0xfff0cf, emissive: 0xffd28a, emissiveIntensity: 2.1, roughness: 0.4 }) },
  get bulboVermelho() { return stdMat('adega-bulbo-red', { color: 0xff9a86, emissive: 0xd02a1a, emissiveIntensity: 1.9, roughness: 0.4 }) },
  get bulboFrio() { return stdMat('adega-bulbo-frio', { color: 0xd6f0e2, emissive: 0x4fd8a0, emissiveIntensity: 1.5, roughness: 0.4 }) },
  get saidaVerde() { return stdMat('adega-saida', { color: 0x8ff0b4, emissive: 0x21c25e, emissiveIntensity: 2.2, roughness: 0.4 }) },
  get brasa() { return stdMat('adega-brasa', { color: 0xff9b3a, emissive: 0xff5a10, emissiveIntensity: 2.4, roughness: 0.7 }) },
}

// --- ferramentas locais -------------------------------------------------------

function col(lista, x0, x1, z0, z1, tag) {
  lista.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), tag })
}

/** Parede interna reta com colisor junto. `eixo` e 'x' (corre em X) ou 'z'. */
function parede(g, colliders, eixo, fixo, a0, a1, alt, esp, mat) {
  const t = esp || 0.16
  const m = eixo === 'x'
    ? box(a1 - a0, alt, t, mat || M.parede, (a0 + a1) / 2, alt / 2, fixo)
    : box(t, alt, a1 - a0, mat || M.parede, fixo, alt / 2, (a0 + a1) / 2)
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  if (eixo === 'x') col(colliders, a0, a1, fixo - t / 2, fixo + t / 2, 'adega-parede')
  else col(colliders, fixo - t / 2, fixo + t / 2, a0, a1, 'adega-parede')
  return m
}

// ===========================================================================
// 1. A CASCA — o galpao cego
// ===========================================================================

/**
 * A casca e propria (nao passa pelo buildShell de city.js) pelo mesmo motivo do
 * cassino e do hotel: aquele modulo desenha VITRINE E LETREIRO na face z1, e o
 * predio 100 nao pode ter nem uma coisa nem outra. Aqui a fachada e a face z0 e
 * o que ela tem e uma porta de carga soldada.
 *
 * Ela sobe os 14 m inteiros: o predio continua sendo o volume que ja estava no
 * skyline, so que agora e OCO no terreo.
 */
function casca(g, colliders, occluders) {
  // H e LOCAL: o grupo inteiro sobe BASE no fim do build. Com B.wallHeight cru
  // aqui o predio ficaria 16 cm mais alto que o lote diz, e a laje de neve de
  // neve.js (que le wallHeight + 0.34 no MUNDO) pousaria dentro da cobertura.
  const H = B.wallHeight - BASE
  const T = WALL_T
  const w = B.x1 - B.x0, d = B.z1 - B.z0
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2

  // As quatro paredes, do chao (y local -BASE, pra encostar na rua) ao topo.
  // O vao da porta do beco parte a parede z1 em duas.
  const y0 = -BASE
  const alt = H - y0
  const dl = PORTA.x - PORTA.larg / 2, dr = PORTA.x + PORTA.larg / 2

  function laje(x0, x1, yA, yB, z0, z1, mat) {
    const m = box(x1 - x0, yB - yA, z1 - z0, mat, (x0 + x1) / 2, (yA + yB) / 2, (z0 + z1) / 2)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    return m
  }

  laje(B.x0, B.x1, y0, H, B.z0, B.z0 + T, M.paredeExt)               // norte (rua)
  laje(B.x0, B.x0 + T, y0, H, B.z0, B.z1, M.paredeExt)               // oeste
  laje(B.x1 - T, B.x1, y0, H, B.z0, B.z1, M.paredeExt)               // leste
  laje(B.x0, dl, y0, H, B.z1 - T, B.z1, M.paredeExt)                 // sul (beco), esquerda
  laje(dr, B.x1, y0, H, B.z1 - T, B.z1, M.paredeExt)                 // sul, direita
  laje(dl, dr, PORTA.alt, H, B.z1 - T, B.z1, M.paredeExt)            // verga da porta

  // colisores das quatro paredes, com o vao livre
  col(colliders, B.x0, B.x1, B.z0, B.z0 + T, 'adega-casca')
  col(colliders, B.x0, B.x0 + T, B.z0, B.z1, 'adega-casca')
  col(colliders, B.x1 - T, B.x1, B.z0, B.z1, 'adega-casca')
  col(colliders, B.x0, dl, B.z1 - T, B.z1, 'adega-casca')
  col(colliders, dr, B.x1, B.z1 - T, B.z1, 'adega-casca')

  // occluders de camera: as mesmas quatro, com altura
  const HW = B.wallHeight              // os occluders sao em coordenadas de MUNDO
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z0, maxX: B.x1, maxY: HW, maxZ: B.z0 + T, tag: 'adega' })
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z0, maxX: B.x0 + T, maxY: HW, maxZ: B.z1, tag: 'adega' })
  occluders.push({ minX: B.x1 - T, minY: 0, minZ: B.z0, maxX: B.x1, maxY: HW, maxZ: B.z1, tag: 'adega' })
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z1 - T, maxX: dl, maxY: HW, maxZ: B.z1, tag: 'adega' })
  occluders.push({ minX: dr, minY: 0, minZ: B.z1 - T, maxX: B.x1, maxY: HW, maxZ: B.z1, tag: 'adega' })
  // o volume acima do forro e macico pra camera: sem isso, a orbita de 3a
  // pessoa entra no vazio entre o forro e o telhado e a tela fica preta
  occluders.push({ minX: B.x0, minY: CEIL + BASE, minZ: B.z0, maxX: B.x1, maxY: HW, maxZ: B.z1, tag: 'adega-sotao' })

  // --- cobertura: as medidas sao as que neve.js espera de um LOTE ----------
  // (laje de w+0.7 x 0.34 centrada em H+0.17, muretas recuadas 5 cm)
  const deck = box(w + 0.7, 0.34, d + 0.7, solid(0x5b5f63, 0.9), cx, H + 0.17, cz)
  deck.castShadow = true
  g.add(deck)
  const mur = solid(0x6a6560, 0.92)
  const yF = H + 1.04, yL = H + 0.895
  g.add(box(w + 0.6, yF - H - 0.34, 0.20, mur, cx, (H + 0.34 + yF) / 2, B.z0 + 0.05))
  g.add(box(w + 0.6, yL - H - 0.34, 0.20, mur, cx, (H + 0.34 + yL) / 2, B.z1 - 0.05))
  g.add(box(0.20, yL - H - 0.34, d + 0.6, mur, B.x0 + 0.05, (H + 0.34 + yL) / 2, cz))
  g.add(box(0.20, yL - H - 0.34, d + 0.6, mur, B.x1 - 0.05, (H + 0.34 + yL) / 2, cz))

  // caixa d'agua e a casa de maquinas: silhueta de galpao velho
  const cxa = cyl(0.95, 0.95, 1.5, solid(0x2f6fa8, 0.86), 14)
  cxa.position.set(B.x0 + 4.2, H + 1.1, B.z0 + 4.6)
  cxa.castShadow = true
  g.add(cxa)
  g.add(box(2.6, 2.2, 2.2, solid(0x77828f, 0.92), B.x1 - 4.0, H + 1.44, cz + 2.0))
  // exaustor eolico: um cone e um chapeu, so silhueta
  const ex = cyl(0.34, 0.40, 0.42, M.chapa, 12)
  ex.position.set(cx + 3.4, H + 0.60, cz - 4.0)
  g.add(ex)

  // --- O AVENTAL DE CALCADA -------------------------------------------------
  //
  // Todo LOTE deste mapa tem um avental de 90 cm em volta, e quem RESPONDE por
  // ele e groundY() de city.js (SHOP_PADS = LOTES.map(apronOf)). Quem DESENHA e
  // outra pessoa: as tres lojas de fachada z1 ganham o avental dentro do
  // buildShell; o cassino, o hotel, a garagem e esta adega desenham o proprio.
  //
  // Sem estas tres faixas o groundY diz 0.16 e nao ha laje nenhuma ali: o
  // jogador andaria no beco 16 cm acima da grama, flutuando. Foi o que a foto
  // do beco mostrou.
  //
  // As faixas param em z = -48 DE PROPOSITO. De -52 a -48 e a calcada interna do
  // anel, que city.js ja desenha em 0.16 — pintar por cima poria duas lajes na
  // MESMA altura disputando a superficie, que e o z-fighting que semLotes()
  // existe pra matar.
  const matAvental = stdMat('adega-avental', {
    map: tiled(concreteTex(1), 6, 8), color: 0x9d9a92, roughness: 0.95,
  })
  function avental(x0, x1, z0, z1) {
    const a = box(x1 - x0, BASE, z1 - z0, matAvental, (x0 + x1) / 2, -BASE / 2, (z0 + z1) / 2)
    a.receiveShadow = true
    g.add(a)
  }
  avental(B.x0 - 0.9, B.x0, -48, B.z1 + 0.9)        // oeste
  avental(B.x1, B.x1 + 0.9, -48, B.z1 + 0.9)        // leste
  avental(B.x0 - 0.9, B.x1 + 0.9, B.z1, B.z1 + 0.9) // o beco, na frente da porta

  // O MIOLO DO BECO. Entre o avental daqui (que acaba em -31.1) e o da
  // barbearia (que comeca em -28.9) sobram 2,2 m em que groundY() devolve 0 —
  // e o que ficava ali era GRAMA, no meio de um beco entre dois predios.
  //
  // A faixa e de TERRA BATIDA e fica em y = 0.03, nao em 0.16: ela nao pode
  // subir ate a altura dos aventais porque groundY nao concorda com isso, e
  // jogador andando 13 cm acima do chao e pior que um degrau. O degrau, alias,
  // e o certo — os dois lados sao calcada e o meio e o beco.
  const matTerra = stdMat('adega-beco-terra', {
    map: tiled(concreteTex(1), 5, 1.4), color: 0x6f665a, roughness: 1.0,
  })
  const terra = box(B.x1 - B.x0 + 1.8, 0.03, 2.2, matTerra,
    (B.x0 + B.x1) / 2, -BASE + 0.015, B.z1 + 2.0)
  terra.receiveShadow = true
  g.add(terra)
  // poca de agua parada e um punhado de mato nas juntas: e o que faz um beco
  // ser um beco e nao uma passagem
  const poca = plane(1.6, 1.0, solid(0x2f3a3a, 0.18, 0.05))
  poca.position.set(B.x0 + 5.4, -BASE + 0.034, B.z1 + 1.5)
  poca.receiveShadow = false
  g.add(poca)
  const mato = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.012, 0.16, 0.012), solid(0x4d5a34, 1.0), 46,
  )
  const dm = new THREE.Object3D()
  for (let i = 0; i < 46; i++) {
    dm.position.set(
      B.x0 - 0.4 + Math.random() * (B.x1 - B.x0 + 0.8),
      -BASE + 0.08,
      B.z1 + 0.95 + Math.random() * 2.0,
    )
    dm.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5)
    dm.updateMatrix()
    mato.setMatrixAt(i, dm.matrix)
  }
  mato.instanceMatrix.needsUpdate = true
  mato.castShadow = false
  g.add(mato)

  // --- A FACHADA MORTA (face z0, virada pro anel) --------------------------
  fachadaMorta(g)
  // --- as janelas cegas dos andares de cima --------------------------------
  janelasCegas(g)
}

/**
 * A fachada que nao e fachada.
 *
 * Cada peca aqui existe pra dizer "aqui nao funciona nada": a chapa de enrolar
 * BAIXADA ATE O CHAO e com dois cordoes de solda atravessados, a corrente e o
 * cadeado, o degrau de doca sem uso, as duas janelas emparedadas com tijolo
 * NOVO (o unico material limpo do predio inteiro — reparo recente le como
 * escondido) e a placa 100 pendurada por um parafuso so, torta.
 *
 * A UNICA PISTA e a marca de giz. Ela e minuscula, esta na altura da cintura, ao
 * lado da chapa, e aponta pro beco.
 */
function fachadaMorta(g) {
  const z = B.z0 - 0.02
  const cx = (B.x0 + B.x1) / 2

  // chapa de enrolar, fechada
  const shutter = stdMat('adega-shutter', {
    map: tiled(tex('adega-shut', 64, (gg, s) => {
      gg.fillStyle = '#6f757b'; gg.fillRect(0, 0, s, s)
      for (let y = 0; y < s; y += 6) {
        gg.fillStyle = 'rgba(42,46,50,0.62)'; gg.fillRect(0, y, s, 2)
        gg.fillStyle = 'rgba(186,192,198,0.28)'; gg.fillRect(0, y + 3, s, 1)
      }
      for (let i = 0; i < 40; i++) {
        gg.fillStyle = 'rgba(110,68,36,' + (0.10 + Math.random() * 0.30) + ')'
        gg.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 9, 2 + Math.random() * 5)
      }
    }, 1), 3.2, 5),
    roughness: 0.72, metalness: 0.32,
  })
  const ch = box(3.4, 3.5, 0.10, shutter, cx, 1.60, z)
  ch.castShadow = true
  g.add(ch)
  // caixao do enrolador e as guias
  g.add(box(3.7, 0.38, 0.24, M.chapaPintada, cx, 3.52, z - 0.02))
  for (const s of [-1, 1]) g.add(box(0.12, 3.5, 0.16, M.chapaPintada, cx + s * 1.76, 1.60, z))

  // OS DOIS CORDOES DE SOLDA. Sao duas barras chatas atravessadas na diagonal,
  // com as bolhas do cordao (uma InstancedMesh de 22 esferinhas).
  for (const s of [-1, 1]) {
    const barra = box(3.8, 0.10, 0.05, M.ferrugem, cx, 1.55, z - 0.08)
    barra.rotation.z = s * 0.30
    barra.castShadow = true
    g.add(barra)
  }
  const bolhas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.030, 6, 5), M.ferrugem, 22)
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 22; i++) {
    const s = i < 11 ? 1 : -1
    const t = ((i % 11) / 10 - 0.5) * 3.6
    d0.position.set(cx + t, 1.55 + s * t * 0.30, z - 0.11)
    d0.updateMatrix()
    bolhas.setMatrixAt(i, d0.matrix)
  }
  bolhas.instanceMatrix.needsUpdate = true
  g.add(bolhas)

  // corrente e cadeado no pe da chapa
  const elos = new THREE.InstancedMesh(new THREE.TorusGeometry(0.035, 0.011, 5, 10), M.ferro, 16)
  for (let i = 0; i < 16; i++) {
    d0.position.set(cx - 0.8 + i * 0.058, 0.16 + Math.sin(i * 0.9) * 0.03, z - 0.10)
    d0.rotation.set(0, 0, (i % 2) * Math.PI / 2)
    d0.updateMatrix()
    elos.setMatrixAt(i, d0.matrix)
  }
  elos.instanceMatrix.needsUpdate = true
  g.add(elos)
  const cad = box(0.11, 0.14, 0.05, M.ferro, cx + 0.20, 0.16, z - 0.14)
  cad.castShadow = true
  g.add(cad)

  // degrau de doca, gasto e sem uso
  const deg = box(4.4, 0.30, 0.90, solid(0x8b867e, 0.95), cx, 0.15, z - 0.48)
  deg.receiveShadow = true
  g.add(deg)

  // duas janelas EMPAREDADAS com tijolo novo: o reparo recente e a denuncia
  for (const s of [-1, 1]) {
    const jx = cx + s * 5.2
    g.add(box(1.5, 1.5, 0.14, M.tijolo, jx, 2.35, z + 0.02))
    // a moldura antiga continua ali em volta
    g.add(box(1.76, 0.13, 0.10, M.chapaPintada, jx, 3.16, z))
    g.add(box(1.76, 0.13, 0.10, M.chapaPintada, jx, 1.54, z))
    for (const t of [-1, 1]) g.add(box(0.13, 1.76, 0.10, M.chapaPintada, jx + t * 0.815, 2.35, z))
  }

  // A PLACA 100, pendurada por um parafuso so
  const placa = new THREE.Group()
  const chapaN = box(0.46, 0.42, 0.02, solid(0x2b2e33, 0.86), 0, 0, 0)
  placa.add(chapaN)
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.36), textPlaneMat('100', {
    w: 256, h: 230, color: '#d8d2c2',
    font: 'bold 150px "Trebuchet MS", sans-serif', emissiveIntensity: 0.25,
  }))
  // O -Z e a MEIA-VOLTA sao o que faz o numero existir: um PlaneGeometry nasce
  // olhando pro +Z, e a rua deste predio esta no -Z. Sem isso a placa aparece
  // do avesso e o unico texto do lugar inteiro fica preto.
  num.position.z = -0.012
  num.rotation.y = Math.PI
  placa.add(num)
  placa.position.set(cx + 2.20, 2.62, z - 0.03)
  placa.rotation.z = -0.16                 // torta: um parafuso so
  g.add(placa)
  const paraf = cyl(0.014, 0.014, 0.05, M.ferro, 8)
  paraf.rotation.x = Math.PI / 2
  paraf.position.set(cx + 2.20, 2.80, z - 0.05)
  g.add(paraf)

  // A MARCA DE GIZ: uma seta de tres tracos, na altura da cintura, apontando
  // pro beco (que fica no +Z, atras do predio). Le como sujeira de longe.
  const giz = solid(0xd8d3c4, 0.99)
  const seta = new THREE.Group()
  seta.add(box(0.30, 0.022, 0.010, giz, 0, 0, 0))
  const p1 = box(0.13, 0.020, 0.010, giz, 0.11, 0.048, 0)
  p1.rotation.z = -0.7
  const p2 = box(0.13, 0.020, 0.010, giz, 0.11, -0.048, 0)
  p2.rotation.z = 0.7
  seta.add(p1, p2)
  seta.position.set(cx + 2.30, 1.05, z - 0.03)
  seta.rotation.z = -0.12
  seta.traverse((o) => { if (o.isMesh) o.castShadow = false })
  g.add(seta)
}

/** Os tres andares de cima: janela cega, uma so com tapume, e a escada de
 *  incendio enferrujada. Nenhuma acende — o predio esta vazio de verdade. */
function janelasCegas(g) {
  const linhas = [5.2, 7.8, 10.4, 13.0]
  const vidro = solid(0x14161a, 0.5, 0.3)
  const molde = solid(0x5a554e, 0.9)
  const geoV = new THREE.BoxGeometry(1.15, 1.35, 0.06)
  const geoM = new THREE.BoxGeometry(1.35, 1.55, 0.05)
  const faces = [
    { z: B.z0 - 0.03, n: 5, x0: B.x0 + 1.8, x1: B.x1 - 1.8, eixo: 'x' },
    { z: B.z1 + 0.03, n: 5, x0: B.x0 + 1.8, x1: B.x1 - 1.8, eixo: 'x' },
  ]
  for (const f of faces) {
    for (const y of linhas) {
      for (let i = 0; i < f.n; i++) {
        const x = f.x0 + ((f.x1 - f.x0) * i) / (f.n - 1)
        const m = new THREE.Mesh(geoM, molde)
        m.position.set(x, y, f.z)
        g.add(m)
        const v = new THREE.Mesh(geoV, vidro)
        v.position.set(x, y, f.z + (f.z < B.z0 ? -0.02 : 0.02))
        g.add(v)
        // uma em cada seis leva tapume de compensado
        if ((i + Math.round(y)) % 6 === 0) {
          const t = box(1.20, 1.40, 0.04, M.madeiraVelha, x, y, f.z + (f.z < B.z0 ? -0.05 : 0.05))
          g.add(t)
        }
      }
    }
  }
  // escada de incendio na face leste, sem uso
  for (const y of [5.2, 7.8, 10.4]) {
    g.add(box(0.10, 0.10, 3.0, M.ferrugem, B.x1 + 0.30, y, B.z0 + 6.0))
    g.add(box(1.00, 0.06, 2.6, M.ferrugem, B.x1 + 0.55, y - 0.5, B.z0 + 6.0))
  }
}

// ===========================================================================
// 2. O BECO — a entrada de verdade
// ===========================================================================

/**
 * A PORTA DO BECO.
 *
 * Pintada da MESMA cor da parede de proposito: uma porta de aco cinza numa
 * parede de aco cinza, sem macaneta do lado de fora, e o que faz alguem passar
 * na frente dela sem ver. O que denuncia e o que se acumula em volta —
 * engradados vazios, a mangueira, a lampada nua e as bitucas.
 *
 * A ABERTURA E EM DUAS ETAPAS na primeira vez, e e isso que faz o lugar ser um
 * lugar e nao uma porta: o POSTIGO corre primeiro, fica aberto quase um segundo
 * (alguem esta olhando), fecha, e so entao a tranca corre e a folha gira. Da
 * segunda vez em diante ela e so uma porta.
 */
function portaDoBeco(g, colliders, interactables, game) {
  const z = B.z1 - WALL_T / 2
  const grupo = new THREE.Group()
  grupo.name = 'adega-porta'
  grupo.userData.noBake = true          // ela gira: nao pode ir pro forno

  // a folha gira em torno da dobradica da ESQUERDA (x menor)
  const pivo = new THREE.Group()
  pivo.position.set(PORTA.x - PORTA.larg / 2, 0, z)
  grupo.add(pivo)

  const folha = box(PORTA.larg, PORTA.alt, 0.075, M.chapaPintada, PORTA.larg / 2, PORTA.alt / 2, 0)
  folha.castShadow = true
  folha.receiveShadow = true
  pivo.add(folha)
  // reforcos horizontais e os tres gonzos
  for (const y of [0.36, 1.05, 1.74]) {
    pivo.add(box(PORTA.larg - 0.06, 0.09, 0.02, M.ferro, PORTA.larg / 2, y, 0.048))
  }
  for (const y of [0.28, 1.05, 1.82]) {
    const gz = cyl(0.028, 0.028, 0.11, M.ferro, 8)
    gz.position.set(0.02, y, 0.052)
    pivo.add(gz)
  }
  // macaneta SO DO LADO DE DENTRO
  const mac = cyl(0.016, 0.016, 0.13, M.ferro, 8)
  mac.rotation.z = Math.PI / 2
  mac.position.set(PORTA.larg - 0.16, 1.02, -0.058)
  pivo.add(mac)

  // O POSTIGO: uma chapinha que CORRE pro lado, e o buraco escuro atras dela
  const buraco = box(0.20, 0.13, 0.01, solid(0x08090b, 0.9), PORTA.larg / 2, 1.55, 0.030)
  pivo.add(buraco)
  const postigo = box(0.24, 0.17, 0.014, M.ferro, PORTA.larg / 2, 1.55, 0.044)
  postigo.castShadow = false
  pivo.add(postigo)
  // trilho do postigo
  pivo.add(box(0.52, 0.02, 0.02, M.ferro, PORTA.larg / 2, 1.645, 0.046))
  pivo.add(box(0.52, 0.02, 0.02, M.ferro, PORTA.larg / 2, 1.455, 0.046))
  // dois olhos atras do buraco: so aparecem com o postigo aberto
  const olhos = new THREE.Group()
  for (const s of [-1, 1]) {
    const o = sphere(0.017, solid(0xe8e2d4, 0.5), 8)
    o.position.set(PORTA.larg / 2 + s * 0.032, 1.556, 0.020)
    olhos.add(o)
    const p = sphere(0.008, solid(0x1a1410, 0.4), 6)
    p.position.set(PORTA.larg / 2 + s * 0.032, 1.556, 0.030)
    olhos.add(p)
  }
  olhos.visible = false
  olhos.traverse((o) => { if (o.isMesh) o.castShadow = false })
  pivo.add(olhos)

  // batente
  g.add(box(0.10, PORTA.alt + 0.10, 0.16, M.ferro, PORTA.x - PORTA.larg / 2 - 0.05, (PORTA.alt + 0.10) / 2, z))
  g.add(box(0.10, PORTA.alt + 0.10, 0.16, M.ferro, PORTA.x + PORTA.larg / 2 + 0.05, (PORTA.alt + 0.10) / 2, z))
  g.add(box(PORTA.larg + 0.20, 0.10, 0.16, M.ferro, PORTA.x, PORTA.alt + 0.05, z))

  g.add(grupo)

  // --- a lampada nua sobre a porta (emissiva; nao ilumina, mas MARCA) -------
  const luz = new THREE.Group()
  luz.add(box(0.14, 0.10, 0.10, M.ferro, PORTA.x, PORTA.alt + 0.42, B.z1 + 0.10))
  const bulbo = sphere(0.055, M.bulboQuente, 10)
  bulbo.position.set(PORTA.x, PORTA.alt + 0.32, B.z1 + 0.16)
  bulbo.castShadow = false
  luz.add(bulbo)
  const chapeu = cyl(0.16, 0.09, 0.09, M.ferrugem, 10, true)
  chapeu.position.set(PORTA.x, PORTA.alt + 0.40, B.z1 + 0.16)
  luz.add(chapeu)
  g.add(luz)

  // --- o que se acumula em volta -------------------------------------------
  // engradados vazios empilhados (madeira + as garrafas dentro, so silhueta)
  for (let i = 0; i < 5; i++) {
    const ex = PORTA.x - 1.45 - (i % 2) * 0.05
    const ey = (i % 3) * 0.34
    const ez = B.z1 + 0.32 + Math.floor(i / 3) * 0.42
    const e = engradado(0x5c3a1e)
    e.position.set(ex, ey, ez)
    e.rotation.y = 0.1 + i * 0.06
    g.add(e)
  }
  col(colliders, PORTA.x - 1.9, PORTA.x - 1.0, B.z1 + 0.05, B.z1 + 0.95, 'adega-engradado')

  // mangueira enrolada num prego
  const rolo = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.028, 6, 20), solid(0x1f3b2a, 0.95))
  rolo.position.set(PORTA.x + 0.95, 1.45, B.z1 + 0.08)
  g.add(rolo)
  // pingo de agua abaixo dela: a mancha escura no chao do beco
  const mancha = plane(0.7, 0.5, solid(0x2a2723, 0.98))
  mancha.position.set(PORTA.x + 0.95, 0.012, B.z1 + 0.45)
  mancha.receiveShadow = false
  g.add(mancha)

  // bitucas: 14 cilindrinhos, uma InstancedMesh
  const bit = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.026, 5), solid(0xd8d0bc, 0.98), 14)
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 14; i++) {
    d0.position.set(PORTA.x - 0.6 + Math.random() * 1.5, 0.014, B.z1 + 0.20 + Math.random() * 0.75)
    d0.rotation.set(Math.PI / 2, Math.random() * 3, Math.random() * 3)
    d0.updateMatrix()
    bit.setMatrixAt(i, d0.matrix)
  }
  bit.instanceMatrix.needsUpdate = true
  bit.castShadow = false
  g.add(bit)

  // --- colisor e maquina de estados -----------------------------------------
  const colPorta = (game && game.collision ? game.collision.add({
    minX: PORTA.x - PORTA.larg / 2 + 0.02, maxX: PORTA.x + PORTA.larg / 2 - 0.02,
    minZ: z - 0.06, maxZ: z + 0.06,
    tag: 'adega-porta', ativo: true,
  })[0] : { ativo: true })

  const est = {
    fase: 'fechada',     // fechada | postigo | espia | fechando-postigo | abrindo | aberta
    t: 0,
    aberta: 0,           // 0..1 giro da folha
    corre: 0,            // 0..1 do postigo
    conhecida: false,    // ja entrou uma vez
  }

  // OS DOIS PONTOS SAO ALTERNADORES, e o de dentro NUNCA e tecla morta.
  //
  // Eles nasceram assimetricos — o de fora abria, o de dentro so FECHAVA — e
  // isso TRANCAVA O JOGADOR DENTRO DO PREDIO. O caminho era este: quem entra
  // fica com o ponto de DENTRO como o mais proximo (a interacao escolhe sempre
  // o mais perto), o rotulo dizia "Fechar a porta", o E fechava... e dali em
  // diante o mesmo E nao fazia mais nada, porque aquele ponto so conhecia o
  // caso `aberta`. Porta fechada, sem macaneta do lado de fora e sem tecla que
  // responda de dentro: o unico jeito de sair era recarregar a pagina.
  //
  // A regra agora e uma so, e vale dos dois lados: fechada abre, aberta fecha.
  function alternarPorta(gm, deDentro) {
    if (est.fase === 'aberta') { est.fase = 'fechando'; est.t = 0; return }
    if (est.fase !== 'fechada') return          // no meio de uma animacao, ignora
    // de dentro a tranca e por dentro: nao ha postigo nem senha pra SAIR
    if (est.conhecida || deDentro) {
      est.conhecida = true
      est.fase = 'abrindo'
      est.t = 0
      return
    }
    est.fase = 'postigo'
    est.t = 0
    if (gm && gm.toast) gm.toast('Voce bate tres vezes. Alguem corre o postigo.')
  }

  const ponto = {
    id: 'adega-porta',
    position: new THREE.Vector3(PORTA.x, 1.05, B.z1 + 0.55),
    radius: 2.0,
    label: 'Bater na porta',
    onInteract: (gm) => alternarPorta(gm, false),
  }
  interactables.push(ponto)
  const pontoDentro = {
    id: 'adega-porta-dentro',
    position: new THREE.Vector3(PORTA.x, 1.05, B.z1 - 0.75),
    radius: 1.7,
    label: 'Abrir a porta',
    onInteract: (gm) => alternarPorta(gm, true),
  }
  interactables.push(pontoDentro)

  function atualizar(dt, gm) {
    est.t += dt
    switch (est.fase) {
      case 'postigo':
        est.corre = Math.min(1, est.t / 0.28)
        if (est.corre >= 1) {
          est.fase = 'espia'
          est.t = 0
          olhos.visible = true
          if (gm && gm.toast) gm.toast('— Quem te mandou aqui?   — O Zezo, da barbearia.')
        }
        break
      case 'espia':
        if (est.t > 1.15) { est.fase = 'fecha-postigo'; est.t = 0; olhos.visible = false }
        break
      case 'fecha-postigo':
        est.corre = Math.max(0, 1 - est.t / 0.20)
        if (est.corre <= 0) {
          est.fase = 'abrindo'
          est.t = 0
          est.conhecida = true
          ponto.label = 'Entrar'
          if (gm && gm.toast) gm.toast('A tranca corre por dentro.')
        }
        break
      case 'abrindo':
        // ease-out: a folha sai pesada e chega leve
        est.aberta = Math.min(1, 1 - Math.pow(1 - Math.min(1, est.t / 0.85), 3))
        if (est.aberta >= 1) {
          est.fase = 'aberta'
          ponto.label = 'Fechar a porta'
          pontoDentro.label = 'Fechar a porta'
        }
        break
      case 'fechando':
        est.aberta = Math.max(0, 1 - est.t / 0.55)
        if (est.aberta <= 0) {
          est.fase = 'fechada'
          ponto.label = est.conhecida ? 'Entrar' : 'Bater na porta'
          pontoDentro.label = 'Abrir a porta'
        }
        break
      default: break
    }
    pivo.rotation.y = -est.aberta * 1.62      // abre pra DENTRO (-Z)
    postigo.position.x = PORTA.larg / 2 - est.corre * 0.26
    // o colisor do vao so empurra com a folha quase fechada
    colPorta.ativo = est.aberta < 0.35
  }

  return { atualizar, estado: est }
}

/** Engradado de garrafa: caixote de ripa com as garrafas so como silhueta. */
function engradado(cor) {
  const g = new THREE.Group()
  const mat = stdMat('adega-engr:' + cor, { map: woodTex(2, '#3a2412'), color: cor, roughness: 0.95 })
  const L = 0.40, A = 0.30, P = 0.30
  for (const s of [-1, 1]) {
    g.add(box(L, A, 0.022, mat, 0, A / 2, s * P / 2))
    g.add(box(0.022, A, P, mat, s * L / 2, A / 2, 0))
  }
  g.add(box(L, 0.020, P, mat, 0, 0.010, 0))
  // divisorias em cruz
  g.add(box(L - 0.04, A - 0.06, 0.014, mat, 0, A / 2, 0))
  g.add(box(0.014, A - 0.06, P - 0.04, mat, 0, A / 2, 0))
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

// ===========================================================================
// 3. O MIOLO
// ===========================================================================

function piso(g) {
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.piso)
  p.position.set((IN.x0 + IN.x1) / 2, 0.004, (IN.z0 + IN.z1) / 2)
  p.receiveShadow = true
  g.add(p)
  // RALO no meio do salao: e ele que diz que este chao e lavado com mangueira.
  const ralo = cyl(0.17, 0.17, 0.03, M.ferro, 14)
  ralo.position.set(21.4, 0.012, -43.0)
  g.add(ralo)
  const grade = new THREE.InstancedMesh(new THREE.BoxGeometry(0.017, 0.012, 0.29), M.ferrugem, 9)
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 9; i++) {
    d0.position.set(21.4 + (i / 8 - 0.5) * 0.28, 0.026, -43.0)
    d0.updateMatrix()
    grade.setMatrixAt(i, d0.matrix)
  }
  grade.instanceMatrix.needsUpdate = true
  g.add(grade)
  // rodape de cimento nas paredes: 20 cm, um tom mais escuro
  const rod = solid(0x3c3934, 0.95)
  g.add(box(IN.x1 - IN.x0, 0.20, 0.04, rod, (IN.x0 + IN.x1) / 2, 0.10, IN.z0 + 0.02))
  g.add(box(IN.x1 - IN.x0, 0.20, 0.04, rod, (IN.x0 + IN.x1) / 2, 0.10, IN.z1 - 0.02))
  g.add(box(0.04, 0.20, IN.z1 - IN.z0, rod, IN.x0 + 0.02, 0.10, (IN.z0 + IN.z1) / 2))
  g.add(box(0.04, 0.20, IN.z1 - IN.z0, rod, IN.x1 - 0.02, 0.10, (IN.z0 + IN.z1) / 2))
}

/** As quatro paredes por DENTRO: reboco descascado por cima do tijolo. */
function paredesInternas(g) {
  const w = IN.x1 - IN.x0, d = IN.z1 - IN.z0
  const cxm = (IN.x0 + IN.x1) / 2, czm = (IN.z0 + IN.z1) / 2
  const pn = plane(w, CEIL, M.parede, 0)
  pn.position.set(cxm, CEIL / 2, IN.z0 + 0.01)
  pn.receiveShadow = true
  g.add(pn)
  const ps = plane(w, CEIL, M.parede, 0)
  ps.rotation.y = Math.PI
  ps.position.set(cxm, CEIL / 2, IN.z1 - 0.01)
  ps.receiveShadow = true
  g.add(ps)
  const po = plane(d, CEIL, M.parede, 0)
  po.rotation.y = Math.PI / 2
  po.position.set(IN.x0 + 0.01, CEIL / 2, czm)
  po.receiveShadow = true
  g.add(po)
  const pl = plane(d, CEIL, M.parede, 0)
  pl.rotation.y = -Math.PI / 2
  pl.position.set(IN.x1 - 0.01, CEIL / 2, czm)
  pl.receiveShadow = true
  g.add(pl)
}

/**
 * FORRO E LUZ.
 *
 * O forro nao e forro: sao as vigas do piso de cima aparecendo, com a laje
 * escura entre elas. Um galpao com forro rebaixado nao tem cara de porao.
 *
 * As TRES luzes estao explicadas no cabecalho do arquivo. O que esta aqui e o
 * resto: os bulbos nus pendurados em fio torcido (emissivos, nao iluminam) e a
 * regua de bulbos sobre a estante.
 */
/**
 * @param g      o MIOLO (as luminarias moram nele e somem com ele)
 * @param raiz   a raiz da adega — e nela que as PointLight ficam
 * @param luzes  saida
 */
function forroELuz(g, raiz, luzes) {
  const w = IN.x1 - IN.x0, d = IN.z1 - IN.z0
  const cxm = (IN.x0 + IN.x1) / 2, czm = (IN.z0 + IN.z1) / 2
  const t = plane(w, d, M.forro, Math.PI / 2)
  t.position.set(cxm, CEIL, czm)
  g.add(t)
  // vigas de madeira a cada 1,4 m, correndo em X
  for (let z = IN.z0 + 0.9; z < IN.z1 - 0.5; z += 1.4) {
    const v = box(w, 0.22, 0.10, M.viga, cxm, CEIL - 0.11, z)
    v.castShadow = true
    g.add(v)
  }
  // duas vigas mestras em Z
  for (const x of [18.2, 25.4]) {
    g.add(box(0.16, 0.30, d, M.viga, x, CEIL - 0.16, czm))
  }
  // canos e fiacao aparente correndo no teto
  for (const z of [-40.2, -47.4]) {
    const c = cyl(0.035, 0.035, w - 0.4, M.ferrugem, 8)
    c.rotation.z = Math.PI / 2
    c.position.set(cxm, CEIL - 0.30, z)
    g.add(c)
  }

  /** Bulbo nu num fio: 3 malhas. Nao ilumina — marca o ponto. */
  function pendente(x, z, comp, mat, cupula) {
    const fio = cyl(0.006, 0.006, comp, solid(0x1a1a1c, 0.9), 5)
    fio.position.set(x, CEIL - comp / 2, z)
    g.add(fio)
    const b = sphere(0.055, mat, 10)
    b.position.set(x, CEIL - comp - 0.02, z)
    b.castShadow = false
    g.add(b)
    if (cupula) {
      const c = cyl(0.19, 0.08, 0.11, M.ferrugem, 12, true)
      c.position.set(x, CEIL - comp + 0.05, z)
      g.add(c)
    }
  }

  // sobre o balcao: tres cupulas de chapa
  for (const x of [17.6, 20.3, 23.0]) pendente(x, BALCAO.z + 0.55, 0.72, M.bulboQuente, true)
  // sobre as mesas do salao
  pendente(18.6, -40.4, 0.95, M.bulboQuente, true)
  pendente(24.4, -39.2, 0.95, M.bulboQuente, true)
  // no vestibulo: VERMELHA, e ela sozinha diz o que aquele comodo e
  pendente(27.6, -34.6, 0.60, M.bulboVermelho, false)
  // nos fundos, atras da tela: fria
  pendente(18.4, -49.2, 0.55, M.bulboFrio, true)
  pendente(24.6, -49.6, 0.55, M.bulboFrio, true)

  // regua de bulbos sobre a estante da parede sul (7 bulbos, 1 InstancedMesh)
  const reg = box(9.4, 0.06, 0.10, M.ferro, 19.9, CEIL - 0.34, -33.35)
  g.add(reg)
  const bulbos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.038, 8, 6), M.bulboQuente, 7)
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 7; i++) {
    d0.position.set(15.5 + i * 1.45, CEIL - 0.44, -33.35)
    d0.updateMatrix()
    bulbos.setMatrixAt(i, d0.matrix)
  }
  bulbos.instanceMatrix.needsUpdate = true
  bulbos.castShadow = false
  g.add(bulbos)

  // --- AS QUATRO DE VERDADE -------------------------------------------------
  //
  // A QUARTA foi paga com uma foto. O vestibulo e um comodo FECHADO de 4,5 x
  // 4,3 m, sem janela, sem vao pro salao a nao ser o cotovelo com cortina — e a
  // primeira coisa que o jogador ve depois de bater na porta. Com so o bulbo
  // vermelho emissivo ele saiu PRETO no render, e preto de verdade: nao dava pra
  // ver o banco, nem os cabides, nem a propria cortina que ele precisa achar.
  // Emissivo acende a si mesmo; ele nao devolve um lumen pra o que esta na
  // frente. E a mesma conta que ja tinha aprovado a lampada da casa velha.
  //
  // Ela e FRACA (10 contra 30 do balcao) e VERMELHA, e as duas coisas sao de
  // proposito: o vestibulo tem que continuar sendo um lugar em que o jogador
  // nao quer ficar.
  const L = [
    { x: 20.3, y: 2.58, z: BALCAO.z + 0.70, cor: 0xffc078, i: 30, dist: 11 },
    // z -36.2 e nao -39.6: a estante da parede sul e a peca que o lugar tem pra
    // MOSTRAR (e a vitrine da loja, cada fileira abre a janela de compra), e a
    // seis metros da luz mais proxima ela saia preta na foto. Daqui sao 2,5 m
    // ate a estante e 7,5 ate o balcao — e o balcao ja tem a luz dele.
    { x: 20.8, y: 2.55, z: -36.2, cor: 0xffb268, i: 26, dist: 12 },
    { x: 21.4, y: 2.45, z: -49.2, cor: 0x62e0b0, i: 15, dist: 9 },
    { x: 27.6, y: 2.62, z: -34.6, cor: 0xff6a4a, i: 10, dist: 6 },
  ]
  // ELAS FICAM NA RAIZ, E NAO NO MIOLO — e isto NAO e detalhe de arrumacao.
  //
  // O miolo inteiro some quando o jogador esta longe (ver o LOD la embaixo).
  // Se as luzes fossem filhas dele, sumiriam junto, e o three monta o programa
  // de shader de CADA material a partir da CONTAGEM DE LUZES VISIVEIS da cena:
  // quatro luzes entrando e saindo a cada vez que alguem passa na esquina
  // invalidaria todos os materiais do jogo e recompilaria a cena inteira no
  // meio do quadro. E exatamente a armadilha que render/luzes-efeito.js foi
  // escrito pra evitar, com as mesmas palavras.
  //
  // Na raiz elas ficam sempre acesas. Isso NAO custa: PointLight sem sombra
  // custa o laco por fragmento, que ja esta pago pela contagem; iluminar um
  // comodo fechado que ninguem ve nao acende pixel nenhum a mais.
  for (const l of L) {
    const p = new THREE.PointLight(l.cor, l.i, l.dist, 2)
    p.position.set(l.x, l.y, l.z)
    p.castShadow = false
    raiz.add(p)
    luzes.push(p)
  }
}

/** Os cotovelos do vestibulo + a cortina de tiras. */
function vestibulo(g, colliders) {
  // parede norte do vestibulo, com o VAO na quina noroeste
  parede(g, colliders, 'x', VEST.z0, VAO.x1, IN.x1, CEIL, 0.16)
  // parede oeste do vestibulo, inteira
  parede(g, colliders, 'z', VEST.x0, VEST.z0, IN.z1, CEIL, 0.16)

  // CORTINA DE TIRAS no vao. Sao 16 tiras de plastico leitoso, cada uma com uma
  // torcao propria — cortina de tiras todas retas le como grade.
  const cort = new THREE.Group()
  cort.userData.noBake = true
  const matT = stdMat('adega-cortina', {
    color: 0xcfc6ae, transparent: true, opacity: 0.72, roughness: 0.7, side: THREE.DoubleSide,
  })
  const nT = 16
  for (let i = 0; i < nT; i++) {
    const x = VAO.x0 + 0.06 + ((VAO.x1 - VAO.x0 - 0.12) * i) / (nT - 1)
    const tira = box(0.095, 1.95, 0.006, matT, x, 0.98, VEST.z0)
    tira.rotation.y = (Math.random() - 0.5) * 0.5
    tira.rotation.z = (Math.random() - 0.5) * 0.05
    tira.castShadow = false
    cort.add(tira)
  }
  cort.add(box(VAO.x1 - VAO.x0, 0.10, 0.08, M.ferro, (VAO.x0 + VAO.x1) / 2, 2.00, VEST.z0))
  g.add(cort)

  // A LAMPADA DE SAIDA, sobre o cotovelo.
  //
  // Ela existe porque o vao e um COTOVELO: quem esta no salao nao ve a porta, ve
  // uma parede com uma cortina. Verde e o unico sinal que nao precisa de letra
  // nenhuma pra ser lido como "e por aqui" — e numa casa destas ela e o que
  // parece: uma luminaria de emergencia surrupiada de outro lugar, com a caixa
  // amassada. Emissiva, entao nao encosta no orcamento de luzes.
  const meioVao = (VAO.x0 + VAO.x1) / 2
  const cxSaida = box(0.30, 0.14, 0.12, M.chapaPintada, meioVao, 2.20, VEST.z0)
  cxSaida.rotation.z = 0.03
  g.add(cxSaida)
  for (const dz of [-0.07, 0.07]) {
    const vidro = box(0.26, 0.10, 0.02, M.saidaVerde, meioVao, 2.20, VEST.z0 + dz)
    vidro.rotation.z = 0.03
    vidro.castShadow = false
    g.add(vidro)
  }

  // dentro do vestibulo: banco, cabides, quadro de avisos vazio
  const banco = box(1.05, 0.10, 0.34, M.madeiraVelha, 28.6, 0.46, -33.30)
  banco.castShadow = true
  g.add(banco)
  for (const s of [-1, 1]) g.add(box(0.08, 0.46, 0.30, M.ferro, 28.6 + s * 0.45, 0.23, -33.30))
  col(colliders, 28.0, 29.2, -33.55, -33.05, 'adega-banco')
  for (let i = 0; i < 4; i++) {
    const cab = cyl(0.012, 0.012, 0.09, M.ferro, 6)
    cab.rotation.x = Math.PI / 2
    cab.position.set(26.9 + i * 0.42, 1.75, IN.z1 - 0.06)
    g.add(cab)
  }
  // tapete de borracha na entrada, gasto
  const tap = plane(1.4, 0.9, M.borracha)
  tap.position.set(PORTA.x, 0.014, IN.z1 - 0.62)
  tap.receiveShadow = true
  g.add(tap)
}

/**
 * O BALCAO e a prateleira de tras.
 *
 * A prateleira de tras fica ENCOSTADA NA TELA DE ARAME, e essa vizinhanca e o
 * enquadramento do lugar: quem pede uma bebida ve a garrafa na prateleira e, um
 * palmo atras dela, o alambique. As duas coisas na mesma foto.
 */
function balcao(g, colliders, interactables) {
  const { x0, x1, z, d, h } = BALCAO
  const meio = (x0 + x1) / 2

  // corpo: tabua grossa por cima, ripado por baixo, e a barra de pe
  const tampo = box(x1 - x0 + 0.14, 0.075, d + 0.10, M.madeira, meio, h - 0.037, z)
  tampo.castShadow = true
  tampo.receiveShadow = true
  g.add(tampo)
  const corpo = box(x1 - x0, h - 0.075, d, M.madeiraVelha, meio, (h - 0.075) / 2, z)
  corpo.castShadow = true
  g.add(corpo)
  // ripas verticais na frente
  const ripas = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, h - 0.14, 0.02), M.madeira, 26)
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 26; i++) {
    d0.position.set(x0 + 0.12 + i * 0.31, (h - 0.14) / 2, z + d / 2 + 0.011)
    d0.updateMatrix()
    ripas.setMatrixAt(i, d0.matrix)
  }
  ripas.instanceMatrix.needsUpdate = true
  g.add(ripas)
  // barra de pe de latao
  const barra = cyl(0.022, 0.022, x1 - x0 + 0.10, solid(0xbe9a48, 0.5, 0.6), 10)
  barra.rotation.z = Math.PI / 2
  barra.position.set(meio, 0.20, z + d / 2 + 0.16)
  g.add(barra)
  for (const x of [x0 + 0.4, meio, x1 - 0.4]) {
    g.add(box(0.05, 0.22, 0.05, M.ferro, x, 0.11, z + d / 2 + 0.16))
  }
  col(colliders, x0 - 0.07, x1 + 0.07, z - d / 2 - 0.06, z + d / 2 + 0.22, 'adega-balcao')

  // o que fica em cima: pote de amendoim, cinzeiro, caderneta do fiado
  const pote = cyl(0.11, 0.10, 0.16, stdMat('adega-vidro-pote', {
    color: 0xdfe8ea, transparent: true, opacity: 0.30, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
  }), 14)
  pote.position.set(x0 + 0.9, h + 0.08, z + 0.12)
  g.add(pote)
  const amend = cyl(0.095, 0.095, 0.09, solid(0xa9793f, 0.95), 12)
  amend.position.set(x0 + 0.9, h + 0.05, z + 0.12)
  g.add(amend)
  const cinz = cyl(0.075, 0.062, 0.028, solid(0x4d4a45, 0.7), 12)
  cinz.position.set(x1 - 1.1, h + 0.014, z + 0.16)
  g.add(cinz)
  const cad = box(0.15, 0.012, 0.21, solid(0x8a3a2a, 0.9), x1 - 0.5, h + 0.006, z - 0.10)
  cad.rotation.y = 0.2
  g.add(cad)

  // --- prateleira de tras (a garrafeira), encostada na tela ------------------
  const px = meio, pz = TELA_Z + 0.34
  const larg = 6.6
  for (const y of [0.95, 1.45, 1.95]) {
    const pr = box(larg, 0.055, 0.30, M.madeira, px, y, pz)
    pr.castShadow = true
    pr.receiveShadow = true
    g.add(pr)
  }
  for (const s of [-1, 0, 1]) {
    g.add(box(0.07, 2.2, 0.30, M.madeiraVelha, px + s * (larg / 2 - 0.04), 1.10, pz))
  }
  // as garrafas EM EXPOSICAO: cada fileira e um item, e clicar nela abre a loja
  // JA NAQUELE ITEM (o mesmo desenho do mostruario da loja de jogos).
  const fileiras = [
    { id: 'pinga-alambique', nome: 'a pinga de alambique', build: () => garrafaPinga(false), y: 1.005, x: px - 2.6, n: 4, dx: 0.19 },
    { id: 'pinga-umburana', nome: 'a pinga de umburana', build: () => garrafaPinga(true), y: 1.005, x: px - 1.3, n: 3, dx: 0.20 },
    { id: 'gin-artesanal', nome: 'o gin', build: () => garrafaGin(), y: 1.005, x: px + 0.1, n: 3, dx: 0.20 },
    { id: 'whiskey-garrafa', nome: 'o whiskey', build: () => garrafaWhiskey(), y: 1.005, x: px + 1.4, n: 3, dx: 0.20 },
    { id: 'vodka-garrafa', nome: 'a vodka', build: () => garrafaVodka(), y: 1.005, x: px + 2.6, n: 3, dx: 0.20 },
    { id: 'garrafa-batizada', nome: 'as garrafas sem rotulo', build: () => garrafaBatizada(), y: 1.505, x: px - 2.5, n: 6, dx: 0.17 },
    { id: 'cerveja-long', nome: 'a long neck', build: () => garrafaLongNeck(), y: 1.505, x: px + 0.2, n: 6, dx: 0.16 },
    { id: 'cerveja-lata', nome: 'a lata', build: () => lataCerveja(), y: 1.505, x: px + 2.2, n: 5, dx: 0.14 },
  ]
  for (const f of fileiras) {
    let peca = null
    for (let i = 0; i < f.n; i++) {
      try { peca = f.build() } catch (err) { void err; peca = null }
      if (!peca) break
      peca.position.set(f.x + i * f.dx, f.y, pz + (i % 2) * 0.055 - 0.02)
      peca.rotation.y = (i * 1.7) % 6.28
      peca.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      g.add(peca)
    }
    interactables.push({
      id: 'adega-mostra-' + f.id,
      position: new THREE.Vector3(f.x + (f.n * f.dx) / 2, BASE + f.y + 0.16, pz + 0.9),
      radius: 1.15,
      label: 'Ver ' + f.nome,
      onInteract: (gm) => { if (gm.adega && gm.adega.abrir) gm.adega.abrir(f.id) },
    })
  }

  // Copos pendurados de boca pra baixo num trilho sobre o balcao: e o detalhe
  // que diz "aqui se serve", e sao os TRES que a casa vende.
  //
  // A 82 cm do tampo e NAO a 1 m: no primeiro render eles ficavam acima da linha
  // dos olhos e entravam na frente da camera de quem estava no balcao — quatro
  // borroes de vidro tapando a chopeira, que e a coisa que o balcao existe pra
  // mostrar. Aqui eles emolduram em vez de tapar.
  const trilho = box(1.7, 0.045, 0.055, M.ferro, x1 - 1.05, h + 0.86, z - 0.10)
  g.add(trilho)
  const modelos = [copoTulipa, copoAmericano, copoTulipa, canecaDeChope]
  for (let i = 0; i < 4; i++) {
    let c = null
    try { c = modelos[i]() } catch (err) { void err; c = null }
    if (!c) break
    c.position.set(x1 - 1.68 + i * 0.42, h + 0.82, z - 0.10)
    c.rotation.z = Math.PI          // de cabeca pra baixo, escorrendo
    c.rotation.y = i * 0.9
    c.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.add(c)
  }
}

/**
 * A TELA DE ARAME e o que fica atras dela: a operacao.
 *
 * Alambique de cobre com brasa embaixo, as bombonas de granel, a mesa de envase
 * com o funil e as garrafas vazias, a caixa de tampas e a balanca. Nenhuma
 * dessas pecas e interativa de proposito — o jogador NAO participa disso, ele
 * so ve. Ver e o que faz o resto do lugar significar alguma coisa.
 */
function fundos(g, colliders, animados) {
  // --- a tela ---------------------------------------------------------------
  const alt = CEIL - 0.05
  function panoDeTela(x0, x1) {
    const t = plane(x1 - x0, alt, M.telaDe(x1 - x0, alt), 0)
    t.position.set((x0 + x1) / 2, alt / 2, TELA_Z)
    t.castShadow = false
    g.add(t)
    // montantes tubulares a cada 2 m
    const passo = Math.max(0.6, Math.min(2.0, x1 - x0))
    for (let x = x0; x <= x1 + 0.01; x += passo) {
      const p = cyl(0.032, 0.032, alt, M.ferro, 8)
      p.position.set(Math.min(x, x1), alt / 2, TELA_Z)
      p.castShadow = true
      g.add(p)
    }
    g.add(box(x1 - x0, 0.05, 0.05, M.ferro, (x0 + x1) / 2, alt - 0.02, TELA_Z))
    // TRAVESSA DO MEIO. O arame sozinho quase some a tres metros (e assim tem
    // que ser: fio de 3 mm), e sem uma linha horizontal na altura do peito a
    // tela deixa de ser lida como cerca e o fundo vira "um comodo mais escuro".
    g.add(box(x1 - x0, 0.04, 0.04, M.ferro, (x0 + x1) / 2, 1.35, TELA_Z))
  }
  panoDeTela(IN.x0, TELA_VAO.x0)
  panoDeTela(TELA_VAO.x1, IN.x1)
  col(colliders, IN.x0, TELA_VAO.x0, TELA_Z - 0.06, TELA_Z + 0.06, 'adega-tela')
  col(colliders, TELA_VAO.x1, IN.x1, TELA_Z - 0.06, TELA_Z + 0.06, 'adega-tela')
  // portao da tela, escancarado (ninguem tranca o que ja esta escondido)
  const portao = new THREE.Group()
  const pano = plane(TELA_VAO.x1 - TELA_VAO.x0, alt - 0.2, M.telaDe(TELA_VAO.x1 - TELA_VAO.x0, alt - 0.2), 0)
  pano.position.set((TELA_VAO.x1 - TELA_VAO.x0) / 2, (alt - 0.2) / 2, 0)
  portao.add(pano)
  portao.add(box(TELA_VAO.x1 - TELA_VAO.x0, 0.04, 0.04, M.ferro, (TELA_VAO.x1 - TELA_VAO.x0) / 2, alt - 0.22, 0))
  portao.add(box(0.04, alt - 0.2, 0.04, M.ferro, 0.02, (alt - 0.2) / 2, 0))
  portao.position.set(TELA_VAO.x0, 0, TELA_Z)
  portao.rotation.y = -1.15
  g.add(portao)

  // --- alambique de cobre ---------------------------------------------------
  const al = new THREE.Group()
  // a caldeira mora num subgrupo levantado: ela senta EM CIMA da fornalha, e
  // com tudo no mesmo y as duas se atravessavam
  const cald = new THREE.Group()
  cald.position.y = 0.42
  al.add(cald)
  const panela = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.42, 0.02), new THREE.Vector2(0.50, 0.20),
    new THREE.Vector2(0.50, 0.62), new THREE.Vector2(0.40, 0.82), new THREE.Vector2(0.22, 0.96),
    new THREE.Vector2(0.10, 1.06), new THREE.Vector2(0.09, 1.20),
  ], 20), M.cobre)
  panela.castShadow = true
  cald.add(panela)
  // capitel (o chapeu) e o pescoco de cisne
  const chapeu = new THREE.Mesh(new THREE.SphereGeometry(0.20, 14, 10, 0, Math.PI * 2, 0, 1.3), M.cobre)
  chapeu.position.y = 1.22
  chapeu.castShadow = true
  cald.add(chapeu)
  const cisne = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.038, 8, 16, Math.PI * 0.9), M.cobre)
  cisne.rotation.set(Math.PI / 2, 0, -0.4)
  cisne.position.set(0.26, 1.30, 0)
  cald.add(cisne)
  // serpentina dentro do tonel de agua
  const tonel = cyl(0.36, 0.34, 0.85, M.madeiraVelha, 16)
  tonel.position.set(0.95, 0.42, 0)
  tonel.castShadow = true
  al.add(tonel)
  for (const y of [0.12, 0.72]) {
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.362, 0.016, 5, 18), M.ferro)
    aro.rotation.x = Math.PI / 2
    aro.position.set(0.95, y, 0)
    al.add(aro)
  }
  const saida = cyl(0.016, 0.016, 0.22, M.cobre, 8)
  saida.rotation.z = Math.PI / 2
  saida.position.set(1.36, 0.30, 0)
  al.add(saida)
  // FORNALHA: a boca com brasa. A brasa e emissiva e PISCA no update.
  const forn = box(1.10, 0.42, 0.90, solid(0x4a443c, 0.96), 0, 0.21, 0)
  forn.castShadow = true
  al.add(forn)
  const boca = box(0.46, 0.26, 0.06, solid(0x141210, 0.9), 0, 0.20, 0.46)
  al.add(boca)
  const brasa = box(0.38, 0.18, 0.03, M.brasa, 0, 0.19, 0.475)
  brasa.castShadow = false
  brasa.name = 'adega-brasa'
  al.add(brasa)
  // lenha de lado
  for (let i = 0; i < 5; i++) {
    const l = cyl(0.045, 0.05, 0.55, M.madeiraVelha, 6)
    l.rotation.set(Math.PI / 2, 0, 0.2 + i * 0.1)
    l.position.set(-0.85, 0.05 + (i % 3) * 0.09, 0.15 + (i % 2) * 0.12)
    al.add(l)
  }
  al.position.set(ALAMBIQUE.x, 0, ALAMBIQUE.z)
  g.add(al)
  col(colliders, ALAMBIQUE.x - 0.7, ALAMBIQUE.x + 1.5, ALAMBIQUE.z - 0.6, ALAMBIQUE.z + 0.6, 'adega-alambique')
  animados.brasa = brasa

  // --- bombonas e garrafoes de granel ---------------------------------------
  for (let i = 0; i < 6; i++) {
    const b = cyl(0.24, 0.26, 0.70, M.plasticoAzul, 12)
    b.position.set(20.4 + (i % 3) * 0.58, 0.35, -50.9 + Math.floor(i / 3) * 0.60)
    b.castShadow = true
    g.add(b)
    const t2 = cyl(0.07, 0.07, 0.06, M.plasticoBranco, 8)
    t2.position.set(b.position.x, 0.73, b.position.z)
    g.add(t2)
  }
  col(colliders, 20.0, 21.8, -51.3, -50.0, 'adega-bombona')
  for (let i = 0; i < 3; i++) {
    let gr = null
    try { gr = garrafaoDeVidro(i === 1 ? 0xd8c07a : 0xe8e2c8) } catch (err) { void err; gr = null }
    if (!gr) break
    gr.position.set(23.2 + i * 0.42, 0, -50.6)
    gr.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.add(gr)
  }

  // --- mesa de envase --------------------------------------------------------
  const mx = 25.6, mz = -48.6
  const mesa = box(2.20, 0.07, 0.85, M.inox, mx, 0.86, mz)
  mesa.castShadow = true
  mesa.receiveShadow = true
  g.add(mesa)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.05, 0.86, 0.05, M.ferro, mx + sx * 1.02, 0.43, mz + sz * 0.36))
  }
  col(colliders, mx - 1.15, mx + 1.15, mz - 0.48, mz + 0.48, 'adega-envase')
  // funil grande no meio + o balde embaixo
  const funil = cyl(0.19, 0.02, 0.24, M.plasticoBranco, 14, true)
  funil.position.set(mx - 0.55, 1.05, mz)
  g.add(funil)
  const tubo = cyl(0.018, 0.018, 0.16, M.plasticoBranco, 8)
  tubo.position.set(mx - 0.55, 0.86, mz)
  g.add(tubo)
  // garrafas vazias na mesa, sem rotulo
  for (let i = 0; i < 7; i++) {
    let gb = null
    try { gb = garrafaBatizada() } catch (err) { void err; gb = null }
    if (!gb) break
    gb.position.set(mx - 0.10 + (i % 4) * 0.19, 0.90, mz - 0.18 + Math.floor(i / 4) * 0.26)
    gb.rotation.y = i * 1.1
    gb.traverse((o) => { if (o.isMesh) o.castShadow = true })
    g.add(gb)
  }
  // caixa de tampas trocadas e a balanca
  const cxT = box(0.30, 0.12, 0.22, M.madeiraVelha, mx + 0.85, 0.93, mz - 0.20)
  g.add(cxT)
  const tampas = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.008, 10), solid(0x8f1f22, 0.6, 0.1), 22)
  const d1 = new THREE.Object3D()
  for (let i = 0; i < 22; i++) {
    d1.position.set(mx + 0.74 + (i % 7) * 0.037, 0.995 + Math.floor(i / 7) * 0.009, mz - 0.28 + Math.floor(i / 7) * 0.05)
    d1.rotation.set(0, i, 0)
    d1.updateMatrix()
    tampas.setMatrixAt(i, d1.matrix)
  }
  tampas.instanceMatrix.needsUpdate = true
  g.add(tampas)
  const bal = box(0.26, 0.09, 0.26, M.inox, mx + 0.30, 0.94, mz + 0.24)
  g.add(bal)
  const mostrador = cyl(0.11, 0.11, 0.03, M.plasticoBranco, 14)
  mostrador.rotation.x = Math.PI / 2
  mostrador.position.set(mx + 0.30, 1.10, mz + 0.24)
  g.add(mostrador)

  // --- engradados vazios empilhados no canto --------------------------------
  for (let i = 0; i < 9; i++) {
    const e = engradado(0x4f3218)
    e.position.set(15.4 + (i % 3) * 0.46, Math.floor(i / 3) * 0.31, -49.4 + (i % 2) * 0.05)
    e.rotation.y = (i % 3) * 0.05
    g.add(e)
  }
  col(colliders, 15.0, 16.9, -49.8, -49.0, 'adega-pilha')

  // --- barris de reserva, deitados no cavalete ------------------------------
  // (a chopeira do balcao tem os dois que estao ligados; estes sao os de tras)
  for (let i = 0; i < 3; i++) {
    const berc = box(0.34, 0.30, 0.62, M.madeiraVelha, 27.9, 0.15, -51.0 + i * 0.62)
    g.add(berc)
  }
  col(colliders, 27.4, 28.5, -51.4, -49.2, 'adega-barris')
}

/** As mesas do salao: tambores de 200 L com tampo redondo, e os banquinhos. */
function mobiliaSalao(g, colliders) {
  const MESAS = [
    { x: 18.6, z: -40.4 },
    { x: 24.4, z: -39.2 },
    { x: 17.4, z: -36.0 },
    { x: 26.0, z: -42.6 },
  ]
  const corTambor = [0x2f6fa8, 0x7a3a2a, 0x3c6b4a, 0x6a5a2a]
  MESAS.forEach((m, i) => {
    const t = cyl(0.29, 0.29, 0.86, solid(corTambor[i % 4], 0.86, 0.15), 16)
    t.position.set(m.x, 0.43, m.z)
    t.castShadow = true
    t.receiveShadow = true
    g.add(t)
    for (const y of [0.22, 0.62]) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.018, 5, 18), M.ferro)
      aro.rotation.x = Math.PI / 2
      aro.position.set(m.x, y, m.z)
      g.add(aro)
    }
    const tampo = cyl(0.44, 0.44, 0.05, M.madeira, 18)
    tampo.position.set(m.x, 0.885, m.z)
    tampo.castShadow = true
    tampo.receiveShadow = true
    g.add(tampo)
    col(colliders, m.x - 0.42, m.x + 0.42, m.z - 0.42, m.z + 0.42, 'adega-mesa')
    // cinzeiro e um copo esquecido
    const cz2 = cyl(0.065, 0.055, 0.024, solid(0x4d4a45, 0.7), 10)
    cz2.position.set(m.x + 0.12, 0.922, m.z - 0.08)
    g.add(cz2)
    if (i % 2 === 0) {
      let c = null
      try { c = copoAmericano() } catch (err) { void err; c = null }
      if (c) {
        if (c.userData && c.userData.setNivel) c.userData.setNivel(0.22, 0xd8901c, 0.1)
        c.position.set(m.x - 0.14, 0.91, m.z + 0.10)
        c.traverse((o) => { if (o.isMesh) o.castShadow = true })
        g.add(c)
      }
    }
    // dois banquinhos por mesa
    for (const s of [-1, 1]) {
      const bx = m.x + s * 0.78, bz = m.z + s * 0.20
      g.add(banquinho(bx, bz))
      col(colliders, bx - 0.20, bx + 0.20, bz - 0.20, bz + 0.20, 'adega-banquinho')
    }
  })

  // banquetas altas no balcao
  for (let i = 0; i < 5; i++) {
    const bx = BALCAO.x0 + 0.9 + i * 1.55
    const bz = BALCAO.z + BALCAO.d / 2 + 0.62
    g.add(banqueta(bx, bz))
    col(colliders, bx - 0.22, bx + 0.22, bz - 0.22, bz + 0.22, 'adega-banqueta')
  }

  // --- a parede sul: a ESTANTE de garrafas, do chao ao teto -----------------
  // (a "adega" propriamente dita. Ela e o fundo de toda foto tirada do balcao.)
  const ex0 = 15.0, ex1 = 24.8, ez = IN.z1 - 0.22
  for (const y of [0.55, 1.05, 1.55, 2.05, 2.55]) {
    const pr = box(ex1 - ex0, 0.05, 0.36, M.madeira, (ex0 + ex1) / 2, y, ez)
    pr.castShadow = true
    pr.receiveShadow = true
    g.add(pr)
  }
  for (let i = 0; i <= 6; i++) {
    const x = ex0 + ((ex1 - ex0) * i) / 6
    g.add(box(0.06, 2.75, 0.36, M.madeiraVelha, x, 1.38, ez))
  }
  // GARRAFAS DEITADAS nas duas prateleiras de baixo (adega de verdade guarda
  // deitado). Duas coisas que a primeira versao errou e valem escritas:
  //
  //   - o TRONCO DE CONE, e nao o cilindro. Um cilindro deitado de 3,8 cm de
  //     raio le como VARETA na prateleira; o que diz "garrafa" e o gargalo, e um
  //     cone de 1,6 pra 4,2 cm da o gargalo de graca, na mesma malha;
  //   - o PASSO DE 11 cm, e nao de 31. Adega guarda garrafa ENCOSTADA uma na
  //     outra: com 31 cm de vao entre elas a prateleira parecia saqueada.
  //
  // 176 instancias, uma malha so.
  const PASSO = 0.112
  const porFila = Math.floor((ex1 - ex0 - 0.5) / PASSO)
  const deitada = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.016, 0.042, 0.30, 8), M.vidroGarrafa, porFila * 2,
  )
  const d2 = new THREE.Object3D()
  let k = 0
  for (const y of [0.615, 1.115]) {
    for (let i = 0; i < porFila; i++) {
      d2.position.set(ex0 + 0.26 + i * PASSO, y, ez - 0.03)
      // gargalo pra fora (a garrafa entra de fundo na prateleira)
      d2.rotation.set(-Math.PI / 2, 0, (i % 5) * 0.02)
      d2.updateMatrix()
      deitada.setMatrixAt(k++, d2.matrix)
    }
  }
  deitada.instanceMatrix.needsUpdate = true
  deitada.castShadow = true
  g.add(deitada)
  // as de cima, em pe: pinga, gin e long neck alternando
  // AS DE CIMA, EM PE: dezesseis modelos DE VERDADE na frente e quarenta
  // silhuetas atras, em duas InstancedMesh.
  //
  // A conta e simples e vale escrita. Uma garrafa detalhada custa 8 malhas; pra
  // encher duas prateleiras de 9,5 m ombro a ombro seriam ~52 garrafas, ou seja
  // 416 malhas so nesta parede. Mas garrafa do FUNDO DA PRATELEIRA e silhueta:
  // ninguem le o gargalo de uma que esta atras de outra. Entao as da frente sao
  // modelos e as de tras sao um torno de 7 pontos repetido — duas malhas no
  // total, e a prateleira aparece CHEIA, que e o que uma adega tem que estar.
  const emPe = [garrafaPinga, garrafaGin, garrafaLongNeck]
  for (let i = 0; i < 16; i++) {
    let p = null
    try { p = i % 3 === 0 ? emPe[0](i % 2 === 0) : emPe[i % 3]() } catch (err) { void err; p = null }
    if (!p) break
    p.position.set(ex0 + 0.42 + (i % 8) * 1.18, i < 8 ? 1.60 : 2.10, ez - 0.06)
    p.rotation.y = i * 0.8
    p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    g.add(p)
  }
  const geoSilhueta = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.036, 0), new THREE.Vector2(0.038, 0.010),
    new THREE.Vector2(0.038, 0.150), new THREE.Vector2(0.024, 0.196),
    new THREE.Vector2(0.013, 0.222), new THREE.Vector2(0.013, 0.290), new THREE.Vector2(0, 0.292),
  ], 10)
  for (const [mat, desloc] of [[M.vidroGarrafa, 0], [M.vidroAmbar, 0.14]]) {
    const im = new THREE.InstancedMesh(geoSilhueta, mat, 20)
    const d4 = new THREE.Object3D()
    for (let i = 0; i < 20; i++) {
      d4.position.set(ex0 + 0.34 + desloc + (i % 10) * 0.94, i < 10 ? 1.605 : 2.105, ez + 0.09)
      d4.rotation.set(0, i * 1.3, 0)
      d4.updateMatrix()
      im.setMatrixAt(i, d4.matrix)
    }
    im.instanceMatrix.needsUpdate = true
    im.castShadow = true
    g.add(im)
  }
  // O VAO DE BAIXO (do chao ate a primeira prateleira) e o de CIMA nasceram
  // vazios, e vao vazio numa estante de 9,8 m le como estante em montagem. O
  // que uma adega poe embaixo e engradado; em cima, caixa que ninguem abre.
  for (let i = 0; i < 14; i++) {
    const e = engradado(i % 2 ? 0x4f3218 : 0x5c3a1e)
    e.position.set(ex0 + 0.34 + (i % 7) * 1.38, Math.floor(i / 7) * 0.31, ez - 0.02)
    e.rotation.y = (i % 3) * 0.04
    g.add(e)
  }
  for (let i = 0; i < 6; i++) {
    const cx2 = box(0.52, 0.36, 0.30, M.madeiraVelha, ex0 + 0.7 + i * 1.7, 2.76, ez - 0.02)
    cx2.rotation.y = (i % 2) * 0.05
    cx2.castShadow = true
    g.add(cx2)
  }
  col(colliders, ex0 - 0.1, ex1 + 0.1, ez - 0.25, IN.z1, 'adega-estante')
}

/**
 * O QUE ENCOSTA NAS PAREDES.
 *
 * O salao tem 15 x 11 m e as duas paredes compridas nasceram peladas: o render
 * mostrou dois paredoes de reboco de onze metros com nada entre o chao e o
 * forro, e um galpao vazio nao le como bar clandestino — le como galpao vazio.
 *
 * O que entra e o que um lugar destes teria de verdade, e nada e enfeite:
 * a ARCA de gelo (a cerveja de garrafa nao fica na prateleira), a pilha de
 * PALETE com engradado (o estoque que nao coube atras da tela), o ARMARIO de
 * chapa (onde fica o que nao pode ser visto), o VENTILADOR de parede (nao ha
 * janela nenhuma no predio) e a LOUSA de preco escrita a giz — escrita em
 * FORMA, sem uma letra, pela mesma regra de bebidas.js.
 */
function paredesVivas(g, colliders) {
  // --- oeste: arca de gelo + engradados em cima ----------------------------
  const ax = IN.x0 + 0.62, az = -40.2
  const arca = box(1.70, 0.86, 0.78, solid(0xcdc8bc, 0.62, 0.05), ax, 0.43, az)
  arca.castShadow = true
  arca.receiveShadow = true
  g.add(arca)
  g.add(box(1.74, 0.07, 0.82, solid(0xb4aea1, 0.55, 0.08), ax, 0.885, az))
  g.add(box(1.60, 0.10, 0.06, M.ferro, ax, 0.60, az + 0.40))   // puxador
  // o motor e a grelha do lado
  g.add(box(0.30, 0.34, 0.72, M.chapaPintada, ax + 0.98, 0.30, az))
  col(colliders, ax - 0.95, ax + 1.18, az - 0.45, az + 0.45, 'adega-arca')
  for (let i = 0; i < 3; i++) {
    const e = engradado(0x4f3218)
    e.position.set(ax - 0.55 + (i % 2) * 0.46, 0.92 + Math.floor(i / 2) * 0.31, az)
    e.rotation.y = 0.04 * i
    g.add(e)
  }

  // --- oeste, mais ao sul: palete com pilha ---------------------------------
  const px = IN.x0 + 0.75, pz = -35.6
  for (const dz of [-0.42, 0, 0.42]) {
    g.add(box(1.10, 0.09, 0.14, M.madeiraVelha, px, 0.045, pz + dz))
  }
  g.add(box(1.10, 0.03, 1.00, M.madeiraVelha, px, 0.105, pz))
  for (let i = 0; i < 6; i++) {
    const e = engradado(0x5c3a1e)
    e.position.set(px - 0.24 + (i % 2) * 0.44, 0.12 + Math.floor(i / 2) * 0.31, pz)
    e.rotation.y = 0.05 * i
    g.add(e)
  }
  col(colliders, px - 0.62, px + 0.62, pz - 0.58, pz + 0.58, 'adega-palete')

  // --- leste: armario de chapa ---------------------------------------------
  const mx = IN.x1 - 0.42, mz = -41.4
  const arm = box(0.72, 1.92, 0.52, M.chapaPintada, mx, 0.96, mz)
  arm.castShadow = true
  g.add(arm)
  for (const s2 of [-1, 1]) {
    g.add(box(0.02, 1.80, 0.06, M.ferro, mx - 0.36 + 0.02, 0.98, mz + s2 * 0.18))
  }
  g.add(box(0.06, 0.10, 0.04, M.ferro, mx - 0.37, 1.05, mz - 0.16))
  // as tres frestas de ventilacao no alto da porta
  for (let i = 0; i < 3; i++) {
    g.add(box(0.02, 0.018, 0.30, solid(0x14161a, 0.9), mx - 0.365, 1.70 + i * 0.055, mz))
  }
  col(colliders, mx - 0.42, mx + 0.42, mz - 0.32, mz + 0.32, 'adega-armario')

  // --- leste: ventilador de parede (nao ha janela no predio) ---------------
  const vx = IN.x1 - 0.16, vz = -38.4
  g.add(box(0.16, 0.16, 0.16, M.ferro, vx, 2.30, vz))
  const gaiola = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 20), M.ferro)
  gaiola.rotation.y = Math.PI / 2
  gaiola.position.set(vx - 0.22, 2.30, vz)
  g.add(gaiola)
  const helice = new THREE.Group()
  helice.userData.noBake = true
  for (let i = 0; i < 3; i++) {
    const pa = box(0.02, 0.20, 0.09, solid(0x8b8f94, 0.6, 0.3), 0, 0.10, 0)
    pa.rotation.x = 0.4
    const eixo = new THREE.Group()
    eixo.rotation.x = (i / 3) * Math.PI * 2
    eixo.add(pa)
    helice.add(eixo)
  }
  helice.rotation.z = Math.PI / 2
  helice.position.set(vx - 0.20, 2.30, vz)
  g.add(helice)

  // --- a LOUSA do preco, do lado do balcao ---------------------------------
  // Sem uma letra: sao riscos de giz. Ver a regra em mobilia/bebidas.js.
  const lx = IN.x1 - 0.14, lz = -43.6
  const lousa = box(0.05, 1.05, 1.35, solid(0x1d2320, 0.96), lx, 1.62, lz)
  lousa.castShadow = true
  g.add(lousa)
  for (const s2 of [-1, 1]) g.add(box(0.06, 1.13, 0.05, M.madeiraVelha, lx - 0.01, 1.62, lz + s2 * 0.675))
  const giz = solid(0xd6d1c2, 0.99)
  const riscos = new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.022, 0.26), giz, 14)
  const d3 = new THREE.Object3D()
  for (let i = 0; i < 14; i++) {
    const linha = Math.floor(i / 2)
    const curto = i % 2 === 1
    d3.position.set(lx - 0.03, 2.02 - linha * 0.13, lz + (curto ? 0.34 : -0.22))
    d3.scale.set(1, 1, curto ? 0.5 : 1 + (i % 3) * 0.22)
    d3.updateMatrix()
    riscos.setMatrixAt(i, d3.matrix)
  }
  riscos.instanceMatrix.needsUpdate = true
  riscos.castShadow = false
  g.add(riscos)

  return { helice }
}

function banquinho(x, z) {
  const g = new THREE.Group()
  const t = cyl(0.17, 0.16, 0.045, M.madeira, 12)
  t.position.y = 0.44
  t.castShadow = true
  g.add(t)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const p = cyl(0.018, 0.022, 0.44, M.madeiraVelha, 6)
    p.position.set(Math.cos(a) * 0.11, 0.22, Math.sin(a) * 0.11)
    p.rotation.set(Math.cos(a) * 0.08, 0, -Math.sin(a) * 0.08)
    p.castShadow = true
    g.add(p)
  }
  g.position.set(x, 0, z)
  return g
}

function banqueta(x, z) {
  const g = new THREE.Group()
  const assento = cyl(0.18, 0.18, 0.06, M.feltro, 14)
  assento.position.y = 0.72
  assento.castShadow = true
  g.add(assento)
  const col2 = cyl(0.035, 0.045, 0.70, M.ferro, 10)
  col2.position.y = 0.36
  col2.castShadow = true
  g.add(col2)
  const base = cyl(0.19, 0.20, 0.03, M.ferro, 14)
  base.position.y = 0.015
  g.add(base)
  const apoio = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.014, 5, 16), M.ferro)
  apoio.rotation.x = Math.PI / 2
  apoio.position.y = 0.22
  g.add(apoio)
  g.position.set(x, 0, z)
  return g
}

/**
 * O DONO. Fica atras do balcao, do lado da chopeira, e olha pra quem chega.
 *
 * Ele nao tem nome de placa em lugar nenhum — nao ha placa em lugar nenhum. O
 * nome so aparece no rotulo do ponto de interacao e nas falas da loja.
 */
function criarDono(g, colliders) {
  let npc = null
  try {
    npc = createNPC({
      name: 'Dico',
      pose: 'work',
      x: DONO.x, y: 0, z: DONO.z,
      // rotY 0 e nao PI: no contrato deste jogo o +Z E A FRENTE do personagem
      // (ver ARCHITECTURE.md), entao girar meia-volta poe o dono de costas pro
      // salao — foi o que a primeira foto mostrou, a nuca dele atras do balcao.
      rotY: 0,
      shirt: 0xd9d2c0,
      pants: 0x2a2d33,
      shoes: 0x17191d,
      appearance: {
        // corCabelo 4 e corBarba 6: grisalho e sal-e-pimenta. O 8 que estava
        // aqui e "azul tinta" no catalogo de nucleo.js, e o dono da adega
        // apareceu no render de cabelo azul.
        cabeca: 1, olhos: 2, nariz: 1, boca: 1, barba: 2,
        // pele 6 e cabelo castanho: com pele 4 e cabelo grisalho ele saiu
        // BRANCO na foto — sob a luz do balcao virava um vulto palido atras do
        // balcao em vez de uma pessoa.
        cabelo: 1, pele: 6, corCabelo: 1, corBarba: 6, sobrancelha: 0,
        chapeu: 0, calcado: 2, blusa: 1, calca: 2,
      },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

  // avental de couro por cima da roupa e o pano no ombro: o uniforme de quem
  // tira chope o dia inteiro
  const avental = new THREE.Group()
  avental.add(box(0.42, 0.52, 0.24, solid(0x4a3122, 0.92), 0, 1.02, 0.02))
  avental.add(box(0.30, 0.16, 0.23, solid(0x3a2519, 0.92), 0, 0.80, 0.03))
  avental.add(box(0.44, 0.04, 0.25, solid(0x2a1c12, 0.9), 0, 1.26, 0.02))
  const pano = box(0.13, 0.26, 0.05, solid(0xcfc6ae, 0.96), 0.20, 1.30, -0.02)
  pano.rotation.z = 0.25
  avental.add(pano)
  root.add(avental)

  g.add(root)
  if (npc.character && npc.character.parts) congelarPersonagem(root, { juntas: npc.character.parts })
  col(colliders, DONO.x - 0.3, DONO.x + 0.3, DONO.z - 0.3, DONO.z + 0.3, 'adega-dono')
  return npc
}

// ===========================================================================
// O MONTADOR
// ===========================================================================

const _bico = new THREE.Vector3()
const _dirCam = new THREE.Vector3()
const _paraBico = new THREE.Vector3()

export function buildAdega(game) {
  const group = new THREE.Group()
  group.name = 'adega-100'
  // DOIS GRUPOS, e o motivo e o unico numero que importa neste arquivo depois
  // da luz: DRAW CALLS.
  //
  // Este predio e uma CAIXA FECHADA — nao ha vitrine, nao ha janela no terreo,
  // a porta de rua e uma chapa soldada. Ou seja: de fora ninguem ve o miolo,
  // nunca. Mas o three nao tem oclusao, so frustum: parado no cruzamento
  // central, a 45 m daqui, o jogador desenhava as 309 malhas de dentro da adega
  // atras de uma parede de concreto — 318 draw calls do lado errado do reboco,
  // e o teste de fumaca (teto de 1200) pegou isso na hora.
  //
  // Entao a casca e o miolo sao grupos separados, o miolo some por distancia, e
  // cada um vai pro forno SOZINHO. Assar o `group` inteiro nao serviria: o forno
  // reparenteia o que sobra na raiz que recebeu e dissolve os grupos do meio —
  // `miolo.visible = false` deixaria de esconder qualquer coisa. E o mesmo
  // desenho (e o mesmo comentario) do saguao do hotel.
  const casaco = new THREE.Group()
  casaco.name = 'adega-casca'
  const miolo = new THREE.Group()
  miolo.name = 'adega-miolo'
  group.add(casaco, miolo)

  const colliders = []
  const interactables = []
  const occluders = []
  const luzes = []
  const animados = {}

  casca(casaco, colliders, occluders)
  piso(miolo)
  paredesInternas(miolo)
  forroELuz(miolo, group, luzes)
  vestibulo(miolo, colliders)
  balcao(miolo, colliders, interactables)
  fundos(miolo, colliders, animados)
  mobiliaSalao(miolo, colliders)
  const vivas = paredesVivas(miolo, colliders)
  animados.helice = vivas && vivas.helice

  // --- A CHOPEIRA -----------------------------------------------------------
  // Duas torneiras e nao uma: com uma so, "abrir a torneira" e um botao; com
  // duas, o jogador ESCOLHE, e escolher e o que transforma o gesto em decisao.
  const chop = criarChopeira({
    // 1.45 e nao 2.30: com as duas torneiras a 1,70 m uma da outra elas paravam
    // de ser uma CHOPEIRA e viravam duas torneiras avulsas no balcao. A 1 m,
    // olhando pra uma o jogador ve a outra, e a escolha fica na mesma imagem.
    larg: 1.45,
    alturaBalcao: BALCAO.h,
    torneiras: [
      { nome: 'Chope claro', cor: 0xe0a02c, knob: 0x2f1d12, madeira: 0xc2a37c, espuma: 0.55 },
      { nome: 'Chope escuro', cor: 0x6a2f10, knob: 0x1a1410, madeira: 0x8a6a48, espuma: 0.70 },
    ],
  })
  // z = -44.35 nao e gosto: e 25 cm atras da borda da frente do balcao
  // (-44.125). Com o bico ai, o jogador colado no balcao fica a 60 cm dele — e
  // 60 cm cai DENTRO da faixa em que player/copo.js poe o copo esticado
  // (0,40 a 0,78 m da lente). Mais pra tras e o copo nao alcanca o jorro.
  chop.grupo.position.set(21.9, 0, -44.35)
  chop.grupo.userData.noBake = true          // as alavancas giram e o jorro corre
  miolo.add(chop.grupo)
  // (o colisor do balcao ja cobre os barris: eles ficam em cima dele)

  const CHOPE = [
    { cor: 0xe8ad3a, espuma: 0.55, nome: 'chope claro' },
    { cor: 0x7a3a14, espuma: 0.72, nome: 'chope escuro' },
  ]

  chop.torneiras.forEach((t, i) => {
    const p = t.bicoMundo(new THREE.Vector3())
    interactables.push({
      id: 'adega-torneira-' + i,
      // do lado do CLIENTE do balcao: o ponto fica na frente do bico
      position: new THREE.Vector3(p.x, BASE + BALCAO.h + 0.34, BALCAO.z + BALCAO.d / 2 + 0.30),
      radius: 1.35,
      label: 'Abrir ' + t.nome.toLowerCase(),
      onInteract: (gm) => {
        const abriu = t.alternar()
        const alvo = gm.interaction && gm.interaction.items.find((x) => x.id === 'adega-torneira-' + i)
        if (alvo) alvo.label = (abriu ? 'Fechar ' : 'Abrir ') + t.nome.toLowerCase()
        if (gm.toast) {
          gm.toast(abriu
            ? (gm.copo && gm.copo.segurando
              ? 'Torneira aberta. Segure o copo embaixo (botao esquerdo).'
              : 'Torneira aberta. Falta o copo — o Dico vende tres tipos.')
            : 'Torneira fechada.')
        }
      },
    })
  })

  // --- o dono e o ponto de compra -------------------------------------------
  const npc = criarDono(miolo, colliders)
  interactables.push({
    id: 'adega-balcao',
    position: new THREE.Vector3(DONO.x, BASE + 1.05, BALCAO.z + BALCAO.d / 2 + 0.55),
    radius: 2.3,
    label: 'Falar com o Dico',
    onInteract: (gm) => {
      if (gm.adega && typeof gm.adega.abrir === 'function') gm.adega.abrir()
      else gm.toast('Dico: aqui nao tem nota, nao tem placa e nao tem pergunta.')
    },
  })

  // --- a porta do beco (depois de tudo: ela usa game.collision) -------------
  const porta = portaDoBeco(casaco, colliders, interactables, game)

  group.position.y = BASE

  // --- O FORNO, um grupo de cada vez (ver o comentario dos dois grupos) -----
  group.updateMatrixWorld(true)
  console.info('adega casca:', bakeStatic(casaco))
  console.info('adega miolo:', bakeStatic(miolo))

  // ---- animacao -------------------------------------------------------------
  let t = 0
  let lookObj = null
  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  // LOD DO MIOLO. Cinco metros de folga em volta do lote, e nao cinquenta como
  // o hotel: la a porta e de VIDRO e o saguao aparece da calcada inteira; aqui a
  // unica fresta por onde o interior existe pra quem esta de fora e a porta do
  // beco aberta, a um metro da parede.
  const LOD = { x0: B.x0 - 5, x1: B.x1 + 5, z0: B.z0 - 5, z1: B.z1 + 5 }

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    t += d
    const pos = gm && gm.player && gm.player.position
    if (pos) {
      const perto = pos.x > LOD.x0 && pos.x < LOD.x1 && pos.z > LOD.z0 && pos.z < LOD.z1
      if (miolo.visible !== perto) miolo.visible = perto
    }
    chop.atualizar(d)
    porta.atualizar(d, gm)

    // a brasa da fornalha respira (duas senoides fora de fase: fogo nao pulsa
    // em cadencia unica, e uma senoide so le como LED piscando)
    if (animados.brasa) {
      const m = animados.brasa.material
      m.emissiveIntensity = 2.0 + Math.sin(t * 3.1) * 0.35 + Math.sin(t * 7.7) * 0.18
    }
    // o ventilador de parede: devagar e sem oscilar. Um comodo sem janela com o
    // ventilador PARADO le como comodo abandonado.
    if (animados.helice) animados.helice.rotation.x += d * 7.5

    // --- O COPO EMBAIXO DA TORNEIRA -----------------------------------------
    //
    // Tres condicoes, e nenhuma e dispensavel: a torneira tem que estar
    // JORRANDO (nao so aberta — a coluna leva 140 ms pra chegar embaixo), o
    // jogador tem que estar PERTO e tem que estar OLHANDO pro bico. A terceira e
    // a que impede o copo de encher sozinho enquanto o jogador olha pra outro
    // lado com a mao esticada.
    const copo = gm && gm.copo
    const pl = gm && gm.player && gm.player.position
    let mirando = null
    if (copo && copo.segurando && pl) {
      const cam = gm.camera
      if (cam) cam.getWorldDirection(_dirCam)
      for (let i = 0; i < chop.torneiras.length; i++) {
        const tor = chop.torneiras[i]
        if (!tor.jorrando) continue
        tor.bicoMundo(_bico)
        const dx = _bico.x - pl.x, dz = _bico.z - pl.z
        if (dx * dx + dz * dz > 2.4 * 2.4) continue
        if (cam) {
          _paraBico.copy(_bico).sub(cam.position).normalize()
          if (_paraBico.dot(_dirCam) < 0.82) continue
        }
        mirando = { ponto: _bico, ficha: CHOPE[i] || CHOPE[0], tor }
        break
      }
    }
    // o CORTE da coluna e por torneira e e refeito todo quadro: tirar o copo
    // debaixo tem que devolver o jorro pra bandeja no mesmo instante
    for (let i = 0; i < chop.torneiras.length; i++) chop.torneiras[i].cortar(false)
    if (copo && copo.segurando) {
      if (mirando) {
        copo.mirar(mirando.ponto)
        if (copo.estendido) {
          copo.encher(d, mirando.ficha.cor, mirando.ficha.espuma, mirando.ficha.nome)
          if (mirando.tor) mirando.tor.cortar(true)
        }
      } else {
        copo.mirar(null)
      }
    }

    // --- o dono olha pra quem chega -----------------------------------------
    if (npc) {
      if (pl) {
        const dx = pl.x - DONO.x, dz = pl.z - DONO.z
        if (dx * dx + dz * dz < 49) {
          const alvo = alvoDoOlhar(gm)
          if (alvo) npc.lookTarget = alvo
        } else if (npc.lookTarget) npc.lookTarget = null
      }
      if (typeof npc.update === 'function') npc.update(d)
    }
  }

  return {
    group, casca: casaco, miolo, colliders, interactables, occluders, update,
    chopeira: chop, porta, luzes,
    /** Pro teste e pra depuracao: abre/fecha uma torneira de fora. */
    torneira(i, v) {
      const tor = chop.torneiras[i]
      if (!tor) return false
      if (v === undefined) return tor.alternar()
      return v ? tor.abrir() : tor.fechar()
    },
  }
}

export default buildAdega
