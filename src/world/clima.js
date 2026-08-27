import * as THREE from 'three'
import { LOTES, FILLERS } from './layout.js'

// ---------------------------------------------------------------------------
// CLIMA — sol, chuva e neve, com troca de estacao.
//
// Nada disso cai no mapa inteiro: cai numa caixa que anda junto com quem ve.
// Fora dessa caixa ninguem enxergaria a particula mesmo, entao pagar por ela
// seria desenhar o que nao aparece. A caixa se move por WRAP: quando a gota
// (ou o floco) sai por um lado, ela reentra pelo lado oposto -- assim o volume
// acompanha a camera sem nunca precisar recriar nada.
//
// Zero alocacao por quadro: TODO o estado mora em Float32Array pre-alocados e
// so e reescrito. Nada de new dentro de atualizar() — nem Vector3, nem Color.
//
// Chuva e neve dividem a mesma estrutura de proposito: a caixa, o wrap, a
// grade de telhado e o orcamento de particulas sao os mesmos. O que muda e a
// fisica (a gota despenca a 9 m/s, o floco desce a 1 m/s bailando) e o jeito
// de desenhar (risco de linha x sprite redondo).
//
// Nao existe clima na rede: o contrato (REDE.md) nao tem pacote de clima, e o
// visual de efeito e sempre 100% local (mesma regra do feixe do anel). Cada
// maquina desenha o proprio tempo; quem chamar setEstacao decide qual e.
// ---------------------------------------------------------------------------

// --- caixa e ritmo ---------------------------------------------------------
const RAIO = 12             // meia-largura da caixa de clima (m)
const TOPO = 12             // altura do topo da caixa acima dos pes (m)
const FUNDO = -2.0          // abaixo dos pes: cobre quem esta em ponte/telhado
const ALTURA = TOPO - FUNDO
const VEL_TROCA = 0.5       // 0..1 em 2 s: e a suavidade da troca de estacao

// --- gotas -----------------------------------------------------------------
const MAX_GOTAS = 1500      // teto do pool; a intensidade so muda quantas usam
const VEL_MIN = 7.0         // m/s. Chuva mansa cai devagar; tempestade nao.
const VEL_MAX = 10.5
const RISCO_MIN = 0.18      // comprimento do risco (m) com chuva FRACA...
const RISCO_MAX = 0.30
const RISCO_TEMPESTADE = 1.7 // ...multiplicado por isto no maximo da forca

// --- respingos -------------------------------------------------------------
// O anel antigo crescia ate 1 m de diametro com aditivo em 1.25: lia como um
// prato de leite no asfalto, e era a queixa numero um. Uma gota de chuva faz
// um anel do tamanho de uma moeda grande e some em menos de meio segundo. O
// jeito de a chuva "bater" no chao nao e um anel grande, e MUITOS anezinhos.
const MAX_RESPINGOS = 180
const RESP_DIAM_MIN = 0.22  // diametro FINAL do anel (m)
const RESP_DIAM_MAX = 0.34
const RESP_VIDA_MIN = 0.30  // segundos ate sumir
const RESP_VIDA_MAX = 0.42
const RESP_ALCANCE = 9      // so respinga perto da camera (senao vira sujeira)

// --- coroa (os pingos que pulam do impacto) --------------------------------
const MAX_CORO = 240
const CORO_ALCANCE = 6      // a 6 m um pingo de 3 cm ja e meio pixel: nem nasce
const CORO_G = 9.8          // gravidade de verdade: e o que da o arco certo
const CORO_VY_MIN = 0.90    // sobe 4 cm (v^2/2g)
const CORO_VY_MAX = 1.25    // sobe 8 cm

// --- vento -----------------------------------------------------------------
// Rajada = soma de dois senos com periodos primos entre si. Se fossem 6 e 12 s
// a soma se repetiria a cada 12 s e o olho pegaria o compasso; com 7 e 11 o
// padrao so fecha em 77 s, que na pratica e "nunca".
const RAJADA_A = 7.0
const RAJADA_B = 11.0
const TAU = Math.PI * 2

// --- relampago -------------------------------------------------------------
// Este numero e a forca de chuva a partir da qual existe relampago, e ele TEM
// que ficar abaixo do intChuva que a tecla C liga (ver a secao 7). Ja esteve em
// 0.75 com o intChuva em 0.60: o gatilho era inalcancavel pelo jogo e a secao
// inteira do relampago virou codigo morto que parecia entregue.
const RAIO_FORCA_MIN = 0.70
const RAIO_ESPERA_MIN = 12
const RAIO_ESPERA_MAX = 30
const RAIO_PULSO = 0.12     // duracao de UMA piscada (s)
const RAIO_GAP = 0.15       // atraso da segunda piscada, quando ela existe

// --- neve ------------------------------------------------------------------
// Mais particulas que a chuva e cada uma minuscula: neve nao e feita de riscos
// grandes, e feita de MUITO ponto pequeno enchendo o ar.
const MAX_FLOCOS = 2600
const NEVE_VEL_MIN = 0.6    // m/s
const NEVE_VEL_MAX = 1.4
const NEVE_TAM = 0.06       // metros; cada floco multiplica isto por aTam
const NEVE_ESPIRAL_R_MIN = 0.05  // raio da espiral que o floco descreve (m)
const NEVE_ESPIRAL_R_MAX = 0.30
const NEVE_ESPIRAL_W_MIN = 0.5   // rad/s
const NEVE_ESPIRAL_W_MAX = 1.7
const ACUMULO_SUBIDA = 1 / 25    // ~25 s de nevasca cheia pra cobrir o chao
const ACUMULO_DERRETE = 1 / 45   // parou de nevar: derrete bem mais devagar
const ACUMULO_CHUVA = 1 / 18     // chuva em cima da neve lava o chao mais rapido

// Cinza-chumbo pro qual a neblina puxa quando chove forte, e o branco leitoso
// da nevasca. So sao usados no modo SEM lighting (ver secao 5): quando o
// lighting existe, o ceu e dele.
const CINZA_CHUVA = new THREE.Color(0x87909a)
const BRANCO_NEVE = new THREE.Color(0xeff4f9)

const ESTACOES = ['sol', 'chuva', 'neve']

/** Envelope de uma piscada de relampago: pico imediato, queda quadratica. */
function pulsoRaio(u) {
  if (u < 0 || u > RAIO_PULSO) return 0
  const k = 1 - u / RAIO_PULSO
  return k * k
}

/** Aproxima v de alvo no maximo VEL_TROCA por segundo (troca nunca no talo). */
function rampa(v, alvo, dt) {
  if (v === alvo) return v
  const passo = dt * VEL_TROCA
  return v < alvo ? Math.min(alvo, v + passo) : Math.max(alvo, v - passo)
}

/**
 * Textura do respingo: um ARO fino e macio, miolo transparente.
 * O erro do anel antigo nao era so o tamanho — era o desenho: um disco quase
 * cheio, que em qualquer escala le como mancha. Aqui a tinta toda mora entre
 * 72% e 96% do raio, e sobra borda esfumacada dos dois lados pra o poligono
 * nunca aparecer. Um miolo de 5% de alfa faz o "molhado" no meio do anel.
 */
