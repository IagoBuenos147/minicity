import * as THREE from 'three'
import {
  HEAD, HEAD_S, activeHead, useHead,
  eggSurface, eggNormal, pontoNaPele,
  scalp, hairMat, peloMat,
  hairColorFrom, skinOf, mixHex, shade,
  byAz, clamp, smoothstep, gauss, rng,
  sh, soldarNormais, tecelagem, fio,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/cabelo-corte.js — OITO CORTES DO CARTAZ DE BARBEARIA.
//
// O dono do projeto mandou um cartaz de cortes masculinos e pediu estes oito,
// com nome e formato do cartaz: french crop, crop texturizado, undercut, perm
// coreano, mullet, cortina, escovinha e trancinhas.
//
// A REGRA CONTINUA A MESMA DE cabelo-extra.js: cada corte tem que MUDAR A
// SILHUETA, nao so a textura. Um corte que caiba inteiro dentro do contorno do
// cranio e um corte que ninguem reconhece a 5 metros. Por isso, pra cada um dos
// oito, o paragrafo de comentario antes do build explica qual PEDACO DO
// CONTORNO e exclusivo dele:
//
//   french-crop        bloco de franja reto que desce ate o teto de seguranca
//   crop-texturizado    o mesmo bloco, mas em tufos separados — topo denteado
//   undercut            DEGRAU RADIAL: o topo comprido armario por cima da
//                       lateral raspada, com vao (nao mistura suave)
//   perm-coreano        cupula alta e redonda, bem maior que qualquer outro
//                       corte deste arquivo — e "alta" e literal
//   mullet              curto na frente, e uma cauda que desce ABAIXO do
//                       proprio pescoco atras — e o unico corte cuja silhueta
//                       sai do contorno da cabeca por baixo
//   cortina             vale estreito no centro (a risca) com duas mechas
//                       deslocadas caindo cada uma pro seu lado
//   escovinha            topo ACHATADO — o cranio deixa de ser ovo pra virar
//                       ovo com uma mesa em cima
//   trancinhas           sete cordoes em RELEVO, nao uma casca lisa — a
//                       silhueta ganha estrias que vao da testa a nuca
//
// A MATEMATICA DE BASE (linha do corte em ALTURA, nao em theta; PISO_Y como
// teto de seguranca pra nao comer sobrancelha; borda ondulada por duas
// senoides de periodo inteiro pra nao virar aro de capacete) e a MESMA RECEITA
// de rosto/cabelo.js. Isso nao e preguica: cabelo.js documenta tres rodadas de
// correcao pra chegar nela (o "V no meio da testa", o "capacete" e o "chifre"
// da folha de contato) e reabrir esses tres bugs aqui seria pagar de novo por
// um problema ja resolvido. A tabela de PISO_Y abaixo e a MESMA de cabelo.js,
// copiada e nao reinventada, porque e seguranca anatomica (onde fica a
// sobrancelha), nao estilo de corte.
//
// O que E NOVO neste arquivo, porque nenhum corte anterior precisou:
//
//   cascaCampo()    generaliza o metodo A de cabelo.js (loft do polo ate a
//                   linha, com s(theta,az) proprio) pra receber o campo e a
//                   borda como parametro — 6 dos 8 cortes usam esta MESMA
//                   funcao com um campo diferente cada, em vez de reescrever
//                   o loft oito vezes.
//   loft()          a mesma ferramenta de aneis empilhados de cabelo-extra.js
//                   (usada la pro topete e pro coque), refeita aqui porque e
//                   privada daquele arquivo — usada na cauda do mullet.
//   achatarTopo()   NOVO: pos-processo que nivela os vertices do polo numa
//                   altura comum. E o que da o topo chapado da escovinha; sem
//                   isso todo corte curto vira o mesmo ovo com pelo mais fino.
//   cordaoNaPele()  NOVO: tubo que marcha em theta (de um az fixo) grudado na
//                   pele, como um fio() que em vez de reto segue a curvatura
//                   do cranio do comeco ao fim. E como as trancinhas viram
//                   relevo em vez de curva desenhada.
// ---------------------------------------------------------------------------

const S = HEAD_S

// ---------------------------------------------------------------------------
// 1. A RECEITA DE cabelo.js, REAPROVEITADA (nao reinventada — ver acima)
// ---------------------------------------------------------------------------

/** Inversa de yAt(): em que theta a casca de escala `s` cruza a altura `y`. */
function thetaNaAltura(y, s = 1) {
  const sp = activeHead()
  const uy = clamp((y / (s * HEAD.ry) + 1) / sp.yTop - 1, -1, 1)
  return Math.acos(uy)
}

const _g = new THREE.Vector3()
/** Azimute GEOMETRICO (atan2) do azimute PARAMETRICO `az` em `theta` — ver
 *  cabelo.js: PISO_Y esta ancorado numa POSICAO, e os dois so coincidem se
 *  fx == fz, o que nao vale nos cranios largos/compridos. */
function azGeo(theta, az) {
  eggSurface(theta, az, 1, _g)
  return Math.atan2(_g.x, _g.z)
}

/**
 * Teto de seguranca: ate onde QUALQUER corte deste arquivo pode descer sem
 * comer a sobrancelha. Tabela IDENTICA a de cabelo.js — e a mesma cabeca, a
 * mesma sobrancelha em 0.096*S, o mesmo motivo pra cada no. Nao ha "versao
 * cortes-novos" desta conta.
 */
const PISO_Y = byAz([
  [0.55, 0.133 * S],
  [0.75, 0.062 * S],
  [0.90, 0.012 * S],
  [1.05, -0.002 * S],
  [1.25, -0.050 * S],
  [1.45, -0.070 * S],
  [Math.PI, -0.60],
])

/** Duas senoides de periodo inteiro diferente: borda que nunca repete o
 *  proprio desenho mas fecha sem degrau na nuca (ver cabelo.js). */
function ondaDeCorte(a1, p1, f1, a2, p2, f2) {
  return (az) => a1 * Math.sin(az * p1 + f1) + a2 * Math.sin(az * p2 + f2)
}

/** Linha em ALTURA + onda + teto do piso, devolvendo THETA pronto pra usar
 *  como borda de loft ou como hi() de scalp(). */
function bordaOndulada(pares, s, onda) {
  const alt = byAz(pares)
  return (az) => {
    const th = thetaNaAltura(alt(az), s) + onda(az)
    const teto = thetaNaAltura(PISO_Y(azGeo(th, az)), s)
    return th > teto ? teto : th
  }
}

// ---------------------------------------------------------------------------
// 2. cascaCampo — o metodo A de cabelo.js, generalizado
//
// cabelo.js escreveu este loft uma vez pro corte social (campo de volume
// esculpido) e nao exportou a funcao — ela e privada daquele modulo. Em vez de
// copiar o corte, copiamos a TECNICA: o loft em si vira parametro (volumeFn,
// bordaFn), e cada um dos seis cortes que precisam de uma casca esculpida
// (nao so uma casca colada) chama isto com o proprio campo. Zero geometria
// nova por corte, seis campos diferentes.
// ---------------------------------------------------------------------------
function cascaCampo(volumeFn, bordaFn, cor, cols = 60, linhas = 14) {
  const pos = []
  const idx = []
  const p = new THREE.Vector3()

  // polo unico compartilhado (senao o leque de colunas no topo vira um ponto
  // aceso: cada coluna teria a propria normal na mesma posicao)
  eggSurface(0, 0, volumeFn(0, 0, 0), p)
  pos.push(p.x, p.y, p.z)

  for (let i = 0; i < cols; i++) {
    const az = -Math.PI + ((i + 0.5) / cols) * Math.PI * 2
    const lim = bordaFn(az)
    for (let j = 1; j <= linhas; j++) {
      const t = j / linhas
      // concentra linhas perto da borda, que e onde o recorte precisa de
      // resolucao — o mesmo remapeamento de cabelo.js
      const th = lim * (1 - Math.pow(1 - t, 1.35))
      eggSurface(th, az, volumeFn(th / lim, th, az), p)
      pos.push(p.x, p.y, p.z)
    }
  }

  const vid = (i, j) => 1 + ((i % cols) * linhas) + (j - 1)
  for (let i = 0; i < cols; i++) {
    idx.push(0, vid(i, 1), vid(i + 1, 1))
    for (let j = 1; j < linhas; j++) {
      idx.push(vid(i, j), vid(i, j + 1), vid(i + 1, j + 1))
      idx.push(vid(i, j), vid(i + 1, j + 1), vid(i + 1, j))
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return sh(new THREE.Mesh(geo, hairMat(cor)))
}

// ---------------------------------------------------------------------------
// 3. loft — a mesma ferramenta de aneis empilhados de cabelo-extra.js
// (topete/coque usam isto la; e privada daquele modulo, entao refeita aqui
// pra servir a cauda do mullet).
// ---------------------------------------------------------------------------
function loft(secoes, colunas = 12, tapaTopo = true) {
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

// ---------------------------------------------------------------------------
// 4. achatarTopo — NOVO. Pos-processo que nivela o polo numa altura comum.
//
// Nenhum outro corte do jogo precisou disto porque nenhum outro corte tem uma
// silhueta reta no alto: `s` em eggSurface so escala RADIALMENTE, entao nao
// tem como um campo de volume sozinho desenhar um plato — ele sempre devolve
// um ovo, so que maior ou menor. A escovinha PRECISA do plato (e o que separa
// "buzz cut redondo" de "flat top"), entao depois do loft pronto este passo
// pega todo vertice acima de `yTeto` e dentro do raio `raioPlano` do eixo Y e
// achata na mesma altura — o mesmo tipo de edicao direta de vertice que
// rugarCasca() faz em cabelo.js, so que nivelando em vez de ruidando.
// ---------------------------------------------------------------------------
function achatarTopo(mesh, yTeto, raioPlano) {
  const geo = mesh.geometry
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    if (y > yTeto && Math.hypot(x, z) < raioPlano) pos.setY(i, yTeto)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  geo.computeBoundingSphere()
  return mesh
}

// ---------------------------------------------------------------------------
// 5. cordaoNaPele — NOVO. Um tubo que marcha por um CAMINHO (theta, az)
// grudado na pele, pra trancinha virar relevo de verdade em vez de uma linha
// desenhada.
//
// fio() (a ferramenta de pelo do nucleo) anda em LINHA RETA com uma curvatura
// so — serve pra um fio de barba de 1 cm, mas uma trança cobre da testa a
// nuca, mais de 90 graus de curva do cranio, e uma curvatura constante nunca
// acompanha isso. cordaoNaPele amostra a PROPRIA superficie (pontoNaPele) em
// varios passos de um `pathFn(t) -> {theta, az}` (constroi um anel
// perpendicular ao caminho em cada um — a mesma ideia de base U/V do fio(),
// so que o "eixo" sai da curva real da cabeca em vez de uma curvatura
// constante) e fecha as duas pontas com um leque — senao a trança aparece OCA
// olhando de frente ou de tras.
//
// PRECISA SER (theta, az) E NAO SO THETA: a primeira versao recebia um UNICO
// az e so variava theta — o que marcha DECENTE NO MESMO MERIDIANO do inicio
// ao fim, nunca troca de lado do cranio. Pra uma trança sair da testa e
// chegar na nuca por CIMA da cabeca, o az TEM que mudar no meio do caminho
// (ver caminhoCordao, na secao 8). Foi esse o motivo da trança ter cruzado o
// rosto na primeira leva de fotos: com az fixo e theta so crescendo, o
// "cordao" descia pela FRENTE da cabeca (testa -> sobrancelha -> olho ->
// boca) em vez de passar por cima.
// ---------------------------------------------------------------------------
function cordaoNaPele(ma, pathFn, raio, steps = 16, N = 6) {
  const afast = 0.006 * S
  const pts = []
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const pt = pathFn(t)
    pontoNaPele(pt.theta, pt.az, afast, p, n)
    pts.push(p.clone())
  }

  const refY = new THREE.Vector3(0, 1, 0)
  const refX = new THREE.Vector3(1, 0, 0)
  const tang = new THREE.Vector3()
  const eixoU = new THREE.Vector3()
  const eixoV = new THREE.Vector3()
  let primeiro = null
  let ant = null

  for (let i = 0; i <= steps; i++) {
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(steps, i + 1)]
    tang.copy(next).sub(prev)
    if (tang.lengthSq() < 1e-12) tang.set(0, -1, 0)
    tang.normalize()
    const ref = Math.abs(tang.y) > 0.92 ? refX : refY
    eixoU.crossVectors(ref, tang).normalize()
    eixoV.crossVectors(tang, eixoU).normalize()
    // um pouco mais fino nas duas pontas — uma trança nao nasce nem morre
    // numa quina reta, mas tambem nao afina ate zero como fio de cabelo solto
    const r = raio * (0.55 + 0.45 * Math.sin(Math.min(1, i / steps) * Math.PI))
    const c = pts[i]
    const anel = []
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2
      const cx = Math.cos(a) * r, cy = Math.sin(a) * r
      anel.push(ma.v(
        c.x + eixoU.x * cx + eixoV.x * cy,
        c.y + eixoU.y * cx + eixoV.y * cy,
        c.z + eixoU.z * cx + eixoV.z * cy,
      ))
    }
    if (ant) for (let k = 0; k < N; k++) ma.quad(ant[k], ant[(k + 1) % N], anel[(k + 1) % N], anel[k])
    else primeiro = anel
    ant = anel
  }

  const ca = ma.v(pts[0].x, pts[0].y, pts[0].z)
  for (let k = 0; k < N; k++) ma.tri(primeiro[(k + 1) % N], primeiro[k], ca)
  const cb = ma.v(pts[steps].x, pts[steps].y, pts[steps].z)
  for (let k = 0; k < N; k++) ma.tri(ant[k], ant[(k + 1) % N], cb)
}

// ===========================================================================
// 1. FRENCH CROP
//
// Curto nas laterais, curto no topo, e uma franja RETA caida na testa. Um
// unico campo resolve os dois: uma casca curta em quase toda a area, e so
// perto da borda, so na frente (gauss em az centrado em 0), um bloco que
// engrossa — a franja. Como a linha do corte na frente ja fica quase colada
// no teto do PISO_Y (0.134*S contra o teto de 0.133*S), o CLAMP DO PISO faz a
// borda sair naturalmente RETA no meio da testa, de graca: e o mesmo
// mecanismo de seguranca virando o proprio corte.
//
// CONSERTO (a foto do provador mostrou o corte SUMIDO — cabeca sem cabelo
// nenhum de frente): a primeira versao usava baseline s=1.010 e um bump de
// franja de so 0.034. A 18 cm de raio de cabeca isso e 1,8 mm de casca e
// 6 mm de franja — fino demais pra separar de pele no card do customizador,
// que enquadra o boneco de frente e nao de perto. baseline subiu pra 1.028
// (~5 mm, a mesma ordem de grandeza do "Social esculpido" de cabelo.js, que
// aparece bem na mesma foto) e o bump da franja pra 0.075 (~13,5 mm) — a
// franja agora e um bloco de verdade, nao uma aresta.
// ===========================================================================
const FC_LINHA = [
  [0.00, 0.134 * S],  // quase no teto do piso: a franja cheia, o mais baixo que se pode ir
  [0.30, 0.132 * S],
  [0.60, 0.120 * S],
  [0.90, 0.085 * S],  // tempora: sobe rapido — "curto nas laterais"
  [1.25, 0.020 * S],  // patilha
  [1.60, 0.032 * S],  // sobe por cima da orelha (o degrau que evita o aro, ver cabelo.js)
  [2.20, -0.015 * S],
  [Math.PI, -0.045 * S],
]
const bordaFrenchCrop = bordaOndulada(FC_LINHA, 1, ondaDeCorte(0.018, 3, 0.5, 0.010, 5, -1.2))

function volumeFrenchCrop(u, th, az) {
  // SEGUNDO CONSERTO: o primeiro (baseline 1.028 + bump so na borda) ainda
  // sumia na foto. Comparado com o undercut — o unico corte "cheio" que
  // funciona de primeira — o termo largo dele (gauss(th,0.36,0.34) com
  // amplitude 0.050 SOBRE baseline 1.055) cobre o campo INTEIRO em ~1.07-1.10;
  // o meu so alcancava ~1.03-1.04 fora da borda, menos da metade da espessura
  // que realmente aparece de frente. baseline e o termo largo agora seguem a
  // MESMA ordem de grandeza do undercut; a franja continua sendo o reforco
  // por cima, so que comecando mais cedo em u (0.15 em vez de 0.30) pra nao
  // ficar restrita a ultima fatia da casca.
  // TERCEIRO AJUSTE (feito na revisao da grade): mais 3.5% de casca por cima.
  // A calibragem pelo undercut acertou a ORDEM de grandeza, mas o que o card
  // do customizador mostra e a SILHUETA contra o fundo — e o que faz o cabelo
  // existir de frente e o quanto de coroa escura sobra ACIMA do contorno do
  // cranio, nao a espessura media do campo. 3.5% do raio da cabeca sao uns
  // 6 mm de coroa, que e a diferenca entre "corte curto" e "careca" nesse
  // tamanho de miniatura.
  let s = 1.080
  s += 0.045 * gauss(th, 0.32, 0.36)                             // massa cobrindo quase todo o campo
  s += 0.060 * gauss(az, 0, 0.60) * smoothstep(0.15, 1.0, u)      // A FRANJA: reforco extra, so na frente
  return s
}

// ===========================================================================
// 2. CROP TEXTURIZADO
//
// Mesmo contorno do french crop (mesma linha, mesmo teto de franja), MAS o
// topo vira ~110 tufos curtos e gordos plantados em espiral (fio() reaproveitado
// como "tufo" — um tubo curto e grosso em vez de fino e longo) e a franja vira
// ~22 fios de COMPRIMENTO IRREGULAR em vez de um bloco liso. A casca base fica
// quase lisa (o campo nao carrega textura nenhuma): quem desenha a silhueta
// denteada sao os tufos, geometria de verdade, nao so uma cor diferente.
// ===========================================================================
const CT_LINHA = [
  [0.00, 0.136 * S],
  [0.30, 0.134 * S],
  [0.60, 0.122 * S],
  [0.90, 0.086 * S],
  [1.25, 0.020 * S],
  [1.60, 0.032 * S],
  [2.20, -0.015 * S],
  [Math.PI, -0.045 * S],
]
const bordaCropTex = bordaOndulada(CT_LINHA, 1, ondaDeCorte(0.016, 3, 1.1, 0.011, 5, -0.4))

function volumeCropTex(u, th, az) {
  return 1.008 + 0.004 * gauss(th, 0.30, 0.32)
}

function tufosCropTex(cor) {
  const ma = tecelagem()
  const r = rng(71001)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 110
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N
    // espiral de angulo de ouro, DOBRADA pra [-PI, PI] — sem isso i*2.399963
    // cresce sem limite e byAz (que le a linha do corte) devolve sempre o
    // ultimo par da tabela pra quase todo mundo. Mesmo bug, mesmo conserto de
    // cabelo-extra.js (arrepiado()).
    const bruto = i * 2.399963
    const az = bruto - Math.PI * 2 * Math.floor((bruto + Math.PI) / (Math.PI * 2))
    const th = 0.10 + Math.sqrt(t) * 0.58   // so o TOPO — a franja fica pro metodo de baixo
    eggSurface(th, az, 1.012, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y += 0.55 + r() * 0.5
    dir.x += (r() - 0.5) * 0.7
    dir.z += (r() - 0.5) * 0.7
    dir.normalize()
    eixo.set(-dir.z, 0, dir.x).normalize()
    const comp = (0.010 + r() * 0.010) * S
    const raio = (0.0045 + r() * 0.0035) * S
    fio(ma, p, dir, comp, raio, eixo, (r() - 0.5) * 1.1, 3, 4)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 0)))
}

