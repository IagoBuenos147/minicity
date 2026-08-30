import * as THREE from 'three'
import { stdMat } from '../world/materials.js'
import { skinOf } from './appearance.js'
import { MALHA_MAO } from './character.js'

// ---------------------------------------------------------------------------
// src/player/mao.js — O QUE O JOGADOR ESTA SEGURANDO.
//
// Nasceu pras bebidas (lata, vodka, whiskey), mas NAO conhece bebida nenhuma de
// nome: recebe um `build()` e uma ficha e segura o que vier. Isso e o pedido do
// dono escrito em codigo — "vao entrar outras bebidas depois" —, e a diferenca
// entre acrescentar a quarta bebida em uma linha de catalogo ou em quatro
// arquivos.
//
// POR QUE NAO REUSAR O REVOLVER. src/armas/revolver.js ja faz um item colado na
// camera, e a MECANICA daqui e copiada dele de proposito (matriz montada a mao,
// troca de pai por modo de camera, sway atras da mira) — ver conferirPai() e
// colarNaCamera() la, os comentarios longos estao naquele arquivo. O que nao da
// pra reusar e o resto: aquele modulo e uma ARMA, com mira, tambor, recarga,
// coice e pool de luz. Segurar uma garrafa nao tem nenhuma dessas coisas e tem
// duas que a arma nao tem: a peca muda (cada bebida tem forma e tamanho
// proprios) e a mao precisa FECHAR EM VOLTA dela.
//
// TRES DECISOES QUE SUSTENTAM O RESTO:
//
//   1. A POSE E DA PEGA, NAO DA PECA. Toda bebida do catalogo nasce EM PE COM A
//      BASE EM y=0 (contrato de mobilia/bebidas.js). Se a pose fosse da base, a
//      lata de 15,7 cm e a garrafa de 30 cm apareceriam em alturas diferentes na
//      tela e cada bebida nova precisaria de um numero achado no olho. Aqui a
//      pose posiciona o PUNHO, e a peca desce por `pegaY` — a altura em que a
//      mao agarra aquela peca. E o unico numero que uma bebida nova precisa
//      informar, e ele e obvio olhando o modelo.
//
//   2. O BALANCO SAI DO CONTROLLER, NAO DE UM RELOGIO PROPRIO. player.bobPhase
//      e a MESMA fase que faz a camera subir e descer. Uma fase propria aqui
//      (que era o que o revolver fazia, com `tempo * vel * 2.6`) bate numa
//      cadencia e a camera em outra: as duas senoides passam uma pela outra e a
//      garrafa parece solta na tela. O comentario do proprio controller ja
//      tinha diagnosticado isso na camera contra a animacao dos pes.
//
//   3. CORRER TEM POSE PROPRIA. Nao e "andar com o balanco maior". Quem corre
//      baixa a mao pro quadril e vira a garrafa; deixa-la na altura do peito
//      correndo a 5,5 m/s e o que faz um item de mao parecer adesivo colado na
//      tela. A troca entre as duas poses entra por rampa (damp), pela mesma
//      razao que o controller rampa a amplitude do bob: soltar o Shift nao pode
//      trocar a pose de um quadro pro outro.
// ---------------------------------------------------------------------------

// --- poses, em ESPACO DA CAMERA ---------------------------------------------
// -Z e pra frente, +X e a direita da tela, +Y e pra cima. Rotacao zero ja e "em
// pe, de frente", porque o grupo `orienta` faz a meia-volta (o modelo aponta
// pra +Z, convencao do jogo, e a frente da camera e -Z).
//
// Z curto de proposito: a camera tem near = 0.05, entao 0.40 m nao corta nada,
// e mais perto que isso a garrafa de 30 cm come metade da tela.
const POSE_ANDAR = {
  // Os seis numeros foram achados COM A PECA NA TELA (ver tools/shot-bebida.mjs
  // e api.poses), e nao no papel. O que os prende e a garrafa de 30 cm, que e a
  // maior peca de mao do jogo: a 0.42 m ela comia metade da tela, e o meio
  // metro daqui e onde ela para de tapar a cidade sem virar um enfeite pequeno
  // no canto. A lata de 15,7 cm nasce certa junto, porque a pose e da PEGA.
  pos: new THREE.Vector3(0.268, -0.292, -0.510),
  // z = +0.235: o topo cai um pouco pra ESQUERDA, na direcao do centro da tela.
  // Vertical em pe a peca vira uma coluna colada na borda e some da leitura.
  // y = -0.26: mostra a FRENTE do rotulo. Mais que isso e a peca de perfil, que
  // e o angulo em que a garrafa quadrada some e a lata perde a manga impressa.
  // z NEGATIVO, e aqui esta a correcao que faltava em todas as tentativas.
  //
  // O punho sai pelo lado -X da peca, que e a DIREITA da tela — na horizontal.
  // Na foto de referencia do dono ele vem de BAIXO, e a lata inclina junto:
  // mao e peca sao um bloco so. Eu vinha girando a mao DENTRO da lata pra
  // resolver isso, e girar ali so troca qual dedo aparece — nunca ia baixar o
  // punho. Quem baixa e a rotacao do CONJUNTO, que e esta.
  //
  // -0.28 rad. A primeira tentativa foi -0.50 e na tela a lata saiu quase 40
  // graus fora da vertical — parecia que ia derramar. O angulo que se ve NAO e
  // so este z: ele compoe com o x e o y da mesma pose, entao 0.28 aqui da os
  // ~15 graus da foto de referencia. Menos que isso e a mao volta a ler como
  // deitada atravessando a tela.
  rot: new THREE.Euler(0.14, -0.26, -0.28),
}
const POSE_CORRER = {
  // A mao desce 6 cm, abre pra fora e a peca vira quase de lado: e o gesto de
  // quem corre com uma garrafa na mao, e nao a mesma pose com balanco maior.
  //
  // A QUEDA E MENOR DO QUE PARECE QUE DEVERIA (6 cm, e nao os 11 da primeira
  // tentativa) por uma razao que so a foto mostra: o punho ja mora perto da
  // borda de baixo da tela, e a garrafa e o que sobe A PARTIR dele. Com 11 cm
  // de queda o punho saia do enquadramento e o que restava era uma lasca de
  // gargalo no canto — a pose de corrida existia e ninguem a via. Quem carrega
  // a leitura da corrida aqui e a ROTACAO, nao a altura.
  pos: new THREE.Vector3(0.315, -0.352, -0.455),
  rot: new THREE.Euler(0.60, -0.55, -0.18),
}
// Pose na mao DE VERDADE (3a pessoa): a junta handR e o PULSO, entao a peca
// sobe um pouco pra pousar no punho fechado em vez de nascer dentro dele.
const POSE_MAO = {
  pos: new THREE.Vector3(0.010, -0.030, 0.052),
  rot: new THREE.Euler(-0.22, 0, 0.10),
}

