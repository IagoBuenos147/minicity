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
// ---------------------------------------------------------------------------

import { VERSAO_PROTOCOLO, TICK_HZ } from './mundo.js'

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

// MEU_ESTADO.anim / jogador no SNAPSHOT
export const ANIM = { PARADO: 0, ANDANDO: 1, CORRENDO: 2, NO_AR: 3, SENTADO: 4 }

// MEU_ESTADO.flags — bits, nao valores. Cabe muita coisa em 1 byte e mudar
// um bit novo no futuro nao muda o tamanho do pacote de 15 Hz.
export const FLAG_SENTADO = 1 << 0
export const FLAG_ANEL = 1 << 1

// NPC no SNAPSHOT
export const EST_NPC = { PARADO: 0, TRABALHANDO: 1, SENTADO: 2, CORTANDO: 3, CONVERSANDO: 4 }

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

// --- tamanhos fixos ---------------------------------------------------------
export const APARENCIA_BYTES = 6      // hair, eyes, brows, mouth, hairColor, skin
const REG_JOGADOR = 18                // u16 id, f32 x,y,z, i16 yaw, u8 anim, u8 flags
const REG_NPC = 15                    // u16 id, f32 x,z, i16 yaw, u8 estado, u16 falandoCom
const REG_OBJ = 19                    // u16 id, f32 x,y,z, i16 rotY, u16 dono, u8 estado

// Nome cabe em u8 de tamanho; 32 bytes ja e mais do que qualquer nome de tela
// precisa e mantem o ENTROU pequeno o bastante pra nunca fragmentar.
export const MAX_NOME_BYTES = 32

// Contagem de lista viaja em u8: 255 e o teto fisico das tres listas do
// SNAPSHOT. O mundo real tem 20 jogadores, 3 NPCs e 28 objetos.
const MAX_LISTA = 255

// --- canal: o que pode se perder e o que nao pode ---------------------------
// So tres mensagens sao "o mais novo manda, perdeu tudo bem": as de fluxo
// continuo a 15 Hz. Todo o resto e EVENTO — perder um evento deixa o mundo
// errado pra sempre (objeto que fica preso, dialogo que nunca fecha), entao
// vai no canal confiavel.
const NAO_CONFIAVEIS = new Set([P.MEU_ESTADO, P.OBJ_POS, P.SNAPSHOT])

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
 * Aparencia sao 6 bytes crus: hair, eyes, brows, mouth, hairColor, skin.
 * Sao INDICES de catalogo, nunca cores. Cor de cabelo e tom de pele mudam de
 * paleta com o tempo; indice sobrevive a isso e cabe em 1 byte.
 *
 * O 6o campo se chama "skin" e nao "skinIdx" porque esse e o nome que
 * src/player/appearance.js usa. Dois nomes para o mesmo byte fazia o tom de
 * pele ser escrito como 0 e nunca chegar do outro lado, sem erro nenhum.
 */
function escreverAparenciaEm(dv, off, ap) {
  const a = ap || {}
  dv.setUint8(off + 0, a.hair | 0)
  dv.setUint8(off + 1, a.eyes | 0)
  dv.setUint8(off + 2, a.brows | 0)
  dv.setUint8(off + 3, a.mouth | 0)
  dv.setUint8(off + 4, a.hairColor | 0)
  dv.setUint8(off + 5, a.skin | 0)
}

function lerAparenciaEm(dv, off) {
  return {
    hair: dv.getUint8(off + 0),
    eyes: dv.getUint8(off + 1),
    brows: dv.getUint8(off + 2),
    mouth: dv.getUint8(off + 3),
    hairColor: dv.getUint8(off + 4),
    skin: dv.getUint8(off + 5),
  }
}

/** Aparencia zerada, pro caso de nao conhecer o jogador ainda. */
export function aparenciaPadrao() {
  return { hair: 0, eyes: 0, brows: 0, mouth: 0, hairColor: 0, skin: 0 }
}

// f32 nao aceita NaN vindo de conta errada: NaN atravessa a rede e vira
// boneco no infinito, que some da tela pra sempre. Troca por 0 na saida.
function f(v) { return Number.isFinite(v) ? v : 0 }

// ---------------------------------------------------------------------------
// CLIENTE -> SERVIDOR
// ---------------------------------------------------------------------------

/** 1 ENTRAR (confiavel): u16 versao, u8 nomeLen, nome utf8, aparencia 6xu8. */
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

/** 3 MINHA_APARENCIA (confiavel): 6xu8. */
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
 * aparencia salva (6xu8), u8 itens, u8 nNpc + NPCs, u8 nObj + objetos.
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
  const tam = 13 + 1 + ln.length * REG_NPC + 1 + lo.length * REG_OBJ
  const { buf, dv } = novo(P.BEMVINDO, tam)
  dv.setUint16(1, meuId & 0xffff, true)
  dv.setUint16(3, VERSAO_PROTOCOLO, true)
  dv.setUint8(5, TICK_HZ)
  escreverAparenciaEm(dv, 6, aparencia)
  dv.setUint8(12, itens | 0)
  let off = 13
  dv.setUint8(off, ln.length); off += 1
  for (const n of ln) { escreverRegNpc(dv, off, n); off += REG_NPC }
  dv.setUint8(off, lo.length); off += 1
  for (const o of lo) { escreverRegObj(dv, off, o); off += REG_OBJ }
  return buf
}

export function lerBemvindo(dvBruto) {
  const dv = cabe(dvBruto, P.BEMVINDO, 14)
  if (!dv) return null
  const meuId = dv.getUint16(1, true)
  const versao = dv.getUint16(3, true)
  const tickHz = dv.getUint8(5)
  const aparencia = lerAparenciaEm(dv, 6)
  const itens = dv.getUint8(12)
  let off = 13
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
 * 131 ENTROU (confiavel): u16 id, u8 nomeLen, nome utf8, aparencia 6xu8.
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

/** 133 APARENCIA (confiavel): u16 id, 6xu8. Cabelo novo aparece na hora. */
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
