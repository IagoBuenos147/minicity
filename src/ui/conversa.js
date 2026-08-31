import * as THREE from 'three'

// ---------------------------------------------------------------------------
// src/ui/conversa.js — FALAR COM ALGUEM NA RUA.
//
// O formato veio de uma captura que o dono mandou: nome/saudacao flutuando
// sobre a cabeca, uma barra no rodape com as opcoes numeradas entre colchetes,
// um aviso em vermelho italico do lado direito quando a opcao esta trancada, e
// "Esc Back" no canto de baixo. Nao e um balao de fala — e uma barra de escolha.
//
// POR QUE NAO E O src/ui/dialogo.js. Aquele e o balao COMPARTILHADO: quem manda
// nele e o servidor (ver REDE.md), todo mundo por perto ve a mesma linha ao
// mesmo tempo e so quem iniciou tem botao. E o certo pros NPCs do contrato de
// rede. Este aqui e conversa LOCAL com gente de rua que o servidor nao conhece:
// nao ha pacote, nao ha sincronizacao, e o formato pedido e outro. Enfiar os
// dois no mesmo arquivo faria o modulo de rede crescer uma segunda vida.
//
// A CAMERA E METADE DO PEDIDO. Apertar E nao abre so um texto: a camera CENTRA
// no NPC, suavemente. Isso e feito girando a camera do jogador na direcao dele
// um pouco por quadro (ver `mirar`), e nao teleportando o olhar — teleportar
// enjoa e tira do jogador a nocao de onde ele estava.
// ---------------------------------------------------------------------------

const CSS = `
.mcrp-conversa, .mcrp-conversa * { box-sizing: border-box; }
.mcrp-conversa {
  position: fixed; inset: 0; z-index: 30;
  pointer-events: none; user-select: none;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f4f6f8;
  opacity: 0; transition: opacity .16s ease;
}
.mcrp-conversa.on { opacity: 1; }

/* --- saudacao flutuando sobre a cabeca ---
   Sem caixa e sem fundo, so o texto com contorno preto: na captura ela e um
   rotulo solto no mundo, nao um balao. O contorno e o que a mantem legivel
   contra o ceu claro e contra a parede escura sem precisar de painel. */
.mcrp-conversa .saud {
  position: absolute; transform: translate(-50%, -50%);
  font-size: 19px; font-weight: bold; letter-spacing: .2px;
  text-shadow:
    -2px -2px 0 rgba(0,0,0,.85),  2px -2px 0 rgba(0,0,0,.85),
    -2px  2px 0 rgba(0,0,0,.85),  2px  2px 0 rgba(0,0,0,.85),
     0    3px 6px rgba(0,0,0,.55);
  white-space: nowrap;
  opacity: 0; transition: opacity .2s ease;
}
.mcrp-conversa.on .saud { opacity: 1; }

/* --- a barra de opcoes, no rodape ---
   Uma faixa escura translucida por opcao, empilhadas e centradas. A largura
   acompanha o texto (nao e uma barra de tela cheia): opcao curta em faixa larga
   fica com um vazio no meio que parece defeito. */
.mcrp-conversa .barra {
  /* 22%: a BARRA DE ITENS do HUD mora no rodape (ver #hud-barra em ui/hud.js) e
     em 12% as opcoes encostavam nela. As duas sao clicaveis, e duas coisas
     clicaveis grudadas e clique errado na certa. */
  position: absolute; left: 50%; bottom: 22%;
  transform: translateX(-50%);
  display: flex; flex-direction: column; gap: 6px; align-items: center;
}
.mcrp-conversa .op {
  display: flex; align-items: center; gap: 12px;
  padding: 7px 18px 7px 14px;
  background: rgba(12, 14, 18, 0.78);
  border-radius: 3px;
  font-size: 16px; line-height: 1.2;
  pointer-events: auto; cursor: pointer;
  transition: background .12s ease;
}
.mcrp-conversa .op:hover { background: rgba(30, 36, 46, 0.88); }
.mcrp-conversa .op .n { color: #b9c2cf; font-style: italic; }
.mcrp-conversa .op .txt { flex: 1 1 auto; }
/* o aviso em vermelho: mesma linha, empurrado pra direita, italico e caixa
   alta — e a marca do formato da captura */
.mcrp-conversa .op .trava {
  color: #d64545; font-style: italic; font-weight: bold;
  text-transform: uppercase; font-size: 13px; letter-spacing: .04em;
  margin-left: 18px;
}
.mcrp-conversa .op.travada { cursor: default; }
.mcrp-conversa .op.travada .txt { color: #9aa3ae; }

/* --- a RESPOSTA do NPC ---
   Mesma faixa das opcoes, sem numero e em italico: e fala, nao escolha. O
   contraste entre as duas e o que diz ao jogador quando e a vez dele. */
.mcrp-conversa .fala {
  max-width: 620px;
  padding: 9px 20px;
  background: rgba(12, 14, 18, 0.86);
  border-radius: 3px;
  border-left: 3px solid rgba(255,255,255,.35);
  font-size: 16px; line-height: 1.35; font-style: italic;
  color: #e9eef4;
  margin-bottom: 4px;
}

/* --- Esc Back --- */
.mcrp-conversa .sair {
  position: absolute; left: 26px; bottom: 26px;
  display: flex; align-items: center; gap: 10px;
  font-size: 15px;
}
.mcrp-conversa .sair b {
  padding: 3px 9px; border-radius: 4px;
  background: rgba(255,255,255,.90); color: #14181f;
  font-size: 13px; font-weight: bold;
}
.mcrp-conversa .sair i { font-style: italic; color: #e7ecf2; }
`

