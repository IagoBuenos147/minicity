import * as THREE from 'three'
import { solid, emissive, stdMat, tex } from '../../world/materials.js'
import { soldarNormais } from '../rosto/nucleo.js'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/relogios.js — ancora: armLLower (o antebraco ESQUERDO).
//
// Espaco da peca: origem no COTOVELO, o braco desce em -Y, o pulso fica em
// y = -medida.FORE_ARM e o DORSO do pulso (o lado que a camera ve, porque o
// braco cai colado no tronco) olha pra -X. Tudo aqui e desenhado em volta do
// eixo Y e empurrado pra -X.
//
// Os tres relogios sao TRES CONSTRUCOES DIFERENTES de proposito — o dono quer
// comparar na tela qual assenta no jogo, e tres vezes a mesma funcao com outra
// cor nao responde nada:
//
//   1. aco-elos ....... a pulseira e uma FILEIRA DE PECAS SOLTAS. Cada elo e um
//      prisma hexagonal achatado, posto no seu angulo da volta e girado no
//      proprio eixo tangente. E a articulacao que mata o "tubo com cor": o
//      brilho quebra elo a elo. A caixa e uma lathe com bisel e recesso, e o
//      mostrador (ponteiro, marcador, numero, data) e TEXTURA — a 40 cm de
//      camera no provador nenhum ponteiro de geometria a esse tamanho sai
//      legivel por menos de 300 triangulos.
//
//   2. couro-costurado ... a pulseira e UMA CASCA REVOLVIDA DE SECAO FECHADA
//      (couro com espessura de verdade: face de fora, de dentro e as duas
//      bordas), com nervura de costura correndo nas duas bordas, tira de ponta
//      por cima, furos e fivela com lingueta. O mostrador aqui e GEOMETRIA
//      (ponteiro de verdade) debaixo de uma calota de vidro abaulada com
//      roughness 0.09 — o reflexo do vidro e o que faz o objeto ler como
//      relogio e nao como moeda colada no braco.
//
//   3. bracelete-tela ... nao existe caixa nem pulseira: e UMA SUPERFICIE SO,
//      uma grade parametrica (volta x secao) montada a mao em que o raio, a
//      espessura e a largura INCHAM na regiao do dorso. A tela e um retalho da
//      MESMA superficie, 0,6 mm acima, com material emissive(): e o unico item
//      do catalogo que emite luz propria e por isso o unico que se identifica a
//      noite, de longe, sem ver a forma.
//
// COMO ELE ESCAPA DA MANGA: nao escapa, a manga e que morre antes. Toda manga
// comprida termina em MANGA_FIM_Y (4,5 cm acima do pulso) com raio
// MANGA_R_PUNHO; o relogio mora 2,8 cm acima do pulso e nenhuma peca daqui
// passa de y = -FORE_ARM + 0.0175, entao sobra 1 mm de folga do punho. Os raios
// tambem passam de MANGA_R_PUNHO + SOBRA_ACESSORIO na parte que incha, entao
// mesmo quando a manga balanca por cima o relogio continua por fora.
// ---------------------------------------------------------------------------

// 2,8 cm acima do pulso. E a MESMA altura que pulseira() e mostrador() do
// nucleo usam e ela nao e exportada de la; os tres itens misturam helper do
// nucleo com geometria propria, e uma altura escrita sozinha desalinharia a
// caixa da pulseira. Se mudar no nucleo, muda aqui.
const SUBIDA_PULSO = 0.028
const yPulso = (c) => -c.medida.FORE_ARM + SUBIDA_PULSO

// Raio da capsula do antebraco (character.js, foreArmGeo). Toda banda daqui tem
// a face de DENTRO enterrada nele: e o mesmo truque que calibrou pulseira() no
// nucleo, e e o que faz a peca ler colada no pulso em vez de pendurada. Banda
// que comeca em 0.041 exato brigava com a pele e piscava a cada passo.
const R_BRACO = 0.041

