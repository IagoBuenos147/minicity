// ---------------------------------------------------------------------------
// BARRA DE ITENS (hotbar) em DOM puro, no estilo do HUD (fundo escuro
// translucido com blur, cantos arredondados, Trebuchet MS).
//
// Por que DOM e nao canvas do jogo: e UI plana, muda pouco, e o navegador ja
// faz blur/sombra/transicao de graca. O hud.js segue essa mesma linha; aqui a
// gente NAO mexe nele, so imita o visual e usa um id proprio pra nao brigar.
//
// Quem decide o que esta selecionado e quem chama selecionar(): o main
// encaminha as teclas 1/2/3. Este modulo so desenha e avisa via aoTrocar.
//
//   const hb = criarHotbar({ aoTrocar: (i, chave) => equipar(chave) })
//   hb.definir(0, { chave: 'maos',  nome: 'Maos' })
//   hb.definir(1, { chave: 'anel',  nome: 'Anel verde' })
//   hb.definir(2, { chave: 'portal', nome: 'Arma de portal', icone: 'portal' })
//   hb.marcarDisponivel(2, false)   // ainda nao pegou: apagado e com cadeado
//   hb.selecionar(0)
// ---------------------------------------------------------------------------

const CSS = `
#hotbar, #hotbar * { box-sizing: border-box; }
#hotbar {
  position: fixed; left: 50%; bottom: 22px;
  transform: translateX(-50%);
  z-index: 21;
  display: flex; gap: 10px;
  pointer-events: none;
  user-select: none;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f2f5f8;
  -webkit-font-smoothing: antialiased;
}
#hotbar.off { opacity: 0; transform: translate(-50%, 12px); }
#hotbar { transition: opacity .18s ease, transform .18s ease; }

#hotbar .slot {
  position: relative;
  width: 66px; height: 66px;
  border-radius: 12px;
  background: rgba(14, 17, 24, 0.52);
  border: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(9px) saturate(1.1);
  -webkit-backdrop-filter: blur(9px) saturate(1.1);
  box-shadow: 0 6px 22px rgba(0,0,0,0.32);
  display: flex; align-items: center; justify-content: center;
  transition: transform .14s ease, border-color .14s ease,
              box-shadow .14s ease, background .14s ease, opacity .14s ease;
}

/* numero do slot, canto superior esquerdo, igual jogo de sobrevivencia */
#hotbar .slot .num {
  position: absolute; top: 3px; left: 6px;
  font-size: 11px; font-weight: bold; line-height: 1;
  color: #9fb6cc; opacity: .9;
  text-shadow: 0 1px 2px rgba(0,0,0,.6);
}

/* o icone e um <canvas> desenhado a mao (nada de imagem externa) */
#hotbar .slot canvas {
  width: 44px; height: 44px;
  display: block;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,.45));
  transition: filter .14s ease, opacity .14s ease;
}

/* nome do item, so aparece no slot selecionado (evita poluir a tela) */
#hotbar .slot .nome {
  position: absolute; left: 50%; bottom: -20px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 12px; letter-spacing: .2px;
  color: #dbe6f2;
  text-shadow: 0 1px 3px rgba(0,0,0,.75);
  opacity: 0; transition: opacity .14s ease;
}

/* --- selecionado: borda acesa e leve escala (destaque claro) --- */
#hotbar .slot.sel {
  transform: translateY(-4px) scale(1.09);
  border-color: rgba(255,255,255,0.78);
  background: rgba(30, 38, 52, 0.62);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.30),
              0 0 16px rgba(150,200,255,0.35),
              0 10px 26px rgba(0,0,0,0.42);
}
#hotbar .slot.sel .num { color: #ffffff; opacity: 1; }
#hotbar .slot.sel .nome { opacity: 1; }

/* --- bloqueado: apagado, sem cor, com cadeado por cima --- */
#hotbar .slot.travado canvas { filter: grayscale(1) brightness(.55); opacity: .5; }
#hotbar .slot.travado { opacity: .62; }
#hotbar .slot.travado.sel { transform: none; box-shadow: 0 6px 22px rgba(0,0,0,0.32); }
#hotbar .slot .cadeado {
  position: absolute; right: 4px; bottom: 3px;
  width: 15px; height: 15px;
  opacity: 0; transition: opacity .14s ease;
}
#hotbar .slot.travado .cadeado { opacity: .85; }

/* piscada rapida quando o item e liberado */
@keyframes hbLiberou {
  0%   { box-shadow: 0 0 0 0 rgba(140,255,180,0.0); }
  35%  { box-shadow: 0 0 0 3px rgba(140,255,180,0.55), 0 0 22px rgba(120,255,170,0.55); }
  100% { box-shadow: 0 6px 22px rgba(0,0,0,0.32); }
}
#hotbar .slot.liberou { animation: hbLiberou .7s ease-out; }
`

