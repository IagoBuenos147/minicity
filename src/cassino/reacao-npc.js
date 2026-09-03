import { POSES } from '../npc/npc.js'

// ---------------------------------------------------------------------------
// src/cassino/reacao-npc.js — O RICACO REAGE.
//
// Pedido: "o ricaco tem que REAGIR: olhar, mexer a cabeca, apoiar as maos na
// mesa". Um adversario de poker parado enquanto a mao acontece transforma a
// mesa numa maquina de cartas; e o corpo dele que carrega o blefe.
//
// DOIS CANAIS, E A DIFERENCA ENTRE ELES E O QUE ESTE ARQUIVO EXISTE PRA
// RESPEITAR
//
//   1. A POSE, por `npc.setPose(nome)`. E a API do proprio NPC: ela escreve a
//      rotacao de REPOUSO de cada junta, e o update do NPC anima em cima disso
//      (respiracao, balanco, deriva de braco). Muda o que o corpo E.
//   2. O DESVIO, escrito por nos em `root.rotation.y` e `root.position`. Muda
//      onde o corpo ESTA. Roda todo quadro, com filtro, e SOMA a pose.
//
// O que NAO existe e um terceiro canal: escrever direto nas juntas
// (`character.parts.armRUpper.rotation`) nao adianta nada, porque
// `npc.update()` reescreve todas elas a partir da pose no quadro seguinte — e
// world/casino.js chama esse update DEPOIS de nos. Foi por isso que a primeira
// versao deste arquivo so mexia no root: ela recebia o `root` solto, sem a API.
// Agora ela recebe o NPC inteiro e a pose entrou no jogo.
//
// A POSE DE MESA E REGISTRADA DAQUI, e isso merece uma linha de aviso: `POSES`
// e um objeto exportado por npc/npc.js e nos ACRESCENTAMOS uma chave nele. E
// aditivo e seguro — ninguem no projeto itera `POSES`, todo consumidor le uma
// chave pelo nome (`POSES.sit`, `POSES.idle`) — e e a unica forma de ensinar
// uma pose nova sem editar npc/npc.js. A pose e CLONADA de `sit` e so troca os
// bracos e o peito: assim ela acompanha de graca qualquer reajuste do esqueleto
// sentado, inclusive o `rootY`, que e o que mantem o boneco na cadeira.
//
// OS ANGULOS FORAM MEDIDOS, NAO CHUTADOS. Com o ricaco na cadeira do poker
// (z=24.72) e o feltro em y=0.94, a mao na pose `sit` para em y=0.83 e z=24.35
// — quinze centimetros abaixo do tampo, no colo. A pose de mesa poe as duas em
// y~1.05 e z~24.26, que e em cima do ARO ESTOFADO da mesa (o "rail", topo em
// 1.025), com o cotovelo em 0.94 atras dele: antebraco subindo pro aro, que e
// como um jogador de poker senta de verdade. Esticar o braco ate o feltro (z
// 24.15) tambem fecha a conta, mas so com o cotovelo quase reto — ele fica com
// cara de quem esta pegando o pote, nao de quem esta jogando.
//
// A CABECA JA ACOMPANHA SOZINHA: world/casino.js liga npc.lookTarget na cabeca
// do jogador enquanto ele esta a menos de 4,5 m do ricaco, que e exatamente a
// distancia de quem esta sentado na cadeira da frente. Nao ha nada a fazer por
// aqui, e mexer nisso brigaria com aquele update.
// ---------------------------------------------------------------------------

/** Nome da pose que este modulo ensina ao NPC. Prefixado pra nunca colidir
 *  com uma pose que npc/npc.js venha a ganhar depois. */
const POSE_MESA = 'cassino-mesa'

/**
 * Bracos apoiados no aro da mesa. Ver a nota de medicao no cabecalho: o
 * cotovelo fica ABAIXO e ATRAS da mao, entao o antebraco sobe em direcao ao
 * aro — a silhueta de quem esta com os cotovelos na mesa, e nao de quem esta
 * esticando o braco. A leve assimetria entre os dois lados e de proposito:
 * duas maos em angulos identicos leem como manequim.
 */
const BRACOS_NA_MESA = {
  armRUpper: [-1.04, 0, 0.24], armRLower: [-1.10, 0, -0.22], handR: [-0.10, 0, 0],
  armLUpper: [-0.98, 0, -0.26], armLLower: [-1.18, 0, 0.20], handL: [-0.14, 0, 0],
  // o peito inclina 0.10 rad pra frente; sem isso o tronco fica reto e os
  // bracos parecem pendurados no lugar de apoiados
  chest: [0.10, 0, 0],
}

/**
 * Ensina a pose ao catalogo do NPC, uma vez por sessao. Devolve o nome dela,
 * ou null se nem a pose `sit` existir (esqueleto trocado): sem base pra clonar
 * nao ha o que registrar, e o modulo segue sem pose.
 */
function registrarPose() {
  if (POSES[POSE_MESA]) return POSE_MESA
  const sentado = POSES.sit
  if (!sentado || !sentado.j) return null
  POSES[POSE_MESA] = {
    // rootY vem de `sit` e nunca e digitado aqui: e ele que mantem o quadril na
    // altura da almofada, e world/casino.js calcula o SIT_LIFT da cadeira em
    // cima desse mesmo numero.
    rootY: sentado.rootY,
    j: Object.assign({}, sentado.j, BRACOS_NA_MESA),
  }
  return POSE_MESA
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
    return { atualizar: nada, gesto: nada, entrar: nada, soltar: nada, disponivel: false, comPose: false }
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

  // alvo atual do desvio, em relacao a base
  let aRy = 0, aZ = 0, aY = 0
  // valor filtrado (o que de fato e escrito)
  let ry = 0, z = 0, y = 0
  let ate = 0            // quanto tempo o gesto atual ainda vale
  let t = 0
  let balanco = 0        // amplitude do bamboleio de "pensando"

  /**
   * Senta com as maos na mesa.
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
    entrar,
    soltar,
    disponivel: true,
    /** true quando ha setPose de verdade — o teste e a foto perguntam isto. */
    comPose: !!(npc && nomePose),
  }
}

export default criarReacao
