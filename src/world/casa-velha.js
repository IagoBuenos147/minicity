import * as THREE from 'three'
import { CASA, interiorOf, apronOf, WALL_T } from './layout.js'
import { LEVELS } from '../config.js'
import {
  solid, stdMat, emissive, box, cyl, roundedBox, textPlaneMat, tex, concreteTex,
} from './materials.js'

// ---------------------------------------------------------------------------
// CASA 42 — a casa velha do lote 38..50 / 12..22.
//
// Como o cassino, ela traz a PROPRIA casca: o buildShell de city.js so sabe
// desenhar loja com vitrine e toldo virados pra +Z, e esta fachada olha pra -Z
// (a rua principal fica ao NORTE). Alem disso nada do que faz esta casa ser
// ela — tabua torta, tinta descascando, telha faltando, calha pendurada por um
// lado so — cabe em "parametro de loja": ou nasce aqui junto do miolo, ou nao
// nasce.
//
// Planta do miolo (X 38.3..49.7, Z 12.3..21.7). O espaco LIVRE e um L:
//
//   z=21.7  +--------------------------+-------+
//           |                          |       |
//           |     COMODO FECHADO       | BRACO |  <- 2.40 m de largura livre
//           |   (sem porta, so parede) |       |     (o jogador tem 0.38 de raio)
//   z=16.65 +==========================+       |
//   z=16.40 +--------------------------+       |
//           |                                  |
//           |          SALA DA FRENTE          |  <- 11.4 x 4.1
//           |                                  |
//   z=12.3  +--------- porta (x=43) -----------+
//          x=38.3                    x=47.05  x=49.7
//
// O comodo fechado NAO e sobra de planta: e ele que faz o L existir. Da sala
// da frente ve-se a passagem do braco pela direita e uma parede cega pela
// esquerda — com um vao de porta tapado com tabuas, pra ficar claro que aquilo
// e um comodo lacrado e nao um erro de modelagem.
// ---------------------------------------------------------------------------

const B = CASA
const IN = interiorOf(B)               // 38.3..49.7 / 12.3..21.7
const T = WALL_T                       // 0.3
const H = B.wallHeight                 // 3.2
const BASE = LEVELS.SHOP_FLOOR         // 0.16
const AV = apronOf(B, 0.9)             // apronOf sabe que a fachada e a z0
const DL = B.door.center - B.door.width / 2   // 42.15
const DR = B.door.center + B.door.width / 2   // 43.85
const DH = B.door.height                      // 2.3

// Forro BAIXO de proposito (2.76 no mundo contra os 3.2 da parede): a casa tem
// que apertar. O vao que sobra entre o forro e o telhado e o sotao — que hoje
// nao se ve de lugar nenhum, desde que o pedaco caido do forro foi fechado
// (ver forro()).
// 2.90 local = 3.06 no mundo. Era 2.60 (2,76 no mundo, 2,64 sob as vigas) e a
// justificativa antiga era "a casa tem que apertar". Deixou de valer: aqui vai
// entrar mesa de sinuca, e o taco levanta 1,45 m acima do pano a 0,80 do chao —
// com 2,64 de forro o taco encosta no teto na tacada de bola presa na tabela.
const CEIL = 2.90                      // local; o miolo inteiro sobe pra BASE

// --- paredes internas do L -------------------------------------------------
// TI mais fina que a externa: divisoria de tabique, nao parede de fora.
const TI = 0.25
// 17.70 da 5,40 m de fundura livre na sala da frente (12.3 ate 17.70). E a
// conta da sinuca: 1,45 de taco + 1,27 de mesa + 1,45 de taco = 4,17, mais
// 1,20 de faixa de entrada na frente da porta. Eram 4,10 — nao cabia UMA mesa.
const ZA = 17.70                       // face sul da divisoria transversal
// Braco de 2,80 e nao 2,40: dois jogadores se cruzam (0,76 de bitola cada) e um
// taco de 1,45 vira de lado sem raspar as duas paredes.
const XA = 47.55                       // face oeste da divisoria do braco
const BRACO_X0 = XA + TI               // 47.80 — sobra 2.80 m livres ate 50.6

// --- vaos da fachada -------------------------------------------------------
// As duas janelas tem a MESMA faixa de altura de proposito: cada fileira de
// tabua e cada faixa de papel de parede precisa saber onde cortar, e alturas
// diferentes dobrariam o numero de faixas pra nada.
const JAN_Y0 = 1.02
const JAN_Y1 = 2.16
// As duas recuaram pra abrir espaco pras FOLHAS DE CORRER da porta nova (ver
// porta()): cada folha corre 1,03 m pro lado, entao a fachada precisa de 1,03 m
// livres de cada lado do vao. Sobram 0,67 m a oeste e 0,47 m a leste.
const JAN_L = { x0: 38.30, x1: 40.30, y0: JAN_Y0, y1: JAN_Y1 }   // janelinha oeste
const JAN_R = { x0: 45.50, x1: 48.10, y0: JAN_Y0, y1: JAN_Y1 }   // janela do X
// Vaos da fachada em coordenadas de MUNDO (x, y). A porta entra na lista
// porque tabua, tinta e papel de parede param nela igual param na janela.
const VAOS_F = [
  { x0: DL, x1: DR, y0: 0, y1: DH },
  JAN_L, JAN_R,
]
// Janela da parede LESTE (a unica luz do braco; sem ela o corredor fica cego).
// O braco agora vai de 17,70 a 24,2: a janela desceu pro meio dele.
const JAN_E = { z0: 20.20, z1: 21.80, y0: 1.10, y1: 2.10 }

// --- varanda ---------------------------------------------------------------
// Ela e RASA (7 cm do chao ao estrado) e isso nao e preguica:
// groundY() de city.js devolve 0.16 chapado no lote inteiro e no avental, e o
// jogador anda nessa altura. Um alpendre de 30 cm faria o jogador flutuar na
// calcada ou afundar no estrado. A casa que APODRECEU e afundou no proprio
// terreno e a unica versao que respeita o contrato de alturas — e por sorte e
// tambem a que combina com o resto.
// 5,60 m de largura e CENTRADA no eixo da porta (43,0). A antiga tinha 4,60 e
// estava centrada em 43,35 — torta por acidente, o que so aparecia quando se
// media.
const VAR = { x0: 40.20, x1: 45.80, z0: 10.45, z1: 12.00 }
const VAR_Y = 0.07                     // topo do estrado acima do piso
const POSTE_X = [40.55, 45.45]
const POSTE_Z = 10.70

// --- telhado ---------------------------------------------------------------
// Duas aguas com a cumeeira correndo em X: assim o beiral da FRENTE e uma
// linha horizontal cheia na altura do olho de quem chega, que e onde a calha
// torta e as telhas faltando aparecem. Cumeeira em Z esconderia tudo isso de
// lado.
const TEL_X0 = B.x0 - 0.5, TEL_X1 = B.x1 + 0.5   // 0.5 de beiral por lateral
const TEL_Z = (B.z0 + B.z1) / 2                  // 17 — linha da cumeeira
// H + 2.30 e nao H + 1.90: a agua do telhado foi de 5,55 pra 6,80 m de corrida
// e, sem subir a cumeeira junto, a inclinacao cairia de 17,8 pra 14,7 graus.
// Telha de barro escorrega abaixo de 17.
const Y_CUM = H + 2.30                           // 5.80
const Y_BEI = H + 0.12                           // 3.32
const TEL_RUN = (B.z1 - B.z0) / 2 + 0.55         // 5.55 (beiral de 0.55)
const TEL_ANG = Math.atan2(Y_CUM - Y_BEI, TEL_RUN)
const TEL_SL = Math.hypot(TEL_RUN, Y_CUM - Y_BEI)
const TEL_W = TEL_X1 - TEL_X0                    // 13.0
// Malha de telhas. Cada telha e um mesh proprio compartilhando UMA geometria:
// e o unico jeito de uma telha FALTAR de verdade (e o forno funde tudo depois).
// 34 x 12 e nao 30 x 10: a agua cresceu pra 15,0 x 7,14 m e, mantendo a malha
// velha, cada telha visivel iria de 0,44 x 0,59 pra 0,50 x 0,71 — chapa, nao
// telha.
const TEL_COL = 34
const TEL_LIN = 12

// ---------------------------------------------------------------------------
// PRNG deterministico. As telhas que faltam, as tabuas tortas e o mato TEM que
// nascer iguais em todo cliente: no online dois jogadores olhando a mesma
// parede nao podem ver buracos em lugares diferentes. Textura pode sortear a
// vontade (e enfeite local), geometria nao.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), 1 | t)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Cache local de texturas com repeat proprio (mesmo truque do cassino: um
// CanvasTexture cru vale por varios materiais, o que muda e a densidade).
// ---------------------------------------------------------------------------
const _tiled = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx.toFixed(2) + ':' + ry.toFixed(2)
  let t = _tiled.get(k)
  if (t) return t
  t = base.clone()
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  _tiled.set(k, t)
  return t
}

// ---------------------------------------------------------------------------
// TEXTURAS
// ---------------------------------------------------------------------------

/** Veio de UMA tabua: fibra longa, nos com anel e mofo. Vai nas tabuas soltas. */
function veioTex() {
  return tex('casa-veio', 256, (g, s) => {
    g.fillStyle = '#8f7d63'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * s
      const claro = Math.random() > 0.55
      g.strokeStyle = claro
        ? 'rgba(158,140,110,' + (0.10 + Math.random() * 0.22) + ')'
        : 'rgba(50,40,28,' + (0.10 + Math.random() * 0.30) + ')'
      g.lineWidth = 0.6 + Math.random() * 2.4
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= s; x += 12) g.lineTo(x, y + Math.sin(x * 0.045 + i) * 2.6)
      g.stroke()
    }
    // Um no nao e mancha: e o veio se abrindo em volta dele. Por isso aneis
    // fechados e so no fim o miolo escuro.
    for (let k = 0; k < 3; k++) {
      const cx = 34 + Math.random() * (s - 68), cy = 34 + Math.random() * (s - 68)
      for (let r = 2.5; r < 17; r += 2.3) {
        g.strokeStyle = 'rgba(44,33,22,' + Math.max(0.06, 0.46 - r * 0.02) + ')'
        g.lineWidth = 1.3
        g.beginPath(); g.ellipse(cx, cy, r * 1.7, r, 0, 0, 7); g.stroke()
      }
      g.fillStyle = 'rgba(34,25,16,0.88)'
      g.beginPath(); g.ellipse(cx, cy, 4.6, 2.9, 0, 0, 7); g.fill()
    }
    for (let i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(46,48,36,' + (0.05 + Math.random() * 0.12) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 6 + Math.random() * 26,
        4 + Math.random() * 14, Math.random() * 3, 0, 7)
      g.fill()
    }
  }, 1)
}

/** Tabuado com juntas: parede lateral, forro, piso. `k` escolhe a paleta. */
function tabuadoTex(k) {
  const p = k === 'piso' ? ['#6b5237', '#3a2a1a', 5]
    : k === 'forro' ? ['#8e8574', '#4b4438', 6]
      : ['#77695a', '#3b3229', 5]
  return tex('casa-tabuado:' + k, 256, (g, s) => {
    const n = p[2], h = s / n
    for (let i = 0; i < n; i++) {
      const v = 0.86 + Math.random() * 0.26
      const c = new THREE.Color(p[0]).multiplyScalar(v)
      g.fillStyle = '#' + c.getHexString()
      g.fillRect(0, i * h, s, h)
      for (let j = 0; j < 26; j++) {
        const y = i * h + Math.random() * h
        g.strokeStyle = 'rgba(30,22,14,' + (Math.random() * 0.22) + ')'
        g.lineWidth = 0.7 + Math.random() * 1.8
        g.beginPath(); g.moveTo(0, y)
        for (let x = 0; x <= s; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + j) * 1.8)
        g.stroke()
      }
      // junta: risco escuro em cima da tabua de baixo
      g.fillStyle = p[1]
      g.fillRect(0, i * h, s, 2.4)
    }
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(28,24,16,' + (0.05 + Math.random() * 0.14) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 8 + Math.random() * 30,
        3 + Math.random() * 10, 0, 0, 7)
      g.fill()
    }
  }, 1)
}

/**
 * PINTURA DESCASCANDO — decalque com alpha. A tinta NAO cobre: sao placas
 * irregulares com o miolo cru aparecendo entre elas.
 * O truque das bordas: depois de recortar as falhas com destination-out sobra
 * um contorno duro; passar um traco escuro por cima (source-atop) vira o
 * LABIO da casca de tinta, que e o que o olho reconhece como "descascado".
 *
 * A cor tem que ficar PERTO do valor da madeira. Com a tinta muito mais escura
 * (ou muito mais verde) que a tabua, o decalque para de ler como pintura velha
 * e vira camuflagem militar — foi exatamente o que aconteceu na primeira
 * versao. O que conta a idade e a borda irregular, nao o contraste.
 */
function pinturaTex() {
  return tex('casa-pintura', 512, (g, s) => {
    // Contorno por curva e nao por reta: a placa de tinta descola em lingua
    // arredondada. Poligono de vertices sorteados dava uma estrela pontuda que
    // ninguem confunde com tinta.
    const blob = (x, y, r) => {
      const n = 9, pts = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const rr = r * (0.74 + Math.random() * 0.42)
        pts.push([x + Math.cos(a) * rr * 1.35, y + Math.sin(a) * rr])
      }
      g.beginPath()
      g.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2)
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n]
        g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
      }
      g.closePath(); g.fill()
    }
    g.fillStyle = '#aab0a1'
    for (let i = 0; i < 14; i++) blob(Math.random() * s, Math.random() * s, 70 + Math.random() * 110)
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 16; i++) blob(Math.random() * s, Math.random() * s, 24 + Math.random() * 66)
    g.globalCompositeOperation = 'source-atop'
    for (let i = 0; i < 26; i++) {
      g.fillStyle = Math.random() > 0.5
        ? 'rgba(196,200,186,' + (0.12 + Math.random() * 0.28) + ')'
        : 'rgba(128,134,120,' + (0.10 + Math.random() * 0.26) + ')'
      blob(Math.random() * s, Math.random() * s, 30 + Math.random() * 70)
    }
    // rachaduras finas: tinta velha racha antes de soltar
    g.strokeStyle = 'rgba(112,116,104,0.45)'
    for (let i = 0; i < 44; i++) {
      g.lineWidth = 0.6 + Math.random()
      let x = Math.random() * s, y = Math.random() * s
      g.beginPath(); g.moveTo(x, y)
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 46; y += (Math.random() - 0.5) * 20
        g.lineTo(x, y)
      }
      g.stroke()
    }
    g.globalCompositeOperation = 'source-over'
  }, 1)
}

