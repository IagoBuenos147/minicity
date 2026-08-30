import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/calcas-extra.js — 10 pecas NOVAS pra somar ao catalogo de
// CALCAS (calcas.js continua com jeans/jogger/cargo intactos; a fiacao dos
// dois arquivos num catalogo so e feita por fora, nao aqui).
//
// O pedido: pelo menos 10 pecas, pelo menos 3 bermudas, "combinando" com as 10
// camisas que outro agente fez em paralelo (regata, polo, flanela xadrez,
// corta-vento, havaiana, camisa de time, sueter de trico, jaqueta jeans,
// camiseta oversized, colete acolchoado) — ou seja, cobrir o guarda-roupa
// casual/esportivo/social que aquelas camisas pedem, e nao dez variacoes do
// mesmo corte.
//
// TRES GRUPOS DE CONSTRUCAO (a mesma logica de calcas.js: metodo por familia,
// silhueta por peca):
//
//   GRUPO A — TUBO POR PERNA (a familia do jeans do catalogo base): coxa e
//   canela sao dois N.pernas() tapeados diferente por peca, e o que muda de
//   uma pra outra e o CONTORNO (reto, justo, afunilado) e o acabamento da
//   barra (virada, dobrada, rasgada). 5 pecas: skinny, alfaiataria, chino,
//   rasgada, couro.
//
//   GRUPO B — LOFT CONTINUO (a familia do jogger): pano varrido por secoes do
//   quadril ao tornozelo, com punho CANELADO de verdade (raio ondulado por
//   cos(n*phi), geometria e nao textura). 2 pecas: moletom-calca, track.
//
//   GRUPO C — TUBO CURTO SEM CANELA (a familia da bermuda cargo do catalogo
//   base): so a coxa, parando bem acima do joelho. Nenhuma delas esconde
//   'coxa' — a mesma razao documentada na bermuda cargo original: 'esconde'
//   apaga a COXA INTEIRA, e a cupula da canela so cobre a articulacao, nao a
//   coxa nua; apagar a coxa deixava a perna real sumida entre a barra e o
//   joelho. Aqui a perna de verdade continua por baixo/depois da barra, com
//   folga de sobra (ver R_HEM de cada uma). 3 pecas: bermuda-jeans,
//   bermuda-praia, bermuda-cargo.
//
// AS TRES REGRAS DE camisas.js, TRADUZIDAS PRA PERNA (custaram bug la, valem
// bug aqui se ignoradas):
//
// a) TETO DE RAIO. Em camisas.js e a casca do tronco travada em FOLGA_LARGA.
//    Na perna o teto e OUTRO E JA MEDIDO: R_TOPO = 0.0610 no topo do tubo
//    (y = 0.020), porque dali pra cima mora dentro do N.cos() e qualquer coisa
//    mais gorda empurra a tampa do cilindro pra fora da lathe do quadril (vira
//    a "prateleira horizontal" que o comentario de calcas.js documenta). E na
//    outra ponta, R_FORA_DO_CANO = 0.060 e o piso: barra de calca comprida
//    mais fina que isso deixa o colarinho do sapato atravessar o tecido.
//    Repetido aqui porque calcas.js NAO exporta as constantes — sao os MESMOS
//    numeros, redefinidos.
//
// b) SEGMENTACAO. calcas.js usa seg=14 (o default de N.tubo/N.pernas) pra
//    tubo liso e seg=16 no loft do jogger, com lobos=8 pro punho canelado
//    (16 = 2x8, uma amostra por crista e por vale — sem isso o canelado sai
//    serrilhado). Aqui: os 5 tubos do Grupo A usam o default de N.pernas
//    (nunca escolhido a dedo, e o mesmo do jeans). O Grupo B usa seg=16-18
//    sempre em multiplo de 2x o numero de lobos do trecho canelado.
//
// c) GROUP. Em camisas.js e pra respiracao (so os MESHES filhos diretos de
//    'chest' inflam). Perna nao respira — ela GIRA na junta (animation.js
//    mexe em legXUpper.rx/rz e legXLower.rx, a junta inteira, nunca um mesh
//    filho por escala) — e a traducao da regra aqui e outra: NENHUM detalhe
//    pode atravessar o joelho. Toda peca de canela vai por
//    N.nasPernas(c,'Lower',...), toda peca de coxa por
//    N.nasPernas(c,'Upper',...), nunca uma so peca esticada entre as duas, ou
//    a calca fica parada no ar (ou rasga na textura) no primeiro passo. Os
//    detalhes compostos (bolso, punho, rasgo) ainda assim vao dentro de um
//    THREE.Group cada, so por organizacao — no padrao que cargo.js ja usa.
// ---------------------------------------------------------------------------

/** Ver a nota (a) acima: mesmo numero de calcas.js, redefinido (nao exportado la). */
const R_TOPO = 0.0610
/** Ver a nota (a) acima: piso da barra de calca comprida sobre o colarinho do sapato. */
const R_FORA_DO_CANO = 0.060
/** Linha ocre: mesma leitura de pesponto de jeans que calcas.js usa. */
const LINHA_JEANS = 0xd7ab63

// ---------------------------------------------------------------------------
// IDENTIDADE DE TECIDO — cores FIXAS, que NAO derivam de c.cor.calca.
//
// O MESMO DEFEITO das camisas, do lado das pernas: as 10 pecas so pintavam
// c.cor.calca (a UNICA cor que o jogador escolhe pra calca) em tudo, e como
// as pecas foram desenhadas pra combinar com as 10 camisas (ver o cabecalho
// do arquivo), skinny/rasgada/bermuda-jeans/alfaiataria/moletom-calca saiam
// todas do mesmo tom generico em vez de ler como os tecidos que dizem ser.
// c.cor.calca CONTINUA mandando nas pecas que realmente vem em qualquer cor
// (chino, couro, track, bermuda cargo/praia) — so as que tem identidade de
// tecido fixa na vida real (jeans e sempre azul, alfaiataria e sempre um
// tecido escuro liso, moletom e sempre cinza mescla) passam a ignorar a
// escolha do jogador, o mesmo criterio de camisas-extra.js.
const AZUL_JEANS = 0x4a6d94        // skinny, rasgada, bermuda-jeans — o
// MESMO azul da jaqueta jeans em camisas-extra.js (constante independente,
// mesmo valor de proposito: jeans com jeans combina se o jogador usar as
// duas pecas juntas).
const ALFAIATARIA_ESCURO = 0x2a2d35 // calca de alfaiataria — tecido escuro liso
const CINZA_MESCLA = 0x8b8d93       // calca de moletom — cinza mescla
const PRAIA_ESTAMPA = 0xe2703f      // bermuda de praia: painel lateral coral...
const PRAIA_ESTAMPA_2 = 0xf0ece0    // ...cruzado com um filete quase-branco

/** Atalho: mesh com sombra ligada (o mesmo 'peca' que calcas.js define). */
function peca(geo, mat) { return N.sh(new THREE.Mesh(geo, mat)) }

/** Deita um painel na superficie da perna (raio simples: a perna E' redonda,
 *  ao contrario do tronco, entao aqui nao existe achatamento por FLAT_Z). */
