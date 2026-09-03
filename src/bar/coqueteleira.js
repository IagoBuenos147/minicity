import * as THREE from 'three'
import { solid, stdMat, box, cyl } from '../world/materials.js'
import { geoGelo } from '../mobilia/utensilios.js'

// ---------------------------------------------------------------------------
// src/bar/coqueteleira.js — A COQUETELEIRA, E O ANEL QUE MEDE O CHACOALHO.
//
// O pedido do dono foi literal: "sistema de chacoalhar o copo". Chacoalhar nao
// e apertar um botao e esperar uma barra encher — o jogo TEM que sentir o
// gesto. Entao aqui o que enche a barra e o MOUSE INDO E VOLTANDO: cada
// inversao de sentido conta como uma chacoalhada, e chacoalhada e a unidade.
//
// (A conta em si mora em bar/gestos.js, que e quem ve o mouse. Este arquivo e a
// PECA — a geometria, o balanco, a condensacao e o anel. A separacao e a mesma
// de sempre: mobilia/barril.js desenha a torneira e world/adega.js decide
// quando ela abre.)
//
// TRES COISAS QUE TIVERAM QUE EXISTIR PRA O GESTO FUNCIONAR:
//
//   1. O ANEL DE ENERGIA E DIEGETICO. O dono disse que odeia painel modal
//      cobrindo a tela, e uma barra de HUD em cima de uma coqueteleira e
//      exatamente isso. Entao a barra E um anel de 28 tacos em volta da peca,
//      no mundo 3D, que acende taco a taco. E uma InstancedMesh so: em malhas
//      separadas seriam 28 draw calls por um medidor.
//   2. A PECA BALANCA DE VERDADE. `setBalanco(x, y)` inclina e desloca a
//      coqueteleira no sentido do gesto, com um atraso — o metal e pesado e
//      chega DEPOIS da mao. Sem esse atraso o objeto fica colado no ponteiro e
//      a leitura vira "arrastando um icone".
//   3. A CONDENSACAO APARECE. 40 gotinhas numa InstancedMesh, reveladas
//      conforme a energia sobe. E o unico jeito de mostrar que o metal esfriou,
//      e e o detalhe que o jogador nota sem saber que notou.
//
// A COQUETELEIRA E DE TRES PECAS (copo, coador de topo, tampinha) e nao de
// duas. A de duas — dois copos de metal encaixados — e a que barman de verdade
// usa, mas ela e AMBIGUA na tela: dois cones iguais um por cima do outro lem
// como uma peca so, e o gesto de "tampar" nao aparece. A de tres tem uma
// tampinha pequena e obviamente separada, e tampar vira um movimento visivel.
//
// Escala real: 24 cm fechada, base em y=0, centrada em x/z.
// ---------------------------------------------------------------------------

const M = {
  get inox() { return solid(0xbcc2c8, 0.30, 0.84) },
  get inoxFosco() { return solid(0x9aa2aa, 0.44, 0.70) },
  get inoxEscuro() { return solid(0x70777e, 0.40, 0.76) },
  // gota de condensacao: branca, opaca e PEQUENA. Transparente ela some contra
  // o inox claro; e o que se ve numa coqueteleira gelada e o ponto branco.
  get gota() { return solid(0xf4fbff, 0.18, 0.10) },
  get geloDentro() { return solid(0xdff0f8, 0.24, 0.0, { transparent: true, opacity: 0.5 }) },
  /** O taco do anel: emissivo, e a cor troca com o estado (ver setAnel). */
  anel(chave, cor, forca) {
    return stdMat('coq-anel:' + chave, {
      color: 0x121316, emissive: cor, emissiveIntensity: forca,
      roughness: 0.5, transparent: true, opacity: 0.92,
    })
  },
}

const N_ANEL = 28          // tacos do medidor. 28 = um a cada ~13 graus.
const N_GOTA = 40

/**
 * @param opts.altura   altura fechada (m). 0.24 e uma coqueteleira de 700 ml.
 * @param opts.raioAnel raio do anel de energia (m)
 */
