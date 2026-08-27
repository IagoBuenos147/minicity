// ---------------------------------------------------------------------------
// src/rede/cliente-rede.js — o lado cliente da rede.
//
// O que este arquivo faz, e so isso:
//   1. abre o transporte e pede pra entrar;
//   2. manda o MEU estado a 15 Hz (quem chama e o main);
//   3. guarda cada SNAPSHOT que chega num buffer, com o instante LOCAL de
//      chegada, e desenha TODO MUNDO 100 ms atras, interpolado entre dois
//      snapshots;
//   4. traduz os pacotes confiaveis em eventos que o jogo entende.
//
// O que este arquivo NAO faz, de proposito (o dono do projeto foi explicito):
// nao ha predicao, nao ha reconciliacao, nao ha portao de aceitacao. Ninguem
// disputa nada neste jogo: o servidor e a verdade e o cliente so desenha.
// O meu proprio boneco continua sendo do controller local — ele nunca passa
// por aqui, porque nao existe autoridade brigando com ele.
//
// A doutrina de robustez: escreva como se o pacote se PERDESSE, DUPLICASSE e
// CHEGASSE FORA DE ORDEM. Hoje por baixo tem WebSocket (TCP) e nada disso
// acontece — mas no dia em que virar datagrama o jogo nao pode precisar mudar.
// Por isso: snapshot com tick <= o ultimo aplicado e jogado fora, ENTROU/SAIU
// repetido nao faz efeito duplo, e OBJ_DESTRUIDO so vale a primeira vez.
//
// NADA e identificado por indice de array nem por referencia de objeto. So id.
//
// ---------------------------------------------------------------------------
// DUAS ESCOLHAS QUE O ENUNCIADO MANDOU DOCUMENTAR
//
// (a) TRANSPORTE — transporte.js e transporte-ws.js sao UMD e se registram em
//     globalThis.Transporte. Eu os importo POR EFEITO COLATERAL e leio o
//     global, em vez de reescrever o rodape dos dois pra ESM. Motivo: esses
//     dois arquivos sao copia literal do mago-pvp; deixando-os intactos, o dia
//     em que o mago-pvp corrigir um bug de transporte a atualizacao aqui e um
//     copiar-e-colar, sem re-fazer a conversao na mao. A ordem dos imports
//     importa: transporte.js primeiro, senao transporte-ws.js nao acha o
//     registro (e ele mesmo joga o erro dizendo isso).
//
// (b) PING — o protocolo (REDE.md) nao tem campo de eco: MEU_ESTADO nao leva
//     seq e o SNAPSHOT nao devolve nenhum. Entao meco pelo relogio: marco o
//     instante do PRIMEIRO MEU_ESTADO ainda nao pareado e fecho a conta no
//     SNAPSHOT seguinte. Esse bruto vale o ida-e-volta MAIS o tempo que o meu
//     pacote ficou esperando o servidor virar o tique — em media meio tique.
//     Por isso subtraio meio tique e suavizo com media exponencial. E uma
//     estimativa com +-1 tique (~66 ms a 15 Hz) de ruido em cada amostra, boa
//     o bastante pro painel F3 e honestamente rotulada como estimativa. Um
//     campo de eco no protocolo daria o numero exato; nao existe, e eu nao
//     mexo em protocolo.js (e de outro dono).
// ---------------------------------------------------------------------------

// efeito colateral: registram 'websocket' em globalThis.Transporte. Ver (a).
import { Transporte } from './transporte.js'
import { registrarWebSocket } from './transporte-ws.js'

// Registro explicito. Antes isso acontecia por efeito colateral na avaliacao
// dos modulos; com o Vite empacotando, a ordem nao era garantida e dava ciclo.
registrarWebSocket(Transporte)

// ATENCAO ao formato deste import. protocolo.js exporta as FUNCOES soltas
// (escreverEntrar, lerSnapshot, ...) mas os TIPOS de pacote moram todos
// dentro de um unico objeto exportado chamado P. Num "import * as X" o
// namespace espelha os exports, entao os tipos ficariam em X.P.SNAPSHOT, e
// nao em X.SNAPSHOT. Escrever "X.SNAPSHOT" da undefined em silencio e TODA
// comparacao de tipo vira false — o cliente descartaria cada pacote do
// servidor sem um unico erro no console. Por isso: Proto para as funcoes,
// P para os tipos.
import * as Proto from '../comum/protocolo.js'
const P = Proto.P
// TICK_HZ entra so na conta do ping; ATRASO_INTERP e o atraso da interpolacao.
// VERSAO_PROTOCOLO nao aparece aqui de proposito: quem carimba a versao no
// pacote ENTRAR e o protocolo, que e quem sabe o formato.
import { TICK_HZ, ATRASO_INTERP, ZUMBI_ID } from '../comum/mundo.js'

const TAU = Math.PI * 2

const agora = (typeof performance !== 'undefined' && performance.now)
  ? () => performance.now()
  : () => Date.now()

/** Interpola angulo pelo CAMINHO CURTO: sem isto o boneco gira 359 graus
 *  pra virar 1. while em vez de if porque valor sujo tem que convergir. */
function anguloCurto(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= TAU
  while (d < -Math.PI) d += TAU
  return a + d * t
}

function trava01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }

/* Os nomes que o jogo usava quando a aparencia tinha 6 bytes. A UI e o
   personagem foram escritos com eles, e nada obriga os dois a trocarem no
   mesmo commit — entao aceito os dois na ENTRADA. Sem isto, um customizer que
   ainda mandasse { hair: 2 } veria o cabelo virar 0 no pacote, calado.
   Na SAIDA quem manda e o nome do contrato (CAMPOS_APARENCIA), porque e ele
   que o protocolo grava byte a byte. */
const APELIDOS_ANTIGOS = {
  cabelo: 'hair',
  olhos: 'eyes',
  sobrancelha: 'brows',
  boca: 'mouth',
  corCabelo: 'hairColor',
  pele: 'skinIdx',   // 'skin' tambem e aceito; ver o comentario da pele abaixo
}

/**
 * Aparencia sempre com os 20 campos do contrato, sempre em byte, e cada um
 * CORTADO no numero de opcoes daquele campo (Proto.APARENCIA_OPCOES).
 *
 * O corte e por campo e nao um 0..255 geral de proposito: indice fora do
 * catalogo nao da erro no cliente que o recebe, ele so cai num
 * `catalogo[i] === undefined` la no fundo do render, no meio de um frame, e o
 * boneco some. Cortar aqui, na fronteira, e o unico lugar onde ainda da pra
 * saber que numero era esse. O resto (0) e um visual valido em todo campo.
 *
 * A PELE tem historia: o jogo chama de 'skin' o valor que ele desenha (que as
 * vezes e uma COR pronta, do preview local) e 'skinIdx' o indice. Aqui so
 * indice viaja, entao 'skin' so e aceito quando cabe num byte de catalogo —
 * cor crua (numero grande) e ignorada em vez de virar um tom sorteado.
 */
export function normalizarAparencia(ap) {
  const a = ap || {}
  const campos = Proto.CAMPOS_APARENCIA
  const opcoes = Proto.APARENCIA_OPCOES
  const saida = {}
  for (let i = 0; i < campos.length; i++) {
    const k = campos[i]
    let v = a[k]
    if (v === undefined) {
      const velho = APELIDOS_ANTIGOS[k]
      if (velho !== undefined) v = a[velho]
      // 'skin' so vale como indice se couber num byte: acima disso e cor crua
      if (v === undefined && k === 'pele' && (a.skin | 0) === a.skin && a.skin <= 255) v = a.skin
    }
    let n = v | 0
    if (n < 0) n = 0
    const max = opcoes[i] | 0
    // CLAMP, nao resto: com resto, a opcao 7 de um campo de 5 viraria a 2, e o
    // jogador veria um visual que ele nao escolheu e nao consegue explicar.
    // Preso na ultima opcao pelo menos e visivelmente "o fim da lista".
    // max 0 = campo sem catalogo (o reservado): so o teto do byte vale.
    if (max > 0) { if (n > max - 1) n = max - 1 }
    else if (n > 255) n = 255
    saida[k] = n
  }
  return saida
}

/** A URL do WebSocket NUNCA e escrita no codigo: sai de location.
 *  http -> ws, https -> wss (uma pagina https nao pode abrir ws:// — o
 *  navegador bloqueia como conteudo misto). location.host ja inclui a porta
 *  quando ela nao e a padrao, entao o mesmo build serve localhost e dominio.
 *  Em dev o jogo pode estar no Vite (5173) e o servidor noutra porta; pra
 *  isso existe ?rede=... na barra de endereco — que continua sem endereco
 *  nenhum escrito aqui dentro. */
function montarUrl(urlPedida) {
  if (urlPedida) return urlPedida
  if (typeof location === 'undefined') throw new Error('sem location: passe url')
  const daBarra = new URLSearchParams(location.search).get('rede')
  if (daBarra) return daBarra
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host
}

// ---------------------------------------------------------------------------

