import * as THREE from 'three'
import { QUALITY } from '../config.js'

// ---------------------------------------------------------------------------
// Iluminacao do mundo: sol direcional com sombras nitidas, luz de preenchimento
// azulada (ceu), hemisferio, ambiente fraca, e um ceu em ShaderMaterial com
// gradiente, banda quente de horizonte, halo do sol, lua, estrelas e nuvens
// volumetricas em fbm que andam com o vento. Fog exponencial casa com o ceu.
//
// Ciclo de dia: t em 0..1 -> 0 amanhecer / 0.25 meio-dia / 0.5 por do sol /
// 0.75 noite. Um ciclo completo leva CYCLE_SECONDS.
// ---------------------------------------------------------------------------

const CYCLE_SECONDS = 1200         // 20 minutos por dia completo (bem lento)
// Meio da tarde: sol alto o bastante pra enxergar a cidade e ainda dar sombra
// definida. A hora dourada (0.445) e linda, mas comecar nela deixa o jogo
// escuro demais pra jogar -- ela aparece sozinha alguns minutos depois.
const START_TIME = 0.33
const SUN_DISTANCE = 140           // distancia do "sol" ate o alvo
const MAX_ELEVATION = 0.90         // ~51 graus no auge: sombras longas e legiveis
const SKY_RADIUS = 480

// Meia-largura do frustum de sombra. Com o sol rasante a mesma area de chao e
// coberta por um frustum menor (o angulo estica a projecao), entao da pra
// apertar e ganhar nitidez; com o sol a pino precisa abrir.
const SHADOW_H_LOW = 32
const SHADOW_H_HIGH = 46

