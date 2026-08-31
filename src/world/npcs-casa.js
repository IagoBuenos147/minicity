import * as THREE from 'three'
import { createNPC } from '../npc/npc.js'
import { CASA } from './layout.js'

// ---------------------------------------------------------------------------
// src/world/npcs-casa.js — OS TRES DA CALCADA.
//
// Gente parada na frente da casa 42. Nao vendem nada, nao dao missao e nao
// andam: estao ali porque uma rua sem ninguem parado nela nao e uma rua, e a
// calcada da casa do jogador e o primeiro lugar que ele ve toda vez que sai.
//
// POR QUE UM MODULO PROPRIO, e nao mais um punhado de linhas no main: NPC de
// rua tende a virar familia (o proximo pedido vai ser "poe mais um na esquina
// do cassino"). Com o arquivo separado, o proximo entra numa tabela; dentro do
// main, entraria em copiar-e-colar.
//
// A DIVERSIDADE E O PONTO, e ela foi pedida item a item: um de chapeu, um
// barbudo, um de chinelo, um de bota. Sao tres pessoas pra cinco tracos, entao
// eles se combinam — e e melhor assim, porque pessoa de verdade nao tem UM
// traco. O que nao pode e os tres serem o mesmo boneco com a camisa trocada,
// que e no que da quando se sorteia aparencia aleatoria.
//
// TUDO VEM DO CATALOGO DO PERSONAGEM. Nao ha um modelo novo aqui dentro: sao
// os mesmos CHAPEUS, CALCADOS, BARBAS e CABELOS que o jogador usa no
// customizador. Isso e de proposito — NPC com peca exclusiva e peca que ninguem
// mantem, e no dia em que a bota mudar, a do NPC fica velha.
// ---------------------------------------------------------------------------

/**
 * A CALCADA DA CASA. A fachada e o lado z0 do lote (ver CASA em layout.js) e a
 * porta fica no meio; a calcada corre rente a ela, do lado de fora.
 *
 * Os numeros saem do lote e nao sao escritos a mao: se a casa se mover, os tres
 * se movem junto.
 */
const FRENTE = CASA.z0 - 1.15        // um metro e pouco a frente da fachada
const PORTA_X = CASA.door.center

/**
 * Os tres. `rotY` 0 olha pro +Z (contrato de npc.js), e a rua esta em -Z —
 * entao PI e "de costas pra casa, olhando a avenida", que e como se fica
 * parado na calcada.
 *
 * O x de cada um foge da FAIXA DA PORTA (PORTA_X +- 1.3): morador saindo de
 * casa nao pode esbarrar em ninguem, e o colisor deles e solido.
 */
const GENTE = [
  {
    // 1. O DO CHAPEU E DA BOTA. Chapeu de cowboy, bota de cowboy, costeleta
    // larga: o tipo que fica na calcada olhando o movimento.
    nome: 'Seu Nilton',
    // -2.6 e nao -3.9: em 3,9 ele nascia ATRAS de uma das arvores da calcada e
    // so aparecia de perto. Continua fora da faixa da porta (1,3 de folga).
    x: PORTA_X - 2.6, z: FRENTE + 0.10, rotY: Math.PI - 0.30,
    shirt: 0x8c4a33, pants: 0x3b4658, shoes: 0x4a3220,
    aparencia: {
      cabeca: 5, olhos: 2, boca: 1, sobrancelha: 10, nariz: 0,
      cabelo: 10, corCabelo: 4, pele: 2,
      barba: 17, corBarba: 4,
      chapeu: 3, calcado: 7, blusa: 4, calca: 0,
      colar: 0, relogio: 1,
    },
  },
  {
    // 2. O BARBUDO DE CHINELO. Barba cheia, regata, bermuda de praia e chinelo
    // — o vizinho que desceu pra tomar um ar e nao subiu mais.
    nome: 'Dedé',
    x: PORTA_X + 3.4, z: FRENTE - 0.25, rotY: Math.PI + 0.42,
    shirt: 0xe6e2d8, pants: 0x6d7f8c, shoes: 0x23252a,
    aparencia: {
      cabeca: 0, olhos: 5, boca: 0, sobrancelha: 2, nariz: 0,
      cabelo: 8, corCabelo: 0, pele: 4,
      barba: 23, corBarba: 0,
      chapeu: 0, calcado: 1, blusa: 2, calca: 11,
      colar: 2, relogio: 0,
    },
  },
  {
    // 3. O DA FOTO QUE O DONO MANDOU: coque no alto, sobrancelha reta e grossa,
    // bigode, e verde-oliva de cima a baixo. Ele pediu "outro desse jeito",
    // entao este e o retrato, nao uma variacao.
    nome: 'Tonho',
    x: PORTA_X + 5.6, z: FRENTE + 0.35, rotY: Math.PI - 0.12,
    // ESTES HEX NAO PINTAM A ROUPA DELE, e isso e do jogo, nao um bug: roupas.js
    // tem uma TABELA DE MODA que troca `cor.blusa`/`cor.calca` pela cor real da
    // peca antes de construir. Ela nasceu de uma queixa do proprio dono ("voce
    // fez todas as camisas azuis") — sem ela, `shirt` e uma constante e as doze
    // camisas saem do mesmo azul. Ficam aqui porque o CALCADO ainda passa.
    shirt: 0x7d8a4e, pants: 0x6b7040, shoes: 0xdcd6c4,
    aparencia: {
      cabeca: 1, olhos: 0, boca: 3, sobrancelha: 10, nariz: 0,
      cabelo: 4, corCabelo: 2, pele: 0,
      barba: 2, corBarba: 2,
      // A COR DA ROUPA SE ESCOLHE PELA PECA, e nao pelo hex — ver o comentario
      // do shirt acima. Levei tres trocas as cegas (sueter saiu vinho, corta-
      // vento saiu preto, moletom saiu cinza) ate ler a MODA_CAMISA de
      // roupas.js, onde a resposta estava escrita:
      //
      //   oversized: 0x5a6046   // verde oliva   <- a cor da foto do dono
      //
      // Entao a peca do Tonho e a CAMISETA OVERSIZED, porque ela ja E oliva. O
      // chino (caqui) fecha por baixo. Pra vestir NPC novo: abra MODA_CAMISA e
      // escolha pela cor que voce quer, nao pelo formato.
      chapeu: 0, calcado: 3, blusa: 10, calca: 5,
      colar: 0, relogio: 0,
    },
  },
]

