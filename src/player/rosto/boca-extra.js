import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import { HEAD_S, useHead, faceSpread, flatPiece, wrapToHead, rng } from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/boca-extra.js — DOZE BOCAS, QUATRO LEVAS DE ARTE.
//
// Duas rodadas foram recusadas antes destas, e cada recusa virou uma regra:
//
//   1. BOCAS COM VOLUME (sorriso com canto em bolota, fileira de dentes,
//      cavidade escavada com lingua). Peca com sombra propria ao lado de um
//      olho de contorno chapado vira objeto colado no rosto.
//      => A BOCA DESTE PERSONAGEM E LINHA, e nao escultura.
//   2. TRACOS FEITOS COM A FITA DA BOCA 'traco': "ficou parecendo um boneco".
//      A fita e uma LENTE — engrossa no meio e afina ate quase nada nas duas
//      pontas, de forma SIMETRICA. Isso funciona no 'traco', onde a linha e
//      quase reta e a lente le como o sulco de um labio fechado; mas com uma
//      curva forte por cima, barriga no meio mais dois bicos nos cantos e
//      exatamente o desenho da boca ENTALHADA de um boneco de ventriloquo.
//      => ESPESSURA SIMETRICA COM BICO NAS PONTAS NAO, nunca mais.
//
// O que sobrou depois das duas regras e uma caneta: espessura constante, ponta
// redonda. Com ela vieram as tres primeiras — RETA, ARCO DE CIRCULO e ANGULO.
//
// As tres seguintes nao mudam a forma, mudam A CANETA, e e nisso que elas sao
// novas de verdade:
//
//   PINCEL   a espessura varia AO LONGO do traco e de forma ASSIMETRICA (entra
//            fino, engrossa em 67% do caminho, levanta fino). E a assimetria
//            que separa "risco feito a mao" de "peca fresada" — a lente do
//            'traco' varia tambem, mas simetrica, e por isso le como entalhe
//   ONDA     a linha volta em vez de ir: uma onda inteira de seno. E a unica
//            com simetria de ROTACAO em vez de espelho, e a unica que le como
//            duvida
//   ARO      a curva FECHA. Todas as outras tem duas pontas e separam "em cima"
//            de "embaixo"; o aro nao tem ponta e separa "dentro" de "fora".
//            E a boca aberta feita so de linha, com a pele aparecendo dentro —
//            o oposto da cavidade escavada que foi recusada na rodada 1
//
// 3. AS SEIS PRIMEIRAS AINDA ERAM A MESMA MARCA: "vc ta so mudando o mesmo
//    traco para fazer outras bocas". E era verdade — todas sao UMA FITA ESCURA
//    CONTINUA deitada na pele. O que variou foi o CAMINHO (reta, arco, angulo,
//    onda, aro) e o PERFIL DE ESPESSURA (lente, constante, pincelada); o TIPO
//    DE MARCA nunca mudou, e e por isso que as seis parecem parentes por mais
//    diferente que seja a curva.
//    => VARIAR CAMINHO E ESPESSURA NAO E VARIAR A ARTE.
//
// As tres ultimas nao sao uma fita. Cada uma e um tipo de marca diferente:
//
//   HACHURA      a linha e feita de varios tracos CURTOS e soltos, com falha
//                entre eles. Marca de esboco a lapis, e nao de nanquim
//   DUPLO        sao DUAS linhas, nao uma. A informacao esta na relacao entre
//                elas — comprimento, peso e distancia
//   PONTILHADO   nao ha linha nenhuma: sao marcas REDONDAS separadas, e quem
//                fecha a boca e o olho de quem olha
//
// 4. A QUARTA LEVA e mais FINA (58% da espessura) e um pouco menor, e todas as
//    tres sao feitas de SEGMENTOS RETOS EMENDADOS — o que da identidade a cada
//    uma e o CANTO entre eles:
//
//   SERRILHADO  seis segmentos alternando: canto atras de canto, ritmo
//   COLCHETE    um traco longo com dois terminais VERTICAIS descendo nas pontas
//   PARTIDO     dois segmentos que nao se encontram — o canto virou VAO
//
//    Traco fino nao e so "a mesma boca menor": ele muda o que a boca AGUENTA.
//    Numa fita de 7 mm um cotovelo se dobra em cima de si mesmo e vira um no
//    (foi por isso que a boca de raiva precisou arredondar o vertice com
//    hipotenusa); com 4 mm o canto fecha limpo, e so por isso esta leva pode
//    existir.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da linha da boca. E a mesma de boca.js: as quatro tem que alinhar. */
const BOCA_Y = -0.082 * S

