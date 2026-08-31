import * as THREE from 'three'
import {
  solid, stdMat, glass, box, cyl, sphere, roundedBox, woodTex, tex, textPlaneMat,
} from '../world/materials.js'
import { BEBIDAS } from './bebidas.js'
import { ERVAS } from './erva.js'
import { CACA_NIQUEIS } from './caca-niquel.js'
import { VIDEO_POKER } from './video-poker.js'

// ---------------------------------------------------------------------------
// src/mobilia/catalogo.js — o que a loja de jogos vende e o que entra na casa.
//
// UM CATALOGO SO PARA TRES DONOS. A loja le preco, nome e qualidade; o
// inventario le quanto empilha; o encaixe le a PEGADA (quantos metros de chao a
// peca ocupa) e chama o mesmo `build()`. Se cada um tivesse a propria tabela,
// a mesa de sinuca custaria 950 na vitrine e ocuparia outra area no chao —
// defeito que so aparece depois de comprada.
//
// A PEGADA E UM RETANGULO ALINHADO AOS EIXOS, em metros, e nao a caixa da
// geometria: taco de sinuca precisa de espaco em volta da mesa, e esse espaco e
// parte do movel do ponto de vista de quem anda pela sala. Por isso `larg` e
// `prof` sao maiores que o gabinete em algumas pecas, e o comentario de cada uma
// diz de onde saiu o numero.
//
// TUDO PROCEDURAL, como o resto do jogo: nao ha um asset externo aqui dentro.
// Materiais vem do cache de world/materials.js — o mesmo feltro da mesa e o
// feltro do cassino.
// ---------------------------------------------------------------------------

/** Altura do tampo de uma mesa de sinuca de bar, do chao ao pano. */
const ALT_MESA = 0.80

// --- materiais (cacheados por chave, como o resto do jogo) ------------------

/** Veludo do pano: trama fina e uma sombra de uso na area da quebra. */
function feltroTex(hex, gasto) {
  return tex('mob-feltro:' + hex + ':' + (gasto ? 1 : 0), 256, (g, s) => {
    g.fillStyle = hex
    g.fillRect(0, 0, s, s)
    // trama: dois sentidos, quase invisiveis. Pano chapado le como papel.
    for (let i = 0; i < 900; i++) {
      g.fillStyle = 'rgba(255,255,255,' + (0.012 + Math.random() * 0.03) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1)
      g.fillStyle = 'rgba(0,0,0,' + (0.012 + Math.random() * 0.03) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1 + Math.random() * 2)
    }
    if (!gasto) return
    // A MANCHA DA QUEBRA. Numa mesa de bar o pano gasta primeiro onde a bola
    // branca bate todo dia — e o detalhe que diz "usada" sem precisar de rotulo.
    const r = g.createRadialGradient(s * 0.24, s * 0.5, 4, s * 0.24, s * 0.5, s * 0.22)
    r.addColorStop(0, 'rgba(255,255,255,0.16)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = 'rgba(0,0,0,0.10)'
      g.lineWidth = 1
      g.beginPath()
      const x = Math.random() * s, y = Math.random() * s
      g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40)
      g.stroke()
    }
  })
}

const M = {
  get nogueira() {
    return stdMat('mob-nogueira', { map: woodTex(2, '#4a2c18'), color: 0x8a5c38, roughness: 0.62 })
  },
  get carvalho() {
    return stdMat('mob-carvalho', { map: woodTex(2, '#6b4626'), color: 0xa07a52, roughness: 0.78 })
  },
  get escuro() { return solid(0x1d1a17, 0.9) },
  get borracha() { return solid(0x23302a, 0.96) },
  get latao() { return solid(0xbf9a45, 0.35, 0.75) },
  get cromo() { return solid(0xd8dde3, 0.22, 0.85) },
  get aluminio() { return solid(0x9aa1a8, 0.42, 0.6) },
  get couro() { return solid(0x5a3a2a, 0.88) },
  get espuma() { return solid(0x1a1c20, 0.99) },
  get papel() { return solid(0xe8e2d2, 0.95) },
  feltro(hex, gasto) {
    return stdMat('mob-feltro-mat:' + hex + ':' + (gasto ? 1 : 0), {
      map: feltroTex(hex, gasto), color: 0xffffff, roughness: 0.99,
    })
  },
  neon(hex) { return stdMat('mob-neon:' + hex, { color: hex, emissive: hex, emissiveIntensity: 1.5, roughness: 0.4 }) },
}

// --- pecas comuns -----------------------------------------------------------

/**
 * MESA DE SINUCA. As duas do catalogo dividem tudo menos o tamanho, a cor do
 * pano e o estrago: passar `gasto` poe a mancha da quebra, um calco de
 * compensado sob um pe e a borracha ressecada.
 */
