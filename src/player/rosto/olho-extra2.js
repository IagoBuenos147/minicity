import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD_S, EYE_ANCHOR, useHead, faceSpread, surfaceZ, skinOf,
  shade, sh, flatPiece, mix, fechamentoOlho, hairColorFrom,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/olho-extra2.js — SEIS OLHOS, MESMA FAMILIA, MIOLO NOVO.
//
// O pedido do dono depois de ver o catalogo: "faca mais 6 olhos diferentes
// ALTERANDO UM POUCO A PUPILA, gostei bastante do numero 09" — o 09 e o
// 'cartoon-anel-iris' de olho-extra.js (duas calotas concentricas atras da
// pupila formando um anel de duas cores). Ou seja: ele quer mais variacao no
// MIOLO do olho (pupila/iris), no mesmo espirito daquele item — nao um olho
// novo. A bola branca saliente, o contorno por casca invertida e a palpebra
// propria em calota tombada, os tres pilares da familia descritos em
// olho-cartoon.js, NAO MUDAM em nenhum dos seis; so o desenho dentro da iris
// muda, exatamente como so a olheira/o brilho duplo/os cilios/o anel mudavam
// em olho-extra.js.
//
// olho-cartoon.js e olho-extra.js nao exportam a maquina interna
// (fabricar/calotaZ/palpebra sao privados de cada modulo) — o padrao ja
// estabelecido pelos catalogos "-extra" deste projeto e nao importar do
// irmao, entao este arquivo e AUTOSSUFICIENTE, so importa de nucleo.js. A
// bola/contorno/palpebra sao reconstruidos aqui com os MESMOS numeros (BOLA,
// AFUNDA, ESPACO, as quatro camadas L_*) dos outros dois arquivos, pro
// resultado ficar identico em proporcao aos nove olhos que ja existem.
//
// A REGRA DURA: todo detalhe de miolo e flatPiece() — calota unitaria
// (calotaZ) + escala radial (a camada, qual layer fica mais "pra fora" e
// portanto na frente) + rotacao (a posicao no globo). E o mesmo truque que a
// pupila, o brilho e o anel-iris ja usam nos nove olhos anteriores. Nenhum
// deles projeta sombra propria (CONTRATO item 7: sombra numa peca chapada
// colada no globo vira mancha preta que pisca), e todos os seis marcam
// `propriaPalpebra: true` porque desenham a propria palpebra em vez de usar a
// persiana generica.
// ---------------------------------------------------------------------------

const S = HEAD_S

// A bola e as quatro camadas: OS MESMOS NUMEROS de olho-cartoon.js e
// olho-extra.js, sem mudar nada. Mudar aqui desalinharia estes seis do resto
// da familia — ja sao nove olhos nesta mesma proporcao.
const BOLA = { rx: 0.0400 * S, ry: 0.0448 * S, rz: 0.0344 * S }
const AFUNDA = 0.40
const ESPACO = 0.93
const L_PUPILA = 1.012
const L_FIO = 1.030
const L_PALPEBRA = 1.042
const L_CONTORNO = 1.058
const TRACO = 0x14111a
const ARCO_ABERTO = 0.95
const ARCO_FECHADO = 1.52

/** Calota com o polo virado pra +Z — pupila, iris, e todo miolo novo daqui. */
function calotaZ(arco, wSeg = 20, hSeg = 8) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, arco)
  g.rotateX(Math.PI / 2)
  return g
}

/**
 * A palpebra: calota de PELE + o fio escuro da borda.
 * Copia fiel de olho-cartoon.js/olho-extra.js — o racional completo (por que
 * duas calotas, por que os sinais de `base` mudam em cima/embaixo) esta la.
 */
function palpebra(concha, alturaRim, arco, peleM, fioM, baixo, roll) {
  const a = Math.acos(Math.max(-1, Math.min(1, alturaRim)))
  const base = baixo ? a + arco : a - arco
  const r = roll || 0

  const fio = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, arco + 0.075), fioM))
  fio.scale.setScalar(L_FIO)
  fio.rotation.set(base, 0, r)
  concha.add(fio)

  const pele = flatPiece(new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, arco), peleM))
  pele.scale.setScalar(L_PALPEBRA)
  pele.rotation.set(base, 0, r)
  concha.add(pele)
}

// ---------------------------------------------------------------------------
// OS SEIS MIOLOS — cada um substitui o passo "a pupila" da fabrica padrao.
// Recebem a concha (raio 1, so rotacao dentro dela) e a orientacao do olhar
// (rotX, rotY) ja prontas, e desenham o que quiserem la dentro.
// ---------------------------------------------------------------------------

