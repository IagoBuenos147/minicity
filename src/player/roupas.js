import * as THREE from 'three'
import { solid, stdMat, tex } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/player/roupas.js — os catalogos de ROUPA, no mesmo padrao dos catalogos
// de rosto do appearance.js: array de { id, nome, esconde?, build(ctx) }.
//
// Regras deste arquivo:
//
// 1. TUDO NASCE NOVO A CADA build(). Nada de geometria de modulo compartilhada
//    entre bonecos: character.js da dispose() no que sai do slot, e uma
//    geometria compartilhada morreria na troca de roupa de UM jogador levando
//    a roupa de todos os outros junto. Material e textura, sim, sao cacheados
//    (materials.js) — esses ninguem descarta.
//
// 2. `esconde` lista os pedacos de PELE que a peca cobre ('torso', 'peito',
//    'braco', 'antebraco', 'coxa', 'canela', 'pe'). O corpo por baixo some:
//    e o que impede a pele de atravessar o tecido e ainda economiza o corpo
//    inteiro em 20 bonecos na tela. CUIDADO: esconder mais do que a peca cobre
//    e a causa numero 1 de buraco. O corpo nu tem pedacos que NAO estao nessa
//    lista e continuam la — a bola do cotovelo, a do joelho, a mao e o
//    tornozelo. Manga que apaga 'antebraco' e para 3 cm antes do pulso deixa a
//    mao solta no ar e o furo da palma aberto; foi um dos bugs desta rodada.
//
// 3. O build recebe o ctx do character.js e devolve UM Object3D no espaco da
//    ancora do slot (torso, hips, head, foot...). O que precisa de outra junta
//    — a outra perna, o outro braco, o outro pe — vai por ctx.montar(obj,
//    'nomeDaParte'), que pendura na junta certa e registra pra limpeza.
//
// 4. TECIDO NASCE FORA DA PELE, SEMPRE. O corpo nu e o MESMO perfil da roupa
//    em escala 0.965 (NU_S, character.js). Quem desenhava a peca com raio
//    fixo — a barra da camiseta, o cos da calca, a gola — cruzava a lathe no
//    vinco do perfil e o rasterizador escolhia um pixel de cada: era o "risco
//    de pele" que aparecia em volta da cintura e do pescoco. Por isso NINGUEM
//    mais escreve raio na mao: casca()/fatia() leem o perfil do proprio corpo
//    e multiplicam pela folga da peca (FOLGA_*).
//
// 5. ACESSORIO FICA FISICAMENTE FORA DO TECIDO. Colar, relogio e anel nascem
//    do raio da peca mais larga do catalogo + SOBRA_ACESSORIO. Resolver isso com
//    renderOrder ou depthTest:false poria a corrente na frente da parede
//    quando o jogador passasse atras de uma — acessorio que atravessa parede e
//    pior que acessorio escondido.
//
// Indice 0 e sempre "nenhum"/"descalco" (tabela do PERSONAGEM.md); CALCAS e a
// unica excecao, porque calca nenhuma nao e uma opcao de vestuario: o indice 0
// dela e o jeans, que e o padrao.
//
// BLUSA E JAQUETA SAO UMA ABA SO. BLUSAS e o catalogo unico do tronco —
// camiseta, camisa, moletom, jaqueta, blazer e paleto moram todos nele, e as
// jaquetas foram adaptadas pra viver SEM blusa por baixo (a casca aberta na
// frente com lapela nas bordas le como jaqueta aberta; a casca fechada por
// cima do peito nu lia como bug). JAQUETAS ficou vazio — ver o porque la
// embaixo, junto do array.
// ---------------------------------------------------------------------------

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Escurece/clareia uma cor (sombra de tecido, sola, barra). */
function esc(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex()
}

const tecido = (cor, r = 0.9) => solid(cor, r, 0.0)
const couro = (cor) => solid(cor, 0.42, 0.08)
// Casca aberta (jaqueta, aba de chapeu, lapela) tem que ser DoubleSide: a
// lathe so gera face pra fora e pela abertura da frente se veria o mundo do
// outro lado do boneco em vez do avesso do pano.
const tecido2 = (cor, r = 0.9) => solid(cor, r, 0.0, { side: THREE.DoubleSide })
const couro2 = (cor) => solid(cor, 0.42, 0.08, { side: THREE.DoubleSide })
// Metal com metalness BAIXA de proposito: a cena nao tem environment map, e
// metal quase puro sem reflexo pra refletir sai preto (a cruz de prata sumia
// no peito). 0.35 mantem o brilho especular do sol e a cor legivel.
const metal = (cor) => solid(cor, 0.26, 0.35)

// --- as folgas -------------------------------------------------------------
// Multiplicador sobre o raio do PERFIL DO CORPO. A pele esta em 0.965, entao
// 1.045 ja e 8 mm de tecido no peito — o bastante pro depth buffer separar as
// duas superficies a 30 m de camera.
const FOLGA_JUSTA = 1.045  // camiseta, camisa, regata
const FOLGA_SOLTA = 1.062  // moletom, corta-vento
const FOLGA_LARGA = 1.070  // TETO do catalogo: jaqueta, paleto, blusao
// 4 mm alem da peca MAIS LARGA do catalogo (o raio ja vem multiplicado por
// FOLGA_LARGA). Maior que isso e o colar comeca a boiar na frente do peito nu;
// menor que isso e o depth buffer perde a briga de longe.
//
// NAO E o ctx.foraDaRoupa do character.js, e por isso nao se chama igual. La o
// numero (1,2 cm) e quanto se sobe a partir do RAIO DA PELE pra sair do pano,
// medido no olho; aqui a conta e exata — o raio da peca mais larga sai do mesmo
// perfil que ela usa — e o que sobra e so a margem do depth buffer. Duas
// grandezas diferentes com o mesmo nome era o jeito garantido de alguem trocar
// uma pela outra e enterrar a corrente de novo.
const SOBRA_ACESSORIO = 0.004
// Raio da gola mais alta do catalogo (a de gola alta), no espaco do pescoco.
// E o teto que o colar usa: qualquer corrente nasce de RAIO_GOLA_ALTA +
// SOBRA_ACESSORIO pra sobresair ATE dela.
const RAIO_GOLA_ALTA = 0.0555
// Onde a manga comprida morre, medido acima do pulso, e o raio do tecido la.
// A manga PARA antes do relogio de proposito: manga ate a mao obrigaria uma
// pulseira de raio 6 cm pra sobresair, e relogio frouxo le pior que relogio
// coberto.
const MANGA_FIM_Y = 0.045
const MANGA_R_BRACO = 0.052
const MANGA_R_PUNHO = 0.0465
// Quanto o dedo ja se curvou 1.4 cm abaixo do no. O aro deita nesse plano; um
// aro horizontal cortava o dedo em diagonal e afundava de um lado so.
const INCLINA_DEDO = 0.26

function malha(geo, mat, x = 0, y = 0, z = 0) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(x, y, z)
  return m
}

/** Cilindro com a junta no MEIO (a posicao ja entra como centro). */
function tubo(rTop, rBot, h, mat, seg = 14, aberto = false) {
  return malha(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, aberto), mat)
}

function caixa(w, h, d, mat) {
  return malha(new THREE.BoxGeometry(w, h, d), mat)
}

function bola(r, mat, seg = 12) {
  return malha(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat)
}

function anel(r, t, mat, seg = 8, volta = 18) {
  return malha(new THREE.TorusGeometry(r, t, seg, volta), mat)
}

/** Bloco de cantos redondos barato (o roundedBox de materials.js custa caro). */
function bloco(w, h, d, r, mat) {
  const g = new THREE.SphereGeometry(1, 10, 6)
  // esfera esticada com os polos achatados le como bloco arredondado a 3 m e
  // gasta 1/3 dos triangulos de um ExtrudeGeometry com bevel
  const pos = g.attributes.position
  const k = 1 - Math.min(0.85, r / Math.max(w, h, d))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const f = (v) => Math.sign(v) * Math.min(1, Math.abs(v) / Math.max(1e-4, k))
    pos.setXYZ(i, f(x) * w / 2, f(y) * h / 2, f(z) * d / 2)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return sh(new THREE.Mesh(g, mat))
}

// --- perfil do corpo -------------------------------------------------------
// character.js entrega os MESMOS arrays de perfil que ele usa pra pele
// (ctx.perfil.PELVIS / PEITO / MANGA). Toda peca de tronco sai deles: e o
// unico jeito de o tecido acompanhar o vinco do quadril em vez de cortar ele.

/** Raio do perfil na altura y (interpolacao linear, extremos grampeados). */
function raioPerfil(perfil, y) {
  const n = perfil.length
  if (y <= perfil[0][1]) return perfil[0][0]
  if (y >= perfil[n - 1][1]) return perfil[n - 1][0]
  for (let i = 1; i < n; i++) {
    const a = perfil[i - 1], b = perfil[i]
    if (y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
  }
  return perfil[n - 1][0]
}

/**
 * Recorta o perfil entre y0 e y1 GUARDANDO os vertices do meio. Cortar so nas
 * pontas e interpolar reto entre elas era o bug da barra: a corda passava por
 * dentro do vinco do quadril e o tecido do corpo furava a propria barra.
 */
function fatia(perfil, y0, y1) {
  const out = [[raioPerfil(perfil, y0), y0]]
  for (const p of perfil) if (p[1] > y0 && p[1] < y1) out.push([p[0], p[1]])
  out.push([raioPerfil(perfil, y1), y1])
  return out
}

/** LatheGeometry crua: perfil [[r,y],...], achatamento em Z e arco opcional. */
function revolver(perfil, seg = 20, flatZ = 1, phi0 = 0, phiLen = Math.PI * 2) {
  const pts = perfil.map((p) => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, seg, phi0, phiLen)
  if (flatZ !== 1) g.scale(1, 1, flatZ)
  g.computeVertexNormals()
  return g
}

/**
 * Casca de tecido em cima de um perfil do CORPO: raio = perfil * folga + extra.
 * phi = 0 e a FRENTE do boneco (a lathe do three usa sin em x e cos em z),
 * entao uma abertura centrada na frente sai com phi0 = ab/2 e phiLen = 2pi-ab.
 */
function casca(c, perfil, o = {}) {
  const f = o.folga === undefined ? 1 : o.folga
  const e = o.extra || 0
  const p = perfil.map((q) => [q[0] * f + e, q[1]])
  return revolver(p, o.seg || c.medida.TORSO_SEG, c.medida.FLAT_Z,
    o.phi0 === undefined ? 0 : o.phi0,
    o.phiLen === undefined ? Math.PI * 2 : o.phiLen)
}

/**
 * Z da superficie da peca no ponto (x, y) da FRENTE do tronco.
 * A secao NAO e um circulo: latheGeo achata tudo por FLAT_Z, entao a superficie
 * em x = 0.07 esta 1,5 cm mais atras do que no meio do peito. Usar o z do meio
 * pra um bolso lateral deixava o bolso boiando na frente do corpo — e foi
 * assim que a alca da regata nasceu no ar em vez de nascer no ombro.
 */
function frenteXZ(c, perfil, x, y, folga, fora = 0.004) {
  const a = raioPerfil(perfil, y) * folga + fora
  const k = Math.min(0.985, Math.abs(x) / a)
  return a * c.medida.FLAT_Z * Math.sqrt(1 - k * k)
}

/** Atalho pro meio do peito (x = 0): botao, ziper, cordao. */
function frenteZ(c, perfil, y, folga, fora = 0.004) {
  return frenteXZ(c, perfil, 0, y, folga, fora)
}

// ===========================================================================
// CHAPEUS — ancora: head (origem no CENTRO do cranio, +Z = frente)
// ===========================================================================

// Raio de apoio da copa: a cabeca tem 13 formatos e todos cabem dentro deste
// elipsoide com folga. Chapeu que encosta na pele some no cranio comprido.
function apoio(c) {
  const H = c.medida.HEAD
  return { rx: H.rx * 1.06, ry: H.ry, rz: H.rz * 1.06 }
}

/**
 * Calota que segue o cranio: esfera cortada em thetaMax e escalada nos raios da
 * cabeca, entao a borda cai naturalmente na altura certa.
 * Devolve { mesh, y, r }: onde a borda parou e com que raio.
 */
function calota(H, mat, thetaMax, folga = 1.03, wSeg = 22, hSeg = 12) {
  const m = sh(new THREE.Mesh(
    new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, thetaMax), mat,
  ))
  m.scale.set(H.rx * folga, H.ry * folga, H.rz * folga)
  const y = H.ry * folga * Math.cos(thetaMax)
  return { mesh: m, y, r: H.rx * folga * Math.sin(thetaMax) }
}

/** Meia-lua de aba (o meio disco do bone), com a aresta reta dentro da copa. */
function abaCurva(r, esp, mat, seg = 20) {
  return sh(new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, esp, seg, 1, false, -Math.PI / 2, Math.PI), mat,
  ))
}

