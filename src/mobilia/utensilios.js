import * as THREE from 'three'
import { solid, stdMat, glass, tex, box, cyl } from '../world/materials.js'

// ---------------------------------------------------------------------------
// src/mobilia/utensilios.js — AS FERRAMENTAS DA BANCADA.
//
// Dosador, mexedor, coador, pinca, tabua, faca, pistola de refrigerante,
// canudo, guarda-chuvinha e a pedra de gelo. Sao dez pecas pequenas e elas
// existem por uma razao so, que e a mesma do pedido do dono: o que transforma
// "escolher um drink num menu" em "fazer um drink" e ter a FERRAMENTA na tela.
// Um copo que enche sozinho e um contador; um copo que enche porque o jogador
// virou um dosador em cima dele e um gesto.
//
// TRES COISAS QUE VALEM PRA TODAS ELAS:
//
//   1. Sao vistas de PERTO. O modo barman poe a camera a vinte centimetros da
//      bancada, entao vale a mesma regra das bebidas: silhueta de torno, nunca
//      empilhamento de cilindro. Um dosador e uma ampulheta de metal, e a
//      cintura no meio e a peca inteira.
//   2. ORCAMENTO: 6 malhas cada, e nenhuma passa de 9. Elas ficam TODAS na
//      bancada ao mesmo tempo, o tempo todo.
//   3. METAL DE BAR E INOX ESCOVADO, nao cromo espelhado. Com roughness abaixo
//      de 0.2 as dez pecas viram dez espelhos e a bancada some num borrao
//      claro; 0.30 a 0.38 e a faixa em que inox continua sendo inox.
//
// Escala real em metros, cada peca EM PE com a base em y=0 — mesmo contrato de
// bebidas.js, porque quem poe utensilio na bancada e o mesmo codigo que poe
// garrafa na prateleira.
// ---------------------------------------------------------------------------

const M = {
  get inox() { return solid(0xb4bac0, 0.34, 0.80) },
  get inoxFosco() { return solid(0x9aa1a8, 0.46, 0.68) },
  get inoxEscuro() { return solid(0x6e757c, 0.42, 0.72) },
  get latao() { return solid(0xbe9a48, 0.40, 0.66) },
  get borrachaPreta() { return solid(0x17191d, 0.94, 0.02) },
  get plasticoBranco() { return solid(0xe8e6e0, 0.58, 0.02) },
  get madeiraTabua() {
    return stdMat('uten-tabua', {
      map: tex('uten-tabua-tex', 256, (g, s) => {
        g.fillStyle = '#c9a06a'
        g.fillRect(0, 0, s, s)
        // as tabuas coladas em pe (tabua de acougue): faixas verticais com tom
        // proprio, e e isso que separa tabua de bar de tabua de compensado
        const n = 7
        for (let i = 0; i < n; i++) {
          const x = (i / n) * s
          g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '90,58,26' : '226,190,140') + ',' + (0.06 + Math.random() * 0.13) + ')'
          g.fillRect(x, 0, s / n, s)
          g.fillStyle = 'rgba(60,38,16,0.45)'
          g.fillRect(x, 0, 2, s)
        }
        // as marcas de faca: riscos curtos, mais claros, cruzados
        for (let i = 0; i < 70; i++) {
          const x = Math.random() * s, y = Math.random() * s
          const l = 8 + Math.random() * 40
          g.strokeStyle = 'rgba(250,236,210,' + (0.06 + Math.random() * 0.14) + ')'
          g.lineWidth = 1
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - 0.5) * 6); g.stroke()
        }
      }),
      color: 0xd8b585, roughness: 0.86,
    })
  },
  /** Gelo: quase transparente, com um MIOLO branco por dentro (ver geoGelo). */
  get gelo() { return glass(0xd8ecf4, 0.34) },
  get geloMiolo() { return solid(0xf2fafd, 0.30, 0.0, { transparent: true, opacity: 0.55 }) },
  get palito() { return solid(0xd8c48a, 0.92) },
}