function mesaDeSinuca(comp, larg, corPano, gasto) {
  const g = new THREE.Group()
  const h = ALT_MESA
  const tab = 0.09                    // largura da tabela de madeira

  // leito + pano
  g.add(box(comp, 0.09, larg, M.nogueira, 0, h - 0.045, 0))
  const pano = box(comp - tab * 2, 0.012, larg - tab * 2, M.feltro(corPano, gasto), 0, h + 0.006, 0)
  pano.receiveShadow = true
  g.add(pano)

  // tabelas: madeira por cima, borracha por dentro
  for (const s of [-1, 1]) {
    g.add(box(comp, 0.10, tab, M.nogueira, 0, h + 0.05, s * (larg / 2 - tab / 2)))
    g.add(box(comp - tab * 2, 0.05, 0.028, M.borracha, 0, h + 0.03, s * (larg / 2 - tab - 0.014)))
    g.add(box(tab, 0.10, larg, M.nogueira, s * (comp / 2 - tab / 2), h + 0.05, 0))
    g.add(box(0.028, 0.05, larg - tab * 2, M.borracha, s * (comp / 2 - tab - 0.014), h + 0.03, 0))
  }

  // cacapas: seis, com rede de cone
  const cac = [[-1, -1], [-1, 1], [1, -1], [1, 1], [0, -1], [0, 1]]
  for (const c of cac) {
    const x = c[0] * (comp / 2 - tab * 0.6)
    const z = c[1] * (larg / 2 - tab * 0.6)
    const aro = cyl(0.062, 0.062, 0.05, M.escuro, 12)
    aro.position.set(x, h + 0.03, z)
    g.add(aro)
    const rede = cyl(0.058, 0.018, 0.16, M.espuma, 8, true)
    rede.position.set(x, h - 0.06, z)
    g.add(rede)
  }

  // pernas: quatro blocos macicos. O calco de 8 mm num pe e o que le como
  // "chao torto ha muito tempo" — vale mais que qualquer textura de arranhao.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = sx * (comp / 2 - 0.20)
      const pz = sz * (larg / 2 - 0.16)
      g.add(box(0.20, h - 0.09, 0.20, M.nogueira, px, (h - 0.09) / 2, pz))
    }
  }
  if (gasto) g.add(box(0.22, 0.008, 0.22, M.papel, -(comp / 2 - 0.20), 0.004, -(larg / 2 - 0.16)))

  // bolas: UM InstancedMesh, cor por instancia. Dezesseis meshes soltos numa
  // peca que ja tem trinta e o tipo de coisa que estoura o orcamento sozinha.
  const geoBola = new THREE.SphereGeometry(0.028, 12, 8)
  const matBola = solid(0xffffff, 0.18, 0.05)
  const bolas = new THREE.InstancedMesh(geoBola, matBola, 16)
  const dummy = new THREE.Object3D()
  const cor = new THREE.Color()
  const CORES = [0xf2ecd8, 0xf5c518, 0x2a5fbf, 0xc0392b, 0x8e44ad, 0xe07020,
    0x1e8449, 0x7b241c, 0x1c1c1c, 0xf5c518, 0x2a5fbf, 0xc0392b,
    0x8e44ad, 0xe07020, 0x1e8449, 0x7b241c]
  let k = 0
  for (let fila = 0; fila < 5 && k < 16; fila++) {
    for (let i = 0; i <= fila && k < 16; i++) {
      dummy.position.set(
        comp * 0.22 + fila * 0.049,
        h + 0.034,
        (i - fila / 2) * 0.057,
      )
      dummy.updateMatrix()
      bolas.setMatrixAt(k, dummy.matrix)
      bolas.setColorAt(k, cor.setHex(CORES[k]))
      k++
    }
  }
  bolas.instanceMatrix.needsUpdate = true
  if (bolas.instanceColor) bolas.instanceColor.needsUpdate = true
  bolas.castShadow = false
  g.add(bolas)

  // dois tacos encostados na tabela: sao eles que dizem o tamanho da peca
  for (let i = 0; i < 2; i++) {
    const taco = cyl(0.008, 0.016, 1.45, M.carvalho, 6)
    taco.position.set(comp / 2 - 0.10 - i * 0.14, 0.72, -larg / 2 + 0.30)
    taco.rotation.z = 0.42
    taco.rotation.x = -0.10
    g.add(taco)
  }
  return g
}

/**
 * O NAIPE DE ESPADAS, como Shape 2D — a marca da casa.
 *
 * Desenhado e nao texturizado por dois motivos. Primeiro, coerencia: o jogo
 * inteiro e geometria procedural, e um simbolo em canvas ficaria borrado no
 * unico lugar em que o jogador chega perto (a caixa de baralho tem 6 cm). E
 * segundo, JURIDICO: baralho de verdade e a parte do jogo em que copiar sem
 * pensar e mais tentador, e um naipe desenhado do zero nao carrega marca,
 * fonte nem arte de ninguem. Naipe e simbolo de dominio publico; o desenho ao
 * redor dele e que costuma ser de alguem.
 *
 * O contorno vive em [-1, 1] nos dois eixos pra quem chama so escalar.
 */
