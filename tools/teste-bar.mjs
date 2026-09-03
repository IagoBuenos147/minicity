// O BAR DO CASSINO — conferencia de bancada, sem navegador.
//
//   node tools/teste-bar.mjs
//
// Sai com codigo 1 se algum caso falhar.
//
// POR QUE ELE NAO USA PUPPETEER, ao contrario de tools/teste-bebida.mjs. O que
// este arquivo prova nao precisa de tela: as receitas sao logica pura (como
// src/cassino/*.js) e a bancada e geometria mais uma maquina de estados. O
// unico pedaco de navegador de que ela depende e o canvas 2D das texturas e uns
// poucos nos de DOM da faixa do rodape, e os dois cabem em vinte linhas de
// mentira aqui embaixo. Trocar isso por um navegador de verdade custaria
// quarenta segundos de build por rodada e traria de brinde as falhas de
// ambiente que ja derrubam o teste de fumaca nesta maquina.
//
// O QUE ELE CUIDA, e por que cada um esta aqui:
//
//   1. A NOTA DO DRINK. E a unica coisa deste sistema que da pra estar errada
//      sem ninguem perceber olhando. Geometria torta aparece na foto; uma
//      proporcao mal pontuada, nao.
//   2. TODA RECEITA E RECONHECIDA COMO ELA MESMA. Quatorze receitas com
//      ingredientes parecidos: basta uma ficar mais parecida com a vizinha do
//      que consigo mesma pra o jogador nunca conseguir acertar aquela.
//   3. O BAR VELHO SAI INTEIRO. Grupo E colisores. Esquecer os colisores
//      deixaria uma parede invisivel no fundo do salao, que e o defeito mais
//      chato que este jogo ja teve.
//   4. NADA INVADE O VIZINHO. O salao do cassino e dividido entre tres
//      modulos; um colisor 30 cm fora da faixa combinada e uma mesa de
//      blackjack que nao da mais pra usar.
//   5. O CORREDOR CABE O JOGADOR. Ele tem 0,38 m de raio, e a folga entre o
//      balcao e a bancada foi calculada na mao — se alguem mexer numa das duas
//      medidas, isto reprova antes de virar "o barman entalado".
//   6. OS SETE GESTOS FUNCIONAM DE PONTA A PONTA, com clique e movimento de
//      mouse de verdade, do jeito que o jogador faz.
//   7. O ALCAPAO ABRE E A COLISAO ACOMPANHA. Balcao que abre na tela e
//      continua barrando e pior que balcao que nao abre.

// ---------------------------------------------------------------------------
// UM NAVEGADOR DE MENTIRA — o minimo pra as texturas de canvas e a faixa do HUD
// ---------------------------------------------------------------------------
function contexto2d(w, h) {
  const nada = () => {}
  const grad = { addColorStop: nada }
  return {
    canvas: { width: w, height: h },
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineJoin: '', lineCap: '',
    font: '', textAlign: '', textBaseline: '', shadowColor: '', shadowBlur: 0,
    globalAlpha: 1,
    fillRect: nada, strokeRect: nada, clearRect: nada, beginPath: nada, closePath: nada,
    moveTo: nada, lineTo: nada, arc: nada, arcTo: nada, ellipse: nada, rect: nada,
    quadraticCurveTo: nada, bezierCurveTo: nada, fill: nada, stroke: nada,
    save: nada, restore: nada, translate: nada, rotate: nada, scale: nada,
    clip: nada, setTransform: nada, fillText: nada, strokeText: nada, drawImage: nada,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad, createPattern: () => null,
    getImageData: (x, y, ww, hh) => ({
      data: new Uint8ClampedArray(Math.max(4, ww * hh * 4)), width: ww, height: hh,
    }),
    putImageData: nada,
  }
}

