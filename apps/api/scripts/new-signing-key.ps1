# Prints a random JWT signing key for Auth__SigningKey (64 characters). Works in PowerShell 5.1 and 7.
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes)
