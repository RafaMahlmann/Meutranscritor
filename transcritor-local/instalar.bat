@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Transcritor local do Vox - instalacao

echo ====================================================
echo   Transcritor local do Vox - instalacao
echo ====================================================
echo.
echo Isso vai instalar as ferramentas que o transcritor usa.
echo Leva alguns minutos e so precisa ser feito uma vez.
echo.

python --version >nul 2>&1
if errorlevel 1 (
  echo [X] O Python nao foi encontrado.
  echo.
  echo     Instale ele primeiro em: https://www.python.org/downloads/
  echo     IMPORTANTE: na primeira tela do instalador, marque a caixinha
  echo     "Add Python to PATH" antes de continuar.
  echo.
  echo     Depois de instalar, feche esta janela e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('python --version') do echo [OK] %%v encontrado.
echo.
echo Baixando as ferramentas...
echo.

python -m pip install --upgrade pip
python -m pip install faster-whisper fastapi uvicorn python-multipart

if errorlevel 1 (
  echo.
  echo [X] Alguma coisa deu errado na instalacao.
  echo     Confira sua conexao com a internet e tente de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo ====================================================
echo   Pronto! Instalacao concluida.
echo ====================================================
echo.
echo Agora e so abrir o arquivo iniciar_whisper.bat
echo para ligar o transcritor.
echo.
echo Voce nao precisa instalar mais nada. Alguns tutoriais
echo na internet mandam instalar o FFmpeg tambem - nao
echo precisa, ele ja vem junto.
echo.
pause
