# Personagem — contrato da reforma visual

Referência: as fotos do jogo *Schedule I*. Cada personagem lá tem **identidade
visual própria** — cabeça de formato diferente, olhos semicerrados com pálpebra
de verdade, barba com pelo, roupa com volume. É isso que se busca.

---

## 1. A aparência (o formato que viaja pela rede)

**20 bytes**, um por campo, todos índices (nunca cor crua). Ordem fixa — a ordem
desta tabela **é** o protocolo.

| # | campo | opções | observação |
|---|---|---|---|
| 0 | `cabeca` | 12 | formatos de crânio (6 originais + ovalada, achatada, alongada atrás, diamante, trapézio, coração) |
| 1 | `olhos` | 14 | todos de desenho; cada um traz a própria íris e a própria pálpebra. Os 10 últimos mudam só o **miolo**: detalhe chapado (olheira, brilho duplo, cílios, anel na íris) e depois a pupila (miniatura, gigante, fenda de gato, íris tripla, reflexo em meia-lua). A íris raiada saiu por recusa do dono |
| 2 | `palpebra` | 11 | **barra**: 0 = aberto, 10 = fechado. Ocupa o byte que era da pupila |
| 3 | `nariz` | 1 | **campo morto**: o catálogo esvaziou, viaja sempre 0 |
| 4 | `boca` | 17 | todas são linha |
| 5 | `barba` | 25 | 0 = sem barba. As 24 últimas são o cartaz de 24 estilos de barbearia inteiro, na ordem do cartaz. `cheia`, `stubble` e `costeletas` saíram por recusa do dono |
| 6 | `cabelo` | 21 | os 18 últimos saem de um cartaz de cortes masculinos. `raspado`, `undercut` e `trancinhas` saíram por recusa do dono (filtro em `appearance.js`, o código continua nos arquivos) |
| 7 | `pele` | 10 | tom |
| 8 | `corCabelo` | 11 | |
| 9 | `sobrancelha` | 12 | variam formato E espessura do fio ao mesmo tempo |
| 10 | `chapeu` | 11 | 0 = nenhum. O `bone` antigo saiu por recusa do dono; entraram cowboy elite, gorro elite, boné novo, boina e capacete. **Regra do catálogo: nenhum pano abaixo de y=0,136** na região acima do olho — abaixo disso a bola do olho atravessa o chapéu |
| 11 | `calcado` | 10 | 0 = descalço. A `bota` saiu por recusa do dono; entraram tênis de corrida, tênis de skate, sapato social, bota de cowboy, tênis cano alto e bota chelsea |
| 12 | `blusa` | 12 | 0 = nenhuma. A aba se chama **CAMISAS**. O catálogo foi REFEITO: das antigas só o `moletom` ficou (o único de dupla casca, com avesso visível na borda) e entraram 10 modas novas — regata, polo, flanela, corta-vento, havaiana, camisa de time, tricô, jaqueta jeans, oversized e colete |
| 13 | `calca` | 13 | quatro delas são **bermudas**. As 10 novas saíram da mesma lista de modas das camisas, pra as duas abas combinarem |
| 14 | `colar` | 7 | 0 = nenhum. Só o `crucifixo` sobreviveu da leva antiga — foi o único aprovado, e o **caimento** dele (cordão que desce e pingente com peso no esterno) virou o padrão dos cinco novos. O colar **balança** ao andar: ver `animation.js`, `balancarColar` |
| 15 | `anelAcess` | 4 | 0 = nenhum |
| 16 | `tatuagem` | 4 | 0 = nenhuma |
| 17 | `relogio` | 4 | 0 = nenhum |
| 18 | `jaqueta` | 1 | **campo morto**: jaqueta virou camisa, viaja sempre 0 |
| 19 | `corBarba` | 9 | **novo**. 0 = igual ao cabelo. Gastou o byte de reserva |

