import { POSES } from '../npc/npc.js'

// ---------------------------------------------------------------------------
// src/cassino/reacao-npc.js — O RICACO REAGE.
//
// Pedido: "o ricaco tem que REAGIR: olhar, mexer a cabeca, apoiar as maos na
// mesa". Um adversario de poker parado enquanto a mao acontece transforma a
// mesa numa maquina de cartas; e o corpo dele que carrega o blefe.
//
// TRES CANAIS, E A DIFERENCA ENTRE ELES E O QUE ESTE ARQUIVO EXISTE PRA
// RESPEITAR
//
//   1. A POSE, por `npc.setPose(nome)`. E a API do proprio NPC: ela escreve a
//      rotacao de REPOUSO de cada junta, e o update do NPC anima em cima disso
//      (respiracao, balanco, deriva de braco). Muda o que o corpo E.
//   2. O DESVIO, escrito por nos em `root.rotation.y` e `root.position`. Muda
//      onde o corpo ESTA. Roda todo quadro, com filtro, e SOMA a pose.
//   3. O GESTO DE BRACO, que e novo e merece o paragrafo abaixo inteiro.
//
// COMO O BRACO SE MEXE SEM EDITAR npc/npc.js
//
// O comentario antigo deste arquivo dizia que escrever direto nas juntas nao
// adianta, "porque `npc.update()` reescreve todas elas a partir da pose no
// quadro seguinte". Isso esta certo — e e exatamente a brecha. Olhe o setPose:
//
//     for (const n of JOINT_NAMES) base[n] = pose.j[n] || ZERO
//
// `base[n]` nao e uma copia: e uma REFERENCIA ao mesmo array que vive dentro de
// POSES[nome].j. E o update le `base[n]` todo quadro. Logo, mexer nos numeros
// DE DENTRO do array da pose e a mesma coisa que animar a junta — o update
// seguinte ja le o valor novo e escreve na rotacao. Nao ha um terceiro canal
// brigando com nada: a gente ANIMA A POSE.
//
// Isso so e seguro porque a pose de mesa e NOSSA. registrarPose() copia array
// por array (e nao Object.assign, que compartilharia os arrays de `sit` com a
// pose original) justamente pra que mexer aqui nunca vaze pro barbeiro sentado
// do outro lado do mapa. Se um dia alguem trocar essa copia por uma rasa, o
// ricaco batendo na mesa vai mexer o braco de todo NPC sentado do jogo.
//
// O QUE ELE FAZ COM O CORPO, e o pedido que gerou cada um:
//   maos nas pernas  "quero que o npc fique com as maos nas pernas"  — repouso
//   duas batidas     "se ele der check, com a mao fechada bata na mesa, duas
//                     batidas" — o gesto universal de mesa
//   fold             "quando for fold quero que ele faca um movimento que
//                     simbolize fold" — a mao joga as cartas pro lado
//   empurra tudo     "all in tb ele meio que empurrando todas as fichas"
//   paga             "quando o npc pagar tb quero uma animacao"
//
// UMA COISA QUE NAO DEU: a MAO FECHADA. O esqueleto de player/character.js tem
// uma junta por mao e nenhuma por dedo — a mao e uma peca so, com os dedos
// modelados na geometria. Nao ha o que fechar. O que da pra fazer, e o que esta
// aqui, e virar o punho de modo que os nos dos dedos ficam pra baixo e o dorso
// pra lente: a 3,5 m de distancia a batida le pela TRAJETORIA (sobe, desce
// rapido, para seco, sobe de novo), nao pelos dedos.
//
// OS ANGULOS FORAM MEDIDOS, NAO CHUTADOS. Com o ricaco na cadeira do poker
// (z=24.72) e o feltro em y=0.94, a mao na pose `sit` para em y=0.83 e z=24.35
// — quinze centimetros abaixo do tampo, no colo. A posicao de mesa poe as duas
// em y~1.05 e z~24.26, que e em cima do ARO ESTOFADO da mesa (o "rail", topo em
// 1.025), com o cotovelo em 0.94 atras dele: antebraco subindo pro aro, que e
// como um jogador de poker senta de verdade.
//
// A CABECA JA ACOMPANHA SOZINHA: world/casino.js liga npc.lookTarget na cabeca
// do jogador enquanto ele esta a menos de 4,5 m do ricaco, que e exatamente a
// distancia de quem esta sentado na cadeira da frente. Nao ha nada a fazer por
// aqui, e mexer nisso brigaria com aquele update.
// ---------------------------------------------------------------------------

