// ---------------------------------------------------------------------------
// Animador 100% procedural do personagem: idle / caminhada / corrida / ar.
// Nao existe clipe nenhum: tudo e senoide aplicada SOBRE a pose base, que e
// capturada no primeiro update. Nunca acumula rotacao.
// Convencao de sinal (membro pendurado, personagem olhando +Z):
//   rotation.x > 0  -> o membro vai para TRAS;  < 0 -> para a FRENTE
//   no torso, rotation.x > 0 -> inclina o tronco para a FRENTE
// ---------------------------------------------------------------------------

// A unica coisa que este arquivo pega do three sao Box3 e Matrix4, e so pra
// medir onde a palpebra fecha (ver measureEyes). O resto continua sendo seno.
import * as THREE from 'three'

const TAU = Math.PI * 2
const DEG = Math.PI / 180

// lerp exponencial: mesma sensacao em qualquer framerate
function damp(cur, tgt, lambda, dt) {
  return cur + (tgt - cur) * (1 - Math.exp(-lambda * dt))
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v) }
function mix(a, b, t) { return a + (b - a) * t }

// headPivot fica de fora de proposito: quem escreve nele e o controller
// (character.setHeadLook). Escrever aqui brigaria com o head look.
const PARTS = [
  'hips', 'torso', 'chest', 'neck', 'head',
  'armLUpper', 'armLLower', 'handL',
  'armRUpper', 'armRLower', 'handR',
  'legLUpper', 'legLLower', 'footL',
  'legRUpper', 'legRLower', 'footR',
]

// ---------------------------------------------------------------------------
// A PASSADA
//
// O que o dono do jogo escreveu: "ele esta se movimentando como um boneco.
// Queremos realismo, caminhar fluido e correr fluido. Tem que dar PESO e
// identidade a ele quando se movimentar. Melhore completamente o caminhar e a
// corrida, levando em consideracao TODO O CORPO e nao somente as pernas."
//
// O que havia aqui era uma senoide por junta: coxa = -A*sin(p), joelho =
// max(0, -sin(p+0.45)), tornozelo = sin(p+2.35). Isso da um pendulo, e pendulo
// nao e passo. Faltavam as tres coisas que fazem um passo ler como passo:
//
//  1. APOIO E BALANCO SAO FASES DIFERENTES, E DE DURACAO DIFERENTE. Na
//     caminhada o pe fica no chao 62% do ciclo e no ar 38%; na corrida e o
//     contrario (35% no chao). Uma senoide gasta metade em cada e por isso a
//     perna parece que esta sempre no ar.
//  2. O PE ROLA. Ataque de calcanhar, pe plano, e o antepe EMPURRA no fim do
//     apoio. Sem o empurrao nao ha impulso, e sem impulso nao ha peso: o boneco
//     parece que esta sendo arrastado por um trilho.
//  3. O CORPO INTEIRO PARTICIPA. Quadril sobe, desce, desliza pro lado do pe de
//     apoio e CAI do lado da perna que esta no ar (a "queda pelvica"); o tronco
//     contra-gira; a cabeca desconta a rotacao pra continuar olhando pra frente.
//
// CONVENCAO DE FASE. `stride` anda 0..2PI por CICLO (= dois passos). A partir
// dele cada perna recebe um `t` em [0,1) onde t = 0 e o ATAQUE DE CALCANHAR
// daquela perna, e as duas pernas ficam meio ciclo defasadas. Todas as curvas
// abaixo sao escritas nesse t — e o que deixa ler a tabela e comparar com um
// grafico de marcha de verdade.
// ---------------------------------------------------------------------------

// Fracao do ciclo em que o pe esta NO CHAO.
// 0.62 na caminhada (com os dois pes no chao 12% do tempo, o "duplo apoio") e
// 0.34 na corrida — abaixo de 0.5 existe VOO, os dois pes fora do chao ao mesmo
// tempo, e e o voo que separa correr de andar rapido.
const APOIO_ANDAR = 0.62
const APOIO_CORRER = 0.34

// AS DUAS FLEXOES DE QUADRIL SAO COISAS DIFERENTES, e confundi-las foi o
// primeiro erro desta reescrita:
//
//   quadrilContato  quanto a coxa esta a frente NO INSTANTE EM QUE O PE TOCA.
//                   E ele, com a extensao, que define o COMPRIMENTO DO PASSO.
//   quadrilPico     a flexao maxima, la no MEIO DO BALANCO, quando o joelho
//                   sobe. Numa corrida chega a 65 graus; num contato, jamais.
//
// Com um valor so pros dois, o contato herdava a flexao de sprint (60 graus) —
// e a 60 graus de coxa com o joelho reto o tornozelo esta 47 cm abaixo do
// quadril, nao 75. A conta de altura do quadril entao pedia um quadril 36 cm
// mais baixo pra o pe alcancar o chao, e o boneco AGACHAVA a cada passo. Foi o
// teste de altura de quadril que pegou.
const WALK = {
  // PASSADA LONGA DE PROPOSITO. O passo e o que decide a cadencia (ver
  // passoMetros): passo curto obriga a perna a girar depressa pra cobrir a
  // mesma velocidade. Com 0.42/0.30 o boneco dava 5.5 passos por segundo na
  // velocidade padrao do jogo — foi a queixa "a animacao esta muito rapida,
  // muito mesmo". Alongar o passo e a unica correcao que nao inventa
  // deslizamento; o resto vem do RITMO, mais abaixo.
  quadrilContato: 0.62, // coxa a frente no ataque de calcanhar (36 graus)
  quadrilPico: 0.72,    // flexao maxima, no meio do balanco
  quadrilExt: 0.48,     // coxa atras no fim do apoio
  // 0.35 rad (20 graus) de joelho no contato e MUITO pra uma caminhada real
  // (la sao uns 5 graus), e esta aqui por geometria, nao por estilo: com a coxa
  // 36 graus a frente e o joelho reto, o tornozelo fica so 60 cm abaixo do
  // quadril e a conta de altura pediria um quadril 10 cm mais baixo pra o pe
  // alcancar o chao. Dobrar o joelho poe a canela de volta na vertical e
  // devolve essa altura. O efeito colateral e uma caminhada mais "macia", que
  // combina com o boneco.
  joelhoContato: 0.35,
  joelhoApoio: 0.22,    // flexao de amortecimento logo depois do ataque
  // 0.72 e nao 0.95: com a passada longa nova o pe ja passa longe do chao pela
  // propria geometria, e 0.95 fazia o calcanhar subir 28 cm — marcha de
  // soldado, nao caminhada.
  joelhoBalanco: 0.72,
  tornoBaixo: 0.30,     // empurrao do antepe
  tornoAlto: 0.18,      // ponta do pe pra cima no balanco (nao raspar o chao)
  braco: 0.42,          // amplitude do balanco do braco
  bracoAtras: 1.35,     // o braco vai MAIS pra tras do que pra frente
  cotovelo: 0.30,       // flexao base do cotovelo
  cotoveloOsc: 0.34,
  sobe: 0.026,          // altura extra do voo (so na corrida)
  desliza: 0.020,       // deslocamento lateral pro pe de apoio
  quedaPelvica: 0.055,  // quanto o quadril cai do lado da perna no ar
  giroQuadril: 0.13,
  giroTronco: 0.16,
  lean: 3.0 * DEG,
  ombro: 0.045,
  passoLargo: 0.012,    // afastamento lateral do pe (a marcha nao e em linha)
  teto: 0.086,          // queda maxima do quadril, em metros
}
const RUN = {
  // Passo GRANDE. Sao 6.2 m/s (22 km/h) no config; com o passo curto da versao
  // anterior a cadencia pedida passava de 9 passos por segundo e a corrida
  // virava um tremor de pernas. Passo de 74 cm poe a cadencia em 8.4 passos/s,
  // que ja e cartoon mas le como corrida.
  quadrilContato: 0.78,
  quadrilPico: 1.15,    // o joelho sobe alto: e a marca da corrida
  quadrilExt: 0.64,
  // Joelho BEM dobrado no contato. Contraintuitivo mas e geometria: com a coxa
  // 41 graus a frente, a perna ESTICADA tem projecao vertical de so 56 cm e o
  // quadril teria que descer 19 cm pro pe alcancar o chao. Dobrar o joelho poe a
  // canela de volta na vertical e devolve altura ao quadril — alem de ser o que
  // um corredor faz de verdade pra amortecer.
  joelhoContato: 0.46,
  joelhoApoio: 0.34,
  joelhoBalanco: 1.95,  // calcanhar quase no gluteo
  tornoBaixo: 0.46,
  tornoAlto: 0.26,
  braco: 0.86,
  bracoAtras: 1.10,
  cotovelo: 1.05,       // na corrida o cotovelo fica travado perto de 90 graus
  cotoveloOsc: 0.42,
  sobe: 0.055,
  desliza: 0.014,
  quedaPelvica: 0.030,
  giroQuadril: 0.20,
  giroTronco: 0.26,
  lean: 9.0 * DEG,
  ombro: 0.095,
  passoLargo: 0.006,
  teto: 0.135,
}