export const CHAPEUS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'chapeu',
    nome: 'Chapeu',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0x4a4038, 0.85)
      const faixa = tecido(0x2a2320, 0.8)
      const aba = tubo(A.rx * 1.62, A.rx * 1.72, 0.014, m, 22)
      aba.position.y = A.ry * 0.50
      aba.scale.z = 0.94
      g.add(aba)
      const copa = tubo(A.rx * 1.02, A.rx * 1.14, 0.115, m, 20)
      copa.position.y = A.ry * 0.50 + 0.058
      g.add(copa)
      const fita = tubo(A.rx * 1.16, A.rx * 1.16, 0.026, faixa, 20)
      fita.position.y = A.ry * 0.50 + 0.020
      g.add(fita)
      return g
    },
  },
  {
    id: 'bone',
    nome: 'Bone',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0xb03a3a, 0.9)
      // A copa e uma calota do PROPRIO cranio: meia esfera solta sobrava 2 cm
      // em volta e o bone lia como chapeu-coco. A folga de 13% e o minimo pra
      // cobrir o CABELO (a casca do cabelo curto ja e 1.078 do cranio) — sem
      // ela as mechas atravessam o pano.
      const copa = calota(A, m, 1.25, 1.13)
      g.add(copa.mesh)
      // Meia lua ESTREITA e comprida: o meio disco de raio grande da primeira
      // versao passava dos dois lados da cabeca e o bone virava chapeu-coco.
      const aba = abaCurva(copa.r, 0.012, m)
      aba.scale.set(0.92, 1, 1.30)
      // logo ABAIXO da borda da copa e adiantada em Z: a aresta reta do meio
      // disco fica escondida dentro da copa em vez de cortar a superficie dela
      aba.position.set(0, copa.y - 0.006, 0.048)
      aba.rotation.x = 0.04
      g.add(aba)
      const botao = bola(0.014, tecido(esc(0xb03a3a, 0.7)), 8)
      botao.position.y = A.ry * 1.06
      g.add(botao)
      return g
    },
  },
  {
    id: 'gorro',
    nome: 'Gorro',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0x3d5c8a
      const m = tecido(cor, 0.95)
      // theta 1.17 para a ~10 cm acima do centro da cabeca: acima da
      // sobrancelha (y = 0.128) o gorro e gorro, abaixo dela vira capacete
      const copa = calota(A, m, 1.17, 1.14)
      g.add(copa.mesh)
      const barra = anel(copa.r * 0.99, 0.020, tecido(esc(cor, 1.18), 0.95), 8, 22)
      barra.rotation.x = Math.PI / 2
      barra.scale.set(1, 1, A.rz / A.rx)
      barra.position.y = copa.y
      g.add(barra)
      return g
    },
  },
  {
    id: 'cowboy',
    nome: 'Cowboy',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0x8a6a3e, 0.9)
      const aba = tubo(A.rx * 2.05, A.rx * 2.15, 0.014, m, 24)
      aba.position.y = A.ry * 0.46
      // pontas viradas pra cima: a aba e um cone MUITO aberto (rTop < rBot) e a
      // borda grossa por cima faz o vinco que o chapeu de cowboy tem
      g.add(aba)
      const borda = anel(A.rx * 2.10, 0.016, m, 6, 24)
      borda.rotation.x = Math.PI / 2
      borda.position.y = A.ry * 0.46 + 0.012
      borda.scale.y = 0.55
      g.add(borda)
      const copa = tubo(A.rx * 1.00, A.rx * 1.16, 0.155, m, 20)
      copa.position.y = A.ry * 0.46 + 0.078
      g.add(copa)
      const vinco = caixa(A.rx * 0.30, 0.06, A.rz * 1.9, tecido(esc(0x8a6a3e, 0.78)))
      vinco.position.y = A.ry * 0.46 + 0.140
      g.add(vinco)
      const fita = tubo(A.rx * 1.13, A.rx * 1.16, 0.026, couro(0x2e2018), 20)
      fita.position.y = A.ry * 0.46 + 0.020
      g.add(fita)
      return g
    },
  },
  {
    id: 'touca',
    nome: 'Touca com pompom',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0xc9c2b4
      const m = tecido(cor, 0.98)
      const copa = calota(A, m, 1.20, 1.16, 20, 14)
      copa.mesh.position.y = 0.014
      g.add(copa.mesh)
      const barra = anel(copa.r * 0.99, 0.024, tecido(esc(cor, 0.86), 0.98), 8, 22)
      barra.rotation.x = Math.PI / 2
      barra.scale.set(1, 1, A.rz / A.rx)
      barra.position.y = copa.y + 0.014
      g.add(barra)
      const pom = bola(0.042, tecido(esc(cor, 1.05), 1.0), 10)
      pom.position.y = A.ry * 1.10
      g.add(pom)
      return g
    },
  },
  {
    id: 'texano',
    nome: 'Chapeu texano',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0xb08d54
      const m = tecido(cor, 0.88)
      // A aba NAO e um disco: e um perfil revolucionado que mergulha no meio e
      // sobe na ponta. Disco chapado le como sombrero; a curva pra cima e o
      // que separa o texano do chapeu de aba reta que ja existe no catalogo.
      const aba = sh(new THREE.Mesh(revolver([
        [A.rx * 0.98, 0.034], [A.rx * 1.35, -0.010], [A.rx * 1.80, -0.016],
        [A.rx * 2.06, 0.010], [A.rx * 2.14, 0.046],
      ], 26, 1), tecido2(cor, 0.88)))
      aba.position.y = A.ry * 0.44
      aba.scale.z = 1.12
      g.add(aba)
      const copa = tubo(A.rx * 0.96, A.rx * 1.15, 0.180, m, 20)
      copa.position.y = A.ry * 0.44 + 0.092
      g.add(copa)
      // copa AMASSADA: dois amassos laterais e um vinco no topo. Sem eles a
      // copa e um cone liso e o chapeu vira balde.
      const dente = tecido(esc(cor, 0.80), 0.88)
      for (const sgn of [1, -1]) {
        const d = bola(1, dente, 8)
        d.scale.set(0.030, 0.062, A.rz * 0.90)
        d.position.set(sgn * A.rx * 0.92, A.ry * 0.44 + 0.130, 0)
        g.add(d)
      }
      const vinco = caixa(A.rx * 0.26, 0.052, A.rz * 1.85, dente)
      vinco.position.y = A.ry * 0.44 + 0.172
      g.add(vinco)
      const fita = tubo(A.rx * 1.10, A.rx * 1.14, 0.030, couro(0x4a3320), 20)
      fita.position.y = A.ry * 0.44 + 0.024
      g.add(fita)
      // pena espetada na fita: e o detalhe que ninguem mais tem
      const pena = caixa(0.010, 0.115, 0.004, tecido(0xa8323a, 0.9))
      pena.position.set(A.rx * 0.86, A.ry * 0.44 + 0.078, A.rz * 0.62)
      pena.rotation.set(0.22, 0, -0.30)
      g.add(pena)
      return g
    },
  },
  {
    id: 'aba-reta',
    nome: 'Bone de aba reta',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0x1f2a44
      const m = tecido(cor, 0.9)
      const copa = calota(A, m, 1.22, 1.14)
      g.add(copa.mesh)
      // frente ALTA e chapada: o boy usa a copa estruturada, e e ela que
      // separa este bone do bone curvo (que tem a testa colada no cranio)
      const frente = caixa(copa.r * 1.34, 0.085, 0.014, m)
      frente.position.set(0, copa.y + 0.052, A.rz * 0.94)
      frente.rotation.x = -0.06
      g.add(frente)
      // aba RETA: caixa, nao meia lua. Nada de curva, nada de inclinacao.
      const aba = caixa(copa.r * 1.74, 0.013, 0.215, m)
      aba.position.set(0, copa.y - 0.008, A.rz * 0.44 + 0.100)
      g.add(aba)
      // etiqueta prateada colada na aba: o adesivo que o boy nao tira
      const eti = caixa(0.034, 0.003, 0.024, solid(0xd8dce2, 0.35, 0.35))
      eti.position.set(copa.r * 0.42, copa.y - 0.0005, A.rz * 0.44 + 0.150)
      g.add(eti)
      const traseira = caixa(copa.r * 0.70, 0.030, 0.012, tecido(esc(cor, 1.6), 0.9))
      traseira.position.set(0, copa.y + 0.016, -A.rz * 0.98)
      g.add(traseira)
      return g
    },
  },
  {
    id: 'viseira',
    nome: 'Viseira de sol',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0xf2f0e6
      const m = tecido(cor, 0.85)
      // Sem copa: a viseira e so o arco e a aba, e o cabelo continua aparecendo
      // por cima. Por isso o arco e um cilindro ABERTO nas duas pontas.
      const arco = calota(A, m, 1.30, 1.10)
      const banda = tubo(arco.r * 1.005, arco.r * 1.02, 0.056, m, 22, true)
      banda.scale.z = A.rz / A.rx
      banda.position.y = arco.y + 0.014
      g.add(banda)
      const debrum = anel(arco.r * 1.01, 0.008, tecido(0x2fb3a8, 0.85), 6, 22)
      debrum.rotation.x = Math.PI / 2
      debrum.scale.set(1, 1, A.rz / A.rx)
      debrum.position.y = arco.y - 0.012
      g.add(debrum)
      const aba = abaCurva(arco.r, 0.010, tecido(0x2fb3a8, 0.85), 20)
      aba.scale.set(0.96, 1, 1.24)
      aba.position.set(0, arco.y + 0.002, 0.040)
      aba.rotation.x = 0.10
      g.add(aba)
      return g
    },
  },
  {
    id: 'cartola',
    nome: 'Cartola',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = solid(0x201d24, 0.30, 0.06)
      const aba = tubo(A.rx * 1.56, A.rx * 1.62, 0.016, m, 26)
      aba.position.y = A.ry * 0.42
      aba.scale.z = 0.97
      g.add(aba)
      // 26 cm de copa reta: a altura E a identidade da peca, e a boca fechada
      // em cima (o tubo nasce com tampa) evita o buraco visto de cima
      const copa = tubo(A.rx * 1.08, A.rx * 1.12, 0.260, m, 22)
      copa.position.y = A.ry * 0.42 + 0.132
      g.add(copa)
      const fita = tubo(A.rx * 1.15, A.rx * 1.15, 0.040, solid(0x7a2230, 0.5), 22)
      fita.position.y = A.ry * 0.42 + 0.030
      g.add(fita)
      const fivela = caixa(0.030, 0.026, 0.010, metal(0xd8b134))
      fivela.position.set(0, A.ry * 0.42 + 0.030, A.rz * 1.16)
      g.add(fivela)
      return g
    },
  },
  {
    id: 'capuz',
    nome: 'Capuz caido',
    build(c) {
      // O capuz caido nasce no PEITO e nao na cabeca: preso na cabeca ele
      // giraria junto com o olhar e ficaria batendo no ombro. Por isso o build
      // devolve null e monta a peca na outra junta.
      const cor = 0x4a5260
      const m = tecido2(cor, 0.98)
      const g = new THREE.Group()
      const casco = sh(new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, 1.95), m,
      ))
      casco.scale.set(0.126, 0.146, 0.116)
      casco.rotation.x = 0.80
      casco.position.set(0, 0.176, -0.078)
      g.add(casco)
      const boca = anel(0.108, 0.017, tecido(esc(cor, 0.84), 0.98), 8, 20)
      boca.rotation.set(Math.PI / 2 + 0.80, 0, 0)
      boca.scale.set(1.06, 1, 0.90)
      boca.position.set(0, 0.222, -0.010)
      g.add(boca)
      for (const sgn of [1, -1]) {
        const cordao = tubo(0.005, 0.004, 0.085, tecido(0xe6e2d8, 0.9), 6)
        cordao.position.set(sgn * 0.030, 0.170, 0.098)
        cordao.rotation.x = -0.18
        g.add(cordao)
      }
      c.montar(g, 'chest')
      return null
    },
  },
]

// ===========================================================================
// CALCADOS â€” ancora: footR (o par sai por ctx.montar em footL)
// ===========================================================================
// Espaco do pe: origem no TORNOZELO, chao em medida.SOLA_Y, +Z = frente.

/** Monta o mesmo sapato nos dois pes (o pe e simetrico em X, nao precisa espelhar). */
function par(c, fabrica) {
  const d = fabrica()
  c.montar(fabrica(), 'footL')
  return d
}

function sapatoBase(c, o) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // A sola fica MAIOR e mais baixa que o corpo do sapato de proposito: e a
  // borda escura em volta que faz o pe ler como calcado e nao como bloco.
  const topoSola = S + o.solaH * 1.5
  const corpo = bloco(o.larg, o.alt, o.comp, o.raio, o.mat)
  corpo.position.set(0, topoSola + o.alt / 2, o.frente)
  g.add(corpo)
  const sola = bloco(o.larg * 1.07, o.solaH * 2.2, o.comp * 1.05, o.solaH, o.matSola)
  sola.position.set(0, S + o.solaH * 1.05, o.frente)
  g.add(sola)
  // COLARINHO DO TORNOZELO. A capsula da canela termina numa bola de raio
  // 0.045 centrada na junta do pe, e o bloco do sapato tem meia-largura 0.045
  // exatamente ali em cima: as duas superficies se encostavam e o serrilhado
  // de pele em volta do tornozelo aparecia em TODO calcado baixo. Quem ja tem
  // cano proprio (bota, coturno) passa gola:false.
  if (o.gola !== false) {
    const gola = tubo(0.053, 0.056, 0.070, o.matGola || o.mat, 14)
    gola.position.set(0, S + 0.085, o.frente * 0.25)
    gola.scale.z = 1.05
    g.add(gola)
  }
  return g
}

/** Biqueira: volume achatado na frente do sapato, EMENDADO no corpo. Antes era
 *  uma esfera solta e lia como bola de gude colada na ponta do pe. */
function biqueira(c, o, mat) {
  const b = bloco(o.larg * 0.90, o.alt * 0.62, o.comp * 0.36, o.raio * 0.8, mat)
  b.position.set(0, c.medida.SOLA_Y + o.solaH * 1.5 + o.alt * 0.30, o.frente + o.comp * 0.33)
  return b
}

/** Cadarco: fileira de tirinhas subindo pelo peito do pe. */
function cadarco(g, mat, S, n, y0, z0, dy, dz, larg = 0.046) {
  for (let i = 0; i < n; i++) {
    const l = caixa(larg, 0.008, 0.012, mat)
    l.position.set(0, S + y0 + i * dy, z0 + i * dz)
    g.add(l)
  }
}

