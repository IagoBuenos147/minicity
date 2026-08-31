import * as THREE from 'three'
import {
  solid, stdMat, box, cyl, tex, woodTex,
} from '../world/materials.js'
import { itemDe } from './catalogo.js'
import { ehCopo } from './copos.js'

// ---------------------------------------------------------------------------
// src/mobilia/bar.js — O BAR DA CASA: prateleira, balcao e a bancada que sobe.
//
// Tres pecas que so fazem sentido juntas, e o pedido do dono descreve as tres:
// "uma prateleira de parede onde caiba mais ou menos 5 garrafas", "um balcao
// mais a frente", e "uma bancada que sobe e fecha pra entrar nesse mini comodo
// de bar". Ou seja: garrafas atras, balcao na frente, e uma passagem que so
// existe quando voce levanta a tampa.
//
// A DECISAO QUE MANDA NO ARQUIVO: A PRATELEIRA NASCE VAZIA.
//
// "nao quero que voce coloque as garrafas la, eu quero que essa parte seja feita
// pelo player". Isso muda o que a peca E. Uma prateleira com garrafa modelada e
// CENARIO — desenho de um bar. Uma prateleira com cinco vagas vazias e um
// MOVEL COM ESTADO: ela pertence a quem a encheu, e a garrafa que esta la em
// cima e a mesma que saiu da mochila, comprada no mercado, com id e tudo.
//
// Por isso este modulo NAO conhece garrafa nenhuma de nome. Ele conhece VAGA:
//
//   por(id)   tira um do inventario e poe em pe na vaga
//   tirar()   devolve pro inventario e some da vaga
//
// e quem responde "que forma tem o item de id X" e o catalogo (`itemDe(id).build`),
// o mesmo que a mochila usa pra tirar a foto e que a mao usa pra segurar. E a
// mesma regra que fez o copo e a bebida conversarem sem se conhecerem: UM
// registro de ids pro jogo inteiro.
//
// O QUE ENTRA NA PRATELEIRA: qualquer item de MAO que nao seja copo. A prova de
// que a regra e essa e negativa — nao ha lista de garrafas em lugar nenhum aqui.
// Comprou gin na adega? Sobe. Achou uma lata? Sobe. Copo nao sobe porque copo
// tem mao propria (player/copo.js) e porque prateleira de bar guarda o que se
// SERVE, nao o que se serve EM.
//
// A BANCADA QUE SOBE e um alcapao horizontal: ela gira em torno do proprio
// eixo, na quina de dentro, e levanta 78 graus. O colisor dela some junto — e
// esse par (girou / passou a deixar passar) e o modulo inteiro, porque um balcao
// que abre visualmente e continua barrando e pior que um balcao que nao abre.
//
// Todas as medidas em METROS, X e Z de MUNDO, Y LOCAL do piso que recebe (o
// grupo devolvido nao sobe sozinho: quem monta e que sabe onde e o chao).
// ---------------------------------------------------------------------------

// --- materiais --------------------------------------------------------------

/** Tampo de balcao: madeira com marca de copo e verniz gasto no meio. */
function tampoTex() {
  return tex('bar-tampo', 256, (g, s) => {
    g.fillStyle = '#6b4526'
    g.fillRect(0, 0, s, s)
    // veio corrido no sentido do comprimento
    for (let i = 0; i < 520; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(40,24,12,' + (0.05 + Math.random() * 0.20) + ')'
      g.fillRect(0, y, s, 1 + Math.random() * 2)
    }
    // as juntas das tabuas do tampo
    for (let i = 1; i < 4; i++) {
      g.fillStyle = 'rgba(28,16,8,0.55)'
      g.fillRect(0, (i / 4) * s, s, 2)
    }
    // MARCAS DE COPO: aneis mais escuros, onde o verniz levantou. E o detalhe
    // que diz que este balcao ja serviu alguem — a peca nasce usada.
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * s, y = Math.random() * s
      const r = 7 + Math.random() * 5
      g.strokeStyle = 'rgba(30,18,8,' + (0.18 + Math.random() * 0.25) + ')'
      g.lineWidth = 1 + Math.random() * 1.5
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke()
    }
    // verniz gasto no meio (a faixa onde se apoia o cotovelo)
    const gr = g.createLinearGradient(0, s * 0.3, 0, s * 0.7)
    gr.addColorStop(0, 'rgba(210,180,140,0)')
    gr.addColorStop(0.5, 'rgba(210,180,140,0.14)')
    gr.addColorStop(1, 'rgba(210,180,140,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, s, s)
  })
}

