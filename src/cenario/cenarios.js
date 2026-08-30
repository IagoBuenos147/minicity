// ---------------------------------------------------------------------------
// src/cenario/cenarios.js — mais de um MUNDO na mesma partida.
//
// O jogo nasceu com uma cidade so, construida direto no main. Agora ha duas (a
// cidade do cassino e a Quadra Hudson, em Paracatu-MG) e uma tecla que troca
// entre elas. O problema de verdade nao e desenhar a segunda: e DESLIGAR a
// primeira por inteiro.
//
// Um cenario deixa marca em SEIS lugares, e esquecer um so ja quebra o jogo:
//
//   1. a cena       — os Object3D. Fácil: `visible = false`.
//   2. os colisores — chapas XZ. Invisiveis. Esquecer aqui = jogador batendo
//                     numa parede que ninguem ve. E o pior bug possivel.
//   3. os occluders — as caixas que empurram a CAMERA. Esquecer aqui = a camera
//                     pulando por cima de predios que sumiram.
//   4. os interativos — o prompt "E". Esquecer aqui = "Falar com o barbeiro"
//                     no meio de uma rua vazia.
//   5. os updates   — funcoes por quadro. Esquecer aqui = pagar o custo do
//                     mundo escondido pra sempre.
//   6. o chao       — groundY. Esquecer aqui = andar enterrado ou voando.
//
// Por isso este modulo nao pede pra ninguem "lembrar de registrar". Ele GRAVA:
// durante `gravar(id, fn)` as portas de entrada do mundo (collision.add,
// collision.addOccluder, interaction.add, scene.add, game.addColliders...)
// ficam grampeadas, e tudo que passar por elas entra na conta daquele cenario —
// inclusive o que foi criado bem fundo, dentro de um buildCity que este arquivo
// nunca vai ler. A gravacao dura o tempo da funcao e devolve tudo no lugar,
// inclusive se a construcao estourar (o `finally` nao e enfeite).
//
// O que NAO entra num cenario: o jogador, o HUD, o clima, a luz do sol, os
// veiculos e o revolver. Eles atravessam os mundos junto com quem joga.
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {THREE.Scene}  opts.scene
 * @param {object}       opts.colisao      systems/collision.js
 * @param {object}       opts.interacao    systems/interaction.js
 * @param {object}       opts.game         o objeto game do main
 * @param {object}       opts.player
 * @param {object}       opts.hud
 * @param {object}       opts.lighting
 * @param {Function[]}   opts.moduleUpdates  a lista do laco principal
 * @param {Function[]}   opts.propUpdates    idem
 */
