import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Pecas visuais do anel verde. Ficam aqui pra anel.js cuidar so de estado e
// rede, e nao virar um arquivo de 2000 linhas.
//
// Duas decisoes valem pra TODO este arquivo:
//
// 1) NADA aqui aloca por frame. Toda geometria e todo material nascem uma vez
//    e depois so tem atributo atualizado (needsUpdate). O jogo roda a 84 fps e
//    o pedido e nao cair de 60: alocar Float32Array por frame joga o coletor
//    de lixo no meio do loop e produz exatamente o engasgo que queremos evitar.
//
// 2) Tudo e aditivo (AdditiveBlending) com depthWrite:false. Luz nao tapa luz;
//    escrever profundidade faria o feixe recortar as particulas em quadrados.
//    Por isso tambem frustumCulled = false: a geometria muda todo frame e a
//    esfera de corte que o three calculou no nascimento estaria sempre errada.
// ---------------------------------------------------------------------------

export const COR_NUCLEO = 0xd9ffe9   // quase branco: o miolo do feixe
export const COR_VERDE = 0x3dff9a    // o verde do anel
export const COR_FUNDO = 0x0f8f52    // verde escuro: a ponta que morre no ar

// --- textura de fagulha ------------------------------------------------------
// Um ponto quadrado entrega na hora que e um sprite. Um degrade radial desenhado
// em canvas (sem asset externo, como manda a arquitetura) some nas bordas e
// vira luz. E uma textura so, compartilhada por todos os sistemas de particula.
let _texFagulha = null
export function texturaFagulha() {
  if (_texFagulha) return _texFagulha
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0.00, 'rgba(255,255,255,1)')
  grd.addColorStop(0.22, 'rgba(205,255,228,0.88)')
  grd.addColorStop(0.55, 'rgba(70,255,160,0.26)')
  grd.addColorStop(1.00, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  _texFagulha = t
  return t
}

function matFagulha(tamanho) {
  return new THREE.PointsMaterial({
    map: texturaFagulha(),
    size: tamanho,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    fog: false,             // no aditivo a neblina SOMA a cor do ceu: apaga o efeito
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  })
}

/** Points com n particulas, cor por vertice (a cor E o brilho no aditivo). */
function criarPontos(n, tamanho) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  const p = new THREE.Points(geo, matFagulha(tamanho))
  p.frustumCulled = false
  p.renderOrder = 3
  return p
}

// ============================================================================
// TUBO DEFORMAVEL — a base do feixe
// ============================================================================
// Um TubeGeometry novo por quadro seria o caminho obvio e o errado: ele
// reconstroi indice, uv e normal toda vez. Aqui o indice e o uv sao fixos (a
// topologia nunca muda) e so posicao e normal viajam pra GPU.

function geometriaTubo(seg, rad) {
  const nv = (seg + 1) * (rad + 1)
  const geo = new THREE.BufferGeometry()
  const uv = new Float32Array(nv * 2)
  for (let i = 0; i <= seg; i++) {
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j
      uv[k * 2] = i / seg          // u: 0 no anel, 1 no objeto (o sentido da energia)
      uv[k * 2 + 1] = j / rad
    }
  }
  const idx = []
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b = a + rad + 1, c = b + 1, d = a + 1
      idx.push(a, b, d, b, c, d)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  return geo
}

const _p = new THREE.Vector3()
const _t = new THREE.Vector3()
const _n = new THREE.Vector3()
const _b = new THREE.Vector3()
const _ref = new THREE.Vector3()

/**
 * Recalcula o tubo em cima da curva. r0 e o raio no anel, r1 no objeto — r1
 * menor que r0 e o que faz o "cone que afina ate o objeto" do pedido.
 * O referencial de cada anel do tubo vem de um vetor de referencia unico pro
 * feixe inteiro (nao de Frenet): a curva e curta e quase reta, e Frenet vira
 * de cabeca pra baixo em trechos retos, o que faria a textura girar sozinha.
 */
