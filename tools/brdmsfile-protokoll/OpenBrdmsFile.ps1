# Handler fuer das brdmsfile://-Protokoll.
# Wird vom Browser aufgerufen, wenn im BR-DMS-Editor auf einen Datei-Link geklickt wird,
# z.B. brdmsfile://br-nas/einfach/Entwurf%20einer%20Geschaeftsordnung.docx
# Wandelt die URL zurueck in einen UNC-Pfad (\\br-nas\einfach\...) und oeffnet ihn mit
# der Standard-App (Word, Explorer, etc.) - genau wie ein Doppelklick im Explorer.
#
# Laeuft mit -WindowStyle Hidden (keine sichtbare Konsole) - Fehler landen deshalb in
# dieser Log-Datei statt auf dem Bildschirm: %LOCALAPPDATA%\BR-DMS\log.txt

param([string]$Url)

$logDatei = "$env:LOCALAPPDATA\BR-DMS\log.txt"
function Log($text) {
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $text" | Out-File -FilePath $logDatei -Append -Encoding utf8
}

try {
    Log "Aufgerufen mit: $Url"

    if (-not $Url) { Log "Kein Url-Parameter erhalten - Abbruch"; exit }

    # Manche Browser haengen Anfuehrungszeichen an oder ein "/" ans Ende
    $Url = $Url.Trim('"')

    # Praefix "brdmsfile://" entfernen (Gross-/Kleinschreibung egal)
    $pfadTeil = $Url -replace '(?i)^brdmsfile://', ''

    # Prozent-kodierte Zeichen zurueckwandeln (%20 -> Leerzeichen, %C3%A4 -> ae, ...)
    $pfadTeil = [System.Uri]::UnescapeDataString($pfadTeil)

    # Slashes zurueck in Backslashes, UNC-Praefix voranstellen
    $uncPfad = '\\' + ($pfadTeil -replace '/', '\')
    $uncPfad = $uncPfad.TrimEnd('\')

    Log "Aufgeloest zu: $uncPfad"

    if (-not (Test-Path -LiteralPath $uncPfad)) {
        Log "Test-Path FEHLGESCHLAGEN fuer: $uncPfad"
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Datei oder Ordner nicht gefunden:`n$uncPfad`n`nIst das Laufwerk/NAS erreichbar?",
            "BR-DMS Datei-Link",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        exit
    }

    Log "Test-Path OK - starte Start-Process"
    Start-Process -FilePath $uncPfad
    Log "Start-Process aufgerufen, kein Fehler geworfen"
}
catch {
    Log "FEHLER: $($_.Exception.Message)"
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "Fehler beim Oeffnen:`n$($_.Exception.Message)",
        "BR-DMS Datei-Link",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
}
