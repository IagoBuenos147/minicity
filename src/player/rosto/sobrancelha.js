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
//   B  fio-a-fio        78 tubos POR LADO, plantados um a um em (theta, az)
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
//
// ---------------------------------------------------------------------------
// O QUE A FOLHA DE CONTATO DE PERTO ACUSOU (e o que mudou aqui por causa disso)
//
// As tres liam como TABUAS ESCURAS flutuando alto na testa, e dominavam o rosto
// inteiro. Tres defeitos somados, um por eixo:
//
//   1. ALTURA. BROW_Y estava em 0.096 * S, que sao 8,1 cm acima do centro do
//      olho (0.035 * S) numa cabeca de 49 cm — 16,5% da altura da cabeca. Num
//      rosto humano essa distancia e ~12%. Isso punha a sobrancelha no meio da
//      testa, e sobrancelha alta demais le como espanto permanente. Agora em
//      0.077 * S: 5,6 cm de centro a centro, ~11,4%, e a borda de baixo ainda
//      para 6,9 mm acima do topo do olho.
//
//   2. ESPESSURA. A barra do A tinha 3,1 cm de altura no pico (6,3% da cabeca;
//      uma sobrancelha cheia de verdade fica em ~4,5%) e ainda saltava quase
//      2 cm da testa. B e C tinham faixas na mesma escala. Todas encolheram
//      ~30%, e a variacao ao longo do comprimento cresceu: hoje a razao entre
//      a parte mais grossa e a ponta e de 1 pra 5 no A (era 1 pra 2,4 depois do
//      piso de seguranca morder).
//
//   3. PONTA QUADRADA. O contorno do A comecava e terminava num CORTE RETO
//      vertical — a "quina dura" que aparecia na ponta de dentro, junto do
//      nariz. Agora as duas pontas fecham num arco (capa()), que e o que faz a
//      cabeca da sobrancelha parecer um tufo e nao um pedaco serrado.
//
//   4. COR CHAPADA. shade(cor, 0.85) sobre um castanho ja escuro dava um marrom
//      que o olho le como preto, e um preto de tom unico e o que mais denuncia
//      "adesivo". Hoje sao 0.92 e todo item tem DOIS tons: o B sorteia os fios
//      entre peloMat(cor, 0..2) com viesse pro claro, e o A e o C ganharam uma
//      CRISTA — uma peca fina de material mais claro montada em cima da borda
//      superior, que e onde a luz da cena bate.
//
// POR QUE A CRISTA E UMA PECA FECHADA E NAO UM SEGUNDO GRUPO DE TRIANGULOS DA
// MESMA MALHA: tools/teste-normais.mjs mede o VOLUME ASSINADO de cada geometria
// pra achar malha do avesso. Fatiar um solido em duas cascas abertas deixa a
// metade de baixo com volume assinado bem negativo (some a contribuicao da
// parede de cima, que aponta pra longe do centro do cranio) e o teste acusa
// como invertida — medido, -19 cm3 contra um limite de -3. Duas pecas FECHADAS,
// uma encaixada na outra, dao volume positivo nas duas e passam.
// ---------------------------------------------------------------------------

const S = HEAD_S

/**
 * Altura da sobrancelha no espaco da cabeca.
 *
 * SUBIU DE 0.077 PRA 0.098 QUANDO O CATALOGO DE OLHO MUDOU, e o numero nao e
 * gosto — e o piso da conta.
 *
 * O 0.077 valia pros olhos realistas, cujo topo ficava por volta de 0.062 * S:
 * a borda de baixo da peca mais gorda (metodo A, na cabeca da sobrancelha) para
 * 0.0093 * S abaixo desta linha, entao sobravam 6,9 mm de pele a vista e a
 * sobrancelha nao lia como palpebra pesada.
 *
 * O olho que ficou no catalogo e outro bicho. O de desenho tem centro em
 * EYE_ANCHOR.y + 0.004 = 0.039 * S e semi-eixo vertical 0.0448 * S, e ainda
 * carrega o contorno preto por fora (casco invertido em 1.058):
 *
 *     topo do olho = 0.039 + 0.0448 * 1.058 = 0.0864 * S
 *
 * Com BROW_Y em 0.077 a borda de baixo da sobrancelha caia em 0.0677 * S — ou
 * seja, DOIS CENTIMETROS DENTRO do globo. Nao e que ficasse apertado: a
 * sobrancelha era desenhada atravessando o olho.
 *
 * 0.098 poe a borda de baixo em 0.0887 * S, 4,9 mm acima do contorno do olho, e
 * deixa 0.054 * S (7,2 cm) de testa ate a linha do cabelo mais baixa — que e o
 * espaco de que uma cabeca com olho deste tamanho precisa. A tabela do CONTRATO
 * pedia 0.096 * S, entao isto e um retorno a ela, nao uma invencao.
 */