export const CALCADOS = [
  { id: 'descalco', nome: 'Descalco', build() { return null } },
  {
    id: 'tenis',
    nome: 'Tenis',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const cor = c.cor.calcado
        const o = {
          larg: 0.100, alt: 0.076, comp: 0.230, raio: 0.030, frente: 0.038,
          solaH: 0.015, mat: tecido(cor, 0.6), matSola: tecido(esc(cor, 0.34), 0.9),
          matGola: tecido(esc(cor, 0.8), 0.7),
        }
        const g = sapatoBase(c, o)
        g.add(biqueira(c, o, o.mat))
        cadarco(g, tecido(esc(cor, 0.58), 0.8), c.medida.SOLA_Y, 3, 0.094, 0.030, -0.008, 0.032)
        return g
      })
    },
  },
  {
    id: 'bota',
    nome: 'Bota',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0x5a3c22
        const m = couro(cor)
        const o = {
          larg: 0.102, alt: 0.086, comp: 0.225, raio: 0.026, frente: 0.034,
          solaH: 0.020, mat: m, matSola: tecido(esc(cor, 0.28), 0.95), gola: false,
        }
        const g = sapatoBase(c, o)
        const cano = tubo(0.058, 0.066, 0.135, m, 14)
        cano.position.set(0, S + 0.155, -0.012)
        cano.scale.z = 1.15
        g.add(cano)
        const dobra = anel(0.058, 0.010, couro(esc(cor, 1.25)), 6, 14)
        dobra.rotation.x = Math.PI / 2
        dobra.scale.y = 1.15
        dobra.position.set(0, S + 0.216, -0.012)
        g.add(dobra)
        return g
      })
    },
  },
  {
    id: 'social',
    nome: 'Sapato social',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        // preto puro some na sombra: 0x2b2830 ainda le como sapato preto e
        // mantem a forma visivel no fim da tarde
        const m = solid(0x2b2830, 0.24, 0.10)
        const o = {
          larg: 0.088, alt: 0.062, comp: 0.248, raio: 0.020, frente: 0.046,
          solaH: 0.011, mat: m, matSola: tecido(0x4a3f34, 0.9),
          matGola: solid(0x201d24, 0.3, 0.1),
        }
        const g = sapatoBase(c, o)
        // bico fino e comprido: e o que separa social de tenis na silhueta
        const bico = bloco(0.052, 0.036, 0.086, 0.018, m)
        bico.position.set(0, c.medida.SOLA_Y + o.solaH * 1.5 + 0.018, o.frente + 0.094)
        g.add(bico)
        return g
      })
    },
  },
  {
    id: 'chinelo',
    nome: 'Chinelo',
    // O chinelo esconde o pe padrao e desenha o SEU: a sola precisa entrar
    // debaixo do pe, e o pe do corpo ja nasce plantado no chao.
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const g = new THREE.Group()
        const pele = solid(c.cor.pele, 0.68, 0.0)
        const sola = bloco(0.096, 0.024, 0.228, 0.012, tecido(0x2f3a4a, 0.85))
        sola.position.set(0, S + 0.012, 0.034)
        g.add(sola)
        const pe = bloco(0.082, 0.068, 0.185, 0.030, pele)
        pe.position.set(0, S + 0.024 + 0.034, 0.028)
        g.add(pe)
        const dedos = bola(1, pele, 10)
        dedos.scale.set(0.038, 0.020, 0.026)
        dedos.position.set(0, S + 0.040, 0.112)
        g.add(dedos)
        // tiras POR CIMA do peito do pe (y do topo do bloco do pe): 2 cm mais
        // baixo elas somem dentro do proprio pe
        const m = tecido(0x1d2530, 0.8)
        for (const sgn of [1, -1]) {
          const t = caixa(0.013, 0.011, 0.098, m)
          t.position.set(sgn * 0.023, S + 0.088, 0.076)
          t.rotation.set(0.30, -sgn * 0.44, 0)
          g.add(t)
        }
        const dedeira = caixa(0.010, 0.030, 0.010, m)
        dedeira.position.set(0, S + 0.048, 0.108)
        g.add(dedeira)
        return g
      })
    },
  },
  {
    id: 'cano-alto',
    nome: 'Tenis cano alto',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const cor = c.cor.calcado
        const S = c.medida.SOLA_Y
        const o = {
          larg: 0.100, alt: 0.072, comp: 0.226, raio: 0.028, frente: 0.036,
          solaH: 0.017, mat: tecido(cor, 0.6), matSola: tecido(esc(cor, 0.30), 0.9),
          gola: false,
        }
        const g = sapatoBase(c, o)
        g.add(biqueira(c, o, o.mat))
        const cano = tubo(0.056, 0.064, 0.100, tecido(cor, 0.65), 14)
        cano.position.set(0, S + 0.136, -0.008)
        cano.scale.z = 1.12
        g.add(cano)
        cadarco(g, tecido(esc(cor, 0.52), 0.8), S, 4, 0.152, 0.026, -0.026, 0.010, 0.044)
        return g
      })
    },
  },
  {
    id: 'bota-cowboy',
    nome: 'Bota de cowboy',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0x7a4a24
        const m = couro(cor)
        const o = {
          larg: 0.094, alt: 0.070, comp: 0.220, raio: 0.022, frente: 0.030,
          solaH: 0.010, mat: m, matSola: couro(esc(cor, 0.35)), gola: false,
        }
        const g = sapatoBase(c, o)
        // BICO fino e SALTO inclinado: a silhueta inteira da bota de montaria
        // esta nesses dois volumes, e nenhum outro calcado do catalogo os tem
        const bico = bloco(0.044, 0.032, 0.090, 0.014, m)
        bico.position.set(0, S + 0.015 + 0.014, o.frente + 0.098)
        g.add(bico)
        const salto = bloco(0.062, 0.044, 0.062, 0.010, couro(esc(cor, 0.42)))
        salto.position.set(0, S + 0.022, -0.038)
        salto.rotation.x = -0.16
        g.add(salto)
        const cano = tubo(0.062, 0.058, 0.190, m, 14)
        cano.position.set(0, S + 0.190, -0.010)
        cano.scale.z = 1.12
        g.add(cano)
        // costura em V na canela: o carimbo visual da bota texana
        const linha = couro(0xd9c08a)
        for (const sgn of [1, -1]) {
          const l = caixa(0.006, 0.090, 0.004, linha)
          l.position.set(sgn * 0.026, S + 0.212, 0.062)
          l.rotation.z = sgn * 0.30
          g.add(l)
        }
        const alca = caixa(0.008, 0.032, 0.010, couro(esc(cor, 0.7)))
        alca.position.set(0.052, S + 0.278, -0.010)
        g.add(alca)
        return g
      })
    },
  },
  {
    id: 'corrida',
    nome: 'Sapatilha de corrida',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0xb6e02a
        const m = tecido(cor, 0.72)
        const o = {
          larg: 0.098, alt: 0.066, comp: 0.234, raio: 0.032, frente: 0.040,
          solaH: 0.024, mat: m, matSola: tecido(0xf2f0e6, 0.85),
          matGola: tecido(0x22262c, 0.9),
        }
        // entressola GORDA e branca: e o volume que grita tenis de academia
        const g = sapatoBase(c, o)
        g.add(biqueira(c, o, tecido(0x22262c, 0.7)))
        for (const sgn of [1, -1]) {
          const risca = caixa(0.006, 0.030, 0.150, tecido(0x22262c, 0.6))
          risca.position.set(sgn * 0.049, S + 0.060, 0.046)
          risca.rotation.set(0.10, 0, sgn * 0.12)
          g.add(risca)
        }
        const lingua = caixa(0.048, 0.012, 0.060, tecido(0x22262c, 0.9))
        lingua.position.set(0, S + 0.098, 0.052)
        lingua.rotation.x = 0.22
        g.add(lingua)
        cadarco(g, tecido(0xf2f0e6, 0.8), S, 3, 0.096, 0.036, -0.010, 0.028, 0.044)
        return g
      })
    },
  },
  {
    id: 'sandalia',
    nome: 'Sandalia de couro',
    // Igual ao chinelo, desenha o proprio pe: a tira de calcanhar so faz
    // sentido em cima de um pe que a peca controla.
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const g = new THREE.Group()
        const pele = solid(c.cor.pele, 0.68, 0.0)
        const cortica = tecido(0xc8a26a, 0.95)
        const tira = couro(0x6b4a2c)
        const sola = bloco(0.098, 0.030, 0.232, 0.010, cortica)
        sola.position.set(0, S + 0.015, 0.034)
        g.add(sola)
        const solado = bloco(0.100, 0.012, 0.234, 0.006, couro(0x3a2a1c))
        solado.position.set(0, S + 0.004, 0.034)
        g.add(solado)
        const pe = bloco(0.082, 0.066, 0.185, 0.030, pele)
        pe.position.set(0, S + 0.030 + 0.033, 0.028)
        g.add(pe)
        const dedos = bola(1, pele, 10)
        dedos.scale.set(0.038, 0.020, 0.026)
        dedos.position.set(0, S + 0.046, 0.112)
        g.add(dedos)
        // duas tiras LARGAS cruzando o peito do pe + tira de calcanhar: e o
        // que separa a sandalia do chinelo de dedo
        for (let i = 0; i < 2; i++) {
          const t = caixa(0.104, 0.013, 0.030, tira)
          t.position.set(0, S + 0.086 - i * 0.010, 0.048 + i * 0.046)
          t.rotation.x = 0.14
          g.add(t)
        }
        const calcanhar = caixa(0.088, 0.013, 0.026, tira)
        calcanhar.position.set(0, S + 0.062, -0.056)
        calcanhar.rotation.x = -0.30
        g.add(calcanhar)
        const fivela = caixa(0.014, 0.014, 0.006, metal(0xc9ced4))
        fivela.position.set(0.050, S + 0.084, 0.050)
        g.add(fivela)
        return g
      })
    },
  },
  {
    id: 'coturno',
    nome: 'Coturno',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0x25242a
        const m = couro(cor)
        const o = {
          larg: 0.106, alt: 0.080, comp: 0.228, raio: 0.022, frente: 0.034,
          solaH: 0.024, mat: m, matSola: tecido(0x15161a, 0.98), gola: false,
        }
        const g = sapatoBase(c, o)
        // biqueira reforcada e mais clara: o bico gasto do coturno
        g.add(biqueira(c, o, couro(esc(cor, 1.5))))
        const cano = tubo(0.062, 0.070, 0.210, m, 14)
        cano.position.set(0, S + 0.200, -0.006)
        cano.scale.z = 1.10
        g.add(cano)
        // 5 pares de ilhos subindo o cano: e o detalhe que so ele tem
        const ilho = metal(0xb9bec4)
        for (let i = 0; i < 5; i++) {
          for (const sgn of [1, -1]) {
            const p = malha(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 6), ilho)
            p.rotation.z = Math.PI / 2
            p.position.set(sgn * 0.030, S + 0.132 + i * 0.038, 0.062)
            g.add(p)
          }
          const cad = caixa(0.058, 0.006, 0.006, tecido(0xd8d2c4, 0.9))
          cad.position.set(0, S + 0.150 + i * 0.038, 0.060)
          cad.rotation.z = (i % 2 ? 1 : -1) * 0.22
          g.add(cad)
        }
        const dobra = anel(0.068, 0.012, couro(esc(cor, 1.6)), 6, 14)
        dobra.rotation.x = Math.PI / 2
        dobra.scale.set(1, 1, 1.10)
        dobra.position.set(0, S + 0.300, -0.006)
        g.add(dobra)
        return g
      })
    },
  },
  {
    id: 'mocassim',
    nome: 'Mocassim',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0x6a3f28
        const m = couro(cor)
        const o = {
          larg: 0.092, alt: 0.058, comp: 0.236, raio: 0.026, frente: 0.042,
          solaH: 0.009, mat: m, matSola: couro(esc(cor, 0.45)),
          matGola: couro(esc(cor, 0.9)),
        }
        const g = sapatoBase(c, o)
        // sem cadarco: a tira com a moeda no peito do pe E o mocassim
        const tira = caixa(0.062, 0.014, 0.026, couro(esc(cor, 1.25)))
        tira.position.set(0, S + 0.068, 0.086)
        tira.rotation.x = 0.10
        g.add(tira)
        const vinco = caixa(0.040, 0.010, 0.070, couro(esc(cor, 0.78)))
        vinco.position.set(0, S + 0.072, 0.140)
        vinco.rotation.x = 0.16
        g.add(vinco)
        const moeda = malha(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 8), metal(0xd8b134))
        moeda.rotation.x = 0.20
        moeda.position.set(0, S + 0.077, 0.086)
        g.add(moeda)
        return g
      })
    },
  },
]

// ===========================================================================
// BLUSAS â€” ancora: torso (o peito e as mangas vao por ctx.montar)
// ===========================================================================
// Catalogo UNICO do tronco: camiseta, camisa, moletom, jaqueta, blazer e
// paleto sao todos "blusa". Nao existe vestir dois â€” por isso as jaquetas
// abertas trazem a propria lapela e deixam o peito nu aparecer pela abertura,
// em vez de contar com uma camisa por baixo que nao existe mais.

// Raio em que a lathe do peito FECHA no pescoco. O perfil da pele para em
// r = 0.074 e deixa 2 cm de buraco ate o pescoco: por ele se via o avesso do
// torax (face de tras, descartada pelo culling) e portanto o cenario. Fechar
// com um raio MENOR que o pescoco (0.0515 naquela altura) enterra a aresta
// dentro do cilindro do pescoco e o buraco some em qualquer folga.
const FECHA_PESCOCO = 0.047

/** Perfil do peito recortado na gola e fechado no pescoco. */
function perfilPeito(c, folga, yGola = 0.201) {
  const p = fatia(c.perfil.PEITO, 0, yGola)
  p.push([FECHA_PESCOCO / folga, yGola + 0.004])
  return p
}

/**
 * Corpo da peca: as MESMAS lathes da pele, so que multiplicadas pela folga.
 * o.phi0/o.phiLen abrem a frente (jaqueta); o.perfilBaixo/o.perfilCima trocam
 * o recorte (regata, jaqueta que comeca na cintura).
 */
function troncoTecido(c, mat, o = {}) {
  const folga = o.folga || FOLGA_JUSTA
  const g = new THREE.Group()
  const baixo = o.perfilBaixo || c.perfil.PELVIS
  g.add(sh(new THREE.Mesh(casca(c, baixo, {
    folga, phi0: o.phi0, phiLen: o.phiLen,
  }), mat)))
  const cima = o.perfilCima || perfilPeito(c, folga, o.yGola)
  c.montar(sh(new THREE.Mesh(casca(c, cima, {
    folga, phi0: o.phi0, phiLen: o.phiLen,
  }), mat)), 'chest')
  return g
}

/**
 * Barra: banda de 4 mm por fora do proprio corpo da peca, na altura do
 * quadril. Nasce da FATIA do perfil e nao de raios escritos na mao â€” a versao
 * antiga interpolava reto entre -0.012 e 0.014 e passava POR DENTRO do vinco
 * do perfil em -0.008, e era ali que a camiseta furava a propria barra.
 */
function barra(c, mat, folga, y0 = -0.024, y1 = 0.014) {
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y0, y1), {
    folga, extra: 0.004,
  }), mat))
}

/** Gola: mesma ideia da barra, na boca do decote. Vai montada no 'chest'. */
function gola(c, mat, folga, y0 = 0.182, y1 = 0.202, extra = 0.004) {
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PEITO, y0, y1), {
    folga, extra,
  }), mat))
}

/**
 * Tira vertical grudada na frente (carcela de botao, faixa de ziper, painel de
 * camisa por baixo do paleto). Segue a curva do corpo porque sai do perfil.
 */
function tira(c, mat, perfil, folga, o = {}) {
  return sh(new THREE.Mesh(casca(c, perfil, {
    folga, extra: o.extra === undefined ? 0.005 : o.extra, seg: o.seg || 5,
    phi0: -(o.arco || 0.30) / 2, phiLen: o.arco || 0.30,
  }), mat))
}

/**
 * Borda da abertura: duas tiras estreitas descendo pelo corte da frente. Sem
 * elas a casca aberta le como adesivo de 0 mm de espessura colado no boneco.
 */
function bordaAberta(c, mat, perfil, folga, ab, larg = 0.20, extra = 0.006) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) {
    g.add(sh(new THREE.Mesh(casca(c, perfil, {
      folga, extra, seg: 4,
      phi0: sgn > 0 ? ab / 2 : -ab / 2 - larg, phiLen: larg,
    }), mat)))
  }
  return g
}

/** Botoes na frente, colados na superficie da peca. */
function botoes(c, mat, perfil, folga, n, y0, y1, r = 0.0075) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? y0 : y0 + (y1 - y0) * (i / (n - 1))
    const b = malha(new THREE.CylinderGeometry(r, r, 0.004, 8), mat,
      0, y, frenteZ(c, perfil, y, folga, 0.010))
    b.rotation.x = Math.PI / 2
    g.add(b)
  }
  return g
}

/** Bolso chapado: caixa fina com o fundo ENTERRADO no tecido. */
function bolso(c, mat, perfil, folga, o) {
  const b = caixa(o.w, o.h, 0.018, mat)
  b.position.set(o.x || 0, o.y, frenteXZ(c, perfil, o.x || 0, o.y, folga, o.fora || 0.003))
  return b
}

/** Manga curta (perfil unico: domo + tubo + bainha), nos dois ombros. */
function mangaCurta(c, mat) {
  for (const lado of ['armRUpper', 'armLUpper']) {
    c.montar(sh(new THREE.Mesh(c.lathe(c.perfil.MANGA, 1, 18), mat)), lado)
  }
}

/**
 * Manga comprida: a curta + tubo no braco, BOLA no cotovelo e tubo no
 * antebraco. A bola nao e enfeite: os dois tubos moram em juntas diferentes e
 * se separam quando o cotovelo dobra, e pela fresta aparecia a bola de PELE do
 * cotovelo (que nao esta em nenhum grupo de 'esconde') â€” era um anel de pele
 * no meio da manga comprida.
 * A manga MORRE MANGA_FIM_Y acima do pulso: assim o antebraco nu continua
 * ligando o tecido a mao (sem ele a mao ficava solta no ar com o furo da palma
 * aberto) e o relogio cabe DEPOIS do pano, sem precisar de raio de bracelete.
 */
function mangaLonga(c, mat, o = {}) {
  mangaCurta(c, o.matOmbro || mat)
  const r = o.r || MANGA_R_BRACO
  const rp = o.rPunho || MANGA_R_PUNHO
  const U = c.medida.UPPER_ARM, F = c.medida.FORE_ARM
  for (const s of ['R', 'L']) {
    const h = U - 0.030
    const braco = tubo(r, r * 0.97, h, mat, 14)
    braco.position.y = -0.030 - h / 2
    c.montar(braco, 'arm' + s + 'Upper')
    c.montar(bola(r * 0.99, mat, 10), 'arm' + s + 'Lower')
    const hf = F - MANGA_FIM_Y
    const ante = tubo(r * 0.97, rp, hf, mat, 14)
    ante.position.y = -hf / 2
    c.montar(ante, 'arm' + s + 'Lower')
    if (o.punho) {
      const p = tubo(rp * 1.07, rp * 1.02, 0.026, o.punho, 14)
      p.position.y = -hf + 0.013
      c.montar(p, 'arm' + s + 'Lower')
    }
  }
}

/** Alcas de regata: nascem NA superficie do peito, nao no eixo. */
function alcas(c, mat, folga, o = {}) {
  const g = new THREE.Group()
  const x = o.x === undefined ? 0.070 : o.x
  const larg = o.larg || 0.032
  const alt = o.alt || 0.145
  const y = o.y === undefined ? 0.135 : o.y
  const z = frenteXZ(c, c.perfil.PEITO, x, y, folga, 0.001)
  // A alca DEITA na curva: sobe inclinada pra tras (a superficie recua 3,6 cm
  // do meio do peito ate a clavicula) e pra dentro (o tronco afina). Barra
  // vertical num z fixo saia do corpo no alto e sumia dentro dele embaixo.
  for (const sgn of [1, -1]) {
    const a = caixa(larg, alt, 0.016, mat)
    a.position.set(sgn * x, y, z)
    a.rotation.set(-0.42, 0, -sgn * 0.30)
    g.add(a)
    const b = caixa(larg, alt * 0.92, 0.016, mat)
    b.position.set(sgn * x, y - 0.004, -z)
    b.rotation.set(0.42, 0, -sgn * 0.30)
    g.add(b)
  }
  return g
}

// --- estampas --------------------------------------------------------------
// A LatheGeometry tem u dando a volta no tronco e v ao longo do perfil, entao
// faixa desenhada em Y vira anel horizontal no corpo. Todo motivo e desenhado
// TRES vezes (x, x-s, x+s) porque a costura da textura cai na frente do peito:
// motivo cortado ali le como buraco no pano.

