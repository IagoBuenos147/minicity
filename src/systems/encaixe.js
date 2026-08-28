import * as THREE from 'three'
import { itemDe } from '../mobilia/catalogo.js'

// ---------------------------------------------------------------------------
// src/systems/encaixe.js — por o movel comprado dentro do estabelecimento.
//
// O FLUXO, do jeito que o dono do projeto pediu:
//   clica na vaga da mochila -> um FANTASMA do movel segue a mira -> VERDE
//   quando cabe, VERMELHO quando nao -> a pegada aparece desenhada no chao ->
//   R e Q giram de 90 em 90 -> botao esquerdo confirma -> o movel vira coisa do
//   mundo. E de volta: mirar num movel ja posto e SEGURAR E devolve ele pra
//   mochila.
//
// COMO SE DECIDE SE CABE. Tres testes, nesta ordem, e o primeiro que falha e o
// que vira a mensagem na tela:
//
//   T1  a pegada inteira dentro de UMA zona de chao livre
//   T2  fora de todo retangulo proibido (o corredor da porta, a passagem entre
//       as duas salas)
//   T3  sem encostar em movel ja colocado
//
// A pegada e um RETANGULO ALINHADO AOS EIXOS, medido em celulas de 20 cm. Nao e
// caixa orientada e nao e lista de celulas soltas: com giro de 90 em 90 graus a
// pegada girada continua alinhada, e retangulo contra retangulo e comparacao de
// quatro numeros — exata, sem SAT e sem tolerancia de ponto flutuante
// escondida. A grade de 20 cm existe porque o interior da casa e multiplo
// exato dela nos dois eixos, entao nao sobra meia celula em canto nenhum.
//
// A PEGADA NAO E A CAIXA DA GEOMETRIA. Uma mesa de sinuca de 2,24 m ocupa 4,14 m
// de chao porque o taco tem 1,45 m e precisa entrar de cada lado — taco preso na
// parede e mesa que nao se joga. Quem declara isso e o catalogo da mobilia.
//
// ZERO ALOCACAO POR QUADRO: o fantasma e montado uma vez por item e reusado, os
// vetores sao de modulo, e o teste de encaixe so roda quando a celula ou o giro
// mudam.
// ---------------------------------------------------------------------------

const CELULA = 0.20
const ALCANCE = 4.6           // ate onde o jogador pode empurrar o fantasma
const ALCANCE_PEGAR = 3.5     // ate onde ele consegue guardar um movel
const SEGURAR = 0.5           // segundos de E pra guardar

const VERDE = 0x2fa87a
const VERMELHO = 0xc9394f

function neve(v) { return Math.round(v / CELULA) * CELULA }

