// ---------------------------------------------------------------------------
// Ida e volta da APARENCIA de 20 campos, nos cinco pacotes que a carregam, mais
// o caminho inteiro dentro da sala.
//
//   node tools/teste-aparencia.mjs
//
// Por que este teste existe: a aparencia e o unico dado do jogo em que um erro
// NAO aparece como erro. Um campo trocado de posicao nao lanca excecao — ele
// entrega um numero valido no campo errado, e o jogador do outro lado ganha um
// chapeu no lugar do calcado, calado. E no BEMVINDO a aparencia fica NO MEIO do
// pacote: um byte a mais ou a menos ali desloca as listas de NPC e objeto
// inteiras, e o mundo e montado torto sem nada no console.
//
// Sai com codigo 1 se algum caso falhar.
// ---------------------------------------------------------------------------

import * as Proto from '../src/comum/protocolo.js'
import { criarSala } from '../servidor/sala.js'
import { normalizarAparencia } from '../src/rede/cliente-rede.js'
import { VERSAO_PROTOCOLO } from '../src/comum/mundo.js'

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const dv = (buf) => new DataView(buf)
const C = Proto.CAMPOS_APARENCIA

/** Compara campo a campo e diz QUAL divergiu — "false" nao ajuda a consertar. */
function difere(a, b) {
  if (!a || !b) return 'um dos lados e nulo'
  for (const k of C) if ((a[k] | 0) !== (b[k] | 0)) return k + ': ' + a[k] + ' != ' + b[k]
  return ''
}

/* Cobaia com um valor DIFERENTE em cada campo. E de proposito que nenhum se
   repete: com dois campos iguais, trocar a ordem dos dois passaria no teste. */
const AMOSTRA = {
  cabeca: 7, olhos: 4, pupila: 3, nariz: 2, boca: 1,
  barba: 4, cabelo: 3, pele: 5, corCabelo: 5, sobrancelha: 2,
  chapeu: 5, calcado: 4, blusa: 3, calca: 2, colar: 1,
  anelAcess: 5, tatuagem: 4, relogio: 3, jaqueta: 2, reservado: 9,
}

// ------------------------------------------------------- 1. a tabela em si
ok('APARENCIA_BYTES = 20', Proto.APARENCIA_BYTES === 20, String(Proto.APARENCIA_BYTES))

ok('a ORDEM dos campos e a do contrato',
  C.join(',') === [
    'cabeca', 'olhos', 'pupila', 'nariz', 'boca',
    'barba', 'cabelo', 'pele', 'corCabelo', 'sobrancelha',
    'chapeu', 'calcado', 'blusa', 'calca', 'colar',
    'anelAcess', 'tatuagem', 'relogio', 'jaqueta', 'reservado',
  ].join(','), C.join(','))

ok('o numero de opcoes bate com o contrato',
  Proto.APARENCIA_OPCOES.join(',') === '8,5,5,5,5,5,5,5,6,5,6,6,6,6,6,6,6,6,6,0',
  Proto.APARENCIA_OPCOES.join(','))

ok('VERSAO_PROTOCOLO subiu para 3', VERSAO_PROTOCOLO === 3, String(VERSAO_PROTOCOLO))

{
  const p = Proto.aparenciaPadrao()
  const faltando = C.filter((k) => p[k] === undefined)
  // 0 significa "nenhuma"/"descalco" nesses dois: o padrao nao pode nascer nu
  ok('aparenciaPadrao devolve os 20 campos, e vestido',
    faltando.length === 0 && Object.keys(p).length === 20 && p.blusa > 0 && p.calcado > 0,
    'faltando: [' + faltando.join(',') + '] blusa ' + p.blusa + ' calcado ' + p.calcado)
}