/** Marrom quase preto, o mesmo do traco. Preto puro le como furo na malha. */
const COR = 0x2a1a18

/** Espessura do risco. Uma so — e ela que faz as bocas de linha serem familia. */
const ESPESSURA = 0.0072 * S

/**
 * A espessura da quarta leva: 58% da outra. Traco fino nao e so "a mesma boca
 * menor" — ele muda o que a boca AGUENTA. Numa fita de 7 mm um cotovelo se
 * dobra em cima de si mesmo e vira um no (foi por isso que a boca de raiva
 * precisou arredondar o vertice com hipotenusa); com 4 mm o canto fecha limpo,
 * e por isso as tres desta leva podem ser feitas de segmentos emendados.
 */
const FINO = 0.0042 * S

/**
 * RISCO DE ESPESSURA CONSTANTE, com ponta redonda nas duas extremidades.
 *
 * `linhaDeCentro(u)` devolve a altura y da linha em u = -1..1 (o eixo X vai de
 * -meia a +meia). O resto e maquinario:
 *
 *   - a NORMAL da linha sai da derivada, e nao de (0,1): medida na vertical, a
 *     espessura de um arco fica ate 20% maior nas pontas — e a "espessura
 *     constante" deixa de ser constante justamente onde o olho vai olhar;
 *   - a PONTA REDONDA usa as mesmas estacoes, avancando o centro por
 *     sen(a) * raio e encolhendo a meia-espessura por cos(a). Nao precisa de
 *     leque nem de geometria separada: e o mesmo laco;
 *   - a estacao final para em cos(1.476) e nao em cos(PI/2). Zerar a espessura
 *     de vez cria triangulo degenerado, e vertice degenerado sai com normal
 *     (0,0,0) — que na tela e uma mancha preta na ponta da boca;
 *   - dois niveis de profundidade (0 e ALT) porque uma folha de espessura zero
 *     DESAPARECE em angulo raso e abre o vao entre ela e a pele.
 */
function risco(meia, linhaDeCentro, larguraEm, centroX) {
  const MEIA = meia * faceSpread()
  // `centroX` desloca o risco inteiro no eixo X. Sem ele todo risco nasce
  // centrado na cara, e a hachura e o pontilhado precisam plantar varias marcas
  // curtas em posicoes diferentes ao longo da boca.
  const CX = (centroX || 0) * faceSpread()
  // `larguraEm(u)` e opcional. Sem ela o risco tem espessura constante, que e o
  // padrao das tres primeiras. Com ela nasce a PINCELADA, que e outra arte.
  const meiaLarg = larguraEm || (() => ESPESSURA * 0.5)
  const ALT = 0.0010 * S      // o quanto o risco levanta da pele
  const PAD = 0.0015 * S      // folga anti z-fighting contra a casca da cabeca
  // ESTACOES PROPORCIONAIS AO COMPRIMENTO, e nao um numero fixo. Um risco de
  // 9 cm precisa de ~34 pra acompanhar a curva do rosto sem afundar nela; um
  // pingo de 5 mm precisa de 2, e com 34 ele custa 350 triangulos pra desenhar
  // um ponto — o pontilhado inteiro passava de 3 mil.
  const N = Math.max(2, Math.min(34, Math.round(MEIA / (0.0018 * S))))
  const NC = 5                // estacoes por ponta redonda
  const A_FIM = 1.476         // ~0.94 * PI/2: onde a ponta para de encolher

  const pos = []
  const idx = []
  const put = (x, y, z) => { pos.push(x, y, z); return pos.length / 3 - 1 }
  const quad = (a, b, c, d) => { idx.push(a, b, c, a, c, d) }

  /** Ponto, tangente e normal da linha de centro em u. */
  const ponto = (u) => {
    const h = 1e-3
    const ua = Math.max(-1, u - h), ub = Math.min(1, u + h)
    const dx = (ub - ua) * MEIA
    const dy = linhaDeCentro(ub) - linhaDeCentro(ua)
    const L = Math.hypot(dx, dy) || 1
    return {
      x: CX + u * MEIA, y: linhaDeCentro(u),
      tx: dx / L, ty: dy / L, nx: -dy / L, ny: dx / L,
    }
  }

  // As estacoes, na ordem: ponta esquerda -> corpo -> ponta direita.
  const est = []
  const empurra = (p, desloc, h) => {
    const cx = p.x + p.tx * desloc
    const cy = p.y + p.ty * desloc
    est.push([
      put(cx + p.nx * h, cy + p.ny * h, ALT), put(cx - p.nx * h, cy - p.ny * h, ALT),
      put(cx + p.nx * h, cy + p.ny * h, 0), put(cx - p.nx * h, cy - p.ny * h, 0),
    ])
  }

  // As pontas redondas usam a espessura LOCAL, e nao a global: numa pincelada
  // que comeca com 2 mm e termina com 7 mm, uma ponta de raio fixo devolveria
  // uma bolinha maior que o proprio risco de um lado e um corte reto do outro.
  const pIni = ponto(-1)
  const rIni = meiaLarg(-1)
  for (let k = NC; k >= 1; k--) {
    const a = (k / NC) * A_FIM
    empurra(pIni, -Math.sin(a) * rIni, Math.cos(a) * rIni)
  }
  for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1
    empurra(ponto(u), 0, meiaLarg(u))
  }
  const pFim = ponto(1)
  const rFim = meiaLarg(1)
  for (let k = 1; k <= NC; k++) {
    const a = (k / NC) * A_FIM
    empurra(pFim, Math.sin(a) * rFim, Math.cos(a) * rFim)
  }

  for (let i = 0; i < est.length - 1; i++) {
    const A = est[i], B = est[i + 1]
    quad(A[0], A[1], B[1], B[0]) // frente
    quad(B[2], B[3], A[3], A[2]) // fundo (contra a pele)
    quad(A[0], B[0], B[2], A[2]) // borda de um lado
    quad(A[1], A[3], B[3], B[1]) // borda do outro
  }
  const P = est[0], U = est[est.length - 1]
  quad(P[0], P[2], P[3], P[1])   // tampinha da ponta esquerda
  quad(U[0], U[1], U[3], U[2])   // tampinha da ponta direita

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setIndex(idx)
  return wrapToHead(geo, PAD)
}

