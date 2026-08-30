import * as THREE from 'three'
import { CORTICO, interiorOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import {
  solid, stdMat, box, cyl, sphere, plane, tex, textPlaneMat,
  brickTex, concreteTex, woodTex,
} from './materials.js'
import { bakeStatic } from './bake.js'
import { createNPC } from '../npc/npc.js'
import { criarFumaca } from '../render/fumaca.js'
import { bater as somBater, porta as somPorta, DURACAO_BATIDA } from '../audio/som.js'
import { garrafaLongNeck, garrafaBatizada } from '../mobilia/destilados.js'
import { lataCerveja, garrafaWhiskey } from '../mobilia/bebidas.js'

// ---------------------------------------------------------------------------
// world/cortico.js — O 117. O predio de tres andares onde mora quem mora perto.
//
// O pedido: "algo parecido com a estrutura daqueles lugares em filme de acao
// onde varias pessoas moram proximas a outras e tem um espaco que tem somente
// portas, como corredores com portas, e cada pessoa mora em um local desses".
// Isso e um CORTICO (nos EUA, o tenement de escada externa; aqui, o predio de
// quitinete), e a forma dele nao e decoracao: e a planta.
//
//   corredor unico no meio, portas dos dois lados, escada numa ponta.
//
// Tres andares iguais empilhados, e o que muda de um pro outro e so quem mora
// atras de qual porta. E por isso que o lugar da a sensacao que o dono descreveu
// — cada porta e uma vida, e sao doze portas.
//
// ===========================================================================
// A COISA NOVA DESTE ARQUIVO: O JOGO PASSOU A TER ANDAR
// ===========================================================================
//
// Ate aqui todo interior do Mini City RP era TERREO. A altura do chao e uma
// funcao `groundY(x, z)`, uma cota por metro quadrado — e duas cotas no mesmo
// x,z simplesmente nao cabem nela. Foi preciso construir duas pecas:
//
//   1. `systems/pisos.js` — o CHAO. Ele guarda lajes e rampas com altura, e
//      responde pela terceira entrada que faltava: em que altura o jogador ja
//      esta. O cabecalho de la explica o resto.
//
//   2. A COLISAO POR ANDAR, que mora aqui. `systems/collision.js` e uma grade
//      XZ sem altura: uma parede do segundo andar bloqueia quem esta no terreo.
//      A saida e o campo `ativo` que a casa velha ja usava na porta dela — cada
//      colisor deste predio nasce com o numero do andar dele, e a cada troca de
//      andar do jogador so o conjunto daquele andar fica ligado.
//
//      Isso tambem quer dizer que os TRES ANDARES SAO GEOMETRIA SEPARADA (nao
//      uma planta repetida tres vezes), o que sai de graca: quem esta no 2o nao
//      ve o terreo, entao os outros dois somem por LOD e o predio inteiro custa
//      um andar.
//
//   3. AS ESCADAS SAO RAMPAS pro pe e degraus pro olho. O controller cancela o
//      avanco quando o piso sobe mais que 45 cm num quadro; escada de degrau de
//      verdade so seria subivel aos trancos.
//
// ===========================================================================
// O QUE O LUGAR CONTA
// ===========================================================================
//
// "algo que remeta um pouco ate a criminalidade". Nada aqui e dito com letra:
// e a caixa de correio arrombada, a fiacao puxada por fora, a lampada que pisca
// no corredor, o saco de lixo que ninguem desce, o risco de giz do lado das
// portas, a porta com marca de pe na altura da fechadura. O apartamento entra
// nisso um degrau acima — mesa de centro com o que se ve na mesa de centro.
//
// DUAS PORTAS ABREM (1o e 2o andar). O resto e porta e mais nada, e isso e de
// proposito: doze portas fechadas e um corredor; duas abertas e um corredor com
// doze vidas atras dele.
// ---------------------------------------------------------------------------

const B = CORTICO
const IN = interiorOf(B)                  // x 32.3..46.8 / z -47.7..-33.3
const BASE = LEVELS.SHOP_FLOOR            // 0.16
const ANDAR = 3.00                        // piso a piso
const PE = 2.72                           // pe-direito util (28 cm de laje)
const NIVEIS = [0, ANDAR, ANDAR * 2]      // y LOCAL de cada piso

// --- a planta, em numeros ----------------------------------------------------

// O CORREDOR, no meio, correndo em X. 2,2 m: da pra duas pessoas se cruzarem
// de lado e nao da pra passar sem encostar. Corredor de cortico e estreito.
const COR = { z0: -43.00, z1: -40.80 }

// O SAGUAO: da porta da rua ate o corredor. Fica no meio da fachada.
const SAG = { x0: 37.60, x1: 41.40 }

// A CAIXA DA ESCADA, em U com patamar intermediario. Duas rampas de 1,15 m
// separadas por uma parede de 30 cm — e essa parede que impede o jogador de
// atravessar de um lance pro outro no meio da subida, onde as duas alturas
// diferem em mais de um metro.
const ESC = {
  x0: 41.90, x1: 44.50,
  laneW: [41.90, 43.05],
  miolo: [43.05, 43.35],
  laneE: [43.35, 44.50],
  zPatamar: -46.90,      // do fundo (IN.z0) ate aqui e patamar
  zBoca: -43.00,         // onde a escada encontra o corredor
}

// OS DOIS APARTAMENTOS QUE ABREM. Ficam em andares diferentes E em cantos
// diferentes: o jogador tem que atravessar o predio pra achar o segundo, que e
// a unica maneira de ele conhecer o corredor inteiro.
const APTOS = [
  {
    id: 'a', andar: 1, numero: '12',
    x0: 32.30, x1: 38.20, z0: COR.z1, z1: IN.z1,   // sudoeste do 1o andar
    // 36.90 e nao 35.10: a porta tem que cair na FAIXA VAZIA da sala. Com ela
    // no meio, o jogador entrava e batia na mesa de centro no primeiro passo —
    // a sala inteira ficava do lado de dentro de uma porta que nao dava
    // passagem. A mobilia toda mora entre 33 e 35,5.
    portaX: 36.90, ladoPorta: 'norte',
    divisao: -37.20,                               // sala ao norte, quarto ao sul
    morador: {
      nome: 'Tiao',
      fala: 'E ai, cara, tudo bem contigo? Entra, fica a vontade.',
      pele: 6, cabelo: 2, barba: 2, corCabelo: 0, corBarba: 6,
      camisa: 0x6d3b34, calca: 0x2b2f36, tenis: 0x1b1e22,
      fuma: true,
    },
    sofa: 0x5a4a3a, tv: true,
  },
  {
    id: 'b', andar: 2, numero: '23',
    x0: 40.20, x1: 46.80, z0: COR.z1, z1: IN.z1,   // sudeste do 2o andar
    portaX: 41.20, ladoPorta: 'norte',
    divisao: -37.60,
    morador: {
      nome: 'Neide',
      fala: 'Entra logo e fecha a porta. Corredor tem ouvido.',
      pele: 3, cabelo: 1, barba: 0, corCabelo: 1, corBarba: 0,
      camisa: 0x3d5a54, calca: 0x22262c, tenis: 0x2a2118,
      fuma: true,
    },
    sofa: 0x46403a, tv: true,
  },
]

// As portas que NAO abrem. `andar`, `x` e de que lado do corredor.
const PORTAS_MUDAS = [
  { andar: 0, x: 34.30, lado: 'sul', numero: '01' },
  { andar: 0, x: 44.20, lado: 'sul', numero: '02' },
  { andar: 0, x: 34.60, lado: 'norte', numero: '03' },
  { andar: 1, x: 41.20, lado: 'sul', numero: '13' },
  { andar: 1, x: 44.60, lado: 'sul', numero: '14' },
  { andar: 1, x: 34.60, lado: 'norte', numero: '11' },
  { andar: 1, x: 39.20, lado: 'norte', numero: '15' },
  { andar: 2, x: 34.20, lado: 'sul', numero: '21' },
  { andar: 2, x: 37.60, lado: 'sul', numero: '22' },
  { andar: 2, x: 34.60, lado: 'norte', numero: '24' },
  { andar: 2, x: 39.20, lado: 'norte', numero: '25' },
]

const PORTA_L = 0.92          // vao de porta de quitinete
const PORTA_H = 2.05

// ===========================================================================
// MATERIAIS
// ===========================================================================

/** Reboco encardido de corredor: mancha de umidade, gordura na altura da mao. */
function paredeTex() {
  return tex('cort-parede', 256, (g, s) => {
    g.fillStyle = '#a89f8c'
    g.fillRect(0, 0, s, s)
    // pintura antiga em duas alturas: rodape de oleo escuro ate 1/3
    g.fillStyle = '#6d6a5c'
    g.fillRect(0, s * 0.66, s, s * 0.34)
    g.fillStyle = 'rgba(255,255,255,0.10)'
    g.fillRect(0, s * 0.655, s, 3)
    // DESCASCADOS. Menores e muito mais transparentes do que na primeira versao:
    // com 0.5 de alfa e ate 30 px numa textura que cobre 4 m de parede, cada
    // mancha saia do tamanho de uma porta e o corredor virava camuflagem.
    for (let i = 0; i < 70; i++) {
      const w = 4 + Math.random() * 14
      const h = 4 + Math.random() * 12
      g.fillStyle = Math.random() < 0.5 ? 'rgba(150,120,96,0.16)' : 'rgba(210,200,180,0.13)'
      g.fillRect(Math.random() * s, Math.random() * s, w, h)
    }
    // encardido da mao, na faixa do ombro
    const gr = g.createLinearGradient(0, s * 0.46, 0, s * 0.72)
    gr.addColorStop(0, 'rgba(40,34,26,0)')
    gr.addColorStop(0.5, 'rgba(40,34,26,0.30)')
    gr.addColorStop(1, 'rgba(40,34,26,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
    // escorrido de infiltracao vindo do teto
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * s
      const gr2 = g.createLinearGradient(0, 0, 0, s * (0.3 + Math.random() * 0.5))
      gr2.addColorStop(0, 'rgba(58,48,34,0.45)')
      gr2.addColorStop(1, 'rgba(58,48,34,0)')
      g.fillStyle = gr2
      g.fillRect(x, 0, 3 + Math.random() * 12, s)
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = 'rgba(30,26,20,' + (Math.random() * 0.16) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
  })
}

/** Piso de granilite gasto, com as juntas de laton e as manchas. */
function pisoTex() {
  return tex('cort-piso', 256, (g, s) => {
    g.fillStyle = '#8d8a80'
    g.fillRect(0, 0, s, s)
    // pedrinhas do granilite
    for (let i = 0; i < 1400; i++) {
      const v = Math.random()
      g.fillStyle = v > 0.75 ? 'rgba(40,38,34,0.6)'
        : v > 0.45 ? 'rgba(220,216,206,0.5)' : 'rgba(120,116,106,0.5)'
      const r = 1 + Math.random() * 3
      g.fillRect(Math.random() * s, Math.random() * s, r, r)
    }
    // juntas
    g.strokeStyle = 'rgba(190,175,120,0.55)'
    g.lineWidth = 2
    g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke()
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke()
    // trilha de pe no meio: onde todo mundo pisa, o granilite lustra
    const gr = g.createLinearGradient(0, 0, 0, s)
    gr.addColorStop(0, 'rgba(30,28,24,0)')
    gr.addColorStop(0.5, 'rgba(30,28,24,0.22)')
    gr.addColorStop(1, 'rgba(30,28,24,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
  })
}

/** Fachada: reboco batido de rua, com a barra de pintura e as manchas. */
function fachadaTex() {
  return tex('cort-fachada', 256, (g, s) => {
    g.fillStyle = '#b0a48a'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '150,138,112' : '200,192,170') + ',' + (0.1 + Math.random() * 0.25) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 10 + Math.random() * 50, 8 + Math.random() * 40)
    }
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s
      const gr = g.createLinearGradient(0, 0, 0, s)
      gr.addColorStop(0, 'rgba(56,48,36,0.35)')
      gr.addColorStop(1, 'rgba(56,48,36,0)')
      g.fillStyle = gr
      g.fillRect(x, 0, 4 + Math.random() * 16, s)
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = 'rgba(30,26,20,' + (Math.random() * 0.14) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3)
    }
  })
}

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

