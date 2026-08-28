import * as THREE from 'three'
import { criarMontagem } from '../veiculos/helicoptero.js'
import { HELI_MONTAGEM } from '../comum/mundo.js'
import { PLAYER } from '../config.js'
import { ANEL as ANEL_MUNDO, TICK_HZ, AGARRAVEL_POR_ID, TIPOS_AGARRAVEL } from '../comum/mundo.js'
import {
  criarFeixe, criarContorno, criarClarao, criarAnelDeChoque,
  criarQuebra, criarRastro, criarOrbita, COR_VERDE,
} from './efeitos.js'
import { PRIORIDADE } from '../render/luzes-efeito.js'

// ---------------------------------------------------------------------------
// O ANEL VERDE (telecinese).
//
// A unica coisa que este arquivo NAO faz e decidir. Quem decide e o servidor:
//
//   agarrar   -> rede.pegar(id)          e ESPERA o evento obj-dono com o meu id
//   recolocar -> rede.soltar(id,x,y,z)   e ESPERA o obj-dono livre COM a posicao
//   arremessar-> rede.arremessar(...)    e a partir dai simulo o voo aqui
//   colidiu   -> rede.destruiu(id,x,y,z) e o obj-destruido que volta e ignorado
//                se eu ja quebrei (idempotencia obrigatoria do contrato)
//
// Tudo que e feixe, particula, clarao e luz e 100% LOCAL. Pela rede viaja so o
// evento. Cada maquina desenha sozinha.
//
// Nada aqui e identificado por indice de array nem por referencia de objeto:
// o registro de objetos e um Map por ID, e quem recebe um id que nao conhece
// simplesmente ignora (o contrato manda "aceite nao achar").
// ---------------------------------------------------------------------------

// --- numeros do poder --------------------------------------------------------
const ALCANCE = 14          // metros: o contrato pede ~14 m pra mira
const DIST_SEGURA = 2.6     // metros a frente do jogador onde o objeto flutua
const FORCA = 21            // m/s do arremesso
const GRAVIDADE = PLAYER.GRAVITY
const TEMPO_VOO_MAX = 5     // segundos: se nao bateu em nada, some assim mesmo
const TEMPO_PEDIDO = 2.0    // segundos esperando o servidor confirmar o pegar
const TEMPO_SOLTAR = 2.5    // segundos esperando o servidor dizer onde assentou
const GRACA_VOO = 0.06      // segundos sem testar colisao logo apos o arremesso
const ALTURA_COLISOR = 2.6  // acima disso os colisores XZ nao valem (ver atualizarVoo)
const PERIODO_OBJ_POS = 1 / TICK_HZ

const _co = new THREE.Vector3()   // origem da camera
const _cd = new THREE.Vector3()   // direcao da camera
const _lat = new THREE.Vector3()
const _up = new THREE.Vector3()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _alvo = new THREE.Vector3()
const _ant = new THREE.Vector3()
const _origem = new THREE.Vector3()

/**
 * @param {object} dep
 * @param dep.scene, dep.camera, dep.player, dep.character, dep.collision
 * @param dep.rede    cliente de rede (ver SUPOSICOES no fim do arquivo)
 * @param dep.hud     opcional, so pra toast
 * @param dep.groundY opcional, (x,z)->altura do chao; sem ele o chao e y=0
 * @param dep.interaction opcional, pra desligar o "Pegar o anel" ao equipar
 * @param dep.poolLuz opcional, pool de luzes de efeito (ver secao 2)
 */
