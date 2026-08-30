# Veículos — contrato

Cinco veículos: **carro**, **caminhonete**, **moto**, **skate** e
**helicóptero**. Entra-se e sai-se com `E`. Cada um dirige diferente, e a
diferença tem que **se sentir**.

Carro, moto e skate ficam estacionados na rua principal, em frente às lojas
(`MUNDO.VEICULOS`), a poucos passos do ponto onde o jogo começa — é o pátio de
testes. O helicóptero não fica no mundo: ele é **criado pelo anel verde**. A
**caminhonete** também não: ela nasce **comprada na Garagem do Nando** (ver
abaixo) e aparece estacionada na vaga em frente à loja.

## Ids

Faixa **4000..4999** (`src/comum/mundo.js`). Os três estacionados têm id fixo;
o helicóptero recebe id do servidor na hora (4100..4999). Como em todo o resto
do projeto: **nada é identificado por índice de array**.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/veiculos/veiculos.js` | o sistema: registro, entrar/sair, física comum, câmera, HUD |
| `src/veiculos/carro.js` | modelo do carro preto |
| `src/veiculos/moto.js` | modelo da moto |
| `src/veiculos/caminhonete.js` | modelo da pickup velha |
| `src/veiculos/skate.js` | modelo do skate |
| `src/veiculos/helicoptero.js` | modelo + montagem peça por peça + voo |

## API do sistema

```js
export function criarVeiculos({ scene, camera, player, character, collision,
                                rede, hud, groundY, interaction }) => {
  grupo,                    // tudo que é veículo
  atualizar(dt),            // chamado todo frame pelo main
  entrarSair(),             // o `E` quando há um veículo perto
  aoEventoDeRede(ev),
  criarHelicoptero(x, y, z),// chamado pelo anel quando a montagem termina
  dirigindo,                // id do veículo em que estou, ou 0
  veiculoPerto(pos),        // {id, tipo, dist} ou null — para o prompt do `E`
  dispose(),
}
```

## Modelo de cada veículo

Cada arquivo exporta `construir()` → `{ grupo, assento, rodas[], config }`:

- `grupo`: origem **no chão**, no centro do veículo, frente para `+Z`
- `assento`: `THREE.Object3D` onde o personagem senta (posição e rotação locais)
- `rodas`: as que giram e esterçam (para a animação)
- `config`: a chave em `MUNDO.DIRIGIR` (`'carro'`, `'moto'`, …)

### O que o modelo pode entregar a mais (`grupo.userData`)

Tudo opcional; o sistema testa antes de usar. Nenhum destes campos muda a
física — eles só existem para o veículo **ler** como veículo.

| Campo | Para quê |
|---|---|
| `pivoDirecao` | o conjunto que esterça junto (garfo + guidão + farol + roda da moto). Existindo, é ele que recebe o esterço, e a roda dianteira não esterça de novo |
| `pivo` | pivô na altura do eixo, para tombar sem tirar as rodas do chão (skate) |
| `carroceria` | o corpo **sem as rodas**. Existindo, é ele que mergulha, rola e afunda na suspensão — as quatro rodas ficam plantadas no asfalto. É o que dá **peso** ao carro |
| `volante` | pivô da coluna de direção; gira `voltaVolante` vezes o esterço |
| `voltaVolante` | relação de direção (padrão 2.6) |
| `luzesFreio` / `farois` | materiais que acendem (instâncias próprias, nunca do cache) |
| `rotor` / `rotorCauda` | giram sozinhos (helicóptero) |
| `piloto` | **onde o piloto põe mão e pé** — ver abaixo |

### A pose de quem pilota

`grupo.userData.piloto = { maos, pes, tronco, quadril, cotovelo, joelho, corpoNaCurva }`.

`maos` e `pes` são pares de `Object3D` (`[0]` = lado `+X`, que em
`character.js` é o lado dos membros `R`). O sistema resolve braço e perna por
**IK de dois ossos** até esses pontos, e é isso que faz a mão acompanhar o
guidão quando ele esterça: os alvos são filhos do `pivoDirecao` (moto) ou do
`volante` (carro), então giram junto de graça.

Os outros campos são ângulos em radianos: `tronco` inclina o piloto para
frente (dividido entre quadril, torso e peito, para a coluna curvar em vez de
dobrar num ponto só), `cotovelo`/`joelho` giram o membro em volta da linha
ombro→alvo (é o que abre o cotovelo para fora e o joelho em volta do tanque),
e `corpoNaCurva` joga o corpo para dentro da curva além do que a moto já
inclina.

O skate não usa `maos`: ele tem pose própria, com os dois pés na lixa, o de
trás saindo para empurrar o chão e o corpo agachando junto.

## Como cada um tem que se sentir

Os números estão em `MUNDO.DIRIGIR` — respeite-os, e ajuste **lá**, não no código.

**Carro** — preto, bonito, um pouco antigo (linhas de clássico dos anos 60/70:
capô longo, para-lamas marcados, cromados, faróis redondos, grade vertical,
teto baixo). É o mais **rápido em reta** e o que **menos vira**: raio de curva
grande, e a direção fecha conforme a velocidade sobe. Rodas dianteiras esterçam
de verdade, as quatro giram, e a **carroceria** (só ela, não as rodas) inclina
na curva, mergulha no freio e afunda na suspensão.

A aderência tem **teto**, e não coeficiente fixo: a curva pede
`|taxa de giro × velocidade|` em m/s², o pneu segura até `limite`, e só o que
passar disso vira escorregada. Por isso curva devagar **gruda** (0 grau de
deriva) e curva rápida sai de lado **um pouco** (~5 graus), voltando sozinha em
meio segundo quando o volante endireita. **Espaço é freio de mão** — e só no
carro: derruba o teto para 28% e a traseira sai na hora (~20 graus), com fumaça
saindo debaixo das rodas de trás. Quem segura o volante é o motorista, e as
mãos dele acompanham o aro.

> A primeira versão destes números foi reprovada: com `limite` 5.5 e `agarra`
> 0.26 o carro escorregava em qualquer curva e a escorregada durava mais de
> meio segundo — "parece que ele tá derrapando sempre" —, e com `giroMax` 0.62
> ele ainda virava pouco. Derrapagem é o que acontece quando o jogador
> **exagera**, não o estado normal do carro.

**Moto** — custom/cruiser preta com cromados: V-twin de dois cilindros
aletados, tanque gota, garfo comprido e **inclinado de verdade** (o guidão gira
em volta do eixo de direção caído, não da vertical), rodas raiadas, para-lamas
fundos e escapamento duplo. É a mais ágil e a que acelera mais forte, mas a
mais nervosa: **inclina muito** na curva (é o que dá o prazer de pilotar),
guidão esterça, roda dianteira acompanha, e o piloto inclina junto. Perde
estabilidade em alta, e agarra mais que o carro (só escorrega perto do talo).
`Espaço` não faz nada nela: freio de mão é só do carro (moto de rabeira não
combina com o resto da pilotagem dela, que é agarrada e limpa).

O piloto **não senta como num banco**: ele inclina o tronco para frente, põe as
duas mãos nos punhos e os dois pés nas pedaleiras (IK, ver acima). Esterçando,
as mãos vão junto com o guidão.

**Skate** — lento e gostoso: `W` dá **impulsos**, e um impulso leva tempo. O
ciclo inteiro (`MUNDO.DIRIGIR.skate.ciclo`) é: o pé sai do deck, desce,
**varre** o chão para trás e volta — e só o trecho da varredura põe velocidade.
Por isso a velocidade sobe em degraus, com patamar entre um e outro, em vez de
subir numa rampa como a de um carro. Cada empurrada rende menos quanto mais
rápido ele já está, então existe uma **velocidade de cruzeiro** (uns 20 km/h)
abaixo do teto (~35 km/h). Solto, ele rola por muito tempo (atrito baixo). `S`
é o **pé raspando o chão**: freia devagar, e **parado ele vira a ré** — o mesmo
pé empurrando para o outro lado, devagar e contínuo (não há ciclo de empurrada
na ré). `Espaço` dá um pulinho, com o bico levantando na subida.

O deck **não trepida**. Existiu um chacoalho de meio grau na frequência da
rodinha no asfalto, e foi reprovado: como o boneco é filho do deck, o chacoalho
subia pela perna e o corpo inteiro vibrava — "parece bugado". Se um dia voltar,
tem que ser aplicado só na geometria do deck, nunca no pivô que carrega o
piloto.

O personagem fica **em pé** sobre o deck, de lado, com os dois pés em cima dos
trucks (IK), joelhos moles e o peito virado para o nariz do skate; na empurrada
o corpo agacha e a perna de trás vai até o chão.

**Helicóptero** — verde. `W`/`S` inclinam para frente/trás e é essa inclinação
que o faz andar; `A`/`D` giram; `Espaço` sobe, `Shift` desce. Tem inércia: não
para no ar de uma vez. Rotor principal e de cauda girando, e o helicóptero
inclina na direção do movimento. Teto de altura em `MUNDO.DIRIGIR.helicoptero.tetoY`.

## Entrar e sair

- `E` perto de um veículo entra; `E` dentro sai.
- Ao entrar: o controller do jogador é travado (`player.setLocked(true)`), o
  personagem é posicionado no `assento` do veículo, e a **câmera passa a seguir
  o veículo** (atrás e acima, com `alturaCam`/`distCam` de `MUNDO.DIRIGIR`,
  com a mesma suavização e o mesmo teste de parede da câmera de 3ª pessoa).
- Ao sair: o personagem é colocado **ao lado** do veículo, em chão livre
  (`collision.isFree`), e o controller é destravado.
- Enquanto dirige, o HUD mostra a velocidade e "E para sair".

## O giro das rodas

Com o eixo da roda em X e a frente em `+Z`, rolar para frente é
`rotation.x` **crescendo** (o ponto de cima vai para `+Z`; o de baixo, que toca
o chão, vai para trás). O sinal já esteve invertido e ninguém viu por semanas —
num pneu liso não dá para perceber. Numa roda de cinco raios dá.

## Colisão

O veículo usa os mesmos colisores do mundo (`collision.resolve`) com um raio
maior que o do jogador. Bateu na parede, para — sem capotar nem atravessar.
O chão vem de `groundY(x, z)`, igual ao jogador (calçada 0.16, rua 0…).

## Online

Segue **exatamente** o padrão dos objetos agarráveis (`REDE.md`):

- todo veículo tem **dono** (quem está dirigindo). Livre = parado, do servidor.
- entrar é um **pedido**; o servidor confere se está livre, marca o dono e
  **avisa todos**. Dois pedindo ao mesmo tempo: o servidor diz quem entrou.
- enquanto dirige, a máquina do dono manda a posição a 15 Hz; os outros
  **interpolam 100 ms atrás**.
- sair: o servidor libera e avisa todos.
- **cair a conexão libera o veículo sozinho** — nada pode ficar preso.
- o helicóptero criado é registrado no servidor e aparece para todos.

## O helicóptero e o anel

Com o **anel equipado** e **nada na mão**, segurar o **botão direito** apontando
para um ponto livre do chão inicia a montagem:

- uma barra/anel de progresso enche em `MUNDO.HELI_MONTAGEM` segundos;
- as **peças vão chegando e se encaixando** durante esse tempo — patins, cauda,
  cabine, rotor —, cada uma vindo de fora com um brilho verde, girando até
  assentar no lugar;
- soltar o botão antes do fim **cancela** e as peças se desfazem;
- ao completar, um clarão verde e o helicóptero fica pronto para entrar com `E`.

Tudo verde, no mesmo material e brilho do anel.

## Como conferir

```bash
node tools/teste-dirigir.mjs
```

Mede a **pose** (que é o que o jogador vê), e não os números privados da
física: o ângulo entre para onde o veículo aponta e para onde ele andou é a
derrapagem. Confere a faixa inteira — gruda devagar, sai de lado rápido, volta
sozinha, freio de mão sai mais —, os degraus de velocidade do skate e se as
mãos do piloto caem exatamente no volante, no guidão e nas pedaleiras.

```bash
node tools/shot-pilotagem.mjs
```

Fotografa cada veículo parado e sendo pilotado, com a câmera posicionada no
espaço do próprio veículo (aceita `moto`, `carro`, `skate` como argumento). Em
headless o laço do jogo não roda sozinho, então a ferramenta chama
`veiculos.atualizar()` quadro a quadro e aperta as teclas pelo mesmo caminho do
teclado de verdade — dá para fotografar o meio de uma empurrada de skate ou de
uma derrapagem.

## Veículo comprado na concessionária

`veiculos.criarComprado(tipo, x, z, yaw)` põe no mundo um veículo do tipo
pedido, já estacionado e pronto para entrar com `E`. Devolve o **id** (faixa
**4010..4089**) ou `0` quando o tipo não tem modelo.

Essa faixa mora em `src/veiculos/veiculos.js` e **não** em `comum/mundo.js`,
de propósito: `mundo.js` é a lista de ids que os dois lados da rede precisam
combinar, e veículo comprado **é local** — como a carteira e como a mobília
instalada na casa. O protocolo não tem pacote de compra, e inventar um
significaria mexer no servidor e no contrato.

Quem chama é `criarGaragem()` de `src/world/concessionaria.js`, o "inventário"
que a janela de loja usa no lugar da mochila.

## Como a caminhonete se sente

Pesada, e cada número de `MUNDO.DIRIGIR.caminhonete` existe por causa de uma
coisa que uma pickup velha faz e os outros não: motor cansado (61 km/h contra
os 79 do carro), entre-eixos de 3 m que não vira em cima de si mesmo, pneu
alto e cravado que **agarra menos** que pneu de rua (então ela sai de lado bem
antes do carro), e `inclina` no dobro do carro — o corpo tombando na curva é o
que faz ela **se sentir** pesada.
