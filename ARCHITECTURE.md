# Mini City RP — contrato de módulos

Jogo 3D no navegador. **Vite + Three.js r171 (ESM, `import * as THREE from 'three'`)**.
Estilo visual: personagens e cenário no estilo do jogo *Schedule I* — cartoon low-poly,
cabeça grande em formato de ovo, membros finos, cores lavadas, iluminação suave.

## Regras que TODO módulo deve seguir

- ESM puro, sem TypeScript, sem JSX. Sem dependências além de `three`.
- **Nenhum asset externo** (sem `.glb`, `.png`, sem fetch). Tudo procedural.
- 1 unidade = 1 metro. `+Y` = cima. Chão em `y = 0`. `+Z` = frente do personagem.
- Todo mesh sólido: `castShadow = true`, `receiveShadow = true`.
  Chão/paredes que só recebem: `receiveShadow = true`.
- Importar helpers de `../world/materials.js` (`solid`, `box`, `cyl`, `sphere`,
  `roundedBox`, `plane`, `emissive`, `glass`, `textPlaneMat`, `paintingMat`,
  `asphaltTex`, `concreteTex`, `brickTex`, `plasterTex`, `woodTex`, `tileTex`,
  `grassTex`, `PALETTE`). **Não recriar materiais do zero**; reusar o cache.
- Constantes de mundo em `../config.js` (`WORLD`, `PLAYER`, `CAMERA`, `QUALITY`).
- Layout da cidade em `../world/layout.js` (`BARBER`, `GROCERY`, `FILLERS`, `PARK`,
  `WALL_T`, `interiorOf()`).
- Comentários em português, curtos e só onde o "porquê" não é óbvio.
- Performance: alvo 60fps. Evitar > ~1200 draw calls. Reusar geometrias quando
  repetir muito o mesmo objeto (`const g = new THREE.BoxGeometry(...)` fora do loop).

## Tipos compartilhados

```js
// Colisor: caixa alinhada aos eixos no plano XZ (o jogador só anda no plano).
// Portas são simplesmente vãos entre colisores.
Collider = { minX: number, maxX: number, minZ: number, maxZ: number, tag?: string }

// Ponto de interação (tecla E quando o jogador chega perto).
Interactable = {
  id: string,
  position: THREE.Vector3, // ponto no mundo
  radius: number,          // distância de ativação (m)
  label: string,           // texto do prompt, ex.: 'Cortar cabelo'
  onInteract: (game) => void,
  facing?: THREE.Vector3,  // opcional: direção que o player deve estar olhando
}

// Retorno padrão de todo builder de cenário:
BuildResult = {
  group: THREE.Group,
  colliders: Collider[],
  interactables: Interactable[],
  update?: (dt: number, game) => void, // opcional, animação do módulo
}
```

## Objeto `game` (montado por `main.js`, passado aos builders/interações)

```js
game = {
  scene, camera, renderer, clock,
  player,        // ver player/controller.js
  character,     // Character do jogador (player/character.js)
  appearance,    // estado atual da aparência (player/appearance.js)
  hud,           // ui/hud.js
  openCustomizer(kind, opts), // kind: 'hair' | 'face' | 'all'
  addColliders(list), addInteractables(list),
  setAppearance(partial), // ex.: { hair: 2 } -> reconstrói só o necessário
  toast(msg),    // mensagem rápida no HUD
}
```

## Arquivos e responsabilidades