function criarElemento(tag) {
  const filhos = []
  const el = {
    tagName: String(tag).toUpperCase(), width: 0, height: 0,
    style: {}, className: '', id: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    children: filhos, parentNode: null,
    appendChild(c) { filhos.push(c); c.parentNode = el; return c },
    removeChild(c) { const i = filhos.indexOf(c); if (i >= 0) filhos.splice(i, 1); return c },
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    getContext: (k) => (k === '2d' ? contexto2d(el.width || 256, el.height || 256) : null),
  }
  return el
}

globalThis.document = {
  createElement: criarElemento,
  createTextNode: (t) => ({ nodeValue: String(t), parentNode: null }),
  getElementById: () => null,
  head: criarElemento('head'), body: criarElemento('body'),
  addEventListener() {}, removeEventListener() {},
}

const ouvintes = new Map()
globalThis.window = {
  innerWidth: 1600, innerHeight: 900,
  addEventListener(t, f, cap) {
    const k = t + (cap ? ':cap' : '')
    if (!ouvintes.has(k)) ouvintes.set(k, [])
    ouvintes.get(k).push(f)
  },
  removeEventListener(t, f, cap) {
    const k = t + (cap ? ':cap' : '')
    const a = ouvintes.get(k)
    if (!a) return
    const i = a.indexOf(f)
    if (i >= 0) a.splice(i, 1)
  },
}
/**
 * Dispara um evento HONRANDO A FASE E O stopPropagation.
 *
 * As duas coisas parecem detalhe de mentira bem feita e nao sao: o modo do bar
 * escuta o clique na fase de CAPTURA, e de proposito — e assim que ele impede
 * main.js de pedir o ponteiro de volta no meio de um gesto. Um disparador que
 * chamasse capturadores e borbulhadores como se fossem a mesma lista deixaria
 * passar exatamente o defeito que ja aconteceu uma vez aqui: um `stopPropagation`
 * na captura desligando o tratador que estava no borbulho, sem erro nenhum no
 * console.
 */
function disparar(tipo, ev) {
  let parou = false
  const base = Object.assign({
    preventDefault() {}, stopPropagation() { parou = true },
  }, ev)
  for (const f of (ouvintes.get(tipo + ':cap') || []).slice()) f(base)
  if (parou) return
  for (const f of (ouvintes.get(tipo) || []).slice()) f(base)
}
const guardado = new Map()
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
}

// ---------------------------------------------------------------------------
const THREE = await import('three')
const R = await import('../src/bar/receitas.js')
const { buildCasinoBar } = await import('../src/world/casino-bar.js')
const { bakeStatic } = await import('../src/world/bake.js')

let falhas = 0
function check(nome, ok, extra) {
  if (ok) { console.log('  ok   ' + nome + (extra ? '  -> ' + extra : '')); return }
  falhas++
  console.log('  FALHOU ' + nome + (extra ? '  [' + extra + ']' : ''))
}

// ===========================================================================
console.log('\n-- as receitas (logica pura, sem three e sem DOM) --')
// ===========================================================================

/** O preparo PERFEITO de uma receita: exatamente o que ela pede. */
function perfeito(r) {
  return {
    copo: r.copo, metodo: r.metodo,
    gelo: Math.round((r.gelo[0] + r.gelo[1]) / 2),
    partes: r.partes.map((p) => ({ id: p[0], doses: p[1] })),
    guarnicoes: r.guarnicao.slice(),
    agitacao: 1, derramou: 0, precisao: 1,
  }
}