**A versão do protocolo NÃO subiu** por causa do `corBarba` nem do `palpebra`, e é
de propósito: o pacote continua com 20 bytes, a posição de todos os outros campos
é a mesma, e o valor que um cliente velho manda nesses bytes é 0 — que quer dizer
"igual ao cabelo" e "olho aberto", exatamente o que ele desenhava antes. O
cliente velho continua certo sem saber.

O byte 2 já trocou de dono uma vez: era `pupila`, o catálogo morreu quando a íris
virou parte de cada olho, e ele ficou viajando zero até a barra da pálpebra
precisar de um lugar.

`APARENCIA_OPCOES` (em `src/comum/protocolo.js`) **tem que acompanhar o tamanho
real dos catálogos**. Quando ficou para trás, o efeito foi invisível e cruel: o
boneco local ficava certo e o byte que viajava era cortado, então a cabeça 12
chegava como 7 na tela dos outros, sem erro nenhum no console.

---

## 2. Onde mora cada coisa

O `appearance.js` de 2300 linhas e o `roupas.js` de 3000 foram quebrados. Cada
peça é um arquivo; a matemática compartilhada é um núcleo.

| Arquivo | O quê |
|---|---|
| `src/player/rosto/nucleo.js` | **a matemática do crânio** + as ferramentas de rosto (pelo, cor, casca) |
| `src/player/rosto/CONTRATO.md` | como escrever uma peça de rosto. Leia antes de mexer |
| `src/player/rosto/{olho-cartoon,olho-extra,boca,boca-extra,barba,barba-extra,cabelo,cabelo-extra,cabelo-corte,sobrancelha,sobrancelha-extra}.js` | um catálogo cada (os `-extra`/`-corte` entram no fim da lista do irmão, nunca no meio: índice de catálogo é o que está salvo no save e o que viaja na rede) |
| `src/player/appearance.js` | agregador: reexporta tudo com os nomes antigos |
| `src/player/roupa/nucleo.js` | as ferramentas de roupa (casca, folga, perfil do corpo) |
| `src/player/roupa/CONTRATO.md` | como escrever uma peça de roupa |
| `src/player/roupa/{chapeus,calcados,camisas,calcas,colares,aneis,relogios,tatuagens}.js` | um catálogo cada |
| `src/player/roupas.js` | agregador |
| `src/player/character.js` | o corpo, as mãos, os slots |
| `src/player/animation.js` | idle, passada, ar, sentado |
| `src/player/controller.js` | câmera e head look |
| `src/ui/customizer.js` | abas, grade de cards, o painel do jogo |
| `src/ui/criacao.js` | a tela cheia de criação |
| `src/ui/provador.js` | o palco 3D e as miniaturas dos cards |
| `backup/personagem/` | os catálogos antigos, inteiros, do jeito que estavam |

---

## 3. A cabeça — campo + malha

Seis crânios: **redonda, comprida, quadrada, pera, realista, mandíbula**.

O pedido foi "métodos diferentes, não a mesma cabeça com o parâmetro mexido".
Mas quem escreve seis geometrias na mão perde a única coisa que faz o rosto
funcionar: um jeito de perguntar *onde está a pele em (x, y)* para colar o olho
ali. Daí a separação:

- **CAMPO** — uma função analítica que responde "qual o raio da pele nessa
  direção". É dela que `surfaceZ()` / `eggSurface()` leem, então qualquer traço
  cai na pele em qualquer crânio. Termos de escultura: afinamento do queixo,
  têmpora, **zigomático**, **ângulo goníaco**, occipital, arcada, **glabela**,
  **projeção do mento**, achatamento da testa, mais uma função `detalhe` livre
  por crânio.
- **MALHA** — como esse campo vira triângulo. É **aqui** que os métodos divergem:

| # | crânio | método |
|---|---|---|
| 0 | Redonda | esfera UV |
| 1 | Comprida | anéis empilhados com densidade variável (foco no maxilar) |
| 2 | Quadrada | **cubo esferificado** (grade uniforme, sem polo) |
| 3 | Pera | anéis empilhados (foco no terço inferior) |
| 4 | Realista | esfera UV + escultura por ruído de duas oitavas |
| 5 | Mandíbula | **duas conchas soldadas** (calota e maxilar amostrados com regras diferentes) |

