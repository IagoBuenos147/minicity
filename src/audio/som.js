// ---------------------------------------------------------------------------
// src/audio/som.js — O PRIMEIRO SOM DO JOGO.
//
// Ate aqui o Mini City RP era MUDO: nao ha um `new Audio()` nem um AudioContext
// em lugar nenhum do repositorio. O pedido do dono ("quando eu apertar E na
// porta faca um som de toc toc") abriu o assunto, e a forma que ele toma aqui
// segue a mesma regra que vale pra geometria e pra textura deste projeto:
//
//   NENHUM ASSET EXTERNO. Nada de .mp3, .wav, nada de fetch.
//
// Entao o som e SINTETIZADO, do mesmo jeito que uma parede de tijolo aqui e um
// canvas desenhado na mao. Uma batida em porta de madeira tem tres partes, e as
// tres cabem em osciladores:
//
//   1. o ESTALO — o no do dedo na madeira. Ruido branco de 8 ms passado por um
//      passa-banda alto. E o que da o "t" do toc.
//   2. o CORPO — a folha da porta vibrando. Duas senoides graves (155 e 290 Hz)
//      com queda exponencial de ~140 ms. E o que da o "oc".
//   3. o BAQUE — o batente levando o impacto. Uma senoide de 70 Hz, curtissima.
//
// E sao TRES batidas, nao uma: "toc toc toc" e um ritmo, nao um som. Elas caem
// em 0, 195 e 380 ms — desigual de proposito, porque batida de gente nao e
// metronomo — e a segunda vem um pouco mais fraca que as outras duas.
//
// A ARMADILHA DO NAVEGADOR: um AudioContext criado antes do primeiro clique
// nasce SUSPENSO e nunca toca nada. Por isso ele so e criado na primeira vez que
// alguem pede um som (a essa altura ja houve clique, porque o jogo trava o
// ponteiro no clique) e `resume()` e chamado a cada pedido — chamar em contexto
// ja rodando e no-op barato.
//
// E TUDO E OPCIONAL: sem Web Audio (node, headless, navegador antigo) cada
// funcao vira no-op silenciosa. Som nao pode derrubar quadro nenhum.
// ---------------------------------------------------------------------------

let ctx = null
let mestre = null
let quebrado = false
let volume = 0.55

/** Devolve o AudioContext, criando na primeira chamada. `null` se nao da. */
function contexto() {
  if (quebrado) return null
  if (ctx) {
    // suspenso acontece quando a aba perde o foco; retomar e barato
    if (ctx.state === 'suspended') { try { ctx.resume() } catch (err) { void err } }
    return ctx
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) { quebrado = true; return null }
    ctx = new AC()
    mestre = ctx.createGain()
    mestre.gain.value = volume
    mestre.connect(ctx.destination)
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch (err) {
    void err
    quebrado = true
    return null
  }
}

/** Buffer de ruido branco de `seg` segundos, gerado uma vez e reusado. */
let bufRuido = null
function ruido(c, seg) {
  if (bufRuido && bufRuido.duration >= seg) return bufRuido
  const n = Math.max(1, Math.floor(c.sampleRate * Math.max(seg, 0.25)))
  const b = c.createBuffer(1, n, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  bufRuido = b
  return b
}

/** Uma senoide com queda exponencial. E o tijolo de tudo aqui. */
function tom(c, saida, freq, quando, dur, ganho, tipo) {
  const o = c.createOscillator()
  o.type = tipo || 'sine'
  o.frequency.setValueAtTime(freq, quando)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, quando)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, ganho), quando + 0.004)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  o.connect(g)
  g.connect(saida)
  o.start(quando)
  o.stop(quando + dur + 0.02)
}

/** O estalo: ruido curto por um passa-banda. */
function estalo(c, saida, quando, freq, dur, ganho) {
  const s = c.createBufferSource()
  s.buffer = ruido(c, 0.25)
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(freq, quando)
  f.Q.value = 1.4
  const g = c.createGain()
  g.gain.setValueAtTime(ganho, quando)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  s.connect(f)
  f.connect(g)
  g.connect(saida)
  s.start(quando)
  s.stop(quando + dur + 0.02)
}

/** UMA batida em porta de madeira. */
function batida(c, quando, forca) {
  const f = forca === undefined ? 1 : forca
  estalo(c, mestre, quando, 1900, 0.030, 0.30 * f)
  estalo(c, mestre, quando, 620, 0.055, 0.22 * f)
  tom(c, mestre, 155, quando, 0.150, 0.34 * f)
  tom(c, mestre, 291, quando, 0.110, 0.17 * f)
  tom(c, mestre, 70, quando, 0.075, 0.30 * f)
}

/**
 * TOC TOC TOC. Tres batidas com o ritmo de mao humana.
 *
 * Os intervalos (195 e 185 ms) e as forcas (1, 0.82, 0.95) sao desiguais de
 * proposito: com tres batidas identicas e igualmente espacadas o resultado soa
 * como aviso de maquina, e o que se quer aqui e alguem batendo.
 */
export function bater() {
  const c = contexto()
  if (!c) return false
  const t0 = c.currentTime + 0.02
  batida(c, t0, 1.0)
  batida(c, t0 + 0.195, 0.82)
  batida(c, t0 + 0.380, 0.95)
  return true
}

/** Duracao aproximada do toc-toc-toc, em segundos. Quem espera usa isso. */
export const DURACAO_BATIDA = 0.53

/**
 * Porta velha abrindo: o rangido da dobradica e o baque da folha no fim.
 *
 * O rangido e um serrote (sawtooth) subindo devagar por um passa-banda estreito
 * — dobradica seca e uma frequencia que ESCORREGA, nao uma nota parada.
 */
export function porta(dur) {
  const c = contexto()
  if (!c) return false
  const d = Math.max(0.35, Math.min(1.6, dur || 0.85))
  const t0 = c.currentTime + 0.02

  const o = c.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(420, t0)
  o.frequency.exponentialRampToValueAtTime(880, t0 + d * 0.75)
  o.frequency.exponentialRampToValueAtTime(700, t0 + d)
  const f = c.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.setValueAtTime(900, t0)
  f.Q.value = 9
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.08)
  g.gain.exponentialRampToValueAtTime(0.030, t0 + d * 0.7)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d)
  o.connect(f); f.connect(g); g.connect(mestre)
  o.start(t0)
  o.stop(t0 + d + 0.05)

  // o baque do fim do curso
  tom(c, mestre, 92, t0 + d, 0.14, 0.22)
  estalo(c, mestre, t0 + d, 380, 0.05, 0.12)
  return true
}

/** Volume geral, 0 a 1. Fica aqui pra quando houver tela de opcoes. */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0))
  if (mestre) mestre.gain.value = volume
}

/** Pro teste de fumaca: diz se o audio chegou a existir nesta maquina. */
export function disponivel() { return !quebrado }

export default { bater, porta, setVolume, disponivel, DURACAO_BATIDA }
