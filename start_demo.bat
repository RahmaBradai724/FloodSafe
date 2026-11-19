@echo off
rem FloodSafe demo: starts the API (port 8000) and the web app (port 5173), then opens the browser.
rem Double-click this file. Close the two black windows to stop everything.
cd /d %~dp0
start "FloodSafe API" cmd /k "cd backend && .venv\Scripts\python -m uvicorn app.main_v2:app --host 127.0.0.1 --port 8000"
start "FloodSafe web" cmd /k "cd frontend && npx vite --port 5173"
timeout /t 12 /nobreak >nul
start "" http://localhost:5173/login
