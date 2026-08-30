import * as THREE from 'three'
import { solid, stdMat, glass, cyl, box } from '../world/materials.js'
import { lataCerveja, garrafaVodka, garrafaWhiskey, bebidaDe } from './bebidas.js'

// ---------------------------------------------------------------------------
// src/mobilia/destilados.js — O QUE A ADEGA 100 VENDE ALEM DO CHOPE.
//
// mobilia/bebidas.js ja tem a lata, a vodka e o whiskey, e este arquivo NAO
// duplica nenhuma das tres: ele importa. O que ele acrescenta e o que uma adega
// clandestina tem e um mercado nao tem — gin, pinga de alambique, long neck, o
// garrafao de cinco litros e a GARRAFA BATIZADA.
//
// Valem as mesmas regras de bebidas.js, e elas nao sao negociaveis:
//   - silhueta acima de tudo (o jogador ve a peca a vinte centimetros do olho);
//   - no maximo ~14 malhas por garrafa;
//   - NENHUMA MARCA, em lugar nenhum: nem nome, nem letra, nem tipografia.
//     O que ha de rotulo aqui e FORMA — chapa, filete, aro, lacre, barbante.
//
// A GARRAFA BATIZADA merece um paragrafo, porque ela e o tema do lugar. O que
// faz uma garrafa parecer adulterada nao e um rotulo escrito "adulterada": e a
// AUSENCIA de rotulo onde deveria haver um, a etiqueta arrancada pela metade
// (sobra a cola e um triangulo de papel), a tampa que nao e a original e o nivel
// que nao bate com o das outras da prateleira. Tudo isso e geometria, e por isso
// tudo isso esta aqui.
//
// Escala real em metros, cada peca EM PE COM A BASE EM y = 0.
// ---------------------------------------------------------------------------

