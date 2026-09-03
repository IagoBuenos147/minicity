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
| `src/player/appearance.js` | `CATALOGS` | **agregador**: 6 cabeças, 5 olhos, 4 narizes, 3 bocas, 4 barbas, 3 cabelos, 3 sobrancelhas, 10 peles, 11 cores de cabelo, 9 cores de barba. Cada peça mora em `src/player/rosto/`; a matemática do crânio em `rosto/nucleo.js` (ver PERSONAGEM.md) |
| `src/player/roupas.js` | catálogos de roupa | **agregador**: chapéu 7, **camisas** 4 (blusa+jaqueta na mesma aba), calça 3, calçado 5, colar 4, anel 4, relógio 4, tatuagem 4. Cada catálogo em `src/player/roupa/`; as ferramentas em `roupa/nucleo.js` |
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
| `src/player/mao.js` | `criarMao(dep)` | **o que o jogador segura em 1ª pessoa.** Recebe um `build()` e uma ficha e segura o que vier — não conhece bebida nenhuma de nome. Pose da PEGA (não da peça), balanço tirado do `bobPhase` do controller e pose própria pra correr. Substituiu `ui/hotbar.js`, que era a barra separada de 2 itens (mãos/revólver) e está em `backup/ui/` |
| `src/render/luzes-efeito.js` | `criarPoolDeEfeito(scene, n, camera)` | 2 PointLight compartilhadas por TODOS os efeitos; ver a armadilha do recompile de shader no cabecalho do arquivo |
| `src/world/clima.js` | `criarClima(opts)` | as tres estacoes: sol, chuva e neve. Gotas (1 LineSegments com cor por vertice), respingos + coroa (2 InstancedMesh), flocos (1 Points), rajada de vento, relampago. Nao acumula nada no chao — quem faz isso e `neve.js`, que le `clima.cobertura` |
| `src/world/neve.js` | `criarNeve({groundY, ancoras})` | a neve PARADA: manto do chao, telhados, copas, arbustos, postes, lixeiras, bancos e pingentes de gelo. 5 InstancedMesh, construidas uma vez e reveladas por `setCobertura(0..1)` |
| `src/world/casino.js` | `buildCasino(game)` | o cassino inteiro (casca + miolo): fachada com neon e marquise, salao, mesa de blackjack, mesa de poker, 3 caca-niqueis, caixa e os 3 NPCs. Devolve tambem `girarMaquina(i, simbolos, aoTerminar)` e `festa(i)` |
| `src/cassino/carteira.js` | `criarCarteira({hud})` | ouro e fichas, em `localStorage`. Nao passa pela rede |
| `src/cassino/baralho.js` | `criarBaralho(n, rng)` | baralho de n x 52 com corte e reembaralho |
| `src/cassino/blackjack.js` | `criarBlackjack(opts)` | regras do blackjack (maquina de estados PURA: nao toca em dinheiro) |
| `src/cassino/poker.js` | `criarPoker(opts)`, `forcaDaMao(a,b)` | heads-up de 2 cartas contra a IA do ricaco (tambem pura) |
| `src/cassino/slots.js` | `criarSlots({rng})` | 3 roletes, tabela de pagamentos, RTP calculado (92%) |
| `src/cassino/cartas-3d.js` | `criarBaralho3D()` | a carta como SOLIDO: atlas de canvas com as 52 faces + verso num material so, geometria de canto arredondado com espessura, e os buffers pesados compartilhados entre todas as cartas |
| `src/cassino/mesa-3d.js` | `criarMesa3D(opts)` | o palco das duas mesas: distribuir em arco, virar pela borda, empilhar ficha, varrer o pote, acender o feltro, tremer. Sabe o TEMPO, nao sabe a regra |
| `src/cassino/faixa-mesa.js` | `criarFaixaMesa()` | a faixa fina de rodape que substituiu o painel modal das mesas: saldo, aposta, botoes e o cartaz de resultado. Nada cobre o feltro |
| `src/cassino/som-mesa.js` | `carta`, `virar`, `ficha`, `deslizar`, `dourado`, `baque`, `selo` | o som da mesa, sintetizado. Empresta o AudioContext de `audio/som.js` |
| `src/cassino/reacao-npc.js` | `acharNPC`, `criarReacao` | o ricaco reagindo a mao, por dois canais: a POSE (`npc.setPose` — ele senta com as maos no aro da mesa) e o DESVIO (`root.rotation.y`/`root.position`, filtrado por quadro). Escrever direto nas juntas nao vale: `npc.update()` as reescreve depois de nos |
| `src/systems/camera-cena.js` | `criarCameraCena(opts)` | a camera que entra na mesa e volta. Guarda o enquadramento do jogador, viaja pro seu, e devolve — ver a ordem-dentro-do-quadro no cabecalho |
| `src/ui/cassino-ui.js` | `criarCassinoUI(opts)` | os dois BALCOES em painel modal (caixa, caca-niquel) e as duas MESAS em 3D (blackjack, poker). E quem DEBITA e CREDITA a carteira |
| `src/armas/revolver.js` | `criarRevolver(opts)` | revólver de 6 balas, mira, recarga tambor a tambor, `aoAcerto` |
| `src/inventario/inventario.js` | `criarInventario(opts)` | as 9 vagas da mochila, que **são a barra de itens** (teclas 1–9, centrada no rodapé). `adicionar` é **atômico**: simula antes e só escreve se couber inteiro |
| `src/mobilia/bebidas.js` | `BEBIDAS`, `CATEGORIAS_BEBIDAS`, `bebidaDe`, `lataCerveja`, `garrafaVodka`, `garrafaWhiskey` | as bebidas: peças de MÃO, em pé com a base em y=0. Cada uma traz `mao: { pegaY, pegaR }`, que é o contrato com `player/mao.js` |
| `src/mobilia/catalogo.js` | `MOBILIA`, `itemDe`, `limiteDe` | os itens da loja (geometria + preço + pegada em metros). Um item = um `build()` que devolve um `Object3D` |
| `src/mobilia/caca-niquel.js` | `CACA_NIQUEIS` | as duas máquinas de rolete (`slot-madeira`, `slot-neon`): mesmos símbolos clássicos, gabinetes de linguagem oposta — nogueira envernizada com plinto e pés de canto contra esmalte vermelho com plinto único e topo de neon. `userData.update` só pulsa letreiro, nunca gira rolo sozinho |
| `src/mobilia/video-poker.js` | `VIDEO_POKER` | o gabinete de vídeo pôquer, único móvel com TELA VIVA: canvas 512×384 próprio de cada instância, jacks-or-better 9/6 escrito aqui (não vem de `cassino/poker.js`, que é pôquer de DUAS cartas). A tela é `MeshBasicMaterial` — é fonte de luz, não superfície iluminada |
| `src/world/loja-jogos.js` | `buildLojaJogos(game)` | a loja TACO DE OURO: fachada, salão, balcão, mostruário e a Wanda atrás do balcão |
| `src/world/hotel.js` | `buildHotel(game)` | o HOTEL PARAÍSO: casca própria (fachada em z0, marquise, 3 andares de sacada, letreiro de cobertura), porta de vidro automática, saguão com recepção, sala de espera, escada simbólica, elevador e a Íris |
| `src/world/concessionaria.js` | `buildConcessionaria(game)`, `CATALOGO_AUTO`, `criarGaragem`, `fotoDeVeiculo` | a GARAGEM DO NANDO: showroom com os quatro veículos de verdade em exposição, prato giratório, cavaletes de preço e o Nando. O catálogo e a "garagem" (o inventário de forma compatível com `loja-ui.js`) saem daqui, e é assim que ela usa a MESMA janela de loja do Taco de Ouro |
| `src/ui/loja-ui.js` | `criarLojaUI(opts)` | a janela de loja, usada por TRÊS lojas: abas, grade de cards com −/0/+, carrinho e o botão comprar. O catálogo, as abas, o título e as falas vêm de fora (`catalogo`, `categorias`, `kicker`, `titulo`, `falas`); sem eles, é a loja de jogos. Instâncias: Taco de Ouro (móveis), mercearia (bebidas) e Garagem do Nando (veículos) |
| `src/ui/miniatura3d.js` | `criarFotografo(renderer)` | fotografa um `build()` do catálogo num render target de 384 px e devolve um data URL. Cacheado por id |
| `src/systems/encaixe.js` | `criarEncaixe(opts)` | pôr e tirar móvel: fantasma verde/vermelho, pegada no chão, R/Q gira, segurar E guarda |
| `src/cenario/cenarios.js` | `criarCenarios(opts)` | os DOIS mundos e a troca entre eles. Grava o que cada cenário cria (grupos, colisores, occluders, interações, updates) e liga/desliga tudo de uma vez |
| `src/world/hudson/planta.js` | `PLANTA` | **dado, não código**: os 49 lotes das 4 ruas da Quadra Hudson, lidos das 35 fotos |
| `src/world/hudson/chao.js` | `buildChao()`, `groundY`, `Q` | asfalto, calçada, meio-fio, sarjeta e a pintura da rua, com a largura medida rua a rua |
| `src/world/hudson/lotes.js` | `montarLote(spec)` | o montador: transforma um lote da planta em geometria |
| `src/world/hudson/materiais.js` | texturas | reboco com umidade, telha colonial, chapa ondulada, tijolo, asfalto de poeira, terra, capim |
| `src/world/hudson/pecas-casa.js` | `casaTerrea`, `muro`, `portaoChapa`, … | a casa brasileira de rua, peça por peça |
| `src/world/hudson/pecas-infra.js` | `posteConcreto`, `redeAerea`, … | poste, fiação em catenária, boca de lobo, lixeira |
| `src/world/hudson/pecas-verde.js` | `aroeiraSalsa`, `coqueiro`, … | a vegetação do cerrado, espécie por espécie |
| `src/world/hudson/pecas-publico.js` | `quadraCoberta`, `escola`, … | quadra coberta, escola, praça, galpão, comércio, sobrado inacabado |
| `src/world/hudson/entorno.js` | `buildEntorno()` | o bairro que continua depois das 4 ruas, e os morros do fundo |
| `src/world/hudson/quadra.js` | `buildQuadraHudson(game)` | enfileira os 49 lotes, planta os postes, passa tudo pelo forno |
| `src/save/save.js` | `criarSave(fontes)` | os 5 lugares de jogo salvo. Não conhece módulo nenhum: recebe funções que leem e escrevem cada pedaço |
| `src/ui/save-ui.js` | `criarSaveUI(opts)` | a tela dos 5 lugares, nos modos `continuar` e `salvar`, com exportar/importar/apagar |
| `src/veiculos/veiculos.js` | `criarVeiculos(opts)` | carro, moto, skate e helicóptero: entrar/sair com E |
| `src/world/adega.js` | `buildAdega(game)` | a ADEGA 100: casca cega própria (chapa soldada, janelas emparedadas, a placa 100), porta de aço no beco com postigo, vestíbulo em cotovelo, salão com chopeira, e a operação atrás da tela de arame. Devolve `casca` e `miolo` separados — o miolo some por LOD, porque o prédio não tem por onde ser visto de fora |
| `src/mobilia/barril.js` | `barrilDeMadeira`, `criarTorneira`, `criarChopeira` | o barril de chope e a torneira que jorra. A coluna CRESCE pra baixo ao abrir e ENCOLHE PELO TOPO ao fechar; `cortar(true)` faz ela terminar dentro do copo |
| `src/mobilia/copos.js` | `COPOS`, `copoDe`, `ehCopo` | os três copos (americano, tulipa, caneca) e o líquido dentro deles. O corpo é UM lathe fechado; o líquido é REGERADO a cada mudança de nível, nunca escalado |
| `src/mobilia/destilados.js` | `ADEGA_CATALOGO`, `ADEGA_CATEGORIAS` | o que a adega vende além do chope: gin, pinga de alambique, garrafão, long neck e a GARRAFA BATIZADA. Importa a vodka, o whiskey e a lata de `bebidas.js` e só troca o preço |
| `src/player/copo.js` | `criarCopo(opts)` | o copo na mão: ocioso → esticado → cheio → bebendo → vazio, num botão só. `mirar()` põe o copo no espaço de câmera do bico da torneira, que é o que faz o jorro cair DENTRO dele |
| `src/systems/pisos.js` | `criarPisos(base)` | **o chão com mais de um andar**. Guarda lajes e rampas com altura e responde pela terceira entrada que `groundY(x,z)` não tem: a altura em que o jogador já está. Fora das lajes registradas, repassa pro chão da cidade |
| `src/world/cortico.js` | `buildCortico(game)` | o CORTIÇO 117: três andares, corredor com doze portas, escada em U de verdade e dois apartamentos que abrem. Colisão ligada **por andar**; um grupo de geometria por piso, com LOD |
| `src/audio/som.js` | `bater()`, `porta()` | o primeiro som do jogo, **sintetizado** (sem asset, como o resto). O toc-toc-toc da porta e o rangido da dobradiça |
| `src/ui/legenda.js` | `criarLegenda()` | a legenda de rodapé da cutscene, extraída pra quem quiser. Mesma posição, mesmo tamanho, mesma fonte |
| `src/render/fumaca.js` | `criarFumaca(opts)` | baforada de fumaça numa InstancedMesh só, com billboard copiado da câmera |

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

