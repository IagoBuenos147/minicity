// ---------------------------------------------------------------------------
// src/world/hudson/lotes.js — o montador de lotes.
//
// A planta do quarteirao (planta.js) e uma LISTA DE DADOS: cada lote diz o seu
// tipo, a testada, as cores, os portoes e os extras. Este arquivo e o unico que
// sabe transformar esse dado em geometria.
//
// A separacao existe por um motivo pratico: a planta veio da leitura de 35
// fotos e vai mudar toda vez que se olhar melhor pra uma delas. Se cada lote
// fosse codigo, corrigir a cor de um muro seria mexer em three.js; sendo dado,
// e trocar uma string.
//
// CONTRATO. Todo lote nasce com a origem NO CHAO, no MEIO DA TESTADA, com +Z
// apontando PRA RUA. Quem chama posiciona e gira. Nenhum lote sabe onde fica.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { solid, stdMat } from '../materials.js'
import { calcadaTex, bloquete, capimTex } from './materiais.js'
import {
  casaTerrea, muro, concertina, portaoChapa, portaoGrade, parabolica,
  antenaVHF, caixaDagua, medidor,
} from './pecas-casa.js'
import {
  quadraCoberta, escola, comercio, sobradoInacabado, galpao,
  bancoDePraca, mesaDePraca, rampaDeSkate, letreiro,
} from './pecas-publico.js'
import {
  aroeiraSalsa, coqueiro, mangueira, cajueiro, tuia, moita,
  trepadeiraFlorida, capinzal, monteDeAreia, pilhaDeBlocos, entulho,
} from './pecas-verde.js'
import { lixeiraTambor, sacosDeLixo, tambor } from './pecas-infra.js'

const PI = Math.PI

function rng(seed) {
  let s = (seed | 0) >>> 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ARVORES = {
  'aroeira-salsa': aroeiraSalsa,
  coqueiro,
  mangueira,
  cajueiro,
  tuia,
  moita: (s) => moita({ raio: 0.8, seed: s }),
  'palmeira-leque': coqueiro,
}

/** Numero de porta pintado no muro, como o "200" da foto-13. */
function numeroPintado(texto) {
  const mat = stdMat('hud-num:' + texto, {
    map: (() => {
      const c = document.createElement('canvas')
      c.width = 256; c.height = 128
      const g = c.getContext('2d')
      g.clearRect(0, 0, 256, 128)
      g.fillStyle = 'rgba(46,42,38,0.78)'
      g.font = 'bold 92px Georgia, serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(texto, 128, 68)
      // pintado a mao e ja gasto
      g.globalCompositeOperation = 'destination-out'
      for (let i = 0; i < 120; i++) {
        g.globalAlpha = 0.1 + Math.random() * 0.5
        g.beginPath(); g.arc(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 5, 0, 7); g.fill()
      }
      g.globalAlpha = 1
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      return t
    })(),
    transparent: true, roughness: 0.95,
  })
  return new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.36), mat)
}

/**
 * Le a lista de `extras` (texto livre, vinda da leitura das fotos) e poe as
 * pecas correspondentes. Texto livre de proposito: quem leu as fotos escreveu
 * "parabolica branca no telhado" sem saber que funcao existe aqui, e forcar um
 * enum obrigaria a reescrever a planta toda a cada peca nova.
 */