function franjaCropTex(cor) {
  const ma = tecelagem()
  const r = rng(71002)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 22
  for (let i = 0; i < N; i++) {
    const az = -0.70 + ((i + r() * 0.6) / N) * 1.40
    const th = bordaCropTex(az) - (0.02 + r() * 0.05)   // nasce um pouco dentro da casca
    eggSurface(th, az, 1.012, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y -= 0.6 + r() * 0.5
    dir.x += (r() - 0.5) * 0.3
    dir.normalize()
    eixo.set(Math.cos(az), 0, -Math.sin(az))
    const comp = (0.012 + r() * 0.014) * S   // comprimento IRREGULAR: e o que faz a franja ficar desfiada
    fio(ma, p, dir, comp, 0.0016 * S, eixo, 0.2, 4, 3)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1)))
}

// ===========================================================================
// 3. UNDERCUT
//
// O corte deste arquivo que mais depende do CONTRATO: "o undercut TEM que ter
// o degrau na lateral". Duas cascas SEPARADAS, nao um blend:
//
//   raspadoUndercut()  casca fina (s ~ 1.008) quase cor de pele, cobrindo a
//                      cabeca INTEIRA — a lateral raspada.
//   capaUndercut()     casca de campo pesado (s ~ 1.05-1.12) que só desce ate
//                      uma linha ALTA e quase constante (UC_LINHA mal varia
//                      0.150 a 0.112) — o topo comprido penteado pra tras.
//
// As duas cobrem os MESMOS (theta, az) por baixo da capa: como a capa tem `s`
// bem maior, a borda dela (o ultimo anel do loft) fica um vao inteiro (7 a 16
// mm, o raio da cabeca vezes a diferenca de escala) POR FORA de onde a casca
// rasa esta. Esse vao — nao um gradiente de cor — E o degrau: de qualquer
// angulo a silhueta muda de raio de repente na linha de corte, que e
// exatamente como luz e sombra desenham um undercut de verdade.
//
// Por isso volumeUndercut() NAO afina perto da borda como os outros campos
// deste arquivo (compare com volumeFrenchCrop/volumePerm, que tem
// smoothstep(1,0.8,u) pra sumir suave): aqui a borda tem que ficar GROSSA ate
// o fim, senao o degrau vira uma pontinha fina que some no antialiasing.
// ===========================================================================
const UC_LINHA = [
  [0.00, 0.150 * S],
  [0.40, 0.148 * S],
  [0.90, 0.140 * S],
  [1.30, 0.125 * S],  // acima da orelha, e BEM acima — o undercut e alto por toda a volta
  [1.80, 0.118 * S],
  [2.40, 0.115 * S],
  [Math.PI, 0.112 * S],
]
const bordaUndercut = bordaOndulada(UC_LINHA, 1, ondaDeCorte(0.026, 3, 0.8, 0.017, 5, -1.6))

