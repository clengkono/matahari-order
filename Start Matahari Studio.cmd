@echo off
setlocal
cd /d "%~dp0"
title Matahari Studio
node scripts\startMatahariStudio.js
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo Matahari Studio did not start.
  pause
)
endlocal
exit /b %EXITCODE%