## A ADEGA 100 — o estabelecimento que nao pode parecer um

O pedido foi "uma adega de bebidas que NAO represente uma loja de bebidas". Isso
nao e um tema: e uma restricao de construcao, e ela decidiu tudo.

**A casca nao anuncia nada.** O predio 100 (que era o `FILLERS[0]`, e de onde
vem o nome — `city.js` numerava os predios de cenario com `100 + bi * 17`)
continua sendo o galpao cinza que sempre foi da rua do anel. A porta de carga e
uma chapa de enrolar com dois cordoes de solda em X; as janelas do terreo estao
emparedadas com tijolo NOVO, que e o unico material limpo do predio inteiro
(reparo recente le como escondido); a placa do numero pende de um parafuso so.
Nao ha letreiro, e `signColor` e cinza — a unica cor de letreiro do mapa que nao
e cor nenhuma, num mapa em que cada casa grita a sua.

**A porta e no beco, e ela pergunta.** A entrada fica na face z1, na fresta de
3,1 m entre este predio e os fundos da barbearia. Na primeira vez a abertura tem
duas etapas: o postigo corre, alguem olha por um segundo, o postigo fecha e SO
ENTAO a tranca corre. Da segunda em diante ela e so uma porta.

**Entra-se de lado.** O vestibulo nao da pro salao: da numa parede. O vao fica
na quina noroeste, com cortina de tiras. E um COTOVELO, e ele existe pra que o
beco nunca enxergue o balcao quando alguem entra.