function volumeUndercut(u, th, az) {
  let s = 1.055
  s += 0.050 * gauss(th, 0.36, 0.34)                              // o arco penteado pra tras
  s += 0.018 * u                                                   // engrossa (nao afina) rumo a borda: e o labio do degrau
  s -= 0.026 * gauss(az, 0.30, 0.15) * smoothstep(0.0, 0.6, u)     // risca lateral — az COM SINAL, senao espelha
  return s
}

const UC_RASPADO = [
  [0.00, 0.148 * S],
  [0.40, 0.140 * S],
  [0.80, 0.110 * S],
  [1.20, 0.045 * S],
  [1.60, -0.005 * S],
  [2.00, -0.030 * S],
  [Math.PI, -0.055 * S],
]
const bordaUcRaspado = bordaOndulada(UC_RASPADO, 1, ondaDeCorte(0.012, 4, 0.2, 0.008, 7, 1.0))

// ===========================================================================
// 4. PERM COREANO
//
// "silhueta arredondada e alta" — o unico requisito deste arquivo que pede
// pra SAIR do contorno do cranio por CIMA de verdade, tanto quanto o topete de
// cabelo-extra.js. +0.150 de gauss no meio do campo (contra +0.03/+0.065 dos
// cortes sociais) poe o pico bem mais alto que qualquer outro corte daqui.
// Por cima da massa redonda, duas senoides CRUZADAS (uma em az+theta, outra em
// az-theta — nao paralelas) fazem uma ondulacao que nao repete direcao em
// nenhum lugar da cupula: e o "cacho" visto de longe. De perto, cachosPerm()
// pranta fios curtos com curvatura ALTA (1.1 a 1.9 rad) — um fio de barba
// normal curva ~0.3; aqui a curva alta e o proprio cacho.
// ===========================================================================
const PC_LINHA = [
  [0.00, 0.133 * S],  // franja cheia: no teto do piso, igual ao french crop
  [0.35, 0.132 * S],
  [0.65, 0.128 * S],
  [0.95, 0.100 * S],  // tempora — cobre mais lateral que os cortes curtos, o perm nao e raspado
  [1.30, 0.045 * S],
  [1.65, 0.055 * S],
  [2.30, -0.010 * S],
  [Math.PI, -0.040 * S],
]
const bordaPerm = bordaOndulada(PC_LINHA, 1, ondaDeCorte(0.020, 3, -0.4, 0.013, 5, 2.0))

