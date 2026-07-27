@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Transcritor local do Vox

echo ====================================================
echo   Transcritor local do Vox
echo ====================================================
echo.
echo Qual modelo voce quer usar?
echo.
echo   [1] Rapido  (small)     recomendado - leve e bom
echo   [2] Medio   (medium)    so vale com maquina forte
echo   [3] Preciso (large-v3)  melhor em audio dificil
echo.
set "ESCOLHA="
set /p ESCOLHA="Escolha [1/2/3] (Enter = Rapido): "

if "%ESCOLHA%"=="2" (set MODEL=medium) else if "%ESCOLHA%"=="3" (set MODEL=large-v3) else (set MODEL=small)

python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo [X] O Python nao foi encontrado. Rode o instalar.bat primeiro.
  echo.
  pause
  exit /b 1
)

echo.
python servidor.py %MODEL%

echo.
echo O servidor foi encerrado.
pause