/** Umidade subindo do rodape: escuro embaixo, borda alta ondulada, escorridos. */
function umidadeTex() {
  return tex('casa-umidade', 256, (g, s) => {
    const grd = g.createLinearGradient(0, s, 0, 0)
    grd.addColorStop(0, 'rgba(26,24,18,0.94)')
    grd.addColorStop(0.35, 'rgba(44,42,30,0.70)')
    grd.addColorStop(0.75, 'rgba(58,56,42,0.28)')
    grd.addColorStop(1, 'rgba(58,56,42,0)')
    g.fillStyle = grd
    // borda de cima ondulada: a agua sobe pela fibra e nunca em linha reta
    g.beginPath()
    g.moveTo(0, s)
    for (let x = 0; x <= s; x += 8) {
      const t = x / s
      const y = s * (0.30 - 0.16 * Math.sin(t * 7.1) - 0.10 * Math.sin(t * 17.3 + 1.4))
      g.lineTo(x, y)
    }
    g.lineTo(s, s); g.closePath(); g.fill()
    // escorridos verticais saindo da mancha
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * s
      g.strokeStyle = 'rgba(26,24,18,' + (0.10 + Math.random() * 0.22) + ')'
      g.lineWidth = 1 + Math.random() * 5
      g.beginPath(); g.moveTo(x, s); g.lineTo(x + (Math.random() - 0.5) * 8, s * (0.12 + Math.random() * 0.5))
      g.stroke()
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(40,48,32,' + (Math.random() * 0.22) + ')'
      g.beginPath()
      g.arc(Math.random() * s, s * (0.45 + Math.random() * 0.55), 1 + Math.random() * 7, 0, 7)
      g.fill()
    }
  }, 1)
}

/**
 * TEIA DE ARANHA de verdade: leque de radiais mais espirais que cedem entre
 * um fio e o outro. `modo` diz de qual quina do canvas os fios saem — 'topo'
 * pra quina de parede (o plano vai na diagonal do canto), 'esq'/'dir' pra
 * quina de moldura vista de frente.
 * Uma teia desenhada como mancha branca nao le como teia; o que le e o fio
 * indo do centro pra fora e a barriga da espiral entre dois fios.
 */
/**
 * TEIA DE CANTO. A silhueta e um quarto de disco RASGADO, nao um quadrado.
 *
 * Ela lia como quadrado por duas razoes somadas, as duas mensuraveis:
 *
 * 1. O DESENHO TRANSBORDAVA O CANVAS. O raio era R = s (e 1.3 s no modo de
 *    parede) com o centro na quina: as radiais iam de -128 a 384 num canvas de
 *    0..256 e os quatro aneis de fora eram CORTADOS pela borda. O contorno
 *    externo da teia virava, literalmente, o retangulo do canvas.
 * 2. NAO HAVIA BORDA. Mesmo dentro do quadro, o ultimo anel era um arco limpo:
 *    teia de verdade nao acaba num arco, acaba rasgada e desigual.
 *
 * Agora o raio de cada direcao sai de `rasgo()`: um perfil irregular entre 62%
 * e 100% do raio util, com dois ou tres rasgos fundos. Nada encosta na borda do
 * canvas (R vai ate 0.94 s), e os fios somem em alpha antes dela.
 *
 * E TUDO DETERMINISTICO. Era Math.random(), o que no online dava teias
 * diferentes em cada tela para a mesma parede — o mesmo defeito que o resto
 * desta casa ja evitava com mulberry32.
 */
function teiaTex(modo) {
  return tex('casa-teia:' + modo, 256, (g, s) => {
    const rnd = mulberry32(modo === 'topo' ? 0x7E1A01 : modo === 'dir' ? 0x7E1A02 : 0x7E1A03)
    const ax = modo === 'dir' ? s : modo === 'esq' ? 0 : s / 2
    const a0 = modo === 'dir' ? Math.PI / 2 : 0
    const a1 = modo === 'esq' ? Math.PI / 2 : Math.PI
    const N = modo === 'topo' ? 15 : 11
    // 0.94 e nao 1.0: os fios morrem ANTES da borda do canvas. E a diferenca
    // entre uma teia com contorno proprio e uma teia cortada em quadrado.
    const R = s * 0.94
    const ang = []
    const lim = []
    for (let i = 0; i < N; i++) {
      ang.push(a0 + ((a1 - a0) * i) / (N - 1))
      // O RASGO: dois harmonicos lentos dao a ondulacao geral, e um sorteio
      // curto morde pedacos. Sem o sorteio a borda vira uma flor regular.
      const t = i / (N - 1)
      let r = 0.86 + Math.sin(t * 5.1 + 1.2) * 0.09 + Math.sin(t * 11.7) * 0.05
      if (rnd() < 0.24) r -= 0.16 + rnd() * 0.12
      lim.push(Math.max(0.42, Math.min(1, r)))
    }
    g.lineCap = 'round'

    // radiais: cada uma para no proprio limite, e a mais externa e a mais fraca
    for (let i = 0; i < N; i++) {
      const rr = R * lim[i]
      const grd = g.createLinearGradient(ax, 0, ax + Math.cos(ang[i]) * rr, Math.sin(ang[i]) * rr)
      grd.addColorStop(0, 'rgba(232,232,220,0.72)')
      grd.addColorStop(0.72, 'rgba(228,228,216,0.5)')
      grd.addColorStop(1, 'rgba(228,228,216,0)')
      g.strokeStyle = grd
      g.lineWidth = 1.5 + rnd() * 1.1
      g.beginPath(); g.moveTo(ax, 0)
      g.lineTo(ax + Math.cos(ang[i]) * rr, Math.sin(ang[i]) * rr)
      g.stroke()
    }

    // Sem as espirais o desenho e um LEQUE, nao uma teia: e o fio circular
    // cedendo entre duas radiais que o olho reconhece. Por isso elas entram
    // mais grossas e mais opacas que os raios, ao contrario do que a intuicao
    // diz. Cada volta acompanha o rasgo, entao a teia inteira e irregular e nao
    // so a ponta dos fios.
    for (let k = 1; k <= 11; k++) {
      const f = 0.07 + k * 0.085
      if (f > 1) break
      g.strokeStyle = 'rgba(238,238,226,' + Math.max(0.10, 0.60 - k * 0.028) + ')'
      g.lineWidth = 1.8
      g.beginPath()
      let comecou = false
      for (let i = 0; i < N; i++) {
        // a volta some onde o rasgo comeu o fio
        if (f > lim[i]) { comecou = false; continue }
        const rr = R * f * (0.92 + rnd() * 0.16)
        const x = ax + Math.cos(ang[i]) * rr, y = Math.sin(ang[i]) * rr
        if (!comecou) { g.moveTo(x, y); comecou = true; continue }
        const am = (ang[i - 1] + ang[i]) / 2, rm = rr * 0.84
        g.quadraticCurveTo(ax + Math.cos(am) * rm, Math.sin(am) * rm, x, y)
      }
      g.stroke()
    }

    // poeira grudada: e o que faz a teia parecer VELHA e nao recem-tecida
    for (let i = 0; i < 46; i++) {
      const a = a0 + rnd() * (a1 - a0), r = rnd() * R * 0.72
      g.fillStyle = 'rgba(210,206,190,' + (0.12 + rnd() * 0.4) + ')'
      g.beginPath(); g.arc(ax + Math.cos(a) * r, Math.sin(a) * r, 0.7 + rnd() * 2.2, 0, 7); g.fill()
    }
  }, 1)
}

/**
 * A ARANHA. Corpo de duas bolas e oito pernas de dois segmentos, com 2,2 cm de
 * corpo — do tamanho de uma aranha de casa, e nao de um bicho de filme.
 *
 * Ela e um GRUPO com o pivo nas costas dela, pra quem pendurar poder gira-la
 * junto com a teia sem calcular nada.
 */
function aranha(escala) {
  const g = new THREE.Group()
  const m = M.aranha
  const abd = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), m)
  abd.position.set(0, -0.008, 0)
  abd.scale.set(1, 0.85, 1.25)
  g.add(abd)
  const cef = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 7, 5), m)
  cef.position.set(0, 0.010, 0.002)
  g.add(cef)
  // oito pernas: quatro de cada lado, abrindo pra fora e dobrando pra baixo
  for (let i = 0; i < 8; i++) {
    const lado = i < 4 ? -1 : 1
    const k = i % 4
    const a = 0.55 + k * 0.42
    const coxa = cyl(0.0016, 0.0016, 0.019, m, 4)
    coxa.position.set(lado * 0.010, 0.006 - k * 0.004, 0)
    coxa.rotation.z = lado * a
    g.add(coxa)
    const tibia = cyl(0.0014, 0.0014, 0.021, m, 4)
    tibia.position.set(lado * 0.020, -0.002 - k * 0.004, 0)
    tibia.rotation.z = lado * (a - 1.15)
    g.add(tibia)
  }
  for (const o of g.children) o.castShadow = false
  if (escala && escala !== 1) g.scale.setScalar(escala)
  return g
}

/** UMA telha: barro desbotado/** UMA telha: barro desbotado, canal no meio, quina lascada e limo. */
function telhaTex() {
  return tex('casa-telha', 128, (g, s) => {
    g.fillStyle = '#8a6250'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(' + (Math.random() > 0.5 ? '60,36,28' : '176,120,92') + ',' + (Math.random() * 0.3) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 16, 1 + Math.random() * 4)
    }
    const grd = g.createLinearGradient(0, 0, s, 0)
    grd.addColorStop(0, 'rgba(40,24,18,0.42)')
    grd.addColorStop(0.5, 'rgba(255,220,190,0.12)')
    grd.addColorStop(1, 'rgba(40,24,18,0.42)')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    // limo: sempre no lado que fica na sombra, nunca espalhado por igual
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(72,86,54,' + (0.08 + Math.random() * 0.3) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s * 0.5, Math.random() * s, 4 + Math.random() * 14,
        3 + Math.random() * 9, 0, 0, 7)
      g.fill()
    }
    g.fillStyle = 'rgba(30,20,14,0.55)'
    g.fillRect(0, s - 5, s, 5)
  }, 1)
}

/** Vidro sujo: encardido nas bordas, escorrido de chuva e poeira no canto. */
function vidroTex() {
  return tex('casa-vidro', 256, (g, s) => {
    g.fillStyle = 'rgba(138,152,140,0.55)'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * s
      g.strokeStyle = 'rgba(96,104,92,' + (0.06 + Math.random() * 0.2) + ')'
      g.lineWidth = 2 + Math.random() * 9
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 16, s)
      g.stroke()
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(84,88,76,' + (Math.random() * 0.28) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 3 + Math.random() * 20,
        2 + Math.random() * 12, Math.random() * 3, 0, 7)
      g.fill()
    }
    const grd = g.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.75)
    grd.addColorStop(0, 'rgba(200,210,196,0.05)')
    grd.addColorStop(1, 'rgba(70,76,64,0.55)')
    g.fillStyle = grd; g.fillRect(0, 0, s, s)
    // risco de dedo/limpeza: uma faixa mais clara diz que ALGUEM esteve aqui
    g.strokeStyle = 'rgba(226,236,224,0.30)'; g.lineWidth = 12
    g.beginPath(); g.moveTo(s * 0.15, s * 0.72)
    g.quadraticCurveTo(s * 0.5, s * 0.55, s * 0.85, s * 0.68)
    g.stroke()
  }, 1)
}

/** Papel de parede: listra desbotada, florzinha e mancha de infiltracao. */
function papelTex() {
  return tex('casa-papel', 256, (g, s) => {
    g.fillStyle = '#c9bda2'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 8; i++) {
      g.fillStyle = 'rgba(150,136,110,0.35)'
      g.fillRect((i / 8) * s, 0, s / 26, s)
    }
    for (let i = 0; i < 34; i++) {
      const x = Math.random() * s, y = Math.random() * s
      g.fillStyle = 'rgba(140,112,104,' + (0.14 + Math.random() * 0.2) + ')'
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        g.beginPath(); g.ellipse(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 3.6, 2.4, a, 0, 7); g.fill()
      }
      g.fillStyle = 'rgba(160,142,96,0.3)'
      g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill()
    }
    for (let i = 0; i < 16; i++) {
      g.fillStyle = 'rgba(112,96,62,' + (0.05 + Math.random() * 0.16) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 12 + Math.random() * 44,
        8 + Math.random() * 30, Math.random() * 3, 0, 7)
      g.fill()
    }
  }, 1)
}

/**
 * Poeira no ar: manchas moles com alpha, nada de grao duro.
 * O destination-in no fim e o que salva o efeito: sem apagar as bordas o plano
 * aparece como um RETANGULO leitoso pendurado no meio da sala — foi o que
 * aconteceu na primeira versao. Com a mascara radial o plano nao tem borda.
 */
function poeiraTex() {
  return tex('casa-poeira', 256, (g, s) => {
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 8 + Math.random() * 38
      const grd = g.createRadialGradient(x, y, 0, x, y, r)
      grd.addColorStop(0, 'rgba(236,228,206,' + (0.04 + Math.random() * 0.1) + ')')
      grd.addColorStop(1, 'rgba(236,228,206,0)')
      g.fillStyle = grd
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill()
    }
    for (let i = 0; i < 240; i++) {
      g.fillStyle = 'rgba(250,244,224,' + (0.1 + Math.random() * 0.5) + ')'
      g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 1.3, 0, 7); g.fill()
    }
    g.globalCompositeOperation = 'destination-in'
    const mask = g.createRadialGradient(s / 2, s / 2, s * 0.08, s / 2, s / 2, s * 0.5)
    mask.addColorStop(0, 'rgba(0,0,0,1)')
    mask.addColorStop(0.65, 'rgba(0,0,0,0.55)')
    mask.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = mask; g.fillRect(0, 0, s, s)
    g.globalCompositeOperation = 'source-over'
  }, 1)
}

function lencolTex() {
  return tex('casa-lencol-tex', 256, (g, s) => {
    g.fillStyle = '#cdc7b8'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 130; i++) {
      g.strokeStyle = 'rgba(150,144,130,' + (0.05 + Math.random() * 0.16) + ')'
      g.lineWidth = 0.8
      const v = Math.random() > 0.5
      const p = Math.random() * s
      g.beginPath()
      if (v) { g.moveTo(p, 0); g.lineTo(p, s) } else { g.moveTo(0, p); g.lineTo(s, p) }
      g.stroke()
    }
    for (let i = 0; i < 22; i++) {
      g.fillStyle = 'rgba(118,112,96,' + (0.06 + Math.random() * 0.2) + ')'
      g.beginPath()
      g.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 44,
        6 + Math.random() * 26, Math.random() * 3, 0, 7)
      g.fill()
    }
    // vincos: o pano ficou dobrado no mesmo lugar tempo demais
    for (let i = 0; i < 7; i++) {
      const y = Math.random() * s
      g.strokeStyle = 'rgba(96,90,76,0.28)'; g.lineWidth = 1.6 + Math.random() * 2
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= s; x += 24) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 5)
      g.stroke()
    }
  }, 1)
}

/** Ferrugem da calha: chapa cinza comida por manchas laranja. */
function ferrugemTex() {
  return tex('casa-ferrugem', 128, (g, s) => {
    g.fillStyle = '#948b7e'; g.fillRect(0, 0, s, s)
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * s, y = Math.random() * s, r = 3 + Math.random() * 20
      g.fillStyle = Math.random() > 0.4
        ? 'rgba(178,96,42,' + (0.2 + Math.random() * 0.6) + ')'
        : 'rgba(124,70,36,' + (0.2 + Math.random() * 0.6) + ')'
      g.beginPath()
      g.ellipse(x, y, r, r * (0.4 + Math.random() * 0.8), Math.random() * 3, 0, 7)
      g.fill()
    }
    for (let i = 0; i < 200; i++) {
      g.fillStyle = 'rgba(30,22,16,' + (Math.random() * 0.35) + ')'
      g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2)
    }
  }, 1)
}

