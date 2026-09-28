# BR-DMS Deploy-Script fuer Windows PowerShell
# Uebertraegt Quelldateien per SSH/tar auf den QNAP NAS

$ErrorActionPreference = "Stop"

$DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE = Join-Path $DIR ".env.deploy"

if (-not (Test-Path $ENV_FILE)) {
    Write-Host "Fehler: .env.deploy nicht gefunden." -ForegroundColor Red
    exit 1
}

# .env.deploy einlesen
$envVars = @{}
Get-Content $ENV_FILE | Where-Object { $_ -match "^[A-Z_]+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $envVars[$parts[0]] = $parts[1].Trim('"').Trim("'")
}

$NAS_USER  = $envVars["NAS_USER"]
$NAS_HOST  = $envVars["NAS_HOST"]
$DATA_PATH = $envVars["DATA_PATH"]
$ZIEL      = "${NAS_USER}@${NAS_HOST}"

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  BR-DMS Update-Deploy" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Ziel : $ZIEL"
Write-Host "  Pfad : $DATA_PATH"
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  Uebertrage Dateien (einmalig PW eingeben) ..."

Set-Location $DIR

# Dateien die uebertragen werden
$quellen = @(
    "backend/src",
    "backend/prisma",
    "backend/Dockerfile",
    "backend/docker-entrypoint.sh",
    "backend/package.json",
    "backend/tsconfig.json",
    "frontend/src",
    "frontend/index.html",
    "frontend/nginx.conf",
    "frontend/package.json",
    "frontend/postcss.config.js",
    "frontend/tailwind.config.js",
    "frontend/tsconfig.json",
    "frontend/vite.config.ts",
    "proxy",
    "docker-compose.yml",
    "backup.sh",
    "restore.sh"
)

# tar + SSH (benoetigt OpenSSH und tar, beide in Windows 10/11 eingebaut)
$quellenStr = $quellen -join " "
$tarCmd = "tar -czf - --exclude='*.env' $quellenStr"
$sshCmd = "tar -xzf - -C '$DATA_PATH' && chmod +x '$DATA_PATH/backup.sh' '$DATA_PATH/restore.sh' '$DATA_PATH/proxy/generate-selfsigned-cert.sh'"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $tarCmd | ssh $ZIEL `"$sshCmd`"" -WorkingDirectory $DIR -Wait -PassThru -NoNewWindow

if ($proc.ExitCode -eq 0) {
    Write-Host "  Uebertragung abgeschlossen" -ForegroundColor Green
} else {
    Write-Host "  Fehler bei der Uebertragung (Exit code: $($proc.ExitCode))" -ForegroundColor Red
    exit 1
}

$DC = "$DATA_PATH/docker-compose.yml"
$DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker"

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Jetzt per SSH auf dem NAS ausfuehren:" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  SSH verbinden:" -ForegroundColor White
Write-Host "  ssh $ZIEL" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Alles neu bauen (Backend + Frontend):" -ForegroundColor White
Write-Host "  sudo sh -c `"cd $DATA_PATH && $DOCKER compose up -d --build`"" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Nur Frontend:" -ForegroundColor White
Write-Host "  sudo sh -c `"cd $DATA_PATH && $DOCKER compose up -d --force-recreate --build frontend`"" -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Backup & Restore (auf dem NAS ausfuehren):" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  Manuelles Backup:" -ForegroundColor White
Write-Host "  sudo bash $DATA_PATH/backup.sh" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Backup wiederherstellen (interaktiv):" -ForegroundColor White
Write-Host "  sudo bash $DATA_PATH/restore.sh" -ForegroundColor Yellow
Write-Host ""
