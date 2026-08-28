// ---------------------------------------------------------------------------
// src/player/roupas.js — AGREGADOR dos catalogos de roupa.
//
// Este arquivo tinha 3 mil linhas: as ferramentas e os oito catalogos juntos.
// Cada aba do customizador agora mora num arquivo proprio em src/player/roupa/,
// e as ferramentas em src/player/roupa/nucleo.js. Aqui sobrou so a juncao.
//
// Por que a juncao continua existindo em vez de todo mundo importar direto do
// arquivo novo: character.js, customizer.js, provador.js, npc.js e avatares.js
// importam `CHAPEUS`, `BLUSAS`, `CATALOGOS_ROUPA`... por estes nomes. Manter a
// porta de entrada no lugar e o que permitiu quebrar o arquivo em oito sem
// tocar em nenhum consumidor.
//
// O catalogo antigo inteiro (as 11 blusas, os 11 calcados, as 11 tatuagens...)
// esta guardado em backup/personagem/roupas-antigo.js, do jeito que estava.
// ---------------------------------------------------------------------------

import { CHAPEUS } from './roupa/chapeus.js'
import { CALCADOS } from './roupa/calcados.js'
import { CAMISAS } from './roupa/camisas.js'
import { CALCAS } from './roupa/calcas.js'
import { COLARES } from './roupa/colares.js'
import { ANEIS } from './roupa/aneis.js'
import { RELOGIOS } from './roupa/relogios.js'
import { TATUAGENS } from './roupa/tatuagens.js'

export { CHAPEUS, CALCADOS, CALCAS, COLARES, ANEIS, RELOGIOS, TATUAGENS }
export { CAMISAS }

/**
 * A aba de tronco chamava ROUPA e agora chama CAMISAS (pedido do dono). O
 * CAMPO da aparencia continua sendo 'blusa': ele e um byte do protocolo de rede
 * e renomear byte custa versao nova e recusar todo cliente velho, por um nome.
 * Entao BLUSAS e o mesmo array de CAMISAS, so que pelo nome que o resto do
 * codigo (e a rede) ja conhece.
 */
export const BLUSAS = CAMISAS

/**
 * JAQUETAS continua VAZIO de proposito. Jaqueta virou camisa: sao a mesma aba e
 * o mesmo slot, porque nao existe vestir as duas ao mesmo tempo. O array segue
 * exportado porque character.js resolve o catalogo por nome e o customizer
 * monta as abas a partir deste objeto — aba de catalogo vazio ele esconde
 * sozinho. O campo 'jaqueta' do pacote de aparencia segue valendo 0 pra sempre.
 */
export const JAQUETAS = []

export const CATALOGOS_ROUPA = {
  chapeu: CHAPEUS, calcado: CALCADOS, blusa: BLUSAS, calca: CALCAS,
  colar: COLARES, anelAcess: ANEIS, tatuagem: TATUAGENS, relogio: RELOGIOS,
  jaqueta: JAQUETAS,
}