// ---------------------------------------------------------------------------
// MATERIAIS. Getters: a textura so e gerada se a peca que a usa for construida
// (e stdMat/solid ja cacheiam por chave).
// ---------------------------------------------------------------------------
const M = {
  get tabua() { return stdMat('casa-tabua', { map: veioTex(), roughness: 0.94 }) },
  // As duas tabuas MOLHADAS. A umidade do rodape nao podia ficar so no
  // decalque: decalque e transparente, e o three ordena transparente por
  // distancia — o decalque de tinta (que tambem e transparente e esta na
  // mesma parede) acabava desenhado por cima e comia a mancha justamente na
  // faixa de baixo. Escurecendo o MATERIAL das fileiras baixas a mancha existe
  // no opaco e nao depende de ordem nenhuma; o plano de umidade por cima so
  // acrescenta a borda ondulada e os escorridos.
  get tabuaUmida() { return stdMat('casa-tabua-umida', { map: veioTex(), roughness: 0.99, color: 0x4e4a3c }) },
  get tabuaMeia() { return stdMat('casa-tabua-meia', { map: veioTex(), roughness: 0.97, color: 0x8b8472 }) },
  get tabuado() { return stdMat('casa-tabuado', { map: tabuadoTex('ext'), roughness: 0.95 }) },
  get piso() { return stdMat('casa-piso', { map: tabuadoTex('piso'), roughness: 0.92 }) },
  get forro() { return stdMat('casa-forro', { map: tabuadoTex('forro'), roughness: 0.94 }) },
  get papel() { return stdMat('casa-papel-mat', { map: papelTex(), roughness: 0.96 }) },
  // O tint escuro no decalque NAO e enfeite: com a tinta branca sobre a tabua
  // marrom o valor das duas se separa demais e a fachada vira pelagem de vaca.
  // Escurecendo a tinta ate quase o valor da madeira, o que resta e a DIFERENCA
  // DE MATIZ (cinza-esverdeado x marrom), que e como tinta velha realmente
  // aparece contra a madeira crua.
  get pintura() {
    return stdMat('casa-pintura-mat', {
      map: pinturaTex(), transparent: true, roughness: 0.9, opacity: 0.92,
      color: 0xb2ada0, depthWrite: false, side: THREE.DoubleSide,
    })
  },
  get umidade() {
    return stdMat('casa-umidade-mat', {
      map: umidadeTex(), transparent: true, roughness: 0.99,
      depthWrite: false, opacity: 1,
    })
  },
  // As tres cores nao sao decoracao: telha velha nunca queima igual, e um
  // telhado de tom unico le como plastico. A variacao entra pelo tint do
  // material (a textura e a mesma), entao continuam 3 draw calls e nao 300.
  get telha() { return stdMat('casa-telha-a', { map: telhaTex(), roughness: 0.95, color: 0xbcb0a6 }) },
  get telhaB() { return stdMat('casa-telha-b', { map: telhaTex(), roughness: 0.95, color: 0x8b8079 }) },
  get telhaC() { return stdMat('casa-telha-c', { map: telhaTex(), roughness: 0.95, color: 0xa2937f }) },
  // Ripa BEM escura: e ela que aparece onde a telha caiu, e o pedido era
  // "buracos escuros". Num tom de madeira normal a falha vira remendo claro e
  // o telhado parece consertado, nao arruinado.
  get ripa() { return solid(0x342a20, 0.97) },
  get vao() { return solid(0x14120f, 0.99) },        // fundo dos buracos
  get escuro() { return solid(0x2a251e, 0.97) },
  get ferro() { return stdMat('casa-ferro', { map: ferrugemTex(), roughness: 0.82, metalness: 0.35 }) },
  get metal() { return solid(0x5f5a52, 0.7, 0.45) },
  get vidro() {
    return stdMat('casa-vidro-mat', {
      map: vidroTex(), transparent: true, opacity: 0.72, roughness: 0.55,
      metalness: 0.05, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // Lencol POEIRENTO e nao branco. Num comodo escuro um pano claro e liso e a
  // coisa mais brilhante da cena e o sofa coberto vira banheira; o que faz o
  // pano ler como esquecido ha anos e a mancha de poeira, nao a cor.
  get lencol() {
    return stdMat('casa-lencol', { map: lencolTex(), roughness: 0.99, color: 0xa39d8c })
  },
  get papelao() { return solid(0x9c7c53, 0.96) },
  get papelaoEsc() { return solid(0x7d6142, 0.96) },
  get feno() { return solid(0xa89159, 0.98) },
  get fenoEsc() { return solid(0x8a7642, 0.98) },
  get sofa() { return solid(0x5c4a3f, 0.95) },
  /* As duas marcas que o movel retirado deixou. Sao decalques quase
     transparentes: o que se ve e a MADEIRA por baixo, um pouco mais clara (onde
     o sol nao bateu) ou um pouco mais fosca (onde a poeira ficou). Opacidade
     alta aqui viraria um tapete branco. */
  get marcaClara() {
    return stdMat('casa-marca-clara', {
      color: 0xb49a72, transparent: true, opacity: 0.20, depthWrite: false,
      roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    })
  },
  get marcaPoeira() {
    return stdMat('casa-marca-poeira', {
      map: poeiraTex(), color: 0xcdc4b0, transparent: true, opacity: 0.34,
      depthWrite: false, roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    })
  },
  get bulbo() { return emissive(0xffdca8, 2.2) },
  // A aranha e escura mas nao preta: preto puro num canto sem luz vira um
  // buraco, e o que se quer e uma silhueta que se reconheca a dois metros.
  get aranha() { return solid(0x241f1c, 0.85) },
  get fio() { return solid(0x201c18, 0.9) },
  get poeira() {
    return stdMat('casa-poeira-mat', {
      map: poeiraTex(), transparent: true, opacity: 0.16, depthWrite: false,
      side: THREE.DoubleSide, roughness: 1,
      emissive: 0xffffff, emissiveMap: poeiraTex(), emissiveIntensity: 0.08,
    })
  },
  calcada(w, d) {
    const rx = Math.max(0.2, w * 0.26), ry = Math.max(0.2, d * 0.26)
    return stdMat('casa-calc:' + rx.toFixed(2) + ':' + ry.toFixed(2), {
      // MESMA cor e mesma densidade do avental do cassino: os dois lotes se
      // encostam no quarteirao e uma calcada mudar de tom no meio do caminho
      // denuncia a emenda entre os dois predios.
      map: tiled(concreteTex(1), rx, ry), color: 0xd9d4cb, roughness: 0.98,
    })
  },
  teia(modo) {
    // emissiveMap fraco de proposito: a teia mora em canto de sombra, e sem um
    // fio de luz propria ela some justamente onde deveria aparecer.
    const t = teiaTex(modo)
    // 0.66 e nao 0.95, e o emissivo caiu de 0.55 pra 0.26. Com o desenho novo
    // (fio fino, borda rasgada) a opacidade antiga fazia a teia ler como GIZ
    // desenhado na parede: linha branca cheia, sem nada da parede atravessando.
    // Teia e fio: da pra ver o que esta atras dela.
    return stdMat('casa-teia-mat:' + modo, {
      map: t, transparent: true, opacity: 0.66, depthWrite: false,
      side: THREE.DoubleSide, roughness: 1,
      emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.26,
    })
  },
}

// ---------------------------------------------------------------------------
// HELPERS DE MONTAGEM
// ---------------------------------------------------------------------------

/**
 * Caixa com a UV remapeada em METROS. BoxGeometry da 0..1 por face, entao uma
 * tabua de 4 m e uma de 1 m com o mesmo material sairiam com o veio esticado
 * em escalas diferentes. Multiplicando a UV pelo tamanho real, um material so
 * atende a parede inteira — e o forno funde tudo num mesh.
 * ox/oy sao opcionais e servem pra quem quebra uma superficie em varios
 * pedacos (o assoalho contornando os buracos): sem deslocar a UV pela posicao
 * de cada pedaco, cada um recomeca o desenho do zero e a junta salta.
 */
function caixaUV(w, h, d, mat, x, y, z, ux, uy, ox, oy) {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * ux + (ox || 0), uv.getY(i) * uy + (oy || 0))
  }
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true; m.receiveShadow = true
  return m
}

/**
 * Plano vertical com UV remapeada E DESLOCADA. O deslocamento e o que salva o
 * decalque de tinta: com um mapa so e a UV sempre em 0..1, as 15 fileiras de
 * tabua descascariam exatamente no mesmo lugar e a parede viraria xadrez.
 */
function planoUV(w, h, mat, x, y, z, ry, ux, uy, ox, oy) {
  const geo = new THREE.PlaneGeometry(w, h)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * ux + (ox || 0), uv.getY(i) * uy + (oy || 0))
  }
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.rotation.y = ry || 0
  m.castShadow = false
  m.receiveShadow = true
  return m
}

/** Laje fina (topo em y=h) que nao projeta sombra: avental de calcada. */
function laje(g, x0, x1, z0, z1, h, mat) {
  const m = box(x1 - x0, h, z1 - z0, mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2)
  m.castShadow = false
  g.add(m)
}

/**
 * Corridas de X livres em [x0,x1] descontando os vaos que cruzam a faixa de
 * altura [y0,y1]. E o mesmo problema do pilaresFachada do cassino, so que aqui
 * cada FILEIRA de tabua quer a propria resposta: a tabua na altura do peitoril
 * e cortada pela janela, a de cima nao.
 */
function faixasLivres(x0, x1, y0, y1, vaos) {
  const cortes = []
  for (let i = 0; i < vaos.length; i++) {
    const v = vaos[i]
    if (v.y1 <= y0 + 1e-6 || v.y0 >= y1 - 1e-6) continue
    const a = Math.max(v.x0, x0), b = Math.min(v.x1, x1)
    if (b > a) cortes.push([a, b])
  }
  cortes.sort((a, b) => a[0] - b[0])
  const out = []
  let cur = x0
  for (let i = 0; i < cortes.length; i++) {
    const c = cortes[i]
    if (c[1] <= cur) continue
    if (c[0] > cur + 0.02) out.push([cur, c[0]])
    cur = Math.max(cur, c[1])
  }
  if (cur < x1 - 0.02) out.push([cur, x1])
  return out
}

/**
 * Teia na quina VERTICAL de dois planos (parede/parede). O plano vai na
 * diagonal do canto: (sx,sz) sao os sinais da direcao pra dentro do comodo, e
 * as duas pontas do plano encostam uma em cada parede.
 */
/**
 * Pendura uma teia numa quina. Devolve o PIVO, que e quem balanca.
 *
 * O pivo fica na LINHA DE CIMA da teia, e nao no centro dela: teia presa no
 * teto oscila como um pano pregado em cima, entao girar pelo centro faria a
 * borda de cima descolar da parede. Ele e marcado como dinamico pro forno de
 * world/bake.js nao congelar o balanco.
 *
 * `comAranha` poe uma aranha parada num ponto da teia. Nao vai em todas de
 * proposito: quatro aranhas numa sala e infestacao, uma ou duas e abandono.
 */
function teiaDeCanto(g, cx, cz, sx, sz, w, yTopo, mat, comAranha) {
  const k = (w / 2) / Math.SQRT2
  const pivo = new THREE.Group()
  pivo.position.set(cx + sx * k, yTopo, cz + sz * k)
  pivo.rotation.y = Math.atan2(sx, sz)
  pivo.userData.dynamic = true
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w), mat)
  m.position.y = -w / 2
  m.castShadow = false
  pivo.add(m)
  if (comAranha) {
    const ar = aranha(1)
    // no terco de dentro da teia, um pouco fora do eixo: aranha no centro exato
    // parece enfeite pregado
    ar.position.set(-sx * w * 0.17, -w * 0.34, 0.004)
    pivo.add(ar)
  }
  g.add(pivo)
  return pivo
}

/**
 * Marca a subarvore inteira como projetora/recebedora de sombra.
 * Menos o que for TRANSPARENTE: o mapa de sombra so recorta o alpha do mapa
 * quando o material tem alphaTest, e nenhum aqui tem. Um plano de texto com
 * fundo transparente (o "42" da porta, o VENDE-SE da placa) projetava a tarja
 * RETANGULAR inteira no chao. Os dois ja nasciam com castShadow=false; era
 * este traverse que os reacendia depois.
 */
function sombras(o) {
  o.traverse((c) => {
    if (!c.isMesh) return
    c.castShadow = !(c.material && c.material.transparent)
    c.receiveShadow = true
  })
  return o
}

// ===========================================================================
// A. CASCA
// ===========================================================================

/**
 * Avental de calcada em volta do lote. Igual ao cassino: 4 tiras que passam
 * POR BAIXO das paredes; o miolo fica sem laje porque quem cobre ele e o piso
 * de tabua do interior, e duas lajes no mesmo Y brigam por z-fighting.
 */
function moldura(g) {
  laje(g, AV.x0, B.x0 + T, AV.z0, AV.z1, BASE, M.calcada(B.x0 + T - AV.x0, AV.z1 - AV.z0))
  laje(g, B.x1 - T, AV.x1, AV.z0, AV.z1, BASE, M.calcada(AV.x1 - B.x1 + T, AV.z1 - AV.z0))
  laje(g, B.x0 + T, B.x1 - T, B.z1 - T, AV.z1, BASE, M.calcada(B.x1 - B.x0, AV.z1 - B.z1 + T))
  laje(g, B.x0 + T, B.x1 - T, AV.z0, B.z0 + T, BASE, M.calcada(B.x1 - B.x0, T))
}

/** Casca estrutural: 4 paredes externas com os vaos recortados. */
function paredes(g, colliders, occluders) {
  const fz0 = B.z0, fz1 = B.z0 + T

  // --- laterais e fundos: tabuado corrido -------------------------------
  const lateral = (x0, x1, z0, z1) => {
    g.add(caixaUV(x1 - x0, H, z1 - z0, M.tabuado, (x0 + x1) / 2, H / 2, (z0 + z1) / 2,
      Math.max(x1 - x0, z1 - z0) / 1.4, H / 1.4))
  }
  lateral(B.x0, B.x0 + T, B.z0, B.z1)                    // oeste
  lateral(B.x0, B.x1, B.z1 - T, B.z1)                    // fundos
  // leste: partida pela janelinha do braco
  const eSeg = [[B.z0, JAN_E.z0, 0, H], [JAN_E.z1, B.z1, 0, H],
    [JAN_E.z0, JAN_E.z1, 0, JAN_E.y0], [JAN_E.z0, JAN_E.z1, JAN_E.y1, H]]
  for (let i = 0; i < eSeg.length; i++) {
    const s = eSeg[i]
    g.add(caixaUV(T, s[3] - s[2], s[1] - s[0], M.tabuado, B.x1 - T / 2, (s[2] + s[3]) / 2,
      (s[0] + s[1]) / 2, (s[1] - s[0]) / 1.4, (s[3] - s[2]) / 1.4))
  }

  // --- fachada: nucleo ESCURO ---------------------------------------------
  // Ela nao leva tabuado de textura porque leva tabua de geometria por cima; o
  // que sobra aparecendo e a fresta entre tabuas e o rebaixo dos vaos, e os
  // dois tem que ser sombra, nao madeira clara.
  const faixas = [[0, JAN_Y0], [JAN_Y0, JAN_Y1], [JAN_Y1, DH], [DH, H]]
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i]
    const runs = faixasLivres(B.x0, B.x1, f[0], f[1], VAOS_F)
    for (let r = 0; r < runs.length; r++) {
      g.add(box(runs[r][1] - runs[r][0], f[1] - f[0], T, M.escuro,
        (runs[r][0] + runs[r][1]) / 2, (f[0] + f[1]) / 2, (fz0 + fz1) / 2))
    }
  }

  // --- colisores: 4 paredes com o vao da porta LIVRE ----------------------
  colliders.push({ minX: B.x0, maxX: B.x0 + T, minZ: B.z0, maxZ: B.z1, tag: 'casa-parede' })
  colliders.push({ minX: B.x1 - T, maxX: B.x1, minZ: B.z0, maxZ: B.z1, tag: 'casa-parede' })
  colliders.push({ minX: B.x0, maxX: B.x1, minZ: B.z1 - T, maxZ: B.z1, tag: 'casa-parede' })
  colliders.push({ minX: B.x0, maxX: DL, minZ: fz0, maxZ: fz1, tag: 'casa-fachada' })
  colliders.push({ minX: DR, maxX: B.x1, minZ: fz0, maxZ: fz1, tag: 'casa-fachada' })

  // --- occluders de camera: as mesmas paredes, agora COM altura -----------
  const occ = (minX, minY, minZ, maxX, maxY, maxZ, tag) =>
    occluders.push({ minX, minY, minZ, maxX, maxY, maxZ, tag })
  occ(B.x0, 0, B.z0, B.x0 + T, H, B.z1, 'casa-parede')
  occ(B.x1 - T, 0, B.z0, B.x1, H, B.z1, 'casa-parede')
  occ(B.x0, 0, B.z1 - T, B.x1, H, B.z1, 'casa-parede')
  occ(B.x0, 0, fz0, DL, H, fz1, 'casa-fachada')
  occ(DR, 0, fz0, B.x1, H, fz1, 'casa-fachada')
  occ(DL, DH, fz0, DR, H, fz1, 'casa-verga')
}

