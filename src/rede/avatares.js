// ---------------------------------------------------------------------------
// src/rede/avatares.js — os bonecos dos OUTROS jogadores.
//
// Recebe o Map de jogadores que cliente-rede.js ja entregou INTERPOLADO (100 ms
// atras) e mantem um boneco por id na cena. Nada aqui decide posicao: isto e
// so o desenho do que a rede disse.
//
// Tres regras que valem mais que a beleza do codigo:
//
// 1. REAPROVEITE O BONECO. createCharacter() monta dezenas de geometrias e
//    materiais; criar e destruir por frame derruba o fps sozinho, sem ajuda de
//    ninguem. Aqui o boneco nasce quando o id aparece e so morre quando o id
//    some do Map — e ai com dispose() de verdade, senao a GPU vaza.
//
// 2. NADA POR INDICE. A chave e o id do jogador, sempre. O Map muda de tamanho
//    a cada entrada e saida; posicao em lista nao significa nada.
//
// 3. JOGADOR NAO COLIDE COM JOGADOR (REDE.md). Entao nenhum colisor e
//    registrado aqui. Eles se atravessam, e e de proposito: colisao entre
//    corpos remotos desenhados 100 ms atras empurraria voce por causa de um
//    fantasma que ja saiu de la.
// ---------------------------------------------------------------------------

import * as THREE from 'three'
import { createCharacter } from '../player/character.js'
import { createAnimator } from '../player/animation.js'
import * as Ap from '../player/appearance.js'
import { CAMPOS_APARENCIA } from '../comum/protocolo.js'

const defaultAppearance = Ap.defaultAppearance

// A rede manda a pele como INDICE (u8), nao como cor: os 20 bytes da aparencia
// sao todos indices de catalogo, e uma cor RGB nao cabe num byte.
//
// A tabela de tons e do appearance.js quando ele a expoe (SKIN_TONES), e so cai
// nesta copia local quando nao. Duas listas de tom de pele que divergem fazem o
// MESMO indice desenhar peles diferentes no boneco local e no remoto — o tipo de
// bug que ninguem ve num teste e todo mundo ve na tela.
const TONS_PELE = Array.isArray(Ap.SKIN_TONES) && Ap.SKIN_TONES.length
  ? Ap.SKIN_TONES
  : [
    Ap.SKIN_DEFAULT, // 0 bege quente (padrao)
    0xf6d7c0,        // 1 claro rosado
    0xe8b48c,        // 2 medio
    0xc98d5c,        // 3 dourado
    0x9a6238,        // 4 castanho
    0x6b421f,        // 5 escuro
  ]

function corDaPele(i) {
  const n = i | 0
  // valor maior que um byte so pode ser uma cor ja pronta (o preview local
  // usa hex direto); aceitar os dois evita um ramo especial no chamador
  if (n > 255) return n
  const t = TONS_PELE[((n % TONS_PELE.length) + TONS_PELE.length) % TONS_PELE.length]
  // a tabela pode vir como [{hex}] se o appearance.js seguir o padrao das
  // HAIR_COLORS; aceito as duas formas em vez de exigir uma
  return (t && typeof t === 'object') ? (t.hex | 0) : (t | 0)
}

/* Como cada campo do contrato se chamava quando a aparencia tinha 6 bytes.
   character.js e appearance.js podem estar em qualquer um dos dois nomes
   enquanto a reforma acontece em varios arquivos ao mesmo tempo, entao mando os
   DOIS. Chave desconhecida em setAppearance e inofensiva (Object.assign a
   ignora na hora de reconstruir os slots); chave FALTANDO deixaria o boneco
   remoto com o cabelo do vizinho. */
const APELIDOS_ANTIGOS = {
  cabelo: 'hair',
  olhos: 'eyes',
  sobrancelha: 'brows',
  boca: 'mouth',
  corCabelo: 'hairColor',
}

/**
 * Aparencia da rede (20 indices) -> aparencia que createCharacter entende.
 *
 * Vai TUDO: rosto e roupa. Os slots novos (chapeu, blusa, calca, calcado,
 * colar, anel, tatuagem, relogio, jaqueta) sao indices de catalogo que
 * character.js le pelo nome do contrato — enquanto ele ainda nao os conhecer,
 * eles ficam parados dentro do objeto de aparencia sem quebrar nada, e passam
 * a valer no instante em que o outro lado ganhar os slots.
 */
