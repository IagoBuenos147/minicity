// O LOBBY — de 2 a 4 pessoas, anfitriao, prontos e a virada de fase.
//
//   node tools/teste-lobby.mjs
//
// O pedido do dono do jogo foi literal: "coop libera um servidor somente que
// cabe de 2 a 4 pessoas... somente quando ja tiver clicado no servidor todos e
// ai sim clicar em iniciar o jogo, todos vao pra tela de criacao de personagem
// ... ao terminar clicar em pronto, aparece se tiver somente 1 dos 4 prontos,
// aparece pra todos 1/4 pronto, se tiver 2, 2/4 pronto, ate todos estarem
// prontos".
//
// Cada frase daquelas virou um caso aqui. O teste fala o protocolo binario
// direto no socket: e o jeito de provar a REGRA sem depender de tela nenhuma.

import { WebSocket } from 'ws'
import { criarSala } from '../servidor/sala.js'
import { subir } from '../servidor/rede-ws.js'
import * as Proto from '../src/comum/protocolo.js'
import { MAX_JOGADORES } from '../src/comum/mundo.js'

const P = Proto.P
const PORTA = 8411 + (process.pid % 150)

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function cliente(nome) {
  const c = {
    nome,
    ws: new WebSocket('ws://127.0.0.1:' + PORTA),
    meuId: 0,
    sala: null,        // a ultima foto recebida
    fotos: 0,          // quantas fotos chegaram (o pacote e raro de proposito)
    nomes: new Map(),  // id -> nome, montado pelos ENTROU
    recusa: -1,
    fechou: false,
  }
  c.ws.binaryType = 'arraybuffer'
  c.ws.on('open', () => c.ws.send(Proto.escreverEntrar(nome, {}), { binary: true }))
  c.ws.on('message', (dados) => {
    const u8 = dados instanceof ArrayBuffer ? new Uint8Array(dados)
      : new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    if (!u8.length) return
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    const tipo = dv.getUint8(0)
    if (tipo === P.BEMVINDO) { const b = Proto.lerBemvindo(dv); if (b) c.meuId = b.meuId | 0 }
    else if (tipo === P.SALA_ESTADO) { const m = Proto.lerSalaEstado(dv); if (m) { c.sala = m; c.fotos++ } }
    else if (tipo === P.ENTROU) { const e = Proto.lerEntrou(dv); if (e) c.nomes.set(e.id, e.nome) }
    else if (tipo === P.RECUSA) { const r = Proto.lerRecusa(dv); if (r) c.recusa = r.motivo | 0 }
  })
  c.ws.on('close', () => { c.fechou = true })
  c.ws.on('error', () => { c.fechou = true })
  return c
}

const prontosDe = (c) => (c.sala ? c.sala.jogadores.filter((j) => j.pronto).length : -1)

const sala = criarSala({ aoLog: () => {} })
const servidor = subir(sala, { porta: PORTA, host: '127.0.0.1', servirArquivos: false, aoLog: () => {} })
await servidor.ouvir()

