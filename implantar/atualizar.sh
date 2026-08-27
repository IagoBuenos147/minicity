#!/usr/bin/env bash
# =========================================================
# atualizar.sh - o comando unico de atualizar, RODA NA LIGHTSAIL.
#
#   cd ~/minicity
#   ./implantar/atualizar.sh
#
# Normalmente voce nem digita isso: o subir.ps1 da maquina do dono manda
# o codigo por scp e chama este script por ssh.
#
# Ordem:
#   0. confere que o VIZINHO (mago-pvp, porta 8001) esta de pe ANTES
#   1. dependencias
#   2. build do cliente (Vite -> dist/, que o servidor serve)
#   3. systemctl restart minicity
#   4. confere /saude e mostra a versao que ficou no ar
#   5. confere o VIZINHO DE NOVO - se a nossa mexida derrubou ele, grita
#
# Por que conferir o vizinho duas vezes: a instancia e pequena e
# compartilhada. Se o nosso build ou o nosso processo comer a RAM toda, o
# Linux mata o processo mais gordo - que pode ser o outro jogo. Saber
# "estava de pe antes, caiu depois" e a diferenca entre culpa nossa e
# coincidencia.
# =========================================================
set -euo pipefail

PASTA="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PASTA"

PORTA="${PORTA:-8002}"
SERVICO="${SERVICO:-minicity}"
VIZINHO="${VIZINHO:-mago-pvp}"

# is-active sai com codigo != 0 quando esta parado; o "|| true" evita que o
# set -e mate o script justo na hora de diagnosticar.
VIZINHO_ANTES="$(systemctl is-active "$VIZINHO" 2>/dev/null || true)"

echo ""
echo "== 0. o vizinho ============================================"
echo "   $VIZINHO (porta 8001): $VIZINHO_ANTES"
if [ "$VIZINHO_ANTES" != "active" ]; then
  echo "   AVISO: o vizinho JA NAO ESTAVA DE PE antes de eu mexer."
  echo "   Nao foi este deploy. Depois veja: journalctl -u $VIZINHO -n 50"
fi

echo ""
echo "== 1. dependencias ========================================="
# Instalamos TAMBEM as de desenvolvimento porque o vite e devDependency e
# o passo 2 nao existe sem ele. No fim do passo 2 elas saem de novo, para
# nao deixar peso em disco nem na conta de RAM da instancia.
npm install --no-audit --no-fund

echo ""
echo "== 2. build do cliente ====================================="
# O servidor serve a pasta dist/. Sem este passo o navegador recebe a
# versao anterior do jogo, mesmo com o servidor novo no ar.
npm run build
echo "   podando o que era so de build (fica so o de producao):"
npm prune --omit=dev --no-audit --no-fund

echo ""
echo "== 3. reiniciar ============================================"
if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICO}.service"; then
  sudo systemctl restart "$SERVICO"
  sleep 2
  if systemctl is-active --quiet "$SERVICO"; then
    echo "   $SERVICO esta de pe"
  else
    echo "   $SERVICO NAO subiu. O log:"
    journalctl -u "$SERVICO" -n 30 --no-pager
    exit 1
  fi
else
  echo "   o servico $SERVICO nao esta instalado."
  echo "   Instale uma vez so:"
  echo "     sudo cp $PASTA/implantar/minicity.service /etc/systemd/system/"
  echo "     sudo systemctl daemon-reload"
  echo "     sudo systemctl enable --now minicity"
  echo "   Depois rode este script de novo."
  exit 1
fi

echo ""
echo "== 4. o que ficou no ar ===================================="
sleep 1
if command -v curl >/dev/null; then
  # /saude devolve a versao dos arquivos. E esse numero que aparece em
  # ?v=... nos scripts e que impede o navegador de continuar com o
  # arquivo velho. Se o numero mudou, o deploy pegou.
  curl -s --max-time 5 "http://127.0.0.1:${PORTA}/saude" || echo "   /saude nao respondeu"
  echo ""
else
  echo "   (sem curl aqui; abra http://SEU-IP:${PORTA}/saude no navegador)"
fi

echo ""
echo "== 5. o vizinho, de novo ==================================="
VIZINHO_DEPOIS="$(systemctl is-active "$VIZINHO" 2>/dev/null || true)"
echo "   $VIZINHO: $VIZINHO_DEPOIS"
if [ "$VIZINHO_ANTES" = "active" ] && [ "$VIZINHO_DEPOIS" != "active" ]; then
  echo ""
  echo "   #########################################################"
  echo "   #  DERRUBAMOS O VIZINHO. Ele estava de pe antes deste    #"
  echo "   #  deploy e agora esta '$VIZINHO_DEPOIS'.                "
  echo "   #  Suba ele agora:                                       #"
  echo "   #      sudo systemctl start $VIZINHO                     "
  echo "   #  E veja o motivo (provavelmente falta de RAM):         #"
  echo "   #      journalctl -u $VIZINHO -n 50 --no-pager           "
  echo "   #########################################################"
  exit 1
fi

echo ""
echo "Pronto. O jogo esta em:  http://18.230.70.161:${PORTA}"
echo "Se alguem disser que esta estranho, peca o numero de /saude e compare."
echo ""