**A mercadoria nao se esconde de quem ja entrou.** Atras do barman ha uma tela
de arame e, atras dela, o alambique no fogo, as bombonas, a mesa de envase e as
garrafas de rotulo arrancado. Quem pede um chope pede olhando pra dentro daquilo.

### Duas contas que moldaram o arquivo

**Luz.** Quatro PointLight, nenhuma com sombra: balcao (ambar forte), estante
(ambar), fundos (verde-fria) e vestibulo (vermelha fraca). A terceira nao
ilumina — ela CONTRASTA, e e o unico truque de luz do lugar. A quarta foi paga
com uma foto: o vestibulo, so com o bulbo emissivo, saiu preto de verdade. As
PointLight moram na RAIZ e nao no miolo, porque o miolo some por LOD e luz que
some muda a contagem de luzes da cena — que e a recompilacao de shader que
`render/luzes-efeito.js` foi escrito pra evitar.

**Draw calls.** O predio e uma caixa fechada: de fora ninguem ve o miolo, nunca.
Mas o three so tem frustum, nao oclusao — parado no cruzamento central, a 45 m,
o jogador desenhava as 309 malhas de dentro atras de uma parede de concreto, e o
teste de fumaca pegou (318 draw calls a mais, teto de 1200). Por isso a casca e
o miolo sao grupos separados, cada um vai pro forno sozinho, e o miolo so fica
visivel com o jogador dentro do lote mais 5 m de folga. Depois disso a adega
custa 41 draw calls vistos da rua.

