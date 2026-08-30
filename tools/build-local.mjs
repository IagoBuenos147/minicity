// JOGO NUM ARQUIVO SO, PRA ABRIR COM DOIS CLIQUES.
//
//   npm run local     ->  MiniCityRP.html na raiz do projeto
//
// Por que isto existe: o `npm run dev` e o `npm run build` produzem MODULOS ES
// (<script type="module">), e navegador nenhum carrega modulo de `file://` — a
// origem de um arquivo local e opaca e o CORS barra. Quem abrisse o index.html
// direto veria uma tela preta e um erro de CORS no console, sem nada mais.
//
// A saida sao duas mudancas no empacotamento:
//
//   1. FORMATO IIFE em vez de modulo. Script classico carrega de file:// sem
//      pedir licenca a ninguem. Como IIFE nao aceita divisao em pedacos, o
//      `inlineDynamicImports` junta tudo — inclusive o import.meta.glob dos
//      veiculos, que e o que hoje gera os pedacos carro/moto/skate.
//   2. O JS ENTRA DENTRO DO HTML. Um arquivo so, sem pasta de assets do lado,
//      sem caminho relativo pra quebrar quando alguem mover o arquivo, e da pra
//      mandar por WhatsApp pra alguem testar.
//
// O que NAO funciona assim, e e proposital:
//   - MULTIJOGADOR. O servidor (servidor.js) continua sendo `npm run online`.
//     O jogo abre no modo solo normalmente; so nao da pra entrar em sala.
//   - As ferramentas de foto e os testes, que falam com o dev server.
//
// O resto — cidade, personagem, customizacao, veiculos, cassino, save — roda.

import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TMP = path.join(RAIZ, '.local-build')
const SAIDA = path.join(RAIZ, 'MiniCityRP.html')

await build({
  root: RAIZ,
  // configFile: false pra NAO herdar o vite.config.js: la o plugin de
  // screenshot e o outDir sao do fluxo normal, e misturar os dois so cria
  // surpresa quando alguem mexer num deles.
  configFile: false,
  base: './',
  logLevel: 'warn',
  build: {
    target: 'es2020',
    outDir: TMP,
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: 1024 * 1024 * 8,   // nada de arquivo solto ao lado
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'jogo.js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})

const htmlPath = path.join(TMP, 'index.html')
let html = fs.readFileSync(htmlPath, 'utf8')

// Acha a tag de script gerada pelo Vite e troca pelo conteudo do arquivo.
// `type="module"` e `crossorigin` saem junto: os dois voltariam a exigir CORS,
// que e exatamente o que este build existe pra evitar.
const tag = /<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/
const achou = html.match(tag)
if (!achou) throw new Error('nao achei a tag <script src> no html gerado')

const js = fs.readFileSync(path.join(TMP, achou[1].replace(/^\.?\//, '')), 'utf8')
// `</script>` dentro de uma string do bundle fecharia a tag no meio do codigo.
const seguro = js.replace(/<\/script>/gi, '<\\/script>')
// A SUBSTITUICAO E POR FUNCAO, e nao por string. String.replace interpreta
// `$&`, `$'` e `$1` dentro do texto de troca — e um bundle minificado e cheio
// de `$`. Trocando por string, o codigo saia CORROMPIDO e o navegador reclamava
// de um `<` inesperado, que parece erro de HTML e e erro de escape.
//
// E ELE VAI PRO FIM DO BODY, nao pro lugar onde a tag estava.
//
// O Vite poe a tag do bundle no <head>, e isso funciona la porque `type=module`
// e adiado automaticamente: o codigo so roda depois do HTML todo. Um script
// INLINE e classico roda na hora em que o parser chega nele — antes de
// `<div id="app">` existir. O sintoma e um `appendChild of null` no primeiro
// quadro, que nao parece nada com "script no lugar errado".
html = html.replace(tag, () => '')
const marca = '</body>'
const bloco = '<script>\n' + seguro + '\n</script>\n'
html = html.includes(marca)
  ? html.replace(marca, () => bloco + marca)
  : html + bloco

if (/<script\b[^>]*\bsrc=/.test(html)) {
  throw new Error('sobrou <script src> no html: o arquivo nao ficou autocontido')
}

// Um aviso curto pra quem abrir e estranhar a falta do multijogador.
html = html.replace('</title>', '</title>\n<!-- Build LOCAL: um arquivo so, abre por file://. Multijogador so pelo servidor (npm run online). -->')

fs.writeFileSync(SAIDA, html)
fs.rmSync(TMP, { recursive: true, force: true })

const mb = (fs.statSync(SAIDA).size / (1024 * 1024)).toFixed(2)
console.log('pronto: ' + SAIDA + '  (' + mb + ' MB)')
console.log('e so dar dois cliques nele.')
