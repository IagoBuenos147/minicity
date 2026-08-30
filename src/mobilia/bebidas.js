import * as THREE from 'three'
import { solid, stdMat, glass, box, cyl, tex } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/bebidas.js — as tres bebidas: lata, vodka e whiskey.
//
// Sao pecas de MAO. Todas as outras do jogo sao vistas de dois metros; estas o
// jogador levanta na frente da camera em primeira pessoa, a vinte centimetros
// do olho. Isso muda duas coisas no jeito de modelar:
//
//   1. A SILHUETA paga o preco. Ombro, gargalo, calcanhar e a repuxada do fundo
//      da lata sao o que separa "garrafa" de "cilindro pintado". Por isso quase
//      todo o corpo de cada peca e UM LatheGeometry com o perfil real, e nao um
//      empilhamento de cilindros: um perfil de vinte pontos custa uma malha so e
//      da a curva inteira, enquanto tres cilindros empilhados custam tres malhas
//      e ainda mostram os degraus onde um encontra o outro.
//   2. O ORCAMENTO E DURO: no maximo 14 malhas por bebida. A prateleira do
//      mercado repete estas pecas as dezenas, e um comodo ja estourou o tempo de
//      render por causa de peca pequena com malha demais. Detalhe repetido
//      (estria de tampa) vai de InstancedMesh, e cor repartida (a manga da lata)
//      vai de textura de canvas — as duas custam uma malha.
//
// NENHUMA MARCA, EM LUGAR NENHUM. Nem nome, nem letra, nem tipografia, nem
// silhueta de rotulo reconhecivel — nem em comentario. O jogo vai pra Steam e
// bebida e justamente a categoria onde copiar sem pensar e mais tentador. E a
// mesma decisao que baralho() ja tinha tomado no catalogo: o que ficou de rotulo
// aqui e SO FORMA GEOMETRICA (chapa, filete, aro, medalhao). Texto num rotulo e
// onde mora o risco, e nome inventado nao resolve — quem olha compara com a
// garrafa que conhece.
//
// Escala real, em metros, e cada peca EM PE APOIADA NA ORIGEM: y=0 e a base,
// centrada em x/z. Quem pendura na mao e quem poe na prateleira dependem disso.
// ---------------------------------------------------------------------------

// --- materiais (cacheados por chave, como o resto do jogo) ------------------