### O ciclo do copo (um botao so)

```
ocioso  --clique (copo vazio)-->  esticado
esticado --clique-------------->  ocioso            (abaixa sem receber)
esticado --embaixo do jorro---->  ocioso, copo CHEIO
ocioso (cheio) --clique-------->  um gole a menos
...ate zerar, e ai o clique volta a esticar a mao.
```

`player/copo.js` e um modulo proprio e nao um caso dentro de `player/mao.js`
pela mesma razao que o revolver tambem nao esta la: a mao generica SEGURA o que
vier, e um copo se USA. A mecanica de camera (matriz montada a mao, troca de pai
por modo de camera) e copiada dos dois, de proposito.

A peca que faz o gesto funcionar e `copo.mirar(ponto)`: com o copo colado na
camera e a torneira no mundo a um metro, sem ela o jorro cai ao lado do copo.
`mirar` poe o alvo da pose no ESPACO DE CAMERA do bico, e `torneira.cortar(true)`
encurta a coluna pra ela terminar dentro do vidro.

## O TRAVAMENTO PERTO DAS LOJAS — a regra da luz na raiz

O dono relatou "travamentos e quedas de FPS ao chegar perto da loja de carros ou
do hotel". Travao e queda de FPS sao coisas diferentes e tem causas diferentes,
e neste caso era travao: engasgos de varios quadros, SEMPRE NOS MESMOS PONTOS do
mapa, nos dois sentidos.

**A causa.** Tres lojas tinham as PointLight DENTRO do grupo que o LOD delas
esconde por distancia:

| modulo | luzes | raio do LOD | onde estavam |
|---|---|---|---|
| `world/hotel.js` | 2 | 52 m | `forroELuz(dentro)` |
| `world/concessionaria.js` | 2 | 52 m | `forroELuz(dentro)` |
| `world/loja-jogos.js` | **4** | **32 m** | `forroELuz(group)` — a raiz do modulo |

Grupo invisivel quer dizer que o `projectObject` do three nao empurra as luzes
dele pra lista do quadro. E o programa de shader de CADA material da cena e
montado a partir da CONTAGEM DE LUZES VISIVEIS: mudou a contagem, todo material
vira programa novo e o renderer recompila a cena inteira no meio do quadro.

E a armadilha que `render/luzes-efeito.js` documenta desde que existe, e que
`world/adega.js` e `world/cortico.js` ja evitavam de proposito. As tres lojas
mais antigas nao.

**A medida.** Uma sonda que conta a visibilidade EFETIVA (a luz E todos os pais)
andando pela avenida:

```
z=  20   luzes visiveis = 20
z= 2.3   luzes visiveis = 22   <<< garagem entrou
z=-0.7   luzes visiveis = 24   <<< hotel entrou
```

e no Taco de Ouro, 20 -> 24 num passo so. Tres recompilacoes numa descida.
Depois do conserto a contagem fica parada em 28, e o numero de programas do
renderer caiu de **124 para 51**.

Atencao pra um detalhe que faz a diferenca entre achar e nao achar: contar
`o.visible` da propria luz NAO acha nada. `Object3D.traverse` nao pula subarvore
invisivel, e quem o LOD desliga e o GRUPO em volta — a luz continua com o flag
dela ligado. Tem que subir a cadeia de pais.

**A regra, agora com trava.** LUZ DE INTERIOR MORA NA RAIZ DO MODULO, nunca
dentro do que o LOD esconde. Ela continua custando o laco por fragmento (a
contagem e constante, que e justamente o ponto), e iluminar um comodo que
ninguem esta vendo nao acende pixel nenhum a mais. `tools/smoke.mjs` tem um caso
que anda pelas quatro fronteiras e reprova se a contagem se mexer.

**Dois outros custos por quadro, achados na mesma varredura e tambem corrigidos:**

