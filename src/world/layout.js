// ---------------------------------------------------------------------------
// Mapa da cidade. Todas as posicoes sao absolutas em metros.
// Convencao: um "lote" e definido por caixa XZ (x0,x1,z0,z1) e a fachada
// aponta para +Z (rua principal em z=0) salvo indicacao contraria.
// ---------------------------------------------------------------------------

export const WALL_T = 0.3 // espessura de parede

// --- Barbearia: quadrante nordeste, fachada para a rua z=0 --------------
export const BARBER = {
  id: 'barber',
  x0: 14, x1: 30,     // 16 m
  z0: -28, z1: -12,   // 16 m
  wallHeight: 3.5,
  facade: 'z1',       // parede z = z1 e a fachada (voltada para +Z)
  door: { center: 22, width: 2.3, height: 2.5 },
  sign: 'BARBEARIA DO ZEZO',
  signColor: 0xe23b3b,
}

// --- Mercearia: quadrante noroeste, fachada para a rua z=0 --------------
export const GROCERY = {
  id: 'grocery',
  x0: -36, x1: -14,   // 22 m
  z0: -32, z1: -12,   // 20 m
  wallHeight: 4.0,
  facade: 'z1',
  door: { center: -25, width: 2.6, height: 2.6 },
  sign: 'MERCEARIA CENTRAL',
  signColor: 0x2f9e57,
}

// --- Cassino: quadrante sudeste, fachada para a rua z=0 ------------------
// Unico lote do mapa com a fachada virada para -Z (a rua principal fica ao
// NORTE dele). Por isso ele NAO passa pelo buildShell de city.js, que so sabe
// desenhar vitrine e letreiro em z1: a casca do cassino e feita pelo proprio
// src/world/casino.js, junto com o miolo, e assim a fachada pode ser o que um
// cassino pede (marquise, neon, tapete vermelho) em vez de mais uma loja.
//
// Ele OCUPA o lote que antes era um predio de cenario (o FILLERS de
// 14..34 / 12..30): a esquina do cruzamento central e o lugar mais visto do
// mapa, e "chamativo" so quer dizer alguma coisa se der pra ver de longe.
export const CASINO = {
  id: 'casino',
  x0: 14, x1: 34,     // 20 m
  z0: 12, z1: 30,     // 18 m
  wallHeight: 6.2,    // pe-direito alto: cassino nao tem teto baixo
  facade: 'z0',       // parede z = z0 e a fachada (voltada para -Z)
  door: { center: 24, width: 3.4, height: 3.4 },
  sign: 'CASSINO ESTRELA',
  signColor: 0xffb327,
}

// --- A casa velha: o primeiro estabelecimento ----------------------------
// Casa pequena, antiga e mal cuidada, no mesmo quarteirao do cassino e virada
// pra MESMA rua (fachada em z0, olhando pra -Z). E o lugar da segunda cena de
// abertura: os jogadores param na calcada, olham pra ela, e o dono do plano
// diz que "nao era bem isso que eu imaginei, mas e um comeco".
//
// Ela e pequena de proposito -- 12 x 10 m contra os 20 x 18 do cassino -- e o
// miolo dela e um L, nao um retangulo: a sala da frente vira um corredor
// estreito ate os fundos. Um comodo quadrado nao passaria a sensacao de aperto
// que a cena precisa.
export const CASA = {
  id: 'casa',
  // 14 x 12,5 m. O tamanho NAO e uma escala escolhida a dedo: e o que o
  // quarteirao da, medido nos quatro lados.
  //  - x0 = 36.9 porque o avental (apronOf(b, 0.9), que entra no groundY)
  //    encosta EXATAMENTE em 36.0, a borda da laje do beco: junta topo a topo,
  //    sem sobra de grama e sem duas lajes disputando o mesmo Y;
  //  - x1 = 50.9 porque o avental para em 51.8 e o asfalto do anel comeca em
  //    52.0;
  //  - z0 = 12 e INTOCAVEL: 8..12 e a calcada da avenida e e la que nasce a
  //    fila (filaDaCasa poe todo mundo em z0 - 3.2);
  //  - z1 = 24.5 come os 2 m livres ate o quintal murado, que recuou pra 25.5.
  //
  // O eixo que estava matando o lugar era o Z. A sala da frente tinha 4,10 m de
  // fundura e UMA mesa de sinuca de 7 pes precisa de 4,17 (1,27 de mesa mais
  // 1,45 de taco de cada lado): faltavam 7 cm pra caber uma. Agora sao 5,40.
  x0: 36.9, x1: 50.9, // 14 m
  z0: 12, z1: 24.5,   // 12.5 m
  // 3.5 e nao 3.2: o forro subiu pra 2.90 local (3.06 no mundo) porque isto
  // deixou de ser sala de casa e virou salao de jogos — o taco de sinuca
  // levanta 1,45 m acima do pano, que fica a 0,80 do chao.
  wallHeight: 3.5,
  facade: 'z0',
  // 2.0 e nao 1.7: e por aqui que a mesa de sinuca (1,27 m de lado curto) entra
  // carregada. Era o vao mais estreito do mapa; a barbearia tem 2.3.
  door: { center: 43, width: 2.0, height: 2.4 },
  sign: 'CASA 42',
  signColor: 0x9a8a6a,
}