// Braco de alavanca efetivo do passo, em metros.
//
// NAO e o comprimento da perna (0.84 m). E o numero que faz passoMetros() bater
// com o passo que a animacao DE FATO desenha, e ele foi MEDIDO, nao deduzido:
// tools/_teste-passo.mjs percorre o ciclo em 240 Hz e le a excursao do
// tornozelo em Z enquanto o pe esta no chao.
//
//   perna esticada (0.80)   previa  0.778 m andando / 1.209 m correndo
//   medido de verdade                0.602 m        / 0.883 m
//
// A diferenca e o joelho: no apoio ele nunca esta reto, entao o raio efetivo
// encolhe. Se alguem mexer nas amplitudes de WALK/RUN, rode o teste de novo e
// reajuste ESTE numero, nao a formula.
const PERNA = 0.605

// Os dois segmentos, separados — a altura do quadril precisa deles. Sao os
// mesmos numeros de character.js (THIGH e SHIN). Ficam repetidos aqui, e nao
// importados, porque animation.js tambem anima os avatares remotos e os NPCs,
// que nao carregam o modulo do personagem inteiro. Se um dia divergirem, o
// sintoma aparece na hora: o pe afunda no chao ou flutua ao caminhar.
const COXA = 0.384
const CANELA = 0.3655
const PERNA_RETA = COXA + CANELA

/**
 * RITMO — a fracao da cadencia FISICAMENTE EXATA que a animacao usa.
 *
 * Este numero e uma TROCA CONSCIENTE, e vale explicar por que ele existe em vez
 * de a cadencia sair inteira da conta.
 *
 * A conta exata (velocidade dividida pelo passo) e a unica que faz o pe nao
 * patinar. So que a velocidade do jogo e alta: WALK_SPEED e 3.1 m/s (11 km/h) e
 * RUN_SPEED e 6.2 (22 km/h). Com a perna deste boneco — 75 cm — o passo maximo
 * que a geometria permite sem o quadril agachar fica em torno de 68 cm andando
 * e 79 cm correndo. Cobrir 3.1 m/s com passo de 68 cm da 4.5 passos por segundo;
 * cobrir 6.2 com 79 cm da 7.8. Nenhum humano anda assim, e na tela isso le como
 * o boneco tremendo as pernas — foi exatamente a queixa do dono.
 *
 * Nao da pra alongar mais o passo (a geometria da perna e o teto de queda do
 * quadril nao deixam) e nao da pra baixar a velocidade (a velocidade esta certa,
 * disse o dono). Sobra desacelerar a passada e aceitar que o pe escorrega no
 * chao — que e o que praticamente todo jogo de terceira pessoa faz.
 *
 * 0.66 poe a caminhada padrao em ~3.0 passos/s e a corrida em ~5.2, que sao
 * numeros de gente. O preco e ~34% de escorregao, invisivel a 3 m de camera e
 * muito menos incomodo que a perna a 300 rpm.
 *
 * Se um dia a velocidade do jogo baixar, SUBA este numero de volta pra 1: o
 * codigo em volta ja e exato, so este fator e que nao e.
 */
const RITMO = 0.66

/**
 * COMPRIMENTO DO PASSO, EM METROS, dado o gesto.
 *
 * E daqui que sai a CADENCIA, e nao o contrario. A formula antiga era
 * `hz = min(sp/1.6, 1.35 + sp*0.13)` — dois numeros escolhidos a mao, sem
 * relacao nenhuma com o tamanho do passo que a animacao de fato desenha. O
 * resultado inevitavel e o pe DESLIZANDO no chao. Nenhum outro detalhe de peso
 * salva uma passada que patina.
 *
 * Aqui e ao contrario: o passo sai da GEOMETRIA do gesto e a cadencia sai da
 * velocidade dividida pelo passo. Muda a amplitude, a cadencia acompanha
 * sozinha.
 */
function passoMetros(flex, ext) {
  return PERNA * (Math.sin(flex) + Math.sin(ext))
}

/**
 * ALTURA DO QUADRIL a partir dos angulos da perna — a queda vertical do quadril
 * ate o tornozelo, com a coxa em `q` e o joelho em `k`.
 *
 * E daqui que o quadril sobe e desce, e NAO de uma senoide. A versao com
 * senoide tinha um defeito que o teste pegou na hora: no duplo apoio ela
 * baixava o quadril 2.6 cm com as duas pernas quase esticadas, e o pe entrava
 * 8 mm no chao. Nao ha amplitude que conserte isso, porque o erro nao e de
 * amplitude e sim de causa — o quadril nao sobe porque uma senoide mandou, ele
 * sobe porque a perna de apoio ESTA MAIS ESTICADA naquele instante.
 *
 * Fixando o quadril nesta conta, o balanco vertical aparece sozinho, com a fase
 * certa e na amplitude certa, e muda junto quando alguem mexe na passada. E o
 * pe da perna de apoio nunca atravessa o chao, por construcao.
 */
function quedaDoQuadril(q, k) {
  return COXA * Math.cos(q) + CANELA * Math.cos(q + k)
}

/** Rampa suave 0..1 entre a e b (fora do intervalo, grampeia). */
function rampa(x, a, b) {
  if (b === a) return x < a ? 0 : 1
  return smooth01((x - a) / (b - a))
}

