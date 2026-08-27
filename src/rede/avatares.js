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
import { defaultAppearance, SKIN_DEFAULT } from '../player/appearance.js'

// A rede manda a pele como INDICE (u8), nao como cor: 6 bytes de aparencia sao
// o contrato, e uma cor RGB nao cabe num byte. A tabela mora aqui porque e o
// unico lugar que precisa traduzir indice -> cor. O indice 0 e a pele padrao
// do jogo, entao quem nunca escolheu nada nasce igual ao single player.
const TONS_PELE = [
  SKIN_DEFAULT, // 0 bege quente (padrao)
  0xf6d7c0,     // 1 claro rosado
  0xe8b48c,     // 2 medio
  0xc98d5c,     // 3 dourado
  0x9a6238,     // 4 castanho
  0x6b421f,     // 5 escuro
]

function corDaPele(i) {
  const n = i | 0
  // valor maior que um byte so pode ser uma cor ja pronta (o preview local
  // usa hex direto); aceitar os dois evita um ramo especial no chamador
  if (n > 255) return n
  return TONS_PELE[((n % TONS_PELE.length) + TONS_PELE.length) % TONS_PELE.length]
}

/** Aparencia da rede (6 bytes) -> aparencia que createCharacter entende. */
function paraAparencia(ap) {
  const base = defaultAppearance()
  if (!ap) return base
  base.hair = ap.hair | 0
  base.eyes = ap.eyes | 0
  base.brows = ap.brows | 0
  base.mouth = ap.mouth | 0
  base.hairColor = ap.hairColor | 0
  base.skin = corDaPele(ap.skin)
  return base
}

function mesmaAparencia(a, b) {
  if (!a || !b) return false
  return a.hair === b.hair && a.eyes === b.eyes && a.brows === b.brows
    && a.mouth === b.mouth && a.hairColor === b.hairColor && a.skin === b.skin
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

        // aparencia so e reconstruida quando muda de verdade: setAppearance
        // remonta os slots do rosto, e fazer isso por frame seria absurdo
        if (!mesmaAparencia(a.apDesenhada, j.aparencia) && j.aparencia) {
          a.personagem.setAppearance(paraAparencia(j.aparencia))
          a.apDesenhada = j.aparencia
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
