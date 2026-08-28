// ---------------------------------------------------------------------------
// src/world/hudson/materiais.js — as texturas do bairro brasileiro.
//
// Nenhum arquivo de imagem: tudo desenhado em canvas 2D, como no resto do jogo.
// O que faz um quarteirao de Paracatu parecer Paracatu, e nao um subúrbio
// generico, sao quatro coisas que estas texturas tem que acertar:
//
//   1. A UMIDADE SUBINDO DO CHAO. Todo muro rebocado do bairro tem uma mancha
//      escura de 40 a 80 cm na base, com a borda irregular. E a marca mais
//      constante das 35 fotos — mais que a cor da parede.
//   2. A TELHA COLONIAL DESBOTADA. Ceramica que era vermelha e virou salmao,
//      com fileiras alternando tom e limo escuro nas juntas.
//   3. O ASFALTO CLARO DE POEIRA. Nao e o asfalto preto da cidade do cassino:
//      e cinza-bege, com remendo escuro, trinca e terra vermelha na sarjeta.
//   4. A CHAPA ONDULADA. Portao de garagem e de pedestre, quase sempre em onda
//      vertical, e quase sempre com ferrugem descendo em risco.
//
// Todas passam pelo `tex()` de world/materials.js, que guarda por chave: duas
// casas com a mesma cor de muro dividem a MESMA textura na memoria e na GPU.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { tex, stdMat } from '../materials.js'

/** rng deterministico: o bairro tem que nascer igual toda vez. */
function rng(seed) {
  let s = seed >>> 0
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ruido(g, s, forca, seed) {
  const r = rng(seed)
  for (let i = 0; i < s * s * 0.28; i++) {
    const v = Math.floor(r() * forca * 2 - forca)
    g.fillStyle = 'rgba(' + (128 + v) + ',' + (128 + v) + ',' + (128 + v) + ',0.10)'
    g.fillRect(r() * s, r() * s, 1, 1)
  }
}

/** Mancha organica: um monte de circulos borrados que nao viram uma bolha so. */
function mancha(g, x, y, raio, cor, seed, n = 14) {
  const r = rng(seed)
  g.fillStyle = cor
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2
    const d = r() * raio * 0.7
    const rr = raio * (0.25 + r() * 0.55)
    g.beginPath()
    g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7)
    g.fill()
  }
}

// ---------------------------------------------------------------------------
// REBOCO
// ---------------------------------------------------------------------------

/**
 * Muro/parede de reboco. `base` e a cor da parede; a umidade e a sujeira vem
 * de graca. `pintado` deixa a superficie mais lisa e a mancha mais discreta —
 * parede pintada segura menos agua que reboco cru.
 *
 * A textura cobre 3 m de altura: a mancha de umidade e desenhada no TERCO DE
 * BAIXO da imagem, entao o muro tem que usar repeat vertical 1. Repetir em Y
 * empilharia manchas no meio da parede, que e coisa que nao existe.
 */
