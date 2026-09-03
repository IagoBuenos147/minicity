import * as THREE from 'three'
import { criarCameraCena } from '../systems/camera-cena.js'
import { criarEstacao, PLANTA } from '../bar/estacao.js'
import { criarGestos } from '../bar/gestos.js'
import { criarUIBar } from '../bar/ui-bar.js'
import { RECEITAS, receitaDe, ingredienteDe, comentarioDe } from '../bar/receitas.js'
import { createNPC, POSES } from '../npc/npc.js'
import { HIPS_Y } from '../player/character.js'
import { congelarPersonagem } from '../player/congelar.js'
import { copoDe } from '../mobilia/copos.js'
import * as Som from '../bar/som-bar.js'

// ---------------------------------------------------------------------------
// src/world/casino-bar.js — O BAR DO BARMAN, dentro do cassino.
//
// Este arquivo e a COSTURA, e so isso. A geometria mora em bar/estacao.js, os
// minijogos em bar/gestos.js, as receitas em bar/receitas.js. Aqui se resolve o
// que so o cassino sabe: onde encostar as coisas, quais colisores tirar, quem
// e o cliente, e quem paga.
//
// ================== O QUE ELE FAZ, NA ORDEM ================================
//
//   1. APOSENTA O BAR VELHO. O balcao de enfeite do fundo do salao (espelho,
//      garrafas falsas, banquetas, o neon BOA SORTE) nasceu num grupo NOMEADO
//      e com colisores marcados justamente pra poder sair inteiro. Sai o grupo
//      da cena e saem os colisores da lista — que ainda e uma lista PLANA, e
//      nao a grade de colisao: `world/casino.js` roda antes de `main.js`
//      chamar `collision.add`, entao dar splice aqui e a unica janela em que
//      isso e possivel sem uma funcao de remocao que a grade nao tem.
//      (O neon nao foi jogado fora: bar/estacao.js reconstroi ele em cima da
//      parede de bebidas nova.)
//
//   2. MONTA A ESTACAO e empurra colisores, occluders e pontos de E.
//
//   3. ABRE O MODO BARMAN no E da bancada, com systems/camera-cena.js.
//
//   4. SENTA UM CLIENTE na banqueta do meio e faz ele PEDIR. Servir o pedido
//      certo paga quase o dobro; servir qualquer coisa paga o que a nota valer.
//
// ================== TRES ARMADILHAS QUE ESTE ARQUIVO EVITA =================
//
// A COLISAO DO ALCAPAO NAO PODE SER O OBJETO QUE EU EMPURREI. `collision.add`
// COPIA o que recebe (esta escrito la, e mobilia/bar.js ja caiu nessa): mexer
// no `ativo` do meu objeto nao mexeria em nada. Como aqui a lista sobe por
// `world/casino.js` e eu nao vejo a grade na construcao, a caixa viva e
// encontrada no primeiro quadro com `collision.query()` pelo tag — que devolve
// as caixas INTERNAS, que sao as que mandam.
//
// A CAMERA SO PODE SER CRIADA COM O `game` NA MAO. `criarCameraCena` precisa do
// player e do hud, e o contrato deste modulo entrega o `game` so no update.
// Entao ela nasce PREGUICOSA, no primeiro quadro.
//
// NADA DE LUZ NOVA. Nem aqui nem na estacao. A parede de bebidas e
// retroiluminada com material EMISSIVO — ver a secao do travamento perto das
// lojas em ARCHITECTURE.md, e o cabecalho de render/luzes-efeito.js.
// ---------------------------------------------------------------------------

/** Tags do bar VELHO. Ver o item 1 do cabecalho. */
const TAGS_VELHAS = ['cassino-bar', 'cassino-banqueta']

/** Onde o jogador so pode encostar depois de levantar o alcapao. */
const TAG_ALCAPAO = 'bar-alcapao'

/** Quantos segundos o cliente espera antes de desistir do pedido. */
const PACIENCIA = 150
/** Quanto ele demora bebendo antes de pedir de novo. */
const BEBENDO = 22

/** Pagamento extra por servir EXATAMENTE o que foi pedido. */
const BONUS_PEDIDO = 1.75

const CHAVE_CARTA = 'mcrp-bar-carta'

