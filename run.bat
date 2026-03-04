@echo off
title NUTELLA Sniper v2.0
color 06
cls

:: node_modules kontrolü
if not exist "node_modules\" (
    echo  [UYARI] node_modules bulunamadı. Önce install.bat çalıştırın!
    pause
    exit /b 1
)

node sniper.js

echo.
echo  ================================================
echo   Sniper durdu. Yeniden başlatmak için run.bat.
echo  ================================================
pause