const M = {
  // 7 repeticoes e nao 3,4: a parede do corredor tem 14,5 m e a textura tem que
  // fechar mais ou menos a cada 2 m, senao o reboco descascado vira desenho.
  get parede() { return stdMat('cort-parede-mat', { map: tiled(paredeTex(), 7, 1.15), color: 0xb6ada0, roughness: 0.95 }) },
  get piso() { return stdMat('cort-piso-mat', { map: tiled(pisoTex(), 6, 6), roughness: 0.72 }) },
  // taco de peroba encardido: cinza-marrom, e MUITO mais repetido (o veio de
  // 1,2 m que a primeira versao deu saia listrado de vermelho na foto)
  get pisoApto() { return stdMat('cort-piso-apto', { map: tiled(woodTex(2, '#4a3c2c'), 9, 10), color: 0x8f8270, roughness: 0.88 }) },
  get fachada() { return stdMat('cort-fachada-mat', { map: tiled(fachadaTex(), 4.2, 2.6), color: 0xb0a08a, roughness: 0.94 }) },
  get tijolo() { return stdMat('cort-tijolo', { map: tiled(brickTex(1), 2.4, 1.4), color: 0x8d6250, roughness: 0.95 }) },
  get concreto() { return stdMat('cort-concreto', { map: tiled(concreteTex(1), 3, 3), color: 0x8f8a82, roughness: 0.95 }) },
  get laje() { return solid(0x6f6a61, 0.94) },
  get forro() { return solid(0x3a3630, 0.96) },
  get madeiraPorta() { return stdMat('cort-porta', { map: tiled(woodTex(2, '#4a3520'), 1, 2), color: 0x8a6a48, roughness: 0.80 }) },
  get madeiraVelha() { return stdMat('cort-mad-velha', { map: tiled(woodTex(3, '#3d2a1a'), 2, 2), color: 0x6f5539, roughness: 0.94 }) },
  get ferro() { return solid(0x34383d, 0.70, 0.42) },
  get ferrugem() { return solid(0x6b4526, 0.94, 0.18) },
  get chapa() { return solid(0x6a7076, 0.58, 0.50) },
  get inox() { return solid(0xaeb4ba, 0.36, 0.76) },
  get plastico() { return solid(0x2a2e34, 0.62, 0.03) },
  get tecidoSofa() { return solid(0x5a4a3a, 0.98) },
  get espuma() { return solid(0xd8cfae, 0.99) },
  get papel() { return solid(0xded6c2, 0.96) },
  get po() { return solid(0xf4f2ee, 0.86) },              // o branco da mesa
  get verdeSeco() { return solid(0x5c6b32, 0.96) },       // o mato picado
  get vidroEscuro() { return stdMat('cort-vidro-esc', { color: 0x1a1d21, roughness: 0.12, metalness: 0.3 }) },
  get janela() {
    return stdMat('cort-janela', {
      color: 0x25303a, transparent: true, opacity: 0.55, roughness: 0.10,
      metalness: 0.2, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // --- emissivos ------------------------------------------------------------
  get bulbo() { return stdMat('cort-bulbo', { color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 2.0, roughness: 0.4 }) },
  get bulboFraco() { return stdMat('cort-bulbo-fraco', { color: 0xe8dcc0, emissive: 0xc9a05c, emissiveIntensity: 1.1, roughness: 0.5 }) },
  get brasaCigarro() { return stdMat('cort-brasa', { color: 0xff8a3a, emissive: 0xff4a10, emissiveIntensity: 3.0, roughness: 0.8 }) },
  get telaTv() { return stdMat('cort-tv', { color: 0x9fd0e8, emissive: 0x4a86b8, emissiveIntensity: 1.5, roughness: 0.35 }) },
}

// ===========================================================================
// FERRAMENTAS
// ===========================================================================

function col(lista, x0, x1, z0, z1, andar, tag) {
  lista.push({
    minX: Math.min(x0, x1), maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1),
    andar, tag: tag || 'cortico',
  })
}

/** Parede reta com colisor. `eixo` 'x' corre em X; 'z' corre em Z. */
function parede(g, cols, eixo, fixo, a0, a1, yBase, alt, esp, andar, mat) {
  if (a1 - a0 <= 0.001) return null
  const t = esp === undefined ? 0.14 : esp
  const m = eixo === 'x'
    ? box(a1 - a0, alt, t, mat || M.parede, (a0 + a1) / 2, yBase + alt / 2, fixo)
    : box(t, alt, a1 - a0, mat || M.parede, fixo, yBase + alt / 2, (a0 + a1) / 2)
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  if (cols) {
    if (eixo === 'x') col(cols, a0, a1, fixo - t / 2, fixo + t / 2, andar, 'cort-parede')
    else col(cols, fixo - t / 2, fixo + t / 2, a0, a1, andar, 'cort-parede')
  }
  return m
}

/**
 * PAREDE COM VAO DE PORTA. Desenha os dois trechos e a verga, e devolve os
 * limites do vao — quem precisa do colisor da folha usa isso.
 */
function paredeComVao(g, cols, eixo, fixo, a0, a1, vaoC, vaoL, yBase, alt, esp, andar, mat) {
  const vl = vaoC - vaoL / 2, vr = vaoC + vaoL / 2
  parede(g, cols, eixo, fixo, a0, vl, yBase, alt, esp, andar, mat)
  parede(g, cols, eixo, fixo, vr, a1, yBase, alt, esp, andar, mat)
  // verga: acima do vao, sem colisor (ninguem passa por cima)
  const t = esp === undefined ? 0.14 : esp
  const h = alt - PORTA_H
  if (h > 0.02) {
    const m = eixo === 'x'
      ? box(vaoL, h, t, mat || M.parede, vaoC, yBase + PORTA_H + h / 2, fixo)
      : box(t, h, vaoL, mat || M.parede, fixo, yBase + PORTA_H + h / 2, (a0 + a1) / 2)
    if (eixo === 'z') m.position.z = vaoC
    m.castShadow = true
    g.add(m)
  }
  return { vl, vr }
}

/**
 * UMA PORTA DE APARTAMENTO.
 *
 * Elas sao quase todas iguais e e assim que tem que ser: predio de quitinete
 * compra porta em lote. O que muda de uma pra outra e o ESTRAGO — o numero
 * torto, a marca de pe na altura da fechadura, o olho magico, a fita de
 * isolante no lugar da macaneta — e e o estrago que faz doze portas iguais
 * parecerem doze portas.
 *
 * Devolve o grupo com o pivo pra quem quiser abrir.
 */
function portaDeApto(numero, semente, comChute) {
  const g = new THREE.Group()
  const pivo = new THREE.Group()
  g.add(pivo)
  const r = (i) => {
    const x = Math.sin(semente * 12.9898 + i * 78.233) * 43758.5453
    return x - Math.floor(x)
  }

  const folha = box(PORTA_L, PORTA_H, 0.045, M.madeiraPorta, PORTA_L / 2, PORTA_H / 2, 0)
  folha.castShadow = true
  folha.receiveShadow = true
  pivo.add(folha)
  // almofadas fresadas: duas, e e o que separa porta de tabua
  for (const y of [0.55, 1.42]) {
    pivo.add(box(PORTA_L - 0.26, 0.62, 0.012, M.madeiraVelha, PORTA_L / 2, y, 0.028))
  }
  // macaneta e espelho da fechadura
  const mac = cyl(0.014, 0.014, 0.11, M.ferro, 8)
  mac.rotation.z = Math.PI / 2
  mac.position.set(PORTA_L - 0.14, 1.02, 0.055)
  pivo.add(mac)
  pivo.add(box(0.06, 0.13, 0.014, M.ferro, PORTA_L - 0.14, 1.02, 0.030))
  // olho magico
  const olho = cyl(0.011, 0.011, 0.05, M.ferro, 8)
  olho.rotation.x = Math.PI / 2
  olho.position.set(PORTA_L / 2, 1.58, 0.020)
  pivo.add(olho)
  // NUMERO, sempre torto
  const chapa = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.13), textPlaneMat(numero, {
    w: 128, h: 110, color: '#e6dfcb',
    font: 'bold 76px "Trebuchet MS", sans-serif', emissiveIntensity: 0.12,
  }))
  chapa.position.set(PORTA_L / 2, 1.78, 0.030)
  chapa.rotation.z = (r(1) - 0.5) * 0.22
  pivo.add(chapa)
  // tres gonzos
  for (const y of [0.30, 1.02, 1.76]) {
    const gz = cyl(0.017, 0.017, 0.08, M.ferro, 8)
    gz.position.set(0.02, y, 0.030)
    pivo.add(gz)
  }
  // MARCA DE PE na altura da fechadura: uma amassadura e o verniz raspado
  if (comChute) {
    const amasso = box(0.22, 0.16, 0.008, solid(0x4a3520, 0.98), PORTA_L * 0.62, 0.92, 0.024)
    amasso.rotation.z = 0.12
    pivo.add(amasso)
    pivo.add(box(0.10, 0.05, 0.006, solid(0x2e2418, 0.99), PORTA_L * 0.70, 0.86, 0.028))
  }
  // fita isolante enrolada na macaneta em uma de cada tres
  if (r(2) > 0.66) {
    const fita = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.007, 5, 12), M.plastico)
    fita.rotation.y = Math.PI / 2
    fita.position.set(PORTA_L - 0.16, 1.02, 0.055)
    pivo.add(fita)
  }
  // batente
  for (const s of [0, 1]) {
    g.add(box(0.07, PORTA_H + 0.07, 0.16, M.madeiraVelha, s * PORTA_L + (s ? 0.035 : -0.035), (PORTA_H + 0.07) / 2, 0))
  }
  g.add(box(PORTA_L + 0.14, 0.07, 0.16, M.madeiraVelha, PORTA_L / 2, PORTA_H + 0.035, 0))
  // capacho, em algumas
  if (r(3) > 0.5) {
    const cap = plane(0.62, 0.36, solid(0x4a4136, 0.99))
    cap.position.set(PORTA_L / 2, 0.006, 0.42)
    g.add(cap)
  }
  return { grupo: g, pivo }
}

/** Engradado / caixote de feira, usado a rodo neste predio. */
function caixote(cor) {
  const g = new THREE.Group()
  const mat = stdMat('cort-caixote:' + cor, { map: tiled(woodTex(2, '#3a2412'), 1, 1), color: cor, roughness: 0.95 })
  const L = 0.42, A = 0.30, P = 0.31
  for (const s of [-1, 1]) {
    g.add(box(L, A, 0.020, mat, 0, A / 2, s * P / 2))
    g.add(box(0.020, A, P, mat, s * L / 2, A / 2, 0))
  }
  g.add(box(L, 0.018, P, mat, 0, 0.009, 0))
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

/** Saco de lixo preto: tres esferas amassadas e o no em cima. */
function sacoDeLixo(escala) {
  const g = new THREE.Group()
  const mat = solid(0x17181b, 0.72, 0.02)
  const e = escala || 1
  const bolhas = [[0, 0.20, 0, 0.26], [0.10, 0.30, -0.06, 0.20], [-0.09, 0.34, 0.05, 0.17]]
  for (const [x, y, z, r] of bolhas) {
    const s = sphere(r, mat, 10)
    s.position.set(x * e, y * e, z * e)
    s.scale.set(1, 0.9, 1.05)
    s.castShadow = true
    g.add(s)
  }
  const no = cyl(0.04 * e, 0.06 * e, 0.10 * e, mat, 8)
  no.position.y = 0.46 * e
  g.add(no)
  g.scale.setScalar(e)
  return g
}

// ===========================================================================
// 1. A CASCA
// ===========================================================================

/**
 * A casca sobe os tres andares e traz a fachada.
 *
 * O predio nao esconde o que e: roupa no varal entre as janelas, ar
 * condicionado pingando, antena de tv amarrada com arame, fiacao puxada por
 * fora em vez de por dentro da parede, e a pintura que parou na metade do
 * primeiro andar — alguem comecou e nao terminou.
 */
function casca(g, cols, occluders) {
  // Y DE MUNDO, e nao local: ao contrario da adega, o grupo raiz deste predio
  // fica em y = 0 — ele tem TRES pisos e nenhum deles poderia ser "o" offset do
  // grupo. Entao todo numero deste arquivo ja e a cota final, e os pisos moram
  // em BASE + NIVEIS[a].
  const H = B.wallHeight
  const T = WALL_T
  const y0 = 0
  const w = B.x1 - B.x0, d = B.z1 - B.z0
  const cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2
  const dl = B.door.center - B.door.width / 2
  const dr = B.door.center + B.door.width / 2

  function laje(x0, x1, yA, yB, z0, z1, mat) {
    const m = box(x1 - x0, yB - yA, z1 - z0, mat, (x0 + x1) / 2, (yA + yB) / 2, (z0 + z1) / 2)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    return m
  }

  // as quatro paredes, com o vao da porta de rua partindo a fachada
  laje(B.x0, dl, y0, H, B.z0, B.z0 + T, M.fachada)
  laje(dr, B.x1, y0, H, B.z0, B.z0 + T, M.fachada)
  laje(dl, dr, B.door.height, H, B.z0, B.z0 + T, M.fachada)
  laje(B.x0, B.x0 + T, y0, H, B.z0, B.z1, M.fachada)
  laje(B.x1 - T, B.x1, y0, H, B.z0, B.z1, M.fachada)
  laje(B.x0, B.x1, y0, H, B.z1 - T, B.z1, M.fachada)

  // colisores da casca: valem em TODOS os andares (andar undefined)
  col(cols, B.x0, dl, B.z0, B.z0 + T, undefined, 'cort-casca')
  col(cols, dr, B.x1, B.z0, B.z0 + T, undefined, 'cort-casca')
  col(cols, B.x0, B.x0 + T, B.z0, B.z1, undefined, 'cort-casca')
  col(cols, B.x1 - T, B.x1, B.z0, B.z1, undefined, 'cort-casca')
  col(cols, B.x0, B.x1, B.z1 - T, B.z1, undefined, 'cort-casca')

  const HW = B.wallHeight
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z0, maxX: dl, maxY: HW, maxZ: B.z0 + T, tag: 'cortico' })
  occluders.push({ minX: dr, minY: 0, minZ: B.z0, maxX: B.x1, maxY: HW, maxZ: B.z0 + T, tag: 'cortico' })
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z0, maxX: B.x0 + T, maxY: HW, maxZ: B.z1, tag: 'cortico' })
  occluders.push({ minX: B.x1 - T, minY: 0, minZ: B.z0, maxX: B.x1, maxY: HW, maxZ: B.z1, tag: 'cortico' })
  occluders.push({ minX: B.x0, minY: 0, minZ: B.z1 - T, maxX: B.x1, maxY: HW, maxZ: B.z1, tag: 'cortico' })

  // --- cobertura, nas medidas que neve.js espera de um LOTE ----------------
  const deck = box(w + 0.7, 0.34, d + 0.7, M.laje, cx, H + 0.17, cz)
  deck.castShadow = true
  g.add(deck)
  const mur = solid(0x7a7268, 0.94)
  const yF = H + 1.04, yL = H + 0.895
  g.add(box(w + 0.6, yF - H - 0.34, 0.20, mur, cx, (H + 0.34 + yF) / 2, B.z0 + 0.05))
  g.add(box(w + 0.6, yL - H - 0.34, 0.20, mur, cx, (H + 0.34 + yL) / 2, B.z1 - 0.05))
  g.add(box(0.20, yL - H - 0.34, d + 0.6, mur, B.x0 + 0.05, (H + 0.34 + yL) / 2, cz))
  g.add(box(0.20, yL - H - 0.34, d + 0.6, mur, B.x1 - 0.05, (H + 0.34 + yL) / 2, cz))
  // caixa d'agua e a barrica de antenas
  const cxa = cyl(0.85, 0.85, 1.35, solid(0x2f6fa8, 0.86), 14)
  cxa.position.set(B.x1 - 2.6, H + 1.02, B.z1 - 3.0)
  cxa.castShadow = true
  g.add(cxa)
  for (let i = 0; i < 4; i++) {
    const p = cyl(0.03, 0.03, 1.6 + i * 0.3, M.ferrugem, 6)
    p.position.set(B.x0 + 2.2 + i * 0.7, H + 1.2 + i * 0.15, B.z1 - 2.0)
    p.rotation.z = (i - 1.5) * 0.06
    g.add(p)
    const par = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, 1.0), M.chapa)
    par.rotation.x = -1.1
    par.position.set(p.position.x, H + 2.0 + i * 0.2, B.z1 - 2.0)
    g.add(par)
  }

  fachada(g)
  janelasLaterais(g)
}

