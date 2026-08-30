import * as THREE from 'three'
import {
  HEAD_S, HEAD, clamp, mix, smoothstep, rng, shade,
  useHead, activeHead, eggSurface, pontoNaPele,
  headShell, byAz, hairMat, peloMat, tecelagem, fio, beardColorFrom, soldarNormais, sh,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/barba-extra2.js — SEIS BARBAS, a metade de BAIXO do mesmo
// cartaz "Barber's Guide to 24 Beard Styles" cuja metade de cima virou
// barba-extra.js: Imperial, Mosqueteiro, Costeleta larga, Costeleta ligada,
// Verdi e Pirata.
//
// Mesma ideia de barba-extra.js: nao sao seis geometrias inventadas do zero,
// sao combinacoes novas dos MESMOS quatro metodos (REGIAO, FAIXA, FRANJA,
// BIGODE) mais uma ferramenta nova, FAIXACOMFURO, que so entra quando a peca
// precisa passar PERTO da boca sem cobri-la.
//
// Por que este arquivo carrega a PROPRIA copia de regiao/faixa/franjaBorda/
// patchQueixo/bigode em vez de importar de barba-extra.js: nenhuma delas e
// exportada de la (o unico export daquele arquivo e o catalogo BARBAS_EXTRA),
// e a tarefa que criou este arquivo pede pra NAO tocar em barba-extra.js fora
// do bigode. Mesma razao, mesma solucao que o proprio barba-extra.js ja usa
// pra thetaEmY (copiada de barba.js porque nao e exportada de la): cada
// modulo de rosto que precisa de um helper que o vizinho nao exporta carrega
// a propria copia.
//
// A FERRAMENTA NOVA — FAIXACOMFURO — e a mesma tecnica que barba.js chama de
// cascaComFuro (a funcao privada 'manto' daquele arquivo, usada pela barba
// 'cheia'), copiada aqui pelo mesmo motivo acima. Ver o comentario dela mais
// abaixo pra explicacao completa; resumindo o que o CONTRATO.md avisa: uma
// peca que preenche de uma linha de corte ATE O POLO DO QUEIXO tapa a boca
// se essa linha, em algum azimute dentro da largura da boca, subir acima da
// altura dela — headShell (a base de REGIAO/FAIXA) so corta por UMA linha de
// theta por azimute, entao a boca so pode ser o FIM de uma casca, nunca um
// vao no meio dela. Das seis pecas daqui, DUAS tem silhueta que sobe perto
// da boca por desenho — 'verdi' (o maxilar arredondado sobe em direcao a
// bochecha logo depois do canto da boca) e 'costeleta-ligada' (o conector
// que liga a costeleta ao bigode passa exatamente ali) — e as duas usam
// faixaComFuro. As outras quatro nunca chegam perto da boca (REGIAO/FAIXA
// comuns bastam, do mesmo jeito que ja bastam pro cavanhaque/balbo/ancora/
// circular de barba-extra.js).
//
// A REGRA DE OURO continua a mesma: cada entrada muda a REGIAO OCUPADA —
// cheio vs vazio em bochecha/queixo/buco/lateral —, nunca so o comprimento
// do pelo. E o CONSERTO do bigode (pedido do dono: "mais cabelo, menos
// pele, mais pelo preto") ja vem de fabrica aqui: bigode()/bigodeBase() sao
// a versao CORRIGIDA (fio mais grosso, mais denso, casca escura por baixo),
// copiada de barba-extra.js DEPOIS do conserto — as tres pecas daqui que tem
// bigode (imperial, mosqueteiro, verdi) e a que tem so um bigode fino
// (pirata) nascem todas com o bigode cheio, nao com o ralo antigo.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da boca (tabela do CONTRATO). Mesma referencia de barba.js. */
const Y_BOCA = -0.082 * S

/** Meia largura da boca em METROS — mesma constante de barba.js/barba-extra.js. */
const X_BOCA = 0.047

/** Sentinela de "aqui nao tem barba" pro metodo REGIAO — ver barba-extra.js. */
const FORA = 3.30

/** theta (0=topo, PI=queixo) da altura y NO CRANIO ATIVO. Copiada — ver nota no topo do arquivo. */
function thetaEmY(y) {
  const sp = activeHead()
  return Math.acos(clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1))
}

const _p = new THREE.Vector3()
const _n = new THREE.Vector3()
const _tg = new THREE.Vector3()
const _lat = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _alvo = new THREE.Vector3()
const _eixo = new THREE.Vector3()
const _h1 = new THREE.Vector3()
const _h2 = new THREE.Vector3()
const _hx = new THREE.Vector3()

/** |x| da pele em (theta, az). */
function xEmAz(theta, az) { return Math.abs(eggSurface(theta, az, 1, _hx).x) }