/** Pulso suave: 0 nas pontas, 1 no meio de [a, b]. */
function pulso(x, a, b) {
  if (x <= a || x >= b) return 0
  const t = (x - a) / (b - a)
  return Math.sin(t * Math.PI)
}

/**
 * O CICLO DE UMA PERNA, em t = [0,1) a partir do ataque de calcanhar.
 * Devolve os tres angulos em `out` pra nao alocar objeto por quadro por perna.
 *
 *   quadril  > 0 = coxa pra TRAS  (a convencao do arquivo)
 *   joelho   > 0 = canela dobrada pra tras (o unico sentido que joelho dobra)
 *   torno    > 0 = ponta do pe pra CIMA
 */
function cicloPerna(t, A, apoio, out) {
  if (t < apoio) {
    // --- APOIO ---------------------------------------------------------------
    // A coxa vai da flexao de contato ate a extensao num movimento QUASE linear:
    // no apoio o pe esta parado no chao e e o corpo que passa por cima dele,
    // entao a velocidade angular e constante. Usar seno aqui foi o erro da
    // versao antiga — o seno desacelera no meio do apoio, que e justo onde o
    // corpo mais avanca.
    const u = t / apoio
    out.quadril = -A.quadrilContato + (A.quadrilContato + A.quadrilExt) * u

    // Joelho: amortecimento logo depois do ataque (o "yield" que absorve o
    // peso) e depois estica; no fim do apoio ja comeca a dobrar pro balanco.
    // E o amortecimento que da a sensacao de PESO — sem ele a perna vira uma
    // estaca e o corpo nao afunda em nada.
    out.joelho = A.joelhoContato + A.joelhoApoio * pulso(u, 0.0, 0.60)
      + A.joelhoBalanco * 0.22 * rampa(u, 0.82, 1.0)

    // Tornozelo: ataque com o calcanhar (ponta um pouco pra cima), pe plano,
    // a canela avanca sobre o pe (dorsiflexao no meio) e o ANTEPE EMPURRA no
    // fim. O empurrao e o pico negativo; e a unica parte do ciclo que gera
    // impulso pra frente.
    out.torno = A.tornoAlto * 0.55 * (1 - rampa(u, 0.0, 0.16))
      + 0.16 * rampa(u, 0.20, 0.72)
      - A.tornoBaixo * rampa(u, 0.72, 1.0)
  } else {
    // --- BALANCO -------------------------------------------------------------
    const u = (t - apoio) / (1 - apoio)
    // Duas metades. Na primeira a coxa sai da extensao e sobe ate o PICO (o
    // joelho na altura maxima); na segunda ela desce do pico ate a flexao de
    // CONTATO, e o pe estende pra frente pra pousar. Uma rampa unica de
    // extensao a contato — que era o que estava aqui — nao tem pico nenhum, e
    // sem pico nao ha levantar de joelho: e o que fazia a corrida parecer um
    // arrastar de pes acelerado.
    const PICO = 0.58
    if (u < PICO) {
      out.quadril = A.quadrilExt - (A.quadrilExt + A.quadrilPico) * smooth01(u / PICO)
    } else {
      const v = smooth01((u - PICO) / (1 - PICO))
      out.quadril = -A.quadrilPico + (A.quadrilPico - A.quadrilContato) * v
    }

    // Joelho: dobra forte no comeco do balanco (e assim que o pe passa longe do
    // chao) e ESTENDE quase todo antes do ataque. Ficar dobrado no ataque e o
    // que fazia a perna parecer que ia se ajoelhar.
    out.joelho = A.joelhoContato + A.joelhoBalanco * pulso(u, -0.12, 0.88)

    // Tornozelo: ponta pra cima no meio do balanco pra nao raspar o chao, e
    // neutro/levemente pra cima na hora do ataque.
    out.torno = -A.tornoBaixo * (1 - rampa(u, 0.0, 0.22))
      + A.tornoAlto * rampa(u, 0.18, 0.60)
  }
  return out
}

