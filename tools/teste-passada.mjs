// Verifica a passada: altura do tornozelo, balanco do quadril e — o que mais
// importa — se a VELOCIDADE QUE A ANIMACAO ENTREGA bate com a velocidade real
// do jogador. Quando as duas divergem o pe patina no chao, e nenhum detalhe de
// peso salva uma passada que patina.
//
//   velocidade da animacao = passo desenhado x 2 x cadencia
//
// O passo desenhado e a excursao do tornozelo em Z durante o apoio, e a
// cadencia sai da contagem de apoios no periodo medido.
import * as THREE from 'three'
import { createCharacter } from '../src/player/character.js'
import { createAnimator } from '../src/player/animation.js'

const c = createCharacter({})
const an = createAnimator(c)
const dt = 1 / 240
const SEGUNDOS = 8
const N = Math.round(SEGUNDOS / dt)

function medir(vel, correndo, nome) {
  for (let i = 0; i < 1200; i++) an.update(dt, { speed: vel, moving: true, running: correndo, grounded: true, vy: 0 })

  const pL = new THREE.Vector3(), q = new THREE.Vector3()
  const REPOUSO = 0.0905
  let yMin = 9, yMax = -9, qMin = 9, qMax = -9
  let apoios = 0, noChao = false, quadros = 0
  let zEntra = 0, somaPasso = 0

  for (let i = 0; i < N; i++) {
    an.update(dt, { speed: vel, moving: true, running: correndo, grounded: true, vy: 0 })
    c.root.updateMatrixWorld(true)
    c.parts.footL.getWorldPosition(pL)
    c.parts.hips.getWorldPosition(q)
    yMin = Math.min(yMin, pL.y); yMax = Math.max(yMax, pL.y)
    qMin = Math.min(qMin, q.y); qMax = Math.max(qMax, q.y)
    // "no chao" = tornozelo a menos de 1 cm da altura de repouso
    // 2 cm de folga e um minimo de 8 quadros: com 1 cm o pe que mal levanta
    // (caminhada lenta) entrava e saia varias vezes por ciclo e a contagem de
    // apoios saia dobrada.
    const baixo = pL.y < REPOUSO + 0.020
    if (baixo && !noChao) { zEntra = pL.z; noChao = true; quadros = 0 }
    else if (baixo) quadros++
    else if (noChao) { if (quadros > 8) { somaPasso += zEntra - pL.z; apoios++ } ; noChao = false }
  }

  const cad = apoios / SEGUNDOS               // ciclos por segundo
  const passo = apoios ? somaPasso / apoios : 0
  const velAnim = passo * 2 * cad
  const erro = vel > 0 ? ((velAnim - vel) / vel) * 100 : 0
  console.log(
    nome.padEnd(9),
    'tornozelo ' + yMin.toFixed(3) + '..' + yMax.toFixed(3),
    '| quadril bob ' + ((qMax - qMin) * 100).toFixed(1) + ' cm',
    '| passo ' + passo.toFixed(3) + ' m',
    '| cadencia ' + cad.toFixed(2) + ' ciclos/s',
    '| animacao ' + velAnim.toFixed(2) + ' m/s vs ' + vel.toFixed(2),
    '(' + (erro >= 0 ? '+' : '') + erro.toFixed(0) + '%)',
    yMin < REPOUSO - 0.004 ? '  <-- PE ATRAVESSA O CHAO' : '')
}

medir(0.8, false, 'devagar')
medir(1.6, false, 'andando')
medir(3.1, false, 'padrao')
medir(4.6, true, 'trote')
medir(6.2, true, 'correndo')