/** Perfil revolvido, do FUNDO PRA CIMA (a mesma regra de bebidas.js). */
function torno(pontos, mat, seg = 24) {
  const v = []
  for (const p of pontos) v.push(new THREE.Vector2(p[0], p[1]))
  const m = new THREE.Mesh(new THREE.LatheGeometry(v, seg), mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ===========================================================================
// 1. DOSADOR — a ampulheta de 25/50 ml
// ===========================================================================

/**
 * DUAS MALHAS, e o perfil da a peca inteira: cone de 50 ml de boca pra cima,
 * cintura de 8 mm, cone de 25 ml de boca pra baixo. O torno desce pela parede
 * INTERNA dos dois copos (o perfil dobra duas vezes), que e o que da espessura
 * ao metal — sem isso a boca do dosador e uma folha de papel de um lado so, o
 * mesmo defeito que o corpo dos copos resolve em copos.js.
 *
 * A peca fica com o copo GRANDE pra cima porque e assim que ela descansa na
 * bancada: o cone de 50 e mais largo e portanto mais estavel.
 */
export function dosador() {
  const g = new THREE.Group()
  g.name = 'dosador'
  const p = 0.0006      // espessura da chapa

  g.add(torno([
    [0.0000, 0.0000],   // fundo do cone pequeno (que esta virado pra baixo)
    [0.0135, 0.0000],
    [0.0140, 0.0012],
    [0.0092, 0.0250],   // sobe estreitando ate a cintura
    [0.0072, 0.0330],
    [0.0072, 0.0380],   // a cintura, 8 mm de altura
    [0.0110, 0.0470],
    [0.0175, 0.0640],   // abre pro copo de 50
    [0.0182, 0.0700],   // a boca
    [0.0182 - p, 0.0700 - 0.0004],
    [0.0110 - p, 0.0470],
    [0.0072 - p, 0.0380],
    [0.0072 - p, 0.0330],
    [0.0092 - p, 0.0250],
    [0.0140 - p, 0.0016],
    [0.0000, 0.0016],   // fecha o fundo por dentro
  ], M.inox, 26))

  // o filete gravado da cintura: e onde a luz do bar pega e e o que diz que a
  // peca e de metal batido e nao um cone de plastico
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.0076, 0.0011, 6, 20), M.inoxFosco)
  aro.rotation.x = Math.PI / 2
  aro.position.y = 0.0355
  aro.castShadow = false
  g.add(aro)

  return g
}

// ===========================================================================
// 2. MEXEDOR DE BAR — 30 cm de cabo torcido
// ===========================================================================

/**
 * A TORCAO E A PECA. Um mexedor de bar tem o cabo em espiral, e nao por
 * enfeite: e a espiral que faz a colher girar dentro do copo sem bater no gelo.
 * Ela sai de UMA TubeGeometry sobre uma helice — dez voltas de raio 1,2 mm.
 * Um cilindro liso no lugar dela le como haste de churrasco.
 */
export function mexedorDeBar() {
  const g = new THREE.Group()
  g.name = 'mexedor-bar'
  const alt = 0.300

  const pts = []
  const voltas = 9
  const passos = 60
  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const y = 0.020 + (alt - 0.048) * t
    const a = t * voltas * Math.PI * 2
    // a espiral so existe no MEIO do cabo: nas duas pontas ela fecha no eixo,
    // senao a colher e o disco do topo nascem tortos
    const r = 0.0013 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.06) / 0.88)))
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  const cabo = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0011, 5, false), M.inox,
  )
  cabo.castShadow = true
  g.add(cabo)

  // a colher: meia esfera achatada, virada pra cima
  const col = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 12, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), M.inox)
  col.scale.set(1, 0.62, 1)
  col.position.y = 0.0125
  col.castShadow = true
  g.add(col)

  // o disco achatado do topo (o que macera a hortela)
  const disco = cyl(0.0062, 0.0062, 0.0022, M.inox, 12)
  disco.position.y = alt - 0.014
  g.add(disco)
  g.add(cyl(0.0026, 0.0026, 0.016, M.inox, 8).translateY(alt - 0.024))

  return g
}

// ===========================================================================
// 3. COADOR DE MOLA — o disco com a espiral em volta
// ===========================================================================

