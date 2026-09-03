import * as THREE from 'three'
import {
  solid, stdMat, box, cyl, plane, glass, emissive, tex, textPlaneMat,
  plasterTex, woodTex,
} from './materials.js'
import { porta as somPorta } from '../audio/som.js'
import { criarPiaIndustrial } from '../mobilia/pia.js'
import { copoDe } from '../mobilia/copos.js'
import {
  prateleiraDeAco, carrinhoDeLouca, lixeiraDePedal, exaustorDeParede,
  relogioDeParede, quadroDeAvisos, prateleiraDeParede, escorredorDeCopos,
  bancadaDeApoio, cabideDeAventais, caixaPlastica,
} from '../mobilia/cozinha-moveis.js'

// ---------------------------------------------------------------------------
// src/world/casino-cozinha.js — A COZINHA DO CASSINO: a porta, o comodo e a pia.
//
// O pedido do dono foi um espaco, e nao uma mecanica: "adicionar a porta pra ir
// pra cozinha e ter uma pia que vamos usar pra lavar. Por hora nao vai ter
// sistema de lavar." Isso e uma instrucao de construcao muito precisa, e ela
// decide o arquivo inteiro: NADA AQUI LAVA COPO. O que existe e o LUGAR onde
// lavar vai acontecer, montado de um jeito que o sistema de amanha encaixe sem
// obra — a torneira ja abre de verdade, a agua ja cai de verdade, os copos
// sujos ja estao esperando na bancada, e ha um ponto de E na pilha que hoje so
// responde "em breve". O contrato pro dia seguinte esta na secao CONTRATO, no
// fim do arquivo.
//
// POR QUE ESTA COZINHA E NO CANTO NORDESTE. O salao do cassino tem quatro
// paredes ocupadas: caca-niqueis no oeste, caixa e vitrine no sul, bar no
// norte-oeste, mesas no meio. O unico retangulo que sobra grande o bastante pra
// um comodo de servico e o canto nordeste, e ele tem a vantagem de estar no fim
// do corredor livre da parede leste — quem sai do caixa anda em linha reta e da
// de cara com a porta. Uma cozinha atras do bar seria mais logica na vida real
// e pior no jogo: ninguem acharia.
//
// A PORTA FICA NA PAREDE SUL, e nao na oeste, pelo mesmo motivo. A oeste da pro
// fundo do salao (onde fica o bar) e obrigaria quem quer a cozinha a atravessar
// a area de trabalho do barman. A sul da pro corredor.
//
// O VAO E DE 1,10 m E NAO DE 0,90. Porta de servico de cozinha e por onde passa
// gente carregando caixa com as duas maos, e 0,90 e a medida de porta de quarto.
// 1,10 tambem e o que deixa o colisor do vao com 1,06 de folga util, que e mais
// que o dobro do raio do jogador — passagem estreita e onde a colisao circular
// deste jogo mais engancha.
//
// PLANTA DO COMODO (X e Z de MUNDO; Y local, piso em 0, teto proprio em 3.12):
//
//   z=29.70  +=================== parede NORTE do predio ==================+
//            | [PRATELEIRA]  |        P I A   I N D U S T R I A L         |
//   z=29.0   |  de aco       |  pingadeira  | cuba B | cuba A |           |E
//            |               +--- escorredor de copos --------+           |X
//   z=28.5   |                    [ tapete antiderrapante ]               |A
//            |                                              +------------+U
//   z=27.5   | [quadro]                                     | BANCADA DE |S
//            | [cabide]        [ carrinho de louca ]        | APOIO      |T
//   z=26.5   |                                              | copos      |.
//            |   [lixeira]                                  | SUJOS      |
//   z=25.72  +====[relogio]==========+  PORTA  +=============+============+
//           x=26.92               x=31.05   x=32.15       x=33.70
//
// AS DUAS PAREDES NOVAS (oeste em x=26.80 e sul em z=25.60) VAO ATE O TETO DO
// SALAO, e nao ate o teto da cozinha. Um comodo que para em 3,20 m dentro de um
// salao de 6,20 m e um cenario de teatro visto do salao — e, pior, deixa a
// camera de terceira pessoa passar por cima e enxergar a cozinha de fora. O
// teto baixo existe DENTRO, pendurado; a divisoria e inteira.
//
// A ARMADILHA QUE ESTE ARQUIVO NAO PISA: NENHUMA LUZ NOVA. As luminarias de
// calha sao MATERIAL EMISSIVO puro. A contagem de luzes visiveis da cena define
// o programa de shader de TODO material, e uma PointLight a mais aqui e uma
// recompilacao da cena inteira no dia em que alguem resolver liga-la e
// desliga-la (ver "O TRAVAMENTO PERTO DAS LOJAS" no ARCHITECTURE.md). A cozinha
// se paga com o azulejo BRANCO e o piso claro: superficie clara devolve a luz
// que as duas PointLight do salao ja jogam pra ca, e isso e luz de graca.
// ---------------------------------------------------------------------------

// --- a zona, em coordenadas de MUNDO ---------------------------------------
//
// Estes numeros sao a fronteira acertada com quem constroi o bar do barman (a
// oeste) e com a mesa de poker (ao sul). Nada deste arquivo passa deles.
const ZONA = { x0: 26.80, x1: 33.70, z0: 25.60, z1: 29.70 }
const TP = 0.12                                     // espessura das divisorias

// O comodo BRUTO: entre as faces internas das quatro paredes.
const COM = { x0: 26.92, x1: 33.70, z0: 25.72, z1: 29.70 }

// O comodo ACABADO. As paredes norte e leste sao as do PREDIO, e elas ja tem
// dois panos colados nelas: o damasco do salao (em x1-0.02 / z1-0.02) e o
// rodape dourado, que e mais grosso (6 cm). Por isso o revestimento da cozinha
// fica 8 cm a frente da estrutura — nao e capricho, e o que TAPA o damasco
// vinho e o filete de ouro que, senao, apareceriam atras da pia.
const ACB = { x0: 26.945, x1: 33.62, z0: 25.745, z1: 29.62 }

const TETO = 3.12          // forro proprio da cozinha (local; 3.28 no mundo)
const MEIA = 1.30          // topo do azulejo branco
const FAIXA = 0.26         // a fileira verde-agua, uma peca de altura
const CAP = MEIA + FAIXA   // 1.56 — topo do revestimento, onde comeca o reboco

const PORTA = { x: 31.60, larg: 1.10, alt: 2.10 }
const DL = PORTA.x - PORTA.larg / 2        // 31.05
const DR = PORTA.x + PORTA.larg / 2        // 32.15
const FOLHA_X = DL + 0.04                  // eixo da dobradica (dentro do batente)
const FOLHA_W = DR - DL - 0.08             // 1.02
const PORTA_Z = ZONA.z0 + TP / 2           // 25.66 — o plano da folha

const TAG_PORTA = 'cassino-cozinha-porta'