function listrasMat(a, b) {
  const map = tex('blusa-listras:' + a + ':' + b, 64, (g, s) => {
    g.fillStyle = '#' + new THREE.Color(a).getHexString()
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#' + new THREE.Color(b).getHexString()
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, s, 8)
  }, 1)
  return stdMat('blusa-listrada:' + a + ':' + b, { map, roughness: 0.9, metalness: 0 })
}

function xadrezMat(a, b) {
  const map = tex('blusa-xadrez:' + a + ':' + b, 128, (g, s) => {
    const ca = '#' + new THREE.Color(a).getHexString()
    const cb = '#' + new THREE.Color(b).getHexString()
    g.fillStyle = ca
    g.fillRect(0, 0, s, s)
    // faixas nos dois sentidos com alpha: onde elas se cruzam a cor fica mais
    // densa sozinha, que e exatamente como um xadrez de verdade se forma
    g.fillStyle = cb
    g.globalAlpha = 0.55
    for (let i = 0; i < 4; i++) {
      g.fillRect(0, i * 32 + 4, s, 14)
      g.fillRect(i * 32 + 4, 0, 14, s)
    }
    g.globalAlpha = 0.35
    for (let i = 0; i < 4; i++) {
      g.fillRect(0, i * 32 + 24, s, 4)
      g.fillRect(i * 32 + 24, 0, 4, s)
    }
    g.globalAlpha = 1
  }, 1)
  return stdMat('blusa-xadrez-mat:' + a + ':' + b, { map, roughness: 0.95, metalness: 0 })
}

function floralMat(base, flor, folha) {
  const map = tex('blusa-havai:' + base + ':' + flor, 128, (g, s) => {
    g.fillStyle = '#' + new THREE.Color(base).getHexString()
    g.fillRect(0, 0, s, s)
    const petala = '#' + new THREE.Color(flor).getHexString()
    const verde = '#' + new THREE.Color(folha).getHexString()
    const desenha = (x, y, k) => {
      for (const dx of [-s, 0, s]) {
        g.save()
        g.translate(x + dx, y)
        if (k % 2) {
          g.fillStyle = verde
          for (let i = 0; i < 3; i++) {
            g.save(); g.rotate(i * 1.9)
            g.beginPath(); g.ellipse(0, 10, 4, 13, 0, 0, 7); g.fill()
            g.restore()
          }
        } else {
          g.fillStyle = petala
          for (let i = 0; i < 5; i++) {
            g.save(); g.rotate((i / 5) * Math.PI * 2)
            g.beginPath(); g.ellipse(0, 9, 5, 9, 0, 0, 7); g.fill()
            g.restore()
          }
          g.fillStyle = '#f5e06a'
          g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill()
        }
        g.restore()
      }
    }
    let k = 0
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) desenha(i * 32 + (j % 2) * 16 + 8, j * 32 + 16, k++)
    }
  }, 1)
  return stdMat('blusa-havai-mat:' + base + ':' + flor, {
    map, roughness: 0.72, metalness: 0,
  })
}

export const BLUSAS = [
  // 0 = nenhuma (peito nu), como manda a tabela do contrato; a camiseta e o
  // indice 1, que e o que o defaultAppearance() pede.
  { id: 'nenhuma', nome: 'Sem blusa', build() { return null } },
  {
    id: 'camiseta',
    nome: 'Camiseta',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = FOLGA_JUSTA
      const m = tecido(c.cor.blusa, 0.88)
      const escura = tecido(esc(c.cor.blusa, 0.76), 0.9)
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, escura, f))
      c.montar(gola(c, escura, f), 'chest')
      mangaCurta(c, m)
      return g
    },
  },
  {
    id: 'social',
    nome: 'Camisa social',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_JUSTA
      const cor = esc(c.cor.blusa, 1.35)
      const m = tecido(cor, 0.72)
      const g = troncoTecido(c, m, { folga: f })
      const escura = tecido(esc(cor, 0.92), 0.7)
      g.add(tira(c, escura, fatia(c.perfil.PELVIS, -0.010, 0.300), f, { arco: 0.26 }))
      c.montar(tira(c, escura, fatia(c.perfil.PEITO, 0, 0.180), f, { arco: 0.26 }), 'chest')
      const bt = tecido(0xe8e4dc, 0.4)
      c.montar(botoes(c, bt, c.perfil.PEITO, f, 4, 0.030, 0.165), 'chest')
      // colarinho: duas abas retas em vez da banda lisa da camiseta
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.056, 0.048, 0.010, m)
        aba.position.set(sgn * 0.042, 0.190, 0.066)
        aba.rotation.set(0.30, -sgn * 0.45, sgn * 0.18)
        colar.add(aba)
      }
      colar.add(gola(c, m, f, 0.180, 0.202, 0.007))
      c.montar(colar, 'chest')
      mangaLonga(c, m, { r: 0.051, punho: tecido(esc(cor, 0.9), 0.7) })
      return g
    },
  },
  {
    id: 'regata',
    nome: 'Regata',
    esconde: ['torso'],
    build(c) {
      const f = FOLGA_JUSTA
      const m = tecido(c.cor.blusa, 0.9)
      // peito cortado na altura da axila + duas alcas por cima do ombro
      const g = troncoTecido(c, m, {
        folga: f, perfilCima: fatia(c.perfil.PEITO, 0, 0.115),
      })
      g.add(barra(c, tecido(esc(c.cor.blusa, 0.8)), f))
      c.montar(alcas(c, m, f), 'chest')
      return g
    },
  },
  {
    id: 'moletom',
    nome: 'Moletom',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_SOLTA
      const cor = esc(c.cor.blusa, 0.85)
      const m = tecido(cor, 0.96)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = troncoTecido(c, m, { folga: f })
      // punho e barra canelados: e o que faz o moletom nao virar camiseta larga
      g.add(barra(c, rib, f, -0.032, 0.020))
      c.montar(gola(c, rib, f, 0.178, 0.202, 0.008), 'chest')
      mangaLonga(c, m, { r: 0.056, punho: rib })
      g.add(bolso(c, tecido(esc(cor, 0.94), 0.96), c.perfil.PELVIS, f,
        { w: 0.150, h: 0.070, y: 0.075 }))
      return g
    },
  },
  {
    id: 'listrada',
    nome: 'Listrada',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = FOLGA_JUSTA
      const m = listrasMat(c.cor.blusa, esc(c.cor.blusa, 0.45))
      const escura = tecido(esc(c.cor.blusa, 0.45))
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, escura, f))
      c.montar(gola(c, escura, f), 'chest')
      mangaCurta(c, m)
      return g
    },
  },
  {
    id: 'jaqueta-jeans',
    nome: 'Jaqueta jeans',
    // ABERTA e sem nada por baixo: o peito nu tem que aparecer pela fresta,
    // entao a peca NAO esconde torso nem peito. A casca e DoubleSide porque
    // pela abertura se veria o avesso das costas (face descartada pelo culling)
    // e portanto o cenario.
    esconde: ['braco'],
    build(c) {
      const f = FOLGA_LARGA
      const ab = 0.62
      const cor = 0x4a6288
      const m = tecido2(cor, 0.95)
      const cheia = tecido(esc(cor, 0.82), 0.95)
      const baixo = fatia(c.perfil.PELVIS, 0.020, 0.300)
      const cima = fatia(c.perfil.PEITO, 0, 0.196)
      const g = troncoTecido(c, m, {
        folga: f, perfilBaixo: baixo, perfilCima: cima,
        phi0: ab / 2, phiLen: Math.PI * 2 - ab,
      })
      g.add(bordaAberta(c, cheia, baixo, f, ab))
      c.montar(bordaAberta(c, cheia, cima, f, ab), 'chest')
      c.montar(gola(c, cheia, f, 0.176, 0.198, 0.008), 'chest')
      // bolsinhos de peito com pala: e o carimbo da jaqueta jeans
      const pala = new THREE.Group()
      for (const sgn of [1, -1]) {
        pala.add(bolso(c, cheia, c.perfil.PEITO, f,
          { w: 0.048, h: 0.052, x: sgn * 0.072, y: 0.120, fora: 0.001 }))
      }
      c.montar(pala, 'chest')
      mangaLonga(c, m, { matOmbro: tecido(cor, 0.95), r: 0.058, punho: cheia })
      return g
    },
  },
  {
    id: 'jaqueta-couro',
    nome: 'Jaqueta de couro',
    esconde: ['braco'],
    build(c) {
      const f = FOLGA_LARGA
      const ab = 0.70
      const cor = 0x24222a
      const m = couro2(cor)
      const cheio = couro(esc(cor, 1.5))
      const baixo = fatia(c.perfil.PELVIS, 0.030, 0.300)
      const cima = fatia(c.perfil.PEITO, 0, 0.192)
      const g = troncoTecido(c, m, {
        folga: f, perfilBaixo: baixo, perfilCima: cima,
        phi0: ab / 2, phiLen: Math.PI * 2 - ab,
      })
      // lapela larga virada pra fora: a gola de motoqueiro e a identidade
      g.add(bordaAberta(c, cheio, baixo, f, ab, 0.26, 0.008))
      c.montar(bordaAberta(c, cheio, cima, f, ab, 0.26, 0.008), 'chest')
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.062, 0.074, 0.012, cheio)
        aba.position.set(sgn * 0.052, 0.170, 0.074)
        aba.rotation.set(0.22, -sgn * 0.55, sgn * 0.34)
        colar.add(aba)
      }
      c.montar(colar, 'chest')
      // ziper diagonal e zipers de bolso: metal escovado no couro preto
      const zip = metal(0xb9bec4)
      const z = caixa(0.014, 0.180, 0.010, zip)
      z.position.set(0.030, 0.100, frenteXZ(c, c.perfil.PEITO, 0.030, 0.100, f, 0.008))
      z.rotation.z = 0.16
      c.montar(z, 'chest')
      for (const sgn of [1, -1]) {
        const b = caixa(0.052, 0.008, 0.010, zip)
        b.position.set(sgn * 0.062, 0.040, frenteXZ(c, c.perfil.PEITO, sgn * 0.062, 0.040, f, 0.006))
        c.montar(b, 'chest')
      }
      mangaLonga(c, m, { matOmbro: couro(cor), r: 0.057, punho: cheio })
      return g
    },
  },
  {
    id: 'corta-vento',
    nome: 'Corta-vento',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_SOLTA
      const cor = 0x2f7bd6
      const m = tecido(cor, 0.55)
      const g = troncoTecido(c, m, { folga: f })
      g.add(tira(c, tecido(0xe8e4dc, 0.6), fatia(c.perfil.PELVIS, 0.0, 0.300), f, { arco: 0.22 }))
      c.montar(tira(c, tecido(0xe8e4dc, 0.6), fatia(c.perfil.PEITO, 0, 0.190), f, { arco: 0.22 }), 'chest')
      // faixa refletiva atravessando o peito inteiro
      c.montar(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PEITO, 0.058, 0.100), {
        folga: f, extra: 0.004,
      }), tecido(0xe8e4dc, 0.5))), 'chest')
      c.montar(gola(c, m, f, 0.176, 0.202, 0.007), 'chest')
      g.add(barra(c, tecido(esc(cor, 0.75), 0.6), f, -0.028, 0.010))
      mangaLonga(c, m, { r: 0.058, punho: tecido(esc(cor, 0.75), 0.6) })
      return g
    },
  },
  {
    id: 'capuz',
    nome: 'Moletom com capuz',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_SOLTA
      const cor = 0x6b7280
      const m = tecido(cor, 0.98)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, rib, f, -0.034, 0.018))
      g.add(bolso(c, tecido(esc(cor, 0.94), 0.98), c.perfil.PELVIS, f,
        { w: 0.160, h: 0.075, y: 0.085 }))
      // capuz caido nas costas: meia casca presa no PEITO (nao na cabeca, senao
      // ele viraria junto com o olhar)
      const capuz = sh(new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, 1.9), tecido2(cor, 0.98),
      ))
      capuz.scale.set(0.118, 0.132, 0.108)
      capuz.rotation.x = 0.75
      capuz.position.set(0, 0.186, -0.072)
      c.montar(capuz, 'chest')
      c.montar(gola(c, rib, f, 0.174, 0.200, 0.009), 'chest')
      for (const sgn of [1, -1]) {
        const cordao = tubo(0.005, 0.004, 0.080, tecido(0xe6e2d8, 0.9), 6)
        cordao.position.set(sgn * 0.028, 0.152, frenteXZ(c, c.perfil.PEITO, sgn * 0.028, 0.152, f, 0.006))
        cordao.rotation.x = -0.16
        c.montar(cordao, 'chest')
      }
      mangaLonga(c, m, { r: 0.059, punho: rib })
      return g
    },
  },
  {
    id: 'colete',
    nome: 'Colete',
    // Sem manga: as cavas ficam abertas, entao a pele do braco continua. E
    // aberto na frente, entao torso e peito tambem continuam.
    build(c) {
      const f = FOLGA_SOLTA
      const ab = 0.58
      const m = tecido2(0x3d4451, 0.9)
      const cheio = tecido(0x2b303a, 0.9)
      const baixo = fatia(c.perfil.PELVIS, 0.010, 0.300)
      const cima = fatia(c.perfil.PEITO, 0, 0.150)
      const g = troncoTecido(c, m, {
        folga: f, perfilBaixo: baixo, perfilCima: cima,
        phi0: ab / 2, phiLen: Math.PI * 2 - ab,
      })
      g.add(bordaAberta(c, cheio, baixo, f, ab))
      c.montar(bordaAberta(c, cheio, cima, f, ab), 'chest')
      // alcas por cima do ombro fechando a cava, senao o colete fica pendurado
      c.montar(alcas(c, m, f, { x: 0.078, y: 0.128, larg: 0.040, alt: 0.096 }), 'chest')
      const bolsos = new THREE.Group()
      for (const sgn of [1, -1]) {
        bolsos.add(bolso(c, cheio, c.perfil.PELVIS, f,
          { w: 0.052, h: 0.046, x: sgn * 0.070, y: 0.070 }))
      }
      g.add(bolsos)
      const zip = caixa(0.010, 0.170, 0.010, metal(0xb9bec4))
      zip.position.set(0, 0.130, frenteZ(c, c.perfil.PELVIS, 0.130, f, 0.008))
      g.add(zip)
      return g
    },
  },
  {
    id: 'blazer',
    nome: 'Blazer social',
    // O blazer e a peca ABERTA da familia social: peito nu na fresta, lapela
    // grande virada pra fora e um lenco no bolso. O paleto (o proximo) e o
    // fechado, com gravata â€” e assim as duas nao viram a mesma coisa.
    esconde: ['braco'],
    build(c) {
      const f = FOLGA_LARGA
      const ab = 0.66
      const cor = 0x2c3550
      const m = tecido2(cor, 0.62)
      const cheio = tecido(esc(cor, 1.25), 0.55)
      const baixo = fatia(c.perfil.PELVIS, -0.030, 0.300)
      const cima = fatia(c.perfil.PEITO, 0, 0.194)
      const g = troncoTecido(c, m, {
        folga: f, perfilBaixo: baixo, perfilCima: cima,
        phi0: ab / 2, phiLen: Math.PI * 2 - ab,
      })
      g.add(bordaAberta(c, cheio, baixo, f, ab, 0.16))
      // lapela: tira LARGA so na metade de cima, e o recorte que faz o paleto
      c.montar(bordaAberta(c, cheio, fatia(c.perfil.PEITO, 0.080, 0.192), f, ab, 0.34, 0.009), 'chest')
      c.montar(bordaAberta(c, cheio, fatia(c.perfil.PEITO, 0, 0.080), f, ab, 0.16), 'chest')
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.070, 0.052, 0.011, cheio)
        aba.position.set(sgn * 0.056, 0.176, 0.062)
        aba.rotation.set(0.26, -sgn * 0.60, sgn * 0.40)
        colar.add(aba)
      }
      c.montar(colar, 'chest')
      const bt = metal(0xd8b134)
      g.add(botoes(c, bt, c.perfil.PELVIS, f, 2, 0.150, 0.210, 0.008))
      const bolsos = new THREE.Group()
      for (const sgn of [1, -1]) {
        bolsos.add(bolso(c, cheio, c.perfil.PELVIS, f,
          { w: 0.058, h: 0.014, x: sgn * 0.072, y: 0.086 }))
      }
      g.add(bolsos)
      // lenco no bolso do peito: 4 mm de tecido claro que ninguem mais tem
      const lenco = caixa(0.030, 0.016, 0.012, tecido(0xe8e4dc, 0.5))
      lenco.position.set(0.070, 0.126, frenteXZ(c, c.perfil.PEITO, 0.070, 0.126, f, 0.006))
      c.montar(lenco, 'chest')
      mangaLonga(c, m, { matOmbro: tecido(cor, 0.62), r: 0.055, punho: cheio })
      return g
    },
  },
  {
    id: 'terno',
    nome: 'Paleto com gravata',
    // FECHADO de proposito: a gravata precisa de um peito de camisa por baixo,
    // e um V aberto com o torax nu escondido dava buraco na garganta. O V da
    // camisa e a gravata sao pecas coladas POR CIMA da casca fechada.
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_LARGA
      const cor = 0x24262e
      const m = tecido(cor, 0.58)
      const cheio = tecido(esc(cor, 1.35), 0.5)
      const g = troncoTecido(c, m, { folga: f })
      // V da camisa: tira clara subindo do meio do peito ate a gola
      const camisa = tecido(0xece9e0, 0.6)
      c.montar(tira(c, camisa, fatia(c.perfil.PEITO, 0.105, 0.202), f, { arco: 0.40, extra: 0.008 }), 'chest')
      c.montar(gola(c, camisa, f, 0.186, 0.204, 0.012), 'chest')
      // lapela em V: duas tiras inclinadas em cima do V da camisa
      c.montar(bordaAberta(c, cheio, fatia(c.perfil.PEITO, 0.090, 0.196), f, 0.44, 0.30, 0.010), 'chest')
      c.montar(bordaAberta(c, cheio, fatia(c.perfil.PEITO, 0, 0.090), f, 0.16, 0.12, 0.006), 'chest')
      // gravata: no + lamina descendo pelo esterno
      const grav = tecido(0x7a2230, 0.55)
      const no = caixa(0.026, 0.026, 0.014, grav)
      no.position.set(0, 0.186, frenteZ(c, c.perfil.PEITO, 0.186, f, 0.016))
      c.montar(no, 'chest')
      for (let i = 0; i < 3; i++) {
        const y = 0.150 - i * 0.046
        const l = caixa(0.030 + i * 0.006, 0.050, 0.012, grav)
        l.position.set(0, y, frenteZ(c, c.perfil.PEITO, y, f, 0.014))
        c.montar(l, 'chest')
      }
      g.add(botoes(c, metal(0x2b2b30), c.perfil.PELVIS, f, 2, 0.170, 0.225, 0.008))
      const bolsos = new THREE.Group()
      for (const sgn of [1, -1]) {
        bolsos.add(bolso(c, cheio, c.perfil.PELVIS, f,
          { w: 0.058, h: 0.014, x: sgn * 0.072, y: 0.080 }))
      }
      g.add(bolsos)
      mangaLonga(c, m, { r: 0.055, punho: cheio })
      return g
    },
  },
  {
    id: 'havaiana',
    nome: 'Camisa havaiana',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = FOLGA_JUSTA
      const m = floralMat(0x1f9e94, 0xef6b52, 0x1a6b52)
      const liso = tecido(0x17756e, 0.7)
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, liso, f, -0.020, 0.010))
      // colarinho ABERTO e caido (camp collar): duas abas quase deitadas, que e
      // o que separa a havaiana da camisa social de colarinho em pe
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.072, 0.040, 0.010, liso)
        aba.position.set(sgn * 0.046, 0.172, 0.070)
        aba.rotation.set(0.62, -sgn * 0.42, sgn * 0.30)
        colar.add(aba)
      }
      colar.add(gola(c, liso, f, 0.184, 0.202, 0.006))
      c.montar(colar, 'chest')
      c.montar(botoes(c, tecido(0xf2efe4, 0.4), c.perfil.PEITO, f, 3, 0.060, 0.150, 0.007), 'chest')
      c.montar(bolso(c, liso, c.perfil.PEITO, f,
        { w: 0.050, h: 0.046, x: 0.070, y: 0.120, fora: 0.001 }), 'chest')
      mangaCurta(c, m)
      return g
    },
  },
  {
    id: 'cavada',
    nome: 'Regata cavada',
    esconde: ['torso'],
    build(c) {
      const f = FOLGA_JUSTA
      const cor = 0xb6e02a
      const m = tecido(cor, 0.86)
      // cava MUITO baixa (0.085 contra 0.115 da regata comum) e alca fina: e a
      // regata rasgada de academia, nao a regata de todo dia
      const g = troncoTecido(c, m, {
        folga: f, perfilCima: fatia(c.perfil.PEITO, 0, 0.085),
      })
      g.add(barra(c, tecido(0x22262c, 0.9), f, -0.020, 0.006))
      c.montar(alcas(c, m, f, { x: 0.080, y: 0.140, larg: 0.022, alt: 0.150 }), 'chest')
      // faixa preta atravessando a barriga: peitoral de academia
      g.add(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, 0.190, 0.230), {
        folga: f, extra: 0.003,
      }), tecido(0x22262c, 0.9))))
      return g
    },
  },
  {
    id: 'blusao',
    nome: 'Blusao de time',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_LARGA
      const corpo = 0x8a8f98
      const manga = 0xe8e2d4
      const time = 0xa8323a
      const m = tecido(corpo, 0.95)
      const rib = tecido(0x2b303a, 0.96)
      const g = troncoTecido(c, m, { folga: f })
      // manga de COURO claro num corpo de la cinza: o contraste e a peca
      g.add(barra(c, rib, f, -0.036, 0.016))
      c.montar(gola(c, rib, f, 0.172, 0.200, 0.010), 'chest')
      // faixa do time no peito
      c.montar(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PEITO, 0.055, 0.085), {
        folga: f, extra: 0.003,
      }), tecido(time, 0.9))), 'chest')
      const escudo = caixa(0.052, 0.056, 0.012, tecido(time, 0.9))
      escudo.position.set(0.066, 0.128, frenteXZ(c, c.perfil.PEITO, 0.066, 0.128, f, 0.002))
      c.montar(escudo, 'chest')
      g.add(botoes(c, metal(0xc9ced4), c.perfil.PELVIS, f, 4, 0.120, 0.290, 0.008))
      mangaLonga(c, couro(manga), {
        matOmbro: couro(manga), r: 0.059, punho: rib,
      })
      return g
    },
  },
  {
    id: 'xadrez',
    nome: 'Camisa xadrez',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_JUSTA
      const m = xadrezMat(0x8f2f2f, 0x2a2320)
      const liso = tecido(0x5e2020, 0.95)
      const g = troncoTecido(c, m, { folga: f })
      // PALA nos ombros: a costura em ponta do faroeste, que nenhuma outra
      // camisa do catalogo tem
      c.montar(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PEITO, 0.148, 0.190), {
        folga: f, extra: 0.004,
      }), liso)), 'chest')
      c.montar(tira(c, liso, fatia(c.perfil.PEITO, 0, 0.180), f, { arco: 0.24 }), 'chest')
      g.add(tira(c, liso, fatia(c.perfil.PELVIS, 0, 0.300), f, { arco: 0.24 }))
      // botao de madreperola: chapinha branca e brilhante
      c.montar(botoes(c, solid(0xf4f2ea, 0.2, 0.2), c.perfil.PEITO, f, 4, 0.030, 0.160, 0.008), 'chest')
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.062, 0.044, 0.010, liso)
        aba.position.set(sgn * 0.044, 0.186, 0.066)
        aba.rotation.set(0.24, -sgn * 0.50, sgn * 0.26)
        colar.add(aba)
      }
      colar.add(gola(c, liso, f, 0.182, 0.203, 0.007))
      c.montar(colar, 'chest')
      const bolsos = new THREE.Group()
      for (const sgn of [1, -1]) {
        bolsos.add(bolso(c, liso, c.perfil.PEITO, f,
          { w: 0.050, h: 0.048, x: sgn * 0.072, y: 0.118, fora: 0.001 }))
      }
      c.montar(bolsos, 'chest')
      mangaLonga(c, m, { r: 0.053, punho: liso })
      return g
    },
  },
  {
    id: 'polo',
    nome: 'Camisa polo',
    esconde: ['torso', 'peito'],
    build(c) {
      const f = FOLGA_JUSTA
      const cor = esc(c.cor.blusa, 1.12)
      const m = tecido(cor, 0.84)
      const debrum = tecido(esc(cor, 0.6), 0.86)
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, m, f, -0.020, 0.008))
      // carcela CURTA de dois botoes + colarinho deitado: e o que faz a polo
      c.montar(tira(c, debrum, fatia(c.perfil.PEITO, 0.120, 0.196), f, { arco: 0.22 }), 'chest')
      c.montar(botoes(c, tecido(0xf2efe4, 0.4), c.perfil.PEITO, f, 2, 0.140, 0.172, 0.006), 'chest')
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.060, 0.034, 0.010, debrum)
        aba.position.set(sgn * 0.044, 0.188, 0.062)
        aba.rotation.set(0.50, -sgn * 0.44, sgn * 0.22)
        colar.add(aba)
      }
      colar.add(gola(c, debrum, f, 0.186, 0.204, 0.008))
      c.montar(colar, 'chest')
      mangaCurta(c, m)
      // bainha da manga na cor do colarinho: fecha a leitura de polo.
      // A manga curta e uma lathe de 18 lados e a bainha um cilindro de 16: as
      // fases nao batem, entao o raio da bainha tem que passar da CRISTA da
      // manga e nao do raio dela. Com 0.0545/0.052 a bainha entrava 0,3 mm no
      // pano no meio do caminho e o vinco da manga pintava a borda de listra.
      for (const lado of ['armRUpper', 'armLUpper']) {
        const b = tubo(0.0562, 0.0538, 0.018, debrum, 16)
        b.position.y = -0.092
        c.montar(b, lado)
      }
      return g
    },
  },
  {
    id: 'gola-alta',
    nome: 'Blusa de gola alta',
    esconde: ['torso', 'peito', 'braco'],
    build(c) {
      const f = FOLGA_JUSTA
      const cor = esc(c.cor.blusa, 0.72)
      const m = tecido(cor, 0.94)
      const g = troncoTecido(c, m, { folga: f })
      g.add(barra(c, tecido(esc(cor, 0.85), 0.94), f, -0.022, 0.012))
      // A GOLA ALTA e a peca que define RAIO_GOLA_ALTA: o colar nasce do raio
      // dela + SOBRA_ACESSORIO, entao ela nao pode engordar sem que a corrente
      // engorde junto. Na altura da corrente (y = 0.055 no pescoco) o cone
      // esta em 0.0549 â€” logo abaixo do teto.
      const cano = tubo(0.0530, 0.0575, 0.070, m, 16)
      cano.position.y = 0.050
      c.montar(cano, 'neck')
      const dobra = tubo(0.0545, 0.0530, 0.022, tecido(esc(cor, 0.86), 0.94), 16)
      dobra.position.y = 0.078
      c.montar(dobra, 'neck')
      mangaLonga(c, m, { r: 0.052, punho: tecido(esc(cor, 0.85), 0.94) })
      return g
    },
  },
]

