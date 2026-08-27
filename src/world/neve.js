import * as THREE from 'three'
import { WORLD, LEVELS } from '../config.js'
import { LOTES, FILLERS, WALL_T } from './layout.js'

// ---------------------------------------------------------------------------
// NEVE ACUMULADA -- a neve PARADA em cima da cidade.
//
// Aqui nao existe particula: floco caindo e de world/clima.js. Este modulo e o
// oposto dele -- constroi UMA vez, no carregamento, toda a geometria da neve
// que ja pousou (chao, telhados, copas, arbustos, postes, lixeiras, pingentes),
// deixa escondida, e depois so abre/fecha essa geometria conforme a cobertura
// que o clima pede. Nevar vira uma interpolacao de opacidade e de escala em Y,
// nao um mundo sendo remontado.
//
// Tudo e InstancedMesh: 5 malhas no total (chao / caixas / domos / discos de
// copa / pingentes). O mundo ja gasta o orcamento de draw call com o forno de
// world/bake.js, entao neve nao pode chegar cobrando mais um punhado deles.
//
// Zero alocacao por quadro: as instancias moram em Float32Array e sao
// reescritas por um unico Object3D molde. Nada de 'new' dentro de atualizar().
//
// O modulo e DONO dos proprios materiais e texturas (nao usa o cache de
// materials.js) por um motivo so: aqui a opacidade e animada e o dispose()
// precisa ser de verdade. Material cacheado por chave e compartilhado -- animar
// a opacidade dele mexeria em quem mais estivesse usando, e destruir um deixa
// um material morto no cache pra proxima cidade encontrar.
// ---------------------------------------------------------------------------

// --- grade do chao ---------------------------------------------------------
// Passo da grade. 1.4 e nao 2.0: com 2 m sobrava um furinho escuro em cada
// ponto onde QUATRO celulas se encontram — o alpha das quatro bordas macias
// somava menos de 1 bem na quina, e o asfalto aparecia por baixo em pontos
// regularmente espacados, que e o padrao que o olho mais odeia. Com 1.4 m as
// manchas (2.9 a 3.8 m) se cobrem tres vezes e nao existe quina descoberta. O
// custo e o dobro de instancias numa unica InstancedMesh: nenhuma draw call a
// mais, so matriz na memoria.
const PASSO = 1.4
// O brief pedia varrer -70..+70. 72 e exatamente RING + ROAD_HALF + SIDEWALK,
// ou seja a borda EXTERNA da ultima calcada -- o mais longe que o jogador
// consegue pisar. Parando em 70 sobrava uma faixa de calcada preta em volta do
// anel inteiro, que e justamente onde a borda da neve seria vista de frente.
const ALCANCE = WORLD.RING + WORLD.ROAD_HALF + WORLD.SIDEWALK
// A celula e testada em 80% do proprio tamanho, e nao nas quinas exatas. Toda
// borda de calcada do mapa cai em coordenada PAR (8, 12, 52, 68, 72), entao a
// quina exata de uma celula pousa em cima da transicao e a le como degrau. Com
// 0.8 sao 93 celulas rejeitadas no mapa inteiro; com 1.0 eram 988 -- ou seja,
// uma pista varrida de 2 m contornando cada calcada, que le como bug.
const AMOSTRA = PASSO * 0.4
const DESLOC = 0.4                 // quanto a mancha pode fugir do centro
// A mancha e MAIOR que a celula, e de proposito: numa grade de 2 m com mancha
// de 2 m o manto vira bolinha de neve separada uma da outra (foi fotografado, e
// lia como pintinha branca no asfalto). Com 2.9 a 3.8 m cada mancha invade as
// oito vizinhas, as bordas macias se somam e o que se ve e um lencol continuo
// com contorno irregular. O custo e zero: e a MESMA instancia, so com escala
// maior — e como matChao nao escreve no depth, a sobreposicao nao briga.
const MANCHA_MIN = 2.9
const MANCHA_MAX = 3.8
const ALTURA_MANCHA = 0.035        // acima do piso, em calcada/parque/beco
// No nivel da rua o "piso" do groundY e 0, mas o asfalto flutua em 0.02 e a
// pintura de faixa tem 2.6 cm (topo em 0.046). Com 3.5 cm a faixa amarela
// atravessava a neve inteira. 5 cm cobre a pintura; sobre a grama isso vira uma
// folga de 5 cm que ninguem enxerga, porque a mancha nao tem borda dura.
const ALTURA_MANCHA_RUA = 0.050

// --- transicao -------------------------------------------------------------
const VEL_ACUMULA = 0.14           // cobertura/s subindo (~7 s pra nevar tudo)
const VEL_DERRETE = 0.09           // descendo e mais lento: gelo demora a ir
const LIMIAR_VISIVEL = 0.02        // abaixo disso o grupo inteiro sai da cena
const DT_MAX = 0.1                 // volta de tab em segundo plano nao teleporta