// --- texturas ---------------------------------------------------------------
//
// Todas nascem com repeat (1, 1). Quem estica cada uma pro tamanho do pano e o
// UV da geometria, em pano() — ver o porque la embaixo. E o oposto do que o
// resto do projeto faz (tiled() em casino.js e em city.js clona a textura por
// densidade), e a troca e deliberada: aqui ha dezesseis panos do MESMO azulejo.

/**
 * Azulejo 25 x 25 com rejunte. A ceramica sai QUASE BRANCA de proposito: a cor
 * de verdade vem do `color` do material, e assim o mesmo desenho serve pro pano
 * branco e pra faixa verde-agua sem um segundo canvas.
 */
function azulejoTex() {
  return tex('cozinha-azulejo', 256, (g, s) => {
    g.fillStyle = '#b9bdb8'                 // rejunte
    g.fillRect(0, 0, s, s)
    const n = 4, c = s / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 0.965 + Math.random() * 0.035
        const t = Math.floor(248 * v)
        g.fillStyle = 'rgb(' + t + ',' + t + ',' + (t - 3) + ')'
        g.fillRect(x * c + 2.5, y * c + 2.5, c - 5, c - 5)
        // o brilho do esmalte: uma diagonal clara no canto de cima
        const gr = g.createLinearGradient(x * c, y * c, x * c + c, y * c + c)
        gr.addColorStop(0, 'rgba(255,255,255,0.30)')
        gr.addColorStop(0.45, 'rgba(255,255,255,0.02)')
        gr.addColorStop(1, 'rgba(180,190,190,0.10)')
        g.fillStyle = gr
        g.fillRect(x * c + 2.5, y * c + 2.5, c - 5, c - 5)
      }
    }
    // sujeira acumulada no rejunte, so nas linhas horizontais
    for (let i = 1; i < n; i++) {
      g.fillStyle = 'rgba(120,124,116,0.30)'
      g.fillRect(0, i * c - 1.5, s, 3)
    }
  })
}

/**
 * Piso de cozinha: peca de 60 x 60 clara com granilite. O CONTRASTE COM O
 * CARPETE VERMELHO DO SALAO E O ASSUNTO — e ele que faz o jogador sentir que
 * passou pros fundos sem que ninguem precise escrever isso em lugar nenhum.
 */
function pisoTex() {
  return tex('cozinha-piso', 256, (g, s) => {
    g.fillStyle = '#8f968e'                 // rejunte de piso, mais escuro
    g.fillRect(0, 0, s, s)
    const n = 2, c = s / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = '#d6dad0'
        g.fillRect(x * c + 3, y * c + 3, c - 6, c - 6)
      }
    }
    // granilite: pedrinhas cinza e ocre espalhadas
    for (let i = 0; i < 1400; i++) {
      const v = Math.random()
      g.fillStyle = v > 0.62
        ? 'rgba(140,146,138,' + (0.25 + Math.random() * 0.5) + ')'
        : v > 0.3
          ? 'rgba(186,178,158,' + (0.2 + Math.random() * 0.4) + ')'
          : 'rgba(240,244,238,' + (0.3 + Math.random() * 0.5) + ')'
      g.beginPath()
      g.arc(Math.random() * s, Math.random() * s, 0.7 + Math.random() * 1.8, 0, 7)
      g.fill()
    }
    // as trilhas de quem passa: duas manchas mais escuras, nao centradas
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 50
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, 'rgba(120,124,116,0.16)')
      gr.addColorStop(1, 'rgba(120,124,116,0)')
      g.fillStyle = gr
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
  })
}

/** Tapete de borracha vazada: o desenho e o FURO, nao a cor. */
function tapeteTex() {
  return tex('cozinha-tapete', 128, (g, s) => {
    g.fillStyle = '#2a2e31'
    g.fillRect(0, 0, s, s)
    const n = 6, c = s / n
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const off = (y % 2) * c * 0.5
        g.fillStyle = '#12151a'
        g.beginPath()
        g.arc(x * c + c / 2 + off, y * c + c / 2, c * 0.27, 0, 7)
        g.fill()
        g.fillStyle = 'rgba(90,98,104,0.35)'
        g.beginPath()
        g.arc(x * c + c / 2 + off, y * c + c / 2 - 1.5, c * 0.30, Math.PI, Math.PI * 2)
        g.fill()
      }
    }
  })
}

// --- materiais ----------------------------------------------------------------
//
// Os tons de OURO e de VINHO sao pedidos com os MESMOS parametros de
// world/casino.js de proposito: solid() e cacheado por cor+aspereza+metal,
// entao o filete dourado desta parede e literalmente o mesmo objeto de material
// do rodape do salao — e material igual funde no mesmo balde do forno. Copiar o
// numero aqui nao e duplicar: e a unica forma de NAO duplicar o material.

// A DENSIDADE DA TEXTURA NAO MORA NO MATERIAL, MORA NO UV. Ver pano() logo
// abaixo: e por isso que existe UM material de azulejo branco pros dezesseis
// panos deste comodo, e nao um por tamanho de pano.

