# Subir sem a chave .pem — pelo terminal do painel da Lightsail

A chave `.pem` não foi encontrada nesta máquina (procurei em `Downloads`, em
`~/.ssh` e no perfil inteiro). O mago-pvp foi implantado pelo **botão SSH do
painel da Lightsail**, que abre um terminal no navegador e não usa chave local.
Este arquivo é esse mesmo caminho, para o Mini City.

> **A porta é a 8002.** Conferi no servidor em 27/08/2026: o **mago-pvp está na
> 8001** (`http://18.230.70.161:8001/saude` responde como mago-pvp, protocolo
> v9, no ar há ~12 h). A anotação de que ele estaria na 8002 estava trocada.
> Usar a 8001 derrubaria o outro jogo.

---

## 1. Abrir a porta 8002 no painel (uma vez só)

Painel da Lightsail → sua instância → aba **Networking** → **IPv4 Firewall** →
*Add rule*:

- Application: **Custom**
- Protocol: **TCP**
- Port or range: **8002**

Salve. Sem isso o jogo abre no servidor mas não abre no seu navegador.

## 2. Abrir o terminal

Painel da Lightsail → sua instância → aba **Connect** → botão laranja
**Connect using SSH**. Abre um terminal do Ubuntu no navegador.

## 3. Instalar o Node (só se ainda não tiver)

```bash
node -v || (curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs)
```

## 4. Trazer o código

O jeito mais simples é por git. Se o projeto ainda não está num repositório,
crie um (pode ser privado) e depois:

```bash
cd ~ && git clone SEU_REPOSITORIO minicity && cd minicity
```

Se preferir sem git, dá para colar um tar.gz em base64, mas o repositório é
muito mais prático para as próximas atualizações.

## 5. Instalar, construir e subir

```bash
cd ~/minicity && npm install --omit=dev --no-audit --no-fund && npm run build
```

```bash
sudo cp implantar/minicity.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now minicity
```

## 6. Conferir que subiu — e que o vizinho continua de pé

```bash
systemctl is-active minicity && systemctl is-active mago-pvp && curl -s http://127.0.0.1:8002/saude
```

Tem que sair `active`, `active` e um JSON com `"ok":true`. Se o segundo
`active` não aparecer, o mago-pvp caiu e é preciso investigar antes de seguir.

## 7. Testar de fora

Abra no seu navegador:

```
http://18.230.70.161:8002
```

E confira a saúde:

```
http://18.230.70.161:8002/saude
```

---

## Atualizar depois (o comando único)

```bash
cd ~/minicity && ./implantar/atualizar.sh
```

Ele faz: `git pull`, `npm install`, `npm run build`, reinicia o serviço, e
confere **antes e depois** que o mago-pvp continua de pé — se a atualização
derrubar o vizinho, o script avisa em letras garrafais.

## Ver o log

```bash
journalctl -u minicity -f
```

## Se quiser passar a usar a chave (deploy da sua máquina, sem abrir o painel)

Baixe em **Lightsail → sua instância → Connect → Download default key** e rode,
no PowerShell da sua máquina:

```powershell
.\implantar\subir.ps1 -Chave C:\caminho\da\chave.pem
```