export function criarRede({ url, nome, aparencia } = {}) {
  const est = {
    t: null,
    urlPedida: url || '',
    nome: String(nome || 'Jogador').slice(0, 24),
    aparencia: normalizarAparencia(aparencia),

    // buffer de snapshots: cada item guarda o instante LOCAL de chegada.
    // Usar o relogio local (e nao o tick do servidor) e o que dispensa
    // sincronizar relogio entre as maquinas — a diferenca entre dois
    // instantes locais e a mesma que entre os dois ticks que os geraram.
    buffer: [],
    ultimoTick: -1,

    // nome e aparencia chegam pelo canal confiavel (ENTROU/APARENCIA) e
    // valem ate o SAIU. Posicao chega pelo snapshot. Sao coisas separadas
    // de proposito: perder um snapshot nao pode apagar o nome de ninguem.
    perfis: new Map(),

    // objetos que EU seguro: quem manda a posicao sou eu, entao o que eu
    // desenho e o que eu mandei, nao o que voltou interpolado (voltaria
    // 100 ms atrasado e o objeto arrastaria atras da minha mao).
    meusObj: new Map(),

    // OBJ_DESTRUIDO tem que ser idempotente: chegar duas vezes nao pode
    // estourar dois clarões nem contar duas quebras.
    destruidos: new Set(),

    // ping (ver (b) no cabecalho)
    pingEnviadoEm: 0,
    pingMedio: 0,

    // bytes/s: janela curta, so pro painel
    bytesJanela: 0,
    tempoJanela: 0,
  }

  const rede = {
    meuId: 0,
    conectado: false,
    recusado: 0,               // 0 = ninguem recusou; 1 = versao; 2 = cheio

    jogadores: new Map(),      // id -> {id,nome,aparencia,x,y,z,yaw,anim,flags}
    npcs: new Map(),           // id -> {id,x,z,yaw,estado,falandoCom}
    objetos: new Map(),        // id -> {id,x,y,z,rotY,dono,estado}

    aoEvento: null,

    stats: { ping: 0, bytesPorSegundo: 0, nJogadores: 0, nNpcs: 0, nObjetos: 0 },
  }

  function emitir(ev) {
    if (typeof rede.aoEvento === 'function') rede.aoEvento(ev)
  }

  /**
   * Zera TODO o estado que pertence a UMA sessao com o servidor.
   *
   * O item que mais custa esquecer e o est.ultimoTick. O servidor comeca a
   * contar o tick em 1 a cada vez que sobe; se eu guardar o tick da sessao
   * anterior, o filtro "tick <= ultimoTick" — que existe pra descartar
   * snapshot atrasado — passa a descartar TODOS os snapshots da sessao nova,
   * pra sempre. O cliente reconecta, diz "conectado", e o mundo fica
   * congelado sem nenhum erro aparecer. Os perfis, os destruidos e os meusObj
   * falam de ids que o servidor novo pode ter dado a outra gente, e o meuId
   * velho faria eu me confundir com outro jogador.
   */
  function resetarSessao(zerarMeuId) {
    est.buffer.length = 0
    est.ultimoTick = -1
    est.perfis.clear()
    est.meusObj.clear()
    est.destruidos.clear()
    est.pingEnviadoEm = 0
    est.pingMedio = 0

    rede.jogadores.clear()
    rede.npcs.clear()
    rede.objetos.clear()

    rede.stats.ping = 0
    rede.stats.nJogadores = 0
    rede.stats.nNpcs = 0
    rede.stats.nObjetos = 0

    if (zerarMeuId) rede.meuId = 0
  }

  // --- envio ---------------------------------------------------------------

  /** Todo envio passa por aqui: sem conexao nao explode, so nao vai. Perder
   *  um pacote e situacao NORMAL, nao erro. */
  function mandar(buf, confiavel) {
    if (!est.t || !buf) return false
    return est.t.enviar(buf, !!confiavel) !== false
  }

  rede.conectar = function conectar() {
    const T = Transporte
    if (!T) return Promise.reject(new Error('transporte.js nao carregou'))

    est.t = T.criar('websocket', {})
    est.t.aoReceber = aoReceber
    est.t.aoFechar = () => {
      // conexao caiu: o mundo remoto que eu tinha nao vale mais nada.
      // Deixo os Maps vazios em vez de congelados, senao ficam bonecos
      // parados pra sempre no meio da rua. E zero a sessao INTEIRA, nao so
      // os Maps: se o servidor reiniciar, o tick volta a 1 (ver resetarSessao).
      rede.conectado = false
      resetarSessao(true)
    }

    return est.t.conectar(montarUrl(est.urlPedida)).then(() => {
      // entrar na sala e evento raro e importante: canal CONFIAVEL
      mandar(Proto.escreverEntrar(est.nome, est.aparencia), true)
    })
  }

  /** Espiada no estado interno, pro painel F3 e pra diagnostico. */
  rede.debug = function debug() {
    return {
      transporte: est.t ? est.t.estado : 'sem transporte',
      ultimoTick: est.ultimoTick,
      pacotesRecebidos: est.pacotesRecebidos || 0,
      bytesTotais: est.bytesTotais || 0,
      buffer: est.buffer.length,
    }
  }

  /** Pede pro servidor abrir um portal na minha frente. Confiavel: perder
   *  isso e o jogador apertar o gatilho e nao acontecer nada. */
  rede.abrirPortal = function abrirPortal(x, y, z, yaw) {
    if (!rede.conectado) return
    mandar(Proto.escreverAbrirPortal(x, y, z, yaw), true)
  }

  /** Avisa que peguei um item. O servidor guarda por nome e devolve no
   *  BEMVINDO, entao quem recarrega a pagina volta com a arma. */
  rede.pegarItem = function pegarItem(item) {
    if (!rede.conectado) return
    mandar(Proto.escreverPegarItem(item | 0), true)
  }

  rede.fechar = function fechar() {
    if (est.t) est.t.fechar()
    rede.conectado = false
  }

  /** Chamado a 15 Hz pelo main. Canal NAO confiavel: o mais novo manda, e
   *  perder um nao custa nada — o proximo ja diz tudo o que o perdido diria. */
  rede.enviarMeuEstado = function enviarMeuEstado(x, y, z, yaw, anim, flags) {
    if (!rede.conectado) return
    mandar(Proto.escreverMeuEstado(x, y, z, yaw, anim | 0, flags | 0), false)
    // marca so o mais ANTIGO sem par: assim o bruto medido nunca fica
    // menor que o ida-e-volta de verdade (ver (b) no cabecalho)
    if (est.pingEnviadoEm === 0) est.pingEnviadoEm = agora()
  }

  rede.enviarAparencia = function enviarAparencia(ap) {
    est.aparencia = normalizarAparencia(ap)
    if (!rede.conectado) return
    mandar(Proto.escreverMinhaAparencia(est.aparencia), true)
  }

  rede.falar = function falar(npcId) {
    if (!rede.conectado) return
    mandar(Proto.escreverFalar(npcId | 0), true)
  }

  rede.sairDialogo = function sairDialogo() {
    if (!rede.conectado) return
    mandar(Proto.escreverSairDialogo(), true)
  }

  rede.escolha = function escolha(i) {
    if (!rede.conectado) return
    mandar(Proto.escreverEscolha(i | 0), true)
  }

  rede.pegar = function pegar(objId) {
    if (!rede.conectado) return
    // pedido, nao ordem: quem diz se pegou e o OBJ_DONO que voltar
    mandar(Proto.escreverPegar(objId | 0), true)
  }

  rede.soltar = function soltar(objId, x, y, z) {
    if (!rede.conectado) return
    est.meusObj.delete(objId | 0)
    mandar(Proto.escreverSoltar(objId | 0, x, y, z), true)
  }

  rede.arremessar = function arremessar(objId, pos, dir, forca) {
    if (!rede.conectado) return
    const p = pos || { x: 0, y: 0, z: 0 }
    const d = dir || { x: 0, y: 0, z: 1 }
    est.meusObj.delete(objId | 0)
    mandar(Proto.escreverArremessar(objId | 0, p.x, p.y, p.z, d.x, d.y, d.z, forca || 0), true)
  }

  /** So vale se o servidor tiver dito que sou o dono; se nao for, ele ignora.
   *  Guardo o que mandei porque e isso que EU desenho (ver est.meusObj). */
  rede.enviarObjPos = function enviarObjPos(objId, x, y, z, rotY) {
    if (!rede.conectado) return
    const id = objId | 0
    est.meusObj.set(id, { x, y, z, rotY: rotY || 0 })
    mandar(Proto.escreverObjPos(id, x, y, z, rotY || 0), false)
  }

  /** Quem arremessou simula o voo e avisa onde bateu. O servidor decide o
   *  resto; se este pacote se perder, o objeto continua voando ate o servidor
   *  resolver — nao ha nada pra desfazer aqui. */
  rede.destruiu = function destruiu(objId, x, y, z) {
    if (!rede.conectado) return
    est.meusObj.delete(objId | 0)
    mandar(Proto.escreverDestruiu(objId | 0, x, y, z), true)
  }

  // --- veiculos ------------------------------------------------------------
  //
  // O mesmo desenho do anel: PEDIR e esperar. Quem senta no carro nao e este
  // arquivo, e o 'veiculo-dono' que voltar — se o cliente sentasse ao apertar
  // E, dois jogadores sentariam no mesmo carro por 100 ms cada um na sua tela,
  // e um dos dois teria que ser arrancado de la depois.

  /** Pede pra entrar num veiculo. Confiavel: perder isso e apertar E e nao
   *  acontecer nada. Resposta: 'veiculo-dono' (ou 'negado', se ja tem dono). */
  rede.entrarVeiculo = function entrarVeiculo(veicId) {
    if (!rede.conectado) return
    mandar(Proto.escreverEntrarVeiculo(veicId | 0), true)
  }

  /** Pede pra sair. Nao manda posicao: onde o veiculo parou o servidor ja sabe
   *  pelo ultimo veiculoPos que EU mandei. */
  rede.sairVeiculo = function sairVeiculo(veicId) {
    if (!rede.conectado) return
    mandar(Proto.escreverSairVeiculo(veicId | 0), true)
  }

  /** A 15 Hz enquanto eu dirijo. NAO confiavel: o proximo ja diz tudo o que o
   *  perdido diria. So vale se o servidor tiver dito que sou o dono; se nao
   *  for, ele ignora em silencio e nada acontece. Nao guardo o que mandei
   *  (como faco com est.meusObj) porque o veiculo que EU dirijo e desenhado
   *  pela fisica local, que nunca passou por aqui — e o servidor tambem nao
   *  me devolve a minha propria pose. */
  rede.veiculoPos = function veiculoPos(veicId, x, y, z, yaw, rolagem) {
    if (!rede.conectado) return
    mandar(Proto.escreverVeiculoPos(veicId | 0, x, y, z, yaw || 0, rolagem || 0), false)
  }

  // --- o rapaz que vira zumbi (NPC 1004) -----------------------------------
  //
  // Ele nao tem sistema proprio aqui: e um NPC, e o estado e a posicao dele
  // chegam no rede.npcs como os dos outros, ja interpolados 100 ms atras. Quem
  // desenha (src/npc/zumbi.js) le rede.npcs.get(ZUMBI_ID) e dispara o visual
  // nas TRANSICOES que observa. Por isso nao ha nenhum evento de zumbi neste
  // arquivo: o que existe e este unico canal de SAIDA, o pedido.

  /**
   * O unico jeito de o cliente pedir alguma coisa sobre o zumbi. Duas acoes, e
   * as duas sao PEDIDOS — quem decide o que acontece e o servidor:
   *
   *   zumbiPedir('adoecer')            falei com ele (FALAR no NPC 1004)
   *   zumbiPedir('tiro', 'cabeca')     acertei um tiro (ZUMBI_TIRO)
   *   zumbiPedir('tiro', 'corpo')
   *
   * Repare no que NAO da pra pedir: "vira zumbi", "morre", "vida 1". O estado
   * dele nao e escrito daqui em nenhuma hipotese; ele so e LIDO do snapshot.
   * Um cliente estragado que quisesse matar o NPC na tela dos outros teria que
   * convencer o servidor de que acertou tres tiros, chegando perto.
   *
   * A existencia desta funcao e o que faz o `ehLocal()` do zumbi.js valer de
   * verdade: sem servidor (ou sem conexao) ele continua resolvendo tudo
   * sozinho, como sempre fez.
   */
  rede.zumbiPedir = function zumbiPedir(acao, parte) {
    if (!rede.conectado) return false
    const q = String(acao || '').toLowerCase()
    if (q === 'adoecer' || q === 'adoecendo' || q === 'falar') {
      // FALAR de sempre: pra sala isto e "apertei E nesta pessoa", e o que ela
      // faz com o pedido (comecar a doenca, em vez de abrir dialogo) e assunto
      // dela. Um pacote novo aqui seria um segundo nome para o mesmo pedido.
      mandar(Proto.escreverFalar(ZUMBI_ID), true)
      return true
    }
    if (q === 'tiro') {
      const p = String(parte || '').toLowerCase() === 'cabeca'
        ? Proto.PARTE_CABECA : Proto.PARTE_CORPO
      mandar(Proto.escreverZumbiTiro(ZUMBI_ID, p), true)
      return true
    }
    return false
  }

  /** Avisa que a montagem do helicoptero terminou naquele ponto. PEDIDO: quem
   *  da o id (4100..4999) e cria o helicoptero pra todo mundo e o servidor, e
   *  ele volta como 'heli-criado'. As pecas voando e o clarao verde sao 100%
   *  locais e nao passam por aqui. */
  rede.criarHeli = function criarHeli(x, y, z, yaw) {
    if (!rede.conectado) return
    mandar(Proto.escreverCriarHeli(x, y, z, yaw || 0), true)
  }

  // --- recepcao ------------------------------------------------------------

  function aoReceber(v) {
    // tamanhoDe/tipoDe aguentam lixo e pacote vazio sem lancar: pacote torto
    // nao pode derrubar o callback do transporte, que e o laco da rede.
    est.bytesJanela += Proto.tamanhoDe(v)
    const tipo = Proto.tipoDe(v)
    if (tipo < 0) return

    // Regra que vale pra TODOS os ramos daqui pra baixo: os leitores de
    // protocolo.js devolvem null de proposito quando o pacote e curto ou
    // corrompido. Usar o resultado direto (P.lerX(v).campo) transformaria
    // um pacote truncado num TypeError dentro do callback do transporte.
    // Entao: guarda numa variavel, e se for null so descarta o pacote.

    if (tipo === P.SNAPSHOT) { aoSnapshot(Proto.lerSnapshot(v)); return }

    if (tipo === P.BEMVINDO) {
      const b = Proto.lerBemvindo(v)
      if (!b) return
      // Comeco de sessao: jogo fora TUDO o que sobrou da conexao anterior
      // antes de semear o mundo novo. O ultimoTick e o que mais importa —
      // servidor reiniciado recomeca o tick em 1 (ver resetarSessao).
      resetarSessao(true)
      rede.meuId = b.meuId | 0
      rede.conectado = true
      rede.recusado = 0
      if (b.aparencia) est.aparencia = normalizarAparencia(b.aparencia)
      // o servidor guarda a aparencia por nome e devolve na volta: quem
      // reentra volta com o cabelo que escolheu, sem escolher de novo
      // Semente do mundo: os NPCs e objetos ja chegam com estado aqui, pra
      // o jogo ter o que desenhar antes do primeiro snapshot. Assim que o
      // buffer tiver snapshot, a interpolacao passa a mandar nisto.
      // A lista de objetos vem no campo 'objs' (nome de protocolo.js);
      // aceito 'objetos' tambem caso o outro lado renomeie.
      semear(rede.npcs, b.npcs, npcDoSnapshot)
      semear(rede.objetos, (b.objs !== undefined ? b.objs : b.objetos), objDoSnapshot)
      // o byte de itens diz o que este jogador ja pegou (a arma de portal).
      // Sem repassar, quem recarrega a pagina perde a arma que o servidor
      // guardou pra ele.
      emitir({ tipo: 'bemvindo', id: rede.meuId, aparencia: est.aparencia, itens: b.itens | 0 })
      return
    }

    if (tipo === P.RECUSA) {
      const r = Proto.lerRecusa(v)
      if (!r) return
      rede.recusado = r.motivo | 0
      rede.conectado = false
      emitir({ tipo: 'recusado', motivo: rede.recusado })
      return
    }

    if (tipo === P.ENTROU) {
      const e = Proto.lerEntrou(v)
      if (!e) return
      const id = e.id | 0
      if (id === rede.meuId) return
      // idempotente: o mesmo ENTROU duas vezes nao anuncia duas vezes
      if (est.perfis.has(id)) {
        est.perfis.get(id).aparencia = normalizarAparencia(e.aparencia)
        return
      }
      est.perfis.set(id, { nome: String(e.nome || ''), aparencia: normalizarAparencia(e.aparencia) })
      emitir({ tipo: 'entrou', id, nome: String(e.nome || '') })
      return
    }

    if (tipo === P.SAIU) {
      const s = Proto.lerSaiu(v)
      if (!s) return
      const id = s.id | 0
      const perfil = est.perfis.get(id)
      if (!perfil) return                    // ja tinha saido: nao repete o aviso
      est.perfis.delete(id)
      rede.jogadores.delete(id)
      emitir({ tipo: 'saiu', id, nome: perfil.nome })
      return
    }

    if (tipo === P.APARENCIA) {
      const a = Proto.lerAparencia(v)
      if (!a) return
      const id = a.id | 0
      const ap = normalizarAparencia(a.aparencia)
      const perfil = est.perfis.get(id)
      if (perfil) perfil.aparencia = ap
      else est.perfis.set(id, { nome: '', aparencia: ap })
      const j = rede.jogadores.get(id)
      if (j) j.aparencia = ap                // troca de cabelo aparece na hora
      return
    }

    if (tipo === P.DIALOGO) {
      const d = Proto.lerDialogo(v)
      if (!d) return
      emitir({
        tipo: 'dialogo',
        npcId: d.npcId | 0,
        jogadorId: d.jogadorId | 0,
        linha: (d.linha !== undefined ? d.linha : d.linhaIdx) | 0,
        opcoes: (d.opcoes !== undefined ? d.opcoes : d.nOpcoes) | 0,
      })
      return
    }

    if (tipo === P.DIALOGO_FIM) {
      const f = Proto.lerDialogoFim(v)
      if (!f) return
      emitir({ tipo: 'dialogo-fim', npcId: f.npcId | 0 })
      return
    }

    if (tipo === P.OBJ_DONO) {
      const o = Proto.lerObjDono(v)
      if (!o) return
      const objId = o.objId | 0
      const donoId = (o.donoId !== undefined ? o.donoId : o.dono) | 0
      // deixei de ser dono: paro de mandar posicao e volto a interpolar
      if (donoId !== rede.meuId) est.meusObj.delete(objId)

      // O OBJ_DONO passou a trazer tambem a pose que o SERVIDOR decidiu.
      // Isso importa no SOLTAR: quem manda o objeto assentar e o servidor,
      // nunca a fisica de cada maquina — senao o objeto para num lugar
      // diferente em cada tela. Se a posicao vier, repasso pro anel poder
      // animar a descida ate exatamente onde o servidor mandou.
      const temPos = Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z)
      const rotY = Number.isFinite(o.rotY) ? o.rotY : 0
      const estado = o.estado | 0

      const alvo = rede.objetos.get(objId)
      if (alvo) {
        alvo.dono = donoId
        if (o.estado !== undefined) alvo.estado = estado
        // so escrevo a pose se ela veio E o objeto nao e o que EU seguro
        // (o meu e desenhado do meu proprio envio, sem passar pela rede)
        if (temPos && !(est.meusObj.has(objId) && donoId === rede.meuId)) {
          alvo.x = o.x; alvo.y = o.y; alvo.z = o.z; alvo.rotY = rotY
        }
      }

      emitir({
        tipo: 'obj-dono', objId, donoId,
        temPos,
        x: temPos ? o.x : undefined,
        y: temPos ? o.y : undefined,
        z: temPos ? o.z : undefined,
        rotY,
        estado,
      })
      return
    }

    if (tipo === P.OBJ_DESTRUIDO) {
      const d = Proto.lerObjDestruido(v)
      if (!d) return
      const objId = d.objId | 0
      if (est.destruidos.has(objId)) return   // chegou de novo: nao faz nada
      est.destruidos.add(objId)
      est.meusObj.delete(objId)
      rede.objetos.delete(objId)
      emitir({ tipo: 'obj-destruido', objId, x: d.x, y: d.y, z: d.z })
      return
    }

    if (tipo === P.PORTAL_ABERTO) {
      const p = Proto.lerPortalAberto(v)
      if (!p) return
      // a faixa 3000..3999 ja diz que o u16 e um portal: id fora dela e lixo
      if (Proto.ehIdDePortal && !Proto.ehIdDePortal(p.portalId)) return
      emitir({
        tipo: 'portal-aberto', id: p.portalId, dono: p.dono,
        x: p.x, y: p.y, z: p.z, yaw: p.yaw,
      })
      return
    }

    if (tipo === P.PORTAL_FECHADO) {
      const p = Proto.lerPortalFechado(v)
      if (!p) return
      if (Proto.ehIdDePortal && !Proto.ehIdDePortal(p.portalId)) return
      emitir({ tipo: 'portal-fechado', id: p.portalId })
      return
    }

    if (tipo === P.VEICULO_DONO) {
      const d = Proto.lerVeiculoDono(v)
      if (!d) return
      // a faixa 4000..4999 ja diz que o u16 e um veiculo: fora dela e lixo
      if (Proto.ehIdDeVeiculo && !Proto.ehIdDeVeiculo(d.veicId)) return
      emitir({
        tipo: 'veiculo-dono', veicId: d.veicId | 0, donoId: d.donoId | 0,
        x: d.x, y: d.y, z: d.z, yaw: d.yaw,
      })
      return
    }

    /* A pose de quem dirige, reenviada pelo servidor (veiculo nao entra no
       snapshot). O MEU veiculo nunca chega aqui: o servidor nao me devolve a
       minha propria pose, e se um dia devolvesse eu estaria desenhando 100 ms
       atras do que a minha fisica ja calculou. Quem interpola isso e o sistema
       de veiculos, que e quem sabe o que e um carro. */
    if (tipo === P.VEICULO_POS) {
      const p = Proto.lerVeiculoPos(v)
      if (!p) return
      if (Proto.ehIdDeVeiculo && !Proto.ehIdDeVeiculo(p.veicId)) return
      emitir({
        tipo: 'veiculo-pos', veicId: p.veicId | 0,
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, rolagem: p.rolagem,
      })
      return
    }

    /* Nasceu um helicoptero. 'dono' aqui e QUEM MONTOU (pro clarao verde na
       tela de todos), nunca quem pilota — o helicoptero nasce livre e quem
       senta nele diz o 'veiculo-dono'. Chega tambem, um por helicoptero vivo,
       logo depois do BEMVINDO, pra quem entrou atrasado: o mesmo caminho, e
       por isso o mesmo codigo do outro lado. */
    if (tipo === P.HELI_CRIADO) {
      const h = Proto.lerHeliCriado(v)
      if (!h) return
      if (Proto.ehIdDeHeli && !Proto.ehIdDeHeli(h.veicId)) return
      emitir({
        tipo: 'heli-criado', veicId: h.veicId | 0, dono: h.dono | 0,
        x: h.x, y: h.y, z: h.z, yaw: h.yaw,
      })
      return
    }

    if (tipo === P.NEGADO) {
      const n = Proto.lerNegado(v)
      if (!n) return
      emitir({ tipo: 'negado', oque: n.oque | 0, id: n.id | 0 })
      return
    }
    // tipo desconhecido: versao nova do servidor falando algo que eu ainda
    // nao entendo. Ignorar em silencio e melhor que quebrar a partida.
  }

  function aoSnapshot(snap) {
    if (!snap) return
    const tick = snap.tick | 0
    // Fora de ordem ou duplicado. O snapshot velho nao tem nada que o novo
    // ja nao diga, e aplicar ele faria o mundo andar pra tras.
    if (tick <= est.ultimoTick) return
    est.ultimoTick = tick

    // fecha a conta do ping: bruto = ida + espera do tique + volta
    if (est.pingEnviadoEm !== 0) {
      const bruto = agora() - est.pingEnviadoEm
      est.pingEnviadoEm = 0
      const meioTique = 500 / (TICK_HZ || 15)
      const amostra = Math.max(0, bruto - meioTique)
      // media exponencial: uma amostra ruim nao faz o numero pular
      est.pingMedio = est.pingMedio === 0 ? amostra : est.pingMedio + (amostra - est.pingMedio) * 0.12
    }

    est.buffer.push({
      recebidoEm: agora(),
      tick,
      jogadores: snap.jogadores || [],
      npcs: snap.npcs || [],
      objetos: snap.objetos || [],
    })
    // ~2,6 s de historico a 15 Hz. Mais que isso e memoria parada: a
    // interpolacao so olha os 100 ms mais recentes.
    while (est.buffer.length > 40) est.buffer.shift()
  }

  // --- interpolacao (o coracao) --------------------------------------------
  //
  // Desenho tudo o que e remoto ATRASO_INTERP no passado. Assim eu SEMPRE
  // tenho dois snapshots cercando o instante que quero mostrar, e nunca
  // preciso adivinhar o futuro. O preco e ver os outros 100 ms atras — e
  // nao custa nada aqui, porque ninguem disputa nada.
  //
  // Uso o instante LOCAL de chegada, nao o tick do servidor: assim nao
  // preciso sincronizar relogio nenhum entre as maquinas.

  /** Acha os dois snapshots que cercam o instante alvo, e o t entre eles. */
  function acharPar(alvo) {
    const buf = est.buffer
    if (buf.length === 0) return null

    let a = null, b = null
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].recebidoEm <= alvo) { a = buf[i]; b = buf[i + 1] || null; break }
    }
    // ainda nao juntei atraso suficiente (acabei de entrar, ou a rede
    // engasgou): mostro o mais antigo que tenho, parado, ate encher
    if (!a) { a = buf[0]; b = buf[1] || null }

    const t = (b && b.recebidoEm > a.recebidoEm)
      ? trava01((alvo - a.recebidoEm) / (b.recebidoEm - a.recebidoEm))
      : 0
    return { a, b, t }
  }

  /** Procura pelo ID na lista. Nunca por indice: as listas do snapshot mudam
   *  de tamanho e de ordem a cada tique, e o item i de um nao e o item i do
   *  outro. Aceitar nao achar e parte do contrato. */
  function acharPorId(lista, id) {
    for (let i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i]
    return null
  }

  function npcDoSnapshot(e) {
    return {
      id: e.id, x: e.x, z: e.z, yaw: e.yaw || 0,
      estado: e.estado | 0,
      falandoCom: (e.falandoCom !== undefined ? e.falandoCom : 0) | 0,
    }
  }

  function objDoSnapshot(e) {
    return {
      id: e.id, x: e.x, y: e.y, z: e.z, rotY: e.rotY || 0,
      dono: (e.dono !== undefined ? e.dono : 0) | 0,
      estado: e.estado | 0,
    }
  }

  function semear(mapa, lista, converter) {
    if (!Array.isArray(lista)) return
    for (let i = 0; i < lista.length; i++) {
      const e = converter(lista[i])
      mapa.set(e.id, e)
    }
  }

  function interpolarJogadores(a, b, t) {
    const vistos = new Set()
    const lista = a.jogadores
    for (let i = 0; i < lista.length; i++) {
      const ea = lista[i]
      const id = ea.id | 0
      if (id === rede.meuId) continue        // eu sou desenhado pelo controller
      const eb = b ? acharPorId(b.jogadores, id) : null

      let j = rede.jogadores.get(id)
      if (!j) {
        j = { id, nome: '', aparencia: null, x: 0, y: 0, z: 0, yaw: 0, anim: 0, flags: 0 }
        rede.jogadores.set(id, j)
      }
      if (eb) {
        j.x = ea.x + (eb.x - ea.x) * t
        j.y = ea.y + (eb.y - ea.y) * t
        j.z = ea.z + (eb.z - ea.z) * t
        j.yaw = anguloCurto(ea.yaw, eb.yaw, t)
      } else {
        j.x = ea.x; j.y = ea.y; j.z = ea.z; j.yaw = ea.yaw
      }
      // anim e flags sao estados, nao numeros: nao se interpolam. Vale o do
      // snapshot que ja passou, que e o instante que estou mostrando.
      j.anim = ea.anim | 0
      j.flags = ea.flags | 0

      const perfil = est.perfis.get(id)
      if (perfil) { j.nome = perfil.nome; j.aparencia = perfil.aparencia }
      vistos.add(id)
    }
    // id que sumiu do snapshot nao existe mais pra mim
    for (const id of rede.jogadores.keys()) if (!vistos.has(id)) rede.jogadores.delete(id)
  }

  function interpolarNpcs(a, b, t) {
    const vistos = new Set()
    const lista = a.npcs
    for (let i = 0; i < lista.length; i++) {
      const ea = lista[i]
      const id = ea.id | 0
      const eb = b ? acharPorId(b.npcs, id) : null

      let n = rede.npcs.get(id)
      if (!n) { n = { id, x: 0, z: 0, yaw: 0, estado: 0, falandoCom: 0 }; rede.npcs.set(id, n) }
      if (eb) {
        // NPC anda no chao: o snapshot nem manda y, quem sabe a altura do
        // piso e o mundo
        n.x = ea.x + (eb.x - ea.x) * t
        n.z = ea.z + (eb.z - ea.z) * t
        n.yaw = anguloCurto(ea.yaw, eb.yaw, t)
      } else {
        n.x = ea.x; n.z = ea.z; n.yaw = ea.yaw
      }
      n.estado = ea.estado | 0
      n.falandoCom = (ea.falandoCom !== undefined ? ea.falandoCom : 0) | 0
      vistos.add(id)
    }
    for (const id of rede.npcs.keys()) if (!vistos.has(id)) rede.npcs.delete(id)
  }

  function interpolarObjetos(a, b, t) {
    const vistos = new Set()
    const lista = a.objetos
    for (let i = 0; i < lista.length; i++) {
      const ea = lista[i]
      const id = ea.id | 0
      const eb = b ? acharPorId(b.objetos, id) : null

      let o = rede.objetos.get(id)
      if (!o) { o = { id, x: 0, y: 0, z: 0, rotY: 0, dono: 0, estado: 0 }; rede.objetos.set(id, o) }
      o.dono = (ea.dono !== undefined ? ea.dono : 0) | 0
      o.estado = ea.estado | 0

      // O objeto que EU seguro nao interpola: quem manda a posicao dele sou
      // eu, entao o que volta pela rede e o meu proprio envio 100 ms atras.
      // Interpolar isso faria o objeto arrastar atras da minha mao.
      // Aceito tambem dono 0 aqui de proposito: entre o OBJ_DONO (confiavel,
      // chega na hora) e o primeiro snapshot que ja me lista como dono passam
      // ~100 ms, e nesse vao o snapshot ainda diz "livre". Sem esta folga o
      // objeto arrastaria atras da mao no instante em que eu agarro. Quem
      // tira o objeto de est.meusObj e o OBJ_DONO de outro dono, o soltar, o
      // arremessar e o destruiu — entao estar aqui ja significa "sou eu que
      // mando a posicao deste".
      const meu = est.meusObj.get(id)
      if (meu && (o.dono === rede.meuId || o.dono === 0)) {
        o.x = meu.x; o.y = meu.y; o.z = meu.z; o.rotY = meu.rotY
        vistos.add(id)
        continue
      }

      if (eb) {
        o.x = ea.x + (eb.x - ea.x) * t
        o.y = ea.y + (eb.y - ea.y) * t
        o.z = ea.z + (eb.z - ea.z) * t
        o.rotY = anguloCurto(ea.rotY, eb.rotY, t)
      } else {
        o.x = ea.x; o.y = ea.y; o.z = ea.z; o.rotY = ea.rotY
      }
      vistos.add(id)
    }
    // Sumiu do snapshot = voltou a ser objeto parado no lugar de origem (o
    // servidor so manda os que se mexeram). Quem desenha vai buscar a pose
    // original em mundo.js — nao e "desapareceu".
    for (const id of rede.objetos.keys()) if (!vistos.has(id)) rede.objetos.delete(id)
  }

  /** Chamado TODO FRAME pelo main, com o dt real do video. */
  rede.atualizar = function atualizar(dtSegundos) {
    const dt = dtSegundos > 0 ? dtSegundos : 0

    // bytes/s numa janela de meio segundo: numero pro painel, nada mais.
    // Mede pelo RELOGIO, nao pelo dt do jogo: o main limita o dt em 0.05 s pra
    // a fisica nao explodir num travamento, entao abaixo de 20 fps o dt corre
    // mais devagar que o mundo e a divisao inflava os bytes/s (medi 53 KB/s
    // onde o socket real trocava 2 KB/s).
    if (est.janelaEm === undefined) est.janelaEm = agora()
    const decorrido = (agora() - est.janelaEm) / 1000
    if (decorrido >= 0.5) {
      rede.stats.bytesPorSegundo = Math.round(est.bytesJanela / decorrido)
      est.bytesJanela = 0
      est.janelaEm = agora()
    }

    const par = acharPar(agora() - ATRASO_INTERP * 1000)
    if (par) {
      interpolarJogadores(par.a, par.b, par.t)
      interpolarNpcs(par.a, par.b, par.t)
      interpolarObjetos(par.a, par.b, par.t)
    }

    rede.stats.ping = Math.round(est.pingMedio)
    rede.stats.nJogadores = rede.jogadores.size + (rede.conectado ? 1 : 0)
    rede.stats.nNpcs = rede.npcs.size
    rede.stats.nObjetos = rede.objetos.size
  }

  return rede
}

export default criarRede