function viraPraFora(m, x, z) {
  m.rotation.y = Math.atan2(x, z)
  return m
}

// ===========================================================================
// GRUPO B — ferramenta de loft (copiada de calcas.js: nao e exportada de la,
// e as pecas B precisam dela do mesmo jeito que o jogger precisa).
// ===========================================================================

/** Superficie varrida por SECOES — ver o comentario extenso da mesma funcao
 *  em calcas.js. Resumo: `rip`/`lobos` ondulam o raio (canaleta do punho),
 *  `ao` escurece em cor de vertice, a volta fecha por INDICE (sem coluna
 *  duplicada, sem emenda pra soldar). */
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

/** Bola de junta pro loft (mesma razao da bola de joelho do jeans: preenche a
 *  fresta que Upper/Lower abrem ao dobrar). Copiada de calcas.js. */
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
// FERRAMENTAS COMPARTILHADAS (Grupo A + C) — tambem copiadas/adaptadas de
// calcas.js pelo mesmo motivo: nao sao exportadas de la.
// ===========================================================================

/** Vinco em anel: usado no chino (joelho macio) e como base pro rebordo do
 *  rasgo do joelho rasgado. */
function dobra(r, y, alt, saliencia, mat, seg = 14) {
  return peca(N.revolver([
    [r - 0.0015, y - alt],
    [r + saliencia, y - alt * 0.30],
    [r + saliencia * 0.5, y + alt * 0.40],
    [r - 0.0015, y + alt],
  ], seg), mat)
}

/** Boca com espessura e avesso — identica a de calcas.js (fora desce, dentro
 *  sobe, as duas se encontram na quina). Usada por alfaiataria/chino/couro. */
function boca(r, y, mat, matAvesso, seg = 14) {
  const g = new THREE.Group()
  const alt = 0.034
  g.add(peca(N.revolver([
    [r * 1.010, y],
    [r * 1.028, y + 0.007],
    [r * 1.024, y + alt * 0.55],
    [r * 0.998, y + alt],
  ], seg), mat))
  g.add(peca(N.revolver([
    [r * 0.980, y + alt],
    [r * 0.988, y + 0.006],
    [r * 1.010, y],
  ], seg), matAvesso))
  return g
}

/** Pesponto que acompanha o perfil do quadril (bolso, carcela, passante). */
function pespontoNoCorpo(c, mat, y0, y1, angulo, arco, folga, fora = 0.0025) {
  return peca(N.casca(c, N.fatia(c.perfil.PELVIS, y0, y1), {
    folga, extra: fora, seg: 4, phi0: angulo - arco / 2, phiLen: arco,
  }), mat)
}

function passantes(c, mat, y, angulos) {
  const g = new THREE.Group()
  for (const a of angulos) {
    g.add(pespontoNoCorpo(c, mat, y - 0.017, y + 0.014, a, 0.11, N.FOLGA_CINTO, 0.0055))
  }
  return g
}

/**
 * NOVO: costura/vinco VERTICAL sobre um tubo de perna que afina. Nao existe
 * em calcas.js porque nenhuma das tres pecas de la precisava de uma linha que
 * corre ao LONGO da perna (so em volta dela). E o que falta pro vinco de
 * alfaiataria, a faixa lateral do track e a costura dupla do couro: sem
 * seguir o afunilamento do tubo a linha ou afunda na coxa ou boia solta no
 * tornozelo.
 *
 * Em vez de uma fita continua (uma BufferGeometry manual, mais um jeito de
 * nascer com normal errada), sao N caixas curtas empilhadas, cada uma no raio
 * INTERPOLADO da propria altura — o mesmo raciocinio de rDe() usado nas
 * costuras de calcados.js, so que aqui o raio e linear (o tubo de N.pernas e
 * um CylinderGeometry, sem curva) entao a interpolacao e so um lerp.
 */
function costuraVertical(r0, y0, r1, y1, ang, mat, o = {}) {
  const n = o.n || 4
  const larg = o.larg === undefined ? 0.0055 : o.larg
  const esp = o.esp === undefined ? 0.0034 : o.esp
  const fora = o.fora === undefined ? 0.0015 : o.fora
  const g = new THREE.Group()
  const sA = Math.sin(ang), cA = Math.cos(ang)
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n
    const tm = (t0 + t1) / 2
    const ym = y0 + (y1 - y0) * tm
    const rm = r0 + (r1 - r0) * tm + fora
    const h = Math.abs(y1 - y0) / n * 1.18
    const b = N.caixa(larg, h, esp, mat)
    b.position.set(sA * rm, ym, cA * rm)
    b.rotation.y = ang
    g.add(b)
  }
  return g
}

/**
 * NOVO: fiapos da barra crua (jeans desfiado). Cada fiapo e um cone bem fino
 * pendurado na borda, com comprimento e espessura levemente diferentes —
 * variados por SENO com fase propria, nao por Math.random(): o build tem que
 * dar o mesmo resultado sempre (mesma regra de determinismo que o resto do
 * catalogo de roupa segue, nenhuma peca daqui usa random em lugar nenhum).
 * Fiapo reto (sem inclinar) lia como agulha espetada; a inclinacao pra fora
 * e pra baixo e o que faz ler como fio desfiado de verdade.
 */
function franja(r, y, mat, n = 11, o = {}) {
  const g = new THREE.Group()
  const compBase = o.comp || 0.015
  const variacao = o.variacao === undefined ? 0.55 : o.variacao
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 0.5 + 0.5 * Math.sin(i * 2.614 + 0.7)
    const comp = compBase * (1 - variacao / 2 + variacao * k)
    const esp = 0.0021 * (0.7 + 0.5 * Math.sin(i * 1.37))
    const fio = N.tubo(esp, esp * 0.32, comp, mat, 5)
    const rr = r * 0.986
    fio.position.set(Math.sin(a) * rr, y - comp / 2, Math.cos(a) * rr)
    fio.rotation.z = Math.sin(a) * 0.22
    fio.rotation.x = -Math.cos(a) * 0.22
    g.add(fio)
  }
  return g
}

/**
 * NOVO: o rasgo do joelho. NAO e um buraco booleano na malha (nao da pra
 * furar um CylinderGeometry sem reconstruir a topologia inteira) — e um domo
 * de PELE (c.cor.pele, a cor real do personagem) pousado por CIMA do tecido,
 * proud o bastante pra ficar na frente dele, com uma coroa de fiapos ao redor
 * imitando a fibra arrebentada. A pele ultrapassa fisicamente o pano: por
 * isso le como rasgo aberto, e nao como remendo colado.
 */
function joelhoRasgado(r, matPele, matFiapo) {
  const g = new THREE.Group()
  const p = N.bola(r * 0.60, matPele, 10)
  p.scale.set(1, 0.60, 0.34)
  p.position.z = r * 0.32
  g.add(p)
  const n = 7
  for (let i = 0; i < n; i++) {
    const a = -0.95 + 1.9 * (i / (n - 1))
    const k = 0.5 + 0.5 * Math.sin(i * 2.1)
    const comp = 0.009 + 0.007 * k
    const fio = N.tubo(0.0015, 0.0005, comp, matFiapo, 5)
    fio.position.set(Math.sin(a) * r * 0.58, -comp * 0.30, r * 0.32 + Math.cos(a) * r * 0.28)
    fio.rotation.x = Math.PI / 2 - 0.30 - a * 0.35
    g.add(fio)
  }
  return g
}

