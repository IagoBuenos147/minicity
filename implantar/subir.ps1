# =========================================================
# subir.ps1 - RODA NA MAQUINA DO DONO (Windows / PowerShell).
#
# Um comando so:
#   1. empacota o projeto (sem node_modules, sem dist, sem shots, sem .git)
#   2. manda por scp para a Lightsail
#   3. desempacota la e chama implantar/atualizar.sh por ssh
#
# Uso:
#   cd C:\Users\Pichau\Desktop\RP
#   powershell -ExecutionPolicy Bypass -File implantar\subir.ps1 -Chave C:\caminho\minha-chave.pem
#
# Por que empacotar em vez de mandar arquivo por arquivo: um tar.gz e um
# scp so. Centenas de scp separados em rede domestica levam minutos e
# falham no meio, deixando a pasta do servidor pela metade.
#
# Por que NAO mandamos node_modules e dist: eles se refazem la (o
# atualizar.sh roda npm install e npm run build). Mandar os dois e mandar
# centenas de MB que ja existem do outro lado.
# =========================================================

param(
  # IP fixo da instancia Lightsail.
  [string]$Ip = '18.230.70.161',

  # Usuario padrao da imagem Ubuntu da Lightsail.
  [string]$Usuario = 'ubuntu',

  # A chave .pem NAO existe nesta maquina, por isso e obrigatoria e nao tem
  # valor padrao: um caminho chutado daria um erro de ssh confuso em vez de
  # dizer o que falta. Veja o LEIA-ME.md, secao "Onde esta a chave .pem".
  [Parameter(Mandatory = $true,
             HelpMessage = 'Caminho do arquivo .pem da Lightsail. Baixe em Lightsail > Account > SSH keys > Download. Ex: C:\Users\Pichau\Desktop\LightsailDefaultKey.pem')]
  [string]$Chave,

  # Pasta do projeto no servidor. Combina com o WorkingDirectory do
  # minicity.service - se mudar aqui, mude la tambem.
  [string]$PastaRemota = '/home/ubuntu/minicity'
)

$ErrorActionPreference = 'Stop'

# Raiz do projeto = pasta acima desta (implantar\..), nao a pasta em que o
# usuario por acaso estava quando chamou o script.
$Raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

Write-Host ""
Write-Host "== 0. conferindo o basico =================================="

if (-not (Test-Path $Chave)) {
  Write-Host ""
  Write-Host "  Nao achei a chave em: $Chave"
  Write-Host "  Ela e o arquivo .pem que a Lightsail deixa voce baixar UMA vez."
  Write-Host "  Baixe em: Lightsail > Account > SSH keys > Download"
  Write-Host "  Guarde fora da pasta do projeto (senao ela vai junto no deploy)."
  exit 1
}

# O ssh do Windows recusa chave que qualquer usuario da maquina possa ler.
# Aqui so avisamos; corrigir permissao e mexer em seguranca da maquina do
# dono, entao a decisao fica com ele (o comando esta no LEIA-ME.md).
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  Write-Host "  Nao achei o comando 'ssh'. Instale o OpenSSH Client:"
  Write-Host "  Configuracoes > Aplicativos > Recursos opcionais > Cliente OpenSSH"
  exit 1
}
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
  Write-Host "  Nao achei o comando 'tar' (vem no Windows 10/11)."
  exit 1
}

Write-Host "  destino: $Usuario@$Ip : $PastaRemota"
Write-Host "  chave:   $Chave"

Write-Host ""
Write-Host "== 1. empacotando =========================================="

$Pacote = Join-Path $env:TEMP 'minicity-envio.tgz'
if (Test-Path $Pacote) { Remove-Item $Pacote -Force }

# --exclude vem ANTES do -C para o bsdtar do Windows aplicar aos caminhos
# relativos que ele vai gerar. package-lock.json VAI junto de proposito:
# e ele que garante que a Lightsail instale as mesmas versoes daqui.
& tar --exclude=node_modules --exclude=dist --exclude=shots --exclude=.git `
      --exclude=.vite --exclude='*.pem' `
      -czf $Pacote -C $Raiz .
if ($LASTEXITCODE -ne 0) { Write-Host "  tar falhou."; exit 1 }

$Mb = [math]::Round((Get-Item $Pacote).Length / 1MB, 2)
Write-Host "  $Pacote  ($Mb MB)"

Write-Host ""
Write-Host "== 2. enviando ============================================="

# Manda para o /tmp e nao direto na pasta do jogo: se a rede cair no meio,
# a pasta que esta no ar continua inteira e o servico segue rodando com a
# versao antiga.
& scp -i $Chave -o StrictHostKeyChecking=accept-new $Pacote "$Usuario@${Ip}:/tmp/minicity-envio.tgz"
if ($LASTEXITCODE -ne 0) { Write-Host "  scp falhou. Veja o LEIA-ME.md."; exit 1 }
Write-Host "  enviado."

Write-Host ""
Write-Host "== 3. desempacotando e atualizando la ======================"

# Um bloco so de shell, para nao abrir varias sessoes ssh.
# O sed tira o \r que o Windows poe no fim das linhas: bash engasga com
# CRLF ("bad interpreter") mesmo em script que parece certo.
$Remoto = @"
set -euo pipefail
mkdir -p '$PastaRemota'
tar -xzf /tmp/minicity-envio.tgz -C '$PastaRemota'
rm -f /tmp/minicity-envio.tgz
sed -i 's/\r$//' '$PastaRemota/implantar/atualizar.sh'
chmod +x '$PastaRemota/implantar/atualizar.sh'
cd '$PastaRemota'
./implantar/atualizar.sh
"@

# O script vai pela ENTRADA do ssh ("bash -s") em vez de virar um argumento
# gigante de linha de comando: assim nada precisa ser escapado duas vezes.
# PowerShell nao tem "<<<", entao mandamos pelo cano mesmo.
$Remoto | & ssh -i $Chave -o StrictHostKeyChecking=accept-new "$Usuario@$Ip" 'bash -s'
$codigo = $LASTEXITCODE

Remove-Item $Pacote -Force -ErrorAction SilentlyContinue

Write-Host ""
if ($codigo -eq 0) {
  Write-Host "Tudo certo. O jogo esta em: http://${Ip}:8002"
} else {
  Write-Host "O atualizar.sh terminou com erro (codigo $codigo)."
  Write-Host "Leia a saida acima: ela diz em qual dos 5 passos parou."
  Write-Host "Se ele avisou que o mago-pvp caiu, suba o vizinho AGORA:"
  Write-Host "  ssh -i `"$Chave`" $Usuario@$Ip 'sudo systemctl start mago-pvp'"
}
exit $codigo
