# ================================================================
#  BR-DMS - deploy_update.ps1  (Windows PowerShell)
#  Uebertraegt die Quelldateien aus deploy_dateien.txt per SSH/tar
#  und zeigt danach die Rebuild-Befehle an.
#
#  .\deploy_update.ps1            uebertragen
#  .\deploy_update.ps1 -Trocken   nur anzeigen, was uebertragen wuerde
#  .\deploy_update.ps1 -Bauen     uebertragen und direkt neu bauen/starten
#
#  Benoetigt OpenSSH und tar (beide in Windows 10/11 eingebaut).
# ================================================================
param(
    [switch]$Trocken,
    [switch]$Bauen
)

$ErrorActionPreference = "Stop"

$DIR      = Split-Path -Parent $MyInvocation.MyCommand.Path
$ENV_FILE = Join-Path $DIR ".env.deploy"
$LISTE    = Join-Path $DIR "deploy_dateien.txt"

if (-not (Test-Path $ENV_FILE)) {
    Write-Host "Fehler: .env.deploy nicht gefunden (Vorlage: .env.deploy.example)." -ForegroundColor Red
    exit 1
}

# .env.deploy einlesen (Kommentare am Zeilenende werden ignoriert)
$envVars = @{}
Get-Content $ENV_FILE | Where-Object { $_ -match "^[A-Z_]+=.+" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $wert  = ($parts[1] -replace "\s+#.*$", "").Trim().Trim('"').Trim("'")
    $envVars[$parts[0]] = $wert
}

$NAS_USER  = $envVars["NAS_USER"]
$NAS_HOST  = $envVars["NAS_HOST"]
$DATA_PATH = "$($envVars["DATA_PATH"])".TrimEnd("/")
$DOCKER    = $envVars["DOCKER_BIN"]

if (-not $NAS_USER -or -not $NAS_HOST -or -not $DATA_PATH) {
    Write-Host "Fehler: NAS_USER, NAS_HOST und DATA_PATH muessen in .env.deploy gesetzt sein." -ForegroundColor Red
    exit 1
}
if ($DATA_PATH -notmatch "^/[^/]+/.+") {
    Write-Host "Fehler: DATA_PATH muss ein absoluter Pfad mit mindestens zwei Ebenen sein (ist: '$DATA_PATH')." -ForegroundColor Red
    exit 1
}

# docker-Programm: aus DOCKER_BIN, sonst am Pfad erkennen (QNAP /share/..., Synology /volume...)
if (-not $DOCKER) {
    if ($DATA_PATH.StartsWith("/share/"))      { $DOCKER = "/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker" }
    elseif ($DATA_PATH.StartsWith("/volume"))  { $DOCKER = "/usr/local/bin/docker" }
    else                                       { $DOCKER = "docker" }
}

$ZIEL    = "${NAS_USER}@${NAS_HOST}"
$DC      = "$DATA_PATH/docker-compose.yml"
$COMPOSE = "sudo $DOCKER compose -f $DC"