export function coadorDeMola() {
  const g = new THREE.Group()
  g.name = 'coador-mola'

  // ele descansa DEITADO na bancada, entao a peca nasce deitada: o disco e um
  // cilindro raso no plano XZ
  const disco = cyl(0.0345, 0.0345, 0.0016, M.inox, 26)
  disco.position.y = 0.0035
  disco.castShadow = true
  g.add(disco)

  // OS FUROS sao uma InstancedMesh de 19 cilindros ESCUROS afundados 0,2 mm no
  // disco. Furo de verdade pediria booleana; furo pintado de escuro a esta
  // escala e indistinguivel, e custa uma malha em vez de dezenove.
  const nf = 19
  const furos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.0018, 6), M.inoxEscuro, nf)
  const d = new THREE.Object3D()
  let k = 0
  for (let anel = 0; anel < 3; anel++) {
    const r = anel * 0.0105
    const n = anel === 0 ? 1 : anel * 6
    for (let i = 0; i < n && k < nf; i++) {
      const a = (i / n) * Math.PI * 2
      d.position.set(Math.cos(a) * r, 0.0040, Math.sin(a) * r)
      d.updateMatrix()
      furos.setMatrixAt(k++, d.matrix)
    }
  }
  furos.count = k
  furos.instanceMatrix.needsUpdate = true
  furos.castShadow = false
  g.add(furos)

  // A MOLA: um torus grosso em volta da borda. Nao e a espiral de verdade (que
  // seria uma tube com 40 voltas), e a esta distancia a leitura e a mesma.
  const mola = new THREE.Mesh(new THREE.TorusGeometry(0.0330, 0.0028, 6, 28), M.inoxFosco)
  mola.rotation.x = Math.PI / 2
  mola.position.y = 0.0035
  mola.castShadow = false
  g.add(mola)

  // cabo e as duas orelhas que apoiam na boca da coqueteleira
  const cabo = box(0.012, 0.0035, 0.072, M.inox, 0, 0.0045, 0.060)
  cabo.castShadow = true
  g.add(cabo)
  for (const s of [-1, 1]) g.add(box(0.010, 0.0030, 0.014, M.inox, s * 0.030, 0.0045, -0.022))

  return g
}

// ===========================================================================
// 4. PINCA DE GELO — e ela ABRE
// ===========================================================================

/**
 * Duas hastes curvas presas por uma mola em U. A funcao devolve o grupo com um
 * `userData.setAbertura(k)`: 0 fechada, 1 aberta. Quem anima e o gesto do gelo.
 *
 * O PIVO DE CADA HASTE FICA NO TOPO e a haste inteira gira em torno dele — e
 * assim que uma pinca de mola funciona, e e a diferenca entre "as duas pontas
 * se afastam" (certo) e "a peca inteira escala em X" (o atalho, que estica a
 * mola junto e le como borracha).
 */
export function pincaDeGelo() {
  const g = new THREE.Group()
  g.name = 'pinca-gelo'
  const alt = 0.165

  // a mola em U que une as duas hastes, la em cima
  const u = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0018, 6, 14, Math.PI), M.inoxFosco)
  u.rotation.set(Math.PI / 2, 0, 0)
  u.position.y = alt
  u.castShadow = false
  g.add(u)

  const bracos = []
  for (const s of [-1, 1]) {
    const pivo = new THREE.Group()
    pivo.position.set(s * 0.0085, alt, 0)
    g.add(pivo)
    // haste: chapa fina que afina de cima pra baixo
    const h = box(0.0055, alt * 0.86, 0.0125, M.inox, 0, -alt * 0.43, 0)
    h.castShadow = true
    pivo.add(h)
    // a garra: uma colherzinha virada pra dentro
    const garra = new THREE.Mesh(
      new THREE.SphereGeometry(0.0105, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), M.inox,
    )
    garra.scale.set(0.9, 0.55, 1)
    garra.position.set(-s * 0.0045, -alt * 0.86, 0)
    garra.rotation.z = s * 0.30
    garra.castShadow = true
    pivo.add(garra)
    bracos.push({ pivo, s })
  }

  g.userData.setAbertura = (k) => {
    const a = Math.max(0, Math.min(1, k || 0))
    for (const b of bracos) b.pivo.rotation.z = -b.s * (0.045 + a * 0.16)
  }
  g.userData.setAbertura(0)
  return g
}

// ===========================================================================
// 5. TABUA DE CORTE E FACA
// ===========================================================================

