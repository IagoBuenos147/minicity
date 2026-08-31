// ---------------------------------------------------------------------------
// servidor/rede-ws.js — OS BYTES. Nenhuma regra de jogo mora aqui.
//
// Este arquivo so sabe: aceitar conexao, entregar buffer, cortar quem morreu e
// chamar sala.passo() na hora certa. Quem sabe o que e um caixote e a sala.
//
// POR QUE A BIBLIOTECA `ws` E NAO WEBSOCKET ESCRITO A MAO:
// quadro fragmentado por proxy, ping/pong (que e como se descobre a conexao
// MORTA que o TCP ainda acha viva — o jogador fechou o notebook e continua
// "na sala" por minutos), close com codigo, permessage-deflate que o navegador
// oferece sozinho. Tudo isso e uma classe inteira de bug que so aparece na
// partida de verdade, e nao vale a pena pagar de novo.
//
// E A COMPRESSAO: permessage-deflate LIGADO, com o contexto MANTIDO entre
// mensagens e threshold BAIXO. O threshold e a pegadinha: o padrao da `ws` e
// 1024 bytes e o nosso snapshot tem algumas centenas — com o padrao, NADA
// seria comprimido e a opcao pareceria ligada sem estar. Com o contexto
// mantido, o dicionario aprende que 15 vezes por segundo chega um pacote quase
// igual ao anterior, e e ai que mora o ganho grande.
// ---------------------------------------------------------------------------

import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

// ---------------------------------------------------------------------------
// HTTPS / WSS
//
// O WebSocket NAO precisa de nada de especial: `ws` se pendura no servidor que
// receber, e um `https.Server` serve tanto quanto um `http.Server`. Quem faz o
// upgrade virar wss:// e o proprio TLS por baixo. O cliente ja escolhe sozinho
// (`montarUrl`, em src/rede/cliente-rede.js: pagina https -> wss://), entao
// nao ha uma linha de cliente pra mudar.
//
// O QUE PRECISA DE CUIDADO E A RENOVACAO. O Let's Encrypt dura 90 dias e o
// certbot renova por volta do 60o. O processo do jogo, porem, leu os arquivos
// UMA vez, no boot: sem alguem avisar, ele continua apresentando o certificado
// velho ate alguem reiniciar o servico — e o sintoma chega em forma de "sua
// conexao nao e particular" na tela de todo mundo, dois meses depois do deploy,
// quando ninguem mais lembra que mexeu nisso. `vigiarCertificado` fecha esse
// buraco sem derrubar ninguem.
// ---------------------------------------------------------------------------

/** Le o par de arquivos do certbot. Erro aqui e FATAL e explicado, nunca mudo. */
export function lerCertificado(tls) {
  const saida = {}
  for (const [campo, caminho] of [['cert', tls.cert], ['key', tls.key]]) {
    try {
      saida[campo] = fs.readFileSync(caminho)
    } catch (e) {
      // EACCES e o erro numero um deste assunto, e a mensagem crua do Node nao
      // conta a parte que resolve. privkey.pem nasce 0600 root:root, e o
      // servico roda como `ubuntu` — ver implantar/HTTPS.md.
      const dica = e.code === 'EACCES' ? [
        '',
        '  Sem permissao de leitura. O privkey.pem do certbot e root:root 0600, e o',
        '  servico nao roda como root. Libere por grupo (uma vez so, como root):',
        '',
        '    sudo groupadd -f ssl-cert',
        '    sudo usermod -aG ssl-cert ubuntu',
        '    sudo chgrp -R ssl-cert /etc/letsencrypt/live /etc/letsencrypt/archive',
        '    sudo chmod -R g+rX /etc/letsencrypt/live /etc/letsencrypt/archive',
        '',
        '  Depois: sudo systemctl restart minicity   (o grupo so vale em processo novo)',
      ].join('\n') : e.code === 'ENOENT' ? [
        '',
        '  O arquivo nao existe. Confira o dominio no caminho e se o certbot ja rodou:',
        '    sudo certbot certificates',
      ].join('\n') : ''
      const erro = new Error('nao consegui ler ' + campo + ' em ' + caminho + ': ' + e.message + dica)
      erro.code = e.code
      throw erro
    }
  }
  return saida
}

function impressao(par) {
  return crypto.createHash('sha256').update(par.cert).update(par.key).digest('hex')
}

