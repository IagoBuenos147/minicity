import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import * as N from './nucleo.js'
import { soldarNormais, tecelagem, fio, peloMat, smoothstep, rng } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/chapeus.js — ancora: head (origem no CENTRO do cranio, +Z = frente)
//
// Seis chapeus, SEIS METODOS DE CONSTRUCAO DIFERENTES. Nao e capricho: o dono
// pediu pra poder olhar os seis lado a lado e escolher qual linguagem casa com
// o jogo. Dois chapeus que sao a mesma funcao com outra cor nao dizem nada.
//
//   1 Chapeu   LATHE DE PERFIL UNICO FECHADO. Copa, aba, rebordo virado e forro
//              sao UM contorno so, revolvido. Como o contorno da a volta, toda
//              borda nasce com espessura de verdade — e a aba de espessura zero
//              e o que mais faz chapeu parecer papel recortado.
//   2 Bone     SEIS GOMOS. Cada painel e uma superficie propria dentro da mesma
//              BufferGeometry, com folga entre eles: as normais NAO sao soldadas
//              na costura, entao a quina do gomo existe de verdade em vez de ser
//              pintada. A aba e uma tira de secao arredondada que curva pra
//              baixo NAS LATERAIS (meio-disco plano le como pa de pedreiro).
//   3 Gorro    CASCA COM NERVURA POR DESLOCAMENTO. O trico e o raio da casca
//              modulado por um cosseno em volta do eixo; a mesma modulacao e
//              aplicada DEPOIS na barra, entao a nervura atravessa a dobra sem
//              emenda. A barra e um perfil que volta por dentro: dobra com
//              espessura, nao um anel colado.
//   4 Cowboy   GRADE PARAMETRICA. Aba e copa saem de campos em (azimute, altura):
//              a aba sobe nas laterais por sin(az)^2 e a copa leva o "pinch
//              front" — dois amassos gaussianos nos lados e o vinco no meio.
//   5 Touca    CASCA + FIOS. O pompom nao e uma bola lisa: sao 40 fios de
//              tecelagem()/fio(), os mesmos da barba, saindo de um nucleo. A
//              franja embaixo da barra usa os mesmos fios.
//   6 Cartola  LOFT DE SECOES. Uma pilha de secoes fechadas costuradas uma na
//              outra, cada uma com raio, achatamento e altura proprios — e o
//              que da a CINTURA da copa (estreita no meio, abre no alto) e o
//              rebordo enrolado da aba, que um lathe nao faria sem truque.
//
// A CABECA MUDOU E ISTO AQUI MEDE ELA.
//
// Antes cada chapeu escrevia a propria folga sobre apoio(c) — o elipsoide medio
// da cabeca. Com os cranios novos isso quebra nos dois extremos: o cranio
// COMPRIDO tem o alto em y = 0.335 (o elipsoide de apoio para em 0.246) e furava
// a copa por cima; o cranio largo passa dos lados. cranio(c) resolve medindo a
// malha do cranio ATIVO — character.js reconstroi a cabeca ANTES de reconstruir
// os slots, entao no momento do build() a malha ja e a do formato escolhido — e
// devolve uma tabela de raio por altura. Todo raio deste arquivo sai de la; o
// apoio(c) do nucleo continua sendo o PISO, pro caso de a malha nao ser
// medivel.
//
// Cada copa e entao o MAXIMO entre a silhueta desenhada e o cranio medido: o
// chapeu tem a forma que o desenhista quis e mesmo assim nunca corta a cabeca.
//
// Alturas (a junta da cabeca fica em y = 1.574 no mundo): o queixo esta em
// -0.246, os olhos em +0.047, a sobrancelha em ~+0.084 e o alto do cranio entre
// +0.14 (achatada) e +0.34 (comprida). Por isso TODA aba deste arquivo assenta
// entre +0.086 e +0.10: mais baixo e o chapeu tapa o olho.
// ---------------------------------------------------------------------------

// Teto de altura da copa, no espaco da cabeca. Existe pelo MUNDO, nao pela
// cabeca: a junta da cabeca esta em y = 1.574, entao 0.352 poe o alto da copa
// em 1.926 e deixa margem pro que ainda vem por cima dela (o domo da cartola
// sobe mais 1,5 cm, o pompom da touca mais 4). O limite e 1.95 — acima disso o
// chapeu passa do quadro nas miniaturas do customizador e bate no batente das
// portas do interior.
//
// Ele SO morde nos cranios altos (o comprido para em 0.335). Quando morde, o
// que sobra de folga sobre a cabeca encolhe, e por isso todo detalhe que
// consome altura pra dentro — o vinco do chapeu 1 — mede quanto ainda tem.
const TETO_COPA = 0.352

// ---------------------------------------------------------------------------
// MEDIDA DO CRANIO ATIVO
// ---------------------------------------------------------------------------

// Faixas da tabela de raio. 22 sobre ~0.28 m da 1,3 cm por faixa — mais fino
// que isso e as faixas comecam a cair entre duas linhas da malha e ficam vazias.
const FAIXAS = 22

/** A malha do cranio: o mesh com MAIS vertices pendurado direto na junta head
 *  (as orelhas tambem moram la, com um sexto dos vertices). */
function malhaDoCranio(c) {
  const j = c.partes && c.partes.head
  if (!j || !j.children) return null
  let melhor = null
  let quantos = 0
  for (const o of j.children) {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes) continue
    const p = o.geometry.attributes.position
    if (!p || p.count <= quantos) continue
    quantos = p.count
    melhor = o
  }
  return melhor
}

