// ---------------------------------------------------------------------------
// src/save/save.js — cinco slots de jogo salvo.
//
// O QUE ENTRA. Tudo que e do PERSONAGEM e do ESTABELECIMENTO dele: nome,
// aparencia, carteira, onde ele parou, o que ja fez no tutorial, a hora do dia,
// o que destravou, a mochila e a mobilia instalada na casa.
//
// O QUE NAO ENTRA, e por que:
//  - OPCOES (volume, sombras, sensibilidade). Sao da MAQUINA, nao do
//    personagem. Carregar um save nao pode mudar a sensibilidade do mouse de
//    quem joga — isso e a definicao de comportamento errado.
//  - O MUNDO COMPARTILHADO (NPCs, veiculos, objetos). O dono deles e
//    servidor/sala.js. Uma segunda verdade sobre eles e bug garantido no coop.
//
// AS QUATRO CORES CRUAS. A aparencia tem 20 indices de catalogo E quatro cores
// resolvidas (skin, shirt, pants, shoes). As 20 viajam na rede; as quatro NAO
// CABEM no protocolo (o comentario de CAMPOS_APARENCIA diz: "nunca cor crua,
// cor RGB nao cabe num byte"). O save e o unico lugar do jogo onde elas
// sobrevivem a um F5.
//
// ESQUEMA VERSIONADO. `esquema` sobe quando o formato muda de um jeito que o
// leitor velho nao entende. Ler um slot de esquema mais novo devolve null em
// silencio, e o card mostra "versao mais nova" em vez de carregar lixo.
// ---------------------------------------------------------------------------

const CHAVE = 'mcrp-saves'
export const SLOTS = 5
export const ESQUEMA = 1

/** A versao do jogo que aparece no card. Sobe junto com o package.json. */
export const VERSAO_JOGO = 'v0.7.0'

function inteiro(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) ? n : 0
}

function lerTudo() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return []
    const o = JSON.parse(cru)
    return Array.isArray(o) ? o : []
  } catch (err) { void err; return [] }
}

function gravarTudo(lista) {
  try { localStorage.setItem(CHAVE, JSON.stringify(lista)) } catch (err) { void err }
}

/** "Hoje", "Ha 3 dias", "Ha mais de um ano" — o texto do card. */
export function quando(ms, agora) {
  const t = Number(ms)
  if (!Number.isFinite(t) || t <= 0) return '—'
  const d = Math.floor(((agora || 0) - t) / 86400000)
  if (d <= 0) return 'Hoje'
  if (d === 1) return 'Ontem'
  if (d < 30) return 'Ha ' + d + ' dias'
  if (d < 365) return 'Ha ' + Math.floor(d / 30) + ' meses'
  return 'Ha mais de um ano'
}

/** "3h 12min" — o tempo de jogo do card. */
export function duracao(segundos) {
  const s = Math.max(0, inteiro(segundos))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (!h && !m) return 'menos de 1 min'
  return (h ? h + 'h ' : '') + m + 'min'
}

/**
 * O gerente dos slots.
 *
 * `fontes` e um objeto de funcoes que sabem LER e ESCREVER cada pedaco do jogo.
 * Elas vem do main, e nao de imports: o save nao pode conhecer o controlador do
 * jogador, o tutorial e o clima — se conhecesse, cada um deles teria dois donos.
 */