// --- desenho dos icones ------------------------------------------------------
// Tudo em canvas 2D, num quadrado 0..1 escalado pelo tamanho. Motivo: sem
// asset externo, e um canvas pequeno custa nada (desenhado uma vez so).

function cadeadoSVG() {
  // cadeado como SVG inline: nitido em qualquer DPI e nao precisa de canvas
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  s.setAttribute('viewBox', '0 0 24 24')
  s.setAttribute('class', 'cadeado')
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', 'M7 10V7.5a5 5 0 0 1 10 0V10')
  p.setAttribute('fill', 'none')
  p.setAttribute('stroke', '#e7edf5')
  p.setAttribute('stroke-width', '2.4')
  const b = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  b.setAttribute('x', '4.5'); b.setAttribute('y', '10')
  b.setAttribute('width', '15'); b.setAttribute('height', '10.5')
  b.setAttribute('rx', '2.2')
  b.setAttribute('fill', '#e7edf5')
  s.appendChild(p); s.appendChild(b)
  return s
}

function caminhoArredondado(c, x, y, w, h, r) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/** Mao aberta vista de frente: palma + 4 dedos + polegar. */
function iconeMao(c, S) {
  const pele = '#f0c9a4'
  const linha = 'rgba(60,32,18,0.55)'
  c.lineJoin = 'round'
  c.lineCap = 'round'
  c.fillStyle = pele
  c.strokeStyle = linha
  c.lineWidth = 0.045 * S
  // palma
  caminhoArredondado(c, 0.28 * S, 0.42 * S, 0.42 * S, 0.40 * S, 0.13 * S)
  c.fill(); c.stroke()
  // 4 dedos, o do meio mais alto (silhueta le melhor que dedos iguais)
  const alturas = [0.30, 0.36, 0.33, 0.26]
  for (let i = 0; i < 4; i++) {
    const x = (0.30 + i * 0.10) * S
    const h = alturas[i] * S
    caminhoArredondado(c, x, 0.46 * S - h, 0.085 * S, h + 0.10 * S, 0.042 * S)
    c.fill(); c.stroke()
  }
  // polegar, saindo pra esquerda
  c.save()
  c.translate(0.30 * S, 0.60 * S)
  c.rotate(-0.95)
  caminhoArredondado(c, -0.20 * S, -0.05 * S, 0.24 * S, 0.10 * S, 0.05 * S)
  c.fill(); c.stroke()
  c.restore()
}

/** Anel verde: aro brilhante visto de frente, com pedra no topo. */
function iconeAnel(c, S) {
  const cx = 0.5 * S, cy = 0.56 * S, r = 0.26 * S
  c.save()
  c.shadowColor = 'rgba(90,255,150,0.9)'
  c.shadowBlur = 0.16 * S
  // aro: dois tracos concentricos pra dar volume de metal
  c.lineWidth = 0.085 * S
  c.strokeStyle = '#2fbf6a'
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke()
  c.shadowBlur = 0
  c.lineWidth = 0.035 * S
  c.strokeStyle = '#9dffc4'
  c.beginPath(); c.arc(cx, cy - 0.012 * S, r, Math.PI * 0.95, Math.PI * 1.85); c.stroke()
  c.restore()
  // pedra: losango claro no topo do aro
  c.save()
  c.translate(cx, cy - r)
  c.rotate(Math.PI / 4)
  const g = c.createLinearGradient(-0.09 * S, -0.09 * S, 0.09 * S, 0.09 * S)
  g.addColorStop(0, '#e6fff0')
  g.addColorStop(1, '#39e07f')
  c.fillStyle = g
  c.shadowColor = 'rgba(120,255,180,0.95)'
  c.shadowBlur = 0.14 * S
  caminhoArredondado(c, -0.075 * S, -0.075 * S, 0.15 * S, 0.15 * S, 0.025 * S)
  c.fill()
  c.restore()
}

