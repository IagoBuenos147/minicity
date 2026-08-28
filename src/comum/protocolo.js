// ---------------------------------------------------------------------------
// O PROTOCOLO BINARIO. Este arquivo roda nos DOIS lados (navegador e Node),
// e por isso nao importa THREE nem nada de render.
//
// Regras que valem para o arquivo inteiro:
//
// 1. Todo pacote comeca com 1 byte de tipo. Little-endian, sempre DataView.
//    Little-endian porque e o formato nativo de todo x86/ARM que vai rodar
//    isto: escrever e ler vira uma copia de memoria, sem troca de bytes.
//
// 2. NADA e identificado por indice de array nem por referencia de objeto.
//    So id numerico estavel (ver src/comum/mundo.js). Quem le procura pelo
//    id e ACEITA nao achar — o outro lado pode ter um mundo diferente do seu
//    por um instante, e isso e normal.
//
// 3. O pacote SE PERDE, DUPLICA e CHEGA FORA DE ORDEM. Aqui isso significa:
//    todo leitor confere o byteLength ANTES de ler e devolve null se nao
//    bater. Um leitor que lanca excecao derruba o laco de rede inteiro por
//    causa de um pacote torto; devolver null so descarta aquele pacote.
//
// 4. Nao existe predicao, reconciliacao nem portao de aceitacao neste jogo.
//    Ninguem disputa nada: o servidor e a verdade e o cliente desenha o que
//    chega, 100 ms atras. Por isso o protocolo e so "estado", sem numero de
//    input nem carimbo de tempo do cliente.
//
// 5. PORTAIS tem faixa de id propria: 3000..3999, dada pelo SERVIDOR. Ela nao
//    encosta na dos jogadores (1..999), NPCs (1000..1999) nem objetos
//    (2000..2999), entao um u16 solto ja diz de que tipo de coisa ele fala.
//    O id NAO e reaproveitado enquanto aquele portal estiver aberto: reusar o
//    numero faria um PORTAL_FECHADO atrasado do portal velho apagar o novo.
//
// 6. PORTAL NAO ENTRA NO SNAPSHOT. Sao no maximo um por jogador, nascem e
//    morrem por evento e NAO se mexem depois de abertos — repetir isso 15
//    vezes por segundo seria pagar banda para dizer o que ninguem mudou. Eles
//    viajam por PORTAL_ABERTO / PORTAL_FECHADO no canal confiavel, e quem
//    entra atrasado recebe um PORTAL_ABERTO de cada portal vivo logo depois do
//    BEMVINDO (o mesmo papel que o BEMVINDO faz pelos objetos parados).
//
// 7. VEICULO TAMBEM NAO ENTRA NO SNAPSHOT, pelo motivo oposto ao do portal:
//    ele se mexe DEMAIS, mas so quando alguem esta dirigindo, e quem simula a
//    direcao e a maquina do dono. Por isso a pose viaja no VEICULO_POS que o
//    dono manda a 15 Hz e o servidor REENVIA aos outros — e o unico pacote
//    deste jogo que anda nos dois sentidos com o mesmo numero (16). Reemitir
//    os mesmos 19 bytes com um numero 14x seria manter dois nomes para um
//    formato so, que e exatamente o que a regra 2 do sala.js proibe. Quem
//    entra atrasado recebe um VEICULO_DONO de cada veiculo ocupado (e um
//    HELI_CRIADO de cada helicoptero vivo), pelo mesmo caminho do portal.
//
// 8. O RAPAZ QUE VIRA ZUMBI E UM NPC COMUM (id 1004), e nao um sistema a
//    parte. A doenca, a virada, a perseguicao e a morte dele sao ESTADOS no
//    enum EST_NPC — os mesmos 15 bytes de NPC que o snapshot ja mandava,
//    nenhum byte a mais por quadro. A posicao dele viaja no x/z/yaw do mesmo
//    registro, como a de qualquer NPC.
//    O UNICO pacote novo e o ZUMBI_TIRO (18), porque o tiro e a unica coisa
//    que nasce no cliente: o servidor nao sabe onde a mira estava. Ele leva o
//    id do NPC e UM BYTE dizendo a parte (cabeca ou corpo) — nunca a vida
//    resultante. Quem subtrai vida e o servidor; a vida do cliente e desenho.
//    Todo o resto (sangue, clarao, onda de choque, camera lenta, tremor,
//    tosse, balao, a pele esverdeando) e 100% LOCAL: cada maquina desenha
//    sozinha a partir da TRANSICAO de estado que ela observa no snapshot.
// ---------------------------------------------------------------------------

import { VERSAO_PROTOCOLO, TICK_HZ, HELI_ID_MIN, HELI_ID_MAX } from './mundo.js'

export { VERSAO_PROTOCOLO, TICK_HZ }

// --- tipos de mensagem ------------------------------------------------------
// 1..127 = cliente -> servidor. 128..255 = servidor -> cliente.
// O corte em 128 nao e enfeite: da pra saber o sentido do pacote olhando
// so o bit alto do primeiro byte, o que ajuda a jogar fora lixo cedo.
export const P = {
  ENTRAR: 1,
  MEU_ESTADO: 2,
  MINHA_APARENCIA: 3,
  FALAR: 4,
  SAIR_DIALOGO: 5,
  ESCOLHA: 6,
  PEGAR: 7,
  SOLTAR: 8,
  ARREMESSAR: 9,
  OBJ_POS: 10,
  DESTRUIU: 11,
  ABRIR_PORTAL: 12,
  PEGAR_ITEM: 13,
  ENTRAR_VEICULO: 14,
  SAIR_VEICULO: 15,
  VEICULO_POS: 16,
  CRIAR_HELI: 17,
  ZUMBI_TIRO: 18,
  REINICIAR: 19,
  PRONTO: 20,
  COMECAR: 21,
  MEU_NOME: 22,

  BEMVINDO: 128,
  RECUSA: 129,
  SNAPSHOT: 130,
  ENTROU: 131,
  SAIU: 132,
  APARENCIA: 133,
  DIALOGO: 134,
  DIALOGO_FIM: 135,
  OBJ_DONO: 136,
  OBJ_DESTRUIDO: 137,
  NEGADO: 138,
  PORTAL_ABERTO: 139,
  PORTAL_FECHADO: 140,
  VEICULO_DONO: 141,
  HELI_CRIADO: 142,
  MUNDO_REINICIADO: 143,
  SALA_ESTADO: 144,
}

// Nome legivel do tipo, so pro painel F3 e pra depurar. Nao entra na rede.
const NOME_DO_TIPO = {}
for (const k of Object.keys(P)) NOME_DO_TIPO[P[k]] = k
export function nomeDoTipo(tipo) { return NOME_DO_TIPO[tipo] || ('?' + tipo) }

// --- motivos e enums que os dois lados precisam falar igual -----------------
export const RECUSA_VERSAO = 1
export const RECUSA_CHEIO = 2

// NEGADO.oque
export const NEGADO_NPC = 1
export const NEGADO_OBJETO = 2
// 3 = veiculo ocupado. Existe pelo mesmo motivo do NEGADO_OBJETO: sem
// resposta, quem apertou E num carro que ja tem motorista ficaria apertando E
// sem nada acontecer e sem saber por que.
export const NEGADO_VEICULO = 3

// MEU_ESTADO.anim / jogador no SNAPSHOT
export const ANIM = { PARADO: 0, ANDANDO: 1, CORRENDO: 2, NO_AR: 3, SENTADO: 4 }

// MEU_ESTADO.flags — bits, nao valores. Cabe muita coisa em 1 byte e mudar
// um bit novo no futuro nao muda o tamanho do pacote de 15 Hz.
export const FLAG_SENTADO = 1 << 0
export const FLAG_ANEL = 1 << 1

// NPC no SNAPSHOT.
//
// 0..4 sao as poses de sempre. 5..9 sao o rapaz da porta da mercearia (id
// 1004): a maquina de estados dele mora no SERVIDOR (servidor/sala.js, no
// passo()) e viaja NESTE MESMO BYTE, que o registro de NPC ja tinha. E por
// isso que o zumbi custa zero byte a mais por quadro — ele nao e um sistema
// novo, e um NPC com estados novos.
//
// SUMIDO existe separado de MORTO por causa de quem ENTRA ATRASADO: sem ele,
// um jogador que chega dez minutos depois receberia "morto" e comecaria a
// desenhar a queda e o desaparecimento de novo, como se o tiro tivesse
// acabado de acontecer. Com ele, quem chega depois ve so a mancha no chao.
export const EST_NPC = {
  PARADO: 0, TRABALHANDO: 1, SENTADO: 2, CORTANDO: 3, CONVERSANDO: 4,
  SAO: 5, ADOECENDO: 6, ZUMBI: 7, MORTO: 8, SUMIDO: 9,
}

// ZUMBI_TIRO.parte — 1 byte. Nao e booleano de proposito: 0 fica sendo "nao
// disse", que o servidor descarta, do mesmo jeito que 0 e "ninguem" em
// falandoCom. Um bool teria feito lixo virar "corpo" em silencio.
export const PARTE_CABECA = 1
export const PARTE_CORPO = 2