- `systems/encaixe.js` — `movelNaMira()` fazia `Box3.setFromObject` (que percorre
  a subarvore inteira do movel) pra CADA movel instalado, todo quadro, sem teste
  de distancia: o custo crescia com o quanto o jogador tinha comprado, em
  qualquer lugar do mapa. Agora ha uma peneira de distancia antes da caixa.
- `world/city.js` — a agua da fonte deformava 735 vertices (`sqrt` + 3 `sin`
  cada) e chamava `computeVertexNormals()` duas vezes por quadro, sempre, com o
  jogador a oitenta metros dela. Agora so ondula dentro de 34 m.

Fica registrado tambem, sem conserto por enquanto: `cenario/cenarios.js` liga e
desliga TODAS as luzes de poste de uma vez quando o sol cruza o horizonte
(`lighting.js` chama quando `sunDir.y` passa de 0.02). E a mesma recompilacao,
so que duas vezes por ciclo de dia em vez de a cada esquina. O conserto certo e
o mesmo do pool de efeito: deixar as luzes na cena e zerar a `intensity`.

## O CORTICO 117 — e o dia em que o jogo ganhou ANDAR

O pedido foi "aqueles lugares de filme de acao onde varias pessoas moram
proximas e tem um espaco que so tem portas, corredores com portas". Isso e um
CORTICO, e a forma dele nao e decoracao: e a planta — corredor unico no meio,
portas dos dois lados, escada numa ponta, tres andares iguais empilhados. Doze
portas; DUAS abrem.

### O problema que ele quebrou

Todo interior deste jogo era TERREO. A altura do piso e uma funcao
`groundY(x, z) -> y`: uma cota por metro quadrado. Ela deu conta de calcada,
rua, parque, beco e piso de loja — e nao consegue responder "0,16" e "3,16" pro
MESMO ponto, que e o que um predio de tres andares pede.

Foram tres pecas:

**1. `systems/pisos.js` — a terceira entrada.** A pergunta deixa de ser
ambigua quando entra a altura em que o jogador JA ESTA: de todas as lajes que
cobrem o ponto, vale a mais alta que ainda esta ao alcance do pe. O controller
nao mudou uma linha — quem monta o amostrador em `main.js` e um closure que ja
tem o jogador na mao e le `player.position.y` sozinho.

**2. A colisao por andar, em `cortico.js`.** `systems/collision.js` e uma grade
XZ sem altura: parede de segundo andar empurra quem esta no terreo. Cada colisor
do predio nasce com o numero do andar dele e so o conjunto do andar atual fica
`ativo`. Isso obriga a geometria de cada andar a ser separada — o que sai de
graca, porque ai da pra apagar por LOD os andares que ninguem esta vendo.

**3. As escadas sao RAMPA pro pe e DEGRAU pro olho.** O controller cancela o
avanco horizontal quando o piso sobe mais que `LEVELS.STEP_MAX` num quadro;
escada modelada como degraus de verdade so seria subivel aos solavancos, um por
espelho.

### Duas armadilhas que custaram caro, e as duas sao do mesmo lugar

`cenario/cenarios.js` GRAVA tudo que a cidade cria e, ao mostrar o cenario,
DEVOLVE o estado — e o padrao dele e "ligado".

- **Ele religa os colisores.** `ligarAndar()` roda na construcao; `mostrar()`
  roda depois e poe `ativo = true` em tudo. O predio nascia com as paredes dos
  tres andares ligadas ao mesmo tempo, e o sintoma era parede invisivel no meio
  do corredor. A saida e uma SENTINELA: um colisor conhecido do 1o andar; se ele
  estiver ligado com o jogador em outro andar, alguem religou por fora e a
  selecao e refeita. Isso tambem cobre o F6 de volta pra cidade.
- **Ele reinstala o amostrador de chao.** `mostrar()` chama
  `player.setGroundSampler(reg.groundY)`. Instalar o amostrador de andares so em
  `main.js` nao adiantava: o cenario o sobrescrevia no boot e o jogador
  atravessava o predio inteiro no nivel da rua. O amostrador tem que ser o
  `groundY` DO REGISTRO do cenario.

### A batida na porta

`E` na porta -> toc toc toc -> dois segundos -> o morador levanta do sofa,
atravessa a sala, a porta gira, ele te recebe pela legenda do rodape, sai da
frente, volta e senta. Continua fumando: o cigarro e enrolado a mao, a brasa
acende na tragada e a fumaca sai de `render/fumaca.js` — um fiapo continuo da
ponta acesa e uma baforada de verdade quando ele solta.

O som e o PRIMEIRO do jogo (`audio/som.js`) e e sintetizado, pela mesma regra
que vale pra geometria e pra textura: nenhum asset externo. Uma batida em porta
de madeira e um estalo de ruido, duas senoides graves e um baque — e sao TRES,
com o ritmo desigual de mao humana.

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

