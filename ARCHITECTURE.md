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
| `src/ui/cassino-ui.js` | `criarCassinoUI(opts)` | os 4 paineis (caixa, blackjack, poker, caca-niquel). E quem DEBITA e CREDITA a carteira |
| `src/armas/revolver.js` | `criarRevolver(opts)` | revólver de 6 balas, mira, recarga tambor a tambor, `aoAcerto` |
| `src/inventario/inventario.js` | `criarInventario(opts)` | as 9 vagas da mochila, que **são a barra de itens** (teclas 1–9, centrada no rodapé). `adicionar` é **atômico**: simula antes e só escreve se couber inteiro |
| `src/mobilia/bebidas.js` | `BEBIDAS`, `CATEGORIAS_BEBIDAS`, `bebidaDe`, `lataCerveja`, `garrafaVodka`, `garrafaWhiskey` | as bebidas: peças de MÃO, em pé com a base em y=0. Cada uma traz `mao: { pegaY, pegaR }`, que é o contrato com `player/mao.js` |
| `src/mobilia/catalogo.js` | `MOBILIA`, `itemDe`, `limiteDe` | os 9 itens da loja (geometria + preço + pegada em metros). Um item = um `build()` que devolve um `Object3D` |
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
