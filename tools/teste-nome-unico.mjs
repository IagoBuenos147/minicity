// UM CORPO POR NOME — o teste da regra que acabou com o sosia.
//
//   node tools/teste-nome-unico.mjs
//
// O que ele protege: quem recarrega a pagina (ou reconecta por qualquer
// motivo) NAO pode aparecer duas vezes no mundo. Sem a regra, o TCP da conexao
// velha ainda nao caiu -- o batimento leva ate 10 s pra descobrir que o outro
// lado morreu -- e por esses dez segundos existem dois bonecos com o mesmo
// nome, um deles parado, segurando o NPC com quem a pessoa falava e o objeto
// que ela carregava. Do lado de quem ve, e indistinguivel de "o jogo criou
// dois personagens meus".
//
// Este teste nao abre navegador: fala o protocolo binario direto no socket,
// que e o jeito de testar a REGRA sem depender de render nenhum.

import { WebSocket } from 'ws'
import { criarSala } from '../servidor/sala.js'
import { subir } from '../servidor/rede-ws.js'
import * as Proto from '../src/comum/protocolo.js'

const P = Proto.P
const PORTA = 8291 + (process.pid % 200)

const casos = []
function ok(nome, passou, detalhe) {
  casos.push({ nome, passou })
  console.log((passou ? 'OK   ' : 'FALHA') + '  ' + nome + (detalhe ? '  -> ' + detalhe : ''))
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/** Um cliente burro: entra com um nome e guarda o que o servidor mandou. */
function cliente(nome) {
  const c = {
    nome,
    ws: new WebSocket('ws://127.0.0.1:' + PORTA),
    meuId: 0,
    fechou: false,
    codigoFecho: 0,
    recusa: -1,
    entrou: [],   // ids que o servidor anunciou como ENTROU
    saiu: [],
  }
  c.ws.binaryType = 'arraybuffer'
  c.ws.on('open', () => {
    c.ws.send(Proto.escreverEntrar(nome, {}), { binary: true })
  })
  c.ws.on('message', (dados) => {
    const u8 = dados instanceof ArrayBuffer ? new Uint8Array(dados) : new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
    if (!u8.length) return
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
    const tipo = dv.getUint8(0)
    if (tipo === P.BEMVINDO) { const b = Proto.lerBemvindo(dv); if (b) c.meuId = b.meuId | 0 }
    else if (tipo === P.ENTROU) { const e = Proto.lerEntrou(dv); if (e) c.entrou.push(e.id | 0) }
    else if (tipo === P.SAIU) { const e = Proto.lerSaiu(dv); if (e) c.saiu.push(e.id | 0) }
    else if (tipo === P.RECUSA) { const r = Proto.lerRecusa(dv); if (r) c.recusa = r.motivo | 0 }
  })
  c.ws.on('close', (cod) => { c.fechou = true; c.codigoFecho = cod })
  c.ws.on('error', () => { c.fechou = true })
  return c
}

const sala = criarSala({ aoLog: () => {} })
const servidor = subir(sala, { porta: PORTA, host: '127.0.0.1', servirArquivos: false, aoLog: () => {} })
await servidor.ouvir()

try {
  // --- 1) o mesmo nome duas vezes -----------------------------------------
  const a = cliente('Fulano')
  await dormir(400)
  ok('o primeiro entrou', a.meuId > 0 && sala.jogadores.size === 1,
    'id=' + a.meuId + ' na sala=' + sala.jogadores.size)

  const b = cliente('Fulano')
  await dormir(500)

  ok('a sala continua com UM corpo depois do reentra', sala.jogadores.size === 1,
    'jogadores=' + sala.jogadores.size)
  ok('quem entrou de novo ganhou um id NOVO', b.meuId > 0 && b.meuId !== a.meuId,
    'antes=' + a.meuId + ' agora=' + b.meuId)
  ok('a sessao velha foi derrubada', a.fechou === true, 'fechou=' + a.fechou)
  ok('o corpo que sobrou e o do cliente novo',
    sala.jogadores.has(b.meuId) && !sala.jogadores.has(a.meuId),
    'sala=[' + [...sala.jogadores.keys()].join(',') + ']')

  // --- 2) nomes diferentes convivem ---------------------------------------
  const c = cliente('Sicrano')
  await dormir(500)
  ok('nome diferente NAO derruba ninguem', sala.jogadores.size === 2 && !b.fechou,
    'jogadores=' + sala.jogadores.size + ' b.fechou=' + b.fechou)
  ok('cada um com o seu id', c.meuId > 0 && c.meuId !== b.meuId,
    'b=' + b.meuId + ' c=' + c.meuId)

  // --- 3) quem ficou VE a troca ------------------------------------------
  // Sicrano entrou depois, entao ele nao viu a queda do Fulano velho. Quem
  // tinha que ver era o proprio B (que ja estava dentro) -- e ele nao ve nada,
  // porque foi ele quem derrubou. O que importa aqui e o outro lado: ninguem
  // pode ficar com um fantasma na lista.
  const d = cliente('Sicrano')
  await dormir(500)
  ok('o vizinho recebe o SAIU do homonimo derrubado', b.saiu.indexOf(c.meuId) >= 0,
    'saiu=[' + b.saiu.join(',') + '] esperado ' + c.meuId)
  ok('e recebe o ENTROU do substituto', b.entrou.indexOf(d.meuId) >= 0,
    'entrou=[' + b.entrou.join(',') + '] esperado ' + d.meuId)
  ok('a sala segue com dois corpos, nao tres', sala.jogadores.size === 2,
    'jogadores=' + sala.jogadores.size)

  for (const x of [a, b, c, d]) { try { x.ws.close() } catch (err) { void err } }
  await dormir(200)
} finally {
  await servidor.parar()
}

const falhas = casos.filter((x) => !x.passou)
console.log('\n' + (casos.length - falhas.length) + '/' + casos.length + ' casos passaram')
process.exit(falhas.length ? 1 : 0)
