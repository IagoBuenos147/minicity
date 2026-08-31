import * as THREE from 'three'
import { LOJA_JOGOS, interiorOf } from './layout.js'
import { LEVELS } from '../config.js'
import { solid, stdMat, box, cyl, sphere, plane, textPlaneMat, woodTex, tileTex } from './materials.js'
import { createNPC } from '../npc/npc.js'
import { congelarPersonagem } from '../player/congelar.js'
import { bakeStatic } from './bake.js'
import {
  MOBILIA, poteDeFichas, mesaDeSinuca, jukebox, baralho, cartaEspadas, espadas, maletaDeFichas,
} from '../mobilia/catalogo.js'

// ---------------------------------------------------------------------------
// TACO DE OURO — a loja de jogos.
//
// A casca (parede, vitrine, toldo, letreiro, telhado) e do buildShell de
// city.js: este arquivo e so o MIOLO, como a mercearia e a barbearia. Foi por
// isso que o lote nasceu com a fachada em z1 — assim apronOf, naFrenteDaPorta,
// semLotes, groundY e a neve tratam ela como tratam as outras duas, sem
// aprender caso novo nenhum.
//
// A REGRA DA SALA: tudo que ela vende esta A VISTA, e cada peca em exposicao e
// um ponto de interacao que abre a loja JA NAQUELE ITEM. E o que faz a vitrine
// ser jogo e nao decoracao — o dono pediu "os itens tb devem estar a vista".
//
// LUZ: TRES PointLight, sem sombra, mais o emissivo das calhas e do neon.
//
// A versao anterior tentou acender o salao SO com emissivo, pra nao encostar no
// orcamento de luzes. O dono fotografou o resultado e a resposta foi curta: "ta
// bem escuro". Emissivo acende a PROPRIA superficie e nao devolve um lumen pro
// que esta na frente dela — ver forroELuz() e o comentario do orcamento em
// tools/smoke.mjs, que ja tinha aprendido isso na casa velha. A barbearia e a
// mercearia tem tres luzes cada, em comodos MENORES; este salao tem 19 x 17 m.
// ---------------------------------------------------------------------------

const B = LOJA_JOGOS
const IN = interiorOf(B)                 // x 32.3..51.7 / z -29.7..-12.3
const BASE = LEVELS.SHOP_FLOOR           // 0.16
// O FORRO NAO PODE FICAR EM wallHeight. Os 6 cm de desconto sao a correcao de
// um defeito que levou tres rodadas pra ser achado, e vale escrito por inteiro
// porque ele nao aparece parado.
//
// A conta antiga era `wallHeight - BASE` = 4.04, e o grupo do miolo sobe BASE:
// o forro caia em 4.20 no mundo. E o buildShell de city.js (linha do
// "coroamento") poe a LAJE DE COBERTURA em `box(w+0.7, 0.34, d+0.7, ..., H+0.17)`
// com H = wallHeight = 4.2 — ou seja, a face de BAIXO dela tambem em 4.20.
// Duas superficies horizontais no mesmo Y, uma da casca e outra do miolo, cada
// uma sem saber da outra.
//
// PARADO ELE NAO APARECE: com a camera imovel o z-buffer resolve o empate
// sempre do mesmo jeito, e o teto fica liso. Foi por isso que "esconder a laje
// e comparar" deu 0% de diferenca na primeira medicao e eu quase descartei a
// pista. ANDANDO o empate se desfaz de um jeito diferente a cada quadro, e o
// teto inteiro pisca — que e exatamente como o dono descreveu ("o teto que ta
// tremendo estranho", e nao a luz).
//
// A medida que fechou o caso: com a camera andando 3 cm, 52,5% dos pixels do
// teto mudavam de cor, contra 7,7% do piso no mesmo passo. Escondendo a laje da
// casca, caia pra 6,3%; escondendo o forro, pra 7,3%. As duas juntas, e so
// elas, eram o defeito.
//
// 6 cm e folga com sobra pro z-buffer nesta distancia, e some visualmente: o
// forro continua encostando na parede, so que 6 cm mais baixo.
const CEIL = B.wallHeight - BASE - 0.06  // 3.98 local -> 4.14 no mundo

/** O balcao: encostado na parede do fundo, com a Wanda atras. */
const BALCAO = { x: 42.0, z: -27.4, w: 5.2, d: 0.72, h: 1.08 }
const WANDA = { x: 42.0, z: -28.3 }

const M = {
  get piso() {
    // xadrez de bar: o mesmo material da barbearia, so que virado 45 graus pela
    // repeticao. Chao liso num salao de sinuca le como sala de espera.
    return stdMat('loja-piso', { map: tileTex(9, '#37503f', '#1f2f27'), roughness: 0.62 })
  },
  get parede() {
    return stdMat('loja-parede', { map: woodTex(3, '#5a3a26'), color: 0xa4866a, roughness: 0.88 })
  },
  get forro() { return solid(0x38403c, 0.9) },
  get calha() { return stdMat('loja-calha', { color: 0xfff0d0, emissive: 0xffe8bc, emissiveIntensity: 1.05, roughness: 0.4 }) },
  get madeira() { return stdMat('loja-madeira', { map: woodTex(2, '#4a2c18'), color: 0x8a5c38, roughness: 0.6 }) },
  // ROUGHNESS 0.58 E METALNESS 0.42, e nao 0.35/0.75.
  //
  // O dono descreveu a luz "tremendo de uma maneira estranha ao andar". Nao era
  // a luz: era o BLOOM. O pos-processamento (core/engine.js) so estoura o que
  // passa de 0.85 de brilho, e latao polido com quatro luzes novas devolve um
  // realce ESPECULAR minusculo e intensissimo em cada friso. Esse ponto cruza o
  // limiar e sai dele a cada passo do jogador — o bloom acende e apaga, e o que
  // se ve e a sala piscando. Metal mais fosco espalha o mesmo realce por mais
  // pixels com menos intensidade: ele para de cruzar o limiar e o brilho fica
  // parado.
  get latao() { return solid(0xbf9a45, 0.58, 0.42) },
  get feltroParede() { return solid(0x134a35, 0.98) },
  
  get neonRosa() { return stdMat('loja-neon-rosa', { color: 0xff7fd8, emissive: 0xd93bb0, emissiveIntensity: 1.25, roughness: 0.45 }) },
  get neonAmbar() { return stdMat('loja-neon-ambar', { color: 0xffd98a, emissive: 0xe2a83c, emissiveIntensity: 1.15, roughness: 0.45 }) },
}

/**
 * O LEQUE do refletor de chao: forte embaixo (na lente) e sumindo pra cima e
 * pros lados.
 *
 * Sem mapa, o plano do leque e um retangulo de brilho UNIFORME com a borda
 * viva — foi como ele nasceu e leu como um adesivo amarelo colado na fachada.
 * O fundo do canvas fica TRANSPARENTE de proposito: um fillRect preto poria
 * alpha 1 em toda a area e a borda do plano voltaria a aparecer (o mesmo erro
 * que a poca de luz dos postes cometeu em props.js).
 */
