// Handler fuer das brdmsfile://-Protokoll (Ersatz fuer die reine PowerShell-Loesung).
//
// Chrome/Edge verweigern es, URL-Inhalte als Kommandozeilen-Argument an bekannte
// Skript-Interpreter (powershell.exe, cmd.exe, wscript.exe, ...) zu uebergeben -
// aus Sicherheitsgruenden gegen Command-Injection ueber Protokoll-Links. Eine eigene,
// unabhaengige .exe umgeht diese Sperre, weil sie kein erkannter Skript-Host ist.
//
// Wandelt brdmsfile://br-nas/pfad%20mit%20leerzeichen/datei.docx zurueck in
// \\br-nas\pfad mit leerzeichen\datei.docx und oeffnet es mit der Standard-App.

using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Text.RegularExpressions;
using System.Reflection;

// Versions-Infos der .exe - Chrome/Edge zeigen den Titel im "...öffnen?"-Bestätigungsdialog an
// (wie bei anderen Protokoll-Handlern üblich) statt des Dateinamens.
[assembly: AssemblyTitle("BR-DMS Datei-Link")]
[assembly: AssemblyProduct("BR-DMS Datei-Link")]
[assembly: AssemblyDescription("Öffnet NAS-Datei-Links aus dem BR-DMS-Editor")]

class BrdmsFileOpener
{
    static readonly string LogDatei = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "BR-DMS", "log.txt");

    static void Log(string text)
    {
        try
        {
            File.AppendAllText(LogDatei, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + text + Environment.NewLine);
        }
        catch { /* Logging darf den eigentlichen Ablauf nie stoeren */ }
    }

    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                Log("Kein Argument erhalten - Abbruch");
                return;
            }

            string url = args[0].Trim('"');
            Log("Aufgerufen mit: " + url);

            string pfadTeil = Regex.Replace(url, "^brdmsfile://", "", RegexOptions.IgnoreCase);
            pfadTeil = Uri.UnescapeDataString(pfadTeil);

            string uncPfad = "\\\\" + pfadTeil.Replace('/', '\\');
            uncPfad = uncPfad.TrimEnd('\\');

            Log("Aufgeloest zu: " + uncPfad);

            if (!File.Exists(uncPfad) && !Directory.Exists(uncPfad))
            {
                Log("Pfad nicht gefunden: " + uncPfad);
                MessageBox.Show(
                    "Datei oder Ordner nicht gefunden:\n" + uncPfad + "\n\nIst das Laufwerk/NAS erreichbar?",
                    "BR-DMS Datei-Link", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Log("Pfad gefunden - starte Prozess");
            Process.Start(new ProcessStartInfo(uncPfad) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Log("FEHLER: " + ex.Message);
            MessageBox.Show(
                "Fehler beim Oeffnen:\n" + ex.Message,
                "BR-DMS Datei-Link", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
