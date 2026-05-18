/**
 * BR-DMS – DSGVO-Lösch-Worker
 *
 * Läuft täglich um 02:00 Uhr (Europe/Berlin) und löscht alle
 * Dokumente, deren delete_at-Datum überschritten ist.
 *
 * DSGVO-konformer Ablauf pro Dokument:
 *  1. Status → LOESCHVORMERKUNG  (atomarer Lock gegen Race-Condition)
 *  2. Alle physischen Dateien auf Disk sicher überschreiben + löschen
 *  3. Datenbankfelder bereinigen (Pfad, Name → "[gelöscht]")
 *  4. Status → GELOESCHT, geloescht_am = NOW()
 *  5. Unveränderlichen Audit-Log-Eintrag schreiben
 *
 * Die Metadaten (Titel, Kategorie, Zeitpunkte) bleiben erhalten –
 * sie sind für die DSGVO-Nachweispflicht erforderlich.
 */

import { PrismaClient, DokumentStatus, AuditAktion } from "@prisma/client";
import path from "node:path";
import fs from "node:fs/promises";
import { secureDelete } from "../lib/encryption.js";
import cron from "node-cron";

// ----------------------------------------------------------------
//  Typen
// ----------------------------------------------------------------
type PendingDoc = {
  id:          string;
  titel:       string;
  kategorie:   string;
  status:      string;
  speicherpfad: string;
  verschlPfad: string;
  versionen: Array<{
    id:          string;
    speicherpfad: string;
    verschlPfad: string;
  }>;
};

type ErgebnisEintrag = {
  id:            string;
  titel:         string;
  erfolg:        boolean;
  geloeschteDateien: number;
  fehler?:       string;
};

// ----------------------------------------------------------------
//  DeletionWorker
// ----------------------------------------------------------------
export class DeletionWorker {
  private readonly prisma:       PrismaClient;
  private readonly storagePath:  string;
  private readonly batchGroesse: number;

  constructor(opts?: { batchGroesse?: number }) {
    this.prisma       = new PrismaClient();
    this.storagePath  = process.env.STORAGE_PATH ?? "/data/storage";
    this.batchGroesse = opts?.batchGroesse ?? 50;
  }

