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

import { CHAPEUS as CHAPEUS_BASE } from './roupa/chapeus.js'
import { CALCADOS as CALCADOS_BASE } from './roupa/calcados.js'
import { CALCADOS_EXTRA } from './roupa/calcados-extra.js'
import { CAMISAS as CAMISAS_BASE } from './roupa/camisas.js'
import { CAMISAS_EXTRA } from './roupa/camisas-extra.js'
import { CALCAS as CALCAS_BASE } from './roupa/calcas.js'
import { CALCAS_EXTRA } from './roupa/calcas-extra.js'
import { COLARES as COLARES_BASE } from './roupa/colares.js'
import { ANEIS } from './roupa/aneis.js'
import { RELOGIOS } from './roupa/relogios.js'
import { TATUAGENS } from './roupa/tatuagens.js'

// ---------------------------------------------------------------------------
// A PALETA DA MODA — por que ela existe e por que ela mora AQUI.
//
// O dono viu o catalogo pronto e disse: "voce fez TODAS AS CAMISAS AZUIS, nao
// entendi, parece que todas sao a mesma coisa, so o formato delas que muda".
// Ele estava certo, e a causa nao era falta de capricho nas pecas: e que
// `ctx.cor.blusa` NAO E UMA ESCOLHA DO JOGADOR. Nao existe campo de cor de
// roupa na aparencia (sao 20 bytes e nenhum deles e isso) — `shirt` e uma
// constante em appearance.js, hoje 0x4c73a8. Ou seja: toda peca que pinta o
// corpo com `c.cor.blusa` sai azul, sempre, pra todo mundo. Doze camisas, um
// azul so.
//
// A correcao poderia ser peca a peca, mas seria a mesma linha copiada vinte
// vezes dentro de dois arquivos que ja estao grandes. Aqui a cor vira uma
// TABELA DE MODA: cada id ganha a cor que aquela roupa tem no mundo real, e o
// catalogo e embrulhado num build que troca `cor.blusa`/`cor.calca`/
// `cor.calcado` pela cor da peca antes de chamar o build original.
//
// Quem NAO esta na tabela continua herdando a cor padrao — e de proposito:
// uma peca nova nasce funcionando e so entra aqui quando alguem decidir que
// moda ela representa.
//
// E o dia em que o jogador puder escolher a cor da roupa, esta tabela vira o
// PADRAO de cada peca em vez do valor final, e nada mais muda de lugar.
// ---------------------------------------------------------------------------
const MODA_CAMISA = {
  // frio / casa
  moletom: 0x6f7378,          // cinza mescla
  trico: 0x7a3b46,            // la bordo
  colete: 0x8a7a52,           // caqui acolchoado
  // esporte
  regata: 0xdfe1e4,           // branco de ginasio
  'corta-vento': 0x24262b,    // nylon preto
  jersey: 0xd8b33a,           // amarelo de time
  // cowboy / jeans
  flanela: 0x8e3630,          // xadrez vermelho-tijolo
  'jaqueta-jeans': 0x3f5f86,  // azul jeans
  // casual
  polo: 0x3f6b52,             // verde musgo
  havaiana: 0xd9c9a3,         // creme de estampa
  oversized: 0x5a6046,        // verde oliva
}

const MODA_CALCA = {
  jeans: 0x3d5273,
  jogger: 0x3a3d44,
  cargo: 0x55603f,            // verde militar
  skinny: 0x2f3f57,           // jeans escuro
  alfaiataria: 0x2b2d33,      // grafite de terno
  chino: 0x8a7a58,            // caqui
  rasgada: 0x5a7192,          // jeans claro
  couro: 0x1a1a1e,
  'moletom-calca': 0x6b6f74,
  track: 0x232529,
  'bermuda-jeans': 0x486089,
  'bermuda-praia': 0x2f7f8a,  // turquesa
  'bermuda-cargo': 0x55603f,
}

const MODA_CALCADO = {
  'tenis-corrida': 0xe8e9ec,
  'tenis-skate': 0x2a2c31,
  chinelo: 0x33363b,
}

/**
 * Embrulha um catalogo trocando UMA cor do ctx pela cor da peca. A entrada
 * original nao e alterada (Object.assign numa copia): o catalogo de origem
 * continua servindo pra quem quiser a peca crua.
 */