---

## 4. Os olhos

Cinco olhos, **um modelo com tabela de parâmetros**, e a íris faz parte de cada um
— **não existe mais catálogo de pupila** (nem de nariz).

Os cinco olhos realistas, cada um por um método de construção diferente, foram
retirados do catálogo. Não foi por defeito: o personagem escolheu um estilo, e um
olho realista de 2 cm no mesmo catálogo que um olho de desenho de 8 cm não é
escolha de gosto — são duas caras diferentes no mesmo corpo. Estão inteiros em
`backup/personagem/olhos-antigo.js`.

**Os olhos mandam no resto do rosto.** Com 8 cm de globo e contorno preto grosso:

- a **sobrancelha** subiu de `0.077 * S` para `0.098 * S`, porque o topo do olho
  (com o contorno) está em `0.0864 * S` e a borda de baixo da sobrancelha fica
  `0.0093 * S` abaixo da linha dela — com o valor antigo ela era desenhada
  **atravessando** o globo;
- a **boca** só pode ser **traço** (ver seção 4b): ao lado de um contorno preto
  chapado, qualquer peça com sombra própria lê como objeto colado no rosto;
- o **furo da boca na barba cheia** cresceu junto (meia-largura 8,6 cm contra
  4,7 cm), senão a barba fecha por cima da boca.

O que todo olho tem que ter: pálpebra de **geometria** (nunca textura), esclera
que não é branco puro, **anel limbal escuro** na borda da íris, pelo menos um
ponto de brilho especular (é o único detalhe que faz um olho parecer molhado) e o
globo **dentro** da órbita.

A **piscada** achata em Y o grupo inteiro que o `build` devolve
(`animation.js`); então nada entra nesse grupo que não deva fechar junto.

### O olho da referência (`rosto/olho-cartoon.js`)

O sexto é uma **cópia** das fotos de *Rick & Morty* que o dono mandou, e não um
estilo a mais. Cinco leituras das fotos, e as cinco mudam o resultado:

1. **O branco é enorme e salta da cara.** Os dois ovais passam do contorno do
   rosto pelos lados — não há órbita, são bolas apoiadas na frente da cabeça.
   Daí `AFUNDA = 0.40` (nos outros olhos do jogo isso fica entre 0.62 e 0.84).
2. **Tem contorno preto**, feito por **casca invertida** (uma cópia 5% maior
   desenhada só pelas faces de trás). Como a bola é convexa, só a beirada
   aparece, e a linha tem espessura constante em qualquer ângulo — que é o que
   um traço de desenho é. Um torus mudaria de espessura quando a cabeça gira.
3. **A pupila é minúscula e preta chapada.** Qualquer íris colorida destrói a
   semelhança na hora.
4. **Não há esclera rosada, veia nem canto.**
5. **A pálpebra é uma linha que desce**, com pele acima dela e um fio escuro na
   borda. Sem volume e sem cílio: é o mesmo traço preto.

### A barra de abrir e fechar

O campo `palpebra` (11 degraus) é um **controle contínuo na própria aba de
olhos**, renderizado como slider e não como grade — onze cards de "10% fechado"
seriam uma grade inútil para uma coisa que se arrasta.

Três coisas que o render pegou e que não são óbvias:

- **O fio escuro fica POR DENTRO da pele.** A calota escura tem arco maior e raio
  menor, então some sob a pele e só a faixa além da borda aparece. Invertido, ela
  deixa de ser um fio e vira uma cúpula escura cobrindo o olho inteiro.
- **A pálpebra de baixo é `acos(altura) + arco`, não `PI − tilt`.** Com a segunda
  fórmula o polo dela aponta para a FRENTE e ela cobre o olho todo.