const M = {
  // Aluminio de lata e ESCOVADO, nao polido: roughness 0.34 com metalness alta.
  // Em 0.1 a lata vira espelho e some dentro do reflexo do ambiente; em 0.7 ela
  // le como plastico cinza. O topo repuxado so aparece nessa faixa estreita.
  get aluminio() { return solid(0xc6ccd2, 0.34, 0.88) },
  get aluminioFosco() { return solid(0x9aa1a8, 0.46, 0.80) },
  get cromo() { return solid(0xdfe3e7, 0.20, 0.92) },
  get plasticoPreto() { return solid(0x121317, 0.44, 0.04) },
  get rotuloPreto() { return solid(0x0d0e11, 0.54, 0.02) },
  get creme() { return solid(0xe4d9b8, 0.56, 0.10) },
  // Vidro incolor de garrafa: opacidade baixissima de proposito. Acima de ~0.25
  // o vidro esconde o liquido, e e o liquido que diz qual bebida e aquela.
  get vidro() { return glass(0xe2f0f4, 0.15) },
  // Vidro JATEADO (o medalhao em relevo e a faixa gravada). Fosco e opaco o
  // bastante pra ler contra o liquido atras — vidro liso no mesmo lugar
  // desaparece completamente.
  get vidroFosco() {
    return stdMat('beb-vidro-fosco', {
      color: 0xdfe6e6, transparent: true, opacity: 0.66, roughness: 0.85,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // Vodka e agua na pratica: quase invisivel. O que precisa aparecer e a LINHA
  // do nivel, entao o liquido e um tico mais opaco que o vidro em volta.
  get liquidoIncolor() {
    return stdMat('beb-liquido-incolor', {
      color: 0xeef8fb, transparent: true, opacity: 0.30, roughness: 0.05,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  // Ambar do whiskey. depthWrite falso pra enxergar a parede de tras do proprio
  // liquido: e essa segunda camada que da a profundidade de coisa liquida — com
  // depthWrite ligado o ambar vira um bloco chapado cor de tijolo.
  get liquidoAmbar() {
    return stdMat('beb-liquido-ambar', {
      color: 0xb0641c, transparent: true, opacity: 0.88, roughness: 0.12,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
}

// --- ferramentas de forma ---------------------------------------------------

/**
 * Perfil revolvido. `pontos` e [[raio, altura], ...] do FUNDO PRA CIMA — nessa
 * ordem o LatheGeometry sai com as normais pra fora; invertida, a peca fica do
 * avesso e so se descobre em cena, com a luz errada.
 *
 * 32 gomos e o piso pra uma peca de mao: com 16 o gargalo de 1,8 cm mostra
 * facetas a vinte centimetros do olho, e cada gomo a mais aqui custa triangulo,
 * nao draw call.
 */
function torno(pontos, mat, seg = 32) {
  const v = []
  for (const p of pontos) v.push(new THREE.Vector2(p[0], p[1]))
  const m = new THREE.Mesh(new THREE.LatheGeometry(v, seg), mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * Estrias de tampa: UM InstancedMesh, nunca N caixinhas.
 *
 * Tampa de rosca lisa le como tampinha de brinquedo — a serrilha e o que diz
 * "isto abre". Mas sao 24 barras de 2 mm: soltas custariam 24 draw calls por
 * garrafa, mais do que a garrafa inteira.
 */
function estrias(raio, altura, y, n, mat) {
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.0015, altura, 0.0024), mat, n,
  )
  const d = new THREE.Object3D()
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    d.position.set(Math.sin(a) * raio, y, Math.cos(a) * raio)
    d.rotation.set(0, a, 0)
    d.updateMatrix()
    inst.setMatrixAt(i, d.matrix)
  }
  inst.instanceMatrix.needsUpdate = true
  inst.castShadow = false
  return inst
}

/**
 * TRANSFORMA UM TORNO REDONDO EM GARRAFA DE SECAO QUADRADA COM CANTOS
 * CHANFRADOS — e o truque que faz o whiskey caber em duas malhas.
 *
 * Garrafa quadrada e o caso em que os dois caminhos obvios dao errado. Torno
 * puro nao faz quadrado. ExtrudeGeometry faz o corpo quadrado mas nao afina no
 * ombro, entao o ombro vira uma peca separada e a costura entre as duas nunca
 * fecha (o corpo e chanfrado, o ombro seria um cone de N lados: o encaixe abre
 * fresta bem na altura em que a mao segura).
 *
 * Aqui o torno redondo e feito primeiro, com o perfil certo, e DEPOIS cada
 * vertice e reprojetado pra fora ate o contorno do quadrado chanfrado. Corpo,
 * ombro, calcanhar e gargalo saem da mesma casca, sem costura nenhuma.
 *
 *   fator(a) = min( 1/|cos a| , 1/|sen a| , (2 - chanfro)/(|cos a| + |sen a|) )
 *
 * As duas primeiras retas sao as faces do quadrado, a terceira e o chanfro do
 * canto. Como o raio do torno vale 1 na direcao da face, o raio que entra no
 * perfil E A MEIA-LARGURA entre faces — da pra ler a medida direto no perfil.
 *
 * `chanfro` 0.332 nao e gosto: com 32 gomos ha um vertice a cada 11,25 graus, e
 * o canto entre face e chanfro cai em atan(1 - chanfro). Em 0.332 isso da
 * exatamente 33,75 = 3 x 11,25, ou seja o canto pousa EM CIMA de um vertice e
 * sai vivo. Qualquer outro valor pega o canto no meio de um gomo e o chanfro
 * chega arredondado, que le como garrafa oval e nao como garrafa quadrada.
 *
 * O gargalo tem que continuar REDONDO (garrafa quadrada de verdade tem bocal
 * redondo, senao a tampa de rosca nao existiria), entao o efeito desliga por
 * altura entre `yCheio` e `yRedondo` — e a mesma rampa desfaz o achatamento em
 * z, pra secao passar de quase-quadrada a circular junto com o ombro.
 */
function quadrar(geo, chanfro, aspecto, yCheio, yRedondo) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 1e-6) continue                  // pontos no eixo nao tem direcao
    const k = Math.min(1, Math.max(0, (yRedondo - y) / (yRedondo - yCheio)))
    const c = Math.abs(x) / r, s = Math.abs(z) / r
    const f = Math.min(1 / Math.max(c, 1e-6), 1 / Math.max(s, 1e-6), (2 - chanfro) / (c + s))
    const e = 1 + (f - 1) * k
    p.setX(i, x * e)
    p.setZ(i, z * e * (1 + (aspecto - 1) * k))
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  // A esfera de corte veio do torno REDONDO e agora esta apertada demais: sem
  // recalcular, a garrafa pisca fora de tela quando so o canto dela aparece.
  geo.computeBoundingSphere()
  return geo
}

// ===========================================================================
// 1. LATA DE CERVEJA 350 ml (formato "sleek": alta e fina)
// ===========================================================================

const LATA = {
  r: 0.0300,        // 6,0 cm de diametro
  h: 0.1570,        // 15,7 cm de altura total, ate o topo da borda enrolada
  y0Manga: 0.0145,  // onde a impressao comeca, logo acima do calcanhar
  y1Manga: 0.1350,  // e onde ela para, no pe do pescoco
}

/**
 * A MANGA IMPRESSA EM CANVAS, e nao em cilindros empilhados.
 *
 * A pintura da lata sao tres campos horizontais mais um desenho. Em geometria
 * isso e no minimo quatro malhas (bege, faixa, laranja, montanha) e a montanha
 * ainda ficaria PLANA, colada de lado num cilindro de 3 cm de raio — a 20 cm do
 * olho da pra ver que ela nao acompanha a curva. Uma textura resolve os quatro
 * por uma malha e o desenho nasce enrolado.
 *
 * A guarda de `document` nao e paranoia: tex() vive de canvas 2D e as
 * conferencias do repositorio montam as pecas em node puro, sem DOM. Sem ela o
 * arquivo inteiro estoura fora do navegador. A GEOMETRIA sai identica nos dois
 * lados — so falta a pintura onde nao ha tela pra mostrar ela.
 */
function mangaLataMat() {
  if (typeof document === 'undefined') return solid(0xd39a4e, 0.44, 0.12)
  return stdMat('beb-lata-manga', {
    map: tex('beb-lata-manga', 512, desenhoLata, 1),
    roughness: 0.44,
    // um resto de metalness: a tinta de lata e impressa SOBRE aluminio e devolve
    // um brilho que tinta sobre papel nao tem
    metalness: 0.12,
  })
}

/**
 * O canvas de tex() e sempre QUADRADO, mas a manga nao e: a circunferencia mede
 * 18,8 cm e a altura impressa 12,1 cm. Cada pixel deitado vale 1,56 pixel em pe,
 * entao tudo que precisa sair redondo tem que ser desenhado 1,56 vez mais
 * estreito. E o que KX faz — sem ele a montanha chega achatada como um morro.
 */
const KX_LATA = (LATA.y1Manga - LATA.y0Manga) / (Math.PI * LATA.r * 2)

function desenhoLata(g, s) {
  const BEGE = '#e9dcc2'
  const AMBAR = '#b8791f'
  const LARANJA = '#cd4f26'
  const TRACO = '#7c4a17'

  // CanvasTexture nasce com flipY, entao a LINHA 0 do canvas cai no TOPO da
  // lata: o bege tem que ser pintado em cima, nao embaixo.
  g.fillStyle = BEGE; g.fillRect(0, 0, s, s * 0.52)
  g.fillStyle = LARANJA; g.fillRect(0, s * 0.52, s, s * 0.48)
  // a faixa ambar montada EM CIMA da divisa: pintada como terceiro campo entre
  // dois, uma folga de arredondamento deixava um fio de fundo aparecendo
  g.fillStyle = AMBAR; g.fillRect(0, s * 0.470, s, s * 0.082)
  // filetes finos nas duas beiradas da faixa — sao eles que fazem a transicao
  // ler como faixa aplicada e nao como degrade mal resolvido
  g.fillStyle = 'rgba(124,74,23,0.55)'
  g.fillRect(0, s * 0.468, s, s * 0.006)
  g.fillRect(0, s * 0.546, s, s * 0.006)
  // filete do alto, onde a impressao encontra o aluminio do pescoco
  g.fillStyle = 'rgba(124,74,23,0.35)'
  g.fillRect(0, s * 0.030, s, s * 0.005)

  // A MONTANHA APARECE DUAS VEZES, em lados opostos da lata.
  // Uma vez so parece mais fiel a uma lata de verdade, mas esta lata gira na mao
  // do jogador: com um desenho unico, metade das voltas mostra um campo bege
  // vazio. Duas copias garantem que sempre ha uma virada pra camera, e a 3 cm de
  // raio as duas nunca aparecem juntas no mesmo quadro.
  for (const u of [0.25, 0.75]) {
    montanhaLata(g, s * u, s * 0.400, s * 0.150 * KX_LATA, s * 0.230, TRACO, s * 0.016)
  }
}

/** Montanha estilizada em traco: dois ombros, um pico deslocado e a neve. */
function montanhaLata(g, cx, base, larg, alt, cor, esp) {
  g.strokeStyle = cor
  g.lineWidth = esp
  g.lineJoin = 'round'
  g.lineCap = 'round'
  // O pico fica FORA do centro (0.16 da largura pra direita) e um ombro menor
  // sobe antes dele. Montanha simetrica le como triangulo, nao como montanha.
  g.beginPath()
  g.moveTo(cx - larg, base)
  g.lineTo(cx - larg * 0.40, base - alt * 0.52)
  g.lineTo(cx - larg * 0.14, base - alt * 0.28)
  g.lineTo(cx + larg * 0.16, base - alt)
  g.lineTo(cx + larg * 0.64, base - alt * 0.34)
  g.lineTo(cx + larg, base)
  g.stroke()
  // a neve: dois riscos curtos logo abaixo do pico
  g.lineWidth = esp * 0.7
  g.beginPath()
  g.moveTo(cx + larg * 0.02, base - alt * 0.70)
  g.lineTo(cx + larg * 0.30, base - alt * 0.72)
  g.moveTo(cx + larg * 0.10, base - alt * 0.82)
  g.lineTo(cx + larg * 0.26, base - alt * 0.83)
  g.stroke()
  // a linha do chao, que fecha o desenho por baixo
  g.lineWidth = esp * 0.9
  g.beginPath()
  g.moveTo(cx - larg * 1.25, base)
  g.lineTo(cx + larg * 1.25, base)
  g.stroke()
}

/**
 * LATA DE CERVEJA 350 ml, "sleek": 6,0 x 15,7 cm.
 *
 * SEIS MALHAS. A casca e UMA SO — do domo do fundo, passando pela repuxada do
 * calcanhar, subindo o corpo, estrangulando no pescoco e fechando no painel da
 * tampa. Perfil continuo do eixo ao eixo, sem emenda.
 *
 * O corpo da casca fica em 29,8 mm e a manga impressa em 30,0 mm: os 0,2 mm de
 * folga sao pra manga vestir por fora sem z-fighting, e o aluminio que sobra por
 * baixo dela nao custa draw call nenhuma (fica coberto).
 */
export function lataCerveja() {
  const g = new THREE.Group()
  const alu = M.aluminio

  // Perfil, do fundo pra cima. O ponto mais baixo e o ARO DE APOIO em y=0 e
  // r=25,8 mm — nao o centro: lata nenhuma se apoia no meio do fundo, ela se
  // apoia num anel, e o domo sobe 15 mm pra dentro. E essa concavidade que faz o
  // fundo ler como repuxado quando o jogador vira a lata na mao.
  g.add(torno([
    [0.0000, 0.0150],   // apice do domo, la dentro
    [0.0100, 0.0135],
    [0.0185, 0.0075],
    [0.0240, 0.0008],
    [0.0258, 0.0000],   // aro de apoio: o ponto mais baixo da peca
    [0.0276, 0.0022],
    [0.0292, 0.0068],
    [0.0298, 0.0140],   // fim do calcanhar, comeco do corpo reto
    [0.0298, 0.1360],
    [0.0288, 0.1432],   // o estrangulamento do pescoco: 4 pontos, e nao 1.
    [0.0272, 0.1492],   // com um ponto so o pescoco vira um cone reto e a lata
    [0.0262, 0.1535],   // perde a barriga que separa sleek de lata comum
    [0.0270, 0.1570],   // borda enrolada = topo da peca (15,7 cm cravados)
    [0.0256, 0.1552],
    [0.0236, 0.1516],   // fundo do rebaixo em volta do painel
    [0.0225, 0.1524],
    [0.0000, 0.1532],   // painel da tampa
  ], alu))

  // a manga impressa, vestida por fora do corpo
  const hManga = LATA.y1Manga - LATA.y0Manga
  const manga = new THREE.Mesh(
    new THREE.CylinderGeometry(LATA.r, LATA.r, hManga, 32, 1, true),
    mangaLataMat(),
  )
  manga.position.y = LATA.y0Manga + hManga / 2
  manga.castShadow = true
  manga.receiveShadow = true
  g.add(manga)

  // --- a abertura -----------------------------------------------------------
  // Tres malhas so pro anel, e valem: e o unico lugar da lata que a camera
  // encosta de verdade quando o jogador bebe.
  const yTampa = 0.1532

  // o risco (a boca que afunda). Nao da pra furar sem booleana, entao e uma
  // elipse rasa um tom abaixo do aluminio: e exatamente a sombra que o rebaixo
  // faria, que a esta distancia e tudo que se ve dele.
  const risco = cyl(0.0050, 0.0050, 0.0005, M.aluminioFosco, 14)
  risco.position.set(0, yTampa + 0.0002, -0.0125)
  risco.scale.z = 1.55
  risco.castShadow = false
  g.add(risco)

  // a lingueta, deitada da boca ate o pe do anel
  g.add(box(0.0062, 0.0009, 0.0180, M.cromo, 0, yTampa + 0.0012, -0.0040))
  // o rebite que prende ela no meio do painel
  g.add(cyl(0.0023, 0.0023, 0.0018, M.cromo, 10).translateY(yTampa + 0.0009))
  // o anel do dedo: oval, e nao redondo — anel redondo le como argola de chaveiro
  const anel = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0009, 6, 18), M.cromo)
  anel.rotation.x = -Math.PI / 2
  anel.scale.y = 1.45              // depois do giro, o y local e o z do mundo
  anel.position.set(0, yTampa + 0.0016, 0.0105)
  anel.castShadow = false
  g.add(anel)

  return g
}

// ===========================================================================
// 2. GARRAFA DE VODKA 1 L — vidro incolor, ombro curto, gargalo grosso
// ===========================================================================

/**
 * GARRAFA DE VODKA 1 L: 9,5 cm de diametro por 30 cm de altura.
 *
 * NOVE MALHAS. A casca de vidro inteira e um torno so (fundo, calcanhar, corpo,
 * ombro, gargalo, bocal e ainda a parede POR DENTRO do gargalo — o perfil dobra
 * e desce, e essa dobra e o que da espessura ao vidro; sem ela a boca da garrafa
 * e uma folha de papel de um lado so).
 *
 * O que identifica esta garrafa e o OMBRO CURTO: ela sobe reta ate 63% da altura
 * e resolve a curva inteira em 5 cm. Ombro longo faz garrafa de vinho.
 *
 * Nenhuma letra no corpo. Uma garrafa transparente com dizeres impressos e
 * justamente o desenho que se reconhece de longe, entao o que da identidade aqui
 * e relevo e gravacao: o medalhao no ombro e a faixa jateada em baixo.
 */
export function garrafaVodka() {
  const g = new THREE.Group()

  g.add(torno([
    [0.0000, 0.0060],   // centro do fundo, ja levantado (o pe raso)
    [0.0180, 0.0045],
    [0.0330, 0.0022],
    [0.0420, 0.0002],
    [0.0448, 0.0000],   // aro de apoio: ponto mais baixo
    [0.0468, 0.0055],   // calcanhar
    [0.0475, 0.0140],
    [0.0475, 0.1880],   // corpo reto ate 63% da altura
    [0.0472, 0.1990],
    [0.0450, 0.2130],   // ombro: quatro pontos em 5 cm
    [0.0390, 0.2270],
    [0.0300, 0.2380],
    [0.0230, 0.2450],
    [0.0196, 0.2520],   // gargalo GROSSO (1,96 cm de raio) e curto
    [0.0188, 0.2680],
    [0.0190, 0.2790],
    [0.0205, 0.2860],   // o anel do bocal, onde a rosca termina
    [0.0210, 0.2905],
    [0.0196, 0.2930],
    [0.0165, 0.2940],   // labio
    [0.0150, 0.2925],   // e a dobra pra dentro: a espessura do vidro
    [0.0148, 0.2500],
  ], M.vidro))

  // O liquido para em 24,2 cm, ja dentro do ombro — e assim que uma garrafa
  // cheia se parece com uma cheia. Nivel no alto do corpo reto le como garrafa
  // pela metade.
  const liq = torno([
    [0.0000, 0.0090],
    [0.0300, 0.0070],
    [0.0420, 0.0045],
    [0.0450, 0.0140],
    [0.0450, 0.1880],
    [0.0447, 0.1990],
    [0.0425, 0.2130],
    [0.0368, 0.2265],
    [0.0290, 0.2360],
    [0.0240, 0.2420],
    [0.0000, 0.2420],   // a superficie, plana
  ], M.liquidoIncolor)
  liq.castShadow = false
  g.add(liq)

  // faixa gravada em baixo: da corpo de produto a uma garrafa sem uma letra
  const faixa = cyl(0.0480, 0.0480, 0.0110, M.vidroFosco, 32)
  faixa.position.y = 0.0420
  faixa.castShadow = false
  g.add(faixa)

  // --- tampa metalica -------------------------------------------------------
  // 3 cm de tampa fechando em 30 cm cravados: a tampa E o topo da peca.
  g.add(cyl(0.0212, 0.0212, 0.0300, M.cromo, 28).translateY(0.2850))
  g.add(estrias(0.0214, 0.0250, 0.2850, 26, M.cromo))
  // o anel de lacre, que fica na garrafa quando a tampa sobe
  g.add(cyl(0.0216, 0.0216, 0.0042, M.cromo, 28).translateY(0.2668))

  // --- medalhao em relevo no pe do ombro ------------------------------------
  //
  // O medalhao e um DISCO PLANO e o vidro em volta e curvo, entao o lugar dele
  // nao e escolha de gosto: quanto mais alto no ombro, mais rapido a parede foge
  // pra tras e mais a beirada de cima do disco fica boiando no ar. Em 19,5 cm
  // (ainda no fim do corpo reto, encostando na virada do ombro) o disco de 3,2 cm
  // cabe inteiro contra vidro quase vertical, e so a parte que TEM que sobrar —
  // o miolo — sobra.
  //
  // O grupo gira -0,08 rad em X pra acompanhar o comeco da inclinacao do ombro,
  // e dentro dele tudo e desenhado olhando pro +Z LOCAL: torus ja nasce assim, o
  // cilindro precisa de meia volta em X. Girar os dois (o grupo e o disco) foi o
  // erro da primeira versao e jogou o medalhao 2 cm pra fora da garrafa.
  const med = new THREE.Group()
  med.position.set(0, 0.1950, 0.0400)
  med.rotation.x = -0.08

  const disco = cyl(0.0158, 0.0158, 0.0120, M.vidroFosco, 26)
  disco.rotation.x = Math.PI / 2
  disco.castShadow = false
  med.add(disco)

  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.0158, 0.0022, 6, 26), M.vidroFosco)
  aro.position.z = 0.0050
  aro.castShadow = false
  med.add(aro)

  // o miolo: um disco cheio, saliente 2,5 mm. Podia ser um simbolo, e nao e de
  // proposito — qualquer figura reconhecivel dentro de um medalhao de garrafa e
  // exatamente a parte que pertence a alguem.
  const miolo = cyl(0.0068, 0.0068, 0.0050, M.vidroFosco, 20)
  miolo.rotation.x = Math.PI / 2
  miolo.position.z = 0.0075
  miolo.castShadow = false
  med.add(miolo)

  g.add(med)
  return g
}

// ===========================================================================
// 3. GARRAFA DE WHISKEY 1 L — secao quadrada chanfrada, ombro reto
// ===========================================================================

const UISQ = {
  chanfro: 0.332,   // ver quadrar(): o valor que crava o canto num vertice
  aspecto: 0.80,    // 9,6 cm de frente por 7,7 cm de fundo — "quase quadrada"
  yCheio: 0.2060,   // ate aqui a secao e quadrada
  yRedondo: 0.2400, // daqui pra cima e redonda (gargalo e rosca)
}

/**
 * GARRAFA DE WHISKEY 1 L: 9,6 x 7,7 cm de secao, 30 cm de altura.
 *
 * DEZ MALHAS. Casca e liquido saem do mesmo par torno+quadrar (ver quadrar()
 * pra entender por que a garrafa quadrada nasce redonda).
 *
 * O OMBRO E RETO: o corpo sobe ate 19,8 cm e a virada acontece em 3,5 cm, quase
 * em angulo. E a diferenca de silhueta entre esta garrafa e a de vodka — la o
 * ombro e uma curva, aqui e um canto.
 *
 * Os rotulos sao CHAPAS PRETAS SEM UMA LETRA, com um filete creme por tras
 * fazendo a moldura (mesmo truque de duas chapas que o baralho usa: uma moldura
 * de quatro barras custaria quatro malhas e leria igual). Rotulo de whiskey e o
 * lugar mais perigoso do jogo inteiro pra encostar em desenho de alguem.
 */
export function garrafaWhiskey() {
  const g = new THREE.Group()

  const casca = torno([
    [0.0000, 0.0070],
    [0.0250, 0.0055],
    [0.0390, 0.0028],
    [0.0450, 0.0002],
    [0.0462, 0.0000],   // aro de apoio
    [0.0474, 0.0060],
    [0.0480, 0.0130],
    [0.0480, 0.1980],   // corpo reto ate 66% da altura
    [0.0478, 0.2060],   // a virada do ombro reto comeca aqui
    [0.0455, 0.2135],
    [0.0370, 0.2245],
    [0.0270, 0.2330],
    [0.0205, 0.2395],
    [0.0185, 0.2460],   // gargalo curto
    [0.0182, 0.2660],
    [0.0186, 0.2740],
    [0.0202, 0.2800],   // anel do bocal
    [0.0206, 0.2845],
    [0.0192, 0.2870],
    [0.0164, 0.2880],   // labio
    [0.0150, 0.2865],
    [0.0148, 0.2560],   // parede interna do gargalo
  ], M.vidro)
  quadrar(casca.geometry, UISQ.chanfro, UISQ.aspecto, UISQ.yCheio, UISQ.yRedondo)
  g.add(casca)

  const liq = torno([
    [0.0000, 0.0100],
    [0.0300, 0.0085],
    [0.0420, 0.0055],
    [0.0452, 0.0140],
    [0.0452, 0.1980],
    [0.0450, 0.2060],
    [0.0428, 0.2130],
    [0.0348, 0.2240],
    [0.0270, 0.2300],
    [0.0000, 0.2300],   // superficie, logo abaixo do fim do ombro
  ], M.liquidoAmbar)
  quadrar(liq.geometry, UISQ.chanfro, UISQ.aspecto, UISQ.yCheio, UISQ.yRedondo)
  liq.castShadow = false
  g.add(liq)

  // --- tampa preta alta -----------------------------------------------------
  // 3,8 cm: e a tampa comprida que fecha a silhueta desta garrafa. Uma tampinha
  // de 2 cm aqui faria a peca inteira ler como garrafa de tempero.
  g.add(cyl(0.0212, 0.0212, 0.0380, M.plasticoPreto, 28).translateY(0.2810))
  g.add(estrias(0.0214, 0.0330, 0.2810, 24, M.plasticoPreto))

  // --- rotulos --------------------------------------------------------------
  // A face da frente esta em z = 0.0480 * 0.80 = 0.0384 (o raio do perfil vale a
  // meia-largura entre faces, entao da pra ler a posicao direto do numero).
  const zF = 0.0480 * UISQ.aspecto
  const yRot = 0.1020

  // o filete creme, por tras e 2 mm maior de cada lado: e ele que vira moldura
  g.add(box(0.0680, 0.1060, 0.0006, M.creme, 0, yRot, zF + 0.0004))
  // a chapa preta grande da frente
  g.add(box(0.0640, 0.1020, 0.0006, M.rotuloPreto, 0, yRot, zF + 0.0009))
  // duas marcas cremes no meio dela, so forma: um aro e uma barra. Sao o
  // suficiente pra chapa preta ler como ROTULO e nao como janela.
  const emb = new THREE.Mesh(new THREE.TorusGeometry(0.0130, 0.0018, 6, 22), M.creme)
  emb.position.set(0, yRot + 0.0240, zF + 0.0013)
  emb.castShadow = false
  g.add(emb)
  g.add(box(0.0420, 0.0035, 0.0006, M.creme, 0, yRot - 0.0210, zF + 0.0013))

  // rotulo menor nas costas: garrafa girada na mao mostra os dois lados, e a
  // face de tras nua entrega que a peca so tem uma frente
  g.add(box(0.0560, 0.0700, 0.0006, M.rotuloPreto, 0, 0.1080, -zF - 0.0009))

  // e a tarja do gargalo, entre o fim do ombro e o pe da tampa
  const tarja = cyl(0.0193, 0.0193, 0.0200, M.rotuloPreto, 24)
  tarja.position.y = 0.2500
  g.add(tarja)

  return g
}

// ---------------------------------------------------------------------------
// O CATALOGO DE BEBIDAS
//
//   preco     em OURO, a mesma moeda de rua do catalogo de mobilia
//   empilha   quantas unidades cabem numa vaga do inventario
//   naCasa    false: bebida vai pro bolso e pra mao, nunca pro chao como movel
//
// Os nomes sao DESCRITIVOS de proposito. Nome proprio inventado numa bebida nao
// protege de nada — quem le compara com o rotulo que conhece — e um nome que so
// diz o que a coisa e nunca vai encostar na marca de ninguem.
// ---------------------------------------------------------------------------
// O BLOCO `mao` E O CONTRATO COM src/player/mao.js, e ele tem exatamente dois
// numeros porque essa foi a condicao pra a quarta bebida custar uma linha:
//
//   pegaY   a que altura, em metros a partir da base, a mao agarra a peca. E a
//           pose do PUNHO que o modulo da mao posiciona na tela, entao e este
//           numero que faz a lata de 15,7 cm e a garrafa de 30 cm aparecerem na
//           MESMA altura do enquadramento em vez de uma na testa e outra no
//           queixo. Sem ele o modulo chuta 42% da caixa da peca — chute que
//           acerta a ordem de grandeza e erra por centimetros.
//   pegaR   o raio da peca NAQUELA altura. O punho e desenhado em volta de um
//           cilindro desse raio: errado pra menos, os dedos afundam no vidro;
//           errado pra mais, aparece uma fresta de luz entre dedo e garrafa.
//
// As CATEGORIAS sao por tipo de bebida e nao por embalagem ('lata' seria uma
// aba com um item so hoje e com dez amanha, sem nada em comum entre eles).
export const BEBIDAS = [
  {
    id: 'cerveja-lata', nome: 'Lata de cerveja 350 ml', cat: 'cerveja',
    qualidade: 'comum', preco: 18, empilha: 12, naCasa: false,
    desc: 'Lata alta e fina, gelada o bastante pra suar na mao.',
    // A MAO PEGA NO TERCO DE BAIXO, e nao no meio.
    //
    // Em 0.072 (46% da altura) a mao ficava no meio da lata e, vista de frente,
    // TAPAVA A LATA INTEIRA: o punho fica 6 cm na direcao da camera e o corpo da
    // mao cobre ~9 cm de altura, que e mais do que a lata tem acima e abaixo da
    // pega somados. Nas fotos de referencia a mao segura embaixo e sobra a maior
    // parte da peca aparecendo — e a peca que tem que ser vista, nao a mao.
    mao: { pegaY: 0.050, pegaR: 0.0300 },
    build: () => lataCerveja(),
  },
  {
    id: 'vodka-garrafa', nome: 'Garrafa de vodka 1 L', cat: 'destilado',
    qualidade: 'boa', preco: 140, empilha: 3, naCasa: false,
    desc: 'Vidro incolor, tampa de metal, um litro cheio ate o ombro.',
    // corpo reto de raio 4,75 cm ate 18,8 cm: a pega fica no terco de baixo
    // dele, pelo mesmo motivo da lata — o que precisa aparecer e a garrafa.
    mao: { pegaY: 0.082, pegaR: 0.0475 },
    build: () => garrafaVodka(),
  },
  {
    id: 'whiskey-garrafa', nome: 'Garrafa de whiskey 1 L', cat: 'destilado',
    qualidade: 'fina', preco: 190, empilha: 3, naCasa: false,
    desc: 'Garrafa quadrada de ombro reto, ambar escuro, tampa preta alta.',
    // secao de 9,6 x 7,7 cm: o raio da pega e a MEDIA das duas meias-secoes,
    // porque a mao fecha nas duas direcoes e ficar so com a maior deixaria o
    // dedo boiando na face estreita.
    mao: { pegaY: 0.080, pegaR: 0.0432 },
    build: () => garrafaWhiskey(),
  },
]

/** As abas do mercado, na ordem em que aparecem. Espelha CATEGORIAS do catalogo
 *  de mobilia: quem desenha as duas lojas e o MESMO HUD (src/ui/loja-ui.js), e
 *  ele so pede a lista de abas e a lista de itens. */
export const CATEGORIAS_BEBIDAS = [
  { id: 'tudo', label: 'TUDO' },
  { id: 'cerveja', label: 'CERVEJA' },
  { id: 'destilado', label: 'DESTILADO' },
]

const POR_ID = new Map()
for (const b of BEBIDAS) POR_ID.set(b.id, b)

/** Espelha itemDe() do catalogo de mobilia: quem vende e quem serve usam a mesma porta. */
export function bebidaDe(id) { return POR_ID.get(id) || null }
