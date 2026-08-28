import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD, HEAD_S, activeHead, clamp, eggNormal, eggSurface, extrudeOpts,
  faceSpread, fio, gauss, hairColorFrom, mix, peloMat, pontoNaPele, rng, sh,
  shade, smoothstep, tecelagem, useHead, wrapToHead,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/sobrancelha.js — TRES SOBRANCELHAS, TRES CONSTRUCOES.
//
// A sobrancelha anterior era uma barra de espessura constante e borda reta
// colada na testa. De longe lia como adesivo preto, e era ela — mais que o
// resto do rosto — que dava a cara de "boneco de bloco": o traco mais
// expressivo da cara humana nao tem espessura constante nem borda reta em
// ponto nenhum do seu comprimento.
//
// Uma sobrancelha de verdade tem tres partes com nome proprio, e as tres
// aparecem nos tres itens deste arquivo:
//
//   CABECA  junto do nariz. E a parte MAIS GROSSA, e o pelo dela sobe.
//   ARCO    o pico, a ~60% do caminho pra fora. E ele que da a expressao.
//   CAUDA   afina ate quase nada e DESCE; o pelo deita pra fora e pra baixo.
//
// A troca de DIRECAO do pelo ao longo dessas tres partes e o detalhe que
// separa uma sobrancelha de uma escova de dente. Ela esta explicita no metodo
// B (cada fio tem a sua) e implicita nos outros dois (a torcao do A e a franja
// do C existem pra sugerir a mesma coisa sem pagar por fio).
//
// OS TRES METODOS SAO TRES PIPELINES, nao a mesma barra com outro numero:
//
//   A  arco-cheio       Shape 2D de espessura variavel -> ExtrudeGeometry ->
//                       torcao em volta do eixo longo -> wrapToHead().
//                       Trabalha em (x, y) e deixa a projecao achar a pele.
//                       E o mais barato e o que le melhor a 5 metros.
//
//   B  fio-a-fio        64 tubos POR LADO, plantados um a um em (theta, az)
//                       com pontoNaPele(). Nao existe superficie nenhuma: a
//                       sobrancelha E o conjunto de pelos, e cada pelo tem
//                       direcao propria conforme onde nasceu.
//
//   C  casca-desfiada   uma faixa da PROPRIA superficie do cranio, amostrada
//                       com eggSurface() ao longo de uma trilha em (theta, az)
//                       e engrossada pela normal, com as bordas de cima e de
//                       baixo comidas por um PRNG. Da o volume que a barra
//                       chapada nao tem sem pagar os fios do B.
//
// POR QUE B E C VAO POR (theta, az) E O A VAI POR (x, y): wrapToHead resolve
// (x,y) -> pele de graca e e o caminho certo pra uma peca chapada, mas nao
// devolve a NORMAL — e a normal e a direcao em que o pelo nasce (B) e a
// direcao em que a casca engrossa (C). Quem precisa dela tem que ir pelo par
// (theta, az), que e onde eggSurface/eggNormal respondem juntos.
//
// TODOS ancoram na superficie do cranio ativo, nunca num Z fixo: a arcada
// superciliar muda muito entre os seis cranios (brow vai de 0.04 na Pera a
// 0.085 na Realista) e uma barra com z fixo nasce enterrada em metade deles.
// ---------------------------------------------------------------------------

const S = HEAD_S

/** Altura da sobrancelha no espaco da cabeca — tabela de alturas do CONTRATO. */
const BROW_Y = 0.096 * S

/**
 * Onde fica o MEIO da sobrancelha (antes do faceSpread) e quanto ela mede.
 *
 * 0.054 * S poe a cabeca da sobrancelha em x ~0.017 * S — quase encostando na
 * glabela, como em gente — e a cauda em ~0.091 * S. Sao os valores NOMINAIS:
 * quem manda de fato e espalhamento(), logo abaixo, que ainda encolhe isto nas
 * cabecas estreitas no alto. Empurrar a cauda mais pra fora que isso a leva pro
 * trecho da testa onde o cranio ja virou pra tras e a ponta some pra tempora em
 * vez de continuar lendo de frente.
 */
const BROW_CX = 0.054 * S
const BROW_LEN = 0.074 * S

