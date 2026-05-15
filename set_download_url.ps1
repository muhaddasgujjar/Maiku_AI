# Maiku AI — Set the download URL in the landing page
# Usage:  .\set_download_url.ps1 "YOUR_DIRECT_DOWNLOAD_URL"
# Example: .\set_download_url.ps1 "https://drive.google.com/uc?export=download&id=1abc..."

param([Parameter(Mandatory)][string]$Url)

$html = "landing\index.html"
if (-not (Test-Path $html)) { Write-Host "ERROR: $html not found" -ForegroundColor Red; exit 1 }

$content = Get-Content $html -Raw
$updated = $content -replace "const DOWNLOAD_URL = '[^']*';", "const DOWNLOAD_URL = '$Url';"

if ($content -eq $updated) {
    Write-Host "ERROR: Could not find DOWNLOAD_URL line in $html" -ForegroundColor Red
    exit 1
}

Set-Content $html $updated -Encoding utf8
Write-Host "Done! Download URL set to:" -ForegroundColor Green
Write-Host "  $Url" -ForegroundColor Cyan
Write-Host ""
Write-Host "Now drag the 'landing' folder to netlify.com/drop to publish your site." -ForegroundColor Yellow