const BROW_Y = 0.098 * S

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
 *
 * As amplitudes cairam junto com a altura: com o arco de 1,4 cm de antes, a
 * peca inteira ocupava 4 cm de testa e voltava a invadir o espaco de onde ela
 * acabou de sair. Hoje o arco sobe 1,06 cm e a cauda desce 0,93 cm.
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
 * Comprida (yTop 1.05) e desce na Redonda (0.95).
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
 * sozinho aqui: a sobrancelha mora acima do equador, e duas cabecas com o mesmo
 * kx podem ter larguras bem diferentes nessa altura — a Pera tem crown -0.30,
 * ou seja, a moleira dela e 15% mais estreita.
 *
 * O que o x NOMINAL faz em cada cranio, medido AGORA (a tabela antiga era da
 * altura antiga e nao vale mais — descer 2,6 cm poe a sobrancelha numa volta
 * mais larga do cranio, e o teto passou a morder bem menos). Cauda / raio
 * horizontal na altura da sobrancelha, e o fator que sai daqui:
 *
 *   Redonda 0.75 -> 1.000    Comprida 0.79 -> 0.958    Quadrada 0.76 -> 1.000
 *   Pera    0.91 -> 0.832    Realista 0.79 -> 0.965    Mandibula 0.77 -> 0.987
 *
 * Isto MUDOU de comportamento com a descida e vale registrar: na altura antiga
 * o teto disparava nos seis cranios, `bruto` se cancelava na conta e quem
 * dimensionava a peca era `xMax * 0.76` sozinho. Hoje ele nao morde em duas das
 * seis cabecas, entao BROW_CX e BROW_LEN voltaram a valer pelo valor absoluto e
 * nao so pela proporcao entre si — aumentar BROW_LEN agora ALARGA a sobrancelha
 * de verdade na Redonda e na Quadrada.
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
 * Cor: cabelo escurecido em 8%.
 *
 * Era 15% (shade 0.85) e a folha de contato mostrou o resultado: sobre o
 * castanho padrao (0x4a2c19, que ja e escuro) o produto cai pra 0x3f2515, um
 * marrom que a 3 m nao se distingue de preto — e sobrancelha preta chapada e o
 * traco que mais puxa o olho num rosto inteiro. Sobrancelha AINDA precisa ler
 * mais escura que o cabelo (o pelo e mais grosso e a testa a mantem em sombra
 * propria), mas 8% bastam pro degrau aparecer sem virar buraco.
 *
 * O resto do trabalho de tirar a chapadura e do SEGUNDO TOM: corCrista() nos
 * metodos A e C, peloMat(cor, 0..2) no B.
 */
function corSobrancelha(ctx) { return shade(hairColorFrom(ctx), 0.92) }

/**
 * O tom claro da borda de cima. 1.18 e exatamente o multiplicador do
 * peloMat(cor, 2) do nucleo — os tres itens ficam com a mesma familia de dois
 * tons, o que importa porque o jogador troca entre eles no customizador e um
 * item mais claro que o outro leria como cor diferente, nao como metodo
 * diferente. THREE.Color.getHex satura em 0xff sozinho, entao cabelo platinado
 * nao estoura.
 */
function corCrista(ctx) { return shade(hairColorFrom(ctx), 0.92 * 1.18) }

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
 *
 * A CRISTA dos metodos A e C usa a mesma politica pelo mesmo motivo de escala:
 * ela tem 1,3 mm de saliencia, que e menos que um texel do mapa de sombra.
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
  arco: 0.0080 * S,
  queda: 0.0070 * S,
  esp: 0.0150 * S,   // altura da barra no pico do perfil (2,15 cm de fato)
  prof: 0.0062 * S,  // saliencia sobre a pele
  pad: 0.0030 * S,
  bisel: 0.0007 * S,
  torcao: -0.32,
  // crista: a mecha clara que anda em cima da borda superior
  cristaU0: 0.04, cristaU1: 0.72,
  cristaFundo: 0.55,          // fracao da metade de cima que ela cobre
  cristaSobe: 0.0010 * S,     // quanto ela passa da borda de cima da barra
  cristaZ: 0.0006 * S,        // quanto ela se adianta em Z (anti z-fighting)
  cristaBisel: 0.0003 * S,
}

