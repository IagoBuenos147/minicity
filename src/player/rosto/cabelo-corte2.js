import * as THREE from 'three'
import {
  HEAD, HEAD_S, activeHead, useHead,
  eggSurface, eggNormal,
  scalp, hairMat, peloMat,
  hairColorFrom, skinOf, mixHex, shade,
  byAz, clamp, smoothstep, gauss, rng,
  sh, soldarNormais, tecelagem, fio,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/cabelo-corte2.js — O RESTANTE DO CARTAZ DE BARBEARIA.
//
// cabelo-corte.js trouxe os primeiros oito cortes do cartaz. Este arquivo traz
// os dez que faltavam: seis variacoes de MULLET (cortina, moderno, cacheado,
// curto, medio, ondulado), corte reto (flat top), cachos, twists e ondas.
//
// DUAS REGRAS DAQUELE ARQUIVO CUSTARAM RETRABALHO E VALEM AQUI DO MESMO JEITO:
//
//   a) O CARD DO CUSTOMIZADOR MOSTRA O BONECO DE FRENTE. Um corte medido certo
//      de PERFIL (rabo de mullet, risca da cortina) e invisivel de frente se a
//      casca por baixo for fina — foi o que aconteceu com french-crop, cortina
//      e mullet na primeira leva daquele arquivo, e o conserto dos tres foi o
//      MESMO: baseline do campo de volume subindo de ~1.01-1.03 pra ~1.08. Os
//      seis mullets deste arquivo (curtos na frente E na nuca, igual ao
//      original) usam baseline 1.08-1.085 no campo de topo/laterais por esse
//      motivo — nao e capricho, e o numero que ja funcionou. As quatro pecas
//      que nao sao mullet seguem a MESMA logica adaptada: corte-reto e cachos
//      tem campo de casca na mesma faixa (a casca sozinha precisa aparecer);
//      twists usa casca quase rasa porque ali quem sustenta a silhueta de
//      frente sao os proprios twists — a MESMA excecao que crop-texturizado ja
//      usava (casca fina + textura solida por cima, nunca casca fina sozinha).
//   b) MECHA/CORDAO SEGUE O COURO CABELUDO, NUNCA A FRENTE DO ROSTO. Toda
//      distribuicao de fio() sobre uma area (tufo, cacho, twist) neste arquivo
//      clampa o proprio theta pela LINHA DE CORTE daquele azimute
//      (`Math.min(lim, ...)`), nunca por uma constante fixa sozinha: uma
//      constante que serve pra franja alta de um corte pode ultrapassar a
//      linha de outro corte e plantar pelo em cima da testa. E o mesmo motivo,
//      adaptado, da regra que fez a trancinha cruzar o rosto em
//      cabelo-corte.js.
//
// O QUE E REUSADO de cabelo-corte.js (privado la, copiado aqui — mesmo caso de
// cabelo-extra.js copiando `loft` de cabelo.js): thetaNaAltura, azGeo, PISO_Y,
// ondaDeCorte, bordaOndulada, cascaCampo, loft, achatarTopo, azNuca. A tabela
// PISO_Y e IDENTICA de proposito: e seguranca anatomica (onde fica a
// sobrancelha), nao estilo de corte, e nao muda de arquivo pra arquivo.
//
// O QUE E NOVO neste arquivo:
//
//   espiralAz(i, N)   o angulo de ouro dobrado pra [-PI, PI] que
//                     tufosCropTex/escovaFios/arrepiado repetiam cada um do
//                     seu jeito, extraido uma vez so — usado nos tufos do
//                     moderno, nos cachos do cacheado, nos cachos do item 8 e
//                     nos twists do item 9.
//   caudaMullet()     generaliza a cauda do mullet original: agora recebe a
//                     propria linha de corte do chamador E um `onda` opcional
//                     (frequencia + amplitude de balanco lateral), pra servir
//                     os seis mullets com uma unica funcao em vez de
//                     reescrever o loft seis vezes.
//   fiosSoltosNuca()  generaliza o laco de fios soltos que o mullet original
//                     ja tinha, escrito uma vez so por conta propria — usado
//                     nos seis mullets, cada um com sua contagem e alcance.
//   parTorcido()      NOVO DE VERDADE: duas fibras que nascem quase juntas (um
//                     pequeno deslocamento tangencial) e curvam em direcoes
//                     OPOSTAS a partir do mesmo eixo — a leitura de "duas
//                     pontas torcidas" de um twist, sem ter que modelar a
//                     helice fio a fio. So usado nos twists.
// ---------------------------------------------------------------------------

const S = HEAD_S

// ---------------------------------------------------------------------------
// 1. A RECEITA DE cabelo-corte.js, REAPROVEITADA (nao reinventada — ver acima)
// ---------------------------------------------------------------------------

/** Inversa de yAt(): em que theta a casca de escala `s` cruza a altura `y`. */
function thetaNaAltura(y, s = 1) {
  const sp = activeHead()
  const uy = clamp((y / (s * HEAD.ry) + 1) / sp.yTop - 1, -1, 1)
  return Math.acos(uy)
}

const _g = new THREE.Vector3()
/** Azimute GEOMETRICO (atan2) do azimute PARAMETRICO `az` em `theta`. */
function azGeo(theta, az) {
  eggSurface(theta, az, 1, _g)
  return Math.atan2(_g.x, _g.z)
}

/** Teto de seguranca: tabela IDENTICA a de cabelo.js/cabelo-corte.js. */
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
 *  proprio desenho mas fecha sem degrau na nuca. */
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
// 2. cascaCampo — o metodo A de cabelo.js, generalizado (ver cabelo-corte.js)
// ---------------------------------------------------------------------------
function cascaCampo(volumeFn, bordaFn, cor, cols = 60, linhas = 14) {
  const pos = []
  const idx = []
  const p = new THREE.Vector3()

  eggSurface(0, 0, volumeFn(0, 0, 0), p)
  pos.push(p.x, p.y, p.z)

  for (let i = 0; i < cols; i++) {
    const az = -Math.PI + ((i + 0.5) / cols) * Math.PI * 2
    const lim = bordaFn(az)
    for (let j = 1; j <= linhas; j++) {
      const t = j / linhas
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
// 3. loft — a mesma ferramenta de aneis empilhados de cabelo-extra.js /
// cabelo-corte.js (usada la no topete/coque e na cauda do mullet).
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
// 4. achatarTopo — pos-processo que nivela o polo numa altura comum (o "flat
// top" da escovinha em cabelo-corte.js). Usado aqui pelo corte-reto.
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
// 5. FERRAMENTAS NOVAS DESTE ARQUIVO
// ---------------------------------------------------------------------------

/** Azimute NA NUCA a partir de um deslocamento pequeno `d` (~-0.5..0.5) —
 *  identico ao azNuca de cabelo-corte.js: dobra pro outro lado do circulo
 *  quando `d` estoura PI, senao metade do leque cai fora do intervalo que
 *  byAz entende (ver o comentario original la). */
function azNuca(d) { return d >= 0 ? Math.PI - d : -Math.PI - d }

/** Angulo de ouro, DOBRADO pra [-PI, PI] — o mesmo truque de
 *  tufosCropTex/escovaFios/arrepiado, extraido uma vez so. Sem a dobra,
 *  `i * 2.399963` estoura o intervalo que byAz entende e a distribuicao
 *  colapsa (ver os comentarios originais). */
function espiralAz(i, N) {
  const bruto = i * 2.399963
  return bruto - Math.PI * 2 * Math.floor((bruto + Math.PI) / (Math.PI * 2))
}

/**
 * Cauda de mullet generalizada: recebe a PROPRIA linha de corte do chamador
 * (`bordaFn`) em vez de uma fixa, e um `onda` opcional `{ freq, amp, fase }`
 * que baloca a cauda pro lado ao longo do comprimento — usado pelo cacheado
 * (freq alta, amp pequena: bounce de cacho) e pelo ondulado (freq baixa, amp
 * grande: onda larga). Sem `onda` a cauda cai reta, igual ao mullet original.
 */
function caudaMullet(bordaFn, azCentro, comprimento, largura, r, onda) {
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  const thRaiz = bordaFn(azCentro) * 0.94
  eggSurface(thRaiz, azCentro, 1.03, p)
  eggNormal(thRaiz, azCentro, n)
  const secoes = []
  const M = 9
  for (let i = 0; i <= M; i++) {
    const t = i / M
    const ease = t * t * (3 - 2 * t)
    const y = p.y - comprimento * ease
    const cz = p.z + n.z * (0.010 * S + comprimento * 0.22 * t * t)
    const sway = onda ? onda.amp * Math.sin(t * onda.freq + (onda.fase || 0)) : 0
    const rr = largura * (1 - 0.72 * t) + 0.0015 * S
    const cx = p.x + n.x * 0.006 * S * (1 - t) + sway + (r() - 0.5) * 0.006 * S
    secoes.push((a, b) => [cx + a * rr, y, cz + b * rr * 0.62])
  }
  return loft(secoes, 10, true)
}

/** Fios soltos perto da(s) cauda(s), pra nuca nao parecer um bloco solido —
 *  o mesmo laco que o mullet original tinha escrito uma vez so, generalizado
 *  por `bordaFn`/contagem/alcance/espalhamento. */
function fiosSoltosNuca(ma, bordaFn, count, r, compMin, compMax, spread = 1.0) {
  const p = new THREE.Vector3(), n = new THREE.Vector3(), eixo = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    const az = azNuca(-0.5 * spread + r() * spread)
    const th = bordaFn(az) * (0.90 + r() * 0.08)
    eggSurface(th, az, 1.03, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y -= 1.1 + r() * 0.4
    dir.x += (r() - 0.5) * 0.3
    dir.normalize()
    eixo.set(Math.cos(az), 0, -Math.sin(az))
    const comp = (compMin + r() * (compMax - compMin)) * S
    fio(ma, p, dir, comp, 0.0022 * S, eixo, (r() - 0.5) * 0.5, 5, 3)
  }
}

/**
 * Par de fibras torcidas: nascem quase juntas (deslocadas por uma tangente
 * pequena a partir do ponto/normal da pele) e curvam em direcoes OPOSTAS a
 * partir do MESMO eixo. Nao modela a helice fio a fio — so aproxima a leitura
 * visual de "duas pontas se afastando e se cruzando" que um twist de verdade
 * tem, com a ferramenta fio() que ja existe e ja funciona.
 */
function parTorcido(ma, p, n, comp, raio, r) {
  const ref = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const tan = new THREE.Vector3().crossVectors(n, ref).normalize()
  const eixo = new THREE.Vector3().crossVectors(n, tan).normalize()
  for (const lado of [1, -1]) {
    const p0 = new THREE.Vector3(
      p.x + tan.x * 0.0032 * S * lado,
      p.y + tan.y * 0.0032 * S * lado,
      p.z + tan.z * 0.0032 * S * lado,
    )
    const dir = new THREE.Vector3(
      n.x + tan.x * 0.16 * lado,
      n.y + tan.y * 0.16 * lado,
      n.z + tan.z * 0.16 * lado,
    ).normalize()
    fio(ma, p0, dir, comp, raio, eixo, lado * (1.0 + r() * 0.5), 5, 3)
  }
}

// ===========================================================================
// 1. MULLET CORTINA — repartido no meio, franja em cortina na frente, cauda
// classica de 5 mechas finas atras. O campo da frente e o MESMO truque da
// cortina de cabelo-corte.js (vale central + dois cumes deslocados); o que
// muda pra virar mullet e so a nuca, que aqui tem cauda em vez de terminar
// curta.
// ===========================================================================
const MC_LINHA = [
  [0.00, 0.152 * S],
  [0.16, 0.142 * S],
  [0.36, 0.120 * S],
  [0.58, 0.130 * S],
  [0.90, 0.094 * S],
  [1.25, 0.026 * S],
  [1.60, 0.037 * S],
  [2.10, -0.018 * S],
  [Math.PI, -0.074 * S],
]
const bordaMulletCortina = bordaOndulada(MC_LINHA, 1, ondaDeCorte(0.015, 3, 0.7, 0.010, 5, -0.6))

function volumeMulletCortina(u, th, az) {
  let s = 1.083
  s += 0.040 * gauss(th, 0.32, 0.38)
  s += 0.058 * gauss(Math.abs(az) - 0.30, 0, 0.20) * smoothstep(0.15, 1.0, u)
  s -= 0.032 * gauss(az, 0, 0.10) * smoothstep(0.05, 1.0, u)
  return s
}

// ===========================================================================
// 2. MULLET MODERNO — topo cheio e texturizado (tufos curtos e grossos, como
// crop-texturizado) e uma UNICA cauda larga e quase reta — "nuca comprida e
// reta" — em vez das cinco mechas finas dos outros mullets.
// ===========================================================================
const MM_LINHA = [
  [0.00, 0.151 * S],
  [0.32, 0.149 * S],
  [0.64, 0.134 * S],
  [0.95, 0.092 * S],
  [1.28, 0.028 * S],
  [1.62, 0.038 * S],
  [2.15, -0.015 * S],
  [Math.PI, -0.080 * S],
]
const bordaMulletModerno = bordaOndulada(MM_LINHA, 1, ondaDeCorte(0.017, 3, -0.2, 0.011, 5, 1.3))

function volumeMulletModerno(u, th, az) {
  let s = 1.085
  s += 0.045 * gauss(th, 0.30, 0.40)
  s += 0.020 * gauss(th, 0.56, 0.22)
  return s
}

function tufosMulletModerno(cor) {
  const ma = tecelagem()
  const r = rng(82001)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 90
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N
    const az = espiralAz(i, N)
    // clamp pela PROPRIA linha de corte deste mullet (regra b): a constante
    // 0.52 sozinha bastava pro crop-texturizado, que tem franja mais baixa;
    // aqui a linha comeca mais alta e um tufo por i pequeno passaria da testa
    // sem o min().
    const lim = bordaMulletModerno(az) * 0.88
    const th = Math.min(lim, 0.08 + Math.sqrt(t) * 0.52)
    eggSurface(th, az, 1.014, p)
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

// ===========================================================================
// 3. MULLET CACHEADO — o mesmo campo cheio do moderno, mas com cachos (fio de
// curvatura alta) no topo em vez de tufos retos, e duas caudas com balanco
// lateral de ALTA frequencia e amplitude pequena — o "bounce" de cacho, bem
// diferente do balanco largo e lento do mullet ondulado (item 6).
// ===========================================================================
const MK_LINHA = [
  [0.00, 0.150 * S],
  [0.32, 0.148 * S],
  [0.64, 0.130 * S],
  [0.95, 0.090 * S],
  [1.28, 0.030 * S],
  [1.62, 0.040 * S],
  [2.15, -0.016 * S],
  [Math.PI, -0.078 * S],
]
const bordaMulletCacheado = bordaOndulada(MK_LINHA, 1, ondaDeCorte(0.019, 3, 1.4, 0.012, 5, -1.0))

function volumeMulletCacheado(u, th, az) {
  let s = 1.082
  s += 0.042 * gauss(th, 0.33, 0.40)
  // leve ondulacao cruzada na propria casca, pro cacho ja aparecer antes do fio
  s += 0.022 * Math.sin(az * 6 + th * 10) * smoothstep(0.15, 0.55, u) * (1 - smoothstep(0.85, 1.0, u))
  return s
}

function cachosMulletTopo(cor) {
  const ma = tecelagem()
  const r = rng(83001)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 56
  for (let i = 0; i < N; i++) {
    const az = espiralAz(i, N)
    const t = (i + 0.5) / N
    const lim = bordaMulletCacheado(az) * 0.86
    const th = Math.min(lim, 0.08 + Math.sqrt(t) * 0.46)
    eggSurface(th, az, 1.02, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.y -= 0.15 + r() * 0.3
    dir.x += (r() - 0.5) * 0.6
    dir.normalize()
    eixo.set(Math.cos(az), 0.3, -Math.sin(az))
    const comp = (0.009 + r() * 0.008) * S
    fio(ma, p, dir, comp, 0.0019 * S, eixo, 1.1 + r() * 0.7, 5, 3)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 2)))
}

// ===========================================================================
// 4. MULLET CURTO — versao curta dos seis: linha de corte mais alta (menos
// campo, menos gauss de coroa) e UMA cauda so, curta e larga — "so uma lingua
// na nuca" — em vez de qualquer leque de mechas.
// ===========================================================================
const MS_LINHA = [
  [0.00, 0.148 * S],
  [0.32, 0.146 * S],
  [0.62, 0.128 * S],
  [0.92, 0.082 * S],
  [1.25, 0.022 * S],
  [1.60, 0.033 * S],
  [2.10, -0.022 * S],
  [Math.PI, -0.058 * S],
]
const bordaMulletCurto = bordaOndulada(MS_LINHA, 1, ondaDeCorte(0.014, 3, 0.4, 0.009, 5, -0.7))

function volumeMulletCurto(u, th, az) {
  let s = 1.080
  s += 0.032 * gauss(th, 0.30, 0.34)
  return s
}

// ===========================================================================
// 5. MULLET MEDIO — meio termo entre o curto e os outros, com um reforco que
// nenhum outro corte deste arquivo tem: LATERAIS MAIS CHEIAS. E o oposto do
// termo "laterais rentes" que os cortes curtos de cabelo.js usam (que reduz
// `s` acima de 0.90 rad) — aqui o mesmo intervalo de azimute GANHA espessura.
// A cauda acompanha: 3 mechas de largura media, nem o leque fino da cortina
// nem a mecha unica e larga do moderno.
// ===========================================================================
const MD_LINHA = [
  [0.00, 0.150 * S],
  [0.34, 0.148 * S],
  [0.66, 0.136 * S],
  [0.95, 0.102 * S],
  [1.28, 0.045 * S],
  [1.62, 0.052 * S],
  [2.10, -0.012 * S],
  [Math.PI, -0.070 * S],
]
const bordaMulletMedio = bordaOndulada(MD_LINHA, 1, ondaDeCorte(0.016, 3, -0.6, 0.011, 5, 0.9))

function volumeMulletMedio(u, th, az) {
  const a = az < 0 ? -az : az
  let s = 1.084
  s += 0.040 * gauss(th, 0.32, 0.38)
  s += 0.030 * smoothstep(0.55, 1.30, a) * (1 - smoothstep(0.85, 1.0, u))
  return s
}

// ===========================================================================
// 6. MULLET ONDULADO — seno de BAIXA frequencia e amplitude LARGA direto no
// campo de volume do topo (a onda e da propria silhueta da casca, nao de fio
// solto) e duas caudas com o mesmo balanco largo e lento — o oposto do
// bounce apertado do cacheado (item 3).
// ===========================================================================
const MO_LINHA = [
  [0.00, 0.151 * S],
  [0.33, 0.149 * S],
  [0.65, 0.132 * S],
  [0.95, 0.090 * S],
  [1.28, 0.027 * S],
  [1.62, 0.038 * S],
  [2.12, -0.017 * S],
  [Math.PI, -0.076 * S],
]
const bordaMulletOndulado = bordaOndulada(MO_LINHA, 1, ondaDeCorte(0.018, 3, 2.1, 0.012, 5, -1.7))

function volumeMulletOndulado(u, th, az) {
  let s = 1.083
  s += 0.042 * gauss(th, 0.32, 0.38)
  s += 0.030 * Math.sin(az * 2.4 + th * 3.2) * smoothstep(0.10, 0.5, u) * (1 - smoothstep(0.88, 1.0, u))
  return s
}

// ===========================================================================
// 7. CORTE RETO (flat top) — a mesma dupla-casca do undercut (raspado fino
// cor de pele cobrindo tudo + campo alto por cima), mas a casca de cima passa
// por achatarTopo() com um raio bem maior que o da escovinha — a mesa em vez
// do "flat spot" arredondado. yTeto vem da CAIXA DELIMITADORA da propria
// malha (computeBoundingBox), nao de uma segunda avaliacao teorica do campo
// no polo: a gaussiana do campo esta centrada fora do polo (th=0.22, nao 0),
// entao o ponto mais alto de verdade pode nao ser o polo — medir a malha
// construida evita depender dessa conta.
// ===========================================================================
const CR_RASPADO = [
  [0.00, 0.150 * S],
  [0.40, 0.142 * S],
  [0.80, 0.108 * S],
  [1.20, 0.040 * S],
  [1.60, -0.010 * S],
  [2.00, -0.032 * S],
  [Math.PI, -0.056 * S],
]
const bordaCrRaspado = bordaOndulada(CR_RASPADO, 1, ondaDeCorte(0.011, 4, -0.3, 0.007, 7, 1.4))

const CR_LINHA = [
  [0.00, 0.148 * S],
  [0.36, 0.146 * S],
  [0.70, 0.138 * S],
  [1.00, 0.120 * S],
  [1.30, 0.100 * S],
  [1.62, 0.100 * S],
  [Math.PI, 0.070 * S],
]
const bordaCrTopo = bordaOndulada(CR_LINHA, 1, ondaDeCorte(0.008, 4, 0.5, 0.005, 7, -1.0))

function volumeCorteReto(u, th, az) {
  let s = 1.078
  s += 0.052 * gauss(th, 0.22, 0.32)
  // engrossa (nao afina) rumo a borda, igual ao undercut: aqui a borda e o
  // degrau entre a mesa e o raspado, nao uma ponta que deve sumir na pele
  s += 0.016 * u
  return s
}

// ===========================================================================
// 8. CACHOS — campo redondo moderado (mais cheio que um crop, bem menos alto
// que o perm coreano) cobrindo o cranio inteiro, com ~190 cachos curtos (fio
// de curvatura alta) em espiral de angulo de ouro por cima — cobrindo TOPO E
// LATERAIS, ao contrario dos tufos/franjas dos outros cortes, que ficam so
// numa faixa.
// ===========================================================================
const CC_LINHA = [
  [0.00, 0.137 * S],
  [0.30, 0.135 * S],
  [0.60, 0.120 * S],
  [0.90, 0.086 * S],
  [1.25, 0.024 * S],
  [1.60, 0.034 * S],
  [2.20, -0.016 * S],
  [Math.PI, -0.048 * S],
]
const bordaCachos = bordaOndulada(CC_LINHA, 1, ondaDeCorte(0.017, 3, -0.9, 0.011, 5, 1.6))

function volumeCachos(u, th, az) {
  let s = 1.076
  s += 0.052 * gauss(th, 0.36, 0.46)
  return 1.010 + (s - 1.010) * smoothstep(1.0, 0.90, u)
}

function cachosCobertura(cor) {
  const ma = tecelagem()
  const r = rng(87001)
  const eixo = new THREE.Vector3()
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const N = 190
  for (let i = 0; i < N; i++) {
    const az = espiralAz(i, N)
    const t = (i + 0.5) / N
    // os dois termos escalam por `lim` (a propria borda naquele azimute): a
    // cobertura acompanha a linha de corte inteira, nao uma faixa fixa
    const lim = bordaCachos(az)
    const th = Math.min(lim * 0.92, 0.08 + Math.sqrt(t) * lim * 0.95)
    eggSurface(th, az, 1.018, p)
    eggNormal(th, az, n)
    const dir = n.clone()
    dir.x += (r() - 0.5) * 0.6
    dir.z += (r() - 0.5) * 0.6
    dir.y += 0.15
    dir.normalize()
    eixo.set(-dir.z, 0.2, dir.x).normalize()
    const comp = (0.009 + r() * 0.008) * S
    fio(ma, p, dir, comp, 0.0019 * S, eixo, 1.0 + r() * 0.9, 4, 3)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 2)))
}

// ===========================================================================
// 9. TWISTS — casca quase rasa (a mesma excecao do crop-texturizado: quem
// sustenta a silhueta e a textura por cima, nao a casca) com ~46 pares de
// fibras torcidas (parTorcido) espalhados SO PELO TOPO — `tetoTopo` restringe
// theta pra nao invadir as laterais, que ficam curtas por baixo.
// ===========================================================================
const TW_LINHA = [
  [0.00, 0.136 * S],
  [0.30, 0.134 * S],
  [0.60, 0.118 * S],
  [0.90, 0.080 * S],
  [1.25, 0.018 * S],
  [1.60, 0.028 * S],
  [2.20, -0.020 * S],
  [Math.PI, -0.050 * S],
]
const bordaTwists = bordaOndulada(TW_LINHA, 1, ondaDeCorte(0.013, 4, 0.2, 0.008, 6, -1.1))

function volumeTwists(u, th, az) {
  return 1.012 + 0.005 * gauss(th, 0.28, 0.30)
}

function twistsTopo(cor) {
  const ma = tecelagem()
  const r = rng(88001)
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const tetoTopo = thetaNaAltura(0.070 * S)
  const N = 46
  for (let i = 0; i < N; i++) {
    const az = espiralAz(i, N)
    const t = (i + 0.5) / N
    const lim = Math.min(bordaTwists(az), tetoTopo)
    const th = 0.06 + Math.sqrt(t) * lim * 0.85
    eggSurface(th, az, 1.014, p)
    eggNormal(th, az, n)
    const comp = (0.020 + r() * 0.014) * S
    const raio = (0.0035 + r() * 0.0016) * S
    parTorcido(ma, p, n, comp, raio, r)
  }
  return sh(new THREE.Mesh(ma.geo(), peloMat(cor, 0)))
}

// ===========================================================================
// 10. ONDAS — casca curta com um termo seno em funcao SO DE THETA (nao entra
// azimute nenhum): isso desenha aneis CONCENTRICOS em volta do polo, que e
// literalmente o redemoinho de um corte 360 waves. Amplitude bem maior que o
// ruido de densidade do raspado de cabelo.js (ali o ruido so fingia
// irregularidade; aqui a onda E o desenho, entao precisa aparecer de longe).
// ===========================================================================
const ON_LINHA = [
  [0.00, 0.135 * S],
  [0.34, 0.133 * S],
  [0.66, 0.118 * S],
  [0.96, 0.076 * S],
  [1.30, 0.018 * S],
  [1.65, 0.028 * S],
  [2.30, -0.020 * S],
  [Math.PI, -0.046 * S],
]
const bordaOndas = bordaOndulada(ON_LINHA, 1, ondaDeCorte(0.010, 4, 0.9, 0.006, 7, -0.5))

function volumeOndas(u, th, az) {
  let s = 1.070
  s += 0.028 * gauss(th, 0.30, 0.42)
  s += 0.026 * Math.sin(th * 24)
  return 1.010 + (s - 1.010) * smoothstep(1.0, 0.90, u)
}

// ===========================================================================

export const CABELOS_CORTE2 = [
  {
    id: 'mullet-cortina',
    nome: 'Mullet cortina',
    name: 'Mullet cortina',
    metodo: 'campo com vale central (a risca) e dois cumes deslocados pros lados (a cortina) sobre 5 mechas finas de cauda caindo da nuca, como um mullet classico',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletCortina, bordaMulletCortina, cor, 62, 15))

      const r = rng(81001)
      const deslocamentos = [-0.42, -0.21, 0, 0.21, 0.42]
      for (const d of deslocamentos) {
        const az = azNuca(d)
        const jitter = 1 + (r() - 0.5) * 0.30
        const geo = caudaMullet(bordaMulletCortina, az, (0.140 + r() * 0.040) * S * jitter, (0.015 + r() * 0.005) * S, r)
        g.add(sh(new THREE.Mesh(geo, hairMat(cor))))
      }

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletCortina, 16, r, 0.10, 0.19, 1.0)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'mullet-moderno',
    nome: 'Mullet moderno',
    name: 'Mullet moderno',
    metodo: 'campo cheio + ~90 tufos curtos e grossos em espiral de angulo de ouro no topo (a textura) + 1 mecha larga e quase reta caindo comprida da nuca',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletModerno, bordaMulletModerno, cor, 60, 14))
      g.add(tufosMulletModerno(cor))

      const r = rng(82501)
      const geo = caudaMullet(bordaMulletModerno, azNuca(0), (0.205 + r() * 0.035) * S, (0.034 + r() * 0.005) * S, r)
      g.add(sh(new THREE.Mesh(geo, hairMat(cor))))

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletModerno, 10, r, 0.14, 0.22, 0.6)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'mullet-cacheado',
    nome: 'Mullet cacheado',
    name: 'Mullet cacheado',
    metodo: 'mesmo campo cheio do moderno, mas com ~56 cachos (fio de curvatura alta) no topo e 2 caudas com balanco lateral de alta frequencia — o cacho continua na cauda',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletCacheado, bordaMulletCacheado, cor, 62, 15))
      g.add(cachosMulletTopo(cor))

      const r = rng(83501)
      for (const d of [-0.14, 0.14]) {
        const az = azNuca(d)
        const geo = caudaMullet(bordaMulletCacheado, az, (0.165 + r() * 0.035) * S, (0.019 + r() * 0.005) * S, r,
          { freq: 5.5, amp: 0.010 * S, fase: r() * 6.28 })
        g.add(sh(new THREE.Mesh(geo, hairMat(cor))))
      }

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletCacheado, 12, r, 0.09, 0.15, 1.0)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'mullet-curto',
    nome: 'Mullet curto',
    name: 'Mullet curto',
    metodo: 'campo mais raso e linha mais alta que os outros cinco mullets — corte curto de verdade — com uma unica cauda curta e larga, so uma lingua na nuca',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletCurto, bordaMulletCurto, cor, 58, 13))

      const r = rng(84001)
      const geo = caudaMullet(bordaMulletCurto, azNuca(0), (0.065 + r() * 0.020) * S, (0.020 + r() * 0.004) * S, r)
      g.add(sh(new THREE.Mesh(geo, hairMat(cor))))

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletCurto, 8, r, 0.05, 0.09, 0.7)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'mullet-medio',
    nome: 'Mullet medio',
    name: 'Mullet medio',
    metodo: 'campo com reforco extra nas laterais (o oposto do "laterais rentes" dos cortes curtos) mais linha de corte mais alta na tempora, e 3 mechas de cauda de largura media',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletMedio, bordaMulletMedio, cor, 62, 15))

      const r = rng(85001)
      for (const d of [-0.28, 0, 0.28]) {
        const az = azNuca(d)
        const jitter = 1 + (r() - 0.5) * 0.25
        const geo = caudaMullet(bordaMulletMedio, az, (0.125 + r() * 0.030) * S * jitter, (0.023 + r() * 0.005) * S, r)
        g.add(sh(new THREE.Mesh(geo, hairMat(cor))))
      }

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletMedio, 13, r, 0.10, 0.16, 1.0)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'mullet-ondulado',
    nome: 'Mullet ondulado',
    name: 'Mullet ondulado',
    metodo: 'campo com seno de baixa frequencia e amplitude larga no topo — a onda esta na propria silhueta da casca, nao em fio — e 2 caudas com o mesmo balanco largo e lento',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeMulletOndulado, bordaMulletOndulado, cor, 64, 16))

      const r = rng(86001)
      for (const d of [-0.15, 0.15]) {
        const az = azNuca(d)
        const geo = caudaMullet(bordaMulletOndulado, az, (0.170 + r() * 0.035) * S, (0.026 + r() * 0.005) * S, r,
          { freq: 2.6, amp: 0.022 * S, fase: r() * 6.28 })
        g.add(sh(new THREE.Mesh(geo, hairMat(cor))))
      }

      const ma = tecelagem()
      fiosSoltosNuca(ma, bordaMulletOndulado, 12, r, 0.11, 0.18, 1.0)
      g.add(sh(new THREE.Mesh(ma.geo(), peloMat(cor, 1))))
      return g
    },
  },

  {
    id: 'corte-reto',
    nome: 'Corte reto',
    name: 'Corte reto',
    metodo: 'duas cascas como o undercut (raspado fino cor de pele + campo alto), mas a de cima e nivelada num pos-processo de raio bem largo calibrado pela caixa delimitadora da propria malha — vira mesa, nao capacete arredondado',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const pele = skinOf(ctx)
      const g = new THREE.Group()
      const tomRaspado = mixHex(pele, shade(cor, 0.88), 0.55)
      g.add(scalp(tomRaspado, bordaCrRaspado, { s: 1.008, thetaMax: 2.35, wSeg: 40, hSeg: 22 }))

      const mesa = cascaCampo(volumeCorteReto, bordaCrTopo, cor, 60, 15)
      mesa.geometry.computeBoundingBox()
      const yMax = mesa.geometry.boundingBox.max.y
      achatarTopo(mesa, yMax - 0.010 * S, 0.078 * S)
      g.add(mesa)
      return g
    },
  },

  {
    id: 'cachos',
    nome: 'Cachos',
    name: 'Cachos',
    metodo: 'campo redondo moderado cobrindo o cranio inteiro + ~190 cachos curtos (fio de curvatura alta) em espiral de angulo de ouro cobrindo topo e laterais',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeCachos, bordaCachos, cor, 62, 14))
      g.add(cachosCobertura(cor))
      return g
    },
  },

  {
    id: 'twists',
    nome: 'Twists',
    name: 'Twists',
    metodo: 'casca quase rasa (silhueta curta) + ~46 pares de fibras (parTorcido) que nascem quase juntas e curvam em direcoes opostas a partir do mesmo eixo — a leitura de fio torcido — espalhados so pelo topo',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      const g = new THREE.Group()
      g.add(cascaCampo(volumeTwists, bordaTwists, cor, 50, 12))
      g.add(twistsTopo(cor))
      return g
    },
  },

  {
    id: 'ondas',
    nome: 'Ondas',
    name: 'Ondas',
    metodo: 'casca curta com um termo seno em funcao SO de theta (nao entra azimute) — ondas concentricas de verdade em volta do polo, como o redemoinho de um corte 360 waves',
    build(ctx) {
      useHead(ctx)
      const cor = hairColorFrom(ctx)
      return cascaCampo(volumeOndas, bordaOndas, cor, 64, 28)
    },
  },
]

export default CABELOS_CORTE2
