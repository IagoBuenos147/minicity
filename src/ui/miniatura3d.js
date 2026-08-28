import * as THREE from 'three'

// ---------------------------------------------------------------------------
// src/ui/miniatura3d.js — o fotografo de objetos.
//
// Fotografa QUALQUER Object3D e devolve um PNG com fundo transparente, pro card
// da loja e pra vaga da mochila. E o mesmo mecanismo que src/ui/provador.js usa
// pra fotografar roupa, mas nao a mesma funcao: a de la e casada com o boneco
// (prepararAux, pecasDe, a tabela MINI por campo de aparencia), e uma mesa de
// sinuca nao tem campo de aparencia nem indice de catalogo.
//
// O QUE FOI COPIADO DE LA, E POR QUE:
//
//  - RENDER TARGET 2x E REDUCAO NO drawImage. Renderiza em 384 e o card usa
//    192: e supersampling na mao, e sem ele a borda de um taco vira escada. O
//    ctx do canvas pequeno ja nasce com a vertical invertida (translate + scale
//    -1), entao um unico drawImage reduz E desvira — a versao que copiava as
//    384 linhas na mao custava 23 ms por foto, mais que o render inteiro.
//  - ENQUADRAMENTO MEDIDO. A distancia sai da CAIXA do objeto e do fov, nunca
//    de um numero escrito na mao. E por isso que a mesma funcao fotografa um
//    baralho de 9 cm e uma mesa de 2,2 m sem nenhuma constante por item.
//
// O QUE MUDOU:
//
//  - FUNDO TRANSPARENTE. O provador desenha peca escura sobre painel escuro e
//    precisa do degrade atras; aqui o card ja tem feltro, e o alfa deixa o
//    feltro aparecer em volta da peca.
//  - A CENA E PRIVADA e as luzes dela NAO CONTAM no orcamento do jogo. O teste
//    de fumaca conta luzes de `game.scene`, e esta cena nunca entra la — mesmo
//    motivo pelo qual o mini-palco do provador ja tinha quatro luzes proprias.
//  - AS PECAS FICAM VIVAS no cache. Sao poucas e todo material delas vem do
//    cache global de world/materials.js: dar dispose numa mesa apagaria o
//    feltro do cassino junto.
// ---------------------------------------------------------------------------

const RT = 384
const PX = 192
const FOV = 34
const DEG = Math.PI / 180

export function criarFotografo(renderer) {
  if (!renderer) throw new Error('criarFotografo precisa do renderer do jogo')

  const cena = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 40)

  // As mesmas quatro luzes do mini-palco do provador: tres direcionais em
  // triangulo e um hemisferio de preenchimento. Chave alta na frente-esquerda,
  // recorte atras, e uma fraca embaixo pra peca escura nao virar silhueta.
  const l1 = new THREE.DirectionalLight(0xfff2dd, 2.6); l1.position.set(2.2, 3.0, 2.6); cena.add(l1)
  const l2 = new THREE.DirectionalLight(0xbfd8ff, 1.5); l2.position.set(-2.6, 1.4, -2.0); cena.add(l2)
  const l3 = new THREE.DirectionalLight(0xffffff, 0.7); l3.position.set(0.4, -1.6, 1.8); cena.add(l3)
  cena.add(new THREE.HemisphereLight(0xa8bde4, 0x201a14, 0.55))

  const alvo = new THREE.WebGLRenderTarget(RT, RT, {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
  })
  const pixels = new Uint8ClampedArray(RT * RT * 4)

  const cvGrande = document.createElement('canvas')
  cvGrande.width = cvGrande.height = RT
  const ctxGrande = cvGrande.getContext('2d')
  const imgData = ctxGrande.createImageData(RT, RT)

  const cvPeq = document.createElement('canvas')
  cvPeq.width = cvPeq.height = PX
  const ctxPeq = cvPeq.getContext('2d')
  ctxPeq.imageSmoothingEnabled = true
  ctxPeq.imageSmoothingQuality = 'high'
  ctxPeq.translate(0, PX)
  ctxPeq.scale(1, -1)

  const cache = new Map()
  const vivos = new Map()
  const _cx = new THREE.Box3()
  const _tam = new THREE.Vector3()
  const _cen = new THREE.Vector3()
  const _dir = new THREE.Vector3()

  /**
   * Foto do objeto `id`. `montar()` so e chamada na primeira vez.
   * `opcoes.folga` afrouxa o enquadramento (1.0 corta rente); `opcoes.orbY`
   * e `opcoes.orbP` giram a camera em volta da peca.
   */
  function foto(id, montar, opcoes) {
    const pronta = cache.get(id)
    if (pronta !== undefined) return pronta
    if (typeof montar !== 'function') return null

    let obj = vivos.get(id)
    if (!obj) {
      obj = montar()
      if (!obj) return null
      vivos.set(id, obj)
    }
    cena.add(obj)
    obj.visible = true
    obj.updateWorldMatrix(true, true)

    const o = opcoes || {}
    const orbY = o.orbY !== undefined ? o.orbY : 0.85
    const orbP = o.orbP !== undefined ? o.orbP : 0.42
    const folga = o.folga || 1.24

    _cx.setFromObject(obj)
    _cx.getSize(_tam)
    _cx.getCenter(_cen)
    // O card e quadrado: caber na altura nao basta quando a peca e tres vezes
    // mais larga que alta, entao manda o maior lado.
    const maior = Math.max(_tam.x, _tam.y, _tam.z) * folga
    const dist = Math.max(0.25, (maior * 0.5) / Math.tan(FOV * 0.5 * DEG))
    const cp = Math.cos(orbP)
    _dir.set(Math.sin(orbY) * cp, Math.sin(orbP), Math.cos(orbY) * cp)
    camera.position.copy(_cen).addScaledVector(_dir, dist)
    camera.lookAt(_cen)
    camera.updateProjectionMatrix()

    const rtAntes = renderer.getRenderTarget()
    const sombraAntes = renderer.shadowMap.enabled
    const limparAntes = renderer.getClearAlpha()
    renderer.shadowMap.enabled = false      // 192 px nao mostram sombra, so custam
    renderer.setClearAlpha(0)
    renderer.setRenderTarget(alvo)
    renderer.clear()
    renderer.render(cena, camera)
    renderer.readRenderTargetPixels(alvo, 0, 0, RT, RT, pixels)
    renderer.setRenderTarget(rtAntes)
    renderer.shadowMap.enabled = sombraAntes
    renderer.setClearAlpha(limparAntes)

    imgData.data.set(pixels)
    ctxGrande.putImageData(imgData, 0, 0)
    ctxPeq.clearRect(0, 0, PX, PX)
    ctxPeq.drawImage(cvGrande, 0, 0, PX, PX)
    const url = cvPeq.toDataURL('image/png')

    cena.remove(obj)
    cache.set(id, url)
    return url
  }

  function temFoto(id) { return cache.has(id) }

  function dispose() {
    cache.clear()
    for (const o of vivos.values()) {
      o.traverse((c) => { if (c.isMesh && c.geometry) c.geometry.dispose() })
    }
    vivos.clear()
    alvo.dispose()
    cena.clear()
  }

  return { foto, temFoto, dispose }
}

export default criarFotografo
