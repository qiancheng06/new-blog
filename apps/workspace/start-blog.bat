@echo off
set "ROOT=%~dp0..\.."
set "DASHBOARD=%~dp0index.html"
cd /d "%ROOT%"
echo Starting auto-sync + dev server...

:: Background services (minimized)
start /min "workbench-demo" cmd /c "npm run dev:mock"

:: Wait for dev services to be ready
echo Waiting for dev services to start...
:retry
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/status' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry

:: Open single browser tab
echo.
echo Dev services are ready!
start "" "%DASHBOARD%"
start "" "http://127.0.0.1:5173"
echo.
echo Dashboard: %DASHBOARD%
echo VitePress: http://127.0.0.1:5173
echo Persona API: http://127.0.0.1:3001/api/status
echo Press any key to stop all services.
pause >nul

:: Cleanup
taskkill /f /t /fi "WINDOWTITLE eq workbench-demo" >nul 2>&1
