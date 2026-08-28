import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import { soldarNormais, tecelagem } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/camisas.js — a aba CAMISAS (slot 'blusa', ancora torso).
//
// A queixa era literal: "parece um boneco sem vida feito de BLOCOS". O catalogo
// velho tinha 18 blusas e as 18 eram a MESMA funcao (troncoTecido + barra +
// gola) com outra cor; a peca inteira era uma superficie de revolucao lisa, e
// superficie lisa sem borda e sem espessura le como TINTA no corpo, nao como
// pano. Ficaram tres camisas e cada uma e construida por um metodo diferente —
// o dono pediu isso com todas as letras pra poder olhar as tres lado a lado e
// dizer qual combina com o jogo.
//
//   1 CAMISETA  — metodo A: CASCA REVOLVIDA COM VINCO.
//     Sai do perfil do corpo como sempre, mas depois cada vertice e empurrado
//     no raio por uma soma de gaussianas em (altura, angulo): duas dobras de
//     cintura e uma sob o braco. E o vinco que mata a leitura de "pintura".
//     Barra e gola sao DOBRAS de verdade (o perfil desce por dentro, vira e
//     sobe por fora), e a manga e um LOFT de elipses, nao uma lathe.
//
//   2 CAMISA DE BOTAO — metodo B: PAINEIS COSTURADOS.
//     Nao existe casca: existem paineis. Cada painel e uma grade (u, v) posta
//     na superficie do tronco, com o arco fixo e as bordas de CIMA e de BAIXO
//     dadas por curvas. E dai que sai o que lathe nenhuma faz: a barra de
//     fraldao (mais comprida na frente e nas costas, mais curta no lado), o
//     decote em V, o ombro estruturado (o painel engorda so na quina do ombro)
//     e a pala das costas. As emendas levam nervura abaulada mais escura.
//
//   3 MOLETOM — metodo C: DUPLA CASCA COM CAIMENTO.
//     Duas superficies, a de fora e a de dentro, costuradas na borda por meia
//     circunferencia. Isso da ESPESSURA: barra, punho e gola tem avesso
//     visivel. A casca de fora se afasta do corpo conforme desce (o caimento) e
//     volta a fechar na barra, que e canelada — a canelura e geometria, raio
//     modulado por cos(n*phi), nao textura.
//
// REGRAS QUE ESTE ARQUIVO SEGUE (as tres ja custaram bug):
//
// a) TETO DE RAIO. A casca de qualquer peca fica em FOLGA_LARGA no maximo, e
//    detalhe aplicado por cima (carcela, bolso, nervura, pala) para em
//    +5,5 mm sobre a casca. O colar nasce em perfil*FOLGA_LARGA +
//    SOBRA_ACESSORIO; passar disso enterra a corrente, que foi exatamente a
//    reclamacao antiga.
//
// b) TORSO_SEG. Toda casca que ENCOSTA na pele usa c.medida.TORSO_SEG. As
//    bandas caneladas usam 40/48 lados porque precisam de canelura, e por isso
//    elas sao FECHADAS (dupla parede) e engolem a borda da casca: nao existe
//    lugar onde um poligono de 24 lados encontre um de 48.
//
// c) PECA DO PEITO VAI DENTRO DE UM Group. animation.js infla a respiracao
//    escalando os MESHES filhos diretos de 'chest' (1,4% na largura). Peca de
//    peito montada como Mesh cru respira e a metade de baixo, que mora no
//    'torso', nao — e os dois pedacos se separam 1,8 mm na cintura. Dentro de
//    um Group o forno da respiracao nao acha o mesh e a emenda fica selada.
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2

// Detalhe aplicado (carcela, nervura, pala, bolso) nao passa disto por cima da
// casca. 1,045*r + 0,0055 fica 1,7 mm abaixo de 1,070*r + SOBRA_ACESSORIO, que
// e onde a corrente do colar mora — a margem que o depth buffer precisa a 30 m.
const RELEVO_MAX = 0.0055

// ---------------------------------------------------------------------------
// FERRAMENTAS DESTE ARQUIVO
// ---------------------------------------------------------------------------

/**
 * Reamostra um perfil GUARDANDO todos os pontos originais e enfiando
 * intermediarios a cada `passo`.
 *
 * O vinco precisa de tres ou quatro aneis dentro de uma dobra de 2 cm. Com os
 * 9 pontos crus do PELVIS a gaussiana caia inteira entre dois aneis: a dobra
 * nao aparecia, e onde aparecia era um degrau.
 */