/**
 * Mede o cranio ATIVO e devolve { topo, A, rx[], rz[], y0, dy }.
 * A tabela guarda o MAIOR |x| e |z| de cada faixa de altura. Depois de
 * preenchida ela e DILATADA uma faixa pra cada lado: entre duas linhas da malha
 * a superficie ainda incha, e uma faixa vazia (a malha e esparsa perto do alto)
 * zeraria o raio no meio da copa e o chapeu afundaria ali.
 */
function cranio(c) {
  const A = N.apoio(c)
  const K = {
    A, topo: A.ry, y0: -0.030, dy: (A.ry + 0.030) / FAIXAS,
    rx: new Float64Array(FAIXAS + 1), rz: new Float64Array(FAIXAS + 1),
  }
  const m = malhaDoCranio(c)
  if (!m) {
    // Sem malha medivel (miniatura sem cabeca, catalogo de rosto ausente): o
    // elipsoide de apoio vira a tabela. Fica folgado, mas nunca corta.
    for (let i = 0; i <= FAIXAS; i++) {
      const y = K.y0 + i * K.dy
      const k = Math.sqrt(Math.max(0, 1 - (y / A.ry) * (y / A.ry)))
      K.rx[i] = A.rx * k
      K.rz[i] = A.rz * k
    }
    return K
  }
  const p = m.geometry.attributes.position
  const sx = Math.abs(m.scale.x) || 1
  const sy = Math.abs(m.scale.y) || 1
  const sz = Math.abs(m.scale.z) || 1
  let topo = -1e9
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) * sy
    if (y > topo) topo = y
  }
  K.topo = topo
  K.dy = (topo - K.y0) / FAIXAS
  for (let i = 0; i < p.count; i++) {
    let k = Math.round((p.getY(i) * sy - K.y0) / K.dy)
    if (k < 0) k = 0
    else if (k > FAIXAS) k = FAIXAS
    const x = Math.abs(p.getX(i) * sx)
    const z = Math.abs(p.getZ(i) * sz)
    if (x > K.rx[k]) K.rx[k] = x
    if (z > K.rz[k]) K.rz[k] = z
  }
  const ax = K.rx.slice()
  const az = K.rz.slice()
  for (let i = 0; i <= FAIXAS; i++) {
    const a = i > 0 ? i - 1 : 0
    const b = i < FAIXAS ? i + 1 : FAIXAS
    K.rx[i] = Math.max(ax[a], ax[i], ax[b])
    K.rz[i] = Math.max(az[a], az[i], az[b])
  }
  return K
}

const _r = { rx: 0, rz: 0 }

/** Raio do cranio na altura y. ZERO acima do alto da cabeca — e assim que a
 *  copa sabe que dali pra cima a forma e so dela. */
function noCranio(K, y) {
  const t = (y - K.y0) / K.dy
  if (t <= 0) { _r.rx = K.rx[0]; _r.rz = K.rz[0]; return _r }
  if (t >= FAIXAS) { _r.rx = 0; _r.rz = 0; return _r }
  const i = Math.floor(t)
  const f = t - i
  _r.rx = K.rx[i] + (K.rx[i + 1] - K.rx[i]) * f
  _r.rz = K.rz[i] + (K.rz[i + 1] - K.rz[i]) * f
  return _r
}

/**
 * Raio da CARNEIRA (a boca do chapeu) na altura y, ja com a folga do tecido.
 * O piso em A.rx * 0.80 existe pro cranio achatado, cujo alto para em 0.14: sem
 * ele um chapeu que assenta em 0.10 nasceria com 4 cm de boca.
 */
function boca(K, y, folga) {
  const r = noCranio(K, y)
  return {
    rx: Math.max(r.rx * folga, K.A.rx * 0.80),
    rz: Math.max(r.rz * folga, K.A.rz * 0.80),
  }
}

/** Onde a copa fecha: acima do cranio medido, nunca alem do teto. */
function altoDaCopa(K, yBase, folgaTopo, alturaMin) {
  return Math.min(TETO_COPA, Math.max(K.topo + folgaTopo, yBase + alturaMin))
}

// ---------------------------------------------------------------------------
// OS TRES GERADORES DE SUPERFICIE
// ---------------------------------------------------------------------------

/**
 * O QUAD DE UMA CELULA, SEM OS TRIANGULOS DE AREA ZERO.
 *
 * Toda copa deste arquivo fecha no eixo: na linha de cima do gomo (v = 0) o
 * raio e zero e os pontos da linha inteira caem NO MESMO LUGAR. O primeiro
 * triangulo de cada celula dessa linha fica (apice, ponto, apice) — area zero.
 * Ele nao pinta um pixel, mas nao e de graca:
 *   - sao 30 triangulos no bone, 28 no cowboy e 26 na touca de indice morto
 *     dentro de um orcamento de 4 000;
 *   - e, pior, o vertice i = 0 de cada gomo do bone NAO participa de nenhum
 *     outro triangulo. computeVertexNormals so tem area zero pra ele e devolve
 *     normal (0,0,0) — normal indefinida numa malha FrontSide. No bone, que de
 *     proposito NAO solda as normais, nao ha vizinho pra corrigir.
 * Emitir so o triangulo com area resolve os dois de uma vez e nao muda um
 * milimetro da silhueta.
 */
function quad(idx, pos, a, b, c, d) {
  const igual = (p, q) => Math.abs(pos[p * 3] - pos[q * 3]) < 1e-7
    && Math.abs(pos[p * 3 + 1] - pos[q * 3 + 1]) < 1e-7
    && Math.abs(pos[p * 3 + 2] - pos[q * 3 + 2]) < 1e-7
  if (!igual(a, c)) idx.push(a, b, c)
  if (!igual(b, d)) idx.push(c, b, d)
}

/**
 * Grade parametrica: fn(u, v, out) preenche um Vector3.
 *
 * A ordem dos indices e (a, a+linha, a+1): com u andando no sentido do azimute
 * (x = r sin az, z = r cos az, a mesma convencao da LatheGeometry do three) e v
 * descendo, isso poe a normal PRA FORA. Trocar os dois vira o chapeu do avesso
 * e ele some quando a camera passa por fora.
 */