/** A fachada: janelas dos tres andares, varal, ar condicionado e o 117. */
function fachada(g) {
  const z = B.z0 - 0.03
  // A BARRA DE PINTURA. Ela e uma faixa de 1,55 m — a altura que se pinta com
  // rolo sem escada —, e nao um paredao de 4 m.
  //
  // Nasceu com 4,1 m e cobrindo a largura inteira, e o primeiro render mostrou
  // por que isso nao funciona: ela passava POR CIMA DO VAO DA PORTA, e a
  // entrada do predio virou parede lisa. Agora ela e partida no vao, como
  // qualquer pintura de fachada e.
  const dlF = B.door.center - B.door.width / 2 - 0.12
  const drF = B.door.center + B.door.width / 2 + 0.12
  for (const [fx0, fx1] of [[B.x0 + 0.05, dlF], [drF, B.x1 - 0.05]]) {
    const faixa = box(fx1 - fx0, 1.55, 0.03, solid(0x6d7f6a, 0.95), (fx0 + fx1) / 2, BASE + 0.72, z + 0.005)
    faixa.receiveShadow = true
    g.add(faixa)
    g.add(box(fx1 - fx0, 0.05, 0.04, solid(0x8a9a86, 0.9), (fx0 + fx1) / 2, BASE + 1.47, z))
  }

  // --- janelas: 4 colunas x 3 andares -------------------------------------
  const colunas = [33.9, 36.3, 43.2, 45.6]
  const geoV = new THREE.BoxGeometry(1.05, 1.15, 0.04)
  const geoM = new THREE.BoxGeometry(1.22, 1.32, 0.06)
  for (let a = 0; a < 3; a++) {
    const yj = BASE + NIVEIS[a] + 1.05
    for (let i = 0; i < colunas.length; i++) {
      const x = colunas[i]
      const molde = new THREE.Mesh(geoM, M.chapa)
      molde.position.set(x, yj + 0.6, z)
      g.add(molde)
      const vidro = new THREE.Mesh(geoV, M.janela)
      vidro.position.set(x, yj + 0.6, z - 0.02)
      vidro.castShadow = false
      g.add(vidro)
      // peitoril, e a grade — quitinete de terreo e de 1o andar tem grade
      g.add(box(1.36, 0.07, 0.22, M.concreto, x, yj - 0.04, z - 0.06))
      if (a < 2) {
        const n = 7
        const grade = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 1.10, 0.018), M.ferrugem, n)
        const d0 = new THREE.Object3D()
        for (let k = 0; k < n; k++) {
          d0.position.set(x - 0.5 + (k / (n - 1)) * 1.0, yj + 0.6, z - 0.10)
          d0.updateMatrix()
          grade.setMatrixAt(k, d0.matrix)
        }
        grade.instanceMatrix.needsUpdate = true
        g.add(grade)
      }
      // ar condicionado de janela em duas delas
      if ((i + a) % 4 === 1) {
        const ap = box(0.62, 0.42, 0.36, M.chapa, x, yj + 0.20, z - 0.20)
        ap.castShadow = true
        g.add(ap)
        g.add(box(0.52, 0.30, 0.02, M.plastico, x, yj + 0.20, z - 0.39))
        // a mancha do pingo, descendo pela parede
        const pingo = box(0.10, 1.6, 0.01, solid(0x5a5346, 0.99), x, yj - 0.82, z + 0.01)
        pingo.castShadow = false
        g.add(pingo)
      }
    }
    // VARAL entre as duas colunas de cada lado: e o detalhe que diz que MORA
    // gente aqui, e nao que o predio esta a venda.
    if (a > 0) {
      for (const [xa, xb] of [[colunas[0], colunas[1]], [colunas[2], colunas[3]]]) {
        const yv = BASE + NIVEIS[a] + 1.35
        const fio = cyl(0.006, 0.006, xb - xa, M.ferro, 5)
        fio.rotation.z = Math.PI / 2
        fio.position.set((xa + xb) / 2, yv - 0.06, z - 0.34)
        g.add(fio)
        const cores = [0xd8d2c2, 0x6d8fb0, 0xb04a4a, 0xd8c05a, 0x4a6b5a]
        const nR = 5
        for (let k = 0; k < nR; k++) {
          const t = (k + 0.5) / nR
          const largura = 0.26 + (k % 3) * 0.08
          const altura = 0.42 + (k % 2) * 0.22
          const roupa = box(largura, altura, 0.012, solid(cores[k % cores.length], 0.98),
            xa + (xb - xa) * t, yv - 0.10 - altura / 2, z - 0.34)
          roupa.rotation.z = (k - 2) * 0.02
          roupa.castShadow = true
          g.add(roupa)
        }
      }
    }
  }

  // --- a entrada: verga, luminaria quebrada, o numero e as caixas de correio
  g.add(box(B.door.width + 0.5, 0.22, 0.34, M.concreto, B.door.center, BASE + B.door.height + 0.11, z - 0.10))
  // luminaria de entrada: o vidro quebrado e o bulbo aceso mesmo assim
  const lum = box(0.30, 0.14, 0.16, M.ferrugem, B.door.center + 0.9, BASE + B.door.height + 0.34, z - 0.08)
  g.add(lum)
  const bl = sphere(0.045, M.bulboFraco, 8)
  bl.position.set(B.door.center + 0.9, BASE + B.door.height + 0.30, z - 0.14)
  bl.castShadow = false
  g.add(bl)

  // O NUMERO 117, em chapa esmaltada torta
  const placa = new THREE.Group()
  placa.add(box(0.50, 0.30, 0.02, solid(0x24303a, 0.82), 0, 0, 0))
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), textPlaneMat('117', {
    w: 256, h: 150, color: '#eae4d2',
    font: 'bold 110px "Trebuchet MS", sans-serif', emissiveIntensity: 0.3,
  }))
  num.position.z = -0.012
  num.rotation.y = Math.PI
  placa.add(num)
  placa.position.set(B.door.center - 1.15, BASE + B.door.height + 0.30, z - 0.02)
  placa.rotation.z = 0.10
  g.add(placa)

  // fiacao puxada por fora, subindo a fachada e entrando por um furo
  for (const [x, n] of [[B.x0 + 1.2, 5], [B.x1 - 1.5, 4]]) {
    for (let i = 0; i < n; i++) {
      const fio = cyl(0.011, 0.011, B.wallHeight, M.plastico, 5)
      fio.position.set(x + i * 0.045, B.wallHeight / 2, z - 0.04 - (i % 2) * 0.02)
      fio.rotation.z = 0.01 * (i - 2)
      g.add(fio)
    }
    g.add(box(0.30, 0.34, 0.18, M.chapa, x + 0.08, BASE + 1.60, z - 0.10))
  }
  // relogios de luz, um por apartamento, enfileirados
  for (let i = 0; i < 6; i++) {
    const cxr = box(0.20, 0.28, 0.14, M.chapa, B.x0 + 2.6 + i * 0.26, BASE + 1.72, z - 0.06)
    g.add(cxr)
    const disco = cyl(0.055, 0.055, 0.02, M.papel, 10)
    disco.rotation.x = Math.PI / 2
    disco.position.set(B.x0 + 2.6 + i * 0.26, BASE + 1.76, z - 0.14)
    g.add(disco)
  }
}

/** Janelas das laterais e dos fundos, so pra o predio nao ser cego de lado. */
function janelasLaterais(g) {
  const geoV = new THREE.BoxGeometry(0.95, 1.05, 0.04)
  const geoM = new THREE.BoxGeometry(1.10, 1.20, 0.06)
  const faces = [
    { fixo: B.z1 + 0.03, eixo: 'z', pos: [34.6, 38.8, 43.4] },
    { fixo: B.x0 - 0.03, eixo: 'x', pos: [-45.6, -41.9, -36.2] },
    { fixo: B.x1 + 0.03, eixo: 'x', pos: [-45.6, -41.9, -36.2] },
  ]
  for (const f of faces) {
    for (let a = 0; a < 3; a++) {
      const yj = BASE + NIVEIS[a] + 1.62
      for (const p of f.pos) {
        const molde = new THREE.Mesh(geoM, M.chapa)
        const vidro = new THREE.Mesh(geoV, M.janela)
        if (f.eixo === 'z') {
          molde.position.set(p, yj, f.fixo)
          vidro.position.set(p, yj, f.fixo + 0.02)
        } else {
          molde.rotation.y = Math.PI / 2
          vidro.rotation.y = Math.PI / 2
          molde.position.set(f.fixo, yj, p)
          vidro.position.set(f.fixo + (f.fixo < 40 ? -0.02 : 0.02), yj, p)
        }
        vidro.castShadow = false
        g.add(molde, vidro)
      }
    }
  }
}

// ===========================================================================
// 2. A ESCADA
// ===========================================================================

/**
 * ESCADA EM U, com patamar intermediario, tres lances e meio.
 *
 * O DEGRAU E DO OLHO; A RAMPA E DO PE. A geometria tem 10 espelhos por lance
 * (15 cm cada, 1,50 m de subida) porque sem degrau nao ha escada. O que o
 * jogador PISA e a rampa registrada em systems/pisos.js, um plano inclinado por
 * lance. A razao esta no controller: ele cancela o avanco horizontal sempre que
 * o piso sobe mais que 45 cm de um quadro pro outro, e com degraus reais o
 * jogador subiria aos solavancos, um por espelho.
 *
 * A PAREDE DO MEIO nao e enfeite. Sem ela da pra atravessar de um lance pro
 * outro no meio da subida, onde as duas alturas diferem em mais de um metro — e
 * o jogador atravessa a escada de lado, no ar.
 */
