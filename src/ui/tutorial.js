import { CASA } from '../world/layout.js'

// ---------------------------------------------------------------------------
// src/ui/tutorial.js — o mini tutorial do canto superior esquerdo.
//
// UMA MISSAO POR VEZ, e isso e a coisa mais importante do arquivo. A tentacao
// de listar tudo que da pra fazer na cidade e grande, e ceder a ela transforma
// o painel numa lista de tarefas que o jogador le uma vez e ignora pra sempre.
// Uma linha so, com um objetivo so, ele le sem parar de andar.
//
// O PAINEL SE RESOLVE SOZINHO: quem registra as missoes nao precisa saber
// quando elas terminam. Cada missao traz o proprio checar(game), o tutorial
// pergunta de tempos em tempos, e quando a resposta vira true ele risca, anima
// e puxa a proxima. Quem JA sabe do evento antes (um onInteract, uma resposta
// do servidor) pode economizar o teste chamando concluir(id) na mao — o
// resultado visual e exatamente o mesmo.
//
// POR QUE 4 VEZES POR SEGUNDO E NAO A 60: checar() e escrito por quem registra
// a missao e pode ser caro (distancia ate um lote, varredura de estado do
// mundo, pergunta pra rede). A 60 Hz isso vira custo fixo de quadro pra sempre;
// a 4 Hz o pior caso e o jogador ver a missao completar 250 ms depois — que e
// menos que o tempo da propria animacao de conclusao, ou seja, invisivel.
//
// PERSISTENCIA: as concluidas vao pro localStorage sob 'mcrp-tutorial'. Sem
// isso, todo F5 devolve o jogador pra "Entre e conheca seu primeiro
// estabelecimento" com ele ja dentro da casa — e um tutorial que manda fazer o
// que ja foi feito ensina ao jogador que o painel pode ser ignorado. E local de
// proposito, como a carteira do cassino: o protocolo de rede nao tem pacote de
// progresso e inventar um significaria mexer em arquivo de outro dono.
//
// CSS: um <style> so, injetado uma vez por id, com TODA classe prefixada por
// 'mcrp-tut-' pra nao encostar no HUD, no cassino nem no balao de dialogo. O
// vidro escuro e copia fiel do '#hud .panel' — o painel tem que parecer irmao
// da linha de camera e do FPS, nao um convidado.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-tutorial-style'
const CHAVE = 'mcrp-tutorial'

// Segundos entre duas avaliacoes de checar(). Ver o "por que" no cabecalho.
const INTERVALO = 0.25

// Quanto tempo o cartao fica riscado antes de comecar a sair. 1.4 s e o tempo
// de o olho voltar pro canto da tela depois de o mundo ter chamado a atencao
// (a porta abrindo, o interior aparecendo) e ainda pegar o check verde.
const ESPERA_FEITO = 1.4

// Duracao do deslize de saida. Tem que bater com a transition do .mcrp-tut-
// cartao no CSS: menos que isso e o texto troca no meio do movimento.
const ESPERA_SAIDA = 0.26

// Distancia entre a base da pilha de camera/FPS/carteira e o topo do cartao.
const FOLGA_STATUS = 10