export function rebocoTex(base = '#bcb5a8', opcoes = {}) {
  const pintado = opcoes.pintado !== false
  const umidade = opcoes.umidade === undefined ? 0.75 : opcoes.umidade
  const seed = opcoes.seed || 7
  const repeatX = opcoes.repeatX || 1
  const chave = 'hud-reboco:' + base + ':' + (pintado ? 'p' : 'c') + ':' + umidade + ':' + seed
  const t = tex(chave, 256, (g, s) => {
    g.fillStyle = base
    g.fillRect(0, 0, s, s)

    // variacao de desempeno: reboco de pedreiro nao e uma cor chapada
    const r = rng(seed)
    for (let i = 0; i < 70; i++) {
      const a = 0.03 + r() * (pintado ? 0.04 : 0.09)
      g.fillStyle = (r() > 0.5 ? 'rgba(255,255,255,' : 'rgba(60,50,40,') + a + ')'
      const w = 20 + r() * 90
      const h = 14 + r() * 60
      g.fillRect(r() * s, r() * s, w, h)
    }

    // UMIDADE SUBINDO DA CALCADA: a marca do bairro
    if (umidade > 0) {
      const alturaMancha = s * (0.16 + umidade * 0.16)
      const grd = g.createLinearGradient(0, s, 0, s - alturaMancha)
      grd.addColorStop(0, 'rgba(56,44,34,' + (0.55 * umidade).toFixed(2) + ')')
      grd.addColorStop(0.45, 'rgba(70,58,44,' + (0.30 * umidade).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(70,58,44,0)')
      g.fillStyle = grd
      g.fillRect(0, s - alturaMancha, s, alturaMancha)
      // A BORDA DE CIMA e irregular, nunca reta — mas ela e feita com pincel
      // MOLE. As duas versoes anteriores usaram manchas opacas e o muro ficou
      // com um colar de bolas pretas: umidade nao tem contorno, ela desbota.
      for (let i = 0; i < 30; i++) {
        const x = r() * s
        const y = s - alturaMancha * (0.5 + r() * 0.75)
        const raio = 10 + r() * 26
        const grd2 = g.createRadialGradient(x, y, 0, x, y, raio)
        grd2.addColorStop(0, 'rgba(66,54,42,0.10)')
        grd2.addColorStop(1, 'rgba(66,54,42,0)')
        g.fillStyle = grd2
        g.beginPath(); g.arc(x, y, raio, 0, 7); g.fill()
      }
      // Limo no rodape: uma FAIXA esverdeada continua, nao pontos. Verde de
      // musgo velho, quase cinza — verde saturado nesta altura vira grama.
      const grdL = g.createLinearGradient(0, s, 0, s - s * 0.06)
      grdL.addColorStop(0, 'rgba(78,84,62,0.30)')
      grdL.addColorStop(1, 'rgba(78,84,62,0)')
      g.fillStyle = grdL
      g.fillRect(0, s - s * 0.06, s, s * 0.06)
      // e uns poucos escorridos verticais descendo da cinta
      for (let i = 0; i < 6; i++) {
        const x = r() * s
        const h = alturaMancha * (0.5 + r() * 1.4)
        const grd3 = g.createLinearGradient(0, s - h, 0, s)
        grd3.addColorStop(0, 'rgba(70,58,46,0)')
        grd3.addColorStop(1, 'rgba(70,58,46,0.16)')
        g.fillStyle = grd3
        g.fillRect(x, s - h, 3 + r() * 9, h)
      }
    }

    // trincas: linha fina que desce e desvia
    const trincas = pintado ? 2 : 4
    g.lineWidth = 1
    for (let i = 0; i < trincas; i++) {
      g.strokeStyle = 'rgba(70,58,48,0.30)'
      let x = r() * s
      let y = r() * s * 0.6
      g.beginPath(); g.moveTo(x, y)
      for (let k = 0; k < 12; k++) {
        x += (r() - 0.5) * 14
        y += 6 + r() * 12
        g.lineTo(x, y)
      }
      g.stroke()
    }

    // Reboco cru descascando: o pedaco onde aparece o tijolo. Retangular e
    // desbotado — a versao anterior usava mancha() circular e o muro ficava
    // com bolas laranja espalhadas, que nao existem em parede nenhuma.
    if (!pintado) {
      for (let i = 0; i < 3; i++) {
        const x = r() * s, y = r() * s * 0.7
        const w = 12 + r() * 26, h = 10 + r() * 20
        g.fillStyle = 'rgba(158,110,84,0.16)'
        g.fillRect(x, y, w, h)
        g.fillStyle = 'rgba(120,84,62,0.10)'
        g.fillRect(x + 2, y + 2, w - 4, h - 4)
      }
    }

    ruido(g, s, pintado ? 10 : 18, seed + 5)
  }, 1)
  // repeat so em X: a mancha de umidade tem lugar certo na vertical
  const c = t.clone()
  c.needsUpdate = true
  c.repeat.set(repeatX, 1)
  c.wrapS = THREE.RepeatWrapping
  c.wrapT = THREE.ClampToEdgeWrapping
  return c
}

export function rebocoMat(base, opcoes = {}) {
  const chave = 'hud-reboco-mat:' + base + ':' + JSON.stringify(opcoes)
  return stdMat(chave, {
    map: rebocoTex(base, opcoes),
    roughness: opcoes.pintado === false ? 0.98 : 0.9,
    metalness: 0,
  })
}

// ---------------------------------------------------------------------------
// TELHA COLONIAL
// ---------------------------------------------------------------------------

/**
 * Telha de barro vista de cima. As canaletas correm no V da textura, entao o
 * plano do telhado tem que ser orientado com V descendo a agua — senao a telha
 * fica correndo de lado, que e o erro que denuncia telhado falso na hora.
 */
export function telhaTex(repeatX = 6, repeatY = 4, base = '#b25c38') {
  const t = tex('hud-telha:' + base, 256, (g, s) => {
    const c = new THREE.Color(base)
    g.fillStyle = '#' + c.clone().multiplyScalar(0.72).getHexString()
    g.fillRect(0, 0, s, s)

    const r = rng(21)
    const cols = 8
    const w = s / cols
    for (let i = 0; i < cols; i++) {
      const x = i * w
      // cada canal e uma telha: clara no lombo, escura na junta
      const tom = 0.82 + r() * 0.34
      const cor = c.clone().multiplyScalar(tom)
      const grd = g.createLinearGradient(x, 0, x + w, 0)
      grd.addColorStop(0, '#' + cor.clone().multiplyScalar(0.55).getHexString())
      grd.addColorStop(0.32, '#' + cor.getHexString())
      grd.addColorStop(0.62, '#' + cor.clone().multiplyScalar(1.1).getHexString())
      grd.addColorStop(1, '#' + cor.clone().multiplyScalar(0.5).getHexString())
      g.fillStyle = grd
      g.fillRect(x, 0, w, s)
    }

    // as emendas horizontais entre fileiras de telha
    const linhas = 5
    for (let j = 1; j < linhas; j++) {
      const y = (j / linhas) * s
      g.fillStyle = 'rgba(52,32,24,0.35)'
      g.fillRect(0, y - 1, s, 3)
      g.fillStyle = 'rgba(255,225,200,0.10)'
      g.fillRect(0, y + 2, s, 2)
    }

    // limo e desbotado do sol
    for (let i = 0; i < 30; i++) {
      mancha(g, r() * s, r() * s, 5 + r() * 16,
        r() > 0.55 ? 'rgba(72,84,54,0.15)' : 'rgba(226,206,186,0.12)', 300 + i, 8)
    }
    ruido(g, s, 16, 33)
  }, 1)
  const c = t.clone()
  c.needsUpdate = true
  c.repeat.set(repeatX, repeatY)
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  return c
}

export function telhaMat(base = '#b25c38', repeatX = 6, repeatY = 4) {
  return stdMat('hud-telha-mat:' + base + ':' + repeatX + ':' + repeatY, {
    map: telhaTex(repeatX, repeatY, base), roughness: 0.94, metalness: 0,
  })
}

// ---------------------------------------------------------------------------
// CHAPA ONDULADA (portao de garagem, portao de pedestre, telha de zinco)
// ---------------------------------------------------------------------------

/**
 * A onda e desenhada na textura, e nao na geometria: um portao de 3 m com onda
 * de verdade sao umas 40 faces por portao, e o bairro tem 30 portoes. A onda
 * pintada com gradiente resolve igual a 4 m de distancia, que e onde o jogador
 * sempre esta.
 */
export function chapaTex(cor = '#eae7e0', ferrugem = 0.25, seed = 3) {
  const t = tex('hud-chapa:' + cor + ':' + ferrugem + ':' + seed, 256, (g, s) => {
    const c = new THREE.Color(cor)
    const ondas = 16
    const w = s / ondas
    for (let i = 0; i < ondas; i++) {
      const x = i * w
      const grd = g.createLinearGradient(x, 0, x + w, 0)
      grd.addColorStop(0, '#' + c.clone().multiplyScalar(0.58).getHexString())
      grd.addColorStop(0.35, '#' + c.clone().multiplyScalar(1.06).getHexString())
      grd.addColorStop(0.55, '#' + c.getHexString())
      grd.addColorStop(1, '#' + c.clone().multiplyScalar(0.52).getHexString())
      g.fillStyle = grd
      g.fillRect(x, 0, w + 1, s)
    }
    const r = rng(seed)
    // FERRUGEM: escorre de cima pra baixo, e se acumula no pe do portao
    const n = Math.round(ferrugem * 60)
    for (let i = 0; i < n; i++) {
      const x = r() * s
      const y0 = r() * s * 0.7
      const h = 12 + r() * (s - y0)
      const grd = g.createLinearGradient(0, y0, 0, y0 + h)
      grd.addColorStop(0, 'rgba(122,62,28,0.42)')
      grd.addColorStop(1, 'rgba(122,62,28,0)')
      g.fillStyle = grd
      g.fillRect(x, y0, 1 + r() * 4, h)
    }
    if (ferrugem > 0.05) {
      const grd = g.createLinearGradient(0, s, 0, s * 0.78)
      grd.addColorStop(0, 'rgba(104,54,26,' + Math.min(0.6, ferrugem).toFixed(2) + ')')
      grd.addColorStop(1, 'rgba(104,54,26,0)')
      g.fillStyle = grd
      g.fillRect(0, s * 0.78, s, s * 0.22)
    }
    ruido(g, s, 12, seed + 11)
  }, 1)
  const c2 = t.clone()
  c2.needsUpdate = true
  c2.wrapS = c2.wrapT = THREE.RepeatWrapping
  return c2
}

export function chapaMat(cor = '#eae7e0', ferrugem = 0.25, seed = 3) {
  return stdMat('hud-chapa-mat:' + cor + ':' + ferrugem + ':' + seed, {
    map: chapaTex(cor, ferrugem, seed), roughness: 0.62, metalness: 0.35,
  })
}

// ---------------------------------------------------------------------------
// TIJOLO E BLOCO CERAMICO
// ---------------------------------------------------------------------------

/** Tijolo aparente da fachada: fiada corrida, junta clara, tom irregular. */
export function tijoloTex(repeatX = 4, repeatY = 2) {
  const t = tex('hud-tijolo', 256, (g, s) => {
    g.fillStyle = '#c9b9a4'; g.fillRect(0, 0, s, s)     // argamassa
    const r = rng(41)
    const linhas = 10
    const h = s / linhas
    for (let j = 0; j < linhas; j++) {
      const off = (j % 2) * 0.5
      const cols = 5
      const w = s / cols
      for (let i = -1; i <= cols; i++) {
        const x = (i + off) * w
        const y = j * h
        const tom = 0.78 + r() * 0.42
        const c = new THREE.Color(0xb46a45).multiplyScalar(tom)
        g.fillStyle = '#' + c.getHexString()
        g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3)
        // rebarba de argamassa escorrida
        if (r() > 0.7) {
          g.fillStyle = 'rgba(214,204,186,0.5)'
          g.fillRect(x + 1.5, y + h - 4, w - 3, 2)
        }
      }
    }
    ruido(g, s, 14, 55)
  }, 1)
  const c = t.clone()
  c.needsUpdate = true
  c.repeat.set(repeatX, repeatY)
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  return c
}

