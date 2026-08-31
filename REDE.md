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
- **veículos**: 4000..4999. Os três estacionados têm id **fixo** em
  `MUNDO.VEICULOS`; o helicóptero recebe o dele do servidor em **4100..4999**
  (`MUNDO.HELI_ID_MIN`/`HELI_ID_MAX`), pela mesma regra do portal — o número
  **não volta a ser usado enquanto aquele veículo existir**.

## Quem manda em quê

- **Servidor é dono do mundo**: NPCs (posição, estado, com quem falam) e todo
  objeto que possa se mexer. Isso inclui o rapaz que vira zumbi — a doença, a
  virada, a perseguição e a morte dele são decididas **lá**.
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
- **A recusa chega antes do fecho.** A sala recusa mandando `RECUSA` e fechando
  na linha seguinte; com `terminate()` (que destrói o socket sem esvaziar o que
  já foi escrito) o pacote que *explica* a recusa morria no buffer e o jogador
  via só a conexão cair. `rede-ws.js` usa `close()`, com `terminate()` como rede
  de segurança de 1 s.

## UM CORPO POR NOME (e o fim do sósia)

Sintoma que esta seção existe para matar: *"entrei e tem dois de mim, e os dois
andam junto"*. Ele tem **quatro origens diferentes** e todas estão fechadas:

