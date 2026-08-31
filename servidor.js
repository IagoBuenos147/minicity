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
//   --- HTTPS/WSS (ver implantar/HTTPS.md) ---
//   SSL_DOMINIO=minicity-rp.duckdns.org   atalho: monta os dois caminhos do
//                   certbot sozinho. E o jeito normal de ligar.
//   SSL_CERT=/caminho/fullchain.pem       se os arquivos nao estiverem no
//   SSL_KEY=/caminho/privkey.pem          lugar padrao do certbot
//   PORTA_HTTP=80   sobe um servidor so pra mandar quem chegar em http pro
//                   https, e pra servir o acme-challenge da renovacao.
//                   Vazio = nao sobe.
//   ACME_WEBROOT=/var/www/letsencrypt     onde o certbot escreve o desafio
//
// COM SSL LIGADO A PORTA PADRAO VIRA 443, e nao 8002 — quem liga HTTPS quer o
// endereco sem numero nenhum na barra. PORTA= continua mandando se for dada.
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
import { subir, subirRedirecionador } from './servidor/rede-ws.js'

/* ---------------------------------------------------------------------------
   O CERTIFICADO
   ---------------------------------------------------------------------------
   Tres jeitos de dizer onde ele esta, do mais curto pro mais explicito:

     SSL_DOMINIO=minicity-rp.duckdns.org   -> monta os dois caminhos do certbot
     SSL_CERT= + SSL_KEY=                  -> caminhos na mao (teste, outra CA)
     nada                                  -> HTTP puro, como sempre foi

   Os caminhos do certbot sao SEMPRE /etc/letsencrypt/live/<dominio>/, e o
   `live/` e o que importa: ele guarda LINKS pro certificado atual dentro de
   `archive/`. Apontar direto pro archive/fullchain3.pem congelaria o servidor
   na terceira emissao, e a renovacao seguinte passaria despercebida.
*/
const SSL_DOMINIO = process.env.SSL_DOMINIO || ''
const RAIZ_LE = '/etc/letsencrypt/live/'
const SSL_CERT = process.env.SSL_CERT || (SSL_DOMINIO ? RAIZ_LE + SSL_DOMINIO + '/fullchain.pem' : '')
const SSL_KEY = process.env.SSL_KEY || (SSL_DOMINIO ? RAIZ_LE + SSL_DOMINIO + '/privkey.pem' : '')
const TLS = (SSL_CERT && SSL_KEY) ? { cert: SSL_CERT, key: SSL_KEY } : null

/* Com HTTPS a porta padrao e a 443. Quem liga certificado quer o endereco
   limpo na barra; cair na 8002 por omissao daria um https que so funciona com
   ":8002" no fim, e ninguem digita isso. */
const PORTA = Number(process.env.PORTA || process.env.PORT || (TLS ? 443 : 8002))
const HOST = process.env.HOST || '0.0.0.0'
const COMPRIMIR = process.env.COMPRESSAO !== '0'
const PORTA_HTTP = Number(process.env.PORTA_HTTP || 0)
const ACME_WEBROOT = process.env.ACME_WEBROOT || ''

const sala = criarSala({ aoLog: console.log })

/* O certificado e lido AQUI DENTRO, e nao na hora de ouvir: se ele nao abrir,
   o servidor nao sobe.

   E de proposito que nao existe um "caiu pro HTTP porque o certificado
   falhou". Esse remendo e o pior desfecho possivel: o jogo voltaria ao ar,
   verde no systemctl, servindo em http — e o microfone (que so existe em
   contexto seguro) morreria em silencio pra todo mundo, com um sintoma que nao
   tem nada a ver com a causa. Melhor nao subir e dizer por que. */
let servidor
try {
  servidor = subir(sala, {
    porta: PORTA, host: HOST, comprimir: COMPRIMIR, tls: TLS, aoLog: console.log,
  })
} catch (erro) {
  console.error('')
  console.error('  ' + ((erro && erro.message) || erro))
  console.error('')
  process.exit(1)
}
let redirecionador = null

/* Se protocolo.js existir e discordar de algum numero do REDE.md, o aviso sai
   agora, no boot, e nao daqui a duas horas em forma de cliente mudo. Nao
   impede o servidor de subir: ele nao depende de um arquivo do cliente. */
conferirProtocolo(console.log)

const ESQUEMA = TLS ? 'https' : 'http'
const SUFIXO = (PORTA === 443 || PORTA === 80) ? '' : ':' + PORTA
const ENDERECO = ESQUEMA + '://' + (SSL_DOMINIO || 'localhost') + SUFIXO

servidor.ouvir().then(() => {
  console.log('ate ' + sala.C.MAX_JOGADORES + ' jogadores  ·  protocolo v' + sala.C.VERSAO_PROTOCOLO)
  console.log('')
  console.log('  o jogo:               ' + ENDERECO)
  console.log('  conferir o que subiu: ' + ENDERECO + '/saude')
  if (TLS) console.log('  o WebSocket vai por wss:// no mesmo endereco (o cliente escolhe sozinho)')
  console.log('')

  /* A porta 80 e OPCIONAL e vem por ultimo: se ela nao subir, o jogo ja esta no
     ar, e ninguem fica sem jogar por causa de um redirecionamento. */
  if (TLS && PORTA_HTTP) {
    redirecionador = subirRedirecionador({
      porta: PORTA_HTTP, host: HOST, webroot: ACME_WEBROOT,
      portaHttps: PORTA, log: console.log,
    })
  }
}).catch((erro) => {
  if (erro && erro.code === 'EADDRINUSE') {
    console.error('')
    console.error('  A porta ' + PORTA + ' ja esta ocupada por outro programa.')
    console.error('  Escolha outra:   PORTA=8123 node servidor.js')
    console.error('')
  } else if (erro && erro.code === 'EACCES') {
    console.error('')
    console.error('  Sem permissao para ouvir na porta ' + PORTA + ' (abaixo de 1024 precisa de root).')
    if (PORTA < 1024) {
      // Rodar o jogo inteiro como root so pra poder abrir a 443 e trocar um
      // problema pequeno por um grande. A capacidade da SO ESSA permissao ao
      // processo; o resto dele continua sendo o usuario de sempre.
      console.error('')
      console.error('  Nao rode como root por causa disto. No systemd, de a capacidade:')
      console.error('    AmbientCapabilities=CAP_NET_BIND_SERVICE')
      console.error('    CapabilityBoundingSet=CAP_NET_BIND_SERVICE')
      console.error('  (ja esta em implantar/minicity.service — ver implantar/HTTPS.md)')
    }
    console.error('')
    console.error('  Ou escolha uma porta alta:   PORTA=8123 node servidor.js')
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
  if (redirecionador) { try { redirecionador.close() } catch (e) { void e } }
  servidor.parar().then(() => process.exit(0))
  const socorro = setTimeout(() => process.exit(0), 2000)
  if (socorro.unref) socorro.unref()
}
process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)
