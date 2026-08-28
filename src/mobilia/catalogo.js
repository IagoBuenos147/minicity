import * as THREE from 'three'
import {
  solid, stdMat, glass, box, cyl, sphere, roundedBox, woodTex, tex, textPlaneMat,
} from '../world/materials.js'

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

/** BARALHO: a caixa com a medida real de um baralho de poker. */
function baralho(corCaixa, marca, lacre) {
  const g = new THREE.Group()
  const w = 0.064, h = 0.089, d = 0.019
  g.add(box(w, h, d, solid(corCaixa, 0.7), 0, h / 2, 0))
  // faixa da tampa
  g.add(box(w + 0.002, 0.016, d + 0.002, solid(corCaixa, 0.55, 0.15), 0, h - 0.012, 0))
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.82, h * 0.5), textPlaneMat(marca, {
    w: 128, h: 96, color: '#f3e6c2', font: 'bold 34px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.06,
  }))
  face.position.set(0, h * 0.52, d / 2 + 0.001)
  face.castShadow = false
  g.add(face)
  if (lacre) {
    const l = box(w + 0.003, 0.004, d + 0.003, M.latao, 0, h * 0.62, 0)
    g.add(l)
  }
  return g
}

/** MALETA DE FICHAS, tampa aberta, com as fichas dentro num InstancedMesh. */
function maletaDeFichas(nFichas, corpo, gasta) {
  const g = new THREE.Group()
  const w = 0.42, d = 0.29, h = 0.09
  const mat = gasta ? M.couro : M.aluminio
  g.add(roundedBox(w, h, d, 0.012, mat).translateY(h / 2))
  // tampa aberta ~100 graus, com pivo na dobradica de tras
  const tampa = new THREE.Group()
  tampa.position.set(0, h, -d / 2)
  tampa.rotation.x = -1.75
  tampa.add(roundedBox(w, 0.05, d, 0.012, mat).translateY(0.025).translateZ(d / 2))
  tampa.add(box(w - 0.05, 0.008, d - 0.05, M.espuma, 0, 0.052, d / 2))
  g.add(tampa)
  // forro e bercos
  g.add(box(w - 0.03, 0.012, d - 0.03, M.espuma, 0, h - 0.004, 0))
  for (const s of [-1, 0, 1]) {
    g.add(box(0.06, 0.014, d - 0.06, M.escuro, s * 0.115, h + 0.004, 0))
  }
  // as fichas: geometria do cassino, cor por instancia
  const geo = new THREE.CylinderGeometry(0.0195, 0.0195, 0.0032, 14)
  const inst = new THREE.InstancedMesh(geo, solid(0xffffff, 0.62), Math.max(1, nFichas))
  const dummy = new THREE.Object3D()
  const cor = new THREE.Color()
  const CORES = [0xf2f2f2, 0xc0392b, 0x2a5fbf, 0x1e8449, 0x1c1c1c]
  for (let i = 0; i < nFichas; i++) {
    const col = i % 3
    const alt = Math.floor(i / 3) % 22
    dummy.position.set((col - 1) * 0.115, h + 0.012 + alt * 0.0034, ((i % 7) - 3) * 0.028)
    dummy.updateMatrix()
    inst.setMatrixAt(i, dummy.matrix)
    inst.setColorAt(i, cor.setHex(CORES[(col + alt) % CORES.length]))
  }
  inst.instanceMatrix.needsUpdate = true
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  inst.castShadow = false
  g.add(inst)
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

/** POTE DE FICHAS DE SINUCA: latao gasto num vidro, pro balcao da loja. */
function poteDeFichas() {
  const g = new THREE.Group()
  const vidro = cyl(0.10, 0.10, 0.22, glass(0xd8ecf2, 0.18), 14, true)
  vidro.position.y = 0.11
  vidro.castShadow = false
  g.add(vidro)
  g.add(cyl(0.105, 0.105, 0.012, M.cromo, 14).translateY(0.006))
  const geo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.002, 12)
  const inst = new THREE.InstancedMesh(geo, M.latao, 120)
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

/** UMA ficha de sinuca solta, pro card do inventario e pro fantasma. */
function fichaSinuca() {
  const g = new THREE.Group()
  const geo = new THREE.CylinderGeometry(0.0125, 0.0125, 0.002, 14)
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(geo, M.latao)
    f.position.set((i % 2) * 0.004, i * 0.0022, (i % 3) * 0.003)
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
]

const POR_ID = new Map()
for (const m of MOBILIA) POR_ID.set(m.id, m)

export function itemDe(id) { return POR_ID.get(id) || null }

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
]

export { poteDeFichas, mesaDeSinuca, jukebox, baralho, maletaDeFichas, ALT_MESA }
