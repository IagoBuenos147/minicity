import * as THREE from 'three'
import { texturaFagulha } from './efeitos.js'

// ---------------------------------------------------------------------------
// O PORTAL — a peca visual, sem nenhuma regra de jogo e sem nenhuma rede.
//
// DECISAO DE ORIENTACAO: o portal e FIXO NO MUNDO, em pe, como uma janela
// plantada no chao. Nao e billboard. O dono do projeto vai ATRAVESSAR o
// portal, e um plano que gira pra acompanhar a camera destroi exatamente isso:
// o jogador nunca conseguiria "entrar" nele porque ele fugiria de lado, e dois
// jogadores veriam o buraco em angulos diferentes num mundo que o REDE.md
// manda ser igual pra todo mundo. Fixo, o portal tem frente e costas, encosta
// no chao e da pra passar. Por isso o material e DoubleSide: visto por tras
// ele continua existindo.
//
// Nada aqui aloca por quadro: geometria e material nascem uma vez, e o que
// anima sao uniforms e atributos ja existentes (mesma regra do efeitos.js).
// O portal NAO tem PointLight propria: a luz e uma so, do modulo dono
// (portalgun.js), que a empresta pro portal mais perto da camera. O orcamento
// do poder inteiro sao duas PointLights.
// ---------------------------------------------------------------------------

// Meia largura/altura do plano que carrega o shader, e a fracao dele que o
// shader pinta de portal (R_DISCO, repetida dentro do fragment como 0.60).
//
// Sobra de proposito: o brilho que VAZA pra fora da borda precisa morrer ANTES
// do fim do plano. Se ele ainda estiver aceso na aresta, o quad recorta o
// vazamento e o portal aparece dentro de um RETANGULO esverdeado.
// Raio visivel = MEIA_L * R_DISCO = 1.14 m, que e o MUNDO.PORTAL_RAIO (1.15).
const MEIA_L = 1.9
const MEIA_A = 2.0
const R_DISCO = 0.60
const N_GOTAS = 20        // respingos em volta da borda

// --- shader -----------------------------------------------------------------
// Escrito na mao. O renderer da cena e HDR linear (o EffectComposer faz tone
// mapping e sRGB no OutputPass), entao aqui a saida e LINEAR e SEM os chunks
// de tonemapping/colorspace: incluir os chunks aplicaria a conversao duas
// vezes e o portal sairia lavado. Valores acima de 1 sao de proposito — sao
// eles que passam do threshold do bloom e fazem o miolo estourar.

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */`
uniform float uTempo;      // segundos, com defasagem propria por portal
uniform float uFlash;      // clarao somado no miolo (abertura e travessia)
uniform float uVida;       // 0..1: apaga tudo junto no fechamento
uniform vec3  uEscuro;     // verde do fundo do redemoinho
uniform vec3  uClaro;      // verde das faixas de luz
varying vec2 vUv;

// --- ruido de valor, barato e sem textura (a arquitetura proibe asset) ------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);           // suaviza a celula (smoothstep)
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// 4 oitavas: o suficiente pra dar faixa grossa E sujeira fina sem pesar
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * ruido(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  // coordenada polar centrada no plano
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float ang = atan(p.y, p.x);

  // Ruido de borda amostrado no CIRCULO UNITARIO, nao no angulo cru: em 'ang'
  // haveria um corte visivel na costura de -pi/+pi. Aqui ele da a volta sem
  // emenda nenhuma.
  vec2 aro = vec2(cos(ang), sin(ang));

  // --- borda irregular ------------------------------------------------------
  // Duas escalas de ruido: a grossa faz a lambanca (o portal nao e um circulo
  // perfeito), a fina faz os pingos e respingos saindo da borda.
  float lambanca = fbm(aro * 2.1 + uTempo * 0.06) - 0.5;
  float pingos = fbm(aro * 6.5 - uTempo * 0.11) - 0.5;
  float respingo = fbm(aro * 15.0 + uTempo * 0.07) - 0.5;
  float rBorda = 0.60 + lambanca * 0.17 + pingos * 0.085 + respingo * 0.04;

  // dentro do disco = 1; a transicao curta deixa a borda dura, como tinta.
  // Sempre 1.0 - smoothstep(lo, hi, x): em GLSL, smoothstep com edge0 > edge1
  // e COMPORTAMENTO INDEFINIDO — funcionava num driver e virava um retangulo
  // no outro.
  float dentro = 1.0 - smoothstep(rBorda - 0.035, rBorda, r);

  // --- redemoinho -----------------------------------------------------------
  // O truque do espiral: SOMAR O RAIO NO ANGULO. Faixas desenhadas nesse
  // angulo torcido deixam de ser raios retos e viram bracos que se enrolam
  // pro centro. O pow(r) aperta o giro perto do miolo, que e onde o
  // redemoinho da referencia e mais fechado.
  float giro = ang + uTempo * 0.62 - pow(max(r, 0.001), 0.55) * 5.4;
  vec2 esp = vec2(cos(giro), sin(giro)) * (0.55 + r * 1.55);

  float faixas = fbm(esp * 2.7 + vec2(0.0, -uTempo * 0.30));
  faixas += 0.34 * fbm(esp * 6.4 + uTempo * 0.22);
  // O contraste e o que separa braco claro de braco escuro. Sem o smoothstep
  // o fbm entrega um cinza-esverdeado sem desenho nenhum, e o redemoinho
  // simplesmente nao aparece.
  faixas = smoothstep(0.30, 0.86, faixas);

  vec3 cor = mix(uEscuro, uClaro, faixas);

  // --- miolo ----------------------------------------------------------------
  // Um nucleo aceso, mas CURTO: o bloom da cena espalha o que passa de 0.85, e
  // um miolo largo transforma o portal inteiro numa bola branca.
  float miolo = exp(-r * r * 13.0);
  cor += vec3(0.45, 1.0, 0.62) * miolo * (0.62 + uFlash * 1.5);

  // --- aro aceso ------------------------------------------------------------
  // A borda e a parte mais quente: sem isso o portal parece um adesivo.
  float aroLuz = smoothstep(rBorda - 0.10, rBorda - 0.004, r) * dentro;   // lo < hi: ok
  cor += uClaro * aroLuz * 0.80;

  // --- pontinhos brancos ----------------------------------------------------
  // Grade na coordenada JA TORCIDA do redemoinho (esp): como 'giro' inclui o
  // tempo, os pontos giram junto com os bracos em vez de ficarem colados na
  // tela. Usar (giro, r) direto esticaria cada celula no sentido tangencial e
  // os pontos sairiam como riscos.
  vec2 gp = esp * 6.5 + vec2(0.0, uTempo * 0.25);
  vec2 cel = floor(gp);
  float semente = hash(cel);
  vec2 d = fract(gp) - vec2(hash(cel + 3.17), hash(cel + 7.71));
  // (1.0 - smoothstep) de novo: edge0 tem que ser MENOR que edge1
  float ponto = step(0.84, semente) * (1.0 - smoothstep(0.02, 0.17, length(d)));
  cor += vec3(1.0, 1.0, 0.95) * ponto * 1.5 * dentro;

  // --- alfa -----------------------------------------------------------------
  // Fora do disco a luz vaza um POUCO: e o que amarra o portal ao cenario em
  // vez de deixa-lo recortado no ar. Fraco e curto de proposito — sobre asfalto
  // escuro, um alfa de 0.4 de verde ja pinta a rua inteira, e como o vazamento
  // acaba recortado pela aresta do quad, o portal aparece dentro de um
  // retangulo esverdeado. Aqui ele morre em rBorda + 0.20 (<= 0.95), bem antes
  // da borda do plano.
  float fora = (1.0 - smoothstep(rBorda, rBorda + 0.20, r)) * (1.0 - dentro);
  cor = mix(uClaro * 0.55, cor, dentro);
  float alpha = max(dentro, fora * 0.16) * uVida;
  if (alpha < 0.004) discard;

  gl_FragColor = vec4(cor * uVida, alpha);
}
`

