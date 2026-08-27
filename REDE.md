# Mini City RP — contrato do modo online

Mundo **compartilhado**: o que um jogador vê, o outro vê igual.
Ninguém disputa nada — **não há predição, nem reconciliação, nem portão de
aceitação**. O servidor é a verdade, o cliente desenha.

## Decisões fixas

| | |
|---|---|
| Ritmo do servidor | **15 Hz** (`TICK_HZ = 15`) |
| Interpolação do que é remoto | **100 ms atrás** (`ATRASO_INTERP = 0.1`) |
| Máximo de jogadores | **20** |
| Porta | `PORTA`/`PORT` do ambiente, padrão **8002** (a 8001 é do mago-pvp — conferido no servidor) |
| Colisão entre jogadores | **não existe**, atravessam |
| Transporte | WebSocket, com os dois canais do contrato (`enviar(buf, confiavel)`) |

## A regra que não se quebra

**Nada é identificado por posição em array.** Todo jogador, NPC e objeto tem um
**id numérico próprio e estável**. Índice de array e referência de objeto **nunca**
atravessam a rede. Quem recebe procura pelo id, e aceita não achar.

Faixas de id (`src/comum/mundo.js`):

- **jogadores**: 1..999, dados pelo servidor na entrada
- **NPCs**: 1000..1999, fixos, definidos em `MUNDO.NPCS`
- **objetos agarráveis**: 2000..2999, fixos, definidos em `MUNDO.AGARRAVEIS`
- **portais**: 3000..3999, dados pelo servidor ao abrir. O id **não é
  reaproveitado enquanto aquele portal estiver aberto** — reusar o número faria
  um `PORTAL_FECHADO` atrasado do portal velho apagar o novo.

## Quem manda em quê

- **Servidor é dono do mundo**: NPCs (posição, estado, com quem falam) e todo
  objeto que possa se mexer.
- **Cliente é dono só do próprio corpo**: manda posição, rotação, animação e
  aparência. **Nunca** manda posição de NPC — se mandar, o servidor ignora.
- Tudo que é remoto é desenhado **interpolado 100 ms atrás**.

## Robustez (obrigatória)

Escreva tudo como se o pacote pudesse se perder, duplicar e chegar fora de ordem.

- Entrar e sair a qualquer hora, sem tela de espera.
- Ao sair, o servidor **limpa o jogador na hora** e **libera** qualquer NPC ou
  objeto que ele estivesse usando. Nada pode ficar preso.
- Toda mensagem confiável precisa ser **idempotente**: receber duas vezes não
  pode causar efeito duplo (em especial `OBJ_DESTRUIDO`).
- Snapshot que chega atrasado (tick menor que o último aplicado) é descartado.

---

# Protocolo binário

Todo pacote começa com **1 byte de tipo**. Little-endian. `DataView`.

`VERSAO_PROTOCOLO = 1`. Se não bater, o servidor recusa e o cliente mostra a
tela de recusa pedindo recarregar.

## Cliente → servidor

| # | Nome | Canal | Corpo |
|---|---|---|---|
| 1 | `ENTRAR` | confiável | `u16 versao`, `u8 nomeLen`, `nome utf8`, aparência (6×u8: hair, eyes, brows, mouth, hairColor, skin) |
| 2 | `MEU_ESTADO` | não confiável | `f32 x,y,z`, `i16 yaw`(rad×1000), `u8 anim`, `u8 flags` |
| 3 | `MINHA_APARENCIA` | confiável | 6×u8 igual ao ENTRAR |
| 4 | `FALAR` | confiável | `u16 npcId` |
| 5 | `SAIR_DIALOGO` | confiável | — |
| 6 | `ESCOLHA` | confiável | `u8 opcao` |
| 7 | `PEGAR` | confiável | `u16 objId` |
| 8 | `SOLTAR` | confiável | `u16 objId`, `f32 x,y,z` (onde o cliente queria; o servidor decide) |
| 9 | `ARREMESSAR` | confiável | `u16 objId`, `f32 x,y,z` (origem), `f32 dx,dy,dz` (direção normalizada), `f32 forca` |
| 10 | `OBJ_POS` | não confiável | `u16 objId`, `f32 x,y,z`, `i16 rotY` — só vale se o servidor disser que sou o dono |
| 11 | `DESTRUIU` | confiável | `u16 objId`, `f32 x,y,z` (onde bateu) |
| 12 | `ABRIR_PORTAL` | confiável | `f32 x,y,z` (onde acertou), `i16 yaw`(rad×1000) — **pedido**: o id, o tempo e o aviso são do servidor |
| 13 | `PEGAR_ITEM` | confiável | `u8 item` (1 = arma de portal) |

`anim`: 0 parado, 1 andando, 2 correndo, 3 no ar, 4 sentado.
`flags` bit 0: está sentado; bit 1: anel equipado.

## Servidor → cliente

