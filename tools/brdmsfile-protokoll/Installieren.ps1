# Einmalig pro PC ausfuehren, um Datei-Links aus dem BR-DMS-Editor zu aktivieren.
# Braucht KEINE Admin-Rechte (schreibt nur in HKEY_CURRENT_USER, kompiliert nur fuer den
# eigenen Benutzer nach %LOCALAPPDATA%).
#
# Aufruf: Rechtsklick auf diese Datei -> "Mit PowerShell ausfuehren"
# (oder in einer PowerShell-Konsole: .\Installieren.ps1)

$zielOrdner = "$env:LOCALAPPDATA\BR-DMS"
$zielExe    = Join-Path $zielOrdner "BrdmsFileOpener.exe"
$quellCs    = Join-Path $PSScriptRoot "BrdmsFileOpener.cs"

New-Item -ItemType Directory -Force -Path $zielOrdner | Out-Null

# csc.exe (C#-Compiler, Teil jeder .NET-Framework-Installation - auf jedem
# Windows 10/11 bereits vorhanden, kein zusaetzliches SDK noetig) suchen.
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64" -Filter "csc.exe" -Recurse -ErrorAction SilentlyContinue |
       Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $csc) {
    $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework" -Filter "csc.exe" -Recurse -ErrorAction SilentlyContinue |
           Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $csc) {
    Write-Error "Kein C#-Compiler (csc.exe) gefunden - .NET Framework scheint zu fehlen."
    exit 1
}

Write-Host "Kompiliere mit $csc ..."
& $csc /nologo /target:winexe /out:"$zielExe" /reference:System.Windows.Forms.dll "$quellCs"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Kompilieren fehlgeschlagen."
    exit 1
}

$basis = "HKCU:\Software\Classes\brdmsfile"
New-Item -Path $basis -Force | Out-Null
Set-ItemProperty -Path $basis -Name "(default)" -Value "URL:BR-DMS Datei-Link"
Set-ItemProperty -Path $basis -Name "URL Protocol" -Value ""
# Chrome/Edge lesen fuer den Bestaetigungsdialog nicht die Versions-Infos der .exe,
# sondern diesen separaten "freundlicher Name"-Eintrag - ohne das steht dort der rohe Dateiname.
Set-ItemProperty -Path $basis -Name "FriendlyTypeName" -Value "BR-DMS Datei-Link"

New-Item -Path "$basis\shell\open\command" -Force | Out-Null
$befehl = "`"$zielExe`" `"%1`""
Set-ItemProperty -Path "$basis\shell\open\command" -Name "(default)" -Value $befehl

$appKey = "HKCU:\Software\Classes\Applications\BrdmsFileOpener.exe"
New-Item -Path $appKey -Force | Out-Null
Set-ItemProperty -Path $appKey -Name "FriendlyAppName" -Value "BR-DMS Datei-Link"

Write-Host "Fertig. brdmsfile://-Links im BR-DMS werden jetzt lokal geoeffnet."
Write-Host "Beim ersten Klick fragt der Browser einmalig, ob er den Link oeffnen darf - einfach bestaetigen."
