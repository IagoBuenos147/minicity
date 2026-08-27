> **ATENCAO — a porta mudou depois de conferir no servidor.**
> O mago-pvp esta rodando na **8001** (conferido em 27/08/2026:
> `http://18.230.70.161:8001/saude` responde como mago-pvp, protocolo v9).
> A anotacao de que ele estaria na 8002 estava trocada. O Mini City ficou na
> **8002** justamente para nao derrubar o outro jogo.

# Colocar o Mini City RP no ar (Lightsail)

A maquina: **18.230.70.161**, usuario **ubuntu**, Ubuntu na Lightsail.

**Essa maquina ja roda outro jogo**: o *mago-pvp*, na porta **8002**.
Nada aqui encosta nele. Nos somos:

| | |
|---|---|
| servico | `minicity` |
| porta | **8002** |
| pasta no servidor | `/home/ubuntu/minicity` |
| endereco do jogo | http://18.230.70.161:8002 |
| conferir saude | http://18.230.70.161:8002/saude |

---

## 0. Onde esta a chave `.pem`

Sem ela nao da para entrar na maquina. Ela **nao esta neste computador**,
por isso o `subir.ps1` exige que voce diga o caminho.

Para descobrir/obter:

1. Se voce ja baixou algum dia, procure no Windows:
   ```powershell
   Get-ChildItem -Path C:\Users\Pichau -Recurse -Filter *.pem -ErrorAction SilentlyContinue |
     Select-Object FullName, Length, LastWriteTime
   ```
   Se voce ja subiu o mago-pvp desta maquina, e a **mesma chave**.
2. Se nao achar: entre no painel da Lightsail →
   **Account** (canto superior direito) → aba **SSH keys** →
   na linha da regiao *sa-east-1* clique em **Download**.
3. Guarde o arquivo **fora** da pasta do projeto (ex.: `C:\Users\Pichau\chaves\`).
   Dentro do projeto ele iria junto no deploy.
4. O `ssh` do Windows recusa chave que qualquer um consiga ler. Se ele
   reclamar de "permissions are too open", rode uma vez:
   ```powershell
   icacls "C:\Users\Pichau\chaves\minha-chave.pem" /inheritance:r /grant:r "$env:USERNAME:(R)"
   ```

---

## 1. Abrir a porta 8002 na Lightsail (uma vez so)

Enquanto essa porta estiver fechada, o jogo funciona **dentro** da maquina e
ninguem de fora consegue entrar. O firewall do painel manda mais que qualquer
coisa configurada no Ubuntu.

1. Entre em https://lightsail.aws.amazon.com
2. Clique na **instancia** que roda os jogos.
3. Aba **Networking**.
4. Em **IPv4 Firewall**, clique em **+ Add rule**.
5. Preencha:
   - Application: **Custom**
   - Protocol: **TCP**
   - Port or range: **8002**
6. **Create** / **Save**.
7. Confira que a regra do **8002** continua na lista — e o outro jogo.
   Se ela sumir, o mago-pvp sai do ar sem ninguem tocar no codigo dele.

---

## 2. Instalar o servico (uma vez so)

Primeiro mande o codigo (passo 3 abaixo). Na primeira vez o
`atualizar.sh` vai parar e dizer que o servico nao existe — e o esperado.
Entao entre na maquina e instale:

```bash
ssh -i "C:\Users\Pichau\chaves\minha-chave.pem" ubuntu@18.230.70.161

sudo cp /home/ubuntu/minicity/implantar/minicity.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now minicity
```

`enable` = volta sozinho quando a maquina reiniciar.
`--now` = comeca agora, sem esperar reinicio.

Confira:

```bash
systemctl status minicity
curl -s http://127.0.0.1:8002/saude
```

Depois disso rode o passo 3 de novo e pronto.

---

## 3. O comando unico de atualizar

No **seu** computador, no PowerShell:

```powershell
cd C:\Users\Pichau\Desktop\RP
powershell -ExecutionPolicy Bypass -File implantar\subir.ps1 -Chave "C:\Users\Pichau\chaves\minha-chave.pem"
```

Isso empacota o projeto (sem `node_modules`, `dist`, `shots`, `.git`),
manda por `scp` e roda o `implantar/atualizar.sh` na Lightsail, que:

0. confere se o **mago-pvp** esta de pe **antes**;
1. instala as dependencias;
2. roda o `npm run build` (o cliente e Vite; o servidor serve a pasta `dist/`);
3. reinicia o `minicity`;
4. mostra o `/saude` com a versao que ficou no ar;
5. confere o **mago-pvp de novo** — e **grita** se a nossa mexida derrubou ele.

Se ja estiver logado na maquina, da para rodar direto la:

```bash
cd ~/minicity && ./implantar/atualizar.sh
```

---

## 4. Ver o log

```bash
journalctl -u minicity -f          # ao vivo, e fica rodando (Ctrl+C para sair)
journalctl -u minicity -n 50 --no-pager   # as ultimas 50 linhas
systemctl status minicity          # esta de pe? desde quando? quantos restarts?
```

Do Windows, sem entrar na maquina:

```powershell
ssh -i "C:\Users\Pichau\chaves\minha-chave.pem" ubuntu@18.230.70.161 'journalctl -u minicity -n 50 --no-pager'
```

---

## 5. Conferir que o mago-pvp continua de pe

Faca isso sempre depois de um deploy. A instancia e pequena e os dois jogos
dividem a mesma RAM.

```bash
systemctl is-active mago-pvp        # tem que responder: active
curl -s http://127.0.0.1:8002/saude # o /saude do vizinho
```

Se ele caiu:

```bash
sudo systemctl start mago-pvp
journalctl -u mago-pvp -n 50 --no-pager
```

Se no log aparecer `Killed` ou `out of memory`, foi falta de RAM: os dois
jogos juntos nao couberam. O `minicity.service` ja tem `MemoryMax=300M` de
proposito (o mago-pvp usa 380M) para que, faltando memoria, quem morra e
reinicie seja **o nosso**, e nao o vizinho ou o SSH.

---

## Quando algo da errado

| Sintoma | O que olhar |
|---|---|
| `subir.ps1` para em "Nao achei a chave" | secao 0 |
| Abre no navegador do servidor mas nao do celular | porta 8002 fechada no painel, secao 1 |
| "o servico minicity nao esta instalado" | secao 2 |
| Servico reinicia sem parar | `journalctl -u minicity -n 80 --no-pager` |
| Jogo com cara velha depois do deploy | compare o numero do `/saude` antes e depois; se nao mudou, o build nao rodou |
| `Permission denied (publickey)` | chave errada, ou usuario diferente de `ubuntu` |