function paraAparencia(ap) {
  const base = defaultAppearance()
  if (!ap) return base
  for (const k of CAMPOS_APARENCIA) {
    const v = ap[k] | 0
    base[k] = v
    const velho = APELIDOS_ANTIGOS[k]
    if (velho !== undefined) base[velho] = v
  }
  // 'skin' e o unico campo que o personagem quer como COR e nao como indice:
  // e ela que pinta cabeca, pescoco e maos. 'pele' (o indice) continua no
  // objeto pra quem preferir resolver a tabela sozinho.
  base.skin = corDaPele(ap.pele)
  return base
}

/** Duas aparencias da REDE sao iguais? Compara os 20 campos do contrato, e nao
 *  uma lista escrita na mao: um campo esquecido aqui significa uma roupa que
 *  troca no dono e nao troca em mais ninguem, sem erro nenhum. */
function mesmaAparencia(a, b) {
  if (!a || !b) return false
  for (const k of CAMPOS_APARENCIA) {
    if ((a[k] | 0) !== (b[k] | 0)) return false
  }
  return true
}

// --- placa com o nome -------------------------------------------------------
// Sprite com CanvasTexture: sempre de frente pra camera, custa 1 draw call e
// nao precisa de fonte externa (o projeto nao carrega asset nenhum).

const PLACA_L = 256   // px do canvas; 4:1 pra caber nome comprido
const PLACA_A = 64
const PLACA_ESC = 0.9 // largura em metros

function fazerPlaca(nome) {
  const txt = String(nome || '?').slice(0, 16)
  const c = document.createElement('canvas')
  c.width = PLACA_L
  c.height = PLACA_A
  const g = c.getContext('2d')
  g.font = 'bold 34px system-ui, "Segoe UI", sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // contorno escuro grosso: o nome precisa ler contra ceu claro E contra
  // parede escura, e nao da pra escolher o fundo
  g.lineJoin = 'round'
  g.lineWidth = 8
  g.strokeStyle = 'rgba(0,0,0,0.78)'
  g.strokeText(txt, PLACA_L / 2, PLACA_A / 2)
  g.fillStyle = '#ffffff'
  g.fillText(txt, PLACA_L / 2, PLACA_A / 2)

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    // sem escrever no depth: dois nomes que se cruzam nao recortam um ao
    // outro. Mas COM depthTest, pra o nome nao vazar atraves da parede.
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.scale.set(PLACA_ESC, PLACA_ESC * (PLACA_A / PLACA_L), 1)
  return sprite
}

function soltarPlaca(sprite) {
  if (!sprite) return
  if (sprite.parent) sprite.parent.remove(sprite)
  if (sprite.material) {
    if (sprite.material.map) sprite.material.map.dispose()
    sprite.material.dispose()
  }
}

// --- velocidades de referencia ---------------------------------------------
// A rede manda o ESTADO da animacao (anim), nao a velocidade — e o animador
// precisa de velocidade pra cadencia da passada. Entao meço a velocidade real
// a partir do movimento ja interpolado, que e o unico numero honesto que
// tenho, e uso o anim so pra decidir andar/correr/ar/sentado. Os pisos abaixo
// evitam o boneco "deslizar" quando a rede engasga e o delta vira zero.
const PISO_ANDANDO = 1.6
const PISO_CORRENDO = 4.2

