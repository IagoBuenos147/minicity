// Garante que o dev server esta de pe antes de um teste ou uma foto.
//
// Por que isto existe: rodar varias ferramentas em sequencia (cada uma sobe um
// Chrome headless que renderiza por software e come memoria) derruba o vite da
// 5173 de vez em quando. Antes, cada ferramenta morria com ERR_CONNECTION_REFUSED
// e a rodada inteira se perdia. Agora cada uma levanta o servidor se precisar.
//
//   import { garantirServidor } from './servidor-dev.mjs'
//   const url = await garantirServidor()
//
// Se o servidor ja estava no ar (subido pelo dono do projeto com `npm run dev`),
// esta funcao NAO sobe outro nem mexe nele: so confirma e devolve a URL.

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Responde na porta? (true assim que o vite devolve qualquer coisa) */
async function noAr(url) {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 2500)
    const r = await fetch(url, { signal: c.signal })
    clearTimeout(t)
    return r.ok || r.status < 500
  } catch (err) { void err; return false }
}

/**
 * @param {string} url   padrao: GAME_URL ou http://localhost:5173
 * @param {number} espera segundos de paciencia depois de subir
 * @returns {Promise<string>} a URL que respondeu
 */
export async function garantirServidor(url, espera = 40) {
  const alvo = url || process.env.GAME_URL || 'http://localhost:5173'
  if (await noAr(alvo)) return alvo

  const porta = Number(new URL(alvo).port || 80)
  console.log('dev server fora do ar; subindo um na porta ' + porta + '...')

  // Chamamos o vite.js pelo proprio node, e nao "npx": no Windows o npx e um
  // .cmd e o spawn sem shell devolve EINVAL. Assim tambem nao ha shell no meio.
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
  // detached + unref: o vite tem que sobreviver a ESTE processo, senao a
  // proxima ferramenta da rodada encontra a porta vazia de novo.
  const filho = spawn(
    process.execPath,
    [vite, '--port', String(porta), '--host', '127.0.0.1'],
    { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true },
  )
  filho.unref()

  for (let i = 0; i < espera * 2; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await noAr(alvo)) {
      console.log('dev server no ar.')
      return alvo
    }
  }
  throw new Error('nao consegui subir o dev server em ' + alvo)
}

export default garantirServidor