function atualizarTubo(geo, curva, seg, rad, r0, r1) {
  const pos = geo.attributes.position.array
  const nor = geo.attributes.normal.array
  curva.getTangent(0.5, _t).normalize()
  _ref.set(0, 1, 0)
  if (Math.abs(_t.dot(_ref)) > 0.9) _ref.set(1, 0, 0)  // olhando pra cima: troca o eixo

  for (let i = 0; i <= seg; i++) {
    const u = i / seg
    curva.getPoint(u, _p)
    curva.getTangent(u, _t).normalize()
    _n.copy(_ref).addScaledVector(_t, -_ref.dot(_t))
    if (_n.lengthSq() < 1e-8) _n.set(_t.z, _t.x, _t.y)
    _n.normalize()
    _b.crossVectors(_t, _n)
    // suavestep no afinamento: um cone linear parece um funil de papel
    const k = u * u * (3 - 2 * u)
    const r = r0 + (r1 - r0) * k
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2
      const ca = Math.cos(a), sa = Math.sin(a)
      const o = (i * (rad + 1) + j) * 3
      const nx = _n.x * ca + _b.x * sa
      const ny = _n.y * ca + _b.y * sa
      const nz = _n.z * ca + _b.z * sa
      nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz
      pos[o] = _p.x + nx * r
      pos[o + 1] = _p.y + ny * r
      pos[o + 2] = _p.z + nz * r
    }
  }
  geo.attributes.position.needsUpdate = true
  geo.attributes.normal.needsUpdate = true
}

// --- shader do feixe ---------------------------------------------------------
// Por que shader e nao textura rolando: precisamos de TRES coisas somadas no
// mesmo pixel — energia correndo pro objeto, o fresnel que deixa o tubo oco
// (senao parece um cano de plastico), e um pulso que desce o feixe no agarrar.
// Com um mapa animado daria pra fazer so a primeira.

const VS_FEIXE = `
varying vec2 vUv;
varying vec3 vNor;
varying vec3 vVis;
void main() {
  vUv = uv;
  vNor = normalMatrix * normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vVis = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const FS_FEIXE = `
uniform float uTempo;
uniform float uOpacidade;
uniform float uPulso;      // 0..1 = onde o pulso esta; fora disso, sem pulso
uniform float uVel;        // velocidade da energia correndo por dentro
uniform float uFaixas;
uniform vec3 uCorA;        // cor no anel
uniform vec3 uCorB;        // cor no objeto
varying vec2 vUv;
varying vec3 vNor;
varying vec3 vVis;

