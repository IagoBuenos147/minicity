// ---------------------------------------------------------------------------
// A LISTA DE IDS ESTAVEIS DO MUNDO.
//
// Este arquivo roda nos DOIS lados: no navegador (ESM) e no servidor (Node).
// Por isso ele nao importa THREE nem nada de render — so numeros.
//
// A regra do projeto: NADA e identificado por posicao em array. Todo NPC e
// todo objeto tem um id proprio e estavel, e e o id que viaja pela rede.
// Trocar a ordem desta lista nao pode mudar o significado de nada.
//
//   jogadores   1 .. 999    (dados pelo servidor na entrada)
//   NPCs     1000 .. 1999   (fixos, aqui embaixo)
//   objetos  2000 .. 2999   (fixos, aqui embaixo)
// ---------------------------------------------------------------------------

// 2: o BEMVINDO ganhou o byte de itens (a arma de portal). Um cliente velho
// leria as listas de NPC/objeto no offset errado e montaria um mundo torto sem
// dar erro nenhum — entao a versao sobe e o servidor recusa quem estiver velho.
export const VERSAO_PROTOCOLO = 2
export const TICK_HZ = 15
export const ATRASO_INTERP = 0.1      // segundos: o remoto e desenhado 100 ms atras
export const MAX_JOGADORES = 20
export const RAIO_OUVIR_DIALOGO = 12  // metros: quem esta mais perto ve o balao
export const RAIO_PERDER_DIALOGO = 14 // se afastar mais que isso, o servidor libera

// --- NPCs -------------------------------------------------------------------
// y e a altura do CHAO onde ele pisa (o root do personagem fica nos pes).
// O cliente ja constroi esses NPCs; aqui so fixamos id e pose inicial pra que
// os dois lados falem do mesmo boneco.
export const NPCS = [
  {
    id: 1000, chave: 'barbeiro', nome: 'Zezo',
    x: 17.45, y: 0.16, z: -15.38, yaw: -2.786,
    pose: 'cut', local: 'barbearia',
    // o que ele fala; o servidor manda so o indice da linha
    falas: [
      'Fala! Senta ai que eu resolvo esse cabelo.',
      'Corte novo, homem novo. Escolhe ai.',
      'Volta sempre!',
    ],
    opcoes: ['Quero cortar o cabelo', 'So olhando', 'Tchau'],
  },
  {
    id: 1001, chave: 'cliente', nome: 'Cliente',
    x: 17.11, y: 0.626, z: -16.3, yaw: -1.5707963,
    pose: 'sit', local: 'barbearia',
    falas: ['Ta quase, ja ja e sua vez.'],
    opcoes: ['Beleza'],
  },
  {
    id: 1002, chave: 'atendente', nome: 'Mara',
    x: -19.8, y: 0.16, z: -17.35, yaw: 3.1415927,
    pose: 'work', local: 'mercearia',
    falas: [
      'Bem-vindo a mercearia! Da uma olhada.',
      'Refrigerante ta cinco reais.',
      'Volta sempre!',
    ],
    opcoes: ['Comprar refrigerante', 'So olhando', 'Tchau'],
  },
]

export const NPC_POR_CHAVE = {}
for (const n of NPCS) NPC_POR_CHAVE[n.chave] = n

// --- Objetos agarraveis (o anel verde) --------------------------------------
// tipo define a forma e o tamanho; o cliente monta o mesh a partir disso.
// y e a altura do CENTRO do objeto (ja somando o chao).
export const TIPOS_AGARRAVEL = {
  caixote: { w: 0.72, h: 0.72, d: 0.72, massa: 1.0, cor: 0x8a5a34 },
  caixa: { w: 0.54, h: 0.42, d: 0.44, massa: 0.7, cor: 0xb08b5e },
  lata: { w: 0.56, h: 0.82, d: 0.56, massa: 1.1, cor: 0x3f6b4a, redondo: true },
  vaso: { w: 0.62, h: 0.54, d: 0.62, massa: 1.3, cor: 0xa8623c, redondo: true },
  cone: { w: 0.46, h: 0.66, d: 0.46, massa: 0.4, cor: 0xe4622a, redondo: true },
  engradado: { w: 0.66, h: 0.46, d: 0.48, massa: 0.8, cor: 0x6f4a2a },
}