// Teto de raio da CAIXA no plano (y, z). O punho da manga comprida morre em
// y = -FORE_ARM + MANGA_FIM_Y com raio ~0.047: com 0.017 a quina de cima do
// bisel encosta nele e a caixa aparece serrilhada por dentro do pano. 0.016
// deixa 1 mm de ar e ninguem ve a diferenca de meio milimetro no bisel.
const R_CAIXA_MAX = 0.016

/**
 * Poe o objeto num ponto da volta do pulso com o +Z LOCAL apontando pra FORA
 * (radial) e o +Y local seguindo o eixo do braco. Elo, furo, fivela e passante
 * nascem todos deitados no plano local XY e so passam por aqui.
 */
function naVolta(o, fi, r, y) {
  o.position.set(r * Math.sin(fi), y, r * Math.cos(fi))
  o.rotation.y = fi
  return o
}

/**
 * Plano do MOSTRADOR: um grupo cujo +Z local aponta pra fora do pulso (o -X do
 * braco) e cujo +Y local sobe pro cotovelo. Tudo que se desenha "de frente pro
 * relogio" — o disco, os ponteiros, a coroa — nasce aqui e nao repete rotacao.
 * O +X local cai na FRENTE do boneco (+Z do mundo), que e o unico lado do
 * relogio que a camera de terceira pessoa enxerga: e por isso que a coroa e a
 * janela da data ficam nele e nao no lado de tras.
 */
function planoDorso(c, x) {
  const g = new THREE.Group()
  g.rotation.y = -Math.PI / 2
  g.position.set(-x, yPulso(c), 0)
  return g
}

/**
 * Material do mostrador desenhado. tex() vive de canvas 2D e os testes de
 * catalogo importam character.js no node, sem DOM: sem a guarda o catalogo
 * inteiro estoura fora do navegador. Sem textura o relogio perde os ponteiros,
 * nao a peca.
 */
function faceMat(id, desenho) {
  if (typeof document === 'undefined') return solid(0xe6e0d0, 0.45, 0.0)
  const map = tex('relogio:' + id, 256, desenho, 1)
  return stdMat('relogio-face:' + id, { map, roughness: 0.42, metalness: 0.05 })
}

/** Mostrador analogico completo: 60 tracos, 4 numeros, data e ponteiros. */
function desenhoAnalogico(g, s) {
  const R = s / 2
  g.translate(R, R)
  g.fillStyle = '#171a20'
  g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill()
  // anel de minutos um tom acima do fundo: sem ele os tracos finos flutuam
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = R * 0.03
  g.beginPath(); g.arc(0, 0, R * 0.84, 0, 7); g.stroke()
  for (let i = 0; i < 60; i++) {
    const a = (i * Math.PI) / 30
    const hora = i % 5 === 0
    g.strokeStyle = hora ? '#f2efe6' : '#7e838d'
    g.lineWidth = hora ? R * 0.055 : R * 0.018
    const r0 = R * 0.88, r1 = R * (hora ? 0.74 : 0.81)
    g.beginPath()
    g.moveTo(Math.sin(a) * r0, -Math.cos(a) * r0)
    g.lineTo(Math.sin(a) * r1, -Math.cos(a) * r1)
    g.stroke()
  }
  g.fillStyle = '#f2efe6'
  g.font = 'bold ' + Math.round(R * 0.30) + 'px "Trebuchet MS", sans-serif'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  // so 12/3/6/9: com os doze numeros nesse tamanho o mostrador vira mingau de
  // pixel na hora que a textura desce de mip
  for (const [n, a] of [['12', 0], ['3', Math.PI / 2], ['6', Math.PI], ['9', -Math.PI / 2]]) {
    g.fillText(n, Math.sin(a) * R * 0.60, -Math.cos(a) * R * 0.60)
  }
  // janela da data no 3 — o detalhe que so existe pra recompensar quem chega
  // perto no provador
  g.fillStyle = '#e8e4d8'
  g.fillRect(R * 0.40, -R * 0.12, R * 0.26, R * 0.24)
  g.fillStyle = '#20242b'
  g.font = 'bold ' + Math.round(R * 0.19) + 'px "Trebuchet MS", sans-serif'
  g.fillText('28', R * 0.53, R * 0.01)
  const ponteiro = (ang, comp, larg, cor) => {
    g.save(); g.rotate(ang); g.fillStyle = cor
    g.beginPath()
    g.moveTo(-larg, larg * 1.8)
    g.lineTo(-larg * 0.5, -R * comp)
    g.lineTo(larg * 0.5, -R * comp)
    g.lineTo(larg, larg * 1.8)
    g.closePath(); g.fill()
    g.restore()
  }
  // 10:10:08, a pose de vitrine: os dois ponteiros abrem pra cima e nenhum
  // esconde o outro nem tapa a marca
  ponteiro(-Math.PI / 3, 0.46, R * 0.045, '#f2efe6')
  ponteiro(Math.PI / 3, 0.70, R * 0.032, '#f2efe6')
  ponteiro(0.84, 0.78, R * 0.014, '#d8523a')
  g.fillStyle = '#d8523a'
  g.beginPath(); g.arc(0, 0, R * 0.045, 0, 7); g.fill()
}