try {
  ok('a sala cabe 4 pessoas', MAX_JOGADORES === 4, 'MAX_JOGADORES=' + MAX_JOGADORES)
  ok('sala vazia comeca no lobby', sala.fase === Proto.FASE_LOBBY && sala.anfitriao === 0,
    'fase=' + sala.fase + ' anfitriao=' + sala.anfitriao)

  // --- 1) o primeiro a entrar vira anfitriao -------------------------------
  const a = cliente('Ana')
  await dormir(350)
  ok('o primeiro a entrar vira anfitriao', sala.anfitriao === a.meuId && a.meuId > 0,
    'anfitriao=' + sala.anfitriao + ' a=' + a.meuId)
  ok('ele recebe a foto da sala', !!a.sala && a.sala.fase === Proto.FASE_LOBBY,
    'foto=' + JSON.stringify(a.sala))

  // --- 2) quem NAO e anfitriao nao tira a sala do lobby --------------------
  const b = cliente('Beto')
  const c = cliente('Caio')
  await dormir(400)
  ok('os tres estao na sala', sala.jogadores.size === 3, 'jogadores=' + sala.jogadores.size)
  ok('todos veem a mesma lista de 3', a.sala.jogadores.length === 3
    && b.sala.jogadores.length === 3 && c.sala.jogadores.length === 3,
    [a, b, c].map((x) => x.sala.jogadores.length).join(','))
  ok('todos sabem quem e o anfitriao', a.sala.anfitriao === a.meuId
    && b.sala.anfitriao === a.meuId && c.sala.anfitriao === a.meuId,
    [a, b, c].map((x) => x.sala.anfitriao).join(','))

  b.ws.send(Proto.escreverComecar(), { binary: true })
  await dormir(300)
  ok('quem nao e anfitriao NAO comeca a partida', sala.fase === Proto.FASE_LOBBY,
    'fase=' + sala.fase)

  // --- 3) o anfitriao leva todo mundo pra criacao --------------------------
  a.ws.send(Proto.escreverComecar(), { binary: true })
  await dormir(300)
  ok('o anfitriao leva a sala pra CRIANDO', sala.fase === Proto.FASE_CRIANDO, 'fase=' + sala.fase)
  ok('a fase nova chega nas TRES telas',
    a.sala.fase === Proto.FASE_CRIANDO && b.sala.fase === Proto.FASE_CRIANDO
    && c.sala.fase === Proto.FASE_CRIANDO,
    [a, b, c].map((x) => x.sala.fase).join(','))
  ok('ninguem comeca pronto', prontosDe(a) === 0, 'prontos=' + prontosDe(a))

  a.ws.send(Proto.escreverComecar(), { binary: true })
  await dormir(200)
  ok('COMECAR repetido nao faz nada', sala.fase === Proto.FASE_CRIANDO, 'fase=' + sala.fase)

  // --- 4) o contador de prontos -------------------------------------------
  a.ws.send(Proto.escreverPronto(true), { binary: true })
  await dormir(250)
  ok('1 de 3 pronto aparece pra TODOS',
    prontosDe(a) === 1 && prontosDe(b) === 1 && prontosDe(c) === 1,
    [a, b, c].map(prontosDe).join(','))

  a.ws.send(Proto.escreverPronto(true), { binary: true })
  await dormir(200)
  ok('PRONTO repetido nao conta duas vezes', prontosDe(a) === 1, 'prontos=' + prontosDe(a))

  b.ws.send(Proto.escreverPronto(true), { binary: true })
  await dormir(250)
  ok('2 de 3 pronto', prontosDe(a) === 2 && sala.fase === Proto.FASE_CRIANDO,
    'prontos=' + prontosDe(a) + ' fase=' + sala.fase)

  b.ws.send(Proto.escreverPronto(false), { binary: true })
  await dormir(250)
  ok('da pra DESMARCAR o pronto', prontosDe(a) === 1, 'prontos=' + prontosDe(a))
  b.ws.send(Proto.escreverPronto(true), { binary: true })
  await dormir(200)

  ok('o jogo NAO comeca com um faltando', sala.fase === Proto.FASE_CRIANDO, 'fase=' + sala.fase)

  c.ws.send(Proto.escreverPronto(true), { binary: true })
  await dormir(300)
  ok('quando o ultimo fica pronto, a sala vai pra JOGANDO',
    sala.fase === Proto.FASE_JOGANDO, 'fase=' + sala.fase)
  ok('a virada chega nas TRES telas ao mesmo tempo',
    a.sala.fase === Proto.FASE_JOGANDO && b.sala.fase === Proto.FASE_JOGANDO
    && c.sala.fase === Proto.FASE_JOGANDO,
    [a, b, c].map((x) => x.sala.fase).join(','))

  // --- 5) o nome digitado na criacao --------------------------------------
  b.ws.send(Proto.escreverMeuNome('  Beto  da   Silva Muito Longo  '), { binary: true })
  await dormir(300)
  const noServidor = [...sala.jogadores.values()].find((j) => j.id === b.meuId)
  ok('MEU_NOME troca o nome no servidor, limpo e cortado',
    noServidor && noServidor.nome === 'Beto da Silva Mu', 'nome=' + (noServidor && noServidor.nome))
  ok('o nome novo chega nas OUTRAS telas', a.nomes.get(b.meuId) === 'Beto da Silva Mu',
    'a ve: ' + a.nomes.get(b.meuId))

  // --- 6) quem entra com o jogo rolando nao trava a sala -------------------
  const d = cliente('Duda')
  await dormir(350)
  ok('quem chega no meio do jogo nasce PRONTO',
    sala.fase === Proto.FASE_JOGANDO && prontosDe(a) === 4,
    'fase=' + sala.fase + ' prontos=' + prontosDe(a))

  // --- 7) a sala cheia recusa o quinto -------------------------------------
  const e = cliente('Edu')
  await dormir(400)
  ok('o quinto e recusado com "cheio"', e.recusa === Proto.RECUSA_CHEIO && sala.jogadores.size === 4,
    'recusa=' + e.recusa + ' jogadores=' + sala.jogadores.size)

  // --- 8) o anfitriao sai e alguem herda -----------------------------------
  const antigo = a.meuId
  a.ws.close()
  await dormir(400)
  ok('o anfitriao que saiu NAO continua sendo o anfitriao', sala.anfitriao !== antigo,
    'antes=' + antigo + ' agora=' + sala.anfitriao)
  ok('quem herdou esta na sala', sala.jogadores.has(sala.anfitriao),
    'anfitriao=' + sala.anfitriao + ' sala=[' + [...sala.jogadores.keys()].join(',') + ']')
  ok('a troca de anfitriao chega nas telas que ficaram', b.sala.anfitriao === sala.anfitriao,
    'b ve ' + b.sala.anfitriao)

  // --- 9) sala vazia volta pro lobby ---------------------------------------
  b.ws.close(); c.ws.close(); d.ws.close()
  await dormir(500)
  ok('sala vazia volta pro LOBBY e sem anfitriao',
    sala.jogadores.size === 0 && sala.fase === Proto.FASE_LOBBY && sala.anfitriao === 0,
    'jogadores=' + sala.jogadores.size + ' fase=' + sala.fase + ' anfitriao=' + sala.anfitriao)

  // --- 10) o pacote e raro (nao e um fluxo por quadro) ---------------------
  ok('SALA_ESTADO e um pacote RARO', b.fotos > 0 && b.fotos < 30, 'fotos recebidas=' + b.fotos)

  try { e.ws.close() } catch (err) { void err }
  await dormir(150)
} finally {
  await servidor.parar()
}

const falhas = casos.filter((x) => !x.passou)
console.log('\n' + (casos.length - falhas.length) + '/' + casos.length + ' casos passaram')
process.exit(falhas.length ? 1 : 0)