// objeto agarravel no SNAPSHOT
export const EST_OBJ = { REPOUSO: 0, SEGURO: 1, VOANDO: 2, DESTRUIDO: 3 }

// 0 nunca e id de jogador (a faixa comeca em 1), entao 0 serve de "ninguem"
// em falandoCom e em dono. Assim nao precisa de um byte extra de "tem dono?".
export const NINGUEM = 0

// --- portal -----------------------------------------------------------------
// Faixa propria e estavel, dada pelo servidor. Ver a regra 5 do cabecalho:
// nao encosta em nenhuma outra faixa e nao e reaproveitada com o portal vivo.
export const PORTAL_ID_MIN = 3000
export const PORTAL_ID_MAX = 3999

/** True se o u16 esta na faixa de portal. Quem recebe um id fora dela descarta. */
export function ehIdDePortal(id) {
  return (id | 0) >= PORTAL_ID_MIN && (id | 0) <= PORTAL_ID_MAX
}

// --- veiculo ----------------------------------------------------------------
// Faixa 4000..4999: os tres estacionados tem id FIXO em MUNDO.VEICULOS, e o
// helicoptero recebe o dele do SERVIDOR em MUNDO.HELI_ID_MIN..HELI_ID_MAX
// (4100..4999) — a mesma regra do portal, e pelo mesmo motivo: id nao volta a
// ser usado enquanto aquele veiculo existir, senao um VEICULO_DONO atrasado do
// veiculo velho poria um motorista dentro do novo.
export const VEICULO_ID_MIN = 4000
export const VEICULO_ID_MAX = 4999

export { HELI_ID_MIN, HELI_ID_MAX }

/** True se o u16 esta na faixa de veiculo. Id fora dela e lixo: descarta. */
export function ehIdDeVeiculo(id) {
  return (id | 0) >= VEICULO_ID_MIN && (id | 0) <= VEICULO_ID_MAX
}

/** True se o veiculo e um helicoptero (a sub-faixa que o servidor distribui). */
export function ehIdDeHeli(id) {
  return (id | 0) >= HELI_ID_MIN && (id | 0) <= HELI_ID_MAX
}

// --- itens (PEGAR_ITEM e o byte de itens do BEMVINDO) -----------------------
// O item viaja como NUMERO no PEGAR_ITEM (1 = arma de portal) e como BIT no
// BEMVINDO. Bit e nao contador porque o inventario deste jogo e "tem ou nao
// tem": cabem 8 itens no mesmo byte e um item novo nao muda o tamanho do
// pacote. ITEM_PORTAL_GUN vale 1 nos dois papeis so por coincidencia feliz
// (1 << 0), entao ITENS_* existe para o lado que precisa da mascara.
export const ITEM_PORTAL_GUN = 1
export const ITENS_PORTAL_GUN = 1 << 0

/** Mascara de bit do item, ou 0 se o numero nao e um item conhecido. */
export function bitDoItem(item) {
  return (item | 0) === ITEM_PORTAL_GUN ? ITENS_PORTAL_GUN : 0
}

// --- aparencia --------------------------------------------------------------
// A ORDEM DESTA LISTA E O PROTOCOLO. Um byte por campo, todos INDICES de
// catalogo (nunca cor crua): cor RGB nao cabe num byte e a paleta muda com o
// tempo, o indice nao. Mexer na ordem daqui e mudar o significado de todos os
// bytes que ja estao no ar — por isso VERSAO_PROTOCOLO subiu pra 3 quando ela
// passou de 6 para 20 campos.
//
// O campo 19 ('reservado') existe de proposito e vale sempre 0 hoje: e a folga
// pra um acessorio novo entrar sem mudar o TAMANHO do pacote de novo, que e o
// que obriga a subir a versao e recusar todo cliente velho.
export const CAMPOS_APARENCIA = [
  'cabeca',      //  0  formato do cranio
  'olhos',       //  1  formato/abertura da palpebra
  'pupila',      //  2  tamanho, cor e forma da iris
  'nariz',       //  3
  'boca',        //  4
  'barba',       //  5  0 = sem barba
  'cabelo',      //  6
  'pele',        //  7  tom
  'corCabelo',   //  8
  'sobrancelha', //  9
  'chapeu',      // 10  0 = nenhum
  'calcado',     // 11  0 = descalco
  'blusa',       // 12  0 = nenhuma
  'calca',       // 13
  'colar',       // 14  0 = nenhum
  'anelAcess',   // 15  0 = nenhum
  'tatuagem',    // 16  0 = nenhuma
  'relogio',     // 17  0 = nenhum
  'jaqueta',     // 18  0 = nenhuma
  'reservado',   // 19  folga: ver o comentario acima
]

/**
 * Quantas opcoes cada campo tem, na MESMA ordem da lista acima. Mora aqui, e
 * nao no catalogo de render, porque o servidor e o Node nao importam THREE:
 * quem precisa cortar um indice fora da faixa (cliente-rede.js) tem que poder
 * fazer isso sem carregar meio motor grafico. 0 = sem limite conhecido (o
 * campo reservado aceita qualquer byte).
 */
// Os numeros TEM que acompanhar o tamanho real dos catalogos. Quando eles
// ficaram pra tras (os catalogos cresceram e esta lista nao), o efeito foi
// invisivel e cruel: o boneco local ficava certo e o byte que viajava era
// cortado, entao a cabeca 12 chegava como 7 na tela dos outros. Sem erro
// nenhum no console. Ao mexer num catalogo, mexa AQUI na mesma linha:
//
//   node -e "Promise.all([import('./src/player/appearance.js'),
//     import('./src/player/roupas.js')]).then(([A,R])=>console.log(
//     [A.CABECAS,A.OLHOS,A.PUPILAS,A.NARIZES,A.BOCAS,A.BARBAS,A.CABELOS,
//      A.SKIN_TONES,A.HAIR_COLORS,A.SOBRANCELHAS,R.CHAPEUS,R.CALCADOS,
//      R.BLUSAS,R.CALCAS,R.COLARES,R.ANEIS,R.TATUAGENS,R.RELOGIOS
//     ].map(c=>c.length).join(', ')))"
//
// 'jaqueta' vale 1 (so o indice 0) porque blusa e jaqueta viraram UMA aba: o
// catalogo JAQUETAS esta vazio e o campo continua no pacote por causa dos 20
// bytes fixos, sempre em 0. Ver o comentario de JAQUETAS em roupas.js.
export const APARENCIA_OPCOES = [
  13, 10, 22, 10, 10, 10, 10, 10, 11, 10,
  11, 11, 19, 11, 11, 11, 11, 11, 1, 0,
]

/**
 * O que um jogador que nunca escolheu nada usa. Nao e tudo zero: 0 quer dizer
 * "nenhum" em blusa e calcado, entao um padrao todo zerado nasceria pelado e
 * descalco. Cabelo/rosto ficam no primeiro item do catalogo mesmo.
 */
const APARENCIA_DEFAULT = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 0,
  0, 1, 1, 0, 0, 0, 0, 0, 0, 0,
]

// --- tamanhos fixos ---------------------------------------------------------
// 20 bytes: um por campo de CAMPOS_APARENCIA. Derivado da lista de proposito —
// escrever "20" na mao aqui e um jeito garantido de o dia em que a lista mudar
// o pacote sair com um byte a mais ou a menos e ninguem notar.
export const APARENCIA_BYTES = CAMPOS_APARENCIA.length
const REG_JOGADOR = 18                // u16 id, f32 x,y,z, i16 yaw, u8 anim, u8 flags
const REG_NPC = 15                    // u16 id, f32 x,z, i16 yaw, u8 estado, u16 falandoCom
const REG_OBJ = 19                    // u16 id, f32 x,y,z, i16 rotY, u16 dono, u8 estado

// Cabecalho do BEMVINDO ate o fim do byte de itens: 1 tipo + u16 meuId +
// u16 versao + u8 tickHz + aparencia + u8 itens. Sai de APARENCIA_BYTES porque
// a aparencia fica NO MEIO do pacote: com o numero escrito na mao, crescer a
// aparencia jogaria as listas de NPC e objeto pra um offset errado e o mundo
// seria montado torto, sem nenhum erro aparecer.
const BEMVINDO_CABECA = 1 + 2 + 2 + 1 + APARENCIA_BYTES + 1

// Nome cabe em u8 de tamanho; 32 bytes ja e mais do que qualquer nome de tela
// precisa e mantem o ENTROU pequeno o bastante pra nunca fragmentar.
export const MAX_NOME_BYTES = 32

// Contagem de lista viaja em u8: 255 e o teto fisico das tres listas do
// SNAPSHOT. O mundo real tem 20 jogadores, 3 NPCs e 28 objetos.
const MAX_LISTA = 255

// --- canal: o que pode se perder e o que nao pode ---------------------------
// So as mensagens de FLUXO CONTINUO a 15 Hz sao "o mais novo manda, perdeu
// tudo bem": corpo, objeto na mao, veiculo e snapshot. Note que VEICULO_POS
// entra aqui nos DOIS sentidos (o dono manda, o servidor reenvia) — e a mesma
// pose, e ela vale o mesmo tanto: nada.
// Todo o resto e EVENTO — perder um evento deixa o mundo
// errado pra sempre (objeto que fica preso, dialogo que nunca fecha), entao
// vai no canal confiavel.
const NAO_CONFIAVEIS = new Set([P.MEU_ESTADO, P.OBJ_POS, P.SNAPSHOT, P.VEICULO_POS])

