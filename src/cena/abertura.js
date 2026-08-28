import * as THREE from 'three'
import { createCharacter, HIPS_Y } from '../player/character.js'
import * as Ap from '../player/appearance.js'
import { CAMPOS_APARENCIA } from '../comum/protocolo.js'
import { POSES } from '../npc/npc.js'
import { PLAYER } from '../config.js'
import { filaDaCasa, CASA as LOTE } from '../world/layout.js'
import {
  solid, glass, box, cyl, sphere, plane, roundedBox,
  concreteTex, brickTex, woodTex,
} from '../world/materials.js'

// ---------------------------------------------------------------------------
// CENA DE ABERTURA — o porao e a decisao.
//
// Duas partes, uma cutscene so:
//   1. o porao dos jogadores (cena PROPRIA, montada aqui) — o anfitriao propoe
//      ideias de negocio e leva "NAOOO" na cara ate a ideia do cassino;
//   2. a rua, ja na cena do JOGO, em primeira pessoa, encarando a casa velha.
//
// Tres decisoes que valem mais que a beleza do codigo:
//
// 1. O ROTEIRO E UMA LISTA DE PASSOS COM DURACAO, nao um punhado de setTimeout.
//    Com o tempo todo num array so, pular() e reiniciar sao uma linha cada, e
//    da pra ler a cadencia da cena inteira olhando pra uma tabela. setTimeout
//    espalhado sobrevive ao dispose() e dispara falas depois que a cena morreu.
//
// 2. NADA DE Math.random NO ROTEIRO NEM NAS POSES. Todo mundo tem que ver a
//    MESMA cutscene: mesma fala, mesmo tranco de camera, mesma bagunca no
//    chao, mesmo chiado na TV. A variacao vem toda de mulberry32 com semente
//    fixa (o mesmo PRNG do city.js) e, no caso da TV, de um numero de QUADRO
//    derivado do tempo — nao do frame rate da maquina.
//
// 3. O PORAO E MEU E MORRE COMIGO. Cena, geometrias, texturas de canvas,
//    materiais locais e os personagens sao criados em iniciar() e liberados em
//    dispose(). Manter isso vivo depois da abertura e carregar um porao inteiro
//    na VRAM pelo resto da partida, por nada.
//    O que vem do cache GLOBAL de world/materials.js (solid, glass, brickTex,
//    concreteTex, woodTex) NUNCA entra no dispose: aquela textura de concreto
//    tambem esta na calcada da cidade, e apagar ela aqui apaga la.
// ---------------------------------------------------------------------------

// --- PRNG com semente fixa (copia do city.js) -------------------------------
// A bagunca do cenario e sorteada, mas sorteada IGUAL em toda maquina.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Gerador de estado unico pro chiado da TV. E funcao de modulo com semente
// mutavel, e nao um mulberry32() novo por quadro de TV, porque ele e chamado
// de dentro do laco de atualizacao: criar a closure ali seria alocar em tempo
// de jogo pra economizar nada.
let _sem = 0
function _rnd() {
  _sem |= 0; _sem = (_sem + 0x6D2B79F5) | 0
  let t = Math.imul(_sem ^ (_sem >>> 15), 1 | _sem)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Geometria do porao. Tudo em metros, chao em y=0, o sofa olhando pra +Z.
// A camera mora do lado da TV e vai andando pro grupo, entao "fundo do quadro"
// e -Z: e la que ficam a parede das costas do sofa e a escada.
// ---------------------------------------------------------------------------
// A sala e funda (6,6 m) por causa do ENQUADRAMENTO, nao por gosto: a camera
// abre ATRAS da TV, e pra TV caber no quadro junto com o sofa ela precisa
// estar bem longe do grupo. Com um porao de 5 m a camera ficava colada na TV,
// que entao saia 90 graus fora do eixo de visao — construir uma TV com chiado
// animado que nunca aparece na tela.
const SALA = { x0: -3.10, x1: 3.10, z0: -2.70, z1: 3.95, teto: 2.30 }

// Sofa: o assento vai de z=-2.05 a -1.35 porque a perna sentada joga o pe
// ~0.42 m a frente do quadril — com a frente do sofa mais avancada que isso o
// jogador aparece com o pe DENTRO do proprio sofa.
const SOFA = {
  z0: -2.27, z1: -1.35,     // encosto (z0) ate a frente do assento (z1)
  // 2,34 m de assento pra QUATRO lugares de 0,585 m.
  //
  // O que mudou aqui foi o NUMERO DE ALMOFADAS, nao a largura. Eram tres, e o
  // quarto jogador sentava no BRACO, de pernas penduradas pra fora — sempre o
  // ultimo da lista, sempre torto, sempre fora do grupo na foto. O dono do
  // projeto pediu "4 lugares, 1 para cada jogador, um do lado do outro".
  //
  // Cabe? Cabe. O ponto mais largo de quem esta SENTADO e o cotovelo, a 0,444 m
  // de ponta a ponta (2 x (SHOULDER_X 0.124 + a abertura de 0.14 rad do ombro
  // na pose sit + o raio 0.059 da manga mais grossa do catalogo). Com 0,585 m
  // por lugar sobram 14 cm entre um vizinho e outro, que e a distancia certa
  // pra quatro amigos amontoados num sofa de sala.
  //
  // NAO ALARGAR. Ja foi tentado (2,68 m) e a conta pareceu melhor ate a foto:
  // a quarta almofada passou a terminar em x = 1,325 e o segundo degrau da
  // escada (montarEscada, x 1.1875..1.4425, topo em y 0.3925) atravessava o
  // assento, saindo 6,5 mm ACIMA da almofada — uma tabua de madeira nascendo
  // do canto do quarto lugar. A escada nao tem pra onde ir: ela sobe em x e o
  // ultimo degrau ja para a 12 cm da parede. Com 1,17 o degrau de baixo fica
  // inteiro DENTRO da caixa do sofa e o de cima inteiro dentro do braco, os
  // dois invisiveis.
  xi: -1.17, xf: 1.17,
  bracoW: 0.16,
  assento: 0.41,            // topo da almofada afundada
  bracoY: 0.60,             // topo do braco
  encosto: 1.02,
  lugares: 4,
}

// Altura do quadril na pose 'sit' vem do PERSONAGEM, nunca escrita na mao: o
// barbeiro e o cassino ja apanharam disso quando as proporcoes do esqueleto
// mudaram e todo NPC sentado ficou flutuando meio palmo acima da cadeira.
const SIT_HIP = HIPS_Y + (POSES.sit ? POSES.sit.rootY : 0)

/** Altura do root do personagem pra ele pousar num assento de topo `topo`. */
function alturaSentado(topo) {
  // mesma conta do cassino: a coxa pousa no assento, nao o quadril
  return topo + 0.052 - (SIT_HIP - 0.011)
}

const MESA = { x: 0.05, z: -0.45, w: 1.42, d: 0.66, topo: 0.42, tampo: 0.045 }
const TV = { x: 0.0, z: 2.06, telaY: 0.94, telaW: 1.06, telaH: 0.62 }

// Camera da parte 1: comeca larga, ao lado da TV (a TV entra no canto do
// quadro como silhueta preta com a luz vazando) e vai fechando no grupo.
// Abre ATRAS e ACIMA da TV: ela entra no quadro como uma caixa preta em
// primeiro plano, com a luz dela escapando pelas bordas e batendo no grupo la
// no fundo. Depois a camera desce e passa por ela ate fechar no sofa.
const CAM_INI = { x: 1.32, y: 2.06, z: 3.58 }
const CAM_FIM = { x: 0.42, y: 1.42, z: 1.26 }
// O alvo termina no CENTRO do sofa. Ele ja esteve deslocado 16 cm pra direita,
// de quando o quarto jogador sentava no braco e saia do quadro no plano mais
// fechado; com os quatro nas almofadas o grupo voltou a ser simetrico.
const CAM_ALVO_INI = { x: 0.02, y: 1.00, z: -1.62 }
const CAM_ALVO_FIM = { x: 0.02, y: 1.06, z: -1.66 }

// A CAMERA DO LEVANTAR.
//
// No plano fechado do fim da cena cabem 2,0 m de largura e 2,3 m de altura na
// distancia do sofa — de sobra pra quatro pessoas SENTADAS. Em pe elas ganham
// meio metro de altura e andam 64 cm pra frente (ver o zPe do ator), e com a
// camera parada o quadro cortaria todo mundo na altura do peito bem no momento
// em que a cena precisa mostrar quatro pessoas inteiras comemorando.
//
// A camera recua o quanto PODE — e o quanto ela pode e pouco: a MOLDURA DA TV
// comeca em z = 2.05, e passar disso poe o gabinete entre a lente e o grupo.
// (Aconteceu: com a camera em z = 2.86 a quina da TV entrava pelo canto de
// baixo do quadro.) Entao ela para em 1.90 e o resto do espaco vem da LENTE:
// o fov abre de 42 pra 48 graus durante a subida.
//
// A 2,96 m do grupo, 48 graus dao 1,32 m de meia-altura: com o alvo em y=1.18
// o quadro vai de -0,14 a 2,50. O personagem tem 1,845 m e a mao levantada
// chega a ~2,4 m — cabem os quatro, dos pes a ponta dos dedos, e ainda sobra
// chao embaixo. Na largura sobra ainda mais: 2,35 m de meia-largura em 16:9
// (1,76 num monitor 4:3) contra 1,18 m de meia-fila.
const CAM_PE = { x: 0.26, y: 1.62, z: 1.90 }
const CAM_ALVO_PE = { x: 0.02, y: 1.18, z: -1.20 }
const FOV_PORAO = 42
const FOV_PE = 48

// Onde a camera para na parte 2 quando main.js nao manda a casa. Nao e pra
// valer: e so pra cutscene nao apontar pro nada se alguem chamar sem 'casa'.
const CASA_PADRAO = { x: 0, y: 0.16, z: -16, olharX: 0, olharY: 3.0, olharZ: -24 }

// ---------------------------------------------------------------------------
// Aparencia: a rede manda INDICE, o personagem quer COR.
//
// Isto e a mesma traducao de src/rede/avatares.js (paraAparencia). Nao da pra
// importar de la: aquele modulo exporta a fabrica de avatares, nao o conversor.
// Mas as duas TEM que resolver a pele pela MESMA tabela — duas listas de tom
// que divergem fazem o mesmo indice desenhar peles diferentes na cutscene e no
// jogo, e o jogador jura que "mudou de cor no meio da abertura".
// ---------------------------------------------------------------------------
const TONS_PELE = Array.isArray(Ap.SKIN_TONES) && Ap.SKIN_TONES.length
  ? Ap.SKIN_TONES
  : [Ap.SKIN_DEFAULT, 0xf6d7c0, 0xe8b48c, 0xc98d5c, 0x9a6238, 0x6b421f]

function corDaPele(i) {
  const n = i | 0
  // acima de um byte so pode ser cor ja pronta (o preview local manda hex)
  if (n > 255) return n
  const t = TONS_PELE[((n % TONS_PELE.length) + TONS_PELE.length) % TONS_PELE.length]
  return (t && typeof t === 'object') ? (t.hex | 0) : (t | 0)
}

const APELIDOS_ANTIGOS = {
  cabelo: 'hair', olhos: 'eyes', sobrancelha: 'brows', boca: 'mouth',
  corCabelo: 'hairColor',
}

function paraAparencia(ap) {
  const base = Ap.defaultAppearance()
  if (!ap) return base
  for (const k of CAMPOS_APARENCIA) {
    const v = ap[k] | 0
    base[k] = v
    const velho = APELIDOS_ANTIGOS[k]
    if (velho !== undefined) base[velho] = v
  }
  base.skin = corDaPele(ap.pele)
  return base
}

// ---------------------------------------------------------------------------
// Oficina: tudo que nasce aqui e MEU e some no dispose().
// ---------------------------------------------------------------------------
function novaOficina() {
  const proprios = []

  return {
    /** Material exclusivo da cutscene (o cache global de materials.js nao serve). */
    mat(params) {
      const m = new THREE.MeshStandardMaterial(params)
      proprios.push(m)
      return m
    },
    /**
     * Textura do cache GLOBAL de materials.js com outro repeat.
     *
     * clone() nao copia os pixels: os dois apontam pro mesmo canvas. O clone e
     * MEU (morre no dispose) e a original continua sendo do projeto — mexer no
     * repeat DELA reescalaria o concreto da calcada da cidade inteira, que e
     * exatamente o tipo de estrago que nao aparece nesta tela.
     */
    repetir(base, rx, ry) {
      const t = base.clone()
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(Math.max(0.2, rx), Math.max(0.2, ry))
      t.needsUpdate = true
      proprios.push(t)
      return t
    },
    /** CanvasTexture exclusiva da cutscene. */
    texCanvas(w, h, desenhar, rx, ry) {
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      desenhar(c.getContext('2d'), w, h)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
      if (rx || ry) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.repeat.set(rx || 1, ry || 1)
      }
      proprios.push(t)
      return t
    },
    soltar() {
      for (const p of proprios) if (p && p.dispose) p.dispose()
      proprios.length = 0
    },
  }
}

// ---------------------------------------------------------------------------
// Texturas de canvas do porao
// ---------------------------------------------------------------------------

/** Tecido gasto do sofa: trama grossa, encardido nas dobras. */
function texTecido(of) {
  return of.texCanvas(128, 128, (g, s) => {
    const rnd = mulberry32(7712)
    // Marrom CLARO de proposito. O sofa vive na sombra, encostado na parede do
    // fundo, e com um tecido escuro ele simplesmente sumia: os quatro pareciam
    // sentados no ar. A cor "gasta" vem das manchas, nao da base.
    g.fillStyle = '#8a7160'; g.fillRect(0, 0, s, s)
    // trama: fios claros nos dois sentidos, densidade alta pra ler de perto
    for (let i = 0; i < s; i += 2) {
      g.strokeStyle = 'rgba(255,238,214,' + (0.05 + rnd() * 0.07) + ')'
      g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke()
      g.strokeStyle = 'rgba(20,12,8,' + (0.05 + rnd() * 0.08) + ')'
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke()
    }
    // encardido: manchas escuras onde a mao e o suor passam ha anos
    for (let i = 0; i < 22; i++) {
      const x = rnd() * s, y = rnd() * s, r = 6 + rnd() * 26
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, 'rgba(28,18,12,' + (0.16 + rnd() * 0.22) + ')')
      grd.addColorStop(1, 'rgba(28,18,12,0)')
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
  }, 3, 3)
}

/** Mancha do piso: uma so textura, reusada girada e em escalas diferentes. */
function texMancha(of) {
  return of.texCanvas(64, 64, (g, s) => {
    const rnd = mulberry32(31337)
    g.clearRect(0, 0, s, s)
    const grd = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2)
    grd.addColorStop(0, 'rgba(24,18,12,0.55)')
    grd.addColorStop(0.6, 'rgba(30,24,16,0.28)')
    grd.addColorStop(1, 'rgba(30,24,16,0)')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    // borda irregular: mancha redonda demais parece decalque de adesivo
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 7, r = 12 + rnd() * 16
      g.fillStyle = 'rgba(26,20,14,' + (0.10 + rnd() * 0.18) + ')'
      g.beginPath()
      g.arc(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 4 + rnd() * 9, 0, 7)
      g.fill()
    }
  })
}

