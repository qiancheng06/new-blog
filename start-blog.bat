@echo off
cd /d "%~dp0"
echo Starting dev server + auto-sync...

:: Start background services
start "blog-sync" cmd /c "npm run watch"
start "blog-dev" cmd /c "npm run dev"

:: Wait for dev server to be ready
echo Waiting for dev server to start...
:retry
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry

:: Open browser
echo.
echo Dev server is ready!
start http://localhost:5173
start "" "index.html"
echo.
echo Press any key to stop all services and close this window.
pause >nul

:: Cleanup background processes
taskkill /f /fi "WINDOWTITLE eq blog-dev" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq blog-sync" >nul 2>&1
