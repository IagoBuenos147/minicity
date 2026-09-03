// ---------------------------------------------------------------------------
// src/bar/receitas.js — O QUE E UM DRINK, E QUANTO ELE VALE.
//
// Este arquivo NAO TEM three.js, NAO TEM DOM e NAO SABE que o cassino existe.
// E a mesma separacao que src/cassino/*.js ja tinha ganhado: as REGRAS de um
// lado, quem desenha e quem paga do outro. O motivo la valia por 84 casos de
// teste sem abrir navegador; aqui vale pelo mesmo motivo e por mais um — a nota
// de um drink e a unica coisa deste sistema inteiro que da pra estar ERRADA sem
// ninguem perceber olhando. Geometria torta aparece na foto; uma proporcao mal
// pontuada nao aparece em lugar nenhum.
//
// O MODELO DE DADOS, e ele e o arquivo todo:
//
//   INGREDIENTE   uma coisa que entra no copo. Tem cor (e a cor que o drink vai
//                 ter), uma FONTE (de onde o jogador tira ela na bancada) e tres
//                 numeros de sabor que nao servem pra nada mecanicamente — eles
//                 existem pro texto do drink improvisado nao ser generico.
//   RECEITA       uma lista de [ingrediente, doses], mais o COPO, o METODO, o
//                 gelo e a guarnicao. Doses sao em unidade de dosador (25 ml),
//                 que e como um barman conta de verdade.
//   PREPARO       o que o jogador FEZ. Mesma forma da receita mais a bagunca:
//                 quanto ele agitou, se derramou, se bateu no liquidificador.
//
// A NOTA E UMA SOMA DE PARCELAS, NAO UM PRODUTO. Testei os dois: multiplicando,
// errar o copo (0.7) junto com esquecer a guarnicao (0.8) ja derrubava um drink
// de proporcao perfeita pra 56, e o jogador nao tem como saber qual das duas
// coisas o puniu. Somando parcelas com peso, cada erro custa um numero fixo que
// da pra explicar em uma linha — e o painel EXPLICA, item a item.
//
// A PROPORCAO E COMPARADA NORMALIZADA, e essa e a decisao que faz o sistema ser
// justo. Dobrar a receita inteira nao e erro nenhum (e um drink duplo); o que e
// erro e a RAZAO entre os ingredientes. Entao os dois vetores viram fracao do
// total antes de se compararem, e o tamanho da dose vira uma parcela separada
// (`volume`), que perdoa muito mais.
//
// NENHUMA MARCA, EM LUGAR NENHUM — mesma regra de mobilia/bebidas.js, e aqui
// ela e mais apertada ainda: nome de coquetel classico E marca de fato em varios
// paises, e a lista de baixo e de nomes INVENTADOS de propriedade de ninguem.
// Os ingredientes sao descritos pelo que sao ("destilado de agave"), que e a
// unica forma de nomear bebida que nao encosta em ninguem.
// ---------------------------------------------------------------------------

/** Um dosador cheio, em litros. E a unidade em que toda receita conta. */
export const DOSE = 0.025

// ---------------------------------------------------------------------------
// OS INGREDIENTES
//
//   fonte     de onde o jogador tira isto na bancada:
//             'parede'    a parede de bebidas atras
//             'chope'     a torre de torneiras
//             'pistola'   a pistola de refrigerante
//             'fruteira'  a estante de frutas
//             'gelo'      o poco de gelo
//   cor       o que ele pinta no copo. A cor do drink e a MEDIA PONDERADA das
//             cores por volume (ver misturar), e e por isso que o xarope de
//             groselha em meia dose ja deixa um drink rosa: a cor dele e
//             saturada e a dos destilados nao e.
//   corpo     0 a 1: quanto ele PUXA a cor da mistura pra ele, alem do volume.
//             Sem isso, 4 doses de agua com gas apagam meia dose de licor de
//             cafe e o drink sai bege — o que nao acontece num copo de verdade,
//             porque cafe TINGE e agua nao.
// ---------------------------------------------------------------------------