export function criarEncaixe({ scene, camera, player, hud, inventario, casa, colisao, aoMudar } = {}) {
  const raio = new THREE.Raycaster()
  const _plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const _dir = new THREE.Vector3()
  const _alvo = new THREE.Vector3()
  const _olho = new THREE.Vector3()
  const _cx = new THREE.Box3()
  const _tam = new THREE.Vector3()

  const grupo = new THREE.Group()
  grupo.name = 'moveis-da-casa'
  if (scene) scene.add(grupo)

  const postos = []             // { id, x, z, giro, obj, colisor, r: {x0,x1,z0,z1} }
  const fantasmas = new Map()   // id -> Object3D reusado

  // A pegada desenhada no chao: um plano so, reusado, que muda de cor e tamanho.
  const matPegada = new THREE.MeshBasicMaterial({
    color: VERDE, transparent: true, opacity: 0.34, depthWrite: false,
    side: THREE.DoubleSide,
  })
  const pegada = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matPegada)
  pegada.rotation.x = -Math.PI / 2
  pegada.visible = false
  pegada.renderOrder = 2
  grupo.add(pegada)

  // A moldura da altura: doze arestas em UM LineSegments, pra mostrar o volume
  // que a peca ocupa sem pintar o fantasma inteiro.
  const matAresta = new THREE.LineBasicMaterial({ color: VERDE, transparent: true, opacity: 0.85 })
  const caixaAresta = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), matAresta)
  caixaAresta.visible = false
  grupo.add(caixaAresta)

  let ativo = false
  let vaga = -1
  let item = null
  let giro = 0                  // 0..3, em quartos de volta
  let ondeX = 0, ondeZ = 0
  let cabe = false
  let motivo = ''
  let ultimoTeste = ''          // chave "x,z,giro": so testa quando muda
  let miraNoMovel = null
  let segurando = 0

  /** Zonas e proibidos vem da CASA: quem conhece a planta e ela. */
  function planta() {
    return (casa && casa.zonasDeMovel) || null
  }

  /** A pegada de `item` com o giro atual, em metros. */
  function tamanho(m) {
    const p = m.pegada || { larg: 1, prof: 1 }
    return (giro % 2 === 0)
      ? { w: p.larg, d: p.prof }
      : { w: p.prof, d: p.larg }
  }

  function retanguloEm(m, x, z, g) {
    const p = m.pegada || { larg: 1, prof: 1 }
    const w = (g % 2 === 0) ? p.larg : p.prof
    const d = (g % 2 === 0) ? p.prof : p.larg
    return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }
  }

  function dentroDe(r, z) {
    return r.x0 >= z.x0 - 1e-6 && r.x1 <= z.x1 + 1e-6 && r.z0 >= z.z0 - 1e-6 && r.z1 <= z.z1 + 1e-6
  }

  function cruza(a, b) {
    return a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6
  }

  /** Os tres testes. Devolve '' quando cabe, ou a frase do porque nao. */
  function testar(r) {
    const pl = planta()
    if (!pl) return 'aqui nao da pra por movel'
    let numaZona = false
    for (const z of pl.zonas) if (dentroDe(r, z)) { numaZona = true; break }
    if (!numaZona) return 'nao cabe ai'
    for (const p of pl.proibidos) if (cruza(r, p)) return p.motivo || 'ia trancar a passagem'
    for (const m of postos) if (cruza(r, m.r)) return 'ja tem coisa nesse lugar'
    return ''
  }

  /** O fantasma de um item: a MESMA geometria do movel, so que translucida. */
  function fantasmaDe(m) {
    let f = fantasmas.get(m.id)
    if (f) return f
    f = m.build()
    f.traverse((o) => {
      if (!o.isMesh) return
      o.castShadow = false
      o.receiveShadow = false
      // material proprio por mesh: pintar o do cache deixaria a mesa da LOJA
      // verde junto com o fantasma
      o.material = new THREE.MeshBasicMaterial({
        color: VERDE, transparent: true, opacity: 0.42, depthWrite: false,
      })
    })
    f.userData.pintar = (hex) => {
      f.traverse((o) => { if (o.isMesh && o.material) o.material.color.setHex(hex) })
    }
    fantasmas.set(m.id, f)
    return f
  }

  let fantasma = null

  function entrar(i, id) {
    const m = itemDe(id)
    if (!m || !m.naCasa) return false
    sair()
    vaga = i
    item = m
    giro = 0
    ativo = true
    ultimoTeste = ''
    fantasma = fantasmaDe(m)
    grupo.add(fantasma)
    pegada.visible = true
    caixaAresta.visible = true
    if (hud) hud.setPrompt('Botao esquerdo poe · R/Q gira · Esc cancela')
    return true
  }

  function sair() {
    ativo = false
    vaga = -1
    item = null
    if (fantasma && fantasma.parent) fantasma.parent.remove(fantasma)
    fantasma = null
    pegada.visible = false
    caixaAresta.visible = false
    if (hud) hud.setPrompt(null)
  }

  /** Poe de verdade: monta o movel, registra o colisor e tira da mochila. */
  function confirmar() {
    if (!ativo || !cabe || !item) return false
    // A VAGA AINDA TEM O ITEM? O modo guarda o indice, e entre entrar e
    // confirmar o jogador pode ter mexido na mochila (comprou, guardou outro
    // movel, arrastou). Sem esta conferencia o movel nasceria no chao sem sair
    // de lugar nenhum — de graca.
    const naVaga = inventario.ver(vaga)
    if (!naVaga || naVaga.id !== item.id) { sair(); return false }
    const m = item
    const obj = m.build()
    obj.position.set(ondeX, (casa && casa.pisoY) || 0.16, ondeZ)
    obj.rotation.y = giro * Math.PI / 2
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    grupo.add(obj)

    const r = retanguloEm(m, ondeX, ondeZ, giro)
    // O COLISOR e o gabinete, e nao a pegada: a folga do taco e espaco de USO,
    // e o jogador tem que poder andar nela. Barrar a pegada inteira faria a
    // mesa parecer o dobro do tamanho no escuro.
    _cx.setFromObject(obj)
    _cx.getSize(_tam)
    const cx = (_cx.min.x + _cx.max.x) / 2
    const cz = (_cx.min.z + _cx.max.z) / 2
    const col = {
      minX: cx - _tam.x / 2, maxX: cx + _tam.x / 2,
      minZ: cz - _tam.z / 2, maxZ: cz + _tam.z / 2,
      tag: 'movel-' + m.id, ativo: true,
    }
    if (colisao && typeof colisao.add === 'function') colisao.add([col])

    postos.push({ id: m.id, x: ondeX, z: ondeZ, giro, obj, colisor: col, r })
    inventario.retirar(vaga, 1)
    if (hud) hud.toast(m.nome + ' instalada.')
    if (typeof aoMudar === 'function') aoMudar('instalou')
    sair()
    return true
  }

  /** Guarda de volta. Recusa quando nao ha vaga — senao o movel evapora. */
  function guardar(posto) {
    if (!posto) return false
    if (!inventario.temEspacoPara(posto.id, 1)) {
      if (hud) { hud.toast('Sem espaco no inventario.'); hud.negarMochila() }
      return false
    }
    if (posto.colisor) posto.colisor.ativo = false
    if (posto.obj && posto.obj.parent) posto.obj.parent.remove(posto.obj)
    posto.obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose() })
    const i = postos.indexOf(posto)
    if (i >= 0) postos.splice(i, 1)
    const vagaNova = inventario.adicionar(posto.id, 1)
    if (hud && vagaNova >= 0) hud.piscarVaga(vagaNova)
    const m = itemDe(posto.id)
    if (hud) hud.toast((m ? m.nome : 'Movel') + ' guardada.')
    if (typeof aoMudar === 'function') aoMudar('guardou')
    return true
  }

  /** Qual movel a mira esta pegando, se algum. Sem alocar. */
  function movelNaMira() {
    if (!camera || !postos.length) return null
    camera.getWorldPosition(_olho)
    camera.getWorldDirection(_dir)
    let melhor = null
    let melhorD = ALCANCE_PEGAR
    for (const p of postos) {
      _cx.setFromObject(p.obj)
      // O raio contra a caixa: o proprio Box3 sabe. Sem intersectBox nao daria
      // pra fazer isto sem alocar um Ray por movel.
      raio.set(_olho, _dir)
      raio.far = ALCANCE_PEGAR
      const ponto = raio.ray.intersectBox(_cx, _alvo)
      if (!ponto) continue
      const d = _olho.distanceTo(_alvo)
      if (d < melhorD) { melhorD = d; melhor = p }
    }
    return melhor
  }

  /**
   * Poe o fantasma, a pegada e a caixa no lugar e no giro atuais, e recalcula o
   * verde/vermelho quando alguma das duas coisas mudou.
   *
   * Saiu de dentro do atualizar pra que mirarEm() (teste e console) desenhe
   * EXATAMENTE o que a mira desenha. Duas copias divergiriam no primeiro
   * ajuste, e o teste passaria a proteger uma coisa que o jogador nao ve.
   */
  function desenharFantasma() {
    if (!ativo || !item || !fantasma) return
    const pisoY = (casa && casa.pisoY) || 0.16
    const chave = ondeX + ',' + ondeZ + ',' + giro
    if (chave !== ultimoTeste) {
      ultimoTeste = chave
      motivo = testar(retanguloEm(item, ondeX, ondeZ, giro))
      cabe = !motivo
      const cor = cabe ? VERDE : VERMELHO
      if (fantasma.userData.pintar) fantasma.userData.pintar(cor)
      matPegada.color.setHex(cor)
      matAresta.color.setHex(cor)
    }
    const t = tamanho(item)
    fantasma.position.set(ondeX, pisoY, ondeZ)
    fantasma.rotation.y = giro * Math.PI / 2
    pegada.position.set(ondeX, pisoY + 0.012, ondeZ)
    pegada.scale.set(t.w, t.d, 1)
    _cx.setFromObject(fantasma)
    _cx.getSize(_tam)
    caixaAresta.position.set(ondeX, pisoY + _tam.y / 2, ondeZ)
    caixaAresta.scale.set(t.w, Math.max(0.1, _tam.y), t.d)
  }

  function atualizar(dt, input) {
    // --- modo de posicionamento --------------------------------------------
    if (ativo && item && fantasma) {
      const pisoY = (casa && casa.pisoY) || 0.16
      _plano.constant = -pisoY
      camera.getWorldPosition(_olho)
      camera.getWorldDirection(_dir)
      raio.set(_olho, _dir)
      const bateu = raio.ray.intersectPlane(_plano, _alvo)
      if (bateu) {
        // limita ao alcance do JOGADOR, nao da camera: em terceira pessoa a
        // lente esta 4 m atras dele e o movel iria pro dobro da distancia
        const px = player.position.x, pz = player.position.z
        let dx = _alvo.x - px, dz = _alvo.z - pz
        const d = Math.hypot(dx, dz)
        if (d > ALCANCE) { dx *= ALCANCE / d; dz *= ALCANCE / d }
        ondeX = neve(px + dx)
        ondeZ = neve(pz + dz)
      }

      if (input) {
        if (input.wasPressed('KeyR')) giro = (giro + 1) % 4
        if (input.wasPressed('KeyQ')) giro = (giro + 3) % 4
      }

      desenharFantasma()

      if (hud) {
        hud.setPrompt(cabe
          ? ('Instalar ' + item.nome + ' · R/Q gira · Esc cancela')
          : (motivo + ' · R/Q gira · Esc cancela'))
      }
      return true
    }

    // --- fora do modo: mirar num movel e segurar E pra guardar --------------
    miraNoMovel = movelNaMira()
    if (!miraNoMovel) { segurando = 0; return false }
    const m = itemDe(miraNoMovel.id)
    const nome = m ? m.nome : 'movel'
    if (input && input.isDown('KeyE')) {
      segurando += dt
      if (segurando >= SEGURAR) {
        segurando = 0
        guardar(miraNoMovel)
        miraNoMovel = null
        if (hud) hud.setPrompt(null)
        return true
      }
      const pct = Math.round((segurando / SEGURAR) * 100)
      if (hud) hud.setPrompt('Guardando ' + nome + '... ' + pct + '%')
    } else {
      segurando = 0
      if (hud) hud.setPrompt('Segure E para guardar ' + nome)
    }
    return true
  }

  return {
    grupo,
    get ativo() { return ativo },
    get temMiraEmMovel() { return !!miraNoMovel },
    entrar,
    sair,
    confirmar,
    atualizar,

    // --- por fora da mira ---------------------------------------------------
    // O modo normal escolhe o lugar com o raio da camera. Estas tres existem
    // pro teste de fumaca e pro console: mirar com a camera num teste testaria
    // o raycaster, e nao os tres testes de encaixe, que sao o que importa.

    /** Cabe um `id` nesse lugar? Nao mexe em nada. */
    podeEm(id, x, z, g) {
      const m = itemDe(id)
      if (!m || !m.naCasa) return { pode: false, motivo: 'isso nao e movel de casa' }
      const por = testar(retanguloEm(m, Number(x) || 0, Number(z) || 0, (g | 0) % 4))
      return { pode: por === '', motivo: por }
    },

    /** Poe o fantasma nesse lugar (o que a mira faria) e responde se cabe. */
    mirarEm(x, z, g) {
      if (!ativo || !item) return { pode: false, motivo: 'nao esta segurando nada' }
      if (g !== undefined) giro = (g | 0) % 4
      ondeX = Number(x) || 0
      ondeZ = Number(z) || 0
      ultimoTeste = ''
      desenharFantasma()
      return { pode: cabe, motivo }
    },

    /** Guarda o movel `i` da lista de serializar(). */
    guardarEm(i) { return guardar(postos[i | 0]) },
    get quantosPostos() { return postos.length },
    /** Pro save: a lista do que esta posto. */
    serializar() {
      return postos.map((p) => ({ id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), g: p.giro }))
    },
    /** Do save de volta. Nao usa os testes: o que foi salvo ja era valido. */
    aplicar(lista) {
      for (const p of postos.slice()) {
        if (p.colisor) p.colisor.ativo = false
        if (p.obj && p.obj.parent) p.obj.parent.remove(p.obj)
      }
      postos.length = 0
      if (!Array.isArray(lista)) return
      const pisoY = (casa && casa.pisoY) || 0.16
      for (const d of lista) {
        const m = itemDe(d && d.id)
        if (!m || !m.naCasa) continue
        const obj = m.build()
        obj.position.set(Number(d.x) || 0, pisoY, Number(d.z) || 0)
        obj.rotation.y = ((d.g | 0) % 4) * Math.PI / 2
        obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
        grupo.add(obj)
        const r = retanguloEm(m, obj.position.x, obj.position.z, d.g | 0)
        _cx.setFromObject(obj)
        _cx.getSize(_tam)
        const col = {
          minX: (_cx.min.x + _cx.max.x) / 2 - _tam.x / 2, maxX: (_cx.min.x + _cx.max.x) / 2 + _tam.x / 2,
          minZ: (_cx.min.z + _cx.max.z) / 2 - _tam.z / 2, maxZ: (_cx.min.z + _cx.max.z) / 2 + _tam.z / 2,
          tag: 'movel-' + m.id, ativo: true,
        }
        if (colisao && typeof colisao.add === 'function') colisao.add([col])
        postos.push({ id: m.id, x: obj.position.x, z: obj.position.z, giro: d.g | 0, obj, colisor: col, r })
      }
    },
  }
}

export default criarEncaixe
