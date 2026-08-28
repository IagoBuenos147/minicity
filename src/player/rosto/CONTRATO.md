# Contrato dos modulos de rosto (`src/player/rosto/*.js`)

Leia isto antes de escrever qualquer peca de rosto. Quem nao segue este contrato
produz um traco que flutua fora da pele em 5 dos 6 cranios e ninguem percebe ate
o jogador trocar de cabeca.

## 1. O formato de um catalogo

Cada modulo exporta UM array. Cada entrada:

```js
{
  id: 'kebab-case',        // estavel; nunca muda depois de publicado
  nome: 'Nome curto',      // o que aparece no card do customizador
  name: 'Nome curto',      // apelido: a UI antiga le por `name`
  metodo: 'como foi feito',// UMA linha. Serve de documentacao viva do catalogo
  build(ctx) { ... }       // devolve UM THREE.Object3D, ou null pra "nenhum"
}
```

`build(ctx)` roda toda vez que o jogador troca a peca. **Tudo que ele devolve e
descartado no proximo build**: `character.js` da `dispose()` em cada geometria da
subarvore. Por isso:

- **Geometria SEMPRE nova a cada build.** Nunca uma geometria de modulo
  compartilhada — dar dispose nela mataria a peca de todos os outros bonecos na
  cena (sao ate 20).
- **Material pode ser cacheado** (`solid()`, `stdMat()`, `tex()` de
  `world/materials.js` guardam por chave). Ninguem da dispose neles.
- Material com textura PROPRIA que voce quer que seja liberada: marque
  `mat.userData.owned = true`.

## 2. A PRIMEIRA linha de todo build

```js
useHead(ctx)
```

Isso ativa o cranio que o jogador escolheu. Sem essa chamada, `surfaceZ()` e
`eggSurface()` respondem sobre o cranio do boneco ANTERIOR e a peca nasce
flutuando ou enterrada.

## 3. O que o `ctx` traz

| campo | o que e |
|---|---|
| `ctx.cabeca` | indice do cranio (0..5) |
| `ctx.olhos`, `ctx.nariz`, `ctx.boca`, `ctx.barba`, `ctx.cabelo`, `ctx.sobrancelha` | indices |
| `ctx.pele` | indice do tom de pele |
| `ctx.skin` | cor de pele ja resolvida (hex). Use `skinOf(ctx)` |
| `ctx.corCabelo` | indice. Use `hairColorFrom(ctx)` |
| `ctx.corBarba` | indice. Use `beardColorFrom(ctx)` — indice 0 = "igual ao cabelo" |
| `ctx.THREE`, `ctx.mats` | atalhos; da pra importar direto tambem |

Nunca leia cor crua de `ctx.corCabelo`: e INDICE. Passar indice onde se espera
hex pinta o cabelo de uma cor sorteada.

## 4. A superficie da cabeca — a API que gruda a peca na pele

De `./nucleo.js`:

| funcao | o que faz |
|---|---|
| `useHead(ctx)` | ativa o cranio. Sempre primeiro |
| `surfaceZ(x, y, pad)` | Z da pele NA FRENTE da cabeca no ponto (x,y). E a funcao mais usada do arquivo |
| `surfaceX(y, z, pad)` | X da pele NA LATERAL (costeleta, orelha, patilha) |
| `eggSurface(theta, az, s, out)` | ponto da pele em coordenada esferica. `theta` 0 = topo, PI = queixo; `az` 0 = frente, +/-PI = nuca |
| `eggNormal(theta, az, out)` | normal aproximada ali — a direcao em que um pelo nasce |
| `pontoNaPele(theta, az, fora, outP, outN)` | os dois de cima juntos, com afastamento |
| `wrapToHead(geo, pad)` | pega uma geometria desenhada no plano XY e PROJETA na pele; o Z original vira "altura sobre a pele" |
| `deformEgg(geo, s, opts)` | deforma uma esfera unitaria no formato do cranio. `s > 1` gera casca por fora da pele |
| `headShell(cor, opts)` | casca colada no cranio recortada por linhas em theta (base de cabelo/barba) |
| `scalp(cor, lineFn, opts)` | atalho: casca do topo ate a linha `lineFn(az)` |
| `faceSpread()` | quanto afastar os tracos do meio neste cranio (cabeca larga -> olhos mais afastados) |
| `soldarNormais(geo)` | funde as normais dos vertices na MESMA posicao. Toda `LatheGeometry`/`SphereGeometry`/`CapsuleGeometry` fecha a volta duplicando vertices, e sem isso a emenda vira uma LISTRA acesa. Se voce criou geometria de revolucao na mao, chame |

