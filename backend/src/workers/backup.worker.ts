/**
 * Wöchentliche Backup-Statusmail: fasst zusammen, welche Backups im Ordner
 * liegen (siehe lib/backups.ts), und warnt, wenn das jüngste Backup älter als
 * 2 Tage, unvollständig oder unverschlüsselt ist. Geht bewusst nur an VORSITZ
 * (nicht Stellvertretung) – wer Backups verantwortet, soll das selbst sehen.
 * Läuft montags um 07:00 Uhr.
 */

import { PrismaClient, Role } from "@prisma/client";
import cron from "node-cron";
import { ermittleBackupSaetze } from "../lib/backups.js";
import { sendeBackupWochenstatus } from "../lib/mailer.js";

export interface BackupWorkerErgebnis {
  anzahl: number;
  warnung: string | null;
  empfaengerAnzahl: number;
  gesendetAn: string[];
  fehlgeschlagenAn: { email: string; fehler: string }[];
}

function ermittleWarnung(pfadLesbar: boolean, saetze: { zeitpunkt: Date; vollstaendig: boolean; verschluesselt: boolean }[]): string | null {
  if (!pfadLesbar) return "Backup-Ordner ist auf dem Server nicht lesbar – bitte den Mount prüfen.";
  if (saetze.length === 0) return "Im Backup-Ordner liegt kein einziges Backup.";
  const juengstes = saetze[0];
  const tageAlt = (Date.now() - juengstes.zeitpunkt.getTime()) / 86_400_000;
  if (tageAlt > 2) return `Das jüngste Backup ist ${Math.floor(tageAlt)} Tage alt – prüfen, ob der automatische Lauf noch funktioniert.`;
  if (!juengstes.vollstaendig) return "Das jüngste Backup ist unvollständig (Datenbank oder Storage-Archiv fehlt).";
  if (!juengstes.verschluesselt) return "Das jüngste Backup ist unverschlüsselt (kein BACKUP_KEY gesetzt).";
  return null;
}

export class BackupWorker {
  private readonly prisma = new PrismaClient();

  async run(): Promise<BackupWorkerErgebnis> {
    console.log(`[BackupWorker] Start: ${new Date().toISOString()}`);
    try {
      const { pfadLesbar, saetze } = await ermittleBackupSaetze();
      const warnung = ermittleWarnung(pfadLesbar, saetze);

      const empfaenger = await this.prisma.benutzer.findMany({
        where:  { aktiv: true, rolle: Role.VORSITZ },
        select: { email: true, name: true },
      });

      if (empfaenger.length === 0) {
        console.log("[BackupWorker] Kein aktiver VORSITZ-Benutzer gefunden.");
        return { anzahl: saetze.length, warnung, empfaengerAnzahl: 0, gesendetAn: [], fehlgeschlagenAn: [] };
      }

      const gesendetAn: string[] = [];
      const fehlgeschlagenAn: { email: string; fehler: string }[] = [];

      for (const e of empfaenger) {
        try {
          await sendeBackupWochenstatus(e.email, e.name, { pfadLesbar, saetze, warnung });
          gesendetAn.push(e.email);
        } catch (err) {
          console.error(`[BackupWorker] E-Mail an ${e.email} fehlgeschlagen:`, err);
          fehlgeschlagenAn.push({ email: e.email, fehler: err instanceof Error ? err.message : "Unbekannter Fehler" });
        }
      }

      console.log(`[BackupWorker] ${saetze.length} Backup(s), Warnung: ${warnung ?? "keine"} – an ${gesendetAn.length}/${empfaenger.length} Empfänger gesendet.`);
      return { anzahl: saetze.length, warnung, empfaengerAnzahl: empfaenger.length, gesendetAn, fehlgeschlagenAn };
    } finally {
      await this.prisma.$disconnect();
    }
  }
}

export function startBackupWorker(): void {
  cron.schedule(
    "0 7 * * 1",
    async () => {
      const w = new BackupWorker();
      await w.run().catch(err => console.error("[BackupWorker] Unbehandelter Fehler:", err));
    },
    { timezone: "Europe/Berlin" }
  );
  console.log("[BackupWorker] Registriert: wöchentlich montags um 07:00 Uhr (Europe/Berlin)");
}
