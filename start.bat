@echo off
title Maiku AI
chcp 65001 >nul

echo.
echo  Maiku AI -- Interview Copilot
echo  --------------------------------
echo.

REM ── Kill any stale dev processes ──────────────────────────────
echo [1/3] Cleaning up stale processes...

REM Kill anything holding port 5173 (Vite)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Kill any lingering electron / node processes from previous session
taskkill /F /IM "electron.exe" >nul 2>&1
taskkill /F /IM "maiku_backend.exe" >nul 2>&1

REM Short pause so OS releases the ports
timeout /t 2 /nobreak >nul

REM ── Verify .env ───────────────────────────────────────────────
echo [2/3] Checking configuration...

if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [!] .env created from .env.example
        echo [!] Open .env and set your GROQ_API_KEY, then restart.
        pause
        exit /b 1
    ) else (
        echo [!] Neither .env nor .env.example found.
        echo [!] Create .env with: GROQ_API_KEY=your_key_here
        pause
        exit /b 1
    )
)

REM Check that GROQ_API_KEY is set in .env
findstr /i "GROQ_API_KEY=gsk_" .env >nul 2>&1
if errorlevel 1 (
    findstr /i "GROQ_API_KEY=." .env >nul 2>&1
    if errorlevel 1 (
        echo [!] GROQ_API_KEY not set in .env
        echo [!] Edit .env and add: GROQ_API_KEY=your_key_here
        echo [!] Get a free key at https://console.groq.com
        pause
        exit /b 1
    )
)

echo     GROQ_API_KEY found.

REM ── Launch ────────────────────────────────────────────────────
echo [3/3] Starting Maiku AI...
echo.
echo  Ctrl+Shift+M  -- toggle overlay visibility
echo  X button      -- hide overlay
echo  Layout button -- cycle Normal / Compact / Answer-only
echo.

npm run dev

pause
