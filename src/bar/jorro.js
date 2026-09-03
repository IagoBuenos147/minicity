import * as THREE from 'three'
import { stdMat, tex } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/bar/jorro.js — O FIO DE LIQUIDO QUE CAI DE UMA COISA DENTRO DE OUTRA.
//
// A torneira de chope ja tinha o dela, escrito dentro de mobilia/barril.js e
// muito bem resolvido: coluna que CRESCE pra baixo ao abrir, ENCOLHE PELO TOPO
// ao fechar, textura correndo por dentro. O problema e que la ele nasce colado
// na torneira — a coluna e filha do grupo dela, o comprimento sai da altura de
// queda fixa e o corte e um estado da propria torneira.
//
// No bar isso nao serve, porque aqui quem despeja SE MEXE: a garrafa vira na
// mao do barman e o bico dela desce e gira enquanto o liquido sai; a pistola de
// refrigerante e apontada; o copo do liquidificador e virado sobre a taca. O
// jorro precisa ir de UM PONTO A OUTRO PONTO, os dois se mexendo, e refazer
// isso todo quadro.
//
// A SOLUCAO E A MESMA DE SEMPRE NESTE PROJETO: um cilindro so, de altura 1,
// posicionado no meio do caminho e ESCALADO. O que muda em relacao ao chope e
// que aqui ele tambem e ORIENTADO — `lookAt` na direcao da queda. Assim um
// mesmo jorro serve pra um fio vertical de garrafa e pra um jato inclinado de
// pistola sem nenhum caso especial.
//
// AS TRES COISAS QUE FAZEM ELE PARECER LIQUIDO, e nenhuma e opcional:
//
//   1. A TEXTURA CORRE. Faixas verticais claras rolando em v. Sem isso a coluna
//      e uma barra de vidro parada pendurada no bico — foi a licao do chope e
//      vale igual aqui.
//   2. ELE AFINA NA DESCIDA. O liquido acelera caindo, entao a secao diminui.
//      Um cilindro de raio constante le como macarrao.
//   3. ELE TEM CABECA E TEM RABO. Ao abrir, a ponta desce em 2,2 m/s (a queda
//      real nos primeiros 30 cm); ao fechar, o rabo se desprende do bico e cai.
//      Quase todo jogo apaga a coluna inteira de um quadro pro outro, e a
//      leitura fica de torneira quebrada.
//
// E o RESPINGO no ponto de impacto, que aqui e mais importante que no chope: no
// bar o alvo e um copo de 6 cm de boca, e sem o respingo nao da pra saber se o
// fio esta caindo DENTRO ou passando ao lado.
// ---------------------------------------------------------------------------

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _meio = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)
const _q = new THREE.Quaternion()

/** Faixas correndo dentro do fio. Uma textura pro jogo todo, cacheada. */
function jorroTex() {
  return tex('bar-jorro', 64, (g, s) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, s, s)
    for (let i = 0; i < 22; i++) {
      const y = Math.random() * s
      g.fillStyle = 'rgba(180,180,180,' + (0.20 + Math.random() * 0.45) + ')'
      g.fillRect(Math.random() * s, y, 1 + Math.random() * 3, 8 + Math.random() * 26)
    }
    // as duas bordas claras: e por onde a luz atravessa o fio
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.fillRect(0, 0, 3, s)
    g.fillRect(s - 3, 0, 3, s)
  })
}

/**
 * O material do fio, cacheado POR COR.
 *
 * `color` multiplica o mapa (que e branco de proposito, pra a cor vir toda
 * daqui) e o emissivo fraco no mesmo tom faz o liquido parecer cheio de luz —
 * a mesma conta do liquido dos copos em mobilia/copos.js, e pelo mesmo motivo:
 * sem ele um fio ambar le como plastico laranja.
 */