/**
 * Perfil de espessura ao longo de u. E o coracao deste metodo: com espessura
 * constante o resultado e a barra velha, por mais bonito que seja o arco.
 *
 *   gauss(u, 0.18, 0.40)  poe o maximo logo depois da cabeca, nao no meio;
 *   o fator (1 - 0.80 * smoothstep(0.52, 1))  esvazia a cauda.
 *
 * O que mudou depois da folha de contato: o pico foi de 0.0215 * S pra
 * 0.0150 * S de espessura base (3,1 cm -> 2,15 cm de altura de barra, ou 6,3%
 * -> 4,4% da altura da cabeca) e a queda da cauda comeca mais cedo (0.52 em vez
 * de 0.60). A razao grosso/fino subiu de 2,4 pra 4,9, que e a leitura que
 * faltava: a reclamacao nao era so "grossa", era "grossa IGUAL do comeco ao
 * fim".
 *
 * O piso de 0.22 nao e estetico, e de malha: o bisel do ExtrudeGeometry
 * CONTRAI a borda em 0,93 mm dos dois lados, e num trecho mais fino que 1,9 mm
 * o poligono se inverte e a ponta vira um leque de triangulos cruzados.
 * 0.22 * 0.0150 * S = 4,4 mm deixa 2,5 mm de margem. (O piso antigo era 0.16
 * sobre uma barra mais grossa, o que dava a mesma folga absoluta.)
 */
function perfilA(u) {
  const cheio = (0.30 + 0.78 * gauss(u, 0.18, 0.40)) * (1 - 0.80 * smoothstep(0.52, 1, u))
  return cheio < 0.22 ? 0.22 : cheio
}

/** Quanto da espessura vai pra CIMA da linha central, em u. */
function partirA(u) { return mix(0.34, 0.66, smoothstep(0.05, 0.62, u)) }

/**
 * As duas PONTAS do contorno, em arco.
 *
 * Era aqui o defeito 3: o contorno ia do ultimo ponto de baixo direto pro
 * ultimo ponto de cima, o que e um corte RETO vertical de 1,4 cm de altura na
 * cabeca da sobrancelha. Vista de frente aquilo e uma quina, e quina nenhuma
 * existe num tufo de pelo.
 *
 * O arco e uma meia-elipse: raio em Y = metade da espessura ali (fecha exato
 * nos dois pontos que recebe) e raio em X = 75% disso, porque uma meia-lua
 * redonda de verdade esticaria a sobrancelha 5 mm pra dentro da glabela.
 * `dirX` diz pra que lado a barriga do arco sai: pra fora do comprimento nos
 * dois casos.
 */
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

/**
 * Monta um Shape fechado a partir das duas bordas ja calculadas, pondo um arco
 * em cada ponta. Serve pra barra e pra crista — as duas tem o mesmo contorno
 * geral e o mesmo problema de quina.
 *
 * O lado esquerdo e o mesmo poligono com x negado, o que INVERTE o sentido do
 * contorno. Reverter devolve o sentido anti-horario.
 * NAO e isso que salva as normais, ao contrario do que esta linha ja alegou:
 * ExtrudeGeometry chama ShapeUtils.isClockWise e normaliza o contorno sozinho
 * (conferido — o volume assinado sai identico e positivo nos dois sentidos).
 * A linha fica porque a ordem dos pontos ainda decide de qual canto o bisel
 * comeca, e mantendo os dois lados no mesmo sentido eles ficam espelhados de
 * verdade em vez de espelhados-e-rodados.
 */
function fecharContorno(baixo, cima, sgn) {
  const n = baixo.length - 1
  const pts = []
  for (let i = 0; i <= n; i++) pts.push(baixo[i])
  for (const p of capa(baixo[n], cima[n], sgn)) pts.push(p)      // cauda
  for (let i = n; i >= 0; i--) pts.push(cima[i])
  for (const p of capa(cima[0], baixo[0], -sgn)) pts.push(p)     // cabeca
  if (sgn < 0) pts.reverse()
  const forma = new THREE.Shape()
  forma.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) forma.lineTo(pts[i][0], pts[i][1])
  forma.closePath()
  return forma
}

