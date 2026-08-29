import * as THREE from 'three'
import * as N from './rosto/nucleo.js'
import { OLHOS as OLHOS_BASE, OLHO_GLOBO } from './rosto/olhos.js'
import { NARIZES as NARIZES_BASE } from './rosto/nariz.js'
import { OLHO_CARTOON } from './rosto/olho-cartoon.js'
import { NARIZ_CARTOON } from './rosto/nariz-cartoon.js'
import { BOCAS } from './rosto/boca.js'
import { BARBAS } from './rosto/barba.js'
import { CABELOS } from './rosto/cabelo.js'
import { SOBRANCELHAS } from './rosto/sobrancelha.js'

// ---------------------------------------------------------------------------
// src/player/appearance.js — AGREGADOR do rosto.
//
// Este arquivo tinha 2300 linhas com a matematica do cranio, os catalogos de
// cabeca, olho, pupila, nariz, boca, barba, cabelo e sobrancelha, e as tabelas
// de cor, tudo junto. Agora cada peca mora num arquivo em src/player/rosto/ e a
// matematica do cranio — que TODAS elas leem — mora em rosto/nucleo.js.
//
// Aqui sobrou so a juncao, porque character.js, customizer.js, provador.js,
// npc.js e avatares.js importam por estes nomes. Manter a porta de entrada no
// lugar foi o que permitiu quebrar o arquivo em sete sem tocar em nenhum
// consumidor.
//
// O catalogo antigo inteiro esta guardado em
// backup/personagem/appearance-antigo.js, do jeito que estava.
//
// O QUE MUDOU DE CONTRATO NESTA REFORMA
//
// 1. SEIS CABECAS, nao treze. Cada uma construida por um metodo diferente
//    (esfera UV, cubo esferificado, aneis empilhados, duas conchas soldadas) —
//    ver rosto/nucleo.js.
//
// 2. NAO EXISTE MAIS CATALOGO DE PUPILA. A iris virou parte do olho: cada um
//    dos cinco olhos traz a propria solucao de iris, pupila e brilho, com um
//    metodo diferente em cada. PUPILAS continua exportado como array VAZIO
//    porque o customizer monta as abas a partir do catalogo e aba vazia ele
//    esconde sozinha — a aba some sem ninguem tocar na UI. O byte 'pupila'
//    segue no pacote de rede, valendo sempre 0.
//
// 3. COR DE BARBA E UM CATALOGO PROPRIO (CORES_BARBA), separado do cabelo. O
//    indice 0 quer dizer "igual ao cabelo", que e o que 80% dos jogadores quer
//    sem pensar; os outros dao a cor. Barba herdando a cor do cabelo nao
//    entregava grisalho de barba com cabelo preto, que e das combinacoes mais
//    comuns que existem.
// ---------------------------------------------------------------------------

// --- a matematica do cranio e os utilitarios (reexportados tal e qual) -------
export const {
  HEAD_S, SKIN_DEFAULT, HEAD, HEAD_HEIGHT, EYE_ANCHOR,
  SKIN_TONES, PELES, CORES_CABELO, CORES_BARBA, CRANIOS,
} = N

export const {
  clamp, wrapIdx, mix, smoothstep, gauss,
  headShapeOf, setActiveHead, activeHead, useHead, faceSpread,
  eggSurface, eggNormal, surfaceZ, surfaceX, deformEgg, wrapToHead,
  makeHeadGeometry, soldarNormais,
  shade, mixHex, sh, flatPiece, rng, alignY, extrudeOpts, curvedBar, facePiece,
  blob, byAz, hairline, tecelagem, fio, peloMat, pontoNaPele,
  skinColorOf, skinOf, hairColorOf, hairColorFrom, beardColorOf, beardColorFrom,
  hairMat, headShell, scalp,
} = N

// `shadeColor` e o nome pelo qual character.js importa o shade().
export const shadeColor = N.shade

// --- os catalogos -----------------------------------------------------------
export { BOCAS, BARBAS, CABELOS, SOBRANCELHAS }

/**
 * A BARRA DE FECHAR OS OLHOS vale pros SEIS olhos, e nao so pro da referencia.
 *
 * O olho 'cartoon' desenha a propria palpebra: ela e parte da copia que o dono
 * pediu, e varre do topo ate embaixo por dentro do proprio modelo. Os cinco
 * olhos que ja existiam foram escritos cada um com a palpebra dele, em
 * geometrias completamente diferentes — calota tombada, rolo de tubo, moldura
 * extrudada, leque radial. Mexer na abertura de cada um por dentro seriam cinco
 * reformas, cada uma com o proprio jeito de quebrar, e nenhuma delas e o que o
 * dono pediu.
 *
 * Entao eles ganham a PERSIANA (nucleo.js): uma casca de pele que desce por
 * cima do olho inteiro, seguindo a curvatura do proprio globo — por isso ela
 * precisa das medidas dele, que olhos.js publica em OLHO_GLOBO. Com a barra em
 * zero ela nao cria malha nenhuma, entao os cinco continuam exatamente como
 * estavam.
 */
