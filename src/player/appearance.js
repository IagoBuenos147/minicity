import * as THREE from 'three'
import * as N from './rosto/nucleo.js'
import {
  OLHO_CARTOON, OLHO_CARTOON_REDONDO, OLHO_CARTOON_CAIDO,
  OLHO_CARTOON_TORTO, OLHO_CARTOON_FENDA,
} from './rosto/olho-cartoon.js'
import { BOCAS as BOCAS_BASE } from './rosto/boca.js'
import { BOCAS_EXTRA } from './rosto/boca-extra.js'
import { BARBAS as BARBAS_BASE } from './rosto/barba.js'
import { BARBAS_EXTRA } from './rosto/barba-extra.js'
import { BARBAS_EXTRA2 } from './rosto/barba-extra2.js'
import { BARBAS_EXTRA3 } from './rosto/barba-extra3.js'
import { CABELOS as CABELOS_BASE } from './rosto/cabelo.js'
import { CABELOS_EXTRA } from './rosto/cabelo-extra.js'
import { CABELOS_CORTE } from './rosto/cabelo-corte.js'
import { CABELOS_CORTE2 } from './rosto/cabelo-corte2.js'
import { OLHOS_EXTRA } from './rosto/olho-extra.js'
import { OLHOS_EXTRA2 } from './rosto/olho-extra2.js'
import { SOBRANCELHAS as SOBRANCELHAS_BASE } from './rosto/sobrancelha.js'
import { SOBRANCELHAS_EXTRA } from './rosto/sobrancelha-extra.js'
import { SOBRANCELHAS_EXTRA2 } from './rosto/sobrancelha-extra2.js'

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
// 2. NAO EXISTE MAIS CATALOGO DE PUPILA. A iris virou parte do olho: cada olho
//    traz a propria solucao de iris, pupila e brilho. PUPILAS continua
//    exportado como array VAZIO porque o customizer monta as abas a partir do
//    catalogo e aba vazia ele esconde sozinha — a aba some sem ninguem tocar na
//    UI. O byte 'pupila' virou 'palpebra' no pacote de rede.
//
// 2b. NAO EXISTE MAIS CATALOGO DE NARIZ, pelo mesmo mecanismo: NARIZES e um
//    array vazio e a aba some. O personagem ficou com o rosto da referencia,
//    que nao tem nariz desenhado — sao os olhos que carregam a cara. Os tres
//    narizes antigos e o de desenho estao em backup/personagem/.
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

/**
 * BARBA — DEZESSEIS. As quatro primeiras (nenhuma, aparada, bigode, cheia)
 * continuam onde estavam; as doze de barba-extra.js sao a metade de cima de um
 * cartaz de 24 estilos de barbearia que o dono mandou como referencia, na
 * ordem em que aparecem la: por fazer, curta aparada, cortina, costeletas,
 * cavanhaque, Van Dyke, ancora, Balbo, mosca, Zappa, bigode guidao e circular.
 *
 * Elas entram DEPOIS das quatro antigas, e nao no meio: indice de catalogo e
 * o que esta salvo no save e o que viaja na rede. Inserir um item no comeco
 * trocaria a barba de todo mundo que ja jogou.
 */
//
// TRES SAIRAM POR RECUSA DO DONO, e por isso a lista e FILTRADA em vez de
// editada nos arquivos de origem: 'cheia' (a barba cheia antiga), 'stubble'
// ("por fazer") e 'costeletas'. Filtrar aqui deixa o codigo delas intacto no
// catalogo de origem — se ele mudar de ideia, e uma linha pra voltar — e e o
// mesmo caminho que o 'raspado' do cabelo ja tinha aberto.
//
// O PRECO DE APAGAR: indice de catalogo e o que esta salvo no save e o que
// viaja na rede. Tirar um item do MEIO desloca todos os seguintes, entao quem
// jogou antes desta mudanca vai abrir o jogo com a barba do vizinho. Foi
// pedido explicitamente; se um dia o custo pesar, o caminho e substituir a
// peca por uma entrada com build() nulo em vez de tira-la da lista.
const BARBAS_FORA = ['cheia', 'stubble', 'costeletas']

