import * as THREE from 'three'
import { solid, stdMat, tex, box, cyl } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/barril.js — O BARRIL DE CHOPE E A TORNEIRA QUE JORRA.
//
// Duas pecas que so existem juntas: um barril sem torneira e um movel, e uma
// torneira sem barril e um cano.
//
// O JORRO E O CORACAO DESTE ARQUIVO, e vale dizer por que ele nao e um sistema
// de particulas. Chope caindo de trinta centimetros nao e uma nuvem de gotas: e
// uma COLUNA continua, com uma cabeca mais gorda na frente, que amassa e faz
// espuma quando bate. Particula nenhuma desenha isso sem centenas delas. O que
// desenha e um cilindro so, com tres coisas em cima:
//
//   1. A COLUNA CRESCE PRA BAIXO. Ao abrir, o topo fica no bico e o pe DESCE a
//      2,2 m/s — a velocidade de queda de verdade nos primeiros 30 cm. Sem
//      isso, a coluna inteira aparece de um quadro pro outro e o gesto perde a
//      unica coisa que ele tinha: o instante em que o liquido sai.
//   2. AO FECHAR, ELA ENCOLHE PELO TOPO. O rabo se desprende do bico e cai. E o
//      contrario de crescer, e e o que ninguem anima — quase todo jogo apaga a
//      coluna inteira de uma vez, e a leitura fica de torneira quebrada.
//   3. A TEXTURA CORRE. Faixas verticais claras rolando em v a 3,2 m/s dao o
//      movimento DENTRO da coluna. Sem elas, uma coluna de altura constante
//      parece uma barra de vidro parada pendurada no bico.
//
// E ainda a espuma: um disco que pulsa no ponto de impacto e cresce enquanto a
// torneira fica aberta, mais quatro pingos que caem depois de fechar.
//
// SEM MARCA NENHUMA, mesma regra de bebidas.js e copos.js.
// ---------------------------------------------------------------------------

// --- materiais --------------------------------------------------------------

/** Aduelas: as tabuas verticais do barril. As juntas sao o desenho todo. */
function aduelasTex() {
  return tex('barril-aduela', 256, (g, s) => {
    g.fillStyle = '#6b4526'
    g.fillRect(0, 0, s, s)
    // veio da madeira, deitado (o barril e um lathe: u da a volta, v sobe)
    for (let i = 0; i < 420; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(40,24,12,' + (0.05 + Math.random() * 0.16) + ')'
      g.fillRect(0, y, s, 1 + Math.random() * 2)
    }
    // as juntas entre aduelas: 18 linhas escuras com um filete claro do lado
    const n = 18
    for (let i = 0; i < n; i++) {
      const x = (i / n) * s
      g.fillStyle = 'rgba(28,16,8,0.72)'
      g.fillRect(x, 0, 2.6, s)
      g.fillStyle = 'rgba(190,150,105,0.16)'
      g.fillRect(x + 3, 0, 2, s)
      // cada aduela com um tom proprio: barril de tabua sortida
      g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '255,225,190' : '60,36,18') + ',' + (0.03 + Math.random() * 0.07) + ')'
      g.fillRect(x + 5, 0, s / n - 6, s)
    }
    // escorridos de chope na barriga
    for (let i = 0; i < 14; i++) {
      const x = Math.random() * s
      g.fillStyle = 'rgba(30,18,8,' + (0.10 + Math.random() * 0.18) + ')'
      g.fillRect(x, s * (0.3 + Math.random() * 0.3), 2 + Math.random() * 3, s * 0.4)
    }
  })
}

/** Faixas correndo dentro da coluna de chope. */
function jorroTex() {
  return tex('barril-jorro', 64, (g, s) => {
    g.fillStyle = '#e8a83a'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 26; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(255,246,214,' + (0.18 + Math.random() * 0.5) + ')'
      g.fillRect(Math.random() * s, y, 1 + Math.random() * 3, 6 + Math.random() * 22)
    }
    // as duas bordas mais claras: e onde a luz atravessa a coluna
    g.fillStyle = 'rgba(255,240,200,0.45)'
    g.fillRect(0, 0, 3, s)
    g.fillRect(s - 3, 0, 3, s)
  })
}