- **As duas pálpebras vão para o MEIO, e o arco cresce ao fechar.** Mandar só a
  de cima até a base não fecha: uma calota tem meio-ângulo fixo, então quando o
  polo aponta para baixo-frente ela já descobriu o topo da bola. E a borda de uma
  calota é um círculo na esfera — de lado ela para em `cos(β)·cos(arco)`, que com
  arco 0.95 é 42% acima de onde para na frente, deixando uma **cunha branca** nos
  cantos. Por isso o arco vai de 0.95 a 1.52 ao longo do curso.

Os cinco olhos realistas que existiam antes saíram do catálogo (estão em
`backup/personagem/olhos-antigo.js`) e com eles saiu a **persiana**, a pálpebra
genérica que dependia das medidas publicadas em `OLHO_GLOBO`. Os três que
ficaram desenham a própria pálpebra por dentro. `persianaOlho()` continua em
`rosto/nucleo.js` para quem for escrever o próximo olho sem pálpebra própria.

---

## 4b. A boca e a barba

**Quatro bocas, e as quatro são o mesmo traço.**

Antes disto houve uma rodada de bocas ambiciosas — sorriso com canto em bolota,
fileira de dentes, cavidade escavada com língua — e as três foram recusadas de
uma vez, junto com o lábio cheio e a cavidade que vinham de `boca.js`. O motivo
é o mesmo nas cinco:

> **Peça com volume não convive com rosto de traço.**

A cara é feita de linhas chapadas: o olho é uma bola branca com um contorno
preto de espessura constante, e a sobrancelha é um risco. Do lado disso,
qualquer coisa com sombra própria — um lábio que pega realce, uma chapa de dente
com parede lateral acesa, um buraco com rebordo — vira um **objeto colado** no
rosto em vez de virar parte do desenho. Não é questão de afinar parâmetro: é a
técnica errada para este rosto.

A primeira tentativa de traço reaproveitou a **fita** da boca `traco` e também
foi recusada — "ficou parecendo um boneco". A fita é uma **lente**: engrossa no
meio e afina até quase nada nas pontas. Isso funciona no `traco`, onde a linha é
quase reta e a lente lê como o sulco de um lábio fechado; mas com uma curva forte
por cima, barriga no meio mais dois bicos nos cantos é exatamente o desenho da
boca **entalhada** de um boneco de ventríloquo. Não era a curva — era a espessura
variável.

As três de `rosto/boca-extra.js` são outra arte, e mais simples:

> **espessura constante + ponta redonda** — um risco de caneta.

5 mm de espessura do começo ao fim e um semicírculo fechando cada ponta. Sobre
essa caneta vieram três formas elementares; depois, mais três que trocam **a
caneta** em vez da forma:

| | o que muda | por quê |
|---|---|---|
| Traço | lente, quase reta | o da referência, mantido |
| Neutro | **reta** | a ponta redonda é o que impede a reta de ler como um corte |
| Alegre | **arco de círculo** | numa parábola a curvatura cresce em direção às pontas e o sorriso "abre" nos cantos; num arco ela é a mesma do começo ao fim |
| Raiva | **ângulo** (dois segmentos) | reta e arco já são as outras duas; o "^" é a única forma que não se confunde com nenhuma a 3 m de câmera |
| Pincelada | espessura **assimétrica** | entra fina, engrossa a 67% do caminho, levanta fina. É a assimetria que separa "risco feito à mão" de "peça fresada" — a lente do `traco` também varia, mas simétrica, e por isso lê como entalhe |
| Ondulada | uma **onda inteira** de seno | única com simetria de **rotação** em vez de espelho, e única que lê como dúvida |
| Aro | a curva **fecha** | as outras têm duas pontas e separam "em cima" de "embaixo"; o aro não tem ponta e separa "dentro" de "fora". É a boca aberta feita só de linha, com a pele aparecendo dentro — o oposto da cavidade escavada recusada na primeira rodada |