void main() {
  // 1) casca: quanto mais de raspao a normal, mais brilha. E isso que faz o
  //    tubo virar um cone OCO de luz em vez de um cilindro solido.
  float fres = 1.0 - abs(dot(normalize(vNor), normalize(vVis)));
  fres = pow(clamp(fres, 0.0, 1.0), 1.7);

  // 2) energia: u cresce do anel (0) ao objeto (1), entao subtrair o tempo faz
  //    as faixas andarem NO SENTIDO DO OBJETO.
  float f = fract(vUv.x * uFaixas - uTempo * uVel);
  float energia = smoothstep(0.45, 1.0, f);

  // 3) pulso do agarrar: um aro brilhante descendo o feixe
  float pulso = 1.0 - smoothstep(0.0, 0.13, abs(vUv.x - uPulso));
  pulso *= step(0.0, uPulso) * step(uPulso, 1.0);

  // a ponta que morre no ar perde forca; a que encosta no objeto ganha
  float ponta = mix(0.55, 1.0, vUv.x);

  vec3 cor = mix(uCorA, uCorB, vUv.x) * (0.65 + energia * 0.9 + pulso * 2.2);
  float a = (fres * 0.62 + energia * 0.42 + pulso * 1.5) * ponta * uOpacidade;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(cor, a);
}
`

function matFeixe(corA, corB, faixas, vel) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTempo: { value: 0 },
      uOpacidade: { value: 0 },
      uPulso: { value: -1 },
      uVel: { value: vel },
      uFaixas: { value: faixas },
      uCorA: { value: new THREE.Color(corA) },
      uCorB: { value: new THREE.Color(corB) },
    },
    vertexShader: VS_FEIXE,
    fragmentShader: FS_FEIXE,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

/**
 * O feixe: dois tubos (casca larga + miolo fino) sobre a MESMA curva, mais as
 * particulas que sobem por dentro. Dois tubos e nao um porque o miolo precisa
 * de outra escala de faixa pra parecer que a energia corre em camadas.
 *
 * atualizar(origem, destino, dt, tempo) reconstroi a curva do quadro.
 */
export function criarFeixe(scene) {
  const SEG = 22, RAD = 8
  const N_FAG = 22

  const curva = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3())

  const geoCasca = geometriaTubo(SEG, RAD)
  const geoMiolo = geometriaTubo(SEG, RAD)
  const matCasca = matFeixe(COR_VERDE, COR_NUCLEO, 3.0, 1.35)
  const matMiolo = matFeixe(COR_NUCLEO, COR_NUCLEO, 6.0, 2.4)

  const casca = new THREE.Mesh(geoCasca, matCasca)
  const miolo = new THREE.Mesh(geoMiolo, matMiolo)
  for (const m of [casca, miolo]) { m.frustumCulled = false; m.renderOrder = 2; m.visible = false }

  // fagulhas viajando ao longo do feixe
  const fag = criarPontos(N_FAG, 0.15)
  fag.visible = false
  const fase = new Float32Array(N_FAG)
  const raio = new Float32Array(N_FAG)
  const giro = new Float32Array(N_FAG)
  for (let i = 0; i < N_FAG; i++) {
    fase[i] = Math.random()
    raio[i] = 0.25 + Math.random() * 0.75
    giro[i] = Math.random() * Math.PI * 2
  }

  scene.add(casca, miolo, fag)

  let opacidade = 0        // opacidade atual (sobe/desce sozinha)
  let alvoOpacidade = 0
  let pulso = -1           // posicao do pulso; -1 = sem pulso
  let estalo = 0           // clarao curto do arremesso
  let vivo = false

  const _dir = new THREE.Vector3()
  const _mid = new THREE.Vector3()
  const _lat = new THREE.Vector3()
  const _cima = new THREE.Vector3()

  function ligar() { vivo = true; alvoOpacidade = 1 }
  function desligar() { alvoOpacidade = 0 }
  function dispararPulso() { pulso = 0 }
  function dispararEstalo() { estalo = 1 }

  function atualizar(origem, destino, dt, tempo) {
    // opacidade sempre anda, mesmo com o feixe apagando, senao ele some seco
    const vel = alvoOpacidade > opacidade ? 14 : 5
    opacidade += (alvoOpacidade - opacidade) * Math.min(1, dt * vel)
    if (opacidade < 0.01 && alvoOpacidade === 0) {
      if (vivo) { vivo = false; casca.visible = miolo.visible = fag.visible = false }
      return
    }
    if (!origem || !destino) return

    casca.visible = miolo.visible = fag.visible = true

    // --- curva do quadro ---------------------------------------------------
    // O ponto de controle sai do meio do segmento pra um lado, oscilando: e a
    // "leve curva" pedida. Sem isso o feixe e uma reta e parece um laser.
    _dir.subVectors(destino, origem)
    const dist = Math.max(0.001, _dir.length())
    _dir.divideScalar(dist)
    _cima.set(0, 1, 0)
    _lat.crossVectors(_dir, _cima)
    if (_lat.lengthSq() < 1e-6) _lat.set(1, 0, 0)
    _lat.normalize()
    _cima.crossVectors(_lat, _dir).normalize()
    const amp = Math.min(0.42, dist * 0.11)
    _mid.copy(origem).addScaledVector(_dir, dist * 0.5)
      .addScaledVector(_lat, Math.sin(tempo * 1.7) * amp)
      .addScaledVector(_cima, 0.35 * amp + Math.sin(tempo * 1.15 + 1.3) * amp * 0.7)

    curva.v0.copy(origem)
    curva.v1.copy(_mid)
    curva.v2.copy(destino)

    // raio da boca do anel proporcional a distancia, mas com teto: de perto um
    // cone gigante engole a tela
    const r0 = Math.min(0.20, 0.075 + dist * 0.022)
    atualizarTubo(geoCasca, curva, SEG, RAD, r0, 0.045)
    atualizarTubo(geoMiolo, curva, SEG, RAD, r0 * 0.34, 0.016)

    // --- uniforms ----------------------------------------------------------
    if (pulso >= 0) { pulso += dt * 3.6; if (pulso > 1.25) pulso = -1 }
    if (estalo > 0) estalo = Math.max(0, estalo - dt * 4.5)
    const op = opacidade * (1 + estalo * 2.4)
    matCasca.uniforms.uTempo.value = tempo
    matMiolo.uniforms.uTempo.value = tempo
    matCasca.uniforms.uOpacidade.value = op
    matMiolo.uniforms.uOpacidade.value = op * 0.95
    matCasca.uniforms.uPulso.value = pulso
    matMiolo.uniforms.uPulso.value = pulso

    // --- fagulhas ao longo do feixe ---------------------------------------
    const pa = fag.geometry.attributes.position.array
    const ca = fag.geometry.attributes.color.array
    for (let i = 0; i < N_FAG; i++) {
      fase[i] += dt * (0.45 + raio[i] * 0.35)
      if (fase[i] > 1) fase[i] -= 1
      const u = fase[i]
      curva.getPoint(u, _p)
      // espalha em volta do eixo, apertando junto com o cone
      const rr = (1 - u * 0.82) * raio[i] * r0 * 1.5
      const a = giro[i] + tempo * 2.1
      const k = i * 3
      pa[k] = _p.x + (_lat.x * Math.cos(a) + _cima.x * Math.sin(a)) * rr
      pa[k + 1] = _p.y + (_lat.y * Math.cos(a) + _cima.y * Math.sin(a)) * rr
      pa[k + 2] = _p.z + (_lat.z * Math.cos(a) + _cima.z * Math.sin(a)) * rr
      // acende no meio do caminho e apaga nas pontas
      const b = Math.sin(u * Math.PI) * op
      ca[k] = 0.55 * b; ca[k + 1] = 1.0 * b; ca[k + 2] = 0.72 * b
    }
    fag.geometry.attributes.position.needsUpdate = true
    fag.geometry.attributes.color.needsUpdate = true
  }

  function dispose() {
    scene.remove(casca, miolo, fag)
    geoCasca.dispose(); geoMiolo.dispose(); fag.geometry.dispose()
    matCasca.dispose(); matMiolo.dispose(); fag.material.dispose()
  }

  return { ligar, desligar, dispararPulso, dispararEstalo, atualizar, dispose,
    get ativo() { return vivo } }
}

// ============================================================================
// CONTORNO — o aviso verde antes de agarrar
// ============================================================================
// Escolha: CLONE COM BackSide E ESCALA 1.04, e nao fresnel por shader.
// Motivo: os objetos agarraveis usam os materiais compartilhados do cache de
// materials.js. Um fresnel exigiria trocar (ou onBeforeCompile) o material de
// cada alvo, e esse material e o MESMO objeto usado por dezenas de props da
// cidade — mexer nele acenderia meio quarteirao. O clone BackSide nao encosta
// no material do alvo: e uma casca por fora, com depthTest ligado, entao o
// corpo do objeto tapa a frente da casca e sobra exatamente a borda.
// Custo: 1 draw call, geometria emprestada (nunca clonada, nunca liberada).
export function criarContorno(scene, cor, ordem) {
  const geoVazia = new THREE.BufferGeometry()
  const mat = new THREE.MeshBasicMaterial({
    color: cor,
    side: THREE.BackSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geoVazia, mat)
  mesh.matrixAutoUpdate = false
  mesh.frustumCulled = false
  mesh.renderOrder = ordem || 2
  mesh.visible = false
  scene.add(mesh)

  const _e = new THREE.Vector3()

  /** alvo precisa ser um Mesh com geometria; escala tipica 1.04. */
  function mostrar(alvo, opacidade, escala) {
    if (!alvo || !alvo.geometry) { esconder(); return }
    mesh.geometry = alvo.geometry
    alvo.updateWorldMatrix(true, false)
    const s = escala || 1.04
    mesh.matrix.copy(alvo.matrixWorld).scale(_e.set(s, s, s))
    mat.opacity = opacidade
    mesh.visible = opacidade > 0.004
  }

  function esconder() { mesh.visible = false }

  function dispose() {
    scene.remove(mesh)
    mesh.geometry = geoVazia   // devolve a geometria emprestada antes de soltar
    geoVazia.dispose()
    mat.dispose()
  }

  return { mostrar, esconder, dispose }
}

// ============================================================================
// CLARAO — o estouro de luz do agarrar e do destruir
// ============================================================================
// Um plano com a fagulha, virado pra camera todo quadro. Sprite faria o mesmo,
// mas Sprite tem custo de matriz proprio e aqui basta copiar a rotacao da camera.
export function criarClarao(scene, camera) {
  const geo = new THREE.PlaneGeometry(1, 1)
  const mat = new THREE.MeshBasicMaterial({
    map: texturaFagulha(), color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 4
  mesh.visible = false
  scene.add(mesh)

  let t = 0, dur = 0.3, tam = 1

  function disparar(pos, tamanho, duracao) {
    mesh.position.copy(pos)
    tam = tamanho || 1.6
    dur = duracao || 0.3
    t = 0
    mesh.visible = true
  }

  function atualizar(dt) {
    if (!mesh.visible) return
    t += dt
    const k = t / dur
    if (k >= 1) { mesh.visible = false; return }
    // estoura rapido e apaga devagar
    const abre = 1 - Math.pow(1 - k, 3)
    const s = tam * (0.35 + abre * 0.95)
    mesh.scale.set(s, s, s)
    mat.opacity = Math.pow(1 - k, 1.8)
    mesh.quaternion.copy(camera.quaternion)
  }

  function dispose() { scene.remove(mesh); geo.dispose(); mat.dispose() }

  return { disparar, atualizar, dispose }
}

// ============================================================================
// ANEL DE CHOQUE — sai do anel no arremesso
// ============================================================================
export function criarAnelDeChoque(scene, cor) {
  const geo = new THREE.RingGeometry(0.42, 0.5, 44, 1)
  const mat = new THREE.MeshBasicMaterial({
    color: cor, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = 3
  mesh.visible = false
  scene.add(mesh)

  let t = 0
  const DUR = 0.42
  const _olhar = new THREE.Vector3()

  /** direcao = pra onde o anel "aponta" (o eixo do arremesso). */
  function disparar(pos, direcao) {
    mesh.position.copy(pos)
    _olhar.copy(pos).add(direcao)
    mesh.lookAt(_olhar)
    t = 0
    mesh.visible = true
  }

  function atualizar(dt) {
    if (!mesh.visible) return
    t += dt
    const k = t / DUR
    if (k >= 1) { mesh.visible = false; return }
    const s = 0.35 + k * 4.2
    mesh.scale.set(s, s, 1)
    mat.opacity = (1 - k) * (1 - k) * 0.9
  }

  function dispose() { scene.remove(mesh); geo.dispose(); mat.dispose() }

  return { disparar, atualizar, dispose }
}

// ============================================================================
// QUEBRA — o objeto arrebentando ao colidir
// ============================================================================
// Pedacos solidos (que a luz pega) + uma nuvem de fagulha (que so brilha).
// Pool fixo: disparar de novo REINICIA o mesmo pool. Dois objetos quebrando no
// mesmo quadro e raro o bastante pra nao valer o custo de varios pools.
export function criarQuebra(scene) {
  const N = 16
  const N_NUVEM = 22
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const pedacos = []
  const vel = []
  const rot = []

  for (let i = 0; i < N; i++) {
    // material por pedaco: cada um apaga no seu tempo, entao opacity e propria
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.7, metalness: 0.0,
      emissive: COR_VERDE, emissiveIntensity: 0.35,
      transparent: true, opacity: 0,
    })
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = false          // caco de 8 cm nao merece uma passada de sombra
    m.receiveShadow = false
    m.visible = false
    m.frustumCulled = false
    scene.add(m)
    pedacos.push(m)
    vel.push(new THREE.Vector3())
    rot.push(new THREE.Vector3())
  }

  const nuvem = criarPontos(N_NUVEM, 0.42)
  nuvem.visible = false
  const nvel = []
  for (let i = 0; i < N_NUVEM; i++) nvel.push(new THREE.Vector3())
  scene.add(nuvem)

  let t = 0
  const DUR = 1.15
  let ativo = false
  let chao = 0

  function disparar(pos, cor, tamanho, yChao) {
    t = 0
    ativo = true
    chao = (yChao === undefined ? pos.y - tamanho * 0.5 : yChao)
    const s = Math.max(0.06, tamanho * 0.26)
    for (let i = 0; i < N; i++) {
      const m = pedacos[i]
      m.visible = true
      m.material.color.set(cor)
      m.material.opacity = 1
      m.position.copy(pos)
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.6
      const sub = 0.35 + Math.random() * 0.9
      m.position.x += Math.cos(a) * tamanho * 0.22
      m.position.z += Math.sin(a) * tamanho * 0.22
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      const e = s * (0.55 + Math.random() * 0.9)
      m.scale.set(e, e * (0.5 + Math.random()), e * (0.6 + Math.random() * 0.7))
      vel[i].set(Math.cos(a) * (1.7 + Math.random() * 2.4), 1.4 + sub * 2.6,
        Math.sin(a) * (1.7 + Math.random() * 2.4))
      rot[i].set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12)
    }
    const pa = nuvem.geometry.attributes.position.array
    for (let i = 0; i < N_NUVEM; i++) {
      pa[i * 3] = pos.x; pa[i * 3 + 1] = pos.y; pa[i * 3 + 2] = pos.z
      const a = Math.random() * Math.PI * 2
      const el = (Math.random() - 0.3) * 1.4
      const v = 1.1 + Math.random() * 2.6
      nvel[i].set(Math.cos(a) * v, el * v * 0.8 + 1.0, Math.sin(a) * v)
    }
    nuvem.visible = true
  }

  function atualizar(dt) {
    if (!ativo) return
    t += dt
    const k = t / DUR
    if (k >= 1) {
      ativo = false
      for (const m of pedacos) m.visible = false
      nuvem.visible = false
      return
    }
    const fade = Math.pow(1 - k, 1.6)
    for (let i = 0; i < N; i++) {
      const m = pedacos[i]
      vel[i].y -= 19 * dt
      m.position.addScaledVector(vel[i], dt)
      if (m.position.y < chao) {          // quica raso e perde forca
        m.position.y = chao
        vel[i].y = Math.abs(vel[i].y) * 0.32
        vel[i].x *= 0.6; vel[i].z *= 0.6
      }
      m.rotation.x += rot[i].x * dt
      m.rotation.y += rot[i].y * dt
      m.rotation.z += rot[i].z * dt
      m.material.opacity = fade
      m.material.emissiveIntensity = 0.35 + fade * 1.2
    }
    const pa = nuvem.geometry.attributes.position.array
    const ca = nuvem.geometry.attributes.color.array
    for (let i = 0; i < N_NUVEM; i++) {
      const o = i * 3
      nvel[i].multiplyScalar(1 - Math.min(1, dt * 2.2))   // a nuvem freia no ar
      nvel[i].y -= 1.6 * dt
      pa[o] += nvel[i].x * dt
      pa[o + 1] += nvel[i].y * dt
      pa[o + 2] += nvel[i].z * dt
      const b = fade * 1.1
      ca[o] = 0.45 * b; ca[o + 1] = 1.0 * b; ca[o + 2] = 0.66 * b
    }
    nuvem.geometry.attributes.position.needsUpdate = true
    nuvem.geometry.attributes.color.needsUpdate = true
  }

  function dispose() {
    for (const m of pedacos) { scene.remove(m); m.material.dispose() }
    geo.dispose()
    scene.remove(nuvem)
    nuvem.geometry.dispose(); nuvem.material.dispose()
  }

  return { disparar, atualizar, dispose, get ativo() { return ativo } }
}

// ============================================================================
// RASTRO — a esteira verde do objeto arremessado
// ============================================================================
// Buffer circular de posicoes: nada de push/shift, o indice so gira. A cor de
// cada ponto vira o brilho (aditivo), entao o rastro apaga do fim pro comeco.
export function criarRastro(scene, n) {
  const N = n || 34
  const pontos = criarPontos(N, 0.3)
  pontos.visible = false
  scene.add(pontos)
  let cabeca = 0
  let vivos = 0
  const idade = new Float32Array(N)
  const VIDA = 0.55

  function limpar() { vivos = 0; cabeca = 0; pontos.visible = false }

  function marcar(pos) {
    const pa = pontos.geometry.attributes.position.array
    const o = cabeca * 3
    pa[o] = pos.x; pa[o + 1] = pos.y; pa[o + 2] = pos.z
    idade[cabeca] = 0
    cabeca = (cabeca + 1) % N
    if (vivos < N) vivos++
    pontos.visible = true
  }

  function atualizar(dt) {
    if (!pontos.visible) return
    const ca = pontos.geometry.attributes.color.array
    let algum = false
    for (let i = 0; i < N; i++) {
      idade[i] += dt
      const k = 1 - Math.min(1, idade[i] / VIDA)
      const b = k * k
      if (b > 0.004) algum = true
      const o = i * 3
      ca[o] = 0.4 * b; ca[o + 1] = 1.0 * b; ca[o + 2] = 0.62 * b
    }
    pontos.geometry.attributes.color.needsUpdate = true
    pontos.geometry.attributes.position.needsUpdate = true
    if (!algum) pontos.visible = false
  }

  function dispose() {
    scene.remove(pontos)
    pontos.geometry.dispose(); pontos.material.dispose()
  }

  return { marcar, atualizar, limpar, dispose }
}

// ============================================================================
// ORBITA — fagulhas girando em volta do objeto levitado (e do anel no chao)
// ============================================================================
export function criarOrbita(scene, n, tamanho) {
  const N = n || 14
  const pontos = criarPontos(N, tamanho || 0.19)
  pontos.visible = false
  scene.add(pontos)

  const fase = new Float32Array(N)
  const incl = new Float32Array(N)
  const vel = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    fase[i] = (i / N) * Math.PI * 2
    incl[i] = (Math.random() - 0.5) * 1.2
    vel[i] = 0.7 + Math.random() * 0.8
  }

  /** brilho 0 apaga o sistema inteiro sem custo de remover da cena. */
  function atualizar(dt, centro, raio, brilho, tempo) {
    if (brilho <= 0.004 || !centro) { pontos.visible = false; return }
    pontos.visible = true
    const pa = pontos.geometry.attributes.position.array
    const ca = pontos.geometry.attributes.color.array
    for (let i = 0; i < N; i++) {
      fase[i] += dt * vel[i] * 1.6
      const a = fase[i]
      const r = raio * (0.85 + Math.sin(a * 2 + i) * 0.15)
      const o = i * 3
      pa[o] = centro.x + Math.cos(a) * r
      pa[o + 1] = centro.y + Math.sin(a * 1.3 + incl[i] * 3) * raio * 0.45
        + Math.sin(tempo * 1.4 + i) * 0.03
      pa[o + 2] = centro.z + Math.sin(a) * r
      const b = brilho * (0.55 + 0.45 * Math.sin(tempo * 3 + i * 1.7))
      ca[o] = 0.42 * b; ca[o + 1] = 1.0 * b; ca[o + 2] = 0.68 * b
    }
    pontos.geometry.attributes.position.needsUpdate = true
    pontos.geometry.attributes.color.needsUpdate = true
  }

  function dispose() {
    scene.remove(pontos)
    pontos.geometry.dispose(); pontos.material.dispose()
  }

  return { atualizar, dispose }
}
