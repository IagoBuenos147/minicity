import * as THREE from 'three'
import { solid, stdMat, tex } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/player/roupas.js — os catalogos de ROUPA, no mesmo padrao dos catalogos
// de rosto do appearance.js: array de { id, nome, esconde?, build(ctx) }.
//
// Regras deste arquivo:
//
// 1. TUDO NASCE NOVO A CADA build(). Nada de geometria de modulo compartilhada
//    entre bonecos: character.js da dispose() no que sai do slot, e uma
//    geometria compartilhada morreria na troca de roupa de UM jogador levando
//    a roupa de todos os outros junto. Material e textura, sim, sao cacheados
//    (materials.js) — esses ninguem descarta.
//
// 2. `esconde` lista os pedacos de PELE que a peca cobre ('torso', 'peito',
//    'braco', 'antebraco', 'coxa', 'canela', 'pe'). O corpo por baixo some:
//    e o que impede a pele de atravessar o tecido e ainda economiza o corpo
//    inteiro em 20 bonecos na tela.
//
// 3. O build recebe o ctx do character.js e devolve UM Object3D no espaco da
//    ancora do slot (torso, hips, head, foot...). O que precisa de outra junta
//    — a outra perna, o outro braco, o outro pe — vai por ctx.montar(obj,
//    'nomeDaParte'), que pendura na junta certa e registra pra limpeza.
//
// Indice 0 e sempre "nenhum"/"descalco" (tabela do PERSONAGEM.md); CALCAS e a
// unica excecao, porque calca nenhuma nao e uma opcao de vestuario: o indice 0
// dela e o jeans, que e o padrao.
// ---------------------------------------------------------------------------

function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Escurece/clareia uma cor (sombra de tecido, sola, barra). */
function esc(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex()
}

const tecido = (cor, r = 0.9) => solid(cor, r, 0.0)
const couro = (cor) => solid(cor, 0.42, 0.08)
// Metal com metalness BAIXA de proposito: a cena nao tem environment map, e
// metal quase puro sem reflexo pra refletir sai preto (a cruz de prata sumia
// no peito). 0.35 mantem o brilho especular do sol e a cor legivel.
const metal = (cor) => solid(cor, 0.26, 0.35)

function malha(geo, mat, x = 0, y = 0, z = 0) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(x, y, z)
  return m
}

/** Cilindro com a junta no MEIO (a posicao ja entra como centro). */
function tubo(rTop, rBot, h, mat, seg = 14, aberto = false) {
  return malha(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, aberto), mat)
}

function caixa(w, h, d, mat) {
  return malha(new THREE.BoxGeometry(w, h, d), mat)
}

function bola(r, mat, seg = 12) {
  return malha(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat)
}

function anel(r, t, mat, seg = 8, volta = 18) {
  return malha(new THREE.TorusGeometry(r, t, seg, volta), mat)
}

/** Bloco de cantos redondos barato (o roundedBox de materials.js custa caro). */
function bloco(w, h, d, r, mat) {
  const g = new THREE.SphereGeometry(1, 10, 6)
  // esfera esticada com os polos achatados le como bloco arredondado a 3 m e
  // gasta 1/3 dos triangulos de um ExtrudeGeometry com bevel
  const pos = g.attributes.position
  const k = 1 - Math.min(0.85, r / Math.max(w, h, d))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const f = (v) => Math.sign(v) * Math.min(1, Math.abs(v) / Math.max(1e-4, k))
    pos.setXYZ(i, f(x) * w / 2, f(y) * h / 2, f(z) * d / 2)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return sh(new THREE.Mesh(g, mat))
}

// ===========================================================================
// CHAPEUS — ancora: head (origem no CENTRO do cranio, +Z = frente)
// ===========================================================================

// Raio de apoio da copa: a cabeca tem 8 formatos e todos cabem dentro deste
// elipsoide com folga. Chapeu que encosta na pele some no cranio comprido.
function apoio(c) {
  const H = c.medida.HEAD
  return { rx: H.rx * 1.06, ry: H.ry, rz: H.rz * 1.06 }
}

/**
 * Calota que segue o cranio: esfera cortada em thetaMax e escalada nos raios da
 * cabeca, entao a borda cai naturalmente na altura certa.
 * Devolve { mesh, y, r }: onde a borda parou e com que raio.
 */
function calota(H, mat, thetaMax, folga = 1.03, wSeg = 22, hSeg = 12) {
  const m = sh(new THREE.Mesh(
    new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, thetaMax), mat,
  ))
  m.scale.set(H.rx * folga, H.ry * folga, H.rz * folga)
  const y = H.ry * folga * Math.cos(thetaMax)
  return { mesh: m, y, r: H.rx * folga * Math.sin(thetaMax) }
}