const M = {
  get madeira() {
    return stdMat('barril-madeira', { map: aduelasTex(), color: 0xbfa079, roughness: 0.88 })
  },
  get madeiraTampo() {
    return stdMat('barril-tampo', { map: aduelasTex(), color: 0xa88b66, roughness: 0.9 })
  },
  get tampoLiso() { return solid(0x9d7f5c, 0.90, 0.0) },
  get aro() { return solid(0x4b4640, 0.62, 0.55) },
  get aroFerrugem() { return solid(0x6b4a30, 0.92, 0.25) },
  get latao() { return solid(0xbe9a48, 0.42, 0.62) },
  get latacoFosco() { return solid(0x8d7433, 0.62, 0.42) },
  get porcelana() { return solid(0xe9e2d2, 0.42, 0.02) },
  get borracha() { return solid(0x1a1c1f, 0.95) },
  get inox() { return solid(0xb8bec4, 0.34, 0.78) },
  get ferroEscuro() { return solid(0x30343a, 0.62, 0.45) },
  get espuma() { return solid(0xf4eddd, 0.98) },
  jorro() {
    // AdditiveBlending nao: chope e liquido, nao luz. O que ele precisa e
    // atravessar (transparente) sem escrever profundidade — assim a parede do
    // fundo da coluna aparece atras da da frente, e e essa segunda parede que
    // faz a coluna ter volume.
    const t = jorroTex()
    t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 2.2)
    return stdMat('barril-jorro-mat', {
      map: t, color: 0xffd98a, emissive: 0xc07a18, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.90, roughness: 0.12, depthWrite: false,
      side: THREE.DoubleSide,
    })
  },
}

// --- o barril ---------------------------------------------------------------

/**
 * BARRIL DEITADO, eixo em X, centro na origem.
 *
 * O perfil e uma barriga de verdade: raio no tampo, raio maximo no meio, e a
 * curva entre os dois. Um cilindro reto com aros e um TAMBOR, nao um barril —
 * a barriga e a peca inteira.
 *
 * @param comp  comprimento (m)
 * @param raio  raio da barriga
 * @param cor   tinta da madeira
 */
export function barrilDeMadeira(comp = 0.62, raio = 0.235, cor = 0xbfa079) {
  const g = new THREE.Group()
  g.name = 'barril'
  const rTampo = raio * 0.80
  const meio = comp / 2

  // corpo: lathe em torno de Y, depois deitado. A barriga e uma cossenoide.
  const pts = []
  const passos = 9
  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const y = -meio + comp * t
    const r = rTampo + (raio - rTampo) * Math.sin(Math.PI * t)
    pts.push(new THREE.Vector2(r, y))
  }
  const corpo = new THREE.Mesh(new THREE.LatheGeometry(pts, 22), M.madeira)
  if (cor !== 0xbfa079) corpo.material = stdMat('barril-madeira:' + cor, {
    map: aduelasTex(), color: cor, roughness: 0.88,
  })
  corpo.rotation.z = Math.PI / 2
  corpo.castShadow = true
  corpo.receiveShadow = true
  g.add(corpo)

  // TAMPOS, um pouco afundados (o tampo de barril entra numa canaleta).
  //
  // Material LISO e nao o das aduelas: a tampa de um cilindro recebe UV em
  // disco, e a textura de listras verticais das aduelas mapeada em disco vira um
  // LEQUE — de frente, o tampo do barril parecia um alvo de dardo trancado. O
  // tampo de barril de verdade e tabua reta, e reta e o que ele e agora.
  for (const s of [-1, 1]) {
    const t = cyl(rTampo * 0.97, rTampo * 0.97, 0.026, M.tampoLiso, 20)
    t.rotation.z = Math.PI / 2
    t.position.x = s * (meio - 0.016)
    t.castShadow = true
    g.add(t)
  }

  // ARANHAS DE FERRO: 4 aros, os dois de fora mais largos. Sao eles que dizem
  // "barril" de longe — a barriga sozinha ainda podia ser uma boia.
  const aros = [[meio - 0.055, 0.030], [meio * 0.42, 0.020]]
  for (const [dx, larg] of aros) {
    for (const s of [-1, 1]) {
      const r = rTampo + (raio - rTampo) * Math.sin(Math.PI * ((s * dx + meio) / comp))
      const a = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.004, larg * 0.32, 6, 22), Math.abs(dx) > meio * 0.5 ? M.aro : M.aroFerrugem,
      )
      a.rotation.y = Math.PI / 2
      a.position.x = s * dx
      a.scale.z = 1.5
      a.castShadow = true
      g.add(a)
    }
  }

  // batoque na barriga (por onde ele foi enchido)
  const bat = cyl(0.032, 0.036, 0.030, M.madeiraTampo, 10)
  bat.position.set(0, raio - 0.006, 0)
  g.add(bat)

  return g
}

