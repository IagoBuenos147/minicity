import { contextoDeAudio } from '../audio/som.js'

// ---------------------------------------------------------------------------
// src/bar/som-bar.js — OS SONS DO BAR, SINTETIZADOS.
//
// O jogo nao carrega um unico arquivo de audio, e nao vai comecar por aqui: a
// regra de src/audio/som.js vale igual pra geometria, pra textura e pro som —
// NENHUM ASSET EXTERNO. O toc-toc da porta e ruido filtrado mais tres senoides;
// o gelo desta bancada tambem.
//
// O QUE CADA SOM E, EM UMA LINHA CADA. Sao os "porques" que fizeram cada um
// soar como a coisa e nao como um bipe:
//
//   TINIDO DE VIDRO  duas parciais NAO HARMONICAS (1 : 2.76) com decaimento
//                    longo. Vidro nao e corda: se as parciais forem multiplos
//                    inteiros o resultado tem altura definida e soa como
//                    xilofone. A razao irracional e o que faz virar vidro.
//   GELO             tres a cinco estalos de ruido curtissimo por passa-alta,
//                    espalhados em 90 ms com forcas desiguais. Gelo dentro de
//                    metal e um punhado de impactos, nunca um chocalho regular.
//   JORRO            ruido rosa por um passa-banda que ABRE conforme o fio
//                    engrossa. Liquido caindo e banda larga, e o que muda com a
//                    vazao e a largura da banda, nao o volume.
//   LIQUIDIFICADOR   serra dente + quadrada uma quinta acima, as duas subindo
//                    de frequencia com a rotacao, mais o ruido das laminas. E o
//                    unico som daqui com envelope CONTINUO — os outros sao
//                    disparos.
//   FACA NA TABUA    um estalo de banda media e um baque grave de 90 Hz. E a
//                    madeira que responde, nao a lamina.
//   ROLHA            um "plop": seno descendo rapido de 700 pra 180 Hz em 60 ms.
//
// TUDO E OPCIONAL. Sem Web Audio (node, teste headless, navegador antigo) cada
// funcao vira no-op. Som nao pode derrubar quadro nenhum, e nao pode derrubar
// um teste.
//
// O BARRAMENTO E PROPRIO e nao o `mestre` de audio/som.js, que nao e exportado.
// Ele nasce mais baixo (0.42) de proposito: o bar toca muita coisa junta —
// jorro, gelo, motor — e no volume dos efeitos avulsos a bancada vira barulho.
// ---------------------------------------------------------------------------

let bus = null
let bufRuido = null
let ctxCache = null

function ctx() {
  const c = contextoDeAudio()
  if (!c) return null
  if (c !== ctxCache) { ctxCache = c; bus = null; bufRuido = null }
  if (!bus) {
    bus = c.createGain()
    bus.gain.value = 0.42
    bus.connect(c.destination)
  }
  return c
}

/** Um segundo de ruido branco, gerado uma vez e reusado por tudo. */
function ruido(c) {
  if (bufRuido) return bufRuido
  const n = Math.floor(c.sampleRate)
  const b = c.createBuffer(1, n, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  bufRuido = b
  return b
}

/** Senoide (ou o que se pedir) com ataque curto e queda exponencial. */
function tom(c, freq, quando, dur, ganho, tipo, freq2) {
  const o = c.createOscillator()
  o.type = tipo || 'sine'
  o.frequency.setValueAtTime(freq, quando)
  if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), quando + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, quando)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, ganho), quando + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  o.connect(g); g.connect(bus)
  o.start(quando)
  o.stop(quando + dur + 0.02)
  return o
}

/** Estalo: ruido curto por um filtro. */
function estalo(c, quando, freq, dur, ganho, tipo, q) {
  const s = c.createBufferSource()
  s.buffer = ruido(c)
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = tipo || 'bandpass'
  f.frequency.setValueAtTime(freq, quando)
  f.Q.value = q === undefined ? 1.2 : q
  const g = c.createGain()
  g.gain.setValueAtTime(ganho, quando)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  s.connect(f); f.connect(g); g.connect(bus)
  s.start(quando)
  s.stop(quando + dur + 0.02)
}