function volumePerm(u, th, az) {
  let s = 1.06
  s += 0.150 * gauss(th, 0.34, 0.42)                                                        // a massa ALTA E REDONDA
  s += 0.028 * Math.sin(az * 5 + th * 9) * smoothstep(0.15, 0.55, u) * (1 - smoothstep(0.85, 1.0, u))  // ondulacao 1
  s += 0.018 * Math.sin(az * 8 - th * 13 + 1.7) * smoothstep(0.10, 0.5, u)                    // ondulacao 2, cruzada
  s += 0.024 * gauss(az, 0, 0.62) * smoothstep(0.80, 1.0, u)                                  // reforco da franja cheia
  return 1.006 + (s - 1.006) * smoothstep(1.0, 0.90, u)
}

function cachosPerm(cor) {
  const ma = tecelagem()
  const r = rng(74501)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 54
  for (let i = 0; i < N; i++) {
    const az = -0.95 + ((i + r() * 0.7) / N) * 1.90
    const th = bordaPerm(az) - (0.015 + r() * 0.05)
    eggSurface(th, az, 1.02, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y -= 0.35 + r() * 0.35   // cai menos que uma franja lisa: o cacho enrola mais do que pende
    dir.x += (r() - 0.5) * 0.6
    dir.normalize()
    eixo.set(Math.cos(az), 0.3, -Math.sin(az))
    const comp = (0.009 + r() * 0.009) * S
    fio(ma, p, dir, comp, 0.0020 * S, eixo, 1.1 + r() * 0.8, 5, 3)   // curvatura ALTA: e o proprio cacho
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 2)))
}