function refinar(perfil, passo) {
  const out = [perfil[0]]
  for (let i = 1; i < perfil.length; i++) {
    const a = perfil[i - 1], b = perfil[i]
    const n = Math.max(1, Math.ceil(Math.abs(b[1] - a[1]) / passo))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

/** Perfil sintetico: n+1 aneis entre y0 e y1 com o raio saindo de rDe(y). */
function parede(y0, y1, n, rDe) {
  const p = []
  for (let k = 0; k <= n; k++) {
    const y = y0 + (y1 - y0) * (k / n)
    p.push([rDe(y), y])
  }
  return p
}

/** Interpolacao suave (smoothstep) numa tabela [[y, valor], ...] ordenada. */
function tabela(tab, y) {
  const n = tab.length
  if (y <= tab[0][0]) return tab[0][1]
  if (y >= tab[n - 1][0]) return tab[n - 1][1]
  for (let i = 1; i < n; i++) {
    if (y <= tab[i][0]) {
      const t = (y - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0])
      return tab[i - 1][1] + (tab[i][1] - tab[i - 1][1]) * t * t * (3 - 2 * t)
    }
  }
  return tab[n - 1][1]
}

function lathe(c, perfil, mat, seg) {
  return N.sh(new THREE.Mesh(
    N.revolver(perfil, seg || c.medida.TORSO_SEG, c.medida.FLAT_Z), mat,
  ))
}

/**
 * Costura duas paredes numa DOBRA — a peca passa a ter espessura na borda.
 *
 * `dentro` e a parede que morre na borda vindo de um lado, `fora` a que sai da
 * borda pro outro; entre a ultima ponta de uma e a primeira da outra entra meia
 * circunferencia. A barriga dessa meia circunferencia sai na PERPENDICULAR do
 * segmento que liga as duas pontas, e e por isso que o mesmo codigo serve pra
 * barra (que dobra pra baixo) e pra gola (que dobra pra cima) sem sinal
 * nenhum: a perpendicular ja aponta pro lado de fora da peca nos dois casos.
 *
 * A ORDEM IMPORTA e nao e cosmetica. LatheGeometry so gera face pra fora
 * quando o perfil anda com y CRESCENDO (conferido no indice do three: o
 * triangulo a,b,d de dois aneis consecutivos aponta pra fora nessa ordem).
 * Entao a parede que tem que olhar pro corpo entra com y decrescendo e a que
 * olha pra camera com y crescendo. Errar isso nao da buraco: da uma peca preta
 * que so acende quando a camera passa por dentro dela.
 */
function comEspessura(dentro, fora, bojo = 1, n = 4) {
  const a = dentro[dentro.length - 1], b = fora[0]
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2
  const ux = a[0] - cx, uy = a[1] - cy
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const m = Math.hypot(dx, dy) || 1
  const raio = Math.hypot(ux, uy) * bojo
  const vx = (dy / m) * raio, vy = (-dx / m) * raio
  const meio = []
  for (let k = 1; k < n; k++) {
    const t = (k / n) * Math.PI
    meio.push([cx + ux * Math.cos(t) + vx * Math.sin(t), cy + uy * Math.cos(t) + vy * Math.sin(t)])
  }
  return dentro.concat(meio, fora)
}

/**
 * VINCO: empurra cada vertice no proprio raio por uma soma de gaussianas em
 * altura, moduladas no angulo.
 *
 * O deslocamento e calculado a partir de atan2(x, z/flatZ), que da o MESMO
 * numero pras duas colunas duplicadas que a lathe deixa em phi = 0 — se
 * dependesse do indice do vertice, a costura da frente abriria uma fenda de
 * 3 mm bem no meio do peito.
 *
 * `yBase` existe porque a peca vive em duas juntas: a metade de baixo no
 * 'torso' e a de cima no 'chest', 0,30 m acima. As gaussianas sao escritas em
 * altura ABSOLUTA de torso e cada metade passa o proprio deslocamento, senao a
 * dobra que cruza a cintura sairia partida ao meio.
 */
function vincar(c, geo, yBase, dobras) {
  const flat = c.medida.FLAT_Z
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const zr = z / flat
    const r = Math.hypot(x, zr)
    if (r < 1e-5) continue
    const phi = Math.atan2(x, zr)
    const ya = y + yBase
    let d = 0
    for (const g of dobras) {
      const e = Math.exp(-((ya - g.y) * (ya - g.y)) / (2 * g.s * g.s))
      const mod = g.n ? 0.5 + 0.5 * Math.cos(g.n * phi + (g.p || 0)) : 1
      d += g.a * e * mod
    }
    const k = (r + d) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/**
 * CANELADO: modula o raio por cos(n*phi). E a canelura do punho e da barra do
 * moletom feita em GEOMETRIA — textura de canelura some a 4 m e a silhueta
 * continua um cilindro, que era metade da queixa de "bloco".
 *
 * O deslocamento e sempre NEGATIVO (o pico fica no raio original e o vale
 * afunda). Modular pros dois lados jogaria os picos acima de FOLGA_LARGA.
 */
function canelar(geo, n, amp, flat = 1) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const zr = z / flat
    const r = Math.hypot(x, zr)
    if (r < 1e-5) continue
    const phi = Math.atan2(x, zr)
    const k = (r - amp * (0.5 - 0.5 * Math.cos(n * phi))) / r
    pos.setXYZ(i, x * k, y, z * k)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/**
 * TEAR: acumulador de malha indexada COM uv. E o tecelagem() do rosto mais o
 * canal de textura.
 *
 * O uv nao esta em uso hoje (ver o bloco de materiais: estampa esta fora do
 * catalogo enquanto tex() precisar de <canvas>), mas ele custa dois floats por
 * vertice e sem ele um material com `map` pinta a peca INTEIRA com a cor de um
 * texel so — e a proxima pessoa que quiser xadrez neste painel nao vai
 * descobrir isso, vai so achar que a textura nao funciona.
 */
function tear() {
  const pos = [], uvs = [], idx = []
  return {
    v(x, y, z, u, w) { pos.push(x, y, z); uvs.push(u, w); return pos.length / 3 - 1 },
    tri(a, b, c) { idx.push(a, b, c) },
    quad(a, b, c, d) { idx.push(a, b, c, a, c, d) },
    geo() {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      g.setIndex(idx)
      g.computeVertexNormals()
      g.computeBoundingSphere()
      return g
    },
  }
}

/**
 * PAINEL: um pedaco de pano recortado, posto na superficie do tronco.
 *
 * O arco (phi0..phi1) e fixo, mas as bordas de cima e de baixo sao FUNCOES da
 * coluna: y0(u) e y1(u). E so isso que separa um painel de uma fatia de lathe,
 * e e o que a lathe nao consegue fazer de jeito nenhum — a barra de fraldao
 * (que cai 3,4 cm na frente e so 1,0 cm no lado) e o decote em V sao as duas
 * bordas curvas do mesmo retangulo de pano.
 *
 * `fora(u, v, y)` e o relevo local: e por ele que o ombro ganha estrutura sem
 * engordar a peca inteira.
 *
 * `vPot` ADENSA AS LINHAS EMBAIXO, e nao e enfeite — e a mesma correcao que
 * fatia() faz no nucleo. As linhas do painel eram distribuidas por igual entre
 * a borda de baixo e a de cima, e um painel que vai do fraldao (-0,034) ate o
 * peito (0,300) com 7 linhas anda 4,8 cm por linha. So que o perfil do quadril
 * ANDA 4 cm DE RAIO em 3,2 cm de altura (0,086 em -0,040 e 0,126 em -0,008): a
 * corda entre duas linhas passava POR DENTRO do vinco e o pano do fraldao
 * mergulhava 1 mm dentro da pele do quadril — pele por fora da camisa, medido.
 * Com v elevado a 2,2 as linhas se acumulam justamente na dobra do quadril e a
 * corda passa a 7 mm por fora da pele, sem custar linha nenhuma no peito, onde
 * o perfil e manso.
 */
function painel(c, perfil, o) {
  const nu = o.nu || 12, nv = o.nv || 8
  const vPot = o.vPot || 1
  const flat = c.medida.FLAT_Z
  const t = tear()
  const cols = []
  // uv proporcional ao TAMANHO REAL do painel (0.045 m por volta da textura):
  // com u e v indo sempre de 0 a 1, a mesma estampa sairia grossa no painel
  // pequeno e fina no grande, e as duas metades da mesma camisa nao pareceriam
  // o mesmo tecido.
  const rMed = N.raioPerfil(perfil, (o.y0(0.5) + o.y1(0.5)) / 2)
  const su = Math.abs(o.phi1 - o.phi0) * rMed / 0.045
  for (let i = 0; i <= nu; i++) {
    const u = i / nu
    const phi = o.phi0 + (o.phi1 - o.phi0) * u
    const s = Math.sin(phi), co = Math.cos(phi)
    const ya = o.y0(u), yb = o.y1(u)
    const sv = Math.abs(yb - ya) / 0.045
    const col = []
    for (let j = 0; j <= nv; j++) {
      const v = vPot === 1 ? j / nv : Math.pow(j / nv, vPot)
      const y = ya + (yb - ya) * v
      const rel = o.fora ? o.fora(u, v, y, phi) : 0.0010
      // O TETO DO RELEVO E APLICADO AQUI, e so na METADE DA FRENTE. E na frente
      // que a corrente e o pingente do colar descem (frentePeito(), no nucleo,
      // so e avaliado perto de x = 0), entao e so ali que engordar a peca
      // enterra o colar. Nas costas o relevo PRECISA passar do teto: e la que a
      // compensacao do dz do torax devolve os 5 mm que a elipse centrada da
      // casca nao tem. Clampar dos dois lados devolvia a pele por cima da
      // camisa na inspiracao.
      const r = N.raioPerfil(perfil, y) * o.folga
        + (Math.abs(phi) < 1.0 ? Math.min(rel, RELEVO_MAX) : rel)
      col.push(t.v(r * s, y, r * co * flat, u * su, v * sv))
    }
    cols.push(col)
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      t.quad(cols[i][j], cols[i + 1][j], cols[i + 1][j + 1], cols[i][j + 1])
    }
  }
  return t.geo()
}

/** Nervura de costura: painel estreito e ABAULADO (barriga no meio da largura),
 *  entao a emenda tem volume em vez de ser um adesivo chapado. */
function nervura(c, perfil, o) {
  return painel(c, perfil, {
    nu: 4, nv: o.nv || 8, folga: o.folga,
    phi0: o.phi - o.larg / 2, phi1: o.phi + o.larg / 2,
    y0: o.y0, y1: o.y1,
    fora: (u) => o.base + o.alt * Math.sin(u * Math.PI),
  })
}

/**
 * BOTAO — e a peca mais apertada do arquivo, espremida entre dois limites.
 *
 * POR BAIXO, a CARCELA: o botao tem que sobrar dela, senao a fileira vira uma
 * fileira de MEIAS-LUAS afundadas no pano (foi o que a foto de perto mostrou).
 * POR CIMA, o COLAR: N.botoes crava `fora = 0.010` na frenteZ, e 10 mm sobre
 * FOLGA_JUSTA passa 7 mm ALEM do raio de onde o pingente desce — com ele o
 * botao nascia por fora da corrente e a corrente entrava na camisa.
 *
 * A conta que sobra: o disco esta deitado, entao metade da espessura dele conta
 * em Z, e em RAIO isso vale (esp/2)/FLAT_Z = 1,6 mm. 3,8 + 1,6 = 5,4 mm, logo
 * abaixo de RELEVO_MAX, e 2,6 mm acima do topo da carcela (2,8 mm).
 */
const BOTAO_FORA = 0.0038
const BOTAO_ESP = 0.0024

function botoes(c, mat, perfil, folga, n, y0, y1, r = 0.0055) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? y0 : y0 + (y1 - y0) * (i / (n - 1))
    // cone rasissimo (r embaixo, 0.86 r em cima) em vez de cilindro: o disco
    // reto pega a luz de chapa e le como moeda colada no peito
    const b = N.malha(new THREE.CylinderGeometry(r * 0.86, r, BOTAO_ESP, 10), mat,
      0, y, N.frenteZ(c, perfil, y, folga, BOTAO_FORA))
    b.rotation.x = Math.PI / 2
    g.add(b)
  }
  return g
}