function matDe(cor) {
  const t = jorroTex()
  return stdMat('bar-jorro:' + cor, {
    map: t, color: cor, emissive: cor, emissiveIntensity: 0.22,
    transparent: true, opacity: 0.92, roughness: 0.12, depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/**
 * Cria um fio. O grupo devolvido deve ser pendurado num pai cujo espaco seja o
 * MESMO em que os pontos de `apontar` chegam — na pratica, a raiz do bar.
 *
 * @param opts.cor       cor inicial do liquido
 * @param opts.raio      raio do fio no bico (m). Garrafa 3,5 mm, pistola 5 mm.
 * @param opts.velocidade  m/s da ponta descendo. 2.2 e a queda real em 30 cm.
 * @param opts.parada  onde as pecas ficam guardadas enquanto nao ha despejo
 *                     (em coordenada do PAI). Ver a nota la embaixo.
 */
export function criarJorro(opts = {}) {
  const raio = opts.raio !== undefined ? opts.raio : 0.0035
  const vel = opts.velocidade !== undefined ? opts.velocidade : 2.2
  let cor = opts.cor !== undefined ? opts.cor : 0xd8901c

  const g = new THREE.Group()
  g.name = 'bar-jorro'
  // NAO VAI PRO FORNO. Ele muda de escala e de rotacao todo quadro, e o forno
  // funde tudo que nao estiver marcado (ver world/bake.js).
  g.userData.noBake = true

  let mat = matDe(cor)
  // altura 1 de proposito: a escala em Y e o comprimento, entao a geometria
  // nunca precisa ser refeita. Mesma decisao da coluna de mobilia/barril.js.
  const fio = new THREE.Mesh(
    new THREE.CylinderGeometry(raio, raio * 0.62, 1, 8, 1, true), mat,
  )
  fio.visible = false
  fio.castShadow = false
  fio.frustumCulled = false
  g.add(fio)

  // A CABECA: o bolo mais gordo que desce na frente do liquido. So aparece
  // enquanto a ponta ainda esta caindo — depois que ela chega no alvo, o que se
  // ve la e o respingo.
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(raio * 1.7, 8, 6), mat)
  cabeca.visible = false
  cabeca.castShadow = false
  cabeca.scale.set(1, 1.5, 1)
  g.add(cabeca)

  // O RESPINGO no ponto de impacto: uma calota que pulsa. Sem ele nao da pra
  // saber se o fio esta caindo dentro do copo ou dois centimetros ao lado.
  const resp = new THREE.Mesh(
    new THREE.SphereGeometry(raio * 3.6, 10, 6, 0, Math.PI * 2, 0, 1.25), mat,
  )
  resp.scale.set(1, 0.34, 1)
  resp.visible = false
  resp.castShadow = false
  g.add(resp)

  let aberto = false
  let pe = 0            // quanto da distancia a ponta ja venceu (m)
  let topo = 0          // de onde a coluna comeca (m abaixo do bico)
  let dist = 0.2
  let t = 0
  let derramando = 0

  // AS TRES PECAS FICAM ESTACIONADAS, E ENCOLHIDAS, ATE O PRIMEIRO DESPEJO.
  //
  // Elas sao posicionadas em coordenada ABSOLUTA do pai a cada quadro (e o que
  // permite o fio ir de um ponto qualquer a outro sem hierarquia nenhuma), o
  // que quer dizer que, paradas, elas ficam na ORIGEM do pai. No bar isso e o
  // (0,0,0) do mundo — o cruzamento central da cidade. Nao pinta pixel nenhum
  // (estao invisiveis), mas poe a caixa da subarvore do bar a vinte metros de
  // distancia dele, e a geometria do fio ainda tem um metro de altura por
  // construcao (a escala em Y e que vira o comprimento).
  fio.scale.set(1, 0.0001, 1)
  cabeca.scale.setScalar(0.0001)
  resp.scale.setScalar(0.0001)
  if (opts.parada) {
    fio.position.copy(opts.parada)
    cabeca.position.copy(opts.parada)
    resp.position.copy(opts.parada)
  }

  const api = {
    grupo: g,
    get aberto() { return aberto },
    /** true quando o liquido JA ESTA CHEGANDO no alvo — nao quando abriu. */
    get chegou() { return aberto && pe >= dist - 0.008 },

    setCor(c) {
      if (typeof c !== 'number' || c === cor) return
      cor = c
      mat = matDe(cor)
      fio.material = mat
      cabeca.material = mat
      resp.material = mat
    },

    abrir() {
      if (aberto) return false
      aberto = true
      pe = 0
      topo = 0
      return true
    },

    fechar() {
      if (!aberto) return false
      aberto = false
      return true
    },

    /**
     * Onde ele sai e onde ele bate, em coordenadas do PAI do grupo. Chamar todo
     * quadro: os dois pontos se mexem.
     */
    apontar(de, para) {
      _a.copy(de)
      _b.copy(para)
      dist = Math.max(0.02, _a.distanceTo(_b))
    },

    /** Marca visual de "esta caindo fora do copo" — o fio fica mais claro. */
    setDerramando(v) { derramando = v ? 1 : 0 },

    atualizar(dt) {
      const d = Math.min(Math.max(dt || 0, 0), 0.05)
      t += d

      if (aberto) {
        topo = 0
        pe = Math.min(dist, pe + vel * d)
      } else if (pe > topo) {
        topo = Math.min(dist, topo + vel * d)
      }

      const comp = Math.max(0, pe - topo)
      const vivo = comp > 0.004
      fio.visible = vivo
      cabeca.visible = vivo && pe < dist - 0.006
      if (!vivo) {
        resp.visible = false
        return false
      }

      // orienta: o cilindro nasce em +Y, entao gira o +Y pra direcao da queda
      _dir.copy(_b).sub(_a)
      const total = Math.max(1e-5, _dir.length())
      _dir.divideScalar(total)
      _q.setFromUnitVectors(_up, _dir)

      _meio.copy(_a).addScaledVector(_dir, topo + comp / 2)
      fio.position.copy(_meio)
      fio.quaternion.copy(_q)
      // o tremor de 4% e o que impede a coluna de ler como um tubo solido
      const tremor = 1 + Math.sin(t * 27) * 0.05
      fio.scale.set(tremor, comp, tremor)
      mat.map.offset.y = (mat.map.offset.y - d * 3.4) % 1
      mat.opacity = derramando ? 0.72 : 0.92

      if (cabeca.visible) {
        cabeca.position.copy(_a).addScaledVector(_dir, pe)
        cabeca.quaternion.copy(_q)
      }

      // respingo: so quando a ponta ja chegou
      const batendo = aberto && pe >= dist - 0.006
      resp.visible = batendo
      if (batendo) {
        const s = 0.70 + Math.sin(t * 19) * 0.14
        resp.position.copy(_b)
        resp.scale.set(s, 0.30, s)
      }
      return true
    },

    dispose() {
      fio.geometry.dispose()
      cabeca.geometry.dispose()
      resp.geometry.dispose()
    },
  }

  return api
}

export default criarJorro
