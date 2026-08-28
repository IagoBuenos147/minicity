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
| `1 2` | Mãos / revólver |
| `C` | Trocar a estação: **sol → chuva → neve → sol** |
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
- **Praça** (sudoeste): fonte, bancos, árvores e caminhos.
- Ruas em grade com calçadas, meio-fio, faixas de pedestre, postes, semáforos e
  mobiliário urbano. Sem carros circulando (por decisão de escopo).

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

| Categoria | Opções |
|---|---|
| Cabeça / olhos / pupila / nariz / boca / barba / cabelo / sobrancelha | 10 a 13 cada |
| Tom de pele / cor do cabelo | 10 e 11 |
| **Roupa de cima** (blusa, jaqueta, blazer, terno, moletom — **uma aba só**) | 19 |
| Chapéu / calça / calçado / colar / anel / relógio / tatuagem | 11 cada |

Os estilos vão de social e paletó a cowboy, praiano, academia e blusão.

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
npm run smoke            # o jogo inteiro rodando no navegador (54 casos)
npm run teste-cassino    # as regras dos jogos, sem navegador (84 casos)
npm run teste-nome-unico # um corpo por nome no servidor (10 casos)
npm run teste-reiniciar  # a tecla F8 devolvendo o mundo ao inicio (14 casos)
npm run teste-online     # dois navegadores de verdade na mesma sala (37 casos)
npm run teste-lobby      # a sala de 2 a 4, anfitriao e prontos (28 casos)
npm run shot-clima       # fotos do cassino, da chuva e da neve em shots/
npm run shot-tela        # fotos do menu, da criacao, da casa e da cutscene
```

Teste de ponta a ponta num navegador headless: movimento, colisão, altura do chão,
troca de câmera, os cinco pontos de interação, o painel de customização e o
desempenho. Sai com código 1 se algo quebrar.

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
