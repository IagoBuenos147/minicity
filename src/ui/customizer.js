import { CATALOGS } from '../player/appearance.js'
import { CATALOGOS_ROUPA } from '../player/roupas.js'

// ---------------------------------------------------------------------------
// Painel de customizacao do personagem.
//
// Dois grupos de abas sobre os MESMOS catalogos do jogo:
//   "rosto"  -> a cadeira do barbeiro (cabeca, olhos, pupila, nariz, boca,
//               barba, cabelo, cor do cabelo, sobrancelha, pele)
//   "roupa"  -> o provador (chapeu, roupa de cima, calca, calcado, colar,
//               anel, relogio, tatuagem)
//
// NADA de lista escrita na mao aqui: as opcoes saem de CATALOGS
// (src/player/appearance.js) e de CATALOGOS_ROUPA (src/player/roupas.js). Quem
// acrescentar uma barba nova la ve a aba crescer aqui sozinha, sem tocar neste
// arquivo.
//
// A CAMERA DO JOGO NAO ENQUADRA MAIS O PERSONAGEM AQUI. Enquanto este painel
// esta aberto, quem aparece na tela e o PALCO de src/ui/provador.js — uma cena
// separada, com pedestal e luz de estudio. O motivo e concreto: apontando a
// camera do jogo pro boneco onde ele estava, a cadeira do barbeiro, o espelho,
// o balcao e a prateleira da loja de roupa entravam entre a lente e o cliente,
// e nao havia enquadramento que resolvesse — o estorvo era o CENARIO. No palco
// nao ha movel nenhum pra atrapalhar porque nao ha movel nenhum.
// O painel continua chamando game.beginPreview(foco) / game.endPreview() (e
// quem integra decide o que elas fazem por dentro) e expoe palco() com o foco
// atual, alem de falar direto com game.provador quando ele existe.
//
// As MINIATURAS dos cards tambem vem do provador: cada card mostra a peca de
// verdade, renderizada no corpo e no tom de pele do jogador. Antes eram formas
// de CSS, e por isso a aba de roupa mostrava seis pilulas cinzas identicas.
//
// DOM puro + <style> injetado. Preview ao vivo: toda mudanca chama
// game.setAppearance() na hora, e o snapshot da abertura permite cancelar.
//
// A barra de abas, a grade de cards e o card sao EXPORTADOS (criarBarraAbas,
// criarSecao) porque a tela de criacao de personagem (src/ui/criacao.js) usa os
// mesmos. Duas copias da mesma grade e o jeito garantido de uma delas apodrecer.
// ---------------------------------------------------------------------------

const STYLE_ID = 'mcrp-customizer-style'

// Fontes de catalogo, na ordem de busca. O campo da aparencia e a chave nos
// dois objetos, entao achar a lista de uma aba e so procurar pelo nome do campo.
const FONTES = [CATALOGS, CATALOGOS_ROUPA]

/** Lista de opcoes de um campo da aparencia (vazia se o catalogo nao existir). */
export function catalogo(field) {
  for (const src of FONTES) {
    const l = src && src[field]
    if (Array.isArray(l) && l.length > 0) return l
  }
  return []
}

/**
 * Catalogo de ABAS.
 *
 *   id      chave da aba. Quase sempre e o proprio campo da aparencia; so a aba
 *           de cor tem id proprio, porque ela mexe em TRES campos
 *   field   campo principal (o que responde por ela nas APIs antigas)
 *   campos  [{ field, title }] — as listas que a aba mostra, em ordem. Uma aba
 *           normal tem uma so; quem omite ganha [{ field, title }] de graca
 *   grupo   'rosto' (barbeiro) ou 'roupa' (provador)
 *   foco    o que o palco enquadra: rosto | tronco | pescoco | pernas | pes |
 *           maos | corpo
 *
 * O QUE MUDOU NESTA REFORMA (pedido do dono, com as palavras dele):
 *
 * - "apague toda a aba de PUPILAS, vamos manter apenas os diferentes olhos."
 *   A iris virou parte do olho: cada um dos cinco olhos traz a propria solucao
 *   de iris/pupila/brilho, com um metodo diferente em cada. Nao ha mais aba.
 *
 * - "na aba COR vai ter cor de cabelo, cor de barba e cor de pele, tudo em uma
 *   aba; consequentemente a aba cor de pele vai passar pra essa aba tambem."
 *   Dai a aba de tres listas. Cor de barba e um campo NOVO ('corBarba'), que
 *   ocupou o byte de reserva do protocolo — barba herdando a cor do cabelo nao
 *   entregava grisalho de barba com cabelo preto.
 *
 * - "mude tambem a aba ROUPAS para CAMISAS."
 *   So o rotulo: o campo continua sendo 'blusa', que e um byte do protocolo de
 *   rede, e renomear byte custa versao nova por um nome.
 *
 * NAO EXISTE ABA DE JAQUETA. Jaqueta, blazer e moletom moram dentro do catalogo
 * de camisas, e o campo 'jaqueta' fica sempre em 0 (o byte continua no pacote;
 * mexer no formato binario por causa de um byte dormindo custa mais do que
 * deixar ele dormir).
 */
export const TAB_DEFS = [
  { field: 'cabeca', label: 'CABECA', title: 'Formato da cabeca', glyph: 'cabeca', grupo: 'rosto', foco: 'rosto' },
  { field: 'olhos', label: 'OLHOS', title: 'Olhos', glyph: 'olhos', grupo: 'rosto', foco: 'rosto' },
  { field: 'nariz', label: 'NARIZ', title: 'Nariz', glyph: 'nariz', grupo: 'rosto', foco: 'rosto' },
  { field: 'boca', label: 'BOCA', title: 'Boca', glyph: 'boca', grupo: 'rosto', foco: 'rosto' },
  { field: 'barba', label: 'BARBA', title: 'Barba', glyph: 'barba', grupo: 'rosto', foco: 'rosto' },
  { field: 'cabelo', label: 'CABELO', title: 'Corte de cabelo', glyph: 'cabelo', grupo: 'rosto', foco: 'rosto' },
  { field: 'sobrancelha', label: 'SOBRANC.', title: 'Sobrancelhas', glyph: 'sobrancelha', grupo: 'rosto', foco: 'rosto' },
  {
    id: 'cor', field: 'corCabelo', label: 'COR', title: 'Cores', glyph: 'pele',
    grupo: 'rosto', foco: 'rosto',
    campos: [
      { field: 'corCabelo', title: 'Cor do cabelo' },
      { field: 'corBarba', title: 'Cor da barba' },
      { field: 'pele', title: 'Tom de pele' },
    ],
  },

  { field: 'chapeu', label: 'CHAPEU', title: 'Chapeu', glyph: 'chapeu', grupo: 'roupa', foco: 'rosto' },
  { field: 'blusa', label: 'CAMISAS', title: 'Camisas', glyph: 'blusa', grupo: 'roupa', foco: 'tronco' },
  { field: 'calca', label: 'CALCA', title: 'Calca', glyph: 'calca', grupo: 'roupa', foco: 'pernas' },
  { field: 'calcado', label: 'CALCADO', title: 'Calcado', glyph: 'calcado', grupo: 'roupa', foco: 'pes' },
  { field: 'colar', label: 'COLAR', title: 'Colar', glyph: 'colar', grupo: 'roupa', foco: 'pescoco' },
  { field: 'anelAcess', label: 'ANEL', title: 'Anel', glyph: 'anel', grupo: 'roupa', foco: 'maos' },
  { field: 'relogio', label: 'RELOGIO', title: 'Relogio', glyph: 'relogio', grupo: 'roupa', foco: 'maos' },
  { field: 'tatuagem', label: 'TATUAGEM', title: 'Tatuagem', glyph: 'tatuagem', grupo: 'roupa', foco: 'tronco' },
]

// Normaliza: toda aba ganha `id` e `campos`, entao ninguem mais precisa testar
// se a aba e simples ou composta.
for (const d of TAB_DEFS) {
  if (!d.id) d.id = d.field
  if (!d.campos) d.campos = [{ field: d.field, title: d.title }]
}

/** Chaveado por ID DE ABA (que na maioria dos casos e o proprio campo). */
export const DEF_POR_CAMPO = new Map(TAB_DEFS.map((d) => [d.id, d]))

/** Todos os campos da aparencia que alguma aba mexe, sem repetir. */
export const CAMPOS_TODOS = (() => {
  const out = []
  for (const d of TAB_DEFS) for (const c of d.campos) if (out.indexOf(c.field) < 0) out.push(c.field)
  return out
})()

/** Aba com pelo menos uma lista de verdade. Catalogo vazio nao vira aba. */
export function abaTemCatalogo(idAba) {
  const d = DEF_POR_CAMPO.get(idAba)
  if (!d) return false
  return d.campos.some((c) => catalogo(c.field).length > 0)
}

