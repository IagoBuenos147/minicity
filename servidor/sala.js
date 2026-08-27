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
//   - a posicao final de um objeto solto (a queda e decidida AQUI);
//   - pose de veiculo que nao seja dele (VEICULO_POS de quem nao dirige: lixo);
//   - o id do helicoptero que ele montou (o id sai DAQUI, como o do portal).
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
  VEICULOS, HELI_ID_MIN, HELI_ID_MAX,
  ZUMBI_ID, ZUMBI_DOENCA, ZUMBI_GRITO, ZUMBI_VEL, ZUMBI_DIST_ATAQUE,
  ZUMBI_VIDA_MAX, ZUMBI_SUMIR, ZUMBI_RAIO,
  distXZ, olharPara,
} from '../src/comum/mundo.js'
import { LEVELS, WORLD } from '../src/config.js'
import { BARBER, GROCERY, PARK, FILLERS, WALL_T } from '../src/world/layout.js'

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
  ENTRAR_VEICULO, SAIR_VEICULO, VEICULO_POS, CRIAR_HELI, ZUMBI_TIRO,
} = Proto.P

const TIPOS = { ...Proto.P }

const RECUSA_VERSAO = Proto.RECUSA_VERSAO
const RECUSA_CHEIO = Proto.RECUSA_CHEIO
const NEGADO_NPC = Proto.NEGADO_NPC
const NEGADO_OBJETO = Proto.NEGADO_OBJETO
const NEGADO_VEICULO = Proto.NEGADO_VEICULO

// estados de objeto
const REPOUSO = Proto.EST_OBJ.REPOUSO
const SEGURO = Proto.EST_OBJ.SEGURO
const VOANDO = Proto.EST_OBJ.VOANDO
const DESTRUIDO = Proto.EST_OBJ.DESTRUIDO

// NPC conversando (EST_NPC.CONVERSANDO); os outros estados saem da pose.
const NPC_CONVERSANDO = Proto.EST_NPC.CONVERSANDO

/* Os estados do rapaz da porta da mercearia. Sao valores do MESMO enum de
   pose de NPC (EST_NPC), e por isso viajam no byte de estado que o registro de
   NPC do snapshot ja tinha: o zumbi nao custa nenhum byte a mais por quadro.
   Ver a regra 8 do cabecalho de protocolo.js. */
const Z_SAO = Proto.EST_NPC.SAO
const Z_ADOECENDO = Proto.EST_NPC.ADOECENDO
const Z_ZUMBI = Proto.EST_NPC.ZUMBI
const Z_MORTO = Proto.EST_NPC.MORTO
const Z_SUMIDO = Proto.EST_NPC.SUMIDO
const PARTE_CABECA = Proto.PARTE_CABECA

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
// PAREDES — as caixas em que o zumbi nao pode entrar.
//
// ISTO NAO E UMA SEGUNDA VERDADE SOBRE A CIDADE, e a MESMA. As caixas saem de
// src/world/layout.js, que e dado puro (sem THREE, sem nada) e e de onde o
// cliente levanta as paredes das lojas e os predios de cenario — o mesmo
// arquivo de onde alturaDoChao() aqui em cima ja tira o piso das lojas. O que
// nao pode existir e uma geometria ESCRITA A MAO aqui; ler a de la e o
// contrario disso.
//
// So XZ, sem altura: o zumbi anda no chao e nao pula. E so as caixas GRANDES —
// movel de loja, poste e caixote nao entram, porque eles nao estao em
// layout.js e inventa-los aqui seria exatamente a duplicacao que a regra
// proibe. Um zumbi que passa raspando numa prateleira nao incomoda ninguem;
// um que atravessa a fachada da mercearia, sim.
//
// A FACHADA E PARTIDA PELO VAO DA PORTA, do mesmo jeito que o cliente faz em
// registerCameraOccluders: sem isso o zumbi nunca entraria na loja atras de
// quem se escondeu la dentro, que e o lugar mais obvio pra correr.
const FOLGA_PORTA = 0.2   // alarga o vao: ele nao pode raspar na ombreira e travar

function caixa(x0, x1, z0, z1) { return { x0, x1, z0, z1 } }

