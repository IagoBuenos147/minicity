# Mini City RP

Jogo 3D no navegador (JavaScript + Three.js), primeira e terceira pessoa, com uma
mini cidade e um personagem no estilo do jogo *Schedule I*.

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` e clique na tela para travar o mouse.

## Como o jogo comeca

Abre no **menu do Cassino Buenos** — placa de neon —, com tres opcoes:

1. **INICIAR O JOGO** → escolha o modo:
   - **SOLO**: vai direto para a criacao de personagem.
   - **COOP**: abre a sala, que cabe **de 2 a 4 pessoas**. Quem entra primeiro e
     o **anfitriao**; a tela mostra o endereco para mandar para quem vai entrar
     (com botao de copiar) e as quatro vagas se preenchendo. Quando todo mundo
     estiver na sala, o anfitriao clica em INICIAR O JOGO e **todos** vao juntos
     para a criacao de personagem.
2. **Criacao de personagem**: nome + todas as abas de rosto e roupa, com o
   personagem num palco de estudio e a camera aproximando do que voce esta
   mexendo. Ao clicar em PRONTO aparece o contador para todo mundo — `1/4`,
   `2/4`... — e o jogo so comeca quando o ultimo ficar pronto.
3. **Cutscene de abertura**: todos aparecem no sofa de um porao, com a aparencia
   que cada um escolheu, e o anfitriao vai propondo ideias de negocio ate a do
   cassino. Corta para a frente da casa velha. `Esc` pula.
4. O jogo comeca em frente ao primeiro estabelecimento, com o objetivo no canto
   superior esquerdo: *"Entre e conheca seu primeiro estabelecimento"*.

## Controles

| Tecla | Ação |
|---|---|
| `W A S D` | Mover |
| `Shift` | Correr |
| `Espaço` | Pular |
| `Mouse` | Olhar |
| `E` | Interagir |
| `V` | Alternar 1ª / 3ª pessoa (estilo GTA) |
| `1` … `9` | **A barra de itens** (as 9 vagas da mochila, centrada no rodapé). Aperta e pega na mão; aperta de novo e guarda |
| `C` | Trocar a estação: **sol → chuva → neve → sol** |
| `R` `Q` | Girar o móvel (com um móvel na mão) |
| `Segurar E` | Guardar de volta o móvel que está na mira |
| `F5` | Tela dos 5 lugares de jogo salvo |
| `F6` | **Trocar de cenário** (cidade do cassino ⇄ Quadra Hudson) |
| `F7` | **Fazer o cenário sumir** (e voltar) |
| `F8` `F8` | **Reiniciar o mundo** (aperte duas vezes em 4 s) |
| `Tab` | Mostrar/ocultar ajuda |
| `Esc` | Liberar o mouse |

## O que tem na cidade

- **Barbearia** (nordeste da rua principal): cadeiras de barbeiro, espelhos,
  quadros na parede, sala de espera e o barbeiro NPC.
  Fale com o barbeiro ou sente na cadeira para **trocar o cabelo**.
  Olhe no **espelho** para trocar também olhos, sobrancelhas e boca.
- **Mercearia** (noroeste): gôndolas com produtos, geladeiras, balcão de caixa
  e a atendente NPC.
- **Cassino Estrela** (sudeste, na esquina do cruzamento central): dá para
  entrar. Fachada com marquise de lâmpadas correndo, neon e tapete vermelho.
  Dentro: **mesa de blackjack** com a crupiê (aposta **ouro**), **mesa de poker
  cabeça a cabeça de duas cartas** contra o Dom Sebastião, o ricaço de chapéu
  (aposta **fichas**), **três caça-níqueis** (fichas) e o **caixa**, que troca
  ouro por ficha 1 por 1. Você começa com 1.500 de ouro; se zerar, o caixa
  adianta uma cortesia.
- **Casa velha** (mesma avenida, ao lado do cassino): o primeiro
  estabelecimento. Madeira apodrecida, pintura descascando, telhas faltando,
  teias de aranha e um interior em **L**, com o chão livre. A **porta abre e
  fecha** com `E` — e enquanto está fechada, ela barra mesmo.
- **Taco de Ouro** (loja de jogos, norte da avenida): fachada de neon magenta,
  salão temático e a **Wanda** atrás do balcão. Vende **três baralhos** (comum,
  bom e 100% plástico), **duas mesas de sinuca** de segunda mão (7 e 8 pés),
  uma **jukebox valvulada de 1962**, **duas maletas de fichas de poker** e
  **fichas de sinuca a granel** (você escolhe quantas). Tudo fica à vista na
  loja. O que você compra vai para as **9 vagas da mochila** — sem espaço, a
  compra não passa.
- **Hotel Paraíso** (esquina noroeste do anel, atrás da mercearia): o prédio
  de quatro andares que antes era só cenário com um letreiro de "Bar do Tito".
  A **porta de vidro é automática** — as duas folhas correm para os lados
  sozinhas quando você chega e liberam o vão inteiro. Dentro, um saguão de pé
  direito de 5 m: **balcão de recepção** com a **Íris** atrás (ela ainda só dá
  as boas-vindas), escaninho de chaves, três relógios de fuso, **sala de espera
  com poltronas e mesinhas de vidro** (dá para **sentar**), **escada de mármore**
  que é só cenário e termina numa porta fechada, e um **elevador** de portas de
  bronze. É o lugar pensado para receber vários NPCs.
- **Garagem do Nando** (concessionária, do lado do hotel na mesma calçada do
  anel): showroom de pé-direito alto com treliça aparente, piso de epóxi e a
  fachada inteira de vidro. Dentro estão **os quatro veículos à venda**, de
  verdade e não em miniatura — o **cupê preto** e a **caminhonete** em ângulo
  sobre a marcação amarela, a **moto** num **prato giratório** e o **skate**
  numa vitrine. Cada um tem cavalete de preço, e falar com um deles (ou com o
  **Nando**, atrás do balcão) abre a **mesma janela de loja do Taco de Ouro**,
  já naquele item. O que você compra aparece **estacionado na vaga demarcada em
  frente à loja**, pronto para entrar com `E`.
- **Caminhonete** (veículo novo): pickup de cabine simples com uns quarenta anos
  de estrada — pintura azul desbotada pelo sol, ferrugem na saia, para-choque
  cromado fosco, faróis redondos e caçamba com assoalho corrugado, estepe
  deitado e caixa de ferramentas. É o veículo **pesado**: mais lenta que o
  carro, com o corpo tombando na curva e o pneu alto escorregando antes.
- **Bebida na mercearia**: a **geladeira do fundo** (a das duas portas marcadas
  BEBIDAS) e o caixa abrem a **mesma janela de loja do Taco de Ouro**, com
  **lata de cerveja**, **garrafa de vodka** e **garrafa de whiskey**. O que você
  compra vai para a primeira vaga livre da barra e **já vai para a sua mão** —
  em primeira pessoa você vê o punho fechado em volta da garrafa, o balanço do
  passo (na mesma cadência da câmera) e uma **pose diferente para correr**.
- **A Adega 100** (o galpão cego atrás da barbearia, de frente para o anel): o
  prédio que era só cenário, com o número **100** pintado ao lado da porta. Da
  rua ele continua morto — **porta de carga soldada** (dois cordões de solda em
  X, corrente e cadeado), janelas do térreo **emparedadas com tijolo novo**,
  sem letreiro, sem vitrine, sem luz. A única pista é uma **marca de giz** na
  altura da cintura apontando para o beco.
  A entrada de verdade é a **porta de aço no beco**, entre este prédio e os
  fundos da barbearia. Na primeira vez o **postigo corre antes da porta** —
  alguém olha, pergunta quem mandou você, e só então a tranca corre. Você entra
  num **vestíbulo vermelho sem saída aparente**: o vão para o salão fica na
  quina, atrás de uma **cortina de tiras**.
  Dentro: **balcão com chopeira de dois barris**, cada um com **torneira de
  latão** que abre no `E` (ou no botão esquerdo, se estiver de mãos livres) e
  **jorra chope de verdade** — a coluna cresce para baixo na velocidade da
  queda, faz espuma na grelha e, ao fechar, o rabo se desprende do bico e cai.
  Atrás do dono (**Dico**) há uma **tela de arame**, e atrás da tela está a
  operação: **alambique de cobre no fogo**, bombonas de granel, garrafões,
  **mesa de envase** com funil, garrafas de rótulo arrancado e uma caixa de
  tampas trocadas. A parede sul é a **adega**: cinco prateleiras do chão ao
  teto, garrafas deitadas embaixo e em pé em cima — e cada fileira abre a
  **loja já naquele item**.
  Vende **três copos** (americano, tulipa e caneca de meio litro), **pinga de
  alambique**, **pinga com tala de umburana**, **garrafão de 5 L**, **gin**,
  **vodka e whiskey mais baratos que os da mercearia** (não paga imposto quem
  não emite nota), **long neck**, **lata** e a **garrafa sem rótulo** — tampa
  trocada, líquido turvo, metade do preço. Você que sabe.
- **O copo na mão**: com um copo na barra de itens, o **botão esquerdo** faz o
  ciclo inteiro. Copo vazio: a mão **estica para a frente**, para receber. Se
  estiver embaixo de uma torneira aberta, o **chope cai dentro do copo** (a
  coluna encurta e termina no vidro) e ele enche com colarinho; cheio, a mão
  volta sozinha. Aí cada clique **leva o copo à boca** e bebe um gole — quanto
  menos resta, mais o copo inclina. No último gole ele zera, e o clique seguinte
  volta a esticar a mão. A caneca de meio litro rende seis goles; o americano,
  três.
- **O Cortiço 117** (o prédio de três andares ao lado da adega, de frente para
  o anel): o outro prédio de cenário que virou endereço. Fachada de reboco
  batido, janelas com grade nos dois primeiros andares, **roupa no varal** entre
  elas, ar condicionado pingando na parede, fiação puxada por fora e a barra de
  pintura que alguém começou e não terminou.
  Dentro é um **corredor com doze portas** — bulbo nu no fio, eletroduto
  aparente, rodapé de óleo, infiltração no forro, saco de lixo que ninguém
  desce, caixa de correio arrombada e uma bicicleta acorrentada embaixo da
  escada. A **escada é de verdade**: dois lances em U por andar, com patamar,
  corrimão de tubo enferrujado e guarda-corpo no último. **Dá para subir os três
  andares andando** — é o primeiro prédio do jogo com mais de um piso.
  **Duas portas abrem**: a **12**, no 1º andar, e a **23**, no 2º. Aperte `E`
  numa delas e o jogo faz **toc toc toc**; dois segundos depois o morador
  atravessa a sala, abre, te recebe (a fala sai na legenda do rodapé, a mesma da
  cutscene), sai da frente e **volta a sentar no sofá**, onde continua fumando —
  cigarro enrolado à mão, brasa que acende na tragada e **fumaça de verdade**,
  um fiapo saindo da ponta acesa e uma baforada quando ele solta.
  Cada apartamento tem **dois cômodos**. Na sala: sofá afundado com a espuma
  saindo do braço, TV de tubo chiando em cima de dois caixotes, abajur de chão
  e a **mesa de centro** — espelho com as carreiras e a lâmina, cinzeiro
  transbordando de bituca, o monte branco, a caixinha de fumo com o mato picado,
  a seda, o desfiador, o isqueiro, garrafa de whisky, long neck e lata amassada
  no chão. No quarto dos fundos: colchão no chão, armário de compensado com uma
  porta faltando, e a mesinha com a **balança**, os saquinhos e o maço de
  dinheiro com elástico.
- **Móveis na sua casa**: clique numa vaga da mochila para pegar o móvel. Ele
  aparece como um fantasma **verde** onde cabe e **vermelho** onde não cabe, com
  a pegada desenhada no chão. `R`/`Q` gira, botão esquerdo instala, `Esc`
  cancela. Para tirar, mire no móvel e **segure `E`** — ele volta para a mochila.
- **Praça** (sudoeste): fonte, bancos, árvores e caminhos.
- Ruas em grade com calçadas, meio-fio, faixas de pedestre, postes, semáforos e
  mobiliário urbano. Sem carros circulando (por decisão de escopo).

## Os dois cenários

`F6` troca entre os dois mundos do jogo; `F7` apaga o cenário inteiro — casas,
prédios, cassino, mercearia, tudo — e deixa só o chão e o céu.

- **Cidade do Cassino** — a cidade de sempre.
- **Quadra Hudson** — um quarteirão **real** de Paracatu, Minas Gerais,
  reconstruído a partir de 35 fotos do Google Street View. As quatro ruas em
  volta são a **R. Josué Félix Caixeta**, a **R. Jorge Araújo Caldas**, a
  **R. Padre Josino** e a **R. Frei Pedro Caixito**; no miolo ficam a escola, a
  quadra poliesportiva coberta e a praça. São 49 lotes, casa por casa: muro com
  a mancha de umidade subindo do chão, portão de chapa ondulada enferrujada,
  telha colonial desbotada, grade de barra vertical na janela, parabólica e
  caixa d'água azul no telhado, número pintado à mão no muro, o nome da rua
  escrito no asfalto em duas linhas, e a rede de fios em catenária cruzando a
  rua na diagonal. Não há carro, moto nem gente: o bairro fica vazio.

O segundo cenário é montado na **primeira vez** que você aperta F6 (leva uns
segundos), e depois a troca é instantânea.

## Jogo salvo

Cinco lugares, com tema de cassino. O jogo **grava sozinho** nos momentos que
importam: quando a cutscene acaba e a casa abre, a cada compra, ao pôr ou tirar
um móvel e a cada missão concluída. `F5` abre a tela para escolher o lugar na
mão; no menu, **Continuar** lista os cinco.

Cada lugar guarda o personagem inteiro (inclusive as cores de pele, cabelo e
roupa, que **não cabem no protocolo de rede**), a carteira, onde você parou, as
missões feitas, a hora do dia, a mochila e a mobília instalada na casa. Cada
lugar tem **Exportar** e **Importar**: o arquivo é um `.json` que dá para
guardar ou passar para outra máquina.

## As três estações

A tecla `C` cicla entre **sol**, **chuva** e **neve**, com transição suave.

- **Chuva**: risco fino com cor por gota (as da frente mais claras que as do
  fundo), vento em rajada que inclina a chuva junto, anéis pequenos e macios no
  chão com uma coroa de pingos saltando do impacto, e relâmpago de vez em
  quando quando a tempestade aperta. Não chove dentro das lojas nem do cassino.
- **Neve**: flocos caindo devagar em espiral, céu de nevasca (mais **claro** que
  o normal — a neve devolve quase toda a luz que recebe) e a cidade sendo
  **coberta**: manto contínuo no chão, telhados, copas das árvores, arbustos,
  bancos, postes, lixeiras e pingentes de gelo na beirada dos telhados. A
  cobertura sobe em ~25 s de nevasca e derrete devagar quando para.

## Reiniciar o mundo

`F8` duas vezes (a segunda dentro de 4 segundos) devolve tudo ao primeiro
minuto: **sem helicóptero montado, sem zumbi, sem objeto quebrado, sem portal
aberto e sem a arma de portal no bolso**. Os veículos voltam para a vaga.

Duas batidas porque, online, isso reinicia a sala **inteira** — todo mundo vê o
aviso de quem pediu. O que **não** se perde: a aparência que você escolheu no
barbeiro, e o dinheiro do cassino (para zerar a carteira também, use
`__game.carteira.reiniciar()` no console).

## Customização do personagem

Acontece num **palco de estúdio** — cena separada, fundo liso, pedestal e luz de
três pontos. Isso não é enfeite: enquanto a câmera do jogo apontava para o
personagem onde ele estava, a cadeira do barbeiro, o espelho e o balcão da loja
entravam entre a lente e o cliente, e não havia enquadramento que resolvesse.
No palco não há móvel nenhum para atrapalhar.

Cada opção mostra uma **miniatura 3D da peça de verdade**, renderizada no corpo e
no tom de pele do seu personagem. Arraste na tela para girar; a câmera aproxima
sozinha do que você está mexendo.

| Aba | Opções |
|---|---|
| Cabeça | 6 formatos, cada um construído por um método diferente |
| Olhos | 6 — a íris faz parte de cada olho (não há mais aba de pupila), e um deles é uma cópia do olho de *Rick & Morty*. **Uma barra na mesma aba fecha a pálpebra**, de aberto a fechado |
| Nariz | 4 + "sem nariz" (um deles também copiado da referência) |
| Boca | 3 |
| Barba | 3 + "sem barba" — com pelo visível |
| Cabelo | 3 |
| Sobrancelha | 3 |
| **Cor** (cabelo, **barba** e pele **na mesma aba**) | 11 / 9 / 10 |
| Chapéu | 6 + nenhum |
| **Camisas** (camisa, jaqueta, moletom — **uma aba só**) | 3 + sem camisa |
| Calça / calçado | 3 e 4 + descalço |
| Colar / anel / relógio / tatuagem | 3 cada + nenhum |

Menos opções e mais cuidado em cada uma: **cada item de uma aba é feito por um
método de construção diferente**, para dar para comparar qual combina com o
jogo.

## Testar sem servidor (um arquivo so)

```bash
npm run local
```

Gera **`MiniCityRP.html`** na raiz — o jogo inteiro num arquivo so, que abre com
**dois cliques**, sem `npm run dev`, sem servidor e sem internet.

Por que precisa de um build proprio: o `index.html` normal carrega o jogo como
**modulo ES**, e navegador nenhum carrega modulo de `file://` (a origem de um
arquivo local e opaca e o CORS barra). Este build empacota tudo como script
classico e joga o codigo dentro do proprio HTML.

