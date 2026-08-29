import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/calcas.js — o catalogo de CALCAS. Ancora: hips.
//
// Tres pecas, TRES CONSTRUCOES DIFERENTES. Nao e capricho de organizacao: o
// dono quer comparar na tela qual leitura combina com o jogo, e duas pecas que
// sao a mesma funcao com outra cor nao respondem nada.
//
//   0. JEANS   — DOIS TUBOS + COS REVOLVIDO (pernas/cos/cinto do nucleo).
//      O classico. O que faltava nele era o acabamento: aqui entram o vinco do
//      joelho (dois aneis revolvidos logo acima da junta), a boca com
//      ESPESSURA de verdade (uma lathe que desce por fora, vira embaixo e sobe
//      por dentro, entao da pra ver o avesso), a costura em relevo dos bolsos e
//      o afunilamento em tres estagios: larga no quadril, estreita no joelho,
//      abre de novo na barra.
//
//   1. JOGGER  — PANO CONTINUO LOFTEADO do quadril ao tornozelo.
//      Em vez de tubo por osso, uma unica superficie varrida por secoes
//      (lofte()). Ganha tres coisas que tubo nenhum da: secoes DENSAS onde o
//      tecido dobra, o punho FRANZIDO (o raio de cada secao ondula com o
//      angulo, entao a prega e geometria e nao textura) e sombra assada em cor
//      de vertice — o fundo da prega escurece sozinho.
//
//   2. CARGO   — CAMADAS: base fina + PAINEIS aplicados por cima.
//      Bolsao com aba e volume proprio, faixa refletiva, barra dobrada pra fora
//      e costura lateral revolvida. E o metodo que faz o NPC ser LEMBRADO de
//      longe, porque a silhueta ganha recorte em vez de cor.
//
// Regras desta pagina (todas custaram bug antes):
//
// - A CINTURA SAI DO PERFIL DO CORPO. Nada de raio escrito na mao em volta do
//   quadril: fatia(c.perfil.PELVIS, ...) le o mesmo vinco que a pele usa. Raio
//   na mao era o risco de pele que aparecia em volta da cintura.
// - Toda lathe feita aqui passa por N.revolver(), que ja solda as normais. Sem
//   isso a emenda da volta acende como uma listra vertical.
// - PERFIL ESCRITO DE BAIXO PRA CIMA NASCE VIRADO PRA FORA. A normal de um
//   segmento de lathe e (dy, -dr): perfil subindo da face pra fora, perfil
//   descendo da face pra DENTRO. E o que permite dobrar a barra numa peca so
//   em vez de colar duas.
// - A BOCA MORRE 2 cm ABAIXO DO TORNOZELO quando a peca esconde 'canela'
//   (regra do nucleo: 'esconde' apaga a capsula INTEIRA, bola do tornozelo
//   junto, e barra curta deixa ver o chao entre o pano e o pe).
// ---------------------------------------------------------------------------

/**
 * Raio minimo que a boca de uma calca comprida pode ter.
 *
 * sapatoBase() do nucleo levanta um colarinho de raio 0.056 (x1.05 em Z) entre
 * 5,3 cm e 12,3 cm do chao, e a boca das calcas compridas morre em 7 cm. Barra
 * mais fina que o colarinho nao cobre o cano: e o CANO que atravessa a barra, e
 * de perto se ve o sapato brotando por dentro da calca. 6 cm deixa 2 mm de
 * folga por cima do colarinho mais gordo do catalogo de calcados.
 */
const R_FORA_DO_CANO = 0.060

/** Linha de costura ocre: le como pesponto em qualquer cor de tecido. */
const LINHA = 0xd7ab63

/**
 * Deita um painel na superficie do corpo (bolso, aba, chapa).
 *
 * A secao do tronco NAO e um circulo — a lathe achata tudo por FLAT_Z —, entao
 * a normal em (x, z) e (x, z/flatZ^2) e nao (x, z). Girar o painel pelo angulo
 * da POSICAO deixava o bolso traseiro entrando de canto na bunda: uma metade
 * enterrada no pano, a outra boiando. Na perna (tubo redondo) flatZ = 1 e a
 * conta vira o atan2 simples.
 */
function viraPraFora(m, x, z, flatZ = 1) {
  m.rotation.y = Math.atan2(x * flatZ * flatZ, z)
  return m
}

/** Atalho: mesh com sombra ligada, que e o padrao de tudo aqui. */
function peca(geo, mat) { return N.sh(new THREE.Mesh(geo, mat)) }