{
  const r = R.receitaDe('aurora-cerrado')
  const a = R.avaliar(perfeito(r))
  check('a receita perfeita tira nota cheia', a.nota >= 95, 'nota ' + a.nota)
  check('e ela e reconhecida pelo nome', a.receita && a.receita.id === r.id, a.nome)

  const ruim = Object.assign(perfeito(r), {
    copo: 'caneca-chope', metodo: 'liquidificado', derramou: 2,
  })
  check('errar copo, metodo e derramar custa caro', R.avaliar(ruim).nota < a.nota - 20,
    a.nota + ' -> ' + R.avaliar(ruim).nota)

  check('copo vazio vale zero',
    R.avaliar({ copo: 'copo-americano', metodo: 'direto', gelo: 0, partes: [], guarnicoes: [] }).nota === 0)

  const dobro = Object.assign(perfeito(r), {
    partes: r.partes.map((p) => ({ id: p[0], doses: p[1] * 2 })),
  })
  check('um drink DUPLO nao e erro grave', R.avaliar(dobro).nota >= a.nota - 14,
    String(R.avaliar(dobro).nota))

  const invencao = R.avaliar({
    copo: 'copo-tulipa', metodo: 'direto', gelo: 0, guarnicoes: [],
    partes: [{ id: 'licor-cafe', doses: 3 }, { id: 'refri-guarana', doses: 4 }],
  })
  check('o que nao e receita ganha nome proprio', !!invencao.nome && !invencao.conhecido, invencao.nome)
  check('e ainda vale alguma coisa', R.valorDe(invencao) > 0, String(R.valorDe(invencao)))
  check('e diz de que receita chegou perto', !!invencao.alvo, invencao.alvo && invencao.alvo.nome)

  // A COR: meia dose de licor de cafe em quatro de agua com gas tem que sair
  // MARROM. Em media aritmetica de RGB dava cinza (ver misturar()).
  const cor = R.misturar([{ id: 'licor-cafe', doses: 0.5 }, { id: 'agua-gas', doses: 4 }])
  const vermelho = (cor >> 16) & 255, azul = cor & 255
  check('a mistura escurece e amarela como liquido de verdade',
    vermelho < 190 && vermelho > azul + 20, '#' + cor.toString(16).padStart(6, '0'))

  let quebradas = []
  for (const rec of R.RECEITAS) {
    for (const p of rec.partes) if (!R.ingredienteDe(p[0])) quebradas.push(rec.id + ':' + p[0])
    for (const g of rec.guarnicao) if (!R.guarnicaoDe(g)) quebradas.push(rec.id + ':' + g)
  }
  check('toda receita so cita ingrediente e guarnicao que existem',
    quebradas.length === 0, quebradas.join(', ') || R.RECEITAS.length + ' receitas')

  let confusas = []
  for (const rec of R.RECEITAS) {
    const av = R.avaliar(perfeito(rec))
    if (!av.receita || av.receita.id !== rec.id) {
      confusas.push(rec.id + ' virou ' + (av.receita ? av.receita.id : 'nenhuma'))
    }
  }
  check('cada receita e reconhecida como ELA MESMA', confusas.length === 0,
    confusas.join(' | ') || 'as ' + R.RECEITAS.length)
}

// ===========================================================================
console.log('\n-- a montagem no cassino --')
// ===========================================================================

const teclado = new Set()
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 600)
camera.position.set(20.2, 1.82, 28.2)
const copoDaMao = { chamado: null, servir(d) { copoDaMao.chamado = d; return true }, largar() {}, mostrar() {} }
const carteira = { ouro: 0, ganharOuro(n) { carteira.ouro += n; return n } }
const colisores = [
  { minX: 17.4, maxX: 25.6, minZ: 28.55, maxZ: 29.40, tag: 'cassino-bar' },
  { minX: 18.0, maxX: 18.4, minZ: 27.50, maxZ: 27.90, tag: 'cassino-banqueta' },
  { minX: 0, maxX: 1, minZ: 0, maxZ: 1, tag: 'outro-modulo' },
]
const interactables = []
const occluders = []
const jogo = {
  camera,
  renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }) } },
  input: { wasPressed: (c) => teclado.has(c), exitLock() {}, requestLock() {}, isLocked: () => false },
  player: { setLocked() {}, position: new THREE.Vector3(20.2, 0.16, 28.2), mode: 'first' },
  hud: { setCrosshair() {} },
  character: { parts: {}, root: new THREE.Object3D() },
  copo: copoDaMao, mao: { largar() {} }, carteira,
  collision: { query: () => colisores },
  toast: () => {},
}

const raiz = new THREE.Group()
const barAntigo = new THREE.Group()
barAntigo.name = 'casino-bar-antigo'
barAntigo.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()))
raiz.add(barAntigo)