/**
 * 1) PUPILA MINIATURA — um raio angular de 0.095 contra o 0.22 padrao (menos
 * de metade) e deslocada pra CIMA: `olhaY` negativo, o mesmo sinal que o
 * cartoon-caido ja usa pra descrever "pupila pequena e alta" (o branco
 * aparece embaixo dela). O efeito e o oposto do item 2: sobra muito
 * branco/iris em volta de um pontinho preto — leitura de olho arregalado.
 */
function pupilaMiniatura({ concha, rotX, rotY, tracoM }) {
  const p = flatPiece(new THREE.Mesh(calotaZ(0.095, 16, 6), tracoM))
  p.scale.setScalar(L_PUPILA)
  p.rotation.x = rotX
  p.rotation.y = rotY
  concha.add(p)
}

/**
 * 2) PUPILA DOMINANTE — quase o dobro do teto que olho-cartoon.js documenta
 * pro olho padrao ("0.22 rad ... passar de 0.30 ja le como olho de gato
 * assustado"). Aqui isso e DE PROPOSITO: 0.40 de meio-angulo cobre a iris
 * quase inteira e deixa so uma borda fina de branco antes do contorno —
 * oposto do item 1.
 */
function pupilaDominante({ concha, rotX, rotY, tracoM }) {
  const p = flatPiece(new THREE.Mesh(calotaZ(0.40, 26, 10), tracoM))
  p.scale.setScalar(L_PUPILA)
  p.rotation.x = rotX
  p.rotation.y = rotY
  concha.add(p)
}

/**
 * 3) PUPILA DE GATO — a mesma calota de sempre, espremida no X LOCAL do
 * objeto antes da rotacao de posicionamento. Mesma tecnica do cilio em
 * olho-extra.js: como a calota nasce circular nos dois eixos locais, apertar
 * so um deles (0.20) e esticar o outro (1.35) vira uma fenda vertical
 * alongada — a pupila de felinos e repteis.
 */
function pupilaGato({ concha, rotX, rotY, tracoM }) {
  const p = flatPiece(new THREE.Mesh(calotaZ(0.34, 22, 8), tracoM))
  p.scale.set(0.20, 1.35, L_PUPILA)
  p.rotation.x = rotX
  p.rotation.y = rotY
  concha.add(p)
}

/**
 * 4) IRIS DE TRES ANEIS — evolucao direta do 'cartoon-anel-iris' que o dono
 * elogiou (duas calotas concentricas atras da pupila). Mesmo truque de
 * sempre: raio angular MENOR + escala MAIOR poe a camada MAIS PRA FORA,
 * entao cada calota tampa o centro da anterior e sobra so o anel dela. Do
 * centro pra fora: pupila preta -> anel escuro -> anel medio -> anel claro
 * -> branco do olho. O anel-iris original tinha dois tons; este tem tres.
 */
function irisTresAneis({ concha, rotX, rotY, ctx, tracoM }) {
  const base = hairColorFrom(ctx)
  const claro = shade(base, 1.45)
  const medio = shade(base, 1.0)
  const escuro = shade(base, 0.62)

  const externo = flatPiece(new THREE.Mesh(calotaZ(0.36, 22, 6), solid(claro, 0.5, 0.0)))
  externo.scale.setScalar(1.006)
  externo.rotation.x = rotX
  externo.rotation.y = rotY
  concha.add(externo)

  const meio = flatPiece(new THREE.Mesh(calotaZ(0.27, 20, 6), solid(medio, 0.5, 0.0)))
  meio.scale.setScalar(1.014)
  meio.rotation.x = rotX
  meio.rotation.y = rotY
  concha.add(meio)

  const interno = flatPiece(new THREE.Mesh(calotaZ(0.19, 18, 6), solid(escuro, 0.5, 0.0)))
  interno.scale.setScalar(1.022)
  interno.rotation.x = rotX
  interno.rotation.y = rotY
  concha.add(interno)

  const pupila = flatPiece(new THREE.Mesh(calotaZ(0.115, 16, 6), tracoM))
  pupila.scale.setScalar(1.030)
  pupila.rotation.x = rotX
  pupila.rotation.y = rotY
  concha.add(pupila)
}

/**
 * 5) REFLEXO EM MEIA-LUA — pupila normal com um risco de brilho em forma de
 * crescente no canto de dentro. E o MESMO truque do contorno do olho (casca
 * maior atras + casca menor na frente tampando o centro, so a beirada
 * aparece), aqui em disco: um disco claro (a "lua") e um disco PRETO um
 * pouco maior, um pouco mais pra fora (portanto por cima) e um pouco
 * deslocado do mesmo centro — ele tampa quase todo o disco claro e so uma
 * lasca em meia-lua sobra visivel na borda.
 */