export function criarCoqueteleira(opts = {}) {
  const H = opts.altura !== undefined ? opts.altura : 0.240
  const rAnel = opts.raioAnel !== undefined ? opts.raioAnel : 0.085

  const g = new THREE.Group()
  g.name = 'coqueteleira'
  // ela balanca, a tampa sobe e o anel acende: nada disso pode ir pro forno
  g.userData.noBake = true

  // O grupo que BALANCA. A raiz fica parada (o anel e a sombra do balcao nao
  // podem balancar junto), e so o corpo se mexe dentro dela.
  const corpo = new THREE.Group()
  g.add(corpo)

  // --- o copo de baixo -------------------------------------------------------
  //
  // Perfil de cone truncado com o pe RECOLHIDO: a base tem 4,4 cm de raio, a
  // barriga 4,7 logo acima do pe e a boca 3,3. E a recolhida do pe que faz a
  // peca parecer torneada e nao um funil de plastico.
  const P = 0.0008
  const rBase = 0.0440, rBarr = 0.0472, rBoca = 0.0335
  const hCopo = H * 0.72
  const perfil = [
    [0.0000, 0.0000], [rBase - 0.006, 0.0000], [rBase, 0.0030],
    [rBarr, 0.0150], [rBarr * 0.97, 0.0420],
    [0.0430, hCopo * 0.52], [0.0378, hCopo * 0.80], [rBoca, hCopo - 0.004],
    [rBoca + 0.0016, hCopo],                       // o aro da boca
    [rBoca - P, hCopo - 0.002],
    [0.0376 - P, hCopo * 0.80], [0.0428 - P, hCopo * 0.52],
    [rBarr * 0.97 - P, 0.0420], [rBarr - P, 0.0150],
    [rBase - P, 0.0060], [0.0000, 0.0060],
  ]
  const v = []
  for (const p of perfil) v.push(new THREE.Vector2(p[0], p[1]))
  const copo = new THREE.Mesh(new THREE.LatheGeometry(v, 26), M.inox)
  copo.castShadow = true
  copo.receiveShadow = true
  corpo.add(copo)

  // O FILETE gravado na barriga. Mesmo motivo do filete da tulipa em copos.js:
  // metal liso a vinte centimetros do olho nao tem onde a luz pegar.
  const filete = new THREE.Mesh(new THREE.TorusGeometry(0.0432, 0.0018, 6, 28), M.inoxFosco)
  filete.rotation.x = Math.PI / 2
  filete.position.y = hCopo * 0.52
  filete.castShadow = false
  corpo.add(filete)

  // --- gelo dentro ----------------------------------------------------------
  // So aparece quando o gesto pos gelo. Sete pedras numa instanced; elas ficam
  // paradas em relacao ao copo (o que chacoalha e o copo inteiro).
  const gelo = new THREE.InstancedMesh(geoGelo(), M.geloDentro, 7)
  gelo.visible = false
  gelo.castShadow = false
  const d0 = new THREE.Object3D()
  for (let i = 0; i < 7; i++) {
    const a = i * 2.399
    const r = Math.sqrt((i + 0.4) / 7) * 0.026
    d0.position.set(Math.cos(a) * r, 0.022 + (i % 3) * 0.016, Math.sin(a) * r)
    d0.rotation.set(a * 0.7, a, a * 0.3)
    d0.scale.setScalar(0.9)
    d0.updateMatrix()
    gelo.setMatrixAt(i, d0.matrix)
  }
  gelo.instanceMatrix.needsUpdate = true
  corpo.add(gelo)

  // --- a tampa (coador de topo + tampinha) ----------------------------------
  //
  // Ela vive num grupo proprio porque SOBE: tampar e destampar e o gesto que
  // separa "juntei as coisas" de "vou bater". `setTampa(0..1)`.
  const tampa = new THREE.Group()
  corpo.add(tampa)

  const capa = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000), new THREE.Vector2(rBoca + 0.0028, 0.0000),
    new THREE.Vector2(rBoca + 0.0030, 0.0090), new THREE.Vector2(0.0316, 0.0230),
    new THREE.Vector2(0.0248, 0.0340), new THREE.Vector2(0.0186, 0.0390),
    new THREE.Vector2(0.0176, 0.0450), new THREE.Vector2(0.0000, 0.0455),
  ], 26), M.inox)
  capa.castShadow = true
  tampa.add(capa)

  // os furos do coador embutido: uma instanced de 12 pontos escuros no ombro
  const furos = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0018, 0.0018, 0.0016, 6), M.inoxEscuro, 12,
  )
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    d0.position.set(Math.cos(a) * 0.0250, 0.0316, Math.sin(a) * 0.0250)
    d0.rotation.set(0.6, -a, 0)
    d0.scale.setScalar(1)
    d0.updateMatrix()
    furos.setMatrixAt(i, d0.matrix)
  }
  furos.instanceMatrix.needsUpdate = true
  furos.castShadow = false
  tampa.add(furos)

  // A TAMPINHA: pequena, separada e obviamente removivel. Ver o cabecalho —
  // e ela que faz o gesto de tampar existir na tela.
  const capinha = new THREE.Group()
  tampa.add(capinha)
  const cc = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000), new THREE.Vector2(0.0182, 0.0000),
    new THREE.Vector2(0.0186, 0.0060), new THREE.Vector2(0.0166, 0.0210),
    new THREE.Vector2(0.0120, 0.0270), new THREE.Vector2(0.0000, 0.0280),
  ], 20), M.inoxFosco)
  cc.castShadow = true
  capinha.add(cc)
  capinha.position.y = 0.0450

  tampa.position.y = hCopo - 0.001

  // --- condensacao ----------------------------------------------------------
  //
  // 40 gotas na parede do copo, reveladas por escala conforme a energia sobe.
  // A posicao e sorteada UMA vez; o que muda por quadro e quantas aparecem.
  const gotas = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4), M.gota, N_GOTA)
  gotas.visible = false
  gotas.castShadow = false
  gotas.frustumCulled = false
  gotas.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  corpo.add(gotas)
  const dadosGota = []
  for (let i = 0; i < N_GOTA; i++) {
    const y = 0.012 + Math.random() * (hCopo - 0.030)
    // o raio da parede naquela altura, interpolado grosso: a garrafa afina de
    // baixo pra cima, e gota flutuando a 3 mm da parede aparece na hora
    const t = y / hCopo
    const r = rBarr + (rBoca - rBarr) * Math.max(0, (t - 0.10) / 0.90)
    dadosGota.push({
      a: Math.random() * Math.PI * 2, y, r: r + 0.0006,
      tam: 0.0011 + Math.random() * 0.0022,
      // limiar: em que energia esta gota aparece. Espalhado pra elas nao
      // brotarem todas juntas.
      lim: Math.random() * 0.85,
      escorre: Math.random() < 0.30 ? 0.010 + Math.random() * 0.020 : 0,
    })
  }
  const _m = new THREE.Matrix4()
  let condensa = -1
  // As gotas usam SphereGeometry UNITARIA, e InstancedMesh nasce com as
  // matrizes em identidade: sem esta chamada elas sao 40 bolas de um metro
  // (invisiveis, mas dentro da caixa da peca) ate a primeira condensacao. Ver a
  // mesma nota em mobilia/copos.js.

  function escreverGotas(k) {
    let vivo = false
    for (let i = 0; i < N_GOTA; i++) {
      const gt = dadosGota[i]
      const ativo = k > gt.lim
      if (ativo) vivo = true
      const e = ativo ? gt.tam * Math.min(1, (k - gt.lim) * 5) : 0.00001
      // as que escorrem descem um pouco conforme a energia sobe
      const y = gt.y - (ativo ? gt.escorre * Math.min(1, (k - gt.lim) * 2) : 0)
      _m.makeScale(e, e * (gt.escorre ? 2.2 : 1), e)
      _m.setPosition(Math.cos(gt.a) * gt.r, y, Math.sin(gt.a) * gt.r)
      gotas.setMatrixAt(i, _m)
    }
    gotas.instanceMatrix.needsUpdate = true
    gotas.visible = vivo
  }
  escreverGotas(0)

  // --- o anel de energia ----------------------------------------------------
  //
  // Fica na RAIZ e nao no corpo: um medidor que balanca junto com o objeto
  // medido e ilegivel. Ele nasce escondido — so existe durante o gesto.
  const anelG = new THREE.Group()
  anelG.visible = false
  g.add(anelG)
  const matApagado = M.anel('off', 0x203038, 0.10)
  const matCheio = M.anel('on', 0x36c8ff, 2.6)
  const matBom = M.anel('bom', 0x4ce06a, 3.0)
  const matDemais = M.anel('demais', 0xff5a3c, 3.2)

  const tacos = []
  for (let i = 0; i < N_ANEL; i++) {
    const a = (i / N_ANEL) * Math.PI * 2 - Math.PI / 2
    const t = box(0.0060, 0.0022, 0.0135, matApagado, Math.cos(a) * rAnel, 0, Math.sin(a) * rAnel)
    t.rotation.y = -a
    t.castShadow = false
    anelG.add(t)
    tacos.push(t)
  }
  anelG.position.y = H * 0.52

  // --- estado ---------------------------------------------------------------
  let balX = 0, balY = 0          // alvo do balanco, -1 a 1
  let curX = 0, curY = 0          // o que a peca ja alcancou (com atraso)
  let velX = 0, velY = 0
  let abertura = 1                // 1 = destampada, 0 = tampada
  let aberturaAlvo = 1
  let anelK = 0
  let anelEstado = 'neutro'
  let t = 0

  const api = {
    grupo: g,
    corpo,
    get altura() { return H },
    /** Onde o liquido entra, em coordenadas LOCAIS do grupo. */
    bocaLocal: new THREE.Vector3(0, hCopo + 0.006, 0),
    get tampada() { return abertura < 0.06 },

    /** 0 destampada (a tampa sobe e sai), 1 tampada. Anima sozinha. */
    tampar(v) { aberturaAlvo = v ? 0 : 1 },
    tamparJa(v) { aberturaAlvo = v ? 0 : 1; abertura = aberturaAlvo },

    /** Quantas pedras de gelo aparecem la dentro (0 a 7). */
    setGelo(n) {
      const k = Math.max(0, Math.min(7, n | 0))
      gelo.count = k
      gelo.visible = k > 0
    },

    /**
     * O SENTIDO DO GESTO, -1 a 1 nos dois eixos. Quem chama e bar/gestos.js,
     * com o delta do mouse ja normalizado. A peca chega DEPOIS (ver o
     * cabecalho): e a mola abaixo que faz o metal ter peso.
     */
    setBalanco(x, y) {
      balX = Math.max(-1, Math.min(1, x || 0))
      balY = Math.max(-1, Math.min(1, y || 0))
    },

    /**
     * O ANEL. `k` de 0 a 1 e o quanto encheu; `estado` pinta:
     *   'neutro'  enchendo
     *   'bom'     dentro da janela boa — o jogador tem que PARAR aqui
     *   'demais'  passou do ponto, o drink esta aguando
     */
    setAnel(k, estado) {
      anelK = Math.max(0, Math.min(1.25, k || 0))
      anelEstado = estado || 'neutro'
    },
    mostrarAnel(v) { anelG.visible = !!v },

    /** 0 a 1: quanto de condensacao ja se formou no metal. */
    setCondensacao(k) {
      const kk = Math.max(0, Math.min(1, k || 0))
      if (Math.abs(kk - condensa) < 0.02) return
      condensa = kk
      escreverGotas(kk)
    },

    atualizar(dt) {
      const d = Math.min(Math.max(dt || 0, 0), 0.05)
      t += d

      // tampa: sobe 5 cm e volta. Mola simples, sem overshoot — tampa de metal
      // encaixa com um toque seco, nao quica.
      abertura += (aberturaAlvo - abertura) * (1 - Math.exp(-14 * d))
      tampa.position.y = hCopo - 0.001 + abertura * 0.055
      tampa.rotation.z = abertura * 0.22
      capinha.position.y = 0.0450 + abertura * 0.030

      // MOLA DO BALANCO. K alto e amortecimento medio: a peca persegue a mao
      // com uns 80 ms de atraso, que e o que da a sensacao de peso. Amortecida
      // demais ela fica mole; de menos, ela vibra sozinha depois que o jogador
      // para.
      const K = 320, C = 22
      velX += (-(curX - balX) * K - velX * C) * d
      velY += (-(curY - balY) * K - velY * C) * d
      curX += velX * d
      curY += velY * d

      corpo.position.set(curX * 0.028, curY * 0.034, 0)
      corpo.rotation.set(-curY * 0.30, 0, -curX * 0.34)

      // --- o anel ------------------------------------------------------------
      if (anelG.visible) {
        const mat = anelEstado === 'bom' ? matBom : (anelEstado === 'demais' ? matDemais : matCheio)
        const acesos = Math.round(Math.min(1, anelK) * N_ANEL)
        for (let i = 0; i < N_ANEL; i++) {
          const on = i < acesos
          tacos[i].material = on ? mat : matApagado
          // o taco aceso e mais alto: mesmo sem cor, o medidor le em relevo
          const alvo = on ? 1.9 : 1
          tacos[i].scale.y += (alvo - tacos[i].scale.y) * (1 - Math.exp(-18 * d))
        }
        // pulsa quando esta na janela boa: e o convite pra soltar
        anelG.rotation.y = anelEstado === 'bom' ? Math.sin(t * 6) * 0.06 : 0
      }
      return true
    },

    dispose() {
      g.traverse((o) => { if (o.isMesh && o.geometry && o.geometry !== geoGelo()) o.geometry.dispose() })
    },
  }

  api.tamparJa(false)
  return api
}

export default criarCoqueteleira