let _lequeTex = null
function lequeTex() {
  if (_lequeTex) return _lequeTex
  const c = document.createElement('canvas')
  c.width = 64; c.height = 128
  const g2 = c.getContext('2d')
  const gr = g2.createRadialGradient(32, 128, 2, 32, 128, 122)
  gr.addColorStop(0.00, 'rgba(255,255,255,0.95)')
  gr.addColorStop(0.22, 'rgba(255,255,255,0.46)')
  gr.addColorStop(0.55, 'rgba(255,255,255,0.16)')
  gr.addColorStop(0.85, 'rgba(255,255,255,0.03)')
  gr.addColorStop(1.00, 'rgba(255,255,255,0)')
  g2.fillStyle = gr
  g2.fillRect(0, 0, 64, 128)
  // fecha as laterais: o facho de um refletor de chao abre em leque, entao a
  // borda esquerda e a direita tem que morrer mesmo perto da lente
  const lat = g2.createLinearGradient(0, 0, 64, 0)
  lat.addColorStop(0.00, 'rgba(0,0,0,1)')
  lat.addColorStop(0.30, 'rgba(0,0,0,0)')
  lat.addColorStop(0.70, 'rgba(0,0,0,0)')
  lat.addColorStop(1.00, 'rgba(0,0,0,1)')
  g2.globalCompositeOperation = 'destination-out'
  g2.fillStyle = lat
  g2.fillRect(0, 0, 64, 128)
  g2.globalCompositeOperation = 'source-over'
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  _lequeTex = t
  return t
}

function piso(g) {
  const p = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.piso)
  p.position.set((IN.x0 + IN.x1) / 2, 0.005, (IN.z0 + IN.z1) / 2)
  p.receiveShadow = true
  g.add(p)
  // rodape de madeira nas quatro paredes
  const R = 0.16
  for (const s of [-1, 1]) {
    g.add(box(IN.x1 - IN.x0, R, 0.05, M.madeira, (IN.x0 + IN.x1) / 2, R / 2, s > 0 ? IN.z1 - 0.03 : IN.z0 + 0.03))
    g.add(box(0.05, R, IN.z1 - IN.z0, M.madeira, s > 0 ? IN.x1 - 0.03 : IN.x0 + 0.03, R / 2, (IN.z0 + IN.z1) / 2))
  }
}

/**
 * FORRO E LUZ DO SALAO — refeito por inteiro, e nao ajustado.
 *
 * O dono reclamou tres vezes da luz deste teto ("ta tremendo", "ta tremendo de
 * uma maneira estranha ao andar", "ta tremendo ainda") e pediu: "refaca ela de
 * outra maneira e melhor". Ele tem razao — o desenho antigo tinha DUAS fontes
 * de tremor ao mesmo tempo, e consertar uma deixava a outra:
 *
 *   1. GEOMETRIA COLADA NO FORRO. As calhas compridas eram uma moldura de
 *      madeira encostada no plano do forro. A um centimetro de distancia e a
 *      4 m da camera, o z-buffer nao separa duas superficies: os pixels da
 *      moldura e do forro trocavam de dono a cada passo do jogador.
 *
 *   2. GEOMETRIA SE ATRAVESSANDO. As luminarias das mesas tinham a cupula
 *      (cone aberto de raio 0.09 na base) e o disco aceso (raio 0.16) na MESMA
 *      altura — o disco furava a parede da cupula, e o anel onde eles se
 *      cruzavam piscava pelo mesmo motivo.
 *
 * A REGRA DO DESENHO NOVO, e ela e uma so: NADA ENCOSTA EM NADA. O forro fica
 * liso, sem uma peca colada nele. Toda a luz vem de SEIS PENDENTES que descem
 * 1,7 m do teto, e dentro de cada pendente o disco aceso tem 3 cm de folga pra
 * parede da cupula em todos os lados. Se voltar a tremer, nao vai ser por
 * superficie disputando pixel — nao ha mais nenhuma.
 *
 * O emissivo tambem desceu (1.35 no disco, contra os 2.2 da calha antiga). O
 * bloom de core/engine.js estoura o que passa de 0.85, e uma peca que fica
 * DANCANDO em volta desse limiar acende e apaga sozinha conforme o jogador
 * anda — que e a terceira maneira de a mesma queixa aparecer. 1.35 fica acima
 * do limiar com folga: ele estoura sempre, e estourar sempre nao pisca.
 *
 * De quebra, pendente e o que um salao de sinuca tem. Calha de escritorio no
 * teto de um salao de bilhar sempre foi a coisa errada no lugar certo.
 */