function escada(g, cols, pisos, yPiso) {
  const nLances = (NIVEIS.length - 1) * 2      // 4 lances: 2 por andar
  const runZ0 = ESC.zPatamar, runZ1 = ESC.zBoca
  const run = runZ1 - runZ0                    // 3.9 m
  const meiaSubida = ANDAR / 2                 // 1.5 m

  // --- paredes da caixa -----------------------------------------------------
  // Elas valem em TODOS os andares (o poco atravessa o predio inteiro), entao
  // vao sem `andar`.
  const topo = BASE + NIVEIS[2] + PE
  parede(g, cols, 'z', ESC.x0, IN.z0, ESC.zBoca, 0, topo, 0.16, undefined)
  parede(g, cols, 'z', ESC.x1, IN.z0, ESC.zBoca, 0, topo, 0.16, undefined)
  // a parede central so vai do patamar ate a boca (no patamar a gente da a volta)
  parede(g, cols, 'z', (ESC.miolo[0] + ESC.miolo[1]) / 2, ESC.zPatamar, ESC.zBoca,
    0, topo, 0.30, undefined, M.concreto)

  const larguraLance = ESC.laneW[1] - ESC.laneW[0]

  for (let i = 0; i < nLances; i++) {
    const subindo = i % 2 === 0            // par: lance de ida (oeste), sobe pro norte
    const lane = subindo ? ESC.laneW : ESC.laneE
    const yA = yPiso + NIVEIS[Math.floor(i / 2)] + (subindo ? 0 : meiaSubida)
    const yB = yA + meiaSubida

    // A RAMPA DE COLISAO. `rampa(x0,x1,z0,z1, yEm_z0, yEm_z1, 'z')`.
    // No lance de ida (oeste) sobe indo pro NORTE, ou seja o z MENOR e o alto.
    if (subindo) pisos.rampa(lane[0], lane[1], runZ0, runZ1, yB, yA, 'z', 'cort-esc')
    else pisos.rampa(lane[0], lane[1], runZ0, runZ1, yA, yB, 'z', 'cort-esc')

    // OS DEGRAUS, so pro olho: 10 por lance
    const nD = 10
    const geoPiso = new THREE.BoxGeometry(larguraLance, 0.055, run / nD)
    const geoEsp = new THREE.BoxGeometry(larguraLance, meiaSubida / nD, 0.035)
    const matP = M.concreto
    const imP = new THREE.InstancedMesh(geoPiso, matP, nD)
    const imE = new THREE.InstancedMesh(geoEsp, solid(0x7f7a70, 0.94), nD)
    const d0 = new THREE.Object3D()
    for (let k = 0; k < nD; k++) {
      const t = (k + 0.5) / nD
      const z = subindo ? runZ1 - run * t : runZ0 + run * t
      const y = yA + meiaSubida * t
      d0.position.set((lane[0] + lane[1]) / 2, y - 0.028, z)
      d0.updateMatrix()
      imP.setMatrixAt(k, d0.matrix)
      d0.position.set((lane[0] + lane[1]) / 2, y - meiaSubida / nD / 2 - 0.055,
        z + (subindo ? run / nD / 2 : -run / nD / 2))
      d0.updateMatrix()
      imE.setMatrixAt(k, d0.matrix)
    }
    imP.instanceMatrix.needsUpdate = true
    imE.instanceMatrix.needsUpdate = true
    imP.castShadow = true
    imP.receiveShadow = true
    g.add(imP, imE)

    // a laje inclinada por baixo, pra escada ter barriga
    const comp = Math.hypot(run, meiaSubida)
    const barriga = box(larguraLance, 0.16, comp, M.laje,
      (lane[0] + lane[1]) / 2, yA + meiaSubida / 2 - 0.20, (runZ0 + runZ1) / 2)
    barriga.rotation.x = subindo ? -Math.atan2(meiaSubida, run) : Math.atan2(meiaSubida, run)
    barriga.castShadow = true
    g.add(barriga)

    // CORRIMAO de tubo, do lado da parede central
    const ladoCorr = subindo ? lane[1] - 0.05 : lane[0] + 0.05
    const tubo = cyl(0.022, 0.022, comp, M.ferrugem, 8)
    tubo.rotation.x = (subindo ? -1 : 1) * (Math.PI / 2 - Math.atan2(meiaSubida, run))
    tubo.position.set(ladoCorr, yA + meiaSubida / 2 + 0.92, (runZ0 + runZ1) / 2)
    g.add(tubo)
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3
      const z = subindo ? runZ1 - run * t : runZ0 + run * t
      const y = yA + meiaSubida * t
      const sup = cyl(0.014, 0.014, 0.92, M.ferrugem, 6)
      sup.position.set(ladoCorr, y + 0.46, z)
      g.add(sup)
    }
  }

  // --- patamares intermediarios --------------------------------------------
  for (let a = 0; a < NIVEIS.length - 1; a++) {
    const y = yPiso + NIVEIS[a] + meiaSubida
    pisos.laje(ESC.x0, ESC.x1, IN.z0, ESC.zPatamar, y, 'cort-patamar')
    const l = box(ESC.x1 - ESC.x0, 0.20, ESC.zPatamar - IN.z0, M.concreto,
      (ESC.x0 + ESC.x1) / 2, y - 0.10, (IN.z0 + ESC.zPatamar) / 2)
    l.castShadow = true
    l.receiveShadow = true
    g.add(l)
    // a janelinha de ventilacao do patamar, com vidro quebrado
    const jan = box(0.70, 0.60, 0.05, M.janela, (ESC.x0 + ESC.x1) / 2, y + 1.30, IN.z0 + 0.02)
    jan.castShadow = false
    g.add(jan)
    g.add(box(0.82, 0.08, 0.10, M.chapa, (ESC.x0 + ESC.x1) / 2, y + 1.64, IN.z0 + 0.01))
    // bulbo nu no patamar
    const b = sphere(0.05, M.bulboFraco, 8)
    b.position.set((ESC.x0 + ESC.x1) / 2, y + 2.20, IN.z0 + 0.55)
    b.castShadow = false
    g.add(b)
    const fioP = cyl(0.005, 0.005, 0.30, M.plastico, 4)
    fioP.position.set((ESC.x0 + ESC.x1) / 2, y + 2.40, IN.z0 + 0.55)
    g.add(fioP)
  }

  // --- GUARDA-CORPO NO ULTIMO ANDAR ----------------------------------------
  //
  // No 2o andar o lance de ida (oeste) nao existe: nao ha 3o andar pra ele
  // levar. Sem nada ali, a boca do lance vira um buraco de tres metros na
  // chegada da escada — e o jogador cai por ele andando normal.
  const yTopo = yPiso + NIVEIS[2]
  const gc = box(ESC.laneW[1] - ESC.laneW[0], 1.05, 0.08, M.ferrugem,
    (ESC.laneW[0] + ESC.laneW[1]) / 2, yTopo + 0.52, ESC.zBoca - 0.06)
  gc.castShadow = true
  g.add(gc)
  for (let k = 0; k < 5; k++) {
    const b2 = cyl(0.016, 0.016, 1.0, M.ferrugem, 6)
    b2.position.set(ESC.laneW[0] + 0.1 + k * 0.24, yTopo + 0.50, ESC.zBoca - 0.06)
    g.add(b2)
  }
  col(cols, ESC.laneW[0], ESC.laneW[1], ESC.zBoca - 0.14, ESC.zBoca + 0.02, 2, 'cort-guarda')
}

// ===========================================================================
// 3. UM ANDAR
// ===========================================================================

/**
 * Monta o andar `a`: laje, corredor, portas, e o apartamento aberto se houver.
 *
 * A laje de piso de cada andar tem UM BURACO — a caixa da escada. Ela nao pode
 * ser tapada: e por ali que os lances passam, e o pe do jogador tem que
 * encontrar a rampa e nao a laje. No TERREO e o contrario: la a caixa da escada
 * tem chao (e o vao embaixo do primeiro lance, onde moram a bicicleta e o
 * lixo), entao a laje vai inteira.
 */
function andarDoPredio(g, cols, interactables, pisos, a, yPiso, registrar) {
  const y = yPiso + NIVEIS[a]
  const terreo = a === 0

  // --- laje de piso ---------------------------------------------------------
  if (terreo) {
    pisos.laje(IN.x0, IN.x1, IN.z0, IN.z1, y, 'cort-piso0')
  } else {
    // quatro retangulos em volta da caixa da escada
    pisos.laje(IN.x0, ESC.x0, IN.z0, IN.z1, y, 'cort-piso')
    pisos.laje(ESC.x1, IN.x1, IN.z0, IN.z1, y, 'cort-piso')
    pisos.laje(ESC.x0, ESC.x1, ESC.zBoca, IN.z1, y, 'cort-piso')
    // a laje de concreto aparente por baixo (o que o andar de baixo ve)
    const l1 = box(IN.x1 - IN.x0, 0.28, IN.z1 - IN.z0, M.laje,
      (IN.x0 + IN.x1) / 2, y - 0.14, (IN.z0 + IN.z1) / 2)
    l1.castShadow = true
    l1.receiveShadow = true
    g.add(l1)
  }

  // piso visivel
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.piso)
  p.position.set((IN.x0 + IN.x1) / 2, y + 0.006, (IN.z0 + IN.z1) / 2)
  p.receiveShadow = true
  g.add(p)

  // forro
  const t = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.forro, Math.PI / 2)
  t.position.set((IN.x0 + IN.x1) / 2, y + PE, (IN.z0 + IN.z1) / 2)
  g.add(t)

  // --- as paredes do corredor ----------------------------------------------
  // Norte (z = COR.z0): saguao no meio, escada a leste, portas nos trechos.
  const portasNorte = PORTAS_MUDAS.filter((q) => q.andar === a && q.lado === 'norte')
  const portasSul = PORTAS_MUDAS.filter((q) => q.andar === a && q.lado === 'sul')
  const apto = APTOS.find((q) => q.andar === a)

  // Parede norte, em trechos. O vao do SAGUAO so existe no terreo: la ele e a
  // passagem da rua pro corredor. Nos andares de cima aquele pedaco e mais uma
  // quitinete, com porta e mais nada — e ficaria um beco sem saida se o vao
  // continuasse aberto.
  parede(g, cols, 'x', COR.z0, IN.x0, SAG.x0, y, PE, 0.14, a)
  if (!terreo) parede(g, cols, 'x', COR.z0, SAG.x0, SAG.x1, y, PE, 0.14, a)
  parede(g, cols, 'x', COR.z0, SAG.x1, ESC.x0, y, PE, 0.14, a)
  parede(g, cols, 'x', COR.z0, ESC.x1, IN.x1, y, PE, 0.14, a)

  // parede sul, com o vao do apartamento aberto (se ele da pro sul)
  if (apto && apto.ladoPorta === 'norte') {
    // a porta do apto fica na parede SUL do corredor (o apto fica ao sul)
    const v = paredeComVao(g, cols, 'x', COR.z1, IN.x0, IN.x1, apto.portaX, PORTA_L, y, PE, 0.14, a)
    apto._vao = v
  } else {
    parede(g, cols, 'x', COR.z1, IN.x0, IN.x1, y, PE, 0.14, a)
  }

  // --- as portas mudas ------------------------------------------------------
  for (const q of portasNorte) {
    const d = portaDeApto(q.numero, q.x * 7 + a, (q.x + a) % 3 === 0)
    d.grupo.position.set(q.x - PORTA_L / 2, y, COR.z0 + 0.08)
    d.grupo.rotation.y = Math.PI
    d.grupo.position.x = q.x + PORTA_L / 2
    g.add(d.grupo)
  }
  for (const q of portasSul) {
    const d = portaDeApto(q.numero, q.x * 5 + a, (q.x + a) % 4 === 0)
    d.grupo.position.set(q.x - PORTA_L / 2, y, COR.z1 - 0.08)
    g.add(d.grupo)
  }

  // --- o saguao (so no terreo tem porta de rua) -----------------------------
  parede(g, cols, 'z', SAG.x0, IN.z0, COR.z0, y, PE, 0.14, a)
  parede(g, cols, 'z', SAG.x1, IN.z0, COR.z0, y, PE, 0.14, a)

  // --- corredor: o que faz ele parecer corredor de cortico ------------------
  corredor(g, cols, a, y, terreo)

  // --- o apartamento que abre ----------------------------------------------
  let feito = null
  if (apto) feito = apartamento(g, cols, interactables, pisos, apto, y, registrar)
  return feito
}