export function criarCenarios({
  scene, colisao, interacao, game, player, hud, lighting,
  moduleUpdates = [], propUpdates = [],
} = {}) {
  const registros = new Map()
  const ordem = []
  let atual = null
  let gravando = null
  let escondido = false

  function novoRegistro(id, opcoes) {
    return {
      id,
      nome: (opcoes && opcoes.nome) || id,
      construir: opcoes && opcoes.construir,
      spawn: (opcoes && opcoes.spawn) || { x: 0, z: 0, yaw: 0 },
      groundY: (opcoes && opcoes.groundY) || null,
      // o que a gravacao capturou
      grupos: [],
      colisores: [],
      occluders: [],
      interativos: [],
      updates: [],
      luzes: [],
      materiaisLuz: [],
      construido: false,
      // O ESTADO DE CADA COISA ANTES DE APAGAR.
      //
      // Nao da pra "religar tudo" ao voltar: o mundo tem peca que nasce ou fica
      // DESLIGADA de proposito. A luz do poste fica invisivel de dia. O colisor
      // do vao da porta da casa velha fica `ativo = false` enquanto a porta
      // esta ABERTA — religar ele no cego poria uma parede invisivel no meio de
      // uma porta escancarada, e o jogador nao teria como saber por que nao
      // passa. Entao esconder GUARDA o estado, e mostrar DEVOLVE o que estava.
      antes: new WeakMap(),
    }
  }

  // --- a gravacao ----------------------------------------------------------
  //
  // Grampeia as portas de entrada do mundo enquanto `fn` roda. Nao e elegante,
  // e e de proposito: a alternativa era pedir pra cada builder devolver uma
  // lista completa do que criou, e o primeiro builder que esquecesse metade da
  // lista viraria um bug invisivel meses depois.
  let pilha = null

  /**
   * Liga os grampos. Existe em duas formas porque o main constroi a cidade em
   * DECLARACOES DE TOPO (`const city = buildCity(game)`, e o `city` e usado
   * cinquenta linhas abaixo): embrulhar aquilo num callback obrigaria a mover
   * meia centena de linhas pra dentro de uma funcao e a devolver dez variaveis.
   * `abrirGravacao`/`fecharGravacao` gravam sem mexer no formato do arquivo.
   */
  function abrirGravacao(id) {
    const reg = registros.get(id)
    if (!reg) throw new Error('cenario nao registrado: ' + id)
    const anterior = gravando
    gravando = reg

    const addOrig = colisao.add
    const occOrig = colisao.addOccluder
    const intOrig = interacao.add
    const cenaOrig = scene.add

    colisao.add = function (lista) {
      const feitas = addOrig.call(colisao, lista)
      if (gravando && feitas) for (const b of feitas) gravando.colisores.push(b)
      return feitas
    }
    colisao.addOccluder = function (a, b, c, d, e, f, g) {
      const o = occOrig.call(colisao, a, b, c, d, e, f, g)
      if (gravando && o) gravando.occluders.push(o)
      return o
    }
    interacao.add = function (lista) {
      const feitos = intOrig.call(interacao, lista)
      if (gravando && feitos) for (const it of feitos) gravando.interativos.push(it)
      return feitos
    }
    scene.add = function (...objs) {
      const r = cenaOrig.apply(scene, objs)
      if (gravando) for (const o of objs) if (o) gravando.grupos.push(o)
      return r
    }

    pilha = {
      reg, anterior, addOrig, occOrig, intOrig, cenaOrig, pai: pilha,
      // as duas listas do laco: guarda o tamanho e fica com o que entrou
      mU: moduleUpdates.length,
      pU: propUpdates.length,
    }
    return reg
  }

  /** Desliga os grampos e fecha a conta do cenario que estava gravando. */
  function fecharGravacao() {
    const p = pilha
    if (!p) return null
    colisao.add = p.addOrig
    colisao.addOccluder = p.occOrig
    interacao.add = p.intOrig
    scene.add = p.cenaOrig
    gravando = p.anterior
    pilha = p.pai

    // As funcoes de update ficam ONDE ESTAO, embrulhadas por um porteiro de uma
    // linha. Tirar e recolocar na lista mudaria a ORDEM das atualizacoes, e
    // ordem de update e coisa que quebra em silencio: o semaforo que pisca
    // antes do relogio andar fica um quadro atrasado pra sempre.
    envolver(moduleUpdates, p.mU, p.reg)
    envolver(propUpdates, p.pU, p.reg)
    p.reg.construido = true
    return p.reg
  }

  /** A forma com callback, pros cenarios construidos sob demanda. */
  function gravar(id, fn) {
    const reg = abrirGravacao(id)
    try {
      fn(reg)
    } finally {
      fecharGravacao()
    }
    return reg
  }

  /**
   * Troca cada update que entrou na lista a partir de `desde` por um porteiro:
   * a funcao original so roda com o cenario aceso. Um booleano por chamada e o
   * preco de nao pagar a cidade inteira enquanto se anda em Paracatu.
   */
  function envolver(lista, desde, reg) {
    for (let i = desde; i < lista.length; i++) {
      const original = lista[i]
      if (typeof original !== 'function') continue
      const porteiro = (a, b, c) => { if (reg.ligado) original(a, b, c) }
      lista[i] = porteiro
      reg.updates.push(porteiro)
    }
  }

  /**
   * Liga/desliga tudo que pertence a um cenario, DEVOLVENDO cada coisa ao
   * estado em que ela estava — e nao ligando tudo no cego. Ver o comentario de
   * `antes` em novoRegistro().
   */
  function acender(reg, ligado) {
    const guardar = (o, campo) => {
      if (ligado) {
        const v = reg.antes.get(o)
        o[campo] = v === undefined ? true : v
      } else {
        reg.antes.set(o, o[campo])
        o[campo] = false
      }
    }
    for (const g of reg.grupos) guardar(g, 'visible')
    for (const b of reg.colisores) guardar(b, 'ativo')
    for (const o of reg.occluders) guardar(o, 'ativo')
    for (const it of reg.interativos) guardar(it, 'enabled')
    reg.ligado = ligado
  }

  const api = {
    get atual() { return atual ? atual.id : null },
    get escondido() { return escondido },
    get ids() { return ordem.slice() },
    nomeDe(id) { const r = registros.get(id); return r ? r.nome : id },

    /**
     * Declara um cenario. `construir` so roda na PRIMEIRA vez que ele entra em
     * cena — a Quadra Hudson tem umas 30 casas, e pagar isso no boot de quem
     * nunca vai apertar a tecla seria cobrar de todo mundo pelo que poucos usam.
     */
    registrar(id, opcoes) {
      if (registros.has(id)) return registros.get(id)
      const reg = novoRegistro(id, opcoes)
      registros.set(id, reg)
      ordem.push(id)
      return reg
    },

    /** Grava a construcao de um cenario que o main monta na mao (a cidade). */
    gravar,
    abrirGravacao,
    fecharGravacao,

    /**
     * Bota `id` em cena e tira o resto. Devolve false quando o cenario nao
     * existe — quem chama e uma tecla, e tecla nao pode derrubar o jogo.
     */
    mostrar(id, opcoes = {}) {
      const reg = registros.get(id)
      if (!reg) return false
      if (atual === reg && reg.construido && !escondido) return true

      if (!reg.construido && typeof reg.construir === 'function') {
        if (hud) hud.toast('Montando ' + reg.nome + '...', 1200)
        // O construtor recebe o proprio registro: e por ele que um cenario
        // entrega as luzes de poste (que o ciclo dia/noite precisa) e o seu
        // amostrador de chao.
        gravar(id, (r) => {
          const saida = reg.construir(game, r) || {}
          if (saida.groundY) r.groundY = saida.groundY
          if (saida.spawn) r.spawn = saida.spawn
          if (Array.isArray(saida.lampLights)) r.luzes = saida.lampLights
          if (Array.isArray(saida.lampMaterials)) r.materiaisLuz = saida.lampMaterials
          r.saida = saida
        })
      }

      for (const outro of registros.values()) if (outro !== reg) acender(outro, false)
      acender(reg, true)
      atual = reg
      escondido = false

      // o chao. Sem isto o jogador anda na altura do mundo que saiu de cena.
      const chao = reg.groundY || (() => 0)
      game.groundY = chao
      if (player && typeof player.setGroundSampler === 'function') player.setGroundSampler(chao)

      // a iluminacao publica: cada cenario tem os seus postes
      if (lighting) {
        const luzes = reg.luzes || []
        const mats = reg.materiaisLuz || []
        // CADA MATERIAL VOLTA PRO BRILHO DELE, e nao todos pro mesmo 1.6.
        //
        // O 1.6 fixo funcionava quando "material de lampada" queria dizer uma
        // coisa so: a lente do poste. Hoje o poste tem quatro pecas acesas com
        // brilhos calibrados entre si — lente 2.6, halo 2.2, poca 1.9 e o facho
        // do cone 1.35 (ver props.makeStreetLight) — e achatar as quatro no
        // mesmo numero desmonta o efeito: o facho, que e o mais fraco de todos,
        // subia pra perto da lampada.
        //
        // O valor de origem ja estava guardado: claimLampMat() de city.js grava
        // `userData.baseEmissive` justamente na primeira vez que ve o material.
        // O 1.6 continua aqui como padrao pra material que veio de outro lugar
        // e nunca passou por la.
        lighting.onNight = (noite) => {
          for (const l of luzes) l.visible = noite
          for (const m of mats) {
            const base = (m.userData && m.userData.baseEmissive !== undefined)
              ? m.userData.baseEmissive : 1.6
            // 0.075 e nao zero: de dia a lente continua sendo uma peca clara
            // dentro da luminaria, so que apagada. Zerar deixa um buraco preto.
            m.emissiveIntensity = noite ? base : base * 0.075
          }
        }
        if (typeof lighting.isNight === 'boolean') lighting.onNight(lighting.isNight)
      }

      if (opcoes.teleportar !== false && player && typeof player.teleport === 'function') {
        const s = reg.spawn || { x: 0, z: 0, yaw: 0 }
        player.teleport(s.x, s.z, s.yaw || 0)
      }
      return true
    },

    /** A tecla de trocar: anda em circulo pela lista de cenarios. */
    proximo() {
      if (!ordem.length) return null
      const i = atual ? ordem.indexOf(atual.id) : -1
      const prox = ordem[(i + 1) % ordem.length]
      api.mostrar(prox)
      if (hud) hud.toast(api.nomeDe(prox), 2200)
      return prox
    },

    /**
     * A tecla de SUMIR: apaga o cenario inteiro e deixa so o chao e o ceu.
     * Nao destroi nada — voltar e instantaneo, e e por isso que da pra usar
     * isso pra tirar foto de personagem no vazio.
     */
    sumir(v) {
      const novo = v === undefined ? !escondido : !!v
      if (novo === escondido) return escondido
      escondido = novo
      if (atual) acender(atual, !escondido)
      if (hud) hud.toast(escondido ? 'Cenario escondido' : api.nomeDe(atual && atual.id), 1800)
      return escondido
    },

    /** Pro save e pros testes. */
    registroDe(id) { return registros.get(id) || null },
  }

  return api
}

export default criarCenarios