// ===========================================================================
// 1. metodo ELOS — a pulseira como fileira de pecas soltas
// ===========================================================================

/** Prisma hexagonal achatado: a secao do elo ja sai esticada na geometria. */
function geoElo(meiaSecao, meiaEsp, larg) {
  const g = new THREE.CylinderGeometry(1, 1, larg, 6, 1)
  // esticar na GEOMETRIA e nao no mesh.scale: escala nao uniforme no Object3D
  // deforma a normal e o elo acende do lado errado do sol
  g.scale(meiaSecao, 1, meiaEsp)
  return g
}

function pulseiraElos(c, mat, o) {
  const g = new THREE.Group()
  const y = yPulso(c)
  const arcoTotal = Math.PI * 2 - o.vao
  // ESPINHA. Cilindro fino por baixo da fileira, 0,5 mm acima da pele. Sem ele
  // a primeira foto de perto mostrou o defeito: com o tombo alternado os elos
  // abrem um V nas duas bordas e por ele se via a SOMBRA do braco, entao a
  // fileira lia como uma corrente de pinos espetados no pulso em vez de uma
  // pulseira. Custa 40 triangulos e fecha todos os vaos de uma vez.
  const esp = N.malha(new THREE.CylinderGeometry(R_BRACO + 0.001, R_BRACO + 0.001,
    o.larg * 0.86, 20, 1, true, o.fiCaixa + o.vao / 2, arcoTotal), mat)
  esp.position.y = y
  g.add(esp)
  // O elo tem que ENCOSTAR no vizinho: a secao hexagonal so chega a 0.866 do
  // raio no eixo tangente (os vertices ficam a 0 e 60 graus, nao a 90), entao a
  // meia-passada sai do passo real dividido por 1.732 e ainda 6% por cima, pros
  // dois se tocarem mesmo tombados.
  const passo = (arcoTotal / o.n) * o.r
  const geo = geoElo((passo * 1.06) / 1.732, o.meiaEsp, o.larg)
  // geometria UNICA pra fileira inteira: ela nasce dentro do build e morre com
  // ele, e
  // dispose() repetido no mesmo BufferGeometry e no-op. O que o CONTRATO
  // proibe e geometria de MODULO, compartilhada entre bonecos.
  for (let i = 0; i < o.n; i++) {
    const t = (i + 0.5) / o.n
    const fi = o.fiCaixa + o.vao / 2 + t * arcoTotal
    // jitter de 0,15 mm no raio + tombo alternado: sem isso os elos formam
    // um cilindro perfeito e o brilho corre liso, que e exatamente a leitura de
    // "tubo cinza" que o dono reclamou
    const m = N.malha(geo, mat)
    naVolta(m, fi, o.r + (i % 2 ? 0.00015 : -0.00015), y)
    // ordem YXZ: no XYZ padrao o rotation.x seria aplicado por ULTIMO, ou seja
    // em volta do X do MUNDO, e o tombo do elo mudava de sentido conforme a
    // volta. Em YXZ o X e o eixo tangente do proprio elo, que e a dobradica de
    // verdade da pulseira.
    m.rotation.order = 'YXZ'
    m.rotation.x = (i % 2 ? 1 : -1) * 0.040
    // Afunila da CAIXA (t = 0 e t = 1, as duas pontas do arco) pro FECHO
    // (t = 0.5, o lado de baixo do pulso): 19 mm de elo encostando na caixa e
    // 15 mm no fecho, como bracelete de aco de verdade. E so o Y que escala, e
    // o prisma tem as normais das laterais em XZ e as das tampas em Y puro,
    // entao esta escala nao mente na iluminacao.
    m.scale.y = 0.80 + 0.20 * Math.abs(t - 0.5) * 2
    g.add(m)
  }
  return g
}