| Arquivo | Exporta | Responsabilidade |
|---|---|---|
| `src/core/engine.js` | `createEngine(container)` | renderer, scene, camera, resize, tone mapping |
| `src/core/input.js` | `createInput(dom)` | teclado/mouse, pointer lock |
| `src/systems/collision.js` | `createCollisionWorld()` | AABB XZ, `resolve(pos, radius)` |
| `src/systems/interaction.js` | `createInteractionSystem()` | acha o interactable mais próximo |
| `src/world/lighting.js` | `createLighting(scene)` | sol direcional + sombras + céu + fog |
| `src/world/city.js` | `buildCity()` | ruas, calçadas, meio-fio, faixas, prédios, parque |
| `src/world/props.js` | funções `makeX()` | poste, banco, lixeira, árvore, hidrante, placa, etc. |
| `src/world/barbershop.js` | `buildBarbershop(game)` | interior + cadeira + espelho + quadros + barbeiro |
| `src/world/grocery.js` | `buildGrocery(game)` | interior + prateleiras + caixa + atendente |
| `src/player/character.js` | `createCharacter(opts)` | boneco procedural estilo Schedule I |
| `src/player/appearance.js` | `CATALOGS` | 8 cabeças, 5 olhos/pupilas/narizes/bocas/barbas/cabelos/peles (ver PERSONAGEM.md) |
| `src/player/roupas.js` | catálogos de roupa | 9 categorias × 6: chapéu, blusa, jaqueta, calça, calçado, colar, anel, relógio, tatuagem |
| `src/player/animation.js` | `createAnimator(character)` | idle/andar/correr/pular procedural |
| `src/player/controller.js` | `createPlayerController(...)` | movimento + câmera 1ª/3ª pessoa |
| `src/npc/npc.js` | `createNPC(opts)` | NPC parado com idle, usa `createCharacter` |
| `src/ui/hud.js` | `createHUD()` | crosshair, prompt E, ajuda, toasts |
| `src/ui/customizer.js` | `createCustomizer(game)` | 19 abas: 10 de rosto (barbeiro) + 9 de roupa (provador) |
| `src/ui/hotbar.js` | `criarHotbar(opts)` | barra de 4 itens: mãos, anel, arma de portal, revólver |
| `src/render/luzes-efeito.js` | `criarPoolDeEfeito(scene, n, camera)` | 2 PointLight compartilhadas por TODOS os efeitos; ver a armadilha do recompile de shader no cabecalho do arquivo |
| `src/world/clima.js` | `criarClima(opts)` | chuva (1 LineSegments) + respingos (1 InstancedMesh) + escurecida |
| `src/world/agarraveis.js` | `buildAgarraveis()` | os objetos que o anel verde levita, cada um com id estável |
| `src/armas/revolver.js` | `criarRevolver(opts)` | revólver de 6 balas, mira, recarga tambor a tambor, `aoAcerto` |
| `src/npc/zumbi.js` | `criarZumbi(opts)` | NPC 1004 da porta da mercearia: são → adoecendo (10 s) → zumbi → morto → sumido. Online quem decide é o servidor; este arquivo só desenha |
| `src/veiculos/veiculos.js` | `criarVeiculos(opts)` | carro, moto, skate e helicóptero: entrar/sair com E |
| `src/poder/anel.js` | `criarAnel(opts)` | telecinese do anel verde + montagem do helicóptero |
| `src/poder/portalgun.js` | `criarPortalGun(opts)` | arma de portal: abre portal verde que leva à barbearia |

## Assinaturas exatas

### `player/character.js`
```js
export function createCharacter(opts = {}) => Character
// opts: { appearance?, scale?, skin?, shirt?, pants?, shoes? }
Character = {
  root,        // THREE.Group, origem NOS PÉS, +Z = frente
  height,      // 1.82
  parts: {
    hips, torso, chest, neck, head, headPivot,
    armLUpper, armLLower, handL, armRUpper, armRLower, handR,
    legLUpper, legLLower, footL, legRUpper, legRLower, footR,
    face,      // Group grudado na cabeça, olhando para +Z (ancora olhos/boca/etc)
  },
  slots: { hair, eyes, brows, mouth }, // THREE.Group vazios dentro de face/head
  fpAnchor,    // THREE.Object3D na altura dos olhos (câmera 1ª pessoa)
  setAppearance(appearance),  // troca conteúdo dos slots
  setHeadLook(pitch, yaw),    // rotaciona headPivot (limitado)
  setVisibleBody(v),          // esconde a cabeça em 1ª pessoa
  dispose(),
}
```