/** Nome da pose que este modulo ensina ao NPC. Prefixado pra nunca colidir
 *  com uma pose que npc/npc.js venha a ganhar depois. */
const POSE_MESA = 'cassino-mesa'

/** As juntas que este modulo anima. Toda uma delas PRECISA existir na pose (ver
 *  registrarPose): junta que falta na pose cai no array ZERO compartilhado de
 *  npc/npc.js, e mexer naquele array mexeria em todo NPC do jogo. */
const JUNTAS = [
  'armRUpper', 'armRLower', 'handR',
  'armLUpper', 'armLLower', 'handL',
  'chest',
]

/**
 * REPOUSO: as maos nas pernas.
 *
 * Substituiu os bracos apoiados no aro da mesa por pedido direto ("quero que o
 * npc fique com as maos nas pernas"), e a troca melhorou uma coisa que nao
 * estava no pedido: com as maos ja em cima do pano, todo gesto de aposta
 * partia da mesa e chegava na mesa, um palmo de curso. Do colo ate o aro sao
 * 22 cm de braco — agora o gesto TEM pra onde ir, e e isso que faz uma batida
 * parecer batida.
 *
 * Lembrete de sinal: o membro aponta pra -Y, entao rotation.x NEGATIVO joga
 * ele pra FRENTE. O braco cai quase reto (-0.30), o antebraco dobra forte
 * (-1.02) pra alcancar a coxa (que na pose sentada esta quase horizontal) e o
 * punho tomba pra frente (-0.44) pra a palma assentar em cima dela em vez de
 * a mao ficar espetada. A assimetria entre os dois lados e de proposito: duas
 * maos em angulos identicos leem como manequim.
 */
const MAOS_NAS_PERNAS = {
  armRUpper: [-0.30, 0, 0.19], armRLower: [-1.02, 0, -0.15], handR: [-0.44, 0, 0],
  armLUpper: [-0.26, 0, -0.21], armLLower: [-1.08, 0, 0.13], handL: [-0.48, 0, 0],
  chest: [0.02, 0, 0],
}

/**
 * POSICOES NOMEADAS que os gestos usam como destino. Cada uma so cita as
 * juntas que ela muda — o que ela nao cita volta pro repouso, e e isso que
 * deixa escrever "so o antebraco desce" sem redigitar o corpo inteiro.
 *
 * Medidas contra a geometria da mesa (aro em y=1.025, feltro em 0.94):
 *   MESA_R/L    a mao pousada no aro
 *   BATE_CIMA   o punho levantado um palmo acima do aro
 *   BATE_BAIXO  o punho no aro. A diferenca entre os dois e 0.38 rad de
 *               antebraco, que com 33 cm de osso da ~12 cm de curso de mao: da
 *               pra ver da cadeira da frente e nao vira soco.
 */