/**
 * Aceita o tipo (numero) ou o pacote inteiro (DataView, ArrayBuffer ou
 * TypedArray) porque o transporte chama isto com o buffer na mao, sem saber
 * ler protocolo. Pacote vazio ou lixo: trata como confiavel, que e o caminho
 * que nao descarta nada.
 */
export function ehConfiavel(tipoOuDataView) {
  let tipo
  if (typeof tipoOuDataView === 'number') tipo = tipoOuDataView | 0
  else {
    const dv = paraDV(tipoOuDataView)
    if (!dv || dv.byteLength < 1) return true
    tipo = dv.getUint8(0)
  }
  return !NAO_CONFIAVEIS.has(tipo)
}

/** Bytes do pacote, pro medidor de banda do F3. Lixo conta como 0. */
export function tamanhoDe(dv) {
  const d = paraDV(dv)
  return d ? d.byteLength : 0
}

/** Tipo do pacote, ou -1 se nem o primeiro byte existe. */
export function tipoDe(dv) {
  const d = paraDV(dv)
  return (d && d.byteLength >= 1) ? d.getUint8(0) : -1
}

// --- angulo -----------------------------------------------------------------
// Angulo viaja como i16 = rad * 1000. Isso da 0,057 grau de passo, muito mais
// fino do que o olho pega, e economiza 2 bytes por boneco por tique contra o
// f32. i16 vai ate +-32,767 rad, entao qualquer angulo normalizado cabe.
const TAU = Math.PI * 2

export function anguloParaI16(rad) {
  let v = Math.round((Number.isFinite(rad) ? rad : 0) * 1000)
  if (v > 32767) v = 32767
  else if (v < -32768) v = -32768
  return v
}

export function i16ParaAngulo(v) { return v / 1000 }

/**
 * Menor diferenca de a para b, sempre em (-PI, PI].
 * Existe por um motivo pratico: 6,2 rad e 0,1 rad sao vizinhos, mas a
 * subtracao crua diz que estao a 6,1 rad de distancia. Sem isto o boneco
 * remoto gira 359 graus pra virar 1.
 */
export function difAngulo(a, b) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  else if (d < -Math.PI) d += TAU
  return d
}

/** Interpolacao de angulo pelo caminho curto. Use SEMPRE esta, nunca lerp. */
export function interpAngulo(a, b, t) {
  return a + difAngulo(a, b) * t
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/** Normaliza o que o transporte entrega: DataView, ArrayBuffer ou TypedArray. */
function paraDV(x) {
  if (!x) return null
  if (x instanceof DataView) return x
  if (x instanceof ArrayBuffer) return new DataView(x)
  if (ArrayBuffer.isView(x)) return new DataView(x.buffer, x.byteOffset, x.byteLength)
  return null
}

/** Aloca o pacote ja com o byte de tipo escrito. */
function novo(tipo, bytes) {
  const buf = new ArrayBuffer(bytes)
  const dv = new DataView(buf)
  dv.setUint8(0, tipo)
  return { buf, dv }
}

/**
 * Confere tipo e tamanho minimo de uma vez. Todo leitor comeca por aqui,
 * porque pacote curto e pacote de outro tipo sao o mesmo problema: ler
 * adiante daria numero inventado.
 */
function cabe(dvBruto, tipo, minimo) {
  const dv = paraDV(dvBruto)
  if (!dv || dv.byteLength < minimo) return null
  if (dv.getUint8(0) !== tipo) return null
  return dv
}

const ENC = new TextEncoder()
// fatal:false: byte torto vira '?' em vez de excecao. Nome feio nao pode
// derrubar a conexao.
const DEC = new TextDecoder('utf-8', { fatal: false })

/** Nome em utf8, cortado em MAX_NOME_BYTES sem partir caractere no meio. */
function nomeParaBytes(nome) {
  const b = ENC.encode(String(nome == null ? '' : nome))
  if (b.length <= MAX_NOME_BYTES) return b
  // corta e recua enquanto o ultimo byte for continuacao (10xxxxxx), senao
  // o TextDecoder do outro lado veria um caractere pela metade.
  let n = MAX_NOME_BYTES
  while (n > 0 && (b[n] & 0xc0) === 0x80) n--
  return b.subarray(0, n)
}

function lerNome(dv, off, n) {
  try {
    return DEC.decode(new Uint8Array(dv.buffer, dv.byteOffset + off, n))
  } catch (_e) {
    return ''
  }
}

/**
 * Aparencia: APARENCIA_BYTES bytes crus, um por campo de CAMPOS_APARENCIA e na
 * ORDEM dela. Sao INDICES de catalogo, nunca cores — cor RGB nao cabe num byte
 * e a paleta muda com o tempo, o indice sobrevive.
 *
 * Escrever e ler pelo MESMO array e o que garante que os dois lados nunca
 * discordem de qual byte e qual campo. Quando isso era escrito na mao, campo a
 * campo, bastava um nome trocado (skin/skinIdx) pra o tom de pele viajar como
 * 0 pra sempre, sem erro nenhum no console.
 *
 * Campo ausente no objeto vira 0, e todo valor e cortado em 0..255: byte nao
 * tem sinal e 256 viraria 0 em silencio no meio do pacote.
 */
function escreverAparenciaEm(dv, off, ap) {
  const a = ap || {}
  for (let i = 0; i < CAMPOS_APARENCIA.length; i++) {
    const n = a[CAMPOS_APARENCIA[i]] | 0
    dv.setUint8(off + i, n < 0 ? 0 : (n > 255 ? 255 : n))
  }
}

function lerAparenciaEm(dv, off) {
  const saida = {}
  for (let i = 0; i < CAMPOS_APARENCIA.length; i++) {
    saida[CAMPOS_APARENCIA[i]] = dv.getUint8(off + i)
  }
  return saida
}

/**
 * A aparencia de quem ainda nao escolheu nada — os 20 campos com o default do
 * contrato. Nao e tudo zero: em blusa e calcado o indice 0 significa "nenhuma"
 * e "descalco", entao zerar tudo faria o jogador nascer sem roupa.
 */
export function aparenciaPadrao() {
  const saida = {}
  for (let i = 0; i < CAMPOS_APARENCIA.length; i++) {
    saida[CAMPOS_APARENCIA[i]] = APARENCIA_DEFAULT[i] | 0
  }
  return saida
}

// f32 nao aceita NaN vindo de conta errada: NaN atravessa a rede e vira
// boneco no infinito, que some da tela pra sempre. Troca por 0 na saida.
function f(v) { return Number.isFinite(v) ? v : 0 }

// ---------------------------------------------------------------------------
// CLIENTE -> SERVIDOR
// ---------------------------------------------------------------------------

/** 1 ENTRAR (confiavel): u16 versao, u8 nomeLen, nome utf8, aparencia 20xu8. */
export function escreverEntrar(nome, aparencia) {
  const nb = nomeParaBytes(nome)
  const { buf, dv } = novo(P.ENTRAR, 1 + 2 + 1 + nb.length + APARENCIA_BYTES)
  dv.setUint16(1, VERSAO_PROTOCOLO, true)
  dv.setUint8(3, nb.length)
  new Uint8Array(buf, 4, nb.length).set(nb)
  escreverAparenciaEm(dv, 4 + nb.length, aparencia)
  return buf
}

export function lerEntrar(dvBruto) {
  const dv = cabe(dvBruto, P.ENTRAR, 4)
  if (!dv) return null
  const versao = dv.getUint16(1, true)
  const n = dv.getUint8(3)
  if (dv.byteLength < 4 + n + APARENCIA_BYTES) return null
  return {
    versao,
    nome: lerNome(dv, 4, n),
    aparencia: lerAparenciaEm(dv, 4 + n),
  }
}

/**
 * 2 MEU_ESTADO (NAO confiavel): f32 x,y,z, i16 yaw, u8 anim, u8 flags.
 * O cliente e dono so do proprio corpo. Isto vai 15 vezes por segundo e
 * pode se perder a vontade: o proximo ja corrige.
 */
export function escreverMeuEstado(x, y, z, yaw, anim, flags) {
  const { buf, dv } = novo(P.MEU_ESTADO, 17)
  dv.setFloat32(1, f(x), true)
  dv.setFloat32(5, f(y), true)
  dv.setFloat32(9, f(z), true)
  dv.setInt16(13, anguloParaI16(yaw), true)
  dv.setUint8(15, anim | 0)
  dv.setUint8(16, flags | 0)
  return buf
}

export function lerMeuEstado(dvBruto) {
  const dv = cabe(dvBruto, P.MEU_ESTADO, 17)
  if (!dv) return null
  return {
    x: dv.getFloat32(1, true),
    y: dv.getFloat32(5, true),
    z: dv.getFloat32(9, true),
    yaw: i16ParaAngulo(dv.getInt16(13, true)),
    anim: dv.getUint8(15),
    flags: dv.getUint8(16),
  }
}

/** 3 MINHA_APARENCIA (confiavel): 20xu8, na ordem de CAMPOS_APARENCIA. */
export function escreverMinhaAparencia(aparencia) {
  const { buf, dv } = novo(P.MINHA_APARENCIA, 1 + APARENCIA_BYTES)
  escreverAparenciaEm(dv, 1, aparencia)
  return buf
}

export function lerMinhaAparencia(dvBruto) {
  const dv = cabe(dvBruto, P.MINHA_APARENCIA, 1 + APARENCIA_BYTES)
  if (!dv) return null
  return { aparencia: lerAparenciaEm(dv, 1) }
}

/** 4 FALAR (confiavel): u16 npcId. E um PEDIDO; quem decide e o servidor. */
export function escreverFalar(npcId) {
  const { buf, dv } = novo(P.FALAR, 3)
  dv.setUint16(1, npcId & 0xffff, true)
  return buf
}

export function lerFalar(dvBruto) {
  const dv = cabe(dvBruto, P.FALAR, 3)
  if (!dv) return null
  return { npcId: dv.getUint16(1, true) }
}

/** 5 SAIR_DIALOGO (confiavel): sem corpo. Sair duas vezes tem que dar em nada. */
export function escreverSairDialogo() {
  return novo(P.SAIR_DIALOGO, 1).buf
}

export function lerSairDialogo(dvBruto) {
  const dv = cabe(dvBruto, P.SAIR_DIALOGO, 1)
  if (!dv) return null
  return {}
}

/** 6 ESCOLHA (confiavel): u8 opcao. So vale de quem iniciou o dialogo. */
export function escreverEscolha(opcao) {
  const { buf, dv } = novo(P.ESCOLHA, 2)
  dv.setUint8(1, opcao | 0)
  return buf
}

export function lerEscolha(dvBruto) {
  const dv = cabe(dvBruto, P.ESCOLHA, 2)
  if (!dv) return null
  return { opcao: dv.getUint8(1) }
}

/** 7 PEGAR (confiavel): u16 objId. Pedido; o servidor diz quem pegou primeiro. */
export function escreverPegar(objId) {
  const { buf, dv } = novo(P.PEGAR, 3)
  dv.setUint16(1, objId & 0xffff, true)
  return buf
}

export function lerPegar(dvBruto) {
  const dv = cabe(dvBruto, P.PEGAR, 3)
  if (!dv) return null
  return { objId: dv.getUint16(1, true) }
}

/**
 * 8 SOLTAR (confiavel): u16 objId, f32 x,y,z.
 * O x,y,z e ONDE O CLIENTE QUERIA. O servidor decide o lugar final e avisa
 * todos — se cada maquina calculasse a queda sozinha, o objeto pararia em
 * lugar diferente em cada tela.
 */
export function escreverSoltar(objId, x, y, z) {
  const { buf, dv } = novo(P.SOLTAR, 15)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  return buf
}

export function lerSoltar(dvBruto) {
  const dv = cabe(dvBruto, P.SOLTAR, 15)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
  }
}

