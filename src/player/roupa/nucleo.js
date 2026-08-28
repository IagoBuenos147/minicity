import * as THREE from 'three'
import { solid, stdMat, tex } from '../../world/materials.js'
import { soldarNormais } from '../rosto/nucleo.js'

// ---------------------------------------------------------------------------
// src/player/roupa/nucleo.js — as FERRAMENTAS de roupa.
//
// Saiu de dentro do antigo roupas.js, que era um arquivo de 3 mil linhas com as
// ferramentas e os oito catalogos misturados. A separacao nao e cosmetica: com
// tudo junto, mexer numa camisa obrigava a reler a pagina inteira, e duas
// pessoas mexendo em duas abas diferentes brigavam pelo mesmo arquivo.
//
// Aqui ficam SO as ferramentas. Os catalogos moram um por arquivo, ao lado:
//   chapeus.js  calcados.js  camisas.js  calcas.js
//   colares.js  aneis.js     relogios.js  tatuagens.js
// e roupas.js virou o agregador que reexporta tudo com os nomes antigos.
//
// As cinco regras da casa (elas custaram bugs de verdade, leia antes de mexer):
//
// 1. TUDO NASCE NOVO A CADA build(). Nada de geometria de modulo compartilhada
//    entre bonecos: character.js da dispose() no que sai do slot, e uma
//    geometria compartilhada morreria na troca de roupa de UM jogador levando a
//    roupa de todos os outros junto. Material e textura, sim, sao cacheados.
//
// 2. O campo `esconde` lista os pedacos de PELE que a peca cobre ('torso', 'peito',
//    'braco', 'antebraco', 'coxa', 'canela', 'pe'). CUIDADO: esconder mais do
//    que a peca cobre e a causa numero 1 de buraco. Manga que apaga
//    'antebraco' e para 3 cm antes do pulso deixa a mao solta no ar.
//
// 3. O build recebe o ctx do character.js e devolve UM Object3D no espaco da
//    ancora do slot. O que precisa de outra junta vai por
//    ctx.montar(obj, 'nomeDaParte').
//
// 4. TECIDO NASCE FORA DA PELE, SEMPRE. O corpo nu e o MESMO perfil da roupa em
//    escala 0.965 (NU_S, character.js). Ninguem escreve raio na mao:
//    casca()/fatia() leem o perfil do proprio corpo e multiplicam pela folga.
//
// 5. ACESSORIO FICA FISICAMENTE FORA DO TECIDO. Colar, relogio e anel nascem do
//    raio da peca mais larga do catalogo + SOBRA_ACESSORIO. Resolver com
//    renderOrder ou depthTest:false poria a corrente na frente da parede.
//
// E uma regra nova desta reforma:
//
// 6. TODA SUPERFICIE DE REVOLUCAO PASSA POR soldarNormais(). LatheGeometry
//    fecha a volta DUPLICANDO a coluna de vertices; computeVertexNormals da
//    normais diferentes as duas colunas e a emenda vira uma LISTRA acesa no
//    meio do peito. Era exatamente a listra vertical que o dono fotografou.
//    revolver() ja faz isso por dentro — quem gerar lathe na mao tem que chamar.
// ---------------------------------------------------------------------------

export function sh(m) { m.castShadow = true; m.receiveShadow = true; return m }

/** Escurece/clareia uma cor (sombra de tecido, sola, barra). */
export function esc(hex, mul) {
  return new THREE.Color(hex).multiplyScalar(mul).getHex()
}

export const tecido = (cor, r = 0.9) => solid(cor, r, 0.0)
export const couro = (cor) => solid(cor, 0.42, 0.08)
// Casca aberta (jaqueta, aba de chapeu, lapela) tem que ser DoubleSide: a
// lathe so gera face pra fora e pela abertura da frente se veria o mundo do
// outro lado do boneco em vez do avesso do pano.
export const tecido2 = (cor, r = 0.9) => solid(cor, r, 0.0, { side: THREE.DoubleSide })
export const couro2 = (cor) => solid(cor, 0.42, 0.08, { side: THREE.DoubleSide })
// Metal com metalness BAIXA de proposito: a cena nao tem environment map, e
// metal quase puro sem reflexo pra refletir sai preto (a cruz de prata sumia
// no peito). 0.35 mantem o brilho especular do sol e a cor legivel.
export const metal = (cor) => solid(cor, 0.26, 0.35)

// --- as folgas -------------------------------------------------------------
// Multiplicador sobre o raio do PERFIL DO CORPO. A pele esta em 0.965, entao
// 1.045 ja e 8 mm de tecido no peito — o bastante pro depth buffer separar as
// duas superficies a 30 m de camera.
export const FOLGA_JUSTA = 1.045  // camiseta, camisa, regata
export const FOLGA_SOLTA = 1.062  // moletom, corta-vento
export const FOLGA_LARGA = 1.070  // TETO do catalogo: jaqueta, paleto, blusao
// 4 mm alem da peca MAIS LARGA do catalogo (o raio ja vem multiplicado por
// FOLGA_LARGA). Maior que isso e o colar comeca a boiar na frente do peito nu;
// menor que isso e o depth buffer perde a briga de longe.
//
// NAO E o ctx.foraDaRoupa do character.js, e por isso nao se chama igual. La o
// numero (1,2 cm) e quanto se sobe a partir do RAIO DA PELE pra sair do pano,
// medido no olho; aqui a conta e exata — o raio da peca mais larga sai do mesmo
// perfil que ela usa — e o que sobra e so a margem do depth buffer. Duas
// grandezas diferentes com o mesmo nome era o jeito garantido de alguem trocar
// uma pela outra e enterrar a corrente de novo.
export const SOBRA_ACESSORIO = 0.004
// Raio da gola mais alta do catalogo (a de gola alta), no espaco do pescoco.
// E o teto que o colar usa: qualquer corrente nasce de RAIO_GOLA_ALTA +
// SOBRA_ACESSORIO pra sobresair ATE dela.
export const RAIO_GOLA_ALTA = 0.0555
// Onde a manga comprida morre, medido acima do pulso, e o raio do tecido la.
// A manga PARA antes do relogio de proposito: manga ate a mao obrigaria uma
// pulseira de raio 6 cm pra sobresair, e relogio frouxo le pior que relogio
// coberto.
export const MANGA_FIM_Y = 0.045
export const MANGA_R_BRACO = 0.052
export const MANGA_R_PUNHO = 0.0465
// Quanto o dedo ja se curvou 1.4 cm abaixo do no. O aro deita nesse plano; um
// aro horizontal cortava o dedo em diagonal e afundava de um lado so.
export const INCLINA_DEDO = 0.26