export const INGREDIENTES = [
  // --- destilados (parede de bebidas) --------------------------------------
  { id: 'cana-branca', nome: 'Aguardente de cana', curto: 'cana', fonte: 'parede', cor: 0xf0f6f0, corpo: 0.20, forca: 0.38, doce: 0.05, azedo: 0.0, amargo: 0.10 },
  { id: 'cana-velha', nome: 'Aguardente envelhecida', curto: 'cana velha', fonte: 'parede', cor: 0xc07a2a, corpo: 0.55, forca: 0.38, doce: 0.20, azedo: 0.0, amargo: 0.18 },
  { id: 'zimbro', nome: 'Destilado de zimbro', curto: 'zimbro', fonte: 'parede', cor: 0xeaf4f2, corpo: 0.18, forca: 0.40, doce: 0.02, azedo: 0.0, amargo: 0.30 },
  { id: 'agave', nome: 'Destilado de agave', curto: 'agave', fonte: 'parede', cor: 0xf4eed0, corpo: 0.26, forca: 0.38, doce: 0.10, azedo: 0.0, amargo: 0.22 },
  { id: 'centeio', nome: 'Destilado de centeio', curto: 'centeio', fonte: 'parede', cor: 0xa8641c, corpo: 0.60, forca: 0.40, doce: 0.14, azedo: 0.0, amargo: 0.26 },
  { id: 'grao-neutro', nome: 'Destilado neutro de grao', curto: 'neutro', fonte: 'parede', cor: 0xf6fbfd, corpo: 0.14, forca: 0.40, doce: 0.0, azedo: 0.0, amargo: 0.05 },
  { id: 'melaco', nome: 'Destilado de melaco escuro', curto: 'melaco', fonte: 'parede', cor: 0x6b3410, corpo: 0.72, forca: 0.38, doce: 0.34, azedo: 0.0, amargo: 0.20 },

  // --- licores e aromatizados (parede) -------------------------------------
  { id: 'licor-laranja', nome: 'Licor de casca de laranja', curto: 'licor de laranja', fonte: 'parede', cor: 0xd97a18, corpo: 0.62, forca: 0.24, doce: 0.72, azedo: 0.16, amargo: 0.22 },
  { id: 'licor-cafe', nome: 'Licor de cafe', curto: 'licor de cafe', fonte: 'parede', cor: 0x241209, corpo: 0.95, forca: 0.20, doce: 0.80, azedo: 0.0, amargo: 0.45 },
  { id: 'licor-erva', nome: 'Licor de ervas amargas', curto: 'licor de ervas', fonte: 'parede', cor: 0x3f6b22, corpo: 0.80, forca: 0.28, doce: 0.40, azedo: 0.0, amargo: 0.86 },
  { id: 'vermute-tinto', nome: 'Vinho aromatizado tinto', curto: 'vermute tinto', fonte: 'parede', cor: 0x7a1f28, corpo: 0.78, forca: 0.16, doce: 0.55, azedo: 0.12, amargo: 0.40 },
  { id: 'vermute-seco', nome: 'Vinho aromatizado seco', curto: 'vermute seco', fonte: 'parede', cor: 0xdccf8a, corpo: 0.40, forca: 0.16, doce: 0.12, azedo: 0.18, amargo: 0.34 },

  // --- sucos, polpas e xaropes (parede/fruteira) ---------------------------
  { id: 'suco-limao', nome: 'Suco de limao', curto: 'limao', fonte: 'fruteira', cor: 0xe6ee94, corpo: 0.34, forca: 0, doce: 0.05, azedo: 0.95, amargo: 0.10 },
  { id: 'suco-laranja', nome: 'Suco de laranja', curto: 'laranja', fonte: 'fruteira', cor: 0xf09818, corpo: 0.66, forca: 0, doce: 0.55, azedo: 0.40, amargo: 0.06 },
  { id: 'suco-abacaxi', nome: 'Suco de abacaxi', curto: 'abacaxi', fonte: 'fruteira', cor: 0xf2d24a, corpo: 0.58, forca: 0, doce: 0.62, azedo: 0.35, amargo: 0.0 },
  { id: 'polpa-morango', nome: 'Polpa de morango', curto: 'morango', fonte: 'fruteira', cor: 0xd6304a, corpo: 0.88, forca: 0, doce: 0.66, azedo: 0.26, amargo: 0.0 },
  { id: 'hortela', nome: 'Hortela macerada', curto: 'hortela', fonte: 'fruteira', cor: 0x4f9a3a, corpo: 0.30, forca: 0, doce: 0.05, azedo: 0.0, amargo: 0.22 },
  { id: 'xarope-acucar', nome: 'Xarope de acucar', curto: 'xarope', fonte: 'parede', cor: 0xefe4c4, corpo: 0.28, forca: 0, doce: 1.0, azedo: 0.0, amargo: 0.0 },
  { id: 'xarope-groselha', nome: 'Xarope de groselha', curto: 'groselha', fonte: 'parede', cor: 0xa81030, corpo: 0.94, forca: 0, doce: 0.92, azedo: 0.18, amargo: 0.05 },
  { id: 'creme-coco', nome: 'Creme de coco', curto: 'coco', fonte: 'parede', cor: 0xf6f2e6, corpo: 0.70, forca: 0, doce: 0.70, azedo: 0.0, amargo: 0.0 },

  // --- pistola de refrigerante ---------------------------------------------
  { id: 'agua-gas', nome: 'Agua com gas', curto: 'agua com gas', fonte: 'pistola', cor: 0xeaf6fa, corpo: 0.05, forca: 0, doce: 0.0, azedo: 0.04, amargo: 0.0, gas: 0.5 },
  { id: 'tonica', nome: 'Agua tonica', curto: 'tonica', fonte: 'pistola', cor: 0xeef2e0, corpo: 0.10, forca: 0, doce: 0.30, azedo: 0.10, amargo: 0.55, gas: 0.5 },
  { id: 'refri-escuro', nome: 'Refrigerante escuro', curto: 'refri escuro', fonte: 'pistola', cor: 0x3a1a08, corpo: 0.88, forca: 0, doce: 0.85, azedo: 0.18, amargo: 0.14, gas: 0.5 },
  { id: 'refri-guarana', nome: 'Refrigerante de guarana', curto: 'guarana', fonte: 'pistola', cor: 0xcf9a34, corpo: 0.55, forca: 0, doce: 0.86, azedo: 0.08, amargo: 0.05, gas: 0.5 },

  // --- chope (a torre de torneiras) ----------------------------------------
  { id: 'chope-claro', nome: 'Chope claro', curto: 'chope claro', fonte: 'chope', cor: 0xe8ad3a, corpo: 0.62, forca: 0.05, doce: 0.14, azedo: 0.06, amargo: 0.40, gas: 0.9, espuma: 0.55 },
  { id: 'chope-escuro', nome: 'Chope escuro', curto: 'chope escuro', fonte: 'chope', cor: 0x6f3512, corpo: 0.90, forca: 0.06, doce: 0.24, azedo: 0.04, amargo: 0.62, gas: 0.9, espuma: 0.72 },
]