/**
 * Recarrega o certificado quando o certbot trocar os arquivos, SEM reiniciar.
 *
 * Por que comparar o CONTEUDO e nao usar fs.watch: os caminhos de
 * /etc/letsencrypt/live/ sao LINKS SIMBOLICOS pra /etc/letsencrypt/archive/, e
 * a renovacao troca o link, nao o arquivo. Um fs.watch resolve o link na hora
 * de vigiar e passa a vigiar o arquivo antigo — ele continua vendo o de sempre,
 * calado, exatamente ate o certificado vencer. Reler e comparar o hash nao tem
 * como errar isso, custa alguns KB por hora, e funciona igual se um dia alguem
 * trocar os arquivos na mao.
 *
 * `setSecureContext` troca o certificado das conexoes NOVAS; quem ja esta
 * jogando nao sente nada, porque a sessao TLS dele ja esta estabelecida.
 */
function vigiarCertificado(servidorTls, tls, log, intervaloMs) {
  let atual = impressao(lerCertificado(tls))
  const timer = setInterval(() => {
    let par
    try { par = lerCertificado(tls) } catch (e) {
      // Falhar aqui NAO derruba o jogo: o certificado que ja esta em memoria
      // continua valendo, e o certbot pode estar no meio da troca dos arquivos.
      log('aviso: nao consegui reler o certificado (' + e.message.split('\n')[0] + ')')
      return
    }
    const nova = impressao(par)
    if (nova === atual) return
    atual = nova
    try {
      servidorTls.setSecureContext(par)
      log('certificado recarregado (o certbot renovou) — sem derrubar ninguem')
    } catch (e) {
      log('aviso: certificado novo recusado: ' + e.message)
    }
  }, intervaloMs || 60 * 60 * 1000)
  if (timer.unref) timer.unref()
  return timer
}

/**
 * O servidor da porta 80: manda todo mundo pro https.
 *
 * Com UMA excecao, e ela e a razao de este servidor existir em vez de a porta
 * 80 ficar simplesmente fechada: `/.well-known/acme-challenge/`. E por ali,
 * em HTTP puro, que o Let's Encrypt confere que o dominio e seu — na emissao e
 * em toda renovacao. Redirecionar esse caminho pro https quebra a renovacao, e
 * o estrago so aparece 90 dias depois.
 */
export function subirRedirecionador({ porta, host, webroot, portaHttps, log }) {
  const servidor = http.createServer((req, res) => {
    const url = req.url || '/'

    if (webroot && url.indexOf('/.well-known/acme-challenge/') === 0) {
      const nome = path.basename(url.split('?')[0])
      const arq = path.join(webroot, '.well-known', 'acme-challenge', nome)
      fs.readFile(arq, (err, dados) => {
        if (err) { res.writeHead(404); res.end(); return }
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end(dados)
      })
      return
    }

    // Sem Host nao da pra montar o destino; 400 e melhor que redirecionar pra
    // um endereco inventado.
    const hostPedido = req.headers.host
    if (!hostPedido) { res.writeHead(400); res.end(); return }
    const semPorta = hostPedido.replace(/:\d+$/, '')
    const alvo = 'https://' + semPorta + (portaHttps && portaHttps !== 443 ? ':' + portaHttps : '') + url
    res.writeHead(301, { Location: alvo, 'Cache-Control': 'no-store' })
    res.end()
  })
  servidor.on('error', (e) => {
    // Nao e fatal: sem a porta 80 o jogo funciona igual, so nao ha atalho pra
    // quem digita o endereco sem o https://.
    log('aviso: porta ' + porta + ' (redirecionamento pro https) nao subiu: ' + e.code)
  })
  servidor.listen(porta, host, () => {
    log('porta ' + porta + ' redirecionando pro https' + (webroot ? '  (acme-challenge servido de ' + webroot + ')' : ''))
  })
  return servidor
}

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const PROJETO = path.join(AQUI, '..')
const DIST = path.join(PROJETO, 'dist')

/* A pasta servida e a SAIDA do `npm run build` do Vite. O fallback para a raiz
   do projeto existe para quem clonou e ainda nao rodou o build: o servidor
   sobe e o /saude responde, em vez de dar 404 em tudo e parecer quebrado.
   Escolhido ao subir, uma vez: trocar a raiz com o servidor no ar so criaria
   um estado que ninguem consegue reproduzir depois. */
