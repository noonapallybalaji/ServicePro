<#
.SYNOPSIS
  Runs the ServicePro API for Cloudflare Tunnel: Public environment, secrets from a git-ignored file,
  listening on 127.0.0.1 only (cloudflared is the only way in from the internet).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File apps/api/scripts/start-public-api.ps1
  powershell -ExecutionPolicy Bypass -File apps/api/scripts/start-public-api.ps1 -EnvFile D:\secrets\servicepro.env -Port 5180
#>
param(
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env.public'),
    [int]$Port = 5180
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvFile)) {
    throw "Secrets file not found: $EnvFile. Copy apps/api/public.env.example to apps/api/.env.public and fill it in."
}

# Load KEY=VALUE lines into this process only (nothing is written to the user or machine environment).
$settings = @{}
foreach ($line in Get-Content $EnvFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $index = $trimmed.IndexOf('=')
    if ($index -lt 1) { continue }
    $settings[$trimmed.Substring(0, $index).Trim()] = $trimmed.Substring($index + 1).Trim()
}

function Setting([string]$name) { if ($settings.ContainsKey($name)) { [string]$settings[$name] } else { '' } }

$problems = @()
if (-not (Setting 'ConnectionStrings__Database')) { $problems += 'ConnectionStrings__Database is empty.' }
if ((Setting 'Auth__SigningKey').Length -lt 32) { $problems += 'Auth__SigningKey must be at least 32 random characters.' }
if ((Setting 'Notifications__PublicSiteUrl') -notmatch '^https://[^/]+$') { $problems += 'Notifications__PublicSiteUrl must be an https origin without a trailing slash.' }
if ((Setting 'Integrations__Keys__n8n') -notmatch '^[0-9a-fA-F]{64}$') { $problems += 'Integrations__Keys__n8n must be the 64-character SHA-256 hash from new-integration-key.ps1.' }
if ($problems.Count -gt 0) {
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "Fix $EnvFile and try again."
}

foreach ($entry in $settings.GetEnumerator()) {
    Set-Item -Path "Env:$($entry.Key)" -Value $entry.Value
}

$env:ASPNETCORE_ENVIRONMENT = 'Public'
$env:ASPNETCORE_URLS = "http://127.0.0.1:$Port"

Write-Host "ServicePro API (Public) on http://127.0.0.1:$Port - expose it with cloudflared, never directly." -ForegroundColor Cyan
dotnet run --project (Join-Path $PSScriptRoot '..\src\ServicePro.Api') --no-launch-profile