const POR_ID = new Map()
for (const i of INGREDIENTES) POR_ID.set(i.id, i)

/** A ficha do ingrediente, ou null. Espelha bebidaDe()/itemDe()/copoDe(). */
export function ingredienteDe(id) { return POR_ID.get(id) || null }

// ---------------------------------------------------------------------------
// AS GUARNICOES
//
// Elas nao entram na conta de proporcao (uma rodela de limao nao e meia dose de
// nada) e por isso moram numa lista propria. O que elas fazem e valer PONTO — e
// o motivo e o mesmo pelo qual existem num bar de verdade: um copo sem nada na
// borda le como copo de agua com corante.
// ---------------------------------------------------------------------------

export const GUARNICOES = [
  { id: 'rodela-laranja', nome: 'Rodela de laranja', de: 'fruta-laranja', cor: 0xf09818 },
  { id: 'rodela-limao', nome: 'Rodela de limao', de: 'fruta-limao', cor: 0xdCe86a },
  { id: 'rodela-abacaxi', nome: 'Fatia de abacaxi', de: 'fruta-abacaxi', cor: 0xf2d24a },
  { id: 'cereja', nome: 'Cereja no palito', de: 'fruta-cereja', cor: 0xb01028 },
  { id: 'morango', nome: 'Morango na borda', de: 'fruta-morango', cor: 0xd6304a },
  { id: 'folha-hortela', nome: 'Ramo de hortela', de: 'fruta-hortela', cor: 0x3f8a2a },
  { id: 'canudo', nome: 'Canudo', de: null, cor: 0xe84a6a },
  { id: 'sombrinha', nome: 'Guarda-chuvinha', de: null, cor: 0xf05a2a },
]

const GUARN_POR_ID = new Map()
for (const g of GUARNICOES) GUARN_POR_ID.set(g.id, g)
export function guarnicaoDe(id) { return GUARN_POR_ID.get(id) || null }

// ---------------------------------------------------------------------------
// OS METODOS
//
// Sao quatro, e cada um e um GESTO na bancada — nao um item de menu. Batido e a
// coqueteleira, mexido e o mexedor no copo, direto e despejar no copo e pronto,
// liquidificado e o copo do liquidificador.
//
// A regra de qual metodo cabe em qual drink e a de qualquer bar: o que tem
// suco, polpa ou creme se BATE (senao nao emulsiona); o que e so destilado e
// aromatizado se MEXE (bater deixa a bebida turva e cheia de lasca de gelo);
// o que leva gaseificado vai DIRETO no copo (agitar refrigerante e derrama-lo).
// O sistema nao exige que o jogador saiba disso — ele pontua, e o painel diz.
// ---------------------------------------------------------------------------

export const METODOS = [
  { id: 'direto', nome: 'Montado no copo' },
  { id: 'mexido', nome: 'Mexido' },
  { id: 'batido', nome: 'Batido na coqueteleira' },
  { id: 'liquidificado', nome: 'Batido no liquidificador' },
]

// ---------------------------------------------------------------------------
// AS RECEITAS
//
// Quatorze, todas de nome inventado. `preco` e o que um cliente paga por uma
// NOTA 100 — a nota multiplica direto (ver valorDe), entao um drink medonho
// ainda vende, so que por trocado.
//
// `gelo` e a faixa de pedras que o drink pede, e nao um numero exato: gelo e a
// coisa que o jogador tem menos controle fino, e exigir "exatamente 4" seria
// punir a pinca em vez do drink.
// ---------------------------------------------------------------------------