const PAREDES = []
// predios de cenario: macicos, sem interior nenhum
for (const b of FILLERS) PAREDES.push(caixa(b.x0, b.x1, b.z0, b.z1))
// lojas: as 4 paredes, e nao a caixa cheia — o interior e util, da pra entrar
for (const b of [BARBER, GROCERY]) {
  const T = WALL_T
  PAREDES.push(caixa(b.x0, b.x0 + T, b.z0, b.z1))          // oeste
  PAREDES.push(caixa(b.x1 - T, b.x1, b.z0, b.z1))          // leste
  PAREDES.push(caixa(b.x0, b.x1, b.z0, b.z0 + T))          // fundos
  // fachada (z1) partida no vao da porta
  const dl = b.door.center - b.door.width / 2 - FOLGA_PORTA
  const dr = b.door.center + b.door.width / 2 + FOLGA_PORTA
  PAREDES.push(caixa(b.x0, dl, b.z1 - T, b.z1))
  PAREDES.push(caixa(dr, b.x1, b.z1 - T, b.z1))
}

/**
 * Tira um corpo de raio `r` de dentro de UMA caixa, pelo eixo de MENOR
 * penetracao. Devolve true se mexeu.
 *
 * O raio entra INFLANDO a caixa, em vez de virar uma conta de circulo contra
 * retangulo: o resultado e o mesmo em tudo que nao e canto, custa quatro
 * comparacoes e nao tem raiz quadrada nenhuma rodando 15 vezes por segundo.
 *
 * O eixo de menor penetracao e o que faz o perseguidor parecer esperto: ele
 * cancela so a componente que entrou na parede e deixa a outra passar, entao o
 * zumbi DESLIZA rente a fachada ate achar a porta em vez de ficar tremendo
 * contra o tijolo. Escolher o maior (ou empurrar pelos dois) o prenderia.
 */
function empurrarDeCaixa(p, r, c) {
  const x0 = c.x0 - r, x1 = c.x1 + r
  const z0 = c.z0 - r, z1 = c.z1 + r
  if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1) return false
  const oeste = p.x - x0, leste = x1 - p.x
  const sul = p.z - z0, norte = z1 - p.z
  const menor = Math.min(oeste, leste, sul, norte)
  if (menor === oeste) p.x = x0
  else if (menor === leste) p.x = x1
  else if (menor === sul) p.z = z0
  else p.z = z1
  return true
}

/**
 * Tira o corpo de dentro de TODAS as paredes. Duas passadas porque sair de uma
 * caixa pode enfiar o corpo na vizinha (as paredes de uma loja se encostam nos
 * cantos); a segunda resolve isso. Nao insisto mais que duas de proposito: em
 * canto fechado a terceira ficaria empurrando de um lado pro outro para sempre,
 * e parar um centimetro dentro do tijolo e melhor do que travar o tique.
 */
function tirarDasParedes(p, r) {
  for (let passada = 0; passada < 2; passada++) {
    let bateu = false
    for (let i = 0; i < PAREDES.length; i++) {
      if (empurrarDeCaixa(p, r, PAREDES[i])) bateu = true
    }
    if (!bateu) return
  }
}

/** A loja em que este ponto esta, ou null se ele esta na rua. */
function lojaEm(x, z) {
  for (const b of [BARBER, GROCERY]) {
    if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return b
  }
  return null
}

/**
 * PARA ONDE ANDAR, quando andar reto nao resolve.
 *
 * Escorregar na parede sozinho ja impede o zumbi de atravessar tijolo, mas nao
 * o faz ENTRAR: com o jogador escondido no fundo da mercearia, ele desliza pela
 * fachada ate ficar colado bem em cima da pessoa e para ali para sempre, com a
 * porta oito metros a oeste. Perseguidor que fica de cara na parede nao assusta
 * ninguem.
 *
 * O conserto e um ponto de passagem so, e ele sai do MESMO layout.js: se um dos
 * dois esta dentro de uma loja e o outro nao, ande primeiro ate a PORTA daquela
 * loja. Nao e busca de caminho, nao ha grafo nem lista aberta — sao duas caixas
 * e uma porta, que e tudo o que existe de fechado nesta cidade.
 *
 * Quando ele proprio esta dentro de uma loja, a porta que vale e a DELE: sair
 * vem antes de entrar em outra, senao ele miraria a porta da mercearia de
 * dentro da barbearia e se prensaria na parede errada.
 *
 * Devolve null quando nao ha nada no meio — e ai a mira e o jogador, como
 * sempre foi.
 */
