import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD, HEAD_S, activeHead, clamp, eggSurface, extrudeOpts,
  faceSpread, fio, gauss, hairColorFrom, mix, peloMat, pontoNaPele, rng, sh,
  shade, smoothstep, tecelagem, useHead, wrapToHead,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/sobrancelha-extra.js — SEIS SOBRANCELHAS NOVAS.
//
// O pedido do dono: "as 3 ficaram boas, entao so adicione diferentes tipos e
// formatos e diferentes tipos de cabelos com finos mais grossos etc". Ou
// seja: nao e um quarto METODO — e o mesmo par de tecnicas que sobrancelha.js
// ja usa, com seis tabelas de numero novas que variam DUAS coisas ao mesmo
// tempo:
//
//   FORMATO     reta, arqueada, caida nas pontas, grossa e curta, fina e
//               longa, quebrada (com falha no meio)
//   ESPESSURA   fio fino e ralo <-> fio grosso e cheio
//
// sobrancelha.js nao exporta a maquina interna (linhaCentral, formaBarra,
// plantarFios etc. sao privados do modulo) — mesma situacao de olho-extra.js
// com olho-cartoon.js, e o mesmo padrao que boca-extra.js/cabelo-extra.js ja
// seguem: um catalogo "-extra" e AUTOSSUFICIENTE, so importa de nucleo.js.
// Por isso as pecas centrais (BROW_Y/BROW_CX/BROW_LEN, thetaDeY, azDeX,
// espalhamento, a barra extrudada do metodo A, o fio-a-fio do metodo B) sao
// reconstruidas aqui, com os MESMOS numeros de ancoragem — mudar BROW_Y, por
// exemplo, reabriria a conta inteira que o cabecalho de sobrancelha.js
// resolveu (a sobrancelha atravessando o olho nao e gosto, e geometria).
//
// So DUAS das tres tecnicas do arquivo base sao reusadas aqui:
//
//   BANDA     (= metodo A de sobrancelha.js, sem a crista) pros itens sem fio
//             visivel. A espessura muda pelo parametro `esp` da barra.
//   FIO A FIO (= metodo B) pros itens com fio visivel — pelo menos 3, como o
//             CONTRATO pede. A espessura muda por `fios`/`raio`/`alt`/`comp`.
//
// A casca-desfiada (metodo C) fica de fora: e a mais cara das tres e o pedido
// foi por VARIEDADE DE FORMATO, nao por um quarto jeito de desenhar volume.
// ---------------------------------------------------------------------------

const S = HEAD_S

// Mesmos valores de sobrancelha.js — o cabecalho de la tem a conta inteira de
// por que BROW_Y e exatamente 0.098 * S (o piso pra nao atravessar o olho de
// desenho) e por que BROW_CX/BROW_LEN sao esses. Reusar os numeros, nao so a
// formula, e o que garante que estas seis pousem no mesmo lugar que as tres.
const BROW_Y = 0.098 * S
const BROW_CX = 0.054 * S
const BROW_LEN = 0.074 * S

// ---------------------------------------------------------------------------
// GEOMETRIA DA SUPERFICIE — copiadas de sobrancelha.js sem mudanca de formula.
// ---------------------------------------------------------------------------

/** Theta (0 = topo do cranio) pra uma altura y — inversa de eggSurface em y. */
function thetaDeY(y) {
  const sp = activeHead()
  return Math.acos(clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1))
}

/** Azimute que poe eggSurface(theta, az).x no x pedido (bisseccao, 16 passos). */
const _pb = new THREE.Vector3()
function azDeX(theta, x) {
  const xMax = eggSurface(theta, Math.PI / 2, 1, _pb).x * 0.985
  const alvo = Math.min(Math.abs(x), xMax)
  let lo = 0, hi = Math.PI / 2
  for (let k = 0; k < 16; k++) {
    const m = (lo + hi) * 0.5
    if (eggSurface(theta, m, 1, _pb).x < alvo) lo = m
    else hi = m
  }
  const az = (lo + hi) * 0.5
  return x < 0 ? -az : az
}

