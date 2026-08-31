import { BEBIDAS, CATEGORIAS_BEBIDAS } from './bebidas.js'
import { ERVAS, CATEGORIAS_ERVA } from './erva.js'

// ---------------------------------------------------------------------------
// src/mobilia/mercado.js — o que a MERCEARIA vende.
//
// Este arquivo existe por uma razao so, e vale escrever qual: a loja do
// mercado nao e mais "as bebidas". Ela comecou vendendo tres bebidas e o main
// importava BEBIDAS direto; quando entrou a primeira coisa que nao e bebida (o
// broto), a alternativa era enfiar um item de planta dentro de bebidas.js — e
// dai a proxima coisa iria pro mesmo lugar errado, e em pouco tempo o arquivo
// chamado "bebidas" teria de tudo.
//
// Entao a JUNCAO mora aqui, e cada familia continua no seu proprio arquivo com
// as suas proprias regras de modelagem. O main importa esta lista e nao precisa
// saber quantas familias existem.
//
// A ORDEM DAS ABAS e a ordem em que elas aparecem no topo da loja. 'tudo' vem
// de CATEGORIAS_BEBIDAS e tem que continuar sendo a primeira; as familias
// entram depois, na ordem em que foram acrescentadas — mexer nisso muda a aba
// que abre por padrao.
// ---------------------------------------------------------------------------

export const CATALOGO_MERCADO = BEBIDAS.concat(ERVAS)

export const CATEGORIAS_MERCADO = CATEGORIAS_BEBIDAS.concat(CATEGORIAS_ERVA)
