import { LEVELS } from '../config.js'

// ---------------------------------------------------------------------------
// src/systems/pisos.js — O CHAO QUE TEM MAIS DE UM ANDAR.
//
// O PROBLEMA, e por que ele so apareceu agora. A altura do piso neste jogo e
// uma funcao `groundY(x, z) -> y`: uma cota por metro quadrado do mapa. Isso
// deu conta de tudo ate aqui porque tudo ate aqui e TERREO — calcada, rua,
// parque, beco, piso de loja. Mas uma funcao de duas entradas nao consegue
// responder "3,16 m" e "0,16 m" para o MESMO x,z, e e exatamente isso que um
// predio de tres andares pede.
//
// A SAIDA E A TERCEIRA ENTRADA: a altura em que o jogador JA ESTA. Com ela a
// pergunta deixa de ser ambigua — de todas as lajes que cobrem aquele ponto,
// vale a MAIS ALTA que ainda esteja ao alcance do pe (`yRef + TOL`). Quem esta
// no segundo andar recebe a laje do segundo; quem esta no terreo, a do terreo,
// mesmo estando na mesma vertical.
//
// E POR QUE ISSO NAO MEXEU NO CONTROLLER. `player.setGroundSampler(fn)` recebe
// uma `fn(x, z)`, e nao ha por onde passar um terceiro argumento. Nao precisa:
// quem monta o amostrador em main.js e um CLOSURE que ja tem o jogador na mao,
// entao ele le `player.position.y` sozinho. O controller continua achando que
// o chao e uma funcao de duas entradas — e continua estando certo, do ponto de
// vista dele.
//
// AS ESCADAS SAO RAMPAS. A geometria tem degrau (senao nao le como escada),
// mas o piso de colisao e um plano inclinado. E o que todo jogo faz, e aqui e
// obrigatorio: o controller CANCELA o avanco horizontal quando o piso sobe mais
// que LEVELS.STEP_MAX de um quadro pro outro, entao uma escada modelada como
// degraus de verdade so seria subivel se cada espelho coubesse em 45 cm — e
// mesmo assim o jogador subiria aos trancos, um solavanco por degrau.
//
// O QUE ESTE MODULO NAO FAZ: colisao. Parede de segundo andar continua sendo
// caixa XZ sem altura em systems/collision.js, e quem tem plantas diferentes por
// andar precisa ligar e desligar os colisores por conta propria (world/cortico.js
// faz isso com o campo `ativo`). Aqui so mora o CHAO.
// ---------------------------------------------------------------------------

// Folga acima do pe do jogador. Um pouco maior que o degrau maximo de propos:
// subindo uma rampa, a altura do corpo persegue a do piso com amortecimento
// (damp de 14/s no controller) e fica alguns centimetros atras. Com TOL igual a
// STEP_MAX essa diferenca fazia a propria rampa sair da lista de candidatas no
// meio da subida, e o jogador despencava pro andar de baixo.
const TOL = LEVELS.STEP_MAX + 0.10

/**
 * @param {(x:number,z:number)=>number} base  o chao do mundo (city.groundY).
 *   Vale onde nenhuma laje registrada cobre o ponto — ou seja, no mapa inteiro
 *   menos o punhado de metros quadrados que tem andar.
 */
export function criarPisos(base) {
  let chaoBase = typeof base === 'function' ? base : () => 0
  const lajes = []

  /**
   * Laje plana. Coordenadas de MUNDO, `y` absoluto (ja com o piso da loja
   * somado, se for o caso).
   */
  function laje(x0, x1, z0, z1, y, tag) {
    const l = {
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      y, y1: y, eixo: null, tag: tag || '',
    }
    lajes.push(l)
    return l
  }

  /**
   * Rampa. Sobe de `yA` (na borda menor do eixo) a `yB` (na borda maior).
   * `eixo` e 'x' ou 'z'.
   */
  function rampa(x0, x1, z0, z1, yA, yB, eixo, tag) {
    const l = {
      x0: Math.min(x0, x1), x1: Math.max(x0, x1),
      z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      y: yA, y1: yB, eixo: eixo === 'x' ? 'x' : 'z', tag: tag || '',
    }
    lajes.push(l)
    return l
  }

  /** Altura da laje `l` no ponto (assume que ele esta dentro dela). */
  function alturaDa(l, x, z) {
    if (!l.eixo) return l.y
    const a0 = l.eixo === 'x' ? l.x0 : l.z0
    const a1 = l.eixo === 'x' ? l.x1 : l.z1
    const v = l.eixo === 'x' ? x : z
    const t = (v - a0) / Math.max(1e-6, a1 - a0)
    return l.y + (l.y1 - l.y) * (t < 0 ? 0 : t > 1 ? 1 : t)
  }

  /**
   * A altura do piso em (x, z) para quem esta na altura `yRef`.
   *
   * A regra tem duas metades, e a segunda e a que faz o jogador CAIR em vez de
   * ficar preso no ar: se nenhuma laje esta ao alcance do pe (porque ele acabou
   * de sair de um vao), vale a MAIS BAIXA das que cobrem o ponto — que e o
   * chao pra onde ele esta indo.
   */
  function altura(x, z, yRef) {
    const ref = (typeof yRef === 'number' && isFinite(yRef)) ? yRef : 0
    let melhor = null, maisBaixa = null
    for (let i = 0; i < lajes.length; i++) {
      const l = lajes[i]
      if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) continue
      const y = alturaDa(l, x, z)
      if (maisBaixa === null || y < maisBaixa) maisBaixa = y
      if (y <= ref + TOL && (melhor === null || y > melhor)) melhor = y
    }
    if (melhor !== null) return melhor
    if (maisBaixa !== null) return maisBaixa
    return chaoBase(x, z)
  }

  /**
   * O AMOSTRADOR pro controller. `lerY` devolve a altura atual do jogador —
   * em main.js e `() => player.position.y`.
   *
   * O atalho do caso comum importa: no mapa inteiro fora dos predios com andar
   * isto e uma chamada direta ao chao da cidade mais um laco de meia duzia de
   * comparacoes de retangulo, que e o que roda duas vezes por quadro.
   */
  function amostrador(lerY) {
    return (x, z) => altura(x, z, lerY ? lerY() : 0)
  }

  return {
    laje,
    rampa,
    altura,
    amostrador,
    setBase(fn) { if (typeof fn === 'function') chaoBase = fn },
    get quantas() { return lajes.length },
    /** Pro teste: todas as cotas que cobrem um ponto, de baixo pra cima. */
    cotasEm(x, z) {
      const out = []
      for (const l of lajes) {
        if (x < l.x0 || x > l.x1 || z < l.z0 || z > l.z1) continue
        out.push(+alturaDa(l, x, z).toFixed(3))
      }
      return out.sort((a, b) => a - b)
    },
  }
}

export default criarPisos
