import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD, HEAD_S, activeHead, clamp, eggSurface, extrudeOpts,
  faceSpread, fio, gauss, hairColorFrom, mix, peloMat, pontoNaPele, rng, sh,
  shade, smoothstep, tecelagem, useHead, wrapToHead,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/sobrancelha-extra2.js — TRES SOBRANCELHAS NOVAS.
//
// O pedido do dono: "sobrancelha faca mais 3 diferentes". As nove que ja
// existem (sobrancelha.js + sobrancelha-extra.js) cobrem reta rala, arco
// cheio nominal, arqueada bem alta, caida nas duas pontas, curta e grossa,
// longa e fina, quebrada com falha, e a casca desfiada de volume. Estas tres
// tem que ser FORMATO ou ESPESSURA que ainda nao existe ali — nao mais um
// numero diferente na mesma curva.
//
// Igual sobrancelha-extra.js: nao importa a maquina interna de
// sobrancelha.js/sobrancelha-extra.js (nenhum dos dois exporta ela — so o
// catalogo final) e por isso este arquivo e AUTOSSUFICIENTE, so importa de
// nucleo.js. As pecas centrais (BROW_Y/BROW_CX/BROW_LEN, thetaDeY, azDeX,
// espalhamento, a barra extrudada da tecnica A, o fio-a-fio da tecnica B) sao
// reconstruidas aqui com os MESMOS numeros de ancoragem dos outros dois
// arquivos — mudar BROW_Y, por exemplo, reabriria a conta de por que ele e
// 0.098 * S (o piso pra nao atravessar o olho de desenho).
//
// So DUAS tecnicas, as mesmas que sobrancelha-extra.js reusa:
//
//   BANDA      (= metodo A de sobrancelha.js, sem a crista) pros itens sem
//              fio visivel. A espessura muda por `esp`.
//   FIO A FIO  (= metodo B) pro item com fio visivel, como o CONTRATO pede.
//
// A casca-desfiada (metodo C) continua de fora pelo mesmo motivo que
// sobrancelha-extra.js deu: e a mais cara das tres e o pedido e por
// VARIEDADE DE FORMATO, nao por um quarto jeito de desenhar volume.
//
// AS TRES NOVIDADES DE FORMATO, nenhuma nas outras nove:
//
//   pico-anguloso  a linha central e DUAS RETAS ate um vertice, nao uma curva
//                  suave — todas as outras nove (mesmo a arqueada) usam
//                  seno. E a diferenca entre "arco" e "angulo" de qualquer
//                  referencia de sobrancelha.
//   reta-grossa    quase sem curvatura (mais reta que a reta-rala) mas na
//                  secao mais GROSSA de toda a familia (maior que a
//                  grossa-curta) — as duas retas que ja existem sao finas.
//   cauda-alta     a linha central NUNCA cai. Sobe do inicio ao fim e termina
//                  bem acima de onde comecou — as outras nove sempre perdem
//                  altura na cauda (a caida perde nas duas pontas, a
//                  arqueada sobe e desce). Nenhuma so sobe.
// ---------------------------------------------------------------------------

const S = HEAD_S

// Mesmos valores dos outros dois arquivos — a conta de por que estes numeros
// sao estes esta no cabecalho de sobrancelha.js. Reusar o numero, e nao so a
// formula, e o que garante que estas tres pousam no mesmo lugar que as nove.
const BROW_Y = 0.098 * S
const BROW_CX = 0.054 * S
const BROW_LEN = 0.074 * S

// ---------------------------------------------------------------------------
// GEOMETRIA DA SUPERFICIE — copiadas sem mudanca de formula.
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
// LINHA CENTRAL — tres versoes. `linhaCentral` e a curva padrao (copiada,
// serve de referencia e da a base da reta-grossa). As outras duas sao os
// dois formatos novos deste arquivo.
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
 * ANGULOSA: sobe RETO ate o pico e desce RETO depois — duas retas num
 * vertice, e nao a curva suave de linhaCentral. E a diferenca entre "arco" e
 * "angulo" numa referencia de sobrancelha: a MESMA altura de pico le como
 * dois desenhos diferentes so pela suavidade (ou falta dela) da curva.
 * `cfg.picoU` poe o vertice a 52% do caminho, quase no meio — mais central
 * que o pico ~60% do seno, o que reforça a leitura geometrica.
 */
function linhaCentralAngular(u, sgn, spread, cfg) {
  _c.x = sgn * spread * (BROW_CX + (u - 0.5) * cfg.len)
  const p = cfg.picoU
  const subida = u < p
    ? cfg.arco * (u / p)
    : cfg.arco * Math.max(0, 1 - (u - p) / (1 - p))
  _c.y = BROW_Y + subida - cfg.queda * smoothstep(0.62, 1, u)
  return _c
}

/**
 * ASCENDENTE: nunca cai. As outras nove sobrancelhas do jogo sempre perdem
 * altura na cauda — ate a arqueada, que sobe e desce, cai no ultimo terco.
 * Esta so sobe: `arco` e o ganho ate 62% do caminho, `subeFinal` e o ganho
 * EXTRA so no ultimo terco (smoothstep de 0.55 a 1), que e o que separa "arco
 * deslocado pra fora" de "canto externo levantado" — a leitura de
 * determinacao/serio que uma arqueada normal nao da, porque ela ja esta
 * caindo bem antes do fim.
 */
function linhaCentralAscendente(u, sgn, spread, cfg) {
  _c.x = sgn * spread * (BROW_CX + (u - 0.5) * cfg.len)
  const base = cfg.arco * smoothstep(0.0, 0.62, u)
  const extra = cfg.subeFinal * smoothstep(0.55, 1.0, u)
  _c.y = BROW_Y + base + extra
  return _c
}