/**
 * Rotulo cilindrico. Desenhado deitado porque o UV do CylinderGeometry corre a
 * largura do canvas em volta da lata: o que for escrito na horizontal aqui da a
 * volta na peca, e o que estiver na vertical fica em pe nela.
 */
function texRotulo(of, tipo) {
  return of.texCanvas(128, 128, (g, s) => {
    if (tipo === 'energetico') {
      g.fillStyle = '#1b2340'; g.fillRect(0, 0, s, s)
      g.fillStyle = '#c9a227'; g.fillRect(0, s * 0.30, s, s * 0.40)
      g.fillStyle = '#1b2340'
      g.font = 'bold 30px "Trebuchet MS", sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('TURBO', s / 2, s * 0.50)
      g.fillStyle = '#8ea0ff'
      g.fillRect(0, s * 0.74, s, 3)
      g.fillRect(0, s * 0.22, s, 3)
    } else if (tipo === 'cerveja') {
      g.fillStyle = '#2f6b3a'; g.fillRect(0, 0, s, s)
      g.fillStyle = '#e9e2c8'; g.fillRect(0, s * 0.34, s, s * 0.30)
      g.fillStyle = '#8e1f24'
      g.font = 'bold 26px "Trebuchet MS", sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('BRAHMOSA', s / 2, s * 0.49)
      g.fillStyle = '#c9a227'
      g.fillRect(0, s * 0.68, s, 4)
    } else {
      // whisky: rotulo creme com selo, o unico que precisa parecer caro
      g.fillStyle = '#e7dcc0'; g.fillRect(0, 0, s, s)
      g.strokeStyle = '#6b4a1e'; g.lineWidth = 3
      g.strokeRect(6, 6, s - 12, s - 12)
      g.fillStyle = '#2a1a0c'
      g.font = 'bold 21px "Trebuchet MS", sans-serif'
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.fillText('OLD', s / 2, s * 0.30)
      g.fillText('PORAO', s / 2, s * 0.47)
      g.font = '13px "Trebuchet MS", sans-serif'
      g.fillText('12 ANOS', s / 2, s * 0.66)
      g.fillStyle = '#8e1f24'
      g.beginPath(); g.arc(s / 2, s * 0.83, 11, 0, 7); g.fill()
    }
  })
}

/** Saco de salgadinho: papel metalizado berrante, o unico neon do chao. */
function texSalgado(of) {
  return of.texCanvas(64, 64, (g, s) => {
    g.fillStyle = '#d9541f'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#f2c31a'
    g.beginPath(); g.ellipse(s / 2, s / 2, s * 0.34, s * 0.22, 0, 0, 7); g.fill()
    g.fillStyle = '#5a1d07'
    g.font = 'bold 15px "Trebuchet MS", sans-serif'
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText('CROC', s / 2, s / 2)
  })
}

// ---------------------------------------------------------------------------
// A. A SALA — paredes de bloco, viga, cano, piso manchado, escada
// ---------------------------------------------------------------------------
function montarSala(g, of, rnd) {
  const S = SALA
  const w = S.x1 - S.x0, d = S.z1 - S.z0

  // Bloco de concreto sem reboco: e a brickTex do projeto com argamassa e
  // bloco cinzas. Fica cacheada por essas duas cores, entao nao e minha.
  const texBloco = brickTex(1, '#7e7b74', '#8e8b83')
  const matParedeLarga = of.mat({ map: of.repetir(texBloco, w / 2.0, S.teto / 1.4), color: 0x9a968d, roughness: 0.97 })
  const matParedeFunda = of.mat({ map: of.repetir(texBloco, d / 2.0, S.teto / 1.4), color: 0x8f8b83, roughness: 0.97 })

  // Piso de cimento queimado, escuro e sujo.
  // Cimento SUJO: a concreteTex do projeto e uma calcada limpa, e escurecer
  // pela cor e o unico jeito de usar a mesma textura sem gerar outra so pra ca.
  const matPiso = of.mat({ map: of.repetir(concreteTex(1), w * 0.55, d * 0.55), color: 0x55504a, roughness: 1.0 })
  const piso = plane(w, d, matPiso)
  piso.position.set((S.x0 + S.x1) / 2, 0, (S.z0 + S.z1) / 2)
  g.add(piso)

  // Manchas: uma textura, varias copias giradas. O olho le "piso sujo" pelo
  // contorno irregular, nao pela quantidade de pixels.
  const tMancha = texMancha(of)
  const matMancha = of.mat({
    map: tMancha, transparent: true, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2,
  })
  const geoMancha = new THREE.PlaneGeometry(1, 1)
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(geoMancha, matMancha)
    const e = 0.5 + rnd() * 1.5
    m.scale.set(e, e * (0.7 + rnd() * 0.6), 1)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = rnd() * 7
    m.position.set(S.x0 + 0.4 + rnd() * (w - 0.8), 0.004, S.z0 + 0.4 + rnd() * (d - 0.8))
    g.add(m)
  }

  // Teto: escuro, quase so um limite pra luz da lampada nao fugir.
  const teto = plane(w, d, of.mat({ color: 0x2a2622, roughness: 1 }), Math.PI / 2)
  teto.position.set((S.x0 + S.x1) / 2, S.teto, (S.z0 + S.z1) / 2)
  g.add(teto)

  // Paredes: planos virados pra dentro (nada de caixa, o interior nunca ve o
  // lado de fora e uma face por parede e metade dos triangulos).
  const fundo = new THREE.Mesh(new THREE.PlaneGeometry(w, S.teto), matParedeLarga)
  fundo.position.set((S.x0 + S.x1) / 2, S.teto / 2, S.z0)
  fundo.receiveShadow = true
  g.add(fundo)

  const frente = new THREE.Mesh(new THREE.PlaneGeometry(w, S.teto), matParedeLarga)
  frente.position.set((S.x0 + S.x1) / 2, S.teto / 2, S.z1)
  frente.rotation.y = Math.PI
  frente.receiveShadow = true
  g.add(frente)

  const esq = new THREE.Mesh(new THREE.PlaneGeometry(d, S.teto), matParedeFunda)
  esq.position.set(S.x0, S.teto / 2, (S.z0 + S.z1) / 2)
  esq.rotation.y = Math.PI / 2
  esq.receiveShadow = true
  g.add(esq)

  const dir = new THREE.Mesh(new THREE.PlaneGeometry(d, S.teto), matParedeFunda)
  dir.position.set(S.x1, S.teto / 2, (S.z0 + S.z1) / 2)
  dir.rotation.y = -Math.PI / 2
  dir.receiveShadow = true
  g.add(dir)

  // Viga aparente atravessando o teto: e ela que diz "isto e um porao, tem
  // casa em cima". Duas travessas mais finas apoiadas nela completam a leitura.
  const matViga = of.mat({ map: of.repetir(woodTex(1, '#4a3221'), 3, 1), color: 0x6b5136, roughness: 0.95 })
  const viga = box(w, 0.20, 0.16, matViga, (S.x0 + S.x1) / 2, S.teto - 0.10, -0.30)
  g.add(viga)
  for (let i = 0; i < 3; i++) {
    const t = box(0.10, 0.09, d * 0.9, matViga, S.x0 + w * (0.22 + i * 0.28), S.teto - 0.045, (S.z0 + S.z1) / 2)
    t.castShadow = false
    g.add(t)
  }

  // Cano: desce a parede do fundo e corre colado no teto. Ferro velho, com
  // duas bracadeiras e uma luva no meio.
  const matCano = solid(0x6d6a63, 0.55, 0.65)
  const matBraca = solid(0x3b3833, 0.7, 0.4)
  const canoH = cyl(0.045, 0.045, w - 0.3, matCano, 12)
  canoH.rotation.z = Math.PI / 2
  canoH.position.set((S.x0 + S.x1) / 2, S.teto - 0.22, S.z0 + 0.22)
  g.add(canoH)
  const canoV = cyl(0.045, 0.045, 1.45, matCano, 12)
  canoV.position.set(S.x0 + 0.30, S.teto - 0.22 - 0.72, S.z0 + 0.22)
  g.add(canoV)
  const luva = cyl(0.058, 0.058, 0.10, matCano, 12)
  luva.rotation.z = Math.PI / 2
  luva.position.set(0.55, S.teto - 0.22, S.z0 + 0.22)
  g.add(luva)
  for (let i = 0; i < 2; i++) {
    const b = box(0.05, 0.09, 0.13, matBraca, -1.6 + i * 2.4, S.teto - 0.22, S.z0 + 0.135)
    b.castShadow = false
    g.add(b)
  }

  // Interruptor e fiacao solta na parede: detalhe barato que enche o vazio.
  g.add(box(0.09, 0.13, 0.03, solid(0xd8d2c4, 0.85), S.x0 + 0.05, 1.28, -0.90))

  montarEscada(g, of)
}

/**
 * Escada estreita subindo no fundo, encostada na parede da direita.
 * Ela nao chega ao teto de proposito: os degraus somem dentro de um vao preto,
 * que e o que faz o porao parecer ter um andar de cima sem custar um andar de
 * cima.
 */
function montarEscada(g, of) {
  const S = SALA
  const matDeg = of.mat({ map: of.repetir(woodTex(1, '#6d5334'), 1, 1), color: 0x8a7250, roughness: 0.95 })
  const matLat = solid(0x4a4038, 0.95)
  const larg = 0.86
  const passo = 0.255
  const subida = 0.185
  const x0 = 1.06                       // pe da escada
  const zc = S.z0 + 0.52

  for (let i = 0; i < 8; i++) {
    const x = x0 + i * passo
    const y = subida * (i + 1)
    g.add(box(passo, 0.045, larg, matDeg, x, y, zc))
    // espelho do degrau (a tabua vertical): sem ele a escada vira prateleira
    g.add(box(0.035, subida, larg, matLat, x - passo / 2, y - subida / 2, zc))
  }
  // longarina do lado de dentro, inclinada junto com os degraus
  const comp = Math.hypot(passo * 8, subida * 8)
  const lon = box(comp, 0.13, 0.05, matLat, x0 + passo * 3.5, subida * 4.2, zc - larg / 2)
  lon.rotation.z = Math.atan2(subida * 8, passo * 8)
  g.add(lon)

  // Corrimao de cano na PAREDE (z do fundo), nao no lado aberto. No lado
  // aberto ele nao tem em que se apoiar e, iluminado de longe, lia como um
  // risco branco atravessando o teto — o olho procurava o defeito, nao a
  // escada. Fosco pelo mesmo motivo: cano cromado aqui vira o objeto mais
  // brilhante de um porao sem luz.
  const matCano = solid(0x565049, 0.9, 0.1)
  const cor = cyl(0.024, 0.024, comp + 0.2, matCano, 10)
  // O SINAL importa. O cilindro nasce no eixo +Y, e Rz(a) leva esse eixo pra
  // (-sen a, cos a): com +(PI/2 - inclinacao) o cano sobe pra ESQUERDA, ou
  // seja, na diagonal contraria a dos degraus — subindo do alto do ultimo
  // degrau ate o teto em cima do PRIMEIRO. E esse o "risco atravessando o
  // teto" do comentario acima, e trocar a cor nunca ia resolver. A longarina
  // e uma caixa (eixo +X) e por isso usa o angulo cru, sem o -PI/2.
  cor.rotation.z = Math.atan2(subida * 8, passo * 8) - Math.PI / 2
  cor.position.set(x0 + passo * 3.5, subida * 4.2 + 0.72, zc - larg / 2 + 0.10)
  g.add(cor)
  // dois suportes ligando o cano na parede: sem eles ele flutua
  for (let i = 0; i < 2; i++) {
    const x = x0 + passo * (2 + i * 4)
    const s = box(0.03, 0.03, 0.14, matCano, x, subida * (2.4 + i * 4) + 0.72, zc - larg / 2 + 0.03)
    s.castShadow = false
    g.add(s)
  }

  // Vao preto do alto: face virada pra dentro da sala, sem luz nenhuma.
  // O oitavo degrau termina EM CIMA da parede da direita (1.06 + 8*0.255 =
  // 3.10 = SALA.x1), entao a folga tem que ser pra DENTRO do porao (-0.02).
  // Com +0.02 o plano nasce 2 cm atras de uma parede opaca e o vao — a unica
  // coisa que diz que existe um andar de cima — nunca chega a ser desenhado.
  const vao = new THREE.Mesh(
    new THREE.PlaneGeometry(larg, 1.0),
    of.mat({ color: 0x000000, roughness: 1 }),
  )
  vao.position.set(x0 + passo * 8 - 0.02, subida * 8 + 0.5, zc)
  vao.rotation.y = -Math.PI / 2
  g.add(vao)
}