function reflexoMeiaLua({ concha, rotX, rotY, tracoM }) {
  const pupila = flatPiece(new THREE.Mesh(calotaZ(0.20, 18, 8), tracoM))
  pupila.scale.setScalar(L_PUPILA)
  pupila.rotation.x = rotX
  pupila.rotation.y = rotY
  concha.add(pupila)

  const luaM = solid(0xfbfaf6, 0.10, 0.0)
  const lua = flatPiece(new THREE.Mesh(calotaZ(0.082, 14, 6), luaM))
  lua.scale.setScalar(L_PUPILA + 0.010)
  lua.rotation.x = rotX - 0.135
  lua.rotation.y = rotY + 0.100
  concha.add(lua)

  // o "corte": disco preto um pouco maior, um pouco mais pra frente e quase
  // no mesmo lugar da lua clara — tampa o miolo dela e so sobra a beirada.
  const corte = flatPiece(new THREE.Mesh(calotaZ(0.088, 14, 6), tracoM))
  corte.scale.setScalar(L_PUPILA + 0.018)
  corte.rotation.x = rotX - 0.100
  corte.rotation.y = rotY + 0.148
  concha.add(corte)
}

/**
 * 6) IRIS RAIADA — dez lasquinhas finas (mesma familia de peca que o cilio de
 * olho-extra.js: calota unitaria espremida no X local) giradas em roll
 * (rotation.z) por uma volta inteira em passos iguais, todas plantadas no
 * MESMO centro (rotX, rotY fixos pras dez, so o roll muda). Espremer-e-girar
 * em vez de mover cada uma da o raio saindo do centro, tipo sol/estrela. Uma
 * pupila pequena por cima, mais pra frente que os raios, esconde o
 * amontoado de pontas no meio.
 */
function irisRaiada({ concha, rotX, rotY, ctx, tracoM }) {
  const raioM = solid(shade(hairColorFrom(ctx), 0.58), 0.5, 0.0, { side: THREE.DoubleSide })
  const N = 10
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2
    const raio = flatPiece(new THREE.Mesh(calotaZ(0.30, 8, 3), raioM))
    raio.scale.set(0.070, 1, L_PUPILA + 0.006)
    raio.rotation.set(rotX, rotY, ang)
    concha.add(raio)
  }

  const pupila = flatPiece(new THREE.Mesh(calotaZ(0.105, 14, 6), tracoM))
  pupila.scale.setScalar(L_PUPILA + 0.016)
  pupila.rotation.x = rotX
  pupila.rotation.y = rotY
  concha.add(pupila)
}

// ---------------------------------------------------------------------------
// A FABRICA — igual a olho-cartoon.js/olho-extra.js ate o passo do miolo;
// dali em diante quem desenha e o `cfg.miolo` de cada item. Sem os campos de
// assimetria (`assim`/`desvio`) dos outros dois arquivos: nenhum dos seis
// mexe em olho-torto, entao a fabrica fica mais simples sem eles.
// ---------------------------------------------------------------------------