function forroELuz(g, raiz) {
  const cx = (IN.x0 + IN.x1) / 2
  const t = plane(IN.x1 - IN.x0, IN.z1 - IN.z0, M.forro, Math.PI / 2)
  t.position.set(cx, CEIL, (IN.z0 + IN.z1) / 2)
  g.add(t)

  // Vigas de madeira atravessando o salao. Elas descem 22 cm do forro (nao
  // encostam: a face de cima fica em CEIL - 0.06) e servem pra duas coisas —
  // quebrar os 19 m de forro liso e dar de onde os pendentes descerem.
  for (const z of [-16.0, -20.4, -24.8]) {
    g.add(box(IN.x1 - IN.x0 - 0.6, 0.22, 0.30, M.madeira, cx, CEIL - 0.17, z))
  }

  // --- OS SEIS PENDENTES ---------------------------------------------------
  // Dois sobre cada mesa de sinuca (e por isso eles ficam em x 37.4 e 46.6, o
  // eixo das mesas) e dois no corredor central, um na frente e um no fundo.
  // O DISCO ACESO CAIU DE 1.35 PRA 0.80, e isso e o "efeito" que o dono pediu
  // pra tirar.
  //
  // O bloom de core/engine.js estoura o que passa de 0.85 de brilho. Com 1.35 o
  // disco vivia ACIMA desse limiar, mas ele fica dentro de uma cupula opaca:
  // conforme o jogador anda, a boca da cupula descobre e cobre pedaco do disco,
  // e a area que estoura muda de tamanho a cada quadro. O halo do bloom cresce
  // e encolhe junto — e e isso, e nao a geometria, que se ve como a luminaria
  // "tremendo".
  //
  // 0.80 passa a ficar logo ABAIXO do limiar: o disco continua sendo a peca
  // mais clara da sala (e o que acende a cupula por dentro), mas para de
  // alimentar o bloom, entao nao ha mais halo pra pulsar. E o mesmo remedio que
  // este arquivo ja aplicou duas vezes — na calha (2.2 -> 1.05) e no latao
  // (0.35/0.75 -> 0.58/0.42) — e a razao esta escrita no comentario de M.latao.
  //
  // Quem ilumina o salao continua sendo as quatro PointLight; o disco nunca
  // iluminou nada, emissivo nao ilumina.
  const disco = stdMat('loja-pendente-luz', {
    color: 0xfff3d6, emissive: 0xffd9a0, emissiveIntensity: 0.80, roughness: 0.4,
  })
  const esmalte = solid(0x1d5c42, 0.55, 0.15)   // cupula esmaltada verde-feltro

  const PENDENTES = [
    [37.4, -19.5], [37.4, -21.3],
    [46.6, -19.5], [46.6, -21.3],
    [42.0, -15.4], [42.0, -25.2],
  ]
  const BOCA = 2.24            // altura da boca da cupula (o ponto mais baixo)
  const ALT = 0.30             // altura da cupula
  const R_BOCA = 0.36, R_TOPO = 0.11
  for (const [px, pz] of PENDENTES) {
    // canopla no forro + haste. A canopla tem 4 cm de altura e o topo dela para
    // 3 cm ABAIXO do forro: e a folga que impede o par de brigar por pixel.
    const can = cyl(0.09, 0.11, 0.05, M.madeira, 10)
    can.position.set(px, CEIL - 0.055, pz)
    g.add(can)
    // A haste sobe ate 4.02, ou seja, ENTRA 6 cm dentro da canopla (3.96..4.01)
    // em vez de terminar rente a ela. Duas pecas que se encostam com a face
    // exatamente no mesmo Y sao mais um par disputando pixel — pequeno, mas e
    // exatamente o defeito que este arquivo esta tentando eliminar.
    // HASTE DE 3 CM DE RAIO, e nao 1,6.
    //
    // O dono voltou dizendo que as luminarias "parecem tremer" quando ele anda.
    // Medi a geometria delas e ela esta sa: com a camera dando um passo de 25 cm
    // a regiao dos pendentes muda 0,7% dos pixels, contra 43% do piso no mesmo
    // passo — nao ha superficie disputando profundidade aqui.
    //
    // O que sobra e ALIASING, o mesmo defeito dos balaustres do hotel: uma haste
    // de 3,2 cm de diametro vista do outro lado do salao (12 a 17 m) ocupa
    // MENOS DE UM PIXEL. O que nao cabe num pixel liga e desliga a cada quadro
    // em que a camera anda, e o olho le isso como a luminaria inteira tremendo,
    // porque a haste e o que liga ela ao teto.
    //
    // 6 cm de diametro a 15 m ja cai dentro de um pixel e para de piscar. Numa
    // luminaria de salao, uma haste dessa grossura le como tubo de verdade — a
    // anterior lia como fio.
    const hasteH = CEIL - 0.02 - (BOCA + ALT)
    const haste = cyl(0.03, 0.03, hasteH, M.latao, 8)
    haste.position.set(px, BOCA + ALT + hasteH / 2, pz)
    g.add(haste)

    // cupula: cone ABERTO com a boca larga pra baixo, do jeito que uma
    // luminaria de bilhar e. `true` no fim de cyl() e o openEnded.
    const cup = cyl(R_TOPO, R_BOCA, ALT, esmalte, 16, true)
    cup.position.set(px, BOCA + ALT / 2, pz)
    g.add(cup)
    // Aro de latao na boca: e ele que fecha a silhueta por baixo. Fica 2 cm
    // ABAIXO da boca, e nao na altura dela: um torus centrado em R_BOCA na
    // altura R_BOCA atravessa a parede da cupula, e a linha onde os dois se
    // cruzam pisca. Assim ele so encosta, por baixo.
    // Tubo de 3,2 cm e nao 1,8, pelo mesmo motivo da haste: o aro contorna a
    // boca inteira da cupula, entao ele e a peca fina com MAIS metro linear
    // dentro do salao — e a que mais tinha pixel pra piscar.
    const aro = new THREE.Mesh(new THREE.TorusGeometry(R_BOCA, 0.032, 6, 18), M.latao)
    aro.rotation.x = Math.PI / 2
    aro.position.set(px, BOCA - 0.02, pz)
    g.add(aro)
    // tampa em cima, pra a cupula nao ser um tubo visto de longe
    const tampa = cyl(R_TOPO, R_TOPO, 0.03, esmalte, 12)
    tampa.position.set(px, BOCA + ALT, pz)
    g.add(tampa)

    // O DISCO ACESO, e aqui esta a folga que faltava no desenho antigo.
    // Na altura y a cupula tem raio R_BOCA - (y - BOCA)/ALT * (R_BOCA - R_TOPO).
    // Em y = BOCA + 0.07 isso da 0.302; o disco tem 0.27, entao sobram 3,2 cm
    // de folga radial. Antes o disco era MAIOR que a cupula na altura dele e
    // atravessava a parede.
    const luz = cyl(0.27, 0.27, 0.025, disco, 18)
    luz.position.set(px, BOCA + 0.07, pz)
    luz.castShadow = false
    g.add(luz)
  }

  // --- AS QUATRO LUZES DE VERDADE -------------------------------------------
  //
  // EMISSIVO NAO ILUMINA — ele acende a propria superficie e nao devolve um
  // lumen pro que esta na frente dela. Isso ja custou uma reprovacao aqui (o
  // salao nasceu com zero PointLight e o dono fotografou: "ta bem escuro") e
  // esta escrito tambem no orcamento de tools/smoke.mjs.
  //
  // Sao QUATRO e nao tres (o que a barbearia e a mercearia levam) porque o
  // salao tem 17 m de profundidade: com tres, a metade da frente — entrada,
  // ilha de baralhos, vitrine — continuava escura.
  //
  // Cada uma fica logo ABAIXO de um pendente, e nao mais deslocada meio metro
  // pra fora. Com o pendente novo a cupula e opaca e larga, entao a luz posta
  // acima da boca ficaria presa dentro dela; posta 30 cm abaixo, ela sai pela
  // boca como sairia de verdade.
  const LUZES = [
    // As intensidades subiram ~25% em relacao a versao das calhas, e nao por
    // gosto: cupula esmaltada e OPACA e joga tudo pra baixo, enquanto a calha
    // antiga era um retangulo aceso virado pro salao inteiro. Mesma potencia
    // com cupula da um salao mais escuro, e "ta bem escuro" ja foi reprovado
    // aqui uma vez.
    { x: BALCAO.x, y: 2.02, z: -15.4, i: 38 }, // entrada e a ilha de baralhos
    { x: 37.4, y: 2.02, z: -20.4, i: 42 },     // mesa da esquerda + parede oeste
    { x: 46.6, y: 2.02, z: -20.4, i: 42 },     // mesa da direita + parede leste
    { x: BALCAO.x, y: 2.02, z: -25.2, i: 34 }, // balcao e o fundo do salao
  ]
  //
  // AS QUATRO PointLight NAO MORAM NO MIOLO — ELAS VAO PRA `raiz`.
  //
  // Isto foi um BUG de travamento, medido e nao suposto, e aqui era o PIOR dos
  // tres casos do jogo: quatro luzes de uma vez, num raio de 32 m, que e a
  // calcada da avenida — ou seja, no caminho de quem simplesmente passa em
  // frente. O LOD deste modulo escondia o `group` inteiro, e as luzes estavam
  // dentro dele: cruzar a fronteira mudava a CONTAGEM DE LUZES VISIVEIS DA CENA.
  //
  // No three.js o programa de shader de cada material e montado a partir dessa
  // contagem. Quando ela muda, TODO material da cena vira programa novo e o
  // renderer recompila a cena inteira no meio do quadro — um engasgo de varios
  // quadros, sempre no mesmo ponto do mapa, nos dois sentidos. A sonda mediu a
  // contagem pulando de 20 pra 24 num passo so, aqui.
  //
  // E a MESMA armadilha que render/luzes-efeito.js foi escrito pra evitar. A
  // regra: LUZ DE INTERIOR FICA NA RAIZ DO MODULO, que nunca e escondida.
  //
  // O `+ BASE` no Y existe porque o miolo esta levantado no piso da loja e a
  // raiz nao: trocar de pai troca o referencial.
  for (const L of LUZES) {
    // ALCANCE 16 e nao 13: `distance` no three e onde a luz e cortada a zero, e
    // com 13 num salao de 19 m de largura o corte caia ANTES da parede. O
    // decaimento ja e quadratico — quem controla o brilho e a intensidade, o
    // alcance so decide onde a conta para de valer.
    const pl = new THREE.PointLight(0xffe9c8, L.i, 16, 2)
    pl.position.set(L.x, L.y + BASE, L.z)
    pl.castShadow = false
    raiz.add(pl)
  }
}