A separacao que importa: `blackjack.js`, `poker.js`, `slots.js` e `baralho.js`
sao **regras puras** — sem DOM, sem three.js, sem `localStorage`, sem saber que
dinheiro existe. Eles recebem uma aposta e devolvem um `retorno`. Quem debita e
credita e `src/ui/cassino-ui.js`. E isso que permite `node tools/teste-cassino.mjs`
provar as 84 regras do jogo (contagem de As, 3:2 do blackjack, ordem das maos de
poker, RTP do caca-niquel) sem abrir navegador nenhum. Os arquivos vizinhos
`cartas-3d.js`, `mesa-3d.js`, `faixa-mesa.js`, `som-mesa.js` e `reacao-npc.js`
sao a CARA da mesa e nao entram nessa conta: eles importam three e o DOM, e por
isso o teste nunca os toca.

### As duas mesas nao sao mais um painel

O pedido foi literal: *"nao quero que ao iniciar o blackjack surja um HUD, quero
que aproxime na mesa, como se fosse um simulador"*. Entao o cassino tem dois
modos de UI, e eles sao diferentes ate o osso:

| | balcao (caixa, caca-niquel) | mesa (blackjack, poker) |
|---|---|---|
| forma | janela modal, cobre a tela | camera viaja ate o feltro |
| cartas | — | objetos 3D com espessura e sombra |
| controles | dentro da janela | faixa fina no rodape |
| o jogador | travado, mouse solto | travado, mouse solto, **3a pessoa a forca** |

**A 3a pessoa a forca** nao e capricho: em 1a pessoa o que o jogador segura
(garrafa, copo, revolver) e FILHO DA CAMERA, e viajaria junto com a lente pra
ficar pendurado no meio do feltro. Em 3a, os tres modulos de mao escondem a peca
sozinhos (todos leem `player.mode`) e o boneco fica atras da lente.

**A saida tem ordem fixa, e ela e a parte que quebra em silencio.** O
`cortar()` de `camera-cena.js` ja devolve o controle ao jogador. Se
`cassinoUI.aberto` virasse false junto, o `main.js` voltaria a ouvir o E, as
teclas 1-9 e o clique de tiro ENQUANTO a camera ainda esta voltando — o jogador
saca o revolver na mesa. Por isso: esconde a faixa -> `camera.sair({ aoSair })`
-> e so no `aoSair` o modo cai pra null.

**O tamanho da carta na tela e uma conta, nao um chute.** A carta esta deitada,
entao o que se ve dela encolhe com o SENO da inclinacao da lente: uma camera "de
quem esta em pe na corda" (25 graus) deixa a carta em 8% da altura da tela por
mais que o campo feche. Os enquadramentos de `mesa-3d.js` foram medidos
projetando as bordas de uma carta — 20% no blackjack, e no poker 5% no plano que
mostra o ricaco mais dois mergulhos de 24% e 20% nos momentos que importam.

## A mochila, a loja e a mobília

Quatro módulos que se seguram pelas bordas. A ordem entre eles é a regra:

1. **A mochila tem 9 vagas e é a única verdade sobre o que o jogador carrega.**
   `adicionar(id, qtd)` devolve o índice da última vaga usada, ou `-1`. Ele é
   **atômico**: `simular()` roda a distribuição inteira em memória e só então a
   função escreve. A versão ingênua — perguntar "cabe?" e depois "adiciona" —
   mente quando o item ocupa mais de uma vaga: responde sim contando vaga por
   vaga e depois enche a mochila pela metade, com o preço já cobrado.

2. **A compra é espaço → ouro → entrega, nessa ordem.** `loja-ui.js` chama
   `vagasNecessarias()` (que simula o carrinho INTEIRO), depois
   `carteira.gastarOuro`, e só então `inventario.adicionar`. Na ordem trocada o
   jogador paga por um móvel que não tem onde caber.

3. **O encaixe faz três testes, e todos vêm da CASA.** `casa.zonasDeMovel`
   entrega as `zonas` (retângulos onde a pegada tem que caber INTEIRA) e os
   `proibidos` (vão da porta, passagens), cada um com o seu `motivo` — que é o
   texto que o jogador lê no prompt. O terceiro teste é contra os móveis já
   postos. Verde só quando os três passam.

4. **A pegada não é o gabinete.** A mesa de sinuca de 7 pés mede 3,10 × 4,14 m
   de pegada, mas o colisor registrado é a caixa do móvel — a folga do taco é
   espaço de USO, e o jogador tem que poder andar nela.

`podeEm(id, x, z, giro)`, `mirarEm(x, z, giro)` e `guardarEm(i)` existem para o
teste de fumaça e para o console: mirar com a câmera num teste testaria o
raycaster, e não os três testes de encaixe, que são o que importa.

