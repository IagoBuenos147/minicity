import * as THREE from 'three'
import { roundedBox, cyl, sphere, solid, glass, PALETTE } from '../world/materials.js'

// ---------------------------------------------------------------------------
// A ARMA DE PORTAL — so o modelo. Nenhum estado de jogo, nenhuma rede.
//
// Referencia (imagem 1, Rick and Morty):
//   corpo branco alongado e achatado, cantos arredondados, uma quina chanfrada
//   em cima e uma ranhura correndo pelo comprimento; botao vermelho retangular
//   no topo perto do meio; punho preto arredondado embaixo; e na PONTA DA
//   FRENTE, virado pra cima, um frasco transparente com liquido verde girando.
//
// O modelo e autorado com a FRENTE em +X (fica mais facil de ler as medidas ao
// longo do comprimento) e o grupo interno e girado pra que, de fora, a frente
// da arma seja +Z — a mesma convencao do resto do jogo (+Z = frente).
//
// A arma fica na MAO e o jogador olha pra ela o tempo todo, entao vale gastar
// alguns triangulos a mais aqui do que num prop de rua.
// ---------------------------------------------------------------------------

// --- o liquido do frasco -----------------------------------------------------
// ShaderMaterial escrito na mao num cilindro: uv.x da a volta no frasco e uv.y
// sobe. Girar o uv.x no tempo e o suficiente pra o fluido "rodar" por dentro.
// Saida LINEAR e sem os chunks de tonemapping/colorspace: a cena e renderizada
// em HDR linear e quem converte e o OutputPass do composer. Passar de 1.0 e de
// proposito — e o que estoura no bloom e faz o frasco parecer aceso.
const VERT_LIQ = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG_LIQ = /* glsl */`
uniform float uTempo;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * ruido(p); p *= 2.07; a *= 0.5; }
  return s;
}

void main() {
  // uv.x envolve o cilindro: somar tempo nele E o giro do fluido.
  vec2 q = vec2(vUv.x * 6.2831, vUv.y);
  float giro = q.x + uTempo * 1.15 + vUv.y * 2.2;   // sobe em espiral
  vec2 p = vec2(cos(giro), sin(giro)) * 1.4 + vec2(0.0, vUv.y * 3.0 - uTempo * 0.25);
  float n = fbm(p * 1.9);

  vec3 escuro = vec3(0.005, 0.10, 0.045);
  vec3 claro  = vec3(0.10, 0.60, 0.25);
  vec3 cor = mix(escuro, claro, clamp(n * 1.5, 0.0, 1.0));

  // faixa clara no meio da altura: le-se como o "corpo" do fluido
  cor += vec3(0.10, 0.40, 0.20) * exp(-pow((vUv.y - 0.5) * 3.2, 2.0)) * 0.6;

  // A "forma clara girando no meio" da referencia. Ela e desenhada AQUI, no
  // shader, e nao como um mesh dentro do frasco: o liquido e opaco, entao um
  // mesh no miolo simplesmente nunca apareceria.
  float volta = fract(vUv.x - uTempo * 0.17);          // da a volta no frasco
  float forma = exp(-pow((volta - 0.5) * 8.0, 2.0));
  forma *= 0.55 + 0.45 * sin(vUv.y * 6.5 + uTempo * 1.3);   // ondula, nao e barra
  cor += vec3(0.42, 0.86, 0.55) * forma * 0.55;

  gl_FragColor = vec4(cor, 1.0);
}
`

/**
 * Monta a arma. Devolve o grupo (frente = +Z, origem no PUNHO, que e o ponto
 * que a mao segura) e o passo de animacao do liquido.
 */