/**
 * Arma de portal: corpo branco alongado, punho preto embaixo, botao vermelho
 * em cima e o frasco de liquido verde na ponta (a leitura do icone depende
 * desse verde brilhante, entao ele ganha halo).
 */
function iconePortalGun(c, S) {
  c.save()
  // inclina de leve: arma reta demais fica sem graca no icone
  c.translate(0.5 * S, 0.5 * S)
  c.rotate(-0.13)
  c.translate(-0.5 * S, -0.5 * S)

  c.lineJoin = 'round'
  c.lineCap = 'round'
  const borda = 'rgba(34,42,54,0.62)'

  // punho preto (bulbo) embaixo: desenhado antes do corpo pra parecer que
  // nasce dele, sem linha de emenda no meio
  c.fillStyle = '#191b20'
  c.beginPath()
  c.moveTo(0.24 * S, 0.58 * S)
  c.bezierCurveTo(0.15 * S, 0.86 * S, 0.28 * S, 0.97 * S, 0.40 * S, 0.92 * S)
  c.bezierCurveTo(0.51 * S, 0.87 * S, 0.50 * S, 0.70 * S, 0.47 * S, 0.58 * S)
  c.closePath()
  c.fill()

  // corpo branco alongado, achatado, com quina chanfrada em cima
  const g = c.createLinearGradient(0, 0.40 * S, 0, 0.66 * S)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.55, '#edf1f5')
  g.addColorStop(1, '#b4bdc8')
  c.fillStyle = g
  c.strokeStyle = borda
  c.lineWidth = 0.036 * S
  c.beginPath()
  c.moveTo(0.11 * S, 0.50 * S)
  c.lineTo(0.19 * S, 0.415 * S)   // chanfro da quina de cima
  c.lineTo(0.80 * S, 0.415 * S)
  c.lineTo(0.88 * S, 0.48 * S)
  c.lineTo(0.88 * S, 0.635 * S)
  c.lineTo(0.11 * S, 0.685 * S)
  c.closePath()
  c.fill(); c.stroke()

  // ranhura/junta correndo pelo comprimento
  c.strokeStyle = 'rgba(60,70,84,0.35)'
  c.lineWidth = 0.024 * S
  c.beginPath()
  c.moveTo(0.16 * S, 0.575 * S); c.lineTo(0.84 * S, 0.550 * S)
  c.stroke()

  // botao vermelho retangular em cima, perto do meio
  c.fillStyle = '#df2f26'
  c.strokeStyle = 'rgba(90,10,6,0.5)'
  c.lineWidth = 0.018 * S
  caminhoArredondado(c, 0.33 * S, 0.372 * S, 0.19 * S, 0.058 * S, 0.022 * S)
  c.fill(); c.stroke()

  // frasco na ponta da frente, virado pra cima, com liquido verde brilhante.
  // O halo e o que faz o icone ser reconhecido a 44 px, entao e generoso.
  c.save()
  c.shadowColor = 'rgba(70,255,130,0.95)'
  c.shadowBlur = 0.28 * S
  const gv = c.createLinearGradient(0.70 * S, 0.10 * S, 0.70 * S, 0.44 * S)
  gv.addColorStop(0, '#e6fff0')
  gv.addColorStop(0.38, '#4dfb8c')
  gv.addColorStop(1, '#0f9b4a')
  c.fillStyle = gv
  caminhoArredondado(c, 0.605 * S, 0.115 * S, 0.195 * S, 0.34 * S, 0.09 * S)
  c.fill()
  c.restore()
  c.strokeStyle = 'rgba(20,90,50,0.55)'
  c.lineWidth = 0.022 * S
  caminhoArredondado(c, 0.605 * S, 0.115 * S, 0.195 * S, 0.34 * S, 0.09 * S)
  c.stroke()
  // tampa metalica do frasco
  c.fillStyle = '#dde3ea'
  c.strokeStyle = borda
  c.lineWidth = 0.02 * S
  caminhoArredondado(c, 0.585 * S, 0.062 * S, 0.235 * S, 0.075 * S, 0.028 * S)
  c.fill(); c.stroke()
  // o "fluido" claro girando no meio + brilho do vidro na lateral
  c.fillStyle = 'rgba(255,255,255,0.92)'
  c.beginPath()
  c.ellipse(0.712 * S, 0.275 * S, 0.038 * S, 0.055 * S, 0.6, 0, Math.PI * 2)
  c.fill()
  c.strokeStyle = 'rgba(255,255,255,0.7)'
  c.lineWidth = 0.026 * S
  c.beginPath()
  c.moveTo(0.648 * S, 0.19 * S); c.lineTo(0.648 * S, 0.33 * S)
  c.stroke()
  c.restore()
}