// A METADE DE BAIXO DO CARTAZ veio em DOIS arquivos (as de bigode em
// barba-extra2, as cheias em barba-extra3) porque foram escritas em paralelo
// por duas maos — mas o catalogo tem que sair na ORDEM DO CARTAZ, que e como o
// dono le a lista. Por isso a ordem e declarada aqui, e nao herdada da ordem
// dos arquivos: linha 4 (imperial, mosqueteiro, rabo de pato, garfo frances),
// linha 5 (as duas costeletas, verdi, pirata) e linha 6 (as quatro cheias).
const ORDEM_CARTAZ = [
  'imperial', 'mosqueteiro', 'rabo-de-pato', 'garfo-frances',
  'costeleta-larga', 'costeleta-ligada', 'verdi', 'pirata',
  'cheia-classica', 'old-dutch', 'garibaldi', 'bandholz',
]
const BARBAS_CARTAZ = BARBAS_EXTRA2.concat(BARBAS_EXTRA3)
  .slice()
  .sort((a, b) => ORDEM_CARTAZ.indexOf(a.id) - ORDEM_CARTAZ.indexOf(b.id))

export const BARBAS = BARBAS_BASE
  .concat(BARBAS_EXTRA, BARBAS_CARTAZ)
  .filter((b) => BARBAS_FORA.indexOf(b.id) < 0)

/**
 * SOBRANCELHA — NOVE. As tres primeiras (uma por metodo de construcao) ficaram
 * como estavam: o dono aprovou ("essa aba as 3 ficaram boas"). As seis do
 * extra variam DUAS coisas ao mesmo tempo, que foi o pedido — o FORMATO (reta,
 * arqueada, caida nas pontas, grossa e curta, fina e longa, quebrada) e a
 * ESPESSURA/densidade do fio. Variar so uma das duas daria seis irmas.
 */
export const SOBRANCELHAS = SOBRANCELHAS_BASE
  .concat(SOBRANCELHAS_EXTRA, SOBRANCELHAS_EXTRA2)

/**
 * BOCA — DEZESSETE, e todas sao LINHA.
 *
 * Ficou UMA das antigas: o 'traco' da referencia. As outras duas de boca.js (o
 * labio cheio e a cavidade escavada) sairam junto com as tres primeiras
 * tentativas de boca-extra.js — sorriso com canto em bolota, fileira de dentes,
 * cavidade com lingua. Todas recusadas, e pelo mesmo motivo:
 *
 *   PECA COM VOLUME NAO CONVIVE COM ROSTO DE TRACO.
 *
 * A cara e feita de linhas chapadas (o olho e uma bola branca com contorno
 * preto de espessura constante). Do lado disso, qualquer coisa com sombra
 * propria vira um objeto COLADO no rosto em vez de virar parte do desenho.
 *
 * O catalogo cresceu em levas, e cada leva nasceu de uma recusa da anterior —
 * a historia inteira, com o motivo de cada uma, esta no cabecalho de
 * rosto/boca-extra.js. As duas antigas de boca.js (labio cheio e cavidade
 * escavada) continuam no arquivo, so nao entram mais no catalogo.
 */
export const BOCAS = BOCAS_BASE.filter((b) => b.id === 'traco').concat(BOCAS_EXTRA)