/**
 * Linha central em u (0 = cabeca, junto do nariz; 1 = cauda, na tempora).
 *
 * O arco NAO e uma parabola centrada: `u^1.35` dentro do seno joga o pico pra
 * u ~0.60, que e onde ele esta numa cara de verdade. Com o pico no meio a
 * sobrancelha le como circunflexo de desenho animado.
 * A queda entra so no ultimo terco (smoothstep de 0.5 a 1) porque e ali que a
 * cauda passa por baixo da altura da cabeca — antes disso ela ainda esta
 * subindo.
 */
const _c = { x: 0, y: 0 }
function linhaCentral(u, sgn, spread, cfg) {
  _c.x = sgn * spread * (BROW_CX + (u - 0.5) * cfg.len)
  _c.y = BROW_Y
    + cfg.arco * Math.sin(Math.PI * Math.pow(u, 1.35))
    - cfg.queda * smoothstep(0.5, 1, u)
  return _c
}

/**
 * Theta (0 = topo do cranio) para uma altura y. E a inversa exata de yAt():
 * o cranio estica a partir do QUEIXO, entao dividir por yTop antes de tirar o
 * arco-cosseno e obrigatorio — sem isso a sobrancelha sobe 2 cm na cabeca
 * Comprida (yTop 1.18) e desce na Redonda (0.95).
 */
function thetaDeY(y) {
  const sp = activeHead()
  return Math.acos(clamp((y / HEAD.ry + 1) / sp.yTop - 1, -1, 1))
}

/**
 * Azimute que poe eggSurface(theta, az).x no x pedido.
 *
 * Nao da pra resolver no fechado: o semi-eixo fx depende do proprio ponto
 * (tempora afundada, maca do rosto, superelipse do maxilar), entao az e x se
 * definem um pelo outro. Como x cresce monotonicamente com az em [0, PI/2],
 * 16 passos de bisseccao poem o erro abaixo de 0.03 mm — mais barato que
 * Newton, que precisaria de derivada numerica e daria o mesmo.
 *
 * O clamp em 0.985 do x maximo existe pro caso degenerado: pedir um x que
 * aquela altura nao alcanca faria a bisseccao parar em PI/2 e a peca nasceria
 * na ORELHA. Melhor encurtar a cauda em 1 mm do que teleportar a sobrancelha.
 */
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

/**
 * Espalhamento final. Sai do faceSpread(), mas com um TETO medido na altura da
 * sobrancelha.
 *
 * faceSpread() olha so `kx`, que e a largura do cranio no equador. Nao serve
 * sozinho aqui: a sobrancelha mora bem ACIMA do equador, e duas cabecas com o
 * mesmo kx podem ter larguras muito diferentes nessa altura — a Pera tem
 * crown -0.30, ou seja, a moleira dela e 15% mais estreita, e a Comprida tem
 * yTop 1.18, que empurra a linha da sobrancelha pra perto do topo, onde a
 * volta e curta.
 *
 * O que o x NOMINAL faz em cada cranio, medido (cauda / raio horizontal na
 * altura da sobrancelha, e o Z onde a pele esta nesse x):
 *
 *   Redonda 0.81 / 8.9 cm   Comprida 0.79 / 10.6 cm   Quadrada 0.80 / 9.2 cm
 *   Pera    0.96 / 3.6 cm   Realista 0.81 / 10.3 cm   Mandibula 0.81 / 8.7 cm
 *
 * A Pera e o caso que assusta — 3.6 cm quer dizer que a cauda ja escorregou pra
 * TEMPORA e sumiu de frente. Mas ATENCAO ao ler a tabela: o teto de 76% fica
 * ABAIXO das seis, entao ele nao e um caso especial da Pera — ele DISPARA NOS
 * SEIS. O encolhimento e de 3.4% (Comprida) a 6.4% (Redonda) nos outros cinco e
 * de 21% na Pera.
 *
 * A consequencia de o teto sempre morder e que `bruto` se CANCELA no retorno
 * (`bruto * limite / (bruto * ...)`): na pratica quem dimensiona a sobrancelha
 * hoje e `xMax * 0.76`, e nao faceSpread(). BROW_CX e BROW_LEN entraram
 * valendo so pela PROPORCAO entre si. Quem for mexer nos dois numeros precisa
 * saber disso: aumentar BROW_LEN nao alarga mais a peca, so muda onde a cabeca
 * dela comeca. O ramo do faceSpread continua no codigo porque um cranio futuro
 * mais estreito que 0.76 do nominal cairia nele.
 *
 * O piso de 0.72 existe pro caso extremo — encolher mais que isso daria um toco
 * de sobrancelha em vez de uma sobrancelha curta.
 */