export const RECEITAS = [
  {
    id: 'aurora-cerrado', nome: 'Aurora do Cerrado', preco: 64,
    copo: 'copo-americano', metodo: 'direto', gelo: [3, 6],
    partes: [['zimbro', 2], ['suco-limao', 1], ['xarope-acucar', 0.5], ['tonica', 3]],
    guarnicao: ['rodela-limao'],
    desc: 'Zimbro com tonica, um fio de limao e gelo ate a boca.',
  },
  {
    id: 'sol-paracatu', nome: 'Sol de Paracatu', preco: 52,
    copo: 'copo-americano', metodo: 'batido', gelo: [3, 6],
    partes: [['cana-branca', 2], ['suco-limao', 1], ['xarope-acucar', 1]],
    guarnicao: ['rodela-limao'],
    desc: 'Cana, limao e acucar batidos com gelo. O drink da mesa do fundo.',
  },
  {
    id: 'noite-vermelha', nome: 'Noite Vermelha', preco: 78,
    copo: 'copo-tulipa', metodo: 'batido', gelo: [0, 3],
    partes: [['grao-neutro', 2], ['polpa-morango', 1.5], ['suco-limao', 0.5], ['xarope-groselha', 0.5]],
    guarnicao: ['morango', 'canudo'],
    desc: 'Morango e groselha por cima do neutro. Sai vermelho de propaganda.',
  },
  {
    id: 'beira-estrada', nome: 'Beira de Estrada', preco: 86,
    copo: 'copo-americano', metodo: 'mexido', gelo: [2, 4],
    partes: [['centeio', 2], ['vermute-tinto', 1], ['licor-erva', 0.25]],
    guarnicao: ['cereja'],
    desc: 'Centeio mexido com vermute e um toque amargo. Nao se bate isto.',
  },
  {
    id: 'chope-batizado', nome: 'Chope Batizado', preco: 42,
    copo: 'caneca-chope', metodo: 'direto', gelo: [0, 0],
    partes: [['chope-claro', 8], ['licor-laranja', 0.5]],
    guarnicao: ['rodela-laranja'],
    desc: 'Caneca de chope claro com meia dose de licor de laranja no fundo.',
  },
  {
    id: 'ouro-do-caixa', nome: 'Ouro do Caixa', preco: 92,
    copo: 'copo-tulipa', metodo: 'batido', gelo: [0, 3],
    partes: [['cana-velha', 2], ['licor-laranja', 1], ['suco-limao', 1]],
    guarnicao: ['rodela-laranja'],
    desc: 'Cana envelhecida, licor de laranja e limao. Cor de ficha de mil.',
  },
  {
    id: 'sereno', nome: 'Sereno da Madrugada', preco: 98,
    copo: 'copo-tulipa', metodo: 'mexido', gelo: [0, 2],
    partes: [['zimbro', 3], ['vermute-seco', 0.75]],
    guarnicao: ['cereja'],
    desc: 'Quase so zimbro, gelado ate doer, e uma cereja no fundo.',
  },
  {
    id: 'verde-da-praca', nome: 'Verde da Praca', preco: 58,
    copo: 'copo-americano', metodo: 'direto', gelo: [4, 8],
    partes: [['cana-branca', 2], ['hortela', 1], ['suco-limao', 1], ['xarope-acucar', 1], ['agua-gas', 1]],
    guarnicao: ['folha-hortela', 'canudo'],
    desc: 'Hortela macerada, cana e gelo picado ate transbordar de verde.',
  },
  {
    id: 'tarde-de-abacaxi', nome: 'Tarde de Abacaxi', preco: 88,
    copo: 'copo-tulipa', metodo: 'liquidificado', gelo: [4, 8],
    partes: [['melaco', 2], ['suco-abacaxi', 2], ['creme-coco', 1]],
    guarnicao: ['rodela-abacaxi', 'sombrinha'],
    desc: 'Melaco, abacaxi e coco no liquidificador ate virar creme.',
  },
  {
    id: 'cafe-da-madrugada', nome: 'Cafe da Madrugada', preco: 96,
    copo: 'copo-tulipa', metodo: 'batido', gelo: [0, 2],
    partes: [['grao-neutro', 2], ['licor-cafe', 1], ['xarope-acucar', 0.5]],
    guarnicao: ['cereja'],
    desc: 'Preto, batido ate espumar. Serve pra ficar acordado ou pra dormir.',
  },
  {
    id: 'fogo-de-agave', nome: 'Fogo de Agave', preco: 84,
    copo: 'copo-americano', metodo: 'batido', gelo: [2, 5],
    partes: [['agave', 2], ['suco-limao', 1], ['licor-laranja', 1]],
    guarnicao: ['rodela-limao'],
    desc: 'Agave com limao e laranja. Arde na descida, e e pra arder.',
  },
  {
    id: 'ferro-velho', nome: 'Ferro Velho', preco: 46,
    copo: 'caneca-chope', metodo: 'direto', gelo: [4, 8],
    partes: [['melaco', 2], ['refri-escuro', 4], ['suco-limao', 0.5]],
    guarnicao: ['rodela-limao', 'canudo'],
    desc: 'Melaco afogado em refrigerante escuro. Caneca cheia, sem cerimonia.',
  },
  {
    id: 'vitamina-do-barman', nome: 'Vitamina do Barman', preco: 74,
    copo: 'copo-tulipa', metodo: 'liquidificado', gelo: [4, 9],
    partes: [['polpa-morango', 2], ['suco-abacaxi', 1], ['creme-coco', 1], ['grao-neutro', 1]],
    guarnicao: ['morango', 'sombrinha'],
    desc: 'A fruta que sobrou do dia, gelo e um dedo de neutro. Sai rosa.',
  },
  {
    id: 'dose-seca', nome: 'Dose Seca', preco: 34,
    copo: 'copo-americano', metodo: 'direto', gelo: [0, 0],
    partes: [['cana-velha', 2]],
    guarnicao: [],
    desc: 'Duas doses de cana envelhecida e mais nada. Nem gelo.',
  },
]

