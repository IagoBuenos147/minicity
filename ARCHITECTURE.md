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
| `src/systems/collision.js` | `createCollisionWorld()` | AABB XZ, `resolve(pos, radius)`. `add()` **devolve** as caixas internas, e cada uma tem `ativo` — é assim que a porta da casa velha barra o vão fechada e some aberta |
| `src/systems/interaction.js` | `createInteractionSystem()` | acha o interactable mais próximo |
| `src/world/lighting.js` | `createLighting(scene)` | sol direcional + sombras + céu + fog |
| `src/world/city.js` | `buildCity()` | ruas, calçadas, meio-fio, faixas, prédios, parque |
| `src/world/props.js` | funções `makeX()` | poste, banco, lixeira, árvore, hidrante, placa, etc. |
| `src/world/barbershop.js` | `buildBarbershop(game)` | interior + cadeira + espelho + quadros + barbeiro |
| `src/world/grocery.js` | `buildGrocery(game)` | interior + prateleiras + caixa + atendente |
| `src/player/character.js` | `createCharacter(opts)` | boneco procedural estilo Schedule I |
| `src/player/appearance.js` | `CATALOGS` | 8 cabeças, 5 olhos/pupilas/narizes/bocas/barbas/cabelos/peles (ver PERSONAGEM.md) |
| `src/player/roupas.js` | catálogos de roupa | chapéu, **roupa de cima** (blusa+jaqueta fundidas, 19), calça, calçado, colar, anel, relógio, tatuagem — 11 cada |
| `src/player/animation.js` | `createAnimator(character)` | idle/andar/correr/pular procedural |
| `src/player/controller.js` | `createPlayerController(...)` | movimento + câmera 1ª/3ª pessoa |
| `src/npc/npc.js` | `createNPC(opts)` | NPC parado com idle, usa `createCharacter` |
| `src/ui/hud.js` | `createHUD()` | crosshair, prompt E, ajuda, toasts, carteira, `setJogando(v)` |
| `src/ui/menu.js` | `criarMenu(opts)` | menu do Cassino Buenos: placa de neon, modo (solo/coop), lobby de 2 a 4 e opcoes |
| `src/ui/provador.js` | `criarProvador({renderer})` | o PALCO: cena separada com pedestal e luz de estudio, e as miniaturas 3D das pecas |
| `src/ui/criacao.js` | `criarCriacao(opts)` | tela cheia de criacao de personagem: nome, todas as abas, PRONTO e o contador do coop |
| `src/ui/tutorial.js` | `criarTutorial()`, `MISSOES_INICIAIS` | o objetivo no canto superior esquerdo |
| `src/cena/abertura.js` | `criarAbertura(opts)` | a cutscene: o porao com o elenco no sofa, o dialogo, e o corte pra frente da casa |
| `src/world/casa-velha.js` | `buildCasaVelha(game)` | a casa velha (casca + miolo em L) e a pose de onde a cutscene a encara |
| `src/ui/customizer.js` | `createCustomizer(game)` | 19 abas: 10 de rosto (barbeiro) + 9 de roupa (provador) |
| `src/ui/hotbar.js` | `criarHotbar(opts)` | barra de 4 itens: mãos, anel, arma de portal, revólver |
| `src/render/luzes-efeito.js` | `criarPoolDeEfeito(scene, n, camera)` | 2 PointLight compartilhadas por TODOS os efeitos; ver a armadilha do recompile de shader no cabecalho do arquivo |
| `src/world/clima.js` | `criarClima(opts)` | as tres estacoes: sol, chuva e neve. Gotas (1 LineSegments com cor por vertice), respingos + coroa (2 InstancedMesh), flocos (1 Points), rajada de vento, relampago. Nao acumula nada no chao — quem faz isso e `neve.js`, que le `clima.cobertura` |
| `src/world/neve.js` | `criarNeve({groundY, ancoras})` | a neve PARADA: manto do chao, telhados, copas, arbustos, postes, lixeiras, bancos e pingentes de gelo. 5 InstancedMesh, construidas uma vez e reveladas por `setCobertura(0..1)` |
| `src/world/casino.js` | `buildCasino(game)` | o cassino inteiro (casca + miolo): fachada com neon e marquise, salao, mesa de blackjack, mesa de poker, 3 caca-niqueis, caixa e os 3 NPCs. Devolve tambem `girarMaquina(i, simbolos, aoTerminar)` e `festa(i)` |
| `src/cassino/carteira.js` | `criarCarteira({hud})` | ouro e fichas, em `localStorage`. Nao passa pela rede |
| `src/cassino/baralho.js` | `criarBaralho(n, rng)` | baralho de n x 52 com corte e reembaralho |
| `src/cassino/blackjack.js` | `criarBlackjack(opts)` | regras do blackjack (maquina de estados PURA: nao toca em dinheiro) |
| `src/cassino/poker.js` | `criarPoker(opts)`, `forcaDaMao(a,b)` | heads-up de 2 cartas contra a IA do ricaco (tambem pura) |
| `src/cassino/slots.js` | `criarSlots({rng})` | 3 roletes, tabela de pagamentos, RTP calculado (92%) |
| `src/ui/cassino-ui.js` | `criarCassinoUI(opts)` | os 4 paineis (caixa, blackjack, poker, caca-niquel). E quem DEBITA e CREDITA a carteira |
| `src/world/agarraveis.js` | `buildAgarraveis()` | os objetos que o anel verde levita, cada um com id estável |
| `src/armas/revolver.js` | `criarRevolver(opts)` | revólver de 6 balas, mira, recarga tambor a tambor, `aoAcerto` |
| `src/npc/zumbi.js` | `criarZumbi(opts)` | NPC 1004 da porta da mercearia: são → adoecendo (10 s) → zumbi → morto → sumido. Online quem decide é o servidor; este arquivo só desenha |
| `src/veiculos/veiculos.js` | `criarVeiculos(opts)` | carro, moto, skate e helicóptero: entrar/sair com E |
| `src/poder/anel.js` | `criarAnel(opts)` | telecinese do anel verde + montagem do helicóptero |
| `src/poder/portalgun.js` | `criarPortalGun(opts)` | arma de portal: abre portal verde que leva à barbearia |