/**
 * TABUAS DA FACHADA. Fileiras horizontais de espessura desigual, duas soltas e
 * duas faltando. O torto so vai em corrida CURTA: girar 2 graus uma tabua de
 * 12 m levanta a ponta 40 cm e ela sai da parede — o desalinho tem que caber
 * dentro do pedaco de parede em que ele acontece.
 */
function tabuasDaFachada(g) {
  const rnd = mulberry32(0xCA5A01)
  const zc = B.z0 - 0.025          // a tabua fica 5 cm a frente do nucleo
  // As fileiras nascem ALINHADAS as bordas dos vaos, nunca com altura livre.
  // Motivo: faixasLivres corta a corrida inteira quando a fileira encosta num
  // vao, mesmo que so 2 cm dela passem por cima da janela — e a fileira que
  // cavalgava o peitoril virava uma tarja preta atravessada em cima do vidro.
  // Com os cortes em Y nas bordas dos vaos, nenhuma tabua cavalga nada. A
  // "espessura levemente diferente" pedida vem do esp (a saliencia) e da altura
  // que cada trecho distribui, nao de um sorteio que desalinharia tudo.
  const cortesY = [0, JAN_Y0, JAN_Y1, DH, H]
  let fila = 0
  for (let s = 0; s < cortesY.length - 1; s++) {
    const yA = cortesY[s], yB = cortesY[s + 1]
    const n = Math.max(1, Math.round((yB - yA) / 0.225))
    const passo = (yB - yA) / n
    for (let i = 0; i < n; i++) {
      const y = yA + i * passo
      const y1 = y + passo
      const esp = 0.035 + rnd() * 0.022
      const runs = faixasLivres(B.x0, B.x1, y + 0.002, y1 - 0.002, VAOS_F)
      for (let r = 0; r < runs.length; r++) {
        const a = runs[r][0], b = runs[r][1], w = b - a
        // Duas tabuas faltando: o buraco escuro denuncia que por tras da tinta
        // nao tem nada. A escolha e por (fileira, X que a corrida cobre) e nao
        // por indice de corrida — a quantidade de corridas muda com a altura da
        // fileira (janela corta, verga nao), entao indice fixo tirava tabua de
        // lugar diferente a cada mudanca de medida.
        // As DUAS escolhidas caem na faixa das janelas de proposito: la a
        // corrida ja e curta (1..2 m) e some uma tabua. Nas faixas cheias a
        // corrida atravessa os 12 m da fachada e tirar uma abriria uma tarja
        // preta de ponta a ponta — foi o que aconteceu ao mirar a fileira 12.
        // Os X miram as corridas CURTAS entre a janela e a porta: com a
        // fachada de 14 m, tirar uma tabua de uma corrida cheia abriria uma
        // tarja preta de ponta a ponta. 44.7 cai em [44.0, 45.50] e 41.0 cai
        // em [40.30, 42.0], as duas corridas curtas da faixa das janelas.
        if ((fila === 8 && a < 44.7 && b > 44.7) || (fila === 6 && a < 41.0 && b > 41.0)) continue
        const molhada = fila <= 1 ? M.tabuaUmida : fila === 2 ? M.tabuaMeia : M.tabua
        const m = caixaUV(w - 0.012, passo - 0.014, esp, molhada,
          (a + b) / 2, (y + y1) / 2, zc - esp / 2, w / 1.15, 1)
        if (w < 3.2 && (fila === 3 || fila === 9 || fila === 13)) {
          // solta de um prego so: gira no plano da parede e adianta a ponta
          m.rotation.z = (fila === 9 ? -1 : 1) * (0.018 + rnd() * 0.016)
          m.position.z -= 0.022
        }
        g.add(m)
        // Decalque de tinta acompanhando a tabua, com a UV deslocada por
        // fileira. As duas de baixo ficam sem: tinta nao sobrevive no rodape
        // encharcado, e a falta dela e o que separa a faixa molhada do resto.
        if (fila <= 1) continue
        const d = planoUV(w - 0.012, passo - 0.014, M.pintura,
          (a + b) / 2, (y + y1) / 2, zc - esp - 0.008, Math.PI,
          w / 1.35, 0.16, rnd() * 4, rnd() * 4)
        d.rotation.z = m.rotation.z ? -m.rotation.z : 0
        if (m.rotation.z) { d.position.y = m.position.y; d.position.z = m.position.z - esp / 2 - 0.01 }
        g.add(d)
      }
      fila++
    }
  }

  // Umidade subindo do rodape, dos dois lados da porta. Fica a frente da tabua
  // MAIS SALIENTE (as soltas adiantam 2 cm), senao a mancha some atras delas
  // exatamente nas fileiras em que a agua mais escorre.
  const alt = 1.22
  const lados = [[B.x0, DL], [DR, B.x1]]
  for (let i = 0; i < lados.length; i++) {
    const a = lados[i][0], b = lados[i][1]
    g.add(planoUV(b - a, alt, M.umidade, (a + b) / 2, alt / 2, zc - 0.11, Math.PI,
      (b - a) / 5.5, 1, i * 0.37, 0))
  }
}

/** Janelas da fachada e do braco: caixilho, vidro sujo e o X pregado. */
function janelas(g) {
  const zc = B.z0 - 0.02
  const vidraca = (v) => {
    const w = v.x1 - v.x0, h = v.y1 - v.y0, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2
    const vd = box(w - 0.10, h - 0.10, 0.02, M.vidro, cx, cy, B.z0 + T / 2)
    vd.castShadow = false
    g.add(vd)
    // caixilho: peitoril saliente, verga e dois montantes
    g.add(caixaUV(w + 0.16, 0.10, 0.20, M.tabua, cx, v.y0 - 0.05, zc - 0.05, (w + 0.16) / 1.2, 1))
    g.add(caixaUV(w + 0.16, 0.09, 0.14, M.tabua, cx, v.y1 + 0.045, zc - 0.02, (w + 0.16) / 1.2, 1))
    for (const s of [-1, 1]) {
      g.add(caixaUV(0.09, h, 0.13, M.tabua, cx + s * (w / 2 + 0.045), cy, zc - 0.02, 1, h / 1.2))
    }
    // cruzeta interna: sem ela a vidraca vira um retangulo verde chapado
    g.add(box(w - 0.10, 0.05, 0.07, M.tabua, cx, cy, zc - 0.01))
    g.add(box(0.05, h - 0.10, 0.07, M.tabua, cx, cy, zc - 0.01))
  }
  vidraca(JAN_L)
  vidraca(JAN_R)

  // TABUA PREGADA EM X por fora da janela grande. Quem pregou nao mediu: as
  // duas pontas sobram do caixilho e uma delas esta mais baixa que a outra.
  const cx = (JAN_R.x0 + JAN_R.x1) / 2, cy = (JAN_R.y0 + JAN_R.y1) / 2
  const w = JAN_R.x1 - JAN_R.x0 + 0.5, h = JAN_R.y1 - JAN_R.y0 + 0.4
  const comp = Math.hypot(w, h)
  for (const s of [-1, 1]) {
    const t = caixaUV(comp, 0.19, 0.045, M.tabua, cx, cy + (s > 0 ? 0.05 : -0.03),
      zc - 0.12, comp / 1.15, 1)
    t.rotation.z = s * Math.atan2(h, w)
    g.add(t)
    for (const k of [-1, 1]) {
      const p = box(0.035, 0.035, 0.05, M.metal,
        cx + k * (comp / 2 - 0.16) * Math.cos(s * Math.atan2(h, w)),
        cy + k * (comp / 2 - 0.16) * Math.sin(s * Math.atan2(h, w)) + (s > 0 ? 0.05 : -0.03),
        zc - 0.155)
      p.castShadow = false
      g.add(p)
    }
  }

  // janela do braco, na parede leste (girada 90 graus)
  const ez = (JAN_E.z0 + JAN_E.z1) / 2, eh = JAN_E.y1 - JAN_E.y0
  const ew = JAN_E.z1 - JAN_E.z0, ey = (JAN_E.y0 + JAN_E.y1) / 2
  const evd = box(0.02, eh - 0.10, ew - 0.10, M.vidro, B.x1 - T / 2, ey, ez)
  evd.castShadow = false
  g.add(evd)
  g.add(caixaUV(0.20, 0.10, ew + 0.16, M.tabua, B.x1 + 0.03, JAN_E.y0 - 0.05, ez, 1, 1))
  g.add(caixaUV(0.14, 0.09, ew + 0.16, M.tabua, B.x1 + 0.01, JAN_E.y1 + 0.045, ez, 1, 1))
  g.add(box(0.07, 0.05, ew - 0.10, M.tabua, B.x1 + 0.005, ey, ez))
}

/**
 * PORTA entreaberta. Dobradica de baixo solta: o pivo gira em Y (a porta abre)
 * e a folha, filha do pivo, cai um pouco em Z — a ponta livre raspa o chao,
 * que e exatamente o que uma porta com dobradica arrebentada faz.
 * Abre pra DENTRO: aberta pra fora ela ficaria em cima do estrado da varanda.
 */
/**
 * A porta. Ela ABRE E FECHA de verdade (E, quando o jogador chega perto).
 *
 * Devolve o pivo pra quem monta a casa poder anima-lo. Ele e o UNICO no da
 * casca marcado como dinamico: sem isso o forno de world/bake.js funde a folha
 * na parede e a porta vira desenho.
 *
 * Ela nasce FECHADA. Uma casa abandonada de porta escancarada nao le como
 * abandonada, e a primeira missao do tutorial ("entre e conheca seu primeiro
 * estabelecimento") ganha um gesto em vez de ser so andar pra frente.
 */
/**
 * A PORTA, DE CORRER, DUAS FOLHAS, NUM TRILHO POR FORA DA FACHADA.
 *
 * Ela era de girar e entrava PRA DENTRO. Medido: pivo em (42,20 ; 12,15),
 * folha de 1,57 m, abertura de 110 graus — a ponta parava a 1,47 m dentro da
 * sala e o arco varria 2,37 m², bem na quina onde vai o balcao. Numa sala que
 * tinha 4,10 m de fundura, isso era 36% da fundura. O dono do projeto mandou
 * resolver ("a porta n pode abrir pra dentro, se quiser mudar o formato dela
 * pode mudar").
 *
 * ABRIR PRA FORA NAO RESOLVIA: a ponta cairia em z = 10,67, dentro do estrado
 * da varanda, varrendo justamente o ponto onde o jogador fica pra apertar E
 * (z = 11,65) e batendo no esteio.
 *
 * De correr custa ZERO dos dois lados. Cada folha desliza 1,03 m pela fachada,
 * por fora: a oeste sobra 0,67 m ate a janela (JAN_L termina em 40,30) e a
 * leste 0,47 m (JAN_R comeca em 45,50). E o colisor deixa de precisar de conta
 * de arco: vira uma caixa que liga e desliga.
 *
 * De quebra e mais tematico que a original — porta de celeiro num trilho
 * enferrujado e exatamente o que uma casa velha virando casa de jogos teria.
 *
 * Devolve as DUAS folhas. Elas levam userData.dynamic: sem isso o forno de
 * world/bake.js as funde na parede e a porta vira desenho.
 */
function porta(g) {
  // 3 cm de sobreposicao no meio: duas folhas de metade exata do vao deixariam
  // uma fresta de luz na juncao quando fechadas.
  const fw = B.door.width / 2 + 0.03
  const lh = DH - 0.04
  // 8 cm a frente da tabua mais saliente da fachada (as soltas adiantam 2 cm) e
  // a frente do plano de umidade (z = zc - 0.11): sem isso as superficies
  // piscam uma dentro da outra.
  const zf = B.z0 - 0.20
  const folhas = []

  for (const lado of [-1, 1]) {
    const pivo = new THREE.Group()
    // fechada: a folha oeste ocupa DL..centro, a leste centro..DR
    pivo.position.set(B.door.center + lado * fw / 2, 0, zf)
    pivo.userData.dynamic = true
    pivo.userData.correr = lado          // pra que lado esta folha corre

    pivo.add(caixaUV(fw, lh, 0.05, M.tabua, 0, lh / 2, 0, fw / 0.9, lh / 1.6))
    // travessas e diagonal de celeiro: folha lisa nao parece porta de madeira
    for (const y of [0.30, lh - 0.26]) {
      pivo.add(caixaUV(fw - 0.04, 0.11, 0.02, M.tabua, 0, y, -0.036, fw / 0.9, 1))
    }
    const diag = caixaUV(Math.hypot(fw - 0.1, lh - 0.66), 0.10, 0.02, M.tabua, 0, lh / 2, -0.036, 2, 1)
    diag.rotation.z = lado * Math.atan2(lh - 0.66, fw - 0.1)
    pivo.add(diag)

    // ferragem: duas roldanas por folha, penduradas no trilho
    for (const s of [-1, 1]) {
      const braco = box(0.035, 0.16, 0.03, M.ferro, s * (fw / 2 - 0.14), lh + 0.06, -0.01)
      pivo.add(braco)
      const rol = cyl(0.055, 0.055, 0.026, M.ferro, 10)
      rol.rotation.z = Math.PI / 2
      rol.position.set(s * (fw / 2 - 0.14), lh + 0.14, -0.01)
      pivo.add(rol)
    }
    // puxador de barra chata, do lado de fora
    const pux = cyl(0.018, 0.018, 0.28, M.metal, 8)
    pux.position.set(-lado * (fw / 2 - 0.16), lh * 0.47, -0.055)
    pivo.add(pux)

    sombras(pivo)
    g.add(pivo)
    folhas.push(pivo)
  }

  // O 42 vai na folha LESTE, virado pra rua.
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), textPlaneMat('42', {
    w: 256, h: 180, color: '#c9bda0', font: 'bold 150px "Trebuchet MS", sans-serif',
    stroke: '#3a3128', emissiveIntensity: 0.05,
  }))
  num.position.set(0.10, lh - 0.40, -0.031)
  num.rotation.z = 0.21
  num.rotation.y = Math.PI
  num.castShadow = false
  folhas[1].add(num)

  // TRILHO: um U de ferro correndo a fachada acima do vao, com dois suportes.
  // Ele nao e dinamico — quem corre e a folha.
  const trilhoW = B.door.width + 2.4
  g.add(box(trilhoW, 0.07, 0.05, M.ferro, B.door.center, DH + 0.19, zf + 0.02))
  for (const s of [-1, 1]) {
    g.add(box(0.06, 0.16, 0.10, M.ferro, B.door.center + s * (trilhoW / 2 - 0.12), DH + 0.12, zf + 0.06))
  }

  // batente + soleira gasta
  for (const s of [-1, 1]) {
    g.add(caixaUV(0.09, DH + 0.08, T + 0.08, M.tabua,
      B.door.center + s * (B.door.width / 2 + 0.03), (DH + 0.08) / 2, B.z0 + T / 2, 1, DH / 1.2))
  }
  g.add(caixaUV(B.door.width + 0.2, 0.10, T + 0.08, M.tabua,
    B.door.center, DH + 0.05, B.z0 + T / 2, (B.door.width + 0.2) / 1.2, 1))
  const sol = box(B.door.width + 0.06, 0.035, T + 0.06, M.tabua, B.door.center, BASE + 0.012, B.z0 + T / 2)
  sol.castShadow = false
  g.add(sol)

  // teia na quina de cima do vao
  const tw = 0.5
  const teia = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw), M.teia('esq'))
  teia.position.set(DR - tw / 2, DH - tw / 2 - 0.02, B.z0 - 0.09)
  teia.rotation.y = Math.PI
  teia.castShadow = false
  g.add(teia)

  return folhas
}

