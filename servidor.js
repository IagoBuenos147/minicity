// ---------------------------------------------------------------------------
// servidor.js — a entrada. Sobe a sala e a rede.
//
// NADA DE HOST OU PORTA ESCRITO NO CODIGO.
//
// Tudo vem do ambiente, porque a maquina de casa, a VPS e qualquer outra
// hospedagem escolhem coisas diferentes — e codigo com endereco escrito dentro
// e codigo que so funciona num lugar.
//
//   PORTA=8002      porta HTTP/WebSocket
//   PORT=8002       mesma coisa; muita hospedagem usa este nome
//   HOST=0.0.0.0    em que interface ouvir. 0.0.0.0 = todas.
//                   Use 127.0.0.1 se houver um nginx na frente.
//   COMPRESSAO=0    desliga o permessage-deflate (so para medir)
//   NODE_ENV=production  congela a versao dos arquivos (cache de um ano)
//
// O CLIENTE NAO TEM ENDERECO NENHUM ESCRITO. Ele conecta no mesmo host de onde
// a pagina veio e escolhe ws:// ou wss:// sozinho conforme a pagina seja http
// ou https.
//
// Rodar aqui:            node servidor.js
// Noutra porta:          PORTA=8123 node servidor.js
//
// CONFERIDO NO SERVIDOR EM 27/08/2026: o mago-pvp esta na porta 8001
// (http://18.230.70.161:8001/saude responde com titulo "mago-pvp", protocolo v9,
// no ar ha ~12 h). A informacao de que ele estaria na 8002 estava trocada.
// Por isso o Mini City usa a 8002: subir na 8001 derrubaria o outro jogo.
// As duas coisas
// rodam na mesma maquina.
// ---------------------------------------------------------------------------

import { criarSala, conferirProtocolo } from './servidor/sala.js'
import { subir } from './servidor/rede-ws.js'

const PORTA = Number(process.env.PORTA || process.env.PORT || 8002)
const HOST = process.env.HOST || '0.0.0.0'
const COMPRIMIR = process.env.COMPRESSAO !== '0'

const sala = criarSala({ aoLog: console.log })
const servidor = subir(sala, { porta: PORTA, host: HOST, comprimir: COMPRIMIR, aoLog: console.log })

/* Se protocolo.js existir e discordar de algum numero do REDE.md, o aviso sai
   agora, no boot, e nao daqui a duas horas em forma de cliente mudo. Nao
   impede o servidor de subir: ele nao depende de um arquivo do cliente. */
conferirProtocolo(console.log)

servidor.ouvir().then(() => {
  console.log('ate ' + sala.C.MAX_JOGADORES + ' jogadores  ·  protocolo v' + sala.C.VERSAO_PROTOCOLO)
  console.log('')
  console.log('  na propria maquina:   http://localhost:' + PORTA)
  console.log('  conferir o que subiu: http://localhost:' + PORTA + '/saude')
  console.log('')
}).catch((erro) => {
  if (erro && erro.code === 'EADDRINUSE') {
    console.error('')
    console.error('  A porta ' + PORTA + ' ja esta ocupada por outro programa.')
    console.error('  Escolha outra:   PORTA=8123 node servidor.js')
    console.error('')
  } else if (erro && erro.code === 'EACCES') {
    console.error('')
    console.error('  Sem permissao para ouvir na porta ' + PORTA + ' (abaixo de 1024 precisa de root).')
    console.error('  Escolha uma porta alta:   PORTA=8123 node servidor.js')
    console.error('')
  } else {
    console.error('nao consegui subir: ' + ((erro && erro.message) || erro))
  }
  process.exit(1)
})

/* Ctrl+C e o `systemctl stop` fecham a sala de verdade, em vez de deixar dez
   conexoes meio abertas na memoria do sistema. O timer de socorro existe
   porque um socket travado nao pode segurar o processo para sempre — e ele e
   unref() para nao ser ele a manter o processo vivo. */
let encerrando = false
function encerrar() {
  if (encerrando) return
  encerrando = true
  console.log('\nencerrando…')
  servidor.parar().then(() => process.exit(0))
  const socorro = setTimeout(() => process.exit(0), 2000)
  if (socorro.unref) socorro.unref()
}
process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)