/**
 * LOFT: costura uma pilha de aneis. Cada anel e uma ELIPSE com centro proprio e
 * com o plano inclinado (dy varia com o angulo). E o que separa isto de uma
 * lathe: lathe so sabe girar UM perfil em volta de UM eixo, e por isso nao
 * consegue empurrar a boca da manga pra frente nem levantar a cabeca do ombro
 * so do lado de tras.
 *
 * Os aneis entram de baixo pra cima pelo mesmo motivo da comEspessura(): a
 * ordem e que decide pra que lado a face olha.
 */
function loft(aneis, cols = 16, apice) {
  const t = tecelagem()
  let ant = null
  for (const a of aneis) {
    const linha = []
    for (let i = 0; i < cols; i++) {
      const ang = (i / cols) * TAU
      const s = Math.sin(ang), co = Math.cos(ang)
      linha.push(t.v(
        (a.cx || 0) + a.r * s,
        a.y + (a.dy || 0) * co,
        (a.cz || 0) + a.r * (a.kz || 1) * co,
      ))
    }
    if (ant) for (let i = 0; i < cols; i++) t.quad(ant[i], ant[(i + 1) % cols], linha[(i + 1) % cols], linha[i])
    ant = linha
  }
  if (apice) {
    const p = t.v(apice.x || 0, apice.y, apice.z || 0)
    for (let i = 0; i < cols; i++) t.tri(ant[i], ant[(i + 1) % cols], p)
  }
  return t.geo()
}

// --- materiais -------------------------------------------------------------
// TUDO AQUI E MATERIAL LISO, DE PROPOSITO, e a diferenca de pano entre as tres
// camisas e feita em RUGOSIDADE e em geometria, nunca em textura.
//
// Nao e escolha estetica, e restricao: tex() de world/materials.js desenha num
// <canvas>, e o verificador de catalogo (e o tools/teste-aparencia.mjs) roda em
// node, onde nao existe `document`. Toda peca que chamasse listrasMat,
// xadrezMat ou floralMat derrubaria a verificacao com "document is not
// defined" antes de mostrar um triangulo. Enquanto o carregador de textura nao
// tiver um caminho sem DOM, estampa fica de fora do catalogo.
//
// solid() ja e cacheado por cor/rugosidade, entao nada aqui leva
// userData.owned: marcar como own faria a troca de roupa de UM jogador dar
// dispose num material que os outros 19 ainda estao usando.