export function createAnimator(character) {
  const parts = (character && character.parts) || {}

  // pose base (rot/pos/escala originais de cada junta)
  const base = Object.create(null)
  let captured = false

  // --- respiracao: vai nos MESHES do peito, nunca na junta -------------------
  // Escalar a junta 'chest' arrastaria pescoco, cabeca e (por tabela) o ponto
  // dos olhos junto, porque sao filhos dela: o jogador lia isso como a cabeca
  // inflando e o corpo subindo. Nos meshes o peito incha e mais nada se mexe.
  let chestMeshes = null
  let chestCount = -1
  function findChestMeshes() {
    chestMeshes = []
    const c = parts.chest
    if (!c || !c.children) return
    chestCount = c.children.length
    for (let i = 0; i < c.children.length; i++) {
      const o = c.children[i]
      if (o && o.isMesh && o.scale) {
        chestMeshes.push({ o, sx: o.scale.x, sy: o.scale.y, sz: o.scale.z })
      }
    }
  }
  // k = 0..1. Peito abre 1.4% na largura e 0.6% na altura no auge da inspiracao.
  function applyBreath(k) {
    // relista se o peito ganhou ou perdeu peca (jaqueta, colete, etc.)
    const c = parts.chest
    if (chestMeshes === null || (c && c.children.length !== chestCount)) findChestMeshes()
    const wide = 1 + 0.014 * k
    const tall = 1 + 0.006 * k
    for (let i = 0; i < chestMeshes.length; i++) {
      const m = chestMeshes[i]
      m.o.scale.set(m.sx * wide, m.sy * tall, m.sz * wide)
    }
  }

  // --- piscada --------------------------------------------------------------
  // Em idle a piscada e o UNICO movimento que sobra, entao ela mora aqui e nao
  // no controller: assim o avatar remoto e o NPC-jogador piscam pelo mesmo
  // codigo. Se character.js expuser setBlink(abertura), ele manda; senao
  // achatamos o grupo dos olhos como o npc.js ja faz.
  let blinkIn = 1.2 + Math.random() * 3.5
  let blinkT = -1
  let eyesBaseY = null   // posicao original do slot (nem sempre e zero)
  let eyesPivotY = 0     // meio da altura dos globos: e em volta dele que fecha
  const _cxOlho = new THREE.Box3()
  const _cxTmp = new THREE.Box3()
  const _mInv = new THREE.Matrix4()
  const _mTmp = new THREE.Matrix4()

  function eyesGroup() {
    const s = character && character.slots
    return (s && s.eyes) || null
  }

  /**
   * Onde a palpebra fecha.
   *
   * A piscada e uma so linha - achatar o GRUPO dos olhos em Y -, e a unica
   * coisa que ela precisa saber e em volta de que altura achatar. Errar esse
   * numero e o que punha "olhos piscando acima da cabeca": a conta anterior
   * ignorava a escala dos grupos-pai (os globos sao esferas de raio 1 dentro de
   * um grupo com escala 0.06) e media um pivo de 46 cm no lugar de 4,7 cm - a
   * cada piscada os olhos saltavam meio metro pra cima do boneco.
   *
   * A conta certa e a CAIXA de tudo que existe dentro do grupo, expressa no
   * sistema do proprio grupo, e o meio dela. Duas armadilhas que a versao
   * intermediaria ainda caiu:
   *
   *  - somar posicao com centro de geometria a mao erra quando a peca esta
   *    GIRADA, e as palpebras sao calotas giradas. A caixa local delas nao e a
   *    extensao delas no espaco do grupo. Aqui cada caixa vem pelo caminho de
   *    matriz completo (inversa do grupo vezes a matriz da peca), e Box3
   *    transforma os oito cantos - giro incluso.
   *  - MEDIA das pecas nao e MEIO da extensao. O olho tem mais calota em cima
   *    (palpebra e cilio) do que embaixo, entao a media fica alta e fechar em
   *    volta dela faz o olho escorregar. Fechar em volta do meio da extensao
   *    nao escorrega, por construcao.
   *
   * A varredura olha a GEOMETRIA e nao so a posicao do no porque o forno de
   * personagem (player/congelar.js) funde os globos num mesh so na ORIGEM do
   * slot, com a altura toda dentro da geometria.
   */
  function measureEyes(g) {
    if (eyesBaseY === null) eyesBaseY = g.position.y
    g.updateWorldMatrix(true, true)
    _mInv.copy(g.matrixWorld).invert()
    _cxOlho.makeEmpty()
    g.traverse((o) => {
      const geo = o.geometry
      if (!geo || !geo.attributes || !geo.attributes.position) return
      if (!geo.boundingBox) geo.computeBoundingBox()
      if (!geo.boundingBox) return
      _cxTmp.copy(geo.boundingBox)
      _mTmp.multiplyMatrices(_mInv, o.matrixWorld)
      _cxTmp.applyMatrix4(_mTmp)
      _cxOlho.union(_cxTmp)
    })
    eyesPivotY = _cxOlho.isEmpty() ? 0 : (_cxOlho.min.y + _cxOlho.max.y) / 2
  }

  function setBlink(open) {
    if (character && typeof character.setBlink === 'function') {
      character.setBlink(open)
      return
    }
    const g = eyesGroup()
    if (!g) return
    // Quem refaz a medida a cada piscada e updateBlink, com o olho ABERTO.
    // Aqui so o primeiro uso na vida do animador.
    if (eyesBaseY === null) measureEyes(g)
    g.scale.y = open
    g.position.y = eyesBaseY + eyesPivotY * (1 - open)
  }

  function updateBlink(dt) {
    if (blinkT < 0) {
      blinkIn -= dt
      if (blinkIn > 0) return
      blinkT = 0
      blinkIn = 2.0 + Math.random() * 4.5
      const g = eyesGroup()
      if (g) measureEyes(g)   // o slot e refeito ao trocar de aparencia
    }
    blinkT += dt
    const k = Math.min(1, blinkT / 0.10)
    setBlink(1 - Math.sin(k * Math.PI) * 0.93)
    if (k >= 1) { blinkT = -1; setBlink(1) }
  }

  // --- BALANCO DO COLAR ------------------------------------------------------
  //
  // Pedido do dono: "o colar precisa ser algo que tenha um pouco de balancar
  // suave quando o jogador se movimenta; o colar nao deve ficar apenas como um
  // negocio paradao". E, no mesmo folego, o medo certo: "talvez isso possa ate
  // gerar bugs, se gerar nao precisa nem fazer".
  //
  // COMO SE EVITA O BUG. Um colar que balanca de verdade e um pendulo com
  // colisao — e colisao contra o proprio peito, a cada quadro, em ate 20
  // bonecos, e caro e quebra fácil (o pingente entra no torax e fica preso
  // dentro dele). Aqui nao ha colisao nenhuma: o que balanca e o SLOT INTEIRO,
  // girando em volta da junta do pescoco, que e mais ou menos onde um colar
  // pivota de verdade. Girando o conjunto, o cordao acompanha o pingente e a
  // distancia entre colar e peito nao muda — nao ha como enterrar nada.
  //
  // E a amplitude e travada em 7 graus. No pingente, 15 cm abaixo do pescoco,
  // 7 graus dao 1,8 cm de deslocamento: da pra ver, e nao chega perto do pano.
  //
  // O motor e uma mola amortecida (K/C) empurrada por duas coisas: a MUDANCA
  // de velocidade (o colar fica pra tras quando o boneco arranca e vai pra
  // frente quando ele freia) e a PASSADA (o solavanco de cada pisada). E por
  // isso que ele balanca ao andar e para sozinho quando o boneco para.
  const COLAR_K = 90        // rigidez: ~1.5 Hz, a frequencia de um cordao curto
  const COLAR_C = 11        // amortecimento (zeta ~0.58): balanca e assenta
  const COLAR_MAX = 0.12    // teto do angulo, em radianos (7 graus)
  let colarAngX = 0, colarAngZ = 0
  let colarVelX = 0, colarVelZ = 0
  let colarVelAnt = 0

  function balancarColar(dt, speed, grounded, vy) {
    const slot = character && character.slots && character.slots.colar
    if (!slot) return
    // Sem peca no slot nao ha o que girar — e, mais importante, nao da pra
    // deixar um angulo velho gravado num slot vazio: o proximo colar nasceria
    // torto.
    if (!slot.children.length) {
      colarAngX = colarAngZ = colarVelX = colarVelZ = 0
      slot.rotation.x = 0
      slot.rotation.z = 0
      return
    }

    const passo = dt > 0.05 ? 0.05 : dt     // dt gordo (aba em segundo plano)
    const dv = passo > 0 ? (speed - colarVelAnt) / passo : 0
    colarVelAnt = speed
    const forte = clamp01(speed / 2.5)

    // Alvo do pendulo. Tres somas, e cada uma responde por uma coisa que se ve:
    //   arranque/freada -> o colar fica pra tras / joga pra frente
    //   passada         -> o solavanco vertical de cada pisada
    //   queda           -> no ar ele sobe; ao pousar, desce de uma vez
    let alvoX = -dv * 0.010 + Math.sin(stride * 2) * 0.030 * forte
    if (!grounded) alvoX += (vy > 0 ? -0.02 : 0.03)
    // O lado a lado vem do quadril, que desliza pro pe de apoio: meia
    // frequencia da vertical, e por isso o movimento resultante nao e um
    // vaivem chapado, e um oito.
    const alvoZ = Math.sin(stride) * 0.022 * forte

    colarVelX += (COLAR_K * (alvoX - colarAngX) - COLAR_C * colarVelX) * passo
    colarVelZ += (COLAR_K * (alvoZ - colarAngZ) - COLAR_C * colarVelZ) * passo
    colarAngX += colarVelX * passo
    colarAngZ += colarVelZ * passo
    if (colarAngX > COLAR_MAX) { colarAngX = COLAR_MAX; colarVelX = 0 }
    else if (colarAngX < -COLAR_MAX) { colarAngX = -COLAR_MAX; colarVelX = 0 }
    if (colarAngZ > COLAR_MAX) { colarAngZ = COLAR_MAX; colarVelZ = 0 }
    else if (colarAngZ < -COLAR_MAX) { colarAngZ = -COLAR_MAX; colarVelZ = 0 }

    slot.rotation.x = colarAngX
    slot.rotation.z = colarAngZ
  }

  // deltas do frame, zerados e recalculados sempre do zero
  const d = Object.create(null)
  for (let i = 0; i < PARTS.length; i++) {
    d[PARTS[i]] = { rx: 0, ry: 0, rz: 0, px: 0, py: 0, pz: 0, s: 1 }
  }

  // fases independentes. Fase inicial aleatoria: dois personagens lado a lado
  // nao podem respirar e piscar em sincronia.
  let stride = 0      // ciclo da passada (1 ciclo = 2 passos)
  let tBreath = Math.random() * 10   // respiracao

  // pesos suavizados dos estados
  let wLoco = 0, wRun = 0, wAir = 0
  let wSit = 0      // peso da pose de sentado
  let leanCur = 0
  let amp = 1            // encolhimento do gesto em velocidade baixa
  let segurando = false  // tem coisa na mao direita? (garrafa, lata, revolver)
  let wSegura = 0        // ...e a rampa dele, pra a troca nao ser um tranco
  let waveT = -1      // < 0 = aceno desligado

  function capture() {
    for (let i = 0; i < PARTS.length; i++) {
      const n = PARTS[i]
      const o = parts[n]
      if (!o) continue
      base[n] = {
        rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z,
        px: o.position.x, py: o.position.y, pz: o.position.z,
        sx: o.scale.x, sy: o.scale.y, sz: o.scale.z,
      }
    }
    captured = true
  }

  function clearDeltas() {
    for (let i = 0; i < PARTS.length; i++) {
      const k = d[PARTS[i]]
      k.rx = 0; k.ry = 0; k.rz = 0
      k.px = 0; k.py = 0; k.pz = 0
      k.s = 1
    }
  }

  function apply() {
    for (let i = 0; i < PARTS.length; i++) {
      const n = PARTS[i]
      const o = parts[n]
      const b = base[n]
      if (!o || !b) continue
      const k = d[n]
      o.rotation.set(b.rx + k.rx, b.ry + k.ry, b.rz + k.rz)
      o.position.set(b.px + k.px, b.py + k.py, b.pz + k.pz)
      if (k.s !== 1) o.scale.set(b.sx * k.s, b.sy * k.s, b.sz * k.s)
      else o.scale.set(b.sx, b.sy, b.sz)
    }
  }

  // --- poses ---------------------------------------------------------------

  // Sentado num banco: coxa quase horizontal, canela pra baixo, maos no colo.
  // Mesmos angulos da pose 'sit' dos NPCs, pra jogador e NPC sentarem igual.
  const SIT = {
    legLUpper: [-1.52, -0.05, -0.06], legLLower: [1.46, 0, 0], footL: [0.10, 0, 0],
    legRUpper: [-1.52, 0.05, 0.06], legRLower: [1.46, 0, 0], footR: [0.10, 0, 0],
    armLUpper: [-0.40, 0, -0.16], armLLower: [-0.92, 0, 0.12], handL: [-0.25, 0, 0],
    armRUpper: [-0.40, 0, 0.16], armRLower: [-0.92, 0, -0.12], handR: [-0.25, 0, 0],
    chest: [-0.05, 0, 0], torso: [0.03, 0, 0],
  }

  function poseSit(w) {
    if (w <= 0.001) return
    for (const name in SIT) {
      const k = d[name]
      if (!k) continue
      const a = SIT[name]
      k.rx += a[0] * w
      k.ry += a[1] * w
      k.rz += a[2] * w
    }
    // a respiracao continua rodando por fora (applyBreath), com peso menor
  }

  // Idle: o corpo tem PESO e fica PARADO. w = peso do idle.
  //
  // Aqui nao entra NADA que dependa do tempo. O que existia antes — deslocamento
  // de peso a cada 4 s, pendulo dos bracos, deriva da cabeca e giro do quadril —
  // somava um balanco constante de um lado pro outro; e como as pernas e os pes
  // sao filhos do quadril, qualquer coisa escrita nele levantava e deslizava os
  // pes. Era exatamente isso que o dono via como "flutuando".
  //
  // Sobra so uma POSE (valores constantes, que dao silhueta relaxada sem mexer
  // um milimetro por quadro). A respiracao vai por fora, na escala dos meshes do
  // peito (applyBreath), e a piscada em updateBlink.
  function poseIdle(w) {
    if (w <= 0.001) return

    // cotovelos levemente dobrados e bracos encostados no corpo
    if (d.armLUpper) d.armLUpper.rz += -0.030 * w
    if (d.armRUpper) d.armRUpper.rz += 0.030 * w
    if (d.armLLower) d.armLLower.rx += -0.16 * w
    if (d.armRLower) d.armRLower.rx += -0.16 * w
    // maos giradas pra dentro, como maos soltas de verdade
    if (d.handL) d.handL.rz += -0.06 * w
    if (d.handR) d.handR.rz += 0.06 * w
    // quadril, pernas e pes: ZERO. Os pes ficam plantados onde nasceram.
  }

  // --- passada --------------------------------------------------------------
  // Caixas de modulo: cicloPerna roda DUAS vezes por quadro e alocar dois
  // objetos por quadro por boneco (ate 20 bonecos) e lixo que o coletor vem
  // buscar no meio de uma animacao.
  const _pernaE = { quadril: 0, joelho: 0, torno: 0 }
  const _pernaD = { quadril: 0, joelho: 0, torno: 0 }
  const _A = {}

  /**
   * Passada. w = peso da locomocao, run = blend andar->correr.
   *
   * Ordem em que as coisas sao escritas, e o porque de cada uma:
   *   1. as duas pernas, pelo ciclo de marcha;
   *   2. o QUADRIL, que e o que carrega o peso do corpo;
   *   3. a coluna, que contra-gira o quadril;
   *   4. os bracos, em contrafase com a perna do mesmo lado;
   *   5. a CABECA, que desconta tudo isso pra continuar olhando pra frente.
   * O item 5 e o que mais mudou a leitura do movimento: cabeca que balanca
   * junto com o tronco e o que faz um personagem parecer um boneco de mola.
   */
  function poseLocomotion(w, run, amp) {
    if (w <= 0.001) return

    const A = _A
    for (const k in WALK) A[k] = mix(WALK[k], RUN[k], run)
    // `amp` encolhe o gesto INTEIRO quando o personagem anda devagar. Nao e
    // enfeite: quem anda devagar da passo curto, e e o mesmo numero que entra na
    // conta da cadencia (ver passoMetros) — se so um dos dois usasse, o pe
    // voltaria a deslizar.
    A.quadrilContato *= amp
    A.quadrilPico *= mix(0.70, 1, amp)
    A.quadrilExt *= amp
    A.joelhoBalanco *= mix(0.75, 1, amp)
    A.braco *= amp
    A.sobe *= amp
    const apoio = mix(APOIO_ANDAR, APOIO_CORRER, run)

    // Fase 0..1 de cada perna. A esquerda vem meio ciclo depois da direita.
    const fase = stride / TAU
    const tD = fase - Math.floor(fase)
    const tE = (fase + 0.5) - Math.floor(fase + 0.5)

    // SINAL DE REFERENCIA DO CICLO: +1 quando a perna ESQUERDA esta a frente.
    //
    // Ele nao e sin(stride), e essa distincao ja custou um bug: stride = 0 e o
    // ataque de calcanhar da perna DIREITA, ou seja, o momento em que a direita
    // esta mais a frente. Logo o sinal "esquerda a frente" vale -1 em stride = 0
    // e +1 em stride = PI — que e exatamente -cos(stride). Com sin(stride) tudo
    // que depende do lado (braco, queda do quadril, contra-rotacao) sai 90 graus
    // fora de fase, e o boneco anda com o braco e a perna do mesmo lado juntos.
    const sw = -Math.cos(stride)
    // O outro sinal: +1 quando o peso esta sobre o pe DIREITO (meio do apoio da
    // direita). Meio apoio da direita cai em tD = apoio/2, e o pico de
    // sin(stride) esta perto o bastante disso pra servir.
    const peso = Math.sin(stride)

    cicloPerna(tE, A, apoio, _pernaE)
    cicloPerna(tD, A, apoio, _pernaD)

    if (d.legLUpper) d.legLUpper.rx += _pernaE.quadril * w
    if (d.legRUpper) d.legRUpper.rx += _pernaD.quadril * w
    if (d.legLLower) d.legLLower.rx += _pernaE.joelho * w
    if (d.legRLower) d.legRLower.rx += _pernaD.joelho * w
    if (d.footL) d.footL.rx += _pernaE.torno * w
    if (d.footR) d.footR.rx += _pernaD.torno * w

    // A perna no balanco abre um pouco pra fora pra passar pela outra: sem
    // isso, com passada grande, um pe atravessa o outro. E tambem o que faz a
    // marcha nao ser em linha reta, que e o jeito que ninguem anda.
    // pulso() e obrigatorio aqui: um degrau (abre no balanco, fecha no apoio)
    // faria a perna dar um pinote no instante do ataque.
    const abreE = A.passoLargo * pulso(tE, apoio, 1.0)
    const abreD = A.passoLargo * pulso(tD, apoio, 1.0)
    if (d.legLUpper) d.legLUpper.rz += -abreE * w
    if (d.legRUpper) d.legRUpper.rz += abreD * w

    // --- quadril: o peso do corpo --------------------------------------------
    if (d.hips) {
      // 1) SOBE E DESCE — pela GEOMETRIA, nao por senoide (ver quedaDoQuadril).
      //    O quadril fica na altura que a perna MAIS ESTICADA das duas pede: e
      //    ela que esta apoiada no chao. Assim o pe de apoio nunca atravessa o
      //    piso e o balanco vertical sai com a fase e a amplitude corretas de
      //    graca — duas vezes por ciclo, alto no meio do apoio, baixo no duplo
      //    apoio.
      const quedaE = quedaDoQuadril(_pernaE.quadril * w, _pernaE.joelho * w)
      const quedaD = quedaDoQuadril(_pernaD.quadril * w, _pernaD.joelho * w)
      let py = Math.max(quedaE, quedaD) - PERNA_RETA
      // TETO DE QUEDA. Durante o VOO da corrida as duas pernas estao dobradas e
      // a conta pediria um quadril 33 cm abaixo do normal — porque a conta
      // pressupoe um pe no chao, e no voo nao ha. Sem o teto o boneco agachava
      // a cada passo da corrida. O teto e mais apertado correndo justamente
      // porque e la que existe voo; andando ele quase nunca entra (a queda
      // maxima medida e 6.4 cm).
      if (py < -A.teto) py = -A.teto
      d.hips.py += py

      //    O VOO da corrida e o unico pedaco que a geometria nao entrega: ali
      //    os dois pes estao no ar e quem levanta o corpo e a inercia, nao a
      //    perna. O pico fica entre o desprendimento de um pe e o ataque do
      //    outro — em stride = 0.84 PI e 1.84 PI, com apoio = 0.34.
      if (run > 0.01) {
        const voo = Math.max(0, Math.cos(2 * stride - 1.68 * Math.PI))
        d.hips.py += A.sobe * 0.9 * run * voo * w
      }

      // 2) DESLIZA pro lado do pe de apoio. E o que impede o boneco de andar
      //    como se estivesse sobre um trilho: o centro de massa TEM que ficar
      //    sobre o pe que esta no chao ou a pessoa cai.
      d.hips.px += A.desliza * peso * w

      // 3) QUEDA PELVICA. Do lado da perna que esta no ar o quadril CAI alguns
      //    graus (na fisioterapia isso e o sinal de Trendelenburg). E o detalhe
      //    que mais sozinho faz a caminhada parecer humana em vez de mecanica.
      // rz > 0 levanta o lado +X (direito) e baixa o -X (esquerdo). Com o peso
      // na direita, quem esta no ar e a esquerda — e ela que tem que cair.
      d.hips.rz += A.quedaPelvica * peso * w

      // 4) GIRO TRANSVERSO: o quadril acompanha a perna que AVANCA. Com o peso
      //    na direita, quem avanca e a esquerda (-X), e o lado -X tem que ir
      //    pra frente (+Z) — o que pede ry POSITIVO.
      d.hips.ry += A.giroQuadril * peso * w
    }

    // --- coluna: contra-rotacao ----------------------------------------------
    // O tronco gira ao CONTRARIO do quadril, e a diferenca entre os dois cresce
    // subindo pela coluna. E isso que faz o ombro e o quadril andarem em
    // sentidos opostos — sem a contra-rotacao o corpo gira em bloco, como uma
    // porta.
    if (d.torso) {
      d.torso.ry += -A.giroTronco * 0.45 * peso * w
      d.torso.rz += -A.quedaPelvica * 0.5 * peso * w
    }
    if (d.chest) {
      d.chest.ry += -A.giroTronco * peso * w
      // o peito afunda de leve a cada aterrissagem (2x por ciclo)
      d.chest.rx += 0.030 * (1 + run) * Math.max(0, Math.cos(2 * stride)) * w
    }

    // --- bracos ---------------------------------------------------------------
    // Em contrafase com a perna do MESMO lado. E assimetrico de proposito: o
    // braco vai mais pra tras do que pra frente (bracoAtras > 1), que e como
    // braco humano balanca. Simetrico, o balanco lia como um metronomo.
    // rx > 0 leva o braco pra TRAS. Quando a perna esquerda esta a frente
    // (sw = +1), o braco esquerdo tem que estar atras — entao bE = sw direto.
    const bE = sw
    const bD = -sw
    const swing = (b) => (b > 0 ? b * A.bracoAtras : b)

    if (d.armLUpper) {
      d.armLUpper.rx += A.braco * swing(bE) * w
      d.armLUpper.rz += (-A.ombro - 0.04 * Math.abs(bE)) * w
      d.armLUpper.ry += -0.05 * bE * w
    }
    if (d.armRUpper) {
      d.armRUpper.rx += A.braco * swing(bD) * w
      d.armRUpper.rz += (A.ombro + 0.04 * Math.abs(bD)) * w
      d.armRUpper.ry += 0.05 * bD * w
    }
    // Cotovelo: fecha quando a mao vem pra FRENTE. Na corrida a flexao base
    // sobe pra perto de 90 graus e quase nao oscila — correr de braco esticado
    // e a marca registrada de animacao mal feita.
    const cotE = A.cotovelo + A.cotoveloOsc * Math.max(0, -bE)
    const cotD = A.cotovelo + A.cotoveloOsc * Math.max(0, -bD)
    if (d.armLLower) d.armLLower.rx += -cotE * w
    if (d.armRLower) d.armRLower.rx += -cotD * w
    // a mao acompanha o antebraco com um atraso (inercia da mao solta)
    if (d.handL) d.handL.rx += -0.16 * cotE * w
    if (d.handR) d.handR.rx += -0.16 * cotD * w

    // --- cabeca: estabilizacao ------------------------------------------------
    // A cabeca DESCONTA a rotacao do tronco e a queda do quadril, em vez de
    // somar a elas. Um humano andando mantem a cabeca praticamente parada no
    // espaco (e o reflexo vestibulo-ocular); um boneco de mola nao. Era isso que
    // faltava — a versao antiga somava mais balanco na cabeca.
    // O desconto e parcial (0.75): desconto total le como cabeca presa num
    // suporte, que e o outro extremo.
    // A soma que chega ao pescoco e torso(-0.45) + chest(-1.00) = -1.45 vezes
    // giroTronco; devolver 62% disso deixa a cabeca quase parada no espaco sem
    // ela parecer presa num suporte.
    if (d.neck) {
      d.neck.ry += A.giroTronco * 0.90 * peso * w
      // o mesmo pro tombo lateral: quadril(+1.00) + torso(-0.50) = +0.50 de
      // quedaPelvica chegando aqui; devolvemos 70% disso.
      d.neck.rz += -A.quedaPelvica * 0.35 * peso * w
    }
    if (d.head) {
      // um resto minimo de movimento, senao a cabeca parece congelada
      d.head.rx += -0.012 * Math.cos(2 * stride) * w
    }
  }

  // No ar: pernas recolhidas, bracos levemente pra cima.
  function poseAir(w, vy) {
    if (w <= 0.001) return
    const up = clamp01(vy * 0.25 + 0.5)  // 1 subindo, 0 caindo
    const tuck = mix(0.45, 0.95, up)
    if (d.legLUpper) d.legLUpper.rx += -0.70 * tuck * w
    if (d.legRUpper) d.legRUpper.rx += -0.42 * tuck * w
    if (d.legLLower) d.legLLower.rx += 1.15 * tuck * w
    if (d.legRLower) d.legRLower.rx += 0.70 * tuck * w
    if (d.footL) d.footL.rx += 0.30 * w
    if (d.footR) d.footR.rx += 0.42 * w
    if (d.armLUpper) { d.armLUpper.rx += -1.05 * w; d.armLUpper.rz += -0.42 * w }
    if (d.armRUpper) { d.armRUpper.rx += -0.90 * w; d.armRUpper.rz += 0.42 * w }
    if (d.armLLower) d.armLLower.rx += -0.55 * w
    if (d.armRLower) d.armRLower.rx += -0.45 * w
    if (d.hips) { d.hips.py += -0.05 * w; d.hips.rx += -0.10 * w }
    if (d.torso) d.torso.rx += mix(0.16, -0.06, up) * w
    if (d.chest) d.chest.rx += 0.05 * w
  }

  /**
   * SEGURANDO ALGUMA COISA NA DIREITA: garrafa, lata, revolver.
   *
   * Sem isto, o boneco CORRIA BOMBEANDO OS DOIS BRACOS com uma garrafa de um
   * litro presa na mao direita — e a garrafa, que e filha da junta handR,
   * acompanhava o bombeamento inteiro. Em 1a pessoa ninguem ve; em 3a pessoa e
   * a primeira coisa que se ve.
   *
   * O braco direito e PUXADO pra uma pose de carregar (cotovelo dobrado, mao na
   * altura do quadril, encostada no corpo) em vez de sobrescrito: sobra 18% do
   * balanco da passada, e sao esses 18% que impedem o braco de virar um pedaco
   * de madeira colado no tronco enquanto o esquerdo balanca. O esquerdo nao e
   * tocado — quem carrega com uma mao balanca a outra normalmente, e o
   * contraste entre os dois e o que vende o gesto.
   *
   * Usa o mesmo mecanismo do aceno (mix sobre os deltas ja calculados), que era
   * o unico precedente de "um braco tem dono" neste arquivo.
   */
  function poseSegurando() {
    if (wSegura <= 0.001) return
    const w = wSegura * 0.82
    const set = (part, rx, ry, rz) => {
      const k = d[part]
      if (!k) return
      k.rx = mix(k.rx, rx, w)
      k.ry = mix(k.ry, ry, w)
      k.rz = mix(k.rz, rz, w)
    }
    // rx < 0 leva o braco pra FRENTE (ver o swing() da locomocao); no antebraco
    // rx < 0 e o cotovelo dobrando, que e a mesma convencao do poseIdle.
    //
    // O COTOVELO DOBRA POUCO (-0.50, ~29 graus), e nao os -1.05 da primeira
    // tentativa. Com 60 graus de dobra a garrafa ia parar NA FRENTE DA BARRIGA
    // e sumia atras do tronco — e a camera de 3a pessoa deste jogo fica ATRAS do
    // personagem, entao o item que ele carrega simplesmente deixava de existir
    // na tela. Quem carrega uma garrafa pela rua leva o braco quase esticado,
    // com ela batendo na coxa: la ela aparece na silhueta, que e o ponto.
    // O BRACO FICA QUASE PENDIDO, e essa e a correcao que so uma MEDIDA achou.
    //
    // As duas primeiras tentativas dobravam o cotovelo (-1.05 e depois -0.50),
    // que e como se imagina "carregando uma garrafa". Medindo a posicao de
    // mundo da peca antes e depois da pose, o cotovelo dobrado empurrava a
    // garrafa 28 cm PRA FRENTE do corpo e 7 cm pra dentro — e a camera de 3a
    // pessoa deste jogo fica ATRAS do personagem, entao a garrafa ia parar
    // exatamente atras do tronco. Ela existia e nao aparecia, nas duas fotos.
    //
    // Quem anda na rua com uma garrafa leva o braco caido, a garrafa batendo na
    // coxa. Fica ao lado do corpo, aparece na silhueta, e o balanco de corrida
    // (que e o que esta pose existe pra matar) morre do mesmo jeito: o que
    // segura o braco e o mix, nao o angulo.
    //
    // O ALVO E QUASE A POSE DE REPOUSO DO BRACO, de proposito. A pergunta certa
    // nao e "que angulo tem quem carrega uma garrafa" — e "onde a garrafa
    // precisa estar pra aparecer". Parado, o braco em repouso ja poe a peca
    // 17 cm ao lado do corpo, que e onde ela le. Entao carregar copia esse
    // repouso e o rz abre mais um pouco.
    //
    // Repetir o repouso NAO deixa a pose inutil: o que segura o braco enquanto
    // o outro balanca e o MIX (82% de alvo fixo contra a passada), e nao o
    // angulo. E isso que mata o bombeamento de corrida, que e o defeito que
    // esta funcao existe pra corrigir.
    //
    // O SINAL DO rz FOI MEDIDO, nao lido: o comentario do poseIdle diz que
    // positivo no braco direito e "encostar no corpo", mas medindo a posicao de
    // mundo da garrafa e o contrario — positivo AFASTA. Com -0.06 (a tentativa
    // anterior) a peca vinha 6,5 cm pra dentro e sumia na coxa.
    set('armRUpper', 0.00, 0, 0.10)
    set('armRLower', -0.16, 0, -0.04)
    set('handR', 0.00, 0, 0.06)
  }

  // Aceno: sobrescreve o braco direito por ~1.9 s com envelope suave.
  function poseWave() {
    if (waveT < 0) return
    const DUR = 1.9
    const t = waveT / DUR
    // envelope: entra em 20%, sai nos ultimos 25%
    const env = smooth01(t / 0.2) * smooth01((1 - t) / 0.25)
    const osc = Math.sin(waveT * 11.5)
    const set = (part, rx, ry, rz) => {
      const k = d[part]
      if (!k) return
      k.rx = mix(k.rx, rx, env)
      k.ry = mix(k.ry, ry, env)
      k.rz = mix(k.rz, rz, env)
    }
    set('armRUpper', -2.05, 0.10, 0.62 + 0.10 * osc)
    set('armRLower', -0.45, 0.0, 0.30 * osc)
    set('handR', 0, 0, 0.35 * osc)
    if (d.chest) { d.chest.ry += -0.10 * env; d.chest.rx += -0.04 * env }
    if (d.head) d.head.rz += 0.05 * env * osc * 0.4
  }

  // --- update --------------------------------------------------------------

  function update(dt, state) {
    if (!captured) capture()
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1 // evita salto feio depois de um freeze

    const st = state || {}
    const speed = st.speed || 0
    const grounded = st.grounded !== false
    const running = !!st.running
    const moving = st.moving !== undefined ? !!st.moving : speed > 0.15
    const vy = st.vy || 0

    // pesos alvo
    const locoT = grounded ? smooth01(speed / 1.5) * (moving ? 1 : smooth01(speed / 0.8)) : 0
    // A TROCA ANDAR->CORRER COMECA EM 2 m/s, e nao em 3.4.
    //
    // O config poe WALK_SPEED em 3.1 m/s — que e 11 km/h, ou seja, ninguem
    // "caminha" nessa velocidade: um humano troca pra corrida por volta de
    // 2.1 m/s. Com o limiar em 3.4 o personagem andava o jogo inteiro em pose de
    // CAMINHADA a 3.1 m/s, e uma caminhada nessa velocidade so fecha com uma
    // cadencia de 7 passos por segundo — os pezinhos correndo que o dono viu.
    // Com o limiar em 2.0 ele ja entra em trote leve na velocidade padrao, que e
    // o gesto certo pra 11 km/h.
    const runT = clamp01((speed - 2.0) / 2.8) * (running ? 1 : 0.85)
    const airT = grounded ? 0 : 1

    wSit = damp(wSit, state && state.sitting ? 1 : 0, 8, dt)
    wLoco = damp(wLoco, locoT, 11, dt)
    wRun = damp(wRun, runT, 7, dt)
    wAir = damp(wAir, airT, grounded ? 9 : 16, dt)
    // 7 de lambda: a mesma faixa da rampa andar<->correr. Mais rapido que isso
    // e o braco dando um tranco no quadro em que a garrafa aparece.
    wSegura = damp(wSegura, segurando ? 1 : 0, 7, dt)

    // CADENCIA DERIVADA DO PASSO (ver passoMetros).
    //
    // amp encolhe o gesto quando ele anda devagar: passo curto de quem esta
    // caminhando devagar, passo inteiro a partir de ~1.4 m/s. O MESMO amp entra
    // na pose, entao a conta fecha e o pe nao desliza.
    const sp = Math.min(speed, 9)
    amp = damp(amp, mix(0.55, 1, smooth01(sp / 1.4)), 9, dt)
    // O passo sai do angulo NO CONTATO (nao do pico do balanco): e ele que
    // decide onde o pe pousa, e portanto o quanto o corpo avanca por passo.
    const flex = mix(WALK.quadrilContato, RUN.quadrilContato, wRun) * amp
    const ext = mix(WALK.quadrilExt, RUN.quadrilExt, wRun) * amp
    const passo = Math.max(0.12, passoMetros(flex, ext))
    // Teto de 3.9 ciclos/s. Ele foi escolhido pra NAO ENTRAR na velocidade
    // maxima do jogo: com RUN_SPEED = 6.2 m/s e passo de 78.7 cm a cadencia
    // pedida e 3.94, ou seja, o teto nunca corta em jogo normal e o pe nao
    // patina. Ele existe so como rede de seguranca pra velocidade anormal
    // (veiculo, empurrao, teleporte), onde a passada viraria um tremor.
    // O piso de 0.35 evita a animacao congelar quando o jogador encosta numa
    // parede e a velocidade real cai a quase zero com o wLoco ainda subindo.
    const hz = Math.min(3.9, RITMO * sp / (2 * passo)) || 0
    stride += TAU * Math.max(sp > 0.05 ? 0.35 : 0, hz) * dt
    if (stride > TAU) stride -= TAU * Math.floor(stride / TAU)
    tBreath += dt
    if (waveT >= 0) { waveT += dt; if (waveT > 1.9) waveT = -1 }

    clearDeltas()

    const sitK = 1 - wSit
    const ground = (1 - wAir) * sitK
    const idleW = (1 - wLoco) * ground

    // Respiracao (~4.3 s por ciclo) e piscada: o que resta de vida no idle.
    // Andando e correndo ela some, porque a passada ja mexe o tronco inteiro.
    const br01 = 0.5 + 0.5 * Math.sin(tBreath * TAU * 0.28)
    applyBreath(br01 * clamp01(idleW + wSit * 0.7))
    updateBlink(dt)

    poseIdle(idleW)
    poseLocomotion(wLoco * ground, wRun, amp)
    poseAir(wAir * sitK, vy)
    poseSit(wSit)

    // inclinacao do tronco pra frente cresce com a corrida
    const leanT = (mix(WALK.lean, RUN.lean, wRun) * wLoco) * ground
    leanCur = damp(leanCur, leanT, 8, dt)
    if (d.torso) d.torso.rx += leanCur * 0.65
    if (d.chest) d.chest.rx += leanCur * 0.35
    if (d.neck) d.neck.rx += -leanCur * 0.8   // mantem a cabeca no eixo

    // A ordem importa: carregar vem ANTES do aceno, porque acenar com a mao que
    // segura a garrafa e o aceno que ganha (e o gesto de erguer a mao, com a
    // garrafa junto). Depois de poseWave nada mais mexe no braco direito.
    poseSegurando()
    poseWave()
    apply()
    // DEPOIS do apply(): o balanco nao mexe em junta nenhuma (ele gira o slot
    // do colar), entao a ordem nao importa pro resultado — mas rodar por
    // ultimo deixa claro que ele nao participa da pose.
    balancarColar(dt, speed, grounded, vy)
  }

  function playWave() { waveT = 0 }

  return {
    update,
    playWave,
    isWaving: () => waveT >= 0,
    /**
     * Liga/desliga a pose de "tem coisa na mao direita". Quem chama e o main, a
     * cada quadro, com `mao.segurando || revolver.equipado`. A rampa e feita
     * aqui dentro (ver wSegura no update): quem chama nao precisa saber que a
     * transicao existe, e chamar todo quadro com o mesmo valor nao custa nada.
     */
    segurarNaDireita(v) { segurando = !!v },
  }
}

export default createAnimator
