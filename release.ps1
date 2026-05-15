# Maiku AI -- Build + GitHub Release Script
# Usage: .\release.ps1 [-Version "0.2.0"] [-SkipBuild]
#
# Prerequisites:
#   gh CLI installed (winget install GitHub.cli) and logged in (gh auth login)

param(
    [string]$Version = "0.1.0",
    [switch]$SkipBuild,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Maiku AI -- Release v$Version          " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build
if (-not $SkipBuild) {
    Write-Host "[1/3] Building installer..." -ForegroundColor Yellow
    if ($SkipBackend) {
        .\build.ps1 -SkipBackend
    } else {
        .\build.ps1
    }
    Write-Host "  Build complete." -ForegroundColor Green
} else {
    Write-Host "[1/3] Skipping build (-SkipBuild)." -ForegroundColor Gray
}

# Step 2: Find installer
$installer = "dist-electron\Maiku-AI-Setup.exe"
if (-not (Test-Path $installer)) {
    $found = Get-ChildItem "dist-electron\*.exe" -ErrorAction SilentlyContinue |
             Where-Object { $_.Name -like "*Setup*" } | Select-Object -First 1
    if ($found) {
        $installer = $found.FullName
    } else {
        Write-Host "ERROR: No installer found in dist-electron\" -ForegroundColor Red
        exit 1
    }
}

$sizeMB = [math]::Round((Get-Item $installer).Length / 1MB, 1)
Write-Host "[2/3] Installer: $installer ($sizeMB MB)" -ForegroundColor Cyan

# Step 3: Publish release
Write-Host "[3/3] Creating GitHub release v$Version..." -ForegroundColor Yellow

$notes = "## Maiku AI v$Version`n`nYour invisible AI interview copilot for Windows.`n`n### Installation`n1. Download Maiku-AI-Setup.exe below`n2. Run the installer`n3. Follow the setup wizard to add your free Groq API key`n`n### Requirements`n- Windows 10 / 11 (64-bit)`n- Free Groq API key: https://console.groq.com/keys"

$exists = gh release view "v$Version" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Release v$Version already exists -- uploading asset..." -ForegroundColor Yellow
    gh release upload "v$Version" $installer --clobber
} else {
    gh release create "v$Version" $installer --title "Maiku AI v$Version" --notes $notes --latest
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub release failed. Run 'gh auth login' first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Release published!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Direct download URL:" -ForegroundColor Cyan
Write-Host "  https://github.com/muhaddasgujjar/Maiku_AI/releases/latest/download/Maiku-AI-Setup.exe"
Write-Host ""
Write-Host "Release page:" -ForegroundColor Cyan
Write-Host "  https://github.com/muhaddasgujjar/Maiku_AI/releases/tag/v$Version"
Write-Host ""