export const CHAPEUS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'chapeu',
    nome: 'Chapeu',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0x4a4038, 0.85)
      const faixa = tecido(0x2a2320, 0.8)
      const aba = tubo(A.rx * 1.62, A.rx * 1.72, 0.014, m, 22)
      aba.position.y = A.ry * 0.50
      aba.scale.z = 0.94
      g.add(aba)
      const copa = tubo(A.rx * 1.02, A.rx * 1.14, 0.115, m, 20)
      copa.position.y = A.ry * 0.50 + 0.058
      g.add(copa)
      const fita = tubo(A.rx * 1.16, A.rx * 1.16, 0.026, faixa, 20)
      fita.position.y = A.ry * 0.50 + 0.020
      g.add(fita)
      return g
    },
  },
  {
    id: 'bone',
    nome: 'Bone',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0xb03a3a, 0.9)
      // A copa e uma calota do PROPRIO cranio: meia esfera solta sobrava 2 cm
      // em volta e o bone lia como chapeu-coco. A folga de 9% e o minimo pra
      // cobrir o CABELO (a casca do cabelo curto ja e 1.078 do cranio) — sem
      // ela as mechas atravessam o pano.
      const copa = calota(A, m, 1.25, 1.13)
      g.add(copa.mesh)
      // aba: meio disco saindo pra frente, na altura em que a copa termina
      // Meia lua ESTREITA e comprida: o meio disco de raio grande da primeira
      // versao passava dos dois lados da cabeca e o bone virava chapeu-coco.
      const aba = sh(new THREE.Mesh(
        new THREE.CylinderGeometry(copa.r, copa.r, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), m,
      ))
      aba.scale.set(0.92, 1, 1.30)
      // logo ABAIXO da borda da copa e adiantada em Z: a aresta reta do meio
      // disco fica escondida dentro da copa em vez de cortar a superficie dela
      aba.position.set(0, copa.y - 0.006, 0.048)
      aba.rotation.x = 0.04
      g.add(aba)
      const botao = bola(0.014, tecido(esc(0xb03a3a, 0.7)), 8)
      botao.position.y = A.ry * 1.06
      g.add(botao)
      return g
    },
  },
  {
    id: 'gorro',
    nome: 'Gorro',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0x3d5c8a
      const m = tecido(cor, 0.95)
      // theta 1.17 para a ~10 cm acima do centro da cabeca: acima da
      // sobrancelha (y = 0.128) o gorro e gorro, abaixo dela vira capacete
      const copa = calota(A, m, 1.17, 1.14)
      g.add(copa.mesh)
      const barra = anel(copa.r * 0.99, 0.020, tecido(esc(cor, 1.18), 0.95), 8, 22)
      barra.rotation.x = Math.PI / 2
      barra.scale.set(1, 1, A.rz / A.rx)
      barra.position.y = copa.y
      g.add(barra)
      return g
    },
  },
  {
    id: 'cowboy',
    nome: 'Cowboy',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const m = tecido(0x8a6a3e, 0.9)
      const aba = tubo(A.rx * 2.05, A.rx * 2.15, 0.014, m, 24)
      aba.position.y = A.ry * 0.46
      // pontas viradas pra cima: a aba e um cone MUITO aberto (rTop < rBot) e a
      // borda grossa por cima faz o vinco que o chapeu de cowboy tem
      g.add(aba)
      const borda = anel(A.rx * 2.10, 0.016, m, 6, 24)
      borda.rotation.x = Math.PI / 2
      borda.position.y = A.ry * 0.46 + 0.012
      borda.scale.y = 0.55
      g.add(borda)
      const copa = tubo(A.rx * 1.00, A.rx * 1.16, 0.155, m, 20)
      copa.position.y = A.ry * 0.46 + 0.078
      g.add(copa)
      const vinco = caixa(A.rx * 0.30, 0.06, A.rz * 1.9, tecido(esc(0x8a6a3e, 0.78)))
      vinco.position.y = A.ry * 0.46 + 0.140
      g.add(vinco)
      const fita = tubo(A.rx * 1.13, A.rx * 1.16, 0.026, couro(0x2e2018), 20)
      fita.position.y = A.ry * 0.46 + 0.020
      g.add(fita)
      return g
    },
  },
  {
    id: 'touca',
    nome: 'Touca com pompom',
    build(c) {
      const A = apoio(c)
      const g = new THREE.Group()
      const cor = 0xc9c2b4
      const m = tecido(cor, 0.98)
      const copa = calota(A, m, 1.20, 1.16, 20, 14)
      copa.mesh.position.y = 0.014
      g.add(copa.mesh)
      const barra = anel(copa.r * 0.99, 0.024, tecido(esc(cor, 0.86), 0.98), 8, 22)
      barra.rotation.x = Math.PI / 2
      barra.scale.set(1, 1, A.rz / A.rx)
      barra.position.y = copa.y + 0.014
      g.add(barra)
      const pom = bola(0.042, tecido(esc(cor, 1.05), 1.0), 10)
      pom.position.y = A.ry * 1.10
      g.add(pom)
      return g
    },
  },
]

// ===========================================================================
// CALCADOS — ancora: footR (o par sai por ctx.montar em footL)
// ===========================================================================
// Espaco do pe: origem no TORNOZELO, chao em medida.SOLA_Y, +Z = frente.

/** Monta o mesmo sapato nos dois pes (o pe e simetrico em X, nao precisa espelhar). */
function par(c, fabrica) {
  const d = fabrica()
  c.montar(fabrica(), 'footL')
  return d
}

function sapatoBase(c, o) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // A sola fica MAIOR e mais baixa que o corpo do sapato de proposito: e a
  // borda escura em volta que faz o pe ler como calcado e nao como bloco.
  const topoSola = S + o.solaH * 1.5
  const corpo = bloco(o.larg, o.alt, o.comp, o.raio, o.mat)
  corpo.position.set(0, topoSola + o.alt / 2, o.frente)
  g.add(corpo)
  const sola = bloco(o.larg * 1.07, o.solaH * 2.2, o.comp * 1.05, o.solaH, o.matSola)
  sola.position.set(0, S + o.solaH * 1.05, o.frente)
  g.add(sola)
  return g
}

/** Biqueira: volume achatado na frente do sapato, EMENDADO no corpo. Antes era
 *  uma esfera solta e lia como bola de gude colada na ponta do pe. */
function biqueira(c, o, mat) {
  const b = bloco(o.larg * 0.90, o.alt * 0.62, o.comp * 0.36, o.raio * 0.8, mat)
  b.position.set(0, c.medida.SOLA_Y + o.solaH * 1.5 + o.alt * 0.30, o.frente + o.comp * 0.33)
  return b
}