export function tijoloMat(repeatX = 4, repeatY = 2) {
  return stdMat('hud-tijolo-mat:' + repeatX + ':' + repeatY, {
    map: tijoloTex(repeatX, repeatY), roughness: 0.95, metalness: 0,
  })
}

/** A cara do BLOCO CERAMICO de 8 furos, pra pilha de obra no lote vazio. */
export function blocoFuroTex() {
  return tex('hud-bloco-furo', 128, (g, s) => {
    g.fillStyle = '#c2703f'; g.fillRect(0, 0, s, s)
    g.fillStyle = '#4a2a1a'
    const cols = 4, linhas = 2
    const mx = s * 0.1, my = s * 0.16
    const fw = (s - mx * (cols + 1)) / cols
    const fh = (s - my * (linhas + 1)) / linhas
    for (let j = 0; j < linhas; j++) {
      for (let i = 0; i < cols; i++) {
        g.fillRect(mx + i * (fw + mx), my + j * (fh + my), fw, fh)
      }
    }
    ruido(g, s, 14, 77)
  }, 1)
}

// ---------------------------------------------------------------------------
// CHAO
// ---------------------------------------------------------------------------

/** Asfalto de cidade pequena: cinza-bege de poeira, remendo escuro, trinca. */
export function asfaltoTex(repeat = 10) {
  return tex('hud-asfalto', 256, (g, s) => {
    g.fillStyle = '#82807c'; g.fillRect(0, 0, s, s)
    const r = rng(13)
    for (let i = 0; i < 2200; i++) {
      const v = 96 + r() * 52
      g.fillStyle = 'rgba(' + v + ',' + (v - 4) + ',' + (v - 10) + ',' + (r() * 0.45) + ')'
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2)
    }
    // REMENDO: a mancha de recapeamento. Pequena e de pouco contraste: a
    // textura tem 7 m de lado no mundo, e um remendo de 70 px viraria uma placa
    // de 2 m repetida a cada 7 m — o olho pega a repeticao na hora.
    for (let i = 0; i < 4; i++) {
      const x = r() * s, y = r() * s, w = 14 + r() * 34, h = 10 + r() * 26
      g.fillStyle = 'rgba(74,70,68,' + (0.12 + r() * 0.12).toFixed(2) + ')'
      g.fillRect(x, y, w, h)
    }
    // TRINCA: curta, fina e discreta
    g.strokeStyle = 'rgba(62,58,56,0.30)'
    g.lineWidth = 1
    for (let i = 0; i < 5; i++) {
      let x = r() * s, y = r() * s
      g.beginPath(); g.moveTo(x, y)
      for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 14; y += (r() - 0.5) * 14; g.lineTo(x, y) }
      g.stroke()
    }
    // poeira vermelha soprada pro asfalto — de leve: quem carrega a cor de
    // terra e a SARJETA, e nao o meio da pista
    for (let i = 0; i < 10; i++) {
      mancha(g, r() * s, r() * s, 6 + r() * 18, 'rgba(146,104,70,0.045)', 400 + i, 9)
    }
    ruido(g, s, 10, 91)
  }, repeat)
}

