@echo off
title NUTELLA Sniper v2.0 - Kurulum
color 06
cls

echo.
echo  ===============================================================
echo   NN   NN UU   UU TTTTTT EEEEE LL      LL      AAAA
echo   NNN  NN UU   UU   TT   EE    LL      LL     AA  AA
echo   NNNN NN UU   UU   TT   EEEE  LL      LL    AAAAAAAA
echo   NN NNNN UU   UU   TT   EE    LL      LL   AA      AA
echo   NN  NNN UUUUUUU   TT   EEEEE LLLLLL  LLLLLL AA    AA
echo  ===============================================================
echo   🍫  SNIPER v2.0  ^|  Kurulum
echo  ===============================================================
echo.

:: Node.js kontrolü
node --version >nul 2>&1
if errorlevel 1 (
    echo  [HATA] Node.js bulunamadı!
    echo  Lütfen https://nodejs.org adresinden Node.js indirin.
    echo  Önerilen sürüm: 18 LTS veya üzeri.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% bulundu.
echo.
echo  [*] Bağımlılıklar yükleniyor...
echo.

npm install

if errorlevel 1 (
    echo.
    echo  [HATA] npm install başarısız oldu!
    pause
    exit /b 1
)

echo.
echo  ===============================================================
echo   ✅  Kurulum tamamlandı!
echo   ▶   Başlatmak için: run.bat
echo  ===============================================================
echo.
pause