function espalhamento(len) {
  const bruto = faceSpread()
  const xMax = eggSurface(thetaDeY(BROW_Y), Math.PI / 2, 1, _pb).x
  const cauda = bruto * (BROW_CX + len * 0.5)
  const limite = xMax * 0.76
  if (cauda <= limite) return bruto
  return bruto * Math.max(0.72, limite / cauda)
}

/**
 * Cor: cabelo escurecido em 15%. Sobrancelha SEMPRE le mais escura que o
 * cabelo (o pelo e mais grosso e a testa a mantem em sombra propria), e sem
 * esse degrau um loiro fica com a sobrancelha sumida na pele.
 */
function corSobrancelha(ctx) { return shade(hairColorFrom(ctx), 0.85) }

/**
 * Politica de sombra do FIO — a mesma de barba.js (`pelo()` la).
 *
 * castShadow false: um tubo de 1,5 mm nao cabe num texel do shadow map, entao
 * ele nao projeta uma sombra, projeta cintilacao.
 * receiveShadow TRUE, e e essa a metade que importa: sem ela a sobrancelha fica
 * a unica coisa acesa num rosto que a aba do chapeu poe na sombra — e chapeu de
 * aba e justamente o caso que `acomodarSobrancelhaSobOChapeu()` existe pra
 * tratar. Os meshes crus de `new THREE.Mesh(...)` nascem com receiveShadow
 * false, entao isto tem que ser dito.
 */
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
// METODO A — BARRA EXTRUDADA, TORCIDA, PROJETADA NA PELE
// ===========================================================================

const CFG_A = {
  len: BROW_LEN,
  arco: 0.0105 * S,
  queda: 0.0085 * S,
  esp: 0.0215 * S,   // altura da barra no pico do perfil (~31 mm de fato)
  prof: 0.0115 * S,  // saliencia sobre a pele
  pad: 0.0032 * S,
  bisel: 0.0009 * S,
  torcao: -0.40,
}

/**
 * Perfil de espessura ao longo de u. E o coracao deste metodo: com espessura
 * constante o resultado e a barra velha, por mais bonito que seja o arco.
 *
 *   gauss(u, 0.22, 0.42)  poe o maximo logo depois da cabeca, nao no meio;
 *   o fator (1 - 0.88 * smoothstep(0.60, 1))  esvazia a cauda.
 *
 * O piso de 0.16 nao e estetico, e de malha: o bisel do ExtrudeGeometry
 * empurra a borda 1.2 mm pra dentro dos DOIS lados, e num trecho mais fino que
 * 2.4 mm o poligono se inverte e a ponta vira um leque de triangulos cruzados.
 * 0.16 * 0.0215 * S = 4.6 mm deixa margem.
 */
function perfilA(u) {
  const cheio = (0.25 + 0.85 * gauss(u, 0.22, 0.42)) * (1 - 0.88 * smoothstep(0.60, 1, u))
  return cheio < 0.16 ? 0.16 : cheio
}

/**
 * O poligono. A massa nao e simetrica em volta da linha central: na CABECA a
 * sobrancelha pende PRA BAIXO (o tufo nasce no osso e cai sobre o canto do
 * olho) e no ARCO ela cresce PRA CIMA. Distribuir 34%/66% da altura pra cima
 * conforme u e o que faz a borda de baixo ficar quase reta sobre o olho
 * enquanto a de cima desenha o arco — que e como a sobrancelha se le.
 */