const REC_POR_ID = new Map()
for (const r of RECEITAS) REC_POR_ID.set(r.id, r)
export function receitaDe(id) { return REC_POR_ID.get(id) || null }

// ---------------------------------------------------------------------------
// A COR DA MISTURA — E POR QUE ELA NAO E UMA MEDIA
//
// A primeira versao era a media ponderada obvia dos RGB. Ela esta ERRADA, e o
// erro aparece no primeiro drink que alguem tenta: meia dose de licor de cafe
// (quase preto) em quatro de agua com gas dava um CINZA AZULADO. Num copo de
// verdade da um marrom claro, porque liquido colorido nao "faz media" com o
// liquido do lado — ele ABSORVE luz.
//
// A conta certa e a lei de Beer-Lambert, e ela e barata: cada cor vira
// ABSORBANCIA (-ln do canal), as absorbancias se somam ponderadas pelo volume,
// e o resultado volta pela exponencial. Assim uma gota de coisa muito escura
// tinge um copo inteiro — que e o comportamento que todo mundo ja viu — e uma
// coisa clara em muita quantidade nao "apaga" a escura, so dilui.
//
// O PESO ainda tem os dois fatores, e os dois continuam necessarios:
//
//   volume       quantas doses entraram.
//   corpo        quanto o ingrediente TINGE por dose. Xarope de groselha e
//                agua com gas ocupam o mesmo espaco no copo e nao pintam nem
//                de longe a mesma coisa.
//
// Tres logaritmos e tres exponenciais por mistura, e a mistura so e recalculada
// quando alguem despeja alguma coisa. E de graca.
// ---------------------------------------------------------------------------

/** Piso do canal: log(0) e -infinito, e preto puro existe no catalogo. */
const EPS_COR = 0.012

export function misturar(partes) {
  let ar = 0, ag = 0, ab = 0, peso = 0
  const lista = Array.isArray(partes) ? partes : []
  for (const p of lista) {
    const ing = ingredienteDe(p.id || p[0])
    if (!ing) continue
    const doses = Number(p.doses !== undefined ? p.doses : p[1]) || 0
    if (doses <= 0) continue
    const w = doses * (0.35 + (ing.corpo || 0))
    ar += -Math.log(Math.max(EPS_COR, ((ing.cor >> 16) & 255) / 255)) * w
    ag += -Math.log(Math.max(EPS_COR, ((ing.cor >> 8) & 255) / 255)) * w
    ab += -Math.log(Math.max(EPS_COR, (ing.cor & 255) / 255)) * w
    peso += w
  }
  if (peso <= 0) return 0xdfe8ea
  const r = Math.round(Math.exp(-ar / peso) * 255)
  const g = Math.round(Math.exp(-ag / peso) * 255)
  const b = Math.round(Math.exp(-ab / peso) * 255)
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b)
}

/** Litros de liquido no copo (nao conta gelo nem guarnicao). */
export function volumeDe(partes) {
  let v = 0
  for (const p of (partes || [])) v += (Number(p.doses !== undefined ? p.doses : p[1]) || 0) * DOSE
  return v
}

/** Quanto colarinho a mistura segura (0 a 1). So chope faz espuma de verdade. */
export function espumaDe(partes) {
  let esp = 0, total = 0
  for (const p of (partes || [])) {
    const ing = ingredienteDe(p.id || p[0])
    const d = Number(p.doses !== undefined ? p.doses : p[1]) || 0
    if (!ing || d <= 0) continue
    total += d
    esp += (ing.espuma || 0) * d
  }
  return total > 0 ? Math.max(0, Math.min(1, esp / total)) : 0
}

