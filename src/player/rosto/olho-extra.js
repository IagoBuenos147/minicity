import * as THREE from 'three'
import { solid } from '../../world/materials.js'
import {
  HEAD_S, EYE_ANCHOR, useHead, faceSpread, surfaceZ, skinOf,
  shade, sh, flatPiece, mix, fechamentoOlho, hairColorFrom, curvedBar, wrapToHead,
} from './nucleo.js'

// ---------------------------------------------------------------------------
// src/player/rosto/olho-extra.js — QUATRO OLHOS, MESMA FAMILIA DO CARTOON.
//
// O pedido do dono foi explicito: "mantendo a semelhanca entre eles que ja
// discutimos que fica bom, porem faca detalhes novos e algo que va diferenciar
// os npcs. seje criativo mas sem exagerar". Ou seja, isto NAO e um estilo de
// olho novo — e o mesmo bicho de olho-cartoon.js (bola branca saliente +
// contorno por casca invertida + pupila chapada + palpebra propria em calota
// tombada) com UM detalhe novo por item, pra dar identidade sem quebrar o ar
// de familia entre os NPCs.
//
// olho-cartoon.js nao exporta a maquina interna (fabricar/calotaZ/palpebra sao
// privados do modulo), e o padrao ja estabelecido pelos outros catalogos
// "-extra" deste projeto (boca-extra.js, cabelo-extra.js) e nao importar do
// irmao base: cada arquivo extra e AUTOSSUFICIENTE, so import de nucleo.js.
// Por isso a bola/contorno/pupila/palpebra sao reconstruidos aqui — de
// proposito com os MESMOS numeros (BOLA, AFUNDA, ESPACO, as quatro camadas
// L_*) pra o resultado ficar identico em proporcao ao original.
//
// A REGRA DURA DOS QUATRO DETALHES: nenhum e volume novo colado na cara. Os
// quatro sao flatPiece() — ou colados no proprio globo do olho (mesma tecnica
// da pupila/brilho: calota unitaria + escala radial + rotacao) ou, no caso da
// olheira, uma faixa fininha (curvedBar + ShapeGeometry, SEM extrusao — zero
// espessura de proposito) projetada na PELE com wrapToHead. Sombra propria
// numa peca colada vira mancha preta que pisca (ver CONTRATO item 7); e por
// isso nenhuma delas usa sh().
// ---------------------------------------------------------------------------

const S = HEAD_S

// A bola e as quatro camadas: espelhados de olho-cartoon.js SEM MUDAR NUMERO
// NENHUM. Mudar aqui desalinharia estes quatro do resto da familia — os cinco
// olhos do catalogo base e estes quatro tem que continuar parecendo parentes.
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

/** Calota com o polo virado pra +Z (pupila, brilho, e os quatro detalhes novos). */
function calotaZ(arco, wSeg = 20, hSeg = 8) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, arco)
  g.rotateX(Math.PI / 2)
  return g
}

/**
 * A palpebra: calota de PELE + o fio escuro da borda.
 * Copia fiel de olho-cartoon.js — o racional completo (por que duas calotas,
 * por que os sinais de `base` sao diferentes em cima/embaixo, por que `roll`
 * inclina) esta la, comentado em detalhe. Aqui so o suficiente pra achar de
 * novo se precisar mexer.
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
// OS QUATRO DETALHES — um flatPiece por olho, aplicado depois da bola pronta.
// ---------------------------------------------------------------------------

/**
 * 1) OLHEIRA — um vinco fino colado na PELE, logo abaixo do globo.
 *
 * Diferente dos outros tres, este nao mora no globo (a curvatura da bola nao
 * e a curvatura da bochecha): e uma faixa curva no plano XY, do mesmo jeito
 * que sobrancelha/boca desenham peca chapada — curvedBar() da o contorno 2D e
 * wrapToHead() gruda na pele de verdade, com qualquer cabeca. ShapeGeometry
 * (sem ExtrudeGeometry) de proposito: e so uma folha, largura zero, sem bisel
 * e sem depth — a marca mais chapada que da pra desenhar.
 */
function olheira({ g, sgn, x, y, ry, pele }) {
  const mat = solid(shade(pele, 0.80), 0.75, 0.0, { side: THREE.DoubleSide })
  // O globo e enorme e saliente (AFUNDA 0.40 — quase 2/3 da bola pra fora), so
  // o polo de baixo da pele fica perto da borda da orbita, nao no fundo da
  // bola. 0.86 * ry poe a olheira logo abaixo dessa borda.
  const cy = y - ry * 0.86
  const shape = curvedBar(sgn * x, cy, 0.050 * S, 0.0044 * S, -0.0016 * S, 0, 0.60, 12)
  const geo = new THREE.ShapeGeometry(shape, 10)
  wrapToHead(geo, 0.0016 * S)
  g.add(flatPiece(new THREE.Mesh(geo, mat)))
}