function formaBarra(sgn, spread, cfg) {
  const n = 20
  const baixo = [], cima = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const c = linhaCentral(u, sgn, spread, cfg)
    const e = perfilA(u) * cfg.esp
    const pCima = mix(0.34, 0.66, smoothstep(0.05, 0.62, u))
    baixo.push([c.x, c.y - e * (1 - pCima)])
    cima.push([c.x, c.y + e * pCima])
  }
  const pts = baixo.concat(cima.reverse())
  // O lado esquerdo e o mesmo poligono com x negado, o que INVERTE o sentido do
  // contorno. Reverter devolve o sentido anti-horario.
  // NAO e isso que salva as normais, ao contrario do que esta linha ja alegou:
  // ExtrudeGeometry chama ShapeUtils.isClockWise e normaliza o contorno sozinho
  // (conferido — o volume assinado sai identico e positivo nos dois sentidos).
  // A linha fica porque a ordem dos pontos ainda decide de qual canto o bisel
  // comeca, e mantendo os dois lados no mesmo sentido eles ficam espelhados de
  // verdade em vez de espelhados-e-rodados.
  if (sgn < 0) pts.reverse()
  const forma = new THREE.Shape()
  forma.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) forma.lineTo(pts[i][0], pts[i][1])
  forma.closePath()
  return forma
}

/**
 * TORCAO em volta do eixo longo, aplicada ANTES de wrapToHead.
 *
 * Aqui o Z ainda e "altura sobre a pele", entao girar (y, z) em volta da linha
 * central inclina a secao da barra sem descolar nada: quem sobe em z afasta da
 * pele, quem desce encosta. Com angulo negativo crescendo pra cauda, a borda
 * DE BAIXO da ponta avanca e a de cima recolhe — a sobrancelha enrola sobre o
 * canto externo do olho, que e a leitura que a barra chapada nunca da.
 *
 * O giro e em volta de +X nos dois lados de proposito: espelhar em x nao mexe
 * em (y, z), entao o mesmo angulo produz duas torcoes espelhadas.
 *
 * Amplitude: 0.40 rad, e o custo dela em z NAO se mede na cauda. Na cauda o
 * angulo e maximo mas a barra so tem 4.6 mm de altura, e o recuo fica em 1.2 mm
 * — foi esse numero que a primeira versao deste comentario anotou, e ele e o
 * melhor caso, nao o pior. O produto (altura da barra) x sin(angulo) tem maximo
 * NO MEIO: varrendo u em 200 passos, o vertice mais fundo e o da borda de cima
 * da face de tras em u ~= 0.61, com -3.8 mm.
 *
 * Somado ao bisel (-1.2 mm do proprio ExtrudeGeometry) contra o pad de 4.26 mm,
 * sobra 0.43 mm de folga — nao os 3 mm que "1.2 mm" sugeria. Medido nos seis
 * cranios: ZERO vertice abaixo da pele, entao a peca esta correta hoje. Mas a
 * margem e essa, e quem aumentar `esp` ou `torcao` sem aumentar `pad` junto
 * enterra a borda de cima da barra no meio do arco — que e exatamente onde a
 * sobrancelha e mais visivel.
 */
function torcerBarra(geo, sgn, spread, cfg) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const u = clamp(((sgn * x) / spread - BROW_CX) / cfg.len + 0.5, 0, 1)
    const c = linhaCentral(u, sgn, spread, cfg)
    const a = cfg.torcao * smoothstep(0.12, 1, u)
    const dy = y - c.y, co = Math.cos(a), si = Math.sin(a)
    pos.setXYZ(i, x, c.y + dy * co - z * si, dy * si + z * co)
  }
  pos.needsUpdate = true
  return geo
}

// ===========================================================================
// METODO B — FIO A FIO
// ===========================================================================