// ===========================================================================
// CALCAS â€” ancora: hips (as pernas vao por ctx.montar)
// ===========================================================================

// A calca fica POR BAIXO da blusa: 1.02 sobre o perfil deixa 5 mm de tecido em
// cima da pele (0.965) e ainda passa 2 cm por dentro da blusa mais justa
// (1.045). Cos mais gordo que isso reaparecia por cima da camiseta e a costura
// das duas pecas piscava conforme a camera andava.
const FOLGA_CALCA = 1.020
const FOLGA_CINTO = 1.038

/** Cos: faixa em volta do quadril, no MESMO perfil do corpo (nao um cilindro
 *  reto: o vinco do quadril furava o cilindro exatamente na frente). */
function cos(c, mat, o = {}) {
  const y0 = o.y0 === undefined ? -0.026 : o.y0
  const y1 = o.y1 === undefined ? 0.050 : o.y1
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y0, y1), {
    folga: o.folga || FOLGA_CALCA, extra: o.extra || 0,
  }), mat))
}

/**
 * Perna de tecido: tubo na coxa e outro na canela, montados nas juntas certas
 * (senao a calca fica parada no ar enquanto a perna anda).
 *
 * A BARRA TERMINA 2 cm ABAIXO DO TORNOZELO, SEMPRE que a peca tem canela.
 * Quem desenha canela aqui tambem manda esconder a pele da canela, e 'esconde'
 * apaga a CAPSULA INTEIRA — a bola do tornozelo junto. Barra que morre acima do
 * tornozelo entao nao mostra pele: mostra um VAO, e da pra ver o chao entre o
 * tecido e o pe. A conta antiga descontava os 2 cm de S * canelaFrac em vez de
 * S, e so quando canelaFrac passava de 0.94, o que deixava o buraco aberto em
 * quase todo o catalogo: 5,4 cm no jogger, 4,3 cm no moletom e 1,2 cm ate no
 * jeans com o boneco descalco (nem chinelo nem sandalia tem cano pra tapar).
 * Quem quer barra curta de verdade (bermuda, shorts, praia) nao pede canela
 * nenhuma e nao esconde a pele dela, entao nao passa por aqui.
 */
function pernas(c, mat, o) {
  const T = c.medida.THIGH, S = c.medida.SHIN
  const coxaFrac = o.coxaFrac === undefined ? 1 : o.coxaFrac
  const canelaFrac = o.canelaFrac === undefined ? 0 : o.canelaFrac
  for (const lado of ['R', 'L']) {
    const y0 = 0.020, y1 = -T * coxaFrac
    const coxa = tubo(o.rCoxaTopo, o.rCoxa, y0 - y1, mat, 14)
    coxa.position.y = (y0 + y1) / 2
    c.montar(coxa, 'leg' + lado + 'Upper')
    if (canelaFrac <= 0) continue
    const t0 = o.canelaTopo === undefined ? 0.015 : o.canelaTopo
    // o topo do pe descalco esta em -(S + 0.0175); 2 cm passa dele com folga
    const t1 = Math.min(-(S * canelaFrac), -S - 0.020)
    const canela = tubo(o.rCoxa * 0.97, o.rCanela, t0 - t1, mat, 14)
    canela.position.y = (t0 + t1) / 2
    c.montar(canela, 'leg' + lado + 'Lower')
    if (o.punho) {
      const p = tubo(o.rCanela * 1.04, o.rCanela * 0.98, 0.026, o.punho, 14)
      p.position.y = t1 + 0.013
      c.montar(p, 'leg' + lado + 'Lower')
    }
  }
}

/** Detalhe repetido nas duas pernas (sgn = +1 no lado direito do corpo). */
function nasPernas(c, junta, fabrica) {
  for (const lado of ['R', 'L']) {
    const o = fabrica(lado === 'R' ? 1 : -1)
    if (o) c.montar(o, 'leg' + lado + junta)
  }
}

function cinto(c, cor, o = {}) {
  const g = new THREE.Group()
  const m = couro(cor)
  const y = o.y === undefined ? 0.040 : o.y
  g.add(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y - 0.016, y + 0.016), {
    folga: FOLGA_CINTO,
  }), m)))
  const fivela = caixa(0.038, 0.028, 0.012, metal(o.fivela || 0xc9b273))
  fivela.position.set(0, y, frenteZ(c, c.perfil.PELVIS, y, FOLGA_CINTO, 0.006))
  g.add(fivela)
  return g
}

