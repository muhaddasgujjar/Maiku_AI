
# Maiku AI — Build + GitHub Release Script
# Usage: .\release.ps1 [-Version "0.2.0"] [-SkipBuild]
#
# Prerequisites:
#   1. gh CLI installed:  winget install GitHub.cli
#   2. Logged in:         gh auth login
#   3. Repo pushed:       git push

param(
    [string]$Version = "0.1.0",
    [switch]$SkipBuild,    # Skip building — use existing dist-electron\Maiku-AI-Setup.exe
    [switch]$SkipBackend   # Pass through to build.ps1
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Maiku AI — Release v$Version           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Build ──────────────────────────────────────────────────────────
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

# ── Step 2: Verify installer exists ────────────────────────────────────────
$installer = "dist-electron\Maiku-AI-Setup.exe"
if (-not (Test-Path $installer)) {
    # Fallback — old naming without artifactName override
    $fallback = Get-ChildItem "dist-electron\*.exe" | Where-Object { $_.Name -like "*Setup*" } | Select-Object -First 1
    if ($fallback) {
        $installer = $fallback.FullName
        Write-Host "  Using: $installer" -ForegroundColor Gray
    } else {
        Write-Host "ERROR: No installer .exe found in dist-electron\" -ForegroundColor Red
        Write-Host "Run .\build.ps1 first." -ForegroundColor Red
        exit 1
    }
}

$size = [math]::Round((Get-Item $installer).Length / 1MB, 1)
Write-Host "  Installer: $installer ($size MB)" -ForegroundColor Cyan

# ── Step 3: Create GitHub release ──────────────────────────────────────────
Write-Host "[3/3] Creating GitHub release v$Version..." -ForegroundColor Yellow

$releaseNotes = @"
## Maiku AI v$Version

Your invisible AI interview copilot for Windows.

### What's new
- First-run onboarding wizard (no more manual setup!)
- Splash screen during backend startup
- Improved installer with guided setup

### Installation
1. Download **Maiku-AI-Setup.exe** below
2. Run the installer (click "Next" through the wizard)
3. Launch Maiku AI — the setup wizard will guide you to add your free Groq API key

### Requirements
- Windows 10 / 11 (64-bit)
- ~200 MB disk space
- Free Groq API key: https://console.groq.com/keys

### Free API Key
Create a free account at [console.groq.com](https://console.groq.com/keys).
No credit card required. Free tier: 7,200 seconds/day transcription + LLM tokens.
"@

# Check if release already exists
$existingRelease = gh release view "v$Version" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Release v$Version already exists — uploading new asset..." -ForegroundColor Yellow
    gh release upload "v$Version" $installer --clobber
} else {
    gh release create "v$Version" $installer `
        --title "Maiku AI v$Version" `
        --notes $releaseNotes `
        --latest
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "GitHub release failed. Make sure 'gh auth login' has been run." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  Release published!                      " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Direct download URL:" -ForegroundColor Cyan
Write-Host "  https://github.com/muhaddasgujjar/Maiku_AI/releases/latest/download/Maiku-AI-Setup.exe" -ForegroundColor White
Write-Host ""
Write-Host "Release page:" -ForegroundColor Cyan
Write-Host "  https://github.com/muhaddasgujjar/Maiku_AI/releases/tag/v$Version" -ForegroundColor White
Write-Host ""