// ===========================================================================
// LOFT — a ferramenta do item 1
// ===========================================================================

/**
 * Superficie varrida por SECOES: cada secao e um anel { y, r } e o loft costura
 * os aneis vizinhos. E o que um tubo nao faz:
 *
 *  - `rip` ondula o RAIO com o angulo (`lobos` cristas). Com seg = 16 e
 *    lobos = 8 cai exatamente uma amostra em cada crista e cada vale, o que da
 *    a canaleta limpa do punho de moletom; com lobos = 5 a onda fica solta e le
 *    como caimento do tecido.
 *  - `ao` escurece a secao inteira na COR DE VERTICE, e o vale da onda escurece
 *    sozinho por cima disso. E sombra assada: o punho e a virilha ficam mais
 *    escuros que o meio da coxa sem uma segunda malha, sem textura e sem um
 *    material a mais.
 *
 * A volta fecha por INDICE (o ultimo vertice do anel liga no primeiro), entao
 * aqui nao existe a coluna duplicada da LatheGeometry — nao ha emenda pra
 * soldar e a listra vertical nao tem por onde nascer.
 *
 * A ORDEM DAS SECOES IMPORTA: perfil subindo nasce virado pra fora. As secoes
 * sao escritas do quadril pro tornozelo porque e assim que se pensa a perna,
 * entao o loft inverte a lista sozinho — escrever de cima pra baixo devolvia a
 * calca com a face interna pra camera, e o boneco ficava com um buraco de perna.
 */
function lofte(secoes, seg, o = {}) {
  let s = secoes
  if (s[0].y > s[s.length - 1].y) s = s.slice().reverse()
  const n = s.length
  const base = o.cor !== undefined ? new THREE.Color(o.cor) : null
  const pos = new Float32Array(n * seg * 3)
  const col = base ? new Float32Array(n * seg * 3) : null
  for (let i = 0; i < n; i++) {
    const S = s[i]
    const lobos = S.lobos || 5
    const rip = S.rip || 0
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2
      const onda = rip ? Math.cos(lobos * a + (S.fase || 0)) : 0
      const r = S.r * (1 + rip * onda)
      const k = (i * seg + j) * 3
      pos[k] = (S.dx || 0) + Math.sin(a) * r
      pos[k + 1] = S.y
      pos[k + 2] = (S.dz || 0) + Math.cos(a) * r
      if (col) {
        // o VALE da prega (onda < 0) e o que a luz nao alcanca
        const f = 1 - (S.ao || 0) - 0.55 * rip * Math.max(0, -onda)
        col[k] = base.r * f; col[k + 1] = base.g * f; col[k + 2] = base.b * f
      }
    }
  }
  const idx = []
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg
      idx.push(a, b, a + seg, b, b + seg, a + seg)
    }
  }
  // Tampas: sem elas da pra olhar pra dentro da perna (a face de tras e
  // descartada pelo culling e pelo furo se ve o cenario do outro lado). As duas
  // moram em lugar escondido — a de cima dentro do cos, a de baixo dentro do
  // sapato —, entao custam so o leque de triangulos.
  const lista = [...pos]
  const cores = col ? [...col] : null
  const tampa = (anel, cima) => {
    const c0 = lista.length / 3
    let x = 0, z = 0
    for (let j = 0; j < seg; j++) { x += lista[(anel * seg + j) * 3]; z += lista[(anel * seg + j) * 3 + 2] }
    lista.push(x / seg, s[anel].y, z / seg)
    if (cores) cores.push(cores[anel * seg * 3] * 0.8, cores[anel * seg * 3 + 1] * 0.8, cores[anel * seg * 3 + 2] * 0.8)
    for (let j = 0; j < seg; j++) {
      const a = anel * seg + j, b = anel * seg + (j + 1) % seg
      if (cima) idx.push(c0, a, b); else idx.push(c0, b, a)
    }
  }
  if (o.tampaBaixo !== false) tampa(0, false)
  if (o.tampaCima !== false) tampa(n - 1, true)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(lista, 3))
  if (cores) g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * A "bola" do joelho, feita com o MESMO loft (secoes de uma esfera).
 *
 * Existe pela mesma razao da bola de cotovelo da manga comprida: as duas metades
 * da calca moram em juntas diferentes e se afastam quando o joelho dobra, e pela
 * fresta aparecia a BOLA DE PELE do joelho — que nao esta em nenhum grupo de
 * 'esconde' e portanto nunca some. Esfera e a unica forma que continua cobrindo
 * a junta em qualquer angulo de dobra: um barril curto giraria junto com a
 * canela e a boca dele sairia pela frente da coxa.
 *
 * Os polos param em 0.06pi pra nao gerar triangulo degenerado (normal zerada
 * vira NaN e o mesh some inteiro); o que sobra e fechado pelas tampas do loft.
 */