As sete acima ainda eram **a mesma marca**: uma fita escura contínua deitada na
pele. O que variava era o caminho e o perfil de espessura — e é por isso que
todas parecem parentes por mais diferente que seja a curva.

> **Variar caminho e espessura não é variar a arte.**

As três últimas trocam o **tipo de marca**:

| | a marca é | por quê funciona |
|---|---|---|
| Hachura | **seis traços curtos** e soltos, com falha entre eles | a regra é a FALHA: se os seis se encostassem viraria uma fita contínua de borda tremida, ou seja a mesma marca malfeita. É o vão que faz o olho completar a linha, e essa participação é o que dá a sensação de coisa desenhada à mão |
| Duplo | **duas** linhas paralelas | a de baixo tem 55% do comprimento, 30% da espessura e a curvatura **invertida** (acompanha o queixo, não a boca). Duas cópias iguais leriam como erro de renderização |
| Pontilhado | **nove marcas redondas** | o tamanho não é constante: nove iguais leem como fileira de cravos. Crescendo no meio e sumindo nas pontas, viram uma linha que o olho fecha sozinho |

As três são uma geometria só (`juntar()` funde as marcas e copia as normais em
vez de recalcular — recalcular mediaria as normais de marcas vizinhas que se
encostam e acenderia um vinco na emenda). E o número de estações de cada risco
sai do **comprimento**: com 34 fixas, um pingo de 5 mm custava 350 triângulos e
o pontilhado inteiro passava de 3 mil; agora custa 900.

A quarta leva é **fina** (58% da espessura) e um pouco menor, e as três são
feitas de **segmentos retos emendados** — o que dá identidade a cada uma é o
**canto** entre eles:

| | a marca é | por quê funciona |
|---|---|---|
| Serrilhado | seis segmentos alternando cima/baixo | os cotovelos se arredondam **de graça**: a ponta redonda de dois segmentos vizinhos cai no mesmo ponto e a sobreposição É o canto. Como linha de centro única (onda triangular) daria bico agudo e a fita se dobraria sobre si mesma em cada quina |
| Colchete | um traço longo + dois terminais **verticais** | `risco` aguenta `x0 === x1` porque a normal sai da **derivada**: com `dx = 0` ela vira (−1, 0) e a fita se abre no eixo X. Com normal (0,1) fixa — o que era tentador escrever — o terminal nasceria com largura zero |
| Partido | duas metades que não se encontram | o **degrau** é o que salva: duas metades no mesmo nível com um vão leem como erro de renderização, o olho procura o pedaço que faltou. Com a direita 5 mm mais alta, o vão vira intenção |

Traço fino não é "a mesma boca menor" — ele muda o que a boca **aguenta**. Numa
fita de 7 mm um cotovelo se dobra sobre si mesmo e vira um nó (foi por isso que a
boca de raiva precisou arredondar o vértice com hipotenusa); com 4 mm o canto
fecha limpo, e só por isso esta leva pode existir.

Dois detalhes do risco que não são óbvios: a normal sai da **derivada** da linha
(medida na vertical, a espessura de um arco fica 20% maior nas pontas), e a ponta
redonda para em `cos(1.476)`, não em `cos(PI/2)` — espessura zero cria triângulo
degenerado, e vértice degenerado sai com normal (0,0,0), que na tela é uma mancha
preta na ponta da boca.

Três traços que leem a 3 m de câmera valem mais que três esculturas que só
funcionam em close.

**A barba cheia foi refeita.** A primeira versão foi recusada pelos pelos
externos, e o defeito não era densidade nem cor — eram três decisões:

1. **Fios da silhueta poucos, compridos e espalhados.** 62 fios de até 1,1 cm em
   4,4 rad dá um fio a cada 4°, e cada um é contável a olho nu. Borda de barba é
   o contrário: **muito fio curto**, tão junto que o olho para de contar.