## Uma laje por metro quadrado

Duas lajes no mesmo Y brigam por profundidade, e o resultado aparece como
mancha piscando no chão. Já aconteceu duas vezes neste projeto, sempre do mesmo
jeito: um prédio com interior nasce por cima de uma calçada que já estava lá.

Por isso `walk()` (em `city.js`) **recorta a pegada dos `LOTES`** antes de
desenhar a laje — em faixas, e não com um `hole` na shape, porque o recorte
encosta na borda do retângulo e furo que toca o contorno é caso degenerado para
a triangulação. Prédio de cenário (`FILLERS`) não entra no recorte: é caixa
maciça, e a calçada por baixo dele não aparece para ninguém.

## O fluxo de entrada

```
menu -> (solo)  criacao -> abertura -> jogo
     -> (coop)  lobby -> criacao -> [todos prontos] -> abertura -> jogo
```

`main.js` guarda **um** estado (`'menu' | 'criacao' | 'abertura' | 'jogo'`) e o
laco de desenho decide o que fazer com ele. A alternativa — varias flags
booleanas (`emMenu`, `emCriacao`, `started`) — e a que estava ali antes, e era a
origem do "tela inicial pedindo dois cliques": duas flags podiam discordar e
ninguem percebia.

No coop **quem vira a fase e o servidor**: o cliente pede (`COMECAR`, `PRONTO`) e
desenha o `SALA_ESTADO` que voltar. Ver `REDE.md`.

O jogo **nao conecta mais sozinho** ao abrir a pagina. Quem vai jogar solo nao
tem por que aparecer no mundo de ninguem, e a sala tem 4 vagas — ocupar uma so
por ter aberto a aba tira a vaga de quem ia jogar.

### Atalhos de teste (`game.fluxo`)

Nenhum caminho de UI chega neles; existem pro teste de fumaca e pras ferramentas
de foto, que precisam do mundo jogavel em dois segundos em vez de vinte de
cutscene.

| | |
|---|---|
| `fluxo.jogar()` | pula direto pro jogo. `fluxo.jogar({online:true})` entra na sala tambem |
| `fluxo.solo()` | o mesmo que o botao SOLO |
| `fluxo.comecar(elenco?)` | dispara a cutscene; o elenco falso e pras fotos |
| `fluxo.foto(v)` | congela a camera (nem o passeio do menu nem o controller mexem nela) |