/** O que se acumula num corredor sem sindico. */
function corredor(g, cols, a, y, terreo) {
  const cz = (COR.z0 + COR.z1) / 2

  // BULBOS NUS no fio, um a cada 4 m. O do meio e o que pisca (ver o update).
  const xs = [35.4, 39.8, 44.2]
  const bulbos = []
  for (let i = 0; i < xs.length; i++) {
    const fio = cyl(0.005, 0.005, 0.34, M.plastico, 4)
    fio.position.set(xs[i], y + PE - 0.17, cz)
    g.add(fio)
    const b = sphere(0.052, i === 1 ? M.bulboFraco : M.bulbo, 8)
    b.position.set(xs[i], y + PE - 0.36, cz)
    b.castShadow = false
    b.userData.noBake = i === 1        // o que pisca nao entra no forno
    g.add(b)
    if (i === 1) bulbos.push(b)
  }
  // eletroduto aparente correndo o corredor inteiro, com as caixas de passagem
  const duto = cyl(0.020, 0.020, IN.x1 - IN.x0 - 0.4, M.plastico, 6)
  duto.rotation.z = Math.PI / 2
  duto.position.set((IN.x0 + IN.x1) / 2, y + PE - 0.10, COR.z0 + 0.12)
  g.add(duto)
  for (const x of xs) g.add(box(0.12, 0.12, 0.06, M.plastico, x, y + PE - 0.10, COR.z0 + 0.13))

  // rodape de oleo (a barra escura de 1,1 m que todo predio velho tem)
  for (const z of [COR.z0 - 0.06, COR.z1 + 0.06]) {
    const r = box(IN.x1 - IN.x0, 1.10, 0.02, solid(0x5c5347, 0.95), (IN.x0 + IN.x1) / 2, y + 0.55, z)
    r.receiveShadow = true
    g.add(r)
  }

  // saco de lixo que ninguem desce + caixote + vassoura encostada
  const lixo = sacoDeLixo(1)
  lixo.position.set(IN.x0 + 0.65, y, COR.z0 + 0.45)
  g.add(lixo)
  col(cols, IN.x0 + 0.2, IN.x0 + 1.1, COR.z0 + 0.1, COR.z0 + 0.8, a, 'cort-lixo')
  if (a !== 1) {
    const cx2 = caixote(0x5c3a1e)
    cx2.position.set(IN.x1 - 0.72, y, COR.z1 - 0.42)
    cx2.rotation.y = 0.3
    g.add(cx2)
  }
  const vass = cyl(0.016, 0.016, 1.35, M.madeiraVelha, 6)
  vass.rotation.z = 0.18
  vass.position.set(IN.x1 - 0.35, y + 0.68, COR.z0 + 0.30)
  g.add(vass)
  g.add(box(0.30, 0.10, 0.09, solid(0x8a6a3a, 0.98), IN.x1 - 0.47, y + 0.06, COR.z0 + 0.30))

  // a mancha de infiltracao no forro, sempre no mesmo canto
  const inf = plane(1.8, 1.1, solid(0x4a4034, 0.99), Math.PI / 2)
  inf.position.set(38.0, y + PE - 0.01, COR.z0 + 0.6)
  g.add(inf)

  if (terreo) {
    // CAIXAS DE CORREIO, e duas delas arrombadas
    const cxs = new THREE.Group()
    const nCx = 8
    for (let i = 0; i < nCx; i++) {
      const cxp = i % 4, cyp = Math.floor(i / 4)
      const px = SAG.x0 - 0.45, py = y + 1.05 + cyp * 0.26, pz = IN.z0 + 0.9 + cxp * 0.24
      const c = box(0.14, 0.22, 0.20, M.chapa, px, py, pz)
      c.castShadow = true
      cxs.add(c)
      // a portinha: nas arrombadas ela fica pendurada e torta
      const arrombada = i === 2 || i === 5
      const pt = box(0.02, 0.19, 0.17, arrombada ? M.ferrugem : M.chapa, px - 0.08, py, pz)
      if (arrombada) { pt.rotation.x = 0.9; pt.position.z += 0.06 }
      cxs.add(pt)
      if (arrombada) {
        const carta = box(0.01, 0.10, 0.14, M.papel, px - 0.10, py - 0.16, pz)
        carta.rotation.x = 0.4
        cxs.add(carta)
      }
    }
    g.add(cxs)
    // bicicleta acorrentada embaixo da escada (so a silhueta: duas rodas e o quadro)
    const bic = new THREE.Group()
    for (const dz of [-0.52, 0.52]) {
      const roda = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.022, 6, 20), M.ferro)
      roda.position.set(0, 0.32, dz)
      bic.add(roda)
    }
    for (const [a1, b1] of [[[0, 0.32, -0.52], [0, 0.70, -0.10]], [[0, 0.70, -0.10], [0, 0.32, 0.52]],
      [[0, 0.32, 0.52], [0, 0.55, 0.30]], [[0, 0.55, 0.30], [0, 0.70, -0.10]]]) {
      const dx = b1[0] - a1[0], dy = b1[1] - a1[1], dz2 = b1[2] - a1[2]
      const L = Math.hypot(dx, dy, dz2)
      const t2 = cyl(0.016, 0.016, L, M.ferro, 6)
      t2.position.set((a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2, (a1[2] + b1[2]) / 2)
      t2.rotation.x = Math.atan2(dz2, dy) + Math.PI / 2
      bic.add(t2)
    }
    bic.position.set(ESC.laneE[0] + 0.55, y, ESC.zBoca - 1.5)
    bic.rotation.y = 0.25
    g.add(bic)
    col(cols, ESC.laneE[0], ESC.laneE[1], ESC.zBoca - 2.2, ESC.zBoca - 0.9, 0, 'cort-bike')
  }
  return bulbos
}

// ===========================================================================
// 4. O APARTAMENTO QUE ABRE
// ===========================================================================

/**
 * Um apartamento explorável: SALA (onde a porta da) e QUARTO (atras da
 * divisoria). Dois comodos, como o dono pediu, e nao um so grande — a sensacao
 * de quitinete vem justamente de ter que atravessar um comodo pra chegar no
 * outro.
 *
 * O QUE ESTA NA SALA e o que o dono descreveu: sofa velho, tv, mesa de centro
 * com "algo branco", bituca de cigarro, cerveja, whisky e o resto. Nada disso
 * tem rotulo nem nome — sao formas, pela mesma regra de mobilia/bebidas.js.
 */
function apartamento(g, cols, interactables, pisos, spec, y, registrar) {
  const a = spec.andar
  const salaZ = [spec.z0, spec.divisao]
  const quartoZ = [spec.divisao, spec.z1]
  const cxm = (spec.x0 + spec.x1) / 2

  // --- paredes do apartamento ----------------------------------------------
  // Laterais (as que separam do vizinho) e a divisoria interna com vao.
  // So as paredes que separam do VIZINHO. Onde o apartamento encosta na casca
  // (apto B a leste), a parede ja existe e desenhar outra por cima poria duas
  // superficies no mesmo plano.
  if (spec.x0 > IN.x0 + 0.05) parede(g, cols, 'z', spec.x0, spec.z0, spec.z1, y, PE, 0.14, a)
  if (spec.x1 < IN.x1 - 0.05) parede(g, cols, 'z', spec.x1, spec.z0, spec.z1, y, PE, 0.14, a)
  // O VAO INTERNO fica do MESMO lado da porta de entrada, e a mobilia toda no
  // lado oposto: assim o caminho porta -> quarto e uma faixa livre encostada na
  // parede, e a sala acontece ao lado dele em vez de no meio dele.
  const vaoInterno = spec.id === 'a' ? spec.x1 - 1.2 : spec.x0 + 1.2
  paredeComVao(g, cols, 'x', spec.divisao, spec.x0, spec.x1, vaoInterno, 1.02, y, PE, 0.12, a)

  // piso de taco (o do corredor e granilite; aqui e madeira, e isso ja diz que
  // se atravessou uma porta)
  const p = plane(spec.x1 - spec.x0 - 0.14, spec.z1 - spec.z0 - 0.1, M.pisoApto)
  p.position.set(cxm, y + 0.010, (spec.z0 + spec.z1) / 2)
  p.receiveShadow = true
  g.add(p)

  // A PORTA que abre
  const porta = portaDeApto(spec.numero, spec.portaX * 3 + a, true)
  porta.grupo.position.set(spec.portaX - PORTA_L / 2, y, COR.z1 - 0.07)
  g.add(porta.grupo)
  porta.grupo.userData.noBake = true
  // colisor da folha: some quando ela abre
  const colPorta = { minX: spec.portaX - PORTA_L / 2 + 0.02, maxX: spec.portaX + PORTA_L / 2 - 0.02,
    minZ: COR.z1 - 0.10, maxZ: COR.z1 + 0.04, andar: a, tag: 'cort-porta-' + spec.id }
  cols.push(colPorta)

  // ============ SALA =======================================================
  const salaCz = (salaZ[0] + salaZ[1]) / 2

  // O CONJUNTO DA SALA olha em Z, nao em X: sofa encostado na DIVISORIA, tv na
  // parede do corredor, mesa de centro no meio. Isso deixa uma faixa livre de
  // 2,5 m entre o conjunto e a porta — e e por essa faixa que se entra e se vai
  // pro quarto. Com o sofa virado pra parede lateral (como era), a sala inteira
  // atravessava o caminho da porta.
  const salaX = spec.id === 'a' ? spec.x0 + 1.95 : spec.x1 - 2.35
  const zSofa = salaZ[1] - 0.62
  const zTv = salaZ[0] + 0.58
  const zMesa = (zSofa + zTv) / 2

  const sofa = sofaVelho(spec.sofa)
  sofa.position.set(salaX, y, zSofa)
  sofa.rotation.y = Math.PI          // de costas pra divisoria, de frente pra tv
  g.add(sofa)
  col(cols, salaX - 0.98, salaX + 0.98, zSofa - 0.48, zSofa + 0.46, a, 'cort-sofa')

  // TV de tubo em cima de dois caixotes, encostada na parede do corredor
  const tv = tvDeTubo()
  tv.position.set(salaX, y + 0.62, zTv)
  g.add(tv)
  for (const dx of [-0.24, 0.24]) {
    const cx2 = caixote(0x4f3218)
    cx2.position.set(salaX + dx, y, zTv)
    g.add(cx2)
    const cx3 = caixote(0x5c3a1e)
    cx3.position.set(salaX + dx, y + 0.31, zTv)
    g.add(cx3)
  }
  col(cols, salaX - 0.42, salaX + 0.42, zTv - 0.34, zTv + 0.34, a, 'cort-tv')

  // A MESA DE CENTRO, entre o sofa e a tv. E o movel que o dono descreveu.
  const mesa = mesaDeCentro(spec.id)
  mesa.position.set(salaX, y, zMesa)
  mesa.rotation.y = Math.PI / 2
  g.add(mesa)
  col(cols, salaX - 0.38, salaX + 0.38, zMesa - 0.60, zMesa + 0.60, a, 'cort-mesa')

  // abajur de chao no canto da sala, do lado oposto a porta
  const lumX = spec.id === 'a' ? spec.x0 + 0.45 : spec.x1 - 0.45
  const lumZ = zSofa - 0.10
  const haste = cyl(0.022, 0.030, 1.35, M.ferrugem, 8)
  haste.position.set(lumX, y + 0.68, lumZ)
  g.add(haste)
  const cupula = cyl(0.20, 0.14, 0.24, solid(0xc8b48a, 0.96), 12)
  cupula.position.set(lumX, y + 1.44, lumZ)
  g.add(cupula)
  const lampada = sphere(0.055, M.bulbo, 8)
  lampada.position.set(lumX, y + 1.40, lumZ)
  lampada.castShadow = false
  g.add(lampada)

  // garrafas e latas no chao, dos dois lados do sofa
  const bebidas = [
    [garrafaWhiskey, salaX - 1.16, zSofa - 0.30],
    [garrafaLongNeck, salaX + 1.14, zSofa - 0.22],
    [lataCerveja, salaX + 1.02, zMesa + 0.30],
    [garrafaBatizada, salaX - 0.86, zMesa - 0.42],
  ]
  for (let i = 0; i < bebidas.length; i++) {
    const [fn, bx, bz] = bebidas[i]
    let peca = null
    try { peca = fn() } catch (err) { void err; peca = null }
    if (!peca) continue
    peca.position.set(bx, y + 0.004, bz)
    peca.rotation.y = i * 1.4
    if (i === 2) { peca.rotation.z = Math.PI / 2; peca.position.y = y + 0.031 }
    peca.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    g.add(peca)
  }

  // poster desbotado na parede lateral, atras do sofa
  const poster = plane(0.70, 0.98, solid(0x6b5a48, 0.98), 0)
  poster.rotation.y = spec.id === 'a' ? Math.PI / 2 : -Math.PI / 2
  poster.position.set(spec.id === 'a' ? spec.x0 + 0.09 : spec.x1 - 0.09, y + 1.62, zMesa)
  g.add(poster)

  // ============ QUARTO =====================================================
  const quartoCz = (quartoZ[0] + quartoZ[1]) / 2

  // A MOBILIA DO QUARTO fica toda do lado OPOSTO ao vao da divisoria, pelo
  // mesmo motivo da sala: quem entra precisa de chao livre pra entrar.
  // COLCHAO no chao, com cobertor amassado — quitinete nao tem cama
  const colX = spec.id === 'a' ? spec.x0 + 1.15 : spec.x1 - 1.15
  const colchao = box(1.90, 0.18, 1.30, solid(0xcfc6ae, 0.99), colX, y + 0.09, quartoCz)
  colchao.rotation.y = Math.PI / 2
  colchao.castShadow = true
  colchao.receiveShadow = true
  g.add(colchao)
  const cobertor = box(1.30, 0.10, 1.05, solid(0x4a3a52, 0.99), colX + 0.05, y + 0.22, quartoCz + 0.12)
  cobertor.rotation.set(0.03, Math.PI / 2, 0.02)
  cobertor.castShadow = true
  g.add(cobertor)
  const travess = box(0.55, 0.13, 0.34, solid(0xe0d8c4, 0.99), colX, y + 0.24, quartoCz - 0.75)
  travess.rotation.y = Math.PI / 2 + 0.1
  g.add(travess)
  col(cols, colX - 0.7, colX + 0.7, quartoCz - 1.0, quartoCz + 1.0, a, 'cort-colchao')

  // ARMARIO de compensado, com uma porta faltando. Do MESMO lado do colchao (o
  // vao da divisoria esta no outro), encostado na parede do fundo.
  const armX = spec.id === 'a' ? spec.x0 + 0.55 : spec.x1 - 0.55
  const arm = box(0.90, 1.85, 0.52, M.madeiraVelha, armX, y + 0.93, quartoCz - 0.9)
  arm.rotation.y = Math.PI / 2
  arm.castShadow = true
  g.add(arm)
  const portaArm = box(0.44, 1.78, 0.03, M.madeiraPorta, armX + (spec.id === 'a' ? 0.27 : -0.27), y + 0.92, quartoCz - 1.12)
  portaArm.rotation.y = Math.PI / 2 + (spec.id === 'a' ? 0.5 : -0.5)
  g.add(portaArm)
  col(cols, armX - 0.3, armX + 0.3, quartoCz - 1.4, quartoCz - 0.4, a, 'cort-armario')
  // roupa pendurada num cano, no lugar da porta que falta
  const canoRoupa = cyl(0.012, 0.012, 0.80, M.ferro, 6)
  canoRoupa.rotation.x = Math.PI / 2
  canoRoupa.position.set(armX, y + 1.62, quartoCz - 0.9)
  g.add(canoRoupa)
  const coresR = [0x3a4a5c, 0x6b4a3a, 0x2e3a30, 0x7a6a4a]
  for (let i = 0; i < 4; i++) {
    const r = box(0.30, 0.62, 0.05, solid(coresR[i], 0.98), armX - 0.14 + (i % 2) * 0.06,
      y + 1.28, quartoCz - 1.2 + i * 0.2)
    r.rotation.y = Math.PI / 2
    g.add(r)
  }

  // A MESINHA DO FUNDO: balanca, saquinhos, rolo de fita, dinheiro.
  const mx = spec.id === 'a' ? spec.x1 - 0.90 : spec.x0 + 0.90
  const mesinha = box(1.10, 0.05, 0.60, M.madeiraVelha, mx, y + 0.74, quartoCz + 1.35)
  mesinha.rotation.y = Math.PI / 2
  mesinha.castShadow = true
  g.add(mesinha)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.05, 0.74, 0.05, M.madeiraVelha, mx + sz * 0.26, y + 0.37, quartoCz + 1.35 + sx * 0.50))
  }
  col(cols, mx - 0.36, mx + 0.36, quartoCz + 0.75, quartoCz + 1.95, a, 'cort-mesinha')
  // balanca de precisao
  const bal = box(0.16, 0.035, 0.20, M.plastico, mx, y + 0.78, quartoCz + 1.10)
  g.add(bal)
  g.add(box(0.10, 0.006, 0.06, M.telaTv, mx - 0.02, y + 0.80, quartoCz + 1.02))
  // saquinhos empilhados (chapas finas leitosas com um miolo claro)
  for (let i = 0; i < 5; i++) {
    const sq = box(0.10, 0.012, 0.13, solid(0xdfe4e2, 0.75, 0.02),
      mx + (i % 2) * 0.10 - 0.05, y + 0.77 + i * 0.012, quartoCz + 1.48 + (i % 3) * 0.09)
    sq.rotation.y = i * 0.4
    g.add(sq)
    const dentro = box(0.06, 0.008, 0.08, M.po, sq.position.x, sq.position.y + 0.002, sq.position.z)
    dentro.rotation.y = sq.rotation.y
    g.add(dentro)
  }
  // maco de dinheiro com elastico
  const maco = box(0.14, 0.05, 0.075, solid(0x8a9a7a, 0.96), mx + 0.18, y + 0.79, quartoCz + 1.62)
  maco.rotation.y = 0.3
  g.add(maco)
  g.add(box(0.145, 0.052, 0.014, solid(0x6a3a3a, 0.9), mx + 0.18, y + 0.79, quartoCz + 1.62))
  // caixotes empilhados no canto
  for (let i = 0; i < 4; i++) {
    const c = caixote(i % 2 ? 0x4f3218 : 0x5c3a1e)
    c.position.set(spec.id === 'a' ? spec.x0 + 0.48 : spec.x1 - 0.48,
      y + Math.floor(i / 2) * 0.31, quartoZ[1] - 0.45 - (i % 2) * 0.44)
    c.rotation.y = i * 0.06
    g.add(c)
  }
  col(cols, (spec.id === 'a' ? spec.x0 + 0.16 : spec.x1 - 0.80),
    (spec.id === 'a' ? spec.x0 + 0.80 : spec.x1 - 0.16),
    quartoZ[1] - 1.05, quartoZ[1] - 0.16, a, 'cort-caixotes')

  // bulbo nu do quarto
  const fioQ = cyl(0.005, 0.005, 0.42, M.plastico, 4)
  fioQ.position.set(cxm, y + PE - 0.21, quartoCz)
  g.add(fioQ)
  const bq = sphere(0.05, M.bulboFraco, 8)
  bq.position.set(cxm, y + PE - 0.45, quartoCz)
  bq.castShadow = false
  g.add(bq)

  // --- o ponto de interacao da porta ---------------------------------------
  const ponto = {
    id: 'cortico-porta-' + spec.id,
    position: new THREE.Vector3(spec.portaX, y + BASE + 1.05, COR.z1 - 0.55),
    radius: 1.9,
    label: 'Bater na porta ' + spec.numero,
    onInteract: () => { if (registrar.bater) registrar.bater(spec.id) },
  }
  interactables.push(ponto)

  return {
    spec, porta, colPorta, ponto,
    // onde o morador senta, onde ele atende e por onde ele anda
    assento: new THREE.Vector3(salaX, y, zSofa + 0.02),
    assentoRot: Math.PI,
    naPorta: new THREE.Vector3(spec.portaX, y, COR.z1 + 0.80),
    deLado: new THREE.Vector3(spec.portaX + (spec.id === 'a' ? -1.0 : 1.0), y, COR.z1 + 1.15),
    y,
  }
}