/** Menor diferenca entre dois angulos, em (-PI, PI]. */
function deltaAngulo(de, para) {
  let d = (para - de + Math.PI) % (Math.PI * 2)
  if (d < 0) d += Math.PI * 2
  return d - Math.PI
}

function damp(cur, alvo, lambda, dt) {
  return cur + (alvo - cur) * (1 - Math.exp(-lambda * dt))
}

/**
 * @param dep.camera  a camera do jogo (pra projetar a saudacao na tela)
 * @param dep.player  o controller: quem gira a camera e quem trava o jogador
 */
export function criarConversa({ camera, player } = {}) {
  if (!document.getElementById('mcrp-conversa-css')) {
    const s = document.createElement('style')
    s.id = 'mcrp-conversa-css'
    s.textContent = CSS
    document.head.appendChild(s)
  }

  const raiz = document.createElement('div')
  raiz.className = 'mcrp-conversa'
  const elSaud = document.createElement('div')
  elSaud.className = 'saud'
  const elBarra = document.createElement('div')
  elBarra.className = 'barra'
  const elSair = document.createElement('div')
  elSair.className = 'sair'
  elSair.innerHTML = '<b>Esc</b><i>Voltar</i>'
  raiz.appendChild(elSaud)
  raiz.appendChild(elBarra)
  raiz.appendChild(elSair)
  document.body.appendChild(raiz)

  let aberta = false
  let ficha = null            // { nome, saudacao, opcoes, alvo }
  // A RESPOSTA DO NPC FICA NA BARRA, e nao num toast.
  //
  // A primeira versao mandava a resposta pro hud.toast, e toast mora no CANTO
  // SUPERIOR DIREITO: na tela, o jogador via o NPC centralizado com a conversa
  // acontecendo do outro lado do quadro. Dialogo tem que sair de onde a boca
  // esta, ou pelo menos de onde as opcoes estavam.
  let resposta = null
  const _p = new THREE.Vector3()

  function pintar() {
    elBarra.innerHTML = ''
    if (!ficha) return
    elSaud.textContent = ficha.saudacao || ficha.nome || ''

    // ESTADO DE RESPOSTA: a fala do NPC e uma unica saida numerada. Numerada de
    // proposito — a mao do jogador ja esta na fileira de numeros, e obrigar ele
    // a procurar o Esc pra sair de cada linha quebraria o ritmo.
    if (resposta) {
      const f = document.createElement('div')
      f.className = 'fala'
      f.textContent = resposta
      elBarra.appendChild(f)
      const el = document.createElement('div')
      el.className = 'op'
      el.innerHTML = '<span class="n">[1]</span><span class="txt">Ate mais.</span>'
      el.addEventListener('click', () => api.fechar())
      elBarra.appendChild(el)
      return
    }

    const ops = ficha.opcoes || []
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i]
      const el = document.createElement('div')
      el.className = 'op' + (o.trava ? ' travada' : '')
      const n = document.createElement('span')
      n.className = 'n'
      n.textContent = '[' + (i + 1) + ']'
      const t = document.createElement('span')
      t.className = 'txt'
      t.textContent = o.txt
      el.appendChild(n)
      el.appendChild(t)
      if (o.trava) {
        const tr = document.createElement('span')
        tr.className = 'trava'
        tr.textContent = o.trava
        el.appendChild(tr)
      }
      el.addEventListener('click', () => escolher(i))
      elBarra.appendChild(el)
    }
  }

  function escolher(i) {
    if (!aberta || !ficha) return
    // no estado de resposta so existe a saida
    if (resposta) { api.fechar(); return }
    const o = (ficha.opcoes || [])[i]
    if (!o) return
    // Opcao trancada NAO fecha a conversa: o jogador clicou pra ler o porque, e
    // fechar na cara dele esconderia justamente o aviso em vermelho.
    if (o.trava) return
    if (typeof o.aoEscolher === 'function') o.aoEscolher()
    if (o.resposta) { resposta = o.resposta; pintar(); return }
    api.fechar()
  }

  function aoTeclar(e) {
    if (!aberta) return
    if (e.code === 'Escape') { e.preventDefault(); api.fechar(); return }
    const m = /^Digit([1-9])$/.exec(e.code)
    if (m) { e.preventDefault(); escolher(Number(m[1]) - 1) }
  }

  /**
   * GIRA A CAMERA NA DIRECAO DO NPC, um pouco por quadro.
   *
   * Usa `girarCamera` (que mexe SO na camera) e nao o setter de yaw — aquele
   * realinha o CORPO junto, e o jogador giraria no lugar durante a conversa.
   *
   * O lambda de 6 da uns 0,4 s pra chegar: rapido o bastante pra parecer
   * resposta ao E, lento o bastante pra ler como camera de cinema e nao como
   * corte seco.
   */
  function mirar(dt) {
    if (!ficha || !ficha.alvo || !player) return
    ficha.alvo.getWorldPosition(_p)
    const dx = _p.x - player.position.x
    const dz = _p.z - player.position.z
    const dist = Math.hypot(dx, dz)
    if (dist < 0.05) return

    // O yaw do jogo mede a camera OLHANDO PRA -Z (ver o controller), entao a
    // direcao do NPC vira atan2 com os sinais trocados.
    const yawAlvo = Math.atan2(-dx, -dz)
    const dYaw = deltaAngulo(player.yaw, yawAlvo)
    if (typeof player.girarCamera === 'function') {
      player.girarCamera(dYaw * (1 - Math.exp(-6 * dt)))
    }

    // Pitch: mira a ALTURA DO ROSTO, nao o centro do corpo. Olhar pro peito de
    // alguem numa conversa e o tipo de coisa que ninguem sabe nomear mas todo
    // mundo sente.
    const alturaOlho = player.position.y + 1.62
    const pitchAlvo = Math.atan2(_p.y - alturaOlho, dist)
    player.pitch = damp(player.pitch, pitchAlvo, 6, dt)
  }

  /** A saudacao segue a cabeca do NPC na tela. */
  function seguirSaudacao() {
    if (!ficha || !ficha.alvo || !camera) return
    ficha.alvo.getWorldPosition(_p)
    _p.y += 0.28                       // um palmo acima da cabeca
    _p.project(camera)
    const w = window.innerWidth, h = window.innerHeight
    // atras da camera: some em vez de aparecer espelhado no lado errado
    if (_p.z > 1) { elSaud.style.display = 'none'; return }
    elSaud.style.display = ''
    elSaud.style.left = ((_p.x * 0.5 + 0.5) * w) + 'px'
    elSaud.style.top = ((-_p.y * 0.5 + 0.5) * h) + 'px'
  }

  const api = {
    get aberta() { return aberta },
    get quem() { return ficha ? ficha.nome : null },

    /**
     * @param {object} f
     * @param {string} f.nome
     * @param {string} f.saudacao   o que flutua sobre a cabeca
     * @param {Array}  f.opcoes     [{ txt, trava?, aoEscolher? }]
     * @param {THREE.Object3D} f.alvo  a cabeca do NPC (a camera mira nela)
     */
    abrir(f) {
      if (!f) return
      ficha = f
      resposta = null
      aberta = true
      pintar()
      raiz.classList.add('on')
      // O jogador para de andar, mas a camera CONTINUA VIVA — e ela que faz o
      // movimento de centrar. Travar tudo deixaria a cena congelada.
      if (player && typeof player.setLocked === 'function') player.setLocked(true)
      window.addEventListener('keydown', aoTeclar)
    },

    fechar() {
      if (!aberta) return
      aberta = false
      ficha = null
      resposta = null
      raiz.classList.remove('on')
      elBarra.innerHTML = ''
      if (player && typeof player.setLocked === 'function') player.setLocked(false)
      window.removeEventListener('keydown', aoTeclar)
    },

    atualizar(dt) {
      if (!aberta) return
      mirar(Math.min(dt || 0, 0.05))
      seguirSaudacao()
    },

    dispose() {
      api.fechar()
      raiz.remove()
    },
  }

  return api
}

export default criarConversa