// --- constantes de sensacao --------------------------------------------------
// Quanto uma peca poe ACIMA do punho na peca de referencia: a garrafa de 1 L,
// que e a maior de mao do jogo (30 cm de altura, pega em 10). E o zero da
// compensacao de altura em montar(): peca que sobe menos que isto acima da mao
// e erguida na tela, proporcionalmente.
const ACIMA_REF = 0.20

/**
 * Quanto o punho gira em volta do eixo da peca. E o numero que decide DE QUE
 * LADO cada coisa fica: com ele, o pulso cai na direita da tela, o polegar
 * cruza pela FRENTE e os quatro dedos passam por TRAS — que e como uma mao
 * direita segura uma garrafa de verdade, e o que as fotos de referencia mostram.
 */
const PUNHO = {
  // Azimute da pega: de que lado a mao entra e, sobretudo, DE QUE LADO DA PECA
  // OS DEDOS PASSAM.
  //
  // O VALOR SAI DE UMA MEDIDA, e a medida certa e a da PONTA DOS DEDOS — nao a
  // do centro de massa da mao, que foi como escolhi antes e escolhi errado (o
  // centro mistura palma, dorso e dedos e nao diz quem tapa o que). Com
  // api.medirPega() da pra ler, no espaco da peca, onde as quatro pontas caem:
  //
  //   giro   ponta Z   ponta X   pulso X
  //   0.8     +3.0      +1.4      -2.4
  //   1.2     ~+2.2     ~+2.3     ~-5.0   <- este
  //   1.6     +1.1      +3.1      -7.3
  //   1.9      ~0       ...       ...     <- o valor antigo, na borda
  //   2.4     -1.4      +3.0      -7.8
  //
  // Z POSITIVO E ATRAS DA PECA (longe da camera) e X NEGATIVO e a direita da
  // tela — o `orienta` da meia-volta na peca. Entao a janela boa vai de ~0.8 a
  // ~1.6: fora dela as pontas cruzam pra FRENTE e tapam a bebida, que era
  // exatamente a queixa. Em 1.9 elas estavam em cima do zero.
  //
  // 1.2 e o meio dessa janela: dedos com 2 cm de folga atras, pontas
  // reaparecendo na borda esquerda e o pulso 5 cm pra direita.
  giro: 1.2,
  // Pra cima ou pra baixo: decide se o polegar sobe ou desce na peca. Sao os
  // dois unicos graus de liberdade da colocacao, e AS COMBINACOES SAO QUATRO —
  // por isso eles sao ajustaveis por fora (api.ajustarPunho) em vez de cravados.
  // Achar o par certo lendo o codigo e uma sequencia de trocas de sinal entre
  // tres espacos (mao -> peca -> camera, com a meia-volta do `orienta` no meio),
  // e cada erro parece plausivel; na tela leva um segundo.
  cima: true,
}

const AMP_BOB_ANDAR = 0.016   // quanto a peca sobe e desce andando
const AMP_BOB_CORRER = 0.040  // correndo. 2,5x, e ainda menos que o braco real
const LAMBDA_SAQUE = 11       // velocidade de subir/descer o item na tela
const LAMBDA_CORRIDA = 3.2    // mesma rampa andar<->correr do controller (FP.RAMP)
const LAMBDA_SWAY = 9
const MAX_SWAY = 0.19

const _mPose = new THREE.Matrix4()
const _euler = new THREE.Euler()

function damp(cur, alvo, lambda, dt) {
  return cur + (alvo - cur) * (1 - Math.exp(-lambda * dt))
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v }
function suave(k) { return k * k * (3 - 2 * k) }

/**
 * O PUNHO QUE SEGURA A BEBIDA.
 *
 * ------------------------------------------------------------------------
 * E A MAO DO PERSONAGEM, EM OUTRA POSE. Nao uma imitacao.
 *
 * As duas versoes anteriores empilhavam capsulas e esferas a mao — quatro
 * salsichas, uma bola por no, um bloco de dorso. Nao havia jeito de aquilo
 * ficar bom: capsula nao tem palma concava, nao tem secao de superelipse, nao
 * afina pra ponta e nao dobra. O boneco JA tem uma mao boa (uma malha indexada
 * de ~330 triangulos, com tudo isso), escrita depois de o dono do projeto
 * reclamar de "maos feias" — o erro foi nao ter usado ela desde o comeco.
 *
 * Entao character.js passou a exportar a MAQUINARIA (MALHA_MAO: os aneis, a
 * costura, o tubo curvo do dedo e as tabelas de proporcao) e aqui se monta a
 * POSE. A diferenca entre a mao de repouso e este punho e essencialmente UM
 * NUMERO: o `curva` de cada dedo. Copiar as funcoes pra ca teria criado uma
 * segunda mao pra manter, que diverge no primeiro conserto.
 *
 * NAO E A MAO DELE EXATA, e o pedido foi esse: e a mesma linguagem (mesma
 * secao, mesma pele, mesmas proporcoes de dedo) numa pose que a dele nao tem, e
 * com mais aneis por dedo — esta aqui aparece a vinte centimetros do olho, a
 * dele aparece a dois metros.
 *
 * ------------------------------------------------------------------------
 * A CURVA SAI DA PECA. Um dedo de comprimento L que abraca um cilindro de raio
 * r percorre um arco de raio (r + raio do dedo), entao ele gira L/(r+raio)
 * radianos do no ate a ponta. E so isso — e e o que faz a MESMA mao fechar
 * quase inteira na lata de 6 cm e abrir na garrafa de 9,5, sem tabela nenhuma
 * e sem numero achado no olho. Bebida nova entra sozinha.
 *
 * ------------------------------------------------------------------------
 * O POLEGAR PASSA PELA FRENTE, OS QUATRO DEDOS POR TRAS.
 *
 * Isto e anatomia, nao gosto: pegue uma garrafa com a mao direita, polegar pra
 * cima. A palma olha pra esquerda, os dedos dao a volta pelo lado LONGE de voce
 * e o polegar volta pelo lado PERTO. As duas versoes anteriores faziam o
 * contrario — os dedos cruzando a frente e o polegar escondido —, e era por
 * isso que a mao nao lia como mao: e uma pega que nenhuma mao humana faz.
 *
 * Quem decide isso e o `giro` la embaixo, que gira o punho inteiro em volta do
 * eixo da peca ate os nos ficarem do lado certo.
 */

