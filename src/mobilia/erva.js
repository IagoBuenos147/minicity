import * as THREE from 'three'
import { solid } from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'
import { tecelagem, fio } from '../player/rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/mobilia/erva.js — o BROTO SECO, uma peca de mao.
//
// Feita a partir de uma foto de referencia que o dono mandou, e nao de memoria.
// O que a foto mostra, e que e o que esta modelado aqui:
//
//   1. O broto NAO e uma bola de musgo. Ele e uma pinha: dezenas de CALICES
//      (as capsulas em forma de gota) empacotados em espiral em volta de um
//      talo central, formando um cone gordo no meio e pontudo em cima.
//   2. Entre os calices saem FOLHINHAS pequenas e pontudas, mais claras e mais
//      amareladas que o resto — sao elas que quebram a silhueta e impedem o
//      broto de ler como um objeto liso.
//   3. Saindo de dentro dos calices, PISTILOS: fios finos, alaranjados, curvos,
//      apontando pra fora em todas as direcoes. Sao o unico detalhe da peca que
//      nao e verde, e por isso sao eles que dao o contraste.
//   4. Uma camada de GEADA (os tricomas): pontinhos claros, quase brancos, na
//      ponta de tudo. Na foto e o que faz o verde parecer coberto de acucar.
//   5. Um TALO seco saindo por baixo (e um toco por cima, torto), num marrom
//      palha. E o talo que a mao segura.
//
// POR QUE ESPIRAL DOURADA e nao aneis: calice empilhado em anel le como pinha
// de plastico — as fileiras aparecem. Com o angulo de ouro (137,5 graus) dois
// calices vizinhos nunca ficam alinhados com os de cima, que e exatamente o
// arranjo que a planta faz e o que faz o empacotamento parecer natural.
//
// ORCAMENTO: e peca de MAO, vista a vinte centimetros do olho — pode ter mais
// detalhe que um movel, mas nao pode ter mais MALHA. Tudo aqui e construido
// como um punhado de geometrias repetidas e passa pelo forno (bakeStatic) no
// fim: as ~55 gotas, as ~16 folhas e os ~70 pontos de geada viram UM mesh por
// material. Sao 7 malhas no total, contra o teto de 14 que bebidas.js fixou.
//
// Escala real, em metros, EM PE APOIADA NA ORIGEM: y = 0 e a ponta de baixo do
// talo, o broto cresce pro +Y. Quem pendura na mao e quem poe na prateleira
// dependem disso.
// ---------------------------------------------------------------------------

// --- medidas ---------------------------------------------------------------
// SEGUNDA PASSADA, depois de olhar a primeira do lado da foto: o broto tinha
// saido REDONDO e liso, lendo como brocolis. Tres numeros mudaram e sao eles
// que fazem a diferenca:
//   - mais ALTO e mais ESTREITO (7 x 3 cm em vez de 5,8 x 3,5): broto e cone,
//     nao bola;
//   - MUITO mais calice, cada um MENOR (90 de 1,1 cm contra 56 de 2 cm): e a
//     quantidade de gotas pequenas que da o empacotamento apertado da foto —
//     gota grande de menos empilha como amora;
//   - o dobro de pistilo e o dobro de geada, que sao os dois detalhes que a
//     foto tem em abundancia e a primeira versao mal insinuava.
const TALO_BAIXO = 0.020      // o pedaco que a mao segura
const ALTURA = 0.070          // altura do broto em si
const RAIO = 0.0150           // meia-largura no ponto mais gordo
const N_CALICE = 92
const N_FOLHA = 20
const N_PISTILO = 88
const N_GEADA = 150
const OURO = 2.39996323       // angulo de ouro, em radianos

// --- materiais --------------------------------------------------------------
// Verde de planta e MATE. Rugosidade abaixo de 0.6 poe um brilho de plastico na
// gota e a peca inteira vira balinha de goma. A unica coisa lisa e a geada, que
// e justamente o que brilha na foto.
// TERCEIRA PASSADA na cor: os tons subiram ~15% de luminosidade. A faixa
// oliva estava certa de FORMA e escura de LEITURA — no card do mercado, que
// tem fundo escuro, o broto quase desaparecia, e o dono pediu justamente que
// ele fosse "bem verdinha e ter destaque". Continua puxado pra oliva (verde
// puro le como plastico), so que claro o bastante pra existir contra fundo
// escuro e contra a mao.
//
// A COR SAIU DA FOTO, e nao da ideia de "verde". O verde de um broto seco e
// puxado pra OLIVA e tem amarelo dentro; o verde puro e saturado da primeira
// versao lia como plastico de brinquedo. Sao quatro tons de proposito — a foto
// nao tem uma cor so, tem uma faixa, e e a variacao entre gotas vizinhas que
// faz o empacotamento parecer material vivo em vez de peca pintada.
const M = {
  get verde() { return solid(0x6b9445, 0.80, 0.0) },
  get verdeClaro() { return solid(0x8ab04d, 0.76, 0.0) },
  get verdeEscuro() { return solid(0x4c7136, 0.84, 0.0) },
  get verdeAmarelo() { return solid(0x9cb852, 0.74, 0.0) },
  get folha() { return solid(0x7ea34a, 0.78, 0.0) },
  get pistilo() { return solid(0xcf7a2c, 0.58, 0.0) },
  get pistiloEscuro() { return solid(0xa1571f, 0.62, 0.0) },
  get talo() { return solid(0x8a7548, 0.86, 0.0) },
  // GEADA: quase branca, esverdeada, e a unica com rugosidade baixa. E o
  // especular dela que faz o olho ler "coberto de tricoma" em vez de "pintado
  // de branco".
  get geada() { return solid(0xe6f0d8, 0.26, 0.06) },
}