/** Calcada de concreto moldado no lugar, com junta serrada e remendo. */
export function calcadaTex(repeat = 8) {
  return tex('hud-calcada', 256, (g, s) => {
    g.fillStyle = '#c3bcae'; g.fillRect(0, 0, s, s)
    const r = rng(17)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(' + (r() > 0.5 ? '255,255,255,' : '120,110,96,') + (0.04 + r() * 0.07) + ')'
      g.fillRect(r() * s, r() * s, 20 + r() * 60, 16 + r() * 50)
    }
    // juntas: uma grade de placas de ~1 m
    g.strokeStyle = 'rgba(96,88,76,0.55)'
    g.lineWidth = 2
    for (let i = 1; i < 4; i++) {
      g.beginPath(); g.moveTo((i / 4) * s, 0); g.lineTo((i / 4) * s, s); g.stroke()
      g.beginPath(); g.moveTo(0, (i / 4) * s); g.lineTo(s, (i / 4) * s); g.stroke()
    }
    // terra e limo acumulados nas juntas
    for (let i = 0; i < 22; i++) {
      mancha(g, r() * s, r() * s, 5 + r() * 14, 'rgba(128,96,60,0.13)', 500 + i, 7)
    }
    ruido(g, s, 12, 61)
  }, repeat)
}

