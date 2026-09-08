@echo off
title Cantina Escolar - Render Keep-Alive (5 em 5 segundos)
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================================
echo   CANTINA ESCOLAR - MANTENDO SERVIDOR RENDER ATIVO
echo ========================================================
echo.
echo Este script fica enviando uma chamada leve a cada 5 segundos
echo para a API no Render nao entrar em modo de suspensao (sleep).
echo.
echo Pressione Ctrl+C se desejar parar.
echo.

node scripts/keep-render-awake.mjs

pause