  /**
   * Führt einen vollständigen Löschlauf durch.
   * Gibt eine Zusammenfassung für das Logging zurück.
   */
  async run(): Promise<void> {
    const start = Date.now();
    console.log(`[DeletionWorker] ── Start: ${new Date().toISOString()} ──`);

    let verarbeitet = 0, geloescht = 0, fehler = 0;
    const fehlerListe: string[] = [];

    try {
      // Batch-Verarbeitung verhindert Memory-Overflow bei großen Mengen
      for await (const batch of this.batches()) {
        for (const doc of batch) {
          verarbeitet++;
          const ergebnis = await this.dokumentLoeschen(doc);

          if (ergebnis.erfolg) {
            geloescht++;
            console.log(
              `[DeletionWorker] ✓ ${ergebnis.titel} (${ergebnis.id}) ` +
              `– ${ergebnis.geloeschteDateien} Datei(en) entfernt`
            );
          } else {
            fehler++;
            const msg = `✗ ${ergebnis.id}: ${ergebnis.fehler}`;
            fehlerListe.push(msg);
            console.error(`[DeletionWorker] ${msg}`);
          }
        }
      }
    } finally {
      await this.prisma.$disconnect();
    }

    const dauer = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[DeletionWorker] ── Ende (${dauer}s): ` +
      `${verarbeitet} geprüft, ${geloescht} gelöscht, ${fehler} Fehler ──`
    );

    if (fehler > 0) {
      console.error("[DeletionWorker] Fehlgeschlagene Dokumente:", fehlerListe);
    }
  }

  // ----------------------------------------------------------------
  //  Privat: Batch-Generator (async iterable)
  // ----------------------------------------------------------------

  private async *batches(): AsyncGenerator<PendingDoc[]> {
    let cursor: string | undefined;

    while (true) {
      const batch = await this.prisma.dokument.findMany({
        where: {
          deleteAt: { lte: new Date() },
          status:   { in: [DokumentStatus.AKTIV, DokumentStatus.ARCHIVIERT, DokumentStatus.LOESCHVORMERKUNG] },
          geloeschtAm: null,
        },
        include: {
          versionen: {
            select: { id: true, speicherpfad: true, verschlPfad: true },
          },
        },
        orderBy: { deleteAt: "asc" },
        take:    this.batchGroesse,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;
      yield batch as PendingDoc[];
      cursor = batch[batch.length - 1].id;
    }
  }

  // ----------------------------------------------------------------
  //  Privat: Einzeldokument löschen
  // ----------------------------------------------------------------

  private async dokumentLoeschen(doc: PendingDoc): Promise<ErgebnisEintrag> {
    let geloeschteDateien = 0;

    try {
      // ── Schritt 1: Atomaren Lock setzen ──────────────────────────
      const locked = await this.prisma.dokument.updateMany({
        where: {
          id:     doc.id,
          status: { in: [DokumentStatus.AKTIV, DokumentStatus.ARCHIVIERT] },
        },
        data: { status: DokumentStatus.LOESCHVORMERKUNG },
      });

      // Ein anderer Prozess hat dieses Dokument bereits übernommen
      if (locked.count === 0 && doc.status !== DokumentStatus.LOESCHVORMERKUNG) {
        return { id: doc.id, titel: doc.titel, erfolg: true, geloeschteDateien: 0 };
      }

      // ── Schritt 2: Physische Dateien löschen ─────────────────────
      const alleVersionen = [
        { speicherpfad: doc.speicherpfad, verschlPfad: doc.verschlPfad },
        ...doc.versionen,
      ];

      for (const v of alleVersionen) {
        const vollpfad = path.join(this.storagePath, v.speicherpfad, v.verschlPfad);
        await secureDelete(vollpfad);
        geloeschteDateien++;
      }

      // Leere Verzeichnisse aufräumen
      await this.bereinigeLeeresVerzeichnis(
        path.join(this.storagePath, doc.speicherpfad)
      );

      // ── Schritt 3 & 4: DB bereinigen ─────────────────────────────
      await this.prisma.dokument.update({
        where: { id: doc.id },
        data: {
          status:       DokumentStatus.GELOESCHT,
          geloeschtAm:  new Date(),
          loeschgrund:  "DSGVO-Automatiklöschung (delete_at überschritten)",
          // Pfad-Referenzen entfernen – Datei existiert nicht mehr
          speicherpfad: "[gelöscht]",
          verschlPfad:  "[gelöscht]",
        },
      });

      // ── Schritt 5: Audit-Log (unveränderlich) ────────────────────
      await this.prisma.auditLog.create({
        data: {
          dokumentId: doc.id,
          benutzerId: null, // System-Aktion
          aktion:     AuditAktion.DOKUMENT_GELOESCHT,
          details: {
            system:          true,
            grund:           "DSGVO-Automatiklöschung",
            kategorie:       doc.kategorie,
            geloeschteDateien,
          },
        },
      });

      return { id: doc.id, titel: doc.titel, erfolg: true, geloeschteDateien };

    } catch (err) {
      // Status zurück auf LOESCHVORMERKUNG lassen – nächster Lauf versucht es erneut
      return {
        id:                doc.id,
        titel:             doc.titel,
        erfolg:            false,
        geloeschteDateien,
        fehler:            err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ----------------------------------------------------------------
  //  Privat: Leere Verzeichnisse aufräumen
  // ----------------------------------------------------------------

  private async bereinigeLeeresVerzeichnis(dirPath: string): Promise<void> {
    // Niemals über den Storage-Root hinausgehen
    if (!dirPath.startsWith(this.storagePath) || dirPath === this.storagePath) {
      return;
    }
    try {
      const eintraege = await fs.readdir(dirPath);
      if (eintraege.length === 0) {
        await fs.rmdir(dirPath);
        await this.bereinigeLeeresVerzeichnis(path.dirname(dirPath));
      }
    } catch {
      // Verzeichnis existiert nicht mehr – kein Fehler
    }
  }
}

// ----------------------------------------------------------------
//  Cron-Registrierung
// ----------------------------------------------------------------

/**
 * Startet den Worker als täglichen Cron-Job um 02:00 Uhr.
 * @param sofortAusfuehren – einmaliger Lauf direkt beim Start (Dev/Test)
 */
export function startDeletionWorker(sofortAusfuehren = false): void {
  // Täglich 02:00 Uhr, Berliner Zeit
  cron.schedule(
    "0 2 * * *",
    async () => {
      const worker = new DeletionWorker();
      await worker.run().catch((err) =>
        console.error("[DeletionWorker] Unbehandelter Fehler:", err)
      );
    },
    { timezone: "Europe/Berlin" }
  );

  console.log("[DeletionWorker] Registriert: täglich 02:00 Uhr (Europe/Berlin)");

  if (sofortAusfuehren) {
    console.log("[DeletionWorker] Sofortlauf gestartet...");
    new DeletionWorker().run().catch(console.error);
  }
}