// Espaco da mao (contrato de character.js): origem no PULSO, dedos descendo em
// -Y, palma virada pra -X e polegar pra +Z. Os dedos dobram em torno de -Z,
// entao eles varrem o plano XY — ou seja, o cilindro que a mao abraca tem o
// eixo em Z. E dai que sai toda a colocacao mais abaixo.
const _v3 = new THREE.Vector3()

/**
 * Eixo em que o POLEGAR dobra ao segurar: o mesmo plano dos quatro dedos, com o
 * sinal trocado. Trocado e o ponto — e o que faz ele fechar CONTRA eles em vez
 * de acompanhar. (A mao de repouso usa EIXO_POLEGAR, que e o da abducao, fora
 * do plano; ali o polegar nao aperta nada.)
 */
const EIXO_POLEGAR_PEGA = new THREE.Vector3(0, 0, 1)

/**
 * Eixo do polegar DEITADO: girar em -Y leva a direcao dele (dominada por +Z)
 * na direcao de -X, que e o lado onde a peca esta. E o que encosta a polpa no
 * vidro sem tirar o dedo da parede — dobrar no plano dos outros dedos jogaria
 * ele por cima da boca do copo.
 */
const EIXO_POLEGAR_DEITADO = new THREE.Vector3(0, -1, 0)

/**
 * Monta a geometria do punho fechado em volta de um cilindro de raio `r`.
 *
 * Devolve { geo, centro }: `centro` e onde o eixo do cilindro cai NO ESPACO DA
 * MAO, e e por ele que quem chama encaixa a mao na peca.
 */
/**
 * ONDE A PONTA DE UM DEDO VAI PARAR.
 *
 * Reproduz passo a passo a integracao de M.dedo() — que avanca um trecho e gira
 * um pedaco da curva por junta, com os mesmos pesos — e devolve so o ultimo
 * ponto. E o unico jeito de saber a ponta: dedo() desenha e nao devolve nada.
 *
 * Existe porque MEDIR A MAO INTEIRA NAO RESPONDE A PERGUNTA CERTA. O centro e a
 * caixa da malha misturam palma, dorso e dedos, e o que decide se a peca fica
 * tapada e SO onde as quatro pontas caem: na frente do objeto elas o escondem,
 * atras elas somem. Escolhi o giro por centro de massa uma vez e escolhi errado.
 */
const PESO_DEDO = [0.30, 0.10, 0.40, 0.20]
function pontaDoDedo(base, dir, comp, curva, raio, ponta, R, eixo) {
  const p = base.clone()
  const d = dir.clone().normalize()
  const passo = comp / (R - 1)
  for (let k = 0; k < R - 1; k++) {
    p.addScaledVector(d, passo)
    d.applyAxisAngle(eixo, curva * (PESO_DEDO[k] || 0.25))
  }
  // o mesmo avanco que dedo() da pra fechar o leque da ponta
  p.addScaledVector(d, raio * ponta * 0.62)
  return p
}