export const CALCADOS = [
  { id: 'descalco', nome: 'Descalco', build() { return null } },
  {
    id: 'tenis',
    nome: 'Tenis',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const cor = c.cor.calcado
        const o = {
          larg: 0.100, alt: 0.076, comp: 0.230, raio: 0.030, frente: 0.038,
          solaH: 0.015, mat: tecido(cor, 0.6), matSola: tecido(esc(cor, 0.34), 0.9),
        }
        const g = sapatoBase(c, o)
        g.add(biqueira(c, o, o.mat))
        const laceM = tecido(esc(cor, 0.58), 0.8)
        const S = c.medida.SOLA_Y
        for (let i = 0; i < 3; i++) {
          const l = caixa(0.048, 0.008, 0.012, laceM)
          l.position.set(0, S + 0.094 - i * 0.008, 0.030 + i * 0.032)
          g.add(l)
        }
        return g
      })
    },
  },
  {
    id: 'bota',
    nome: 'Bota',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const cor = 0x5a3c22
        const m = couro(cor)
        const o = {
          larg: 0.102, alt: 0.086, comp: 0.225, raio: 0.026, frente: 0.034,
          solaH: 0.020, mat: m, matSola: tecido(esc(cor, 0.28), 0.95),
        }
        const g = sapatoBase(c, o)
        const cano = tubo(0.058, 0.066, 0.135, m, 14)
        cano.position.set(0, S + 0.155, -0.012)
        cano.scale.z = 1.15
        g.add(cano)
        const dobra = anel(0.058, 0.010, couro(esc(cor, 1.25)), 6, 14)
        dobra.rotation.x = Math.PI / 2
        dobra.scale.y = 1.15
        dobra.position.set(0, S + 0.216, -0.012)
        g.add(dobra)
        return g
      })
    },
  },
  {
    id: 'social',
    nome: 'Sapato social',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        // preto puro some na sombra: 0x2b2830 ainda le como sapato preto e
        // mantem a forma visivel no fim da tarde
        const m = solid(0x2b2830, 0.24, 0.10)
        const o = {
          larg: 0.088, alt: 0.062, comp: 0.248, raio: 0.020, frente: 0.046,
          solaH: 0.011, mat: m, matSola: tecido(0x4a3f34, 0.9),
        }
        const g = sapatoBase(c, o)
        // bico fino e comprido: e o que separa social de tenis na silhueta
        const bico = bloco(0.052, 0.036, 0.086, 0.018, m)
        bico.position.set(0, c.medida.SOLA_Y + o.solaH * 1.5 + 0.018, o.frente + 0.094)
        g.add(bico)
        return g
      })
    },
  },
  {
    id: 'chinelo',
    nome: 'Chinelo',
    // O chinelo esconde o pe padrao e desenha o SEU: a sola precisa entrar
    // debaixo do pe, e o pe do corpo ja nasce plantado no chao.
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const S = c.medida.SOLA_Y
        const g = new THREE.Group()
        const pele = solid(c.cor.pele, 0.68, 0.0)
        const sola = bloco(0.096, 0.024, 0.228, 0.012, tecido(0x2f3a4a, 0.85))
        sola.position.set(0, S + 0.012, 0.034)
        g.add(sola)
        const pe = bloco(0.082, 0.068, 0.185, 0.030, pele)
        pe.position.set(0, S + 0.024 + 0.034, 0.028)
        g.add(pe)
        const dedos = bola(1, pele, 10)
        dedos.scale.set(0.038, 0.020, 0.026)
        dedos.position.set(0, S + 0.040, 0.112)
        g.add(dedos)
        // tiras POR CIMA do peito do pe (y do topo do bloco do pe): 2 cm mais
        // baixo elas somem dentro do proprio pe
        const m = tecido(0x1d2530, 0.8)
        for (const sgn of [1, -1]) {
          const t = caixa(0.013, 0.011, 0.098, m)
          t.position.set(sgn * 0.023, S + 0.088, 0.076)
          t.rotation.set(0.30, -sgn * 0.44, 0)
          g.add(t)
        }
        const dedeira = caixa(0.010, 0.030, 0.010, m)
        dedeira.position.set(0, S + 0.048, 0.108)
        g.add(dedeira)
        return g
      })
    },
  },
  {
    id: 'cano-alto',
    nome: 'Tenis cano alto',
    esconde: ['pe'],
    build(c) {
      return par(c, () => {
        const cor = c.cor.calcado
        const S = c.medida.SOLA_Y
        const o = {
          larg: 0.100, alt: 0.072, comp: 0.226, raio: 0.028, frente: 0.036,
          solaH: 0.017, mat: tecido(cor, 0.6), matSola: tecido(esc(cor, 0.30), 0.9),
        }
        const g = sapatoBase(c, o)
        g.add(biqueira(c, o, o.mat))
        const cano = tubo(0.056, 0.064, 0.100, tecido(cor, 0.65), 14)
        cano.position.set(0, S + 0.136, -0.008)
        cano.scale.z = 1.12
        g.add(cano)
        const laceM = tecido(esc(cor, 0.52), 0.8)
        for (let i = 0; i < 4; i++) {
          const l = caixa(0.044, 0.007, 0.011, laceM)
          l.position.set(0, S + 0.152 - i * 0.026, 0.026 + i * 0.010)
          g.add(l)
        }
        return g
      })
    },
  },
]

// ===========================================================================
// BLUSAS — ancora: torso (o peito e as mangas vao por ctx.montar)
// ===========================================================================

/** Corpo da blusa: as MESMAS lathes da pele, em escala 1.0 (a pele e 0.965). */
function troncoTecido(c, mat, opts = {}) {
  const g = new THREE.Group()
  const s = opts.folga || 1.0
  const pelvis = sh(new THREE.Mesh(c.lathe(opts.perfilBaixo || c.perfil.PELVIS), mat))
  pelvis.scale.set(s, 1, s)
  g.add(pelvis)
  const peito = sh(new THREE.Mesh(c.lathe(opts.perfilCima || c.perfil.PEITO), mat))
  peito.scale.set(s, 1, s)
  c.montar(peito, 'chest')
  return g
}

/** Barra reta colada na cintura (os raios sao os do perfil naquelas alturas). */
function barra(mat, y0 = -0.012, y1 = 0.014, r0 = 0.1238, r1 = 0.1283, flatZ = 0.76, seg = 24) {
  const m = malha(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true), mat)
  m.scale.set(1.010, 1, flatZ * 1.010)
  m.position.y = (y0 + y1) / 2
  return m
}

/** Gola: anel fino tampando o decote aberto da lathe do peito. */
function gola(mat, y = 0.203, r = 0.070, t = 0.012) {
  const m = anel(r, t, mat, 8, 22)
  m.rotation.x = Math.PI / 2
  m.scale.z = 0.80
  m.position.y = y
  return m
}

/** Manga curta (perfil unico: domo + tubo + bainha), nos dois ombros. */
function mangaCurta(c, mat) {
  for (const lado of ['armRUpper', 'armLUpper']) {
    c.montar(sh(new THREE.Mesh(c.lathe(c.perfil.MANGA, 1, 18), mat)), lado)
  }
}

