<#
.SYNOPSIS
  Creates a random integration key for n8n and prints it once, plus the SHA-256 hash for the API.

  - The KEY goes into n8n only (as a Header Auth credential, header X-ServicePro-Integration-Key).
  - The HASH goes into apps/api/.env.public as Integrations__Keys__n8n=<hash>.
  The API never stores the key itself. To rotate: run again, update both places, restart the API.
#>
# Works in Windows PowerShell 5.1 and PowerShell 7.
$bytes = New-Object byte[] 36
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
$key = 'sp_n8n_' + ([Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_'))
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = (($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($key)) | ForEach-Object { $_.ToString('x2') }) -join '')
$sha.Dispose()

Write-Host ''
Write-Host 'n8n credential (Header Auth)' -ForegroundColor Cyan
Write-Host '  Name : X-ServicePro-Integration-Key'
Write-Host "  Value: $key"
Write-Host ''
Write-Host 'apps/api/.env.public' -ForegroundColor Cyan
Write-Host "  Integrations__Keys__n8n=$hash"
Write-Host ''
Write-Host 'Copy the key into n8n now; it is not saved anywhere.' -ForegroundColor Yellow
