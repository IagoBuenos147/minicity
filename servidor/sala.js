// ---------------------------------------------------------------------------
// servidor/sala.js — O ESTADO AUTORITATIVO. O servidor e o dono do mundo.
//
// POR QUE ESTE ARQUIVO EXISTE DO JEITO QUE ELE E:
//
// Neste jogo NINGUEM DISPUTA NADA. Nao ha combate, nao ha empurrao, nao ha
// vantagem em chegar 20 ms antes. Por isso aqui NAO tem predicao, NAO tem
// reconciliacao e NAO tem portao de aceitacao: o cliente e dono do proprio
// corpo e manda onde esta; o servidor e dono de TUDO que e compartilhado
// (NPCs e objetos) e diz como esta. Cada lado manda no que e dele e ninguem
// corrige ninguem. Isso e o que mantem este arquivo pequeno e sem magia.
//
// O QUE O SERVIDOR NUNCA ACEITA DO CLIENTE:
//   - posicao de NPC (nem olha);
//   - posicao de objeto que nao seja dele (OBJ_POS de quem nao e dono: lixo);
//   - a posicao final de um objeto solto (a queda e decidida AQUI).
//
// ROBUSTEZ: cada mensagem e escrita como se o pacote pudesse se perder,
// duplicar e chegar fora de ordem. Toda mensagem confiavel e IDEMPOTENTE:
// receber duas vezes tem que dar exatamente o mesmo resultado que receber
// uma. Em especial DESTRUIU, que e o unico irreversivel.
// ---------------------------------------------------------------------------

import {
  VERSAO_PROTOCOLO, TICK_HZ, MAX_JOGADORES,
  RAIO_PERDER_DIALOGO,
  NPCS, AGARRAVEIS, TIPOS_AGARRAVEL,
  PORTAL_DURACAO,
  distXZ, olharPara,
} from '../src/comum/mundo.js'
import { LEVELS, WORLD } from '../src/config.js'
import { BARBER, GROCERY, PARK } from '../src/world/layout.js'

// ---------------------------------------------------------------------------
// O PROTOCOLO VEM DE UM LUGAR SO: src/comum/protocolo.js.
//
// Ele e ESM puro e nao importa THREE nem nada de navegador, entao roda no Node
// igual. Antes o servidor montava os bytes na mao "para nao depender de um
// arquivo do cliente" — e o resultado foi o previsivel: duas implementacoes do
// mesmo formato binario, que divergiram em silencio (o OBJ_DONO do servidor
// levava a posicao, o do cliente lia so os dois u16 e jogava o resto fora).
// Uma implementacao so nao pode divergir de si mesma. Se o servidor precisar
// de um pacote novo, ele nasce LA, nunca aqui.
// ---------------------------------------------------------------------------
import * as Proto from '../src/comum/protocolo.js'

const {
  ENTRAR, MEU_ESTADO, MINHA_APARENCIA, FALAR, SAIR_DIALOGO, ESCOLHA,
  PEGAR, SOLTAR, ARREMESSAR, OBJ_POS, DESTRUIU,
  ABRIR_PORTAL, PEGAR_ITEM,
} = Proto.P

const TIPOS = { ...Proto.P }

const RECUSA_VERSAO = Proto.RECUSA_VERSAO
const RECUSA_CHEIO = Proto.RECUSA_CHEIO
const NEGADO_NPC = Proto.NEGADO_NPC
const NEGADO_OBJETO = Proto.NEGADO_OBJETO

// estados de objeto
const REPOUSO = Proto.EST_OBJ.REPOUSO
const SEGURO = Proto.EST_OBJ.SEGURO
const VOANDO = Proto.EST_OBJ.VOANDO
const DESTRUIDO = Proto.EST_OBJ.DESTRUIDO

// NPC conversando (EST_NPC.CONVERSANDO); os outros estados saem da pose.
const NPC_CONVERSANDO = Proto.EST_NPC.CONVERSANDO

// portal: faixa de id e o unico item que existe hoje
const PORTAL_ID_MIN = Proto.PORTAL_ID_MIN
const PORTAL_ID_MAX = Proto.PORTAL_ID_MAX
const PORTAL_MS = Math.max(1, PORTAL_DURACAO) * 1000

// ---------------------------------------------------------------------------
// ALTURA DO CHAO — a mesma regra do city.groundY(), so que sem THREE.
//
// Existe aqui porque QUEM DECIDE ONDE O OBJETO CAI E O SERVIDOR. Se cada
// maquina calculasse a queda, duas maquinas com um frame de diferenca
// colocariam o caixote em alturas diferentes e ninguem saberia qual e a certa.
// So comparacao de faixa: roda 15 vezes por segundo e nao pode custar nada.
// ---------------------------------------------------------------------------
const RH = WORLD.ROAD_HALF        // 8   rua de -8 a +8
const SWW = WORLD.SIDEWALK        // 4   calcada de 8 a 12
const BI = WORLD.BLOCK_INNER      // 12
const BO = WORLD.BLOCK_OUTER      // 52
const ROUT = WORLD.RING + RH      // 68  borda externa da rua do anel
const CORNER_R = 3.2              // raio das esquinas arredondadas
const SHOP_PAD = 0.9              // avental de calcada em volta do lote da loja
const METADE_MAPA = WORLD.GROUND / 2  // 100: fora disso nao existe chao