const RAIZ = fs.existsSync(path.join(DIST, 'index.html')) ? DIST : PROJETO

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/* Pastas que nunca entram no resumo nem podem ser servidas. node_modules tem
   dezenas de milhares de arquivos: ler tudo para calcular um sha1 travaria o
   boot por segundos e nao mudaria o resultado em nada que o navegador use. */
const IGNORAR = new Set(['node_modules', '.git', 'shots', 'tools', '.claude'])

// ---------------------------------------------------------------------------
// A VERSAO DOS ARQUIVOS — o fim do "atualizei e ele continua com a pagina
// velha".
//
// O navegador guarda .js em cache e nao pergunta nada. Depois de um deploy,
// quem ja tinha o jogo aberto continua rodando o arquivo antigo por horas — e
// o bug que aparece nao existe em lugar nenhum do codigo.
//
// A solucao e estrutural, nao e "peca pro seu amigo dar Ctrl+F5":
//   1. ao subir, o servidor calcula um resumo de TODOS os arquivos servidos
//      (conteudo, nao data de modificacao);
//   2. o index.html e reescrito na hora, com ?v=<resumo> em cada script;
//   3. o index.html vai com no-store (nunca guarda);
//   4. o .js com o ?v= certo vai com cache de um ano e "immutable" (guarda
//      para sempre, porque o ENDERECO muda quando o conteudo muda).
// Resultado: o navegador SEMPRE busca o index.html, e o index.html sempre
// aponta para o endereco novo. Nao existe arquivo velho.
// ---------------------------------------------------------------------------
export function resumoDosArquivos(raiz) {
  const h = crypto.createHash('sha1')
  const pilha = [raiz]
  const achados = []
  while (pilha.length) {
    const dir = pilha.pop()
    let itens
    try { itens = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { continue }
    for (const it of itens) {
      if (IGNORAR.has(it.name)) continue
      const p = path.join(dir, it.name)
      if (it.isDirectory()) pilha.push(p)
      else achados.push(p)
    }
  }
  achados.sort()
  for (const p of achados) {
    h.update(path.relative(raiz, p).split(path.sep).join('/'))
    try { h.update(fs.readFileSync(p)) } catch (e) { /* sumiu no meio: ignora */ }
  }
  return h.digest('hex').slice(0, 10)
}

/* Poe ?v=<resumo> em todo src= e href= que aponta para dentro do proprio site.
   Feito no servidor de proposito: se dependesse de alguem lembrar de editar o
   index.html a mao, ia esquecer justamente no deploy que importa. */
const RE_ATRIBUTO = /\b(src|href)="(?!https?:|\/\/|data:|#)([^"?]+)"/g

/* ...MENOS no que o build ja versionou pelo NOME.
   Esta excecao nao e frescura: sem ela o jogo INICIA DUAS VEZES.
   O Vite poe o resumo do conteudo no nome do arquivo (index-AGq9wq1K.js), e os
   pedacos carregados sob demanda (carro, moto, skate) trazem o caminho do
   pedaco principal ESCRITO DENTRO DO JS: import ... from "./index-AGq9wq1K.js".
   O carimbo so alcanca o HTML; nunca o que esta dentro de um .js. Resultado: a
   pagina carrega ".../index-AGq9wq1K.js?v=abc" e o pedaco do carro pede
   ".../index-AGq9wq1K.js" - duas URLs, e modulo ES e identificado pela URL.
   O navegador avalia o arquivo DE NOVO: dois jogos no ar, duas conexoes de
   rede, dois jogadores com o mesmo nome na sala e um sosia parado do lado de
   cada um. Foi medido com o teste online, nao e teoria.
   Como o nome ja muda quando o conteudo muda, esses arquivos nao precisam do
   carimbo pra nada. */
const RE_JA_VERSIONADO = /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/

export function carimbarVersao(html, versao) {
  return String(html).replace(RE_ATRIBUTO, (todo, atr, caminho) => {
    if (RE_JA_VERSIONADO.test(caminho)) return todo
    return atr + '="' + caminho + '?v=' + versao + '"'
  })
}