export function criarSave(fontes = {}) {
  let slotAtivo = -1
  let segundos = 0
  let pendente = 0
  // Ligado durante carregar(). Escrever o save de volta no jogo dispara eventos
  // de verdade (pegar o revolver conclui missao, que pede gravacao), e gravar
  // no meio de um carregamento fotografaria um jogo pela metade.
  let carregando = false
  const ouvintes = []

  function avisar() {
    for (let i = 0; i < ouvintes.length; i++) {
      try { ouvintes[i](api) } catch (err) { void err }
    }
  }

  /** A foto do jogo agora, no formato do arquivo. */
  function montar(nome, criadoEm) {
    const f = fontes
    const carteira = f.carteira ? f.carteira.serializar() : null
    const patrimonio = carteira ? (carteira.ouro + carteira.banco + carteira.fichas) : 0
    return {
      esquema: ESQUEMA,
      versaoJogo: VERSAO_JOGO,
      nome: String(nome || (f.lerNome && f.lerNome()) || 'Jogador'),
      criadoEm: criadoEm || Date.now(),
      jogadoEm: Date.now(),
      segundos: Math.round(segundos),
      patrimonio,
      modo: (f.lerModo && f.lerModo()) || 'solo',
      // A aparencia sai INTEIRA (20 indices + as 4 cores cruas). Nao grava os
      // apelidos em ingles (hair/eyes/brows/mouth/hairColor) de proposito: na
      // leitura o apelido velho sobrescreveria o campo do contrato e o cabelo
      // simplesmente nao mudaria, sem erro nenhum.
      aparencia: f.lerAparencia ? f.lerAparencia() : null,
      carteira,
      onde: f.lerOnde ? f.lerOnde() : null,
      tutorial: f.lerTutorial ? f.lerTutorial() : [],
      hora: f.lerHora ? f.lerHora() : null,
      itens: f.lerItens ? f.lerItens() : [],
      inventario: f.lerInventario ? f.lerInventario() : null,
      casa: { encaixes: f.lerEncaixes ? f.lerEncaixes() : [] },
    }
  }

  const api = {
    get slot() { return slotAtivo },
    get segundos() { return segundos },

    /** Roda no laco: e daqui que sai o "3h 12min" do card. */
    tique(dt) {
      if (slotAtivo < 0) return
      const d = Number(dt)
      if (Number.isFinite(d) && d > 0 && d < 1) segundos += d
    },

    /** Os cinco cards, pra tela de save. Slot vazio vem null. */
    listar() {
      const lista = lerTudo()
      const out = new Array(SLOTS)
      for (let i = 0; i < SLOTS; i++) {
        const s = lista[i]
        out[i] = (s && typeof s === 'object' && s.esquema) ? s : null
      }
      return out
    },

    /**
     * Grava no slot `i`. Chamado pelos EVENTOS IMPORTANTES (ver main.js) e
     * agrupado em 400 ms: entrar na casa dispara tutorial, toast e save no
     * mesmo quadro, e escrever no localStorage e sincrono — trava a thread do
     * desenho.
     */
    salvar(i, nome, imediato) {
      if (carregando) return false
      const idx = i === undefined ? slotAtivo : (i | 0)
      if (idx < 0 || idx >= SLOTS) return false
      slotAtivo = idx
      const escrever = () => {
        pendente = 0
        const lista = lerTudo()
        const antes = lista[idx]
        lista[idx] = montar(nome || (antes && antes.nome), antes && antes.criadoEm)
        gravarTudo(lista)
        avisar()
      }
      if (imediato) {
        if (pendente) { clearTimeout(pendente); pendente = 0 }
        escrever()
        return true
      }
      if (pendente) return true
      pendente = setTimeout(escrever, 400)
      return true
    },

    /** Le o slot e devolve o objeto cru, ou null. */
    ler(i) {
      const lista = lerTudo()
      const s = lista[i | 0]
      if (!s || typeof s !== 'object') return null
      if ((s.esquema | 0) > ESQUEMA) return null   // arquivo de um jogo mais novo
      return s
    },

    /**
     * Escreve o save de volta NO JOGO. A ordem importa: aparencia antes da
     * posicao (setAppearance reconstroi o boneco e o teleport escreve na raiz
     * dele), e a mobilia depois do resto porque ela registra colisor.
     */
    carregar(i) {
      const s = api.ler(i)
      if (!s) return false
      const f = fontes
      carregando = true
      if (pendente) { clearTimeout(pendente); pendente = 0 }
      // O finally nao e decoracao: se um escritor estourar no meio, a bandeira
      // ficaria ligada pra sempre e o jogo nunca mais gravaria — em silencio.
      try {
        slotAtivo = i | 0
        segundos = Math.max(0, inteiro(s.segundos))
        if (f.escreverNome) f.escreverNome(s.nome)
        if (f.escreverAparencia && s.aparencia) f.escreverAparencia(s.aparencia)
        if (f.carteira && s.carteira) f.carteira.aplicar(s.carteira)
        if (f.escreverTutorial) f.escreverTutorial(s.tutorial || [])
        if (f.escreverHora && s.hora !== null && s.hora !== undefined) f.escreverHora(s.hora)
        if (f.escreverItens) f.escreverItens(s.itens || [])
        if (f.escreverInventario && s.inventario) f.escreverInventario(s.inventario)
        if (f.escreverEncaixes) f.escreverEncaixes((s.casa && s.casa.encaixes) || [])
        // por ultimo: e o teleport que devolve o jogador ao ponto exato
        if (f.escreverOnde && s.onde) f.escreverOnde(s.onde)
      } finally {
        carregando = false
      }
      avisar()
      return true
    },

    apagar(i) {
      const lista = lerTudo()
      lista[i | 0] = null
      gravarTudo(lista)
      if (slotAtivo === (i | 0)) slotAtivo = -1
      avisar()
      return true
    },

    /** O arquivo do slot como texto, pro botao Exportar. */
    exportar(i) {
      const s = api.ler(i)
      return s ? JSON.stringify(s, null, 1) : null
    },

    /**
     * Le um texto de fora pro slot. Devolve o motivo da recusa, ou '' quando
     * deu certo. Tolerante de proposito: arquivo estragado nao pode derrubar o
     * jogo, e a unica coisa que o jogador precisa saber e que nao entrou.
     */
    importar(i, texto) {
      let o = null
      try { o = JSON.parse(String(texto)) } catch (err) { void err; return 'arquivo ilegivel' }
      if (!o || typeof o !== 'object') return 'arquivo ilegivel'
      if (!o.esquema) return 'nao e um save deste jogo'
      if ((o.esquema | 0) > ESQUEMA) return 'save de uma versao mais nova'
      const lista = lerTudo()
      lista[i | 0] = o
      gravarTudo(lista)
      avisar()
      return ''
    },

    /**
     * O primeiro lugar VAZIO, ou -1 quando os cinco estao ocupados.
     *
     * E daqui que sai o slot da gravacao automatica de quem entrou pelo botao
     * JOGAR (que nao passa pela tela dos cinco lugares). Devolver -1 em vez de
     * cair no lugar 1 e proposital: apagar o jogo de 3 horas de alguem pra
     * gravar um jogo de 3 minutos e o pior erro que um save pode cometer.
     */
    primeiroLivre() {
      const l = api.listar()
      for (let i = 0; i < SLOTS; i++) if (!l[i]) return i
      return -1
    },

    /** Comeca um jogo novo no slot: zera o cronometro e grava a foto inicial. */
    comecarEm(i, nome) {
      slotAtivo = i | 0
      segundos = 0
      const lista = lerTudo()
      lista[slotAtivo] = montar(nome, Date.now())
      gravarTudo(lista)
      avisar()
      return true
    },

    aoMudar(fn) {
      if (typeof fn !== 'function') return () => {}
      ouvintes.push(fn)
      return () => {
        const k = ouvintes.indexOf(fn)
        if (k >= 0) ouvintes.splice(k, 1)
      }
    },
  }

  return api
}

export default criarSave
