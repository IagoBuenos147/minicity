// HTTPS + WSS — o teste.
//
//   node tools/teste-https.mjs
//
// Sem navegador e sem certbot: sobe o servidor de verdade com um certificado
// AUTOASSINADO gerado na hora (openssl), e conversa com ele por https e por
// wss. O caminho de codigo exercitado e exatamente o de producao — a unica
// diferenca e quem assinou o papel.
//
// O que ele cobre, e por que cada um esta aqui:
//
//   * https sobe e serve /saude .......... o basico
//   * o WebSocket vira wss ............... a duvida numero um de quem liga TLS
//     no mesmo servidor .................. ("preciso de uma porta separada?" — nao)
//   * porta 80 redireciona ............... e NAO redireciona o acme-challenge,
//                                          que e o que mantem a renovacao viva
//   * o certificado recarrega sozinho .... o bug de daqui a 60 dias, testado hoje
//   * cert ilegivel nao sobe em http ..... o remendo que NAO pode existir
//   * sem SSL nada muda .................. o modo http continua igual

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import https from 'node:https'
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

import { criarSala } from '../servidor/sala.js'
import { subir, subirRedirecionador, lerCertificado } from '../servidor/rede-ws.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'minicity-tls-'))
const PORTA = 8600 + (process.pid % 90)
const PORTA80 = 8500 + (process.pid % 90)

let ok = 0
let falhas = 0
function checar(nome, cond, extra) {
  if (cond) { ok++; console.log('  ok   ' + nome) }
  else { falhas++; console.log('  FALHOU  ' + nome + (extra ? '   -> ' + extra : '')) }
}
function secao(t) { console.log(t) }

/**
 * Um certificado autoassinado, feito na hora.
 *
 * `subjectAltName` nao e enfeite: desde 2017 nenhum cliente moderno olha o
 * CN pra casar o nome do host. Sem SAN o certificado seria recusado por
 * ERR_TLS_CERT_ALTNAME_INVALID e o teste morreria por um motivo que nao tem
 * nada a ver com o que ele quer medir.
 */
function fabricarCertificado(dir, cn) {
  const key = path.join(dir, 'privkey.pem')
  const cert = path.join(dir, 'fullchain.pem')
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '2',
    '-subj', '/CN=' + cn,
    '-addext', 'subjectAltName=DNS:' + cn + ',DNS:localhost,IP:127.0.0.1',
  ], { stdio: 'ignore' })
  return { cert, key }
}

function pegar(url, opcoes) {
  return new Promise((resolve, reject) => {
    const mod = url.indexOf('https:') === 0 ? https : http
    const req = mod.get(url, Object.assign({ rejectUnauthorized: false }, opcoes || {}), (res) => {
      let corpo = ''
      res.on('data', (d) => { corpo += d })
      res.on('end', () => resolve({ status: res.statusCode, cabecalhos: res.headers, corpo }))
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(new Error('estourou o tempo')) })
  })
}

/**
 * O certificado que o servidor esta apresentando AGORA, direto do handshake.
 *
 * `maxCachedSessions: 0` NAO e detalhe. O agente padrao do Node guarda sessoes
 * TLS e as retoma nas conexoes seguintes; sessao retomada nao refaz handshake,
 * e `getPeerCertificate()` devolve o certificado que estava valendo quando a
 * sessao nasceu. A primeira versao deste teste falhava por isso — o servidor
 * JA tinha recarregado, e a sonda e que estava olhando pro passado.
 */
function espiarCertificado(porta) {
  return new Promise((resolve, reject) => {
    const agente = new https.Agent({ maxCachedSessions: 0, keepAlive: false })
    const req = https.get({
      host: '127.0.0.1', port: porta, path: '/saude', rejectUnauthorized: false, agent: agente,
    }, (res) => {
      const c = res.socket.getPeerCertificate()
      res.resume()
      resolve({ serie: c.serialNumber, dono: (c.subject && c.subject.CN) || '' })
    })
    req.on('error', reject)
  })
}