5. **Móvel posto pode ter quadro, e quem dá é o encaixe.** Até as máquinas
   caça-níquel, todo móvel era geometria parada: o encaixe punha no chão e
   acabava. A tela do vídeo pôquer precisava rodar uma partida sozinha, e daí
   nasceu `encaixe.atualizar(dt)` (chamado no `main.js`, ao lado do
   `mercadoUI.atualizar`). A regra é curta: se o grupo que o `build()` devolve
   tiver `userData.update = (dt, obj) => {}`, ele recebe quadro — **e só
   enquanto o jogador estiver a menos de 14 m** (`PERTO_UPDATE`). Longe disso a
   função nem é chamada, então a peça pausa sozinha sem custar nada e sem
   precisar de cuidado nenhum de quem a escreve.

   **A ordem importa e quebra dos dois lados.** `bakeStatic()` funde tudo que
   não estiver marcado, e a marca sobe pelos pais. Se o grupo topo já tiver o
   `.update` ANTES do `bakeStatic(grupo)`, a subida bate nele para qualquer
   filho e **nada funde** — o gabinete inteiro fica em dezenas de draw calls. Se
   a parte viva não carregar `userData.dynamic` própria, ela **funde junto** e
   para de atualizar para sempre. A sequência certa é: montar (marcando só a
   parte viva) → `bakeStatic(grupo)` → só então `grupo.userData.update`.

   Custo: a tela é um canvas 512×384 que **não** se redesenha todo quadro. Só
   redesenha quando algo mudou nela, e ainda passa por um acumulador que trava o
   ritmo em ~8 Hz. Fora dos eventos, `atualizar()` só adianta temporizadores.

## Dois mundos, e a tecla que troca

O jogo tem **dois cenários**: a cidade do cassino e a **Quadra Hudson**, um
quarteirão real de Paracatu-MG reconstruído a partir de 35 fotos do Street View.
`F6` troca, `F7` faz o cenário sumir.

**O problema não é desenhar o segundo mundo: é desligar o primeiro.** Um cenário
deixa marca em seis lugares, e esquecer um só quebra o jogo:

| onde | o que acontece se esquecer |
|---|---|
| a cena (`Object3D`) | o mundo velho continua aparecendo |
| os colisores | jogador batendo numa **parede invisível** |
| os occluders | a câmera pulando por cima de prédios que sumiram |
| as interações | "Falar com o barbeiro" no meio de uma rua vazia |
| os updates | pagar o custo do mundo escondido para sempre |
| o `groundY` | andar enterrado no chão, ou voando |

Por isso `cenario/cenarios.js` **não pede para ninguém registrar nada**. Ele
**grava**: durante a construção, as portas de entrada do mundo (`collision.add`,
`collision.addOccluder`, `interaction.add`, `scene.add`) ficam grampeadas, e tudo
que passa por elas entra na conta daquele cenário — inclusive o que nasceu lá no
fundo de um `buildCity` que o módulo nunca vai ler.

**Apagar guarda o estado; acender devolve o que estava.** Não é "religar tudo":
o colisor do vão da porta da casa velha fica `ativo = false` enquanto a porta
está **aberta**, e religá-lo no cego poria uma parede invisível numa porta
escancarada. A luz do poste, idem — ela é invisível de dia.

A Quadra Hudson é construída **na primeira vez que entra em cena**, e não no
boot: são 17 mil malhas antes do forno, e cobrar isso de quem nunca aperta F6
seria cobrar de todo mundo pelo que poucos usam.

## A Quadra Hudson

Quatro ruas reais em volta de um quarteirão público (escola em L, quadra
poliesportiva coberta e praça):

| rua | lado | pista | calçada |
|---|---|---|---|
| R. Josué Félix Caixeta | sul | 7,0 m | 1,8 m |
| R. Frei Pedro Caixito | norte | 8,0 m | 3,6 m |
| R. Jorge Araújo Caldas | leste | 7,5 m | 2,2 m |
| R. Padre Josino | oeste | 7,0 m | 2,0 m |

**A planta é dado, o montador é código.** `planta.js` tem os 49 lotes com
testada, tipo, cores, portões e extras; `lotes.js` é o único que sabe virar isso
em geometria. Corrigir a cor de um muro depois de olhar melhor uma foto é trocar
uma string — nunca mexer em three.js.

**Todo lote nasce com a origem no chão, no meio da testada, com +Z para a rua.**
Quem monta o quarteirão posiciona e gira; nenhum lote sabe onde fica. Os
colisores saem em coordenada local e são rodados para AABB pelo montador.

**O que uma leitura de fotos erra, e o que se fez com isso.** Quatro agentes
leram uma rua cada, e um crítico cruzou as quatro contra as fichas. Ele achou
três defeitos reais, todos corrigidos em `gera_planta`: as quatro ruas
descreviam **o mesmo** quarteirão público de fora (duas chamavam de
"quarteirão", duas de "oposto"); a **mesma** quadra coberta aparecia três vezes
e teria virado três ginásios; e o número pintado no muro da esquina lê 210, não
240.

**Custo.** O bairro sai do montador com 17 mil malhas e 7.800 draw calls — seis
vezes o orçamento do jogo inteiro. `bakeStatic` funde por material e derruba
para 245 malhas e ~250 draw calls. O entorno (bairro vizinho + morros) já nasce
fundido em três malhas e **não passa** pelo forno.

## Save em cinco lugares

`src/save/save.js` **não importa módulo nenhum do jogo**. Ele recebe de `main.js`
um objeto de funções (`lerOnde`/`escreverOnde`, `lerAparencia`/`escreverAparencia`,
`lerInventario`/`escreverInventario`, …). Se conhecesse os módulos, cada um deles
passaria a ter dois donos — e no dia em que `player.teleport` mudasse de
assinatura o save quebraria em silêncio.