/** Manga comprida: a curta + tubo no braco e no antebraco. */
function mangaLonga(c, mat, r = 0.052, punho) {
  mangaCurta(c, mat)
  const U = c.medida.UPPER_ARM, F = c.medida.FORE_ARM
  for (const s of ['R', 'L']) {
    const braco = tubo(r, r * 0.95, U - 0.05, mat, 14)
    braco.position.y = -(U - 0.05) / 2 - 0.030
    c.montar(braco, 'arm' + s + 'Upper')
    const ante = tubo(r * 0.95, r * 0.88, F - 0.03, mat, 14)
    ante.position.y = -(F - 0.03) / 2
    c.montar(ante, 'arm' + s + 'Lower')
    if (punho) {
      const p = anel(r * 0.86, 0.010, punho, 6, 14)
      p.rotation.x = Math.PI / 2
      p.position.y = -F + 0.020
      c.montar(p, 'arm' + s + 'Lower')
    }
  }
}

/** Listras horizontais: a LatheGeometry tem v ao longo do perfil, entao uma
 *  textura de faixas em Y sai enrolada certinha no torso. */
function listrasMat(a, b) {
  const map = tex('blusa-listras:' + a + ':' + b, 64, (g, s) => {
    g.fillStyle = '#' + new THREE.Color(a).getHexString()
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#' + new THREE.Color(b).getHexString()
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, s, 8)
  }, 1)
  return stdMat('blusa-listrada:' + a + ':' + b, { map, roughness: 0.9, metalness: 0 })
}

export const BLUSAS = [
  // 0 = nenhuma (peito nu), como manda a tabela do contrato; a camiseta e o
  // indice 1, que e o que o defaultAppearance() pede.
  { id: 'nenhuma', nome: 'Sem blusa', build() { return null } },
  {
    id: 'camiseta',
    nome: 'Camiseta',
    esconde: ['torso', 'peito'],
    build(c) {
      const m = tecido(c.cor.blusa, 0.88)
      const escura = tecido(esc(c.cor.blusa, 0.76), 0.9)
      const g = troncoTecido(c, m)
      g.add(barra(escura, -0.012, 0.014, 0.1238, 0.1283, c.medida.FLAT_Z, c.medida.TORSO_SEG))
      c.montar(gola(escura), 'chest')
      mangaCurta(c, m)
      return g
    },
  },
  {
    id: 'social',
    nome: 'Camisa social',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const cor = esc(c.cor.blusa, 1.35)
      const m = tecido(cor, 0.72)
      const g = troncoTecido(c, m)
      // carcela de botoes descendo pela frente
      const faixa = caixa(0.030, 0.34, 0.010, tecido(esc(cor, 0.92), 0.7))
      faixa.position.set(0, 0.14, 0.104)
      g.add(faixa)
      const bt = tecido(0xe8e4dc, 0.4)
      for (let i = 0; i < 4; i++) {
        const b = malha(new THREE.CylinderGeometry(0.007, 0.007, 0.004, 8), bt, 0, 0.26 - i * 0.075, 0.111)
        b.rotation.x = Math.PI / 2
        g.add(b)
      }
      // colarinho: duas abas retas em vez do anel liso da camiseta
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.052, 0.046, 0.010, m)
        aba.position.set(sgn * 0.040, 0.192, 0.062)
        aba.rotation.set(0.30, -sgn * 0.45, sgn * 0.18)
        colar.add(aba)
      }
      colar.add(gola(m, 0.200, 0.072, 0.013))
      c.montar(colar, 'chest')
      mangaLonga(c, m, 0.051, tecido(esc(cor, 0.9), 0.7))
      return g
    },
  },
  {
    id: 'regata',
    nome: 'Regata',
    esconde: ['torso'],
    build(c) {
      const m = tecido(c.cor.blusa, 0.9)
      // peito cortado na altura da axila + duas alcas por cima do ombro
      const cima = c.perfil.PEITO.filter((p) => p[1] <= 0.115)
      const g = troncoTecido(c, m, { perfilCima: cima })
      g.add(barra(tecido(esc(c.cor.blusa, 0.8)), -0.012, 0.014, 0.1238, 0.1283,
        c.medida.FLAT_Z, c.medida.TORSO_SEG))
      // As alcas tem que nascer NA SUPERFICIE do peito (z ~ 0.09 na altura do
      // ombro), nao no eixo: em z pequeno elas ficam enterradas no torax e so
      // as pontas aparecem, feito dois adesivos soltos.
      const alcas = new THREE.Group()
      for (const sgn of [1, -1]) {
        const a = caixa(0.032, 0.140, 0.028, m)
        a.position.set(sgn * 0.070, 0.132, 0.082)
        a.rotation.set(0.10, 0, -sgn * 0.26)
        alcas.add(a)
        const b = caixa(0.032, 0.125, 0.028, m)
        b.position.set(sgn * 0.074, 0.128, -0.084)
        b.rotation.set(-0.10, 0, -sgn * 0.28)
        alcas.add(b)
      }
      c.montar(alcas, 'chest')
      return g
    },
  },
  {
    id: 'moletom',
    nome: 'Moletom',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const cor = esc(c.cor.blusa, 0.85)
      const m = tecido(cor, 0.96)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = troncoTecido(c, m, { folga: 1.045 })
      // punho e barra canelados: e o que faz o moletom nao virar camiseta larga
      g.add(barra(rib, -0.030, 0.020, 0.128, 0.134, c.medida.FLAT_Z, c.medida.TORSO_SEG))
      c.montar(gola(rib, 0.198, 0.074, 0.016), 'chest')
      mangaLonga(c, m, 0.056, rib)
      const bolso = caixa(0.150, 0.070, 0.020, tecido(esc(cor, 0.94), 0.96))
      bolso.position.set(0, 0.075, 0.098)
      g.add(bolso)
      return g
    },
  },
  {
    id: 'listrada',
    nome: 'Listrada',
    esconde: ['torso', 'peito'],
    build(c) {
      const m = listrasMat(c.cor.blusa, esc(c.cor.blusa, 0.45))
      const g = troncoTecido(c, m)
      g.add(barra(tecido(esc(c.cor.blusa, 0.45)), -0.012, 0.014, 0.1238, 0.1283,
        c.medida.FLAT_Z, c.medida.TORSO_SEG))
      c.montar(gola(tecido(esc(c.cor.blusa, 0.45)), 0.203, 0.070, 0.012), 'chest')
      mangaCurta(c, m)
      return g
    },
  },
]