/**
 * O poligono da barra. A massa nao e simetrica em volta da linha central: na
 * CABECA a sobrancelha pende PRA BAIXO (o tufo nasce no osso e cai sobre o
 * canto do olho) e no ARCO ela cresce PRA CIMA. Distribuir 34%/66% da altura
 * pra cima conforme u e o que faz a borda de baixo ficar quase reta sobre o
 * olho enquanto a de cima desenha o arco — que e como a sobrancelha se le.
 *
 * E e essa assimetria que segura a peca longe da palpebra depois da descida:
 * na cabeca da sobrancelha, onde a barra e mais alta, so 66% da espessura desce.
 */
function formaBarra(sgn, spread, cfg) {
  const n = 22
  const baixo = [], cima = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const c = linhaCentral(u, sgn, spread, cfg)
    const e = perfilA(u) * cfg.esp
    const pCima = partirA(u)
    baixo.push([c.x, c.y - e * (1 - pCima)])
    cima.push([c.x, c.y + e * pCima])
  }
  return fecharContorno(baixo, cima, sgn)
}

/**
 * O poligono da CRISTA — a mecha clara.
 *
 * Ela e uma peca INTEIRA e FECHADA (nao um pedaco fatiado da barra; ver o
 * cabecalho pro motivo, que e o teste de volume assinado) que fica encaixada na
 * barra: por baixo entra 55% da metade de cima da barra, por cima sai
 * 1,3 mm, e o build ainda a empurra 0,8 mm pra frente em Z. Nenhuma face dela
 * fica coplanar com face nenhuma da barra, entao nao existe z-fighting; o que
 * se ve e uma listra clara correndo pela borda de cima e um fio dela na frente.
 *
 * Ela para em u = 0.72 de proposito: dali pra ponta a barra tem 5 mm de altura
 * e uma crista ali seria mais fina que o proprio bisel. Fora que a cauda da
 * sobrancelha e a parte que menos pega luz — ela ja esta virando pra tempora.
 */
function formaCrista(sgn, spread, cfg) {
  const n = 16
  const baixo = [], cima = []
  for (let i = 0; i <= n; i++) {
    const u = mix(cfg.cristaU0, cfg.cristaU1, i / n)
    const c = linhaCentral(u, sgn, spread, cfg)
    const meia = perfilA(u) * cfg.esp * partirA(u)   // metade de cima da barra
    const topo = c.y + meia
    baixo.push([c.x, topo - meia * cfg.cristaFundo])
    cima.push([c.x, topo + cfg.cristaSobe])
  }
  return fecharContorno(baixo, cima, sgn)
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
 * ORCAMENTO DE Z (refeito depois do emagrecimento). O vertice que mais recua e
 * o da borda de cima da face de tras, e o produto (altura da barra) x sin(a)
 * tem maximo NO MEIO do comprimento, nao na cauda. Com esp 0.0215 * S e torcao
 * 0.40 ele batia -3,8 mm contra um pad de 4,26 mm: 0,43 mm de folga. Emagrecer
 * a barra pra 0.0150 * S e abrir menos o angulo (0.32) leva esse recuo pra
 * -2,1 mm, e o pad de 0.0030 * S da 4,0 mm — folga de 1,9 mm, quatro vezes a de
 * antes. Ainda assim: quem aumentar `esp` ou `torcao` sem aumentar `pad` junto
 * enterra a borda de cima da barra no meio do arco, que e exatamente onde a
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
  arco: 0.0088 * S,
  queda: 0.0076 * S,
  fios: 78,
  alt: 0.0062 * S,    // meia-altura da faixa onde os fios sao plantados
  comp: 0.0130 * S,
  raio: 0.00112 * S,
  curva: 0.85,
}

