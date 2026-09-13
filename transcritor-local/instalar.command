#!/bin/bash
# Transcritor local do Vox — instalação no macOS (e Linux).
# Equivalente ao instalar.bat do Windows. Roda uma vez só.
#
# Diferença proposital em relação ao Windows: aqui a instalação acontece dentro
# de um ambiente virtual (.venv) na própria pasta. No macOS o Python do sistema
# (e o do Homebrew) recusa instalar pacotes direto — "externally-managed-
# environment" — e o venv resolve isso sem pedir nada pro usuário. De quebra,
# nada é instalado fora desta pasta: pra desinstalar, é só apagá-la.

cd "$(dirname "$0")" || exit 1

echo "===================================================="
echo "  Transcritor local do Vox - instalacao"
echo "===================================================="
echo
echo "Isso vai instalar as ferramentas que o transcritor usa."
echo "Leva alguns minutos e so precisa ser feito uma vez."
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "[X] O Python nao foi encontrado."
  echo
  echo "    Instale ele primeiro em: https://www.python.org/downloads/"
  echo "    Baixe a versao para macOS, abra o arquivo e va clicando ate o fim."
  echo
  echo "    Depois de instalar, feche esta janela e abra este arquivo de novo."
  echo
  read -r -p "Aperte Enter para fechar."
  exit 1
fi

echo "[OK] $(python3 --version) encontrado."
echo
echo "Preparando o ambiente..."
echo

if [ ! -d ".venv" ]; then
  python3 -m venv .venv || {
    echo
    echo "[X] Nao consegui criar o ambiente virtual."
    echo "    Tente instalar o Python de novo pelo site python.org."
    echo
    read -r -p "Aperte Enter para fechar."
    exit 1
  }
fi

echo "Baixando as ferramentas..."
echo

.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install faster-whisper fastapi uvicorn python-multipart

if [ $? -ne 0 ]; then
  echo
  echo "[X] Alguma coisa deu errado na instalacao."
  echo "    Confira sua conexao com a internet e tente de novo."
  echo
  read -r -p "Aperte Enter para fechar."
  exit 1
fi

# deixa o iniciador clicavel: sem isso o Finder abre como texto em vez de rodar
chmod +x iniciar_whisper.command 2>/dev/null

echo
echo "===================================================="
echo "  Pronto! Instalacao concluida."
echo "===================================================="
echo
echo "Agora e so abrir o arquivo iniciar_whisper.command"
echo "para ligar o transcritor."
echo
echo "Voce nao precisa instalar mais nada. Alguns tutoriais"
echo "na internet mandam instalar o FFmpeg tambem - nao"
echo "precisa, ele ja vem junto."
echo
read -r -p "Aperte Enter para fechar."
