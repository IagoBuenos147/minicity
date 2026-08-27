# Mini City RP

Jogo 3D no navegador (JavaScript + Three.js), primeira e terceira pessoa, com uma
mini cidade e um personagem no estilo do jogo *Schedule I*.

## Rodar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` e clique na tela para travar o mouse.

## Controles

| Tecla | Ação |
|---|---|
| `W A S D` | Mover |
| `Shift` | Correr |
| `Espaço` | Pular |
| `Mouse` | Olhar |
| `E` | Interagir |
| `V` | Alternar 1ª / 3ª pessoa (estilo GTA) |
| `1 2 3 4` | Mãos / anel / arma de portal / revólver |
| `C` | Trocar a estação: **sol → chuva → neve → sol** |
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

## Customização do personagem

3 opções para cada categoria, trocáveis dentro do jogo:

- **Cabelo**: curto, espetado, comprido (+ cores)
- **Olhos**: normal, cansado (bloodshot), arregalado
- **Sobrancelhas**: grossa reta, arqueada, fina franzida
- **Boca**: sorriso, neutra, bigode + cavanhaque

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
npm run smoke            # o jogo inteiro rodando no navegador (38 casos)
npm run teste-cassino    # as regras dos jogos, sem navegador (84 casos)
npm run teste-nome-unico # um corpo por nome no servidor (10 casos)
npm run teste-online     # dois navegadores de verdade na mesma sala (37 casos)
npm run shot-clima       # fotos do cassino, da chuva e da neve em shots/
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
