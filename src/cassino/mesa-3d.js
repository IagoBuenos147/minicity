import * as THREE from 'three'
import { criarBaralho3D, CARTA_L, CARTA_C, CARTA_E } from './cartas-3d.js'
import * as som from './som-mesa.js'

// ---------------------------------------------------------------------------
// src/cassino/mesa-3d.js — O PALCO DA MESA: cartas, fichas e o tempo delas.
//
// O pedido: "aproxima a tela na mesa e ve as cartas bem nitidas... mostre as
// cartas na mesa tudo grande e COM JUICE". Este arquivo e o "juice". Ele nao
// sabe uma regra de blackjack e nao sabe o que e uma aposta em ouro: ele
// recebe "esta fila tem estas cartas" e "esta pilha vale tanto", e faz a
// diferenca ACONTECER na mesa — carta saindo do sapato num arco, pousando com
// um tap, virando pela borda; ficha caindo uma a uma com estalo; pilha perdida
// deslizando pro lado da casa.
//
// POR QUE ELE E DECLARATIVO (cartas(fila, defs)) E NAO IMPERATIVO (darCarta()).
// A maquina de estados do blackjack nao emite eventos: ela devolve um SNAPSHOT
// do que existe agora. Uma API imperativa obrigaria a UI a adivinhar o que
// mudou entre dois snapshots — e esse "adivinhar" e exatamente o bug que a
// versao em DOM ja tinha resolvido com um diff (ver pintarCartas em
// ui/cassino-ui.js). Aqui o diff mora num lugar so: `cartas()` compara o que
// esta na mesa com o que foi pedido, e SO o que mudou anima. Sem isso, todo
// 'pedir' faria a mao inteira voar de novo, que e a cara de um bug.
//
// TRES REGRAS DE ORCAMENTO, porque o cassino ja e um lugar caro:
//
//   1. UM material pras 52 cartas (o atlas de cartas-3d.js) e UM InstancedMesh
//      pras fichas todas, com cor por instancia. A mesa inteira aberta custa
//      ~30 draw calls, e ZERO enquanto ninguem esta jogando (o grupo nasce
//      invisivel e so acende em entrar()).
//   2. NENHUMA LUZ NOVA, NUNCA. Acender o feltro num blackjack e um PLANO com
//      material aditivo que sobe de opacidade — nao uma PointLight. A contagem
//      de luzes visiveis define o programa de shader de TODO material da cena;
//      ligar uma luz aqui recompilaria o cassino inteiro no meio da jogada.
//      (A armadilha esta escrita em render/luzes-efeito.js desde que existe.)
//   3. A SOMBRA DA CARTA E UM BORRAO, nao um shadow map. As duas PointLight do
//      salao nao projetam sombra, entao castShadow numa carta nao desenharia
//      nada; e um plano com degrade radial que segue o XZ da carta, cresce e
//      clareia conforme ela sobe. Custa um draw call por carta e le melhor.
//
// O SISTEMA DE EIXOS DA MESA e o mesmo nas duas mesas, e e o que permite um
// arquivo so: a origem do grupo fica no CENTRO da mesa, no chao do salao;
// +Z aponta pra CASA (a atendente em pe, o ricaco sentado) e -Z pro JOGADOR.
// Tudo — layout, enquadramento de camera, direcao de varrer ficha — e escrito
// nesse espaco e convertido pro mundo na hora de usar.
// ---------------------------------------------------------------------------

// --- fichas ----------------------------------------------------------------

// Valores e cores de mesa de verdade, os MESMOS que a faixa de botoes mostra.
// Do maior pro menor porque a decomposicao e gulosa e depende dessa ordem.
const DENOM = [
  { v: 500, cor: 0xc9a24a },
  { v: 250, cor: 0x8f2f45 },
  { v: 100, cor: 0x23262e },
  { v: 50, cor: 0x2f6f9f },
  { v: 25, cor: 0x2f8f5b },
  { v: 10, cor: 0x7a5ea8 },
  { v: 5, cor: 0x4a6f8f },
  { v: 1, cor: 0xe8e2d2 },
]

const FICHA_R = 0.0295
const FICHA_H = 0.0078          // mais gorda que os 3,3 mm reais: no tamanho
                                // certo uma pilha de 10 some no feltro
const FICHA_MAX = 18            // teto de fichas por pilha; acima disso a
                                // decomposicao para e o resto vira "e mais"
const FICHA_COLUNA = 7          // fichas por coluna antes de abrir outra
const POOL_FICHAS = 96

const POOL_CARTAS = 16