/**
 * Junta varias geometrias numa so. E o que permite uma boca ser feita de NOVE
 * marcas separadas e continuar custando UM draw call — sem isto o pontilhado
 * sozinho pagaria nove desenhos por boneco, e sao ate 20 bonecos na tela.
 *
 * Copia normal junto: cada peca ja passou por wrapToHead (que calcula normal), e
 * recalcular depois de juntar mediaria as normais de marcas VIZINHAS que se
 * encostam — as pontas redondas de duas hachuras sobrepostas ficariam com a
 * mesma normal e a emenda apareceria como um vinco aceso.
 */
function juntar(geos) {
  const pos = [], nor = [], idx = []
  let base = 0
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, ix = g.index
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nor.push(n.getX(i), n.getY(i), n.getZ(i))
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base)
    base += p.count
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

/** Um risco reto de (x0,y0) a (x1,y1), com espessura propria. x1 tem que ser > x0. */
function segmento(x0, y0, x1, y1, esp) {
  const meia = (x1 - x0) * 0.5
  const cx = (x0 + x1) * 0.5
  return risco(meia, (u) => y0 + (y1 - y0) * (u + 1) * 0.5, () => esp * 0.5, cx)
}

/** Uma marca redonda na pele: um risco de comprimento quase zero (duas pontas). */
function pingo(x, y, d) {
  return risco(0.0004 * S, () => y, () => d * 0.5, x)
}

/**
 * flatPiece, e nao sh: e uma LINHA na pele. Com sombra propria o risco projeta
 * a propria espessura no rosto e a boca vira um borrao cinza de 4 mm.
 */
function peca(geo) {
  return flatPiece(new THREE.Mesh(geo, solid(COR, 0.86, 0.0)))
}