// ===========================================================================
// 2. metodo COURO — casca revolvida de secao FECHADA
// ===========================================================================

/**
 * Tira com espessura: o perfil e um retangulo FECHADO (face de dentro, borda de
 * baixo, face de fora, borda de cima), entao a volta sai com as quatro faces e
 * o couro tem canto. Uma tira feita de casca aberta lia como adesivo de 0 mm
 * colado no braco — o mesmo defeito que bordaAberta() conserta na jaqueta.
 * A ordem dos pontos importa: comecando por baixo as normais saem pra fora.
 */
function tiraFechada(y, rIn, rOut, meiaLarg, fi0, fiLen, mat, seg = 20) {
  const p = [
    [rIn, -meiaLarg], [rOut, -meiaLarg], [rOut, meiaLarg], [rIn, meiaLarg], [rIn, -meiaLarg],
  ]
  const m = N.sh(new THREE.Mesh(N.revolver(p, seg, 1, fi0, fiLen), mat))
  m.position.y = y
  return m
}

/** Nervura de costura: crista de 0,7 mm correndo por fora, na cor do fio. */
function costura(y, rOut, dy, fi0, fiLen, mat, seg = 20) {
  const p = [[rOut - 0.0004, dy - 0.0013], [rOut + 0.0007, dy], [rOut - 0.0004, dy + 0.0013]]
  const m = N.sh(new THREE.Mesh(N.revolver(p, seg, 1, fi0, fiLen), mat))
  m.position.y = y
  return m
}

// ===========================================================================
// 3. metodo CASCA CONTINUA — grade parametrica montada a mao
// ===========================================================================

// Quanto a volta "incha" perto do dorso. E o unico jeito de caixa e pulseira
// serem a mesma superficie: lathe nao serve porque o raio de uma lathe so pode
// variar com y, e aqui ele precisa variar com o ANGULO.
const FI_TELA = -Math.PI / 2   // o dorso do pulso, o lado que a camera ve
const LARG_INCHACO = 0.95      // meia-largura angular do inchaco, em radianos

function inchaco(fi) {
  let d = fi - FI_TELA
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  const s = Math.max(0, 1 - Math.abs(d) / LARG_INCHACO)
  return s * s * (3 - 2 * s)   // smoothstep: degrau duro daria uma quina no aco
}

// Secao em superelipse (expoente 0.55): retangulo de canto redondo com 10
// pontos. Circulo puro daria um tubo de mangueira e retangulo puro daria a
// quina viva que o dono chamou de bloco.
const secaoU = (th) => Math.sign(Math.cos(th)) * Math.pow(Math.abs(Math.cos(th)), 0.55)
const secaoV = (th) => Math.sign(Math.sin(th)) * Math.pow(Math.abs(Math.sin(th)), 0.55)

/** Ponto da casca: fi na volta, th na secao, dr empurra pra fora da superficie. */
function pontoCasca(o, fi, th, dr) {
  const s = inchaco(fi)
  const a = o.larg + o.largTela * s
  const b = o.esp + o.espTela * s
  const r = o.raio + o.raioTela * s + b * secaoV(th) + dr
  return [r * Math.sin(fi), a * secaoU(th), r * Math.cos(fi)]
}