// ---------------------------------------------------------------------------
// B. O SOFA — 4 lugares, almofadas afundadas, um remendo no braco
// ---------------------------------------------------------------------------
function montarSofa(g, of) {
  const S = SOFA
  const matTec = of.mat({ map: texTecido(of), color: 0xc7ab8d, roughness: 0.98 })
  const matTecEsc = of.mat({ map: texTecido(of), color: 0x9a8168, roughness: 0.98 })
  const larg = S.xf - S.xi
  const prof = S.z1 - S.z0
  const zc = (S.z0 + S.z1) / 2

  // caixa de baixo (a estrutura), ja gasta e sem pe visivel
  g.add(box(larg + S.bracoW * 2, 0.30, prof, matTecEsc, 0, 0.15, zc))

  // Almofadas: cada uma AFUNDADA de um jeito. As do MEIO sao as mais mortas —
  // sao as que aguentaram mais gente — e por isso quem senta no meio senta mais
  // fundo. Quatro valores porque o sofa tem quatro lugares; um sofa em que
  // todas as almofadas afundam igual le como sofa novo.
  const afund = [0.050, 0.085, 0.078, 0.055]
  const n = S.lugares
  const meio = (n - 1) / 2
  for (let i = 0; i < n; i++) {
    const cx = lugarX(i)
    const alm = roundedBox(larg / n - 0.03, 0.19, prof - 0.30, 0.06, matTec)
    alm.scale.y = 1 - afund[i] * 3.2
    alm.position.set(cx, S.assento - 0.075 - afund[i] * 0.5, S.z0 + 0.30 + (prof - 0.30) / 2)
    alm.rotation.z = (i - meio) * 0.014
    g.add(alm)
  }

  // Encosto inclinado pra tras, com 3 almofadas verticais murchas. Rx POSITIVO
  // joga o topo pra +Z, e +Z aqui e a FRENTE do sofa (z1 > z0): com +0.10 o
  // encosto tombava por cima do assento, que e a cara de sofa quebrado, nao de
  // sofa fundo. O angulo negativo deita o topo contra a parede do fundo.
  const enc = box(larg + S.bracoW * 2, S.encosto - 0.20, 0.20, matTecEsc, 0, (S.encosto + 0.20) / 2, S.z0 + 0.10)
  enc.rotation.x = -0.10
  g.add(enc)
  for (let i = 0; i < n; i++) {
    const a = roundedBox(larg / n - 0.04, 0.44, 0.13, 0.05, matTec)
    a.position.set(lugarX(i), 0.70, S.z0 + 0.21)
    // as do meio deitam um pouco mais: sao as que mais gente amassou
    a.rotation.x = -(0.12 + (i === 1 || i === 2 ? 0.05 : 0))
    g.add(a)
  }

  // bracos
  for (const s of [-1, 1]) {
    const b = roundedBox(S.bracoW * 2, S.bracoY, prof, 0.07, matTecEsc)
    b.position.set(s * (S.xf + S.bracoW), S.bracoY / 2, zc)
    g.add(b)
  }

  // O REMENDO: um retalho de outra cor no braco esquerdo, com pontos de linha
  // em volta. A geometria do ponto e UMA so, reusada nas seis costuras — seis
  // BoxGeometry de 8 mm pra desenhar linha de costura seria desperdicio puro.
  const remendo = box(0.20, 0.012, 0.15, of.mat({ color: 0x7d3f34, roughness: 1 }),
    -(S.xf + S.bracoW), S.bracoY + 0.004, zc + 0.10)
  remendo.rotation.y = 0.09
  g.add(remendo)
  const geoPonto = new THREE.BoxGeometry(0.018, 0.006, 0.006)
  const matPonto = of.mat({ color: 0x2b1d18, roughness: 1 })
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(geoPonto, matPonto)
    const a = (i / 6) * Math.PI * 2
    p.position.set(
      -(S.xf + S.bracoW) + Math.cos(a) * 0.10,
      S.bracoY + 0.012,
      zc + 0.10 + Math.sin(a) * 0.075,
    )
    p.rotation.y = a
    g.add(p)
  }

  // rasgo no tecido do assento da ponta, com a espuma amarela aparecendo
  const rasgo = box(0.13, 0.02, 0.05, of.mat({ color: 0xd9c98a, roughness: 1 }),
    S.xf - 0.28, S.assento - 0.01, S.z1 - 0.18)
  rasgo.rotation.y = 0.4
  g.add(rasgo)
}

// ---------------------------------------------------------------------------
// C. A MESINHA — cinzeiro cheio, whisky pela metade, copos e latas
// ---------------------------------------------------------------------------
function montarMesa(g, of, rnd) {
  const M = MESA
  const matTampo = of.mat({ map: of.repetir(woodTex(1, '#5b3f24'), 2, 1), color: 0xc09468, roughness: 0.7 })
  const matPe = solid(0x3a2c1e, 0.9)

  g.add(box(M.w, M.tampo, M.d, matTampo, M.x, M.topo - M.tampo / 2, M.z))
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(box(0.06, M.topo - M.tampo, 0.06, matPe,
      M.x + sx * (M.w / 2 - 0.09), (M.topo - M.tampo) / 2, M.z + sz * (M.d / 2 - 0.09)))
  }
  // marca de copo: o anel que ninguem limpou
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(0.030, 0.038, 20),
    of.mat({ color: 0x3a2a16, transparent: true, opacity: 0.55, roughness: 1, side: THREE.DoubleSide }),
  )
  anel.rotation.x = -Math.PI / 2
  anel.position.set(M.x - 0.42, M.topo + 0.002, M.z + 0.16)
  g.add(anel)

  montarCinzeiro(g, of, rnd, M.x + 0.10, M.topo, M.z - 0.02)
  montarGarrafa(g, of, M.x - 0.46, M.topo, M.z - 0.10)

  // Copos: dois em pe, um deitado. O da direita tem resto de bebida — e ele
  // que pega a luz da TV e pisca junto com a tela.
  montarCopo(g, of, M.x - 0.26, M.topo, M.z + 0.16, 0.055)
  montarCopo(g, of, M.x - 0.60, M.topo, M.z + 0.14, 0)
  const caido = montarCopo(g, of, M.x + 0.50, M.topo + 0.033, M.z + 0.19, 0)
  caido.rotation.z = Math.PI / 2
  caido.rotation.y = 0.6

  // latas na mesa: uma de energetico em pe, uma de cerveja amassada deitada
  montarLata(g, of, 'energetico', M.x + 0.44, M.topo, M.z - 0.16, 0, false)
  montarLata(g, of, 'cerveja', M.x + 0.60, M.topo, M.z + 0.02, 1.1, true)
}

/** Cinzeiro de vidro fume, cheio ate a boca. */
function montarCinzeiro(g, of, rnd, x, y, z) {
  const matVidro = of.mat({
    color: 0x2a2622, roughness: 0.12, metalness: 0.0,
    transparent: true, opacity: 0.72,
  })
  const corpo = cyl(0.086, 0.074, 0.030, matVidro, 20)
  corpo.position.set(x, y + 0.015, z)
  g.add(corpo)
  // a "cuba": um disco escuro afundado 6 mm faz o buraco sem furar geometria
  const cuba = cyl(0.070, 0.062, 0.004, of.mat({ color: 0x15120f, roughness: 1 }), 20)
  cuba.position.set(x, y + 0.022, z)
  g.add(cuba)
  // dois entalhes de apoiar cigarro na borda
  for (const s of [-1, 1]) {
    const e = box(0.030, 0.008, 0.016, of.mat({ color: 0x1d1a16, roughness: 1 }), x + s * 0.078, y + 0.029, z)
    e.castShadow = false
    g.add(e)
  }

  // BITUCAS. Duas geometrias pro lote inteiro (papel e filtro): nove bitucas em
  // meshes proprios com geometria propria seriam 18 buffers de 12 triangulos.
  const geoPapel = new THREE.CylinderGeometry(0.0038, 0.0038, 0.016, 6)
  const geoFiltro = new THREE.CylinderGeometry(0.0040, 0.0040, 0.010, 6)
  const matPapel = of.mat({ color: 0xe6e0d2, roughness: 1 })
  const matFiltro = of.mat({ color: 0xc79a4e, roughness: 1 })
  const matQueim = of.mat({ color: 0x25201a, roughness: 1 })

  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2
    const r = rnd() * 0.050
    const bx = x + Math.cos(a) * r
    const bz = z + Math.sin(a) * r
    // duas ficam apoiadas na BORDA, as outras jogadas no fundo
    const naBorda = i >= 7
    const by = y + (naBorda ? 0.032 : 0.026)
    const giro = rnd() * Math.PI * 2

    const papel = new THREE.Mesh(geoPapel, matPapel)
    papel.rotation.set(Math.PI / 2, 0, giro)
    // amassada: a bituca esmagada perde a secao redonda
    papel.scale.set(1, 1, 0.55 + rnd() * 0.35)
    papel.position.set(bx, by, bz)
    g.add(papel)

    const ponta = new THREE.Mesh(geoPapel, matQueim)
    ponta.rotation.set(Math.PI / 2, 0, giro + (rnd() - 0.5) * 0.9)
    ponta.scale.set(0.9, 0.35, 0.6)
    ponta.position.set(bx + Math.cos(giro) * 0.013, by, bz + Math.sin(giro) * 0.013)
    g.add(ponta)

    const filtro = new THREE.Mesh(geoFiltro, matFiltro)
    filtro.rotation.set(Math.PI / 2, 0, giro)
    filtro.position.set(bx - Math.cos(giro) * 0.012, by, bz - Math.sin(giro) * 0.012)
    g.add(filtro)
  }

  // CINZA ESPALHADA: dentro do cinzeiro e transbordando na mesa. Um disco
  // cinza no fundo + pontinhos soltos no tampo.
  const cinza = cyl(0.062, 0.058, 0.006, of.mat({ color: 0x9a958c, roughness: 1 }), 18)
  cinza.position.set(x, y + 0.020, z)
  cinza.castShadow = false
  g.add(cinza)
  const geoPo = new THREE.CircleGeometry(0.010, 7)
  const matPo = of.mat({ color: 0x8f8a82, transparent: true, opacity: 0.55, roughness: 1 })
  for (let i = 0; i < 12; i++) {
    const p = new THREE.Mesh(geoPo, matPo)
    p.rotation.x = -Math.PI / 2
    const e = 0.35 + rnd() * 1.1
    p.scale.set(e, e, 1)
    p.position.set(x + (rnd() - 0.5) * 0.42, y + 0.0025, z + (rnd() - 0.5) * 0.30)
    g.add(p)
  }
}

/** Whisky pela metade: vidro ambar, liquido de verdade dentro e rotulo. */
function montarGarrafa(g, of, x, y, z) {
  const matVidro = of.mat({
    color: 0x4a2a10, roughness: 0.08, metalness: 0.0,
    transparent: true, opacity: 0.55,
  })
  const matLiq = of.mat({
    color: 0xc06a12, roughness: 0.15, transparent: true, opacity: 0.92,
  })
  const corpo = cyl(0.043, 0.045, 0.20, matVidro, 18)
  corpo.position.set(x, y + 0.10, z)
  g.add(corpo)
  const ombro = cyl(0.017, 0.043, 0.055, matVidro, 18)
  ombro.position.set(x, y + 0.2275, z)
  g.add(ombro)
  const gargalo = cyl(0.016, 0.016, 0.075, matVidro, 14)
  gargalo.position.set(x, y + 0.2925, z)
  g.add(gargalo)
  const tampa = cyl(0.019, 0.019, 0.026, solid(0x2a1b0d, 0.7), 14)
  tampa.position.set(x, y + 0.343, z)
  g.add(tampa)

  // PELA METADE: o liquido para na metade do corpo, e e ele que denuncia o
  // quanto de noite ja passou antes da primeira fala.
  const liq = cyl(0.040, 0.042, 0.098, matLiq, 18)
  liq.position.set(x, y + 0.050, z)
  liq.castShadow = false
  g.add(liq)

  // cyl() so aceita 5 argumentos (o 6o era ignorado em silencio): o rotulo e um
  // cilindro fechado mesmo, 2 mm mais largo que o vidro pra nao brigar com ele
  const rot = cyl(0.0455, 0.0462, 0.082, of.mat({ map: texRotulo(of, 'whisky'), roughness: 0.8 }), 20)
  rot.position.set(x, y + 0.098, z)
  g.add(rot)
}

/** Copo baixo. `resto` > 0 deixa bebida no fundo. */
function montarCopo(g, of, x, y, z, resto) {
  const grupo = new THREE.Group()
  const c = cyl(0.034, 0.030, 0.092, glass(0xdfe9ee, 0.24), 16)
  c.position.y = 0.046
  grupo.add(c)
  const fundo = cyl(0.030, 0.030, 0.012, glass(0xdfe9ee, 0.42), 16)
  fundo.position.y = 0.006
  grupo.add(fundo)
  if (resto > 0) {
    const l = cyl(0.029, 0.028, resto, of.mat({ color: 0xb2601a, roughness: 0.2, transparent: true, opacity: 0.9 }), 16)
    l.position.y = 0.012 + resto / 2
    l.castShadow = false
    grupo.add(l)
  }
  grupo.position.set(x, y, z)
  g.add(grupo)
  return grupo
}

/**
 * Lata. `amassada` deita a lata e afunda a lateral — e a diferenca entre
 * "bebida" e "bagunca", e o roteiro pede as duas na mesma mesa.
 */
function montarLata(g, of, tipo, x, y, z, giro, amassada) {
  const grupo = new THREE.Group()
  const matRot = of.mat({ map: texRotulo(of, tipo), roughness: 0.42, metalness: 0.35 })
  const matAl = solid(0xb9bdc2, 0.35, 0.85)

  const corpo = cyl(0.033, 0.033, 0.118, matRot, 18)
  corpo.position.y = 0.062
  grupo.add(corpo)
  const topo = cyl(0.029, 0.033, 0.014, matAl, 18)
  topo.position.y = 0.128
  grupo.add(topo)
  const base = cyl(0.030, 0.026, 0.010, matAl, 18)
  base.position.y = 0.005
  grupo.add(base)

  if (amassada) {
    // afunda a cintura e deita: a lata amassada nunca fica cilindrica nem em pe
    corpo.scale.set(1, 0.72, 0.68)
    corpo.position.y = 0.050
    topo.position.y = 0.098
    grupo.rotation.z = Math.PI / 2 + 0.12
    grupo.position.set(x, y + 0.033, z)
  } else {
    grupo.position.set(x, y, z)
  }
  grupo.rotation.y = giro
  g.add(grupo)
  return grupo
}

// ---------------------------------------------------------------------------
// D. A BAGUNCA — latas pelo chao, pizza, salgadinho, controle, roupa
// ---------------------------------------------------------------------------
function montarBagunca(g, of, rnd) {
  // Latas no chao. A area util e a faixa entre a mesa e a TV mais as laterais;
  // a rejeicao evita lata nascendo dentro do sofa ou da perna da mesa.
  let postas = 0
  for (let tent = 0; tent < 80 && postas < 11; tent++) {
    const x = -2.85 + rnd() * 5.7
    const z = -1.15 + rnd() * 3.0
    const naMesa = x > MESA.x - MESA.w / 2 - 0.12 && x < MESA.x + MESA.w / 2 + 0.12 &&
      z > MESA.z - MESA.d / 2 - 0.12 && z < MESA.z + MESA.d / 2 + 0.12
    const naTV = Math.abs(x) < 0.95 && z > 1.70
    if (naMesa || naTV) continue
    const tipo = rnd() > 0.45 ? 'cerveja' : 'energetico'
    // duas em cada tres estao deitadas: em pe demais parece prateleira
    montarLata(g, of, tipo, x, 0, z, rnd() * 6.28, rnd() > 0.34)
    postas++
  }

  // Caixa de pizza aberta, com uma fatia solitaria dentro.
  const matPap = of.mat({ color: 0xb59463, roughness: 1 })
  const cx = -1.95, cz = 0.55
  g.add(box(0.46, 0.045, 0.46, matPap, cx, 0.022, cz))
  const tampa = box(0.46, 0.030, 0.46, matPap, 0, 0, 0)
  tampa.position.set(cx, 0.26, cz - 0.20)
  tampa.rotation.x = -1.15
  g.add(tampa)
  const fatia = new THREE.Mesh(
    new THREE.CylinderGeometry(0.19, 0.19, 0.022, 12, 1, false, 0.4, 1.0),
    of.mat({ color: 0xc98f45, roughness: 1 }),
  )
  fatia.position.set(cx + 0.02, 0.056, cz + 0.02)
  fatia.rotation.y = 1.9
  g.add(fatia)
  // gordura no papelao: mancha escura sob a fatia
  const gord = new THREE.Mesh(new THREE.CircleGeometry(0.10, 12),
    of.mat({ color: 0x8a6a3a, transparent: true, opacity: 0.6, roughness: 1 }))
  gord.rotation.x = -Math.PI / 2
  gord.position.set(cx - 0.10, 0.046, cz - 0.06)
  g.add(gord)

  // Saco de salgadinho rasgado: o corpo amassado e duas abas abertas pra cima.
  const matSal = of.mat({ map: texSalgado(of), roughness: 0.35, metalness: 0.25 })
  const sx = 1.35, sz = -0.05
  const saco = box(0.17, 0.07, 0.24, matSal, sx, 0.035, sz)
  saco.rotation.y = 0.7
  g.add(saco)
  for (const s of [-1, 1]) {
    const aba = box(0.15, 0.004, 0.11, matSal, 0, 0, 0)
    aba.position.set(sx + s * 0.045 + 0.05, 0.10, sz + 0.14)
    aba.rotation.set(-1.0 * s, 0.7, s * 0.4)
    g.add(aba)
  }
  // salgadinho caido: 5 discos amarelos, geometria unica
  const geoChip = new THREE.CircleGeometry(0.016, 6)
  const matChip = of.mat({ color: 0xe0a92c, roughness: 1, side: THREE.DoubleSide })
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Mesh(geoChip, matChip)
    c.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.7, 0, rnd() * 6.28)
    c.position.set(sx + (rnd() - 0.5) * 0.5, 0.006, sz + 0.15 + rnd() * 0.35)
    g.add(c)
  }

  // Controle de video game largado no chao (o outro esta na mao de alguem).
  const ctrl = fazerControle(of)
  ctrl.position.set(-0.95, 0.022, 0.30)
  ctrl.rotation.set(0, 1.2, 0)
  g.add(ctrl)
  // fio: uma curva so, tubo de 8 lados. Poder desenhar cabo torto e metade da
  // sensacao de "ninguem arruma nada aqui".
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 0.05, 0.38),
    new THREE.Vector3(-0.70, 0.03, 0.72),
    new THREE.Vector3(-0.20, 0.03, 0.58),
    new THREE.Vector3(0.10, 0.03, 1.05),
    new THREE.Vector3(-0.05, 0.05, 1.68),
  ])
  const fio = new THREE.Mesh(
    new THREE.TubeGeometry(curva, 26, 0.008, 6, false),
    solid(0x1a1a1e, 0.8),
  )
  g.add(fio)

  // Cadeira de canto com a roupa jogada por cima.
  montarCadeiraComRoupa(g, of)
}