/** Espalhamento final: faceSpread() com teto medido na altura da sobrancelha. */
function espalhamento(len) {
  const bruto = faceSpread()
  const xMax = eggSurface(thetaDeY(BROW_Y), Math.PI / 2, 1, _pb).x
  const cauda = bruto * (BROW_CX + len * 0.5)
  const limite = xMax * 0.76
  if (cauda <= limite) return bruto
  return bruto * Math.max(0.72, limite / cauda)
}

// ---------------------------------------------------------------------------
// LINHA CENTRAL — duas versoes. A padrao (pico deslocado, cauda caindo) serve
// reta/arqueada/grossa-curta/fina-longa/quebrada; a segunda e so pro item
// "caida nas pontas", que precisa da CABECA caindo tambem, nao so a cauda.
// Cada cfg escolhe a sua em `cfg.curvaFn` — banda e fio-a-fio chamam a mesma
// funcao vinda do cfg, entao as duas tecnicas aceitam qualquer uma das duas.
// ---------------------------------------------------------------------------

const _c = { x: 0, y: 0 }

/** Padrao: pico deslocado pra u~0.60, cauda cai no ultimo terco. */
function linhaCentral(u, sgn, spread, cfg) {
  _c.x = sgn * spread * (BROW_CX + (u - 0.5) * cfg.len)
  _c.y = BROW_Y
    + cfg.arco * Math.sin(Math.PI * Math.pow(u, 1.35))
    - cfg.queda * smoothstep(0.5, 1, u)
  return _c
}

/**
 * "Caida nas pontas": as DUAS pontas ficam abaixo de BROW_Y, e o pico fica
 * exatamente no meio (seno simples, sem o deslocamento de potencia da outra).
 * Da a leitura de sobrancelha preocupada/triste que a versao padrao nao da —
 * naquela so a cauda cai, a cabeca fica presa em BROW_Y.
 */
function linhaCentralCaida(u, sgn, spread, cfg) {
  _c.x = sgn * spread * (BROW_CX + (u - 0.5) * cfg.len)
  _c.y = BROW_Y - cfg.queda + (cfg.arco + cfg.queda) * Math.sin(Math.PI * u)
  return _c
}

// ---------------------------------------------------------------------------
// COR E POLITICA DE SOMBRA — mesmas regras de sobrancelha.js.
// ---------------------------------------------------------------------------

/** Cor: cabelo escurecido em 8% (ver sobrancelha.js pro porque do numero). */
function corSobrancelha(ctx) { return shade(hairColorFrom(ctx), 0.92) }

/** castShadow false (tubo fino nao cabe num texel do shadow map), receiveShadow true. */
function pelo(m) { m.castShadow = false; m.receiveShadow = true; return m }

/** Grupo com os dois lados — a UI e o encaixe do chapeu esperam UM objeto. */
function doisLados(make) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) {
    const o = make(sgn)
    if (o) g.add(o)
  }
  return g
}

// ===========================================================================
// TECNICA A — BANDA EXTRUDADA, TORCIDA, PROJETADA NA PELE
// (= metodo A de sobrancelha.js, sem a crista clara — so o tom base)
// ===========================================================================

/**
 * Perfil de espessura ao longo de u (identico a sobrancelha.js): grosso logo
 * depois da cabeca, fino na cauda. O piso de 0.22 nao e estetica, e de malha
 * — abaixo disso o bisel inverte a ponta (ver o cabecalho do arquivo base).
 */
function perfilA(u) {
  const cheio = (0.30 + 0.78 * gauss(u, 0.18, 0.40)) * (1 - 0.80 * smoothstep(0.52, 1, u))
  return cheio < 0.22 ? 0.22 : cheio
}

/** Quanto da espessura vai pra CIMA da linha central, em u. */
function partirA(u) { return mix(0.34, 0.66, smoothstep(0.05, 0.62, u)) }