/**
 * 9 ARREMESSAR (confiavel): u16 objId, f32 x,y,z (origem),
 * f32 dx,dy,dz (direcao normalizada), f32 forca.
 * Viaja o EVENTO, nao o voo: cada maquina simula o resto sozinha.
 */
export function escreverArremessar(objId, x, y, z, dx, dy, dz, forca) {
  const { buf, dv } = novo(P.ARREMESSAR, 31)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  dv.setFloat32(15, f(dx), true)
  dv.setFloat32(19, f(dy), true)
  dv.setFloat32(23, f(dz), true)
  dv.setFloat32(27, f(forca), true)
  return buf
}

export function lerArremessar(dvBruto) {
  const dv = cabe(dvBruto, P.ARREMESSAR, 31)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
    dx: dv.getFloat32(15, true),
    dy: dv.getFloat32(19, true),
    dz: dv.getFloat32(23, true),
    forca: dv.getFloat32(27, true),
  }
}

/**
 * 10 OBJ_POS (NAO confiavel): u16 objId, f32 x,y,z, i16 rotY.
 * Quem segura manda a 15 Hz. So vale se o servidor tiver dito que este
 * jogador e o dono — o servidor conferindo e o que impede um cliente de
 * arrastar objeto dos outros.
 */
export function escreverObjPos(objId, x, y, z, rotY) {
  const { buf, dv } = novo(P.OBJ_POS, 17)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  dv.setInt16(15, anguloParaI16(rotY), true)
  return buf
}

export function lerObjPos(dvBruto) {
  const dv = cabe(dvBruto, P.OBJ_POS, 17)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
    rotY: i16ParaAngulo(dv.getInt16(15, true)),
  }
}

/**
 * 11 DESTRUIU (confiavel): u16 objId, f32 x,y,z (onde bateu).
 * Aviso, nao ordem: o servidor marca destruido e reenvia OBJ_DESTRUIDO pra
 * todos. Chegar duas vezes nao pode destruir duas vezes.
 */
export function escreverDestruiu(objId, x, y, z) {
  const { buf, dv } = novo(P.DESTRUIU, 15)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  return buf
}

export function lerDestruiu(dvBruto) {
  const dv = cabe(dvBruto, P.DESTRUIU, 15)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
  }
}

/**
 * 12 ABRIR_PORTAL (confiavel): f32 x,y,z, i16 yaw. 15 bytes com o tipo.
 *
 * PEDIDO, como FALAR e PEGAR: o cliente diz ONDE mirou, o servidor e quem da
 * o id, quem conta o tempo e quem avisa todo mundo. O cliente NAO desenha o
 * portal ao clicar — ele espera o PORTAL_ABERTO voltar, senao o portal
 * existiria por um instante so na tela de quem atirou.
 *
 * O yaw vai junto porque o portal fica em pe virado para quem o abriu; sem
 * ele, cada maquina escolheria uma orientacao e o mesmo portal apareceria
 * torto em cada tela.
 */
export function escreverAbrirPortal(x, y, z, yaw) {
  const { buf, dv } = novo(P.ABRIR_PORTAL, 15)
  dv.setFloat32(1, f(x), true)
  dv.setFloat32(5, f(y), true)
  dv.setFloat32(9, f(z), true)
  dv.setInt16(13, anguloParaI16(yaw), true)
  return buf
}

export function lerAbrirPortal(dvBruto) {
  const dv = cabe(dvBruto, P.ABRIR_PORTAL, 15)
  if (!dv) return null
  return {
    x: dv.getFloat32(1, true),
    y: dv.getFloat32(5, true),
    z: dv.getFloat32(9, true),
    yaw: i16ParaAngulo(dv.getInt16(13, true)),
  }
}

/**
 * 13 PEGAR_ITEM (confiavel): u8 item (1 = arma de portal).
 *
 * Nao tem resposta propria: o servidor so anota que este jogador tem o item,
 * junto com a aparencia que ele ja guarda por nome, e devolve no byte de itens
 * do BEMVINDO. Pegar duas vezes e o mesmo que pegar uma (e um bit, nao um
 * contador), que e a idempotencia que o contrato exige.
 */
export function escreverPegarItem(item) {
  const { buf, dv } = novo(P.PEGAR_ITEM, 2)
  dv.setUint8(1, item | 0)
  return buf
}

export function lerPegarItem(dvBruto) {
  const dv = cabe(dvBruto, P.PEGAR_ITEM, 2)
  if (!dv) return null
  return { item: dv.getUint8(1) }
}

/**
 * 14 ENTRAR_VEICULO (confiavel): u16 veicId.
 *
 * PEDIDO, igualzinho ao PEGAR de objeto — e nao por acaso: um veiculo e um
 * objeto que so uma pessoa pode usar por vez. O cliente NAO senta ao apertar
 * E; ele espera o VEICULO_DONO voltar. Dois apertando E no mesmo carro no
 * mesmo instante e resolvido em um lugar so: a ordem de chegada no servidor.
 */
export function escreverEntrarVeiculo(veicId) {
  const { buf, dv } = novo(P.ENTRAR_VEICULO, 3)
  dv.setUint16(1, veicId & 0xffff, true)
  return buf
}

export function lerEntrarVeiculo(dvBruto) {
  const dv = cabe(dvBruto, P.ENTRAR_VEICULO, 3)
  if (!dv) return null
  return { veicId: dv.getUint16(1, true) }
}

/**
 * 15 SAIR_VEICULO (confiavel): u16 veicId.
 *
 * Sem posicao de proposito: onde o veiculo PAROU o servidor ja sabe, porque
 * foi o proprio dono que mandou a ultima pose no VEICULO_POS. Deixar o cliente
 * dizer "sai e o carro fica ali" abriria a mesma porta que o SOLTAR fecha.
 * IDEMPOTENTE: sair de um veiculo que ja nao e meu nao faz nada.
 */
export function escreverSairVeiculo(veicId) {
  const { buf, dv } = novo(P.SAIR_VEICULO, 3)
  dv.setUint16(1, veicId & 0xffff, true)
  return buf
}

