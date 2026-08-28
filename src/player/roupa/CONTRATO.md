# Contrato dos catalogos de roupa (`src/player/roupa/*.js`)

Leia isto e leia `nucleo.js` antes de escrever qualquer peca.

## 1. Formato de um catalogo

```js
{
  id: 'kebab-case',
  nome: 'Nome curto',        // texto do card no customizador
  metodo: 'como foi feito',  // UMA linha. Documentacao viva do catalogo
  esconde: ['torso','peito'],// opcional: pele que a peca cobre
  build(c) { ... }           // devolve UM Object3D, ou null pra "nenhum"
}
```

`build(c)` roda a cada troca. **Tudo que ele devolve e descartado no proximo
build** (`character.js` da `dispose()` na subarvore). Portanto:

- **Geometria SEMPRE nova dentro do build.** Geometria de modulo compartilhada
  entre bonecos morre pra todo mundo quando UM jogador troca de roupa.
- **Material e textura podem ser cacheados** (`solid`, `stdMat`, `tex`).
- Textura propria que deva ser liberada: `mat.userData.owned = true`.

## 2. `esconde` — a pele que some por baixo

Valores validos, exatamente estes:
`torso`, `peito`, `braco`, `antebraco`, `coxa`, `canela`, `pe`.

**Esconder mais do que a peca cobre e a causa numero 1 de buraco no boneco.**
O corpo nu tem pedacos que NAO estao nessa lista e continuam la: a bola do
cotovelo, a do joelho, a mao, o tornozelo. Uma manga que apaga `antebraco` mas
para 3 cm antes do pulso deixa a mao solta no ar.

## 3. O `c` (ctx) que chega no build

| campo | o que e |
|---|---|
| `c.cor.pele` | cor de pele ja resolvida (hex) |
| `c.cor.cabelo` | cor do cabelo (hex) |
| `c.cor.blusa`, `c.cor.calca`, `c.cor.calcado` | cores base da roupa (hex) |
| `c.app` | a aparencia inteira (indices) |
| `c.THREE`, `c.mats` | atalhos |
| `c.sh(mesh)` | liga sombra (mesmo que o `sh` do nucleo) |
| `c.lathe(perfil, flatZ, seg)` | a MESMA lathe que gera a pele do corpo |
| `c.perfil.PELVIS` / `.PEITO` / `.MANGA` | os perfis do corpo nu, `[[raio, y], ...]` |
| `c.medida` | ver a tabela abaixo |
| `c.partes` | as juntas: `hips torso chest neck head face armLUpper armLLower handL armRUpper armRLower handR legLUpper legLLower footL legRUpper legRLower footR` |
| `c.montar(obj, 'nomeDaParte')` | pendura `obj` noutra junta e registra pra limpeza. **E assim que se faz o par de pes, o par de bracos, a tatuagem no outro braco** |

### `c.medida`

```
HIPS_Y 0.84      altura do quadril               CHEST_Y 0.30   chest sobre hips
NECK_Y 0.165     neck sobre chest                SHOULDER_X 0.124
SHOULDER_Y 0.120 ombro sobre chest               UPPER_ARM 0.28   FORE_ARM 0.26
HIP_X 0.070      THIGH 0.384   SHIN 0.3655
ANKLE_Y 0.0905   altura da junta do pe
SOLA_Y           chao no espaco do pe (= -ANKLE_Y + 0.003)
FLAT_Z 0.76      achatamento do torso em Z
TORSO_SEG 24     faces do torso. A ROUPA TEM QUE USAR O MESMO NUMERO E A MESMA
                 FASE, senao os poligonos se cruzam e a borda serrilha
HEAD, HEAD_S     medidas da cabeca (para chapeu)
DEDOS, DEDO_ANELAR  posicao dos dedos da mao (para anel)
```

**Ancoras dos slots** (o `build` desenha no espaco da ancora, com a origem NA
JUNTA):

| slot | ancora |
|---|---|
| `chapeu` | `head` — origem no CENTRO do cranio, +Z = frente |
| `blusa` (camisa) | `torso` |
| `calca` | `hips` |
| `calcado` | `legR.foot` (o pe DIREITO; o esquerdo vai por `c.montar(obj,'footL')`) |
| `colar` | `neck` |
| `anelAcess` | `armL.hand` (a mao esquerda) |
| `relogio` | `armL.low` (o antebraco esquerdo) |
| `tatuagem` | `chest` (o resto vai por `c.montar`) |

## 4. As folgas (nucleo.js) — nao invente numero

```
FOLGA_JUSTA  1.045   camiseta, camisa, regata
FOLGA_SOLTA  1.062   moletom, corta-vento
FOLGA_LARGA  1.070   TETO do catalogo: jaqueta, paleto, blusao
SOBRA_ACESSORIO 0.004   4 mm alem da peca mais larga
RAIO_GOLA_ALTA  0.0555  raio da gola mais alta; teto do colar
MANGA_FIM_Y 0.045 / MANGA_R_BRACO 0.052 / MANGA_R_PUNHO 0.0465
FOLGA_CALCA 1.020 / FOLGA_CINTO 1.038
```