/**
 * UMA AGUA de telhado, em coordenadas locais: x centrado, y=0 no plano do
 * madeiramento, z crescendo da cumeeira pro beiral.
 * Cada telha e um mesh proprio sobre UMA BoxGeometry compartilhada: e a unica
 * forma de uma telha FALTAR de verdade (textura com buraco pintado nao engana
 * ninguem de perto), e o forno funde as 300 num mesh por cor depois.
 */
function aguaDeTelhado(g, larg, comp, semente, nCol, nLin, mats, furosDoDeck) {
  const rnd = mulberry32(semente)
  const dCol = 13, dLin = 8
  // Buraco no madeiramento: UM so, e pequeno. Dois sorteios livres caiam um do
  // lado do outro e viravam uma cratera no meio da agua — o pedido e "algumas
  // telhas faltando", nao telhado desabado.
  const furos = new Set()
  for (let i = 0; i < (furosDoDeck || 0); i++) {
    furos.add((1 + Math.floor(rnd() * (dLin - 2))) * dCol + 1 + Math.floor(rnd() * (dCol - 2)))
  }
  // Telhas soltas: manchas de 1..2 numa fileira so, e com distancia minima
  // entre elas. Sem a rejeicao por proximidade os sorteios se encostam e o
  // olho le um buraco grande em vez de varios pequenos.
  const faltam = new Set()
  const marcas = []
  for (let i = 0; i < 60 && marcas.length < 8; i++) {
    const c0 = Math.floor(rnd() * (nCol - 1)), l0 = Math.floor(rnd() * nLin)
    let perto = false
    for (let k = 0; k < marcas.length; k++) {
      if (Math.abs(marcas[k][0] - c0) < 4 && Math.abs(marcas[k][1] - l0) < 3) { perto = true; break }
    }
    if (perto) continue
    marcas.push([c0, l0])
    const w = 1 + Math.floor(rnd() * 2)
    for (let c = c0; c < Math.min(nCol, c0 + w); c++) faltam.add(l0 * nCol + c)
  }

  // fundo: fecha todo buraco com sombra em vez de deixar ver o sotao pelo lado
  const f = box(larg, 0.03, comp, M.vao, 0, -0.035, comp / 2)
  f.castShadow = false
  g.add(f)

  // madeiramento
  const dw = larg / dCol, dh = comp / dLin
  for (let l = 0; l < dLin; l++) {
    let ini = -1
    for (let c = 0; c <= dCol; c++) {
      const vazio = c === dCol || furos.has(l * dCol + c)
      if (!vazio) { if (ini < 0) ini = c; continue }
      if (ini >= 0) {
        g.add(box((c - ini) * dw - 0.01, 0.05, dh - 0.015, M.ripa,
          -larg / 2 + ((ini + c) / 2) * dw, 0, (l + 0.5) * dh))
        ini = -1
      }
    }
  }

  // telhas
  const tw = larg / nCol, tl = comp / nLin
  const geo = new THREE.BoxGeometry(tw + 0.012, 0.05, tl + 0.045)
  for (let l = 0; l < nLin; l++) {
    const dl = Math.floor((l / nLin) * dLin)
    for (let c = 0; c < nCol; c++) {
      if (faltam.has(l * nCol + c)) continue
      if (furos.has(dl * dCol + Math.floor((c / nCol) * dCol))) continue
      // A cor sai do PRNG e nao de (l * 3 + c) % 3: aquele l * 3 e sempre
      // multiplo de 3, entao a fileira nao entrava na conta e o telhado saia
      // com 30 listras verticais A-B-C de ponta a ponta — o oposto do "telha
      // velha nunca queima igual" que as tres cores existem pra dizer.
      const m = new THREE.Mesh(geo, mats[Math.floor(rnd() * 3)])
      m.position.set(-larg / 2 + (c + 0.5) * tw, 0.055 + (rnd() - 0.5) * 0.012, (l + 0.5) * tl)
      m.rotation.y = (rnd() - 0.5) * 0.03
      m.castShadow = true; m.receiveShadow = true
      g.add(m)
    }
  }
}

/** Telhado de 2 aguas, empenas laterais e cumeeira. */
function telhado(g) {
  const mats = [M.telha, M.telhaB, M.telhaC]
  const cx = (TEL_X0 + TEL_X1) / 2
  for (const lado of [1, -1]) {
    const agua = new THREE.Group()
    agua.position.set(cx, Y_CUM, TEL_Z)
    agua.rotation.y = lado > 0 ? 0 : Math.PI   // +1 = fundos (+Z), -1 = rua (-Z)
    const incl = new THREE.Group()
    incl.rotation.x = TEL_ANG                  // +z local passa a descer
    agua.add(incl)
    // so a agua da FRENTE ganha buraco de madeiramento: e a que se ve da rua,
    // e dois buracos numa casa deste tamanho ja seria ruina, nao abandono
    aguaDeTelhado(incl, TEL_W, TEL_SL, lado > 0 ? 0x7E10 : 0x33A7,
      TEL_COL, TEL_LIN, mats, lado > 0 ? 0 : 1)
    g.add(agua)
  }

  // cumeeira em dois pedacos com uma falha no meio
  for (const seg of [[TEL_X0, cx - 1.1], [cx - 0.2, TEL_X1]]) {
    const m = box(seg[1] - seg[0], 0.13, 0.44, M.telhaB, (seg[0] + seg[1]) / 2, Y_CUM + 0.06, TEL_Z)
    g.add(m)
  }

  // EMPENAS: a tapa entre o topo da parede e as duas aguas. Sem elas da pra
  // ver o sotao (e o miolo da casa) de lado, da calcada.
  //
  // NAO e um triangulo. Um triangulo de base 10 e apice na cumeeira sobe com
  // inclinacao 0.38, mais que a agua (0.32), entao ele so encosta no telhado
  // perto da cumeeira: na ponta, em cima da parede, sobrava uma fresta de 25
  // cm correndo os 10 m do beiral — exatamente o buraco que a empena existe
  // pra fechar. A agua nasce ACIMA do topo da parede porque o madeiramento e
  // as telhas tem espessura, entao a empena tem que subir reto esse tanto
  // antes de comecar a inclinar.
  const EMP = 0.30                     // sobra vertical na ponta, ate o beiral
  const shape = new THREE.Shape()
  shape.moveTo(-(B.z1 - B.z0) / 2, 0)
  shape.lineTo((B.z1 - B.z0) / 2, 0)
  shape.lineTo((B.z1 - B.z0) / 2, EMP)
  shape.lineTo(0, Y_CUM - H)
  shape.lineTo(-(B.z1 - B.z0) / 2, EMP)
  shape.closePath()
  const geo = new THREE.ShapeGeometry(shape)
  const uv = geo.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.4, uv.getY(i) / 1.4)
  const matEmp = stdMat('casa-empena', {
    map: tabuadoTex('ext'), roughness: 0.95, side: THREE.DoubleSide, color: 0xb8b0a4,
  })
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(geo, matEmp)
    m.position.set(s > 0 ? B.x1 - 0.02 : B.x0 + 0.02, H, TEL_Z)
    m.rotation.y = s * Math.PI / 2
    m.castShadow = true; m.receiveShadow = true
    g.add(m)
  }
}

/**
 * CALHA enferrujada pendurada por um lado so. O pivo fica na ponta LESTE (o
 * unico suporte que aguentou) e o resto desce: girar a calha pelo centro
 * deixaria as duas pontas fora do beiral, e o que conta a historia e uma ponta
 * presa e a outra no ar.
 */
function calha(g) {
  const zc = B.z0 - 0.50
  const pivo = new THREE.Group()
  pivo.position.set(B.x1 - 0.1, Y_BEI - 0.06, zc)
  pivo.rotation.z = 0.052                 // ~3 graus: 47 cm de queda em 9 m
  const L = 11.0
  // Perfil em U com a aba da RUA mais alta: e a unica face da calha que a
  // camera pega de baixo, e uma tira de 3 cm sumia na sombra do beiral.
  pivo.add(caixaUV(L, 0.04, 0.20, M.ferro, -L / 2, -0.08, 0, L / 0.9, 1))
  pivo.add(caixaUV(L, 0.19, 0.035, M.ferro, -L / 2, 0, -0.095, L / 0.9, 1))
  pivo.add(caixaUV(L, 0.15, 0.035, M.ferro, -L / 2, -0.02, 0.095, L / 0.9, 1))
  // suportes: o da ponta presa inteiro, o do meio dobrado, o resto sumiu
  pivo.add(box(0.04, 0.16, 0.05, M.ferro, -0.2, 0.02, 0.1))
  const sup = box(0.04, 0.2, 0.05, M.ferro, -4.6, 0.04, 0.1)
  sup.rotation.x = 0.5
  pivo.add(sup)
  sombras(pivo)
  g.add(pivo)

  // descida quebrada na esquina leste: para no meio do caminho
  const desc = cyl(0.055, 0.055, 1.35, M.ferro, 8)
  desc.position.set(B.x1 - 0.14, Y_BEI - 0.78, zc + 0.06)
  desc.rotation.z = 0.05
  sombras(desc)
  g.add(desc)
  const boca = cyl(0.075, 0.055, 0.16, M.ferro, 8)
  boca.position.set(B.x1 - 0.14, Y_BEI - 0.08, zc + 0.06)
  g.add(boca)

  // o pedaco que caiu, amassado no chao
  const caido = caixaUV(2.2, 0.04, 0.15, M.ferro, 39.6, BASE + 0.03, 11.1, 2.4, 1)
  caido.rotation.y = 0.35
  caido.rotation.z = 0.06
  caido.castShadow = false
  g.add(caido)
}

/**
 * VARANDINHA. Estrado + 2 degraus rasos (ver o comentario da constante VAR),
 * dois esteios, viga, telhadinho e o corrimao QUEBRADO: so o toco do lado
 * oeste ficou de pe, o do leste desceu pendurado num balaustre so.
 */
function varanda(g, colliders) {
  // Barrote escuro POR BAIXO do estrado. As tabuas tem folga entre si, e sem
  // esse fundo a fresta deixava ver a calcada branca do avental: em vez de
  // assoalho velho o estrado virava uma grade iluminada por baixo.
  // O topo dele fica ABAIXO da tabua mais afundada (senao o barrote espeta
  // por cima dela e o que se ve nao e uma tabua cedendo, e um rasgo preto).
  const fundo = box(VAR.x1 - VAR.x0, 0.06, VAR.z1 - VAR.z0, M.vao,
    (VAR.x0 + VAR.x1) / 2, BASE - 0.018, (VAR.z0 + VAR.z1) / 2)
  fundo.castShadow = false
  g.add(fundo)

  // estrado: tabuas soltas correndo em Z, uma delas afundada
  const n = 11
  const w = (VAR.x1 - VAR.x0) / n
  for (let i = 0; i < n; i++) {
    const afunda = i === 3 || i === 8
    const t = caixaUV(w - 0.012, 0.05, VAR.z1 - VAR.z0, M.tabua,
      VAR.x0 + (i + 0.5) * w, BASE + VAR_Y - (afunda ? 0.03 : 0) - 0.025,
      (VAR.z0 + VAR.z1) / 2, 1, (VAR.z1 - VAR.z0) / 1.1)
    if (afunda) t.rotation.x = 0.02
    t.castShadow = false
    g.add(t)
  }
  // 2 degraus: rasos porque o piso do lote e chapado (ver VAR)
  for (let i = 0; i < 2; i++) {
    const z0 = VAR.z0 - 0.30 * (i + 1), h = VAR_Y * (0.66 - i * 0.33)
    const d = caixaUV(VAR.x1 - VAR.x0 - 1.0, 0.04, 0.30, M.tabua,
      (VAR.x0 + VAR.x1) / 2, BASE + h, z0 + 0.15, 3, 1)
    d.rotation.z = i === 0 ? 0.012 : -0.008
    d.castShadow = false
    g.add(d)
  }

  // esteios + viga + telhadinho
  const yViga = BASE + 2.42
  for (let i = 0; i < POSTE_X.length; i++) {
    const x = POSTE_X[i]
    g.add(caixaUV(0.14, yViga - BASE, 0.14, M.tabua, x, BASE + (yViga - BASE) / 2, POSTE_Z, 1, 2))
    colliders.push({ minX: x - 0.11, maxX: x + 0.11, minZ: POSTE_Z - 0.11, maxZ: POSTE_Z + 0.11, tag: 'casa-esteio' })
  }
  g.add(caixaUV(VAR.x1 - VAR.x0, 0.16, 0.14, M.tabua,
    (VAR.x0 + VAR.x1) / 2, yViga + 0.08, POSTE_Z, (VAR.x1 - VAR.x0) / 1.2, 1))

  const zTel0 = VAR.z0 - 0.12, zTel1 = B.z0
  const run = zTel1 - zTel0, sobe = 0.34
  const tel = new THREE.Group()
  tel.position.set((VAR.x0 + VAR.x1) / 2, BASE + 2.96, zTel1)
  tel.rotation.y = Math.PI
  const incl = new THREE.Group()
  incl.rotation.x = Math.atan2(sobe, run)
  tel.add(incl)
  aguaDeTelhado(incl, VAR.x1 - VAR.x0 + 0.5, Math.hypot(run, sobe) + 0.25, 0x7A11, 12, 4,
    [M.telha, M.telhaB, M.telhaC])
  g.add(tel)

  // corrimao: toco a oeste, cai a leste. Sem colisor de proposito -- uma
  // caixa fina na beirada do estrado agarra o jogador na hora de entrar.
  const yCor = BASE + 0.98
  g.add(caixaUV(0.95, 0.07, 0.09, M.tabua, VAR.x0 + 0.5, yCor, POSTE_Z, 1, 1))
  for (const bx of [VAR.x0 + 0.18, VAR.x0 + 0.62]) {
    g.add(caixaUV(0.05, yCor - BASE - VAR_Y, 0.05, M.tabua, bx, (yCor + BASE) / 2, POSTE_Z, 1, 1))
  }
  const quebrado = caixaUV(1.1, 0.07, 0.09, M.tabua, VAR.x1 - 0.62, yCor - 0.30, POSTE_Z, 1, 1)
  quebrado.rotation.z = -0.62
  g.add(quebrado)
  g.add(caixaUV(0.05, 0.72, 0.05, M.tabua, VAR.x1 - 0.2, BASE + 0.45, POSTE_Z, 1, 1))

  // TEIAS nas duas quinas de cima da varanda, entre esteio e viga
  const tw = 0.62
  const lados = [['dir', POSTE_X[0] + tw / 2], ['esq', POSTE_X[1] - tw / 2]]
  for (let i = 0; i < lados.length; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(tw, tw), M.teia(lados[i][0]))
    m.position.set(lados[i][1], yViga - tw / 2, POSTE_Z - 0.02)
    m.rotation.y = Math.PI
    m.castShadow = false
    g.add(m)
  }
}