/**
 * Meia-altura da faixa de plantio: cheia na cabeca, quase nula na cauda.
 *
 * A faixa encolheu de 0.0088 * S pra 0.0062 * S de meia-altura (2,6 cm -> 1,8
 * cm de faixa cheia no ponto mais alto). O numero de fios subiu de 64 pra 78 e
 * o raio de cada um caiu de 1,45 pra 1,12 mm na mesma passada: mais fio fino
 * numa faixa menor le como pelo, menos fio grosso numa faixa grande le como
 * escova. O custo continua igual (fio mais fino nao tem menos triangulo, mas
 * 78 fios de 44 triangulos por lado dao 6,9 mil no total, dentro dos 12 mil que
 * o CONTRATO permite por peca de pelo).
 */
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
    // v pela sequencia aurea em vez de random puro: 78 sorteios independentes
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

    // Tom por sorteio enviesado e nao alternado: 3 tons em rodizio desenham
    // listras de um fio, que a 3 m viram uma cor media chapada.
    //
    // O VIESSE MUDOU depois da folha de contato: era 50/30/20 (metade no tom
    // cheio, 30% no escuro de peloMat, 20% no claro), que da um tom medio de
    // 0.98 e some com a variacao. Agora 34/28/38 puxa pro claro (tom medio
    // 1.02) e, mais importante, poe quase tantos fios claros quanto escuros —
    // e o CONTRASTE entre fio vizinho, nao o tom medio, que faz o olho ler
    // fio separado em vez de mancha.
    const r = rnd()
    const ma = mas[r < 0.34 ? 0 : r < 0.62 ? 1 : 2]
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
  arco: 0.0082 * S,
  queda: 0.0068 * S,
  alt: 0.0068 * S,   // meia-altura da faixa
  esp: 0.0050 * S,   // quanto ela levanta da pele no ponto mais cheio
  nU: 34,
  nV: 9,
}

/**
 * A casca inteira e a CRISTA clara, como faixas em v (−1 = borda de baixo,
 * +1 = borda de cima).
 *
 * A crista e uma lente fechada que corre pela borda de cima: o lado de dentro
 * dela acompanha a superficie da casca 0,2 mm POR DENTRO e o lado de fora sai
 * 0,7 mm PRA FORA no meio, costurando nos dois rebordos. Fica encaixada na
 * casca como uma pastilha, sem face coplanar (nao pisca) e sem borda solta
 * (nao abre fresta).
 *
 * As duas chamadas recebem a MESMA semente de PRNG de proposito: franja() e o
 * primeiro consumidor do gerador nas duas, entao as bordas desfiadas saem
 * identicas e a crista segue exatamente o mesmo recorte da casca embaixo dela.
 * Com sementes diferentes a lente atravessaria a franja em alguns pontos.
 */
const FAIXA_CASCA = { v0: -1, v1: 1, nV: 9, crista: false }
const FAIXA_CRISTA = { v0: 0.28, v1: 0.88, nV: 7, crista: true }
const CRISTA_REC = 0.0002   // metros: quanto a lente afunda na casca no rebordo
const CRISTA_ALT = 0.0007   // metros: quanto ela sobressai no meio

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
 * cabecas largas (Mandibula, kx 1.14) e pra dentro na Comprida (0.90).
 *
 * O volume fecha sozinho: nas quatro bordas a espessura vai a ZERO e o vertice
 * de fora e o mesmo vertice de dentro. Sem parede lateral, sem vertice
 * duplicado — e portanto sem a listra acesa de costura que o CONTRATO descreve
 * (item 5 dos erros conhecidos), porque nao ha duas normais no mesmo ponto.
 *
 * A faixa emagreceu junto com as outras duas: meia-altura de 0.0104 * S pra
 * 0.0068 * S (3,1 cm -> 2,1 cm de altura cheia) e saliencia de 0.0100 * S pra
 * 0.0050 * S (1,3 cm -> 7 mm de volume sobre a testa). Era a peca mais gorda
 * das tres e a que mais lia como pastilha colada.
 */
