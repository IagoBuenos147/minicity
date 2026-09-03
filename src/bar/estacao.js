import * as THREE from 'three'
import {
  solid, stdMat, emissive, glass, box, cyl, tex, woodTex, textPlaneMat,
} from '../world/materials.js'
import { criarTorneira } from '../mobilia/barril.js'
import { copoDe } from '../mobilia/copos.js'
import {
  garrafaLicor, garrafaVermute, garrafaAgave, garrafaXarope,
  garrafaTriangular, garrafaCantil, garrafaDeFundo,
  garrafaVodka, garrafaWhiskey,
} from '../mobilia/bebidas.js'
import {
  dosador, mexedorDeBar, coadorDeMola, pincaDeGelo, tabuaDeCorte, facaDeBar,
  pistolaDeRefri, escorredorDeCopos, geoGelo, matGelo, matGeloMiolo,
} from '../mobilia/utensilios.js'
import { FRUTAS, caixaDeFeira, guarnicaoDaFruta } from '../mobilia/frutas.js'
import { canudo as canudoUt, sombrinha } from '../mobilia/utensilios.js'
import { criarCoqueteleira } from './coqueteleira.js'
import { criarLiquidificador } from './liquidificador.js'
import { INGREDIENTES, ingredienteDe, guarnicaoDe } from './receitas.js'

// ---------------------------------------------------------------------------
// src/bar/estacao.js — A BANCADA, A PAREDE DE BEBIDAS E A FRUTEIRA.
//
// Este arquivo constroi o LUGAR. Ele nao sabe fazer drink nenhum: quem sabe e
// bar/gestos.js, que recebe daqui as pecas vivas (as torneiras, a coqueteleira,
// o liquidificador, a pinca) e a lista de ALVOS.
//
// ================== O ALVO, E POR QUE ELE NAO E UM RAYCAST ==================
//
// A bancada tem umas setenta coisas clicaveis e todas elas sao ESTATICAS. Como
// todo interior deste jogo, o cassino passa por bakeStatic (main.js chama
// bakeStatic(casino.group)), e o forno FUNDE os meshes por material: depois
// dele nao existe mais "a garrafa de zimbro" como objeto — existe um mesh so
// com o vidro de trinta garrafas dentro. Raycast nesse mesh devolve o mesh
// fundido, e nao da pra saber em qual garrafa o jogador clicou.
//
// Nao da pra tirar a parede do forno: sao ~250 malhas, e o cassino inteiro tem
// orcamento de 1200 draw calls pro mapa todo.
//
// Entao o alvo NAO E GEOMETRIA, e um PONTO com um rotulo:
//
//   { id, tipo, pos (MUNDO), raio, rotulo, dado, foco }
//
// e quem escolhe e a projecao na tela: de todos os alvos visiveis, ganha o mais
// perto do ponteiro. E o mesmo desenho que mobilia/bar.js ja usa pras cinco
// vagas da prateleira da casa ("cinco pontos de interacao a 32 cm um do outro
// NAO funcionam"), levado ao caso em que ha setenta. Ele ainda e MAIS
// tolerante que o raycast, que e o que se quer num jogo: acertar uma garrafa de
// 7 cm a dois metros com o ponteiro seria um teste de pontaria, e o gesto que o
// dono pediu e pegar a garrafa, nao mirar nela.
//
// ============================ A PLANTA DO BAR ==============================
//
// Tudo em X e Z de MUNDO; o Y e LOCAL do miolo do cassino (piso em 0, o grupo
// inteiro ja subiu `base`). A faixa que o bar ocupa foi combinada com os outros
// dois modulos que constroem o mesmo salao (a cozinha entra a leste, as mesas
// ficam ao sul), e os numeros abaixo sao a fronteira:
//
//   z=29.70  #################### parede do fundo ####################
//   z=29.68..29.38   PAREDE DE BEBIDAS — 4 prateleiras retroiluminadas
//   z=29.30..28.66   BANCADA DE TRABALHO — aco escovado, 10 estacoes
//   z=28.66..27.60   CORREDOR do barman (1,06 m — o jogador tem raio 0,38)
//   z=27.60..26.94   BALCAO DE ATENDIMENTO — tampo de madeira, 1,14 m
//   z=26.54          BANQUETAS (5)
//
// O corredor e fechado nas duas pontas: a oeste pela estante de frutas, a leste
// por um painel. A UNICA entrada e o ALCAPAO no canto leste do balcao — e a
// mesma peca que mobilia/bar.js resolveu pra casa velha, e pela mesma razao:
// um balcao que abre visualmente e continua barrando e pior que um que nao abre.
//
// ======================= A ARMADILHA DA LUZ, DE NOVO ========================
//
// NENHUMA PointLight NOVA. A parede de bebidas e retroiluminada com MATERIAL
// EMISSIVO, e nao com luz. Isso nao e economia: a contagem de luzes VISIVEIS
// define o programa de shader de TODO material da cena, e acrescentar uma luz
// aqui recompilaria a cena inteira (ver render/luzes-efeito.js e a secao do
// travamento perto das lojas em ARCHITECTURE.md). Prateleira de bar acesa e
// justamente o caso em que emissivo basta: o que se quer e a garrafa BRILHAR,
// nao a garrafa iluminar o balcao.
// ---------------------------------------------------------------------------

// =========================================================================
// MEDIDAS
// =========================================================================

export const PLANTA = {
  // A bancada de trabalho (aco escovado) — onde o drink e feito.
  //
  // Os Z nao sao gosto: o CORREDOR entre ela e o balcao tem que caber o
  // jogador, e o jogador tem 0,38 m de raio de colisao (PLAYER.RADIUS). De
  // 27,66 a 28,68 sao 1,02 m — 0,26 de folga total. Menos que isso e o barman
  // fica entalado entre os dois moveis, que foi o primeiro erro desta planta.
  bancada: { x0: 15.20, x1: 25.60, z0: 28.72, z1: 29.32, h: 0.95 },
  // o balcao de atendimento (madeira) — o lado do cliente
  balcao: { x0: 15.60, x1: 25.58, z0: 26.94, z1: 27.60, h: 1.14 },
  // a parede de bebidas
  parede: { x0: 16.40, x1: 24.80, z: 29.68, prof: 0.28, alturas: [1.32, 1.80, 2.28, 2.76] },
  // a estante de frutas, na parede oeste
  fruteira: { x0: 14.32, x1: 14.98, z0: 26.60, z1: 29.30, alturas: [0.42, 0.90, 1.38] },
  // o alcapao, na ponta LESTE do balcao
  alcapao: { larg: 0.98 },
  // o painel que fecha o corredor a leste
  fecho: { x: 25.66, z0: 27.60, z1: 29.32 },
  banquetaZ: 26.54,
  // A ESTACAO CENTRAL: onde o copo fica e pra onde tudo converge.
  copo: { x: 20.20, z: 29.00 },
}

/**
 * X do centro de cada estacao, da esquerda pra direita.
 *
 * A FAIXA UTIL VAI DE 17,2 A 23,6 e isso e uma restricao de CAMERA, nao de
 * movel: o enquadramento da bancada enxerga ~6,7 m, e um alvo fora de quadro e
 * um alvo que o jogador nunca acha (a escolha e por projecao na tela — ver o
 * cabecalho). A pia e o descanso de utensilios ficam FORA da faixa de
 * proposito: sao as duas coisas do bar com que nao se faz drink nenhum, e uma
 * bancada que acaba no ultimo botao util nao parece uma bancada de trabalho.
 */
export const ESTACOES = {
  pia: 15.90,
  gelo: 17.20,
  tabua: 18.25,
  liquidificador: 19.20,
  copo: PLANTA.copo.x,
  coqueteleira: 21.20,
  chope: 22.25,
  guarnicoes: 23.15,
  pistola: 23.60,
  utensilios: 24.70,
}

const Z_BANC = (PLANTA.bancada.z0 + PLANTA.bancada.z1) / 2   // 29.02

// A torre de chope: tres torneiras num poste de 24 cm. 24 e nao 30 (a medida
// da adega): la o copo fica na MAO do jogador e sobe ate o bico; aqui ele
// comeca na bancada, e cada centimetro a mais de poste e um centimetro que o
// copo tem que levantar pra o jorro cair dentro dele.
const H_POSTE_CHOPE = 0.24
const X_TORNEIRAS = [22.02, 22.25, 22.48]

// =========================================================================
// MATERIAIS
// =========================================================================

/** Aco escovado: o risco na horizontal. E o que separa inox de plastico cinza. */
function acoTex() {
  return tex('bar-aco', 256, (g, s) => {
    g.fillStyle = '#9aa1a8'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 900; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,255,255' : '70,76,82') + ',' + (0.03 + Math.random() * 0.10) + ')'
      g.fillRect(0, y, s, 1)
    }
    // as juntas das chapas: uma a cada quarto
    for (let i = 1; i < 4; i++) {
      g.fillStyle = 'rgba(50,56,62,0.42)'
      g.fillRect((i / 4) * s, 0, 2, s)
    }
  })
}