export const CALCAS = [
  {
    id: 'jeans',
    nome: 'Jeans',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = 0x3f5473
      const m = tecido(cor, 0.95)
      const g = new THREE.Group()
      g.add(cos(c, m))
      g.add(cinto(c, 0x3a2a1c))
      pernas(c, m, {
        rCoxaTopo: 0.070, rCoxa: 0.060, rCanela: 0.054, canelaFrac: 0.96,
        punho: tecido(esc(cor, 0.85), 0.95),
      })
      return g
    },
  },
  {
    id: 'bermuda',
    nome: 'Bermuda',
    build(c) {
      const m = tecido(c.cor.calca, 0.92)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.020, y1: 0.062 }))
      // so a coxa: a canela fica de fora, entao nada de esconder a pele dela
      pernas(c, m, { rCoxaTopo: 0.076, rCoxa: 0.072, coxaFrac: 0.62 })
      return g
    },
  },
  {
    id: 'social',
    nome: 'Calca social',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 0.72)
      const m = tecido(cor, 0.7)
      const g = new THREE.Group()
      g.add(cos(c, m))
      g.add(cinto(c, 0x1d1a18, { fivela: 0xb9bec4 }))
      pernas(c, m, {
        rCoxaTopo: 0.066, rCoxa: 0.056, rCanela: 0.050, canelaFrac: 0.98,
      })
      // vinco da frente
      const vincoM = tecido(esc(cor, 1.2), 0.7)
      nasPernas(c, 'Lower', () => {
        const v = caixa(0.010, c.medida.SHIN * 0.9, 0.010, vincoM)
        v.position.set(0, -c.medida.SHIN * 0.48, 0.048)
        return v
      })
      return g
    },
  },
  {
    id: 'jogger',
    nome: 'Jogger',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 1.15)
      const m = tecido(cor, 0.96)
      const rib = tecido(esc(cor, 0.8), 0.98)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.022, y1: 0.056 }))
      const cordao = anel(0.030, 0.006, rib, 6, 12)
      cordao.rotation.x = Math.PI / 2
      cordao.position.set(0, -0.010, frenteZ(c, c.perfil.PELVIS, -0.010, FOLGA_CALCA, 0.004))
      g.add(cordao)
      pernas(c, m, {
        rCoxaTopo: 0.080, rCoxa: 0.070, rCanela: 0.050, canelaFrac: 0.90, punho: rib,
      })
      return g
    },
  },
  {
    id: 'shorts',
    nome: 'Shorts',
    build(c) {
      const m = tecido(esc(c.cor.calca, 1.3), 0.9)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.024, y1: 0.066 }))
      pernas(c, m, { rCoxaTopo: 0.082, rCoxa: 0.080, coxaFrac: 0.38 })
      return g
    },
  },
  {
    id: 'moletom',
    nome: 'Calca de moletom',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 0.9)
      const m = tecido(cor, 0.98)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.024, y1: 0.060 }))
      pernas(c, m, {
        rCoxaTopo: 0.084, rCoxa: 0.074, rCanela: 0.052, canelaFrac: 0.93, punho: rib,
      })
      return g
    },
  },
  {
    id: 'alfaiataria',
    nome: 'Calca de terno',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = 0x2a2c34
      const m = tecido(cor, 0.6)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.020, y1: 0.062 }))
      g.add(cinto(c, 0x1a1a1e, { y: 0.048, fivela: 0xd8b134 }))
      // perna LARGA e reta com bainha dobrada: a silhueta oposta a da social
      // justa, que e o que separa as duas pecas de tecido escuro
      pernas(c, m, {
        rCoxaTopo: 0.078, rCoxa: 0.070, rCanela: 0.066, canelaFrac: 0.94,
        punho: tecido(esc(cor, 1.3), 0.6),
      })
      const prega = tecido(esc(cor, 1.35), 0.6)
      nasPernas(c, 'Upper', () => {
        const p = caixa(0.009, c.medida.THIGH * 0.86, 0.009, prega)
        p.position.set(0, -c.medida.THIGH * 0.46, 0.062)
        return p
      })
      nasPernas(c, 'Lower', () => {
        const p = caixa(0.009, c.medida.SHIN * 0.86, 0.009, prega)
        p.position.set(0, -c.medida.SHIN * 0.46, 0.060)
        return p
      })
      return g
    },
  },
  {
    id: 'praia',
    nome: 'Bermuda de praia',
    build(c) {
      // estampa floral no mesmo desenho da havaiana, em outra paleta: a peca
      // combina com a camisa sem repetir textura no cache
      const m = floralMat(0x1c6fa8, 0xf2f0e6, 0x2fb3a8)
      const liso = tecido(0x12496e, 0.9)
      const g = new THREE.Group()
      g.add(cos(c, liso, { y0: -0.020, y1: 0.058 }))
      const cordao = anel(0.028, 0.005, tecido(0xf2f0e6, 0.9), 6, 12)
      cordao.rotation.x = Math.PI / 2
      cordao.position.set(0, -0.006, frenteZ(c, c.perfil.PELVIS, -0.006, FOLGA_CALCA, 0.004))
      g.add(cordao)
      // comprida ate o joelho e SOLTA: bermuda de surfe nao e bermuda jeans
      pernas(c, m, { rCoxaTopo: 0.086, rCoxa: 0.086, coxaFrac: 0.94 })
      nasPernas(c, 'Upper', (sgn) => {
        const b = caixa(0.010, 0.070, 0.024, liso)
        b.position.set(sgn * 0.084, -c.medida.THIGH * 0.62, 0.010)
        return b
      })
      return g
    },
  },
  {
    id: 'academia',
    nome: 'Calca de academia',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = 0x22262c
      const m = tecido(cor, 0.86)
      const faixaM = tecido(0xb6e02a, 0.8)
      const g = new THREE.Group()
      g.add(cos(c, faixaM, { y0: -0.020, y1: 0.058 }))
      pernas(c, m, {
        rCoxaTopo: 0.078, rCoxa: 0.062, rCanela: 0.050, canelaFrac: 0.92,
        punho: faixaM,
      })
      // FAIXA LATERAL do quadril ao tornozelo: e a peca inteira em um traco
      nasPernas(c, 'Upper', (sgn) => {
        const f = caixa(0.010, c.medida.THIGH * 0.98, 0.030, faixaM)
        f.position.set(sgn * 0.070, -c.medida.THIGH * 0.48, 0)
        return f
      })
      nasPernas(c, 'Lower', (sgn) => {
        const f = caixa(0.010, c.medida.SHIN * 0.90, 0.028, faixaM)
        f.position.set(sgn * 0.054, -c.medida.SHIN * 0.46, 0)
        return f
      })
      return g
    },
  },
  {
    id: 'cargo',
    nome: 'Calca cargo',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = 0x6d6a4f
      const m = tecido(cor, 0.96)
      const escuro = tecido(esc(cor, 0.8), 0.96)
      const g = new THREE.Group()
      g.add(cos(c, m, { y0: -0.022, y1: 0.058 }))
      g.add(cinto(c, 0x2e2a22))
      pernas(c, m, {
        rCoxaTopo: 0.082, rCoxa: 0.076, rCanela: 0.062, canelaFrac: 0.95,
        punho: escuro,
      })
      // BOLSAO na lateral da coxa com tampa: o cargo inteiro esta nisso
      nasPernas(c, 'Upper', (sgn) => {
        const b = new THREE.Group()
        const caixaB = caixa(0.026, 0.098, 0.086, m)
        caixaB.position.set(sgn * 0.074, -c.medida.THIGH * 0.56, 0.008)
        b.add(caixaB)
        const tampa = caixa(0.030, 0.026, 0.092, escuro)
        tampa.position.set(sgn * 0.075, -c.medida.THIGH * 0.56 + 0.052, 0.008)
        b.add(tampa)
        const bt = malha(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 6), metal(0x8a8f98))
        bt.rotation.z = Math.PI / 2
        bt.position.set(sgn * 0.090, -c.medida.THIGH * 0.56 + 0.040, 0.008)
        b.add(bt)
        return b
      })
      return g
    },
  },
  {
    id: 'rasgada',
    nome: 'Jeans rasgado',
    // NAO esconde coxa nem canela: o rasgo so existe porque a pele do joelho
    // continua desenhada embaixo. E o unico caso do catalogo em que o tecido
    // abre de proposito, entao os dois tubos param longe da junta.
    build(c) {
      const cor = 0x7d94b8
      const m = tecido(cor, 0.95)
      const g = new THREE.Group()
      g.add(cos(c, m))
      g.add(cinto(c, 0x4a3626))
      pernas(c, m, {
        rCoxaTopo: 0.072, rCoxa: 0.064, rCanela: 0.054, canelaFrac: 0.96,
        coxaFrac: 0.88, canelaTopo: -0.030,
        punho: tecido(esc(cor, 0.82), 0.95),
      })
      // fiapos brancos atravessando o rasgo: sem eles o buraco le como falha
      // de modelagem, com eles le como calca rasgada
      const fio = tecido(0xdfe4ea, 0.98)
      nasPernas(c, 'Upper', () => {
        const b = new THREE.Group()
        for (let i = 0; i < 4; i++) {
          const f = caixa(0.004, 0.030, 0.004, fio)
          f.position.set(-0.030 + i * 0.020, -c.medida.THIGH * 0.88 - 0.014, 0.056)
          f.rotation.z = (i % 2 ? 1 : -1) * 0.12
          b.add(f)
        }
        return b
      })
      return g
    },
  },
]

// ===========================================================================
// COLARES â€” ancora: neck (origem na base do pescoco, +Z = frente)
// ===========================================================================
// REGRA DA PECA: colar tem que SOBRESAIR a blusa, sempre, inclusive a de gola
// alta e a jaqueta. Por isso nada aqui tem raio escolhido a olho:
//   - a volta do pescoco nasce em RAIO_GOLA_ALTA + SOBRA_ACESSORIO;
//   - o que desce pelo peito nasce em frentePeito(), que e a superficie da
//     peca MAIS LARGA do catalogo (FOLGA_LARGA) + SOBRA_ACESSORIO.
// O preco disso e a corrente ficar ~8 mm solta num pescoco nu â€” que e como
// corrente se comporta mesmo. O contrario (colar colado na pele) some dentro
// de metade do guarda-roupa, e foi o bug que o dono reclamou.

const R_CORRENTE = RAIO_GOLA_ALTA + SOBRA_ACESSORIO

/** Z da frente do peito POR FORA da peca mais larga, na altura y do peito. */
function frentePeito(c, y) {
  return (raioPerfil(c.perfil.PEITO, y) * FOLGA_LARGA + SOBRA_ACESSORIO) * c.medida.FLAT_Z
}

function corrente(mat, t = 0.005, y = 0.052) {
  const a = anel(R_CORRENTE + t, t, mat, 6, 20)
  a.rotation.x = Math.PI / 2
  a.scale.z = 0.95
  // 5 cm acima da base do pescoco: a lathe do peito sobe ate +0.040 aqui, e
  // qualquer coisa abaixo disso fica ENTERRADA no torax
  a.position.y = y
  return a
}

/** Fio + corpo do pingente descendo POR FORA do peito ate a altura yPeito. */
function pingente(c, g, mat, corpo, yPeito = 0.135) {
  const yn = yPeito - c.medida.NECK_Y
  const z = frentePeito(c, yPeito)
  const y0 = 0.046, z0 = 0.060
  const dy = yn - y0, dz = z - z0
  const fio = tubo(0.0035, 0.0035, Math.hypot(dy, dz), mat, 6)
  fio.position.set(0, (y0 + yn) / 2, (z0 + z) / 2)
  fio.rotation.x = Math.atan2(-dz, -dy)
  g.add(fio)
  corpo.position.set(0, yn, z)
  g.add(corpo)
}

export const COLARES = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'ouro',
    nome: 'Corrente de ouro',
    build() {
      const g = new THREE.Group()
      g.add(corrente(metal(0xd8b134)))
      return g
    },
  },
  {
    id: 'prata',
    nome: 'Corrente de prata',
    build() {
      const g = new THREE.Group()
      g.add(corrente(metal(0xc9ced4), 0.0038))
      return g
    },
  },
  {
    id: 'cruz',
    nome: 'Cruz',
    build(c) {
      const m = metal(0xc9ced4)
      const g = new THREE.Group()
      g.add(corrente(m, 0.0040))
      const cruz = new THREE.Group()
      cruz.add(caixa(0.012, 0.046, 0.007, m))
      const braco = caixa(0.032, 0.012, 0.007, m)
      braco.position.y = 0.008
      cruz.add(braco)
      cruz.rotation.x = -0.35
      pingente(c, g, m, cruz)
      return g
    },
  },
  {
    id: 'grosso',
    nome: 'Cordao grosso',
    build() {
      const g = new THREE.Group()
      g.add(corrente(metal(0xd8b134), 0.012, 0.046))
      return g
    },
  },
  {
    id: 'pingente',
    nome: 'Pingente',
    build(c) {
      const m = metal(0xc9a227)
      const g = new THREE.Group()
      g.add(corrente(m, 0.0045))
      const disco = malha(new THREE.CylinderGeometry(0.020, 0.020, 0.006, 14), m)
      disco.rotation.x = -Math.PI / 2 + 0.35
      pingente(c, g, m, disco)
      return g
    },
  },
  {
    id: 'bandana',
    nome: 'Bandana de cowboy',
    build(c) {
      const cor = 0xb03a3a
      const m = tecido2(cor, 0.95)
      const g = new THREE.Group()
      // volta do pescoco: cone em vez de torus, pra encostar igual em cima e
      // embaixo mesmo com o pescoco afinando
      const volta = tubo(R_CORRENTE + 0.004, R_CORRENTE + 0.010, 0.040, tecido(cor, 0.95), 16, true)
      volta.position.y = 0.052
      g.add(volta)
      const no = bola(0.016, tecido(esc(cor, 0.8), 0.95), 8)
      no.position.set(0.030, 0.044, R_CORRENTE * 0.72)
      g.add(no)
      // A PONTA cai no peito e vai montada no 'chest': presa no pescoco ela
      // acompanharia a cabeca e ficaria batendo no ombro quando o boneco olha
      // pro lado.
      const pano = new THREE.Group()
      for (let i = 0; i < 3; i++) {
        const y = 0.176 - i * 0.030
        const larg = 0.130 - i * 0.038
        const p = caixa(larg, 0.034, 0.012, m)
        p.position.set(0, y, frentePeito(c, y) * 0.96)
        p.rotation.x = -0.10
        pano.add(p)
      }
      c.montar(pano, 'chest')
      return g
    },
  },
  {
    id: 'borboleta',
    nome: 'Gravata borboleta',
    build() {
      const cor = 0x2b2b30
      const m = solid(cor, 0.45, 0.05)
      const g = new THREE.Group()
      // fica ACIMA da gola de qualquer camisa (a lathe do peito morre em 0.040
      // no espaco do pescoco), entao a fita passa em 0.050
      const fita = tubo(R_CORRENTE + 0.002, R_CORRENTE + 0.004, 0.018, m, 16, true)
      fita.position.y = 0.050
      g.add(fita)
      const z = R_CORRENTE + 0.008
      for (const sgn of [1, -1]) {
        const asa = caixa(0.036, 0.030, 0.014, m)
        asa.position.set(sgn * 0.030, 0.050, z * 0.86)
        asa.rotation.set(0, -sgn * 0.34, sgn * 0.10)
        g.add(asa)
        const ponta = caixa(0.014, 0.036, 0.012, m)
        ponta.position.set(sgn * 0.046, 0.050, z * 0.70)
        g.add(ponta)
      }
      const no = caixa(0.016, 0.022, 0.016, solid(esc(cor, 1.5), 0.45, 0.05))
      no.position.set(0, 0.050, z * 0.94)
      g.add(no)
      return g
    },
  },
  {
    id: 'conchas',
    nome: 'Colar de conchas',
    build(c) {
      const g = new THREE.Group()
      const fio = tecido(0x6b4a2c, 0.95)
      g.add(corrente(fio, 0.0030, 0.048))
      // conchas espalhadas na volta do cordao, cada uma virada pra fora
      const concha = tecido(0xf0e4cc, 0.6)
      const n = 9
      for (let i = 0; i < n; i++) {
        const a = -1.5 + (i / (n - 1)) * 3.0
        const r = (R_CORRENTE + 0.006)
        const s = bola(1, concha, 8)
        s.scale.set(0.011, 0.007, 0.014)
        s.position.set(Math.sin(a) * r, 0.048 - Math.cos(a) * 0.008, Math.cos(a) * r * 0.95)
        s.rotation.y = a
        g.add(s)
      }
      const dente = caixa(0.010, 0.026, 0.006, concha)
      dente.rotation.x = -0.30
      pingente(c, g, fio, dente, 0.160)
      return g
    },
  },
  {
    id: 'apito',
    nome: 'Cordao com apito',
    build(c) {
      const g = new THREE.Group()
      const fita = tecido(0x22262c, 0.9)
      g.add(corrente(fita, 0.0045, 0.050))
      const apito = new THREE.Group()
      const corpo = caixa(0.016, 0.011, 0.034, metal(0xc9ced4))
      apito.add(corpo)
      const boca = caixa(0.010, 0.008, 0.014, metal(0x8a8f98))
      boca.position.set(0, 0.002, -0.022)
      apito.add(boca)
      const bola2 = bola(0.007, metal(0xc9ced4), 8)
      bola2.position.set(0, -0.005, 0.010)
      apito.add(bola2)
      apito.rotation.x = 0.30
      pingente(c, g, fita, apito, 0.150)
      return g
    },
  },
  {
    id: 'gargantilha',
    nome: 'Gargantilha',
    build() {
      const g = new THREE.Group()
      const m = couro(0x1d1a18)
      // alta no pescoco (0.070) e larga: e o unico colar que nao desce nada.
      // Mesmo assim nasce do raio da gola alta â€” colada na pele ela sumiria
      // dentro daquela peca.
      const banda = tubo(R_CORRENTE + 0.001, R_CORRENTE + 0.004, 0.026, m, 16, true)
      banda.position.y = 0.070
      g.add(banda)
      const chapa = caixa(0.022, 0.020, 0.008, metal(0xc9ced4))
      chapa.position.set(0, 0.070, (R_CORRENTE + 0.004) * 0.98)
      g.add(chapa)
      for (const sgn of [1, -1]) {
        const t = caixa(0.008, 0.026, 0.006, metal(0xc9ced4))
        t.position.set(sgn * 0.036, 0.070, (R_CORRENTE + 0.004) * 0.80)
        t.rotation.y = -sgn * 0.55
        g.add(t)
      }
      return g
    },
  },
]