/** Terra batida do cerrado: vermelho-ocre com cascalho. */
export function terraTex(repeat = 12) {
  return tex('hud-terra', 256, (g, s) => {
    // O cerrado de Paracatu e ocre acinzentado, e nao laranja de tijolo: a
    // primeira versao desta textura pintou o bairro inteiro de terracota.
    g.fillStyle = '#9a7b5c'; g.fillRect(0, 0, s, s)
    const r = rng(29)
    for (let i = 0; i < 60; i++) {
      mancha(g, r() * s, r() * s, 10 + r() * 34,
        r() > 0.5 ? 'rgba(172,146,112,0.18)' : 'rgba(118,90,64,0.20)', 600 + i, 8)
    }
    // tufos de mato seco: terreno sem calcada nunca e terra limpa
    for (let i = 0; i < 26; i++) {
      mancha(g, r() * s, r() * s, 7 + r() * 20, 'rgba(126,120,74,0.16)', 660 + i, 7)
    }
    for (let i = 0; i < 700; i++) {           // cascalho
      const v = 130 + r() * 90
      g.fillStyle = 'rgba(' + v + ',' + (v - 20) + ',' + (v - 45) + ',' + (0.2 + r() * 0.4) + ')'
      g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2)
    }
    ruido(g, s, 16, 71)
  }, repeat)
}