export function criarAvatares(scene) {
  // id -> boneco. Nunca lista: id que sai deixa buraco em lista.
  const avatares = new Map()

  function nascer(id, j) {
    const ap = paraAparencia(j.aparencia)
    const personagem = createCharacter({ appearance: ap })
    personagem.root.name = 'avatar:' + id
    // o id tambem no userData: e por ele que se acha o boneco de um jogador
    // sem depender de parsear o nome
    personagem.root.userData.avatarId = id
    // A aparencia DESENHADA fica visivel no proprio no da cena. Serve pra
    // depurar e pro teste online conferir que o boneco foi mesmo refeito, e
    // nao so que o pacote chegou.
    personagem.root.userData.aparencia = j.aparencia || null
    scene.add(personagem.root)

    const placa = fazerPlaca(j.nome)
    // filha do root: acompanha o boneco de graca. Sprite nao gira, entao a
    // rotacao do corpo nao a afeta — so a posicao acima da cabeca importa.
    placa.position.set(0, personagem.height + 0.26, 0)
    personagem.root.add(placa)

    const a = {
      id,
      personagem,
      animador: createAnimator(personagem),
      placa,
      nomeDesenhado: String(j.nome || ''),
      apDesenhada: j.aparencia || null,
      // ultima posicao vista, pra medir velocidade
      ux: j.x, uz: j.z,
      vel: 0,
      novo: true,
    }
    avatares.set(id, a)
    return a
  }

  function morrer(a) {
    soltarPlaca(a.placa)
    // dispose() do character ja tira o root da cena e libera as geometrias
    a.personagem.dispose()
    if (a.personagem.root.parent) a.personagem.root.parent.remove(a.personagem.root)
  }

  /**
   * @param mapaDeJogadores Map id -> {id,nome,aparencia,x,y,z,yaw,anim,flags}
   * @param meuId  o meu id: o meu boneco e do controller, nao daqui
   * @param dt     segundos do frame
   */
  function sincronizar(mapaDeJogadores, meuId, dt) {
    const passo = dt > 0 ? dt : 0.0001
    const vistos = new Set()

    if (mapaDeJogadores) {
      for (const j of mapaDeJogadores.values()) {
        const id = j.id | 0
        if (!id || id === meuId) continue
        vistos.add(id)

        let a = avatares.get(id)
        if (!a) a = nascer(id, j)

        // Aparencia so e reconstruida quando muda de verdade: setAppearance
        // remonta os slots do rosto e da roupa, e fazer isso por frame seria
        // absurdo. Mas quando muda, muda NA HORA — este e o fim do caminho que
        // comeca no barbeiro/provador do outro jogador (MINHA_APARENCIA ->
        // servidor -> APARENCIA -> perfil -> aqui).
        if (!mesmaAparencia(a.apDesenhada, j.aparencia) && j.aparencia) {
          // typeof: character.js esta sendo reformado em paralelo. Se um dia a
          // API mudar de nome, o avatar fica com o visual velho em vez de o
          // laco de render inteiro morrer num TypeError por frame.
          if (typeof a.personagem.setAppearance === 'function') {
            a.personagem.setAppearance(paraAparencia(j.aparencia))
          }
          a.apDesenhada = j.aparencia
          a.personagem.root.userData.aparencia = j.aparencia
        }
        // idem pro nome: canvas novo so quando o texto muda
        const nome = String(j.nome || '')
        if (nome !== a.nomeDesenhado) {
          const alturaAntes = a.placa.position.y
          soltarPlaca(a.placa)
          a.placa = fazerPlaca(nome)
          a.placa.position.set(0, alturaAntes, 0)
          a.personagem.root.add(a.placa)
          a.nomeDesenhado = nome
        }

        // velocidade medida no movimento interpolado (ver comentario acima)
        const dx = j.x - a.ux
        const dz = j.z - a.uz
        const bruta = Math.sqrt(dx * dx + dz * dz) / passo
        a.ux = j.x
        a.uz = j.z
        // no primeiro frame o delta e lixo (nasceu agora): comeca parado
        if (a.novo) { a.vel = 0; a.novo = false }
        else a.vel += (bruta - a.vel) * Math.min(1, passo * 12)

        const root = a.personagem.root
        root.position.set(j.x, j.y, j.z)
        root.rotation.y = j.yaw

        const anim = j.anim | 0
        const sentado = anim === 4
        const noAr = anim === 3
        const correndo = anim === 2
        const andando = anim === 1 || correndo

        let vel = a.vel
        if (!andando) vel = 0
        else if (correndo) vel = Math.max(vel, PISO_CORRENDO)
        else vel = Math.max(vel, PISO_ANDANDO)

        a.animador.update(passo, {
          speed: vel,
          moving: andando,
          running: correndo,
          grounded: !noAr,
          vy: 0,           // a rede nao manda velocidade vertical; a pose de ar
                           // com vy=0 e a de queda, que e a que se ve 90% do tempo
          sitting: sentado,
        })
      }
    }

    // id que sumiu do Map saiu do mundo: apaga o boneco e devolve a memoria
    for (const [id, a] of avatares) {
      if (vistos.has(id)) continue
      morrer(a)
      avatares.delete(id)
    }
  }

  function dispose() {
    for (const a of avatares.values()) morrer(a)
    avatares.clear()
  }

  return { sincronizar, dispose, avatares }
}

export default criarAvatares