2. **Mechas sorteadas em posição e em giro.** `rnd() * Math.PI` no giro da seção
   punha cada mecha num ângulo próprio; com a seção achatada, uma fica deitada e
   a vizinha em pé. O resultado tem nome: **escama**. Barba é penteada.
3. **Comprimento só de sorteio.** Sem uma tabela por azimute, o mesmo sorteio
   vale na costeleta e no queixo, o contorno serrilha em alta frequência e a
   barba não tem **forma**.

O manto (a camada que resolve o furo da boca) foi mantido; mechas e franja foram
reescritas sobre `COMP(az)` — cheio no queixo (1.0), quase raspado na costeleta
(0.22) — e um penteado único, calculado num lugar só.

---

## 5. Pelo de verdade

`tecelagem()` + `fio()` no núcleo do rosto: todos os fios de uma peça entram numa
**única** BufferGeometry indexada — 1 draw call. Um fio de 5 anéis × 3 colunas
custa 30 triângulos, então 300 fios dão 9 mil.

Teto: **12 mil triângulos** por peça de pelo. Acima disso, casca como base e fio
só na **borda**, que é onde o olho vê a diferença entre pelo e capacete.

---

## 6. O corpo

O que o dono fotografou, e o que cada coisa era:

| Queixa | Causa | Correção |
|---|---|---|
| "listra vertical no peito" | `LatheGeometry` fecha a volta **duplicando** a coluna de vértices, e a coluna dela cai em phi = 0, que é a **frente** do boneco. `computeVertexNormals` dá normais diferentes às duas colônias e a emenda acende | o corpo nu virou `corpoGeo`, que fecha a volta **por índice**; a roupa continua em lathe (precisa de UV) e passa por `soldarNormais()` |
| "braços com listras" | a mesma costura, na `CapsuleGeometry` | `membroGeo` fecha por índice |
| "braços/pernas de cano" | cápsula tem **raio constante** | `membroGeo` é um loft: deltoide, braquiorradial, panturrilha |
| "ombros quadrados" | a cápsula começava **do lado** da caixa torácica, com um degrau no meio | **deltoide**: um elipsoide que cobre a junta e encosta nos dois. O tamanho sai da manga curta, não do gosto |
| "cotovelos quadrados" | uma bola de 3.75 cm atravessando o braço criava um **anel de interseção serrilhado** | a bola saiu: a cúpula do antebraço (3.85 cm) já é mais larga que o fim do braço (3.5 cm) |
| "peito quadrado, sem identidade" | círculo achatado em Z = tubo oval do quadril ao pescoço | seção de **superelipse** de expoente variável, mais retangular na caixa torácica; cintura de verdade no perfil |
| "mãos feias" | (1) a mão inteira nascia **do avesso** — `costurar()` tinha a ordem dos índices invertida; (2) palma de 10 cm com dedos de 5 cm e 4.4 cm de espessura: uma luva de forno | winding corrigido; proporção real (palma ≈ dedos ≈ 8 cm, 3 cm de espessura), tenar próprio, arco na linha dos nós |

**Teto de crescimento da seção do tronco: 6%.** O corpo nu está em `NU_S = 0.965`
do perfil e o tecido em `1.045`; 0.965 × 1.06 = 1.023 continua **dentro** da
roupa. Não aumente o expoente da superelipse sem refazer essa conta.

Ferramenta de regressão: **`node tools/teste-normais.mjs`** — caça a malha virada
do avesso pelo **volume assinado**. O defeito não aparece como buraco nem como
erro: a peça fica cinza e chapada, porque a luz passa a bater no avesso.

---

## 7. A passada

`stride` anda 0..2π por **ciclo** (dois passos). Dali cada perna recebe um `t` em
[0,1) onde **t = 0 é o ataque de calcanhar** daquela perna.

Três coisas que faltavam e que uma senoide por junta não dá:

1. **Apoio e balanço são fases de duração diferente** — 62% do ciclo no chão
   andando, 34% correndo (abaixo de 50% existe **voo**, e é o voo que separa
   correr de andar rápido).