### `player/appearance.js`
```js
export const HAIR = [ {id, name, build(ctx) => THREE.Object3D}, x3 ]
export const EYES = [ {id, name, build(ctx) => THREE.Object3D}, x3 ]  // já cria os DOIS olhos
export const BROWS = [ {id, name, build(ctx) => THREE.Object3D}, x3 ]
export const MOUTH = [ {id, name, build(ctx) => THREE.Object3D}, x3 ]
// ctx = { skin, hairColor, THREE, mats } — o build recebe cores atuais
export const HAIR_COLORS = [ {name, hex}, ... ]
export function defaultAppearance() => { hair:0, eyes:0, brows:0, mouth:0, hairColor:0, skin, shirt, pants, shoes }
```
Os grupos retornados por `build()` já vêm posicionados no espaço da **face**:
origem no centro da cabeça, `+Z` para frente, `+Y` para cima, escala em metros.
Cabeça: elipsoide de raios base `rx=0.135, ry=0.185, rz=0.13` **multiplicados por
`HEAD_S`** (exportado por `appearance.js`, hoje 1.33) — raios efetivos
`rx=0.180, ry=0.246, rz=0.173`, centro em `y=0`. **Toda medida facial nova
precisa ser multiplicada por `HEAD_S`**, senão desencaixa.

### `player/controller.js`
```js
export function createPlayerController({ camera, character, input, collision, scene }) => Player
Player = {
  position,           // THREE.Vector3 (pés)
  yaw, pitch,
  mode,               // 'first' | 'third'
  toggleMode(), setMode(m),
  update(dt),
  getState(),         // { speed, moving, running, grounded, airborne }
  setLocked(b),       // trava input (menu aberto)
  teleport(x, z, yaw),
}
```

### Arma ↔ alvo (como o tiro vira dano)

Os dois módulos não se conhecem: `main.js` liga uma ponta na outra. A arma diz
**onde** acertou; o alvo diz **o que** era aquilo.

```js
// src/armas/revolver.js
revolver.aoAcerto = ({ ponto, normal, objeto, distancia }) => {}

// quem pode ser alvo expõe isto no userData do seu grupo:
grupo.userData.parteAtingida = (objeto) => 'cabeca' | 'corpo' | null

// e leva o tiro:
alvo.levarTiro('cabeca' | 'corpo', { ponto, normal, objeto, distancia })
```

Qualquer mesh que **não** deve poder ser acertado (sangue, clarão, onda de
choque, respingo de chuva) marca `o.userData.semTiro = true`. Sem isso o segundo
tiro acerta a gota de sangue do primeiro, que está exatamente no caminho.

### Builders de cenário
```js
export function buildCity() => BuildResult
export function buildBarbershop(game) => BuildResult
export function buildGrocery(game) => BuildResult
```

## Referência visual do personagem (fotos do usuário)

- Cabeça: **ovo/pêra vertical**, larga em cima, queixo estreito. Sem pescoço aparente
  (pescoço curtíssimo). Cabeça ≈ 0.49 m de altura → ~1/3.7 do corpo.
- Olhos: **bolhas brancas SALIENTES**, esferas achatadas que se projetam da face,
  com íris/pupila escura pequena. Variante "bloodshot" com veias/rosa.
- Sobrancelhas: **grossas e retas**, marrom escuro, bem acima dos olhos.
- Boca: traço curvo simples; uma variante com **bigode + cavanhaque**.
- Corpo: torso levemente cônico e magro, ombros estreitos, braços e pernas
  cilíndricos finos, mãos como luvas arredondadas, pés como sapatos-bloco.
- Roupa: camiseta (manga curta), calça, tênis brancos.
- Proporção geral tipo *Rick and Morty* / *Schedule I*.