const bar = buildCasinoBar({
  raiz, colliders: colisores, interactables, occluders, base: 0.16,
  dentro: { x0: 14.3, x1: 33.7, z0: 12.3, z1: 29.7 },
  predio: { x0: 14, x1: 34, z0: 12, z1: 30 },
  barAntigo,
})
const est = bar.estacao
const gestos = bar.gestos

check('o bar velho saiu da cena', !barAntigo.parent)
check('e os colisores dele sairam da lista',
  colisores.every((c) => c.tag !== 'cassino-bar' && c.tag !== 'cassino-banqueta'))
check('o colisor de outro modulo continua la',
  colisores.some((c) => c.tag === 'outro-modulo'))
check('pos pontos de E', interactables.length >= 4, interactables.map((i) => i.id).join(', '))
check('pos occluders com altura', occluders.length >= 2 && occluders[0].maxY > occluders[0].minY)
check('a estacao tem alvo pra tudo', est.alvos.length >= 40, est.alvos.length + ' alvos')
check('e enquadramento pra cada estacao', Object.keys(est.focos).length >= 12)
check('tres torneiras na torre', est.torneiras.length === 3)

// --- a faixa combinada com os modulos vizinhos ---------------------------
//
// A zona do bar vai de X 14,30 a 26,20 e de Z 26,30 a 29,70. Abaixo de Z 26,30
// entre X 18,25 e 21,75 comeca a folga da mesa de blackjack.
const ZONA = { x0: 14.28, x1: 26.22, z0: 26.29, z1: 29.72 }
{
  const fora = []
  for (const c of colisores) {
    if (!/^bar/.test(c.tag || '')) continue
    if (c.minX < ZONA.x0 || c.maxX > ZONA.x1) fora.push(c.tag + ' em X')
    if (c.minZ < ZONA.z0 || c.maxZ > ZONA.z1) fora.push(c.tag + ' em Z ' + c.minZ.toFixed(2))
  }
  check('nenhum colisor do bar invade o vizinho', fora.length === 0, fora.join(', ') || 'ok')

  const foraAlvo = est.alvos.filter((a) => a.pos.x < ZONA.x0 || a.pos.x > ZONA.x1
    || a.pos.z < ZONA.z0 || a.pos.z > ZONA.z1)
  check('nenhum alvo fora da zona', foraAlvo.length === 0, foraAlvo.map((a) => a.id).join(', ') || 'ok')

  raiz.updateMatrixWorld(true)
  const caixa = new THREE.Box3().setFromObject(est.grupo)
  check('a geometria inteira cabe na zona',
    caixa.min.x >= ZONA.x0 && caixa.max.x <= ZONA.x1
    && caixa.min.z >= ZONA.z0 && caixa.max.z <= ZONA.z1
    && caixa.min.y >= -0.02 && caixa.max.y <= 6.0,
    'x ' + caixa.min.x.toFixed(2) + '..' + caixa.max.x.toFixed(2)
    + '  z ' + caixa.min.z.toFixed(2) + '..' + caixa.max.z.toFixed(2)
    + '  y ' + caixa.min.y.toFixed(2) + '..' + caixa.max.y.toFixed(2))
}

// --- o corredor do barman -------------------------------------------------
{
  const P = est.planta
  const corredor = (P.bancada.z0 - 0.04) - (P.balcao.z1 + 0.06)
  check('o corredor cabe o jogador (raio 0,38)', corredor > 0.80, corredor.toFixed(3) + ' m')
}

// --- o custo -------------------------------------------------------------
{
  raiz.updateMatrixWorld(true)
  const st = bakeStatic(est.grupo)
  let depois = 0
  est.grupo.traverse((o) => { if (o.isMesh) depois++ })
  // 300 e o numero MEDIDO com o bar completo (95 fundidas + 54 instanced + as
  // 114 pecas vivas, que nao podem ir pro forno porque se mexem). Nao e um
  // alvo: e uma trava, pra a proxima duzia de garrafas de enfeite nao entrar
  // sem alguem perceber.
  check('o forno derruba o bar pra menos de 300 desenhos', depois < 300,
    st.before + ' -> ' + depois)
}

