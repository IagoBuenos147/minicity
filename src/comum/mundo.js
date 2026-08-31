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
//
// 3: a aparencia passou de 6 para 20 bytes (o contrato do personagem: cabeca,
// olhos, pupila, nariz, boca, barba, cabelo, pele, cor do cabelo, sobrancelha e
// as nove pecas de roupa). Ela viaja em CINCO pacotes — ENTRAR, MINHA_APARENCIA,
// APARENCIA, ENTROU e BEMVINDO — e no BEMVINDO ela fica no MEIO, antes das
// listas de NPC e objeto. Um cliente da versao 2 leria 14 bytes a menos e
// montaria o mundo inteiro deslocado, calado. Por isso a versao sobe: e melhor
// o servidor recusar e pedir pra recarregar do que rodar torto.
//
// 4: o rapaz que vira zumbi virou NPC de verdade (id 1004) e o cerebro dele foi
// pro servidor. Mudaram DUAS coisas que um cliente velho leria errado em
// silencio: nasceu o pacote ZUMBI_TIRO (18) e o enum EST_NPC ganhou os valores
// 5..9 (sao, adoecendo, zumbi, morto, sumido). Um cliente da versao 3 recebe o
// NPC 1004 no BEMVINDO — ele nao ia sumir, ia aparecer como um NPC com pose
// desconhecida — e nunca entenderia por que ele comecou a andar. Pior: ele
// tambem nao saberia mandar ZUMBI_TIRO, entao atirava e nada acontecia. Melhor
// recusar e pedir pra recarregar.
export const VERSAO_PROTOCOLO = 7
export const TICK_HZ = 15
export const ATRASO_INTERP = 0.1      // segundos: o remoto e desenhado 100 ms atras
// QUATRO, e nao vinte. O jogo passou a ter LOBBY: o dono do projeto pediu
// "um servidor somente que cabe de 2 a 4 pessoas". O numero e o teto da sala e
// tambem o denominador do contador de prontos ("2/4 prontos") que aparece na
// tela de criacao de personagem — por isso ele mora aqui, nos dois lados, e nao
// numa constante de UI.
export const MAX_JOGADORES = 4
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
    // Provador de roupa: fica na barbearia, do lado oposto ao barbeiro, junto a
    // parede leste. O barbeiro cuida do ROSTO; este cuida da ROUPA.
    id: 1003, chave: 'provador', nome: 'Rosa',
    x: 27.4, y: 0.16, z: -19.2, yaw: -1.5707963,
    pose: 'work', local: 'barbearia',
    falas: [
      'Quer trocar de roupa? Chegou coisa nova.',
      'Prova ai, fica a vontade.',
      'Ficou bom em voce!',
    ],
    opcoes: ['Quero trocar de roupa', 'So olhando', 'Tchau'],
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

