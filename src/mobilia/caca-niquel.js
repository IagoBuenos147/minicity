import * as THREE from 'three'
import {
  solid, stdMat, glass, box, cyl, sphere, woodTex, textPlaneMat,
} from '../world/materials.js'
import { bakeStatic } from '../world/bake.js'
import { SIMBOLOS, PAGAMENTOS } from '../cassino/slots.js'

// ---------------------------------------------------------------------------
// src/mobilia/caca-niquel.js — os caca-niqueis que vao pra loja de jogos e,
// depois de comprados, pro chao da casa (mesmo sistema da mesa de sinuca:
// MOBILIA -> vitrine -> mochila -> encaixe).
//
// DUAS MAQUINAS, MESMO MIOLO:
//   slot-madeira — gabinete de nogueira envernizada, cantos de latao, alavanca
//                  cromada com bola vermelha, bandeja de moedas, cupula com
//                  letreiro "JACKPOT". O caca-niquel classico de salao. E o
//                  item mais caro/raro do par.
//   slot-neon    — gabinete de metal esmaltado (pintura de forno vermelha,
//                  brilhante) estilo anos 70, com moldura de neon ciano em
//                  volta do letreiro do topo em vez da cupula de madeira.
//                  ESCOLHIDO entre as tres sugestoes do pedido porque e a que
//                  mais contrasta com madeira: outro material (esmalte liso
//                  x madeira com veio), outra fonte de luz (neon frio x
//                  letreiro quente) e outra silhueta (corpo fino e reto com
//                  topo em cunha inclinada x corpo largo com cupula
//                  arredondada) — as tres coisas que fazem duas maquinas
//                  lado a lado no salao nao parecerem a mesma peca repintada.
//
// OS SIMBOLOS SAO UM SO, DE cassino/slots.js. SIMBOLOS e PAGAMENTOS (pesos,
// cores, tabela de premio) sao IMPORTADOS, nunca redigitados: e exatamente o
// aviso do cabecalho daquele arquivo — duas tabelas pra mesma coisa e o tipo
// de coisa que um dia diverge e ninguem nota. O DESENHO de cada simbolo (a
// forma da cereja, do sino etc.) e proprio deste arquivo: world/casino.js
// no exporta a funcao que desenha (so exporta buildCasino), e nao da pra
// editar aquele arquivo pra exportar — entao os dois rolos daqui usam a
// MESMA cor e o MESMO id de cada simbolo, com um tracado mais simples porque
// este e um movel de casa visto de alguns metros, nao a fileira de maquinas
// do cassino visto de perto.
//
// AS DUAS MAQUINAS FICAM PARADAS. Os rolos nao giram sozinhos — uma maquina
// girando pra sempre num quarto vazio le como bug, e foi o aviso explicito do
// pedido. Cada gabinete tem exatamente UMA luz que pisca devagar (o letreiro),
// que e a "vida" que o encaixe (src/systems/encaixe.js) chama todo quadro
// pra quem esta a menos de 14 m — usada com parcimonia, uma por maquina.
//
// ORDEM bakeStatic() -> userData.update, NUNCA o contrario. bake.js sobe a
// cadeia de pais ATE O PROPRIO ROOT pra decidir o que preservar
// (isDynamicBranch caminha ate `root.parent`, ou seja, inclui o root); se o
// grupo raiz ja tivesse userData.update ANTES de assar, toda a arvore contaria
// como "subarvore dinamica" e o forno viraria no-op — nenhum mesh se fundiria
// e a maquina sairia da fabrica com 20+ draw calls em vez de ~10. A luz que
// pisca e so uma propriedade de MATERIAL (emissiveIntensity), entao nem
// precisa de userData.dynamic em nada: o forno clona GEOMETRIA, nunca troca a
// referencia do MATERIAL (ver bake.js), entao a variavel local que aponta pro
// material do letreiro continua valendo depois do mesh ser fundido junto com
// o resto.
// ---------------------------------------------------------------------------

// --- tabela de simbolos: mesma fonte do cassino, nunca reescrita aqui ------
const N_SIM = SIMBOLOS.length

/** Indice de um simbolo pelo id — robusto a reordenar SIMBOLOS. */
function idxSim(id) {
  const i = SIMBOLOS.findIndex((s) => s.id === id)
  return i < 0 ? 0 : i
}

/** Cor de um simbolo, direto da paleta de cassino/slots.js. */
function corSimbolo(id, mul) {
  const s = SIMBOLOS.find((x) => x.id === id)
  const c = new THREE.Color(s ? s.cor : 0xffffff)
  if (mul && mul !== 1) c.multiplyScalar(mul)
  return '#' + c.getHexString()
}

/** Estrela de `pontas` pontas, caminho fechado no contexto 2D — usada so pelo
 *  simbolo "estrela". Reimplementada aqui (nao importada): world/casino.js
 *  nao exporta a sua versao. */
function estrelaPathMovel(g, cx, cy, r, pontas, k) {
  g.beginPath()
  for (let i = 0; i < pontas * 2; i++) {
    const rr = i % 2 ? r * k : r
    const a = (i * Math.PI) / pontas - Math.PI / 2
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr
    if (i === 0) g.moveTo(x, y)
    else g.lineTo(x, y)
  }
  g.closePath()
}

/**
 * Desenha UM simbolo numa celula 256x256 centrada na origem do contexto.
 * Recebe o ID (nao o indice), pelo mesmo motivo do cassino: sobreviver a uma
 * reordenacao de SIMBOLOS sem trocar um desenho pelo outro.
 *
 * Tracado mais simples que o do cassino (world/casino.js) de proposito: o
 * caca-niquel de casa e visto de alguns metros, nao de perto — silhueta clara
 * importa mais que detalhe fino aqui. A COR de cada forma vem sempre de
 * corSimbolo(), nunca escrita a mao: e ela que garante a mesma paleta do
 * cassino.
 */