/** Sorteio determinista: o mesmo broto toda vez que o item e montado. */
function rng(semente) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Meia-largura do broto na altura t (0 na base, 1 na ponta).
 *
 * A tabela e o desenho de lado da foto: sobe rapido nos primeiros 20%, fica
 * cheio ate a metade e afina numa ponta. O que NAO pode acontecer e a curva
 * fechar em zero na base — ali o broto encontra o talo, e uma ponta em baixo
 * daria um formato de limao em vez de cone.
 */
const PERFIL = [
  [0.00, 0.46], [0.09, 0.80], [0.20, 0.97], [0.33, 1.00],
  [0.48, 0.97], [0.62, 0.88], [0.74, 0.74], [0.85, 0.54],
  [0.94, 0.30], [1.00, 0.06],
]

/**
 * OS GOMOS. Um broto nao e um cone liso: ele e feito de CACHOS, e o vao entre
 * um cacho e outro e o que mais denuncia planta de verdade contra bola de
 * plastico. Aqui isso e uma modulacao de raio de baixa frequencia em (azimute,
 * altura) — tres lobos que sobem em espiral junto com os calices.
 */
function gomoEm(t, az) {
  return 1 + 0.17 * Math.sin(az * 3 + t * 5.2) + 0.07 * Math.sin(az * 5 - t * 3.1)
}
function larguraEm(t) {
  if (t <= 0) return PERFIL[0][1]
  for (let i = 1; i < PERFIL.length; i++) {
    if (t <= PERFIL[i][0]) {
      const a = PERFIL[i - 1], b = PERFIL[i]
      const k = (t - a[0]) / (b[0] - a[0])
      return a[1] + (b[1] - a[1]) * k
    }
  }
  return PERFIL[PERFIL.length - 1][1]
}

/**
 * A GOTA de um calice: lathe de um perfil de capsula — barriga baixa, ombro
 * marcado e ponta fina. Uma esfera achatada no lugar disto le como bolinha, e
 * bolinha empacotada vira amora, nao broto.
 */
function geoCalice() {
  const pts = []
  // A BARRIGA DESCEU e a PONTA ESTICOU. Com o ombro no meio (0.34) a gota lia
  // como conta de colar; o calice de verdade e uma lagrima — cheio embaixo,
  // afinando por dois tercos ate uma ponta. E o bico de cada gota que da o
  // aspecto denteado do broto inteiro.
  const perfil = [
    [0.00, 0.00], [0.36, 0.05], [0.54, 0.14], [0.58, 0.26],
    [0.50, 0.46], [0.36, 0.66], [0.20, 0.82], [0.08, 0.93], [0.00, 1.00],
  ]
  for (const [r, y] of perfil) pts.push(new THREE.Vector2(Math.max(0.0001, r), y))
  const g = new THREE.LatheGeometry(pts, 7)
  g.scale(0.92, 1.18, 0.80)          // um tico achatado: calice nao e de revolucao
  return g
}

/**
 * FOLHINHA DE ACUCAR: lamina pontuda com tres dentes de cada lado, extrudada
 * fina. Os dentes sao o que faz ler como folha; uma lamina lisa vira petala.
 */
function geoFolha() {
  const s = new THREE.Shape()
  s.moveTo(0, 0)
  const dentes = [
    [0.16, 0.16], [0.10, 0.30], [0.22, 0.44], [0.12, 0.58],
    [0.18, 0.72], [0.07, 0.86], [0.00, 1.00],
  ]
  for (const [x, y] of dentes) s.lineTo(x, y)
  for (let i = dentes.length - 2; i >= 0; i--) s.lineTo(-dentes[i][0], dentes[i][1])
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false })
  g.translate(0, 0, -0.025)
  return g
}