function fazerControle(of) {
  const grupo = new THREE.Group()
  const matC = of.mat({ color: 0x2b2f36, roughness: 0.55 })
  const corpo = roundedBox(0.145, 0.032, 0.088, 0.022, matC)
  corpo.position.y = 0.016
  grupo.add(corpo)
  for (const s of [-1, 1]) {
    const punho = roundedBox(0.045, 0.028, 0.070, 0.020, matC)
    punho.position.set(s * 0.078, 0.014, 0.020)
    punho.rotation.y = s * 0.22
    grupo.add(punho)
    const stick = cyl(0.011, 0.013, 0.014, solid(0x14161a, 0.6), 10)
    stick.position.set(s * 0.038, 0.038, 0.014)
    grupo.add(stick)
  }
  const geoBt = new THREE.CylinderGeometry(0.005, 0.005, 0.005, 8)
  const cores = [0xd63b3b, 0x3ba05a, 0x3b6fd6, 0xe8c33d]
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(geoBt, solid(cores[i], 0.5))
    const a = (i / 4) * Math.PI * 2
    b.position.set(0.062 + Math.cos(a) * 0.013, 0.034, -0.020 + Math.sin(a) * 0.013)
    grupo.add(b)
  }
  return grupo
}

function montarCadeiraComRoupa(g, of) {
  const matMad = of.mat({ map: of.repetir(woodTex(1, '#5a4128'), 1, 1), color: 0x7a5c3a, roughness: 0.9 })
  const x = -2.45, z = -1.15
  const grupo = new THREE.Group()
  grupo.position.set(x, 0, z)
  grupo.rotation.y = 0.9
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    grupo.add(box(0.045, 0.44, 0.045, matMad, sx * 0.17, 0.22, sz * 0.17))
  }
  grupo.add(box(0.40, 0.035, 0.40, matMad, 0, 0.455, 0))
  const enc = box(0.40, 0.44, 0.035, matMad, 0, 0.69, -0.18)
  enc.rotation.x = -0.10
  grupo.add(enc)

  // A roupa: pano jogado POR CIMA do encosto, caindo dos dois lados. Uma bola
  // achatada sozinha lia como um cogumelo azul pousado na cadeira; o que faz
  // ler como roupa e a aba que desce pela frente do encosto.
  const matRoupa = of.mat({ color: 0x6b4a52, roughness: 1 })
  const monte = sphere(0.19, matRoupa, 14)
  monte.scale.set(1.10, 0.34, 0.50)
  monte.position.set(0.02, 0.90, -0.17)
  monte.rotation.z = 0.2
  grupo.add(monte)
  const aba = box(0.36, 0.30, 0.03, matRoupa, 0.01, 0.76, -0.135)
  aba.rotation.x = -0.10
  grupo.add(aba)
  const manga = cyl(0.045, 0.038, 0.36, matRoupa, 10)
  manga.position.set(0.16, 0.66, -0.05)
  manga.rotation.set(0.25, 0, 0.18)
  grupo.add(manga)
  // uma segunda peca, escura, escorregando pro chao
  const caida = sphere(0.17, of.mat({ color: 0x2c2a30, roughness: 1 }), 12)
  caida.scale.set(1.2, 0.28, 0.9)
  caida.position.set(-0.22, 0.05, 0.24)
  grupo.add(caida)
  g.add(grupo)
}

// ---------------------------------------------------------------------------
// E. A TV — a unica luz forte, e ela pisca no rosto de todo mundo
//
// A tela e uma CanvasTexture redesenhada a 12 Hz. O que ela mostra e funcao do
// NUMERO DO QUADRO (tempo * 12, arredondado), nao do frame: assim o chiado e
// as barras aparecem no MESMO instante em toda maquina, com 30 ou 144 fps.
// A PointLight na frente copia a cor media e o brilho do que foi desenhado —
// e dai que sai a luz azulada tremendo na cara do grupo.
// ---------------------------------------------------------------------------
const TV_HZ = 12
const TV_W = 96
const TV_H = 72
// Quanto o "brilho" de um quadro de TV (1..6, ver desenharTV) vale em
// intensidade de luz. Fica separado do brilho pra dosar a cena inteira num
// numero so: o que a tela mostra e a forca com que ela ilumina sao coisas
// diferentes, e so uma delas precisa de ajuste quando o porao esta escuro.
const TV_GANHO = 3.6

// Rascunho do modulo pra cor do "programa" (ver desenharTV).
const _corPrograma = new THREE.Color()

function montarTV(g, of) {
  // Preto FOSCO. O gabinete ocupa o canto inferior do quadro de abertura, a um
  // metro e meio da lente: com qualquer brilho ele deixava de ser silhueta e
  // virava um bloco marrom iluminado tapando um terco da tela.
  const matGab = of.mat({ color: 0x0e1013, roughness: 0.95 })

  // gabinete de TV velha: fundo, moldura grossa, dois botoes e uma antena
  const corpo = box(1.26, 0.80, 0.46, matGab, TV.x, 0.86, TV.z + 0.22)
  g.add(corpo)
  // moldura: a frente do gabinete, 1 cm a frente do corpo. O que sobrar dela
  // em volta da tela e o bisel grosso de TV de tubo.
  g.add(box(1.30, 0.84, 0.06, matGab, TV.x, 0.86, TV.z + 0.02))

  const canvas = document.createElement('canvas')
  canvas.width = TV_W
  canvas.height = TV_H
  const ctx2d = canvas.getContext('2d')
  const tela = new THREE.CanvasTexture(canvas)
  tela.colorSpace = THREE.SRGBColorSpace
  // sem mipmap e com filtro linear: o chiado E o assunto da textura, e o
  // mipmap de um canvas que muda 12 vezes por segundo custa upload a toa
  tela.magFilter = THREE.LinearFilter
  tela.minFilter = THREE.LinearFilter
  tela.generateMipmaps = false

  // Este material e a textura nao passam pela oficina: os dois sao devolvidos
  // pra quem chamou (a luz precisa mexer no emissiveIntensity todo quadro) e
  // saem no dispose por nome, junto com a TV.
  const matTela = new THREE.MeshStandardMaterial({
    map: tela, emissive: 0xffffff, emissiveMap: tela, emissiveIntensity: 1.55,
    roughness: 0.85, metalness: 0,
  })
  const telaMesh = new THREE.Mesh(new THREE.PlaneGeometry(TV.telaW, TV.telaH), matTela)
  const telaZ = TV.z - 0.015
  telaMesh.position.set(TV.x, TV.telaY, telaZ)
  telaMesh.rotation.y = Math.PI    // PlaneGeometry olha pra +Z; a TV olha pro sofa
  g.add(telaMesh)

  // Vidro curvo por cima: uma calota de esfera bem rasa (7 cm de barriga num
  // raio de 2.4 m). O -PI/2 no X joga a barriga pra -Z, ou seja, PRA FORA da
  // TV; com +PI/2 ela afunda pra dentro do gabinete e o reflexo some.
  //
  // O z sai de CONTA, nao de tentativa. Depois do -PI/2 a altura local da
  // calota vira profundidade: a BORDA dela fica a R*cos(theta) do centro da
  // esfera, entao ancorar a borda 5 mm a frente da tela e por o centro em
  // telaZ - 0.005 + R*cos(theta). Centrar a calota na tela (o que um "+2.35"
  // redondo faz) enterra o anel de fora — um quarto do vidro — atras de um
  // plano emissivo opaco: o depth test corta ali e sobra um oval de borda dura
  // desenhado por cima da coisa mais brilhante do plano.
  const VID_R = 2.4
  const VID_TH = 0.24                                  // barriga = R*(1-cos) = 6.9 cm
  const vidro = new THREE.Mesh(
    new THREE.SphereGeometry(VID_R, 18, 10, 0, Math.PI * 2, 0, VID_TH),
    glass(0xbfd8e8, 0.10),
  )
  vidro.rotation.x = -Math.PI / 2
  vidro.position.set(TV.x, TV.telaY, telaZ - 0.005 + VID_R * Math.cos(VID_TH))
  // so X e Z locais entram no achatamento: o Y local virou o eixo da barriga e
  // escalar ele mudaria a profundidade que a linha de cima acabou de calcular
  vidro.scale.set(0.93, 1, 0.54)
  g.add(vidro)

  // botoes de canal, deitados no eixo Z pra encararem quem assiste
  for (let i = 0; i < 2; i++) {
    const bt = cyl(0.026, 0.026, 0.02, solid(0x54585e, 0.6), 10)
    bt.rotation.x = Math.PI / 2
    bt.position.set(TV.x + 0.54, 0.66 - i * 0.12, TV.z - 0.02)
    g.add(bt)
  }
  // Antena de orelha de coelho, torta (uma haste mais aberta que a outra).
  // Curta: no plano de abertura ela passa a um metro da lente, e com 60 cm as
  // hastes viravam dois riscos pretos atravessando a tela inteira.
  for (const s of [-1, 1]) {
    const h = cyl(0.008, 0.005, 0.34, solid(0x6e7378, 0.55, 0.4), 6)
    h.position.set(TV.x + s * 0.10, 1.42, TV.z + 0.24)
    h.rotation.z = s * (s > 0 ? 0.62 : 0.38)
    g.add(h)
  }

  // estante embaixo da TV com fitas e um console
  const matEst = of.mat({ map: of.repetir(woodTex(1, '#4b3520'), 1, 1), color: 0x6a5236, roughness: 0.9 })
  g.add(box(1.42, 0.06, 0.52, matEst, TV.x, 0.43, TV.z + 0.20))
  g.add(box(1.42, 0.06, 0.52, matEst, TV.x, 0.06, TV.z + 0.20))
  for (const sx of [-1, 1]) g.add(box(0.05, 0.46, 0.50, matEst, TV.x + sx * 0.685, 0.24, TV.z + 0.20))
  const geoFita = new THREE.BoxGeometry(0.028, 0.105, 0.19)
  const matFita = of.mat({ color: 0x232326, roughness: 0.8 })
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(geoFita, matFita)
    f.position.set(TV.x - 0.60 + i * 0.032, 0.145, TV.z + 0.18)
    f.rotation.z = i === 6 ? 0.35 : 0
    g.add(f)
  }
  g.add(box(0.34, 0.07, 0.28, of.mat({ color: 0x3a3d44, roughness: 0.6 }), TV.x + 0.34, 0.125, TV.z + 0.16))

  // A LUZ. Ela vive a 3,3 m do sofa, e com decaimento fisico (2.0) chegava la
  // com um decimo da forca: o grupo ficava preto e a cutscene inteira virava
  // uma tela de creditos. 1.35 e a mentira minima que faz a TV iluminar quem
  // esta assistindo ela, que e o ponto da cena.
  const luz = new THREE.PointLight(0xbcd2ff, 3.0, 14, 1.35)
  luz.position.set(TV.x, TV.telaY + 0.05, TV.z - 0.55)
  luz.castShadow = true
  luz.shadow.mapSize.set(512, 512)
  luz.shadow.camera.near = 0.15
  luz.shadow.camera.far = 8
  luz.shadow.bias = -0.0035
  g.add(luz)

  return { tela, ctx2d, matTela, luz }
}