const _tiles = new Map()
function tiled(base, rx, ry) {
  const k = base.uuid + ':' + rx + ':' + ry
  const achado = _tiles.get(k)
  if (achado) return achado
  const t = base.clone()
  t.needsUpdate = true
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(rx, ry)
  _tiles.set(k, t)
  return t
}

const M = {
  get tampo() { return stdMat('bar-tampo-mat', { map: tiled(tampoTex(), 3, 1), color: 0xa87c50, roughness: 0.52 }) },
  get corpo() { return stdMat('bar-corpo', { map: tiled(woodTex(2, '#4a3018'), 4, 1.6), color: 0x8a6440, roughness: 0.82 }) },
  get ripa() { return stdMat('bar-ripa', { map: tiled(woodTex(2, '#3d2614'), 1, 1), color: 0x7a5636, roughness: 0.88 }) },
  get prateleira() { return stdMat('bar-prat', { map: tiled(woodTex(2, '#5a3a20'), 3, 1), color: 0x9a7248, roughness: 0.74 }) },
  get ferro() { return solid(0x35383d, 0.68, 0.42) },
  get latao() { return solid(0xbe9a48, 0.44, 0.60) },
  // o realce da vaga apontada: um disco fino que so aparece na vaga da mira
  get alvo() { return stdMat('bar-alvo', { color: 0xffd98a, emissive: 0xffc46a, emissiveIntensity: 1.4, transparent: true, opacity: 0.55, roughness: 0.5, depthWrite: false }) },
}

// --- medidas ----------------------------------------------------------------
//
// Os defaults sao os da casa velha, mas nada aqui e cravado: quem chama passa a
// caixa e o modulo se ajusta. E de proposito — o dono ja tem duas casas.

const PADRAO = {
  // a parede em que a prateleira encosta (z), e o intervalo em X do bar
  zParede: 12.32,
  x0: 38.45, x1: 42.05,
  // a prateleira: encostada na parede, no trecho CEGO entre a janela e a porta
  pratX0: 40.35, pratX1: 41.95,
  pratY: 1.42, pratProf: 0.26,
  vagas: 5,
  // o balcao
  balcZ: 13.85, balcProf: 0.60, balcAlt: 1.05,
  // a bancada que sobe fica na ponta LESTE, do lado de quem entra
  bancadaL: 0.95,
}

/**
 * @param opts.medidas   sobrescreve PADRAO (parcial)
 * @param opts.game      pro inventario, o HUD e o catalogo
 * @param opts.zFundo    z da face interna da parede (fecha o cubiculo atras)
 */
