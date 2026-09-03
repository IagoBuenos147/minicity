import * as THREE from 'three'
import { solid, stdMat, glass, box, cyl } from '../world/materials.js'
import { geoGelo } from '../mobilia/utensilios.js'

// ---------------------------------------------------------------------------
// src/bar/liquidificador.js — O LIQUIDIFICADOR DO BAR.
//
// O pedido: "bater no liquidificador". O gesto e MARTELAR O BOTAO — clique
// rapido — e o que ele produz e uma transformacao visivel: fruta e gelo
// inteiros viram pure, e a cor do pure e a mistura das cores do que entrou.
//
// A DECISAO QUE MANDA NO ARQUIVO: O CONTEUDO TEM DOIS ESTADOS E UM ENTRE.
//
//   inteiro   pedacos soltos boiando (uma InstancedMesh de 10 cacos)
//   pure      um lathe de liquido grosso, como o dos copos
//
// e `progresso` de 0 a 1 faz um virar o outro: os cacos ENCOLHEM e AFUNDAM
// enquanto o volume do pure SOBE. Fazer os dois ao mesmo tempo e o que vende a
// transformacao — trocar um pelo outro num quadro so le como bug de textura.
//
// O COPO E DE VIDRO E TEM BICO. O bico (a boca puxada pra um lado) e a unica
// coisa que faz um cilindro de vidro ler como copo de liquidificador em vez de
// jarra, e ele nao pode sair de um lathe (lathe e simetrico). Sai de um
// DESLOCAMENTO dos vertices do topo numa direcao so, aplicado depois do torno —
// mesmo truque de quadrar() em mobilia/bebidas.js, com outra funcao.
//
// O TREMOR E DO COPO, NAO DA BASE. Motor de liquidificador sacode o copo e a
// base fica firme no balcao (ela tem pe de borracha). Sacudir a peca inteira
// deixa o movel parecendo solto no chao.
//
// Escala real: 42 cm de altura total, base em y=0, centrado em x/z.
// ---------------------------------------------------------------------------

const M = {
  get baseMetal() { return solid(0xb0b6bc, 0.34, 0.80) },
  get basePreta() { return solid(0x1c1e22, 0.56, 0.10) },
  get borracha() { return solid(0x141519, 0.96, 0.0) },
  get cromo() { return solid(0xd4dade, 0.22, 0.90) },
  get lamina() { return solid(0xc8ced4, 0.24, 0.88) },
  // vidro do copo: mais opaco que o de garrafa e menos que o de copo de bar.
  // Ele precisa deixar o pure ler inteiro por tras e ainda assim EXISTIR vazio.
  get vidro() { return glass(0xdff0f4, 0.22) },
  get vidroGrosso() {
    return stdMat('liq-vidro-grosso', {
      color: 0xd0e4ea, transparent: true, opacity: 0.40, roughness: 0.10,
      metalness: 0.0, side: THREE.DoubleSide, depthWrite: false,
    })
  },
  get tampaBorracha() { return solid(0x24262b, 0.88, 0.02) },
  polpa(cor) {
    return stdMat('liq-polpa:' + cor, {
      color: cor, roughness: 0.72, metalness: 0.0,
      transparent: true, opacity: 0.94, side: THREE.DoubleSide,
      // pure devolve luz pelo volume: e o mesmo emissivo fraco do liquido dos
      // copos, e sem ele a mistura le como massa de modelar
      emissive: cor, emissiveIntensity: 0.10,
    })
  },
  caco(cor) { return solid(cor, 0.66, 0.0) },
}

// Perfil do copo, do fundo pra boca. [raio, altura] — a mesma convencao de
// mobilia/copos.js, e a mesma razao pra o contorno subir por fora e descer por
// dentro: parede de espessura zero denuncia a peca de perto.
const COPO = {
  h: 0.230, parede: 0.0035, fundo: 0.016,
  pontos: [[0, 0.0620], [0.008, 0.0625], [0.090, 0.0700], [0.160, 0.0760], [0.230, 0.0800]],
}

