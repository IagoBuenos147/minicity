import { contextoDeAudio } from '../audio/som.js'

// ---------------------------------------------------------------------------
// src/cassino/som-mesa.js — O SOM DA MESA, SINTETIZADO.
//
// O pedido falava em "juice": peso, resposta, antecipacao. Metade disso e som —
// uma carta que encosta no feltro sem fazer barulho parece um decalque
// aparecendo, nao uma carta sendo dada.
//
// A REGRA DO PROJETO VALE AQUI IGUAL: nenhum asset externo. Nada de .wav. Cada
// som e montado com osciladores e ruido, do mesmo jeito que o toc-toc da porta
// em audio/som.js — e o AudioContext e EMPRESTADO daquele arquivo
// (contextoDeAudio), nunca criado aqui. Dois contextos numa aba sao duas
// threads de audio e dois relogios, e o navegador ainda limita quantos existem.
//
// O QUE CADA SOM E, FISICAMENTE:
//
//   carta()   papel batendo em pano. Um estalo de ruido curtissimo passado por
//             passa-banda alto (o "t"), mais um corpo grave de 30 ms quase sem
//             tom (o pano abafa). Sem o corpo vira um clique de mouse.
//   virar()   o mesmo estalo, porem com DOIS toques separados por 40 ms: a
//             carta levanta da borda e cai do outro lado. Duas batidas e a
//             diferenca entre "virou" e "apareceu".
//   ficha()   argila batendo em argila. Duas senoides agudas (1180 e 1760 Hz)
//             curtissimas com um pouco de ruido. A frequencia SOBE conforme a
//             pilha cresce, que e o que acontece de verdade — pilha alta soa
//             mais aguda porque a coluna de ar encurta.
//   deslizar() feltro. Ruido rosa por um passa-baixa que ABRE e fecha; sem a
//             varredura do filtro soa como chuvisco de TV.
//   dourado() o premio. Tres senoides em intervalo de terca, com cauda longa.
//   baque()   o estouro. Uma senoide de 58 Hz com queda rapida e um ruido seco.
//
// TUDO E OPCIONAL: sem Web Audio (headless, aba sem gesto do usuario ainda)
// cada funcao vira no-op. Som nao pode derrubar quadro nenhum, e nao pode
// impedir a mesa de funcionar.
// ---------------------------------------------------------------------------

// Um ganho proprio pra mesa, pendurado no destino. Nao usa o 'mestre' de
// audio/som.js porque aquele e privado daquele modulo — e ter o nosso permite
// abaixar a mesa inteira num numero so no dia em que houver tela de opcoes.
let bus = null
let ctxDoBus = null

function saida() {
  const c = contextoDeAudio()
  if (!c) return null
  if (!bus || ctxDoBus !== c) {
    bus = c.createGain()
    bus.gain.value = 0.85
    bus.connect(c.destination)
    ctxDoBus = c
  }
  return c
}

/** Ruido branco de 0,4 s, gerado uma vez e reusado por todos os estalos. */
let buf = null
function ruido(c) {
  if (buf && buf.sampleRate === c.sampleRate) return buf
  const n = Math.floor(c.sampleRate * 0.4)
  const b = c.createBuffer(1, n, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
  buf = b
  return b
}

function tom(c, freq, quando, dur, ganho, tipo) {
  const o = c.createOscillator()
  o.type = tipo || 'sine'
  o.frequency.setValueAtTime(freq, quando)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, quando)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, ganho), quando + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  o.connect(g)
  g.connect(bus)
  o.start(quando)
  o.stop(quando + dur + 0.02)
}

function chiado(c, quando, freq, q, dur, ganho, tipo) {
  const s = c.createBufferSource()
  s.buffer = ruido(c)
  s.loop = true
  const f = c.createBiquadFilter()
  f.type = tipo || 'bandpass'
  f.frequency.setValueAtTime(freq, quando)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(ganho, quando)
  g.gain.exponentialRampToValueAtTime(0.0001, quando + dur)
  s.connect(f)
  f.connect(g)
  g.connect(bus)
  s.start(quando)
  s.stop(quando + dur + 0.02)
  return f
}

