import * as THREE from 'three'

// ---------------------------------------------------------------------------
// POOL DE LUZES DE EFEITO.
//
// O PROBLEMA. Cada efeito do jogo (o anel, o objeto levitado, a arma de portal,
// o portal aberto, o clarao do tiro, a aura do zumbi) queria uma PointLight so
// dele. Sao seis luzes soltas na raiz da cena que quase nunca acendem juntas —
// e mesmo apagadas elas continuam pesando, porque o custo de uma luz no three
// nao e "acender": e ESTAR na cena. O orcamento do teste de fumaca e 20 luzes e
// so a base (ambiente + hemisferio + dois direcionais) mais as luzes fixas da
// cidade e das duas lojas ja comem 18.
//
// A ARMADILHA que este arquivo existe pra evitar. O jeito "obvio" de economizar
// seria desligar a luz com `.visible = false` quando o efeito apaga. NAO FACA
// ISSO: o three monta o programa de shader de cada material a partir da
// CONTAGEM de luzes visiveis da cena. Mudar essa contagem invalida todos os
// materiais de uma vez e o renderer recompila a cena inteira no meio do quadro
// — um engasgo de varios quadros a cada tiro, a cada agarrar, a cada portal.
// Por isso as luzes deste pool nascem na cena, ficam VISIVEIS pra sempre e
// nunca saem: a contagem de luzes do jogo e CONSTANTE. Apagar e sempre
// intensity = 0, que nao custa recompilacao nenhuma.
//
// COMO FUNCIONA. O pool cria N PointLight de verdade (2, na pratica) e entrega
// pros modulos um PROXY: um THREE.Object3D comum, que nao e luz e nao custa
// nada no shader, com os mesmos campos que o modulo ja mexia (position, color,
// intensity, distance). O modulo poe o proxy no MESMO pai onde a luz estava —
// inclusive numa junta da mao, que se mexe — e continua escrevendo nele igual
// a antes. Uma vez por quadro, atualizar() olha todos os proxies acesos, ordena
// por `intensity * prioridade` e copia os N primeiros (posicao NO MUNDO, cor,
// distance, intensity) pras luzes reais.
//
// O que nao coube simplesmente nao acende. Isso e aceitavel de proposito: todo
// efeito daqui ja tem geometria emissiva/aditiva propria (halo, redemoinho,
// fogo de boca, clarao). A luz e o tempero, nao o desenho.
// ---------------------------------------------------------------------------

/**
 * Pesos sugeridos. Efeito CURTO e chamativo ganha das auras continuas: um
 * clarao de 0.06 s que nao acende some sem deixar rastro, enquanto uma aura
 * que fica meio segundo sem luz nem chega a ser percebida.
 */
export const PRIORIDADE = {
  ALTA: 3,      // clarao do tiro, abertura/travessia do portal
  MEDIA: 1.6,   // objeto levitado (aura + clarao de agarrar/arremessar/quebrar)
  BAIXA: 0.6,   // auras continuas: anel na mao, frasco da arma, zumbi
}

/**
 * @param {THREE.Scene} scene  as N luzes reais sao filhas dela e nunca saem
 * @param {number} n           quantas luzes reais existem de fato
 */
/**
 * @param {THREE.Scene} scene   as N luzes reais sao filhas dela e nunca saem
 * @param {number} n            quantas luzes reais existem de fato
 * @param {THREE.Camera} camera opcional, mas quase sempre queira passar: sem
 *   ela a disputa ignora ONDE a camera esta e as luzes vao parar em efeitos
 *   que nao iluminam pixel nenhum (ver relevancia() abaixo).
 */