function paredes(g, occluders) {
  // feltro verde na parede do fundo, atras do balcao: e a cor da casa
  g.add(box(IN.x1 - IN.x0, 2.4, 0.04, M.feltroParede, (IN.x0 + IN.x1) / 2, 1.5, IN.z0 + 0.04))
  // letreiro de neon do fundo
  const letra = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.72), textPlaneMat('TACO DE OURO', {
    w: 640, h: 100, color: '#ffd98a', font: 'bold 68px "Trebuchet MS", sans-serif',
    // 0.95 e nao 1.6: com 1.6 as letras passavam do limiar do bloom e o halo
    // engolia o miolo delas — o dono viu isso no "DE" de TACO DE OURO, que e a
    // palavra mais curta e por isso a que satura primeiro.
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.95,
  }))
  letra.position.set(BALCAO.x, 2.34, IN.z0 + 0.07)
  letra.castShadow = false
  g.add(letra)
  // dois tubos de neon emoldurando
  for (const s of [-1, 1]) {
    g.add(box(0.05, 1.1, 0.05, s > 0 ? M.neonRosa : M.neonAmbar, BALCAO.x + s * 2.6, 2.2, IN.z0 + 0.08))
  }
  void occluders
}

function balcao(g, colliders) {
  const b = BALCAO
  g.add(box(b.w, b.h, b.d, M.madeira, b.x, b.h / 2, b.z))
  g.add(box(b.w + 0.10, 0.05, b.d + 0.10, M.latao, b.x, b.h + 0.02, b.z))
  // frente com painel de feltro e filete de latao
  g.add(box(b.w - 0.24, 0.62, 0.03, M.feltroParede, b.x, 0.56, b.z + b.d / 2 + 0.016))
  g.add(box(b.w - 0.20, 0.03, 0.04, M.latao, b.x, 0.90, b.z + b.d / 2 + 0.02))
  colliders.push({
    minX: b.x - b.w / 2, maxX: b.x + b.w / 2,
    minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, tag: 'loja-balcao',
  })
  // prateleira atras, com caixas de baralho de mostruario
  g.add(box(b.w, 0.05, 0.30, M.madeira, b.x, 1.55, IN.z0 + 0.20))
  g.add(box(b.w, 0.05, 0.30, M.madeira, b.x, 1.92, IN.z0 + 0.20))
  // registradora
  g.add(box(0.34, 0.24, 0.30, solid(0x2a2f36, 0.6), b.x + 1.9, b.h + 0.14, b.z))
  g.add(box(0.30, 0.02, 0.20, M.latao, b.x + 1.9, b.h + 0.27, b.z - 0.03))
}

/**
 * O MOSTRUARIO. Cada peca em exposicao e um `interactable` que abre a loja ja
 * naquele item — e o que transforma "os itens estao a vista" em jogo.
 *
 * As mesas ficam num palco de 25 cm porque o peitoril da vitrine do buildShell
 * comeca em y = 0.85 e o tampo de uma mesa de bar fica em 0.80: sem o palco,
 * quem passa na calcada ve so a borda da mesa.
 */
function mostruario(g, colliders, interactables) {
  const pecas = []

  // --- as duas mesas de sinuca, no chao, viradas pra vitrine ----------------
  //
  // SEM PALCO. Cada mesa ficava em cima de uma laje escura de 25 cm com friso de
  // latao, e o dono pediu pra tirar: "possuem uma placa quadrada em baixo delas,
  // deixe apenas a sinuca normal". Ela existia pra mesa aparecer por cima do
  // peitoril da vitrine (0.85 contra os 0.80 do tampo) — quem passa na calcada
  // ve 5 cm a menos de mesa agora. E o preco, e vale: a laje lia como um pedestal
  // de museu embaixo de um movel que deveria estar no chao de um salao.
  //
  // O colisor era do PALCO. Sem ele a mesa vira um fantasma que se atravessa,
  // entao ele passa a ser da MESA — e medido nela: `comp` no eixo Z e `larg` no
  // X, porque as duas estao giradas 90 graus.
  const mesas = [
    { id: 'sinuca-bar', x: 37.4, z: -20.4, comp: 2.24, larg: 1.24, pano: '#2c7a52', gasto: true },
    { id: 'sinuca-recond', x: 46.6, z: -20.4, comp: 2.60, larg: 1.45, pano: '#1e5aa8', gasto: false },
  ]
  for (const m of mesas) {
    const o = mesaDeSinuca(m.comp, m.larg, m.pano, m.gasto)
    o.position.set(m.x, 0, m.z)
    o.rotation.y = Math.PI / 2
    g.add(o)
    colliders.push({
      minX: m.x - m.larg / 2, maxX: m.x + m.larg / 2,
      minZ: m.z - m.comp / 2, maxZ: m.z + m.comp / 2, tag: 'loja-mesa',
    })
    pecas.push({ id: m.id, x: m.x, y: 0.90, z: m.z })
  }

  // --- a jukebox, encostada na parede oeste --------------------------------
  const jb = jukebox()
  jb.position.set(IN.x0 + 0.85, 0, -25.2)
  jb.rotation.y = Math.PI / 2
  g.add(jb)
  colliders.push({ minX: IN.x0 + 0.4, maxX: IN.x0 + 1.3, minZ: -25.7, maxZ: -24.7, tag: 'loja-jukebox' })
  pecas.push({ id: 'jukebox', x: IN.x0 + 1.1, y: 1.0, z: -25.2 })

  // --- ilha de baralhos, no meio do salao ----------------------------------
  g.add(box(1.30, 0.92, 0.80, M.madeira, 42.0, 0.46, -16.4))
  g.add(box(1.40, 0.05, 0.90, M.latao, 42.0, 0.95, -16.4))
  colliders.push({ minX: 41.3, maxX: 42.7, minZ: -16.85, maxZ: -15.95, tag: 'loja-ilha' })
  // O terceiro campo (a marca em texto) SUMIU: a caixa nao tem mais uma letra,
  // so o naipe de espadas em relevo e a moldura. O que separa as tres agora e a
  // cor do papel e o lacre — ver baralho() em mobilia/catalogo.js.
  const marcas = [
    ['baralho-beira', 0x9c3b32, false, -0.42],
    ['baralho-naipe', 0x1f4f7a, false, 0.0],
    ['baralho-estrela', 0x8a6a1f, true, 0.42],
  ]
  for (const b of marcas) {
    for (let k = 0; k < 4; k++) {
      const c = baralho(b[1], b[2])
      c.position.set(42.0 + b[3], 0.975 + k * 0.020, -16.4 + (k % 2) * 0.01)
      c.rotation.x = -Math.PI / 2
      c.rotation.z = (k % 2 ? 0.05 : -0.04)
      g.add(c)
    }
    // UMA CARTA ABERTA na frente de cada pilha. E o "por dentro" do baralho: sem
    // ela a ilha e tres blocos de papelao e o cliente nunca ve o que esta
    // comprando. Levemente girada pra nao ler como decalque no tampo.
    const carta = cartaEspadas()
    carta.position.set(42.0 + b[3], 0.972, -16.0)
    carta.rotation.y = (b[3] < 0 ? 0.16 : b[3] > 0 ? -0.16 : 0.04)
    g.add(carta)
    pecas.push({ id: b[0], x: 42.0 + b[3], y: 1.10, z: -16.4 })
  }

  // --- as duas maletas, na parede leste ------------------------------------
  g.add(box(0.60, 0.90, 1.90, M.madeira, IN.x1 - 0.55, 0.45, -24.6))
  g.add(box(0.70, 0.05, 2.00, M.latao, IN.x1 - 0.55, 0.93, -24.6))
  colliders.push({ minX: IN.x1 - 0.9, maxX: IN.x1 - 0.2, minZ: -25.6, maxZ: -23.6, tag: 'loja-maletas' })
  const maletas = [
    { id: 'maleta-200', z: -25.2, obj: () => maletaDeFichas(96, 0x9aa1a8, false) },
    { id: 'maleta-300', z: -23.9, obj: () => maletaDeFichas(132, 0x5a3a2a, true) },
  ]
  for (const m of maletas) {
    const o = m.obj()
    o.position.set(IN.x1 - 0.55, 0.955, m.z)
    o.rotation.y = -Math.PI / 2
    g.add(o)
    pecas.push({ id: m.id, x: IN.x1 - 0.8, y: 1.15, z: m.z })
  }

  // --- o pote de fichas de sinuca, no balcao -------------------------------
  const pote = poteDeFichas()
  pote.position.set(BALCAO.x - 1.9, BALCAO.h + 0.05, BALCAO.z + 0.06)
  g.add(pote)
  pecas.push({ id: 'ficha-sinuca', x: BALCAO.x - 1.9, y: BALCAO.h + 0.2, z: BALCAO.z + 0.5 })

  const porId = new Map()
  for (const m of MOBILIA) porId.set(m.id, m)
  for (const p of pecas) {
    const m = porId.get(p.id)
    if (!m) continue
    interactables.push({
      id: 'loja-item-' + p.id,
      position: new THREE.Vector3(p.x, BASE + p.y, p.z),
      radius: 1.9,
      label: 'Ver: ' + m.nome + ' — ' + m.preco,
      onInteract: (gm) => {
        if (gm.loja && typeof gm.loja.abrir === 'function') gm.loja.abrir(p.id)
        else gm.toast(m.nome + ' — ' + m.preco + ' de ouro')
      },
    })
  }
  return jb
}