const POS = {
  MESA_R: { armRUpper: [-1.04, 0, 0.24], armRLower: [-1.10, 0, -0.22], handR: [-0.10, 0, 0] },
  MESA_L: { armLUpper: [-0.98, 0, -0.26], armLLower: [-1.18, 0, 0.20], handL: [-0.14, 0, 0] },
  // punho virado: o dorso pra lente e os nos pra baixo. E o mais perto de mao
  // fechada que um esqueleto sem dedo chega (ver a nota do cabecalho).
  BATE_CIMA: {
    armRUpper: [-1.00, 0, 0.22], armRLower: [-1.34, 0, -0.20], handR: [-0.62, 0.30, 0],
    chest: [0.06, 0, 0],
  },
  BATE_BAIXO: {
    armRUpper: [-1.06, 0, 0.22], armRLower: [-0.96, 0, -0.20], handR: [-0.78, 0.30, 0],
    chest: [0.09, 0, 0],
  },
  // FOLD: o braco sobe pro pano, o punho gira e a mao varre pro LADO. E o
  // muck: a carta nao vai pra frente, vai pro lixo, e a direcao e o que diz
  // isso — fold que empurra pra frente le como aposta.
  FOLD_PEGA: {
    armRUpper: [-1.12, 0.10, 0.20], armRLower: [-1.24, 0, -0.24], handR: [-0.30, 0, 0],
    chest: [0.11, 0, 0],
  },
  FOLD_JOGA: {
    armRUpper: [-0.86, -0.62, 0.44], armRLower: [-0.72, 0, -0.10], handR: [0.34, -0.70, 0],
    chest: [0.03, -0.16, 0],
  },
  // ALL-IN: os dois bracos vao pra tras das fichas e empurram tudo pro meio.
  // O peito entra junto (0.20 rad) porque quem empurra pilha alta empurra com
  // o tronco — braco sozinho le como quem esta pegando alguma coisa.
  TUDO_ATRAS: {
    armRUpper: [-1.26, 0.16, 0.30], armRLower: [-1.38, 0, -0.26], handR: [-0.34, 0, 0],
    armLUpper: [-1.22, -0.16, -0.32], armLLower: [-1.42, 0, 0.24], handL: [-0.36, 0, 0],
    chest: [0.13, 0, 0],
  },
  TUDO_EMPURRA: {
    armRUpper: [-1.52, 0.06, 0.16], armRLower: [-0.42, 0, -0.10], handR: [-0.06, 0, 0],
    armLUpper: [-1.50, -0.06, -0.18], armLLower: [-0.46, 0, 0.08], handL: [-0.08, 0, 0],
    chest: [0.20, 0, 0],
  },
  // PAGA: uma mao so, deslizando ficha pro meio. Curso menor que o all-in de
  // proposito — o tamanho do gesto tem que dizer o tamanho da aposta.
  PAGA_EMPURRA: {
    armRUpper: [-1.34, 0.08, 0.20], armRLower: [-0.66, 0, -0.16], handR: [-0.12, 0, 0],
    chest: [0.13, 0, 0],
  },
  // APOSTA: mais alto e mais seco que o pagar. A mao sobe antes de descer, que
  // e o gesto de quem LARGA ficha em vez de empurrar.
  APOSTA_CIMA: {
    armRUpper: [-1.30, 0.06, 0.26], armRLower: [-1.44, 0, -0.24], handR: [-0.46, 0.20, 0],
    chest: [0.08, 0, 0],
  },
  APOSTA_LARGA: {
    armRUpper: [-1.20, 0.04, 0.18], armRLower: [-0.78, 0, -0.14], handR: [0.10, 0, 0],
    chest: [0.15, 0, 0],
  },
}

/**
 * OS GESTOS, em marcos de tempo.
 *
 * Cada marco e [instante em segundos, posicao, seco?]. Entre dois marcos a
 * gente interpola com suavizacao nas duas pontas, MENOS onde 'seco' esta
 * ligado: a descida de uma batida tem que chegar acelerando e parar de uma
 * vez, senao a mao encosta no pano como quem esta com medo dele.
 *
 * `null` e o repouso. O ultimo marco sempre volta pra ele: gesto que termina
 * em qualquer outro lugar deixa o braco preso la ate o proximo, e depois de
 * duas maos o ricaco esta com o braco no ar sem motivo nenhum.
 */