/** Capim seco de terreno baldio: mais palha que verde, e falhado. */
export function capimTex(repeat = 10) {
  return tex('hud-capim', 256, (g, s) => {
    g.fillStyle = '#9d8b53'; g.fillRect(0, 0, s, s)
    const r = rng(37)
    for (let i = 0; i < 40; i++) {
      mancha(g, r() * s, r() * s, 12 + r() * 30,
        r() > 0.6 ? 'rgba(122,124,66,0.30)' : 'rgba(168,148,92,0.28)', 700 + i, 9)
    }
    // tufos: risquinhos verticais
    for (let i = 0; i < 1400; i++) {
      const x = r() * s, y = r() * s
      const v = r()
      g.strokeStyle = v > 0.62 ? 'rgba(104,112,58,0.5)' : 'rgba(186,166,106,0.45)'
      g.lineWidth = 1
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4); g.stroke()
    }
    // falhas de terra aparecendo
    for (let i = 0; i < 12; i++) {
      mancha(g, r() * s, r() * s, 6 + r() * 16, 'rgba(158,104,62,0.34)', 800 + i, 7)
    }
    ruido(g, s, 12, 83)
  }, repeat)
}

/** Piso de bloquete/paver vermelho, o da calcada do comercio. */
export function bloquete(repeat = 8) {
  return tex('hud-bloquete', 256, (g, s) => {
    g.fillStyle = '#8d6250'; g.fillRect(0, 0, s, s)
    const r = rng(53)
    const cols = 8, linhas = 8
    const w = s / cols, h = s / linhas
    for (let j = 0; j < linhas; j++) {
      for (let i = 0; i < cols; i++) {
        const tom = 0.82 + r() * 0.36
        const c = new THREE.Color(0xa8674a).multiplyScalar(tom)
        g.fillStyle = '#' + c.getHexString()
        const off = (j % 2) * w * 0.5
        g.fillRect(i * w + off + 1, j * h + 1, w - 2, h - 2)
      }
    }
    ruido(g, s, 12, 95)
  }, repeat)
}

export default {
  rebocoTex, rebocoMat, telhaTex, telhaMat, chapaTex, chapaMat,
  tijoloTex, tijoloMat, blocoFuroTex, asfaltoTex, calcadaTex, terraTex, capimTex, bloquete,
}