function tecerCasca(ma, sgn, spread, cfg, rnd, faixa) {
  const nU = cfg.nU, nV = faixa.nV
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
      // w = posicao DENTRO da faixa, v = posicao na casca inteira. Nas duas
      // coincidem quando a faixa e a casca toda; na crista, w controla a
      // barriga da lente e v continua dizendo onde a casca esta por baixo.
      const w = (j / (nV - 1)) * 2 - 1
      const v = mix(faixa.v0, faixa.v1, (w + 1) * 0.5)
      const y = cy + v * hCol * (v > 0 ? fT[i] : fB[i])
      const th = thetaDeY(y)
      const az = azDeX(th, cx)
      const p = eggSurface(th, az, 1, _p)
      const nr = eggNormal(th, az, _n)
      // Cupula em potencia 0.62 e nao meia-circunferencia: a sobrancelha e
      // gorda no meio e some rapido nas bordas, e a raiz quadrada deixaria o
      // perfil arredondado demais, com cara de salsicha colada na testa.
      const dome = naPonta ? 0 : Math.pow(Math.max(0, 1 - v * v), 0.62)
      const eCasca = eCol * dome
      // 0.5 mm de folga: encostar exato na pele poe as duas superficies
      // brigando no z-buffer e a faixa pisca conforme a camera anda.
      const base = 0.0005
      let dentroE = 0, foraE = eCasca
      if (faixa.crista) {
        const lente = naPonta ? 0 : Math.pow(Math.max(0, 1 - w * w), 0.62)
        dentroE = eCasca - CRISTA_REC
        foraE = dentroE + (CRISTA_REC + CRISTA_ALT) * lente
      }
      const e = foraE - dentroE
      const b0 = base + dentroE
      const id = ma.v(p.x + nr.x * b0, p.y + nr.y * b0, p.z + nr.z * b0)
      colD.push(id)
      colF.push(e > 1e-6
        ? ma.v(p.x + nr.x * (b0 + e), p.y + nr.y * (b0 + e), p.z + nr.z * (b0 + e))
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
    metodo: 'shape 2D de espessura variavel extrudado, torcido no eixo longo e projetado com wrapToHead, com uma crista clara encaixada na borda de cima',
    build(ctx) {
      useHead(ctx)
      const cfg = CFG_A
      const spread = espalhamento(cfg.len)
      const mat = solid(corSobrancelha(ctx), 0.94, 0.0)
      const matC = solid(corCrista(ctx), 0.94, 0.0)
      return doisLados((sgn) => {
        const g = new THREE.Group()
        const geo = new THREE.ExtrudeGeometry(
          formaBarra(sgn, spread, cfg),
          extrudeOpts(cfg.prof, cfg.bisel, 4),
        )
        torcerBarra(geo, sgn, spread, cfg)
        wrapToHead(geo, cfg.pad)
        g.add(sh(new THREE.Mesh(geo, mat)))

        // A crista passa pela MESMA torcao (senao ela descolaria da borda de
        // cima justo onde a barra mais gira) e so entao ganha o adianto em Z,
        // que entra no pad da projecao — e a projecao e o unico lugar onde da
        // pra empurrar em Z sem desalinhar a peca da curva do cranio.
        const geoC = new THREE.ExtrudeGeometry(
          formaCrista(sgn, spread, cfg),
          extrudeOpts(cfg.prof, cfg.cristaBisel, 4),
        )
        torcerBarra(geoC, sgn, spread, cfg)
        wrapToHead(geoC, cfg.pad + cfg.cristaZ)
        g.add(pelo(new THREE.Mesh(geoC, matC)))
        return g
      })
    },
  },

  {
    id: 'fio-a-fio', nome: 'Fio a fio', name: 'Fio a fio',
    metodo: '78 tubos por lado plantados em (theta, az), direcao girando de cima na cabeca a baixo na cauda, sorteados entre tres tons',
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
    metodo: 'faixa da propria superficie do cranio (eggSurface) engrossada pela normal, bordas comidas por PRNG e uma lente clara costurada na borda de cima',
    build(ctx) {
      useHead(ctx)
      const cfg = CFG_C
      const spread = espalhamento(cfg.len)
      const mat = solid(corSobrancelha(ctx), 0.93, 0.0)
      const matC = solid(corCrista(ctx), 0.93, 0.0)
      const ma = tecelagem()
      const maC = tecelagem()
      for (const sgn of [1, -1]) {
        const semente = sgn > 0 ? 0x9c4d : 0x40b7
        tecerCasca(ma, sgn, spread, cfg, rng(semente), FAIXA_CASCA)
        tecerCasca(maC, sgn, spread, cfg, rng(semente), FAIXA_CRISTA)
      }
      const g = new THREE.Group()
      g.add(sh(new THREE.Mesh(ma.geo(), mat)))
      if (!maC.vazia) g.add(pelo(new THREE.Mesh(maC.geo(), matC)))
      return g
    },
  },
]

export default SOBRANCELHAS