export function malha(geo, mat, x = 0, y = 0, z = 0) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(x, y, z)
  return m
}

/** Cilindro com a junta no MEIO (a posicao ja entra como centro). */
export function tubo(rTop, rBot, h, mat, seg = 14, aberto = false) {
  return malha(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, aberto), mat)
}

export function caixa(w, h, d, mat) {
  return malha(new THREE.BoxGeometry(w, h, d), mat)
}

export function bola(r, mat, seg = 12) {
  return malha(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat)
}

export function anel(r, t, mat, seg = 8, volta = 18) {
  return malha(new THREE.TorusGeometry(r, t, seg, volta), mat)
}

/** Bloco de cantos redondos barato (o roundedBox de materials.js custa caro). */
export function bloco(w, h, d, r, mat) {
  const g = new THREE.SphereGeometry(1, 10, 6)
  // esfera esticada com os polos achatados le como bloco arredondado a 3 m e
  // gasta 1/3 dos triangulos de um ExtrudeGeometry com bevel
  const pos = g.attributes.position
  const k = 1 - Math.min(0.85, r / Math.max(w, h, d))
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const f = (v) => Math.sign(v) * Math.min(1, Math.abs(v) / Math.max(1e-4, k))
    pos.setXYZ(i, f(x) * w / 2, f(y) * h / 2, f(z) * d / 2)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  return sh(new THREE.Mesh(g, mat))
}

// --- perfil do corpo -------------------------------------------------------
// character.js entrega os MESMOS arrays de perfil que ele usa pra pele
// (ctx.perfil.PELVIS / PEITO / MANGA). Toda peca de tronco sai deles: e o
// unico jeito de o tecido acompanhar o vinco do quadril em vez de cortar ele.

/** Raio do perfil na altura y (interpolacao linear, extremos grampeados). */
export function raioPerfil(perfil, y) {
  const n = perfil.length
  if (y <= perfil[0][1]) return perfil[0][0]
  if (y >= perfil[n - 1][1]) return perfil[n - 1][0]
  for (let i = 1; i < n; i++) {
    const a = perfil[i - 1], b = perfil[i]
    if (y <= b[1]) return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
  }
  return perfil[n - 1][0]
}

/**
 * Recorta o perfil entre y0 e y1 GUARDANDO os vertices do meio. Cortar so nas
 * pontas e interpolar reto entre elas era o bug da barra: a corda passava por
 * dentro do vinco do quadril e o tecido do corpo furava a propria barra.
 */
export function fatia(perfil, y0, y1) {
  const out = [[raioPerfil(perfil, y0), y0]]
  for (const p of perfil) if (p[1] > y0 && p[1] < y1) out.push([p[0], p[1]])
  out.push([raioPerfil(perfil, y1), y1])
  return out
}

/** LatheGeometry crua: perfil [[r,y],...], achatamento em Z e arco opcional. */
export function revolver(perfil, seg = 20, flatZ = 1, phi0 = 0, phiLen = Math.PI * 2) {
  const pts = perfil.map((p) => new THREE.Vector2(Math.max(0.0006, p[0]), p[1]))
  const g = new THREE.LatheGeometry(pts, seg, phi0, phiLen)
  if (flatZ !== 1) g.scale(1, 1, flatZ)
  g.computeVertexNormals()
  // A LISTRA VERTICAL NO MEIO DO PEITO NASCIA AQUI. A lathe fecha a volta
  // duplicando a coluna de vertices em phi = 0 — que e exatamente a FRENTE do
  // boneco (a lathe do three usa sin em x e cos em z). As duas colunas ocupam a
  // mesma posicao mas sao vertices distintos, entao computeVertexNormals da a
  // cada uma a media so dos SEUS triangulos: uma olha pra um lado da emenda, a
  // outra pro outro, e a diferenca acende como um risco do pescoco ao umbigo.
  // Soldar as normais (as posicoes e as UVs continuam intactas, entao estampa e
  // xadrez seguem funcionando) apaga o risco sem custar um triangulo.
  // Volta parcial (phiLen < 2pi) nao tem emenda; soldar la e inofensivo.
  soldarNormais(g)
  return g
}

/**
 * Casca de tecido em cima de um perfil do CORPO: raio = perfil * folga + extra.
 * phi = 0 e a FRENTE do boneco (a lathe do three usa sin em x e cos em z),
 * entao uma abertura centrada na frente sai com phi0 = ab/2 e phiLen = 2pi-ab.
 */
