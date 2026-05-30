@echo off
cd /d "%~dp0"
echo Starting auto-sync + dev server...

:: Background services (minimized)
start /min "blog-watch" cmd /c "npm run watch"
start /min "blog-dev"   cmd /c "npm run dev"

:: Wait for dev server to be ready
echo Waiting for dev server to start...
:retry
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry

:: Open single browser tab
echo.
echo Dev server is ready!
start http://localhost:5173
echo.
echo All pages at http://localhost:5173
echo Press any key to stop all services.
pause >nul

:: Cleanup
taskkill /f /fi "WINDOWTITLE eq blog-dev"   >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq blog-watch" >nul 2>&1