// ===========================================================================
// CALCAS — ancora: hips (as pernas vao por ctx.montar)
// ===========================================================================

/** Cos: faixa curta em volta do quadril, no mesmo perfil do corpo. */
function cos(c, mat, y = 0.012, h = 0.075, r = 0.132) {
  const m = tubo(r, r * 0.985, h, mat, c.medida.TORSO_SEG, true)
  m.scale.z = c.medida.FLAT_Z
  m.position.y = y
  return m
}

/**
 * Perna de tecido: tubo na coxa e outro na canela, montados nas juntas certas
 * (senao a calca fica parada no ar enquanto a perna anda).
 * frac = quanto da perna a peca cobre (1 = ate o tornozelo).
 */
function pernas(c, mat, o) {
  const T = c.medida.THIGH, S = c.medida.SHIN
  for (const lado of ['R', 'L']) {
    const coxaH = T * (o.coxaFrac === undefined ? 1 : o.coxaFrac) + 0.03
    const coxa = tubo(o.rCoxaTopo, o.rCoxa, coxaH, mat, 14)
    coxa.position.y = -coxaH / 2 + 0.02
    c.montar(coxa, 'leg' + lado + 'Upper')
    if (o.canelaFrac > 0) {
      const canelaH = S * o.canelaFrac
      const canela = tubo(o.rCoxa * 0.97, o.rCanela, canelaH + 0.03, mat, 14)
      canela.position.y = -canelaH / 2
      c.montar(canela, 'leg' + lado + 'Lower')
      if (o.punho) {
        const p = anel(o.rCanela * 0.9, 0.011, o.punho, 6, 14)
        p.rotation.x = Math.PI / 2
        p.position.y = -canelaH + 0.006
        c.montar(p, 'leg' + lado + 'Lower')
      }
    }
  }
}

function cinto(c, cor) {
  const g = new THREE.Group()
  const m = couro(cor)
  const faixa = tubo(0.134, 0.134, 0.030, m, c.medida.TORSO_SEG, true)
  faixa.scale.z = c.medida.FLAT_Z
  faixa.position.y = 0.040
  g.add(faixa)
  const fivela = caixa(0.036, 0.026, 0.012, metal(0xc9b273))
  fivela.position.set(0, 0.040, 0.104)
  g.add(fivela)
  return g
}

export const CALCAS = [
  {
    id: 'jeans',
    nome: 'Jeans',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = 0x3f5473
      const m = tecido(cor, 0.95)
      const g = new THREE.Group()
      g.add(cos(c, m))
      g.add(cinto(c, 0x3a2a1c))
      pernas(c, m, {
        rCoxaTopo: 0.070, rCoxa: 0.060, rCanela: 0.052, canelaFrac: 0.96,
        punho: tecido(esc(cor, 0.85), 0.95),
      })
      return g
    },
  },
  {
    id: 'bermuda',
    nome: 'Bermuda',
    build(c) {
      const m = tecido(c.cor.calca, 0.92)
      const g = new THREE.Group()
      g.add(cos(c, m, 0.010, 0.085, 0.134))
      // so a coxa: a canela fica de fora, entao nada de esconder a pele dela
      pernas(c, m, { rCoxaTopo: 0.076, rCoxa: 0.072, canelaFrac: 0, coxaFrac: 0.62 })
      return g
    },
  },
  {
    id: 'social',
    nome: 'Calca social',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 0.72)
      const m = tecido(cor, 0.7)
      const g = new THREE.Group()
      g.add(cos(c, m))
      g.add(cinto(c, 0x1d1a18))
      pernas(c, m, {
        rCoxaTopo: 0.066, rCoxa: 0.056, rCanela: 0.050, canelaFrac: 0.98,
      })
      // vinco da frente
      for (const lado of ['R', 'L']) {
        const v = caixa(0.010, c.medida.SHIN * 0.9, 0.010, tecido(esc(cor, 1.2), 0.7))
        v.position.set(0, -c.medida.SHIN * 0.48, 0.050)
        c.montar(v, 'leg' + lado + 'Lower')
      }
      return g
    },
  },
  {
    id: 'jogger',
    nome: 'Jogger',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 1.15)
      const m = tecido(cor, 0.96)
      const rib = tecido(esc(cor, 0.8), 0.98)
      const g = new THREE.Group()
      g.add(cos(c, m, 0.014, 0.080, 0.136))
      const cordao = anel(0.030, 0.006, rib, 6, 12)
      cordao.rotation.x = Math.PI / 2
      cordao.position.set(0, -0.014, 0.100)
      g.add(cordao)
      pernas(c, m, {
        rCoxaTopo: 0.080, rCoxa: 0.070, rCanela: 0.048, canelaFrac: 0.90, punho: rib,
      })
      return g
    },
  },
  {
    id: 'shorts',
    nome: 'Shorts',
    build(c) {
      const m = tecido(esc(c.cor.calca, 1.3), 0.9)
      const g = new THREE.Group()
      g.add(cos(c, m, 0.006, 0.090, 0.136))
      pernas(c, m, { rCoxaTopo: 0.082, rCoxa: 0.080, canelaFrac: 0, coxaFrac: 0.38 })
      return g
    },
  },
  {
    id: 'moletom',
    nome: 'Calca de moletom',
    esconde: ['coxa', 'canela'],
    build(c) {
      const cor = esc(c.cor.calca, 0.9)
      const m = tecido(cor, 0.98)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = new THREE.Group()
      g.add(cos(c, m, 0.016, 0.086, 0.138))
      pernas(c, m, {
        rCoxaTopo: 0.084, rCoxa: 0.074, rCanela: 0.052, canelaFrac: 0.93, punho: rib,
      })
      return g
    },
  },
]

// ===========================================================================
// COLARES — ancora: neck (origem na base do pescoco, +Z = frente)
// ===========================================================================
// A gola do peito termina em y = +0.04 no espaco do pescoco; por isso a
// corrente fica em +0.02 (entre o pescoco e a gola) e o pingente cai pra
// frente, na superficie do peito, e nao dentro dele.