function construirPunho(r) {
  const M = MALHA_MAO
  const ma = M.malha()
  const o = new THREE.Vector3()
  const U = new THREE.Vector3(1, 0, 0)
  // V pra -Z: a regra de costurar() e que o anel A fica no sentido
  // +cross(u,v) em relacao a B. Com V = +Z a mao inteira sai do avesso — o
  // mesmo defeito que o comentario de construirMao() em character.js descreve.
  const V = new THREE.Vector3(0, 0, -1)

  // --- palma, com o PULSO FECHADO -------------------------------------------
  //
  // A pilha de aneis do boneco comeca DENTRO do antebraco: la a emenda nunca
  // aparece porque o braco tapa. Aqui nao ha braco (foi tirado de proposito, ver
  // punhoEmVolta), entao aquele primeiro anel seria um TUBO OCO apontando pra
  // camera — da pra ver o interior da mao. Estes dois aneis extras fecham o
  // pulso numa calota, e a tampa deles tem a volta dos triangulos INVERTIDA:
  // a tampa de M vale pro fim da pilha (a base da palma), e esta e do comeco.
  const primeiro = M.PALMA_ANEIS[0]
  const aPulso = [
    [primeiro[0] + 0.020, primeiro[1] * 0.52, primeiro[2] * 0.52, 2.1, 0],
    [primeiro[0] + 0.011, primeiro[1] * 0.88, primeiro[2] * 0.88, 2.2, 0],
  ]
  let ant = null
  let anelDoPulso = null
  for (const [y, a, b, n, dx] of aPulso.concat(M.PALMA_ANEIS)) {
    o.set(dx, y, 0)
    const A = M.anel(ma, o, U, V, a, b, n, 10)
    if (ant) M.costurar(ma, ant, A)
    else anelDoPulso = A
    ant = A
  }
  tampaInvertida(ma, anelDoPulso, 0, primeiro[0] + 0.026, 0)
  M.tampa(ma, ant, 0, -0.086, 0.002)
  {
    let antT = null
    for (const [y, a, b] of M.TENAR) {
      o.set(0.0035, y, 0.0250)
      const A = M.anel(ma, o, U, V, a, b, 2.2, 8)
      if (antT) M.costurar(ma, antT, A)
      antT = A
    }
    M.tampa(ma, antT, 0.0035, -0.061, 0.0250)
  }

  // --- os quatro dedos, fechados na peca -------------------------------------
  // O leque (`abre`) da mao de repouso e ZERADO aqui: na mao aberta ele espalha
  // os dedos, mas num punho eles se comprimem uns contra os outros. Com o leque,
  // as pontas abriam em leque justamente onde deviam se encostar.
  let cx = 0, cy = 0, nCentro = 0
  const pontas = []
  for (const d of M.DEDOS) {
    const dir = new THREE.Vector3(-0.10, -1, 0).normalize()
    // AQUI. Arco / raio: o dedo gira o que for preciso pra dar a volta nesta
    // peca. Teto de 2.5 rad (143 graus) pra peca muito fina nao fazer o dedo
    // atravessar a propria palma.
    const curva = Math.min(2.5, d.comp / (r + d.raio))
    // 9 colunas e 6 aneis (a mao do boneco usa 7 e 5): esta aqui e vista a
    // vinte centimetros do olho, e com 7 colunas a superelipse do dedo mostra
    // faceta na silhueta. Custa alguns triangulos numa malha que existe UMA vez.
    const base = new THREE.Vector3(0, d.y, d.z)
    M.dedo(ma, base, dir, d.comp, curva, d.raio, 0.66, 9, 6)
    pontas.push(pontaDoDedo(base, dir, d.comp, curva, d.raio, 0.66, 6, M.EIXO_DEDO))
    // centro do arco deste dedo: perpendicular a direcao, do lado pra onde ele
    // dobra (-X). A media dos quatro e onde o eixo da peca cai.
    const R = r + d.raio
    cx += 0 + (-dir.y) * -R
    cy += d.y + dir.x * -R
    nCentro++
  }
  cx /= nCentro; cy /= nCentro

  // --- NOS DOS DEDOS --------------------------------------------------------
  //
  // Quatro calombos no DORSO, na linha onde os dedos nascem.
  //
  // Sao o detalhe que faltava, e da pra dizer por que: num punho fechado visto
  // por tras — que e exatamente o que a camera enxerga nesta pega — o dorso e a
  // maior area de pele na tela, e a pilha de aneis da palma entrega ele LISO.
  // Pele lisa de 8 cm nao le como mao; le como luva. O no e o unico acidente de
  // superficie que o olho procura ali, e sao quatro deles em fila com alturas
  // diferentes (o do indicador e o mais alto, o do minimo o mais baixo, o mesmo
  // arco que a tabela DEDOS ja descreve).
  //
  // Cada um e uma bolha de dois aneis fechada nas duas pontas, ENTERRADA no
  // dorso: ela nao precisa costurar com a malha da palma, so precisa que a parte
  // de cima apareça. Mesmo truque do tenar, que ja era assim.
  {
    // +X E O DORSO. A palma olha pra -X (contrato de character.js), entao as
    // costas sao o outro lado — na primeira tentativa isto estava negativo e os
    // quatro calombos nasceram DENTRO da palma, encostados na lata, invisiveis.
    const xDorso = 0.0142
    for (let i = 0; i < M.DEDOS.length; i++) {
      const d = M.DEDOS[i]
      // o do indicador sobressai mais: e o que pega a luz primeiro
      const alt = 0.0072 - i * 0.0006
      const raio = 0.0108 - i * 0.0005
      let antN = null
      for (const [dy, k] of [[0.010, 0.55], [0.000, 1.00], [-0.010, 0.62]]) {
        o.set(xDorso + alt * k, d.y + 0.0085 + dy, d.z)
        const A = M.anel(ma, o, U, V, raio * k, raio * k * 1.06, 2.4, 8)
        if (antN) M.costurar(ma, antN, A)
        antN = A
      }
      M.tampa(ma, antN, xDorso, d.y - 0.0015, d.z)
    }
  }

  // --- polegar: OPOE os dedos, pelo lado de perto ---------------------------
  //
  // Aqui esta a diferenca entre uma mao que segura e uma mao que so encosta, e
  // foi o que as duas primeiras versoes erraram: o polegar seguia os dedos, do
  // mesmo lado. Mao nao pega assim — o polegar aperta CONTRA os quatro, pela
  // face oposta da peca. Como os dedos passam por tras, ele passa pela FRENTE,
  // que e justamente a face que a camera enxerga; e por isso que ele e o unico
  // dedo que aparece inteiro, nas fotos de referencia e aqui.
  //
  // DUAS TROCAS EM RELACAO A MAO DE REPOUSO:
  //  - a DIRECAO tem +Y (no espaco da mao, +Y e "de volta pro pulso", que
  //    depois da colocacao vira "na direcao do jogador"). O polegar dobra por
  //    cima em vez de descer junto com os dedos.
  //  - o EIXO de dobra deixa de ser EIXO_POLEGAR (que e o da abducao relaxada,
  //    fora do plano) e passa a ser o mesmo plano dos dedos, com o sinal
  //    trocado: os dois lados da peca se fecham um contra o outro.
  //
  // E ele dobra MENOS: o polegar tem uma falange a menos e um caminho mais
  // curto pra dar em volta da peca.
  // O POLEGAR SOBE PELA PECA, DEITADO PRA ESQUERDA.
  //
  // Na foto ele nao atravessa a lata por cima: ele fica quase EM PE, encostado
  // na parede da lata, do mesmo lado do punho, com a ponta inclinada pra dentro
  // da tela. `+Z no espaco da mao` e o lado do polegar, e depois da colocacao
  // vira "pra cima na peca" — por isso a direcao aqui e dominada por z. O `x`
  // positivo e a inclinacao pra esquerda que o dono pediu.
  //
  // Ele dobra POUCO e em torno de -Y: e o eixo que empurra a ponta contra o
  // vidro sem tirar o dedo do plano da parede.
  const curvaPol = Math.min(0.75, 0.052 / (r + 0.0126) * 0.42)
  M.dedo(
    ma,
    new THREE.Vector3(-0.002, -0.034, 0.0330),
    new THREE.Vector3(0.40, 0.26, 0.86),
    0.058, curvaPol, 0.0128, 0.72, 10, 6, EIXO_POLEGAR_DEITADO, 2.1,
  )

  const geo = ma.geo()
  pintarPele(geo, cx, cy, r)
  return { geo, centro: _v3.set(cx, cy, 0).clone(), pontas }
}

/** Tampa com a volta invertida: fecha o COMECO de uma pilha de aneis. */
function tampaInvertida(ma, A, cx, cy, cz) {
  const c = ma.v(cx, cy, cz)
  for (let i = 0; i < A.length; i++) ma.tri(c, A[i], A[(i + 1) % A.length])
}

/**
 * COR POR VERTICE: sombra nas dobras e ponta de dedo mais quente.
 *
 * E o que faz mais pela aparencia da mao do que qualquer triangulo a mais, e a
 * razao e simples: esta malha NAO TEM UV (o `anel` do boneco so cospe posicao),
 * entao textura esta fora de questao sem mexer na geometria compartilhada. Cor
 * por vertice nao precisa de UV nenhuma, e uma cor por vertice bem escolhida faz
 * o mesmo trabalho de uma AO assada.
 *
 * SAO DUAS CONTAS, as duas geometricas:
 *
 *  1. OCLUSAO. Quanto mais perto do eixo da peca, mais escuro. E onde a mao
 *    aperta o vidro: o vao entre dedo e garrafa, a face interna das falanges, o
 *    fundo da palma. Sem isso a mao e um bloco de plastico cor de pele com a
 *    silhueta certa e nenhum volume — foi o que se viu nas fotos.
 *  2. PONTA QUENTE. Longe do pulso, a cor puxa pro vermelho. Ponta de dedo e
 *    articulacao tem mais sangue na superficie; e um detalhe pequeno que o olho
 *    reconhece na hora, e e o que separa "cor de pele" de "pele".
 */