const M = {
  get azulejoBranco() {
    return stdMat('cozinha-azul-branco', {
      map: azulejoTex(), color: 0xffffff, roughness: 0.28, metalness: 0.02,
    })
  },
  get azulejoFaixa() {
    return stdMat('cozinha-azul-faixa', {
      map: azulejoTex(), color: 0x8fc9c2, roughness: 0.26, metalness: 0.03,
    })
  },
  get reboco() {
    return stdMat('cozinha-reboco', {
      map: plasterTex(1, '#e7e9e2'), color: 0xf2f4ee, roughness: 0.94,
    })
  },
  get piso() {
    return stdMat('cozinha-piso-mat', { map: pisoTex(), roughness: 0.62, metalness: 0.03 })
  },
  get tapete() {
    return stdMat('cozinha-tapete-mat', { map: tapeteTex(), roughness: 0.95, metalness: 0.0 })
  },
  get miolo() { return solid(0xb4aea1, 0.95) },          // o recheio das divisorias
  get rodape() { return solid(0xdfe3dc, 0.42, 0.03) },   // rodape sanitario
  get arremate() { return solid(0x7fb0aa, 0.30, 0.06) }, // a peca de arremate do azulejo
  get teto() { return solid(0xeef0ea, 0.92) },
  get inox() { return solid(0xc3c9ce, 0.32, 0.80) },
  get inoxEscovado() { return solid(0xa7aeb4, 0.46, 0.72) },
  get chapa() { return solid(0x9fada6, 0.58, 0.28) },    // a pintura da folha da porta
  get borracha() { return solid(0x22252a, 0.95, 0.0) },
  get ouroFosco() { return solid(0xb08528, 0.48, 0.6) },   // = M.ouroFosco do cassino
  get vinho() { return solid(0x43132a, 0.90) },            // o tom medio do damasco
  // Lambri quase preto do lado do salao. Sai de woodTex() e nao da nogueira
  // local de casino.js porque aquela funcao nao e exportada, e copiar dez
  // linhas de canvas pra ter a mesma tabua e o tipo de duplicacao que envelhece
  // sozinha. O tom escolhido e o mesmo (#3a2118).
  get madeiraSalao() {
    return stdMat('cozinha-lambri', {
      map: woodTex(1, '#3a2118'), roughness: 0.55, metalness: 0.06,
    })
  },
  // Vidro SUJO: a mesma forma do copo limpo, aspereza sete vezes maior. E a
  // aspereza (e nao a cor) que le como gordura — copo engordurado nao fica
  // amarelo, ele para de brilhar.
  get vidroSujo() {
    return stdMat('cozinha-vidro-sujo', {
      color: 0xd9d6c2, transparent: true, opacity: 0.44, roughness: 0.58,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get luzCalha() { return emissive(0xfff3de, 2.4) },
}

// --- helpers -------------------------------------------------------------------

/**
 * Pano colado numa parede, com a densidade da textura escrita NO UV.
 *
 * O jeito estabelecido no projeto e o contrario: um material por TAMANHO de
 * pano, com o `repeat` da textura calculado a partir dele (matDamasco(w, h) em
 * casino.js). Funciona e e mais curto — mas cada tamanho vira um material
 * proprio, e material proprio e um BALDE PROPRIO no forno de geometria: as
 * dezesseis faixas de azulejo desta cozinha sairiam em dezesseis draw calls,
 * todas de ceramica branca identica.
 *
 * Escrevendo a repeticao no UV da geometria, os dezesseis panos dividem UM
 * material e o forno funde todos num mesh so. `metros` e quanto do mundo uma
 * volta da textura cobre — 1 m no azulejo (peca de 25 cm), 3 m no reboco.
 */
function pano(w, h, mat, x, y, z, ry, metros) {
  const geo = new THREE.PlaneGeometry(w, h)
  const m2 = metros || 1
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / m2), uv.getY(i) * (h / m2))
  uv.needsUpdate = true
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.y = ry || 0
  m.receiveShadow = true
  m.castShadow = false
  return m
}

/** O mesmo pano, deitado (piso, tapete). Sem sombra lancada. */
function deitado(w, d, mat, x, y, z, metros) {
  const m = pano(w, d, mat, x, y, z, 0, metros)
  m.rotation.set(-Math.PI / 2, 0, 0)
  return m
}

/**
 * Bloco de parede. NAO LANCA SOMBRA de proposito: o sol nunca entra neste canto
 * do cassino (a fachada e no lado oposto e e toda vidro escuro) e as duas
 * PointLight do salao nao projetam sombra nenhuma. Uma divisoria de 6 m de
 * altura marcada como caster so engordaria o mapa de sombras do sol.
 */
function bloco(g, x0, x1, y0, y1, z0, z1, mat) {
  const m = box(x1 - x0, y1 - y0, z1 - z0, mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  m.castShadow = false
  m.receiveShadow = true
  g.add(m)
  return m
}

// ===========================================================================
// 0. LIMPEZA — o que ja estava no espaco
// ===========================================================================

/**
 * Este modulo roda DEPOIS de o cassino inteiro estar montado, e ha decoracao do
 * salao dentro da zona: um vaso de planta na quina nordeste (32.8, 28.7) e um
 * quadro emoldurado pendurado na parede leste em z=26.5. Vaso e quadro dentro
 * de uma cozinha de servico contam a historia errada, e o colisor do vaso
 * ficaria como obstaculo invisivel no meio do comodo.
 *
 * O teste e por CAIXA CONTIDA e nao por centro. Testar so o centro removeria,
 * no dia em que alguem mudasse uma medida, o carpete ou o forro do salao
 * inteiro — sao duas malhas gigantes cujo centro pode cair em qualquer lugar. O
 * teto do tamanho existe pela mesma razao.
 */
function limparZona(ctx) {
  const raiz = ctx.raiz
  if (!raiz) return
  raiz.updateMatrixWorld(true)

  const zona = new THREE.Box3(
    new THREE.Vector3(ZONA.x0 - 0.06, -99, ZONA.z0 - 0.06),
    new THREE.Vector3(ZONA.x1 + 0.06, 99, ZONA.z1 + 0.06))
  const cx = new THREE.Box3()
  const tam = new THREE.Vector3()

  for (const o of raiz.children.slice()) {
    cx.setFromObject(o)
    if (cx.isEmpty()) continue
    if (!zona.containsBox(cx)) continue
    cx.getSize(tam)
    if (tam.x > 3.0 || tam.z > 3.0) continue     // nada grande sai por engano
    raiz.remove(o)
  }

  const cols = ctx.colliders
  if (!Array.isArray(cols)) return
  for (let i = cols.length - 1; i >= 0; i--) {
    const c = cols[i]
    if (!c) continue
    if (c.minX < ZONA.x0 - 0.06 || c.maxX > ZONA.x1 + 0.06) continue
    if (c.minZ < ZONA.z0 - 0.06 || c.maxZ > ZONA.z1 + 0.06) continue
    if (c.maxX - c.minX > 3.0 || c.maxZ - c.minZ > 3.0) continue
    cols.splice(i, 1)
  }
}

// ===========================================================================
// 1. AS PAREDES NOVAS
// ===========================================================================

function paredes(g, cfg, colliders, occluders) {
  const CEIL = cfg.alto
  const BASE = cfg.base

  // --- estrutura ------------------------------------------------------------
  bloco(g, ZONA.x0, COM.x0, 0, CEIL, ZONA.z0, ZONA.z1, M.miolo)               // oeste
  bloco(g, COM.x0, DL, 0, CEIL, ZONA.z0, COM.z0, M.miolo)                     // sul, oeste do vao
  bloco(g, DR, ZONA.x1, 0, CEIL, ZONA.z0, COM.z0, M.miolo)                    // sul, leste do vao
  bloco(g, DL, DR, PORTA.alt, CEIL, ZONA.z0, COM.z0, M.miolo)                 // verga

  // --- a cara que o SALAO ve -------------------------------------------------
  //
  // Lambri escuro ate 1,15, filete e rodape dourados, e vinho ate o teto. Nao e
  // o damasco do salao (aquele pano nasce dentro de casino.js, de uma funcao
  // que nao e exportada), mas e a MESMA PALETA e os MESMOS materiais de ouro. O
  // que se quer da parede de fora e que ela nao chame atencao: quem olha pra
  // este canto tem que ver a placa e a porta, nao o pano.
  const LAM = 1.15
  const faceSul = (x0, x1, y0, y1) => {
    const w = x1 - x0
    if (w <= 0.02) return
    const cxx = (x0 + x1) / 2
    if (y0 < LAM) {
      g.add(pano(w, Math.min(LAM, y1) - y0, M.madeiraSalao, cxx, (y0 + Math.min(LAM, y1)) / 2, ZONA.z0 - 0.01, Math.PI, 1.6))
    }
    if (y1 > LAM) {
      g.add(pano(w, y1 - Math.max(LAM, y0), M.vinho, cxx, (Math.max(LAM, y0) + y1) / 2, ZONA.z0 - 0.01, Math.PI, 1))
      if (y0 < LAM) g.add(box(w, 0.05, 0.035, M.ouroFosco, cxx, LAM, ZONA.z0 - 0.018))
    }
    if (y0 < 0.02) g.add(box(w, 0.17, 0.055, M.ouroFosco, cxx, 0.085, ZONA.z0 - 0.028))
  }
  faceSul(COM.x0, DL, 0, CEIL)
  faceSul(DR, ZONA.x1, 0, CEIL)
  faceSul(DL, DR, PORTA.alt, CEIL)
  // a face oeste (a que o bar do barman ve) leva o mesmo tratamento
  const dOeste = ZONA.z1 - ZONA.z0
  g.add(pano(dOeste, LAM, M.madeiraSalao, ZONA.x0 - 0.01, LAM / 2, (ZONA.z0 + ZONA.z1) / 2, -Math.PI / 2, 1.6))
  g.add(pano(dOeste, CEIL - LAM, M.vinho, ZONA.x0 - 0.01, (LAM + CEIL) / 2, (ZONA.z0 + ZONA.z1) / 2, -Math.PI / 2, 1))
  g.add(box(0.035, 0.05, dOeste, M.ouroFosco, ZONA.x0 - 0.018, LAM, (ZONA.z0 + ZONA.z1) / 2))
  g.add(box(0.055, 0.17, dOeste, M.ouroFosco, ZONA.x0 - 0.028, 0.085, (ZONA.z0 + ZONA.z1) / 2))

  // --- colisores --------------------------------------------------------------
  colliders.push({ minX: ZONA.x0, maxX: COM.x0, minZ: ZONA.z0, maxZ: ZONA.z1, tag: 'cozinha-parede' })
  colliders.push({ minX: COM.x0, maxX: DL, minZ: ZONA.z0, maxZ: COM.z0, tag: 'cozinha-parede' })
  colliders.push({ minX: DR, maxX: ZONA.x1, minZ: ZONA.z0, maxZ: COM.z0, tag: 'cozinha-parede' })

  // --- occluders de camera (Y de MUNDO: o miolo inteiro subiu `base`) ---------
  // Sem eles a camera de terceira pessoa entra pela divisoria e mostra a cozinha
  // de dentro do salao. A verga tambem entra: e o unico pedaco em que a caixa
  // comeca acima do chao.
  const occ = (x0, y0, z0, x1, y1, z1, tag) =>
    occluders.push({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, tag })
  occ(ZONA.x0, 0, ZONA.z0, COM.x0, BASE + CEIL, ZONA.z1, 'cozinha-parede')
  occ(COM.x0, 0, ZONA.z0, DL, BASE + CEIL, COM.z0, 'cozinha-parede')
  occ(DR, 0, ZONA.z0, ZONA.x1, BASE + CEIL, COM.z0, 'cozinha-parede')
  occ(DL, BASE + PORTA.alt, ZONA.z0, DR, BASE + CEIL, COM.z0, 'cozinha-verga')
}

// ===========================================================================
// 2. PISO, REVESTIMENTO E TETO
// ===========================================================================

function acabamento(g) {
  const w = COM.x1 - COM.x0, d = COM.z1 - COM.z0

  // --- piso -------------------------------------------------------------------
  // Sobe 1,4 cm acima do carpete do salao (que esta em 0.004). Duas lajes no
  // MESMO Y brigam por profundidade e o resultado e mancha piscando no chao —
  // e a armadilha que o ARCHITECTURE.md registra como "uma laje por metro
  // quadrado", e ela ja custou dois bugs a este projeto.
  g.add(deitado(w, d, M.piso, (COM.x0 + COM.x1) / 2, 0.014, (COM.z0 + COM.z1) / 2, 1.2))

  // ralo de piso, perto da pia: quem lava molha o chao
  const ralo = box(0.22, 0.012, 0.22, M.inoxEscovado, 31.85, 0.019, 28.30)
  ralo.castShadow = false
  g.add(ralo)
  for (let i = 0; i < 5; i++) {
    const b = box(0.19, 0.010, 0.016, solid(0x6f767a, 0.5, 0.5), 31.85, 0.026, 28.22 + i * 0.04)
    b.castShadow = false
    g.add(b)
  }

  // --- revestimento das quatro paredes ---------------------------------------
  //
  // Tres panos por parede: azulejo branco ate 1,30, a fileira verde-agua de uma
  // peca (1,30 a 1,56) e reboco ate o forro. A faixa nao e enfeite: e a altura
  // em que qualquer cozinha de verdade muda de material, porque e ate ali que a
  // agua bate. Sem ela o azulejo branco de 1,56 le como parede de banheiro.
  const parede = (larg, x, z, ry) => {
    g.add(pano(larg, MEIA, M.azulejoBranco, x, MEIA / 2, z, ry, 1))
    g.add(pano(larg, FAIXA, M.azulejoFaixa, x, MEIA + FAIXA / 2, z, ry, 1))
    g.add(pano(larg, TETO - CAP, M.reboco, x, (CAP + TETO) / 2, z, ry, 3))
  }
  // norte e leste (paredes do predio)
  parede(w, (COM.x0 + COM.x1) / 2, ACB.z1, Math.PI)
  parede(d, ACB.x1, (COM.z0 + COM.z1) / 2, -Math.PI / 2)
  // oeste (divisoria)
  parede(d, ACB.x0, (COM.z0 + COM.z1) / 2, Math.PI / 2)
  // sul (divisoria), com o vao da porta livre e o pedacinho acima da verga
  parede(DL - COM.x0, (COM.x0 + DL) / 2, ACB.z0, 0)
  parede(COM.x1 - DR, (DR + COM.x1) / 2, ACB.z0, 0)
  g.add(pano(PORTA.larg, TETO - PORTA.alt, M.reboco,
    PORTA.x, (PORTA.alt + TETO) / 2, ACB.z0, 0, 3))

  // arremate do azulejo: a pecinha bisotada que fecha o topo da faixa
  const arr = (larg, x, z, ry) => {
    const m = box(ry === 0 || Math.abs(ry) === Math.PI ? larg : 0.045,
      0.045, ry === 0 || Math.abs(ry) === Math.PI ? 0.045 : larg, M.arremate, x, CAP + 0.018, z)
    m.castShadow = false
    g.add(m)
  }
  arr(w, (COM.x0 + COM.x1) / 2, ACB.z1 - 0.012, Math.PI)
  arr(d, ACB.x1 - 0.012, (COM.z0 + COM.z1) / 2, -Math.PI / 2)
  arr(d, ACB.x0 + 0.012, (COM.z0 + COM.z1) / 2, Math.PI / 2)
  arr(DL - COM.x0, (COM.x0 + DL) / 2, ACB.z0 + 0.012, 0)
  arr(COM.x1 - DR, (DR + COM.x1) / 2, ACB.z0 + 0.012, 0)

  // --- rodape sanitario --------------------------------------------------------
  //
  // O encontro do piso com a parede e ARREDONDADO, e nao um cantinho reto. E a
  // definicao de rodape sanitario e o unico detalhe deste comodo que uma cozinha
  // profissional exige por lei: canto vivo junta sujeira. Uma meia-cana e um
  // cilindro de 8 lados metade enterrado — mais barato que um perfil extrudado
  // e, a essa escala, indistinguivel dele.
  const cove = (comp, x, z, aoLongoDeX) => {
    const c = cyl(0.048, 0.048, comp, M.rodape, 8)
    // deitar o cilindro: em X pelo eixo Z, em Z pelo eixo X. Girar nos DOIS
    // (rotation.y junto) nao deita nada — a rotacao em Y nao mexe no eixo do
    // cilindro, que e o proprio Y, e a peca continuaria em pe.
    if (aoLongoDeX) c.rotation.z = Math.PI / 2
    else c.rotation.x = Math.PI / 2
    c.position.set(x, 0.030, z)
    c.castShadow = false
    g.add(c)
  }
  cove(w, (COM.x0 + COM.x1) / 2, ACB.z1 - 0.035, true)
  cove(d, ACB.x1 - 0.035, (COM.z0 + COM.z1) / 2, false)
  cove(d, ACB.x0 + 0.035, (COM.z0 + COM.z1) / 2, false)
  cove(DL - COM.x0, (COM.x0 + DL) / 2, ACB.z0 + 0.035, true)
  cove(COM.x1 - DR, (DR + COM.x1) / 2, ACB.z0 + 0.035, true)

  // --- forro proprio, mais baixo que o do salao --------------------------------
  const forro = plane(w, d, M.teto, Math.PI / 2)
  forro.position.set((COM.x0 + COM.x1) / 2, TETO, (COM.z0 + COM.z1) / 2)
  g.add(forro)

  // DUAS CALHAS EMISSIVAS, e nenhuma luz. Ver a armadilha no cabecalho: o que
  // acende aqui e o material, nao a cena.
  for (const z of [28.72, 26.72]) {
    const u = new THREE.Group()
    u.position.set(30.20, TETO - 0.05, z)
    u.add(box(2.44, 0.10, 0.24, M.inoxEscovado, 0, 0, 0))
    const tubo = box(2.30, 0.05, 0.155, M.luzCalha, 0, -0.062, 0)
    tubo.castShadow = false
    u.add(tubo)
    for (const s of [-1, 1]) u.add(box(0.05, 0.11, 0.25, M.inox, s * 1.225, -0.010, 0))
    // as duas hastes ate o forro
    for (const s of [-1, 1]) u.add(cyl(0.010, 0.010, 0.05, M.inoxEscovado, 6).translateX(s * 0.9).translateY(0.05))
    u.traverse((c) => { if (c.isMesh) c.castShadow = false })
    g.add(u)
  }
}

// ===========================================================================
// 3. A PORTA DE SERVICO
// ===========================================================================

/**
 * PORTA VAIVEM DE COZINHA: chapa de inox embaixo, janelinha redonda na altura
 * do olho, e um batente que nao tem tranca nenhuma. Porta de servico nao tranca.
 *
 * ELA ABRE PRA LONGE DE QUEM ABRE. Um vaivem de verdade cede pros dois lados, e
 * reproduzir isso e uma linha: no instante em que ela comeca a abrir, le-se de
 * que lado do plano da folha o jogador esta e escolhe-se o sinal do giro. E o
 * detalhe que separa "uma porta que gira" de "uma porta de cozinha".
 *
 * O COLISOR SOME JUNTO, e isso nao e opcional: um vao que abre na tela e
 * continua barrando e pior que um vao que nao abre — o jogador fica achando que
 * o jogo travou.
 *
 * A DOBRADICA E NA ESQUERDA (x menor) porque a folha aberta pra dentro estaciona
 * sobre o chao vazio do meio da cozinha; na direita ela pararia encostada na
 * bancada de louca suja, que e onde as maos de quem entra estao ocupadas.
 */
function portaDeServico(g, colliders, interactables, cfg, est) {
  const BASE = cfg.base
  const grupo = new THREE.Group()
  grupo.name = 'cozinha-porta'
  grupo.userData.noBake = true          // gira: nao pode ir pro forno
  g.add(grupo)

  const pivo = new THREE.Group()
  pivo.position.set(FOLHA_X, 0, PORTA_Z)
  grupo.add(pivo)
  est.pivo = pivo

  // --- a folha, com o buraco da janela --------------------------------------
  // Ela e montada em QUATRO pedacos em volta de um vao quadrado, e nao numa
  // caixa unica com um vidro colado por cima: janela que nao atravessa a folha
  // e adesivo, e a esta distancia o olho pega a diferenca na hora.
  const T = 0.046, H = PORTA.alt - 0.06, W = FOLHA_W
  const jx = W / 2, jy = 1.55, jr = 0.14        // meio vao da janela
  const folha = (x0, x1, y0, y1) => {
    if (x1 - x0 <= 0.002 || y1 - y0 <= 0.002) return
    const m = box(x1 - x0, y1 - y0, T, M.chapa, (x0 + x1) / 2, (y0 + y1) / 2, 0)
    pivo.add(m)
  }
  folha(0, W, 0, jy - jr)
  folha(0, W, jy + jr, H)
  folha(0, jx - jr, jy - jr, jy + jr)
  folha(jx + jr, W, jy - jr, jy + jr)

  // o vidro e os dois aros que escondem os cantos do vao quadrado
  const vidro = new THREE.Mesh(new THREE.CircleGeometry(0.152, 22), glass(0xd6ecf2, 0.20))
  vidro.position.set(jx, jy, 0)
  vidro.castShadow = false
  pivo.add(vidro)
  for (const s of [-1, 1]) {
    const aro = new THREE.Mesh(new THREE.RingGeometry(0.140, 0.216, 26), M.inox)
    aro.position.set(jx, jy, s * (T / 2 + 0.003))
    if (s < 0) aro.rotation.y = Math.PI
    aro.castShadow = false
    aro.receiveShadow = true
    pivo.add(aro)
    const bead = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.011, 6, 22), M.inoxEscovado)
    bead.position.set(jx, jy, s * (T / 2 + 0.008))
    bead.castShadow = false
    bead.receiveShadow = true
    pivo.add(bead)
    // chapa de inox de baixo (o "chuta-pe"): e ela que diz porta de cozinha
    const chapa = box(W - 0.05, 0.86, 0.005, M.inox, jx, 0.46, s * (T / 2 + 0.003))
    chapa.castShadow = false
    pivo.add(chapa)
    // e a defensa de mao, na altura de quem empurra com o ombro
    const defensa = box(W - 0.14, 0.19, 0.006, M.inoxEscovado, jx, 1.05, s * (T / 2 + 0.004))
    defensa.castShadow = false
    pivo.add(defensa)
  }

  // dobradicas de mola (as tres bolachas do lado do eixo)
  for (const y of [0.28, 1.05, 1.86]) {
    const gz = cyl(0.026, 0.026, 0.10, M.inoxEscovado, 8)
    gz.position.set(0.028, y, 0)
    pivo.add(gz)
  }

  // A placa da propria folha. Pequena e so no lado do salao: quem esta dentro
  // ja sabe que e funcionario.
  const so = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.10), textPlaneMat('SO FUNCIONARIOS', {
    w: 768, h: 160, bg: '#20242a', color: '#e6e9ea',
    font: 'bold 78px "Trebuchet MS", sans-serif', emissiveIntensity: 0.10,
  }))
  so.position.set(jx, 1.90, -(T / 2 + 0.006))
  so.rotation.y = Math.PI
  so.receiveShadow = true
  pivo.add(so)

  // --- batente ---------------------------------------------------------------
  const bat = (x) => {
    const m = box(0.045, PORTA.alt + 0.05, TP + 0.05, M.inoxEscovado, x, (PORTA.alt + 0.05) / 2, PORTA_Z)
    m.castShadow = false
    g.add(m)
  }
  bat(DL + 0.0225)
  bat(DR - 0.0225)
  const verga = box(PORTA.larg, 0.05, TP + 0.05, M.inoxEscovado, PORTA.x, PORTA.alt + 0.025, PORTA_Z)
  verga.castShadow = false
  g.add(verga)

  // --- a placa ao lado -------------------------------------------------------
  //
  // O salao esta em z MENOR que a parede, entao "na frente" aqui e z NEGATIVO:
  // a moldura dourada e a peca de tras (z local maior) e a letra e a da frente.
  // Montar na ordem intuitiva poe a moldura por cima do texto.
  const placa = new THREE.Group()
  placa.position.set(DL - 0.62, 2.32, ZONA.z0 - 0.022)
  placa.add(box(0.80, 0.34, 0.016, M.ouroFosco, 0, 0, 0.010))
  placa.add(box(0.76, 0.30, 0.030, solid(0x1d2126, 0.62, 0.15), 0, 0, -0.008))
  const letra = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.22), textPlaneMat('COZINHA', {
    w: 768, h: 256, bg: 'rgba(0,0,0,0)', color: '#e8d9a8',
    font: 'bold 132px "Trebuchet MS", sans-serif', emissiveIntensity: 0.45,
  }))
  letra.position.z = -0.026
  letra.rotation.y = Math.PI
  letra.receiveShadow = true
  placa.add(letra)
  placa.traverse((c) => { if (c.isMesh) c.castShadow = false })
  g.add(placa)

  // --- colisor do vao ---------------------------------------------------------
  //
  // Ele nasce como colisor NORMAL, empurrado na lista que o cassino entrega, e
  // e RECUPERADO da grade no primeiro quadro pela tag. O caminho obvio seria
  // chamar game.collision.add() aqui e guardar o retorno (e o que casa-velha.js
  // e adega.js fazem), mas este modulo nao recebe o `game` — o contrato de
  // world/casino-bar.js entrega raiz, listas e medidas, e mais nada.
  //
  // E melhor assim, e nao pior: colisor registrado durante a CONSTRUCAO entra na
  // gravacao de cenario/cenarios.js, que grampeia collision.add so enquanto o
  // mundo esta sendo montado. Registrado depois, no primeiro update, ele
  // sobreviveria a troca de cenario (F6) como parede invisivel no meio do nada.
  colliders.push({
    minX: DL + 0.02, maxX: DR - 0.02,
    minZ: ZONA.z0, maxZ: COM.z0,
    tag: TAG_PORTA,
  })

  // --- os dois pontos de E ------------------------------------------------------
  //
  // OS DOIS SAO ALTERNADORES COMPLETOS. A adega ja pagou o preco de fazer um
  // ponto que so abre e outro que so fecha: o jogador entrava, fechava a porta,
  // e o E de dentro virava tecla morta — sem macaneta do lado de fora, o unico
  // jeito de sair era recarregar a pagina. Aqui a regra e uma so dos dois lados:
  // fechada abre, aberta fecha.
  const alternar = (gm) => {
    if (est.fase === 'aberta') { est.fase = 'fechando'; est.t = 0; somPorta(0.42); return }
    if (est.fase !== 'fechada') return
    est.fase = 'abrindo'
    est.t = 0
    // pra que lado ela cede: pro lado oposto ao de quem esta abrindo
    const pz = gm && gm.player && gm.player.position ? gm.player.position.z : 0
    est.lado = pz < PORTA_Z ? -1 : 1
    somPorta(0.42)
  }

  const fora = {
    id: 'cassino-cozinha-porta',
    position: new THREE.Vector3(PORTA.x, BASE + 1.05, ZONA.z0 - 0.62),
    radius: 1.9,
    label: 'Abrir a porta da cozinha',
    onInteract: alternar,
  }
  const dentro = {
    id: 'cassino-cozinha-porta-dentro',
    position: new THREE.Vector3(PORTA.x, BASE + 1.05, COM.z0 + 0.62),
    radius: 1.9,
    label: 'Abrir a porta',
    onInteract: alternar,
  }
  interactables.push(fora, dentro)
  est.fora = fora
  est.dentro = dentro
}