export const BOCAS_EXTRA = [
  {
    id: 'neutro', nome: 'Neutro', name: 'Neutro',
    metodo: 'risco de espessura constante e ponta redonda, linha de centro RETA — a boca mais simples que da pra desenhar',
    build(ctx) {
      useHead(ctx)
      // Reta, e so isso. A ponta redonda e o que impede a linha reta de ler como
      // um corte: com ponta quadrada ela vira uma fenda, e com ponta em bico
      // vira a lente que foi recusada.
      return peca(risco(0.048 * S, () => BOCA_Y))
    },
  },
  {
    id: 'alegre', nome: 'Alegre', name: 'Alegre',
    metodo: 'o mesmo risco num ARCO DE CIRCULO de verdade (nao numa parabola): raio constante, entao a curvatura nao acelera nos cantos',
    build(ctx) {
      useHead(ctx)
      // ARCO DE CIRCULO, e nao parabola. Numa parabola a curvatura CRESCE em
      // direcao as pontas, e e isso que faz o sorriso abrir nos cantos e ganhar
      // cara de boca entalhada. Num arco a curvatura e a mesma do comeco ao
      // fim, que e como sorriso de desenho e desenhado.
      //
      // A conta: uma corda de meia-largura M cujas pontas sobem `sobe` esta num
      // circulo de raio R = (M^2 + sobe^2) / (2 * sobe).
      const M = 0.056 * S
      const sobe = 0.020 * S
      const R = (M * M + sobe * sobe) / (2 * sobe)
      return peca(risco(M, (u) => {
        const x = u * M
        return BOCA_Y + R - Math.sqrt(Math.max(0, R * R - x * x))
      }))
    },
  },
  {
    id: 'raiva', nome: 'Raiva', name: 'Raiva',
    metodo: 'o mesmo risco em ANGULO: dois segmentos retos que se encontram no meio, com o vertice arredondado pela hipotenusa',
    build(ctx) {
      useHead(ctx)
      // DOIS SEGMENTOS RETOS, e nao uma curva. Boca de raiva no desenho minimo
      // e um angulo: reta e arco ja sao as outras duas, e o "^" e a unica das
      // tres formas que nao se confunde com nenhuma outra a 3 m de camera.
      //
      // O vertice sai arredondado sozinho pela hipotenusa sqrt(u^2 + e^2): com
      // |u| puro o canto vira bico, e um risco de espessura constante se dobra
      // em cima de si mesmo ali — o que aparece como um no no meio da boca.
      //
      // `alto` sobre 1,7 cm num risco de 6,9 cm de meia-largura: e uma
      // inclinacao de 14 graus por lado. Com os 1,35 cm da primeira medida o
      // angulo ficava raso demais e o "^" lia como indiferenca, nao como raiva.
      const alto = 0.0170 * S
      const e = 0.16
      const k = Math.sqrt(1 + e * e)
      return peca(risco(0.052 * S, (u) => BOCA_Y + alto * (1 - Math.sqrt(u * u + e * e) / k)))
    },
  },

  // -------------------------------------------------------------------------
  // A SEGUNDA LEVA. As tres de cima sao a MESMA caneta em tres formas; estas
  // tres mudam a CANETA. Sao os tres jeitos que sobram de desenhar uma boca com
  // uma linha so, e nenhum deles e uma variacao dos anteriores:
  //
  //   PINCEL   a espessura varia AO LONGO do traco, e de forma assimetrica
  //   ONDA     a linha nao vai pra lugar nenhum: ela volta
  //   ARO      a curva FECHA — separa dentro de fora, e nao cima de baixo
  // -------------------------------------------------------------------------
  {
    id: 'pincel', nome: 'Pincelada', name: 'Pincelada',
    metodo: 'risco de espessura ASSIMETRICA: entra fino, engrossa depois do meio e levanta fino de novo — pincel, e nao caneta',
    build(ctx) {
      useHead(ctx)
      // A LENTE DO 'traco' ERA SIMETRICA, e era isso que a fazia ler como
      // entalhe de boneco: barriga exatamente no meio, bico igual nos dois
      // lados. Aqui a barriga fica em 61% do caminho e as duas pontas tem
      // espessuras DIFERENTES. Assimetria e o que separa "risco feito a mao" de
      // "peca fresada" — e o cerebro reconhece a diferenca antes de saber por que.
      //
      // O 1.7 no expoente e o que empurra o pico pra direita: sen(PI * t^1.7)
      // chega ao maximo em t = 0.5^(1/1.7) = 0.67. Com t puro o pico cai no meio
      // e a pincelada vira a lente de novo.
      const larg = (u) => {
        const t = (u + 1) / 2
        const cheio = Math.pow(Math.sin(Math.PI * Math.pow(t, 1.7)), 1.15)
        return ESPESSURA * 0.5 * (0.18 + 1.70 * cheio)
      }
      // curva de sorriso discreto: a pincelada ja tem personalidade demais pra
      // carregar tambem uma forma forte
      return peca(risco(0.058 * S, (u) => BOCA_Y + 0.0085 * S * u * u, larg))
    },
  },
  {
    id: 'onda', nome: 'Ondulada', name: 'Ondulada',
    metodo: 'uma onda inteira de seno ao longo da boca: um lado desce, o outro sobe — a unica forma do arquivo que nao e simetrica em espelho',
    build(ctx) {
      useHead(ctx)
      // sen(PI * u) da UMA onda completa de ponta a ponta: em u = -0.5 o traco
      // esta no fundo, em u = +0.5 no topo, e nas duas pontas volta a altura da
      // boca. E a unica boca do arquivo com simetria de ROTACAO em vez de
      // espelho — vira a cabeca de cabeca pra baixo e ela e a mesma.
      //
      // E o que ela le nao e alegria nem raiva: e duvida. Nenhuma das outras
      // seis diz isso, e era esse o buraco no catalogo.
      const amp = 0.0090 * S
      return peca(risco(0.054 * S, (u) => BOCA_Y + amp * Math.sin(Math.PI * u)))
    },
  },

  // -------------------------------------------------------------------------
  // A TERCEIRA LEVA — E AQUI MUDA A MARCA, NAO O TRACO.
  //
  // As seis de cima sao todas UMA FITA ESCURA CONTINUA deitada na pele. O que
  // variou entre elas foi o CAMINHO (reta, arco, angulo, onda, aro) e o PERFIL
  // DE ESPESSURA (lente, constante, pincelada). O tipo de marca nunca mudou —
  // e por isso as seis parecem parentes por mais diferente que seja a curva.
  //
  // Estas tres nao sao uma fita. Cada uma e um TIPO DE MARCA diferente:
  //
  //   HACHURA      a linha e feita de varios tracos CURTOS e soltos, com falha
  //                entre eles. Marca de esboco, nao de nanquim
  //   DUPLO        sao DUAS linhas, nao uma. A informacao esta na relacao entre
  //                elas — comprimento, peso e distancia
  //   PONTILHADO   nao ha linha nenhuma: sao marcas REDONDAS separadas, e quem
  //                desenha a boca e o olho de quem olha
  // -------------------------------------------------------------------------
  {
    id: 'hachura', nome: 'Hachura', name: 'Hachura',
    metodo: 'seis tracos curtos e soltos, cada um com angulo e comprimento proprios, com falha entre eles — marca de esboco a lapis, e nao uma fita continua',
    build(ctx) {
      useHead(ctx)
      // A REGRA DA HACHURA E A FALHA. Se os seis tracos se encostassem, o
      // resultado seria uma fita continua com a borda tremida — ou seja, a
      // mesma marca de sempre, so que malfeita. O que faz ler como esboco e o
      // VAO entre eles: o olho completa a linha sozinho, e e essa participacao
      // que da a sensacao de coisa desenhada a mao.
      //
      // O sorteio e travado em semente fixa: com semente livre a boca "ferve"
      // (redesenha diferente) toda vez que o customizador reconstroi o slot.
      const r = rng(6113)
      const MEIA = 0.058 * S
      const arco = (x) => BOCA_Y + 0.0075 * S * Math.pow(x / MEIA, 2)
      const geos = []
      const N = 6
      for (let i = 0; i < N; i++) {
        // cada traco pega 1/6 da boca e transborda 22% pra cada lado; com o
        // sorteio de comprimento, alguns vizinhos se cruzam e outros deixam
        // falha — que e exatamente o que um lapis faz
        const t0 = i / N, t1 = (i + 1) / N
        const folga = (t1 - t0) * (0.10 + r() * 0.24)
        const a = Math.max(0, t0 - folga), b = Math.min(1, t1 + folga)
        const x0 = (a * 2 - 1) * MEIA, x1 = (b * 2 - 1) * MEIA
        // o desvio em Y e o que da o angulo: cada traco sai um pouco torto em
        // relacao a curva, como quem risca rapido sem levantar a mao
        const d0 = (r() - 0.5) * 0.0055 * S
        const d1 = (r() - 0.5) * 0.0055 * S
        geos.push(segmento(x0, arco(x0) + d0, x1, arco(x1) + d1,
          ESPESSURA * (0.62 + r() * 0.36)))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'duplo', nome: 'Duplo', name: 'Duplo',
    metodo: 'DUAS linhas paralelas: a de cima longa e cheia, a de baixo curta e fina — a boca esta na relacao entre as duas, e nao em nenhuma delas',
    build(ctx) {
      useHead(ctx)
      // As duas linhas nao sao a mesma linha repetida, e e essa a graca: a de
      // cima e a boca, a de baixo e o vinco do labio inferior. Ela tem 55% do
      // comprimento, 55% da espessura e a curvatura INVERTIDA (o vinco de baixo
      // acompanha o queixo, e nao a boca). Duas copias iguais leriam como um
      // erro de renderizacao — sombra dupla, z-fighting, alguma coisa quebrada.
      const MEIA = 0.056 * S
      const cima = risco(MEIA, (u) => BOCA_Y + 0.0090 * S * u * u,
        () => ESPESSURA * 0.46)
      const baixo = risco(MEIA * 0.55, (u) => BOCA_Y - 0.0115 * S - 0.0030 * S * u * u,
        () => ESPESSURA * 0.30)
      return peca(juntar([cima, baixo]))
    },
  },
  {
    id: 'pontilhado', nome: 'Pontilhado', name: 'Pontilhado',
    metodo: 'nove marcas REDONDAS separadas ao longo da curva, maiores no meio — nao existe linha nenhuma, quem desenha a boca e o olho de quem olha',
    build(ctx) {
      useHead(ctx)
      // O TAMANHO DOS PINGOS NAO E CONSTANTE, e sem isso nao funciona: nove
      // marcas iguais leem como uma fileira de cravos, nao como boca. Crescendo
      // no meio e sumindo nas pontas, elas viram uma linha que o olho fecha
      // sozinho — e o pingo maior no centro e o que ancora a boca no rosto.
      const MEIA = 0.052 * S
      const N = 9
      const geos = []
      for (let i = 0; i < N; i++) {
        const u = (i / (N - 1)) * 2 - 1
        const x = u * MEIA
        const y = BOCA_Y + 0.0070 * S * u * u
        const d = ESPESSURA * (1.05 - 0.45 * Math.abs(u))
        geos.push(pingo(x, y, d))
      }
      return peca(juntar(geos))
    },
  },

  // -------------------------------------------------------------------------
  // A QUARTA LEVA — TRACO FINO, E A MARCA E UM CANTO.
  //
  // As tres anteriores mudaram o TIPO de marca (varias, duas, redondas). Estas
  // tres mudam outra coisa: todas sao feitas de SEGMENTOS RETOS emendados, e o
  // que da identidade a cada uma e o CANTO entre eles.
  //
  //   SERRILHADO  seis segmentos alternando pra cima e pra baixo: canto atras
  //               de canto, ritmo. Le como dente cerrado
  //   COLCHETE    um traco longo com dois terminais DESCENDO nas pontas. O
  //               canto esta so nas extremidades, e e ele que da o ar sério
  //   PARTIDO     dois segmentos que nao se encontram: o canto virou VAO, e as
  //               duas metades ainda ficam em alturas diferentes
  //
  // As tres sao FINAS (58% da espessura das outras) e um pouco menores. Traco
  // fino aguenta canto: numa linha grossa o cotovelo se dobra em cima de si
  // mesmo e vira um no. Foi por isso que a boca de raiva precisou arredondar o
  // vertice com hipotenusa — com FINO isso deixa de ser problema.
  // -------------------------------------------------------------------------
  {
    id: 'serrilhado', nome: 'Serrilhado', name: 'Serrilhado',
    metodo: 'seis segmentos retos alternando pra cima e pra baixo — o canto arredondado sai de graca da ponta redonda de cada segmento, sem calculo de vertice',
    build(ctx) {
      useHead(ctx)
      // OS CANTOS SE ARREDONDAM SOZINHOS. Cada segmento termina numa ponta
      // redonda, e as pontas de dois vizinhos caem no MESMO ponto — a
      // sobreposicao das duas e o cotovelo. Fazer isto como uma linha de centro
      // unica (uma onda triangular) daria bico agudo e a fita se dobraria em
      // cima de si mesma em cada quina.
      const MEIA = 0.046 * S
      const DENTES = 6
      const amp = 0.0042 * S
      const alt = (i) => BOCA_Y + (i % 2 ? amp : -amp)
      const geos = []
      for (let i = 0; i < DENTES; i++) {
        const x0 = (-1 + (2 * i) / DENTES) * MEIA
        const x1 = (-1 + (2 * (i + 1)) / DENTES) * MEIA
        geos.push(segmento(x0, alt(i), x1, alt(i + 1), FINO))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'colchete', nome: 'Colchete', name: 'Colchete',
    metodo: 'um traco longo com dois terminais VERTICAIS descendo nas pontas — tres marcas, e o desenho esta na quina entre elas',
    build(ctx) {
      useHead(ctx)
      // Os terminais sao segmentos com x0 === x1, ou seja, VERTICAIS. risco()
      // aguenta isso: a normal sai da derivada da linha, entao com dx = 0 ela
      // vira (-1, 0) e a fita se abre no eixo X, que e o certo. Se a normal
      // fosse (0,1) fixo — como era tentador escrever — o terminal nasceria com
      // largura zero e sumiria.
      const MEIA = 0.045 * S
      const curva = 0.0035 * S
      const yPonta = BOCA_Y + curva
      const desce = 0.0105 * S
      const corpo = risco(MEIA, (u) => BOCA_Y + curva * u * u, () => FINO * 0.5)
      const geos = [corpo]
      for (const sgn of [-1, 1]) {
        geos.push(segmento(sgn * MEIA, yPonta - desce, sgn * MEIA, yPonta, FINO * 0.9))
      }
      return peca(juntar(geos))
    },
  },

  // -------------------------------------------------------------------------
  // A QUINTA LEVA — SEIS, TODAS NA LINHA DO SERRILHADO E DO COLCHETE.
  //
  // Foram essas duas que ficaram, entao a familia toda daqui pra frente segue a
  // regra delas: TRACO FINO, SEGMENTOS RETOS, e a identidade no CANTO. Nenhuma
  // curva suave, nenhuma espessura variavel — esse vocabulario ja foi tentado e
  // recusado nas levas anteriores.
  //
  // O que separa uma da outra e ONDE o canto esta:
  //
  //   ESCADA      cantos no meio, sempre subindo — degrau atras de degrau
  //   QUADRADA    cantos no meio, alternando — onda, mas ortogonal
  //   FRANJA      cantos ao longo de um traco unico, todos descendo
  //   TACA        cantos so nas duas pontas, virados pra CIMA
  //   TORTA       UM canto so, e fora do meio
  //   TRACEJADO   canto nenhum: o ritmo e o desenho
  // -------------------------------------------------------------------------
  {
    id: 'escada', nome: 'Escada', name: 'Escada',
    metodo: 'tres pisos horizontais em alturas diferentes ligados por dois degraus verticais — a boca sobe da esquerda pra direita em saltos, sem nenhuma diagonal',
    build(ctx) {
      useHead(ctx)
      // ORTOGONAL DE VERDADE: so horizontal e vertical, nenhuma diagonal. E o
      // que separa esta do serrilhado, que e todo feito de diagonal. Os cantos
      // ficam retos (90 graus) e mesmo assim fecham limpo porque a ponta redonda
      // de cada segmento cobre a quina.
      const M = 0.046 * S
      const passo = 0.0048 * S
      const larg = (2 * M) / 3
      const geos = []
      for (let i = 0; i < 3; i++) {
        const y = BOCA_Y + (i - 1) * passo
        const x0 = -M + i * larg
        const x1 = x0 + larg
        geos.push(segmento(x0, y, x1, y, FINO))
        if (i < 2) geos.push(segmento(x1, y, x1, BOCA_Y + i * passo, FINO))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'quadrada', nome: 'Quadrada', name: 'Quadrada',
    metodo: 'onda QUADRADA: tres horizontais alternando entre duas alturas, ligadas por verticais — a mesma ideia da ondulada, sem nenhuma curva',
    build(ctx) {
      useHead(ctx)
      // A 'ondulada' e uma senoide; esta e a mesma informacao escrita em pulso.
      // Vale a pena as duas existirem porque elas nao leem igual: a senoide le
      // como duvida (organica, hesitante) e o pulso le como robo — e o jogo tem
      // maquina de jogo, cassino e tela, entao esse registro cabe.
      const M = 0.047 * S
      const amp = 0.0042 * S
      const larg = (2 * M) / 3
      const alt = (i) => BOCA_Y + (i % 2 ? amp : -amp)
      const geos = []
      for (let i = 0; i < 3; i++) {
        const x0 = -M + i * larg
        const x1 = x0 + larg
        geos.push(segmento(x0, alt(i), x1, alt(i), FINO))
        // vertical de ligacao. Repare que ela DESCE quando i e impar: risco()
        // aguenta os dois sentidos porque a normal e a rotacao de 90 graus da
        // tangente, e o produto (n x t) da sempre o mesmo sinal em Z — inverter
        // o sentido do traco nao vira a fita do avesso.
        if (i < 2) geos.push(segmento(x1, alt(i), x1, alt(i + 1), FINO))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'franja', nome: 'Franja', name: 'Franja',
    metodo: 'um traco longo com quatro dentes VERTICAIS pendurados nele, mais curtos nas pontas — o colchete tem canto so nas extremidades, este tem canto no meio inteiro',
    build(ctx) {
      useHead(ctx)
      // Os dentes encurtam nas pontas (o `1 - 0.35 * |u|`). Com todos do mesmo
      // tamanho a franja vira uma grade — regular demais pra ler como boca. A
      // variacao suave e o que faz o conjunto ter silhueta.
      const M = 0.048 * S
      const curva = 0.0030 * S
      const linha = (u) => BOCA_Y + curva * u * u
      const geos = [risco(M, linha, () => FINO * 0.5)]
      const N = 4
      for (let i = 0; i < N; i++) {
        const u = ((i + 0.5) / N) * 2 - 1
        const x = u * M
        const y = linha(u)
        const desce = 0.0078 * S * (1 - 0.35 * Math.abs(u))
        geos.push(segmento(x, y - desce, x, y, FINO * 0.75))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'taca', nome: 'Taca', name: 'Taca',
    metodo: 'o oposto do colchete: os terminais sobem em vez de descer, e sao mais compridos — com o corpo levemente concavo o conjunto vira um copo',
    build(ctx) {
      useHead(ctx)
      // NAO E O COLCHETE ESPELHADO, e a diferenca importa. Alem de virar pra
      // cima, o terminal aqui e 25% mais comprido e o CORPO afunda no meio (o
      // -0.0025 em 1-u^2) em vez de arquear pra cima. Espelhado puro, o desenho
      // ficaria com cara de erro — o olho reconhece as duas pecas como a mesma.
      const M = 0.043 * S
      const linha = (u) => BOCA_Y - 0.0025 * S * (1 - u * u)
      const sobe = 0.0130 * S
      const yPonta = linha(1)
      const geos = [risco(M, linha, () => FINO * 0.5)]
      for (const sgn of [-1, 1]) {
        geos.push(segmento(sgn * M, yPonta, sgn * M, yPonta + sobe, FINO * 0.9))
      }
      return peca(juntar(geos))
    },
  },
  {
    id: 'torta', nome: 'Torta', name: 'Torta',
    metodo: 'UM canto so, e a 32% do caminho em vez de no meio — um trecho curto e ingreme e outro longo e raso',
    build(ctx) {
      useHead(ctx)
      // O CANTO FORA DO MEIO E A PECA TODA. Um canto centrado da simetria de
      // espelho, e simetria de espelho ja e a boca de raiva. Jogando a quina pra
      // 32%, os dois trechos passam a ter comprimento E inclinacao diferentes, e
      // o rosto ganha um lado — e a unica boca do catalogo que nao e simetrica.
      const M = 0.047 * S
      const xq = -M + 2 * M * 0.32
      return peca(juntar([
        segmento(-M, BOCA_Y - 0.0035 * S, xq, BOCA_Y + 0.0075 * S, FINO),
        segmento(xq, BOCA_Y + 0.0075 * S, M, BOCA_Y + 0.0015 * S, FINO),
      ]))
    },
  },
  {
    id: 'tracejado', nome: 'Tracejado', name: 'Tracejado',
    metodo: 'tres tracos IGUAIS com vaos IGUAIS sobre um arco — o contrario da hachura, onde tudo e irregular de proposito',
    build(ctx) {
      useHead(ctx)
      // O PAR EXATO DA HACHURA, e por isso as duas convivem: la o comprimento, o
      // angulo e o vao sao sorteados (marca de lapis); aqui os tres tracos tem o
      // mesmo tamanho e os dois vaos tambem (marca de maquina). Sao leituras
      // opostas com a mesma construcao.
      //
      // traco = M/2 e vao = M/4, entao 3*traco + 2*vao = 2*M fecha exato na
      // largura da boca — sem sobra de meio traco na ponta.
      const M = 0.050 * S
      const arco = (x) => BOCA_Y + 0.0060 * S * (x / M) * (x / M)
      const d = M * 0.5, g = M * 0.25
      const geos = []
      for (let i = 0; i < 3; i++) {
        const x0 = -M + i * (d + g)
        const x1 = x0 + d
        geos.push(segmento(x0, arco(x0), x1, arco(x1), FINO))
      }
      return peca(juntar(geos))
    },
  },
]

export default BOCAS_EXTRA