// ---------------------------------------------------------------------------
// DISPAROS
// ---------------------------------------------------------------------------

/** Copo de vidro pousando na bancada, ou dois copos se encostando. */
export function tinido(forca) {
  const c = ctx()
  if (!c) return false
  const f = forca === undefined ? 1 : Math.max(0.1, Math.min(2, forca))
  const t0 = c.currentTime + 0.01
  const base = 1180 + Math.random() * 380
  // 1 : 2.76 — a razao NAO harmonica que faz soar vidro e nao sino (ver o
  // cabecalho). Um terceiro modo bem fraco em 5.4 da o "brilho".
  tom(c, base, t0, 0.42 * f, 0.075 * f)
  tom(c, base * 2.76, t0, 0.30 * f, 0.040 * f)
  tom(c, base * 5.40, t0, 0.16 * f, 0.014 * f)
  estalo(c, t0, 2600, 0.020, 0.055 * f)
  // e o baque do fundo grosso na madeira
  tom(c, 128, t0, 0.075, 0.055 * f)
  return true
}

/** Gelo chacoalhando ou caindo. `n` pedras. */
export function gelo(n, forca) {
  const c = ctx()
  if (!c) return false
  const q = Math.max(2, Math.min(7, n || 4))
  const f = forca === undefined ? 1 : Math.max(0.1, Math.min(2, forca))
  const t0 = c.currentTime + 0.005
  for (let i = 0; i < q; i++) {
    // espalhados desigualmente: gelo em cadencia regular vira chocalho
    const q0 = t0 + Math.random() * 0.09
    const g0 = (0.030 + Math.random() * 0.038) * f
    estalo(c, q0, 3200 + Math.random() * 2600, 0.016 + Math.random() * 0.014, g0, 'highpass', 0.7)
    if (Math.random() < 0.5) tom(c, 420 + Math.random() * 520, q0, 0.045, g0 * 0.5)
  }
  return true
}

/** Faca cortando fruta na tabua. */
export function corte() {
  const c = ctx()
  if (!c) return false
  const t0 = c.currentTime + 0.005
  // o corte na polpa: ruido medio, curtissimo
  estalo(c, t0, 1500, 0.028, 0.075, 'bandpass', 0.9)
  // e a MADEIRA respondendo — e ela que da o "toc"
  tom(c, 92, t0 + 0.010, 0.090, 0.085)
  tom(c, 186, t0 + 0.010, 0.055, 0.035)
  estalo(c, t0 + 0.010, 620, 0.030, 0.045)
  return true
}

/** O "plop" de tirar a rolha ou destampar a coqueteleira. */
export function rolha() {
  const c = ctx()
  if (!c) return false
  const t0 = c.currentTime + 0.005
  tom(c, 700, t0, 0.070, 0.10, 'sine', 180)
  estalo(c, t0, 900, 0.018, 0.05)
  return true
}

/** Metal batendo em metal: tampar a coqueteleira, pousar a pinca. */
export function metal(forca) {
  const c = ctx()
  if (!c) return false
  const f = forca === undefined ? 1 : Math.max(0.1, Math.min(2, forca))
  const t0 = c.currentTime + 0.005
  estalo(c, t0, 2100, 0.030, 0.060 * f, 'bandpass', 1.6)
  tom(c, 380, t0, 0.110, 0.045 * f)
  tom(c, 940, t0, 0.070, 0.028 * f)
  return true
}

/** A campainha do fim de um gesto bem feito. Duas notas, terca maior. */
export function acerto(bom) {
  const c = ctx()
  if (!c) return false
  const t0 = c.currentTime + 0.01
  const base = bom === false ? 300 : 660
  tom(c, base, t0, 0.16, 0.055, 'triangle')
  tom(c, base * (bom === false ? 0.8 : 1.26), t0 + 0.085, 0.22, 0.050, 'triangle')
  return true
}

// ---------------------------------------------------------------------------
// SONS CONTINUOS
//
// Os dois de baixo NAO sao disparos: eles ligam, ficam, e alguem tem que
// deslig&-los. Por isso devolvem um objeto com `parar()` — e por isso guardam o
// proprio no de ganho, pra o volume acompanhar o gesto todo quadro.
// ---------------------------------------------------------------------------