// Os cortes novos (topete, arrepiado, coque samurai) vao no fim. Eles moram
// noutro arquivo porque a regra deles e outra: os primeiros sao casca colada no
// cranio e estes tem que MUDAR A SILHUETA. O 'raspado' saiu: sem silhueta
// propria e sem franja, ele lia como "careca" e nao como corte — trocar pra ele
// no customizador parecia que o cabelo tinha sumido por bug.
// E depois vieram os oito CORTES (cabelo-corte.js), tirados de um cartaz de
// cortes masculinos que o dono mandou. A regra deles e a mesma dos tres do
// extra e vale a pena repetir: corte que so muda a TEXTURA do topo nao conta —
// o que o jogador ve no card e a SILHUETA. Por isso o mullet desce na nuca, a
// cortina abre no meio e o undercut tem degrau na lateral.
// 'undercut' e 'trancinhas' sairam pela mesma porta do 'raspado' e da mesma
// leva de recusa das barbas — ver o comentario de BARBAS acima.
const CABELOS_FORA = ['raspado', 'undercut', 'trancinhas']
export const CABELOS = CABELOS_BASE
  .concat(CABELOS_EXTRA, CABELOS_CORTE, CABELOS_CORTE2)
  .filter((c) => CABELOS_FORA.indexOf(c.id) < 0)

/**
 * OLHOS — CINCO, TODOS DE DESENHO.
 *
 * Os cinco olhos anteriores (cada um por um metodo de construcao diferente)
 * estao em backup/personagem/olhos-antigo.js. Eles nao foram cortados por
 * defeito: o personagem escolheu um estilo, e olho realista de 2 cm no mesmo
 * catalogo que olho de desenho de 8 cm nao e escolha de gosto, e duas caras
 * diferentes com o mesmo corpo.
 *
 * Com eles saiu tambem a PERSIANA (a palpebra generica de nucleo.js, que
 * dependia das medidas publicadas em OLHO_GLOBO): os cinco desenham a propria
 * palpebra por dentro, varrendo do topo ate embaixo, que e o que a barra
 * "abrir e fechar" da aba controla. persianaOlho() continua em nucleo.js pra
 * quem for escrever o proximo olho sem palpebra propria.
 *
 * Os dois ultimos ('torto' e 'fenda') sao os OUSADOS: os tres primeiros eram
 * o mesmo desenho com numeros diferentes e ficaram parecidos demais, entao
 * estes dois mexem na ESTRUTURA — um quebra a simetria entre os dois olhos, o
 * outro tira a palpebra do repouso. Ver rosto/olho-cartoon.js.
 */
export const OLHOS = [
  OLHO_CARTOON, OLHO_CARTOON_REDONDO, OLHO_CARTOON_CAIDO,
  OLHO_CARTOON_TORTO, OLHO_CARTOON_FENDA,
].concat(OLHOS_EXTRA, OLHOS_EXTRA2)
  // A 'iris raiada' (o 15 da aba) saiu por recusa do dono. Filtro, e nao
  // exclusao do arquivo: o codigo dela continua em olho-extra2.js.
  .filter((o) => o.id !== 'cartoon-iris-raiada')

// Os quatro do olho-extra.js sao a leva que o dono pediu depois: "mantendo a
// semelhanca entre eles, porem faca detalhes novos e algo que va diferenciar os
// npcs". Entao eles NAO mexem na estrutura (como fizeram o torto e a fenda) —
// e o MESMO desenho com um detalhe chapado a mais cada: olheira, segundo ponto
// de brilho, cilios e anel na iris. E o detalhe, e nao a forma, que separa um
// NPC do outro quando os dois estao na mesma calcada.

/**
 * NARIZ — CATALOGO VAZIO, DE PROPOSITO (ver item 2b do cabecalho).
 *
 * Nao e um array esquecido: e o mecanismo. O customizador monta as abas a
 * partir do catalogo (abaTemCatalogo) e character.js sai do rebuild antes de
 * construir qualquer coisa quando o catalogo nao tem itens. Deixando ele vazio,
 * a aba some da tela e o slot para de existir sem tocar em UI nem em rede.
 */
export const NARIZES = []
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
    // 0 obrigatoriamente: o catalogo de nariz esta VAZIO (ver NARIZES). O
    // padrao era 1 quando existiam quatro narizes; deixar o 1 aqui nao
    // quebraria nada hoje (o rebuild sai antes de indexar), mas seria um valor
    // que nao aponta pra lugar nenhum viajando nos 20 bytes da rede.
    nariz: 0,
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