function joelhoLoft(r, seg, o = {}) {
  const secoes = []
  const m = 6
  for (let i = 0; i <= m; i++) {
    const t = Math.PI * (0.06 + 0.88 * (i / m))
    secoes.push({ y: Math.cos(t) * r * (o.ky || 1), r: Math.sin(t) * r, ao: o.ao })
  }
  return lofte(secoes, seg, o)
}

// ===========================================================================
// ACABAMENTOS — o que separa "cilindro colorido" de "peca de roupa"
// ===========================================================================

/**
 * Vinco: anel de revolucao com uma saliencia assimetrica (sobe rapido, desce
 * devagar), que e como o brim amassa logo acima da rotula. Dois deles
 * empilhados leem como a dobra que TODA calca de tecido firme tem no joelho, e
 * de longe sao eles que dizem que a perna nao e um cano.
 */
function dobra(r, y, alt, saliencia, mat, seg = 14) {
  return peca(N.revolver([
    [r - 0.0015, y - alt],
    [r + saliencia, y - alt * 0.30],
    [r + saliencia * 0.5, y + alt * 0.40],
    [r - 0.0015, y + alt],
  ], seg), mat)
}

/**
 * BOCA DA CALCA COM ESPESSURA E AVESSO.
 *
 * O pano desce por FORA, vira na quina e volta a subir por DENTRO. Como a
 * normal de um trecho de lathe e (dy, -dr), o trecho escrito de baixo pra cima
 * nasce virado pra fora e o escrito de cima pra baixo nasce virado pra dentro —
 * entao o avesso ja aparece certo pra quem olha a barra de baixo, sem
 * DoubleSide e sem depender de renderOrder. A versao anterior era um cilindro
 * fechado por um disco: a barra tinha 0 mm de espessura e o disco lia como
 * tampa de lata.
 *
 * Sao duas malhas (e nao uma tira dobrada) so pra o avesso poder ser mais
 * escuro que o direito — as duas se encontram exatamente na quina.
 */
function boca(r, y, mat, matAvesso, seg = 14) {
  const g = new THREE.Group()
  const alt = 0.034
  // fora: sobe (face pra fora), engordando ate a quina da dobra
  g.add(peca(N.revolver([
    [r * 1.010, y],
    [r * 1.028, y + 0.007],
    [r * 1.024, y + alt * 0.55],
    [r * 0.998, y + alt],
  ], seg), mat))
  // dentro: desce ate a quina (face pra dentro) — e o avesso do pano
  g.add(peca(N.revolver([
    [r * 0.980, y + alt],
    [r * 0.988, y + 0.006],
    [r * 1.010, y],
  ], seg), matAvesso))
  return g
}

/**
 * Costura em relevo que ACOMPANHA O CORPO: setor estreito de lathe tirado do
 * proprio perfil, 2,5 mm por fora da peca. Uma barrinha reta no lugar disto
 * afundava no meio e saia nas pontas, porque o quadril e o unico lugar do
 * boneco onde o raio muda 3 cm em 8 cm de altura.
 */
function pespontoNoCorpo(c, mat, y0, y1, angulo, arco, folga, fora = 0.0025) {
  return peca(N.casca(c, N.fatia(c.perfil.PELVIS, y0, y1), {
    folga, extra: fora, seg: 4, phi0: angulo - arco / 2, phiLen: arco,
  }), mat)
}

/** Passantes de cinto: fitinhas curvas que seguem o quadril (mesma ideia). */
function passantes(c, mat, y, angulos) {
  const g = new THREE.Group()
  for (const a of angulos) {
    g.add(pespontoNoCorpo(c, mat, y - 0.017, y + 0.014, a, 0.11, N.FOLGA_CINTO, 0.0055))
  }
  return g
}

// ===========================================================================
// O CATALOGO
// ===========================================================================