export function casca(c, perfil, o = {}) {
  const f = o.folga === undefined ? 1 : o.folga
  const e = o.extra || 0
  const p = perfil.map((q) => [q[0] * f + e, q[1]])
  return revolver(p, o.seg || c.medida.TORSO_SEG, c.medida.FLAT_Z,
    o.phi0 === undefined ? 0 : o.phi0,
    o.phiLen === undefined ? Math.PI * 2 : o.phiLen)
}

/**
 * Z da superficie da peca no ponto (x, y) da FRENTE do tronco.
 * A secao NAO e um circulo: latheGeo achata tudo por FLAT_Z, entao a superficie
 * em x = 0.07 esta 1,5 cm mais atras do que no meio do peito. Usar o z do meio
 * pra um bolso lateral deixava o bolso boiando na frente do corpo — e foi
 * assim que a alca da regata nasceu no ar em vez de nascer no ombro.
 */
export function frenteXZ(c, perfil, x, y, folga, fora = 0.004) {
  const a = raioPerfil(perfil, y) * folga + fora
  const k = Math.min(0.985, Math.abs(x) / a)
  return a * c.medida.FLAT_Z * Math.sqrt(1 - k * k)
}

/** Atalho pro meio do peito (x = 0): botao, ziper, cordao. */
export function frenteZ(c, perfil, y, folga, fora = 0.004) {
  return frenteXZ(c, perfil, 0, y, folga, fora)
}

// ===========================================================================
// CHAPEUS — ancora: head (origem no CENTRO do cranio, +Z = frente)
// ===========================================================================

// Raio de apoio da copa: a cabeca tem 13 formatos e todos cabem dentro deste
// elipsoide com folga. Chapeu que encosta na pele some no cranio comprido.
export function apoio(c) {
  const H = c.medida.HEAD
  return { rx: H.rx * 1.06, ry: H.ry, rz: H.rz * 1.06 }
}

/**
 * Calota que segue o cranio: esfera cortada em thetaMax e escalada nos raios da
 * cabeca, entao a borda cai naturalmente na altura certa.
 * Devolve { mesh, y, r }: onde a borda parou e com que raio.
 */
export function calota(H, mat, thetaMax, folga = 1.03, wSeg = 22, hSeg = 12) {
  const m = sh(new THREE.Mesh(
    new THREE.SphereGeometry(1, wSeg, hSeg, 0, Math.PI * 2, 0, thetaMax), mat,
  ))
  m.scale.set(H.rx * folga, H.ry * folga, H.rz * folga)
  const y = H.ry * folga * Math.cos(thetaMax)
  return { mesh: m, y, r: H.rx * folga * Math.sin(thetaMax) }
}

/** Meia-lua de aba (o meio disco do bone), com a aresta reta dentro da copa. */
export function abaCurva(r, esp, mat, seg = 20) {
  return sh(new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, esp, seg, 1, false, -Math.PI / 2, Math.PI), mat,
  ))
}

// ===========================================================================
// CALCADOS â€” ancora: footR (o par sai por ctx.montar em footL)
// ===========================================================================
// Espaco do pe: origem no TORNOZELO, chao em medida.SOLA_Y, +Z = frente.

/** Monta o mesmo sapato nos dois pes (o pe e simetrico em X, nao precisa espelhar). */
export function par(c, fabrica) {
  const d = fabrica()
  c.montar(fabrica(), 'footL')
  return d
}

export function sapatoBase(c, o) {
  const S = c.medida.SOLA_Y
  const g = new THREE.Group()
  // A sola fica MAIOR e mais baixa que o corpo do sapato de proposito: e a
  // borda escura em volta que faz o pe ler como calcado e nao como bloco.
  const topoSola = S + o.solaH * 1.5
  const corpo = bloco(o.larg, o.alt, o.comp, o.raio, o.mat)
  corpo.position.set(0, topoSola + o.alt / 2, o.frente)
  g.add(corpo)
  const sola = bloco(o.larg * 1.07, o.solaH * 2.2, o.comp * 1.05, o.solaH, o.matSola)
  sola.position.set(0, S + o.solaH * 1.05, o.frente)
  g.add(sola)
  // COLARINHO DO TORNOZELO. A capsula da canela termina numa bola de raio
  // 0.045 centrada na junta do pe, e o bloco do sapato tem meia-largura 0.045
  // exatamente ali em cima: as duas superficies se encostavam e o serrilhado
  // de pele em volta do tornozelo aparecia em TODO calcado baixo. Quem ja tem
  // cano proprio (bota, coturno) passa gola:false.
  if (o.gola !== false) {
    const gola = tubo(0.053, 0.056, 0.070, o.matGola || o.mat, 14)
    gola.position.set(0, S + 0.085, o.frente * 0.25)
    gola.scale.z = 1.05
    g.add(gola)
  }
  return g
}

/** Biqueira: volume achatado na frente do sapato, EMENDADO no corpo. Antes era
 *  uma esfera solta e lia como bola de gude colada na ponta do pe. */
export function biqueira(c, o, mat) {
  const b = bloco(o.larg * 0.90, o.alt * 0.62, o.comp * 0.36, o.raio * 0.8, mat)
  b.position.set(0, c.medida.SOLA_Y + o.solaH * 1.5 + o.alt * 0.30, o.frente + o.comp * 0.33)
  return b
}

/** Cadarco: fileira de tirinhas subindo pelo peito do pe. */
export function cadarco(g, mat, S, n, y0, z0, dy, dz, larg = 0.046) {
  for (let i = 0; i < n; i++) {
    const l = caixa(larg, 0.008, 0.012, mat)
    l.position.set(0, S + y0 + i * dy, z0 + i * dz)
    g.add(l)
  }
}