/** Mato seco, tabua caida e a placa de VENDE-SE desbotada na frente. */
function frenteAbandonada(g, colliders) {
  const rnd = mulberry32(0x4A70)
  // Tufos de mato: fora da faixa da varanda e longe do meio da calcada, senao
  // o jogador atravessa capim toda vez que passa na rua.
  //
  // NAO HA MAIS MATO DENTRO DA CASA. Havia um tufo em (41.15, 13.65) brotando
  // pela falha do assoalho, a 1 m da soleira: contava bem o tempo de abandono,
  // mas o comodo e o PRIMEIRO ESTABELECIMENTO do dono do projeto e ele entra
  // ali pra montar alguma coisa. Capim no meio do chao, logo na entrada, e
  // exatamente o tipo de coisa que ele mandou tirar junto com o sofa e as
  // caixas. A falha do assoalho fica: buraco de tabua podre nao atrapalha
  // ninguem, mato na altura do joelho atrapalha.
  const tufos = [
    [38.9, 11.4], [39.8, 10.8], [40.4, 11.6], [46.6, 11.5], [47.4, 10.9],
    [48.6, 11.4], [49.6, 10.9], [36.5, 15.2], [36.4, 19.4],
  ]
  for (let i = 0; i < tufos.length; i++) {
    const tx = tufos[i][0], tz = tufos[i][1]
    const n = 9 + Math.floor(rnd() * 4)
    for (let k = 0; k < n; k++) {
      const alt = 0.34 + rnd() * 0.62
      // O pivo fica na RAIZ, nao no meio da folha: inclinando pelo centro a
      // ponta de baixo sai do chao e o tufo levita. Por isso a folha nasce
      // deslocada meia altura pra cima dentro do proprio grupo.
      const p = new THREE.Group()
      p.position.set(tx + (rnd() - 0.5) * 0.42, BASE, tz + (rnd() - 0.5) * 0.42)
      p.rotation.z = (rnd() - 0.5) * 0.8
      p.rotation.x = (rnd() - 0.5) * 0.7
      const b = box(0.014, alt, 0.014, k % 3 ? M.feno : M.fenoEsc, 0, alt / 2, 0)
      b.castShadow = false
      p.add(b)
      g.add(p)
    }
    // duas hastes altas com a espiga seca na ponta: e o que da altura ao tufo
    for (let k = 0; k < 2; k++) {
      const alt = 0.85 + rnd() * 0.35
      const p = new THREE.Group()
      p.position.set(tx + (rnd() - 0.5) * 0.3, BASE, tz + (rnd() - 0.5) * 0.3)
      p.rotation.z = (rnd() - 0.5) * 0.5
      const h = box(0.012, alt, 0.012, M.fenoEsc, 0, alt / 2, 0)
      h.castShadow = false
      p.add(h)
      const esp = box(0.035, 0.16, 0.035, M.feno, 0, alt + 0.06, 0)
      esp.castShadow = false
      p.add(esp)
      g.add(p)
    }
  }

  // tabua caida no chao e outra encostada na parede
  const t1 = caixaUV(2.3, 0.045, 0.2, M.tabua, 41.6, BASE + 0.025, 10.9, 2.4, 1)
  t1.rotation.y = 0.42
  t1.castShadow = false
  g.add(t1)
  // encostada no trecho de parede LIMPO a leste da janela: em cima do vao ela
  // cruzava as tabuas do X e virava um rabisco em cima do outro
  const t2 = caixaUV(2.05, 0.045, 0.22, M.tabua, 49.3, BASE + 0.78, 11.55, 2.2, 1)
  t2.rotation.z = -1.02
  t2.rotation.y = 0.14
  g.add(t2)

  // PLACA DE VENDE-SE: torta nos dois eixos e desbotada (a tinta do texto
  // entra quase sem emissivo, senao um cartaz podre brilha mais que o neon do
  // cassino do lado)
  const placa = new THREE.Group()
  placa.position.set(47.9, BASE, 10.75)
  placa.rotation.y = 0.34
  placa.rotation.z = 0.10
  for (const s of [-1, 1]) {
    placa.add(caixaUV(0.06, 1.18, 0.05, M.tabua, s * 0.4, 0.59, 0, 1, 1))
  }
  placa.add(caixaUV(1.06, 0.5, 0.035, M.tabua, 0, 0.92, -0.03, 1, 1))
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.3), textPlaneMat('VENDE-SE', {
    w: 512, h: 160, color: '#a8564a', font: 'bold 96px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.04,
  }))
  txt.position.set(0, 0.94, -0.052)
  txt.rotation.y = Math.PI
  txt.castShadow = false
  placa.add(txt)
  sombras(placa)
  g.add(placa)
  colliders.push({ minX: 47.6, maxX: 48.2, minZ: 10.55, maxZ: 10.95, tag: 'casa-placa' })
}

// ===========================================================================
// B. MIOLO — tudo daqui pra baixo em Y LOCAL, com o piso em 0
// ===========================================================================

/** Piso de tabua correndo em Z, com falhas e uma tabua empenada. */
function piso(g) {
  const rnd = mulberry32(0x9150)

  // falhas: o vao escuro do barro por baixo, com a tabua vizinha erguida.
  // Buraco chapado no chao le como textura, tabua levantada le como assoalho
  // podre.
  //
  // A falha TEM que ser recorte de geometria. O assoalho e uma laje OPACA:
  // uma caixa preta encostada por baixo dela fica invisivel, e o que sobrava
  // era a tabua solta boiando num chao inteiro. Entao o piso nasce em faixas
  // de Z que contornam cada falha — por isso a lista tem que vir ordenada em Z
  // e sem duas falhas na mesma faixa (as tres estao a metros uma da outra).
  // (O forro fazia o mesmo recorte quando tinha um pedaco caido; hoje ele e uma
  // laje inteira e este e o unico lugar da casa que ainda contorna vao.)
  // Ordenada em Z e sem duas falhas na mesma faixa (o algoritmo de faixas
  // depende disso). A terceira mudou de 48.4/18.9 pra 49.2/21.4: com a
  // divisoria do braco em XA=47.55 e ZA=17.70, a antiga caia dentro de parede.
  const falhas = [[40.6, 13.9, 0.9, 0.28], [45.8, 15.6, 0.7, 0.26], [49.2, 21.4, 0.8, 0.3]]

  // A UV de cada faixa sai deslocada pela POSICAO dela no comodo: sem isso o
  // tabuado recomeca do zero a cada corte e as juntas dao um degrau
  // atravessado no chao na altura de cada buraco.
  // O V da face de cima da BoxGeometry corre AO CONTRARIO do Z (vale 1 no z
  // menor e 0 no maior), entao o deslocamento dele conta a partir do fundo do
  // comodo. Medido do z0, como o U e medido do x0, a junta saltava um tabuado
  // inteiro — o offset teria que crescer com a faixa e la ele diminui.
  const faixa = (x0, x1, z0, z1) => {
    if (x1 - x0 < 0.02 || z1 - z0 < 0.02) return
    const m = caixaUV(x1 - x0, 0.04, z1 - z0, M.piso, (x0 + x1) / 2, -0.02, (z0 + z1) / 2,
      (x1 - x0) / 1.1, (z1 - z0) / 1.1, (x0 - IN.x0) / 1.1, (IN.z1 - z1) / 1.1)
    m.castShadow = false
    g.add(m)
  }

  let zAtual = IN.z0
  for (let i = 0; i < falhas.length; i++) {
    const f = falhas[i]
    const fx0 = f[0] - f[2] / 2, fx1 = f[0] + f[2] / 2
    const fz0 = f[1] - f[3] / 2, fz1 = f[1] + f[3] / 2
    faixa(IN.x0, IN.x1, zAtual, fz0)
    faixa(IN.x0, fx0, fz0, fz1)
    faixa(fx1, IN.x1, fz0, fz1)
    zAtual = fz1
    // Fundo do buraco: mais LARGO que o recorte e com o topo entrando 5 mm na
    // laje. Encostado certinho embaixo dela sobrava uma fresta na borda por
    // onde se via o lote pelo lado de baixo do assoalho.
    const v = box(f[2] + 0.06, 0.08, f[3] + 0.06, M.vao, f[0], -0.075, f[1])
    v.castShadow = false
    g.add(v)
    const solta = caixaUV(f[2] * 0.9, 0.035, f[3] * 0.8, M.piso,
      f[0] + f[2] * 0.55, 0.035, f[1], 1, 1)
    solta.rotation.z = 0.22 + rnd() * 0.15
    g.add(solta)
  }
  faixa(IN.x0, IN.x1, zAtual, IN.z1)

  // rodape solto: falta pedaco, e onde falta ve-se o vao escuro
  // Os cortes acompanham o vao novo (DL=42.0, DR=44.0) e a fachada de 14 m.
  const rod = [[IN.x0, 40.6], [41.1, DL], [DR, 46.4], [47.6, IN.x1]]
  for (let i = 0; i < rod.length; i++) {
    if (rod[i][1] - rod[i][0] < 0.1) continue
    g.add(caixaUV(rod[i][1] - rod[i][0], 0.14, 0.05, M.tabua,
      (rod[i][0] + rod[i][1]) / 2, 0.07, IN.z0 + 0.03, (rod[i][1] - rod[i][0]) / 1.2, 1))
  }
}

/** As duas divisorias que fazem o L, com o vao de porta tapado com tabuas. */
function paredesInternas(g, colliders, occluders) {
  const alt = CEIL

  // O COMODO DOS FUNDOS ABRIU.
  //
  // Ele existia como parede cega com um vao pregado com tabuas: 44 m² de casa
  // que ninguem podia usar, e a maior parte do chao do lote. O dono do projeto
  // pediu "aumentar o estabelecimento inicial, ta muito pequeno" — e metade do
  // aumento estava aqui dentro, sem custar um metro de terreno. As tabuas nao
  // sumiram: elas estao ARRANCADAS, encostadas na parede ao lado do vao, e
  // contam que alguem abriu o lugar de proposito.
  //
  // O vao tem 1,40 m de largura. Nao e numero redondo por acaso: a mesa de
  // sinuca tem 1,27 m de lado curto e precisa passar por aqui carregada.
  const PVX = 41.90                 // centro do vao interno
  const PVW = 1.40                  // largura util
  const PVH = 2.25                  // altura util
  const pv0 = PVX - PVW / 2, pv1 = PVX + PVW / 2

  // a divisoria transversal, agora em DOIS trechos e uma verga
  const seg = [[IN.x0, pv0], [pv1, XA + TI]]
  for (let i = 0; i < seg.length; i++) {
    const w = seg[i][1] - seg[i][0]
    if (w < 0.02) continue
    g.add(caixaUV(w, alt, TI, M.papel, (seg[i][0] + seg[i][1]) / 2, alt / 2, ZA + TI / 2, w / 1.15, alt / 1.15))
    colliders.push({ minX: seg[i][0], maxX: seg[i][1], minZ: ZA, maxZ: ZA + TI, tag: 'casa-divisoria' })
    occluders.push({ minX: seg[i][0], minY: BASE, minZ: ZA, maxX: seg[i][1], maxY: BASE + alt, maxZ: ZA + TI, tag: 'casa-divisoria' })
  }
  // verga por cima do vao
  g.add(caixaUV(PVW, alt - PVH, TI, M.papel, PVX, PVH + (alt - PVH) / 2, ZA + TI / 2, PVW / 1.15, (alt - PVH) / 1.15))
  occluders.push({ minX: pv0, minY: BASE + PVH, minZ: ZA, maxX: pv1, maxY: BASE + alt, maxZ: ZA + TI, tag: 'casa-verga-interna' })
  // batente cru: o vao foi aberto na marra, entao a madeira do quadro aparece
  for (const x of [pv0, pv1]) g.add(caixaUV(0.06, PVH, TI + 0.02, M.tabua, x, PVH / 2, ZA + TI / 2, 1, PVH / 1.15))

  // AS TABUAS ARRANCADAS, encostadas na parede a leste do vao. Sao as mesmas
  // seis que tapavam o vao, agora de pe e tortas.
  for (let i = 0; i < 6; i++) {
    const t = caixaUV(0.19, 1.62 + (i % 3) * 0.14, 0.04, M.tabua,
      pv1 + 0.34 + i * 0.11, 0.81 + (i % 3) * 0.07, ZA - 0.16 - (i % 2) * 0.05, 1, 1.4)
    t.rotation.z = 0.10 + (i % 4) * 0.035
    t.rotation.x = -0.06
    g.add(t)
  }

  const db = IN.z1 - (ZA + TI)
  g.add(caixaUV(TI, alt, db, M.papel, XA + TI / 2, alt / 2, ZA + TI + db / 2, db / 1.15, alt / 1.15))
  colliders.push({ minX: XA, maxX: XA + TI, minZ: ZA + TI, maxZ: IN.z1, tag: 'casa-divisoria' })
  occluders.push({ minX: XA, minY: BASE, minZ: ZA + TI, maxX: XA + TI, maxY: BASE + alt, maxZ: IN.z1, tag: 'casa-divisoria' })
}