function portaEntre(npc, alvo) {
  const minha = lojaEm(npc.x, npc.z)
  const dele = lojaEm(alvo.x, alvo.z)
  if (minha === dele) return null      // os dois na rua, ou os dois na mesma loja
  const loja = minha || dele
  // o meio do vao, na linha da fachada: passou dela, `lojaEm` muda e a mira
  // volta a ser o jogador no mesmo tique
  return { x: loja.door.center, z: loja.z1 }
}

// ---------------------------------------------------------------------------
// APARENCIA
//
// Sao 20 indices de catalogo (cabeca, olhos, pupila, nariz, boca, barba,
// cabelo, pele, corCabelo, sobrancelha e as nove pecas de roupa). O protocolo
// entrega e recebe este mesmo objeto, com estes mesmos nomes — o servidor nunca
// mexe em byte de aparencia na mao. Guardar em objeto (e nao em Uint8Array
// indexado) e o que impede que trocar a ordem dos campos um dia vire tom de
// pele no lugar de sobrancelha.
//
// A lista de campos vem do PROTOCOLO, nao e copiada aqui: quando ela crescer de
// novo, uma copia local guardaria a aparencia velha por nome e devolveria no
// BEMVINDO um jogador com metade das roupas zeradas.
//
// Pra sala, isto continua OPACO: ela nao sabe o que e "chapeu 3", so guarda por
// nome e reenvia. Quem da sentido a cada indice e o cliente.
// ---------------------------------------------------------------------------
const CAMPOS_APARENCIA = Proto.CAMPOS_APARENCIA