export function tabuaDeCorte(larg, prof) {
  const L = larg || 0.34, P = prof || 0.24
  const g = new THREE.Group()
  g.name = 'tabua-corte'
  const t = box(L, 0.026, P, M.madeiraTabua, 0, 0.013, 0)
  t.castShadow = true
  t.receiveShadow = true
  g.add(t)
  // a CANALETA em volta (onde o suco corre) e uma caixa fina mais escura
  // rebaixada 1 mm — como o risco da lata em bebidas.js, e a sombra do rebaixo
  // que se ve, nao o rebaixo
  const can = box(L - 0.036, 0.0016, P - 0.036, solid(0x8a6238, 0.9), 0, 0.0258, 0)
  can.castShadow = false
  g.add(can)
  const dentro = box(L - 0.052, 0.0018, P - 0.052, M.madeiraTabua, 0, 0.0262, 0)
  dentro.castShadow = false
  g.add(dentro)
  // os pes de silicone, pra ela nao ler como uma tabua boiando
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pe = cyl(0.008, 0.008, 0.004, M.borrachaPreta, 8)
    pe.position.set(sx * (L / 2 - 0.025), 0.002, sz * (P / 2 - 0.025))
    pe.castShadow = false
    g.add(pe)
  }
  return g
}

/** Faca de bar: lamina de 14 cm, virola e cabo. Quatro malhas. */
export function facaDeBar() {
  const g = new THREE.Group()
  g.name = 'faca-bar'
  // a lamina nasce DEITADA (o gume pra baixo, a ponta pro +Z) porque e assim
  // que ela fica na tabua
  const lam = new THREE.Shape()
  lam.moveTo(0, 0)
  lam.lineTo(0.140, 0.004)
  lam.quadraticCurveTo(0.150, 0.014, 0.132, 0.026)
  lam.lineTo(0, 0.030)
  lam.closePath()
  const geo = new THREE.ExtrudeGeometry(lam, { depth: 0.0016, bevelEnabled: false })
  geo.rotateY(Math.PI / 2)
  geo.rotateZ(Math.PI / 2)
  const l = new THREE.Mesh(geo, M.inox)
  l.position.set(-0.0008, 0.004, 0.020)
  l.castShadow = true
  g.add(l)
  g.add(cyl(0.0075, 0.0075, 0.010, M.latao, 10).rotateX(Math.PI / 2).translateY(0.0))
  const cabo = box(0.017, 0.019, 0.098, M.borrachaPreta, 0, 0.010, -0.056)
  cabo.castShadow = true
  g.add(cabo)
  // o rebite do cabo
  g.add(cyl(0.0022, 0.0022, 0.020, M.latao, 6).rotateZ(Math.PI / 2).translateY(0.010).translateZ(-0.056))
  return g
}

// ===========================================================================
// 6. PISTOLA DE REFRIGERANTE
// ===========================================================================

/**
 * A CABECA COM OS BOTOES COLORIDOS e a peca. Sao seis botoes, cada um de uma
 * cor, numa InstancedMesh — e o unico jeito de dizer "isto serve seis bebidas"
 * sem escrever letra nenhuma em lugar nenhum (o que seria rotulo, e rotulo e
 * onde mora o risco de marca).
 *
 * A MANGUEIRA e uma TubeGeometry sobre uma catenaria de verdade: mangueira
 * desenhada em linha reta e a coisa que denuncia bar de videogame.
 *
 * @param cores  6 cores dos botoes, na ordem
 * @param alvo   ponto (Vector3, LOCAL) onde a mangueira termina — o suporte
 */