// ===========================================================================
// ANEIS â€” ancora: handL (a mao ESQUERDA)
// ===========================================================================
// Espaco da mao: pulso na origem, dedos descendo em -Y. Na mao esquerda os
// dedos se curvam pra +X, entao o aro entra deslocado e INCLINADO nesse
// sentido â€” aro deitado no plano do chao cortava o dedo em diagonal e afundava
// de um lado so.

/** Centro do aro no dedo pedido (anelar por padrao), no espaco do pulso. */
function posDedo(c, o = {}) {
  const D = o.dedo !== undefined
    ? { x: 0, y: c.medida.DEDOS[o.dedo].y - 0.014, z: c.medida.DEDOS[o.dedo].z }
    : (c.medida.DEDO_ANELAR || { x: 0, y: -0.092, z: -0.010 })
  // 1.8 mm pro lado da palma: e quanto o dedo ja andou em X 1.4 cm abaixo do no
  return { x: D.x + 0.0018, y: D.y + (o.dy || 0), z: D.z }
}

function aro(c, mat, o = {}) {
  const p = posDedo(c, o)
  // O raio interno tem que passar do raio do dedo VISTO NO PLANO DO ARO: o
  // dedo tem 9.6 mm no eixo largo e ainda entra inclinado, o que da 10.0 mm
  // aparentes. Com os 8.6 mm da versao antiga o aro afundava na carne.
  const r = o.r === undefined ? 0.0130 : o.r
  const t = o.t === undefined ? 0.0026 : o.t
  const a = anel(r, t, mat, 6, 14)
  a.rotation.set(Math.PI / 2, INCLINA_DEDO, 0)
  a.position.set(p.x, p.y, p.z)
  return a
}

/** Ponto no DORSO da mao esquerda, na altura do aro (a palma olha pra +X). */
function dorso(a, dist) {
  return { x: a.position.x - dist, y: a.position.y, z: a.position.z }
}

export const ANEIS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'simples',
    nome: 'Anel simples',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, metal(0xc9ced4)))
      return g
    },
  },
  {
    id: 'pedra',
    nome: 'Anel com pedra',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xd8b134)
      const a = aro(c, m)
      g.add(a)
      const p = dorso(a, 0.0112)
      const pedra = bola(0.0058, solid(0x2f7bd6, 0.1, 0.4), 8)
      pedra.position.set(p.x, p.y, p.z)
      g.add(pedra)
      return g
    },
  },
  {
    id: 'grosso',
    nome: 'Anel grosso',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, metal(0xd8b134), { r: 0.0140, t: 0.0044 }))
      return g
    },
  },
  {
    id: 'dois',
    nome: 'Dois aneis',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, metal(0xd8b134)))
      g.add(aro(c, metal(0xc9ced4), { dedo: 1, r: 0.0134, dy: -0.002 }))
      return g
    },
  },
  {
    id: 'alianca',
    nome: 'Alianca',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, metal(0xe0c060), { r: 0.0126, t: 0.0022 }))
      return g
    },
  },
  {
    id: 'caveira',
    nome: 'Anel de caveira',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0x9aa0a6)
      const a = aro(c, m, { r: 0.0132, t: 0.0030 })
      g.add(a)
      const p = dorso(a, 0.0110)
      const cranio = bola(1, metal(0xd8d4c8), 8)
      cranio.scale.set(0.0070, 0.0080, 0.0062)
      cranio.position.set(p.x, p.y, p.z)
      g.add(cranio)
      // duas orbitas escuras: sem elas a caveira e so uma bolinha
      for (const sgn of [1, -1]) {
        const olho = bola(0.0020, solid(0x1a1a1e, 0.6), 6)
        olho.position.set(p.x - 0.0038, p.y + 0.0012, p.z + sgn * 0.0026)
        g.add(olho)
      }
      const mandi = caixa(0.0042, 0.0028, 0.0090, metal(0xd8d4c8))
      mandi.position.set(p.x - 0.0016, p.y - 0.0060, p.z)
      g.add(mandi)
      return g
    },
  },
  {
    id: 'formatura',
    nome: 'Anel de formatura',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xd8b134)
      const a = aro(c, m, { r: 0.0134, t: 0.0032 })
      g.add(a)
      const p = dorso(a, 0.0100)
      // pedra GRANDE e facetada (cilindro de 6 lados deitado): o volume e todo
      // o ponto da peca
      const base = malha(new THREE.CylinderGeometry(0.0082, 0.0064, 0.0050, 6), m)
      base.rotation.z = Math.PI / 2
      base.position.set(p.x + 0.0010, p.y, p.z)
      g.add(base)
      const pedra = malha(new THREE.CylinderGeometry(0.0030, 0.0074, 0.0060, 6),
        solid(0x8a1f3d, 0.12, 0.30))
      pedra.rotation.z = Math.PI / 2
      pedra.position.set(p.x - 0.0034, p.y, p.z)
      g.add(pedra)
      return g
    },
  },
  {
    id: 'dupla',
    nome: 'Alianca dupla',
    build(c) {
      const g = new THREE.Group()
      // duas alincas finas NO MESMO dedo, uma de cada metal, encostadas: e o
      // que separa esta peca do 'Dois aneis', que usa dois dedos
      g.add(aro(c, metal(0xe0c060), { r: 0.0128, t: 0.0021, dy: 0.0022 }))
      g.add(aro(c, metal(0xc9ced4), { r: 0.0128, t: 0.0021, dy: -0.0022 }))
      return g
    },
  },
  {
    id: 'largo',
    nome: 'Anel largo de prata',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xb9bec4)
      // aro CHATO e alto (uma casca de 1.3 cm), nao um tubo redondo: e a
      // silhueta que separa esta peca do 'Anel grosso'
      const p = posDedo(c)
      // O cilindro ja nasce com o eixo em +Y (o torus nasce em +Z), entao aqui
      // a inclinacao do dedo entra em Z e nao no par (X,Y) que o aro usa.
      const a = tubo(0.0132, 0.0132, 0.0130, m, 16, true)
      a.rotation.set(0, 0, INCLINA_DEDO)
      a.position.set(p.x, p.y, p.z)
      g.add(a)
      const risco = tubo(0.0138, 0.0138, 0.0022, metal(0x6e737a), 16, true)
      risco.rotation.copy(a.rotation)
      risco.position.copy(a.position)
      g.add(risco)
      return g
    },
  },
  {
    id: 'brasao',
    nome: 'Anel com brasao',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xc9a227)
      const a = aro(c, m, { r: 0.0132, t: 0.0028 })
      g.add(a)
      const p = dorso(a, 0.0098)
      const chapa = bola(1, m, 8)
      chapa.scale.set(0.0034, 0.0092, 0.0072)
      chapa.position.set(p.x, p.y, p.z)
      g.add(chapa)
      // cruz gravada em relevo escuro: o brasao tem que LER a 1 m
      const v = caixa(0.0016, 0.0072, 0.0018, solid(0x3a3226, 0.7))
      v.position.set(p.x - 0.0026, p.y, p.z)
      g.add(v)
      const h = caixa(0.0016, 0.0018, 0.0046, solid(0x3a3226, 0.7))
      h.position.set(p.x - 0.0026, p.y + 0.0014, p.z)
      g.add(h)
      return g
    },
  },
]

// ===========================================================================
// TATUAGENS â€” pele com desenho, nao geometria nova
// ===========================================================================
// Casca fininha por cima do membro com textura de canvas transparente. Fica
// mais barato e mais flexivel que pintar um mapa novo pra cada tom de pele:
// a tinta e a mesma, a pele por baixo continua sendo a do personagem.

function tintaMat(id, desenho) {
  const map = tex('tatu:' + id, 128, desenho, 1)
  // alphaTest em vez de transparent: recorte por descarte de pixel nao entra na
  // fila de transparencia, entao a tinta nunca aparece por cima do braco errado
  return stdMat('tatu-mat:' + id, {
    map, transparent: false, alphaTest: 0.4, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide,
  })
}

const TINTA = 'rgba(26,24,38,0.92)'

/** Faixa tribal: o desenho tem que ler a 3 m, entao tracos grossos. */
function desenhoTribal(g, s) {
  g.clearRect(0, 0, s, s)
  g.strokeStyle = TINTA
  g.lineCap = 'round'
  // Duas faixas onduladas e alguns raios. A versao densa de antes cobria a
  // textura inteira e o braco virava uma mancha preta a 3 m de distancia.
  g.lineWidth = 7
  for (let i = 0; i < 2; i++) {
    g.beginPath()
    const y = 34 + i * 58
    g.moveTo(0, y)
    for (let x = 0; x <= s; x += 12) g.lineTo(x, y + Math.sin(x * 0.16 + i * 2) * 11)
    g.stroke()
  }
  g.lineWidth = 3.5
  for (let i = 0; i < 6; i++) {
    g.beginPath()
    g.moveTo(i * 22 + 6, 70)
    g.lineTo(i * 22 + 16, 96)
    g.stroke()
  }
}

function desenhoCaveira(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = 'rgba(28,24,32,0.9)'
  g.beginPath(); g.arc(s / 2, s / 2 - 8, 30, 0, 7); g.fill()
  g.fillRect(s / 2 - 20, s / 2 + 12, 40, 24)
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.beginPath(); g.arc(s / 2 - 12, s / 2 - 10, 8, 0, 7); g.fill()
  g.beginPath(); g.arc(s / 2 + 12, s / 2 - 10, 8, 0, 7); g.fill()
  g.fillRect(s / 2 - 4, s / 2 + 4, 8, 10)
}

function desenhoEstrelas(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = 'rgba(20,18,28,0.9)'
  for (let i = 0; i < 9; i++) {
    const x = (i * 37) % s, y = (i * 53) % s, r = 6 + (i % 3) * 4
    estrela(g, x, y, r)
  }
}

/** Estrela de 5 pontas fechada no caminho atual (usada por dois desenhos). */
function estrela(g, x, y, r) {
  g.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2
    const rr = k % 2 ? r * 0.45 : r
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
    if (k === 0) g.moveTo(px, py); else g.lineTo(px, py)
  }
  g.closePath()
  g.fill()
}

function desenhoEscorpiao(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = TINTA
  g.strokeStyle = TINTA
  g.lineCap = 'round'
  const cx = s / 2, cy = s / 2 + 10
  // corpo: quatro segmentos que diminuem
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.ellipse(cx, cy - i * 13, 11 - i * 1.6, 8 - i, 0, 0, 7)
    g.fill()
  }
  // cauda enrolada por cima, com o ferrao virado pra frente
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(cx, cy - 44)
  g.quadraticCurveTo(cx + 30, cy - 62, cx + 16, cy - 88)
  g.stroke()
  g.beginPath(); g.moveTo(cx + 16, cy - 88); g.lineTo(cx - 2, cy - 78)
  g.lineWidth = 5; g.stroke()
  // pincas e patas
  g.lineWidth = 6
  for (const sgn of [1, -1]) {
    g.beginPath()
    g.moveTo(cx + sgn * 8, cy + 4)
    g.quadraticCurveTo(cx + sgn * 30, cy + 6, cx + sgn * 26, cy - 14)
    g.stroke()
    for (let i = 0; i < 3; i++) {
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(cx + sgn * 7, cy - 8 - i * 12)
      g.lineTo(cx + sgn * 26, cy + 2 - i * 16)
      g.stroke()
    }
  }
}

function desenhoAncora(g, s) {
  g.clearRect(0, 0, s, s)
  g.strokeStyle = TINTA
  g.fillStyle = TINTA
  g.lineCap = 'round'
  const cx = s / 2
  g.lineWidth = 9
  g.beginPath(); g.moveTo(cx, 26); g.lineTo(cx, 100); g.stroke()
  g.lineWidth = 8
  g.beginPath(); g.moveTo(cx - 26, 44); g.lineTo(cx + 26, 44); g.stroke()
  // pata da ancora: meio circulo com as pontas viradas pra cima
  g.lineWidth = 9
  g.beginPath(); g.arc(cx, 92, 30, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke()
  g.lineWidth = 7
  g.beginPath(); g.moveTo(cx - 29, 100); g.lineTo(cx - 38, 84); g.stroke()
  g.beginPath(); g.moveTo(cx + 29, 100); g.lineTo(cx + 38, 84); g.stroke()
  // argola
  g.lineWidth = 7
  g.beginPath(); g.arc(cx, 22, 10, 0, 7); g.stroke()
}

function desenhoArame(g, s) {
  g.clearRect(0, 0, s, s)
  g.strokeStyle = TINTA
  g.lineWidth = 6
  g.lineCap = 'round'
  // DOIS periodos inteiros na largura: a faixa da a volta no braco e emenda
  // com ela mesma, entao qualquer numero quebrado deixaria um degrau na costura
  for (const fase of [0, Math.PI]) {
    g.beginPath()
    for (let x = 0; x <= s; x += 4) {
      const y = s / 2 + Math.sin((x / s) * Math.PI * 4 + fase) * 16
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y)
    }
    g.stroke()
  }
  g.lineWidth = 5
  for (let i = 0; i < 8; i++) {
    const x = i * (s / 8) + 8
    const y = s / 2 + Math.sin((x / s) * Math.PI * 4) * 16
    g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.stroke()
    g.beginPath(); g.moveTo(x - 9, y + 9); g.lineTo(x + 9, y - 9); g.stroke()
  }
}

function desenhoEstrelaOmbro(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = TINTA
  estrela(g, s / 2, s / 2, 44)
  g.fillStyle = 'rgba(255,255,255,0.85)'
  estrela(g, s / 2, s / 2, 22)
  g.fillStyle = TINTA
  estrela(g, s / 2, s / 2, 10)
}

function desenhoLetras(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = TINTA
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // duas palavras curtas empilhadas: uma frase longa vira borrao no braco
  g.font = 'italic bold 30px "Times New Roman", serif'
  g.fillText('FAMILIA', s / 2, s / 2 - 20, s * 0.94)
  g.font = 'italic bold 22px "Times New Roman", serif'
  g.fillText('E TUDO', s / 2, s / 2 + 16, s * 0.8)
  g.strokeStyle = TINTA
  g.lineWidth = 3
  g.beginPath(); g.moveTo(18, s / 2 + 38); g.lineTo(s - 18, s / 2 + 38); g.stroke()
}