/**
 * Traducao do foco pro vocabulario ANTIGO, o unico que game.beginPreview
 * entende (main.js: rosto | corpo | pescoco | pes | mao | braco).
 *
 * Mandar 'tronco' pra la nao explode — o main faz `FOCOS[focus] || FOCOS.rosto`
 * — mas cai no CLOSE DE ROSTO, e escolher calca com a camera colada na testa e
 * a queixa que fez o palco existir.
 */
const FOCO_LEGADO = {
  tronco: 'corpo', pernas: 'corpo', maos: 'mao',
}

function idsDoGrupo(grupo) {
  return TAB_DEFS.filter((d) => d.grupo === grupo).map((d) => d.id)
}

export const GRUPO_ROSTO = idsDoGrupo('rosto')
export const GRUPO_ROUPA = idsDoGrupo('roupa')

// open(kind) aceita os nomes novos e os antigos ('hair'/'face' = a cadeira do
// barbeiro de antes, que so mexia no rosto).
const KIND_TABS = {
  rosto: GRUPO_ROSTO,
  roupa: GRUPO_ROUPA,
  all: GRUPO_ROSTO.concat(GRUPO_ROUPA),
  hair: GRUPO_ROSTO,
  face: GRUPO_ROSTO,
  barbeiro: GRUPO_ROSTO,
  provador: GRUPO_ROUPA,
}

// Cabecalho por grupo.
const KIND_HEAD = {
  rosto: { kicker: 'CADEIRA DO BARBEIRO', title: 'Novo visual', npc: 'ZEZO' },
  roupa: { kicker: 'PROVADOR', title: 'Provar roupa', npc: 'ROSA' },
  all: { kicker: 'BARBEIRO E PROVADOR', title: 'Visual completo', npc: 'ZEZO' },
}

// Apelidos antigos aceitos na LEITURA de game.appearance (o jogo pode ter sido
// salvo antes da reforma dos 20 campos).
const APELIDOS = {
  cabelo: 'hair', olhos: 'eyes', sobrancelha: 'brows', boca: 'mouth', corCabelo: 'hairColor',
}

/** Nome que aparece no card. Os catalogos usam `nome`; os antigos, `name`. */
export function nomeDe(opt, i) {
  if (opt && typeof opt.nome === 'string' && opt.nome) return opt.nome
  if (opt && typeof opt.name === 'string' && opt.name) return opt.name
  if (opt && typeof opt.id === 'string' && opt.id) return opt.id
  return 'Opcao ' + (i + 1)
}

/** Aba de amostra de cor: quando TODA opcao do catalogo traz um hex proprio. */
export function ehAmostra(list) {
  return list.length > 0 && list.every((o) => o && typeof o.hex === 'number')
}

// hex pode vir como 0xrrggbb (three) ou como string css
export function cssHex(h) {
  if (typeof h === 'string') return h
  const n = (Number(h) >>> 0) & 0xffffff
  return '#' + n.toString(16).padStart(6, '0')
}

export function el(tag, cls, text) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

function callSafe(obj, name, ...args) {
  if (obj && typeof obj[name] === 'function') {
    try { return obj[name](...args) } catch (err) { console.warn('[customizer] ' + name + ':', err) }
  }
  return undefined
}

function agora() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}