// ===========================================================================
// BLUSAS â€” ancora: torso (o peito e as mangas vao por ctx.montar)
// ===========================================================================
// Catalogo UNICO do tronco: camiseta, camisa, moletom, jaqueta, blazer e
// paleto sao todos "blusa". Nao existe vestir dois â€” por isso as jaquetas
// abertas trazem a propria lapela e deixam o peito nu aparecer pela abertura,
// em vez de contar com uma camisa por baixo que nao existe mais.

// Raio em que a lathe do peito FECHA no pescoco. O perfil da pele para em
// r = 0.074 e deixa 2 cm de buraco ate o pescoco: por ele se via o avesso do
// torax (face de tras, descartada pelo culling) e portanto o cenario. Fechar
// com um raio MENOR que o pescoco (0.0515 naquela altura) enterra a aresta
// dentro do cilindro do pescoco e o buraco some em qualquer folga.
export const FECHA_PESCOCO = 0.047

/** Perfil do peito recortado na gola e fechado no pescoco. */
export function perfilPeito(c, folga, yGola = 0.201) {
  const p = fatia(c.perfil.PEITO, 0, yGola)
  p.push([FECHA_PESCOCO / folga, yGola + 0.004])
  return p
}

/**
 * Corpo da peca: as MESMAS lathes da pele, so que multiplicadas pela folga.
 * o.phi0/o.phiLen abrem a frente (jaqueta); o.perfilBaixo/o.perfilCima trocam
 * o recorte (regata, jaqueta que comeca na cintura).
 */
export function troncoTecido(c, mat, o = {}) {
  const folga = o.folga || FOLGA_JUSTA
  const g = new THREE.Group()
  const baixo = o.perfilBaixo || c.perfil.PELVIS
  g.add(sh(new THREE.Mesh(casca(c, baixo, {
    folga, phi0: o.phi0, phiLen: o.phiLen,
  }), mat)))
  const cima = o.perfilCima || perfilPeito(c, folga, o.yGola)
  c.montar(sh(new THREE.Mesh(casca(c, cima, {
    folga, phi0: o.phi0, phiLen: o.phiLen,
  }), mat)), 'chest')
  return g
}

/**
 * Barra: banda de 4 mm por fora do proprio corpo da peca, na altura do
 * quadril. Nasce da FATIA do perfil e nao de raios escritos na mao â€” a versao
 * antiga interpolava reto entre -0.012 e 0.014 e passava POR DENTRO do vinco
 * do perfil em -0.008, e era ali que a camiseta furava a propria barra.
 */
export function barra(c, mat, folga, y0 = -0.024, y1 = 0.014) {
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y0, y1), {
    folga, extra: 0.004,
  }), mat))
}

/** Gola: mesma ideia da barra, na boca do decote. Vai montada no 'chest'. */
export function gola(c, mat, folga, y0 = 0.182, y1 = 0.202, extra = 0.004) {
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PEITO, y0, y1), {
    folga, extra,
  }), mat))
}

/**
 * Tira vertical grudada na frente (carcela de botao, faixa de ziper, painel de
 * camisa por baixo do paleto). Segue a curva do corpo porque sai do perfil.
 */
export function tira(c, mat, perfil, folga, o = {}) {
  return sh(new THREE.Mesh(casca(c, perfil, {
    folga, extra: o.extra === undefined ? 0.005 : o.extra, seg: o.seg || 5,
    phi0: -(o.arco || 0.30) / 2, phiLen: o.arco || 0.30,
  }), mat))
}

/**
 * Borda da abertura: duas tiras estreitas descendo pelo corte da frente. Sem
 * elas a casca aberta le como adesivo de 0 mm de espessura colado no boneco.
 */
export function bordaAberta(c, mat, perfil, folga, ab, larg = 0.20, extra = 0.006) {
  const g = new THREE.Group()
  for (const sgn of [1, -1]) {
    g.add(sh(new THREE.Mesh(casca(c, perfil, {
      folga, extra, seg: 4,
      phi0: sgn > 0 ? ab / 2 : -ab / 2 - larg, phiLen: larg,
    }), mat)))
  }
  return g
}

/** Botoes na frente, colados na superficie da peca. */
export function botoes(c, mat, perfil, folga, n, y0, y1, r = 0.0075) {
  const g = new THREE.Group()
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? y0 : y0 + (y1 - y0) * (i / (n - 1))
    const b = malha(new THREE.CylinderGeometry(r, r, 0.004, 8), mat,
      0, y, frenteZ(c, perfil, y, folga, 0.010))
    b.rotation.x = Math.PI / 2
    g.add(b)
  }
  return g
}

/** Bolso chapado: caixa fina com o fundo ENTERRADO no tecido. */
export function bolso(c, mat, perfil, folga, o) {
  const b = caixa(o.w, o.h, 0.018, mat)
  b.position.set(o.x || 0, o.y, frenteXZ(c, perfil, o.x || 0, o.y, folga, o.fora || 0.003))
  return b
}

/** Manga curta (perfil unico: domo + tubo + bainha), nos dois ombros. */
export function mangaCurta(c, mat) {
  for (const lado of ['armRUpper', 'armLUpper']) {
    c.montar(sh(new THREE.Mesh(c.lathe(c.perfil.MANGA, 1, 18), mat)), lado)
  }
}