function grade(nu, nv, fn) {
  const cu = nu + 1
  const cv = nv + 1
  const pos = new Float32Array(cu * cv * 3)
  const uvs = new Float32Array(cu * cv * 2)
  const idx = []
  const v3 = new THREE.Vector3()
  for (let j = 0; j < cv; j++) {
    for (let i = 0; i < cu; i++) {
      const k = j * cu + i
      fn(i / nu, j / nv, v3)
      pos[k * 3] = v3.x; pos[k * 3 + 1] = v3.y; pos[k * 3 + 2] = v3.z
      uvs[k * 2] = i / nu; uvs[k * 2 + 1] = j / nv
    }
  }
  // Os indices saem numa SEGUNDA passada porque quad() compara posicoes: no
  // laco de cima o vizinho de direita (k + 1) ainda nao foi escrito.
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const k = j * cu + i
      quad(idx, pos, k, k + cu, k + 1, k + cu + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  // Mesmo motivo do revolver(): a coluna u = 1 repete a u = 0 e sem soldar a
  // emenda acende como um risco vertical na frente do chapeu.
  soldarNormais(g)
  return g
}

/**
 * PAINEIS separados na mesma geometria: fn(painel, u, v, out).
 * NAO solda as normais de proposito — e a quina entre os gomos do bone. Cada
 * painel e um pedaco de superficie fechado em si, e a costura entre eles fica
 * marcada porque as normais de um nao entram na media do outro.
 */
function paineis(n, nu, nv, fn) {
  const cu = nu + 1
  const cv = nv + 1
  const porPainel = cu * cv
  const pos = new Float32Array(n * porPainel * 3)
  const uvs = new Float32Array(n * porPainel * 2)
  const idx = []
  const v3 = new THREE.Vector3()
  for (let g = 0; g < n; g++) {
    const base = g * porPainel
    for (let j = 0; j < cv; j++) {
      for (let i = 0; i < cu; i++) {
        const k = base + j * cu + i
        fn(g, i / nu, j / nv, v3)
        pos[k * 3] = v3.x; pos[k * 3 + 1] = v3.y; pos[k * 3 + 2] = v3.z
        uvs[k * 2] = i / nu; uvs[k * 2 + 1] = j / nv
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const k = base + j * cu + i
        quad(idx, pos, k, k + cu, k + 1, k + cu + 1)
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/**
 * Loft: uma pilha de secoes fechadas, costuradas de uma pra outra.
 * secoes[j](t, out) devolve o ponto no angulo t (0..1) daquela secao.
 *
 * Nao e um lathe disfarcado: cada secao tem raio, achatamento, altura E FORMA
 * proprios (a cartola muda a superelipse subindo), o que um perfil revolvido
 * nao consegue expressar.
 */
function loft(nLado, secoes) {
  const cu = nLado + 1
  const cv = secoes.length
  const pos = new Float32Array(cu * cv * 3)
  const uvs = new Float32Array(cu * cv * 2)
  const idx = []
  const v3 = new THREE.Vector3()
  for (let j = 0; j < cv; j++) {
    for (let i = 0; i < cu; i++) {
      const k = j * cu + i
      secoes[j](i / nLado, v3)
      pos[k * 3] = v3.x; pos[k * 3 + 1] = v3.y; pos[k * 3 + 2] = v3.z
      uvs[k * 2] = i / nLado; uvs[k * 2 + 1] = j / (cv - 1)
      if (i < nLado && j < cv - 1) idx.push(k, k + cu, k + 1, k + 1, k + cu, k + cu + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  soldarNormais(g)
  return g
}

/**
 * Lathe de um contorno escrito DO ALTO PRA BAIXO.
 *
 * LatheGeometry orienta a face pelo SENTIDO do perfil: subindo, a normal sai
 * pra fora; descendo, sai pra dentro — e a peca fica iluminada pelo avesso
 * (chapa escura de fora, acesa por dentro, e a sombra caindo pro lado errado).
 * O resto do projeto escreve perfil de baixo pra cima porque copia o perfil do
 * CORPO, que nasce no quadril. Aqui nao: chapeu se desenha do alto da copa pra
 * aba, que e a ordem em que se pensa a peca. Esta funcao vira o contorno na
 * hora de virar geometria pra que as duas coisas convivam.
 *
 * Foi um bug de verdade: os cinco primeiros perfis deste arquivo nasceram do
 * avesso e so o teste de volume com sinal pegou.
 */
function doAltoPraBaixo(perfil, seg, kz, phi0, phiLen) {
  return N.revolver(perfil.slice().reverse(), seg, kz, phi0, phiLen)
}

/** Nervura: multiplica x e z por um cosseno do azimute. Vale pra qualquer
 *  geometria ja pronta — e assim que a nervura do gorro atravessa a dobra da
 *  barra, que e um lathe e nao uma grade. */
function nervurar(geo, n, amp, desde, ate) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const y = p.getY(i)
    const d = Math.hypot(x, z)
    if (d < 1e-5) continue
    const f = 1 + amp * Math.cos(n * Math.atan2(x, z)) * smoothstep(desde, ate, y)
    p.setX(i, x * f)
    p.setZ(i, z * f)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  soldarNormais(geo)
  return geo
}

// ===========================================================================

export const CHAPEUS = [
  { id: 'nenhum', nome: 'Nenhum', metodo: 'sem peca', build() { return null } },

  // -------------------------------------------------------------------------
  // 1 CHAPEU — lathe de perfil unico fechado.
  // -------------------------------------------------------------------------
  {
    id: 'chapeu',
    nome: 'Chapeu',
    metodo: 'lathe de perfil unico fechado (copa, aba, rebordo virado e forro num contorno so) com o vinco central rebaixado depois',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x4b4136
      const feltro = N.tecido2(cor, 0.88)

      // A aba assenta 1,6 cm acima da sobrancelha. Foi o unico jeito de o
      // chapeu ficar em cima da testa nos seis cranios: a sobrancelha e o unico
      // traco cuja altura quase nao muda entre eles.
      const yA = 0.100
      const B = boca(K, yA, 1.10)
      const rb = B.rx
      const kz = B.rz / rb
      // 6,2 cm acima do cranio e nao 2 cm: o VINCO come 20% da altura da copa,
      // e com a folga apertada ele afundava a copa dentro do cranio comprido —
      // o furo aparecia como um naco de cabeca saindo pelo alto do chapeu.
      const yT = altoDaCopa(K, yA, 0.062, 0.140)
      const hc = yT - yA
      const ro = rb * 1.60

      // O contorno DA A VOLTA: sobe pelo lado de fora da copa, sai pela aba,
      // vira no rebordo, volta por baixo da aba e sobe por DENTRO ate fechar no
      // eixo. Todas as bordas tem espessura porque nenhuma delas e uma borda:
      // sao dobras do mesmo pano.
      const geo = doAltoPraBaixo([
        [0.0000, yT],
        [rb * 0.30, yT - hc * 0.010],
        [rb * 0.60, yT - hc * 0.045],
        [rb * 0.83, yT - hc * 0.125],
        [rb * 0.94, yT - hc * 0.235],
        [rb * 0.975, yA + hc * 0.52],
        [rb * 0.995, yA + hc * 0.18],
        [rb * 1.030, yA + 0.006],
        [rb * 1.450, yA - 0.010],
        [ro * 0.880, yA - 0.019],
        [ro * 0.965, yA - 0.013],
        [ro * 1.000, yA + 0.003],   // ponta virada pra cima: o "snap" da aba
        [ro * 0.992, yA - 0.008],
        [ro * 0.955, yA - 0.024],
        [ro * 0.870, yA - 0.030],
        [rb * 1.440, yA - 0.021],
        [rb * 1.040, yA - 0.008],
        [rb * 0.965, yA - 0.002],
        [rb * 0.940, yA + hc * 0.22],
        [rb * 0.918, yA + hc * 0.70],
        [rb * 0.520, yT - 0.020],
        [0.0000, yT - 0.010],       // forro do topo: 1 cm de feltro, sempre
      ], 26, kz)

      // O VINCO. Sem ele a copa e um cilindro com tampa e o chapeu le como
      // balde. A gaussiana em x amassa a faixa do meio (x pequeno) e deixa as
      // duas "asas" laterais intactas; o smoothstep em y garante que o amasso
      // morra antes de chegar na aba.
      //
      // A PROFUNDIDADE E LIMITADA PELO CRANIO. O vinco desce do alto da copa
      // pra dentro, e no cranio comprido nao ha 5 cm de vao la em cima pra
      // gastar: o amasso passava do forro e a moleira aparecia por cima do
      // feltro. Sobra sempre 2,6 cm entre o fundo do vinco e a cabeca.
      const fundo = Math.max(0, Math.min(hc * 0.20, yT - K.topo - 0.026))
      const pos = geo.attributes.position
      const y0 = yT - hc * 0.42
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y <= y0) continue
        const t = smoothstep(y0, yT - hc * 0.05, y)
        const d = Math.exp(-Math.pow(pos.getX(i) / (rb * 0.42), 2))
        pos.setY(i, y - fundo * t * d)
      }
      pos.needsUpdate = true
      geo.computeVertexNormals()
      soldarNormais(geo)
      g.add(N.sh(new THREE.Mesh(geo, feltro)))

      // Fita: sai da MESMA carneira, 2 mm por fora da parede da copa naquela
      // altura (a parede afina subindo, entao um raio fixo enterraria a fita em
      // cima e a deixaria solta embaixo).
      const fita = N.tecido(N.esc(cor, 0.42), 0.75)
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.014, yA + hc * 0.32],
        [rb * 1.030, yA + hc * 0.28],
        [rb * 1.034, yA + 0.016],
        [rb * 1.028, yA + 0.010],
      ], 26, kz), fita)))

      // No da fita do lado esquerdo: e o detalhe que tira a simetria de torno.
      const no = N.bloco(0.030, 0.026, 0.014, 0.008, fita)
      no.position.set(-rb * 0.86, yA + hc * 0.16, rb * kz * 0.50)
      no.rotation.y = -0.62
      g.add(no)

      // Dois graus e meio pra frente: chapeu perfeitamente nivelado le como
      // objeto pousado na cabeca, nao como chapeu vestido por alguem. Mais que
      // isso e a aba comeca a raspar na sobrancelha do cranio de testa alta.
      g.rotation.x = 0.042
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 2 BONE — seis gomos costurados.
  // -------------------------------------------------------------------------
  {
    id: 'bone',
    nome: 'Bone',
    metodo: 'seis gomos: paineis independentes na mesma malha (normais nao soldadas = quina de verdade na costura) + aba de tira curva com secao arredondada',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0xa8383a
      const m = N.tecido(cor, 0.88)
      const escuro = N.tecido(N.esc(cor, 0.72), 0.85)

      const yB = 0.086
      const B = boca(K, yB, 1.10)
      const rb = B.rx
      const kz = B.rz / rb
      const yT = altoDaCopa(K, yB, 0.020, 0.118)

      // Silhueta da copa: quarto de elipse do alto ate a carneira. Os semi-eixos
      // finais sao o MAXIMO entre ela e o cranio medido, CADA UM NO SEU EIXO —
      // assim a copa e uma cupula lisa no cranio achatado e acompanha o cone no
      // comprido, sem cortar nenhum dos dois. Guardar so o X deixava o cranio
      // fundo (o realista tem 21 cm de Z contra 17 de X) sair pela testa.
      const raioEm = (v) => {
        const y = yB + (yT - yB) * Math.cos(v * Math.PI / 2)
        const forma = rb * Math.sin(v * Math.PI / 2)
        const s = noCranio(K, y)
        return { y, rx: Math.max(forma, s.rx * 1.06), rz: Math.max(forma * kz, s.rz * 1.06) }
      }

      // 6 gomos com 1,6 grau de folga entre eles: e nessa folga que a costura
      // (a nervura de baixo) aparece. Gomo colado no vizinho vira casca lisa.
      const GOMOS = 6
      const VAO = 0.028
      const passo = (Math.PI * 2) / GOMOS
      const crown = paineis(GOMOS, 5, 8, (k, u, v, out) => {
        const az = k * passo + VAO / 2 + u * (passo - VAO)
        const e = raioEm(v)
        // o painel INCHA entre as duas costuras: e o que faz o bone ter seis
        // faces em vez de ser uma bola com riscos
        const f = 1 + 0.020 * Math.sin(Math.PI * u) * v
        out.set(e.rx * f * Math.sin(az), e.y, e.rz * f * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(crown, m)))

      // Costura: fita estreita revolvida em cima da folga, por fora do painel.
      // Sai do MESMO perfil da copa, entao acompanha o cranio junto com ele.
      //
      // A lathe so sabe UM achatamento em Z, e a copa agora tem um Z proprio por
      // altura (a guarda do cranio age nos dois eixos separados). Usa-se o MAIOR
      // dos achatamentos do meridiano: assim a costura fica por fora do painel na
      // volta inteira. Sobrar 2 mm em X num vinco de 6 mm nao se ve; afundar 2 mm
      // em Z apagaria a costura justo na frente do bone.
      const meridiano = []
      let kzCostura = kz
      for (let i = 1; i <= 9; i++) {
        const e = raioEm(i / 9)
        meridiano.push([e.rx * 1.012 + 0.001, e.y])
        if (e.rz / e.rx > kzCostura) kzCostura = e.rz / e.rx
      }
      for (let k = 0; k < GOMOS; k++) {
        g.add(N.sh(new THREE.Mesh(
          doAltoPraBaixo(meridiano, 2, kzCostura, k * passo - 0.030, 0.060), escuro,
        )))
      }

      // Botao do topo, achatado (esfera inteira le como bola de gude).
      const botao = N.bola(0.019, escuro, 10)
      botao.scale.y = 0.62
      botao.position.y = yT - 0.002
      g.add(botao)

      // ABA. A secao atravessa: s = sin(pi v) vai da carneira ate a ponta e
      // volta, e o deslocamento em y (cos) separa a face de cima da de baixo.
      // Resultado: 13 mm de espessura e a ponta FECHADA, sem borda de papel.
      const ANG = 1.55
      const L0 = 0.145
      const ESP = 0.013
      const aba = grade(24, 8, (u, v, out) => {
        const t = u * 2 - 1
        const a = t * ANG
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESP * 0.5
        // a aba encolhe indo pro lado (na tempora ela quase encosta na copa) e
        // CURVA pra baixo: o termo em t^2 e a diferenca entre uma aba de bone e
        // um meio disco plano
        const L = L0 * (0.30 + 0.70 * Math.pow(Math.cos(t * Math.PI / 2), 0.85))
        const y = yB + 0.004 - 0.028 * s * s - 0.042 * t * t * s + off
        out.set((rb * 0.995 + L * s) * Math.sin(a), y, (rb * kz * 0.995 + L * s) * Math.cos(a))
      })
      g.add(N.sh(new THREE.Mesh(aba, N.tecido2(N.esc(cor, 0.88), 0.85))))

      // Debrum da carneira: a bainha que fecha a boca do bone por baixo.
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.004, yB + 0.022],
        [rb * 1.030, yB + 0.010],
        [rb * 1.030, yB - 0.010],
        [rb * 0.994, yB - 0.018],
      ], 24, kz), escuro)))

      // Fecho de tras: a tirinha regulavel. Detalhe pequeno, mas e o que faz o
      // objeto parecer costurado por alguem.
      const fecho = N.caixa(0.052, 0.016, 0.010, escuro)
      fecho.position.set(0, yB + 0.024, -(rb * kz + 0.006))
      g.add(fecho)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 3 GORRO — casca com nervura por deslocamento.
  // -------------------------------------------------------------------------
  {
    id: 'gorro',
    nome: 'Gorro',
    metodo: 'casca de revolucao com nervura de trico por deslocamento radial em cosseno, mais barra dobrada de perfil que volta por dentro (a mesma nervura e reaplicada nela)',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x3a5b86
      const la = N.tecido(cor, 0.97)
      const laBarra = N.tecido2(N.esc(cor, 1.16), 0.97)

      // Trico de 10 canais. Nao e 16: com 16 seriam precisas 64 colunas pra
      // desenhar o cosseno e o gorro custaria mais que a cabeca. Com 10 o canal
      // fica GROSSO, que e o que se ve num gorro de la de longe.
      const NERVOS = 10
      const AMP = 0.020

      const yB = 0.062              // a barra desce ate aqui: tapa a testa
      const yC = yB + 0.014         // onde a casca comeca (por dentro da barra)
      const Bb = boca(K, yB - 0.012, 1.085)
      const Bc = boca(K, yC, 1.075)
      const rb = Bb.rx
      const kzB = Bb.rz / rb
      const rc = Bc.rx
      const kzC = Bc.rz / rc
      // 3,2 cm e nao 1,6: o TOMBO desce a ponta da casca mais 1,4 cm, e com a
      // folga curta o alto do cranio quadrado raspava na la por dentro
      const yT = altoDaCopa(K, yB, 0.032, 0.152)

      const casca = grade(40, 11, (u, v, out) => {
        const az = u * Math.PI * 2
        const q = Math.cos(v * Math.PI / 2)       // 1 no alto, 0 na carneira
        // o gorro TOMBA pra tras: a ponta de um gorro de la nunca fica em pe.
        // A potencia 1.8 concentra o tombo no ultimo terco, senao a casca
        // inteira desliza e abre um vao na testa.
        const cai = Math.pow(q, 1.8)
        const tomba = 0.030 * cai
        const y = yC + (yT - yC) * q - 0.014 * cai
        // O TOMBO ENTRA NA CONTA DA FOLGA. A casca inteira anda pra tras, entao
        // a metade da FRENTE fica 3 cm mais perto da testa do que o raio dizia,
        // e no cranio comprido a testa saia pela la. Somar o tombo no semi-eixo
        // de Z devolve exatamente o que ele tirou.
        const s = noCranio(K, y)
        const forma = rc * Math.sin(v * Math.PI / 2)
        const rx = Math.max(forma, s.rx * 1.06)
        const rz = Math.max(forma * kzC, s.rz * 1.06 + tomba)
        out.set(rx * Math.sin(az), y, rz * Math.cos(az) - tomba)
      })
      nervurar(casca, NERVOS, AMP, yC - 0.005, yC + 0.055)
      g.add(N.sh(new THREE.Mesh(casca, la)))

      // BARRA DOBRADA. O perfil desce por fora, vira embaixo e volta subindo
      // POR DENTRO: e uma dobra com 8 mm de espessura, nao um torus encostado.
      // A ponta de cima fica aberta escondida atras da casca — por isso o
      // material e DoubleSide.
      const barra = doAltoPraBaixo([
        [rb * 1.000, yB + 0.076],
        [rb * 1.052, yB + 0.068],
        [rb * 1.074, yB + 0.032],
        [rb * 1.068, yB + 0.004],
        [rb * 1.028, yB - 0.007],
        [rb * 0.986, yB + 0.009],
        [rb * 0.976, yB + 0.052],
      ], 40, kzB)
      // Mesma nervura da casca, aplicada depois: o canal do trico atravessa a
      // dobra sem emenda. Aqui ela vale na barra INTEIRA (o smoothstep abre bem
      // abaixo do pe dela), senao a dobra ficaria lisa ao lado da casca canelada.
      nervurar(barra, NERVOS, AMP * 0.72, yB - 0.20, yB - 0.16)
      g.add(N.sh(new THREE.Mesh(barra, laBarra)))
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 4 COWBOY — grade parametrica (campo de azimute).
  // -------------------------------------------------------------------------
  {
    id: 'cowboy',
    nome: 'Cowboy',
    metodo: 'grade parametrica: aba levantada nas laterais por sin(az)^2 e copa amassada por campos gaussianos (os dois amassos laterais e o vinco do pinch front)',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0x9b7a49
      const feltro = N.tecido(cor, 0.92)

      const yA = 0.098
      const B = boca(K, yA, 1.09)
      const rb = B.rx
      const kz = B.rz / rb
      const yT = altoDaCopa(K, yA, 0.030, 0.175)
      const hc = yT - yA

      // COPA. q = 1 no alto, 0 na carneira. A silhueta e quase reta ate 60% e
      // so entao arredonda (potencia 3 sobre q): copa hemisferica le como
      // capacete, e foi por isso que a versao antiga precisou de um cilindro
      // com uma caixa amassada em cima.
      //
      // O AMASSO E O VINCO COMEM ESPACO PRA DENTRO, e quanto espaco existe
      // depende do cranio: no comprido a copa ja encosta no teto e nao ha 5 cm
      // de vao la em cima pra gastar. Os dois sao medidos ANTES — o amasso pela
      // guarda do cranio, o vinco por esta conta — e no cranio alto o chapeu
      // sai so menos amassado, em vez de mostrar a moleira por cima do feltro.
      const fundo = Math.max(0, Math.min(hc * 0.20, yT - K.topo - 0.026))
      const copa = grade(28, 10, (u, v, out) => {
        const az = u * Math.PI * 2
        const sa = Math.sin(az)
        const q = 1 - v
        const y0 = yA + hc * q
        const perfil = Math.pow(Math.max(0, 1 - Math.pow(q, 3.0)), 1 / 2.2)
        // AMASSO LATERAL: a gaussiana em q pega so a faixa de cima e o sa^2
        // pega so os lados. Sao os dois dedos que apertam o chapeu pra tirar
        // ele da cabeca, e e essa marca que identifica um chapeu de cowboy.
        const base = rb * perfil * (1 + 0.030 * (1 - q))
          * (1 - 0.24 * Math.exp(-Math.pow((q - 0.70) / 0.24, 2)) * sa * sa)
        const s = noCranio(K, y0)
        const x = Math.max(base, s.rx * 1.06) * sa
        const z = Math.max(base * kz, s.rz * 1.06) * Math.cos(az)
        // VINCO CENTRAL: rebaixa a faixa x ~ 0, de novo so perto do alto.
        const vinco = Math.exp(-Math.pow(x / (rb * 0.40), 2)) * smoothstep(0.50, 0.95, q)
        out.set(x, y0 - fundo * vinco, z)
      })
      g.add(N.sh(new THREE.Mesh(copa, feltro)))

      // ABA. Mesma secao atravessada do bone, mas agora dando a volta inteira e
      // com a altura mandada pelo AZIMUTE: sin(az)^2 vale 1 nos lados e 0 na
      // frente, entao as duas laterais sobem e a frente e a nuca ficam baixas.
      // E o unico detalhe que faz uma aba de 360 graus nao ler como sombrero.
      const L0 = 0.155
      const ESP = 0.014
      const aba = grade(32, 8, (u, v, out) => {
        const az = u * Math.PI * 2
        const sa = Math.sin(az)
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESP * 0.5
        const L = L0 * (1 + 0.14 * Math.cos(2 * az))
        const y = yA - 0.004 - 0.020 * s * s + 0.078 * s * s * sa * sa + off
        out.set((rb * 1.020 + L * s) * sa, y, (rb * kz * 1.020 + L * s) * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(aba, N.tecido2(N.esc(cor, 0.94), 0.92))))

      // Tira de couro trancado e a fivela lateral.
      const couro = N.couro(0x33241a)
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.026, yA + 0.046],
        [rb * 1.044, yA + 0.038],
        [rb * 1.044, yA + 0.018],
        [rb * 1.030, yA + 0.010],
      ], 28, kz), couro)))
      const fivela = N.caixa(0.006, 0.024, 0.020, N.metal(0xc7b07a))
      fivela.position.set(rb * 1.03, yA + 0.028, rb * kz * 0.42)
      fivela.rotation.y = 0.72
      g.add(fivela)
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 5 TOUCA COM POMPOM — casca + fios.
  // -------------------------------------------------------------------------
  {
    id: 'touca',
    nome: 'Touca com pompom',
    metodo: 'casca de la lisa mais FIOS de verdade (tecelagem()/fio(), os mesmos da barba): 40 fios no pompom e 18 na franja da barra',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const cor = 0xd8cfbc
      const la = N.tecido(cor, 0.99)

      const yB = 0.076
      const yC = yB + 0.012
      const Bb = boca(K, yB - 0.010, 1.085)
      const Bc = boca(K, yC, 1.075)
      const rb = Bb.rx
      const kzB = Bb.rz / rb
      const rc = Bc.rx
      const kzC = Bc.rz / rc
      const yT = altoDaCopa(K, yB, 0.020, 0.130)

      // A casca aqui e de proposito LISA e curta: o interesse desta peca sao os
      // fios, e uma casca canelada por baixo de um pompom peludo vira poluicao.
      const casca = grade(26, 9, (u, v, out) => {
        const az = u * Math.PI * 2
        const q = Math.cos(v * Math.PI / 2)
        const y = yC + (yT - yC) * q
        // expoente 0.86 (e nao 1) engorda a casca a meia altura: touca de la e
        // um saco, nao uma cupula esticada
        const forma = rc * Math.pow(Math.sin(v * Math.PI / 2), 0.86)
        const s = noCranio(K, y)
        out.set(Math.max(forma, s.rx * 1.06) * Math.sin(az), y,
          Math.max(forma * kzC, s.rz * 1.06) * Math.cos(az))
      })
      g.add(N.sh(new THREE.Mesh(casca, la)))

      // Barra virada, com a mesma dobra de espessura do gorro (aqui ela e mais
      // gorda: touca de inverno tem a barra dupla).
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.000, yB + 0.070],
        [rb * 1.060, yB + 0.060],
        [rb * 1.086, yB + 0.026],
        [rb * 1.078, yB + 0.000],
        [rb * 1.026, yB - 0.011],
        [rb * 0.984, yB + 0.006],
        [rb * 0.974, yB + 0.048],
      ], 26, kzB), N.tecido2(N.esc(cor, 0.88), 0.99))))

      // POMPOM. Bola lisa era o que o dono chamou de bloco: aqui sao 40 fios
      // saindo de um nucleo, cada um com comprimento e curva proprios. O nucleo
      // continua existindo (uma bolinha pequena) so pra nao se ver o vazio
      // entre as raizes quando a camera chega perto.
      const ma = tecelagem()
      const alea = rng(9137)
      // O POMPOM ENTRA NO ORCAMENTO DE ALTURA JUNTO COM A COPA. No cranio
      // comprido a copa ja sobe ate o teto, e um pompom empoleirado em cima
      // dela punha a peca em 1.99 no mundo — 4 cm acima do que a conferencia
      // aceita. Aqui ele SENTA na copa (nao numa haste) e obedece ao mesmo
      // teto: nos cranios altos a ponta da copa fica DENTRO do tufo, que e como
      // um pompom costurado se comporta mesmo.
      const yPom = Math.min(yT + 0.010, TETO_COPA - 0.034)
      const centro = new THREE.Vector3(0, yPom, -0.006)
      const dir = new THREE.Vector3()
      const eixo = new THREE.Vector3()
      const FIOS = 40
      for (let i = 0; i < FIOS; i++) {
        // espiral de Fibonacci: distribuicao uniforme na esfera sem sorteio, o
        // que evita o pompom "careca" de um lado que o sorteio puro produz
        const t = (i + 0.5) / FIOS
        const uy = 1 - 2 * t
        const rr = Math.sqrt(Math.max(0, 1 - uy * uy))
        const ph = i * 2.39996
        dir.set(rr * Math.cos(ph), uy, rr * Math.sin(ph))
        eixo.set(dir.z, 0.2, -dir.x).normalize()
        const comp = 0.024 + alea() * 0.014
        fio(ma, centro.clone().addScaledVector(dir, 0.007), dir, comp, 0.0050,
          eixo, 0.5 + alea() * 0.7, 4, 3)
      }
      const nucleo = N.bola(0.017, peloMat(N.esc(cor, 1.04), 0), 8)
      nucleo.position.copy(centro)
      g.add(nucleo)

      // FRANJA: os fios que escapam por baixo da barra. Mesmo acumulador, entao
      // pompom e franja saem numa geometria e num draw call so.
      const FRANJA = 18
      for (let i = 0; i < FRANJA; i++) {
        const az = (i / FRANJA) * Math.PI * 2 + 0.11
        const sa = Math.sin(az)
        const ca = Math.cos(az)
        dir.set(sa * 0.35, -1, ca * 0.35).normalize()
        eixo.set(ca, 0, -sa)
        fio(ma, new THREE.Vector3(rb * 1.03 * sa, yB - 0.006, rb * kzB * 1.03 * ca),
          dir, 0.020 + alea() * 0.010, 0.0034, eixo, 0.35, 3, 3)
      }
      if (!ma.vazia) g.add(N.sh(new THREE.Mesh(ma.geo(), peloMat(cor, 0))))
      return g
    },
  },

  // -------------------------------------------------------------------------
  // 6 CARTOLA — loft de secoes.
  // -------------------------------------------------------------------------
  {
    id: 'cartola',
    nome: 'Cartola',
    metodo: 'loft: secoes fechadas empilhadas e costuradas, cada uma com raio, achatamento e expoente proprios (copa com cintura, aba com rebordo enrolado)',
    build(c) {
      const K = cranio(c)
      const g = new THREE.Group()
      const seda = solid(0x1d1a20, 0.34, 0.06)
      const sedaAberta = solid(0x1d1a20, 0.34, 0.06, { side: THREE.DoubleSide })

      const yA = 0.096
      const B = boca(K, yA, 1.07)
      const rb = B.rx
      const kz0 = B.rz / rb
      const yT = altoDaCopa(K, yA, 0.028, 0.215)
      const hc = yT - yA

      // COPA. Doze secoes ate o alto mais tres pro arremate. Cada secao sabe
      // TRES coisas proprias: o raio (com a cintura), o achatamento (a boca e
      // ovalada como a cabeca e o alto e quase redondo) e o expoente da
      // superelipse. E essa variacao de forma ao longo da pilha que um lathe
      // nao expressa: lathe so muda o raio.
      const secoes = []
      const NA = 12
      for (let j = 0; j <= NA; j++) {
        const t = j / NA
        const y = yA + hc * t
        // cintura: -7% no meio, +11% no alto. Cartola de parede reta le como
        // lata de tinta; a cintura e a assinatura da peca.
        const cint = rb * (1.00 - 0.070 * Math.sin(Math.PI * t) + 0.110 * t * t)
        const cr = noCranio(K, y)
        const rr = Math.max(cint, cr.rx * 1.045)
        // o achatamento vira redondo subindo, mas nunca abaixo do cranio: e a
        // mesma guarda por eixo das outras copas
        const rz = Math.max(cint * (kz0 + (1 - kz0) * t * 0.55), cr.rz * 1.045)
        const n = 2 + 0.55 * (1 - t)     // boca levemente superelipse, alto redondo
        secoes.push((u, out) => {
          const az = u * Math.PI * 2
          const sa = Math.sin(az)
          const ca = Math.cos(az)
          const f = 1 / Math.pow(Math.pow(Math.abs(sa), n) + Math.pow(Math.abs(ca), n), 1 / n)
          out.set(rr * sa * f, y, rz * ca * f)
        })
      }
      // arremate do topo: tres secoes que fecham no eixo com um domo raso
      const rTopo = rb * (1.00 + 0.110)
      for (const [k, dy] of [[0.90, 0.006], [0.60, 0.012], [0.02, 0.015]]) {
        secoes.push((u, out) => {
          const az = u * Math.PI * 2
          out.set(rTopo * k * Math.sin(az), yT + dy, rTopo * k * kz0 * 0.99 * Math.cos(az))
        })
      }
      // A pilha e montada da carneira pro alto porque e assim que a cintura se
      // descreve; o loft costura no sentido contrario pela mesma razao do
      // doAltoPraBaixo — v tem que DESCER pra normal sair pra fora.
      g.add(N.sh(new THREE.Mesh(loft(26, secoes.reverse()), seda)))

      // ABA. Tambem loft, e aqui as secoes servem pra outra coisa: cada anel e
      // um passo da SECAO TRANSVERSAL do rebordo (sai da copa, vai ate a ponta
      // e volta por baixo). Ponta fechada, 16 mm de espessura, e as laterais
      // enroladas pra cima como manda a peca.
      const L0 = 0.118
      const ESP = 0.016
      const aneis = []
      const NR = 9
      for (let j = 0; j <= NR; j++) {
        const v = j / NR
        const s = Math.sin(Math.PI * v)
        const off = Math.cos(Math.PI * v) * ESP * 0.5
        aneis.push((u, out) => {
          const az = u * Math.PI * 2
          const sa = Math.sin(az)
          const L = L0 * (1 + 0.10 * Math.cos(2 * az)) * s
          const y = yA - 0.006 - 0.014 * s * s + 0.062 * s * s * sa * sa + off
          out.set((rb * 1.010 + L) * sa, y, (rb * kz0 * 1.010 + L) * Math.cos(az))
        })
      }
      g.add(N.sh(new THREE.Mesh(loft(26, aneis), sedaAberta)))

      // Fita de gorgorao e a fivela: a cartola vive dessa faixa fosca contra a
      // seda. Ela nasce 3 mm por fora da parede da copa naquela altura.
      const fita = N.tecido(0x141216, 0.94)
      g.add(N.sh(new THREE.Mesh(doAltoPraBaixo([
        [rb * 1.002, yA + 0.054],
        [rb * 1.018, yA + 0.048],
        [rb * 1.022, yA + 0.014],
        [rb * 1.014, yA + 0.008],
      ], 26, kz0), fita)))
      const fivela = N.caixa(0.030, 0.026, 0.008, N.metal(0xd0b45a))
      fivela.position.set(0, yA + 0.030, rb * kz0 * 1.03)
      g.add(fivela)
      return g
    },
  },
]

export default CHAPEUS