const GESTOS = {
  // DUAS BATIDAS. A segunda e mais curta que a primeira (0.10 s de subida
  // contra 0.14): batida de mesa e assim, a segunda e o eco da primeira. Sem
  // essa diferenca as duas leem como um tique de relogio.
  bate: [
    [0.00, null],
    [0.26, POS.BATE_CIMA],
    [0.38, POS.BATE_BAIXO, true],
    [0.52, POS.BATE_CIMA],
    [0.62, POS.BATE_BAIXO, true],
    [0.78, POS.MESA_R],
    [1.45, null],
  ],
  fold: [
    [0.00, null],
    [0.24, POS.FOLD_PEGA],
    [0.40, POS.FOLD_JOGA, true],
    [0.66, POS.FOLD_JOGA],
    [1.25, null],
  ],
  tudo: [
    [0.00, null],
    [0.32, POS.TUDO_ATRAS],
    [0.60, POS.TUDO_EMPURRA, true],
    [1.10, POS.TUDO_EMPURRA],
    [1.80, null],
  ],
  paga: [
    [0.00, null],
    [0.26, POS.MESA_R],
    [0.52, POS.PAGA_EMPURRA, true],
    [0.84, POS.PAGA_EMPURRA],
    [1.40, null],
  ],
  aposta: [
    [0.00, null],
    [0.24, POS.APOSTA_CIMA],
    [0.44, POS.APOSTA_LARGA, true],
    [0.74, POS.MESA_R],
    [1.35, null],
  ],
  // Fim de mao: as duas maos voltam pro aro e ficam. Nao e uma acao, e uma
  // pausa — e uma pausa com o corpo em outro lugar le como o fim de alguma
  // coisa, que e o que o showdown precisa.
  mesa: [
    [0.00, null],
    [0.40, Object.assign({}, POS.MESA_R, POS.MESA_L)],
    [2.20, Object.assign({}, POS.MESA_R, POS.MESA_L)],
    [2.90, null],
  ],
}

/**
 * Ensina a pose ao catalogo do NPC, uma vez por sessao. Devolve o nome dela,
 * ou null se nem a pose `sit` existir (esqueleto trocado): sem base pra clonar
 * nao ha o que registrar, e o modulo segue sem pose.
 *
 * A COPIA E PROFUNDA, E ISSO NAO E ZELO: os gestos de braco escrevem DENTRO
 * destes arrays (ver a nota do cabecalho). Com um Object.assign raso, as juntas
 * que vieram de `sit` — as pernas, principalmente — continuariam sendo os
 * MESMOS arrays de POSES.sit, e o primeiro gesto que tocasse numa delas
 * mudaria a pose sentada de todo NPC do jogo. Copiando array por array, o que
 * este modulo anima e so dele.
 *
 * A pose tambem GARANTE toda junta de JUNTAS: junta ausente cai no ZERO
 * compartilhado do npc/npc.js, e escrever ali seria o mesmo acidente com um
 * alcance ainda maior.
 */
function registrarPose() {
  if (POSES[POSE_MESA]) return POSE_MESA
  const sentado = POSES.sit
  if (!sentado || !sentado.j) return null
  const j = {}
  for (const k in sentado.j) {
    const v = sentado.j[k]
    j[k] = Array.isArray(v) ? [v[0], v[1], v[2]] : v
  }
  for (const k in MAOS_NAS_PERNAS) {
    const v = MAOS_NAS_PERNAS[k]
    j[k] = [v[0], v[1], v[2]]
  }
  for (const k of JUNTAS) if (!Array.isArray(j[k])) j[k] = [0, 0, 0]
  POSES[POSE_MESA] = {
    // rootY vem de `sit` e nunca e digitado aqui: e ele que mantem o quadril na
    // altura da almofada, e world/casino.js calcula o SIT_LIFT da cadeira em
    // cima desse mesmo numero.
    rootY: sentado.rootY,
    j,
  }
  return POSE_MESA
}

const ZERO3 = [0, 0, 0]

/** Onde a junta `nome` esta na posicao `p`, caindo no repouso quando `p` nao
 *  fala dela. `null` e o proprio repouso. */
