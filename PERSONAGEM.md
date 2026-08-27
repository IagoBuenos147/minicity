# Personagem — contrato da reforma visual

Referência: as fotos do jogo *Schedule I* que o dono do projeto mandou. Cada
personagem lá tem **identidade visual própria** — cabeça de formato diferente,
olhos semicerrados com pupilas diferentes, barba, roupa. É isso que se busca.

## 1. A aparência (o formato que viaja pela rede)

**20 bytes**, um por campo, todos índices (nunca cor crua). Ordem fixa:

| # | campo | opções | observação |
|---|---|---|---|
| 0 | `cabeca` | 8 | formatos de crânio |
| 1 | `olhos` | 5 | formato/abertura da pálpebra |
| 2 | `pupila` | 5 | tamanho, cor e forma da íris |
| 3 | `nariz` | 5 | |
| 4 | `boca` | 5 | |
| 5 | `barba` | 5 | 0 = sem barba |
| 6 | `cabelo` | 5 | |
| 7 | `pele` | 5 | tom |
| 8 | `corCabelo` | 6 | |
| 9 | `sobrancelha` | 5 | |
| 10 | `chapeu` | 6 | 0 = nenhum |
| 11 | `calcado` | 6 | 0 = descalço |
| 12 | `blusa` | 6 | 0 = nenhuma |
| 13 | `calca` | 6 | |
| 14 | `colar` | 6 | 0 = nenhum |
| 15 | `anelAcess` | 6 | 0 = nenhum |
| 16 | `tatuagem` | 6 | 0 = nenhuma |
| 17 | `relogio` | 6 | 0 = nenhum |
| 18 | `jaqueta` | 6 | 0 = nenhuma |
| 19 | reservado | — | folga para não mexer no protocolo de novo |

`VERSAO_PROTOCOLO` **sobe para 3** (o pacote de aparência mudou de tamanho).

**Isso viaja pela rede**: se um jogador muda o visual, todos os outros veem na
hora. Já existe `MINHA_APARENCIA` (cliente→servidor) e `APARENCIA`
(servidor→todos); o servidor guarda por nome e devolve no `BEMVINDO`.

## 2. A cabeça — 8 formatos

Não é a mesma cabeça escalada: são **silhuetas diferentes**, todas a partir da
deformação de esfera que já existe (`makeHeadGeometry`).

0 ovo clássico · 1 redonda · 2 comprida/estreita · 3 quadrada de maxilar largo
4 pera (queixo largo, topo estreito) · 5 achatada · 6 ondulada/irregular
7 realista (mais próxima de crânio humano, com têmporas e occipital)

## 3. Os olhos — o que dá vida (referência: foto 2)

Na referência os olhos são **semicerrados**: a pálpebra superior corta o globo
por cima, e a pupila é grande e escura. Não são bolas arregaladas.

- **`olhos` (5)**: quanto a pálpebra fecha e o formato da abertura —
  0 normal · 1 semicerrado (o da referência) · 2 arregalado · 3 caído/cansado
  4 apertado/desconfiado.
  A pálpebra é geometria de verdade (calota na cor da pele por cima do globo),
  não textura.
- **`pupila` (5)**: 0 média escura · 1 pequena · 2 grande dilatada
  3 clara (azul/verde) · 4 vermelha/bloodshot com veias na esclera.

## 4. O corpo (referência: foto 3)

- **Mãos com DEDOS**: quatro dedos e polegar, cada um com duas falanges e uma
  leve curva. Nada de luva-bloco.
- Ombros estreitos, braços e pernas finos, torso levemente cônico.
- Pescoço curtíssimo.
- Proporção mantida: altura 1.82, cabeça ~1/4 da altura.

## 5. Idle — o corpo tem PESO

O que o dono reclamou: "o corpo dele fica flutuando e balançando de um lado pro
outro". Em `idle` o personagem fica **parado**:

- **zero** deslocamento do quadril (nem em X nem em Y — mexer no quadril levanta
  e desliza os pés, que são filhos dele);
- **zero** balanço lateral;
- só: respiração muito discreta no peito (escala, não posição) e a **piscada**;
- os pés ficam plantados no chão.

## 6. Câmera em primeira pessoa

"Está tremendo tudo, balançando muito ao correr e caminhar." Suavizar:

- reduzir a amplitude do bob para cerca de **um terço** do que é hoje;
- suavizar por filtro (a câmera persegue o alvo do bob com damp, em vez de
  saltar direto para a senoide);
- tirar quase todo o roll lateral;
- a transição andar↔correr entra por rampa, não de um quadro para o outro.

O objetivo: não enjoar. Nada disso muda a velocidade do jogador.

## 7. Barbeiro e provador

**Barbeiro** (já existe): muda cabeça, olhos, pupila, nariz, boca, barba,
cabelo, cor do cabelo, sobrancelha e pele.

**Provador** (NPC novo, ao lado do barbeiro, dentro da barbearia): muda chapéu,
calçado, blusa, calça, colar, anel, tatuagem, relógio e jaqueta.

### A câmera da customização (hoje está entrando dentro da parede)

Ao sentar na cadeira (barbeiro) ou usar o provador:

- o personagem fica **de frente para a câmera**, iluminado;
- **close no rosto** para as categorias de rosto; **corpo inteiro** no provador;
- ao mexer numa categoria específica, a câmera **aproxima da parte**: colar →
  pescoço e cabeça; calça → quadril e pernas; calçado → pés; relógio/anel → mão;
- o jogador **gira a câmera com o mouse** em volta de si mesmo (arrastar ou
  mover), podendo ver de costas;
- **a câmera nunca atravessa parede**: usar `collision.segmentHit`, o mesmo
  teste da câmera de 3ª pessoa, e encurtar o braço quando houver parede.

## 8. Arquivos

| Arquivo | O quê |
|---|---|
| `src/player/appearance.js` | os catálogos (8 cabeças, 5 de cada resto) |
| `src/player/character.js` | corpo, mãos com dedos, slots das roupas |
| `src/player/roupas.js` | **novo**: chapéus, blusas, calças, calçados, acessórios |
| `src/player/animation.js` | idle com peso |
| `src/player/controller.js` | câmera de 1ª pessoa suave |
| `src/ui/customizer.js` | UI das categorias + câmera de close que não atravessa parede |
| `src/comum/mundo.js` | posição do provador, `VERSAO_PROTOCOLO = 3` |
| `src/comum/protocolo.js` | aparência de 20 bytes |