/** Azimute em que a pele passa por |x| = alvo, na altura `theta`. */
function azEmX(theta, alvo) {
  let az = 0.40
  for (let k = 0; k < 3; k++) {
    const xa = xEmAz(theta, az)
    if (xa < 1e-5) break
    az = clamp(az * (alvo / xa), 0.06, 1.40)
  }
  return az
}

/** Direcao "descendo PELA PELE" em (theta, az) — de onde o pelo cai. */
function descidaNaPele(theta, az, out) {
  const perto = theta > Math.PI - 0.07
  const a = perto ? theta - 0.06 : theta
  const b = perto ? theta : theta + 0.06
  eggSurface(b, az, 1, _h1)
  eggSurface(a, az, 1, _h2)
  return out.subVectors(_h1, _h2).normalize()
}

/** Pelo nao projeta sombra (custa caro no shadow map por muito pouco). */
function pelo(m) { m.castShadow = false; m.receiveShadow = true; return m }

/** Ondulacao de baixa frequencia da casca — mesma formula de barba.js. */
function ondaPele(theta, az) {
  return Math.sin(az * 7.3 + theta * 5.1) * 0.62 + Math.sin(az * 12.7 - theta * 8.3) * 0.38
}

/** Empurra a casca ao longo da propria normal por fracao de milimetro de senoide — ver barba.js. */
function rugoso(geo, amp) {
  const pos = geo.attributes.position
  const nor = geo.attributes.normal
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const d = amp * ondaPele(Math.atan2(Math.hypot(x, z), y), Math.atan2(x, z))
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

/**
 * REGIAO: casca que preenche de lo(az) ATE O POLO DO QUEIXO — ver barba-extra.js.
 *
 * `azHalf` e opcional (barba-extra.js nao tem esse parametro aqui — esta e a
 * copia LOCAL, ver nota no topo do arquivo). Sem ele, headShell varre os
 * `wSeg` segmentos pelos 360 graus inteiros; se a janela de `lo` for mais
 * ESTREITA que o espacamento entre colunas (2*PI/wSeg), NENHUMA coluna cai
 * dentro da janela e a peca inteira colapsa numa fatia quase achatada — bug
 * que so apareceu com meiaLargura bem pequena (o queixo minusculo do
 * 'pirata'). azHalf concentra os `wSeg` segmentos so dentro do proprio leque
 * da peca, garantindo colunas de verdade la dentro em vez de espalhadas pela
 * cabeca toda.
 */
function regiao(cor, lo, t0, s, wSeg, hSeg, azHalf) {
  const m = headShell(cor, { s, t0, t1: Math.PI, lo, wSeg, hSeg, azHalf })
  rugoso(m.geometry, 0.0013)
  return m
}

/** FAIXA: casca entre lo(az) e hi(az) — NAO chega no polo — ver barba-extra.js. */
function faixa(cor, lo, hi, t0, t1, s, wSeg, hSeg, azHalf) {
  const m = headShell(cor, { s, t0, t1, lo, hi, wSeg, hSeg, azHalf })
  rugoso(m.geometry, 0.0011)
  return m
}

/** FRANJA: fios curtos sobre uma linha de corte — ver barba-extra.js. */
function franjaBorda(maA, maB, linha, rnd, azMin, azMax, N, compBase, compVar, raio, desce) {
  for (let k = 0; k < N; k++) {
    const az = azMin + (azMax - azMin) * (k + 0.5) / N + (rnd() - 0.5) * ((azMax - azMin) / N) * 0.5
    const th0 = linha(az)
    if (th0 > Math.PI - 0.08 || th0 < 0.03) continue
    for (let r = 0; r < 2; r++) {
      const theta = th0 + 0.012 + r * 0.048 + rnd() * 0.020
      if (theta > Math.PI - 0.02) continue
      pontoNaPele(theta, az, 0.0016, _p, _n)
      descidaNaPele(theta, az, _tg)
      _lat.crossVectors(_n, _tg).normalize()
      _dir.copy(_n).multiplyScalar(0.70)
        .addScaledVector(_tg, desce ? -0.62 : 0.58)
        .addScaledVector(_lat, (rnd() - 0.5) * 0.30)
        .normalize()
      _eixo.crossVectors(_dir, _n).normalize()
      const comp = (compBase + compVar * rnd() - r * compVar * 0.28) * S
      fio(rnd() < 0.5 ? maA : maB, _p, _dir, comp, raio, _eixo, 0.33)
    }
  }
}

/** PATCH DE QUEIXO: REGIAO pequena numa janela estreita de azimute + a propria franja — ver barba-extra.js. */
function patchQueixo(cor, meiaLargura, yTopo, opts, rnd, maA, maB, azFranja) {
  const lo = byAz([
    [0.00, thetaEmY(yTopo)],
    [meiaLargura * 0.72, thetaEmY(yTopo - 0.006 * S)],
    [meiaLargura, FORA],
  ])
  const linha = (az) => Math.min(Math.PI, lo(az))
  const casca = regiao(
    shade(cor, 1.05), linha, thetaEmY(yTopo + 0.035 * S),
    opts.s || 1.028, opts.wSeg || 40, opts.hSeg || 16, opts.azHalf,
  )
  franjaBorda(
    maA, maB, linha, rnd, -azFranja, azFranja, opts.n || 46,
    opts.c0 || 0.0052, opts.c1 || 0.0044, (opts.raio || 0.00100) * S, true,
  )
  return casca
}

/**
 * BIGODE + BIGODEBASE — copia da versao JA CORRIGIDA de barba-extra.js
 * (pedido do dono: "mais cabelo e sem tanto espaco pra pele, mais pelo
 * preto"). Mesmos tres ajustes de la: colunas +15%, fio da base +27% mais
 * grosso, falha 0.05 -> 0.025; mais a casca escurecida por baixo do miolo da
 * grade. Ver os comentarios completos em barba-extra.js — nao repetidos aqui
 * pra nao duplicar um bloco de comentario inteiro dentro de outro arquivo.
 */
function bigode(mas, rnd, opts = {}) {
  const {
    linhas = 9, cols = 38, larguraX = 1.60, quedaMul = 1.0, compMul = 1.0,
    yTopo = -0.0388 * S, yBase = -0.064 * S, curlUp = 0, falha = 0.025,
  } = opts
  const COLS = Math.round(cols * 1.15)
  const AZ_MAX = azEmX(thetaEmY(yBase), X_BOCA * larguraX)

  for (let li = 0; li < linhas; li++) {
    const ft = li / (linhas - 1)
    for (let c = 0; c < COLS; c++) {
      if (rnd() < falha) continue
      const fa = ((c + 0.5) / COLS) * 2 - 1
      const a = fa < 0 ? -fa : fa
      const sgn = fa < 0 ? -1 : 1
      const meiaLargura = AZ_MAX * (0.52 + 0.48 * smoothstep(0, 0.65, ft))
      const az = fa * meiaLargura + (rnd() - 0.5) * 0.028
      const y0 = mix(yTopo, yBase, ft) + (rnd() - 0.5) * 0.004 * S
      const fora = clamp((xEmAz(thetaEmY(y0), az) - X_BOCA) / 0.030, 0, 1)
      const y = y0 - 0.020 * S * quedaMul * fora * fora * ft
      const theta = thetaEmY(y)

      pontoNaPele(theta, az, 0.0012, _p, _n)
      descidaNaPele(theta, az, _tg)
      _lat.crossVectors(_n, _tg).normalize().multiplyScalar(sgn)

      const su = curlUp * ft * ft
      const abre = 0.16 + 0.72 * a
      _dir.copy(_n).multiplyScalar(0.95 - 0.42 * a + su * 0.5)
        .addScaledVector(_lat, abre)
        .addScaledVector(_tg, (0.15 + 0.55 * ft * fora) * (1 - su))
        .normalize()
      _alvo.copy(_tg).multiplyScalar((0.30 + 0.55 * fora) * (1 - su))
        .addScaledVector(_n, su * 0.9)
        .addScaledVector(_lat, 0.80 - 0.22 * fora).normalize()
      _eixo.crossVectors(_dir, _alvo)
      if (_eixo.lengthSq() < 1e-9) _eixo.copy(_n)
      _eixo.normalize()

      const filtro = ft < 0.34 && a < 0.13 ? 0.45 : 1
      const comp = (0.0090 + 0.0115 * a * a + 0.0025 * rnd()) * S * filtro * compMul
      const raio = (0.00190 - 0.00040 * a) * S
      fio(mas[(rnd() * 3) | 0], _p, _dir, comp, raio, _eixo, 0.35 + 0.85 * fora)
    }
  }
}

function bigodeBase(g, cor, opts = {}) {
  const {
    larguraX = 1.60, quedaMul = 1.0,
    yTopo = -0.0388 * S, yBase = -0.064 * S,
  } = opts
  const AZ_MAX = azEmX(thetaEmY(yBase), X_BOCA * larguraX)
  const meiaLarguraCasca = AZ_MAX * 0.50
  const thLo = thetaEmY(yTopo + 0.004 * S)
  const lo = () => thLo
  const hi = (az) => {
    const a = az < 0 ? -az : az
    const t = clamp(a / meiaLarguraCasca, 0, 1)
    return thetaEmY(yBase - 0.014 * S * quedaMul * t * t)
  }
  const thHiMax = thetaEmY(yBase - 0.014 * S * quedaMul)
  const m = faixa(shade(cor, 0.60), lo, hi, thLo - 0.02, thHiMax + 0.02, 1.008, 30, 7, meiaLarguraCasca * 1.08)
  g.add(m)
}

/** Adiciona ao grupo os acumuladores de tecelagem que nao ficaram vazios. */
function addFios(g, cor, ...mas) {
  const tons = [0, 2, 1]
  mas.forEach((ma, i) => { if (!ma.vazia) g.add(pelo(new THREE.Mesh(ma.geo(), peloMat(cor, tons[i] !== undefined ? tons[i] : i)))) })
}

// ---------------------------------------------------------------------------
// FAIXACOMFURO — cascaComFuro de barba.js (a funcao privada 'manto', que la
// desenha a barba 'cheia'), copiada e simplificada pra bandas menores. Ver a
// nota grande no topo do arquivo pra explicacao completa da regra.
//
// A diferenca pra REGIAO/FAIXA comuns: em vez de UMA linha de corte por
// azimute, cada coluna vira DUAS faixas — uma de `lo` ate `furoCima`, outra
// de `furoBaixo` ate `hi`. Fora da janela da boca (`furoCima`/`furoBaixo`
// colapsados no MESMO theta) as duas faixas se encostam e o resultado e
// identico a uma casca inteira, sem costura visivel; dentro da janela elas
// se afastam e deixam o vao onde a boca esta.
// ---------------------------------------------------------------------------

/** Vertice da faixa: ponto da pele afastado por `fora` + ondulacao — mesma logica de pontoManto em barba.js. */
function pontoFaixaF(ma, theta, az, fora, onda) {
  const polo = clamp(Math.sin(theta) * 4, 0, 1)
  pontoNaPele(theta, az, fora + onda * polo * ondaPele(theta, az), _p, _n)
  return ma.v(_p.x, _p.y, _p.z)
}

/** Costura duas colunas vizinhas — mesma logica de costurar em barba.js. */
function costurarF(ma, cols) {
  for (let j = 0; j < cols.length - 1; j++) {
    const A = cols[j], B = cols[j + 1]
    if (A.length < 2 || B.length < 2) continue
    for (let i = 0; i < A.length - 1; i++) ma.quad(A[i], A[i + 1], B[i + 1], B[i])
  }
}

/**
 * Preenche `ma` com a casca-com-furo entre lo(az)/hi(az), com o furo definido
 * por furoCima(az)/furoBaixo(az) (ambos clampados pra dentro de [lo,hi], que
 * e o que faz o furo desligar sozinho fora da janela da boca — ver furoBoca
 * abaixo). `hi` pode ser `() => Math.PI` pra uma peca que chega no queixo
 * (o equivalente com furo de uma REGIAO), ou uma curva que NAO chega la pra
 * uma banda (o equivalente com furo de uma FAIXA).
 */
function faixaComFuro(ma, lo, hi, furoCima, furoBaixo, azMin, azMax, nA, nT, fora, onda) {
  const colsA = [], colsB = []
  for (let j = 0; j <= nA; j++) {
    const az = azMin + (azMax - azMin) * j / nA
    let t0 = clamp(lo(az), 0, Math.PI)
    const t1 = clamp(hi(az), 0, Math.PI)
    if (t1 - t0 < 0.02) t0 = t1
    const mA = clamp(furoCima(az), t0, t1)
    const mB = clamp(furoBaixo(az), t0, t1)
    const A = [], B = []
    for (let i = 0; i <= nT; i++) {
      const u = i / nT
      A.push(pontoFaixaF(ma, mix(t0, mA, u), az, fora, onda))
      B.push(pontoFaixaF(ma, mix(mB, t1, u), az, fora, onda))
    }
    colsA.push(A); colsB.push(B)
  }
  costurarF(ma, colsA)
  costurarF(ma, colsB)
}

/**
 * Furo da boca: mesma lente eliptica do manto de barba.js (a boca e uma
 * elipse deitada; rampa linear dava losango e o canto do losango batia no
 * canto do labio). `xFuro` maior que X_BOCA de proposito — sobra margem em
 * qualquer um dos craniuns. `folgaCima`/`folgaBaixo` sao METROS acima/abaixo
 * de Y_BOCA ate onde o furo abre no centro (az=0).
 */
function furoBoca(xFuro, folgaCima, folgaBaixo) {
  const thBoca = thetaEmY(Y_BOCA)
  const azFuro = azEmX(thBoca, xFuro)
  const elipse = (az) => {
    const a = az < 0 ? -az : az
    if (a >= azFuro) return 0
    return Math.sqrt(1 - (a / azFuro) * (a / azFuro))
  }
  const thCima = thetaEmY(Y_BOCA + folgaCima)
  const thBaixo = thetaEmY(Y_BOCA - folgaBaixo)
  return {
    azFuro,
    cima: (az) => thBoca - (thBoca - thCima) * elipse(az),
    baixo: (az) => thBoca + (thBaixo - thBoca) * elipse(az),
  }
}

/**
 * COSTELETA AMPLA: a FAIXA lateral de 'costeletas' (barba-extra.js), so que
 * MUITO mais larga (abre mais cedo em azimute) e descendo mais perto do
 * maxilar (baseY mais baixo). E o corpo comum de 'costeleta-larga' e
 * 'costeleta-ligada' — as duas so diferem no que se pendura dela (nada, ou
 * bigode + conector) — compartilhado pra nao desenhar a mesma costeleta duas
 * vezes com numeros ligeiramente diferentes.
 */
function costeletaAmpla(tom, rnd, maA, maB, opts = {}) {
  const { azAbre = 0.66, azFecha = 0.90, baseY = -0.078 * S } = opts
  const TOPO_Y = 0.100 * S
  const thTopo = thetaEmY(TOPO_Y)
  const thBase = thetaEmY(baseY)
  const janela = (az) => {
    const a = az < 0 ? -az : az
    return smoothstep(azAbre, azFecha, a) * (1 - smoothstep(2.00, 2.18, a))
  }
  const loSb = (az) => mix(thBase, thTopo, janela(az))
  const hiSb = () => thBase
  const casca = faixa(tom, loSb, hiSb, thTopo - 0.02, thBase + 0.02, 1.024, 44, 18)
  franjaBorda(maA, maB, loSb, rnd, azAbre, 2.05, 26, 0.0062, 0.0050, 0.00100 * S, true)
  franjaBorda(maA, maB, loSb, rnd, -2.05, -azAbre, 26, 0.0062, 0.0050, 0.00100 * S, true)
  franjaBorda(maA, maB, hiSb, rnd, azAbre, 2.05, 18, 0.0040, 0.0032, 0.00090 * S, true)
  franjaBorda(maA, maB, hiSb, rnd, -2.05, -azAbre, 18, 0.0040, 0.0032, 0.00090 * S, true)
  return casca
}

export const BARBAS_EXTRA2 = [
  // -------------------------------------------------------------------------
  // 1 IMPERIAL (Napoleon III) — BIGODE fino com curlUp + um giro extra de
  // fio na ponta pra virar pra CIMA (curva moderada, nao fechada em cacho
  // como o guidao) + FAIXA minuscula e pontuda de mosca embaixo do labio.
  // Nada de queixo, nada de costeleta — "nada mais" no pedido original.
  // -------------------------------------------------------------------------
  {
    id: 'imperial', nome: 'Imperial', name: 'Imperial',
    metodo: 'BIGODE fino (poucas linhas/colunas) com curlUp + 4 fios extras por lado vergando a ponta pra CIMA (curva ~1 rad, nao fechada) + FAIXA minuscula com janela de azimute estreita (pontuda) embaixo do labio — nada de queixo nem costeleta',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5501 + (((ctx && ctx.cabeca) | 0) * 337))
      const g = new THREE.Group()

      const bOpts = { linhas: 5, cols: 22, larguraX: 1.30, curlUp: 0.85, quedaMul: 0.25, compMul: 0.95 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)

      // PONTAS PRA CIMA: giro moderado (1.05 rad) em vez do cacho fechado do
      // guidao (2.1 rad) — "virada pra cima", nao "enrolada".
      const AZ_MAX_I = azEmX(thetaEmY(-0.064 * S), X_BOCA * bOpts.larguraX)
      for (const sgn of [-1, 1]) {
        const az = sgn * AZ_MAX_I * 1.00
        const theta = thetaEmY(-0.056 * S)
        pontoNaPele(theta, az, 0.0013, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize().multiplyScalar(sgn)
        _dir.copy(_lat).multiplyScalar(0.55).addScaledVector(_n, 0.30).addScaledVector(_tg, -0.62).normalize()
        _eixo.crossVectors(_tg, _n).normalize()
        for (let f = 0; f < 4; f++) {
          _hx.copy(_p).addScaledVector(_lat, f * 0.0013)
          fio(mas[f % 3], _hx, _dir, 0.0078 * S, 0.00105 * S, _eixo, 1.05, 6, 3)
        }
      }
      addFios(g, shade(cor, 0.80), ...mas)

      // MOSCA PONTUDA: mesma FAIXA minuscula de 'cavanhaque-mini'/'zappa' em
      // barba-extra.js, janela mais estreita (0.045..0.115 em vez de
      // 0.06..0.14) pra fechar num ponto em vez de num retangulo arredondado.
      const tom = shade(cor, 1.05)
      const yTopoM = -0.100 * S, yBaseM = -0.122 * S
      const janelaM = (az) => 1 - smoothstep(0.045, 0.115, az < 0 ? -az : az)
      const thTopoM = thetaEmY(yTopoM), thBaseM = thetaEmY(yBaseM)
      const loM = (az) => mix(thBaseM, thTopoM, janelaM(az))
      const hiM = () => thBaseM
      // azHalf=0.16: sem ele a janela de 0.115 rad e mais estreita que o
      // espacamento entre colunas (2*PI/18 = 0.35 rad) e a peca colapsa numa
      // fatia achatada -- o mesmo bug documentado em regiao() acima.
      const cascaM = faixa(tom, loM, hiM, thTopoM - 0.02, thBaseM + 0.02, 1.030, 18, 8, 0.16)
      g.add(cascaM)
      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, loM, rnd, -0.115, 0.115, 16, 0.0038, 0.0030, 0.00090 * S, true)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 2 MOSQUETEIRO — BIGODE largo + patchQueixo ESTREITO E PONTUDO (meia
  // largura 0.36, contra 0.50 do Van Dyke), com o mesmo vao de pele
  // deliberado do Van Dyke entre os dois. Nao e o Van Dyke com outro nome:
  // a regiao ocupada do queixo e mais estreita/mais funda (mais pontuda) e o
  // bigode e mais largo e cheio — e 4 fios extras no centro do queixo
  // exageram a ponta sem alargar a base do patch.
  // -------------------------------------------------------------------------
  {
    id: 'mosqueteiro', nome: 'Mosqueteiro', name: 'Mosqueteiro',
    metodo: 'BIGODE largo com leve curlUp nas pontas + patchQueixo bem mais estreito e pontudo que o do Van Dyke (0.36 de meia largura contra 0.50), com o mesmo vao de pele deliberado entre os dois, e 4 fios extras exagerando a ponta do queixo',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5623 + (((ctx && ctx.cabeca) | 0) * 349))
      const g = new THREE.Group()

      const bOpts = { linhas: 8, cols: 34, larguraX: 1.85, curlUp: 0.30, compMul: 1.05 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)

      // patchQueixo com o MESMO yTopo seguro do Van Dyke (-0.128*S, ja
      // provado sem risco de encostar na boca) — so a largura muda, e e a
      // largura que faz a diferenca de silhueta.
      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.36, -0.128 * S, { s: 1.030, wSeg: 34, hSeg: 16, azHalf: 0.46 }, rnd, maA, maB, 0.36)
      g.add(casca)

      // PONTA: 4 fios extras bem no centro do queixo, descendo alem da
      // franja normal — exagera o "pontudo" sem alargar a base do patch.
      for (let f = 0; f < 4; f++) {
        const az = (f - 1.5) * 0.014
        const y = -0.148 * S - f * 0.0016 * S
        const theta = thetaEmY(y)
        pontoNaPele(theta, az, 0.0011, _p, _n)
        descidaNaPele(theta, az, _tg)
        _dir.copy(_tg).multiplyScalar(0.85).addScaledVector(_n, 0.35).normalize()
        _eixo.crossVectors(_dir, _n).normalize()
        fio(maB, _p, _dir, 0.0068 * S, 0.00080 * S, _eixo, 0.10)
      }
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 3 COSTELETA LARGA (Mutton Chops) — a mesma FAIXA lateral de 'costeletas'
  // (barba-extra.js), so que MUITO mais larga (abre em 0.66 em vez de 0.82)
  // e descendo bem mais perto do maxilar (baseY -0.078*S em vez de -0.055*S,
  // ainda ~4mm acima da boca em qualquer cranio — folga medida no script de
  // conferencia). Sem bigode, sem queixo — so a costeleta.
  // -------------------------------------------------------------------------
  {
    id: 'costeleta-larga', nome: 'Costeleta larga', name: 'Costeleta larga',
    metodo: 'FAIXA lateral (costeletaAmpla) MUITO mais larga e mais baixa que a costeletas de barba-extra.js — desce quase ate a altura da boca sem cobrir bochecha nem queixo — sem bigode, sem patch de queixo',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5741 + (((ctx && ctx.cabeca) | 0) * 359))
      const g = new THREE.Group()
      const tom = shade(cor, 1.02)
      const maA = tecelagem(), maB = tecelagem()
      const casca = costeletaAmpla(tom, rnd, maA, maB, {})
      g.add(casca)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 4 COSTELETA LIGADA (Friendly Mutton Chops) — a mesma costeleta ampla do
  // item 3, ligada ao BIGODE por um CONECTOR construido com faixaComFuro
  // (cascaComFuro de barba.js — ver a nota grande no topo do arquivo): o
  // conector nasce perto da ponta do bigode e vai ate a abertura da
  // costeleta, atravessando o azimute da boca. Fica com t1 acima da altura
  // da boca em quase toda a extensao (por isso normalmente nao HA furo
  // visivel — a peca ja nasce segura), mas o furo continua ativo como rede
  // de seguranca: se em algum dos craniuns a curva encostasse na altura da
  // boca dentro da largura dela, o vao apareceria sozinho em vez de tapar o
  // labio. Queixo raspado — nenhum patch ali.
  // -------------------------------------------------------------------------
  {
    id: 'costeleta-ligada', nome: 'Costeleta ligada', name: 'Costeleta ligada',
    metodo: 'a mesma costeleta ampla ligada ao BIGODE por um conector em faixaComFuro que atravessa o azimute da boca (furo como rede de seguranca) — queixo raspado, sem patch',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5867 + (((ctx && ctx.cabeca) | 0) * 373))
      const g = new THREE.Group()
      const tom = shade(cor, 1.02)

      const sbOpts = { azAbre: 0.58, azFecha: 0.82, baseY: -0.080 * S }
      const maA = tecelagem(), maB = tecelagem()
      const casca = costeletaAmpla(tom, rnd, maA, maB, sbOpts)
      g.add(casca)

      const bOpts = { linhas: 7, cols: 30 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)
      addFios(g, cor, maA, maB)

      // CONECTOR: liga a ponta do bigode padrao (larguraX default 1.60) ao
      // inicio aberto da costeleta. lo/hi deslizam de perto do bigode
      // (mais alto, mais estreito) pra perto da costeleta (mais baixo) —
      // t1 nunca passa de -0.072*S, sempre acima de Y_BOCA (-0.082*S).
      const azBigTip = azEmX(thetaEmY(-0.064 * S), X_BOCA * 1.60)
      const azSb = sbOpts.azAbre
      const azLo = Math.min(azBigTip, azSb)
      const azHi = Math.max(azBigTip, azSb)
      const loConn = (az) => {
        const a = az < 0 ? -az : az
        const t = clamp((a - azLo) / Math.max(1e-4, azHi - azLo), 0, 1)
        return thetaEmY(mix(-0.026 * S, -0.050 * S, t))
      }
      const hiConn = (az) => {
        const a = az < 0 ? -az : az
        const t = clamp((a - azLo) / Math.max(1e-4, azHi - azLo), 0, 1)
        return thetaEmY(mix(-0.072 * S, -0.080 * S, t))
      }
      const furo = furoBoca(X_BOCA * 1.30, 0.030 * S, 0.024 * S)
      const maConn = tecelagem()
      faixaComFuro(maConn, loConn, hiConn, furo.cima, furo.baixo, azLo - 0.04, azHi + 0.04, 26, 6, 0.0032, 0.0014)
      if (!maConn.vazia) g.add(sh(new THREE.Mesh(soldarNormais(maConn.geo()), hairMat(shade(cor, 0.96)))))

      return g
    },
  },

  // -------------------------------------------------------------------------
  // 5 VERDI — maxilar ARREDONDADO (o equivalente com furo de uma REGIAO:
  // faixaComFuro com hi() = Math.PI, chegando no polo do queixo) que sobe
  // pela lateral em direcao a bochecha logo depois do canto da boca — e essa
  // subida perto da boca (diferente do patch flat-e-baixo do Balbo/Ancora)
  // que faz esta peca precisar do furo. Bigode LARGO plantado separado, com
  // vao de pele — nunca toca o maxilar.
  // -------------------------------------------------------------------------
  {
    id: 'verdi', nome: 'Verdi', name: 'Verdi',
    metodo: 'REGIAO arredondada com furo (faixaComFuro ate o polo do queixo) subindo pelo maxilar em direcao a bochecha logo apos o canto da boca — por isso o furo, diferente do patch baixo do Balbo — + BIGODE largo separado por um vao de pele',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5987 + (((ctx && ctx.cabeca) | 0) * 383))
      const g = new THREE.Group()
      const tom = shade(cor, 1.04)

      const thBocaF = thetaEmY(Y_BOCA)
      const azCornerV = azEmX(thBocaF, X_BOCA)
      const X_FURO_V = X_BOCA * 1.35
      const azFuroV = azEmX(thBocaF, X_FURO_V)

      // MAXILAR: fica plano e baixo (-0.116*S, tao fundo quanto o patch do
      // Balbo) ate p1, sobe rumo a bochecha entre p1 e p2 — a subida
      // acontece DENTRO da janela do furo (p2 deriva de azFuroV, com a
      // mesma tecnica de clamp que 'aparada'/'boxed-curta' usam pra azCanto
      // em barba-extra.js) — e continua subindo ja fora da largura real da
      // boca dai em diante.
      const p1 = Math.min(azCornerV * 0.90, 0.42)
      const p2 = Math.min(azFuroV * 1.10, 0.62)
      const jaw = byAz([
        [p1, thetaEmY(-0.116 * S)],
        [p2, thetaEmY(-0.078 * S)],
        [1.00, thetaEmY(-0.040 * S)],
        [1.46, thetaEmY(-0.004 * S)],
        [1.85, thetaEmY(-0.050 * S)],
        [2.20, FORA],
      ])
      const lo = (az) => Math.min(Math.PI, jaw(az))
      const hi = () => Math.PI

      const furo = furoBoca(X_FURO_V, 0.024 * S, 0.020 * S)
      const ma = tecelagem()
      faixaComFuro(ma, lo, hi, furo.cima, furo.baixo, -2.20, 2.20, 46, 9, 0.0034, 0.0015)
      g.add(sh(new THREE.Mesh(soldarNormais(ma.geo()), hairMat(tom))))

      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, lo, rnd, -2.18, 2.18, 76, 0.0048, 0.0040, 0.00100 * S, true)
      addFios(g, cor, maA, maB)

      // BIGODE largo, larguraX reduzido (1.65, contra 1.85 do mosqueteiro)
      // pra manter folga do maxilar que ja sobe alto nas laterais.
      const bOpts = { linhas: 7, cols: 32, larguraX: 1.65 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 6 PIRATA — BIGODE fino e reto (sem curlUp, sem reforco de queda: cai
  // naturalmente) + um patchQueixo minusculo do qual descem DUAS "trancas"
  // — cada uma 3 fios longos cujo eixo de curvatura gira por fio
  // (applyAxisAngle em torno de _tg) com sinal de curva alternado. O giro
  // relativo entre os tres fios de cada tranca e o que sugere entrelacado,
  // sem modelar uma trama de verdade (custaria caro demais pro orcamento de
  // 12 mil triangulos). Sem costeleta, sem queixo cheio.
  // -------------------------------------------------------------------------
  {
    id: 'pirata', nome: 'Pirata', name: 'Pirata',
    metodo: 'BIGODE fino e reto + patchQueixo minusculo com duas "trancas" descendo dele (3 fios longos por tranca, eixo de curvatura girado por fio pra sugerir entrelacado) — nada de costeleta nem de queixo cheio',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(6101 + (((ctx && ctx.cabeca) | 0) * 397))
      const g = new THREE.Group()

      const bOpts = { linhas: 6, cols: 24, larguraX: 1.20, compMul: 0.90 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)

      const maA = tecelagem(), maB = tecelagem()
      // azHalf: meiaLargura de 0.16 e mais estreita que 2*PI/18 (0.35 rad) de
      // espacamento entre colunas -- sem azHalf o patch colapsa achatado
      // (mesmo bug da mosca do imperial, ver regiao() no topo do arquivo).
      const casca = patchQueixo(cor, 0.16, -0.140 * S, { s: 1.022, wSeg: 18, hSeg: 8, azHalf: 0.22 }, rnd, maA, maB, 0.16)
      g.add(casca)
      addFios(g, cor, maA, maB)

      // TRANCAS: duas raizes perto do centro do queixo. `_dir` leva bem mais
      // NORMAL (0.45, era 0.20): rente a pele a tranca se perde contra o
      // colarinho, que fica logo abaixo do queixo neste boneco -- projetando
      // mais pra fora ela pendura no ar, destacada do corpo, antes de cair.
      const maT = tecelagem()
      for (const sgn of [-1, 1]) {
        const az = sgn * 0.095
        const theta = thetaEmY(-0.148 * S)
        pontoNaPele(theta, az, 0.0014, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize()
        for (let f = 0; f < 3; f++) {
          _hx.copy(_p).addScaledVector(_lat, (f - 1) * 0.0026)
          _dir.copy(_tg).multiplyScalar(0.75).addScaledVector(_n, 0.45).normalize()
          _eixo.copy(_lat).applyAxisAngle(_tg, f * 2.05)
          const curva = f % 2 === 0 ? 0.85 : -0.85
          fio(maT, _hx, _dir, 0.032 * S, 0.00115 * S, _eixo, curva, 8, 3)
        }
      }
      if (!maT.vazia) g.add(pelo(new THREE.Mesh(maT.geo(), peloMat(cor, 1))))
      return g
    },
  },
]