A pele esta em 0.965 do perfil, entao 1.045 ja e ~8 mm de tecido no peito — o
bastante pro depth buffer separar as duas superficies a 30 m de camera.

**Peca nova nao pode passar de `FOLGA_LARGA`**: o colar e calibrado a partir
desse teto e uma jaqueta mais gorda enterraria a corrente.

## 5. Ferramentas do nucleo que voce vai usar

| funcao | pra que |
|---|---|
| `casca(c, perfil, {folga, extra, seg, phi0, phiLen})` | tecido em cima de um perfil do corpo. **A base de toda peca de tronco** |
| `fatia(perfil, y0, y1)` | recorta o perfil GUARDANDO os vertices do meio (cortar so nas pontas fura o vinco do quadril) |
| `raioPerfil(perfil, y)` | raio do corpo naquela altura |
| `revolver(perfil, seg, flatZ, phi0, phiLen)` | lathe cru. **Ja solda a costura** |
| `frenteZ(c, perfil, y, folga, fora)` / `frenteXZ(...)` | Z da superficie da peca (botao, ziper, bolso). A secao NAO e um circulo — usar o z do meio pra um bolso lateral deixa o bolso boiando |
| `troncoTecido`, `barra`, `gola`, `tira`, `bordaAberta`, `botoes`, `bolso`, `mangaCurta`, `mangaLonga`, `alcas` | pecas prontas de camisa |
| `cos`, `pernas`, `nasPernas`, `cinto` | pecas prontas de calca |
| `apoio(c)`, `calota(H, mat, thetaMax, folga)`, `abaCurva(r, esp, mat)` | pecas de chapeu. `calota` devolve `{mesh, y, r}` — onde a borda parou |
| `par(c, fabrica)` | monta a peca nos DOIS pes (chama a fabrica com sinal +1/-1) |
| `sapatoBase(c, o)`, `biqueira`, `cadarco` | base de calcado |
| `frentePeito`, `corrente`, `pingente` | colar |
| `posDedo(c, o)`, `aro(c, mat, o)`, `dorso(a, dist)` | anel |
| `pulseira(c, mat, r, t)`, `mostrador(c, geo, mat, dist)` | relogio |
| `tintaMat(id, desenho, voltas)`, `faixaMembro`, `chapaPeito` | tatuagem |
| `listrasMat(a,b)`, `xadrezMat(a,b)`, `floralMat(...)` | estampas |
| `tecido`, `tecido2`, `couro`, `couro2`, `metal`, `esc(hex,mul)` | materiais |
| `soldarNormais(geo)` | **obrigatorio** em qualquer lathe/esfera/capsula que voce gerar na mao |

Do modulo do rosto (`../rosto/nucleo.js`) valem tambem `tecelagem()`, `fio()` e
`peloMat()` — sao a ferramenta de PELO, util pra la de barba: gola de pelucia,
pompom, franja de couro, tufo de tapete.

## 6. Custo

Ate 20 bonecos na tela ao mesmo tempo. Orcamento por peca:

| peca | teto de triangulos |
|---|---|
| camisa, calca | 6 000 |
| chapeu, calcado (o PAR) | 4 000 |
| colar, anel, relogio | 2 500 |
| tatuagem | 1 500 (e quase tudo textura) |

## 7. O que o dono pediu nesta reforma

> "na aba roupas e na aba calcas, colares, aneis, relogio e tatuagem, apagando
> todos esses voce vai adicionar 3 itens em cada, mantendo o mesmo padrao,
> METODO DIFERENTE EM CADA ITEM pra gente testar, juice e singularidade e
> identidade visual em cada um. Mude tambem a aba roupas para CAMISAS."
>
> "na aba de chapeus pode manter o chapeu numero 2, 3, 4, 5, 6, 10, somente
> esses, porem ADAPTE eles para o novo modelo de personagem e de um juice
> especial neles, para que nao fiquem parecidos com blocos ou quadrados e que
> tenham identidade visual."
>
> "na aba calcados pode manter o numero 3, 5, 10, 11, adaptando eles para o que
> queremos no personagem novo."

"Metodo diferente em cada item" e literal: tres camisas nao podem ser a mesma
funcao com outra cor. Declare o metodo no campo `metodo` e explique no
comentario.

## 8. Erros que ja aconteceram (nao repita)

1. Raio escrito na mao em vez de sair do perfil do corpo → risco de pele em
   volta da cintura e do pescoco.
2. Lathe sem `soldarNormais` → listra vertical acesa no meio do peito.
3. `esconde` maior do que a cobertura real → buraco no braco/pulso.
4. Acessorio desenhado no raio da pele → nasce dentro do pano.
5. Casca aberta na frente sem `DoubleSide` → pela abertura se ve o mundo do
   outro lado do boneco.
6. `TORSO_SEG` diferente do corpo → borda serrilhada onde o tecido encontra a
   pele.
7. Chapeu encostando na pele → some dentro do cranio comprido. Use `apoio(c)`.