// ===========================================================================
// 5. MULLET
//
// "a silhueta tem que descer atras" — o unico corte deste arquivo (e o unico
// dos 11 do jogo inteiro, contando cabelo.js e cabelo-extra.js) cuja silhueta
// sai do contorno da cabeca por BAIXO, passando do proprio pescoco. Atras,
// cinco mechas em loft() (a mesma tecnica da mecha do coque em
// cabelo-extra.js, so que 5 vezes maior e com queda em ease-out em vez de
// reta) nascem por dentro da casca da nuca e caem 15 a 20 cm — quase metade
// da altura da cabeca — antes de afinar na ponta. Essa parte foi medida e
// bateu (a cauda passa 6,3 cm abaixo do queixo).
//
// CONSERTO (a foto do provador mostrou careca de frente: a cauda so aparece
// de perfil, e mullet e "curto na frente", nao "ausente na frente"): a
// frente/lateral usava `scalp()` com um `s` CONSTANTE de 1.026 — sem campo de
// volume nenhum, so uma casca uniforme fina (~4,7 mm de pele pra fora). Igual
// ao french crop e a cortina, isso e fino demais pra separar de pele no
// enquadramento de frente do card. Trocado por cascaCampo() (a mesma
// ferramenta dos outros seis cortes deste arquivo) com um campo modesto —
// mais espesso que antes, mas sem nenhum acidente de destaque, porque aqui o
// CONTRASTE com a cauda e o ponto, nao o volume da frente.
// ===========================================================================
const ML_LINHA = [
  [0.00, 0.150 * S],
  [0.34, 0.148 * S],
  [0.66, 0.132 * S],
  [0.95, 0.088 * S],
  [1.28, 0.025 * S],
  [1.62, 0.036 * S],
  [2.10, -0.020 * S],
  [Math.PI, -0.075 * S],   // nuca um pouco mais cheia que os outros cortes curtos: a base de onde a cauda nasce
]
const bordaMullet = bordaOndulada(ML_LINHA, 1, ondaDeCorte(0.016, 3, 0.3, 0.010, 5, -0.9))

function volumeMulletBase(u, th, az) {
  // SEGUNDO CONSERTO, mesma causa do french crop e da cortina: baseline 1.032
  // + bump 0.014 ainda somem de frente. Subiu pra ordem de grandeza do
  // undercut (baseline ~1.05 + termo largo ~0.040), o unico corte "cheio"
  // deste arquivo que apareceu bem de primeira.
  // TERCEIRO AJUSTE (feito na revisao da grade): mais 3.5% de casca por cima.
  // A calibragem pelo undercut acertou a ORDEM de grandeza, mas o que o card
  // do customizador mostra e a SILHUETA contra o fundo — e o que faz o cabelo
  // existir de frente e o quanto de coroa escura sobra ACIMA do contorno do
  // cranio, nao a espessura media do campo. 3.5% do raio da cabeca sao uns
  // 6 mm de coroa, que e a diferenca entre "corte curto" e "careca" nesse
  // tamanho de miniatura.
  let s = 1.085
  s += 0.040 * gauss(th, 0.32, 0.38)
  return s
}