function texturaRespingo() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  g.clearRect(0, 0, 64, 64)
  const aro = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  aro.addColorStop(0.00, 'rgba(224,238,248,0.00)')
  aro.addColorStop(0.50, 'rgba(224,238,248,0.00)')
  aro.addColorStop(0.72, 'rgba(228,242,252,0.09)')
  aro.addColorStop(0.87, 'rgba(238,248,255,0.62)')
  aro.addColorStop(0.96, 'rgba(228,242,252,0.15)')
  aro.addColorStop(1.00, 'rgba(228,242,252,0.00)')
  g.fillStyle = aro
  g.fillRect(0, 0, 64, 64)
  const molhado = g.createRadialGradient(32, 32, 0, 32, 32, 26)
  molhado.addColorStop(0.00, 'rgba(226,240,250,0.05)')
  molhado.addColorStop(1.00, 'rgba(226,240,250,0.00)')
  g.fillStyle = molhado
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Pingo da coroa e miolo generico: um ponto branco macio, sem aresta. */
function texturaPingo() {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grd.addColorStop(0.00, 'rgba(255,255,255,0.95)')
  grd.addColorStop(0.45, 'rgba(240,249,255,0.45)')
  grd.addColorStop(1.00, 'rgba(240,249,255,0.00)')
  g.fillStyle = grd
  g.fillRect(0, 0, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * Floco: nucleo branco, borda esfumacada e seis pontinhas discretas.
 * As pontinhas sao SUGESTAO, nao desenho de cristal: a 3 m o floco tem 4 px na
 * tela e o que o olho pega e a silhueta um pouco estrelada. Desenhar um floco
 * bonito de perto so gastaria canvas.
 */
function texturaFloco() {
  const s = 64
  const m = s / 2
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')
  g.strokeStyle = 'rgba(255,255,255,0.28)'
  g.lineWidth = 2.0
  g.lineCap = 'round'
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3
    g.beginPath()
    g.moveTo(m, m)
    g.lineTo(m + Math.cos(a) * m * 0.74, m + Math.sin(a) * m * 0.74)
    g.stroke()
  }
  // o nucleo entra POR CIMA das pontinhas: assim elas nascem de dentro do
  // borrao em vez de virarem seis riscos saindo de um buraco
  const grd = g.createRadialGradient(m, m, 0, m, m, m)
  grd.addColorStop(0.00, 'rgba(255,255,255,0.95)')
  grd.addColorStop(0.26, 'rgba(250,253,255,0.58)')
  grd.addColorStop(0.60, 'rgba(242,249,255,0.16)')
  grd.addColorStop(1.00, 'rgba(242,249,255,0.00)')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * @param {object} dep
 * @param dep.scene    cena (usada so pra ler/ajustar a fog quando NAO ha lighting)
 * @param dep.camera   quem ve: a caixa de clima e centrada nela
 * @param dep.renderer opcional; sem ele a exposicao nao e mexida
 * @param dep.groundY  opcional, (x,z)->altura do chao pros respingos
 * @param dep.inicial  opcional: numero = forca de chuva (compatibilidade) OU
 *                     string = nome da estacao ('sol' | 'chuva' | 'neve')
 * @param dep.lighting opcional, o ciclo de dia. COM ele o ceu fecha junto com o
 *                     tempo (setNublado/setNevando); sem ele sobra o filtro de
 *                     neblina daqui, que escurece mas nao muda o ceu.
 */
export function criarClima({ scene, camera, renderer, groundY, inicial, lighting } = {}) {
  // Quem fecha o ceu e o lighting, se ele existir: ceu, sol, nuvem, neblina e
  // exposicao sao DELE, e ele reescreve tudo todo quadro. Dois donos do mesmo
  // valor sempre acabam em escuridao dobrada ou em um apagando o outro.
  const fechaCeu = lighting && typeof lighting.setNublado === 'function'
  const nevaCeu = lighting && typeof lighting.setNevando === 'function'
  const chaoEm = typeof groundY === 'function' ? groundY : null

  const grupo = new THREE.Group()
  // nada do clima e alvo de tiro (ver as marcas em cada mesh abaixo)
  grupo.userData.semTiro = true
  grupo.name = 'clima'

  // =========================================================================
  // 1. O QUE TEM TELHADO
  // =========================================================================
  // Sem isto chove e NEVA dentro das lojas e do cassino — a caixa de particulas
  // cerca a camera e nao sabe o que existe acima dela. Ja foi visto em foto.
  //
  // Nao adianta simplesmente desligar o clima quando o jogador entra: as lojas
  // tem vitrine, e olhar pela vitrine numa tarde de chuva e ver a rua molhada.
  // Entao a decisao e POR PARTICULA: cada uma pergunta se o chao dela esta
  // coberto. As de dentro somem, as da rua continuam caindo do outro lado do
  // vidro.
  //
  // A pergunta e respondida por uma grade de 1 m montada UMA vez: por particula
  // por quadro seria caixa-por-caixa vezes 4 mil. Assim e uma leitura de array.
  //
  // A lista vem de LOTES (nao de [BARBER, GROCERY] escrito na mao): foi assim
  // que o cassino ficou de fora um dia e nevava dentro dele. Quem entra na
  // cidade com interior entra em LOTES e aparece aqui de graca.
  const COB = (() => {
    const caixas = []
    const push = (b) => { if (b) caixas.push([b.x0, b.x1, b.z0, b.z1]) }
    for (const l of LOTES) push(l)
    for (const f of FILLERS) push(f)
    if (!caixas.length) return null

    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const c of caixas) {
      if (c[0] < x0) x0 = c[0]; if (c[1] > x1) x1 = c[1]
      if (c[2] < z0) z0 = c[2]; if (c[3] > z1) z1 = c[3]
    }
    // margem de 1 m: a borda do telhado passa um pouco da parede
    x0 -= 1; z0 -= 1; x1 += 1; z1 += 1
    const w = Math.ceil(x1 - x0), d = Math.ceil(z1 - z0)
    const g = new Uint8Array(w * d)
    // Sem folga extra em volta de cada predio. Uma folga de meio metro para
    // cada lado, arredondada pra fora, virava quase 3 m de telhado imaginario
    // entre dois predios — e fechava os BECOS, que sao ruas de verdade aqui (o
    // revolver esta largado num deles). A celula de 1 m ja da o beiral: a
    // borda do predio cai no meio de uma celula e a celula inteira conta como
    // coberta.
    for (const c of caixas) {
      const a = Math.max(0, Math.floor(c[0] - x0))
      const b = Math.min(w - 1, Math.floor(c[1] - x0))
      const e = Math.max(0, Math.floor(c[2] - z0))
      const f = Math.min(d - 1, Math.floor(c[3] - z0))
      for (let iz = e; iz <= f; iz++) for (let ix = a; ix <= b; ix++) g[iz * w + ix] = 1
    }
    return { g, x0, z0, w, d }
  })()

  /** Tem telhado em cima deste ponto? */
  function coberto(x, z) {
    if (!COB) return false
    // Math.floor, e nao |0: para um ponto ANTES da origem da grade o |0 trunca
    // na direcao do zero (-0.4 vira 0) e o ponto entraria na primeira celula em
    // vez de ser recusado. Aqui a cidade tem coordenada negativa dos dois lados.
    const ix = Math.floor(x - COB.x0)
    if (ix < 0 || ix >= COB.w) return false
    const iz = Math.floor(z - COB.z0)
    if (iz < 0 || iz >= COB.d) return false
    return COB.g[iz * COB.w + ix] === 1
  }

  // =========================================================================
  // 2. AS GOTAS — um unico LineSegments de riscos finos
  // =========================================================================
  // Por que linha e nao Points: a gota de chuva vista de perto e um RISCO
  // vertical, nao um ponto redondo. Com Points seria preciso uma textura e um
  // sprite por gota; com LineSegments sao 2 vertices e uma draw call so.
  //
  // COR POR VERTICE: as gotas de perto sao claras, as do fundo quase somem, e
  // dentro do mesmo risco a ponta de baixo (a cabeca, onde a agua se junta) e
  // mais clara que o rastro. Isso da profundidade de graca — sem custo de
  // shader, sem segunda draw call — e e o que separa "chuva" de "grade branca".
  const posGotas = new Float32Array(MAX_GOTAS * 2 * 3)
  const corGotas = new Float32Array(MAX_GOTAS * 2 * 3)
  const geoGotas = new THREE.BufferGeometry()
  // DynamicDrawUsage: estes dois buffers sao reescritos e reenviados INTEIROS
  // todo quadro. No default (StaticDraw) o driver aloca esperando um upload so
  // na vida e depois leva um bufferSubData por frame -- e a dica errada. Mesmo
  // motivo do setUsage no instanceMatrix dos respingos, logo abaixo.
  geoGotas.setAttribute('position', new THREE.BufferAttribute(posGotas, 3).setUsage(THREE.DynamicDrawUsage))
  geoGotas.setAttribute('color', new THREE.BufferAttribute(corGotas, 3).setUsage(THREE.DynamicDrawUsage))
  geoGotas.setDrawRange(0, 0)

  const matGotas = new THREE.LineBasicMaterial({
    color: 0xdce8f2,
    vertexColors: true,  // multiplica a cor acima: o atributo e so brilho
    transparent: true,
    opacity: 0.2,
    depthWrite: false,   // gota nao tapa gota: sem isso vira grade preta
    fog: true,           // a chuva longe some junto com o resto: da profundidade
  })
  const gotas = new THREE.LineSegments(geoGotas, matGotas)
  // O tiro atravessa a chuva. Sem esta marca o raycast do revolver acerta a
  // gota que esta a 30 cm da cara do jogador e nenhuma bala chega ao alvo —
  // e chove o tempo todo, entao a arma simplesmente nao funcionaria.
  gotas.userData.semTiro = true
  // A caixa anda todo quadro; deixar o three recalcular bounding sphere seria
  // pagar por um culling que nunca vai cortar nada (a caixa cerca a camera).
  gotas.frustumCulled = false
  gotas.castShadow = false
  gotas.receiveShadow = false
  gotas.renderOrder = 6
  grupo.add(gotas)

  // Estado de cada gota, tudo em arrays planos (zero objeto por gota).
  const gx = new Float32Array(MAX_GOTAS)
  const gy = new Float32Array(MAX_GOTAS)
  const gz = new Float32Array(MAX_GOTAS)
  const gv = new Float32Array(MAX_GOTAS)   // velocidade de queda
  const gl = new Float32Array(MAX_GOTAS)   // comprimento base do risco
  const gb = new Float32Array(MAX_GOTAS)   // brilho proprio (0.7..1)

  /** Sorteia uma gota nova. cx/cz = centro da caixa; alto = nascer no topo. */
  function semearGota(i, cx, cz, cy, alto) {
    gx[i] = cx + (Math.random() * 2 - 1) * RAIO
    gz[i] = cz + (Math.random() * 2 - 1) * RAIO
    gy[i] = cy + (alto ? TOPO - Math.random() * 1.5 : FUNDO + Math.random() * ALTURA)
    gv[i] = VEL_MIN + Math.random() * (VEL_MAX - VEL_MIN)
    gl[i] = RISCO_MIN + Math.random() * (RISCO_MAX - RISCO_MIN)
    gb[i] = 0.7 + Math.random() * 0.3
  }
  for (let i = 0; i < MAX_GOTAS; i++) semearGota(i, 0, 0, 0, false)

  // =========================================================================
  // 3. OS RESPINGOS — aneis pequenos e a coroa de pingos
  // =========================================================================
  const texResp = texturaRespingo()
  const texPingo = texturaPingo()
  // ADITIVO com valores minusculos, e nao normal com opacidade baixa. O motivo
  // e chato mas decisivo: num InstancedMesh o unico canal por instancia e a
  // COR (nao existe opacidade por instancia sem shader proprio), e com blending
  // normal levar a cor a zero pra apagar o anel desenha um anel PRETO de 60%
  // de alfa em cima do asfalto. Com aditivo, cor a zero e literalmente "nao
  // somou nada" — o fade sai de graca e nunca inventa mancha escura. O que
  // custou feio antes era a AMPLITUDE (1.25, quase um flash), nao o aditivo:
  // aqui o pico soma menos de 0.2 de branco, que le como agua clareando o
  // asfalto de leve.
  const matResp = new THREE.MeshBasicMaterial({
    map: texResp,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,          // aditivo + fog clareia em vez de sumir: nunca junte
  })
  const geoResp = new THREE.PlaneGeometry(1, 1)
  geoResp.rotateX(-Math.PI / 2)        // deitado no chao ja na geometria
  const respingos = new THREE.InstancedMesh(geoResp, matResp, MAX_RESPINGOS)
  respingos.userData.semTiro = true    // idem: respingo no chao nao para bala
  respingos.frustumCulled = false
  respingos.castShadow = false
  respingos.receiveShadow = false
  respingos.renderOrder = 5
  respingos.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  grupo.add(respingos)

  const rt = new Float32Array(MAX_RESPINGOS)   // tempo de vida restante
  const rv = new Float32Array(MAX_RESPINGOS)   // vida total (cada um difere)
  const rd = new Float32Array(MAX_RESPINGOS)   // diametro final
  const rx = new Float32Array(MAX_RESPINGOS)
  const ry = new Float32Array(MAX_RESPINGOS)
  const rz = new Float32Array(MAX_RESPINGOS)

  // A COROA: 2 ou 3 pingos que pulam do impacto, sobem 4-8 cm e caem com
  // gravidade em ~0.2 s. E o detalhe que faz a gota BATER no chao em vez de
  // sumir dentro dele — o anel sozinho parece decalque. Um InstancedMesh so,
  // billboard pela camera (um quadrado deitado de 3 cm visto de cima some).
  const matCoro = new THREE.MeshBasicMaterial({
    map: texPingo,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,  // mesmo motivo do anel: fade pela cor
    fog: false,
  })
  const geoCoro = new THREE.PlaneGeometry(1, 1)
  const coroa = new THREE.InstancedMesh(geoCoro, matCoro, MAX_CORO)
  coroa.userData.semTiro = true
  coroa.frustumCulled = false
  coroa.castShadow = false
  coroa.receiveShadow = false
  coroa.renderOrder = 6
  coroa.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  grupo.add(coroa)

  const ct = new Float32Array(MAX_CORO)    // vida restante
  const cpx = new Float32Array(MAX_CORO)
  const cpy = new Float32Array(MAX_CORO)
  const cpz = new Float32Array(MAX_CORO)
  const cvx = new Float32Array(MAX_CORO)
  const cvy = new Float32Array(MAX_CORO)
  const cvz = new Float32Array(MAX_CORO)
  const cs = new Float32Array(MAX_CORO)    // tamanho do pingo
  const cch = new Float32Array(MAX_CORO)   // altura do chao onde ele nasceu

  // Temporarios do quadro: criados UMA vez, reusados pra sempre.
  const _m4 = new THREE.Matrix4()
  const _cor = new THREE.Color()
  const _pos = new THREE.Vector3()
  const _esc = new THREE.Vector3()
  const _rot = new THREE.Quaternion()
  // Instancia morta e escondida encolhendo a matriz a zero: e mais barato do
  // que remontar o InstancedMesh com uma contagem diferente todo quadro.
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < MAX_RESPINGOS; i++) {
    respingos.setMatrixAt(i, _zero)
    respingos.setColorAt(i, _cor.setRGB(0, 0, 0))
  }
  for (let i = 0; i < MAX_CORO; i++) {
    coroa.setMatrixAt(i, _zero)
    coroa.setColorAt(i, _cor.setRGB(0, 0, 0))
  }
  let proxResp = 0
  let proxCoro = 0
  let acumResp = 0

  // =========================================================================
  // 4. OS FLOCOS — THREE.Points com sprite macio
  // =========================================================================
  // Aqui Points e a escolha certa pelo motivo oposto ao da chuva: o floco NAO
  // tem direcao (nao ha risco a desenhar), ele e um borrao redondo que gira
  // enquanto desce. Um sprite por floco, uma draw call, e o tamanho na tela
  // cai com a distancia sozinho (sizeAttenuation).
  const texFloco = texturaFloco()
  const posFlocos = new Float32Array(MAX_FLOCOS * 3)
  const corFlocos = new Float32Array(MAX_FLOCOS * 3)
  const tamFlocos = new Float32Array(MAX_FLOCOS)
  const geoFlocos = new THREE.BufferGeometry()
  // idem gotas: os tres sao reescritos por quadro, entao entram como dinamicos
  geoFlocos.setAttribute('position', new THREE.BufferAttribute(posFlocos, 3).setUsage(THREE.DynamicDrawUsage))
  geoFlocos.setAttribute('color', new THREE.BufferAttribute(corFlocos, 3).setUsage(THREE.DynamicDrawUsage))
  geoFlocos.setAttribute('aTam', new THREE.BufferAttribute(tamFlocos, 1).setUsage(THREE.DynamicDrawUsage))
  geoFlocos.setDrawRange(0, 0)

  const matFlocos = new THREE.PointsMaterial({
    size: NEVE_TAM,
    map: texFloco,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
    // Normal, e nao aditivo como os respingos: o floco e BRANCO sobre um ceu
    // que ja esta quase no teto de brilho, entao somar luz nele nao mudaria
    // pixel nenhum. O floco precisa COBRIR o fundo, nao acender.
    blending: THREE.NormalBlending,
    fog: true,   // o floco do fundo se dissolve na nevoa junto com a cidade
  })
  // TAMANHO POR FLOCO: o PointsMaterial so tem um 'size' global, e neve toda do
  // mesmo tamanho denuncia na hora que aquilo sao sprites. O enxerto abaixo
  // troca o size fixo por size * aTam, um atributo nosso. Se um dia o three
  // mudar essa linha do shader o replace nao casa e o pior que acontece e
  // voltar ao tamanho unico — nao quebra nada.
  matFlocos.onBeforeCompile = (sh) => {
    const v = sh.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * aTam;')
    sh.vertexShader = 'attribute float aTam;\n' + v
  }
  const flocos = new THREE.Points(geoFlocos, matFlocos)
  flocos.userData.semTiro = true       // idem gota: bala atravessa floco
  flocos.frustumCulled = false
  flocos.castShadow = false
  flocos.receiveShadow = false
  flocos.renderOrder = 6
  grupo.add(flocos)

  // Estado do floco. sx/sz sao o EIXO da espiral, nao a posicao desenhada: a
  // posicao final e o eixo mais um deslocamento circular. Separar os dois e o
  // que deixa o wrap continuar simples (ele mexe no eixo) enquanto o floco
  // roda em volta dele.
  const sx = new Float32Array(MAX_FLOCOS)
  const sy = new Float32Array(MAX_FLOCOS)
  const sz = new Float32Array(MAX_FLOCOS)
  const sv = new Float32Array(MAX_FLOCOS)   // velocidade de queda
  const sf = new Float32Array(MAX_FLOCOS)   // fase da espiral
  const sw = new Float32Array(MAX_FLOCOS)   // velocidade angular
  const sr = new Float32Array(MAX_FLOCOS)   // raio da espiral
  const sb = new Float32Array(MAX_FLOCOS)   // brilho proprio
  const ss = new Float32Array(MAX_FLOCOS)   // multiplicador de tamanho

  function semearFloco(i, cx, cz, cy, alto) {
    sx[i] = cx + (Math.random() * 2 - 1) * RAIO
    sz[i] = cz + (Math.random() * 2 - 1) * RAIO
    sy[i] = cy + (alto ? TOPO - Math.random() * 2.5 : FUNDO + Math.random() * ALTURA)
    sv[i] = NEVE_VEL_MIN + Math.random() * (NEVE_VEL_MAX - NEVE_VEL_MIN)
    sf[i] = Math.random() * TAU
    // metade gira pra um lado, metade pro outro: se todos girassem no mesmo
    // sentido a nevasca inteira pareceria um redemoinho so
    sw[i] = (NEVE_ESPIRAL_W_MIN + Math.random() * (NEVE_ESPIRAL_W_MAX - NEVE_ESPIRAL_W_MIN)) * (Math.random() < 0.5 ? -1 : 1)
    sr[i] = NEVE_ESPIRAL_R_MIN + Math.random() * (NEVE_ESPIRAL_R_MAX - NEVE_ESPIRAL_R_MIN)
    sb[i] = 0.55 + Math.random() * 0.45
    // curva ao quadrado: MUITO floco pequeno e uns poucos graudos, que e como
    // a neve real se distribui. Sorteio linear da um enxame homogeneo demais.
    const u = Math.random()
    ss[i] = 0.5 + u * u * 1.7
  }
  for (let i = 0; i < MAX_FLOCOS; i++) semearFloco(i, 0, 0, 0, false)

  // =========================================================================
  // 5. RELAMPAGO
  // =========================================================================
  // O clarao entra por uma luz AMBIENTE nossa, e nao por exposicao/fog, porque
  // no laco do main o clima roda ANTES do lighting: qualquer coisa escrita em
  // renderer.toneMappingExposure aqui seria apagada no mesmo quadro, quando o
  // lighting recalcula tudo a partir do ciclo de dia. A luz ambiente e nossa,
  // ninguem mais escreve nela, e some no proximo quadro sozinha. (No modo sem
  // lighting o clarao TAMBEM soma exposicao — la o dono do filtro somos nos.)
  //
  // AmbientLight nao entra no hash de luzes do three (ela vira uma soma de cor
  // no uniforme), entao ligar e desligar isso nao recompila shader nenhum.
  const luzRaio = new THREE.AmbientLight(0xdbe7ff, 0)
  grupo.add(luzRaio)

  let raioEspera = 6 + Math.random() * 10   // o primeiro nao demora 30 s
  let raioT = -1                            // <0 = nenhum clarao em andamento
  let raioDuplo = false
  let raioBrilho = 0

  // =========================================================================
  // 6. AMBIENTE — o filtro de reserva, so quando NAO ha lighting
  // =========================================================================
  // Com lighting no jogo, quem fecha o ceu e ele: setNublado/setNevando. Este
  // bloco e o plano B pra quem instanciar o clima sozinho (um teste, uma cena
  // solta). lighting.js reescreve fog e exposicao TODO quadro a partir do ciclo
  // de dia, entao nao da pra guardar um "valor original" na criacao: ele muda
  // sozinho. A saida e tratar o clima como filtro: se o valor de agora nao e o
  // que eu escrevi no quadro passado, foi outro que mexeu — essa e a base nova.
  let temBase = false
  let baseDens = 0, baseExp = 1
  const baseCor = new THREE.Color()
  let escritoDens = -1

  function restaurarAmbiente() {
    if (fechaCeu) {
      lighting.setNublado(0)
      if (nevaCeu) lighting.setNevando(0)
      return
    }
    if (!temBase) return
    if (scene && scene.fog) {
      scene.fog.density = baseDens
      scene.fog.color.copy(baseCor)
    }
    if (renderer) renderer.toneMappingExposure = baseExp
    temBase = false
    escritoDens = -1
  }

  function aplicarAmbiente(ch, nv) {
    if (fechaCeu) {
      // Durante a TROCA os dois ficam brevemente acima de zero, e tudo bem: o
      // lighting aplica nublado e depois nevando por lerp, entao a soma e
      // continua e o ceu atravessa de um pro outro sem pulo. Zerar um dos dois
      // no meio da transicao e que daria o pulo. Em regime, so um e diferente
      // de zero — nunca chove e neva ao mesmo tempo.
      lighting.setNublado(ch)
      if (nevaCeu) lighting.setNevando(nv)
      return
    }
    const f = scene && scene.fog
    if (!f) return
    if (!temBase || Math.abs(f.density - escritoDens) > 1e-7) {
      baseDens = f.density
      baseCor.copy(f.color)
      baseExp = renderer ? renderer.toneMappingExposure : 1
      temBase = true
    }
    const i = Math.max(ch, nv)
    if (i <= 0.002) { restaurarAmbiente(); return }
    // chuva: neblina mais fechada e puxada pro cinza (dessatura o fundo todo).
    // neve: neblina AINDA mais fechada, mas puxada pro branco e com a exposicao
    // SUBINDO — dia de neve e mais claro que o normal, nao mais escuro.
    f.density = baseDens * (1 + 1.05 * ch + 1.3 * nv)
    f.color.copy(baseCor)
    if (ch > 0) f.color.lerp(CINZA_CHUVA, 0.5 * ch)
    if (nv > 0) f.color.lerp(BRANCO_NEVE, 0.55 * nv)
    escritoDens = f.density
    if (renderer) {
      renderer.toneMappingExposure = baseExp * (1 - 0.18 * ch + 0.10 * nv + 0.55 * raioBrilho)
    }
  }

  // =========================================================================
  // 7. ESTADO DA ESTACAO
  // =========================================================================
  // chuva e neve sao dois valores 0..1 independentes que caminham devagar ate
  // o alvo. A estacao e so quem define os alvos — por isso a troca e suave de
  // graca: pedir 'neve' zera o alvo da chuva e liga o da neve, e as duas rampas
  // se cruzam no meio (a chuva sumindo enquanto a neve entra).
  let chuva = 0, neve = 0
  let alvoChuva = 0, alvoNeve = 0
  // Forca que a tecla C liga em cada estacao. O 0.78 da chuva nao e chute: ele
  // fica ACIMA de RAIO_FORCA_MIN (0.70), senao o relampago nunca dispara por
  // mais que se espere debaixo da tempestade.
  let intChuva = 0.78
  let intNeve = 0.8       // neve pede mais forca que chuva pra ler igual: o
                          // floco e pequeno e branco, some no ceu claro
  let estacao = 'sol'
  let cobertura = 0       // 0..1 de neve JA acumulada no chao (lido por neve.js)
  let tempo = 0
  let ativasGotas = 0
  let ativosFlocos = 0
  let semeouGotas = false
  let semeouFlocos = false
  let ligado = false      // o grupo esta visivel e simulando?

  // 'inicial' aceita numero (compatibilidade com quem passava forca de chuva)
  // ou o nome da estacao. Numero 0 e seco de verdade, nao "sol por acaso".
  if (typeof inicial === 'string') {
    if (ESTACOES.indexOf(inicial) >= 0) estacao = inicial
  } else if (typeof inicial === 'number' && isFinite(inicial)) {
    const v = Math.min(1, Math.max(0, inicial))
    if (v > 0.002) { estacao = 'chuva'; intChuva = v }
  } else {
    estacao = 'chuva'
  }
  if (estacao === 'chuva') alvoChuva = intChuva
  else if (estacao === 'neve') alvoNeve = intNeve
  // comeca JA no valor pedido: ninguem quer ver a chuva "ligando" no load
  chuva = alvoChuva
  neve = alvoNeve
  // E o grupo comeca escondido quando a estacao inicial e seca -- que e o caso
  // do jogo, que abre no 'sol'. Sem esta linha o grupo nasce visivel e so seria
  // apagado no PRIMEIRO desligamento, que nunca acontece se nunca chove: os
  // quatro objetos daqui tem frustumCulled = false, entao os dois InstancedMesh
  // desenhariam 420 quads de escala zero e as duas geometrias de particula
  // fariam draw calls de contagem zero (o three so corta drawCount NEGATIVO)
  // todo quadro, pra sempre, sujando ainda o contador de draw calls do F3.
  grupo.visible = chuva > 0.002 || neve > 0.002

  // =========================================================================
  // 8. ATUALIZACAO
  // =========================================================================
  // pos e a posicao do jogador (pes). O centro da caixa e a CAMERA: quem ve e
  // ela, e em 3a pessoa ela fica 4 m atras do boneco.
  function atualizar(dt, pos) {
    // dt travado: voltar de uma aba em segundo plano com dt de 3 s faria toda
    // gota atravessar a caixa inteira num quadro e o pool inteiro renascer.
    const d = dt > 0.1 ? 0.1 : (dt > 0 ? dt : 0)
    tempo += d

    chuva = rampa(chuva, alvoChuva, d)
    neve = rampa(neve, alvoNeve, d)

    // A cobertura do chao vive FORA do liga/desliga: depois que para de nevar
    // ela ainda tem que derreter devagar, e quem le esse valor (neve.js)
    // continua perguntando todo quadro, inclusive no sol.
    if (neve > 0.02) {
      // A forca pesa, mas nao manda sozinha: mesmo uma neve fraca cobre o chao
      // se insistir. Se fosse proporcional pura, uma nevada de 0.3 levaria mais
      // de um minuto e o jogador acharia que a cobertura estava quebrada.
      cobertura = Math.min(1, cobertura + d * (0.4 + 0.6 * neve) * ACUMULO_SUBIDA)
    } else {
      cobertura = Math.max(0, cobertura - d * (chuva > 0.1 ? ACUMULO_CHUVA : ACUMULO_DERRETE))
    }

    const temChuva = chuva > 0.002
    const temNeve = neve > 0.002

    if (!temChuva && !temNeve) {
      if (ligado) {
        // desligar de vez: fora da tela, sem draw range e sem filtro de ceu.
        // Os aneis e pingos vivos precisam MORRER aqui, senao ficariam
        // congelados no chao esperando um update que nunca mais vai rodar.
        ligado = false
        grupo.visible = false
        geoGotas.setDrawRange(0, 0)
        geoFlocos.setDrawRange(0, 0)
        matarRespingos()
        semeouGotas = false
        semeouFlocos = false
        raioT = -1
        raioBrilho = 0
        luzRaio.intensity = 0
        restaurarAmbiente()
      }
      return
    }
    ligado = true
    grupo.visible = true

    const cx = camera ? camera.position.x : (pos ? pos.x : 0)
    const cz = camera ? camera.position.z : (pos ? pos.z : 0)
    // O chao de referencia sao os PES do jogador: e onde a particula morre.
    const cy = pos ? pos.y : 0

    // --- vento com rajada ---------------------------------------------------
    // Constante o tempo todo, a chuva cai sempre com a mesma inclinacao e o
    // olho percebe que e um efeito. A rajada varia entre quase parado e o
    // dobro da media, e o RISCO acompanha (a inclinacao sai da velocidade
    // horizontal dividida pela de queda, que e o que acontece de verdade).
    const s7 = Math.sin(tempo * (TAU / RAJADA_A))
    const s11 = Math.sin(tempo * (TAU / RAJADA_B))
    const rajada = 0.55 + 0.30 * s7 + 0.15 * s11        // 0.10 .. 1.00
    const giro = 0.25 + 0.35 * s11                      // a direcao tambem gira
    const forcaVento = 0.5 + 3.0 * chuva
    const ventoX = forcaVento * rajada
    const ventoZ = forcaVento * rajada * giro
    // o floco pesa quase nada mas tambem cai quase parado: na pratica ele anda
    // menos que a gota, so que balancando muito mais (a espiral resolve isso)
    const nventoX = (0.25 + 0.8 * neve) * rajada
    const nventoZ = (0.25 + 0.8 * neve) * rajada * giro

    if (temChuva) atualizarChuva(d, cx, cz, cy, ventoX, ventoZ)
    else if (semeouGotas) { geoGotas.setDrawRange(0, 0); semeouGotas = false; ativasGotas = 0 }

    if (temNeve) atualizarNeve(d, cx, cz, cy, nventoX, nventoZ)
    else if (semeouFlocos) { geoFlocos.setDrawRange(0, 0); semeouFlocos = false; ativosFlocos = 0 }

    atualizarRespingos(d)
    atualizarCoroa(d)
    atualizarRaio(d)
    aplicarAmbiente(chuva, neve)
  }

  // --- chuva -----------------------------------------------------------------
  function atualizarChuva(dt, cx, cz, cy, ventoX, ventoZ) {
    // quantas gotas estao vivas. Curva ^0.75: com pouca chuva ainda da pra ler
    // que esta chovendo, e no maximo nao vira cortina.
    const quer = Math.round(MAX_GOTAS * Math.pow(chuva, 0.75))
    if (!semeouGotas) {
      // primeira vez: espalha por toda a altura, senao a chuva "cai do teto".
      // ativasGotas ja sobe pro alvo AQUI: se ficasse em zero, o bloco de
      // baixo mandaria essas mesmas gotas renascerem no topo e o espalhamento
      // que acabamos de fazer iria pro lixo — a chuva apareceria de cima.
      for (let i = 0; i < MAX_GOTAS; i++) semearGota(i, cx, cz, cy, false)
      semeouGotas = true
      ativasGotas = quer
    }
    if (quer > ativasGotas) {
      // gota nova entra pelo topo: aparecer no meio do ar denuncia o truque
      for (let i = ativasGotas; i < quer; i++) semearGota(i, cx, cz, cy, true)
    }
    ativasGotas = quer

    const limite = cy + FUNDO
    const dx = ventoX * dt
    const dz = ventoZ * dt
    // risco curto e ralo na garoa, longo e denso na tempestade
    const escalaRisco = 1 + (RISCO_TEMPESTADE - 1) * chuva
    const inv2 = 1 / (RAIO * RAIO)
    let podeRespingar = acumResp > 0
    let n = 0    // quantas gotas foram REALMENTE escritas no buffer

    for (let i = 0; i < ativasGotas; i++) {
      let x = gx[i] + dx
      let z = gz[i] + dz
      let y = gy[i] - gv[i] * dt

      // WRAP horizontal: a caixa "anda" com a camera sem nenhuma realocacao
      const ox = x - cx
      if (ox > RAIO) x -= RAIO * 2
      else if (ox < -RAIO) x += RAIO * 2
      const oz = z - cz
      if (oz > RAIO) z -= RAIO * 2
      else if (oz < -RAIO) z += RAIO * 2

      if (y < limite) {
        // bateu no chao: respinga (as vezes) e volta pro topo em outro lugar
        if (podeRespingar) {
          const ddx = x - cx, ddz = z - cz
          const d2 = ddx * ddx + ddz * ddz
          if (d2 < RESP_ALCANCE * RESP_ALCANCE && !coberto(x, z)) {
            nascerRespingo(x, z, cy, d2)
            acumResp -= 1
            podeRespingar = acumResp > 0
          }
        }
        semearGota(i, cx, cz, cy, true)
        x = gx[i]; y = gy[i]; z = gz[i]
      }
      gx[i] = x; gy[i] = y; gz[i] = z

      // Debaixo de telhado a gota continua existindo e caindo (ela vai sair do
      // predio pelo wrap), so nao entra na lista de desenho deste quadro. O
      // buffer e uma lista COMPACTA: quem nao e escrito simplesmente fica fora
      // do drawRange, e a GPU nem ve o vertice. E mais barato do que mandar um
      // segmento degenerado (dois pontos iguais) pro rasterizador.
      if (coberto(x, z)) continue

      const ddx = x - cx, ddz = z - cz
      // brilho por profundidade: a gota do fundo da caixa quase some. E o que
      // faz a chuva ter volume em vez de parecer um decalque na lente.
      const perto = 1 - Math.min(1, (ddx * ddx + ddz * ddz) * inv2)
      const b = gb[i] * (0.38 + 0.62 * perto)

      const len = gl[i] * escalaRisco
      const k = len / gv[i]   // tempo de queda do risco = deriva do vento nele
      const o = n * 6
      posGotas[o] = x
      posGotas[o + 1] = y
      posGotas[o + 2] = z
      posGotas[o + 3] = x - ventoX * k
      posGotas[o + 4] = y + len
      posGotas[o + 5] = z - ventoZ * k
      // cabeca clara, rastro apagado: a agua se acumula na frente da gota
      corGotas[o] = b
      corGotas[o + 1] = b
      corGotas[o + 2] = b
      const t = b * 0.28
      corGotas[o + 3] = t
      corGotas[o + 4] = t
      corGotas[o + 5] = t
      n++
    }

    geoGotas.setDrawRange(0, n * 2)
    geoGotas.attributes.position.needsUpdate = true
    geoGotas.attributes.color.needsUpdate = true
    // fino e quase transparente: a regra e nao atrapalhar a visao
    matGotas.opacity = 0.14 + 0.20 * chuva

    // Orcamento de respingos por segundo (o laco acima gasta esse credito).
    // Muito mais generoso que antes de proposito: como cada anel agora e do
    // tamanho de uma moeda, precisa de MUITO anel pra a rua parecer molhada.
    acumResp = Math.min(14, acumResp + dt * (40 + 260 * chuva))
  }

  // --- neve ------------------------------------------------------------------
  function atualizarNeve(dt, cx, cz, cy, ventoX, ventoZ) {
    // ^0.6 (mais cheia que a chuva na parte baixa da curva): neve fraca ainda
    // precisa de bastante floco pra ler como neve, senao parece poeira.
    const quer = Math.round(MAX_FLOCOS * Math.pow(neve, 0.6))
    if (!semeouFlocos) {
      // idem chuva: ja espalhados, entao ninguem renasce no topo neste quadro
      for (let i = 0; i < MAX_FLOCOS; i++) semearFloco(i, cx, cz, cy, false)
      semeouFlocos = true
      ativosFlocos = quer
    }
    if (quer > ativosFlocos) {
      for (let i = ativosFlocos; i < quer; i++) semearFloco(i, cx, cz, cy, true)
    }
    ativosFlocos = quer

    const limite = cy + FUNDO
    const dx = ventoX * dt
    const dz = ventoZ * dt
    const inv2 = 1 / (RAIO * RAIO)
    let n = 0

    for (let i = 0; i < ativosFlocos; i++) {
      let ex = sx[i] + dx
      let ez = sz[i] + dz
      const ey = sy[i] - sv[i] * dt

      const ox = ex - cx
      if (ox > RAIO) ex -= RAIO * 2
      else if (ox < -RAIO) ex += RAIO * 2
      const oz = ez - cz
      if (oz > RAIO) ez -= RAIO * 2
      else if (oz < -RAIO) ez += RAIO * 2

      if (ey < limite) {
        // Encostou no chao: renasce no topo, e so. Neve NAO respinga — anel de
        // agua embaixo de floco e o tipo de detalhe errado que estraga a cena
        // inteira. Quem mostra que a neve chegou no chao e a cobertura (o
        // getter la embaixo), que outro modulo pinta.
        semearFloco(i, cx, cz, cy, true)
        continue
      }
      sx[i] = ex; sy[i] = ey; sz[i] = ez
      sf[i] += sw[i] * dt

      // a espiral: o floco nao cai, ele bailia em volta do proprio eixo. O Z
      // usa 0.7 do raio pra a orbita ser uma elipse — circulo perfeito visto
      // de cima tambem seria um padrao, so que mais dificil de notar.
      const ang = sf[i]
      const px = ex + Math.cos(ang) * sr[i]
      const pz = ez + Math.sin(ang) * sr[i] * 0.7

      if (coberto(px, pz)) continue

      const ddx = px - cx, ddz = pz - cz
      const perto = 1 - Math.min(1, (ddx * ddx + ddz * ddz) * inv2)
      const b = sb[i] * (0.45 + 0.55 * perto)

      const o = n * 3
      posFlocos[o] = px
      posFlocos[o + 1] = ey
      posFlocos[o + 2] = pz
      corFlocos[o] = b
      corFlocos[o + 1] = b
      corFlocos[o + 2] = b
      tamFlocos[n] = ss[i]
      n++
    }

    geoFlocos.setDrawRange(0, n)
    geoFlocos.attributes.position.needsUpdate = true
    geoFlocos.attributes.color.needsUpdate = true
    geoFlocos.attributes.aTam.needsUpdate = true
    matFlocos.opacity = 0.55 + 0.40 * neve
  }

  // --- respingos --------------------------------------------------------------
  function nascerRespingo(x, z, cy, d2) {
    const i = proxResp
    proxResp = (proxResp + 1) % MAX_RESPINGOS
    rx[i] = x
    rz[i] = z
    // 5 cm e nao 1: groundY() devolve o NIVEL logico (0 na rua), mas o asfalto
    // e a pintura de faixa ficam ate 4.6 cm acima dele. Colado no nivel logico
    // o anel nascia DENTRO do asfalto e o teste de profundidade o apagava.
    const chao = (chaoEm ? chaoEm(x, z) : cy) + 0.05
    ry[i] = chao
    // cada anel com tamanho e vida proprios: identicos, o olho pega o padrao
    // na hora e a rua vira um mosaico de circulos iguais
    rd[i] = RESP_DIAM_MIN + Math.random() * (RESP_DIAM_MAX - RESP_DIAM_MIN)
    rv[i] = RESP_VIDA_MIN + Math.random() * (RESP_VIDA_MAX - RESP_VIDA_MIN)
    rt[i] = rv[i]
    // A coroa so nasce PERTO: a 6 m um pingo de 3 cm da meio pixel na tela e
    // custaria a mesma matriz de um que da pra ver.
    if (d2 < CORO_ALCANCE * CORO_ALCANCE) {
      const quantos = 2 + (Math.random() < 0.5 ? 1 : 0)
      for (let k = 0; k < quantos; k++) nascerPingo(x, chao, z)
    }
  }

  function nascerPingo(x, y, z) {
    const j = proxCoro
    proxCoro = (proxCoro + 1) % MAX_CORO
    const a = Math.random() * TAU
    const vh = 0.15 + Math.random() * 0.30
    cpx[j] = x
    cpy[j] = y + 0.01
    cpz[j] = z
    cvx[j] = Math.cos(a) * vh
    cvz[j] = Math.sin(a) * vh
    cvy[j] = CORO_VY_MIN + Math.random() * (CORO_VY_MAX - CORO_VY_MIN)
    cs[j] = 0.018 + Math.random() * 0.020
    cch[j] = y
    // tempo de voo balistico: sobe e volta ao chao em 2*v/g (~0.19 a 0.26 s).
    // Calculado, e nao chutado, pra o pingo nunca sumir no ar nem atravessar
    // o asfalto — ele morre exatamente quando aterrissa.
    ct[j] = 2 * cvy[j] / CORO_G
  }

  function matarRespingos() {
    for (let i = 0; i < MAX_RESPINGOS; i++) {
      rt[i] = 0
      respingos.setMatrixAt(i, _zero)
    }
    for (let i = 0; i < MAX_CORO; i++) {
      ct[i] = 0
      coroa.setMatrixAt(i, _zero)
    }
    respingos.instanceMatrix.needsUpdate = true
    coroa.instanceMatrix.needsUpdate = true
    acumResp = 0
  }

  function atualizarRespingos(dt) {
    let algum = false
    for (let i = 0; i < MAX_RESPINGOS; i++) {
      if (rt[i] <= 0) continue
      rt[i] -= dt
      if (rt[i] <= 0) {
        respingos.setMatrixAt(i, _zero)
        respingos.setColorAt(i, _cor.setRGB(0, 0, 0))
        algum = true
        continue
      }
      const u = 1 - rt[i] / rv[i]            // 0..1 da vida
      // raiz no crescimento: a onda abre rapido no impacto e vai freando, que
      // e o jeito que a agua espalha. Linear le como um circulo "inflando".
      const s = rd[i] * (0.30 + 0.70 * Math.sqrt(u))
      // (1-u)^1.6 = some antes de chegar ao tamanho maximo (anel grande e
      // fraco), com um fade de entrada de dois quadros pra nao PIPOCAR aceso.
      const a = 0.30 * Math.pow(1 - u, 1.6) * Math.min(1, u * 10 + 0.15)
      _m4.makeScale(s, 1, s)
      _m4.setPosition(rx[i], ry[i], rz[i])
      respingos.setMatrixAt(i, _m4)
      respingos.setColorAt(i, _cor.setRGB(a * 0.94, a * 0.98, a))
      algum = true
    }
    if (algum) {
      respingos.instanceMatrix.needsUpdate = true
      if (respingos.instanceColor) respingos.instanceColor.needsUpdate = true
    }
  }

  function atualizarCoroa(dt) {
    let algum = false
    // billboard: um quadrado de 3 cm deitado no chao some quando visto de cima,
    // e visto de lado vira um risco. Copiar a rotacao da camera UMA vez por
    // quadro resolve pros 240 de uma vez.
    if (camera) _rot.copy(camera.quaternion)
    for (let i = 0; i < MAX_CORO; i++) {
      if (ct[i] <= 0) continue
      ct[i] -= dt
      cvy[i] -= CORO_G * dt
      cpx[i] += cvx[i] * dt
      cpy[i] += cvy[i] * dt
      cpz[i] += cvz[i] * dt
      if (ct[i] <= 0 || cpy[i] < cch[i]) {
        ct[i] = 0
        coroa.setMatrixAt(i, _zero)
        coroa.setColorAt(i, _cor.setRGB(0, 0, 0))
        algum = true
        continue
      }
      // apaga nos ultimos ~120 ms: o pingo "se dissolve" antes de tocar o chao
      const a = Math.min(1, ct[i] * 8) * 0.5
      _pos.set(cpx[i], cpy[i], cpz[i])
      _esc.set(cs[i], cs[i], cs[i])
      _m4.compose(_pos, _rot, _esc)
      coroa.setMatrixAt(i, _m4)
      coroa.setColorAt(i, _cor.setRGB(a * 0.95, a * 0.98, a))
      algum = true
    }
    if (algum) {
      coroa.instanceMatrix.needsUpdate = true
      if (coroa.instanceColor) coroa.instanceColor.needsUpdate = true
    }
  }

  // --- relampago ---------------------------------------------------------------
  function atualizarRaio(dt) {
    raioBrilho = 0
    if (chuva > RAIO_FORCA_MIN) {
      raioEspera -= dt
      if (raioEspera <= 0 && raioT < 0) {
        raioT = 0
        raioDuplo = Math.random() < 0.55   // metade dos raios pisca duas vezes
        raioEspera = RAIO_ESPERA_MIN + Math.random() * (RAIO_ESPERA_MAX - RAIO_ESPERA_MIN)
      }
    }
    if (raioT >= 0) {
      raioT += dt
      let b = pulsoRaio(raioT)
      if (raioDuplo) b += 0.7 * pulsoRaio(raioT - RAIO_GAP)
      // so vale a pena quando ja e tempestade de verdade; e sobe suave a partir
      // do limiar pra o primeiro raio nao aparecer do nada numa chuva media
      const g = Math.min(1, (chuva - RAIO_FORCA_MIN) / 0.15)
      raioBrilho = Math.min(1, b) * g
      if (raioT > (raioDuplo ? RAIO_GAP + RAIO_PULSO : RAIO_PULSO)) raioT = -1
    }
    // discreto de proposito: o clarao ILUMINA a cidade por um instante, nao
    // lava a tela de branco. 0.7 sobre a ambiente do dia ja e bem visivel.
    luzRaio.intensity = raioBrilho * 0.7
  }

  // =========================================================================
  // 9. API
  // =========================================================================
  /** 0 = seco (custo zero), 1 = chuva no maximo. Transicao e suavizada. */
  function setChuva(v) {
    const n = typeof v === 'number' && isFinite(v) ? v : 0
    const f = Math.min(1, Math.max(0, n))
    alvoChuva = f
    if (f > 0.002) {
      intChuva = f
      alvoNeve = 0          // chuva e neve nao convivem: quem pediu por ultimo manda
      estacao = 'chuva'
    } else if (estacao === 'chuva') {
      estacao = 'sol'
    }
  }

  /** 0 = sem neve, 1 = nevasca. Mesmo contrato do setChuva. */
  function setNeve(v) {
    const n = typeof v === 'number' && isFinite(v) ? v : 0
    const f = Math.min(1, Math.max(0, n))
    alvoNeve = f
    if (f > 0.002) {
      intNeve = f
      alvoChuva = 0
      estacao = 'neve'
    } else if (estacao === 'neve') {
      estacao = 'sol'
    }
  }

  /** 'sol' | 'chuva' | 'neve'. Nome desconhecido nao faz nada (nao quebra). */
  function setEstacao(nome) {
    if (ESTACOES.indexOf(nome) < 0) return estacao
    estacao = nome
    // So mexe nos ALVOS: as rampas de chuva/neve levam ~2 s pra chegar la, e e
    // esse cruzamento (uma caindo enquanto a outra sobe) que faz a troca nao
    // piscar. Trocar o valor direto aqui apagaria a chuva num quadro.
    alvoChuva = nome === 'chuva' ? intChuva : 0
    alvoNeve = nome === 'neve' ? intNeve : 0
    return estacao
  }

  /** Cicla sol -> chuva -> neve -> sol. Devolve o nome novo (pro HUD mostrar). */
  function proximaEstacao() {
    const i = ESTACOES.indexOf(estacao)
    return setEstacao(ESTACOES[(i + 1) % ESTACOES.length])
  }

  function dispose() {
    restaurarAmbiente()
    if (grupo.parent) grupo.parent.remove(grupo)
    geoGotas.dispose()
    matGotas.dispose()
    geoResp.dispose()
    matResp.dispose()
    geoCoro.dispose()
    matCoro.dispose()
    geoFlocos.dispose()
    matFlocos.dispose()
    texResp.dispose()
    texPingo.dispose()
    texFloco.dispose()
    respingos.dispose()
    coroa.dispose()
  }

  return {
    grupo,
    atualizar,
    setChuva,
    setNeve,
    setEstacao,
    proximaEstacao,
    dispose,
    get estacao() { return estacao },
    get chuva() { return chuva },
    get neve() { return neve },
    /** 0..1 de neve JA acumulada no chao. Sobe em ~25 s de nevasca cheia e
     *  desce devagar quando para (mais rapido se comecar a chover em cima).
     *  E o valor que src/world/neve.js consome pra pintar e derreter. */
    get cobertura() { return cobertura },
  }
}