/**
 * O BROTO INTEIRO. Devolve um Group com a base em y = 0.
 *
 * A ordem importa: talo primeiro (pra as gotas terem onde encostar), calices
 * depois, e folha/pistilo/geada por ultimo, plantados nas MESMAS posicoes que
 * as gotas ocuparam — e por isso que a folha nasce ENTRE os calices e o pistilo
 * sai DE DENTRO de um, em vez de os tres flutuarem cada um por conta.
 */
export function brotoDeErva() {
  const g = new THREE.Group()
  const rnd = rng(20260830)
  const base = TALO_BAIXO

  // --- talo -----------------------------------------------------------------
  // Ele atravessa o broto inteiro: o pedaco de baixo e a pega da mao, e o toco
  // de cima e o que aparece saindo torto na foto.
  const talo = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0028, 0.0038, base + ALTURA * 0.55, 6), M.talo)
  talo.position.y = (base + ALTURA * 0.55) / 2
  talo.castShadow = true
  g.add(talo)

  // O TALO DE CIMA E UM TRACO, e nao um detalhe escondido: na foto ele sai
  // torto por cima do broto e e a primeira coisa que se ve depois do verde.
  // Curto demais ele some entre os calices — que foi o que aconteceu na
  // primeira versao.
  const toco = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0013, 0.0024, 0.040, 5), M.talo)
  toco.position.set(0.006, base + ALTURA * 1.00, -0.003)
  toco.rotation.z = -0.46
  toco.rotation.x = 0.20
  toco.castShadow = true
  g.add(toco)

  // --- calices --------------------------------------------------------------
  // Guardamos onde cada gota ficou pra plantar folha, pistilo e geada em cima
  // delas depois.
  const gotas = []
  const geoG = geoCalice()
  const _eixo = new THREE.Vector3()
  for (let i = 0; i < N_CALICE; i++) {
    // t com um empurraozinho pra baixo (potencia 0.85): a base do broto e mais
    // densa que a ponta, como na foto
    const t = Math.pow((i + 0.5) / N_CALICE, 0.85)
    const az = i * OURO + rnd() * 0.25
    const larg = larguraEm(t) * gomoEm(t, az)
    // o calice nasce ENCOSTADO no talo e aponta pra fora e pra cima: e o angulo
    // dele, e nao a posicao, que faz o empacotamento parecer apertado
    const rr = RAIO * larg * (0.44 + 0.34 * rnd())
    const y = base + t * ALTURA
    // quatro tons sorteados, e nao um por i % n: com a regra ritmica os tons
    // saem em faixas espiraladas e a peca ganha um padrao que planta nao tem
    const sorte = rnd()
    const mat = sorte > 0.82 ? M.verdeClaro
      : sorte > 0.68 ? M.verdeAmarelo
        : sorte > 0.30 ? M.verde : M.verdeEscuro
    const m = new THREE.Mesh(geoG, mat)
    m.position.set(Math.cos(az) * rr, y, Math.sin(az) * rr)
    // aponta pra fora, inclinado pra cima — quanto mais alto no broto, mais
    // vertical, que e como a pinha fecha na ponta
    const subida = 0.55 + 0.9 * t
    _eixo.set(Math.cos(az), subida, Math.sin(az)).normalize()
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _eixo)
    // GOTA PEQUENA. 1,1 cm no ponto mais gordo contra os 2,6 cm da primeira
    // versao: e o tamanho relativo da gota que decide se a silhueta le como
    // pinha apertada ou como cacho de bolinhas.
    const esc = (0.0090 + 0.0052 * larg) * (0.84 + 0.34 * rnd())
    m.scale.setScalar(esc)
    m.castShadow = true
    g.add(m)
    gotas.push({ az, y, t, rr, esc, dir: _eixo.clone() })
  }

  // --- folhinhas ------------------------------------------------------------
  const geoF = geoFolha()
  for (let i = 0; i < N_FOLHA; i++) {
    const d = gotas[Math.floor(rnd() * gotas.length)]
    const f = new THREE.Mesh(geoF, M.folha)
    // menor e mais comprida que na primeira versao: folha larga saia como
    // espeto verde e roubava a silhueta do broto
    const comp = 0.0085 + 0.0075 * rnd()
    f.scale.set(comp, comp * (2.0 + 0.9 * rnd()), comp)
    f.position.set(
      Math.cos(d.az) * (d.rr + 0.001), d.y, Math.sin(d.az) * (d.rr + 0.001))
    // a folha sai mais deitada que o calice: e ela que passa POR FORA do
    // empacotamento e quebra a silhueta
    _eixo.set(Math.cos(d.az), 0.35 + 0.8 * d.t + 0.4 * rnd(), Math.sin(d.az)).normalize()
    f.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _eixo)
    f.rotateY(rnd() * Math.PI)
    f.castShadow = true
    g.add(f)
  }

  // --- pistilos -------------------------------------------------------------
  // Um unico tecelagem() pros 46: sao 46 tubos de 5 aneis, e cada um como mesh
  // proprio seria 46 draw calls numa peca de 7.
  // DOIS tecelagens: um por tom de pistilo. Na foto os fios nao sao de uma cor
  // so — os novos sao laranja claro e os velhos ja escureceram pra ferrugem, e
  // e essa mistura que da profundidade ao emaranhado.
  const ma = tecelagem()
  const maEsc = tecelagem()
  const p = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const eixoCurva = new THREE.Vector3()
  for (let i = 0; i < N_PISTILO; i++) {
    const d = gotas[Math.floor(rnd() * gotas.length)]
    // nasce na PONTA da gota, que e de onde o pistilo sai de verdade
    p.set(Math.cos(d.az) * d.rr, d.y, Math.sin(d.az) * d.rr)
      .addScaledVector(d.dir, d.esc * 0.75)
    dir.copy(d.dir)
    dir.x += (rnd() - 0.5) * 0.7
    dir.z += (rnd() - 0.5) * 0.7
    dir.y += (rnd() - 0.3) * 0.5
    dir.normalize()
    // eixo da curva perpendicular ao fio: sem isso o pistilo sai reto como
    // espinho, e pistilo de verdade e sempre torto
    eixoCurva.set(-dir.z, 0, dir.x).normalize()
    fio(rnd() > 0.62 ? maEsc : ma, p, dir, 0.0058 + 0.0065 * rnd(), 0.00074,
      eixoCurva, (rnd() - 0.5) * 3.8, 5, 3)
  }
  if (!ma.vazia) {
    const pistilos = new THREE.Mesh(ma.geo(), M.pistilo)
    pistilos.castShadow = false
    g.add(pistilos)
  }
  if (!maEsc.vazia) {
    const pistilos2 = new THREE.Mesh(maEsc.geo(), M.pistiloEscuro)
    pistilos2.castShadow = false
    g.add(pistilos2)
  }

  // --- geada (tricomas) -----------------------------------------------------
  // Pontinhos de 0,7 mm nas pontas das gotas. Sao 72 esferas de 4 lados: o que
  // se ve nao e a forma de cada uma, e o BRILHO delas na ponta do verde.
  const geoGeada = new THREE.SphereGeometry(0.00095, 4, 3)
  for (let i = 0; i < N_GEADA; i++) {
    const d = gotas[Math.floor(rnd() * gotas.length)]
    const gg = new THREE.Mesh(geoGeada, M.geada)
    gg.position.set(Math.cos(d.az) * d.rr, d.y, Math.sin(d.az) * d.rr)
      .addScaledVector(d.dir, d.esc * (0.45 + 0.5 * rnd()))
    gg.position.x += (rnd() - 0.5) * 0.004
    gg.position.z += (rnd() - 0.5) * 0.004
    gg.castShadow = false
    g.add(gg)
  }

  // FORNO: as ~150 pecas viram uma malha por material. O broto e a unica peca
  // do jogo com esse tanto de repeticao numa coisa de 8 cm — sem o forno seriam
  // 150 draw calls na mao do jogador.
  bakeStatic(g)
  return g
}

