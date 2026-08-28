import {
  TAB_DEFS, DEF_POR_CAMPO, GRUPO_ROSTO, GRUPO_ROUPA,
  catalogo, criarBarraAbas, criarSecao, injectStyle as injetarEstiloCz, el,
} from './customizer.js'

// ---------------------------------------------------------------------------
// src/ui/criacao.js — a tela CHEIA de criacao de personagem.
//
// E pra onde o jogo vai depois do menu e antes da cena de abertura. O palco
// (src/ui/provador.js) ocupa a tela inteira por tras e o painel encosta num
// lado; o personagem fica DE PE, iluminado, e a camera aproxima da parte que
// esta sendo mexida — sem cadeira de barbeiro, sem espelho, sem balcao no meio
// do caminho, que era a reclamacao que fez o palco existir.
//
// Tres coisas que o painel de dentro do jogo nao tem e esta tela tem: o campo
// de NOME, o botao PRONTO e o contador de prontos do coop.
//
// TUDO QUE E GRADE, CARD E ABA VEM DO customizer.js. Nao ha uma segunda copia
// da grade aqui de proposito: duas grades iguais em dois arquivos e o jeito
// garantido de uma delas apodrecer — a de la ganharia a foto 3D nova e a daqui
// continuaria com pilula cinza por mais um ano.
//
// Este modulo NAO e dono do provador: ele recebe um pronto e so pilota. O
// dispose() daqui nao encosta nele.
// ---------------------------------------------------------------------------

const ID_ESTILO = 'mcrp-criacao-style'
const NOME_MAX = 16

// Todas as abas, rosto primeiro. Catalogo vazio nao vira aba (e o caso de
// JAQUETAS depois que jaqueta virou parte de BLUSAS).
function camposVisiveis() {
  return GRUPO_ROSTO.concat(GRUPO_ROUPA).filter((f) => catalogo(f).length > 0)
}

function injetarEstilo() {
  injetarEstiloCz()   // a folha do customizer traz as abas, os cards e a grade
  if (document.getElementById(ID_ESTILO)) return
  const s = document.createElement('style')
  s.id = ID_ESTILO
  s.textContent = CSS
  document.head.appendChild(s)
}

function chamar(obj, nome, ...args) {
  if (obj && typeof obj[nome] === 'function') {
    try { return obj[nome](...args) } catch (err) { console.warn('[criacao] ' + nome + ':', err) }
  }
  return undefined
}

/** Nome limpo: sem espaco nas pontas, sem espaco duplo, no maximo 16. */
function limparNome(txt) {
  return String(txt || '').replace(/\s+/g, ' ').trim().slice(0, NOME_MAX)
}