// --- layouts ---------------------------------------------------------------
//
// Todo numero abaixo esta no espaco da mesa (origem no centro, no chao) e foi
// escolhido contra a geometria que world/casino.js ja tem no feltro: as cartas
// do blackjack ficam ENTRE o rack de fichas da casa (z=-0.20) e a linha
// impressa "BLACKJACK PAGA 3 PARA 2" (z=-0.75), e a aposta cai exatamente
// dentro do circulo do meio do arco (raio 1.18). No poker as duas cartas do
// jogador nascem POR CIMA do par decorativo que ja estava desenhado ali — sao
// maiores que ele em todas as bordas, entao ele some por baixo em vez de virar
// um terceiro par fantasma na mesa.
const LAYOUT = {
  blackjack: {
    feltro: 0.92,
    // ASSENTO: a que altura acima do feltro a carta descansa. Nao e folga
    // estetica, e briga de profundidade: o feltro do blackjack ja tem duas
    // linhas impressas (decalChao) em +0.008 e os aneis de aposta em +0.006.
    // Carta abaixo disso ganha a linha por cima dela, e o defeito aparece como
    // texto atravessando a carta.
    assento: 0.012,
    versoAzul: false,
    sapato: { x: 0.78, z: -0.34, alt: 0.15 },
    descarte: { x: -0.86, z: -0.34, alt: 0.10 },
    // As duas fileiras ficam a 36 cm uma da outra — MENOS que numa mesa real,
    // e de proposito. Ver a nota sobre a lente logo abaixo: cada centimetro
    // entre a mao da casa e a minha e um centimetro que a camera precisa
    // recuar, e recuar encolhe a carta na tela ao quadrado.
    filas: {
      dealer: { x: 0.00, z: -0.30, passo: 0.076, leque: 0.038 },
      mao0: { x: 0.00, z: -0.66, passo: 0.076, leque: -0.038 },
      mao1: { x: -0.20, z: -0.66, passo: 0.062, leque: -0.038 },
    },
    // A aposta cai na FRENTE da mao, como numa mesa de verdade — mas a 16 cm
    // dela, e nao no circulo impresso a 52 cm. O circulo impresso do feltro foi
    // desenhado pra cinco cadeiras; com uma so, ele fica longe demais da mao
    // pro mesmo quadro segurar os dois. 'pago' e onde a CASA poe o que deve:
    // ao lado da aposta, nunca em cima dela, porque e ver as duas pilhas
    // separadas que faz o pagamento parecer o dobro em vez de "a pilha mudou
    // de cor".
    pilhas: {
      aposta: { x: 0.000, z: -0.82 },
      pago: { x: 0.185, z: -0.82 },
      aposta1: { x: -0.260, z: -0.82 },
      pago1: { x: -0.445, z: -0.82 },
    },
    // pra onde a ficha vai quando alguem leva o dinheiro
    casa: { x: -0.10, z: 0.14 },
    eu: { x: 0.00, z: -1.30 },
    brilho: { x: 0.00, z: -0.50, r: 0.85 },
    // OS QUATRO ENQUADRAMENTOS, e eles nao foram escolhidos no olho.
    //
    // Cada um foi MEDIDO projetando as duas bordas de uma carta e lendo que
    // fracao da ALTURA da tela ela ocupa. Isso importa porque a intuicao erra
    // feio aqui: a carta esta deitada, entao o que se ve dela encolhe com o
    // SENO da inclinacao da lente. Uma camera "de quem esta em pe na corda"
    // (25 graus) deixa a carta em 8% da tela por mais que o campo feche — foi
    // exatamente o primeiro enquadramento que este arquivo teve, e ele nao
    // atendia o pedido ("ve as cartas bem nitidas... tudo grande").
    //
    //   aposta  — carta 6%: e o plano de SITUACAO, o unico que mostra a
    //             atendente inteira atras da corda.
    //   jogo    — carta 20% e a mao da casa em 12%, com a aposta no quadro.
    //             44 graus de inclinacao e lente longa (32): achata a
    //             perspectiva sem virar vista de cima.
    //   duas    — o mesmo, aberto o bastante pras DUAS maos de um split.
    //   revelar — 25% na mao da casa, pro instante de virar a carta tapada.
    quadros: {
      aposta: { pos: [0.00, 1.70, -1.95], alvo: [0.02, 1.02, -0.28], fov: 44 },
      jogo: { pos: [0.00, 1.58, -1.30], alvo: [0.02, 0.95, -0.64], fov: 32 },
      duas: { pos: [0.00, 1.70, -1.30], alvo: [0.02, 0.95, -0.58], fov: 40 },
      revelar: { pos: [0.03, 1.28, -0.86], alvo: [0.03, 0.95, -0.30], fov: 26 },
    },
  },
  poker: {
    feltro: 0.78,
    // Mais alto que no blackjack porque aqui ha um par de cartas DECORATIVAS
    // assadas no feltro debaixo de cada lugar (world/casino.js), e o topo delas
    // esta em +0.0142. A carta viva pousa por cima e esconde a decorativa, que
    // e menor em todas as bordas — do contrario a mesa mostraria dois pares.
    assento: 0.016,
    versoAzul: true,
    sapato: { x: 1.02, z: 0.30, alt: 0.18 },
    descarte: { x: -1.02, z: 0.26, alt: 0.10 },
    filas: {
      eu: { x: 0.00, z: -0.62, passo: 0.116, leque: -0.055 },
      ele: { x: 0.00, z: 0.62, passo: 0.116, leque: 0.055 },
    },
    pilhas: {
      minha: { x: 0.00, z: -0.20 },
      dele: { x: 0.00, z: 0.20 },
    },
    casa: { x: 0.00, z: 0.90 },
    eu: { x: 0.00, z: -0.96 },
    brilho: { x: 0.00, z: 0.00, r: 0.85 },
    // AQUI A CONTA E OUTRA, e por isso os numeros nao parecem com os da mesa de
    // blackjack. No poker o adversario e METADE do jogo: um ricaco fora do
    // quadro transforma a mao num problema de aritmetica. E ele esta a 1,52 m
    // do centro do feltro, com as minhas cartas a 0,62 m do outro lado — sao
    // 2,2 m de profundidade num quadro so, e nao existe lente que segure isso
    // com carta grande. A medicao foi clara: exigindo a cabeca dele no quadro,
    // a carta nao passa de 8% da altura da tela.
    //
    // Entao a mesa aceita a troca e a compensa com MERGULHO:
    //   jogo    — 5% de carta, mas o ricaco INTEIRO do outro lado e as minhas
    //             duas cartas acima da faixa de botoes. Lente por cima do
    //             ombro (1,84 m), e nao na altura do olho de quem esta
    //             sentado: sentado de verdade, as minhas cartas caem embaixo
    //             demais e a faixa come metade delas.
    //   minhas  — logo depois de repartir, a lente cai nas MINHAS duas cartas
    //             (24% da tela). E o gesto de levantar a ponta pra espiar.
    //   revelar — no showdown ela atravessa a mesa e vai nas DELE (20%).
    quadros: {
      aposta: { pos: [0.00, 1.86, -2.30], alvo: [0.00, 0.94, 0.14], fov: 50 },
      jogo: { pos: [0.00, 1.84, -2.15], alvo: [0.00, 0.90, 0.10], fov: 50 },
      minhas: { pos: [0.00, 1.30, -1.16], alvo: [0.00, 0.86, -0.62], fov: 32 },
      revelar: { pos: [0.00, 1.34, -0.06], alvo: [0.00, 0.86, 0.60], fov: 30 },
    },
  },
}