// ---------------------------------------------------------------------------
// CATALOGO
//
// Mesmo contrato de bebidas.js: `preco` em ouro, `empilha` por vaga do
// inventario, `naCasa: false` (vai pro bolso e pra mao, nunca pro chao como
// movel) e o bloco `mao` do contrato de src/player/mao.js.
// ---------------------------------------------------------------------------
export const ERVAS = [
  {
    id: 'erva-broto', nome: 'Broto seco', cat: 'erva',
    qualidade: 'fina', preco: 85, empilha: 10, naCasa: false,
    desc: 'Broto seco e denso, verde vivo, com os fios alaranjados a mostra e '
      + 'a ponta coberta de geada.',
    // A MAO PEGA NO TALO, e nao no broto.
    //
    // Pegar no corpo poria o punho fechado em volta de 3,5 cm de calice e a
    // mao esconderia justamente o que se quer ver — o mesmo erro que a lata de
    // cerveja ja tinha cometido. Segurando o talo (2,8 mm de raio) o broto
    // inteiro fica ACIMA do punho, a vista, que e como se segura de verdade.
    mao: { pegaY: 0.011, pegaR: 0.0042 },
    // O CARD DO MERCADO enquadra rente: o broto tem 9 cm e, com a folga
    // padrao, sobrava moldura vazia em volta e ele lia como item pequeno numa
    // vitrine de garrafas de 30 cm.
    foto: { folga: 1.06 },
    build: () => brotoDeErva(),
  },
]

/** A aba do mercado. Espelha o formato de CATEGORIAS_BEBIDAS. */
export const CATEGORIAS_ERVA = [
  { id: 'erva', label: 'ERVA' },
]

export default ERVAS
