import * as THREE from 'three'
import {
  HEAD, HEAD_S, activeHead, useHead, eggSurface, eggNormal, hairColorFrom,
  hairMat, scalp, byAz, sh, rng, shade, mix, clamp, tecelagem, fio, peloMat,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/cabelo-extra.js — TRES CORTES COM SILHUETA.
//
// Os tres primeiros cortes do jogo (rosto/cabelo.js) tem o mesmo problema: sao
// todos CASCA COLADA NO CRANIO. Mudam a textura e a borda, mas a silhueta e a
// mesma nos tres — de longe o personagem tem sempre a mesma cabeca, e foi essa
// a queixa ("estao sem identidade visual, quero mais 3 porem diferentes e
// MAIORES").
//
// Entao a regra deste arquivo e uma so: CADA CORTE TEM QUE MUDAR A SILHUETA.
// Nao adianta um corte novo que continue cabendo dentro do contorno do cranio —
// e o contorno que se ve a 5 metros, que e a distancia em que o jogo acontece.
//
//   Topete    massa que SOBE 6 cm acima do cranio e varre pra tras
//   Arrepiado 60 espetos saindo em todas as direcoes
//   Samurai   um coque solto atras do alto da cabeca
//
// Os tres partem de uma casca base fina (senao aparece couro cabeludo por baixo
// da massa) e por cima dela vem a peca que da a forma.
// ---------------------------------------------------------------------------

const S = HEAD_S

/**
 * O theta em que a superficie do cranio ATIVO esta na altura `y`.
 *
 * A linha do cabelo tem que ser declarada em ALTURA e nao em theta: um theta
 * fixo cai em alturas diferentes em cada um dos seis cranios, e o mesmo corte
 * viraria franja num e coroa noutro.
 */
function thetaNaAltura(y, s = 1) {
  const sp = activeHead()
  const uy = clamp((y / (s * HEAD.ry) + 1) / sp.yTop - 1, -1, 1)
  return Math.acos(uy)
}

/** Linha de corte a partir de pares [azimute, altura]. */
function linha(pares, s = 1) {
  const alt = byAz(pares)
  return (az) => thetaNaAltura(alt(az), s)
}

// A base dos tres: alta na testa (o cabelo esta penteado pra cima ou preso),
// desce na tempora, mergulha na patilha e sobe por cima da orelha.
const LINHA_BASE = [
  [0.00, 0.1540 * S],
  [0.36, 0.1500 * S],
  [0.70, 0.1240 * S],
  [1.00, 0.0700 * S],
  [1.30, 0.0240 * S],   // patilha
  [1.66, 0.0360 * S],   // sobe por cima da orelha
  [2.30, -0.0200 * S],
  [Math.PI, -0.0520 * S],
]

/** Casca base fina. Ela nunca e a forma do corte, so tapa o couro cabeludo. */
function base(cor, s = 1.035, pares = LINHA_BASE) {
  return scalp(cor, linha(pares, s), { s, thetaMax: 2.45, wSeg: 46, hSeg: 26 })
}

// ---------------------------------------------------------------------------
// COSTURA DE ANEIS — a ferramenta dos volumes deste arquivo.
// Uma pilha de aneis fechados por indice (sem coluna duplicada, sem emenda) e
// tampada nas duas pontas. E com ela que o topete e o coque sao feitos.
// ---------------------------------------------------------------------------
function loft(secoes, colunas = 18, tapaTopo = true) {
  const pos = []
  const idx = []
  const linhas = []
  const put = (x, y, z) => { const i = pos.length / 3; pos.push(x, y, z); return i }

  for (const sec of secoes) {
    const l = []
    for (let c = 0; c < colunas; c++) {
      const a = (c / colunas) * Math.PI * 2
      const p = sec(Math.cos(a), Math.sin(a))
      l.push(put(p[0], p[1], p[2]))
    }
    linhas.push(l)
  }
  if (tapaTopo) {
    const p = secoes[secoes.length - 1](0, 0)
    linhas.push([put(p[0], p[1], p[2])])
  }

  for (let a = 0; a < linhas.length - 1; a++) {
    const A = linhas[a], B = linhas[a + 1]
    if (B.length === 1) {
      for (let i = 0; i < A.length; i++) idx.push(A[i], B[0], A[(i + 1) % A.length])
      continue
    }
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length
      idx.push(A[i], B[j], A[j], A[i], B[i], B[j])
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()

// ===========================================================================
// 1. TOPETE — o de ator, penteado pra cima e pra tras
// ===========================================================================
//
// A massa e uma VARREDURA LATERAL: uma seccao percorre a testa de uma tempora a
// outra, e em cada azimute ela sobe, engorda e tomba pra tras. O pico fica no
// meio (az 0) e some nas pontas.
//
// Por que varredura lateral e nao uma casca inflada: casca inflada sobe junto
// com o cranio e o topete acaba acompanhando a curva da cabeca — vira um
// capacete gordo. Aqui o eixo da massa e uma curva PROPRIA, que sai da linha do
// cabelo e vai pra tras por cima do cranio, entao a silhueta lateral ganha um
// bico na frente que a cabeca nao tem.
const TOPETE_AZ = 1.22        // ate onde ele varre pros lados (70 graus)

function topete(cor) {
  const secoes = []
  const N = 22
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const az = (t * 2 - 1) * TOPETE_AZ
    // perfil da massa ao longo da testa: cheia no meio, some nas pontas
    const k = Math.cos((az / TOPETE_AZ) * (Math.PI / 2))
    const k2 = k * k
    // nasce na linha do cabelo do proprio cranio e sobe dali
    const thetaPe = thetaNaAltura(0.140 * S)
    eggSurface(thetaPe, az, 1.02, _p)
    eggNormal(thetaPe, az, _n)
    // altura e recuo: o topo do topete fica 6 cm acima do cranio e 2 cm atras
    const alto = 0.076 * S * k2
    const recua = -0.020 * S * k2
    const cx = _p.x + _n.x * 0.010 * S * k
    const cy = _p.y + alto * 0.55
    const cz = _p.z + _n.z * 0.012 * S * k + recua * 0.35
    const rW = mix(0.006, 0.030, k2) * S       // espessura lateral da mecha
    const rH = mix(0.008, 0.060, k2) * S       // altura
    secoes.push((u, v) => [
      cx + u * rW * 0.55,
      cy + v * rH,
      cz + u * rW - v * 0.020 * S * k2,        // inclina pra tras subindo
    ])
  }
  // a varredura e ABERTA nas pontas: tampar deixaria duas rolhas na tempora
  return loft(secoes, 14, false)
}

// ===========================================================================
// 2. ARREPIADO — espetos de verdade
// ===========================================================================
//
// Sao 64 espetos plantados no topo e na coroa, cada um saindo pela NORMAL da
// pele e depois vergado. O que faz ler como cabelo espetado e a variacao: sem
// ela os 64 ficam paralelos e a cabeca vira um ourico de brinquedo.
//
// Custo: fio() de 5 aneis x 4 colunas = 40 triangulos por espeto, tudo numa
// BufferGeometry so — 2560 triangulos e um draw call.
function arrepiado(cor) {
  const ma = tecelagem()
  const r = rng(9137)
  const eixo = new THREE.Vector3()
  // A LINHA DO CABELO, e nao um theta fixo, e quem limita o espeto.
  //
  // Antes a espiral ia solta ate theta 1.18, que na testa cai em 0.070 * S — ou
  // seja, ABAIXO da sobrancelha (0.098 * S) e praticamente em cima do olho. O
  // defeito nao aparecia nas laterais nem atras, so na frente, porque e la que a
  // linha do cabelo e mais alta: a mesma espiral que na nuca ainda esta no
  // couro cabeludo, na testa ja passou da testa inteira.
  //
  // Cortar pela propria linha de base resolve nos seis cranios de uma vez, e
  // sem tabela nova: 0.10 rad de margem tira a RAIZ de dentro da borda, senao
  // metade do tubo nasce fora do cabelo e fica boiando na pele.
  const corte = linha(LINHA_BASE, 1.03)
  const N = 64
  for (let i = 0; i < N; i++) {
    // distribuicao em espiral: cobre o topo sem amontoar no polo
    const t = (i + 0.5) / N
    // ANGULO DE OURO, DOBRADO PRA [-PI, PI].
    //
    // `i * 2.399963` cresce sem limite: no espeto 2 ja passa de PI e no 63 esta
    // em 151 rad. eggSurface e cos() nao ligam (sao periodicos), mas byAz —
    // que e quem le a tabela da linha do cabelo — compara |az| contra pares que
    // terminam em PI e devolve o ULTIMO par pra qualquer coisa acima disso. Sem
    // dobrar, 62 dos 64 espetos recebiam a altura da NUCA (-0.052 * S) como
    // limite, o corte pela linha do cabelo nao valia pra quase nenhum, e a
    // espiral voltava a plantar espeto na testa em cima da sobrancelha — com o
    // codigo do corte ali, escrito e sem efeito.
    const bruto = i * 2.399963
    const az = bruto - Math.PI * 2 * Math.floor((bruto + Math.PI) / (Math.PI * 2))
    const theta = Math.max(0.14, Math.min(0.16 + Math.sqrt(t) * 1.02, corte(az) - 0.10))
    eggSurface(theta, az, 1.03, _p)
    eggNormal(theta, az, _n)
    // Quanto este espeto esta VIRADO PRA TESTA. 1 no meio da frente, 0 nas
    // laterais, negativo atras. E ele que separa os espetos que a camera ve por
    // cima da sobrancelha dos que ela ve contra o ceu.
    const frente = Math.max(0, Math.cos(az))
    // o espeto sai pela normal, mas puxado pra CIMA: cabelo arrepiado aponta
    // pro ceu, nao pros lados. Na frente esse puxao e MAIOR — um espeto da
    // testa que se inclina pra frente cruza o campo de visao inteiro e vai
    // pousar em cima da sobrancelha, mesmo com a raiz plantada no couro.
    const dir = _n.clone()
    dir.y += 0.85 + 0.55 * frente
    dir.x += (r() - 0.5) * 0.45
    dir.z += (r() - 0.5) * 0.45 * (1 - 0.6 * frente)
    dir.normalize()
    // o eixo da curvatura e perpendicular ao espeto: verga sem torcer
    eixo.set(-dir.z, 0, dir.x).normalize()
    // e mais curto na frente pelo mesmo motivo: 12 cm de espeto saindo da linha
    // do cabelo cobrem a testa toda, por mais em pe que ele esteja
    const comp = (0.048 + r() * 0.042) * S * (1 - 0.30 * frente)
    const raio = (0.0075 + r() * 0.0055) * S
    fio(ma, _p, dir, comp, raio, eixo, (r() - 0.5) * 0.9, 5, 4)
  }
  return ma
}

// ===========================================================================
// 3. COQUE SAMURAI — o volume fica ATRAS E EM CIMA
// ===========================================================================
//
// O coque nao e uma bola colada: sao tres coisas que juntas leem como cabelo
// preso — o PUXADO (a casca com estrias indo pra tras), o NO (elipsoide achatado
// no alto da nuca) e a MECHA que sai dele. Sem a mecha o no le como boina.
function coque(cor, corEscura) {
  const g = new THREE.Group()

  // 1) o no: elipsoide achatado, no alto e atras
  // O NO TEM QUE QUEBRAR A SILHUETA. Na primeira versao ele estava em theta 0.62
  // com 3 cm de afastamento, e ficava DENTRO do contorno da cabeca: de frente e
  // de tres quartos o corte lia como um cabelo penteado liso, sem coque nenhum.
  // Foi fotografado. Subir pra 0.40 e afastar 5.5 cm poe o no acima e atras do
  // cranio, que e onde um coque samurai fica de verdade.
  const thetaNo = 0.40
  eggSurface(thetaNo, Math.PI, 1.02, _p)
  eggNormal(thetaNo, Math.PI, _n)
  const cx = _p.x + _n.x * 0.055 * S
  const cy = _p.y + 0.030 * S
  const cz = _p.z + _n.z * 0.055 * S
  const secoes = []
  const M = 12
  for (let i = 0; i <= M; i++) {
    const u = i / M
    const ang = u * Math.PI
    const rr = Math.sin(ang)
    const yy = -Math.cos(ang)
    secoes.push((a, b) => [
      cx + a * 0.042 * S * rr,
      cy + yy * 0.036 * S,
      cz + b * 0.034 * S * rr,
    ])
  }
  g.add(sh(new THREE.Mesh(loft(secoes, 16, false), hairMat(cor))))

  // 2) a amarracao: dois aros escuros estrangulando a base do no
  for (const dy of [-0.024, -0.033]) {
    const aro = sh(new THREE.Mesh(
      new THREE.TorusGeometry(0.036 * S, 0.0046 * S, 6, 18), hairMat(corEscura)))
    aro.rotation.x = Math.PI / 2
    aro.position.set(cx, cy + dy * S, cz)
    g.add(aro)
  }

  // 3) a mecha que sai do no e cai pra tras
  const mecha = []
  const K = 10
  for (let i = 0; i <= K; i++) {
    const t = i / K
    const rr = (1 - t * 0.75)
    mecha.push((a, b) => [
      cx + a * 0.020 * S * rr,
      cy + 0.030 * S - t * 0.095 * S,
      cz - 0.010 * S - t * 0.038 * S + b * 0.016 * S * rr,
    ])
  }
  g.add(sh(new THREE.Mesh(loft(mecha, 12, true), hairMat(cor))))

  return g
}

// ===========================================================================

// A linha do samurai e MAIS ALTA nas laterais: cabelo preso deixa a tempora e a
// orelha limpas, e e esse contraste que faz o coque ler como "preso" em vez de
// "cabelo comprido com um caroco atras".
const LINHA_PRESO = [
  [0.00, 0.1560 * S],
  [0.40, 0.1520 * S],
  [0.80, 0.1300 * S],
  [1.10, 0.1000 * S],
  [1.40, 0.0740 * S],
  [1.90, 0.0300 * S],
  [Math.PI, -0.0100 * S],
]

export const CABELOS_EXTRA = [
  {
    id: 'topete',
    nome: 'Topete',
    name: 'Topete',
    metodo: 'casca base + massa varrida de tempora a tempora que sobe 6 cm acima do cranio e tomba pra tras — a silhueta ganha um bico que a cabeca nao tem',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(base(cor, 1.032))
      g.add(sh(new THREE.Mesh(topete(cor), hairMat(cor))))
      return g
    },
  },
  {
    id: 'arrepiado',
    nome: 'Arrepiado',
    name: 'Arrepiado',
    metodo: '64 espetos de verdade (tecelagem + fio) plantados em espiral pela normal da pele e vergados um a um, sobre uma casca base fina',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(base(cor, 1.028))
      const ma = arrepiado(cor)
      // peloMat com side DoubleSide: o espeto e fino e a face de dentro dele
      // aparece na ponta, onde o tubo quase fecha
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 0))))
      return g
    },
  },
  {
    id: 'samurai',
    nome: 'Coque samurai',
    name: 'Coque samurai',
    metodo: 'casca puxada com a linha alta nas laterais + no elipsoide no alto da nuca, dois aros de amarracao e a mecha que cai — o volume sai da silhueta pra TRAS',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(scalp(cor, linha(LINHA_PRESO, 1.030), { s: 1.030, thetaMax: 2.30, wSeg: 44, hSeg: 24 }))
      g.add(coque(cor, shade(cor, 0.55)))
      return g
    },
  },
]

export default CABELOS_EXTRA
