#!/bin/bash
# Transcritor local do Vox — iniciar no macOS (e Linux).
# Equivalente ao iniciar_whisper.bat do Windows. Rode toda vez que for usar.

cd "$(dirname "$0")" || exit 1

echo "===================================================="
echo "  Transcritor local do Vox"
echo "===================================================="
echo
echo "Qual modelo voce quer usar?"
echo
echo "   [1] Rapido  (small)     recomendado - leve e bom"
echo "   [2] Medio   (medium)    so vale com maquina forte"
echo "   [3] Preciso (large-v3)  melhor em audio dificil"
echo
read -r -p "Escolha [1/2/3] (Enter = Rapido): " ESCOLHA

case "$ESCOLHA" in
  2) MODEL="medium" ;;
  3) MODEL="large-v3" ;;
  *) MODEL="small" ;;
esac

# Prefere o Python do ambiente virtual criado pelo instalar.command. Se alguem
# instalou na mao, sem venv, cai no python3 do sistema em vez de dar erro.
if [ -x ".venv/bin/python" ]; then
  PY=".venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
else
  echo
  echo "[X] O Python nao foi encontrado. Rode o instalar.command primeiro."
  echo
  read -r -p "Aperte Enter para fechar."
  exit 1
fi

echo
"$PY" servidor.py "$MODEL"

echo
echo "O servidor foi encerrado."
read -r -p "Aperte Enter para fechar."