2. **O pé rola** — calcanhar, pé plano, e o antepé **empurra** no fim do apoio.
   Sem o empurrão não há impulso, e sem impulso não há peso.
3. **O corpo inteiro participa** — o quadril sobe, desce, desliza para o pé de
   apoio e **cai** do lado da perna no ar (queda pélvica); o tronco contra-gira;
   a cabeça **desconta** a rotação para continuar olhando para a frente.

Duas regras que o teste pegou e que não podem ser desfeitas:

- **A altura do quadril sai da GEOMETRIA da perna**, não de uma senoide
  (`quedaDoQuadril`). Com senoide o quadril baixava 2.6 cm no duplo apoio com as
  duas pernas quase esticadas e o pé entrava 8 mm no chão. Com a conta, o balanço
  vertical aparece sozinho, com a fase e a amplitude certas, e o pé de apoio
  **nunca** atravessa o chão. Há um **teto de queda** porque no voo da corrida a
  conta pressupõe um pé no chão que não existe.
- **A cadência sai do PASSO**, não de uma fórmula à parte (`passoMetros`). A
  fórmula antiga não tinha relação nenhuma com o tamanho do passo que a animação
  desenha, e o resultado inevitável é o pé patinando. `PERNA = 0.605` é o braço
  de alavanca **medido** (`node tools/teste-passada.mjs`), não o comprimento da
  perna: no apoio o joelho nunca está reto.
- **`quadrilContato` e `quadrilPico` são coisas diferentes.** Com um valor só, o
  contato herdava a flexão de sprint (60°) — e a 60° com o joelho reto o
  tornozelo está 47 cm abaixo do quadril, não 75. A conta de altura pedia um
  quadril 36 cm mais baixo e o boneco **agachava** a cada passo.

A troca andar→correr começa em **2 m/s** e não em 3.4: o `WALK_SPEED` do config é
3.1 m/s (11 km/h), e ninguém *caminha* nessa velocidade.

### `RITMO` — por que a cadência não é a exata

A cadência exata (velocidade ÷ passo) é a única que faz o pé não patinar. Só que
a velocidade do jogo é alta e a perna é curta: o passo máximo que a geometria
permite sem o quadril agachar fica em ~68 cm andando e ~79 cm correndo, e cobrir
3.1 m/s com 68 cm dá **4.5 passos por segundo** (7.8 correndo). Na tela isso lê
como o boneco tremendo as pernas — foi a queixa *"a animação está muito rápida,
muito mesmo"*.

Não dá para alongar mais o passo (geometria) nem para baixar a velocidade (ela
está certa). Sobra desacelerar e aceitar escorregão, que é o que praticamente
todo jogo de terceira pessoa faz. `RITMO = 0.66` põe a caminhada padrão em ~3.0
passos/s e a corrida em ~5.2 — números de gente — ao preço de ~34% de deslize,
invisível a 3 m de câmera.

**Se um dia a velocidade do jogo baixar, suba `RITMO` de volta para 1**: todo o
resto da conta já é exato, só esse fator não é.

Ferramentas: `node tools/teste-passada.mjs` (altura do tornozelo, balanço do
quadril, cadência, e se a velocidade que a animação entrega bate com a real).

---

## 8. O head look

A queixa: *"quando olho de frente e mexo o mouse para a direita ele simplesmente
teleporta a cabeça de um lado para o outro"*.

Não era um problema de suavização. O corpo ficava travado no último yaw de
caminhada e só a cabeça acompanhava a câmera, limitada a ±0.7 rad; quando o
jogador passava de 180°, o ângulo relativo **dava a volta** (+π vira −π) e a
cabeça saltava de olhar todo para a esquerda para olhar todo para a direita, num
quadro.

A correção não é suavizar o salto: é **não deixar o ângulo chegar lá**.

- O pescoço alcança ~60° (`LIMITE_PESCOCO = 1.05`). Passou disso, quem vira é o
  **corpo**, com perseguição lenta (lambda 6) — como uma pessoa que olha por cima
  do ombro e, se a coisa continua, gira o tronco.