export function criarBar(opts = {}) {
  const D = Object.assign({}, PADRAO, opts.medidas || {})
  const grupo = new THREE.Group()
  grupo.name = 'bar-da-casa'
  const colliders = []
  const interactables = []

  const zFundo = opts.zFundo !== undefined ? opts.zFundo : 12.30
  const balcZ0 = D.balcZ - D.balcProf / 2
  const balcZ1 = D.balcZ + D.balcProf / 2
  const xBancada0 = D.x1 - D.bancadaL

  // =========================================================================
  // 1. A PRATELEIRA
  // =========================================================================
  //
  // Tabua de 4 cm sobre dois mao-francesas de ferro, e um FILETE de 2 cm na
  // borda da frente. O filete nao e enfeite: e ele que diz que a garrafa nao vai
  // cair, e sem ele a tabua le como degrau.
  const pratG = new THREE.Group()
  const pratL = D.pratX1 - D.pratX0
  const pratCx = (D.pratX0 + D.pratX1) / 2
  const pratZ = zFundo + D.pratProf / 2 + 0.02

  const tabua = box(pratL, 0.04, D.pratProf, M.prateleira, pratCx, D.pratY, pratZ)
  tabua.castShadow = true
  tabua.receiveShadow = true
  pratG.add(tabua)
  // filete da frente
  pratG.add(box(pratL, 0.045, 0.018, M.prateleira, pratCx, D.pratY + 0.042, pratZ + D.pratProf / 2 - 0.01))
  // duas mao-francesas de ferro chato
  for (const s of [-1, 1]) {
    const mx = pratCx + s * (pratL / 2 - 0.16)
    const vert = box(0.03, 0.22, 0.05, M.ferro, mx, D.pratY - 0.13, zFundo + 0.04)
    pratG.add(vert)
    const horiz = box(0.03, 0.04, D.pratProf - 0.05, M.ferro, mx, D.pratY - 0.03, pratZ - 0.01)
    pratG.add(horiz)
    // a diagonal que faz a mao-francesa ser mao-francesa
    const diag = box(0.028, 0.30, 0.03, M.ferro, mx, D.pratY - 0.13, zFundo + 0.10)
    diag.rotation.x = -0.72
    pratG.add(diag)
  }
  grupo.add(pratG)

  // AS VAGAS. Espacadas iguais dentro da tabua, com uma folga nas pontas pra a
  // garrafa mais gorda do jogo (o garrafao tem 11 cm de raio) nao passar do
  // filete. Cinco, que e o numero que o dono pediu.
  const vagas = []
  const passo = pratL / D.vagas
  for (let i = 0; i < D.vagas; i++) {
    vagas.push({
      i,
      x: D.pratX0 + passo * (i + 0.5),
      y: D.pratY + 0.02,
      z: pratZ,
      id: null,       // o que esta na vaga
      obj: null,      // o modelo
    })
  }

  // O REALCE da vaga apontada: um anel fino no tampo da prateleira. So um, e ele
  // anda — cinco marcadores acesos ao mesmo tempo viram enfeite, um so vira mira.
  // AS GARRAFAS MORAM NUM GRUPO PROPRIO, MARCADO PRA NAO IR PRO FORNO.
  //
  // Isto NAO e arrumacao. O interior da casa passa por bakeStatic, e o forno
  // FUNDE os filhos e REMOVE a arvore antiga: `grupo` sai da cena e vira um
  // objeto solto. Uma garrafa posta na prateleira DEPOIS disso ia parar num
  // grupo que nao esta em lugar nenhum — a mochila perdia a garrafa e a
  // prateleira continuava vazia. Foi exatamente o que a primeira foto mostrou.
  //
  // `userData.noBake` faz o forno preservar esta subarvore e reparentea-la na
  // raiz mantendo a pose de mundo (ver world/bake.js), entao as coordenadas
  // locais das vagas continuam valendo. O resto do bar — balcao, prateleira,
  // ripado — e estatico e continua sendo fundido normalmente.
  const garrafas = new THREE.Group()
  garrafas.name = 'bar-garrafas'
  garrafas.userData.noBake = true
  grupo.add(garrafas)

  const realce = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.062, 18), M.alvo)
  realce.rotation.x = -Math.PI / 2
  realce.visible = false
  realce.castShadow = false
  garrafas.add(realce)

  // =========================================================================
  // 2. O BALCAO
  // =========================================================================
  //
  // Ele e partido em DOIS: o trecho fixo e a bancada que sobe. A junta entre os
  // dois cai em `xBancada0`, e a bancada e a ponta LESTE — o lado de quem entra
  // pela porta da rua. Quem chega ve a tampa antes de ver o resto do bar.

  /** O corpo do balcao (base ripada + tampo), de x0 a x1. */
  function corpoDeBalcao(g, x0, x1, comTampo) {
    const L = x1 - x0
    const cx = (x0 + x1) / 2
    if (L < 0.02) return
    // caixa da base
    const base = box(L, D.balcAlt - 0.06, D.balcProf, M.corpo, cx, (D.balcAlt - 0.06) / 2, D.balcZ)
    base.castShadow = true
    base.receiveShadow = true
    g.add(base)
    // RIPADO VERTICAL na face do cliente: e ele que separa "balcao de bar" de
    // "caixa de madeira". Uma InstancedMesh, porque sao muitas e sao iguais.
    const n = Math.max(2, Math.round(L / 0.14))
    const ripas = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.055, D.balcAlt - 0.20, 0.022), M.ripa, n,
    )
    const d0 = new THREE.Object3D()
    for (let i = 0; i < n; i++) {
      d0.position.set(x0 + (L * (i + 0.5)) / n, (D.balcAlt - 0.20) / 2 + 0.05, balcZ1 + 0.012)
      d0.updateMatrix()
      ripas.setMatrixAt(i, d0.matrix)
    }
    ripas.instanceMatrix.needsUpdate = true
    ripas.castShadow = false
    g.add(ripas)
    // rodape e friso de cima
    g.add(box(L, 0.06, D.balcProf + 0.03, M.ripa, cx, 0.03, D.balcZ))
    if (comTampo) {
      const t = box(L + 0.04, 0.06, D.balcProf + 0.10, M.tampo, cx, D.balcAlt - 0.03, D.balcZ)
      t.castShadow = true
      t.receiveShadow = true
      g.add(t)
    }
  }

  corpoDeBalcao(grupo, D.x0, xBancada0, true)

  // BARRA DE PE de latao, do lado do cliente. Bar sem barra de pe existe; bar
  // sem barra de pe que PARECA bar, nao.
  const barra = cyl(0.020, 0.020, xBancada0 - D.x0, M.latao, 10)
  barra.rotation.z = Math.PI / 2
  barra.position.set((D.x0 + xBancada0) / 2, 0.19, balcZ1 + 0.15)
  grupo.add(barra)
  for (const x of [D.x0 + 0.4, (D.x0 + xBancada0) / 2, xBancada0 - 0.4]) {
    grupo.add(box(0.05, 0.20, 0.05, M.ferro, x, 0.10, balcZ1 + 0.15))
  }

  // O FECHAMENTO DA PONTA LESTE.
  //
  // Sem ele o bar nao e um cubiculo: a faixa entre o balcao e a parede continua
  // aberta pelo lado da porta da rua, e o jogador entra por ali andando de lado
  // — o que faria a bancada que sobe existir de enfeite. Este painel e o que
  // torna a tampa o UNICO caminho.
  const fechaZ0 = zFundo, fechaZ1 = balcZ0
  const fecha = box(0.08, D.balcAlt, fechaZ1 - fechaZ0, M.corpo,
    D.x1 - 0.04, D.balcAlt / 2, (fechaZ0 + fechaZ1) / 2)
  fecha.castShadow = true
  grupo.add(fecha)
  grupo.add(box(0.12, 0.06, fechaZ1 - fechaZ0 + 0.04, M.tampo,
    D.x1 - 0.04, D.balcAlt - 0.03, (fechaZ0 + fechaZ1) / 2))

  // --- A BANCADA QUE SOBE ---------------------------------------------------
  //
  // O pivo fica na quina OESTE da tampa e no TOPO: ela gira pra cima como um
  // alcapao, e nao pra frente como uma porta. 78 graus e o angulo em que ela
  // para encostada na propria dobradica sem passar do ponto — mais que isso e
  // ela cai pro outro lado sozinha, o que uma tampa de balcao nao faz.
  const pivo = new THREE.Group()
  pivo.position.set(xBancada0, D.balcAlt - 0.06, D.balcZ)
  pivo.userData.noBake = true
  grupo.add(pivo)
  const tampa = box(D.bancadaL, 0.06, D.balcProf + 0.10, M.tampo,
    D.bancadaL / 2, 0.03, 0)
  tampa.castShadow = true
  tampa.receiveShadow = true
  pivo.add(tampa)
  // a alca de latao pra puxar
  const alca = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.010, 6, 14, Math.PI), M.latao)
  alca.rotation.set(Math.PI / 2, 0, 0)
  alca.position.set(D.bancadaL - 0.14, 0.06, 0)
  pivo.add(alca)
  // as duas dobradicas
  for (const dz of [-D.balcProf * 0.3, D.balcProf * 0.3]) {
    const gz = cyl(0.014, 0.014, 0.07, M.ferro, 8)
    gz.rotation.z = Math.PI / 2
    gz.position.set(0.03, 0.0, dz)
    pivo.add(gz)
  }
  // e o pedaco de base embaixo dela, que NAO sobe (so o tampo levanta)
  corpoDeBalcao(grupo, xBancada0, D.x1 - 0.08, false)

  // =========================================================================
  // 3. COLISORES
  // =========================================================================
  // O balcao inteiro barra; o VAO DA BANCADA e o unico que liga e desliga. Ele
  // vai pro mundo de colisao por fora (ver o comentario do `ativo` na porta da
  // casa velha): a grade COPIA o que recebe, entao mexer no objeto que a gente
  // empurrou nao mexeria em nada.
  colliders.push({
    minX: D.x0 - 0.02, maxX: xBancada0, minZ: balcZ0 - 0.06, maxZ: balcZ1 + 0.06,
    tag: 'bar-balcao',
  })
  colliders.push({
    minX: D.x1 - 0.10, maxX: D.x1, minZ: fechaZ0, maxZ: fechaZ1,
    tag: 'bar-fecha',
  })
  // O COLISOR DA BANCADA VAI DIRETO PRA GRADE, E A CAIXA DE VERDADE FICA AQUI.
  //
  // `collision.add()` COPIA o que recebe pra dentro da grade — mexer no objeto
  // que a gente passou nao mexeria em nada. Isto ja esta escrito na porta da
  // casa velha e ainda assim foi o primeiro bug deste arquivo: a tampa subia, o
  // `ativo` do MEU objeto virava false, e o jogador continuava esbarrando num
  // balcao aberto. `add()` devolve as caixas internas; e nelas que se manda.
  const colBancada = (opts.game && opts.game.collision)
    ? opts.game.collision.add({
      minX: xBancada0, maxX: D.x1 - 0.08, minZ: balcZ0 - 0.04, maxZ: balcZ1 + 0.04,
      tag: 'bar-bancada', ativo: true,
    })[0]
    : { ativo: true }

  // =========================================================================
  // 4. AS GARRAFAS: por e tirar
  // =========================================================================

  const cacheModelo = new Map()

  /** Monta (uma vez por id) o modelo que vai ficar em pe na prateleira. */
  function modeloDe(id) {
    const achado = cacheModelo.get(id)
    if (achado) return achado.clone(true)
    const ficha = itemDe(id)
    if (!ficha || typeof ficha.build !== 'function') return null
    let peca = null
    try { peca = ficha.build() } catch (err) { void err; return null }
    if (!peca) return null
    peca.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    cacheModelo.set(id, peca)
    return peca.clone(true)
  }

  /**
   * O QUE PODE SUBIR NA PRATELEIRA.
   *
   * Nao ha lista de garrafas aqui, e isso e o ponto: a regra e "item que se
   * segura na mao e nao e copo". Assim a garrafa comprada no mercado, a que veio
   * da adega e a que ainda nao existe entram todas sem este arquivo saber os
   * nomes delas. Movel (naCasa) fica de fora porque movel tem o encaixe dele, e
   * copo fica de fora porque prateleira de bar guarda o que se SERVE.
   */
  function podeSubir(id) {
    if (!id || ehCopo(id)) return false
    const f = itemDe(id)
    if (!f || f.naCasa || typeof f.build !== 'function') return false
    return !!f.mao
  }

  function porNaVaga(vaga, id) {
    if (vaga.id) return false
    const obj = modeloDe(id)
    if (!obj) return false
    obj.position.set(vaga.x, vaga.y, vaga.z)
    // giro proprio por vaga: cinco garrafas iguais alinhadas no mesmo angulo
    // lem como fileira de loja, e nao como prateleira de alguem
    obj.rotation.y = (vaga.i * 1.7) % (Math.PI * 2)
    garrafas.add(obj)
    vaga.id = id
    vaga.obj = obj
    return true
  }

  function tirarDaVaga(vaga) {
    if (!vaga.id) return null
    const id = vaga.id
    if (vaga.obj) {
      garrafas.remove(vaga.obj)
      vaga.obj.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose() })
    }
    vaga.id = null
    vaga.obj = null
    return id
  }

  // =========================================================================
  // 5. A MIRA: qual vaga o jogador esta olhando
  // =========================================================================
  //
  // Cinco pontos de interacao a 32 cm um do outro NAO funcionam: o sistema de
  // interacao escolhe pelo mais proximo do JOGADOR, e parado em frente a
  // prateleira o jogador esta praticamente a mesma distancia de todos. O que ele
  // aponta e outra coisa — e e a camera que sabe disso.
  //
  // Entao a prateleira tem UM ponto de interacao so, e quem escolhe a vaga e a
  // mira: a de menor angulo em relacao ao eixo da camera, dentro de um cone.
  const _olho = new THREE.Vector3()
  const _dir = new THREE.Vector3()
  const _v = new THREE.Vector3()
  let vagaNaMira = null

  function acharVaga(camera) {
    if (!camera) return null
    camera.getWorldPosition(_olho)
    camera.getWorldDirection(_dir)
    let melhor = null, melhorCos = 0.986      // ~9,5 graus de cone
    for (const v of vagas) {
      _v.set(v.x, v.y + 0.12, v.z).sub(_olho)
      const d = _v.length()
      if (d > 3.2) continue
      _v.divideScalar(d)
      const c = _v.dot(_dir)
      if (c > melhorCos) { melhorCos = c; melhor = v }
    }
    return melhor
  }

  // =========================================================================
  // 6. PONTOS DE INTERACAO
  // =========================================================================

  const pontoPrat = {
    id: 'bar-prateleira',
    position: new THREE.Vector3(pratCx, D.pratY + 0.2, pratZ + 0.9),
    radius: 2.2,
    label: 'Olhar a prateleira',
    onInteract: (gm) => {
      const v = vagaNaMira
      if (!v) {
        if (gm && gm.toast) gm.toast('Mire numa das vagas da prateleira.')
        return
      }
      const inv = gm && gm.inventario
      if (v.id) {
        // TIRAR: so sai da prateleira se houver pra onde ir
        if (inv && !inv.temEspacoPara(v.id, 1)) {
          if (gm.hud && gm.hud.negarMochila) gm.hud.negarMochila()
          if (gm.toast) gm.toast('A mochila esta cheia.')
          return
        }
        const id = tirarDaVaga(v)
        if (id && inv) inv.adicionar(id, 1)
        if (gm && gm.toast) {
          const f = itemDe(id)
          gm.toast('Voce pega ' + ((f && f.nome) || 'a garrafa') + '.')
        }
        return
      }
      // POR: primeiro o que esta na mao; senao, a primeira garrafa da mochila
      let id = gm && gm.mao && gm.mao.id
      if (!podeSubir(id)) id = null
      let vagaInv = -1
      if (inv) {
        for (let i = 0; i < inv.slots.length; i++) {
          const s = inv.slots[i]
          if (!s) continue
          if (id ? s.id === id : podeSubir(s.id)) { vagaInv = i; id = s.id; break }
        }
      }
      if (vagaInv < 0 || !id) {
        if (gm && gm.toast) gm.toast('Voce nao tem nenhuma garrafa na mochila.')
        return
      }
      if (!porNaVaga(v, id)) return
      if (inv) inv.retirar(vagaInv, 1)
      if (gm && gm.toast) {
        const f = itemDe(id)
        gm.toast(((f && f.nome) || 'A garrafa') + ' na prateleira.')
      }
    },
  }
  interactables.push(pontoPrat)

  const est = { bancada: 0, alvo: 0 }        // 0 baixada, 1 levantada
  const pontoBancada = {
    id: 'bar-bancada',
    position: new THREE.Vector3(
      xBancada0 + D.bancadaL / 2, D.balcAlt + 0.1, D.balcZ + D.balcProf / 2 + 0.35,
    ),
    radius: 1.9,
    label: 'Levantar a bancada',
    onInteract: () => {
      est.alvo = est.alvo > 0.5 ? 0 : 1
      pontoBancada.label = est.alvo > 0.5 ? 'Baixar a bancada' : 'Levantar a bancada'
    },
  }
  interactables.push(pontoBancada)
  // o gemeo de dentro do cubiculo, pra quem entrou poder sair
  interactables.push({
    id: 'bar-bancada-dentro',
    position: new THREE.Vector3(
      xBancada0 + D.bancadaL / 2, D.balcAlt + 0.1, D.balcZ - D.balcProf / 2 - 0.35,
    ),
    radius: 1.5,
    label: 'Levantar a bancada',
    onInteract: () => pontoBancada.onInteract(),
  })

  // =========================================================================
  // 7. O UPDATE
  // =========================================================================

  const ANG = 1.36     // 78 graus

  function update(dt, gm) {
    const d = Math.min(dt || 0, 0.1)
    // a tampa: mola simples, sem overshoot (tampa de balcao e pesada)
    if (est.bancada !== est.alvo) {
      const passo = d * 3.4
      est.bancada += Math.sign(est.alvo - est.bancada) * Math.min(passo, Math.abs(est.alvo - est.bancada))
    }
    pivo.rotation.x = -est.bancada * ANG
    colBancada.ativo = est.bancada < 0.45

    // a mira da prateleira. So com o jogador perto: e um dot por vaga, mas nao
    // ha por que pagar isso do outro lado da cidade.
    const p = gm && gm.player && gm.player.position
    let perto = false
    if (p) {
      const dx = p.x - pratCx, dz = p.z - pratZ
      perto = dx * dx + dz * dz < 16
    }
    vagaNaMira = perto ? acharVaga(gm && gm.camera) : null
    if (vagaNaMira) {
      realce.visible = true
      realce.position.set(vagaNaMira.x, vagaNaMira.y + 0.026, vagaNaMira.z)
      pontoPrat.label = vagaNaMira.id
        ? ('Pegar ' + ((itemDe(vagaNaMira.id) || {}).nome || 'a garrafa'))
        : 'Por uma garrafa'
    } else {
      realce.visible = false
      pontoPrat.label = 'Olhar a prateleira'
    }
  }

  return {
    grupo, colliders, interactables, update,
    /** Ja registrado na grade por criarBar (ver o comentario). So pro teste. */
    colisorBancada: colBancada,
    /** Pro save: o que esta em cada vaga, da esquerda pra direita. */
    estado() { return vagas.map((v) => v.id) },
    aplicar(lista) {
      if (!Array.isArray(lista)) return
      for (let i = 0; i < vagas.length; i++) {
        tirarDaVaga(vagas[i])
        const id = lista[i]
        if (typeof id === 'string' && podeSubir(id)) porNaVaga(vagas[i], id)
      }
    },
    /** Pro teste. */
    get vagas() { return vagas.map((v) => v.id) },
    get bancadaAberta() { return est.bancada > 0.9 },
    abrirBancada(v) { est.alvo = v === false ? 0 : 1 },
    mirarVaga(i) { vagaNaMira = vagas[i] || null; return vagaNaMira },
  }
}

export default criarBar
