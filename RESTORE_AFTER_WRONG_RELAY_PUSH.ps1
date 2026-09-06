$ErrorActionPreference = 'Stop'

Write-Host 'CASPULSE recovery: removing Relay-only files accidentally pushed into this repository...'

$relayOnly = @(
  'api',
  'vercel.json'
)

foreach ($path in $relayOnly) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "Removed: $path"
  }
}

Write-Host ''
Write-Host 'CASPULSE app files should now match v0.1.3 after this recovery package was extracted over the repository.'
Write-Host 'Next: review GitHub Desktop changes, commit, and Push origin.'