/** As duas pontas do contorno, em meia-elipse — evita a quina reta da versao antiga. */
function capa(a, b, dirX, k = 5) {
  const mx = (a[0] + b[0]) * 0.5, my = (a[1] + b[1]) * 0.5
  const ry = (b[1] - a[1]) * 0.5
  const rx = Math.abs(ry) * 0.75
  const out = []
  for (let i = 1; i < k; i++) {
    const ang = -Math.PI / 2 + Math.PI * (i / k)
    out.push([mx + dirX * rx * Math.cos(ang), my + ry * Math.sin(ang)])
  }
  return out
}

/** Fecha o Shape a partir das bordas de baixo/cima, com um arco em cada ponta. */
function fecharContorno(baixo, cima, sgn) {
  const n = baixo.length - 1
  const pts = []
  for (let i = 0; i <= n; i++) pts.push(baixo[i])
  for (const p of capa(baixo[n], cima[n], sgn)) pts.push(p)
  for (let i = n; i >= 0; i--) pts.push(cima[i])
  for (const p of capa(cima[0], baixo[0], -sgn)) pts.push(p)
  if (sgn < 0) pts.reverse()
  const forma = new THREE.Shape()
  forma.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) forma.lineTo(pts[i][0], pts[i][1])
  forma.closePath()
  return forma
}

/** O poligono da barra: 34%/66% da altura pra cima conforme u (cabeca pende, arco sobe). */
function formaBarra(sgn, spread, cfg) {
  const n = 22
  const baixo = [], cima = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const c = cfg.curvaFn(u, sgn, spread, cfg)
    const e = perfilA(u) * cfg.esp
    const pCima = partirA(u)
    baixo.push([c.x, c.y - e * (1 - pCima)])
    cima.push([c.x, c.y + e * pCima])
  }
  return fecharContorno(baixo, cima, sgn)
}

/** Torcao em volta do eixo longo, aplicada ANTES de wrapToHead (ver sobrancelha.js). */
function torcerBarra(geo, sgn, spread, cfg) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const u = clamp(((sgn * x) / spread - BROW_CX) / cfg.len + 0.5, 0, 1)
    const c = cfg.curvaFn(u, sgn, spread, cfg)
    const a = cfg.torcao * smoothstep(0.12, 1, u)
    const dy = y - c.y, co = Math.cos(a), si = Math.sin(a)
    pos.setXYZ(i, x, c.y + dy * co - z * si, dy * si + z * co)
  }
  pos.needsUpdate = true
  return geo
}

function buildBanda(ctx, cfg) {
  useHead(ctx)
  const spread = espalhamento(cfg.len)
  const mat = solid(corSobrancelha(ctx), 0.94, 0.0)
  return doisLados((sgn) => {
    const geo = new THREE.ExtrudeGeometry(
      formaBarra(sgn, spread, cfg),
      extrudeOpts(cfg.prof, cfg.bisel, 4),
    )
    torcerBarra(geo, sgn, spread, cfg)
    wrapToHead(geo, cfg.pad)
    return sh(new THREE.Mesh(geo, mat))
  })
}

// ===========================================================================
// TECNICA B — FIO A FIO
// (= metodo B de sobrancelha.js; ganhou o parametro `falha` pro item quebrado)
// ===========================================================================

/** Meia-altura da faixa de plantio: cheia na cabeca, quase nula na cauda. */
function perfilB(u) {
  return (0.42 + 0.70 * gauss(u, 0.26, 0.48)) * (1 - 0.66 * smoothstep(0.58, 1, u))
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _up = new THREE.Vector3()
const _lado = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)

/**
 * Planta os fios de UM lado. Identico a sobrancelha.js, com um adendo:
 * `cfg.falha = [u0, u1]` pula o plantio nesse trecho — a QUEBRA da sobrancelha
 * quebrada. Nao e um fio escondido, e um fio que nunca nasce ali: o jeito mais
 * barato de fazer um vao sem mexer em mais nada do metodo.
 */
