import * as THREE from 'three'

// ---------------------------------------------------------------------------
// CLIMA — chuva suave.
//
// A chuva NAO cai no mapa inteiro: cai numa caixa que anda junto com quem ve.
// Fora dessa caixa ninguem enxergaria a gota mesmo, entao pagar por ela seria
// desenhar o que nao aparece. A caixa se move por WRAP: quando a gota sai por
// um lado, ela reentra pelo lado oposto -- assim o volume acompanha a camera
// sem nunca precisar recriar nada.
//
// Zero alocacao por quadro: as posicoes moram em Float32Array pre-alocados e
// so sao reescritas. Nada de new dentro de atualizar().
//
// Nao existe chuva na rede: o contrato (REDE.md) nao tem pacote de clima, e o
// visual de efeito e sempre 100% local (mesma regra do feixe do anel). Cada
// maquina desenha a propria chuva; quem chamar setChuva decide a forca.
// ---------------------------------------------------------------------------

// --- numeros do clima ------------------------------------------------------
const MAX_GOTAS = 1500      // teto do pool; a intensidade so muda quantas usam
const RAIO = 12             // meia-largura da caixa de chuva (m)
const TOPO = 12             // altura do topo da caixa acima dos pes (m)
const FUNDO = -2.0          // abaixo dos pes: cobre quem esta em ponte/telhado
const ALTURA = TOPO - FUNDO
const VEL_MIN = 7.0         // m/s. Chuva mansa cai devagar; tempestade nao.
const VEL_MAX = 10.5
const RISCO_MIN = 0.26      // comprimento do risco (m)
const RISCO_MAX = 0.46
const VENTO_X = 0.9         // deriva lateral leve: a gota nao cai a prumo
const VENTO_Z = 0.45
const MAX_RESPINGOS = 56    // aneis no chao vivos ao mesmo tempo
const RESPINGO_VIDA = 0.55  // segundos que o anel leva pra crescer e sumir
const RESPINGO_RAIO = 8     // os respingos so aparecem perto (senao viram sujeira)

// Cinza-chumbo pro qual a neblina puxa quando chove forte. Nao e preto: fog
// preto de dia vira mancha, e a ideia e dessaturar, nao apagar.
const CINZA_CHUVA = new THREE.Color(0x87909a)

/** Textura do respingo: anel macio, desenhado uma vez. Sem asset externo. */
function texturaRespingo() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  g.clearRect(0, 0, 64, 64)
  // dois aros concentricos com borda esfumacada: de longe le como onda,
  // de perto nao mostra a aresta do poligono
  const grd = g.createRadialGradient(32, 32, 18, 32, 32, 31)
  grd.addColorStop(0.0, 'rgba(255,255,255,0)')
  grd.addColorStop(0.55, 'rgba(228,240,248,0.85)')
  grd.addColorStop(1.0, 'rgba(228,240,248,0)')
  g.fillStyle = grd
  g.beginPath(); g.arc(32, 32, 31, 0, 7); g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * @param {object} dep
 * @param dep.scene    cena (usada so pra ler/ajustar a fog)
 * @param dep.camera   quem ve: a caixa de chuva e centrada nela
 * @param dep.renderer opcional; sem ele a exposicao nao e mexida
 * @param dep.groundY  opcional, (x,z)->altura do chao pros respingos
 * @param dep.inicial  opcional, forca inicial 0..1 (padrao: chuva mansa)
 */
