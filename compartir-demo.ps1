# Publica la demo de NEXOTIME con un link temporal para enseñar a un cliente.
# Uso:  powershell -ExecutionPolicy Bypass -File .\compartir-demo.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "1/3  Compilando..." -ForegroundColor Cyan
npm run build | Out-Null

Write-Host "2/3  Servidor local en http://localhost:4173" -ForegroundColor Cyan
$preview = Start-Process npm -ArgumentList 'run','preview','--','--port','4173','--host' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

Write-Host "3/3  Abriendo tunel publico (ngrok)..." -ForegroundColor Cyan
$ngrok = Start-Process ngrok -ArgumentList 'http','4173','--log','stdout' -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4

try {
  $url = (Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels').tunnels[0].public_url
  Write-Host ""
  Write-Host "  LINK PARA EL CLIENTE:  $url" -ForegroundColor Green
  Write-Host "  (la primera vez ngrok muestra un aviso -> boton 'Visit Site')" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  Deja esta ventana abierta. Ctrl+C para terminar." -ForegroundColor DarkGray
} catch {
  Write-Host "  No se pudo leer la URL de ngrok. Revisa http://127.0.0.1:4040" -ForegroundColor Yellow
}

try { Wait-Process -Id $ngrok.Id } finally {
  Stop-Process -Id $preview.Id -ErrorAction SilentlyContinue
  Stop-Process -Id $ngrok.Id -ErrorAction SilentlyContinue
}