/** Papel de parede descolando, marcas de quadro e tabuado cru no braco. */
function revestimento(g) {
  const alt = CEIL
  const jy0 = JAN_Y0 - BASE, jy1 = JAN_Y1 - BASE, dv = DH - BASE
  // Vaos em Y LOCAL: a mesma lista da fachada, so que descontando o piso.
  const vaosL = [
    { x0: DL, x1: DR, y0: 0, y1: dv },
    { x0: JAN_L.x0, x1: JAN_L.x1, y0: jy0, y1: jy1 },
    { x0: JAN_R.x0, x1: JAN_R.x1, y0: jy0, y1: jy1 },
  ]
  const bandas = [[0, jy0], [jy0, jy1], [jy1, dv], [dv, alt]]
  for (let i = 0; i < bandas.length; i++) {
    const b = bandas[i]
    const runs = faixasLivres(IN.x0, IN.x1, b[0], b[1], vaosL)
    for (let r = 0; r < runs.length; r++) {
      const w = runs[r][1] - runs[r][0]
      g.add(planoUV(w, b[1] - b[0], M.papel, (runs[r][0] + runs[r][1]) / 2,
        (b[0] + b[1]) / 2, IN.z0 + 0.02, 0, w / 1.15, (b[1] - b[0]) / 1.15, r * 0.3, i * 0.2))
    }
  }
  // As laterais correm a casa INTEIRA agora, e nao so ate a divisoria: com o
  // comodo dos fundos aberto, quem atravessa o vao continua vendo parede de
  // casa. A leste ela para em ZA + TI, onde comeca o braco do L (que tem
  // tabuado cru, ver la embaixo).
  const dz = ZA - IN.z0
  const dzo = IN.z1 - IN.z0
  g.add(planoUV(dzo, alt, M.papel, IN.x0 + 0.02, alt / 2, (IN.z0 + IN.z1) / 2, Math.PI / 2, dzo / 1.15, alt / 1.15, 0.6, 0))
  g.add(planoUV(dz, alt, M.papel, IN.x1 - 0.02, alt / 2, (IN.z0 + ZA) / 2, -Math.PI / 2, dz / 1.15, alt / 1.15, 1.3, 0))
  // parede do fundo do comodo novo, e o lado NORTE da divisoria
  const wf = XA - IN.x0
  g.add(planoUV(wf, alt, M.papel, IN.x0 + wf / 2, alt / 2, IN.z1 - 0.02, Math.PI, wf / 1.15, alt / 1.15, 0.2, 0))
  g.add(planoUV(wf, alt, M.papel, IN.x0 + wf / 2, alt / 2, ZA + TI + 0.02, 0, wf / 1.15, alt / 1.15, 0.9, 0))

  // PAPEL DESCOLANDO. O giro TEM que sair da borda de cima, nao do centro do
  // plano: girando pelo centro a aba se afasta da parede pelos dois lados e
  // fica boiando no ar, que foi como ela nasceu na primeira versao. Por isso um
  // pivo na linha da cola com o plano pendurado meia altura abaixo dele.
  // O verso e mais claro (cola velha), dai o material proprio com DoubleSide.
  // O verso leva o MESMO mapa do papel, so mais escuro. Sem mapa a aba fica
  // sendo o unico plano liso do comodo, pega a luz por inteiro e le como
  // bandeirinha branca pendurada em vez de papel virado.
  const verso = stdMat('casa-verso', {
    map: papelTex(), color: 0x9d947e, roughness: 0.99, side: THREE.DoubleSide,
  })
  // Ancoradas em IN e nao em numero absoluto: elas moravam em 39.4 e 46.9, que
  // com o lote novo caem uma fora da parede e outra em cima da janela.
  const abas = [[IN.x0 + 2.2, IN.z0 + 0.03, 0, 0.62, 0.9, 0.5], [IN.x1 - 3.7, IN.z0 + 0.03, 0, 0.5, 0.7, 0.34],
    [IN.x0 + 0.03, 14.6, Math.PI / 2, 0.55, 0.8, 0.62]]
  for (let i = 0; i < abas.length; i++) {
    const a = abas[i]
    // Dois grupos aninhados e nao um Euler com Y e X juntos: o Euler XYZ do
    // three aplica o giro em X no eixo GLOBAL, entao na parede oeste (que ja
    // girou 90 graus em Y) a aba descolava PARA O LADO em vez de para dentro
    // do comodo. Aninhando, o tombo acontece no eixo ja rodado.
    const pivo = new THREE.Group()
    pivo.position.set(a[0], alt - 0.35, a[1])
    pivo.rotation.y = a[2]
    const tombo = new THREE.Group()
    tombo.rotation.x = -a[5]
    pivo.add(tombo)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(a[3], a[4]), verso)
    m.position.y = -a[4] / 2
    m.castShadow = false
    tombo.add(m)
    g.add(pivo)
  }

  // MARCAS DE QUADRO: retangulos onde o papel nao desbotou, com o prego ainda
  // na parede. Diz que a casa foi habitada sem precisar de nenhum movel.
  // A marca tem que ficar MAIS CLARA que a parede em volta (o papel embaixo do
  // quadro nao desbotou), e color so sabe multiplicar — nao existe multiplicar
  // pra cima. Por isso o clareamento entra por um emissivo fraco com o proprio
  // mapa: assim a marca acompanha a estampa da parede e ainda destaca dela.
  const marcaMat = stdMat('casa-marca', {
    map: papelTex(), roughness: 0.96, side: THREE.DoubleSide,
    emissive: 0xfff4de, emissiveMap: papelTex(), emissiveIntensity: 0.16,
  })
  const marcas = [[41.1, ZA - 0.02, Math.PI, 0.62, 0.78], [43.6, ZA - 0.02, Math.PI, 0.5, 0.42],
    [IN.x0 + 0.03, 15.1, Math.PI / 2, 0.7, 0.55]]
  for (let i = 0; i < marcas.length; i++) {
    const m0 = marcas[i]
    g.add(planoUV(m0[3], m0[4], marcaMat, m0[0], 1.62, m0[1], m0[2], m0[3] / 1.6, m0[4] / 1.6, i * 0.4, i * 0.25))
    const prego = box(0.02, 0.02, 0.03, M.metal, m0[0], 1.62 + m0[4] / 2 + 0.06, m0[1])
    prego.castShadow = false
    g.add(prego)
  }

  // BRACO: aqui o papel ja caiu todo, sobrou o tabuado cru
  const bz = IN.z1 - (ZA + TI)
  g.add(planoUV(bz, alt, M.tabuado, BRACO_X0 + 0.02, alt / 2, (ZA + TI + IN.z1) / 2, Math.PI / 2, bz / 1.4, alt / 1.4, 0, 0))
  g.add(planoUV(IN.x1 - BRACO_X0, alt, M.tabuado, (BRACO_X0 + IN.x1) / 2, alt / 2, IN.z1 - 0.02, Math.PI,
    (IN.x1 - BRACO_X0) / 1.4, alt / 1.4, 0.5, 0))
  // porta dos fundos pregada: o braco termina em beco sem saida, e isso
  // precisa ficar EXPLICITO ou o jogador fica procurando saida
  for (let i = 0; i < 5; i++) {
    const t = caixaUV(1.15, 0.2, 0.04, M.tabua, 48.5, 0.26 + i * 0.4, IN.z1 - 0.06, 1.2, 1)
    t.rotation.z = (i % 2 ? -1 : 1) * 0.02
    g.add(t)
  }
}

/**
 * Forro baixo de tabua, INTEIRO.
 *
 * Havia aqui um pedaco caido: um recorte de 1,6 x 1,2 m mostrando o barrote e
 * um fundo preto de sotao, com duas laminas cruzadas de material emissivo
 * fazendo as vezes de raio de sol descendo pelo vao.
 *
 * Saiu a pedido do dono do projeto, e as fotos deram razao a ele por um motivo
 * que nao era o estetico: a lamina de luz e EMISSIVA, nao e luz. Ela nao sabe
 * que horas sao. As tres da manha, com a casa no escuro, o "raio de sol"
 * continuava aceso, atravessando o comodo inteiro e iluminando o papel de
 * parede - foi fotografado. Um raio de sol a noite le como defeito, porque e.
 *
 * Fechando o forro sumiram tambem frestaTex() e M.luzFresta, que so existiam
 * pra essa lamina. Ficaram as vigas aparentes: sao elas que dao ritmo ao teto
 * e nao dependem de buraco nenhum.
 */
function forro(g) {
  // laje inteira, num pedaco so
  const laje = caixaUV(IN.x1 - IN.x0, 0.05, IN.z1 - IN.z0, M.forro,
    (IN.x0 + IN.x1) / 2, CEIL + 0.025, (IN.z0 + IN.z1) / 2,
    (IN.x1 - IN.x0) / 1.3, (IN.z1 - IN.z0) / 1.3)
  laje.castShadow = false
  g.add(laje)

  // vigas aparentes: 3 travessas correndo em X
  // Quatro travessas e nao tres: com 11,9 m de fundura, tres deixariam 4 m
  // entre uma e outra e o ritmo do teto sumiria.
  for (const z of [13.6, 17.0, 20.6, 23.4]) {
    const v = caixaUV(IN.w, 0.12, 0.16, M.ripa, IN.cx, CEIL - 0.06, z, IN.w / 1.3, 1)
    v.castShadow = false
    g.add(v)
  }
}

/**
 * Lampada pelada no fio. Retorna o pivo (o unico no dinamico da casa).
 *
 * E A UNICA LUZ DE VERDADE DA CASA, e ate agora ela nao era luz nenhuma: o
 * bulbo e material emissivo, entao ele BRILHAVA sem ILUMINAR. Fotografado a
 * noite, o resultado era um ponto amarelo no meio de um comodo preto, com o
 * chao logo abaixo do bulbo tao escuro quanto o canto mais distante. O dono do
 * projeto viu isso e disse "ta muito escuro dentro da casa".
 *
 * A PointLight vai DENTRO do pivo de proposito: assim ela balanca junto com a
 * lampada e a sombra do comodo anda com ela, que e metade da graca de uma
 * lampada pendurada. O pivo ja e o unico no marcado com userData.dynamic, o
 * que tambem protege a luz do forno de world/bake.js.
 *
 * Numeros, e de onde vieram:
 *  - 32 de intensidade com decay 2 e a mesma ordem de grandeza das tres luzes
 *    da barbearia (34, alcance 10) num comodo de tamanho parecido;
 *  - alcance 12 porque a sala da frente tem 8,75 m de x e o corredor do L
 *    comeca a 5 m do bulbo: com 10 o braco do L voltava a ser um tunel preto;
 *  - cor 0xffdca8, a MESMA do emissivo do bulbo (M.bulbo). Luz de uma cor e
 *    vidro de outra denuncia que sao duas coisas separadas.
 *  - sem sombra: uma PointLight com sombra e SEIS renderizacoes de mapa por
 *    quadro, e esta casa fica de porta aberta pra rua.
 */
function lampada(g) {
  const pivo = new THREE.Group()
  // Foi de (43.5, 14.5) pra (43.9, 16.5): com o comodo dos fundos aberto, o
  // bulbo tem que ficar na PASSAGEM entre as duas salas pra alcancar as duas.
  pivo.position.set(43.9, CEIL - 0.02, 16.5)
  pivo.userData.dynamic = true          // o forno nao pode fundir o que balanca
  const L = 0.72
  const fio = cyl(0.008, 0.008, L, M.fio, 6)
  fio.position.y = -L / 2
  fio.castShadow = false
  pivo.add(fio)
  const soq = cyl(0.045, 0.05, 0.09, M.escuro, 10)
  soq.position.y = -L - 0.03
  pivo.add(soq)
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), M.bulbo)
  b.position.y = -L - 0.13
  b.castShadow = false
  pivo.add(b)
  // 24 / 13 e nao 15 / 9.5. Com o comodo dos fundos aberto, o canto mais
  // distante do piso util fica a 10,2 m do bulbo: com alcance 9.5 ele nascia
  // preto. Posto na passagem entre as duas salas, UM bulbo cobre as duas —
  // 24/10.2^2 = 0.23 no pior canto de agora, contra 15/8.6^2 = 0.20 no pior
  // canto de antes.
  //
  // NAO entra um segundo ponto de luz: tools/smoke.mjs reprova acima de 22 e a
  // cena esta em 22 exatas. Se o fundo ainda ler preto na foto, o caminho
  // honesto e subir o teto pra 23 e escrever o motivo la, como ja foi feito na
  // subida de 21 pra 22 por causa desta mesma casa.
  const luz = new THREE.PointLight(0xffdca8, 24, 13, 2)
  luz.position.y = -L - 0.13
  luz.castShadow = false
  pivo.add(luz)
  // roseta no forro
  const ros = cyl(0.07, 0.07, 0.03, M.escuro, 10)
  ros.position.y = 0.01
  pivo.add(ros)
  g.add(pivo)
  return pivo
}

/** Sofa coberto por lencol, caixas de papelao e o resto do que ficou. */
/**
 * O que sobra no chao — e o que sobra e quase nada, de proposito.
 *
 * Aqui havia um sofa coberto por lencol e quatro pilhas de caixa de papelao.
 * Sairam a pedido do dono do projeto: este comodo e o primeiro estabelecimento
 * dele, e o que ele precisa e de CHAO LIVRE pra montar alguma coisa em cima.
 *
 * O que ficou no lugar nao e vazio liso: ficaram as MARCAS do que estava ali.
 * Um retangulo de assoalho menos surrado onde o sofa protegeu a madeira do sol,
 * quatro quadrados de poeira onde as pilhas ficaram, e o balde e os jornais que
 * ninguem se deu ao trabalho de tirar. Um comodo esvaziado conta uma historia;
 * um comodo que nunca teve nada e so uma caixa.
 */
function moveis(g, colliders) {
  void colliders                        // nada aqui barra o jogador (e o ponto)

  // --- marcas no assoalho ---------------------------------------------------
  // Decalques rentes ao chao. polygonOffset porque eles moram 6 mm acima da
  // tabua e sao grandes: sem ele a diferenca de profundidade some na distancia
  // e as duas superficies piscam.
  const marca = (x, z, w, d, ry, mat) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    m.rotation.x = -Math.PI / 2
    m.rotation.z = ry
    m.position.set(x, 0.006, z)
    m.castShadow = false
    m.receiveShadow = true
    g.add(m)
  }
  // onde ficava o sofa: a madeira por baixo nao desbotou
  marca(39.6, 16.42, 2.30, 1.02, -0.05, M.marcaClara)
  // onde ficavam as pilhas: poeira que nao foi varrida
  for (const c of [[49.9, 13.4, 0.74], [46.4, 12.85, 0.70], [49.9, 22.4, 0.68], [37.8, 13.2, 0.66]]) {
    marca(c[0], c[1], c[2], c[2] * 0.86, 0.3, M.marcaPoeira)
  }

  // --- balde virado no braco e jornal velho no chao -----------------------
  const balde = cyl(0.17, 0.13, 0.3, M.metal, 12)
  balde.position.set(49.2, 0.15, 20.4)   // encostado no fundo do braco
  balde.rotation.z = 1.5
  sombras(balde)
  g.add(balde)
  for (let i = 0; i < 5; i++) {
    const j = box(0.3, 0.006, 0.22, M.lencol, 42.5 + i * 0.42, 0.006, 13.1 + (i % 2) * 0.5)
    j.rotation.y = i * 0.8
    j.castShadow = false
    g.add(j)
  }
}

/** Teias nas quinas de dentro e poeira parada no ar. */
function teiasEPoeira(g, balanco) {
  const mt = M.teia('topo')
  // duas quinas do fundo da sala e a quina interna do L: sao as tres que o
  // jogador enquadra ao entrar e ao virar pro corredor
  // Duas com aranha, duas sem (ver teiaDeCanto).
  balanco.push(teiaDeCanto(g, IN.x0, ZA, 1, -1, 1.15, CEIL - 0.03, mt, true))
  balanco.push(teiaDeCanto(g, IN.x1, IN.z0, -1, 1, 0.92, CEIL - 0.03, mt, false))
  balanco.push(teiaDeCanto(g, BRACO_X0, ZA + TI, 1, 1, 0.85, CEIL - 0.03, mt, false))
  balanco.push(teiaDeCanto(g, IN.x1, IN.z1, -1, -1, 0.95, CEIL - 0.03, mt, true))

  // POEIRA: planos soltos onde bate luz. Ficam parados de proposito -- poeira
  // animada exigiria mais um no dinamico e a unica coisa que se move nesta casa
  // e a lampada.
  //
  // Eram tres: duas nas janelas e uma embaixo do buraco do forro. Com o forro
  // fechado a terceira perdeu o motivo, e foi pro lugar onde AGORA ha luz: sob
  // o bulbo (43.5, 14.5). Poeira so le como poeira quando alguma coisa a
  // atravessa.
  // Sob as janelas novas e sob o bulbo novo: poeira so le como poeira onde
  // alguma coisa a atravessa.
  const pos = [[46.8, 1.5, 13.4, 0.2], [44.3, 1.4, 17.2, -0.9], [39.3, 1.5, 13.2, 0.5]]
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i]
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.9), M.poeira)
    m.position.set(p[0], p[1], p[2])
    m.rotation.y = p[3]
    m.castShadow = false
    g.add(m)
  }
}