function shapeEspadas() {
  const s = new THREE.Shape()
  s.moveTo(0, 1.0)
  s.bezierCurveTo(-0.42, 0.44, -1.0, 0.26, -1.0, -0.14)
  s.bezierCurveTo(-1.0, -0.50, -0.66, -0.66, -0.34, -0.48)
  s.bezierCurveTo(-0.18, -0.39, -0.12, -0.52, -0.16, -0.66)
  s.bezierCurveTo(-0.22, -0.84, -0.34, -0.94, -0.44, -1.0)
  s.lineTo(0.44, -1.0)
  s.bezierCurveTo(0.34, -0.94, 0.22, -0.84, 0.16, -0.66)
  s.bezierCurveTo(0.12, -0.52, 0.18, -0.39, 0.34, -0.48)
  s.bezierCurveTo(0.66, -0.66, 1.0, -0.50, 1.0, -0.14)
  s.bezierCurveTo(1.0, 0.26, 0.42, 0.44, 0, 1.0)
  return s
}

/** Um naipe de espadas em relevo, com `alt` metros de altura total. */
function espadas(mat, alt, prof) {
  const geo = new THREE.ExtrudeGeometry(shapeEspadas(), {
    depth: prof, bevelEnabled: false, curveSegments: 8,
  })
  // O Shape mede 2 de altura; escalar por alt/2 poe a peca na medida pedida.
  geo.scale(alt / 2, alt / 2, 1)
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = false
  return m
}

/**
 * BARALHO: a caixa, com a medida real de um baralho de poker.
 *
 * SEM UMA LETRA. A versao anterior estampava uma marca inventada em canvas
 * ("BEIRA", "NAIPE", "ESTRELA") e o dono pediu pra tirar — texto num baralho e
 * onde mora o risco de direito autoral, e uma marca inventada nao resolve:
 * quem olha compara com a caixa que conhece. O que ficou e so simbolo:
 *
 *   - o naipe de espadas grande no meio,
 *   - uma moldura dupla de filete, que e o "algo a mais" que faz a caixa ler
 *     como produto e nao como um bloco pintado,
 *   - quatro espadinhas nos cantos, dentro da moldura.
 */
function baralho(corCaixa, lacre) {
  const g = new THREE.Group()
  const w = 0.064, h = 0.089, d = 0.019
  const papelM = solid(corCaixa, 0.7)
  const filete = solid(0xf0e4c4, 0.55, 0.10)

  g.add(box(w, h, d, papelM, 0, h / 2, 0))
  // faixa da tampa
  g.add(box(w + 0.002, 0.016, d + 0.002, solid(corCaixa, 0.55, 0.15), 0, h - 0.012, 0))

  const zf = d / 2 + 0.0004        // a face da frente, com folga anti z-fighting
  // A MOLDURA SAO DUAS CHAPAS, e nao oito filetes.
  //
  // A primeira versao montava cada moldura com quatro barras (duas molduras =
  // oito malhas) e ainda punha uma espadinha em cada canto: quinze malhas numa
  // caixa de 6 cm, e a ilha da loja tem DOZE dessas. Trezentas draw calls a mais
  // num salao que ja tinha trezentas — o suficiente pra estourar o tempo de
  // captura do render por software. Duas chapas sobrepostas dao a mesma leitura
  // de moldura por duas malhas: a de fora e o filete, a de dentro devolve a cor
  // do papel no miolo.
  g.add(box(w - 0.008, h - 0.010, 0.0008, filete, 0, h / 2, zf))
  g.add(box(w - 0.016, h - 0.018, 0.0008, papelM, 0, h / 2, zf + 0.0004))
  // o naipe grande, no meio
  const e = espadas(filete, 0.034, 0.0008)
  e.position.set(0, h / 2, zf + 0.0008)
  g.add(e)
  if (lacre) g.add(box(w + 0.003, 0.004, d + 0.003, M.latao, 0, h * 0.62, 0))
  return g
}

/**
 * UMA CARTA SOLTA, virada pra cima — o "por dentro" do baralho.
 *
 * O dono mandou um As de espadas de referencia e pediu "sem as legendas, apenas
 * o naipe e as laterais". Entao a carta tem exatamente tres coisas: o naipe
 * grande no meio, dois naipinhos nos cantos opostos (as "laterais", que e o que
 * faz um retangulo branco ler como CARTA e nao como papel) e a borda.
 *
 * Nenhuma letra, nenhum nome de fabricante, nenhuma figura no meio do simbolo —
 * a arte dentro do naipe e justamente a parte autoral de um baralho comercial.
 */