// lote + avental das duas lojas, nivelado com a calcada
const PISOS_LOJA = [BARBER, GROCERY].map((b) => ({
  x0: b.x0 - SHOP_PAD, x1: b.x1 + SHOP_PAD, z0: b.z0 - SHOP_PAD, z1: b.z1,
}))
// lajes do beco do quadrante sudeste
const PISOS_BECO = [
  [14, 34, 30, 34],
  [36, 52, 28, 32],
  [34, 36, 12, 34],
]

// Dentro do recorte em bezier da esquina arredondada volta a ser rua.
function naEsquinaRecortada(ax, az) {
  if (ax > RH + CORNER_R || az > RH + CORNER_R) return false
  return Math.sqrt((ax - RH) / CORNER_R) + Math.sqrt((az - RH) / CORNER_R) < 1
}

export function alturaDoChao(x, z) {
  const ax = Math.abs(x), az = Math.abs(z)
  // calcadas das avenidas centrais (bracos + quadrado da esquina)
  if (ax >= RH && ax <= BI && az >= RH && az <= BO) {
    return naEsquinaRecortada(ax, az) ? LEVELS.ROAD : LEVELS.SIDEWALK
  }
  if (az >= RH && az <= BI && ax >= RH && ax <= BO) {
    return naEsquinaRecortada(ax, az) ? LEVELS.ROAD : LEVELS.SIDEWALK
  }
  // calcadas do anel externo
  if (ax >= BO - SWW && ax <= BO && az >= BI && az <= BO) return LEVELS.SIDEWALK
  if (az >= BO - SWW && az <= BO && ax >= BI && ax <= BO) return LEVELS.SIDEWALK
  if (ax >= ROUT && ax <= ROUT + SWW && az <= ROUT + SWW) return LEVELS.SIDEWALK
  if (az >= ROUT && az <= ROUT + SWW && ax <= ROUT + SWW) return LEVELS.SIDEWALK
  // piso das lojas
  for (let i = 0; i < PISOS_LOJA.length; i++) {
    const p = PISOS_LOJA[i]
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return LEVELS.SHOP_FLOOR
  }
  // parque e beco
  if (x > PARK.x0 && x < PARK.x1 && z > PARK.z0 && z < PARK.z1) return LEVELS.PARK
  for (let i = 0; i < PISOS_BECO.length; i++) {
    const p = PISOS_BECO[i]
    if (x >= p[0] && x <= p[1] && z >= p[2] && z <= p[3]) return LEVELS.ALLEY
  }
  return LEVELS.ROAD   // asfalto e grama do resto do mapa
}

// ---------------------------------------------------------------------------
// APARENCIA
//
// Sao 6 indices de catalogo: hair, eyes, brows, mouth, hairColor, skin. O
// protocolo entrega e recebe este mesmo objeto, com estes mesmos nomes — o
// servidor nunca mexe em byte de aparencia na mao. Guardar em objeto (e nao em
// Uint8Array indexado) e o que impede que trocar a ordem dos campos um dia
// vire tom de pele no lugar de sobrancelha.
// ---------------------------------------------------------------------------
const CAMPOS_APARENCIA = ['hair', 'eyes', 'brows', 'mouth', 'hairColor', 'skin']

/** Copia so os 6 campos, cada um cortado em 0..255. Lixo vira 0. */
function limparAparencia(ap) {
  const a = ap || {}
  const saida = {}
  for (const k of CAMPOS_APARENCIA) {
    const n = a[k] | 0
    saida[k] = n < 0 ? 0 : (n > 255 ? 255 : n)
  }
  return saida
}

/** Numero que da para confiar: nao e NaN, nao e infinito, cabe no mapa. */
function finito(v, limite) {
  return Number.isFinite(v) && v >= -limite && v <= limite
}