// ===========================================================================
// 4. A PIA E O QUE ESPERA POR ELA
// ===========================================================================

/** Copo com cara de usado: mesma peca, material sem brilho e um resto no fundo. */
function copoSujo(id) {
  const ficha = copoDe(id)
  if (!ficha) return null
  const c = ficha.build()
  c.traverse((o) => { if (o.isMesh) o.material = M.vidroSujo })
  return c
}

function copoLimpo(id) {
  const ficha = copoDe(id)
  return ficha ? ficha.build() : null
}

function equipamento(g, colliders) {
  const col = (x0, x1, z0, z1, tag) => colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, tag })
  const vivos = {}

  // --- A PIA ------------------------------------------------------------------
  //
  // Ela e girada meia volta porque a peca nasce olhando pra +Z (regra de
  // mobilia/) e aqui as costas dela vao na parede NORTE. A cuba da torneira cai
  // no eixo do vao da porta: quem entra encara a torneira, e nao a lateral do
  // movel — e a unica coisa que este posicionamento tem que acertar.
  const pia = criarPiaIndustrial({ larg: 4.00, prof: 0.70, alt: 0.90 })
  pia.grupo.position.set(30.90, 0, ACB.z1 - 0.35)
  pia.grupo.rotation.y = Math.PI
  g.add(pia.grupo)
  col(28.90, 32.90, 28.92, ACB.z1, 'cozinha-pia')
  vivos.pia = pia

  // --- o escorredor, na pingadeira -------------------------------------------
  const esc = escorredorDeCopos(1.70, 0.44)
  esc.position.set(30.00, 0.90, 29.25)
  g.add(esc)
  const apoio = 0.90 + (esc.userData.apoio || 0.056)
  // Copos de BOCA PRA BAIXO. A tulipa tem 14,8 cm: virada, a origem sobe a
  // altura inteira, senao ela afunda na grade ate a metade.
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 2; k++) {
      const c = copoLimpo('copo-tulipa')
      if (!c) break
      c.position.set(29.40 + i * 0.22, apoio + 0.148, 29.15 + k * 0.22)
      c.rotation.x = Math.PI
      c.rotation.y = i * 0.4 + k
      g.add(c)
    }
  }

  // --- prateleira de parede com mais copos limpos ------------------------------
  const pp = prateleiraDeParede(1.80, 0.26)
  pp.position.set(29.90, 1.48, ACB.z1)
  pp.rotation.y = Math.PI
  g.add(pp)
  for (let i = 0; i < 4; i++) {
    const c = copoLimpo('copo-tulipa')
    if (!c) break
    c.position.set(29.30 + i * 0.25, 1.492 + 0.148, 29.49)
    c.rotation.x = Math.PI
    c.rotation.y = i * 0.7
    g.add(c)
  }

  // --- prateleira de aco no canto noroeste --------------------------------------
  const pa = prateleiraDeAco(1.80, 1.90, 0.50, { n: 4, semente: 3 })
  pa.position.set(27.89, 0, ACB.z1 - 0.25)
  pa.rotation.y = Math.PI
  g.add(pa)
  col(26.99, 28.79, 29.12, ACB.z1, 'cozinha-prateleira')

  // --- a bancada de apoio, na parede leste: onde a louca suja CHEGA ------------
  const ba = bancadaDeApoio(2.00, 0.64, 0.90)
  ba.position.set(ACB.x1 - 0.32, 0, 27.50)
  ba.rotation.y = -Math.PI / 2
  g.add(ba)
  col(32.98, ACB.x1, 26.50, 28.50, 'cozinha-bancada')

  // A PILHA DE COPOS SUJOS. Ela e o enredo do comodo: nao ha um texto em lugar
  // nenhum dizendo que ali se lava louca, e nao precisa — uma caixa de copos
  // engordurados esperando ao lado de uma pia diz sozinha. E e o convite pro
  // sistema que vem depois.
  const tina = caixaPlastica(0.50, 0.22, 0.36, 0x2f6f8f)
  tina.position.set(33.30, 0.90, 27.05)
  tina.rotation.y = Math.PI / 2
  g.add(tina)
  // 0.914 = tampo (0.90) + a chapa do fundo da caixa (14 mm). Copo pousado no
  // ar por cima de um fundo de caixa aparece de longe.
  for (const [x, z, r] of [[33.22, 26.92, 0], [33.38, 26.98, 0.8], [33.28, 27.16, 1.9], [33.36, 27.24, 2.6]]) {
    const c = copoSujo('copo-americano')
    if (!c) break
    c.position.set(x, 0.915, z)
    c.rotation.y = r
    g.add(c)
  }
  // tres largados fora da caixa, e um pano de prato amassado
  for (const [x, z, r] of [[33.28, 27.68, 0.4], [33.40, 27.92, 2.2], [33.20, 28.14, 1.1]]) {
    const c = copoSujo('copo-tulipa')
    if (!c) break
    c.position.set(x, 0.902, z)
    c.rotation.y = r
    g.add(c)
  }
  const pano = box(0.26, 0.014, 0.20, solid(0xb9c0bd, 0.94), 33.34, 0.906, 26.68)
  pano.rotation.y = 0.5
  g.add(pano)

  // --- carrinho de louca -------------------------------------------------------
  const car = carrinhoDeLouca(1.00, 0.62, 0.94)
  car.position.set(30.30, 0, 26.62)
  car.rotation.y = 0.34                     // torto: carrinho nunca fica no esquadro
  g.add(car)
  col(29.68, 30.92, 26.16, 27.08, 'cozinha-carrinho')
  const cx1 = caixaPlastica(0.46, 0.22, 0.34, 0xc4392f)
  cx1.position.set(30.30, 0.931, 26.62)     // 0.931 = topo da bandeja de cima
  cx1.rotation.y = 0.34
  g.add(cx1)
  // Tulipas e nao americanos aqui: o copo americano traz uma InstancedMesh de
  // caneluras que o forno nao funde, e cada um dele custa um draw call proprio.
  // Vale pagar isso pela pilha que o jogador se debruca pra ver (a tina da
  // bancada), nao por tres copos de canto de carrinho.
  for (const [dx, dz] of [[-0.10, -0.04], [0.06, 0.05], [0.13, -0.08]]) {
    const c = copoSujo('copo-tulipa')
    if (!c) break
    c.position.set(30.30 + dx, 0.945, 26.62 + dz)
    c.rotation.y = dx * 9
    g.add(c)
  }

  // --- lixeira de pedal --------------------------------------------------------
  const lix = lixeiraDePedal(0.19, 0.62)
  lix.position.set(27.55, 0, 26.34)
  lix.rotation.y = -0.55
  g.add(lix)
  col(27.32, 27.78, 26.11, 26.57, 'cozinha-lixeira')

  // --- tapete antiderrapante em frente a pia -------------------------------------
  g.add(deitado(3.40, 0.78, M.tapete, 30.70, 0.020, 28.42, 0.6))

  // --- o que fica pendurado nas paredes -------------------------------------------
  const ex = exaustorDeParede(0.46)
  ex.grupo.position.set(ACB.x1, 2.40, 29.08)
  ex.grupo.rotation.y = -Math.PI / 2
  g.add(ex.grupo)
  vivos.exaustor = ex

  const rel = relogioDeParede(0.17)
  rel.grupo.position.set(28.30, 2.16, ACB.z0)
  g.add(rel.grupo)
  vivos.relogio = rel

  const qa = quadroDeAvisos(0.80, 0.58)
  qa.position.set(ACB.x0, 1.62, 27.30)
  qa.rotation.y = Math.PI / 2
  g.add(qa)

  const cab = cabideDeAventais(0.70)
  cab.position.set(ACB.x0, 1.82, 28.50)
  cab.rotation.y = Math.PI / 2
  g.add(cab)

  return vivos
}

