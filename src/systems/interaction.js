// ---------------------------------------------------------------------------
// Acha o ponto de interacao mais proximo do jogador e dispara com E.
// ---------------------------------------------------------------------------

export function createInteractionSystem() {
  const items = []
  let current = null

  /** DEVOLVE os itens criados, pra quem precisa liga-los e desliga-los depois
   *  (a troca de cenario desliga os pontos do cenario que saiu de cena). */
  function add(list) {
    if (!list) return []
    const arr = Array.isArray(list) ? list : [list]
    const feitos = []
    for (const it of arr) {
      if (!it || !it.position) continue
      const novo = {
        id: it.id || 'it' + items.length,
        position: it.position,
        radius: it.radius || 2,
        label: it.label || 'Interagir',
        onInteract: it.onInteract || (() => {}),
        enabled: it.enabled !== false,
      }
      items.push(novo)
      feitos.push(novo)
    }
    return feitos
  }

  /** Retorna o interactable ativo (ou null). */
  function update(playerPos) {
    let best = null
    let bestD = Infinity
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.enabled) continue
      const dx = it.position.x - playerPos.x
      const dz = it.position.z - playerPos.z
      const dy = (it.position.y - playerPos.y) * 0.5 // altura pesa menos
      const d2 = dx * dx + dz * dz + dy * dy
      if (d2 <= it.radius * it.radius && d2 < bestD) {
        bestD = d2
        best = it
      }
    }
    current = best
    return current
  }

  function trigger(game) {
    if (!current) return false
    current.onInteract(game)
    return true
  }

  function setEnabled(id, v) {
    const it = items.find((x) => x.id === id)
    if (it) it.enabled = v
  }

  return { add, update, trigger, setEnabled, get current() { return current }, items }
}