function plantarFios(mas, sgn, spread, cfg, rnd) {
  for (let k = 0; k < cfg.fios; k++) {
    const u = Math.pow((k + rnd() * 0.92) / cfg.fios, 1.12)
    if (cfg.falha && u > cfg.falha[0] && u < cfg.falha[1]) continue
    const v = ((k * 0.6180339887) % 1) * 2 - 1 + (rnd() - 0.5) * 0.18

    const c = cfg.curvaFn(u, sgn, spread, cfg)
    const h = cfg.alt * perfilB(u)
    const y = c.y + v * h
    const th = thetaDeY(y)
    const az = azDeX(th, c.x)
    pontoNaPele(th, az, 0.0008, _p, _n)

    _up.copy(_Y).addScaledVector(_n, -_n.y).normalize()
    _lado.crossVectors(_up, _n).multiplyScalar(sgn)

    const subida = 1 - smoothstep(0.0, 0.42, u)
    const queda = smoothstep(0.46, 1.0, u)
    const a = subida - 0.62 * queda + 0.38 * v + (rnd() - 0.5) * 0.22
    const b = 0.18 + 0.92 * smoothstep(0.02, 0.5, u) + (rnd() - 0.5) * 0.20
    _dir.set(0, 0, 0)
      .addScaledVector(_up, a)
      .addScaledVector(_lado, b)
      .addScaledVector(_n, 0.40 + (rnd() - 0.5) * 0.12)
      .normalize()

    const rebelde = k % 9 === 4 ? 1.6 : 1
    const comp = cfg.comp * (0.72 + 0.5 * rnd()) * (0.62 + 0.55 * perfilB(u)) * rebelde
    const raio = cfg.raio * (0.8 + 0.45 * rnd())
    const curva = -sgn * cfg.curva * (0.7 + 0.6 * rnd())

    const r = rnd()
    const ma = mas[r < 0.34 ? 0 : r < 0.62 ? 1 : 2]
    fio(ma, _p, _dir, comp, raio, _n, curva, 5, 4)
  }
}

function buildFio(ctx, cfg, seedPos, seedNeg) {
  useHead(ctx)
  const spread = espalhamento(cfg.len)
  const cor = corSobrancelha(ctx)
  const mas = [tecelagem(), tecelagem(), tecelagem()]
  for (const sgn of [1, -1]) {
    plantarFios(mas, sgn, spread, cfg, rng(sgn > 0 ? seedPos : seedNeg))
  }
  const g = new THREE.Group()
  for (let i = 0; i < mas.length; i++) {
    if (mas[i].vazia) continue
    g.add(pelo(new THREE.Mesh(mas[i].geo(), peloMat(cor, i))))
  }
  return g
}

// ===========================================================================
// AS SEIS TABELAS — cada uma mexe em FORMATO (curvaFn/arco/queda/len/falha) e
// em ESPESSURA (esp da banda, ou fios/alt/raio/comp do fio) ao mesmo tempo.
// Os numeros nominais (arco 0.008*S, queda 0.007*S, esp 0.015*S, fios 78,
// alt 0.0062*S, raio 0.00112*S, comp 0.013*S) sao os de sobrancelha.js; cada
// tabela abaixo desvia deles pro lado que o nome do item promete.
// ===========================================================================

const CFG_RETA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 1.02,
  arco: 0.0018 * S,   // quase reto: um quinto do arco nominal
  queda: 0.0020 * S,
  fios: 46,           // rala: bem menos que os 78 nominais
  alt: 0.0048 * S,
  comp: 0.0100 * S,
  raio: 0.00082 * S,  // fio fino: 73% do raio nominal
  curva: 0.70,
}

const CFG_ARQUEADA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 0.92,
  arco: 0.0145 * S,   // quase o dobro do arco nominal: o pico mais alto das seis
  queda: 0.0075 * S,
  esp: 0.0195 * S,    // grossa: 30% mais que o pico nominal do metodo A
  prof: 0.0062 * S,
  pad: 0.0030 * S,
  bisel: 0.0007 * S,
  torcao: -0.30,
}