function cartaEspadas() {
  const g = new THREE.Group()
  const w = 0.063, h = 0.088
  const branco = solid(0xf4f1e8, 0.72)
  const preto = solid(0x14151a, 0.6)

  const carta = box(w, 0.0008, h, branco, 0, 0, 0)
  carta.castShadow = false
  carta.receiveShadow = true
  g.add(carta)

  // deitada: a carta esta no plano XZ, entao o naipe (que nasce em XY) precisa
  // rodar -90 graus em X pra ficar de barriga pra cima
  const meio = espadas(preto, 0.040, 0.0004)
  meio.rotation.x = -Math.PI / 2
  meio.position.set(0, 0.0006, 0)
  g.add(meio)
  for (const s of [-1, 1]) {
    const p = espadas(preto, 0.011, 0.0003)
    p.rotation.x = -Math.PI / 2
    p.rotation.z = s < 0 ? Math.PI : 0   // o canto de baixo vem de cabeca pra baixo
    p.position.set(s * (w / 2 - 0.008), 0.0006, s * (h / 2 - 0.010))
    g.add(p)
  }
  return g
}

/**
 * MALETA DE FICHAS, tampa aberta.
 *
 * REFEITA PELA FOTO que o dono mandou, e o que mudou nao foi detalhe: foi a
 * ARRUMACAO. A versao anterior espalhava as fichas em tres colunas com jitter,
 * e o resultado lia como caixa DERRUBADA. Maleta de poker e o oposto disso — o
 * que faz ela ser reconhecida e a ordem:
 *
 *   - as fichas vem em CANUDOS verticais lado a lado, uma cor por canudo, cada
 *     um no seu berco escavado na espuma;
 *   - no meio fica o compartimento central, mais raso, com a placa de valor, os
 *     dados e o botao de dealer;
 *   - a espuma da tampa e ALVEOLADA (a grade de furos da foto), e nao lisa.
 *
 * Nada disso e caro: os canudos sao instancias do mesmo cilindro e a espuma
 * alveolada e um InstancedMesh de furos.
 */
function maletaDeFichas(nFichas, corpo, gasta) {
  const g = new THREE.Group()
  const w = 0.42, d = 0.29, h = 0.09
  const mat = gasta ? M.couro : M.aluminio
  g.add(roundedBox(w, h, d, 0.012, mat).translateY(h / 2))

  // quinas e fechos de metal: e o que diz "maleta" antes de qualquer ficha
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.028, h - 0.01, 0.028, M.cromo, sx * (w / 2 - 0.010), h / 2, sz * (d / 2 - 0.010)))
    }
  }
  for (const sx of [-1, 1]) g.add(box(0.036, 0.020, 0.012, M.cromo, sx * 0.10, h - 0.012, d / 2 + 0.004))
  // alca dobrada pra frente, na aresta de baixo
  const alca = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.005, 6, 14, Math.PI), M.cromo)
  alca.rotation.set(Math.PI / 2, 0, 0)
  alca.position.set(0, 0.012, d / 2 + 0.012)
  g.add(alca)

  // tampa aberta ~100 graus, com pivo na dobradica de tras
  const tampa = new THREE.Group()
  tampa.position.set(0, h, -d / 2)
  tampa.rotation.x = -1.75
  tampa.add(roundedBox(w, 0.05, d, 0.012, mat).translateY(0.025).translateZ(d / 2))
  tampa.add(box(w - 0.05, 0.008, d - 0.05, M.espuma, 0, 0.052, d / 2))
  // ESPUMA ALVEOLADA: a grade de furos da foto. Sem ela a tampa e uma chapa
  // preta e a maleta perde a metade de cima inteira.
  const furoGeo = new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 6)
  const furos = new THREE.InstancedMesh(furoGeo, solid(0x0b0d10, 1.0), 9 * 6)
  const dm = new THREE.Object3D()
  let f = 0
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 6; j++) {
      dm.position.set((i - 4) * 0.042, 0.054, d / 2 + (j - 2.5) * 0.042)
      dm.updateMatrix()
      furos.setMatrixAt(f++, dm.matrix)
    }
  }
  furos.instanceMatrix.needsUpdate = true
  furos.castShadow = false
  tampa.add(furos)
  g.add(tampa)

  // forro da base
  g.add(box(w - 0.03, 0.012, d - 0.03, M.espuma, 0, h - 0.004, 0))

  // --- os canudos de ficha --------------------------------------------------
  // Seis bercos, tres de cada lado do compartimento central. `nFichas` decide a
  // ALTURA das pilhas, e nao o espalhamento: e assim que uma maleta de 300 se
  // parece com uma de 200 na prateleira.
  const R_FICHA = 0.0195
  const E_FICHA = 0.0032
  const CORES = [0xdfe2e6, 0x2a5fbf, 0xc0392b, 0xdfe2e6, 0x1c1c1c, 0x1e8449]
  const XS = [-0.175, -0.132, -0.089, 0.089, 0.132, 0.175]
  const porCanudo = Math.max(4, Math.min(26, Math.round(nFichas / XS.length)))

  const inst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(R_FICHA, R_FICHA, E_FICHA, 14),
    solid(0xffffff, 0.62),
    XS.length * porCanudo,
  )
  const dummy = new THREE.Object3D()
  const cor = new THREE.Color()
  let k = 0
  for (let c = 0; c < XS.length; c++) {
    for (let i = 0; i < porCanudo; i++) {
      // 0.4 grau de giro por ficha: uma pilha perfeitamente alinhada le como um
      // cilindro macico, e o que faz ela ler como PILHA e a serrilha do canto
      dummy.position.set(XS[c], h + 0.010 + i * E_FICHA, 0)
      dummy.rotation.set(0, i * 0.09, 0)
      dummy.updateMatrix()
      inst.setMatrixAt(k, dummy.matrix)
      inst.setColorAt(k, cor.setHex(CORES[c]))
      k++
    }
  }
  inst.instanceMatrix.needsUpdate = true
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  inst.castShadow = false
  g.add(inst)
  // o berco escavado: UMA canaleta por lado, e nao uma por canudo. Os tres
  // canudos de cada lado sao vizinhos, entao a canaleta unica cobre os tres e
  // custa um terco das malhas.
  for (const s of [-1, 1]) {
    g.add(box(0.115, 0.010, R_FICHA * 2.2 + 0.10, M.escuro, s * 0.132, h + 0.004, 0))
  }

  // --- o compartimento central ---------------------------------------------
  g.add(box(0.150, 0.010, d - 0.06, M.escuro, 0, h + 0.004, 0))
  // a placa de valor: chapa escura com a moldura de latao (sem numero — o
  // numero da foto e serigrafia, e serigrafia e onde mora a marca)
  g.add(box(0.072, 0.014, 0.046, solid(0x101318, 0.55), 0, h + 0.014, -0.052))
  g.add(box(0.078, 0.004, 0.052, M.latao, 0, h + 0.022, -0.052))
  // tres dados numa fileira (cinco era o da foto; tres leem igual e custam duas
  // malhas a menos numa peca que a loja exibe em dobro)
  for (let i = 0; i < 3; i++) {
    const dado = roundedBox(0.014, 0.014, 0.014, 0.003, solid(0xb03a3a, 0.5))
    dado.position.set((i - 1) * 0.020, h + 0.017, 0.002)
    g.add(dado)
  }
  // o botao de dealer, deitado
  const bt = cyl(0.026, 0.026, 0.006, solid(0xf0ece0, 0.6), 16)
  bt.position.set(0, h + 0.013, 0.052)
  g.add(bt)
  // e dois baralhos deitados no fundo do compartimento. Sao BLOCOS LISOS de
  // proposito, e nao baralho() de verdade: aqui eles tem 5 cm, ficam deitados
  // dentro de uma maleta e o naipe em relevo nao apareceria de jeito nenhum —
  // seria pagar dez malhas por peca pra desenhar o que ninguem ve.
  for (const s of [-1, 1]) {
    const c = box(0.055, 0.016, 0.078, solid(s < 0 ? 0x8c2f2a : 0x24406e, 0.7),
      s * 0.040, h + 0.016, 0.048)
    c.rotation.y = s < 0 ? -0.06 : 0.06
    g.add(c)
  }

  void corpo
  return g
}