const ICONES = {
  // revolver de lado: coronha, armacao, tambor e cano
  revolver(c, S) {
    const u = S / 100
    c.strokeStyle = '#c9d2df'; c.fillStyle = '#8d95a3'; c.lineWidth = 2 * u
    // cano
    c.fillRect(48 * u, 40 * u, 34 * u, 9 * u)
    // armacao
    c.fillRect(30 * u, 38 * u, 22 * u, 15 * u)
    // tambor
    c.beginPath(); c.arc(40 * u, 46 * u, 9 * u, 0, 7); c.fill()
    c.strokeStyle = '#5c6472'; c.stroke()
    // camaras
    c.fillStyle = '#3c424d'
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      c.beginPath(); c.arc(40 * u + Math.cos(a) * 5 * u, 46 * u + Math.sin(a) * 5 * u, 1.7 * u, 0, 7); c.fill()
    }
    // coronha de madeira
    c.fillStyle = '#7a4a28'
    c.beginPath()
    c.moveTo(30 * u, 50 * u); c.lineTo(24 * u, 74 * u)
    c.lineTo(34 * u, 76 * u); c.lineTo(38 * u, 52 * u)
    c.closePath(); c.fill()
    // gatilho
    c.strokeStyle = '#5c6472'; c.lineWidth = 1.6 * u
    c.beginPath(); c.arc(41 * u, 58 * u, 5 * u, 0.1, 2.9); c.stroke()
  },

  maos: iconeMao,
  mao: iconeMao,
  anel: iconeAnel,
  portal: iconePortalGun,
  'portal-gun': iconePortalGun,
  arma: iconePortalGun,
}

/** Cria o <canvas> do icone. `icone` = nome conhecido ou funcao (ctx, S). */
function fazerIcone(icone, chave) {
  const cv = document.createElement('canvas')
  const S = 44
  // 2x pra nao serrilhar em tela comum; em tela retina o navegador ja escala
  const dpr = Math.min(3, Math.max(2, (window.devicePixelRatio || 1) * 2))
  cv.width = Math.round(S * dpr)
  cv.height = Math.round(S * dpr)
  const c = cv.getContext('2d')
  c.scale(dpr, dpr)
  const fn = typeof icone === 'function'
    ? icone
    : (ICONES[icone] || ICONES[chave] || null)
  if (fn) fn(c, S)
  return cv
}

const PADRAO = [
  { chave: 'maos', nome: 'Maos', icone: 'maos' },
  { chave: 'anel', nome: 'Anel verde', icone: 'anel' },
  { chave: 'portal', nome: 'Arma de portal', icone: 'portal' },
  { chave: 'revolver', nome: 'Revolver', icone: 'revolver' },
]

