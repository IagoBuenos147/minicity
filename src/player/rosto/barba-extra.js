import * as THREE from 'three'
import {
  HEAD_S, HEAD, clamp, mix, smoothstep, rng, shade, mixHex, skinOf,
  useHead, activeHead, eggSurface, pontoNaPele,
  headShell, byAz, peloMat, tecelagem, fio, beardColorFrom, soldarNormais,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/barba-extra.js — DOZE BARBAS, a metade de cima de um
// cartaz "Barber's Guide to 24 Beard Styles" que o dono do projeto mandou de
// referencia: por fazer, curta aparada, cortina, costeletas, cavanhaque, Van
// Dyke, ancora, Balbo, mosca, Zappa, bigode guidao e circular.
//
// Doze pecas e nao doze geometrias inventadas do zero: o que MUDA de uma
// barba real pra outra e sempre a mesma coisa — ONDE tem pelo e ONDE nao tem
// (a silhueta) — raramente o METODO de desenhar o pelo em si. Por isso este
// arquivo e um kit de QUATRO ferramentas reaproveitadas doze vezes, cada
// barba so escolhendo os parametros (largura, altura, se liga ou nao):
//
//   REGIAO   casca (headShell) que preenche de uma linha lo(az) ATE O POLO DO
//            QUEIXO. Pra qualquer barba que "cobre a bochecha/queixo inteiro
//            abaixo de tal altura" — por fazer, curta aparada, e o queixo do
//            cavanhaque/Van Dyke/ancora/Balbo/circular. E o metodo da
//            'aparada' de barba.js, so que a linha muda de forma e de janela
//            de azimute.
//
//   FAIXA    casca com DUAS linhas, lo(az) e hi(az), que NAO chega no polo —
//            uma BANDA. Pra barba que e um traco, nao uma massa: a cortina no
//            maxilar, as costeletas, a mosca. As duas linhas CONVERGEM pro
//            mesmo valor onde a banda deve desaparecer (a largura vai a zero
//            sozinha, sem precisar da sentinela FORA que a REGIAO usa pra
//            colapsar no polo).
//
//   FRANJA   fios curtos plantados sobre uma linha de corte, pra tirar a
//            leitura de "aresta de plastico" de toda REGIAO/FAIXA — a mesma
//            tecnica da 'aparada' de barba.js, so generalizada pra aceitar
//            QUALQUER linha lo(az) e QUALQUER janela de azimute (a cortina
//            usa nela duas vezes, uma por borda; as costeletas duas vezes,
//            uma por lado, com um vao no meio pra nao nascer pelo na bochecha
//            onde a banda ja fechou).
//
//   BIGODE   a grade de ~200-300 fios plantados na normal da pele e vergados
//            pra fora e pra baixo, extraida quase linha por linha do catalogo
//            'bigode' de barba.js — SEIS das doze pecas daqui usam bigode
//            (Van Dyke, ancora, Balbo, Zappa, guidao, circular), e repetir o
//            penteado seis vezes e o que criaria bigodes inconsistentes entre
//            si, nao reusa-lo com uns poucos parametros (largura, queda,
//            curva-pra-cima).
//
// A REGRA DE OURO, repetida no pedido: duas barbas que so diferem 2 mm nao
// contam como duas. Por isso cada entrada aqui muda a REGIAO OCUPADA — cheio
// vs vazio em bochecha/queixo/buco/lateral — nunca so o comprimento do pelo.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da boca (tabela do CONTRATO). Mesma referencia de barba.js. */
const Y_BOCA = -0.082 * S

/** Meia largura da boca em METROS — ver a mesma constante em barba.js. */
const X_BOCA = 0.047

/**
 * Sentinela de "aqui nao tem barba" pro metodo REGIAO: theta acima de PI nao
 * existe, entao Math.min(PI, ...) colapsa o vertice no polo do queixo e a
 * peca some naquele azimute. Identica a de barba.js — ver o comentario la
 * pra a explicacao completa de por que precisa do Math.min e nao so do
 * numero grande.
 */
const FORA = 3.30

/**
 * theta (0 = topo, PI = queixo) da altura y NO CRANIO ATIVO. Inverso de
 * yAt(): copiada de barba.js porque nao e exportada de la (cada modulo de
 * rosto que precisa dela carrega a propria copia — sao 4 linhas, nao vale a
 * pena promover pra nucleo.js por causa de um helper desta forma).
 */
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

/** |x| da pele em (theta, az). Mesma formula de barba.js. */
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

/**
 * Empurra a casca ao longo da propria normal por fracao de milimetro de
 * senoide, pra ela nao ler como capacete de plastico liso. Ver o comentario
 * completo em barba.js — mesma tecnica, mesma amplitude.
 */
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
 * REGIAO: casca que preenche de lo(az) ATE O POLO DO QUEIXO (t1 = PI).
 * `t0` precisa ficar ACIMA (theta menor) do ponto mais alto de `lo` em
 * QUALQUER cranio — melhor garantir isso comparando ALTURAS (y) antes de
 * converter, ja que thetaEmY e monotona: uma altura maior que a maior altura
 * usada em `lo` da sempre um t0 menor que `lo`, em qualquer cabeca, sem
 * precisar medir os 6 craniuns na mao.
 */
function regiao(cor, lo, t0, s, wSeg, hSeg) {
  const m = headShell(cor, { s, t0, t1: Math.PI, lo, wSeg, hSeg })
  rugoso(m.geometry, 0.0013)
  return m
}

/**
 * FAIXA: casca entre lo(az) e hi(az) — NAO chega no polo. Pra virar uma banda
 * que desliga sozinha, `lo` e `hi` tem que CONVERGIR pro mesmo valor no
 * azimute onde a peca deve sumir (largura zero ali, sem sentinela nenhuma).
 *
 * `azHalf` e um escape hatch OPCIONAL pra quando `lo`/`hi` NAO convergem
 * sozinhos fora da janela pretendida (por exemplo, formulas copiadas de uma
 * peca de barba.js que ja contava com essa restricao) — restringe a esfera
 * bruta aquele meio-angulo em volta da FRENTE (az=0), do jeito que
 * `headShell` ja faz internamente. Sem ela nesse caso a peca "vaza" e vira um
 * anel dando a volta inteira na cabeca em vez de ficar so na frente — foi
 * exatamente o bug do buco da stubble/boxed-curta (elas tapavam a boca
 * porque o buco delas virou um anel na altura do labio em vez de um remendo
 * pequeno).
 */
function faixa(cor, lo, hi, t0, t1, s, wSeg, hSeg, azHalf) {
  const m = headShell(cor, { s, t0, t1, lo, hi, wSeg, hSeg, azHalf })
  rugoso(m.geometry, 0.0011)
  return m
}

/**
 * FRANJA: fios curtos sobre uma linha de corte `linha(az)`, entre azMin e
 * azMax. Generalizacao do loop de franja da 'aparada' (barba.js) — mesmos
 * pesos de direcao (0.70 normal / 0.60ish tangente / 0.30 lateral), so que
 * parametrizada em vez de escrita na mao pra cada borda.
 * `desce` inverte o sinal da componente tangente: borda de CIMA de uma faixa
 * (pelo nascendo e caindo pra dentro dela) usa true; borda de BAIXO, quando
 * se quer o fio abrindo pra fora em vez de fechando pra dentro, usa false.
 */
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

/**
 * PATCH DE QUEIXO: uma REGIAO pequena, restrita a uma janela estreita de
 * azimute, com a propria franja na borda. O corpo comum do cavanhaque, do
 * queixo do Van Dyke, da ancora, do Balbo e do circular — so a meia-largura e
 * a altura do topo mudam entre eles.
 */
function patchQueixo(cor, meiaLargura, yTopo, opts, rnd, maA, maB, azFranja) {
  const lo = byAz([
    [0.00, thetaEmY(yTopo)],
    [meiaLargura * 0.72, thetaEmY(yTopo - 0.006 * S)],
    [meiaLargura, FORA],
  ])
  const linha = (az) => Math.min(Math.PI, lo(az))
  const casca = regiao(
    shade(cor, 1.05), linha, thetaEmY(yTopo + 0.035 * S),
    opts.s || 1.028, opts.wSeg || 40, opts.hSeg || 16,
  )
  franjaBorda(
    maA, maB, linha, rnd, -azFranja, azFranja, opts.n || 46,
    opts.c0 || 0.0052, opts.c1 || 0.0044, (opts.raio || 0.00100) * S, true,
  )
  return casca
}

/**
 * BIGODE: grade de fios plantados na normal da pele e vergados pra fora e pra
 * baixo, extraida do catalogo 'bigode' de barba.js (mesmo penteado, mesmas
 * anchoras Y_TOPO/Y_BASE) com tres alavancas novas:
 *
 *   larguraX  multiplica a largura alvo (em multiplos de X_BOCA)
 *   quedaMul  multiplica o quanto a ponta cai — Zappa usa > 1, Van Dyke < 1
 *             pra garantir vao acima do cavanhaque
 *   compMul   multiplica o comprimento final — so o Zappa usa > 1 (bigode
 *             fu-manchu tem que ser visivelmente mais comprido)
 *   curlUp    0..1: reduz a queda na ponta e soma componente de normal, pra
 *             a ponta perder a curva pra baixo do penteado padrao — a base
 *             do guidao. O cacho fechado de verdade e plantado a parte (ver
 *             'bigode-guidao' mais abaixo), isto aqui so tira a queda.
 *
 * CONSERTO (pedido do dono: "mais cabelo e sem tanto espaco pra pele, mais
 * pelo preto" — os seis bigodes liam CINZA porque a grade era rala demais e
 * a pele aparecia entre os fios). Tres mudancas, as tres baratas em
 * triangulo (nenhuma mexe em aneis/colunas do tubo, que e o que pesa):
 *   1. cols +15%: mais fio na MESMA largura, menos vao horizontal entre
 *      colunas vizinhas — o vao e o que mais le como pele.
 *   2. raio da base +27% (0.00150 -> 0.00190 * S): fio mais GROSSO cobre
 *      mais area de tela sem custar um triangulo a mais.
 *   3. falha 0.05 -> 0.025: metade das celulas vazias de antes.
 * A cor mais escura ("mais pelo preto") e a casca de fundo que tapa o resto
 * do vao ficam em bigodeBase() (logo abaixo) e no addFios() de cada chamador
 * — nao aqui dentro, porque esta funcao so planta POSICAO de fio, nunca viu
 * a cor (ver o comentario do proprio arquivo: cor entra so no addFios).
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

/**
 * BASE DO BIGODE: casca fina e escurecida por baixo do MIOLO da grade de
 * fio — o resto do conserto pedido pelo dono. Por mais densa que a grade
 * fique, algum angulo de camera sempre acha uma frincha de pele entre dois
 * fios vizinhos; a casca tapa essa frincha por tras.
 *
 * meiaLarguraCasca fica em 0.50x AZ_MAX — por DENTRO da fileira mais
 * ESTREITA da propria grade (a de cima, ft=0, que para em 0.52x AZ_MAX, ver
 * `meiaLargura` em bigode() acima). De proposito conservador: e melhor a
 * casca ficar encolhida por dentro dos fios em toda fileira do que aparecer
 * como uma nadadeira escura por fora deles numa fileira mais curta.
 *
 * shade(cor, 0.60) e bem mais escuro que a cor cheia dos fios: esta casca so
 * aparece NOS VAOS entre fio, nunca por cima de um fio inteiro — com a cor
 * cheia ela competiria com o fio em vez de servir de sombra atras dele
 * (mesma logica do manto escurecido da barba 'cheia' em barba.js).
 */
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

/** Adiciona ao grupo os 2 ou 3 acumuladores de tecelagem que nao ficaram vazios. */
function addFios(g, cor, ...mas) {
  const tons = [0, 2, 1]
  mas.forEach((ma, i) => { if (!ma.vazia) g.add(pelo(new THREE.Mesh(ma.geo(), peloMat(cor, tons[i] !== undefined ? tons[i] : i)))) })
}

export const BARBAS_EXTRA = [
  // -------------------------------------------------------------------------
  // 1 POR FAZER (stubble) — REGIAO rasissima e escurecida + pontinhos pela
  // superficie toda. Nao tem franja de borda de proposito: barba de 3 dias
  // nao tem contorno vivo, ela e uma SOMBRA GRANULADA — e a franja desenharia
  // um contorno que a stubble de verdade nao tem.
  // -------------------------------------------------------------------------
  {
    id: 'stubble', nome: 'Por fazer', name: 'Por fazer',
    metodo: 'casca headShell rasissima (s=1.008) misturada com o tom de PELE via mixHex pra ler como sombra rala (nao com a cor cheia da barba), linha de corte ancorada no canto real da boca pra deixar o vao do labio, com ~280 pontinhos de fio espalhados pela superficie toda',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4111 + (((ctx && ctx.cabeca) | 0) * 151))
      const g = new THREE.Group()
      // MISTURADA COM A PELE, nao escurecida: barba de 3 dias e uma sombra
      // RALA, sempre mais clara que uma barba cheia da mesma cor — shade()
      // com mul<1 ia na direcao errada (escurecia). mixHex(pele,cor,0.32)
      // deixa a casca quase do tom da pele, com so um tico da cor da barba.
      const pele = skinOf(ctx)
      const tom = mixHex(pele, cor, 0.32)

      const thBoca = thetaEmY(Y_BOCA)
      const azCanto = azEmX(thBoca, X_BOCA)
      const azFim = azEmX(thBoca, X_BOCA * 1.45)
      // Os dois primeiros pontos ANCORADOS em azCanto (o canto real da boca
      // NESTE cranio), do jeito que a 'aparada' de barba.js faz: o primeiro
      // fica DENTRO do canto (y bem abaixo da boca, deixa o vao do labio) e
      // o segundo fica LOGO DEPOIS do canto (so ali a linha pode subir).
      // Antes estes dois pontos eram az fixo (0.42/0.62) sem relacao com o
      // canto de verdade, entao em varios craniuns a subida acontecia AINDA
      // DENTRO da largura da boca e a stubble tapava o labio.
      const base = byAz([
        [Math.min(azCanto * 0.92, 0.44), thetaEmY(-0.098 * S)],
        [Math.min(azCanto * 1.35, 0.60), thetaEmY(-0.068 * S)],
        [0.95, thetaEmY(-0.048 * S)],
        [1.32, thetaEmY(-0.020 * S)],
        [1.70, thetaEmY(-0.032 * S)],
        [2.05, thetaEmY(-0.116 * S)],
        [2.34, FORA],
      ])
      const linha = (az) => Math.min(Math.PI, base(az))
      const casca = regiao(tom, linha, 1.50, 1.008, 60, 20)
      g.add(casca)

      // azHalf = azFim+0.04 restringe o buco a uma janela em volta da FRENTE
      // -- sem isso loBuco/hiBuco (que so foram desenhadas pensando na regiao
      // do buco) nao convergem fora dali e o remendo vira um ANEL na altura
      // do labio dando a volta na cabeca inteira, que era o bug: a stubble
      // tapava a boca porque tinha uma casca extra bem em cima dela.
      const yBucoTopo = -0.040 * S
      const loBuco = (az) => thetaEmY(mix(yBucoTopo, -0.074 * S, smoothstep(0.10, azFim, az < 0 ? -az : az)))
      const hiBuco = () => thetaEmY(-0.070 * S)
      const buco = faixa(tom, loBuco, hiBuco, thetaEmY(-0.012 * S), thetaEmY(-0.100 * S), 1.011, 26, 8, azFim + 0.04)
      g.add(buco)

      // PONTINHOS: fio quase-puntiforme (3 aneis, comprimento ~1mm) espalhado
      // por sorteio uniforme na regiao toda, nao so na borda -- e a diferenca
      // entre "sombra de barba por fazer" e "contorno de barba desenhada".
      const ma = tecelagem()
      for (let k = 0; k < 280; k++) {
        const az = -2.3 + 4.6 * rnd()
        const th0 = linha(az)
        if (th0 > Math.PI - 0.06) continue
        const theta = mix(th0 + 0.006, Math.PI - 0.10, rnd())
        pontoNaPele(theta, az, 0.0009, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize()
        _dir.copy(_n).multiplyScalar(0.85).addScaledVector(_tg, -0.20)
          .addScaledVector(_lat, (rnd() - 0.5) * 0.3).normalize()
        _eixo.crossVectors(_dir, _n).normalize()
        fio(ma, _p, _dir, (0.0009 + 0.0007 * rnd()) * S, 0.0007 * S, _eixo, 0.15, 3, 3)
      }
      addFios(g, cor, ma)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 2 CURTA APARADA (boxed) — mesmo metodo da 'aparada' de barba.js (REGIAO +
  // franja), mas a linha de corte fica ALTA e QUASE RETA (mordida fraca) em
  // vez de mergulhar perto da boca — o corte "de maquina" que separa um boxed
  // beard de uma barba cheia crescida a esmo.
  // -------------------------------------------------------------------------
  {
    id: 'boxed-curta', nome: 'Curta aparada', name: 'Curta aparada',
    metodo: 'casca headShell (REGIAO) com linha de corte alta e quase reta (mordida fraca) + franja de fios na borda inteira e no buco -- o contorno reto e o que separa do corte natural da aparada classica',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4231 + (((ctx && ctx.cabeca) | 0) * 173))
      const g = new THREE.Group()
      const tom = shade(cor, 1.05)

      const thBoca = thetaEmY(Y_BOCA)
      const azCanto = azEmX(thBoca, X_BOCA)
      const azFim = azEmX(thBoca, X_BOCA * 1.45)
      // Mesmo conserto da stubble: os dois primeiros pontos ANCORADOS em
      // azCanto (canto real da boca neste cranio) em vez de az fixo, senao a
      // linha "alta e reta" comeca a subir AINDA DENTRO da largura da boca em
      // varios craniuns e o corte quadrado tapa o labio. O primeiro ponto
      // continua bem abaixo da boca (vao do labio); so DEPOIS do canto a
      // linha sobe de vez pro patamar alto que da o nome "curta aparada".
      const base = byAz([
        [Math.min(azCanto * 0.92, 0.44), thetaEmY(-0.094 * S)],
        [Math.min(azCanto * 1.35, 0.60), thetaEmY(-0.042 * S)],
        [1.30, thetaEmY(-0.038 * S)],
        [1.86, thetaEmY(-0.050 * S)],
        [2.20, thetaEmY(-0.128 * S)],
        [2.46, FORA],
      ])
      const linha = (az) => {
        const gT = smoothstep(0.30, 0.78, az < 0 ? -az : az)
        return Math.min(Math.PI, base(az) + gT * (0.014 * Math.sin(az * 6.1 + 0.6) + 0.008 * Math.sin(az * 11.7 - 1.3)))
      }
      const casca = regiao(tom, linha, 1.46, 1.030, 72, 24)
      g.add(casca)

      const yBucoTopo = -0.038 * S
      const loBuco = (az) => {
        const a = az < 0 ? -az : az
        return thetaEmY(mix(yBucoTopo, -0.074 * S, smoothstep(0.16 * azFim / 0.54, azFim, a))) + 0.008 * Math.sin(az * 8.7 + 1.1)
      }
      const hiBuco = (az) => {
        const forA = smoothstep(X_BOCA * 0.95, X_BOCA * 1.30, xEmAz(thBoca, az))
        const a = az < 0 ? -az : az
        const y = mix(-0.070 * S, -0.092 * S, forA)
        return thetaEmY(mix(y, -0.074 * S, smoothstep(azFim * 0.78, azFim, a)))
      }
      // azHalf: mesma razao da stubble -- sem restringir a janela pra frente
      // do rosto, loBuco/hiBuco nao convergem la atras e o buco vira um anel
      // na altura do labio dando a volta na cabeca, tapando a boca.
      const buco = faixa(tom, loBuco, hiBuco, thetaEmY(-0.012 * S), thetaEmY(-0.100 * S), 1.032, 26, 9, azFim + 0.04)
      g.add(buco)

      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, linha, rnd, -2.30, 2.30, 92, 0.0052, 0.0044, 0.00100 * S, true)
      franjaBorda(maA, maB, loBuco, rnd, -azFim, azFim, 26, 0.0034, 0.0026, 0.00090 * S, true)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 3 CORTINA — FAIXA seguindo o contorno do maxilar de patilha a patilha,
  // sem bigode. A banda alarga perto da frente (cobre a ponta do queixo por
  // baixo) e afina nas laterais (so risca o maxilar) -- as duas linhas
  // convergem sozinhas nas pontas, sem precisar de sentinela.
  // -------------------------------------------------------------------------
  {
    id: 'cortina-queixo', nome: 'Cortina', name: 'Cortina',
    metodo: 'FAIXA (headShell com lo E hi) seguindo o contorno do maxilar de patilha a patilha, sem bigode -- larga na frente (cobre a ponta do queixo), estreita nas laterais',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4349 + (((ctx && ctx.cabeca) | 0) * 191))
      const g = new THREE.Group()
      const tom = shade(cor, 1.03)

      // CONTORNO DO MAXILAR — NAO e a tabela da 'cheia' de barba.js (essa
      // primeira versao copiou de la e foi o bug: 'cheia' sobe DE PROPOSITO
      // ate a maca do rosto porque e uma barba cheia que cobre a bochecha
      // inteira). Uma cortina segue so o OSSO DA MANDIBULA, que fica bem
      // mais baixo -- por isso todo ponto aqui fica a pelo menos ~1.5 cm
      // abaixo da boca (Y_BOCA = -0.082*S), mesmo no ponto mais alto (perto
      // da orelha, az=1.55). Sem excursao nenhuma pro territorio da bochecha.
      // TERCEIRO AJUSTE: a linha subiu 1.5 cm na frente. Com ela em -0.150*S a
      // faixa caia POR BAIXO do queixo, e de frente — que e o enquadramento do
      // card do customizador — sobrava so uma sombra. Em -0.135*S ela sobe pra
      // aresta do maxilar, que e onde uma chin curtain de verdade fica e onde
      // ela aparece. Continua 2.6 cm abaixo da boca (Y_BOCA = -0.082*S).
      const jaw = byAz([
        [0.00, thetaEmY(-0.135 * S)],
        [0.55, thetaEmY(-0.128 * S)],
        [1.05, thetaEmY(-0.108 * S)],
        [1.55, thetaEmY(-0.092 * S)],
        [2.00, thetaEmY(-0.108 * S)],
        [2.34, thetaEmY(-0.175 * S)],
      ])
      const lo = (az) => jaw(az)
      // LARGURA: a primeira versao (0.40 / 0.12) subia ate a maca do rosto e
      // tapava a boca; a segunda (0.22 / 0.075) corrigiu isso mas ficou uma
      // risca que sumia no card do customizador. 0.30 na frente ainda deixa
      // ~4 cm de folga abaixo da boca em qualquer cranio (0.30 rad de theta
      // valem uns 5 cm de Y perto do queixo) e da a faixa que uma chin curtain
      // tem que ter.
      const hi = (az) => {
        const a = az < 0 ? -az : az
        const largura = mix(0.40, 0.18, smoothstep(0, 1.60, a))
        const desliga = smoothstep(2.20, 2.34, a)
        return jaw(az) + largura * (1 - desliga)
      }
      // t0 acima (Y maior que) o ponto mais alto de `jaw` (-0.095*S, em
      // az=1.55) em QUALQUER cranio -- monotonia de thetaEmY garante isso sem
      // precisar medir os 6 craniuns.
      const t0 = thetaEmY(-0.055 * S)
      const casca = faixa(tom, lo, hi, t0, Math.PI, 1.026, 72, 18)
      g.add(casca)

      // franja mais rala que a das outras pecas: a FAIXA ja tem duas bordas
      // (cima e baixo) rendendo fio, e as duas juntas passariam do orcamento
      // de 12 mil triangulos se usassem a mesma densidade de uma borda so.
      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, lo, rnd, -2.30, 2.30, 64, 0.0058, 0.0048, 0.00105 * S, true)
      franjaBorda(maA, maB, hi, rnd, -2.30, 2.30, 52, 0.0040, 0.0034, 0.00095 * S, false)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 4 COSTELETAS — duas FAIXAS laterais (uma casca so, simetrica por causa do
  // |az| do byAz) da altura da tempora ate o angulo do maxilar. `loSb` e
  // `hiSb` convergem no MESMO valor (thBase) fora da janela lateral -- por
  // isso nao tem sentinela FORA aqui, so uma janela que abre e fecha.
  // -------------------------------------------------------------------------
  {
    id: 'costeletas', nome: 'Costeletas', name: 'Costeletas',
    metodo: 'FAIXA lateral (headShell com lo e hi convergindo fora de uma janela de azimute) da tempora ate o angulo do maxilar -- nada no queixo nem no buco',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4463 + (((ctx && ctx.cabeca) | 0) * 211))
      const g = new THREE.Group()
      const tom = shade(cor, 1.02)

      const TOPO_Y = 0.095 * S
      const BASE_Y = -0.055 * S
      const thTopo = thetaEmY(TOPO_Y)
      const thBase = thetaEmY(BASE_Y)
      const janela = (az) => {
        const a = az < 0 ? -az : az
        return smoothstep(0.82, 1.02, a) * (1 - smoothstep(1.95, 2.15, a))
      }
      const loSb = (az) => mix(thBase, thTopo, janela(az))
      const hiSb = () => thBase
      const casca = faixa(tom, loSb, hiSb, thTopo - 0.02, thBase + 0.02, 1.024, 48, 20)
      g.add(casca)

      // A franja e plantada SO na janela aberta (0.86..2.05 e o espelho): em
      // vez de varrer -2.05..2.05 inteiro, o que espalharia pelo solto na
      // bochecha onde a faixa ja fechou largura zero.
      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, loSb, rnd, 0.86, 2.05, 30, 0.0060, 0.0050, 0.00100 * S, true)
      franjaBorda(maA, maB, loSb, rnd, -2.05, -0.86, 30, 0.0060, 0.0050, 0.00100 * S, true)
      franjaBorda(maA, maB, hiSb, rnd, 0.86, 2.05, 22, 0.0038, 0.0030, 0.00090 * S, true)
      franjaBorda(maA, maB, hiSb, rnd, -2.05, -0.86, 22, 0.0038, 0.0030, 0.00090 * S, true)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 5 CAVANHAQUE — so um patchQueixo estreito. Sem bigode, sem pegar a
  // bochecha: a janela de azimute fecha bem antes do canto da boca.
  // -------------------------------------------------------------------------
  {
    id: 'cavanhaque', nome: 'Cavanhaque', name: 'Cavanhaque',
    metodo: 'patchQueixo (REGIAO estreita ate o polo do queixo + franja na borda) numa janela curta de azimute -- sem bigode, sem bochecha',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4583 + (((ctx && ctx.cabeca) | 0) * 227))
      const g = new THREE.Group()
      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.56, -0.120 * S, { s: 1.030, wSeg: 40, hSeg: 16 }, rnd, maA, maB, 0.56)
      g.add(casca)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 6 VAN DYKE — BIGODE (grade de fios) + patchQueixo, com um vao de pele
  // deliberado entre os dois: nenhuma geometria liga um ao outro. yBase do
  // bigode fica no padrao (a queda maxima nao passa de -0.084*S) e o
  // cavanhaque so comeca em -0.128*S -- ~4 cm de pele nua entre eles em
  // qualquer um dos 6 craniuns (conferido: a folga minima medida foi de mais
  // de 0.35 rad de theta, bem acima do que qualquer variacao de cranio come).
  // -------------------------------------------------------------------------
  {
    id: 'van-dyke', nome: 'Van Dyke', name: 'Van Dyke',
    metodo: 'BIGODE em grade de fios + patchQueixo, com vao de pele deliberado entre os dois -- nenhuma geometria liga um ao outro',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4691 + (((ctx && ctx.cabeca) | 0) * 239))
      const g = new THREE.Group()
      const bOpts = { linhas: 7, cols: 30 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)
      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.50, -0.128 * S, { s: 1.028, wSeg: 36, hSeg: 14 }, rnd, maA, maB, 0.50)
      g.add(casca)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 7 ANCORA — bigode inteiro (sem vao no meio, ao contrario do Van Dyke) +
  // um RISCO CENTRAL fino (5 colunas bem juntas de fio, o "cabo" da ancora)
  // descendo do bigode ate um patchQueixo mais largo (as "hastes"). E o
  // risco que faz a peca ler como ancora e nao como Van Dyke com queixo
  // maior — sem ele e so mais um cavanhaque separado.
  // -------------------------------------------------------------------------
  {
    id: 'ancora', nome: 'Ancora', name: 'Ancora',
    metodo: 'BIGODE inteiro ligado a um patchQueixo por uma tira fina de 5 colunas de fio no centro (o risco/cabo da ancora) -- as tres pecas juntas desenham a forma',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4801 + (((ctx && ctx.cabeca) | 0) * 251))
      const g = new THREE.Group()
      const bOpts = { linhas: 7, cols: 30 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)

      // RISCO CENTRAL: tira estreita (5 colunas, so 2 cm de largura) descendo
      // do meio do bigode ate a faixa do queixo. Estreita de proposito -- e
      // o "cabo" da ancora, tem que ler como risco e nao como barba.
      for (let f = 0; f < 5; f++) {
        const az = (f - 2) * 0.020
        for (let r = 0; r < 3; r++) {
          const y = mix(-0.080 * S, -0.118 * S, r / 2)
          const theta = thetaEmY(y)
          pontoNaPele(theta, az, 0.0012, _p, _n)
          descidaNaPele(theta, az, _tg)
          _dir.copy(_n).multiplyScalar(0.55).addScaledVector(_tg, -0.80).normalize()
          _eixo.crossVectors(_dir, _n).normalize()
          fio(mas[1], _p, _dir, 0.0075 * S, 0.00090 * S, _eixo, 0.15)
        }
      }
      addFios(g, shade(cor, 0.80), ...mas)

      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.62, -0.128 * S, { s: 1.026, wSeg: 44, hSeg: 14 }, rnd, maA, maB, 0.62)
      g.add(casca)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 8 BALBO — BIGODE separado + patchQueixo LARGO (meia-largura quase o
  // dobro do Van Dyke), mas sem subir ate a tempora -- e a largura no queixo
  // que distingue do Van Dyke, o vao acima garante que nao vira circular.
  // -------------------------------------------------------------------------
  {
    id: 'balbo', nome: 'Balbo', name: 'Balbo',
    metodo: 'BIGODE separado + patchQueixo bem mais largo que o do Van Dyke, sem costeleta -- a janela de azimute do patch fecha antes da tempora',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(4919 + (((ctx && ctx.cabeca) | 0) * 263))
      const g = new THREE.Group()
      const bOpts = { linhas: 7, cols: 30 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)
      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.92, -0.122 * S, { s: 1.028, wSeg: 56, hSeg: 16 }, rnd, maA, maB, 0.92)
      g.add(casca)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 9 MOSCA (petit goatee) — FAIXA minuscula, janela de meio grau de largura,
  // que nem chega no polo do queixo (fica so entre o labio e o meio do
  // queixo). A menor peca do arquivo de proposito -- e uma pincelada, nao um
  // cavanhaque.
  // -------------------------------------------------------------------------
  {
    id: 'cavanhaque-mini', nome: 'Mosca', name: 'Mosca',
    metodo: 'FAIXA minuscula (headShell com lo e hi bem proximos, janela de az +-0.14) so embaixo do labio -- nao chega no queixo nem nas laterais',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5033 + (((ctx && ctx.cabeca) | 0) * 281))
      const g = new THREE.Group()
      const tom = shade(cor, 1.05)
      const yTopo = -0.100 * S, yBase = -0.118 * S
      const janela = (az) => 1 - smoothstep(0.06, 0.14, az < 0 ? -az : az)
      const thTopo = thetaEmY(yTopo), thBase = thetaEmY(yBase)
      const loM = (az) => mix(thBase, thTopo, janela(az))
      const hiM = () => thBase
      const casca = faixa(tom, loM, hiM, thTopo - 0.02, thBase + 0.02, 1.030, 20, 8)
      g.add(casca)
      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, loM, rnd, -0.14, 0.14, 18, 0.0040, 0.0032, 0.00090 * S, true)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 10 ZAPPA — BIGODE denso e bem mais caido/comprido (quedaMul e compMul
  // reforcados) que o padrao, tipo fu-manchu, + a mesma mosca minuscula do
  // item anterior embaixo do labio.
  // -------------------------------------------------------------------------
  {
    id: 'zappa', nome: 'Zappa', name: 'Zappa',
    metodo: 'BIGODE denso com queda e comprimento reforcados (quedaMul 1.9, compMul 1.35) tipo fu-manchu + a mesma FAIXA minuscula de Mosca embaixo do labio',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5147 + (((ctx && ctx.cabeca) | 0) * 293))
      const g = new THREE.Group()
      const bOpts = { linhas: 9, cols: 36, quedaMul: 1.9, larguraX: 1.35, compMul: 1.35 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)

      const tom = shade(cor, 1.05)
      const yTopo = -0.100 * S, yBase = -0.120 * S
      const janela = (az) => 1 - smoothstep(0.06, 0.14, az < 0 ? -az : az)
      const thTopo = thetaEmY(yTopo), thBase = thetaEmY(yBase)
      const loM = (az) => mix(thBase, thTopo, janela(az))
      const hiM = () => thBase
      const casca = faixa(tom, loM, hiM, thTopo - 0.02, thBase + 0.02, 1.030, 20, 8)
      g.add(casca)
      const maA = tecelagem(), maB = tecelagem()
      franjaBorda(maA, maB, loM, rnd, -0.14, 0.14, 18, 0.0040, 0.0032, 0.00090 * S, true)
      addFios(g, cor, maA, maB)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 11 BIGODE GUIDAO (handlebar) — BIGODE com curlUp (a ponta perde a queda
  // padrao) + um punhado de fios extras plantados direto com fio(), com
  // curva forte (2.1 rad) em volta de um eixo lateral -- o cacho fechado nas
  // duas pontas que da o nome ao estilo.
  // -------------------------------------------------------------------------
  {
    id: 'bigode-guidao', nome: 'Bigode guidao', name: 'Bigode guidao',
    metodo: 'BIGODE em grade de fios com curlUp (ponta sem queda) + 5 fios extras por lado plantados com curva forte (2.1 rad) em espiral fechada na ponta',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5261 + (((ctx && ctx.cabeca) | 0) * 307))
      const g = new THREE.Group()
      const bOpts = { linhas: 9, cols: 38, curlUp: 0.9, larguraX: 1.75 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)

      const AZ_MAX = azEmX(thetaEmY(-0.064 * S), X_BOCA * 1.75)
      for (const sgn of [-1, 1]) {
        const az = sgn * AZ_MAX * 1.02
        const theta = thetaEmY(-0.070 * S)
        pontoNaPele(theta, az, 0.0014, _p, _n)
        descidaNaPele(theta, az, _tg)
        _lat.crossVectors(_n, _tg).normalize().multiplyScalar(sgn)
        _dir.copy(_lat).multiplyScalar(0.75).addScaledVector(_n, 0.55).addScaledVector(_tg, -0.15).normalize()
        _eixo.crossVectors(_tg, _n).normalize()
        for (let f = 0; f < 5; f++) {
          _hx.copy(_p).addScaledVector(_lat, f * 0.0016)
          fio(mas[f % 3], _hx, _dir, 0.0100 * S, 0.00110 * S, _eixo, 2.1, 7, 3)
        }
      }
      addFios(g, shade(cor, 0.80), ...mas)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 12 CIRCULAR — BIGODE inteiro + patchQueixo + duas tiras finas no canto da
  // boca ligando um ao outro. As quatro pecas juntas fecham o circulo em
  // volta da boca -- e o conector no canto que separa do Balbo (que e as
  // mesmas duas pecas SEM o conector).
  // -------------------------------------------------------------------------
  {
    id: 'circular', nome: 'Circular', name: 'Circular',
    metodo: 'BIGODE inteiro + patchQueixo + duas tiras finas de fio no canto da boca ligando os dois -- fecha o circulo em volta da boca',
    build(ctx) {
      useHead(ctx)
      const cor = beardColorFrom(ctx)
      const rnd = rng(5387 + (((ctx && ctx.cabeca) | 0) * 317))
      const g = new THREE.Group()
      const bOpts = { linhas: 7, cols: 30, larguraX: 1.30 }
      bigodeBase(g, cor, bOpts)
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      bigode(mas, rnd, bOpts)
      addFios(g, shade(cor, 0.80), ...mas)

      const maA = tecelagem(), maB = tecelagem()
      const casca = patchQueixo(cor, 0.62, -0.122 * S, { s: 1.026, wSeg: 44, hSeg: 14 }, rnd, maA, maB, 0.62)
      g.add(casca)

      // CONECTORES: duas tiras finas no canto da boca, ligando o bigode a
      // casca do queixo -- sem isso e so um Balbo com bigode mais estreito.
      const thBoca = thetaEmY(Y_BOCA)
      const azCanto = azEmX(thBoca, X_BOCA * 1.05)
      for (const sgn of [-1, 1]) {
        const az = sgn * azCanto
        for (let r = 0; r < 3; r++) {
          const y = mix(-0.078 * S, -0.118 * S, r / 2)
          const theta = thetaEmY(y)
          pontoNaPele(theta, az, 0.0012, _p, _n)
          descidaNaPele(theta, az, _tg)
          _dir.copy(_n).multiplyScalar(0.55).addScaledVector(_tg, -0.80).normalize()
          _eixo.crossVectors(_dir, _n).normalize()
          fio(maA, _p, _dir, 0.0070 * S, 0.00090 * S, _eixo, 0.15)
        }
      }
      addFios(g, cor, maA, maB)
      return g
    },
  },
]