function raioEm(y) {
  const p = COPO.pontos
  if (y <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][0]) {
      const t = (y - p[i - 1][0]) / Math.max(1e-6, p[i][0] - p[i - 1][0])
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t
    }
  }
  return p[p.length - 1][1]
}
function raioDentro(y) { return Math.max(0.004, raioEm(y) - COPO.parede) }

/**
 * O BICO. Empurra os vertices do topo do copo na direcao +Z, com forca que cai
 * a zero em 90 graus pra cada lado e some abaixo de `yDe`. Duas rampas:
 * uma angular e uma vertical, e as duas sao necessarias — sem a vertical o
 * copo inteiro fica torto, sem a angular a boca vira um oval.
 */
function bicar(geo, yDe, yAte, forca) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 1e-6 || y < yDe) continue
    const kv = Math.min(1, (y - yDe) / Math.max(1e-6, yAte - yDe))
    const dir = z / r                              // 1 na frente, -1 atras
    const ka = Math.max(0, dir)
    p.setZ(i, z + forca * kv * kv * ka * ka)
  }
  p.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

const N_CACO = 10

export function criarLiquidificador(opts = {}) {
  const corBase = opts.cor !== undefined ? opts.cor : 0x1c1e22

  const g = new THREE.Group()
  g.name = 'liquidificador'
  // o copo treme, a tampa sobe e o conteudo muda: nada aqui vai pro forno
  g.userData.noBake = true

  // =========================================================================
  // A BASE (o motor)
  // =========================================================================
  const yBase = 0.150
  const base = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000), new THREE.Vector2(0.0700, 0.0000),
    new THREE.Vector2(0.0730, 0.0060), new THREE.Vector2(0.0740, 0.0300),
    new THREE.Vector2(0.0700, 0.0900), new THREE.Vector2(0.0640, 0.1300),
    new THREE.Vector2(0.0600, 0.1450), new THREE.Vector2(0.0480, 0.1500),
    new THREE.Vector2(0.0000, 0.1505),
  ], 24), solid(corBase, 0.56, 0.10))
  base.castShadow = true
  base.receiveShadow = true
  g.add(base)

  // a faixa de metal escovado em volta do motor: e ela que diz "isto e um
  // aparelho" e nao um vaso preto
  const faixa = cyl(0.0745, 0.0742, 0.048, M.baseMetal, 24)
  faixa.position.y = 0.052
  faixa.castShadow = true
  g.add(faixa)

  // pes de borracha
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const pe = cyl(0.010, 0.012, 0.006, M.borracha, 8)
    pe.position.set(Math.cos(a) * 0.052, 0.003, Math.sin(a) * 0.052)
    pe.castShadow = false
    g.add(pe)
  }

  // --- O BOTAO. E ele que se martela, entao ele afunda de verdade. ----------
  const botaoPivo = new THREE.Group()
  botaoPivo.position.set(0, 0.072, 0.0742)
  g.add(botaoPivo)
  const botao = cyl(0.0165, 0.0165, 0.014, solid(0xd0342c, 0.48, 0.04), 16)
  botao.rotation.x = Math.PI / 2
  botao.castShadow = false
  botaoPivo.add(botao)
  const aroBotao = new THREE.Mesh(new THREE.TorusGeometry(0.0185, 0.0026, 6, 18), M.baseMetal)
  aroBotao.castShadow = false
  botaoPivo.add(aroBotao)

  // as duas chavinhas de velocidade, so de enfeite (a peca precisa parecer ter
  // controles; o gesto e um so)
  for (const s of [-1, 1]) {
    const ch = box(0.014, 0.008, 0.006, M.baseMetal, s * 0.036, 0.048, 0.0730)
    ch.castShadow = false
    g.add(ch)
  }

  // =========================================================================
  // O COPO — vive num grupo proprio, porque ele TREME
  // =========================================================================
  const jarra = new THREE.Group()
  jarra.position.y = yBase
  g.add(jarra)

  const pts = []
  pts.push(new THREE.Vector2(0, 0))
  for (const p of COPO.pontos) pts.push(new THREE.Vector2(p[1], p[0]))
  pts.push(new THREE.Vector2(raioEm(COPO.h) - COPO.parede * 0.4, COPO.h + 0.0015))
  pts.push(new THREE.Vector2(raioDentro(COPO.h), COPO.h - 0.0012))
  for (let i = COPO.pontos.length - 2; i >= 1; i--) {
    pts.push(new THREE.Vector2(raioDentro(COPO.pontos[i][0]), Math.max(COPO.fundo, COPO.pontos[i][0])))
  }
  pts.push(new THREE.Vector2(raioDentro(COPO.fundo), COPO.fundo))
  pts.push(new THREE.Vector2(0, COPO.fundo))
  const copoGeo = new THREE.LatheGeometry(pts, 26)
  bicar(copoGeo, COPO.h * 0.80, COPO.h, 0.022)
  const copo = new THREE.Mesh(copoGeo, M.vidro)
  copo.castShadow = true
  copo.receiveShadow = true
  jarra.add(copo)

  // A ASA: meio torus achatado, do lado oposto ao bico. Um copo de
  // liquidificador sem asa le como jarra de suco.
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.010, 8, 18, Math.PI * 1.05), M.basePreta)
  asa.rotation.set(0, Math.PI / 2, -Math.PI * 0.56)
  asa.position.set(0, 0.130, -0.080)
  asa.scale.set(1, 1, 0.72)
  asa.castShadow = true
  jarra.add(asa)

  // colar de metal na base do copo (onde ele rosqueia no motor)
  const colar = cyl(0.0640, 0.0640, 0.020, M.baseMetal, 22)
  colar.position.y = 0.008
  jarra.add(colar)

  // A LAMINA: uma cruz de quatro paletas tortas. Quatro caixas finas com giro
  // proprio — nao vale InstancedMesh por quatro, e elas GIRAM juntas.
  const laminaG = new THREE.Group()
  laminaG.position.y = 0.026
  jarra.add(laminaG)
  laminaG.add(cyl(0.0075, 0.0090, 0.024, M.cromo, 10))
  for (let i = 0; i < 4; i++) {
    const pa = box(0.052, 0.0016, 0.010, M.lamina, 0, 0.004 + (i % 2) * 0.008, 0)
    pa.rotation.set(i % 2 ? 0.38 : -0.38, (i / 4) * Math.PI * 2, 0)
    pa.castShadow = false
    laminaG.add(pa)
  }

  // --- a tampa --------------------------------------------------------------
  const tampa = new THREE.Group()
  tampa.position.y = COPO.h
  jarra.add(tampa)
  const tampaCorpo = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0.0000, 0.0000), new THREE.Vector2(0.0760, 0.0000),
    new THREE.Vector2(0.0830, 0.0060), new THREE.Vector2(0.0820, 0.0170),
    new THREE.Vector2(0.0700, 0.0230), new THREE.Vector2(0.0300, 0.0270),
    new THREE.Vector2(0.0230, 0.0290), new THREE.Vector2(0.0000, 0.0295),
  ], 24), M.tampaBorracha)
  tampaCorpo.castShadow = true
  tampa.add(tampaCorpo)
  // o tampinho do meio (por onde se joga coisa com o motor ligado)
  const tampinha = cyl(0.0230, 0.0250, 0.020, solid(0x34373d, 0.60, 0.04), 16)
  tampinha.position.y = 0.032
  tampa.add(tampinha)

  // =========================================================================
  // O CONTEUDO
  // =========================================================================
  //
  // Dois objetos que se revezam por `progresso` (ver o cabecalho): os CACOS
  // (fruta e gelo inteiros) e o PURE.

  const cacos = new THREE.InstancedMesh(geoGelo(), M.caco(0xe8ad3a), N_CACO)
  cacos.visible = false
  cacos.castShadow = false
  cacos.frustumCulled = false
  cacos.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  jarra.add(cacos)
  const dadosCaco = []
  for (let i = 0; i < N_CACO; i++) {
    const a = i * 2.399
    dadosCaco.push({
      a, r: Math.sqrt((i + 0.3) / N_CACO) * 0.044,
      y: 0.030 + (i % 4) * 0.020,
      tam: 0.75 + (i % 3) * 0.30,
      giro: (i % 5) * 0.7,
    })
  }
  const _m = new THREE.Matrix4()
  const _e = new THREE.Euler()
  const _qq = new THREE.Quaternion()
  const _v3 = new THREE.Vector3()

  let pure = null
  let matPure = M.polpa(0xe8ad3a)

  /** Lathe do pure entre o fundo e `topo` — mesma tecnica de copos.js. */
  function geoPure(topo) {
    const base0 = COPO.fundo + 0.001
    const alto = Math.max(base0 + 0.002, topo)
    const p = [new THREE.Vector2(0, base0)]
    for (let i = 0; i <= 6; i++) {
      const y = base0 + (alto - base0) * (i / 6)
      p.push(new THREE.Vector2(raioDentro(y) - 0.0008, y))
    }
    p.push(new THREE.Vector2(0, alto))
    return new THREE.LatheGeometry(p, 22)
  }

  // =========================================================================
  // ESTADO
  // =========================================================================
  let nivel = 0            // 0 a 1: quanto do copo esta ocupado
  let nivelDesenhado = -1
  let progresso = 0        // 0 inteiro, 1 pure
  let corMistura = 0xe8ad3a
  let ligado = 0           // 0 a 1: quanto o motor esta rodando AGORA
  let giro = 0
  let tremorK = 0
  let botaoK = 0
  let t = 0
  let aberturaAlvo = 1, abertura = 1

  function pintarPure() {
    if (nivel <= 0.005) {
      if (pure) pure.visible = false
      return
    }
    const topo = COPO.fundo + (COPO.h - 0.012 - COPO.fundo) * nivel * (0.55 + 0.45 * progresso)
    if (!pure) {
      pure = new THREE.Mesh(geoPure(topo), matPure)
      pure.castShadow = false
      jarra.add(pure)
    } else if (Math.abs(nivel - nivelDesenhado) > 0.012 || nivelDesenhado < 0) {
      pure.geometry.dispose()
      pure.geometry = geoPure(topo)
    }
    nivelDesenhado = nivel
    pure.visible = true
    // o pure so aparece de verdade depois que a batida comecou: antes disso o
    // que ha no copo sao os cacos e um dedo de suco no fundo
    pure.material = matPure
    matPure.opacity = 0.55 + 0.40 * progresso
  }

  const api = {
    grupo: g,
    jarra,
    get progresso() { return progresso },
    get nivel() { return nivel },
    get tampada() { return abertura < 0.06 },
    /** Onde se despeja dentro, em coordenadas LOCAIS do grupo. */
    bocaLocal: new THREE.Vector3(0, yBase + COPO.h + 0.010, 0),
    /** O bico, de onde o pure sai pro copo. Tambem local. */
    bicoLocal: new THREE.Vector3(0, yBase + COPO.h - 0.004, 0.098),

    tampar(v) { aberturaAlvo = v ? 0 : 1 },
    tamparJa(v) { aberturaAlvo = v ? 0 : 1; abertura = aberturaAlvo },

    /**
     * O que tem dentro. `n` de 0 a 1 e o volume; `cor` e a mistura ja calculada
     * por bar/receitas.js (este arquivo nao sabe somar cor de ingrediente).
     */
    setConteudo(n, cor, cacosVisiveis) {
      nivel = Math.max(0, Math.min(1, n || 0))
      if (typeof cor === 'number' && cor !== corMistura) {
        corMistura = cor
        matPure = M.polpa(cor)
        cacos.material = M.caco(cor)
      }
      const k = Math.max(0, Math.min(N_CACO, cacosVisiveis === undefined ? Math.round(nivel * N_CACO) : cacosVisiveis | 0))
      cacos.count = k
      cacos.visible = k > 0 && progresso < 0.98
      nivelDesenhado = -1
      pintarPure()
    },

    /** 0 inteiro, 1 pure. Quem sobe isto e o gesto de martelar o botao. */
    setProgresso(k) {
      const kk = Math.max(0, Math.min(1, k || 0))
      if (Math.abs(kk - progresso) < 0.004) return
      progresso = kk
      cacos.visible = cacos.count > 0 && progresso < 0.98
      nivelDesenhado = -1
      pintarPure()
    },

    /** Liga o motor NESTE quadro. Chamar todo quadro enquanto o botao esta em uso. */
    acionar(forca) {
      ligado = Math.max(ligado, Math.max(0, Math.min(1, forca === undefined ? 1 : forca)))
      botaoK = 1
    },

    /** Quanto o motor esta rodando agora — quem toca o som usa isto. */
    get rotacao() { return ligado },

    atualizar(dt) {
      const d = Math.min(Math.max(dt || 0, 0), 0.05)
      t += d

      abertura += (aberturaAlvo - abertura) * (1 - Math.exp(-15 * d))
      tampa.position.y = COPO.h + abertura * 0.062
      tampa.rotation.z = abertura * 0.26

      // o botao volta sozinho
      botaoK = Math.max(0, botaoK - d * 7)
      botaoPivo.position.z = 0.0742 - botaoK * 0.0045

      // o motor DESACELERA sozinho: o gesto e martelar, e entre dois cliques o
      // liquidificador tem que perder forca, senao um clique so ja bastava
      ligado = Math.max(0, ligado - d * 2.6)

      // a lamina gira com a forca do motor
      giro += (18 + ligado * 130) * d * (ligado > 0.02 ? 1 : 0)
      laminaG.rotation.y = giro

      // O TREMOR E DO COPO. Duas senoides de frequencia irracional entre si:
      // uma senoide so le como oscilacao de desenho animado.
      tremorK += (ligado - tremorK) * (1 - Math.exp(-16 * d))
      if (tremorK > 0.004) {
        const a = tremorK * 0.0026
        jarra.position.set(
          Math.sin(t * 71) * a,
          yBase + Math.abs(Math.sin(t * 113)) * a * 0.7,
          Math.sin(t * 89 + 1.1) * a,
        )
        jarra.rotation.set(Math.sin(t * 97) * tremorK * 0.014, 0, Math.sin(t * 83) * tremorK * 0.016)
      } else if (jarra.position.x !== 0) {
        jarra.position.set(0, yBase, 0)
        jarra.rotation.set(0, 0, 0)
      }

      // --- os cacos ----------------------------------------------------------
      if (cacos.visible) {
        for (let i = 0; i < cacos.count; i++) {
          const c = dadosCaco[i]
          // com o motor ligado eles RODOPIAM e AFUNDAM; parados, so boiam
          const w = t * (0.6 + ligado * 9) + c.a
          const raio = c.r * (1 - progresso * 0.55) * (1 + ligado * 0.20)
          const y = c.y * (1 - progresso * 0.72) + 0.012
          const e = c.tam * (1 - progresso) * 0.9
          _e.set(w * 0.8 + c.giro, w, w * 0.5)
          _qq.setFromEuler(_e)
          _v3.set(Math.cos(w) * raio, y, Math.sin(w) * raio)
          _m.compose(_v3, _qq, { x: e, y: e, z: e })
          cacos.setMatrixAt(i, _m)
        }
        cacos.instanceMatrix.needsUpdate = true
      }
      return true
    },

    dispose() {
      if (pure) pure.geometry.dispose()
      copoGeo.dispose()
    },
  }

  api.tamparJa(false)
  return api
}

export default criarLiquidificador