/** Nome limpo: sem controle, sem espaco duplo, curto. Vai para a tela dos outros. */
function limparNome(s) {
  let n = String(s || '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (n.length > 16) n = n.slice(0, 16)
  return n || 'Jogador'
}

// pose do NPC em mundo.js -> estado do protocolo (0 parado, 1 trabalhando,
// 2 sentado, 3 cortando, 4 conversando)
const ESTADO_DA_POSE = {
  cut: Proto.EST_NPC.CORTANDO,
  sit: Proto.EST_NPC.SENTADO,
  work: Proto.EST_NPC.TRABALHANDO,
}

// ---------------------------------------------------------------------------

export function criarSala(opcoes = {}) {
  const log = opcoes.aoLog || function () { }

  /* jogadores por id. O id e a UNICA coisa que atravessa a rede; nada aqui e
     identificado por posicao em array nem por referencia de objeto. */
  const jogadores = new Map()

  /* Aparencia guardada por NOME: quem volta encontra o cabelo que escolheu.
     Por nome e nao por id porque o id morre junto com a conexao. */
  const aparenciaPorNome = new Map()

  /* Itens guardados por NOME, pelo mesmo motivo e no mesmo formato (1 byte de
     bits, ver Proto.ITENS_*): quem pegou a arma de portal e recarregou a
     pagina volta com ela. Se fosse por id, recarregar apagaria o item. */
  const itensPorNome = new Map()

  /* Portais abertos, por id (3000..3999). O SERVIDOR e o dono deles: ele da o
     id, conta o tempo e fecha. Portal NAO entra no snapshot — sao poucos, nao
     se mexem e nascem/morrem por evento confiavel. */
  const portais = new Map()

  /* NPCs: um por entrada de NPCS. Posicao e estado sao SEMPRE do servidor. */
  const npcs = new Map()
  for (const n of NPCS) {
    npcs.set(n.id, {
      id: n.id,
      chave: n.chave,
      x: n.x, z: n.z,
      yaw: n.yaw,
      yawBase: n.yaw,              // para onde ele volta a olhar quando a conversa acaba
      estadoBase: ESTADO_DA_POSE[n.pose] || 0,
      estado: ESTADO_DA_POSE[n.pose] || 0,
      falandoCom: 0,               // 0 = ninguem
      linha: 0,
      falas: n.falas,
      opcoes: n.opcoes,
    })
  }

  /* Objetos agarraveis: um por entrada de AGARRAVEIS, guardando de onde vieram
     para o snapshot poder omitir os que nunca sairam do lugar. */
  const objetos = new Map()
  for (const o of AGARRAVEIS) {
    const t = TIPOS_AGARRAVEL[o.tipo] || { h: 0.5 }
    objetos.set(o.id, {
      id: o.id,
      tipo: o.tipo,
      meiaAltura: t.h / 2,         // do centro ate a base: e o que assenta no chao
      x: o.x, y: o.y, z: o.z, rotY: 0,
      ox: o.x, oy: o.y, oz: o.z,   // origem, para saber o que e "parado no lugar"
      dono: 0,
      estado: REPOUSO,
    })
  }

  let tick = 0
  let ultimoId = 0
  let ultimoPortalId = PORTAL_ID_MIN - 1

  /* Id de jogador 1..999. Ele NAO volta a ser usado enquanto o dono anterior
     estiver online — e por isso que o laco anda para frente em vez de procurar
     o menor livre: reusar id de quem acabou de sair faria um pacote atrasado
     do jogador velho ser aplicado no jogador novo. */
  function novoId() {
    for (let i = 0; i < 999; i++) {
      ultimoId = (ultimoId % 999) + 1
      if (!jogadores.has(ultimoId)) return ultimoId
    }
    return 0
  }

  /* Id de portal 3000..3999, pela MESMA regra do id de jogador e pelo mesmo
     motivo: anda sempre para frente e nunca devolve um id que esteja em uso.
     Se o numero fosse reaproveitado, um PORTAL_FECHADO atrasado do portal
     velho apagaria da tela o portal novo que herdou o id. Com 20 jogadores e
     um portal cada, dar a volta nos 1000 leva horas de jogo. */
  function novoPortalId() {
    for (let i = 0; i < (PORTAL_ID_MAX - PORTAL_ID_MIN + 1); i++) {
      ultimoPortalId = ultimoPortalId >= PORTAL_ID_MAX ? PORTAL_ID_MIN : ultimoPortalId + 1
      if (!portais.has(ultimoPortalId)) return ultimoPortalId
    }
    return 0
  }

  // --- envio -------------------------------------------------------------

  function paraUm(jogador, buf, confiavel) {
    if (jogador && jogador.con) jogador.con.enviar(buf, confiavel)
  }

  function paraTodos(buf, confiavel, exceto) {
    for (const j of jogadores.values()) {
      if (j === exceto) continue
      if (j.con) j.con.enviar(buf, confiavel)
    }
  }

  // --- pacotes que o servidor escreve -------------------------------------
  //
  // Nada de bytes aqui: cada um destes e uma chamada ao protocolo comum. Se
  // um campo mudar de lugar, muda nos dois lados de uma vez.

  function pacoteObjDono(o) {
    return Proto.escreverObjDono(o.id, o.dono, o.x, o.y, o.z, o.rotY, o.estado)
  }

  function pacoteDialogo(npc) {
    return Proto.escreverDialogo(
      npc.id, npc.falandoCom, npc.linha, npc.opcoes ? npc.opcoes.length : 0,
    )
  }

  /* BEMVINDO: id, versao, ritmo, a aparencia que estava guardada e o mundo
     INTEIRO (todos os NPCs, todos os objetos, inclusive os destruidos). E o
     unico pacote que da o estado completo: dai para frente so chegam
     diferencas, e quem entra atrasado nao fica com um caixote fantasma. */
  function pacoteBemvindo(j) {
    return Proto.escreverBemvindo(
      j.id, j.aparencia, [...npcs.values()], [...objetos.values()], j.itens,
    )
  }

  function pacotePortalAberto(p) {
    return Proto.escreverPortalAberto(p.id, p.dono, p.x, p.y, p.z, p.yaw)
  }

  // --- entrada e saida ----------------------------------------------------

  /** Le o corpo do ENTRAR. Quem valida a versao e a sala; os bytes sao do
      protocolo. Pacote torto volta null e o chamador descarta. */
  function lerEntrar(dv) {
    return Proto.lerEntrar(dv)
  }

  function entrar(con, d) {
    if (!con || con.jogador) return null
    d = d || {}

    /* Versao errada e o cliente com o .js velho em cache. Ele PRECISA saber
       que e isso, senao passa a tarde caçando um bug que nao existe. */
    if (d.versao !== VERSAO_PROTOCOLO) {
      con.enviar(Proto.escreverRecusa(RECUSA_VERSAO), true)
      if (con.fechar) con.fechar()
      return null
    }
    if (jogadores.size >= MAX_JOGADORES) {
      con.enviar(Proto.escreverRecusa(RECUSA_CHEIO), true)
      if (con.fechar) con.fechar()
      return null
    }
    const id = novoId()
    if (!id) {
      con.enviar(Proto.escreverRecusa(RECUSA_CHEIO), true)
      if (con.fechar) con.fechar()
      return null
    }

    const nome = limparNome(d.nome)
    /* A aparencia guardada GANHA da que veio no pacote: quem volta encontra o
       cabelo que escolheu, mesmo tendo recarregado a pagina no meio. Trocar
       depois e um MINHA_APARENCIA, que grava por cima. */
    const guardada = aparenciaPorNome.get(nome)
    const aparencia = limparAparencia(guardada || d.aparencia)
    aparenciaPorNome.set(nome, limparAparencia(aparencia))

    /* Os itens seguem a aparencia: guardados por nome, devolvidos no BEMVINDO.
       Quem ja pegou a arma de portal volta com ela mesmo depois de recarregar
       a pagina — atravessar a cidade de novo por causa de um F5 seria castigo,
       nao jogo. */
    const itens = (itensPorNome.get(nome) | 0) & 0xff
    itensPorNome.set(nome, itens)

    const jogador = {
      id, nome, aparencia, itens, con,
      // spawn igual ao do single player; o cliente manda a posicao real no
      // primeiro MEU_ESTADO e a partir dai o corpo e dele
      x: 2, y: 0, z: 9, yaw: 0, anim: 0, flags: 0,
      vistoEm: Date.now(),
      npcEmDialogo: 0,      // id do NPC que ele esta ocupando (0 = nenhum)
      objetoNaMao: 0,       // id do objeto que ele esta segurando (0 = nenhum)
      portalId: 0,          // id do portal aberto por ele (0 = nenhum)
    }
    con.jogador = jogador
    jogadores.set(id, jogador)

    con.enviar(pacoteBemvindo(jogador), true)
    /* Quem chegou precisa saber quem ja estava; quem ja estava precisa saber
       quem chegou. As posicoes vem no snapshot logo em seguida. */
    for (const outro of jogadores.values()) {
      if (outro === jogador) continue
      con.enviar(Proto.escreverEntrou(outro.id, outro.nome, outro.aparencia), true)
    }
    paraTodos(Proto.escreverEntrou(jogador.id, jogador.nome, jogador.aparencia), true, jogador)

    /* Portal nao entra no snapshot, entao quem chega agora precisa receber um
       PORTAL_ABERTO de cada portal vivo — e o mesmo papel que o BEMVINDO faz
       pelos objetos parados. Mandar o evento (em vez de inventar um campo no
       BEMVINDO) deixa o cliente com UM caminho so para "portal apareceu". */
    for (const p of portais.values()) con.enviar(pacotePortalAberto(p), true)

    log('entrou #' + id + ' ' + nome + '  (' + jogadores.size + '/' + MAX_JOGADORES + ')')
    return jogador
  }

  /* Libera o NPC que este jogador travava. Idempotente: chamar duas vezes nao
     manda DIALOGO_FIM duas vezes. */
  function liberarDialogo(jogador) {
    const npcId = jogador.npcEmDialogo
    jogador.npcEmDialogo = 0
    if (!npcId) return
    const npc = npcs.get(npcId)
    if (!npc || npc.falandoCom !== jogador.id) return
    npc.falandoCom = 0
    npc.estado = npc.estadoBase
    npc.yaw = npc.yawBase
    npc.linha = 0
    paraTodos(Proto.escreverDialogoFim(npc.id), true)
  }

  /* Poe o objeto no chao naquele ponto e devolve a dono nenhum. E a mesma
     funcao para SOLTAR, para queda de conexao e para o dono sumir: um caminho
     so, entao nao existe caso em que o objeto fica preso em ninguem. */
  function assentarObjeto(o, x, z) {
    o.x = x
    o.z = z
    o.y = alturaDoChao(x, z) + o.meiaAltura
    o.dono = 0
    o.estado = REPOUSO
    paraTodos(pacoteObjDono(o), true)
  }

  /* Fecha um portal pelo id e avisa todos. IDEMPOTENTE: id que nao existe
     mais sai em silencio, sem mandar PORTAL_FECHADO de novo. E o unico
     caminho de fechamento do jogo — tempo esgotado, dono abriu outro, dono
     saiu e dono caiu a conexao passam todos por aqui, entao nao existe caso
     em que um portal fica aberto para sempre na tela dos outros. */
  function fecharPortal(portalId) {
    const p = portais.get(portalId)
    if (!p) return
    portais.delete(portalId)
    const dono = jogadores.get(p.dono)
    if (dono && dono.portalId === portalId) dono.portalId = 0
    paraTodos(Proto.escreverPortalFechado(portalId), true)
  }

  /* O portal daquele jogador, se ele tiver um. Existe para o "um portal por
     jogador" ter um lugar so, usado por ABRIR_PORTAL e por sair(). */
  function fecharPortalDoJogador(jogador) {
    if (!jogador || !jogador.portalId) return
    fecharPortal(jogador.portalId)
    jogador.portalId = 0
  }

  function sair(jogador) {
    if (!jogador) return
    /* Sair e idempotente: 'close' e 'error' do socket chegam os dois. */
    if (!jogadores.has(jogador.id) || jogadores.get(jogador.id) !== jogador) return
    jogadores.delete(jogador.id)

    // NADA pode ficar preso em quem nao esta mais aqui.
    liberarDialogo(jogador)
    /* Portal do ausente fecha NA HORA. Deixar aberto ate o tempo acabar seria
       um buraco verde no meio da rua sem dono, e o dono ja nao esta aqui para
       receber o PORTAL_FECHADO. */
    fecharPortalDoJogador(jogador)
    const objId = jogador.objetoNaMao
    jogador.objetoNaMao = 0
    if (objId) {
      const o = objetos.get(objId)
      /* Se ele ainda era dono (segurando ou com o objeto no ar), o objeto cai
         onde estava. Se ja tinha sido destruido, nao ressuscita. */
      if (o && o.dono === jogador.id && o.estado !== DESTRUIDO) assentarObjeto(o, o.x, o.z)
    }
    if (jogador.con) jogador.con.jogador = null
    paraTodos(Proto.escreverSaiu(jogador.id), true)
    log('saiu   #' + jogador.id + ' ' + jogador.nome + '  (' + jogadores.size + '/' + MAX_JOGADORES + ')')
  }

  // --- mensagens do cliente -----------------------------------------------

  function aoMensagem(jogador, tipo, dv) {
    if (!jogador || !jogadores.has(jogador.id)) return
    jogador.vistoEm = Date.now()

    switch (tipo) {

      /* O CORPO E DELE. Nao ha checagem de velocidade nem correcao: ninguem
         disputa nada, entao nao existe o que trapacear. So recusamos numero
         que nao e numero, porque NaN se espalharia pelo mundo inteiro. */
      case MEU_ESTADO: {
        const m = Proto.lerMeuEstado(dv)
        if (!m) return
        if (!finito(m.x, METADE_MAPA) || !finito(m.y, 500) || !finito(m.z, METADE_MAPA)) return
        jogador.x = m.x; jogador.y = m.y; jogador.z = m.z
        jogador.yaw = Number.isFinite(m.yaw) ? m.yaw : 0
        jogador.anim = m.anim; jogador.flags = m.flags
        return
      }

      case MINHA_APARENCIA: {
        const m = Proto.lerMinhaAparencia(dv)
        if (!m) return
        jogador.aparencia = limparAparencia(m.aparencia)
        aparenciaPorNome.set(jogador.nome, limparAparencia(jogador.aparencia))
        // o cabelo novo aparece na hora na tela dos outros
        paraTodos(Proto.escreverAparencia(jogador.id, jogador.aparencia), true, jogador)
        return
      }

      /* FALAR e um PEDIDO. Quem decide se o NPC esta livre e o servidor, e a
         resposta vai para TODOS: e o mesmo NPC, na mesma linha, na tela de
         todo mundo. */
      case FALAR: {
        const m = Proto.lerFalar(dv)
        if (!m) return
        const npc = npcs.get(m.npcId)
        if (!npc) return
        if (npc.falandoCom === jogador.id) {
          // repetiu o pedido (pacote duplicado, ou apertou E de novo): so
          // reafirma o estado. Idempotente.
          paraTodos(pacoteDialogo(npc), true)
          return
        }
        if (npc.falandoCom) {
          paraUm(jogador, Proto.escreverNegado(NEGADO_NPC, npc.id), true)
          return
        }
        liberarDialogo(jogador)      // ele nao pode travar dois NPCs
        npc.falandoCom = jogador.id
        npc.estado = NPC_CONVERSANDO
        npc.yaw = olharPara(npc.x, npc.z, jogador.x, jogador.z)
        npc.linha = 0
        jogador.npcEmDialogo = npc.id
        paraTodos(pacoteDialogo(npc), true)
        return
      }

      case SAIR_DIALOGO: {
        if (!Proto.lerSairDialogo(dv)) return
        liberarDialogo(jogador)
        return
      }

      /* So quem iniciou tem botao; de qualquer outro isto e lixo e some. */
      case ESCOLHA: {
        const m = Proto.lerEscolha(dv)
        if (!m) return
        const opcao = m.opcao
        const npc = npcs.get(jogador.npcEmDialogo)
        if (!npc || npc.falandoCom !== jogador.id) return
        // a ultima opcao e sempre a despedida
        if (opcao >= npc.opcoes.length - 1) { liberarDialogo(jogador); return }
        npc.linha = Math.min(npc.linha + 1, npc.falas.length - 1)
        paraTodos(pacoteDialogo(npc), true)
        return
      }

      /* AGARRAR TAMBEM E UM PEDIDO. Dois pedidos no mesmo objeto chegam um
         depois do outro nesta mesma funcao: o primeiro acha livre e leva, o
         segundo acha ocupado e leva NEGADO. O "quem chegou primeiro" e
         resolvido pela ordem de chegada AQUI, em lugar nenhum mais. */
      case PEGAR: {
        const m = Proto.lerPegar(dv)
        if (!m) return
        const o = objetos.get(m.objId)
        if (!o || o.estado === DESTRUIDO) return
        if (o.dono === jogador.id) { paraUm(jogador, pacoteObjDono(o), true); return }
        if (o.dono) { paraUm(jogador, Proto.escreverNegado(NEGADO_OBJETO, o.id), true); return }
        // uma mao, um objeto: o anterior cai onde estava
        if (jogador.objetoNaMao && jogador.objetoNaMao !== o.id) {
          const velho = objetos.get(jogador.objetoNaMao)
          if (velho && velho.dono === jogador.id && velho.estado !== DESTRUIDO) {
            assentarObjeto(velho, velho.x, velho.z)
          }
        }
        o.dono = jogador.id
        o.estado = SEGURO
        jogador.objetoNaMao = o.id
        paraTodos(pacoteObjDono(o), true)
        return
      }

      /* Enquanto ele e o dono, a maquina dele manda a posicao e todos os
         outros interpolam. De QUALQUER outro isto e ignorado sem resposta —
         nem NEGADO, porque nao houve pedido nenhum. */
      case OBJ_POS: {
        const m = Proto.lerObjPos(dv)
        if (!m) return
        const o = objetos.get(m.objId)
        if (!o || o.dono !== jogador.id) return
        if (o.estado !== SEGURO && o.estado !== VOANDO) return
        if (!finito(m.x, METADE_MAPA) || !finito(m.y, 500) || !finito(m.z, METADE_MAPA)) return
        o.x = m.x; o.y = m.y; o.z = m.z
        o.rotY = Number.isFinite(m.rotY) ? m.rotY : 0
        return
      }

      /* O cliente diz ONDE QUERIA; a ALTURA e sempre do servidor. Se cada
         maquina calculasse a queda, o mesmo caixote assentaria em alturas
         diferentes em cada tela e nenhuma estaria errada. */
      case SOLTAR: {
        const m = Proto.lerSoltar(dv)
        if (!m) return
        const o = objetos.get(m.objId)
        if (!o || o.dono !== jogador.id || o.estado === DESTRUIDO) return
        let px = finito(m.x, METADE_MAPA) ? m.x : o.x
        let pz = finito(m.z, METADE_MAPA) ? m.z : o.z
        /* Alcance do anel: sem isto um cliente estragado poderia largar o
           caixote do outro lado da cidade. Nao e anti-trapaca, e sanidade. */
        if (distXZ(px, pz, jogador.x, jogador.z) > 20) { px = o.x; pz = o.z }
        jogador.objetoNaMao = 0
        assentarObjeto(o, px, pz)
        return
      }

      /* Voando: a maquina de quem jogou simula o voo, entao ela continua dona
         e continua mandando OBJ_POS. O servidor so registra o estado, para
         quem chegar agora ver o objeto no ar e nao no chao. */
      case ARREMESSAR: {
        // dx,dy,dz e forca vem no pacote e o servidor nem olha: quem simula o
        // voo e a maquina do dono. Aqui so entra a origem e o estado.
        const m = Proto.lerArremessar(dv)
        if (!m) return
        const o = objetos.get(m.objId)
        if (!o || o.dono !== jogador.id || o.estado === DESTRUIDO) return
        if (finito(m.x, METADE_MAPA) && finito(m.y, 500) && finito(m.z, METADE_MAPA)) {
          o.x = m.x; o.y = m.y; o.z = m.z
        }
        o.estado = VOANDO
        paraTodos(pacoteObjDono(o), true)
        return
      }

      /* O UNICO IRREVERSIVEL — e por isso o mais cuidadoso.
         Se ja estava destruido, sai em silencio: receber duas vezes tem que
         dar o mesmo resultado que receber uma. */
      case DESTRUIU: {
        const m = Proto.lerDestruiu(dv)
        if (!m) return
        const o = objetos.get(m.objId)
        if (!o || o.estado === DESTRUIDO) return
        if (o.dono !== jogador.id) return   // so quem simulava o voo sabe onde bateu
        if (finito(m.x, METADE_MAPA) && finito(m.y, 500) && finito(m.z, METADE_MAPA)) {
          o.x = m.x; o.y = m.y; o.z = m.z
        }
        o.estado = DESTRUIDO
        o.dono = 0
        jogador.objetoNaMao = 0
        paraTodos(Proto.escreverObjDestruido(o.id, o.x, o.y, o.z), true)
        return
      }

      /* ABRIR_PORTAL e um PEDIDO, como FALAR e PEGAR. O cliente diz onde
         mirou; QUEM DA O ID, QUEM CONTA O TEMPO E QUEM AVISA TODO MUNDO E O
         SERVIDOR. Se o cliente desenhasse o portal sozinho ao clicar, o
         portal existiria por um instante so na tela dele. */
      case ABRIR_PORTAL: {
        const m = Proto.lerAbrirPortal(dv)
        if (!m) return
        if (!finito(m.x, METADE_MAPA) || !finito(m.y, 500) || !finito(m.z, METADE_MAPA)) return
        /* Alcance: mesma sanidade do SOLTAR. Nao e anti-trapaca (ninguem
           disputa nada aqui), e so nao deixar um cliente estragado abrir um
           portal do outro lado da cidade. */
        if (distXZ(m.x, m.z, jogador.x, jogador.z) > 30) return
        /* De proposito NAO exigimos o bit da arma aqui. Quem oferece o tiro e
           o cliente, que so arma o gatilho depois de pegar a arma; recusar o
           pedido por causa de um PEGAR_ITEM que se perdeu deixaria o jogador
           com a arma na mao e sem portal, sem nenhuma mensagem de erro. */

        /* UM portal por jogador: o novo FECHA o velho. Fecha ANTES de criar,
           para que o id velho ja esteja livre e para que a ordem que chega no
           cliente seja PORTAL_FECHADO(velho) e so depois PORTAL_ABERTO(novo) —
           na ordem contraria, um cliente que apaga "o portal daquele dono" ao
           receber o fechado apagaria o novo. */
        fecharPortalDoJogador(jogador)

        const id = novoPortalId()
        if (!id) return          // 1000 portais abertos: impossivel, mas nao inventa id
        const p = {
          id,
          dono: jogador.id,
          x: m.x, y: m.y, z: m.z,
          yaw: Number.isFinite(m.yaw) ? m.yaw : 0,
          // o servidor conta o tempo em relogio de parede, nao em tique: um
          // tique perdido no passo() nao pode deixar o portal aberto a mais
          fechaEm: Date.now() + PORTAL_MS,
        }
        portais.set(id, p)
        jogador.portalId = id
        paraTodos(pacotePortalAberto(p), true)
        return
      }

      /* PEGAR_ITEM nao tem resposta propria: o item e um BIT no byte de itens,
         guardado por nome junto com a aparencia e devolvido no BEMVINDO.
         Pegar duas vezes acende o mesmo bit — idempotente de graca. */
      case PEGAR_ITEM: {
        const m = Proto.lerPegarItem(dv)
        if (!m) return
        const bit = Proto.bitDoItem(m.item)
        if (!bit) return        // item que este servidor nao conhece: ignora
        jogador.itens = (jogador.itens | bit) & 0xff
        itensPorNome.set(jogador.nome, jogador.itens)
        return
      }

      default:
        return   // tipo desconhecido: cliente mais novo, ou lixo. Ignora.
    }
  }

  /* Porta unica da rede: rede-ws.js nao sabe uma linha de protocolo. */
  function aoPacote(con, dv) {
    const tipo = dv.getUint8(0)
    try {
      if (!con.jogador) {
        if (tipo !== ENTRAR) return  // antes do ENTRAR nada mais e ouvido
        const d = lerEntrar(dv)
        // ENTRAR truncado nao e "versao errada": e lixo. Some sem resposta.
        if (d) entrar(con, d)
        return
      }
      if (tipo === ENTRAR) return    // ja entrou; ENTRAR repetido nao faz nada
      aoMensagem(con.jogador, tipo, dv)
    } catch (e) {
      /* Pacote truncado ou inventado. Derrubar o processo por causa de um
         byte a menos seria trocar um cliente ruim por uma sala vazia. */
    }
  }

  // --- o passo ------------------------------------------------------------

  /* Snapshot de UM jogador. O proprio dono NAO vai na lista: ele e dono do
     corpo dele e receber a propria posicao de volta so serviria para brigar
     com o que ele ja desenhou. NPCs e objetos vao para todos, porque esses
     sao do servidor. */
  function pacoteSnapshot(destino) {
    const outros = []
    for (const j of jogadores.values()) if (j !== destino) outros.push(j)

    /* So entram os objetos que NAO estao parados no lugar de origem. Os
       destruidos tambem ficam de fora: o OBJ_DESTRUIDO ja foi pelo canal
       confiavel e quem entrar depois recebe o estado no BEMVINDO. Repetir 28
       objetos parados 15 vezes por segundo seria pagar banda por nada. */
    const moveram = []
    for (const o of objetos.values()) {
      if (o.estado === DESTRUIDO) continue
      if (o.estado === REPOUSO && o.x === o.ox && o.y === o.oy && o.z === o.oz) continue
      moveram.push(o)
    }

    return Proto.escreverSnapshot(tick, outros, [...npcs.values()], moveram)
  }

  function passo() {
    tick = (tick + 1) >>> 0

    /* QUEM CONTA O TEMPO DO PORTAL E O SERVIDOR. Se cada maquina apagasse o
       portal no seu proprio cronometro, ele sumiria em horas diferentes em
       cada tela e alguem atravessaria um portal que, para o outro, ja fechou.
       Coleta os vencidos antes de fechar: fecharPortal mexe no Map. */
    if (portais.size) {
      const agora = Date.now()
      let vencidos = null
      for (const p of portais.values()) {
        if (p.fechaEm <= agora) (vencidos || (vencidos = [])).push(p.id)
      }
      if (vencidos) for (const id of vencidos) fecharPortal(id)
    }

    /* O servidor solta o dialogo sozinho. Se dependesse do cliente mandar
       SAIR_DIALOGO, bastaria ele fechar a aba andando para o NPC ficar preso
       para sempre — e ninguem mais falaria com o barbeiro. */
    for (const npc of npcs.values()) {
      if (!npc.falandoCom) continue
      const j = jogadores.get(npc.falandoCom)
      if (!j) {
        npc.falandoCom = 0; npc.estado = npc.estadoBase; npc.yaw = npc.yawBase; npc.linha = 0
        paraTodos(Proto.escreverDialogoFim(npc.id), true)
        continue
      }
      if (distXZ(npc.x, npc.z, j.x, j.z) > RAIO_PERDER_DIALOGO) {
        liberarDialogo(j)
        continue
      }
      // enquanto conversa, o NPC acompanha quem chamou (na tela de todos)
      npc.yaw = olharPara(npc.x, npc.z, j.x, j.z)
    }

    for (const j of jogadores.values()) {
      if (j.con) j.con.enviar(pacoteSnapshot(j), false)
    }
  }

  const C = {
    VERSAO_PROTOCOLO, TICK_HZ, MAX_JOGADORES, RAIO_PERDER_DIALOGO,
    TIPOS,
    RECUSA_VERSAO, RECUSA_CHEIO, NEGADO_NPC, NEGADO_OBJETO,
    REPOUSO, SEGURO, VOANDO, DESTRUIDO,
    PORTAL_DURACAO, PORTAL_ID_MIN, PORTAL_ID_MAX,
    ITEM_PORTAL_GUN: Proto.ITEM_PORTAL_GUN,
  }

  const sala = {
    C,
    entrar, sair, passo, aoMensagem, aoPacote, lerEntrar,
    jogadores, npcs, objetos, portais,
    fecharPortal,
    alturaDoChao,
    get tick() { return tick },
  }
  return sala
}

/* A TABELA DO REDE.md, copiada a mao — e so isto que sobrou de duplicado, de
   proposito. Nao serve para montar pacote nenhum: serve para o servidor
   conferir, ao subir, se protocolo.js continua falando os mesmos numeros que
   o contrato escrito. Como agora existe UMA implementacao so, um numero
   trocado em protocolo.js nao faria mais os dois lados divergirem — faria os
   dois divergirem do REDE.md juntos, em silencio. Este aviso e o que pega
   isso. */
const REDE_MD = {
  ENTRAR: 1, MEU_ESTADO: 2, MINHA_APARENCIA: 3, FALAR: 4, SAIR_DIALOGO: 5,
  ESCOLHA: 6, PEGAR: 7, SOLTAR: 8, ARREMESSAR: 9, OBJ_POS: 10, DESTRUIU: 11,
  ABRIR_PORTAL: 12, PEGAR_ITEM: 13,
  BEMVINDO: 128, RECUSA: 129, SNAPSHOT: 130, ENTROU: 131, SAIU: 132,
  APARENCIA: 133, DIALOGO: 134, DIALOGO_FIM: 135, OBJ_DONO: 136,
  OBJ_DESTRUIDO: 137, NEGADO: 138, PORTAL_ABERTO: 139, PORTAL_FECHADO: 140,
}

/* Assincrona porque servidor.js ja chama assim (e chamava um import()
   dinamico). Devolve true quando tudo bate. */
export async function conferirProtocolo(aoLog = console.log) {
  let ok = true
  for (const nome of Object.keys(REDE_MD)) {
    if (Proto.P[nome] !== REDE_MD[nome]) {
      ok = false
      aoLog('AVISO protocolo: ' + nome + ' e ' + REDE_MD[nome] + ' no REDE.md mas '
        + Proto.P[nome] + ' em protocolo.js')
    }
  }
  return ok
}