/** Desenha UM quadro da TV e devolve (por parametro `saida`) a luz que ele joga. */
function desenharTV(ctx2d, quadro, programa, saida) {
  _sem = (quadro * 0x9E3779B1) | 0
  const g = ctx2d

  if (programa === 'barras') {
    const cores = ['#c8c8c8', '#c8c800', '#00c8c8', '#00c800', '#c800c8', '#c80000', '#0000c8']
    const bw = TV_W / cores.length
    for (let i = 0; i < cores.length; i++) {
      g.fillStyle = cores[i]
      g.fillRect(i * bw, 0, bw + 1, TV_H * 0.78)
    }
    g.fillStyle = '#101010'; g.fillRect(0, TV_H * 0.78, TV_W, TV_H * 0.22)
    // a barra de sincronismo rolando: e ela que da vida a uma imagem parada
    const y = (quadro * 3) % TV_H
    g.fillStyle = 'rgba(255,255,255,0.16)'
    g.fillRect(0, y, TV_W, 4)
    saida.cor = 0xa8b0a0
    saida.forca = 2.9
    return
  }

  if (programa === 'filme') {
    // "filme": ceu escuro, chao claro e um vulto que atravessa. Muda de plano
    // a cada ~28 quadros, e a troca de plano e o que faz a luz pular de cor.
    const plano = Math.floor(quadro / 28)
    _sem = (plano * 0x85EBCA6B) | 0
    const h = 20 + _rnd() * 200
    const cima = 'hsl(' + h + ',45%,' + (10 + _rnd() * 14) + '%)'
    const baixo = 'hsl(' + ((h + 40) % 360) + ',35%,' + (28 + _rnd() * 30) + '%)'
    const corVulto = 'hsl(' + ((h + 180) % 360) + ',60%,72%)'
    // _corPrograma e de modulo: desenharTV roda de dentro do laco de
    // atualizacao, e um Color novo por troca de plano e lixo de graca
    _corPrograma.setHSL(((h + 25) % 360) / 360, 0.42, 0.62)

    g.fillStyle = cima; g.fillRect(0, 0, TV_W, TV_H * 0.55)
    g.fillStyle = baixo; g.fillRect(0, TV_H * 0.55, TV_W, TV_H * 0.45)
    const px = ((quadro % 28) / 28) * (TV_W + 24) - 12
    g.fillStyle = corVulto
    g.fillRect(px, TV_H * 0.30, 12, TV_H * 0.42)
    g.beginPath(); g.arc(px + 6, TV_H * 0.28, 6, 0, 7); g.fill()
    // corte seco de vez em quando: um quadro branco inteiro
    if ((quadro % 28) === 0) {
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, TV_W, TV_H)
      saida.cor = 0xffffff
      saida.forca = 6.2
      return
    }
    saida.cor = _corPrograma.getHex()
    saida.forca = 1.9 + Math.sin(quadro * 0.9) * 0.35
    return
  }

  // 'estatica': chiado. Blocos, nao pixels: um ruido de 1 px em 96x72 esticado
  // numa tela de 1 m vira cinza chapado, e o que se quer ver e o granulado.
  const nivel = 0.5 + _rnd() * 0.5
  g.fillStyle = '#0d0f14'; g.fillRect(0, 0, TV_W, TV_H)
  for (let i = 0; i < 420; i++) {
    const v = (110 + _rnd() * 145) | 0
    g.fillStyle = 'rgba(' + v + ',' + (v + 6) + ',' + (v + 18) + ',' + (0.25 + _rnd() * 0.75) + ')'
    g.fillRect(_rnd() * TV_W, _rnd() * TV_H, 1 + _rnd() * 4, 1 + _rnd() * 2)
  }
  // faixa de rolagem: a "barra" que sobe na TV mal sintonizada
  const fy = TV_H - ((quadro * 7) % (TV_H + 24))
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(0, fy, TV_W, 10)
  saida.cor = 0xc4d4ff
  saida.forca = 2.1 + nivel * 2.0
}

// ---------------------------------------------------------------------------
// F. OS ATORES — os jogadores, sentados, com a aparencia deles
// ---------------------------------------------------------------------------
const JUNTAS = [
  'hips', 'torso', 'chest',
  'armRUpper', 'armRLower', 'handR',
  'armLUpper', 'armLLower', 'handL',
  'legRUpper', 'legRLower', 'footR',
  'legLUpper', 'legLLower', 'footL',
]
const ZERO = [0, 0, 0]

/** Centro da almofada `i`, contado do vao entre os bracos. */
function lugarX(i) {
  const larg = SOFA.xf - SOFA.xi
  return SOFA.xi + larg * ((i + 0.5) / SOFA.lugares)
}

/**
 * Onde cada um senta, por numero de jogadores. TODO MUNDO NO SOFA — ninguem
 * mais no braco.
 *
 * Com quatro, cada um pousa no centro da propria almofada (lugarX): as
 * posicoes saem da MESMA conta que desenhou as almofadas, entao ninguem senta
 * na emenda entre duas. Com menos gente eles espalham, porque tres pessoas
 * sentadas no canto de um sofa de quatro lugares parecem tres pessoas que
 * chegaram cedo demais.
 *
 * O `rot` abre os ombros dos das pontas pro meio do grupo: uma fileira de
 * quatro pessoas perfeitamente paralelas le como banco de rodoviaria.
 */
const LUGARES = {
  1: [{ x: lugarX(1), rot: 0.06 }],
  2: [
    { x: lugarX(0), rot: 0.15 },
    { x: lugarX(2), rot: -0.10 },
  ],
  3: [
    { x: lugarX(0), rot: 0.16 },
    { x: lugarX(1), rot: 0.05 },
    { x: lugarX(3), rot: -0.16 },
  ],
  4: [
    { x: lugarX(0), rot: 0.16 },
    { x: lugarX(1), rot: 0.05 },
    { x: lugarX(2), rot: -0.05 },
    { x: lugarX(3), rot: -0.16 },
  ],
}

function criarAtores(cena, of, jogadores) {
  const n = Math.max(1, Math.min(4, jogadores.length))
  const lugares = LUGARES[n]
  const atores = []

  for (let i = 0; i < n; i++) {
    const j = jogadores[i] || {}
    const L = lugares[i]
    const personagem = createCharacter({ appearance: paraAparencia(j.aparencia) })
    const lift = alturaSentado(SOFA.assento)
    const z = -1.70
    const ySent = lift + (POSES.sit ? POSES.sit.rootY : 0)
    personagem.root.position.set(L.x, ySent, z)
    personagem.root.rotation.y = L.rot
    personagem.root.name = 'abertura:' + (j.id || i)
    cena.add(personagem.root)

    const a = {
      personagem,
      P: personagem.parts,
      nome: String(j.nome || ('Jogador ' + (i + 1))),
      anfitriao: !!j.anfitriao,
      x: L.x, z, rotY: L.rot,
      // Os dois pousos do personagem, pro levantar poder interpolar entre eles
      // sem recalcular nada por quadro.
      //
      // Em pe ele nao fica em cima da almofada: ele DA UM PASSO A FRENTE, pra
      // z = -1.06. Levantar sem sair do lugar deixaria o corpo dentro do
      // proprio sofa (o assento vai de z -2.27 a -1.35). O -1.06 e o meio do
      // corredor entre a frente do sofa e o fundo da mesinha (que comeca em
      // -0.78): sobra folga pros pes nas duas pontas.
      ySent, zSent: z, yPe: 0, zPe: -1.06,
      cabecaSent: ySent + personagem.headCenterY,
      cabecaPe: personagem.headCenterY,
      // altura da cabeca no MUNDO: o root ja carrega o afundamento da pose
      cabecaY: ySent + personagem.headCenterY,
      // fase propria: dois vizinhos respirando em sincronia entregam o truque.
      // Deriva do indice, nunca de Math.random — a cutscene tem que sair igual
      // na tela dos quatro.
      fase: i * 1.97,
      t: i * 1.97,
      tique: i % 4,
      reacao: 0,
      lookYaw: 0,
      lookPitch: 0,
      acessorio: null,
      geosProprias: [],
    }

    // Quem tem o tique do controle ganha um controle na mao; quem tem o tique
    // da lata ganha a lata. Sao os dois unicos objetos de mao da cena, e sao o
    // que faz a micro-animacao ser LIDA como micro-animacao.
    if (a.tique === 1) {
      const c = fazerControle(of)
      c.scale.setScalar(0.92)
      c.position.set(-0.02, -0.085, 0.055)
      c.rotation.set(-1.15, 0.15, 0)
      a.P.handR.add(c)
      a.acessorio = c
    } else if (a.tique === 2) {
      const lata = new THREE.Group()
      montarLata(lata, of, 'cerveja', 0, 0, 0, 0, false)
      lata.scale.setScalar(0.95)
      lata.position.set(-0.005, -0.10, 0.035)
      lata.rotation.set(-1.45, 0, 0)
      a.P.handR.add(lata)
      a.acessorio = lata
    }
    if (a.acessorio) {
      a.acessorio.traverse((o) => { if (o.isMesh && o.geometry) a.geosProprias.push(o.geometry) })
    }

    atores.push(a)
  }

  // Sem anfitriao marcado, o primeiro assume: a cutscene NAO pode ficar muda
  // porque o lobby esqueceu de marcar quem criou a sala.
  if (!atores.some((a) => a.anfitriao)) atores[0].anfitriao = true
  return atores
}

/**
 * Escreve a pose base de todas as juntas, misturando SENTADO (k=0) com EM PE
 * (k=1). O resto da animacao e somado por cima disto.
 *
 * Misturar as duas poses junta por junta e o jeito barato de levantar do sofa:
 * nao existe clipe de animacao no jogo inteiro, e uma transicao escrita a mao
 * (dobra o tronco, estica a perna, empurra o quadril) seria uma segunda pose
 * pra manter em sincronia com POSES.sit toda vez que o esqueleto mudasse.
 * Junta que existe numa pose e nao na outra vai pra zero pelo ZERO, que e
 * exatamente onde a pose neutra a quer.
 */
function porPose(P, k) {
  const a = POSES.sit ? POSES.sit.j : {}
  const b = POSES.idle ? POSES.idle.j : {}
  for (let i = 0; i < JUNTAS.length; i++) {
    const n = JUNTAS[i]
    const p = P[n]
    if (!p) continue
    const x = a[n] || ZERO
    const y = b[n] || ZERO
    p.rotation.set(
      x[0] + (y[0] - x[0]) * k,
      x[1] + (y[1] - x[1]) * k,
      x[2] + (y[2] - x[2]) * k,
    )
  }
}

/**
 * Uma "batida" curta e deterministica: vale 1 no instante do impacto e volta
 * a 0 em ~`dur` segundos. Serve pro tranco da camera e pro susto do corpo.
 */
function batida(t, dur) {
  if (t < 0 || t > dur) return 0
  const k = 1 - t / dur
  return k * k
}

function atualizarAtor(a, d, ctx) {
  a.t += d
  const t = a.t
  const P = a.P

  // kL = 0 sentado, 1 em pe. Tudo que esta ligado ao sofa some junto com ele.
  const kL = ctx.levantar
  const tq = 1 - kL
  porPose(P, kL)

  // O CORPO SOBE E DA UM PASSO. E o root que anda, nao as juntas: as juntas ja
  // estao ocupadas misturando as duas poses, e mover o quadril por rotacao pra
  // ganhar 37 cm de altura enterraria os pes no assoalho.
  // O PULINHO: uma unica batida durante a subida (pico em kL = 0.5, 5,5 cm).
  // E o empurrao contra o sofa. Sem ele a subida e linear e le como elevador.
  const hop = kL > 0.02 && kL < 0.999 ? Math.sin(kL * Math.PI) * 0.055 : 0
  a.personagem.root.position.set(
    a.x,
    a.ySent + (a.yPe - a.ySent) * kL + hop,
    a.zSent + (a.zPe - a.zSent) * kL,
  )
  a.z = a.zSent + (a.zPe - a.zSent) * kL
  a.cabecaY = a.cabecaSent + (a.cabecaPe - a.cabecaSent) * kL

  // --- respiracao (a mesma ideia do npc.js: peito nos MESHES, tronco na junta)
  const br = Math.sin(t * 1.5)
  P.torso.position.y = br * 0.010
  P.chest.scale.set(1 - br * 0.007, 1 + br * 0.017, 1 - br * 0.007)

  // --- peso do corpo indo e voltando
  const sway = Math.sin(t * 0.47)
  P.hips.rotation.y += sway * 0.035
  P.torso.rotation.z += Math.sin(t * 0.71 + 1.1) * 0.016
  P.chest.rotation.x += br * 0.010

  // --- tique proprio ---------------------------------------------------------
  // Tudo aqui e tique de quem esta LARGADO num sofa: perna balancando, gole de
  // lata, coceira na nuca. Quando o grupo levanta os tiques desaparecem por
  // `tq`, e nao com um if: cortar de uma vez faria a perna nervosa parar num
  // quadro so, no meio da batida, o que le como travamento.
  if (a.tique === 0) {
    // perna nervosa: quem espera alguem falar balanca o joelho
    const p = Math.sin(t * 8.4) * tq
    P.legRUpper.rotation.x += p * 0.030
    P.legRLower.rotation.x -= p * 0.055
    P.footR.rotation.x += p * 0.16
  } else if (a.tique === 1) {
    // mexendo no controle: antebracos pequenos e rapidos, cabeca meio caida
    P.armRLower.rotation.x += Math.sin(t * 5.1) * 0.030 * tq
    P.armLLower.rotation.x += Math.sin(t * 5.1 + 1.7) * 0.030 * tq
    P.handR.rotation.z += Math.sin(t * 9.3) * 0.06 * tq
    P.handL.rotation.z -= Math.sin(t * 8.1) * 0.06 * tq
  } else if (a.tique === 2) {
    // um gole a cada ~9 s: o resto do tempo a lata descansa na perna
    const ciclo = (t % 9.0)
    const gole = (ciclo > 6.2 && ciclo < 8.0 ? Math.sin((ciclo - 6.2) / 1.8 * Math.PI) : 0) * tq
    P.armRUpper.rotation.x -= gole * 0.55
    P.armRLower.rotation.x -= gole * 0.95
    P.handR.rotation.x -= gole * 0.35
  } else {
    // coca a nuca de vez em quando; no resto do tempo so ajeita o ombro
    const ciclo = (t % 11.0)
    const coca = (ciclo > 8.0 && ciclo < 9.6 ? Math.sin((ciclo - 8.0) / 1.6 * Math.PI) : 0) * tq
    P.armLUpper.rotation.x -= coca * 1.55
    P.armLUpper.rotation.z -= coca * 0.55
    P.armLLower.rotation.x -= coca * 1.30
    P.chest.rotation.z += Math.sin(t * 0.9) * 0.02 * tq
  }

  // --- reacao ao coro --------------------------------------------------------
  // A reacao sobe rapido (0.09 s) e desce devagar: e assim que um "NAOOO"
  // parece um berro e nao um aceno.
  const alvo = ctx.reacao
  const vel = alvo > a.reacao ? 11 : 2.6
  a.reacao += (alvo - a.reacao) * Math.min(1, d * vel)
  const r = a.reacao
  if (r > 0.002) {
    if (ctx.animado) {
      // cassino: bracos pra cima, corpo pra tras, cabeca balancando que SIM.
      //
      // Sentado o braco sobe 1.85 rad no maximo — mais que isso e o cotovelo
      // entra no encosto do sofa. Em pe nao ha encosto: 3.0 rad com a reacao em
      // 0.90 poe a mao ACIMA DA CABECA (2.7 rad, 155 graus), que e o gesto que
      // o dono pediu ("como se fosse uma ideia milhonaria"). Com os 2.35 da
      // primeira tentativa o braco parava na horizontal e a foto virava quatro
      // pessoas dando de ombros.
      const alto = 1.85 + kL * 1.15
      P.armRUpper.rotation.x -= r * alto
      P.armLUpper.rotation.x -= r * alto
      // A ABERTURA lateral diminui quando eles levantam. Sentado, abrir o
      // cotovelo 0.35 rad e o que da largura ao gesto; em pe, com 58 cm entre
      // um e o outro, a mao levantada de um entrava no espaco do vizinho. Mais
      // reto pra cima tambem le melhor como comemoracao do que como aceno.
      const abre = 0.35 - kL * 0.17
      P.armRUpper.rotation.z += r * abre
      P.armLUpper.rotation.z -= r * abre
      P.chest.rotation.x += r * 0.16
      P.hips.rotation.x += r * 0.06
    } else {
      // negativa: joga o corpo pra frente e sacode a cabeca
      P.chest.rotation.x -= r * 0.30
      P.torso.rotation.x -= r * 0.10
      P.armRUpper.rotation.x -= r * 0.70
      P.armLUpper.rotation.x -= r * 0.70
      P.armRLower.rotation.x -= r * 0.55
      P.armLLower.rotation.x -= r * 0.55
    }
  }

  // --- gesto de quem esta falando -------------------------------------------
  if (ctx.falando) {
    const gg = Math.sin(t * 3.1)
    P.armRUpper.rotation.x -= 0.30 + gg * 0.16
    P.armRLower.rotation.x -= 0.42 + gg * 0.22
    P.armRUpper.rotation.z += 0.10
    P.handR.rotation.x -= 0.20
    P.chest.rotation.y += Math.sin(t * 1.4) * 0.05
  }

  // --- pensando: cabeca de lado, mao no queixo -------------------------------
  if (ctx.pensando) {
    P.armLUpper.rotation.x -= 1.30
    P.armLUpper.rotation.z -= 0.30
    P.armLLower.rotation.x -= 1.35
    P.chest.rotation.z += 0.06
  }

  // --- cabeca: olha pra quem fala, senao volta pra TV -------------------------
  const dx = ctx.olharX - a.x
  const dz = ctx.olharZ - a.z
  let yaw = Math.atan2(dx, dz) - a.rotY
  while (yaw > Math.PI) yaw -= Math.PI * 2
  while (yaw < -Math.PI) yaw += Math.PI * 2
  const dist = Math.max(0.3, Math.hypot(dx, dz))
  let pitch = -Math.atan2(ctx.olharY - a.cabecaY, dist)
  if (ctx.pensando) { pitch -= 0.22; yaw += 0.30 }
  const k = 1 - Math.exp(-7 * d)
  a.lookYaw += (yaw - a.lookYaw) * k
  a.lookPitch += (pitch - a.lookPitch) * k
  // a negativa balanca a cabeca alem do alvo: e o "nao" propriamente dito
  const chacoalho = (!ctx.animado && r > 0.02) ? Math.sin(t * 19) * 0.42 * r : 0
  a.personagem.setHeadLook(a.lookPitch, a.lookYaw + chacoalho)
}