function comModa(lista, tabela, campo) {
  return lista.map((it) => {
    const cor = it && it.id ? tabela[it.id] : undefined
    if (cor === undefined || typeof it.build !== 'function') return it
    const original = it.build
    return Object.assign({}, it, {
      corModa: cor,
      build(ctx) {
        const c2 = Object.assign({}, ctx)
        c2.cor = Object.assign({}, ctx.cor)
        c2.cor[campo] = cor
        return original.call(it, c2)
      },
    })
  })
}

export { ANEIS, RELOGIOS, TATUAGENS }

/**
 * CHAPEU — o `bone` saiu por recusa do dono ("apague o bone numero tres"). O
 * substituto e o `bone-novo` de chapeus-extra.js, desenhado a partir de uma
 * foto que ele mandou e sem os erros do antigo (aba de chapa reta, copa que
 * assentava por dentro da bola do olho).
 */
const CHAPEUS_FORA = ['bone']
export const CHAPEUS = CHAPEUS_BASE.filter((c) => CHAPEUS_FORA.indexOf(c.id) < 0)

/**
 * COLAR — ficaram o "nenhum" e o `crucifixo`, que foi o unico aprovado: "o
 * unico colar que ficou bom foi o cruz de prata... ele ficou um pouco CAIDO no
 * pescoco, dando o aspecto de que e colar mesmo". Esse caimento virou o padrao
 * dos cinco novos. `elos` e `bandana` sairam.
 */
const COLARES_FORA = ['elos', 'bandana']
export const COLARES = COLARES_BASE.filter((c) => COLARES_FORA.indexOf(c.id) < 0)

/**
 * CALCA — TREZE, sendo tres BERMUDAS.
 *
 * As tres antigas (jeans, jogger, cargo) ficaram; as dez novas vem de
 * `calcas-extra.js` e foram feitas junto com as camisas novas, com a mesma
 * lista de modas em mente, pra as duas abas combinarem em vez de cada uma
 * seguir um caminho.
 */
export const CALCAS = comModa(CALCAS_BASE.concat(CALCAS_EXTRA), MODA_CALCA, 'calca')

/**
 * CALCADO — SETE. A 'bota' saiu por recusa do dono (era o item 02 da aba), e
 * sai por FILTRO em vez de ser apagada do arquivo: o codigo dela continua em
 * calcados.js e voltar e uma linha. Ver o comentario de BARBAS em
 * appearance.js — a mesma decisao, pelo mesmo motivo, com o mesmo preco
 * (indice de catalogo e o que esta no save e o que viaja na rede).
 */
const CALCADOS_FORA = ['bota']
export const CALCADOS = comModa(
  CALCADOS_BASE.concat(CALCADOS_EXTRA).filter((c) => CALCADOS_FORA.indexOf(c.id) < 0),
  MODA_CALCADO, 'calcado')
/**
 * CAMISA — DOZE. As tres antigas viraram UMA: o dono reprovou o catalogo
 * inteiro ("as camisas nao estao boas, apague elas todas... deixe apenas o 04
 * moletom") e o motivo era o mesmo das 18 que ja tinham saido antes — as tres
 * eram a mesma superficie de revolucao com manga diferente, e superficie lisa
 * sem espessura na borda le como TINTA no corpo, nao como pano. O `moletom`
 * sobreviveu porque e o unico feito de DUPLA CASCA: barra, punho e gola tem
 * avesso visivel, e e isso que o faz existir como roupa.
 *
 * As dez novas (`camisas-extra.js`) foram feitas com esse padrao como piso e
 * com dez MODAS diferentes, nao dez cores: regata, polo, flanela aberta,
 * corta-vento, havaiana, camisa de time, sueter de trico, jaqueta jeans,
 * oversized e colete. As calcas novas sairam da mesma lista, pra as duas abas
 * combinarem.
 *
 * A remocao e por FILTRO: 'camiseta' e 'alfaiate' continuam inteiras em
 * camisas.js e voltar e uma linha.
 */
const CAMISAS_FORA = ['camiseta', 'alfaiate']
export const CAMISAS = comModa(
  CAMISAS_BASE.concat(CAMISAS_EXTRA).filter((c) => CAMISAS_FORA.indexOf(c.id) < 0),
  MODA_CAMISA, 'blusa')

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