// --- ferramentas -----------------------------------------------------------

function suave(k) {
  if (k <= 0) return 0
  if (k >= 1) return 1
  return k * k * (3 - 2 * k)
}

/** Sai rapido e chega parando: o passo certo pra carta que voa. */
function freia(k) {
  return 1 - (1 - k) * (1 - k) * (1 - k)
}

/** Identidade de uma posicao da fila. Verso e sempre a MESMA chave: duas
 *  cartas viradas pra baixo sao indistinguiveis, e tem que ser. */
export function chaveDef(d) {
  if (!d) return '~'
  if (d.verso || !d.carta || !d.carta.r) return '##'
  return d.carta.n + ':' + d.carta.r
}

/** Decompoe um valor em fichas, da maior pra menor. */
function decompor(valor) {
  const out = []
  let v = Math.max(0, Math.floor(valor) || 0)
  for (let i = 0; i < DENOM.length && out.length < FICHA_MAX; i++) {
    const d = DENOM[i]
    while (v >= d.v && out.length < FICHA_MAX) { out.push(d.cor); v -= d.v }
  }
  return out
}

/** Onde a n-esima ficha de uma pilha pousa, em relacao a base da pilha. */
function posicaoNaPilha(i) {
  const col = Math.floor(i / FICHA_COLUNA)
  const nivel = i % FICHA_COLUNA
  return {
    dx: col * (FICHA_R * 2.25),
    dy: FICHA_H * (nivel + 0.5),
    ry: (i * 0.7) % (Math.PI * 2),
  }
}

/** Degrade radial preto: a sombra de tudo que voa nesta mesa. */
let _texSombra = null
function texSombra() {
  if (_texSombra) return _texSombra
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(0,0,0,0.85)')
  gr.addColorStop(0.55, 'rgba(0,0,0,0.42)')
  gr.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  _texSombra = new THREE.CanvasTexture(c)
  _texSombra.colorSpace = THREE.SRGBColorSpace
  return _texSombra
}

/** Disco de luz suave, pro brilho do feltro. Aditivo: nao e luz, e pintura. */
let _texBrilho = null
function texBrilho() {
  if (_texBrilho) return _texBrilho
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  _texBrilho = new THREE.CanvasTexture(c)
  _texBrilho.colorSpace = THREE.SRGBColorSpace
  return _texBrilho
}

/**
 * A ficha, com a borda tracada assada na COR DE VERTICE.
 *
 * O truque que faz a mesa inteira caber num draw call: `instanceColor` e a cor
 * de vertice se MULTIPLICAM no shader. Entao a geometria carrega o desenho (a
 * tampa clara, a lateral escura, os seis tracos brancos do aro) e a instancia
 * carrega so o valor da ficha. Sem isso seriam seis InstancedMesh (uma por
 * cor) ou uma textura de ficha — e nenhum dos dois desenha o traco do aro sem
 * inventar um uv proprio.
 */
let _geoFicha = null
function geoFicha() {
  if (_geoFicha) return _geoFicha
  const seg = 24
  const g = new THREE.CylinderGeometry(FICHA_R, FICHA_R, FICHA_H, seg)
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const cor = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i)
    let c
    if (Math.abs(ny) > 0.7) {
      // tampa: um pouco mais clara no meio pra ler como argila polida
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      c = r < FICHA_R * 0.55 ? 1.22 : 1.0
    } else {
      // aro: escuro, com traco claro a cada 4 segmentos (o "dashed" classico)
      const a = Math.atan2(pos.getZ(i), pos.getX(i))
      const passo = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg)
      c = (passo % 4 === 0) ? 1.35 : 0.55
    }
    cor[i * 3] = c
    cor[i * 3 + 1] = c
    cor[i * 3 + 2] = c
  }
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3))
  _geoFicha = g
  return g
}

// ---------------------------------------------------------------------------
// A MESA
// ---------------------------------------------------------------------------

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {object} o.ancora  o objeto de `casino.mesas.blackjack` ou `.poker`
 * @param {'blackjack'|'poker'} o.tipo
 */
