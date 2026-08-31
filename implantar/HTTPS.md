# HTTPS e WSS no Mini City RP

Domínio: **minicity-rp.duckdns.org** · certificado: **Let's Encrypt / certbot**

Sem HTTPS o chat de voz **não existe**: `getUserMedia` só funciona em contexto
seguro, e em `http://` o navegador nem chega a perguntar — ele some com a API.
Essa é a razão de o certificado ter virado assunto.

---

## O que muda no código: quase nada

O WebSocket **não precisa de porta nem de servidor próprio**. A biblioteca `ws`
se pendura no servidor que receber, e um `https.Server` serve tanto quanto um
`http.Server` — quem faz o `ws://` virar `wss://` é o TLS que já está embaixo.

```
        http.createServer  ──┐
                             ├──►  o mesmo WebSocketServer, as mesmas rotas
       https.createServer  ──┘
```

E **o cliente não muda uma linha**: `montarUrl`, em
[`src/rede/cliente-rede.js`](../src/rede/cliente-rede.js), já escolhe sozinho —
página `https` → `wss://`, página `http` → `ws://`.

---

## Ligar

Tudo por ambiente, como o resto do projeto. Nenhum caminho escrito no código.

| variável | o quê |
|---|---|
| `SSL_DOMINIO` | **o jeito normal.** Monta os dois caminhos do certbot sozinho |
| `SSL_CERT` / `SSL_KEY` | caminhos na mão (teste, outra CA) |
| `PORTA` | padrão **443** quando há SSL, 8002 sem |
| `PORTA_HTTP` | sobe o redirecionador da porta 80. Vazio = não sobe |
| `ACME_WEBROOT` | onde o certbot escreve o desafio da renovação |

`SSL_DOMINIO=minicity-rp.duckdns.org` vira:

```
/etc/letsencrypt/live/minicity-rp.duckdns.org/fullchain.pem
/etc/letsencrypt/live/minicity-rp.duckdns.org/privkey.pem
```

**Sempre pelo `live/`**, que é um *link* para o certificado atual dentro de
`archive/`. Apontar direto para `archive/fullchain3.pem` congelaria o servidor
na terceira emissão, e toda renovação seguinte passaria despercebida.

---

## Na Lightsail, uma vez só

### 1. Abrir as portas

No painel da Lightsail (Networking → IPv4 Firewall), liberar **80** e **443**.
A porta 80 não é opcional: é por ela que o Let's Encrypt confere que o domínio é
seu, na emissão **e em toda renovação**.

### 2. Emitir o certificado

O redirecionador da porta 80 ainda não está no ar, então dá para usar o modo
standalone desta vez:

```bash
sudo certbot certonly --standalone -d minicity-rp.duckdns.org
```

### 3. Deixar o `ubuntu` ler a chave

`privkey.pem` nasce `root:root 0600`, e o serviço **não** roda como root.

```bash
sudo groupadd -f ssl-cert
sudo chgrp -R ssl-cert /etc/letsencrypt/live /etc/letsencrypt/archive
sudo chmod -R g+rX     /etc/letsencrypt/live /etc/letsencrypt/archive
```

O `minicity.service` já traz `SupplementaryGroups=ssl-cert`, que resolve isso
dentro do próprio serviço — sem `usermod`, sem precisar deslogar e logar de novo
para o grupo valer.

### 4. A pasta do desafio

```bash
sudo mkdir -p /var/www/letsencrypt/.well-known/acme-challenge
sudo chown -R ubuntu:ubuntu /var/www/letsencrypt
```

### 5. Instalar o serviço

```bash
sudo cp /home/ubuntu/minicity/implantar/minicity.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart minicity
journalctl -u minicity -n 30
```

### 6. Renovação pelo webroot, e não pelo standalone

Depois do passo 5 a porta 80 está ocupada pelo nosso redirecionador, então o
`--standalone` **não funciona mais** — ele quer a porta livre. A renovação passa
a ser por webroot:

```bash
sudo certbot certonly --webroot -w /var/www/letsencrypt -d minicity-rp.duckdns.org --force-renewal
```

Rodar isso uma vez grava o método no `renewal/*.conf`, e o timer do certbot passa
a renovar sozinho do jeito certo. **Confira antes de precisar:**

```bash
sudo certbot renew --dry-run
```

Se esse comando falhar, a renovação real vai falhar igual — e o sintoma só
apareceria 90 dias depois, como "sua conexão não é particular" na tela de todo
mundo.

---

## A renovação não derruba ninguém

O certificado é lido **uma vez**, no boot. Sem alguém avisar, o processo
continuaria apresentando o papel velho até um restart manual.

`vigiarCertificado` (em [`servidor/rede-ws.js`](../servidor/rede-ws.js)) relê os
dois arquivos de hora em hora, compara o hash, e chama `setSecureContext()`
quando muda. Conexões novas passam a receber o certificado novo; **quem está
jogando não sente nada**, porque a sessão TLS dele já está estabelecida.

Por que comparar o conteúdo e não usar `fs.watch`: os caminhos de `live/` são
links simbólicos, e a renovação troca **o link**, não o arquivo. Um `fs.watch`
resolve o link na hora de vigiar e passa a vigiar o arquivo antigo — continua
vendo o de sempre, calado, exatamente até o certificado vencer.

Para recarregar na hora em vez de esperar até uma hora:

```bash
sudo certbot renew --deploy-hook "systemctl restart minicity"
```

Não é necessário: a renovação acontece 30 dias antes do vencimento, e uma hora
de folga dentro dessa margem não é nada.

---

## Duas coisas que travam, e o que dizem

### `EACCES` na porta 443

Porta abaixo de 1024 pede privilégio. A saída óbvia — `User=root` — trocaria um
problema pequeno (uma porta) por um grande (o jogo inteiro como root, servindo
arquivo e aceitando WebSocket do mundo). O serviço já traz:

```
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
```

que dá **só** a permissão de abrir a porta baixa.

### `EACCES` no `privkey.pem`

É o passo 3 faltando. O próprio erro no `journalctl` imprime os quatro comandos.

### E o que NÃO acontece

**Não existe "caiu para HTTP porque o certificado falhou".** Esse remendo é o
pior desfecho possível: o jogo voltaria ao ar, verde no `systemctl`, servindo em
`http` — e o microfone morreria em silêncio para todo mundo, com um sintoma que
não tem nada a ver com a causa. Certificado ilegível **não sobe**, e diz por quê.

---

## Conferir

```bash
node tools/teste-https.mjs
```

18 casos, sem certbot e sem navegador: sobe o servidor de verdade com um
certificado autoassinado gerado na hora e conversa com ele por `https` e por
`wss`. Cobre a renovação (troca os arquivos com o servidor no ar e confere que o
certificado apresentado mudou), o redirecionamento da porta 80, o
acme-challenge saindo em HTTP puro, e o certificado quebrado **não** virando
HTTP.

No ar:

```bash
curl -sS https://minicity-rp.duckdns.org/saude
curl -sI http://minicity-rp.duckdns.org/ | head -3
```

O primeiro devolve o JSON de saúde; o segundo, um `301` para `https://`.