function desenharSimboloMovel(g, id) {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (id === 'sete') {
    g.font = 'bold 190px "Trebuchet MS", sans-serif'
    g.fillStyle = corSimbolo('sete'); g.fillText('7', 0, 6)
    g.lineWidth = 8; g.strokeStyle = corSimbolo('sete', 0.5); g.strokeText('7', 0, 6)
  } else if (id === 'cereja') {
    g.strokeStyle = '#3f7a2c'; g.lineWidth = 10
    g.beginPath(); g.moveTo(-6, -18); g.quadraticCurveTo(-30, -68, -50, -86); g.stroke()
    g.beginPath(); g.moveTo(6, -18); g.quadraticCurveTo(26, -60, 46, -84); g.stroke()
    for (const p of [[-52, 40, 42], [40, 46, 46]]) {
      g.fillStyle = corSimbolo('cereja')
      g.beginPath(); g.arc(p[0], p[1], p[2], 0, Math.PI * 2); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.4)'
      g.beginPath(); g.arc(p[0] - p[2] * 0.3, p[1] - p[2] * 0.3, p[2] * 0.2, 0, Math.PI * 2); g.fill()
    }
  } else if (id === 'limao') {
    // RODADA 2: ainda pouco miolo — nao e a cor que erra (ela sempre veio de
    // corSimbolo), e quanto da celula ela cobre. Elipse maior (90x60 ->
    // 104x70) e contorno mais grosso/escuro aumentam a area de cor CHEIA.
    g.fillStyle = corSimbolo('limao')
    g.beginPath(); g.ellipse(0, 8, 104, 70, 0, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(55,46,6,0.72)'; g.lineWidth = 15; g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.beginPath(); g.ellipse(-30, -16, 30, 17, -0.4, 0, Math.PI * 2); g.fill()
  } else if (id === 'sino') {
    // RODADA 2: mesma logica — corpo do sino cresceu e o contorno engrossou
    // e escureceu mais, cobrindo mais celula com cor CHEIA.
    g.fillStyle = corSimbolo('sino')
    g.beginPath()
    g.moveTo(-80, 50); g.quadraticCurveTo(-66, -74, 0, -87)
    g.quadraticCurveTo(66, -74, 80, 50); g.closePath(); g.fill()
    g.lineWidth = 9; g.strokeStyle = 'rgba(35,24,6,0.75)'; g.stroke()
    g.fillStyle = corSimbolo('sino', 0.7); g.fillRect(-92, 50, 184, 24)
    g.lineWidth = 7; g.strokeRect(-92, 50, 184, 24)
    g.beginPath(); g.arc(0, 88, 20, 0, Math.PI * 2); g.fill(); g.stroke()
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.beginPath(); g.ellipse(-32, -16, 12, 35, 0.2, 0, Math.PI * 2); g.fill()
  } else if (id === 'ferradura') {
    // RODADA 2: o traco principal engrossou (36 -> 52) e o raio cresceu
    // (58 -> 66) — mais area de cor CHEIA na celula. O contorno escuro por
    // baixo engrossou junto pra nao sumir atras do traco maior.
    g.strokeStyle = 'rgba(28,31,35,0.68)'; g.lineWidth = 66
    g.beginPath(); g.arc(0, 4, 66, Math.PI * 0.08, Math.PI * 0.92); g.stroke()
    g.strokeStyle = corSimbolo('ferradura'); g.lineWidth = 52
    g.beginPath(); g.arc(0, 4, 66, Math.PI * 0.08, Math.PI * 0.92); g.stroke()
    for (const s of [-1, 1]) {
      g.strokeStyle = 'rgba(28,31,35,0.68)'; g.lineWidth = 66
      g.beginPath(); g.moveTo(s * 66, 2); g.lineTo(s * 66, -58); g.stroke()
      g.strokeStyle = corSimbolo('ferradura'); g.lineWidth = 52
      g.beginPath(); g.moveTo(s * 66, 2); g.lineTo(s * 66, -58); g.stroke()
    }
    g.fillStyle = '#2c3035'
    for (const p of [[-66, -46], [-48, 42], [0, 70], [48, 42], [66, -46]]) {
      g.beginPath(); g.arc(p[0], p[1], 8, 0, Math.PI * 2); g.fill()
    }
  } else if (id === 'estrela') {
    g.fillStyle = corSimbolo('estrela')
    estrelaPathMovel(g, 0, 4, 92, 5, 0.44); g.fill()
    g.lineWidth = 7; g.strokeStyle = corSimbolo('estrela', 0.55); g.stroke()
  } else if (id === 'diamante') {
    g.fillStyle = corSimbolo('diamante')
    g.beginPath()
    g.moveTo(0, -84); g.lineTo(80, -6); g.lineTo(0, 88); g.lineTo(-80, -6)
    g.closePath(); g.fill()
    g.strokeStyle = corSimbolo('diamante', 0.45); g.lineWidth = 6; g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 4
    g.beginPath(); g.moveTo(-80, -6); g.lineTo(80, -6); g.stroke()
  } else {
    // Simbolo novo em SIMBOLOS sem desenho aqui: um circulo com a cor certa
    // em vez de sumir, pra sobrar visivel que falta desenhar.
    g.fillStyle = corSimbolo(id)
    g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.fill()
  }
}

// Raio e comprimento do tambor. Escolhidos junto com a celula de 256 px: o
// perimetro (2*PI*ROL_R ~= 0.785 m) dividido pelos 7 simbolos da uma faixa de
// ~0.11 m por simbolo, que e legivel na janela de 0.28 m de altura.
const ROL_R = 0.125
const ROL_L = 0.145

let _roleteTexMovel = null
/**
 * Fita de simbolos do rolete: uma celula 256x256 por simbolo de SIMBOLOS,
 * numa unica textura cacheada (as duas maquinas e todas as instancias
 * compradas reusam a MESMA — so o gabinete ao redor muda).
 *
 * A rotate(PI/2) de cada celula existe pelo mesmo motivo do cassino: o
 * tambor e um cilindro deitado no X (ver tresRolos), entao na face que o
 * jogador ve o "u" da textura sobe na tela e o "v" anda pra esquerda — sem
 * girar o desenho, o simbolo sairia tombado.
 */