export function lerSairVeiculo(dvBruto) {
  const dv = cabe(dvBruto, P.SAIR_VEICULO, 3)
  if (!dv) return null
  return { veicId: dv.getUint16(1, true) }
}

/**
 * 16 VEICULO_POS (NAO confiavel): u16 veicId, f32 x,y,z, i16 yaw,
 * i16 rolagem. 19 bytes com o tipo.
 *
 * O UNICO pacote que anda nos dois sentidos (ver a regra 7 do cabecalho): o
 * dono manda a 15 Hz e o servidor reenvia aos outros, byte por byte igual.
 * So vale do dono — de qualquer outro o servidor ignora em silencio, como no
 * OBJ_POS: nao houve pedido, entao nao ha o que negar.
 *
 * A ROLAGEM anda junto do yaw porque e ela que faz a moto parecer moto: o
 * angulo de inclinacao na curva e metade do prazer de pilotar, e sem ele o
 * piloto remoto faria as curvas em pe, deslizando de lado. i16 = rad * 1000,
 * a mesma escala de todo angulo do protocolo. O passo (pitch) NAO viaja: ele
 * sai do proprio movimento (mergulho no freio, subida do heli) e cada maquina
 * o reconstroi do yaw e da velocidade, sem custar 2 bytes por tique.
 */