/* A configuracao de compressao num lugar so, para dar para medir com e sem. */
export function opcoesDeflate(ligada) {
  if (!ligada) return false
  return {
    /* nivel 3: quase toda a compressao do nivel 9 por uma fracao da CPU. Num
       pacote de algumas centenas de bytes o nivel alto nao paga. */
    zlibDeflateOptions: { level: 3, memLevel: 8, windowBits: 15 },
    zlibInflateOptions: { chunkSize: 16 * 1024 },
    /* NAO zerar o contexto entre mensagens: e o dicionario aprendido que da o
       ganho grande num fluxo repetitivo como o snapshot. */
    clientNoContextTakeover: false,
    serverNoContextTakeover: false,
    serverMaxWindowBits: 15,
    concurrencyLimit: 20,
    /* o padrao da ws e 1024 e mataria a compressao do nosso snapshot sem
       avisar ninguem */
    threshold: 48,
  }
}

// ---------------------------------------------------------------------------
// Sobe HTTP + WebSocket e liga na sala.
// ---------------------------------------------------------------------------
export function subir(sala, opcoes = {}) {
  /* NADA de host ou porta fixos: tudo vem de fora. O padrao so existe para
     quem roda na propria maquina sem configurar nada. */
  const porta = opcoes.porta || 8001
  const host = opcoes.host || '0.0.0.0'
  const comprimir = opcoes.comprimir !== false
  /* { cert, key }: caminhos dos arquivos do certbot. Ausente = HTTP puro. */
  const tls = opcoes.tls || null
  const servirArquivos = opcoes.servirArquivos !== false
  const log = opcoes.aoLog || console.log
  const subiuEm = Date.now()

  /* Em producao o resumo e calculado UMA vez, ao subir: os arquivos nao mudam
     com o servidor no ar e recalcular a cada pedido seria reler o projeto a
     toa. Em desenvolvimento e o contrario — voce edita, recarrega, e com o
     resumo congelado o endereco continua o mesmo, o navegador usa o que ele
     guardou como "immutable" e voce fica olhando para o arquivo velho sem
     entender por que a mudanca nao aparece. */
  const CONGELAR = process.env.NODE_ENV === 'production'
  let versaoCache = servirArquivos ? resumoDosArquivos(RAIZ) : '0'
  function versaoAtual() {
    if (!CONGELAR && servirArquivos) versaoCache = resumoDosArquivos(RAIZ)
    return versaoCache
  }
  const versaoArquivos = versaoCache

  function atender(req, res) {
    // gancho para quem sobe este servidor precisar de rota propria
    if (opcoes.rotaExtra && opcoes.rotaExtra(req, res)) return

    const partes = (req.url || '/').split('?')
    let rel
    try { rel = decodeURIComponent(partes[0]) } catch (e) { rel = partes[0] }
    const consulta = partes[1] || ''

    /* Serve para conferir, do navegador ou do celular, que o deploy subiu
       mesmo e qual versao esta no ar. */
    if (rel === '/saude') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({
        ok: true,
        versaoProtocolo: sala.C.VERSAO_PROTOCOLO,
        versaoArquivos: versaoAtual(),
        congelada: CONGELAR,
        jogadores: sala.jogadores.size,
        tick: sala.tick,
        noArSegundos: Math.round((Date.now() - subiuEm) / 1000),
      }))
      return
    }

    if (!servirArquivos) { res.writeHead(404); res.end(); return }

    if (rel === '/') rel = '/index.html'
    const arq = path.join(RAIZ, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''))
    /* Sem esta linha, /../../etc/passwd sai daqui como arquivo. */
    if (!arq.startsWith(RAIZ)) { res.writeHead(403); res.end('fora da pasta'); return }

    fs.readFile(arq, (erro, dados) => {
      if (erro) { res.writeHead(404); res.end('nao achei'); return }
      const ext = path.extname(arq).toLowerCase()

      if (ext === '.html') {
        /* HTML NUNCA fica em cache, e sai daqui ja carimbado com a versao em
           cada script. E este arquivo que faz o navegador largar o .js velho. */
        res.writeHead(200, {
          'Content-Type': TIPOS['.html'],
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        })
        res.end(carimbarVersao(dados.toString('utf8'), versaoAtual()))
        return
      }

      /* Este conteudo nunca muda neste endereco? Entao pode guardar por um
         ano. Duas formas de ter certeza disso, e as duas valem:
           - veio com ?v= da versao ATUAL (arquivos soltos: favicon, som...);
           - o resumo do conteudo esta no proprio NOME (assets/index-AGq9wq1K.js),
             que e como o build versiona. Esses nao levam ?v= de proposito: o
             carimbo so alcanca o HTML, e um .js pedido de dentro de outro .js
             chegaria aqui sem ele. (Ver o comentario de carimbarVersao: e o que
             fazia o jogo iniciar duas vezes.) Sem esta segunda forma o pacote
             inteiro voltaria a ser baixado a cada F5.
         Versao velha ou nenhuma das duas: nao guarda nada. */
      const carimbado = consulta.indexOf('v=' + versaoCache) >= 0
        || RE_JA_VERSIONADO.test(rel)
      res.writeHead(200, {
        'Content-Type': TIPOS[ext] || 'application/octet-stream',
        'Cache-Control': carimbado ? 'public, max-age=31536000, immutable' : 'no-store',
      })
      res.end(dados)
    })
  }

  /* HTTP OU HTTPS — e a UNICA diferenca entre os dois modos.
     Tudo o que vem depois (o WebSocket, as rotas, o laco do mundo, o parar)
     nao sabe nem precisa saber qual dos dois esta embaixo: `ws` se pendura
     igual nos dois, e e o TLS que faz o ws:// virar wss://. */
  const http_ = tls
    ? https.createServer(lerCertificado(tls), atender)
    : http.createServer(atender)
  if (tls) vigiarCertificado(http_, tls, log, opcoes.intervaloCert)

  const wss = new WebSocketServer({
    server: http_,
    perMessageDeflate: opcoesDeflate(comprimir),
    maxPayload: 64 * 1024,   // pacote de jogo e pequeno; acima disso e ataque
  })

  /* Sem este ouvinte, um erro de socket vira excecao nao tratada e derruba o
     processo com um rastro de pilha que nao ajuda ninguem. */
  wss.on('error', (e) => { if (opcoes.aoErro) opcoes.aoErro(e) })

  const conexoes = new Set()

  wss.on('connection', (ws, req) => {
    ws.binaryType = 'arraybuffer'
    if (ws._socket) ws._socket.setNoDelay(true)   // sem Nagle: pacote pequeno sai na hora

    const con = {
      ws,
      jogador: null,
      vivo: true,
      respondeu: true,
      endereco: (req.socket && req.socket.remoteAddress) || '?',
      bytesInicio: (ws._socket && ws._socket.bytesWritten) || 0,
      descartados: 0,
    }

    /* ---------- O CONTRATO DO TRANSPORTE ----------
       enviar(buf, confiavel).

       No WebSocket os dois canais sao o mesmo cano — mas o jogo ja e escrito
       respeitando a diferenca, entao no dia em que isto virar datagrama nada
       do jogo muda.

       A diferenca que EXISTE hoje: quando o cano entope, o pacote NAO
       confiavel e DESCARTADO e o confiavel nunca. Empilhar snapshot velho so
       piora — o proximo ja e melhor. Perder "fulano entrou" ou "o vaso
       quebrou" e bug: esses estados nao se repetem sozinhos. */
    con.enviar = function (buf, confiavel) {
      if (!con.vivo || ws.readyState !== ws.OPEN) return false
      if (!confiavel && ws.bufferedAmount > 131072) { con.descartados++; return false }
      try { ws.send(buf, { binary: true }) } catch (e) { fechar(); return false }
      return true
    }

    con.bytesEnviados = function () {
      if (!ws._socket) return 0
      return ws._socket.bytesWritten - con.bytesInicio
    }

    function fechar() {
      if (!con.vivo) return
      con.vivo = false
      conexoes.delete(con)
      /* A sala limpa o jogador NA HORA: libera o NPC que ele travava e solta o
         objeto que ele segurava. Nada pode ficar preso em quem ja foi. */
      if (con.jogador) sala.sair(con.jogador)

      /* close() e nao terminate(): a recusa vem JUNTO do fecho.
         terminate() destroi o socket na hora, sem esvaziar o que ja foi
         escrito — e a sala recusa exatamente assim: manda o RECUSA (versao
         errada, sala cheia) e fecha na linha seguinte. Com terminate, o pacote
         que EXPLICA a recusa morria no buffer e o jogador via so a conexao
         cair, sem motivo nenhum na tela. Foi medido: o teste do lobby pegava
         recusa=-1 no quinto jogador de uma sala de quatro.
         O terminate continua existindo como rede de seguranca: um socket que
         nao completa o handshake de fecho em 1 s e derrubado na marra, senao
         um cliente travado seguraria o descritor pra sempre. */
      try { ws.close(1000, 'fim') } catch (e) { /* ja morreu */ }
      const facao = setTimeout(() => {
        try { ws.terminate() } catch (e) { /* ja morreu */ }
      }, 1000)
      if (facao.unref) facao.unref()
      ws.once('close', () => clearTimeout(facao))
    }
    con.fechar = fechar

    conexoes.add(con)

    ws.on('message', (dados, ehBinario) => {
      if (!ehBinario) return                       // o jogo so fala binario
      const u8 = dados instanceof ArrayBuffer ? new Uint8Array(dados)
        : (ArrayBuffer.isView(dados) ? new Uint8Array(dados.buffer, dados.byteOffset, dados.byteLength)
          : new Uint8Array(dados))
      if (u8.length < 1) return
      const vista = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
      /* Porta unica: quem sabe o que cada byte quer dizer e a sala. */
      sala.aoPacote(con, vista)
    })

    ws.on('pong', () => { con.respondeu = true })
    ws.on('error', () => { fechar() })
    ws.on('close', () => { fechar() })
  })

  /* ---------- batimento cardiaco ----------
     Half-open e a morte silenciosa: o jogador fecha o notebook, o TCP nao
     avisa nada e a sala fica com um boneco parado por minutos — segurando o
     barbeiro e um caixote que ninguem mais consegue pegar. Ping a cada 5 s,
     corta quem nao respondeu ate o proximo. */
  const batida = setInterval(() => {
    for (const con of conexoes) {
      if (!con.respondeu) { con.fechar(); continue }
      con.respondeu = false
      try { con.ws.ping() } catch (e) { con.fechar() }
    }
  }, 5000)
  if (batida.unref) batida.unref()

  /* ---------- o relogio ----------
     setInterval sozinho ESCORREGA: cada volta perde alguns milissegundos e em
     um minuto o servidor ja esta atrasado — e como o cliente desenha 100 ms
     atras do snapshot, atraso acumulado vira engasgo visivel. Aqui a meta e
     absoluta e o laco REPOE o que faltou, ate um limite: se a maquina travou
     de verdade, desistir de repor e melhor do que rodar 40 passos seguidos. */
  const MS = 1000 / sala.C.TICK_HZ
  let proximo = Date.now()
  let rodando = true
  let atrasos = 0

  function laco() {
    if (!rodando) return
    const agora = Date.now()
    if (agora - proximo > 1000) { proximo = agora; atrasos++ }   // travou feio: desiste de repor
    let n = 0
    while (Date.now() >= proximo && n < 5) { sala.passo(); proximo += MS; n++ }
    setTimeout(laco, Math.max(1, Math.round(proximo - Date.now())))
  }

  const servidor = {
    http: http_,
    /* `http` continua sendo o nome do campo mesmo em https, pra nao quebrar
       quem ja usa (tools/teste-lobby.mjs e companhia). `seguro` diz a verdade
       sobre o que ele e. */
    seguro: !!tls,
    esquema: tls ? 'https' : 'http',
    wss,
    conexoes,
    comprimir,
    porta,
    host,
    raiz: RAIZ,
    versaoArquivos,
    atrasos() { return atrasos },
    bytesPorJogador() {
      const fora = []
      for (const con of conexoes) if (con.jogador) fora.push(con.bytesEnviados())
      return fora
    },
    ouvir() {
      return new Promise((ok, falha) => {
        http_.once('error', falha)
        http_.listen(porta, host, () => {
          proximo = Date.now()
          laco()
          log('mini-city-rp ouvindo em ' + (tls ? 'https' : 'http') + '://' + host + ':' + porta
            + (tls ? '   (WebSocket em wss://)' : ''))
          if (tls) log('certificado: ' + tls.cert)
          log('mundo a ' + sala.C.TICK_HZ + ' Hz  ·  compressao: ' + (comprimir ? 'LIGADA' : 'desligada'))
          if (servirArquivos) {
            log('servindo ' + RAIZ + (RAIZ === DIST ? '' : '  (dist/ ainda nao existe: rode `npm run build`)'))
            log('versao dos arquivos: ' + versaoArquivos +
              (CONGELAR ? ' (congelada: NODE_ENV=production)' : ' (refeita a cada pagina: modo desenvolvimento)'))
          }
          ok(servidor)
        })
      })
    },
    parar() {
      rodando = false
      clearInterval(batida)
      for (const con of conexoes) con.fechar()
      return new Promise((ok) => {
        wss.close(() => { http_.close(() => { ok() }) })
      })
    },
  }
  return servidor
}