- A cabeça **persegue** o alvo com damp (lambda 12), nunca recebe o ângulo cru.
- O giro é **repartido**: 38% numa junta nova (`neckLook`, entre o pescoço e a
  cabeça) e 62% na cabeça. Girar tudo no crânio lê como torcicolo.
- `neckLook` existe porque a primeira versão somava no próprio `neck` — e isso
  funcionava para o jogador (o animador roda antes e reescreve do zero) mas
  **acumulava** nos NPCs, que não têm animador nenhum.

### A correção que teve que ser desfeita

A primeira tentativa foi fazer o **corpo** girar atrás da câmera quando o pescoço
chegava no limite. Resolvia o salto e causava outra queixa na hora: *"a câmera em
terceira pessoa, eu não consigo olhar pra tela com o personagem"*. Como o corpo
fugia junto com a câmera, o jogador orbitava 360° e continuava vendo as costas.

A correção boa é a cabeça **desistir**: de 1.70 rad (97°) em diante o peso do
head look cai a zero em 0.90 rad e ela volta para a frente sozinha. No ângulo em
que a volta acontece o peso já é zero dos dois lados — não há o que saltar. E é
o que uma pessoa faz: ninguém torce o pescoço para olhar atrás de si.

**O corpo, parado, não gira.** Ele fica onde a última caminhada deixou.

### Modo vitrine (tecla X)

*"quero uma tecla específica, pode ser X, pra mostrar o player de frente e de
corpo todo pra tela, pra gente ver ele e o cenário, como se fosse tirar uma foto,
porém sem a foto."*

Não há arquivo nenhum: é só um enquadramento. Ele reaproveita o caminho da câmera
de 3ª pessoa inteiro (oclusão de parede, piso, suavização); o que muda são três
números — o alvo sobe para o meio do corpo (0.95 m), o desvio de ombro vai a zero
e o braço cresce para 3.6 m. O `yaw` vai para `bodyYaw` (não `bodyYaw + PI`, que
é onde a câmera já fica). O jogador continua girando a câmera com o mouse — é o
que deixa olhar o cenário atrás — mas não anda, senão a pose desmancha.

---

## 9. Bugs de contrato que já custaram caro

**Apelido é ENTRADA, nunca ESTADO.** `character.appearance` ficava com `olhos`
**e** `eyes`. `main.js` guarda esse objeto e a tela de criação trabalha sobre uma
cópia dele. Ao clicar num olho, a tela escrevia `olhos: 2` e mandava o objeto
**inteiro**, com o `eyes: 0` velho ainda dentro; `aplicar()` percorre as chaves
na ordem de inserção, chegava em `eyes`, resolvia o apelido e escrevia
`olhos = 0` de volta. Sem erro nenhum no console — o olho simplesmente não
mudava. Valia para os cinco campos que tinham apelido: **olhos, boca, cabelo, cor
do cabelo e sobrancelha**, exatamente a lista que o dono reportou.

Hoje `aplicar()` resolve o apelido em duas passadas (o nome do contrato ganha
sempre) e **apaga** o apelido do alvo.

---

## 10. Testes

| Comando | O que cobre |
|---|---|
| `node tools/teste-aparencia.mjs` | os 20 bytes indo e voltando nos cinco pacotes e dentro da sala |
| `node tools/teste-normais.mjs` | malha virada do avesso, por volume assinado |
| `node tools/teste-passada.mjs` | altura do tornozelo, balanço do quadril, cadência e patinação |
| `node tools/teste-camera.mjs` | o corpo não gira atrás da câmera, dá para ver a cara, a cabeça não salta, e a tecla X |
| `node tools/teste-customizador.mjs` | clicar num card (e arrastar a barra) equipa a peça de verdade |
| `node tools/shot-tela.mjs cranio olhos traco corpo passada` | as folhas de contato da reforma, em `shots/` |