function roleteTexMovel() {
  if (_roleteTexMovel) return _roleteTexMovel
  const cel = 256
  const c = document.createElement('canvas')
  c.width = cel * N_SIM
  c.height = cel
  const g = c.getContext('2d')
  for (let i = 0; i < N_SIM; i++) {
    const x0 = i * cel
    // CORRECAO: o fundo era quase branco (#f2ecdc/#fffdf5) e os simbolos mais
    // claros da tabela (ferradura cinza, sino dourado, limao amarelo-esverdeado)
    // se misturavam nele e saiam "lavados" de longe — exatamente os tres que o
    // pedido de correcao apontou. Fundo mais encorpado agora: ainda le como
    // papel do rolete, mas com contraste de verdade contra as cores CHEIAS de
    // SIMBOLOS (a tabela em si nao mudou, so o que tinha em volta dela).
    g.fillStyle = i % 2 ? '#b9ae86' : '#cabf9a'
    g.fillRect(x0, 0, cel, cel)
    g.fillStyle = 'rgba(60,50,38,0.35)'
    g.fillRect(x0, 0, 3, cel)
    g.save()
    g.translate(x0 + cel / 2, cel / 2)
    g.rotate(Math.PI / 2)
    desenharSimboloMovel(g, SIMBOLOS[i].id)
    g.restore()
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping        // o tambor da a volta: u repete
  t.wrapT = THREE.ClampToEdgeWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  _roleteTexMovel = t
  return t
}

/** Material do rolete: stdMat ja cacheia por chave, entao so existe uma copia
 *  na GPU nao importa quantas maquinas (das duas ids) o jogador comprar. */
function matRoleteMovel() {
  return stdMat('mob-slot-rolete', {
    // color NAO e branco: e o freio de exposicao da fita. A sala e clara o
    // bastante pra que o branco (padrao) multiplique o mapa acima do que o
    // sRGB aguenta — o fundo #cabf9a saia em 234,220,180 e, com ele tao perto
    // do teto, os canais fortes dos simbolos ESTOURAVAM: o ambar do sino
    // (#d9a441, R=217) e o amarelo do limao passavam de 255 no vermelho e
    // caiam pro branco. Era isso, e nao a paleta nem a espessura do contorno,
    // que fazia sino, ferradura e limao lerem pastel — duas rodadas de
    // engrossar contorno nao mexeram nisso porque o problema estava DEPOIS do
    // desenho. Multiplicar o mapa inteiro por ~0,66 traz tudo pra dentro da
    // faixa de uma vez, sem tocar no canvas e sem mexer numa cor de
    // cassino/slots.js.
    map: roleteTexMovel(), color: 0xa8a8a8, roughness: 0.7, metalness: 0.0,
    // SEM EMISSIVO NENHUM, e nao "com pouco". Duas rodadas tentaram achar o
    // valor certo (0.45, depois 0.30) e as duas erraram o alvo, porque o
    // emissiveMap e o MESMO mapa da cor: o desenho aparecia DUAS vezes, uma
    // iluminada pela sala e outra por conta propria, e o que satura primeiro
    // e o fundo claro da fita. tools/diag-vp.mjs mediu o rolete em 236,225,192
    // — a um passo do branco puro. Com o fundo estourado, sino ambar (#d9a441)
    // e ferradura cinza (#9aa0a6) nao tinham mais como se destacar dele: por
    // isso os simbolos liam pastel por mais que se engrossasse o contorno.
    // A fita do rolete e PAPEL dentro de um gabinete, nao tela: superficie
    // iluminada, e so. Sem o brilho de brinde o fundo volta pro meio da faixa
    // e a paleta de cassino/slots.js aparece como foi escolhida.
  })
}

/**
 * Os TRES ROLOS — o miolo que as duas maquinas compartilham ("o mesmo
 * sistema", so o gabinete muda). PARADOS: cada um centraliza o simbolo de
 * `combinacao[i]` na janela e fica ali. `combinacao` e sempre um resultado
 * QUE NAO PAGA (sem trinca, sem par que a tabela de PAGAMENTOS reconheca) —
 * uma maquina de casa exibindo um premio nao recebido le como bug.
 */
function tresRolos(y, z, combinacao) {
  const mat = matRoleteMovel()
  const grupo = new THREE.Group()
  const passo = 0.155
  for (let i = 0; i < 3; i++) {
    const idx = idxSim(combinacao[i])
    const ang = (Math.PI * 2 * (idx + 0.5)) / N_SIM
    const eixo = new THREE.Group()
    eixo.position.set((i - 1) * passo, y, z)
    // Geometria NOVA a cada chamada (regra do projeto) — so o material acima
    // e cacheado.
    const geo = new THREE.CylinderGeometry(ROL_R, ROL_R, ROL_L, 24, 1, true)
    const m = new THREE.Mesh(geo, mat)
    m.rotation.z = Math.PI / 2            // deita o eixo do tambor no X local
    m.castShadow = false
    m.receiveShadow = true
    eixo.add(m)
    eixo.rotation.x = ang
    grupo.add(eixo)
  }
  return grupo
}

// --- materiais compartilhados pelas duas maquinas --------------------------
// Cacheados por chave (stdMat/solid ja cacheiam sozinhos) — comprar tres
// slot-madeira nao gera tres texturas nem tres materiais novos.
const MM = {
  // CORRECAO PEDIDA: a v1 destas duas era escura demais — em luz de casa (mais
  // fraca que o teste isolado onde foi calibrada) o corpo lia como preto e o
  // dono via uma "maquina de latao" no lugar de uma maquina de madeira. Cor E
  // base da textura subiram juntas (nao so a cor: um base escuro por baixo de
  // qualquer tom apaga o veio), e a rugosidade subiu um pouco pra sobrar luz
  // difusa em vez de so brilho pontual.
  get madeira() {
    return stdMat('mob-slot-madeira-corpo', {
      map: woodTex(1.2, '#5c3a1c'), color: 0xa87a48, roughness: 0.34, metalness: 0.04,
    })
  },
  get madeiraEscura() {
    return stdMat('mob-slot-madeira-escura', {
      map: woodTex(1.0, '#3a2412'), color: 0x6b4830, roughness: 0.40, metalness: 0.03,
    })
  },
  get latao() { return solid(0xb98f3f, 0.32, 0.75) },
  get preto() { return solid(0x141110, 0.85) },
  get pretoLuz() { return solid(0x0b0a09, 0.9) },
  get cromo() { return solid(0xd7dbe0, 0.16, 0.9) },
  get esmalte() { return solid(0xb23a22, 0.16, 0.08) },
}

/**
 * Placa "TRINCA DE X PAGA Nx", com o multiplicador tirado de PAGAMENTOS —
 * nunca digitado a mao. Um caca-niquel que promete um numero que o proprio
 * jogo nao paga e a mesma mentira que o cartaz da caca-niquel do cassino
 * evita (ver o comentario equivalente em world/casino.js).
 */
function placaPagamento(idSimbolo, w, h, opts) {
  const sim = SIMBOLOS.find((s) => s.id === idSimbolo)
  const nome = sim ? sim.nome : idSimbolo
  const mult = PAGAMENTOS.trinca[idSimbolo] || 0
  const texto = 'TRINCA DE ' + nome.toUpperCase() + ' PAGA ' + mult + 'X'
  const mat = textPlaneMat(texto, Object.assign({
    w: 768, h: 256, font: 'bold 76px "Trebuchet MS", sans-serif',
  }, opts))
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/**
 * Alavanca lateral: pivo cromado + haste + bola. Usada pelas duas maquinas
 * (so a cor da bola muda) — e o unico elemento que o pedido do dono exige
 * numa maquina e nao proibe na outra, entao manter nas duas mantem a leitura
 * "caca-niquel" imediata mesmo com gabinetes bem diferentes.
 *
 * `xSide/yMid/zFrente` e o ponto de PIVO (lado direito do gabinete, visto de
 * frente). O alcance total a partir do pivo fica em ~0.075-0.08 m de
 * proposito: pivo em W/2+0.02 e bola em +0.075 cabem dentro da folga lateral
 * de 0.10 m que a pegada reserva (ver os dois itens de CACA_NIQUEIS) — uma
 * alavanca "realista" (0.15-0.20 m) estouraria essa folga.
 */
function alavanca(xSide, yMid, zFrente, corBola) {
  const g = new THREE.Group()
  g.position.set(xSide, yMid, zFrente)
  const pivo = cyl(0.026, 0.028, 0.045, MM.cromo, 10)
  pivo.rotation.z = Math.PI / 2
  g.add(pivo)
  const haste = cyl(0.009, 0.009, 0.19, MM.cromo, 8)
  haste.position.set(0.032, 0.088, 0.018)
  haste.rotation.z = -0.32
  haste.rotation.x = -0.16
  g.add(haste)
  const bola = sphere(0.028, solid(corBola, 0.30, 0.05), 12)
  bola.position.set(0.075, 0.165, 0.040)
  g.add(bola)
  return g
}

/**
 * Contorno de neon fechado: um TubeGeometry ao longo de um retangulo com
 * CatmullRomCurve3 (a MESMA tecnica de tubo que barbershop.js/props.js ja
 * usam no projeto pra fio e mangueira — nada novo sendo introduzido). Os
 * cantos saem arredondados por causa da curva, o que por acaso e mais
 * fiel ao neon de verdade: tubo de vidro nao dobra em esquadro.
 *
 * So a maquina slot-neon usa isso — e o elemento que da o "neon nas bordas"
 * do pedido, contornando so a placa do letreiro (nao o gabinete inteiro: um
 * cassino de verdade acende a vitrine, nao a chapa de metal).
 */
function neonBorda(w, h, mat, r) {
  const hw = w / 2, hh = h / 2
  const pts = [
    new THREE.Vector3(-hw, -hh, 0),
    new THREE.Vector3(hw, -hh, 0),
    new THREE.Vector3(hw, hh, 0),
    new THREE.Vector3(-hw, hh, 0),
  ]
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.4)
  const geo = new THREE.TubeGeometry(curve, 32, r, 8, true)
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = false
  m.receiveShadow = false
  return m
}

// ---------------------------------------------------------------------------
// CONSOLE: fenda de moeda, botao grande e bandeja com boca de verdade.
//
// A v1 nao tinha nada disso — o console (a faixa entre a janela e a base) era
// so a bandeja rasa, e o resto ficava liso. As tres funcoes abaixo sao o que
// o olho procura numa maquina de verdade e o pedido de correcao apontou:
// fenda COM chapa em volta (nao a fenda sozinha), botao GRANDE com rotulo (nao
// os botoezinhos decorativos da v1) e bandeja com CAVIDADE (nao um bloco
// macico fingindo ser bandeja). Compartilhadas pelas duas maquinas — so a cor
// da chapa/tampa muda.
// ---------------------------------------------------------------------------

/** Fenda de moeda com a chapa em volta — a chapa e que faz parecer aplicada
 *  no gabinete, e nao um risco solto na madeira/esmalte. */
function fendaDeMoeda(w, h, matChapa) {
  const g = new THREE.Group()
  g.add(box(w, h, 0.012, matChapa, 0, 0, 0))
  g.add(box(w * 0.4, h * 0.16, 0.006, MM.pretoLuz, 0, h * 0.10, 0.010))
  return g
}

/**
 * Botao grande com rotulo (ex.: APOSTA/GIRAR) — base escura + tampa colorida
 * saindo da chapa + uma placa de texto pequena acima. O pedido foi explicito:
 * "um ou dois botoes GRANDES", nao decoracao.
 */
function botaoGrande(texto, corTampa, corTexto) {
  const g = new THREE.Group()
  const base = cyl(0.050, 0.050, 0.016, MM.preto, 16)
  base.rotation.x = Math.PI / 2
  base.position.z = 0.008
  g.add(base)
  const tampa = cyl(0.041, 0.041, 0.022, solid(corTampa, 0.28, 0.05), 16)
  tampa.rotation.x = Math.PI / 2
  tampa.position.z = 0.019
  g.add(tampa)
  const mat = textPlaneMat(texto, {
    w: 320, h: 128, color: corTexto || '#fff8ea', font: 'bold 92px "Trebuchet MS", sans-serif',
    emissiveIntensity: 0.20,
  })
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.042), mat)
  placa.position.set(0, 0.070, 0.007)
  placa.castShadow = false
  placa.receiveShadow = false
  g.add(placa)
  return g
}