// --- PRNG deterministica (a cidade nevada e sempre a mesma) -----------------
// Mesmo helper de city.js. Cada familia tem a SUA semente: assim mexer no
// numero de pingentes nao reembaralha a posicao de todas as manchas do chao.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Mancha de neve: varios circulos brancos macios sobrepostos + ruido no alpha.
 * A borda NUNCA e um circulo -- a uniao dos circulos e que da o contorno
 * irregular, e com rotacao/escala sorteadas duas manchas vizinhas nunca se
 * repetem. E o que faz a grade de 2 m ler como manto continuo e nao tabuleiro.
 */
function texturaMancha() {
  const rnd = mulberry32(0x51E0A1)
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  g.clearRect(0, 0, S, S)
  for (let i = 0; i < 20; i++) {
    // O primeiro fica no centro e segura o miolo opaco; os outros so mordem a
    // borda. A mancha tem que chegar QUASE na aresta do quadrado: com o miolo
    // pequeno as manchas vizinhas da grade de 2 m nao se encontravam na
    // diagonal e sobrava um furo a cada quatro celulas. Limite 0.22+0.25 =
    // 0.47 do lado, o suficiente pra o alpha morrer antes da aresta (se cortar
    // reto no quadrado, a mancha vira azulejo).
    const a = rnd() * Math.PI * 2
    const d = (i === 0 ? 0 : Math.pow(rnd(), 0.7) * 0.20) * S
    const cx = S / 2 + Math.cos(a) * d
    const cy = S / 2 + Math.sin(a) * d
    // Miolo GRANDE (0.40 do lado, nao 0.30): o alpha precisa chegar cheio em
    // quase todo o quadrado, porque e a area opaca que decide se o manto fecha.
    // Com o miolo pequeno so a pontinha das manchas se encontrava.
    const r = (i === 0 ? 0.44 : 0.16 + rnd() * 0.13) * S
    const grd = g.createRadialGradient(cx, cy, r * 0.30, cx, cy, r)
    grd.addColorStop(0.0, 'rgba(255,255,255,1)')
    grd.addColorStop(0.66, 'rgba(250,253,255,0.90)')
    grd.addColorStop(1.0, 'rgba(242,248,255,0)')
    g.fillStyle = grd
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill()
  }
  // granulado: neve nao e leite derramado. So no alpha, pra nao sujar a cor.
  const img = g.getImageData(0, 0, S, S)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i + 3] * (0.84 + rnd() * 0.32)
    d[i + 3] = v > 255 ? 255 : v | 0
  }
  g.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/**
 * Toda a neve acumulada da cidade.
 * @param groundY  city.groundY(x,z) -- diz onde ha calcada, parque, beco, loja
 * @param ancoras  city.neveAncoras  -- arvores / arbustos / postes / lixeiras
 */