/** Copia so os campos do contrato, cada um cortado em 0..255. Lixo vira 0. */
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
  // 'sao' e a pose de UM NPC so: o rapaz da porta da mercearia. Ela entra
  // nesta mesma tabela de proposito, porque para a sala ele e um NPC igual aos
  // outros — o que muda e que o estado dele anda sozinho no passo().
  sao: Proto.EST_NPC.SAO,
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
      /* So o rapaz da porta da mercearia (1004) tem estes. Uma marca no
         proprio NPC, e nao um Map separado nem um `if (id === 1004)` espalhado
         pelo arquivo: quem le uma linha de FALAR ou de passo() ve na hora por
         que aquele NPC e diferente. */
      zumbi: n.id === ZUMBI_ID,
      vida: ZUMBI_VIDA_MAX,
      /* Relogio do estado atual, em SEGUNDOS, contado no passo(). Zera a cada
         troca de estado, como o tEstado do cliente. */
      tEstado: 0,
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

  /* Veiculos, por id (4000..4999). Os tres estacionados nascem com a sala e
     tem id fixo em MUNDO.VEICULOS; os helicopteros entram neste mesmo Map
     quando alguem monta um, com id dado aqui. Um Map so de proposito: entrar,
     sair e mandar pose e o MESMO codigo para carro e para helicoptero — o que
     muda entre eles e como se dirige, e isso e assunto do cliente.

     VEICULO NAO ENTRA NO SNAPSHOT. A pose vem do dono no VEICULO_POS e e
     reenviada aos outros; parado, ele fica exatamente onde o ultimo
     VEICULO_DONO disse. */
  const veiculos = new Map()
  for (const v of VEICULOS) {
    veiculos.set(v.id, {
      id: v.id,
      tipo: v.tipo,
      heli: false,
      criador: 0,                  // so o helicoptero tem: quem montou
      x: v.x, y: v.y, z: v.z, yaw: v.yaw,
      dono: 0,                     // 0 = livre, ninguem dirigindo
    })
  }

  let tick = 0
  /* Instante do ultimo passo(), para o dt sair do RELOGIO e nao da contagem
     de tiques (ver o comentario de passo()). */
  let ultimoPassoEm = Date.now()
  let ultimoId = 0
  let ultimoPortalId = PORTAL_ID_MIN - 1
  let ultimoHeliId = HELI_ID_MIN - 1

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

  /* Id de helicoptero 4100..4999, pela MESMA regra do id de portal: anda
     sempre para frente e nunca devolve um numero que ja esta em uso. Um
     helicoptero nao e destruido neste jogo, entao na pratica os ids so andam;
     a volta ao inicio existe pelo mesmo cuidado dos outros dois lacos. */
  function novoHeliId() {
    for (let i = 0; i < (HELI_ID_MAX - HELI_ID_MIN + 1); i++) {
      ultimoHeliId = ultimoHeliId >= HELI_ID_MAX ? HELI_ID_MIN : ultimoHeliId + 1
      if (!veiculos.has(ultimoHeliId)) return ultimoHeliId
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

  function pacoteVeiculoDono(v) {
    return Proto.escreverVeiculoDono(v.id, v.dono, v.x, v.y, v.z, v.yaw)
  }

  function pacoteHeliCriado(v) {
    return Proto.escreverHeliCriado(v.id, v.criador, v.x, v.y, v.z, v.yaw)
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
      veiculo: 0,           // id do veiculo que ele dirige (0 = a pe)
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

    /* Veiculo tambem nao entra no snapshot, pelo motivo oposto ao do portal
       (ver a regra 7 do protocolo). Entao quem chega agora precisa de:
       - um HELI_CRIADO por helicoptero vivo, senao os que foram montados antes
         dele nao existiriam na tela dele;
       - um VEICULO_DONO por veiculo OCUPADO, senao ele veria o carro parado no
         ponto de estacionamento enquanto outro jogador o dirige pela cidade.
       Veiculo livre e parado nao precisa de nada: a pose inicial dele ja esta
       em MUNDO.VEICULOS nos dois lados. O HELI_CRIADO vai antes do
       VEICULO_DONO do mesmo helicoptero porque nao se poe motorista num
       helicoptero que ainda nao apareceu. */
    for (const v of veiculos.values()) {
      if (v.heli) con.enviar(pacoteHeliCriado(v), true)
      if (v.dono) con.enviar(pacoteVeiculoDono(v), true)
    }

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

  /* Tira este jogador do veiculo que ele dirige e avisa TODOS que o veiculo
     ficou livre, onde ele parou. E a mesma funcao para o SAIR_VEICULO, para
     entrar em outro veiculo e para a queda de conexao — um caminho so, entao
     nao existe caso em que o carro fica preso num motorista que nao esta mais
     aqui. IDEMPOTENTE: chamar duas vezes nao manda VEICULO_DONO duas vezes.

     Repare que a pose NAO e recalculada: ela e a ultima que o dono mandou no
     VEICULO_POS. E de proposito — quem simulava a direcao era a maquina dele,
     e o servidor nao tem uma fisica de carro para "decidir melhor". O que ele
     decide, e isso e o que importa, e que essa pose e a oficial para todos. */
  function largarVeiculo(jogador) {
    const veicId = jogador.veiculo
    jogador.veiculo = 0
    if (!veicId) return
    const v = veiculos.get(veicId)
    if (!v || v.dono !== jogador.id) return
    v.dono = 0
    paraTodos(pacoteVeiculoDono(v), true)
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
    /* O veiculo do ausente e liberado NA HORA, onde ele parou. Um carro
       trancado num motorista que fechou a aba ficaria trancado para sempre —
       nao ha tempo esgotando nem nada que o libere depois. */
    largarVeiculo(jogador)
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
        /* O rapaz da porta da mercearia NAO conversa: falar com ele e o que
           COMECA A DOENCA. Ele passa por aqui, e nao por um pacote proprio,
           porque o pedido e exatamente o mesmo dos outros NPCs ("apertei E
           nesta pessoa") e quem decide o que acontece depois disso e o
           servidor — que e o ponto inteiro desta mudanca.
           IDEMPOTENTE: apertar E de novo (ou o pacote duplicar) so acha um NPC
           que ja nao esta mais SAO e sai calado. Sem NEGADO: nao ha nada
           ocupado, e o jogador ja esta vendo o rapaz tossir. */
        if (npc.zumbi) {
          if (npc.estado === Z_SAO) trocarEstadoZumbi(npc, Z_ADOECENDO)
          return
        }
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

      /* ENTRAR NUM VEICULO E UM PEDIDO — o mesmo desenho do PEGAR, porque o
         problema e o mesmo: uma coisa, uma pessoa. Dois apertando E no mesmo
         carro chegam um depois do outro AQUI; o primeiro acha livre e senta, o
         segundo acha ocupado e leva NEGADO. Nao existe empate porque nao
         existe outro lugar decidindo isso. */
      case ENTRAR_VEICULO: {
        const m = Proto.lerEntrarVeiculo(dv)
        if (!m) return
        const v = veiculos.get(m.veicId)
        if (!v) return
        // ja sou o motorista (pacote duplicado, ou apertou E de novo): so
        // reafirma o estado para ele. Idempotente.
        if (v.dono === jogador.id) { paraUm(jogador, pacoteVeiculoDono(v), true); return }
        if (v.dono) { paraUm(jogador, Proto.escreverNegado(NEGADO_VEICULO, v.id), true); return }
        /* Um jogador dirige NO MAXIMO um veiculo: entrar noutro larga o
           anterior, exatamente como a mao larga o objeto velho no PEGAR. Sem
           isto, sair do carro para a moto deixaria o carro ocupado por um
           motorista que esta a 20 m dali. */
        largarVeiculo(jogador)
        v.dono = jogador.id
        jogador.veiculo = v.id
        paraTodos(pacoteVeiculoDono(v), true)
        return
      }

      /* Sair de um veiculo que nao e meu nao faz nada e nao responde nada:
         nao houve pedido de posse, entao nao ha o que negar. */
      case SAIR_VEICULO: {
        const m = Proto.lerSairVeiculo(dv)
        if (!m) return
        const v = veiculos.get(m.veicId)
        if (!v || v.dono !== jogador.id) return
        largarVeiculo(jogador)
        return
      }

      /* Enquanto ele dirige, a maquina dele manda a pose e o servidor REENVIA
         aos outros — veiculo nao entra no snapshot (regra 7 do protocolo). De
         QUALQUER outro isto e ignorado em silencio, igual ao OBJ_POS: e a
         mesma linha (v.dono !== jogador.id) que impede um cliente estragado de
         dirigir o carro dos outros.

         Reescrevo os bytes em vez de repassar os que chegaram porque assim o
         que sai da sala e sempre pose SANEADA (sem NaN, sem infinito) e no
         formato que este servidor conhece. Sao 19 bytes 15 vezes por segundo
         por motorista: nao custa nada perto de ter que confiar no que chegou.

         Canal NAO confiavel, e o proprio dono fica de fora do reenvio: ele ja
         desenhou aquilo — receber a propria pose 100 ms atrasada so serviria
         para brigar com o que ele ja tem na tela. */
      case VEICULO_POS: {
        const m = Proto.lerVeiculoPos(dv)
        if (!m) return
        const v = veiculos.get(m.veicId)
        if (!v || v.dono !== jogador.id) return
        if (!finito(m.x, METADE_MAPA) || !finito(m.y, 500) || !finito(m.z, METADE_MAPA)) return
        v.x = m.x; v.y = m.y; v.z = m.z
        v.yaw = Number.isFinite(m.yaw) ? m.yaw : 0
        const rolagem = Number.isFinite(m.rolagem) ? m.rolagem : 0
        paraTodos(Proto.escreverVeiculoPos(v.id, v.x, v.y, v.z, v.yaw, rolagem), false, jogador)
        return
      }

      /* CRIAR_HELI e um PEDIDO, como ABRIR_PORTAL: o cliente diz onde a
         montagem terminou; QUEM DA O ID E O SERVIDOR. O helicoptero nasce
         LIVRE — o contrato diz que ele "fica pronto para entrar com E", entao
         quem montou entra pelo mesmo ENTRAR_VEICULO de todo mundo. */
      case CRIAR_HELI: {
        const m = Proto.lerCriarHeli(dv)
        if (!m) return
        if (!finito(m.x, METADE_MAPA) || !finito(m.y, 500) || !finito(m.z, METADE_MAPA)) return
        /* Alcance: a mesma sanidade do SOLTAR e do ABRIR_PORTAL. Nao e
           anti-trapaca (ninguem disputa nada aqui), e so nao deixar um cliente
           estragado montar um helicoptero do outro lado da cidade. */
        if (distXZ(m.x, m.z, jogador.x, jogador.z) > 30) return
        const id = novoHeliId()
        if (!id) return          // 900 helicopteros vivos: nao inventa id
        const v = {
          id,
          tipo: 'helicoptero',
          heli: true,
          criador: jogador.id,
          x: m.x, y: m.y, z: m.z,
          yaw: Number.isFinite(m.yaw) ? m.yaw : 0,
          dono: 0,
        }
        veiculos.set(id, v)
        paraTodos(pacoteHeliCriado(v), true)
        return
      }

      /* O TIRO NO ZUMBI. E a unica coisa deste NPC que nasce no cliente, e por
         um motivo so: o servidor nao tem a mira de ninguem. Quem tracou o raio
         e sabe se pegou a cabeca ou o corpo foi a maquina de quem atirou.

         O QUE CHEGA AQUI E "ONDE ACERTEI", NUNCA "QUANTO DE VIDA SOBROU".
         Quem subtrai a vida e este arquivo, e so ele: 1 na cabeca mata (tira
         ZUMBI_VIDA_MAX de uma vez), 3 no corpo matam. Se a vida viesse no
         pacote, um cliente estragado mandaria "vida 0" e mataria o NPC na tela
         de todo mundo. E por isso que a vida nem sequer SAI daqui: ela nao
         esta no snapshot, so o estado esta.

         Tiro em NPC ja morto sai em silencio — e a idempotencia que importa
         aqui. Dois tiros iguais no corpo TEM que contar dois: dois tiros sao
         dois tiros. */
      case ZUMBI_TIRO: {
        const m = Proto.lerZumbiTiro(dv)
        if (!m) return
        const npc = npcs.get(m.npcId)
        if (!npc || !npc.zumbi) return
        if (npc.estado === Z_MORTO || npc.estado === Z_SUMIDO) return
        /* Alcance: a mesma sanidade do SOLTAR e do ABRIR_PORTAL. Nao e
           anti-trapaca (ninguem disputa nada aqui), e so nao deixar um cliente
           estragado matar o zumbi do outro lado da cidade, sem nunca ter
           chegado perto dele. O revolver tem alcance bem menor que isto. */
        if (distXZ(npc.x, npc.z, jogador.x, jogador.z) > 40) return
        npc.vida -= (m.parte === PARTE_CABECA) ? ZUMBI_VIDA_MAX : 1
        if (npc.vida <= 0) {
          npc.vida = 0
          /* Morreu ANTES de virar zumbi (deu tiro no rapaz doente, ou no
             rapaz sao): ele cai do mesmo jeito. O estado que sai daqui e
             sempre MORTO, entao o cliente tem um caminho so pra "ele caiu". */
          trocarEstadoZumbi(npc, Z_MORTO)
        }
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

  // --- o rapaz que vira zumbi (NPC 1004) -----------------------------------
  //
  // O CEREBRO DELE MORA AQUI. Antes ele decidia tudo no cliente, e o resultado
  // era o previsivel num jogo de mundo compartilhado: cada jogador tinha o seu
  // zumbi particular: um via o rapaz virar bicho e vir pra cima, e o amigo do
  // lado continuava vendo um rapaz sadio parado na porta.
  //
  // O que anda por aqui e SO a verdade do mundo: em que estado ele esta, onde
  // ele esta e pra onde ele olha. Tudo isso ja cabe no registro de NPC do
  // snapshot, sem um byte a mais. O sangue, o clarao, a onda de choque, a
  // camera lenta, o tremor, a tosse, o balao e a pele esverdeando NAO passam
  // por aqui: sao desenho, e desenho e do cliente.
  //
  // ELE NAO ATRAVESSA PAREDE. Anda em linha reta ate o jogador mais proximo e
  // depois e empurrado pra fora das caixas de PAREDES (la em cima), que saem
  // de src/world/layout.js — o MESMO dado de onde o cliente levanta as paredes
  // e de onde alturaDoChao() ja tira o piso das lojas. Ler aquele arquivo nao
  // e duplicar a cidade; escrever caixas na mao aqui e que seria.
  // A fachada das duas lojas e partida no vao da porta, entao ele entra atras
  // de quem se escondeu la dentro — que e o primeiro lugar pra onde se corre.

  /* Troca o estado do zumbi e zera o relogio dele. Um lugar so: e por aqui que
     passam a doenca (FALAR), a virada, a morte (ZUMBI_TIRO) e o sumico. */
  function trocarEstadoZumbi(npc, novo) {
    if (!npc || npc.estado === novo) return
    npc.estado = novo
    npc.tEstado = 0
    /* estadoBase e "para o que ele volta quando a conversa acaba". Este NPC
       nao conversa, mas manter os dois iguais garante que nenhum caminho
       generico de NPC (liberarDialogo, por exemplo) ressuscite um zumbi
       morto ao devolver a pose original. */
    npc.estadoBase = novo
  }

  /* O jogador mais perto deste ponto, ou null com a sala vazia. E o alvo da
     perseguicao: sem ninguem online nao ha para onde andar, e o zumbi fica
     parado onde estava — nao ha "ultimo alvo" guardado, porque um alvo que
     nao esta mais aqui e exatamente o tipo de coisa que fica presa. */
  function jogadorMaisProximo(x, z) {
    let melhor = null
    let menor = Infinity
    for (const j of jogadores.values()) {
      const d = distXZ(x, z, j.x, j.z)
      if (d < menor) { menor = d; melhor = j }
    }
    return melhor
  }

  function passoZumbi(dt) {
    const npc = npcs.get(ZUMBI_ID)
    if (!npc || !npc.zumbi) return
    // parado na calcada, ou ja sumiu: nao ha relogio correndo
    if (npc.estado === Z_SAO || npc.estado === Z_SUMIDO) return
    npc.tEstado += dt

    /* A doenca dura ZUMBI_DOENCA segundos CONTADOS AQUI. Se cada maquina
       contasse os seus 10 s, ele viraria zumbi em horas diferentes em cada
       tela — o mesmo motivo pelo qual o servidor conta o tempo do portal. */
    if (npc.estado === Z_ADOECENDO) {
      if (npc.tEstado >= ZUMBI_DOENCA) trocarEstadoZumbi(npc, Z_ZUMBI)
      return
    }

    /* Morto ele PARA DE ANDAR, e so. Passado o tempo que o cliente gasta
       desenhando a queda e o fade, o estado vira SUMIDO — que e o que conta
       pra quem ENTRA DEPOIS: sem esse segundo estado, quem chegasse dez
       minutos atrasado receberia "morto" e comecaria a desenhar a queda de
       novo, como se o tiro tivesse acabado de acontecer. */
    if (npc.estado === Z_MORTO) {
      if (npc.tEstado >= ZUMBI_SUMIR) trocarEstadoZumbi(npc, Z_SUMIDO)
      return
    }

    /* ZUMBI: os primeiros ZUMBI_GRITO segundos ele fica PARADO gritando. Sem
       essa pausa aqui, o cliente desenharia a pose do grito com o corpo ja
       deslizando pela calcada, porque a posicao vem daqui e a pose e local. */
    if (npc.tEstado < ZUMBI_GRITO) return

    const alvo = jogadorMaisProximo(npc.x, npc.z)
    if (!alvo) return
    const d = distXZ(npc.x, npc.z, alvo.x, alvo.z)
    if (d <= ZUMBI_DIST_ATAQUE) {
      // encostou: para de andar, mas continua encarando a pessoa
      npc.yaw = olharPara(npc.x, npc.z, alvo.x, alvo.z)
      return
    }

    /* Pra onde ele anda: o jogador, ou a porta da loja que separa os dois. Sem
       parede no meio, `porta` e null e isto e a linha reta de sempre. */
    const porta = portaEntre(npc, alvo)
    const mx = porta ? porta.x : alvo.x
    const mz = porta ? porta.z : alvo.z
    const dm = distXZ(npc.x, npc.z, mx, mz)
    if (dm < 1e-4) return
    // ele olha pra ONDE ANDA, e nao pro jogador: indo pela porta, encarar a
    // pessoa atraves da parede o faria andar de lado, de caranguejo
    npc.yaw = olharPara(npc.x, npc.z, mx, mz)
    /* Anda no maximo ate a distancia de ataque: sem esse teto, um dt grande
       (o servidor engasgou) faria ele atravessar o jogador e sair do outro
       lado, e no tique seguinte voltar — tremendo em cima da pessoa. O teto
       so vale pro JOGADOR: parar a 1,15 m da porta seria parar antes de
       entrar, e ele nunca entraria. */
    const teto = porta ? ZUMBI_VEL * dt : Math.min(ZUMBI_VEL * dt, d - ZUMBI_DIST_ATAQUE)
    npc.x += ((mx - npc.x) / dm) * teto
    npc.z += ((mz - npc.z) / dm) * teto
    /* E entao ele sai de dentro de qualquer parede em que tenha entrado. Feito
       DEPOIS do passo, e nao antes: andar reto continua sendo o plano, e a
       parede so corrige o que ele nao podia fazer. Como o empurrao e pelo eixo
       de menor penetracao, o que sobra da direcao continua valendo e ele
       desliza rente a fachada em vez de tremer contra ela. */
    tirarDasParedes(npc, ZUMBI_RAIO)
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

  /**
   * Um tique do mundo.
   *
   * dtForcado (segundos) existe para os testes poderem adiantar o relogio sem
   * esperar 10 s de parede pela doenca do zumbi. Em producao ninguem passa
   * nada e o dt sai do RELOGIO, nao da contagem de tiques: rede-ws.js repoe
   * tique perdido chamando passo() varias vezes seguidas e desiste depois de
   * cinco. Contando tiques, o zumbi andaria devagar depois de um engasgo e
   * ficaria para tras do tempo real para sempre; contando relogio, o tique
   * seguinte ja anda o que faltava.
   */
  function passo(dtForcado) {
    tick = (tick + 1) >>> 0

    const agora = Date.now()
    let dt = Number.isFinite(dtForcado) ? Number(dtForcado) : (agora - ultimoPassoEm) / 1000
    ultimoPassoEm = agora
    /* Teto de meio segundo: se o processo travou (ou a maquina dormiu), o
       zumbi nao pode dar um salto de dez metros e aparecer dentro de alguem. */
    if (!(dt > 0)) dt = 0
    else if (dt > 0.5) dt = 0.5

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

    /* O RELOGIO DA DOENCA E A PERSEGUICAO. Aqui, e nao no cliente: e isto que
       faz o rapaz adoecer, virar bicho e vir andando no MESMO instante e pelo
       MESMO caminho na tela de todo mundo. */
    passoZumbi(dt)

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
    NEGADO_VEICULO, HELI_ID_MIN, HELI_ID_MAX,
    // o zumbi: id, estados e os numeros que a simulacao usa
    ZUMBI_ID, ZUMBI_DOENCA, ZUMBI_GRITO, ZUMBI_VEL, ZUMBI_DIST_ATAQUE,
    ZUMBI_VIDA_MAX, ZUMBI_SUMIR,
    Z_SAO, Z_ADOECENDO, Z_ZUMBI, Z_MORTO, Z_SUMIDO,
  }

  const sala = {
    C,
    entrar, sair, passo, aoMensagem, aoPacote, lerEntrar,
    jogadores, npcs, objetos, portais, veiculos,
    fecharPortal, largarVeiculo,
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
  ENTRAR_VEICULO: 14, SAIR_VEICULO: 15, VEICULO_POS: 16, CRIAR_HELI: 17,
  ZUMBI_TIRO: 18,
  BEMVINDO: 128, RECUSA: 129, SNAPSHOT: 130, ENTROU: 131, SAIU: 132,
  APARENCIA: 133, DIALOGO: 134, DIALOGO_FIM: 135, OBJ_DONO: 136,
  OBJ_DESTRUIDO: 137, NEGADO: 138, PORTAL_ABERTO: 139, PORTAL_FECHADO: 140,
  VEICULO_DONO: 141, HELI_CRIADO: 142,
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