const CFG_CAIDA = {
  curvaFn: linhaCentralCaida,
  len: BROW_LEN * 0.98,
  arco: 0.0095 * S,
  queda: 0.0110 * S,  // as DUAS pontas caem — ver linhaCentralCaida
  fios: 84,           // cheia: mais que os 78 nominais
  alt: 0.0072 * S,
  comp: 0.0138 * S,
  raio: 0.00120 * S,  // fio grosso: o mais grosso das seis
  curva: 0.60,
}

const CFG_GROSSA_CURTA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 0.62,  // curta: 62% do comprimento nominal
  arco: 0.0100 * S,
  queda: 0.0060 * S,
  esp: 0.0210 * S,        // a secao mais grossa das seis
  prof: 0.0066 * S,
  pad: 0.0032 * S,
  bisel: 0.0008 * S,
  torcao: -0.22,
}

const CFG_FINA_LONGA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 1.22,  // longa: 22% mais que o comprimento nominal
  arco: 0.0075 * S,
  queda: 0.0072 * S,
  esp: 0.0085 * S,        // a secao mais fina das seis (43% do pico nominal)
  prof: 0.0050 * S,
  pad: 0.0026 * S,
  bisel: 0.0005 * S,      // bisel proporcionalmente menor: barra fina precisa
                          // de menos contracao de borda pra nao inverter a
                          // ponta (ver o piso de perfilA no cabecalho)
  torcao: -0.36,
}

const CFG_QUEBRADA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 1.0,
  arco: 0.0085 * S,
  queda: 0.0078 * S,
  falha: [0.44, 0.60],    // o vao: nenhum fio nasce entre 44% e 60% do comprimento
  fios: 60,
  alt: 0.0058 * S,
  comp: 0.0112 * S,
  raio: 0.00090 * S,      // rala
  curva: 0.75,
}

// ---------------------------------------------------------------------------
// CATALOGO
// ---------------------------------------------------------------------------

export const SOBRANCELHAS_EXTRA = [
  {
    id: 'reta-rala', nome: 'Reta rala', name: 'Reta rala',
    metodo: 'fio a fio (mesma tecnica do catalogo base) com curva quase reta e fios finos e espacados',
    build(ctx) { return buildFio(ctx, CFG_RETA, 0x1a2b, 0x3c4d) },
  },
  {
    id: 'arqueada-cheia', nome: 'Arqueada cheia', name: 'Arqueada cheia',
    metodo: 'banda extrudada e torcida (mesma tecnica do arco-cheio, sem a crista) com arco bem mais alto e secao mais grossa',
    build(ctx) { return buildBanda(ctx, CFG_ARQUEADA) },
  },
  {
    id: 'caida-cheia', nome: 'Caida nas pontas', name: 'Caida nas pontas',
    metodo: 'fio a fio com as duas pontas caindo abaixo da base (linha central propria, nao so a cauda) e fios grossos e densos',
    build(ctx) { return buildFio(ctx, CFG_CAIDA, 0x5e6f, 0x7081) },
  },
  {
    id: 'grossa-curta', nome: 'Grossa curta', name: 'Grossa curta',
    metodo: 'banda extrudada curta (62% do comprimento nominal) com a secao mais grossa das seis',
    build(ctx) { return buildBanda(ctx, CFG_GROSSA_CURTA) },
  },
  {
    id: 'fina-longa', nome: 'Fina longa', name: 'Fina longa',
    metodo: 'banda extrudada longa (122% do comprimento nominal) com a secao mais fina das seis',
    build(ctx) { return buildBanda(ctx, CFG_FINA_LONGA) },
  },
  {
    id: 'quebrada-falha', nome: 'Quebrada', name: 'Quebrada',
    metodo: 'fio a fio com um vao sem fio no meio do comprimento (falha) e fios finos e espacados',
    build(ctx) { return buildFio(ctx, CFG_QUEBRADA, 0x9213, 0xa314) },
  },
]

export default SOBRANCELHAS_EXTRA