// ===========================================================================
// BUILDER
// ===========================================================================

export function buildCasinoCozinha(ctx = {}) {
  const raiz = ctx.raiz
  if (!raiz || !raiz.isObject3D) return { update() {} }

  const colliders = Array.isArray(ctx.colliders) ? ctx.colliders : []
  const interactables = Array.isArray(ctx.interactables) ? ctx.interactables : []
  const occluders = Array.isArray(ctx.occluders) ? ctx.occluders : []
  const base = typeof ctx.base === 'number' ? ctx.base : 0.16
  // pe-direito LOCAL do miolo: o predio inteiro menos a espessura do piso
  const alto = (ctx.predio && ctx.predio.wallHeight ? ctx.predio.wallHeight : 6.2) - base
  const cfg = { base, alto }

  limparZona(ctx)

  const g = new THREE.Group()
  g.name = 'casino-cozinha'
  raiz.add(g)

  const est = {
    fase: 'fechada',     // fechada | abrindo | aberta | fechando
    t: 0,
    // giro pode ficar NEGATIVO no fim do fechamento: e o vaivem passando do
    // batente pro outro lado antes de morrer. Quem le isso pra decidir colisao
    // tem que usar o modulo.
    giro: 0,
    lado: -1,            // -1 abre pra dentro da cozinha, +1 pro salao
    pivo: null,
    fora: null,
    dentro: null,
  }

  // A caixa do vao, recuperada da grade de colisao pela tag (ver o comentario
  // longo em portaDeServico). Ate achar, um objeto de mentira segura o `ativo`.
  let caixa = { ativo: true }
  let achado = false
  function procurarColisor(gm) {
    achado = true
    if (!gm || !gm.collision || typeof gm.collision.query !== 'function') return
    const perto = gm.collision.query(PORTA.x, PORTA_Z, 1.4)
    for (let i = 0; i < perto.length; i++) {
      if (perto[i] && perto[i].tag === TAG_PORTA) { caixa = perto[i]; return }
    }
    achado = false      // a grade ainda nao recebeu os colisores: tenta de novo
  }

  paredes(g, cfg, colliders, occluders)
  acabamento(g)
  portaDeServico(g, colliders, interactables, cfg, est)
  const vivos = equipamento(g, colliders)
  const pia = vivos.pia

  // --- os pontos de E da pia -------------------------------------------------
  //
  // As ancoras saem da PROPRIA peca (pia.alvoTorneira) e sao convertidas pra
  // mundo pela matriz do grupo. Numero copiado daqui envelhece sozinho no dia
  // em que a pia andar 20 cm; a peca sabe onde e a frente dela.
  pia.grupo.updateWorldMatrix(true, false)
  const pTorneira = pia.grupo.localToWorld(pia.alvoTorneira.clone())
  const pontoTorneira = {
    id: 'cassino-cozinha-torneira',
    position: pTorneira,
    radius: 1.7,
    label: 'Abrir a torneira',
    onInteract: () => {
      const aberta = pia.torneira.alternar()
      pontoTorneira.label = aberta ? 'Fechar a torneira' : 'Abrir a torneira'
    },
  }
  interactables.push(pontoTorneira)

  const pontoLouca = {
    id: 'cassino-cozinha-louca',
    position: new THREE.Vector3(32.84, base + 1.05, 27.40),
    radius: 1.6,
    label: 'Lavar a louca',
    onInteract: (gm) => {
      // ---------------------------------------------------------------------
      // AQUI ENTRA O SISTEMA DE LAVAR. Ver a secao CONTRATO no fim do arquivo.
      // Por ora, so o aviso: prometer mecanica que nao existe e pior que dizer
      // que ela nao existe ainda.
      // ---------------------------------------------------------------------
      const msg = 'Lavar louca ainda nao — em breve'
      if (gm && typeof gm.toast === 'function') gm.toast(msg)
      else if (gm && gm.hud && typeof gm.hud.toast === 'function') gm.hud.toast(msg)
    },
  }
  interactables.push(pontoLouca)

  // ancora de mundo pra medir a distancia do jogador (som da agua)
  const centroPia = new THREE.Vector3(30.90, base + 0.90, 29.27)

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.05)

    // --- a porta ------------------------------------------------------------
    est.t += d
    if (est.fase === 'abrindo') {
      // ease-out: a folha sai pesada e chega leve
      est.giro = Math.min(1, 1 - Math.pow(1 - Math.min(1, est.t / 0.62), 3))
      if (est.giro >= 1) {
        est.fase = 'aberta'
        est.fora.label = 'Fechar a porta da cozinha'
        est.dentro.label = 'Fechar a porta'
      }
    } else if (est.fase === 'fechando') {
      // A VOLTA E UMA OSCILACAO AMORTECIDA, e nao uma rampa. Vaivem nao para no
      // batente: ele passa, volta menos, passa de novo e morre. Um cosseno de
      // quase duas voltas dentro de uma envoltoria que cai da isso em uma linha,
      // e o sinal NEGATIVO no meio do caminho e a folha do outro lado — que e
      // exatamente o que se quer ver.
      const k = Math.min(1, est.t / 0.72)
      est.giro = (1 - k) * Math.cos(k * Math.PI * 1.9) * (1 - k * 0.35)
      if (k >= 1) {
        est.giro = 0
        est.fase = 'fechada'
        est.fora.label = 'Abrir a porta da cozinha'
        est.dentro.label = 'Abrir a porta'
      }
    }
    if (est.pivo) est.pivo.rotation.y = est.lado * est.giro * 1.58
    // O colisor do vao so empurra com a folha quase fechada — e o teste e pelo
    // MODULO, porque no balanco de volta o giro fica negativo e a folha esta
    // igualmente fora do vao.
    caixa.ativo = Math.abs(est.giro) < 0.30

    // --- a pia, o exaustor e o relogio ---------------------------------------
    let dist = 0
    if (gm && gm.player && gm.player.position) dist = gm.player.position.distanceTo(centroPia)
    pia.atualizar(d, dist)
    if (vivos.exaustor) vivos.exaustor.atualizar(d)
    if (vivos.relogio) vivos.relogio.atualizar(d)

    // o rotulo da torneira acompanha o estado mesmo se alguem abrir por codigo
    const lbl = pia.torneira.aberta ? 'Fechar a torneira' : 'Abrir a torneira'
    if (pontoTorneira.label !== lbl) pontoTorneira.label = lbl

    // --- a caca ao colisor, uma vez so ----------------------------------------
    if (!achado) procurarColisor(gm)
  }

  return {
    update,
    grupo: g,

    // -----------------------------------------------------------------------
    // CONTRATO PRO SISTEMA DE LAVAR (o que ja existe, e onde ele encaixa)
    //
    // O QUE JA ESTA PRONTO:
    //   pia.torneira.abrir() / .fechar() / .alternar()
    //   pia.torneira.aberta      a alavanca ja deitou
    //   pia.torneira.jorrando    A AGUA JA CHEGOU NO FUNDO. E este (e nao
    //                            `aberta`) o gatilho de "esta lavando": entre
    //                            os dois ha ~250 ms, e um copo que fica limpo
    //                            no quadro em que a alavanca deita fica limpo
    //                            antes de existir agua na tela.
    //   pia.cubas                [Vector3, Vector3] — o centro do fundo das
    //                            duas cubas, em coordenadas LOCAIS da pia. Pra
    //                            mundo: pia.grupo.localToWorld(v.clone()).
    //   pia.alturas              { tampo, fundoCuba } — onde um copo pousa.
    //   pontoLouca               o ponto de E da pilha de sujos. Trocar o
    //                            `onInteract` dele (e o `label`) e TODO o
    //                            encaixe do sistema novo: o objeto na lista da
    //                            interacao e este mesmo, e escrever nele manda
    //                            de verdade (ver systems/interaction.js).
    //   sujos / limpos           quantos copos ha de cada lado hoje. Sao numeros
    //                            e nao geometria de proposito: quem for lavar
    //                            vai querer MOVER copo entre a bancada e o
    //                            escorredor, e mover copo e trabalho de quem
    //                            tiver a mecanica, nao deste montador.
    //
    // O QUE FALTA (e deliberadamente NAO esta aqui):
    //   pegar o copo sujo, por embaixo da agua, esperar, devolver ao escorredor,
    //   e o que isso vale pro bar. Nada disso tem uma linha escrita.
    // -----------------------------------------------------------------------
    pia,
    pontoLouca,
    pontoTorneira,
    portaAberta: () => est.fase === 'aberta',
    sujos: 10,
    limpos: 12,
    zona: { ...ZONA },
  }
}

export default buildCasinoCozinha
