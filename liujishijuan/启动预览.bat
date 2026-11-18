@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8000
set URL=http://127.0.0.1:%PORT%/index.html

where node >nul 2>nul
if %errorlevel%==0 goto usenode

where py >nul 2>nul
if %errorlevel%==0 goto usepy

where python >nul 2>nul
if %errorlevel%==0 goto usepython

echo.
echo  [ERROR] Node.js / Python not found on this computer.
echo  Please install Node.js (https://nodejs.org) and run this file again.
echo.
pause
exit /b 1

:usenode
node server.js
exit /b

:usepy
start "" /min cmd /c "timeout /t 2 >nul & start %URL%"
py -3 -m http.server %PORT% --bind 127.0.0.1
exit /b

:usepython
start "" /min cmd /c "timeout /t 2 >nul & start %URL%"
python -m http.server %PORT% --bind 127.0.0.1
exit /b