/**
 * JUKEBOX. O arco de tubos e o que faz a peca: quatro quartos de toro
 * emissivos, dois ambar e dois magenta. Os materiais sao CLONES porque eles
 * pulsam no update — mexer no material do cache acenderia tudo que usa a mesma
 * chave, do neon do cassino ao letreiro da rua.
 */
function jukebox() {
  const g = new THREE.Group()
  const w = 0.86, h = 1.52, d = 0.62
  g.add(roundedBox(w, h * 0.62, d, 0.05, M.nogueira).translateY(h * 0.31))
  // cupula: um corpo mais estreito e arredondado por cima
  const cup = roundedBox(w * 0.94, h * 0.40, d * 0.9, 0.16, M.nogueira)
  cup.position.y = h * 0.62 + h * 0.20 - 0.02
  g.add(cup)

  // vitrine do carrossel
  const vidro = box(w * 0.66, h * 0.30, 0.02, glass(0xcfe6f2, 0.22), 0, h * 0.70, d / 2 - 0.02)
  vidro.castShadow = false
  g.add(vidro)
  // discos: um InstancedMesh de doze
  const geoD = new THREE.CylinderGeometry(0.088, 0.088, 0.004, 16)
  const discos = new THREE.InstancedMesh(geoD, solid(0x141416, 0.5), 12)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 12; i++) {
    dummy.position.set(-w * 0.26 + (i % 6) * (w * 0.104), h * 0.70 + (i < 6 ? 0.055 : -0.055), d / 2 - 0.10)
    dummy.rotation.set(Math.PI / 2, 0, 0)
    dummy.updateMatrix()
    discos.setMatrixAt(i, dummy.matrix)
  }
  discos.instanceMatrix.needsUpdate = true
  discos.castShadow = false
  g.add(discos)

  // os tubos de bolha
  const tubos = []
  for (let i = 0; i < 4; i++) {
    const lado = i < 2 ? -1 : 1
    const cima = i % 2 === 0
    const m = M.neon(cima ? 0xffb347 : 0xd93bb0).clone()
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.022, 8, 18, Math.PI * 0.52), m)
    t.position.set(lado * w * 0.42, h * (cima ? 0.78 : 0.44), d * 0.32)
    t.rotation.z = lado > 0 ? -0.26 : Math.PI + 0.26
    t.castShadow = false
    g.add(t)
    tubos.push(t)
  }
  // dois queimados, de proposito: a ficha diz "dois tubos queimados"
  tubos[1].material.emissiveIntensity = 0.05
  tubos[1].material.color.setHex(0x3a3038)
  tubos[2].material.emissiveIntensity = 0.05
  tubos[2].material.color.setHex(0x3a3038)

  // grade cromada e botoes
  for (let i = 0; i < 6; i++) {
    g.add(box(w * 0.5, 0.018, 0.02, M.cromo, 0, h * 0.30 + i * 0.036, d / 2 - 0.01))
  }
  const geoB = new THREE.BoxGeometry(0.024, 0.012, 0.012)
  const bot = new THREE.InstancedMesh(geoB, solid(0xe8e2d2, 0.6), 20)
  for (let i = 0; i < 20; i++) {
    dummy.position.set(-w * 0.28 + (i % 10) * (w * 0.062), h * 0.50 + (i < 10 ? 0.03 : -0.03), d / 2 - 0.004)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    bot.setMatrixAt(i, dummy.matrix)
  }
  bot.instanceMatrix.needsUpdate = true
  bot.castShadow = false
  g.add(bot)

  const placa = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 0.10), textPlaneMat('SELECT', {
    w: 220, h: 44, color: '#e9c46a', font: 'bold 26px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.55)', emissiveIntensity: 0.5,
  }))
  placa.position.set(0, h * 0.56, d / 2 + 0.001)
  placa.castShadow = false
  g.add(placa)

  // o update das bolhas mora no proprio movel: quem monta so chama animar(t)
  g.userData.animar = (t) => {
    for (let i = 0; i < tubos.length; i++) {
      const m = tubos[i].material
      if (m.emissiveIntensity < 0.2) continue        // os queimados ficam apagados
      m.emissiveIntensity = 1.15 + Math.sin(t * 2.1 + i * 1.7) * 0.45
    }
  }
  g.userData.dynamic = true
  return g
}