// --- a torneira --------------------------------------------------------------

const _v = new THREE.Vector3()

/**
 * TORNEIRA DE CHOPE, montada de pe: o corpo fica em y = 0 e o bico aponta pra
 * baixo. Quem posiciona e quem constroi a chopeira.
 *
 * A ALAVANCA E O GESTO. Ela nao vai de fechada pra aberta em linha reta: sai
 * rapido, PASSA do ponto e volta (mola). Sao 90 ms de exagero e e a diferenca
 * inteira entre "a torneira girou" e "eu abri a torneira" — a mesma conta que o
 * saque de player/mao.js usa pra a garrafa entrar na tela.
 *
 * @param opts.cor      cor do liquido (chope claro, escuro, etc.)
 * @param opts.alturaJorro  quanto o jorro cai ate a bandeja (m)
 * @param opts.knob     cor do castao da alavanca
 */
export function criarTorneira(opts = {}) {
  const cor = opts.cor !== undefined ? opts.cor : 0xd8901c
  const queda = opts.alturaJorro !== undefined ? opts.alturaJorro : 0.30
  const corKnob = opts.knob !== undefined ? opts.knob : 0x2f1d12

  const g = new THREE.Group()
  g.name = 'torneira'

  // --- corpo de latao -------------------------------------------------------
  //
  // AS MEDIDAS SAO MAGRAS DE PROPOSITO. A primeira versao tinha 2,1 cm de raio
  // na coluna e um bico de 6 cm; fotografada de frente, a torneira lia como um
  // POSTE AMARELO com uma bola em cima — o bico apontava pro observador e
  // desaparecia dentro da silhueta da propria coluna. O que resolve e afinar o
  // corpo e ESTICAR O BICO PRA FRENTE (8,5 cm em vez de 6): assim a peca tem um
  // L, e L le como torneira de qualquer angulo.
  const base = cyl(0.022, 0.026, 0.042, M.latao, 14)
  base.position.y = 0.021
  base.castShadow = true
  g.add(base)
  const coluna = cyl(0.0145, 0.0165, 0.122, M.latao, 14)
  coluna.position.y = 0.100
  coluna.castShadow = true
  g.add(coluna)
  // cotovelo: a curva que joga o bico pra frente
  const cotovelo = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.0145, 8, 16, Math.PI / 2), M.latao)
  cotovelo.rotation.set(Math.PI / 2, 0, 0)
  cotovelo.position.set(0, 0.160, 0.040)
  cotovelo.castShadow = true
  g.add(cotovelo)
  // bico apontando pra baixo, com o anel de saida
  const bico = cyl(0.0115, 0.0140, 0.068, M.latao, 12)
  bico.position.set(0, 0.126, 0.085)
  bico.castShadow = true
  g.add(bico)
  const anel = cyl(0.0150, 0.0150, 0.007, M.latacoFosco, 12)
  anel.position.set(0, 0.095, 0.085)
  g.add(anel)

  // ponto EXATO de onde o chope sai: e daqui que nasce a coluna e e aqui que o
  // copo do jogador tem que estar
  const BICO = new THREE.Vector3(0, 0.0915, 0.085)

  // --- alavanca -------------------------------------------------------------
  const pivo = new THREE.Group()
  pivo.position.set(0, 0.192, 0.012)
  g.add(pivo)
  const haste = cyl(0.0068, 0.0086, 0.126, M.latao, 10)
  haste.position.y = 0.063
  haste.castShadow = true
  pivo.add(haste)
  // castao alto e conico (cabo de bomba de chope), nao uma bola: e ele que da
  // a leitura de "puxar" e e nele que o olho pousa na hora de abrir
  const castao = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0, 0.0), new THREE.Vector2(0.020, 0.008), new THREE.Vector2(0.023, 0.030),
    new THREE.Vector2(0.019, 0.060), new THREE.Vector2(0.021, 0.076), new THREE.Vector2(0.0, 0.086),
  ], 12), solid(corKnob, 0.62, 0.05))
  castao.position.y = 0.124
  castao.castShadow = true
  pivo.add(castao)
  const colar = cyl(0.0125, 0.0125, 0.010, M.latacoFosco, 10)
  colar.position.y = 0.118
  pivo.add(colar)

  // --- o jorro ---------------------------------------------------------------
  // Um cilindro so. O `1` de altura e proposital: a escala em Y e a que define o
  // comprimento a cada quadro, e assim a geometria nunca precisa ser refeita.
  const matJorro = M.jorro()
  const jorro = new THREE.Mesh(new THREE.CylinderGeometry(0.0068, 0.0100, 1, 10, 1, true), matJorro)
  jorro.visible = false
  jorro.castShadow = false
  jorro.position.z = BICO.z
  g.add(jorro)
  // a cabeca da coluna: o bolo mais gordo que desce na frente do liquido
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 10, 8), matJorro)
  cabeca.visible = false
  cabeca.castShadow = false
  cabeca.scale.set(1, 1.5, 1)
  cabeca.position.z = BICO.z
  g.add(cabeca)

  // espuma no ponto de impacto + a poca que ela deixa
  const respingo = new THREE.Mesh(new THREE.SphereGeometry(0.030, 12, 8, 0, Math.PI * 2, 0, 1.3), M.espuma)
  respingo.scale.set(1, 0.34, 1)
  respingo.visible = false
  respingo.castShadow = false
  respingo.position.set(0, BICO.y - queda + 0.004, BICO.z)
  g.add(respingo)

  // PINGOS DE DEPOIS. Quatro esferinhas que caem uma a uma quando fecha. E o
  // detalhe que faz a torneira parecer molhada por dentro.
  const NP = 4
  const pingos = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0055, 6, 5), matJorro, NP)
  pingos.visible = false
  pingos.castShadow = false
  pingos.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  g.add(pingos)
  const estadoPingo = []
  for (let i = 0; i < NP; i++) estadoPingo.push({ ativo: false, y: 0, v: 0, atraso: 0 })
  const _d = new THREE.Object3D()

  // --- estado ----------------------------------------------------------------
  let aberta = false
  let alav = 0            // 0 fechada, 1 aberta (com mola)
  let alavVel = 0
  let pe = 0              // ate onde o pe da coluna ja desceu (m)
  let topo = 0            // de onde a coluna comeca (m abaixo do bico)
  let espuma = 0
  let t = 0
  // CORTE: quando ha um copo embaixo, a coluna acaba DENTRO dele em vez de
  // seguir ate a bandeja. E o detalhe que separa "o chope cai atras do copo" de
  // "o chope cai no copo" — sem ele o jogador ve a coluna atravessar o vidro e
  // continuar batendo na grelha. `pe` (a fisica) nao muda: so o que se desenha.
  let corte = 0
  const CORTE_LEN = 0.115

  const ANG_ABERTA = -1.18        // ~68 graus pra frente
  const V_QUEDA = 2.2             // m/s, a queda real nos primeiros 30 cm
  const MOLA_K = 210              // rigidez da mola da alavanca
  const MOLA_C = 19               // amortecimento: 2*sqrt(K) daria critico

  function escreverPingos() {
    let vivo = false
    for (let i = 0; i < NP; i++) {
      const p = estadoPingo[i]
      if (!p.ativo) { _d.position.set(0, -99, 0); _d.scale.setScalar(0.0001) } else {
        vivo = true
        _d.position.set(0, p.y, BICO.z)
        _d.scale.set(1, 1 + Math.min(1.4, p.v * 0.5), 1)
      }
      _d.updateMatrix()
      pingos.setMatrixAt(i, _d.matrix)
    }
    pingos.instanceMatrix.needsUpdate = true
    pingos.visible = vivo
  }

  const api = {
    grupo: g,
    /** Onde o chope sai, em coordenadas LOCAIS do grupo da torneira. */
    bicoLocal: BICO.clone(),
    get aberta() { return aberta },
    /**
     * true quando a coluna JA CHEGOU EMBAIXO — nao quando a alavanca virou.
     *
     * A diferenca sao ~200 ms (60 ms de alavanca mais 136 ms de queda em 30 cm)
     * e ela importa: e este getter que a adega usa pra decidir se o copo enche,
     * e um copo que comeca a encher no quadro em que a alavanca vira enche antes
     * de existir chope na tela.
     */
    get jorrando() { return aberta && pe >= queda - 0.012 },

    /** Poe (ou tira) um copo embaixo: a coluna passa a acabar dentro dele. */
    cortar(v) { corte = v ? 1 : 0 },
    cor,

    /** Ponto do bico EM COORDENADAS DE MUNDO. */
    bicoMundo(alvo) {
      g.updateWorldMatrix(true, false)
      return (alvo || _v.clone()).copy(BICO).applyMatrix4(g.matrixWorld)
    },

    abrir() {
      if (aberta) return false
      aberta = true
      alavVel = 9.5           // o empurrao inicial: e ele que faz passar do ponto
      pe = 0
      topo = 0
      return true
    },

    fechar() {
      if (!aberta) return false
      aberta = false
      alavVel = -7.0
      // solta os pingos, escalonados
      for (let i = 0; i < NP; i++) {
        estadoPingo[i].ativo = true
        estadoPingo[i].y = BICO.y
        estadoPingo[i].v = 0
        estadoPingo[i].atraso = 0.06 + i * 0.11 + Math.random() * 0.05
      }
      return true
    },

    alternar() { return aberta ? (api.fechar(), false) : (api.abrir(), true) },

    atualizar(dt) {
      const d = Math.min(dt || 0, 0.05)
      t += d

      // --- a mola da alavanca ------------------------------------------------
      const alvo = aberta ? 1 : 0
      alavVel += (-(alav - alvo) * MOLA_K - alavVel * MOLA_C) * d
      alav += alavVel * d
      pivo.rotation.x = ANG_ABERTA * alav

      // --- a coluna -----------------------------------------------------------
      if (aberta) {
        topo = 0
        // o liquido so comeca a sair quando a alavanca ja andou um terco
        if (alav > 0.33) pe = Math.min(queda, pe + V_QUEDA * d)
      } else if (pe > topo) {
        // fechando: o TOPO e que sobe. O rabo se desprende do bico e cai.
        topo = Math.min(queda, topo + V_QUEDA * d)
      }

      // com copo embaixo, a coluna acaba no copo (ver `corte` la em cima)
      const peVis = corte ? Math.min(pe, CORTE_LEN) : pe
      const comp = Math.max(0, peVis - topo)
      const mostrando = comp > 0.004
      jorro.visible = mostrando
      cabeca.visible = mostrando && !corte && pe < queda - 0.004
      if (mostrando) {
        jorro.scale.y = comp
        jorro.position.y = BICO.y - topo - comp / 2
        // a coluna afina com a queda (o liquido acelera), e treme de leve
        const tremor = 1 + Math.sin(t * 26) * 0.05
        jorro.scale.x = jorro.scale.z = tremor
        matJorro.map.offset.y = (matJorro.map.offset.y - d * 3.2) % 1
        cabeca.position.y = BICO.y - pe
        cabeca.scale.set(1.15, 1.7, 1.15)
      }

      // --- espuma no impacto ---------------------------------------------------
      const batendo = aberta && !corte && pe >= queda - 0.006
      espuma += ((batendo ? 1 : 0) - espuma) * (1 - Math.exp(-(batendo ? 7 : 2.2) * d))
      respingo.visible = espuma > 0.03
      if (respingo.visible) {
        const s = 0.55 + espuma * 0.55 + Math.sin(t * 17) * 0.05 * espuma
        respingo.scale.set(s, 0.30 + espuma * 0.16, s)
      }

      // --- pingos --------------------------------------------------------------
      let algum = false
      for (let i = 0; i < NP; i++) {
        const p = estadoPingo[i]
        if (!p.ativo) continue
        algum = true
        if (p.atraso > 0) { p.atraso -= d; continue }
        p.v += 9.8 * d
        p.y -= p.v * d
        if (p.y <= BICO.y - queda) p.ativo = false
      }
      if (algum || pingos.visible) escreverPingos()
    },
  }

  return api
}