// ---------------------------------------------------------------------------
// G. O ROTEIRO
//
// Um passo por fala. `d` e a duracao em segundos, e a soma dos `d` da parte 1 e
// o tempo que a camera tem pra atravessar o porao. `txt` pode ser uma string ou
// { so, grupo }: sozinho na sala o texto muda, porque "gente, serio agora" pra
// ninguem e outra piada.
//
// quem: 'anf'  o anfitriao fala
//       'coro' os OUTROS respondem juntos (sozinho, e o proprio jogador)
//       'todos' todo mundo junto, incluindo o anfitriao
//       'pensa' ninguem fala, o grupo pensa
//       null   silencio
// ---------------------------------------------------------------------------
const ROTEIRO = [
  { d: 2.6, quem: null },
  { d: 2.0, quem: 'anf', txt: { grupo: 'Gente. Serio agora. Baixa esse volume.', so: 'Ta. Serio agora.' } },
  { d: 3.2, quem: 'anf', txt: 'A gente vive de energetico morno e pizza de ontem.' },
  { d: 3.0, quem: 'anf', txt: { grupo: 'Eu quero um negocio nosso. Dinheiro de verdade.', so: 'Eu quero um negocio meu. Dinheiro de verdade.' } },
  { d: 2.6, quem: 'anf', txt: 'E se a gente abrir um restaurante?' },
  { d: 1.8, quem: 'coro', txt: { grupo: 'NAOOO', so: 'Nao. Nao mesmo.' }, tranco: 1.0 },
  { d: 2.0, quem: 'anf', txt: 'Ta bom, ta bom. Calma.' },
  { d: 3.2, quem: 'anf', txt: 'E se a gente abrir uma distribuidora de bebidas?' },
  { d: 1.2, quem: 'pensa' },
  { d: 1.8, quem: 'coro', txt: { grupo: 'NAOOO', so: 'Nao. De jeito nenhum.' }, tranco: 1.15 },
  { d: 2.2, quem: 'anf', txt: { grupo: 'Entao me ajuda, porque eu to sem ideia.', so: 'Entao pensa, porque eu to sem ideia.' } },
  { d: 3.0, quem: 'todos', tranco: 0.55, animado: true,
    txt: { grupo: 'E SE A GENTE ABRIR UM CASSINO?', so: 'E SE EU ABRIR UM CASSINO?' } },
  { d: 1.4, quem: null, animado: true },
  { d: 1.9, quem: null, animado: true, fade: [0, 1] },
  // --- parte 2: a rua ------------------------------------------------------
  { d: 1.0, parte: 2, quem: null, fade: [1, 1] },
  { d: 1.5, parte: 2, quem: null, fade: [1, 0] },
  { d: 3.6, parte: 2, quem: 'anf', txt: 'Nao era bem isso que eu imaginei... mas e um comeco.' },
  { d: 1.5, parte: 2, quem: null },
]

const DUR_PORAO = ROTEIRO.reduce((s, p) => s + (p.parte === 2 ? 0 : p.d), 0)

function textoDo(passo, n) {
  const t = passo.txt
  if (!t) return ''
  if (typeof t === 'string') return t
  return (n <= 1 && t.so) ? t.so : t.grupo
}

// ---------------------------------------------------------------------------
// H. A CAMADA DOM — baloes, legenda e o preto
//
// Os baloes seguem a cabeca de quem fala por projecao, igual ao src/ui/dialogo.js
// (_v.set(x,y,z).project(camera)). A legenda no rodape existe porque balao que
// segue cabeca some quando a camera fecha demais, e a fala nao pode sumir junto.
// ---------------------------------------------------------------------------
const CSS_ABERTURA =
  '.mcrp-ab{position:fixed;inset:0;z-index:60;pointer-events:none;' +
  'font:14px/1.5 "Trebuchet MS",system-ui,sans-serif;color:#e8edf6}' +
  '.mcrp-ab .preto{position:absolute;inset:0;background:#000;opacity:0}' +
  '.mcrp-ab .bal{position:absolute;left:0;top:0;transform:translate(-50%,-100%);' +
  'transition:opacity .16s;opacity:0}' +
  '.mcrp-ab .bal.on{opacity:1}' +
  '.mcrp-ab .cx{position:relative;min-width:150px;max-width:min(46vw,430px);' +
  'padding:10px 14px;background:rgba(13,15,20,.90);backdrop-filter:blur(8px);' +
  'border:1px solid rgba(255,255,255,.14);border-radius:12px;' +
  'box-shadow:0 12px 34px rgba(0,0,0,.55)}' +
  '.mcrp-ab .cx:after{content:"";position:absolute;left:50%;bottom:-7px;' +
  'width:14px;height:14px;margin-left:-7px;transform:rotate(45deg);' +
  'background:rgba(13,15,20,.90);border-right:1px solid rgba(255,255,255,.14);' +
  'border-bottom:1px solid rgba(255,255,255,.14)}' +
  '.mcrp-ab .quem{font-size:11px;letter-spacing:.14em;text-transform:uppercase;' +
  'color:#8fd6a8;margin-bottom:4px}' +
  '.mcrp-ab .fala{font-size:15px}' +
  '.mcrp-ab .bal.coro .cx{background:rgba(24,10,10,.92);border-color:rgba(255,120,110,.42);' +
  'box-shadow:0 14px 40px rgba(0,0,0,.6)}' +
  '.mcrp-ab .bal.coro .cx:after{background:rgba(24,10,10,.92);' +
  'border-right-color:rgba(255,120,110,.42);border-bottom-color:rgba(255,120,110,.42)}' +
  '.mcrp-ab .bal.coro .quem{color:#ff9d92}' +
  '.mcrp-ab .bal.coro .fala{font-size:34px;font-weight:bold;letter-spacing:.05em;' +
  'text-align:center;line-height:1.1}' +
  '.mcrp-ab .bal.bom .cx{background:rgba(10,24,16,.92);border-color:rgba(143,214,168,.45)}' +
  '.mcrp-ab .bal.bom .cx:after{background:rgba(10,24,16,.92);' +
  'border-right-color:rgba(143,214,168,.45);border-bottom-color:rgba(143,214,168,.45)}' +
  '.mcrp-ab .bal.bom .fala{color:#b7f0c6}' +
  '.mcrp-ab .bal.fixo{left:50%;top:76%}' +
  '.mcrp-ab .leg{position:absolute;left:50%;bottom:7vh;transform:translateX(-50%);' +
  'max-width:min(78vw,900px);text-align:center;font-size:17px;color:#f2f5fa;' +
  'text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.9);opacity:0;' +
  'transition:opacity .16s}' +
  '.mcrp-ab .leg.on{opacity:1}' +
  '.mcrp-ab .leg b{color:#8fd6a8;font-weight:normal;letter-spacing:.1em;' +
  'text-transform:uppercase;font-size:12px;display:block;margin-bottom:3px}' +
  '.mcrp-ab .dica{position:absolute;right:18px;bottom:16px;font-size:11px;' +
  'letter-spacing:.14em;text-transform:uppercase;color:rgba(232,237,246,.42)}'

function criarCamada(nBaloes) {
  const raiz = document.createElement('div')
  raiz.className = 'mcrp-ab'
  const estilo = document.createElement('style')
  estilo.textContent = CSS_ABERTURA
  document.head.appendChild(estilo)

  const preto = document.createElement('div')
  preto.className = 'preto'
  raiz.appendChild(preto)

  const baloes = []
  for (let i = 0; i <= nBaloes; i++) {
    const b = document.createElement('div')
    b.className = 'bal'
    b.innerHTML = '<div class="cx"><div class="quem"></div><div class="fala"></div></div>'
    b.dataset.quem = ''
    raiz.appendChild(b)
    baloes.push({ el: b, quem: b.querySelector('.quem'), fala: b.querySelector('.fala') })
  }
  // o ultimo e o balao do CORO: um so, grande, pra todo mundo
  const coro = baloes.pop()
  coro.el.classList.add('coro')

  const leg = document.createElement('div')
  leg.className = 'leg'
  leg.innerHTML = '<b></b><span></span>'
  raiz.appendChild(leg)

  const dica = document.createElement('div')
  dica.className = 'dica'
  dica.textContent = 'Esc pular'
  raiz.appendChild(dica)

  document.body.appendChild(raiz)

  return {
    raiz, estilo, preto, baloes, coro, leg,
    legQuem: leg.querySelector('b'),
    legTxt: leg.querySelector('span'),
    dispose() { raiz.remove(); estilo.remove() },
  }
}