# Dateiliste lesen
$quellen  = @()
$ersetzen = @()
foreach ($zeile in Get-Content $LISTE) {
    $z = $zeile.Trim()
    if (-not $z -or $z.StartsWith("#")) { continue }
    $teile = $z -split "\s+"
    if (-not (Test-Path (Join-Path $DIR $teile[0]))) {
        Write-Host "Fehler: $($teile[0]) fehlt lokal (siehe deploy_dateien.txt)." -ForegroundColor Red
        exit 1
    }
    $quellen += $teile[0]
    if ($teile.Count -gt 1 -and $teile[1] -eq "*") { $ersetzen += $teile[0] }
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  BR-DMS Update-Deploy" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Ziel   : $ZIEL"
Write-Host "  Pfad   : $DATA_PATH"
Write-Host "  docker : $DOCKER"
Write-Host "================================================================" -ForegroundColor White
Write-Host ""

Set-Location $DIR

# Binaerdaten zwischen tar und ssh laufen ueber cmd.exe - die PowerShell-Pipeline
# wuerde den Datenstrom beschaedigen. Keine einfachen Anfuehrungszeichen um die
# Muster: cmd.exe entfernt sie nicht.
$tarCmd = "tar -czf - --exclude=node_modules --exclude=dist --exclude=.env --exclude=*.env --exclude=.env.local --exclude=__pycache__ " + ($quellen -join " ")

if ($Trocken) {
    Write-Host "  Probelauf - wuerde uebertragen:" -ForegroundColor White
    cmd.exe /c "$tarCmd | tar -tzf -" | Where-Object { $_ -notmatch "/$" } | ForEach-Object { "    $_" }
    Write-Host ""
    Write-Host "  Auf dem Host ersetzt (nicht nur ueberschrieben): $($ersetzen -join ' ')"
    exit 0
}

Write-Host "  Uebertrage Dateien (einmalig Passwort eingeben) ..."

# Auf dem Host erst in einen Zwischenordner entpacken und die markierten Ordner
# danach ersetzen - bricht die Uebertragung ab, bleibt der alte Stand vollstaendig.
# Bewusst ohne doppelte Anfuehrungszeichen, damit cmd.exe den Befehl nicht zerlegt.
$remote = "set -e; mkdir -p '$DATA_PATH' && cd '$DATA_PATH'; " +
          "rm -rf .deploy-neu && mkdir .deploy-neu; " +
          "tar -xzf - -C .deploy-neu; " +
          "for d in $($ersetzen -join ' '); do rm -rf `$d; done; " +
          "cp -a .deploy-neu/. . && rm -rf .deploy-neu; " +
          "chmod +x backup.sh restore.sh proxy/generate-selfsigned-cert.sh backend/docker-entrypoint.sh"

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c $tarCmd | ssh $ZIEL `"$remote`"" -WorkingDirectory $DIR -Wait -PassThru -NoNewWindow
if ($proc.ExitCode -ne 0) {
    Write-Host "  Fehler bei der Uebertragung (Exit code: $($proc.ExitCode))" -ForegroundColor Red
    exit 1
}
Write-Host "  Uebertragung abgeschlossen" -ForegroundColor Green

if ($Bauen) {
    Write-Host ""
    Write-Host "  Baue und starte auf dem Host (sudo-Passwort des Hosts) ..."
    ssh -t $ZIEL "$COMPOSE up -d --build"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Fehler beim Bauen (Exit code: $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Container neu gebaut und gestartet" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Logs: ssh $ZIEL `"sudo $DOCKER logs brdms_backend --tail 40 -f`"" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Jetzt per SSH auf dem Host ausfuehren:" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  SSH verbinden:" -ForegroundColor White
Write-Host "  ssh $ZIEL" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option A - Alles neu bauen (Backend + Frontend):" -ForegroundColor White
Write-Host "  $COMPOSE up -d --build" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option B - Nur Backend:" -ForegroundColor White
Write-Host "  $COMPOSE build backend && $COMPOSE up -d" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Option C - Nur Frontend (ohne Cache):" -ForegroundColor White
Write-Host "  $COMPOSE build --no-cache frontend && $COMPOSE up -d" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Logs pruefen:" -ForegroundColor White
Write-Host "  sudo $DOCKER logs brdms_backend --tail 40 -f" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Tipp: .\deploy_update.ps1 -Bauen erledigt Uebertragung und Option A in einem Schritt."
Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "  Backup & Restore (auf dem Host ausfuehren):" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
Write-Host ""
Write-Host "  Manuelles Backup:" -ForegroundColor White
Write-Host "  sudo bash $DATA_PATH/backup.sh" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Backup wiederherstellen (interaktiv):" -ForegroundColor White
Write-Host "  sudo bash $DATA_PATH/restore.sh" -ForegroundColor Yellow
Write-Host ""
