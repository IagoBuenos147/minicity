// ---------------------------------------------------------------------------
// Constantes globais do jogo. 1 unidade = 1 metro. Y = cima. Chao em y = 0.
// ---------------------------------------------------------------------------

export const WORLD = {
  // Malha viaria: ruas centrais nos eixos x=0 e z=0 + anel externo em +-60.
  ROAD_HALF: 8,          // rua vai de -8 a +8 do eixo (16m de largura)
  SIDEWALK: 4,           // calcada de 8 a 12
  CURB_HEIGHT: 0.16,     // altura do meio-fio
  BLOCK_INNER: 12,       // borda interna do quarteirao (|x| ou |z| >= 12)
  BLOCK_OUTER: 52,       // borda externa do quarteirao
  RING: 60,              // eixo das ruas do anel externo
  GROUND: 200,           // tamanho do plano de chao
}

// Alturas oficiais de piso. TODO modulo que constroi chao deve usar estas
// constantes, e city.groundY(x,z) deve devolver exatamente estes valores.
export const LEVELS = {
  ROAD: 0,
  SIDEWALK: 0.16,   // = WORLD.CURB_HEIGHT
  PARK: 0.11,
  ALLEY: 0.05,
  SHOP_FLOOR: 0.16, // piso interno das lojas, nivelado com a calcada
  STEP_MAX: 0.45,   // degrau que o jogador sobe sozinho
}

export const PLAYER = {
  HEIGHT: 1.82,          // altura total do personagem em pe
  EYE_HEIGHT: 1.66,      // altura dos olhos (camera 1a pessoa)
  RADIUS: 0.38,          // raio de colisao
  WALK_SPEED: 3.1,
  RUN_SPEED: 6.2,
  ACCEL: 22,
  FRICTION: 14,
  GRAVITY: 24,
  JUMP: 7.2,
  MOUSE_SENSITIVITY: 0.0022,
  PITCH_LIMIT: 1.45,
}

export const CAMERA = {
  FOV_FP: 72,
  FOV_TP: 62,
  NEAR: 0.05,
  FAR: 600,

  // --- 3a pessoa: orbita em volta de um ponto focal na altura do peito ------
  TP_DISTANCE: 4.4,      // distancia padrao da orbita
  TP_MIN_DISTANCE: 1.2,  // o mais perto que a oclusao pode empurrar
  TP_HEIGHT: 1.42,       // ponto focal acima dos pes (peito/ombro)
  TP_SHOULDER: 0.45,     // deslocamento lateral do foco
  TP_SMOOTH: 16,         // suavizacao da posicao da camera
  TP_TARGET_SMOOTH: 20,  // suavizacao do ponto focal
  TP_IN_SPEED: 30,       // aproxima rapido (nao pode atravessar parede)
  TP_OUT_SPEED: 3.5,     // afasta devagar, sem tranco
  // Limites de inclinacao SO da 3a pessoa. Sem isso da pra girar a camera pro
  // topo da cabeca e o jogo vira visao aerea.
  TP_PITCH_MIN: -0.62,   // ~35 graus olhando de cima pra baixo
  TP_PITCH_MAX: 0.40,    // ~23 graus olhando de baixo pra cima
  // Auto-alinhamento: andando pra frente a camera volta pras costas sozinha.
  TP_FOLLOW: 1.6,        // forca (rad/s)
  TP_FOLLOW_DELAY: 0.45, // segundos parado de mouse antes de comecar
}

export const QUALITY = {
  SHADOW_MAP: 2048,
  PIXEL_RATIO_CAP: 2,
}