function fabricar(cfg, ctx) {
  useHead(ctx)
  const pele = skinOf(ctx)
  const k = fechamentoOlho(ctx)

  const brancoM = solid(0xf6f4ef, 0.62, 0.0)
  const tracoM = solid(TRACO, 0.45, 0.0)
  const contornoM = solid(TRACO, 0.6, 0.0, { side: THREE.BackSide })
  const peleM = solid(pele, 0.72, 0.0, { side: THREE.DoubleSide })
  const fioM = solid(shade(pele, 0.16), 0.6, 0.0, { side: THREE.DoubleSide })
  const brilhoM = solid(0xffffff, 0.08, 0.0)

  const g = new THREE.Group()
  const spread = faceSpread()

  for (const sgn of [1, -1]) {
    const rx = BOLA.rx * cfg.escala
    const ry = BOLA.ry * cfg.escala * cfg.achata
    const rz = BOLA.rz * cfg.escala

    const olho = new THREE.Group()
    const x = EYE_ANCHOR.x * cfg.espaco * spread
    const y = EYE_ANCHOR.y + 0.004 * S
    olho.position.set(sgn * x, y, surfaceZ(sgn * x, y) - rz * cfg.afunda)

    // A concha carrega a escala; tudo dentro dela tem raio 1 e so ROTACAO
    // (ver olho-cartoon.js pro porque: a escala entra DEPOIS da rotacao,
    // entao qualquer calota girada cai exatamente sobre o elipsoide).
    const concha = new THREE.Group()
    concha.scale.set(rx, ry, rz)
    olho.add(concha)

    // 1) o branco
    concha.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), brancoM)))

    // 2) o contorno, por casca invertida
    const contorno = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), contornoM)
    contorno.scale.setScalar(L_CONTORNO)
    contorno.castShadow = false
    contorno.receiveShadow = false
    concha.add(contorno)

    // 3) o miolo — o unico passo que muda de item pra item neste arquivo
    const rotX = cfg.olhaY
    const rotY = -sgn * cfg.olhaX
    cfg.miolo({ concha, sgn, ctx, cfg, rotX, rotY, tracoM })

    // 4) o brilho principal — igual nos nove olhos anteriores, pro globo nao
    // ler como vidro fosco (ver olho-cartoon.js pro racional completo)
    const brilho = flatPiece(new THREE.Mesh(calotaZ(0.085, 12, 6), brilhoM))
    brilho.scale.setScalar(L_PUPILA + 0.02)
    brilho.rotation.x = cfg.olhaY - 0.62
    brilho.rotation.y = -sgn * (cfg.olhaX + 0.28)
    concha.add(brilho)

    // 5) as palpebras — duas calotas indo pro meio, ver olho-cartoon.js
    const arco = mix(ARCO_ABERTO, ARCO_FECHADO, k)
    const roll = -sgn * cfg.roll * (1 - k)
    palpebra(concha, mix(cfg.tampa, -0.10, k), arco, peleM, fioM, false, roll)
    palpebra(concha, mix(-0.99, 0.02, k), arco, peleM, fioM, true, roll * 0.45)

    g.add(olho)
  }
  return g
}

const BASE = {
  escala: 1, achata: 1, afunda: AFUNDA, espaco: ESPACO,
  olhaY: 0.20, olhaX: 0.16, roll: 0, tampa: 0.94,
  miolo: null,
}

function item(id, nome, metodo, cfg) {
  const c = Object.assign({}, BASE, cfg)
  return {
    id,
    nome,
    name: nome,
    metodo,
    // Os seis desenham a propria palpebra (herdada da fabrica), como os nove
    // que ja existem — mesmo campo, mesmo nome, replicado de proposito (ver
    // olho-cartoon.js item() / CONTRATO.md item 9).
    propriaPalpebra: true,
    globo: {
      rx: BOLA.rx * c.escala,
      ry: BOLA.ry * c.escala * c.achata,
      rz: BOLA.rz * c.escala,
      x: EYE_ANCHOR.x * c.espaco,
      y: EYE_ANCHOR.y + 0.004 * S,
      sink: c.afunda,
    },
    build(ctx) { return fabricar(c, ctx) },
  }
}

// ---------------------------------------------------------------------------
// CATALOGO
// ---------------------------------------------------------------------------

export const OLHOS_EXTRA2 = [
  item(
    'cartoon-pupila-miniatura', 'Desenho pupila miniatura',
    'mesmo modelo do Desenho com a pupila reduzida a menos da metade do raio padrao e deslocada pra cima, deixando muito branco a mostra',
    { olhaY: -0.08, miolo: pupilaMiniatura },
  ),
  item(
    'cartoon-pupila-grande', 'Desenho pupila grande',
    'mesmo modelo do Desenho com a pupila quase dobrada de raio, cobrindo a iris quase inteira e deixando so uma borda fina de branco',
    { miolo: pupilaDominante },
  ),
  item(
    'cartoon-pupila-gato', 'Desenho pupila de gato',
    'mesmo modelo do Desenho com a pupila espremida em fenda vertical alongada (calota apertada no X local antes de rotacionar), como em felinos',
    { miolo: pupilaGato },
  ),
  item(
    'cartoon-iris-tripla', 'Desenho iris tripla',
    'evolucao do anel-iris: tres calotas concentricas atras da pupila (nao duas) formando tres aneis de cor tingidos pelo cabelo, do escuro por dentro ao claro por fora',
    { olhaY: 0.18, olhaX: 0.14, miolo: irisTresAneis },
  ),
  item(
    'cartoon-reflexo-lua', 'Desenho reflexo em lua',
    'mesmo modelo do Desenho com um risco de brilho em forma de meia-lua no canto de dentro da pupila, pelo mesmo truque de camadas do contorno do olho',
    { miolo: reflexoMeiaLua },
  ),
  item(
    'cartoon-iris-raiada', 'Desenho iris raiada',
    'mesmo modelo do Desenho com dez raios finos (calotas espremidas giradas em roll por uma volta inteira) saindo do centro da pupila pela iris, tipo estrela',
    { miolo: irisRaiada },
  ),
]

export default OLHOS_EXTRA2