const CFG_B = {
  len: BROW_LEN * 0.96,
  arco: 0.0115 * S,
  queda: 0.0095 * S,
  fios: 64,
  alt: 0.0088 * S,    // meia-altura da faixa onde os fios sao plantados
  comp: 0.0145 * S,
  raio: 0.00145 * S,
  curva: 0.85,
}

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
 * Planta os fios de UM lado nos tres acumuladores de tom.
 *
 * A DIRECAO E O ITEM INTEIRO. Todos os pelos paralelos leem como escova de
 * dente por mais denso que se plante; o que faz o olho aceitar "sobrancelha" e
 * a rotacao continua ao longo da curva:
 *
 *   na CABECA  (u ~ 0)    o pelo aponta pra CIMA
 *   no MEIO    (u ~ 0.5)  deita pra FORA, quase horizontal
 *   na CAUDA   (u ~ 1)    aponta pra fora e pra BAIXO
 *
 * `subida` e `queda` sao dois smoothsteps que nunca se sobrepoem, entao o peso
 * do vertical passa de +1 a -0.62 sem nunca ficar preso em zero no meio (o que
 * daria uma faixa morta de pelos sem inclinacao no centro da sobrancelha).
 *
 * A CURVATURA e o mesmo giro pra todos os fios, em volta da NORMAL DA PELE, e
 * e isso que resolve as tres regioes com um numero so: girar em volta da
 * normal leva "pra cima" -> "pra fora" -> "pra baixo" nessa ordem. Ou seja, um
 * pelo da cabeca termina apontando pra fora e um da cauda termina apontando
 * pra baixo, exatamente como continuacao natural de onde cada um comecou.
 */
function plantarFios(mas, sgn, spread, cfg, rnd) {
  for (let k = 0; k < cfg.fios; k++) {
    // u levemente comprimido pra cabeca (^1.12): e la que a faixa e alta e onde
    // a falta de fio aparece primeiro contra a pele clara.
    const u = Math.pow((k + rnd() * 0.92) / cfg.fios, 1.12)
    // v pela sequencia aurea em vez de random puro: 64 sorteios independentes
    // deixam buracos de 3 mm e grumos, e a faixa e estreita demais pra
    // esconder isso. A sequencia cobre a altura de forma uniforme sem bandear.
    const v = ((k * 0.6180339887) % 1) * 2 - 1 + (rnd() - 0.5) * 0.18

    const c = linhaCentral(u, sgn, spread, cfg)
    const h = cfg.alt * perfilB(u)
    const y = c.y + v * h
    const th = thetaDeY(y)
    const az = azDeX(th, c.x)
    pontoNaPele(th, az, 0.0008, _p, _n)

    // Base tangente na pele: "pra cima" e o Y do mundo sem a componente da
    // normal (senao os fios da testa sairiam furando o cranio pra dentro).
    _up.copy(_Y).addScaledVector(_n, -_n.y).normalize()
    _lado.crossVectors(_up, _n).multiplyScalar(sgn)

    const subida = 1 - smoothstep(0.0, 0.42, u)
    const queda = smoothstep(0.46, 1.0, u)
    // +0.38 * v: quem nasce na borda DE CIMA da faixa sobe mais que quem nasce
    // embaixo. E o que da a franja irregular no contorno superior sem precisar
    // de fio extra.
    const a = subida - 0.62 * queda + 0.38 * v + (rnd() - 0.5) * 0.22
    const b = 0.18 + 0.92 * smoothstep(0.02, 0.5, u) + (rnd() - 0.5) * 0.20
    // 0.40 na normal: sem isso o fio nasce rente e some dentro da pele na
    // primeira curvatura; muito mais que isso e a sobrancelha vira ourico.
    _dir.set(0, 0, 0)
      .addScaledVector(_up, a)
      .addScaledVector(_lado, b)
      .addScaledVector(_n, 0.40 + (rnd() - 0.5) * 0.12)
      .normalize()

    // 1 em cada 9 fios sai 60% mais longo. Sobrancelha de gente tem sempre
    // dois ou tres pelos rebeldes, e sao eles que o olho registra como "pelo"
    // em vez de "textura".
    const rebelde = k % 9 === 4 ? 1.6 : 1
    const comp = cfg.comp * (0.72 + 0.5 * rnd()) * (0.62 + 0.55 * perfilB(u)) * rebelde
    const raio = cfg.raio * (0.8 + 0.45 * rnd())
    const curva = -sgn * cfg.curva * (0.7 + 0.6 * rnd())

    // Tom por sorteio enviesado (50/30/20) e nao alternado: 3 tons em rodizio
    // desenham listras de um fio, que a 3 m viram uma cor media chapada.
    const r = rnd()
    const ma = mas[r < 0.5 ? 0 : r < 0.8 ? 1 : 2]
    // N = 4 colunas: o CONTRATO permite 4 so em fio grosso, e pelo de
    // sobrancelha e o mais grosso do corpo. Com 3 a secao triangular aparece
    // nos fios rebeldes, que sao justamente os que ficam contra o ceu.
    fio(ma, _p, _dir, comp, raio, _n, curva, 5, 4)
  }
}

