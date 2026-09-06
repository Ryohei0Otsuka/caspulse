$ErrorActionPreference = "Stop"

Write-Host "CASPULSE v0.2.0 migration: removing old OAuth-only files..."

$targets = @(
  "src\main\oauth.ts",
  "src\main\generated-oauth-config.ts",
  "scripts\generate-oauth-config.mjs",
  "COMMIT_SUMMARY.txt"
)

foreach ($target in $targets) {
  if (Test-Path $target) {
    Remove-Item $target -Force
    Write-Host "Removed: $target"
  }
}

if (Test-Path "scripts") {
  $remaining = Get-ChildItem "scripts" -Force -ErrorAction SilentlyContinue
  if (-not $remaining) {
    Remove-Item "scripts" -Force
    Write-Host "Removed empty: scripts"
  }
}

Write-Host ""
Write-Host "Migration complete."
Write-Host "Next:"
Write-Host "  npm install"
Write-Host "  npm run typecheck"
Write-Host "  npm run build:portable"
Write-Host ""
Write-Host "Portable output:"
Write-Host "  release\CASPULSE.exe"

# This helper is only for the one-time migration and should not remain in the repository.
$me = $MyInvocation.MyCommand.Path
Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile -Command `"Start-Sleep -Milliseconds 400; Remove-Item -LiteralPath '$me' -Force`""