// Escuro, dourado e vermelho-vinho — a mesma familia do cassino (cassino-ui.js)
// e do HUD. A tela de criacao e a primeira coisa que o jogador ve; ela tem que
// parecer o mesmo jogo que a mesa de blackjack, nao um formulario emprestado.
const CSS = `
.mcrp-cri{
  justify-content:flex-end; align-items:stretch; padding:0; z-index:65;
  color:#f2ece0;
}
.mcrp-cri .cri-veu{
  position:absolute; inset:0; pointer-events:none;
  background:
    radial-gradient(80% 120% at 12% 50%, rgba(0,0,0,0) 42%, rgba(4,4,7,.55) 100%),
    linear-gradient(90deg, rgba(4,5,9,0) 44%, rgba(4,5,9,.72) 78%, rgba(3,4,7,.92) 100%);
}
.mcrp-cri .cri-marca{
  position:absolute; left:clamp(16px,4vw,52px); top:clamp(16px,4vh,44px);
  pointer-events:none; text-shadow:0 3px 18px rgba(0,0,0,.8);
}
.mcrp-cri .cri-marca i{
  display:block; font-style:normal; font-size:11px; letter-spacing:.34em;
  text-transform:uppercase; color:#e9c46a; font-weight:700;
}
.mcrp-cri .cri-marca b{
  display:block; margin-top:4px; font-size:clamp(26px,3.6vw,44px); font-weight:700;
  letter-spacing:-.01em; line-height:1.05;
}
.mcrp-cri .cri-marca span{
  display:block; margin-top:6px; font-size:12.5px; color:#a79f92; max-width:22ch; line-height:1.45;
}
/* dica de girar: o jogador nao descobre sozinho que da pra arrastar */
.mcrp-cri .cri-girar{
  position:absolute; left:clamp(16px,4vw,52px); bottom:clamp(16px,4vh,40px);
  font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#8d8578;
  pointer-events:none; display:flex; align-items:center; gap:8px;
}
.mcrp-cri .cri-girar em{
  font-style:normal; padding:3px 8px; border-radius:6px; color:#d9cfbc;
  background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12);
}

.mcrp-cri .cri-painel{
  position:relative; margin-left:auto;
  width:min(460px,100%); height:100%;
  display:flex; flex-direction:column; overflow:hidden;
  background:linear-gradient(170deg, rgba(28,20,24,.93), rgba(10,10,14,.97));
  -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%);
  border-left:1px solid rgba(233,196,106,.24);
  box-shadow:-34px 0 90px rgba(0,0,0,.62);
  transform:translateX(26px); opacity:0;
  transition:transform .3s cubic-bezier(.18,.9,.3,1.06), opacity .22s ease;
  outline:none;
}
.mcrp-cri.is-open .cri-painel{ transform:none; opacity:1; }

/* fita vinho/dourada do topo, irma do neon do cassino */
.mcrp-cri .cri-fita{
  height:4px; flex:0 0 auto;
  background:linear-gradient(90deg,#8f2436,#e9c46a,#8f2436,#e9c46a);
  background-size:260% 100%; animation:criFita 9s linear infinite; opacity:.9;
}
@keyframes criFita{ from{ background-position:0 0; } to{ background-position:260% 0; } }

.mcrp-cri .cri-topo{ padding:15px 20px 0; flex:0 0 auto; }
.mcrp-cri .cri-kicker{
  font-size:10.5px; letter-spacing:.24em; text-transform:uppercase; color:#e9c46a; font-weight:700;
}
.mcrp-cri .cri-titulo{ margin:3px 0 12px; font-size:22px; font-weight:700; }

/* --- nome --- */
.mcrp-cri .cri-nomebox{
  display:flex; align-items:center; gap:10px; margin:0 0 12px; padding:9px 12px;
  border-radius:13px; background:rgba(0,0,0,.34); border:1px solid rgba(255,255,255,.10);
  transition:border-color .16s, box-shadow .16s, background .16s;
}
.mcrp-cri .cri-nomebox.is-focus{
  border-color:rgba(233,196,106,.60); background:rgba(0,0,0,.46);
  box-shadow:0 0 0 3px rgba(233,196,106,.13);
}
.mcrp-cri .cri-nomebox > i{
  font-style:normal; font-size:9.5px; letter-spacing:.20em; text-transform:uppercase;
  color:#9a9184; font-weight:700; flex:0 0 auto;
}
.mcrp-cri .cri-nome{
  flex:1; min-width:0; appearance:none; background:none; border:0; outline:none;
  font:inherit; font-size:17px; font-weight:700; color:#f6efe2; letter-spacing:.01em;
}
.mcrp-cri .cri-nome::placeholder{ color:#6d6559; font-weight:600; }
.mcrp-cri .cri-nomecont{
  flex:0 0 auto; font-size:11px; font-variant-numeric:tabular-nums; color:#8d8578;
}
.mcrp-cri .cri-nomecont.is-cheio{ color:#e9c46a; }

.mcrp-cri .cri-corpo{ flex:1 1 auto; padding:12px 20px 6px; overflow-y:auto; overflow-x:hidden; }
.mcrp-cri .cri-corpo::-webkit-scrollbar{ width:8px; }
.mcrp-cri .cri-corpo::-webkit-scrollbar-thumb{ background:rgba(233,196,106,.22); border-radius:8px; }

/* --- lobby do coop --- */
.mcrp-cri .cri-lobby{
  flex:0 0 auto; display:none; padding:11px 20px 0;
  border-top:1px solid rgba(255,255,255,.07);
}
.mcrp-cri .cri-lobby.is-on{ display:block; }
.mcrp-cri .cri-lobbytopo{ display:flex; align-items:baseline; gap:8px; }
.mcrp-cri .cri-lobbytopo i{
  flex:1; font-style:normal; font-size:10px; letter-spacing:.20em; text-transform:uppercase;
  color:#9a9184; font-weight:700;
}
.mcrp-cri .cri-lobbytopo b{ font-size:14px; color:#e9c46a; font-variant-numeric:tabular-nums; }
.mcrp-cri .cri-barra{
  height:5px; margin:8px 0 10px; border-radius:5px; overflow:hidden;
  background:rgba(255,255,255,.07);
}
.mcrp-cri .cri-barra > span{
  display:block; height:100%; width:0%; border-radius:5px;
  background:linear-gradient(90deg,#8f2436,#e9c46a);
  transition:width .34s cubic-bezier(.2,.9,.3,1.05);
}
.mcrp-cri .cri-jogadores{ display:flex; flex-wrap:wrap; gap:7px; padding-bottom:2px; }
.mcrp-cri .cri-jog{
  display:flex; align-items:center; gap:7px; padding:5px 11px 5px 8px; border-radius:999px;
  font-size:12px; font-weight:600; color:#bdb4a5;
  background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08);
  transition:color .16s, border-color .16s, background .16s;
}
.mcrp-cri .cri-jog.is-pronto{
  color:#f4e9d2; border-color:rgba(233,196,106,.45); background:rgba(233,196,106,.12);
}
.mcrp-cri .cri-jog.is-eu b{ color:#e9c46a; }
.mcrp-cri .cri-jog b{ font-weight:700; }
.mcrp-cri .cri-luz{
  width:9px; height:9px; border-radius:50%; flex:0 0 auto;
  background:#5b5348; box-shadow:inset 0 -2px 3px rgba(0,0,0,.45);
  transition:background .18s, box-shadow .18s;
}
.mcrp-cri .cri-jog.is-pronto .cri-luz{
  background:#7fd39a; box-shadow:0 0 9px rgba(127,211,154,.75);
}

/* --- rodape --- */
.mcrp-cri .cri-rodape{
  flex:0 0 auto; display:flex; align-items:center; gap:10px;
  padding:13px 20px 16px; border-top:1px solid rgba(255,255,255,.07);
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,.26));
}
/* O dado e DESENHADO em CSS, nao escrito. O caractere de dado do unicode nao
   existe em metade das fontes de sistema e vira uma caixinha vazia — que foi
   exatamente o que apareceu no primeiro teste. */
.mcrp-cri .cri-dado{
  position:relative; appearance:none; cursor:pointer; font:inherit; line-height:1;
  width:42px; height:42px; border-radius:12px; flex:0 0 auto; color:#e6dbc6;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
  transition:background .14s, transform .18s cubic-bezier(.2,.9,.3,1.5), color .14s;
}
.mcrp-cri .cri-dado::after{
  content:''; position:absolute; inset:11px; border-radius:4px;
  border:1.5px solid currentColor;
  background:
    radial-gradient(circle 1.8px at 26% 26%, currentColor 98%, transparent 100%),
    radial-gradient(circle 1.8px at 74% 26%, currentColor 98%, transparent 100%),
    radial-gradient(circle 1.8px at 50% 50%, currentColor 98%, transparent 100%),
    radial-gradient(circle 1.8px at 26% 74%, currentColor 98%, transparent 100%),
    radial-gradient(circle 1.8px at 74% 74%, currentColor 98%, transparent 100%);
}
.mcrp-cri .cri-dado:hover{ background:rgba(233,196,106,.18); color:#f6e3b6; }
.mcrp-cri .cri-dado:active{ transform:rotate(-22deg) scale(.92); }
.mcrp-cri .cri-dica{
  flex:1; min-width:0; font-size:10.5px; line-height:1.55; color:#7e766a;
}
.mcrp-cri .cri-pronto{
  appearance:none; cursor:pointer; font:inherit; font-size:14px; font-weight:700;
  letter-spacing:.10em; text-transform:uppercase; flex:0 0 auto;
  padding:13px 26px; border-radius:13px; border:1px solid transparent;
  color:#241c0c; background:linear-gradient(180deg,#f7d489,#dfa93c);
  box-shadow:0 10px 26px rgba(223,169,60,.30);
  transition:background .16s, transform .1s, box-shadow .18s, color .16s, border-color .16s;
}
.mcrp-cri .cri-pronto:hover{ background:linear-gradient(180deg,#ffe1a4,#eab74c); }
.mcrp-cri .cri-pronto:active{ transform:translateY(1px); }
/* estado AGUARDANDO: continua clicavel, porque desmarcar tem que ser possivel
   — um lobby onde o primeiro a clicar fica refem dos outros e um lobby ruim */
.mcrp-cri .cri-pronto.is-esperando{
  color:#e9c46a; background:rgba(233,196,106,.10);
  border-color:rgba(233,196,106,.45); box-shadow:none;
}
.mcrp-cri .cri-pronto.is-esperando::before{
  content:''; display:inline-block; width:8px; height:8px; margin-right:9px;
  border-radius:50%; background:#e9c46a; animation:criPulso 1.15s ease-in-out infinite;
  vertical-align:middle;
}
@keyframes criPulso{ 0%,100%{ opacity:.35; transform:scale(.75); } 50%{ opacity:1; transform:scale(1); } }
.mcrp-cri .cri-pronto[disabled]{ opacity:.42; cursor:default; box-shadow:none; }

@media (max-width:880px){
  .mcrp-cri .cri-painel{ width:100%; }
  .mcrp-cri .cri-marca{ display:none; }
  .mcrp-cri .cri-girar{ display:none; }
}
@media (prefers-reduced-motion:reduce){
  .mcrp-cri .cri-fita{ animation:none; }
  .mcrp-cri .cri-pronto.is-esperando::before{ animation:none; opacity:1; }
}
`