/**
 * A ENTRADA.
 *
 * O dono pediu "juice na entrada da loja, mais detalhes que indiquem ser uma
 * loja de artigos de jogos". O problema da versao anterior nao era falta de
 * peca — era que TODA peca estava no fundo do salao. Quem cruzava a porta via
 * 4 m de piso vazio antes de encontrar qualquer coisa, e uma loja se anuncia na
 * soleira.
 *
 * Cinco coisas, todas escolhidas por serem lidas de RELANCE e de longe, que e
 * como uma entrada e vista:
 *
 *   1. duas colunas com uma bola gigante em cima (a branca e a preta). Bola de
 *      sinuca ampliada 8x e o simbolo mais barato de "aqui e salao";
 *   2. o naipe de espadas grande na parede, sobre a porta — a marca da casa, a
 *      mesma que esta na caixa de baralho;
 *   3. um cavalete de tacos: seis, em pe, encostados na parede;
 *   4. o triangulo de armar, pendurado. E a silhueta que ninguem confunde;
 *   5. bandeirolas cruzando o vao, que e o que da movimento a um teto parado.
 */
function entrada(g, colliders) {
  const PORTA_X = 42.0
  const Z = IN.z1 - 0.55            // logo pra dentro da fachada

  // 1) o naipe de espadas sobre a porta, virado pra dentro do salao
  const emb = espadas(M.latao, 0.86, 0.05)
  emb.rotation.y = Math.PI            // a peca nasce olhando +Z; a parede e a de +Z
  emb.position.set(PORTA_X, 3.30, IN.z1 - 0.06)
  emb.castShadow = false
  g.add(emb)
  for (const s of [-1, 1]) {
    g.add(box(0.04, 0.90, 0.04, s > 0 ? M.neonAmbar : M.neonRosa, PORTA_X + s * 0.78, 3.30, IN.z1 - 0.07))
  }

  // 3) cavalete de tacos na parede oeste, do lado de dentro da porta
  const XT = IN.x0 + 0.42
  g.add(box(0.16, 0.06, 1.50, M.madeira, XT, 1.62, -14.6))
  g.add(box(0.16, 0.06, 1.50, M.madeira, XT, 0.12, -14.6))
  for (let i = 0; i < 6; i++) {
    const taco = cyl(0.009, 0.017, 1.46, M.madeira, 6)
    taco.position.set(XT + 0.02, 0.80, -15.25 + i * 0.26)
    taco.rotation.x = 0.05
    g.add(taco)
  }
  colliders.push({ minX: XT - 0.2, maxX: XT + 0.2, minZ: -15.4, maxZ: -13.8, tag: 'loja-cavalete' })

  // 4) o triangulo de armar, na parede leste
  const tri = new THREE.Group()
  const L = 0.62
  for (let i = 0; i < 3; i++) {
    const b = box(0.045, 0.045, L, M.madeira, 0, 0, 0)
    b.rotation.y = (i * 2 * Math.PI) / 3
    b.position.set(Math.sin(b.rotation.y + Math.PI / 2) * L * 0.29, 0, Math.cos(b.rotation.y + Math.PI / 2) * L * 0.29)
    tri.add(b)
  }
  tri.rotation.x = Math.PI / 2
  tri.position.set(IN.x1 - 0.30, 1.75, -14.8)
  g.add(tri)

  // 5) bandeirolas cruzando o vao da entrada
  const CORES = [0xd93bb0, 0xffd98a, 0x2fb37a, 0xe2564a]
  for (let i = 0; i < 14; i++) {
    const t = i / 13
    const x = PORTA_X - 4.6 + t * 9.2
    // catenaria rasa: o barbante cai 22 cm no meio do vao
    const y = 3.02 - Math.sin(t * Math.PI) * 0.22
    const b = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.20, 3),
      solid(CORES[i % CORES.length], 0.85),
    )
    b.rotation.set(Math.PI, i * 0.5, 0)
    b.position.set(x, y - 0.10, -13.2)
    b.castShadow = false
    g.add(b)
  }
}

/**
 * A FACHADA — o que a loja diz pra quem esta na calcada.
 *
 * As duas bolas gigantes nasceram DENTRO do salao, e o dono pediu pra trazer
 * pra fora: "queria passar pra frente da loja como um chamativo de loja de
 * jogos". Faz sentido — um chamativo que so funciona depois que a pessoa entrou
 * nao e chamativo, e decoracao.
 *
 * Aqui e o unico lugar do arquivo que desenha FORA das paredes. O grupo inteiro
 * esta em LEVELS.SHOP_FLOOR, que e a MESMA altura da calcada (o smoke confere
 * isso: "lote=0.16 calcada=0.16"), entao y = 0 aqui pousa na calcada sem degrau.
 *
 * O que NAO da pra fazer daqui: mexer na casca. Parede, vitrine, toldo e
 * letreiro sao do buildShell de city.js e valem pras cinco lojas. Tudo o que
 * segue e peca NOVA encostada nela.
 */