| # | Nome | Canal | Corpo |
|---|---|---|---|
| 128 | `BEMVINDO` | confiável | `u16 meuId`, `u16 versao`, `u8 tickHz`, aparência salva (6×u8), `u8 itens` (bits; bit 0 = arma de portal), depois a lista completa de NPCs e objetos com id e estado |
| 129 | `RECUSA` | confiável | `u8 motivo` (1 versão, 2 cheio) |
| 130 | `SNAPSHOT` | não confiável | `u32 tick`, `u8 nJog` + jogadores, `u8 nNpc` + NPCs, `u8 nObj` + objetos que se mexem |
| 131 | `ENTROU` | confiável | `u16 id`, nome, aparência |
| 132 | `SAIU` | confiável | `u16 id` |
| 133 | `APARENCIA` | confiável | `u16 id`, 6×u8 |
| 134 | `DIALOGO` | confiável | `u16 npcId`, `u16 jogadorId`, `u8 linhaIdx`, `u8 nOpcoes` |
| 135 | `DIALOGO_FIM` | confiável | `u16 npcId` |
| 136 | `OBJ_DONO` | confiável | `u16 objId`, `u16 donoId` (0 = livre), `f32 x,y,z`, `i16 rotY`, `u8 estado` — a posição é a que o **servidor** decidiu na hora em que o dono mudou |
| 137 | `OBJ_DESTRUIDO` | confiável | `u16 objId`, `f32 x,y,z` |
| 138 | `NEGADO` | confiável | `u8 oque` (1 npc ocupado, 2 objeto ocupado), `u16 id` |
| 139 | `PORTAL_ABERTO` | confiável | `u16 portalId` (3000..3999), `u16 dono`, `f32 x,y,z`, `i16 yaw` |
| 140 | `PORTAL_FECHADO` | confiável | `u16 portalId` — **idempotente**: id que não existe mais não faz nada |

### Jogador dentro do SNAPSHOT
`u16 id`, `f32 x,y,z`, `i16 yaw`, `u8 anim`, `u8 flags`

### NPC dentro do SNAPSHOT
`u16 id`, `f32 x,z`, `i16 yaw`, `u8 estado`, `u16 falandoCom` (0 = ninguém)

`estado`: 0 parado, 1 trabalhando, 2 sentado, 3 cortando, 4 conversando.

### Objeto dentro do SNAPSHOT
Só entram os que **não estão parados no lugar de origem**:
`u16 id`, `f32 x,y,z`, `i16 rotY`, `u16 dono` (0 = livre), `u8 estado`

`estado`: 0 em repouso, 1 seguro, 2 voando, 3 destruído.

---

# Diálogo compartilhado

Quando um jogador aperta `E` perto de um NPC:

1. O cliente **pede** ao servidor (`FALAR`). Ele não decide sozinho.
2. O servidor confere se o NPC está **livre**; se estiver, marca quem está
   falando e **avisa todos** (`DIALOGO`).
3. Na tela de **todos**, o NPC para e vira de frente para quem chamou.
4. Quem está perto (**12 m**) vê o balão, mesma linha, ao mesmo tempo.
   Quem está longe não vê.
5. **Só quem iniciou** tem os botões de resposta. Os outros assistem.
6. Se outro apertar `E`, o servidor responde `NEGADO` e ele só assiste.
7. Se quem falava **se afastar** (>14 m) ou **cair**, o servidor libera o NPC
   sozinho e manda `DIALOGO_FIM`.

Vale para o **mercador** e para o **barbeiro**. A cadeira do barbeiro fica
ocupada enquanto em uso. Cabelo e olhos escolhidos **viajam** e aparecem no
outro jogador na hora; o servidor **guarda a aparência** de cada jogador e
devolve quando ele entra de novo (por nome).

---

# O anel verde (telecinese)

## Regras de rede

- Todo objeto agarrável tem **id** e **dono**. Livre = parado, do servidor.
- **Agarrar é um pedido**. O servidor confere se está livre, marca o dono e
  avisa todos. Dois no mesmo objeto: **o servidor diz quem pegou primeiro**.
- Enquanto segura, a **máquina do dono** manda a posição (`OBJ_POS`, 15 Hz) e
  todos os outros **interpolam**.
- Ao **recolocar**, o **servidor** decide a posição final e avisa todos.
  Nunca deixe cada máquina calcular a queda sozinha.
- Ao **arremessar**, a máquina de quem jogou simula o voo. Ao colidir, ela
  avisa o servidor onde bateu (`DESTRUIU`); o servidor marca destruído e manda
  `OBJ_DESTRUIDO` pelo canal confiável. **Receber duas vezes não faz nada.**
- O feixe, as partículas e o clarão são **100% locais**. Pela rede viaja só o
  evento (quem, qual objeto, onde, quando). Cada máquina desenha sozinha.
- Se quem segura **cair a conexão**, o servidor **solta o objeto sozinho**.

## Como se usa

| Ação | Botão |
|---|---|
| Equipar | `E` no anel, no chão da barbearia |
| Mirar | move o mouse; objeto válido ganha **contorno verde suave** |
| Agarrar / levitar | **botão esquerdo** |
| Recolocar no chão | **botão direito** (segurando) |
| Arremessar | **botão esquerdo** de novo (segurando) |

Objeto arremessado é **destruído ao colidir com qualquer coisa**.