export function escreverVeiculoPos(veicId, x, y, z, yaw, rolagem) {
  const { buf, dv } = novo(P.VEICULO_POS, 19)
  dv.setUint16(1, veicId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  dv.setInt16(15, anguloParaI16(yaw), true)
  dv.setInt16(17, anguloParaI16(rolagem), true)
  return buf
}

export function lerVeiculoPos(dvBruto) {
  const dv = cabe(dvBruto, P.VEICULO_POS, 19)
  if (!dv) return null
  return {
    veicId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
    yaw: i16ParaAngulo(dv.getInt16(15, true)),
    rolagem: i16ParaAngulo(dv.getInt16(17, true)),
  }
}

/**
 * 17 CRIAR_HELI (confiavel): f32 x,y,z, i16 yaw. 15 bytes com o tipo.
 *
 * O mesmo desenho do ABRIR_PORTAL, e pela mesma razao: o cliente diz ONDE a
 * montagem terminou, e QUEM DA O ID e o servidor (4100..4999). Se cada maquina
 * inventasse o id do helicoptero que montou, dois jogadores montando ao mesmo
 * tempo criariam dois helicopteros com o mesmo numero e um apagaria o outro.
 * O cliente pode animar as pecas se encaixando enquanto o botao esta segurado
 * — isso e 100% local —, mas o helicoptero de verdade so nasce no HELI_CRIADO.
 */
export function escreverCriarHeli(x, y, z, yaw) {
  const { buf, dv } = novo(P.CRIAR_HELI, 15)
  dv.setFloat32(1, f(x), true)
  dv.setFloat32(5, f(y), true)
  dv.setFloat32(9, f(z), true)
  dv.setInt16(13, anguloParaI16(yaw), true)
  return buf
}

export function lerCriarHeli(dvBruto) {
  const dv = cabe(dvBruto, P.CRIAR_HELI, 15)
  if (!dv) return null
  return {
    x: dv.getFloat32(1, true),
    y: dv.getFloat32(5, true),
    z: dv.getFloat32(9, true),
    yaw: i16ParaAngulo(dv.getInt16(13, true)),
  }
}

/**
 * 18 ZUMBI_TIRO (confiavel): u16 npcId, u8 parte. 4 bytes com o tipo.
 *
 * PEDIDO, como FALAR e PEGAR — e o unico pacote do zumbi que nasce no cliente,
 * porque o servidor nao tem a mira de ninguem: quem tracou o raio e sabe se
 * pegou a cabeca ou o corpo foi a maquina de quem atirou.
 *
 * O QUE ELE NAO LEVA E O PONTO DA COISA: nao vai vida, nao vai dano, nao vai
 * "ele morreu". Se o cliente mandasse a vida resultante, bastaria um cliente
 * estragado dizer "vida 0" pra matar o NPC na tela de todo mundo. Aqui ele
 * diz ONDE acertou e mais nada; QUEM SUBTRAI A VIDA E O SERVIDOR (1 na cabeca
 * mata, 3 no corpo), e o resultado sai pelo caminho de sempre — o campo
 * `estado` do NPC no proximo snapshot.
 *
 * Confiavel porque e EVENTO: perder um tiro e o jogador apertar o gatilho, ver
 * o sangue sair (isso e local e sai na hora) e o zumbi nao morrer nunca.
 *
 * Chegar duas vezes tira vida duas vezes, e isso e certo: dois tiros no corpo
 * SAO dois tiros no corpo. A idempotencia que importa aqui esta no servidor,
 * que ignora tiro em NPC que ja esta morto.
 */
export function escreverZumbiTiro(npcId, parte) {
  const { buf, dv } = novo(P.ZUMBI_TIRO, 4)
  dv.setUint16(1, npcId & 0xffff, true)
  dv.setUint8(3, parte | 0)
  return buf
}

export function lerZumbiTiro(dvBruto) {
  const dv = cabe(dvBruto, P.ZUMBI_TIRO, 4)
  if (!dv) return null
  return { npcId: dv.getUint16(1, true), parte: dv.getUint8(3) }
}

// ---------------------------------------------------------------------------
// Registros compartilhados pelo SNAPSHOT e pelo BEMVINDO
// ---------------------------------------------------------------------------

// Jogador: u16 id, f32 x,y,z, i16 yaw, u8 anim, u8 flags
function escreverRegJogador(dv, off, j) {
  dv.setUint16(off + 0, j.id & 0xffff, true)
  dv.setFloat32(off + 2, f(j.x), true)
  dv.setFloat32(off + 6, f(j.y), true)
  dv.setFloat32(off + 10, f(j.z), true)
  dv.setInt16(off + 14, anguloParaI16(j.yaw), true)
  dv.setUint8(off + 16, j.anim | 0)
  dv.setUint8(off + 17, j.flags | 0)
}

function lerRegJogador(dv, off) {
  return {
    id: dv.getUint16(off + 0, true),
    x: dv.getFloat32(off + 2, true),
    y: dv.getFloat32(off + 6, true),
    z: dv.getFloat32(off + 10, true),
    yaw: i16ParaAngulo(dv.getInt16(off + 14, true)),
    anim: dv.getUint8(off + 16),
    flags: dv.getUint8(off + 17),
  }
}

// NPC: u16 id, f32 x,z, i16 yaw, u8 estado, u16 falandoCom
// Sem y de proposito: NPC nao pula nem cai, a altura dele e a do chao onde
// ele mora e ja esta em mundo.js nos dois lados.
function escreverRegNpc(dv, off, n) {
  dv.setUint16(off + 0, n.id & 0xffff, true)
  dv.setFloat32(off + 2, f(n.x), true)
  dv.setFloat32(off + 6, f(n.z), true)
  dv.setInt16(off + 10, anguloParaI16(n.yaw), true)
  dv.setUint8(off + 12, n.estado | 0)
  dv.setUint16(off + 13, n.falandoCom & 0xffff, true)
}

function lerRegNpc(dv, off) {
  return {
    id: dv.getUint16(off + 0, true),
    x: dv.getFloat32(off + 2, true),
    z: dv.getFloat32(off + 6, true),
    yaw: i16ParaAngulo(dv.getInt16(off + 10, true)),
    estado: dv.getUint8(off + 12),
    falandoCom: dv.getUint16(off + 13, true),
  }
}

// Objeto: u16 id, f32 x,y,z, i16 rotY, u16 dono, u8 estado
function escreverRegObj(dv, off, o) {
  dv.setUint16(off + 0, o.id & 0xffff, true)
  dv.setFloat32(off + 2, f(o.x), true)
  dv.setFloat32(off + 6, f(o.y), true)
  dv.setFloat32(off + 10, f(o.z), true)
  dv.setInt16(off + 14, anguloParaI16(o.rotY), true)
  dv.setUint16(off + 16, o.dono & 0xffff, true)
  dv.setUint8(off + 18, o.estado | 0)
}

function lerRegObj(dv, off) {
  return {
    id: dv.getUint16(off + 0, true),
    x: dv.getFloat32(off + 2, true),
    y: dv.getFloat32(off + 6, true),
    z: dv.getFloat32(off + 10, true),
    rotY: i16ParaAngulo(dv.getInt16(off + 14, true)),
    dono: dv.getUint16(off + 16, true),
    estado: dv.getUint8(off + 18),
  }
}

/** Corta a lista no teto do u8. Melhor mandar menos do que mandar torto. */
function limitar(lista) {
  const l = Array.isArray(lista) ? lista : []
  return l.length > MAX_LISTA ? l.slice(0, MAX_LISTA) : l
}

// ---------------------------------------------------------------------------
// SERVIDOR -> CLIENTE
// ---------------------------------------------------------------------------

/**
 * 128 BEMVINDO (confiavel): u16 meuId, u16 versao, u8 tickHz,
 * aparencia salva (20xu8), u8 itens, u8 nNpc + NPCs, u8 nObj + objetos.
 *
 * Vai o mundo INTEIRO (todos os NPCs e todos os objetos, inclusive os em
 * repouso), porque o SNAPSHOT so manda o que se mexe. Sem este pacote o
 * cliente nao teria o estado inicial dos objetos parados.
 * A aparencia vem do servidor porque ele guarda a aparencia por nome e
 * devolve quando o jogador entra de novo.
 *
 * O byte de ITENS anda pelo mesmo motivo e no mesmo lugar da aparencia: o
 * servidor guarda por nome quem ja pegou a arma de portal, e quem recarrega a
 * pagina volta com ela na mao em vez de ter que atravessar a cidade de novo.
 * Bits (ITENS_*), nao contador — ver o comentario dos itens la em cima.
 *
 * Os PORTAIS abertos NAO vao aqui: eles chegam como um PORTAL_ABERTO cada,
 * logo depois deste pacote. Assim o caminho de "portal apareceu" e UM SO, e
 * quem entra atrasado passa exatamente pelo mesmo codigo de quem estava
 * online quando o portal abriu.
 */
export function escreverBemvindo(meuId, aparencia, npcs, objs, itens) {
  const ln = limitar(npcs)
  const lo = limitar(objs)
  const tam = BEMVINDO_CABECA + 1 + ln.length * REG_NPC + 1 + lo.length * REG_OBJ
  const { buf, dv } = novo(P.BEMVINDO, tam)
  dv.setUint16(1, meuId & 0xffff, true)
  dv.setUint16(3, VERSAO_PROTOCOLO, true)
  dv.setUint8(5, TICK_HZ)
  escreverAparenciaEm(dv, 6, aparencia)
  dv.setUint8(6 + APARENCIA_BYTES, itens | 0)
  let off = BEMVINDO_CABECA
  dv.setUint8(off, ln.length); off += 1
  for (const n of ln) { escreverRegNpc(dv, off, n); off += REG_NPC }
  dv.setUint8(off, lo.length); off += 1
  for (const o of lo) { escreverRegObj(dv, off, o); off += REG_OBJ }
  return buf
}

export function lerBemvindo(dvBruto) {
  const dv = cabe(dvBruto, P.BEMVINDO, BEMVINDO_CABECA + 1)
  if (!dv) return null
  const meuId = dv.getUint16(1, true)
  const versao = dv.getUint16(3, true)
  const tickHz = dv.getUint8(5)
  const aparencia = lerAparenciaEm(dv, 6)
  const itens = dv.getUint8(6 + APARENCIA_BYTES)
  let off = BEMVINDO_CABECA
  const nNpc = dv.getUint8(off); off += 1
  if (dv.byteLength < off + nNpc * REG_NPC + 1) return null
  const npcs = []
  for (let i = 0; i < nNpc; i++) { npcs.push(lerRegNpc(dv, off)); off += REG_NPC }
  const nObj = dv.getUint8(off); off += 1
  if (dv.byteLength < off + nObj * REG_OBJ) return null
  const objs = []
  for (let i = 0; i < nObj; i++) { objs.push(lerRegObj(dv, off)); off += REG_OBJ }
  return { meuId, versao, tickHz, aparencia, itens, npcs, objs }
}

/** 129 RECUSA (confiavel): u8 motivo (1 versao, 2 cheio). */
export function escreverRecusa(motivo) {
  const { buf, dv } = novo(P.RECUSA, 2)
  dv.setUint8(1, motivo | 0)
  return buf
}

export function lerRecusa(dvBruto) {
  const dv = cabe(dvBruto, P.RECUSA, 2)
  if (!dv) return null
  return { motivo: dv.getUint8(1) }
}

/**
 * 130 SNAPSHOT (NAO confiavel): u32 tick, u8 nJog + jogadores,
 * u8 nNpc + NPCs, u8 nObj + objetos QUE SE MEXEM.
 *
 * O tick e u32 e serve pra uma coisa so: quem recebe descarta snapshot com
 * tick menor ou igual ao ultimo aplicado. E isso que segura pacote atrasado
 * e pacote duplicado sem nenhuma outra maquinaria.
 *
 * Objeto em repouso na origem NAO entra: o cliente ja sabe onde ele esta
 * desde o BEMVINDO, e mandar 28 objetos parados 15 vezes por segundo seria
 * o maior gasto de banda do jogo, a troco de nada.
 */
export function escreverSnapshot(tick, jogadores, npcs, objetos) {
  const lj = limitar(jogadores)
  const ln = limitar(npcs)
  const lo = limitar(objetos)
  const tam = 1 + 4
    + 1 + lj.length * REG_JOGADOR
    + 1 + ln.length * REG_NPC
    + 1 + lo.length * REG_OBJ
  const { buf, dv } = novo(P.SNAPSHOT, tam)
  dv.setUint32(1, tick >>> 0, true)
  let off = 5
  dv.setUint8(off, lj.length); off += 1
  for (const j of lj) { escreverRegJogador(dv, off, j); off += REG_JOGADOR }
  dv.setUint8(off, ln.length); off += 1
  for (const n of ln) { escreverRegNpc(dv, off, n); off += REG_NPC }
  dv.setUint8(off, lo.length); off += 1
  for (const o of lo) { escreverRegObj(dv, off, o); off += REG_OBJ }
  return buf
}

export function lerSnapshot(dvBruto) {
  const dv = cabe(dvBruto, P.SNAPSHOT, 8)
  if (!dv) return null
  const tick = dv.getUint32(1, true)
  let off = 5
  const nJog = dv.getUint8(off); off += 1
  if (dv.byteLength < off + nJog * REG_JOGADOR + 1) return null
  const jogadores = []
  for (let i = 0; i < nJog; i++) { jogadores.push(lerRegJogador(dv, off)); off += REG_JOGADOR }
  const nNpc = dv.getUint8(off); off += 1
  if (dv.byteLength < off + nNpc * REG_NPC + 1) return null
  const npcs = []
  for (let i = 0; i < nNpc; i++) { npcs.push(lerRegNpc(dv, off)); off += REG_NPC }
  const nObj = dv.getUint8(off); off += 1
  if (dv.byteLength < off + nObj * REG_OBJ) return null
  const objetos = []
  for (let i = 0; i < nObj; i++) { objetos.push(lerRegObj(dv, off)); off += REG_OBJ }
  return { tick, jogadores, npcs, objetos }
}

/**
 * 131 ENTROU (confiavel): u16 id, u8 nomeLen, nome utf8, aparencia 20xu8.
 * O servidor manda um destes por jogador ja presente logo depois do
 * BEMVINDO, e depois um a cada novo que chega. Receber duas vezes o mesmo
 * id so tem que sobrescrever.
 */
export function escreverEntrou(id, nome, aparencia) {
  const nb = nomeParaBytes(nome)
  const { buf, dv } = novo(P.ENTROU, 1 + 2 + 1 + nb.length + APARENCIA_BYTES)
  dv.setUint16(1, id & 0xffff, true)
  dv.setUint8(3, nb.length)
  new Uint8Array(buf, 4, nb.length).set(nb)
  escreverAparenciaEm(dv, 4 + nb.length, aparencia)
  return buf
}

export function lerEntrou(dvBruto) {
  const dv = cabe(dvBruto, P.ENTROU, 4)
  if (!dv) return null
  const id = dv.getUint16(1, true)
  const n = dv.getUint8(3)
  if (dv.byteLength < 4 + n + APARENCIA_BYTES) return null
  return { id, nome: lerNome(dv, 4, n), aparencia: lerAparenciaEm(dv, 4 + n) }
}

/**
 * 19 REINICIAR (confiavel): so o byte do tipo.
 *
 * PEDIDO, como todo o resto: o cliente nao reinicia nada por conta propria.
 * Quem e dono do mundo e o servidor, e reiniciar e a operacao mais "dona do
 * mundo" que existe -- se o cliente apagasse o zumbi sozinho, o proximo
 * SNAPSHOT o traria de volta meio segundo depois, e o jogador acharia que a
 * tecla nao funciona.
 *
 * Sem corpo de proposito: nao ha o que parametrizar. "Volta tudo ao inicio" e
 * uma coisa so, e um dia em que fizer sentido reiniciar SO os veiculos e um
 * dia em que este pacote ganha um byte de bits, sem quebrar o formato de hoje.
 */
export function escreverReiniciar() {
  return novo(P.REINICIAR, 1).buf
}

export function lerReiniciar(dvBruto) {
  const dv = cabe(dvBruto, P.REINICIAR, 1)
  if (!dv) return null
  return {}
}

/**
 * 143 MUNDO_REINICIADO (confiavel): u16 quem.
 *
 * 'quem' e o id de quem apertou a tecla -- e ninguem em particular quando vale
 * 0 (reinicio feito pelo proprio servidor). Ele existe por uma razao so, e ela
 * e de convivencia: reiniciar afeta TODO MUNDO na sala, e um mundo que volta
 * ao comeco sozinho, sem nome e sem aviso, parece bug. Com o id, cada cliente
 * mostra "Fulano reiniciou o mundo" antes de recomecar.
 */
export function escreverMundoReiniciado(quem) {
  const { buf, dv } = novo(P.MUNDO_REINICIADO, 3)
  dv.setUint16(1, (quem | 0) & 0xffff, true)
  return buf
}

export function lerMundoReiniciado(dvBruto) {
  const dv = cabe(dvBruto, P.MUNDO_REINICIADO, 3)
  if (!dv) return null
  return { quem: dv.getUint16(1, true) }
}


/**
 * 20 PRONTO (confiavel): u8 pronto (1 sim, 0 nao).
 *
 * A tela de criacao de personagem termina num botao. Enquanto nem todo mundo
 * apertou, ninguem entra: o servidor conta os prontos e so vira a fase quando
 * o contador fecha. Da pra DESMARCAR (mandar 0) — alguem que apertou sem
 * querer nao pode segurar a sala de refem por ter mudado de ideia.
 */
export function escreverPronto(pronto) {
  const { buf, dv } = novo(P.PRONTO, 2)
  dv.setUint8(1, pronto ? 1 : 0)
  return buf
}

export function lerPronto(dvBruto) {
  const dv = cabe(dvBruto, P.PRONTO, 2)
  if (!dv) return null
  return { pronto: dv.getUint8(1) === 1 }
}

/**
 * 21 COMECAR (confiavel): so o byte do tipo.
 *
 * PEDIDO do ANFITRIAO pra sala sair do lobby e ir pra criacao de personagem.
 * Sem corpo porque nao ha o que parametrizar, e sem "quem" porque quem pediu
 * ja e conhecido: o pacote chegou pela conexao dele. O servidor confere se
 * quem pediu e mesmo o anfitriao — pedir daqui nao e poder.
 */
export function escreverComecar() {
  return novo(P.COMECAR, 1).buf
}

export function lerComecar(dvBruto) {
  const dv = cabe(dvBruto, P.COMECAR, 1)
  if (!dv) return null
  return {}
}

/**
 * 22 MEU_NOME (confiavel): u8 len, nome utf8.
 *
 * O nome deixou de ser so o que estava no localStorage quando a pagina abriu:
 * agora o jogador o digita na tela de criacao de personagem. Este pacote existe
 * porque o ENTRAR ja passou quando isso acontece — e reconectar so pra trocar
 * de nome derrubaria o jogador da sala em que ele acabou de entrar.
 *
 * O servidor RESPONDE com um ENTROU do mesmo id: a lista de nomes de todo mundo
 * ja e mantida por esse caminho, entao o nome novo chega em todas as telas sem
 * um segundo mecanismo.
 */
export function escreverMeuNome(nome) {
  const nb = nomeParaBytes(nome)
  const { buf, dv } = novo(P.MEU_NOME, 2 + nb.length)
  dv.setUint8(1, nb.length)
  new Uint8Array(buf, 2, nb.length).set(nb)
  return buf
}

export function lerMeuNome(dvBruto) {
  const dv = cabe(dvBruto, P.MEU_NOME, 2)
  if (!dv) return null
  const n = dv.getUint8(1)
  if (dv.byteLength < 2 + n) return null
  return { nome: lerNome(dv, 2, n) }
}

/**
 * 144 SALA_ESTADO (confiavel): u8 fase, u16 anfitriao, u8 n, n x (u16 id, u8 pronto).
 *
 * A FOTO INTEIRA da sala, e nao um delta. Sao no maximo 4 jogadores: 4 + 3*4 =
 * 16 bytes. Mandar a lista completa a cada mudanca custa menos do que manter
 * dois lados concordando sobre uma sequencia de "fulano ficou pronto" —
 * principalmente porque este pacote e raro (entra alguem, alguem aperta pronto,
 * a fase vira) e um pacote perdido aqui deixaria a tela de todo mundo mentindo
 * sobre quem ja esta pronto.
 *
 * fase: 0 lobby (esperando gente), 1 criando (personagem), 2 jogando.
 * anfitriao: o id de quem manda no lobby. 0 = ninguem (sala vazia).
 */
export const FASE_LOBBY = 0
export const FASE_CRIANDO = 1
export const FASE_JOGANDO = 2

export function escreverSalaEstado(fase, anfitriao, lista) {
  const n = Math.min(255, (lista && lista.length) || 0)
  // Mapa dos bytes, e ele nao e por acaso: 0 tipo, 1 fase, 2-3 anfitriao,
  // 4 quantos, e dai em diante 3 bytes por jogador. O anfitriao (u16) tem que
  // ficar num par de bytes que ninguem mais toca — a primeira versao punha o
  // 'quantos' no byte 3, que e justamente o byte ALTO do anfitriao, e o id 7
  // com dois jogadores na sala chegava do outro lado como 519.
  const { buf, dv } = novo(P.SALA_ESTADO, 5 + n * 3)
  dv.setUint8(1, fase | 0)
  dv.setUint16(2, (anfitriao | 0) & 0xffff, true)
  dv.setUint8(4, n)
  let o = 5
  for (let i = 0; i < n; i++) {
    dv.setUint16(o, (lista[i].id | 0) & 0xffff, true)
    dv.setUint8(o + 2, lista[i].pronto ? 1 : 0)
    o += 3
  }
  return buf
}

export function lerSalaEstado(dvBruto) {
  const dv = cabe(dvBruto, P.SALA_ESTADO, 5)
  if (!dv) return null
  const fase = dv.getUint8(1)
  const anfitriao = dv.getUint16(2, true)
  const n = dv.getUint8(4)
  if (dv.byteLength < 5 + n * 3) return null
  const jogadores = []
  let o = 5
  for (let i = 0; i < n; i++) {
    jogadores.push({ id: dv.getUint16(o, true), pronto: dv.getUint8(o + 2) === 1 })
    o += 3
  }
  return { fase, anfitriao, jogadores }
}

/** 132 SAIU (confiavel): u16 id. Sair de quem ja saiu nao faz nada. */
export function escreverSaiu(id) {
  const { buf, dv } = novo(P.SAIU, 3)
  dv.setUint16(1, id & 0xffff, true)
  return buf
}

export function lerSaiu(dvBruto) {
  const dv = cabe(dvBruto, P.SAIU, 3)
  if (!dv) return null
  return { id: dv.getUint16(1, true) }
}

/** 133 APARENCIA (confiavel): u16 id, 20xu8. Visual novo aparece na hora na
 *  tela de todo mundo — e o unico caminho por onde a troca do barbeiro e do
 *  provador chega nos outros jogadores. */
export function escreverAparencia(id, aparencia) {
  const { buf, dv } = novo(P.APARENCIA, 3 + APARENCIA_BYTES)
  dv.setUint16(1, id & 0xffff, true)
  escreverAparenciaEm(dv, 3, aparencia)
  return buf
}

export function lerAparencia(dvBruto) {
  const dv = cabe(dvBruto, P.APARENCIA, 3 + APARENCIA_BYTES)
  if (!dv) return null
  return { id: dv.getUint16(1, true), aparencia: lerAparenciaEm(dv, 3) }
}

/**
 * 134 DIALOGO (confiavel): u16 npcId, u16 jogadorId, u8 linhaIdx, u8 nOpcoes.
 * Viaja o INDICE da linha, nao o texto: as falas ja estao em mundo.js nos
 * dois lados. Quem estiver a menos de 12 m ve o balao; so o jogadorId tem
 * os botoes.
 */
export function escreverDialogo(npcId, jogadorId, linhaIdx, nOpcoes) {
  const { buf, dv } = novo(P.DIALOGO, 7)
  dv.setUint16(1, npcId & 0xffff, true)
  dv.setUint16(3, jogadorId & 0xffff, true)
  dv.setUint8(5, linhaIdx | 0)
  dv.setUint8(6, nOpcoes | 0)
  return buf
}

export function lerDialogo(dvBruto) {
  const dv = cabe(dvBruto, P.DIALOGO, 7)
  if (!dv) return null
  return {
    npcId: dv.getUint16(1, true),
    jogadorId: dv.getUint16(3, true),
    linhaIdx: dv.getUint8(5),
    nOpcoes: dv.getUint8(6),
  }
}

/** 135 DIALOGO_FIM (confiavel): u16 npcId. Libera o NPC na tela de todos. */
export function escreverDialogoFim(npcId) {
  const { buf, dv } = novo(P.DIALOGO_FIM, 3)
  dv.setUint16(1, npcId & 0xffff, true)
  return buf
}

export function lerDialogoFim(dvBruto) {
  const dv = cabe(dvBruto, P.DIALOGO_FIM, 3)
  if (!dv) return null
  return { npcId: dv.getUint16(1, true) }
}

/**
 * 136 OBJ_DONO (confiavel): u16 objId, u16 donoId (0 = livre),
 * f32 x,y,z, i16 rotY, u8 estado. 20 bytes com o tipo.
 *
 * A posicao vai JUNTO com o dono de proposito, e nao num pacote separado: a
 * hora em que o dono muda e exatamente a hora em que o SERVIDOR decidiu onde
 * o objeto ficou (soltar, arremessar, dono caiu a conexao). O contrato diz
 * que quem decide a queda e o servidor; se a posicao viesse depois, existiria
 * uma janela em que todo mundo ja soltou o objeto e ninguem sabe onde ele
 * caiu — e cada maquina inventaria a sua.
 */
export function escreverObjDono(objId, donoId, x, y, z, rotY, estado) {
  const { buf, dv } = novo(P.OBJ_DONO, 20)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setUint16(3, donoId & 0xffff, true)
  dv.setFloat32(5, f(x), true)
  dv.setFloat32(9, f(y), true)
  dv.setFloat32(13, f(z), true)
  dv.setInt16(17, anguloParaI16(rotY), true)
  dv.setUint8(19, estado | 0)
  return buf
}

export function lerObjDono(dvBruto) {
  const dv = cabe(dvBruto, P.OBJ_DONO, 20)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    donoId: dv.getUint16(3, true),
    x: dv.getFloat32(5, true),
    y: dv.getFloat32(9, true),
    z: dv.getFloat32(13, true),
    rotY: i16ParaAngulo(dv.getInt16(17, true)),
    estado: dv.getUint8(19),
  }
}

