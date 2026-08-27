// ---------------------------------------------------------------------------
// Teclado + mouse + pointer lock. O main chama endFrame() no fim de cada frame
// para limpar os estados de "apertou agora".
// ---------------------------------------------------------------------------

export function createInput(dom) {
  const down = new Set()
  const pressed = new Set()
  const released = new Set()
  let dx = 0, dy = 0
  let locked = false
  let enabled = true
  const listeners = { lockchange: [] }

  function onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault()
    if (down.has(e.code)) return
    down.add(e.code)
    pressed.add(e.code)
  }
  function onKeyUp(e) {
    down.delete(e.code)
    released.add(e.code)
  }
  function onMouseMove(e) {
    if (!locked || !enabled) return
    dx += e.movementX || 0
    dy += e.movementY || 0
  }
  function onLockChange() {
    locked = document.pointerLockElement === dom
    if (!locked) down.clear()
    listeners.lockchange.forEach((f) => f(locked))
  }
  function onBlur() { down.clear() }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('pointerlockchange', onLockChange)

  return {
    isDown: (code) => enabled && down.has(code),
    wasPressed: (code) => enabled && pressed.has(code),
    wasReleased: (code) => enabled && released.has(code),
    anyDown: (codes) => enabled && codes.some((c) => down.has(c)),
    mouseDelta() {
      const d = { dx, dy }
      dx = 0; dy = 0
      return enabled ? d : { dx: 0, dy: 0 }
    },
    isLocked: () => locked,
    requestLock() {
      if (!locked && dom.requestPointerLock) dom.requestPointerLock()
    },
    exitLock() {
      if (locked && document.exitPointerLock) document.exitPointerLock()
    },
    setEnabled(v) { enabled = v; if (!v) down.clear() },
    onLockChange(fn) { listeners.lockchange.push(fn) },
    endFrame() { pressed.clear(); released.clear(); dx = 0; dy = 0 },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('pointerlockchange', onLockChange)
    },
  }
}