// ---------------------------------------------------------------------------
// A COMPARACAO DE PROPORCAO
//
// Os dois vetores viram FRACAO DO TOTAL e a distancia e a soma dos modulos das
// diferencas (L1), dividida por 2 — que e a fracao do copo que esta no
// ingrediente errado. 0 e identico, 1 e "nao tem um ingrediente em comum".
//
// L1 e nao a distancia euclidiana porque, aqui, "errei 10% em cinco
// ingredientes" tem que doer o mesmo que "errei 50% em um". A euclidiana
// perdoaria o primeiro caso quase inteiro, e o primeiro caso e justamente o
// jogador que despejou tudo no olho.
// ---------------------------------------------------------------------------

function normalizar(partes) {
  const m = new Map()
  let total = 0
  for (const p of (partes || [])) {
    const id = p.id !== undefined ? p.id : p[0]
    const d = Number(p.doses !== undefined ? p.doses : p[1]) || 0
    if (!id || d <= 0) continue
    m.set(id, (m.get(id) || 0) + d)
    total += d
  }
  if (total <= 0) return { frac: m, total: 0 }
  for (const [k, v] of m) m.set(k, v / total)
  return { frac: m, total }
}

/** 0 (identico) a 1 (nada em comum). */
export function distancia(a, b) {
  const A = normalizar(a).frac
  const B = normalizar(b).frac
  if (!A.size || !B.size) return 1
  let soma = 0
  const vistos = new Set()
  for (const [k, v] of A) { soma += Math.abs(v - (B.get(k) || 0)); vistos.add(k) }
  for (const [k, v] of B) if (!vistos.has(k)) soma += v
  return Math.min(1, soma / 2)
}

// ---------------------------------------------------------------------------
// A NOTA
//
// Seis parcelas, e a soma das maximas da 100. Os pesos sao a opiniao do jogo
// sobre o que e fazer um drink direito, e estao aqui em cima justamente pra
// serem discutiveis:
//
//   proporcao  46   o que voce pos, e em que razao. E o drink.
//   volume     10   quanto voce pos no total, contra o que a receita pede.
//   metodo     14   bateu o que era pra mexer? o gesto errado estraga.
//   copo        8   drink servido no copo errado ja comeca perdendo.
//   gelo        8   dentro da faixa da receita.
//   guarnicao   8   a borda do copo.
//   execucao    6   quao bem o gesto foi feito (agitacao, dose no traco).
//
// E DUAS PENALIDADES que nao sao parcelas, sao descontos, porque elas nao tem
// teto — derramar duas vezes tem que doer mais que derramar uma:
//
//   derramou   -8 por vez
//   aguado     -14 no maximo (chacoalhar alem da conta derrete o gelo)
// ---------------------------------------------------------------------------

const PESO = {
  proporcao: 46, volume: 10, metodo: 14, copo: 8, gelo: 8, guarnicao: 8, execucao: 6,
}

function faixa(v, a, b) {
  if (v >= a && v <= b) return 1
  const fora = v < a ? a - v : v - b
  // uma pedra fora da faixa custa 25%; quatro zeram. Gelo e o item mais
  // desajeitado de pegar, e por isso a queda e mais mansa que a dos outros.
  return Math.max(0, 1 - fora * 0.25)
}

/**
 * PONTUA UM PREPARO CONTRA UMA RECEITA. Uso interno de avaliar(), exportado
 * porque o teste quer poder perguntar "quanto isto vale como Sol de Paracatu?"
 * sem passar pela busca da melhor.
 *
 * @param preparo { copo, metodo, gelo, partes:[{id,doses}], guarnicoes:[id],
 *                  agitacao:0..1, derramou:n, precisao:0..1 }
 */