function porExtras(g, extras, ctx) {
  if (!Array.isArray(extras)) return
  const r = ctx.r
  const { frente, alturaMuro, alturaCasa, recuo } = ctx
  // ONDE FICA O TELHADO. Parabolica e caixa d'agua tem que POUSAR na agua do
  // telhado, e nao flutuar acima da cumeeira: a versao anterior somava 0,55 m
  // a altura total da casa e as caixas d'agua azuis ficavam boiando no ceu.
  const pedireito = ctx.pedireito || 2.85
  const cumeeira = ctx.cumeeira || 1.05
  const prof = ctx.profCasa || 9
  const zCume = -recuo - prof / 2
  /** A altura da agua do telhado a `t` (0 = beiral, 1 = cumeeira). */
  const yTelhado = (t) => pedireito + cumeeira * t
  let nTelhado = 0
  for (const bruto of extras) {
    const e = String(bruto || '').toLowerCase()
    const px = (r() - 0.5) * frente * 0.6

    if (/parab/.test(e)) {
      // na agua da frente, a meio caminho do beiral pra cumeeira
      const t = 0.42 + nTelhado * 0.16
      const p = parabolica({ raio: 0.4 + r() * 0.12, malha: /tela|malha/.test(e) })
      p.position.set(px, yTelhado(t) - 0.05, zCume + (prof / 2) * (1 - t))
      g.add(p); nTelhado++
    } else if (/antena|vhf|espinha/.test(e)) {
      const a = antenaVHF({ altura: 1.2 + r() * 0.5 })
      a.position.set(px, yTelhado(0.9), zCume + prof * 0.05)
      g.add(a)
    } else if (/caixa d|caixa-d|d'agua|dagua/.test(e)) {
      // a caixa d'agua fica no ponto ALTO, encostada na cumeeira
      const c = caixaDagua({ raio: 0.5 + r() * 0.12 })
      c.position.set(px, yTelhado(0.94), zCume - prof * 0.12)
      g.add(c)
    } else if (/medidor|padrao de energia|relogio de luz/.test(e)) {
      const m = medidor()
      m.position.set(frente / 2 - 0.5, 1.55, 0.1)
      g.add(m)
    } else if (/concertina|lamina|cerca eletrica/.test(e)) {
      const c = concertina(frente, ctx.seed + 3)
      c.position.set(0, alturaMuro + 0.06, 0)
      g.add(c)
    } else if (/trepadeira|primavera|buganv|manaca|flor/.test(e)) {
      const t = trepadeiraFlorida({ largura: 1.8 + r() * 1.6, seed: ctx.seed + 5 })
      t.position.set(px, alturaMuro - 0.1, -0.15)
      g.add(t)
    } else if (/entulho|caco|restos de obra|escombro/.test(e)) {
      const t = entulho({ raio: 0.9 + r() * 0.6, n: 10 + Math.floor(r() * 8), seed: ctx.seed + 7 })
      t.position.set(px, 0, 0.75)
      g.add(t)
    } else if (/areia/.test(e)) {
      const a = monteDeAreia({ raio: 1.3 + r() * 0.6, altura: 0.7 + r() * 0.3 })
      a.position.set(px, 0, -recuo * 0.5)
      g.add(a)
    } else if (/bloco|tijolo empilhado|pilha de tijolo/.test(e)) {
      const b = pilhaDeBlocos({ fileiras: 3 + Math.floor(r() * 3), colunas: 4 + Math.floor(r() * 3), seed: ctx.seed + 9 })
      b.position.set(px, 0, 0.9)
      g.add(b)
    } else if (/lixeira|tambor verde/.test(e)) {
      const l = lixeiraTambor({ dupla: !/simples|um tambor/.test(e) })
      l.position.set(px, 0, 1.5)
      g.add(l)
    } else if (/saco de lixo|sacos de lixo|lixo no meio-fio/.test(e)) {
      const sl = sacosDeLixo({ n: 2 + Math.floor(r() * 3), seed: ctx.seed + 11 })
      sl.position.set(px, 0, 1.9)
      g.add(sl)
    } else if (/tambor enferrujado|barril/.test(e)) {
      const t = tambor({ seed: ctx.seed + 13 })
      t.position.set(px, 0, 1.2)
      g.add(t)
    } else if (/numero pintado|numero no muro/.test(e)) {
      const m = numeroPintado(ctx.numero || '000')
      m.position.set(-frente / 2 + 1.1, alturaMuro * 0.62, 0.09)
      g.add(m)
    } else if (/letreiro|placa|banner|lona/.test(e)) {
      // So entra letreiro com NOME. A versao anterior caia num 'COMERCIO'
      // generico e pendurava a placa a 3,2 m em qualquer lote — inclusive em
      // muro de casa, onde ela ficava boiando no ar.
      const m = bruto.match(/["'“‘](.+?)["'”’]/)
        || bruto.match(/([A-Z][A-ZÀ-Ü' ]{4,}[A-Z])/)
      if (m && ctx.temFachada) {
        const l = letreiro({
          texto: m[1].trim().toUpperCase(),
          largura: Math.min(frente - 1, 5.2), altura: 0.85,
        })
        l.position.set(0, Math.min(3.2, ctx.alturaCasa - 0.7), 0.1)
        g.add(l)
      }
    }
  }
}

/** As arvores declaradas no lote. */
function porArvores(g, lista, ctx) {
  if (!Array.isArray(lista)) return
  let i = 0
  for (const a of lista) {
    const f = ARVORES[a && a.especie] || aroeiraSalsa
    const t = f(ctx.seed + 40 + i * 7)
    const onde = (a && a.ondeFica) || 'calcada'
    const z = onde === 'calcada' ? 1.4
      : onde === 'recuo' ? -ctx.recuo * 0.4
        : onde === 'terreno' ? -3.5 : -ctx.recuo - 6
    t.position.set(Number(a && a.offsetX) || 0, 0, z)
    if (a && a.altura && t.userData.altura) {
      const k = a.altura / t.userData.altura
      if (k > 0.5 && k < 1.8) t.scale.setScalar(k)
    }
    g.add(t)
    i++
  }
}

/** O tapete de capim seco de praca e terreno baldio. */
function tapeteDeCapim(largura, profundidade, seed) {
  const mat = stdMat('hud-capim-mat:' + Math.round(largura), {
    map: capimTex(Math.max(2, Math.round(largura / 4))), roughness: 0.99,
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(largura, profundidade), mat)
  m.rotation.x = -PI / 2
  m.position.set(0, 0.014, -profundidade / 2 + 0.5)
  m.receiveShadow = true
  void seed
  return m
}

/** O piso do recuo: cimento queimado, ou bloquete no comercio. */
function pisoDoRecuo(frente, profundidade, tipo) {
  const mat = tipo === 'comercio'
    ? stdMat('hud-piso-bloquete', { map: bloquete(Math.max(1, frente / 3)), roughness: 0.92 })
    : stdMat('hud-piso-recuo', { map: calcadaTex(Math.max(1, frente / 3)), roughness: 0.95 })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(frente, profundidade), mat)
  m.rotation.x = -PI / 2
  m.position.set(0, 0.012, -profundidade / 2)
  m.receiveShadow = true
  return m
}

/**
 * Monta um lote inteiro.
 *
 * @param {object} spec  um item da lista de lotes da planta
 * @param {object} opts  { seed }
 * @returns {{ grupo: THREE.Group, colisores: Array, altura: number }}
 */
export function montarLote(spec, opts = {}) {
  const g = new THREE.Group()
  g.name = 'lote-' + (spec.id || '?')
  const seed = opts.seed === undefined ? 1 : opts.seed
  const r = rng(seed * 131 + 7)
  const frente = Math.max(2, Number(spec.frente) || 8)
  const tipo = spec.tipo || 'casa-com-muro'
  const colisores = []
  let altura = 3

  const cfgMuro = spec.muro || {}
  const cfgCasa = spec.casa || {}
  const cfgTel = spec.telhado || {}
  const alturaMuro = Number(cfgMuro.altura) || 2.35
  const recuo = cfgCasa.recuo === undefined ? 2.2 : Number(cfgCasa.recuo)
  const profCasa = Number(cfgCasa.profundidade) || 9
  const pedireito = Number(cfgCasa.pedireito) || 2.85

  // ------------------------------------------------------------------ casas
  if (tipo === 'casa' || tipo === 'casa-com-muro' || tipo === 'sobrado') {
    const temMuro = tipo !== 'casa' && recuo > 0.4

    if (tipo === 'sobrado') {
      const sb = sobradoInacabado({ largura: frente - (temMuro ? 0.6 : 0), profundidade: profCasa, seed })
      sb.position.z = -recuo
      g.add(sb)
      altura = sb.userData.altura + recuo * 0
    } else {
      const casa = casaTerrea({
        largura: frente - (temMuro ? 0.4 : 0),
        profundidade: profCasa,
        pedireito,
        parede: cfgCasa.parede || '#cfc7b8',
        telha: cfgTel.cor || '#b25c38',
        beiral: cfgTel.beiral === undefined ? 0.55 : Number(cfgTel.beiral),
        cumeeira: cfgTel.cumeeira === undefined ? 1.05 : Number(cfgTel.cumeeira),
        varanda: !!cfgCasa.varanda,
        umidade: temMuro ? 0.4 : 0.7,
        seed,
      })
      casa.position.z = -recuo
      g.add(casa)
      altura = casa.userData.altura
    }

    if (temMuro) {
      g.add(pisoDoRecuo(frente, recuo + 0.2, tipo))
      const portoes = Array.isArray(spec.portoes) && spec.portoes.length
        ? spec.portoes
        : [{ tipo: 'chapa-correr', largura: 2.7, altura: 2.15, offsetX: -frente / 2 + 2.0 },
          { tipo: 'grade', largura: 1.05, altura: 2.05, offsetX: frente / 2 - 1.3 }]
      const vaos = portoes.map((p) => ({
        x: Number(p.offsetX) || 0,
        largura: Number(p.largura) || 2.6,
        altura: Number(p.altura) || 2.1,
      }))
      const m = muro({
        largura: frente, altura: alturaMuro, vaos,
        cor: cfgMuro.cor || '#bcb5a8',
        pintado: !/cru|chapisco|sem pintura|aparente/.test(String(cfgMuro.acabamento || '')),
        umidade: 0.8, seed: seed + 3,
      })
      g.add(m)
      for (const p of portoes) {
        const larg = Number(p.largura) || 2.6
        const alt = Number(p.altura) || 2.1
        const x = Number(p.offsetX) || 0
        let peca
        if (p.tipo === 'grade') {
          peca = portaoGrade({ largura: larg, altura: alt, cor: 0x3c3a38 })
        } else if (p.tipo === 'madeira') {
          peca = portaoChapa({ largura: larg, altura: alt, cor: '#7a5a3a', ferrugem: 0.05, seed: seed + 6 })
        } else {
          peca = portaoChapa({
            largura: larg, altura: alt,
            cor: p.cor || '#eae7e0',
            ferrugem: p.ferrugem === undefined ? 0.22 : Number(p.ferrugem),
            correr: p.tipo === 'chapa-correr',
            seed: seed + 6,
          })
        }
        peca.position.set(x, 0, 0)
        g.add(peca)
      }
      if (cfgMuro.concertina) {
        const c = concertina(frente, seed + 8)
        c.position.set(0, alturaMuro + 0.06, 0)
        g.add(c)
      }
      colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -0.1, maxZ: 0.1, tag: 'muro' })
    }
    // o corpo da casa barra sempre
    colisores.push({
      minX: -frente / 2 + 0.2, maxX: frente / 2 - 0.2,
      minZ: -recuo - profCasa, maxZ: -recuo, tag: 'casa',
    })

  // ------------------------------------------------------------- muro cego
  } else if (tipo === 'muro-cego') {
    const m = muro({
      largura: frente, altura: alturaMuro, vaos: [],
      cor: cfgMuro.cor || '#d5d2ca',
      pintado: !/cru|chapisco/.test(String(cfgMuro.acabamento || '')),
      umidade: 0.85, seed: seed + 3,
    })
    g.add(m)
    if (cfgMuro.concertina) {
      const c = concertina(frente, seed + 8)
      c.position.set(0, alturaMuro + 0.06, 0)
      g.add(c)
    }
    altura = alturaMuro
    colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -0.12, maxZ: 0.12, tag: 'muro-cego' })

  // -------------------------------------------------------------- comercio
  } else if (tipo === 'comercio') {
    const c = comercio({
      largura: frente, profundidade: profCasa,
      altura: Number(cfgCasa.pedireito) || 4.0,
      cor: cfgCasa.parede || '#d8cfbb',
      nome: spec.nome || 'COMERCIO',
      segundoNome: spec.segundoNome || null,
      seed,
    })
    g.add(c)
    g.add(pisoDoRecuo(frente, 2.0, 'comercio'))
    altura = c.userData.altura
    colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -profCasa, maxZ: 0, tag: 'comercio' })

  // ---------------------------------------------------------------- escola
  } else if (tipo === 'escola') {
    const e = escola({
      largura: frente, profundidade: profCasa > 8 ? profCasa : 12,
      altura: Number(cfgCasa.pedireito) || 4.2,
      cor: cfgCasa.parede || '#e3ddcf', seed,
    })
    g.add(e)
    altura = e.userData.altura
    colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -14, maxZ: 0, tag: 'escola' })

  // -------------------------------------------------------- quadra coberta
  } else if (tipo === 'quadra-coberta') {
    const q = quadraCoberta({ largura: Math.min(frente - 2, 24), profundidade: 30 })
    q.position.z = -18
    g.add(q)
    altura = q.userData.altura
    colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -34, maxZ: -3, tag: 'quadra' })

  // ---------------------------------------------------------------- galpao
  } else if (tipo === 'galpao') {
    const gp = galpao({ largura: frente - 1, profundidade: profCasa > 10 ? profCasa : 20, seed })
    g.add(gp)
    altura = gp.userData.altura
    colisores.push({ minX: -frente / 2, maxX: frente / 2, minZ: -22, maxZ: 0, tag: 'galpao' })

  // ----------------------------------------------------------------- praca
  } else if (tipo === 'praca') {
    // O TAPETE de grama seca primeiro. Sem ele o capinzal fica sendo tufos
    // avulsos em cima de terra pelada, e a praca le como canteiro de obra.
    g.add(tapeteDeCapim(frente, 26, seed))
    const cp = capinzal({ largura: frente, profundidade: 24, n: Math.round(frente * 5), seed })
    cp.position.z = -12
    g.add(cp)
    const nB = Math.max(1, Math.floor(frente / 9))
    for (let i = 0; i < nB; i++) {
      const b = bancoDePraca()
      b.position.set(-frente / 2 + (i + 0.5) * (frente / nB), 0, -3.2)
      b.rotation.y = r() > 0.5 ? 0 : PI
      g.add(b)
    }
    if (frente > 18) {
      const mp = mesaDePraca()
      mp.position.set(frente * 0.18, 0, -7)
      g.add(mp)
      const rs = rampaDeSkate({ largura: 3.4, seed: seed + 2 })
      rs.position.set(-frente * 0.2, 0, -9)
      g.add(rs)
    }
    altura = 0

  // -------------------------------------------------------- terreno vazio
  } else {
    g.add(tapeteDeCapim(frente, 20, seed))
    const cp = capinzal({ largura: frente, profundidade: 18, n: Math.round(frente * 6), seed })
    cp.position.z = -9
    g.add(cp)
    const en = entulho({ raio: 1.6, n: 16, seed: seed + 4 })
    en.position.set((r() - 0.5) * frente * 0.5, 0, -3 - r() * 5)
    g.add(en)
    altura = 0
  }

  porArvores(g, spec.arvores, { seed, recuo, r })
  porExtras(g, spec.extras, {
    r, seed, frente, alturaMuro, alturaCasa: altura, recuo, numero: spec.numero,
    pedireito, cumeeira: cfgTel.cumeeira === undefined ? 1.05 : Number(cfgTel.cumeeira),
    profCasa,
    // so lote com FACHADA na divisa aceita letreiro: num lote com muro a placa
    // ficaria pendurada acima do muro, sem parede atras
    temFachada: tipo === 'comercio' || tipo === 'casa' || tipo === 'escola',
  })

  return { grupo: g, colisores, altura }
}

export default montarLote