export const CALCAS = [
  {
    id: 'jeans',
    nome: 'Jeans',
    metodo: 'dois tubos + cos revolvido: vinco do joelho em anel revolvido, boca dobrada com avesso e pesponto tirado do perfil do quadril',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = c.cor.calca
      const m = N.tecido(cor, 0.95)
      // O brim desbota nas dobras: o mesmo tom 18% mais claro no vinco e na
      // barra e o que faz a peca ler como JEANS e nao como calca de cor lisa.
      const gasto = N.tecido(N.esc(cor, 1.18), 0.93)
      const avesso = N.tecido(N.esc(cor, 0.66), 0.97)
      const linha = N.tecido(LINHA, 0.85)
      const g = new THREE.Group()
      const T = c.medida.THIGH

      // --- afunilamento em tres estagios -----------------------------------
      // R_TOPO nao e escolhido no olho: a 2 cm acima do quadril o cos tem
      // 0.1315 de raio em X e a perna nasce em HIP_X = 0.070, entao qualquer
      // coisa acima de 0.0615 empurra a TAMPA do tubo pra fora da lathe do
      // quadril e cria uma prateleira horizontal na cintura. Era o degrau que
      // aparecia de lado no boneco.
      const R_TOPO = 0.0610
      const R_JOELHO = 0.0545   // estreita: a perna afina onde o osso afina
      const R_BOCA = 0.0630     // e abre de novo — bota cabe por dentro
      const rCoxaEm = (y) => R_JOELHO + (R_TOPO - R_JOELHO) * ((y + T) / (0.020 + T))

      // O cos desce ate -0.042 (e nao -0.026) pra alcancar o gancho: entre a
      // barra do cos e o topo dos tubos ficava um anel de 2 cm que so estava
      // coberto porque a camisa passa por ali. Com regata ou sem camisa
      // aparecia pele no meio da calca.
      g.add(N.cos(c, m, { y0: -0.042, y1: 0.054 }))
      g.add(N.cinto(c, N.esc(cor, 0.30), { y: 0.040, fivela: 0xc9b273 }))
      g.add(passantes(c, gasto, 0.040, [0, 1.5, -1.5, 2.7, -2.7]))

      N.pernas(c, m, {
        rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: Math.max(R_BOCA, R_FORA_DO_CANO),
        canelaFrac: 1,
      })

      // --- vinco do joelho: duas dobras logo acima da junta ------------------
      N.nasPernas(c, 'Upper', () => {
        const d = new THREE.Group()
        d.add(dobra(rCoxaEm(-0.292), -0.292, 0.019, 0.0045, gasto))
        d.add(dobra(rCoxaEm(-0.334), -0.334, 0.016, 0.0035, gasto))
        return d
      })
      // Bola de tecido no joelho, do tamanho do tubo: a coxa e a canela moram
      // em juntas diferentes e abrem uma fresta quando a perna dobra. Sem ela
      // aparece a bola de PELE do joelho no meio do jeans (a mesma correcao da
      // bola de cotovelo da manga comprida).
      N.nasPernas(c, 'Lower', () => {
        const b = N.bola(R_JOELHO * 0.99, m, 10)
        b.scale.y = 0.86
        return b
      })

      // --- boca com espessura ----------------------------------------------
      const yBoca = -(c.medida.SHIN) - 0.020
      N.nasPernas(c, 'Lower', () => boca(Math.max(R_BOCA, R_FORA_DO_CANO), yBoca, gasto, avesso))

      // --- bolsos: painel embutido + pesponto em relevo ---------------------
      // Traseiro na altura do assento, deitado na curva pela normal da elipse.
      for (const sgn of [1, -1]) {
        const x = sgn * 0.052, y = -0.004
        const z = -N.frenteXZ(c, c.perfil.PELVIS, x, y, N.FOLGA_CALCA, 0.0015)
        const p = N.bloco(0.064, 0.072, 0.016, 0.012, gasto)
        p.position.set(x, y, z)
        viraPraFora(p, x, z, c.medida.FLAT_Z)
        g.add(p)
        const cost = N.caixa(0.058, 0.0055, 0.012, linha)
        cost.position.set(x, y + 0.031, z * 1.05)
        viraPraFora(cost, x, z, c.medida.FLAT_Z)
        g.add(cost)
      }
      // Frontal: a boca do bolso e um pesponto que desce em diagonal pelo
      // quadril. Sai da fatia do perfil, entao acompanha o vinco em vez de
      // cortar ele.
      for (const sgn of [1, -1]) {
        g.add(pespontoNoCorpo(c, linha, -0.020, 0.030, sgn * 0.62, 0.30, N.FOLGA_CALCA, 0.0035))
        // rebite: o pingo de cobre de 7 mm que so o jeans tem. E um DOMO e nao
        // um disco de proposito — disco precisa apontar pra normal, e a 8,8 cm
        // do meio o quadril ja girou 40 graus; a bolota nao tem lado errado.
        const reb = N.bola(0.0037, N.metal(0xb98a4e), 8)
        reb.scale.set(1, 1, 0.55)
        reb.position.set(sgn * 0.088, -0.018,
          N.frenteXZ(c, c.perfil.PELVIS, sgn * 0.088, -0.018, N.FOLGA_CALCA, 0.0035))
        g.add(reb)
      }
      // Carcela: o vinco vertical da braguilha, do cos pro gancho.
      g.add(pespontoNoCorpo(c, gasto, -0.036, 0.030, 0.10, 0.16, N.FOLGA_CALCA, 0.0035))
      return g
    },
  },

  {
    id: 'jogger',
    nome: 'Jogger',
    metodo: 'pano continuo lofteado do quadril ao tornozelo: secoes densas no joelho, punho franzido na propria secao e sombra assada em cor de vertice',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = N.esc(c.cor.calca, 1.10)
      // UM material pro pano inteiro, com a cor viajando na GEOMETRIA (cor de
      // vertice). E o que permite punho escuro, virilha sombreada e prega funda
      // sem nenhuma malha ou textura a mais — e o cache global guarda um
      // material so, seja qual for a cor que o jogador escolher.
      const pano = solid(0xffffff, 0.99, 0, { vertexColors: true })
      const liso = N.tecido(N.esc(cor, 0.90), 0.98)
      const cordaoM = N.tecido(0xe8e2d4, 0.95)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN
      const SEG = 16

      g.add(N.cos(c, liso, { y0: -0.042, y1: 0.058 }))

      // Cordao: sai do Z DA SUPERFICIE (frenteXZ), nunca de um z escrito na
      // mao — a secao do quadril e uma elipse, entao no x do cordao a
      // superficie ja recuou e um z do meio da barriga poe o cordao no ar.
      //
      // E ele DESCE ACOMPANHANDO A SUPERFICIE. A primeira versao era um tubo
      // vertical de 6 cm num z so: entre o no (y = -0.004) e a ponta o quadril
      // recua 3,4 cm em Z (a barriga vira braguilha) e a ponta de baixo ficava
      // BOIANDO — medido com um raio pra tras, 4,7 cm de vazio ate qualquer
      // pano, no meio do buraco entre as duas coxas. E o mesmo defeito da alca
      // de regata que nascia no ar em vez de nascer no ombro.
      // As duas pontas saem de frenteXZ no x de cada uma e o tubo e orientado
      // pela reta entre elas, entao o cordao pousa na calca de ponta a ponta.
      const yC = -0.004
      const zC = N.frenteZ(c, c.perfil.PELVIS, yC, N.FOLGA_CALCA, 0.004)
      const CIMA = new THREE.Vector3(0, 1, 0)
      for (const sgn of [1, -1]) {
        const a = new THREE.Vector3(sgn * 0.020, yC,
          N.frenteXZ(c, c.perfil.PELVIS, sgn * 0.020, yC, N.FOLGA_CALCA, 0.004))
        // a ponta abre 1 cm pra fora ao cair: dois cordoes paralelos leem como
        // um so, e o cos acaba em -0.042 — parar em -0.038 mantem o pe do
        // cordao em cima do pano
        const b = new THREE.Vector3(sgn * 0.030, -0.038,
          N.frenteXZ(c, c.perfil.PELVIS, sgn * 0.030, -0.038, N.FOLGA_CALCA, 0.004))
        const d = new THREE.Vector3().subVectors(a, b)
        const p = N.tubo(0.0045, 0.0038, d.length(), cordaoM, 6)
        p.position.copy(a).add(b).multiplyScalar(0.5)
        p.quaternion.setFromUnitVectors(CIMA, d.normalize())
        g.add(p)
      }
      const no = N.bola(0.0085, cordaoM, 8)
      no.position.set(0, yC + 0.004, zC + 0.002)
      no.scale.set(1.5, 0.8, 0.7)
      g.add(no)

      // --- a perna: uma superficie so, cortada na junta do joelho -----------
      // A peca e ancorada no hips e NAO acompanha a flexao sozinha: se o loft
      // inteiro morasse aqui, ele atravessaria a canela na primeira corrida.
      // Entao o mesmo pano sai em duas malhas penduradas nas juntas certas, com
      // 3 cm de sobreposicao e a bola de joelho tapando a fresta da dobra.
      N.nasPernas(c, 'Upper', (sgn) => {
        const f = sgn * 0.7   // as duas pernas nao podem ter a MESMA prega
        return peca(lofte([
          { y: 0.034, r: 0.0595, ao: 0.20 },
          { y: -0.010, r: 0.0700, rip: 0.010, fase: f, ao: 0.14 },
          { y: -0.065, r: 0.0765, rip: 0.014, fase: f, ao: 0.05 },
          { y: -0.135, r: 0.0775, rip: 0.016, fase: f },
          { y: -0.210, r: 0.0755, rip: 0.016, fase: f },
          { y: -0.275, r: 0.0715, rip: 0.015, fase: f, ao: 0.04 },
          // dali pra baixo as secoes apertam: e onde o tecido dobra
          { y: -0.312, r: 0.0690, rip: 0.019, fase: f, ao: 0.07 },
          { y: -0.340, r: 0.0672, rip: 0.021, fase: f, ao: 0.09 },
          { y: -T + 0.030, r: 0.0662, rip: 0.020, fase: f, ao: 0.08 },
        ], SEG, { cor }), pano)
      })
      N.nasPernas(c, 'Lower', () => {
        const b = peca(joelhoLoft(0.0655, SEG, { ky: 0.88, cor, ao: 0.06 }), pano)
        return b
      })
      N.nasPernas(c, 'Lower', (sgn) => {
        const f = sgn * 0.7
        return peca(lofte([
          { y: 0, r: 0.0645, rip: 0.018, fase: f, ao: 0.10 },
          { y: -0.030, r: 0.0668, rip: 0.018, fase: f, ao: 0.06 },
          { y: -0.075, r: 0.0685, rip: 0.017, fase: f },      // batata da perna
          { y: -0.140, r: 0.0672, rip: 0.016, fase: f },
          { y: -0.205, r: 0.0648, rip: 0.015, fase: f },
          { y: -0.262, r: 0.0632, rip: 0.016, fase: f, ao: 0.05 },
          // o pano sobra em cima do punho e amontoa: secao densa de novo
          { y: -0.300, r: 0.0648, rip: 0.026, fase: f, dz: 0.004, ao: 0.09 },
          { y: -0.322, r: 0.0632, rip: 0.030, fase: f, dz: 0.004, ao: 0.12 },
          // PUNHO: lobos = 8 com seg = 16 cai uma amostra em cada crista e cada
          // vale — a canaleta do ribana sai limpa, sem serrilhado de amostragem
          { y: -0.342, r: 0.0625, rip: 0.030, lobos: 8, ao: 0.16 },
          { y: -0.368, r: 0.0632, rip: 0.030, lobos: 8, ao: 0.14 },
          { y: -S - 0.020, r: 0.0618, rip: 0.024, lobos: 8, ao: 0.20 },
        ], SEG, { cor }), pano)
      })

      // Bolso embutido: so a BOCA aparece, como em moletom de verdade. Sai do
      // perfil do quadril, entao a linha acompanha a curva do osso.
      for (const sgn of [1, -1]) {
        g.add(pespontoNoCorpo(c, liso, -0.030, 0.022, sgn * 1.05, 0.34, N.FOLGA_CALCA, 0.0035))
      }
      return g
    },
  },

  {
    id: 'cargo',
    nome: 'Bermuda cargo',
    metodo: 'camadas: base fina de cilindros abertos + paineis aplicados (bolsao com aba, faixa refletiva, barra dobrada pra fora, costura lateral revolvida)',
    // NAO ESCONDE NADA — e isso e a peca inteira, nao um esquecimento.
    //
    // A primeira versao apagava 'coxa'. So que 'esconde' apaga a COXA INTEIRA, e
    // a barra desta bermuda morre 3,2 cm ACIMA da junta do joelho: os ultimos
    // 3,2 cm de coxa ficam DE FORA do pano e apagados. O que sobrava ali era a
    // cupula da canela, que membroGeo levanta acima da junta — e ela nao e um
    // cilindro, e uma meia elipse de 3,24 cm de altura que fecha em BICO
    // exatamente na altura da barra. Medido, com raio de camera: logo abaixo da
    // barra a perna vestida tinha 2,5 cm de raio contra os 4,1 cm da perna nua,
    // e ia a zero na linha da barra. Le como uma bermuda pendurada num palito,
    // com 4 cm de vao ate o pano.
    // Com a coxa no lugar ela preenche a boca da barra (4,1 cm de perna dentro
    // de 8,3 cm de bainha) e continua por dentro do tubo em TODA a altura — o
    // tubo tem de 5 a 25 mm de folga sobre ela —, entao nao ha pele atravessando
    // pano em lugar nenhum. E o mesmo motivo pelo qual a camisa de botao nao
    // esconde nada: peca de borda aberta mostra a pele que esta debaixo dela.
    esconde: [],
    build(c) {
      const cor = c.cor.calca
      // A base e DoubleSide de proposito: ela e um cilindro ABERTO em cima e
      // embaixo (a barra dobrada precisa da boca livre) e casca aberta com face
      // unica deixa ver o mundo do outro lado do boneco pelo furo.
      const m = N.tecido2(cor, 0.90)
      const escuro = N.tecido(N.esc(cor, 0.74), 0.90)
      const escuro2 = N.tecido2(N.esc(cor, 0.74), 0.90)
      const nylon = N.tecido(N.esc(cor, 0.42), 0.75)
      // Refletiva: rugosidade baixa e um pingo de metalness — sem environment
      // map o que sobra e o especular do sol, que e exatamente a leitura de
      // faixa refletiva de longe.
      const refletiva = solid(0xd9e2ea, 0.22, 0.18)
      const g = new THREE.Group()
      const T = c.medida.THIGH
      const SEG = 16

      // A bermuda para 3,2 cm acima da junta do joelho: a capsula da canela
      // sobe ate 4,5 cm acima da junta, entao a perna continua INTEIRA por
      // dentro da barra. Parar no meio da coxa com 'coxa' escondida deixaria um
      // anel de nada entre o pano e o joelho.
      const Y_BARRA = -T + 0.032
      const R_TOPO = 0.0610   // mesmo teto do jeans: acima disso a tampa do
      const R_BARRA = 0.0835  // tubo sai pela lathe do quadril
      const rEm = (y) => R_TOPO + (R_BARRA - R_TOPO) * ((0.020 - y) / (0.020 - Y_BARRA))

      // --- camada 1: a base -------------------------------------------------
      g.add(N.cos(c, m, { y0: -0.042, y1: 0.066 }))
      N.nasPernas(c, 'Upper', () => peca(
        new THREE.CylinderGeometry(R_TOPO, R_BARRA, 0.020 - Y_BARRA, SEG, 1, true),
        m,
      ).translateY((0.020 + Y_BARRA) / 2))

      // --- camada 2: cinto de fita + fivela chata ---------------------------
      const yCinto = 0.046
      g.add(peca(N.casca(c, N.fatia(c.perfil.PELVIS, yCinto - 0.014, yCinto + 0.014), {
        folga: N.FOLGA_CINTO,
      }), nylon))
      const fiv = N.bloco(0.046, 0.032, 0.010, 0.008, N.metal(0x9aa1a8))
      fiv.position.set(0, yCinto, N.frenteZ(c, c.perfil.PELVIS, yCinto, N.FOLGA_CINTO, 0.005))
      g.add(fiv)
      const ponta = N.bloco(0.030, 0.020, 0.008, 0.005, nylon)
      ponta.position.set(-0.052, yCinto, N.frenteXZ(c, c.perfil.PELVIS, -0.052, yCinto, N.FOLGA_CINTO, 0.004))
      viraPraFora(ponta, -0.052, ponta.position.z, c.medida.FLAT_Z)
      g.add(ponta)

      // --- camada 3: os paineis da perna ------------------------------------
      N.nasPernas(c, 'Upper', (sgn) => {
        const p = new THREE.Group()
        const yB = -0.205
        const rB = rEm(yB)

        // BOLSAO CARGO. Tudo dele e escrito num grupo virado pro lado de
        // FORA da perna: assim os filhos ficam no sistema natural do painel (x
        // atravessa o bolso, y sobe, z aponta pra fora do corpo) e ninguem
        // precisa adivinhar pra onde a caixa aponta depois do giro. Escrever
        // cada peca ja girada foi o que deixou a aba deitada de lado na
        // primeira tentativa.
        const bolso = new THREE.Group()
        bolso.position.set(sgn * rB, yB, 0.004)
        bolso.rotation.y = sgn * Math.PI / 2

        // O corpo entra 2,5 cm no tubo e sobra 1,3 cm pra fora. Painel que so
        // ENCOSTA na superficie boia nos cantos: a 4,3 cm do meio o tubo ja
        // fugiu 1,5 cm pra dentro, e a quina do bolso ficava no ar.
        bolso.add(N.bloco(0.086, 0.104, 0.038, 0.016, m).translateZ(-0.006))
        // fole: as duas pregas verticais que fazem o bolso ENCHER em vez de
        // ficar chapado. E o que separa cargo de bolso de camisa.
        for (const lado of [1, -1]) {
          bolso.add(N.bloco(0.014, 0.098, 0.030, 0.006, escuro)
            .translateX(lado * 0.036).translateZ(-0.012))
        }
        // aba com caimento: o giro em X derruba a ponta pra fora, entao ela
        // le como pano pousado e nao como tampa colada
        const aba = N.bloco(0.094, 0.028, 0.040, 0.010, escuro)
        aba.position.set(0, 0.056, -0.002)
        aba.rotation.x = -0.13
        bolso.add(aba)
        const bt = N.malha(new THREE.CylinderGeometry(0.005, 0.005, 0.005, 6),
          N.metal(0x8a8f98), 0, 0.036, 0.016)
        bt.rotation.x = Math.PI / 2
        bolso.add(bt)
        p.add(bolso)

        // COSTURA LATERAL: setor de lathe em volta do EIXO DA PERNA, entao ela
        // desce acompanhando o afunilamento do tubo. Uma barrinha reta afundava
        // no meio e saia nas pontas.
        // (perfil de BAIXO PRA CIMA: escrito ao contrario a costura nascia com
        // a face virada pra dentro e sumia no culling)
        const ang = sgn > 0 ? Math.PI / 2 : -Math.PI / 2
        p.add(peca(N.revolver([
          [R_BARRA + 0.002, Y_BARRA + 0.004],
          [rEm(-0.15) + 0.002, -0.15],
          [R_TOPO + 0.002, 0.014],
        ], 3, 1, ang - 0.055, 0.11), escuro))

        // FAIXA REFLETIVA logo acima da barra: 1,4 cm de anel aberto, 1 mm por
        // fora do tubo. E o traco que faz a peca ser reconhecida de longe.
        const yF = Y_BARRA + 0.036
        p.add(peca(new THREE.CylinderGeometry(rEm(yF + 0.007) + 0.001, rEm(yF - 0.007) + 0.001,
          0.014, SEG, 1, true), refletiva).translateY(yF))

        // BARRA DOBRADA PRA FORA: um anel mais gordo que o tubo, virado pra
        // cima, com o avesso aparecendo por dentro (perfil descendo = face pra
        // dentro). E a bainha de bermuda de trabalho, e de quebra e ela que
        // fecha a boca do cilindro aberto da base.
        p.add(peca(N.revolver([
          [R_BARRA * 1.005, Y_BARRA],
          [R_BARRA * 1.055, Y_BARRA + 0.008],
          [R_BARRA * 1.050, Y_BARRA + 0.030],
        ], SEG), escuro))
        p.add(peca(N.revolver([
          [R_BARRA * 0.985, Y_BARRA + 0.030],
          [R_BARRA * 0.992, Y_BARRA + 0.006],
          [R_BARRA * 1.005, Y_BARRA],
        ], SEG), escuro2))
        return p
      })

      // --- camada 4: os paineis do quadril ----------------------------------
      for (const sgn of [1, -1]) {
        // bolso traseiro com aba (o cargo tem os dois)
        const x = sgn * 0.054, y = -0.006
        const z = -N.frenteXZ(c, c.perfil.PELVIS, x, y, N.FOLGA_CALCA, 0.0015)
        const b = N.bloco(0.070, 0.070, 0.016, 0.012, m)
        b.position.set(x, y, z)
        viraPraFora(b, x, z, c.medida.FLAT_Z)
        g.add(b)
        const ab = N.bloco(0.074, 0.024, 0.018, 0.007, escuro)
        ab.position.set(x, y + 0.034, z * 1.02)
        viraPraFora(ab, x, z, c.medida.FLAT_Z)
        g.add(ab)
        // bolso frontal de ziper: painel raso na frente da coxa
        const xf = sgn * 0.070, yf = -0.024
        const zf = N.frenteXZ(c, c.perfil.PELVIS, xf, yf, N.FOLGA_CALCA, 0.0015)
        const bf = N.bloco(0.052, 0.056, 0.014, 0.010, m)
        bf.position.set(xf, yf, zf)
        viraPraFora(bf, xf, zf, c.medida.FLAT_Z)
        g.add(bf)
        const zip = N.caixa(0.046, 0.006, 0.010, N.metal(0x9aa1a8))
        zip.position.set(xf, yf + 0.026, zf + 0.004)
        viraPraFora(zip, xf, zf, c.medida.FLAT_Z)
        g.add(zip)
      }
      g.add(passantes(c, escuro, yCinto, [0.9, -0.9, 2.5, -2.5]))
      return g
    },
  },
]

export default CALCAS