export function criarAnel({ scene, camera, player, character, collision, rede, hud,
  groundY, interaction, poolLuz }) {

  const chaoEm = typeof groundY === 'function' ? groundY : () => 0
  // Sem rede (rodando o single player de sempre) o modulo continua jogavel: ele
  // finge o servidor pra si mesmo. Com rede, NUNCA decide nada sozinho.
  // Decidido A CADA ACAO, nao uma vez so na criacao: o jogo abre antes de
  // conectar, pode nunca conectar (jogando sozinho) e pode perder a conexao no
  // meio. Com o valor congelado, quem estivesse sem servidor pedia pra agarrar
  // e ficava esperando pra sempre uma confirmacao que nao vinha.
  const ehLocal = () => !rede || typeof rede.pegar !== 'function' || !rede.conectado

  // =========================================================================
  // 1. O ANEL — no chao da barbearia e no dedo
  // =========================================================================

  const matAro = new THREE.MeshStandardMaterial({
    color: 0x0a2b19, emissive: COR_VERDE, emissiveIntensity: 2.4,
    roughness: 0.32, metalness: 0.35,
  })
  // fog:false em tudo que e aditivo: a neblina da cena SOMA a cor do ceu no
  // aditivo e transformaria o halo verde num borrao azulado a 20 m.
  const matHalo = new THREE.MeshBasicMaterial({
    color: COR_VERDE, transparent: true, opacity: 0.42,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const matDisco = new THREE.MeshBasicMaterial({
    color: COR_VERDE, transparent: true, opacity: 0.3,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })

  // --- anel do chao ---------------------------------------------------------
  const grupoNoChao = new THREE.Group()
  grupoNoChao.position.set(ANEL_MUNDO.x, ANEL_MUNDO.y, ANEL_MUNDO.z)
  grupoNoChao.name = 'anel-verde'

  const pivoChao = new THREE.Group()          // gira; o grupo pai fica parado
  pivoChao.position.y = 0.44
  grupoNoChao.add(pivoChao)

  const geoAro = new THREE.TorusGeometry(0.26, 0.052, 10, 30)
  const aroChao = new THREE.Mesh(geoAro, matAro)
  aroChao.castShadow = false                  // o objeto e luz; sombra dele so suja
  aroChao.receiveShadow = false
  aroChao.rotation.x = 0.32                   // tombado: le-se como anel, nao como aro
  pivoChao.add(aroChao)

  const geoHalo = new THREE.TorusGeometry(0.285, 0.105, 8, 26)
  const haloChao = new THREE.Mesh(geoHalo, matHalo)
  haloChao.rotation.x = 0.32
  haloChao.renderOrder = 2
  pivoChao.add(haloChao)

  // mancha de luz no piso: e o que faz o anel "pousar" em vez de flutuar solto
  const geoDisco = new THREE.CircleGeometry(0.85, 26)
  const disco = new THREE.Mesh(geoDisco, matDisco)
  disco.rotation.x = -Math.PI / 2
  disco.position.y = 0.012
  disco.renderOrder = 1
  grupoNoChao.add(disco)

  // --- anel do dedo ---------------------------------------------------------
  // Fica preso em character.parts.handR. A mao e uma junta no PULSO com o mesh
  // descendo em -Y, entao o dedo esta por volta de y = -0.075 no espaco local.
  const geoAroMao = new THREE.TorusGeometry(0.028, 0.0085, 8, 18)
  const aroMao = new THREE.Mesh(geoAroMao, matAro)
  aroMao.rotation.x = Math.PI / 2              // eixo do anel ao longo do dedo (-Y)
  aroMao.position.set(0.006, -0.074, 0.004)
  aroMao.castShadow = false
  aroMao.receiveShadow = false

  const geoHaloMao = new THREE.TorusGeometry(0.033, 0.020, 6, 14)
  const haloMao = new THREE.Mesh(geoHaloMao, matHalo.clone())
  haloMao.material.opacity = 0.5
  haloMao.rotation.x = Math.PI / 2
  haloMao.position.copy(aroMao.position)
  haloMao.renderOrder = 2

  // =========================================================================
  // 2. LUZES — duas "luzes", emprestadas do pool compartilhado da cena
  // =========================================================================
  // luzAnel acompanha o anel (chao ou dedo). luzObjeto vive no objeto levitado
  // e e a MESMA luz reaproveitada pros claroes de agarrar/arremessar/quebrar —
  // por isso nao existe uma terceira.
  //
  // As duas vem de src/render/luzes-efeito.js: nao sao PointLight, sao PROXIES.
  // O motivo esta la, mas o resumo e: o custo de uma luz no three e ESTAR na
  // cena, nao acender, e mudar a quantidade de luzes visiveis obriga o renderer
  // a recompilar todos os materiais (engasgo de varios quadros a cada
  // agarrar/soltar). Com o pool, a contagem de luzes da cena e constante e
  // estes dois efeitos disputam as luzes reais com os outros.
  //
  // Sem pool (modulo usado solto, num teste), cai de volta pra PointLight de
  // sempre — sem sombra, que uma PointLight com sombra custa 6 passadas.
  function novaLuz(cor, intensidade, distancia, prioridade, nome) {
    if (poolLuz && typeof poolLuz.emprestar === 'function') {
      return poolLuz.emprestar({ cor, intensidade, distancia, prioridade, nome })
    }
    const l = new THREE.PointLight(cor, intensidade, distancia, 2)
    l.castShadow = false
    l.name = nome
    return l
  }

  // Prioridade BAIXA: e uma aura continua e o aro ja tem emissivo proprio.
  const luzAnel = novaLuz(COR_VERDE, 3.2, 8, PRIORIDADE.BAIXA, 'luz-anel')
  luzAnel.position.set(ANEL_MUNDO.x, ANEL_MUNDO.y + 0.44, ANEL_MUNDO.z)
  scene.add(luzAnel)

  // Prioridade MEDIA: metade do tempo e aura, metade e clarao curto de evento.
  // Nunca escondemos nenhuma das duas com .visible — apagar e intensity = 0.
  const luzObjeto = novaLuz(COR_VERDE, 0, 11, PRIORIDADE.MEDIA, 'luz-objeto')
  scene.add(luzObjeto)
  let luzObjAlvo = 0        // intensidade que a luz persegue
  let luzObjPico = 0        // pico somado por cima (clarao) que decai sozinho

  // =========================================================================
  // 3. EFEITOS
  // =========================================================================
  const feixe = criarFeixe(scene)
  const contornoMira = criarContorno(scene, COR_VERDE, 2)
  const contornoObj = criarContorno(scene, 0x8fffc4, 3)
  const clarao = criarClarao(scene, camera)
  const choque = criarAnelDeChoque(scene, COR_VERDE)
  const quebra = criarQuebra(scene)
  const rastro = criarRastro(scene, 34)
  const orbitaChao = criarOrbita(scene, 10, 0.16)
  const orbitaObj = criarOrbita(scene, 14, 0.2)

  // =========================================================================
  // 4. ESTADO
  // =========================================================================
  const objetos = new Map()      // id -> registro
  const donos = new Map()        // id -> donoId do servidor (0 = livre)
  const destruidos = new Set()   // ids ja quebrados aqui: o evento repetido nao repete o efeito

  let equipado = false
  let tempo = 0
  let alvoId = 0                 // id sob a mira (0 = nenhum)

  // --- montagem do helicoptero ---------------------------------------------
  // Com o anel na mao e NADA agarrado, segurar o botao direito monta um
  // helicoptero no ponto mirado. E de proposito que demora: o pedido era
  // "algo que requer um pouco de tempo e segurando o anel para criar".
  let montagem = null            // { obj, x, y, z, yaw, t }
  let segurandoDireito = false
  let seguroId = 0               // id na mao (0 = nenhum)
  let pedidoId = 0               // id pedido ao servidor, aguardando resposta
  let pedidoT = 0
  let soltandoId = 0             // id ja solicitado pra soltar, aguardando a posicao final
  let soltandoT = 0
  let voo = null                 // { id, vel, t } enquanto o objeto esta no ar
  let assentando = null          // { id, de, para, rx, rz, t, dur }
  let brilhoMira = 0             // opacidade do contorno da mira (sobe/desce suave)
  let brilhoObj = 0
  let saltoY = 0, saltoV = 0     // o "salta pra cima" do agarrar
  let acumObjPos = 0
  let conectadoAntes = false     // pra ver a conexao CAIR, nao so estar caida
  const ultimoDestino = new THREE.Vector3()   // ponta do feixe do ultimo quadro com objeto
  const TAU = Math.PI * 2

  // Tranco de camera: DOIS radianos pra somar na rotacao da camera.
  // Escolha documentada: expomos anel.tremor = {x,y} (yaw, pitch em radianos)
  // pro main somar DEPOIS de player.update(dt). Se o controller um dia ganhar
  // player.tremer(f), tambem chamamos — mas nao dependemos disso.
  const tremor = { x: 0, y: 0 }
  let tremorF = 0

  function tremerImpulso(f) {
    tremorF = Math.min(1.3, tremorF + f)
    if (player && typeof player.tremer === 'function') player.tremer(f)
  }

  function avisar(msg) { if (hud && typeof hud.toast === 'function') hud.toast(msg) }

  /** O ultimo obj-dono que chegou ainda me da como dono deste objeto? */
  function souDonoConhecido(id) {
    const d = donos.get(id | 0) || 0
    if (ehLocal()) return d === -1
    const eu = meuId()
    return !!eu && d === eu
  }

  function meuId() {
    if (!rede) return 0
    return (typeof rede.meuId === 'function' ? rede.meuId() : rede.meuId) || 0
  }

  // =========================================================================
  // 5. REGISTRO DE OBJETOS
  // =========================================================================
  const _cx = new THREE.Box3()
  const _tam = new THREE.Vector3()

  /**
   * O mundo avisa quais meshes sao agarraveis. Guardamos por ID; a referencia
   * do mesh existe SO aqui dentro e nunca atravessa a rede.
   */
  function registrarObjeto(id, mesh) {
    id = id | 0
    if (!id || !mesh) return
    let principal = null
    if (mesh.isMesh && mesh.geometry) principal = mesh
    else mesh.traverse((o) => { if (!principal && o.isMesh && o.geometry) principal = o })

    _cx.setFromObject(mesh)
    _cx.getSize(_tam)
    const info = AGARRAVEL_POR_ID[id]
    const tipo = info && TIPOS_AGARRAVEL[info.tipo]
    let cor = tipo ? tipo.cor : 0x9a7d5a
    if (principal && principal.material && principal.material.color) {
      cor = principal.material.color.getHex()
    }

    mesh.userData.anelObjId = id      // usado pra voltar do raycast ao ID
    objetos.set(id, {
      id,
      obj: mesh,
      principal,
      cor,
      raio: Math.max(0.12, Math.max(_tam.x, _tam.z) * 0.5),
      meiaAltura: Math.max(0.08, _tam.y * 0.5),
      tamanho: Math.max(0.2, Math.max(_tam.x, _tam.y, _tam.z)),
    })
    if (!donos.has(id)) donos.set(id, 0)
  }

  function objetoDe(id) {
    const r = objetos.get(id | 0)
    return r ? r.obj : null
  }

  let ultimoControlado = 0
  function marcarControle(id, v) {
    if (!id) return
    const r = objetos.get(id)
    if (r) r.obj.userData.anelControla = v
  }

  /** True enquanto a posicao deste objeto for desenhada por este modulo. */
  function controlaLocalmente(id) {
    id = id | 0
    return !!id && (id === seguroId
      || (voo && voo.id === id)
      || (assentando && assentando.id === id))
  }

  // =========================================================================
  // 6. MIRA
  // =========================================================================
  const raio = new THREE.Raycaster()
  raio.far = ALCANCE
  const candidatos = []
  const acertos = []            // reaproveitado: intersectObjects aceita destino

  function idDoAtingido(o) {
    while (o) {
      if (o.userData && o.userData.anelObjId) return o.userData.anelObjId
      o = o.parent
    }
    return 0
  }

  // --- montagem do helicoptero ---------------------------------------------

  const _mp = new THREE.Vector3()
  const _md = new THREE.Vector3()

  /** Ponto de chao a uns 7 m na frente de quem esta mirando. */
  function pontoDeMontagem(out) {
    camera.getWorldPosition(_mp)
    camera.getWorldDirection(_md)
    _md.y = 0
    if (_md.lengthSq() < 1e-6) _md.set(0, 0, -1)
    _md.normalize()
    out.x = _mp.x + _md.x * 7
    out.z = _mp.z + _md.z * 7
    out.y = chaoEm(out.x, out.z)
    // pra onde o bicho vai olhar: a mesma direcao de quem montou
    out.yaw = Math.atan2(_md.x, _md.z)
    return out
  }

  const _alvoMont = { x: 0, y: 0, z: 0, yaw: 0 }

  function comecarMontagem() {
    if (montagem || seguroId || voo) return
    pontoDeMontagem(_alvoMont)
    // chao ocupado nao serve: o helicoptero nasceria dentro de uma parede
    if (collision && typeof collision.isFree === 'function' &&
        !collision.isFree(_alvoMont.x, _alvoMont.z, 3.2)) {
      if (hud && hud.toast) hud.toast('Sem espaco aqui pro helicoptero.')
      return
    }
    let obj = null
    try {
      obj = criarMontagem(scene, _alvoMont.x, _alvoMont.y, _alvoMont.z, _alvoMont.yaw)
    } catch (err) { console.warn('montagem do helicoptero falhou:', err); return }
    if (!obj) return
    montagem = { obj, x: _alvoMont.x, y: _alvoMont.y, z: _alvoMont.z, yaw: _alvoMont.yaw, t: 0 }
    if (hud && hud.toast) hud.toast('Segure para montar o helicoptero...')
  }

  function cancelarMontagem() {
    if (!montagem) return
    try { montagem.obj.cancelar() } catch (err) { void err }
    montagem = null
  }

  function atualizarMontagem(dt) {
    if (!montagem) return
    // soltou o botao, largou o anel ou pegou algo: cancela
    if (!segurandoDireito || !equipado || seguroId) { cancelarMontagem(); return }
    montagem.t += dt
    const p = Math.min(1, montagem.t / HELI_MONTAGEM)
    try { montagem.obj.atualizar(dt, p) } catch (err) { void err }
    if (p < 1) return

    // pronto: entrega o grupo montado pro sistema de veiculos
    let pronto = null
    try { pronto = montagem.obj.concluir() } catch (err) { void err }
    const m = montagem
    montagem = null
    segurandoDireito = false
    const sis = jogoVeiculos()
    if (sis && typeof sis.criarHelicoptero === 'function') {
      sis.criarHelicoptero(m.x, m.y, m.z, pronto, m.yaw)
    } else if (pronto && pronto.parent !== scene) {
      // sem sistema de veiculos, ao menos deixa o helicoptero na cena
      scene.add(pronto)
    }
    if (hud && hud.toast) hud.toast('Helicoptero pronto. Aperte E para entrar.')
    tremerImpulso(0.9)
  }

  /** O sistema de veiculos e opcional: o anel nao pode depender dele. */
  function jogoVeiculos() {
    const g = (typeof window !== 'undefined' && window.__game) || null
    return g && g.veiculos ? g.veiculos : null
  }

  function atualizarMira() {
    if (!equipado || seguroId || voo || pedidoId) { alvoId = 0; return }
    camera.getWorldPosition(_co)
    camera.getWorldDirection(_cd)

    // Pre-filtro barato: distancia e cone grosseiro. So o que sobra vai pro
    // raycast. Com 28 agarraveis no mundo isso deixa a mira em ~2 ou 3 testes.
    candidatos.length = 0
    for (const r of objetos.values()) {
      if (destruidos.has(r.id)) continue
      if ((donos.get(r.id) || 0) !== 0) continue     // com dono: nao e alvo de ninguem
      if (!r.obj.visible) continue
      r.obj.getWorldPosition(_a)
      _b.subVectors(_a, _co)
      const d2 = _b.lengthSq()
      if (d2 > ALCANCE * ALCANCE || d2 < 1e-6) continue
      if (_b.normalize().dot(_cd) < 0.6) continue
      candidatos.push(r.obj)
    }
    if (!candidatos.length) { alvoId = 0; return }

    raio.set(_co, _cd)
    acertos.length = 0
    raio.intersectObjects(candidatos, true, acertos)
    if (!acertos.length) { alvoId = 0; return }

    const h = acertos[0]
    // Parede no meio do caminho invalida a mira: segmentHit devolve a fracao do
    // segmento ate o primeiro occluder (1 = livre).
    _a.copy(_co).addScaledVector(_cd, h.distance)
    if (collision && typeof collision.segmentHit === 'function') {
      const f = collision.segmentHit(_co, _a, 0)
      if (f < 0.995) { alvoId = 0; return }
    }
    alvoId = idDoAtingido(h.object)
  }

  // =========================================================================
  // 7. ORIGEM DO FEIXE
  // =========================================================================
  function origemDoFeixe(out) {
    if (player && player.mode === 'first') {
      // Em 1a pessoa a mao fica abaixo do enquadramento e o feixe nasceria fora
      // da tela. Entao ele sai de um ponto preso a camera, na altura da mao.
      camera.getWorldPosition(out)
      _cd.set(0, 0, -1).applyQuaternion(camera.quaternion)
      _lat.set(1, 0, 0).applyQuaternion(camera.quaternion)
      _up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      out.addScaledVector(_cd, 0.45).addScaledVector(_lat, 0.27).addScaledVector(_up, -0.22)
      return out
    }
    if (aroMao.parent) return aroMao.getWorldPosition(out)
    if (player && player.position) return out.copy(player.position).setY(player.position.y + 1.1)
    return camera.getWorldPosition(out)
  }

  // =========================================================================
  // 8. EQUIPAR
  // =========================================================================
  function equipar() {
    if (equipado) return
    equipado = true
    grupoNoChao.visible = false
    const mao = character && character.parts && character.parts.handR
    if (mao) { mao.add(aroMao); mao.add(haloMao) }
    else scene.add(aroMao)                    // sem mao: pelo menos existe
    if (interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('anel-verde', false)
    }
    luzAnel.intensity = 1.1
    luzAnel.distance = 6
    avisar('Anel equipado. Botao esquerdo agarra, direito recoloca.')
  }

  // Depois de PEGO, o item nunca mais volta pro chao. Sem esta trava,
  // apertar 1 (Maos) chamava desequipar(), que revelava a copia do mundo e
  // religava o "Pegar": o jogador via o item reaparecer no lugar de onde o
  // tinha tirado, e podia "pegar" de novo o que ja estava na barra dele.
  let pego = false
  function desequipar() {
    if (!equipado) return
    if (seguroId) recolocar()
    equipado = false
    if (aroMao.parent) aroMao.parent.remove(aroMao)
    if (haloMao.parent) haloMao.parent.remove(haloMao)
    // so reaparece no chao se nunca tiver sido pego (ver a trava `pego`)
    grupoNoChao.visible = !pego
    if (!pego && interaction && typeof interaction.setEnabled === 'function') {
      interaction.setEnabled('anel-verde', true)
    }
    luzAnel.distance = 8
    alvoId = 0
    feixe.desligar()
  }

  const interactable = {
    id: 'anel-verde',
    position: new THREE.Vector3(ANEL_MUNDO.x, ANEL_MUNDO.y + 0.44, ANEL_MUNDO.z),
    radius: 2.1,
    label: 'Pegar o anel',
    onInteract(game) {
      pego = true
      equipar()
      // o sistema de interacao copia os campos, entao desligar so vale por id
      const it = (game && game.interaction) || interaction
      if (it && typeof it.setEnabled === 'function') it.setEnabled('anel-verde', false)
    },
  }

  // =========================================================================
  // 9. PEDIDOS AO SERVIDOR
  // =========================================================================
  function pedirPegar() {
    if (!equipado || seguroId || pedidoId || voo) return
    if (!alvoId) return
    if (destruidos.has(alvoId)) return
    if ((donos.get(alvoId) || 0) !== 0) { avisar('Esse objeto ja esta com outra pessoa.'); return }
    pedidoId = alvoId
    pedidoT = 0
    if (ehLocal()) {
      // fallback de desenvolvimento: sem servidor, respondo a mim mesmo no
      // proximo quadro pelo MESMO caminho do evento de rede
      const id = pedidoId
      Promise.resolve().then(() => aoEventoDeRede({ tipo: 'obj-dono', objId: id, donoId: -1 }))
      return
    }
    rede.pegar(pedidoId)
  }

  function recolocar() {
    if (!seguroId) return
    const r = objetos.get(seguroId)
    if (!r) { seguroId = 0; return }
    const p = r.obj.position
    const id = seguroId
    seguroId = 0
    soltandoId = id
    soltandoT = 0
    feixe.desligar()
    if (ehLocal()) {
      const y = chaoEm(p.x, p.z) + r.meiaAltura
      const px = p.x, pz = p.z
      Promise.resolve().then(() => aoEventoDeRede(
        { tipo: 'obj-dono', objId: id, donoId: 0, x: px, y, z: pz }))
      return
    }
    // O servidor decide ONDE assenta. Mandamos so onde gostariamos.
    rede.soltar(id, p.x, p.y, p.z)
  }

  const _dirTiro = new THREE.Vector3()

  function arremessar() {
    if (!seguroId) return
    const r = objetos.get(seguroId)
    if (!r) { seguroId = 0; return }
    // vetor proprio: origemDoFeixe() mexe em _cd/_lat/_up mais abaixo
    camera.getWorldDirection(_dirTiro)
    const p = r.obj.position
    const id = seguroId
    seguroId = 0

    // assinatura de src/rede/cliente-rede.js: (objId, pos, dir, forca)
    if (!ehLocal() && typeof rede.arremessar === 'function') {
      rede.arremessar(id,
        { x: p.x, y: p.y, z: p.z },
        { x: _dirTiro.x, y: _dirTiro.y, z: _dirTiro.z },
        FORCA)
    }

    // A MINHA maquina simula o voo. Quem joga e quem sabe onde bateu.
    voo = { id, vel: _dirTiro.clone().multiplyScalar(FORCA), t: 0 }
    rastro.limpar()
    rastro.marcar(p)

    feixe.dispararEstalo()
    feixe.desligar()
    origemDoFeixe(_origem)
    choque.disparar(_origem, _dirTiro)
    clarao.disparar(_origem, 1.5, 0.26)
    luzObjPico = Math.max(luzObjPico, 9)
    luzObjeto.position.copy(_origem)
    tremerImpulso(0.85)
  }

  function quebrarLocal(id, x, y, z) {
    if (destruidos.has(id)) return          // idempotente: o contrato exige
    destruidos.add(id)
    const r = objetos.get(id)
    // Sem coordenada no evento (pacote curto de uma versao velha) a quebra
    // aconteceria na origem do mundo. Melhor quebrar onde o objeto esta.
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) _a.set(x, y, z)
    else if (r) r.obj.getWorldPosition(_a)
    else _a.set(0, 0, 0)
    x = _a.x; y = _a.y; z = _a.z
    if (r) {
      r.obj.visible = false
      quebra.disparar(_a, r.cor, r.tamanho, chaoEm(x, z))
    } else {
      quebra.disparar(_a, 0x9a7d5a, 0.6, chaoEm(x, z))
    }
    clarao.disparar(_a, 2.6, 0.34)
    luzObjeto.position.copy(_a)
    luzObjPico = Math.max(luzObjPico, 14)
    donos.set(id, 0)
    if (seguroId === id) { seguroId = 0; feixe.desligar() }
    if (pedidoId === id) pedidoId = 0
    if (soltandoId === id) soltandoId = 0
    if (assentando && assentando.id === id) assentando = null
    if (voo && voo.id === id) voo = null
  }

  // =========================================================================
  // 10. EVENTOS DE REDE
  // =========================================================================
  /**
   * Aceita obj-dono, obj-destruido e (de brinde) negado. O nome do tipo e
   * normalizado porque nao vale a pena quebrar por causa de um hifen: quem
   * escreve o cliente de rede pode mandar 'obj-dono', 'obj_dono' ou 'objDono'.
   * Id desconhecido e ignorado sem reclamar, como manda o contrato.
   */
  function aoEventoDeRede(ev) {
    if (!ev) return
    const tipo = String(ev.tipo || ev.t || ev.nome || '').toLowerCase().replace(/[^a-z]/g, '')
    const id = (ev.objId !== undefined ? ev.objId : (ev.id !== undefined ? ev.id : 0)) | 0
    if (!id) return

    if (tipo === 'objdestruido') {
      const x = Number.isFinite(ev.x) ? ev.x : 0
      const y = Number.isFinite(ev.y) ? ev.y : 0
      const z = Number.isFinite(ev.z) ? ev.z : 0
      quebrarLocal(id, x, y, z)
      return
    }

    if (tipo === 'negado') {
      // NEGADO tambem serve pra NPC ocupado (oque=1); so o 2 e objeto
      if (ev.oque !== undefined && (ev.oque | 0) !== 2) return
      if (pedidoId === id) { pedidoId = 0; avisar('Esse objeto ja esta com outra pessoa.') }
      // Negar o SOLTAR ou o ARREMESSO quer dizer "continua na sua mao". O
      // estado local tem que VOLTAR ao que era: sem objeto fantasma caindo
      // sozinho e sem feixe apagado com o objeto ainda preso.
      // So restauro se o ultimo obj-dono AINDA me da como dono: se o servidor
      // ja tinha me tirado o objeto, este NEGADO e de outra coisa e agarrar
      // aqui seria decidir sozinho — exatamente o que o contrato proibe.
      else if (souDonoConhecido(id)
        && (soltandoId === id || (voo && voo.id === id)
          || (assentando && assentando.id === id))) {
        const r = objetos.get(id)
        if (r && !destruidos.has(id)) retomarPosse(r)
      }
      return
    }

    if (tipo !== 'objdono') return
    if (destruidos.has(id)) return

    let dono = ev.donoId !== undefined ? ev.donoId : (ev.dono !== undefined ? ev.dono : 0)
    dono = dono | 0
    // estado do contrato: 0 repouso, 1 seguro, 2 voando, 3 destruido.
    // Vem no OBJ_DONO estendido; sem ele fica -1 e ninguem depende disso.
    const estado = Number.isFinite(ev.estado) ? (ev.estado | 0) : -1
    // no fallback sem servidor o "meu id" e -1, combinado la em pedirPegar
    const sou = ehLocal() ? (dono === -1) : (dono !== 0 && dono === meuId())
    donos.set(id, sou ? (ehLocal() ? -1 : dono) : dono)

    if (sou) {
      if (pedidoId === id) pedidoId = 0
      // O MESMO pacote confiavel chegando duas vezes nao pode disparar o pulso,
      // o clarao e o salto de novo. Ja esta na minha mao: nada a fazer.
      if (seguroId === id) return
      // ARREMESSO CONFIRMADO. Ao arremessar eu continuo sendo o dono (sou eu
      // que simulo o voo), entao o servidor devolve OBJ_DONO com o MESMO dono
      // e sem me excluir do envio. Isto NAO e um agarrar: se caisse no caminho
      // de baixo eu religaria o feixe, o clarao e o tranco de camera e
      // re-agarraria o meu proprio tiro no meio do ar.
      if (voo && voo.id === id) return
      if (estado === 2) return          // o servidor diz "voando": idem
      const r = objetos.get(id)
      if (!r) return
      // Eu pedi pra soltar e o servidor respondeu "continua seu": pedido
      // negado. O estado volta ao que era, SEM repetir os efeitos do agarrar.
      if (soltandoId === id || (assentando && assentando.id === id)) {
        retomarPosse(r)
        return
      }
      seguroId = id
      soltandoId = 0
      assentando = null
      comecarASegurar(r)
      return
    }

    if (dono === 0) {
      if (pedidoId === id) pedidoId = 0
      if (seguroId === id) { seguroId = 0; feixe.desligar() }   // o servidor tirou de mim
      if (soltandoId === id) soltandoId = 0
      // O servidor cortou o voo (soltou o objeto por mim): o voo local para
      // aqui, senao ficariam duas coisas escrevendo na mesma posicao.
      if (voo && voo.id === id) { voo = null; rastro.limpar() }
      const r = objetos.get(id)
      if (!r) return
      // O SERVIDOR decide onde assenta — nunca este arquivo. O OBJ_DONO traz
      // x,y,z (e rotY), que e a verdade. So quando ele nao trouxer e que o
      // destino e procurado na tabela autoritativa (ver alvoDeAssentar).
      const temPos = Number.isFinite(ev.x) && Number.isFinite(ev.y) && Number.isFinite(ev.z)
      const rotY = Number.isFinite(ev.rotY) ? ev.rotY : null
      if (assentando && assentando.id === id) {
        // Pacote repetido (ou corrigido): so ATUALIZA o destino. Reiniciar a
        // descida faria o objeto subir de novo pra cair outra vez.
        if (temPos) {
          assentando.para.set(ev.x, ev.y, ev.z)
          assentando.temAlvo = true
          assentando.fixo = true
          if (rotY !== null) { assentando.rotY = rotY; assentando.temRot = true }
        }
        return
      }
      assentando = {
        id, t: 0, dur: 0.5,
        para: new THREE.Vector3(),
        temAlvo: false,
        temRot: false,
        rotY: 0,
        rx: r.obj.rotation.x, rz: r.obj.rotation.z,
      }
      if (temPos) {
        assentando.para.set(ev.x, ev.y, ev.z)
        assentando.temAlvo = true
        assentando.fixo = true                          // veio pronto: nao procura mais
        if (rotY !== null) { assentando.rotY = rotY; assentando.temRot = true }
      }
      return
    }

    // objeto de outro jogador: some da minha mira e ganha so um brilho de aviso
    if (pedidoId === id) { pedidoId = 0; avisar('Esse objeto ja esta com outra pessoa.') }
    if (seguroId === id) { seguroId = 0; feixe.desligar() }
    if (soltandoId === id) soltandoId = 0
    // deixou de ser meu no meio do voo: paro de simular, quem manda e o dono novo
    if (voo && voo.id === id) { voo = null; rastro.limpar() }
    if (assentando && assentando.id === id) assentando = null
    if (alvoId === id) alvoId = 0
  }

  /**
   * Volta a segurar o objeto SEM os efeitos do agarrar. Nao e um agarrar novo:
   * e o desfazer de um soltar/arremessar que o servidor negou. Por isso nao
   * tem pulso, nem clarao, nem salto, nem tranco de camera — nada disso
   * aconteceu de verdade.
   */
  function retomarPosse(r) {
    seguroId = r.id
    pedidoId = 0
    soltandoId = 0
    assentando = null
    if (voo && voo.id === r.id) { voo = null; rastro.limpar() }
    feixe.ligar()
    r.obj.getWorldPosition(_a)
    ultimoDestino.copy(_a)
    acumObjPos = 0
    enviarPos(r)
  }

  function comecarASegurar(r) {
    feixe.ligar()
    feixe.dispararPulso()          // o pulso desce o feixe ate o objeto
    saltoV = 3.6                   // e o objeto SALTA pra cima
    saltoY = 0
    r.obj.getWorldPosition(_a)
    ultimoDestino.copy(_a)
    clarao.disparar(_a, r.tamanho * 3.2, 0.3)
    luzObjeto.position.copy(_a)
    luzObjPico = Math.max(luzObjPico, 8)
    tremerImpulso(0.55)
    // Manda a primeira posicao na hora: sem isso os outros so veem o objeto se
    // mexer no proximo tique, e ele "teleporta" na tela deles.
    acumObjPos = 0
    enviarPos(r)
  }

  function enviarPos(r) {
    if (ehLocal() || !rede || typeof rede.enviarObjPos !== 'function') return
    const p = r.obj.position
    rede.enviarObjPos(r.id, p.x, p.y, p.z, r.obj.rotation.y)
  }

  // =========================================================================
  // 11. MOUSE
  // =========================================================================
  // core/input.js nao expoe botao de mouse e nao e meu arquivo pra mexer.
  // Entao o poder escuta o proprio mousedown, e so age com o ponteiro TRAVADO
  // (o mesmo teste que o jogo ja usa pra saber que esta em modo de jogo).
  function jogando() {
    return equipado && typeof document !== 'undefined' && !!document.pointerLockElement
  }

  function onMouseDown(e) {
    if (!jogando()) return
    if (e.button === 0) {
      e.preventDefault()
      if (seguroId) arremessar()
      else pedirPegar()
    } else if (e.button === 2) {
      e.preventDefault()
      if (seguroId) recolocar()
      else { segurandoDireito = true; comecarMontagem() }
    }
  }

  function onMouseUp(e) {
    if (e.button !== 2) return
    segurandoDireito = false
    // soltou antes do fim: as pecas se desfazem
    if (montagem && montagem.t < HELI_MONTAGEM) cancelarMontagem()
  }
  function onContextMenu(e) { if (jogando()) e.preventDefault() }

  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('contextmenu', onContextMenu)

  // =========================================================================
  // 12. QUADRO
  // =========================================================================
  function atualizarAnelParado(dt) {
    // gira devagar e pulsa: e o convite pra chegar perto
    pivoChao.rotation.y += dt * 0.85
    const p = 0.5 + 0.5 * Math.sin(tempo * 2.1)
    matAro.emissiveIntensity = 1.9 + p * 1.5
    const s = 1 + p * 0.12
    haloChao.scale.set(s, s, s)
    haloChao.material.opacity = 0.26 + p * 0.26
    matDisco.opacity = 0.16 + p * 0.2
    pivoChao.position.y = 0.44 + Math.sin(tempo * 1.35) * 0.045
  }

  function atualizarSegurando(dt, r) {
    // ponto de flutuacao: a frente da mira, com oscilacao lenta
    camera.getWorldPosition(_co)
    camera.getWorldDirection(_cd)
    _alvo.copy(_co).addScaledVector(_cd, DIST_SEGURA)
    _alvo.y += Math.sin(tempo * 1.55) * 0.06

    // o salto do agarrar: mola que sobe e morre
    saltoV -= 11 * dt
    saltoY += saltoV * dt
    saltoY -= saltoY * Math.min(1, dt * 2.4)
    if (saltoY < 0 && saltoV < 0) { saltoY *= 1 - Math.min(1, dt * 6); saltoV *= 0.86 }
    _alvo.y += saltoY

    // lerp exponencial: independente de fps e sem tranco
    const k = 1 - Math.pow(0.0022, dt)
    r.obj.position.lerp(_alvo, k)

    // giro devagar + balanco
    r.obj.rotation.y += dt * 0.72
    r.obj.rotation.x = Math.sin(tempo * 0.9) * 0.13
    r.obj.rotation.z = Math.cos(tempo * 0.72) * 0.1

    // OBJ_POS: 15 Hz, como manda o contrato (nao por quadro — a 84 fps seriam
    // cinco vezes mais pacotes do que o servidor consome).
    acumObjPos += dt
    if (acumObjPos >= PERIODO_OBJ_POS) {
      acumObjPos -= PERIODO_OBJ_POS
      if (acumObjPos > PERIODO_OBJ_POS) acumObjPos = 0
      enviarPos(r)
    }
  }

  function atualizarVoo(dt) {
    const r = objetos.get(voo.id)
    if (!r) { voo = null; return }
    voo.t += dt
    _ant.copy(r.obj.position)
    voo.vel.y -= GRAVIDADE * dt
    r.obj.position.addScaledVector(voo.vel, dt)
    r.obj.rotation.x += dt * 7
    r.obj.rotation.z += dt * 5
    rastro.marcar(r.obj.position)

    let bateu = false
    const p = r.obj.position
    if (voo.t > GRACA_VOO) {
      const chao = chaoEm(p.x, p.z)
      const piso = chao + r.meiaAltura
      if (p.y <= piso) {
        p.y = piso
        bateu = true
      } else if (collision && typeof collision.isFree === 'function'
        && p.y - chao < ALTURA_COLISOR && !collision.isFree(p.x, p.z, r.raio)) {
        // Os colisores comuns sao chapas XZ SEM altura. Usa-los sem limite de
        // altura faria o objeto explodir no ar toda vez que passasse por cima
        // de um banco ou de um predio. Acima disso quem responde e o occluder,
        // que tem altura de verdade.
        bateu = true
      } else if (collision && typeof collision.segmentHit === 'function') {
        const f = collision.segmentHit(_ant, p, 0)
        if (f < 1) { p.lerpVectors(_ant, p, f); bateu = true }
      }
    }
    if (!bateu && voo.t > TEMPO_VOO_MAX) bateu = true

    // Enquanto voa eu ainda sou o dono: continuo mandando a posicao pra que os
    // outros vejam o objeto atravessar a rua, e nao piscar no ponto do impacto.
    acumObjPos += dt
    if (acumObjPos >= PERIODO_OBJ_POS) {
      acumObjPos -= PERIODO_OBJ_POS
      if (acumObjPos > PERIODO_OBJ_POS) acumObjPos = 0
      enviarPos(r)
    }

    if (!bateu) return
    const id = voo.id
    voo = null
    // Avisa o servidor ONDE bateu e ja quebra aqui. O OBJ_DESTRUIDO que voltar
    // encontra o id em `destruidos` e nao faz nada — idempotencia do contrato.
    if (!ehLocal() && typeof rede.destruiu === 'function') rede.destruiu(id, p.x, p.y, p.z)
    quebrarLocal(id, p.x, p.y, p.z)
    tremerImpulso(0.35)
  }

  /**
   * Onde o objeto vai assentar, segundo O SERVIDOR — nunca segundo nos.
   * Duas fontes, nesta ordem:
   *   1) rede.objetos: a tabela autoritativa que o cliente de rede mantem
   *      (ja interpolada 100 ms atras, como o resto do que e remoto);
   *   2) a pose de origem em mundo.js: o servidor so manda no snapshot os
   *      objetos que NAO estao parados no lugar de origem, entao sumir da
   *      tabela quer dizer exatamente "voltou pra casa".
   * Se nenhuma das duas responder, o objeto simplesmente nao desce ainda.
   */
  function alvoDeAssentar(id, out, dest) {
    const tab = rede && rede.objetos
    if (tab && typeof tab.get === 'function') {
      const o = tab.get(id)
      if (o && Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z)) {
        out.set(o.x, o.y, o.z)
        if (dest && Number.isFinite(o.rotY)) { dest.rotY = o.rotY; dest.temRot = true }
        return true
      }
    }
    const base = AGARRAVEL_POR_ID[id]
    if (base) { out.set(base.x, base.y, base.z); return true }
    return false
  }

  /** Menor caminho angular de `de` ate `para` (evita a volta de 350 graus). */
  function deltaAngulo(de, para) {
    let d = (para - de) % TAU
    if (d > Math.PI) d -= TAU
    if (d < -Math.PI) d += TAU
    return d
  }

  function atualizarAssentar(dt) {
    const r = objetos.get(assentando.id)
    if (!r) { assentando = null; return }
    if (!assentando.fixo) {
      if (alvoDeAssentar(assentando.id, _b, assentando)) {
        assentando.para.copy(_b)
        assentando.temAlvo = true
      }
    }
    assentando.t += dt
    if (!assentando.temAlvo) {
      // ainda nao sei onde o servidor colocou: espero, sem chutar
      if (assentando.t > TEMPO_SOLTAR) assentando = null
      return
    }
    const k = Math.min(1, assentando.t / assentando.dur)
    const e = 1 - Math.pow(1 - k, 3)          // desacelera na chegada: assenta, nao cai
    const passo = k >= 1 ? 1 : Math.min(1, dt * 9 + e * 0.12)
    r.obj.position.lerp(assentando.para, passo)
    r.obj.rotation.x = assentando.rx * (1 - e)
    r.obj.rotation.z = assentando.rz * (1 - e)
    // rotY tambem e do servidor: o objeto para virado como ELE mandou, e nao
    // no angulo em que o meu giro de levitacao por acaso tinha parado.
    if (assentando.temRot) {
      r.obj.rotation.y += deltaAngulo(r.obj.rotation.y, assentando.rotY) * passo
    }
    if (k >= 1) {
      r.obj.position.copy(assentando.para)
      if (assentando.temRot) r.obj.rotation.y = assentando.rotY
      assentando = null
    }
  }

  /**
   * Descida SO visual, sem mandar nada pela rede: serve pros casos em que nao
   * existe (mais) um servidor pra dizer onde o objeto ficou. Nao e o cliente
   * decidindo a queda — e o cliente nao deixando um objeto parado no ar.
   */
  function assentarLocalmente(id) {
    id = id | 0
    const r = id ? objetos.get(id) : null
    if (!r || destruidos.has(id)) return
    const p = r.obj.position
    assentando = {
      id, t: 0, dur: 0.5, temAlvo: true, fixo: true, temRot: false, rotY: 0,
      para: new THREE.Vector3(p.x, chaoEm(p.x, p.z) + r.meiaAltura, p.z),
      rx: r.obj.rotation.x, rz: r.obj.rotation.z,
    }
  }

  /**
   * A conexao caiu. O servidor libera sozinho o que eu estava usando (contrato),
   * so que agora ele nao tem mais como me avisar: quem limpa a MINHA tela sou
   * eu. Sem isto o feixe fica preso pra sempre num objeto que ninguem controla.
   */
  function limparPorQueda() {
    const id = seguroId || (voo ? voo.id : 0) || soltandoId || 0
    if (id || pedidoId) avisar('Conexao caiu: o objeto voltou pro servidor.')
    seguroId = 0
    pedidoId = 0
    soltandoId = 0
    voo = null
    assentando = null
    alvoId = 0
    feixe.desligar()
    rastro.limpar()
    // Nenhum dono que eu conhecia vale mais nada. Deixar os donos velhos
    // travaria a mira pra sempre; na volta o BEMVINDO semeia o mundo de novo.
    for (const objId of donos.keys()) donos.set(objId, 0)
    assentarLocalmente(id)
  }

  function atualizar(dt) {
    if (!(dt > 0)) dt = 0.0001
    if (dt > 0.1) dt = 0.1
    tempo += dt

    // a montagem do helicoptero anda mesmo com objeto na mao? nao: ela so
    // existe com a mao vazia, e atualizarMontagem cancela sozinha nesse caso
    atualizarMontagem(dt)

    // --- a conexao caiu no meio da telecinese? ------------------------------
    // Interessa a BORDA (estava conectado e caiu), nao o estado: antes do
    // BEMVINDO tambem nao ha conexao, e ali nao ha nada pra limpar.
    if (!ehLocal()) {
      const agoraConectado = !!rede.conectado
      if (conectadoAntes && !agoraConectado) limparPorQueda()
      conectadoAntes = agoraConectado
    }

    if (!equipado) atualizarAnelParado(dt)

    // --- pedidos que o servidor nunca respondeu -----------------------------
    if (pedidoId) {
      pedidoT += dt
      if (pedidoT > TEMPO_PEDIDO) pedidoId = 0    // some sem barulho; nada foi decidido aqui
    }
    if (soltandoId) {
      soltandoT += dt
      if (soltandoT > TEMPO_SOLTAR) {
        // O pacote confiavel se perdeu (ou o servidor sumiu). Assentamos SO
        // visualmente, no chao logo abaixo: nenhuma mensagem sai daqui, e a
        // proxima verdade do servidor manda o objeto pro lugar certo.
        const id = soltandoId
        soltandoId = 0
        assentarLocalmente(id)
      }
    }

    // --- mira ---------------------------------------------------------------
    atualizarMira()

    const rSeguro = seguroId ? objetos.get(seguroId) : null
    if (seguroId && !rSeguro) seguroId = 0
    if (rSeguro) atualizarSegurando(dt, rSeguro)
    if (voo) atualizarVoo(dt)
    if (assentando) atualizarAssentar(dt)

    // --- contorno da mira ---------------------------------------------------
    // O aviso ANTES de agarrar: sem ele o jogador nao sabe no que vai bater.
    const querMira = !!alvoId && !seguroId
    brilhoMira += ((querMira ? 1 : 0) - brilhoMira) * Math.min(1, dt * 11)
    if (brilhoMira > 0.01 && alvoId) {
      const r = objetos.get(alvoId)
      const pulsa = 0.42 + 0.22 * Math.sin(tempo * 5.2)
      if (r && r.principal) contornoMira.mostrar(r.principal, brilhoMira * pulsa, 1.04)
      else contornoMira.esconder()
    } else contornoMira.esconder()

    // --- brilho do objeto na mao (ou de quem esta com ele) ------------------
    let rBrilho = rSeguro
    if (!rBrilho) {
      // objeto na mao de OUTRO jogador tambem brilha: e o que conta a historia
      for (const [id, dono] of donos) {
        if (!dono || destruidos.has(id)) continue
        if (ehLocal() && dono === -1) continue
        const r = objetos.get(id)
        if (r && r.obj.visible) { rBrilho = r; break }
      }
    }
    const querObj = !!(rBrilho && !voo)
    brilhoObj += ((querObj ? 1 : 0) - brilhoObj) * Math.min(1, dt * 8)
    if (brilhoObj > 0.01 && rBrilho && rBrilho.principal) {
      const pulsa = 0.5 + 0.26 * Math.sin(tempo * 3.4)
      contornoObj.mostrar(rBrilho.principal, brilhoObj * pulsa, 1.05)
    } else contornoObj.esconder()

    // --- feixe --------------------------------------------------------------
    // Sem objeto na mao o feixe continua sendo desenhado ate a opacidade morrer,
    // e no ULTIMO destino conhecido — se colapsasse origem sobre destino a curva
    // ficaria degenerada e o feixe sumiria seco no lugar de apagar.
    origemDoFeixe(_origem)
    if (rSeguro) rSeguro.obj.getWorldPosition(ultimoDestino)
    feixe.atualizar(_origem, ultimoDestino, dt, tempo)

    // --- particulas ---------------------------------------------------------
    if (!equipado) {
      _a.set(ANEL_MUNDO.x, ANEL_MUNDO.y + pivoChao.position.y, ANEL_MUNDO.z)
      orbitaChao.atualizar(dt, _a, 0.44, 0.85, tempo)
    } else {
      orbitaChao.atualizar(dt, null, 0, 0, tempo)
    }
    if (rBrilho && brilhoObj > 0.01 && !voo) {
      rBrilho.obj.getWorldPosition(_a)
      orbitaObj.atualizar(dt, _a, rBrilho.tamanho * 0.95, brilhoObj, tempo)
    } else {
      orbitaObj.atualizar(dt, null, 0, 0, tempo)
    }

    clarao.atualizar(dt)
    choque.atualizar(dt)
    quebra.atualizar(dt)
    rastro.atualizar(dt)

    // --- luzes --------------------------------------------------------------
    // luzAnel: acompanha o anel, onde quer que ele esteja.
    if (equipado) {
      if (aroMao.parent) aroMao.getWorldPosition(_a)
      else _a.copy(_origem)
      luzAnel.position.copy(_a)
      luzAnel.intensity = 1.0 + (rSeguro ? 1.4 : 0) + Math.sin(tempo * 2.4) * 0.18
    } else {
      luzAnel.position.set(ANEL_MUNDO.x, ANEL_MUNDO.y + pivoChao.position.y, ANEL_MUNDO.z)
      luzAnel.intensity = 2.6 + Math.sin(tempo * 2.1) * 0.9
    }

    // luzObjeto: mora no objeto levitado e serve de clarao nos eventos.
    if (rBrilho && !voo) {
      rBrilho.obj.getWorldPosition(_a)
      luzObjeto.position.copy(_a)
      luzObjAlvo = 5.5 * brilhoObj
    } else if (voo) {
      const r = objetos.get(voo.id)
      if (r) { r.obj.getWorldPosition(_a); luzObjeto.position.copy(_a) }
      luzObjAlvo = 5.0
    } else {
      luzObjAlvo = 0
    }
    luzObjPico = Math.max(0, luzObjPico - dt * 26)
    const inten = luzObjAlvo + luzObjPico
    luzObjeto.intensity += (inten - luzObjeto.intensity) * Math.min(1, dt * 16)
    // (nunca mexemos em luzObjeto.visible: ver o comentario onde ela nasce)

    // --- de quem e a posicao deste objeto neste instante --------------------
    // Enquanto EU seguro, arremesso ou assento um objeto, a posicao dele sai
    // daqui. Quem aplica os snapshots nos meshes deve pular o que estiver
    // marcado, senao a tabela da rede (que chega 100 ms atras) briga com a
    // animacao local e o objeto treme na mao.
    const controlado = seguroId || (voo ? voo.id : 0) || (assentando ? assentando.id : 0) || 0
    if (controlado !== ultimoControlado) {
      marcarControle(ultimoControlado, false)
      marcarControle(controlado, true)
      ultimoControlado = controlado
    }

    // --- tranco de camera ---------------------------------------------------
    tremorF = Math.max(0, tremorF - dt * 3.4)
    const amp = tremorF * tremorF * 0.02
    tremor.x = Math.sin(tempo * 46.0) * amp
    tremor.y = Math.cos(tempo * 37.3) * amp * 0.75
  }

  // =========================================================================
  // 13. LIMPEZA
  // =========================================================================
  function dispose() {
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('contextmenu', onContextMenu)
    feixe.dispose(); contornoMira.dispose(); contornoObj.dispose()
    clarao.dispose(); choque.dispose(); quebra.dispose()
    rastro.dispose(); orbitaChao.dispose(); orbitaObj.dispose()
    scene.remove(luzAnel, luzObjeto)
    if (poolLuz && typeof poolLuz.devolver === 'function') {
      poolLuz.devolver(luzAnel); poolLuz.devolver(luzObjeto)
    }
    if (aroMao.parent) aroMao.parent.remove(aroMao)
    if (haloMao.parent) haloMao.parent.remove(haloMao)
    if (grupoNoChao.parent) grupoNoChao.parent.remove(grupoNoChao)
    geoAro.dispose(); geoHalo.dispose(); geoDisco.dispose()
    geoAroMao.dispose(); geoHaloMao.dispose()
    matAro.dispose(); matHalo.dispose(); matDisco.dispose()
    haloMao.material.dispose()
    objetos.clear(); donos.clear(); destruidos.clear()
  }

  return {
    grupoNoChao,
    /** Ja esta com o jogador (voltou pelo BEMVINDO, por exemplo): some do
     *  mundo e nao pode mais ser pego do chao. */
    marcarPego() {
      pego = true
      grupoNoChao.visible = false
      if (interaction && typeof interaction.setEnabled === 'function') {
        interaction.setEnabled('anel-verde', false)
      }
    },
    interactable,
    equipar,
    desequipar,
    registrarObjeto,
    objetoDe,
    controlaLocalmente,
    atualizar,
    aoEventoDeRede,
    // a montagem do helicoptero tambem por fora do mouse: o clique direito
    // exige ponteiro travado, e teste headless (e um gamepad, um dia) nao tem
    montarHelicoptero() { segurandoDireito = true; comecarMontagem() },
    pararMontagem() { segurandoDireito = false; cancelarMontagem() },
    get montando() { return montagem ? montagem.t / HELI_MONTAGEM : 0 },
    tremor,                  // {x,y} em RADIANOS, pra somar na rotacao da camera
    dispose,
    get equipado() { return equipado },
    get alvoAtual() { return alvoId },
    get segurando() { return seguroId },
    get objetos() { return objetos },
  }
}

