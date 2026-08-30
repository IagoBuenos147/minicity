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
    // Tab move o foco pra fora do canvas; F5 recarrega a pagina e levaria o
    // jogo junto. Como as duas viraram tecla de jogo (ajuda e tela de save), o
    // navegador nao pode ficar com elas.
    if (e.code === 'Tab' || e.code === 'F5') e.preventDefault()
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

  /**
   * BOTAO DO MOUSE COMO TECLA: 'Mouse0' e o esquerdo, 'Mouse2' o direito.
   *
   * Existe porque o modo de encaixe de movel confirma no clique e precisa do
   * mesmo wasPressed() do resto do jogo. O revolver continua com os listeners
   * PROPRIOS dele: ele so escuta quando esta equipado e com o ponteiro preso, e
   * misturar as duas coisas faria um clique de confirmar movel virar um tiro.
   */
  function codigoDoBotao(b) {
    return b === 0 ? 'Mouse0' : b === 2 ? 'Mouse2' : b === 1 ? 'Mouse1' : null
  }
  function onMouseDown(e) {
    const c = codigoDoBotao(e.button)
    if (!c || down.has(c)) return
    down.add(c)
    pressed.add(c)
  }
  function onMouseUp(e) {
    const c = codigoDoBotao(e.button)
    if (!c) return
    down.delete(c)
    released.add(c)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mousedown', onMouseDown)
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('pointerlockchange', onLockChange)

  let insistencia = null
  function pararInsistencia() {
    if (insistencia) { clearTimeout(insistencia); insistencia = null }
  }

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

    /**
     * Pede o mouse de volta. Com `insistir`, tenta de novo por ate 2 segundos.
     *
     * O RETRY NAO E PARANOIA, E O UNICO JEITO DE FUNCIONAR DEPOIS DO ESC. O
     * Chrome impoe um periodo de carencia de mais ou menos 1,25 s a cada
     * pointer lock que o USUARIO desfez apertando Esc: qualquer
     * requestPointerLock nesse intervalo e ignorado em silencio (o evento que
     * chega e `pointerlockerror`, nao um throw). Entao a janela de loja que
     * fecha no Esc e pede o mouse na mesma hora nao recebe nada, e o jogador
     * fica preso com o cursor solto ate clicar na tela — que foi exatamente a
     * queixa do dono.
     *
     * Fechar no X ou no veu e clique, e nesse caso o pedido passa de primeira;
     * a insistencia so entra em acao no caso do Esc.
     */
    requestLock(insistir) {
      pararInsistencia()
      if (locked || !dom.requestPointerLock) return
      try { dom.requestPointerLock() } catch (err) { void err }
      if (!insistir) return
      const ate = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 2000
      const tentar = () => {
        insistencia = null
        const agora = (typeof performance !== 'undefined' ? performance.now() : Date.now())
        if (locked || agora > ate) return
        try { dom.requestPointerLock() } catch (err) { void err }
        insistencia = setTimeout(tentar, 180)
      }
      insistencia = setTimeout(tentar, 180)
    },

    /** Solta o mouse. CANCELA a insistencia: quem abre uma janela por cima nao
     *  pode ter o mouse roubado de volta pelo retry da janela anterior. */
    exitLock() {
      pararInsistencia()
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
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('pointerlockchange', onLockChange)
    },
  }
}