export function criarPoolDeEfeito(scene, n = 2, camera = null) {
  const luzes = []
  for (let i = 0; i < n; i++) {
    // decay 2 (fisico, como o resto do jogo) e SEM sombra: uma PointLight com
    // sombra custa 6 passadas de render por quadro e derrubaria os 60 fps.
    const l = new THREE.PointLight(0xffffff, 0, 10, 2)
    l.castShadow = false
    l.name = 'luz-efeito-' + (i + 1)
    // zumbi.js e revolver.js pulam no raycast do tiro tudo que estiver marcado
    l.userData.semTiro = true
    scene.add(l)
    luzes.push(l)
  }

  const proxies = []
  const ativos = []              // reaproveitado por quadro: nada de lixo no laco
  const _p = new THREE.Vector3()
  const _c = new THREE.Vector3()

  // Ordenar so por intensidade x prioridade e insuficiente, e o modo como isso
  // falha e silencioso: uma PointLight com decaimento quadratico e alcance de
  // 3 m, a 60 m da camera, contribui EXATAMENTE ZERO pixel — e mesmo assim
  // ganhava a vaga de um efeito aceso a dois metros do jogador, so por ter
  // prioridade maior. Aconteceu de verdade: o brilho do revolver largado no
  // beco prendia metade do pool a partida inteira.
  //
  // A relevancia mede a distancia da camera ate a BORDA da esfera de luz (e
  // nao ate o centro): uma luz de raio grande continua valendo de longe, que e
  // o certo — ela pode estar iluminando a parede que eu estou vendo. Passando
  // da borda, cai rapido.
  const ALCANCE_MEIO = 12        // metros alem da borda onde a relevancia cai a 1/2
  function relevancia(p) {
    if (!camera) return 1
    camera.getWorldPosition(_c)
    p.getWorldPosition(_p)
    const d = _c.distanceTo(_p) - (p.distance > 0 ? p.distance : 0)
    if (d <= 0) return 1                       // a camera esta dentro do alcance
    const k = d / ALCANCE_MEIO
    return 1 / (1 + k * k)
  }

  /**
   * Pega uma "luz" emprestada. O que volta e um Object3D: quem chamou continua
   * fazendo add() no pai de sempre e escrevendo em position/intensity/color/
   * distance como se fosse a PointLight de antes.
   *
   * @param opcoes.cor        hex ou THREE.Color inicial
   * @param opcoes.intensidade intensidade inicial (0 = apagada)
   * @param opcoes.distancia  alcance da PointLight
   * @param opcoes.prioridade peso na disputa pelas N luzes reais (ver PRIORIDADE)
   * @param opcoes.nome       so pra achar no inspetor
   */
  function emprestar(opcoes) {
    const o = opcoes || {}
    const proxy = new THREE.Object3D()
    proxy.name = o.nome || 'luz-proxy'
    proxy.intensity = Number.isFinite(o.intensidade) ? o.intensidade : 0
    proxy.color = new THREE.Color(o.cor !== undefined ? o.cor : 0xffffff)
    proxy.distance = Number.isFinite(o.distancia) ? o.distancia : 10
    proxy.prioridade = Number.isFinite(o.prioridade) ? o.prioridade : PRIORIDADE.MEDIA
    proxy.peso = 0
    // castShadow existe no Object3D e nao faz nada aqui, mas quem mexer no
    // codigo antigo vai continuar escrevendo nele: melhor deixar coerente.
    proxy.castShadow = false
    proxy.userData.luzProxy = true
    proxy.userData.semTiro = true
    proxies.push(proxy)
    return proxy
  }

  /** Devolve o emprestimo (dispose dos modulos). Nao mexe nas luzes reais. */
  function devolver(proxy) {
    if (!proxy) return
    const i = proxies.indexOf(proxy)
    if (i >= 0) proxies.splice(i, 1)
    if (proxy.parent) proxy.parent.remove(proxy)
  }

  /** Uma vez por quadro, DEPOIS de todos os modulos escreverem nos proxies. */
  function atualizar() {
    ativos.length = 0
    for (let i = 0; i < proxies.length; i++) {
      const p = proxies[i]
      if (!(p.intensity > 0)) continue
      if (p.visible === false) continue
      p.peso = p.intensity * (p.prioridade > 0 ? p.prioridade : 1) * relevancia(p)
      if (p.peso <= 0) continue
      ativos.push(p)
    }
    // com 6 proxies a ordenacao e ruido; nao vale um heap
    ativos.sort((a, b) => b.peso - a.peso)

    const k = ativos.length < luzes.length ? ativos.length : luzes.length
    for (let i = 0; i < k; i++) {
      const p = ativos[i]
      const l = luzes[i]
      // O proxy pode estar pendurado numa junta da mao, que gira e anda com a
      // animacao. Por isso a posicao vem do MUNDO, e nao de p.position: as
      // luzes reais sao filhas da cena (matriz identidade), entao a posicao de
      // mundo e a posicao local delas.
      p.getWorldPosition(_p)
      l.position.copy(_p)
      l.color.copy(p.color)
      l.distance = p.distance
      l.intensity = p.intensity
    }
    // As que sobraram APAGAM, mas continuam na cena e visiveis (ver o
    // comentario da armadilha do recompile la em cima).
    for (let i = k; i < luzes.length; i++) luzes[i].intensity = 0
  }

  function dispose() {
    for (let i = 0; i < luzes.length; i++) {
      const l = luzes[i]
      if (l.parent) l.parent.remove(l)
      if (typeof l.dispose === 'function') l.dispose()
    }
    luzes.length = 0
    proxies.length = 0
    ativos.length = 0
  }

  return {
    emprestar,
    devolver,
    atualizar,
    dispose,
    get luzes() { return luzes },
    get emprestadas() { return proxies.length },
  }
}