// --- a chopeira inteira ------------------------------------------------------

/**
 * CHOPEIRA: os barris no cavalete, os canos de cobre e a fileira de torneiras
 * sobre a bandeja de escoamento.
 *
 * A geometria em si e simples; o que este montador resolve e o ALINHAMENTO, e
 * ele so tem uma regra: a torneira `i` fica no MESMO x do barril `i`, e a
 * bandeja passa por baixo de todas. Errar isso e o tipo de coisa que so aparece
 * quando o jogador poe o copo embaixo e o chope cai ao lado.
 *
 * Devolve as torneiras pra quem quiser abrir e fechar; a adega pendura um ponto
 * de interacao em cada uma.
 *
 * @param opts.torneiras  [{ nome, cor, knob }]
 * @param opts.larg       largura do balcao (m)
 * @param opts.alturaBalcao  y do tampo
 */
export function criarChopeira(opts = {}) {
  const fichas = opts.torneiras || [{ nome: 'Chope', cor: 0xd8901c, knob: 0x2f1d12 }]
  const larg = opts.larg !== undefined ? opts.larg : 2.30
  const yTampo = opts.alturaBalcao !== undefined ? opts.alturaBalcao : 1.02

  const g = new THREE.Group()
  g.name = 'chopeira'
  const n = fichas.length
  const torneiras = []

  // --- bandeja de escoamento: a grelha de latao onde o chope cai ------------
  const yBandeja = yTampo + 0.012
  const bandeja = box(larg * 0.86, 0.024, 0.20, M.inox, 0, yBandeja, 0)
  bandeja.receiveShadow = true
  g.add(bandeja)
  // a grelha: 13 barras. InstancedMesh porque sao 13 e sao iguais.
  // 15 barras de FERRO e nao de latao: com latao polido direto embaixo da luz do
  // balcao a bandeja virava uma chapa amarela acesa, e o que ela e na vida real
  // e uma grelha escura onde o chope escorre.
  const nb = 15
  const grelha = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.010, 0.009, 0.176), solid(0x3f4348, 0.66, 0.42), nb,
  )
  const d0 = new THREE.Object3D()
  for (let i = 0; i < nb; i++) {
    d0.position.set((i / (nb - 1) - 0.5) * larg * 0.80, yBandeja + 0.017, 0)
    d0.updateMatrix()
    grelha.setMatrixAt(i, d0.matrix)
  }
  grelha.instanceMatrix.needsUpdate = true
  grelha.castShadow = false
  g.add(grelha)
  // poca escura embaixo da grelha: chope derramado que ninguem limpa
  const poca = box(larg * 0.80, 0.002, 0.16, solid(0x3a2410, 0.35, 0.1), 0, yBandeja + 0.014, 0)
  poca.castShadow = false
  g.add(poca)

  // --- cavalete dos barris ---------------------------------------------------
  const yBerco = yTampo + 0.26
  const raioB = 0.215
  const yEixo = yBerco + raioB * 0.72

  // --- os barris + as torneiras ---------------------------------------------
  const passo = n > 1 ? (larg * 0.74) / (n - 1) : 0
  for (let i = 0; i < n; i++) {
    const f = fichas[i]
    const x = n > 1 ? -larg * 0.37 + passo * i : 0

    // barril deitado ATRAS do balcao, no cavalete
    const b = barrilDeMadeira(0.56, raioB, f.madeira || 0xbfa079)
    b.rotation.y = Math.PI / 2         // eixo em Z: o tampo olha pro cliente
    b.position.set(x, yEixo, -0.42)
    g.add(b)

    // berco de madeira sob cada barril
    for (const s of [-1, 1]) {
      const c = box(0.30, 0.055, 0.075, solid(0x53341d, 0.9), x, yBerco - 0.02, -0.42 + s * 0.19)
      c.castShadow = true
      g.add(c)
      const v = box(0.055, 0.26, 0.075, solid(0x53341d, 0.9), x, yBerco - 0.17, -0.42 + s * 0.19)
      v.castShadow = true
      g.add(v)
    }

    // cano de cobre: sai do tampo do barril, cruza por cima do balcao e desce
    // na torneira. Sao dois trechos e uma curva.
    const cano = cyl(0.010, 0.010, 0.34, M.latao, 8)
    cano.rotation.x = Math.PI / 2
    cano.position.set(x, yEixo - 0.06, -0.22)
    g.add(cano)
    const curva = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.010, 6, 12, Math.PI / 2), M.latao)
    curva.rotation.set(0, Math.PI / 2, 0)
    curva.position.set(x, yEixo - 0.105, -0.05)
    g.add(curva)
    const desce = cyl(0.010, 0.010, Math.max(0.02, yEixo - 0.105 - (yTampo + 0.30)), M.latao, 8)
    desce.position.set(x, (yEixo - 0.105 + yTampo + 0.30) / 2, -0.005)
    g.add(desce)

    // A TORNEIRA. Ela mora numa coluna de latao presa ao tampo, e a queda ate a
    // grelha e o que o jorro precisa saber.
    const yTorneira = yTampo + 0.30
    const queda = yTorneira + 0.0965 - (yBandeja + 0.022)
    const t = criarTorneira({ cor: f.cor, knob: f.knob, alturaJorro: queda })
    t.grupo.position.set(x, yTorneira, 0)
    t.nome = f.nome || 'Chope'
    t.indice = i
    g.add(t.grupo)
    torneiras.push(t)

    // COLUNA DE SUSTENTACAO, em ferro escuro e nao em latao.
    //
    // Sendo latao, ela e a torneira viravam uma peca amarela so de 40 cm — e o
    // que se via era um poste, nao uma torneira. Com o pe escuro o latao fica
    // sendo SO a torneira, que e a coisa com que se interage.
    const susten = cyl(0.019, 0.026, 0.30, M.ferroEscuro, 12)
    susten.position.set(x, yTampo + 0.15, 0)
    susten.castShadow = true
    g.add(susten)
    const flange = cyl(0.045, 0.052, 0.018, M.ferroEscuro, 14)
    flange.position.set(x, yTampo + 0.014, 0)
    g.add(flange)
  }

  function atualizar(dt) {
    for (let i = 0; i < torneiras.length; i++) torneiras[i].atualizar(dt)
  }

  return { grupo: g, torneiras, atualizar, alturaTampo: yTampo }
}

export default criarChopeira