function gradeCasca(o, nFi, nTh, fi0, fiLen, th0, thLen, fecha, dr, canto = 0) {
  const pos = [], idx = []
  for (let i = 0; i < nFi; i++) {
    for (let k = 0; k < nTh; k++) {
      const th = th0 + thLen * (fecha ? k / nTh : k / (nTh - 1))
      // CANTO REDONDO. A linha de cima e a de baixo do retalho da tela ficam
      // mais CURTAS que as do meio (superelipse de expoente 6 sobre a altura),
      // e a tela deixa de ser o retangulo colado que apareceu na primeira foto.
      // O t para em 0.93 e nao em 1 de proposito: em 1 a linha do topo
      // colapsaria num ponto so e a tela viraria um losango.
      let f = 1
      if (canto > 0 && !fecha) {
        const t = ((k / (nTh - 1)) * 2 - 1) * 0.93
        f = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 6)), 1 / 6)
        f = 1 - canto * (1 - f)
      }
      const meio = fi0 + fiLen / 2
      const fi = meio + (fi0 + fiLen * (fecha ? i / nFi : i / (nFi - 1)) - meio) * f
      const p = pontoCasca(o, fi, th, dr)
      pos.push(p[0], p[1], p[2])
    }
  }
  const ni = fecha ? nFi : nFi - 1
  const nk = fecha ? nTh : nTh - 1
  for (let i = 0; i < ni; i++) {
    const i2 = (i + 1) % nFi
    for (let k = 0; k < nk; k++) {
      const k2 = (k + 1) % nTh
      const A = i * nTh + k, B = i2 * nTh + k, Cc = i2 * nTh + k2, D = i * nTh + k2
      // A-D-C / A-C-B e a ordem que deixa a normal apontando pra FORA do pulso.
      // Com A-B-C a casca inteira nasce virada do avesso e o boneco fica com um
      // buraco no braco (a face de dentro e descartada pelo culling).
      idx.push(A, D, Cc, A, Cc, B)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  // A volta fecha pelo INDICE (i+1 mod nFi), entao nao ha coluna duplicada e
  // aqui isto e no-op de proposito. A chamada fica: o dia em que alguem abrir a
  // casca (fecha = false) ou emendar duas grades, a listra volta a existir e
  // ninguem vai lembrar de acrescentar a solda depois. (nucleo.js importa
  // soldarNormais mas nao reexporta, por isso o import vem do modulo do rosto.)
  soldarNormais(g)
  return g
}

export const RELOGIOS = [
  { id: 'nenhum', nome: 'Nenhum', metodo: 'slot vazio', build() { return null } },

  {
    id: 'aco-elos',
    nome: 'Aco de elos',
    metodo: 'pulseira de ELOS soltos (prisma hexagonal por elo, cada um tombado no proprio eixo tangente) + caixa lathe com bisel e recesso; mostrador desenhado em tex()',
    build(c) {
      const g = new THREE.Group()
      const aco = N.metal(0xc3cad1)
      const acoEsc = N.metal(N.esc(0xc3cad1, 0.72))
      // 4,5 mm por fora da pele e 1,5 mm enterrados nela. A primeira versao
      // tinha 3,4 mm de meia-espessura e os elos ficavam de pe no braco como
      // pinos; o elo tem que ser mais CHATO que largo, senao vira contas.
      const R_ELO = 0.0425

      g.add(pulseiraElos(c, aco, {
        n: 30, r: R_ELO, meiaEsp: 0.0030, larg: 0.019,
        // o vao de 0,60 rad e onde a caixa senta: os elos das pontas entram por
        // baixo do bisel e a pulseira nao "nasce do nada" ao lado da caixa
        fiCaixa: FI_TELA, vao: 0.60,
      }))

      // Caixa: perfil que sobe pelo bisel, vira no lip e DESCE de volta pra
      // dentro. E essa volta pra dentro que faz o mostrador ser afundado — com
      // o disco no topo do cilindro o relogio vira uma ficha de cassino.
      const dist = 0.0405
      const caixa = [
        [0.0000, 0.0000],
        [0.0148, 0.0000],
        [R_CAIXA_MAX, 0.0038],   // barriga do bisel
        [0.0142, 0.0092],        // topo do bisel
        [0.0116, 0.0104],        // lip
        [0.0113, 0.0064],        // parede do recesso, descendo
        [0.0000, 0.0064],        // fundo do recesso, CHATO
      ]
      g.add(N.mostrador(c, N.revolver(caixa, 20, 1), aco, dist))

      // 0,2 mm acima do fundo. O fundo tem que ser chato mesmo (os dois ultimos
      // pontos do perfil no mesmo y): com o fundo inclinado a borda do disco
      // afunda de um lado e o mostrador nasce torto dentro da propria caixa.
      const plano = planoDorso(c, dist + 0.0066)
      plano.add(N.sh(new THREE.Mesh(
        new THREE.CircleGeometry(0.0108, 20),
        faceMat('analogico', desenhoAnalogico),
      )))
      // coroa no +X local = a FRENTE do boneco. No lado de tras ela existiria
      // so pro perfil da silhueta e ninguem veria a estria.
      const coroa = N.tubo(0.0026, 0.0026, 0.0052, acoEsc, 8)
      coroa.rotation.z = -Math.PI / 2
      coroa.position.set(0.0152, 0, -0.0048)
      plano.add(coroa)
      g.add(plano)
      return g
    },
  },

  {
    id: 'couro-costurado',
    nome: 'Couro costurado',
    metodo: 'tira revolvida de secao FECHADA (couro com espessura) + nervura de costura nas duas bordas, ponta com furos e fivela de lingueta; ponteiros de geometria sob calota de vidro abaulada',
    build(c) {
      const g = new THREE.Group()
      const y = yPulso(c)
      const couro = N.couro(0x4b2f1c)
      const fio = solid(0xd8c49a, 0.95, 0.0)
      const latao = N.metal(0xb99a52)

      const R_IN = 0.0375, R_OUT = 0.0455, MEIA_L = 0.0100
      const FI_FIVELA = 1.05   // lado de dentro do pulso, virado 30 graus pra
      //                          frente: e onde a fivela fica no braco de
      //                          verdade e ainda assim aparece de tres quartos
      const VAO = 0.68

      g.add(tiraFechada(y, R_IN, R_OUT, MEIA_L, FI_FIVELA + VAO / 2,
        Math.PI * 2 - VAO, couro))
      for (const s of [1, -1]) {
        g.add(costura(y, R_OUT, s * (MEIA_L - 0.0026),
          FI_FIVELA + VAO / 2, Math.PI * 2 - VAO, fio))
      }
      // a ponta passa POR CIMA da tira principal (0,2 mm de degrau) e e mais
      // estreita: e o degrau que conta a historia de duas camadas de couro
      const R_T = R_OUT + 0.0022
      g.add(tiraFechada(y, R_OUT - 0.0004, R_T, MEIA_L * 0.82,
        FI_FIVELA - 1.34, 1.00, couro, 12))
      // furo = disco escuro meio milimetro SALIENTE, nao um furo de verdade:
      // vazar a tira custaria a tira inteira em ExtrudeGeometry e a 3 m o que
      // le como furo e a mancha escura, nao a profundidade
      const furo = new THREE.CylinderGeometry(0.0013, 0.0013, 0.0026, 6)
      furo.rotateX(Math.PI / 2)   // eixo do furo vira o +Z local = o radial
      const escuro = solid(N.esc(0x4b2f1c, 0.35), 0.9, 0.0)
      for (let i = 0; i < 4; i++) {
        g.add(naVolta(N.malha(furo, escuro), FI_FIVELA - 0.46 - i * 0.17, R_T - 0.0008, y))
      }
      // passante: arco curto de couro atravessando a ponta
      g.add(tiraFechada(y, R_OUT - 0.0006, R_T + 0.0012, MEIA_L * 0.28,
        FI_FIVELA - 0.66, 0.16, couro, 5))

      // Fivela: quadro ovalado deitado no plano tangente + lingueta cruzando.
      // O quadro e mais comprido no eixo do BRACO porque e por ali que a tira
      // de 2 cm passa; oval no outro sentido nao deixaria a tira entrar.
      const fiv = new THREE.Group()
      const quadro = new THREE.TorusGeometry(0.0112, 0.0013, 5, 12)
      quadro.scale(0.66, 1, 1)
      fiv.add(N.malha(quadro, latao))
      const lingueta = N.tubo(0.0008, 0.0008, 0.0165, latao, 6)
      lingueta.rotation.z = Math.PI / 2
      lingueta.position.z = 0.0016
      fiv.add(lingueta)
      g.add(naVolta(fiv, FI_FIVELA, R_OUT + 0.0012, y))

      // Caixa redonda chata (relogio social e o oposto do esportivo: fino). O
      // aro sobe ate 0.0094 e volta pra dentro ate 0.0070: e esse bolso de
      // 2,4 mm que da onde o vidro sentar. Sem ele o vidro apoiaria no mesmo
      // plano do mostrador e os dois brigariam no depth buffer.
      // O aro e ESTREITO (1,8 mm entre 0.0140 e 0.0158) porque na foto de perto
      // um aro de 3 mm engolia o mostrador: sobrava um disco dourado com um
      // furo claro no meio, e nao um relogio.
      const dist = 0.0400
      const caixa = [
        [0.0000, 0.0000], [0.0150, 0.0006], [0.0158, 0.0040], [0.0154, 0.0082],
        [0.0140, 0.0094], [0.0136, 0.0074], [0.0000, 0.0070],
      ]
      g.add(N.mostrador(c, N.revolver(caixa, 18, 1), latao, dist))

      const plano = planoDorso(c, dist + 0.0072)
      plano.add(N.sh(new THREE.Mesh(
        new THREE.CircleGeometry(0.0130, 18), solid(0xf7f2e4, 0.44, 0.0),
      )))
      // Ponteiro de GEOMETRIA aqui (o item 1 ja tem o de textura): caixa fina
      // + ponteiro solido dao a sombra propria que o vidro depois distorce.
      // AZULADO, nao dourado: ponteiro de latao em mostrador creme sumia na
      // primeira foto — sobrava o brilho do vidro e nenhuma hora legivel.
      const azulado = solid(0x2b3346, 0.34, 0.20)
      // rotation.z gira o +Y local pra (-sen a, cos a), entao o CENTRO da barra
      // tem que ir pra metade do comprimento nessa mesma direcao — barra
      // rotacionada sem mover o centro nasce cruzando o mostrador inteiro.
      for (const [ang, comp, larg] of [[-Math.PI / 3, 0.0074, 0.0016], [Math.PI / 3, 0.0106, 0.0012]]) {
        const p = N.caixa(larg, comp, 0.0008, azulado)
        p.rotation.z = ang
        p.position.set(-Math.sin(ang) * comp / 2, Math.cos(ang) * comp / 2, 0.0007)
        plano.add(p)
      }
      // quatro indices nas horas cardeais: 48 triangulos que transformam um
      // disco creme num mostrador
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2
        const ix = N.caixa(0.0011, 0.0026, 0.0006, azulado)
        ix.rotation.z = a
        ix.position.set(-Math.sin(a) * 0.0107, Math.cos(a) * 0.0107, 0.0004)
        plano.add(ix)
      }
      plano.add(N.malha(new THREE.CircleGeometry(0.0016, 8), latao, 0, 0, 0.0012))
      g.add(plano)

      // O VIDRO. roughness 0.05 numa calota rasa: a cena nao tem environment
      // map, entao o unico reflexo disponivel e o especular do sol — e e ele
      // que faz a peca ler como relogio e nao como moeda colada no braco.
      // Levemente transparente pra deixar o mostrador aparecer.
      //
      // A conta da calota: com thetaLength T, a borda sai em rx*sen(T) e a
      // altura da barriga sobre a borda e ry*(1-cos T). Aqui a borda tem que
      // cair EXATAMENTE no lip do aro (raio 0.0137, altura 0.0092) e a barriga
      // subir 1,2 mm. Escolher os raios no olho punha a borda do vidro flutuando
      // dentro da caixa, com uma fresta em volta do mostrador.
      const T = 0.9
      const rBorda = 0.0137, barriga = 0.0012
      const ry = barriga / (1 - Math.cos(T))
      const domo = new THREE.SphereGeometry(1, 16, 5, 0, Math.PI * 2, 0, T)
      domo.scale(rBorda / Math.sin(T), ry, rBorda / Math.sin(T))
      g.add(N.mostrador(c, domo, solid(0xe7f3f7, 0.09, 0.0, {
        transparent: true, opacity: 0.26,
      }), dist + 0.0092 - ry * Math.cos(T)))
      return g
    },
  },

  {
    id: 'bracelete-tela',
    nome: 'Bracelete de tela',
    metodo: 'UMA casca parametrica montada a mao (grade volta x secao) cujo raio, espessura e largura incham no dorso: caixa e pulseira sao a MESMA superficie. Tela em emissive(), o unico item que acende a noite',
    build(c) {
      const g = new THREE.Group()
      g.position.y = yPulso(c)
      const forma = {
        // 0.0425 + 0.0035 de meia-espessura = 4,6 cm de raio na banda (5 mm por
        // fora da pele) e 5,0 cm no dorso. O de dentro fica em 0.039, enterrado
        // nos 0.041 do antebraco, entao a casca nao mostra vao nenhum.
        raio: 0.0425, raioTela: 0.0020,
        esp: 0.0035, espTela: 0.0020,
        larg: 0.0085, largTela: 0.0060,
      }
      const grafite = solid(0x2b2f36, 0.44, 0.28)
      g.add(N.sh(new THREE.Mesh(
        gradeCasca(forma, 28, 10, 0, Math.PI * 2, 0, Math.PI * 2, true, 0),
        grafite,
      )))

      // A TELA E A PROPRIA CASCA, 0,6 mm acima. Nasce da mesma funcao, entao
      // acompanha o inchaco em vez de flutuar: um plano chapado aqui
      // atravessaria a curva nas pontas e deixaria dois cantos de vidro no ar.
      const tela = gradeCasca(forma, 9, 7, FI_TELA - 0.26, 0.52,
        Math.PI / 2 - 0.68, 1.36, false, 0.0006, 1)
      // Tela ESCURA com os arcos claros, nao o contrario: a primeira versao
      // era um retangulo ciano chapado e a 3 m lia como adesivo. Preto azulado
      // fraco + arco forte e o contraste que faz a tela parecer ligada — e a
      // noite e ele que sobra aceso.
      g.add(N.sh(new THREE.Mesh(tela, emissive(0x14364d, 0.95))))

      // Aneis de atividade: dois arcos em relevo, cores diferentes, sweeps
      // diferentes. Sao a UNICA "informacao" da tela — desenho de relogio
      // digital a esse tamanho vira mancha, arco de progresso le a 3 m.
      const rTela = forma.raio + forma.raioTela + forma.esp + forma.espTela
      const arcos = [
        [0.0073, 0.0013, 4, 14, 4.9, 0x4dff92, 0.6],
        [0.0043, 0.0011, 4, 11, 3.4, 0xff8a1e, -0.9],
      ]
      for (const [r, t, sa, sb, arco, cor, giro] of arcos) {
        const m = N.malha(new THREE.TorusGeometry(r, t, sa, sb, arco), emissive(cor, 2.4))
        // ordem XYZ: o rotation.z gira o arco NO PLANO da tela (e aplicado
        // primeiro) e so depois o rotation.y deita o anel no dorso
        m.rotation.set(0, -Math.PI / 2, giro)
        m.position.set(-(rTela - 0.0004), 0, 0)
        g.add(m)
      }

      // NAO TEM COROA NEM BOTAO, e isso e a peca. Duas tentativas viraram foto:
      // por baixo da caixa a coroa lia como um pino claro espetado na pele, e no
      // flanco lia como um parafuso no meio da correia. Nas duas ela contradizia
      // o proprio metodo do item — uma casca sem emenda —, entao o botao caiu e
      // a identidade fica sendo o que so este item tem: a tela acesa.
      return g
    },
  },
]

export default RELOGIOS