// ---------------------------------------------------------------------------
// COR E POLITICA DE SOMBRA — mesmas regras dos outros dois arquivos.
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
// (= metodo A de sobrancelha.js, sem a crista — so o tom base, igual
// sobrancelha-extra.js ja simplifica)
// ===========================================================================

/**
 * Perfil de espessura ao longo de u (identico aos outros dois arquivos):
 * grosso logo depois da cabeca, fino na cauda. O piso de 0.22 e de malha, nao
 * de estetica — abaixo disso o bisel inverte a ponta.
 */
function perfilA(u) {
  const cheio = (0.30 + 0.78 * gauss(u, 0.18, 0.40)) * (1 - 0.80 * smoothstep(0.52, 1, u))
  return cheio < 0.22 ? 0.22 : cheio
}

/** Quanto da espessura vai pra CIMA da linha central, em u. */
function partirA(u) { return mix(0.34, 0.66, smoothstep(0.05, 0.62, u)) }

/** As duas pontas do contorno, em meia-elipse — evita a quina reta. */
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

/** O poligono da barra: 34%/66% da altura pra cima conforme u. */
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

/** Torcao em volta do eixo longo, aplicada ANTES de wrapToHead. */
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
// TECNICA B — FIO A FIO (= metodo B de sobrancelha.js)
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
 * Planta os fios de UM lado. Identico aos outros dois arquivos — o racional
 * completo (por que a sequencia aurea em vez de random puro, por que o giro
 * em volta da normal resolve as tres regioes com um numero so) esta comentado
 * em detalhe em sobrancelha.js.
 */
function plantarFios(mas, sgn, spread, cfg, rnd) {
  for (let k = 0; k < cfg.fios; k++) {
    const u = Math.pow((k + rnd() * 0.92) / cfg.fios, 1.12)
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
// AS TRES TABELAS
// ===========================================================================

// PICO ANGULOSO — fio a fio (satisfaz o "pelo menos um com fio visivel" do
// CONTRATO), pico bem definido a 52% do caminho, fios de espessura media.
// O arco (0.0115 * S) fica dentro da faixa que a arqueada-cheia (0.0145 * S)
// e a reta-rala (0.0018 * S) ja usam — nao e um pico mais alto, e um pico
// GEOMETRICO em vez de curvo, o que muda sozinho.
const CFG_PICO_ANGULOSO = {
  curvaFn: linhaCentralAngular,
  picoU: 0.52,
  len: BROW_LEN * 1.00,
  arco: 0.0115 * S,
  queda: 0.0055 * S,
  fios: 70,
  alt: 0.0058 * S,
  comp: 0.0122 * S,
  raio: 0.00105 * S,
  curva: 0.80,
}

// RETA GROSSA — banda, quase sem curvatura (mais reta que a reta-rala, que
// tem arco 0.0018 * S contra 0.0010 * S aqui) e a secao mais GROSSA de toda a
// familia: 0.0230 * S contra os 0.0210 * S da grossa-curta, que era a
// recordista ate aqui. As duas retas que ja existiam (reta-rala e a base
// arco-cheio nao contam) eram sempre finas — esta e a versao grossa que
// faltava.
const CFG_RETA_GROSSA = {
  curvaFn: linhaCentral,
  len: BROW_LEN * 1.06,
  arco: 0.0010 * S,
  queda: 0.0012 * S,
  esp: 0.0230 * S,
  prof: 0.0070 * S,
  pad: 0.0034 * S,
  bisel: 0.0009 * S,
  torcao: -0.14,
}

// CAUDA ALTA — banda, linha central ascendente (nunca cai). `arco` sobe ate
// 62% do caminho e `subeFinal` da o ganho extra no ultimo terco: a cauda
// termina 0.0168 * S acima de BROW_Y, ordem de grandeza parecida com o pico
// da arqueada-cheia (0.0145 * S), so que aqui o ponto mais alto e a PONTA, e
// nao o meio — nenhuma das outras nove tem o pico no ultimo terco.
const CFG_CAUDA_ALTA = {
  curvaFn: linhaCentralAscendente,
  len: BROW_LEN * 1.04,
  arco: 0.0068 * S,
  subeFinal: 0.0100 * S,
  esp: 0.0125 * S,
  prof: 0.0058 * S,
  pad: 0.0028 * S,
  bisel: 0.0006 * S,
  torcao: -0.32,
}

// ---------------------------------------------------------------------------
// CATALOGO
// ---------------------------------------------------------------------------

export const SOBRANCELHAS_EXTRA2 = [
  {
    id: 'pico-anguloso', nome: 'Pico anguloso', name: 'Pico anguloso',
    metodo: 'fio a fio (mesma tecnica do catalogo base) com a linha central em duas retas ate um vertice em vez de curva suave — o formato anguloso que nenhuma das nove anteriores tem',
    build(ctx) { return buildFio(ctx, CFG_PICO_ANGULOSO, 0x4a17, 0x6b28) },
  },
  {
    id: 'reta-grossa', nome: 'Reta grossa', name: 'Reta grossa',
    metodo: 'banda extrudada e torcida (mesma tecnica do arco-cheio, sem a crista) quase sem curvatura e na secao mais grossa de toda a familia',
    build(ctx) { return buildBanda(ctx, CFG_RETA_GROSSA) },
  },
  {
    id: 'cauda-alta', nome: 'Cauda alta', name: 'Cauda alta',
    metodo: 'banda extrudada e torcida com a linha central sempre subindo (nunca cai) e terminando bem acima da cabeca da sobrancelha, ao contrario das nove anteriores',
    build(ctx) { return buildBanda(ctx, CFG_CAUDA_ALTA) },
  },
]

export default SOBRANCELHAS_EXTRA2
