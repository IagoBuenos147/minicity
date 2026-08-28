// REINICIAR O MUNDO (a tecla F8) — o teste da volta ao estado inicial.
//
//   node tools/teste-reiniciar.mjs
//
// O pedido do dono do jogo foi literal: "voltar ao padrao inicial, sem criacao
// de helicoptero, voltar ao normal". Cada peca do mundo vira um caso aqui —
// NPC, objeto destruido, veiculo fora da vaga, portal aberto, item no bolso —
// porque sao exatamente as que NAO voltam sozinhas: o SNAPSHOT conserta
// posicao de NPC e de objeto por conta propria, mas nao desfaz um helicoptero
// montado nem devolve a arma de portal pra cidade.
//
// O anel verde, a arma de portal e o helicoptero sairam do jogo (backup/), e o
// zumbi foi apagado. As MECANICAS deles continuam inteiras no servidor, e e
// justamente por isso que este teste continua exercitando todas: no dia em que
// alguem trouxer o anel de volta, o reinicio ja esta certo.
//
// O mundo e sujado por dentro (mexendo nos Maps da sala, que e o estado de
// verdade) e o REINICIAR entra pelo SOCKET, em bytes: assim o teste prova o
// caminho inteiro — pacote, despacho, reinicio e aviso de volta.

import { WebSocket } from 'ws'
import { criarSala } from '../servidor/sala.js'
import { subir } from '../servidor/rede-ws.js'
import * as Proto from '../src/comum/protocolo.js'
import { NPCS, VEICULOS, HELI_ID_MIN } from '../src/comum/mundo.js'

const P = Proto.P
const PORTA = 8351 + (process.pid % 200)

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

function cliente(nome) {
  const c = {
    ws: new WebSocket('ws://127.0.0.1:' + PORTA),
    meuId: 0, itens: -1, reiniciouPor: -1, fechou: false,
  }
  c.ws.binaryType = 'arraybuffer'
  c.ws.on('open', () => c.ws.send(Proto.escreverEntrar(nome, {}), { binary: true }))
  c.ws.on('message', (dados) => {
    const u8 = dados instanceof ArrayBuffer ? new Uint8Array(dados)
      : new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    if (!u8.length) return
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    const tipo = dv.getUint8(0)
    if (tipo === P.BEMVINDO) {
      const b = Proto.lerBemvindo(dv)
      if (b) { c.meuId = b.meuId | 0; c.itens = b.itens | 0 }
    } else if (tipo === P.MUNDO_REINICIADO) {
      const m = Proto.lerMundoReiniciado(dv)
      if (m) c.reiniciouPor = m.quem | 0
    }
  })
  c.ws.on('close', () => { c.fechou = true })
  c.ws.on('error', () => { c.fechou = true })
  return c
}

const sala = criarSala({ aoLog: () => {} })
const servidor = subir(sala, { porta: PORTA, host: '127.0.0.1', servirArquivos: false, aoLog: () => {} })
await servidor.ouvir()

