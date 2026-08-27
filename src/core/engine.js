import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js'
import { CAMERA, QUALITY } from '../config.js'

// ---------------------------------------------------------------------------
// Renderer + scene + camera + resize + pos-processamento. Nada de logica de
// jogo aqui.
//
// Pilha do composer (a ordem importa):
//   RenderPass    -> cena em HDR linear (o composer usa RT HalfFloat)
//   UnrealBloom   -> so o que passa do threshold (letreiros, lampadas, sol)
//   OutputPass    -> tone mapping ACES + conversao pra sRGB (sai LDR)
//   SMAAPass      -> anti-aliasing; precisa de imagem LDR/sRGB, por isso vem
//                    depois do OutputPass (o composer nao usa o MSAA do canvas)
//   GRADE_SHADER  -> acabamento final: aberracao, vinheta, cor e grao. Grao
//                    tem que ser DEPOIS do AA, senao o SMAA acha borda no ruido.
// ---------------------------------------------------------------------------

// Bloom sutil: threshold alto pra so estourar o que e realmente luz.
const BLOOM = { strength: 0.35, radius: 0.5, threshold: 0.85 }

// Os passes de tela cheia sao limitados por fill rate. Num monitor HiDPI
// (devicePixelRatio 2) seriam 4x mais pixels so pro pos-processamento, entao
// cortamos o composer em 1.5x e deixamos o SMAA cuidar da borda. Em monitor
// comum (ratio 1) isso nao muda absolutamente nada.
const POST_PIXEL_RATIO_CAP = 1.5

function postRatio(renderer) {
  return Math.min(renderer.getPixelRatio(), POST_PIXEL_RATIO_CAP)
}

// --- Shader de acabamento ---------------------------------------------------
// Roda em espaco de display (ja tonemapeado e em sRGB), que e onde vinheta,
// grao e aberracao se comportam de forma previsivel.
const GRADE_SHADER = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberr: { value: 0.0016 },   // deslocamento maximo dos canais, em UV
    uVignette: { value: 0.32 },  // 0 = sem vinheta
    uGrain: { value: 0.035 },    // amplitude do grao
    uSat: { value: 1.05 },       // saturacao (1 = neutro)
    uContrast: { value: 1.035 }, // contraste em torno de 0.5
    uLift: { value: new THREE.Vector3(0.010, 0.012, 0.022) },  // sombras puxadas pro azul
    uGamma: { value: new THREE.Vector3(1.00, 1.00, 0.985) },   // meios-tons
    uGain: { value: new THREE.Vector3(1.020, 1.005, 0.985) },  // altas luzes quentes
    uResolution: { value: new THREE.Vector2(1280, 720) },
  },
  vertexShader: /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAberr;
uniform float uVignette;
uniform float uGrain;
uniform float uSat;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform vec2 uResolution;
varying vec2 vUv;

// ruido barato de 1 tap, so pro grao
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;          // vetor do centro pra este pixel
  float r = length(c) * 1.4142;  // 0 no centro, ~1 nos cantos

  // --- aberracao cromatica -------------------------------------------------
  // Desloca R e B em direcoes opostas ao longo do raio. r^3 mantem o centro
  // da tela 100% limpo e concentra a franja so na moldura.
  float ab = uAberr * r * r * r;
  vec3 col;
  col.r = texture2D(tDiffuse, uv - c * ab).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv + c * ab).b;
  col = max(col, 0.0);

  // --- lift / gamma / gain -------------------------------------------------
  // lift levanta o preto, gain multiplica o branco, gamma curva o meio-tom.
  col = col * uGain + uLift * (1.0 - col);
  col = pow(max(col, 0.0), 1.0 / uGamma);

  // --- contraste e saturacao ----------------------------------------------
  col = (col - 0.5) * uContrast + 0.5;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, uSat);

  // --- vinheta -------------------------------------------------------------
  // Queda suave, comecando so depois de metade do raio pra nao sujar o centro.
  float vig = 1.0 - uVignette * smoothstep(0.45, 1.05, r);
  col *= vig;

  // --- grao ----------------------------------------------------------------
  // Fininho e mais forte nas sombras, como filme de verdade. O uTime quebra a
  // correlacao entre frames pra nao virar padrao fixo na tela.
  float g = hash12(uv * uResolution + fract(uTime) * 917.0) - 0.5;
  col += g * uGrain * (1.0 - luma * 0.75);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
}