/**
 * 2) BRILHO DUPLO — um segundo ponto de luz, menor, no canto de baixo-dentro.
 *
 * Mesma tecnica exata do brilho principal (calotaZ minuscula, flatPiece,
 * camada logo acima da pupila): so muda a rotacao, pro canto OPOSTO. Dois
 * reflexos e leitura de estudio com softbox dupla; aqui vira so uma segunda
 * chamada da mesma receita com outro angulo.
 */
function brilhoDuplo({ concha, sgn, cfg }) {
  const mat = solid(0xffffff, 0.08, 0.0)
  const b2 = flatPiece(new THREE.Mesh(calotaZ(0.045, 10, 5), mat))
  b2.scale.setScalar(L_PUPILA + 0.015)
  b2.rotation.x = cfg.olhaY + 0.34
  b2.rotation.y = -sgn * (cfg.olhaX - 0.20)
  concha.add(b2)
}

/**
 * 3) CILIOS MARCADOS — cinco lasquinhas na borda de cima do globo.
 *
 * Mesma familia de peca que a pupila (calota unitaria + escala + rotacao),
 * so que ESPREMIDA no X local antes da propria rotacao: um disco fino vira
 * lamina. `baseX` leva a lasquinha da frente (onde a pupila mora) pro alto do
 * globo — um pouco mais que o brilho principal (-0.62), que ja sabe ficar
 * "no canto de cima, fora da pupila" sem sumir sob a palpebra.
 */
function cilios({ concha, sgn, cfg }) {
  const mat = solid(TRACO, 0.5, 0.0, { side: THREE.DoubleSide })
  const N = 5
  const baseX = cfg.olhaY - 0.72
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1) - 0.5 // -0.5 (canto de dentro) .. 0.5 (canto de fora)
    const lash = flatPiece(new THREE.Mesh(calotaZ(0.075, 8, 3), mat))
    lash.scale.set(0.30, 1, L_PALPEBRA)
    lash.rotation.set(baseX, sgn * t * 0.85, -sgn * t * 0.9)
    concha.add(lash)
  }
}

/**
 * 4) ANEL DE DUAS CORES — a iris que a referencia nao tem, em versao chapada.
 *
 * Duas calotas concentricas com a pupila, MAIORES em raio angular e numa
 * camada um pouco ATRAS dela (L menor): a pupila cobre o centro e sobra so o
 * anel — o mesmo truque de camadas que o contorno do olho usa (casca por
 * baixo, so a beirada aparece), aqui em disco em vez de casca invertida.
 * A cor sai de hairColorFrom(ctx): o anel acompanha a genetica do boneco em
 * vez de ser uma cor fixa igual em todo NPC.
 */
function anelIris({ concha, rotX, rotY, ctx }) {
  const base = hairColorFrom(ctx)
  const claro = shade(base, 1.35)
  const escuro = shade(base, 0.72)

  const fora = flatPiece(new THREE.Mesh(calotaZ(0.34, 22, 6), solid(claro, 0.5, 0.0)))
  fora.scale.setScalar(1.008)
  fora.rotation.x = rotX
  fora.rotation.y = rotY
  concha.add(fora)

  const dentro = flatPiece(new THREE.Mesh(calotaZ(0.24, 20, 6), solid(escuro, 0.5, 0.0)))
  dentro.scale.setScalar(1.016)
  dentro.rotation.x = rotX
  dentro.rotation.y = rotY
  concha.add(dentro)
}