const sala = criarSala({ aoLog: () => {} })
let servidor = null
let redir = null
const diario = []          // o que o servidor foi dizendo, pra conferir depois

try {
  // --- https ---------------------------------------------------------------
  secao('HTTPS')
  const papeis = fabricarCertificado(TMP, 'minicity-rp.duckdns.org')
  servidor = subir(sala, {
    porta: PORTA, host: '127.0.0.1', tls: papeis, aoLog: (m) => diario.push(String(m)),
    intervaloCert: 250,   // no jogo e 1 h; aqui a renovacao acontece em segundos
  })
  await servidor.ouvir()

  checar('o servidor se declara seguro', servidor.seguro === true && servidor.esquema === 'https')
  checar('e um https.Server de verdade', servidor.http instanceof https.Server)

  const saude = await pegar('https://127.0.0.1:' + PORTA + '/saude')
  let corpo = null
  try { corpo = JSON.parse(saude.corpo) } catch (e) { void e }
  checar('/saude responde por https', saude.status === 200 && corpo && corpo.ok === true,
    'status=' + saude.status)

  // --- wss -----------------------------------------------------------------
  // A pergunta que este bloco responde: o WebSocket precisa de porta ou
  // servidor proprio pra virar wss? Nao. `ws` se pendura no mesmo https.Server,
  // e quem cifra e o TLS que ja esta embaixo.
  secao('WSS (mesma porta, mesmo servidor)')
  const abriu = await new Promise((resolve) => {
    const ws = new WebSocket('wss://127.0.0.1:' + PORTA, { rejectUnauthorized: false })
    const t = setTimeout(() => { try { ws.close() } catch (e) { void e } resolve(null) }, 8000)
    ws.on('open', () => {
      clearTimeout(t)
      const cifrado = !!(ws._socket && ws._socket.encrypted)
      const protocolo = ws._socket && ws._socket.getProtocol && ws._socket.getProtocol()
      ws.close()
      resolve({ cifrado, protocolo })
    })
    ws.on('error', () => { clearTimeout(t); resolve(null) })
  })
  checar('o wss:// conecta na mesma porta do https', !!abriu)
  checar('e o socket esta mesmo cifrado', abriu && abriu.cifrado === true)
  checar('falando TLS 1.2 ou melhor', abriu && /TLSv1\.[23]/.test(abriu.protocolo || ''),
    abriu && abriu.protocolo)

  const semTls = await new Promise((resolve) => {
    // ws:// num servidor TLS tem que falhar: quem tentar vai receber lixo
    // cifrado e nao um handshake. Se isto passasse, haveria um caminho em
    // claro pra dentro do servidor.
    const ws = new WebSocket('ws://127.0.0.1:' + PORTA)
    const t = setTimeout(() => { try { ws.close() } catch (e) { void e } resolve('travou') }, 4000)
    ws.on('open', () => { clearTimeout(t); ws.close(); resolve('abriu') })
    ws.on('error', () => { clearTimeout(t); resolve('recusou') })
  })
  checar('ws:// em claro NAO entra', semTls !== 'abriu', semTls)

  // --- a renovacao ---------------------------------------------------------
  // O bug que so apareceria daqui a 60 dias, quando o certbot renovar e o
  // processo continuar mostrando o papel velho ate alguem reiniciar.
  secao('RENOVACAO DO CERTBOT')
  const antes = await espiarCertificado(PORTA)
  fs.mkdirSync(path.join(TMP, 'novo'), { recursive: true })
  const novos = fabricarCertificado(path.join(TMP, 'novo'), 'minicity-rp.duckdns.org')
  fs.copyFileSync(novos.cert, papeis.cert)
  fs.copyFileSync(novos.key, papeis.key)

  let depois = antes
  for (let i = 0; i < 40 && depois.serie === antes.serie; i++) {
    await new Promise((r) => setTimeout(r, 250))
    depois = await espiarCertificado(PORTA)
  }
  checar('o certificado novo entra sozinho, sem reiniciar', depois.serie !== antes.serie,
    'serie continuou ' + antes.serie)
  checar('e ele avisa no log que recarregou',
    diario.some((l) => /certificado recarregado/.test(l)), diario.join(' | ').slice(0, 120))

  const aindaAtende = await pegar('https://127.0.0.1:' + PORTA + '/saude')
  checar('e o servidor continuou no ar durante a troca', aindaAtende.status === 200)

  // --- porta 80 ------------------------------------------------------------
  secao('PORTA 80')
  const webroot = path.join(TMP, 'webroot')
  fs.mkdirSync(path.join(webroot, '.well-known', 'acme-challenge'), { recursive: true })
  fs.writeFileSync(path.join(webroot, '.well-known', 'acme-challenge', 'proval'), 'segredo-do-acme')

  redir = subirRedirecionador({
    porta: PORTA80, host: '127.0.0.1', webroot, portaHttps: PORTA, log: () => {},
  })
  await new Promise((r) => setTimeout(r, 400))

  const red = await pegar('http://127.0.0.1:' + PORTA80 + '/qualquer/coisa?a=1')
  checar('http redireciona pro https', red.status === 301, 'status=' + red.status)
  checar('mantendo o caminho e a consulta',
    (red.cabecalhos.location || '').indexOf('https://127.0.0.1:' + PORTA + '/qualquer/coisa?a=1') === 0,
    red.cabecalhos.location)

  const acme = await pegar('http://127.0.0.1:' + PORTA80 + '/.well-known/acme-challenge/proval')
  checar('MAS o acme-challenge sai em http puro (a renovacao depende disso)',
    acme.status === 200 && acme.corpo === 'segredo-do-acme', 'status=' + acme.status)

  // --- o remendo que nao pode existir --------------------------------------
  secao('CERTIFICADO QUEBRADO')
  let subiuAssimMesmo = false
  let mensagem = ''
  try {
    subir(sala, {
      porta: PORTA + 1, host: '127.0.0.1', aoLog: () => {},
      tls: { cert: path.join(TMP, 'nao-existe.pem'), key: papeis.key },
    })
    subiuAssimMesmo = true
  } catch (e) { mensagem = e.message }
  checar('certificado faltando NAO cai pro http caladinho', subiuAssimMesmo === false)
  checar('e o erro diz onde procurar', /nao-existe\.pem/.test(mensagem) && /certbot certificates/.test(mensagem),
    mensagem.split('\n')[0])

  let erroEacces = ''
  try {
    lerCertificado({ cert: papeis.cert, key: path.join(TMP, 'sumiu.pem') })
  } catch (e) { erroEacces = e.message }
  checar('lerCertificado aponta o campo que falhou', /nao consegui ler key/.test(erroEacces),
    erroEacces.split('\n')[0])

  // --- sem ssl -------------------------------------------------------------
  secao('SEM SSL (nada muda)')
  const simples = subir(sala, { porta: PORTA + 2, host: '127.0.0.1', servirArquivos: false, aoLog: () => {} })
  await simples.ouvir()
  checar('sem tls continua http', simples.seguro === false && simples.esquema === 'http')
  const s2 = await pegar('http://127.0.0.1:' + (PORTA + 2) + '/saude')
  checar('e /saude responde igual', s2.status === 200)
  await simples.parar()

  console.log('')
  console.log(falhas ? (falhas + ' caso(s) falharam') : ('tudo certo — ' + ok + ' casos'))
} catch (e) {
  console.error('o teste explodiu: ' + (e && e.stack ? e.stack : e))
  falhas++
} finally {
  try { if (redir) redir.close() } catch (e) { void e }
  try { if (servidor) await servidor.parar() } catch (e) { void e }
  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (e) { void e }
  void ROOT
}
process.exit(falhas ? 1 : 0)