/**
 * Bolso traseiro tipo jeans (painel embutido + pesponto em relevo + rebite
 * opcional), a mesma peca que calcas.js desenha na mao dentro do jeans, so
 * que parametrizada em ESCALA e rebite pra servir do jean cheio (skinny,
 * rasgada) ate a bermuda jeans sem reescrever a mesma conta tres vezes —
 * exatamente a razao de calcas.js nao existir em 3 mil linhas mais.
 */
function bolsoTraseiro(c, gasto, linha, o = {}) {
  const g = new THREE.Group()
  const k = o.escala || 1
  const y = o.y === undefined ? -0.004 : o.y
  for (const sgn of [1, -1]) {
    const x = sgn * 0.052
    const z = -N.frenteXZ(c, c.perfil.PELVIS, x, y, N.FOLGA_CALCA, 0.0015)
    const p = N.bloco(0.064 * k, 0.072 * k, 0.016, 0.012 * k, gasto)
    p.position.set(x, y, z)
    viraPraFora(p, x, z)
    g.add(p)
    const cost = N.caixa(0.058 * k, 0.0055, 0.012, linha)
    cost.position.set(x, y + 0.031 * k, z * 1.05)
    viraPraFora(cost, x, z)
    g.add(cost)
    if (o.rebites) {
      const reb = N.bola(0.0037, N.metal(0xb98a4e), 8)
      reb.scale.set(1, 1, 0.55)
      const xr = sgn * 0.088, yr = y + 0.018
      reb.position.set(xr, yr, N.frenteXZ(c, c.perfil.PELVIS, xr, yr, N.FOLGA_CALCA, 0.0035))
      g.add(reb)
    }
  }
  return g
}

/**
 * NOVO: cordao generico da cintura ate uma altura yFim, ancorado em
 * frenteXZ/frenteZ (a superficie de verdade, nao um z chutado — a mesma
 * correcao que o cordao do jogger em calcas.js documenta: cordao de z fixo
 * fica boiando no vao entre as coxas). Serve pro moletom-calca, o track, a
 * bermuda de praia e a bermuda cargo, cada uma so trocando cor/espessura/
 * ponteira.
 */
function cordao(c, mat, yTopo, yFim, o = {}) {
  const g = new THREE.Group()
  const folga = N.FOLGA_CALCA
  const dxTopo = o.dxTopo === undefined ? 0.020 : o.dxTopo
  const dxFim = o.dxFim === undefined ? 0.030 : o.dxFim
  const r = o.r || 0.0042
  const CIMA = new THREE.Vector3(0, 1, 0)
  for (const sgn of [1, -1]) {
    const a = new THREE.Vector3(sgn * dxTopo, yTopo,
      N.frenteXZ(c, c.perfil.PELVIS, sgn * dxTopo, yTopo, folga, 0.004))
    const b = new THREE.Vector3(sgn * dxFim, yFim,
      N.frenteXZ(c, c.perfil.PELVIS, sgn * dxFim, yFim, folga, 0.004))
    const d = new THREE.Vector3().subVectors(a, b)
    const t = N.tubo(r, r * 0.85, d.length(), mat, 6)
    t.position.copy(a).add(b).multiplyScalar(0.5)
    t.quaternion.setFromUnitVectors(CIMA, d.clone().normalize())
    g.add(t)
    if (o.ponteira) {
      const pt = N.tubo(r * 1.3, r * 1.3, 0.009, o.ponteira, 6)
      pt.position.copy(b)
      g.add(pt)
    }
  }
  const no = N.bola(0.0078, mat, 8)
  const yNo = yTopo + 0.004
  no.position.set(0, yNo, N.frenteZ(c, c.perfil.PELVIS, yNo, folga, 0.004) + 0.002)
  no.scale.set(1.4, 0.75, 0.7)
  g.add(no)
  return g
}

/**
 * NOVO: faixa "elastica" — um anel curto com raio ONDULADO (mesma tecnica de
 * rip/lobos do punho canelado do jogger, so que na CINTURA em vez do
 * tornozelo). Nenhuma peca de calcas.js precisava de cos elastico porque
 * jeans/jogger/cargo fecham com cinto, cordao redondo ou cos liso; aqui
 * moletom-calca/track/praia/cargo-bermuda pedem cintura de elastico
 * costurado, que sem a ondulacao lia como cos liso comum de novo.
 */
function faixaElastica(c, mat, y0, y1, o = {}) {
  const yMed = (y0 + y1) / 2
  const rMed = N.raioPerfil(c.perfil.PELVIS, yMed) * (o.folga || N.FOLGA_CALCA) + (o.extra === undefined ? 0.0018 : o.extra)
  const lobos = o.lobos || 14
  const rip = o.rip === undefined ? 0.026 : o.rip
  return peca(lofte([
    { y: y0, r: rMed * 0.992, rip, lobos },
    { y: yMed, r: rMed, rip, lobos },
    { y: y1, r: rMed * 0.996, rip, lobos },
  ], o.seg || 28), mat)
}

/** Botao de pressao: domo achatado (a bola do jeans, so mais rasa). */
function botaoPressao(r, mat) {
  const b = N.bola(r, mat, 8)
  b.scale.z = 0.5
  return b
}

/**
 * NOVO: a barra virada (rolled cuff) do skinny. E o OPOSTO da boca(): ali o
 * avesso fica por dentro e some; aqui o tecido literalmente enrola sobre si
 * mesmo, entao e o AVESSO que fica pra FORA (mais claro — o miolo de um jeans
 * cru e sempre mais claro que a face tinta) e so uma tira fina da cor de fora
 * espia por baixo, na quina de baixo, que e a borda crua do rolo.
 */
function barraEnrolada(rTopo, yTopo, rBase, yBase, mat, matAvesso, seg = 14) {
  const g = new THREE.Group()
  g.add(peca(N.revolver([
    [rTopo * 0.99, yTopo],
    [rBase * 1.03, yTopo - (yTopo - yBase) * 0.42],
    [rBase * 1.045, yBase + 0.006],
    [rBase * 0.985, yBase],
  ], seg), matAvesso))
  g.add(peca(N.revolver([
    [rBase * 0.978, yBase],
    [rBase * 1.010, yBase - 0.0028],
    [rBase * 0.945, yBase - 0.0058],
  ], seg), mat))
  return g
}

/** Bola de joelho pro Grupo A (mesma correcao do jeans: preenche a fresta que
 *  Upper/Lower abrem). Repetida em 5 pecas — e por isso e uma funcao. */
function preencheJoelho(rJoelho, mat) {
  const b = N.bola(rJoelho * 0.99, mat, 10)
  b.scale.y = 0.86
  return b
}