export function pontuar(preparo, receita) {
  const p = preparo || {}
  const partes = p.partes || []
  const linhas = []

  // 1. PROPORCAO -------------------------------------------------------------
  const dist = distancia(partes, receita.partes)
  // a curva e quadratica invertida: erro pequeno quase nao custa (o jogador
  // nao tem dosador de precisao), erro grande despenca.
  const kProp = Math.max(0, 1 - dist * dist * 1.85 - dist * 0.30)
  linhas.push({ campo: 'proporcao', texto: 'Proporcao', k: kProp, peso: PESO.proporcao })

  // 2. VOLUME ---------------------------------------------------------------
  const meu = normalizar(partes).total
  const dela = normalizar(receita.partes).total
  const razao = dela > 0 ? meu / dela : 0
  // meio a dois: um drink duplo nao e erro. Fora disso a nota cai.
  const kVol = razao <= 0 ? 0 : Math.max(0, 1 - Math.abs(Math.log(razao) / Math.log(2.4)))
  linhas.push({ campo: 'volume', texto: 'Quantidade', k: kVol, peso: PESO.volume })

  // 3. METODO ---------------------------------------------------------------
  // Meio ponto quando o jogador BATEU o que era pra mexer (ou o contrario):
  // errou o gesto mas fez um gesto. Zero quando nao fez nada (direto no lugar
  // de batido) — um drink que pede coqueteleira e servido sem ela nao chegou a
  // ser feito.
  let kMet = 0
  if (p.metodo === receita.metodo) kMet = 1
  else if (p.metodo && p.metodo !== 'direto' && receita.metodo !== 'direto') kMet = 0.5
  else if (p.metodo === 'direto' && receita.metodo === 'mexido') kMet = 0.35
  linhas.push({ campo: 'metodo', texto: 'Metodo', k: kMet, peso: PESO.metodo })

  // 4. COPO -----------------------------------------------------------------
  const kCopo = p.copo === receita.copo ? 1 : 0.15
  linhas.push({ campo: 'copo', texto: 'Copo', k: kCopo, peso: PESO.copo })

  // 5. GELO -----------------------------------------------------------------
  const g = receita.gelo || [0, 0]
  const kGelo = faixa(Math.max(0, p.gelo | 0), g[0], g[1])
  linhas.push({ campo: 'gelo', texto: 'Gelo', k: kGelo, peso: PESO.gelo })

  // 6. GUARNICAO ------------------------------------------------------------
  const pedidas = receita.guarnicao || []
  const postas = p.guarnicoes || []
  let kGuar = 1
  if (pedidas.length) {
    let acertos = 0
    for (const id of pedidas) if (postas.indexOf(id) >= 0) acertos++
    // sobra tambem tira, mas de leve: quem enfeita demais nao erra o drink
    const sobra = Math.max(0, postas.length - pedidas.length)
    kGuar = Math.max(0, acertos / pedidas.length - sobra * 0.12)
  } else {
    kGuar = postas.length ? Math.max(0, 1 - postas.length * 0.30) : 1
  }
  linhas.push({ campo: 'guarnicao', texto: 'Guarnicao', k: kGuar, peso: PESO.guarnicao })

  // 7. EXECUCAO -------------------------------------------------------------
  // `precisao` e a media de quanto o jogador parou em cima do traco da dose;
  // `agitacao` so conta quando o metodo pede agitacao.
  const precisao = Number.isFinite(p.precisao) ? Math.max(0, Math.min(1, p.precisao)) : 0.5
  let kExec = precisao
  if (receita.metodo === 'batido' || receita.metodo === 'liquidificado') {
    const ag = Number.isFinite(p.agitacao) ? Math.max(0, Math.min(1.5, p.agitacao)) : 0
    // o alvo e 1.0 e a janela boa vai de 0.75 a 1.15 — chacoalhar de menos nao
    // mistura, de mais agua o drink (e isso ainda leva a penalidade separada)
    const janela = ag < 0.75 ? ag / 0.75 : (ag > 1.15 ? Math.max(0, 1 - (ag - 1.15) * 2.2) : 1)
    kExec = precisao * 0.45 + janela * 0.55
  }
  linhas.push({ campo: 'execucao', texto: 'Execucao', k: kExec, peso: PESO.execucao })

  let nota = 0
  for (const l of linhas) { l.pontos = l.k * l.peso; nota += l.pontos }

  // --- descontos ------------------------------------------------------------
  const descontos = []
  const derramou = Math.max(0, p.derramou | 0)
  if (derramou > 0) {
    const d = Math.min(24, derramou * 8)
    descontos.push({ texto: 'Derramou na bancada', pontos: -d })
    nota -= d
  }
  const ag = Number.isFinite(p.agitacao) ? p.agitacao : 0
  if (ag > 1.25) {
    const d = Math.min(14, (ag - 1.25) * 28)
    descontos.push({ texto: 'Chacoalhou demais, aguou', pontos: -d })
    nota -= d
  }

  return {
    nota: Math.max(0, Math.min(100, Math.round(nota))),
    linhas, descontos,
  }
}

// ---------------------------------------------------------------------------
// O DRINK IMPROVISADO
//
// Quando nada bate, o copo NAO fica sem nome. Um "drink desconhecido" e a
// resposta preguicosa e ela mata o unico prazer que sobra de errar a receita —
// ver o que voce inventou. O nome sai do ingrediente que MANDA na mistura mais
// um sufixo tirado do sabor dominante, e as duas metades sao suficientes pra o
// nome nunca ser o mesmo duas vezes seguidas por acidente.
// ---------------------------------------------------------------------------

const SUFIXO = {
  forte: ['Puro', 'Sem Susto', 'de Punho', 'Bruto'],
  doce: ['Doce', 'de Sobremesa', 'Melado', 'de Domingo'],
  azedo: ['Azedo', 'de Cara Feia', 'Cortado', 'Acido'],
  amargo: ['Amargo', 'de Fim de Turno', 'Fechado', 'Torto'],
  aguado: ['Aguado', 'de Casa Cheia', 'Longo', 'Comprido'],
}