// O RAPAZ QUE VIRAVA ZUMBI FOI APAGADO DO JOGO.
//
// Ele era o NPC 1004 e trazia junto um bloco de constantes aqui (velocidade,
// tempo de doenca, vida, raio) mais uma maquina de estados inteira no
// servidor. Saiu tudo a pedido do dono do projeto. O que FICOU de proposito:
// os valores 5..9 do enum EST_NPC em protocolo.js (SAO, ADOECENDO, ZUMBI,
// MORTO, SUMIDO). Tirar valor de enum de um formato binario que ja esta no ar
// e trocar um risco pequeno (cinco numeros que ninguem usa) por um grande
// (dois lados do socket discordando do significado de um byte).
//
// Se um dia ele voltar: o codigo do cliente esta no historico do git, no
// commit anterior a esta remocao.

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
// A LISTA ESTA VAZIA de proposito. Estes objetos existiam pra o ANEL VERDE
// levitar, e o anel saiu do jogo (esta em backup/poder/anel.js). Sem ele eles
// seriam so caixotes que o servidor sincroniza 15 vezes por segundo pra
// ninguem tocar. O FORMATO fica: TIPOS_AGARRAVEL acima, os pacotes OBJ_* em
// protocolo.js e o Map de objetos em sala.js continuam inteiros, entao devolver
// o anel e devolver as linhas desta lista.
export const AGARRAVEIS = [
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
export const PORTAL_RAIO = 1.45

// --- Veiculos ---------------------------------------------------------------
// Faixa de id: 4000..4999. Os tres primeiros ficam estacionados na rua
// principal, em frente as lojas, a poucos passos do ponto onde o jogo comeca —
// e o "patio de testes" pedido: da pra chegar neles andando em 5 segundos.
// O helicoptero NAO entra aqui: ele nasce quando alguem cria com o anel, e o
// servidor da o id na hora (4100..4999).
export const VEICULOS = [
  { id: 4000, tipo: 'carro', x: 3.2, y: 0, z: -5.4, yaw: Math.PI / 2 },
  { id: 4001, tipo: 'moto', x: 7.0, y: 0, z: -5.4, yaw: Math.PI / 2 },
  { id: 4002, tipo: 'skate', x: 10.2, y: 0, z: -5.4, yaw: Math.PI / 2 },
]
export const VEICULO_POR_ID = {}
for (const v of VEICULOS) VEICULO_POR_ID[v.id] = v

export const HELI_ID_MIN = 4100
export const HELI_ID_MAX = 4999
// Quanto tempo segurando o anel pra montar o helicoptero, em segundos.
export const HELI_MONTAGEM = 3.4

// Como cada um dirige. Numeros em metros e segundos.
// O carro e o mais rapido em reta e o que menos vira; o skate e o contrario.
//
// `limite` e a ADERENCIA, em m/s^2 de aceleracao lateral: a curva pede
// |taxa de giro x velocidade| e o pneu segura ate este teto — o que passar
// disso vira derrapagem (veiculos.js, funcao andar). Como a taxa de giro e
// limitada por giroMax, o pedido maximo de cada veiculo e giroMax*velMax:
// carro 17.2, moto 20.3, skate 10.4. Por isso o carro (limite 10) so comeca a
// sair de lado acima de uns 46 km/h de curva fechada e gruda em tudo abaixo
// disso, a moto (14) so escorrega em alta, e o skate (7) so quando o jogador
// carrega numa curva quase no talo.
// `agarra` deixou de ser "quanto escorrega" e virou "quanto rapido o pneu
// morde de volta": a velocidade lateral morre a agarra*6.5 por segundo.
//
// A PRIMEIRA VERSAO DISTO ERROU A MAO e o dono reprovou: com limite 5.5 e
// agarra 0.26 o carro escorregava em QUALQUER curva e a escorregada durava
// mais de meio segundo, entao ele parecia estar sempre no gelo — e como o
// giroMax era 0.62 (35 graus por segundo de guinada) ele ainda por cima virava
// pouco. Derrapagem tem que ser o que acontece quando o jogador EXAGERA, nao o
// estado normal do carro.
export const DIRIGIR = {
  carro: {
    velMax: 22, re: 7, acel: 11, freio: 20, atrito: 2.2,
    giroMax: 0.78, giroVel: 3.0, agarra: 0.5, limite: 10,
    inclina: 0.15, alturaCam: 2.5, distCam: 7.2,
  },
  moto: {
    velMax: 26, re: 5, acel: 15, freio: 22, atrito: 2.6,
    giroMax: 0.78, giroVel: 3.4, agarra: 0.95, limite: 14,
    inclina: 0.55, alturaCam: 2.1, distCam: 5.6,
  },
  // A CAMINHONETE e o veiculo PESADO. Ela nao e "o carro mais lenta": cada
  // numero aqui vem de uma coisa que uma pickup velha faz e nenhum dos outros
  // tres faz.
  //   velMax 17 e acel 7.5  motor cansado. Ela demora pra chegar la, e chega
  //                         em 61 km/h contra os 79 do carro.
  //   giroMax 0.66          entre-eixos de 3 m nao vira em cima de si mesmo.
  //   limite 7.5            pneu alto e cravado agarra MENOS que pneu de rua:
  //                         o pedido maximo dela e 0.66*17 = 11.2, entao ela
  //                         comeca a sair de lado bem antes do carro (17.2
  //                         pedidos contra 10 de limite).
  //   agarra 0.45           e quando sai, demora a morder de volta.
  //   inclina 0.30          o dobro do carro. Ela e ALTA, e o corpo tombar na
  //                         curva e o que faz ela se sentir pesada — foi por
  //                         isso que a carroceria virou grupo separado das
  //                         rodas (VEICULOS.md).
  //   freio 15              tambor velho: para, mas pedindo licenca.
  caminhonete: {
    velMax: 17, re: 6, acel: 7.5, freio: 15, atrito: 2.6,
    giroMax: 0.66, giroVel: 2.2, agarra: 0.45, limite: 7.5,
    inclina: 0.30, alturaCam: 2.9, distCam: 8.0,
  },
  // `impulso` e quanto UMA empurrada rende parado (m/s); ela rende cada vez
  // menos conforme a velocidade sobe, e por isso o skate tem uma velocidade de
  // cruzeiro (uns 34 km/h) em vez de ir sempre ao teto. `ciclo` e quanto dura
  // a empurrada inteira: pe fora do deck, varredura e volta. O `atrito` baixo
  // e o que faz ele rolar sozinho por muito tempo, como skate de verdade.
  //
  // `planeioMin`/`planeioMax` sao a PAUSA entre uma empurrada e a proxima, com
  // o W continuando apertado. Sem ela o boneco varria o pe sem parar, feito
  // esteira, e o skate virava um carro lento — a queixa "a perna esta sem
  // impacto". Ninguem anda de skate assim: empurra, RECOLHE o pe e deixa
  // correr. A pausa cresce com a velocidade (0.34 s parado, 1.15 s em
  // cruzeiro) porque parado voce precisa de empurrada atras de empurrada pra
  // arrancar, e a 30 km/h uma so ja segura o rolo por bastante tempo.
  //
  // `impulso` subiu de 4.0 pra 6.5 por causa dessa pausa: com uma empurrada a
  // cada ~2.1 s em vez de a cada 1.25 s, o mesmo 4.0 daria um skate que nunca
  // sai do lugar. 6.5 devolve a mesma velocidade de cruzeiro (uns 34 km/h) com
  // MENOS empurradas, o que e o ponto — cada uma passa a valer, e da pra ver o
  // skate ganhar velocidade de degrau em degrau e perder devagar no planeio.
  skate: {
    velMax: 11.5, re: 3.2, acel: 4.2, freio: 5.5, atrito: 0.55,
    impulso: 6.5, ciclo: 1.25, planeioMin: 0.34, planeioMax: 1.15,
    giroMax: 0.9, giroVel: 3.0, agarra: 0.97, limite: 7,
    inclina: 0.30, alturaCam: 1.9, distCam: 4.6,
  },
  helicoptero: {
    velMax: 24, re: 8, acel: 9, freio: 10, atrito: 1.4,
    giroMax: 1.5, giroVel: 2.0, agarra: 1, inclina: 0.34, alturaCam: 4.2, distCam: 11,
    subida: 7.5, tetoY: 60,
  },
}

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