/** Fio de liquido caindo. Devolve { setVazao(0..1), parar() } ou null. */
export function jorro(vazao) {
  const c = ctx()
  if (!c) return null
  const s = c.createBufferSource()
  s.buffer = ruido(c)
  s.loop = true
  // dois filtros em serie: o passa-alta tira o rumor grave (que soaria como
  // vento) e o passa-banda e quem responde a vazao
  const alto = c.createBiquadFilter()
  alto.type = 'highpass'
  alto.frequency.value = 700
  const banda = c.createBiquadFilter()
  banda.type = 'bandpass'
  banda.frequency.value = 2200
  banda.Q.value = 0.75
  const g = c.createGain()
  g.gain.value = 0.0001
  s.connect(alto); alto.connect(banda); banda.connect(g); g.connect(bus)
  s.start()

  const api = {
    setVazao(v) {
      const k = Math.max(0, Math.min(1, v || 0))
      const agora = c.currentTime
      g.gain.setTargetAtTime(Math.max(0.0001, 0.052 * k), agora, 0.05)
      // a banda ABRE com a vazao: e isso que separa um fio de um jato
      banda.frequency.setTargetAtTime(1500 + 2600 * k, agora, 0.08)
      banda.Q.setTargetAtTime(1.4 - 0.8 * k, agora, 0.08)
    },
    parar() {
      const agora = c.currentTime
      g.gain.setTargetAtTime(0.0001, agora, 0.03)
      try { s.stop(agora + 0.25) } catch (err) { void err }
    },
  }
  api.setVazao(vazao === undefined ? 1 : vazao)
  return api
}

/** Motor do liquidificador. Devolve { setRotacao(0..1), parar() } ou null. */
export function motor() {
  const c = ctx()
  if (!c) return null
  const g = c.createGain()
  g.gain.value = 0.0001
  g.connect(bus)

  // o corpo do motor: serra + quadrada uma quinta acima
  const o1 = c.createOscillator()
  o1.type = 'sawtooth'
  o1.frequency.value = 70
  const o2 = c.createOscillator()
  o2.type = 'square'
  o2.frequency.value = 105
  const g2 = c.createGain()
  g2.gain.value = 0.35
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 900
  lp.Q.value = 3
  o1.connect(lp)
  o2.connect(g2); g2.connect(lp)
  lp.connect(g)
  o1.start(); o2.start()

  // e o ruido das laminas batendo no gelo
  const s = c.createBufferSource()
  s.buffer = ruido(c)
  s.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400
  bp.Q.value = 0.9
  const gn = c.createGain()
  gn.gain.value = 0.0001
  s.connect(bp); bp.connect(gn); gn.connect(bus)
  s.start()

  return {
    setRotacao(v) {
      const k = Math.max(0, Math.min(1, v || 0))
      const agora = c.currentTime
      // A ALTURA SOBE COM A ROTACAO. E o unico jeito de o jogador ouvir que o
      // liquidificador esta pegando forca — volume sozinho so soa "mais perto".
      o1.frequency.setTargetAtTime(62 + 118 * k, agora, 0.06)
      o2.frequency.setTargetAtTime(93 + 177 * k, agora, 0.06)
      lp.frequency.setTargetAtTime(600 + 2200 * k, agora, 0.06)
      g.gain.setTargetAtTime(Math.max(0.0001, 0.055 * k), agora, 0.05)
      gn.gain.setTargetAtTime(Math.max(0.0001, 0.030 * k * k), agora, 0.05)
    },
    parar() {
      const agora = c.currentTime
      g.gain.setTargetAtTime(0.0001, agora, 0.04)
      gn.gain.setTargetAtTime(0.0001, agora, 0.04)
      try { o1.stop(agora + 0.35); o2.stop(agora + 0.35); s.stop(agora + 0.35) } catch (err) { void err }
    },
  }
}

export default { tinido, gelo, corte, rolha, metal, acerto, jorro, motor }