/** Sofa de tres lugares, afundado no meio e com o braco furado. */
function sofaVelho(cor) {
  const g = new THREE.Group()
  const tecido = stdMat('cort-sofa:' + cor, { color: cor, roughness: 0.99 })
  const escuro = stdMat('cort-sofa-esc:' + cor, { color: cor, roughness: 1.0 })
  // base
  g.add(box(1.92, 0.34, 0.86, escuro, 0, 0.20, 0))
  // tres assentos: o do meio AFUNDADO (e onde todo mundo senta ha dez anos)
  const alturas = [0.13, 0.095, 0.125]
  for (let i = 0; i < 3; i++) {
    const s = box(0.60, alturas[i], 0.78, tecido, (i - 1) * 0.62, 0.37 + alturas[i] / 2, 0.02)
    s.castShadow = true
    s.receiveShadow = true
    g.add(s)
  }
  // encosto, inclinado
  const enc = box(1.92, 0.62, 0.22, tecido, 0, 0.72, -0.36)
  enc.rotation.x = -0.14
  enc.castShadow = true
  g.add(enc)
  for (let i = 0; i < 3; i++) {
    const alm = box(0.58, 0.50, 0.16, tecido, (i - 1) * 0.62, 0.70, -0.28)
    alm.rotation.x = -0.12
    g.add(alm)
  }
  // bracos, um deles com a espuma aparecendo
  for (const s of [-1, 1]) {
    const br = box(0.24, 0.34, 0.86, tecido, s * 0.96, 0.55, 0)
    br.castShadow = true
    g.add(br)
  }
  const rasgo = box(0.14, 0.10, 0.24, M.espuma, -0.96, 0.70, 0.20)
  rasgo.rotation.z = 0.2
  g.add(rasgo)
  // pes de madeira, um deles trocado por um tijolo
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pe = cyl(0.035, 0.030, 0.06, M.madeiraVelha, 6)
    pe.position.set(sx * 0.82, 0.03, sz * 0.34)
    g.add(pe)
  }
  const tij = box(0.20, 0.07, 0.10, M.tijolo, -0.82, 0.035, 0.34)
  g.add(tij)
  return g
}

/** TV de tubo, com a tela acesa e a antena de orelha torta. */
function tvDeTubo() {
  const g = new THREE.Group()
  g.name = 'cort-tv'
  g.userData.noBake = true                    // a tela pisca
  const caixa = box(0.62, 0.50, 0.52, solid(0x3a3630, 0.86), 0, 0, 0)
  caixa.castShadow = true
  g.add(caixa)
  // a moldura e a tela levemente convexa
  g.add(box(0.56, 0.44, 0.02, solid(0x24211d, 0.8), 0, 0.01, 0.262))
  const tela = box(0.48, 0.36, 0.015, M.telaTv, 0, 0.02, 0.272)
  tela.castShadow = false
  tela.name = 'cort-tela'
  g.add(tela)
  // botoes e a grade do alto-falante
  for (let i = 0; i < 4; i++) {
    const b = cyl(0.014, 0.014, 0.015, solid(0x1a1816, 0.8), 8)
    b.rotation.x = Math.PI / 2
    b.position.set(0.245, 0.12 - i * 0.055, 0.262)
    g.add(b)
  }
  // antena de orelha, uma haste torta
  for (const s of [-1, 1]) {
    const h = cyl(0.006, 0.004, 0.52, M.inox, 5)
    h.position.set(s * 0.10, 0.50, -0.10)
    h.rotation.z = s * 0.55
    h.rotation.x = -0.2
    g.add(h)
  }
  g.add(box(0.10, 0.05, 0.08, M.plastico, 0, 0.27, -0.10))
  return g
}

/**
 * A MESA DE CENTRO. O movel que conta a historia do apartamento.
 *
 * Tudo aqui e FORMA, sem uma letra em lugar nenhum — a mesma regra que vale pras
 * garrafas do jogo inteiro. O que ha: o espelho com as carreiras e a lamina, o
 * cinzeiro transbordando de bituca, o prato com o po, a caixinha de fumo com o
 * mato picado e a seda, o isqueiro, o maco amassado e o cinzeiro do lado.
 */
function mesaDeCentro(id) {
  const g = new THREE.Group()
  // tampo de vidro sobre estrutura de madeira, com o canto lascado
  const tampo = box(1.06, 0.035, 0.58, stdMat('cort-tampo', {
    color: 0x6a6a68, transparent: true, opacity: 0.55, roughness: 0.15,
    side: THREE.DoubleSide, depthWrite: false,
  }), 0, 0.40, 0)
  g.add(tampo)
  g.add(box(1.10, 0.05, 0.62, M.madeiraVelha, 0, 0.36, 0))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.055, 0.36, 0.055, M.madeiraVelha, sx * 0.48, 0.18, sz * 0.24))
  }
  // prateleira de baixo, com revistas empilhadas
  g.add(box(0.98, 0.03, 0.50, M.madeiraVelha, 0, 0.14, 0))
  for (let i = 0; i < 5; i++) {
    const rev = box(0.24, 0.008, 0.32, solid([0xb0a48a, 0x8a6a5a, 0x6a7a8a][i % 3], 0.96),
      -0.22 + (i % 2) * 0.06, 0.16 + i * 0.009, 0.02 + (i % 3) * 0.03)
    rev.rotation.y = i * 0.14
    g.add(rev)
  }

  const yT = 0.418

  // --- O ESPELHO com as carreiras e a lamina --------------------------------
  const esp = box(0.30, 0.008, 0.22, stdMat('cort-espelho', {
    color: 0x0e1216, roughness: 0.06, metalness: 0.8,
  }), -0.24, yT, -0.06)
  esp.rotation.y = 0.12
  g.add(esp)
  // TRES CARREIRAS. Sao caixas de 2 mm; o que faz elas lerem e o contraste com
  // o espelho preto embaixo, nao o volume.
  for (let i = 0; i < 3; i++) {
    const linha = box(0.19, 0.004, 0.011, M.po, -0.245, yT + 0.006, -0.115 + i * 0.045)
    linha.rotation.y = 0.12
    g.add(linha)
  }
  // o monte que sobrou, num canto do espelho
  const monte = cyl(0.030, 0.042, 0.016, M.po, 10)
  monte.position.set(-0.155, yT + 0.010, 0.005)
  g.add(monte)
  // a lamina e o canudo (um tubinho de papel enrolado)
  const lam = box(0.035, 0.002, 0.020, M.inox, -0.31, yT + 0.006, 0.03)
  lam.rotation.y = -0.5
  g.add(lam)
  const canudo = cyl(0.006, 0.006, 0.075, M.papel, 6)
  canudo.rotation.set(Math.PI / 2, 0, 0.7)
  canudo.position.set(-0.13, yT + 0.008, -0.14)
  g.add(canudo)

  // --- CINZEIRO transbordando ----------------------------------------------
  const cz = cyl(0.075, 0.060, 0.030, solid(0x4d4a45, 0.72), 12)
  cz.position.set(0.20, yT + 0.014, -0.10)
  g.add(cz)
  const nB = 11
  const bitucas = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.036, 5), solid(0xd8cfb8, 0.98), nB,
  )
  const d0 = new THREE.Object3D()
  for (let i = 0; i < nB; i++) {
    const ang = (i / nB) * Math.PI * 2
    const r = 0.018 + (i % 3) * 0.014
    d0.position.set(0.20 + Math.cos(ang) * r, yT + 0.026 + (i % 2) * 0.008, -0.10 + Math.sin(ang) * r)
    d0.rotation.set(Math.PI / 2 + (i % 3) * 0.12, ang, (i % 2) * 0.3)
    d0.updateMatrix()
    bitucas.setMatrixAt(i, d0.matrix)
  }
  bitucas.instanceMatrix.needsUpdate = true
  bitucas.castShadow = false
  g.add(bitucas)
  // cinza derramada em volta
  const cinza = plane(0.20, 0.14, solid(0x6a6660, 0.99))
  cinza.position.set(0.20, yT + 0.003, 0.02)
  g.add(cinza)

  // --- O FUMO: a caixinha, o mato picado, a seda e o desfiador --------------
  const cxF = box(0.14, 0.045, 0.10, M.madeiraVelha, 0.36, yT + 0.022, 0.13)
  cxF.rotation.y = -0.25
  g.add(cxF)
  // o mato picado, espalhado por cima do papel: 9 cacos verdes irregulares
  const papelF = box(0.13, 0.002, 0.10, M.papel, 0.15, yT + 0.002, 0.14)
  papelF.rotation.y = 0.18
  g.add(papelF)
  const nM = 9
  const mato = new THREE.InstancedMesh(new THREE.BoxGeometry(0.012, 0.008, 0.016), M.verdeSeco, nM)
  for (let i = 0; i < nM; i++) {
    const rx = Math.sin(i * 3.7) * 0.045, rz = Math.cos(i * 2.3) * 0.035
    d0.position.set(0.15 + rx, yT + 0.007, 0.14 + rz)
    d0.rotation.set(i * 0.5, i * 1.1, i * 0.3)
    d0.scale.setScalar(0.7 + (i % 3) * 0.25)
    d0.updateMatrix()
    mato.setMatrixAt(i, d0.matrix)
  }
  mato.instanceMatrix.needsUpdate = true
  mato.castShadow = false
  g.add(mato)
  d0.scale.setScalar(1)
  // o desfiador (moedor de metal) e o livrinho de seda
  const moedor = cyl(0.028, 0.028, 0.020, M.inox, 12)
  moedor.position.set(0.05, yT + 0.012, 0.19)
  g.add(moedor)
  const seda = box(0.035, 0.006, 0.055, M.papel, 0.28, yT + 0.005, 0.20)
  seda.rotation.y = 0.4
  g.add(seda)
  // isqueiro e maco amassado
  const isq = box(0.022, 0.012, 0.058, solid(id === 'a' ? 0xb03a2a : 0x2a5aa0, 0.6), 0.44, yT + 0.008, -0.06)
  isq.rotation.y = 0.6
  g.add(isq)
  const maco = box(0.055, 0.085, 0.024, solid(0xd8d2c2, 0.94), -0.42, yT + 0.044, 0.16)
  maco.rotation.set(0.1, -0.3, 0.06)
  g.add(maco)

  // uma lata amassada e um copo com resto de bebida
  const lataA = cyl(0.031, 0.031, 0.10, M.inox, 12)
  lataA.rotation.set(Math.PI / 2, 0, 0.5)
  lataA.position.set(0.40, yT + 0.032, -0.20)
  g.add(lataA)
  const copo = cyl(0.033, 0.030, 0.088, stdMat('cort-copo', {
    color: 0xdfe8ea, transparent: true, opacity: 0.30, roughness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  }), 12)
  copo.position.set(-0.05, yT + 0.044, -0.16)
  g.add(copo)
  const resto = cyl(0.028, 0.026, 0.020, solid(0x7a4a1a, 0.3, 0.0), 10)
  resto.position.set(-0.05, yT + 0.012, -0.16)
  g.add(resto)
  return g
}