/**
 * Bandeja de premio com BOCA DE VERDADE: um canal em U (fundo + costas +
 * laterais), aberto na frente e por cima — da pra "ver dentro" dela, que e
 * exatamente o que faltava (a v1 era um bloco macico, sem cavidade nenhuma).
 * Nasce com a boca virada pra +Z; quem chama so posiciona.
 */
function bandejaComBoca(w, prof, alt, matMetal) {
  const g = new THREE.Group()
  g.add(box(w, 0.012, prof, matMetal, 0, 0, -prof / 2))                    // fundo
  g.add(box(w, alt, 0.012, MM.pretoLuz, 0, alt / 2, -prof - 0.005))        // costas (cavidade escura)
  for (const s of [-1, 1]) {
    g.add(box(0.012, alt, prof, matMetal, s * (w / 2 - 0.006), alt / 2, -prof / 2))
  }
  g.add(box(w, 0.018, 0.032, matMetal, 0, 0.009, 0.016))                   // labio da frente
  return g
}

/**
 * ESTRELA SOLIDA (emblema em relevo, nao neon) — o que faltou no painel de
 * cima do slot-neon. "LUCKY STAR" e so um nome escrito ate ter uma estrela
 * de verdade por perto; sem ela a placa de pagamento fica flutuando sozinha
 * num painel vermelho vazio, que foi exatamente o defeito apontado. Mesma
 * tecnica de Shape+ExtrudeGeometry que catalogo.js usa pro naipe de espadas
 * do baralho (shapeEspadas/espadas) — reimplementada aqui porque catalogo.js
 * nao exporta a dela e nao pode ser editado.
 */