1. **`main.js` avaliado duas vezes.** Módulo ES é identificado pela **URL**, e
   basta a mesma build ser pedida por dois endereços (`.../index-AbC.js` e
   `.../index-AbC.js?v=xyz`) para o navegador executar o arquivo do zero de
   novo. Resultado: duas telas iniciais empilhadas (daí o *"tem que clicar duas
   vezes"*), dois personagens, e os dois andando juntos porque o teclado é do
   `window`. A causa mais provável está corrigida em `carimbarVersao`
   (`servidor/rede-ws.js`), mas *corrigido num lugar* não é *impossível*: a
   primeira linha de `src/main.js` planta uma bandeira em `globalThis` e
   qualquer segunda avaliação morre ali, antes de criar renderer, personagem,
   HUD ou socket.
2. **Clique duplo na tela inicial.** O overlay leva 380 ms de *fade* para virar
   `pointer-events: none`; dois cliques nesse intervalo chamavam o callback
   duas vezes. `hud.js` agora só aceita o primeiro.
3. **`rede.conectar()` chamado duas vezes.** Abria **dois sockets**, e o
   servidor via dois jogadores com o mesmo nome — um deles parado, porque só o
   último transporte recebia o `MEU_ESTADO`. A segunda chamada agora devolve a
   mesma promessa da primeira.
4. **Reconexão com a sessão velha ainda viva.** O batimento leva até 10 s para
   descobrir que o outro lado morreu, então todo F5 deixava um sósia parado por
   dez segundos — segurando o NPC com quem a pessoa falava e o objeto que ela
   carregava. **A regra agora é: quem entra com um nome que já está na sala
   derruba a sessão anterior daquele nome** (`sala.entrar`), com `sair()`
   completo antes de o corpo novo nascer. A conta de lotação vem **depois** do
   corte, senão quem recarrega com a sala cheia disputaria vaga consigo mesmo.

E, enquanto o `BEMVINDO` não chega, `meuId` é 0 e o cliente **não desenha
avatar nenhum** (`rede/avatares.js`): sem saber qual dos jogadores do Map sou
eu, o primeiro boneco desenhado seria um sósia na minha própria posição.

Para abrir **duas janelas de propósito** (testar multiplayer sozinho), use
`?nome=OutroNome` na barra de endereço — o cliente lê isso antes do
`localStorage`.

Coberto por `node tools/teste-nome-unico.mjs` (10 casos) e pelo caso
*"nenhum jogador aparece duas vezes"* de `tools/teste-online.mjs`.

---

# Protocolo binário

Todo pacote começa com **1 byte de tipo**. Little-endian. `DataView`.

`VERSAO_PROTOCOLO = 6` (`src/comum/mundo.js`). Se não bater, o servidor recusa e o cliente mostra a
tela de recusa pedindo recarregar.

Por que ela já subiu quatro vezes: **2** o `BEMVINDO` ganhou o byte de itens; **3**
a aparência passou de 6 para 20 bytes; **4** o rapaz que vira zumbi virou o NPC
**1004**, nasceu o `ZUMBI_TIRO` e o enum de estado de NPC ganhou os valores 5..9;
**5** nasceram o `REINICIAR` e o `MUNDO_REINICIADO` (a tecla F8); **6** nasceu o
LOBBY (`PRONTO`, `COMECAR`, `MEU_NOME`, `SALA_ESTADO`) e a sala passou de 20
para **4** jogadores.

## Cliente → servidor

| # | Nome | Canal | Corpo |
|---|---|---|---|
| 1 | `ENTRAR` | confiável | `u16 versao`, `u8 nomeLen`, `nome utf8`, aparência (**20×u8**, um índice por campo — a ordem está em `PERSONAGEM.md` §1) |
| 2 | `MEU_ESTADO` | não confiável | `f32 x,y,z`, `i16 yaw`(rad×1000), `u8 anim`, `u8 flags` |
| 3 | `MINHA_APARENCIA` | confiável | 20×u8, igual ao ENTRAR |
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
| 14 | `ENTRAR_VEICULO` | confiável | `u16 veicId` — **pedido**: quem diz se entrou é o `VEICULO_DONO` que voltar |
| 15 | `SAIR_VEICULO` | confiável | `u16 veicId` — sem posição: o servidor já tem a última que o dono mandou |
| 16 | `VEICULO_POS` | não confiável | `u16 veicId`, `f32 x,y,z`, `i16 yaw`, `i16 rolagem` — só vale do **dono**; o servidor **reenvia aos outros** (ver abaixo) |
| 17 | `CRIAR_HELI` | confiável | `f32 x,y,z`, `i16 yaw` — **pedido**: o id (4100..4999) é do servidor |
| 18 | `ZUMBI_TIRO` | confiável | `u16 npcId`, `u8 parte` (1 cabeça, 2 corpo) — **pedido**: quem tira a vida é o servidor. **Nunca** vai vida no pacote |
| 19 | `REINICIAR` | confiável | — — **pedido** de voltar o mundo ao início (a tecla F8, apertada duas vezes). Sem corpo: "volta tudo" é uma coisa só |
| 20 | `PRONTO` | confiável | `u8 pronto` (1/0) — apertei (ou desapertei) PRONTO na criação de personagem |
| 21 | `COMECAR` | confiável | — — **pedido do anfitrião** para tirar a sala do lobby. Sem "quem": quem pediu já é conhecido pela conexão |
| 22 | `MEU_NOME` | confiável | `u8 len`, nome utf8 — o nome digitado na criação. Volta para todos como um `ENTROU` |

`anim`: 0 parado, 1 andando, 2 correndo, 3 no ar, 4 sentado.
`flags` bit 0: está sentado; bit 1: anel equipado.

## Servidor → cliente

| # | Nome | Canal | Corpo |
|---|---|---|---|
| 128 | `BEMVINDO` | confiável | `u16 meuId`, `u16 versao`, `u8 tickHz`, aparência salva (20×u8), `u8 itens` (bits; bit 0 = arma de portal), depois a lista completa de NPCs e objetos com id e estado |
| 129 | `RECUSA` | confiável | `u8 motivo` (1 versão, 2 cheio) |
| 130 | `SNAPSHOT` | não confiável | `u32 tick`, `u8 nJog` + jogadores, `u8 nNpc` + NPCs, `u8 nObj` + objetos que se mexem |
| 131 | `ENTROU` | confiável | `u16 id`, nome, aparência |
| 132 | `SAIU` | confiável | `u16 id` |
| 133 | `APARENCIA` | confiável | `u16 id`, 20×u8 |
| 134 | `DIALOGO` | confiável | `u16 npcId`, `u16 jogadorId`, `u8 linhaIdx`, `u8 nOpcoes` |
| 135 | `DIALOGO_FIM` | confiável | `u16 npcId` |
| 136 | `OBJ_DONO` | confiável | `u16 objId`, `u16 donoId` (0 = livre), `f32 x,y,z`, `i16 rotY`, `u8 estado` — a posição é a que o **servidor** decidiu na hora em que o dono mudou |
| 137 | `OBJ_DESTRUIDO` | confiável | `u16 objId`, `f32 x,y,z` |
| 138 | `NEGADO` | confiável | `u8 oque` (1 npc ocupado, 2 objeto ocupado), `u16 id` |
| 139 | `PORTAL_ABERTO` | confiável | `u16 portalId` (3000..3999), `u16 dono`, `f32 x,y,z`, `i16 yaw` |
| 140 | `PORTAL_FECHADO` | confiável | `u16 portalId` — **idempotente**: id que não existe mais não faz nada |
| 141 | `VEICULO_DONO` | confiável | `u16 veicId`, `u16 donoId` (0 = livre), `f32 x,y,z`, `i16 yaw` — a pose é **onde o veículo parou**, e vai junto pelo mesmo motivo do `OBJ_DONO` |
| 142 | `HELI_CRIADO` | confiável | `u16 veicId` (4100..4999), `u16 dono` (**quem montou**, não quem pilota), `f32 x,y,z`, `i16 yaw` |
| 143 | `MUNDO_REINICIADO` | confiável | `u16 quem` (id de quem pediu; 0 = o próprio servidor) — vai para a **sala inteira**, e cada cliente se recarrega |
| 144 | `SALA_ESTADO` | confiável | `u8 fase`, `u16 anfitrião`, `u8 n`, n × (`u16 id`, `u8 pronto`) — a **foto inteira** da sala |

### Jogador dentro do SNAPSHOT
`u16 id`, `f32 x,y,z`, `i16 yaw`, `u8 anim`, `u8 flags`

### NPC dentro do SNAPSHOT
`u16 id`, `f32 x,z`, `i16 yaw`, `u8 estado`, `u16 falandoCom` (0 = ninguém)

`estado`: 0 parado, 1 trabalhando, 2 sentado, 3 cortando, 4 conversando,
**5 são, 6 adoecendo, 7 zumbi, 8 morto, 9 sumido**.

Os cinco últimos são de **um NPC só** (o 1004, o rapaz da porta da mercearia).
Eles entram neste mesmo byte de propósito: assim o zumbi inteiro — estado,
posição e giro — custa **zero byte a mais por quadro**, porque o registro de NPC
já levava tudo isso.

### Objeto dentro do SNAPSHOT
Só entram os que **não estão parados no lugar de origem**:
`u16 id`, `f32 x,y,z`, `i16 rotY`, `u16 dono` (0 = livre), `u8 estado`

`estado`: 0 em repouso, 1 seguro, 2 voando, 3 destruído.

### Veículo — **não entra no SNAPSHOT**
A pose viaja no `VEICULO_POS` que o dono manda a 15 Hz e o **servidor reenvia
aos outros** (nunca de volta ao próprio dono). É o **único pacote que anda nos
dois sentidos com o mesmo número**: são os mesmos 19 bytes, e reemitir a mesma
pose com um número `14x` seria manter dois nomes para um formato só.

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

# Veículos

Regras de rede — **as mesmas dos objetos agarráveis**, com a diferença de que a
pose não passa pelo snapshot:

- Todo veículo tem **dono** (quem dirige). Livre = parado, onde o último
  `VEICULO_DONO` disse.
- **Entrar é um pedido** (`ENTRAR_VEICULO`). O servidor confere se está livre,
  marca o dono e **avisa todos**. Dois pedindo ao mesmo tempo: o servidor diz
  quem entrou; o outro leva `NEGADO` com `oque = 3`.
- Um jogador dirige **no máximo um veículo**: entrar em outro **larga o
  primeiro**, onde ele parou — a mesma regra de "uma mão, um objeto".
- Enquanto dirige, a máquina do dono manda `VEICULO_POS` a 15 Hz e os outros
  **interpolam 100 ms atrás**. De quem **não é o dono**, o servidor **ignora em
  silêncio** — não houve pedido, então não há o que negar.
- **Sair** (`SAIR_VEICULO`) e **cair a conexão** liberam o veículo **na hora** e
  avisam todos. Nada pode ficar preso em quem não está mais aqui.
- O helicóptero é **criado pelo anel** (`CRIAR_HELI`, depois de
  `MUNDO.HELI_MONTAGEM` segundos segurando). **Quem dá o id é o servidor**, em
  4100..4999, e ele nasce **livre**: quem montou entra com `E` pelo mesmo
  `ENTRAR_VEICULO` de todo mundo. As peças chegando, o brilho verde e o clarão
  são **100% locais**.
- **Quem entra atrasado** recebe, logo depois do `BEMVINDO`, um `HELI_CRIADO`
  por helicóptero vivo e um `VEICULO_DONO` por veículo **ocupado** — o mesmo
  papel que o `PORTAL_ABERTO` faz pelos portais. Veículo livre e parado não
  precisa de nada: a pose inicial já está em `MUNDO.VEICULOS` nos dois lados.

`NEGADO.oque`: 1 npc ocupado, 2 objeto ocupado, **3 veículo ocupado**.

---

# O rapaz que vira zumbi (NPC 1004)

Ele **não é um sistema à parte**: é um NPC comum, com id próprio e estável
(`MUNDO.ZUMBI_ID = 1004`, na faixa de NPC), que tem cinco estados a mais.

## Regras de rede

- **O cérebro é do servidor.** O relógio da doença, a virada, a perseguição e a
  morte rodam no `passo()` de `servidor/sala.js`, junto com o tempo do portal.
  Antes disso tudo isso morava no cliente, e o resultado era um zumbi **por
  jogador**: um via o rapaz virar bicho e vir pra cima, e o amigo do lado
  continuava vendo um rapaz sadio parado na porta.
- **O estado viaja no byte que o NPC já tinha** (`EST_NPC` 5..9: são,
  adoecendo, zumbi, morto, sumido) e a **posição no x/z/yaw do mesmo
  registro**, interpolada 100 ms atrás como a de qualquer NPC. Zero byte a mais
  por quadro, nenhum pacote periódico novo.
- **Falar com ele começa a doença.** É o `FALAR` de sempre — o mesmo pedido de
  "apertei E nesta pessoa" — e o servidor decide o que fazer com ele. Este NPC
  **não abre diálogo**: `falas` e `opcoes` são vazias em `MUNDO.NPCS`, senão
  haveria dois balões na tela ao mesmo tempo. Apertar `E` de novo não faz nada
  (ele já não está mais são): **idempotente**, e sem `NEGADO` — não há nada
  ocupado.
- **A doença dura `MUNDO.ZUMBI_DOENCA` (10 s), contados pelo servidor**, pelo
  mesmo motivo do portal: com cronômetro em cada máquina, ele viraria zumbi em
  horas diferentes em cada tela.
- **O tiro é um pedido** (`ZUMBI_TIRO`), e é a única coisa dele que nasce no
  cliente — porque o servidor não tem a mira de ninguém. O pacote leva o id e
  **um byte** dizendo a parte. **Nunca a vida.** Quem subtrai é o servidor
  (1 na cabeça mata, 3 no corpo) e o resultado sai pelo caminho de sempre: o
  estado `morto` no próximo snapshot. Tiro em NPC já morto sai em silêncio;
  dois tiros iguais **contam dois**, que é o certo.
- **`sumido` existe por causa de quem entra atrasado.** Passados
  `MUNDO.ZUMBI_SUMIR` segundos da morte, o servidor troca `morto` por `sumido`.
  Sem esse segundo estado, quem chegasse dez minutos depois receberia `morto` e
  desenharia a queda e o clarão do tiro de novo, como se tivesse acabado de
  acontecer. Com ele, quem chega depois vê só a mancha no chão.
- **Ele não atravessa parede, e entra pela porta.** O servidor anda em linha
  reta e depois **empurra o corpo para fora** das caixas de `src/world/layout.js`
  (as duas lojas e os prédios de cenário), pelo eixo de **menor penetração** —
  assim ele desliza rente à fachada em vez de tremer contra ela. A fachada das
  duas lojas é **partida no vão da porta**, com 20 cm de folga de cada lado,
  então ele entra atrás de quem se escondeu lá dentro.
  Isso **não é uma segunda verdade** sobre a forma da cidade: é o mesmo
  `layout.js` de onde o cliente levanta as paredes e de onde `alturaDoChao()`
  já tirava o piso das lojas. O que não pode existir é geometria **escrita à
  mão** no servidor.
  Só as caixas grandes entram. Móvel de loja, poste e caixote não estão em
  `layout.js` e não são inventados aqui — um zumbi que raspa numa prateleira não
  incomoda ninguém; um que atravessa a fachada da mercearia, sim.
- **Um ponto de passagem, não busca de caminho.** Se um dos dois está dentro de
  uma loja e o outro não, o zumbi anda primeiro até a **porta** daquela loja e
  só então até a pessoa. Sem isso ele deslizava pela fachada até ficar colado
  bem em cima da vítima e parava ali para sempre, com a porta oito metros ao
  lado. São duas caixas e uma porta — não há grafo nem lista aberta.
- O raio do corpo dele é `MUNDO.ZUMBI_RAIO`, o **mesmo** que o cliente usa no
  `collision.resolve` do modo sozinho. Dois valores fariam o zumbi raspar a
  parede num modo e atravessar no outro.
- **O empurrão e a vinheta vermelha são locais nos dois modos.** Cada máquina
  decide quando o zumbi encostou **no seu** jogador e empurra **o seu**
  jogador — "o cliente é dono só do próprio corpo". Como a posição do zumbi já
  é a mesma nas duas telas, os dois levam a paulada na hora certa.
- **Todo o resto é 100% local**: sangue, clarão, onda de choque, câmera lenta,
  tremor, tosse, balão de fala, a pele esverdeando, os olhos afundando, a
  mancha no chão. Pela rede viaja só *em que estado ele está e onde ele está*.

## Modo sozinho

Sem servidor — ou com a conexão caída — o cliente roda a máquina de estados
inteira sozinho, exatamente como antes, respondendo aos próprios pedidos pelo
**mesmo caminho** do evento de rede. A decisão é tomada **a cada quadro**
(`ehLocal()`), não uma vez na abertura: se a conexão cair no meio da
perseguição, a simulação local assume de onde o servidor parou.

---

# Reiniciar o mundo (tecla F8)

Duas batidas em `F8` (a segunda dentro de 4 s) devolvem a sala ao estado do
primeiro minuto: **sem helicóptero montado, sem zumbi, sem objeto quebrado, sem
portal aberto e sem a arma de portal no bolso de ninguém**.

## Por que o servidor, e não o cliente

Ele é o dono do mundo. Se o cliente apagasse o zumbi sozinho, o `SNAPSHOT`
seguinte — que sai 15 vezes por segundo com o estado oficial de cada NPC — o
traria de volta em menos de 100 ms, e o jogador concluiria, com razão, que a
tecla não funciona. Então: **`REINICIAR` é um pedido**, como o `PEGAR` e o
`ABRIR_PORTAL`.

## Por que o cliente RECARREGA a página

Porque o estado espalhado pelo cliente é grande e cheio de cantos: o helicóptero
montado, o zumbi no meio da transformação, o vaso já destruído, a arma na mão, o
portal aberto, o carro estacionado noutro lugar, o slot destravado na barra.
Cada módulo precisaria de um `reiniciar()` próprio, e bastaria **um** esquecido
para a tecla mentir. Recarregar reconstrói tudo pelo mesmo caminho do primeiro
carregamento — o único caminho que já está testado.

Sem servidor (jogando sozinho) não há o que pedir: recarregar **já é** o mundo
inicial, porque a cidade é gerada de forma determinística.

## O que o servidor desfaz

| Coisa | Volta a |
|---|---|
| NPCs | estado e pose de origem, sem diálogo, vida cheia — o rapaz da mercearia deixa de ser zumbi |
| Objetos agarráveis | posição de origem, sem dono, `REPOUSO` — inclusive os **destruídos**, que são o único estado irreversível do jogo |
| Veículos | os três estacionados voltam à vaga e ficam livres; os **helicópteros montados somem** |
| Portais | todos fechados |
| Itens por nome | zerados, então a arma de portal volta a estar largada na cidade |

**O que NÃO volta, de propósito**: a aparência de cada jogador. Reiniciar o
mundo não é motivo para alguém perder o cabelo que escolheu no barbeiro.

## Duas batidas, e não uma

Isto apaga o progresso da **sala inteira**, inclusive o dos outros jogadores.
Uma tecla de função encostada por acidente não pode custar isso a todo mundo. O
`MUNDO_REINICIADO` leva o id de quem pediu justamente para ninguém ver o mundo
voltar ao começo sozinho, sem nome e sem aviso.

Coberto por `node tools/teste-reiniciar.mjs` (14 casos, do pacote ao Map da
sala) e pelos dois casos de `F8` em `tools/smoke.mjs`.

---

# O LOBBY (de 2 a 4 pessoas)

A sala tem **três fases**, e ela inteira está numa fase só — não existe metade da
sala no lobby e a outra metade jogando:

| Fase | O que é |
|---|---|
| `LOBBY` (0) | esperando gente entrar. Só o **anfitrião** vê o botão de começar |
| `CRIANDO` (1) | todos na tela de criação de personagem. O servidor conta os prontos |
| `JOGANDO` (2) | o jogo rodando |

**Anfitrião** é o *primeiro que entrou*, e não "quem criou o servidor" — o
servidor está sempre no ar. Quando ele sai, o mais antigo dos que ficaram herda;
sala vazia volta para o lobby, e aí a próxima pessoa que entrar começa uma
partida nova sem ninguém precisar reiniciar processo nenhum.

## Por que a foto inteira, e não um delta

`SALA_ESTADO` manda a lista completa a cada mudança. São no máximo 4 jogadores:
`5 + 3×4 = 17` bytes, e o pacote é raro (entra alguém, alguém aperta pronto, a
fase vira). Manter dois lados concordando sobre uma *sequência* de "fulano ficou
pronto" custaria mais — e um pacote perdido deixaria a tela de todo mundo
mentindo sobre quem já está pronto.

O **nome** de cada jogador não vem neste pacote: ele já é mantido pelos `ENTROU`
/ `APARENCIA`, e repetir aqui seria uma segunda verdade sobre a mesma coisa.

## Regras que o servidor faz valer

- `COMECAR` só funciona **do anfitrião** e **a partir do LOBBY**. Pedir daqui não
  é poder.
- `PRONTO` é o **estado**, não um incremento: mandar duas vezes o mesmo valor não
  conta duas vezes, e dá para desmarcar — quem apertou sem querer não pode
  segurar a sala de refém por ter mudado de ideia.
- Quem entra com o jogo **já rolando** nasce pronto: ele não está segurando
  ninguém, e esperar por um "pronto" que a tela dele nunca vai pedir travaria a
  sala inteira.
- Trocar de nome leva junto a **aparência e os itens** (os dois são guardados por
  nome): sem isso o jogador perderia a roupa que acabou de escolher no instante
  em que digitasse a primeira letra.

## O cliente não conecta sozinho

Abrir a página **não** entra na sala. Quem conecta é o botão COOP do menu. Quem
vai jogar solo não tem por que aparecer no mundo de ninguém, e a sala tem 4
vagas — ocupar uma só por ter aberto a aba tira a vaga de quem ia jogar.

Coberto por `node tools/teste-lobby.mjs` (28 casos).

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
src/comum/mundo.js          ids estáveis: NPCS e AGARRAVEIS (sem THREE, roda no Node);
                            também os números do zumbi, que os dois lados usam
src/world/layout.js         as caixas da cidade. Dado puro, sem THREE: o cliente
                            levanta as paredes daqui e o servidor lê as MESMAS
                            para o chão e para a colisão do zumbi
src/npc/zumbi.js            o rapaz da porta da mercearia: só o VISUAL. Lê o NPC
                            1004 do snapshot e desenha; sozinho, simula tudo
src/rede/transporte.js      copiado do mago-pvp
src/rede/transporte-ws.js   copiado do mago-pvp
src/rede/cliente-rede.js    conexão, envio 15 Hz, buffer de snapshots, interpolação 100 ms
src/veiculos/veiculos.js    carro, moto, skate e helicóptero: entrar/sair, física, câmera
tools/teste-protocolo-veiculos.mjs  ida e volta das mensagens de veículo + regras da sala
tools/teste-online.mjs      dois navegadores de verdade: sala, diálogo, telecinese
                            e o zumbi igual nas duas telas
src/rede/avatares.js        bonecos dos outros jogadores (usa createCharacter)
src/rede/voz.js             chat de voz por proximidade (PeerJS + WebRTC + PannerNode)
tools/teste-voz.mjs         a máquina de estado da voz, com Peer dublê e microfone falso
src/poder/anel.js           o anel verde: visual, mira, agarrar, arremessar
implantar/minicity.service  systemd
implantar/atualizar.sh      atualizar no servidor com um comando
implantar/subir.ps1         da máquina local: manda o código e reinicia
```


---

# VOZ POR PROXIMIDADE

Quem está a **15 metros** ou menos se ouve. A voz sai de onde a pessoa está: se
ela fala atrás de você, você ouve atrás; se atravessa a rua, a voz vai sumindo.

Ligar é a tecla **V** — a primeira vez pede o microfone, as seguintes alternam
mudo. Sair do coop desliga o microfone junto.

## Três canais, e só um deles é nosso

| | por onde | quem hospeda |
|---|---|---|
| **sinalização** | servidor público do PeerJS (`0.peerjs.com`) | terceiro, de graça |
| **áudio** | WebRTC, direto de um jogador ao outro | ninguém: é P2P |
| **posição** | o WebSocket que já existia (`rede.jogadores`) | o nosso `servidor/` |

O `servidor/` deste repositório **não ganhou uma linha**. Ele já sabe onde todo
mundo está, e é só disso que o áudio posicional precisa.

## O endereço não é trocado — é derivado

O caminho óbvio seria um pacote `MEU_PEER_ID` espalhado pela sala. Isso mexeria
em `protocolo.js` e em `sala.js` para transportar uma informação que **já dá
para calcular**: todo jogador tem um id numérico próprio e estável (a regra que
não se quebra, lá em cima). Então:

```
mcrp-<resumo de location.host>-<id do jogador>
```

Quem já enxerga o outro em `rede.jogadores` já sabe o endereço dele. **Zero
bytes a mais na rede, zero mudança de protocolo.**

O pedaço do host não é decoração: o broker do PeerJS é **público e compartilhado
com o mundo inteiro**. Sem ele, dois servidores diferentes do jogo brigariam
pelo id `mcrp-3` e um roubaria a chamada do outro.

Pela mesma razão, **toda chamada que chega é conferida**: só é atendida se o
endereço de quem liga decodificar para um jogador que o *nosso* servidor diz
estar na sala. Quem não está no snapshot não existe.

## Só o id menor liga

Se os dois lados ligassem ao mesmo tempo (o *glare* clássico do WebRTC), cada um
ficaria com duas chamadas e duas streams da mesma pessoa — todo mundo em dobro,
com eco. `meuId < id` resolve sem negociação nenhuma.

## Duas distâncias, não uma

| | |
|---|---|
| `PERTO` | **15 m** — começa a ouvir |
| `LONGE` | **18 m** — para de ouvir |
| `PACIENCIA` | **2 s** além de `LONGE` antes de desligar de fato |

Com um número só, quem para em cima da linha faz a chamada abrir e fechar sem
parar: uma negociação WebRTC inteira por passo, e a voz picotando. A faixa entre
os dois é zona morta. A paciência cobre quem dobra a esquina e volta — abrir uma
chamada custa segundos de ICE e DTLS, e pagar isso de novo é pior que esperar.

Já **quem some do snapshot cai na hora**, sem paciência: essa pessoa saiu do
jogo, e segurar o grafo de áudio de alguém que não existe não tem defesa.

## Duas armadilhas que fazem o som sumir sem erro nenhum

1. **O `<audio>` mudo.** Uma MediaStream vinda do WebRTC só toca pelo Web Audio
   se também estiver presa a um elemento `<audio>` no documento. Sem isso,
   `createMediaStreamSource` conecta, o grafo fica bonito, o `PannerNode` se
   move — e não sai som. O elemento é mudo (quem toca é o panner) e existe só
   para o Chrome puxar os pacotes. **Parece código morto e não é.**
2. **`getUserMedia` exige contexto seguro.** Abrir o jogo por
   `http://192.168.x.x` para jogar em rede local **não dá microfone**: o
   navegador nem pergunta, some com a API. Vale `localhost` e vale `https`. Em
   LAN, a saída é um túnel (`ngrok`, `cloudflared`) ou um certificado local.

## O que ainda não é

- **Sem servidor TURN.** O PeerJS de graça traz STUN, que resolve a maioria das
  casas, mas dois jogadores atrás de NAT simétrico (4G, alguns corporativos)
  não fecham conexão. TURN custa banda, e por isso ninguém dá de graça.
- **O broker grátis não tem contrato.** `0.peerjs.com` é limitado e cai. Para
  valer, ou se sobe um `peer-server` junto do `servidor.js`, ou a sinalização
  passa pelo WebSocket que já existe — aí sim com pacote novo no protocolo.
- **O `<script>` vem do unpkg.** Um pedido de rede por carregamento. Para a
  build offline da Steam: `npm i peerjs@1.5.2` e `import Peer from 'peerjs'`
  dentro de `voz.js` — mesma API, e o Vite embute no bundle.

Coberto por `node tools/teste-voz.mjs` (27 casos: proximidade, histerese,
paciência, glare, chamada de estranho, saída e limpeza do grafo).