// Distancia entre um jogador e o vizinho na fila da frente da casa.
//
// 1,30 m: o personagem tem 0,426 m de ombro a ombro, entao sobram 87 cm de
// respiro entre dois. Menos que isso e a fila vira aglomeracao e os bracos
// atravessam o vizinho na animacao de idle; mais que isso e a fila de quatro
// passa de 4,3 m e comeca a encostar na placa de VENDE-SE (x 47.6..48.2) de um
// lado e no poste do outro.
const PASSO_FILA = 1.30

/**
 * Onde nasce o jogador de indice `i` num grupo de `n`, EM FILA na frente da
 * casa velha e olhando pra ela.
 *
 * Existe aqui, e nao em main.js nem na cutscene, porque os TRES precisam da
 * mesma conta e precisam concordar: a cutscene poe os bonecos na fila, o
 * teleport do fim poe o jogador de verdade, e se as duas contas divergirem o
 * jogador ve o proprio corpo saltar de lugar no instante em que ganha o
 * controle. Antes disso todo mundo nascia no MESMO ponto (door.center,
 * z0-3.2), o que no coop empilhava quatro corpos no mesmo metro quadrado.
 *
 * O YAW E PI, E ISSO FOI MEDIDO, NAO DEDUZIDO.
 *
 * A intuicao diz 0: a fachada e a face z0, o jogador chega pelo z menor, entao
 * "olhar pra +Z" pareceria ser olhar pra porta. Esta errado. Nascendo com yaw 0
 * em (43, 8.8) a camera de 3a pessoa vai parar em z = 13.2 — DENTRO da casa,
 * atras da porta, e a tela inteira vira uma tabua de madeira. Foi assim que o
 * dono do projeto recebeu o jogo depois da cutscene. Com yaw = PI a mesma
 * camera vai pra z = 4.4: na calcada, atras do jogador, com a casa de frente.
 *
 * A razao esta em player/controller.js: teleport(x, z, yaw) guarda o yaw da
 * CAMERA e poe o corpo em yaw + PI. A camera de 3a pessoa recua no sentido
 * oposto ao que ela olha, entao quem quiser a casa na tela tem que olhar PRA
 * ela, e nesta convencao isso e PI.
 */
export function filaDaCasa(i, n) {
  const total = Math.max(1, n | 0)
  const idx = Math.min(total - 1, Math.max(0, i | 0))
  return {
    x: CASA.door.center + (idx - (total - 1) / 2) * PASSO_FILA,
    z: CASA.z0 - 3.2,
    yaw: Math.PI,
  }
}

// --- Loja de jogos: quadrante nordeste, fachada para a rua z=0 -------------
// Ocupa o lote que era predio de cenario. Esta era a unica frente de avenida
// livre do mapa: as quatro esquinas do cruzamento ja estao tomadas e o que
// sobra dentro dos quarteiroes sao faixas de 2 a 4 m entre predios.
//
// A escolha nao foi so "onde cabe", foi ONDE ADIANTA: da porta daqui (42, -12)
// ate a porta da CASA (43, 12) sao 24 m atravessando a avenida, e ela fica de
// frente pro CASSINO. Comprar a mesa e instalar a mesa ficam na mesma esquina.
//
// Fachada em z1 como barbearia e mercearia, DE PROPOSITO: assim ela passa pelo
// buildShell de city.js e por apronOf/naFrenteDaPorta/semLotes/neve sem que
// nenhum deles precise aprender um caso novo (um lote virado pro +X obrigaria a
// mexer nos quatro).
//
// Pe-direito 4.2 porque as duas mesas de sinuca ficam em palco de 25 cm: o
// peitoril da vitrine comeca em y=0.85 e o tampo de uma mesa de bar fica em
// 0.80 — sem o palco, quem passa na calcada ve so a borda.
export const LOJA_JOGOS = {
  id: 'jogos',
  x0: 32, x1: 52,     // 20 m
  z0: -30, z1: -12,   // 18 m
  wallHeight: 4.2,
  facade: 'z1',
  door: { center: 42, width: 2.8, height: 2.7 },
  sign: 'TACO DE OURO',
  // magenta: vermelho e do barbeiro, verde da mercearia, ambar do cassino e
  // bege da casa. De longe tem que dar pra dizer QUAL loja e so pela cor.
  signColor: 0xd93bb0,
}