// ---------------------------------------------------------------------------
// BUILDER
// ---------------------------------------------------------------------------
export function buildCasaVelha(game) {
  const group = new THREE.Group()
  group.name = 'casa-velha'
  const colliders = []
  const occluders = []
  const interactables = []

  // --- casca (coordenadas de mundo, chao em y=0) --------------------------
  const casca = new THREE.Group()
  casca.name = 'casa-casca'
  moldura(casca)
  paredes(casca, colliders, occluders)
  tabuasDaFachada(casca)
  janelas(casca)
  const folhasPorta = porta(casca)
  // A posicao de fechada de cada folha, guardada UMA vez: o update soma o curso
  // a ela em vez de acumular, entao um quadro perdido nao desalinha a porta.
  for (const f of folhasPorta) f.userData.baseX = f.position.x
  telhado(casca)
  calha(casca)
  varanda(casca, colliders)
  frenteAbandonada(casca, colliders)
  group.add(casca)

  // --- miolo (piso local em y=0; o grupo sobe pra LEVELS.SHOP_FLOOR) ------
  const dentro = new THREE.Group()
  dentro.name = 'casa-miolo'
  dentro.position.y = BASE
  piso(dentro)
  paredesInternas(dentro, colliders, occluders)
  revestimento(dentro)
  forro(dentro)
  moveis(dentro, colliders)
  // As teias balancam: o update as encontra por esta lista.
  const teiasQueBalancam = []
  teiasEPoeira(dentro, teiasQueBalancam)
  const lamp = lampada(dentro)
  group.add(dentro)

  // --- interacao ----------------------------------------------------------
  // No meio da SALA DA FRENTE (z 12.3..16.4), na altura da cintura: a interacao
  // pesa o Y pela metade, entao daqui o rotulo aparece na hora certa tambem em
  // primeira pessoa. E este ponto que a primeira missao do tutorial marca.
  // --- A PORTA -------------------------------------------------------------
  // O COLISOR do vao: existe sempre, mas so EMPURRA quando a folha esta
  // fechada (ver o update). Ligar e desligar em vez de criar e destruir porque
  // a grade de colisao guarda o indice da caixa por celula: mover ou remover
  // uma caixa depois de registrada deixaria a celula apontando pra outra coisa.
  // Fica no MEIO da espessura da parede e ocupa o vao INTEIRO: com porta de
  // correr as duas folhas fecham o vao todo, e nao ha mais o caso da folha
  // girada deixando passagem pelo lado.
  // Este vai DIRETO pro mundo de colisao, e nao pela lista devolvida: o
  // collision.add() copia o que recebe pra dentro da grade, entao mexer no
  // objeto que a gente empurrou nao mexeria em nada. Registrando aqui a gente
  // fica com a caixa DE VERDADE na mao — e e nela que o update liga e desliga
  // o `ativo`. (Ver o comentario de add() em src/systems/collision.js.)
  const colPorta = (game && game.collision ? game.collision.add({
    minX: DL + 0.02, maxX: DR - 0.02,
    minZ: B.z0 + 0.02, maxZ: B.z0 + T - 0.02,
    tag: 'casa-porta', ativo: true,
  })[0] : { ativo: true })

  // O ponto de interacao fica DO LADO DE FORA, na varanda: e de la que se chega
  // na casa pela primeira vez. O raio de 2.2 alcanca os dois lados do vao, que
  // tem 30 cm de espessura — quem esta dentro tambem consegue fechar.
  const pontoPorta = {
    id: 'casa-porta',
    position: new THREE.Vector3(B.door.center, BASE + 1.1, B.z0 - 0.35),
    radius: 2.2,
    label: 'Abrir a porta',
    // PEDIDO quando ha servidor; ordem quando nao ha.
    //
    // Sem isto a porta abre so na tela de quem apertou E: `abertaAlvo` e o
    // colisor sao variaveis de fechamento desta funcao, uma copia por maquina.
    // No coop, o jogador A abria, atravessava, e na tela de B a porta continuava
    // fechada E barrando — B via A atravessando madeira. Era o defeito relatado.
    //
    // Manda o VALOR desejado e nao um "inverte": dois jogadores apertando E no
    // mesmo tique com toggle se anulariam.
    onInteract: (gm2) => {
      const r = gm2 && gm2.rede
      if (r && r.conectado && typeof r.usarPorta === 'function') {
        r.usarPorta(PORTA_ID, !abertaAlvo)
        return
      }
      abertaAlvo = !abertaAlvo
    },
  }
  interactables.push(pontoPorta)

  interactables.push({
    id: 'casa-olhar',
    position: new THREE.Vector3(44, BASE + 1.1, 14.3),
    radius: 2.4,
    label: 'Olhar o lugar',
    onInteract: (g) => g.toast('Da pra fazer alguma coisa com isso aqui.'),
  })

  // -------------------------------------------------------------------------
  // UPDATE — nada de 'new' daqui pra baixo
  // -------------------------------------------------------------------------
  // --- estado da porta ------------------------------------------------------
  // Quanto cada folha corre pro lado. 1.03 m e o que a fachada comporta: a
  // oeste sobram 0.67 m ate JAN_L, a leste 0.47 ate JAN_R.
  const PORTA_CURSO = 1.03
  // O id que viaja na rede (ver PORTAS em servidor/sala.js).
  const PORTA_ID = 1
  let abertaAlvo = false
  let corrida = 0          // 0 fechada, PORTA_CURSO aberta
  let rangido = 0          // fase do tranco; e o que faz a roldana parecer velha
  let itemPorta = null     // o interactable JA registrado (ver o comentario abaixo)

  let t = 0
  function update(dt, gm) {
    t += Math.min(dt || 0, 0.1)
    const d = Math.min(dt || 0, 0.1)

    // --- as teias no vento ---------------------------------------------------
    // Uma casa fechada nao tem vento de verdade; o que ha e a corrente que entra
    // pelas frestas, e ela e LENTA. 0.42 rad/s com amplitude de 0.9 grau: se der
    // pra ver a teia se mexer parada olhando, ja passou do ponto — o que se
    // quer e que ela nao esteja igual quando o olho volta.
    //
    // Cada teia tem a fase presa ao INDICE, e nao a um sorteio: no coop as
    // quatro teias tem que balancar iguais nas quatro telas.
    for (let i = 0; i < teiasQueBalancam.length; i++) {
      const p = teiasQueBalancam[i]
      const f = i * 1.7
      p.rotation.z = Math.sin(t * 0.42 + f) * 0.016 + Math.sin(t * 0.97 + f * 2) * 0.006
      p.rotation.x = Math.sin(t * 0.31 + f * 1.3) * 0.010
    }

    // --- a porta ------------------------------------------------------------
    const alvo = abertaAlvo ? PORTA_CURSO : 0
    if (Math.abs(corrida - alvo) > 0.0005) {
      rangido += d
      // Velocidade que ENGASGA. Uma porta velha nao corre com velocidade
      // constante: ela sai dura, solta, e trava de novo perto do fim. O seno
      // rapido por cima da velocidade base e o que se ve como chiado de roldana
      // enferrujada; sem ele o movimento fica de porta automatica de shopping.
      const vel = 1.12 * (0.62 + 0.38 * Math.abs(Math.sin(rangido * 7.3)))
      const passo = vel * d
      const falta = alvo - corrida
      corrida += Math.abs(falta) <= passo ? falta : Math.sign(falta) * passo
      for (let i = 0; i < folhasPorta.length; i++) {
        const f = folhasPorta[i]
        f.position.x = f.userData.baseX + f.userData.correr * corrida
        // A folha BALANCA no trilho enquanto corre: roldana velha em trilho
        // torto nao anda reta. Para quando ela para.
        f.rotation.z = Math.sin(rangido * 9.1 + i) * 0.008 * (alvo > 0 ? 1 : 1)
      }
    }
    // BARRA enquanto as duas folhas nao abriram meia bitola de jogador (0.38 de
    // raio, entao 0.76 de vao livre; os 0.04 de margem evitam ele raspar).
    // Com a folha de GIRAR isto era uma conta de angulo, e estava errada: o
    // limiar era 0.55 rad, e em 0.55 rad a folha ainda tapava 1.34 dos 1.70 do
    // vao — sobravam 0.31 de passagem pra 0.76 de jogador, e ele atravessava a
    // madeira ate 1.00 rad. Com curso linear nao ha essa faixa cinzenta.
    colPorta.ativo = corrida * 2 < 0.80

    // O rotulo do E acompanha o estado. O sistema de interacao COPIA o objeto
    // no add(), entao o que a gente empurrou nao e o que ele consulta — a
    // primeira volta acha o dele por id e guarda. Sem isto a porta aberta
    // continuaria dizendo "Abrir a porta".
    if (!itemPorta && gm && gm.interaction && gm.interaction.items) {
      for (let i = 0; i < gm.interaction.items.length; i++) {
        if (gm.interaction.items[i].id === 'casa-porta') { itemPorta = gm.interaction.items[i]; break }
      }
    }
    if (itemPorta) itemPorta.label = abertaAlvo ? 'Fechar a porta' : 'Abrir a porta'

    // Dois periodos incomensuraveis em vez de um seno so: com um eixo unico a
    // lampada vira metronomo e o olho pega o loop em dois segundos. Cruzando
    // 1.15 com 0.83 ela desenha um oito lento que nunca fecha igual.
    lamp.rotation.z = Math.sin(t * 1.15) * 0.055
    lamp.rotation.x = Math.sin(t * 0.83 + 1.1) * 0.036
  }

  return {
    group,
    colliders,
    interactables,
    occluders,
    update,
    // De onde a cutscene de abertura encara a fachada.
    //
    // ALTURA DE OLHO (1.72 m), porque o pedido foi literal: "mostrar os players
    // do servidor olhando para o estabelecimento em PRIMEIRA PESSOA". Este
    // ponto so ficou possivel quando a conifera que city.js plantava em
    // (44, 9.4) saiu da lista de arvores de rua: ela ficava a 2.6 m da parede,
    // no eixo da porta, e tapava a casa inteira de qualquer altura de olho —
    // foi ela que obrigou a versao anterior desta pose a subir 10 m no ar e
    // olhar pra baixo, o que nao era primeira pessoa nenhuma.
    //
    // Fica no ASFALTO e nao na calcada: a 3.8 m da fachada (que e onde a
    // calcada acaba) uma casa de 12 m de largura nao cabe no quadro. Daqui, a
    // 6 m, entram o telhado arruinado, a varanda, a placa de vende-se e o mato.
    // O leve deslocamento pra +X poe a porta no terco esquerdo em vez do centro
    // morto, que e o enquadramento que um diretor de fotografia escolheria.
    /**
     * A camera da segunda parte da cutscene.
     *
     * Era um plano de PRIMEIRA PESSOA: a camera na altura do olho, encarando a
     * fachada, sem ninguem no quadro. O dono do projeto pediu o contrario -
     * "quero todos os jogadores enfilerados... e olhando pra casa" -, entao ela
     * foi pra TRAS e pra CIMA do grupo, que e de onde a camera de 3a pessoa do
     * jogo olha.
     *
     * z = 4.6 poe a lente 4,2 m atras da fila (que nasce em z = 8.8). Com os
     * 58 graus de lente do jogo isso da 4,1 m de meia-largura no plano dos
     * bonecos: a fila de quatro tem 4,33 m de ponta a ponta e cabe com folga,
     * e a casa inteira (12 m de fachada, 5,1 m ate a cumeeira) ainda entra no
     * fundo. y = 2.30 e um palmo acima da cabeca deles (1,85 + o piso em 0,16),
     * o que deixa ver a fila E a porta por cima dos ombros.
     */
    poseDaCutscene: {
      // Recuou de z=4.6 pra 3.4 e subiu de 2.30 pra 2.42 porque a casa cresceu:
      // o telhado novo mede 15,0 m de ponta a ponta (era 13,0) e, com a lente
      // de 58 graus do jogo, cabem 0,96 m de largura por metro de distancia.
      // Olhando pro centro do lote novo (43,9), o lado pior mede 7,5 m — sao
      // precisos 7,8 m de recuo, e de z=3.4 ate a fachada sao 8,6.
      x: 43.6, y: 2.42, z: 3.4,
      olharX: 43.9, olharY: 1.85, olharZ: 12.0,
    },
    /**
     * Quem manda no estado da porta e o SERVIDOR. main.js liga o evento
     * 'porta-estado' aqui; no solo ninguem chama isto e o onInteract aplica
     * direto. Sao duas portas de entrada pro mesmo estado, e so uma delas roda
     * em cada modo.
     */
    portaId: 1,
    setPortaAberta(v) { abertaAlvo = !!v },

    /** Altura do assoalho, em mundo. E onde o movel pousa. */
    pisoY: BASE,

    /**
     * A PLANTA, do jeito que o sistema de encaixe precisa dela.
     *
     * Mora aqui porque quem conhece a casa e a casa: `zonas` sao os retangulos
     * de chao LIVRE (um por comodo) e `proibidos` sao os pedacos desse chao que
     * nao podem receber movel. O encaixe nao sabe o que e ZA nem XA — ele so
     * compara retangulos.
     *
     * Os comodos se TOCAM de proposito nas bordas: a zona do braco comeca em
     * ZA e nao em ZA+TI porque a divisoria transversal so vai ate XA+TI, entao
     * a faixa x 47.80..50.6 / z 17.70..17.95 e chao de verdade — e e por ela
     * que o L se liga. Zonas separadas por uma fresta declarariam o braco
     * inalcancavel.
     */
    zonasDeMovel: {
      zonas: [
        // sala da frente
        { x0: IN.x0, x1: IN.x1, z0: IN.z0, z1: ZA },
        // comodo dos fundos (o que estava lacrado)
        { x0: IN.x0, x1: XA, z0: ZA + TI, z1: IN.z1 },
        // braco do L
        { x0: BRACO_X0, x1: IN.x1, z0: ZA, z1: IN.z1 },
      ],
      proibidos: [
        // O corredor da porta. A folha e de correr e nao varre nada, mas
        // entupir a entrada com uma mesa de sinuca continua sendo entupir a
        // entrada: 1,4 m de recuo e o que uma pessoa precisa pra entrar
        // carregando alguma coisa.
        { x0: DL - 0.2, x1: DR + 0.2, z0: IN.z0, z1: IN.z0 + 1.4, motivo: 'isso e o vao da porta' },
        // A passagem entre as duas salas, com 70 cm de folga dos dois lados.
        { x0: 41.0, x1: 42.8, z0: ZA - 0.7, z1: ZA + TI + 0.7, motivo: 'ia trancar a passagem' },
        // A boca do braco do L, pelo mesmo motivo.
        { x0: BRACO_X0, x1: IN.x1, z0: ZA - 0.5, z1: ZA + TI + 0.5, motivo: 'ia trancar a passagem' },
      ],
    },
  }
}
