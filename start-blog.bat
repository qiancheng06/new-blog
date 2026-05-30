@echo off
cd /d "%~dp0"
echo Starting blog dev server...
start "" "index.html"
start http://localhost:5173
npm run dev
pause