// ---------------------------------------------------------------------------
// SUPOSICOES sobre os outros modulos (o que este arquivo espera encontrar):
//
// Conferidas contra src/rede/cliente-rede.js:
//   rede.pegar(objId)
//   rede.soltar(objId, x, y, z)
//   rede.arremessar(objId, pos, dir, forca)     pos e dir sao {x,y,z}
//   rede.enviarObjPos(objId, x, y, z, rotY)
//   rede.destruiu(objId, x, y, z)
//   rede.meuId                                  numero (funcao tambem serve)
//   rede.conectado                               booleano; cair pra false com
//                                                objeto na mao limpa o feixe
//   rede.objetos                                Map id -> {x,y,z,rotY,dono,estado}
//                                               ja interpolado 100 ms atras
//
// O cliente de rede chama anel.aoEventoDeRede(ev) com:
//   { tipo:'obj-dono',      objId, donoId, x, y, z, rotY, estado }
//                                                x,y,z,rotY sao a posicao que o
//                                                SERVIDOR decidiu; estado segue
//                                                o contrato (0 repouso, 1 seguro,
//                                                2 voando, 3 destruido). Faltando
//                                                x/y/z o destino sai de
//                                                rede.objetos e, quando o id some
//                                                de la, da pose de origem em
//                                                mundo.js (AGARRAVEL_POR_ID)
//   { tipo:'obj-destruido', objId, x, y, z }
//   { tipo:'negado',        oque, id }           so oque=2 e objeto
// O nome do tipo e normalizado (obj_dono/objDono servem) e `id` vale no lugar
// de `objId`.
//
// As transicoes de posse, uma a uma (secao "O anel verde" do REDE.md):
//   agarrar    so acontece no obj-dono que me da o objeto, nunca no clique;
//   arremessar mantem o dono — o obj-dono de posse propria com o id EM VOO e
//              ignorado, senao eu re-agarraria o proprio tiro;
//   recolocar  desce ate a posicao do servidor, e o pacote repetido so corrige
//              o destino em vez de reiniciar a descida;
//   negado     no soltar/arremessar devolve o objeto pra mao, sem os efeitos;
//   destruido  e idempotente (Set `destruidos`);
//   queda      da conexao limpa feixe, voo, pedido e donos.
//
// O main deve:
//   - chamar anel.atualizar(dt) todo quadro;
//   - somar anel.tremor.x/.y na rotacao da camera DEPOIS de player.update(dt);
//   - registrar anel.interactable no sistema de interacao e adicionar
//     anel.grupoNoChao na cena;
//   - chamar anel.registrarObjeto(id, mesh) pra cada agarravel construido;
//   - ao aplicar os snapshots nos meshes, PULAR os que tiverem
//     mesh.userData.anelControla === true (ou anel.controlaLocalmente(id)):
//     esses estao sendo animados aqui e a rede so ia fazer eles tremerem.
//
// Assume tambem que os meshes agarraveis sao filhos diretos da cena (ou de um
// grupo na origem, sem rotacao): a levitacao e o voo escrevem em .position,
// que e espaco do pai.
//
// Sem `rede`, o modulo entra em modo local e responde aos proprios pedidos —
// so pra continuar jogavel no single player. Com rede, ele nunca decide nada.
// ---------------------------------------------------------------------------