/**
 * A FICHA DE SINUCA e de METAL BRUTO, e nao de latao.
 *
 * Pela foto que o dono mandou: sao pecas fundidas de zamac, cinza fosco, com
 * duas ranhuras paralelas atravessando a face — o disco que cai na fenda da
 * mesa de bar. O latao brilhante da versao anterior lia como moeda de cassino,
 * que e outra peca inteiramente.
 *
 * O tom e fosco de proposito (roughness 0.55 e nao 0.2): metal fundido nao
 * polido nao devolve reflexo, e e a AUSENCIA de brilho que separa a ficha de
 * sinuca da ficha de poker no mesmo balcao.
 */
const MET_FICHA = { r: 0.0135, e: 0.0038 }
function metalFicha() { return solid(0x9ea4a8, 0.55, 0.55) }

/**
 * As ranhuras. Elas nao podem ser furo de verdade (nao ha booleana aqui), entao
 * sao duas barras ESCURAS deitadas 0.2 mm abaixo da face: na pratica a sombra
 * que uma ranhura faria, que a 1 m de distancia e tudo que se ve dela.
 */
function ranhuras(g, y, sgn) {
  for (const dz of [-0.0042, 0.0042]) {
    g.add(box(MET_FICHA.r * 1.7, 0.0006, 0.0022, solid(0x4a4f52, 0.9), 0, y + sgn * 0.0001, dz))
  }
}

/** POTE DE FICHAS DE SINUCA: um vidro cheio delas, pro balcao da loja. */
function poteDeFichas() {
  const g = new THREE.Group()
  const vidro = cyl(0.10, 0.10, 0.22, glass(0xd8ecf2, 0.18), 14, true)
  vidro.position.y = 0.11
  vidro.castShadow = false
  g.add(vidro)
  g.add(cyl(0.105, 0.105, 0.012, M.cromo, 14).translateY(0.006))
  // Dentro do pote elas sao instancias lisas: a ranhura tem 2 mm e some atras
  // do vidro. Gastar geometria nela aqui seria pagar por um detalhe invisivel.
  const geo = new THREE.CylinderGeometry(MET_FICHA.r, MET_FICHA.r, MET_FICHA.e, 12)
  const inst = new THREE.InstancedMesh(geo, metalFicha(), 120)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 120; i++) {
    const a = i * 2.399
    const r = 0.02 + (i % 5) * 0.016
    dummy.position.set(Math.cos(a) * r, 0.016 + Math.floor(i / 14) * 0.0125, Math.sin(a) * r)
    dummy.rotation.set(0, a, (i % 3) * 0.04)
    dummy.updateMatrix()
    inst.setMatrixAt(i, dummy.matrix)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = false
  g.add(inst)
  return g
}