function alvoDaJunta(p, nome) {
  if (p && p[nome]) return p[nome]
  return MAOS_NAS_PERNAS[nome] || ZERO3
}

/** Suavizacao nas duas pontas. `seco` corta a de chegada: o movimento entra
 *  acelerando e para de uma vez, que e o que uma batida precisa. */
function suave(t, seco) {
  if (seco) return t * t
  return t * t * (3 - 2 * t)
}

/** Acha o corpo de um NPC do cassino pelo nome que world/casino.js deu a ele.
 *  E o CAMINHO DE VOLTA, nao o principal: quem tem `mundo.npcs` deve passar o
 *  NPC inteiro, porque so ele traz o setPose. */
export function acharNPC(raiz, nome, perto) {
  if (!raiz) return null
  let achado = null
  try { achado = raiz.getObjectByName(nome) } catch (err) { void err }
  if (achado) return achado
  // Nome e contrato fraco; posicao e geometria. Se o nome mudar la, procura
  // pelo corpo dinamico mais proximo do lugar dele.
  if (!perto) return null
  let melhor = null
  let d2 = 1.2 * 1.2
  raiz.traverse((o) => {
    if (!o.userData || !o.userData.dynamic) return
    const dx = o.position.x - perto.x
    const dz = o.position.z - perto.z
    const d = dx * dx + dz * dz
    if (d < d2) { d2 = d; melhor = o }
  })
  return melhor
}

/**
 * Da vida ao NPC.
 *
 * @param {object} alvo  o NPC de npc/npc.js (o bom: traz setPose) OU so o
 *                       Object3D do corpo (o caminho de volta: so desvio).
 *
 * Devolve no-ops se nao houver corpo — a mesa tem que funcionar igual num mundo
 * onde o NPC nao existe (teste, foto, cenario trocado).
 */