O que **nao** funciona no arquivo local, de proposito:

- **multijogador** — o servidor continua sendo `npm run online`;
- as ferramentas de foto e os testes que falam com o dev server.

O resto roda: cidade, personagem, customizacao, veiculos, cassino e save.
Confira com `npm run teste-local` (ele abre o arquivo por `file://` de verdade e
verifica que o jogo subiu).

## O que saiu do jogo

O anel verde (telecinese), a arma de portal e o helicóptero foram **guardados em
`backup/`** — inteiros, com instruções de como trazê-los de volta em
[`backup/LEIA-ME.md`](backup/LEIA-ME.md). O rapaz que virava zumbi foi
**apagado**.

## Estrutura

```
src/
  config.js            constantes de mundo, jogador e câmera
  core/                engine (renderer/scene/camera) e input
  systems/             colisão AABB e sistema de interação
  world/               materiais procedurais, layout, cidade, props, interiores
  player/              personagem, aparência, animação, controller
  npc/                 NPCs
  ui/                  HUD e painel de customização
```

Ver `ARCHITECTURE.md` para o contrato entre módulos.

## Ferramentas de desenvolvimento

Com o dev server rodando (`npm run dev`), em outro terminal:

```bash
npm run smoke            # o jogo inteiro rodando no navegador (95 casos)
npm run teste-cassino    # as regras dos jogos, sem navegador (84 casos)
npm run teste-nome-unico # um corpo por nome no servidor (10 casos)
npm run teste-reiniciar  # a tecla F8 devolvendo o mundo ao inicio (14 casos)
npm run teste-online     # dois navegadores de verdade na mesma sala (22 casos)
npm run teste-lobby      # a sala de 2 a 4, anfitriao e prontos (28 casos)
npm run teste-coplanar   # duas superficies disputando o mesmo pixel (8 lugares)
npm run shot-clima       # fotos do cassino, da chuva e da neve em shots/
npm run shot-tela        # fotos do menu, da criacao, da casa e da cutscene
```