// ===========================================================================
// 5. O MORADOR
// ===========================================================================

/**
 * O MORADOR, e a cena inteira que o dono pediu:
 *
 *   bate na porta -> TOC TOC TOC -> dois segundos -> ele levanta do sofa,
 *   vem ate a porta, abre, te recebe pelo nome que voce nao sabe, SAI DA
 *   FRENTE, volta pro sofa, senta e continua fumando.
 *
 * A maquina de estados abaixo e literalmente essa frase. Os dois segundos sao
 * do pedido; o resto dos tempos saiu de encenar: ele leva 1,4 s pra atravessar
 * a sala (nao teleporta), a fala fica 4 s na tela, e o caminho de volta e o
 * mesmo de ida ao contrario.
 *
 * O CIGARRO e enrolado a mao — papel branco, torto, com a ponta retorcida e a
 * brasa que acende quando ele traga. A fumaca sai de render/fumaca.js: um fiapo
 * continuo saindo da ponta acesa e uma baforada de verdade quando ele solta.
 */
function criarMorador(g, apto, fumaca, legenda) {
  const spec = apto.spec
  const m = spec.morador
  let npc = null
  try {
    npc = createNPC({
      name: m.nome,
      pose: 'sit',
      x: apto.assento.x, y: 0, z: apto.assento.z,
      rotY: apto.assentoRot,
      shirt: m.camisa,
      pants: m.calca,
      shoes: m.tenis,
      appearance: {
        cabeca: 2, olhos: 1, nariz: 2, boca: 1, barba: m.barba,
        cabelo: m.cabelo, pele: m.pele, corCabelo: m.corCabelo,
        corBarba: m.corBarba, sobrancelha: 1,
        chapeu: 0, calcado: 2, blusa: 1, calca: 1,
      },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })
  root.userData.noBake = true
  // o NPC mora no ANDAR dele: setBaseY levanta o boneco sem mexer em x/z
  npc.setBaseY(apto.y)
  g.add(root)

  // --- O CIGARRO ------------------------------------------------------------
  // Ele fica na mao direita. O papel e branco-sujo e o corpo tem um leve
  // afunilamento com a ponta torcida: cigarro de fumo enrolado nao e um
  // cilindro perfeito, e e essa torcao que o separa de um de maquina.
  const cigarro = new THREE.Group()
  const corpo = cyl(0.0042, 0.0050, 0.072, solid(0xefe9da, 0.94), 7)
  corpo.rotation.z = Math.PI / 2
  cigarro.add(corpo)
  const torcida = cyl(0.0016, 0.0042, 0.014, solid(0xe4dcc6, 0.96), 6)
  torcida.rotation.z = -Math.PI / 2
  torcida.position.x = 0.043
  cigarro.add(torcida)
  const brasa = cyl(0.0044, 0.0044, 0.008, M.brasaCigarro, 7)
  brasa.rotation.z = Math.PI / 2
  brasa.position.x = -0.038
  brasa.castShadow = false
  cigarro.add(brasa)
  // a cinza acumulada logo atras da brasa
  const cinzaC = cyl(0.0046, 0.0044, 0.010, solid(0x8a857c, 0.99), 7)
  cinzaC.rotation.z = Math.PI / 2
  cinzaC.position.x = -0.029
  cigarro.add(cinzaC)
  cigarro.name = 'cigarro'
  const maoD = npc.character && npc.character.parts && npc.character.parts.handR
  if (maoD) {
    cigarro.position.set(0.012, -0.055, 0.030)
    cigarro.rotation.set(0.2, 0.4, 0.5)
    maoD.add(cigarro)
  } else {
    cigarro.visible = false
  }

  // --- estado ---------------------------------------------------------------
  const est = {
    fase: 'sentado',        // sentado | batendo | vindo | falando | saindo | voltando
    t: 0,
    porta: 0,               // 0..1 do giro da folha
    aberta: false,
    // fumo
    tFumo: 1.5,
    tragada: 0,             // 0..1 no gesto de levar a mao a boca
    tFiapo: 0,
  }
  const _pontaMundo = new THREE.Vector3()
  const _dir = new THREE.Vector3()

  /** Onde a ponta acesa esta, em coordenadas de mundo. */
  function ponta(alvo) {
    if (!maoD) return alvo.copy(apto.assento)
    brasa.updateWorldMatrix(true, false)
    return alvo.setFromMatrixPosition(brasa.matrixWorld)
  }

  function bater() {
    if (est.fase !== 'sentado' || est.aberta) return false
    est.fase = 'batendo'
    est.t = 0
    somBater()
    return true
  }

  function atualizar(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    est.t += d

    // --- a maquina de estados ------------------------------------------------
    switch (est.fase) {
      case 'batendo':
        // 1,15 s de espera mais 0,95 de travessia dao os DOIS SEGUNDOS do
        // pedido ("ao bater passa 2 s um NPC aparece pra te receber") contados
        // ate ele estar na porta — e nao ate ele comecar a levantar. A batida
        // em si dura 0,53 s (ver audio/som.js), entao ele so se mexe depois do
        // terceiro toc, que e o que faz parecer que ele ouviu.
        if (est.t > 1.15) {
          est.fase = 'vindo'
          est.t = 0
          npc.setPose('idle')
        }
        break
      case 'vindo': {
        const k = Math.min(1, est.t / 0.95)
        root.position.x = apto.assento.x + (apto.naPorta.x - apto.assento.x) * k
        root.position.z = apto.assento.z + (apto.naPorta.z - apto.assento.z) * k
        // passo: o corpo sobe e desce, e e so isso que separa andar de deslizar
        npc.setBaseY(apto.y + Math.abs(Math.sin(est.t * 9)) * 0.035)
        _dir.set(apto.naPorta.x - apto.assento.x, 0, apto.naPorta.z - apto.assento.z)
        if (_dir.lengthSq() > 1e-6) root.rotation.y = Math.atan2(_dir.x, _dir.z)
        // a porta abre no meio do caminho
        if (est.t > 0.42) est.porta = Math.min(1, (est.t - 0.42) / 0.45)
        if (est.porta > 0 && !est.aberta) {
          est.aberta = true
          somPorta(0.6)
        }
        if (k >= 1) {
          est.fase = 'falando'
          est.t = 0
          root.rotation.y = 0                     // encara quem bateu (o corredor)
          npc.setBaseY(apto.y)
          if (legenda) legenda.falar(m.nome, m.fala, 4.2)
        }
        break
      }
      case 'falando':
        if (est.t > 2.4) {
          est.fase = 'saindo'
          est.t = 0
        }
        break
      case 'saindo': {
        const k = Math.min(1, est.t / 0.7)
        root.position.x = apto.naPorta.x + (apto.deLado.x - apto.naPorta.x) * k
        root.position.z = apto.naPorta.z + (apto.deLado.z - apto.naPorta.z) * k
        npc.setBaseY(apto.y + Math.abs(Math.sin(est.t * 9)) * 0.03)
        if (k >= 1) { est.fase = 'voltando'; est.t = 0 }
        break
      }
      case 'voltando': {
        const k = Math.min(1, est.t / 1.6)
        root.position.x = apto.deLado.x + (apto.assento.x - apto.deLado.x) * k
        root.position.z = apto.deLado.z + (apto.assento.z - apto.deLado.z) * k
        npc.setBaseY(apto.y + Math.abs(Math.sin(est.t * 8)) * 0.032)
        _dir.set(apto.assento.x - apto.deLado.x, 0, apto.assento.z - apto.deLado.z)
        if (_dir.lengthSq() > 1e-6) root.rotation.y = Math.atan2(_dir.x, _dir.z)
        if (k >= 1) {
          est.fase = 'sentado'
          est.t = 0
          npc.setPose('sit')
          npc.setBaseY(apto.y)
          root.position.set(apto.assento.x, root.position.y, apto.assento.z)
          root.rotation.y = apto.assentoRot
        }
        break
      }
      default:
        break
    }

    npc.update(d)

    // --- O GESTO DE FUMAR -----------------------------------------------------
    //
    // Roda depois de npc.update() DE PROPOSITO: o update escreve a pose base nas
    // juntas, e o que se quer aqui e escrever POR CIMA dela, so no braco direito.
    // Antes, a pose apagaria o gesto todo quadro.
    const parts = npc.character && npc.character.parts
    if (parts && est.fase === 'sentado' && m.fuma) {
      est.tFumo -= d
      if (est.tFumo <= 0 && est.tragada <= 0) {
        est.tragada = 0.0001
        est.tFumo = 6.5 + Math.random() * 4
      }
      if (est.tragada > 0) {
        // 3,4 s de gesto: sobe (0-25%), segura na boca tragando (25-45%),
        // desce (45-70%), e solta a fumaca em 75%
        est.tragada = Math.min(1, est.tragada + d / 3.4)
        const k = est.tragada
        const subida = k < 0.25 ? k / 0.25 : k < 0.45 ? 1 : k < 0.70 ? 1 - (k - 0.45) / 0.25 : 0
        const s = subida * subida * (3 - 2 * subida)
        if (parts.armRUpper) parts.armRUpper.rotation.x += -0.62 * s
        if (parts.armRLower) parts.armRLower.rotation.x += -1.42 * s
        if (parts.handR) parts.handR.rotation.x += -0.35 * s
        // a brasa acende na tragada
        brasa.material.emissiveIntensity = 3.0 + (k > 0.25 && k < 0.45 ? 3.2 : 0)
        // A BAFORADA: uma so, no instante em que ele tira da boca
        if (k >= 0.72 && k - d / 3.4 < 0.72 && fumaca) {
          const cab = parts.head || root
          cab.updateWorldMatrix(true, false)
          _pontaMundo.setFromMatrixPosition(cab.matrixWorld)
          _pontaMundo.y -= 0.05
          _dir.set(Math.sin(root.rotation.y), 0.15, Math.cos(root.rotation.y))
          fumaca.soprar(_pontaMundo, _dir, 1)
        }
        if (est.tragada >= 1) est.tragada = 0
      } else {
        brasa.material.emissiveIntensity = 2.4 + Math.sin(est.t * 2.1) * 0.3
      }
      // O FIAPO: o cigarro aceso solta fumaca sozinho, sem ninguem tragar. E o
      // que faz o personagem parecer estar fumando entre uma tragada e outra.
      est.tFiapo -= d
      if (est.tFiapo <= 0 && fumaca) {
        est.tFiapo = 0.75
        ponta(_pontaMundo)
        _dir.set(0, 1, 0)
        fumaca.soprar(_pontaMundo, _dir, 0.28)
      }
    }
    if (cigarro) cigarro.visible = est.fase === 'sentado' || est.fase === 'falando'

    // olha pro jogador quando ele esta perto
    const pl = gm && gm.player && gm.player.position
    if (pl) {
      const dx = pl.x - root.position.x, dz = pl.z - root.position.z
      const dy = Math.abs(pl.y - (apto.y + BASE))
      if (dx * dx + dz * dz < 36 && dy < 2.0) {
        const ch = gm.character
        npc.lookTarget = (ch && ch.parts && ch.parts.head) || (ch && ch.root) || null
      } else if (npc.lookTarget) npc.lookTarget = null
    }
  }

  return { npc, bater, atualizar, estado: est }
}

// ===========================================================================
// O MONTADOR
// ===========================================================================

export function buildCortico(game) {
  const group = new THREE.Group()
  group.name = 'cortico-117'
  const colliders = []
  const interactables = []
  const occluders = []
  const luzes = []

  const pisos = game && game.pisos
  if (!pisos) {
    console.warn('cortico: game.pisos nao existe — o predio sai sem andar')
  }
  const pisosOu = pisos || { laje() {}, rampa() {} }

  // --- casca (sempre visivel) ----------------------------------------------
  const casaco = new THREE.Group()
  casaco.name = 'cortico-casca'
  group.add(casaco)
  casca(casaco, colliders, occluders)
  aventalDaCalcada(casaco)

  // --- escada: atravessa os tres andares, entao vive fora deles -------------
  const poco = new THREE.Group()
  poco.name = 'cortico-escada'
  group.add(poco)
  escada(poco, colliders, pisosOu, BASE)

  // --- os tres andares ------------------------------------------------------
  const registrar = {}
  const grupos = []
  const aptos = []
  for (let a = 0; a < NIVEIS.length; a++) {
    const gA = new THREE.Group()
    gA.name = 'cortico-andar-' + a
    group.add(gA)
    grupos.push(gA)
    const feito = andarDoPredio(gA, colliders, interactables, pisosOu, a, BASE, registrar)
    if (feito) aptos.push(Object.assign({}, feito, { grupo: gA }))
  }

  // --- a porta da rua: sempre aberta, com a fechadura arrebentada -----------
  portaDeRua(casaco, colliders)

  // --- luz -----------------------------------------------------------------
  // DUAS PointLight, e as duas moram na RAIZ (nunca somem com o LOD): a
  // contagem de luzes visiveis da cena entra no shader de TODO material, e
  // luzes que aparecem e somem recompilam a cena inteira no meio do quadro
  // (a mesma armadilha documentada em render/luzes-efeito.js).
  //
  // Elas NAO ficam paradas: o `update` move as duas pro andar em que o jogador
  // esta. Duas luzes que seguem sao doze luzes de custo zero — e um predio de
  // tres andares com um corredor e duas quitinetes precisaria de doze.
  const luzCorredor = new THREE.PointLight(0xffca86, 22, 13, 2)
  luzCorredor.castShadow = false
  luzCorredor.position.set(39.8, BASE + 2.4, (COR.z0 + COR.z1) / 2)
  group.add(luzCorredor)
  luzes.push(luzCorredor)
  const luzApto = new THREE.PointLight(0xffb46a, 20, 11, 2)
  luzApto.castShadow = false
  luzApto.position.set(35.0, BASE + 2.3, -38.0)
  group.add(luzApto)
  luzes.push(luzApto)

  group.position.y = 0        // tudo aqui ja e coordenada de mundo em X/Z e Y local + BASE

  // --- a fumaca (uma so pro predio inteiro) --------------------------------
  const fumaca = criarFumaca({ camera: game && game.camera, n: 22 })
  group.add(fumaca.grupo)

  // --- os moradores ---------------------------------------------------------
  const legenda = game && game.legenda
  const moradores = []
  for (const ap of aptos) {
    const mor = criarMorador(ap.grupo, ap, fumaca, legenda)
    if (mor) moradores.push({ mor, ap })
  }
  registrar.bater = (id) => {
    const alvo = moradores.find((q) => q.ap.spec.id === id)
    if (!alvo) return
    if (alvo.mor.estado.aberta) {
      if (game && game.toast) game.toast('A porta ja esta aberta.')
      return
    }
    if (!alvo.mor.bater()) return
    if (game && game.toast) game.toast('Voce bate. Do lado de dentro, alguem se mexe.')
  }

  // --- o forno, um grupo de cada vez ----------------------------------------
  group.updateMatrixWorld(true)
  console.info('cortico casca:', bakeStatic(casaco))
  console.info('cortico escada:', bakeStatic(poco))
  for (let a = 0; a < grupos.length; a++) {
    console.info('cortico andar ' + a + ':', bakeStatic(grupos[a]))
  }

  // --- colisores: registrados DE VERDADE, pra poder ligar e desligar --------
  //
  // Aqui esta a segunda metade do "o jogo passou a ter andar". A grade de
  // colisao e XZ pura, sem altura: a parede do 2o andar empurra quem esta no
  // terreo. Como cada andar tem planta propria (o apartamento aberto muda de
  // canto), a saida e ligar so o conjunto do andar em que o jogador esta.
  //
  // O `collision.add()` COPIA o que recebe pra dentro da grade, entao mexer no
  // objeto que a gente passou nao mexeria em nada — e por isso que a lista
  // devolvida e guardada. Mesmo motivo da porta da casa velha.
  const caixas = (game && game.collision) ? game.collision.add(colliders) : []
  for (let i = 0; i < caixas.length; i++) caixas[i].andar = colliders[i].andar

  const porPorta = new Map()
  for (const ap of aptos) {
    const idx = colliders.indexOf(ap.colPorta)
    if (idx >= 0 && caixas[idx]) porPorta.set(ap.spec.id, caixas[idx])
  }

  // A SENTINELA. Um colisor qualquer do 1o andar; se ele estiver LIGADO com o
  // jogador em outro andar, alguem religou tudo por fora e a selecao precisa
  // ser refeita.
  //
  // E alguem religa mesmo, e nao e bug: cenario/cenarios.js GRAVA todo colisor
  // criado durante a construcao da cidade e, ao mostrar o cenario, devolve
  // `ativo = true` pra tudo que ele nao tinha desligado ele mesmo (o comentario
  // de la explica por que — "nao da pra religar tudo no cego"). Isso roda uma
  // vez no boot, DEPOIS deste build, e outra a cada F6 de volta pra cidade. Sem
  // a sentinela, o predio nascia com as paredes dos tres andares ligadas ao
  // mesmo tempo, e o sintoma era o corredor do terreo intransponivel — parede
  // invisivel bem no meio do vao do saguao.
  let andarAtual = -1
  let sentinela = null
  for (const c of caixas) { if (c.andar === 1) { sentinela = c; break } }

  function ligarAndar(n, forcar) {
    if (n === andarAtual && !forcar) return
    andarAtual = n
    for (const c of caixas) {
      if (c.andar === undefined) { c.ativo = true; continue }
      c.ativo = c.andar === n
    }
    // as portas abertas continuam abertas
    for (const [id, cx] of porPorta) {
      const mor = moradores.find((q) => q.ap.spec.id === id)
      if (mor && mor.mor.estado.aberta) cx.ativo = false
    }
  }
  /** Reaplica quando alguem religou a grade por fora (ver a sentinela). */
  function conferirAndar(n) {
    if (sentinela && sentinela.ativo !== (sentinela.andar === andarAtual)) {
      ligarAndar(n, true)
      return
    }
    ligarAndar(n)
  }
  ligarAndar(0, true)

  // ---- LOD e update --------------------------------------------------------
  const DENTRO = { x0: B.x0 - 4, x1: B.x1 + 4, z0: B.z0 - 4, z1: B.z1 + 4 }
  let t = 0
  const telaTv = []
  group.traverse((o) => { if (o.name === 'cort-tela') telaTv.push(o) })

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    t += d
    const pos = gm && gm.player && gm.player.position
    const dentro = pos
      ? (pos.x > DENTRO.x0 && pos.x < DENTRO.x1 && pos.z > DENTRO.z0 && pos.z < DENTRO.z1)
      : false

    // ANDAR ATUAL, do Y do jogador. `round` e nao `floor`: no meio da escada o
    // jogador esta entre dois andares, e o que importa e de qual planta ele
    // esta mais perto — a colisao tem que trocar antes de ele chegar em cima.
    if (pos && dentro) {
      const n = Math.max(0, Math.min(NIVEIS.length - 1, Math.round((pos.y - BASE) / ANDAR)))
      conferirAndar(n)
      // a luz do corredor e a do apartamento SEGUEM o jogador de andar
      const yA = BASE + NIVEIS[n]
      luzCorredor.position.y = yA + 2.40
      luzApto.position.y = yA + 2.30
      // a segunda luz vai pra SALA do apartamento aberto daquele andar; nos
      // andares sem apartamento ela fica na ponta oeste do corredor, que e o
      // trecho mais longe da luz do meio
      const apAqui = aptos.find((q) => q.spec.andar === n)
      if (apAqui) {
        luzApto.position.x = (apAqui.spec.x0 + apAqui.spec.x1) / 2
        luzApto.position.z = (apAqui.spec.z0 + apAqui.spec.divisao) / 2
      } else {
        luzApto.position.x = IN.x0 + 2.0
        luzApto.position.z = (COR.z0 + COR.z1) / 2
      }
    } else {
      conferirAndar(0)
    }

    // LOD: so os andares perto do jogador ficam em cena. 2,2 m de folga deixa
    // DOIS andares acesos quando ele esta no meio da escada, que e a unica hora
    // em que os dois aparecem na mesma imagem.
    for (let a = 0; a < grupos.length; a++) {
      const quer = dentro && pos ? Math.abs((BASE + NIVEIS[a]) - pos.y) < 2.2 : false
      if (grupos[a].visible !== quer) grupos[a].visible = quer
    }
    poco.visible = dentro

    // a TV chia: o brilho da tela anda sozinho
    for (const tela of telaTv) {
      tela.material.emissiveIntensity = 1.2 + Math.sin(t * 11.3) * 0.25 + Math.sin(t * 3.1) * 0.2
    }

    for (const q of moradores) {
      q.mor.atualizar(d, gm)
      // o giro da folha e a colisao dela
      const cx = porPorta.get(q.ap.spec.id)
      q.ap.porta.pivo.rotation.y = -q.mor.estado.porta * 1.55
      if (cx) cx.ativo = (cx.andar === andarAtual) && q.mor.estado.porta < 0.35
    }

    fumaca.atualizar(d)
  }

  return {
    group,
    // COLISORES VAZIO DE PROPOSITO. O mount() do main registra o que vem neste
    // campo, e este modulo JA registrou tudo ele mesmo, logo acima — precisava
    // das caixas de verdade na mao pra ligar e desligar por andar. Devolver a
    // lista aqui registraria o predio inteiro duas vezes.
    colliders: [],
    interactables, occluders, update,
    casca: casaco, andares: grupos, aptos, moradores, luzes, fumaca,
    /** Pro teste: bate na porta do apartamento `id` sem passar pela tecla. */
    bater(id) { if (registrar.bater) registrar.bater(id) },
    get andarAtual() { return andarAtual },
  }
}