// ===========================================================================
// METODO C — CASCA DE VOLUME COM BORDA DESFIADA
// ===========================================================================

const CFG_C = {
  len: BROW_LEN * 0.98,
  arco: 0.0098 * S,
  queda: 0.0080 * S,
  alt: 0.0104 * S,   // meia-altura da faixa
  esp: 0.0100 * S,   // quanto ela levanta da pele no ponto mais cheio
  nU: 34,
  nV: 9,
}

function perfilAltC(u) {
  return (0.42 + 0.72 * gauss(u, 0.26, 0.46)) * (1 - 0.62 * smoothstep(0.58, 1, u))
}
function perfilEspC(u) {
  return (0.50 + 0.60 * gauss(u, 0.30, 0.50)) * (1 - 0.75 * smoothstep(0.55, 1, u))
}

/**
 * A FRANJA: quanto a borda avanca em cada coluna.
 *
 * Ruido puro por coluna da um serrilhado de um vertice que le como defeito de
 * malha, nao como pelo — pelo cresce em TUFO, cobrindo 2 ou 3 colunas. Por
 * isso a mistura: 55% do valor suavizado com os vizinhos (o tufo) e 45% do
 * valor cru da coluna (a falha e o pelo solto que escapa do tufo).
 */
function franja(n, rnd, min, max) {
  const cru = new Array(n)
  for (let i = 0; i < n; i++) cru[i] = rnd()
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = cru[i > 0 ? i - 1 : 0], b = cru[i], d = cru[i < n - 1 ? i + 1 : n - 1]
    const suave = a * 0.28 + b * 0.44 + d * 0.28
    out[i] = min + (max - min) * (suave * 0.55 + b * 0.45)
  }
  return out
}

/**
 * A faixa. Cada coluna e um par (theta, az) resolvido NA ALTURA DAQUELA LINHA,
 * e nao o az da linha central reaproveitado: subir 1 cm na testa encurta o
 * raio horizontal do cranio, e reusar o az entortaria a faixa pra fora nas
 * cabecas largas (Mandibula, kx 1.14) e pra dentro na Comprida (0.88).
 *
 * O volume fecha sozinho: nas quatro bordas a espessura vai a ZERO e o vertice
 * de fora e o mesmo vertice de dentro. Sem parede lateral, sem vertice
 * duplicado — e portanto sem a listra acesa de costura que o CONTRATO descreve
 * (item 5 dos erros conhecidos), porque nao ha duas normais no mesmo ponto.
 */
function tecerCasca(ma, sgn, spread, cfg, rnd) {
  const nU = cfg.nU, nV = cfg.nV
  const fT = franja(nU, rnd, 0.52, 1.30)
  const fB = franja(nU, rnd, 0.60, 1.18)
  const vol = franja(nU, rnd, 0.74, 1.26)
  const fora = [], dentro = []

  for (let i = 0; i < nU; i++) {
    const u = i / (nU - 1)
    const c = linhaCentral(u, sgn, spread, cfg)
    const cx = c.x, cy = c.y
    const hCol = cfg.alt * perfilAltC(u)
    const eCol = cfg.esp * perfilEspC(u) * vol[i]
    const naPonta = i === 0 || i === nU - 1
    const colF = [], colD = []
    for (let j = 0; j < nV; j++) {
      const v = (j / (nV - 1)) * 2 - 1
      const y = cy + v * hCol * (v > 0 ? fT[i] : fB[i])
      const th = thetaDeY(y)
      const az = azDeX(th, cx)
      const p = eggSurface(th, az, 1, _p)
      const nr = eggNormal(th, az, _n)
      // Cupula em potencia 0.62 e nao meia-circunferencia: a sobrancelha e
      // gorda no meio e some rapido nas bordas, e a raiz quadrada deixaria o
      // perfil arredondado demais, com cara de salsicha colada na testa.
      const dome = naPonta ? 0 : Math.pow(Math.max(0, 1 - v * v), 0.62)
      const e = eCol * dome
      // 0.5 mm de folga: encostar exato na pele poe as duas superficies
      // brigando no z-buffer e a faixa pisca conforme a camera anda.
      const base = 0.0005
      const id = ma.v(p.x + nr.x * base, p.y + nr.y * base, p.z + nr.z * base)
      colD.push(id)
      colF.push(e > 1e-6
        ? ma.v(p.x + nr.x * (base + e), p.y + nr.y * (base + e), p.z + nr.z * (base + e))
        : id)
    }
    fora.push(colF)
    dentro.push(colD)
  }

  // O lado esquerdo caminha em -x, o que inverte o sentido de todo quad. Sem
  // trocar a ordem, a sobrancelha esquerda ficaria com as normais pra dentro e
  // acenderia ao contrario da direita.
  const inv = sgn < 0
  for (let i = 0; i < nU - 1; i++) {
    for (let j = 0; j < nV - 1; j++) {
      const a = fora[i][j], b = fora[i + 1][j], c2 = fora[i + 1][j + 1], d = fora[i][j + 1]
      const e = dentro[i][j], f = dentro[i + 1][j], g = dentro[i + 1][j + 1], h = dentro[i][j + 1]
      if (inv) { ma.quad(a, d, c2, b); ma.quad(e, f, g, h) }
      else { ma.quad(a, b, c2, d); ma.quad(e, h, g, f) }
    }
  }
}