function agora(c, atraso) {
  return c.currentTime + 0.015 + Math.max(0, atraso || 0)
}

// ---------------------------------------------------------------------------
// Os sons
// ---------------------------------------------------------------------------

/** Carta encostando no feltro. 'forca' 0..1 muda o peso, nao o tom. */
export function carta(atraso, forca) {
  const c = saida()
  if (!c) return false
  const f = forca === undefined ? 1 : Math.max(0.2, Math.min(1.4, forca))
  const t = agora(c, atraso)
  chiado(c, t, 2600, 0.9, 0.022, 0.16 * f)
  chiado(c, t, 900, 1.6, 0.040, 0.13 * f)
  tom(c, 210, t, 0.045, 0.10 * f)
  return true
}

/** A carta virando: levanta na borda e cai do outro lado. */
export function virar(atraso) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  chiado(c, t, 3100, 1.0, 0.018, 0.10)
  chiado(c, t + 0.052, 2400, 0.9, 0.026, 0.15)
  tom(c, 190, t + 0.052, 0.050, 0.09)
  return true
}

/** Ficha caindo na pilha. 'nivel' e a altura da pilha (0, 1, 2...). */
export function ficha(atraso, nivel) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  // A subida por nivel e pequena de proposito: uma oitava inteira numa pilha de
  // dez fichas viraria escala musical, e ai o ouvido escuta melodia em vez de
  // material.
  const k = 1 + Math.min(9, Math.max(0, nivel || 0)) * 0.035
  chiado(c, t, 5200 * k, 3.0, 0.014, 0.09)
  tom(c, 1180 * k, t, 0.038, 0.055, 'triangle')
  tom(c, 1760 * k, t, 0.026, 0.030, 'sine')
  tom(c, 320, t, 0.030, 0.020)
  return true
}

/** Fichas deslizando no feltro (a casa varrendo, o pote sendo empurrado). */
export function deslizar(atraso, dur) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  const d = Math.max(0.16, Math.min(0.9, dur || 0.34))
  const f = chiado(c, t, 700, 0.7, d, 0.075, 'lowpass')
  // o filtro ABRE e fecha: e a varredura que faz o ouvido ouvir "arrastando"
  // em vez de "chuvisco".
  f.frequency.exponentialRampToValueAtTime(2200, t + d * 0.45)
  f.frequency.exponentialRampToValueAtTime(520, t + d)
  return true
}

/** O premio. Terca maior com cauda: o unico som alegre da mesa. */
export function dourado(atraso) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  tom(c, 784, t, 0.70, 0.075, 'triangle')
  tom(c, 988, t + 0.055, 0.66, 0.062, 'triangle')
  tom(c, 1319, t + 0.110, 0.80, 0.050, 'sine')
  tom(c, 1976, t + 0.110, 0.42, 0.020, 'sine')
  chiado(c, t, 6200, 1.4, 0.22, 0.030)
  return true
}

/** Estourou. Um baque grave e seco, sem nenhum tom claro. */
export function baque(atraso) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  tom(c, 58, t, 0.22, 0.19)
  tom(c, 92, t, 0.13, 0.10)
  chiado(c, t, 320, 0.7, 0.09, 0.10, 'lowpass')
  return true
}

/** A mesa fechando / o gongo curto de fim de mao. */
export function selo(atraso) {
  const c = saida()
  if (!c) return false
  const t = agora(c, atraso)
  tom(c, 262, t, 0.36, 0.055, 'triangle')
  tom(c, 175, t, 0.44, 0.045, 'sine')
  return true
}

/** Volume geral da mesa, 0..1. Existe pro dia da tela de opcoes. */
export function setVolume(v) {
  const c = saida()
  if (c && bus) bus.gain.value = Math.max(0, Math.min(1, Number(v) || 0))
}

export default { carta, virar, ficha, deslizar, dourado, baque, selo, setVolume }