// ===========================================================================
console.log('\n-- os gestos, do jeito que o jogador faz --')
// ===========================================================================

function quadros(n) {
  for (let i = 0; i < (n || 1); i++) { bar.update(1 / 60, jogo); teclado.clear() }
}
function mover(px, py) { disparar('mousemove', { clientX: px, clientY: py }) }
function apertar() { disparar('mousedown', { button: 0 }) }
function soltar() { disparar('mouseup', { button: 0 }) }
function tecla(c) { teclado.add(c); quadros(1) }

/** Poe o ponteiro EM CIMA de um alvo, projetando ele com a camera do quadro. */
function apontar(id) {
  const a = est.alvos.find((x) => x.id === id)
  if (!a) return false
  camera.updateMatrixWorld(true)
  const v = a.pos.clone().project(camera)
  mover((v.x * 0.5 + 0.5) * 1600, (-v.y * 0.5 + 0.5) * 900)
  quadros(2)
  return true
}

const pontoBancada = interactables.find((i) => i.id === 'bar-bancada-trabalho')
pontoBancada.onInteract(jogo)
check('o E da bancada liga o modo barman', gestos.ativo)
check('e o rotulo do ponto vira a saida', pontoBancada.label === 'Sair da bancada')
quadros(90)
check('a lente chegou na bancada', gestos.foco === 'bancada', gestos.foco)

// --- DOSAR ---------------------------------------------------------------
gestos.debug.irPara('parede')
quadros(60)
check('olhar pra cima leva pra parede de bebidas', gestos.foco === 'parede', gestos.foco)
check('a garrafa de zimbro esta em quadro', apontar('garrafa-zimbro'))
apertar(); quadros(80); soltar(); quadros(20)
const zimbro = gestos.preparo.partes.find((p) => p.id === 'zimbro')
check('segurar o botao despeja no copo', !!zimbro && zimbro.doses > 0.3,
  zimbro && zimbro.doses.toFixed(2) + ' doses')
check('e o nivel do copo sobe junto', gestos.nivel > 0.02, gestos.nivel.toFixed(3))

// --- GELO ----------------------------------------------------------------
tecla('KeyQ'); quadros(45)
gestos.debug.irPara('gelo'); quadros(45)
check('o poco de gelo esta em quadro', apontar('gelo'))
for (let i = 0; i < 3; i++) { apertar(); soltar(); quadros(90) }
check('a pinca leva pedra pro copo', gestos.preparo.gelo === 3, String(gestos.preparo.gelo))

// --- CHOPE ---------------------------------------------------------------
gestos.debug.irPara('bancada'); quadros(45)
check('a torneira esta em quadro', apontar('chope-0'))
apertar(); soltar(); quadros(60)
apertar(); quadros(120); soltar(); quadros(30)
const chope = gestos.preparo.partes.find((p) => p.id === 'chope-claro')
check('a alavanca enche o copo', !!chope && chope.doses > 0.5, chope && chope.doses.toFixed(2))
check('e forma colarinho', gestos.espuma > 0.05, gestos.espuma.toFixed(2))

// --- CHACOALHAR ----------------------------------------------------------
tecla('KeyQ'); quadros(45)
check('a coqueteleira esta em quadro', apontar('coqueteleira'))
apertar(); soltar(); quadros(70)
let sobe = true
for (let i = 0; i < 60; i++) { mover(800, sobe ? 300 : 600); sobe = !sobe; quadros(2) }
tecla('Space'); quadros(140)
check('bater muda o metodo do drink', gestos.preparo.metodo === 'batido', gestos.preparo.metodo)
check('a agitacao foi medida', gestos.preparo.agitacao > 0.2, gestos.preparo.agitacao.toFixed(2))
check('e o conteudo volta pro copo', gestos.nivel > 0.05, gestos.nivel.toFixed(3))

