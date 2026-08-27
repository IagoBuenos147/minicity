import * as THREE from 'three'
import { NPCS, RAIO_OUVIR_DIALOGO } from '../comum/mundo.js'

// ---------------------------------------------------------------------------
// O balao de dialogo COMPARTILHADO.
//
// Quem manda aqui e o servidor: este modulo so desenha o que ele mandou.
// Regras que vieram do contrato (REDE.md):
//   - quem esta a menos de RAIO_OUVIR_DIALOGO do NPC ve o balao, mesma linha,
//     ao mesmo tempo;
//   - quem esta longe nao ve nada;
//   - SO quem iniciou tem os botoes de resposta. Os outros assistem.
//
// O balao segue o NPC na tela (projecao 3D -> 2D), entao ele funciona em
// primeira e em terceira pessoa sem precisar saber qual e.
// ---------------------------------------------------------------------------

const NPC_POR_ID = new Map()
for (const n of NPCS) NPC_POR_ID.set(n.id, n)

export function criarDialogo({ camera, rede, aoEscolher }) {
  const raiz = document.createElement('div')
  raiz.className = 'mcrp-dlg off'
  raiz.innerHTML =
    '<div class="cx">' +
    '<div class="quem"></div>' +
    '<div class="fala"></div>' +
    '<div class="ops"></div>' +
    '<div class="obs">voce esta assistindo</div>' +
    '</div>'
  document.body.appendChild(raiz)

  const elQuem = raiz.querySelector('.quem')
  const elFala = raiz.querySelector('.fala')
  const elOps = raiz.querySelector('.ops')
  const elObs = raiz.querySelector('.obs')

  const estilo = document.createElement('style')
  estilo.textContent =
    '.mcrp-dlg{position:fixed;left:0;top:0;transform:translate(-50%,-100%);' +
    'z-index:40;pointer-events:none;transition:opacity .14s}' +
    '.mcrp-dlg.off{opacity:0}' +
    '.mcrp-dlg .cx{min-width:230px;max-width:390px;padding:12px 14px;' +
    'background:rgba(15,17,23,.92);backdrop-filter:blur(10px);' +
    'border:1px solid rgba(255,255,255,.12);border-radius:12px;' +
    'font:14px/1.5 "Trebuchet MS",system-ui,sans-serif;color:#e8edf6;' +
    'box-shadow:0 10px 30px rgba(0,0,0,.45)}' +
    '.mcrp-dlg .cx:after{content:"";position:absolute;left:50%;bottom:-7px;' +
    'width:14px;height:14px;margin-left:-7px;transform:rotate(45deg);' +
    'background:rgba(15,17,23,.92);border-right:1px solid rgba(255,255,255,.12);' +
    'border-bottom:1px solid rgba(255,255,255,.12)}' +
    '.mcrp-dlg .quem{font-size:11px;letter-spacing:.12em;color:#8fd6a8;margin-bottom:5px}' +
    '.mcrp-dlg .fala{margin-bottom:8px}' +
    '.mcrp-dlg .ops{display:flex;flex-direction:column;gap:5px}' +
    '.mcrp-dlg .ops.off{display:none}' +
    '.mcrp-dlg button{pointer-events:auto;cursor:pointer;text-align:left;' +
    'padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.14);' +
    'background:rgba(255,255,255,.06);color:#e8edf6;font:13px "Trebuchet MS",sans-serif}' +
    '.mcrp-dlg button:hover{background:rgba(143,214,168,.18);border-color:rgba(143,214,168,.45)}' +
    '.mcrp-dlg button b{color:#8fd6a8;margin-right:7px}' +
    '.mcrp-dlg .obs{font-size:11px;color:#8b98ab;font-style:italic}' +
    '.mcrp-dlg .obs.off{display:none}'
  document.head.appendChild(estilo)

  // estado do dialogo em curso; vem TODO do servidor
  let atual = null   // { npcId, jogadorId, linha, opcoes }
  const _v = new THREE.Vector3()

  function ehMeu() {
    return !!(atual && rede && atual.jogadorId === rede.meuId)
  }

  function mostrar() {
    if (!atual) { raiz.classList.add('off'); return }
    const def = NPC_POR_ID.get(atual.npcId)
    const falas = (def && def.falas) || []
    const opcoes = (def && def.opcoes) || []
    elQuem.textContent = (def && def.nome) || 'NPC'
    elFala.textContent = falas[atual.linha] || falas[0] || '...'

    // SO quem iniciou responde. Os outros veem a mesma linha, sem botoes.
    const meu = ehMeu()
    elOps.classList.toggle('off', !meu)
    elObs.classList.toggle('off', meu)
    if (meu) {
      elOps.innerHTML = ''
      opcoes.forEach((txt, i) => {
        const b = document.createElement('button')
        b.innerHTML = '<b>' + (i + 1) + '</b>' + txt
        b.onclick = () => { if (typeof aoEscolher === 'function') aoEscolher(i, atual) }
        elOps.appendChild(b)
      })
    }
    raiz.classList.remove('off')
  }

  /** O servidor abriu (ou avancou) um dialogo. */
  function abrir(ev) {
    atual = { npcId: ev.npcId, jogadorId: ev.jogadorId, linha: ev.linha || 0, opcoes: ev.opcoes || 0 }
    mostrar()
  }

  function fechar(npcId) {
    if (npcId !== undefined && atual && atual.npcId !== npcId) return
    atual = null
    raiz.classList.add('off')
  }

  /**
   * Segue o NPC na tela e esconde quando o jogador se afasta.
   * A distancia e medida ate o NPC, nao ate quem fala: quem passa perto do
   * balcao ouve a conversa mesmo que os dois conversando estejam longe dele.
   */
  function atualizar(minhaPos) {
    if (!atual) return
    const npc = rede && rede.npcs ? rede.npcs.get(atual.npcId) : null
    const def = NPC_POR_ID.get(atual.npcId)
    const x = npc ? npc.x : (def ? def.x : 0)
    const z = npc ? npc.z : (def ? def.z : 0)
    const y = (def ? def.y : 0) + 1.95

    if (minhaPos) {
      const dx = minhaPos.x - x, dz = minhaPos.z - z
      if (Math.sqrt(dx * dx + dz * dz) > RAIO_OUVIR_DIALOGO) { raiz.classList.add('off'); return }
    }

    _v.set(x, y, z).project(camera)
    if (_v.z > 1) { raiz.classList.add('off'); return }   // atras da camera
    raiz.style.left = ((_v.x * 0.5 + 0.5) * window.innerWidth) + 'px'
    raiz.style.top = ((-_v.y * 0.5 + 0.5) * window.innerHeight) + 'px'
    raiz.classList.remove('off')
  }

  function dispose() {
    raiz.remove()
    estilo.remove()
  }

  return {
    abrir, fechar, atualizar, dispose,
    get aberto() { return !!atual },
    get meu() { return ehMeu() },
    get npcId() { return atual ? atual.npcId : 0 },
  }
}

export default criarDialogo