**O que entra:** nome, aparência (os 20 índices **e** as 4 cores cruas, que não
cabem no protocolo e por isso só sobrevivem a um F5 aqui), carteira, posição,
missões feitas, hora do dia, itens destravados, mochila e a mobília instalada.

**O que não entra:** as OPÇÕES (são da máquina, não do personagem — carregar um
save não pode mudar a sensibilidade do mouse) e o MUNDO COMPARTILHADO (o dono
dele é `servidor/sala.js`; uma segunda verdade sobre ele é bug garantido no coop).

**Grava sozinho** no fim da cutscene, em cada compra, ao pôr ou tirar um móvel e
a cada missão concluída. `salvar()` agrupa em 400 ms: escrever no `localStorage`
é síncrono e trava a thread do desenho, e entrar na casa dispara missão, toast e
gravação no mesmo quadro. **F5** abre a tela para escolher o lugar na mão.

Quem entrou pelo botão JOGAR não escolheu lugar nenhum: a primeira gravação cai
no primeiro lugar VAZIO, e com os cinco ocupados **não grava** — apagar o jogo de
três horas de alguém para gravar um de três minutos é o pior erro que um save
pode cometer.

`esquema` sobe quando o formato muda de um jeito que o leitor velho não entende.
Ler um lugar de esquema mais novo devolve `null` em silêncio.

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

### `player/appearance.js` (agregador) e `player/rosto/`
```js
// cada catálogo: [ { id, nome, metodo, build(ctx) => THREE.Object3D | null } ]
export const CABECAS, OLHOS, NARIZES, BOCAS, BARBAS, CABELOS, SOBRANCELHAS
export const PELES, CORES_CABELO, CORES_BARBA
export const CATALOGS      // { cabeca, olhos, nariz, boca, barba, cabelo, pele,
                           //   corCabelo, corBarba, sobrancelha }
export function defaultAppearance()
```
Os grupos devolvidos por `build()` já vêm no espaço da **face**: origem no centro
da cabeça, `+Z` para frente, `+Y` para cima, em metros.

**A superfície da cabeça é uma API**, em `src/player/rosto/nucleo.js` — e é dela
que TODA peça de rosto lê para ficar grudada na pele:

```js
useHead(ctx)                    // SEMPRE a primeira linha de um build de rosto
surfaceZ(x, y, pad)             // Z da pele na FRENTE, no ponto (x, y)
surfaceX(y, z, pad)             // X da pele na LATERAL
eggSurface(theta, az, s, out)   // ponto da pele em coordenada esférica
eggNormal(theta, az, out)       // a direção em que um pelo nasce ali
wrapToHead(geo, pad)            // projeta uma geometria plana sobre a pele
deformEgg(geo, s, opts)         // deforma uma esfera no formato do crânio ativo
headShell / scalp               // cascas recortadas (cabelo, barba)
tecelagem() / fio() / peloMat() // pelo fio a fio, tudo numa BufferGeometry só
soldarNormais(geo)              // funde as normais dos vértices na MESMA posição
```

Cabeça: elipsoide de raios base `rx=0.135, ry=0.185, rz=0.13` **multiplicados por
`HEAD_S`** (hoje 1.33) — raios efetivos `rx=0.180, ry=0.246, rz=0.173`, centro em
`y=0`. **Toda medida facial nova precisa ser multiplicada por `HEAD_S`**, senão
desencaixa. O contrato completo está em `src/player/rosto/CONTRATO.md`; o das
roupas em `src/player/roupa/CONTRATO.md`.

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

Referência: *Schedule I* — estilizado, mas com anatomia crível.

- Cabeça: seis crânios de silhuetas diferentes, cada um construído por um método
  próprio. Altura ≈ 0.47 a 0.58 m → ~1/4 do corpo.
- Olhos: **a peça mais importante do jogo**. Pálpebra de geometria cortando o
  globo por cima, íris com anel limbal escuro, um ponto de brilho especular, e o
  globo **dentro** da órbita. Cinco olhos, cinco métodos de construção.
- Sobrancelhas e barba: com **pelo visível** (`tecelagem()` + `fio()`).
- Boca: um dos três é o traço escuro fino e largo da referência.
- Corpo: torso com cintura e seção de superelipse (não é um tubo oval), ombros
  estreitos com deltoide, membros **afilados** (não cilindros), mãos com dedos de
  proporção real.
- Proporção geral tipo *Rick and Morty* / *Schedule I*.

**As três armadilhas deste personagem**, todas já pagas em bug (detalhe em
PERSONAGEM.md):

1. **Costura de revolução não soldada** → listra acesa no meio do peito e nos
   braços. `soldarNormais()` / fechar a volta por índice.
2. **Winding invertido** → a peça não some, fica cinza e chapada. Regressão em
   `node tools/teste-normais.mjs`.
3. **Apelido de campo virando estado** (`eyes` junto de `olhos` no mesmo objeto)
   → a peça simplesmente não troca, sem erro nenhum.
