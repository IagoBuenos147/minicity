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
  { x0: 32, x1: 52, z0: -30, z1: -12, h: 11, c: 0x9a8570, style: 'brick' },
  { x0: 14, x1: 30, z0: -52, z1: -32, h: 14, c: 0x7f8a97, style: 'panel' },
  { x0: 32, x1: 52, z0: -52, z1: -33, h: 9, c: 0xb0a08a, style: 'plaster' },
  // NW (ao lado da mercearia)
  { x0: -52, x1: -38, z0: -30, z1: -12, h: 12, c: 0x8d7f96, style: 'plaster' },
  { x0: -52, x1: -30, z0: -52, z1: -35, h: 16, c: 0x6f7b88, style: 'panel' },
  { x0: -28, x1: -14, z0: -52, z1: -35, h: 10, c: 0xa5896f, style: 'brick' },
  // SE (o lote 14..34 / 12..30 nao esta aqui de proposito: virou o CASSINO)
  { x0: 36, x1: 52, z0: 12, z1: 28, h: 8, c: 0xbba07f, style: 'brick' },
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
export const LOTES = [BARBER, GROCERY, CASINO]

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