function corrente(mat, r = 0.058, t = 0.006) {
  const a = anel(r, t, mat, 6, 20)
  a.rotation.x = Math.PI / 2
  a.scale.z = 0.86
  // 5 cm acima da base do pescoco: a lathe do peito sobe ate +0.040 aqui, e
  // qualquer coisa abaixo disso fica ENTERRADA no torax
  a.position.y = 0.052
  return a
}

function pingente(g, mat, corpo) {
  const fio = tubo(0.0035, 0.0035, 0.078, mat, 6)
  fio.position.set(0, 0.000, 0.094)
  fio.rotation.x = -0.42
  g.add(fio)
  corpo.position.set(0, -0.040, 0.110)
  g.add(corpo)
}

export const COLARES = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'ouro',
    nome: 'Corrente de ouro',
    build() {
      const m = metal(0xd8b134)
      const g = new THREE.Group()
      g.add(corrente(m))
      return g
    },
  },
  {
    id: 'prata',
    nome: 'Corrente de prata',
    build() {
      const m = metal(0xc9ced4)
      const g = new THREE.Group()
      g.add(corrente(m, 0.058, 0.0045))
      return g
    },
  },
  {
    id: 'cruz',
    nome: 'Cruz',
    build() {
      const m = metal(0xc9ced4)
      const g = new THREE.Group()
      g.add(corrente(m, 0.060, 0.0040))
      const cruz = new THREE.Group()
      cruz.add(caixa(0.012, 0.046, 0.007, m))
      const braco = caixa(0.032, 0.012, 0.007, m)
      braco.position.y = 0.008
      cruz.add(braco)
      cruz.rotation.x = -0.35
      pingente(g, m, cruz)
      return g
    },
  },
  {
    id: 'grosso',
    nome: 'Cordao grosso',
    build() {
      const m = metal(0xd8b134)
      const g = new THREE.Group()
      const a = anel(0.062, 0.013, m, 8, 22)
      a.rotation.x = Math.PI / 2
      a.scale.z = 0.86
      a.position.y = 0.046
      g.add(a)
      return g
    },
  },
  {
    id: 'pingente',
    nome: 'Pingente',
    build() {
      const m = metal(0xc9a227)
      const g = new THREE.Group()
      g.add(corrente(m, 0.060, 0.0045))
      const disco = malha(new THREE.CylinderGeometry(0.020, 0.020, 0.006, 14), m)
      disco.rotation.x = -Math.PI / 2 + 0.35
      pingente(g, m, disco)
      return g
    },
  },
]

// ===========================================================================
// ANEIS — ancora: handL (a mao ESQUERDA; a direita e do anel verde do poder)
// ===========================================================================
// Espaco da mao: pulso na origem, dedos descendo em -Y. Na mao esquerda os
// dedos se curvam pra +X, entao o aro entra deslocado nesse sentido.

function aro(c, dedo, mat, r = 0.0112, t = 0.0026, dy = -0.014) {
  const d = c.medida.DEDOS[dedo]
  // O aro tem que ter o RAIO DO DEDO (r - t ~ 0.0086): 3 mm a mais e ele nao
  // encosta em lugar nenhum e fica boiando no ar entre os dedos.
  const a = anel(r, t, mat, 6, 14)
  a.rotation.x = Math.PI / 2
  // 1.5 mm pro lado da palma: e quanto o dedo ja se curvou 1.4 cm abaixo do no
  a.position.set(0.0015, d.y + dy, d.z)
  return a
}

export const ANEIS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'simples',
    nome: 'Anel simples',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, 2, metal(0xc9ced4)))
      return g
    },
  },
  {
    id: 'pedra',
    nome: 'Anel com pedra',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xd8b134)
      const a = aro(c, 2, m)
      g.add(a)
      const pedra = bola(0.0058, solid(0x2f7bd6, 0.1, 0.4), 8)
      // -X e o DORSO da mao esquerda (a palma olha pra +X): a pedra fica em cima
      pedra.position.set(a.position.x - 0.010, a.position.y, a.position.z)
      g.add(pedra)
      return g
    },
  },
  {
    id: 'grosso',
    nome: 'Anel grosso',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, 2, metal(0xd8b134), 0.0122, 0.0044))
      return g
    },
  },
  {
    id: 'dois',
    nome: 'Dois aneis',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, 2, metal(0xd8b134)))
      g.add(aro(c, 1, metal(0xc9ced4), 0.0116, 0.0026, -0.016))
      return g
    },
  },
  {
    id: 'alianca',
    nome: 'Alianca',
    build(c) {
      const g = new THREE.Group()
      g.add(aro(c, 2, metal(0xe0c060), 0.0108, 0.0022))
      return g
    },
  },
]

// ===========================================================================
// TATUAGENS — pele com desenho, nao geometria nova
// ===========================================================================
// Casca fininha por cima do membro com textura de canvas transparente. Fica
// mais barato e mais flexivel que pintar um mapa novo pra cada tom de pele:
// a tinta e a mesma, a pele por baixo continua sendo a do personagem.

function tintaMat(id, desenho) {
  const map = tex('tatu:' + id, 128, desenho, 1)
  // alphaTest em vez de transparent: recorte por descarte de pixel nao entra na
  // fila de transparencia, entao a tinta nunca aparece por cima do braco errado
  return stdMat('tatu-mat:' + id, {
    map, transparent: false, alphaTest: 0.4, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide,
  })
}

/** Faixa tribal: o desenho tem que ler a 3 m, entao tracos grossos. */
function desenhoTribal(g, s) {
  g.clearRect(0, 0, s, s)
  g.strokeStyle = 'rgba(26,24,38,0.9)'
  g.lineCap = 'round'
  // Duas faixas onduladas e alguns raios. A versao densa de antes cobria a
  // textura inteira e o braco virava uma mancha preta a 3 m de distancia.
  g.lineWidth = 7
  for (let i = 0; i < 2; i++) {
    g.beginPath()
    const y = 34 + i * 58
    g.moveTo(0, y)
    for (let x = 0; x <= s; x += 12) g.lineTo(x, y + Math.sin(x * 0.16 + i * 2) * 11)
    g.stroke()
  }
  g.lineWidth = 3.5
  for (let i = 0; i < 6; i++) {
    g.beginPath()
    g.moveTo(i * 22 + 6, 70)
    g.lineTo(i * 22 + 16, 96)
    g.stroke()
  }
}