/** Tampo do balcao: madeira escura com marca de copo. */
function tampoTex() {
  return tex('bar-cas-tampo', 256, (g, s) => {
    g.fillStyle = '#3a2415'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 600; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '20,12,6' : '150,110,70') + ',' + (0.04 + Math.random() * 0.16) + ')'
      g.fillRect(0, y, s, 1 + Math.random() * 2)
    }
    for (let i = 1; i < 5; i++) {
      g.fillStyle = 'rgba(14,8,4,0.55)'
      g.fillRect(0, (i / 5) * s, s, 2)
    }
    // as marcas de copo: e o que diz que este balcao ja serviu alguem
    for (let i = 0; i < 11; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const r = 6 + Math.random() * 6
      g.strokeStyle = 'rgba(210,170,120,' + (0.06 + Math.random() * 0.12) + ')'
      g.lineWidth = 1 + Math.random()
      g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke()
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
  get aco() { return stdMat('bar-aco-mat', { map: tiled(acoTex(), 8, 1), color: 0xc4cad0, roughness: 0.36, metalness: 0.72 }) },
  get acoFosco() { return solid(0x8d949b, 0.52, 0.58) },
  get acoEscuro() { return solid(0x5a6067, 0.46, 0.66) },
  get tampo() { return stdMat('bar-cas-tampo-mat', { map: tiled(tampoTex(), 5, 1), color: 0x9a7048, roughness: 0.42 }) },
  get madeira() { return stdMat('bar-cas-mad', { map: tiled(woodTex(2, '#33200f'), 5, 2), color: 0x7a5432, roughness: 0.80 }) },
  get ripa() { return stdMat('bar-cas-ripa', { map: tiled(woodTex(2, '#241608'), 1, 1), color: 0x6a4526, roughness: 0.86 }) },
  get latao() { return solid(0xc09a44, 0.38, 0.70) },
  get latacoFosco() { return solid(0x8a7132, 0.62, 0.44) },
  get couro() { return solid(0x5a2a26, 0.78, 0.02) },
  get preto() { return solid(0x14161a, 0.72, 0.06) },
  get vidroPrat() { return glass(0xcfe6ee, 0.16) },
  // A LUZ DA PRATELEIRA — material emissivo, NUNCA uma PointLight. Ver o
  // cabecalho. O tom e ambar quente porque e ele que faz o vidro colorido das
  // garrafas acender por tras; um branco puro lava as cores todas.
  get luzPrat() { return emissive(0xffbe6a, 2.4) },
  get luzPratFria() { return emissive(0x7ad8ff, 1.5) },
  get neonRosa() { return emissive(0xff2f8e, 2.0) },
  get espelho() { return stdMat('bar-espelho', { color: 0x8fa6b0, roughness: 0.06, metalness: 0.92 }) },
  get quadroNegro() { return solid(0x1a1e1c, 0.94, 0.0) },
  /** O realce do alvo apontado: um anel fino que anda de alvo em alvo. */
  get realce() {
    return stdMat('bar-realce', {
      color: 0xffe3a8, emissive: 0xffc46a, emissiveIntensity: 2.2,
      transparent: true, opacity: 0.70, roughness: 0.5, depthWrite: false,
    })
  },
}

// =========================================================================
// PECAS AUXILIARES
// =========================================================================

/** Marca a subarvore inteira pra sombra (o padrao de todo modulo do jogo). */
function sombras(o, projeta) {
  o.traverse((n) => {
    if (!n.isMesh) return
    n.castShadow = projeta !== false
    n.receiveShadow = true
  })
  return o
}

/**
 * BANQUETA ALTA de bar: assento redondo de couro, coluna de latao, base
 * pesada e o aro de apoio pro pe. Seis malhas.
 *
 * O ARO DE APOIO nao e enfeite: banqueta alta sem onde por o pe e a coisa que
 * faz uma banqueta de 78 cm parecer uma cadeira que encolheu.
 */
function banqueta(alt) {
  const h = alt || 0.78
  const g = new THREE.Group()
  g.name = 'banqueta-bar'
  const base = cyl(0.180, 0.200, 0.028, M.acoEscuro, 18)
  base.position.y = 0.014
  g.add(base)
  const col = cyl(0.026, 0.032, h - 0.070, M.latao, 12)
  col.position.y = (h - 0.070) / 2 + 0.028
  g.add(col)
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.150, 0.011, 6, 20), M.latao)
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.220
  g.add(aro)
  // tres raios ligando o aro na coluna
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const r = box(0.126, 0.008, 0.010, M.latao, Math.cos(a) * 0.088, 0.220, Math.sin(a) * 0.088)
    r.rotation.y = -a
    g.add(r)
  }
  const assento = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000), new THREE.Vector2(0.1500, 0.0000),
    new THREE.Vector2(0.1650, 0.0140), new THREE.Vector2(0.1630, 0.0400),
    new THREE.Vector2(0.1400, 0.0520), new THREE.Vector2(0.0000, 0.0560),
  ], 22), M.couro)
  assento.position.y = h - 0.056
  g.add(assento)
  // a costura em botao no meio do assento
  const bt = cyl(0.016, 0.016, 0.006, solid(0x3f1c1a, 0.86), 10)
  bt.position.y = h - 0.002
  g.add(bt)
  return sombras(g)
}

/**
 * PRATELEIRA RETROILUMINADA: a tabua de vidro, o friso de aco e a REGUA
 * EMISSIVA por tras dela.
 *
 * A regua fica ATRAS e ABAIXO da tabua de cima, encostada na parede: assim a
 * luz nasce por tras das garrafas e nao na frente delas. Uma regua na frente
 * ilumina o rotulo (que aqui nem existe) e mata a silhueta, que e justamente a
 * unica coisa que a parede de bebidas tem pra oferecer de longe.
 */
function prateleiraDeBebida(g, x0, x1, y, z, prof) {
  const L = x1 - x0
  const cx = (x0 + x1) / 2

  // a tabua: vidro grosso sobre dois cantoneiras
  const tab = box(L, 0.022, prof, M.vidroPrat, cx, y, z - prof / 2)
  tab.castShadow = false
  tab.receiveShadow = true
  g.add(tab)
  // o friso de aco na frente, que segura a garrafa
  g.add(box(L, 0.030, 0.014, M.acoFosco, cx, y + 0.014, z - prof + 0.007))

  // A REGUA EMISSIVA, encostada na parede e virada pra baixo.
  const luz = box(L - 0.10, 0.016, 0.030, M.luzPrat, cx, y - 0.022, z - 0.026)
  luz.castShadow = false
  g.add(luz)
  // o perfil de aluminio que esconde a regua de quem olha de frente
  g.add(box(L - 0.08, 0.026, 0.016, M.acoEscuro, cx, y - 0.028, z - 0.052))

  // as duas cantoneiras de sustentacao
  for (const s of [-1, 1]) {
    const mx = cx + s * (L / 2 - 0.12)
    g.add(box(0.022, 0.040, prof - 0.02, M.acoEscuro, mx, y - 0.028, z - prof / 2))
  }
}

/**
 * O QUADRO-NEGRO — a UNICA "interface" do bar, e ela e um objeto do mundo.
 *
 * O dono do projeto disse que odeia painel modal cobrindo a tela (foi a queixa
 * do blackjack). Entao a receita, o pedido do cliente e a nota do drink saem
 * ESCRITOS A GIZ numa lousa pendurada na bancada, que o barman le virando a
 * cabeca. Um canvas de 512x384 que so se redesenha quando o texto muda — o
 * mesmo desenho da tela do video poker em mobilia/video-poker.js, e pela mesma
 * razao: redesenhar canvas todo quadro custa mais que a lousa vale.
 */
function criarQuadroNegro(larg, alt) {
  const L = larg || 1.05, A = alt || 0.78
  const g = new THREE.Group()
  g.name = 'bar-quadro'
  g.userData.noBake = true          // o canvas e reescrito em jogo

  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null
  let ctx = null
  let mat = M.quadroNegro
  if (c) {
    c.width = 512; c.height = 384
    ctx = c.getContext('2d')
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    mat = new THREE.MeshStandardMaterial({
      map: t, roughness: 0.96, metalness: 0.0,
      // o giz devolve um pouco de luz propria: sem isso, uma lousa preta num
      // canto escuro do bar fica ilegivel
      emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.22,
    })
    mat.userData.tex = t
  }

  const chapa = box(L, A, 0.018, mat, 0, 0, 0)
  chapa.castShadow = false
  chapa.receiveShadow = true
  g.add(chapa)
  // a moldura de madeira
  const e = 0.030
  for (const s of [-1, 1]) {
    g.add(box(L + e * 2, e, 0.026, M.madeira, 0, s * (A / 2 + e / 2), 0.002))
    g.add(box(e, A + e * 2, 0.026, M.madeira, s * (L / 2 + e / 2), 0, 0.002))
  }
  // a canaleta do giz
  g.add(box(L * 0.5, 0.016, 0.036, M.madeira, 0, -A / 2 - 0.026, 0.020))

  let ultimo = ''
  function escrever(titulo, linhas, cor) {
    if (!ctx) return
    const chave = titulo + '|' + (linhas || []).join('|') + '|' + (cor || '')
    if (chave === ultimo) return
    ultimo = chave

    ctx.fillStyle = '#1a1e1c'
    ctx.fillRect(0, 0, 512, 384)
    // a sujeira de giz apagado: e ela que faz a lousa parecer usada
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(220,228,220,' + (0.012 + Math.random() * 0.03) + ')'
      ctx.beginPath()
      ctx.ellipse(Math.random() * 512, Math.random() * 384, 20 + Math.random() * 90, 8 + Math.random() * 26, Math.random() * 3, 0, 7)
      ctx.fill()
    }
    ctx.strokeStyle = 'rgba(230,236,228,0.28)'
    ctx.lineWidth = 2
    ctx.strokeRect(14, 14, 484, 356)

    ctx.textAlign = 'center'
    ctx.fillStyle = cor || '#f2ead2'
    ctx.font = 'bold 40px "Trebuchet MS", sans-serif'
    ctx.fillText(String(titulo || '').toUpperCase(), 256, 66, 460)
    ctx.strokeStyle = 'rgba(240,232,200,0.5)'
    ctx.beginPath(); ctx.moveTo(60, 86); ctx.lineTo(452, 86); ctx.stroke()

    ctx.textAlign = 'left'
    ctx.font = '28px "Trebuchet MS", sans-serif'
    ctx.fillStyle = '#e2dcc4'
    const ls = linhas || []
    for (let i = 0; i < Math.min(8, ls.length); i++) {
      ctx.fillText(String(ls[i]), 52, 132 + i * 34, 412)
    }
    if (mat.map) mat.map.needsUpdate = true
  }

  escrever('Bar da Estrela', ['Aperte E na bancada', 'pra assumir o balcao.'])
  return { grupo: g, escrever }
}

// =========================================================================
// A ESTACAO
// =========================================================================

/**
 * @param opts.base   o Y de MUNDO do piso do miolo (LEVELS.SHOP_FLOOR)
 * @param opts.dentro interiorOf(CASINO) — pra encostar nas paredes certas
 */