export function injectStyle() {
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

const CSS = `
.mcrp-cz, .mcrp-cz *{ box-sizing:border-box; }
.mcrp-cz{
  position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:flex-end;
  padding:clamp(10px,3vw,44px);
  font-family:"Trebuchet MS","Segoe UI",system-ui,sans-serif;
  color:#e8edf7; opacity:0; pointer-events:none;
  transition:opacity .16s ease; -webkit-font-smoothing:antialiased;
}
.mcrp-cz.is-open{ opacity:1; pointer-events:auto; }
.mcrp-cz .cz-veil{
  position:absolute; inset:0;
  background:radial-gradient(115% 95% at 22% 52%, rgba(0,0,0,0) 34%, rgba(3,5,9,.42) 74%, rgba(3,5,9,.70) 100%);
}
.mcrp-cz .cz-panel{
  position:relative; width:min(600px,100%); max-height:100%;
  display:flex; flex-direction:column; overflow:hidden;
  background:linear-gradient(158deg, rgba(26,29,39,.90), rgba(12,14,20,.95));
  -webkit-backdrop-filter:blur(20px) saturate(150%); backdrop-filter:blur(20px) saturate(150%);
  border:1px solid rgba(255,255,255,.11); border-radius:22px;
  box-shadow:0 32px 90px rgba(0,0,0,.60), 0 2px 0 rgba(255,255,255,.05) inset;
  transform:translateY(20px) scale(.975); opacity:0;
  transition:transform .26s cubic-bezier(.18,.9,.3,1.1), opacity .2s ease;
  outline:none;
}
.mcrp-cz.is-open .cz-panel{ transform:none; opacity:1; }

/* faixa poste de barbeiro no topo */
.mcrp-cz .cz-pole{
  height:5px; flex:0 0 auto;
  background:repeating-linear-gradient(115deg,#e24b45 0 12px,#f2efe8 12px 24px,#3b6fd6 24px 36px,#f2efe8 36px 48px);
  opacity:.9;
}
.mcrp-cz .cz-head{ padding:16px 20px 0; }
.mcrp-cz .cz-kicker{
  font-size:10.5px; letter-spacing:.22em; text-transform:uppercase;
  color:#ffb84d; opacity:.9; font-weight:700;
}
.mcrp-cz .cz-title{ margin:2px 0 12px; font-size:24px; font-weight:700; letter-spacing:.01em; }

/* --- barra de abas -------------------------------------------------------
   As setas de ponta TROCAM DE ABA (nao rolam a faixa): "entrar em nova aba"
   com um clique era o que faltava. Elas apagam de verdade nas pontas, e a aba
   escolhida DESLIZA pro centro em vez de pular pra dentro da vista. */
.mcrp-cz .cz-tabnav{ display:flex; align-items:center; gap:7px; }
.mcrp-cz .cz-navbtn{
  appearance:none; cursor:pointer; font:inherit; font-size:14px; font-weight:700; line-height:1;
  width:28px; height:28px; padding:0; border-radius:9px; flex:0 0 auto; color:#dfe5f0;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  transition:background .14s, transform .1s, opacity .18s, color .14s;
}
.mcrp-cz .cz-navbtn:hover{ background:rgba(255,206,116,.20); color:#ffce74; }
.mcrp-cz .cz-navbtn:active{ transform:scale(.9); }
.mcrp-cz .cz-navbtn[disabled]{ opacity:.22; cursor:default; transform:none; background:rgba(255,255,255,.03); }
.mcrp-cz .cz-navbtn[disabled]:hover{ background:rgba(255,255,255,.03); color:#dfe5f0; }

.mcrp-cz .cz-tabs{
  position:relative; flex:1 1 auto; min-width:0;
  display:flex; gap:6px; flex-wrap:nowrap;
  overflow-x:auto; overflow-y:hidden; padding-bottom:9px;
  scrollbar-width:none; overscroll-behavior-x:contain;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 14px,#000 calc(100% - 14px),transparent 100%);
}
.mcrp-cz .cz-tabs::-webkit-scrollbar{ height:0; }
/* pilula dourada que escorrega de uma aba pra outra: e ela que da a leitura de
   "entrei numa aba", que o troca-cor seco nao dava */
.mcrp-cz .cz-tabmark{
  position:absolute; left:0; top:0; height:30px; width:0; border-radius:999px; opacity:0;
  background:linear-gradient(180deg,#ffce74,#f0a93a);
  box-shadow:0 4px 16px rgba(240,169,58,.30);
  transform:translateX(0); pointer-events:none; z-index:0;
  transition:transform .30s cubic-bezier(.22,.92,.28,1.04), width .30s cubic-bezier(.22,.92,.28,1.04), opacity .18s ease;
}
.mcrp-cz .cz-tab{
  position:relative; z-index:1;
  flex:0 0 auto; appearance:none; cursor:pointer; font:inherit; font-size:11px; font-weight:700; letter-spacing:.08em;
  padding:8px 12px; border-radius:999px; color:#aab3c4; white-space:nowrap;
  background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.08);
  transition:background .14s, color .14s, border-color .14s, transform .12s;
}
.mcrp-cz .cz-tab:hover{ color:#eef2fa; background:rgba(255,255,255,.09); }
.mcrp-cz .cz-tab.is-active{
  color:#20232c; background:transparent; border-color:rgba(255,206,116,.55);
}
/* separador entre o grupo do rosto e o grupo da roupa (so no modo 'all') */
.mcrp-cz .cz-tabsep{
  flex:0 0 auto; align-self:flex-start; width:1px; height:18px; margin:6px 4px 0;
  background:rgba(255,255,255,.16);
}

.mcrp-cz .cz-body{ padding:12px 20px 4px; overflow-y:auto; overflow-x:hidden; }
.mcrp-cz .cz-body::-webkit-scrollbar{ width:8px; }
.mcrp-cz .cz-body::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.14); border-radius:8px; }

.mcrp-cz .cz-sec{ display:none; }
.mcrp-cz .cz-sec.is-active{ display:block; }

/* Aba de VARIAS listas (a de cor: cabelo, barba e pele).
   A linha separadora existe pra o jogador ler tres listas e nao uma grade
   comprida de bolinhas: sem ela, cor de cabelo e cor de barba viravam a mesma
   fileira e escolher a segunda parecia trocar a primeira.
   O realce is-foco so aparece quando ha mais de uma lista — com uma so, ele
   seria um destaque sem alternativa. */
.mcrp-cz .cz-multi .cz-bloco + .cz-bloco{
  margin-top:14px; padding-top:13px; border-top:1px solid rgba(255,255,255,.08);
}
.mcrp-cz .cz-multi .cz-bloco{
  border-left:2px solid transparent; padding-left:9px; margin-left:-11px;
  transition:border-color .16s;
}
.mcrp-cz .cz-multi .cz-bloco.is-foco{ border-left-color:rgba(255,184,77,.55); }
.mcrp-cz .cz-multi .cz-legenda{ margin-bottom:0; }

.mcrp-cz .cz-secbar{ display:flex; align-items:center; gap:9px; margin:2px 0 11px; }
.mcrp-cz .cz-seclabel{
  flex:1; min-width:0; font-size:10.5px; letter-spacing:.18em; text-transform:uppercase;
  color:#8b93a5; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.mcrp-cz .cz-count{
  flex:0 0 auto; font-size:11px; font-weight:700; letter-spacing:.06em; color:#ffce74;
  font-variant-numeric:tabular-nums; padding:3px 9px; border-radius:999px;
  background:rgba(255,206,116,.10); border:1px solid rgba(255,206,116,.24);
}
.mcrp-cz .cz-arrow{
  appearance:none; cursor:pointer; font:inherit; font-size:15px; font-weight:700; line-height:1;
  width:30px; height:30px; padding:0; border-radius:10px; color:#dfe5f0; flex:0 0 auto;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.1);
  transition:background .12s, transform .1s;
}
.mcrp-cz .cz-arrow:hover{ background:rgba(255,255,255,.14); }
.mcrp-cz .cz-arrow:active{ transform:scale(.9); }

/* minmax(0,1fr) e nao 1fr: com '1fr' o minimo da coluna e o tamanho min-content
   do card, e num painel estreito (o da tela de criacao tem 460 px) a terceira
   coluna vazava pra fora do painel em vez de encolher. */
.mcrp-cz .cz-grid{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
.mcrp-cz .cz-card{ min-width:0; }
.mcrp-cz .cz-card{
  position:relative; appearance:none; cursor:pointer; font:inherit; text-align:left;
  display:flex; flex-direction:column; gap:8px; padding:9px 9px 9px;
  border-radius:14px; color:#cfd6e4;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.09);
  transition:transform .14s cubic-bezier(.2,.9,.3,1.3), border-color .14s, background .14s, box-shadow .14s, color .14s;
  /* estado de saida do stagger: o card entra por aqui */
  opacity:0; transform:translateY(9px) scale(.97);
}
.mcrp-cz .cz-card.is-in{
  opacity:1; transform:none;
  transition:opacity .26s ease var(--d,0ms), transform .30s cubic-bezier(.2,.9,.3,1.18) var(--d,0ms),
             border-color .14s, background .14s, box-shadow .14s, color .14s;
}
.mcrp-cz .cz-card.is-in:hover{ transform:translateY(-3px); border-color:rgba(255,206,116,.45); color:#f2f5fb; }
.mcrp-cz .cz-card.is-sel{
  color:#fff; border-color:#ffce74;
  background:linear-gradient(180deg,rgba(255,206,116,.20),rgba(255,206,116,.06));
  box-shadow:0 10px 26px rgba(240,169,58,.22), 0 0 0 1px rgba(255,206,116,.38) inset;
}
.mcrp-cz .cz-card.is-in.is-sel{ transform:translateY(-2px) scale(1.035); }
.mcrp-cz .cz-card.is-in.is-sel:hover{ transform:translateY(-4px) scale(1.045); }

/* --- a foto da peca ------------------------------------------------------
   Vem do provador (mini-palco 3D). Enquanto ela nao chega fica o esqueleto
   com o glifo da categoria por baixo: nunca um buraco no lugar do card. */
.mcrp-cz .cz-thumb{
  position:relative; display:block; width:100%; aspect-ratio:1/1; border-radius:11px;
  overflow:hidden; border:1px solid rgba(255,255,255,.07);
  background:radial-gradient(120% 105% at 50% 28%, rgba(122,144,186,.18), rgba(6,8,13,.55));
}
.mcrp-cz .cz-img{
  position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block;
  opacity:0; transform:scale(1.05);
  transition:opacity .3s ease, transform .34s cubic-bezier(.2,.9,.3,1.15);
}
.mcrp-cz .cz-card.has-img .cz-img{ opacity:1; transform:none; }
.mcrp-cz .cz-skel{
  position:absolute; inset:0; opacity:1; transition:opacity .25s ease;
  background:linear-gradient(100deg, rgba(255,255,255,.02) 28%, rgba(255,255,255,.09) 48%, rgba(255,255,255,.02) 68%);
  background-size:240% 100%; animation:czSkel 1.2s linear infinite;
}
.mcrp-cz .cz-card.has-img .cz-skel{ opacity:0; animation:none; }
/* Sem palco nao vem foto NENHUMA (o main pode nao ter montado o provador). Sem
   esta regra os ~150 cards ficavam com o brilho do esqueleto correndo pra
   sempre: mente sobre um carregamento que nao esta acontecendo e ainda paga
   uma animacao de composicao por card, o quadro inteiro. Cai pro glifo, que e
   o plano B de verdade. */
.mcrp-cz .cz-card.no-img .cz-skel{ opacity:0; animation:none; }
@keyframes czSkel{ from{ background-position:140% 0; } to{ background-position:-140% 0; } }

.mcrp-cz .cz-check{
  position:absolute; right:6px; top:6px; z-index:2;
  width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-size:11px; font-weight:700; color:#231a09; background:#ffce74;
  box-shadow:0 3px 10px rgba(0,0,0,.45);
  opacity:0; transform:scale(.4); transition:opacity .16s ease, transform .2s cubic-bezier(.2,.9,.3,1.5);
}
.mcrp-cz .cz-card.is-sel .cz-check{ opacity:1; transform:none; }

.mcrp-cz .cz-cardfoot{ display:flex; align-items:center; gap:6px; }
.mcrp-cz .cz-num{
  flex:0 0 auto; min-width:22px; text-align:center;
  font-size:10px; font-weight:700; letter-spacing:.05em; padding:2px 5px; border-radius:6px;
  color:#9aa3b5; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.08);
  font-variant-numeric:tabular-nums;
}
.mcrp-cz .cz-card.is-sel .cz-num{ color:#20232c; background:#ffce74; border-color:transparent; }
.mcrp-cz .cz-name{
  flex:1; min-width:0; font-size:12px; font-weight:700; line-height:1.2;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* nome da peca embaixo da grade: e onde cabe o nome inteiro, que no card e
   cortado por reticencias */
.mcrp-cz .cz-legenda{
  display:flex; align-items:baseline; gap:8px; margin:12px 0 2px; min-height:20px;
  border-top:1px dashed rgba(255,255,255,.08); padding-top:9px;
}
.mcrp-cz .cz-legenda b{ font-size:14px; font-weight:700; color:#ffce74; }
.mcrp-cz .cz-legenda span{ font-size:11px; color:#7f889a; letter-spacing:.04em; }

/* glifos css: silhueta simplificada de cada categoria. Servem de esqueleto por
   baixo da foto 3D e de plano B quando o palco nao esta disponivel. A variacao
   por opcao sai da variavel --v (o indice do card), sem uma regra por item. */
.mcrp-cz .cz-glyph{
  position:absolute; left:50%; top:50%; width:52%; height:52%;
  transform:translate(-50%,-50%) scale(calc(.88 + var(--v,0) * .042));
  color:#aeb8cc; opacity:.85; transition:opacity .25s ease;
}
.mcrp-cz .cz-card.has-img .cz-glyph{ opacity:0; }
.mcrp-cz .cz-glyph::before, .mcrp-cz .cz-glyph::after{
  content:''; position:absolute; background:currentColor; opacity:.55;
}
.mcrp-cz .cz-glyph.g-cabeca::before{ left:28%; right:28%; top:2px; bottom:2px; border-radius:48% 48% 44% 44%; }
.mcrp-cz .cz-glyph.g-cabelo::before{ left:6%; right:6%; top:6px; height:16px; border-radius:16px 16px 4px 4px; }
.mcrp-cz .cz-glyph.g-cabelo.v1::before{ left:22%; right:22%; top:0; height:26px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-cabelo.v2::before{ left:4%; right:4%; top:9px; height:22px; border-radius:12px; }
.mcrp-cz .cz-glyph.g-olhos::before{ left:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-olhos::after{ right:16%; top:9px; width:16px; height:16px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-olhos.v1::before, .mcrp-cz .cz-glyph.g-olhos.v1::after{ height:9px; top:13px; border-radius:9px; }
.mcrp-cz .cz-glyph.g-olhos.v2::before, .mcrp-cz .cz-glyph.g-olhos.v2::after{ width:20px; height:20px; top:7px; }
.mcrp-cz .cz-glyph.g-pupila::before{
  left:50%; top:7px; width:20px; height:20px; margin-left:-10px; border-radius:50%;
  background:transparent; border:2px solid currentColor;
}
.mcrp-cz .cz-glyph.g-pupila::after{ left:50%; top:13px; width:8px; height:8px; margin-left:-4px; border-radius:50%; }
.mcrp-cz .cz-glyph.g-nariz::before{ left:50%; top:5px; width:11px; height:20px; margin-left:-5.5px; border-radius:44% 44% 50% 50%; }
.mcrp-cz .cz-glyph.g-nariz::after{ left:50%; top:22px; width:19px; height:6px; margin-left:-9.5px; border-radius:6px; opacity:.32; }
.mcrp-cz .cz-glyph.g-boca::before{ left:24%; right:24%; top:12px; height:6px; border-radius:0 0 14px 14px; }
.mcrp-cz .cz-glyph.g-boca.v1::before{ height:14px; border-radius:0 0 18px 18px; }
.mcrp-cz .cz-glyph.g-boca.v2::before{ top:16px; height:5px; border-radius:14px 14px 0 0; }
.mcrp-cz .cz-glyph.g-boca.v2::after{ left:18%; right:18%; top:6px; height:7px; border-radius:8px; opacity:.4; }
.mcrp-cz .cz-glyph.g-barba::before{ left:22%; right:22%; top:9px; bottom:0; border-radius:8px 8px 22px 22px; }
.mcrp-cz .cz-glyph.g-barba::after{ left:33%; right:33%; top:2px; height:6px; border-radius:6px; opacity:.4; }
.mcrp-cz .cz-glyph.g-sobrancelha::before{ left:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(-8deg); }
.mcrp-cz .cz-glyph.g-sobrancelha::after{ right:14%; top:13px; width:22px; height:6px; border-radius:4px; transform:rotate(8deg); }
.mcrp-cz .cz-glyph.g-sobrancelha.v1::before, .mcrp-cz .cz-glyph.g-sobrancelha.v1::after{ height:9px; transform:none; }
.mcrp-cz .cz-glyph.g-sobrancelha.v2::before{ transform:rotate(12deg); }
.mcrp-cz .cz-glyph.g-sobrancelha.v2::after{ transform:rotate(-12deg); }
.mcrp-cz .cz-glyph.g-pele::before{ left:20%; right:20%; top:4px; bottom:4px; border-radius:11px; }
.mcrp-cz .cz-glyph.g-chapeu::before{ left:6%; right:6%; top:20px; height:7px; border-radius:7px; }
.mcrp-cz .cz-glyph.g-chapeu::after{ left:26%; right:26%; top:5px; height:16px; border-radius:11px 11px 2px 2px; }
.mcrp-cz .cz-glyph.g-blusa::before{ left:18%; right:18%; top:6px; bottom:2px; border-radius:11px 11px 6px 6px; }
.mcrp-cz .cz-glyph.g-blusa::after{ left:40%; right:40%; top:3px; height:8px; border-radius:0 0 9px 9px; opacity:.33; }
.mcrp-cz .cz-glyph.g-calca::before{ left:26%; top:4px; bottom:1px; width:9px; border-radius:5px 5px 3px 3px; }
.mcrp-cz .cz-glyph.g-calca::after{ right:26%; top:4px; bottom:1px; width:9px; border-radius:5px 5px 3px 3px; }
.mcrp-cz .cz-glyph.g-calcado::before{ left:14%; right:14%; top:11px; height:14px; border-radius:7px 13px 8px 4px; }
.mcrp-cz .cz-glyph.g-calcado::after{ left:9%; right:9%; top:25px; height:5px; border-radius:4px; opacity:.33; }
.mcrp-cz .cz-glyph.g-colar::before{
  left:50%; top:4px; width:24px; height:24px; margin-left:-12px; border-radius:50%;
  background:transparent; border:3px solid currentColor;
}
.mcrp-cz .cz-glyph.g-colar::after{ left:50%; top:24px; width:8px; height:9px; margin-left:-4px; border-radius:3px; }
.mcrp-cz .cz-glyph.g-anel::before{
  left:50%; top:10px; width:17px; height:17px; margin-left:-8.5px; border-radius:50%;
  background:transparent; border:3px solid currentColor;
}
.mcrp-cz .cz-glyph.g-anel::after{ left:50%; top:4px; width:8px; height:8px; margin-left:-4px; border-radius:50%; opacity:.4; }
.mcrp-cz .cz-glyph.g-relogio::before{ left:50%; top:1px; bottom:1px; width:9px; margin-left:-4.5px; border-radius:4px; opacity:.32; }
.mcrp-cz .cz-glyph.g-relogio::after{ left:50%; top:10px; width:19px; height:16px; margin-left:-9.5px; border-radius:5px; }
.mcrp-cz .cz-glyph.g-tatuagem::before{ left:30%; right:30%; top:1px; bottom:1px; border-radius:7px; opacity:.28; }
.mcrp-cz .cz-glyph.g-tatuagem::after{ left:34%; right:34%; top:11px; height:11px; border-radius:3px; }

/* --- amostras de cor -----------------------------------------------------
   Cor de cabelo e tom de pele NAO viram foto 3D: um circulo da cor ja e a
   informacao inteira, e uma foto do rosto so gastaria render pra dizer menos. */
.mcrp-cz .cz-dots{ display:flex; flex-wrap:wrap; gap:11px; padding:4px 0 2px; }
.mcrp-cz .cz-dot{
  position:relative; appearance:none; cursor:pointer; width:40px; height:40px; padding:0; border-radius:50%;
  background:var(--c,#888); border:2px solid rgba(255,255,255,.16);
  box-shadow:0 3px 10px rgba(0,0,0,.4), inset 0 -6px 10px rgba(0,0,0,.25);
  opacity:0; transform:scale(.7);
  transition:transform .16s cubic-bezier(.2,.9,.3,1.4), border-color .14s, box-shadow .14s, opacity .2s ease;
}
.mcrp-cz .cz-dot.is-in{
  opacity:1; transform:none;
  transition:opacity .22s ease var(--d,0ms), transform .28s cubic-bezier(.2,.9,.3,1.4) var(--d,0ms),
             border-color .14s, box-shadow .14s;
}
.mcrp-cz .cz-dot.is-in:hover{ transform:scale(1.12); }
.mcrp-cz .cz-dot.is-in.is-sel{
  border-color:#ffce74; transform:scale(1.16);
  box-shadow:0 0 0 3px rgba(255,206,116,.28), 0 4px 12px rgba(0,0,0,.45);
}

.mcrp-cz .cz-bubble{
  display:none; position:relative; margin:14px 20px 0; padding:11px 14px;
  background:linear-gradient(180deg,#fdf6e6,#f0e6cf); color:#2a2118;
  border-radius:14px; font-size:13px; font-weight:600; line-height:1.35;
  box-shadow:0 10px 28px rgba(0,0,0,.4);
}
.mcrp-cz .cz-bubble.is-on{ display:block; animation:czPop .26s cubic-bezier(.2,.9,.3,1.4) both; }
.mcrp-cz .cz-bubble::after{
  content:''; position:absolute; left:26px; bottom:-7px; width:14px; height:14px;
  background:#f0e6cf; transform:rotate(45deg); border-radius:2px;
}
.mcrp-cz .cz-bubble b{ display:block; font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:#9a6a2c; }
@keyframes czPop{ from{ opacity:0; transform:translateY(8px) scale(.94); } to{ opacity:1; transform:none; } }

.mcrp-cz .cz-foot{
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding:13px 20px 15px; margin-top:6px;
  border-top:1px solid rgba(255,255,255,.07);
  background:linear-gradient(180deg,rgba(255,255,255,0),rgba(0,0,0,.18));
}
.mcrp-cz .cz-hints{ flex:1; min-width:180px; font-size:10.5px; color:#7f889a; line-height:1.8; }
.mcrp-cz .cz-hints kbd{
  display:inline-block; padding:1px 6px; margin:0 2px; border-radius:5px;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12);
  color:#c7cfdd; font:inherit; font-size:10px;
}
.mcrp-cz .cz-btn{
  appearance:none; cursor:pointer; font:inherit; font-size:13px; font-weight:700;
  padding:10px 20px; border-radius:12px; border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06); color:#dde3ef;
  transition:background .14s, transform .1s, box-shadow .14s;
}
.mcrp-cz .cz-btn:hover{ background:rgba(255,255,255,.13); }
.mcrp-cz .cz-btn:active{ transform:translateY(1px); }
.mcrp-cz .cz-btn.cz-ok{
  color:#221c10; border-color:transparent;
  background:linear-gradient(180deg,#ffd583,#f0a93a);
  box-shadow:0 8px 22px rgba(240,169,58,.32);
}
.mcrp-cz .cz-btn.cz-ok:hover{ background:linear-gradient(180deg,#ffe0a0,#f6b44a); }
.mcrp-cz .cz-btn[disabled]{ opacity:.5; cursor:default; }

@media (max-width:900px){
  .mcrp-cz{ justify-content:center; align-items:flex-end; }
  .mcrp-cz .cz-panel{ width:100%; }
  .mcrp-cz .cz-grid{ grid-template-columns:repeat(2,minmax(0,1fr)); }
}
@media (prefers-reduced-motion:reduce){
  .mcrp-cz .cz-card, .mcrp-cz .cz-dot{ transition-duration:.01ms !important; }
  .mcrp-cz .cz-skel{ animation:none; }
}
`

// ===========================================================================
// PECAS COMPARTILHADAS (o painel do jogo e a tela de criacao usam as mesmas)
// ===========================================================================

/**
 * Barra de abas rolavel com setas de ponta que TROCAM DE ABA.
 *
 * opcoes = { aoTrocar(campo) }
 * devolve { root, montar(campos), setAtiva(campo), ativa(), passo(dir),
 *           remarcar(), destruir() }
 *
 * Tres coisas que a versao anterior nao fazia e o dono do jogo cobrou:
 *  - a aba escolhida desliza pro centro (scroll suave), nunca pula pra dentro;
 *  - as setas apagam de verdade quando nao ha mais aba pra que lado;
 *  - uma pilula dourada escorrega de uma aba pra outra, entao da pra ver que
 *    voce ENTROU em outra aba e nao so que uma cor trocou.
 */
// NENHUM `title` NESTE ARQUIVO, DE PROPOSITO.
//
// O atributo title do navegador vira aquele balaozinho que aparece sozinho um
// segundo depois do mouse parar. Num painel que e uma GRADE DE FOTOS ele so
// atrapalha: o card ja mostra a peca, e o balao surge por cima justamente da
// foto que a pessoa esta olhando pra decidir. Foi pedido pra sair.
//
// No lugar dele ficou aria-label: a mesma informacao pro leitor de tela, e
// zero pixel na tela de quem enxerga.
export function criarBarraAbas(opcoes = {}) {
  injectStyle()
  const root = el('div', 'cz-tabnav')
  const btnPrev = el('button', 'cz-navbtn', '‹')
  const btnNext = el('button', 'cz-navbtn', '›')
  btnPrev.type = 'button'; btnNext.type = 'button'
  btnPrev.setAttribute('aria-label', 'Aba anterior')
  btnNext.setAttribute('aria-label', 'Proxima aba')
  const faixa = el('div', 'cz-tabs')
  const marca = el('span', 'cz-tabmark')
  faixa.appendChild(marca)
  root.append(btnPrev, faixa, btnNext)

  let campos = []
  let ativa = null
  const botoes = new Map()
  let raf = 0

  function montar(lista, defs) {
    // limpa mantendo a marca (ela e do componente, nao das abas)
    while (faixa.lastChild && faixa.lastChild !== marca) faixa.removeChild(faixa.lastChild)
    if (marca.parentNode !== faixa) faixa.appendChild(marca)
    botoes.clear()
    campos = lista.slice()
    let grupoAnterior = null
    for (const campo of campos) {
      const def = (defs && defs.get(campo)) || DEF_POR_CAMPO.get(campo)
      if (!def) continue
      if (grupoAnterior !== null && def.grupo !== grupoAnterior) faixa.appendChild(el('span', 'cz-tabsep'))
      grupoAnterior = def.grupo
      const b = el('button', 'cz-tab', def.label)
      b.type = 'button'
      b.setAttribute('aria-label', def.title)
      b.addEventListener('click', () => setAtiva(campo, true))
      faixa.appendChild(b)
      botoes.set(campo, b)
    }
    ativa = null
    atualizarSetas()
  }

  /** Mede o botao ativo e escorrega a pilula pra cima dele. */
  function remarcar() {
    const b = botoes.get(ativa)
    if (!b || !b.offsetWidth) { marca.style.opacity = '0'; return }
    marca.style.opacity = '1'
    marca.style.width = b.offsetWidth + 'px'
    marca.style.height = b.offsetHeight + 'px'
    marca.style.top = b.offsetTop + 'px'
    marca.style.transform = 'translateX(' + b.offsetLeft + 'px)'
  }

  /** Desliza a aba ativa pro centro da faixa. Suave: pular quebra a leitura. */
  function centralizar(b, suave) {
    if (!b) return
    const max = Math.max(0, faixa.scrollWidth - faixa.clientWidth)
    const alvo = Math.max(0, Math.min(max, b.offsetLeft - (faixa.clientWidth - b.offsetWidth) * 0.5))
    if (!suave || typeof faixa.scrollTo !== 'function') { faixa.scrollLeft = alvo; return }
    try { faixa.scrollTo({ left: alvo, behavior: 'smooth' }) } catch (err) { faixa.scrollLeft = alvo }
  }

  function atualizarSetas() {
    const i = campos.indexOf(ativa)
    btnPrev.disabled = !(i > 0)
    btnNext.disabled = !(i >= 0 && i < campos.length - 1)
  }

  function setAtiva(campo, avisar) {
    if (!botoes.has(campo)) return
    ativa = campo
    for (const [k, b] of botoes) b.classList.toggle('is-active', k === campo)
    atualizarSetas()
    const b = botoes.get(campo)
    centralizar(b, true)
    // a medida so vale depois que o layout assentou (o painel pode ter acabado
    // de abrir e a faixa ainda estar com largura zero)
    if (raf) cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => { raf = 0; remarcar() })
    if (avisar) callSafe(opcoes, 'aoTrocar', campo)
  }

  function passo(dir) {
    const i = campos.indexOf(ativa)
    if (i < 0) return
    const j = i + dir
    if (j < 0 || j >= campos.length) return
    setAtiva(campos[j], true)
  }

  function ciclo(dir) {
    const i = campos.indexOf(ativa)
    if (campos.length < 2 || i < 0) return
    setAtiva(campos[((i + dir) % campos.length + campos.length) % campos.length], true)
  }

  btnPrev.addEventListener('click', () => passo(-1))
  btnNext.addEventListener('click', () => passo(+1))

  // roda do mouse sobre as abas rola a faixa na horizontal
  function onWheel(e) {
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    if (!d) return
    faixa.scrollLeft += d
    e.preventDefault()
  }
  faixa.addEventListener('wheel', onWheel, { passive: false })

  return {
    root,
    montar,
    setAtiva,
    passo,
    ciclo,
    remarcar,
    ativa() { return ativa },
    campos() { return campos },
    destruir() {
      if (raf) cancelAnimationFrame(raf)
      faixa.removeEventListener('wheel', onWheel)
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

/**
 * Uma aba inteira: uma ou mais LISTAS, cada uma com a propria barra (setas de
 * item + titulo + contador), a propria grade de cards (ou roda de cores) e a
 * propria legenda.
 *
 * Quase toda aba tem uma lista so. A de COR tem tres — cor do cabelo, cor da
 * barba e tom de pele — porque o dono pediu as tres juntas, e com razao: com
 * uma aba por cor, comparar barba com cabelo obrigava a sair de uma aba, entrar
 * na outra e voltar, que e exatamente o que ninguem faz.
 *
 * opcoes = {
 *   aoEscolher(campo, indice),
 *   miniatura(campo, indice) -> dataURL | null   // do provador; opcional
 * }
 *
 * devolve {
 *   campo (= id da aba), def, root, campos: [campos das listas],
 *   list  -> a lista do bloco ATIVO (o ultimo mexido); as APIs antigas leem daqui
 *   setIndice(i) / indice()            -> bloco ativo
 *   setIndiceDe(campo, i) / indiceDe(campo),
 *   sincronizar(obj) -> le obj[campo] em TODOS os blocos e devolve os indices
 *                       ja normalizados,
 *   passoItem(dir), entrar(), sair(), esquecerFotos(), destruir()
 * }
 */
export function criarSecao(idAba, opcoes = {}) {
  injectStyle()
  const def = DEF_POR_CAMPO.get(idAba) || {
    id: idAba, field: idAba, label: String(idAba).toUpperCase(), title: String(idAba),
    glyph: 'blusa', grupo: 'roupa', foco: 'corpo',
    campos: [{ field: idAba, title: String(idAba) }],
  }

  const root = el('section', 'cz-sec')
  const blocos = []
  let ativo = 0

  for (const spec of def.campos) {
    const b = criarBloco(spec, def, opcoes, () => {
      const i = blocos.indexOf(b)
      if (i >= 0) { ativo = i; marcarFoco() }
    })
    if (!b) continue
    blocos.push(b)
    root.appendChild(b.root)
  }

  // Com uma lista so, destacar "a lista ativa" seria um realce sem alternativa.
  const multi = blocos.length > 1
  root.classList.toggle('cz-multi', multi)

  function marcarFoco() {
    if (!multi) return
    for (let i = 0; i < blocos.length; i++) blocos[i].root.classList.toggle('is-foco', i === ativo)
  }
  marcarFoco()

  function bloco() { return blocos[ativo] || blocos[0] || null }
  function blocoDe(campo) {
    for (const b of blocos) if (b.campo === campo) return b
    return null
  }

  return {
    campo: def.id,
    def,
    root,
    campos: blocos.map((b) => b.campo),
    /** Campo da lista que o teclado esta mexendo (a ultima que o jogador tocou). */
    campoAtivo() { const b = bloco(); return b ? b.campo : def.field },
    get list() { const b = bloco(); return b ? b.list : [] },
    get cards() { const b = bloco(); return b ? b.cards : [] },
    setIndice(i) { const b = bloco(); if (b) b.setIndice(i) },
    indice() { const b = bloco(); return b ? b.indice() : 0 },
    setIndiceDe(campo, i) { const b = blocoDe(campo); if (b) b.setIndice(i) },
    indiceDe(campo) { const b = blocoDe(campo); return b ? b.indice() : 0 },
    /**
     * Le os indices de `obj` (a aparencia) em todos os blocos e devolve o que
     * ficou de verdade. Existe porque o indice guardado pode nao existir mais
     * no catalogo — uma aparencia salva antes de alguem apagar uma barba —, e
     * quem chamou precisa gravar de volta o valor normalizado.
     */
    sincronizar(obj) {
      const fora = {}
      for (const b of blocos) {
        b.setIndice(obj && typeof obj[b.campo] === 'number' ? obj[b.campo] | 0 : 0)
        fora[b.campo] = b.indice()
      }
      return fora
    },
    passoItem(dir) { const b = bloco(); if (b) b.passoItem(dir) },
    entrar() { for (const b of blocos) b.entrar() },
    sair() { for (const b of blocos) b.sair() },
    esquecerFotos() { for (const b of blocos) b.esquecerFotos() },
    destruir() {
      for (const b of blocos) b.destruir()
      blocos.length = 0
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

/**
 * Uma LISTA dentro de uma aba: barra, grade de cards (ou roda de cores) e o
 * nome da peca embaixo. E o corpo do antigo criarSecao, inteiro.
 *
 * `aoFocar` avisa a aba que este bloco virou o alvo do teclado — sem isso, numa
 * aba de tres listas as setas mexeriam sempre na primeira, independente de onde
 * o jogador clicou.
 *
 * ENTRAR faz o stagger: os cards aparecem um 22 ms depois do outro e as fotos
 * 3D vao sendo pedidas dentro de um orcamento de tempo por quadro. Renderizar
 * doze miniaturas de uma vez travaria a tela exatamente durante a animacao que
 * deveria disfarcar o custo.
 */
function criarBloco(spec, def, opcoes, aoFocar) {
  const campo = spec.field
  const list = catalogo(campo)
  if (list.length === 0) return null
  const amostra = ehAmostra(list)
  const temFoto = !amostra && typeof opcoes.miniatura === 'function'

  const root = el('div', 'cz-bloco')

  const bar = el('div', 'cz-secbar')
  const prev = el('button', 'cz-arrow', '‹')
  const next = el('button', 'cz-arrow', '›')
  prev.type = 'button'; next.type = 'button'
  prev.setAttribute('aria-label', 'Anterior')
  next.setAttribute('aria-label', 'Proximo')
  prev.addEventListener('click', () => { aoFocar(); passoItem(-1) })
  next.addEventListener('click', () => { aoFocar(); passoItem(+1) })
  const label = el('span', 'cz-seclabel', spec.title || def.title)
  const contador = el('span', 'cz-count', '0/0')
  bar.append(prev, next, label, contador)
  root.appendChild(bar)

  const cards = []
  const imagens = []
  let caixa = null

  if (amostra) {
    caixa = el('div', 'cz-dots')
    list.forEach((opt, i) => {
      const dot = el('button', 'cz-dot')
      dot.type = 'button'
      dot.style.setProperty('--c', cssHex(opt && opt.hex))
      dot.style.setProperty('--d', Math.min(i, 14) * 22 + 'ms')
      dot.setAttribute('aria-label', nomeDe(opt, i))
      dot.title = nomeDe(opt, i)
      dot.addEventListener('click', () => { aoFocar(); escolher(i) })
      caixa.appendChild(dot)
      cards.push(dot)
      imagens.push(null)
    })
  } else {
    caixa = el('div', 'cz-grid')
    list.forEach((opt, i) => {
      const card = el('button', 'cz-card')
      card.type = 'button'
      card.style.setProperty('--v', String(i))
      card.style.setProperty('--d', Math.min(i, 14) * 22 + 'ms')
      card.setAttribute('aria-label', nomeDe(opt, i))

      const thumb = el('span', 'cz-thumb')
      const glifo = el('span', 'cz-glyph g-' + def.glyph + ' v' + i)
      thumb.appendChild(glifo)
      let img = null
      if (temFoto) {
        thumb.appendChild(el('span', 'cz-skel'))
        img = el('img', 'cz-img')
        img.alt = ''
        img.draggable = false
        thumb.appendChild(img)
      }
      const check = el('span', 'cz-check', '✓')

      const rodape = el('div', 'cz-cardfoot')
      rodape.append(
        el('span', 'cz-num', String(i + 1).padStart(2, '0')),
        el('span', 'cz-name', nomeDe(opt, i)),
      )

      card.append(thumb, check, rodape)
      card.addEventListener('click', () => { aoFocar(); escolher(i) })
      caixa.appendChild(card)
      cards.push(card)
      imagens.push(img)
    })
  }
  root.appendChild(caixa)

  const legenda = el('div', 'cz-legenda')
  const legNome = el('b', null, '')
  const legInfo = el('span', null, '')
  legenda.append(legNome, legInfo)
  root.appendChild(legenda)

  let indice = 0
  let raf = 0
  let cursor = 0
  let fotosVelhas = false

  function escolher(i) {
    const n = list.length
    if (n === 0) return
    const j = ((i % n) + n) % n
    setIndice(j)
    callSafe(opcoes, 'aoEscolher', campo, j)
  }

  function passoItem(dir) { escolher(indice + dir) }

  function setIndice(i) {
    const n = list.length
    indice = n > 0 ? ((i % n) + n) % n : 0
    for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('is-sel', k === indice)
    contador.textContent = (n ? indice + 1 : 0) + '/' + n
    legNome.textContent = n ? nomeDe(list[indice], indice) : '—'
    legInfo.textContent = n > 1 ? (indice + 1) + ' de ' + n + ' opcoes' : ''
    prev.disabled = n < 2
    next.disabled = n < 2
  }

  /** Pede a foto 3D deste card ao provador (sincrona) e liga o crossfade. */
  function pedirFoto(i) {
    const img = imagens[i]
    if (!img || img.dataset.pronta === '1') return
    let url = null
    try { url = opcoes.miniatura(campo, i) } catch (err) { console.warn('[customizer] miniatura:', err) }
    // Nao marcamos 'pronta': se o palco aparecer depois, o proximo entrar()
    // tenta de novo. Mas apagamos o esqueleto agora, senao ele finge um
    // carregamento eterno num card que nunca vai ter foto.
    if (!url) { cards[i].classList.add('no-img'); return }
    cards[i].classList.remove('no-img')
    img.src = url
    img.dataset.pronta = '1'
    cards[i].classList.add('has-img')
  }

  function tick() {
    raf = 0
    const t0 = agora()
    while (cursor < cards.length) {
      const i = cursor++
      cards[i].classList.add('is-in')
      if (temFoto) pedirFoto(i)
      // orcamento por quadro. Miniatura em cache custa ~0 e a grade inteira
      // acende de uma vez (o atraso do CSS faz o stagger); miniatura nova custa
      // um render de verdade, e ai sai de uma a duas por quadro.
      if (agora() - t0 > 7) break
    }
    if (cursor < cards.length) raf = requestAnimationFrame(tick)
  }

  /** Chamado ao entrar na aba: reencena a grade do zero. */
  function entrar() {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    if (fotosVelhas) {
      // A aparencia base mudou enquanto esta aba estava escondida, entao as
      // fotos daqui mostram a roupa velha. Pedir de novo AGORA (e nao no
      // instante da mudanca) e o que dilui o custo: quem trocou de camiseta
      // pagou por uma aba, nao pelas dezessete.
      fotosVelhas = false
      for (let i = 0; i < imagens.length; i++) {
        const img = imagens[i]
        if (!img) continue
        img.dataset.pronta = ''
        cards[i].classList.remove('has-img')
        cards[i].classList.remove('no-img')
      }
    }
    cursor = 0
    for (let i = 0; i < cards.length; i++) cards[i].classList.remove('is-in')
    raf = requestAnimationFrame(tick)
  }

  /** Some da vista: cancela o trabalho pendente e rearma a animacao de entrada. */
  function sair() {
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    for (let i = 0; i < cards.length; i++) cards[i].classList.remove('is-in')
  }

  /** As fotos velharam (a aparencia base mudou); refeitas no proximo entrar(). */
  function esquecerFotos() {
    if (temFoto) fotosVelhas = true
  }

  setIndice(0)

  return {
    campo,
    def,
    list,
    root,
    cards,
    setIndice,
    indice() { return indice },
    passoItem,
    entrar,
    sair,
    esquecerFotos,
    destruir() {
      sair()
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

// ===========================================================================
// O PAINEL DO JOGO
// ===========================================================================

export function createCustomizer(game) {
  injectStyle()

  // --- DOM base (criado uma vez; o conteudo das abas e refeito a cada open) --
  const root = el('div', 'mcrp-cz')
  root.setAttribute('aria-hidden', 'true')
  const veil = el('div', 'cz-veil')
  const panel = el('div', 'cz-panel')
  panel.tabIndex = -1

  const pole = el('div', 'cz-pole')
  const head = el('div', 'cz-head')
  const kicker = el('div', 'cz-kicker', 'CADEIRA DO BARBEIRO')
  const title = el('h2', 'cz-title', 'Novo visual')
  const abas = criarBarraAbas({ aoTrocar: (campo) => setTab(campo) })
  head.append(kicker, title, abas.root)

  const body = el('div', 'cz-body')
  const bubble = el('div', 'cz-bubble')

  const foot = el('div', 'cz-foot')
  const hints = el('div', 'cz-hints')
  hints.innerHTML =
    '<kbd>&larr;</kbd><kbd>&rarr;</kbd> trocar peca &nbsp; <kbd>1</kbd>-<kbd>9</kbd> escolher &nbsp; <kbd>Tab</kbd> aba<br>' +
    '<kbd>Enter</kbd> pronto &nbsp; <kbd>Esc</kbd> cancelar'
  const btnCancel = el('button', 'cz-btn cz-cancel', 'Cancelar')
  const btnOk = el('button', 'cz-btn cz-ok', 'Pronto')
  btnCancel.type = 'button'; btnOk.type = 'button'
  foot.append(hints, btnCancel, btnOk)

  panel.append(pole, head, body, bubble, foot)
  root.append(veil, panel)
  document.body.appendChild(root)

  // --- Estado ---------------------------------------------------------------
  let opened = false
  let snapshot = null      // aparencia no momento da abertura (para cancelar)
  let tabKeys = []         // campos visiveis no kind atual
  let activeTab = null
  let activeKind = 'all'
  let closing = false
  let bubbleTimer = 0
  let npcNome = 'ZEZO'
  const sections = new Map()   // id da aba -> secao
  const secaoDoCampo = new Map() // campo da aparencia -> a secao que o mostra

  // Um indice por CAMPO da aparencia (nao por aba: a aba de cor mexe em tres).
  // Nasce zerado e e relido de game.appearance a cada abertura.
  const state = {}
  for (const f of CAMPOS_TODOS) state[f] = 0

  // --- O PALCO --------------------------------------------------------------
  // Quem monta o provador e o main.js (ele e dono do renderer); aqui so
  // procuramos o objeto. Enquanto ele nao existir o painel funciona igual, so
  // que sem foto nos cards e com a camera antiga — nada quebra.
  function palcoObj() {
    return (game && (game.provador || game.palco)) || null
  }

  /** Foto da peca, se houver palco. Sincrona (ver o cabecalho do provador). */
  function miniatura(field, i) {
    const pv = palcoObj()
    if (!pv || typeof pv.miniatura !== 'function') return null
    return pv.miniatura(field, i)
  }

  /**
   * Aponta o palco pra parte que esta sendo mexida.
   * Chama game.beginPreview (contrato antigo, que o main usa pra travar o
   * jogador e trocar o modo de camera) E o provador direto, pra o palco
   * acompanhar mesmo antes de o main repassar o foco.
   */
  function enquadrar(foco) {
    callSafe(game, 'beginPreview', FOCO_LEGADO[foco] || foco)
    const pv = palcoObj()
    if (pv && typeof pv.focar === 'function') pv.focar(foco)
  }

  /**
   * O painel come o lado direito da tela; sem desviar, o boneco fica METADE
   * atras dele — foi assim que a aba de calcado mostrava o pedestal inteiro e o
   * tenis escondido na borda. O desvio anda a camera DE LADO (travelling), nao
   * gira: girar deixaria o personagem de perfil justamente na hora de escolher
   * o rosto. Mesma conta de src/ui/criacao.js, de proposito — o palco e o
   * mesmo, e dois numeros diferentes dariam dois enquadramentos pra mesma peca.
   */
  function ajustarDesvio() {
    const pv = palcoObj()
    if (!pv || typeof pv.setDesvio !== 'function') return
    const largura = window.innerWidth || 1280
    // abaixo de 880 px o painel cobre a tela inteira: ai centralizar e o certo
    if (!opened || largura < 880) { pv.setDesvio(0); return }
    const painelPx = Math.min(620, panel.getBoundingClientRect().width || 600)
    pv.setDesvio(Math.max(0, Math.min(0.32, (painelPx / largura) * 0.52)))
  }

  // --- Helpers de integracao com o game -------------------------------------
  function apply(patch) {
    callSafe(game, 'setAppearance', patch)
    // O palco tem o proprio boneco: sem esta linha ele so mudaria se o main
    // lembrasse de repassar. setAparencia compara antes de mexer, entao chamar
    // duas vezes com o mesmo patch nao custa nem invalida cache a toa.
    const pv = palcoObj()
    if (pv && typeof pv.setAparencia === 'function') pv.setAparencia(patch)
  }

  function readAppearance() {
    const a = (game && game.appearance) || {}
    for (const f of CAMPOS_TODOS) {
      let v = a[f]
      // aparencia antiga (hair/eyes/brows/mouth/hairColor) ainda e aceita
      if (typeof v !== 'number' && APELIDOS[f]) v = a[APELIDOS[f]]
      state[f] = typeof v === 'number' && isFinite(v) ? v : 0
    }
  }

  function clampState() {
    for (const f of CAMPOS_TODOS) {
      const n = catalogo(f).length
      state[f] = n > 0 ? ((state[f] % n) + n) % n : 0
    }
  }

  // --- Construcao das abas --------------------------------------------------
  function buildTabs(kind) {
    for (const s of sections.values()) s.destruir()
    sections.clear()
    body.innerHTML = ''

    // so entra aba com catalogo de verdade: catalogo vazio viraria uma aba
    // morta — e e exatamente o caso de JAQUETAS depois da fusao com BLUSAS
    secaoDoCampo.clear()
    tabKeys = (KIND_TABS[kind] || KIND_TABS.all).filter(abaTemCatalogo)
    if (tabKeys.length === 0) tabKeys = ['cabelo']

    abas.montar(tabKeys, DEF_POR_CAMPO)

    for (const idAba of tabKeys) {
      const sec = criarSecao(idAba, {
        aoEscolher: (c, i) => select(c, i),
        miniatura,
      })
      body.appendChild(sec.root)
      sections.set(idAba, sec)
      for (const f of sec.campos) secaoDoCampo.set(f, sec)
    }
  }

  function setTab(campo) {
    const s = sections.get(campo)
    if (!s) return
    const antes = activeTab
    activeTab = campo
    for (const [k, sec] of sections) {
      const on = k === campo
      sec.root.classList.toggle('is-active', on)
      if (!on && k === antes) sec.sair()
    }
    abas.setAtiva(campo, false)
    body.scrollTop = 0
    s.entrar()
    // e AQUI que o palco aproxima da parte que esta sendo mexida
    if (opened) enquadrar(s.def.foco)
  }

  function cycleTab(dir) {
    abas.ciclo(dir)
  }

  // --- Selecao --------------------------------------------------------------
  // `campo` aqui e o CAMPO DA APARENCIA, nao a aba: a aba de cor mexe em tres
  // campos e cada um tem o proprio indice.
  function select(campo, index) {
    const s = secaoDoCampo.get(campo)
    if (!s) return
    const n = catalogo(campo).length
    if (n === 0) return
    const i = ((index % n) + n) % n
    s.setIndiceDe(campo, i)
    if (state[campo] === i) return
    state[campo] = i
    apply({ [campo]: i })   // preview ao vivo
    // trocar de peca invalida as fotos das OUTRAS abas (o provador sabe quais);
    // marcamos as secoes pra pedirem de novo quando o jogador entrar nelas
    for (const [k, sec] of sections) if (sec !== s) sec.esquecerFotos()
  }

  /** Passo de item na LISTA ATIVA da aba (a ultima que o jogador tocou). */
  function step(idAba, dir) {
    const s = sections.get(idAba)
    if (!s || s.list.length === 0) return
    select(s.campoAtivo(), s.indice() + dir)
  }

  /** Escolha direta (Home/End/1..9) na LISTA ATIVA da aba. */
  function selectNaAba(idAba, i) {
    const s = sections.get(idAba)
    if (!s || s.list.length === 0) return
    select(s.campoAtivo(), i)
  }

  function refresh() {
    for (const s of sections.values()) {
      const fora = s.sincronizar(state)
      for (const f in fora) state[f] = fora[f]
    }
  }

  // --- Teclado --------------------------------------------------------------
  function onKey(e) {
    if (!opened) return
    const k = e.key
    let used = true
    if (k === 'Escape') finish(false)
    else if (k === 'Enter' || k === 'NumpadEnter') confirm()
    else if (k === 'Tab') cycleTab(e.shiftKey ? -1 : 1)
    else if (k === 'ArrowLeft' || k === 'a' || k === 'A') step(activeTab, -1)
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') step(activeTab, +1)
    else if (k === 'ArrowUp') cycleTab(-1)
    else if (k === 'ArrowDown') cycleTab(1)
    else if (k === 'PageUp') abas.passo(-1)
    else if (k === 'PageDown') abas.passo(+1)
    else if (k === 'Home') selectNaAba(activeTab, 0)
    else if (k === 'End') {
      const s = sections.get(activeTab)
      if (s) selectNaAba(activeTab, s.list.length - 1)
      else used = false
    } else if (k === 'c' || k === 'C') {
      // atalho velho do barbeiro: pula direto pra aba de cores; ja estando la,
      // so avanca a lista ativa
      if (activeTab === 'cor') step('cor', +1)
      else if (sections.has('cor')) setTab('cor')
      else used = false
    } else if (k >= '1' && k <= '9') selectNaAba(activeTab, Number(k) - 1)
    else used = false
    if (used) { e.preventDefault(); e.stopPropagation() }
  }

  // engole cliques para o main nao re-travar o pointer no painel
  function swallow(e) { e.stopPropagation() }

  // se algo re-travar o mouse com o painel aberto, solta de novo
  function onPointerLockChange() {
    if (opened && document.pointerLockElement) {
      try { document.exitPointerLock() } catch (err) { void err }
    }
  }

  // a aba ativa muda de largura quando a janela muda: a pilula tem que seguir
  function onResize() { if (opened) { abas.remarcar(); ajustarDesvio() } }

  // --- Balao do NPC ---------------------------------------------------------
  function showBubble(text) {
    bubble.innerHTML = ''
    bubble.append(el('b', null, npcNome), document.createTextNode(text))
    bubble.classList.add('is-on')
  }

  function hideBubble() {
    bubble.classList.remove('is-on')
    bubble.innerHTML = ''
  }

  // --- Abrir / fechar -------------------------------------------------------

  /** 'hair'/'face' continuam valendo: viram o grupo do rosto. */
  function normalizaKind(kind) {
    const k = String(kind || 'all')
    return KIND_TABS[k] ? k : 'all'
  }

  function open(kind, opts = {}) {
    const alvo = normalizaKind(kind)

    // ja aberto: se e o mesmo grupo so volta pra primeira aba; se e outro
    // (o jogador saiu do barbeiro e foi no provador) remonta as abas
    if (opened) {
      if (alvo !== activeKind) {
        activeKind = alvo
        buildTabs(alvo)
        aplicaCabecalho(alvo, opts)
      }
      refresh()
      setTab(tabKeys[0])
      return
    }

    opened = true
    closing = false
    activeKind = alvo

    readAppearance()
    clampState()
    // snapshot so dos campos deste painel: e o que o Cancelar restaura
    snapshot = {}
    for (const f of CAMPOS_TODOS) snapshot[f] = state[f]

    buildTabs(alvo)
    aplicaCabecalho(alvo, opts)
    btnOk.disabled = false
    btnCancel.disabled = false
    hideBubble()
    if (opts.intro) showBubble(opts.intro)

    // trava o jogador e solta o mouse enquanto o painel esta aberto
    callSafe(game && game.player, 'setLocked', true)
    try { document.exitPointerLock() } catch (err) { void err }
    document.addEventListener('pointerlockchange', onPointerLockChange)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)

    // o palco comeca com o boneco na aparencia atual e ja no foco da 1a aba
    const pv = palcoObj()
    if (pv && typeof pv.setAparencia === 'function' && game && game.appearance) {
      pv.setAparencia(game.appearance)
    }

    refresh()
    ajustarDesvio()
    // setTab ja avisa o palco do foco da primeira aba (rosto no barbeiro,
    // tronco no provador). opts.focus so serve pra forcar outro.
    setTab(tabKeys[0])
    if (opts.focus) enquadrar(opts.focus)

    root.setAttribute('aria-hidden', 'false')
    requestAnimationFrame(() => { root.classList.add('is-open'); abas.remarcar() })
    setTimeout(() => { if (opened) { panel.focus(); abas.remarcar() } }, 30)
  }

  function aplicaCabecalho(kind, opts) {
    const h = KIND_HEAD[kind] || KIND_HEAD.all
    title.textContent = opts.title || h.title
    kicker.textContent = opts.kicker || h.kicker
    npcNome = opts.npc || h.npc
  }

  function confirm() {
    if (!opened || closing) return
    const line = confirm._line
    callSafe(game, 'toast', activeKind === 'roupa' ? 'Roupa nova!' : 'Novo visual salvo!')
    if (line) {
      // fala do NPC antes de fechar
      closing = true
      btnOk.disabled = true
      btnCancel.disabled = true
      showBubble(line)
      clearTimeout(bubbleTimer)
      bubbleTimer = setTimeout(() => { closing = false; finish(true) }, 1700)
    } else {
      finish(true)
    }
  }

  function finish(save) {
    // devolve o boneco pro centro: o proximo a usar o palco pode ser a tela de
    // criacao, que tem painel de outra largura
    const pvFim = palcoObj()
    if (pvFim && typeof pvFim.setDesvio === 'function') pvFim.setDesvio(0)
    if (!opened) return
    clearTimeout(bubbleTimer)
    closing = false

    // Esc/Cancelar restaura o visual da abertura. So os campos que MUDARAM
    // entram no patch: mandar os 19 de uma vez faria a rede reenviar tudo.
    if (!save && snapshot) {
      const volta = {}
      let mexeu = false
      for (const f of CAMPOS_TODOS) {
        if (state[f] !== snapshot[f]) { volta[f] = snapshot[f]; mexeu = true }
      }
      if (mexeu) apply(volta)
    }

    opened = false
    snapshot = null
    confirm._line = null

    for (const s of sections.values()) s.sair()

    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('pointerlockchange', onPointerLockChange)

    root.classList.remove('is-open')
    root.setAttribute('aria-hidden', 'true')
    setTimeout(() => { if (!opened) hideBubble() }, 220)

    callSafe(game, 'endPreview')
    callSafe(game && game.player, 'setLocked', false) // o main re-trava o mouse no proximo clique
  }

  // --- Listeners fixos ------------------------------------------------------
  btnOk.addEventListener('click', confirm)
  btnCancel.addEventListener('click', () => finish(false))
  for (const ev of ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup', 'wheel', 'contextmenu']) {
    root.addEventListener(ev, swallow)
  }
  veil.addEventListener('click', () => finish(false))

  return {
    root,
    open(kind, opts) {
      const o = opts || {}
      confirm._line = o.npcLine || null
      open(kind, o)
    },
    close() { finish(true) },
    isOpen() { return opened },
    /** Foco atual (o main usa pra saber que parte enquadrar). */
    focus() {
      const s = sections.get(activeTab)
      return s ? s.def.foco : null
    },
    /**
     * O mesmo foco, com o nome que o palco espera. Existe separado de focus()
     * porque focus() e contrato antigo e alguem pode ter passado a depender de
     * receber null quando nao ha aba; palco() sempre devolve um enquadramento
     * valido, e 'corpo' e o que nunca esta errado.
     */
    palco() {
      const s = sections.get(activeTab)
      return (s && s.def.foco) || 'corpo'
    },
    /** Aba (campo da aparencia) que esta sendo mexida. */
    activeField() { return activeTab },
  }
}

export default createCustomizer