/** A altura do assento da banqueta de bar/estacao.js. */
const ASSENTO = 0.78

const _v = new THREE.Vector3()

/** Le a carta de drinks descobertos. Nao passa pela rede, como a carteira. */
function lerCarta() {
  try {
    const cru = localStorage.getItem(CHAVE_CARTA)
    if (!cru) return []
    const o = JSON.parse(cru)
    return Array.isArray(o) ? o.filter((x) => typeof x === 'string') : []
  } catch (err) { void err; return [] }
}

function gravarCarta(lista) {
  try { localStorage.setItem(CHAVE_CARTA, JSON.stringify(lista)) } catch (err) { void err }
}

export function buildCasinoBar(ctx = {}) {
  const raiz = ctx.raiz
  const colliders = ctx.colliders || []
  const interactables = ctx.interactables || []
  const occluders = ctx.occluders || []
  const base = ctx.base !== undefined ? ctx.base : 0.16
  const dentro = ctx.dentro || { x0: 14.3, x1: 33.7, z0: 12.3, z1: 29.7 }

  if (!raiz) return { update() {} }

  // =========================================================================
  // 1. APOSENTA O BAR VELHO
  // =========================================================================
  if (ctx.barAntigo && ctx.barAntigo.parent) {
    ctx.barAntigo.parent.remove(ctx.barAntigo)
    ctx.barAntigo.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose()
    })
  }
  for (let i = colliders.length - 1; i >= 0; i--) {
    if (TAGS_VELHAS.indexOf(colliders[i] && colliders[i].tag) >= 0) colliders.splice(i, 1)
  }

  // =========================================================================
  // 2. A ESTACAO
  // =========================================================================
  const est = criarEstacao({ base, dentro })
  raiz.add(est.grupo)
  for (const c of est.colliders) colliders.push(c)
  for (const o of est.occluders) {
    occluders.push({
      minX: o.minX, maxX: o.maxX, minY: o.minY, maxY: o.maxY,
      minZ: o.minZ, maxZ: o.maxZ, tag: 'bar',
    })
  }

  const B = PLANTA.balcao
  const xAlc0 = B.x1 - PLANTA.alcapao.larg
  const cxAlc = xAlc0 + PLANTA.alcapao.larg / 2

  // O COLISOR DO ALCAPAO. Ele vai na lista comum, com um tag proprio, e a caixa
  // VIVA e achada no primeiro quadro (ver o cabecalho).
  colliders.push({
    minX: xAlc0, maxX: B.x1 - 0.06,
    minZ: B.z0 - 0.04, maxZ: B.z1 + 0.06,
    tag: TAG_ALCAPAO, ativo: true,
  })
  let colAlcapao = null

  // =========================================================================
  // 3. O CLIENTE
  // =========================================================================
  //
  // Um so, e ele fica sentado. O cassino ja tem tres NPCs e cada boneco
  // procedural custa; um bar com seis clientes seria bonito e seria o dobro do
  // custo de personagem do predio inteiro.
  //
  // A ALTURA DO ASSENTO NAO E CRAVADA. `POSES.sit.rootY` e `HIPS_Y` vem do
  // personagem, e foi assim que a barbearia aprendeu na marra: chumbar a altura
  // do quadril quebra no dia em que o esqueleto muda de proporcao.
  const SIT_HIP = HIPS_Y + (POSES.sit ? POSES.sit.rootY : 0)
  const LIFT = ASSENTO + 0.052 - (SIT_HIP - 0.011)
  const banqueta = est.banquetas[2] || { x: 20.6, z: PLANTA.banquetaZ }

  let cliente = null
  try {
    cliente = createNPC({
      name: 'Fausto', pose: 'sit',
      x: banqueta.x, y: LIFT, z: banqueta.z,
      rotY: 0,                            // olha pro +Z, que e o lado do balcao
      shirt: 0x2f4a6a, pants: 0x2a2c33, shoes: 0x241a12,
      appearance: {
        cabeca: 2, olhos: 3, nariz: 0, boca: 2, barba: 1,
        cabelo: 0, pele: 3, corCabelo: 1, corBarba: 1, sobrancelha: 0,
        chapeu: 0, calcado: 3, blusa: 1, calca: 2, colar: 0,
        anelAcess: 0, tatuagem: 1, relogio: 0, jaqueta: 0,
      },
    })
  } catch (err) { void err; cliente = null }
  if (cliente && cliente.root) {
    cliente.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    raiz.add(cliente.root)
    if (cliente.character && cliente.character.parts) {
      congelarPersonagem(cliente.root, { juntas: cliente.character.parts })
    }
    // 0,22 e nao 0,30: a banqueta do meio cai bem na faixa em que a mesa de
    // blackjack pede folga (nada abaixo de Z 26,30 entre X 18,25 e 21,75), e
    // um colisor de cliente sentado nao pode roubar espaco de outra mesa.
    colliders.push({
      minX: banqueta.x - 0.24, maxX: banqueta.x + 0.24,
      minZ: banqueta.z - 0.22, maxZ: banqueta.z + 0.26, tag: 'bar-cliente',
    })
  }

  // =========================================================================
  // 4. O MODO
  // =========================================================================
  const ui = criarUIBar()
  const gestos = criarGestos({ estacao: est, ui })
  let cena = null
  let carta = lerCarta()

  // --- o pedido -----------------------------------------------------------
  const pedido = { receita: null, t: 0, estado: 'chegando', servidos: 0, ganho: 0 }

  /**
   * SORTEIA O PROXIMO PEDIDO, com peso pra o que o jogador JA DESCOBRIU.
   *
   * Nao e sorteio puro: um cliente que pede sempre coisa nova transforma o bar
   * num quiz. Dois tercos das vezes ele pede algo que ja esta na carta (o
   * jogador sabe fazer e pode caprichar na execucao) e um terco algo novo, que
   * e o que faz a carta crescer.
   */
  function sortearPedido() {
    const conhecidas = RECEITAS.filter((r) => carta.indexOf(r.id) >= 0)
    const novas = RECEITAS.filter((r) => carta.indexOf(r.id) < 0)
    let lista = RECEITAS
    if (conhecidas.length && novas.length) {
      lista = Math.random() < 0.66 ? conhecidas : novas
    } else if (conhecidas.length) lista = conhecidas
    else if (novas.length) lista = novas
    const r = lista[Math.floor(Math.random() * lista.length)]
    pedido.receita = r
    pedido.t = 0
    pedido.estado = 'pedindo'
    gestos.setReceita(r)
    escreverQuadro()
    return r
  }

  /** As linhas da receita, se o jogador ja descobriu ela. */
  function linhasDaReceita(r) {
    if (!r) return []
    if (carta.indexOf(r.id) < 0) {
      return [
        r.desc,
        '',
        '(ainda nao esta na carta —',
        ' acerte uma vez pra anotar)',
      ]
    }
    const l = []
    for (const p of r.partes) {
      const ing = ingredienteDe(p[0])
      l.push('  ' + (p[1] % 1 === 0 ? p[1] : p[1].toFixed(2).replace(/0+$/, '')) + '  ' + (ing ? ing.nome : p[0]))
    }
    const cp = copoDe(r.copo)
    l.push('')
    l.push('  ' + (cp ? cp.nome : r.copo) + ' — ' + nomeMetodo(r.metodo))
    if (r.guarnicao && r.guarnicao.length) l.push('  gelo ' + r.gelo[0] + '-' + r.gelo[1] + ', com guarnicao')
    return l
  }

  function nomeMetodo(id) {
    if (id === 'batido') return 'batido'
    if (id === 'mexido') return 'mexido'
    if (id === 'liquidificado') return 'liquidificado'
    return 'montado no copo'
  }

  function escreverQuadro(titulo, linhas, cor) {
    if (!est.quadro) return
    if (titulo) { est.quadro.escrever(titulo, linhas, cor); return }
    if (pedido.estado === 'pedindo' && pedido.receita) {
      est.quadro.escrever(pedido.receita.nome, linhasDaReceita(pedido.receita), '#ffdca8')
      return
    }
    // sem pedido: a carta de drinks, que e o "menu" do bar
    const n = carta.length
    est.quadro.escrever('Carta da casa', n
      ? ['Ja anotados: ' + n + ' de ' + RECEITAS.length]
        .concat(carta.slice(-5).map((id) => '  ' + ((receitaDe(id) || {}).nome || id)))
      : ['A carta esta em branco.', 'Sirva um drink certo e', 'ele fica anotado aqui.'])
  }

  function descobrir(r) {
    if (!r || carta.indexOf(r.id) >= 0) return false
    carta = carta.concat([r.id])
    gravarCarta(carta)
    return true
  }

  // --- o que acontece quando o jogador serve -------------------------------
  function aoServir(dados, gm) {
    const r = dados.resultado
    const acertouPedido = pedido.estado === 'pedindo' && pedido.receita
      && r.receita && r.receita.id === pedido.receita.id
    const novo = r.nota >= 70 && r.receita ? descobrir(r.receita) : false

    if (acertouPedido) {
      const pago = Math.round(dados.valor * BONUS_PEDIDO)
      if (gm && gm.carteira && gm.carteira.ganharOuro) gm.carteira.ganharOuro(pago)
      pedido.ganho += pago
      pedido.servidos++
      pedido.estado = 'bebendo'
      pedido.t = 0
      pedido.receita = null
      gestos.setReceita(null)
      if (gm && gm.toast) {
        gm.toast('Fausto: "' + comentarioDe(r.nota) + '"  +' + pago + ' de ouro'
          + (novo ? '  ·  ' + r.receita.nome + ' foi pra carta.' : ''))
      }
      Som.acerto(true)
      escreverQuadro('Servido', ['+' + pago + ' de ouro', comentarioDe(r.nota)], '#a8e88a')
      return
    }

    // SEM PEDIDO CASADO: O COPO VAI PRA MAO DO JOGADOR. Foi ele que fez.
    //
    // E a bancada e LARGADA logo em seguida, com um segundo e meio de folga pra
    // a nota ser lida. Nao e capricho: `player/copo.js` monta a pose a partir
    // da matriz da camera do QUADRO ANTERIOR (main.js atualiza a mao antes dos
    // moduleUpdates), e com a lente presa no enquadramento do bar o copo
    // apareceria gigante e tremendo na frente da bancada. Servindo pra si
    // mesmo, o gesto certo e sair do balcao com o copo na mao.
    const ficha = copoDe(dados.copoId)
    if (gm && gm.copo && gm.copo.servir && ficha) {
      gm.copo.servir({
        id: dados.copoId, ficha,
        nivel: dados.nivel, cor: dados.cor, espuma: dados.espuma, nome: r.nome,
      })
      if (gm.copo.mostrar) gm.copo.mostrar(false)
      sairEm = 1.5
    }
    if (gm && gm.toast) {
      gm.toast(r.nome + ' — nota ' + r.nota + '. ' + comentarioDe(r.nota)
        + (novo ? '  ·  Anotado na carta.' : ''))
    }
    escreverQuadro(r.nome, [
      'Nota ' + r.nota,
      comentarioDe(r.nota),
      '',
      r.receita ? '' : ('Chegou perto de: ' + ((r.alvo && r.alvo.nome) || '—')),
    ], r.nota >= 70 ? '#a8e88a' : '#ffcf8a')
  }

  // =========================================================================
  // 5. OS PONTOS DE E
  // =========================================================================
  const est2 = { alcapao: 0, alvo: 0 }

  const pontoAlcapao = {
    id: 'bar-alcapao',
    position: new THREE.Vector3(cxAlc, base + B.h + 0.10, B.z0 - 0.34),
    radius: 1.7,
    label: 'Levantar a bancada',
    onInteract: () => {
      est2.alvo = est2.alvo > 0.5 ? 0 : 1
      const txt = est2.alvo > 0.5 ? 'Baixar a bancada' : 'Levantar a bancada'
      pontoAlcapao.label = txt
      pontoAlcapaoDentro.label = txt
    },
  }
  const pontoAlcapaoDentro = {
    id: 'bar-alcapao-dentro',
    position: new THREE.Vector3(cxAlc, base + B.h + 0.10, B.z1 + 0.34),
    radius: 1.5,
    label: 'Levantar a bancada',
    onInteract: () => pontoAlcapao.onInteract(),
  }
  interactables.push(pontoAlcapao, pontoAlcapaoDentro)

  const pontoBancada = {
    id: 'bar-bancada-trabalho',
    // NO CORREDOR, do lado de dentro: assumir a bancada e uma coisa que so
    // quem entrou pelo alcapao pode fazer. E o que da sentido ao alcapao.
    position: new THREE.Vector3(PLANTA.copo.x, base + 1.05, 28.18),
    radius: 1.9,
    label: 'Assumir a bancada',
    onInteract: (gm) => {
      if (gestos.ativo) { gestos.sair(); return }
      abrirModo(gm)
    },
  }
  interactables.push(pontoBancada)

  // o ponto de conversa com o cliente, do lado de FORA do balcao
  const pontoCliente = {
    id: 'bar-cliente',
    position: new THREE.Vector3(banqueta.x, base + 1.10, banqueta.z - 0.62),
    radius: 1.5,
    label: 'Falar com o Fausto',
    onInteract: (gm) => {
      if (!gm || !gm.toast) return
      if (pedido.estado === 'pedindo' && pedido.receita) {
        gm.toast('Fausto: "Eu pedi um ' + pedido.receita.nome + '. Ta escrito no quadro."')
      } else if (pedido.estado === 'bebendo') {
        gm.toast('Fausto: "Deixa eu terminar esse aqui primeiro."')
      } else {
        gm.toast('Fausto: "Ja ja eu penso em alguma coisa."')
      }
    },
  }
  interactables.push(pontoCliente)

  function abrirModo(gm) {
    if (!gm) return
    if (!cena) cena = criarCameraCena({ camera: gm.camera, player: gm.player, hud: gm.hud })
    gestos.entrar(gm, cena, {
      receita: pedido.estado === 'pedindo' ? pedido.receita : null,
      aoServir: (dados) => aoServir(dados, gm),
      aoSair: () => {
        pontoBancada.label = 'Assumir a bancada'
        escreverQuadro()
      },
    })
    pontoBancada.label = 'Sair da bancada'
    if (gm.toast) {
      gm.toast('Bancada assumida. Aponte e clique; [Q] volta, [F] serve, [Esc] sai.')
    }
  }

  // =========================================================================
  // 6. O UPDATE
  // =========================================================================
  const ANG_ALCAPAO = 1.36        // 78 graus, o mesmo de mobilia/bar.js
  let t = 0
  let primeiro = true
  let olhando = null
  let sairEm = 0

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    t += d

    // A CAMERA DA CENA, ANTES DE QUALQUER SAIDA ANTECIPADA.
    //
    // Ela TEM que rodar todo quadro em que existe, e nao so com o modo ligado:
    // a viagem de VOLTA pro jogador acontece depois de `sair()`, e um `return`
    // antecipado no meio dela deixaria a lente parada na bancada pra sempre.
    //
    // E tem que ser DEPOIS de player.update() — o controller escreve na camera
    // todo quadro e quem escreve por ultimo ganha. Isso esta garantido porque
    // world/casino.js chama este update de dentro de `moduleUpdates`, que o
    // laco do main roda depois do jogador (ver o cabecalho de camera-cena.js).
    if (cena) cena.atualizar(d)

    // a saida com o copo na mao (ver aoServir)
    if (sairEm > 0) {
      sairEm -= d
      if (sairEm <= 0) {
        sairEm = 0
        if (gm && gm.copo && gm.copo.mostrar) gm.copo.mostrar(true)
        gestos.sair()
      }
    }

    // --- a caixa VIVA do alcapao, achada uma vez ---------------------------
    if (primeiro) {
      primeiro = false
      if (gm && gm.collision && gm.collision.query) {
        const perto = gm.collision.query(cxAlc, (B.z0 + B.z1) / 2, 1.6)
        for (let i = 0; i < perto.length; i++) {
          if (perto[i].tag === TAG_ALCAPAO) { colAlcapao = perto[i]; break }
        }
      }
      escreverQuadro()
    }

    // --- o alcapao ---------------------------------------------------------
    if (est2.alcapao !== est2.alvo) {
      const passo = d * 3.2
      est2.alcapao += Math.sign(est2.alvo - est2.alcapao) * Math.min(passo, Math.abs(est2.alvo - est2.alcapao))
    }
    est.alcapao.rotation.x = -est2.alcapao * ANG_ALCAPAO
    if (colAlcapao) colAlcapao.ativo = est2.alcapao < 0.45

    // --- LOD: o bar so custa quadro com alguem por perto -------------------
    //
    // Fora do modo e longe da bancada nao ha o que animar: a torneira esta
    // fechada, a coqueteleira parada e o cliente e um boneco congelado. Mesmo
    // criterio do PERTO_UPDATE de systems/encaixe.js.
    const p = gm && gm.player && gm.player.position
    let perto = true
    let d2 = 0
    if (p && !gestos.ativo) {
      const dx = p.x - PLANTA.copo.x, dz = p.z - PLANTA.copo.z
      d2 = dx * dx + dz * dz
      perto = d2 < 16 * 16
    }

    // LOD DAS PECAS VIVAS. O que esta em `vivo` — as tres torneiras, a
    // coqueteleira, o liquidificador, o copo, a pinca, os fios de liquido — sao
    // 114 malhas que NAO passam pelo forno (por construcao: elas se mexem) e
    // portanto sao 114 draw calls fixos. Da porta do cassino, a dezoito metros,
    // uma alavanca de chope tem meio pixel. Some.
    //
    // O CORPO DO BAR NAO ENTRA NESTE LOD: balcao, bancada e parede de bebidas
    // sao a coisa que o jogador ve ao entrar, e sumir com eles seria o "predio
    // que aparece de repente" que o LOD da adega tomou o cuidado de evitar.
    const vivoVisivel = gestos.ativo || d2 < 19 * 19
    if (est.vivo.visible !== vivoVisivel) est.vivo.visible = vivoVisivel

    if (!perto) return

    gestos.atualizar(d, gm)

    // --- o cliente ---------------------------------------------------------
    if (cliente) {
      pedido.t += d
      if (pedido.estado === 'chegando' && pedido.t > 6) sortearPedido()
      else if (pedido.estado === 'bebendo' && pedido.t > BEBENDO) sortearPedido()
      else if (pedido.estado === 'pedindo' && pedido.t > PACIENCIA) {
        // ele desiste, mas nao vai embora: um cliente que some deixaria a
        // banqueta vazia e o bar sem loop nenhum
        pedido.estado = 'bebendo'
        pedido.t = 0
        pedido.receita = null
        gestos.setReceita(null)
        escreverQuadro()
        if (gm && gm.toast) gm.toast('Fausto desistiu do pedido e ficou no chope da casa.')
      }

      // ele olha pra quem chega, como os outros NPCs do cassino
      if (p) {
        const dx = p.x - banqueta.x, dz = p.z - banqueta.z
        if (dx * dx + dz * dz < 36) {
          if (!olhando) {
            const ch = gm && gm.character
            olhando = (ch && ch.parts && ch.parts.head) || (ch && ch.root) || null
          }
          if (olhando) cliente.lookTarget = olhando
        } else if (cliente.lookTarget) cliente.lookTarget = null
      }
      if (typeof cliente.update === 'function') cliente.update(d)
    }
  }

  return {
    update,
    estacao: est,
    gestos,
    /** Pro teste e pro console: `__game.barman.entrar()`. */
    entrar(gm) { abrirModo(gm) },
    sair() { gestos.sair() },
    /**
     * O JOGADOR ESTA NA BANCADA? Existe pro `uiAberta()` do main.js, e nao por
     * simetria de API.
     *
     * Sem isto o modo do bar ficava METADE aberto: o clique era desviado (os
     * gestos escutam em captura e param a propagacao), mas o TECLADO do jogo
     * continuava valendo por baixo — apertar 1 a 9 equipava um item da mochila
     * na mao, justamente o que `entrar()` acabou de limpar da lente, e o E
     * disparava a interacao mais perto. Quem responde "tem tela aberta?" no
     * jogo e o uiAberta(), e ele precisava de alguem pra perguntar.
     */
    get ocupado() { return gestos.ativo },
    get pedido() { return pedido.receita },
    get carta() { return carta.slice() },
    /** Zera a carta descoberta (so pro teste). */
    esquecerCarta() { carta = []; gravarCarta(carta); escreverQuadro() },
    novoPedido: sortearPedido,
    _v,
  }
}

export default buildCasinoBar