/**
 * Casca aberta em volta de um membro. rTopo != r quando o membro AFINA (o
 * pescoco vai de 5,8 cm na base a 4,7 cm no queixo): banda de raio unico ali
 * afunda embaixo e boia em cima, e como a pele tem 14 lados e a banda tem
 * menos, o vinco do poligono da pele saia POR FORA da tinta.
 */
function faixaMembro(mat, r, h, seg = 14, rTopo = r) {
  return malha(new THREE.CylinderGeometry(rTopo, r, h, seg, 1, true), mat)
}

/**
 * Setor de casca que acompanha o CONE do peito.
 *
 * Sai da FATIA do perfil, como casca(), e nao de um cone entre as duas pontas.
 * Entre y = 0.10 e y = 0.20 o torax e CONVEXO (engorda ate 0.144 em y = 0.095 e
 * so depois afina pro pescoco), entao a corda reta que ligava so o topo e a
 * base passava ate 1,9 cm POR DENTRO da pele no meio do caminho: a tatuagem de
 * peito nao ficava "flutuando", ela sumia inteira e sobrava um aro fino nas
 * duas bordas. Guardar os vertices do meio e a mesma correcao que fatia() ja
 * fazia na barra da camiseta.
 */
function chapaPeito(c, mat, y0, y1, arco = 1.0, seg = 10) {
  // 0.99 do perfil contra os 0.965 da pele: 2,5% em cima de um raio de 14 cm
  // da 3,5 mm, que sobra ate da CRISTA do poligono de 24 lados do tronco.
  const p = fatia(c.perfil.PEITO, y0, y1).map((q) => [q[0] * 0.99, q[1]])
  const g = revolver(p, seg, c.medida.FLAT_Z, -arco / 2, arco)
  // A LatheGeometry reparte o v pelo INDICE do ponto do perfil, e a fatia tem
  // os pontos em alturas irregulares (0.140, 0.175, 0.196...): sem corrigir, a
  // caveira sai amassada em cima e esticada embaixo. Aqui o v volta a ser
  // proporcional ao y, que e como o cilindro de antes mapeava.
  const pos = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0))
  uv.needsUpdate = true
  return sh(new THREE.Mesh(g, mat))
}

export const TATUAGENS = [
  { id: 'nenhuma', nome: 'Nenhuma', build() { return null } },
  {
    id: 'braco',
    nome: 'Braco fechado',
    build(c) {
      const f = faixaMembro(tintaMat('tribal', desenhoTribal), 0.048, 0.180)
      f.position.y = -0.150
      c.montar(f, 'armRUpper')
      return null
    },
  },
  {
    id: 'antebraco',
    nome: 'Antebraco',
    build(c) {
      const f = faixaMembro(tintaMat('estrelas', desenhoEstrelas), 0.0435, 0.170)
      f.position.y = -c.medida.FORE_ARM / 2
      c.montar(f, 'armRLower')
      return null
    },
  },
  {
    id: 'pescoco',
    nome: 'Pescoco',
    build(c) {
      // vai no PESCOCO e nao no peito: a ancora do slot e o torax, entao o
      // desenho precisa ser montado na junta certa pra virar com a cabeca
      //
      // A banda e um CONE colado no pescoco (que vai de 0.0522 em y = 0.033 a
      // 0.0472 em y = 0.083) com 2,5 mm de folga, nao um tubo de raio unico. O
      // tubo de 0.053 ficava espremido num sanduiche de 1 mm: a crista do
      // poligono da pele furava a tinta embaixo e a tinta furava o cano da
      // BLUSA DE GOLA ALTA (0.0531 la em cima) — os dois de uma vez.
      const f = faixaMembro(tintaMat('tribal', desenhoTribal), 0.0547, 0.050, 16, 0.0497)
      f.position.y = 0.058
      c.montar(f, 'neck')
      return null
    },
  },
  {
    id: 'mao',
    nome: 'Mao',
    build(c) {
      // O dorso da mao e uma super-elipse de 2,18 cm de meia-largura que CAI
      // pros lados: plano largo e afastado ficava boiando meio centimetro na
      // borda, e a mao aparece o tempo todo em primeira pessoa. Estreitando o
      // plano em Z ele fica onde o dorso ainda e quase chato.
      const p = malha(new THREE.PlaneGeometry(0.040, 0.058),
        tintaMat('estrelas', desenhoEstrelas))
      // costas da mao DIREITA: a palma olha pro corpo (-X), entao o dorso e +X
      p.position.set(0.0232, -0.046, 0)
      p.rotation.y = Math.PI / 2
      c.montar(p, 'handR')
      return null
    },
  },
  {
    id: 'peito',
    nome: 'Peito',
    build(c) {
      // alto do peito: e a unica faixa do torax que a regata (e o peito nu)
      // deixam a mostra â€” mais embaixo qualquer blusa tapa a tinta
      c.montar(chapaPeito(c, tintaMat('caveira', desenhoCaveira), 0.100, 0.200, 0.95), 'chest')
      return null
    },
  },
  {
    id: 'escorpiao',
    nome: 'Escorpiao',
    build(c) {
      // ombro/braco DIREITO virado pra frente: o bicho tem cabeca e cauda,
      // entao ele so le se nascer no arco da frente e nao dando a volta
      const f = faixaMembro(tintaMat('escorpiao', desenhoEscorpiao), 0.048, 0.150)
      f.position.y = -0.100
      c.montar(f, 'armRUpper')
      return null
    },
  },
  {
    id: 'ancora',
    nome: 'Ancora de marinheiro',
    build(c) {
      const f = faixaMembro(tintaMat('ancora', desenhoAncora), 0.0435, 0.150)
      f.position.y = -c.medida.FORE_ARM * 0.48
      c.montar(f, 'armRLower')
      return null
    },
  },
  {
    id: 'arame',
    nome: 'Arame farpado',
    build(c) {
      // faixa BAIXA: o arame e uma volta so em torno do biceps, e a altura
      // pequena e o que impede o desenho de esticar e virar borrao
      const f = faixaMembro(tintaMat('arame', desenhoArame), 0.048, 0.062)
      f.position.y = -0.110
      c.montar(f, 'armRUpper')
      return null
    },
  },
  {
    id: 'estrela-ombro',
    nome: 'Estrela no ombro',
    build(c) {
      const f = faixaMembro(tintaMat('estrela-ombro', desenhoEstrelaOmbro), 0.0505, 0.100, 12)
      f.position.y = -0.026
      c.montar(f, 'armRUpper')
      return null
    },
  },
  {
    id: 'letras',
    nome: 'Letras no antebraco',
    build(c) {
      const f = faixaMembro(tintaMat('letras', desenhoLetras), 0.0435, 0.145)
      f.position.y = -c.medida.FORE_ARM * 0.44
      c.montar(f, 'armRLower')
      return null
    },
  },
]

// ===========================================================================
// RELOGIOS â€” ancora: armLLower (o PULSO esquerdo, y = -FORE_ARM)
// ===========================================================================
// Preso no antebraco e nao na mao: relogio na junta da mao gira junto com ela
// e escorrega pro meio da palma quando o punho dobra.
//
// POR QUE ELE APARECE POR CIMA DA MANGA: nao aparece â€” a manga e que morre
// antes dele. Toda manga comprida do catalogo termina MANGA_FIM_Y (4,5 cm)
// acima do pulso e o relogio mora 2,8 cm acima do pulso, no antebraco nu. A
// alternativa (manga ate a mao + pulseira de raio maior que o pano) daria uma
// pulseira 1 cm solta no braco de quem esta de camiseta, e relogio frouxo le
// pior que relogio coberto.

// O antebraco tem raio 0.041. A pulseira e um pouco MENOR que ele de proposito:
// o braco atravessa o furo e so a casca de fora aparece, que e o que se ve de
// uma pulseira no pulso. Com raio 0.045 e tubo 0.009 virava um aro de basquete.
function pulseira(c, mat, r = 0.038, t = 0.0070) {
  const a = anel(r, t, mat, 6, 16)
  a.rotation.x = Math.PI / 2
  a.position.y = -c.medida.FORE_ARM + 0.028
  return a
}

/** Caixa do relogio nas COSTAS do pulso esquerdo (lado -X). */
function mostrador(c, geo, mat, dist = 0.043) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(-dist, -c.medida.FORE_ARM + 0.028, 0)
  m.rotation.z = Math.PI / 2
  return m
}

export const RELOGIOS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'digital',
    nome: 'Digital',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, solid(0x23262b, 0.7)))
      g.add(mostrador(c, new THREE.BoxGeometry(0.030, 0.010, 0.024), solid(0x2b2f35, 0.5, 0.2)))
      g.add(mostrador(c, new THREE.BoxGeometry(0.020, 0.012, 0.016), solid(0x74d0b0, 0.3, 0.0)))
      return g
    },
  },
  {
    id: 'analogico',
    nome: 'Analogico',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, couro(0x40301f)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.017, 0.017, 0.010, 14), metal(0xb9bec4)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.013, 0.013, 0.012, 14), solid(0xf0ece2, 0.4)))
      return g
    },
  },
  {
    id: 'dourado',
    nome: 'Dourado',
    build(c) {
      const m = metal(0xd8b134)
      const g = new THREE.Group()
      g.add(pulseira(c, m, 0.039, 0.0085))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), m))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.014, 0.014, 0.014, 14), solid(0x2b2b30, 0.3, 0.1)))
      return g
    },
  },
  {
    id: 'esportivo',
    nome: 'Esportivo',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, solid(0xd8552f, 0.85), 0.039, 0.0080))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.020, 0.018, 0.014, 12), solid(0x2a2d33, 0.6)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.014, 0.014, 0.016, 12), solid(0xe8e4dc, 0.4)))
      return g
    },
  },
  {
    id: 'pulseira',
    nome: 'Pulseira',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xc9ced4)
      g.add(pulseira(c, m, 0.038, 0.0055))
      const p2 = pulseira(c, m, 0.0385, 0.0042)
      p2.position.y -= 0.018
      g.add(p2)
      return g
    },
  },
  {
    id: 'couro',
    nome: 'Relogio de couro',
    build(c) {
      const g = new THREE.Group()
      // pulseira FINA e caixa chata: o relogio social e o oposto do esportivo,
      // que e gordo e cheio de botao
      g.add(pulseira(c, couro(0x50331c), 0.0375, 0.0045))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.0165, 0.0165, 0.007, 16), metal(0xd8b134)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.0132, 0.0132, 0.010, 16), solid(0xf4efe2, 0.35)))
      const coroa = mostrador(c, new THREE.CylinderGeometry(0.0022, 0.0022, 0.005, 6), metal(0xd8b134), 0.043)
      coroa.rotation.set(Math.PI / 2, 0, 0)
      coroa.position.z = -0.017
      g.add(coroa)
      return g
    },
  },
  {
    id: 'cronometro',
    nome: 'Cronometro esportivo',
    build(c) {
      const g = new THREE.Group()
      const preto = solid(0x1d2026, 0.6)
      g.add(pulseira(c, preto, 0.040, 0.0090))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.023, 0.021, 0.013, 14), solid(0xf07021, 0.5)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.017, 0.017, 0.016, 14), preto))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.011, 0.011, 0.018, 14), solid(0xe8e4dc, 0.4)))
      // dois botoes na lateral: o detalhe que so o cronometro tem
      for (const sgn of [1, -1]) {
        const b = mostrador(c, new THREE.CylinderGeometry(0.003, 0.003, 0.008, 6), preto, 0.046)
        b.rotation.set(0, 0, Math.PI / 2)
        b.position.y += sgn * 0.014
        b.position.z = 0
        g.add(b)
      }
      return g
    },
  },
  {
    id: 'smartwatch',
    nome: 'Smartwatch',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, solid(0x2a2d33, 0.9), 0.0385, 0.0060))
      // caixa QUADRADA de canto redondo e tela inteira: nenhuma outra peca do
      // catalogo tem essa silhueta
      const caixaR = mostrador(c, bloco(0.030, 0.010, 0.026, 0.008, solid(0x15161a, 0.4, 0.2)).geometry,
        solid(0x15161a, 0.4, 0.2))
      g.add(caixaR)
      const tela = mostrador(c, new THREE.BoxGeometry(0.026, 0.012, 0.022), solid(0x2f7bd6, 0.2, 0.0))
      g.add(tela)
      const linha = mostrador(c, new THREE.BoxGeometry(0.018, 0.014, 0.003), solid(0xe8f4ff, 0.2))
      linha.position.z = 0.004
      g.add(linha)
      return g
    },
  },
  {
    id: 'bolso',
    nome: 'Relogio de bolso',
    build(c) {
      // NAO fica no pulso: relogio de bolso mora na cintura. Como o slot esta
      // ancorado no antebraco, a peca inteira vai por montar() no 'hips' â€” e
      // por isso o build devolve null.
      const m = metal(0xd8b134)
      const g = new THREE.Group()
      const y = 0.030
      const z = frenteXZ(c, c.perfil.PELVIS, -0.052, y, FOLGA_LARGA, SOBRA_ACESSORIO)
      const caixaR = malha(new THREE.CylinderGeometry(0.021, 0.021, 0.007, 16), m, -0.052, y - 0.010, z)
      caixaR.rotation.x = Math.PI / 2
      g.add(caixaR)
      const face = malha(new THREE.CylinderGeometry(0.016, 0.016, 0.009, 16),
        solid(0xf4efe2, 0.35), -0.052, y - 0.010, z)
      face.rotation.x = Math.PI / 2
      g.add(face)
      const argola = anel(0.005, 0.0018, m, 6, 10)
      argola.position.set(-0.052, y + 0.014, z)
      g.add(argola)
      // corrente em U do bolso ate o cos, que e o que faz a peca ser lida
      const corr = malha(new THREE.TorusGeometry(0.030, 0.0022, 5, 12, Math.PI), m)
      corr.rotation.set(0, 0, Math.PI)
      corr.position.set(-0.022, y + 0.016, z + 0.006)
      g.add(corr)
      c.montar(g, 'hips')
      return null
    },
  },
  {
    id: 'couro-tachas',
    nome: 'Pulseira de tachas',
    build(c) {
      const g = new THREE.Group()
      const m = couro(0x2b2118)
      // bracelete LARGO: um tubo aberto de 3 cm, nao um aro fino
      const banda = tubo(0.0435, 0.0435, 0.030, m, 16, true)
      banda.position.y = -c.medida.FORE_ARM + 0.028
      g.add(banda)
      const tacha = metal(0xc9ced4)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        for (const dy of [-0.008, 0.008]) {
          const t = bola(0.0032, tacha, 6)
          t.position.set(Math.sin(a) * 0.0445, -c.medida.FORE_ARM + 0.028 + dy, Math.cos(a) * 0.0445)
          g.add(t)
        }
      }
      return g
    },
  },
]

// ===========================================================================
// JAQUETAS â€” catalogo VAZIO de proposito
// ===========================================================================
// Jaqueta virou blusa: sao a mesma aba e o mesmo slot, porque nao existe
// vestir as duas ao mesmo tempo. O array continua exportado (e continua em
// CATALOGOS_ROUPA) por dois motivos: character.js resolve o catalogo por nome
// e o customizer monta as abas a partir do mesmo objeto â€” aba de catalogo
// vazio ele esconde sozinho, entao a aba some sem ninguem tocar na UI. O campo
// 'jaqueta' do pacote de aparencia segue existindo e valendo 0 pra sempre:
// mexer no formato binario por causa de um byte dormindo custaria mais do que
// deixar ele dormir.
export const JAQUETAS = []

export const CATALOGOS_ROUPA = {
  chapeu: CHAPEUS, calcado: CALCADOS, blusa: BLUSAS, calca: CALCAS,
  colar: COLARES, anelAcess: ANEIS, tatuagem: TATUAGENS, relogio: RELOGIOS,
  jaqueta: JAQUETAS,
}