const CSS = `
.mcrp-tut, .mcrp-tut * { box-sizing: border-box; }
.mcrp-tut {
  position: fixed; left: 16px; top: 104px; width: 270px;
  z-index: 22; pointer-events: none;
  font-family: "Trebuchet MS", "Segoe UI", system-ui, sans-serif;
  color: #f2f5f8;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  transition: opacity .38s ease, transform .38s ease;
}
.mcrp-tut.off { opacity: 0; transform: translateX(-12px); }

/* vidro identico ao '#hud .panel', mais a faixa dourada da esquerda */
.mcrp-tut-cartao {
  position: relative; overflow: hidden;
  padding: 9px 12px 9px 14px;
  background: rgba(14, 17, 24, 0.52);
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  backdrop-filter: blur(9px) saturate(1.1);
  -webkit-backdrop-filter: blur(9px) saturate(1.1);
  box-shadow: 0 6px 22px rgba(0,0,0,0.32);
  opacity: 0; transform: translateX(-14px);
  transition: opacity .26s ease, transform .26s ease;
}
.mcrp-tut-cartao.on { opacity: 1; transform: translateX(0); }
.mcrp-tut-cartao:before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: linear-gradient(180deg, #ffdf9b, #d9a233 55%, #8f6410);
  box-shadow: 0 0 10px rgba(224,167,45,0.45);
}

.mcrp-tut-topo {
  font-size: 10px; letter-spacing: .16em; font-weight: bold;
  color: #e0b25f; margin-bottom: 5px;
}
.mcrp-tut-linha { display: flex; align-items: flex-start; gap: 8px; }
/* min-width: 0 nao e enfeite: sem ele o filho de um flex nunca encolhe abaixo
   do proprio conteudo, o corte de duas linhas nunca acontece e uma missao longa
   estoura os 270 px do painel */
.mcrp-tut-col { flex: 1 1 auto; min-width: 0; }

/* circulo vazio que vira check verde na conclusao */
.mcrp-tut-check {
  position: relative; flex: 0 0 auto;
  width: 14px; height: 14px; margin-top: 2px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.26);
  background: rgba(255,255,255,0.04);
  transition: background .22s ease, border-color .22s ease, box-shadow .22s ease;
}
.mcrp-tut-check:after {
  content: ''; position: absolute; left: 3.5px; top: 0.5px;
  width: 3px; height: 7px;
  border-right: 2px solid #0e1118; border-bottom: 2px solid #0e1118;
  transform: rotate(42deg) scale(0.2); opacity: 0;
  transition: transform .24s cubic-bezier(.2,1.5,.5,1), opacity .16s ease;
}
.mcrp-tut-cartao.feito .mcrp-tut-check {
  background: #7fd8a0; border-color: #7fd8a0;
  box-shadow: 0 0 9px rgba(127,216,160,0.55);
}
.mcrp-tut-cartao.feito .mcrp-tut-check:after {
  transform: rotate(42deg) scale(1); opacity: 1;
}

/* duas linhas no maximo: um objetivo que nao cabe em duas linhas e um objetivo
   mal escrito, e cortar aqui obriga quem registra a missao a ser curto */
.mcrp-tut-texto {
  font-size: 13px; line-height: 1.32;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden;
  transition: color .28s ease, opacity .28s ease;
}
.mcrp-tut-cartao.feito .mcrp-tut-texto {
  text-decoration: line-through; color: #a8c4b4; opacity: .7;
}
.mcrp-tut-dica {
  margin-top: 3px; font-size: 11px; line-height: 1.3;
  color: #a9b7c7; opacity: .6;
}
.mcrp-tut-dica.off { display: none; }
.mcrp-tut-cartao.feito .mcrp-tut-dica { opacity: .28; }

/* barra fina + "1 de 1" */
.mcrp-tut-rodape { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
.mcrp-tut-barra {
  flex: 1 1 auto; height: 2px; border-radius: 2px;
  background: rgba(255,255,255,0.12); overflow: hidden;
}
.mcrp-tut-barra i {
  display: block; height: 100%; width: 0%; border-radius: 2px;
  background: linear-gradient(90deg, #d9a233, #ffdf9b);
  box-shadow: 0 0 8px rgba(224,167,45,0.5);
  transition: width .55s cubic-bezier(.22,.9,.3,1);
}
.mcrp-tut-conta {
  flex: 0 0 auto; font-size: 10px; letter-spacing: .08em;
  color: #8fa0bb; font-variant-numeric: tabular-nums;
}

.mcrp-tut-cartao.pulso { animation: mcrpTutPulso .52s ease; }
@keyframes mcrpTutPulso {
  0%   { transform: translateX(0) scale(1); }
  34%  { transform: translateX(0) scale(1.045); box-shadow: 0 9px 28px rgba(224,167,45,0.30); }
  100% { transform: translateX(0) scale(1); }
}
`

// --- a caixa da CASA -------------------------------------------------------