function comPersiana(olho, i) {
  if (olho.propriaPalpebra) return olho
  const globo = OLHO_GLOBO[i]
  return Object.assign({}, olho, {
    build(ctx) {
      const g = olho.build(ctx)
      const k = N.fechamentoOlho(ctx)
      if (!g || !(k > 0.001)) return g
      const tampa = N.persianaOlho(globo, k, N.skinOf(ctx))
      if (tampa) g.add(tampa)
      return g
    },
  })
}

export const OLHOS = OLHOS_BASE.map(comPersiana).concat([OLHO_CARTOON])
export const NARIZES = NARIZES_BASE.concat([NARIZ_CARTOON])
export const PALPEBRAS = N.PALPEBRAS

/**
 * HEAD_SHAPES: os PARAMETROS de campo dos seis cranios. Nome antigo, mantido
 * porque congelar.js e o forno de personagem leem por ele.
 */
export const HEAD_SHAPES = CRANIOS.map((c) => c.campo)

/** Cabecas como catalogo: build() devolve a cabeca inteira, pronta pra cena. */
export const CABECAS = CRANIOS.map((c, i) => ({
  id: c.id,
  nome: c.nome,
  name: c.nome,
  metodo: c.metodo,
  forma: c.campo,
  /** Geometria crua (character.js prefere esta: ele gerencia o material). */
  geometry(s, wSeg, hSeg) { return N.makeHeadGeometry(i, s || 1, wSeg || 30, hSeg || 24) },
  build(ctx) {
    const m = N.sh(new THREE.Mesh(
      N.makeHeadGeometry(i, 1, 30, 24),
      N.mats.solid(N.skinOf(ctx), 0.68, 0.0),
    ))
    m.name = 'head:' + c.id
    return m
  },
}))

/**
 * PUPILAS — VAZIO DE PROPOSITO, e agora tambem SEM BYTE.
 *
 * A iris virou parte do olho (item 2 do cabecalho) e o byte que era dela no
 * pacote de rede foi REAPROVEITADO pela barra de fechar os olhos ('palpebra').
 * O array continua exportado porque o teste de fumaca e o customizador
 * perguntam por ele; catalogo vazio e o que faz a aba sumir sozinha.
 */
export const PUPILAS = []

// --- apelidos antigos -------------------------------------------------------
// Nao sao copias: e a MESMA referencia, entao nao existe versao velha do
// catalogo pra divergir.
export const HAIR = CABELOS
export const EYES = OLHOS
export const BROWS = SOBRANCELHAS
export const MOUTH = BOCAS
export const HAIR_COLORS = CORES_CABELO

export function defaultAppearance() {
  return {
    // nomes do contrato (os 20 bytes da rede)
    cabeca: 0,
    olhos: 0,
    // 0 = olho aberto. E a barra da aba OLHOS (ver PALPEBRAS em rosto/nucleo.js);
    // ela ocupa o byte que era do catalogo de pupila.
    palpebra: 0,
    // 1, e nao 0: o indice 0 do catalogo de nariz e "sem nariz". Um padrao todo
    // zerado entregaria um jogador novo com a cara lisa, e ele leria isso como
    // bug, nao como estilo.
    nariz: 1,
    boca: 0,
    barba: 0,
    cabelo: 0,
    pele: 0,
    corCabelo: 1,
    corBarba: 0,   // 0 = igual ao cabelo
    sobrancelha: 0,
    chapeu: 0,
    calcado: 1,
    blusa: 1,
    calca: 0,
    colar: 0,
    anelAcess: 0,
    tatuagem: 0,
    relogio: 0,
    jaqueta: 0,
    // NAO devolver tambem os apelidos em ingles (hair/eyes/brows/mouth/
    // hairColor). Ter os DOIS nomes dentro do MESMO objeto de aparencia quebra o
    // jogo: character.js resolve apelido campo a campo, e main.js guarda um
    // unico objeto e so mexe no nome do contrato. Entao setAppearance({boca: 2})
    // escrevia boca=2 e, duas chaves depois, o 'mouth: 0' velho do mesmo objeto
    // escrevia boca=0 de volta — a boca (e o cabelo, e os olhos) simplesmente
    // nao mudavam, sem erro nenhum. Como ENTRADA os apelidos seguem valendo.
    //
    // COR (nao indice): e ela que pinta cabeca, pescoco e maos.
    skin: N.SKIN_DEFAULT,
    shirt: 0x4c73a8,
    pants: 0x39404c,
    shoes: 0xf4f4f2,
  }
}

export const CATALOGS = {
  // nomes do contrato
  cabeca: CABECAS,
  olhos: OLHOS,
  palpebra: PALPEBRAS,
  nariz: NARIZES,
  boca: BOCAS,
  barba: BARBAS,
  cabelo: CABELOS,
  pele: PELES,
  corCabelo: CORES_CABELO,
  corBarba: CORES_BARBA,
  sobrancelha: SOBRANCELHAS,
  // 'pupila' NAO entra: o catalogo morreu e o byte virou 'palpebra'.
  // apelidos antigos
  hair: CABELOS,
  eyes: OLHOS,
  brows: SOBRANCELHAS,
  mouth: BOCAS,
}