/**
 * Azimute NA NUCA a partir de um deslocamento pequeno `d` (~-0.5..0.5).
 *
 * "az 0 = frente, +/-PI = nuca" (CONTRATO.md secao 4). Um deslocamento em
 * volta de PI nao pode ser escrito como `Math.PI + d` puro: pra d positivo
 * isso ULTRAPASSA PI e cai fora do intervalo que byAz (portanto bordaMullet)
 * entende — os pontos com az > PI ficam clampados no mesmo valor de az = PI,
 * perdendo a metade do leque. azNuca dobra pro outro lado do circulo (-PI-d)
 * quando d e positivo o bastante pra estourar, o que devolve o mesmo ponto
 * fisico (az e -az+2PI sao o mesmo angulo) sem nunca sair de [-PI, PI].
 */
function azNuca(d) { return d >= 0 ? Math.PI - d : -Math.PI - d }

function caudaMullet(azCentro, comprimento, largura, r) {
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  const thRaiz = bordaMullet(azCentro) * 0.94   // nasce um pouco DENTRO da casca, nao na propria borda
  eggSurface(thRaiz, azCentro, 1.03, p)
  eggNormal(thRaiz, azCentro, n)
  const secoes = []
  const M = 9
  for (let i = 0; i <= M; i++) {
    const t = i / M
    const ease = t * t * (3 - 2 * t)                 // queda em ease-out: acelera saindo da nuca, suaviza na ponta
    const y = p.y - comprimento * ease
    // curva pra fora do pescoco conforme desce: escala o proprio n.z (que na
    // nuca ja aponta pra tras, -Z) em vez de somar um offset com sinal
    // proprio — dois sinais competindo aqui e o motivo de ela ter puxado a
    // cauda de volta PRA DENTRO da cabeca na primeira versao.
    const cz = p.z + n.z * (0.010 * S + comprimento * 0.22 * t * t)
    const rr = largura * (1 - 0.72 * t) + 0.0015 * S
    const cx = p.x + n.x * 0.006 * S * (1 - t) + (r() - 0.5) * 0.006 * S
    secoes.push((a, b) => [cx + a * rr, y, cz + b * rr * 0.62])   // achatada em Z: mecha, nao cabo
  }
  return loft(secoes, 10, true)
}

// ===========================================================================
// 6. CORTINA
//
// "repartido no meio, duas mechas caindo dos dois lados da testa" — um unico
// campo com dois termos simetricos: gauss(|az|-0.32) poe DOIS cumes (as
// mechas, um de cada lado), e uma gaussiana estreita centrada em az=0 CAVA um
// vale exatamente entre eles (a risca). E o inverso do truque de risca lateral
// dos cortes sociais (que usa az COM SINAL pra nao espelhar): aqui o espelho e
// o objetivo, entao |az| esta certo.
//
// CONSERTO (a foto do provador mostrou o corte SUMIDO, igual ao french crop):
// dois problemas, um de magnitude e um de LOGICA.
//
//   1. Magnitude: baseline 1.016 e bump de mecha 0.028 sao finos demais pra
//      separar de pele de longe — o mesmo defeito do french crop original.
//      baseline subiu pra 1.030 e o bump da mecha pra 0.080.
//
//   2. Logica, mais grave: a formula acabava em
//      `return 1.006 + (s - 1.006) * smoothstep(1.0, 0.85, u)`. smoothstep(1.0,
//      0.85, u) e um smoothstep DESCENDENTE (a<b nao vale aqui: 1.0 > 0.85),
//      entao ele vale 1 em u=0.85 e ZERO em u=1.0 — e u=1.0 e EXATAMENTE a
//      borda do loft, o lugar onde a ponta da mecha pendurada mora. A formula
//      inteira colapsava a ponta de volta pra quase-pele bem no unico ponto
//      que precisava aparecer. Removida: a borda agora fica com a espessura
//      cheia do campo, do jeito que undercut ja fazia por um motivo parecido
//      (comentario da secao 3).
//
// A propria LINHA do corte (CU_LINHA) tambem tinha um mergulho pretendido em
// az=0.38 (0.118*S) que NUNCA acontecia: esse azimute cai dentro do plato do
// PISO_Y (valido ate 0.55 rad, ver secao 1), entao o teto de seguranca sempre
// prendia a mecha na mesma altura do teto (0.133*S) — a mesma altura maxima
// que a franja do french crop usa. Isso NAO e um bug pra consertar (o piso e
// a regra que impede cabelo de comer sobrancelha, ela fica): e o motivo de a
// mecha nao poder descer mais fundo que a franja, e por isso quem faz a
// silhueta das "duas mechas" aparecer e a ESPESSURA do campo, nao um mergulho
// extra na borda.
// ===========================================================================
const CU_LINHA = [
  [0.00, 0.152 * S],  // bem no centro: o gap da risca, mais curto que os lados
  [0.18, 0.140 * S],
  [0.38, 0.118 * S],  // pedido de mergulho — na pratica preso no teto do piso, ver nota acima
  [0.62, 0.128 * S],  // sobe de novo antes da tempora — a mecha nao e a cabeca inteira
  [0.90, 0.100 * S],
  [1.25, 0.040 * S],
  [1.60, 0.050 * S],
  [2.30, -0.020 * S],
  [Math.PI, -0.055 * S],
]
const bordaCortina = bordaOndulada(CU_LINHA, 1, ondaDeCorte(0.014, 3, 0.9, 0.009, 5, -0.5))

function volumeCortina(u, th, az) {
  // SEGUNDO CONSERTO, mesma causa do french crop (ver o comentario la):
  // baseline e termo largo pequenos demais faziam o campo INTEIRO ficar fino,
  // e o bump da mecha (por mais que grande) nao segurava sozinho — a mesma
  // conta do undercut (o corte "cheio" que funciona) pede algo perto de
  // 1.07-1.10 no grosso do campo, nao 1.03-1.05.
  // TERCEIRO AJUSTE (feito na revisao da grade): mais 3.5% de casca por cima.
  // A calibragem pelo undercut acertou a ORDEM de grandeza, mas o que o card
  // do customizador mostra e a SILHUETA contra o fundo — e o que faz o cabelo
  // existir de frente e o quanto de coroa escura sobra ACIMA do contorno do
  // cranio, nao a espessura media do campo. 3.5% do raio da cabeca sao uns
  // 6 mm de coroa, que e a diferenca entre "corte curto" e "careca" nesse
  // tamanho de miniatura.
  let s = 1.083
  s += 0.042 * gauss(th, 0.32, 0.38)                                            // massa cobrindo quase todo o campo
  s += 0.055 * gauss(Math.abs(az) - 0.32, 0, 0.20) * smoothstep(0.15, 1.0, u)    // as DUAS mechas — reforco extra
  s -= 0.030 * gauss(az, 0, 0.11) * smoothstep(0.05, 1.0, u)                     // a RISCA, centrada de proposito
  return s
}