/**
 * UMA pilha de fichas solta, pro card do inventario e pro fantasma do encaixe.
 *
 * Aqui a ranhura EXISTE, ao contrario do pote: este e o unico lugar em que a
 * ficha aparece grande na tela (o card do inventario fotografa a peca de perto),
 * e sem ela o card mostra cinco moedas cinzas sem identidade nenhuma.
 */
function fichaSinuca() {
  const g = new THREE.Group()
  const geo = new THREE.CylinderGeometry(MET_FICHA.r, MET_FICHA.r, MET_FICHA.e, 16)
  const mat = metalFicha()
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Group()
    f.add(new THREE.Mesh(geo, mat))
    ranhuras(f, MET_FICHA.e / 2, 1)
    f.position.set((i % 2) * 0.004, i * 0.0042, (i % 3) * 0.003)
    f.rotation.y = i * 0.5
    g.add(f)
  }
  return g
}

// ---------------------------------------------------------------------------
// O CATALOGO
//
//   preco       em OURO (a moeda de rua; ficha so vale dentro do cassino)
//   qualidade   'comum' | 'boa' | 'fina' — e a tarja de cor do card
//   cat         a aba da loja
//   empilha     quantas unidades cabem numa vaga do inventario
//   pegada      { larg, prof } em metros: o chao que a peca toma DEPOIS de
//               colocada, contando o espaco de uso. Mesa de sinuca soma 1,45 m
//               de taco de cada lado, porque taco preso na parede e mesa que
//               nao se joga.
//   naCasa      false = nao e movel (baralho e ficha vao pro bolso, nao pro chao)
// ---------------------------------------------------------------------------
// As MAQUINAS moram em arquivo proprio (mobilia/caca-niquel.js e
// mobilia/video-poker.js) e entram aqui no fim da lista. O criterio e o mesmo
// que separou bebidas de moveis: cada familia com a sua propria linguagem de
// modelagem no seu proprio arquivo, e UMA lista so pro que a loja vende e o
// jogo conhece.
export const MOBILIA = [
  {
    id: 'baralho-beira', nome: 'Baralho Beira de Mesa', cat: 'baralhos',
    qualidade: 'comum', preco: 40, empilha: 8, naCasa: false,
    desc: 'Papelao plastificado, cantos redondos de tanto uso.',
    build: () => baralho(0x9c3b32, 'BEIRA', false),
  },
  {
    id: 'baralho-naipe', nome: 'Baralho Naipe Duplo', cat: 'baralhos',
    qualidade: 'boa', preco: 120, empilha: 8, naCasa: false,
    desc: 'Semi-profissional, indice grande, verniz gasto.',
    build: () => baralho(0x1f4f7a, 'NAIPE', false),
  },
  {
    id: 'baralho-estrela', nome: 'Baralho Estrela 100% Plastico', cat: 'baralhos',
    qualidade: 'fina', preco: 320, empilha: 8, naCasa: false,
    desc: 'Marca do cassino, caixa dourada, ainda lacrado.',
    build: () => baralho(0x8a6a1f, 'ESTRELA', true),
  },
  {
    id: 'maleta-200', nome: 'Maleta 200 fichas', cat: 'fichas',
    qualidade: 'comum', preco: 260, empilha: 3, naCasa: true,
    // 62 x 49: a maleta tem 42 x 29 e fica aberta; a tampa levantada some
    // 20 cm de fundura e ninguem passa raspando numa maleta aberta.
    pegada: { larg: 0.62, prof: 0.49 },
    desc: 'Plastico ABS, tampa riscada, espuma amassada.',
    build: () => maletaDeFichas(96, 0x9aa1a8, false),
  },
  {
    id: 'maleta-300', nome: 'Maleta 300 fichas de argila', cat: 'fichas',
    qualidade: 'boa', preco: 620, empilha: 3, naCasa: true,
    pegada: { larg: 0.62, prof: 0.49 },
    desc: 'Couro puido, fecho de latao torto, uma ficha faltando.',
    build: () => maletaDeFichas(132, 0x5a3a2a, true),
  },
  {
    id: 'ficha-sinuca', nome: 'Ficha de sinuca', cat: 'fichas',
    qualidade: 'comum', preco: 12, empilha: 99, naCasa: false, granel: true,
    desc: 'Latao gasto. E ela que solta as bolas da mesa de bar.',
    build: () => fichaSinuca(),
  },
  {
    id: 'jukebox', nome: 'Jukebox Valvulada 1962', cat: 'musica',
    qualidade: 'boa', preco: 1400, empilha: 1, naCasa: true,
    // 1,26 x 1,02: o gabinete tem 0,86 x 0,62 e ela encosta na parede, mas
    // precisa de 40 cm na frente pra alguem parar e escolher a musica.
    pegada: { larg: 1.26, prof: 1.02 },
    desc: 'Tubos de bolha, dois queimados, verniz craquelado.',
    build: () => jukebox(),
  },
  {
    id: 'sinuca-bar', nome: 'Mesa de Bar 7 pes', cat: 'sinuca',
    qualidade: 'comum', preco: 950, empilha: 1, naCasa: true,
    // 2,24 x 1,24 de gabinete + 1,45 de taco de cada lado no eixo curto.
    // No eixo longo sobra a propria mesa, entao la o taco entra por cima dela.
    pegada: { larg: 3.10, prof: 4.14 },
    desc: 'Usada: feltro puido na quebra, borracha ressecada, calco num pe.',
    build: () => mesaDeSinuca(2.24, 1.24, '#2c7a52', true),
  },
  {
    id: 'sinuca-recond', nome: 'Mesa Recondicionada 8 pes', cat: 'sinuca',
    qualidade: 'fina', preco: 1750, empilha: 1, naCasa: true,
    pegada: { larg: 3.50, prof: 4.35 },
    desc: 'Feltro azul novo, tabelas restauradas, ainda de segunda mao.',
    build: () => mesaDeSinuca(2.60, 1.45, '#1e5aa8', false),
  },
].concat(CACA_NIQUEIS, VIDEO_POKER)