function desenhoCaveira(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = 'rgba(28,24,32,0.9)'
  g.beginPath(); g.arc(s / 2, s / 2 - 8, 30, 0, 7); g.fill()
  g.fillRect(s / 2 - 20, s / 2 + 12, 40, 24)
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.beginPath(); g.arc(s / 2 - 12, s / 2 - 10, 8, 0, 7); g.fill()
  g.beginPath(); g.arc(s / 2 + 12, s / 2 - 10, 8, 0, 7); g.fill()
  g.fillRect(s / 2 - 4, s / 2 + 4, 8, 10)
}

function desenhoEstrelas(g, s) {
  g.clearRect(0, 0, s, s)
  g.fillStyle = 'rgba(20,18,28,0.9)'
  for (let i = 0; i < 9; i++) {
    const x = (i * 37) % s, y = (i * 53) % s, r = 6 + (i % 3) * 4
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2
      const rr = k % 2 ? r * 0.45 : r
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py)
    }
    g.closePath(); g.fill()
  }
}

/** Casca aberta em volta de um membro cilindrico. */
function faixaMembro(mat, r, h, seg = 14) {
  return malha(new THREE.CylinderGeometry(r, r, h, seg, 1, true), mat)
}

/** Pedaco de casca (so um setor): acompanha a curva do peito sem espetar nele. */
function chapa(mat, r, h, arco = 1.1, seg = 10) {
  return malha(new THREE.CylinderGeometry(r, r, h, seg, 1, true, -arco / 2, arco), mat)
}

export const TATUAGENS = [
  { id: 'nenhuma', nome: 'Nenhuma', build() { return null } },
  {
    id: 'braco',
    nome: 'Braco fechado',
    build(c) {
      const m = tintaMat('tribal', desenhoTribal)
      const f = faixaMembro(m, 0.048, 0.180)
      f.position.y = -0.150
      c.montar(f, 'armRUpper')
      return null
    },
  },
  {
    id: 'antebraco',
    nome: 'Antebraco',
    build(c) {
      const m = tintaMat('estrelas', desenhoEstrelas)
      const f = faixaMembro(m, 0.0435, 0.170)
      f.position.y = -c.medida.FORE_ARM / 2
      c.montar(f, 'armRLower')
      return null
    },
  },
  {
    id: 'pescoco',
    nome: 'Pescoco',
    build(c) {
      // vai no PESCOCO e nao no peito: a ancora do slot e o torax, entao o
      // desenho precisa ser montado na junta certa pra virar com a cabeca
      const m = tintaMat('tribal', desenhoTribal)
      const f = faixaMembro(m, 0.053, 0.050, 12)
      f.position.y = 0.058
      c.montar(f, 'neck')
      return null
    },
  },
  {
    id: 'mao',
    nome: 'Mao',
    build(c) {
      const m = tintaMat('estrelas', desenhoEstrelas)
      const p = malha(new THREE.PlaneGeometry(0.050, 0.058), m)
      // costas da mao DIREITA: a palma olha pro corpo (-X), entao o dorso e +X
      p.position.set(0.0245, -0.046, 0)
      p.rotation.y = Math.PI / 2
      c.montar(p, 'handR')
      return null
    },
  },
  {
    id: 'peito',
    nome: 'Peito',
    build(c) {
      const m = tintaMat('caveira', desenhoCaveira)
      // alto do peito: e a unica faixa do torax que a regata (e o peito nu)
      // deixam a mostra — mais embaixo qualquer blusa tapa a tinta
      const p = chapa(m, 0.139, 0.105, 0.95, 10)
      p.scale.z = c.medida.FLAT_Z
      p.position.set(0, 0.150, 0)
      c.montar(p, 'chest')
      return null
    },
  },
]

// ===========================================================================
// RELOGIOS — ancora: armLLower (o PULSO esquerdo, y = -FORE_ARM)
// ===========================================================================
// Preso no antebraco e nao na mao: relogio na junta da mao gira junto com ela
// e escorrega pro meio da palma quando o punho dobra.

// O antebraco tem raio 0.041. A pulseira e um pouco MENOR que ele de proposito:
// o braco atravessa o furo e so a casca de fora aparece, que e o que se ve de
// uma pulseira no pulso. Com raio 0.045 e tubo 0.009 virava um aro de basquete.
function pulseira(c, mat, r = 0.038, t = 0.0070) {
  const a = anel(r, t, mat, 6, 16)
  a.rotation.x = Math.PI / 2
  a.position.y = -c.medida.FORE_ARM + 0.030
  return a
}

/** Caixa do relogio nas COSTAS do pulso esquerdo (lado -X). */
function mostrador(c, geo, mat) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(-0.043, -c.medida.FORE_ARM + 0.030, 0)
  m.rotation.z = Math.PI / 2
  return m
}

export const RELOGIOS = [
  { id: 'nenhum', nome: 'Nenhum', build() { return null } },
  {
    id: 'digital',
    nome: 'Digital',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, solid(0x23262b, 0.7)))
      g.add(mostrador(c, new THREE.BoxGeometry(0.030, 0.010, 0.024), solid(0x2b2f35, 0.5, 0.2)))
      const tela = mostrador(c, new THREE.BoxGeometry(0.020, 0.012, 0.016), solid(0x74d0b0, 0.3, 0.0))
      g.add(tela)
      return g
    },
  },
  {
    id: 'analogico',
    nome: 'Analogico',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, couro(0x40301f)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.017, 0.017, 0.010, 14), metal(0xb9bec4)))
      const face = mostrador(c, new THREE.CylinderGeometry(0.013, 0.013, 0.012, 14), solid(0xf0ece2, 0.4))
      g.add(face)
      return g
    },
  },
  {
    id: 'dourado',
    nome: 'Dourado',
    build(c) {
      const m = metal(0xd8b134)
      const g = new THREE.Group()
      g.add(pulseira(c, m, 0.039, 0.0085))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.019, 0.019, 0.012, 14), m))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.014, 0.014, 0.014, 14), solid(0x2b2b30, 0.3, 0.1)))
      return g
    },
  },
  {
    id: 'esportivo',
    nome: 'Esportivo',
    build(c) {
      const g = new THREE.Group()
      g.add(pulseira(c, solid(0xd8552f, 0.85), 0.039, 0.0080))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.020, 0.018, 0.014, 12), solid(0x2a2d33, 0.6)))
      g.add(mostrador(c, new THREE.CylinderGeometry(0.014, 0.014, 0.016, 12), solid(0xe8e4dc, 0.4)))
      return g
    },
  },
  {
    id: 'pulseira',
    nome: 'Pulseira',
    build(c) {
      const g = new THREE.Group()
      const m = metal(0xc9ced4)
      g.add(pulseira(c, m, 0.038, 0.0055))
      const p2 = pulseira(c, m, 0.0385, 0.0042)
      p2.position.y -= 0.018
      g.add(p2)
      return g
    },
  },
]