function shapeEstrelaSolida(pontas, k) {
  const s = new THREE.Shape()
  for (let i = 0; i < pontas * 2; i++) {
    const r = i % 2 ? k : 1
    const a = (i * Math.PI) / pontas - Math.PI / 2
    const x = Math.cos(a) * r, y = Math.sin(a) * r
    if (i === 0) s.moveTo(x, y)
    else s.lineTo(x, y)
  }
  s.closePath()
  return s
}

/** Estrela extrudada com bisel, `raio` metros de ponta a ponta do centro. */
function estrelaGrande(raio, prof, mat, pontas, k) {
  const geo = new THREE.ExtrudeGeometry(shapeEstrelaSolida(pontas || 5, k || 0.44), {
    depth: prof, bevelEnabled: true, bevelThickness: prof * 0.3, bevelSize: prof * 0.22,
    bevelSegments: 2, curveSegments: 6,
  })
  geo.scale(raio, raio, 1)
  geo.center()
  const m = new THREE.Mesh(geo, mat)
  m.castShadow = false
  m.receiveShadow = false
  return m
}

/**
 * MAQUINA 1 — GABINETE DE MADEIRA. O caca-niquel classico "de salao": corpo
 * inteiro em nogueira envernizada (roughness baixo = verniz, nao o marrom
 * fosco da mesa de sinuca), cantos em latao, moldura da janela em latao,
 * alavanca cromada com bola vermelha do lado direito, bandeja de moedas
 * embaixo e topo em cupula com o letreiro "JACKPOT" (termo generico de
 * caca-niquel, nao marca de ninguem).
 *
 * W=0.58 (largura, X), D=0.52 (profundidade, Z). Altura final ~1.62 m — um
 * movel de presenca, a altura de "item mais caro/raro" que o pedido pediu.
 */