function pintarPele(geo, cx, cy, r) {
  const pos = geo.attributes.position
  const n = pos.count
  const cor = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)

    // 1) oclusao: 0 encostado na peca, 1 a tres centimetros dela
    const d = Math.hypot(x - cx, y - cy)
    // 24 mm de queda, e nao 30: a sombra tem que fechar DENTRO da dobra do dedo,
    // que e um vao de ~2 cm. Mais larga que isso ela vira um degrade suave na
    // mao inteira e nao separa nada.
    let k = (d - r) / 0.024
    k = k < 0 ? 0 : (k > 1 ? 1 : k)
    // O piso de 0.52: a primeira tentativa parou em 0.62 e na tela a mao ainda
    // lia como um bloco chapado cor de pele — medido, o alcance inteiro ia de
    // 0.62 a 1.07, que e pouco contraste pra vencer a luz difusa da cena. Nao da
    // pra fechar em preto (sombra preta vira mancha num material sem textura),
    // mas metade da luz na dobra e o que faz o dedo virar dedo.
    const luz = 0.52 + 0.48 * (k * k * (3 - 2 * k))

    // 2) ponta quente: `z` no espaco da mao e o eixo do dedo... nao; a distancia
    // ao pulso e o que vale, e o pulso esta na origem
    let t = (Math.hypot(x, y, z) - 0.055) / 0.075
    t = t < 0 ? 0 : (t > 1 ? 1 : t)

    cor[i * 3 + 0] = luz * (1 + 0.10 * t)
    cor[i * 3 + 1] = luz * (1 - 0.05 * t)
    cor[i * 3 + 2] = luz * (1 - 0.09 * t)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cor, 3))
}

/**
 * O punho pronto pra pendurar na peca: geometria + a colocacao que poe o eixo
 * do cilindro no lugar certo.
 *
 * A COLOCACAO, em tres passos, e o que liga o espaco da mao ao da peca:
 *
 *   1. os dedos varrem o plano XY da mao, entao o cilindro que eles abracam tem
 *      eixo em Z. A peca tem eixo em Y (toda bebida nasce em pe). Um quarto de
 *      volta em X casa os dois — e o sinal dele decide se o polegar aponta pra
 *      cima ou pra baixo na garrafa;
 *   2. `giro` roda o punho em volta do eixo da peca ate o pulso cair do lado
 *      DIREITO da tela (peca -X, depois da meia-volta do `orienta`) com o
 *      polegar pela frente;
 *   3. a translacao poe o `centro` devolvido por construirPunho() em cima do
 *      eixo da peca, que e o que faz a mao APERTAR e nao tangenciar.
 */
/**
 * O PUNHO, PRA QUEM MAIS PRECISAR. Hoje: player/copo.js.
 *
 * O copo tinha um punho PROPRIO, feito de capsulas — a mesma construcao que o
 * dono do projeto reprovou aqui ("os dedos estao horriveis"). Manter duas maos
 * garantia que a segunda continuasse ruim depois de a primeira ser arrumada,
 * que e exatamente o que aconteceu. Uma mao so, um lugar pra consertar.
 *
 * `r` e o raio da pega. E o unico numero que o chamador precisa saber: e dele
 * que sai o quanto cada dedo enrola.
 */
export function punhoEmVolta(r, pele) {
  const g = new THREE.Group()
  g.name = 'mao-punho'
  // vertexColors: e por aqui que a oclusao e a ponta quente de pintarPele()
  // chegam na tela. A cor base fica branca porque a cor de verdade ja esta nos
  // vertices, multiplicada pelo tom de pele do personagem.
  const matPele = stdMat('mao-pele:' + pele, {
    // 0.80 de aspereza: pele nao tem brilho especular concentrado, e em 0.72 a
    // mao pegava um reflexo largo que a fazia parecer plastico.
    color: pele, roughness: 0.80, metalness: 0.0, vertexColors: true,
  })

  const { geo, centro, pontas } = construirPunho(r)

  // pivo: gira e translada a malha da mao inteira
  const pivo = new THREE.Group()
  const malhaMao = new THREE.Mesh(geo, matPele)
  malhaMao.position.set(-centro.x, -centro.y, 0)
  pivo.add(malhaMao)
  // eixo Z da mao -> eixo Y da peca. O sinal e o 'cima'.
  pivo.rotation.x = PUNHO.cima ? -Math.PI / 2 : Math.PI / 2
  const suporteGiro = new THREE.Group()
  suporteGiro.rotation.y = PUNHO.giro
  suporteGiro.add(pivo)
  g.add(suporteGiro)

  // Marcadores nas quatro pontas e no pulso. Nao desenham nada — existem pra
  // dar pra LER onde eles caem no espaco da peca depois de toda a colocacao
  // (ver api.medirPega). Foi so medindo a PONTA que o giro certo apareceu:
  // medir o centro de massa da mao mistura palma e dedos e responde outra
  // pergunta.
  const marcas = pontas.map((pt) => {
    const o3 = new THREE.Object3D()
    o3.position.set(pt.x - centro.x, pt.y - centro.y, pt.z)
    pivo.add(o3)
    return o3
  })
  const marcaPulso = new THREE.Object3D()
  marcaPulso.position.set(-centro.x, -centro.y, 0)
  pivo.add(marcaPulso)
  g.userData.marcasPonta = marcas
  g.userData.marcaPulso = marcaPulso

  // --- SEM BRACO ------------------------------------------------------------
  //
  // Nao ha antebraco nem manga aqui, e e uma decisao, nao um esquecimento.
  //
  // O braco nasceu junto com a mao e foi um problema em cada versao: dentro do
  // pivo ele apontava DIRETO NA LENTE (a direcao do pulso, no espaco da mao, e
  // exatamente onde a camera esta) e virava um tubo azul tapando a tela; fora do
  // pivo, ele parava de apontar pro lugar certo e ficava um cilindro grosso
  // atravessando o canto do quadro. Nas duas, ele era a maior mancha na tela e
  // roubava a atencao da unica coisa que importa aqui, que e a mao segurando a
  // bebida.
  //
  // O pulso e fechado por uma calota (ver construirPunho) e a pose deixa ele na
  // borda de baixo do enquadramento: o que se ve e uma mao entrando no quadro,
  // que e como quase todo jogo em primeira pessoa resolve isso. Se um dia
  // aparecer manga, ela entra AQUI e nao dentro do pivo.
  return g
}