// Algodao de camiseta: fosco, sem brilho de plastico.
const malhaMat = (cor) => solid(cor, 0.88, 0.0)
// Camisaria: 0,64 e a unica rugosidade do arquivo que devolve um vinco de luz
// na quina do ombro — e o que faz o painel ler como tecido passado a ferro e
// nao como o mesmo pano da camiseta noutra cor.
// DoubleSide porque painel nao tem espessura: pela cava, pelo decote e por
// baixo do fraldao se veria o avesso (face descartada pelo culling) e portanto
// o cenario do outro lado do boneco.
const camisariaMat = (cor) => solid(cor, 0.64, 0.0, { side: THREE.DoubleSide })
// Moletom: 0,98 e o teto util. Acima disso o specular some inteiro e a peca
// vira uma silhueta chapada nas sombras da cidade.
const feltroMat = (cor) => solid(cor, 0.98, 0.0)

// ---------------------------------------------------------------------------
// O CATALOGO
// ---------------------------------------------------------------------------

export const CAMISAS = [
  // 0 = nenhuma. O padrao da aparencia manda blusa = 1, entao o indice 1 e o
  // que o jogador ve primeiro e por isso e a peca mais neutra do catalogo.
  {
    id: 'nenhuma',
    nome: 'Sem camisa',
    metodo: 'ausencia: slot vazio, nenhuma pele escondida',
    build() { return null },
  },

  // =========================================================================
  // 1 — METODO A: CASCA REVOLVIDA COM VINCO
  // =========================================================================
  {
    id: 'camiseta',
    nome: 'Camiseta',
    metodo: 'A: casca revolvida do perfil do corpo + vinco por gaussiana em (altura, angulo); barra e gola sao dobras com espessura; manga e loft de elipses',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = N.FOLGA_JUSTA
      const base = c.cor.blusa
      const m = malhaMat(base)
      const mDobra = N.tecido(N.esc(base, 0.86), 0.88)
      const g = new THREE.Group()

      // As tres dobras. Altura ABSOLUTA de torso (o peito soma 0,30 por fora).
      //  - 0,085 e a bainha da camiseta subindo por cima do cos da calca: e a
      //    dobra que todo mundo tem e ninguem desenha;
      //  - 0,175 e a cintura, onde o pano sobra;
      //  - 0,415 (n = 2, fase pi) poe a barriga nos DOIS lados, na altura da
      //    axila, e nao na frente — na frente a camiseta cai reta.
      // Amplitude no maximo 2,8 mm: a folga entre pele (0,965) e pano (1,045)
      // e de 1,05 cm no peito, entao dobra pra dentro ate 3 mm ainda nao raspa.
      const dobras = [
        { y: 0.085, s: 0.024, a: 0.0028 },
        { y: 0.175, s: 0.030, a: -0.0022 },
        { y: 0.415, s: 0.030, a: 0.0026, n: 2, p: Math.PI },
      ]

      const baixo = N.casca(c, refinar(c.perfil.PELVIS, 0.014), { folga: f })
      g.add(N.sh(new THREE.Mesh(vincar(c, baixo, 0, dobras), m)))

      // A lathe do peito fecha em FECHA_PESCOCO: o perfil da pele para em
      // r = 0,074 e deixa 2 cm de buraco ate o pescoco, por onde se via o
      // cenario. O ponto de fecho entra DEPOIS do refinar pra nao virar rampa.
      const pPeito = refinar(N.fatia(c.perfil.PEITO, 0, 0.201), 0.014)
      pPeito.push([N.FECHA_PESCOCO / f, 0.205])
      const cima = N.casca(c, pPeito, { folga: f })
      const noPeito = new THREE.Group()
      noPeito.add(N.sh(new THREE.Mesh(vincar(c, cima, c.medida.CHEST_Y, dobras), m)))

      // BARRA com espessura. Desce por dentro (y caindo = face pro corpo),
      // vira num semicirculo de 2,4 mm de raio — a espessura do pano, que e o
      // que separa "camiseta" de "adesivo colado no boneco" — e sobe por fora.
      // A casca continua ABAIXO dela ate o fundo fechado do perfil do corpo: e
      // esse fundo que tapa a peca por baixo, e ele fica escondido dentro da
      // propria dobra.
      const rp = (y, e) => N.raioPerfil(c.perfil.PELVIS, y) * f + e
      g.add(lathe(c, comEspessura(
        [[rp(0.034, 0.0006), 0.034], [rp(-0.012, 0.0008), -0.012]],
        [[rp(-0.012, 0.0056), -0.012], [rp(0.008, 0.0058), 0.008], [rp(0.036, 0.0054), 0.036]],
      ), mDobra))

      // GOLA com espessura, mesma ideia virada pra cima (a perpendicular da
      // comEspessura ja joga a dobra pro lado certo sozinha). O topo para em
      // y = 0,204 mais 2,1 mm de bojo: a corrente do colar da a volta em
      // y = 0,217 do espaco do peito, entao gola e colar nunca se cruzam.
      const rc = (y, e) => N.raioPerfil(c.perfil.PEITO, y) * f + e
      noPeito.add(lathe(c, comEspessura(
        [[rc(0.158, 0.0052), 0.158], [rc(0.186, 0.0055), 0.186], [rc(0.204, 0.0048), 0.204]],
        [[rc(0.204, 0.0006), 0.204], [rc(0.186, 0.0008), 0.186], [rc(0.168, 0.0010), 0.168]],
      ), mDobra))
      c.montar(noPeito, 'chest')

      // MANGA: loft. Os aneis sao elipses (kz) com o centro andando pra frente
      // (cz) e o plano inclinado (dy), o que da a cabeca do ombro caida pra
      // tras. Termina numa bainha dobrada pra dentro — a manga curta antiga
      // acabava numa aresta de 0 mm e lia como corte de papel.
      const aneis = [
        { y: -0.086, r: 0.0520, cz: 0.001 },
        { y: -0.100, r: 0.0555, cz: 0.001 },
        { y: -0.107, r: 0.0592, cz: 0.001 },
        { y: -0.093, r: 0.0602, cz: 0.002, kz: 1.02 },
        { y: -0.062, r: 0.0572, cz: 0.003, kz: 1.04, dy: -0.002 },
        { y: -0.028, r: 0.0552, cz: 0.003, kz: 1.06, dy: -0.004 },
        // OS TRES ANEIS DE CIMA NAO SAO GOSTO. Eles copiam as ALTURAS de
        // SLEEVE_PROFILE (a manga curta do nucleo), que e o perfil sob o qual o
        // deltoide do corpo novo foi dimensionado, e sao mais gordos que ele em
        // Z de proposito.
        //
        // O deltoide e um elipsoide de 5,2 x 5,8 x 5,0 cm empurrado 8 mm pra
        // DENTRO do corpo: na cabeca do ombro ele e mais fundo (5,0 cm em z) do
        // que largo pra fora (5,2 - 0,8 = 4,4 cm em x). Uma manga de secao
        // redonda que cobre o deltoide em x nao cobre em z, e o que aparecia era
        // um TRIANGULO DE PELE na quina do ombro, na foto de tres quartos —
        // exatamente o defeito que esta reforma foi feita pra tirar. Por isso o
        // kz sobe pra 1,14 la em cima: e a elipse do anel que tapa o ombro, e e
        // ela que uma lathe nao consegue fazer.
        //
        // dy fica em zero nos dois ultimos aneis: 1 mm de inclinacao ali desce a
        // boca da manga pra uma altura onde o deltoide ja e 4 mm mais gordo.
        //
        // E O ANEL DE y = 0.030 NAO E ENFEITE. A cupula da manga nao pode
        // fechar em bico no primeiro anel que couber: o deltoide so volta pra
        // DENTRO da casca do torso em y = 0.029, e entre 0.021 e 0.029 ele
        // ainda sai 3,6 mm da casca. Fechando o leque de 0.021 direto pro
        // apice, o leque afinava mais rapido que o ombro e nascia uma MANCHA DE
        // PELE na quina — fotografada, era um respingo bege de meio centimetro
        // em cima da manga. Com o anel intermediario o leque so comeca onde o
        // deltoide ja esta coberto pelo torso.
        { y: -0.008, r: 0.0532, cz: 0.002, kz: 1.06, dy: -0.004 },
        { y: 0.008, r: 0.0458, cz: 0.002, kz: 1.08, dy: -0.002 },
        { y: 0.021, r: 0.0345, cz: 0.001, kz: 1.14 },
        { y: 0.030, r: 0.0250, cz: 0.001, kz: 1.22 },
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(aneis, 16, { y: 0.040 }), m)), lado)
      }
      return g
    },
  },

  // =========================================================================
  // 2 — METODO B: PAINEIS COSTURADOS
  // =========================================================================
  {
    id: 'alfaiate',
    nome: 'Camisa de botao',
    metodo: 'B: paineis de grade costurados (frente, costas, pala, mangas) com borda de cima e de baixo curvas — fraldao, decote em V e ombro estruturado — e nervura abaulada nas emendas',
    // NAO esconde nada, e e de proposito. Duas bordas desta peca sao ABERTAS:
    // o fraldao sobe 2,4 cm no lado do quadril e o decote abre um V na frente
    // do pescoco. Apagar 'torso' ou 'peito' poe um buraco exatamente nesses
    // dois lugares. Com a pele no lugar ela fica 8 mm por dentro do pano
    // (0,965 contra 1,045), nao aparece onde a camisa cobre, e tampa o que a
    // camisa deixa aberto — que e o que uma camisa aberta mostra mesmo.
    build(c) {
      const f = N.FOLGA_JUSTA
      const cor = N.esc(c.cor.blusa, 1.16)
      const pano = camisariaMat(cor)
      // A nervura e 12% mais escura que o pano, nao 26%: fotografado, o tom
      // antigo lia como fita adesiva preta colada no ombro, e nao como costura.
      const linha = N.tecido2(N.esc(cor, 0.88), 0.72)
      const madre = N.tecido(0xdcd4c2, 0.40)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // Arco dos paineis. Frente e costas se SOBREPOEM 0,09 rad de cada lado:
      // painel encostando em painel deixa uma fresta de 1 mm que pisca com a
      // camera, e a nervura de 0,16 rad cobre a sobreposicao inteira.
      const AF = 1.66
      const AC = Math.PI - 1.66
      /**
       * COMPENSACAO DO dz DO TORAX — a correcao mais importante desta peca.
       *
       * character.js empurra a secao do peito ate 4 mm pra TRAS (dzTronco) pra
       * a caixa toracica ter frente e costas, e ainda desenha a pele como
       * SUPERELIPSE de expoente 2,35, que estufa 5% nos quatro cantos. casca() e
       * painel() revolvem uma elipse simples e centrada: nas costas sobrava
       * 1,6 mm entre pele e pano. Como a respiracao infla o peito 1,4% (2 mm no
       * raio), a pele saia POR CIMA da camisa no auge de cada inspiracao.
       * Esta e a UNICA camisa do catalogo que nao esconde a pele do peito —
       * as outras duas apagam 'peito' e nem tomam conhecimento —, entao e a
       * unica que precisa devolver esses milimetros, e so onde eles somem: nas
       * costas (-cos phi) e na altura do arco costal (o mesmo sino do dzTronco).
       */
      const atras = (y, phi) => 0.0050 * Math.max(0, -Math.cos(phi))
        * Math.max(0, 1 - Math.abs(y - 0.10) / 0.11)
      const relevo = (u, v, y, phi) => {
        // OMBRO ESTRUTURADO: 3,0 mm a mais so na quina do ombro (|phi| ~ 1,22 e
        // acima do peitoral). E o unico jeito de a silhueta ter ombro sem
        // engordar a camisa inteira, que estouraria o teto do colar.
        const d = Math.abs(Math.abs(phi) - 1.22)
        const alto = Math.max(0, Math.min(1, (y - 0.120) / 0.055))
        return 0.0014 + atras(y, phi) + 0.0030 * Math.exp(-(d * d) / 0.10) * alto
      }
      // Fraldao: 3,4 cm abaixo no meio da frente/costas, 1,0 cm no lado.
      const fraldao = (u) => -0.034 + 0.024 * (1 + Math.cos(TAU * u)) / 2

      // nv/vPot: ver painel(). Estes dois sao os paineis que cruzam o vinco do
      // quadril, e sao os unicos do arquivo que PRECISAM das linhas adensadas
      // embaixo — com espacamento uniforme a corda cortava o vinco e o fraldao
      // afundava na pele.
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: -AF, phi1: AF, nu: 14, nv: 9, vPot: 2.2,
        y0: fraldao, y1: () => 0.300, fora: () => 0.0014,
      }), pano)))
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 14, nv: 9, vPot: 2.2,
        y0: (u) => fraldao(u + 0.5), y1: () => 0.300, fora: () => 0.0014,
      }), pano)))

      // Metade de cima: decote em V na frente (o painel para 2,2 cm mais baixo
      // no meio) e reto nas costas.
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -AF, phi1: AF, nu: 14, nv: 8,
        y0: () => 0, y1: (u) => 0.196 - 0.012 * (1 - Math.cos(TAU * u)) / 2,
        fora: relevo,
      }), pano)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: AC, phi1: TAU - AC, nu: 14, nv: 8,
        y0: () => 0, y1: () => 0.194, fora: relevo,
      }), pano)))

      // PALA das costas: o painel que da o ombro reto da camisaria. Vem 2,0 mm
      // por cima dos outros dois, entao a borda de baixo dela e uma sombra
      // horizontal atravessando as costas.
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: 0.98, phi1: TAU - 0.98, nu: 18, nv: 3,
        y0: (u) => 0.132 + 0.014 * Math.sin(u * Math.PI),
        y1: () => 0.194,
        fora: (u, v, y, phi) => relevo(u, v, y, phi) + 0.0012,
      }), pano)))

      // COSTURAS. Lateral: desce do fim da pala ate o fraldao, cobrindo a
      // sobreposicao dos paineis. Ombro: cruza a quina, que e onde a camisa de
      // verdade tem emenda.
      for (const sgn of [1, -1]) {
        g.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PELVIS, {
          folga: f, phi: sgn * Math.PI / 2, larg: 0.16, nv: 6,
          y0: () => -0.010, y1: () => 0.300, base: 0.0016, alt: 0.0022,
        }), linha)))
        noPeito.add(N.sh(new THREE.Mesh(nervura(c, c.perfil.PEITO, {
          folga: f, phi: sgn * Math.PI / 2, larg: 0.16, nv: 5,
          y0: () => 0, y1: () => 0.150, base: 0.0016, alt: 0.0022,
        }), linha)))
        // A costura do ombro e ABAULADA na largura (o seno em v), igual a
        // nervura da lateral. Chapada, ela virava um retangulo escuro flutuando
        // no ombro — dava pra ver na foto de perto.
        noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
          folga: f, phi0: sgn * 1.00, phi1: sgn * 1.60, nu: 8, nv: 3,
          y0: (u) => 0.152 + 0.012 * u, y1: (u) => 0.162 + 0.012 * u,
          fora: (u, v, y, phi) => relevo(u, v, y, phi) + 0.0006 + 0.0016 * Math.sin(v * Math.PI),
        }), linha)))
      }

      // CARCELA: a tira dobrada onde moram os botoes. Duas metades porque a
      // peca vive em duas juntas.
      // A CARCELA TEM TETO DE 2,8 mm, e quem manda nisso e o botao. O botao e um
      // disco chapado a 3,8 mm com 1,2 mm de espessura, o que da 5,4 mm de raio
      // contando o achatamento em Z; carcela mais alta que isso enterra o botao
      // pela metade, e era exatamente assim que a foto de perto mostrava a
      // camisa: uma fileira de meias-luas.
      g.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PELVIS, {
        folga: f, phi0: -0.155, phi1: 0.155, nu: 5, nv: 8, vPot: 2.2,
        y0: () => -0.030, y1: () => 0.300,
        fora: (u) => 0.0016 + 0.0012 * Math.sin(u * Math.PI),
      }), pano)))
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: -0.155, phi1: 0.155, nu: 5, nv: 5,
        y0: () => 0, y1: () => 0.186,
        fora: (u) => 0.0016 + 0.0012 * Math.sin(u * Math.PI),
      }), pano)))
      g.add(botoes(c, madre, c.perfil.PELVIS, f, 3, 0.060, 0.260))
      // O botao de cima para em 0.130 e nao la em cima na gola: acima disso o
      // torax afina rapido, e o disco e CHAPADO (o z dele sai da altura do
      // centro). A BORDA dele, 5,5 mm acima, cai numa altura onde o corpo ja e
      // 2 mm mais fino — e era a borda, nao o centro, que passava do raio de
      // onde o pingente do colar desce.
      noPeito.add(botoes(c, madre, c.perfil.PEITO, f, 3, 0.026, 0.130))

      // BOLSO chapado com pala, no peito esquerdo (o +X do boneco). Painel
      // tambem: bolso feito de caixa boiava, porque a secao do torso e elipse e
      // nao circulo.
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: 0.40, phi1: 0.80, nu: 5, nv: 4,
        y0: () => 0.058, y1: () => 0.112, fora: () => 0.0038,
      }), pano)))
      // A PALA DO BOLSO E DO MESMO PANO. Escura, ela lia como um retangulo
      // preto colado no peito; o que separa a pala do bolso e a sombra propria
      // dela (1,2 mm de degrau), nao a cor.
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: 0.38, phi1: 0.82, nu: 5, nv: 2,
        y0: () => 0.104, y1: () => 0.121, fora: () => 0.0050,
      }), pano)))

      // COLARINHO: pe de gola no pescoco (cilindro, e nao lathe achatada — o
      // pescoco e redondo) e a folha caindo por cima dos ombros, aberta num V
      // na frente.
      // O CONE DO PE E CALIBRADO PELA CORRENTE, nao pelo desenho: na altura em
      // que o colar da a volta (y = 0.052 no espaco do pescoco) ele esta em
      // 0.0544, logo abaixo de RAIO_GOLA_ALTA (0.0555), que e o raio a partir do
      // qual todo colar do catalogo e construido. Engordar o pe aqui enterra a
      // corrente de todo mundo.
      const pe = N.tubo(0.0525, 0.0560, 0.048, pano, 16)
      pe.position.y = 0.054
      c.montar(pe, 'neck')
      noPeito.add(N.sh(new THREE.Mesh(painel(c, c.perfil.PEITO, {
        folga: f, phi0: 0.44, phi1: TAU - 0.44, nu: 22, nv: 3,
        y0: (u) => 0.164 - 0.010 * Math.sin(u * Math.PI),
        y1: () => 0.208,
        // a folha AFASTA do corpo conforme desce: e o que faz ela ler como
        // aba caida e nao como faixa colada no pescoco
        fora: (u, v) => 0.0008 + 0.0044 * (1 - v),
      }), pano)))
      c.montar(noPeito, 'chest')

      // MANGA: tubo de painel com a bainha ENROLADA PRA FORA (a manga dobrada
      // do jeito que se dobra de verdade), e nao uma bainha virada pra dentro.
      // Fecha em apice acima do ombro pra morrer dentro do tronco.
      const mg = [
        { y: -0.058, r: 0.0555 },
        { y: -0.084, r: 0.0585 },
        { y: -0.096, r: 0.0620 },
        { y: -0.090, r: 0.0655 },
        { y: -0.062, r: 0.0640 },
        { y: -0.052, r: 0.0570 },
        { y: -0.030, r: 0.0552 },
        // Mesmo motivo da camiseta, e a mesma correcao: as alturas sao as de
        // SLEEVE_PROFILE e o kz abre a secao em Z na cabeca do ombro, porque o
        // deltoide e mais FUNDO do que largo e escapava pela quina da manga.
        { y: -0.008, r: 0.0530, kz: 1.04 },
        { y: 0.008, r: 0.0456, kz: 1.08 },
        { y: 0.021, r: 0.0345, kz: 1.14 },
        { y: 0.030, r: 0.0250, kz: 1.22 },
      ]
      for (const lado of ['armRUpper', 'armLUpper']) {
        c.montar(N.sh(new THREE.Mesh(loft(mg, 16, { y: 0.040 }), pano)), lado)
      }
      return g
    },
  },

  // =========================================================================
  // 3 — METODO C: DUPLA CASCA COM CAIMENTO
  // =========================================================================
  {
    id: 'moletom',
    nome: 'Moletom',
    metodo: 'C: dupla casca (externa + interna costuradas na borda) com caimento tabelado por altura, onda de baixa frequencia na barra e canelado geometrico em barra, gola e punho',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const cor = N.esc(c.cor.blusa, 0.82)
      const m = feltroMat(cor)
      const mDentro = N.tecido(N.esc(cor, 0.62), 0.98)
      const mRib = N.tecido(N.esc(cor, 0.88), 0.98)
      const g = new THREE.Group()
      const noPeito = new THREE.Group()

      // CAIMENTO. Folga por altura absoluta de torso: colada no ombro, cheia no
      // quadril e recolhida de novo na barra, que e onde a canelura puxa. Nunca
      // passa de FOLGA_LARGA, que e o teto do catalogo — o colar e calibrado
      // nele e uma peca mais gorda enterraria a corrente.
      // O 1,030 la embaixo NAO e enfeite: a barra canelada tem que ficar por
      // FORA da casca inclusive no FUNDO da canelura (2,2 mm), e com a casca
      // em 1,052 na altura da banda o vale da canelura passava 0,8 mm por
      // dentro dela — o moletom aparecia listrado de si mesmo. Com a casca
      // recolhida a 1,030 e a banda em 1,070 sobra 2 mm ate no vale, e de
      // quebra e assim que moletom cai de verdade: o corpo blusa e a barra
      // segura.
      const CAI = [
        [0.034, 1.030], [0.062, 1.058], [0.090, 1.070], [0.150, 1.066],
        [0.300, 1.058], [0.400, 1.048], [0.455, 1.044], [0.480, 1.026],
      ]
      // Onda de baixa frequencia: 5 barrigas em volta da barra, so pra DENTRO
      // (o pico fica no raio da tabela). Some acima de 0,17 pra casca voltar a
      // ser lisa no peito, e some abaixo de 0,045 pra nao brigar com a banda
      // canelada, que e um poligono de 40 lados e nao de 24.
      const onda = (ya, phi) => {
        const j = Math.max(0, Math.min(1, (ya - 0.045) / 0.030))
        const k = Math.max(0, Math.min(1, (0.170 - ya) / 0.060))
        return -0.0034 * j * k * (0.5 - 0.5 * Math.cos(5 * phi))
      }
      const esp = (ya) => 0.0062 - 0.0016 * Math.max(0, Math.min(1, (ya - 0.30) / 0.20))

      // A casca de fora nasce lisa (revolucao) e a onda entra depois, por
      // vertice — a onda depende do ANGULO e lathe nenhuma sabe disso.
      //
      // `base` NAO E OPCIONAL. A tabela de caimento e escrita em altura
      // ABSOLUTA de torso, e a metade de cima da peca vive no 'chest', 0,30 m
      // acima: sem somar a base, a casca do peito lia a tabela pela altura do
      // QUADRIL e nascia em 1,030 onde a de baixo terminava em 1,058. O
      // resultado era um degrau de 3,6 mm dando a volta na cintura, visivel na
      // foto como uma linha atravessando o peito.
      const rFora = (perfil, base) => (y) => N.raioPerfil(perfil, y) * tabela(CAI, y + base)
      const rDentro = (perfil, base) => (y) => N.raioPerfil(perfil, y) * tabela(CAI, y + base) - esp(y + base)

      const ondular = (geo, base) => {
        const flat = c.medida.FLAT_Z
        const pos = geo.attributes.position
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
          const zr = z / flat
          const r = Math.hypot(x, zr)
          if (r < 1e-5) continue
          const k = (r + onda(y + base, Math.atan2(x, zr))) / r
          pos.setXYZ(i, x * k, y, z * k)
        }
        pos.needsUpdate = true
        geo.computeVertexNormals()
        soldarNormais(geo)
        return geo
      }

      // Tronco. A parede de dentro entra com y DECRESCENDO pra face olhar pro
      // corpo; a de fora com y crescendo. Ver comEspessura().
      // 16 degraus na parede de fora e 12 na de dentro: e a de fora que carrega
      // o caimento, e com 13 aneis a rampa de 1,030 pra 1,070 (que acontece em
      // 5,6 cm) caia em dois passos so e o blusao ganhava uma quina na altura
      // do quadril. A de dentro ninguem ve de perto.
      const pTorso = parede(0.034, 0.300, 16, rFora(c.perfil.PELVIS, 0))
      g.add(N.sh(new THREE.Mesh(ondular(N.revolver(
        pTorso, c.medida.TORSO_SEG, c.medida.FLAT_Z), 0), m)))
      g.add(lathe(c, parede(0.300, 0.034, 12, rDentro(c.perfil.PELVIS, 0)), mDentro))

      // A casca do peito MORRE EM 0.170 e nao la em cima no decote, e os dois
      // ultimos degraus da tabela de caimento RECOLHEM ela (1,026) na mesma
      // altura. Sem as duas coisas juntas a gola nao consegue engolir a borda:
      // ela precisa afunilar ate 6 cm em dois centimetros e meio, entao desce
      // em raio muito mais rapido que a casca e as duas se cruzavam por volta
      // de y = 0.174 — dali pra cima era a CASCA que aparecia por fora da
      // gola, com a borda crua dela exposta. Recolhida, a casca entra na gola
      // como o corpo do moletom entra no punho.
      const pPeito = parede(0, 0.170, 7, rFora(c.perfil.PEITO, c.medida.CHEST_Y))
      noPeito.add(N.sh(new THREE.Mesh(ondular(N.revolver(
        pPeito, c.medida.TORSO_SEG, c.medida.FLAT_Z), c.medida.CHEST_Y), m)))
      noPeito.add(lathe(c, parede(0.170, 0, 7, rDentro(c.perfil.PEITO, c.medida.CHEST_Y)), mDentro))

      // BARRA CANELADA: banda FECHADA (desce por dentro, vira, sobe por fora) de
      // 40 lados. Ela engole as duas bordas da casca de 24 lados — e por isso
      // que a diferenca de numero de lados nao serrilha em lugar nenhum: os dois
      // poligonos nunca se encontram na mesma aresta.
      const rq = (y, k) => N.raioPerfil(c.perfil.PELVIS, y) * k
      const barra = N.revolver(comEspessura(
        [[rq(0.040, 1.012), 0.040], [rq(-0.026, 1.014), -0.026]],
        [[rq(-0.026, 1.040), -0.026], [rq(-0.004, 1.062), -0.004],
          [rq(0.020, 1.070), 0.020], [rq(0.042, 1.062), 0.042]],
      ), 40, c.medida.FLAT_Z)
      g.add(N.sh(new THREE.Mesh(canelar(barra, 10, 0.0022, c.medida.FLAT_Z), mRib)))

      // GOLA CANELADA: mesma banda virada pra cima. A parede de dentro desce
      // ate encontrar a casca interna e e ELA que fecha o decote — sem isso o
      // buraco do pescoco daria vista pro chao pelo lado de dentro do boneco.
      const rg = (y, k, e) => N.raioPerfil(c.perfil.PEITO, y) * k + (e || 0)
      const gola = N.revolver(comEspessura(
        // Parede de FORA, subindo. Ela acompanha o PERFIL DO CORPO em 1,062
        // ate 0.178 (nao desce em linha reta pro pescoco: reta cruzaria a
        // casca) e so entao afunila. O topo para em y = 0.202 mais 2,2 mm de
        // dobra — 1 cm ABAIXO da altura onde a corrente do colar da a volta no
        // pescoco (0.212 no espaco do peito), entao gola e colar nunca se
        // encontram.
        //
        // O 0,0710 DO TOPO E CONTA, NAO GOSTO, e a conta e a do ACHATAMENTO.
        // Esta lathe e revolvida com FLAT_Z (0,76), que e o achatamento do
        // TRONCO — ela precisa dele embaixo pra engolir a borda da casca. Mas o
        // PESCOCO e achatado por 0,90: em y = 0.202 ele tem 55,2 mm em x e
        // 49,7 mm em z. Com os 64 mm da primeira versao a gola saia com
        // 64 x 0,76 = 48,6 mm em z, ou seja, 1,1 mm POR DENTRO da pele do
        // pescoco — e a pele aparecia atravessando a gola bem na frente e bem
        // nas costas, que sao as duas direcoes que a camera mais ve (medido:
        // 1,7 mm de pescoco por fora do pano). Raio escrito na mao contra o
        // pescoco e o erro numero 1 do CONTRATO. 71 mm da 54 mm em z (4,3 mm de
        // folga, sobrando ate no vale do canelado) e continua abaixo dos 85 mm
        // de FOLGA_LARGA nessa altura.
        [[rg(0.156, 1.062, 0.0012), 0.156], [rg(0.178, 1.062, 0.0012), 0.178],
          [rg(0.192, 1.030, 0.0010), 0.192], [0.0710, 0.202]],
        // Parede de DENTRO, descendo: e ela que fecha o decote, indo do
        // pescoco ate POR DENTRO da casca interna. Sem esse funil o buraco da
        // gola dava vista pro miolo do boneco. 0,995 do perfil na ponta de
        // baixo garante que ela passe por dentro da casca e nao por fora.
        // 66 mm no topo (50,2 mm em z) mantem a espessura de 5 mm da dobra e
        // ainda passa por FORA do pescoco: assim o funil inteiro fica visivel
        // por dentro da gola em vez de ser cortado pela pele.
        [[0.0660, 0.202], [0.0800, 0.190], [0.1030, 0.176], [rg(0.156, 0.995, 0), 0.156]],
        0.9,
      ), 32, c.medida.FLAT_Z)
      noPeito.add(N.sh(new THREE.Mesh(canelar(gola, 8, 0.0016, c.medida.FLAT_Z), mRib)))
      c.montar(noPeito, 'chest')

      // FUNDO. Esta peca apaga a pele do tronco, e era a pele do tronco que
      // fechava o boneco por baixo, entre as coxas (o perfil do corpo termina
      // num fundo de 2 cm de raio). A dupla casca e um TUBO: sem tampa, quem
      // olha de baixo pra cima ve o miolo do boneco. A tampa e o PROPRIO fundo
      // do perfil do corpo, na ordem natural dele — que e a unica ordem em que
      // a face olha pra BAIXO — e para em 1,016 do perfil: fica presa dentro da
      // dobra da barra canelada e ainda passa por dentro do cos da calca
      // (FOLGA_CALCA = 1,020), sem piscar contra ele.
      g.add(lathe(c, N.fatia(c.perfil.PELVIS, -0.048, -0.026)
        .map((p) => [p[0] * 1.016, p[1]]), mDentro))

      // Mangas: as do nucleo, porque a BOLA DO COTOVELO delas resolve um bug
      // que nada aqui resolveria — os dois tubos moram em juntas diferentes e
      // abrem uma fresta quando o braco dobra, e por ela aparecia a bola de
      // PELE do cotovelo, que nenhum 'esconde' apaga.
      N.mangaLonga(c, m, { r: 0.058 })

      // PUNHO CANELADO: a mesma dupla parede, agora no espaco do antebraco (sem
      // achatamento — o braco e redondo).
      //
      // Os multiplicadores saem do TUBO DA MANGA, nao do gosto. mangaLonga
      // afina o antebraco de 0,97r ate MANGA_R_PUNHO, entao 3,8 cm acima do fim
      // ele ainda tem 1,034 de MANGA_R_PUNHO — mais gordo que a borda de cima
      // do punho na primeira tentativa. Resultado: a ponta do tubo aparecia
      // pelo VALE da canelura, e o punho ficava rasgado de listra. A parede de
      // fora comeca em 1,10 (1,5 mm de sobra ate no vale) e a de dentro em 1,00,
      // que passa por dentro do tubo e ainda sobra 1,7 cm ate a pele do pulso.
      const rp = N.MANGA_R_PUNHO
      const yf = -(c.medida.FORE_ARM - N.MANGA_FIM_Y)
      for (const s of ['R', 'L']) {
        const p = N.revolver(comEspessura(
          [[rp * 1.00, yf + 0.040], [rp * 1.02, yf - 0.001]],
          [[rp * 1.10, yf - 0.001], [rp * 1.13, yf + 0.016], [rp * 1.10, yf + 0.040]],
        ), 24, 1)
        c.montar(N.sh(new THREE.Mesh(canelar(p, 6, 0.0016, 1), mRib)), 'arm' + s + 'Lower')
      }
      return g
    },
  },
]

export default CAMISAS