// ===========================================================================
// 7. ESCOVINHA
//
// "bem curto e uniforme, com a linha do cabelo reta e alta" — o corte mais
// perto de virar so mais um raspado, entao precisa de UM traco que nenhum
// outro corte curto tem: achatarTopo() nivela os vertices do polo, e o cranio
// (que ate aqui era sempre um ovo, maior ou menor) ganha uma mesa plana no
// alto — o "flat top" que separa escovinha de um buzz cut qualquer. Por cima,
// ~130 fios curtos e RIJOS (curvatura baixa, quase retos, apontando quase reto
// pra cima) fazem o nome funcionar de verdade: escovinha e "escova pequena".
// ===========================================================================
const ES_LINHA = [
  [0.00, 0.150 * S],
  [0.40, 0.148 * S],
  [0.80, 0.140 * S],
  [1.10, 0.120 * S],
  [1.45, 0.070 * S],
  [1.80, 0.075 * S],
  [2.30, 0.040 * S],
  [Math.PI, 0.010 * S],
]
const bordaEscovinha = bordaOndulada(ES_LINHA, 1, ondaDeCorte(0.008, 4, 0.3, 0.005, 7, 1.2))

function volumeEscovinha(u, th, az) {
  return 1.010 + 0.006 * smoothstep(0.0, 0.5, u) * (1 - smoothstep(0.7, 1.0, u))
}

function escovaFios(cor) {
  const ma = tecelagem()
  const r = rng(77001)
  const eixo = new THREE.Vector3(1, 0, 0)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 130
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N
    const bruto = i * 2.399963   // mesmo angulo de ouro dobrado do tufosCropTex/arrepiado
    const az = bruto - Math.PI * 2 * Math.floor((bruto + Math.PI) / (Math.PI * 2))
    const th = 0.08 + Math.sqrt(t) * 0.60
    eggSurface(th, az, 1.014, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y += 1.1                          // quase reto pra cima: e o que da rigidez de escova
    dir.x += (r() - 0.5) * 0.15
    dir.z += (r() - 0.5) * 0.15
    dir.normalize()
    const comp = (0.0035 + r() * 0.0025) * S
    fio(ma, p, dir, comp, 0.0011 * S, eixo, (r() - 0.5) * 0.3, 3, 3)   // curvatura baixa: fio RIJO, nao caido
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 0)))
}

// ===========================================================================
// 8. TRANCINHAS
//
// "5 a 7 cordoes colados no cranio indo da testa pra nuca" — o unico corte
// deste arquivo (e do jogo) que e RELEVO LINEAR em vez de casca ou fio solto.
// baseTrancinhas() e uma casca fina cor de couro cabeludo (o mesmo blend
// pele+cabelo do raspado de cabelo.js — entre as tranças o que se ve e couro
// cabeludo raspado curto, nao cabelo cheio). Por cima, sete cordaoNaPele()
// que saem da linha do cabelo e passam por CIMA da coroa ate a nuca.
//
// CONSERTO (a foto do provador mostrou os cordoes atravessando o rosto,
// cruzando sobrancelha, olho e boca): a primeira versao chamava
// cordaoNaPele() com um UNICO az e so THETA crescendo de th0 a th1. Isso nao
// e "testa ate nuca por cima" — e "testa ate queixo, sempre no mesmo
// meridiano", porque nesta parametrizacao (theta = do topo pro queixo, az =
// volta em torno do eixo vertical) um az fixo com theta crescendo desce pela
// FRENTE (ou lateral, ou fundo — o que o az escolhido apontar) ate o polo de
// BAIXO, nunca visita o lado de tras. caminhoCordao() abaixo faz o cordao de
// verdade: theta CAI ate perto da coroa (o "por cima") e depois SOBE de novo
// do outro lado, com az variando de azFrente ate azNuca(azFrente) — a mesma
// funcao de dobra que o mullet usa (secao 5), porque e o mesmo problema: um
// deslocamento pequeno em volta de "reto atras" nao pode ser escrito como
// `Math.PI + d` sem estourar o intervalo que byAz entende.
// ===========================================================================
const TR_LINHA = [
  [0.00, 0.150 * S],
  [0.34, 0.148 * S],
  [0.66, 0.130 * S],
  [0.95, 0.085 * S],
  [1.28, 0.022 * S],
  [1.62, 0.032 * S],
  [2.20, -0.020 * S],
  [Math.PI, -0.050 * S],
]
const bordaTrancinhas = bordaOndulada(TR_LINHA, 1, ondaDeCorte(0.010, 4, 0.6, 0.006, 6, -0.8))
const TR_NUCA = -0.048 * S
const TR_TOPO = 0.12          // o quao perto da coroa cada cordao passa por cima
const TR_AZS = [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66]

/**
 * Caminho (theta, az) de um cordao: sobe da linha do cabelo ATE PERTO DA
 * COROA (t 0..0.5, theta caindo) e desce ate a nuca DO OUTRO LADO DO POLO
 * (t 0.5..1, theta subindo de novo), com az acompanhando de azFrente ate
 * azNuca(azFrente) o tempo todo — nao um salto no meio, uma rampa suave, que
 * e o que faz o cordao parecer uma trança e nao dois canudos emendados.
 */
function caminhoCordao(azFrente, thFrente, thNuca) {
  const azTras = azNuca(azFrente)
  return (t) => ({
    theta: t <= 0.5
      ? thFrente + (TR_TOPO - thFrente) * smoothstep(0, 0.5, t)
      : TR_TOPO + (thNuca - TR_TOPO) * smoothstep(0.5, 1, t),
    az: azFrente + (azTras - azFrente) * smoothstep(0, 1, t),
  })
}