## O palco (customizacao)

A camera do jogo NAO enquadra mais o personagem na customizacao. Enquanto o
painel esta aberto, o que aparece na tela e `src/ui/provador.js` — uma cena
separada, com pedestal e luz de tres pontos.

O motivo e concreto: apontando a camera do jogo pro boneco onde ele estava, a
cadeira do barbeiro, o espelho, o balcao e a prateleira da loja entravam entre a
lente e o cliente, e nao havia enquadramento que resolvesse — o estorvo era o
CENARIO. No palco nao ha movel nenhum pra atrapalhar porque nao ha movel nenhum.

Duas telas usam o mesmo palco (o painel de dentro do jogo e a tela de criacao), e
as duas chamam `provador.setDesvio()` com a MESMA conta: o painel come um lado
da tela, entao a camera anda de lado (travelling, nao giro — girar deixaria o
boneco de perfil na hora de escolher o rosto).

As **miniaturas** dos cards saem do mesmo palco: cada peca e renderizada de
verdade, no corpo e no tom de pele do jogador, num render target de 192 px, e
cacheada por `campo:indice`. Antes eram formas de CSS, e por isso a aba de roupa
mostrava seis pilulas cinzas identicas.

## As tres estacoes (tecla `C`)

`main.js` liga tres modulos que nao se conhecem:

```
tecla C -> clima.proximaEstacao()      sol -> chuva -> neve -> sol
clima   -> lighting.setNublado(chuva)  ceu fechado de chuva
clima   -> lighting.setNevando(neve)   ceu de nevasca (mais CLARO que o normal)
clima   -> clima.cobertura             0..1 de neve ja acumulada no chao
main    -> neve.setCobertura(clima.cobertura)
```

Regras que o desenho respeita:

1. **Um dono por valor.** Ceu, sol, fog e exposicao sao do `lighting`. O clima
   so pede (`setNublado` / `setNevando`); ele mesmo nunca escreve em `scene.fog`
   quando ha `lighting` — dois donos do mesmo valor acabam em escuridao dobrada.
2. **Particula e acumulo sao modulos diferentes.** `clima.js` cuida do que esta
   caindo; `neve.js` do que ja caiu. A unica ponte e o numero `cobertura`.
3. **A neve acumulada e construida UMA vez**, no carregamento, e depois so
   aparece/derrete por opacidade e escala. Nevar nao remonta mundo nenhum.
4. **Nada disso passa pela rede** (REDE.md nao tem pacote de clima). Cada
   maquina desenha o proprio tempo, como ja acontecia com a chuva.

## Reiniciar o mundo (F8)

```
F8 (2x) -> rede.reiniciarMundo()        pedido, pacote 19 REINICIAR
        -> sala.reiniciarMundo()        o servidor desfaz o mundo
        -> MUNDO_REINICIADO (143)       vai pra sala INTEIRA
        -> cada cliente: location.reload()
```

Sozinho (sem servidor) o passo do meio não existe: recarregar já é o mundo
inicial, porque a cidade é determinística. O detalhe de **por que recarregar em
vez de desfazer peça por peça** está em `REDE.md`.

## Dinheiro e cassino

Duas moedas, e a diferenca entre elas e a regra do lugar:

| Moeda | Onde vale | Quem aposta |
|---|---|---|
| **Ouro** | na rua e na mesa da atendente | blackjack |
| **Ficha** | so dentro do cassino | poker e caca-niquel |

O caixa troca 1 por 1 nos dois sentidos. A carteira mora em `localStorage` e
**nao passa pela rede**: o protocolo (outro dono) nao tem pacote de dinheiro.

A separacao que importa: `src/cassino/*.js` sao **regras puras** — sem DOM, sem
three.js, sem `localStorage`, sem saber que dinheiro existe. Eles recebem uma
aposta e devolvem um `retorno`. Quem debita e credita e `src/ui/cassino-ui.js`.
E isso que permite `node tools/teste-cassino.mjs` provar as 84 regras do jogo
(contagem de As, 3:2 do blackjack, ordem das maos de poker, RTP do caca-niquel)
sem abrir navegador nenhum.

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