// Folga pra dentro da caixa do lote. WALL_T e 0.3, entao sem folga o jogador
// parado NA porta (z exatamente em z0) ja contaria como "entrou" e a missao se
// completava com ele ainda na calcada, olhando pra fachada.
const FOLGA_PORTA = 0.35

// Quem sobe no telhado esta dentro da caixa XZ sem estar dentro da casa. O y do
// jogador e o PE dele (position.y = altura do piso que o sustenta), entao um pe
// acima da parede so pode ser telhado.
const TETO_CASA = CASA.wallHeight - 0.4

function dentroDaCasa(g) {
  const p = g && g.player && g.player.position
  if (!p) return false
  if (p.y > TETO_CASA) return false
  return p.x > CASA.x0 + FOLGA_PORTA && p.x < CASA.x1 - FOLGA_PORTA &&
    p.z > CASA.z0 + FOLGA_PORTA && p.z < CASA.z1 - FOLGA_PORTA
}

/**
 * As missoes do primeiro minuto de jogo. Moram AQUI, e nao no main, porque a
 * regra de "entrou na casa" e a caixa do lote — quem so quer ligar o tutorial
 * nao deveria precisar importar layout.js nem saber o que e WALL_T.
 */
export const MISSOES_INICIAIS = [
  {
    id: 'entrar-na-casa',
    texto: 'Entre e conheca seu primeiro estabelecimento',
    dica: 'A casa velha fica na avenida, do lado do cassino',
    checar: dentroDaCasa,
  },
]

// --- persistencia ----------------------------------------------------------

function lerSalvas() {
  // Formato: { feitas: ['id', ...] }. Qualquer coisa fora disso vira lista
  // vazia em silencio: localStorage corrompido nao pode derrubar o jogo, e o
  // pior caso e o jogador refazer um objetivo de 20 segundos.
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return []
    const o = JSON.parse(cru)
    const arr = Array.isArray(o) ? o : (o && o.feitas)
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => typeof x === 'string')
  } catch (err) { void err; return [] }
}