function fachada(g, colliders) {
  const PORTA_X = B.door.center          // 42
  const FZ = B.z1                        // -12, a face externa da fachada
  const VIT_TOPO = B.wallHeight - 1.05   // 3.15: onde comeca a faixa do letreiro

  // --- as duas bolas, uma de cada lado da porta ----------------------------
  // 2.35 m do meio da porta: a porta tem 2.8 de vao (40.6 a 43.4) e a vitrine
  // comeca em 40.05/43.95, entao esta e a unica faixa de calcada em frente a
  // ALVENARIA. Encostar mais e esbarrar em quem entra; afastar mais e por a
  // bola na frente do vidro e tapar a vitrine.
  const BOLA_R = 0.26
  for (const sgn of [-1, 1]) {
    const x = PORTA_X + sgn * 2.35
    const z = FZ + 0.80
    const preta = sgn > 0
    g.add(box(0.44, 0.88, 0.44, M.madeira, x, 0.44, z))
    g.add(box(0.52, 0.05, 0.52, M.latao, x, 0.905, z))
    const bola = sphere(BOLA_R, solid(preta ? 0x14151a : 0xf2ecd8, 0.16, 0.08), 20)
    bola.position.set(x, 0.93 + BOLA_R, z)
    bola.castShadow = true
    g.add(bola)
    if (preta) {
      // A FAIXA E O CIRCULO SAO DUAS PECAS. A faixa e um cilindro aberto
      // atravessado na bola (e ela que da a leitura de "bola listrada" de todos
      // os angulos); o circulo com o 8 e um disco chapado virado pra CALCADA,
      // porque numero so se le de frente. Sem a faixa por baixo, o disco boiaria.
      const faixa = cyl(BOLA_R * 1.005, BOLA_R * 1.005, 0.115, solid(0xf2ecd8, 0.22), 20, true)
      faixa.position.set(x, 0.93 + BOLA_R, z)
      faixa.rotation.z = Math.PI / 2
      faixa.castShadow = false
      g.add(faixa)
      const oito = new THREE.Mesh(
        new THREE.CircleGeometry(0.088, 20),
        textPlaneMat('8', {
          w: 128, h: 128, color: '#14151a', bg: '#f4f0e6',
          font: 'bold 104px "Trebuchet MS", sans-serif', emissiveIntensity: 0,
        }),
      )
      oito.position.set(x, 0.93 + BOLA_R, z + BOLA_R * 1.02)
      oito.castShadow = false
      g.add(oito)
    }
    colliders.push({ minX: x - 0.28, maxX: x + 0.28, minZ: z - 0.28, maxZ: z + 0.28, tag: 'loja-bola' })
  }

  // --- a placa pendurada, com o MESMO naipe da entrada ---------------------
  // Ela fica no pilar a direita da porta (x 44.5), que e a faixa de alvenaria
  // entre a moldura da porta e a vitrine. Pendurada e nao colada na parede: uma
  // placa de perfil e lida por quem vem ANDANDO pela calcada, que e o publico
  // dela; colada na fachada, so quem ja esta de frente ve.
  const PX = PORTA_X + 2.5
  const PY = 2.95
  g.add(box(0.06, 0.06, 0.72, M.latao, PX, PY + 0.30, FZ + 0.36))          // braco
  g.add(box(0.06, 0.30, 0.06, M.latao, PX, PY + 0.15, FZ + 0.03))          // haste
  g.add(box(0.05, 0.26, 0.05, M.latao, PX, PY + 0.16, FZ + 0.66))          // corrente
  const placa = box(0.90, 0.62, 0.05, M.madeira, PX, PY - 0.28, FZ + 0.66)
  g.add(placa)
  g.add(box(0.96, 0.05, 0.06, M.latao, PX, PY + 0.01, FZ + 0.66))
  g.add(box(0.96, 0.05, 0.06, M.latao, PX, PY - 0.57, FZ + 0.66))
  // o naipe nos DOIS lados da placa: ela e vista de perfil pelos dois sentidos
  // da calcada, e uma placa em branco de um lado le como defeito
  for (const sgn of [1, -1]) {
    const e = espadas(M.latao, 0.42, 0.03)
    e.rotation.y = sgn > 0 ? 0 : Math.PI
    e.position.set(PX, PY - 0.28, FZ + 0.66 + sgn * 0.028)
    g.add(e)
  }

  // --- o naipe grande na faixa do letreiro, sobre a porta -------------------
  // Entre o topo da porta (2.7) e o comeco da faixa do letreiro (3.15) sobra
  // pouco, entao ele vai ACIMA de 3.15, ao lado do letreiro do buildShell, e
  // nao no lugar dele.
  const alto = espadas(M.latao, 0.52, 0.04)
  alto.position.set(PORTA_X, VIT_TOPO + 0.42, FZ + 0.05)
  alto.castShadow = false
  g.add(alto)

  // =========================================================================
  // O JUICE DA ENTRADA — pedido junto com o trabalho de iluminacao noturna.
  //
  // Tudo aqui e pra ser visto A NOITE, e as tres pecas fazem coisas diferentes:
  // a passadeira diz ONDE entrar, o arco de lampadas diz que esta ABERTO, e os
  // dois refletores de chao sao os unicos que de fato poem luz na fachada.
  // Nenhum deles gasta PointLight — o orcamento de luz e global (tools/smoke).
  // =========================================================================

  // --- 1) passadeira de feltro, da porta ao meio-fio -----------------------
  // Feltro verde e a cor da casa (e a mesma do pano das mesas e da parede do
  // fundo). Vai ate z = -8.4, que e a beira da calcada: parar no meio da
  // calcada leria como tapete esquecido, e nao como convite.
  const PASS_X0 = PORTA_X - 1.5, PASS_X1 = PORTA_X + 1.5
  const pass = box(PASS_X1 - PASS_X0, 0.022, 3.5, M.feltroParede, PORTA_X, 0.011, FZ + 1.75)
  pass.castShadow = false
  g.add(pass)
  for (const sgn of [-1, 1]) {
    const fil = box(0.10, 0.028, 3.5, M.latao, PORTA_X + sgn * 1.42, 0.015, FZ + 1.75)
    fil.castShadow = false
    g.add(fil)
  }

  // --- 2) arco de lampadas contornando o vao da porta ----------------------
  // Dezoito bulbos: sobem por um lado, atravessam a verga e descem pelo outro.
  // E a marquise do cassino em versao pobre, de proposito — as duas casas sao
  // do mesmo ramo e a loja e a irma mais nova.
  const DL2 = PORTA_X - B.door.width / 2 - 0.24
  const DR2 = PORTA_X + B.door.width / 2 + 0.24
  const DH2 = B.door.height + 0.30
  const matBulbo = stdMat('loja-bulbo', {
    color: 0xfff4dc, emissive: 0xffd98a, emissiveIntensity: 2.3, roughness: 0.35,
  })
  const caminho = []
  for (let i = 0; i <= 5; i++) caminho.push([DL2, 0.55 + (DH2 - 0.55) * (i / 5)])
  for (let i = 1; i <= 5; i++) caminho.push([DL2 + (DR2 - DL2) * (i / 5), DH2])
  for (let i = 4; i >= 0; i--) caminho.push([DR2, 0.55 + (DH2 - 0.55) * (i / 5)])
  // a canaleta que segura os bulbos, pra eles nao flutuarem colados na parede
  g.add(box(0.07, DH2 - 0.55, 0.07, M.madeira, DL2, (0.55 + DH2) / 2, FZ + 0.05))
  g.add(box(0.07, DH2 - 0.55, 0.07, M.madeira, DR2, (0.55 + DH2) / 2, FZ + 0.05))
  g.add(box(DR2 - DL2, 0.07, 0.07, M.madeira, PORTA_X, DH2, FZ + 0.05))
  for (const [bx, by] of caminho) {
    const b2 = sphere(0.052, matBulbo, 8)
    b2.position.set(bx, by, FZ + 0.11)
    b2.castShadow = false
    g.add(b2)
  }

  // --- 3) dois refletores de chao lavando a fachada ------------------------
  // Corpo apontado pra cima e um LEQUE emissivo saindo dele. O leque e o mesmo
  // truque dos postes de rua (props.makeStreetLight): luz DESENHADA, aditiva,
  // sem depthWrite — custa pixel e nao custa shader de luz.
  // `emissiveMap` junto com `map`: com `color: 0x000000` todo o brilho vem do
  // emissivo, e emissivo SEM mapa e constante no plano inteiro — o alpha do map
  // recortaria a forma mas o brilho continuaria chapado.
  const matLeque = stdMat('loja-leque', {
    map: lequeTex(), emissiveMap: lequeTex(),
    color: 0x000000, emissive: 0xffd98a, emissiveIntensity: 1.3,
    transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  })
  for (const sgn of [-1, 1]) {
    const x = PORTA_X + sgn * 4.1
    const z = FZ + 0.55
    g.add(box(0.30, 0.16, 0.24, M.madeira, x, 0.08, z))
    const lente = box(0.22, 0.05, 0.16, matBulbo, x, 0.17, z)
    lente.castShadow = false
    g.add(lente)
    // o leque: um plano vertical que abre de baixo pra cima, encostado na
    // parede. Estreito embaixo (no refletor) e largo em cima.
    const leque = new THREE.Mesh(new THREE.PlaneGeometry(1.7, VIT_TOPO), matLeque)
    leque.position.set(x, VIT_TOPO / 2 + 0.15, FZ + 0.10)
    leque.castShadow = false
    g.add(leque)
  }
}