const M = {
  get vidroIncolor() { return glass(0xe2f0f4, 0.15) },
  get vidroAmbar() {
    return stdMat('dst-vidro-ambar', {
      color: 0x8a4a12, transparent: true, opacity: 0.42, roughness: 0.10,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get vidroVerde() {
    return stdMat('dst-vidro-verde', {
      color: 0x2f5f3c, transparent: true, opacity: 0.38, roughness: 0.12,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get vidroFosco() {
    return stdMat('dst-vidro-fosco', {
      color: 0xdfe6e6, transparent: true, opacity: 0.66, roughness: 0.85,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  liquido(cor, op) {
    return stdMat('dst-liq:' + cor + ':' + op, {
      color: cor, transparent: true, opacity: op, roughness: 0.10,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get rolha() { return solid(0xc0a172, 0.94, 0.0) },
  get madeiraTampa() { return solid(0x6b4526, 0.72, 0.0) },
  get lacre() { return solid(0x8f1f22, 0.62, 0.10) },
  get chumbo() { return solid(0x9aa1a8, 0.44, 0.72) },
  get tampaMetal() { return solid(0x1d1f24, 0.48, 0.30) },
  get papel() { return solid(0xd9cfb4, 0.96, 0.0) },
  get papelVelho() { return solid(0xb8a982, 0.98, 0.0) },
  get barbante() { return solid(0xa9975f, 1.0, 0.0) },
  get palha() { return solid(0x9a7a3c, 1.0, 0.0) },
  get madeiraSeca() { return solid(0x7a5a34, 0.95, 0.0) },
  get plastico() { return solid(0x2c4a86, 0.58, 0.02) },
}

/** Perfil revolvido, [[raio, altura]] do fundo pra cima. Igual ao de bebidas.js
 *  — a ordem importa: invertida, a peca sai do avesso. */
function torno(pontos, mat, seg = 30) {
  const v = []
  for (const p of pontos) v.push(new THREE.Vector2(p[0], p[1]))
  const m = new THREE.Mesh(new THREE.LatheGeometry(v, seg), mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Serrilha de tampa ou de tampinha: um InstancedMesh, nunca N caixinhas. */
function serrilha(raio, altura, y, n, mat, esp = 0.0016) {
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(esp, altura, 0.0026), mat, n)
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
 * O LIQUIDO DENTRO DA GARRAFA. Recebe o MESMO perfil do vidro e encolhe por
 * dentro: 1,2 mm de parede. Assim o liquido encosta na parede em qualquer
 * altura e a linha do nivel fica onde tem que ficar.
 *
 * `ate` e a altura da superficie. `perfil` so precisa cobrir ate ela.
 */
function liquidoDe(perfil, ate, mat, seg = 26) {
  const pts = [new THREE.Vector2(0, 0.004)]
  for (const p of perfil) {
    if (p[1] > ate) break
    pts.push(new THREE.Vector2(Math.max(0.001, p[0] - 0.0012), Math.max(0.004, p[1])))
  }
  // fecha a superficie no raio que o vidro tem NAQUELA altura
  let r = perfil[perfil.length - 1][0]
  for (let i = 1; i < perfil.length; i++) {
    if (perfil[i][1] >= ate) {
      const t = (ate - perfil[i - 1][1]) / Math.max(1e-6, perfil[i][1] - perfil[i - 1][1])
      r = perfil[i - 1][0] + (perfil[i][0] - perfil[i - 1][0]) * t
      break
    }
  }
  pts.push(new THREE.Vector2(Math.max(0.001, r - 0.0012), ate))
  pts.push(new THREE.Vector2(0, ate))
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat)
  m.castShadow = false
  return m
}

// ===========================================================================
// 1. GIN ARTESANAL — 700 ml, ombro alto e redondo, gargalo curto, rolha.
// ===========================================================================

/**
 * O gin e a garrafa de OMBRO REDONDO do jogo: a vodka de bebidas.js tem ombro
 * reto e o whiskey e quadrado, entao a unica coisa que separa esta daquelas na
 * silhueta e a curva do ombro. Ela e generosa de proposito (o raio cai de 4,2
 * pra 1,5 cm em 4 cm de altura), porque ombro timido le como garrafa de vinho.
 */
export function garrafaGin() {
  const g = new THREE.Group()
  g.name = 'garrafa-gin'
  const PERFIL = [
    [0, 0], [0.0400, 0], [0.0420, 0.006],
    [0.0420, 0.150], [0.0405, 0.168], [0.0350, 0.190],
    [0.0250, 0.208], [0.0170, 0.222], [0.0148, 0.236],
    [0.0148, 0.268], [0.0170, 0.276], [0.0170, 0.282],
    [0.0125, 0.282], [0.0125, 0.276],
  ]
  g.add(torno(PERFIL, M.vidroVerde, 30))
  // botanico: o liquido e quase incolor com um verde de cima
  g.add(liquidoDe(PERFIL, 0.196, M.liquido(0xd8e8d0, 0.32), 26))

  // rolha de cortica com castao de madeira: a assinatura do gin artesanal
  const cort = cyl(0.0128, 0.0130, 0.030, M.rolha, 14)
  cort.position.y = 0.288
  cort.castShadow = true
  g.add(cort)
  const cast = cyl(0.0195, 0.0175, 0.022, M.madeiraTampa, 14)
  cast.position.y = 0.314
  cast.castShadow = true
  g.add(cast)
  const topo = cyl(0.0195, 0.0195, 0.004, M.madeiraTampa, 14)
  topo.position.y = 0.327
  g.add(topo)

  // medalhao em relevo no ombro + dois filetes na base: e o que a luz pega numa
  // garrafa sem rotulo escrito
  const med = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.0022, 20), M.vidroFosco)
  med.rotation.x = Math.PI / 2
  med.position.set(0, 0.196, 0.0355)
  med.castShadow = false
  g.add(med)
  for (const y of [0.026, 0.036]) {
    const f = new THREE.Mesh(new THREE.TorusGeometry(0.0424, 0.0016, 5, 26), M.vidroFosco)
    f.rotation.x = Math.PI / 2
    f.position.y = y
    f.castShadow = false
    g.add(f)
  }
  // chapa do rotulo: so a FORMA, com o canto de baixo levantado
  const chapa = box(0.052, 0.086, 0.0018, M.papel, 0, 0.088, 0.0418)
  chapa.rotation.x = -0.03
  g.add(chapa)
  return g
}

// ===========================================================================
// 2. PINGA DE ALAMBIQUE — 600 ml, gargalo longo, rolha, barbante no pescoco.
// ===========================================================================

/**
 * A garrafa de cachaca de alambique e ALTA E ESTREITA, com o gargalo comprido —
 * e essa proporcao (corpo de 3,2 cm de raio contra 33 cm de altura) que a
 * separa de todas as outras do jogo na estante.
 *
 * `lasca` poe a tala de umburana dentro. Nao e enfeite: cachaca envelhecida em
 * garrafa com a madeira dentro e uma coisa que existe, a madeira aparece atraves
 * do vidro incolor, e e o unico detalhe do arquivo que muda a COR do liquido
 * (ambar claro em vez de incolor).
 */
export function garrafaPinga(lasca = false) {
  const g = new THREE.Group()
  g.name = lasca ? 'pinga-umburana' : 'pinga-alambique'
  const PERFIL = [
    [0, 0], [0.0300, 0], [0.0320, 0.007],
    [0.0320, 0.168], [0.0300, 0.184], [0.0230, 0.204],
    [0.0150, 0.224], [0.0122, 0.244],
    [0.0122, 0.316], [0.0142, 0.324], [0.0142, 0.330],
    [0.0100, 0.330], [0.0100, 0.322],
  ]
  g.add(torno(PERFIL, M.vidroIncolor, 28))
  g.add(liquidoDe(PERFIL, 0.230, M.liquido(lasca ? 0xc78a2c : 0xf0f6f2, lasca ? 0.62 : 0.26), 24))

  if (lasca) {
    // a tala de madeira, torta dentro do liquido
    const t = box(0.0085, 0.150, 0.0060, M.madeiraSeca, 0.008, 0.100, 0.004)
    t.rotation.set(0.06, 0.5, 0.10)
    t.castShadow = false
    g.add(t)
  }

  // rolha + capuz de lacre
  const cort = cyl(0.0104, 0.0106, 0.026, M.rolha, 12)
  cort.position.y = 0.336
  cort.castShadow = true
  g.add(cort)
  const capuz = cyl(0.0150, 0.0140, 0.034, M.lacre, 14)
  capuz.position.y = 0.340
  capuz.castShadow = true
  g.add(capuz)

  // BARBANTE no pescoco e a etiquetinha pendurada: o "artesanal" inteiro esta
  // aqui. Duas malhas.
  const volta = new THREE.Mesh(new THREE.TorusGeometry(0.0132, 0.0018, 5, 18), M.barbante)
  volta.rotation.x = Math.PI / 2
  volta.position.y = 0.300
  g.add(volta)
  const etiq = box(0.026, 0.034, 0.0012, M.papelVelho, 0.006, 0.276, 0.0148)
  etiq.rotation.set(0.1, 0.22, 0.16)
  g.add(etiq)

  // rotulo de papel pardo, colado torto
  const rot = box(0.046, 0.070, 0.0016, M.papelVelho, 0, 0.082, 0.0318)
  rot.rotation.z = 0.035
  g.add(rot)
  return g
}

// ===========================================================================
// 3. LONG NECK 355 ml — a cerveja de garrafa, com tampinha de coroa.
// ===========================================================================

/**
 * A long neck existe pra prateleira ter uma peca BAIXA E GORDA do lado das
 * garrafas altas: seis long necks de 24 cm no meio de garrafas de 33 cm e o que
 * faz uma estante parecer estante e nao uma fileira de postes.
 *
 * A tampinha e a unica peca do arquivo com serrilha VISTA DE PERTO (o jogador
 * bebe dela na mao), entao ela leva 21 dentes — o numero de uma coroa de
 * verdade — em um InstancedMesh.
 */
export function garrafaLongNeck() {
  const g = new THREE.Group()
  g.name = 'cerveja-long'
  const PERFIL = [
    [0, 0], [0.0290, 0], [0.0310, 0.006],
    [0.0310, 0.118], [0.0296, 0.134], [0.0230, 0.156],
    [0.0140, 0.176], [0.0122, 0.192],
    [0.0122, 0.228], [0.0140, 0.234], [0.0140, 0.240],
    [0.0100, 0.240], [0.0100, 0.233],
  ]
  g.add(torno(PERFIL, M.vidroAmbar, 28))
  g.add(liquidoDe(PERFIL, 0.176, M.liquido(0xc07a1c, 0.72), 24))

  const tampa = cyl(0.0158, 0.0158, 0.0062, M.lacre, 20)
  tampa.position.y = 0.2435
  tampa.castShadow = true
  g.add(tampa)
  g.add(serrilha(0.0158, 0.0060, 0.2412, 21, M.lacre, 0.0022))

  // gola do gargalo (o anel onde a coroa crava) e o rotulo do bojo
  const gola = new THREE.Mesh(new THREE.TorusGeometry(0.0142, 0.0022, 5, 18), M.vidroAmbar)
  gola.rotation.x = Math.PI / 2
  gola.position.y = 0.2295
  g.add(gola)
  const rot = box(0.052, 0.052, 0.0016, M.papel, 0, 0.062, 0.0308)
  g.add(rot)
  const golaRot = new THREE.Mesh(new THREE.CylinderGeometry(0.0126, 0.0126, 0.026, 18, 1, true), M.papel)
  golaRot.position.y = 0.206
  golaRot.castShadow = false
  g.add(golaRot)
  return g
}

// ===========================================================================
// 4. GARRAFAO DE 5 LITROS — a pinga a granel, de bojo largo e palha na base.
// ===========================================================================

/**
 * O garrafao e a peca que diz de onde vem a bebida da casa. Ele nao e vendido
 * cheio de rotulo: e vidro grosso, bojo de 11 cm de raio, gargalo curto, tampa
 * de rosca de plastico e a saia de palha trancada — que aqui e UM cilindro
 * aberto com material de palha, e nao trancado de verdade, porque a 40 cm do
 * chao ninguem conta os fios.
 */
export function garrafaoDeVidro(corLiquido = 0xe8e2c8) {
  const g = new THREE.Group()
  g.name = 'garrafao'
  const PERFIL = [
    [0, 0], [0.0820, 0], [0.0900, 0.014],
    [0.1060, 0.070], [0.1090, 0.130], [0.1020, 0.196],
    [0.0760, 0.246], [0.0480, 0.278], [0.0330, 0.298],
    [0.0330, 0.330], [0.0370, 0.338], [0.0370, 0.346],
    [0.0290, 0.346], [0.0290, 0.336],
  ]
  g.add(torno(PERFIL, M.vidroIncolor, 26))
  g.add(liquidoDe(PERFIL, 0.262, M.liquido(corLiquido, 0.40), 22))

  const tampa = cyl(0.0410, 0.0400, 0.026, M.plastico, 18)
  tampa.position.y = 0.356
  tampa.castShadow = true
  g.add(tampa)
  g.add(serrilha(0.0408, 0.024, 0.356, 26, M.plastico, 0.0022))

  const palha = new THREE.Mesh(new THREE.CylinderGeometry(0.1010, 0.0900, 0.10, 22, 1, true), M.palha)
  palha.position.y = 0.056
  palha.castShadow = true
  g.add(palha)
  return g
}

// ===========================================================================
// 5. A GARRAFA BATIZADA — o produto da casa.
// ===========================================================================

/**
 * O QUE FAZ ELA PARECER ADULTERADA, item por item, porque nada aqui e acaso:
 *
 *   - o rotulo esta ARRANCADO: sobrou uma tira de papel e, do lado, a mancha de
 *     cola (um plano fosco, um tom mais escuro que o vidro). Rotulo inteiro em
 *     garrafa clandestina e o erro que desmonta a cena;
 *   - a tampa NAO E A ORIGINAL: e uma tampa de rosca de plastico azul numa
 *     garrafa de bocal de rolha, e ela fica meio torta;
 *   - o NIVEL nao bate: parou 2 cm abaixo do ombro, e o liquido esta turvo
 *     (opacidade alta, cor suja) em vez de translucido;
 *   - uma FITA no gargalo, escrita a mao — em forma, nao em letra: um retangulo
 *     branco riscado, do jeito que se marca o que e de quem.
 */
export function garrafaBatizada() {
  const g = new THREE.Group()
  g.name = 'garrafa-batizada'
  const PERFIL = [
    [0, 0], [0.0340, 0], [0.0362, 0.007],
    [0.0362, 0.156], [0.0344, 0.172], [0.0262, 0.196],
    [0.0160, 0.216], [0.0134, 0.234],
    [0.0134, 0.292], [0.0154, 0.300], [0.0154, 0.306],
    [0.0110, 0.306], [0.0110, 0.298],
  ]
  g.add(torno(PERFIL, M.vidroIncolor, 28))
  // turvo: opacidade alta e cor suja. E o unico liquido do jogo que nao e
  // limpo, e ele tem que parecer errado ao lado dos outros.
  g.add(liquidoDe(PERFIL, 0.178, M.liquido(0xcfc39a, 0.78), 24))

  // tampa de rosca que nao e desta garrafa, e entortada
  const tampa = cyl(0.0168, 0.0160, 0.020, M.plastico, 16)
  tampa.position.set(0.0012, 0.313, 0.0006)
  tampa.rotation.z = 0.06
  tampa.castShadow = true
  g.add(tampa)

  // o que sobrou do rotulo: uma tira, e a mancha de cola do lado
  const tira = box(0.020, 0.062, 0.0014, M.papelVelho, -0.011, 0.086, 0.0360)
  tira.rotation.z = -0.05
  g.add(tira)
  const cola = box(0.036, 0.058, 0.0008, solid(0xb9ac8e, 0.99), 0.010, 0.084, 0.0356)
  cola.castShadow = false
  g.add(cola)

  // fita branca no gargalo, com o risco de caneta (uma barra fina escura)
  const fita = new THREE.Mesh(new THREE.CylinderGeometry(0.0140, 0.0140, 0.020, 16, 1, true), M.papel)
  fita.position.y = 0.256
  fita.castShadow = false
  g.add(fita)
  const risco = box(0.016, 0.0022, 0.0012, solid(0x2a3550, 0.9), 0, 0.258, 0.0142)
  risco.castShadow = false
  g.add(risco)
  return g
}

// ---------------------------------------------------------------------------
// O CATALOGO DA ADEGA
//
// Ele MISTURA de proposito o que e desta casa com o que veio de bebidas.js: a
// vodka e o whiskey da adega sao os MESMOS modelos do mercado, porque e isso
// que uma adega clandestina e — ela vende a mesma garrafa que a loja da esquina
// vende, so que sem nota e mais barata.
//
// E por isso que `preco` aqui e menor que o de bebidas.js na mesma garrafa
// (vodka 140 -> 96, whiskey 190 -> 128). Nao e desconto de loja: e o preco de
// quem nao paga imposto, e o jogador tem que poder DESCOBRIR isso comparando as
// duas vitrines, sem ninguem explicar.
//
// `risco` (0 a 1) e a chance de a garrafa ser batizada. Hoje quem le e so o card
// da loja (o texto do aviso) — esta aqui pra quando a bebida fizer efeito.
// ---------------------------------------------------------------------------

/** Ficha de bebidas.js com preco e texto de contrabando por cima. */
function contrabando(id, extra) {
  const base = bebidaDe(id)
  if (!base) return null
  return Object.assign({}, base, extra)
}

export const ADEGA_CATALOGO = [
  // --- copos entram pela adega, mas moram em mobilia/copos.js --------------
  // (o main junta as duas listas: ver world/adega.js)

  {
    id: 'pinga-alambique', nome: 'Pinga de alambique 600 ml', cat: 'cachaca',
    qualidade: 'boa', preco: 62, empilha: 4, naCasa: false, risco: 0.1,
    desc: 'Barbante no gargalo e etiqueta escrita a mao. Desce quente.',
    mao: { pegaY: 0.098, pegaR: 0.0320 },
    build: () => garrafaPinga(false),
  },
  {
    id: 'pinga-umburana', nome: 'Pinga com tala de umburana', cat: 'cachaca',
    qualidade: 'fina', preco: 148, empilha: 3, naCasa: false, risco: 0.05,
    desc: 'A madeira envelhece dentro da garrafa. Dois anos, dizem eles.',
    mao: { pegaY: 0.098, pegaR: 0.0320 },
    build: () => garrafaPinga(true),
  },
  {
    id: 'pinga-garrafao', nome: 'Garrafao de pinga 5 L', cat: 'cachaca',
    qualidade: 'ruim', preco: 90, empilha: 1, naCasa: false, risco: 0.8,
    // 0,26 x 0,26: e a unica peca deste arquivo que ocupa chao de verdade
    pegada: { larg: 0.30, prof: 0.30 },
    desc: 'Granel, sem lacre. O que tem dentro depende do dia da semana.',
    mao: { pegaY: 0.130, pegaR: 0.1000, escala: 0.86 },
    build: () => garrafaoDeVidro(),
  },
  {
    id: 'gin-artesanal', nome: 'Gin artesanal 700 ml', cat: 'destilado',
    qualidade: 'fina', preco: 210, empilha: 3, naCasa: false, risco: 0.1,
    desc: 'Vidro verde, rolha de cortica com castao de madeira.',
    mao: { pegaY: 0.098, pegaR: 0.0420 },
    build: () => garrafaGin(),
  },
  contrabando('vodka-garrafa', {
    preco: 96, qualidade: 'boa', risco: 0.35,
    desc: 'A mesma do mercado, um terco mais barata. Ninguem pergunta por que.',
  }),
  contrabando('whiskey-garrafa', {
    preco: 128, qualidade: 'boa', risco: 0.45,
    desc: 'Ambar escuro, tampa preta. O lacre foi refeito, e da pra ver.',
  }),
  {
    id: 'garrafa-batizada', nome: 'Garrafa sem rotulo', cat: 'destilado',
    qualidade: 'ruim', preco: 34, empilha: 6, naCasa: false, risco: 1,
    desc: 'Rotulo arrancado, tampa trocada, liquido turvo. Voce que sabe.',
    mao: { pegaY: 0.100, pegaR: 0.0362 },
    build: () => garrafaBatizada(),
  },
  {
    id: 'cerveja-long', nome: 'Long neck 355 ml', cat: 'cerveja',
    qualidade: 'boa', preco: 22, empilha: 8, naCasa: false, risco: 0.1,
    desc: 'Ambar, tampinha de coroa. Sai da caixa direto pro gelo.',
    mao: { pegaY: 0.086, pegaR: 0.0310 },
    build: () => garrafaLongNeck(),
  },
  contrabando('cerveja-lata', {
    preco: 11, risco: 0.2,
    desc: 'Caixa fechada no porao, lata avulsa no balcao. Onze e onze.',
  }),
].filter(Boolean)

/** As abas da adega, na ordem em que aparecem. */
export const ADEGA_CATEGORIAS = [
  { id: 'tudo', label: 'TUDO' },
  { id: 'copos', label: 'COPOS' },
  { id: 'cachaca', label: 'CACHACA' },
  { id: 'destilado', label: 'DESTILADO' },
  { id: 'cerveja', label: 'CERVEJA' },
]

/** Reexporta o que a adega usa de bebidas.js, pra a estante nao precisar dos
 *  dois imports. */
export { lataCerveja, garrafaVodka, garrafaWhiskey }

export default ADEGA_CATALOGO