function cordoesTrancinhas(cor) {
  const ma = tecelagem()
  const thNuca = thetaNaAltura(TR_NUCA)
  for (const azFrente of TR_AZS) {
    const thFrente = bordaTrancinhas(azFrente) * 0.90   // raiz um pouco dentro da linha do cabelo, cobrindo a base
    cordaoNaPele(ma, caminhoCordao(azFrente, thFrente, thNuca), 0.0030 * S, 22, 6)
  }
  return sh(new THREE.Mesh(ma.geo(), hairMat(cor)))
}

// ===========================================================================

export const CABELOS_CORTE = [
  {
    id: 'french-crop',
    nome: 'French crop',
    name: 'French crop',
    metodo: 'campo unico quase raso (curto nas laterais) com um bloco que engrossa perto da borda so na frente — a franja reta, encostada no teto de seguranca',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      return cascaCampo(volumeFrenchCrop, bordaFrenchCrop, cor, 60, 14)
    },
  },

  {
    id: 'crop-texturizado',
    nome: 'Crop texturizado',
    name: 'Crop texturizado',
    metodo: 'casca fina + ~110 tufos (fio curto e grosso) em espiral no topo + ~22 fios de franja de comprimento irregular — a mesma silhueta do french crop, mas denteada',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeCropTex, bordaCropTex, cor, 56, 12))
      g.add(tufosCropTex(cor))
      g.add(franjaCropTex(cor))
      return g
    },
  },

  {
    id: 'undercut',
    nome: 'Undercut',
    name: 'Undercut',
    metodo: 'duas cascas separadas: raspado fino cor de pele cobrindo tudo, e um topo comprido penteado pra tras que so desce ate uma linha alta — o vao radial entre as duas E o degrau',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const pele = skinOf(ctx)
      const g = new THREE.Group()
      const tomRaspado = mixHex(pele, shade(cor, 0.88), 0.55)
      g.add(scalp(tomRaspado, bordaUcRaspado, { s: 1.008, thetaMax: 2.35, wSeg: 40, hSeg: 22 }))
      g.add(cascaCampo(volumeUndercut, bordaUndercut, cor, 60, 14))
      return g
    },
  },

  {
    id: 'perm-coreano',
    nome: 'Perm coreano',
    name: 'Perm coreano',
    metodo: 'campo bem inflado no meio (cupula alta e redonda) + duas senoides cruzadas de ondulacao pro cacho + ~54 fios de curvatura alta na franja',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumePerm, bordaPerm, cor, 68, 16))
      g.add(cachosPerm(cor))
      return g
    },
  },

  {
    id: 'mullet',
    nome: 'Mullet',
    name: 'Mullet',
    metodo: 'casca curta comum na frente/lateral + 5 mechas em loft de secoes circulares nascendo na nuca e caindo bem abaixo do pescoco, com fios soltos entre elas',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletBase, bordaMullet, cor, 52, 13))

      const r = rng(76001)
      const deslocamentos = [-0.42, -0.21, 0, 0.21, 0.42]
      for (const d of deslocamentos) {
        const az = azNuca(d)
        const jitter = 1 + (r() - 0.5) * 0.30
        const geo = caudaMullet(az, (0.150 + r() * 0.045) * S * jitter, (0.016 + r() * 0.006) * S, r)
        g.add(sh(new THREE.Mesh(geo, hairMat(cor))))
      }

      const ma = tecelagem()
      const eixo = new THREE.Vector3()
      const p = new THREE.Vector3(), n = new THREE.Vector3()
      for (let i = 0; i < 16; i++) {
        const az = azNuca(-0.5 + r() * 1.0)
        const th = bordaMullet(az) * (0.90 + r() * 0.08)
        eggSurface(th, az, 1.03, p)
        eggNormal(th, az, n)
        const dir = n.clone()
        dir.y -= 1.1 + r() * 0.4
        dir.x += (r() - 0.5) * 0.3
        dir.normalize()
        eixo.set(Math.cos(az), 0, -Math.sin(az))
        const comp = (0.11 + r() * 0.09) * S
        fio(ma, p, dir, comp, 0.0022 * S, eixo, (r() - 0.5) * 0.5, 5, 3)
      }
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'cortina',
    nome: 'Cortina',
    name: 'Cortina',
    metodo: 'campo com vale estreito exatamente no centro (a risca) e dois cumes deslocados pros lados (as mechas), reforcado pela propria linha do corte subindo-descendo-subindo',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      return cascaCampo(volumeCortina, bordaCortina, cor, 66, 15)
    },
  },

  {
    id: 'escovinha',
    nome: 'Escovinha',
    name: 'Escovinha',
    metodo: 'casca curta uniforme com o topo ACHATADO num pos-processo que nivela os vertices do polo, mais ~130 fios curtos e rijos em pe cobrindo a mesa',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()

      const mesh = cascaCampo(volumeEscovinha, bordaEscovinha, cor, 54, 12)
      const topoP = new THREE.Vector3()
      eggSurface(0, 0, volumeEscovinha(0, 0, 0), topoP)
      achatarTopo(mesh, topoP.y - 0.011 * S, 0.050 * S)
      g.add(mesh)
      g.add(escovaFios(cor))
      return g
    },
  },

  {
    id: 'trancinhas',
    nome: 'Trancinhas',
    name: 'Trancinhas',
    metodo: 'casca fina cor de couro cabeludo + 7 cordoes-tubo em relevo (tecelagem seguindo o meridiano da propria pele) correndo em az constante da testa a nuca',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const pele = skinOf(ctx)
      const g = new THREE.Group()
      const tomBase = mixHex(pele, shade(cor, 0.92), 0.62)
      g.add(scalp(tomBase, bordaTrancinhas, { s: 1.010, thetaMax: 2.35, wSeg: 42, hSeg: 22 }))
      g.add(cordoesTrancinhas(cor))
      return g
    },
  },
]

export default CABELOS_CORTE