/**
 * Manga comprida: a curta + tubo no braco, BOLA no cotovelo e tubo no
 * antebraco. A bola nao e enfeite: os dois tubos moram em juntas diferentes e
 * se separam quando o cotovelo dobra, e pela fresta aparecia a bola de PELE do
 * cotovelo (que nao esta em nenhum grupo de 'esconde') â€” era um anel de pele
 * no meio da manga comprida.
 * A manga MORRE MANGA_FIM_Y acima do pulso: assim o antebraco nu continua
 * ligando o tecido a mao (sem ele a mao ficava solta no ar com o furo da palma
 * aberto) e o relogio cabe DEPOIS do pano, sem precisar de raio de bracelete.
 */
export function mangaLonga(c, mat, o = {}) {
  mangaCurta(c, o.matOmbro || mat)
  const r = o.r || MANGA_R_BRACO
  const rp = o.rPunho || MANGA_R_PUNHO
  const U = c.medida.UPPER_ARM, F = c.medida.FORE_ARM
  for (const s of ['R', 'L']) {
    const h = U - 0.030
    const braco = tubo(r, r * 0.97, h, mat, 14)
    braco.position.y = -0.030 - h / 2
    c.montar(braco, 'arm' + s + 'Upper')
    c.montar(bola(r * 0.99, mat, 10), 'arm' + s + 'Lower')
    const hf = F - MANGA_FIM_Y
    const ante = tubo(r * 0.97, rp, hf, mat, 14)
    ante.position.y = -hf / 2
    c.montar(ante, 'arm' + s + 'Lower')
    if (o.punho) {
      const p = tubo(rp * 1.07, rp * 1.02, 0.026, o.punho, 14)
      p.position.y = -hf + 0.013
      c.montar(p, 'arm' + s + 'Lower')
    }
  }
}

/** Alcas de regata: nascem NA superficie do peito, nao no eixo. */
export function alcas(c, mat, folga, o = {}) {
  const g = new THREE.Group()
  const x = o.x === undefined ? 0.070 : o.x
  const larg = o.larg || 0.032
  const alt = o.alt || 0.145
  const y = o.y === undefined ? 0.135 : o.y
  const z = frenteXZ(c, c.perfil.PEITO, x, y, folga, 0.001)
  // A alca DEITA na curva: sobe inclinada pra tras (a superficie recua 3,6 cm
  // do meio do peito ate a clavicula) e pra dentro (o tronco afina). Barra
  // vertical num z fixo saia do corpo no alto e sumia dentro dele embaixo.
  for (const sgn of [1, -1]) {
    const a = caixa(larg, alt, 0.016, mat)
    a.position.set(sgn * x, y, z)
    a.rotation.set(-0.42, 0, -sgn * 0.30)
    g.add(a)
    const b = caixa(larg, alt * 0.92, 0.016, mat)
    b.position.set(sgn * x, y - 0.004, -z)
    b.rotation.set(0.42, 0, -sgn * 0.30)
    g.add(b)
  }
  return g
}

// --- estampas --------------------------------------------------------------
// A LatheGeometry tem u dando a volta no tronco e v ao longo do perfil, entao
// faixa desenhada em Y vira anel horizontal no corpo. Todo motivo e desenhado
// TRES vezes (x, x-s, x+s) porque a costura da textura cai na frente do peito:
// motivo cortado ali le como buraco no pano.

export function listrasMat(a, b) {
  const map = tex('blusa-listras:' + a + ':' + b, 64, (g, s) => {
    g.fillStyle = '#' + new THREE.Color(a).getHexString()
    g.fillRect(0, 0, s, s)
    g.fillStyle = '#' + new THREE.Color(b).getHexString()
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, s, 8)
  }, 1)
  return stdMat('blusa-listrada:' + a + ':' + b, { map, roughness: 0.9, metalness: 0 })
}

export function xadrezMat(a, b) {
  const map = tex('blusa-xadrez:' + a + ':' + b, 128, (g, s) => {
    const ca = '#' + new THREE.Color(a).getHexString()
    const cb = '#' + new THREE.Color(b).getHexString()
    g.fillStyle = ca
    g.fillRect(0, 0, s, s)
    // faixas nos dois sentidos com alpha: onde elas se cruzam a cor fica mais
    // densa sozinha, que e exatamente como um xadrez de verdade se forma
    g.fillStyle = cb
    g.globalAlpha = 0.55
    for (let i = 0; i < 4; i++) {
      g.fillRect(0, i * 32 + 4, s, 14)
      g.fillRect(i * 32 + 4, 0, 14, s)
    }
    g.globalAlpha = 0.35
    for (let i = 0; i < 4; i++) {
      g.fillRect(0, i * 32 + 24, s, 4)
      g.fillRect(i * 32 + 24, 0, 4, s)
    }
    g.globalAlpha = 1
  }, 1)
  return stdMat('blusa-xadrez-mat:' + a + ':' + b, { map, roughness: 0.95, metalness: 0 })
}

export function floralMat(base, flor, folha) {
  const map = tex('blusa-havai:' + base + ':' + flor, 128, (g, s) => {
    g.fillStyle = '#' + new THREE.Color(base).getHexString()
    g.fillRect(0, 0, s, s)
    const petala = '#' + new THREE.Color(flor).getHexString()
    const verde = '#' + new THREE.Color(folha).getHexString()
    const desenha = (x, y, k) => {
      for (const dx of [-s, 0, s]) {
        g.save()
        g.translate(x + dx, y)
        if (k % 2) {
          g.fillStyle = verde
          for (let i = 0; i < 3; i++) {
            g.save(); g.rotate(i * 1.9)
            g.beginPath(); g.ellipse(0, 10, 4, 13, 0, 0, 7); g.fill()
            g.restore()
          }
        } else {
          g.fillStyle = petala
          for (let i = 0; i < 5; i++) {
            g.save(); g.rotate((i / 5) * Math.PI * 2)
            g.beginPath(); g.ellipse(0, 9, 5, 9, 0, 0, 7); g.fill()
            g.restore()
          }
          g.fillStyle = '#f5e06a'
          g.beginPath(); g.arc(0, 0, 3.5, 0, 7); g.fill()
        }
        g.restore()
      }
    }
    let k = 0
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) desenha(i * 32 + (j % 2) * 16 + 8, j * 32 + 16, k++)
    }
  }, 1)
  return stdMat('blusa-havai-mat:' + base + ':' + flor, {
    map, roughness: 0.72, metalness: 0,
  })
}