// ===========================================================================
// JAQUETAS — ancora: torso (peito, mangas e capuz vao por ctx.montar)
// ===========================================================================
// Vem POR CIMA da blusa: o corpo de tecido e o mesmo perfil com folga maior, e
// a peca so comeca na cintura (jaqueta nao tem saia).

function corpoJaqueta(c, mat, folga = 1.09) {
  const baixo = c.perfil.PELVIS.filter((p) => p[1] >= 0.02)
  return troncoTecido(c, mat, { folga, perfilBaixo: baixo })
}

function ziper(c, g, mat) {
  const z = caixa(0.014, 0.34, 0.012, mat)
  z.position.set(0, 0.16, 0.116)
  g.add(z)
}

export const JAQUETAS = [
  { id: 'nenhuma', nome: 'Nenhuma', build() { return null } },
  {
    id: 'jeans',
    nome: 'Jaqueta jeans',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const cor = 0x4a6288
      const m = tecido(cor, 0.95)
      const g = corpoJaqueta(c, m)
      ziper(c, g, tecido(esc(cor, 0.7), 0.9))
      const colar = new THREE.Group()
      colar.add(gola(tecido(esc(cor, 0.85), 0.95), 0.196, 0.080, 0.018))
      c.montar(colar, 'chest')
      mangaLonga(c, m, 0.058, tecido(esc(cor, 0.8), 0.95))
      return g
    },
  },
  {
    id: 'couro',
    nome: 'Jaqueta de couro',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const m = couro(0x24222a)
      const g = corpoJaqueta(c, m)
      ziper(c, g, metal(0xb9bec4))
      const colar = new THREE.Group()
      for (const sgn of [1, -1]) {
        const aba = caixa(0.060, 0.070, 0.012, m)
        aba.position.set(sgn * 0.048, 0.176, 0.072)
        aba.rotation.set(0.22, -sgn * 0.55, sgn * 0.30)
        colar.add(aba)
      }
      colar.add(gola(m, 0.194, 0.082, 0.016))
      c.montar(colar, 'chest')
      mangaLonga(c, m, 0.057, m)
      return g
    },
  },
  {
    id: 'corta-vento',
    nome: 'Corta-vento',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const cor = 0x2f7bd6
      const m = tecido(cor, 0.55)
      const g = corpoJaqueta(c, m, 1.11)
      ziper(c, g, tecido(0xe8e4dc, 0.6))
      // faixa refletiva atravessando o peito
      const faixa = sh(new THREE.Mesh(c.lathe(
        c.perfil.PEITO.filter((p) => p[1] >= 0.055 && p[1] <= 0.105), 0.76, 20,
      ), tecido(0xe8e4dc, 0.5)))
      faixa.scale.set(1.115, 1, 1.115)
      c.montar(faixa, 'chest')
      c.montar(gola(m, 0.198, 0.078, 0.015), 'chest')
      mangaLonga(c, m, 0.058, tecido(esc(cor, 0.75), 0.6))
      return g
    },
  },
  {
    id: 'capuz',
    nome: 'Moletom com capuz',
    esconde: ['torso', 'peito', 'braco', 'antebraco'],
    build(c) {
      const cor = 0x6b7280
      const m = tecido(cor, 0.98)
      const rib = tecido(esc(cor, 0.82), 0.98)
      const g = corpoJaqueta(c, m, 1.10)
      const bolso = caixa(0.160, 0.075, 0.022, tecido(esc(cor, 0.94), 0.98))
      bolso.position.set(0, 0.085, 0.100)
      g.add(bolso)
      // capuz caido nas costas: meia casca presa no PEITO (nao na cabeca, senao
      // ele viraria junto com o olhar)
      const capuz = sh(new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, 1.9), m,
      ))
      capuz.scale.set(0.115, 0.130, 0.105)
      capuz.rotation.x = 0.75
      capuz.position.set(0, 0.185, -0.070)
      c.montar(capuz, 'chest')
      c.montar(gola(rib, 0.196, 0.082, 0.017), 'chest')
      mangaLonga(c, m, 0.059, rib)
      return g
    },
  },
  {
    id: 'colete',
    nome: 'Colete',
    esconde: ['torso', 'peito'],
    build(c) {
      const m = tecido(0x3d4451, 0.9)
      const g = corpoJaqueta(c, m, 1.07)
      ziper(c, g, metal(0xb9bec4))
      // sem manga: as cavas ficam abertas, entao a pele do braco continua
      const bolsos = new THREE.Group()
      for (const sgn of [1, -1]) {
        const b = caixa(0.052, 0.046, 0.016, tecido(0x333944, 0.9))
        b.position.set(sgn * 0.070, 0.070, 0.098)
        bolsos.add(b)
      }
      g.add(bolsos)
      c.montar(gola(tecido(0x333944, 0.9), 0.196, 0.080, 0.016), 'chest')
      return g
    },
  },
]

export const CATALOGOS_ROUPA = {
  chapeu: CHAPEUS, calcado: CALCADOS, blusa: BLUSAS, calca: CALCAS,
  colar: COLARES, anelAcess: ANEIS, tatuagem: TATUAGENS, relogio: RELOGIOS,
  jaqueta: JAQUETAS,
}