// Chaves do ciclo. Toda chave define TODOS os campos pra interpolacao ser direta.
//   sun/sunI    - cor e intensidade do direcional principal
//   fill/fillI  - direcional de preenchimento (vem do lado oposto, cor do ceu)
//   zen/hor     - gradiente do ceu (zenite / horizonte)
//   glow/glowI  - banda quente de horizonte do lado do sol
//   cCover      - cobertura de nuvem (MAIOR = menos nuvem)
//   cBright/cDark - topo iluminado e barriga da nuvem
const STOPS = [
  {
    t: 0.00, sun: 0xff9d5c, sunI: 1.15, zen: 0x3f5f9c, hor: 0xffb98a,
    glow: 0xff8a4e, glowI: 0.95,
    hemiSky: 0xa8c4e6, hemiGnd: 0x6d6752, hemiI: 0.55,
    amb: 0x8fa6c8, ambI: 0.20, fill: 0x7ea2d8, fillI: 0.34,
    fogD: 0.0050, exp: 1.05, night: 0.28,
    cCover: 0.55, cBright: 0xffd6b4, cDark: 0x8e7e9e,
  },
  {
    t: 0.09, sun: 0xffe0b0, sunI: 2.35, zen: 0x3877c6, hor: 0xd2e6f6,
    glow: 0xffd3a0, glowI: 0.45,
    hemiSky: 0xbcdcff, hemiGnd: 0x7a875c, hemiI: 0.75,
    amb: 0xbcd0e8, ambI: 0.26, fill: 0x9dc4ff, fillI: 0.34,
    fogD: 0.0042, exp: 1.00, night: 0.00,
    cCover: 0.55, cBright: 0xffffff, cDark: 0xa8b6cc,
  },
  {
    t: 0.25, sun: 0xfff4e0, sunI: 3.00, zen: 0x2a63bd, hor: 0xc8dff4,
    glow: 0xffe9c8, glowI: 0.28,
    hemiSky: 0xc6e4ff, hemiGnd: 0x83905e, hemiI: 0.88,
    amb: 0xcfe0f2, ambI: 0.30, fill: 0xa8ccff, fillI: 0.30,
    fogD: 0.0034, exp: 1.02, night: 0.00,
    cCover: 0.57, cBright: 0xffffff, cDark: 0xafbcd2,
  },
  {
    t: 0.38, sun: 0xffe2b4, sunI: 2.55, zen: 0x336ebd, hor: 0xdfe2e0,
    glow: 0xffd9a2, glowI: 0.48,
    hemiSky: 0xc0dcf7, hemiGnd: 0x827a58, hemiI: 0.78,
    amb: 0xc8d6e8, ambI: 0.29, fill: 0x9fc2f5, fillI: 0.42,
    fogD: 0.0038, exp: 1.00, night: 0.00,
    cCover: 0.55, cBright: 0xfff4e6, cDark: 0xaab4c8,
  },
  {
    // hora dourada: e onde o jogo comeca
    t: 0.445, sun: 0xffb066, sunI: 2.10, zen: 0x3a6bb0, hor: 0xffcf9a,
    glow: 0xff9a52, glowI: 1.00,
    hemiSky: 0xbcd0f4, hemiGnd: 0x8a7458, hemiI: 0.80,
    amb: 0xc4b2c0, ambI: 0.30, fill: 0x86a8e8, fillI: 0.62,
    fogD: 0.0046, exp: 1.10, night: 0.05,
    cCover: 0.56, cBright: 0xffe6c6, cDark: 0xa694ae,
  },
  {
    t: 0.50, sun: 0xff7434, sunI: 1.05, zen: 0x2f4f8c, hor: 0xff8f4a,
    glow: 0xff5f2a, glowI: 1.30,
    hemiSky: 0xdcae96, hemiGnd: 0x6b5a48, hemiI: 0.64,
    amb: 0xb094a4, ambI: 0.25, fill: 0x6f8ed0, fillI: 0.58,
    fogD: 0.0052, exp: 1.10, night: 0.20,
    cCover: 0.53, cBright: 0xffbe86, cDark: 0x8c6a86,
  },
  {
    t: 0.55, sun: 0x9a7ec0, sunI: 0.30, zen: 0x1e2a4e, hor: 0x7a5a86,
    glow: 0xd06a5a, glowI: 0.60,
    hemiSky: 0x6a76a8, hemiGnd: 0x3a3646, hemiI: 0.42,
    amb: 0x6a76a8, ambI: 0.13, fill: 0x5a6cb0, fillI: 0.30,
    fogD: 0.0054, exp: 1.10, night: 0.65,
    cCover: 0.55, cBright: 0x9a7a92, cDark: 0x4a3e60,
  },
  {
    t: 0.72, sun: 0xa8bde8, sunI: 0.10, zen: 0x060a15, hor: 0x18203a,
    glow: 0x2a3050, glowI: 0.18,
    hemiSky: 0x32406a, hemiGnd: 0x171a26, hemiI: 0.40,
    amb: 0x53669a, ambI: 0.13, fill: 0x3f5288, fillI: 0.24,
    fogD: 0.0056, exp: 1.22, night: 1.00,
    cCover: 0.62, cBright: 0x3a4468, cDark: 0x181e34,
  },
  {
    t: 0.88, sun: 0xc79a86, sunI: 0.42, zen: 0x14203c, hor: 0x50507e,
    glow: 0x8a5a72, glowI: 0.48,
    hemiSky: 0x59668f, hemiGnd: 0x35333f, hemiI: 0.44,
    amb: 0x6a7396, ambI: 0.14, fill: 0x4a5c92, fillI: 0.26,
    fogD: 0.0052, exp: 1.10, night: 0.55,
    cCover: 0.56, cBright: 0x9a86a0, cDark: 0x3c3856,
  },
]

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAG = /* glsl */`
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;        // cor da banda quente do horizonte
uniform float uGlowI;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uCloudBright;
uniform vec3 uCloudDark;
uniform float uCloudCover; // limiar do fbm: MAIOR = menos nuvem
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ruido de valor com interpolacao suave (quintica) -> sem quadriculado
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 2 oitavas: so pra decidir ONDE tem campo de nuvem e onde o ceu fica aberto
float fbm2(vec2 p) {
  const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
  float v = vnoise(p) * 0.5;
  p = R * p * 2.03;
  return v + vnoise(p) * 0.25;
}

// 4 oitavas com rotacao entre elas: quebra o alinhamento aos eixos
float fbm(vec2 p) {
  const mat2 R = mat2(0.80, 0.60, -0.60, 0.80);
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = R * p * 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);

  // --- gradiente principal --------------------------------------------------
  // expoente baixo alarga a faixa clara do horizonte
  float up = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.42));
  // abaixo da linha do horizonte escurece (o chao cobre, mas evita corte duro)
  col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.25, d.y));

  // --- banda quente do horizonte -------------------------------------------
  // So do lado do sol e so coladinha na linha do horizonte: e isso que da o
  // degrade alaranjado de entardecer de verdade.
  vec2 hd = normalize(d.xz + 1e-5);
  vec2 hs = normalize(uSunDir.xz + 1e-5);
  float sunSide = pow(max(dot(hd, hs), 0.0), 2.2);
  float band = exp(-abs(d.y) * 6.5);              // decai subindo e descendo
  col += uGlow * uGlowI * band * (0.07 + 0.93 * sunSide);

  // --- espalhamento (Mie barato) -------------------------------------------
  // o lado do ceu onde o sol esta fica mais quente, mais forte perto do chao
  float cs = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(cs, 5.0) * 0.30 * (1.0 - up * 0.55);
  col += uGlow * uGlowI * pow(cs, 22.0) * 0.55;

  // --- disco do sol + halo em duas camadas ---------------------------------
  float ds = length(d - uSunDir);
  float visible = smoothstep(-0.12, 0.06, uSunDir.y);
  col += uSunColor * (1.0 - smoothstep(0.028, 0.046, ds)) * 2.6 * visible;
  col += uSunColor * exp(-ds * 22.0) * 0.85 * visible;   // halo apertado
  col += uSunColor * exp(-ds * 5.5) * 0.30 * visible;    // halo largo

  // --- lua: sempre oposta ao sol, so aparece a noite ------------------------
  float dm = length(d - uMoonDir);
  float mvis = smoothstep(-0.05, 0.10, uMoonDir.y) * uNight;
  col += vec3(0.86, 0.90, 1.0) * (1.0 - smoothstep(0.021, 0.030, dm)) * 1.5 * mvis;
  col += vec3(0.55, 0.65, 0.95) * exp(-dm * 16.0) * 0.30 * mvis;

  // --- estrelas em celulas: ponto redondo por celula sorteada ---------------
  if (uNight > 0.01 && d.y > 0.0) {
    vec3 g = d * 260.0;
    vec3 cell = floor(g);
    float r = hash31(cell);
    float dot0 = smoothstep(0.34, 0.02, length(fract(g) - 0.5));
    float tw = 0.55 + 0.45 * sin(uTime * 1.7 + r * 96.0);
    float s = step(0.9962, r) * dot0 * tw;
    col += vec3(0.92, 0.95, 1.0) * s * uNight * smoothstep(0.02, 0.30, d.y);
  }

  // --- nuvens ---------------------------------------------------------------
  // Projeta a direcao do olhar num plano alto: da perspectiva de verdade, as
  // nuvens "abrem" acima da cabeca e se achatam no horizonte.
  float fade = smoothstep(0.015, 0.20, d.y);
  if (fade > 0.002) {
    // o +0.10 limita o esticao no horizonte: sem ele a nuvem vira risco
    vec2 cuv = d.xz / (d.y + 0.10) * 2.2;
    cuv += vec2(uTime * 0.014, uTime * 0.008);   // vento (lento de proposito)
    float n = fbm(cuv);
    // campo de nuvem em baixa frequencia: cria clareira de ceu aberto em vez
    // de um chuvisco uniforme de ruido cobrindo tudo
    float clump = smoothstep(0.16, 0.46, fbm2(cuv * 0.22 + vec2(7.3, 2.1)));
    float dens = smoothstep(uCloudCover, uCloudCover + 0.20, n) * clump;

    // amostra deslocada na direcao do sol: onde o fbm sobe, a nuvem esta no
    // "topo" e recebe luz; onde desce, e barriga e fica escura.
    vec2 lo = hs * 0.55;
    float nl = fbm(cuv - lo);
    float lit = smoothstep(-0.10, 0.12, nl - n);

    vec3 cc = mix(uCloudDark, uCloudBright, lit);
    // borda incandescente perto do sol (transluminescencia dos cumulos)
    cc += uSunColor * pow(cs, 8.0) * 0.55 * (1.0 - lit) * visible;

    float alpha = dens * fade * (0.94 - uNight * 0.38);
    col = mix(col, cc, clamp(alpha, 0.0, 1.0));
  }

  // dither leve pra matar banding no gradiente
  col += (hash31(vec3(gl_FragCoord.xy, uTime)) - 0.5) * 0.008;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function createLighting(scene, renderer) {
  // --- luzes ----------------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xffb066, 2.1)
  sun.castShadow = true
  sun.shadow.mapSize.set(QUALITY.SHADOW_MAP, QUALITY.SHADOW_MAP)
  const sc = sun.shadow.camera
  sc.near = 10
  sc.far = SUN_DISTANCE + 160
  // bias em unidades de profundidade NORMALIZADA: com far-near ~ 290 m, -0.0006
  // valia 17 cm de deslocamento e descolava a sombra dos pes (peter-panning).
  sun.shadow.bias = -0.00012
  // normalBias empurra a amostra ao longo da normal: mata o acne nas paredes
  sun.shadow.normalBias = 0.028
  sun.target.position.set(0, 0, 0)
  scene.add(sun)
  scene.add(sun.target)

  // Preenchimento: direcional frio vindo mais ou menos do lado oposto ao sol.
  // Sem sombra (orcamento: so o sol projeta), so pra sombra nao virar buraco
  // preto chapado e o volume dos predios continuar legivel.
  const fill = new THREE.DirectionalLight(0x86a8e8, 0.44)
  fill.castShadow = false
  scene.add(fill)
  scene.add(fill.target)

  const hemi = new THREE.HemisphereLight(0xb8c8ee, 0x7d6a4e, 0.62)
  hemi.position.set(0, 40, 0)
  scene.add(hemi)

  const ambient = new THREE.AmbientLight(0xbdaab8, 0.22)
  scene.add(ambient)

  // --- ceu ------------------------------------------------------------------
  const skyGroup = new THREE.Group()
  skyGroup.name = 'sky'
  scene.add(skyGroup)

  const uniforms = {
    uZenith: { value: new THREE.Color(0x3a6bb0) },
    uHorizon: { value: new THREE.Color(0xffcf9a) },
    uGlow: { value: new THREE.Color(0xff9a52) },
    uGlowI: { value: 1.0 },
    uSunColor: { value: new THREE.Color(0xffb066) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.3, 0.4).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, -0.3, -0.4).normalize() },
    uCloudBright: { value: new THREE.Color(0xffd8ae) },
    uCloudDark: { value: new THREE.Color(0x9a86a0) },
    uCloudCover: { value: 0.44 },
    uNight: { value: 0 },
    uTime: { value: 0 },
  }

  const skyMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  })
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 40, 24), skyMat)
  // renderOrder ALTO (e nao baixo): o ceu desenha depois dos opacos, entao o
  // teste de profundidade descarta os pixels tapados por predio. O fbm das
  // nuvens e caro por pixel, isso economiza a tela inteira em rua fechada.
  sky.renderOrder = 1000
  sky.frustumCulled = false
  skyGroup.add(sky)

  // Grupo mantido por compatibilidade: as nuvens agora sao do shader do ceu
  // (antes eram 16 billboards, que custavam draw call e nao tinham volume).
  const clouds = new THREE.Group()
  skyGroup.add(clouds)

  // --- fog ------------------------------------------------------------------
  const fog = new THREE.FogExp2(0xffcf9a, 0.0033)
  scene.fog = fog

  if (renderer) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  const baseExposure = renderer ? (renderer.toneMappingExposure || 1) : 1

  // --- estado ---------------------------------------------------------------
  const target = new THREE.Vector3(0, 0, 0)
  const sunDir = new THREE.Vector3()
  const fillDir = new THREE.Vector3()
  const cA = new THREE.Color(), cB = new THREE.Color(), cOut = new THREE.Color()
  const fogColor = new THREE.Color()

  let time = START_TIME
  let isNight = false
  let elapsed = 0
  let shadowH = 0        // meia-largura atual do frustum de sombra

  function lerpStop(t) {
    // acha as duas chaves ao redor de t, tratando o wrap da ultima -> 1.00
    let a = STOPS[STOPS.length - 1], b = STOPS[0], span = 1 - a.t, local = 0
    if (t >= a.t) {
      local = (t - a.t) / span
    } else {
      for (let i = 0; i < STOPS.length - 1; i++) {
        if (t >= STOPS[i].t && t <= STOPS[i + 1].t) {
          a = STOPS[i]; b = STOPS[i + 1]
          span = b.t - a.t
          local = span > 0 ? (t - a.t) / span : 0
          break
        }
      }
    }
    // smoothstep deixa a transicao de cor menos "linear"
    const k = local * local * (3 - 2 * local)
    return { a, b, k }
  }

  function mixColor(out, ha, hb, k) {
    cA.setHex(ha); cB.setHex(hb)
    return out.copy(cA).lerp(cB, k)
  }

  // NUBLADO: 0 = ceu do ciclo normal, 1 = fechado de chuva. Quem manda nisso e
  // o clima (src/world/clima.js). Fica AQUI, e nao la, porque o ciclo de dia
  // reescreve ceu, sol e fog todo quadro: se a chuva escrevesse por fora, o
  // proximo apply() apagaria. Assim existe um dono so de cada valor.
  let nublado = 0

  // Paleta de dia fechado. Cinza levemente azulado, nunca preto: chuva de dia
  // e clara, o que muda e o contraste — sol quase sem direcao, nuvem cobrindo
  // tudo e neblina mais densa.
  const NUBLADO = {
    zen: 0x6f7b8c, hor: 0x9aa4ae, glow: 0x8e97a1, glowI: 0.25,
    // CUIDADO com o sentido: uCloudCover e o LIMIAR do fbm, entao numero
    // MENOR = MAIS nuvem (ver o uniforme la embaixo). Os horarios normais
    // ficam em 0.53..0.62; 0.30 fecha o ceu. Ja esteve 0.94 aqui, que e acima
    // do maximo do fbm (0.9375) e nao deixava passar NUVEM NENHUMA: dava um
    // ceu cinza liso, sem nuvem, que era o contrario do pretendido.
    cBright: 0x9aa2ac, cDark: 0x555c68, cCover: 0.30,
    hemiSky: 0x8e9aa8, hemiGnd: 0x5d5f5c, hemiI: 0.80,
    amb: 0x939aa4, ambI: 0.62,
    sunMul: 0.30, fillMul: 0.72, fogMul: 2.3, expMul: 0.80,
  }

  let targetDirty = false

  function apply() {
    const { a, b, k } = lerpStop(time)

    // direcao do sol: elevacao segue seno do ciclo, azimute gira devagar
    const ang = time * Math.PI * 2
    const elev = Math.sin(ang) * MAX_ELEVATION
    const azim = Math.PI * 0.28 + time * 0.9
    const ch = Math.cos(elev)
    sunDir.set(ch * Math.sin(azim), Math.sin(elev), ch * Math.cos(azim)).normalize()

    // --- frustum de sombra --------------------------------------------------
    // Aperta com o sol rasante, abre com o sol a pino. Quantizado em degraus de
    // 2 m pra nao remontar a matriz (e piscar a sombra) todo frame.
    const elev01 = THREE.MathUtils.clamp(sunDir.y / MAX_ELEVATION, 0, 1)
    const wantH = Math.round(THREE.MathUtils.lerp(SHADOW_H_LOW, SHADOW_H_HIGH, elev01) / 2) * 2
    if (wantH !== shadowH) {
      shadowH = wantH
      sc.left = -shadowH; sc.right = shadowH
      sc.top = shadowH; sc.bottom = -shadowH
      sc.updateProjectionMatrix()
    }

    // Alvo quantizado no grid de texels: e isso que mata o "shimmer" da borda
    // da sombra enquanto o jogador anda.
    const q = (shadowH * 2 / QUALITY.SHADOW_MAP) * 4
    const tx = Math.round(target.x / q) * q
    const tz = Math.round(target.z / q) * q
    sun.target.position.set(tx, 0, tz)
    sun.target.updateMatrixWorld()
    sun.position.set(
      tx + sunDir.x * SUN_DISTANCE,
      sunDir.y * SUN_DISTANCE,
      tz + sunDir.z * SUN_DISTANCE,
    )

    // sol some suave ao cruzar o horizonte (nada de luz vindo de baixo)
    const horizonFade = THREE.MathUtils.smoothstep(sunDir.y, -0.02, 0.10)
    mixColor(cOut, a.sun, b.sun, k)
    sun.color.copy(cOut)
    sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, k) * horizonFade
    sun.castShadow = sun.intensity > 0.05

    // preenchimento: lado oposto no plano XZ, mas puxado pra cima (a luz do ceu
    // desce). Nunca vem de baixo do chao.
    fillDir.set(-sunDir.x, 0, -sunDir.z)
    if (fillDir.lengthSq() < 1e-6) fillDir.set(0, 0, 1)
    fillDir.normalize().multiplyScalar(0.55)
    fillDir.y = 0.83
    fill.target.position.set(tx, 0, tz)
    fill.target.updateMatrixWorld()
    fill.position.set(tx + fillDir.x * 60, fillDir.y * 60, tz + fillDir.z * 60)
    mixColor(fill.color, a.fill, b.fill, k)
    fill.intensity = THREE.MathUtils.lerp(a.fillI, b.fillI, k)

    mixColor(hemi.color, a.hemiSky, b.hemiSky, k)
    mixColor(hemi.groundColor, a.hemiGnd, b.hemiGnd, k)
    hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, k)

    mixColor(ambient.color, a.amb, b.amb, k)
    ambient.intensity = THREE.MathUtils.lerp(a.ambI, b.ambI, k)

    mixColor(uniforms.uZenith.value, a.zen, b.zen, k)
    mixColor(uniforms.uHorizon.value, a.hor, b.hor, k)
    mixColor(uniforms.uGlow.value, a.glow, b.glow, k)
    uniforms.uGlowI.value = THREE.MathUtils.lerp(a.glowI, b.glowI, k)
    mixColor(uniforms.uCloudBright.value, a.cBright, b.cBright, k)
    mixColor(uniforms.uCloudDark.value, a.cDark, b.cDark, k)
    uniforms.uCloudCover.value = THREE.MathUtils.lerp(a.cCover, b.cCover, k)
    uniforms.uSunColor.value.copy(sun.color)
    uniforms.uSunDir.value.copy(sunDir)
    uniforms.uMoonDir.value.copy(sunDir).negate()
    const night = THREE.MathUtils.lerp(a.night, b.night, k)
    uniforms.uNight.value = night

    // fog: mistura horizonte + zenite + um toque da banda quente, pra a nevoa
    // ficar dourada no entardecer e azulada ao meio-dia, sem estourar de claro
    fogColor.copy(uniforms.uHorizon.value).lerp(uniforms.uZenith.value, 0.34)
    cA.copy(uniforms.uGlow.value)
    fogColor.lerp(cA, Math.min(0.18, uniforms.uGlowI.value * 0.14))
    fog.color.copy(fogColor)
    fog.density = THREE.MathUtils.lerp(a.fogD, b.fogD, k)

    if (renderer) {
      renderer.toneMappingExposure = baseExposure * THREE.MathUtils.lerp(a.exp, b.exp, k)
    }

    // --- ceu fechado de chuva -----------------------------------------------
    // Entra DEPOIS do ciclo, sobre os valores dele: assim o entardecer chuvoso
    // ainda e um entardecer, so que abafado.
    if (nublado > 0.001) {
      const n = nublado
      sun.intensity *= THREE.MathUtils.lerp(1, NUBLADO.sunMul, n)
      sun.castShadow = sun.intensity > 0.05
      fill.intensity *= THREE.MathUtils.lerp(1, NUBLADO.fillMul, n)

      cA.setHex(NUBLADO.hemiSky); hemi.color.lerp(cA, n)
      cA.setHex(NUBLADO.hemiGnd); hemi.groundColor.lerp(cA, n)
      hemi.intensity = THREE.MathUtils.lerp(hemi.intensity, NUBLADO.hemiI, n)
      cA.setHex(NUBLADO.amb); ambient.color.lerp(cA, n)
      ambient.intensity = THREE.MathUtils.lerp(ambient.intensity, NUBLADO.ambI, n)

      cA.setHex(NUBLADO.zen); uniforms.uZenith.value.lerp(cA, n)
      cA.setHex(NUBLADO.hor); uniforms.uHorizon.value.lerp(cA, n)
      cA.setHex(NUBLADO.glow); uniforms.uGlow.value.lerp(cA, n)
      uniforms.uGlowI.value = THREE.MathUtils.lerp(uniforms.uGlowI.value, NUBLADO.glowI, n)
      cA.setHex(NUBLADO.cBright); uniforms.uCloudBright.value.lerp(cA, n)
      cA.setHex(NUBLADO.cDark); uniforms.uCloudDark.value.lerp(cA, n)
      uniforms.uCloudCover.value = THREE.MathUtils.lerp(uniforms.uCloudCover.value, NUBLADO.cCover, n)
      uniforms.uSunColor.value.copy(sun.color)

      // a nevoa fecha junto: e ela que da o "ar pesado" da chuva
      fogColor.copy(uniforms.uHorizon.value).lerp(uniforms.uZenith.value, 0.34)
      fog.color.copy(fogColor)
      fog.density *= THREE.MathUtils.lerp(1, NUBLADO.fogMul, n)
      if (renderer) renderer.toneMappingExposure *= THREE.MathUtils.lerp(1, NUBLADO.expMul, n)
    }

    // vira "noite" quando o sol some: main liga os postes por aqui
    const nowNight = sunDir.y < 0.02
    if (nowNight !== isNight) {
      isNight = nowNight
      api.isNight = isNight
      if (typeof api.onNight === 'function') api.onNight(isNight)
    }
  }

  const api = {
    sun, fill, hemi, ambient, sky, skyGroup, clouds, fog,
    isNight: false,
    pauseCycle: false,
    onNight: null,
    cycleSeconds: CYCLE_SECONDS,

    get timeOfDay() { return time },
    set timeOfDay(v) { api.setTimeOfDay(v) },

    /** t em 0..1 (0 amanhecer, 0.25 meio-dia, 0.5 por do sol, 0.75 noite). */
    setTimeOfDay(t) {
      time = ((t % 1) + 1) % 1
      apply()
    },

    /**
     * Ceu fechado de chuva, 0..1. Quem chama e src/world/clima.js, uma vez por
     * quadro, com a mesma forca da chuva — assim a chuva e o ceu nunca
     * discordam (chover com ceu azul le como bug, e e).
     */
    setNublado(v) {
      const n = Number(v)
      nublado = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
    },
    get nublado() { return nublado },

    /** Alvo das sombras: o main passa a posicao do jogador todo frame. */
    setTarget(v) {
      // So move o alvo; o apply() acontece uma unica vez em update(dt).
      // (main chama setTarget e update em sequencia todo frame.)
      target.set(v.x, 0, v.z)
      skyGroup.position.set(v.x, 0, v.z) // ceu acompanha pra nao ter parallax
      targetDirty = true
    },

    update(dt) {
      elapsed += dt
      uniforms.uTime.value = elapsed
      if (!api.pauseCycle) {
        time = (time + dt / CYCLE_SECONDS) % 1
        apply()
        targetDirty = false
      } else if (targetDirty) {
        apply() // ciclo pausado: ainda precisa reposicionar a shadow camera
        targetDirty = false
      }
    },

    dispose() {
      scene.remove(sun, sun.target, fill, fill.target, hemi, ambient, skyGroup)
      sky.geometry.dispose(); skyMat.dispose()
      scene.fog = null
    },
  }

  apply()
  return api
}