// ---------------------------------------------------------------------------
// I. A CUTSCENE
// ---------------------------------------------------------------------------
export function criarAbertura({ renderer, cena, camera, jogadores, casa, chao } = {}) {
  const lista = Array.isArray(jogadores) && jogadores.length ? jogadores.slice(0, 4) : [{ nome: 'Voce', anfitriao: true }]
  const nJog = lista.length
  const CASA = casa || CASA_PADRAO

  let rodando = false
  let terminado = false
  let aoTerminar = null

  let of = null
  let porao = null
  let camPorao = null
  let atores = []
  let tv = null
  let camada = null

  let iPasso = 0
  let tPasso = 0
  let tParte1 = 0
  let parte = 1
  let fadeDe = 0, fadePara = 0, fadeAtual = 0
  // Ultimo valor REALMENTE escrito no DOM. O preto cobre a tela inteira e fica
  // em 0 na quase totalidade dos 36 s da cena: escrever style.opacity todo
  // quadro custa um toFixed() (string nova por quadro) e um recalculo de
  // estilo em cima de um elemento fixed:inset:0 pra nao mudar pixel nenhum.
  let fadeEscrito = -1
  let trancoT = -1, trancoA = 0
  let ultimoQuadroTV = -1

  // Estado de camera do jogo, pra devolver como estava se a parte 2 nem rodar.
  const camSalva = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, tem: false }

  // Rascunhos reusados: projetar balao e temperar a luz da TV acontecem TODO
  // quadro, e um Vector3/Color novo por quadro por ator e lixo de graca.
  const _v = new THREE.Vector3()
  const _corTV = new THREE.Color(0xbcd2ff)
  const _corAlvo = new THREE.Color(0xbcd2ff)
  const _saidaTV = { cor: 0xbcd2ff, forca: 2.4 }
  let _forcaTV = 2.4

  // --- construcao ------------------------------------------------------------
  function montarPorao() {
    of = novaOficina()
    porao = new THREE.Scene()
    porao.background = new THREE.Color(0x04050a)

    const rnd = mulberry32(20260827)
    montarSala(porao, of, rnd)
    montarSofa(porao, of)
    montarMesa(porao, of, rnd)
    montarBagunca(porao, of, rnd)
    tv = montarTV(porao, of)

    // Lampada amarelada fraca no teto. Ela existe pra o que a TV nao alcanca
    // nao virar breu total — se ela subir de intensidade, a TV deixa de mandar
    // na cena e a cutscene perde o clima inteiro.
    const bulbo = sphere(0.045, of.mat({
      color: 0x2a2410, emissive: 0xffcf7a, emissiveIntensity: 1.4, roughness: 0.6,
    }), 10)
    bulbo.position.set(-1.35, 2.03, 0.55)
    bulbo.castShadow = false
    porao.add(bulbo)
    const fio = cyl(0.004, 0.004, 0.26, solid(0x2a2622, 0.9), 6)
    fio.position.set(-1.35, 2.17, 0.55)
    porao.add(fio)
    const lampada = new THREE.PointLight(0xffc478, 2.6, 6.5, 1.6)
    lampada.position.set(-1.35, 2.00, 0.55)
    porao.add(lampada)

    // Ambiente: o bastante pro que esta na sombra mostrar CONTORNO em vez de
    // virar buraco preto. Mais que isso apaga a TV, e a TV e a cena.
    porao.add(new THREE.AmbientLight(0x39465e, 0.50))

    atores = criarAtores(porao, of, lista)
    const anf = anfitriao()
    if (anf) nomeAnf = anf.nome

    camPorao = new THREE.PerspectiveCamera(
      FOV_PORAO, window.innerWidth / Math.max(1, window.innerHeight), 0.05, 60,
    )
    camPorao.position.set(CAM_INI.x, CAM_INI.y, CAM_INI.z)
    camPorao.lookAt(CAM_ALVO_INI.x, CAM_ALVO_INI.y, CAM_ALVO_INI.z)
  }

  // --- roteiro ---------------------------------------------------------------
  // O NOME do anfitriao fica guardado a parte de proposito. A parte 2 acontece
  // com o porao ja liberado — 'atores' esta vazio quando a ultima fala entra na
  // tela, e ir buscar o nome no ator naquele instante era um TypeError certo.
  let nomeAnf = 'Anfitriao'

  function anfitriao() {
    for (const a of atores) if (a.anfitriao) return a
    return atores[0] || null
  }

  function entrarNoPasso(p) {
    if (!p) return
    if (p.fade) { fadeDe = p.fade[0]; fadePara = p.fade[1] }
    else { fadeDe = fadePara = fadeAtual }
    if (p.tranco) { trancoT = 0; trancoA = p.tranco }
    if (p.parte === 2 && parte !== 2) entrarNaParte2()
    mostrarFala(p)
  }

  /**
   * A troca de cena: o grupo sai do porao e vai pra CALCADA, em fila, olhando
   * pra casa.
   *
   * Os bonecos sao os MESMOS. Poderiam ser criados de novo na cena do jogo, ou
   * poderiam ser os avatares de rede — e as duas alternativas falham pelo mesmo
   * motivo: no instante desta troca o servidor ainda nao mandou ninguem pra
   * frente da casa (a partida nem comecou), e no modo solo nao existe rede
   * nenhuma. Reaproveitando os atores a fila esta certa nos dois modos e sai de
   * graca: eles ja estao construidos, ja estao com a customizacao de cada
   * jogador e ja estao EM PE, porque acabaram de levantar do sofa.
   *
   * O preco e que soltarPorao() nao pode mais mata-los junto (ver la).
   */
  function entrarNaParte2() {
    parte = 2
    porAtoresNaFila()
    // O porao ja nao aparece mais. Soltar aqui (e nao no fim) devolve a memoria
    // enquanto a tela esta PRETA, que e o unico momento em que um engasgo de
    // GC/driver nao aparece pra ninguem.
    soltarPorao()
    if (!camera) return
    camSalva.x = camera.position.x; camSalva.y = camera.position.y; camSalva.z = camera.position.z
    camSalva.rx = camera.rotation.x; camSalva.ry = camera.rotation.y; camSalva.rz = camera.rotation.z
    camSalva.tem = true
    // Altura dos olhos: 'casa.y' e o PISO da calcada. Se alguem ja mandar a
    // altura do olho (acima de 1.2 m nao existe calcada), respeita o que veio
    // em vez de empilhar dois metros de gente.
    const chao = CASA.y || 0
    const olhoY = chao > 1.2 ? chao : chao + PLAYER.EYE_HEIGHT
    camera.position.set(CASA.x || 0, olhoY, CASA.z || 0)
    camera.lookAt(
      CASA.olharX !== undefined ? CASA.olharX : CASA.x,
      CASA.olharY !== undefined ? CASA.olharY : olhoY,
      CASA.olharZ !== undefined ? CASA.olharZ : (CASA.z || 0) - 6,
    )
  }

  /** Move cada ator pro lugar dele na fila e vira todos pra casa. */
  function porAtoresNaFila() {
    if (!cena || !atores.length) return
    const n = atores.length
    // A altura do piso vem de quem monta o mundo (main.js passa game.groundY):
    // a calcada da frente da casa esta em LEVELS.SHOP_FLOOR hoje, mas escrever
    // 0.16 aqui seria a quarta copia desse numero no projeto.
    const base = typeof chao === 'function' ? chao(LOTE.door.center, LOTE.z0 - 3.2) : 0
    for (let i = 0; i < n; i++) {
      const a = atores[i]
      const f = filaDaCasa(i, n)
      // O root sai do porao e entra na cena do jogo. add() ja tira do pai
      // anterior, entao o porao fica sem eles antes de soltarPorao varrer.
      cena.add(a.personagem.root)
      // Os dois pousos passam a ser o MESMO ponto: na rua ninguem senta, e com
      // sentado == em pe o levantar (que fica travado em 1) nao move nada.
      a.x = f.x
      a.zSent = f.z; a.zPe = f.z; a.z = f.z
      a.ySent = base; a.yPe = base
      a.cabecaSent = base + a.personagem.headCenterY
      a.cabecaPe = a.cabecaSent
      a.cabecaY = a.cabecaSent
      a.rotY = f.yaw
      a.personagem.root.position.set(f.x, base, f.z)
      a.personagem.root.rotation.y = f.yaw
      // A lata e o controle ficam no porao (na historia, nao na cena): o corte
      // pro preto e uma elipse, eles andaram ate aqui. Chegar na calcada com um
      // controle de video game na mao le como objeto esquecido pelo programador.
      if (a.acessorio) a.acessorio.visible = false
    }
  }

  // Na rua eles so respiram e olham pra casa: `levantar` travado em 1 (ja estao
  // em pe) e reacao zerada. O alvo do olhar e a PORTA, nao o centro da fachada
  // — e pra porta que a cena inteira aponta.
  const _ctxRua = {
    falando: false, reacao: 0, animado: false, pensando: false, levantar: 1,
    olharX: 0, olharY: 0, olharZ: 0,
  }

  function atualizarAtoresRua(d) {
    if (!atores.length) return
    _ctxRua.olharX = LOTE.door.center
    _ctxRua.olharY = 1.55
    _ctxRua.olharZ = LOTE.z0
    for (const a of atores) atualizarAtor(a, d, _ctxRua)
  }

  function mostrarFala(p) {
    if (!camada) return
    for (const b of camada.baloes) b.el.classList.remove('on')
    camada.coro.el.classList.remove('on', 'bom')
    camada.leg.classList.remove('on')

    // Estilo inline de balao projetado nao pode sobreviver a troca de parte: na
    // rua o balao mora no rodape por CSS, e um left/top de pixel deixado pela
    // parte 1 ganha da folha de estilo e prega o balao onde estava a cabeca.
    for (const b of camada.baloes) { b.el.style.left = ''; b.el.style.top = '' }

    const txt = textoDo(p, nJog)
    if (!txt) {
      // a pausa pensativa mostra reticencias: silencio sem legenda parece bug
      if (p.quem === 'pensa') {
        camada.legQuem.textContent = ''
        camada.legTxt.textContent = '...'
        camada.leg.classList.add('on')
      }
      return
    }

    if (p.quem === 'anf') {
      const b = camada.baloes[0]
      b.quem.textContent = nomeAnf
      b.fala.textContent = txt
      b.el.classList.add('on')
      b.el.classList.toggle('fixo', parte === 2)
      camada.legQuem.textContent = nomeAnf
      camada.legTxt.textContent = txt
    } else {
      // COROS: um balao unico e grande.
      //
      // QUEM RESPONDE SAO OS OUTROS JOGADORES. Havia aqui uma piada de plateia
      // de TV: sozinho na sala, o "NAOOO" vinha da televisao, com flash de
      // risada enlatada na tela. O dono do projeto cortou ("n e a plateia como
      // vc colocou") e ele tem razao pelo motivo certo: a cena e sobre quatro
      // amigos decidindo um negocio, e por uma piada ela passava a ser sobre um
      // sujeito sendo ridicularizado por um aparelho.
      //
      // Sozinho, quem diz "NAOOO" e o PROPRIO jogador — a cena vira alguem
      // discutindo consigo mesmo num porao, que e mais honesto e continua tendo
      // graca. Sem plateia nenhuma.
      const c = camada.coro
      let quem
      if (nJog <= 1) quem = nomeAnf
      else quem = p.quem === 'todos' ? 'Todos' : 'Todos os outros'
      c.quem.textContent = quem
      c.fala.textContent = txt
      c.el.classList.add('on')
      if (p.animado) c.el.classList.add('bom')
      camada.legQuem.textContent = quem
      camada.legTxt.textContent = txt
    }
    camada.leg.classList.add('on')
  }

  // --- camera ----------------------------------------------------------------
  function suave(k) { return k * k * (3 - 2 * k) }

  function atualizarCameraPorao(d) {
    if (!camPorao) return
    // A camera do porao e minha, entao o resize de main.js nao a alcanca: quem
    // redimensiona a janela no meio da cutscene teria o porao esticado ate o
    // fim dela. Comparar antes de escrever evita recalcular a projecao a toa.
    const asp = window.innerWidth / Math.max(1, window.innerHeight)
    // A LENTE ABRE quando o grupo levanta (ver CAM_PE): e ela que compra o
    // enquadramento que o recuo nao pode comprar, porque atras da camera esta a
    // TV. Escrever so quando muda evita recalcular a projecao a cada quadro.
    const fovAlvo = FOV_PORAO + (FOV_PE - FOV_PORAO) * _ctxAtor.levantar
    const trocouAsp = Math.abs(camPorao.aspect - asp) > 0.0001
    const trocouFov = Math.abs(camPorao.fov - fovAlvo) > 0.01
    if (trocouAsp || trocouFov) {
      camPorao.aspect = asp
      camPorao.fov = fovAlvo
      camPorao.updateProjectionMatrix()
    }
    const k = suave(Math.min(1, tParte1 / DUR_PORAO))
    let ox = 0, oy = 0, oz = 0

    if (trancoT >= 0) {
      trancoT += d
      // TRANCO: um golpe curto de 0.45 s. A camera pula, comprime a distancia e
      // volta. Sem isso o "NAOOO" e so texto maior na tela.
      const e = batida(trancoT, 0.45)
      ox = Math.sin(trancoT * 47) * 0.045 * trancoA * e
      oy = Math.sin(trancoT * 39 + 1.1) * 0.036 * trancoA * e
      oz = -0.10 * trancoA * e
      if (trancoT > 0.45) trancoT = -1
    }

    // respiracao de operador: a camera nunca fica perfeitamente parada
    const t = tParte1
    ox += Math.sin(t * 0.63) * 0.012
    oy += Math.sin(t * 0.81 + 2.1) * 0.009

    // kp ja vem suavizado de atualizarAtores, que roda ANTES desta funcao no
    // mesmo quadro. Ler de la em vez de manter uma segunda contagem garante que
    // a camera e os quatro corpos levantem no mesmo instante.
    const kp = _ctxAtor.levantar
    const px = CAM_INI.x + (CAM_FIM.x - CAM_INI.x) * k
    const py = CAM_INI.y + (CAM_FIM.y - CAM_INI.y) * k
    const pz = CAM_INI.z + (CAM_FIM.z - CAM_INI.z) * k
    const ax = CAM_ALVO_INI.x + (CAM_ALVO_FIM.x - CAM_ALVO_INI.x) * k
    const ay = CAM_ALVO_INI.y + (CAM_ALVO_FIM.y - CAM_ALVO_INI.y) * k
    const az = CAM_ALVO_INI.z + (CAM_ALVO_FIM.z - CAM_ALVO_INI.z) * k
    camPorao.position.set(
      px + (CAM_PE.x - px) * kp + ox,
      py + (CAM_PE.y - py) * kp + oy,
      pz + (CAM_PE.z - pz) * kp + oz,
    )
    camPorao.lookAt(
      ax + (CAM_ALVO_PE.x - ax) * kp + ox * 0.25,
      ay + (CAM_ALVO_PE.y - ay) * kp + oy * 0.25,
      az + (CAM_ALVO_PE.z - az) * kp,
    )
  }

  function atualizarCameraRua() {
    if (!camera) return
    // Primeira pessoa parada: so o peito subindo e descendo. Mexer mais que
    // isso com a camera na altura dos olhos embrulha o estomago de quem ve.
    const t = tParte1 + tPasso
    const chao = CASA.y || 0
    const olhoY = chao > 1.2 ? chao : chao + PLAYER.EYE_HEIGHT
    camera.position.set(
      (CASA.x || 0) + Math.sin(t * 0.55) * 0.014,
      olhoY + Math.sin(t * 1.35) * 0.011,
      (CASA.z || 0) + Math.sin(t * 0.41 + 1.6) * 0.010,
    )
    camera.lookAt(
      CASA.olharX !== undefined ? CASA.olharX : CASA.x,
      (CASA.olharY !== undefined ? CASA.olharY : olhoY) + Math.sin(t * 0.72) * 0.03,
      CASA.olharZ !== undefined ? CASA.olharZ : (CASA.z || 0) - 6,
    )
  }

  // --- TV --------------------------------------------------------------------
  function atualizarTV(d) {
    if (!tv) return
    const t = tParte1
    // O programa muda sozinho a cada 7 s. Como sai de tParte1 (e nao de um
    // contador de frames), a troca cai no MESMO segundo em toda maquina.
    let programa = 'estatica'
    const bloco = Math.floor(t / 7.0) % 3
    if (bloco === 1) programa = 'filme'
    else if (bloco === 2) programa = 'barras'

    const quadro = Math.floor(t * TV_HZ)
    if (quadro !== ultimoQuadroTV) {
      ultimoQuadroTV = quadro
      desenharTV(tv.ctx2d, quadro, programa, _saidaTV)
      tv.tela.needsUpdate = true
      _corAlvo.setHex(_saidaTV.cor)
      _forcaTV = _saidaTV.forca
    }

    // A luz persegue a tela, mas nao instantaneamente: o fosforo de uma TV tem
    // rastro, e sem esse rastro o chiado vira estroboscopio de balada.
    const k = 1 - Math.exp(-16 * d)
    _corTV.lerp(_corAlvo, k)
    tv.luz.color.copy(_corTV)
    tv.luz.intensity += (_forcaTV * TV_GANHO - tv.luz.intensity) * k
    tv.matTela.emissiveIntensity = 1.15 + Math.min(1.2, _forcaTV * 0.14)
  }

  // --- baloes ----------------------------------------------------------------
  // Folga minima entre o balao e a borda da tela. O balao e ancorado pelo bico
  // (translate -50%,-100%), entao ele ocupa espaco PRA CIMA e pros dois lados
  // do ponto projetado.
  const MARG_X = 190
  const MARG_TOPO = 130
  const MARG_BASE = 120

  /**
   * Segue um ponto 3D na tela, mas NUNCA deixa o balao sair do quadro.
   *
   * Sem o grampo a fala simplesmente sumia em dois casos reais: a TV
   * respondendo o jogador sozinho (a ancora dela fica quase embaixo da lente
   * quando a camera ja avancou) e o balao do coro no plano mais fechado. O
   * texto continua no rodape nesses casos, mas balao que pisca pra fora da
   * tela parece bug, nao direcao.
   */
  function projetar(el, x, y, z, cam, sacode) {
    _v.set(x, y, z).project(cam)
    const L = window.innerWidth
    const A = window.innerHeight
    let px, py
    if (_v.z > 1) {
      // atras da camera a projecao vem espelhada: nao da pra confiar nela,
      // entao o balao vai pro rodape, onde o olho ja procura fala
      px = L * 0.5
      py = A * 0.78
    } else {
      // em janela estreita a folga fixa passaria do meio da tela e o grampo
      // inverteria (min < max), entao ela cede antes disso
      const mx = Math.min(MARG_X, L * 0.28)
      px = Math.min(Math.max((_v.x * 0.5 + 0.5) * L, mx), L - mx)
      py = Math.min(Math.max((-_v.y * 0.5 + 0.5) * A, MARG_TOPO), A - MARG_BASE)
    }
    el.classList.add('on')
    el.style.left = px + 'px'
    el.style.top = py + 'px'
    el.style.transform = sacode
      ? 'translate(-50%,-100%) translate(' + sacode.x.toFixed(1) + 'px,' + sacode.y.toFixed(1) + 'px)'
      : 'translate(-50%,-100%)'
  }

  const _sacode = { x: 0, y: 0 }

  function atualizarBaloes(passo) {
    if (!camada) return
    if (parte === 2) {
      // A parte 2 deixou de ser primeira pessoa: o anfitriao esta na fila, de
      // costas, e o balao pode sair da cabeca dele como sai no porao. So cai
      // pro rodape se, por algum motivo, nao houver corpo (cutscene chamada sem
      // elenco).
      const b = camada.baloes[0]
      if (!b.el.classList.contains('on')) return
      const anf2 = anfitriao()
      if (anf2 && camera) {
        b.el.classList.remove('fixo')
        projetar(b.el, anf2.x, anf2.cabecaY + 0.42, anf2.z, camera, null)
      } else {
        b.el.classList.add('fixo')
        b.el.style.transform = 'translate(-50%,-100%)'
      }
      return
    }
    if (!camPorao) return
    // sem fala neste passo nao ha o que seguir, e projetar aqui reacenderia um
    // balao que mostrarFala acabou de apagar
    if (!textoDo(passo, nJog)) return
    const anf = anfitriao()
    if (passo.quem === 'anf' && anf) {
      const b = camada.baloes[0]
      projetar(b.el, anf.x, anf.cabecaY + 0.36, anf.z, camPorao, null)
    } else if (passo.quem === 'coro' || passo.quem === 'todos') {
      // O balao do coro sacode: e uma unica batida decaindo, igual a da camera,
      // pro grito na tela e o tranco da imagem baterem no mesmo instante.
      const tf = tPasso
      const e = batida(tf, 0.55)
      _sacode.x = Math.sin(tf * 44) * 9 * e
      _sacode.y = Math.sin(tf * 37 + 0.8) * 7 * e
      // O balao do coro sai de cima do GRUPO, sempre — inclusive quando ha um
      // jogador so, que agora responde a si mesmo (ver mostrarFala). Antes ele
      // saia da TV no caso solo, o que era a piada de plateia que caiu.
      // O z tambem e a media: quando o grupo levanta, todo mundo anda meio metro
      // pra frente e um balao ancorado no sofa vazio ficaria pra tras deles.
      let ax = 0, az = 0, ay = 0
      for (const a of atores) { ax += a.x; ay += a.cabecaY; az += a.z }
      ax /= atores.length
      az /= atores.length
      ay = ay / atores.length + 0.62
      projetar(camada.coro.el, ax, ay, az, camPorao, _sacode)
    }
  }

  // --- laco ------------------------------------------------------------------
  // Os dois rascunhos abaixo sao preenchidos e lidos a cada quadro. Objeto
  // literal aqui dentro seria um descarte por quadro (ou quatro, um por ator)
  // pelos 36 segundos da cutscene inteira.
  const _cena = { quem: '', animado: false, pensando: false, coro: false, reacaoBase: 0 }
  const _ctxAtor = {
    falando: false, reacao: 0, animado: false, pensando: false, levantar: 0,
    olharX: 0, olharY: 0, olharZ: 0,
  }

  // LEVANTAR: 0 todo mundo sentado, 1 todo mundo em pe.
  //
  // E um valor SO pra cena inteira, e nao um por ator, de proposito: o pedido
  // era "todos vao falar juntos e levantar juntos", e quatro cronometros
  // separados dariam quatro tempos ligeiramente diferentes — que e o oposto de
  // junto. Ele sobe em 1.15 s, que e o tempo de uma pessoa que levanta com
  // vontade (mais rapido vira teletransporte, mais devagar vira preguica).
  let levantar = 0
  const VEL_LEVANTAR = 1 / 1.15

  function atualizarAtores(d, passo) {
    const c = _cena
    c.quem = passo.quem || ''
    c.animado = !!passo.animado
    // Os tres ultimos passos da parte 1 sao os `animado`, e o primeiro deles e
    // a fala do cassino: e exatamente ali que o grupo levanta. Amarrar o
    // levantar ao passo (e nao a um cronometro proprio) mantem a coisa presa
    // ao ROTEIRO, que e quem manda no tempo desta cena.
    const alvoLev = c.animado ? 1 : 0
    if (levantar < alvoLev) levantar = Math.min(1, levantar + d * VEL_LEVANTAR)
    else if (levantar > alvoLev) levantar = Math.max(0, levantar - d * VEL_LEVANTAR)
    // suave() nas duas pontas: sair e chegar sem tranco
    _ctxAtor.levantar = levantar * levantar * (3 - 2 * levantar)
    c.pensando = passo.quem === 'pensa'
    c.coro = passo.quem === 'coro' || passo.quem === 'todos'
    // A reacao dura o COMECO do passo, nao o passo inteiro: berro segurado por
    // 3 s deixa de ser berro e vira careta parada.
    c.reacaoBase = c.coro ? Math.max(0, 1 - tPasso / 1.1) : 0
    const anf = anfitriao()
    for (const a of atores) {
      const ehAnf = a === anf
      _ctxAtor.falando = ehAnf && (passo.quem === 'anf' || passo.quem === 'todos')
      // em pe ninguem fica gesticulando "explicando": o gesto de fala e de quem
      // esta sentado argumentando
      if (_ctxAtor.levantar > 0.4) _ctxAtor.falando = false
      _ctxAtor.animado = c.animado
      _ctxAtor.pensando = c.pensando && !ehAnf
      // o anfitriao nao responde ao proprio coro (a nao ser no 'todos')
      _ctxAtor.reacao = (passo.quem === 'todos' || !ehAnf) ? c.reacaoBase : 0
      // Em pe a comemoracao e mais forte: 0.55 e o piso de quem festeja
      // sentado, com o encosto do sofa no caminho do ombro; sem sofa nenhum o
      // piso vai a 0.90, e e a diferenca entre acenar e comemorar.
      if (c.animado && passo.quem !== 'coro') {
        _ctxAtor.reacao = Math.max(_ctxAtor.reacao, 0.55 + _ctxAtor.levantar * 0.35)
      }

      // Pra onde cada um olha: quem fala olha pro grupo, o grupo olha pra quem
      // fala, e sem ninguem falando todo mundo volta pra TV — que e exatamente
      // o que quatro pessoas num porao fazem.
      // A IDEIA DE MILHAO se olha PRA CIMA, nunca pra TV.
      //
      // Sem este ramo o alvo caia no `else` la embaixo, que e a televisao — e a
      // televisao esta em z = 2.06, y = 0.94, ou seja ATRAS e ABAIXO de quem
      // acabou de levantar. Os quatro comemoravam de bracos erguidos encarando
      // o chao. Pior: o anfitriao, no passo 'todos', mirava um ponto do sofa
      // que agora esta atras dele, e o LOOK_LIMIT de 0.6 rad travava a cabeca
      // dele torta no plano mais importante da cena.
      //
      // O alvo e um ponto alto e a frente: eles olham pra ideia, nao um pro
      // outro.
      if (c.animado) {
        _ctxAtor.olharX = a.x * 0.35
        _ctxAtor.olharY = 2.30
        _ctxAtor.olharZ = 1.60
      } else if (passo.quem === 'anf' && !ehAnf) {
        _ctxAtor.olharX = anf.x; _ctxAtor.olharY = anf.cabecaY; _ctxAtor.olharZ = anf.z
      } else if (passo.quem === 'anf' && ehAnf) {
        _ctxAtor.olharX = 0; _ctxAtor.olharY = 1.20; _ctxAtor.olharZ = -1.2
      } else if (c.coro && ehAnf) {
        _ctxAtor.olharX = -0.5; _ctxAtor.olharY = 1.22; _ctxAtor.olharZ = -1.6
      } else {
        _ctxAtor.olharX = TV.x; _ctxAtor.olharY = TV.telaY; _ctxAtor.olharZ = TV.z
      }
      atualizarAtor(a, d, _ctxAtor)
    }
  }

  function atualizar(dt) {
    if (!rodando) return false
    // dt travado: uma aba que volta do background entrega 4 s de uma vez e a
    // cutscene pularia tres falas num quadro so
    const d = Math.min(Math.max(dt || 0, 0), 0.05)

    tPasso += d
    if (parte === 1) tParte1 += d

    // avanca quantos passos couberem neste quadro
    while (iPasso < ROTEIRO.length && tPasso >= ROTEIRO[iPasso].d) {
      tPasso -= ROTEIRO[iPasso].d
      fadeAtual = fadePara
      iPasso++
      if (iPasso >= ROTEIRO.length) { terminar(); return false }
      entrarNoPasso(ROTEIRO[iPasso])
    }

    const passo = ROTEIRO[iPasso]
    const k = passo.d > 0 ? Math.min(1, tPasso / passo.d) : 1
    fadeAtual = fadeDe + (fadePara - fadeDe) * k
    if (camada && Math.abs(fadeAtual - fadeEscrito) > 0.001) {
      fadeEscrito = fadeAtual
      camada.preto.style.opacity = fadeAtual.toFixed(3)
    }

    if (parte === 1) {
      atualizarTV(d)
      atualizarAtores(d, passo)
      atualizarCameraPorao(d)
    } else {
      atualizarAtoresRua(d)
      atualizarCameraRua()
    }
    atualizarBaloes(passo)
    return true
  }

  function render() {
    if (!renderer) return
    if (parte === 1) {
      if (porao && camPorao) renderer.render(porao, camPorao)
    } else if (cena && camera) {
      renderer.render(cena, camera)
    }
  }

  // --- limpeza ---------------------------------------------------------------
  /**
   * Devolve os personagens. Separado de soltarPorao porque eles SOBREVIVEM ao
   * porao: na parte 2 os mesmos bonecos estao em pe na calcada.
   *
   * character.dispose() sabe quais geometrias sao DELE e quais sao do modulo (a
   * mao com dedos, por exemplo, e uma so pro jogo inteiro).
   */
  function soltarAtores() {
    for (const a of atores) {
      for (const g of a.geosProprias) g.dispose()
      a.geosProprias.length = 0
      if (a.acessorio && a.acessorio.parent) a.acessorio.parent.remove(a.acessorio)
      a.acessorio = null
      a.personagem.dispose()
    }
    atores.length = 0
  }

  function soltarPorao() {
    if (!porao) return

    // Se os atores ainda moram AQUI, eles saem primeiro: a varredura de
    // geometrias logo abaixo pega tudo que estiver dentro do porao, e o
    // character.dispose() e quem sabe o que e dele e o que e do modulo. Quando
    // a cutscene chega na rua eles ja mudaram de cena (porAtoresNaFila) e este
    // if nao dispara — la eles ainda estao em uso.
    if (atores.length && atores[0].personagem.root.parent === porao) soltarAtores()

    // Geometrias: TODAS as que sobraram nasceram aqui. Set porque as reusadas
    // (bituca, ponto de costura, fita) aparecem em varios meshes e dispose
    // repetido em cima da mesma geometria e trabalho jogado fora.
    const geos = new Set()
    porao.traverse((o) => {
      if (o.isMesh && o.geometry) geos.add(o.geometry)
      if (o.isLight && o.shadow && o.shadow.map) o.shadow.dispose()
    })
    for (const g of geos) g.dispose()

    if (tv) {
      tv.tela.dispose()
      tv.matTela.dispose()
      tv = null
    }
    // Materiais e texturas SO da cutscene. O cache de world/materials.js fica
    // de fora de proposito: quem usa concreteTex aqui usa a MESMA textura da
    // calcada da cidade.
    if (of) { of.soltar(); of = null }

    porao = null
    camPorao = null
  }

  function terminar() {
    if (terminado) return
    terminado = true
    rodando = false
    soltarPorao()
    // Os da rua: soltarPorao nao encosta neles de proposito, entao e aqui, com
    // a cutscene acabando, que eles saem. Um quadro depois main.js poe o
    // jogador de verdade exatamente na mesma posicao (ver filaDaCasa).
    soltarAtores()
    if (camada) camada.dispose()
    camada = null
    desligarTeclado()
    const cb = aoTerminar
    aoTerminar = null
    if (typeof cb === 'function') cb()
  }

  // --- teclado ---------------------------------------------------------------
  function aoTeclar(e) {
    if (e.code === 'Escape' || e.code === 'Space' || e.key === 'Escape' || e.key === ' ') {
      e.preventDefault()
      pular()
    }
  }
  function ligarTeclado() { window.addEventListener('keydown', aoTeclar) }
  function desligarTeclado() { window.removeEventListener('keydown', aoTeclar) }

  /** Corta pro fim. A camera da parte 2 e posta ANTES de sair, senao quem pula
   *  no meio do porao devolve o controle com a camera olhando pro nada. */
  function pular() {
    if (!rodando || terminado) return
    if (parte !== 2) entrarNaParte2()
    atualizarCameraRua()
    if (camada) camada.preto.style.opacity = '0'
    terminar()
  }

  // --- inicio ----------------------------------------------------------------
  function iniciar(cb) {
    if (rodando || terminado) return
    aoTerminar = typeof cb === 'function' ? cb : null
    montarPorao()
    camada = criarCamada(2)
    rodando = true
    iPasso = 0
    tPasso = 0
    tParte1 = 0
    parte = 1
    fadeDe = fadePara = fadeAtual = 0
    ligarTeclado()
    entrarNoPasso(ROTEIRO[0])
    // primeiro quadro da TV ja desenhado: a cena nao pode abrir com a tela preta
    atualizarTV(0.016)
  }

  function dispose() {
    // Cutscene ABORTADA (dispose no meio) devolve a camera; cutscene que
    // terminou sozinha NAO — depois do aoTerminar quem manda na camera e o
    // main.js, e repor a posicao velha aqui atropelaria o spawn do jogador.
    const abortada = rodando && !terminado
    rodando = false
    aoTerminar = null
    soltarPorao()
    // E soltarAtores TAMBEM aqui, e nao so em terminar(): depois que a cena vai
    // pra rua os bonecos moram na cena do JOGO, entao soltarPorao nao encosta
    // neles de proposito. Quem aborta a cutscene no meio (fluxo.jogar, F8, um
    // segundo comecarPartida) passa por dispose e nao por terminar — sem esta
    // linha, quatro pessoas ficavam paradas na calcada pelo resto da partida.
    soltarAtores()
    if (camada) camada.dispose()
    camada = null
    desligarTeclado()
    if (abortada && camSalva.tem && camera) {
      camera.position.set(camSalva.x, camSalva.y, camSalva.z)
      camera.rotation.set(camSalva.rx, camSalva.ry, camSalva.rz)
      camSalva.tem = false
    }
    terminado = true
  }

  return {
    iniciar,
    atualizar,
    render,
    pular,
    dispose,
    get rodando() { return rodando },
    // 1 = porao (cena minha), 2 = rua (cena do jogo). Exposto pra quem integra
    // poder mandar a PARTE 2 pelo composer do engine em vez de por este
    // render(): daqui so da pra chamar renderer.render(), entao a cidade sai
    // sem bloom e sem o acabamento de cor do resto do jogo.
    get parte() { return parte },
  }
}

export default criarAbertura