## Visual (é o ponto do poder)

- **Feixe**: não é cilindro reto. Cone de luz verde que sai do anel e **afina**
  até o objeto, com energia correndo por dentro **no sentido do objeto**, leve
  curva, e partículas viajando ao longo dele.
- **Objeto levitando**: oscilação lenta, giro devagar, brilho verde nas bordas,
  partículas orbitando.
- **Ao agarrar**: pulso desce o feixe, objeto salta para cima com um clarão.
- **Ao recolocar**: brilho apaga suave, objeto assenta.
- **Ao arremessar**: o feixe estala, anel de choque sai do anel, objeto voa com
  rastro verde.
- **Ao destruir**: quebra em pedaços que espalham e somem, clarão verde e nuvem.
- **Luz de verdade**: o anel e o objeto levitado emitem `PointLight` verde que
  ilumina a rua, o chão e os outros personagens. É isso que faz parecer real,
  mais do que qualquer partícula.
- **Tranco leve de câmera** no agarrar e no arremessar.

---

# A arma de portal

## Regras de rede

- **Abrir é um pedido.** O cliente manda `ABRIR_PORTAL` com o ponto que acertou
  e o ângulo, e **não desenha nada**. Ele espera o `PORTAL_ABERTO` voltar, pelo
  mesmo caminho de todo mundo — se desenhasse ao clicar, o portal existiria por
  um instante só na tela de quem atirou.
- **Quem dá o id é o servidor**, na faixa **3000..3999**, e o id é a única coisa
  que identifica aquele portal (nunca a posição, nunca o dono). O número **não é
  reaproveitado enquanto o portal estiver aberto**.
- **Um portal por jogador.** Abrir outro **fecha o anterior**: o servidor manda
  `PORTAL_FECHADO` do velho e **só depois** `PORTAL_ABERTO` do novo. Nessa
  ordem, e não na contrária.
- **O servidor conta o tempo.** Passados `MUNDO.PORTAL_DURACAO` segundos (25),
  ele fecha e avisa todos. Se cada máquina usasse o próprio cronômetro, o portal
  sumiria em horas diferentes em cada tela.
- **Sair ou cair a conexão fecha o portal na hora.** Nada fica preso em quem não
  está mais aqui — a mesma regra do diálogo e do objeto na mão.
- `PORTAL_FECHADO` é **idempotente**: receber duas vezes (ou de um portal que já
  fechou) não faz nada — sem clarão, sem som, sem erro. O mesmo portal pode ser
  fechado por três motivos quase juntos, então esse é o caso comum, não a
  exceção.
- **Portais NÃO entram no `SNAPSHOT`.** São no máximo um por jogador, não se
  mexem depois de abertos e nascem/morrem por evento — repetir isso 15 vezes por
  segundo seria pagar banda para dizer o que ninguém mudou. Quem **entra
  atrasado** recebe um `PORTAL_ABERTO` de cada portal vivo logo depois do
  `BEMVINDO` (o mesmo papel que o `BEMVINDO` faz pelos objetos parados).
- **A arma é guardada por nome**, junto com a aparência: `PEGAR_ITEM` acende um
  **bit** no byte de itens, e o `BEMVINDO` devolve esse byte. Quem recarrega a
  página volta com a arma na mão em vez de atravessar a cidade de novo. Pegar
  duas vezes acende o mesmo bit.
- O redemoinho, os pingos, os pontinhos brancos e a luz verde são **100%
  locais**. Pela rede viaja só o evento (quem, qual id, onde, virado para onde).

## Como se usa

| Ação | Botão |
|---|---|
| Pegar a arma | `E` na arma, no balcão da mercearia |
| Atirar o portal | **botão esquerdo** |
| Atravessar | andar até o portal (raio `MUNDO.PORTAL_RAIO`) |

Quem atravessa sai em `MUNDO.PORTAL_DESTINO`, dentro da barbearia.

---

# Painel F3

FPS · ms de rede (ida e volta) · jogadores conectados · quantos NPCs e objetos
o servidor está mandando · bytes/s recebidos.

---

# Arquivos

```
servidor.js                 entrada; lê PORTA do ambiente
servidor/rede-ws.js         HTTP + WebSocket, cache-busting, /saude, heartbeat, relógio
servidor/sala.js            estado autoritativo: jogadores, NPCs, objetos, diálogo, telecinese
src/comum/protocolo.js      ler/escrever os pacotes (usado pelos dois lados)
src/comum/mundo.js          ids estáveis: NPCS e AGARRAVEIS (sem THREE, roda no Node)
src/rede/transporte.js      copiado do mago-pvp
src/rede/transporte-ws.js   copiado do mago-pvp
src/rede/cliente-rede.js    conexão, envio 15 Hz, buffer de snapshots, interpolação 100 ms
src/rede/avatares.js        bonecos dos outros jogadores (usa createCharacter)
src/poder/anel.js           o anel verde: visual, mira, agarrar, arremessar
implantar/minicity.service  systemd
implantar/atualizar.sh      atualizar no servidor com um comando
implantar/subir.ps1         da máquina local: manda o código e reinicia
```