// ===========================================================================
// CALCAS â€” ancora: hips (as pernas vao por ctx.montar)
// ===========================================================================

// A calca fica POR BAIXO da blusa: 1.02 sobre o perfil deixa 5 mm de tecido em
// cima da pele (0.965) e ainda passa 2 cm por dentro da blusa mais justa
// (1.045). Cos mais gordo que isso reaparecia por cima da camiseta e a costura
// das duas pecas piscava conforme a camera andava.
export const FOLGA_CALCA = 1.020
export const FOLGA_CINTO = 1.038

/** Cos: faixa em volta do quadril, no MESMO perfil do corpo (nao um cilindro
 *  reto: o vinco do quadril furava o cilindro exatamente na frente). */
export function cos(c, mat, o = {}) {
  const y0 = o.y0 === undefined ? -0.026 : o.y0
  const y1 = o.y1 === undefined ? 0.050 : o.y1
  return sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y0, y1), {
    folga: o.folga || FOLGA_CALCA, extra: o.extra || 0,
  }), mat))
}

/**
 * Perna de tecido: tubo na coxa e outro na canela, montados nas juntas certas
 * (senao a calca fica parada no ar enquanto a perna anda).
 *
 * A BARRA TERMINA 2 cm ABAIXO DO TORNOZELO, SEMPRE que a peca tem canela.
 * Quem desenha canela aqui tambem manda esconder a pele da canela, e 'esconde'
 * apaga a CAPSULA INTEIRA — a bola do tornozelo junto. Barra que morre acima do
 * tornozelo entao nao mostra pele: mostra um VAO, e da pra ver o chao entre o
 * tecido e o pe. A conta antiga descontava os 2 cm de S * canelaFrac em vez de
 * S, e so quando canelaFrac passava de 0.94, o que deixava o buraco aberto em
 * quase todo o catalogo: 5,4 cm no jogger, 4,3 cm no moletom e 1,2 cm ate no
 * jeans com o boneco descalco (nem chinelo nem sandalia tem cano pra tapar).
 * Quem quer barra curta de verdade (bermuda, shorts, praia) nao pede canela
 * nenhuma e nao esconde a pele dela, entao nao passa por aqui.
 */
export function pernas(c, mat, o) {
  const T = c.medida.THIGH, S = c.medida.SHIN
  const coxaFrac = o.coxaFrac === undefined ? 1 : o.coxaFrac
  const canelaFrac = o.canelaFrac === undefined ? 0 : o.canelaFrac
  for (const lado of ['R', 'L']) {
    const y0 = 0.020, y1 = -T * coxaFrac
    const coxa = tubo(o.rCoxaTopo, o.rCoxa, y0 - y1, mat, 14)
    coxa.position.y = (y0 + y1) / 2
    c.montar(coxa, 'leg' + lado + 'Upper')
    if (canelaFrac <= 0) continue
    const t0 = o.canelaTopo === undefined ? 0.015 : o.canelaTopo
    // o topo do pe descalco esta em -(S + 0.0175); 2 cm passa dele com folga
    const t1 = Math.min(-(S * canelaFrac), -S - 0.020)
    const canela = tubo(o.rCoxa * 0.97, o.rCanela, t0 - t1, mat, 14)
    canela.position.y = (t0 + t1) / 2
    c.montar(canela, 'leg' + lado + 'Lower')
    if (o.punho) {
      const p = tubo(o.rCanela * 1.04, o.rCanela * 0.98, 0.026, o.punho, 14)
      p.position.y = t1 + 0.013
      c.montar(p, 'leg' + lado + 'Lower')
    }
  }
}

/** Detalhe repetido nas duas pernas (sgn = +1 no lado direito do corpo). */
export function nasPernas(c, junta, fabrica) {
  for (const lado of ['R', 'L']) {
    const o = fabrica(lado === 'R' ? 1 : -1)
    if (o) c.montar(o, 'leg' + lado + junta)
  }
}

export function cinto(c, cor, o = {}) {
  const g = new THREE.Group()
  const m = couro(cor)
  const y = o.y === undefined ? 0.040 : o.y
  g.add(sh(new THREE.Mesh(casca(c, fatia(c.perfil.PELVIS, y - 0.016, y + 0.016), {
    folga: FOLGA_CINTO,
  }), m)))
  const fivela = caixa(0.038, 0.028, 0.012, metal(o.fivela || 0xc9b273))
  fivela.position.set(0, y, frenteZ(c, c.perfil.PELVIS, y, FOLGA_CINTO, 0.006))
  g.add(fivela)
  return g
}