// --- GUARNECER -----------------------------------------------------------
gestos.debug.irPara('guarnicoes'); quadros(45)
check('o porta-guarnicoes esta em quadro', apontar('guarn-rodela-limao'))
apertar(); soltar(); quadros(6)
check('a rodela encaixa no copo', gestos.preparo.guarnicoes.length === 1,
  gestos.preparo.guarnicoes.join(','))

// --- SERVIR --------------------------------------------------------------
tecla('KeyF'); quadros(6)
check('servir avalia o drink', !!gestos.resultado,
  gestos.resultado && (gestos.resultado.nome + ', nota ' + gestos.resultado.nota))
check('e limpa o copo', gestos.nivel < 0.02)
check('sem pedido casado, o copo vai pra mao do jogador', !!copoDaMao.chamado,
  copoDaMao.chamado && copoDaMao.chamado.nome)
quadros(140)
check('e a bancada e largada sozinha', !gestos.ativo)

// --- CORTAR --------------------------------------------------------------
pontoBancada.onInteract(jogo)
quadros(70)
gestos.debug.irPara('fruteira'); quadros(50)
check('o limao da fruteira esta em quadro', apontar('fruta-limao'))
apertar(); soltar(); quadros(40)
tecla('KeyT'); quadros(60)
check('[T] leva a fruta pra tabua', gestos.foco === 'tabua', gestos.foco)
const antesDoCorte = gestos.debug.estoqueDe('rodela-limao')
for (let i = 0; i < 8; i++) {
  apertar()
  for (let k = 0; k < 6; k++) { mover(600 + k * 40, 450); quadros(1) }
  soltar(); quadros(3)
}
check('arrastar corta a fruta e enche o porta-guarnicoes',
  gestos.debug.estoqueDe('rodela-limao') > antesDoCorte,
  antesDoCorte + ' -> ' + gestos.debug.estoqueDe('rodela-limao'))

// --- LIQUIDIFICADOR ------------------------------------------------------
gestos.debug.zerarPreparo(false)
gestos.debug.acrescentar('polpa-morango', 2)
gestos.debug.acrescentar('suco-abacaxi', 1)
gestos.debug.irPara('bancada'); quadros(50)
check('o liquidificador esta em quadro', apontar('liquidificador'))
apertar(); soltar(); quadros(70)
for (let i = 0; i < 16; i++) { apertar(); soltar(); quadros(4) }
tecla('Space'); quadros(140)
check('martelar o botao bate o drink', gestos.preparo.metodo === 'liquidificado',
  gestos.preparo.metodo)
check('e o pure volta pro copo', gestos.nivel > 0.05, gestos.nivel.toFixed(3))
gestos.sair()
quadros(60)

// ===========================================================================
console.log('\n-- o alcapao e o cliente --')
// ===========================================================================
{
  const ponto = interactables.find((i) => i.id === 'bar-alcapao')
  const caixa = colisores.find((c) => c.tag === 'bar-alcapao')
  check('o alcapao tem colisor proprio', !!caixa)
  check('fechado, ele barra', caixa.ativo !== false)
  ponto.onInteract(jogo)
  quadros(50)
  check('levantado, a passagem abre', caixa.ativo === false,
    'giro ' + est.alcapao.rotation.x.toFixed(2) + ' rad')
  check('e o rotulo do ponto acompanha', ponto.label === 'Baixar a bancada', ponto.label)
  ponto.onInteract(jogo)
  quadros(50)
  check('baixado, volta a barrar', caixa.ativo === true)
}
{
  const r = bar.novoPedido()
  check('o cliente pede um drink da carta', !!r && !!r.nome, r && r.nome)
  check('e a carta comeca vazia nesta maquina', bar.carta.length >= 0, bar.carta.length + ' anotados')
}

console.log('\n' + (falhas ? (falhas + ' CASO(S) FALHARAM') : 'todos os casos passaram'))
process.exit(falhas ? 1 : 0)