// ------------------------------------- 2. ida e volta nos CINCO portadores
{
  const b = Proto.escreverMinhaAparencia(AMOSTRA)
  const m = Proto.lerMinhaAparencia(dv(b))
  ok('MINHA_APARENCIA ida e volta dos 20 campos',
    b.byteLength === 21 && m && !difere(AMOSTRA, m.aparencia),
    b.byteLength + ' bytes; ' + (difere(AMOSTRA, m && m.aparencia) || 'todos batem'))
}
{
  const b = Proto.escreverAparencia(77, AMOSTRA)
  const m = Proto.lerAparencia(dv(b))
  ok('APARENCIA (servidor->todos) ida e volta',
    b.byteLength === 23 && m && m.id === 77 && !difere(AMOSTRA, m.aparencia),
    b.byteLength + ' bytes; ' + (difere(AMOSTRA, m && m.aparencia) || 'todos batem'))
}
{
  const b = Proto.escreverEntrar('Zé do Açaí', AMOSTRA)
  const m = Proto.lerEntrar(dv(b))
  // o nome tem bytes multi-octeto: se o offset da aparencia fosse contado em
  // CARACTERES e nao em BYTES, ela sairia deslocada exatamente aqui
  ok('ENTRAR ida e volta (com nome utf8 de varios bytes)',
    m && m.versao === 3 && m.nome === 'Zé do Açaí' && !difere(AMOSTRA, m.aparencia),
    'versao ' + (m && m.versao) + '; ' + (difere(AMOSTRA, m && m.aparencia) || 'todos batem'))
}
{
  const b = Proto.escreverEntrou(9, 'Ana', AMOSTRA)
  const m = Proto.lerEntrou(dv(b))
  ok('ENTROU ida e volta',
    m && m.id === 9 && m.nome === 'Ana' && !difere(AMOSTRA, m.aparencia),
    difere(AMOSTRA, m && m.aparencia) || 'todos batem')
}
{
  // O caso que mais importa: no BEMVINDO a aparencia fica ANTES das listas.
  const npcs = [{ id: 1000, x: 1.5, z: -2.5, yaw: 0.5, estado: 3, falandoCom: 0 }]
  const objs = [
    { id: 2000, x: 1, y: 2, z: 3, rotY: 0.25, dono: 0, estado: 0 },
    { id: 2001, x: -4, y: 0.5, z: 6, rotY: -1.5, dono: 12, estado: 1 },
  ]
  const b = Proto.escreverBemvindo(5, AMOSTRA, npcs, objs, 1)
  const m = Proto.lerBemvindo(dv(b))
  const listasOk = m && m.npcs.length === 1 && m.npcs[0].id === 1000
    && m.objs.length === 2 && m.objs[0].id === 2000 && m.objs[1].id === 2001
    && m.objs[1].dono === 12 && m.itens === 1
  ok('BEMVINDO: aparencia no meio NAO desloca NPCs nem objetos',
    m && !difere(AMOSTRA, m.aparencia) && listasOk,
    (difere(AMOSTRA, m && m.aparencia) || 'aparencia ok')
    + '; listas ' + (listasOk ? 'ok' : 'DESLOCADAS'))
}

// ------------------------------------------------------------ 3. robustez
{
  // Regra 3 do protocolo: pacote curto devolve NULL, nunca lanca. Um leitor
  // que estoura derruba o laco de rede inteiro por causa de um byte.
  const curto = Proto.escreverMinhaAparencia(AMOSTRA).slice(0, 10)
  let lancou = false
  let r1, r2, r3
  try {
    r1 = Proto.lerMinhaAparencia(curto)
    r2 = Proto.lerAparencia(Proto.escreverEntrou(1, 'x', AMOSTRA))  // tipo errado
    r3 = Proto.lerBemvindo(new ArrayBuffer(0))
  } catch (e) { lancou = true }
  ok('aparencia curta / tipo trocado / vazio devolvem null sem lancar',
    !lancou && r1 === null && r2 === null && r3 === null)
}
{
  // byte nao tem sinal nem 256: o que nao cabe e cortado NA SAIDA, senao 300
  // viraria 44 no meio do pacote, calado.
  const m = Proto.lerMinhaAparencia(dv(Proto.escreverMinhaAparencia({ cabeca: 300, olhos: -5 })))
  ok('valor fora de 0..255 e cortado, nao da a volta',
    m && m.aparencia.cabeca === 255 && m.aparencia.olhos === 0,
    'cabeca ' + (m && m.aparencia.cabeca) + ' olhos ' + (m && m.aparencia.olhos))
}
{
  // objeto vazio: campo que falta e 0, nunca undefined/NaN
  const m = Proto.lerMinhaAparencia(dv(Proto.escreverMinhaAparencia({})))
  ok('aparencia vazia vira 20 zeros, sem undefined',
    m && C.every((k) => m.aparencia[k] === 0))
}

// ------------------------------- 4. o clamp por campo do lado do cliente
{
  // Cada campo tem o SEU teto. Aqui todos vao com 99, e cada um tem que parar
  // na ultima opcao do proprio catalogo — nao num 0..255 unico.
  const alto = {}
  for (const k of C) alto[k] = 99
  const n = normalizarAparencia(alto)
  const esperado = Proto.APARENCIA_OPCOES.map((o) => (o > 0 ? o - 1 : 99))
  const deu = C.map((k) => n[k])
  ok('clamp por campo: cabeca para em 7, olhos em 4, chapeu em 5...',
    deu.join(',') === esperado.join(','), deu.join(','))
}
{
  const n = normalizarAparencia({ cabeca: -3, olhos: null, pupila: 'x', calca: 1.9 })
  ok('negativo, nulo, texto e fracao viram byte valido',
    n.cabeca === 0 && n.olhos === 0 && n.pupila === 0 && n.calca === 1
    && Object.keys(n).length === 20)
}
{
  // A UI e o personagem ainda podem falar os nomes de 6 bytes enquanto a
  // reforma acontece. Perder isso seria o cabelo escolhido virar 0 no pacote.
  const n = normalizarAparencia({ hair: 2, eyes: 3, brows: 1, mouth: 2, hairColor: 4, skinIdx: 3 })
  ok('nomes antigos (hair/eyes/brows/mouth/hairColor/skinIdx) ainda entram',
    n.cabelo === 2 && n.olhos === 3 && n.sobrancelha === 1 && n.boca === 2
    && n.corCabelo === 4 && n.pele === 3,
    'cabelo ' + n.cabelo + ' olhos ' + n.olhos + ' pele ' + n.pele)
}
{
  // 'skin' as vezes e uma COR pronta (preview local). Cor nao e indice: entra
  // como 0 em vez de virar um tom sorteado pelo resto da divisao.
  const n = normalizarAparencia({ skin: 0xf7c6a4 })
  ok('cor crua em "skin" nao vira indice de pele', n.pele === 0, 'pele ' + n.pele)
}