// ===========================================================================
// O CATALOGO — 10 pecas
// ===========================================================================

export const CALCAS_EXTRA = [

  // --- GRUPO A: TUBO POR PERNA -------------------------------------------

  {
    id: 'skinny',
    nome: 'Jeans skinny',
    metodo: 'dois tubos MUITO justos (coxa+canela) + barra ENROLADA (o avesso claro vira pra fora, oposto da boca comum) + pesponto lateral corrido',
    // Moda: COWBOY/casual — jeans e AZUL_JEANS fixo (ver "IDENTIDADE DE
    // TECIDO" no topo do arquivo), nao a cor que o jogador escolheu: jeans
    // roxo nao existe, e essa e a mesma regra que a jaqueta jeans usa do
    // lado das camisas.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = AZUL_JEANS
      const m = N.tecido(cor, 0.92)
      const avesso = N.tecido(N.esc(cor, 1.34), 0.95)
      const linha = N.tecido(LINHA_JEANS, 0.85)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN

      const R_JOELHO = 0.0485
      const R_TORNOZELO = 0.0455   // topo do rolo: raio MINIMO, e o rolo por
      // cima que garante o piso R_FORA_DO_CANO — ver barraEnrolada abaixo.

      g.add(N.cos(c, m, { y0: -0.040, y1: 0.052 }))
      g.add(passantes(c, N.tecido(N.esc(cor, 0.85), 0.90), 0.040, [0, 1.6, -1.6]))

      N.pernas(c, m, {
        rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: R_TORNOZELO, canelaFrac: 1,
      })

      N.nasPernas(c, 'Lower', () => preencheJoelho(R_JOELHO, m))

      // barra enrolada: comeca 3 cm acima do tornozelo real (regiao ainda
      // tapada pelo tubo justo) e desce ate 2 cm ABAIXO dele — a mesma regra
      // de calcas.js pra peca que esconde 'canela'.
      const yRoloTopo = -S + 0.030
      const yHem = -S - 0.020
      const rRoloTopo = R_JOELHO * 0.97 + (R_TORNOZELO - R_JOELHO * 0.97) * 0.88
      N.nasPernas(c, 'Lower', () => barraEnrolada(
        Math.max(rRoloTopo, 0.045), yRoloTopo, Math.max(0.062, R_FORA_DO_CANO + 0.002), yHem, m, avesso,
      ))

      // pesponto lateral: corre a perna inteira, dividido nos dois segmentos
      // que a junta do joelho separa (regra c do cabecalho).
      N.nasPernas(c, 'Upper', (sgn) => costuraVertical(
        R_TOPO, 0.020, R_JOELHO, -T, sgn * Math.PI / 2, linha, { n: 4 },
      ))
      N.nasPernas(c, 'Lower', (sgn) => costuraVertical(
        R_JOELHO * 0.97, 0.015, R_TORNOZELO, -S - 0.020, sgn * Math.PI / 2, linha, { n: 3 },
      ))

      g.add(bolsoTraseiro(c, m, linha, { escala: 0.80 }))
      g.add(pespontoNoCorpo(c, linha, -0.034, 0.028, 0.10, 0.14, N.FOLGA_CALCA, 0.0032))
      return g
    },
  },

  {
    id: 'alfaiataria',
    nome: 'Calca de alfaiataria',
    metodo: 'dois tubos QUASE retos (caimento reto, pouco afunilamento) + vinco frontal/traseiro em costura vertical + bolso faca (fenda dupla) + bainha dobrada baixa + fecho de gancho',
    // Moda: SOCIAL/FINO — a calca que fecha o par com o colete/camisa social
    // do lado das camisas. Tecido ESCURO liso e FIXO (ALFAIATARIA_ESCURO),
    // nao a cor que o jogador escolheu: calca de alfaiataria rosa-choque nao
    // combina com o fecho de gancho nem com bolso faca.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = ALFAIATARIA_ESCURO
      const m = N.tecido(cor, 0.88)
      const avesso = N.tecido(N.esc(cor, 0.72), 0.90)
      const vinco = N.tecido(N.esc(cor, 0.80), 0.85)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN

      const R_JOELHO = 0.0575
      const R_HEM = Math.max(0.0605, R_FORA_DO_CANO)

      g.add(N.cos(c, m, { y0: -0.040, y1: 0.056 }))
      // fecho de gancho: uma placinha metalica no meio da cintura, no lugar
      // do cinto — calca social nao usa fivela.
      const gancho = N.caixa(0.015, 0.011, 0.004, N.metal(0xb9b9c2))
      gancho.position.set(0, 0.050, N.frenteZ(c, c.perfil.PELVIS, 0.050, N.FOLGA_CALCA, 0.006))
      g.add(gancho)

      N.pernas(c, m, { rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: R_HEM, canelaFrac: 1 })
      N.nasPernas(c, 'Lower', () => preencheJoelho(R_JOELHO, m))

      // vinco frontal e traseiro: a costura que separa calca social de calca
      // qualquer. Sobe ate o cos (y=0.020) e desce ate a bainha.
      for (const ang of [0, Math.PI]) {
        N.nasPernas(c, 'Upper', () => costuraVertical(
          R_TOPO, 0.020, R_JOELHO, -T, ang, vinco, { n: 4, larg: 0.0045, esp: 0.0028, fora: 0.0012 },
        ))
        N.nasPernas(c, 'Lower', () => costuraVertical(
          R_JOELHO * 0.97, 0.015, R_HEM, -S - 0.020, ang, vinco, { n: 3, larg: 0.0045, esp: 0.0028, fora: 0.0012 },
        ))
      }

      N.nasPernas(c, 'Lower', () => boca(R_HEM, -S - 0.020, m, avesso))

      // bolso faca: DUAS linhas de pesponto bem proximas (a fenda do bolso
      // jetted), nao um patch — dress pants nao tem bolso aplicado por fora.
      for (const sgn of [1, -1]) {
        g.add(pespontoNoCorpo(c, vinco, -0.018, -0.011, sgn * 2.05, 0.30, N.FOLGA_CALCA, 0.0026))
        g.add(pespontoNoCorpo(c, vinco, -0.005, 0.002, sgn * 2.05, 0.30, N.FOLGA_CALCA, 0.0026))
      }
      return g
    },
  },

  {
    id: 'chino',
    nome: 'Chino',
    metodo: 'dois tubos com afunilamento suave + barra dobrada baixa (boca) + bolso frontal diagonal + bolso traseiro tipo faca com botao + cos com cinto',
    // Moda: CASUAL — chino de verdade vem em qualquer cor (cáqui, azul-
    // marinho, verde-oliva, vermelho), entao esta e uma das pecas que
    // continua 100% na cor do jogador; a identidade dela ja vem da
    // rugosidade mais alta (algodao chapado) que separa de jeans na mesma
    // luz, nao de uma cor fixa.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = c.cor.calca
      const m = solid(cor, 0.97, 0.0)   // algodao chapado: rugosidade mais
      // alta que o brim (0.92-0.95 do resto do catalogo) e o que separa
      // chino de jeans na mesma luz — sem isso as duas pecas so mudam de nome.
      const avesso = N.tecido(N.esc(cor, 0.74), 0.95)
      const linha = N.tecido(N.esc(cor, 0.62), 0.85)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN

      const R_JOELHO = 0.0535
      const R_HEM = Math.max(0.0615, R_FORA_DO_CANO)

      g.add(N.cos(c, m, { y0: -0.040, y1: 0.052 }))
      g.add(N.cinto(c, N.esc(cor, 0.32), { y: 0.038, fivela: 0xb9ac82 }))
      g.add(passantes(c, N.tecido(N.esc(cor, 0.70), 0.90), 0.038, [0, 1.5, -1.5, 2.6, -2.6]))

      N.pernas(c, m, { rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: R_HEM, canelaFrac: 1 })
      N.nasPernas(c, 'Lower', () => preencheJoelho(R_JOELHO, m))
      N.nasPernas(c, 'Lower', () => boca(R_HEM, -S - 0.020, m, avesso))
      // vinco de joelho unico e suave (algodao nao amassa em duas dobras como
      // brim rigido — uma so, rasa, e a diferenca pro jeans/rasgada).
      N.nasPernas(c, 'Upper', () => dobra(0.0555, -0.300, 0.016, 0.0028, N.tecido(N.esc(cor, 0.94), 0.95)))

      // bolso frontal diagonal (a fenda inclinada do chino, diferente da
      // carcela vertical do jeans).
      for (const sgn of [1, -1]) {
        g.add(pespontoNoCorpo(c, linha, -0.026, 0.020, sgn * 0.92, 0.30, N.FOLGA_CALCA, 0.0030))
      }
      // bolso traseiro tipo faca com botao (um so, o classico do chino).
      // O botao sai do MESMO lado da fenda: phi = sin(2.15) e' POSITIVO (o
      // quadril DIREITO na convencao x=sin(phi)*r do revolver), entao xB
      // tem que ser positivo tambem — botao do lado errado foi o primeiro
      // erro que a auditoria pegou aqui.
      g.add(pespontoNoCorpo(c, linha, -0.014, -0.006, 2.15, 0.24, N.FOLGA_CALCA, 0.0026))
      const botao = botaoPressao(0.0052, N.tecido(N.esc(cor, 0.55), 0.7))
      const xB = 0.048, yB = -0.010
      botao.position.set(xB, yB, N.frenteXZ(c, c.perfil.PELVIS, xB, yB, N.FOLGA_CALCA, 0.006))
      g.add(botao)
      return g
    },
  },

  {
    id: 'rasgada',
    nome: 'Jeans destroyed',
    metodo: 'dois tubos tipo jeans + DOIS RASGOS no joelho (domo de pele por cima do tecido + coroa de fiapos, geometria e nao textura) + bolsos com rebite',
    // Moda: CASUAL/cowboy — jeans e AZUL_JEANS fixo, mesma regra da skinny;
    // gasto/avesso/fiapo continuam derivando dessa cor fixa (sao o desbote e
    // o forro do PROPRIO jeans, nao uma cor independente).
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = AZUL_JEANS
      const m = N.tecido(cor, 0.95)
      const gasto = N.tecido(N.esc(cor, 1.18), 0.93)
      const avesso = N.tecido(N.esc(cor, 0.66), 0.97)
      const linha = N.tecido(LINHA_JEANS, 0.85)
      const pele = solid(c.cor.pele, 0.70, 0.0)   // mesmo material de "pele
      // exposta" que fazChinelo usa em calcados.js — nao existe uma cor de
      // pele separada pra roupa, e a mesma que o corpo usa.
      const fiapo = N.tecido(N.esc(cor, 1.30), 0.90)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN

      const R_JOELHO = 0.0545
      const R_HEM = Math.max(0.0620, R_FORA_DO_CANO)

      g.add(N.cos(c, m, { y0: -0.042, y1: 0.054 }))
      g.add(N.cinto(c, N.esc(cor, 0.30), { y: 0.040, fivela: 0xc9b273 }))
      g.add(passantes(c, gasto, 0.040, [0, 1.5, -1.5, 2.7, -2.7]))

      N.pernas(c, m, { rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: R_HEM, canelaFrac: 1 })
      N.nasPernas(c, 'Lower', () => boca(R_HEM, -S - 0.020, m, avesso))

      // o rasgo: bola de tecido preenchendo a junta (como o jeans comum) MAIS
      // o domo de pele com fiapos por cima, os dois no mesmo Group pra ficar
      // claro que sao uma unidade so.
      N.nasPernas(c, 'Lower', () => {
        const grp = new THREE.Group()
        grp.add(preencheJoelho(R_JOELHO, m))
        grp.add(joelhoRasgado(R_JOELHO, pele, fiapo))
        return grp
      })

      g.add(bolsoTraseiro(c, gasto, linha, { escala: 1.0, rebites: true }))
      g.add(pespontoNoCorpo(c, gasto, -0.036, 0.030, 0.10, 0.16, N.FOLGA_CALCA, 0.0035))
      return g
    },
  },

  {
    id: 'couro',
    nome: 'Calca de couro',
    metodo: 'dois tubos MUITO justos com material de brilho alto (rugosidade baixa) + costura dupla em relevo correndo a perna inteira + cos largo sem cinto + ziper decorativo no tornozelo',
    // Moda: ESPORTISTA/rocker — couro de verdade tinge em qualquer cor
    // (preto, marrom, ate vermelho de couro sintetico), entao continua na
    // cor do jogador; a identidade desta peca ja e o MATERIAL (rugosidade
    // 0.20, o brilho mais alto do catalogo) e nao precisa de uma segunda
    // cor fixa por cima.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = c.cor.calca
      const couroBrilho = solid(cor, 0.20, 0.14)   // mais liso e mais
      // metalico que N.couro (0.42/0.08) — e o brilho alto que o pedido pede;
      // sem environment map na cena, o especular do sol e' quem vende o
      // couro, entao rugosidade baixa importa mais aqui que em qualquer
      // outra peca do catalogo.
      const costuraTom = solid(N.esc(cor, 0.42), 0.24, 0.10)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN

      const R_JOELHO = 0.0470
      const R_HEM = Math.max(0.0610, R_FORA_DO_CANO)

      g.add(N.cos(c, couroBrilho, { y0: -0.040, y1: 0.058 }))
      // duas presilhas laterais no lugar da fileira de passantes — couro nao
      // usa cinto de tecido, so uma alca curta de reforco de cada lado.
      for (const sgn of [1, -1]) {
        g.add(pespontoNoCorpo(c, costuraTom, 0.040, 0.056, sgn * 2.6, 0.09, N.FOLGA_CINTO, 0.0050))
      }

      N.pernas(c, couroBrilho, { rCoxaTopo: R_TOPO, rCoxa: R_JOELHO, rCanela: R_HEM, canelaFrac: 1 })
      N.nasPernas(c, 'Lower', () => preencheJoelho(R_JOELHO, couroBrilho))
      // vinco de joelho unico e raso: nao e amassado de tecido, e o corte da
      // pele do couro marcando a articulacao.
      N.nasPernas(c, 'Upper', () => dobra(0.0480, -0.300, 0.014, 0.0022, solid(N.esc(cor, 0.80), 0.24, 0.12)))

      // costura dupla: duas linhas paralelas (o "racing seam" de calca de
      // moto), full-length nos dois segmentos.
      for (const off of [-0.05, 0.05]) {
        N.nasPernas(c, 'Upper', (sgn) => costuraVertical(
          R_TOPO, 0.020, R_JOELHO, -T, sgn * Math.PI / 2 + off, costuraTom, { n: 4, larg: 0.0040, esp: 0.0030 },
        ))
        N.nasPernas(c, 'Lower', (sgn) => costuraVertical(
          R_JOELHO * 0.97, 0.015, R_HEM, -S - 0.020, sgn * Math.PI / 2 + off, costuraTom, { n: 3, larg: 0.0040, esp: 0.0030 },
        ))
      }

      // ziper decorativo no tornozelo externo: uma tira curta + puxador.
      N.nasPernas(c, 'Lower', (sgn) => {
        const grp = costuraVertical(
          R_JOELHO * 0.97, -0.230, R_HEM, -S - 0.010, sgn * Math.PI / 2, N.metal(0x9aa1a8),
          { n: 3, larg: 0.0048, esp: 0.0026, fora: 0.0020 },
        )
        const puxador = N.caixa(0.007, 0.010, 0.003, N.metal(0x9aa1a8))
        const rr = R_HEM + 0.0020
        puxador.position.set(sgn * rr, -S - 0.006, 0)
        puxador.rotation.y = sgn * Math.PI / 2
        grp.add(puxador)
        return grp
      })
      return g
    },
  },

  // --- GRUPO B: LOFT CONTINUO ---------------------------------------------

  {
    id: 'moletom-calca',
    nome: 'Calca de moletom',
    metodo: 'pano continuo lofteado (a familia do jogger), mais largo e com mais caimento; punho canelado alto em bloco de cor + cordao chato na cintura elastica',
    // Moda: FRIO/casual — moletom e CINZA_MESCLA fixo (nao deriva de
    // c.cor.calca): e a cor "padrao" de moletom de verdade, e da ao jogador
    // uma calca que combina com QUALQUER camisa (inclusive o moletom-camisa
    // de qualquer cor), em vez de brigar com ela.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = CINZA_MESCLA
      const pano = solid(0xffffff, 0.99, 0, { vertexColors: true })
      const trim = N.tecido(N.esc(cor, 0.60), 0.95)   // punho/cos em bloco de
      // cor: e o color-blocking que separa moletom de jogger na mesma prateleira.
      const cordaoM = N.tecido(0xe6dfcd, 0.94)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN
      const SEG_UP = 16, SEG_LOW = 18

      g.add(N.cos(c, trim, { y0: -0.040, y1: 0.058 }))
      g.add(faixaElastica(c, trim, 0.058, 0.070, { lobos: 14, rip: 0.024, seg: 28 }))
      g.add(cordao(c, cordaoM, 0.058, -0.032, { dxTopo: 0.020, dxFim: 0.030, r: 0.0044 }))

      N.nasPernas(c, 'Upper', (sgn) => {
        const f = sgn * 0.7
        return peca(lofte([
          { y: 0.036, r: 0.0600, ao: 0.18 },
          { y: -0.010, r: 0.0745, rip: 0.011, fase: f, ao: 0.12 },
          { y: -0.065, r: 0.0825, rip: 0.015, fase: f, ao: 0.05 },
          { y: -0.135, r: 0.0840, rip: 0.017, fase: f },
          { y: -0.210, r: 0.0810, rip: 0.017, fase: f },
          { y: -0.275, r: 0.0760, rip: 0.016, fase: f, ao: 0.04 },
          { y: -0.312, r: 0.0730, rip: 0.020, fase: f, ao: 0.07 },
          { y: -0.340, r: 0.0705, rip: 0.022, fase: f, ao: 0.09 },
          { y: -T + 0.028, r: 0.0692, rip: 0.021, fase: f, ao: 0.08 },
        ], SEG_UP, { cor }), pano)
      })
      N.nasPernas(c, 'Lower', () => peca(joelhoLoft(0.0700, SEG_UP, { ky: 0.88, cor, ao: 0.06 }), pano))
      N.nasPernas(c, 'Lower', (sgn) => {
        const f = sgn * 0.7
        return peca(lofte([
          { y: 0, r: 0.0680, rip: 0.019, fase: f, ao: 0.10 },
          { y: -0.030, r: 0.0705, rip: 0.019, fase: f, ao: 0.06 },
          { y: -0.075, r: 0.0725, rip: 0.018, fase: f },
          { y: -0.140, r: 0.0705, rip: 0.017, fase: f },
          { y: -0.205, r: 0.0675, rip: 0.016, fase: f },
          { y: -0.255, r: 0.0655, rip: 0.017, fase: f, ao: 0.05 },
          // punho: banda MAIS ALTA e mais gorda que a do jogger de proposito
          // (o pedido e' explicitamente "mais largo"); lobos=9 com seg=18 e a
          // mesma proporcao 2x do jogger (16/8), so com mais canaletas.
          { y: -0.280, r: 0.0672, rip: 0.026, fase: f, dz: 0.004, ao: 0.10 },
          { y: -0.300, r: 0.0655, lobos: 9, rip: 0.034, ao: 0.18 },
          { y: -0.322, r: 0.0648, lobos: 9, rip: 0.036, ao: 0.20 },
          { y: -0.344, r: 0.0648, lobos: 9, rip: 0.036, ao: 0.20 },
          { y: -S - 0.018, r: 0.0638, lobos: 9, rip: 0.030, ao: 0.24 },
        ], SEG_LOW, { cor: N.esc(cor, 0.62) }), pano)
      })

      g.add(pespontoNoCorpo(c, trim, -0.030, 0.022, 0, 0.30, N.FOLGA_CALCA, 0.0035))
      return g
    },
  },

  {
    id: 'track',
    nome: 'Calca esportiva (track)',
    metodo: 'pano continuo lofteado, corte atletico (mais afunilado que o moletom-calca) + faixa lateral em RELEVO geometrico de ponta a ponta + punho canelado curto com ziper de tornozelo + cintura elastica',
    // Moda: ESPORTISTA — corpo na cor do jogador (a cor do "time"/marca),
    // com a faixa lateral (faixaM, quase-branca) e o cordao (quase-preto)
    // JA fixos desde a leva anterior — esta peca ja tinha a listra lateral
    // contrastante que o pedido descreveu, entao so ganhou o comentario de
    // moda aqui, nenhuma cor mudou.
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = c.cor.calca
      const pano = solid(0xffffff, 0.99, 0, { vertexColors: true })
      const trim = N.tecido(N.esc(cor, 0.55), 0.92)
      const faixaM = N.tecido(0xf2f0ea, 0.55)   // faixa lateral: quase branca,
      // baixa rugosidade — e sintetico e pega luz mais que o resto do tecido,
      // o contrario do trim escuro do moletom-calca.
      const cordaoM = N.tecido(0x2b2b2e, 0.90)
      const g = new THREE.Group()
      const T = c.medida.THIGH, S = c.medida.SHIN
      const SEG = 16

      g.add(N.cos(c, trim, { y0: -0.040, y1: 0.056 }))
      g.add(faixaElastica(c, trim, 0.056, 0.066, { lobos: 14, rip: 0.020, seg: 28 }))
      g.add(cordao(c, cordaoM, 0.056, -0.026, { dxTopo: 0.018, dxFim: 0.024, r: 0.0034 }))

      N.nasPernas(c, 'Upper', (sgn) => {
        const f = sgn * 0.7
        return peca(lofte([
          { y: 0.034, r: 0.0595, ao: 0.16 },
          { y: -0.010, r: 0.0680, rip: 0.008, fase: f, ao: 0.10 },
          { y: -0.065, r: 0.0720, rip: 0.009, fase: f, ao: 0.04 },
          { y: -0.135, r: 0.0715, rip: 0.009, fase: f },
          { y: -0.210, r: 0.0680, rip: 0.009, fase: f },
          { y: -0.275, r: 0.0630, rip: 0.009, fase: f, ao: 0.03 },
          { y: -0.312, r: 0.0595, rip: 0.011, fase: f, ao: 0.06 },
          { y: -0.340, r: 0.0570, rip: 0.012, fase: f, ao: 0.07 },
          { y: -T + 0.028, r: 0.0555, rip: 0.012, fase: f, ao: 0.06 },
        ], SEG, { cor }), pano)
      })
      N.nasPernas(c, 'Lower', () => peca(joelhoLoft(0.0575, SEG, { ky: 0.88, cor, ao: 0.05 }), pano))
      N.nasPernas(c, 'Lower', (sgn) => {
        const f = sgn * 0.7
        return peca(lofte([
          { y: 0, r: 0.0560, rip: 0.010, fase: f, ao: 0.08 },
          { y: -0.030, r: 0.0580, rip: 0.010, fase: f, ao: 0.05 },
          { y: -0.075, r: 0.0595, rip: 0.009, fase: f },
          { y: -0.140, r: 0.0575, rip: 0.009, fase: f },
          { y: -0.205, r: 0.0545, rip: 0.009, fase: f },
          { y: -0.255, r: 0.0520, rip: 0.010, fase: f, ao: 0.04 },
          { y: -0.296, r: 0.0555, rip: 0.014, fase: f, ao: 0.08 },
          // punho curto e justo (track nao afrouxa como moletom): lobos=8
          // com seg=16, a MESMA proporcao do jogger original.
          { y: -0.314, r: 0.0620, lobos: 8, rip: 0.030, ao: 0.16 },
          { y: -0.332, r: 0.0615, lobos: 8, rip: 0.030, ao: 0.18 },
          { y: -S - 0.018, r: 0.0605, lobos: 8, rip: 0.024, ao: 0.20 },
        ], SEG, { cor: N.esc(cor, 0.85) }), pano)
      })

      // faixa lateral: relevo geometrico (nao decalque) full-length, dividida
      // no joelho como qualquer outro detalhe de perna.
      N.nasPernas(c, 'Upper', (sgn) => costuraVertical(
        0.0595, 0.034, 0.0555, -T + 0.028, sgn * Math.PI / 2, faixaM,
        { n: 5, larg: 0.0105, esp: 0.0030, fora: 0.0020 },
      ))
      N.nasPernas(c, 'Lower', (sgn) => costuraVertical(
        0.0560, 0, 0.0605, -S - 0.018, sgn * Math.PI / 2, faixaM,
        { n: 4, larg: 0.0105, esp: 0.0030, fora: 0.0020 },
      ))

      // ziper de tornozelo: tira curta + puxador metalico, no lado de fora
      // do punho canelado (a abertura real de calca esportiva de treino).
      N.nasPernas(c, 'Lower', (sgn) => {
        const grp = costuraVertical(
          0.0575, -0.235, 0.0605, -S - 0.006, sgn * Math.PI / 2, N.metal(0x8a8f98),
          { n: 3, larg: 0.0048, esp: 0.0026, fora: 0.0026 },
        )
        const puxador = N.caixa(0.007, 0.009, 0.003, N.metal(0x8a8f98))
        puxador.position.set(sgn * (0.0605 + 0.0026), -S - 0.010, 0)
        puxador.rotation.y = sgn * Math.PI / 2
        grp.add(puxador)
        return grp
      })
      return g
    },
  },

  // --- GRUPO C: BERMUDA (tubo curto, sem canela) --------------------------

  {
    id: 'bermuda-jeans',
    nome: 'Bermuda jeans',
    metodo: 'tubo unico por perna (so coxa, parando acima do joelho) + barra DESFIADA (fiapos individuais em geometria) + bolsos e cos do jeans em escala bermuda',
    // Nao esconde 'coxa': a barra para bem acima do joelho e a coxa real
    // continua a mostra por baixo dela — a mesma razao documentada na bermuda
    // cargo de calcas.js (esconder 'coxa' apaga a perna INTEIRA, nao so o
    // trecho coberto, e sobraria vao entre o pano e o joelho).
    // Moda: CASUAL/cowboy — jeans e AZUL_JEANS fixo, a terceira e ultima
    // peca "jeans" do catalogo (com skinny e rasgada) a usar essa cor.
    esconde: [],
    build(c) {
      const cor = AZUL_JEANS
      const m = N.tecido(cor, 0.95)
      const gasto = N.tecido(N.esc(cor, 1.20), 0.93)
      const linha = N.tecido(LINHA_JEANS, 0.85)
      const fiapo = N.tecido(N.esc(cor, 1.32), 0.90)
      const g = new THREE.Group()
      const T = c.medida.THIGH

      const HEM_Y = -0.300   // 8,4 cm acima do joelho (T=0.384)
      const R_HEM = 0.066

      g.add(N.cos(c, m, { y0: -0.042, y1: 0.054 }))
      g.add(N.cinto(c, N.esc(cor, 0.30), { y: 0.040, fivela: 0xc9b273 }))
      g.add(passantes(c, gasto, 0.040, [0, 1.5, -1.5, 2.7, -2.7]))

      N.pernas(c, m, {
        rCoxaTopo: R_TOPO, rCoxa: R_HEM, coxaFrac: Math.abs(HEM_Y) / T, canelaFrac: 0,
      })
      N.nasPernas(c, 'Upper', () => franja(R_HEM, HEM_Y, fiapo, 12, { comp: 0.017, variacao: 0.6 }))

      g.add(bolsoTraseiro(c, gasto, linha, { escala: 0.94, rebites: true }))
      g.add(pespontoNoCorpo(c, gasto, -0.036, 0.030, 0.10, 0.16, N.FOLGA_CALCA, 0.0035))
      return g
    },
  },

  {
    id: 'bermuda-praia',
    nome: 'Bermuda de praia',
    metodo: 'tubo unico por perna com LEVE ALARGAMENTO na barra (silhueta solta, oposto do afunilado das outras) + painel lateral em bloco de cor (revolucao parcial) + filete de contraste + cintura elastica com cordao',
    // Moda: CASUAL/praia — o corpo continua na cor do jogador (um short de
    // banho pode ser qualquer cor), mas o painel lateral agora e uma
    // ESTAMPA fixa (PRAIA_ESTAMPA coral + filete PRAIA_ESTAMPA_2 quase-
    // branco) em vez de so um tom mais claro da mesma cor — o color-block
    // vivo que separa um short estampado de uma bermuda lisa.
    esconde: [],
    build(c) {
      const cor = c.cor.calca
      const m = N.tecido(cor, 0.80)   // rugosidade baixa: tecido tecnico leve
      // de banho pega luz diferente do brim/algodao do resto do catalogo.
      const avesso = N.tecido(N.esc(cor, 0.66), 0.85)
      const painelM = N.tecido(PRAIA_ESTAMPA, 0.68)
      const filete = N.tecido(PRAIA_ESTAMPA_2, 0.55)
      const trim = N.tecido(N.esc(cor, 0.62), 0.85)
      const cordaoM = N.tecido(0xf0ece0, 0.90)
      const g = new THREE.Group()
      const T = c.medida.THIGH

      const HEM_Y = -0.275   // 10,9 cm acima do joelho: a mais curta das tres
      const R_HEM = 0.074    // e a mais larga — flare, nao afunilamento

      g.add(N.cos(c, m, { y0: -0.040, y1: 0.058 }))
      g.add(faixaElastica(c, trim, 0.058, 0.070, { lobos: 14, rip: 0.028, seg: 28 }))
      g.add(cordao(c, cordaoM, 0.058, -0.008, {
        dxTopo: 0.018, dxFim: 0.026, r: 0.0040, ponteira: N.metal(0xc9b273),
      }))

      N.pernas(c, m, {
        rCoxaTopo: R_TOPO, rCoxa: R_HEM, coxaFrac: Math.abs(HEM_Y) / T, canelaFrac: 0,
      })
      N.nasPernas(c, 'Upper', () => boca(R_HEM, HEM_Y, m, avesso))

      // painel lateral: uma revolucao PARCIAL (nao a volta inteira) seguindo
      // o mesmo afunilamento do tubo base, 1,6 mm por fora dele — e o
      // color-block classico de bermuda de banho, como bloco de cor real e
      // nao como decalque.
      const perfilPainel = [[R_TOPO + 0.0016, 0.020], [R_HEM + 0.0016, HEM_Y]]
      N.nasPernas(c, 'Upper', (sgn) => peca(
        N.revolver(perfilPainel, 6, 1, sgn * Math.PI / 2 - 0.42, 0.84), painelM,
      ))
      // Filete de contraste no centro do painel — a mesma ferramenta da
      // costura lateral do jeans, aqui so decorativa: o traco quase-branco
      // que faz o bloco de cor ler como ESTAMPA e nao como remendo.
      N.nasPernas(c, 'Upper', (sgn) => costuraVertical(
        R_TOPO + 0.0016, 0.020, R_HEM + 0.0016, HEM_Y, sgn * Math.PI / 2, filete,
        { n: 5, larg: 0.007, esp: 0.0026, fora: 0.0012 },
      ))
      return g
    },
  },

  {
    id: 'bermuda-cargo',
    nome: 'Bermuda cargo utilitaria',
    metodo: 'tubo unico por perna (mais curto que a bermuda cargo do catalogo base) + UM bolso utilitario com fole e aba de botao de pressao + argola D + cintura elastica com cordao chato (sem cinto/fivela)',
    // Deliberadamente MAIS CURTA e com fecho DIFERENTE da "Bermuda cargo"
    // (id 'cargo') que ja existe em calcas.js: aquela vai quase ate o joelho
    // e fecha com cinto+fivela; esta para na metade da coxa e fecha com
    // elastico+cordao, pra nao virar a mesma peca com o nome trocado.
    // Moda: CASUAL/utilitaria — continua na cor do jogador (cargo de verdade
    // vem em oliva, cáqui, preto...) com sombra tonal no bolso/aba; essa
    // peca nunca precisou de uma segunda cor, o defeito era so nas pecas com
    // identidade de tecido fixa (jeans, alfaiataria, moletom).
    esconde: [],
    build(c) {
      const cor = c.cor.calca
      const m = N.tecido(cor, 0.92)
      const escuro = N.tecido(N.esc(cor, 0.66), 0.90)
      const trim = N.tecido(N.esc(cor, 0.60), 0.88)
      const avesso = N.tecido(N.esc(cor, 0.70), 0.92)
      const metalOp = N.metal(0x8f95a0)
      const cordaoM = N.tecido(N.esc(cor, 0.50), 0.88)
      const g = new THREE.Group()
      const T = c.medida.THIGH

      const HEM_Y = -0.250   // 13,4 cm acima do joelho: a mais curta das tres
      const R_HEM = 0.070

      g.add(N.cos(c, m, { y0: -0.040, y1: 0.058 }))
      g.add(faixaElastica(c, trim, 0.058, 0.070, { lobos: 14, rip: 0.024, seg: 28 }))
      g.add(cordao(c, cordaoM, 0.058, -0.006, {
        dxTopo: 0.018, dxFim: 0.024, r: 0.0044, ponteira: metalOp,
      }))

      const coxaFrac = Math.abs(HEM_Y) / T
      N.pernas(c, m, { rCoxaTopo: R_TOPO, rCoxa: R_HEM, coxaFrac, canelaFrac: 0 })
      N.nasPernas(c, 'Upper', () => boca(R_HEM, HEM_Y, m, avesso))

      const rEm = (y) => R_TOPO + (R_HEM - R_TOPO) * ((0.020 - y) / (0.020 - HEM_Y))
      N.nasPernas(c, 'Upper', (sgn) => {
        const p = new THREE.Group()
        const yB = -0.135
        const rB = rEm(yB)
        const bolso = new THREE.Group()
        bolso.position.set(sgn * rB, yB, 0.004)
        bolso.rotation.y = sgn * Math.PI / 2
        bolso.add(N.bloco(0.072, 0.080, 0.028, 0.013, m).translateZ(-0.005))
        for (const lado of [1, -1]) {
          bolso.add(N.bloco(0.011, 0.074, 0.022, 0.005, escuro)
            .translateX(lado * 0.030).translateZ(-0.010))
        }
        const aba = N.bloco(0.078, 0.024, 0.030, 0.009, escuro)
        aba.position.set(0, 0.044, -0.002)
        aba.rotation.x = -0.15
        bolso.add(aba)
        const stud = botaoPressao(0.0040, metalOp)
        stud.position.set(0, 0.030, 0.014)
        bolso.add(stud)
        p.add(bolso)

        // argola D: hardware puramente decorativo, pendurado no lado de fora.
        const argola = N.anel(0.0090, 0.0018, metalOp, 5, 10)
        argola.position.set(sgn * (rB + 0.002), yB + 0.052, 0.008)
        argola.rotation.y = sgn * Math.PI / 2
        p.add(argola)
        return p
      })
      return g
    },
  },
]

export default CALCAS_EXTRA