// ---------------------------------------------------------------------------
// O REGISTRO DE IDS — UM SO PRO JOGO INTEIRO
//
// MOBILIA e a PRATELEIRA DA LOJA DE JOGOS: e ela que vira card na vitrine do
// Taco de Ouro. O registro abaixo e outra coisa — e a resposta pra "quem e o
// item de id X?", e essa pergunta e feita por quem nao sabe onde a coisa foi
// comprada: o inventario (quantos cabem numa vaga), a mochila do HUD (a foto e
// o nome), o encaixe (a pegada no chao), o save (o que reconstruir).
//
// Por isso as BEBIDAS entram aqui e NAO em MOBILIA: elas sao vendidas no
// mercado, com prateleira propria (BEBIDAS em mobilia/bebidas.js), e aparecer
// na vitrine da loja de jogos seria simplesmente errado. Mas a lata comprada no
// mercado vai pra MESMA mochila, entao itemDe('cerveja-lata') tem que
// responder. Dois catalogos, um registro.
//
// E o mesmo vale pra ERVAS (mobilia/erva.js): vendida no mercado, guardada na
// mochila, levantada na mao. Quem NAO entra aqui e a juncao do mercado
// (mobilia/mercado.js) — aquele arquivo diz o que a LOJA vende; este diz o que
// o JOGO conhece, e as duas listas nao sao a mesma coisa (o revolver esta aqui
// e nao esta a venda em lugar nenhum).
// ---------------------------------------------------------------------------
const POR_ID = new Map()
for (const m of MOBILIA) POR_ID.set(m.id, m)
for (const b of BEBIDAS) POR_ID.set(b.id, b)
for (const e of ERVAS) POR_ID.set(e.id, e)

export function itemDe(id) { return POR_ID.get(id) || null }

/**
 * Registra um item que NAO nasce em nenhum dos dois catalogos.
 *
 * Existe por causa do revolver, e o revolver e o caso limite que prova a regra
 * do registro: ele nao esta a venda em lugar nenhum (acha-se no beco), mas
 * ocupa uma vaga da mochila como qualquer outra coisa — e a vaga precisa saber
 * o nome dele, a foto dele e quantos empilham.
 *
 * Quem chama e o MAIN, passando a ficha que o proprio modulo do item exporta
 * (armas/revolver.js). O caminho contrario — este arquivo importar o modelo da
 * arma — poria uma dependencia de `mobilia` em `armas` por causa de uma
 * miniatura, e mobilia nao tem nada com arma.
 *
 * Registrar duas vezes o mesmo id e no-op: main.js roda uma vez, mas o teste de
 * fumaca reinicia o mundo.
 */
export function registrarItem(ficha) {
  if (!ficha || typeof ficha.id !== 'string') return null
  const antes = POR_ID.get(ficha.id)
  if (antes) return antes
  POR_ID.set(ficha.id, ficha)
  return ficha
}

/** Quantas unidades cabem numa vaga. E o que o inventario pergunta. */
export function limiteDe(id) {
  const m = POR_ID.get(id)
  return m ? Math.max(1, m.empilha | 0) : 1
}

/** As abas da loja, na ordem em que aparecem. */
export const CATEGORIAS = [
  { id: 'tudo', label: 'TUDO' },
  { id: 'baralhos', label: 'BARALHOS' },
  { id: 'sinuca', label: 'SINUCA' },
  { id: 'musica', label: 'MUSICA' },
  { id: 'fichas', label: 'FICHAS' },
  { id: 'caca-niquel', label: 'MAQUINAS' },
]

export { poteDeFichas, mesaDeSinuca, jukebox, baralho, cartaEspadas, espadas, maletaDeFichas, ALT_MESA }