try {
  const a = cliente('Fulano')
  const b = cliente('Sicrano')
  await dormir(500)
  ok('dois jogadores na sala', sala.jogadores.size === 2 && a.meuId > 0 && b.meuId > 0,
    'a=' + a.meuId + ' b=' + b.meuId)

  // --- sujar o mundo -------------------------------------------------------
  // O NPC sai do lugar e do estado dele. (Aqui morava o zumbi, que era o caso
  // mais gritante disto; ele foi apagado do jogo, mas a REGRA que o teste
  // protege continua a mesma: NPC fora do lugar volta pro lugar.)
  const npc = sala.npcs.get(NPCS[0].id)
  const estadoBase = npc.estadoBase
  npc.estado = 4                          // 4 = conversando
  npc.falandoCom = 1
  npc.x = 12.5; npc.z = 4.25

  const heliId = HELI_ID_MIN
  sala.veiculos.set(heliId, {
    id: heliId, tipo: 'helicoptero', heli: true, criador: a.meuId,
    x: 3, y: 0, z: -4, yaw: 0, dono: a.meuId,
  })

  const carro = sala.veiculos.get(VEICULOS[0].id)
  carro.x = 40; carro.z = 40; carro.dono = b.meuId

  /* Um objeto agarravel PLANTADO na mao. A lista de AGARRAVEIS ficou vazia
     quando o anel verde saiu do jogo (ver src/comum/mundo.js), mas o Map, o
     estado DESTRUIDO e o reinicio deles continuam de pe — entao o teste cria
     um do mesmo formato que a sala cria, em vez de pular a unica peca
     irreversivel do mundo. */
  const obj = {
    id: 2900, tipo: 'caixote', meiaAltura: 0.36,
    x: 12.4, y: 0.52, z: -10.2, rotY: 0,
    ox: 12.4, oy: 0.52, oz: -10.2,
    dono: 0, estado: sala.C.REPOUSO,
  }
  sala.objetos.set(obj.id, obj)
  obj.estado = sala.C.DESTRUIDO
  obj.x = obj.ox + 9; obj.z = obj.oz - 7

  sala.portais.set(3001, { id: 3001, dono: a.meuId, x: 1, y: 0, z: 2, yaw: 0, restam: 30 })

  // o item entra pelo caminho de verdade (pacote), pra o itensPorNome do
  // servidor ser escrito do jeito que o jogo escreve
  a.ws.send(Proto.escreverPegarItem(Proto.ITEM_PORTAL_GUN), { binary: true })
  await dormir(250)

  ok('o mundo esta mesmo sujo antes do teste',
    npc.estado !== estadoBase
    && [...sala.veiculos.values()].some((v) => v.heli)
    && obj.estado === sala.C.DESTRUIDO
    && sala.portais.size === 1,
    'npc=' + npc.estado + ' helis=' + [...sala.veiculos.values()].filter((v) => v.heli).length
    + ' obj=' + obj.estado + ' portais=' + sala.portais.size)

  // --- o pedido, em bytes, pelo socket ------------------------------------
  a.ws.send(Proto.escreverReiniciar(), { binary: true })
  await dormir(400)

  ok('o NPC voltou pra pose de origem', npc.estado === estadoBase,
    'estado=' + npc.estado + ' (esperado ' + estadoBase + ')')
  ok('o NPC voltou pro lugar de origem',
    Math.abs(npc.x - NPCS[0].x) < 0.001 && Math.abs(npc.z - NPCS[0].z) < 0.001,
    'x=' + npc.x.toFixed(2) + ' z=' + npc.z.toFixed(2))
  ok('o dialogo dele foi liberado', npc.falandoCom === 0, 'falandoCom=' + npc.falandoCom)

  const helis = [...sala.veiculos.values()].filter((v) => v.heli)
  ok('nenhum helicoptero montado sobrou', helis.length === 0, 'helis=' + helis.length)
  ok('os tres veiculos de rua continuam existindo',
    sala.veiculos.size === VEICULOS.length, 'veiculos=' + sala.veiculos.size)
  ok('o carro voltou pra vaga e ficou sem dono',
    Math.abs(carro.x - VEICULOS[0].x) < 0.001 && Math.abs(carro.z - VEICULOS[0].z) < 0.001
    && carro.dono === 0,
    'x=' + carro.x + ' z=' + carro.z + ' dono=' + carro.dono)

  ok('o objeto destruido voltou inteiro e no lugar',
    obj.estado === sala.C.REPOUSO && Math.abs(obj.x - obj.ox) < 0.001
    && Math.abs(obj.z - obj.oz) < 0.001 && obj.dono === 0,
    'estado=' + obj.estado + ' x=' + obj.x + ' ox=' + obj.ox)

  ok('nenhum portal ficou aberto', sala.portais.size === 0, 'portais=' + sala.portais.size)

  ok('os dois jogadores ficaram sem item e sem veiculo',
    [...sala.jogadores.values()].every((j) => j.itens === 0 && j.veiculo === 0
      && j.portalId === 0 && j.objetoNaMao === 0 && j.npcEmDialogo === 0),
    [...sala.jogadores.values()].map((j) => j.id + ':itens=' + j.itens).join(' '))

  // --- o aviso chegou pros DOIS, com o id de quem pediu -------------------
  ok('quem pediu recebeu o MUNDO_REINICIADO', a.reiniciouPor === a.meuId,
    'recebeu=' + a.reiniciouPor + ' esperado=' + a.meuId)
  ok('quem NAO pediu tambem recebeu (o mundo e da sala inteira)',
    b.reiniciouPor === a.meuId, 'recebeu=' + b.reiniciouPor)

  // --- e quem volta depois nao ganha a arma de volta ----------------------
  a.ws.close()
  await dormir(200)
  const c = cliente('Fulano')
  await dormir(400)
  ok('quem ja tinha a arma de portal volta SEM ela', c.itens === 0, 'itens=' + c.itens)
  c.ws.close(); b.ws.close()
  await dormir(200)
} finally {
  await servidor.parar()
}

const falhas = casos.filter((x) => !x.passou)
console.log('\n' + (casos.length - falhas.length) + '/' + casos.length + ' casos passaram')
process.exit(falhas.length ? 1 : 0)