function fazSlotMadeira() {
  const g = new THREE.Group()
  const W = 0.58, D = 0.52
  const jy0 = 0.66, jy1 = 0.94, jcy = (jy0 + jy1) / 2   // janela dos roletes

  // --- base: plinto escuro + pe que "puxa pra fora" -------------------------
  // A FRENTE INCLINADA que o pedido pede: maquina de salao de verdade e reta
  // da cintura pra cima, mas quase sempre tem um kick-plate na base que sai
  // um pouco. Aqui ele carrega sozinho a leitura de "inclinada" sem mexer
  // no resto (janela, bandeja), que fica mais simples ficando no eixo reto.
  g.add(box(W, 0.06, D, MM.madeiraEscura, 0, 0.03, 0))
  const kick = box(W - 0.06, 0.12, 0.05, MM.madeiraEscura, 0, 0.09, D / 2 + 0.005)
  kick.rotation.x = -0.30
  g.add(kick)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.05, 0.05, 0.05, MM.madeiraEscura, sx * (W / 2 - 0.05), 0.025, sz * (D / 2 - 0.05)))
    }
  }

  // --- corpo baixo (porta) ate a janela --------------------------------------
  g.add(box(W, jy0 - 0.06, D, MM.madeira, 0, (0.06 + jy0) / 2, 0))

  // --- console: fenda de moeda, dois botoes grandes, bandeja com boca -------
  // CORRECAO: a v1 so tinha uma bandeja (bloco macico, sem cavidade) e nada
  // mais — o painel inteiro entre a janela e o kick-plate ficava liso, e era
  // exatamente o vazio que o olho sente falta numa maquina de verdade. Os
  // tres elementos abaixo (fenda com chapa, os dois botoes que o jogador
  // aperta, a bandeja que recebe o premio) sao geometria, nao textura fingindo
  // relevo.
  const fenda = fendaDeMoeda(0.12, 0.16, MM.latao)
  fenda.position.set(0, 0.58, D / 2 + 0.006)
  g.add(fenda)
  // y=0.39, nao 0.44: a placa de texto do botao (botaoGrande) sobe 0.091 do
  // centro do botao, e a fenda de moeda comeca em 0.50 (0.58 - metade de
  // 0.16) — em 0.44 a placa entrava 0.03 m dentro da chapa da fenda. Em 0.39
  // sobra folga real entre as duas.
  const btAposta = botaoGrande('APOSTA', 0xc4222a)
  btAposta.position.set(-0.09, 0.39, D / 2)
  g.add(btAposta)
  const btGirar = botaoGrande('GIRAR', 0x2c8a4a)
  btGirar.position.set(0.09, 0.39, D / 2)
  g.add(btGirar)
  const bandeja = bandejaComBoca(0.38, 0.13, 0.09, MM.cromo)
  bandeja.position.set(0, 0.20, D / 2)
  g.add(bandeja)

  // --- cantos de metal: pedido explicito do dono -----------------------------
  // Quatro sarrafos de latao nos quatro cantos verticais do corpo principal
  // (do plinto ate a base da cupula) — mesmo material da moldura da janela,
  // entao o forno funde tudo isso num mesh so.
  //
  // Centro EXATO no canto (x=±W/2, z=±D/2), nao "0.02 pra dentro": um box e
  // centrado no ponto dado, entao centrar 0.02 pra dentro da quina deixava a
  // peca INTEIRA enterrada na madeira (metade de fora do canto seria preciso
  // pra ela aparecer) — o sarrafo sumia por tras da propria parede. Centrado
  // na quina, metade fica cravada na madeira (prende visualmente) e a outra
  // metade sobra pra fora, que e o "canto de metal" aplicado de verdade.
  //
  // CORRECAO: a v1 usava 0.04 de espessura — junto com a moldura da janela
  // (tambem latao, tambem larga) isso somava mais latao do que madeira
  // visivel, e a maquina lia como "de metal" em vez de "de madeira com
  // cantos de metal". Mais fino agora: acento, nao estrutura.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(box(0.026, 1.27 - 0.06, 0.026, MM.latao,
        sx * (W / 2), (0.06 + 1.27) / 2, sz * (D / 2)))
    }
  }

  // --- moldura + vidro da janela dos roletes ---------------------------------
  for (const s of [-1, 1]) {
    g.add(box(0.06, jy1 - jy0, D, MM.madeira, s * (W / 2 - 0.03), jcy, 0))
  }
  // CORRECAO: a barra ia de quina a quina (W-0.02 = quase o gabinete inteiro).
  // Uma moldura de verdade acompanha o VAO da janela (0.46) mais um labio
  // pequeno, nao a largura toda do movel — e isso, junto com os cantos mais
  // finos acima, e o que devolve a madeira pro primeiro plano.
  g.add(box(0.50, 0.028, 0.045, MM.latao, 0, jy1 + 0.014, D / 2 + 0.005))
  g.add(box(0.50, 0.028, 0.045, MM.latao, 0, jy0 - 0.014, D / 2 + 0.005))
  // fundo escuro atras dos rolos: sem ele da pra ver o miolo vazio do gabinete
  g.add(box(W - 0.10, jy1 - jy0, 0.20, MM.preto, 0, jcy, -D / 2 + 0.10))
  const vidro = box(0.46, jy1 - jy0, 0.015, glass(0xdcecf5, 0.16), 0, jcy, D / 2 - 0.010)
  vidro.castShadow = false
  vidro.receiveShadow = false
  g.add(vidro)
  for (const sx of [-1, 1]) {
    g.add(box(0.015, jy1 - jy0 - 0.02, 0.03, MM.latao, sx * 0.0775, jcy, D / 2 - 0.020))
  }
  // z=0.10: sobra 0.025 m de vidro pra frente do rolo (raio 0.125) e 0.035 m
  // de folga pro fundo escuro atras — os dois sem se tocar.
  g.add(tresRolos(jcy, 0.10, ['sino', 'ferradura', 'limao']))

  // --- painel acima da janela + placa de pagamento ---------------------------
  g.add(box(W, 1.00 - jy1, D, MM.madeira, 0, (jy1 + 1.00) / 2, 0))
  g.add(box(W, 1.27 - 1.00, D, MM.madeira, 0, (1.00 + 1.27) / 2, 0))
  const placa = placaPagamento('sete', W - 0.10, 0.20, {
    color: '#fff2df', font: 'bold 68px "Trebuchet MS", sans-serif',
    glow: '#ffb35c', emissiveIntensity: 0.30,
  })
  placa.position.set(0, 1.13, D / 2 + 0.005)
  g.add(placa)
  // CORRECAO: a v1 tinha duas barras de latao emolduraedo a placa (redundante
  // com a moldura da janela logo abaixo e mais um pedaco de "maquina de
  // metal"). A placa ja se emoldura sozinha com o proprio brilho — tirei.

  // --- cupula do topo, com o letreiro JACKPOT --------------------------------
  // CORRECAO: a cupula era latao macico — a maior superficie curva da
  // maquina, toda de metal, era o principal motivo de ler "latao" de longe.
  // Agora e MADEIRA (mesmo material do corpo) com um filete de latao fino na
  // base, que e o tanto de metal que uma cupula precisa pra combinar com os
  // cantos sem virar ela mesma.
  g.add(box(W + 0.01, 0.022, D - 0.14, MM.latao, 0, 1.283, 0))
  const cupula = cyl(0.16, 0.16, W, MM.madeira, 18)
  cupula.rotation.z = Math.PI / 2
  cupula.position.set(0, 1.46, -0.02)
  g.add(cupula)
  // O material do texto e CLONADO de proposito: a versao cacheada de
  // textPlaneMat e compartilhada com QUALQUER outra peca do jogo que peca o
  // mesmo texto, e o piscar deste letreiro nao pode vazar pra elas (nem pras
  // outras unidades desta mesma maquina compradas de novo — cada build() aqui
  // clona a sua propria copia).
  const matLetreiro = textPlaneMat('JACKPOT', {
    w: 640, h: 200, color: '#fff2c8', font: 'bold 130px "Trebuchet MS", sans-serif',
    glow: '#ffcf6b', emissiveIntensity: 0.9,
  }).clone()
  const letreiro = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.10, 0.16), matLetreiro)
  letreiro.position.set(0, 1.46, D / 2 - 0.02)
  letreiro.rotation.x = -0.30
  letreiro.castShadow = false
  letreiro.receiveShadow = false
  g.add(letreiro)

  // --- alavanca cromada, bola vermelha, lado direito -------------------------
  g.add(alavanca(W / 2 + 0.02, jcy + 0.08, D / 2 - 0.12, 0xc4222a))

  // ---------------------------------------------------------------------------
  // FORNO — sempre ANTES de marcar userData.update (ver o aviso grande no
  // topo do arquivo: bake.js sobe ate o proprio root pra decidir o que
  // preservar, entao marcar antes faria o forno preservar a arvore inteira).
  // ---------------------------------------------------------------------------
  bakeStatic(g)

  // VIDA: so o letreiro "JACKPOT" pisca, devagar. Fase aleatoria por
  // instancia pra duas maquinas lado a lado no salao nao piscarem em uniso.
  // Os rolos ficam PARADOS — ver o aviso grande no topo do arquivo.
  let fase = Math.random() * 10
  g.userData.update = (dt) => {
    fase += dt
    matLetreiro.emissiveIntensity = 0.85 + Math.sin(fase * 1.1) * 0.55
  }

  return g
}