## 5. Escala e medidas

Tudo em metros. `S = HEAD_S = 1.33` e o fator de crescimento da cabeca:
**toda medida facial e multiplicada por `S`**. Referencias uteis:

```
HEAD.rx = 0.135 * S   (0.1796)   meia-largura da cabeca
HEAD.ry = 0.185 * S   (0.2461)   meia-altura
HEAD.rz = 0.130 * S   (0.1729)   meia-profundidade
EYE_ANCHOR = { x: 0.062 * S, y: 0.035 * S }   centro do olho
```

Alturas tipicas no espaco da cabeca (y = 0 e o centro do cranio):

| ponto | y |
|---|---|
| topo do cranio | +0.246 |
| linha do cabelo | +0.15 * S |
| sobrancelha | +0.096 * S |
| olho | +0.035 * S |
| base do nariz | −0.035 * S |
| boca | −0.082 * S |
| queixo | −0.185 * S |

## 6. Pelos de verdade

O pedido do dono e explicito: barba e sobrancelha tem que **mostrar os pelinhos**.
A ferramenta e `tecelagem()` + `fio()`:

```js
import { tecelagem, fio, peloMat, pontoNaPele } from './nucleo.js'

const ma = tecelagem()
const p = new THREE.Vector3(), n = new THREE.Vector3()
const eixo = new THREE.Vector3(1, 0, 0)
for (...) {
  pontoNaPele(theta, az, 0.001, p, n)
  fio(ma, p, n, comprimento, raio, eixo, curvatura)
}
const mesh = new THREE.Mesh(ma.geo(), peloMat(cor))
```

Todos os fios entram numa UNICA BufferGeometry — 1 draw call. Um fio de 5 aneis
x 3 colunas custa 30 triangulos; 300 fios = 9 mil triangulos, o que cabe no
orcamento (a cabeca sozinha tem ~1400).

Regra de custo: **ate ~12 mil triangulos por peca de pelo**. Acima disso, use
uma casca (`headShell`) como base e os fios so na BORDA, que e onde o olho ve a
diferenca entre "pelo" e "capacete de plastico".

## 7. Sombra

- `sh(mesh)` — projeta e recebe sombra. Use em volume (nariz, casca de barba).
- `flatPiece(mesh)` — nao projeta nem recebe. Use em decoracao colada (iris,
  palpebra, cilio, linha de boca): sombra propria num plano colado no globo
  vira uma mancha preta que pisca.

## 8. Erros que ja aconteceram neste codigo (nao repita)

1. **Peca desenhada com Z fixo.** `z = HEAD.rz + 0.01` acerta no cranio redondo
   e afunda 2 cm no comprido. Sempre `surfaceZ(x, y)`.
2. **Esquecer `useHead(ctx)`.** Funciona no primeiro boneco e quebra no segundo.
3. **Geometria de modulo compartilhada.** Um dispose e a peca some de todos.
4. **`flatShading` em superficie curva colada na pele.** As facetas nao batem
   com as da cabeca e a emenda aparece.
5. **Costura nao soldada.** Ver `soldarNormais`.
6. **Passar indice onde se espera hex** (e vice-versa) em cor de cabelo/barba.
7. **Palpebra como textura.** Tem que ser geometria: em close a textura tem
   borda serrilhada e nao recebe a luz da cena.

## 9. Quantos itens em cada catalogo

| modulo | itens | observacao |
|---|---|---|
| `olhos.js` | 5 | cinco METODOS diferentes de construir olho, nao cinco parametros |
| `nariz.js` | 4 | indice 0 = "sem nariz" (`build` devolve `null`) + 3 metodos |
| `boca.js` | 3 | um deles identico ao do jogo de referencia (traco escuro fino e largo, cantos levemente pra cima, sem dente aparente) |
| `barba.js` | 4 | indice 0 = "sem barba" (`null`), + estilo da referencia, + bigode, + barba fechada |
| `cabelo.js` | 3 | tres metodos |
| `sobrancelha.js` | 3 | tres metodos; pelo menos um com fio visivel |

Nao existe mais catalogo de PUPILA: a iris faz parte do olho.