export function criarTutorial({ pai } = {}) {
  if (!document.getElementById(ID_ESTILO)) {
    const s = document.createElement('style')
    s.id = ID_ESTILO
    s.textContent = CSS
    document.head.appendChild(s)
  }

  const raiz = document.createElement('div')
  raiz.className = 'mcrp-tut off'
  raiz.innerHTML =
    '<div class="mcrp-tut-cartao">' +
    '<div class="mcrp-tut-topo">OBJETIVO</div>' +
    '<div class="mcrp-tut-linha">' +
    '<div class="mcrp-tut-check"></div>' +
    '<div class="mcrp-tut-col">' +
    '<div class="mcrp-tut-texto"></div>' +
    '<div class="mcrp-tut-dica off"></div>' +
    '</div></div>' +
    '<div class="mcrp-tut-rodape">' +
    '<div class="mcrp-tut-barra"><i></i></div>' +
    '<div class="mcrp-tut-conta"></div>' +
    '</div></div>'
  const alvo = pai || document.body
  alvo.appendChild(raiz)

  const elCartao = raiz.querySelector('.mcrp-tut-cartao')
  const elTexto = raiz.querySelector('.mcrp-tut-texto')
  const elDica = raiz.querySelector('.mcrp-tut-dica')
  const elFill = raiz.querySelector('.mcrp-tut-barra i')
  const elConta = raiz.querySelector('.mcrp-tut-conta')

  // --- estado --------------------------------------------------------------
  // 'vazio'  nenhuma missao registrada ainda
  // 'ativo'  mostrando a missao de 'indice' e testando checar()
  // 'feito'  riscada, esperando ESPERA_FEITO
  // 'saindo' deslizando pra fora, esperando ESPERA_SAIDA
  // 'fim'    acabou tudo (ou tudo ja estava salvo): painel fora de cena
  let estado = 'vazio'
  let missoes = []
  let indice = -1
  let espera = 0
  let acumulador = 0
  let visivel = true
  let quadro = 0            // id do requestAnimationFrame da animacao de entrada
  let elStatus = null       // pilha de camera/FPS do HUD, pra nao sobrepor
  let ultimoTopo = -1

  const concluidas = new Set(lerSalvas())

  function salvar() {
    // Escrever no localStorage e sincrono e trava a thread do desenho, mas isso
    // aqui acontece uma vez por missao concluida (nao por quadro, como a
    // carteira do cassino), entao nao vale o custo de agrupar.
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ feitas: Array.from(concluidas) }))
    } catch (err) { void err }
  }

  /**
   * Encaixa o cartao logo abaixo da linha de camera/FPS/carteira. A pilha
   * cresce sozinha (a carteira so aparece depois da primeira ficha, o painel de
   * debug so com F3), entao um 'top' fixo no CSS um dia sobrepoe alguma coisa.
   * offsetTop/offsetHeight em vez de getBoundingClientRect de proposito: sao
   * numeros, e getBoundingClientRect devolve um objeto novo a cada chamada.
   */
  function posicionar() {
    if (!elStatus || !elStatus.isConnected) elStatus = document.getElementById('hud-status')
    const topo = elStatus
      ? Math.round(elStatus.offsetTop + elStatus.offsetHeight + FOLGA_STATUS)
      : 104
    if (topo === ultimoTopo) return
    ultimoTopo = topo
    raiz.style.top = topo + 'px'
  }

  /** Primeira missao da lista que ainda nao foi concluida, a partir de 'de'. */
  function proximaPendente(de) {
    for (let i = de; i < missoes.length; i++) {
      if (!concluidas.has(missoes[i].id)) return i
    }
    return -1
  }

  function pintarBarra() {
    // Quantas da lista ja cairam, e nao "indice": quem recarrega com a 3 de 5
    // feita tem que ver a barra em 3/5, nao no zero.
    let feitas = 0
    for (let i = 0; i < missoes.length; i++) {
      if (concluidas.has(missoes[i].id)) feitas++
    }
    const total = missoes.length || 1
    elFill.style.width = Math.round((feitas / total) * 100) + '%'
    // O contador mostra a missao EM CURSO ("2 de 5"), e no fim mostra o total.
    const atual = indice >= 0 ? indice + 1 : missoes.length
    elConta.textContent = atual + ' de ' + missoes.length
  }

  /** Escreve a missao de 'indice' no cartao e desliza ele pra dentro. */
  function desenhar() {
    const m = missoes[indice]
    if (!m) return
    elCartao.classList.remove('on', 'feito', 'pulso')
    elTexto.textContent = m.texto || ''
    elDica.textContent = m.dica || ''
    elDica.classList.toggle('off', !m.dica)
    pintarBarra()
    posicionar()
    if (visivel) raiz.classList.remove('off')
    // Um quadro de respiro pra o navegador aplicar o estado inicial (opacidade
    // 0, deslocado 14 px): sem isso ele funde as duas mudancas e nao ha
    // transicao nenhuma, o cartao so aparece.
    if (quadro) cancelAnimationFrame(quadro)
    quadro = requestAnimationFrame(() => {
      quadro = 0
      elCartao.classList.add('on')
    })
  }

  /** Risca, marca o check, pulsa o cartao e corre a barra. */
  function marcarFeita(m) {
    concluidas.add(m.id)
    salvar()
    elCartao.classList.add('feito')
    // reinicia a animacao CSS: sem o reflow no meio, a segunda missao concluida
    // na mesma vida do painel nao pulsaria (a classe ja estaria la)
    elCartao.classList.remove('pulso')
    void elCartao.offsetWidth
    elCartao.classList.add('pulso')
    pintarBarra()
    estado = 'feito'
    espera = ESPERA_FEITO
  }

  function avancar() {
    const prox = proximaPendente(indice + 1)
    if (prox < 0) {
      // Nao ha mais nada a fazer: o painel sai de cena. Ele nao volta sozinho —
      // um cartao vazio piscando no canto e pior que canto nenhum.
      indice = -1
      estado = 'fim'
      raiz.classList.add('off')
      return
    }
    indice = prox
    estado = 'ativo'
    acumulador = 0
    desenhar()
  }

  const api = {
    raiz,

    /**
     * Registra a lista. missoes = [{ id, texto, dica?, checar(game) -> bool }].
     * O que ja estava salvo em localStorage e pulado na hora: quem recarregou
     * com a primeira feita ja entra na segunda.
     */
    definir(lista) {
      missoes = Array.isArray(lista) ? lista.filter((m) => m && m.id) : []
      indice = proximaPendente(0)
      if (indice < 0) {
        estado = missoes.length ? 'fim' : 'vazio'
        raiz.classList.add('off')
        pintarBarra()
        return
      }
      estado = 'ativo'
      espera = 0
      acumulador = 0
      desenhar()
    },

    /**
     * Avalia a missao atual. Chamar todo quadro: o proprio metodo se limita a
     * INTERVALO, e as esperas de animacao andam com o dt (e nao com setTimeout)
     * pra o tutorial parar junto com o jogo quando o laco para.
     */
    atualizar(dt, game) {
      if (estado === 'fim' || estado === 'vazio') return
      // O teto de 0.25 e pra aba em segundo plano, que devolve dt gigante. O
      // '|| 0' e o mesmo guarda dos update() de world/, e nao e enfeite: com dt
      // undefined ou NaN o 'espera -= d' vira NaN, 'NaN <= 0' e false e o cartao
      // riscado trava na tela pra sempre; e o acumulador tambem vira NaN, o
      // 'acumulador < INTERVALO' passa a ser false todo quadro e checar() volta
      // a rodar nos 60 Hz que este arquivo existe pra evitar.
      const d = Math.min(dt || 0, 0.25)

      if (estado === 'feito') {
        espera -= d
        if (espera <= 0) {
          estado = 'saindo'
          espera = ESPERA_SAIDA
          elCartao.classList.remove('on')
        }
        return
      }
      if (estado === 'saindo') {
        espera -= d
        if (espera <= 0) avancar()
        return
      }

      acumulador += d
      if (acumulador < INTERVALO) return
      acumulador = 0
      posicionar()
      const m = missoes[indice]
      if (!m || typeof m.checar !== 'function') return
      // checar() e codigo de fora e roda dentro do laco principal: uma missao
      // que estoure (mundo ainda carregando, referencia nula) nao pode levar o
      // quadro junto. Falhou, e so "ainda nao".
      let ok = false
      try { ok = !!m.checar(game) } catch (err) { void err; ok = false }
      if (ok) marcarFeita(m)
    },

    /**
     * Conclui na mao. Pra quem sabe do evento antes do checar() (um onInteract,
     * um pacote do servidor) e nao quer pagar o teste. Concluir uma missao que
     * nao e a atual so a marca como feita — ela e pulada quando chegar a vez.
     */
    concluir(id) {
      if (!id || concluidas.has(id)) return
      const m = missoes[indice]
      if (estado === 'ativo' && m && m.id === id) { marcarFeita(m); return }
      concluidas.add(id)
      salvar()
      pintarBarra()
    },

    /** Esconde/mostra sem perder o progresso (cutscene, menu, foto). */
    mostrar(v) {
      visivel = v !== false
      // 'fim' nao volta: nao ha objetivo pra mostrar.
      raiz.classList.toggle('off', !visivel || estado === 'fim' || estado === 'vazio')
    },

    /** A missao em andamento. null enquanto a conclusao anima e no fim de tudo. */
    get atual() {
      return estado === 'ativo' && indice >= 0 ? missoes[indice] : null
    },

    get concluidas() { return concluidas },

    dispose() {
      if (quadro) cancelAnimationFrame(quadro)
      quadro = 0
      if (raiz.parentNode) raiz.parentNode.removeChild(raiz)
      // O <style> fica: e idempotente por id, custa nada, e outro tutorial
      // criado depois (troca de cena, menu) reaproveita ele inteiro.
    },
  }

  return api
}