export function criarNeve({ groundY, ancoras } = {}) {
  const piso = typeof groundY === 'function' ? groundY : () => LEVELS.ROAD
  const anc = ancoras || {}
  const arvores = Array.isArray(anc.arvores) ? anc.arvores : []
  const arbustos = Array.isArray(anc.arbustos) ? anc.arbustos : []
  const postes = Array.isArray(anc.postes) ? anc.postes : []
  const lixeiras = Array.isArray(anc.lixeiras) ? anc.lixeiras : []
  const bancos = Array.isArray(anc.bancos) ? anc.bancos : []

  const grupo = new THREE.Group()
  grupo.name = 'neve'
  // dynamic: bake.js NAO pode fundir isto no mesh gigante da cidade -- a neve
  // muda de escala e de opacidade em tempo de execucao.
  grupo.userData.dynamic = true
  // semTiro: o revolver sobe pelos pais ao decidir o que o raio ignora, entao
  // marcar a raiz ja bastaria; marcamos malha por malha por seguranca.
  grupo.userData.semTiro = true
  grupo.visible = false

  // -------------------------------------------------------------------------
  // MATERIAIS -- um por familia, nunca um por instancia
  // -------------------------------------------------------------------------
  const texChao = texturaMancha()
  // roughness baixa o bastante pra o sol arrancar um specular (neve cintila),
  // metalness quase zero (com metalness alta e sem environment map a neve vira
  // plastico escuro). O chao fica um pouco mais fosco que as capas: e uma area
  // enorme, e ali o brilho especular vira clarao chapado.
  const matChao = new THREE.MeshStandardMaterial({
    map: texChao, color: 0xf4f8fc, roughness: 0.66, metalness: 0.02,
    transparent: true, opacity: 0, depthWrite: false,
    // A neve fica POR CIMA do asfalto pintado, e a pintura da rua ja usa
    // polygonOffset -4/-8 (city.js). Empatar seria z-fight; -8/-16 ganha.
    polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16,
  })
  const matCapa = new THREE.MeshStandardMaterial({
    color: 0xf4f8fc, roughness: 0.52, metalness: 0.02,
    transparent: true, opacity: 0,
  })
  const matGelo = new THREE.MeshStandardMaterial({
    color: 0xdaeefc, roughness: 0.10, metalness: 0.04,
    transparent: true, opacity: 0, depthWrite: false,
  })

  // -------------------------------------------------------------------------
  // GEOMETRIAS BASE -- origem no PONTO DE APOIO, nao no centro
  // -------------------------------------------------------------------------
  // Isso e o que torna a cobertura barata: com a origem na base, escalar Y faz
  // a neve ENGORDAR pra cima sem sair do lugar. Com a origem no centro cada
  // mudanca de espessura exigiria corrigir a posicao tambem.
  const geoChao = new THREE.PlaneGeometry(1, 1)
  geoChao.rotateX(-Math.PI / 2)          // deitado: a rotacao Y da instancia gira no plano
  const geoCaixa = new THREE.BoxGeometry(1, 1, 1)
  geoCaixa.translate(0, 0.5, 0)
  // meia esfera de raio 1 e altura 1: capa/monte/calota, tudo sai daqui
  const geoDomo = new THREE.SphereGeometry(1, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5)
  // cone fechado (base incluida): o jogador olha a arvore DE BAIXO, e um cone
  // aberto mostraria buraco em vez da barriga do disco de neve
  const geoDisco = new THREE.ConeGeometry(1, 1, 9)
  geoDisco.translate(0, 0.5, 0)
  // pingente: ponta pra BAIXO e origem no beiral, entao crescer em Y e o gelo
  // se alongando pro chao, que e exatamente como ele se forma
  const geoGelo = new THREE.ConeGeometry(1, 1, 5)
  geoGelo.rotateX(Math.PI)
  geoGelo.translate(0, -0.5, 0)

  // -------------------------------------------------------------------------
  // FAMILIAS -- cada uma vira UMA InstancedMesh
  // -------------------------------------------------------------------------
  // 'grau' diz qual curva de espessura a familia segue quando a cobertura muda
  // (null = so a opacidade muda, caso do chao).
  const familias = []
  function novaFamilia(nome, geo, mat, grau) {
    const f = { nome, geo, mat, grau: grau || null, buf: [], base: null, n: 0, malha: null }
    familias.push(f)
    return f
  }
  /** Empilha uma instancia (posicao, rotacao euler, escala). */
  function por(f, x, y, z, rx, ry, rz, sx, sy, sz) {
    f.buf.push(x, y, z, rx, ry, rz, sx, sy, sz)
  }

  const fChao = novaFamilia('chao', geoChao, matChao, null)
  const fCaixa = novaFamilia('caixa', geoCaixa, matCapa, 'capa')
  const fDomo = novaFamilia('domo', geoDomo, matCapa, 'capa')
  const fDisco = novaFamilia('disco', geoDisco, matCapa, 'capa')
  const fGelo = novaFamilia('gelo', geoGelo, matGelo, 'gelo')

  // -------------------------------------------------------------------------
  // 1. NEVE NO CHAO
  // -------------------------------------------------------------------------
  // Pegadas dos predios com a folga de parede: la dentro tem TELHADO, e o
  // groundY nao sabe disso -- ele devolve SHOP_FLOOR pro lote inteiro da loja,
  // interior incluido. Sem esta lista a barbearia nevava por dentro.
  //
  // A pegada e a CAIXA DO LOTE, sem margem nenhuma. Ja teve WALL_T de folga
  // aqui, somada ao teto de tamanho la embaixo, e o resultado era uma FAIXA DE
  // CALCADA PELADA de uns dois metros e meio contornando cada predio do mapa:
  // a cidade nevava inteira, menos justamente a beirada que o jogador ve de
  // perto ao andar na calcada. A parede tem 30 cm de espessura e e opaca —
  // deixar a mancha encostar nela (e entrar um pouco) nao mostra nada.
  const pegadas = []
  for (let i = 0; i < LOTES.length; i++) {
    const b = LOTES[i]
    pegadas.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })
  }
  for (let i = 0; i < FILLERS.length; i++) {
    const b = FILLERS[i]
    pegadas.push({ x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 })
  }

  /** Distancia de Chebyshev ate a pegada mais proxima; -1 se estiver dentro. */
  function folgaPredio(x, z) {
    let melhor = Infinity
    for (let i = 0; i < pegadas.length; i++) {
      const p = pegadas[i]
      const dx = Math.max(p.x0 - x, x - p.x1)
      const dz = Math.max(p.z0 - z, z - p.z1)
      if (dx < 0 && dz < 0) return -1
      const d = Math.max(dx, dz)
      if (d < melhor) melhor = d
    }
    return melhor
  }

  const rndChao = mulberry32(0x5E0C0A)
  // Meio passo de deslocamento: os centros caem em coordenada IMPAR e nenhuma
  // celula fica montada em cima de uma borda de calcada -- as bordas passam
  // exatamente ENTRE duas celulas. Sem esse meio metro, 1227 celulas eram
  // rejeitadas por degrau em vez de 93.
  for (let x = -ALCANCE + PASSO / 2; x <= ALCANCE; x += PASSO) {
    for (let z = -ALCANCE + PASSO / 2; z <= ALCANCE; z += PASSO) {
      const h = piso(x, z)
      // cinco amostras iguais = celula plana. Diferentes = ela esta em cima de
      // um meio-fio ou de um degrau, e uma mancha deitada atravessaria o degrau
      // saindo pelo lado de baixo.
      if (piso(x - AMOSTRA, z - AMOSTRA) !== h) continue
      if (piso(x + AMOSTRA, z - AMOSTRA) !== h) continue
      if (piso(x - AMOSTRA, z + AMOSTRA) !== h) continue
      if (piso(x + AMOSTRA, z + AMOSTRA) !== h) continue
      const folga = folgaPredio(x, z)
      if (folga < 0) continue
      // Colado numa parede o sorteio de deslocamento e DESLIGADO: 40 cm de
      // deriva pra dentro do predio e o que poe neve no meio da loja.
      const coladoNaParede = folga < 1.5
      const dx = coladoNaParede ? 0 : (rndChao() - 0.5) * 2 * DESLOC
      const dz = coladoNaParede ? 0 : (rndChao() - 0.5) * 2 * DESLOC
      let esc = MANCHA_MIN + rndChao() * (MANCHA_MAX - MANCHA_MIN)
      // Encolhe quem estiver perto de parede: a mancha gira livre, entao a
      // meia-diagonal (esc*0.707) e o alcance de pior caso. Sem este teto a
      // neve atravessava a parede e reaparecia DENTRO da loja, que tem vitrine.
      //
      // O alcance permitido inclui 60% da espessura da parede: esses 18 cm
      // ficam enterrados no proprio bloco de alvenaria, invisiveis dos dois
      // lados, e sao o que permite a neve ENCOSTAR no predio em vez de parar
      // dois metros antes dele.
      const alcance = folga + WALL_T * 0.6 - (coladoNaParede ? 0 : DESLOC)
      const teto = alcance / 0.7071
      if (teto < esc) esc = teto
      // Piso baixo (era 0.9): junto da parede so cabe mancha pequena, e uma
      // franja de manchinhas de meio metro cobre a calcada; recusa-las e que
      // abria a faixa pelada.
      if (esc < 0.45) continue
      por(fChao,
        x + dx, h + (h === LEVELS.ROAD ? ALTURA_MANCHA_RUA : ALTURA_MANCHA), z + dz,
        0, rndChao() * Math.PI * 2, 0,
        esc, 1, esc)
    }
  }

  // -------------------------------------------------------------------------
  // 2. NEVE NOS TELHADOS
  // -------------------------------------------------------------------------
  const rndTelh = mulberry32(0x7E1AD0)

  /** Laje fina de neve cobrindo um retangulo, apoiada em 'topo'. */
  function lajeDeNeve(x0, x1, z0, z1, topo, esp) {
    const w = x1 - x0, d = z1 - z0
    if (w <= 0.05 || d <= 0.05) return
    por(fCaixa, (x0 + x1) / 2, topo, (z0 + z1) / 2, 0, 0, 0, w, esp, d)
  }

  /** Montes soprados pelo vento: e o que quebra o "topo perfeitamente plano". */
  function montesNoTelhado(x0, x1, z0, z1, topo, n) {
    for (let i = 0; i < n; i++) {
      const r = 0.7 + rndTelh() * 1.4
      const vx = Math.max(0.01, (x1 - x0) - r * 2)
      const vz = Math.max(0.01, (z1 - z0) - r * 2)
      por(fDomo, x0 + r + rndTelh() * vx, topo, z0 + r + rndTelh() * vz,
        0, rndTelh() * Math.PI * 2, 0, r, 0.16 + rndTelh() * 0.18, r * 0.86)
    }
  }

  // Lotes com interior. A casca de city.buildShell poe a laje de cobertura em
  // (w+0.7 x 0.34 x d+0.7) centrada em H+0.17 -- topo em H+0.34 -- com as
  // quatro muretas recuadas 5 cm pra dentro da parede.
  for (let i = 0; i < LOTES.length; i++) {
    const b = LOTES[i]
    const H = b.wallHeight
    const w = b.x1 - b.x0, d = b.z1 - b.z0
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2
    const topo = H + 0.34

    // miolo do telhado: recuado das muretas, a neve nao encosta na beirada
    lajeDeNeve(b.x0 + 0.26, b.x1 - 0.26, b.z0 + 0.26, b.z1 - 0.26, topo, 0.10 + rndTelh() * 0.06)
    montesNoTelhado(b.x0 + 0.8, b.x1 - 0.8, b.z0 + 0.8, b.z1 - 0.8, topo + 0.06, 2)

    // BEIRAL exposto (a faixa de laje que sobra pra fora das muretas). E a
    // unica parte do telhado que o jogador ve da calcada, entao e a que mais
    // paga: uma linha branca contornando o predio inteiro la em cima.
    lajeDeNeve(b.x0 - 0.33, b.x1 + 0.33, b.z0 - 0.33, b.z0 - 0.12, topo, 0.075)
    lajeDeNeve(b.x0 - 0.33, b.x1 + 0.33, b.z1 + 0.12, b.z1 + 0.33, topo, 0.075)
    lajeDeNeve(b.x0 - 0.33, b.x0 - 0.12, b.z0 - 0.12, b.z1 + 0.12, topo, 0.075)
    lajeDeNeve(b.x1 + 0.12, b.x1 + 0.33, b.z0 - 0.12, b.z1 + 0.12, topo, 0.075)

    // Platibanda: a da FACHADA e sempre mais alta que as outras tres. Mas a
    // altura nao e a mesma nos tres lotes, e e por isso que ela sai de uma
    // variavel em vez de numero solto -- so a barbearia e a mercearia passam
    // pelo buildShell de city.js (muretas de 0.7 na fachada e 0.55 nos lados,
    // topo em H+1.04 / H+0.895). O cassino tem casca propria em casino.js:
    // mureta de 0.95/0.72 E ainda uma cornija dourada de 14 cm por cima, o que
    // poe o topo real em H+1.41 na fachada e H+1.17 nos outros tres lados.
    // Com os numeros do buildShell a faixa de neve do cassino nascia de 27 a
    // 51 cm DENTRO da mureta: invisivel: o predio mais alto e mais visto do
    // mapa era justamente o unico sem a linha branca coroando o telhado.
    const cassino = b.id === 'casino'
    const yFrente = H + (cassino ? 1.41 : 1.04)
    const yLado = H + (cassino ? 1.17 : 0.895)
    // o cassino e o unico lote com a fachada em z0 (ver layout.js), entao quem
    // decide qual das quatro barras leva a altura de frente e a propria facade
    const frenteEmZ0 = b.facade === 'z0'
    const mx = (w + 0.5) / 2, mz = (d + 0.5) / 2
    lajeDeNeve(cx - mx + 0.06, cx + mx - 0.06, b.z1 - 0.16, b.z1 + 0.06, frenteEmZ0 ? yLado : yFrente, 0.08)
    lajeDeNeve(cx - mx + 0.06, cx + mx - 0.06, b.z0 - 0.06, b.z0 + 0.16, frenteEmZ0 ? yFrente : yLado, 0.08)
    lajeDeNeve(b.x0 - 0.06, b.x0 + 0.16, cz - mz + 0.06, cz + mz - 0.06, yLado, 0.08)
    lajeDeNeve(b.x1 - 0.16, b.x1 + 0.06, cz - mz + 0.06, cz + mz - 0.06, yLado, 0.08)
  }

  // Predios de cenario. Aqui o topo NAO e 'h': city.js poe cornija em h-0.02 e
  // so entao a laje de cobertura, cujo topo fica em h+0.20 (ROOF_Y). Usar 'h'
  // enterrava a neve 20 cm dentro do deck.
  for (let i = 0; i < FILLERS.length; i++) {
    const b = FILLERS[i]
    const topo = b.h + 0.20
    lajeDeNeve(b.x0 + 0.10, b.x1 - 0.10, b.z0 + 0.10, b.z1 - 0.10, topo, 0.10 + rndTelh() * 0.06)
    montesNoTelhado(b.x0 + 1.2, b.x1 - 1.2, b.z0 + 1.2, b.z1 - 1.2, topo + 0.06, 2)
    // rebordo da platibanda: 4 barras de 0.32 m, 28 cm pra fora da parede, com
    // o coping passando 5 cm de cada lado e topo em ROOF_Y + 0.98
    const px0 = b.x0 - 0.28, px1 = b.x1 + 0.28
    const pz0 = b.z0 - 0.28, pz1 = b.z1 + 0.28
    const pw = 0.32, ex = 0.05, cop = topo + 0.98
    lajeDeNeve(px0 - ex + 0.06, px1 + ex - 0.06, pz0 - ex + 0.06, pz0 + pw + ex - 0.06, cop, 0.08)
    lajeDeNeve(px0 - ex + 0.06, px1 + ex - 0.06, pz1 - pw - ex + 0.06, pz1 + ex - 0.06, cop, 0.08)
    lajeDeNeve(px0 - ex + 0.06, px0 + pw + ex - 0.06, pz0 + pw + 0.06, pz1 - pw - 0.06, cop, 0.08)
    lajeDeNeve(px1 - pw - ex + 0.06, px1 + ex - 0.06, pz0 + pw + 0.06, pz1 - pw - 0.06, cop, 0.08)
  }

  // -------------------------------------------------------------------------
  // 3. NEVE NAS ARVORES
  // -------------------------------------------------------------------------
  // As arvores da cidade sao coniferas (props.makeTree): tronco reto e 13-17
  // andares de saia num cone de lado quase reto. A neve nao e uma bola em cima
  // -- e uma PILHA de discos, um por regiao de andar, do raio da copa la
  // embaixo ate quase nada na ponta. E o empilhamento que le como galho
  // carregado; um disco so leria como chapeu.
  const rndArv = mulberry32(0xA2E0FE)
  for (let i = 0; i < arvores.length; i++) {
    const a = arvores[i]
    const alt = a.topo - a.base
    if (!(alt > 1.5) || !(a.raio > 0.4)) continue
    // a saia comeca em ~0.09 H e a ponta em ~0.95 H (ver makeTree)
    const y0 = a.base + alt * 0.13
    const y1 = a.base + alt * 0.94
    // UM disco por andar, do tamanho do andar, era o desenho obvio -- e ficava
    // errado: um cone de 1.6 m de raio e 40 cm de altura le como um PRATO
    // BRANCO enfiado na arvore, e a foto mostrava a copa fatiada por discos.
    // Neve em conifera nao e uma placa: ela se junta em TUFOS na ponta dos
    // galhos, e o meio da copa (que e denso e escuro) fica quase limpo.
    // Entao: varios tufos pequenos por andar, espalhados no anel EXTERNO do
    // andar, cada um com o proprio giro. A silhueta continua branca de longe e
    // de perto se le galho carregado, nao louca de porcelana.
    const nAndar = 6 + Math.floor(rndArv() * 3)
    for (let k = 0; k < nAndar; k++) {
      const u = nAndar > 1 ? k / (nAndar - 1) : 0
      // mesmo expoente dos andares: eles se juntam em cima, a neve tambem
      const y = y0 + (y1 - y0) * Math.pow(u, 0.82)
      // perfil conico do props.js, com o "ombro" segurando os dois primeiros
      // andares menores -- numa conifera o ponto mais largo nao e a saia, e
      // logo acima dela
      const ombro = 0.78 + 0.22 * Math.min(1, u * 3.4)
      const rAndar = a.raio * Math.pow(1 - u * 0.90, 0.62) * ombro
      if (rAndar < 0.12) continue
      // quantos tufos cabem neste andar: os de baixo sao largos, os de cima
      // quase nao tem onde pousar
      const nTufo = Math.max(2, Math.round(2 + rAndar * 2.2))
      const giro = rndArv() * Math.PI * 2
      for (let j = 0; j < nTufo; j++) {
        const ang = giro + (j / nTufo) * Math.PI * 2 + (rndArv() - 0.5) * 0.5
        // 60% a 95% do raio do andar: a neve fica na PONTA do galho
        const rr = rAndar * (0.60 + rndArv() * 0.35)
        const rt = rAndar * (0.20 + rndArv() * 0.13)   // raio do tufo
        por(fDomo,
          a.x + Math.cos(ang) * rr, y - rt * 0.15, a.z + Math.sin(ang) * rr,
          (rndArv() - 0.5) * 0.35, rndArv() * Math.PI * 2, (rndArv() - 0.5) * 0.35,
          rt, rt * (0.42 + rndArv() * 0.22), rt * (0.78 + rndArv() * 0.28))
      }
    }
    // A PONTA leva um capuz conico -- e a unica parte da arvore onde a neve
    // fecha de verdade, porque ali nao ha galho separado, ha so a flecha. Cone
    // e nao domo: a silhueta tem que continuar terminando em bico.
    por(fDisco, a.x, a.base + alt * 0.945, a.z,
      (rndArv() - 0.5) * 0.12, rndArv() * Math.PI * 2, (rndArv() - 0.5) * 0.12,
      a.raio * 0.20, a.raio * 0.34, a.raio * 0.20)
    // capa no chao ao pe da arvore + um monte encostado no tronco
    por(fDomo, a.x, a.base + 0.01, a.z,
      0, rndArv() * Math.PI * 2, 0, a.raio * 0.58, 0.11, a.raio * 0.58)
    const am = rndArv() * Math.PI * 2
    por(fDomo, a.x + Math.cos(am) * 0.26, a.base + 0.01, a.z + Math.sin(am) * 0.26,
      0, rndArv() * Math.PI * 2, 0, 0.38, 0.26, 0.30)
  }

  // -------------------------------------------------------------------------
  // 4. NEVE NOS ARBUSTOS
  // -------------------------------------------------------------------------
  // Uma calota por BOLOTA (e nao uma por moita): o arbusto de city.js e um
  // aglomerado de 3-6 esferas achatadas, e uma unica bola branca por cima
  // boiaria no meio do aglomerado em vez de seguir o relevo dele.
  const rndArb = mulberry32(0xB07A5A)
  for (let i = 0; i < arbustos.length; i++) {
    const b = arbustos[i]
    const alt = b.alt > 0 ? b.alt : b.r
    // apoiada em 46% da meia-altura: e onde o raio horizontal da bolota ainda
    // vale ~0.89 r, entao uma calota de 0.85 r assenta sem vazar pela borda
    const r = b.r * 0.85
    por(fDomo, b.x, b.y + alt * 0.46, b.z,
      0, rndArb() * Math.PI * 2, 0, r, alt * 0.66, r)
  }

  // -------------------------------------------------------------------------
  // 5. DETALHES: postes, lixeiras, pingentes
  // -------------------------------------------------------------------------
  const rndDet = mulberry32(0x905E51)

  for (let i = 0; i < postes.length; i++) {
    const p = postes[i]
    // A ancora do poste guarda so x/z/y -- nao guarda a rotacao, e sem ela nao
    // da pra saber pra que lado o braco da luminaria aponta. Entao a capa vai
    // no topo do MASTRO (props.makeStreetLight sobe o cano ate 6.36 m), que
    // esta sempre no eixo. Errar a luminaria custaria uma bolota de neve
    // flutuando a 7 m de altura no meio da rua.
    por(fDomo, p.x, p.y + 6.35, p.z, 0, rndDet() * Math.PI * 2, 0, 0.12, 0.10, 0.12)
    // colar da base (topo em 0.27): esse o jogador ve de perto toda hora
    por(fDomo, p.x, p.y + 0.26, p.z, 0, rndDet() * Math.PI * 2, 0, 0.20, 0.07, 0.20)
    for (let k = 0; k < 2; k++) {
      const a = rndDet() * Math.PI * 2
      por(fDomo, p.x + Math.cos(a) * 0.24, p.y + 0.005, p.z + Math.sin(a) * 0.24,
        0, rndDet() * Math.PI * 2, 0, 0.30 + rndDet() * 0.12, 0.14 + rndDet() * 0.08, 0.26)
    }
  }

  for (let i = 0; i < lixeiras.length; i++) {
    const t = lixeiras[i]
    // a tampa e uma cupula de raio 0.31 centrada em 0.88; num raio de 0.25 a
    // superficie dela passa em 1.06, e ali que a capa assenta
    por(fDomo, t.x, t.y + 1.055, t.z, 0, rndDet() * Math.PI * 2, 0, 0.25, 0.15, 0.25)
    const a = rndDet() * Math.PI * 2
    por(fDomo, t.x + Math.cos(a) * 0.22, t.y + 0.005, t.z + Math.sin(a) * 0.22,
      0, rndDet() * Math.PI * 2, 0, 0.30, 0.11, 0.26)
  }

  // BANCOS. Sao o movel que o jogador mais ve de perto (ele SENTA neles), e um
  // banco de madeira limpo no meio de uma praca nevada denuncia a neve inteira
  // como decalque. Duas pecas so: a manta do assento e o fio no alto do
  // encosto. As medidas saem de props.makeBench: ripas do assento de x -0.91 a
  // 0.91 com o topo em 0.478, e o encosto inclinado terminando por volta de
  // y 0.98 / z -0.44 no espaco LOCAL do banco -- por isso a ancora precisa
  // guardar o giro (ry), senao a manta fica atravessada no banco.
  for (let i = 0; i < bancos.length; i++) {
    const b = bancos[i]
    const cos = Math.cos(b.ry), sen = Math.sin(b.ry)
    // manta do assento: um dedo de neve cobrindo as tres ripas
    por(fCaixa, b.x, b.y + 0.478, b.z, 0, b.ry, 0, 1.86, 0.055, 0.56)
    // fio de neve no alto do encosto (local z = -0.44)
    por(fCaixa, b.x - 0.44 * sen, b.y + 0.965, b.z - 0.44 * cos,
      0, b.ry, 0, 1.80, 0.045, 0.17)
    // e um montinho encostado num dos pes
    const lado = rndDet() > 0.5 ? 1 : -1
    por(fDomo, b.x + lado * 0.78 * cos, b.y + 0.005, b.z - lado * 0.78 * sen,
      0, rndDet() * Math.PI * 2, 0, 0.34, 0.10, 0.30)
  }

  // Pingentes de gelo na beirada do telhado dos lotes -- a fachada e o que o
  // jogador ve de perto. Ficam so nas PONTAS da fachada: o meio e onde moram a
  // porta, o letreiro e as luminarias dele, e um pingente atravessando o
  // letreiro estragaria justamente o que ele deveria enfeitar.
  const rndGelo = mulberry32(0x1CE1CE)
  for (let i = 0; i < LOTES.length; i++) {
    const b = LOTES[i]
    const w = b.x1 - b.x0
    const zB = b.facade === 'z0' ? b.z0 - 0.26 : b.z1 + 0.26
    const n = 3 + Math.floor(rndGelo() * 3)
    for (let k = 0; k < n; k++) {
      const t = 0.06 + rndGelo() * 0.20
      const x = (k % 2) === 0 ? b.x0 + w * t : b.x1 - w * t
      const rr = 0.030 + rndGelo() * 0.022
      // pendura na FACE DE BAIXO da laje (H), nao no topo dela
      por(fGelo, x, b.wallHeight + 0.02, zB,
        0, rndGelo() * Math.PI * 2, 0, rr, 0.26 + rndGelo() * 0.36, rr)
    }
  }

  // -------------------------------------------------------------------------
  // MONTAGEM DAS INSTANCIAS
  // -------------------------------------------------------------------------
  const molde = new THREE.Object3D()   // unico; reusado por todo o modulo

  /** Reescreve as matrizes de uma familia com a espessura k. Zero alocacao. */
  function escrever(f, k) {
    const b = f.base
    const im = f.malha
    for (let i = 0, j = 0; i < f.n; i++, j += 9) {
      molde.position.set(b[j], b[j + 1], b[j + 2])
      molde.rotation.set(b[j + 3], b[j + 4], b[j + 5])
      molde.scale.set(b[j + 6], b[j + 7] * k, b[j + 8])
      molde.updateMatrix()
      im.setMatrixAt(i, molde.matrix)
    }
    im.instanceMatrix.needsUpdate = true
  }

  for (let i = 0; i < familias.length; i++) {
    const f = familias[i]
    f.n = f.buf.length / 9
    f.base = new Float32Array(f.buf)
    f.buf.length = 0
    if (f.n === 0) continue
    const im = new THREE.InstancedMesh(f.geo, f.mat, f.n)
    // a neve sempre mora EM CIMA de algo que ja projeta a mesma silhueta no
    // shadow map: pagar a segunda passada nao compraria sombra nova
    im.castShadow = false
    im.receiveShadow = true
    im.userData.semTiro = true
    im.userData.dynamic = true
    if (f.grau) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // O revolver ja descarta qualquer acerto marcado com semTiro, mas o raio
    // ainda testaria as ~4 mil instancias do chao antes de jogar tudo fora.
    // Sem raycast, o tiro simplesmente nunca olha pra ca.
    im.raycast = function () {}
    f.malha = im
    // escreve em escala CHEIA pra a esfera envolvente sair como superconjunto:
    // depois disso a cobertura so encolhe as instancias, nunca cresce alem
    escrever(f, 1)
    im.computeBoundingSphere()
    grupo.add(im)
  }
  // o chao desenha depois dos outros decalques deitados (poca, remendo, faixa),
  // que estao todos em renderOrder 0 e a distancia praticamente igual
  if (fChao.malha) fChao.malha.renderOrder = 2

  // -------------------------------------------------------------------------
  // COBERTURA: aparecer e derreter
  // -------------------------------------------------------------------------
  let alvo = 0
  let desenhada = 0
  let kCapa = -1
  let kGelo = -1

  function aplicar() {
    const c = desenhada
    const visivel = c > LIMIAR_VISIVEL
    grupo.visible = visivel
    if (!visivel) return

    // As manchas do chao nao mudam de tamanho (seriam ~4 mil matrizes por
    // quadro): quem conta a historia ali e a opacidade, que abre rapido porque
    // o chao e a primeira coisa a embranquecer de verdade.
    matChao.opacity = Math.min(1, c * 1.8) * 0.94
    matCapa.opacity = Math.min(1, c * 2.4)
    // com a capa quase opaca vale voltar a escrever profundidade (uma capa
    // atras da outra empilha certo); translucida, escrever esconderia as de tras
    matCapa.depthWrite = matCapa.opacity > 0.88

    // Pingente e o ultimo a chegar e o ultimo a ir: gelo so se forma depois que
    // ja existe neve no beiral pra derreter e recongelar.
    const gelo01 = c > 0.35 ? (c - 0.35) / 0.65 : 0
    matGelo.opacity = gelo01 * 0.62

    // A capa ENGORDA com a cobertura; o pingente ALONGA. Como a geometria tem
    // a origem no ponto de apoio, isso e so a escala em Y da instancia.
    const kc = 0.20 + 0.80 * c
    const kg = 0.12 + 0.88 * gelo01
    // So reescreve quando a espessura realmente andou. Parado -- nevando forte
    // ou completamente seco -- a neve nao custa uma matriz sequer por quadro.
    const mudouCapa = Math.abs(kc - kCapa) > 0.0015
    const mudouGelo = Math.abs(kg - kGelo) > 0.0015
    if (!mudouCapa && !mudouGelo) return
    for (let i = 0; i < familias.length; i++) {
      const f = familias[i]
      if (!f.malha) continue
      if (f.grau === 'capa' && mudouCapa) escrever(f, kc)
      else if (f.grau === 'gelo' && mudouGelo) escrever(f, kg)
    }
    if (mudouCapa) kCapa = kc
    if (mudouGelo) kGelo = kg
  }
  aplicar()

  /** Cobertura pedida (0..1). So guarda o alvo -- quem caminha e o atualizar. */
  function setCobertura(v) {
    const n = typeof v === 'number' && isFinite(v) ? v : 0
    alvo = n < 0 ? 0 : n > 1 ? 1 : n
  }

  function atualizar(dt) {
    const d = alvo - desenhada
    if (d === 0 || !(dt > 0)) return
    const passo = (d > 0 ? VEL_ACUMULA : VEL_DERRETE) * Math.min(dt, DT_MAX)
    // nunca aparecer nem sumir no talo: caminha, e so cola no alvo no fim
    if (Math.abs(d) <= passo) desenhada = alvo
    else desenhada += d > 0 ? passo : -passo
    aplicar()
  }

  function dispose() {
    if (grupo.parent) grupo.parent.remove(grupo)
    for (let i = 0; i < familias.length; i++) {
      const f = familias[i]
      if (f.malha) { grupo.remove(f.malha); f.malha.dispose() }
      f.malha = null
      f.base = null
    }
    geoChao.dispose(); geoCaixa.dispose(); geoDomo.dispose()
    geoDisco.dispose(); geoGelo.dispose()
    matChao.dispose(); matCapa.dispose(); matGelo.dispose()
    texChao.dispose()
  }

  return {
    grupo,
    setCobertura,
    atualizar,
    dispose,
    get cobertura() { return desenhada },
  }
}