/**
 * O QUE CADA UM DIZ. Duas opcoes por pessoa, no formato da captura que o dono
 * mandou: a de cima e a que responde, a de baixo e a que TRANCA — ela aparece
 * com o aviso em vermelho e nao leva a lugar nenhum ainda.
 *
 * A opcao trancada nao e enfeite: e ela que diz ao jogador que existe mais jogo
 * ali do que ele pode alcancar agora. Sem uma delas, uma conversa de duas linhas
 * parece um beco sem saida em vez de uma porta fechada.
 */
const CONVERSAS = {
  'Seu Nilton': {
    saudacao: 'Bom dia',
    opcoes: [
      { txt: 'Faz tempo que o senhor mora aqui?',
        resposta: 'Seu Nilton: desde antes do cassino. Essa rua ja foi mais quieta.' },
      { txt: 'Sabe de algum trabalho por aqui?', trava: 'fale com a Wanda primeiro' },
    ],
  },
  'Dedé': {
    saudacao: 'E aí',
    opcoes: [
      { txt: 'Tudo certo por aqui?',
        resposta: 'Dedé: desci pra tomar um ar faz duas horas. Nao subo mais.' },
      {
        txt: 'Chamar pra ir no seu cassino',
        // A TRAVA E UMA FUNCAO, e nao um texto fixo, porque ela precisa
        // DESAPARECER quando a condicao for cumprida. Devolver texto = trancada
        // (o aviso em vermelho aparece); devolver null = liberada.
        //
        // A ROLETA AINDA NAO EXISTE — src/cassino/ tem baralho, blackjack,
        // poker e slots, e nada de roleta. Entao a condicao pergunta por
        // `game.roleta` (ou pela flag do save), que HOJE nunca esta la: a opcao
        // nasce trancada, como o dono pediu, e se destranca sozinha no dia em
        // que a roleta for construida e se registrar no game — sem ninguem
        // precisar voltar aqui.
        trava: (gm) => (temRoleta(gm) ? null : 'abra a roleta primeiro'),
        resposta: 'Dedé: cassino seu? Ai eu vou. Me chama quando a roleta girar.',
      },
    ],
  },
  'Tonho': {
    saudacao: 'Fala',
    opcoes: [
      { txt: 'Moro naquela casa ali.',
        resposta: 'Tonho: entao a gente e vizinho. Qualquer coisa e so gritar.' },
      { txt: 'Voce joga sinuca?', trava: 'compre uma mesa antes' },
    ],
  },
}

/**
 * A ROLETA ESTA ABERTA? Uma pergunta so, num lugar so.
 *
 * Ela e feita de tres jeitos porque nao se sabe ainda como a roleta vai nascer:
 * um modulo em `game.roleta`, uma tela do cassino, ou uma flag de progresso no
 * save. Qualquer um dos tres serve, e o dia em que existir um deles a opcao do
 * Dede se destranca sozinha.
 */
function temRoleta(gm) {
  if (!gm) return false
  if (gm.roleta) return true
  if (gm.cassino && typeof gm.cassino.temRoleta === 'function') return !!gm.cassino.temRoleta()
  if (gm.progresso && gm.progresso.roleta) return true
  return false
}