// ===========================================================================
// COLARES â€” ancora: neck (origem na base do pescoco, +Z = frente)
// ===========================================================================
// REGRA DA PECA: colar tem que SOBRESAIR a blusa, sempre, inclusive a de gola
// alta e a jaqueta. Por isso nada aqui tem raio escolhido a olho:
//   - a volta do pescoco nasce em RAIO_GOLA_ALTA + SOBRA_ACESSORIO;
//   - o que desce pelo peito nasce em frentePeito(), que e a superficie da
//     peca MAIS LARGA do catalogo (FOLGA_LARGA) + SOBRA_ACESSORIO.
// O preco disso e a corrente ficar ~8 mm solta num pescoco nu â€” que e como
// corrente se comporta mesmo. O contrario (colar colado na pele) some dentro
// de metade do guarda-roupa, e foi o bug que o dono reclamou.

export const R_CORRENTE = RAIO_GOLA_ALTA + SOBRA_ACESSORIO

/** Z da frente do peito POR FORA da peca mais larga, na altura y do peito. */
export function frentePeito(c, y) {
  return (raioPerfil(c.perfil.PEITO, y) * FOLGA_LARGA + SOBRA_ACESSORIO) * c.medida.FLAT_Z
}

export function corrente(mat, t = 0.005, y = 0.052) {
  const a = anel(R_CORRENTE + t, t, mat, 6, 20)
  a.rotation.x = Math.PI / 2
  a.scale.z = 0.95
  // 5 cm acima da base do pescoco: a lathe do peito sobe ate +0.040 aqui, e
  // qualquer coisa abaixo disso fica ENTERRADA no torax
  a.position.y = y
  return a
}

/** Fio + corpo do pingente descendo POR FORA do peito ate a altura yPeito. */
export function pingente(c, g, mat, corpo, yPeito = 0.135) {
  const yn = yPeito - c.medida.NECK_Y
  const z = frentePeito(c, yPeito)
  const y0 = 0.046, z0 = 0.060
  const dy = yn - y0, dz = z - z0
  const fio = tubo(0.0035, 0.0035, Math.hypot(dy, dz), mat, 6)
  fio.position.set(0, (y0 + yn) / 2, (z0 + z) / 2)
  fio.rotation.x = Math.atan2(-dz, -dy)
  g.add(fio)
  corpo.position.set(0, yn, z)
  g.add(corpo)
}


// ===========================================================================
// ANEIS â€” ancora: handL (a mao ESQUERDA)
// ===========================================================================
// Espaco da mao: pulso na origem, dedos descendo em -Y. Na mao esquerda os
// dedos se curvam pra +X, entao o aro entra deslocado e INCLINADO nesse
// sentido â€” aro deitado no plano do chao cortava o dedo em diagonal e afundava
// de um lado so.

/** Centro do aro no dedo pedido (anelar por padrao), no espaco do pulso. */
export function posDedo(c, o = {}) {
  const D = o.dedo !== undefined
    ? { x: 0, y: c.medida.DEDOS[o.dedo].y - 0.014, z: c.medida.DEDOS[o.dedo].z }
    : (c.medida.DEDO_ANELAR || { x: 0, y: -0.092, z: -0.010 })
  // 1.8 mm pro lado da palma: e quanto o dedo ja andou em X 1.4 cm abaixo do no
  return { x: D.x + 0.0018, y: D.y + (o.dy || 0), z: D.z }
}

export function aro(c, mat, o = {}) {
  const p = posDedo(c, o)
  // O raio interno tem que passar do raio do dedo VISTO NO PLANO DO ARO: o
  // dedo tem 9.6 mm no eixo largo e ainda entra inclinado, o que da 10.0 mm
  // aparentes. Com os 8.6 mm da versao antiga o aro afundava na carne.
  const r = o.r === undefined ? 0.0130 : o.r
  const t = o.t === undefined ? 0.0026 : o.t
  const a = anel(r, t, mat, 6, 14)
  a.rotation.set(Math.PI / 2, INCLINA_DEDO, 0)
  a.position.set(p.x, p.y, p.z)
  return a
}

/** Ponto no DORSO da mao esquerda, na altura do aro (a palma olha pra +X). */
export function dorso(a, dist) {
  return { x: a.position.x - dist, y: a.position.y, z: a.position.z }
}


// ===========================================================================
// TATUAGENS â€” pele com desenho, nao geometria nova
// ===========================================================================
// Casca fininha por cima do membro com textura de canvas transparente. Fica
// mais barato e mais flexivel que pintar um mapa novo pra cada tom de pele:
// a tinta e a mesma, a pele por baixo continua sendo a do personagem.

export const LADO_TATU = 128        // o sistema de coordenadas em que os desenhos foram feitos

export function tintaMat(id, desenho, voltas = 1) {
  // A textura sai em 192 (com alphaTest a borda do recorte e dura, e a escada
  // de 128 px aparecia na pele agora que o traco engrossou), mas o desenho
  // continua sendo feito no quadro de 128: as figuras posicionam tudo em
  // PIXEL FIXO - 'const y = 34 + i * 58' -, entao passar 192 pra elas empurra
  // a arte toda pro canto de cima e deixa metade da faixa em branco. Foi o que
  // aconteceu na primeira tentativa: a tatuagem de pescoco sumiu da pele.
  // g.scale leva o traco junto, entao a grossura relativa nao muda.
  // `voltas` existe por causa da geometria: a faixa e um CILINDRO e a camera
  // ve no maximo um terco da volta. Um desenho de figura unica (o escorpiao, a
  // ancora) tem uma chance em tres de estar virado pro lado certo, e nas outras
  // duas a tatuagem "nao aparece" - foi assim que ela chegou na tela do dono do
  // projeto. Com duas voltas sempre ha uma figura de frente, e a figura fica
  // espremida na textura na mesma proporcao em que a volta a estica de volta na
  // pele, entao o bicho nao sai achatado. Banda continua (tribal, arame) fica
  // em uma volta so: repetir um padrao que ja se repete nao muda nada.
  const map = tex('tatu:' + id + (voltas > 1 ? 'x' + voltas : ''), 192, (g, s) => {
    const k = s / LADO_TATU
    for (let i = 0; i < voltas; i++) {
      g.save()
      g.translate((s * i) / voltas, 0)
      g.scale(k / voltas, k)
      desenho(g, LADO_TATU)
      g.restore()
    }
  }, 1)
  // alphaTest em vez de transparent: recorte por descarte de pixel nao entra na
  // fila de transparencia, entao a tinta nunca aparece por cima do braco errado
  return stdMat('tatu-mat:' + id + ':' + voltas, {
    map, transparent: false, alphaTest: 0.4, roughness: 0.95, metalness: 0,
    side: THREE.DoubleSide,
  })
}