// Posicoes escolhidas a dedo em chao livre: calcada da rua principal, beco,
// praca e frente das lojas. Nenhuma cai dentro de parede ou em cima de movel.
export const AGARRAVEIS = [
  // calcada norte da rua principal, entre as duas lojas (chao 0.16)
  { id: 2000, tipo: 'caixote', x: 12.4, y: 0.52, z: -10.2 },
  { id: 2001, tipo: 'caixa', x: 13.6, y: 0.37, z: -9.4 },
  { id: 2002, tipo: 'lata', x: 10.8, y: 0.57, z: -10.6 },
  { id: 2003, tipo: 'cone', x: 9.2, y: 0.49, z: -9.2 },
  { id: 2004, tipo: 'caixote', x: -12.6, y: 0.52, z: -10.4 },
  { id: 2005, tipo: 'engradado', x: -13.8, y: 0.39, z: -9.6 },
  { id: 2006, tipo: 'lata', x: -10.6, y: 0.57, z: -10.8 },
  { id: 2007, tipo: 'vaso', x: -9.4, y: 0.43, z: -9.4 },
  // calcada sul, do outro lado da rua principal
  { id: 2008, tipo: 'caixote', x: 11.5, y: 0.52, z: 9.8 },
  { id: 2009, tipo: 'cone', x: 13.2, y: 0.49, z: 10.6 },
  { id: 2010, tipo: 'caixa', x: -11.8, y: 0.37, z: 9.6 },
  { id: 2011, tipo: 'lata', x: -13.4, y: 0.57, z: 10.8 },
  // beco do quadrante sudeste (chao 0.05)
  { id: 2012, tipo: 'caixote', x: 34.9, y: 0.41, z: 16.5 },
  { id: 2013, tipo: 'caixote', x: 34.9, y: 1.13, z: 16.5 },
  { id: 2014, tipo: 'engradado', x: 35.1, y: 0.28, z: 19.2 },
  { id: 2015, tipo: 'lata', x: 34.7, y: 0.46, z: 22.4 },
  { id: 2016, tipo: 'caixa', x: 35.2, y: 0.26, z: 25.1 },
  { id: 2017, tipo: 'engradado', x: 34.8, y: 0.28, z: 28.3 },
  // praca (chao 0.11)
  { id: 2018, tipo: 'vaso', x: -22.5, y: 0.38, z: 18.4 },
  { id: 2019, tipo: 'vaso', x: -38.5, y: 0.38, z: 18.4 },
  { id: 2020, tipo: 'caixa', x: -30.4, y: 0.32, z: 31.2 },
  { id: 2021, tipo: 'lata', x: -18.6, y: 0.52, z: 29.4 },
  { id: 2022, tipo: 'cone', x: -42.2, y: 0.44, z: 27.6 },
  { id: 2023, tipo: 'caixote', x: -45.6, y: 0.47, z: 15.8 },
  // dentro da barbearia, perto do anel (chao 0.16)
  { id: 2024, tipo: 'caixa', x: 26.5, y: 0.37, z: -14.2 },
  { id: 2025, tipo: 'lata', x: 28.4, y: 0.57, z: -13.6 },
  // dentro da mercearia
  { id: 2026, tipo: 'engradado', x: -32.5, y: 0.39, z: -14.4 },
  { id: 2027, tipo: 'caixote', x: -34.2, y: 0.52, z: -14.8 },
]

export const AGARRAVEL_POR_ID = {}
for (const o of AGARRAVEIS) AGARRAVEL_POR_ID[o.id] = o

// --- A arma de portal e o destino do portal ---------------------------------
// A arma fica na MERCEARIA, longe da barbearia de proposito: assim o portal
// serve pra alguma coisa (voltar num pulo em vez de atravessar a cidade).
export const PORTAL_GUN = { x: -21.5, y: 1.06, z: -16.9 }

// Onde o portal cospe quem atravessa: dentro da barbearia, no corredor livre
// perto da porta (interior x 14.3..29.7, z -27.7..-12.3; porta em x=22).
export const PORTAL_DESTINO = { x: 22, y: 0.16, z: -14.2, yaw: Math.PI }

// Quanto tempo um portal fica aberto, em segundos. O servidor e quem conta.
export const PORTAL_DURACAO = 25
// Raio de travessia: quem chegar mais perto que isso do centro, atravessa.
export const PORTAL_RAIO = 1.15

// --- O anel verde, no chao da barbearia -------------------------------------
export const ANEL = { x: 25.8, y: 0.20, z: -16.0 }

// --- helpers usados pelos dois lados ----------------------------------------

/** Distancia no plano, que e o que importa pra "quem esta perto". */
export function distXZ(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz
  return Math.sqrt(dx * dx + dz * dz)
}

/** Angulo pra um NPC encarar um ponto. */
export function olharPara(nx, nz, ax, az) {
  return Math.atan2(ax - nx, az - nz)
}
