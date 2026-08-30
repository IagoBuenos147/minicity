// ---------------------------------------------------------------------------
// src/ui/legenda.js — A LEGENDA DO RODAPE, PRO JOGO E NAO SO PRA CUTSCENE.
//
// O jogo ja tinha DOIS jeitos de mostrar uma fala, e nenhum dos dois servia
// pra um NPC falar com voce dentro do mundo:
//
//   - `src/ui/dialogo.js` e um balao que SEGUE A CABECA do NPC na tela e quem
//     manda nele e o SERVIDOR (ver REDE.md). E a conversa de rede, com opcoes de
//     resposta; nao ha como um interior local abrir uma fala por ali.
//   - `src/cena/abertura.js` tem a legenda de rodape — que e exatamente o
//     formato certo —, mas ela nasce e morre dentro da cutscene: o CSS entra no
//     `<head>` no comeco e sai no `dispose()`.
//
// Este arquivo e a legenda da cutscene extraida pra quem quiser. MESMA POSICAO
// (rodape, centralizada), MESMO TAMANHO (20,4 px — o numero que o dono pediu na
// cutscene, "AUMENTE O TEXTO EM 20%") e MESMA FONTE do resto do HUD. Isso e de
// proposito: duas fontes de legenda no mesmo jogo e a coisa que faz uma tela
// parecer montada por duas pessoas diferentes.
//
// POR QUE O RODAPE E NAO UM BALAO. Esta decisao ja foi tomada uma vez neste
// projeto, na cutscene, e o comentario de la registra o motivo: com gente perto
// da camera o balao cobre justamente o rosto que a cena esta mostrando. Num
// corredor de cortico, com o morador a um metro e meio do jogador, seria pior.
// ---------------------------------------------------------------------------

const CSS = [
  '.mcrp-leg{position:fixed;left:50%;bottom:7vh;transform:translateX(-50%);',
  'z-index:38;pointer-events:none;max-width:min(78vw,900px);text-align:center;',
  'font:20.4px/1.45 "Trebuchet MS",system-ui,sans-serif;color:#f2f5fa;',
  'text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.9);',
  'opacity:0;transition:opacity .16s}',
  '.mcrp-leg.on{opacity:1}',
  '.mcrp-leg b{color:#8fd6a8;font-weight:normal;letter-spacing:.1em;',
  'text-transform:uppercase;font-size:14.4px;display:block;margin-bottom:4px}',
].join('')

let estiloInjetado = false
function injetarEstilo() {
  if (estiloInjetado || typeof document === 'undefined') return
  const e = document.createElement('style')
  e.textContent = CSS
  document.head.appendChild(e)
  estiloInjetado = true
}

/**
 * A legenda. Uma so por jogo — quem falar por ultimo escreve por cima, que e o
 * comportamento certo: duas falas simultaneas no rodape nao teriam onde caber.
 */
export function criarLegenda() {
  if (typeof document === 'undefined') {
    // node/headless: uma legenda que nao faz nada, pra ninguem precisar de guarda
    return { falar() {}, limpar() {}, atualizar() {}, dispose() {}, get texto() { return '' } }
  }
  injetarEstilo()

  const raiz = document.createElement('div')
  raiz.className = 'mcrp-leg'
  raiz.innerHTML = '<b></b><span></span>'
  document.body.appendChild(raiz)
  const elQuem = raiz.querySelector('b')
  const elTxt = raiz.querySelector('span')

  let restante = 0
  let texto = ''

  const api = {
    get texto() { return texto },
    get visivel() { return restante > 0 },

    /**
     * @param quem   o nome, em cima e em maiuscula. Vazio esconde a linha.
     * @param txt    a fala.
     * @param seg    quanto tempo fica na tela. O padrao cresce com o tamanho da
     *   frase (2,2 s mais 55 ms por caractere): frase longa com tempo fixo e a
     *   queixa que a cutscene ja recebeu uma vez ("nao ta dando tempo de ler").
     */
    falar(quem, txt, seg) {
      texto = String(txt || '')
      elQuem.textContent = quem ? String(quem) : ''
      elQuem.style.display = quem ? 'block' : 'none'
      elTxt.textContent = texto
      restante = typeof seg === 'number' ? seg : 2.2 + texto.length * 0.055
      raiz.classList.add('on')
    },

    limpar() {
      restante = 0
      texto = ''
      raiz.classList.remove('on')
    },

    atualizar(dt) {
      if (restante <= 0) return
      restante -= dt || 0
      if (restante <= 0) {
        restante = 0
        texto = ''
        raiz.classList.remove('on')
      }
    },

    dispose() { raiz.remove() },
  }
  return api
}

export default criarLegenda