export function criarMesa3D({ scene, ancora, tipo } = {}) {
  const L = LAYOUT[tipo] || LAYOUT.blackjack
  const baralho = criarBaralho3D()

  const grupo = new THREE.Group()
  grupo.name = 'mesa3d-' + tipo
  // A mesa nasce APAGADA. Ela fica na cena a sessao inteira (montar e
  // desmontar geometria toda vez que alguem senta seria um engasgo por mao),
  // mas grupo invisivel nao entra em draw call nenhum.
  grupo.visible = false
  if (ancora && ancora.centro) grupo.position.copy(ancora.centro)
  // Altura do feltro no espaco da mesa. Vem da ancora quando ela existe, senao
  // do layout: numero copiado envelhece sozinho no dia em que a mesa subir.
  const feltro = (ancora && Number.isFinite(ancora.tampo) && ancora.centro)
    ? ancora.tampo - ancora.centro.y
    : L.feltro
  // Y de descanso da carta e dos enfeites de chao desta mesa, ja somado.
  const ASSENTO = Number.isFinite(L.assento) ? L.assento : 0.012
  const Y_CARTA = feltro + ASSENTO
  const Y_SOMBRA = Y_CARTA - 0.0025
  const Y_CHAO = Y_CARTA - 0.005
  if (scene) scene.add(grupo)

  // --- animacoes -----------------------------------------------------------
  // Uma lista simples. Cada tarefa tem atraso, duracao, um passo(k) e um fim().
  // Nao ha "tween engine" porque nao ha o que reaproveitar: sao seis tipos de
  // movimento e todos cabem num passo() de tres linhas.
  const tarefas = []
  function anima(t) {
    t.t = 0
    if (!Number.isFinite(t.atraso)) t.atraso = 0
    if (!Number.isFinite(t.dur)) t.dur = 0.3
    tarefas.push(t)
    return t
  }
  function pararTarefas(marca) {
    for (let i = tarefas.length - 1; i >= 0; i--) {
      if (!marca || tarefas[i].marca === marca) {
        const t = tarefas[i]
        tarefas.splice(i, 1)
        if (t.cancelar) t.cancelar()
      }
    }
  }

  // --- fichas: um InstancedMesh, cor por instancia --------------------------
  const matFicha = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.48, metalness: 0.05, vertexColors: true,
  })
  const fichasMesh = new THREE.InstancedMesh(geoFicha(), matFicha, POOL_FICHAS)
  fichasMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  fichasMesh.count = 0
  fichasMesh.castShadow = false
  fichasMesh.receiveShadow = true
  fichasMesh.frustumCulled = false
  grupo.add(fichasMesh)
  const _dummy = new THREE.Object3D()
  const _cor = new THREE.Color()
  // cada ficha viva: { x, y, z, ry, cor }
  const fichasVivas = []

  function repintarFichas() {
    const n = Math.min(fichasVivas.length, POOL_FICHAS)
    for (let i = 0; i < n; i++) {
      const f = fichasVivas[i]
      _dummy.position.set(f.x, f.y, f.z)
      _dummy.rotation.set(0, f.ry, 0)
      _dummy.scale.setScalar(1)
      _dummy.updateMatrix()
      fichasMesh.setMatrixAt(i, _dummy.matrix)
      _cor.setHex(f.cor)
      fichasMesh.setColorAt(i, _cor)
    }
    fichasMesh.count = n
    fichasMesh.instanceMatrix.needsUpdate = true
    if (fichasMesh.instanceColor) fichasMesh.instanceColor.needsUpdate = true
  }

  // --- pilhas de ficha por nome --------------------------------------------
  // pilha = { base:{x,z}, valor, itens:[ref pra fichasVivas] }
  //
  // A pilha guarda o VALOR e nao a lista de cores, e isso e a coisa mais
  // importante deste bloco. Uma pilha que se redesenha a partir do total
  // decompoe 25 em [25] e 75 em [50,25] — nao ha prefixo comum, e o resultado
  // na tela e a pilha inteira sumindo e voltando a cada aumento. Guardando o
  // valor, subir de 25 pra 75 e simplesmente EMPILHAR 50 em cima do que ja
  // estava, que e o que acontece numa mesa de verdade.
  const pilhas = new Map()
  function pilha(id) {
    let p = pilhas.get(id)
    if (!p) {
      const b = L.pilhas[id] || { x: 0, z: 0 }
      p = { id, base: { x: b.x, z: b.z }, valor: 0, itens: [] }
      pilhas.set(id, p)
    }
    return p
  }

  function soltarFicha(f) {
    const i = fichasVivas.indexOf(f)
    if (i >= 0) fichasVivas.splice(i, 1)
  }

  // --- cartas: pool de meshes ----------------------------------------------
  const matSombraBase = new THREE.MeshBasicMaterial({
    map: texSombra(), color: 0x000000, transparent: true, opacity: 0.5,
    depthWrite: false, depthTest: true,
  })
  const geoSombra = new THREE.PlaneGeometry(1, 1)

  const pool = []
  function pegarCarta() {
    for (let i = 0; i < pool.length; i++) if (!pool[i].usada) { pool[i].usada = true; return pool[i] }
    if (pool.length >= POOL_CARTAS * 3) return null
    const pivo = new THREE.Group()
    const mesh = baralho.novaCarta(L.versoAzul)
    pivo.add(mesh)
    grupo.add(pivo)
    const sombra = new THREE.Mesh(geoSombra, matSombraBase.clone())
    sombra.rotation.x = -Math.PI / 2
    sombra.renderOrder = 1
    sombra.frustumCulled = false
    grupo.add(sombra)
    const c = {
      pivo, mesh, sombra, usada: true,
      chave: '~', virada: true, alvo: { x: 0, z: 0, ry: 0, y: 0 },
    }
    pool.push(c)
    return c
  }

  function devolverCarta(c) {
    c.usada = false
    c.pivo.visible = false
    c.sombra.visible = false
    c.chave = '~'
  }

  /** Poe a carta num ponto do feltro e acerta a sombra de acordo. */
  function pousar(c, x, y, z, ry) {
    c.pivo.position.set(x, y, z)
    c.pivo.rotation.y = ry
    const alt = Math.max(0, y - Y_CARTA)
    // sombra: cresce e clareia com a altura. Ela tambem ESCORREGA um pouco em
    // +x e +z conforme a carta sobe, porque a luz do salao vem de cima e de
    // tras — sombra que so cresce no lugar le como halo, nao como sombra.
    const k = 1 + alt * 5.0
    c.sombra.position.set(x + alt * 0.10, Y_SOMBRA, z + alt * 0.16)
    c.sombra.rotation.z = -ry
    c.sombra.scale.set(CARTA_L * 1.9 * k, CARTA_C * 1.55 * k, 1)
    c.sombra.material.opacity = 0.52 / (1 + alt * 6.5)
  }

  // --- filas de carta -------------------------------------------------------
  // fila = { cfg, itens:[carta], deslocX }
  const filas = new Map()
  function fila(id) {
    let f = filas.get(id)
    if (!f) {
      const cfg = L.filas[id] || { x: 0, z: 0, passo: 0.09, leque: 0 }
      f = { id, cfg, itens: [], deslocX: cfg.x }
      filas.set(id, f)
    }
    return f
  }

  /** Onde a i-esima carta de uma fila de n cartas pousa. O leque e CENTRADO:
   *  cada carta nova empurra as anteriores, como a mao de um dealer. */
  function lugarNaFila(f, i, n) {
    const cfg = f.cfg
    const meio = (n - 1) / 2
    // O passo e NEGATIVO em x porque a tela desta camera tem o +X a esquerda:
    // carta nova entra pela DIREITA da tela e cobre a anterior pela metade,
    // deixando o indice do canto da anterior sempre a vista.
    return {
      x: f.deslocX - (i - meio) * cfg.passo,
      z: cfg.z + Math.abs(i - meio) * 0.006,
      y: Y_CARTA + i * 0.0018 + CARTA_E / 2,
      ry: (i - meio) * cfg.leque,
    }
  }

  function reacomodar(f, dur) {
    const n = f.itens.length
    for (let i = 0; i < n; i++) {
      const c = f.itens[i]
      const alvo = lugarNaFila(f, i, n)
      c.alvo = alvo
      if (c.voando) continue
      const de = { x: c.pivo.position.x, y: c.pivo.position.y, z: c.pivo.position.z, ry: c.pivo.rotation.y }
      anima({
        dur: dur || 0.22,
        marca: 'acomoda',
        passo(k) {
          pousar(c,
            de.x + (alvo.x - de.x) * k,
            de.y + (alvo.y - de.y) * k,
            de.z + (alvo.z - de.z) * k,
            de.ry + (alvo.ry - de.ry) * k)
        },
      })
    }
  }

  /** A carta sai do sapato num arco, girando, com o verso pra cima. */
  function distribuir(c, alvo, atraso, aoPousar) {
    const s = L.sapato
    const de = { x: s.x, y: feltro + s.alt, z: s.z }
    c.voando = true
    c.pivo.visible = true
    c.sombra.visible = true
    c.mesh.rotation.z = Math.PI          // verso pra cima
    c.mesh.position.y = 0
    c.pivo.rotation.y = -0.9
    pousar(c, de.x, de.y, de.z, -0.9)
    const giroInicial = -0.9
    anima({
      atraso,
      dur: 0.40,
      marca: 'da',
      passo(k, cru) {
        const e = freia(cru)
        // arco: a altura e uma parabola, entao a carta sobe e desce em vez de
        // deslizar pelo feltro. 0.20 e o pico — carta rasante nao le como
        // "dada", parece empurrada.
        const alt = Math.sin(Math.PI * cru) * 0.20
        pousar(c,
          de.x + (alvo.x - de.x) * e,
          de.y + (alvo.y - de.y) * e + alt,
          de.z + (alvo.z - de.z) * e,
          giroInicial + (alvo.ry - giroInicial) * e)
        void k
      },
      fim() {
        c.voando = false
        pousar(c, alvo.x, alvo.y, alvo.z, alvo.ry)
        som.carta(0, 1)
        if (aoPousar) aoPousar()
      },
    })
  }

  /**
   * O VIRAR. A carta rola pela borda longa (rotacao no Z local dela) e SOBE o
   * tanto que a borda desceria — sem essa compensacao ela atravessa o feltro
   * na metade do giro, que e o defeito classico de flip de carta.
   */
  function virarCarta(c, carta, atraso, aoFim) {
    const de = c.mesh.rotation.z
    const para = 0
    c.virada = false
    anima({
      atraso,
      dur: 0.30,
      marca: 'vira',
      passo(k) {
        const a = de + (para - de) * k
        c.mesh.rotation.z = a
        c.mesh.position.y = Math.abs(Math.sin(a)) * (CARTA_L / 2 + 0.006)
        // troca a face no meio do giro, quando a carta esta de perfil: virar a
        // face antes disso mostra a carta antes de o jogador "poder" ver.
        if (k >= 0.5 && !c._trocou) { c._trocou = true; baralho.definirFace(c.mesh, carta) }
      },
      fim() {
        c._trocou = false
        c.mesh.rotation.z = 0
        c.mesh.position.y = 0
        baralho.definirFace(c.mesh, carta)
        som.virar(0)
        if (aoFim) aoFim()
      },
    })
  }

  // --- brilho do feltro (NAO e luz) ----------------------------------------
  const matBrilho = new THREE.MeshBasicMaterial({
    map: texBrilho(), color: 0xffd98a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
  const brilho = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matBrilho)
  brilho.rotation.x = -Math.PI / 2
  brilho.position.set(L.brilho.x, Y_CHAO - 0.001, L.brilho.z)
  brilho.scale.set(L.brilho.r * 2.4, L.brilho.r * 2.4, 1)
  brilho.renderOrder = 2
  brilho.visible = false
  brilho.frustumCulled = false
  grupo.add(brilho)

  // --- destaque da mao da vez ----------------------------------------------
  const matAnel = new THREE.MeshBasicMaterial({
    color: 0xffd98a, transparent: true, opacity: 0, depthWrite: false,
  })
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.335, 40), matAnel)
  anel.rotation.x = -Math.PI / 2
  anel.position.set(0, Y_CHAO, 0)
  anel.renderOrder = 2
  anel.visible = false
  anel.frustumCulled = false
  grupo.add(anel)

  // --- tremor (a camera le isto; a mesa nao mexe na camera) ----------------
  let tremor = 0
  let tempo = 0

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  /** Um enquadramento do layout, em coordenadas de MUNDO. */
  function quadro(nome) {
    const q = L.quadros[nome] || L.quadros.jogo
    return {
      pos: grupo.localToWorld(new THREE.Vector3(q.pos[0], q.pos[1], q.pos[2])),
      alvo: grupo.localToWorld(new THREE.Vector3(q.alvo[0], q.alvo[1], q.alvo[2])),
      fov: q.fov,
    }
  }

  /**
   * O CORACAO: sincroniza uma fila com a lista de cartas pedida.
   *
   * defs = [{ carta:{r,n}|null, verso:bool }]. O diff e o mesmo da versao em
   * DOM: prefixo igual fica parado, verso que ganhou face VIRA no lugar, o
   * resto entra voando do sapato. Qualquer desencontro fora disso (split, mao
   * nova) manda tudo pro descarte e reparte — e raro, e a repartida geral ate
   * ajuda o jogador a entender que a mesa mudou.
   */
  function cartas(id, defs, opts) {
    const f = fila(id)
    const lista = Array.isArray(defs) ? defs : []
    const o = opts || {}
    if (Number.isFinite(o.x)) f.deslocX = o.x
    else f.deslocX = f.cfg.x

    let i = 0
    while (i < lista.length && i < f.itens.length && f.itens[i].chave === chaveDef(lista[i])) i++

    // viradas: mesma posicao, era verso e agora tem face
    let atraso = Number.isFinite(o.atraso) ? o.atraso : 0
    let virou = false
    while (i < lista.length && i < f.itens.length &&
           f.itens[i].chave === '##' && chaveDef(lista[i]) !== '##') {
      const c = f.itens[i]
      c.chave = chaveDef(lista[i])
      virarCarta(c, lista[i].carta, atraso, i === lista.length - 1 ? o.aoRevelar : null)
      atraso += 0.16
      virou = true
      i++
    }

    // sobrou carta velha que nao casa: refaz a fila inteira
    if (i < f.itens.length) {
      const velhas = f.itens.splice(0)
      varrerCartas(velhas, 0)
      i = 0
      atraso = Math.max(atraso, 0.18)
    }

    for (; i < lista.length; i++) {
      const c = pegarCarta()
      if (!c) break
      c.chave = chaveDef(lista[i])
      c.virada = true
      c._trocou = false
      baralho.definirFace(c.mesh, null)
      f.itens.push(c)
      const idx = f.itens.length - 1
      const alvo = lugarNaFila(f, idx, Math.max(lista.length, f.itens.length))
      const def = lista[i]
      const ultima = i === lista.length - 1
      distribuir(c, alvo, atraso, () => {
        if (def.verso || !def.carta || !def.carta.r) {
          if (ultima && o.aoPousar) o.aoPousar()
          return
        }
        c.virada = false
        // 0.09 s entre pousar e virar: e a pausa que faz a carta "chegar" antes
        // de mostrar o que e. Sem ela as duas coisas viram um evento so.
        virarCarta(c, def.carta, 0.09, ultima ? (o.aoRevelar || o.aoPousar) : null)
      })
      atraso += 0.24
    }

    reacomodar(f, 0.24)
    void virou
    return atraso
  }

  function varrerCartas(itens, atraso) {
    const d = L.descarte
    for (let k = 0; k < itens.length; k++) {
      const c = itens[k]
      const de = { x: c.pivo.position.x, y: c.pivo.position.y, z: c.pivo.position.z }
      anima({
        atraso: (atraso || 0) + k * 0.035,
        dur: 0.30,
        marca: 'varre',
        passo(t) {
          pousar(c,
            de.x + (d.x - de.x) * t,
            de.y + (feltro + d.alt - de.y) * t + Math.sin(Math.PI * t) * 0.06,
            de.z + (d.z - de.z) * t,
            c.pivo.rotation.y + t * 1.2)
        },
        fim() { devolverCarta(c) },
        cancelar() { devolverCarta(c) },
      })
    }
    if (itens.length) som.deslizar(atraso || 0, 0.30)
  }

  /** Varre TUDO pro descarte: fim de mao, saida da mesa. */
  function limparCartas(atraso) {
    for (const f of filas.values()) {
      const itens = f.itens.splice(0)
      varrerCartas(itens, atraso || 0)
    }
  }

  /**
   * Sincroniza uma pilha de fichas com um valor.
   *
   * Crescer EMPILHA ficha por ficha, com estalo por ficha e um atraso entre
   * elas — e o gesto de apostar, e ele nao pode acontecer num quadro so.
   * Encolher e instantaneo de proposito: quem tira ficha da mesa e a casa
   * varrendo (varrer()), e essa animacao e outra.
   */
  function fichas(id, valor, opts) {
    const p = pilha(id)
    const o = opts || {}
    const alvo = Math.max(0, Math.floor(valor) || 0)
    // Mudar a base de uma pilha ARRASTA junto o que ja esta nela. O caso que
    // existe e o split: a aposta da primeira mao sai do meio pra abrir espaco
    // pra segunda, e nesse instante ela JA TEM ficha em cima. Sem arrastar, as
    // cartas iam pro lado e o dinheiro ficava pra tras.
    if (Number.isFinite(o.x) && Math.abs(o.x - p.base.x) > 1e-4) {
      const dx = o.x - p.base.x
      p.base.x = o.x
      for (let k = 0; k < p.itens.length; k++) p.itens[k].x += dx
    }
    if (Number.isFinite(o.z) && Math.abs(o.z - p.base.z) > 1e-4) {
      const dz = o.z - p.base.z
      p.base.z = o.z
      for (let k = 0; k < p.itens.length; k++) p.itens[k].z += dz
    }
    if (alvo === p.valor) return 0

    // Encolheu (mao nova, aposta limpa): desmancha e refaz. E raro, e a
    // alternativa — tirar ficha do meio da pilha — nao existe em mesa nenhuma.
    if (alvo < p.valor) {
      for (let k = 0; k < p.itens.length; k++) soltarFicha(p.itens[k])
      p.itens.length = 0
      p.valor = 0
      if (alvo === 0) return 0
    }

    const cores = decompor(alvo - p.valor)
    p.valor = alvo

    let atraso = Number.isFinite(o.atraso) ? o.atraso : 0
    for (let c = 0; c < cores.length; c++) {
      if (fichasVivas.length >= POOL_FICHAS || p.itens.length >= FICHA_MAX * 2) break
      const i = p.itens.length
      const lugar = posicaoNaPilha(i)
      const f = {
        x: p.base.x + lugar.dx, y: Y_CHAO + lugar.dy, z: p.base.z, cor: cores[c], ry: lugar.ry,
      }
      fichasVivas.push(f)
      p.itens.push(f)
      // De onde a ficha cai: do lado do jogador (mao dele) ou do lado da casa
      // (a atendente pagando). Muda so o ponto de partida, e e o que faz
      // "apostei" e "recebi" parecerem coisas diferentes.
      const origem = o.de === 'casa'
        ? { x: p.base.x - 0.25, y: Y_CHAO + 0.34, z: p.base.z + 0.55 }
        : { x: p.base.x + 0.16, y: Y_CHAO + 0.30, z: p.base.z - 0.34 }
      const pouso = { x: f.x, y: f.y, z: f.z }
      const nivel = i
      f.x = origem.x; f.y = origem.y; f.z = origem.z
      anima({
        atraso,
        dur: 0.20,
        marca: 'ficha',
        passo(k2, cru) {
          const e = freia(cru)
          f.x = origem.x + (pouso.x - origem.x) * e
          f.z = origem.z + (pouso.z - origem.z) * e
          f.y = origem.y + (pouso.y - origem.y) * e
          void k2
        },
        fim() {
          f.x = pouso.x; f.y = pouso.y; f.z = pouso.z
          som.ficha(0, nivel)
        },
        cancelar() { f.x = pouso.x; f.y = pouso.y; f.z = pouso.z },
      })
      atraso += 0.075
    }
    return atraso
  }

  /**
   * A pilha DESLIZA pro lado de quem levou. Nao some: o dinheiro vai pra algum
   * lugar, e ver pra onde ele foi e metade da dor (ou da alegria) da mao.
   */
  function varrer(id, destino, atraso, aoFim) {
    const p = pilhas.get(id)
    if (!p || !p.itens.length) { if (aoFim) aoFim(); return 0 }
    const alvo = destino === 'jogador' ? L.eu : L.casa
    const itens = p.itens.splice(0)
    p.valor = 0
    const dur = 0.42
    som.deslizar(atraso || 0, dur)
    for (let k = 0; k < itens.length; k++) {
      const f = itens[k]
      const de = { x: f.x, y: f.y, z: f.z }
      anima({
        atraso: (atraso || 0) + k * 0.018,
        dur,
        marca: 'varre',
        passo(t) {
          f.x = de.x + (alvo.x - de.x) * t
          f.z = de.z + (alvo.z - de.z) * t
          // um saltinho: ficha varrida no feltro quica, nao desliza reta
          f.y = de.y + (Y_CHAO + FICHA_H * 0.5 - de.y) * t + Math.sin(Math.PI * t) * 0.035
          f.ry += 0.06
        },
        fim() {
          soltarFicha(f)
          if (k === itens.length - 1 && aoFim) aoFim()
        },
        cancelar() { soltarFicha(f) },
      })
    }
    return dur + itens.length * 0.018
  }

  function limparFichas() {
    for (const p of pilhas.values()) {
      for (const f of p.itens) soltarFicha(f)
      p.itens.length = 0
      p.valor = 0
    }
  }

  // --- efeitos --------------------------------------------------------------

  /** Acende o feltro. `cor` em 0xrrggbb, `forca` 0..1, `dur` em segundos. */
  function acender(cor, forca, dur) {
    matBrilho.color.setHex(cor === undefined ? 0xffd98a : cor)
    brilho.visible = true
    const pico = Math.max(0.05, Math.min(1.2, forca === undefined ? 0.7 : forca))
    const d = Math.max(0.2, dur || 0.9)
    anima({
      dur: d,
      marca: 'brilho',
      passo(k, cru) {
        // sobe rapido, cai devagar: e assim que uma luz de mesa se comporta
        matBrilho.opacity = cru < 0.18
          ? pico * (cru / 0.18)
          : pico * (1 - (cru - 0.18) / 0.82)
        void k
      },
      fim() { matBrilho.opacity = 0; brilho.visible = false },
      cancelar() { matBrilho.opacity = 0; brilho.visible = false },
    })
  }

  /** Sacode a lente. Quem APLICA e quem manda na camera; aqui so mede. */
  function tremer(forca) {
    tremor = Math.max(tremor, Math.max(0, Math.min(1, forca === undefined ? 0.5 : forca)))
  }

  /** Anel pulsante em volta de uma fila (a mao da vez, no split). */
  function destacar(id, ligado) {
    if (!ligado) { anel.visible = false; matAnel.opacity = 0; return }
    const f = filas.get(id) || fila(id)
    anel.position.set(f.deslocX, Y_CHAO, f.cfg.z)
    anel.visible = true
  }

  function atualizar(dt) {
    const d = Math.min(Math.max(dt || 0, 0), 0.1)
    tempo += d

    for (let i = tarefas.length - 1; i >= 0; i--) {
      const t = tarefas[i]
      t.t += d
      if (t.t < t.atraso) continue
      const cru = Math.min(1, (t.t - t.atraso) / t.dur)
      if (t.passo) t.passo(suave(cru), cru)
      if (cru >= 1) {
        tarefas.splice(i, 1)
        if (t.fim) t.fim()
      }
    }

    if (anel.visible) matAnel.opacity = 0.28 + Math.sin(tempo * 4.2) * 0.16
    if (tremor > 0) tremor = Math.max(0, tremor - d * 2.6)
    repintarFichas()
  }

  function entrar() {
    grupo.visible = true
  }

  /** Sai da mesa AGORA, sem cerimonia: cancela tudo e apaga o grupo. Quem quer
   *  a mesa sendo varrida com estilo chama limparCartas() ANTES. */
  function sair() {
    pararTarefas()
    for (const c of pool) devolverCarta(c)
    for (const f of filas.values()) f.itens.length = 0
    limparFichas()
    repintarFichas()
    matBrilho.opacity = 0
    brilho.visible = false
    anel.visible = false
    matAnel.opacity = 0
    tremor = 0
    grupo.visible = false
  }

  function dispose() {
    sair()
    if (grupo.parent) grupo.parent.remove(grupo)
    // A GEOMETRIA DA CARTA NAO E DESCARTADA AQUI, de proposito: os buffers de
    // posicao, normal e indice sao os MESMOS objetos em toda carta do jogo (ver
    // cartas-3d.js), e a outra mesa continua usando eles. dispose() numa dessas
    // geometrias apagaria da placa de video o baralho da mesa do lado.
    for (const c of pool) {
      if (c.sombra.material) c.sombra.material.dispose()
    }
    pool.length = 0
    fichasMesh.dispose()
    matFicha.dispose()
    matBrilho.dispose()
    matAnel.dispose()
    matSombraBase.dispose()
    geoSombra.dispose()
    anel.geometry.dispose()
    brilho.geometry.dispose()
  }

  return {
    grupo,
    tipo,
    feltro,
    quadro,
    cartas,
    limparCartas,
    fichas,
    varrer,
    limparFichas,
    acender,
    tremer,
    destacar,
    atualizar,
    entrar,
    sair,
    dispose,
    /** Amplitude do tremor pedido, 0..1. Quem manda na camera aplica. */
    get tremorAtual() { return tremor },
    /** Ha alguma animacao correndo? A UI usa pra nao pisar no proprio efeito. */
    get ocupada() { return tarefas.length > 0 },
    /** Ponto do mundo pra onde o jogador esta olhando nesta mesa. */
    paraMundo(x, y, z) { return grupo.localToWorld(new THREE.Vector3(x, y, z)) },
  }
}

export default criarMesa3D