/**
 * @param {object} game precisa de `groundY` — os tres pousam no chao de
 *   verdade, seja calcada, meio-fio ou asfalto. Chutar 0.16 aqui e o tipo de
 *   numero que sobrevive ate o dia em que alguem levanta a calcada.
 */
export function buildNpcsCasa(game) {
  const group = new THREE.Group()
  group.name = 'npcs-casa'
  const colliders = []
  const interactables = []
  const npcs = []

  const chao = (x, z) => (game && typeof game.groundY === 'function' ? game.groundY(x, z) : 0)

  for (const p of GENTE) {
    let npc = null
    try {
      npc = createNPC({
        name: p.nome,
        pose: 'idle',
        x: p.x, y: 0, z: p.z,
        baseY: chao(p.x, p.z),
        rotY: p.rotY,
        shirt: p.shirt, pants: p.pants, shoes: p.shoes,
        appearance: p.aparencia,
      })
    } catch (err) { void err; npc = null }
    // Um NPC que nao nasce nao pode derrubar a rua: o catalogo de aparencia
    // muda, e uma peca renomeada viraria tela preta em vez de um vizinho a
    // menos. Mesma tolerancia do buildClerk da mercearia.
    if (!npc) continue

    group.add(npc.root)
    npcs.push({ npc, ficha: p })

    // COLISOR: gente e solida. 44 cm de lado — o ombro do boneco, nao a caixa
    // inteira dele: colisor largo demais faz o jogador "grudar" ao passar
    // raspando, e a calcada aqui e estreita.
    colliders.push({
      minX: p.x - 0.22, maxX: p.x + 0.22,
      minZ: p.z - 0.22, maxZ: p.z + 0.22,
      tag: 'npc-casa',
    })

    interactables.push({
      id: 'npc-casa-' + p.nome.toLowerCase().replace(/[^a-z]/g, ''),
      // na altura do peito: a interacao pesa o Y pela metade, e no peito o
      // rotulo aparece na hora certa tambem em primeira pessoa
      position: new THREE.Vector3(p.x, chao(p.x, p.z) + 1.25, p.z),
      radius: 2.2,
      label: 'Falar com ' + p.nome,
      onInteract: (gm) => {
        const c = CONVERSAS[p.nome]
        if (!gm.conversa || !c) { gm.toast(p.nome + ': tudo certo?'); return }
        gm.conversa.abrir({
          nome: p.nome,
          saudacao: c.saudacao,
          // A CABECA, e nao a raiz do NPC: e nela que a camera mira e e sobre
          // ela que a saudacao flutua. A raiz fica nos PES — mirar ali daria
          // uma camera olhando pro chao.
          alvo: (npc.character && npc.character.parts && npc.character.parts.head)
            || npc.root,
          // A trava e resolvida AQUI, na hora de abrir: assim ela le o estado do
          // jogo naquele momento em vez de ficar congelada no que era verdade
          // quando a rua foi construida.
          opcoes: c.opcoes.map((o) => ({
            txt: o.txt,
            trava: typeof o.trava === 'function' ? o.trava(gm) : o.trava,
            // A resposta vai pra PROPRIA barra de dialogo (ver ui/conversa.js).
            // Ela ja foi um toast, e toast aparece no canto superior direito —
            // o jogador via o NPC centralizado e a conversa do outro lado da
            // tela.
            resposta: o.resposta,
          })),
        })
      },
    })
  }

  // ---- animacao ------------------------------------------------------------
  // A cabeca segue o jogador quando ele chega perto, e para de seguir quando ele
  // sai. E o unico movimento deles, e e o que separa "tres pessoas paradas" de
  // "tres estatuas": npc.js ja tem a respiracao e a piscada, mas o olhar so
  // acontece se alguem apontar o alvo.
  let alvo = null
  function alvoDoOlhar(gm) {
    if (alvo) return alvo
    const ch = gm && gm.character
    if (!ch) return null
    alvo = (ch.parts && ch.parts.head) || ch.root || null
    return alvo
  }

  function update(dt, gm) {
    const p = gm && gm.player && gm.player.position
    for (const { npc, ficha } of npcs) {
      if (p) {
        const dx = p.x - ficha.x, dz = p.z - ficha.z
        // 36 = 6 m de raio. Comparado ao quadrado pra nao tirar raiz de tres
        // NPCs por quadro por nada.
        if (dx * dx + dz * dz < 36) {
          const t = alvoDoOlhar(gm)
          if (t) npc.lookTarget = t
        } else if (npc.lookTarget) {
          npc.lookTarget = null
        }
      }
      if (typeof npc.update === 'function') npc.update(dt)
    }
  }

  return { group, colliders, interactables, update }
}

export default buildNpcsCasa