/**
 * 137 OBJ_DESTRUIDO (confiavel): u16 objId, f32 x,y,z.
 * O caso de idempotencia mais importante do jogo: se o objeto ja esta
 * destruido, quem recebe ISTO DE NOVO nao pode tocar o efeito outra vez.
 * Quem trata confere o estado antes de explodir.
 */
export function escreverObjDestruido(objId, x, y, z) {
  const { buf, dv } = novo(P.OBJ_DESTRUIDO, 15)
  dv.setUint16(1, objId & 0xffff, true)
  dv.setFloat32(3, f(x), true)
  dv.setFloat32(7, f(y), true)
  dv.setFloat32(11, f(z), true)
  return buf
}

export function lerObjDestruido(dvBruto) {
  const dv = cabe(dvBruto, P.OBJ_DESTRUIDO, 15)
  if (!dv) return null
  return {
    objId: dv.getUint16(1, true),
    x: dv.getFloat32(3, true),
    y: dv.getFloat32(7, true),
    z: dv.getFloat32(11, true),
  }
}

/** 138 NEGADO (confiavel): u8 oque (1 npc ocupado, 2 objeto ocupado), u16 id. */
export function escreverNegado(oque, id) {
  const { buf, dv } = novo(P.NEGADO, 4)
  dv.setUint8(1, oque | 0)
  dv.setUint16(2, id & 0xffff, true)
  return buf
}