/**
 * A TINTA E O TAMANHO DELA.
 *
 * A queixa foi "algumas tatuagens nao estao mostrando no corpo e nao estao com
 * um devido destaque", e fotografando o boneco de perto da pra ver por que: o
 * desenho e pintado num quadrado de textura que depois se enrola em volta do
 * braco. A circunferencia do braco tem 30 cm e so um terco dela olha pra
 * camera, entao um traco de 7 px do desenho chega na tela com ~1,5 cm - do
 * tamanho de um arranhao. A tatuagem de PEITO, que e chapa e nao rolo, sempre
 * apareceu bem; as de membro e que sumiam.
 *
 * Duas correcoes, as duas globais pra nao ter que reequilibrar dez desenhos:
 *  - GROSSO engorda todo traco do setor de tatuagem de uma vez;
 *  - a tinta passa a ser OPACA. A 0.92 ela ja clareava sobre pele clara, e
 *    sobre os tons escuros do catalogo virava um borrao do mesmo tom da pele.
 */
export const GROSSO = 1.75
export const TINTA = 'rgba(20,18,30,1)'

/** Faixa tribal: o desenho tem que ler a 3 m, entao tracos grossos. */

export function faixaMembro(mat, r, h, seg = 14, rTopo = r) {
  return malha(new THREE.CylinderGeometry(rTopo, r, h, seg, 1, true), mat)
}

/**
 * Setor de casca que acompanha o CONE do peito.
 *
 * Sai da FATIA do perfil, como casca(), e nao de um cone entre as duas pontas.
 * Entre y = 0.10 e y = 0.20 o torax e CONVEXO (engorda ate 0.144 em y = 0.095 e
 * so depois afina pro pescoco), entao a corda reta que ligava so o topo e a
 * base passava ate 1,9 cm POR DENTRO da pele no meio do caminho: a tatuagem de
 * peito nao ficava "flutuando", ela sumia inteira e sobrava um aro fino nas
 * duas bordas. Guardar os vertices do meio e a mesma correcao que fatia() ja
 * fazia na barra da camiseta.
 */
export function chapaPeito(c, mat, y0, y1, arco = 1.0, seg = 10) {
  // 0.99 do perfil contra os 0.965 da pele: 2,5% em cima de um raio de 14 cm
  // da 3,5 mm, que sobra ate da CRISTA do poligono de 24 lados do tronco.
  const p = fatia(c.perfil.PEITO, y0, y1).map((q) => [q[0] * 0.99, q[1]])
  const g = revolver(p, seg, c.medida.FLAT_Z, -arco / 2, arco)
  // A LatheGeometry reparte o v pelo INDICE do ponto do perfil, e a fatia tem
  // os pontos em alturas irregulares (0.140, 0.175, 0.196...): sem corrigir, a
  // caveira sai amassada em cima e esticada embaixo. Aqui o v volta a ser
  // proporcional ao y, que e como o cilindro de antes mapeava.
  const pos = g.attributes.position, uv = g.attributes.uv
  for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - y0) / (y1 - y0))
  uv.needsUpdate = true
  return sh(new THREE.Mesh(g, mat))
}


// ===========================================================================
// RELOGIOS â€” ancora: armLLower (o PULSO esquerdo, y = -FORE_ARM)
// ===========================================================================
// Preso no antebraco e nao na mao: relogio na junta da mao gira junto com ela
// e escorrega pro meio da palma quando o punho dobra.
//
// POR QUE ELE APARECE POR CIMA DA MANGA: nao aparece â€” a manga e que morre
// antes dele. Toda manga comprida do catalogo termina MANGA_FIM_Y (4,5 cm)
// acima do pulso e o relogio mora 2,8 cm acima do pulso, no antebraco nu. A
// alternativa (manga ate a mao + pulseira de raio maior que o pano) daria uma
// pulseira 1 cm solta no braco de quem esta de camiseta, e relogio frouxo le
// pior que relogio coberto.

// O antebraco tem raio 0.041. A pulseira e um pouco MENOR que ele de proposito:
// o braco atravessa o furo e so a casca de fora aparece, que e o que se ve de
// uma pulseira no pulso. Com raio 0.045 e tubo 0.009 virava um aro de basquete.
export function pulseira(c, mat, r = 0.038, t = 0.0070) {
  const a = anel(r, t, mat, 6, 16)
  a.rotation.x = Math.PI / 2
  a.position.y = -c.medida.FORE_ARM + 0.028
  return a
}

/** Caixa do relogio nas COSTAS do pulso esquerdo (lado -X). */
export function mostrador(c, geo, mat, dist = 0.043) {
  const m = sh(new THREE.Mesh(geo, mat))
  m.position.set(-dist, -c.medida.FORE_ARM + 0.028, 0)
  m.rotation.z = Math.PI / 2
  return m
}

