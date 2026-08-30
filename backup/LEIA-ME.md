# Backup — o que saiu do jogo mas pode voltar

Estes arquivos **não são carregados pelo jogo**. Eles estão aqui inteiros,
funcionando, do jeito que estavam no dia em que saíram — porque o dono do
projeto disse, com todas as letras, que pode querer usá-los de novo.

| Pasta | O que é |
|---|---|
| `poder/anel.js` | O anel verde (telecinese): pegar, levitar, arremessar e a montagem do helicóptero |
| `poder/portalgun.js` | A arma de portal: o item largado na cidade, a mira e o disparo |
| `poder/portal-arma.js` | O modelo 3D da arma de portal |
| `poder/portal-efeito.js` | O efeito visual do portal (o anel verde girando) |
| `poder/efeitos.js` | Os efeitos compartilhados do anel e do portal |
| `veiculos/helicoptero.js` | O helicóptero — ele só existia porque o anel o montava |
| `world/agarraveis.js` | Os objetos que o anel levitava (vasos, caixotes), com id estável |
| `ui/hotbar-antiga.js` | A barra separada de "o que está na mão" (2 slots, teclas 1 e 2, ícones desenhados em canvas). Saiu quando as duas barras viraram uma só: as 9 vagas da mochila, centradas no rodapé, nas teclas 1 a 9. Os **ícones em canvas** são o que vale guardar aqui — revólver, mão, anel e arma de portal desenhados à mão, 30 linhas cada |

O **zumbi** (`src/npc/zumbi.js`) não está aqui: o pedido foi apagar. Ele
continua no histórico do git, no commit anterior a esta remoção, se um dia
alguém quiser olhar.

## Como trazer de volta

1. `git mv backup/poder src/poder` (e o mesmo para os outros).
2. Em `src/main.js`, refazer os quatro pontos que foram tirados juntos:
   - o `import` do módulo;
   - a criação (`criarAnel({...})` / `criarPortalGun({...})`), que precisa de
     `scene, camera, player, character, collision, rede, hud, groundY,
     interaction, poolLuz`;
   - o `scene.add` do grupo no mundo e o `interaction.add` do ponto de pegar;
   - o `atualizar(dt)` no laço e a linha correspondente em `hotbar.aoTrocar`.
3. Em `src/ui/hotbar.js`, devolver os slots 2 (anel) e 3 (arma de portal) e as
   teclas que os selecionam em `main.js`.
4. No servidor, os pacotes que eles usam (`PEGAR`, `SOLTAR`, `ARREMESSAR`,
   `OBJ_POS`, `DESTRUIU`, `ABRIR_PORTAL`, `PEGAR_ITEM`, `CRIAR_HELI` e os
   `OBJ_*`/`PORTAL_*`/`HELI_CRIADO` de volta) **continuam existindo em
   `src/comum/protocolo.js` e em `servidor/sala.js`**, intactos. Nada foi
   arrancado de lá de propósito: mexer no formato binário para remover uma
   feature que pode voltar é trocar um risco pequeno (código dormindo) por um
   grande (dois lados do socket discordando).

O que **foi** mexido no servidor: o rapaz que virava zumbi saiu da lista de
NPCs e o relógio da doença saiu do `passo()`. Isso sim foi apagado.
