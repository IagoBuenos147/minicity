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
| 0 | `cabeca` | 6 | formatos de crânio |
| 1 | `olhos` | 5 | cada um traz a própria íris |
| 2 | `pupila` | 1 | **campo morto**: a aba foi apagada, viaja sempre 0 |
| 3 | `nariz` | 4 | 0 = sem nariz |
| 4 | `boca` | 3 | |
| 5 | `barba` | 4 | 0 = sem barba |
| 6 | `cabelo` | 3 | |
| 7 | `pele` | 10 | tom |
| 8 | `corCabelo` | 11 | |
| 9 | `sobrancelha` | 3 | |
| 10 | `chapeu` | 7 | 0 = nenhum |
| 11 | `calcado` | 5 | 0 = descalço |
| 12 | `blusa` | 4 | 0 = nenhuma. A aba se chama **CAMISAS** |
| 13 | `calca` | 3 | |
| 14 | `colar` | 4 | 0 = nenhum |
| 15 | `anelAcess` | 4 | 0 = nenhum |
| 16 | `tatuagem` | 4 | 0 = nenhuma |
| 17 | `relogio` | 4 | 0 = nenhum |
| 18 | `jaqueta` | 1 | **campo morto**: jaqueta virou camisa, viaja sempre 0 |
| 19 | `corBarba` | 9 | **novo**. 0 = igual ao cabelo. Gastou o byte de reserva |

**A versão do protocolo NÃO subiu** por causa do `corBarba`, e é de propósito: o
pacote continua com 20 bytes, a posição de todos os outros campos é a mesma, e o
valor que um cliente velho manda nesse byte é 0 — que no catálogo novo quer dizer
exatamente "igual ao cabelo", o comportamento que ele tinha antes. O cliente
velho continua certo sem saber.

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
| `src/player/rosto/{olhos,nariz,boca,barba,cabelo,sobrancelha}.js` | um catálogo cada |
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

Cinco olhos, **cinco métodos**, e a íris faz parte de cada um — **não existe mais
catálogo de pupila**.

O que todo olho tem que ter: pálpebra de **geometria** (nunca textura), esclera
que não é branco puro, **anel limbal escuro** na borda da íris, pelo menos um
ponto de brilho especular (é o único detalhe que faz um olho parecer molhado) e o
globo **dentro** da órbita.

A **piscada** achata em Y o grupo inteiro que o `build` devolve
(`animation.js`); então nada entra nesse grupo que não deva fechar junto.

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
| `node tools/shot-tela.mjs cranio olhos traco corpo passada` | as folhas de contato da reforma, em `shots/` |