export function criarModeloArma() {
  const grupo = new THREE.Group()
  grupo.name = 'portal-gun'

  // Tudo o que e autorado com a frente em +X vive aqui dentro.
  const corpoG = new THREE.Group()
  corpoG.rotation.y = -Math.PI / 2      // +X vira +Z visto de fora
  // origem do grupo = punho; o corpo fica acima e um pouco a frente dele
  corpoG.position.set(0, 0.10, 0)
  grupo.add(corpoG)

  const matCorpo = solid(0xf2f1ea, 0.42, 0.06)      // branco levemente creme
  const matJunta = solid(0xb9b6ac, 0.55, 0.10)      // a ranhura/junta
  const matPreto = solid(0x1b1c20, 0.52, 0.12)      // punho e colares
  const matVermelho = solid(0xd8332a, 0.45, 0.08)   // o botao
  const matCromo = solid(PALETTE.chrome, 0.25, 0.85)
  const matVidro = glass(0xa9ffd2, 0.11)

  const geos = []                                    // pra liberar no dispose
  function reg(m) { geos.push(m.geometry); return m }

  // --- corpo ------------------------------------------------------------------
  // Chapa achatada de cantos arredondados: e o "controle" da referencia.
  const corpo = reg(roundedBox(0.28, 0.076, 0.100, 0.026, matCorpo))
  corpo.position.set(0.005, 0, 0)
  corpoG.add(corpo)

  // Lombada em cima, levemente inclinada pra frente: junto com a quina de tras
  // e ela que da o perfil chanfrado do desenho.
  const lombada = reg(roundedBox(0.205, 0.038, 0.086, 0.016, matCorpo))
  lombada.position.set(0.012, 0.053, 0)
  lombada.rotation.z = 0.055
  corpoG.add(lombada)

  // Quina chanfrada no alto de tras: um bloco girado 45 graus que "corta" o
  // canto (sem booleana — o jogo e todo procedural e o efeito le igual).
  const chanfro = reg(roundedBox(0.052, 0.052, 0.094, 0.012, matCorpo))
  chanfro.position.set(-0.128, 0.030, 0)
  chanfro.rotation.z = Math.PI / 4
  corpoG.add(chanfro)

  // --- ranhura / junta ---------------------------------------------------------
  // Uma chapa fina um pouco MAIS larga que o corpo: aparece como uma linha de
  // junta correndo pelos dois lados, do jeito que uma carcaca de plastico se
  // divide em duas metades.
  const junta = reg(roundedBox(0.272, 0.0075, 0.104, 0.003, matJunta))
  junta.position.set(0.005, -0.008, 0)
  corpoG.add(junta)

  // segunda linha, mais curta, na parte de cima da lombada
  const junta2 = reg(roundedBox(0.16, 0.005, 0.088, 0.002, matJunta))
  junta2.position.set(0.012, 0.070, 0)
  junta2.rotation.z = 0.055
  corpoG.add(junta2)

  // --- botao vermelho ---------------------------------------------------------
  const botao = reg(roundedBox(0.062, 0.016, 0.046, 0.007, matVermelho))
  botao.position.set(0.010, 0.079, 0)
  botao.rotation.z = 0.055
  corpoG.add(botao)

  // --- punho preto (o bulbo de baixo) -----------------------------------------
  const pescoco = reg(cyl(0.040, 0.046, 0.050, matPreto, 14))
  pescoco.position.set(-0.022, -0.050, 0)
  corpoG.add(pescoco)

  const punho = reg(sphere(0.047, matPreto, 16))
  punho.scale.set(1.0, 1.30, 0.92)
  punho.position.set(-0.024, -0.092, 0)
  corpoG.add(punho)

  // --- frasco na ponta da frente, virado pra cima ------------------------------
  const XF = 0.108                     // o quanto o frasco esta a frente
  const colar = reg(cyl(0.036, 0.042, 0.030, matPreto, 16))
  colar.position.set(XF, 0.050, 0)
  corpoG.add(colar)

  const aroCromo = reg(cyl(0.034, 0.034, 0.010, matCromo, 16))
  aroCromo.position.set(XF, 0.068, 0)
  corpoG.add(aroCromo)

  // liquido primeiro, vidro por cima (o vidro nao escreve profundidade)
  const matLiquido = new THREE.ShaderMaterial({
    uniforms: { uTempo: { value: Math.random() * 20 } },
    vertexShader: VERT_LIQ,
    fragmentShader: FRAG_LIQ,
    fog: false,
  })
  const liquido = reg(cyl(0.0265, 0.0265, 0.072, matLiquido, 20))
  liquido.position.set(XF, 0.110, 0)
  liquido.castShadow = false
  corpoG.add(liquido)

  const frasco = reg(cyl(0.031, 0.031, 0.086, matVidro, 20))
  frasco.position.set(XF, 0.110, 0)
  frasco.castShadow = false
  corpoG.add(frasco)

  const tampa = reg(sphere(0.031, matVidro, 16))
  tampa.scale.set(1, 0.62, 1)
  tampa.position.set(XF, 0.153, 0)
  tampa.castShadow = false
  corpoG.add(tampa)

  const tampaTopo = reg(cyl(0.020, 0.026, 0.014, matCromo, 14))
  tampaTopo.position.set(XF, 0.170, 0)
  corpoG.add(tampaTopo)

  // Ponto de onde o portal "sai" (e onde a luz do frasco mora), em espaco do
  // grupo. Quem precisa da posicao no mundo usa localToWorld numa copia.
  const bicoLocal = new THREE.Vector3(0, 0.10 + 0.115, XF)

  /** Anima o fluido. dt em segundos. */
  function atualizar(dt) {
    matLiquido.uniforms.uTempo.value += dt
  }

  function dispose() {
    if (grupo.parent) grupo.parent.remove(grupo)
    for (const g of geos) g.dispose()
    matLiquido.dispose()
    // os materiais vindos de materials.js sao CACHEADOS e compartilhados com o
    // resto da cidade: liberar aqui quebraria outros modulos.
  }

  return { grupo, atualizar, dispose, bicoLocal }
}