Teste de ponta a ponta num navegador headless: movimento, colisão, altura do chão,
troca de câmera, os cinco pontos de interação, o painel de customização e o
desempenho. Sai com código 1 se algo quebrar.

O `teste-coplanar` merece uma linha à parte porque ele caça um defeito que não
aparece no console nem na leitura do código: **duas superfícies exatamente na
mesma posição**. O z-buffer não tem como decidir qual das duas está na frente
quando as duas estão na mesma distância, então ele decide de novo a cada quadro
— e o pixel troca de cor sozinho conforme o jogador anda. Quase toda queixa de
"a iluminação está tremendo" neste projeto acabou sendo isto, e não iluminação.
Ele varre os oito interiores e fachadas onde o jogador chega perto da parede,
ignora as faces enterradas (que ninguém vê) e só reclama do encosto de verdade.

```bash
npm run shots -- cidade personagem barbearia mercearia
```

Bateria de screenshots em `shots/`. Também dá para tirar uma tomada avulsa:

```bash
npm run shot -- rosto 0 1.66 -0.8 0 1.63 0 40
```

(argumentos: `nome camX camY camZ alvoX alvoY alvoZ [fov]`)

Ambos usam o Edge ou o Chrome instalado no sistema — defina `CHROME_PATH` se
estiver em outro lugar.
