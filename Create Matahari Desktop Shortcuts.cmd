@echo off
setlocal
cd /d "%~dp0"
title Create Matahari Desktop Shortcuts
node scripts\createMatahariDesktopShortcuts.js
echo.
pause
endlocal