export function criarEstacao(opts = {}) {
  const base = opts.base !== undefined ? opts.base : 0.16
  const IN = opts.dentro || { x0: 14.3, x1: 33.7, z0: 12.3, z1: 29.7 }

  const grupo = new THREE.Group()
  grupo.name = 'casino-bar'

  // TUDO QUE MUDA EM JOGO mora aqui. Sem esta marca o forno funde as pecas
  // vivas junto com o balcao e elas param de se mexer pra sempre (ver a nota
  // sobre a ordem do forno em ARCHITECTURE.md).
  const vivo = new THREE.Group()
  vivo.name = 'casino-bar-vivo'
  vivo.userData.noBake = true
  grupo.add(vivo)

  const colliders = []
  const occluders = []
  const alvos = []
  const focos = {}

  /** Registra um ponto clicavel. `pos` em MUNDO (o Y ja com a base somada). */
  function alvo(id, tipo, x, y, z, rotulo, dado, foco, raio) {
    const a = {
      id, tipo, rotulo, dado: dado || null, foco: foco || null,
      pos: new THREE.Vector3(x, y + base, z),
      raio: raio || 0.055,
    }
    alvos.push(a)
    return a
  }

  /** Registra um enquadramento de camera. Tudo em MUNDO. */
  function foco(id, px, py, pz, ax, ay, az, fov, paralaxe) {
    focos[id] = {
      pos: new THREE.Vector3(px, py + base, pz),
      alvo: new THREE.Vector3(ax, ay + base, az),
      fov: fov || 55,
      paralaxe: paralaxe === undefined ? 0.55 : paralaxe,
    }
    return focos[id]
  }

  // =======================================================================
  // 1. O BALCAO DE ATENDIMENTO (o lado do cliente)
  // =======================================================================
  const B = PLANTA.balcao
  const xAlc0 = B.x1 - PLANTA.alcapao.larg
  const cxB = (B.x0 + B.x1) / 2
  const czB = (B.z0 + B.z1) / 2
  const profB = B.z1 - B.z0

  /** O corpo do balcao entre dois X. `comTampo` false embaixo do alcapao. */
  function corpoDeBalcao(x0, x1, comTampo) {
    const L = x1 - x0
    if (L < 0.02) return
    const cx = (x0 + x1) / 2
    const c = box(L, B.h - 0.06, profB, M.madeira, cx, (B.h - 0.06) / 2, czB)
    sombras(c)
    grupo.add(c)
    // RIPADO VERTICAL na face do cliente. E ele que separa "balcao de bar" de
    // "caixa de madeira", e sao muitas e iguais: InstancedMesh.
    const n = Math.max(2, Math.round(L / 0.13))
    const ripas = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.052, B.h - 0.24, 0.020), M.ripa, n,
    )
    const d = new THREE.Object3D()
    for (let i = 0; i < n; i++) {
      d.position.set(x0 + (L * (i + 0.5)) / n, (B.h - 0.24) / 2 + 0.09, B.z0 - 0.011)
      d.updateMatrix()
      ripas.setMatrixAt(i, d.matrix)
    }
    ripas.instanceMatrix.needsUpdate = true
    ripas.castShadow = false
    grupo.add(ripas)
    // rodape e o friso de latao no alto da face
    grupo.add(box(L, 0.070, profB + 0.03, M.ripa, cx, 0.035, czB))
    grupo.add(box(L, 0.016, 0.012, M.latacoFosco, cx, B.h - 0.13, B.z0 - 0.016))
    if (comTampo) {
      const t = box(L + 0.03, 0.060, profB + 0.12, M.tampo, cx, B.h - 0.03, czB)
      sombras(t)
      grupo.add(t)
    }
  }

  corpoDeBalcao(B.x0, xAlc0, true)
  corpoDeBalcao(xAlc0, B.x1 - 0.06, false)

  // BARRA DE PE de latao. Bar sem barra de pe existe; bar sem barra de pe que
  // PARECA bar, nao.
  const barra = cyl(0.022, 0.022, B.x1 - B.x0 - 0.3, M.latao, 10)
  barra.rotation.z = Math.PI / 2
  barra.position.set(cxB, 0.19, B.z0 - 0.16)
  sombras(barra)
  grupo.add(barra)
  for (let i = 0; i < 5; i++) {
    const x = B.x0 + 0.5 + i * ((B.x1 - B.x0 - 1.0) / 4)
    grupo.add(box(0.05, 0.20, 0.05, M.acoEscuro, x, 0.10, B.z0 - 0.16))
  }

  // --- O ALCAPAO ----------------------------------------------------------
  //
  // Pivo na quina OESTE do tampo e no TOPO: ele gira pra cima como um alcapao,
  // e nao pra frente como uma porta. 78 graus e onde ele para encostado na
  // propria dobradica sem passar do ponto — mais que isso e a tampa cai pro
  // outro lado sozinha, o que uma tampa de balcao nao faz.
  const pivoAlc = new THREE.Group()
  pivoAlc.name = 'bar-alcapao'
  pivoAlc.position.set(xAlc0, B.h - 0.06, czB)
  pivoAlc.userData.noBake = true
  grupo.add(pivoAlc)
  const tampaAlc = box(PLANTA.alcapao.larg, 0.060, profB + 0.12, M.tampo,
    PLANTA.alcapao.larg / 2, 0.030, 0)
  sombras(tampaAlc)
  pivoAlc.add(tampaAlc)
  const alca = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.010, 6, 14, Math.PI), M.latao)
  alca.rotation.set(Math.PI / 2, 0, 0)
  alca.position.set(PLANTA.alcapao.larg - 0.15, 0.062, 0)
  pivoAlc.add(alca)
  for (const dz of [-profB * 0.30, profB * 0.30]) {
    const gz = cyl(0.013, 0.013, 0.068, M.acoEscuro, 8)
    gz.rotation.z = Math.PI / 2
    gz.position.set(0.03, 0, dz)
    pivoAlc.add(gz)
  }

  // --- SUPORTE DE COPOS PENDURADOS, sobre o balcao ------------------------
  //
  // Duas calhas de latao a 1,95 m com copos de boca pra baixo. E cenario, mas e
  // cenario que so existe em bar: a calha de copo pendurado e uma silhueta que
  // ninguem confunde com outra coisa.
  // 2,12 m e nao 1,95: o enquadramento geral da bancada passa por cima do
  // balcao, e a 1,95 a fileira de copos pendurados cortava a imagem no meio.
  // Em 2,12 ela ainda aparece na borda de cima — que e onde ela DEVE aparecer,
  // emoldurando a cena — sem tapar a bancada.
  const yCalha = 2.12
  for (const dz of [-0.16, 0.16]) {
    const c = cyl(0.014, 0.014, B.x1 - B.x0 - 1.2, M.latao, 8)
    c.rotation.z = Math.PI / 2
    c.position.set(cxB, yCalha, czB + dz)
    c.castShadow = false
    grupo.add(c)
  }
  // as hastes que sobem ate o forro
  for (const x of [B.x0 + 1.0, cxB, B.x1 - 1.0]) {
    const h = cyl(0.012, 0.012, 1.4, M.latao, 8)
    h.position.set(x, yCalha + 0.70, czB)
    h.castShadow = false
    grupo.add(h)
    grupo.add(box(0.10, 0.03, 0.42, M.acoEscuro, x, yCalha + 1.40, czB))
  }
  // os copos pendurados: uma InstancedMesh de tulipas invertidas seria o certo,
  // mas a tulipa e um lathe com liquido; aqui basta o CONE DE VIDRO — a esta
  // altura ninguem enxerga o filete gravado.
  const nPend = 22
  const pend = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0250, 0.0345, 0.120, 12, 1, true), glass(0xdfeef5, 0.24), nPend,
  )
  const dPend = new THREE.Object3D()
  for (let i = 0; i < nPend; i++) {
    dPend.position.set(
      B.x0 + 0.7 + (i % 11) * ((B.x1 - B.x0 - 1.4) / 10),
      yCalha - 0.075,
      czB + (i < 11 ? -0.16 : 0.16),
    )
    dPend.updateMatrix()
    pend.setMatrixAt(i, dPend.matrix)
  }
  pend.instanceMatrix.needsUpdate = true
  pend.castShadow = false
  grupo.add(pend)

  // --- as banquetas -------------------------------------------------------
  const banquetas = []
  for (let i = 0; i < 5; i++) {
    const bx = B.x0 + 0.95 + i * ((B.x1 - B.x0 - 1.9) / 4)
    const bq = banqueta(0.78)
    bq.position.set(bx, 0, PLANTA.banquetaZ)
    grupo.add(bq)
    banquetas.push({ x: bx, z: PLANTA.banquetaZ })
    colliders.push({
      minX: bx - 0.19, maxX: bx + 0.19,
      minZ: PLANTA.banquetaZ - 0.18, maxZ: PLANTA.banquetaZ + 0.18,
      tag: 'bar-banqueta',
    })
  }

  // =======================================================================
  // 2. A BANCADA DE TRABALHO
  // =======================================================================
  const A = PLANTA.bancada
  const profA = A.z1 - A.z0
  const cxA = (A.x0 + A.x1) / 2

  // o gabinete: aco escovado com portas
  const gab = box(A.x1 - A.x0, A.h - 0.05, profA, M.acoFosco, cxA, (A.h - 0.05) / 2, Z_BANC)
  sombras(gab)
  grupo.add(gab)
  // o tampo, com 3 cm de aba na frente
  const tampoA = box(A.x1 - A.x0 + 0.02, 0.050, profA + 0.06, M.aco, cxA, A.h - 0.025, Z_BANC - 0.01)
  sombras(tampoA)
  grupo.add(tampoA)
  // o RODAPE RECUADO: e ele que faz o movel parecer embutido e nao apoiado
  grupo.add(box(A.x1 - A.x0 - 0.04, 0.10, profA - 0.10, M.preto, cxA, 0.05, Z_BANC))

  // as portas do gabinete (puxadores de barra), numa instanced
  const nPorta = Math.round((A.x1 - A.x0) / 0.62)
  const puxadores = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.30, 8), M.aco, nPorta,
  )
  const dPux = new THREE.Object3D()
  for (let i = 0; i < nPorta; i++) {
    dPux.position.set(A.x0 + ((A.x1 - A.x0) * (i + 0.5)) / nPorta, A.h * 0.62, A.z0 - 0.012)
    dPux.rotation.z = Math.PI / 2
    dPux.updateMatrix()
    puxadores.setMatrixAt(i, dPux.matrix)
  }
  puxadores.instanceMatrix.needsUpdate = true
  puxadores.castShadow = false
  grupo.add(puxadores)
  // as frestas entre portas
  for (let i = 1; i < nPorta; i++) {
    grupo.add(box(0.008, A.h - 0.20, 0.006, M.preto, A.x0 + ((A.x1 - A.x0) * i) / nPorta, (A.h - 0.14) / 2, A.z0 - 0.004))
  }

  // =======================================================================
  // 3. AS ESTACOES DA BANCADA
  // =======================================================================

  // --- 3.1 PIA + ESCORREDOR ----------------------------------------------
  {
    const x = ESTACOES.pia
    // a cuba: uma caixa escura afundada no tampo. Furo de verdade pediria
    // booleana; a caixa escura no lugar do furo e o que se ve dele de pe.
    const cuba = box(0.42, 0.008, 0.34, M.acoEscuro, x, A.h - 0.055, Z_BANC + 0.04)
    cuba.castShadow = false
    grupo.add(cuba)
    for (const s of [-1, 1]) {
      grupo.add(box(0.42, 0.16, 0.008, M.acoFosco, x, A.h - 0.13, Z_BANC + 0.04 + s * 0.17))
      grupo.add(box(0.008, 0.16, 0.34, M.acoFosco, x + s * 0.21, A.h - 0.13, Z_BANC + 0.04))
    }
    // a torneira de cozinha: coluna e bico em arco
    const col = cyl(0.014, 0.018, 0.24, M.aco, 10)
    col.position.set(x - 0.16, A.h + 0.12, Z_BANC + 0.20)
    sombras(col)
    grupo.add(col)
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.012, 8, 16, Math.PI * 0.8), M.aco)
    arco.rotation.set(Math.PI / 2, 0, -0.3)
    arco.position.set(x - 0.16, A.h + 0.24, Z_BANC + 0.13)
    grupo.add(arco)
    const esc = escorredorDeCopos(0.34, 0.26)
    esc.position.set(x + 0.40, A.h, Z_BANC + 0.02)
    sombras(esc, false)
    grupo.add(esc)

    alvo('pia', 'pia', x, A.h + 0.06, Z_BANC - 0.10, 'Lavar o copo', null, 'bancada', 0.13)
  }

  // --- 3.2 POCO DE GELO ---------------------------------------------------
  const geloInfo = { x: ESTACOES.gelo, z: Z_BANC + 0.02, y: A.h }
  {
    const x = geloInfo.x
    const L = 0.40, P = 0.34
    // a cuba isolada
    grupo.add(box(L, 0.010, P, M.acoEscuro, x, A.h - 0.115, geloInfo.z))
    for (const s of [-1, 1]) {
      grupo.add(box(L, 0.12, 0.010, M.aco, x, A.h - 0.055, geloInfo.z + s * (P / 2)))
      grupo.add(box(0.010, 0.12, P, M.aco, x + s * (L / 2), A.h - 0.055, geloInfo.z))
    }
    // a borda enrolada
    grupo.add(box(L + 0.05, 0.014, P + 0.05, M.aco, x, A.h + 0.005, geloInfo.z))
    grupo.add(box(L - 0.02, 0.014, P - 0.02, M.acoEscuro, x, A.h + 0.008, geloInfo.z))

    // O GELO: 44 pedras empilhadas numa InstancedMesh so. Em malhas separadas
    // seriam 44 draw calls num poco que o jogador olha uma vez por drink.
    const n = 44
    const im = new THREE.InstancedMesh(geoGelo(), matGelo(), n)
    const d = new THREE.Object3D()
    for (let i = 0; i < n; i++) {
      // tres camadas, cada uma um pouco mais rala que a de baixo
      const cam = Math.floor(i / 16)
      const dentroCam = i % 16
      d.position.set(
        x + (((dentroCam % 4) + 0.5) / 4 - 0.5) * (L - 0.07) + (Math.sin(i * 12.9898) * 0.012),
        A.h - 0.098 + cam * 0.021,
        geloInfo.z + ((Math.floor(dentroCam / 4) + 0.5) / 4 - 0.5) * (P - 0.07) + (Math.cos(i * 78.233) * 0.010),
      )
      d.rotation.set(i * 0.7, i * 1.3, i * 0.5)
      d.scale.setScalar(0.85 + ((i * 37) % 7) * 0.045)
      d.updateMatrix()
      im.setMatrixAt(i, d.matrix)
    }
    im.instanceMatrix.needsUpdate = true
    im.castShadow = false
    grupo.add(im)
    // o miolo branco das pedras de cima
    const mi = new THREE.InstancedMesh(geoGelo(), matGeloMiolo(), 16)
    for (let i = 0; i < 16; i++) {
      im.getMatrixAt(28 + i, d.matrix)
      d.matrix.decompose(d.position, d.quaternion, d.scale)
      d.scale.multiplyScalar(0.5)
      d.updateMatrix()
      mi.setMatrixAt(i, d.matrix)
    }
    mi.instanceMatrix.needsUpdate = true
    mi.castShadow = false
    grupo.add(mi)

    alvo('gelo', 'gelo', x, A.h + 0.03, geloInfo.z - 0.12, 'Pegar gelo com a pinca', null, 'gelo', 0.16)
  }

  // A PINCA vive no grupo VIVO: ela abre, fecha e viaja ate o copo.
  const pinca = pincaDeGelo()
  pinca.position.set(geloInfo.x + 0.26, A.h + 0.01, geloInfo.z - 0.06)
  pinca.rotation.z = 0.28
  sombras(pinca, false)
  vivo.add(pinca)

  // --- 3.3 TABUA DE CORTE + FACA -----------------------------------------
  const tabuaInfo = { x: ESTACOES.tabua, z: Z_BANC + 0.02, y: A.h }
  {
    const t = tabuaDeCorte(0.42, 0.30)
    t.position.set(tabuaInfo.x, A.h, tabuaInfo.z)
    sombras(t)
    grupo.add(t)
    const f = facaDeBar()
    f.position.set(tabuaInfo.x + 0.10, A.h + 0.026, tabuaInfo.z + 0.09)
    f.rotation.y = 0.42
    sombras(f, false)
    grupo.add(f)
    alvo('tabua', 'tabua', tabuaInfo.x, A.h + 0.05, tabuaInfo.z - 0.10, 'Cortar fruta', null, 'tabua', 0.16)
  }

  // --- 3.4 LIQUIDIFICADOR -------------------------------------------------
  const liquidificador = criarLiquidificador({ cor: 0x1c1e22 })
  liquidificador.grupo.position.set(ESTACOES.liquidificador, A.h, Z_BANC + 0.05)
  liquidificador.grupo.rotation.y = -0.22
  vivo.add(liquidificador.grupo)
  alvo('liquidificador', 'liquidificador', ESTACOES.liquidificador, A.h + 0.28, Z_BANC - 0.08,
    'Liquidificador', null, 'liquidificador', 0.16)

  // --- 3.5 A ESTACAO CENTRAL: o copo e a canaleta de dreno ---------------
  const copoInfo = { x: PLANTA.copo.x, z: PLANTA.copo.z, y: A.h }
  {
    const x = copoInfo.x
    // a canaleta: um rebaixo escuro com a grelha de barras. Ela existe pra o
    // que transborda ter pra onde ir — e o jogador vai transbordar.
    grupo.add(box(0.52, 0.012, 0.30, M.preto, x, A.h - 0.008, copoInfo.z))
    const nb = 15
    const grelha = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.010, 0.010, 0.26), M.acoEscuro, nb,
    )
    const d = new THREE.Object3D()
    for (let i = 0; i < nb; i++) {
      d.position.set(x + ((i + 0.5) / nb - 0.5) * 0.48, A.h + 0.002, copoInfo.z)
      d.updateMatrix()
      grelha.setMatrixAt(i, d.matrix)
    }
    grelha.instanceMatrix.needsUpdate = true
    grelha.castShadow = false
    grupo.add(grelha)
    grupo.add(box(0.56, 0.014, 0.34, M.aco, x, A.h + 0.001, copoInfo.z))
    grupo.add(box(0.52, 0.016, 0.30, M.preto, x, A.h + 0.004, copoInfo.z))
  }

  // --- 3.6 COQUETELEIRA ---------------------------------------------------
  const coqueteleira = criarCoqueteleira({ altura: 0.240, raioAnel: 0.090 })
  coqueteleira.grupo.position.set(ESTACOES.coqueteleira, A.h, Z_BANC + 0.04)
  vivo.add(coqueteleira.grupo)
  alvo('coqueteleira', 'coqueteleira', ESTACOES.coqueteleira, A.h + 0.14, Z_BANC - 0.06,
    'Coqueteleira', null, 'coqueteleira', 0.13)

  // --- 3.7 A TORRE DE CHOPE ----------------------------------------------
  const torneiras = []
  const CHOPES = [
    { ing: 'chope-claro', nome: 'Chope claro', knob: 0x2f1d12 },
    { ing: 'chope-escuro', nome: 'Chope escuro', knob: 0x1a1410 },
    // A TERCEIRA TORNEIRA E DE AGUA COM GAS, e ela existe por um motivo de
    // desenho: com duas torneiras iguais o jogador nao aprende que a torre e
    // uma familia de coisas — ele decora "a da esquerda e clara". Com uma
    // terceira que nao e cerveja, a torre vira um lugar e nao um botao duplo.
    { ing: 'agua-gas', nome: 'Agua com gas', knob: 0x9aa8b0 },
  ]
  {
    const zTorre = Z_BANC + 0.14
    // a bandeja de escoamento sob os bicos
    const yBand = A.h + 0.012
    grupo.add(box(0.82, 0.024, 0.22, M.acoFosco, ESTACOES.chope, yBand, zTorre - 0.085))
    const nb = 15
    const grelha = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.010, 0.009, 0.19), solid(0x3f4348, 0.66, 0.42), nb,
    )
    const d = new THREE.Object3D()
    for (let i = 0; i < nb; i++) {
      d.position.set(ESTACOES.chope + ((i + 0.5) / nb - 0.5) * 0.76, yBand + 0.017, zTorre - 0.085)
      d.updateMatrix()
      grelha.setMatrixAt(i, d.matrix)
    }
    grelha.instanceMatrix.needsUpdate = true
    grelha.castShadow = false
    grupo.add(grelha)

    // a chapa de fundo que une os tres postes numa TORRE so
    grupo.add(box(0.80, H_POSTE_CHOPE + 0.10, 0.05, M.acoEscuro,
      ESTACOES.chope, A.h + (H_POSTE_CHOPE + 0.10) / 2, zTorre + 0.055))

    for (let i = 0; i < 3; i++) {
      const x = X_TORNEIRAS[i]
      const f = CHOPES[i]
      const ing = ingredienteDe(f.ing) || { cor: 0xd8901c }
      const yTop = A.h + H_POSTE_CHOPE
      // queda: do bico ate a grelha da bandeja
      const queda = yTop + 0.0915 - (yBand + 0.024)
      const t = criarTorneira({ cor: ing.cor, knob: f.knob, alturaJorro: queda })
      t.grupo.position.set(x, yTop, zTorre)
      // meia volta: o bico tem que apontar pro BARMAN (-Z), nao pra parede
      t.grupo.rotation.y = Math.PI
      t.grupo.userData.noBake = true
      t.nome = f.nome
      t.ingrediente = f.ing
      t.indice = i
      vivo.add(t.grupo)
      torneiras.push(t)

      // o poste de sustentacao, em ferro escuro e nao em latao: sendo latao,
      // poste e torneira viram uma peca amarela so de 35 cm (a licao da adega)
      const post = cyl(0.019, 0.026, H_POSTE_CHOPE, M.acoEscuro, 12)
      post.position.set(x, A.h + H_POSTE_CHOPE / 2, zTorre)
      sombras(post)
      grupo.add(post)
      grupo.add(cyl(0.044, 0.050, 0.016, M.acoEscuro, 14).translateY(A.h + 0.008).translateZ(zTorre).translateX(x))

      alvo('chope-' + i, 'chope', x, yTop + 0.20, zTorre - 0.10, f.nome, { indice: i, ing: f.ing }, 'chope', 0.075)
    }
  }

  // --- 3.8 PORTA-GUARNICOES ----------------------------------------------
  const guarnInfo = { x: ESTACOES.guarnicoes, z: Z_BANC + 0.04, y: A.h }
  const BINS = [
    { id: 'rodela-laranja', nome: 'Rodela de laranja' },
    { id: 'rodela-limao', nome: 'Rodela de limao' },
    { id: 'cereja', nome: 'Cereja no palito' },
    { id: 'morango', nome: 'Morango' },
    { id: 'folha-hortela', nome: 'Ramo de hortela' },
    { id: 'canudo', nome: 'Canudo' },
    { id: 'sombrinha', nome: 'Guarda-chuvinha' },
    { id: 'rodela-abacaxi', nome: 'Fatia de abacaxi' },
  ]
  {
    const x = guarnInfo.x, z = guarnInfo.z
    // a bandeja em DOIS DEGRAUS: a fileira de tras mais alta, pra as duas
    // aparecerem na mesma imagem. Uma bandeja plana esconde o fundo.
    const L = 0.62
    for (let fila = 0; fila < 2; fila++) {
      const yb = A.h + fila * 0.055
      const zb = z + (fila ? 0.11 : 0)
      grupo.add(box(L, 0.010, 0.16, M.acoFosco, x, yb + 0.005, zb))
      grupo.add(box(L, 0.055, 0.008, M.acoFosco, x, yb + 0.028, zb - 0.076))
      grupo.add(box(L, 0.055, 0.008, M.acoFosco, x, yb + 0.028, zb + 0.076))
      for (let i = 0; i <= 4; i++) {
        grupo.add(box(0.008, 0.055, 0.16, M.acoFosco, x - L / 2 + (L * i) / 4, yb + 0.028, zb))
      }
    }
    // o conteudo de cada compartimento
    for (let i = 0; i < BINS.length; i++) {
      const fila = Math.floor(i / 4)
      const col = i % 4
      const bx = x - 0.62 / 2 + (0.62 * (col + 0.5)) / 4
      const by = A.h + fila * 0.055 + 0.012
      const bz = z + (fila ? 0.11 : 0)
      let peca = null
      if (BINS[i].id === 'canudo') peca = canudoUt(0xe84a6a)
      else if (BINS[i].id === 'sombrinha') peca = sombrinha()
      else {
        const gg = guarnicaoDe(BINS[i].id)
        peca = gg ? guarnicaoDaFruta(gg.de) : null
      }
      if (peca) {
        // DUAS de cada, um pouco tortas: compartimento com uma peca so
        // centralizada le como vitrine, e isto e um porta-guarnicoes usado.
        // As duas que trazem InstancedMesh (morango e hortela) vem SOZINHAS —
        // ver a nota sobre draw call na fruteira, logo abaixo.
        const quantas = (BINS[i].id === 'morango' || BINS[i].id === 'folha-hortela') ? 1 : 2
        for (let k = 0; k < quantas; k++) {
          const c = k === 0 ? peca : peca.clone(true)
          c.position.set(bx + (k - 0.5) * 0.022, by, bz + (k - 0.5) * 0.020)
          c.rotation.set(BINS[i].id === 'canudo' || BINS[i].id === 'sombrinha' ? -1.35 : 0,
            k * 1.1 + i, 0)
          c.scale.setScalar(0.92)
          sombras(c, false)
          grupo.add(c)
        }
      }
      alvo('guarn-' + BINS[i].id, 'guarnicao', bx, by + 0.03, bz - 0.05,
        BINS[i].nome, { id: BINS[i].id }, 'guarnicoes', 0.045)
    }
  }

  // --- 3.9 PISTOLA DE REFRIGERANTE ---------------------------------------
  const REFRIS = ['agua-gas', 'tonica', 'refri-escuro', 'refri-guarana']
  const pistolaInfo = { x: ESTACOES.pistola, y: A.h + 0.012, z: Z_BANC + 0.02 }
  {
    const x = pistolaInfo.x
    const supX = x + 0.20, supY = A.h + 0.07, supZ = Z_BANC + 0.16
    const suporte = box(0.09, 0.14, 0.07, M.acoFosco, supX, supY, supZ)
    sombras(suporte)
    grupo.add(suporte)
    const cores = REFRIS.map((id) => (ingredienteDe(id) || {}).cor || 0x888888).concat([0xd8d2c4, 0x2a2a2e])
    // A PISTOLA FICA GIRADA MEIA VOLTA e nao num angulo qualquer, e a razao e
    // que os BOTOES DELA sao alvos clicaveis: com o giro em 180 graus a conta
    // de "onde esta o botao i" vira uma troca de sinal, e os alvos abaixo caem
    // exatamente em cima do desenho. Num angulo torto seria seno e cosseno em
    // dois lugares que ninguem lembraria de manter iguais.
    const p = pistolaDeRefri(cores, new THREE.Vector3(
      -(supX - x), supY - pistolaInfo.y - 0.012, -(supZ - pistolaInfo.z),
    ))
    p.position.set(x, pistolaInfo.y, pistolaInfo.z)
    p.rotation.y = Math.PI
    sombras(p, false)
    grupo.add(p)
    for (let i = 0; i < REFRIS.length; i++) {
      const ing = ingredienteDe(REFRIS[i])
      // as MESMAS coordenadas locais de pistolaDeRefri, com o giro aplicado
      const bx = (i % 2 ? 1 : -1) * 0.014
      const bz = -0.034 + Math.floor(i / 2) * 0.034
      alvo('refri-' + REFRIS[i], 'refri',
        x - bx, pistolaInfo.y + 0.050, pistolaInfo.z - bz,
        ing ? ing.nome : REFRIS[i], { ing: REFRIS[i] }, 'pistola', 0.018)
    }
  }

  // --- 3.10 O DESCANSO DE UTENSILIOS -------------------------------------
  {
    const x = ESTACOES.utensilios
    grupo.add(box(0.36, 0.010, 0.22, M.acoFosco, x, A.h + 0.005, Z_BANC + 0.02))
    const dos = dosador()
    dos.position.set(x - 0.10, A.h + 0.010, Z_BANC + 0.02)
    sombras(dos)
    grupo.add(dos)
    const mex = mexedorDeBar()
    mex.position.set(x + 0.02, A.h + 0.010, Z_BANC + 0.06)
    mex.rotation.set(0, 0, -0.06)
    sombras(mex, false)
    grupo.add(mex)
    const coa = coadorDeMola()
    coa.position.set(x + 0.10, A.h + 0.010, Z_BANC - 0.02)
    coa.rotation.y = 0.7
    sombras(coa, false)
    grupo.add(coa)
  }

  // --- 3.11 OS COPOS LIMPOS, de boca pra baixo na bancada ----------------
  const COPOS_BAR = ['copo-americano', 'copo-tulipa', 'caneca-chope']
  {
    // Eles ficam num DEGRAU no fundo da bancada, logo atras da estacao central:
    // copo limpo em cima da area de trabalho atrapalharia todo gesto, e num bar
    // de verdade a pilha fica no fundo mesmo. Ficar atras do copo em uso e
    // proposital — os tres aparecem no mesmo enquadramento em que o jogador
    // olha o drink, entao trocar de copo nao exige procurar nada.
    const xCentro = PLANTA.copo.x
    const zStep = Z_BANC + 0.22
    grupo.add(box(1.20, 0.014, 0.18, M.acoFosco, xCentro, A.h + 0.062, zStep))
    for (const s of [-1, 1]) {
      grupo.add(box(0.014, 0.060, 0.18, M.acoFosco, xCentro + s * 0.60, A.h + 0.032, zStep))
    }
    // ALTURA DE CADA COPO, pra pousar a boca no degrau. O copo nasce com a base
    // em y=0 (o contrato de mobilia/copos.js), entao virado de cabeca pra baixo
    // a ORIGEM fica no topo — e um numero errado aqui enterra o copo na chapa
    // ou o deixa boiando. Sao as alturas dos PERFIS daquele arquivo.
    const ALT_COPO = { 'copo-americano': 0.098, 'copo-tulipa': 0.148, 'caneca-chope': 0.152 }
    for (let i = 0; i < COPOS_BAR.length; i++) {
      const ficha = copoDe(COPOS_BAR[i])
      if (!ficha) continue
      const x = xCentro - 0.40 + i * 0.40
      const alt = ALT_COPO[ficha.id] || 0.12
      // DOIS de cada, o de tras deslocado: a pilha diz "tem mais"
      for (let k = 0; k < 2; k++) {
        let peca = null
        try { peca = ficha.build() } catch (err) { void err; peca = null }
        if (!peca) break
        // de boca pra baixo, que e como copo limpo espera
        peca.rotation.x = Math.PI
        peca.position.set(x + k * 0.030, A.h + 0.069 + alt, zStep + k * 0.040)
        sombras(peca, false)
        grupo.add(peca)
      }
      alvo('copo-' + ficha.id, 'copo', x, A.h + 0.069 + alt * 0.5, zStep - 0.10,
        ficha.nome, { id: ficha.id }, 'bancada', 0.055)
    }
  }

  // =======================================================================
  // 4. A PAREDE DE BEBIDAS
  // =======================================================================
  const P = PLANTA.parede

  // o fundo espelhado, entre as prateleiras: e ele que dobra a parede inteira
  // e faz o bar parecer ter o dobro de garrafas
  const esp = box(P.x1 - P.x0, 2.10, 0.02, M.espelho, (P.x0 + P.x1) / 2, 2.05, P.z - 0.008)
  esp.castShadow = false
  esp.receiveShadow = false
  grupo.add(esp)
  // a moldura de madeira em volta do espelho
  for (const s of [-1, 1]) {
    grupo.add(box(P.x1 - P.x0 + 0.16, 0.10, 0.09, M.madeira, (P.x0 + P.x1) / 2, 2.05 + s * 1.10, P.z - 0.045))
    grupo.add(box(0.10, 2.30, 0.09, M.madeira, (P.x0 + P.x1) / 2 + s * ((P.x1 - P.x0) / 2 + 0.05), 2.05, P.z - 0.045))
  }

  for (const y of P.alturas) prateleiraDeBebida(grupo, P.x0, P.x1, y, P.z, P.prof)

  // --- AS GARRAFAS QUE O JOGADOR PEGA ------------------------------------
  //
  // Quinze — as quinze de fonte 'parede' em bar/receitas.js. Elas ficam no
  // TRECHO CENTRAL (X 18.3 a 22.1), que e exatamente o que o enquadramento
  // `parede` enxerga: uma garrafa clicavel fora de quadro seria uma garrafa
  // que o jogador nunca acha.
  const daParede = INGREDIENTES.filter((i) => i.fonte === 'parede')
  const CONSTRUTORES = [
    (i) => garrafaAgave(i.cor),
    (i) => garrafaLicor(i.cor, 0xe8ddc4),
    (i) => garrafaVermute(i.cor, 0x2e4a26),
    (i) => garrafaTriangular(i.cor, 0xd8e2d0),
    (i) => garrafaCantil(i.cor),
    (i) => garrafaXarope(i.cor),
    () => garrafaVodka(),
    () => garrafaWhiskey(),
  ]
  // qual silhueta cabe em qual ingrediente. E escolha de leitura, nao sorteio:
  // xarope vai na garrafa de bico, vermute na garrafa alta de vinho, e os
  // destilados se espalham pelas silhuetas restantes pra a prateleira nunca
  // ter duas iguais lado a lado.
  const SILHUETA = {
    'cana-branca': 4, 'cana-velha': 7, zimbro: 3, agave: 0, centeio: 4,
    'grao-neutro': 6, melaco: 1, 'licor-laranja': 1, 'licor-cafe': 1,
    'licor-erva': 3, 'vermute-tinto': 2, 'vermute-seco': 2,
    'xarope-acucar': 5, 'xarope-groselha': 5, 'creme-coco': 5,
  }
  const POR_PRATELEIRA = [
    ['xarope-acucar', 'xarope-groselha', 'creme-coco'],
    ['licor-laranja', 'licor-cafe', 'licor-erva', 'vermute-tinto', 'vermute-seco'],
    ['cana-velha', 'centeio', 'melaco'],
    ['cana-branca', 'zimbro', 'grao-neutro', 'agave'],
  ]
  const X_PICK0 = 18.30, X_PICK1 = 22.10
  const X_PICK_MEIO = (X_PICK0 + X_PICK1) / 2
  // PASSO FIXO E CENTRADO, e nao o trecho dividido pelo tamanho da lista.
  //
  // Dividir era o que estava aqui, e o defeito apareceu com o jogo rodando: a
  // prateleira de TRES garrafas espalhava as tres por 3,80 m — 1,27 m de vao
  // entre uma e outra — e a de cinco ficava quase certa. O olho le "prateleira
  // cheia" pela DISTANCIA entre garrafas, nunca pela contagem, entao o mesmo
  // numero de garrafas com passo de 26 cm (o de um bar de verdade) le como
  // prateleira cheia, e espalhado le como prateleira sendo esvaziada.
  const PASSO_PICK = 0.26
  const garrafasDaParede = new Map()
  for (let p = 0; p < POR_PRATELEIRA.length; p++) {
    const lista = POR_PRATELEIRA[p]
    const y = P.alturas[p] + 0.011
    const xIni = X_PICK_MEIO - ((lista.length - 1) * PASSO_PICK) / 2
    for (let i = 0; i < lista.length; i++) {
      const ing = ingredienteDe(lista[i])
      if (!ing) continue
      const x = xIni + i * PASSO_PICK
      const fab = CONSTRUTORES[SILHUETA[ing.id] === undefined ? 0 : SILHUETA[ing.id]]
      let peca = null
      try { peca = fab(ing) } catch (err) { void err; peca = null }
      if (!peca) continue
      peca.position.set(x, y, P.z - P.prof * 0.52)
      peca.rotation.y = (i * 1.7 + p * 0.9) % (Math.PI * 2)
      sombras(peca)
      grupo.add(peca)
      garrafasDaParede.set(ing.id, { x, y, z: P.z - P.prof * 0.52, fab, ing })
      alvo('garrafa-' + ing.id, 'garrafa', x, y + 0.16, P.z - P.prof * 0.90,
        ing.nome, { ing: ing.id }, 'parede', 0.075)
    }
  }

  // --- AS GARRAFAS DE FUNDO ----------------------------------------------
  //
  // As que enchem os dois trechos laterais e ninguem pega. Tres malhas cada
  // (ver garrafaDeFundo em mobilia/bebidas.js) e todas vao pro forno.
  const CORES_FUNDO = [
    0x8a5a1e, 0x2e6b3a, 0x6b2038, 0x1f3f6b, 0xa8801f, 0x3a2a5c,
    0xc06a18, 0x4a7a2a, 0x8f2f45, 0xd8c060, 0x2a4a6a, 0x7a3a14,
  ]
  const CORES_VIDRO = [0xdfe8e6, 0x2e4a26, 0x5a3a1a, 0xd8e2d0, 0xcfe0e8]
  {
    // TRES trechos, e o do meio corrige o mesmo defeito que o passo fixo acima:
    // com garrafa de fundo so nas laterais, o enquadramento `parede` — que
    // enxerga exatamente o trecho CENTRAL — mostrava quatro prateleiras com
    // duas ou tres garrafas cada. Parede de bar vazia le como bar fechado, e o
    // pedido era uma PAREDE de bebidas.
    //
    // O trecho do meio vai numa SEGUNDA FILA, encostada no espelho (`atras`), e
    // e isso que deixa as duas coisas verdadeiras ao mesmo tempo: as garrafas
    // que se PEGA continuam sozinhas na fila da frente, cada uma com folga em
    // volta do proprio alvo de clique, e o fundo enche o vao entre elas sem
    // disputar o ponteiro — garrafa de fundo nao registra alvo nenhum.
    //
    // A fila de tras tambem ganha o dobro do espelho atras dela, entao ela
    // rende mais garrafa por malha que qualquer outra coisa nesta parede.
    const trechos = [
      { a: P.x0 + 0.18, b: X_PICK0 - 0.24, atras: false },
      { a: X_PICK1 + 0.24, b: P.x1 - 0.18, atras: false },
      { a: X_PICK0 - 0.06, b: X_PICK1 + 0.06, atras: true },
    ]
    let k = 0
    for (let p = 0; p < P.alturas.length; p++) {
      const y = P.alturas[p] + 0.011
      for (const t of trechos) {
        const { a, b, atras } = t
        const n = Math.max(1, Math.round((b - a) / 0.115))
        for (let i = 0; i < n; i++) {
          const x = a + ((b - a) * (i + 0.5)) / n
          const peca = garrafaDeFundo(
            (k * 3 + p) % 4,
            CORES_FUNDO[k % CORES_FUNDO.length],
            CORES_VIDRO[(k * 2 + p) % CORES_VIDRO.length],
            // A fila de tras e um dedo mais BAIXA (0.74 a 0.86 contra 0.82 a
            // 1.06): garrafa de tras mais alta que a da frente tapa justamente
            // o ombro e o gargalo, que e a parte da silhueta pela qual o
            // jogador reconhece o que esta pegando.
            atras
              ? 0.74 + ((k * 7) % 4) * 0.04
              : 0.82 + ((k * 7) % 5) * 0.06,
          )
          peca.position.set(
            x, y,
            atras ? P.z - P.prof * 0.20 : P.z - P.prof * (0.44 + ((k % 3) * 0.10)),
          )
          peca.rotation.y = k * 1.31
          sombras(peca)
          grupo.add(peca)
          k++
        }
      }
    }
  }

  // --- O NEON --------------------------------------------------------------
  //
  // O bar velho deste cassino tinha um neon BOA SORTE sobre o espelho, e ele
  // era bonito. Aposentar o bar velho inteiro sem levar o neon junto seria
  // jogar fora a unica coisa daquele canto que ja funcionava, entao ele foi
  // reconstruido aqui em cima da parede de bebidas.
  if (typeof document !== 'undefined') {
    const bs = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.66), textPlaneMat('BOA SORTE', {
      w: 1024, h: 224, color: '#ffe9f6', font: 'bold 150px "Trebuchet MS", sans-serif',
      glow: '#ff2f8e', emissiveIntensity: 1.7,
    }))
    bs.position.set((P.x0 + P.x1) / 2, 3.62, P.z - 0.10)
    bs.rotation.y = Math.PI
    bs.castShadow = false
    grupo.add(bs)
    for (const s of [-1, 1]) {
      const e = box(3.3, 0.05, 0.045, M.neonRosa, (P.x0 + P.x1) / 2, 3.62 + s * 0.40, P.z - 0.12)
      e.castShadow = false
      grupo.add(e)
    }
  }

  // =======================================================================
  // 5. A FRUTEIRA (parede oeste)
  // =======================================================================
  const F = PLANTA.fruteira
  const czF = (F.z0 + F.z1) / 2
  const profF = F.x1 - F.x0
  const compF = F.z1 - F.z0
  {
    // as montantes e as tres tabuas
    for (const z of [F.z0 + 0.05, czF, F.z1 - 0.05]) {
      const m = box(profF, F.alturas[2] + 0.30, 0.06, M.madeira, (F.x0 + F.x1) / 2, (F.alturas[2] + 0.30) / 2, z)
      sombras(m)
      grupo.add(m)
    }
    for (const y of F.alturas) {
      const t = box(profF, 0.032, compF, M.madeira, (F.x0 + F.x1) / 2, y, czF)
      sombras(t)
      grupo.add(t)
      // o friso da frente, pra a caixa nao escorregar
      grupo.add(box(0.016, 0.045, compF, M.ripa, F.x1 - 0.008, y + 0.038, czF))
    }
    // a REGUA EMISSIVA da fruteira e FRIA (azulada), ao contrario da ambar da
    // parede de bebidas: e a mesma decisao do fundo verde da adega — a segunda
    // luz nao ilumina, ela CONTRASTA, e e ela que faz a fruteira ser um lugar
    // diferente do resto do bar em vez de mais uma prateleira.
    for (const y of F.alturas) {
      const l = box(0.030, 0.014, compF - 0.12, M.luzPratFria, F.x0 + 0.06, y + 0.30, czF)
      l.castShadow = false
      grupo.add(l)
    }

    // AS CAIXAS COM FRUTA. Seis frutas, duas caixas por prateleira.
    //
    // A caixa nasce com a largura em X e a fundura em Z (ver caixaDeFeira), e a
    // estante e estreita e COMPRIDA — 0,66 de fundura por 2,70 de vao. Entao a
    // caixa entra sem giro nenhum: 0,58 em X (a fundura da prateleira) por 1,25
    // em Z (metade do vao). Girar 90 graus, que foi a primeira tentativa, punha
    // uma caixa de 1,25 m atravessada numa prateleira de 0,66.
    const cxF = (F.x0 + F.x1) / 2
    const larguraCaixa = profF - 0.08
    const compCaixa = compF / 2 - 0.10
    for (let i = 0; i < FRUTAS.length; i++) {
      const f = FRUTAS[i]
      const nivel = Math.min(F.alturas.length - 1, Math.floor(i / 2))
      const lado = i % 2
      const y = F.alturas[nivel] + 0.016
      const z = czF + (lado ? 1 : -1) * (compF / 4)

      // A CAIXA DA FRUTA INSTANCIADA E MENOR, e e a saida pra um empate que nao
      // tem solucao pelo lado da contagem.
      //
      // Abacaxi, morango e hortela trazem InstancedMesh, e InstancedMesh
      // SOBREVIVE AO FORNO (ver o comentario da contagem abaixo): cada unidade
      // a mais e draw call a mais pra sempre, e o bar inteiro tem 300 de teto.
      // Entao nao da pra enche-las como se enche uma caixa de laranja. Mas
      // caixa grande com tres frutas dentro le como caixa ACABANDO, e o pedido
      // era uma fruteira cheia.
      //
      // A saida e encolher a CAIXA em vez de multiplicar a fruta, e a medida da
      // caixa sai da PROPRIA fruta: o que couber justo, mais a borda. Assim os
      // tres viram tres caixas de tamanhos diferentes — o abacaxi numa caixa de
      // 64 cm, a hortela numa de 41, o morango numa de 31 — que e exatamente o
      // que uma feira tem: caixote de fruta grande ao lado de caixa rasa de
      // fruta pequena. Caixa grande com tres frutas dentro le como caixa
      // ACABANDO, e o pedido era uma fruteira cheia.
      //
      // 5.2 raios por unidade e a folga que faz a fila parecer arrumada por
      // alguem em vez de encaixada por regua; o piso de 0,28 e pra caixa
      // nenhuma virar uma caixinha de fosforo na prateleira.
      const inst = (f.bar.instanciada || 0) > 0
      const nInst = f.bar.raio > 0.05 ? 2 : 3
      const compDaCaixa = inst
        ? Math.max(0.28, Math.min(compCaixa, nInst * f.bar.raio * 5.2))
        : compCaixa
      // A CAIXA E RASA, E ISSO CONSERTA UM DEFEITO QUE NAO ERA DE CONTAGEM.
      //
      // Com 13 cm de parede, cada caixa desta estante estava CHEIA e mesmo
      // assim aparecia vazia — foi o que a foto mostrou, e a contagem de malhas
      // no console provou que a fruta estava lá dentro (153 malhas na caixa de
      // cereja "vazia"). O motivo e a linha de visao: a lente do enquadramento
      // `fruteira` fica a 1,02 m e olha quase na horizontal, entao ela olha
      // DENTRO so da prateleira que esta abaixo dela. Nas outras duas ela ve a
      // caixa de lado ou por baixo, e uma cereja de 2,2 cm no fundo de um poco
      // de 13 nao aparece de lado nem por baixo.
      //
      // Aumentar a fruta ou levantar a camera trataria o sintoma. A parede da
      // caixa e a causa: caixa de feira DE VERDADE e rasa e a fruta fica com o
      // ombro pra fora — e por isso que da pra ver fruta numa banca de mercado
      // olhando de frente. Aqui a parede passa a ser a maior entre 5,5 cm e
      // 1,5 raio da fruta, ou seja: sempre mais baixa que a fruta que ela
      // carrega. O abacaxi ganha 9 cm porque abacaxi vem em caixote mesmo.
      const altDaCaixa = Math.max(0.055, f.bar.raio * 1.5)
      const cx0 = caixaDeFeira(larguraCaixa, compDaCaixa, altDaCaixa, 0xb08a52)
      cx0.position.set(cxF, y, z)
      sombras(cx0)
      grupo.add(cx0)

      // As frutas dentro, EM FILA NO SENTIDO COMPRIDO da caixa. Em circulo
      // (a primeira tentativa) elas se amontoavam no meio de uma caixa de 1,25
      // e as duas pontas ficavam vazias — o que le como caixa quase acabando.
      //
      // A CONTA E POR CUSTO DE DRAW CALL, e nao por tamanho da fruta.
      //
      // Laranja, limao e cereja sao malhas simples e podem vir as cinco. Ja
      // morango (sementes + capuz), hortela (folhas) e abacaxi (coroa) trazem
      // InstancedMesh, e InstancedMesh SOBREVIVE AO FORNO: world/bake.js nao
      // funde instanced com nada, entao cada morango a mais na caixa e DOIS
      // draw calls a mais pra sempre. Ninguem conta fruta numa fruteira; o que
      // se ve e a caixa cheia, e tres ja enchem.
      // A CONTA DA FRUTA INSTANCIADA continua em tres ou dois: e o teto de draw
      // call, nao gosto. Quem NAO e instanciada vai de GRADE CHEIA, e essa foi
      // a correcao de um defeito visto no jogo rodando — a fila unica de quatro
      // laranjas numa caixa de 1,25 m mostrava uma caixa com quatro laranjas
      // perdidas no fundo dela. Fruta simples FUNDE no forno (uma malha de
      // laranja e uma esfera com um material que a cidade toda ja usa), entao
      // trinta laranjas custam exatamente o mesmo que quatro depois do forno: o
      // preco esta em MALHA na construcao, e nao em desenho por quadro. Nao ha
      // razao nenhuma pra caixa de laranja de jogo ficar mais vazia que a da
      // feira.
      //
      // O teto de 4 x 8 nao e a capacidade geometrica da caixa (uma laranja de
      // 4 cm cabe 6 x 13 = 78 nela): e onde a caixa le CHEIA sem virar uma
      // pilha transbordando, e onde a malha da fruteira inteira ainda cabe no
      // orcamento do bar.
      const passo = f.bar.raio * 2.4
      const nx = inst ? 2 : Math.max(1, Math.min(4, Math.floor(larguraCaixa / passo)))
      const nz = inst ? nInst : Math.max(1, Math.min(8, Math.floor(compDaCaixa / passo)))
      const q = inst ? nz : nx * nz
      for (let k = 0; k < q; k++) {
        let peca = null
        try { peca = f.build() } catch (err) { void err; peca = null }
        if (!peca) break
        // Instanciada: fila unica no sentido comprido, como era. Simples: grade.
        const ix = inst ? (k % 2) - 0.5 : (((k % nx) + 0.5) / nx - 0.5)
        const iz = inst ? ((k + 0.5) / q - 0.5) : ((Math.floor(k / nx) + 0.5) / nz - 0.5)
        peca.position.set(
          cxF + ix * (inst ? Math.min(0.16, larguraCaixa * 0.3) : larguraCaixa - f.bar.raio * 2.2),
          // A SEGUNDA CAMADA sobe 1,4 cm a cada volta da grade: fruta em caixa
          // nao fica num plano, e o desnivel e o que separa "caixa cheia" de
          // "tabuleiro de xadrez de laranja".
          y + 0.014 + (inst ? 0 : ((k % 3) * 0.012)),
          z + iz * (compDaCaixa - f.bar.raio * 2.4),
        )
        peca.rotation.set(0, k * 1.9, 0)
        sombras(peca)
        grupo.add(peca)
      }
      // O ALVO FICA NA FACE LESTE da estante: e de la que a camera olha (a
      // fruteira encosta na parede oeste). Do lado de tras ele seria um ponto
      // dentro do reboco, e a projecao na tela o poria em cima da caixa errada.
      alvo(f.id, 'fruta', F.x1 + 0.02, y + 0.09, z,
        f.nome, { id: f.id }, 'fruteira', 0.085)
    }
  }

  // =======================================================================
  // 6. FECHAMENTOS, COLISORES E OCCLUDERS
  // =======================================================================

  // O PAINEL QUE FECHA O CORREDOR A LESTE. Sem ele o bar nao e um cubiculo: a
  // faixa entre a bancada e o balcao continua aberta por aquele lado e o
  // jogador entra andando de lado — o que faria o alcapao existir de enfeite.
  const FE = PLANTA.fecho
  {
    const painel = box(0.09, B.h, FE.z1 - FE.z0, M.madeira, FE.x, B.h / 2, (FE.z0 + FE.z1) / 2)
    sombras(painel)
    grupo.add(painel)
    grupo.add(box(0.13, 0.06, FE.z1 - FE.z0 + 0.04, M.tampo, FE.x, B.h - 0.03, (FE.z0 + FE.z1) / 2))
  }

  // O QUADRO-NEGRO fica NESSE painel, virado pro corredor: o barman le virando
  // a cabeca pra direita, sem sair do lugar.
  const quadro = criarQuadroNegro(1.05, 0.78)
  quadro.grupo.position.set(FE.x - 0.06, 1.70, (FE.z0 + FE.z1) / 2 + 0.10)
  quadro.grupo.rotation.y = -Math.PI / 2
  grupo.add(quadro.grupo)

  // --- colisores ----------------------------------------------------------
  colliders.push({ minX: B.x0 - 0.02, maxX: xAlc0, minZ: B.z0 - 0.06, maxZ: B.z1 + 0.06, tag: 'bar-balcao' })
  colliders.push({ minX: A.x0, maxX: A.x1, minZ: A.z0 - 0.04, maxZ: A.z1 + 0.10, tag: 'bar-bancada' })
  colliders.push({ minX: P.x0 - 0.10, maxX: P.x1 + 0.10, minZ: P.z - P.prof, maxZ: IN.z1, tag: 'bar-parede-bebidas' })
  colliders.push({ minX: F.x0, maxX: F.x1, minZ: F.z0, maxZ: F.z1, tag: 'bar-fruteira' })
  colliders.push({ minX: FE.x - 0.06, maxX: FE.x + 0.06, minZ: FE.z0, maxZ: FE.z1, tag: 'bar-fecho' })

  // --- occluders (caixas COM altura, pra camera de 3a pessoa) -------------
  occluders.push({
    minX: B.x0, maxX: B.x1, minY: base, maxY: base + B.h,
    minZ: B.z0, maxZ: B.z1,
  })
  occluders.push({
    minX: A.x0, maxX: P.x1, minY: base, maxY: base + 3.0,
    minZ: A.z0, maxZ: IN.z1,
  })

  // =======================================================================
  // 7. OS ENQUADRAMENTOS DE CAMERA
  // =======================================================================
  //
  // Todos com o mesmo desenho: a lente fica no CORREDOR (do lado do barman) e
  // olha pra dentro da bancada. O que muda e a distancia e o campo. `paralaxe`
  // baixo nos enquadramentos de gesto e proposital — com o ponteiro mandando
  // na mira do gesto, a lente acompanhando o ponteiro junto embrulha.

  // A VISAO GERAL DA ESTACAO — onde o modo comeca e pra onde ele volta.
  //
  // Ela e a unica que fica FORA do corredor: a lente sobe pra 2,26 e recua pro
  // lado do cliente, por cima das banquetas. E a unica distancia em que a
  // bancada inteira cabe (6,7 m de largura visivel com campo de 66), e sem isso
  // metade das estacoes ficaria fora de quadro — e alvo fora de quadro nao da
  // pra apontar. A camera passa por CIMA do balcao (a 24 graus a linha de visao
  // esta a 1,88 m quando cruza o tampo de 1,14) e por baixo dos copos
  // pendurados, que ficam emoldurando a imagem em vez de tapa-la.
  //
  // Ela tambem e a unica que o gesto FAZ ANDAR em X (ver bar/gestos.js): o
  // ponteiro encostado na borda arrasta a lente pela bancada, que e o que
  // resolve os 10,4 m de balcao sem picar o bar em telas.
  foco('bancada', copoInfo.x, 2.26, 26.36, copoInfo.x, 1.05, 29.00, 66, 0.7)
  // a parede de bebidas, inteira
  foco('parede', copoInfo.x, 2.06, 27.32, copoInfo.x, 2.06, 29.45, 56, 0.5)
  // A FRUTEIRA, de frente (ela encosta na parede oeste, entao a lente olha -X).
  //
  // A LENTE FICA ACIMA DA PRATELEIRA DO MEIO, e nao na altura dela. As tabuas
  // estao a 0,58, 1,06 e 1,54 no mundo, e nao existe ponto nenhum que olhe pra
  // DENTRO das tres ao mesmo tempo: quem esta na altura de uma ve as de cima
  // por baixo. Com a lente a 1,24 e a mira a 1,02 sobram duas prateleiras
  // vistas de cima (as duas de baixo, que e onde estao as frutas que se usa
  // mais) e a de cima quase de nivel — nela o que aparece e o ombro da fruta
  // acima da parede rasa da caixa, que e justamente pra isso que a caixa e
  // rasa (ver o comentario de altDaCaixa). Todo alvo continua clicavel de
  // qualquer jeito: o realce marca o que o ponteiro pegou.
  foco('fruteira', 16.35, 1.24, czF, 14.65, 1.02, czF, 62, 0.5)
  // o copo, de perto — o enquadramento do gesto de dosar e de guarnecer
  foco('copo', copoInfo.x - 0.02, 1.32, 28.54, copoInfo.x, 1.07, 29.00, 44, 0.30)
  // o poco de gelo
  foco('gelo', geloInfo.x, 1.44, 28.48, geloInfo.x, 0.95, 29.04, 52, 0.35)
  // a tabua de corte, quase de cima (o gesto e arrastar o mouse por cima dela)
  foco('tabua', tabuaInfo.x, 1.56, 28.62, tabuaInfo.x, 0.97, 29.04, 50, 0.25)
  // a torre de chope, com o copo embaixo do bico
  foco('chope', ESTACOES.chope - 0.06, 1.40, 28.50, ESTACOES.chope, 1.16, 29.08, 46, 0.30)
  // a coqueteleira, de frente e um pouco de baixo: o anel tem que caber inteiro
  foco('coqueteleira', ESTACOES.coqueteleira, 1.34, 28.44, ESTACOES.coqueteleira, 1.10, 29.06, 48, 0.20)
  // o liquidificador
  foco('liquidificador', ESTACOES.liquidificador - 0.04, 1.46, 28.38, ESTACOES.liquidificador, 1.22, 29.07, 48, 0.25)
  // o porta-guarnicoes
  foco('guarnicoes', guarnInfo.x, 1.36, 28.56, guarnInfo.x, 1.02, 29.09, 46, 0.30)
  // A PISTOLA DE REFRIGERANTE, quase de cima e MUITO perto (35 cm).
  //
  // Ela e o unico enquadramento que precisou ser calculado ao contrario:
  // partindo de "os quatro botoes tem que ficar a uns cem pixels um do outro
  // na tela", e nao de "de onde fica bonito". Os botoes distam 2,8 e 3,4 cm; a
  // 35 cm com campo de 40 isso da ~100 px, e olhando de cima (57 graus) a
  // distancia em Z vira distancia VERTICAL na tela em vez de profundidade —
  // sem isso, duas das quatro se sobrepoem no mesmo ponto.
  foco('pistola', pistolaInfo.x, 1.30, 28.86, pistolaInfo.x, 1.01, 29.05, 40, 0.20)
  // o quadro-negro
  foco('quadro', FE.x - 0.86, 1.72, (FE.z0 + FE.z1) / 2 + 0.10, FE.x - 0.06, 1.70, (FE.z0 + FE.z1) / 2 + 0.10, 46, 0.25)

  // =======================================================================
  // 8. O REALCE — o anel que anda de alvo em alvo
  // =======================================================================
  //
  // UM SO, e ele anda. Setenta marcadores acesos ao mesmo tempo viram enfeite;
  // um so vira mira. Mesma decisao de mobilia/bar.js.
  const realce = new THREE.Mesh(new THREE.RingGeometry(0.052, 0.070, 20), M.realce)
  realce.visible = false
  realce.castShadow = false
  realce.renderOrder = 3
  // ESTACIONADO EM CIMA DA BANCADA, e nao na origem do grupo. A origem local
  // deste grupo e o (0,0,0) do MUNDO, que neste mapa e o cruzamento central da
  // cidade: um objeto escondido parado la nao pinta nada, mas entra na caixa da
  // subarvore e faz o bar inteiro medir vinte metros pra qualquer teste de
  // volume. O mesmo vale pras pecas que viajam e pros fios de liquido.
  realce.position.set(PLANTA.copo.x, A.h + 0.02, Z_BANC)
  vivo.add(realce)

  return {
    grupo, vivo, colliders, occluders, alvos, focos,
    planta: PLANTA, estacoes: ESTACOES,
    base,
    // pecas vivas
    torneiras, coqueteleira, liquidificador, pinca, realce, quadro,
    alcapao: pivoAlc,
    banquetas,
    // pontos uteis, em MUNDO
    pontos: {
      copo: new THREE.Vector3(copoInfo.x, base + A.h, copoInfo.z),
      chope: X_TORNEIRAS.map((x) => new THREE.Vector3(x, base + A.h, Z_BANC + 0.14 - 0.085)),
      tabua: new THREE.Vector3(tabuaInfo.x, base + A.h + 0.026, tabuaInfo.z),
      gelo: new THREE.Vector3(geloInfo.x, base + A.h, geloInfo.z),
      coqueteleira: new THREE.Vector3(ESTACOES.coqueteleira, base + A.h, Z_BANC + 0.04),
      liquidificador: new THREE.Vector3(ESTACOES.liquidificador, base + A.h, Z_BANC + 0.05),
      guarnicoes: new THREE.Vector3(guarnInfo.x, base + A.h, guarnInfo.z),
      pistola: new THREE.Vector3(ESTACOES.pistola, base + A.h + 0.06, Z_BANC + 0.02),
      // onde o barman fica de pe pra trabalhar
      posto: new THREE.Vector3(copoInfo.x, base, 28.14),
      // onde o cliente senta
      banquetas,
    },
    /** A fabrica de uma garrafa da parede, pra o gesto por uma na mao. */
    garrafaDe(idIngrediente) {
      const reg = garrafasDaParede.get(idIngrediente)
      if (!reg) return null
      try { return reg.fab(reg.ing) } catch (err) { void err; return null }
    },
    alturaBancada: A.h,
  }
}

export default criarEstacao