/**
 * @param {object} opts
 * @param {(indice:number, chave:string)=>void} [opts.aoTrocar] avisado a cada troca
 * @param {number} [opts.slots] quantidade de slots (padrao 4)
 * @param {HTMLElement} [opts.pai] onde pendurar (padrao document.body)
 */
export function criarHotbar({ aoTrocar, slots = 4, pai } = {}) {
  if (!document.getElementById('hotbar-style')) {
    const s = document.createElement('style')
    s.id = 'hotbar-style'
    s.textContent = CSS
    document.head.appendChild(s)
  }

  const root = document.createElement('div')
  root.id = 'hotbar'
  ;(pai || document.body).appendChild(root)

  // cada slot guarda seu estado num objeto proprio; nada e achado por indice
  // de DOM na hora de atualizar (o indice logico e a unica fonte de verdade)
  const itens = []

  for (let i = 0; i < slots; i++) {
    const el = document.createElement('div')
    el.className = 'slot'

    const num = document.createElement('span')
    num.className = 'num'
    num.textContent = String(i + 1)
    el.appendChild(num)

    const nome = document.createElement('span')
    nome.className = 'nome'
    el.appendChild(nome)

    const cad = cadeadoSVG()
    el.appendChild(cad)

    root.appendChild(el)
    itens.push({ el, nome, canvas: null, chave: null, disponivel: true })

    const p = PADRAO[i]
    if (p) definirInterno(i, p)
  }

  let selecionado = -1

  function definirInterno(i, { chave, nome, icone } = {}) {
    const it = itens[i]
    if (!it) return
    it.chave = chave || null
    it.nome.textContent = nome || ''
    if (it.canvas) it.el.removeChild(it.canvas)
    it.canvas = fazerIcone(icone, chave)
    // o canvas entra antes do cadeado pra o cadeado ficar por cima
    it.el.insertBefore(it.canvas, it.el.querySelector('.cadeado'))
  }

  const api = {
    root,

    get selecionado() { return selecionado },

    /** Registra (ou troca) o item de um slot. */
    definir(i, dados) {
      definirInterno(i, dados)
      return api
    },

    /**
     * Seleciona um slot. Slot travado ou vazio e recusado (retorna false),
     * assim o main pode dar um toast de "voce ainda nao pegou isso".
     */
    selecionar(i) {
      const it = itens[i]
      if (!it || !it.chave || !it.disponivel) return false
      if (i === selecionado) return true
      selecionado = i
      for (let k = 0; k < itens.length; k++) {
        itens[k].el.classList.toggle('sel', k === i)
      }
      if (typeof aoTrocar === 'function') aoTrocar(i, it.chave)
      return true
    },

    /** Marca se o jogador ja pegou o item; false = apagado com cadeado. */
    marcarDisponivel(i, ok) {
      const it = itens[i]
      if (!it) return api
      const antes = it.disponivel
      it.disponivel = !!ok
      it.el.classList.toggle('travado', !it.disponivel)
      // piscada verde so na transicao travado -> livre
      if (!antes && it.disponivel) {
        it.el.classList.remove('liberou')
        void it.el.offsetWidth   // reinicia a animacao CSS
        it.el.classList.add('liberou')
      }
      // se travaram o que estava na mao, cai pro slot 1 (Maos)
      if (!it.disponivel && selecionado === i) {
        selecionado = -1
        it.el.classList.remove('sel')
        api.selecionar(0)
      }
      return api
    },

    /** Acha o slot de uma chave ('portal', 'anel'...). -1 se nao tem. */
    indiceDe(chave) {
      for (let i = 0; i < itens.length; i++) if (itens[i].chave === chave) return i
      return -1
    },

    /** Esconde/mostra a barra inteira (menu aberto, tela inicial, etc). */
    mostrar(v) { root.classList.toggle('off', !v) },

    dispose() {
      if (root.parentNode) root.parentNode.removeChild(root)
      itens.length = 0
    },
  }

  // comeca nas maos: sempre ha algo equipado, nunca "nada selecionado"
  api.selecionar(0)

  return api
}
