# Veículos — contrato

Quatro veículos: **carro**, **moto**, **skate** e **helicóptero**. Entra-se e
sai-se com `E`. Cada um dirige diferente, e a diferença tem que **se sentir**.

Os três primeiros ficam estacionados na rua principal, em frente às lojas
(`MUNDO.VEICULOS`), a poucos passos do ponto onde o jogo começa — é o pátio de
testes. O helicóptero não fica no mundo: ele é **criado pelo anel verde**.

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

## Como cada um tem que se sentir

Os números estão em `MUNDO.DIRIGIR` — respeite-os, e ajuste **lá**, não no código.

**Carro** — preto, bonito, um pouco antigo (linhas de clássico dos anos 60/70:
capô longo, para-lamas marcados, cromados, faróis redondos, grade vertical,
teto baixo). É o mais **rápido em reta** e o que **menos vira**: raio de curva
grande, e a direção fecha conforme a velocidade sobe. Um pouco de derrapagem ao
esterçar forte. Rodas dianteiras esterçam de verdade, as quatro giram, a
carroceria inclina na curva e mergulha no freio.

**Moto** — a mais ágil e a que acelera mais forte, mas a mais nervosa: **inclina
muito** na curva (é o que dá o prazer de pilotar), guidão esterça, roda
dianteira acompanha, e o piloto inclina junto. Perde estabilidade em alta.

**Skate** — lento e gostoso: `W` dá **impulsos** (não é aceleração contínua — é
o pé empurrando o chão, com intervalo entre um e outro), rola por inércia com
pouco atrito, curva fácil, e o deck inclina para o lado da curva. `Espaço` dá um
pulinho. O personagem fica **em pé** sobre o deck, de lado.

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