/**
 * MAQUINA 2 — GABINETE ESMALTADO, ESTILO ANOS 70. Escolha do agente (o pedido
 * deixou livre, so proibiu repetir a silhueta da maquina de madeira): metal
 * pintado de esmalte vermelho brilhante (roughness bem mais baixo que a
 * madeira — outra LINGUAGEM de material, nao so outra cor), pe unico
 * arredondado e afunilado em vez do plinto quadrado com pes-de-canto da
 * madeira, corpo mais estreito e reto, deck de botao RENTE ao gabinete (a
 * madeira tem um deck inclinado e saliente), e um topo em CUNHA inclinada com
 * moldura de neon ciano em vez da cupula arredondada em latao. Quatro
 * diferencas de silhueta ao mesmo tempo (base, corpo, deck, topo) garantem
 * que as duas nao leem como "a mesma maquina repintada" nem de longe.
 *
 * W=0.52 (largura, X), D=0.46 (profundidade, Z). Altura final ~1.55 m.
 */
function fazSlotNeon() {
  const g = new THREE.Group()
  const W = 0.52, D = 0.46
  const jy0 = 0.34, jy1 = 0.62, jcy = (jy0 + jy1) / 2   // janela dos roletes

  // --- rodape: PLINTO RETANGULAR recuado ------------------------------------
  // Duas tentativas passaram por aqui, as duas redondas, e as duas leram como
  // "meia-lua vermelha" na foto. A segunda ate encostava certo no piso — o
  // erro nunca foi altura, foi PLANTA. O corpo e um caixote de 52 x 46 cm; um
  // disco de 43 cm debaixo dele aparece como um pedaco de circulo sobrando
  // abaixo da linha reta do gabinete (de frente, meia-lua; de lado, a elipse
  // inteira), e caixote sobre disco le como peca de xadrez, nao como maquina.
  // Planta retangular seguindo a do corpo, recuada 2,5 cm de cada lado pra
  // fazer a sombra de rodape, e um filete de cromo no topo do plinto pra
  // separar rodape de corpo. A silhueta continua diferente da maquina de
  // madeira, que tem plinto quadrado NIVELADO com quatro pes de canto — este
  // e um bloco unico recuado, sem pe nenhum.
  g.add(box(W - 0.05, 0.10, D - 0.05, MM.esmalte, 0, 0.05, 0))
  g.add(box(W - 0.03, 0.018, D - 0.03, MM.cromo, 0, 0.108, 0))

  // --- corpo baixo, reto e mais estreito que a madeira -----------------------
  g.add(box(W, jy0 - 0.12, D, MM.esmalte, 0, (0.12 + jy0) / 2, 0))
  // CORRECAO: so a fenda sozinha nao chegava nem perto de "console" — faltava
  // a bandeja de premio inteira (o painel abaixo dos rolos lia como liso na
  // foto). Fenda com chapa (nao so o risco) + bandeja com boca de verdade,
  // as duas encaixadas nos 0.22 m que sobram entre o pe e a janela.
  const fendaN = fendaDeMoeda(0.09, 0.11, MM.cromo)
  fendaN.position.set(0, 0.285, D / 2 + 0.006)
  g.add(fendaN)
  const bandejaN = bandejaComBoca(0.34, 0.10, 0.065, MM.cromo)
  bandejaN.position.set(0, 0.16, D / 2)
  g.add(bandejaN)

  // --- moldura + vidro da janela dos roletes ---------------------------------
  for (const s of [-1, 1]) {
    g.add(box(0.03, jy1 - jy0, D, MM.esmalte, s * 0.245, jcy, 0))
  }
  // CORRECAO: engrossei um pouco (era 0.03/0.04) pra moldura ler como relevo
  // aplicado e nao como uma linha pintada na chapa.
  g.add(box(0.48, 0.036, 0.05, MM.cromo, 0, jy1 + 0.018, D / 2 + 0.006))
  g.add(box(0.48, 0.036, 0.05, MM.cromo, 0, jy0 - 0.018, D / 2 + 0.006))
  g.add(box(0.42, jy1 - jy0, 0.16, MM.preto, 0, jcy, -D / 2 + 0.08))
  const vidro = box(0.46, jy1 - jy0, 0.015, glass(0xdcecf5, 0.16), 0, jcy, D / 2 - 0.010)
  vidro.castShadow = false
  vidro.receiveShadow = false
  g.add(vidro)
  for (const sx of [-1, 1]) {
    g.add(box(0.015, jy1 - jy0 - 0.02, 0.03, MM.cromo, sx * 0.0775, jcy, D / 2 - 0.020))
  }
  // z=0.07: frente do rolo em 0.195 (folga de 0.025 pro vidro em 0.22), costas
  // em -0.055 (quase rente ao fundo escuro, que comeca em -0.05 — se tocam por
  // 5 mm, e o fundo fica atras mesmo, entao nao da pra ver a costura).
  g.add(tresRolos(jcy, 0.07, ['estrela', 'sete', 'diamante']))

  // --- corpo alto: dois botoes grandes, placa de pagamento -------------------
  // CORRECAO: a "tarja cromada" (uma chapinha girada 0.35 rad, encostada em
  // nada) saiu — na foto real ela flutuava sobre o esmalte vermelho sem tocar
  // moldura nenhuma, lendo como peca fora do lugar em vez de enfeite anos 70.
  // Os tres botoezinhos decorativos tambem sairam, no lugar dos dois GRANDES
  // com rotulo que o pedido de correcao trouxe (mesma peca da madeira).
  g.add(box(W, 1.24 - jy1, D, MM.esmalte, 0, (jy1 + 1.24) / 2, 0))
  // ALTURAS RECALCULADAS DE PROPOSITO (nao e so "encostar" cada peca): a
  // placa de texto do botaoGrande sobe 0.091 do centro do botao (mesma conta
  // da correcao anterior, na madeira) — com o botao em 0.80 a placa dele
  // entrava quase 9 cm dentro da placa de pagamento. Empilhado de baixo pra
  // cima com folga de verdade entre cada peca: botao (0.69) -> placa de
  // pagamento (0.90) -> estrela (1.11), todos com uns 2-3 cm de sobra pros
  // vizinhos e pro topo/janela.
  const btApostaN = botaoGrande('APOSTA', 0xf0a030)
  btApostaN.position.set(-0.085, 0.69, D / 2)
  g.add(btApostaN)
  const btGirarN = botaoGrande('GIRAR', 0x27e6ff)
  btGirarN.position.set(0.085, 0.69, D / 2)
  g.add(btGirarN)
  const placa = placaPagamento('diamante', 0.42, 0.19, {
    color: '#eafcff', font: 'bold 66px "Trebuchet MS", sans-serif',
    glow: '#27e6ff', emissiveIntensity: 0.30,
  })
  placa.position.set(0, 0.90, D / 2 + 0.007)
  g.add(placa)

  // CORRECAO: "a metade de cima do painel continua vazia" — entre a placa e
  // a marquise sobravam ~35 cm de esmalte liso. GEOMETRIA, nao textura: uma
  // estrela solida grande (o proprio nome da maquina e LUCKY STAR) em relevo
  // cromado com um brilho ciano fixo — combina com o neon do topo sem ligar
  // uma segunda luz piscando (so o tubo de neon pisca, por parcimonia).
  const matEstrela = solid(0xd8eef7, 0.22, 0.55, { emissive: 0x27e6ff, emissiveIntensity: 0.32 })
  const estrela = estrelaGrande(0.085, 0.020, matEstrela)
  estrela.position.set(0, 1.11, D / 2 + 0.010)
  g.add(estrela)

  // --- friso duplo nos flancos ----------------------------------------------
  // A foto de lado mostrou o flanco como uma chapa vermelha lisa de 1,2 m sem
  // nada — e esse e o angulo de onde o jogador mais ve a maquina, que fica
  // encostada na parede. Dois filetes de cromo na altura da placa de
  // pagamento continuam a linha da frente pelas laterais e quebram a chapa
  // sem custar arte nenhuma: 12 mm de saliencia, o bastante pra pegar uma
  // aresta de luz e projetar uma sombra fina embaixo.
  for (const sx of [-1, 1]) {
    for (const fy of [0.90, 0.835]) {
      g.add(box(0.012, 0.022, D - 0.05, MM.cromo, sx * (W / 2 + 0.004), fy, 0))
    }
  }

  // --- tarja cromada de topo -------------------------------------------------
  g.add(box(W + 0.02, 0.03, D, MM.cromo, 0, 1.255, 0))

  // --- topo em cunha inclinada, com neon ciano em volta do letreiro ---------
  // Grupo com a MESMA inclinacao pra fundo, moldura de neon e texto: assim os
  // tres ficam no mesmo plano inclinado sem eu precisar fazer a trigonometria
  // pra cada peca separada.
  const cunha = new THREE.Group()
  cunha.position.set(0, 1.27, -0.01)
  cunha.rotation.x = 0.5
  cunha.add(box(W - 0.03, 0.28, 0.045, MM.pretoLuz, 0, 0.14, -0.010))
  const matNeon = solid(0x27e6ff, 0.25, 0.0, {
    emissive: 0x27e6ff, emissiveIntensity: 2.0,
  }).clone()
  const neon = neonBorda(W - 0.11, 0.21, matNeon, 0.009)
  neon.position.set(0, 0.14, 0.020)
  cunha.add(neon)
  const matTexto = textPlaneMat('LUCKY STAR', {
    w: 640, h: 220, color: '#eafcff', font: 'bold 100px "Trebuchet MS", sans-serif',
    glow: '#27e6ff', emissiveIntensity: 0.7,
  })
  const texto = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.16, 0.16), matTexto)
  texto.position.set(0, 0.14, 0.018)
  texto.castShadow = false
  texto.receiveShadow = false
  cunha.add(texto)
  g.add(cunha)

  // --- alavanca cromada, bola ciano (pra combinar com o neon), lado direito -
  g.add(alavanca(W / 2 + 0.02, jcy + 0.06, D / 2 - 0.10, 0x27e6ff))

  // ---------------------------------------------------------------------------
  // FORNO — ANTES de marcar userData.update (mesma explicacao do slot-madeira,
  // ver o aviso grande no topo do arquivo).
  // ---------------------------------------------------------------------------
  bakeStatic(g)

  // VIDA: so a moldura de neon pisca, devagar, fase aleatoria por instancia.
  // O texto "LUCKY STAR" fica com o brilho fixo de proposito — DUAS coisas
  // piscando na mesma placa (neon E texto) e o exagero que "parcimonia" pede
  // pra evitar. Os rolos ficam PARADOS — ver o aviso grande no topo do
  // arquivo.
  let fase = Math.random() * 10
  g.userData.update = (dt) => {
    fase += dt
    matNeon.emissiveIntensity = 1.7 + Math.sin(fase * 1.6) * 0.9
  }

  return g
}

