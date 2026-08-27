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
  // SE
  { x0: 14, x1: 34, z0: 12, z1: 30, h: 13, c: 0x8e9aa6, style: 'panel' },
  { x0: 36, x1: 52, z0: 12, z1: 28, h: 8, c: 0xbba07f, style: 'brick' },
  { x0: 14, x1: 32, z0: 34, z1: 52, h: 10, c: 0x9c9086, style: 'plaster' },
  { x0: 36, x1: 52, z0: 32, z1: 52, h: 15, c: 0x77828f, style: 'panel' },
  // SW e o parque (sem predios grandes), so um no canto
  { x0: -52, x1: -36, z0: 36, z1: 52, h: 9, c: 0xa8927a, style: 'brick' },
]

// --- Praca / parque: quadrante sudoeste ---------------------------------
export const PARK = { x0: -52, x1: -14, z0: 12, z1: 34 }