/**
 * AS PAREDES LATERAIS.
 *
 * O dono: "quero algo nas paredes laterais tambem para que nao fique sobrando
 * espaco". Ele tem razao — o salao tem 19 m de largura e tudo o que ele vende
 * estava no meio ou no fundo, entao as duas paredes compridas eram 17 m de
 * tijolo liso de cada lado.
 *
 * O que entra tem que ser COERENTE com a casa, e nao enfeite qualquer: quadro
 * de naipe, placar de giz e alvo de dardo sao as tres coisas que existem numa
 * parede de salao de sinuca de verdade. Nada aqui e vendavel (a regra da sala e
 * que o que esta a venda tem ponto de interacao), entao nada disso ganha um.
 */
function paredesLaterais(g) {
  const XO = IN.x0 + 0.06                 // parede oeste, por dentro
  const XL = IN.x1 - 0.06                 // parede leste

  // --- oeste: quatro quadros de naipe, em fila ------------------------------
  // Um quadro so ficaria perdido numa parede de 17 m; quatro em fila com 1.6 m
  // de passo leem como uma GALERIA, que e o que enche a parede.
  for (let i = 0; i < 4; i++) {
    const z = -18.2 - i * 1.7
    g.add(box(0.05, 0.86, 0.66, M.madeira, XO, 1.72, z))
    g.add(box(0.03, 0.74, 0.54, M.feltroParede, XO + 0.02, 1.72, z))
    // o naipe do quadro: espadas nos dois das pontas e o losango (um quadrado
    // girado 45 graus) nos do meio. Nao ha copas nem paus porque as duas
    // formas custariam Shape novo pra aparecer a 4 m de distancia.
    if (i === 0 || i === 3) {
      const e = espadas(M.latao, 0.40, 0.02)
      e.rotation.y = Math.PI / 2
      e.position.set(XO + 0.045, 1.72, z)
      g.add(e)
    } else {
      const d = box(0.02, 0.30, 0.30, M.latao, XO + 0.045, 1.72, z)
      d.rotation.x = Math.PI / 4
      g.add(d)
    }
  }

  // --- leste: o placar de giz ----------------------------------------------
  // Placar e o objeto que mais aparece numa parede de salao, e o unico que
  // conta uma historia sozinho: alguem estava jogando aqui.
  g.add(box(0.06, 1.30, 2.60, M.madeira, XL, 1.95, -18.6))
  g.add(box(0.03, 1.10, 2.36, solid(0x14201c, 0.98), XL - 0.02, 1.95, -18.6))
  for (const dy of [0.34, 0.02, -0.30]) {
    g.add(box(0.02, 0.018, 2.20, solid(0xd8d2c0, 0.9), XL - 0.035, 1.95 + dy, -18.6))
  }
  g.add(box(0.02, 0.018, 1.10, solid(0xd8d2c0, 0.9), XL - 0.035, 1.95, -19.15))
  // a bandeja de giz, embaixo
  g.add(box(0.10, 0.05, 2.40, M.madeira, XL - 0.04, 1.34, -18.6))

  // --- leste: o alvo de dardo ----------------------------------------------
  const ALVO_Z = -21.9
  g.add(box(0.05, 0.72, 0.72, M.madeira, XL, 1.70, ALVO_Z))
  const alvo = cyl(0.29, 0.29, 0.03, solid(0x101418, 0.95), 20)
  alvo.rotation.z = Math.PI / 2
  alvo.position.set(XL - 0.035, 1.70, ALVO_Z)
  g.add(alvo)
  // os aneis: dois cilindros abertos concentricos, e nao vinte gomos coloridos.
  // A 4 m de distancia o que se le num alvo e o contraste dos aneis, nao a
  // divisao em fatias — e a divisao custaria vinte malhas.
  for (const [r, cor] of [[0.20, 0xc7503a], [0.085, 0xd8cfae]]) {
    const anel = cyl(r, r, 0.032, solid(cor, 0.85), 20, true)
    anel.rotation.z = Math.PI / 2
    anel.position.set(XL - 0.036, 1.70, ALVO_Z)
    g.add(anel)
  }
  const miolo = cyl(0.035, 0.035, 0.034, solid(0x2f7a54, 0.8), 12)
  miolo.rotation.z = Math.PI / 2
  miolo.position.set(XL - 0.037, 1.70, ALVO_Z)
  g.add(miolo)
}

/**
 * WANDA, a dona da casa.
 *
 * Aparencia ENXUTA de proposito: sem chapeu, colar, anel, relogio nem jaqueta.
 * Esses acessorios sao a diferenca entre os 15 meshes do NPC da casa velha e os
 * 65 de cada NPC do cassino, e esta sala ja carrega duas mesas de sinuca. Por
 * cima da roupa vai um colete de crupie proprio, que e uma peca de pano so.
 */