export const CACA_NIQUEIS = [
  {
    id: 'slot-madeira', nome: 'Caca-Niquel Classico de Madeira', cat: 'caca-niquel',
    qualidade: 'fina', preco: 2400, empilha: 1, naCasa: true,
    // Gabinete 0.58 (X) x 0.52 (Z). Folga de 0.10 de cada lado no eixo X
    // (e onde a alavanca mora — alavanca() fica dentro dessa folga, ver o
    // comentario dela) => larg = 0.58 + 0.10*2 = 0.78. Na frente, 0.70 pro
    // jogador ficar em pe puxando a alavanca (o pedido pediu esse numero
    // explicito) => prof = 0.52 + 0.70 = 1.22. Sem folga atras: maquina de
    // salao encosta na parede.
    pegada: { larg: 0.78, prof: 1.22 },
    desc: 'Gabinete de nogueira envernizada, cantos de latao batido, alavanca cromada gasta de uso.',
    build: () => fazSlotMadeira(),
  },
  {
    id: 'slot-neon', nome: 'Caca-Niquel Esmaltado Neon', cat: 'caca-niquel',
    qualidade: 'boa', preco: 1550, empilha: 1, naCasa: true,
    // Gabinete 0.52 (X) x 0.46 (Z), mesma conta do outro: larg = 0.52+0.20 =
    // 0.72; prof = 0.46+0.70 = 1.16.
    pegada: { larg: 0.72, prof: 1.16 },
    desc: 'Esmalte vermelho de forno, moldura de neon ciano, saida dos anos 70 de um cassino que fechou.',
    build: () => fazSlotNeon(),
  },
]
