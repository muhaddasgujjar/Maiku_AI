

# Maiku AI - Full Windows Build Script
# Run from project root: .\build.ps1
# Output: dist-electron\Maiku AI Setup x.x.x.exe
#
# Prerequisites:
#   - Node.js + npm
#   - Python 3.x with pip
#   - pip install pyinstaller (will be done by this script)

param(
    [switch]$SkipBackend,   # Skip PyInstaller step (use existing resources/backend)
    [switch]$SkipFrontend   # Skip Vite build step
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "        Maiku AI - Build Script           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# -- Step 1: Python backend (PyInstaller) -------------------
if (-not $SkipBackend) {
    Write-Host "[1/4] Building Python backend with PyInstaller..." -ForegroundColor Yellow

    # Install PyInstaller if missing
    python -c "import PyInstaller" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Installing PyInstaller..." -ForegroundColor Gray
        pip install pyinstaller --quiet
    }

    # Run PyInstaller from backend dir (use python -m to avoid PATH issues)
    Push-Location backend
    try {
        python -m PyInstaller maiku_backend.spec --clean --noconfirm
        if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
        Write-Host "  Backend built successfully." -ForegroundColor Green
    } finally {
        Pop-Location
    }

    # Copy to resources/
    Write-Host "  Copying to resources/backend/..." -ForegroundColor Gray
    New-Item -ItemType Directory -Force -Path "resources\backend" | Out-Null
    if (Test-Path "resources\backend\maiku_backend") {
        Remove-Item -Recurse -Force "resources\backend\maiku_backend"
    }
    Copy-Item -Recurse "backend\dist\maiku_backend" "resources\backend\maiku_backend"
    Write-Host "  Done." -ForegroundColor Green
} else {
    Write-Host "[1/4] Skipping backend build (-SkipBackend)." -ForegroundColor Gray
    if (-not (Test-Path "resources\backend\maiku_backend")) {
        Write-Host "  ERROR: resources\backend\maiku_backend not found!" -ForegroundColor Red
        Write-Host "  Run without -SkipBackend at least once first." -ForegroundColor Red
        exit 1
    }
}

# -- Step 2: Check assets -----------------------------------
Write-Host "[2/4] Checking assets..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "assets" | Out-Null
if (-not (Test-Path "assets\icon.ico")) {
    Write-Host "  WARNING: assets\icon.ico not found - installer will use default icon." -ForegroundColor DarkYellow
    # Patch package.json to skip icon temporarily
    $pkg = Get-Content package.json -Raw | ConvertFrom-Json
    $pkg.build.win.PSObject.Properties.Remove('icon')
    $pkg.build.nsis.PSObject.Properties.Remove('installerIcon')
    $pkg.build.nsis.PSObject.Properties.Remove('uninstallerIcon')
    $pkg | ConvertTo-Json -Depth 10 | Set-Content package.json.noicon -Encoding utf8
    Write-Host "  (icon fields temporarily removed for this build)" -ForegroundColor Gray
}

if (-not (Test-Path "LICENSE.txt")) {
    $lic = "MIT License`r`n`r`nCopyright (c) 2026 Muhammad Muhaddas`r`n`r`nPermission is hereby granted, free of charge, to any person obtaining a copy of this software."
    Set-Content LICENSE.txt -Value $lic -Encoding utf8
    Write-Host "  Created placeholder LICENSE.txt" -ForegroundColor Gray
}

# -- Step 3: Vite frontend build ----------------------------
if (-not $SkipFrontend) {
    Write-Host "[3/4] Building React frontend (Vite)..." -ForegroundColor Yellow
    npm run build:vite
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed" }
    Write-Host "  Frontend built." -ForegroundColor Green
} else {
    Write-Host "[3/4] Skipping frontend build (-SkipFrontend)." -ForegroundColor Gray
}

# -- Step 4: Electron Builder --------------------------------
Write-Host "[4/4] Packaging with electron-builder..." -ForegroundColor Yellow
if (Test-Path "package.json.noicon") {
    npx electron-builder --win --config package.json.noicon
} else {
    npx electron-builder --win
}
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

# Restore
if (Test-Path "package.json.noicon") { Remove-Item "package.json.noicon" }

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "         Build complete!                  " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installer: dist-electron\Maiku AI Setup *.exe" -ForegroundColor Cyan
Write-Host ""