export function lerNegado(dvBruto) {
  const dv = cabe(dvBruto, P.NEGADO, 4)
  if (!dv) return null
  return { oque: dv.getUint8(1), id: dv.getUint16(2, true) }
}

/**
 * 139 PORTAL_ABERTO (confiavel): u16 portalId, u16 dono, f32 x,y,z, i16 yaw.
 * 19 bytes com o tipo.
 *
 * O portalId vem do SERVIDOR, na faixa 3000..3999, e e a UNICA coisa que
 * identifica aquele portal — nunca a posicao, nunca o dono. Dois portais podem
 * nascer no mesmo lugar e o dono pode trocar de portal; o id nao.
 *
 * O dono anda junto porque cada jogador so tem UM portal: quem recebe isto ja
 * pode apagar da tela qualquer portal antigo daquele dono, mesmo que o
 * PORTAL_FECHADO do velho tenha se perdido no caminho. E o mesmo motivo do
 * OBJ_DONO levar a posicao: a mensagem chega inteira ou nao chega.
 *
 * O redemoinho, a luz verde e o estalo de abertura sao 100% LOCAIS. Pela rede
 * viaja so o evento (quem, qual id, onde, virado para onde).
 */
export function escreverPortalAberto(portalId, dono, x, y, z, yaw) {
  const { buf, dv } = novo(P.PORTAL_ABERTO, 19)
  dv.setUint16(1, portalId & 0xffff, true)
  dv.setUint16(3, dono & 0xffff, true)
  dv.setFloat32(5, f(x), true)
  dv.setFloat32(9, f(y), true)
  dv.setFloat32(13, f(z), true)
  dv.setInt16(17, anguloParaI16(yaw), true)
  return buf
}

export function lerPortalAberto(dvBruto) {
  const dv = cabe(dvBruto, P.PORTAL_ABERTO, 19)
  if (!dv) return null
  return {
    portalId: dv.getUint16(1, true),
    dono: dv.getUint16(3, true),
    x: dv.getFloat32(5, true),
    y: dv.getFloat32(9, true),
    z: dv.getFloat32(13, true),
    yaw: i16ParaAngulo(dv.getInt16(17, true)),
  }
}

/**
 * 140 PORTAL_FECHADO (confiavel): u16 portalId.
 *
 * IDEMPOTENTE por obrigacao: o mesmo portal pode ser fechado por tres motivos
 * quase juntos (o tempo acabou, o dono abriu outro, o dono caiu a conexao), e
 * o pacote ainda pode duplicar. Quem trata procura o id, e se nao achar NAO
 * FAZ NADA — sem tocar som, sem clarao, sem erro no console. Fechar um portal
 * que ja fechou nao e um caso de excecao, e o caso comum.
 */
export function escreverPortalFechado(portalId) {
  const { buf, dv } = novo(P.PORTAL_FECHADO, 3)
  dv.setUint16(1, portalId & 0xffff, true)
  return buf
}

export function lerPortalFechado(dvBruto) {
  const dv = cabe(dvBruto, P.PORTAL_FECHADO, 3)
  if (!dv) return null
  return { portalId: dv.getUint16(1, true) }
}

/**
 * 141 VEICULO_DONO (confiavel): u16 veicId, u16 donoId (0 = livre),
 * f32 x,y,z, i16 yaw. 19 bytes com o tipo.
 *
 * O irmao do OBJ_DONO, e leva a posicao pelo mesmo motivo que ele: a hora em
 * que o motorista muda e exatamente a hora em que o veiculo PAROU onde parou.
 * Se a pose viesse depois (ou nao viesse), existiria uma janela em que todo
 * mundo ja viu o carro ficar sem dono e ninguem sabe onde ele ficou — e cada
 * maquina desenharia o carro no ultimo lugar que ela lembra, que e diferente
 * em cada tela porque cada uma perdeu um VEICULO_POS diferente.
 *
 * Sem rolagem aqui de proposito: veiculo parado e veiculo em pe. Mandar a
 * inclinacao da ultima curva faria a moto ficar deitada no chao, sozinha.
 *
 * IDEMPOTENTE: receber duas vezes o mesmo dono so reafirma o que ja vale.
 */
export function escreverVeiculoDono(veicId, donoId, x, y, z, yaw) {
  const { buf, dv } = novo(P.VEICULO_DONO, 19)
  dv.setUint16(1, veicId & 0xffff, true)
  dv.setUint16(3, donoId & 0xffff, true)
  dv.setFloat32(5, f(x), true)
  dv.setFloat32(9, f(y), true)
  dv.setFloat32(13, f(z), true)
  dv.setInt16(17, anguloParaI16(yaw), true)
  return buf
}

export function lerVeiculoDono(dvBruto) {
  const dv = cabe(dvBruto, P.VEICULO_DONO, 19)
  if (!dv) return null
  return {
    veicId: dv.getUint16(1, true),
    donoId: dv.getUint16(3, true),
    x: dv.getFloat32(5, true),
    y: dv.getFloat32(9, true),
    z: dv.getFloat32(13, true),
    yaw: i16ParaAngulo(dv.getInt16(17, true)),
  }
}

/**
 * 142 HELI_CRIADO (confiavel): u16 veicId (4100..4999), u16 dono,
 * f32 x,y,z, i16 yaw. 19 bytes com o tipo.
 *
 * "dono" aqui e QUEM MONTOU, nao quem esta pilotando. Os dois nunca se
 * confundem porque quem pilota e SEMPRE o VEICULO_DONO e mais ninguem: o
 * helicoptero nasce LIVRE, pronto para entrar com E — inclusive para quem
 * chegou correndo enquanto o outro montava. O campo existe para a maquina de
 * cada um saber de quem foi o clarao verde, que e efeito local.
 *
 * Quem entra atrasado recebe um destes por helicoptero vivo logo depois do
 * BEMVINDO (e, se ele estiver ocupado, o VEICULO_DONO logo em seguida) — o
 * mesmo caminho do PORTAL_ABERTO, entao o cliente tem UM codigo so para
 * "apareceu um helicoptero".
 */
export function escreverHeliCriado(veicId, dono, x, y, z, yaw) {
  const { buf, dv } = novo(P.HELI_CRIADO, 19)
  dv.setUint16(1, veicId & 0xffff, true)
  dv.setUint16(3, dono & 0xffff, true)
  dv.setFloat32(5, f(x), true)
  dv.setFloat32(9, f(y), true)
  dv.setFloat32(13, f(z), true)
  dv.setInt16(17, anguloParaI16(yaw), true)
  return buf
}

export function lerHeliCriado(dvBruto) {
  const dv = cabe(dvBruto, P.HELI_CRIADO, 19)
  if (!dv) return null
  return {
    veicId: dv.getUint16(1, true),
    dono: dv.getUint16(3, true),
    x: dv.getFloat32(5, true),
    y: dv.getFloat32(9, true),
    z: dv.getFloat32(13, true),
    yaw: i16ParaAngulo(dv.getInt16(17, true)),
  }
}