export function pistolaDeRefri(cores, alvo) {
  const g = new THREE.Group()
  g.name = 'pistola-refri'
  const cs = cores && cores.length >= 6 ? cores : [0x2a2a2e, 0xd8d2c4, 0xc03028, 0x2f7a3a, 0xd8901c, 0x3f5aa8]

  // corpo: um bloco arredondado de plastico preto, deitado
  const corpo = box(0.062, 0.038, 0.120, M.borrachaPreta, 0, 0.019, 0)
  corpo.castShadow = true
  g.add(corpo)
  const topo = box(0.056, 0.010, 0.110, solid(0x2a2c31, 0.62), 0, 0.041, 0)
  g.add(topo)

  // OS SEIS BOTOES, dois por fileira.
  //
  // O ESPACAMENTO E DE JOGO, NAO DE PRODUTO. Numa pistola de verdade os botoes
  // sao colados uns nos outros; aqui cada um e um ALVO CLICAVEL, e dois alvos a
  // dois centimetros um do outro viram um so na tela. Em 2,8 cm entre colunas e
  // 3,4 entre fileiras, o enquadramento da pistola separa os quatro que
  // importam com uns cem pixels de folga — que e o minimo pra apontar sem
  // pontaria. A cabeca cresceu junto pra os botoes nao saírem dela.
  const bot = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0080, 0.0080, 0.006, 10), M.plasticoBranco, 6)
  const d = new THREE.Object3D()
  // InstancedMesh nao aceita seis materiais; a cor por instancia resolve, e ela
  // e exatamente pra isto que existe
  bot.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(18), 3)
  const c = new THREE.Color()
  for (let i = 0; i < 6; i++) {
    d.position.set((i % 2 ? 1 : -1) * 0.014, 0.048, -0.034 + Math.floor(i / 2) * 0.034)
    d.updateMatrix()
    bot.setMatrixAt(i, d.matrix)
    c.setHex(cs[i])
    bot.instanceColor.setXYZ(i, c.r, c.g, c.b)
  }
  bot.instanceMatrix.needsUpdate = true
  bot.instanceColor.needsUpdate = true
  bot.castShadow = false
  g.add(bot)

  // o bico, apontando pra frente e pra baixo
  const bico = cyl(0.0055, 0.0075, 0.030, M.inox, 10)
  bico.rotation.x = 0.9
  bico.position.set(0, 0.012, 0.062)
  bico.castShadow = true
  g.add(bico)

  // a mangueira em catenaria ate o suporte
  if (alvo) {
    const a = new THREE.Vector3(0, 0.014, -0.056)
    const b = alvo.clone()
    const meio = a.clone().lerp(b, 0.5)
    meio.y -= Math.max(0.06, a.distanceTo(b) * 0.42)     // a barriga da corda
    const curva = new THREE.CatmullRomCurve3([a, meio, b])
    const mang = new THREE.Mesh(
      new THREE.TubeGeometry(curva, 16, 0.0075, 6, false), solid(0x1c1e22, 0.88),
    )
    mang.castShadow = false
    g.add(mang)
  }

  return g
}

// ===========================================================================
// 7. CANUDO, GUARDA-CHUVINHA E PEDRA DE GELO
// ===========================================================================

/** Canudo listrado: uma tube sobre a curva com a dobra no alto. */
export function canudo(cor) {
  const g = new THREE.Group()
  g.name = 'canudo'
  const c = cor === undefined ? 0xe84a6a : cor
  const mat = stdMat('uten-canudo:' + c, {
    map: tex('uten-canudo-listra:' + c, 64, (x, s) => {
      x.fillStyle = '#f4f2ec'
      x.fillRect(0, 0, s, s)
      x.strokeStyle = '#' + c.toString(16).padStart(6, '0')
      x.lineWidth = s * 0.16
      // listra EM DIAGONAL, que e como canudo listrado se enrola de verdade
      for (let i = -2; i < 6; i++) {
        x.beginPath()
        x.moveTo(i * s * 0.34, 0)
        x.lineTo(i * s * 0.34 + s * 0.5, s)
        x.stroke()
      }
    }),
    roughness: 0.52,
  })
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0.110, 0),
    new THREE.Vector3(0, 0.146, 0),
    new THREE.Vector3(0.014, 0.162, 0.004),
    new THREE.Vector3(0.036, 0.168, 0.008),
  ]
  const m = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.0035, 7, false), mat,
  )
  m.castShadow = false
  g.add(m)
  return g
}

/**
 * GUARDA-CHUVINHA. O copinho de papel e um CONE COM TEXTURA DE FATIAS: em
 * geometria seriam oito triangulos coloridos, e a UV de cone ja e radial —
 * mesma conta da rodela de citrico em frutas.js.
 */
export function sombrinha(cores) {
  const g = new THREE.Group()
  g.name = 'sombrinha'
  const cs = cores && cores.length ? cores : ['#e04a2a', '#f0c030', '#2f8f6a', '#e8e2d4']
  const mat = stdMat('uten-sombrinha:' + cs.join(','), {
    map: tex('uten-sombrinha-tex:' + cs.join(','), 128, (x, s) => {
      const c = s / 2
      x.fillStyle = cs[0]
      x.fillRect(0, 0, s, s)
      const n = 8
      for (let i = 0; i < n; i++) {
        x.fillStyle = cs[i % cs.length]
        x.beginPath()
        x.moveTo(c, c)
        x.arc(c, c, c, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2)
        x.closePath()
        x.fill()
      }
      x.strokeStyle = 'rgba(0,0,0,0.22)'
      x.lineWidth = 2
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        x.beginPath(); x.moveTo(c, c); x.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); x.stroke()
      }
    }),
    roughness: 0.86, side: THREE.DoubleSide,
  })
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.016, 16, 1, true), mat)
  cone.position.y = 0.090
  cone.castShadow = false
  g.add(cone)
  const palito = cyl(0.0011, 0.0011, 0.100, M.palito, 6)
  palito.position.y = 0.050
  g.add(palito)
  return g
}