function sorteioEstavel(lista, semente) {
  let h = 0
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) | 0
  return lista[Math.abs(h) % lista.length]
}

export function nomeImprovisado(partes) {
  const norm = normalizar(partes)
  if (!norm.total) return 'Copo Vazio'
  let dono = null, maior = 0
  let doce = 0, azedo = 0, amargo = 0, forca = 0, gas = 0
  for (const [id, f] of norm.frac) {
    const ing = ingredienteDe(id)
    if (!ing) continue
    if (f > maior) { maior = f; dono = ing }
    doce += (ing.doce || 0) * f
    azedo += (ing.azedo || 0) * f
    amargo += (ing.amargo || 0) * f
    forca += (ing.forca || 0) * f
    gas += (ing.gas || 0) * f
  }
  if (!dono) return 'Mistura da Casa'
  let chave = 'forte'
  if (forca < 0.12 && gas > 0.25) chave = 'aguado'
  else if (amargo > doce && amargo > azedo) chave = 'amargo'
  else if (azedo > doce) chave = 'azedo'
  else if (doce > 0.45) chave = 'doce'
  else if (forca > 0.28) chave = 'forte'
  const base = dono.curto.charAt(0).toUpperCase() + dono.curto.slice(1)
  return base + ' ' + sorteioEstavel(SUFIXO[chave], dono.id + chave)
}

// ---------------------------------------------------------------------------
// AVALIAR — a porta de entrada do arquivo
// ---------------------------------------------------------------------------

/** Abaixo disto o preparo nao e "aquela receita mal feita", e outra coisa. */
export const NOTA_RECONHECE = 52

/**
 * @param preparo ver pontuar()
 * @returns {{
 *   nome, nota, cor, espuma, volume, receita, linhas, descontos, conhecido
 * }}
 */
export function avaliar(preparo) {
  const p = preparo || {}
  const partes = p.partes || []
  const cor = misturar(partes)
  const espuma = espumaDe(partes)
  const volume = volumeDe(partes)

  let melhor = null
  let melhorNota = -1
  let melhorDetalhe = null
  for (const r of RECEITAS) {
    const d = pontuar(p, r)
    if (d.nota > melhorNota) { melhorNota = d.nota; melhor = r; melhorDetalhe = d }
  }

  // Sem nada no copo nao ha o que avaliar, e o zero tem que ser explicito: sem
  // esta guarda a receita mais barata sempre "ganha" com nota de guarnicao e
  // copo, e um copo vazio saia valendo 16 pontos.
  if (!partes.length || volume <= 0.0005) {
    return {
      nome: 'Copo vazio', nota: 0, cor, espuma: 0, volume: 0,
      receita: null, linhas: [], descontos: [], conhecido: false,
    }
  }

  const conhecido = melhorNota >= NOTA_RECONHECE
  return {
    nome: conhecido ? melhor.nome : nomeImprovisado(partes),
    nota: melhorNota,
    cor, espuma, volume,
    receita: conhecido ? melhor : null,
    // O ALVO continua vindo mesmo quando nao reconhece: e ele que o painel usa
    // pra dizer "chegou perto de X". Saber do que voce chegou perto e a unica
    // forma de aprender uma receita sem abrir um menu.
    alvo: melhor,
    linhas: melhorDetalhe ? melhorDetalhe.linhas : [],
    descontos: melhorDetalhe ? melhorDetalhe.descontos : [],
    conhecido,
  }
}

/** Quanto um cliente paga por este copo, em OURO. */
export function valorDe(resultado) {
  if (!resultado) return 0
  const base = resultado.receita ? resultado.receita.preco : 30
  // A CURVA NAO E LINEAR e o piso nao e zero. Nota 50 paga 30% e nao 50%:
  // servir bosta tem que ser visivelmente pior do que servir direito, senao o
  // jogador nunca aprende a receita. Mas nota 20 ainda paga alguma coisa —
  // ninguem devolve um copo cheio de graca.
  const k = Math.pow(Math.max(0, resultado.nota) / 100, 1.7)
  return Math.max(4, Math.round(base * (0.10 + 0.90 * k)))
}

/** A frase que o painel mostra junto da nota. */
export function comentarioDe(nota) {
  if (nota >= 95) return 'Perfeito. Isso e um drink.'
  if (nota >= 82) return 'Muito bom. O cliente volta.'
  if (nota >= 66) return 'Passa. Ninguem reclama.'
  if (nota >= 48) return 'Da pra beber, mas voce sabe que errou.'
  if (nota >= 26) return 'Isso ai e um acidente com copo.'
  return 'Joga fora e comeca de novo.'
}

export default RECEITAS
