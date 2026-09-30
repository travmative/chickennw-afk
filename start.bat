@echo off
title FindLoader - Craftrise Bot
:loop
node --expose-gc src/index.js
echo.
echo Bot durduruldu veya baglanti kesildi. 5 saniye icinde yeniden baslatiliyor...
timeout /t 5
goto loop