/**
 * A PEDRA DE GELO — geometria compartilhada, porque ela aparece as dezenas.
 *
 * Um cubo com os cantos comidos e as faces afundadas: gelo de maquina nao e um
 * cubo perfeito, e um cubo perfeito e a coisa que faz gelo parecer acrilico. O
 * ruido e ESTAVEL (seno sobre a posicao), pelo mesmo motivo da espuma em
 * copos.js: vertice vizinho tem que concordar.
 *
 * A geometria e UNITARIA (2 cm de lado) e cacheada: quem usa escala.
 */
let GEO_GELO = null
export function geoGelo() {
  if (GEO_GELO) return GEO_GELO
  const g = new THREE.BoxGeometry(0.020, 0.020, 0.020, 3, 3, 3)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    // arredonda o cubo puxando cada vertice na direcao da esfera de mesmo raio
    const n = v.length() || 1
    const esf = v.clone().multiplyScalar(0.0118 / n)
    v.lerp(esf, 0.30)
    const r = 1
      + 0.030 * Math.sin(v.x * 380 + v.z * 290)
      + 0.018 * Math.sin(v.y * 610 - v.x * 470 + 1.1)
    v.multiplyScalar(r)
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  GEO_GELO = g
  return g
}

export function matGelo() { return M.gelo }
export function matGeloMiolo() { return M.geloMiolo }

/** Uma pedra solta (pro corte da tabua, pro balde, pra mao). */
export function pedraDeGelo() {
  const g = new THREE.Group()
  g.name = 'gelo'
  const c = new THREE.Mesh(geoGelo(), M.gelo)
  c.position.y = 0.010
  c.castShadow = false
  g.add(c)
  // o MIOLO BRANCO: gelo de bandeja congela do lado de fora pra dentro e o
  // centro fica opaco. E ele que faz a pedra ler como gelo e nao como vidro.
  const m = new THREE.Mesh(geoGelo(), M.geloMiolo)
  m.scale.setScalar(0.52)
  m.position.y = 0.010
  m.castShadow = false
  g.add(m)
  return g
}

// ===========================================================================
// 8. ESCORREDOR DE COPOS
// ===========================================================================

/** Grade de inox com pinos: onde os copos lavados secam de boca pra baixo. */
export function escorredorDeCopos(larg, prof) {
  const L = larg || 0.44, P = prof || 0.30
  const g = new THREE.Group()
  g.name = 'escorredor'
  const bandeja = box(L, 0.014, P, M.inoxFosco, 0, 0.007, 0)
  bandeja.receiveShadow = true
  g.add(bandeja)
  // a borda levantada
  for (const s of [-1, 1]) {
    g.add(box(L, 0.016, 0.006, M.inoxFosco, 0, 0.020, s * (P / 2 - 0.003)))
    g.add(box(0.006, 0.016, P, M.inoxFosco, s * (L / 2 - 0.003), 0.020, 0))
  }
  // os pinos, numa instanced
  const cols = Math.max(2, Math.round(L / 0.055))
  const lins = Math.max(2, Math.round(P / 0.055))
  const n = cols * lins
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0028, 0.0034, 0.032, 6), M.inox, n)
  const d = new THREE.Object3D()
  let k = 0
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < lins; j++) {
      d.position.set(
        -L / 2 + (L * (i + 0.5)) / cols,
        0.030,
        -P / 2 + (P * (j + 0.5)) / lins,
      )
      d.updateMatrix()
      im.setMatrixAt(k++, d.matrix)
    }
  }
  im.instanceMatrix.needsUpdate = true
  im.castShadow = false
  g.add(im)
  return g
}

export default {
  dosador, mexedorDeBar, coadorDeMola, pincaDeGelo, tabuaDeCorte, facaDeBar,
  pistolaDeRefri, canudo, sombrinha, pedraDeGelo, escorredorDeCopos,
  geoGelo, matGelo, matGeloMiolo,
}