/**
 * @param dep.scene      a cena (o suporte mora nela em 1a pessoa)
 * @param dep.camera     a camera do jogo
 * @param dep.player     o controller: le mode, speed, grounded, bobPhase...
 * @param dep.character  o boneco (pra pendurar na mao em 3a pessoa)
 * @param dep.aparencia  opcional: de onde sai a cor da pele do punho
 */
export function criarMao({ scene, camera, player, character, aparencia } = {}) {
  const pele = skinOf(aparencia || null)

  // Mesma arquitetura do revolver, e pelas mesmas razoes (os comentarios longos
  // estao em armas/revolver.js): o pai do suporte MUDA com o modo de camera,
  // porque um objeto filho de uma camera que nao esta na cena nunca entra na
  // lista de desenho do renderer e simplesmente nao aparece.
  const suporte = new THREE.Group()
  suporte.name = 'mao-suporte'
  const orienta = new THREE.Group()   // a meia-volta de 1a pessoa
  orienta.name = 'mao-orienta'
  suporte.add(orienta)
  // O BERCO e o que faz a pose ser da PEGA e nao da base da peca: ele desce a
  // peca inteira por pegaY. Trocar de bebida so mexe neste grupo.
  const berco = new THREE.Group()
  berco.name = 'mao-berco'
  orienta.add(berco)

  let paiAtual = null
  let atual = null            // { id, ficha, grupo, punho, pegaY }
  const cache = new Map()     // id -> { grupo, punho, pegaY }

  // --- estado de animacao ---------------------------------------------------
  let k = 0                   // 0 = fora de cena, 1 = na altura de segurar
  let alvoK = 0
  let corrida = 0             // rampa andar->correr
  let swayX = 0, swayY = 0
  let ultimoYaw = 0, ultimoPitch = 0
  let tempo = 0
  let saque = 0               // impulso do saque: cai sozinho, da o overshoot
  let quique = 0              // impulso da aterrissagem
  let noChao = true
  let visivel = false

  /**
   * Monta (uma vez por id) a peca + o punho em volta dela.
   *
   * O cache e por ID e nao por ficha: a mesma lata comprada tres vezes e o
   * mesmo modelo, e reconstruir uma garrafa (dez malhas, uma textura de canvas)
   * a cada troca de slot seria um engasgo por tecla apertada.
   */
  function montar(id, build, ficha) {
    const achado = cache.get(id)
    if (achado) return achado

    const grupo = new THREE.Group()
    grupo.name = 'mao-item:' + id
    let peca = null
    try { peca = typeof build === 'function' ? build() : null } catch (err) { void err; peca = null }
    if (!peca) return null
    grupo.add(peca)

    const m = (ficha && ficha.mao) || {}
    // A CAIXA DA PECA e medida sempre, e nao so quando a ficha esta incompleta:
    // e dela que sai a compensacao de altura la embaixo.
    const caixa = new THREE.Box3().setFromObject(peca)
    const altura = Math.max(0.02, caixa.max.y - caixa.min.y)

    // pegaY: a altura, EM METROS a partir da base, em que a mao agarra. Sem
    // ficha, chuta 42% da caixa da peca — errado por centimetros, nunca por
    // ordem de grandeza, e a bebida nova aparece na tela no lugar certo antes
    // mesmo de alguem medir a pega dela.
    let pegaY = Number(m.pegaY)
    if (!Number.isFinite(pegaY)) pegaY = altura * 0.42
    // raio da pega: idem, medido da propria peca quando a ficha nao diz
    let raio = Number(m.pegaR)
    if (!Number.isFinite(raio)) {
      raio = Math.max(0.018, Math.max(caixa.max.x - caixa.min.x, caixa.max.z - caixa.min.z) * 0.5)
    }

    // --- A COMPENSACAO DE ALTURA -------------------------------------------
    // Aqui esta o limite da regra "a pose e da pega". Fisicamente ela e certa:
    // a mao fica no mesmo lugar segurando o que for. Mas o que sobe acima do
    // punho e o que o jogador VE, e isso muda muito de peca pra peca — a
    // garrafa poe 20 cm acima da mao, a lata poe 8,5.
    //
    // Na primeira foto (tools/shot-bebida.mjs) a diferenca apareceu na hora: a
    // garrafa enquadrada e a LATA quase inteira embaixo da borda da tela, so o
    // topo aparecendo. Fisicamente correto e visualmente inutil.
    //
    // Entao a peca baixa SOBE, proporcional ao quanto ela e mais baixa que a
    // referencia. Nao ate emparelhar (0.55, e nao 1.0): emparelhado, a lata
    // ficaria flutuando na altura do queixo com o braco esticado pra baixo, que
    // e o defeito oposto. Meio caminho e o que le como "a mao subiu um pouco
    // porque a coisa e menor", que e o que a mao faz de verdade.
    //
    // ISTO E O QUE FAZ A BEBIDA NOVA NASCER CERTA: quem acrescentar um copo de
    // 9 cm ou uma garrafa de 40 nao precisa achar numero nenhum de pose.
    const acimaDaPega = Math.max(0.02, altura - pegaY)
    const ergue = Math.max(0, (ACIMA_REF - acimaDaPega) * 0.55)

    const punho = punhoEmVolta(raio, pele)
    punho.position.y = pegaY
    grupo.add(punho)

    // Colada na tela, a sombra da peca cairia no mundo vinda do nada. Na mao de
    // verdade (3a pessoa) ela e legitima — quem liga e desliga e conferirPai().
    grupo.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false } })

    const reg = { grupo, punho, pegaY, ergue, escala: Number(m.escala) || 1 }
    cache.set(id, reg)
    return reg
  }

  /** Troca o pai do suporte quando o modo de camera muda. */
  function conferirPai() {
    const primeira = !player || player.mode === 'first'
    const alvo = primeira ? scene : ((character && character.parts && character.parts.handR) || scene)
    if (alvo === paiAtual) return
    if (suporte.parent) suporte.parent.remove(suporte)
    alvo.add(suporte)
    paiAtual = alvo
    orienta.rotation.y = primeira ? Math.PI : 0
    // O punho postico e SO de 1a pessoa: em 3a pessoa a mao do boneco ja esta
    // ali, e as duas juntas viram seis dedos.
    if (atual && atual.punho) atual.punho.visible = primeira
    if (atual) {
      atual.grupo.traverse((o) => { if (o.isMesh) o.castShadow = !primeira })
    }
    // Na cena, a matriz do suporte e montada a mao a cada quadro (ver
    // colarNaCamera); deixar o three refaze-la desfaria a composicao com a
    // matriz da camera.
    suporte.matrixAutoUpdate = !primeira
    if (!primeira) {
      suporte.position.copy(POSE_MAO.pos)
      suporte.rotation.copy(POSE_MAO.rot)
    }
  }

  /** pose (em espaco da camera) -> matriz de mundo do suporte. */
  function colarNaCamera() {
    camera.updateMatrixWorld(true)
    suporte.updateMatrix()
    _mPose.copy(suporte.matrix)
    suporte.matrix.multiplyMatrices(camera.matrixWorld, _mPose)
    suporte.matrixWorldNeedsUpdate = true
  }

  function mostrar(v) {
    if (visivel === v) return
    visivel = v
    suporte.visible = v
  }

  const api = {
    /**
     * As poses, VIVAS, pra afinar no console com a peca na tela:
     *
     *   __game.mao.poses.andar.pos.set(0.23, -0.27, -0.62)
     *
     * Nao e enfeite: achar estes seis numeros olhando o codigo e impossivel — o
     * que se ve na tela depende do FOV, da altura dos olhos e do tamanho da
     * peca ao mesmo tempo. Sem esta porta, cada tentativa custava um reload.
     * Sao os MESMOS objetos que o atualizar() le, entao o que se afina aqui e
     * exatamente o que vai pro arquivo.
     */
    poses: { andar: POSE_ANDAR, correr: POSE_CORRER, mao: POSE_MAO },

    /**
     * Afina a COLOCACAO do punho e reconstroi o que estiver na mao.
     *
     *   __game.mao.ajustarPunho({ giro: 1.52, cima: false })
     *
     * Mesma razao de `poses`: sao dois numeros cujo efeito atravessa tres
     * espacos (mao -> peca -> camera) e nao da pra prever no papel. A diferenca
     * e que estes mudam a GEOMETRIA, entao o cache por id e limpo junto.
     */
    /**
     * Onde as QUATRO PONTAS e o PULSO caem no espaco da peca, em centimetros.
     *
     *   z > 0  atras da peca (longe da camera)  <- e onde os dedos tem que ficar
     *   z < 0  na frente, tapando a peca
     *   x < 0  direita da tela   |   x > 0  esquerda
     *
     * (O `orienta` da meia-volta na peca, entao -X e a direita da tela.)
     */
    medirPega() {
      const punho = atual && atual.punho
      if (!punho) return null
      punho.updateMatrixWorld(true)
      const inv = punho.matrixWorld.clone().invert()
      const ler = (o3) => {
        o3.updateMatrixWorld(true)
        const v = new THREE.Vector3().setFromMatrixPosition(o3.matrixWorld).applyMatrix4(inv)
        return { x: +(v.x * 100).toFixed(1), y: +(v.y * 100).toFixed(1), z: +(v.z * 100).toFixed(1) }
      }
      const ms = punho.userData.marcasPonta || []
      return {
        pontas: ms.map(ler),
        pulso: punho.userData.marcaPulso ? ler(punho.userData.marcaPulso) : null,
      }
    },

    ajustarPunho(op) {
      if (op && typeof op.giro === 'number') PUNHO.giro = op.giro
      if (op && typeof op.cima === 'boolean') PUNHO.cima = op.cima
      const id = atual && atual.id
      const ficha = atual && atual.ficha
      // TIRA O QUE ESTAVA NA MAO ANTES de zerar `atual`: segurar() so remove o
      // grupo anterior se `atual` ainda apontar pra ele, entao zerando primeiro
      // o punho velho ficava pendurado no berco e a cada ajuste aparecia mais
      // um antebraco na tela.
      if (atual && atual.grupo.parent) berco.remove(atual.grupo)
      atual = null
      cache.clear()
      if (id && ficha) api.segurar(id, ficha)
      return { giro: PUNHO.giro, cima: PUNHO.cima }
    },

    get id() { return atual ? atual.id : null },
    get segurando() { return !!atual },
    /** Pro HUD e pro save: o que esta na mao agora. */
    get ficha() { return atual ? atual.ficha : null },

    /**
     * Poe uma peca na mao.
     *
     * `ficha` e a linha do catalogo (bebidas.js / catalogo.js). O que ele le
     * dela: `build` (como montar), `nome` (so pra depuracao) e o bloco opcional
     * `mao: { pegaY, pegaR, escala }`. Nada mais — este modulo nao sabe preco,
     * nem categoria, nem se a coisa empilha.
     *
     * Chamar com o MESMO id que ja esta na mao nao faz nada: sem essa guarda,
     * segurar a tecla do slot refazia o saque a cada quadro e a garrafa ficava
     * tremendo na tela.
     */
    segurar(id, ficha) {
      if (!id || !ficha) return false
      if (atual && atual.id === id && alvoK === 1) return true
      const reg = montar(id, ficha.build, ficha)
      if (!reg) return false

      if (atual && atual.grupo.parent) berco.remove(atual.grupo)
      berco.add(reg.grupo)
      berco.position.y = -reg.pegaY
      berco.scale.setScalar(reg.escala)
      atual = { id, ficha, grupo: reg.grupo, punho: reg.punho, pegaY: reg.pegaY, ergue: reg.ergue }

      paiAtual = null            // forca conferirPai a reavaliar sombra/punho
      conferirPai()
      mostrar(true)
      alvoK = 1
      // O SAQUE. A peca entra por baixo da tela, passa um tico do lugar e volta
      // — e o overshoot que faz o gesto parecer um braco e nao uma interpolacao.
      // Comeca em 1 e cai sozinho no atualizar().
      saque = 1
      ultimoYaw = camera.rotation.y
      ultimoPitch = camera.rotation.x
      return true
    },

    /**
     * Esvazia a mao. A peca NAO some no mesmo quadro: ela desce pra fora do
     * enquadramento primeiro (alvoK = 0) e so entao o grupo e escondido — e o
     * mesmo gesto do saque ao contrario, e some-la na hora seria o unico corte
     * seco de toda a barra de itens.
     */
    largar() {
      if (!atual) return
      alvoK = 0
    },

    /** Sem transicao: pro menu, pro provador, pra cutscene. */
    esconderJa() {
      alvoK = 0
      k = 0
      saque = 0
      mostrar(false)
      if (atual && atual.grupo.parent) berco.remove(atual.grupo)
      atual = null
    },

    atualizar(dt) {
      if (!atual && k <= 0.001) { mostrar(false); return }
      tempo += dt
      conferirPai()

      // --- rampas -------------------------------------------------------------
      k = damp(k, alvoK, LAMBDA_SAQUE, dt)
      saque = damp(saque, 0, 7.5, dt)
      if (alvoK === 0 && k < 0.02) {
        // acabou de guardar: agora sim o grupo sai de cena
        if (atual && atual.grupo.parent) berco.remove(atual.grupo)
        atual = null
        mostrar(false)
        return
      }

      const primeira = !player || player.mode === 'first'
      if (!primeira) return          // na mao de verdade quem poe a pose e o braco

      // --- correr: rampa e pose ----------------------------------------------
      // player.runBlend ja vem rampado no controller; a rampa daqui e a da POSE,
      // que e outra coisa (a do controller e a da amplitude do bob da camera).
      // O controller expoe runBlend de proposito (ver os getters de
      // player/controller.js). A conta de reserva existe pro dia em que este
      // modulo for usado com outro controller — e ela e so uma aproximacao
      // grosseira do mesmo numero.
      const querCorrer = (player && typeof player.runBlend === 'number')
        ? clamp01(player.runBlend)
        : clamp01((((player && player.speed) || 0) - 3.4) / 2.4)
      corrida = damp(corrida, querCorrer, LAMBDA_CORRIDA, dt)
      const c = suave(corrida)

      // --- sway: a peca corre atras da mira -----------------------------------
      let dy = camera.rotation.y - ultimoYaw
      if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2
      const dx = camera.rotation.x - ultimoPitch
      ultimoYaw = camera.rotation.y
      ultimoPitch = camera.rotation.x
      swayY = damp(swayY + dy * 1.5, 0, LAMBDA_SWAY, dt)
      swayX = damp(swayX + dx * 1.5, 0, LAMBDA_SWAY, dt)
      swayY = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayY))
      swayX = Math.max(-MAX_SWAY, Math.min(MAX_SWAY, swayX))

      // --- passo: A MESMA FASE DA CAMERA --------------------------------------
      // Ver a decisao 2 no cabecalho. Sem o bobPhase do controller, esta senoide
      // e a da camera batem em cadencias diferentes e a garrafa flutua.
      const fase = (player && typeof player.bobPhase === 'number') ? player.bobPhase : tempo * 4
      const quanto = (player && typeof player.bobAmt === 'number')
        ? player.bobAmt
        : clamp01(((player && player.speed) || 0) / 2.2)
      const amp = (AMP_BOB_ANDAR + (AMP_BOB_CORRER - AMP_BOB_ANDAR) * c) * quanto
      // vertical em 2x a fase (duas batidas por passada, como a camera),
      // lateral em 1x (o corpo joga pro lado uma vez por passada)
      const passoY = Math.sin(fase * 2) * amp
      const passoX = Math.sin(fase) * amp * 0.62
      // e um giro de pulso acompanhando o passo, so correndo: e o que separa
      // "correndo com a garrafa" de "andando rapido com a garrafa"
      const giroPasso = Math.sin(fase) * 0.16 * c * quanto

      // --- aterrissagem -------------------------------------------------------
      const aterrou = player ? !!player.grounded : true
      if (aterrou && !noChao) quique = 1
      noChao = aterrou
      quique = damp(quique, 0, 9, dt)

      // --- monta a pose -------------------------------------------------------
      const entrada = suave(clamp01(k))
      suporte.position.lerpVectors(POSE_ANDAR.pos, POSE_CORRER.pos, c)
      suporte.position.x += passoX + swayY * 0.34
      suporte.position.y += passoY - swayX * 0.26
      // saque e entrada: a peca sobe de fora do enquadramento. O 0.055 do saque
      // e o overshoot — ela passa do ponto e volta.
      // Peca baixa sobe pra nao morar na borda de baixo da tela (ver montar()).
      // CORRENDO ELA SOBE MAIS: a pose de corrida desce a mao 11 cm, e numa
      // garrafa de 30 cm isso e um gesto — numa lata de 15,7, e a lata inteira
      // saindo por baixo do enquadramento. A foto de 'correndo' da lata mostrou
      // so a tampa. O 0.45 devolve metade do que a corrida tirou, e so pra quem
      // precisa: pra garrafa, ergue e zero e esta linha nao faz nada.
      suporte.position.y += atual.ergue * (1 + c * 0.45)
      suporte.position.y -= (1 - entrada) * 0.46
      suporte.position.y += saque * 0.055
      suporte.position.y -= quique * 0.038
      suporte.position.z += (1 - entrada) * 0.06

      _euler.set(
        POSE_ANDAR.rot.x + (POSE_CORRER.rot.x - POSE_ANDAR.rot.x) * c,
        POSE_ANDAR.rot.y + (POSE_CORRER.rot.y - POSE_ANDAR.rot.y) * c,
        POSE_ANDAR.rot.z + (POSE_CORRER.rot.z - POSE_ANDAR.rot.z) * c,
      )
      // respiracao: so parado, e minuscula. Item de mao totalmente imovel numa
      // tela que respira e a coisa que denuncia o adesivo.
      const parado = 1 - quanto
      _euler.x += Math.sin(tempo * 1.35) * 0.012 * parado + swayX * 0.55 + quique * 0.10
      _euler.y += swayY * 0.55
      _euler.z += Math.cos(tempo * 1.05) * 0.010 * parado - swayY * 0.30 + giroPasso
      // no saque a peca entra girada: e o pulso virando enquanto sobe
      _euler.z += (1 - entrada) * 0.85 + saque * 0.12
      _euler.x -= (1 - entrada) * 0.30
      suporte.rotation.copy(_euler)

      colarNaCamera()
    },

    /**
     * Pro menu/provador/cutscene: some da tela SEM esvaziar a mao — voltando
     * pro jogo, a garrafa continua onde estava. Quem chama e o main, junto com
     * hud.mostrarBarra(): a barra e o que esta na mao aparecem e somem juntos.
     */
    mostrarNaTela(v) {
      if (!atual) return
      mostrar(!!v)
    },

    dispose() {
      api.esconderJa()
      if (suporte.parent) suporte.parent.remove(suporte)
      for (const reg of cache.values()) {
        reg.grupo.traverse((o) => {
          if (o.isMesh) { if (o.geometry) o.geometry.dispose() }
        })
      }
      cache.clear()
    },
  }

  return api
}

export default criarMao