// ---------------------------------------------- 5. o caminho dentro da sala
// Conexoes de mentira: guardam o que receberiam. Nao ha socket nenhum aqui.
function conFalsa(nome) {
  return {
    nome, jogador: null, recebidos: [],
    enviar(buf) { this.recebidos.push(new DataView(buf)) },
    fechar() { },
    ultimo(tipo, ler) {
      for (let i = this.recebidos.length - 1; i >= 0; i--) {
        if (this.recebidos[i].getUint8(0) === tipo) return ler(this.recebidos[i])
      }
      return null
    },
  }
}

const sala = criarSala({})
const A = conFalsa('A'), B = conFalsa('B')
const ja = sala.entrar(A, { versao: VERSAO_PROTOCOLO, nome: 'Ana', aparencia: AMOSTRA })
sala.entrar(B, { versao: VERSAO_PROTOCOLO, nome: 'Beto', aparencia: {} })

ok('a sala guarda os 20 campos de quem entrou', !difere(AMOSTRA, ja.aparencia),
  difere(AMOSTRA, ja.aparencia) || 'todos batem')

{
  // B tem que ter recebido o ENTROU de Ana com a aparencia INTEIRA: e por ele
  // que quem chega depois ve o visual de quem ja estava aqui.
  const e = B.ultimo(Proto.P.ENTROU, Proto.lerEntrou)
  ok('ENTROU avisa os outros com os 20 campos',
    e && e.id === ja.id && !difere(AMOSTRA, e.aparencia),
    difere(AMOSTRA, e && e.aparencia) || 'todos batem')
}

// -- Ana troca de roupa no provador: todos TEM que ver na hora
const TROCADA = Object.assign({}, AMOSTRA, { chapeu: 2, jaqueta: 5, calca: 4, olhos: 1 })
B.recebidos.length = 0
sala.aoPacote(A, dv(Proto.escreverMinhaAparencia(TROCADA)))
{
  const ap = B.ultimo(Proto.P.APARENCIA, Proto.lerAparencia)
  ok('MINHA_APARENCIA vira APARENCIA para os OUTROS, na hora',
    ap && ap.id === ja.id && !difere(TROCADA, ap.aparencia),
    difere(TROCADA, ap && ap.aparencia) || 'chapeu/jaqueta/calca/olhos novos em B')
}
{
  // e nao volta pro proprio dono: ele ja se vestiu localmente
  A.recebidos.length = 0
  sala.aoPacote(A, dv(Proto.escreverMinhaAparencia(TROCADA)))
  ok('a propria aparencia NAO volta pro dono',
    A.ultimo(Proto.P.APARENCIA, Proto.lerAparencia) === null)
}

// -- Ana recarrega a pagina: o servidor devolve a roupa dela no BEMVINDO
sala.sair(A)
const A2 = conFalsa('A2')
sala.entrar(A2, { versao: VERSAO_PROTOCOLO, nome: 'Ana', aparencia: {} })
{
  const bv = A2.ultimo(Proto.P.BEMVINDO, Proto.lerBemvindo)
  ok('quem volta recebe a aparencia guardada por NOME no BEMVINDO',
    bv && !difere(TROCADA, bv.aparencia),
    difere(TROCADA, bv && bv.aparencia) || 'os 20 campos voltaram')
}

// -- cliente velho (versao 2) tem que ser recusado, nao lido torto
{
  const V = conFalsa('Velho')
  sala.entrar(V, { versao: 2, nome: 'Antigo', aparencia: {} })
  const r = V.ultimo(Proto.P.RECUSA, Proto.lerRecusa)
  ok('cliente da versao 2 e RECUSADO (o pacote mudou de tamanho)',
    r && r.motivo === Proto.RECUSA_VERSAO, 'motivo ' + (r && r.motivo))
}

// ---------------------------------------------------------------------------
const falhas = casos.filter((c) => !c.passou)
console.log('\n' + (casos.length - falhas.length) + '/' + casos.length + ' casos passaram')
if (falhas.length) {
  console.log('FALHARAM: ' + falhas.map((c) => c.nome).join(' | '))
  process.exit(1)
}
