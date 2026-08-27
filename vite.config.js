import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// Plugin de desenvolvimento: recebe um data-URL do canvas e grava em shots/.
// Serve so pra inspecionar o visual do jogo durante a producao; nao vai pro build.
function screenshotPlugin() {
  return {
    name: 'dev-screenshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('POST only') }
        const url = new URL(req.url, 'http://x')
        const name = (url.searchParams.get('name') || 'shot').replace(/[^a-z0-9_-]/gi, '')
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (c) => { body += c })
        req.on('end', () => {
          const m = /^data:image\/(png|jpeg);base64,(.*)$/s.exec(body)
          if (!m) { res.statusCode = 400; return res.end('data url invalida') }
          const dir = path.resolve(process.cwd(), 'shots')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, name + '.' + (m[1] === 'jpeg' ? 'jpg' : 'png'))
          fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
          res.setHeader('content-type', 'text/plain')
          res.end(file)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [screenshotPlugin()],
  server: { port: 5173, open: false },
  build: { target: 'es2020', outDir: 'dist', sourcemap: false },
})