// ===========================================================================
// CATALOGO
// ===========================================================================

export const SOBRANCELHAS = [
  {
    id: 'arco-cheio', nome: 'Arco cheio', name: 'Arco cheio',
    metodo: 'shape 2D de espessura variavel extrudado, torcido no eixo longo e projetado com wrapToHead',
    build(ctx) {
      useHead(ctx)
      const cfg = CFG_A
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
    },
  },

  {
    id: 'fio-a-fio', nome: 'Fio a fio', name: 'Fio a fio',
    metodo: '64 tubos por lado plantados em (theta, az), direcao girando de cima na cabeca a baixo na cauda',
    build(ctx) {
      useHead(ctx)
      const cfg = CFG_B
      const spread = espalhamento(cfg.len)
      const cor = corSobrancelha(ctx)
      // UM acumulador por tom e nao um por lado: os dois lados entram na mesma
      // geometria, entao a sobrancelha inteira sao 3 draw calls em vez de 6.
      const mas = [tecelagem(), tecelagem(), tecelagem()]
      for (const sgn of [1, -1]) {
        // Semente por lado: franjas identicas nos dois lados leem como decalque
        // espelhado. Semente FIXA (nao aleatoria) porque o mesmo personagem tem
        // que sair igual em toda reconstrucao.
        plantarFios(mas, sgn, spread, cfg, rng(sgn > 0 ? 0x2f13 : 0x71a5))
      }
      const g = new THREE.Group()
      // peloMat() e DoubleSide e AQUI ISSO E OBRIGATORIO, nao preferencia:
      // nucleo.fio() monta o frame do tubo com W = -direcao, e o quad sai com o
      // sentido trocado — conferido num fio isolado, 36 de 36 faces apontam pra
      // DENTRO (barba.js herda o mesmo, o bigode dela tem volume negativo).
      // Com FrontSide os fios nao ficam pela metade: eles somem por inteiro.
      for (let i = 0; i < mas.length; i++) {
        if (mas[i].vazia) continue
        g.add(pelo(new THREE.Mesh(mas[i].geo(), peloMat(cor, i))))
      }
      return g
    },
  },

  {
    id: 'casca-desfiada', nome: 'Cheia desfiada', name: 'Cheia desfiada',
    metodo: 'faixa da propria superficie do cranio (eggSurface) engrossada pela normal, bordas comidas por PRNG',
    build(ctx) {
      useHead(ctx)
      const cfg = CFG_C
      const spread = espalhamento(cfg.len)
      const mat = solid(corSobrancelha(ctx), 0.93, 0.0)
      const ma = tecelagem()
      for (const sgn of [1, -1]) {
        tecerCasca(ma, sgn, spread, cfg, rng(sgn > 0 ? 0x9c4d : 0x40b7))
      }
      const g = new THREE.Group()
      g.add(sh(new THREE.Mesh(ma.geo(), mat)))
      return g
    },
  },
]

export default SOBRANCELHAS