// ---------------------------------------------------------------------------

export function criarCriacao(args = {}) {
  const provador = args.provador || null
  const opcoes = args.opcoes || {}
  injetarEstilo()

  // --- estado -----------------------------------------------------------------
  // A aparencia daqui e um objeto NOSSO. Quem chamou passa o inicial e recebe
  // uma copia a cada mudanca (aoMudar): a tela de criacao nao pode escrever no
  // objeto do jogo antes de o jogador clicar em PRONTO.
  const ap = Object.assign({}, args.aparencia || null)
  for (const d of TAB_DEFS) {
    if (typeof ap[d.field] !== 'number' || !isFinite(ap[d.field])) ap[d.field] = 0
  }

  let aberto = false
  let modo = 'solo'
  let nome = ''
  let pronto = false
  let prontosN = 0
  let prontosTotal = 0
  let jogadores = []
  let campoAtivo = null
  const secoes = new Map()

  // --- DOM ---------------------------------------------------------------------
  // A raiz leva as DUAS classes: 'mcrp-cz' pra folha do customizer valer nas
  // abas e nos cards, 'mcrp-cri' pra esta folha mandar no resto.
  const root = el('div', 'mcrp-cz mcrp-cri')
  root.setAttribute('aria-hidden', 'true')

  const veu = el('div', 'cri-veu')

  const marca = el('div', 'cri-marca')
  marca.append(
    el('i', null, 'Mini City RP'),
    el('b', null, 'Crie seu personagem'),
    el('span', null, 'Arraste na tela pra girar. A camera aproxima sozinha do que voce esta mexendo.'),
  )

  const girarDica = el('div', 'cri-girar')
  girarDica.append(el('em', null, 'Arrastar'), document.createTextNode('girar o personagem'))

  const painel = el('aside', 'cri-painel')
  painel.tabIndex = -1

  const fita = el('div', 'cri-fita')

  const topo = el('div', 'cri-topo')
  const kicker = el('div', 'cri-kicker', 'NOVO PERSONAGEM')
  const titulo = el('h2', 'cri-titulo', 'Quem voce vai ser')

  const nomeBox = el('div', 'cri-nomebox')
  const campoNome = document.createElement('input')
  campoNome.className = 'cri-nome'
  campoNome.type = 'text'
  campoNome.maxLength = NOME_MAX
  campoNome.placeholder = 'Seu nome'
  campoNome.autocomplete = 'off'
  campoNome.spellcheck = false
  const nomeCont = el('span', 'cri-nomecont', '0/' + NOME_MAX)
  nomeBox.append(el('i', null, 'Nome'), campoNome, nomeCont)

  const abas = criarBarraAbas({ aoTrocar: (campo) => setAba(campo) })

  topo.append(kicker, titulo, nomeBox, abas.root)

  const corpo = el('div', 'cri-corpo')

  const lobby = el('div', 'cri-lobby')
  const lobbyTopo = el('div', 'cri-lobbytopo')
  const lobbyLabel = el('i', null, 'Sala')
  const lobbyCont = el('b', null, '0/0 prontos')
  lobbyTopo.append(lobbyLabel, lobbyCont)
  const barra = el('div', 'cri-barra')
  const barraFill = el('span')
  barra.appendChild(barraFill)
  const listaJog = el('div', 'cri-jogadores')
  lobby.append(lobbyTopo, barra, listaJog)

  const rodape = el('div', 'cri-rodape')
  const btnDado = el('button', 'cri-dado')
  btnDado.type = 'button'
  btnDado.setAttribute('aria-label', 'Sortear um visual')
  const dica = el('div', 'cri-dica')
  dica.innerHTML = 'Setas trocam a peca, Tab troca a aba.<br>Enter confirma.'
  const btnPronto = el('button', 'cri-pronto', 'COMECAR')
  btnPronto.type = 'button'
  rodape.append(btnDado, dica, btnPronto)

  painel.append(fita, topo, corpo, lobby, rodape)
  root.append(veu, marca, girarDica, painel)
  document.body.appendChild(root)

  // --- palco --------------------------------------------------------------------
  // O painel come o lado direito da tela; sem desviar, o personagem ficaria
  // metade atras dele. O desvio anda a camera DE LADO (travelling), nao gira:
  // girar deixaria o boneco de perfil justamente na hora de escolher o rosto.
  function ajustarDesvio() {
    if (!provador || typeof provador.setDesvio !== 'function') return
    const largura = window.innerWidth || 1280
    // abaixo de 880 px o painel cobre a tela inteira (ver o media query) e o
    // palco fica atras dele: ai centralizar e o certo
    if (largura < 880) { provador.setDesvio(0); return }
    const painelPx = Math.min(460, largura)
    provador.setDesvio(Math.max(0, Math.min(0.3, (painelPx / largura) * 0.52)))
  }

  function enquadrar(foco) {
    if (provador && typeof provador.focar === 'function') provador.focar(foco)
  }

  function miniatura(campo, i) {
    if (!provador || typeof provador.miniatura !== 'function') return null
    return provador.miniatura(campo, i)
  }

  function empurrarAparencia() {
    if (provador && typeof provador.setAparencia === 'function') provador.setAparencia(ap)
    chamar(opcoes, 'aoMudar', Object.assign({}, ap))
  }

  // --- abas e secoes --------------------------------------------------------------
  function montar() {
    for (const s of secoes.values()) s.destruir()
    secoes.clear()
    corpo.innerHTML = ''

    const campos = camposVisiveis()
    abas.montar(campos, DEF_POR_CAMPO)

    for (const campo of campos) {
      const sec = criarSecao(campo, {
        aoEscolher: escolher,
        miniatura,
      })
      corpo.appendChild(sec.root)
      secoes.set(campo, sec)
    }
    // o indice guardado pode nao existir no catalogo (aparencia salva antes de
    // alguem apagar uma barba): a secao normaliza sozinha e a gente le de volta
    for (const [campo, sec] of secoes) {
      sec.setIndice(ap[campo] | 0)
      ap[campo] = sec.indice()
    }
    if (campos.length > 0) setAba(campos[0])
  }

  function setAba(campo) {
    const s = secoes.get(campo)
    if (!s) return
    const antes = campoAtivo
    campoAtivo = campo
    for (const [k, sec] of secoes) {
      const on = k === campo
      sec.root.classList.toggle('is-active', on)
      if (!on && k === antes) sec.sair()
    }
    abas.setAtiva(campo, false)
    corpo.scrollTop = 0
    s.entrar()
    enquadrar(s.def.foco)
  }

  function escolher(campo, indice) {
    if (ap[campo] === indice) return
    ap[campo] = indice
    empurrarAparencia()
    // as fotos das OUTRAS abas mostram a roupa velha; elas se refazem quando o
    // jogador entrar nelas (o provador so guarda o que ainda vale)
    for (const [k, sec] of secoes) if (k !== campo) sec.esquecerFotos()
  }

  function passoItem(dir) {
    const s = secoes.get(campoAtivo)
    if (s) s.passoItem(dir)
  }

  function sortear() {
    for (const [campo, sec] of secoes) {
      const n = sec.list.length
      if (n < 2) continue
      const i = Math.floor(Math.random() * n)
      ap[campo] = i
      sec.setIndice(i)
    }
    empurrarAparencia()
    for (const sec of secoes.values()) sec.esquecerFotos()
    const s = secoes.get(campoAtivo)
    if (s) s.entrar()
  }

  // --- nome -----------------------------------------------------------------------
  function pintarNome() {
    const n = campoNome.value.length
    nomeCont.textContent = n + '/' + NOME_MAX
    nomeCont.classList.toggle('is-cheio', n >= NOME_MAX)
  }

  function onNomeInput() {
    // espaco no COMECO e cortado enquanto digita (deixar o cursor andar sem
    // escrever nada parece bug); o do fim so no commit, senao nao da pra
    // escrever "Ana Maria"
    let v = campoNome.value.replace(/^\s+/, '').replace(/\s{2,}/g, ' ')
    if (v.length > NOME_MAX) v = v.slice(0, NOME_MAX)
    if (v !== campoNome.value) campoNome.value = v
    nome = v
    pintarNome()
    chamar(opcoes, 'aoNome', limparNome(v))
  }

  function onNomeBlur() {
    nomeBox.classList.remove('is-focus')
    campoNome.value = limparNome(campoNome.value)
    nome = campoNome.value
    pintarNome()
    chamar(opcoes, 'aoNome', nome)
  }

  // --- pronto ---------------------------------------------------------------------
  function pintarPronto() {
    if (modo === 'solo') {
      btnPronto.textContent = 'COMECAR'
      btnPronto.classList.remove('is-esperando')
      btnPronto.disabled = false
      return
    }
    if (pronto) {
      btnPronto.textContent = 'AGUARDANDO (' + prontosN + '/' + prontosTotal + ')'
      btnPronto.classList.add('is-esperando')
    } else {
      btnPronto.textContent = 'PRONTO'
      btnPronto.classList.remove('is-esperando')
    }
    btnPronto.disabled = false
  }

  function pintarLobby() {
    lobby.classList.toggle('is-on', modo === 'coop')
    lobbyCont.textContent = prontosN + '/' + prontosTotal + ' prontos'
    const pct = prontosTotal > 0 ? Math.max(0, Math.min(1, prontosN / prontosTotal)) : 0
    barraFill.style.width = (pct * 100).toFixed(1) + '%'

    listaJog.innerHTML = ''
    for (const j of jogadores) {
      const linha = el('div', 'cri-jog' + (j && j.pronto ? ' is-pronto' : '') + (j && j.eu ? ' is-eu' : ''))
      linha.append(el('span', 'cri-luz'), el('b', null, (j && j.nome) || 'Jogador'))
      listaJog.appendChild(linha)
    }
    // lugares ainda vazios entram como fantasma: "3/4" com tres nomes na tela
    // e um numero que nao fecha com o que se ve
    for (let i = jogadores.length; i < prontosTotal; i++) {
      const linha = el('div', 'cri-jog')
      linha.append(el('span', 'cri-luz'), el('b', null, 'Vazio'))
      linha.style.opacity = '.45'
      listaJog.appendChild(linha)
    }
  }

  function alternarPronto() {
    if (modo === 'solo') {
      pronto = true
      // commit do nome mesmo se o jogador clicou COMECAR com o campo em foco
      campoNome.value = limparNome(campoNome.value)
      nome = campoNome.value
      chamar(opcoes, 'aoNome', nome)
      chamar(opcoes, 'aoPronto', true)
      return
    }
    pronto = !pronto
    campoNome.value = limparNome(campoNome.value)
    nome = campoNome.value
    chamar(opcoes, 'aoNome', nome)
    pintarPronto()
    chamar(opcoes, 'aoPronto', pronto)
  }

  // --- girar arrastando -------------------------------------------------------------
  let arrastando = false
  let arrasteX = 0

  function ehPainel(alvo) {
    return !!(alvo && alvo.closest && alvo.closest('.cri-painel'))
  }

  function onDown(e) {
    if (!aberto || e.button !== 0 || ehPainel(e.target)) return
    arrastando = true
    arrasteX = e.clientX
  }
  function onMove(e) {
    if (!arrastando) return
    const dx = e.clientX - arrasteX
    arrasteX = e.clientX
    if (provador && typeof provador.girar === 'function') provador.girar(-dx * 0.008)
  }
  function onUp() { arrastando = false }

  function onKey(e) {
    if (!aberto) return
    const noCampo = e.target === campoNome
    const k = e.key
    if (noCampo) {
      // dentro do campo de nome so o Enter tem significado nosso: qualquer
      // outra tecla e texto, inclusive as setas (mover o cursor)
      if (k === 'Enter' || k === 'NumpadEnter') { campoNome.blur(); e.preventDefault() }
      e.stopPropagation()
      return
    }
    let usou = true
    if (k === 'Enter' || k === 'NumpadEnter') alternarPronto()
    else if (k === 'Tab') abas.ciclo(e.shiftKey ? -1 : 1)
    else if (k === 'ArrowLeft') passoItem(-1)
    else if (k === 'ArrowRight') passoItem(+1)
    else if (k === 'ArrowUp' || k === 'PageUp') abas.passo(-1)
    else if (k === 'ArrowDown' || k === 'PageDown') abas.passo(+1)
    else if (k === 'r' || k === 'R') sortear()
    else if (k >= '1' && k <= '9') escolherDireto(Number(k) - 1)
    else usou = false
    if (usou) { e.preventDefault(); e.stopPropagation() }
  }

  function escolherDireto(i) {
    const s = secoes.get(campoAtivo)
    if (!s || i < 0 || i >= s.list.length) return
    s.setIndice(i)
    escolher(campoAtivo, i)
  }

  function onResize() {
    if (!aberto) return
    ajustarDesvio()
    abas.remarcar()
  }

  // --- API ------------------------------------------------------------------------

  function abrir(cfg = {}) {
    modo = cfg.modo === 'coop' ? 'coop' : 'solo'
    prontosN = cfg.prontos | 0
    prontosTotal = cfg.total | 0 || (modo === 'coop' ? 4 : 1)
    pronto = false
    if (typeof cfg.nome === 'string') {
      campoNome.value = limparNome(cfg.nome)
      nome = campoNome.value
    }
    pintarNome()

    kicker.textContent = modo === 'coop' ? 'SALA COOPERATIVA' : 'NOVO PERSONAGEM'
    titulo.textContent = modo === 'coop' ? 'Monte seu personagem' : 'Quem voce vai ser'

    if (!aberto) {
      aberto = true
      montar()
      empurrarAparencia()
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('mousedown', onDown)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      window.addEventListener('resize', onResize)
      root.setAttribute('aria-hidden', 'false')
      requestAnimationFrame(() => { root.classList.add('is-open'); abas.remarcar() })
      setTimeout(() => { if (aberto) { abas.remarcar(); if (!campoNome.value) campoNome.focus() } }, 60)
    }
    ajustarDesvio()
    pintarLobby()
    pintarPronto()
  }

  function fechar() {
    if (!aberto) return
    aberto = false
    arrastando = false
    for (const s of secoes.values()) s.sair()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('mousedown', onDown)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('resize', onResize)
    root.classList.remove('is-open')
    root.setAttribute('aria-hidden', 'true')
    // o palco volta a ser de quem pegar depois: devolvemos o enquadramento
    if (provador && typeof provador.setDesvio === 'function') provador.setDesvio(0)
  }

  /** "2/4 prontos" e a barra. Chamada pela rede a cada mudanca na sala. */
  function setProntos(n, total) {
    prontosN = Math.max(0, n | 0)
    if (total !== undefined) prontosTotal = Math.max(0, total | 0)
    pintarLobby()
    pintarPronto()
  }

  /** lista = [{ id, nome, pronto, eu }] — so faz sentido no coop. */
  function setJogadores(lista) {
    jogadores = Array.isArray(lista) ? lista.slice(0, 8) : []
    pintarLobby()
  }

  // Estas duas rodam TODO QUADRO, entao nao passam por chamar(): o helper tem
  // parametro rest, e rest + spread alocam um array por chamada. Dois arrays
  // por quadro nao travam nada sozinhos, mas e lixo que o coletor vem buscar no
  // meio de uma animacao — e a regra da casa e zero alocacao no laco.
  function atualizar(dt) {
    if (!aberto || !provador || typeof provador.atualizar !== 'function') return
    provador.atualizar(dt)
  }

  function render() {
    if (!aberto || !provador || typeof provador.render !== 'function') return
    provador.render()
  }

  function dispose() {
    fechar()
    for (const s of secoes.values()) s.destruir()
    secoes.clear()
    abas.destruir()
    if (root.parentNode) root.parentNode.removeChild(root)
    // o provador NAO e nosso: quem criou e quem descarta
  }

  // --- listeners fixos ----------------------------------------------------------
  campoNome.addEventListener('input', onNomeInput)
  campoNome.addEventListener('focus', () => nomeBox.classList.add('is-focus'))
  campoNome.addEventListener('blur', onNomeBlur)
  nomeBox.addEventListener('click', () => campoNome.focus())
  btnPronto.addEventListener('click', alternarPronto)
  btnDado.addEventListener('click', sortear)
  // cliques no painel nao podem virar arraste do palco nem tiro no mundo
  for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    painel.addEventListener(ev, (e) => e.stopPropagation())
  }

  return {
    root,
    abrir,
    fechar,
    setProntos,
    setJogadores,
    atualizar,
    render,
    dispose,
    get aberto() { return aberto },
    get nome() { return limparNome(campoNome.value) },
    get aparencia() { return Object.assign({}, ap) },
    get pronto() { return pronto },
    /** foco que o palco esta usando (o menu pode querer saber) */
    get foco() {
      const s = secoes.get(campoAtivo)
      return (s && s.def.foco) || 'corpo'
    },
  }
}

export default criarCriacao