// Geometrias compartilhadas por todos os portais: elas nunca mudam, so a
// matriz do grupo e que muda. Nascem na primeira vez que alguem abre um portal
// (o modulo pode ser importado no servidor... nao pode: aqui e THREE puro, mas
// preguicoso mesmo assim, pra nao criar buffer que ninguem usa).
let _geoDisco = null

function geoDisco() {
  if (!_geoDisco) _geoDisco = new THREE.PlaneGeometry(MEIA_L * 2, MEIA_A * 2)
  return _geoDisco
}

/**
 * Um portal desenhado. Nao decide nada: quem abre e fecha e o portalgun.js,
 * obedecendo ao servidor.
 *
 * @param {object} p  { x, y, z, yaw } — y e a altura do CENTRO do oval.
 */
export function criarPortal({ x, y, z, yaw }) {
  const grupo = new THREE.Group()
  grupo.position.set(x, y, z)
  grupo.rotation.y = yaw || 0
  grupo.name = 'portal'

  const uniforms = {
    uTempo: { value: Math.random() * 40 },   // defasagem: dois portais nao piscam iguais
    uFlash: { value: 1.0 },
    uVida: { value: 1.0 },
    // Verde do desenho: um fundo bem escuro e um claro que NAO chega no
    // branco. O bloom da cena espalha tudo que passa de 0.85, entao um verde
    // claro perto de 1.0 no canal G volta lavado, sem cor.
    uEscuro: { value: new THREE.Color(0x073518) },
    uClaro: { value: new THREE.Color(0x45e88d) },
  }

  const matDisco = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,     // e luz: nao pode recortar o que esta atras dele
    side: THREE.DoubleSide,
    fog: false,            // a neblina somaria a cor do ceu e apagaria o verde
  })

  const disco = new THREE.Mesh(geoDisco(), matDisco)
  disco.name = 'portal-disco'
  disco.renderOrder = 3
  disco.frustumCulled = false
  disco.castShadow = false
  disco.receiveShadow = false
  grupo.add(disco)

  // --- gotas / respingos ------------------------------------------------------
  // Sprites (Points) no plano do portal, logo fora da borda. Sao os pingos que
  // escorrem da lambanca. Um unico draw call e nada de alocacao por quadro.
  const gotaGeo = new THREE.BufferGeometry()
  const gotaPos = new Float32Array(N_GOTAS * 3)
  const gotaCor = new Float32Array(N_GOTAS * 3)
  gotaGeo.setAttribute('position', new THREE.BufferAttribute(gotaPos, 3))
  gotaGeo.setAttribute('color', new THREE.BufferAttribute(gotaCor, 3))
  const gotaMat = new THREE.PointsMaterial({
    map: texturaFagulha(),
    size: 0.20,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  })
  const gotas = new THREE.Points(gotaGeo, gotaMat)
  gotas.name = 'portal-gotas'
  gotas.frustumCulled = false
  gotas.renderOrder = 4
  gotas.position.z = 0.03
  grupo.add(gotas)

  // parametros fixos de cada gota (angulo, raio, ritmo) — sorteados uma vez
  const gAng = new Float32Array(N_GOTAS)
  const gRaio = new Float32Array(N_GOTAS)
  const gFase = new Float32Array(N_GOTAS)
  const gVel = new Float32Array(N_GOTAS)
  for (let i = 0; i < N_GOTAS; i++) {
    gAng[i] = Math.random() * Math.PI * 2
    gRaio[i] = 0.98 + Math.random() * 0.26
    gFase[i] = Math.random() * Math.PI * 2
    gVel[i] = 0.06 + Math.random() * 0.16      // devagar: e gosma, nao fagulha
  }

  // --- estado da abertura -----------------------------------------------------
  let t = 0
  let abertura = 0        // 0..1 do crescimento
  let fechando = false
  let fecha = 0           // 0..1 do encolhimento
  let flash = 1.0
  const DUR_ABRE = 0.35   // o pedido: cresce do centro em ~0.35 s
  const DUR_FECHA = 0.28

  grupo.scale.set(0.001, 0.001, 0.001)

  /** Pisca (usado quando alguem atravessa). */
  function piscar(f) { flash = Math.max(flash, f || 1.0) }

  /** Comeca a encolher. Depois de `morto` virar true, o dono remove o grupo. */
  function fechar() { if (!fechando) { fechando = true; fecha = 0; flash = 0.6 } }

  let morto = false

  function atualizar(dt) {
    t += dt
    uniforms.uTempo.value += dt

    if (fechando) {
      fecha = Math.min(1, fecha + dt / DUR_FECHA)
      // encolhe puxando pro centro, com o miolo apagando junto
      const k = 1 - fecha
      const s = k * k * (0.3 + 0.7 * k)
      grupo.scale.set(s, s, s)
      uniforms.uVida.value = k
      if (fecha >= 1) morto = true
    } else {
      abertura = Math.min(1, abertura + dt / DUR_ABRE)
      // estala pra fora e volta: 1 - (1-k)^3 passa de 1 com o seno somado
      const e = 1 - Math.pow(1 - abertura, 3)
      const s = e + Math.sin(Math.min(1, abertura) * Math.PI) * 0.13
      grupo.scale.set(s, s, s)
      uniforms.uVida.value = Math.min(1, abertura * 1.6)
    }

    // clarao decai sozinho; o resto do tempo o miolo so respira
    flash = Math.max(0, flash - dt * 2.6)
    uniforms.uFlash.value = flash + Math.sin(t * 2.3) * 0.06

    // gotas: giram devagar em volta e "respiram" pra fora e pra dentro
    const brilho = uniforms.uVida.value
    for (let i = 0; i < N_GOTAS; i++) {
      gAng[i] += dt * gVel[i]
      const pulso = Math.sin(t * 1.3 + gFase[i])
      const raio = gRaio[i] + pulso * 0.07
      const j = i * 3
      gotaPos[j] = Math.cos(gAng[i]) * raio * MEIA_L * R_DISCO
      gotaPos[j + 1] = Math.sin(gAng[i]) * raio * MEIA_A * R_DISCO
      gotaPos[j + 2] = 0
      const b = (0.5 + 0.5 * pulso) * brilho
      gotaCor[j] = 0.30 * b
      gotaCor[j + 1] = 1.00 * b
      gotaCor[j + 2] = 0.55 * b
    }
    gotaGeo.attributes.position.needsUpdate = true
    gotaGeo.attributes.color.needsUpdate = true

  }

  function dispose() {
    if (grupo.parent) grupo.parent.remove(grupo)
    matDisco.dispose()
    gotaMat.dispose()
    gotaGeo.dispose()
  }

  return {
    grupo,
    atualizar,
    fechar,
    piscar,
    dispose,
    get morto() { return morto },
    get fechando() { return fechando },
    get brilho() { return uniforms.uVida.value },
  }
}

/** Libera as geometrias compartilhadas (so no dispose do modulo inteiro). */
export function liberarGeometriasDoPortal() {
  if (_geoDisco) { _geoDisco.dispose(); _geoDisco = null }
}