// ---------------------------------------------------------------------------
// A FABRICA — o mesmo olho de olho-cartoon.js, com um gancho `cfg.extra` pro
// detalhe de identidade entrar depois que a bola, o contorno, a pupila, o
// brilho e as duas palpebras ja existem.
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
    const fator = sgn < 0 ? (cfg.assim || 1) : 1
    const rx = BOLA.rx * cfg.escala * fator
    const ry = BOLA.ry * cfg.escala * cfg.achata * fator
    const rz = BOLA.rz * cfg.escala * fator

    const olho = new THREE.Group()
    const x = EYE_ANCHOR.x * cfg.espaco * spread
    const y = EYE_ANCHOR.y + 0.004 * S
    olho.position.set(sgn * x, y, surfaceZ(sgn * x, y) - rz * cfg.afunda)

    // A concha carrega a escala; tudo dentro dela tem raio 1 e so ROTACAO —
    // ver olho-cartoon.js pro porque (a escala entra DEPOIS da rotacao, entao
    // qualquer calota girada cai exatamente sobre o elipsoide sem deformar).
    const concha = new THREE.Group()
    concha.scale.set(rx, ry, rz)
    olho.add(concha)

    // 1) o branco
    concha.add(sh(new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), brancoM)))

    // 2) o contorno, por casca invertida
    const contorno = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), contornoM)
    contorno.scale.setScalar(1 + (L_CONTORNO - 1) * cfg.linha)
    contorno.castShadow = false
    contorno.receiveShadow = false
    concha.add(contorno)

    // 3) a pupila
    const desvio = sgn < 0 ? (cfg.desvio || 0) : 0
    const rotX = cfg.olhaY + desvio * 0.55
    const rotY = -sgn * cfg.olhaX + desvio
    const pupila = flatPiece(new THREE.Mesh(calotaZ(cfg.pupila), tracoM))
    // `pupilaL` deixa o item 'anel de duas cores' empurrar a pupila um pouco
    // mais pra fora, abrindo espaco de camada pros dois aneis por baixo dela.
    // Sem override (o caso normal) cai em L_PUPILA, igual aos outros olhos.
    pupila.scale.setScalar(cfg.pupilaL || L_PUPILA)
    pupila.rotation.x = rotX
    pupila.rotation.y = rotY
    concha.add(pupila)

    // 4) o brilho principal
    const brilho = flatPiece(new THREE.Mesh(calotaZ(0.085, 12, 6), brilhoM))
    brilho.scale.setScalar(L_PUPILA + 0.02)
    brilho.rotation.x = cfg.olhaY - 0.62
    brilho.rotation.y = -sgn * (cfg.olhaX + 0.28)
    concha.add(brilho)

    // 5) as palpebras
    const arco = mix(ARCO_ABERTO, ARCO_FECHADO, k)
    const roll = -sgn * cfg.roll * (1 - k)
    palpebra(concha, mix(cfg.tampa, -0.10, k), arco, peleM, fioM, false, roll)
    palpebra(concha, mix(-0.99, 0.02, k), arco, peleM, fioM, true, roll * 0.45)

    // 6) o detalhe que da identidade a este olho
    if (cfg.extra) {
      cfg.extra({ g, concha, olho, sgn, ctx, cfg, pele, rx, ry, rz, x, y, rotX, rotY })
    }

    g.add(olho)
  }
  return g
}

const BASE = {
  escala: 1, achata: 1, afunda: AFUNDA, espaco: ESPACO,
  pupila: 0.22, olhaY: 0.20, olhaX: 0.16, roll: 0, linha: 1,
  tampa: 0.94, assim: 1, desvio: 0, pupilaL: 0,
  extra: null,
}

function item(id, nome, metodo, cfg) {
  const c = Object.assign({}, BASE, cfg)
  return {
    id,
    nome,
    name: nome,
    metodo,
    // Os quatro desenham a propria palpebra (herdada da fabrica), como os
    // tres do catalogo base — mesmo campo, mesmo nome, replicado de proposito
    // (ver olho-cartoon.js item() / CONTRATO.md item 9).
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

export const OLHOS_EXTRA = [
  item(
    'cartoon-olheira', 'Desenho olheira',
    'mesmo modelo do Desenho (bola + contorno por casca invertida + pupila chapada) com uma faixa fina (curvedBar + ShapeGeometry) colada na PELE abaixo do globo, simulando olheira/vinco',
    { olhaY: 0.22, extra: olheira },
  ),
  item(
    'cartoon-brilho-duplo', 'Desenho brilho duplo',
    'mesmo modelo do Desenho com um segundo ponto de brilho (mesma tecnica do principal, calota chapada minuscula) no canto oposto da pupila, simulando reflexo duplo',
    { achata: 0.95, pupila: 0.23, extra: brilhoDuplo },
  ),
  item(
    'cartoon-cilios', 'Desenho cilios',
    'mesmo modelo do Desenho com cinco lasquinhas chapadas (calota da pupila esticada) plantadas na borda de cima do globo, em leque',
    { achata: 1.02, extra: cilios },
  ),
  item(
    'cartoon-anel-iris', 'Desenho anel na iris',
    'mesmo modelo do Desenho com duas calotas chapadas concentricas atras da pupila (camada mais funda que ela), formando um anel de duas cores tingido pela cor do cabelo',
    { pupila: 0.15, pupilaL: 1.024, olhaY: 0.18, olhaX: 0.14, extra: anelIris },
  ),
]

export default OLHOS_EXTRA