export function criarClima({ scene, camera, renderer, groundY, inicial } = {}) {
  const chaoEm = typeof groundY === 'function' ? groundY : null

  const grupo = new THREE.Group()
  grupo.name = 'clima'

  // =========================================================================
  // 1. AS GOTAS — um unico LineSegments de riscos finos
  // =========================================================================
  // Por que linha e nao Points: a gota de chuva vista de perto e um RISCO
  // vertical, nao um ponto redondo. Com Points seria preciso uma textura e um
  // sprite por gota; com LineSegments sao 2 vertices e uma draw call so.
  const posGotas = new Float32Array(MAX_GOTAS * 2 * 3)
  const geoGotas = new THREE.BufferGeometry()
  geoGotas.setAttribute('position', new THREE.BufferAttribute(posGotas, 3))
  geoGotas.setDrawRange(0, 0)

  const matGotas = new THREE.LineBasicMaterial({
    color: 0xdce8f2,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,   // gota nao tapa gota: sem isso vira grade preta
    fog: true,           // a chuva longe some junto com o resto: da profundidade
  })
  const gotas = new THREE.LineSegments(geoGotas, matGotas)
  // A caixa anda todo quadro; deixar o three recalcular bounding sphere seria
  // pagar por um culling que nunca vai cortar nada (a caixa cerca a camera).
  gotas.frustumCulled = false
  gotas.castShadow = false
  gotas.receiveShadow = false
  gotas.renderOrder = 6
  grupo.add(gotas)

  // Estado de cada gota, tudo em arrays planos (zero objeto por gota).
  const gx = new Float32Array(MAX_GOTAS)
  const gy = new Float32Array(MAX_GOTAS)
  const gz = new Float32Array(MAX_GOTAS)
  const gv = new Float32Array(MAX_GOTAS)   // velocidade de queda
  const gl = new Float32Array(MAX_GOTAS)   // comprimento do risco

  /** Sorteia uma gota nova. cx/cz = centro da caixa; alto = nascer no topo. */
  function semear(i, cx, cz, cy, alto) {
    gx[i] = cx + (Math.random() * 2 - 1) * RAIO
    gz[i] = cz + (Math.random() * 2 - 1) * RAIO
    gy[i] = cy + (alto ? TOPO - Math.random() * 1.5 : FUNDO + Math.random() * ALTURA)
    gv[i] = VEL_MIN + Math.random() * (VEL_MAX - VEL_MIN)
    gl[i] = RISCO_MIN + Math.random() * (RISCO_MAX - RISCO_MIN)
  }
  for (let i = 0; i < MAX_GOTAS; i++) semear(i, 0, 0, 0, false)

  // =========================================================================
  // 2. OS RESPINGOS — aneis que crescem e somem no chao
  // =========================================================================
  const texResp = texturaRespingo()
  const matResp = new THREE.MeshBasicMaterial({
    map: texResp,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,  // com a cor da instancia indo a preto,
    fog: false,                        // o aditivo some sozinho: e o fade
  })
  const geoResp = new THREE.PlaneGeometry(1, 1)
  geoResp.rotateX(-Math.PI / 2)        // deitado no chao ja na geometria
  const respingos = new THREE.InstancedMesh(geoResp, matResp, MAX_RESPINGOS)
  respingos.frustumCulled = false
  respingos.castShadow = false
  respingos.receiveShadow = false
  respingos.renderOrder = 5
  respingos.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  grupo.add(respingos)

  const rt = new Float32Array(MAX_RESPINGOS)    // tempo de vida restante
  const rx = new Float32Array(MAX_RESPINGOS)
  const ry = new Float32Array(MAX_RESPINGOS)
  const rz = new Float32Array(MAX_RESPINGOS)
  const _m4 = new THREE.Matrix4()
  const _cor = new THREE.Color()
  // Instancia morta e escondida encolhendo a matriz a zero: e mais barato do
  // que remontar o InstancedMesh com uma contagem diferente todo quadro.
  const _zero = new THREE.Matrix4().makeScale(0, 0, 0)
  for (let i = 0; i < MAX_RESPINGOS; i++) {
    respingos.setMatrixAt(i, _zero)
    respingos.setColorAt(i, _cor.setRGB(0, 0, 0))
  }
  let proxResp = 0
  let acumResp = 0

  // =========================================================================
  // 3. AMBIENTE — escurecer e dessaturar sem tocar em lighting.js
  // =========================================================================
  // lighting.js reescreve fog e exposicao TODO quadro a partir do ciclo de dia.
  // Entao nao da pra guardar um "valor original" na criacao: ele muda sozinho.
  // A saida e tratar o clima como filtro: se o valor de agora nao e o que eu
  // escrevi no quadro passado, foi o lighting que mexeu -- essa e a base nova.
  // Isso faz o modulo funcionar depois do lighting no laco e, se um dia rodar
  // antes, no maximo nao surtir efeito (nunca acumular escuridao).
  let temBase = false
  let baseDens = 0, baseExp = 1
  const baseCor = new THREE.Color()
  let escritoDens = -1

  function restaurarAmbiente() {
    if (!temBase) return
    if (scene && scene.fog) {
      scene.fog.density = baseDens
      scene.fog.color.copy(baseCor)
    }
    if (renderer) renderer.toneMappingExposure = baseExp
    temBase = false
    escritoDens = -1
  }

  function aplicarAmbiente(i) {
    const f = scene && scene.fog
    if (!f) return
    if (!temBase || Math.abs(f.density - escritoDens) > 1e-7) {
      baseDens = f.density
      baseCor.copy(f.color)
      baseExp = renderer ? renderer.toneMappingExposure : 1
      temBase = true
    }
    if (i <= 0.002) { restaurarAmbiente(); return }
    // neblina mais fechada + puxada pro cinza = dessaturacao do fundo inteiro
    f.density = baseDens * (1 + 1.05 * i)
    f.color.copy(baseCor).lerp(CINZA_CHUVA, 0.5 * i)
    escritoDens = f.density
    // exposicao um pouco abaixo: dia de chuva e dia sem sol, nao dia com filtro
    if (renderer) renderer.toneMappingExposure = baseExp * (1 - 0.18 * i)
  }

  // =========================================================================
  // 4. ATUALIZACAO
  // =========================================================================
  let forca = 0                                   // valor visto agora
  let alvo = typeof inicial === 'number' ? Math.min(1, Math.max(0, inicial)) : 0.55
  forca = alvo                                    // comeca ja no valor pedido
  let ativas = 0
  let primeiro = true

  // pos e a posicao do jogador (pes). O centro da caixa e a CAMERA: quem ve e
  // ela, e em 3a pessoa ela fica 4 m atras do boneco.
  function atualizar(dt, pos) {
    // transicao macia: ligar/desligar chuva no talo pisca a tela inteira
    if (forca !== alvo) {
      const passo = dt * 0.5
      forca = forca < alvo ? Math.min(alvo, forca + passo) : Math.max(alvo, forca - passo)
    }

    if (forca <= 0.002) {
      if (grupo.visible) {
        // desligar de vez: fora da tela, sem draw range e sem filtro de fog.
        // Os aneis vivos precisam MORRER aqui, senao ficariam congelados no
        // chao esperando um atualizarRespingos que nunca mais vai rodar.
        grupo.visible = false
        geoGotas.setDrawRange(0, 0)
        for (let i = 0; i < MAX_RESPINGOS; i++) {
          rt[i] = 0
          respingos.setMatrixAt(i, _zero)
        }
        respingos.instanceMatrix.needsUpdate = true
        restaurarAmbiente()
      }
      return
    }
    grupo.visible = true

    const cx = camera ? camera.position.x : (pos ? pos.x : 0)
    const cz = camera ? camera.position.z : (pos ? pos.z : 0)
    // O chao de referencia sao os PES do jogador: e onde a gota deve morrer.
    const cy = pos ? pos.y : 0

    // quantas gotas estao vivas. Curva ^0.75: com pouca chuva ainda da pra ler
    // que esta chovendo, e no maximo nao vira cortina.
    const quer = Math.round(MAX_GOTAS * Math.pow(forca, 0.75))
    if (primeiro) {
      // primeira vez: espalha por toda a altura, senao a chuva "cai do teto"
      for (let i = 0; i < MAX_GOTAS; i++) semear(i, cx, cz, cy, false)
      primeiro = false
    } else if (quer > ativas) {
      // gota nova entra pelo topo: aparecer no meio do ar denuncia o truque
      for (let i = ativas; i < quer; i++) semear(i, cx, cz, cy, true)
    }
    ativas = quer

    const limite = cy + FUNDO
    const dx = VENTO_X * dt
    const dz = VENTO_Z * dt
    let podeRespingar = acumResp > 0

    for (let i = 0; i < ativas; i++) {
      let x = gx[i] + dx
      let z = gz[i] + dz
      let y = gy[i] - gv[i] * dt

      // WRAP horizontal: a caixa "anda" com a camera sem nenhuma realocacao
      const ox = x - cx
      if (ox > RAIO) x -= RAIO * 2
      else if (ox < -RAIO) x += RAIO * 2
      const oz = z - cz
      if (oz > RAIO) z -= RAIO * 2
      else if (oz < -RAIO) z += RAIO * 2

      if (y < limite) {
        // bateu no chao: respinga (as vezes) e volta pro topo em outro lugar
        if (podeRespingar) {
          const ddx = x - cx, ddz = z - cz
          if (ddx * ddx + ddz * ddz < RESPINGO_RAIO * RESPINGO_RAIO) {
            nascerRespingo(x, z, cy)
            acumResp -= 1
            podeRespingar = acumResp > 0
          }
        }
        semear(i, cx, cz, cy, true)
        x = gx[i]; y = gy[i]; z = gz[i]
      }
      gx[i] = x; gy[i] = y; gz[i] = z

      // o risco aponta pra tras no sentido da queda (inclui a deriva do vento)
      const len = gl[i]
      const k = len / gv[i]
      const o = i * 6
      posGotas[o] = x
      posGotas[o + 1] = y
      posGotas[o + 2] = z
      posGotas[o + 3] = x - VENTO_X * k
      posGotas[o + 4] = y + len
      posGotas[o + 5] = z - VENTO_Z * k
    }

    geoGotas.setDrawRange(0, ativas * 2)
    geoGotas.attributes.position.needsUpdate = true
    // fino e quase transparente: a regra e nao atrapalhar a visao
    matGotas.opacity = 0.15 + 0.19 * forca

    // orcamento de respingos por segundo (o loop acima gasta esse credito)
    acumResp = Math.min(12, acumResp + dt * (18 + 42 * forca))

    atualizarRespingos(dt)
    aplicarAmbiente(forca)
  }

  function nascerRespingo(x, z, cy) {
    const i = proxResp
    proxResp = (proxResp + 1) % MAX_RESPINGOS
    rx[i] = x
    rz[i] = z
    // 5 cm e nao 1: groundY() devolve o NIVEL logico (0 na rua), mas o asfalto
    // e a pintura de faixa ficam ate 4.6 cm acima dele. Colado no nivel logico
    // o anel nascia DENTRO do asfalto e o teste de profundidade o apagava.
    ry[i] = (chaoEm ? chaoEm(x, z) : cy) + 0.05
    rt[i] = RESPINGO_VIDA
  }

  function atualizarRespingos(dt) {
    let algum = false
    for (let i = 0; i < MAX_RESPINGOS; i++) {
      if (rt[i] <= 0) continue
      rt[i] -= dt
      const u = 1 - Math.max(0, rt[i]) / RESPINGO_VIDA   // 0..1 da vida
      if (rt[i] <= 0) {
        respingos.setMatrixAt(i, _zero)
        respingos.setColorAt(i, _cor.setRGB(0, 0, 0))
        algum = true
        continue
      }
      // cresce rapido e apaga devagar: e assim que uma onda de agua se le
      const s = 0.14 + u * 0.86
      const a = (1 - u) * (1 - u) * 1.25
      _m4.makeScale(s, 1, s)
      _m4.setPosition(rx[i], ry[i], rz[i])
      respingos.setMatrixAt(i, _m4)
      respingos.setColorAt(i, _cor.setRGB(a, a * 1.02, a * 1.06))
      algum = true
    }
    if (algum) {
      respingos.instanceMatrix.needsUpdate = true
      if (respingos.instanceColor) respingos.instanceColor.needsUpdate = true
    }
  }

  // =========================================================================
  // 5. API
  // =========================================================================
  /** 0 = seco (custo zero), 1 = chuva no maximo. Transicao e suavizada. */
  function setChuva(v) {
    const n = typeof v === 'number' && isFinite(v) ? v : 0
    alvo = Math.min(1, Math.max(0, n))
  }

  function dispose() {
    restaurarAmbiente()
    if (grupo.parent) grupo.parent.remove(grupo)
    geoGotas.dispose()
    matGotas.dispose()
    geoResp.dispose()
    matResp.dispose()
    texResp.dispose()
    respingos.dispose()
  }

  return {
    grupo,
    atualizar,
    setChuva,
    dispose,
    get chuva() { return forca },
  }
}