// interior util (dentro das paredes)
export function interiorOf(b) {
  return {
    x0: b.x0 + WALL_T, x1: b.x1 - WALL_T,
    z0: b.z0 + WALL_T, z1: b.z1 - WALL_T,
    h: b.wallHeight,
    cx: (b.x0 + b.x1) / 2,
    cz: (b.z0 + b.z1) / 2,
    w: (b.x1 - b.x0) - WALL_T * 2,
    d: (b.z1 - b.z0) - WALL_T * 2,
  }
}

// --- Predios de cenario (sem interior) ----------------------------------
// h = altura, c = cor base, style: 'brick' | 'plaster' | 'panel'
export const FILLERS = [
  // NE (ao lado da barbearia)
  // O lote de 32..52 / -30..-12 saiu daqui: virou a LOJA DE JOGOS. Era a unica
  // frente de avenida do mapa que ainda era predio cego, e "loja" so quer dizer
  // alguma coisa se der pra chegar nela pela calcada.
  { x0: 14, x1: 30, z0: -52, z1: -32, h: 14, c: 0x7f8a97, style: 'panel' },
  { x0: 32, x1: 52, z0: -52, z1: -33, h: 9, c: 0xb0a08a, style: 'plaster' },
  // NW (ao lado da mercearia)
  { x0: -52, x1: -38, z0: -30, z1: -12, h: 12, c: 0x8d7f96, style: 'plaster' },
  { x0: -52, x1: -30, z0: -52, z1: -35, h: 16, c: 0x6f7b88, style: 'panel' },
  { x0: -28, x1: -14, z0: -52, z1: -35, h: 10, c: 0xa5896f, style: 'brick' },
  // SE (dois lotes sairam daqui: 14..34 / 12..30 virou o CASSINO, e a faixa
  // 38..50 / 12..22 virou a CASA VELHA. O que sobrou do lote de esquina virou
  // o quintal murado dos fundos dela.)
  // Recuou de z0=24 pra 25.5 e baixou de 7 pra 4.5 m: a casa velha cresceu ate
  // z1=24.5 e o avental dela vai ate 25.4. Com 2,5 m de fundura, 7 m de altura
  // viraria uma torre em cima de uma laje fina; 4,5 le como muro de quintal,
  // que e o que ele sempre foi.
  { x0: 36, x1: 52, z0: 25.5, z1: 28, h: 4.5, c: 0xbba07f, style: 'brick' },
  { x0: 14, x1: 32, z0: 34, z1: 52, h: 10, c: 0x9c9086, style: 'plaster' },
  { x0: 36, x1: 52, z0: 32, z1: 52, h: 15, c: 0x77828f, style: 'panel' },
  // SW e o parque (sem predios grandes), so um no canto
  { x0: -52, x1: -36, z0: 36, z1: 52, h: 9, c: 0xa8927a, style: 'brick' },
]

// Os tres predios que tem INTERIOR de verdade. Quem precisa varrer "todo
// predio em que da pra entrar" (o avental de calcada e o groundY de city.js, a
// grade de telhado da chuva em clima.js, os occluders de camera do main, a
// neve dos telhados) le esta lista em vez de repetir as tres constantes na mao
// -- que e como o cassino ficaria de fora de um deles e ninguem notaria.
export const LOTES = [BARBER, GROCERY, CASINO, CASA, LOJA_JOGOS]

/** Retangulo do avental de calcada em volta de um lote, ja respeitando de que
 *  lado fica a fachada (na frente quem manda e a calcada da rua). */
export function apronOf(b, pad) {
  const p = typeof pad === 'number' ? pad : 0.9
  const frenteEmZ0 = b.facade === 'z0'
  return {
    x0: b.x0 - p, x1: b.x1 + p,
    z0: frenteEmZ0 ? b.z0 : b.z0 - p,
    z1: frenteEmZ0 ? b.z1 + p : b.z1,
  }
}

// --- Praca / parque: quadrante sudoeste ---------------------------------
export const PARK = { x0: -52, x1: -14, z0: 12, z1: 34 }