export function createEngine(container) {
  const renderer = new THREE.WebGLRenderer({
    // antialias continua ligado pro caminho de fallback (sem composer)
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.PIXEL_RATIO_CAP))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()

  const camera = new THREE.PerspectiveCamera(
    CAMERA.FOV_FP,
    window.innerWidth / window.innerHeight,
    CAMERA.NEAR,
    CAMERA.FAR,
  )
  camera.position.set(0, 1.7, 6)
  // rotacao controlada manualmente pelo controller (yaw/pitch)
  camera.rotation.order = 'YXZ'

  // --- pos-processamento ----------------------------------------------------
  // Tudo dentro de try/catch: se qualquer addon/extensao faltar, o jogo cai no
  // renderer.render() normal em vez de morrer na tela preta.
  let composer = null
  let bloomPass = null
  let gradePass = null
  let smaaPass = null
  let postEnabled = true
  let postOk = false
  // custo da cena (sem os passes de tela cheia), copiado de volta pro
  // renderer.info no fim de cada frame com pos-processamento
  const sceneInfo = { calls: 0, triangles: 0, lines: 0, points: 0 }

  try {
    const w = window.innerWidth, h = window.innerHeight
    composer = new EffectComposer(renderer)
    composer.setPixelRatio(postRatio(renderer))
    composer.setSize(w, h)

    // Cada passe do composer faz seu proprio renderer.render(), e o three zera
    // o renderer.info a cada um: no fim do frame sobraria "1 draw call" (o quad
    // final) e as ferramentas perderiam a leitura de custo da cena. Entao
    // guardamos os numeros logo depois do RenderPass e devolvemos no fim.
    const renderPass = new RenderPass(scene, camera)
    const rpRender = renderPass.render.bind(renderPass)
    renderPass.render = function (r, writeBuffer, readBuffer, dt, maskActive) {
      rpRender(r, writeBuffer, readBuffer, dt, maskActive)
      const i = r.info.render
      sceneInfo.calls = i.calls
      sceneInfo.triangles = i.triangles
      sceneInfo.lines = i.lines
      sceneInfo.points = i.points
    }
    composer.addPass(renderPass)

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h), BLOOM.strength, BLOOM.radius, BLOOM.threshold,
    )
    composer.addPass(bloomPass)

    // OutputPass faz tone mapping + sRGB; dai pra frente tudo e LDR de display
    composer.addPass(new OutputPass())

    smaaPass = new SMAAPass(w * postRatio(renderer), h * postRatio(renderer))
    composer.addPass(smaaPass)

    gradePass = new ShaderPass(GRADE_SHADER)
    gradePass.renderToScreen = true
    composer.addPass(gradePass)

    postOk = true
  } catch (err) {
    console.warn('pos-processamento indisponivel, usando render direto:', err)
    composer = null
    postOk = false
  }

  function syncGradeResolution() {
    if (!gradePass) return
    // resolucao real do buffer do grade: e o que faz o grao ter 1 pixel
    const r = postRatio(renderer)
    gradePass.uniforms.uResolution.value.set(window.innerWidth * r, window.innerHeight * r)
  }
  syncGradeResolution()

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY.PIXEL_RATIO_CAP))
    renderer.setSize(w, h)
    if (composer) {
      composer.setPixelRatio(postRatio(renderer))
      composer.setSize(w, h)   // repassa setSize pra todos os passes
      syncGradeResolution()
    }
  }
  window.addEventListener('resize', onResize)

  const clock = new THREE.Clock()
  let gradeTime = 0

  return {
    renderer, scene, camera, clock,

    // acesso pra ajuste fino (bloom/grade) de fora
    get composer() { return composer },
    get bloomPass() { return bloomPass },
    get gradePass() { return gradePass },
    get smaaPass() { return smaaPass },
    get postEnabled() { return postOk && postEnabled },

    /** Liga/desliga a pilha de pos-processamento em tempo de execucao. */
    setPostEnabled(v) {
      postEnabled = !!v
      return postOk && postEnabled
    },

    render() {
      if (postOk && postEnabled && composer) {
        // grao animado: avanca um passo por frame, sem depender do clock do jogo
        // (as ferramentas de screenshot chamam render() fora do loop)
        gradeTime = (gradeTime + 1 / 60) % 1000   // wrap: evita perder precisao
        if (gradePass) gradePass.uniforms.uTime.value = gradeTime
        try {
          composer.render()
          const i = renderer.info.render
          i.calls = sceneInfo.calls
          i.triangles = sceneInfo.triangles
          i.lines = sceneInfo.lines
          i.points = sceneInfo.points
          return
        } catch (err) {
          // um erro aqui e fatal pro frame: desliga o post e segue o jogo.
          // O composer pode ter parado com um render target ativo, entao volta
          // pro framebuffer da tela antes de desenhar direto.
          console.warn('falha no composer, voltando pro render direto:', err)
          postOk = false
          try { renderer.setRenderTarget(null) } catch (e2) { void e2 }
        }
      }
      renderer.render(scene, camera)
    },

    dispose() {
      window.removeEventListener('resize', onResize)
      if (composer) {
        for (const p of composer.passes) if (typeof p.dispose === 'function') p.dispose()
        composer.dispose()   // libera os dois render targets + o copyPass
      }
      renderer.dispose()
    },
  }
}