function criarWanda(g, colliders) {
  let npc = null
  try {
    npc = createNPC({
      name: 'Wanda',
      pose: 'work',
      x: WANDA.x, y: 0, z: WANDA.z,
      rotY: 0,                       // olha pro +Z, ou seja, pra quem entra
      shirt: 0xe8e2d2,
      pants: 0x23282f,
      shoes: 0x1a1d22,
      appearance: {
        cabeca: 2, olhos: 1, nariz: 0, boca: 2, barba: 0,
        cabelo: 1, pele: 0, corCabelo: 3, corBarba: 0, sobrancelha: 1,
        chapeu: 2, calcado: 1, blusa: 2, calca: 1,
      },
    })
  } catch (err) { void err; npc = null }
  if (!npc) return null

  const root = npc.root
  root.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true } })

  // colete de crupie: verde-feltro com debrum preto e um cracha
  const colete = new THREE.Group()
  colete.add(box(0.40, 0.44, 0.26, solid(0x134a35, 0.95), 0, 1.16, 0.005))
  colete.add(box(0.42, 0.04, 0.27, solid(0x101418, 0.9), 0, 0.95, 0.005))
  const cracha = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.045), textPlaneMat('WANDA', {
    w: 128, h: 52, color: '#f3e6c2', font: 'bold 30px "Trebuchet MS", sans-serif',
    stroke: 'rgba(0,0,0,0.5)', emissiveIntensity: 0.1,
  }))
  cracha.position.set(0.10, 1.24, 0.135)
  cracha.castShadow = false
  colete.add(cracha)
  // ligas de braco: a silhueta de salao de sinuca
  for (const s of [-1, 1]) {
    colete.add(box(0.10, 0.05, 0.10, solid(0x101418, 0.9), s * 0.235, 1.06, 0))
  }
  root.add(colete)

  g.add(root)

  // O forno vem DEPOIS do colete, senao ele fica de fora da fusao. Preserva as
  // juntas, que e onde npc.js escreve a respiracao, o balanco e a piscada.
  if (npc.character && npc.character.parts) {
    congelarPersonagem(root, { juntas: npc.character.parts })
  }
  colliders.push({
    minX: WANDA.x - 0.3, maxX: WANDA.x + 0.3,
    minZ: WANDA.z - 0.3, maxZ: WANDA.z + 0.3, tag: 'loja-clerk',
  })
  return npc
}

export function buildLojaJogos(game) {
  // DOIS GRUPOS, e o de fora existe SO pra segurar as luzes.
  //
  // O LOD la embaixo esconde o salao por distancia, e ele nao pode esconder as
  // PointLight junto (ver o paragrafo em forroELuz). `raiz` e o que vai pra
  // cena e nunca some; `group` e o salao, e e ele que o LOD apaga.
  const raiz = new THREE.Group()
  raiz.name = 'loja-jogos'
  const group = new THREE.Group()
  group.name = 'loja-jogos-interior'
  raiz.add(group)
  const colliders = []
  const interactables = []
  const occluders = []

  piso(group)
  forroELuz(group, raiz)
  paredes(group, occluders)
  balcao(group, colliders)
  entrada(group, colliders)
  fachada(group, colliders)
  paredesLaterais(group)
  const jb = mostruario(group, colliders, interactables)
  const npc = criarWanda(group, colliders)

  group.position.y = BASE

  // ==========================================================================
  // O FORNO, QUE NUNCA TINHA RODADO AQUI
  //
  // Este era o UNICO interior do jogo que nao passava pelo bakeStatic. O main
  // assa barbearia, mercearia, cassino, casa velha e adega; hotel e garagem
  // assam por conta propria. A loja de jogos ficou de fora — provavelmente por
  // esquecimento — e o preco disso so apareceu quando o dono reclamou que o FPS
  // caia "de maneira brusca" perto da FARMACIA SAO JORGE, que fica a 33 m
  // daqui, do outro lado do quarteirao.
  //
  // A medicao: parado em frente a farmacia, dos 348 draw calls da tela, 189
  // eram DESTE SALAO — desenhado inteiro, mesa por mesa, atras de um predio de
  // 9 m que o esconde por completo. O three nao tem occlusion culling, e o
  // frustum culling nao ajuda porque ele e por mesh: 337 meshes soltas entravam
  // uma a uma no frustum. O culpado nunca foi a farmacia; era o vizinho dela.
  //
  // A JUKEBOX PRECISA SER MARCADA ANTES. Ela anima por `userData.animar`, um
  // nome que este arquivo inventou, e o forno so preserva quem tem `dynamic`,
  // `update` ou `setPhase` (ver world/bake.js). Sem esta linha ela seria fundida
  // na parede e pararia de tocar — em silencio, que e o pior jeito.
  if (jb) jb.userData.dynamic = true
  console.info('loja de jogos:', bakeStatic(group))

  interactables.push({
    id: 'loja-jogos-balcao',
    // do lado do CLIENTE do balcao e na altura da cintura: a interacao pesa o Y
    // pela metade, entao na cintura o rotulo aparece na hora certa tambem em
    // primeira pessoa
    position: new THREE.Vector3(BALCAO.x, BASE + 1.05, BALCAO.z + 1.5),
    radius: 2.4,
    label: 'Falar com a Wanda',
    onInteract: (gm) => {
      if (gm.loja && typeof gm.loja.abrir === 'function') gm.loja.abrir()
      else gm.toast('Wanda: entra. Tudo aqui e de segunda mao, menos o preco.')
    },
  })

  // ---- animacao ------------------------------------------------------------
  let lookObj = null
  function alvoDoOlhar(gm) {
    if (lookObj) return lookObj
    const ch = gm && gm.character
    if (!ch) return null
    lookObj = (ch.parts && ch.parts.head) || ch.root || null
    return lookObj
  }

  // --- LOD do salao ---------------------------------------------------------
  // Mesmo assado, um interior nao tem o que dizer a 32 m de distancia atras de
  // um vidro. Ver o mesmo bloco em world/hotel.js pro raciocinio completo.
  //
  // 32 E MEDIDO, e o numero saiu do defeito que este LOD veio consertar. O
  // ponto onde o dono sentiu a queda — a calcada da FARMACIA SAO JORGE, em
  // (28, -42) — fica a 33 m da porta desta loja, do outro lado do quarteirao e
  // atras de um predio de 9 m. Dali nao ha angulo nenhum que enxergue esta
  // vitrine, e mesmo assim o salao inteiro estava sendo desenhado. Com 32 o
  // salao apaga exatamente ali.
  //
  // Do lado de dentro do raio nada muda: a porta fica a 4 m da calcada da
  // avenida e a 20 m da calcada oposta, entao quem passa na frente da loja —
  // que e o publico da vitrine — sempre a ve acesa.
  const LOD2 = 32 * 32
  let ligado = true

  let t = 0
  function update(dt, gm) {
    t += Math.min(dt || 0, 0.1)
    const pp = gm && gm.player && gm.player.position
    if (pp) {
      const dx0 = pp.x - B.door.center, dz0 = pp.z - B.z1
      const perto = dx0 * dx0 + dz0 * dz0 < LOD2
      if (perto !== ligado) { ligado = perto; group.visible = perto }
    }
    if (!ligado) return
    if (jb && jb.userData && typeof jb.userData.animar === 'function') jb.userData.animar(t)
    if (!npc) return
    const p = gm && gm.player && gm.player.position
    if (p) {
      const dx = p.x - WANDA.x, dz = p.z - WANDA.z
      if (dx * dx + dz * dz < 49) {
        const alvo = alvoDoOlhar(gm)
        if (alvo) npc.lookTarget = alvo
      } else if (npc.lookTarget) {
        npc.lookTarget = null
      }
    }
    if (typeof npc.update === 'function') npc.update(dt)
  }

  // `group: raiz` e nao `group`: quem vai pra cena e a raiz, que carrega o
  // salao E as luzes. O LOD continua apagando so o salao.
  return { group: raiz, colliders, interactables, occluders, update }
}

export default buildLojaJogos