export function criarReacao(alvo) {
  // Um NPC de verdade tem setPose e root; um Object3D solto tem so a matriz.
  const npc = (alvo && typeof alvo.setPose === 'function' && alvo.root) ? alvo : null
  const corpo = npc ? npc.root : ((alvo && alvo.isObject3D) ? alvo : null)

  if (!corpo) {
    const nada = () => {}
    return {
      atualizar: nada, gesto: nada, braco: nada, entrar: nada, soltar: nada,
      disponivel: false, comPose: false, comBraco: false, gestoAtual: '',
    }
  }

  const base = {
    ry: corpo.rotation.y,
    x: corpo.position.x,
    y: corpo.position.y,
    z: corpo.position.z,
  }

  // Pose: so existe com o NPC inteiro na mao.
  const nomePose = npc ? registrarPose() : null
  let poseAntes = null

  // OS ARRAYS VIVOS DA POSE. Sao eles que o npc.update() le todo quadro (ver a
  // nota do cabecalho), entao escrever aqui E animar a junta. Guardados uma vez
  // so: procurar no POSES a cada quadro seria a mesma coisa, mais lenta.
  const juntas = nomePose && POSES[nomePose] ? POSES[nomePose].j : null
  let gesto2 = null      // marcos do gesto em curso
  let tGesto = 0         // quanto ele ja andou, em segundos
  let fimGesto = 0       // duracao total dele

  /**
   * Escreve as juntas do quadro.
   *
   * Sem gesto em curso ela ESCREVE O REPOUSO mesmo assim, e isso e de
   * proposito: o gesto anterior deixou numeros no array e ninguem mais os
   * limpa. Sem esta linha o ricaco terminaria a mao com o braco parado no
   * ultimo quadro do gesto — que e literalmente o defeito de "esqueceu de
   * voltar pro idle" que todo sistema de animacao ganha de graca quando o
   * repouso e implicito.
   */
  function escreverJuntas() {
    if (!juntas) return
    if (!gesto2) {
      for (const n of JUNTAS) {
        const r = MAOS_NAS_PERNAS[n] || ZERO3
        const j = juntas[n]
        if (j) { j[0] = r[0]; j[1] = r[1]; j[2] = r[2] }
      }
      return
    }
    // acha o par de marcos que cerca o instante atual
    let i = 0
    while (i < gesto2.length - 2 && gesto2[i + 1][0] <= tGesto) i++
    const a = gesto2[i]
    const b = gesto2[Math.min(i + 1, gesto2.length - 1)]
    const span = Math.max(1e-4, b[0] - a[0])
    const k = suave(Math.max(0, Math.min(1, (tGesto - a[0]) / span)), b[2])
    for (const n of JUNTAS) {
      const p0 = alvoDaJunta(a[1], n)
      const p1 = alvoDaJunta(b[1], n)
      const j = juntas[n]
      if (!j) continue
      j[0] = p0[0] + (p1[0] - p0[0]) * k
      j[1] = p0[1] + (p1[1] - p0[1]) * k
      j[2] = p0[2] + (p1[2] - p0[2]) * k
    }
  }

  /**
   * Dispara um gesto de braco. Um de cada vez, e o novo CORTA o antigo: duas
   * acoes do ricaco nunca acontecem juntas na regra do jogo, entao misturar
   * dois gestos so produziria um braco em lugar nenhum.
   */
  function braco(nome) {
    if (!juntas) return false
    const g = GESTOS[nome]
    if (!g || !g.length) { gesto2 = null; tGesto = 0; return false }
    gesto2 = g
    tGesto = 0
    fimGesto = g[g.length - 1][0]
    return true
  }

  // alvo atual do desvio, em relacao a base
  let aRy = 0, aZ = 0, aY = 0
  // valor filtrado (o que de fato e escrito)
  let ry = 0, z = 0, y = 0
  let ate = 0            // quanto tempo o gesto atual ainda vale
  let t = 0
  let balanco = 0        // amplitude do bamboleio de "pensando"

  /**
   * Senta a mesa: troca a pose e poe as maos nas pernas.
   *
   * A troca de pose e um CORTE (o setPose escreve o repouso das juntas de uma
   * vez, sem interpolar), entao ela acontece uma vez so por sessao de mesa, no
   * instante em que a camera comeca a viajar — a 3,5 m de distancia e com a
   * lente andando, o corte nao se ve. Trocar de pose no meio da mao, a cada
   * gesto, seria um salto visivel a cada aposta.
   */
  function entrar() {
    if (!npc || !nomePose || poseAntes !== null) return
    poseAntes = npc.pose || 'sit'
    // Zera as juntas ANTES do setPose. Os arrays da pose sao os nossos e eles
    // guardam o ultimo quadro escrito — se a sessao anterior acabou no meio de
    // um gesto (a mesa fechou com o braco no ar), o ricaco sentaria de novo
    // com aquele braco. Escrever o repouso primeiro faz a pose nascer limpa.
    gesto2 = null
    tGesto = 0
    escreverJuntas()
    npc.setPose(nomePose)
  }

  /**
   * Os gestos. Todos sao deslocamentos SOBRE a pose; nenhum deles troca de
   * pose, e e por isso que eles somam em vez de substituir.
   *
   *   'olha'     vira um pouco o tronco pro jogador
   *   'pensa'    bamboleia devagar, olhando o proprio jogo
   *   'apoia'    inclina pra frente: as maos deslizam do aro pro feltro
   *   'aposta'   empurra o tronco pra frente com forca e volta
   *   'recua'    joga o corpo pra tras (desistiu, ou levou susto)
   *   'ganha'    assenta no lugar, tronco reto, meio virado pro pote
   *   'perde'    afunda um pouco e vira o corpo pro lado
   *   'repouso'  volta pro que era
   */
  function gesto(nome, forca) {
    const f = Number.isFinite(forca) ? forca : 1
    balanco = 0
    switch (nome) {
      case 'olha': aRy = -0.10 * f; aZ = -0.015 * f; aY = 0; ate = 2.4; break
      case 'pensa': aRy = 0.05 * f; aZ = -0.02 * f; aY = -0.012 * f; balanco = 0.030 * f; ate = 5.0; break
      case 'apoia': aRy = 0; aZ = -0.070 * f; aY = -0.028 * f; ate = 3.2; break
      case 'aposta': aRy = -0.04 * f; aZ = -0.105 * f; aY = -0.020 * f; ate = 1.1; break
      case 'recua': aRy = 0.14 * f; aZ = 0.055 * f; aY = 0.006 * f; ate = 2.2; break
      case 'ganha': aRy = 0.08 * f; aZ = -0.040 * f; aY = 0.014 * f; balanco = 0.018 * f; ate = 3.0; break
      case 'perde': aRy = -0.16 * f; aZ = 0.030 * f; aY = -0.026 * f; ate = 3.0; break
      default: aRy = 0; aZ = 0; aY = 0; ate = 0; break
    }
  }

  function atualizar(dt) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1)
    t += d
    // O GESTO ANDA ANTES DO DESVIO porque as duas coisas somam na tela e a
    // ordem entre elas nao importa — o que importa e escrever as juntas TODO
    // quadro, inclusive nos quadros em que nao ha gesto (ver escreverJuntas).
    if (gesto2) {
      tGesto += d
      if (tGesto >= fimGesto) { gesto2 = null; tGesto = 0 }
    }
    escreverJuntas()
    if (ate > 0) {
      ate -= d
      if (ate <= 0) { aRy = 0; aZ = 0; aY = 0; balanco = 0 }
    }
    // Filtro exponencial e nao interpolacao linear: gesto de corpo comeca
    // rapido e chega devagar, e um lerp de duracao fixa faz o NPC parecer
    // acionado por motor de passo.
    const k = 1 - Math.exp(-4.2 * d)
    const alvoRy = aRy + Math.sin(t * 0.9) * balanco
    const alvoZ = aZ + Math.sin(t * 1.31 + 1.7) * balanco * 0.35
    ry += (alvoRy - ry) * k
    z += (alvoZ - z) * k
    y += (aY - y) * k
    corpo.rotation.y = base.ry + ry
    corpo.position.z = base.z + z
    corpo.position.y = base.y + y
  }

  /** Devolve o corpo E a pose exatamente como estavam. Sempre chamado ao sair
   *  da mesa, e idempotente: chamar duas vezes nao faz nada na segunda. */
  function soltar() {
    aRy = aZ = aY = 0
    ry = z = y = 0
    balanco = 0
    ate = 0
    // Mata o gesto E devolve as juntas ao repouso ANTES de trocar a pose: o
    // setPose de volta escreve base[] com os arrays da pose antiga, mas os
    // NOSSOS arrays continuam guardados em POSES[POSE_MESA] com o ultimo
    // quadro do gesto dentro. Da proxima vez que alguem sentar nesta mesa, o
    // ricaco nasceria com o braco no meio de um all-in.
    gesto2 = null
    tGesto = 0
    escreverJuntas()
    corpo.rotation.y = base.ry
    corpo.position.set(base.x, base.y, base.z)
    if (npc && poseAntes !== null) {
      npc.setPose(poseAntes)
      poseAntes = null
    }
  }

  return {
    atualizar,
    gesto,
    braco,
    entrar,
    soltar,
    disponivel: true,
    /** true quando ha setPose de verdade — o teste e a foto perguntam isto. */
    comPose: !!(npc && nomePose),
    /** true quando os gestos de braco podem rodar. E mais estreito que
     *  comPose: exige os arrays vivos da pose, nao so a pose registrada. */
    comBraco: !!(npc && nomePose && POSES[nomePose] && POSES[nomePose].j),
    /** Pro teste e pra foto: qual gesto esta no ar agora, ou ''. */
    get gestoAtual() {
      if (!gesto2) return ''
      for (const k in GESTOS) if (GESTOS[k] === gesto2) return k
      return '?'
    },
  }
}

export default criarReacao