/** O avental de calcada do lote, que groundY() promete e ninguem desenha. */
function aventalDaCalcada(g) {
  const matAv = stdMat('cort-avental', {
    map: tiled(concreteTex(1), 6, 8), color: 0x9d9a92, roughness: 0.95,
  })
  function faixa(x0, x1, z0, z1) {
    const a = box(x1 - x0, BASE, z1 - z0, matAv, (x0 + x1) / 2, BASE / 2, (z0 + z1) / 2)
    a.receiveShadow = true
    g.add(a)
  }
  // Oeste, leste e o fundo. A frente (z < -48) e a calcada do anel, que city.js
  // ja desenha em 0.16 — pintar por cima poria duas lajes disputando a mesma
  // superficie, que e o z-fighting que semLotes() existe pra matar.
  faixa(B.x0 - 0.9, B.x0, B.z0, B.z1 + 0.9)
  faixa(B.x1, B.x1 + 0.9, B.z0, B.z1 + 0.9)
  faixa(B.x0 - 0.9, B.x1 + 0.9, B.z1, B.z1 + 0.9)
}

/** A porta da rua: de ferro, escancarada, com a fechadura arrebentada. */
function portaDeRua(g, cols) {
  const z = B.z0 + WALL_T / 2
  const dl = B.door.center - B.door.width / 2
  // a folha, aberta pra dentro e encostada na parede — ninguem tranca isto ha
  // anos, e a chapa de reforco em volta da fechadura conta por que
  const pivo = new THREE.Group()
  pivo.position.set(dl, BASE, z)
  const folha = box(B.door.width, B.door.height, 0.06, M.chapa, B.door.width / 2, B.door.height / 2, 0)
  folha.castShadow = true
  pivo.add(folha)
  for (const y of [0.5, 1.2, 1.9]) {
    pivo.add(box(B.door.width - 0.08, 0.06, 0.02, M.ferrugem, B.door.width / 2, y, 0.04))
  }
  // vidro martelado na parte de cima, um quadrante quebrado
  pivo.add(box(B.door.width - 0.3, 0.55, 0.02, M.janela, B.door.width / 2, 1.82, 0.035))
  // a chapa em volta da fechadura, e o buraco onde ela era
  pivo.add(box(0.22, 0.30, 0.02, M.ferrugem, B.door.width - 0.16, 1.02, 0.04))
  pivo.add(box(0.05, 0.09, 0.03, solid(0x0d0f11, 0.9), B.door.width - 0.16, 1.02, 0.05))
  pivo.rotation.y = -2.05        // escancarada contra a parede do saguao
  g.add(pivo)
  // batentes
  for (const s of [-1, 1]) {
    g.add(box(0.10, B.door.height + 0.1, 0.34, M.ferro,
      B.door.center + s * (B.door.width / 2 + 0.05), BASE + (B.door.height + 0.1) / 2, z))
  }
  // um degrau na soleira
  const deg = box(B.door.width + 0.9, BASE + 0.02, 0.55, M.concreto,
    B.door.center, (BASE + 0.02) / 2, B.z0 - 0.3)
  deg.receiveShadow = true
  g.add(deg)
  void cols
}

export default buildCortico
