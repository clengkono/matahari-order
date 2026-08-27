@echo off
setlocal
cd /d "%~dp0"
title Publish Matahari Changes
node scripts\publishMatahari.js
echo.
pause
endlocal
